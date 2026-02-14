---
title: Kotlin Sealed Classes Guide
layout: post
categories: post
tags:
  - Kotlin
  - Architecture
  - Best Practices
---

The first time sealed classes clicked for me was during a code review. A colleague had modeled a payment flow using an enum with four values — `IDLE`, `LOADING`, `SUCCESS`, `FAILURE` — and a bunch of nullable fields hanging off the side: `errorMessage: String?`, `transactionId: String?`, `receiptUrl: String?`. The problem was obvious once you looked at it: in the `LOADING` state, `transactionId` was null because it didn't exist yet. In the `SUCCESS` state, `errorMessage` was null because there was no error. But the type system didn't enforce any of this. You could have an `IDLE` state with a `transactionId`, or a `FAILURE` state with a `receiptUrl`. The compiler saw nothing wrong with that. The bugs, predictably, were at runtime.

Sealed classes solve this by letting each state carry exactly the data it needs — no more, no less. They sit somewhere between enums and abstract classes, and understanding when to reach for each one is a skill that fundamentally improves how you model state in Kotlin.

## Enums vs Sealed Classes — When Each Fits

Enums are great when your states are a fixed set of values with no associated data, or when every value carries the same data. Days of the week, sort directions, log levels — these are perfect enum territory. The moment your states need to carry different data, enums start to hurt.

```kotlin
// Enums work perfectly when all values are uniform
enum class SortDirection { ASCENDING, DESCENDING }

enum class LogLevel(val priority: Int) {
    DEBUG(0), INFO(1), WARN(2), ERROR(3)
}

// Sealed classes when states carry different data
sealed interface PaymentState {
    data object Idle : PaymentState
    data object Processing : PaymentState
    data class Success(val transactionId: String, val receiptUrl: String) : PaymentState
    data class Failed(val errorMessage: String, val canRetry: Boolean) : PaymentState
}
```

With the sealed class, `Success` always has a `transactionId` and `receiptUrl`. `Failed` always has an `errorMessage` and a retry flag. `Idle` and `Processing` carry no data because they don't need any. There's no way to construct a `Failed` state with a `transactionId` — that combination doesn't exist in the type. The compiler enforces the invariants, not your discipline.

The performance difference is negligible for most applications. Enums are slightly more memory-efficient since they're static singletons, but sealed class subclasses that use `data object` (no fields) are also singletons. The choice should be about modeling accuracy, not performance micro-optimization.

## Exhaustive When Expressions

The real power of sealed classes shows up in `when` expressions. When you match on a sealed type, the compiler knows every possible subclass and forces you to handle them all. No `else` branch needed — and more importantly, no `else` branch hiding unhandled cases.

```kotlin
@Composable
fun PaymentScreen(state: PaymentState) {
    when (state) {
        is PaymentState.Idle -> {
            PaymentForm(onSubmit = { /* trigger payment */ })
        }
        is PaymentState.Processing -> {
            CircularProgressIndicator()
            Text("Processing your payment...")
        }
        is PaymentState.Success -> {
            // state is smart-cast — transactionId and receiptUrl are available
            SuccessView(
                transactionId = state.transactionId,
                receiptUrl = state.receiptUrl
            )
        }
        is PaymentState.Failed -> {
            ErrorView(message = state.errorMessage)
            if (state.canRetry) {
                RetryButton(onClick = { /* retry payment */ })
            }
        }
    }
}
```

Here's why exhaustive matching matters more than people think. Imagine you add a new state — `PaymentState.RequiresVerification(val verificationUrl: String)`. With sealed classes, every `when` expression that matches on `PaymentState` immediately becomes a compile error. The compiler forces you to handle the new state everywhere it's consumed. With an enum and an `else` branch, the new value silently falls into the else case, and you discover the missing handling when a user reports that the verification screen shows a blank page.

This is a genuine safety net on teams. When one developer adds a new state variant, every other developer who consumes that state gets a compile-time notification — no Slack message needed, no "don't forget to update the UI" comment on the PR.

## Sealed Interfaces — The Kotlin 1.5+ Upgrade

Sealed interfaces, introduced in Kotlin 1.5, are a strict improvement over sealed classes for most use cases. A class can implement multiple sealed interfaces but can only extend one sealed class. This gives you composability that sealed classes can't offer.

```kotlin
sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>
    data class Error(val code: Int, val message: String) : NetworkResult<Nothing>
    data object Loading : NetworkResult<Nothing>
}

sealed interface Cacheable {
    val cacheKey: String
    val expiresAt: Long
}

// A type that participates in both hierarchies
data class CachedSuccess<T>(
    val data: T,
    override val cacheKey: String,
    override val expiresAt: Long
) : NetworkResult<T>, Cacheable
```

The concrete differences between sealed class and sealed interface matter in practice. Sealed classes can have constructors, `init` blocks, and shared mutable state in the base class. Sealed interfaces can't — they're purely abstract contracts. Sealed classes also let subclasses share common initialization logic through `super()` calls. But sealed interfaces allow multiple inheritance, which is the more common need.

I default to `sealed interface` unless I need shared state or behavior in a base class. Interfaces are more flexible, and in most cases your sealed type is purely a data container — it doesn't need constructors, init blocks, or mutable state. If it does, sealed class is still there.

