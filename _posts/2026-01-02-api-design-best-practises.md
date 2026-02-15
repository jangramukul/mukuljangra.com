---
title: API Design Best Practices Guide
layout: post
sequence: 77
categories: post
tags:
  - Kotlin
  - Best Practices
  - Design Patterns
---

Over the years, I've reviewed a lot of Kotlin codebases — internal libraries, SDK modules, shared data layers — and the pattern I keep seeing is the same. The code works, the tests pass, but the API surface is a minefield. Functions accept raw strings where they should accept typed wrappers. Builders require seven parameters in an undocumented order. A new feature addition breaks three call sites in another module because someone added a required parameter. The code is correct but the API is hostile, and every consumer pays the tax.

The thing that changed how I think about API design was realizing that a good API isn't just about making things easy to use correctly — it's about making things hard to use incorrectly. The compiler should be your first line of defense, not your test suite. If you can construct an invalid state, someone eventually will, and it'll happen at 2 AM on a Saturday in production. I'd rather spend an extra hour modeling types upfront than spend a weekend debugging a stringly-typed mess.

## Making Invalid States Impossible

The most effective API design principle in Kotlin is using the type system to make invalid states impossible to construct. If your function accepts a `String` for a currency code, someone will pass `"banana"`. If it accepts a `CurrencyCode` enum, they physically can't. Every bug prevented by the type system is a bug you never have to write a test for, never have to debug in production, and never have to explain in a postmortem.

Sealed interfaces are the sharpest tool here. Instead of representing a payment method as a `String` with possible values `"credit"`, `"debit"`, `"paypal"` — model it as a sealed hierarchy where each variant carries exactly the data it needs. A credit card has a number and expiry. PayPal has an email. Cash has neither. When you add a new variant, every `when` expression that handles the hierarchy breaks at compile time until the consumer handles the new case. That's the type system doing your QA work for free.

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

The `CardNumber` and `EmailAddress` value classes add another layer — they prevent mixing up which `String` goes where. Kotlin's `@JvmInline value class` wraps a primitive in a named type with zero runtime allocation. At runtime, `UserId` is just a `String` — no wrapper object, no extra memory. But at compile time, `processRefund(orderId, userId, amount)` won't compile if you swap the `UserId` and `OrderId` parameters. I use value classes for any ID type, any monetary amount, and any domain quantity where confusion with another same-typed parameter is plausible.

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

The tradeoff is more types, more files, and more boilerplate for simple cases. For a prototype or internal tool, string parameters might be fine. For a public API or a domain model that multiple teams consume, the upfront investment in types pays for itself in prevented bugs. The core idea: **push validation from runtime to compile time.**

## Factory Functions and Smart Constructors

Raw constructors are honest — they expose exactly how an object is built. But sometimes that honesty is a liability. When a constructor takes five parameters, three of which have complex validation rules, you're asking every caller to understand your internal constraints. Factory functions in a `companion object` let you hide that complexity behind a clear, intention-revealing name.

The naming conventions matter here. Kotlin's standard library establishes a vocabulary: `of()` for wrapping known-valid values (like `listOf()`), `from()` for parsing or converting (like `Instant.from()`), and `create()` for more involved construction. Following these conventions means your API feels familiar to anyone who's used Kotlin's own APIs. I also like `orNull()` variants that return `null` instead of throwing — they compose better with the rest of Kotlin's null safety features.

```kotlin
@JvmInline
value class EmailAddress private constructor(val value: String) {
    companion object {
        private val EMAIL_REGEX = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$")

        fun from(raw: String): EmailAddress {
            require(EMAIL_REGEX.matches(raw)) { "Invalid email: $raw" }
            return EmailAddress(raw.lowercase())
        }

        fun fromOrNull(raw: String): EmailAddress? {
            return if (EMAIL_REGEX.matches(raw)) EmailAddress(raw.lowercase()) else null
        }
    }
}

@JvmInline
value class PortNumber private constructor(val value: Int) {
    companion object {
        fun of(port: Int): PortNumber {
            require(port in 1..65535) { "Port must be 1-65535, was $port" }
            return PortNumber(port)
        }
    }
}

// Callers get validated objects — no invalid state possible
val email = EmailAddress.from("user@example.com") // Validated at creation
val port = PortNumber.of(8080) // Range-checked at creation
```

