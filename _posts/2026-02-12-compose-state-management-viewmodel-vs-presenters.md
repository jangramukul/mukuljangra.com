---
title: Do You Still Need ViewModel in Compose?
layout: post
categories: post
tags:
  - Android
  - Kotlin
  - Jetpack Compose
  - Architecture
---

For years, `ViewModel` has been the default choice for managing state in Android apps. Google recommends it, every tutorial uses it, and most codebases are built around it. It works. But as apps became more Compose-driven, I started noticing friction points — things that felt unnecessarily complex for what should be straightforward state management.

Around the same time, libraries like [Circuit](https://slackhq.github.io/circuit/) from Slack and [Molecule](https://github.com/cashapp/molecule) from Cash App introduced a different approach: Compose-native presenters. The idea is simple — if Compose runtime already has a powerful state management system, why not use it for business logic too?

In my [previous post](https://mukuljangra.com/2025/10/14/compose-beyond-ui.html), I explored different ways to write ViewModels and briefly touched on the Compose way. This post goes deeper into the structural comparison: what ViewModel gives us, where it creates friction with Compose, and how the Presenter pattern offers a different mental model.

## What ViewModel Actually Gives You

Before comparing, it's important to understand what ViewModel provides out of the box:

**Lifecycle scoping** — ViewModel survives configuration changes. When the user rotates the screen, the ViewModel stays in memory. You don't lose your network response or in-flight request.

**viewModelScope** — A coroutine scope tied to the ViewModel's lifecycle. When the ViewModel is cleared, all coroutines are cancelled automatically.

**SavedStateHandle** — Persists data across process death. This is the one that matters for production apps. If the OS kills your process while the user switches apps, SavedStateHandle restores the state when they come back.

**Scoping to Navigation** — ViewModel can be scoped to a `NavBackStackEntry`, which means shared state between screens in the same nav graph becomes straightforward.

These are real, practical benefits. Any alternative needs to address them.

## The Friction With Compose

Here's the thing. ViewModel was designed for the Fragment/Activity world. It predates Compose. When you use it with Compose, you get a few awkward interactions.

**You can't scope a ViewModel to a composable.** ViewModels are scoped to a `ViewModelStoreOwner`. The framework provides `ComponentActivity`, `Fragment`, and `NavBackStackEntry` as built-in implementations, but any custom `ViewModelStoreOwner` is also a valid scope. Since composables don't implement `ViewModelStoreOwner`, your composable hierarchy and your state hierarchy don't always align cleanly.

**State conversion overhead.** ViewModel exposes `StateFlow`, but Compose works with snapshot state. Every collection point needs `collectAsStateWithLifecycle()`. With compose state directly, the composable just reads the value — no conversion, no lifecycle awareness boilerplate.

**The combine problem.** When a screen has 6-7 input sources, the `combine` function tops out at 5 flows. You end up nesting combines or writing custom combiners. The code becomes hard to follow. I've seen production ViewModels where more than half the code is just pipeline plumbing.

**Init block side effects.** Launching coroutines in `init` is common but risky. With Compose state, this can throw `IllegalStateException` if the object isn't fully initialized. You need to be careful about ordering.

None of these are dealbreakers. But they add up, especially on complex screens.

## The Presenter Pattern

Circuit introduces a different architecture. Instead of ViewModel + StateFlow, you get a `Presenter` that is a `@Composable` function returning state. The Presenter and the UI are two separate composable functions that communicate only through state and events.

```kotlin
data class LoginScreen : Screen {
    data class State(
        val username: String,
        val isLoading: Boolean,
        val eventSink: (Event) -> Unit,
    ) : CircuitUiState

    sealed interface Event : CircuitUiEvent {
        data class UsernameChanged(val value: String) : Event
        data object SubmitClicked : Event
    }
}
```

The Presenter produces state. It doesn't know about the UI at all.

```kotlin
class LoginPresenter @Inject constructor(
    private val loginRepository: LoginRepository,
) : Presenter<LoginScreen.State> {

    @Composable
    override fun present(): LoginScreen.State {
        var username by rememberSaveable { mutableStateOf("") }
        var isLoading by remember { mutableStateOf(false) }

        LaunchedEffect(isLoading) {
            if (isLoading) {
                loginRepository.login(username)
                isLoading = false
            }
        }

        return LoginScreen.State(
            username = username,
            isLoading = isLoading,
        ) { event ->
            when (event) {
                is LoginScreen.Event.UsernameChanged -> username = event.value
                is LoginScreen.Event.SubmitClicked -> isLoading = true
            }
        }
    }
}
```

And the UI consumes it. It receives state, renders UI, and emits events through the `eventSink`.

```kotlin
class LoginUi @Inject constructor() : Ui<LoginScreen.State> {

    @Composable
    override fun Content(state: LoginScreen.State, modifier: Modifier) {
        Column(modifier = modifier) {
            TextField(
                value = state.username,
                onValueChange = { state.eventSink(LoginScreen.Event.UsernameChanged(it)) },
            )

            Button(
                onClick = { state.eventSink(LoginScreen.Event.SubmitClicked) },
                enabled = !state.isLoading,
            ) {
                Text("Login")
            }
        }
    }
}
```

The Presenter and Ui never reference each other directly. They only know about the `Screen` and its `State`.

## Comparing The Two

### State Production

In a traditional ViewModel, state production involves creating `MutableStateFlow`, exposing it as `StateFlow`, using `combine` for multiple sources, and calling `.update { it.copy(...) }` for mutations. It works, but there's boilerplate.

In a Presenter, state production is just Compose code. You use `remember`, `rememberSaveable`, `LaunchedEffect`, `collectAsState()`. The state is returned directly from the composable function. No flow conversion, no combine limits.

```kotlin
// ViewModel way
class SearchViewModel(
    private val repository: SearchRepository,
) : ViewModel() {
    private val _query = MutableStateFlow("")
    private val _results = MutableStateFlow<List<Result>>(emptyList())

    val uiState = combine(_query, _results) { query, results ->
        SearchUiState(query = query, results = results)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SearchUiState()
    )

    fun onQueryChanged(query: String) {
        _query.value = query
        viewModelScope.launch {
            _results.value = repository.search(query)
        }
    }
}

// Presenter way
@Composable
fun searchPresenter(repository: SearchRepository): SearchState {
    var query by rememberSaveable { mutableStateOf("") }
    val results by produceState<List<Result>>(emptyList(), query) {
        value = repository.search(query)
    }

    return SearchState(
        query = query,
        results = results,
    ) { event ->
        when (event) {
            is SearchEvent.QueryChanged -> query = event.value
        }
    }
}
```

The Presenter version is more concise. `produceState` handles the coroutine launch and cancellation automatically when `query` changes. No need for manual scope management.

### Lifecycle Handling

ViewModel survives configuration changes because the Android framework retains it. The Presenter pattern handles this differently. In Circuit, the `Navigator` and the framework manage screen retention. `rememberSaveable` handles state persistence across configuration changes, just like it does in regular Compose code.

For process death, ViewModel uses `SavedStateHandle`. Circuit Presenters use `rememberSaveable` which internally uses the same `SavedStateHandle` mechanism. Both end up at the same place, but the API surface is different.

> **Note**: `rememberSaveable` in a Presenter works because Circuit manages the composition lifecycle. The Presenter's composition survives configuration changes the same way a ViewModel would.

### Testability

This is where things get interesting. Testing a ViewModel is straightforward — you call methods and assert on StateFlow values.

```kotlin
@Test
fun `search updates results`() = runTest {
    val repository = FakeSearchRepository()
    val viewModel = SearchViewModel(repository)

    viewModel.onQueryChanged("kotlin")
    advanceUntilIdle()

    assertEquals("kotlin", viewModel.uiState.value.query)
    assertEquals(3, viewModel.uiState.value.results.size)
}
```

Testing a Circuit Presenter uses the `Presenter.test()` extension from their testing library. It runs the composable in a test composition and lets you emit events and assert on state emissions.

```kotlin
@Test
fun `search updates results`() = runTest {
    val repository = FakeSearchRepository()
    val presenter = SearchPresenter(repository)

    presenter.test {
        val initial = awaitItem()
        assertEquals("", initial.query)

        initial.eventSink(SearchEvent.QueryChanged("kotlin"))
        val updated = awaitItem()
        assertEquals("kotlin", updated.query)
        assertEquals(3, updated.results.size)
    }
}
```

Both approaches are testable. The ViewModel test feels more familiar. The Presenter test is closer to how the component actually runs — it tests the recomposition cycle, not just method calls. But I would argue, ViewModel testing is simpler if you're already comfortable with coroutines testing using `runTest` and `Turbine`. Presenter testing requires learning Circuit's test utilities.

### Navigation and Scoping

ViewModel integrates directly with Jetpack Navigation. You scope ViewModels to `NavBackStackEntry`, share them between screens in the same nav graph, and get automatic cleanup when the destination is popped.

Circuit has its own navigation system built around `Screen` objects and a `Navigator`. Navigation is type-safe by default — each screen is a data class, and you navigate by pushing screen objects. This is clean, but it means you're using Circuit's navigation instead of Jetpack Navigation. For existing apps, that's a significant migration.

## When To Use Which

**Stick with ViewModel when:**
- Your app already has an established ViewModel architecture
- You're using Jetpack Navigation and want tight integration
- Your team is comfortable with StateFlow and coroutines patterns
- The screens are small to medium complexity

**Consider Presenters when:**
- You're building a new app or a new module from scratch
- Complex screens with many state sources are creating combine nightmares
- You want strict separation between state production and UI rendering
- You're already investing in Compose as the foundation, not just the UI layer

The honest answer is, most apps don't need to migrate to Circuit. ViewModel works fine for the majority of use cases. But if you're starting fresh and your team is comfortable with Compose's runtime concepts, the Presenter pattern offers a cleaner mental model — especially for complex screens where traditional ViewModel code gets tangled in flow plumbing.

To me, the real takeaway isn't about choosing one over the other. It's about understanding that Compose runtime and Compose UI are separate things. Once you internalize that, you can use compose state in ViewModels, write Molecule-powered presenters, or go all-in with Circuit — whatever fits your team and your codebase.

Thanks for reading!