### data object — Singleton Subtypes Done Right

Before `data object` (introduced in Kotlin 1.9), singleton subtypes in a sealed hierarchy used regular `object`, which had a quirk: its `toString()` printed something like `Loading@3a4b5c` instead of `Loading`. `data object` fixes this by generating a readable `toString()`, plus consistent `equals()` and `hashCode()`.

```kotlin
sealed interface SyncState {
    data object Idle : SyncState           // toString() = "Idle"
    data object Syncing : SyncState        // toString() = "Syncing"
    data class Failed(val reason: String) : SyncState
    data class Complete(val itemCount: Int) : SyncState
}
```

Use `data object` for any sealed subtype that carries no data. It's a small detail, but it makes logging and debugging cleaner — you see `Idle` in your logs instead of an object hash.

## Nested Sealed Hierarchies

For complex state machines, you can nest sealed types to create multi-level hierarchies. This is particularly useful when a state has its own sub-states.

```kotlin
sealed interface MediaPlayerState {
    data object Idle : MediaPlayerState

    sealed interface Playing : MediaPlayerState {
        data class Streaming(val bufferPercent: Int) : Playing
        data class LocalFile(val filePath: String) : Playing
    }

    sealed interface Paused : MediaPlayerState {
        data class UserPaused(val position: Long) : Paused
        data class BufferingPaused(val position: Long) : Paused
    }

    data class Error(val message: String) : MediaPlayerState
}
```

Nested hierarchies let you match at different granularities. You can match on `MediaPlayerState.Playing` to handle any playing sub-state, or match on `MediaPlayerState.Playing.Streaming` to handle only the streaming case. The `when` expression remains exhaustive at every level.

## State Modeling — The Real Use Case

Beyond UI state, sealed types are excellent for modeling domain events, navigation actions, and any scenario where you have a fixed set of operations with varying payloads. In Compose, sealed types combine with exhaustive `when` to create UI code that's impossible to render incorrectly — you literally can't forget to handle a state because the compiler won't let you.

```kotlin
// Comprehensive screen state for a real app feature
sealed interface OrderScreenState {
    data object Loading : OrderScreenState
    data class Content(
        val orders: List<Order>,
        val selectedFilter: OrderFilter,
        val isRefreshing: Boolean
    ) : OrderScreenState
    data class Error(val message: String, val canRetry: Boolean) : OrderScreenState
    data object Empty : OrderScreenState
}

@Composable
fun OrderScreen(state: OrderScreenState, onAction: (OrderAction) -> Unit) {
    // Exhaustive when — add a new state variant and
    // this composable immediately shows a compile error
    when (state) {
        is OrderScreenState.Loading -> {
            CircularProgressIndicator(modifier = Modifier.fillMaxSize())
        }
        is OrderScreenState.Content -> {
            OrderList(
                orders = state.orders,
                isRefreshing = state.isRefreshing,
                onRefresh = { onAction(OrderAction.Refresh) },
                onOrderClick = { onAction(OrderAction.SelectOrder(it.id)) }
            )
        }
        is OrderScreenState.Error -> {
            ErrorView(
                message = state.message,
                onRetry = if (state.canRetry) {{ onAction(OrderAction.Retry) }} else null
            )
        }
        is OrderScreenState.Empty -> {
            EmptyState(message = "No orders yet")
        }
    }
}
```

I use sealed types heavily for modeling side effects in ViewModels — navigation events, snackbar messages, dialogs — anything that's a one-shot event rather than persistent state.

```kotlin
sealed interface NavigationEvent {
    data class GoToDetail(val itemId: String) : NavigationEvent
    data class GoToWebView(val url: String, val title: String) : NavigationEvent
    data object GoBack : NavigationEvent
    data object GoToLogin : NavigationEvent
}

sealed interface UserAction {
    data class Search(val query: String) : UserAction
    data class SelectItem(val itemId: String) : UserAction
    data class ChangePage(val page: Int) : UserAction
    data object Refresh : UserAction
    data object ClearFilters : UserAction
}
```

The pattern of sending `UserAction` into a ViewModel and emitting state updates creates a clean, predictable architecture. Every possible user action is explicitly defined, the ViewModel handles each one in a `when` expression, and the compiler tells you when you've forgotten to handle something. No stringly-typed event names, no unchecked casts, no runtime surprises.

## The Reframe — Types as Documentation

Here's what I think makes sealed types genuinely valuable beyond the compile-time safety: **they serve as documentation that the compiler enforces.** When I look at `PaymentState` and see four subclasses, I know exactly what states the payment flow can be in. I don't need to read the ViewModel implementation to understand the state machine — the types tell me.

With enums plus nullable fields, I have to read the code to understand which fields are valid in which states. The invariants are implicit, maintained by convention, and discovered through debugging when they break. With sealed types, the invariants are explicit, maintained by the compiler, and impossible to violate.

IMO, the cost of defining a sealed type is trivially small — a few extra lines of code. The benefit is a codebase where state shapes are self-documenting, state transitions are type-checked, and adding a new state variant is a compiler-guided process rather than a manual search-and-pray exercise. I reach for sealed types by default now, and I reach for enums only when every value truly carries the same data.

Thanks for reading!
