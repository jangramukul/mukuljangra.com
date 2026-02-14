---
title: Kotlin Scope Functions Guide
layout: post
categories: post
tags:
  - Kotlin
  - Best Practices
---

Scope functions were the first Kotlin feature that made me feel like I was fighting the language instead of using it. Not because they're complex — `let`, `run`, `with`, `apply`, `also` are all simple — but because they overlap in subtle ways that make choosing the "right" one feel arbitrary. I remember staring at code that used `run` where `let` would have worked identically, and `apply` where `also` would have been clearer, and wondering if there was actually a meaningful distinction or just personal preference.

There is a meaningful distinction, and it comes down to exactly two questions: **what does `this` refer to inside the block?** And **what does the block return?** Once I internalized those two axes, the five scope functions stopped being confusing and started being precise tools for specific situations.

## The Two Axes: Context Object and Return Value

Every scope function receives an object and executes a lambda on it. The differences are mechanical.

**Context object** — Is the object available as `this` (receiver) or `it` (argument)? When it's `this`, you can call the object's methods directly without qualification. When it's `it`, you reference the object explicitly, which is clearer when the surrounding scope already has its own `this`.

**Return value** — Does the function return the lambda's result, or the context object itself? Returning the lambda result means the function is useful for transformations and chains. Returning the context object means the function is useful for configuration and side effects.

- **`let`**: `it` + lambda result
- **`run`**: `this` + lambda result
- **`with`**: `this` + lambda result (non-extension)
- **`apply`**: `this` + context object
- **`also`**: `it` + context object

## `let` — Null Safety and Transformations

`let` is the scope function I use most, primarily for null-safe operations. When called on a nullable type with `?.let`, the block only executes if the value is non-null, and inside the block, `it` is the non-null value.

```kotlin
class ProfileViewModel(
    private val userRepository: UserRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    fun loadProfile(userId: String?) {
        // Null-safe chain — block only runs if userId is non-null
        userId?.let { id ->
            viewModelScope.launch {
                val profile = userRepository.getProfile(id)
                profile?.let { analyticsTracker.trackProfileView(it.displayName) }
            }
        }
    }

    fun formatPhoneNumber(raw: String?): String {
        // Transformation — let returns the lambda result
        return raw?.let { number ->
            val digits = number.filter { it.isDigit() }
            if (digits.length == 10) {
                "(${digits.take(3)}) ${digits.substring(3, 6)}-${digits.takeLast(4)}"
            } else {
                number
            }
        } ?: "No phone number"
    }
}
```

I name the `it` parameter explicitly (`id`, `number`) when the block is more than one line or when nested `let` calls would make `it` ambiguous. Nested `?.let` blocks where every lambda uses `it` is one of the most common readability mistakes I see in Kotlin code reviews. One level of `it` is fine. Two levels of `it` means you should be naming parameters.

A common mistake: using `let` just to avoid declaring a local variable. If you're writing `someExpression.let { doSomething(it) }` where a val would be clearer, just use a val. `let` adds a lambda allocation (though the compiler can sometimes inline it), and the val version is more readable to anyone scanning the code.

## `apply` — Object Configuration

`apply` is the scope function for configuring objects. It receives the object as `this`, so you can call methods directly, and it returns the object itself, so you can chain further operations.

```kotlin
class NotificationHelper(private val context: Context) {

    fun buildOrderNotification(orderId: String, status: String): Notification {
        return NotificationCompat.Builder(context, CHANNEL_ID).apply {
            setContentTitle("Order Update")
            setContentText("Order #$orderId is now $status")
            setSmallIcon(R.drawable.ic_notification)
            setPriority(NotificationCompat.PRIORITY_DEFAULT)
            setAutoCancel(true)
            setContentIntent(
                PendingIntent.getActivity(
                    context, orderId.hashCode(),
                    OrderDetailActivity.createIntent(context, orderId),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
        }.build()
    }
}
```

`apply` shines with builder-style APIs and object initialization. Every setter call inside the block implicitly targets the `NotificationCompat.Builder` without having to repeat the variable name. The block reads like a configuration declaration — "this notification has this title, this text, this icon."

