---
title: "State Management Deep Dive"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 8
---

## State Management Deep Dive

State management is where architecture rounds get hard. Interviewers want to see that you understand the difference between UI state and data state, know when to use StateFlow vs SharedFlow vs LiveData, and can handle process death and configuration changes properly.

### Core Questions

#### Q1: What is the difference between UI state and data state?

UI state is what the screen needs to render right now — loading indicators, user input, selected tabs, scroll position. Data state is the actual domain data — user profile, list of messages, account balance.

UI state lives in the ViewModel or the composable itself. Data state lives in the repository or data layer and flows up. A common pattern is combining data from the repository with UI-specific state in the ViewModel to produce a single UI state object.

```kotlin
data class ProfileUiState(
    val user: User? = null,          // Data state (from repository)
    val isLoading: Boolean = false,  // UI state
    val isEditing: Boolean = false,  // UI state
    val errorMessage: String? = null // UI state
)
```

Keeping them separate in your head helps you decide where each piece of state belongs. Data state should survive process death if it's expensive to reload. UI state like "is the bottom sheet open" is often fine to lose.

#### Q2: What is StateFlow and how does it differ from LiveData?

`StateFlow` is a hot flow that always holds a value and emits the latest value to new collectors. It's part of `kotlinx.coroutines` and is the modern replacement for `LiveData` in ViewModels.

Key differences:

- StateFlow requires an initial value. LiveData can start without one.
- StateFlow uses `value` property. LiveData uses `value` with nullable return.
- StateFlow does equality-based deduplication — it won't emit the same value twice in a row. LiveData emits every `setValue` call.
- StateFlow has no lifecycle awareness built in. You pair it with `collectAsStateWithLifecycle()` in Compose or `repeatOnLifecycle` in fragments.
- StateFlow works with any dispatcher. LiveData's `setValue` is main-thread only (`postValue` for background threads).

For new code, StateFlow with lifecycle-aware collection is the standard approach. LiveData still works fine in existing codebases but has a smaller API surface and no operator support.

#### Q3: What is SharedFlow and when do you use it instead of StateFlow?

`SharedFlow` is a hot flow that can emit values to multiple collectors. Unlike `StateFlow`, it doesn't hold a current value by default and doesn't do equality-based deduplication.

Use SharedFlow for events that should be delivered once — navigation events, snackbar messages, one-shot errors. StateFlow is for state that the UI observes continuously.

```kotlin
class OrderViewModel : ViewModel() {
    private val _events = MutableSharedFlow<OrderEvent>()
    val events: SharedFlow<OrderEvent> = _events.asSharedFlow()

    private val _state = MutableStateFlow(OrderUiState())
    val state: StateFlow<OrderUiState> = _state.asStateFlow()

    fun placeOrder(order: Order) {
        viewModelScope.launch {
            val result = repository.submitOrder(order)
            result.onSuccess { _events.emit(OrderEvent.OrderPlaced(it.id)) }
            result.onFailure { _state.update { it.copy(error = "Order failed") } }
        }
    }
}
```

`SharedFlow` with `replay = 0` is fire-and-forget — if no one is collecting when the event is emitted, it's lost. With `replay = 1`, the latest event is replayed to new collectors. Choose based on whether missed events are acceptable.

#### Q4: What is state hoisting in Compose?

State hoisting moves state out of a composable and passes it as parameters. The composable becomes stateless — it receives state and emits events through callbacks. The parent controls the state.

```kotlin
// Stateful — owns its state
@Composable
fun SearchBar() {
    var query by remember { mutableStateOf("") }
    TextField(value = query, onValueChange = { query = it })
}

// Stateless — state is hoisted
@Composable
fun SearchBar(query: String, onQueryChange: (String) -> Unit) {
    TextField(value = query, onValueChange = onQueryChange)
}
```

The stateless version is reusable, testable, and previewable. You can test it by providing known state and asserting UI output. The rule is: hoist state to the lowest common ancestor that needs it. If only one screen uses the state, hoist to the screen-level composable or ViewModel. If multiple screens share it, hoist to a shared ViewModel or navigation graph scope.

#### Q5: What is SavedStateHandle and why do you need it?

`SavedStateHandle` is a key-value map that survives process death. The system saves it to the saved instance state bundle when the app goes to the background. When the process is recreated, the ViewModel receives a `SavedStateHandle` with the restored values.

