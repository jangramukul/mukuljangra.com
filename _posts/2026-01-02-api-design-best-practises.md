---
title: API Design Best Practices Guide
layout: post
categories: post
tags:
  - Kotlin
  - Best Practices
  - Design Patterns
---

1. **Make Illegal States Unrepresentable**
The most effective API design principle in Kotlin is using the type system to make invalid states impossible to construct. If your function accepts a `String` for a currency code, someone will pass "banana". If it accepts a `CurrencyCode` enum, they physically can't. Every bug prevented by the type system is a bug you never have to write a test for, never have to debug in production, and never have to explain in a postmortem.

Sealed classes are the sharpest tool here. Instead of representing a payment method as a `String` with possible values "credit", "debit", "paypal" (what happens with "creditt"?), model it as a sealed hierarchy where each variant carries exactly the data it needs. A credit card has a number and expiry. PayPal has an email. Cash has neither. The type system enforces these constraints at compile time.

```kotlin
// Stringly-typed — illegal states are easy to create
data class Payment(
    val method: String, // "credit", "debit", "paypal", or... "banana"?
    val cardNumber: String?, // Required for credit, useless for PayPal
    val paypalEmail: String? // Required for PayPal, useless for credit
)

// Type-safe — illegal states are impossible
sealed interface PaymentMethod {
    data class CreditCard(
        val number: CardNumber,
        val expiry: ExpiryDate,
        val cvv: String
    ) : PaymentMethod

    data class PayPal(val email: EmailAddress) : PaymentMethod
    data object Cash : PaymentMethod
}
```

In the typed version, you can't create a `CreditCard` without a card number, and you can't attach a card number to a `Cash` payment. The `CardNumber` and `EmailAddress` value classes add another layer — they prevent mixing up which `String` goes where. The tradeoff is more types, more files, and more boilerplate for simple cases. For a prototype or internal tool, string parameters might be fine. For a public API or a domain model that multiple teams consume, the upfront investment in types pays for itself in prevented bugs.

2. **Prefer DSL Builders Over Traditional Builders for Complex Configuration**
The traditional Builder pattern — `Builder().setX().setY().build()` — works but feels mechanical in Kotlin. Kotlin's lambda-with-receiver syntax lets you create DSL builders that read like configuration blocks. The difference isn't just aesthetics: DSLs provide scope, nesting, and can enforce required fields at compile time through the `@DslMarker` annotation.

```kotlin
// Traditional builder — works, but verbose
val notification = Notification.Builder()
    .setTitle("Payment Received")
    .setBody("$50.00 from John")
    .setChannel(Channel.TRANSACTIONS)
    .setPriority(Priority.HIGH)
    .addAction(Action("View", viewIntent))
    .addAction(Action("Dismiss", dismissIntent))
    .build()

// Kotlin DSL — reads like a configuration block
val notification = notification {
    title = "Payment Received"
    body = "$50.00 from John"
    channel = Channel.TRANSACTIONS
    priority = Priority.HIGH
    actions {
        action("View") { navigateTo(viewIntent) }
        action("Dismiss") { cancel() }
    }
}
```

Building a DSL requires a builder class with a lambda-with-receiver function. Here's the internal structure that makes the DSL above work:

```kotlin
class NotificationBuilder {
    var title: String = ""
    var body: String = ""
    var channel: Channel = Channel.DEFAULT
    var priority: Priority = Priority.NORMAL
    private val actionList = mutableListOf<NotificationAction>()

    fun actions(block: ActionBuilder.() -> Unit) {
        ActionBuilder().apply(block).build().let { actionList.addAll(it) }
    }

    fun build(): AppNotification {
        require(title.isNotBlank()) { "Notification title is required" }
        return AppNotification(title, body, channel, priority, actionList)
    }
}

fun notification(block: NotificationBuilder.() -> Unit): AppNotification {
    return NotificationBuilder().apply(block).build()
}
```

The `require` in `build()` gives you runtime validation for required fields. For compile-time enforcement, you can use a phantom type builder pattern — but that's complex enough that I'd only use it for foundational APIs. The tradeoff with DSLs is discoverability. A traditional builder has autocomplete for every `set` method. A DSL requires the developer to know which properties are available inside the lambda. Good documentation and a `@DslMarker` annotation to prevent accidental scope leaking are essential.