The tradeoff: because `this` inside `apply` refers to the receiver object, you lose easy access to the enclosing `this`. If you're inside a class method and need to reference the class's own properties inside an `apply` block, you'd need `this@ClassName.property`. That's when `also` becomes the better choice.

## `also` — Side Effects Without Changing Context

`also` is `apply`'s counterpart — it returns the context object (like `apply`), but provides it as `it` (like `let`). This means the enclosing `this` is preserved, making `also` ideal for side effects that shouldn't change the scope.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val cache: UserCache,
    private val logger: Logger
) {
    suspend fun getUser(userId: String): User {
        return api.fetchUser(userId)
            .also { user -> cache.store(user) }
            .also { user -> logger.d("Fetched user: ${user.displayName}") }
    }
}
```

Each `also` block performs a side effect (caching, logging) without affecting the return value. The `User` object flows through unchanged. This is the key distinction from `let`, which returns the lambda's result — if you used `let` here and the lambda returned `Unit` (from the logger call), you'd lose the `User` object.

I use `also` for logging, analytics, caching, and any operation where I want to "peek" at a value without transforming it. It's the equivalent of RxJava's `doOnNext`.

## `run` and `with` — Computation on an Object

`run` and `with` both provide the object as `this` and return the lambda result. The difference is syntactic: `run` is an extension function (`obj.run { }`), while `with` takes the object as an argument (`with(obj) { }`).

```kotlin
class ReceiptFormatter {

    fun formatReceipt(order: Order): String {
        return with(order) {
            buildString {
                appendLine("Order #$id")
                appendLine("Date: ${createdAt.format(DateTimeFormatter.ISO_DATE)}")
                appendLine("---")
                items.forEach { item ->
                    appendLine("${item.name} x${item.quantity} - $${item.total}")
                }
                appendLine("---")
                appendLine("Subtotal: $$subtotal")
                appendLine("Tax: $$tax")
                appendLine("Total: $$total")
            }
        }
    }

    fun processPayment(gateway: PaymentGateway, orderId: String): PaymentResult {
        return gateway.run {
            val session = createSession(orderId)
            val verified = verifyMerchant(session.merchantId)
            if (verified) authorize(session) else PaymentResult.MerchantNotVerified
        }
    }
}
```

I use `with` when the object is the clear "subject" of the block — "with this order, build a receipt." I use `run` when it's a method chain or when the object might be nullable (`obj?.run { }`). `with` doesn't support null safety because the object is passed as an argument, not called as a method. That's the main practical difference.

## Common Mistakes

**Nesting scope functions too deeply.** Two levels is the practical limit. Three nested `let`/`run`/`apply` blocks create unreadable code where `this` and `it` change meaning at every level. If you're nesting that deeply, extract a function.

**Using `apply` for everything.** I've seen codebases where `apply` is used for initialization, transformation, side effects, and control flow. Each scope function has a semantic purpose — using the right one signals your intent to other developers. `apply` means "configure this object." `let` means "transform this value." `also` means "do something on the side." Using the wrong one works mechanically but confuses readers.

**Forgetting that `run`/`with` return the lambda result.** If the last expression in a `run` block is an `if` statement or a function call, that becomes the return value. I've seen bugs where a `run` block accidentally returned `Unit` from a `println` call that was added for debugging and never removed.

```kotlin
// Bug: returns Unit because println returns Unit
val config = settingsManager.run {
    loadDefaults()
    applyOverrides(environment)
    println("Config loaded") // oops — this is the return value
}
```

## The Reframe: Scope Functions Are About Intent

Here's how I think about choosing scope functions now: **the choice communicates your intent to the reader, not just to the compiler.** All five could technically be used interchangeably in most situations — the code would compile and run correctly. But each one carries a semantic signal. `let` says "I'm transforming or null-checking." `apply` says "I'm configuring." `also` says "I'm adding a side effect." `run` says "I'm computing something using this object." `with` says "this object is the subject."

When I review code, the scope function choice tells me what the developer intended before I even read the block body. If I see `apply`, I expect property assignments and method calls that configure an object. If I see `let`, I expect a transformation or a null-safe operation. When the scope function doesn't match the pattern, it's a code smell — either the wrong function was chosen, or the block is doing too many things.

Thank You!
