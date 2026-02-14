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

Think of a cold flow like a vending machine — it only works when you put in a coin. Nothing happens until a collector subscribes, and each collector gets its own independent execution. Two collectors? The producer runs twice.

A hot flow is more like a radio station. It broadcasts whether anyone is listening or not, and everyone tuned in hears the same thing. `flow {}` creates a cold flow. `SharedFlow` and `StateFlow` are hot.

#### What is StateFlow and how does it differ from SharedFlow?

StateFlow is opinionated. It always holds a current value, requires an initial value, and automatically applies `distinctUntilChanged` — so it won't emit the same value twice in a row. It has a fixed replay of 1 and built-in conflation. It's designed for one job: representing UI state.

SharedFlow is the flexible one. You get to configure replay, buffer size, and overflow handling yourself. It doesn't need an initial value and doesn't filter duplicate emissions. Key differences:

- StateFlow always has a value you can read with `.value`
- StateFlow requires an initial value
- StateFlow filters consecutive duplicates
- SharedFlow is configurable for events and streams

#### What are MutableSharedFlow and MutableStateFlow?

Here's the pattern: you keep the mutable version private and expose the read-only type to the UI. `MutableSharedFlow` gives you `emit()` and `tryEmit()` for sending values. `MutableStateFlow` gives you a `value` property you can read and write directly.