3. **Use Default Parameters Instead of Method Overloads**
In Java, you'd write 4 overloads of a function to handle different combinations of optional parameters. In Kotlin, default parameters eliminate every one of them. This reduces the API surface and makes the available options discoverable in a single function signature.

```kotlin
// Java-style overloads — 4 functions for 4 combinations
fun fetchUsers(): List<User> = fetchUsers(page = 1, limit = 20, sortBy = "name")
fun fetchUsers(page: Int): List<User> = fetchUsers(page, limit = 20, sortBy = "name")
fun fetchUsers(page: Int, limit: Int): List<User> = fetchUsers(page, limit, sortBy = "name")
fun fetchUsers(page: Int, limit: Int, sortBy: String): List<User> { /* ... */ }

// Kotlin default parameters — one function, all options
fun fetchUsers(
    page: Int = 1,
    limit: Int = 20,
    sortBy: SortField = SortField.NAME,
    includeDeactivated: Boolean = false
): List<User> {
    // Single implementation
}

// Callers use named arguments for clarity
val results = fetchUsers(page = 3, sortBy = SortField.CREATED_AT)
```

Named arguments at the call site make the code self-documenting. `fetchUsers(3, 20, "name")` is a mystery. `fetchUsers(page = 3, sortBy = SortField.NAME)` is instantly clear. Notice I used `SortField` enum instead of a `String` — combining default parameters with type-safe enums gives you both convenience and correctness.

One genuine tradeoff: if this API is called from Java, default parameters aren't visible. Java callers see only the full-parameter version. If Java interop matters, add `@JvmOverloads` to generate the overloads for Java callers. But be aware that `@JvmOverloads` generates overloads by removing parameters from right to left — it doesn't generate every possible combination, so some parameter groupings may be inaccessible from Java.

4. **Design Extension Functions for Domain-Specific Operations**
Extension functions are Kotlin's way of adding behavior to existing types without inheritance or wrapper classes. For API design, they're perfect for domain-specific operations that don't belong on the core type but that your codebase uses frequently.

The key insight is that extension functions should feel like they belong on the type. `String.toUserId()` makes sense if your codebase frequently converts strings to user IDs. `String.processPayment()` does not — that's business logic being shoehorned onto a data type. The test is: would a developer intuitively look for this function on this type?

```kotlin
// Good — domain-specific conversions that naturally belong on the type
fun String.toSlug(): String {
    return this.lowercase()
        .replace(Regex("[^a-z0-9\\s-]"), "")
        .replace(Regex("\\s+"), "-")
        .trim('-')
}

fun Long.toFormattedCurrency(currencyCode: String = "USD"): String {
    val amount = this / 100.0 // Cents to dollars
    return NumberFormat.getCurrencyInstance().apply {
        currency = Currency.getInstance(currencyCode)
    }.format(amount)
}

fun Instant.toRelativeTimeString(): String {
    val duration = Duration.between(this, Instant.now())
    return when {
        duration.toMinutes() < 1 -> "just now"
        duration.toHours() < 1 -> "${duration.toMinutes()}m ago"
        duration.toDays() < 1 -> "${duration.toHours()}h ago"
        duration.toDays() < 7 -> "${duration.toDays()}d ago"
        else -> DateTimeFormatter.ofPattern("MMM d").format(this.atZone(ZoneId.systemDefault()))
    }
}
```

The tradeoff with extension functions is that they can clutter autocomplete. If every developer adds extension functions to `String` and `Context`, the autocomplete list becomes unusable. Keep extension functions scoped — define them in the package that uses them, not in a global `Extensions.kt` file. If an extension is used in only one file, make it `private`. If it's used across a module, give it `internal` visibility. Only make it `public` if it's genuinely part of your module's API.

5. **Name Functions for What They Do, Not How They Do It**
Function names should describe the outcome, not the implementation. `getUserFromDatabase()` tells the caller about an implementation detail they shouldn't care about. `getUser()` describes the result. If you later add a cache layer, `getUserFromDatabase()` becomes a lie — it might return from cache, but the name says database.

