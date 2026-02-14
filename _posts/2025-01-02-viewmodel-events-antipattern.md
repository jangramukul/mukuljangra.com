---
title: ViewModel Events as State Are an Antipattern
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Kotlin Coroutines
---

I once shipped a bug where users saw the same error snackbar every time they rotated their phone. The flow was simple: user taps a button, network call fails, snackbar shows "Something went wrong." But on configuration change, the screen recomposed, collected the same `UiState` with `showError = true`, and showed the snackbar again. And again. Every rotation, every process recreation — the ghost of an error that already happened kept haunting the UI.

This is the one-time events problem, and it's one of the most debated topics in Android architecture. Google's official guidance says "model everything as state." Manuel Vivo wrote an extensive article explaining why events should be state. But the community pushed back hard, and for good reason — the advice works for some types of events and falls apart for others. After dealing with this in multiple production apps, I think the "everything is state" position is technically elegant but practically incomplete.

## The Problem With Events as State

The core idea behind Google's guidance is simple: UI state should be a single source of truth. If your `UiState` data class has all the information the UI needs to render, then the UI is just a function of state. Clean, predictable, easy to test. No race conditions, no missed events.

The problem shows up the moment you have something that should happen exactly once. A snackbar. A toast. A navigation action. These aren't ongoing states — they're events. Something happened, the user should see it, and then it's done. But if you model them as state, they persist across configuration changes because state persists.

```kotlin
data class LoginUiState(
    val email: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,  // this is the problem
    val navigateToHome: Boolean = false // and this
)
```

When the screen recomposes after a rotation, `errorMessage` is still "Invalid credentials" and `navigateToHome` is still `true`. The error shows again. The navigation fires again. Now you need a "consumed" mechanism to mark events as handled.

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

This works, but look at what you've built. You have event fields in your state that are only meaningful for a single frame. You have `onMessageShown()` and `onNavigated()` functions whose entire purpose is cleanup. The UI must remember to call these at the right time — forget the `onNavigated()` call and the user gets stuck in a navigation loop. And your `UiState` is a mix of two fundamentally different things: actual persistent state (email, isLoading) and transient events (userMessage, navigateToHome) pretending to be state.

The consumed flag pattern also creates subtle ordering issues. If two events happen in quick succession, the first one might get consumed before the UI can show it. Or worse, the consumption callback might trigger a recomposition that re-evaluates the event before it's been fully processed. I've seen production code where `LaunchedEffect` and `onMessageShown` race against each other, producing flickering snackbars.

## Channel: Reliable But Lifecycle-Unaware

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

Channels guarantee that each event is received exactly once — no duplicate snackbars on rotation. The `BUFFERED` capacity means events are queued if the UI isn't collecting yet. But here's the catch: `Channel.receiveAsFlow()` doesn't know about Android lifecycle. If you collect it in a composable using `LaunchedEffect`, the collector dies when the composable leaves composition. If an event is sent while the UI is in the background, the channel buffers it and delivers it when the collector comes back — which is usually what you want, but not always. You might not want a stale navigation event firing 30 seconds after the user already moved on.

The deeper issue is that Google explicitly advises against this pattern. Their documentation says Channels shouldn't be used for events because they lack lifecycle awareness and can drop events if the consumer is too slow. IMO, that argument is a bit overstated — with `BUFFERED` capacity, you're unlikely to drop events in normal use. But the lifecycle concern is legitimate.

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

But `SharedFlow` with `replay = 0` has a critical problem: if there are no active collectors when the event is emitted, the event is lost forever. During a configuration change, there's a brief window where the old collector is destroyed and the new one hasn't started yet. Any event emitted during that window vanishes silently. No error, no warning, just a user who tapped "Login," the login succeeded, and nothing happened. I've debugged this exact issue — it was one of those "works on my device" bugs because the timing window is tiny on fast phones but wide enough on slower hardware.

You can try `SharingStarted.WhileSubscribed()` to keep the upstream alive during config changes, but that doesn't help with `SharedFlow` events — `WhileSubscribed` prevents the upstream cold flow from restarting, but a `MutableSharedFlow` has no upstream. The event is either collected when it's emitted or it's gone.

## The Real Answer: It Depends on What "Event" Means

After going through all of these approaches, here's where I landed: **the reason this problem is so hard is that "event" conflates two fundamentally different things**.

Some "events" are actually state transitions in disguise. Navigation is the clearest example. When the user successfully logs in, the app's navigation state changes — they're now on the home screen, not the login screen. This is persistent state. If the phone rotates mid-transition, the user should still end up on the home screen. Modeling this as state is correct because it IS state. The user's location within the app persists across configuration changes.

Other "events" are genuinely ephemeral. A snackbar saying "Message sent" is fire-and-forget. If the user rotates their phone and the snackbar doesn't show again, nobody notices. If it does show again, it's actively annoying. This is not state — it's a notification that something happened.

The approach I've settled on is separating the two explicitly:

```kotlin
class OrderViewModel : ViewModel() {
    // Persistent state — survives config changes, models the screen
    private val _uiState = MutableStateFlow(OrderUiState())
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()

    // Ephemeral events — fire once, best-effort delivery
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
                is Success -> _events.send(OrderEvent.ShowSnackbar("Order placed"))
                is Failure -> _events.send(OrderEvent.ShowSnackbar(result.error))
            }
        }
    }
}
```

State flows through `StateFlow`, survives configuration changes, and is always consistent. Events flow through `Channel`, are consumed once, and if one gets lost during a config change, it's not catastrophic — missing a snackbar is far less bad than showing it twice or navigating twice.

## Where Google's Guidance Gets It Right

I don't want to dismiss Google's position entirely because the core insight is sound. The idea that UI should be a function of state — that your composable takes a `UiState` and renders it deterministically — is a powerful simplification. It makes testing trivial, makes previews work, and eliminates a whole class of bugs where the UI gets out of sync with the data layer.

For navigation specifically, I think the state-based approach is correct. Navigation state should survive configuration changes. If you model "navigate to home" as an event that fires once and gets lost during a rotation, the user ends up stuck on the login screen after a successful login. That's worse than navigating twice. Libraries like Jetpack Navigation already model destination as state under the hood — the back stack is state, not a sequence of events.

The mistake is applying this principle universally. Manuel Vivo's article makes a strong case for state-driven architecture, and it works well for Google's recommended architecture with a single `UiState` class. But in practice, forcing every transient notification into the state model creates the consumed-flag ceremony I showed earlier, and that ceremony is both error-prone and hard to maintain.

## My Rule of Thumb

After shipping enough apps with both approaches, here's the heuristic I use. If the user would be confused when the action doesn't happen after a config change, it's state — model it in `UiState` and let it survive. If the user would be annoyed when the action happens twice after a config change, it's an event — use a Channel and accept the tiny risk of loss during rotation.

Navigation, authentication status, selected tab, form validation state — these are all state. Snackbars, toasts, scroll-to-top commands, analytics triggers — these are all events. The mental model is about user expectations, not about architectural purity.

The "everything is state" position optimizes for consistency and testability, which are real engineering values. But real apps have transient interactions that don't fit that model cleanly, and pretending they do just moves the complexity into consumed flags and cleanup callbacks. Sometimes the pragmatic answer is to have two channels of communication — one for persistent state, one for ephemeral events — and be intentional about which category each piece of information belongs to.

Thanks for reading!