The `private constructor` is the key detail here. By making the constructor private and forcing creation through factory functions, you guarantee that every instance of `EmailAddress` in your entire codebase is valid. There's no way to sneak past the validation. This is what I call a smart constructor — it looks like a regular factory method, but it establishes an invariant that the type system alone can't express. The tradeoff is that these types can't be trivially deserialized by libraries like Moshi or Kotlinx Serialization without a custom adapter, but that adapter is usually 5 lines and worth writing once.

## Controlling Your Public API Surface

Here's a mistake I've made more than once: shipping a library module where half the public classes were implementation details I never intended anyone to use. In Kotlin, everything is `public` by default. That's the opposite of what you want for a library — every public class and function becomes a contract you have to maintain. A consumer starts depending on your internal `CacheManager`, and now you can't refactor it without a breaking change.

The `internal` modifier is your first line of defense. It restricts visibility to the current module, which in a multi-module Android project means the current Gradle module. I mark everything `internal` by default and only promote to `public` when a class genuinely belongs in the module's API contract. For Android library authors, `@RestrictTo(RestrictTo.Scope.LIBRARY)` serves a similar purpose — it doesn't prevent access at compile time, but Android Lint flags any usage outside the library, which catches accidental dependencies in code review.

```kotlin
// Public API — what consumers should use
public class PaymentClient(config: PaymentConfig) {
    fun processPayment(request: PaymentRequest): PaymentResult { 
        return engine.execute(request) 
    }
}

// Internal — visible within this module, invisible to consumers
internal class PaymentEngine {
    fun execute(request: PaymentRequest): PaymentResult { /* ... */ }
}

internal class RetryPolicy(val maxAttempts: Int = 3) {
    fun shouldRetry(attempt: Int, error: Throwable): Boolean { /* ... */ }
}

// For inline functions that need internal access
@PublishedApi
internal fun validateConfig(config: PaymentConfig) {
    require(config.apiKey.isNotBlank()) { "API key required" }
}

public inline fun paymentClient(block: PaymentConfig.Builder.() -> Unit): PaymentClient {
    val config = PaymentConfig.Builder().apply(block).build()
    validateConfig(config) // @PublishedApi allows inline access
    return PaymentClient(config)
}
```

The `@PublishedApi` annotation deserves attention. When you write an `inline` function, the function body gets inlined into the caller's code at compile time. If that inline function calls an `internal` function, the compiler complains — the caller's module can't see `internal` symbols. `@PublishedApi` makes the function accessible from inline code while keeping it hidden from normal callers. It's a niche tool, but when you need it, there's no substitute. Think of your module's API like a restaurant menu: `public` is what's on the menu, `internal` is the kitchen, and `@PublishedApi` is the kitchen door the waiter uses.

## Kotlin-Idiomatic Patterns

One of the easiest ways to spot a Kotlin API designed by someone thinking in Java is the builder pattern. The traditional `Builder().setX().setY().build()` works but feels mechanical. Kotlin's lambda-with-receiver syntax lets you create DSL builders that read like configuration blocks. The difference isn't just aesthetics — DSLs provide scope, nesting, and can enforce required fields at compile time through `@DslMarker`.

