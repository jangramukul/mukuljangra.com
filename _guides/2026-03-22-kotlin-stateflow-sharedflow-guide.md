---
title: Kotlin StateFlow and SharedFlow Guide
layout: post
sequence: 116
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

When Google officially recommended `StateFlow` and `SharedFlow` over `LiveData` for new Android projects, a lot of developers — myself included — treated them as drop-in replacements. Swap `MutableLiveData` for `MutableStateFlow`, collect instead of observe, done. But that mental shortcut hides a fundamental design decision that trips up almost every team eventually: StateFlow and SharedFlow solve different problems, and using the wrong one creates bugs that are invisible in happy-path testing and only surface in production under real user behavior.

I've debugged enough of these to have strong opinions about when each one belongs. A ViewModel that uses `SharedFlow` for UI state will silently lose state on configuration changes. A ViewModel that uses `StateFlow` for one-time events will replay stale navigation actions when a new screen subscribes. Both compile fine. Both pass unit tests. Both break in production. The distinction isn't just academic — it's the difference between a robust reactive layer and a fragile one that works until it doesn't.

This guide covers what makes these two hot flows fundamentally different, when to use each, and the specific mistakes I see repeated across codebases.

## Cold vs Hot Flows

Understanding hot flows requires first understanding what cold flows do. A cold `Flow` is lazy — it doesn't produce values until someone collects it, and each collector gets its own independent execution of the producer block. If two collectors collect the same cold flow, the producer runs twice, completely independently. There's no sharing of data between them.

```kotlin
val coldFlow = flow {
    println("Producer started")
    emit(fetchLatestPrice())
}

// Each collection runs the producer independently
launch { coldFlow.collect { println("Collector A: $it") } }
launch { coldFlow.collect { println("Collector B: $it") } }
// Output: "Producer started" prints TWICE, each collector gets its own fetch
```

Hot flows are the opposite. They produce values regardless of whether anyone is collecting. Values are shared across all collectors. If three fragments are collecting the same `StateFlow`, they all receive the same emissions from a single source — the producer runs once, not three times. This is a critical efficiency difference in Android, where multiple UI components often need the same data.

`StateFlow` and `SharedFlow` are both hot flows, but they model fundamentally different things. StateFlow models a current value — what something *is* right now. SharedFlow models emissions — things that *happened*. That distinction drives every design decision about which to use where.

## StateFlow

StateFlow is a state holder that always has a value. You can read `.value` at any time, synchronously, without suspending. This is a property that cold flows and even `SharedFlow` with `replay = 0` don't have. There's always something there — the current state, right now, no waiting.

Under the hood, StateFlow is essentially a `SharedFlow` with `replay = 1`, `onBufferOverflow = BufferOverflow.DROP_OLDEST`, and built-in `distinctUntilChanged` behavior. But thinking of it that way misses the point. StateFlow is designed for a specific use case: holding and distributing the current state of something.

Two behaviors make it unique. First, **conflation** — StateFlow only cares about the latest value. If you emit five values before a collector processes the first one, the collector only sees the last value. Intermediate values are dropped. This is exactly what you want for UI state. If the user's name changed from "Alice" to "Bob" to "Charlie" while Compose was in the middle of recomposition, you only want to render "Charlie." The intermediate states don't matter.

Second, **equality-based deduplication**. StateFlow uses `equals()` to compare new emissions against the current value. If you emit the same value again, nothing happens — no notification, no recomposition, no wasted work. This is why using data classes for your UI state is important. If you rebuild the same `UiState(isLoading = false, items = listOf(...))` with identical content, `equals()` returns true and StateFlow suppresses the emission.

```kotlin
class TransactionViewModel(
    private val transactionRepository: TransactionRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TransactionUiState())
    val uiState: StateFlow<TransactionUiState> = _uiState.asStateFlow()

    fun loadTransactions() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            try {
                val transactions = transactionRepository.getRecent()
                _uiState.value = TransactionUiState(
                    isLoading = false,
                    transactions = transactions
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message
                )
            }
        }
    }
}

data class TransactionUiState(
    val isLoading: Boolean = false,
    val transactions: List<Transaction> = emptyList(),
    val error: String? = null
)
```

The pattern is straightforward: `MutableStateFlow` is private to the producer. The public-facing property is `StateFlow` (read-only), exposed via `.asStateFlow()`. This isn't just convention — `asStateFlow()` returns a read-only wrapper that prevents consumers from casting back to `MutableStateFlow` and mutating state from outside the ViewModel. I've seen that bug in production. Someone cast the exposed flow and called `.value =` directly from a Fragment. It compiled and worked, but it broke every assumption about unidirectional data flow.

When a new collector subscribes — say, after a configuration change — it immediately receives the current value. No re-fetching, no loading state flash, no blank screen. This is the single biggest practical advantage over `SharedFlow` for state management, and it's the reason LiveData worked so well for years. StateFlow preserves this behavior.

