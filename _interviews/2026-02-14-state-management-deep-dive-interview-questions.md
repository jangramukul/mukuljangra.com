---
title: "State Management Deep Dive"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 8
sequence: 40
description: "State management is where architecture rounds get hard."
---

## State Management Deep Dive

State management comes up in almost every architecture round. I need to know UI state vs data state, StateFlow vs SharedFlow, and how to survive process death.

#### What is StateFlow and how does it differ from LiveData?

`StateFlow` is a hot flow that always holds a value and emits the latest value to new collectors. It's part of `kotlinx.coroutines` and is the modern replacement for `LiveData`.

- StateFlow requires an initial value. LiveData can start without one.
- StateFlow does equality-based deduplication — it won't re-emit the same value. LiveData emits on every `setValue` call.
- StateFlow has no lifecycle awareness. I pair it with `collectAsStateWithLifecycle()` in Compose or `repeatOnLifecycle` in fragments.
- StateFlow works with any dispatcher. LiveData's `setValue` is main-thread only (`postValue` for background).

For new code, I use StateFlow with lifecycle-aware collection. LiveData still works fine in existing codebases but has a smaller API surface and no operator support.

#### What is the difference between UI state and data state?

UI state is what the screen needs to render — loading indicators, user input, selected tabs, scroll position. Data state is the actual domain data — user profile, list of messages, account balance.

UI state lives in the ViewModel or the composable itself. Data state lives in the repository and flows up. I combine them in the ViewModel to produce a single UI state object.

```kotlin
data class ProfileUiState(
    val user: User? = null,          // Data state (from repository)
    val isLoading: Boolean = false,  // UI state
    val isEditing: Boolean = false,  // UI state
    val errorMessage: String? = null // UI state
)
```

Keeping them separate helps me decide where each piece belongs. Data state should survive process death if it's expensive to reload. UI state like "is the bottom sheet open" is often fine to lose.

#### What is SharedFlow and when do you use it instead of StateFlow?

`SharedFlow` is a hot flow that can emit values to multiple collectors. Unlike `StateFlow`, it doesn't hold a current value by default and doesn't deduplicate.

I use SharedFlow for events that should be delivered once — navigation events, snackbar messages, one-shot errors. StateFlow is for state that the UI observes continuously.

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

`SharedFlow` with `replay = 0` is fire-and-forget — if no one is collecting, the event is lost. With `replay = 1`, the latest event is replayed to new collectors.

#### What is state hoisting in Compose?

State hoisting moves state out of a composable and passes it as parameters. The composable becomes stateless — it receives state and emits events through callbacks.

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

The stateless version is reusable, testable, and previewable. The rule is: hoist state to the lowest common ancestor that needs it. If only one screen uses the state, hoist to the screen-level composable or ViewModel. If multiple screens share it, hoist to a shared ViewModel or navigation graph scope.

#### What is the single state object pattern?

Instead of exposing multiple flows from a ViewModel, I combine everything into one data class and expose a single `StateFlow`. The UI observes one stream and renders the full state.

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

The advantage is simplicity — one state, one observation point. The downside is that any change to any field triggers a new emission. In Compose, smart recomposition helps — only composables that read the changed field recompose.

#### What is SavedStateHandle and why do you need it?

`SavedStateHandle` is a key-value map that survives process death. The system saves it to the saved instance state bundle when the app goes to the background. When the process is recreated, the ViewModel gets a `SavedStateHandle` with the restored values.

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

Without `SavedStateHandle`, my ViewModel loses all state on process death. The ViewModel survives configuration changes (rotation) but not process death. `SavedStateHandle` bridges that gap. Hilt injects it automatically.

#### How does process death differ from configuration changes?

Configuration changes (rotation, dark mode, locale) destroy and recreate the Activity, but the ViewModel survives because `ViewModelStore` is retained by the framework.

Process death happens when the system kills the app to reclaim memory. Everything is gone — Activity, ViewModel, in-memory state, singleton instances. Only `onSaveInstanceState` / `SavedStateHandle` data and persistent storage (Room, DataStore, files) survive.

To test process death, I use "Don't keep activities" in developer options or `adb shell am kill <package>`. Common things developers forget to persist: scroll position, form input, selected filters, partially completed flows.

#### How does stateIn work and what is the right SharingStarted strategy?

`stateIn` converts a cold Flow into a hot `StateFlow`. It takes a coroutine scope, a sharing strategy, and an initial value.

- **`SharingStarted.Eagerly`** — starts collecting immediately and never stops, even with zero collectors.
- **`SharingStarted.Lazily`** — starts on the first subscriber and never stops after that.
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

`WhileSubscribed(5_000)` is the recommended default for ViewModels. The 5-second window keeps the upstream alive during configuration changes (Activity recreation takes less than 5 seconds) but stops it when the user navigates away.

#### When should you use multiple flows instead of a single state object?

I use multiple flows when state fields update at very different frequencies or are independent. If a dashboard has a real-time ticker updating every second and a user profile that changes once per session, combining them means the profile section gets a new state object every second even though nothing changed for it.

