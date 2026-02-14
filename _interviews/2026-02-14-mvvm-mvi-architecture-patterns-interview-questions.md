---
title: "MVVM, MVI & Architecture Patterns"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 1
sequence: 33
description: "Architecture pattern questions come up in every senior Android interview."
---

## MVVM, MVI & Architecture Patterns

Architecture pattern questions show up in nearly every senior Android interview. You need to know the tradeoffs between patterns and be able to explain why you'd pick one over another.

#### What is MVVM?

MVVM stands for Model-View-ViewModel. The ViewModel holds UI state and business logic, and the View observes state changes through LiveData, StateFlow, or Compose state. The ViewModel doesn't hold a reference to the View — it just exposes state, and the View reacts to changes. This is the default architecture pattern for modern Android apps.

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

#### What is a ViewModel and why does it survive configuration changes?

ViewModel is a Jetpack class that holds UI state and survives configuration changes like screen rotation. It's stored in a `ViewModelStore` owned by the `ViewModelStoreOwner` (Activity or Fragment). During a configuration change, the Activity is destroyed and recreated, but the `ViewModelStore` is retained through `NonConfigurationInstances`. The ViewModel is only cleared when the Activity is truly finished — when `onDestroy()` is called and `isChangingConfigurations` is false.

#### What is the difference between LiveData and StateFlow for UI state?

LiveData is lifecycle-aware and only delivers updates when the observer is in at least STARTED state. StateFlow is a coroutines API that always holds a value and emits to collectors. StateFlow requires `repeatOnLifecycle` or `collectAsStateWithLifecycle` in Compose to be lifecycle-aware.

I prefer StateFlow because it works naturally with coroutines and supports operators like `map`, `combine`, and `flatMapLatest`. LiveData is simpler for basic cases but gets awkward for complex transformations. Most modern codebases have moved to StateFlow.

#### What is MVI?

MVI stands for Model-View-Intent. Intent here doesn't mean Android's `Intent` class — it means a user action or intention. The View sends Intents to the ViewModel, the ViewModel processes them through a reducer and produces a new State, and the View renders that State. The state is immutable with a single source of truth.

```kotlin
sealed class SearchIntent {
    data class Query(val text: String) : SearchIntent()
    data object ClearResults : SearchIntent()
}

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

#### What is the difference between MVVM and MVI?

In MVVM, the ViewModel can expose multiple observable streams — one for user data, one for loading, one for errors. The View observes each independently. In MVI, the entire screen state is a single immutable object. Every update produces a new state instance.

MVI is more predictable because you can't end up with `isLoading = true` and `error != null` at the same time if your reducer doesn't allow it. MVVM is more flexible with less boilerplate, but it's easier to get inconsistent state across multiple streams. For complex screens, MVI is safer. For simple screens, MVVM is usually enough.

#### What is unidirectional data flow?

Data flows in one direction: state goes to the UI, user events go back to state updates. The cycle is UI renders state, user acts, action updates state, UI re-renders. There's no two-way binding where the View directly modifies state. State is always updated through a defined path like a reducer or ViewModel method, which makes the flow predictable and easy to debug.

#### What is MVC and how does it work in Android?

MVC is Model-View-Controller. The Model holds data, the View displays UI, and the Controller handles user input. In Android, the Activity ends up acting as both View and Controller, which leads to massive Activities. There's no clean separation — the Activity handles UI rendering, user events, and business logic all in one place. That's why MVC fell out of favor for Android.

#### What is MVP and how is it different from MVC?

MVP is Model-View-Presenter. The Presenter replaces the Controller and has no direct reference to Android framework classes. The View (Activity/Fragment) implements an interface, and the Presenter communicates through it. This makes the Presenter unit-testable because it doesn't depend on Android APIs. The downside is boilerplate — every screen needs a View interface, a Presenter, and a contract.

#### What is the Repository pattern?

Repository is an abstraction layer between the ViewModel and data sources. It decides where to get data from — network, database, or cache — and the ViewModel doesn't need to know the details.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao
) {
    fun getUser(userId: String): Flow<User> = flow {
        val cached = dao.getUser(userId)
        if (cached != null) emit(cached)

        val remote = api.fetchUser(userId)
        dao.insert(remote)
        emit(remote)
    }
}
```

This makes it easy to swap data sources, add caching, or change the network library without touching the ViewModel. It also gives you a clean boundary for testing — replace the real repository with a fake that returns predefined data.

#### What is the SingleLiveEvent problem?

One-time events like navigation, toasts, or snackbars don't fit well into LiveData or StateFlow. If I put a navigation event in a StateFlow, it fires again on configuration change because the collector re-reads the current value.

