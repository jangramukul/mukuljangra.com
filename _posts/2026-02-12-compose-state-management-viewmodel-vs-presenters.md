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

In my [previous post](https://mukuljangra.com/2025/10/14/compose-beyond-ui.html), I walked through different ways to write ViewModels — single field states, UI state classes, combine pipelines, and the Compose way with Molecule. That post was about the evolution of state production. This one is about a more fundamental question: does the ViewModel abstraction itself still make sense in a Compose-driven app, or has the Compose runtime made it redundant?

I've been working with both approaches — traditional ViewModel with StateFlow and Circuit's Presenter pattern — on different projects. After spending enough time with both, I think the answer is more nuanced than "just use Circuit" or "stick with ViewModel." The right choice depends on what kind of friction you're actually hitting, and to make that judgment, you need to understand what each approach gives you and what it costs.

## Where ViewModel Creates Friction With Compose

ViewModel was designed for the Fragment and Activity world. It predates Compose entirely. When you use it with Compose, a few structural mismatches show up that go beyond just syntax inconvenience.

The first one is scoping. ViewModel is scoped to a `ViewModelStoreOwner` — `ComponentActivity`, `Fragment`, or `NavBackStackEntry`. Composable functions are not `ViewModelStoreOwner` implementations, which means your composable hierarchy and your state hierarchy don't always align. If you have a complex screen with multiple logical sections that each need independent state, you can't scope a ViewModel to a composable subtree. You either hoist everything into one large ViewModel or create workarounds. This is a fundamental architectural mismatch — Compose thinks in terms of composable trees, but ViewModel thinks in terms of platform lifecycle owners.

The second friction is the conversion overhead between StateFlow and Compose's snapshot state system. ViewModel exposes `StateFlow`, but Compose natively works with snapshot state. Every collection point requires `collectAsStateWithLifecycle()` and the associated lifecycle ceremony. With `SharingStarted.WhileSubscribed(5_000)`, `stateIn`, and `viewModelScope`, you're writing a fair amount of pipeline plumbing just to get state from your ViewModel into your composable. With Compose state directly, the composable just reads the value — no conversion, no lifecycle boilerplate. And there are real consequences beyond just boilerplate: Compose's `TextField` API, for example, works noticeably better with direct `mutableStateOf` than with `StateFlow` because the state synchronization between the ViewModel and UI doesn't have the latency that comes with collecting a flow. Many articles and conference talks have discussed this specific problem, and the practical solution has been to use Compose state for text fields even inside traditional ViewModels.

The third is the `combine` ceiling. When a complex screen has 6-7+ input sources — user inputs, repository observations, network results — the `combine` function has type-safe overloads for only up to 5 flows. Beyond that, you're stuck with the varargs overload where everything becomes `Array<T>` and you lose individual type information, or you nest combines. I've seen production ViewModels where more than half the code is just pipeline plumbing rather than actual business logic. The upstream flow, downstream subscriber, `stateIn` conversion chain gets repetitive and hard to follow as screens grow.

## What Circuit Actually Does Differently

Circuit, built by the Slack engineering team, takes a fundamentally different approach. Instead of ViewModel + StateFlow, you get a `Presenter` whose `present()` function is a `@Composable` that returns state. The key architectural insight is that Compose runtime and Compose UI are separate things — a composable function can either render UI content or return a state value, but it shouldn't do both. Circuit enforces this separation: the Presenter is a composable that only produces state, and the Ui is a composable that only renders. They communicate through a `Screen` object that defines the `State` and `Event` types they share.

```kotlin
@Parcelize
data object LoginScreen : Screen {
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

The Presenter uses Compose's runtime — `remember`, `rememberSaveable`, `LaunchedEffect`, `produceState` — to produce state. No `MutableStateFlow`, no `combine`, no `stateIn`. The business logic reads like imperative Kotlin because you're using Compose's recomposition system to react to state changes instead of wiring reactive streams together. Circuit enforces this with `@ComposableTarget("presenter")` which prevents Presenter code from accidentally emitting UI, and you can configure build warnings to catch violations at compile time.

```kotlin
class LoginPresenter @AssistedInject constructor(
    private val loginRepository: LoginRepository,
    @Assisted private val navigator: Navigator,
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

The Ui receives the state and emits events through the `eventSink`. It never references the Presenter directly — it only knows about the Screen and its State. This separation is strict and testable.

```kotlin
@CircuitInject(LoginScreen::class, AppScope::class)
@Composable
fun LoginUi(state: LoginScreen.State, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        TextField(
            value = state.username,
            onValueChange = { state.eventSink(LoginScreen.Event.UsernameChanged(it)) },
        )
        Button(
            onClick = { state.eventSink(LoginScreen.Event.SubmitClicked) },
            enabled = !state.isLoading,
        ) { Text("Login") }
    }
}
```

## The Lifecycle Question

The first thing people ask about Circuit is: how does it handle what ViewModel handles — configuration changes, process death, and coroutine scoping? The answer is a three-tier retention system that Circuit provides through its presenter composition:

| Mechanism | Survives recomposition | Survives back stack | Survives config change | Survives process death |
|-----------|:---:|:---:|:---:|:---:|
| `remember` | Yes | No | No | No |
| `rememberRetained` | Yes | Yes | Yes | No |
| `rememberSaveable` | Yes | Yes | Yes | Yes |

Here's the thing that surprised me: `rememberRetained` is backed by a hidden `ViewModel` on Android. So when people ask "can I replace ViewModel with Circuit?" — architecturally, yes. But under the hood, Circuit still uses the ViewModel mechanism for retention. You're not escaping ViewModel, you're changing the abstraction level you work at. Instead of writing `class LoginViewModel : ViewModel()` with StateFlow plumbing, you write `remember`/`rememberRetained`/`rememberSaveable` in a Presenter composable, and Circuit handles the ViewModel layer invisibly.

For process death specifically, both approaches end up at the same mechanism — Android's saved instance state. ViewModel uses `SavedStateHandle`. Circuit Presenters use `rememberSaveable`, which internally uses the same saved instance state infrastructure. The API surface is different, but the underlying capability is identical.

## Testing Side by Side

This is where the practical difference becomes concrete. Testing a ViewModel is straightforward and familiar — you call methods and assert on StateFlow values using `runTest`:

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

Circuit provides `Presenter.test()`, an extension that leverages Molecule and Turbine under the hood. It runs the composable in a test composition and gives you a `CircuitReceiveTurbine` that emits distinct state changes. You emit events through the `eventSink` on the state object and assert on the next state emission:

```kotlin
@Test
fun `search updates results`() = runTest {
    val navigator = FakeNavigator(SearchScreen)
    val repository = FakeSearchRepository()
    val presenter = SearchPresenter(navigator, repository)

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

Both approaches are testable without mocking frameworks — Circuit explicitly states that its core components are "not mockable nor do they need to be mocked." I would argue that ViewModel testing feels simpler if you're already comfortable with `runTest` and coroutines testing. Presenter testing requires learning Circuit's test utilities and understanding Turbine's `awaitItem()` model. But the Presenter test is closer to how the component actually runs in production — it tests the recomposition cycle and the full state/event loop, not just isolated method calls.

## Navigation Is the Biggest Decision

What I think is underrated in the Circuit vs ViewModel discussion is the navigation implication. ViewModel integrates directly with Jetpack Navigation — you scope ViewModels to `NavBackStackEntry`, share state between screens in the same nav graph, and get automatic cleanup when destinations are popped from the back stack.

Circuit has its own navigation built around `Screen` objects, a `Navigator` interface, and a `SaveableBackStack`. Navigation is type-safe by default — each screen is a data class, and you navigate by pushing screen objects with `navigator.goTo(DetailScreen(emailId))`. This is arguably cleaner than Jetpack Navigation's string routes or deep link patterns. But it means you're replacing your entire navigation system, not just your state management layer. For an existing app with dozens of screens on Jetpack Navigation, that's a significant migration. For a new app or a new module, it's a much easier decision.

## When To Use Which

**Stick with ViewModel** if your app already has an established ViewModel architecture, you're invested in Jetpack Navigation, your team is comfortable with StateFlow patterns, and your screens are small to medium complexity. ViewModel is well-documented, universally understood, and works fine for the majority of Android apps. The combine ceiling and conversion overhead are real annoyances, but they're manageable.

**Consider Circuit** if you're building a new app or module from scratch, complex screens are creating combine and pipeline nightmares, you want strict compile-time separation between state production and UI rendering, and your team is comfortable with Compose's runtime concepts beyond just UI. The presenter model is genuinely cleaner for complex state management, and the testing story is solid.

To me, the real takeaway isn't about picking one library over another. It's about understanding that Compose runtime and Compose UI are fundamentally separate layers — Jake Wharton has written extensively about this in "A Jetpack Compose by any other name." Once you internalize that separation, you can use Compose state in ViewModels, write Molecule-powered presenters, or adopt Circuit's full architecture. The Compose runtime is just a tool for managing reactive state. Whether you put it inside a ViewModel or inside a Presenter, the underlying mechanics are the same. What changes is the abstraction level and the architectural constraints you're opting into.

Thanks for reading!