```kotlin
class SearchViewModel(
    private val savedState: SavedStateHandle,
    private val repository: SearchRepository
) : ViewModel() {

    val query = savedState.getStateFlow("query", "")

    fun onQueryChanged(newQuery: String) {
        savedState["query"] = newQuery
        search(newQuery)
    }
}
```

Without `SavedStateHandle`, your ViewModel loses all state on process death. The ViewModel survives configuration changes (rotation) but not process death. `SavedStateHandle` bridges that gap. Hilt injects it automatically. Navigation Compose populates it with destination arguments.

#### Q6: How does process death differ from configuration changes?

Configuration changes (rotation, dark mode, locale) destroy and recreate the Activity, but the ViewModel survives because `ViewModelStore` is retained by the framework.

Process death happens when the system kills your app to reclaim memory. Everything is gone — Activity, ViewModel, in-memory state, singleton instances. Only `onSaveInstanceState` / `SavedStateHandle` data and persistent storage (Room, DataStore, files) survive.

To test process death, use "Don't keep activities" in developer options or run `adb shell am kill <package>`. You'll quickly find state that you thought was surviving but isn't. Common things developers forget to persist: scroll position, form input, selected filters, partially completed flows.

#### Q7: What is the single state object pattern?

Instead of exposing multiple flows from a ViewModel, you combine everything into a single data class and expose one `StateFlow`. The UI observes one stream and renders based on the full state.

```kotlin
data class DashboardUiState(
    val user: User? = null,
    val recentOrders: List<Order> = emptyList(),
    val notifications: Int = 0,
    val isLoading: Boolean = true,
    val error: String? = null
)

class DashboardViewModel(
    userRepo: UserRepository,
    orderRepo: OrderRepository,
    notifRepo: NotificationRepository
) : ViewModel() {

    val state: StateFlow<DashboardUiState> = combine(
        userRepo.observeUser(),
        orderRepo.observeRecent(),
        notifRepo.observeUnreadCount()
    ) { user, orders, count ->
        DashboardUiState(user = user, recentOrders = orders, notifications = count, isLoading = false)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardUiState())
}
```

The advantage is simplicity — one state, one observation point. The downside is that any change to any field triggers a new emission. In Compose, this is mitigated by smart recomposition — only composables that read the changed field recompose.

### Deep Dive Questions

#### Q8: When should you use multiple flows instead of a single state object?

Use multiple flows when your state fields update at very different frequencies or when they're independent. If your dashboard has a real-time stock ticker updating every second and a user profile that changes once per session, combining them into one state means the profile section gets a new state object every second even though nothing changed for it.

```kotlin
class TradingViewModel : ViewModel() {
    val portfolio: StateFlow<Portfolio> = ...    // Updates rarely
    val ticker: StateFlow<TickerData> = ...      // Updates every second
    val alerts: SharedFlow<Alert> = ...          // One-shot events
}
```

In Compose, this works well because each `collectAsStateWithLifecycle()` call creates a separate state read. Only the composable reading `ticker` recomposes on ticker updates. With a single state object, `StateFlow`'s equality check would fail every second because `TickerData` changed, causing the entire state to re-emit.

The tradeoff: multiple flows are more performant but harder to reason about. A single state object is simpler but can cause unnecessary work if not structured carefully.

#### Q9: What is a state machine and how do you implement one in Android?

A state machine defines a finite set of states and the transitions between them. Each state has a set of allowed transitions triggered by events. This prevents invalid state combinations — you can't be in "loading" and "error" at the same time.

```kotlin
sealed class CheckoutState {
    data object Cart : CheckoutState()
    data class Shipping(val items: List<Item>) : CheckoutState()
    data class Payment(val items: List<Item>, val address: Address) : CheckoutState()
    data class Confirmation(val orderId: String) : CheckoutState()
    data class Failed(val error: String) : CheckoutState()
}

sealed class CheckoutEvent {
    data class ProceedToShipping(val items: List<Item>) : CheckoutEvent()
    data class ProceedToPayment(val address: Address) : CheckoutEvent()
    data class PlaceOrder(val paymentMethod: PaymentMethod) : CheckoutEvent()
    data object GoBack : CheckoutEvent()
}

fun reduce(state: CheckoutState, event: CheckoutEvent): CheckoutState {
    return when (state) {
        is CheckoutState.Cart -> when (event) {
            is CheckoutEvent.ProceedToShipping -> CheckoutState.Shipping(event.items)
            else -> state
        }
        is CheckoutState.Shipping -> when (event) {
            is CheckoutEvent.ProceedToPayment -> CheckoutState.Payment(state.items, event.address)
            is CheckoutEvent.GoBack -> CheckoutState.Cart
            else -> state
        }
        // ... other transitions
        else -> state
    }
}
```