`SingleLiveEvent` was a workaround that delivered the value only once, but it broke with multiple observers. The modern approach is using a `Channel` with `receiveAsFlow()` for one-time events.

```kotlin
class CheckoutViewModel : ViewModel() {
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

#### What is separation of concerns and how do architecture patterns enforce it?

Each component should have one clear responsibility. The UI layer renders state and captures input. The ViewModel holds UI state and business logic. The Repository provides data. The data source handles actual API calls or database queries.

Architecture patterns enforce this with boundaries. In MVVM, the ViewModel doesn't know about Views or Activities — it only exposes state. In Clean Architecture, this goes further with a dependency rule — inner layers can't reference outer layers, so domain logic never depends on Android framework classes, Retrofit, or Room. Without these patterns, you end up with Activities that make network calls, parse JSON, update the database, and render UI all in one class.

#### How does the ViewModel communicate with the View in different patterns?

In MVP, the Presenter holds a reference to the View interface and calls methods like `view.showLoading()`. This is imperative — the Presenter tells the View what to do.

In MVVM, the ViewModel exposes observable state via StateFlow, and the View subscribes. This is reactive — the View reacts to state changes. The ViewModel never references the View.

In MVI, the ViewModel exposes a single state stream and an optional side-effect stream. The View sends intents and renders the full state. The progression from MVP to MVVM to MVI is a progression toward less coupling.

#### What is a reducer in MVI?

A reducer is a pure function that takes the current state and an action and returns a new state. No side effects — same inputs always produce the same output.

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

Because state is a single immutable data class and the reducer is the only way to change it, you can't end up in an invalid state unless the reducer creates one. You can also log every action and state transition for debugging.

#### How do you handle side effects in MVI?

Side effects are things like network calls, database writes, navigation, and toasts. They can't go through the reducer because reducers must be pure. I process intents in the ViewModel, trigger side effects separately, and dispatch the result as a new action to the reducer.

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

Side effects that affect the UI but aren't part of state (navigation, snackbar) go through a separate `Channel` or `SharedFlow`. This keeps state clean and side effects consumable only once.

#### When would you choose MVI over MVVM?

I'd choose MVI when the screen has complex state interactions — multiple interdependent data sources, optimistic updates, undo/redo, or real-time sync. MVI's single state object means you never get inconsistent UI.

For simpler screens like a list, detail, or settings page, MVVM is usually enough. Less boilerplate, and you don't have to model every user action as a sealed class. In practice, most apps use MVVM for most screens and MVI for the complex ones. You can mix patterns in the same app.

#### How do you test a ViewModel?

I test a ViewModel by calling its methods and asserting on the emitted StateFlow values. I use a `TestDispatcher` to control coroutine execution and Turbine to collect flow emissions.

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

In MVI, testing is even simpler because the reducer is a pure function. I can test it directly — pass a state and action, assert the output. No coroutines or mocking needed. Side effects get tested separately through the effects channel.

#### What are common mistakes when implementing MVVM?

Putting UI logic in the ViewModel is the biggest one. The ViewModel should hold state and business logic, not format strings or decide view visibility. Display concerns like string formatting belong in the View layer or a UI model mapper.

Another mistake is exposing `MutableStateFlow` directly instead of backing it with a private mutable property and a public read-only `StateFlow`. Leaking the mutable reference lets the View modify state directly, which breaks the pattern. Also, doing heavy work in the ViewModel constructor — initialization should be lazy or triggered by an explicit method call, not in `init`.

#### What is the role of the domain layer in Clean Architecture?

The domain layer sits between the UI layer and the data layer. It contains use cases (also called interactors) that encapsulate a single piece of business logic. Each use case does one thing — like fetching a user profile, placing an order, or validating input.

The domain layer doesn't depend on Android framework classes or any specific library. It only knows about plain Kotlin types and interfaces. The data layer implements those interfaces. This makes the domain logic fully testable and reusable — I can test a use case with plain JUnit, no Android test runner needed. Google's official architecture guide makes the domain layer optional, but for larger apps with shared business logic across screens, I find it keeps things clean.

### Common Follow-ups

- How do you handle navigation in MVVM — does the ViewModel trigger it or the View?
- What's the difference between `SharedFlow` and `Channel` for one-time events?
- How would you implement undo/redo in MVI?
- Can you combine MVVM and MVI in the same app? When would you?
- How does `SavedStateHandle` fit into the ViewModel pattern?
- What is the difference between UI state and domain state?
- How do you handle partial state updates in MVI without copying the entire state?
