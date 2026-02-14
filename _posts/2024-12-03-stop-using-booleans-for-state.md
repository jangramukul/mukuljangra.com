---
title: Stop Using Booleans for State
layout: post
categories: post
tags:
  - Kotlin
  - Architecture
  - Best Practices
---

A few months ago, I found a bug in production that took me embarrassingly long to track down. Users were seeing a blank screen — no loading spinner, no error message, nothing. Just white. The logs told the story: `isLoading = true` and `isError = true` at the same time. The loading spinner was hidden because the error UI took priority, but the error message was suppressed because the loading state skipped it. Both flags were true, the UI rendered neither, and the user stared at nothing.

The fix was a one-liner — reset `isLoading` to false before setting `isError` to true. But here's the thing: the real problem wasn't the bug. The real problem was that the code *allowed* that state to exist in the first place. Four booleans sat at the top of my ViewModel: `isLoading`, `isError`, `isEmpty`, `isRetrying`. Four booleans meant 2⁴ = 16 possible combinations. I counted: exactly 4 of those 16 were valid states. The other 12 were bugs waiting to happen, and I'd just met one face-to-face.

Think of it like a combination lock with 16 positions, but only 4 of them actually open the door. The other 12? They don't just fail to open — they break the lock entirely.

## The Boolean Explosion Problem

Booleans feel like the simplest possible state representation. `isLoading` is either true or false. What could go wrong?

Everything. The moment you add a second boolean.

Two booleans give you 4 combinations. Three give you 8. Four give you 16. Five give you 32. Now imagine a real ViewModel for a checkout screen tracking `isLoading`, `isError`, `isPaymentProcessing`, `isAddressValidated`, `isCartEmpty`. That's 5 booleans and 32 possible combinations. In practice, maybe 6 of those 32 represent actual valid states your app can be in. The other 26 are impossible states that your type system happily allows. Can a cart be empty AND payment processing? Can an address be validated AND the screen be in an error state showing "address invalid"? Your business logic says no, but your compiler says sure, go ahead.

It's like a restaurant menu that lists 32 items but only 6 are actually available. Except instead of the waiter saying "sorry, we're out of that," your app just silently shows a blank screen.

I've seen this pattern in virtually every Android codebase I've worked on. The ViewModel starts clean — one boolean for loading. Then someone adds error handling. Then empty state. Then retry logic. Each addition feels small and harmless, but the combinatorial space grows exponentially while the number of valid states stays roughly constant. By the time you have 4 booleans, 75% of your state space is invalid. By 5 booleans, over 80% is invalid. And in a large codebase with multiple developers, every single state transition is a manual synchronization exercise where forgetting one reset line introduces a bug.

And the real cost isn't even the bugs you ship — it's the mental overhead. Every developer who touches that ViewModel has to hold the entire boolean interaction matrix in their head. Which flags need resetting when? What's the correct ordering? These are questions the type system should answer, not your team's tribal knowledge.

## The Sealed Class Fix

So what's the fix? Making invalid states unrepresentable. Instead of four booleans that can combine freely like ingredients in a bad smoothie, you define a sealed class where each subclass represents exactly one valid state:

```kotlin
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
    data object Empty : UiState<Nothing>
    data class Retrying(val previousError: String) : UiState<Nothing>
}
```

Now the ViewModel holds a single `UiState` value instead of four booleans. The states are mutually exclusive by construction — you can't be loading AND in an error state because `Loading` and `Error` are different types. The compiler enforces this at compile time, not at runtime, and not through code review comments that get ignored.

Said differently: with booleans, you're telling every developer "please don't mix these wrong." With sealed classes, you're telling the compiler "make it impossible to mix these wrong." Which one do you trust more?

### Carrying Context Per State

Notice that `Retrying` carries a `previousError` string and `Error` carries a `message`. This is one of the biggest advantages sealed classes have over booleans — each state can carry exactly the data relevant to it.

With booleans, you end up with a bunch of extra fields like `errorMessage`, `retryCount`, `lastSuccessData` that are only meaningful when certain booleans are true. You're always wondering "is `errorMessage` valid right now or is it stale from a previous error?" It's like a filing cabinet where every drawer has a label, but you can never be sure which labels are current and which are left over from last week.

With sealed classes, the data lives inside the state that uses it. When you're in `Success`, the data is right there. When you're in `Error`, the message is right there. No stale fields, no ambiguity.

### The ViewModel Refactor

