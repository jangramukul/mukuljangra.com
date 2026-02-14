---
title: "Kotlin Flows — Hot Flows & Lifecycle"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 15
sequence: 15
description: "Hot flows are one of the most asked topics in Android interviews."
---

## Kotlin Flows — Hot Flows & Lifecycle

Hot flows are one of the most asked topics in Android interviews. This covers SharedFlow, StateFlow, converting cold flows to hot, lifecycle-aware collection, and how all of it fits together in a real Android app.

### Core Questions

#### Q1: What is the difference between a cold flow and a hot flow?

A cold flow doesn't start emitting values until a collector subscribes to it. Each collector gets its own independent execution of the flow — if two collectors subscribe, the producer runs twice. A hot flow is active regardless of whether anyone is collecting. It emits values whether there are zero or ten collectors, and multiple collectors share the same stream of data. The `flow {}` builder creates a cold flow. `SharedFlow` and `StateFlow` are hot flows.

#### Q2: What is SharedFlow?

SharedFlow is a type of Flow that allows multiple collectors to subscribe to it. Unlike a cold flow where each collector triggers its own emission, SharedFlow broadcasts values to all active collectors simultaneously. It supports configurable replay (how many past values a new collector receives), buffer size, and overflow handling. SharedFlow does not have an initial value — if you need one, use StateFlow instead.

```kotlin
val events = MutableSharedFlow<UiEvent>(
    replay = 0,
    extraBufferCapacity = 1,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
)

// Emit from anywhere
suspend fun onButtonClick() {
    events.emit(UiEvent.NavigateToDetail)
}
```

#### Q3: What is StateFlow, and how does it differ from SharedFlow?

StateFlow is a special type of SharedFlow that only emits the most recent value to new collectors. It always has a value (requires an initial value), and it uses `distinctUntilChanged` semantics — it won't emit the same value twice in a row. StateFlow has a replay of 1 and a buffer size of 0 internally. It is designed for representing state — things like UI state in a ViewModel.

Key differences from SharedFlow:
- Always has a current value (accessible via `.value`)
- Requires an initial value
- Replay is always 1
- Filters duplicate consecutive emissions
- Conflation is built in — slow collectors always get the latest state

#### Q4: What are MutableSharedFlow and MutableStateFlow?

`MutableSharedFlow` is the mutable version of `SharedFlow`. It exposes `emit()` and `tryEmit()` for sending values. You typically keep the mutable version private in a ViewModel and expose the read-only `SharedFlow` type to the UI.

`MutableStateFlow` is the mutable version of `StateFlow`. It exposes a `value` property for both reading and writing state. Same pattern — keep it private and expose `StateFlow`.

```kotlin
class SearchViewModel : ViewModel() {
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _events = MutableSharedFlow<SearchEvent>()
    val events: SharedFlow<SearchEvent> = _events.asSharedFlow()

    fun onQueryChanged(text: String) {
        _query.value = text
    }
}
```

#### Q5: When would you use SharedFlow instead of StateFlow?

Use StateFlow when you need to represent the current state of something — like UI state, loading status, or a selected item. Use SharedFlow when you need to emit events that should be processed once — like navigation commands, snackbar messages, or error toasts. StateFlow conflates values, so if you emit two navigation events quickly, the second one might be lost. SharedFlow with `replay = 0` and `extraBufferCapacity = 1` handles one-shot events better because it doesn't conflate.

#### Q6: What is callbackFlow?

`callbackFlow` converts a multi-shot callback API into a cold Flow. It creates a channel internally and lets you send values from callback methods using `trySend()` or `trySendBlocking()`. The `awaitClose` block at the end is mandatory — it suspends until the flow is cancelled and gives you a place to unregister the callback.

```kotlin
fun locationUpdates(client: FusedLocationProviderClient): Flow<Location> =
    callbackFlow {
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { trySend(it) }
            }
        }
        client.requestLocationUpdates(
            locationRequest, callback, Looper.getMainLooper()
        )
        awaitClose { client.removeLocationUpdates(callback) }
    }
```

#### Q7: What is channelFlow and how does it differ from callbackFlow?

`channelFlow` is a flow builder that runs in a `ProducerScope`, giving you access to `send()` and the underlying channel. The difference from `callbackFlow` is intent — `channelFlow` is for coroutine-based producers where you want to launch multiple coroutines that send values concurrently. `callbackFlow` is specifically designed for wrapping callback-based APIs. Both use channels under the hood, but `callbackFlow` enforces `awaitClose` because you're dealing with external resources that need cleanup.

```kotlin
fun mergedResults(query: String): Flow<SearchResult> = channelFlow {
    launch { send(localDb.search(query)) }
    launch { send(remoteApi.search(query)) }
}
```

