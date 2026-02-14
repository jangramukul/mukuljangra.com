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

MVVM stands for Model-View-ViewModel. Think of it like a restaurant: the kitchen (Model) prepares the food, the waiter (ViewModel) carries orders and dishes back and forth, and the customer (View) just sees what's on the table. The ViewModel holds UI state and business logic, the View observes state changes through StateFlow or Compose state, and the key part is the ViewModel never holds a reference to the View. It just exposes state, and the View reacts. This is the default architecture pattern for modern Android apps.

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

Here's the thing -- when you rotate your phone, the Activity gets destroyed and recreated. But the ViewModel survives because it's not stored inside the Activity. It lives in a `ViewModelStore` owned by the `ViewModelStoreOwner`. During a configuration change, Android retains that `ViewModelStore` through `NonConfigurationInstances` -- so the old Activity dies, a new one is born, but it grabs the same `ViewModelStore` with your ViewModel still inside. The ViewModel only gets cleared when the Activity is truly finished -- when `onDestroy()` is called and `isChangingConfigurations` is false.

#### What is the difference between LiveData and StateFlow for UI state?

LiveData is lifecycle-aware out of the box -- it only delivers updates when the observer is in at least STARTED state. StateFlow is a coroutines API that always holds a value and emits to collectors, but you need `repeatOnLifecycle` or `collectAsStateWithLifecycle` to make it lifecycle-aware.

I prefer StateFlow because it works naturally with coroutines and supports operators like `map`, `combine`, and `flatMapLatest`. LiveData is simpler for basic cases but gets awkward when you need complex transformations. Most modern codebases have moved to StateFlow.

#### What is MVI?

MVI stands for Model-View-Intent. And no, Intent here has nothing to do with Android's `Intent` class -- it means a user action or intention. The View sends Intents to the ViewModel, the ViewModel processes them through a reducer and produces a new State, and the View renders that State. The state is immutable with a single source of truth.

Think of it like a vending machine: you press a button (Intent), the machine processes your selection (reducer), and a new display shows what's happening (State). You can't reach inside and change the state directly -- you always go through the button.

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

> **🧠 Think about it:** If your screen has a loading spinner, an error message, and a data list -- what happens in MVVM if you accidentally set `isLoading = true` and `error != null` at the same time? How would MVI prevent that?

#### What is the difference between MVVM and MVI?

In MVVM, the ViewModel can expose multiple observable streams -- one for user data, one for loading, one for errors. The View observes each independently. In MVI, the entire screen state is a single immutable object. Every update produces a new state instance.

Here's where it gets interesting. MVI is more predictable because you can't end up with `isLoading = true` and `error != null` at the same time if your reducer doesn't allow it. MVVM gives you more flexibility with less boilerplate, but it's easier to get inconsistent state across multiple streams. For complex screens, MVI is safer. For simple screens, MVVM is usually enough.

#### What is unidirectional data flow?

Picture a one-way street. Data flows in one direction: state goes down to the UI, user events go back up to state updates. The cycle is -- UI renders state, user acts, action updates state, UI re-renders. There's no two-way binding where the View directly modifies state. State is always updated through a defined path like a reducer or ViewModel method, which makes the flow predictable and easy to debug.

#### What is MVC and how does it work in Android?

MVC is Model-View-Controller. The Model holds data, the View displays UI, and the Controller handles user input. The problem? In Android, the Activity ends up acting as both View and Controller, which leads to massive Activities. The Activity handles UI rendering, user events, and business logic all in one place. That's why MVC fell out of favor for Android -- it sounds clean on paper, but Android's Activity lifecycle turns it into a mess.

#### What is MVP and how is it different from MVC?

MVP is Model-View-Presenter. The Presenter replaces the Controller and -- this is the important part -- has no direct reference to Android framework classes. The View (Activity/Fragment) implements an interface, and the Presenter communicates through that interface. This makes the Presenter unit-testable because it doesn't depend on Android APIs. The downside is boilerplate -- every screen needs a View interface, a Presenter, and a contract. It's like filling out paperwork in triplicate just to show a list.

#### What is the Repository pattern?

