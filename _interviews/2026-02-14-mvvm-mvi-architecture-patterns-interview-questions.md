---
title: "MVVM, MVI & Architecture Patterns"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 1
---

## MVVM, MVI & Architecture Patterns — What Interviewers Really Ask

Architecture pattern questions come up in every senior Android interview. Interviewers want to know that you understand the tradeoffs between patterns and can justify why you chose one over another in a real project.

### Core Questions (Beginner → Intermediate)

#### Q1: What is MVC and how does it work in Android?

MVC stands for Model-View-Controller. The Model holds data and business logic, the View displays the UI, and the Controller handles user input and updates the Model. In Android, the Activity or Fragment often ends up acting as both the View and the Controller, which is why MVC leads to massive Activities. There's no clean separation — the Activity handles UI rendering, user events, and business logic all in one place.

#### Q2: What is MVP and how is it different from MVC?

MVP stands for Model-View-Presenter. The key difference is that the Presenter replaces the Controller and has no direct reference to Android framework classes. The View (Activity/Fragment) implements an interface, and the Presenter communicates through that interface. This makes the Presenter unit-testable because it doesn't depend on Android APIs. The downside is boilerplate — every screen needs a View interface, a Presenter class, and a contract tying them together.

#### Q3: What is MVVM?

MVVM stands for Model-View-ViewModel. The ViewModel holds UI state and business logic, and the View observes state changes through LiveData, StateFlow, or Compose state. Unlike MVP, the ViewModel doesn't hold a reference to the View at all — it just exposes state, and the View observes it. This is a reactive approach where the View reacts to state changes instead of being told what to do.

```kotlin
class LoginViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<LoginState>(LoginState.Idle)
    val uiState: StateFlow<LoginState> = _uiState.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = LoginState.Loading
            val result = authRepository.login(email, password)
            _uiState.value = when {
                result.isSuccess -> LoginState.Success(result.getOrThrow())
                else -> LoginState.Error(result.exceptionOrNull()?.message ?: "Unknown error")
            }
        }
    }
}
```

#### Q4: What is MVI?

MVI stands for Model-View-Intent. Intent here is not Android's Intent class — it means a user intention or action. MVI enforces unidirectional data flow: the View sends Intents (user actions) to the ViewModel, the ViewModel processes them through a reducer and produces a new State, and the View renders that State. The state is immutable and there's only one source of truth.

```kotlin
// Intent — what the user wants to do
sealed class SearchIntent {
    data class Query(val text: String) : SearchIntent()
    data object ClearResults : SearchIntent()
}

// State — single source of truth
data class SearchState(
    val query: String = "",
    val results: List<Product> = emptyList(),
    val isLoading: Boolean = false
)

class SearchViewModel : ViewModel() {
    private val _state = MutableStateFlow(SearchState())
    val state: StateFlow<SearchState> = _state.asStateFlow()

    fun handleIntent(intent: SearchIntent) {
        when (intent) {
            is SearchIntent.Query -> search(intent.text)
            is SearchIntent.ClearResults -> _state.value = SearchState()
        }
    }
}
```

#### Q5: What is unidirectional data flow?

Unidirectional data flow means data flows in one direction — from state to UI and from UI events back to state updates. The cycle is: UI renders state → user performs action → action updates state → UI re-renders. There's no two-way binding where the View can directly modify the state. The state is always updated through a defined path (like a reducer or ViewModel method), which makes the flow predictable and easier to debug.

#### Q6: What is the difference between MVVM and MVI?

In MVVM, the ViewModel can expose multiple observable streams for different pieces of state — one for user data, one for loading, one for errors. The View observes each stream independently. In MVI, the entire screen state is a single immutable object. Every update produces a new state instance, and the View always renders the complete state.

MVI is more predictable because the state is always consistent — you can't have `isLoading = true` and `error != null` at the same time if your reducer doesn't allow it. MVVM is more flexible and has less boilerplate, but it's easier to end up with inconsistent state across multiple streams. For complex screens with many state interactions, MVI is safer. For simpler screens, MVVM is usually enough.

#### Q7: What is a ViewModel and why does it survive configuration changes?

ViewModel is a class from Android Jetpack that holds UI-related state and survives configuration changes like screen rotation. It works because the ViewModel is stored in a `ViewModelStore` owned by the `ViewModelStoreOwner` (Activity or Fragment). During a configuration change, the Activity is destroyed and recreated, but the `ViewModelStore` is retained by the framework through `NonConfigurationInstances`. The ViewModel is only cleared when the Activity is finished for real — when `onDestroy()` is called and `isChangingConfigurations` is false.

#### Q8: What is the difference between LiveData and StateFlow for UI state?

