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

#### What is the difference between a cold flow and a hot flow?

A cold flow doesn't start emitting until a collector subscribes. Each collector gets its own independent execution — two collectors means the producer runs twice. A hot flow is active regardless of collectors. It emits whether there are zero or ten collectors, and multiple collectors share the same stream. `flow {}` creates a cold flow. `SharedFlow` and `StateFlow` are hot.

#### What is StateFlow and how does it differ from SharedFlow?

StateFlow always has a current value, requires an initial value, and uses `distinctUntilChanged` — it won't emit the same value twice in a row. It has a replay of 1 and built-in conflation. Designed for representing UI state.

SharedFlow is more configurable. It supports custom replay, buffer size, and overflow handling. It doesn't require an initial value and doesn't filter duplicate emissions.

Key differences:
- StateFlow always has a value (`.value`)
- StateFlow requires an initial value
- StateFlow filters consecutive duplicates
- SharedFlow is configurable for events and streams

#### What are MutableSharedFlow and MutableStateFlow?

`MutableSharedFlow` exposes `emit()` and `tryEmit()` for sending values. `MutableStateFlow` exposes a `value` property for reading and writing state. Keep the mutable version private and expose the read-only type to the UI.

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

#### When would you use SharedFlow instead of StateFlow?

Use StateFlow for state — UI state, loading status, selected item. Use SharedFlow for events that should be processed once — navigation commands, snackbar messages, error toasts.

StateFlow conflates values, so if you emit two navigation events quickly, the second might be lost. SharedFlow with `replay = 0` and `extraBufferCapacity = 1` handles one-shot events better.

#### What does the replay parameter in SharedFlow do?

`replay` determines how many previously emitted values a new collector receives when it starts. With `replay = 0`, new collectors only get values emitted after subscribing. With `replay = 1`, they immediately get the most recent value. StateFlow is a SharedFlow with `replay = 1` and `distinctUntilChanged`.

#### What is callbackFlow?

`callbackFlow` converts a multi-shot callback API into a cold Flow. It creates a channel internally and lets you send values from callbacks using `trySend()`. The `awaitClose` block is mandatory for cleanup.

```kotlin
fun locationUpdates(client: FusedLocationProviderClient): Flow<Location> =
    callbackFlow {
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { trySend(it) }
            }
        }
        client.requestLocationUpdates(locationRequest, callback, Looper.getMainLooper())
        awaitClose { client.removeLocationUpdates(callback) }
    }
```

#### What is channelFlow and how does it differ from callbackFlow?

`channelFlow` runs in a `ProducerScope` where you can launch multiple coroutines that send values concurrently. `callbackFlow` is for wrapping callback-based APIs. Both use channels under the hood, but `callbackFlow` enforces `awaitClose` for resource cleanup.

```kotlin
fun mergedResults(query: String): Flow<SearchResult> = channelFlow {
    launch { send(localDb.search(query)) }
    launch { send(remoteApi.search(query)) }
}
```

#### What are the SharingStarted strategies?

When converting cold to hot with `stateIn` or `shareIn`:

- **Eagerly** — Starts immediately, never stops. For data that should always be fresh.
- **Lazily** — Starts on first subscriber, never stops. Defers initial cost.
- **WhileSubscribed(stopTimeoutMillis)** — Starts on first subscriber, stops after last subscriber disappears (with timeout). `WhileSubscribed(5_000)` is the standard for ViewModels — survives configuration changes but stops when the user navigates away.

```kotlin
val uiState: StateFlow<HomeUiState> = repository.observeItems()
    .map { items -> HomeUiState(items = items) }
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState.Loading
    )
```

#### What is the difference between stateIn and shareIn?

`stateIn` converts a cold flow to `StateFlow`. Requires an initial value, gives `distinctUntilChanged` and `.value` access. `shareIn` converts to `SharedFlow`. No initial value required, supports configurable replay.

Use `stateIn` when downstream needs the current value at any time (UI state). Use `shareIn` for broadcasting events or replay greater than 1.

#### How do you safely collect flows in an Activity or Fragment?

Use `repeatOnLifecycle`. It starts collection when the lifecycle reaches the specified state and cancels when it drops below.

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

