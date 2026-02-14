---
title: ViewModel Events as State Are an Antipattern
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Kotlin Coroutines
---

I once shipped a bug where users saw the same error snackbar every time they rotated their phone. The flow was simple: user taps a button, network call fails, snackbar shows "Something went wrong." Sounds harmless, right? But on configuration change, the screen recomposed, collected the same `UiState` with `showError = true`, and showed the snackbar again. And again. Every rotation, every process recreation — the ghost of an error that already happened kept haunting the UI.

Think of it like a sticky note on your fridge that says "milk expired." You read it, you threw out the milk. But every time you open the fridge, the note is still there, yelling at you about milk that's been gone for days. That's what modeling one-time events as state feels like.

This is the one-time events problem, and it's one of the most debated topics in Android architecture. Google's official guidance says "model everything as state." Manuel Vivo wrote an extensive article explaining why events should be state. But the community pushed back hard, and for good reason — the advice works for some types of events and falls apart for others. After dealing with this in multiple production apps, I think the "everything is state" position is technically elegant but practically incomplete. To understand why, we need to look at how the Android community got here in the first place.

## A Brief History of Event Handling on Android

Android developers have been fighting this problem for over a decade. Before architecture components existed, the dominant approach was the **EventBus** pattern — libraries like greenrobot's EventBus and Square's Otto. The idea was simple: post an event to a global bus, and any registered subscriber would receive it. Need to tell an Activity that a background download finished? Just post a `DownloadCompleteEvent` and let whoever's listening handle it. It felt magical at first, and almost every production app in 2014-2016 had an EventBus dependency.

Imagine a crowded room where anyone can shout a message and anyone else can listen. Sounds flexible? Sure. Now imagine 50 people shouting at once with no way to know who heard what.

That's exactly what happened. EventBus created a nightmare. Events were untyped in practice — you'd search the codebase for `@Subscribe` annotations and have no idea which components were listening or in what order. There was no compile-time safety. Memory leaks were rampant because developers forgot to unregister in `onStop`. Worst of all, debugging was nearly impossible. When something went wrong, you couldn't trace the flow from sender to receiver — you just had events flying across the app with no clear ownership. The lesson the community took away from EventBus was clear: **global, decoupled event systems sound great in theory but become untraceable spaghetti in practice**.

Then came Architecture Components and `LiveData`. Google introduced **SingleLiveEvent** — a `LiveData` subclass that only delivered its value once. It solved the duplicate-snackbar problem by wrapping the value in a consumed flag internally. But SingleLiveEvent had its own issues. It only supported a single observer, which broke in multi-fragment setups. The implementation was hacky — a boolean flag inside an `observe` override. And Google themselves eventually deprecated the pattern in their samples, acknowledging it wasn't a real solution. The community moved to `Channel` and `SharedFlow` instead, but the core problem — how do you handle one-time events in a lifecycle-aware way — was never cleanly solved. That tension is still with us today.

## The Problem With Events as State

The core idea behind Google's guidance is simple: UI state should be a single source of truth. If your `UiState` data class has all the information the UI needs to render, then the UI is just a function of state. Clean, predictable, easy to test. No race conditions, no missed events.

Sounds great on paper. So where does it break?

The problem shows up the moment you have something that should happen exactly once. A snackbar. A toast. A navigation action. These aren't ongoing states — they're events. Something happened, the user should see it, and then it's done. But if you model them as state, they persist across configuration changes because `StateFlow` replays the latest value to new collectors.

```kotlin
data class LoginUiState(
    val email: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,  // this is the problem
    val navigateToHome: Boolean = false // and this
)
```

Can you see the trap? When the screen recomposes after a rotation, `errorMessage` is still "Invalid credentials" and `navigateToHome` is still `true`. The error shows again. The navigation fires again. Now you need a "consumed" mechanism to mark events as handled.

It's like a doorbell that keeps ringing because the button is stuck. The visitor arrived ages ago — you already opened the door — but the bell doesn't know that.

## The Consumed Flag Approach (And Why It's Ugly)

The most common workaround is adding a callback to mark the event as consumed:

```kotlin
data class LoginUiState(
    val email: String = "",
    val isLoading: Boolean = false,
    val userMessage: UserMessage? = null,
    val navigateToHome: Boolean = false
)

class LoginViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onLogin(email: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val result = loginRepository.login(email, password)
            _uiState.update {
                when (result) {
                    is Success -> it.copy(
                        isLoading = false,
                        navigateToHome = true
                    )
                    is Failure -> it.copy(
                        isLoading = false,
                        userMessage = UserMessage(result.error)
                    )
                }
            }
        }
    }

    fun onMessageShown() {
        _uiState.update { it.copy(userMessage = null) }
    }

    fun onNavigated() {
        _uiState.update { it.copy(navigateToHome = false) }
    }
}
```