The boolean version looks like this:

```kotlin
class SearchViewModel(
    private val repository: SearchRepository
) : ViewModel() {
    private val _isLoading = MutableStateFlow(false)
    private val _isError = MutableStateFlow(false)
    private val _isEmpty = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow("")
    private val _results = MutableStateFlow<List<SearchResult>>(emptyList())

    fun search(query: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _isError.value = false  // easy to forget this line
            _isEmpty.value = false  // and this one
            try {
                val results = repository.search(query)
                _results.value = results
                _isEmpty.value = results.isEmpty()
            } catch (e: Exception) {
                _isError.value = true
                _errorMessage.value = e.message ?: "Unknown error"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
```

See those comments — "easy to forget this line"? Yeah. That's the smell. When you need comments to remind you to reset flags, the design is fighting you.

And the sealed class version:

```kotlin
class SearchViewModel(
    private val repository: SearchRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<List<SearchResult>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<SearchResult>>> = _uiState.asStateFlow()

    fun search(query: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            _uiState.value = try {
                val results = repository.search(query)
                if (results.isEmpty()) UiState.Empty
                else UiState.Success(results)
            } catch (e: Exception) {
                UiState.Error(e.message ?: "Unknown error")
            }
        }
    }
}
```

The boolean version has 5 mutable state fields that need to be kept in sync manually. Every state transition requires resetting the right combination of flags — miss one and you get the blank screen I found in production. The sealed class version has 1 state field, and every transition is a single assignment. There's no "forgetting to reset" because there's nothing to reset. You're replacing the state entirely, like swapping out a sign on a door instead of trying to flip five different switches in the right order.

> **💡 The "aha" moment:** With booleans, you *mutate* pieces of state and hope they stay consistent. With sealed classes, you *replace* the entire state atomically. One assignment. Done. No flag juggling.

## When Enums Are Enough

Not every state problem needs a sealed class. If your states are a simple, finite set with no data attached to any of them, a Kotlin `enum` works perfectly and is less ceremony.

Think about a media player. The player is either playing, paused, or stopped. No state carries extra data. No state needs generics. An enum handles this cleanly:

```kotlin
enum class PlayerState {
    PLAYING,
    PAUSED,
    STOPPED
}
```

Enums also support properties and methods, which makes them surprisingly powerful for simple finite states. A network connection monitor is a good example — each connection type might carry a display label or icon resource:

```kotlin
enum class ConnectionState(val displayName: String) {
    CONNECTED("Online"),
    DISCONNECTED("Offline"),
    CONNECTING("Connecting...");

    val isUsable: Boolean get() = this == CONNECTED
}
```

So when do you reach for a sealed class instead? **The moment any state needs to carry unique data.** If your error state needs an error message but your loading state doesn't, enum can't express that — every enum constant has the same shape. If your success state carries a list of items but your empty state carries nothing, you need a sealed class. IMO, the rule is simple: enum for uniform states, sealed class for states with different data shapes.

## Nested Sealed Classes for Complex State Machines

Real apps often have states that themselves contain substates. Imagine you're building a payment flow — once you're in the "processing" phase, there are multiple steps happening underneath. It's like a progress bar that actually has its own mini progress bar inside it.

```kotlin
sealed interface PaymentState {
    data object Idle : PaymentState
    data class EnteringDetails(
        val cardNumber: String = "",
        val isCardValid: Boolean = false
    ) : PaymentState

    sealed interface Processing : PaymentState {
        data object ValidatingCard : Processing
        data object ChargingPayment : Processing
        data class AwaitingConfirmation(val transactionId: String) : Processing
    }

    data class Completed(val receiptUrl: String) : PaymentState
    data class Failed(val error: String, val canRetry: Boolean) : PaymentState
}
```

The nested `Processing` sealed interface gives you a two-level state machine. At the top level, you know you're processing. At the inner level, you know exactly which processing step you're in. Your UI can match on just `PaymentState` when it only cares about the broad strokes (show a spinner for any `Processing` subtype), or it can match on the specific `Processing` variant when it needs to show a progress indicator like "Validating card..." vs "Charging payment...". This pattern maps directly to how real payment SDKs work — Stripe's PaymentSheet has similar internal state transitions.

## Formal State Machines and Valid Transitions

Here's something sealed classes alone don't give you: **transition validation**. A sealed class prevents invalid states, but it doesn't prevent invalid *transitions* between states. Nothing stops you from going directly from `Loading` to `Retrying` without passing through `Error` first, even though that might not make sense in your domain.

