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

I default to `sealed interface` unless I need shared state or behavior in a base class. Interfaces are more flexible, and in most cases your sealed type is purely a data container — it doesn't need constructors, init blocks, or mutable state. If it does, sealed class is still there.

## State Modeling — The Real Use Case

Beyond UI state, sealed types are excellent for modeling domain events, navigation actions, and any scenario where you have a fixed set of operations with varying payloads. I use them heavily for modeling side effects in ViewModels.

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