For multiple flows, launch separate coroutines inside `repeatOnLifecycle`.

#### What is flowWithLifecycle?

`flowWithLifecycle` is a Flow operator that emits values only when the lifecycle is at least in the specified state. Use it for a single flow — it reads cleaner as a chain. For multiple flows, `repeatOnLifecycle` with separate `launch` blocks is better.

```kotlin
viewLifecycleOwner.lifecycleScope.launch {
    viewModel.uiState
        .flowWithLifecycle(viewLifecycleOwner.lifecycle, Lifecycle.State.STARTED)
        .collect { state -> updateUi(state) }
}
```

#### What is collectAsStateWithLifecycle in Compose?

`collectAsStateWithLifecycle` is the Compose equivalent of `repeatOnLifecycle`. It collects a flow into Compose `State` while respecting the lifecycle. Collection stops when the lifecycle drops below the minimum active state.

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

This is the recommended way to collect flows in Compose — don't use `collectAsState()` because it doesn't stop collection in the background.

#### How does SharedFlow handle backpressure?

SharedFlow handles backpressure through its buffer configuration. The total buffer is `replay + extraBufferCapacity`. When full:

- **SUSPEND** (default) — `emit()` suspends until space is available.
- **DROP_OLDEST** — Drops oldest value. Emitter never suspends.
- **DROP_LATEST** — Drops the new value. Emitter never suspends.

`tryEmit()` is the non-suspending alternative. It returns `false` if the buffer is full and overflow is `SUSPEND`. With `DROP_OLDEST` or `DROP_LATEST`, `tryEmit()` always succeeds.

#### How does WhileSubscribed(5_000) survive configuration changes?

During a configuration change, the Activity is destroyed and recreated. The ViewModel survives, but the UI collector is cancelled. The 5-second timeout means `WhileSubscribed(5_000)` waits before stopping upstream collection. A configuration change takes under 1-2 seconds, so the new Activity resubscribes before the timeout. The upstream stays active and the new collector gets the current state immediately. With `WhileSubscribed(0)`, the upstream would stop and restart on every rotation.

#### How do you handle one-shot events like navigation using flows?

Use `SharedFlow` with `replay = 0` and `extraBufferCapacity = 1`. Each event is delivered without replaying on resubscription. StateFlow would replay the last event on configuration changes.

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

#### What is the difference between conflate() and collectLatest?

Both handle slow collectors differently. `conflate()` drops intermediate values — the collector always gets the latest available when it finishes processing. `collectLatest {}` cancels the previous collector's work when a new value arrives and restarts.

Use `conflate()` when processing is non-cancellable (database writes). Use `collectLatest` when processing is cancellable and you only care about the most recent result (search triggering a network call).

#### What converts a cold flow to hot when using stateIn inside a ViewModel?

`stateIn` starts a coroutine in the provided scope that collects the upstream cold flow and emits values to the StateFlow. The cold flow runs once in this shared coroutine, regardless of how many UI collectors subscribe. Without `stateIn`, three collectors would trigger three separate executions of the cold flow.

#### What is the subscriptionCount property on SharedFlow?

`subscriptionCount` is a `StateFlow<Int>` that tracks active collectors. `SharingStarted.WhileSubscribed()` uses it internally to decide when to start and stop collection. You can use it for custom logic like pausing a sensor stream when no one is subscribed.

#### Can you create a custom SharingStarted strategy?

Yes. `SharingStarted` is an interface with a `command(subscriptionCount: StateFlow<Int>): Flow<SharingCommand>` function. You return `START` and `STOP` commands based on subscription count. The built-in strategies are implementations of this interface.

### Common Follow-ups

- What happens if you call `emit()` on a MutableSharedFlow with no collectors and `replay = 0`?
- How do you collect multiple StateFlows in a single `repeatOnLifecycle` block?
- What is the difference between `collectAsState()` and `collectAsStateWithLifecycle()`?
- How does `combine()` work with StateFlows in a ViewModel?
- What happens to the StateFlow value during process death?
- How would you test a ViewModel that uses `stateIn` with `WhileSubscribed`?
- What is the difference between `launchIn` and `collect`?