LiveData is lifecycle-aware and only delivers updates when the observer is in at least STARTED state. StateFlow is a Kotlin coroutines API that always has a value and emits updates to collectors. LiveData automatically handles lifecycle — it pauses delivery when the Activity is stopped. StateFlow requires `repeatOnLifecycle` or `collectAsStateWithLifecycle` in Compose to be lifecycle-aware.

StateFlow is better for MVVM because it works naturally with coroutines, supports operators like `map`, `combine`, and `flatMapLatest`, and doesn't depend on Android framework classes. LiveData is simpler for basic cases but becomes awkward for complex transformations. Most modern codebases use StateFlow.

#### Q9: What is the Repository pattern and what problem does it solve?

Repository is an abstraction layer between the ViewModel and data sources. It decides where to get data from — network, local database, or cache — and the ViewModel doesn't need to know. This makes it easy to swap data sources, add caching, or change the network library without touching the ViewModel.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao
) {
    fun getUser(userId: String): Flow<User> = flow {
        // Try cache first
        val cached = dao.getUser(userId)
        if (cached != null) emit(cached)

        // Fetch from network and update cache
        val remote = api.fetchUser(userId)
        dao.insert(remote)
        emit(remote)
    }
}
```

The Repository also provides a clean boundary for testing. In tests, you can replace the real repository with a fake that returns predefined data without touching the network or database.

#### Q10: What is the SingleLiveEvent problem?

In MVVM, one-time events like showing a toast, navigating to another screen, or showing a snackbar don't fit well into LiveData or StateFlow. If you put a navigation event in a StateFlow, the navigation happens again on configuration change because the collector re-reads the current state value.

The `SingleLiveEvent` was a workaround that only delivered the value once, but it didn't work well with multiple observers. The modern solutions are using a `Channel` with `receiveAsFlow()` for one-time events, or modeling events as part of the state and consuming them explicitly.

```kotlin
class CheckoutViewModel : ViewModel() {
    // One-time events via Channel
    private val _events = Channel<CheckoutEvent>(Channel.BUFFERED)
    val events: Flow<CheckoutEvent> = _events.receiveAsFlow()