This works, but take a step back and look at what you've built. You have event fields in your state that are only meaningful for a single frame. You have `onMessageShown()` and `onNavigated()` functions whose entire purpose is cleanup — digital janitors mopping up after a party that already ended. The UI must remember to call these at the right time — forget the `onNavigated()` call and the user gets stuck in a navigation loop. And your `UiState` is a mix of two fundamentally different things: actual persistent state (email, isLoading) and transient events (userMessage, navigateToHome) pretending to be state.

> **🧠 Think about it:** If your state class has fields that only matter for one frame and immediately need to be "reset," are those really *state*? Or are you just cramming an event into a state-shaped box because someone told you to?

The consumed flag pattern also creates subtle ordering issues. If two events happen in quick succession, the first one might get consumed before the UI can show it. Or worse, the consumption callback might trigger a recomposition that re-evaluates the event before it's been fully processed. I've seen production code where `LaunchedEffect` and `onMessageShown` race against each other, producing flickering snackbars.

## Channel: Reliable Delivery, Lifecycle Questions

The first alternative people reach for is a `Channel`. Channels are designed for exactly this — sending values that are consumed exactly once:

```kotlin
class LoginViewModel : ViewModel() {
    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events: Flow<LoginEvent> = _events.receiveAsFlow()

    sealed interface LoginEvent {
        data class ShowError(val message: String) : LoginEvent
        data object NavigateToHome : LoginEvent
    }

    fun onLogin(email: String, password: String) {
        viewModelScope.launch {
            val result = loginRepository.login(email, password)
            when (result) {
                is Success -> _events.send(LoginEvent.NavigateToHome)
                is Failure -> _events.send(LoginEvent.ShowError(result.error))
            }
        }
    }
}
```

Channels guarantee that each event is received exactly once — no duplicate snackbars on rotation. The `BUFFERED` capacity (defaults to 64 elements) means events are queued if the UI isn't collecting yet. Think of it like a mailbox: the letter goes in, someone picks it up, and it's gone. No replays, no duplicates.

But here's the catch: `Channel.receiveAsFlow()` doesn't know about Android lifecycle. If you collect it in a composable using `LaunchedEffect`, the collector dies when the composable leaves composition. If an event is sent while the UI is in the background, the channel buffers it and delivers it when the collector comes back — which is usually what you want, but not always. You might not want a stale navigation event firing 30 seconds after the user already moved on.

Now here's where it gets interesting — the **buffer overflow strategy** matters more than people realize. `Channel.BUFFERED` uses `BufferOverflow.SUSPEND` — if the buffer fills up, `send()` suspends until the consumer catches up. That's safe but can stall your ViewModel coroutine. `Channel.UNLIMITED` never suspends but can eat memory if the consumer is gone for a long time. `Channel(capacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)` keeps only the latest event, which works for things like scroll-to-position but is wrong for snackbars where you want every message delivered. There's no one-size-fits-all here — the right buffer strategy depends on the specific event type.

Google explicitly advises against this pattern. Their documentation says Channels shouldn't be used for events because they lack lifecycle awareness and can drop events if the consumer is too slow. IMO, that argument is a bit overstated — with `BUFFERED` capacity, you're unlikely to drop events in normal use. But the lifecycle concern is legitimate.

## SharedFlow: The Tricky Middle Ground

`SharedFlow` seems like it should solve this cleanly. Set `replay = 0` and events won't be replayed on new subscribers:

```kotlin
class LoginViewModel : ViewModel() {
    private val _events = MutableSharedFlow<LoginEvent>()
    val events: SharedFlow<LoginEvent> = _events.asSharedFlow()

    fun onLogin(email: String, password: String) {
        viewModelScope.launch {
            val result = loginRepository.login(email, password)
            when (result) {
                is Success -> _events.emit(LoginEvent.NavigateToHome)
                is Failure -> _events.emit(LoginEvent.ShowError(result.error))
            }
        }
    }
}
```

Looks clean. Feels right. What could go wrong?

A lot, actually. `SharedFlow` with `replay = 0` has a critical problem: if there are no active collectors when the event is emitted, **the event is lost forever**. During a configuration change, there's a brief window where the old collector is destroyed and the new one hasn't started yet. Any event emitted during that window vanishes silently. No error, no warning, just a user who tapped "Login," the login succeeded, and nothing happened. I've debugged this exact issue — it was one of those "works on my device" bugs because the timing window is tiny on fast phones but wide enough on slower hardware.

It's like shouting something important into a room right at the moment when everyone stepped out. You said it, nobody heard it, and there's no record it ever happened.