This sounds trivial, but naming drives expectations, and wrong expectations create bugs. When a function is named `fetchFromNetwork()`, developers assume it always makes a network call and skip caching logic. When it's named `getUser()`, they understand it returns a user by whatever means the implementation chooses.

```kotlin
// Implementation-focused names — they lie when implementation changes
interface UserRepository {
    suspend fun fetchUserFromApi(userId: String): User      // What if we add caching?
    suspend fun queryUserFromDatabase(userId: String): User  // What if we switch to a file?
    suspend fun downloadUserAvatar(url: String): ByteArray   // What if it's already cached?
}

// Outcome-focused names — they stay true regardless of implementation
interface UserRepository {
    suspend fun getUser(userId: String): User
    suspend fun getUserAvatar(userId: String): ByteArray
    suspend fun saveUser(user: User)
    suspend fun deleteUser(userId: String)
}
```

Here's the naming convention I follow: `get` for retrievals that may hit cache or network (fast if cached). `fetch` for operations that always hit the network (skip cache). `save` for persistence (create or update). `delete` for removal. `observe` for returning a Flow. This vocabulary gives callers accurate expectations about performance characteristics — `getUser()` might be fast, `fetchUser()` will always be slow.

6. **Design for Backward Compatibility From Day One**
The moment someone else uses your API — another module, another team, a library consumer — you're responsible for not breaking them. Adding a required parameter to a function breaks every call site. Removing a public class breaks everyone who references it. Renaming a function is a breaking change that provides zero functional benefit.

The simplest backward compatibility strategy: make new parameters optional with defaults. Instead of changing `fun sendNotification(title: String, body: String)` to require a `channel` parameter, add it with a default: `fun sendNotification(title: String, body: String, channel: Channel = Channel.DEFAULT)`. Every existing call site continues to work, and new callers can use the channel parameter.

```kotlin
// Version 1 of your API
fun createOrder(
    items: List<OrderItem>,
    userId: String
): Order { /* ... */ }

// Version 2 — backward compatible, new features are optional
fun createOrder(
    items: List<OrderItem>,
    userId: String,
    couponCode: String? = null,
    deliveryPriority: DeliveryPriority = DeliveryPriority.STANDARD,
    giftMessage: String? = null
): Order { /* ... */ }
```

For more complex evolution, use the `@Deprecated` annotation with a `replaceWith` parameter. This gives callers a migration path — the IDE shows a warning with an auto-fix that transforms the old call to the new API. Give deprecation at least one release cycle before removal.

```kotlin
@Deprecated(
    message = "Use createOrder with OrderRequest instead",
    replaceWith = ReplaceWith(
        "createOrder(OrderRequest(items, userId))",
        "com.example.order.OrderRequest"
    )
)
fun createOrder(items: List<OrderItem>, userId: String): Order {
    return createOrder(OrderRequest(items, userId))
}

// New API — wraps parameters into a cohesive request object
fun createOrder(request: OrderRequest): Order { /* ... */ }
```

The tradeoff is that maintaining backward compatibility means living with past design decisions. Sometimes a clean break is better than accumulating deprecated cruft. But breaking changes should be rare, intentional, and communicated well — not a side effect of a Friday afternoon refactor.

7. **Document the Why, Not the What**
The worst kind of API documentation restates the function signature in English: "getUserById gets a user by ID." That's worthless. The developer can read the function name. What they can't read is: what happens when the user doesn't exist? Is this function thread-safe? Does it make a network call? Can it throw? What's the expected performance?

Good API documentation answers questions the signature can't. It describes edge cases, threading behavior, performance characteristics, and the rationale behind design decisions. KDoc supports structured tags that make this information scannable.

```kotlin
/**
 * Resolves the most appropriate shipping rate for the given order.
 *
 * Rates are selected based on the destination country, package weight,
 * and the user's subscription tier. Premium users get free shipping
 * on orders over $50; standard users always pay calculated rates.
 *
 * This function makes a network call to the rate provider API on first
 * invocation, then caches rates for 15 minutes. Subsequent calls within
 * the cache window return instantly.
 *
 * @param order The order to calculate shipping for. Must have at least
 *   one item with a non-zero weight.
 * @return The calculated rate, or [ShippingRate.FREE] if the order
 *   qualifies for free shipping.
 * @throws IllegalArgumentException if the order contains no items.
 * @throws ShippingUnavailableException if the destination country
 *   is not in the supported list. Call [getSupportedCountries] to check.
 */
suspend fun calculateShippingRate(order: Order): ShippingRate
```