    fun placeOrder() {
        viewModelScope.launch {
            val orderId = repository.placeOrder()
            _events.send(CheckoutEvent.NavigateToConfirmation(orderId))
        }
    }
}
```

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is a reducer in MVI and how does it ensure state consistency?

A reducer is a pure function that takes the current state and an action, and returns a new state. It's pure because it has no side effects — given the same inputs, it always produces the same output. This makes state transitions predictable and testable.

```kotlin
fun reduce(currentState: CartState, action: CartAction): CartState {
    return when (action) {
        is CartAction.AddItem -> currentState.copy(
            items = currentState.items + action.item,
            totalPrice = currentState.totalPrice + action.item.price
        )
        is CartAction.RemoveItem -> currentState.copy(
            items = currentState.items - action.item,
            totalPrice = currentState.totalPrice - action.item.price
        )
        is CartAction.SetLoading -> currentState.copy(isLoading = true)
    }
}
```

Because the state is a single immutable data class and the reducer is the only way to change it, you can never end up in an invalid state unless the reducer creates one. You can also log every action and state transition for debugging, which is basically time-travel debugging.

#### Q12: How do you handle side effects in MVI?

Side effects are operations that interact with the outside world — network calls, database writes, navigation, showing toasts. In MVI, side effects can't go through the reducer because reducers must be pure functions. The common approach is to process intents in the ViewModel, trigger side effects separately, and dispatch the result as a new action to the reducer.

```kotlin
fun handleIntent(intent: OrderIntent) {
    when (intent) {
        is OrderIntent.PlaceOrder -> {
            reduce(OrderAction.SetLoading)
            viewModelScope.launch {
                val result = orderRepository.place(intent.cartId)
                if (result.isSuccess) {
                    reduce(OrderAction.OrderPlaced(result.getOrThrow()))
                    _sideEffects.send(OrderEffect.NavigateToConfirmation)
                } else {
                    reduce(OrderAction.OrderFailed(result.exceptionOrNull()?.message))
                }
            }
        }
    }
}
```

Side effects that affect the UI but aren't part of the state (navigation, snackbar, toast) are sent through a separate `Channel` or `SharedFlow`. This keeps the state clean and the side effects consumable only once.

#### Q13: When would you choose MVI over MVVM?

Choose MVI when the screen has complex state interactions — multiple interdependent data sources, optimistic updates, undo/redo, or real-time sync. MVI's single state object ensures you never have inconsistent UI. It also makes debugging easier because you can trace every state change back to a specific intent.

Choose MVVM for simpler screens where state management is straightforward — a list screen, a detail screen, or a settings page. MVVM has less boilerplate and doesn't force you to model every user action as a sealed class. In practice, most apps use MVVM for most screens and MVI for the few complex ones. You can mix patterns in the same app — there's no rule that says everything must follow one pattern.

#### Q14: What is the Presenter pattern in Compose (Circuit/Molecule)?

Molecule and Circuit are libraries that use the Compose runtime to build presenters. Instead of using `StateFlow` and `viewModelScope.launch`, you write a `@Composable` function that produces state. The Compose runtime handles recomposition — when inputs change, the presenter recomposes and emits new state.

```kotlin
@Composable
fun ProfilePresenter(userId: String): ProfileState {
    var user by remember { mutableStateOf<User?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(userId) {
        isLoading = true
        user = userRepository.getUser(userId)
        isLoading = false
    }

    return when {
        isLoading -> ProfileState.Loading
        user != null -> ProfileState.Success(user!!)
        else -> ProfileState.Error("User not found")
    }
}
```

The advantage is that state management uses Compose's snapshot system instead of manually combining StateFlows. For complex state with multiple data sources, this eliminates the `combine()` chains that make ViewModels hard to read. The Cash App team built Circuit because their production ViewModels had become unreadable with 5-6 combined flows.

#### Q15: What is separation of concerns and how do architecture patterns enforce it?

Separation of concerns means each component has one clear responsibility. The UI layer renders state and captures user input. The ViewModel/Presenter holds UI state and business logic. The Repository provides data. The data source handles the actual API calls or database queries.

Architecture patterns enforce this by defining boundaries. In MVVM, the ViewModel doesn't know about Views or Activities — it only exposes state. The View doesn't do business logic — it only renders. In Clean Architecture, this is taken further with a dependency rule — inner layers can't reference outer layers, so your domain logic never depends on Android framework classes, Retrofit, or Room.

Without these patterns, you get Activities that make network calls, parse JSON, update the database, and render the UI all in the same class. At 50 lines it's fine. At 500 lines it's unmaintainable.

#### Q16: How does ViewModel communicate with the View layer in different patterns?

In MVP, the Presenter holds a reference to the View interface and calls methods like `view.showLoading()`, `view.showUser(user)`. This is imperative — the Presenter tells the View what to do.

In MVVM, the ViewModel exposes observable state via LiveData or StateFlow, and the View subscribes to it. This is reactive — the View reacts to state changes. The ViewModel never references the View.

In MVI, the ViewModel exposes a single state stream and an optional side-effect stream. The View sends intents to the ViewModel and renders the entire state. This is the strictest separation because the ViewModel only knows about state and intents, nothing about the View.

The progression from MVP to MVVM to MVI is a progression toward less coupling between the ViewModel and the View.

#### Q17: How do you test a ViewModel in MVVM vs MVI?

In MVVM, you test the ViewModel by calling its methods and asserting on the emitted StateFlow values. You need a `TestDispatcher` to control coroutine execution and Turbine or similar library to collect flow emissions.

```kotlin
@Test
fun `login success updates state`() = runTest {
    val repository = FakeAuthRepository(shouldSucceed = true)
    val viewModel = LoginViewModel(repository)

    viewModel.uiState.test {
        assertEquals(LoginState.Idle, awaitItem())
        viewModel.login("user@test.com", "password")
        assertEquals(LoginState.Loading, awaitItem())
        assertTrue(awaitItem() is LoginState.Success)
    }
}
```

In MVI, testing is even more straightforward because you send intents and assert on state transitions. The reducer is a pure function, so you can test it directly without any coroutines or mocking — just pass a state and action, and assert the output. Side effects are tested separately through the effects channel.

#### Q18: What are the common mistakes when implementing MVVM in Android?

Putting UI logic in the ViewModel is the most common one. The ViewModel should hold state and business logic, not format strings or decide view visibility. String formatting, date formatting, and similar display concerns belong in the View layer or a separate UI model mapper.

Another mistake is exposing `MutableStateFlow` directly instead of backing it with a private mutable property and a public read-only `StateFlow`. Leaking the mutable reference lets the View modify state directly, which breaks the pattern. Also, doing too much in the ViewModel constructor — heavy initialization should be lazy or triggered by an explicit method call, not in `init`.

### Common Follow-ups

- How do you handle navigation in MVVM — does the ViewModel trigger it or the View?
- What's the difference between `SharedFlow` and `Channel` for one-time events?
- How would you implement undo/redo in MVI?
- Can you combine MVVM and MVI in the same app? When would you?
- How does `SavedStateHandle` fit into the ViewModel pattern?
- What is the difference between UI state and domain state?
- How do you handle partial state updates in MVI without copying the entire state?
- How does Orbit MVI simplify the MVI pattern compared to manual implementation?