## SharedFlow

SharedFlow is a broadcast mechanism. It does not inherently have a "current value" — it has a replay cache, which may or may not contain past emissions depending on configuration. The default `MutableSharedFlow()` creates a flow with `replay = 0`, meaning new subscribers get nothing from the past. They only see emissions that happen *after* they start collecting.

This makes SharedFlow the right tool for events — things that happen once and shouldn't be replayed. A navigation command, a snackbar message, a toast trigger, an analytics event. These are not state. Showing a "Payment successful" snackbar is something that happened at a specific moment. If a new subscriber joins later, it should not see that event.

```kotlin
class PaymentViewModel(
    private val paymentRepository: PaymentRepository
) : ViewModel() {

    private val _events = MutableSharedFlow<PaymentEvent>()
    val events: SharedFlow<PaymentEvent> = _events.asSharedFlow()

    private val _uiState = MutableStateFlow(PaymentUiState())
    val uiState: StateFlow<PaymentUiState> = _uiState.asStateFlow()

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true) }
            try {
                paymentRepository.charge(amount)
                _uiState.update { it.copy(isProcessing = false) }
                _events.emit(PaymentEvent.Success("Payment of $$amount processed"))
            } catch (e: Exception) {
                _uiState.update { it.copy(isProcessing = false) }
                _events.emit(PaymentEvent.Error(e.message ?: "Payment failed"))
            }
        }
    }
}

sealed class PaymentEvent {
    data class Success(val message: String) : PaymentEvent()
    data class Error(val message: String) : PaymentEvent()
}
```

Notice the pattern: `StateFlow` holds the persistent UI state (loading indicator, form data), while `SharedFlow` carries the ephemeral events (success message, error notification). This dual approach is the pattern I use in every ViewModel that has both state and events. Some teams try to combine everything into a single sealed class in one StateFlow. That works until you need a one-time event, and then you're fighting the very conflation that makes StateFlow good at state management.

SharedFlow has configuration options that matter. `replay` controls how many past values new subscribers receive. `extraBufferCapacity` adds buffer space beyond the replay cache, which prevents `emit()` from suspending when collectors are slow. `onBufferOverflow` controls what happens when the buffer is full — suspend (default), drop the oldest value, or drop the newest.

For fire-and-forget events where you don't want `emit()` to ever suspend the producer, I use this configuration:

```kotlin
private val _events = MutableSharedFlow<UiEvent>(
    extraBufferCapacity = 1,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
)
```

This gives a single-slot buffer so `emit()` never suspends even if there's no active collector. In practice, if a ViewModel emits an event and no one is collecting — maybe the Fragment is in the background — the event sits in the buffer until someone collects, or gets replaced by a newer event. For navigation events and snackbars, dropping old events in favor of new ones is almost always the correct behavior.

## StateFlow vs SharedFlow

The confusion between these two usually shows up in code that's working 95% of the time and breaking in edge cases. Here's what each one is designed for:

**StateFlow** represents the current state of something. It always has a value, conflates intermediate updates, and deduplicates equal values. It's the right choice for anything that answers the question "what is the current X?" — current UI state, current user profile, current search query, current selection.

**SharedFlow** represents things that happened. It may or may not carry past values depending on replay configuration. It doesn't conflate and doesn't deduplicate. It's the right choice for anything that answers "what just happened?" — navigation events, error messages, analytics triggers, one-time user actions.

Here's what goes wrong when you swap them:

**Using SharedFlow for state** — You build your UI state as `MutableSharedFlow<UiState>(replay = 1)` because it "looks the same." It works until the user triggers the same state update with identical data. With StateFlow, `equals()` deduplication suppresses the emission. With SharedFlow, the value is emitted again, triggering unnecessary recomposition. You also lose `.value` synchronous access, so reading current state imperatively requires `first()`, which suspends.

**Using StateFlow for events** — You model navigation as `MutableStateFlow<NavigationEvent?>(null)`. User taps "confirm," you emit `NavigationEvent.GoToReceipt`, the collector navigates. User presses back, the Fragment re-subscribes, the current value is *still* `GoToReceipt`, the collector fires again — infinite navigation loop. The workaround of resetting to `null` after consumption introduces race conditions with multiple collectors and adds ceremony that SharedFlow eliminates entirely.

## update {} on MutableStateFlow

Direct assignment to `.value` on a `MutableStateFlow` is a read-modify-write operation that is not atomic. If two coroutines read `.value` at the same time, modify it, and write back, one update is lost. This is a race condition that's trivial to reproduce under concurrent state updates.

```kotlin
// Race condition — DON'T do this
private val _state = MutableStateFlow(CounterState(count = 0))

// Two coroutines running concurrently
launch { _state.value = _state.value.copy(count = _state.value.count + 1) }
launch { _state.value = _state.value.copy(count = _state.value.count + 1) }
// Expected count: 2, Actual count: could be 1
```