It's like having a traffic light where the bulbs are correct (red, yellow, green — no purple), but the wiring lets it jump from green straight to red without ever passing through yellow. The states are valid. The transition isn't.

For simple flows, you can enforce transitions manually with a function that takes the current state and returns the next valid state. But once your state machine grows beyond 5-6 states with complex transition rules, you want a proper state machine library. Tinder's [StateMachine](https://github.com/Tinder/StateMachine) is one of the more popular ones in the Android ecosystem. It lets you define states, events, and valid transitions declaratively:

```kotlin
val permissionStateMachine = StateMachine.create<PermissionState, PermissionEvent, SideEffect> {
    initialState(PermissionState.NotRequested)
    state<PermissionState.NotRequested> {
        on<PermissionEvent.RequestPermission> {
            transitionTo(PermissionState.Requesting, SideEffect.ShowSystemDialog)
        }
    }
    state<PermissionState.Requesting> {
        on<PermissionEvent.Granted> {
            transitionTo(PermissionState.Granted, SideEffect.EnableFeature)
        }
        on<PermissionEvent.Denied> {
            transitionTo(PermissionState.Denied(showRationale = true))
        }
    }
    state<PermissionState.Denied> {
        on<PermissionEvent.RequestPermission> {
            transitionTo(PermissionState.Requesting, SideEffect.ShowSystemDialog)
        }
        on<PermissionEvent.PermanentlyDenied> {
            transitionTo(PermissionState.PermanentlyDenied, SideEffect.ShowSettingsPrompt)
        }
    }
}
```

Now if something tries to transition from `NotRequested` directly to `Granted`, the state machine throws. You've encoded not just "what states exist" but "how you're allowed to move between them." I'd say you probably don't need a full state machine library for a typical loading/error/success screen. But for multi-step flows like onboarding, payment processing, or permission requests with rationale dialogs — a formal state machine saves you from a whole class of bugs.

## Real-World State Modeling Examples

To me, the real test of a pattern is how many different problems it solves cleanly. Here are a few state models I've used in production.

### Form Validation

Form validation is one of those things that starts as a couple of booleans (`isEmailValid`, `isPasswordValid`) and quickly spirals. You know how it goes — first it's two booleans, then four, then someone adds `isPasswordStrengthChecked` and suddenly the form has opinions it can't express. A sealed class per field keeps it sane, and each state carries the validation context:

```kotlin
sealed interface FieldValidation {
    data object Idle : FieldValidation
    data object Validating : FieldValidation
    data object Valid : FieldValidation
    data class Invalid(val errorMessage: String) : FieldValidation
}

data class SignUpFormState(
    val email: FieldValidation = FieldValidation.Idle,
    val password: FieldValidation = FieldValidation.Idle,
    val username: FieldValidation = FieldValidation.Idle
) {
    val canSubmit: Boolean
        get() = email is FieldValidation.Valid
                && password is FieldValidation.Valid
                && username is FieldValidation.Valid
}
```

Notice `canSubmit` is a derived property, not another boolean to sync. That's a pattern worth stealing — compute derived state, don't store it.

### Network Connection

```kotlin
sealed interface NetworkState {
    data object Available : NetworkState
    data class Losing(val remainingMs: Long) : NetworkState
    data object Lost : NetworkState
    data class Unavailable(val reason: String) : NetworkState
}
```

This maps directly to Android's `ConnectivityManager.NetworkCallback` — `onAvailable`, `onLosing`, `onLost`, `onUnavailable`. The `Losing` state carrying `remainingMs` lets you show a "connection unstable" banner with a countdown, which is something you'd need a separate field for with booleans.

> **🧠 Think about it:** How would you model the `Losing` state with booleans? You'd need `isLosing = true` *plus* a `remainingMs` field that's only valid when `isLosing` is true. That's exactly the kind of "stale data" trap sealed classes eliminate.

## Sealed Class State in Compose

Sealed classes and Jetpack Compose are a natural fit. The exhaustive `when` expression maps directly to composable rendering, and Compose's smart recomposition works beautifully with sealed class state because each branch is a distinct type.

