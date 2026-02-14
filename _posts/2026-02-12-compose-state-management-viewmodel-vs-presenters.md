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

I've been working with both approaches — traditional ViewModel with StateFlow and Circuit's Presenter pattern — on different projects. And after spending enough time with both, I think the answer is more nuanced than "just use Circuit" or "stick with ViewModel." The right choice depends on what kind of friction you're actually hitting. But before we even get to that comparison, there's a Compose-native concept that changes how you think about state ownership entirely: state hoisting.

## State Hoisting Changes the Conversation

Think of state hoisting like renting vs owning a house. A stateless composable is like a renter — it uses the space (takes state as parameters, uses lambdas to request changes), but it doesn't own anything. It can pack up and move anywhere, no strings attached. A stateful composable is like a homeowner — it creates and manages its own state internally with `remember` or `mutableStateOf`, and it's tied to that location. Renters are flexible, easy to relocate, easy to inspect. Homeowners have commitments.

Why does this matter? Because stateless composables are reusable, testable, and previewable without needing any ViewModel or Presenter at all. You can throw one into a `@Preview` and it just works — no dependency injection, no fake repository, nothing.

The practical rule I follow: hoist state to the lowest common ancestor that needs it. If only one composable reads and writes a value, keep it local. If a parent composable needs to coordinate that value with siblings, hoist it up. If the state needs to survive configuration changes or drive business logic, that's when it graduates to a ViewModel or Presenter. Too many projects I've seen hoist everything into a ViewModel by default, turning it into a dumping ground for state that should have stayed in the composable tree. Your ViewModel doesn't need to know that a dropdown is expanded. That's like calling your landlord to ask if you should open a window.

```kotlin
// Stateless — caller controls the state
@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        trailingIcon = {
            IconButton(onClick = onSearch) {
                Icon(Icons.Default.Search, contentDescription = "Search")
            }
        },
        modifier = modifier.fillMaxWidth(),
    )
}

// Stateful wrapper — owns the state locally
@Composable
fun SearchBarStateful(onSearch: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    SearchBar(
        query = query,
        onQueryChange = { query = it },
        onSearch = { onSearch(query) },
    )
}
```

Here's the thing: state hoisting is orthogonal to the ViewModel vs Presenter debate. Both approaches benefit from pushing UI-only state down into stateless composables and keeping business state in the owner. The difference is just where that owner lives — a `ViewModel` scoped to a lifecycle owner, or a `Presenter` composable scoped to Circuit's retention system. So before you pick a side in that debate, get your hoisting right. It pays dividends no matter which architecture you choose.

## Where ViewModel Creates Friction With Compose

ViewModel was designed for the Fragment and Activity world. It predates Compose entirely, and when you use it with Compose, a few structural mismatches show up that go beyond syntax inconvenience. Think of it like trying to plug a European appliance into an American outlet — it technically works with an adapter, but the adapter itself introduces its own problems.

The first mismatch is scoping. ViewModel is scoped to a `ViewModelStoreOwner` — `ComponentActivity`, `Fragment`, or `NavBackStackEntry`. Composable functions are not `ViewModelStoreOwner` implementations, which means your composable hierarchy and your state hierarchy don't always align. Imagine you have a complex screen with a header section, a content list, and a bottom sheet — three logical sections that each want independent state. Can you scope a ViewModel to just the bottom sheet's composable subtree? Nope. You either hoist everything into one large ViewModel that becomes a god object, or you create workarounds. This is a fundamental architectural mismatch — Compose thinks in terms of composable trees, but ViewModel thinks in terms of platform lifecycle owners. They're looking at two different maps of the same territory.

The second friction is the conversion overhead between StateFlow and Compose's snapshot state system. ViewModel exposes `StateFlow`, but Compose natively works with snapshot state. Every collection point requires `collectAsStateWithLifecycle()` and the associated lifecycle ceremony. Compose's `TextField` API, for example, works noticeably better with direct `mutableStateOf` than with `StateFlow` because the state synchronization doesn't have the latency that comes with collecting a flow. The practical solution has been to use Compose state for text fields even inside traditional ViewModels, which means you end up mixing both state systems anyway. You wanted one state system and got two. Sound familiar?

The third is the `combine` ceiling. When a complex screen has 6-7+ input sources — user inputs, repository observations, network results — the `combine` function has type-safe overloads for only up to 5 flows. Beyond that, you're stuck with the varargs overload where everything becomes `Array<T>` and you lose type information, or you nest combines. I've seen production ViewModels where more than half the code is pipeline plumbing rather than actual business logic. At that point, the reactive machinery that was supposed to simplify things is the thing making them complicated.