Both coroutines read `count = 0`, both compute `count = 1`, both write `count = 1`. One increment is lost. This doesn't happen often with `viewModelScope` because it uses `Dispatchers.Main.immediate` and coroutines run sequentially on the main thread. But the moment you involve `Dispatchers.Default`, `Dispatchers.IO`, or any multithreaded context, you're exposed.

The `update {}` function solves this with an internal compare-and-set loop. It reads the current value, applies your transformation, and attempts to write. If the value changed between the read and write (because another coroutine updated it), it retries the transformation with the new value. No mutex needed, no explicit synchronization.

```kotlin
// Thread-safe — use this
private val _state = MutableStateFlow(CounterState(count = 0))

launch { _state.update { it.copy(count = it.count + 1) } }
launch { _state.update { it.copy(count = it.count + 1) } }
// count is guaranteed to be 2
```

The `update` block receives the current value as `it` and returns the new value. If there's contention, the block may execute more than once, so keep it pure — no side effects inside `update {}`. Don't make network calls, don't write to databases, don't log analytics inside the update block. Just transform the state.

I use `update {}` for every state modification, even in ViewModels where everything runs on `Main`. It costs nothing — the compare-and-set on an uncontended state is essentially a single atomic operation — and it prevents an entire category of bugs if the threading model ever changes. That's cheap insurance.

## Common Mistakes

**Not using `update {}` for state modifications.** Developers write `_state.value = _state.value.copy(...)` everywhere, which works on `Dispatchers.Main` but breaks under concurrent access. When a screen has multiple async operations updating different parts of the state — loading data, receiving WebSocket updates, handling user input — direct assignment loses updates. Use `update {}` for every state modification, even on Main. It costs nothing and prevents an entire category of bugs.

**Using `SharedFlow(replay = 1)` instead of `StateFlow`.** You lose equality-based deduplication, so identical emissions trigger unnecessary collector work. You lose `.value` for synchronous access. You lose the guarantee that there's always a value — SharedFlow's replay cache starts empty until the first emission. If you want a value holder with a current value, that's StateFlow. If `SharedFlow(replay = 1)` seems tempting, ask yourself what you're gaining, because the answer is usually nothing.

**Emitting events from StateFlow.** The "nullable StateFlow" event pattern — `MutableStateFlow<Event?>(null)`, emit the event, then reset to `null` after consumption — is a code smell. It breaks when two collectors are active (both see the event, but only one resets it). It breaks when the collector is slow (the event is overwritten before consumption). It breaks when the Fragment re-subscribes (it sees the last event again if no one reset it yet). SharedFlow with `replay = 0` was designed for exactly this use case. Use it. If you're resetting a StateFlow to null after reading it, that's a signal you're modeling an event as state.

## Quiz

**Question 1.** You have a `MutableStateFlow<ProfileState>` and you emit a new `ProfileState` with the same data as the current value (all fields are equal by `equals()`). What happens?

**Wrong**: The new value is emitted and all collectors receive it, triggering recomposition in Compose.

**Correct**: Nothing happens. StateFlow uses equality-based conflation — it compares the new value against the current value using `equals()`. If they're equal, the emission is suppressed entirely. No collectors are notified, no recomposition triggers, no work is done. This is why using data classes (which generate `equals()` automatically) for your state is important. If you use a regular class without a proper `equals()`, every emission is treated as a new value, and you lose this optimization.

**Question 2.** You have a `MutableSharedFlow<NavEvent>()` with default parameters (replay = 0). The ViewModel emits `NavEvent.GoToSettings` while no Fragment is collecting. A Fragment starts collecting 200ms later. Does it receive the event?

**Wrong**: Yes, SharedFlow buffers events until a collector processes them.

**Correct**: No. With `replay = 0` and no extra buffer capacity, the event is lost. There was no active collector at the time of emission, and there's no replay cache to store it. If you need events to survive brief gaps in collection (like during configuration changes), either use `extraBufferCapacity = 1` to buffer one event, or ensure your collector is always active using `repeatOnLifecycle(Lifecycle.State.STARTED)` in the Fragment. But for most one-time events, a small buffer with `DROP_OLDEST` overflow is the pragmatic solution.

## Coding Challenge

Build a `ChatViewModel` with the following architecture: a `MutableStateFlow<ChatUiState>` that holds the current conversation state (message list, typing indicator, connection status), and a `MutableSharedFlow<ChatEvent>` that emits one-time events (message sent confirmation, error alerts, scroll-to-bottom triggers). Implement a `sendMessage(text: String)` function that uses `update {}` to add the message to the state's message list, then emits a `ChatEvent.ScrollToBottom` event. Add a `simulateConcurrentMessages()` function that launches 10 coroutines on `Dispatchers.Default`, each calling `update {}` to add a message, and verify that all 10 messages end up in the final state without any lost updates. Compare this to a version using direct `.value` assignment and observe the difference.

Thanks for reading!