You can add `extraBufferCapacity` to `MutableSharedFlow(extraBufferCapacity = 1)`, which buffers one event when no collectors are active. But this only delays the problem — if two events fire before a collector reattaches, the first one is still dropped depending on your `onBufferOverflow` policy. And unlike `Channel`, `SharedFlow` delivers to **all** active collectors, not just one. If you accidentally have two fragments collecting the same event flow, both will handle the event — double navigation, double snackbar. `Channel.receiveAsFlow()` is fan-out (one consumer gets each event), while `SharedFlow` is fan-in/multicast (every collector gets every event). This distinction is subtle but it'll bite you in multi-fragment or split-screen scenarios.

> **🔥 Real talk:** I once spent half a day debugging a "double navigation" issue in a split-screen setup. Turned out two fragments were collecting the same `SharedFlow`. The `Channel` version would have delivered the event to only one of them. This fan-out vs multicast distinction sounds academic until it costs you an afternoon.

You might think `SharingStarted.WhileSubscribed()` helps during config changes, but that prevents an upstream cold flow from restarting — a `MutableSharedFlow` has no upstream. The event is either collected when it's emitted or it's gone.

## Consuming Events in Compose

With Jetpack Compose, event consumption gets its own set of challenges. The common pattern is collecting the event flow inside a `LaunchedEffect`:

```kotlin
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is LoginEvent.ShowError -> {
                    snackbarHostState.showSnackbar(event.message)
                }
                is LoginEvent.NavigateToHome -> {
                    // navigate
                }
            }
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) {
        // screen content using uiState
    }
}
```

This works, but `LaunchedEffect(Unit)` ties the collection to the composable's lifecycle. When the composable leaves composition (during a config change, or when navigating away), the coroutine is cancelled. Here's the sneaky part: the event might be pulled from the Channel but the `when` block never finishes executing — so the event is consumed but not handled. It's like pulling a ticket from the queue, reading the first line, and then the paper catches fire before you finish reading it. The event is gone from the Channel, but the action never happened. That's a subtle loss scenario specific to Compose.

A more robust pattern that's gained traction in the community is the **ObserveAsEvents** helper — a reusable composable function that collects a flow with lifecycle awareness:

```kotlin
@Composable
fun <T> ObserveAsEvents(
    flow: Flow<T>,
    lifecycleOwner: LifecycleOwner = LocalLifecycleOwner.current,
    onEvent: (T) -> Unit
) {
    val currentOnEvent by rememberUpdatedState(onEvent)
    LaunchedEffect(flow, lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
            flow.collect { currentOnEvent(it) }
        }
    }
}
```

The key detail is `repeatOnLifecycle(Lifecycle.State.STARTED)`. This only collects events when the lifecycle is at least STARTED — so events sent while the app is in the background are buffered by the Channel and delivered when the user comes back to the foreground. `rememberUpdatedState` ensures the lambda always has the latest callback reference without restarting the collection. This pattern is essentially what Philipp Lackner, Manuel Vivo, and several other Android developers have converged on independently, and I think it's the cleanest Compose-side solution right now.

> **💡 The "aha" moment:** `repeatOnLifecycle` doesn't just start collection once — it starts and stops it as the lifecycle moves between STARTED and STOPPED. Meanwhile, the Channel quietly buffers events during the gap. That combo is what gives you reliable, lifecycle-aware, exactly-once delivery.

## Event vs State: A Decision Framework

After going through all of these approaches, here's where I landed: **the reason this problem is so hard is that "event" conflates two fundamentally different things**.

Here's the mental shortcut I use, and it's surprisingly reliable. Ask yourself one question: *what would annoy the user more after a configuration change?*

**It's state** if the user would be confused when the action doesn't happen after a config change — navigation destination, authentication status, selected tab, form validation errors, dialog visibility, bottom sheet expansion. All of these describe *where the user is* or *what they're looking at*, and that must survive rotation. **It's an event** if the user would be annoyed when the action happens twice after a config change — snackbar messages, toast notifications, scroll-to-position commands, analytics triggers, haptic feedback, one-shot animations. These describe *something that happened*, not something that *is*.

There are genuinely ambiguous cases too — and you'll hit them. An error message could be either. If it's a validation error that should persist while the user fixes their input, it's state. If it's a network error snackbar that says "check your connection," it's an event. A dialog confirmation could be state (the dialog should survive rotation) or an event (the confirmation result triggers a one-time action). The answer isn't about the UI element — it's about whether the information has ongoing relevance or is consumed once.

> **⚡ Quick check:** Your ViewModel needs to tell the UI to show a "Payment successful" snackbar. Is that state or an event? If the user rotates the phone after seeing it, should they see it again? No? Then it's an event. If it showed up twice, they'd think they were charged twice. That's worse than not seeing it at all.