> **🔥 Real talk:** I once opened a ViewModel that had four nested `combine` calls feeding into each other. The actual business logic — a form validation — was about 10 lines. The plumbing around it was 60+. That's when I started seriously looking at alternatives.

## derivedStateOf for Computed State

One pattern that helps in both approaches is `derivedStateOf`, and it's one of those Compose tools that, once you understand it, you'll wonder how you ever lived without it. Think of it like a spreadsheet cell with a formula. You don't manually update cell C1 every time you change A1 or B1 — the spreadsheet knows C1 depends on A1 and B1, and it recalculates automatically. That's `derivedStateOf`. The Compose runtime tracks which snapshot state objects are read inside the `derivedStateOf` block and only recomputes the derived value when those specific inputs change. Without it, any recomposition would re-evaluate the computation, even if the inputs haven't changed.

I use this constantly in ViewModels that mix Compose state with StateFlow. The `username` and `password` fields are `mutableStateOf` for the `TextField` latency reason I mentioned, and the validation flags are `derivedStateOf` reading those fields directly. No combine, no flow mapping, no pipeline plumbing — just a direct computation that updates when its inputs change.

```kotlin
class SignupViewModel(
    private val validateEmail: ValidateEmail,
    private val validatePassword: ValidatePassword,
) : ViewModel() {
    var email by mutableStateOf("")
        private set
    var password by mutableStateOf("")
        private set
    var acceptedTerms by mutableStateOf(false)
        private set

    val isEmailValid by derivedStateOf { validateEmail(email) }
    val isPasswordValid by derivedStateOf { validatePassword(password) }
    val isFormValid by derivedStateOf {
        isEmailValid && isPasswordValid && acceptedTerms
    }

    fun onEmailChanged(value: String) { email = value }
    fun onPasswordChanged(value: String) { password = value }
    fun onTermsToggled(value: Boolean) { acceptedTerms = value }
}
```

Look at `isFormValid`. It reads `isEmailValid`, `isPasswordValid`, and `acceptedTerms`. Compose tracks those reads automatically. When the user types a new character in the email field, `isEmailValid` recomputes. When `isEmailValid` changes, `isFormValid` recomputes. When `isFormValid` hasn't actually changed (email was invalid before and is still invalid), nothing downstream recomposes. It's like a chain of dominoes that only tips over when the result actually changes.

In a Circuit Presenter, `derivedStateOf` works identically because the Presenter's `present()` is already a `@Composable` function — you just wrap it in `remember` like any other Compose state. The key thing to understand is that `derivedStateOf` is a Compose runtime feature, not a UI feature, so it works anywhere the runtime is available.

## State Holder Classes: When Plain Classes Beat ViewModel

There's a middle ground between "keep state in the composable" and "put it in a ViewModel" that I think is underused: plain state holder classes with a `rememberXxxState()` factory. If you've used `rememberLazyListState()` or `rememberDrawerState()`, you've already seen this pattern. The idea is to encapsulate related UI logic in a plain class and create it with a `remember` composable function, without involving ViewModel at all.

Here's a good way to think about it. Imagine your composable as a kitchen. A ViewModel is like a separate pantry room — it stores long-lived ingredients (business state) that survive even if you remodel the kitchen. But what about the cutting board, the mixing bowl, the spatula you're using right now? Those are your UI state. You don't store them in the pantry. They live on the counter, close to where you're working, and you put them away when you're done cooking.

This works well for UI logic that's complex enough to extract from the composable but doesn't involve business logic or need to survive beyond the composable's lifetime. Think of a multi-step form wizard, a drag-and-drop interaction, or a complex animation controller. These are UI concerns, not business concerns, and a ViewModel is overkill.

```kotlin
@Stable
class SearchBarState(
    initialQuery: String,
    private val onSearch: (String) -> Unit,
) {
    var query by mutableStateOf(initialQuery)
        private set
    var isExpanded by mutableStateOf(false)
        private set
    val hasQuery: Boolean by derivedStateOf { query.isNotBlank() }

    fun onQueryChange(value: String) { query = value }
    fun expand() { isExpanded = true }
    fun collapse() { isExpanded = false; query = "" }
    fun submit() { if (hasQuery) onSearch(query) }
}

@Composable
fun rememberSearchBarState(
    initialQuery: String = "",
    onSearch: (String) -> Unit,
): SearchBarState = remember(onSearch) {
    SearchBarState(initialQuery, onSearch)
}
```

