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

State management is where architecture rounds stop being polite and start getting real. If you can explain StateFlow vs SharedFlow, know the difference between UI state and data state, and can tell me what actually survives process death — you're in good shape. Let's get into it.

#### What is StateFlow and how does it differ from LiveData?

`StateFlow` is a hot flow that always holds a value and emits the latest value to new collectors. Think of it like a whiteboard in a meeting room — there's always something written on it, and anyone who walks in sees the current content immediately.

- StateFlow requires an initial value. LiveData can start without one.
- StateFlow does equality-based deduplication — it won't re-emit the same value. LiveData emits on every `setValue` call.
- StateFlow has no lifecycle awareness. I pair it with `collectAsStateWithLifecycle()` in Compose or `repeatOnLifecycle` in fragments.
- StateFlow works with any dispatcher. LiveData's `setValue` is main-thread only (`postValue` for background).

For new code, I use StateFlow with lifecycle-aware collection. LiveData still works fine in existing codebases but has a smaller API surface and no operator support.

#### What is the difference between UI state and data state?

Here's the thing — not all state is created equal. UI state is what the screen needs to render — loading indicators, user input, selected tabs, scroll position. Data state is the actual domain data — user profile, list of messages, account balance.

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

> **🧠 Think about it:** If the user filled out a long form and the system kills your process, which parts of that screen's state absolutely need to survive — and which can you afford to lose?

#### What is SharedFlow and when do you use it instead of StateFlow?

`SharedFlow` is a hot flow that can emit values to multiple collectors. Unlike `StateFlow`, it doesn't hold a current value by default and doesn't deduplicate.

I use SharedFlow for things that should happen once and be done — navigation events, snackbar messages, one-shot errors. It's like a loudspeaker announcement at an airport. If you weren't listening, you missed it. StateFlow is more like the departure board — it always shows the current info.

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

State hoisting moves state out of a composable and passes it as parameters. The composable becomes stateless — it receives state and emits events through callbacks. It's like the difference between a self-service kiosk (manages its own state) and a waiter taking your order (receives input, reports it up).

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

Instead of exposing multiple flows from a ViewModel, I combine everything into one data class and expose a single `StateFlow`. One state, one source of truth, one place to look when something's wrong.

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

Without `SavedStateHandle`, my ViewModel loses all state on process death. Plot twist — the ViewModel survives configuration changes (rotation) but not process death. `SavedStateHandle` bridges that gap. Hilt injects it automatically.

#### How does process death differ from configuration changes?

Configuration changes (rotation, dark mode, locale) destroy and recreate the Activity, but the ViewModel survives because `ViewModelStore` is retained by the framework. It's like redecorating your office — the furniture moves around, but your files are still on the desk.

Process death is a whole different story. The system kills the app to reclaim memory. Everything is gone — Activity, ViewModel, in-memory state, singleton instances. Only `onSaveInstanceState` / `SavedStateHandle` data and persistent storage (Room, DataStore, files) survive.

To test process death, I use "Don't keep activities" in developer options or `adb shell am kill <package>`. Common things developers forget to persist: scroll position, form input, selected filters, partially completed flows.

> **🧠 Think about it:** Your user is halfway through a checkout flow — they've entered shipping info and selected a payment method. The system kills your process. What state do you need to restore, and where should each piece be saved?

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

`WhileSubscribed(5_000)` is the recommended default for ViewModels. Here's the trick — the 5-second window keeps the upstream alive during configuration changes (Activity recreation takes less than 5 seconds) but stops it when the user navigates away. Best of both worlds.

#### When should you use multiple flows instead of a single state object?

I use multiple flows when state fields update at very different frequencies or are independent. Think of it this way — if a dashboard has a real-time ticker updating every second and a user profile that changes once per session, combining them means the profile section gets a new state object every second even though nothing changed for it.

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

MVI has three pieces: state, actions (events), and a reducer. The reducer is a pure function — give it the current state and an action, it hands back the new state. No side effects, no surprises. The ViewModel holds the state and runs actions through the reducer.

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

Because the reducer is pure, it's incredibly easy to test — no mocking, no dependencies, just input and output. Side effects like API calls are handled outside the reducer, usually in the ViewModel before dispatching a result action. The downside is verbosity — even simple operations need an action class, a reducer case, and a state update.

#### What is a state machine and how do you implement one in Android?

A state machine defines a finite set of states and the transitions between them. Each state has allowed transitions triggered by events. It's like a turnstile — you can only go from locked to unlocked by inserting a coin. Try pushing without paying? Nothing happens. This prevents invalid state combinations — I can't be in "loading" and "error" at the same time.

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

State machines make complex flows predictable and testable. I can write tests like: "given Cart state, when ProceedToShipping event, then state is Shipping." Invalid transitions just return the current state unchanged — no crashes, no weird in-between states.

#### How does the Compose snapshot system relate to state management?

Now here's where it gets interesting. The snapshot system tracks state reads and writes during composition. When I create a `mutableStateOf`, Compose registers it in the snapshot system. During composition, it records which state objects each composable reads. When any of those values change, Compose knows exactly which composables need to recompose.

This is fundamentally different from Flow-based state management. With `mutableStateOf`, there's no collector or subscriber — the snapshot system tracks reads at the composition level and triggers recomposition directly. That's why `remember { mutableStateOf() }` is more efficient than `flow.collectAsState()` for local UI state.

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

Unidirectional data flow (UDF) means state flows down and events flow up. Think of it like a one-way street — the ViewModel pushes state down to the UI, the UI sends user actions back up to the ViewModel. No shortcuts, no U-turns.

This creates a single loop: state → UI → event → ViewModel → new state → UI. I never mutate state directly from the UI layer. The benefit is predictability — I always know where state lives, how it changes, and what caused the change. Debugging is easier because I can trace any state change back to a specific event. Both MVVM with StateFlow and MVI follow this pattern.

> **🧠 Think about it:** If you allowed the UI to mutate state directly instead of sending events up, what would debugging look like when two different composables modify the same state field?

#### What is derivedStateOf and when should you use it?

`derivedStateOf` creates a state computed from other states. It only recomputes when its inputs change, and Compose only recomposes when the derived result changes. It's basically a computed property that's smart enough to know when it actually needs to recalculate.

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