Repository is an abstraction layer between the ViewModel and data sources. It's like a librarian -- you ask for a book, and the librarian decides whether to grab it from the shelf, order it from another branch, or check the digital catalog. The ViewModel doesn't need to know those details.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao
) {
    fun getUser(userId: String): Flow<User> = flow {
        // Check the local shelf first
        val cached = dao.getUser(userId)
        if (cached != null) emit(cached)

        // Then fetch the latest from remote
        val remote = api.fetchUser(userId)
        dao.insert(remote)
        emit(remote)
    }
}
```

This makes it easy to swap data sources, add caching, or change the network library without touching the ViewModel. It also gives you a clean boundary for testing -- replace the real repository with a fake that returns predefined data.

#### What is the SingleLiveEvent problem?

One-time events like navigation, toasts, or snackbars don't fit well into LiveData or StateFlow. If I put a navigation event in a StateFlow, it fires again on configuration change because the collector re-reads the current value. It's like a notification that keeps popping up every time you unlock your phone.

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

Architecture patterns enforce this with boundaries. In MVVM, the ViewModel doesn't know about Views or Activities -- it only exposes state. In Clean Architecture, this goes further with a dependency rule -- inner layers can't reference outer layers, so domain logic never depends on Android framework classes, Retrofit, or Room. Without these patterns, you end up with Activities that make network calls, parse JSON, update the database, and render UI all in one class. That's not an Activity -- that's a monster.

> **🧠 Think about it:** If your ViewModel imports `android.widget.TextView`, what does that tell you about your architecture? What breaks when you try to write a unit test for it?

#### How does the ViewModel communicate with the View in different patterns?

In MVP, the Presenter holds a reference to the View interface and calls methods like `view.showLoading()`. This is imperative -- the Presenter tells the View what to do.

In MVVM, the ViewModel exposes observable state via StateFlow, and the View subscribes. This is reactive -- the View reacts to state changes. The ViewModel never references the View.

In MVI, the ViewModel exposes a single state stream and an optional side-effect stream. The View sends intents and renders the full state. Plot twist -- the progression from MVP to MVVM to MVI is really a progression toward less and less coupling between components.

#### What is a reducer in MVI?

A reducer is a pure function that takes the current state and an action and returns a new state. No side effects, no surprises -- same inputs always produce the same output. It's like a math function: `f(currentState, action) = newState`.

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

Because state is a single immutable data class and the reducer is the only way to change it, you can't end up in an invalid state unless the reducer itself creates one. Bonus -- you can log every action and state transition for debugging, which makes time-travel debugging possible.

#### How do you handle side effects in MVI?

Side effects are things like network calls, database writes, navigation, and toasts. They can't go through the reducer because reducers must be pure -- no network calls, no database writes, no I/O. I process intents in the ViewModel, trigger side effects separately, and dispatch the result as a new action to the reducer.

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

I'd choose MVI when the screen has complex state interactions -- multiple interdependent data sources, optimistic updates, undo/redo, or real-time sync. MVI's single state object means you never get inconsistent UI.

For simpler screens like a list, detail, or settings page, MVVM is usually enough. Less boilerplate, and you don't have to model every user action as a sealed class. In practice, most apps use MVVM for most screens and MVI for the complex ones. You can absolutely mix patterns in the same app -- nobody said you have to pick just one.

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

Now here's where it gets interesting. In MVI, testing is even simpler because the reducer is a pure function. I can test it directly -- pass a state and action, assert the output. No coroutines, no mocking, no test dispatchers needed. Side effects get tested separately through the effects channel.

> **🧠 Think about it:** If a reducer is a pure function with no side effects, how many lines of test setup do you need? Compare that to testing a ViewModel that makes network calls. Which one would you rather debug at 2 AM?

#### What are common mistakes when implementing MVVM?

Putting UI logic in the ViewModel is the biggest one. The ViewModel should hold state and business logic, not format strings or decide view visibility. Display concerns like string formatting belong in the View layer or a UI model mapper.

Another mistake is exposing `MutableStateFlow` directly instead of backing it with a private mutable property and a public read-only `StateFlow`. Leaking the mutable reference lets the View modify state directly, which completely breaks the pattern. Also, doing heavy work in the ViewModel constructor -- initialization should be lazy or triggered by an explicit method call, not crammed into `init`.

#### What is the role of the domain layer in Clean Architecture?

The domain layer sits between the UI layer and the data layer. It contains use cases (also called interactors) that encapsulate a single piece of business logic. Each use case does one thing -- like fetching a user profile, placing an order, or validating input.

Here's the thing about the domain layer -- it doesn't depend on Android framework classes or any specific library. It only knows about plain Kotlin types and interfaces. The data layer implements those interfaces. This makes the domain logic fully testable and reusable -- I can test a use case with plain JUnit, no Android test runner needed. Google's official architecture guide makes the domain layer optional, but for larger apps with shared business logic across screens, I find it keeps things clean.

### Common Follow-ups

- How do you handle navigation in MVVM — does the ViewModel trigger it or the View?
- What's the difference between `SharedFlow` and `Channel` for one-time events?
- How would you implement undo/redo in MVI?
- Can you combine MVVM and MVI in the same app? When would you?
- How does `SavedStateHandle` fit into the ViewModel pattern?
- What is the difference between UI state and domain state?
- How do you handle partial state updates in MVI without copying the entire state?