```kotlin
class SearchViewModel : ViewModel() {
    // Private mutable, public read-only — the standard pattern
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

StateFlow is for state — UI state, loading status, selected item. SharedFlow is for events that should be processed once — navigation commands, snackbar messages, error toasts.

Here's the thing — StateFlow conflates values. If you emit two navigation events quickly, the second one might get lost because StateFlow sees "same type of event" and skips it. SharedFlow with `replay = 0` and `extraBufferCapacity = 1` handles one-shot events the way you actually want.

> **🧠 Think about it:** If you used StateFlow to emit a "Show Error Toast" event, and the user triggered the same error twice in a row, what would happen the second time?

#### What does the replay parameter in SharedFlow do?

`replay` controls how many previously emitted values a new collector gets when it shows up late to the party. With `replay = 0`, you only get values emitted after you subscribe — miss it, it's gone. With `replay = 1`, you immediately get the most recent value, like catching a rerun.

Fun fact: StateFlow is basically a SharedFlow with `replay = 1` and `distinctUntilChanged` baked in.

#### What is callbackFlow?

`callbackFlow` is how you bridge the old callback world into the Flow world. It converts a multi-shot callback API into a cold Flow by creating a channel internally. You send values from callbacks using `trySend()`, and the `awaitClose` block is mandatory — that's where you clean up your callback registration.

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

`channelFlow` lets you launch multiple coroutines that send values concurrently into the same flow. It's like having multiple workers feeding items onto the same conveyor belt. `callbackFlow` is specifically for wrapping callback-based APIs. Both use channels under the hood, but `callbackFlow` enforces `awaitClose` for resource cleanup.

```kotlin
fun mergedResults(query: String): Flow<SearchResult> = channelFlow {
    launch { send(localDb.search(query)) }
    launch { send(remoteApi.search(query)) }
}
```

#### What are the SharingStarted strategies?

When you convert a cold flow to hot with `stateIn` or `shareIn`, you pick a strategy:

- **Eagerly** — Starts immediately, never stops. For data that should always be fresh.
- **Lazily** — Starts on first subscriber, never stops. Defers the initial cost until someone actually needs it.
- **WhileSubscribed(stopTimeoutMillis)** — Starts on first subscriber, stops after the last subscriber disappears (with a timeout). `WhileSubscribed(5_000)` is the go-to for ViewModels — it survives configuration changes but stops when the user navigates away.

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

`stateIn` converts a cold flow to `StateFlow` — you get `distinctUntilChanged`, `.value` access, but you need to provide an initial value. `shareIn` converts to `SharedFlow` — no initial value required, configurable replay.

Use `stateIn` when downstream needs the current value at any time, which is basically all UI state. Use `shareIn` for broadcasting events or when you need replay greater than 1.

#### How do you safely collect flows in an Activity or Fragment?

You use `repeatOnLifecycle`. It starts collection when the lifecycle reaches the specified state and cancels when it drops below. It's like a light switch tied to the lifecycle — on when STARTED, off when STOPPED.

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

`flowWithLifecycle` is a Flow operator that only emits values when the lifecycle is at least in the specified state. Use it when you have a single flow — it reads cleaner as a chain. For multiple flows, `repeatOnLifecycle` with separate `launch` blocks is the way to go.

```kotlin
viewLifecycleOwner.lifecycleScope.launch {
    viewModel.uiState
        .flowWithLifecycle(viewLifecycleOwner.lifecycle, Lifecycle.State.STARTED)
        .collect { state -> updateUi(state) }
}
```

> **🧠 Think about it:** If you used `lifecycleScope.launch` with a plain `collect` instead of `repeatOnLifecycle`, what would happen when the app goes to the background? Would the collector stop?

#### What is collectAsStateWithLifecycle in Compose?

This is the Compose equivalent of `repeatOnLifecycle`. It collects a flow into Compose `State` while respecting the lifecycle — collection stops when the lifecycle drops below the minimum active state.

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

Plot twist: don't use `collectAsState()` — it looks almost identical but it doesn't stop collection in the background. Your app keeps processing updates while sitting in the recents screen. `collectAsStateWithLifecycle` is the one you want.

#### How does SharedFlow handle backpressure?

SharedFlow handles backpressure through its buffer. The total buffer size is `replay + extraBufferCapacity`. When that buffer fills up, you have three options:

- **SUSPEND** (default) — `emit()` suspends until space opens up. Safe, but the emitter waits.
- **DROP_OLDEST** — Drops the oldest value in the buffer. Emitter never suspends.
- **DROP_LATEST** — Drops the new incoming value. Emitter never suspends.

`tryEmit()` is the non-suspending alternative — it returns `false` if the buffer is full and overflow is `SUSPEND`. With `DROP_OLDEST` or `DROP_LATEST`, `tryEmit()` always succeeds.

#### How does WhileSubscribed(5_000) survive configuration changes?

Here's what actually happens during a configuration change: the Activity gets destroyed and recreated, but the ViewModel survives. The UI collector gets cancelled when the old Activity dies. Now, `WhileSubscribed(5_000)` doesn't panic — it waits 5 seconds before stopping upstream collection.

A configuration change takes maybe 1-2 seconds. The new Activity resubscribes well before the timeout expires, so the upstream stays active and the new collector gets the current state immediately. With `WhileSubscribed(0)`, you'd stop and restart the upstream on every single rotation. That 5-second buffer is the whole trick.

#### How do you handle one-shot events like navigation using flows?

Use `SharedFlow` with `replay = 0` and `extraBufferCapacity = 1`. Each event gets delivered once and is gone — no replaying on resubscription. If you used StateFlow here, it would replay the last navigation event every time the screen rotates. That means navigating to the same screen again after a config change.

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

Both deal with slow collectors, but they solve it differently. `conflate()` drops intermediate values — when your collector finishes processing and looks up, it grabs the latest available value and skips everything in between. Think of it like checking your email after a meeting — you only read the latest one in each thread.

`collectLatest {}` is more aggressive. It cancels the previous collector's work when a new value arrives and restarts from scratch. Use `conflate()` when processing is non-cancellable like database writes. Use `collectLatest` when processing is cancellable and you only care about the most recent result, like a search triggering a network call.

> **🧠 Think about it:** If you're building a search-as-you-type feature that makes network calls, which one would you pick — `conflate()` or `collectLatest`? What would happen to in-flight requests with each approach?

#### What converts a cold flow to hot when using stateIn inside a ViewModel?

`stateIn` starts a coroutine in the provided scope that collects the upstream cold flow and emits values into the StateFlow. The cold flow runs once in this shared coroutine, no matter how many UI collectors subscribe downstream. Without `stateIn`, three collectors would trigger three separate executions of the cold flow — three database queries, three network calls, three times the work.

#### What is the subscriptionCount property on SharedFlow?

`subscriptionCount` is a `StateFlow<Int>` that tracks how many active collectors are currently subscribed. `SharingStarted.WhileSubscribed()` uses it internally to decide when to start and stop collection. You can also use it for custom logic — like pausing a sensor stream when no one is listening.

#### Can you create a custom SharingStarted strategy?

Yes. `SharingStarted` is an interface with a single function: `command(subscriptionCount: StateFlow<Int>): Flow<SharingCommand>`. You return `START` and `STOP` commands based on the subscription count. The built-in strategies — `Eagerly`, `Lazily`, `WhileSubscribed` — are just implementations of this interface. You could build your own that starts only when there are at least 2 subscribers, or one that keeps running for 30 seconds after the last subscriber leaves.

### Common Follow-ups

- What happens if you call `emit()` on a MutableSharedFlow with no collectors and `replay = 0`?
- How do you collect multiple StateFlows in a single `repeatOnLifecycle` block?
- What is the difference between `collectAsState()` and `collectAsStateWithLifecycle()`?
- How does `combine()` work with StateFlows in a ViewModel?
- What happens to the StateFlow value during process death?
- How would you test a ViewModel that uses `stateIn` with `WhileSubscribed`?
- What is the difference between `launchIn` and `collect`?