The `@Stable` annotation tells the Compose compiler that this class follows the snapshot state contract — if any of its public properties change, Compose will know about it through the `mutableStateOf` delegates. This gives you smart recomposition without needing `StateFlow` or `collectAsStateWithLifecycle()`. The state holder lives and dies with the composable tree, which is exactly what you want for UI-scoped logic. No lifecycle complications, no scoping gymnastics. Just a plain class that knows its own business.

## What Circuit Actually Does Differently

Circuit, built by the Slack engineering team, takes a fundamentally different approach. Instead of ViewModel + StateFlow, you get a `Presenter` whose `present()` function is a `@Composable` that returns state. Now here's the key architectural insight, and it's the one that makes Circuit click: Compose runtime and Compose UI are separate things. A composable function can either render UI content or return a state value, but it shouldn't do both. Circuit enforces this separation with `@ComposableTarget("presenter")` which prevents Presenter code from accidentally emitting UI.

Think of it like a restaurant. The kitchen (Presenter) prepares the food (state) and sends it out. The dining room (Ui) receives the food and presents it to the customer. The kitchen never talks to the customer directly, and the dining room never reaches into the kitchen to grab ingredients. They communicate through a well-defined contract — a `Screen` object that defines the `State` and `Event` types they share. The Ui receives state and emits events through the `eventSink` — it never references the Presenter directly.

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

Notice something? The Presenter uses Compose's runtime — `remember`, `rememberSaveable`, `LaunchedEffect`, `produceState` — to produce state. No `MutableStateFlow`, no `combine`, no `stateIn`. The business logic reads like imperative Kotlin because you're using Compose's recomposition system to react to state changes instead of wiring reactive streams together. Remember that `combine` ceiling problem I mentioned earlier? Gone. You just write normal Kotlin code and let the Compose runtime handle the reactivity.

> **💡 The "aha" moment:** Circuit doesn't fight Compose's reactive model by bridging to a different one (StateFlow). It leans into Compose's own runtime for state production. That's why the code ends up simpler — you're using one reactive system instead of gluing two together.

## Process Death: What Actually Survives

The first thing people ask about Circuit is: how does it handle configuration changes and process death? The answer is a three-tier retention system. **`remember`** survives recompositions only — rotate the phone and it's gone. **`rememberRetained`** survives recompositions, back stack navigation, and configuration changes — this is Circuit's equivalent of what ViewModel gives you out of the box. **`rememberSaveable`** survives all of the above plus process death.

Here's the thing that surprised me: `rememberRetained` is backed by a hidden `ViewModel` on Android. So when people ask "can I replace ViewModel with Circuit?" — architecturally, yes. But under the hood, Circuit still uses the ViewModel mechanism for retention. You're not escaping ViewModel, you're changing the abstraction level you work at. It's like saying "I don't drive, I take Uber." You're still in a car. You just have a nicer API for getting where you want to go.

But the process death story has real practical differences. With ViewModel, you use `SavedStateHandle` to persist and restore state across process death. The `SavedStateHandle` is essentially a `Bundle` wrapper — it can only store `Parcelable`, `Serializable`, and primitive types. Any in-memory state in your ViewModel that isn't explicitly saved to `SavedStateHandle` is lost. This means you have to think carefully about which fields matter enough to persist, and you end up with a split where some state lives in `MutableStateFlow` and some lives in `SavedStateHandle`, with manual wiring between them.

```kotlin
class SearchViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val repository: SearchRepository,
) : ViewModel() {
    // Survives process death via SavedStateHandle
    val query = savedStateHandle.getStateFlow("query", "")
    // Lost on process death — only survives config changes
    private val _results = MutableStateFlow<List<Result>>(emptyList())
    val results = _results.asStateFlow()

    fun onQueryChanged(value: String) {
        savedStateHandle["query"] = value
        viewModelScope.launch {
            _results.value = repository.search(value)
        }
    }
}
```

See that split? `query` survives process death because it's in `SavedStateHandle`. `_results` doesn't because it's a plain `MutableStateFlow`. Two different survival rules, two different state containers, manual wiring between them. It works, but the mental overhead adds up on complex screens.