## Production Patterns: MVVM and MVI

The dual-channel approach I prefer — `StateFlow` for state, `Channel` for events — works well in standard MVVM. But MVI architectures handle this differently, and it's worth understanding how.

In a pure MVI setup with a **reducer pattern**, side effects are typically separated from state reduction. Libraries like **Orbit MVI** make this explicit with their `intent` and `postSideEffect` separation:

```kotlin
class LoginViewModel : ContainerHost<LoginState, LoginSideEffect>,
    ViewModel() {

    override val container = container<LoginState, LoginSideEffect>(
        LoginState()
    )

    fun onLogin(email: String, password: String) = intent {
        reduce { state.copy(isLoading = true) }
        val result = loginRepository.login(email, password)
        when (result) {
            is Success -> {
                reduce { state.copy(isLoading = false) }
                postSideEffect(LoginSideEffect.NavigateToHome)
            }
            is Failure -> {
                reduce { state.copy(isLoading = false) }
                postSideEffect(
                    LoginSideEffect.ShowError(result.error)
                )
            }
        }
    }
}
```

Orbit internally uses a `Channel` for side effects, which is exactly what I'd do manually. The nice thing is that the framework enforces the separation — you literally can't put a side effect into state or vice versa. It's like having two different mailboxes on your house: one for bills (persistent, you need to deal with them), one for flyers (read once and toss). You'd never accidentally file a flyer in your tax folder.

**Circuit** by Slack takes a different approach entirely. It models everything through a `Presenter` that emits state, and events are handled through lambda callbacks passed down from the parent circuit. There's no separate event channel because navigation and side effects are managed at the circuit level, not inside individual presenters. It's opinionated, but it sidesteps the whole problem by pushing event handling up the composition tree.

The common thread across all these approaches is the same: state and events are different things, and trying to force them into one mechanism creates friction.

## Where Google's Guidance Gets It Right

I don't want to dismiss Google's position entirely because the core insight is sound. The idea that UI should be a function of state — that your composable takes a `UiState` and renders it deterministically — is a powerful simplification. It makes testing trivial, makes previews work, and eliminates a whole class of bugs where the UI gets out of sync with the data layer.

For navigation specifically, I think the state-based approach is correct. Navigation state should survive configuration changes. If you model "navigate to home" as an event that fires once and gets lost during a rotation, the user ends up stuck on the login screen after a successful login. That's worse than navigating twice. Libraries like Jetpack Navigation already model the back stack as state under the hood — it persists across configuration changes because it IS persistent state.

The mistake is applying this principle universally. Manuel Vivo's article makes a strong case for state-driven architecture, and it works well for Google's recommended architecture with a single `UiState` class. But in practice, forcing every transient notification into the state model creates the consumed-flag ceremony I showed earlier, and that ceremony is both error-prone and hard to maintain.

## My Rule of Thumb

After shipping enough apps with both approaches, here's the approach I've settled on. Separate state and events explicitly:

```kotlin
class OrderViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(OrderUiState())
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()

    private val _events = Channel<OrderEvent>(Channel.BUFFERED)
    val events: Flow<OrderEvent> = _events.receiveAsFlow()

    data class OrderUiState(
        val items: List<OrderItem> = emptyList(),
        val isLoading: Boolean = false,
        val selectedTab: Tab = Tab.PENDING
    )

    sealed interface OrderEvent {
        data class ShowSnackbar(val message: String) : OrderEvent
        data object ScrollToTop : OrderEvent
    }

    fun placeOrder(item: OrderItem) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val result = repository.placeOrder(item)
            _uiState.update { it.copy(isLoading = false) }
            when (result) {
                is Success -> _events.send(
                    OrderEvent.ShowSnackbar("Order placed")
                )
                is Failure -> _events.send(
                    OrderEvent.ShowSnackbar(result.error)
                )
            }
        }
    }
}
```

Two pipes. One for things that stick around (`StateFlow`), one for things that happen once and are done (`Channel`). State survives configuration changes and is always consistent. Events are consumed once, and if one gets lost during a config change, it's not catastrophic — missing a snackbar is far less bad than showing it twice or navigating twice.

The mental model is about user expectations, not architectural purity. Navigation, authentication status, selected tab, form validation state — these are all state. Snackbars, toasts, scroll-to-top commands, analytics triggers — these are all events. The "everything is state" position optimizes for consistency and testability, which are real engineering values. But real apps have transient interactions that don't fit that model cleanly, and pretending they do just moves the complexity into consumed flags and cleanup callbacks. Sometimes the pragmatic answer is to have two channels of communication — one for persistent state, one for ephemeral events — and be intentional about which category each piece of information belongs to.

Thanks for reading!