```kotlin
// Traditional builder — works, but verbose
val notification = Notification.Builder()
    .setTitle("Payment Received")
    .setBody("$50.00 from John")
    .setChannel(Channel.TRANSACTIONS)
    .setPriority(Priority.HIGH)
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

The tradeoff with DSLs is discoverability. A traditional builder has autocomplete for every `set` method. A DSL requires the developer to know which properties are available inside the lambda. Good documentation and a `@DslMarker` annotation to prevent accidental scope leaking are essential.

Default parameters are another area where Kotlin eliminates Java boilerplate. In Java, you'd write 4 overloads to handle different parameter combinations. In Kotlin, one function with defaults covers everything. Named arguments at the call site make the code self-documenting — `fetchUsers(page = 3, sortBy = SortField.CREATED_AT)` is instantly clear compared to `fetchUsers(3, 20, "name")`. If Java interop matters, add `@JvmOverloads`, but be aware it only generates overloads by removing parameters from right to left, so some combinations are inaccessible from Java.

Extension functions round out the idiomatic toolkit. The key insight: they should feel like they belong on the type. `String.toSlug()` makes sense. `String.processPayment()` does not — that's business logic shoehorned onto a data type. Keep extension functions scoped to the package that uses them, not in a global `Extensions.kt`. If an extension is used in only one file, make it `private`. Only make it `public` if it's genuinely part of your module's API.

## Real-World API Design Patterns

Theory is one thing, but I think the best API design lessons come from studying how production libraries actually work. Google's AndroidX libraries are a masterclass in what I'd call progressive disclosure — a simple entry point that works out of the box, with layers of customization available when you need them. Look at Room: you annotate a data class with `@Entity`, an interface with `@Dao`, and an abstract class with `@Database`. That's the 80% case, and it takes maybe 20 lines of code. But when you need migrations, type converters, multi-process support, or pre-packaged databases, Room exposes those surfaces without complicating the default path.

This progressive disclosure pattern should inform how you design your own APIs, especially repository interfaces and data layer contracts. I've seen teams create repository interfaces with 15 methods on day one because they might need them. The better approach: start with the smallest useful surface, and grow it when actual use cases demand it. A `UserRepository` with `getUser()`, `observeUser()`, and `saveUser()` serves most features. Add `searchUsers()` or `getUsersByRole()` when a feature actually calls for them, not before.

```kotlin
// Start minimal — covers 80% of use cases
interface UserRepository {
    suspend fun getUser(id: UserId): User
    fun observeUser(id: UserId): Flow<User>
    suspend fun saveUser(user: User)
}

// Extend through composition, not inheritance
interface SearchableUserRepository : UserRepository {
    suspend fun searchUsers(
        query: String,
        page: Int = 1,
        limit: Int = 20
    ): List<User>
}

// Config follows the same pattern — sensible defaults, overrides when needed
class UserRepositoryConfig(
    val cacheDuration: Duration = 5.minutes,
    val maxRetries: Int = 3,
    val prefetchOnLogin: Boolean = true
)
```

The naming convention I follow for repository methods: `get` for retrievals that may hit cache or network (fast if cached), `fetch` for operations that always bypass cache and hit the network, `save` for persistence (create or update), `delete` for removal, `observe` for returning a `Flow`. This vocabulary gives callers accurate expectations about performance — `getUser()` might be fast, `fetchUser()` will always be slow.

## Evolving APIs Without Breaking Things

The moment someone else uses your API — another module, another team, a library consumer — you're responsible for not breaking them. I've been on both sides of this: the developer who breaks things and the developer whose build turns red because a dependency changed its API. Neither side enjoys it.

The simplest backward compatibility strategy: make new parameters optional with defaults. Instead of changing `fun sendNotification(title: String, body: String)` to require a `channel` parameter, add it with a default value. Every existing call site continues to work. For more complex evolution, Kotlin's `@Deprecated` annotation with a `replaceWith` parameter gives callers a migration path — the IDE shows a warning with an auto-fix that transforms the old call to the new API.

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

Give deprecation at least one release cycle before removal. The tradeoff is that maintaining backward compatibility means living with past design decisions — sometimes a clean break is better than accumulating deprecated cruft. But breaking changes should be rare, intentional, and communicated well, not a side effect of a Friday afternoon refactor.

Thanks for reading!