State machines make complex flows predictable and testable. You can write tests that verify: "given Cart state, when ProceedToShipping event, then state is Shipping." Invalid transitions return the current state unchanged. Libraries like Orbit MVI use this pattern internally.

#### Q10: How does Redux-style state management work in Android?

Redux-style MVI has three pieces: state, actions (events), and a reducer. The reducer is a pure function that takes current state and an action, and returns new state. The ViewModel holds the state and processes actions through the reducer.

```kotlin
data class TodoState(
    val items: List<Todo> = emptyList(),
    val filter: Filter = Filter.ALL,
    val isLoading: Boolean = false
)

sealed class TodoAction {
    data class AddTodo(val text: String) : TodoAction()
    data class ToggleTodo(val id: String) : TodoAction()
    data class SetFilter(val filter: Filter) : TodoAction()
}

class TodoViewModel : ViewModel() {
    private val _state = MutableStateFlow(TodoState())
    val state: StateFlow<TodoState> = _state.asStateFlow()

    fun dispatch(action: TodoAction) {
        _state.update { currentState ->
            when (action) {
                is TodoAction.AddTodo -> currentState.copy(
                    items = currentState.items + Todo(text = action.text)
                )
                is TodoAction.ToggleTodo -> currentState.copy(
                    items = currentState.items.map {
                        if (it.id == action.id) it.copy(done = !it.done) else it
                    }
                )
                is TodoAction.SetFilter -> currentState.copy(filter = action.filter)
            }
        }
    }
}
```

The reducer is pure and testable — no side effects, no dependencies. Side effects (API calls, database writes) are handled outside the reducer, usually as middleware or in the ViewModel before dispatching a result action. The downside is verbosity — even simple operations need an action class, a reducer case, and a state update.

#### Q11: How does stateIn work and what is the right SharingStarted strategy?

`stateIn` converts a cold Flow into a hot `StateFlow`. It takes a coroutine scope, a sharing strategy, and an initial value.

- **`SharingStarted.Eagerly`** — starts collecting immediately when `stateIn` is called and never stops. The upstream flow stays active as long as the scope lives, even with zero collectors.
- **`SharingStarted.Lazily`** — starts collecting on the first subscriber and never stops after that.
- **`SharingStarted.WhileSubscribed(stopTimeout)`** — starts on first subscriber, stops after the last subscriber disappears plus the timeout. Restarts when a new subscriber appears.

```kotlin
val uiState: StateFlow<UiState> = repository.observeData()
    .map { data -> UiState.Success(data) }
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = UiState.Loading
    )
```

`WhileSubscribed(5_000)` is the recommended default for ViewModels. The 5-second window keeps the upstream alive during configuration changes (Activity recreation takes less than 5 seconds) but stops it when the user navigates away. `Eagerly` wastes resources by keeping upstream flows active when no one is watching.

#### Q12: How does the Compose snapshot system relate to state management?

Compose's snapshot system is the mechanism that tracks state reads and writes during composition. When you create a `mutableStateOf`, Compose registers it in the snapshot system. During composition, Compose records which state objects each composable reads. When any of those values change, Compose knows exactly which composables need to recompose.

This is different from Flow-based state management. With `mutableStateOf`, there's no collector or subscriber. The snapshot system tracks reads at the composition level and triggers recomposition directly. That's why `remember { mutableStateOf() }` is more efficient than `flow.collectAsState()` for local UI state — there's no flow machinery involved, just direct snapshot observation.

`snapshotFlow {}` bridges these two worlds. It reads Compose state inside its lambda and emits to a Flow whenever those values change. This lets you react to Compose state changes in a ViewModel or other non-Compose code.

#### Q13: How do you handle state restoration after process death in Compose?

`remember` doesn't survive process death — it's only composition-scoped. Use `rememberSaveable` instead. It saves the value to the `SavedInstanceState` bundle using `Saver` objects.