Circuit's approach is more uniform. In a Presenter, you just choose between `remember` (recomposition only), `rememberRetained` (config changes), and `rememberSaveable` (process death) at each call site. The mental model is simpler — every piece of state declares its own survival scope right where it's defined. But the underlying constraint is the same: `rememberSaveable` also requires `Parcelable` or a custom `Saver`, so complex objects that can't be serialized still won't survive process death in either approach. Both end up at Android's saved instance state `Bundle` mechanism — the API surface differs, but neither approach can persist what the platform doesn't support.

> **🧠 Think about it:** If both Circuit and ViewModel ultimately rely on the same `Bundle` mechanism for process death, what's actually different? It's not the capability — it's the ergonomics. One makes you manage two state containers with manual wiring. The other lets you annotate survival scope inline. Which one leads to fewer bugs when the screen has 15 state fields?

## Testing Side by Side

Testing a ViewModel is straightforward — you call methods and assert on StateFlow values using `runTest`. Circuit provides `Presenter.test()`, an extension that leverages Molecule and Turbine under the hood. It runs the composable in a test composition and gives you a `CircuitReceiveTurbine` that emits distinct state changes.

```kotlin
// ViewModel test
@Test
fun `search updates results`() = runTest {
    val repository = FakeSearchRepository()
    val viewModel = SearchViewModel(repository)

    viewModel.onQueryChanged("kotlin")
    advanceUntilIdle()

    assertEquals("kotlin", viewModel.uiState.value.query)
    assertEquals(3, viewModel.uiState.value.results.size)
}

// Circuit Presenter test
@Test
fun `search updates results`() = runTest {
    val presenter = SearchPresenter(FakeNavigator(SearchScreen), FakeSearchRepository())

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

Both approaches are testable without mocking frameworks, which is great. I would argue that ViewModel testing feels simpler if you're already comfortable with `runTest` and coroutines testing — you call a method, advance the dispatcher, check the value. Very direct. Presenter testing requires learning Circuit's test utilities and understanding Turbine's `awaitItem()` model, which has its own learning curve. But the Presenter test is closer to how the component actually runs in production — it tests the recomposition cycle and the full state/event loop, not just isolated method calls. It's the difference between testing a car engine on a bench vs. test-driving the whole car. Both are valid, but they catch different kinds of problems.

## Navigation Is the Biggest Decision

What I think is underrated in the Circuit vs ViewModel discussion is the navigation implication. ViewModel integrates directly with Jetpack Navigation — you scope ViewModels to `NavBackStackEntry`, share state between screens in the same nav graph, and get automatic cleanup when destinations are popped.

Circuit has its own navigation built around `Screen` objects and a `Navigator` interface. Navigation is type-safe by default — you navigate by pushing screen objects with `navigator.goTo(DetailScreen(emailId))`, which is cleaner than Jetpack Navigation's string routes. But — and this is the big "but" — it means you're replacing your entire navigation system, not just your state management layer. For an existing app with dozens of screens, that's a significant migration. You came to change the curtains and now you're replacing the plumbing. That's a conversation you need to have with your team before writing a single line of Circuit code.

## When To Use Which

**Stick with ViewModel** if your app already has an established architecture, you're invested in Jetpack Navigation, and your screens are small to medium complexity. ViewModel is well-documented, universally understood, and works fine for the majority of Android apps. Use `derivedStateOf` and `mutableStateOf` inside your ViewModels to avoid the combine ceiling and TextField latency.

**Use plain state holders** for UI logic that doesn't involve business rules — form interactions, animation controllers, layout coordination. The `rememberXxxState()` pattern keeps this logic testable and reusable without involving ViewModel or Circuit at all. This is the most underused option, and honestly, the one that would clean up a lot of codebases if people reached for it more often.

**Consider Circuit** if you're building a new app or module from scratch, complex screens are creating combine nightmares, and you want strict separation between state production and UI rendering. The presenter model is genuinely cleaner for complex state management. Just know you're buying the whole kitchen, not just a new blender.

To me, the real takeaway isn't about picking one library over another. It's about understanding that Compose runtime and Compose UI are fundamentally separate layers — Jake Wharton has written extensively about this in "A Jetpack Compose by any other name." Once you internalize that separation, you can hoist state into plain classes, use Compose state in ViewModels, or adopt Circuit's full architecture. The Compose runtime is just a tool for managing reactive state. What changes is the abstraction level and the architectural constraints you're opting into.

Thanks for reading!