#### Q8: What does the replay parameter in SharedFlow do?

The `replay` parameter determines how many previously emitted values a new collector receives when it starts collecting. With `replay = 0`, new collectors only get values emitted after they subscribe. With `replay = 1`, they immediately get the most recent value. With `replay = 3`, they get the last three values. StateFlow is essentially a SharedFlow with `replay = 1` and `distinctUntilChanged`. Setting a higher replay is useful for scenarios like caching recent events.

### Deep Dive Questions

#### Q9: What are the SharingStarted strategies and when do you use each?

When converting a cold flow to a hot flow using `stateIn` or `shareIn`, you specify when sharing starts and stops:

- **SharingStarted.Eagerly** — starts immediately when the flow is created and never stops. The upstream flow stays active for the entire lifetime of the scope. Use this for data that should always be fresh, like a database observer in a singleton repository.
- **SharingStarted.Lazily** — starts when the first subscriber appears and never stops. Similar to Eagerly but defers the initial cost. Use when you want lazy initialization but don't need to stop collection.
- **SharingStarted.WhileSubscribed(stopTimeoutMillis)** — starts when the first subscriber appears and stops after the last subscriber disappears, waiting for the specified timeout. `WhileSubscribed(5_000)` is the standard choice for ViewModels because it survives configuration changes (which take less than 5 seconds) but stops collection when the user navigates away.

```kotlin
val uiState: StateFlow<HomeUiState> = repository.observeItems()
    .map { items -> HomeUiState(items = items) }
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState.Loading
    )
```

#### Q10: What is the difference between stateIn and shareIn?

`stateIn` converts a cold flow into a `StateFlow`. It requires an initial value and gives you `distinctUntilChanged` semantics and a `.value` property. `shareIn` converts a cold flow into a `SharedFlow`. It doesn't require an initial value and supports configurable replay.

Use `stateIn` when the downstream needs to read the current value at any time (like UI state). Use `shareIn` when you need to broadcast events or when you want a replay greater than 1. Both take a `CoroutineScope` and a `SharingStarted` strategy. The scope determines the lifetime — when the scope is cancelled, the upstream collection stops.

#### Q11: How do you safely collect flows in an Android Activity or Fragment?

The standard approach is `repeatOnLifecycle`. It starts collection when the lifecycle reaches the specified state and cancels it when it drops below. This prevents collecting flows when the app is in the background, which could cause crashes from updating views after `onStop`.

```kotlin
class HomeFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    updateUi(state)
                }
            }
        }
    }
}
```

If you need to collect multiple flows, launch separate coroutines inside the `repeatOnLifecycle` block. Each one will be independently started and cancelled with the lifecycle.

#### Q12: What is flowWithLifecycle and when would you use it over repeatOnLifecycle?

`flowWithLifecycle` is a Flow operator that emits values only when the lifecycle is at least in the specified state. It wraps `repeatOnLifecycle` internally. Use it when you have a single flow to collect — it reads cleaner as a chain. For multiple flows, `repeatOnLifecycle` with separate `launch` blocks is better because `flowWithLifecycle` creates a new coroutine internally for each flow.

```kotlin
viewLifecycleOwner.lifecycleScope.launch {
    viewModel.uiState
        .flowWithLifecycle(viewLifecycleOwner.lifecycle, Lifecycle.State.STARTED)
        .collect { state -> updateUi(state) }
}
```

#### Q13: What is collectAsStateWithLifecycle in Jetpack Compose?

`collectAsStateWithLifecycle` is the Compose equivalent of `repeatOnLifecycle`. It collects a flow and converts it into Compose `State` while respecting the lifecycle. When the lifecycle drops below the minimum active state (default is `STARTED`), collection stops. When it comes back, collection restarts. This prevents unnecessary recompositions and background work when the app is not visible.

```kotlin
@Composable
fun HomeScreen(viewModel: HomeViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    when (uiState) {
        is HomeUiState.Loading -> LoadingIndicator()
        is HomeUiState.Success -> ItemList(uiState.items)
    }
}
```

You can pass a custom `minActiveState` if you need collection in `RESUMED` instead of `STARTED`. This is the recommended way to collect flows in Compose — don't use `collectAsState()` because it doesn't stop collection when the app goes to the background.

#### Q14: How does SharedFlow handle backpressure?

SharedFlow handles backpressure through its buffer configuration. The total buffer is `replay + extraBufferCapacity`. When the buffer is full, the behavior depends on `onBufferOverflow`:

- **BufferOverflow.SUSPEND** (default) — `emit()` suspends until buffer has space. This is the safest option but can slow down the emitter.
- **BufferOverflow.DROP_OLDEST** — drops the oldest value in the buffer to make room. The emitter never suspends. Good for real-time data where only the latest values matter.
- **BufferOverflow.DROP_LATEST** — drops the new value being emitted. The emitter never suspends. Less common but useful when you want to preserve older data.

`tryEmit()` is the non-suspending alternative to `emit()`. It returns `false` if the buffer is full and `onBufferOverflow` is `SUSPEND`. With `DROP_OLDEST` or `DROP_LATEST`, `tryEmit()` always succeeds.

#### Q15: What is the subscriptionCount property on SharedFlow?

`subscriptionCount` is a `StateFlow<Int>` that tracks the number of active collectors. It is useful for knowing whether anyone is listening — for example, stopping an expensive data source when no one is subscribed. The `SharingStarted.WhileSubscribed()` strategy internally uses `subscriptionCount` to decide when to start and stop collection. You can use it directly for custom logic, like pausing a sensor stream when the collector count drops to zero.

#### Q16: How does WhileSubscribed(5_000) survive configuration changes?

During a configuration change, the Activity or Fragment is destroyed and recreated. The ViewModel survives, but the UI collector is cancelled when the view is destroyed. The key is the 5-second timeout — after the last subscriber disappears, `WhileSubscribed(5_000)` waits 5 seconds before stopping the upstream collection. A configuration change typically completes in under 1-2 seconds, so the new Activity or Fragment resubscribes before the timeout expires. The upstream flow stays active, and the new collector immediately gets the current state from the `StateFlow`. If you used `WhileSubscribed(0)`, the upstream would stop instantly and restart on resubscription, which means a new network call or database query on every rotation.

#### Q17: What happens when you convert a cold flow to hot using stateIn inside a ViewModel?

When you call `stateIn` on a cold flow, it starts a new coroutine in the provided scope that collects the upstream cold flow and emits values to the downstream `StateFlow`. The cold flow runs once in this shared coroutine, regardless of how many UI collectors subscribe. Without `stateIn`, each collector would trigger its own execution of the cold flow — three collectors means three network calls. With `stateIn`, one network call feeds all collectors. The `initialValue` is what collectors see before the first upstream emission arrives.

#### Q18: How would you handle one-shot events like navigation or showing a Snackbar using flows?

Use `SharedFlow` with `replay = 0` and `extraBufferCapacity = 1`. This ensures each event is delivered to collectors without being replayed on resubscription. With `StateFlow`, the event would replay on configuration changes because StateFlow always replays the last value.

```kotlin
class CartViewModel : ViewModel() {
    private val _events = MutableSharedFlow<CartEvent>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val events: SharedFlow<CartEvent> = _events.asSharedFlow()

    fun onCheckout() {
        viewModelScope.launch {
            val result = repository.checkout()
            if (result.isSuccess) {
                _events.emit(CartEvent.NavigateToConfirmation)
            }
        }
    }
}
```

The `DROP_OLDEST` overflow strategy with `extraBufferCapacity = 1` ensures `tryEmit()` always succeeds, which is important when emitting from non-suspending contexts.

#### Q19: What is the difference between conflate() and collectLatest {} when dealing with slow collectors?

Both handle the situation where the collector is slower than the emitter, but they work differently. `conflate()` keeps emitting and drops intermediate values — the collector always gets the latest available value when it finishes processing the current one. `collectLatest {}` cancels the previous collector's work when a new value arrives and restarts collection with the new value. Use `conflate()` when processing is non-cancellable (like database writes). Use `collectLatest` when processing is cancellable and you only care about the most recent result (like a search query that triggers a network call).

#### Q20: Can you create a custom SharingStarted strategy?

Yes. `SharingStarted` is an interface with a single function `command(subscriptionCount: StateFlow<Int>): Flow<SharingCommand>`. You return a flow of `SharingCommand.START` and `SharingCommand.STOP` based on the subscription count. The built-in strategies like `WhileSubscribed` are implementations of this interface. A custom strategy could start sharing only when the subscription count reaches a threshold, or implement a custom timeout logic.

### Common Follow-ups

- What happens if you call `emit()` on a `MutableSharedFlow` with no collectors and `replay = 0`?
- How do you collect multiple StateFlows in a single `repeatOnLifecycle` block?
- What is the difference between `collectAsState()` and `collectAsStateWithLifecycle()` in Compose?
- How does `combine()` work with StateFlows in a ViewModel?
- What happens to the StateFlow value during process death?
- How would you test a ViewModel that uses `stateIn` with `WhileSubscribed`?
- Why is `Dispatchers.Main.immediate` important when collecting flows in the UI?
- What is the difference between `launchIn` and `collect` for subscribing to a flow?