```kotlin
// Survives config changes only
var query by remember { mutableStateOf("") }

// Survives config changes AND process death
var query by rememberSaveable { mutableStateOf("") }
```

For complex objects, write a custom `Saver`:

```kotlin
data class FilterState(val category: String, val sortBy: String)

val FilterStateSaver = run {
    val categoryKey = "category"
    val sortKey = "sortBy"
    mapSaver(
        save = { mapOf(categoryKey to it.category, sortKey to it.sortBy) },
        restore = { FilterState(it[categoryKey] as String, it[sortKey] as String) }
    )
}

var filter by rememberSaveable(stateSaver = FilterStateSaver) {
    mutableStateOf(FilterState("all", "date"))
}
```

For ViewModel state, use `SavedStateHandle`. For Compose-only state that needs to survive process death, use `rememberSaveable`. For data that's expensive to reload, persist it in Room or DataStore instead of relying on the saved instance state bundle, which has a size limit.

#### Q14: What is derivedStateOf and when should you use it?

`derivedStateOf` creates a state that's computed from other states. It only recomputes when its inputs change, and Compose only recomposes when the derived result changes. It's useful for avoiding unnecessary recompositions from expensive computations.

```kotlin
@Composable
fun ContactList(contacts: List<Contact>, query: String) {
    val filteredContacts by remember(contacts, query) {
        derivedStateOf {
            contacts.filter { it.name.contains(query, ignoreCase = true) }
        }
    }

    LazyColumn {
        items(filteredContacts) { contact ->
            ContactItem(contact)
        }
    }
}
```

Without `derivedStateOf`, every recomposition would re-run the filter even if the result is the same. `derivedStateOf` caches the result and only triggers recomposition when the filtered list actually changes. Use it when you're deriving a value from rapidly changing state where the derived result changes less often than the source.

#### Q15: How does the Orbit MVI library approach state management?

Orbit MVI provides a structured way to implement MVI with minimal boilerplate. It separates state (persistent UI state), side effects (one-shot events), and the container that manages them.

```kotlin
data class LoginState(
    val email: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

sealed class LoginSideEffect {
    data object NavigateToHome : LoginSideEffect()
}

class LoginViewModel : ContainerHost<LoginState, LoginSideEffect>, ViewModel() {
    override val container = container<LoginState, LoginSideEffect>(LoginState())

    fun onLogin() = intent {
        reduce { state.copy(isLoading = true) }
        val result = repository.login(state.email)
        result.onSuccess {
            reduce { state.copy(isLoading = false) }
            postSideEffect(LoginSideEffect.NavigateToHome)
        }
        result.onFailure {
            reduce { state.copy(isLoading = false, error = it.message) }
        }
    }
}
```

`reduce` updates state synchronously. `postSideEffect` sends one-shot events. The `intent` block provides a structured scope for async operations. Orbit handles threading and state synchronization internally. It's less verbose than hand-rolled MVI while still maintaining unidirectional data flow and testability.

### Common Follow-ups

- How do you prevent state loss during configuration changes without ViewModel? (Use `rememberSaveable` in Compose or `onSaveInstanceState` in Activities. For large data, save a key to `SavedStateHandle` and reload from the data layer)
- What is the SingleLiveEvent problem? (LiveData replays the last value to new observers. For one-shot events like navigation or snackbar, this causes the event to fire again on rotation. Solutions: `SharedFlow` with `replay = 0`, `Channel`, or event wrapper classes)
- How do you test state management in a ViewModel? (Use `runTest` to control coroutine execution. Collect the state flow with Turbine. Dispatch actions and assert state transitions step by step)
- What is `collectAsStateWithLifecycle` and why use it over `collectAsState`? (`collectAsStateWithLifecycle` stops collection when the lifecycle falls below a minimum state like STARTED. `collectAsState` collects even when the app is in the background, wasting resources)
- How do you handle partial state updates without copying the entire state object? (Use `StateFlow.update {}` with `copy()`. For fine-grained updates, split into multiple StateFlows or use a state holder class with individual mutable state properties)
- What is the difference between `MutableStateFlow.value = x` and `MutableStateFlow.update {}`? (`update` is atomic — it uses compare-and-set internally. Direct `value = x` assignment can lose updates when multiple coroutines write concurrently)