The tradeoff is that detailed documentation takes time to write and effort to maintain. When the implementation changes, the documentation must be updated too — stale docs are worse than no docs because they actively mislead. My approach: document every public API function in a library or shared module. For internal code that a single team owns, clear naming and a few comments at non-obvious points is usually sufficient.

8. **Use Value Classes for Type Safety Without Runtime Overhead**
Kotlin's `@JvmInline value class` lets you wrap a primitive type in a named type with zero runtime allocation. This is the perfect tool for preventing parameter mixups — passing a user ID where an order ID is expected, or a price in cents where a price in dollars is expected.

```kotlin
@JvmInline
value class UserId(val value: String)

@JvmInline
value class OrderId(val value: String)

@JvmInline
value class Cents(val value: Long) {
    fun toDollars(): Double = value / 100.0
}

// Without value classes — easy to mix up parameters
fun processRefund(userId: String, orderId: String, amount: Long) { /* ... */ }
processRefund(orderId, userId, amount) // Compiles! But wrong.

// With value classes — compiler catches the mistake
fun processRefund(userId: UserId, orderId: OrderId, amount: Cents) { /* ... */ }
processRefund(orderId, userId, amount) // Compile error — type mismatch
```

At runtime, `UserId` is just a `String` — no wrapper object is allocated, no extra memory used. The type safety exists only at compile time. This makes value classes essentially free in production while catching an entire category of bugs during development. I use them for any ID type, any monetary amount, and any domain quantity where confusion with another same-typed parameter is plausible.

The limitation is that value classes can only wrap a single property. If you need a type that holds two fields (like a latitude/longitude pair), you need a regular data class. Also, value classes don't support inheritance beyond implementing interfaces, so they can't be part of a sealed hierarchy. For simple wrapper types, though, they're the cleanest tool Kotlin offers.

9. **Design Sealed Hierarchies for Exhaustive Pattern Matching**
Sealed classes and sealed interfaces are Kotlin's answer to algebraic data types. When you use them in a `when` expression, the compiler knows all possible subtypes and forces you to handle each one — or add an `else` branch explicitly. This eliminates the "forgot to handle the new state" category of bugs entirely.

The key design decision is sealed class vs sealed interface. Sealed classes can hold shared state and behavior in the base class. Sealed interfaces can be implemented by classes that already extend another class. In practice, I default to sealed interfaces because they're more flexible — a `PaymentResult` can be implemented by a data class that also implements `Parcelable` or `Serializable`.

```kotlin
sealed interface NavigationEvent {
    data class NavigateTo(val route: String, val args: Bundle? = null) : NavigationEvent
    data object NavigateBack : NavigationEvent
    data class ShowBottomSheet(val content: SheetContent) : NavigationEvent
    data class ShowDialog(val config: DialogConfig) : NavigationEvent
}

// Exhaustive handling — add a new subtype and every 'when' breaks until handled
fun handleNavigation(event: NavigationEvent) {
    when (event) {
        is NavigationEvent.NavigateTo -> navController.navigate(event.route)
        NavigationEvent.NavigateBack -> navController.popBackStack()
        is NavigationEvent.ShowBottomSheet -> bottomSheetState.show(event.content)
        is NavigationEvent.ShowDialog -> dialogState.show(event.config)
        // No 'else' needed — compiler verifies all cases are covered
    }
}
```

The reframe moment with sealed hierarchies is this: they're not just a pattern matching convenience. They're a communication tool. When a function returns `sealed interface Result`, it's telling every consumer: "here are the exact things that can happen, and you must handle all of them." This is fundamentally different from returning a nullable type or throwing exceptions, where the set of possible outcomes is implicit and unbounded. Design your public APIs around sealed return types and your consumers will thank you every time you add a new variant — because the compiler tells them exactly where to update their code.

Thanks for reading!