```kotlin
class TradingViewModel : ViewModel() {
    val portfolio: StateFlow<Portfolio> = ...    // Updates rarely
    val ticker: StateFlow<TickerData> = ...      // Updates every second
    val alerts: SharedFlow<Alert> = ...          // One-shot events
}
```

In Compose, each `collectAsStateWithLifecycle()` call creates a separate state read. Only the composable reading `ticker` recomposes on ticker updates. With a single state object, `StateFlow`'s equality check would fail every second because `TickerData` changed, causing the entire state to re-emit.

The tradeoff: multiple flows are more performant but harder to reason about. A single state object is simpler but can cause unnecessary work if not structured carefully.

#### How does Redux-style state management (MVI) work in Android?

MVI has three pieces: state, actions (events), and a reducer. The reducer is a pure function that takes current state and an action, and returns new state. The ViewModel holds the state and processes actions through the reducer.

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

The reducer is pure and testable — no side effects, no dependencies. Side effects like API calls are handled outside the reducer, usually in the ViewModel before dispatching a result action. The downside is verbosity — even simple operations need an action class, a reducer case, and a state update.

#### What is a state machine and how do you implement one in Android?

A state machine defines a finite set of states and the transitions between them. Each state has allowed transitions triggered by events. This prevents invalid state combinations — I can't be in "loading" and "error" at the same time.

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

State machines make complex flows predictable and testable. I can write tests like: "given Cart state, when ProceedToShipping event, then state is Shipping." Invalid transitions return the current state unchanged.

#### How does the Compose snapshot system relate to state management?

The snapshot system tracks state reads and writes during composition. When I create a `mutableStateOf`, Compose registers it in the snapshot system. During composition, it records which state objects each composable reads. When any of those values change, Compose knows exactly which composables need to recompose.

This is different from Flow-based state management. With `mutableStateOf`, there's no collector or subscriber — the snapshot system tracks reads at the composition level and triggers recomposition directly. That's why `remember { mutableStateOf() }` is more efficient than `flow.collectAsState()` for local UI state.

`snapshotFlow {}` bridges these two worlds. It reads Compose state inside its lambda and emits to a Flow whenever those values change. This lets me react to Compose state changes in a ViewModel or other non-Compose code.

#### How do you handle state restoration after process death in Compose?

`remember` doesn't survive process death — it's only composition-scoped. I use `rememberSaveable` instead. It saves the value to the `SavedInstanceState` bundle using `Saver` objects.

```kotlin
// Survives config changes only
var query by remember { mutableStateOf("") }

// Survives config changes AND process death
var query by rememberSaveable { mutableStateOf("") }
```

For complex objects, I write a custom `Saver`:

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

For ViewModel state, use `SavedStateHandle`. For Compose-only state that needs to survive process death, use `rememberSaveable`. For data that's expensive to reload, persist it in Room or DataStore — the saved instance state bundle has a size limit.

#### What is unidirectional data flow and why does it matter for state management?

Unidirectional data flow (UDF) means state flows down and events flow up. The ViewModel holds the state and exposes it to the UI. The UI renders based on that state and sends user actions back to the ViewModel. The ViewModel processes the action, updates the state, and the UI re-renders.

This creates a single loop: state → UI → event → ViewModel → new state → UI. I never mutate state directly from the UI layer. The benefit is predictability — I always know where state lives, how it changes, and what caused the change. Debugging is easier because I can trace any state change back to a specific event. Both MVVM with StateFlow and MVI follow this pattern.

#### What is derivedStateOf and when should you use it?

`derivedStateOf` creates a state computed from other states. It only recomputes when its inputs change, and Compose only recomposes when the derived result changes.

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

Without `derivedStateOf`, every recomposition would re-run the filter even if the result is the same. It caches the result and only triggers recomposition when the filtered list actually changes. I use it when deriving a value from rapidly changing state where the derived result changes less often than the source.

### Common Follow-ups

- How do you prevent state loss during configuration changes without ViewModel? (Use `rememberSaveable` in Compose or `onSaveInstanceState` in Activities. For large data, save a key to `SavedStateHandle` and reload from the data layer)
- What is the SingleLiveEvent problem? (LiveData replays the last value to new observers. For one-shot events like navigation or snackbar, this causes the event to fire again on rotation. Solutions: `SharedFlow` with `replay = 0`, `Channel`, or event wrapper classes)
- How do you test state management in a ViewModel? (Use `runTest` to control coroutine execution. Collect the state flow with Turbine. Dispatch actions and assert state transitions step by step)
- What is `collectAsStateWithLifecycle` and why use it over `collectAsState`? (`collectAsStateWithLifecycle` stops collection when the lifecycle falls below a minimum state like STARTED. `collectAsState` collects even when the app is in the background, wasting resources)
- How do you handle partial state updates without copying the entire state object? (Use `StateFlow.update {}` with `copy()`. For fine-grained updates, split into multiple StateFlows or use a state holder class with individual mutable state properties)
- What is the difference between `MutableStateFlow.value = x` and `MutableStateFlow.update {}`? (`update` is atomic — it uses compare-and-set internally. Direct `value = x` assignment can lose updates when multiple coroutines write concurrently)