```kotlin
@Composable
fun SearchScreen(viewModel: SearchViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    when (state) {
        is UiState.Loading -> {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        is UiState.Success -> {
            val results = (state as UiState.Success<List<SearchResult>>).data
            LazyColumn {
                items(results) { result -> SearchResultItem(result) }
            }
        }
        is UiState.Error -> {
            val message = (state as UiState.Error).message
            ErrorScreen(message = message, onRetry = { viewModel.search("") })
        }
        is UiState.Empty -> EmptySearchView()
        is UiState.Retrying -> RetryingIndicator()
    }
}
```

Now here's where it gets interesting. If you add a new state — say `UiState.PartialResults` — the compiler immediately flags every `when` expression that doesn't handle it. With booleans, adding a new state means adding a new boolean and then hunting through the entire codebase for every `if (isLoading)` block that might need updating. You'll miss some. The sealed class approach turns a runtime bug hunt into a compile-time checklist.

There's a Compose-specific win here too. When your state changes from `Loading` to `Success`, Compose knows the entire branch has changed, so it recomposes the `Success` branch from scratch rather than trying to diff against the loading spinner. This is actually more efficient than having a single composable that reads multiple boolean StateFlows and recomposes partially on each flag change. Fewer, coarser recompositions are generally better than many fine-grained ones.

> **⚡ Quick check:** If you have a sealed class with 5 states and you add a 6th, what happens to all your `when` expressions? (Answer: the compiler tells you exactly which ones need updating. No hunting required.)

## Even Two Booleans Are Suspicious

The examples above cover the obvious case — several booleans representing a state machine. But I'd go further: even two related booleans should make you pause.

Consider `isEnabled` and `isVisible` on a button. Four combinations exist: enabled+visible, enabled+invisible, disabled+visible, disabled+invisible. Does "enabled but invisible" actually mean anything in your UI? If a button can't be seen, does its enabled state matter? In most cases, these two booleans aren't independent — they represent a single concept like "button availability" that has three meaningful states: shown and active, shown but disabled, or hidden entirely.

```kotlin
sealed interface ButtonState {
    data object Active : ButtonState
    data class Disabled(val reason: String) : ButtonState
    data object Hidden : ButtonState
}
```

Now "enabled but invisible" literally cannot exist. And the `Disabled` state carries a reason, which you'd need a separate string field for in the boolean approach. The sealed class is more expressive AND more constrained — which is exactly what you want from your type system.

The mental model I use is simple: if two booleans are related — meaning changing one might require changing the other — they're probably not independent booleans. They're a state machine in disguise. Pull out the valid combinations, give them names, and use a sealed class or an enum.

## When Booleans Are Actually Fine

I'm not arguing that you should never use booleans. That would be ridiculous. Some states genuinely have exactly two possibilities with no interaction between them. `isDarkMode` is either true or false, and it doesn't combine with any other state to create invalid combinations. `isMuted` is a simple toggle. `isExpanded` for a collapsible section works fine as a boolean.

The test is straightforward: can this boolean combine with other state in a way that creates an invalid combination? If the answer is no — if it's truly independent — use a boolean. They're simple, they're cheap, and everyone understands them. The moment you notice two or more booleans that share a conceptual relationship, that's your signal to refactor. Don't wait until you find the production bug. I did, and I don't recommend it.

> **🔥 Real talk:** IMO, the cost of over-engineering with a sealed class for a genuine toggle is real — more code, more ceremony. But the cost of under-engineering with booleans for a state machine is *much* worse — invalid states, inconsistent UI, and bugs that hide behind the combinatorial complexity you created by accident. I'll take a little extra code over a mystery blank screen any day.

## State Shape Is a Design Decision

Here's what I didn't understand early in my career: **the shape of your state is an architectural decision, not just a data modeling convenience**. When you choose booleans, you're choosing to trust developers to maintain invariants manually. When you choose sealed classes, you're encoding those invariants into the type system and letting the compiler maintain them for you.

This is the same principle behind Kotlin's null safety. Before Kotlin, Java developers used `@Nullable` annotations and code review to prevent null pointer exceptions. Kotlin made null a type-level concern. The result wasn't just fewer NPEs — it fundamentally changed how developers thought about optional values. Sealed classes do the same thing for state. They move the invariant enforcement from "developer discipline" to "compiler guarantee." Same idea, different dimension.

I now treat boolean proliferation as a code smell. When I see a PR that adds a third boolean to a ViewModel, I ask: "What states are valid here?" And almost every time, the answer leads to a sealed class that's cleaner, safer, and easier to reason about than the boolean soup it replaces.

Thank You!
