---
title: API Design Best Practices Guide
layout: post
categories: post
tags:
  - Kotlin
  - Best Practices
  - Design Patterns
---

Over the years, I've reviewed a lot of Kotlin codebases — internal libraries, SDK modules, shared data layers — and the pattern I keep seeing is the same. The code works. The tests pass. But the API surface? A minefield. Functions accept raw strings where they should accept typed wrappers. Builders require seven parameters in an undocumented order. Someone adds a required parameter and three call sites in another module explode. The code is correct, but the API is hostile, and every consumer pays the tax.

Here's the thing that rewired how I think about API design. A good API isn't about making things easy to use correctly — it's about making things **hard to use incorrectly**. Think of it like a children's shape-sorting toy. You know the one — the box with the star hole, the circle hole, the square hole. A toddler can't shove a star through the circle hole no matter how hard they try. That's what your type system should feel like. The compiler should be your first line of defense, not your test suite. If you can construct an invalid state, someone eventually will, and it'll happen at 2 AM on a Saturday in production. I'd rather spend an extra hour modeling types upfront than spend a weekend debugging a stringly-typed mess.

## Making Invalid States Impossible

Imagine you're building a payment system. You represent the payment method as a `String`. Credit card? `"credit"`. PayPal? `"paypal"`. And then one day, someone passes `"banana"`.

Sounds ridiculous, right? But that's exactly what happens when your function accepts a `String` for a currency code. If it accepts a `CurrencyCode` enum instead, they physically can't pass `"banana"`. The compiler won't let them. Every bug prevented by the type system is a bug you never have to write a test for, never have to debug in production, and never have to explain in a postmortem.

Sealed interfaces are the sharpest tool here. Instead of representing a payment method as a `String` with possible values `"credit"`, `"debit"`, `"paypal"` — model it as a sealed hierarchy where each variant carries exactly the data it needs. A credit card has a number and expiry. PayPal has an email. Cash has neither. And here's the real payoff: when you add a new variant, every `when` expression that handles the hierarchy breaks at compile time until the consumer handles the new case. That's the type system doing your QA work for free.

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

Look at the stringly-typed version. Nothing stops you from creating a `Payment(method = "credit", cardNumber = null, paypalEmail = "wat@lol.com")`. A credit card payment with no card number and a PayPal email? Sure, the compiler says, that looks fine to me. The sealed version makes that state literally impossible to construct.

Now here's where it gets even more interesting. The `CardNumber` and `EmailAddress` value classes add another layer — they prevent mixing up which `String` goes where. Kotlin's `@JvmInline value class` wraps a primitive in a named type with zero runtime allocation. At runtime, `UserId` is just a `String` — no wrapper object, no extra memory. But at compile time, `processRefund(orderId, userId, amount)` won't compile if you swap the `UserId` and `OrderId` parameters. I use value classes for any ID type, any monetary amount, and any domain quantity where confusion with another same-typed parameter is plausible.

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

That second version without value classes? It compiles happily, refunds the wrong user, and you find out about it from an angry customer support ticket. The third version? The compiler catches it before you even run a test. That's the difference.

The tradeoff is more types, more files, and more boilerplate for simple cases. For a prototype or internal tool, string parameters might be fine. For a public API or a domain model that multiple teams consume, the upfront investment in types pays for itself in prevented bugs. The core idea: **push validation from runtime to compile time.**

> **💡 The "aha" moment:** A good API is like a well-designed physical tool — you shouldn't need to read the manual to avoid hurting yourself. If the shape-sorting toy lets the star fit through the circle hole, that's not a user error. That's a design error.

## Factory Functions and Smart Constructors

Raw constructors are honest — they expose exactly how an object is built. But sometimes that honesty is a liability. Picture this: a constructor takes five parameters, three of which have complex validation rules. You're essentially handing every caller a manual and saying "good luck, don't mess it up." That's like giving someone a car engine and expecting them to assemble it before they can drive.

Factory functions in a `companion object` let you hide that complexity behind a clear, intention-revealing name. Instead of the caller doing the assembly, you hand them the keys.

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

See that `private constructor`? That's the key detail. By making the constructor private and forcing creation through factory functions, you guarantee that every instance of `EmailAddress` in your entire codebase is valid. There's no back door, no way to sneak past the validation. This is what I call a smart constructor — it looks like a regular factory method, but it establishes an invariant that the type system alone can't express.

Think of it like a nightclub bouncer. The bouncer (factory function) checks your ID (validates the input) before you get in. There's no side entrance. If you're inside the club, you've been checked. If you're holding an `EmailAddress`, it's valid. Period.

The tradeoff is that these types can't be trivially deserialized by libraries like Moshi or Kotlinx Serialization without a custom adapter, but that adapter is usually 5 lines and worth writing once.

## Controlling Your Public API Surface

Here's a mistake I've made more than once: shipping a library module where half the public classes were implementation details I never intended anyone to use. In Kotlin, everything is `public` by default. Wait, what? Yeah — the opposite of what you want for a library. Every public class and function becomes a contract you have to maintain. A consumer starts depending on your internal `CacheManager`, and now you can't refactor it without a breaking change.

This is like building a house and accidentally leaving all the plumbing exposed on the outside walls. Someone's going to hang a coat on a pipe, and now you can't move that pipe without breaking their coat hook. You wanted the plumbing hidden inside the walls from the start.

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

Now, the `@PublishedApi` annotation deserves attention. When you write an `inline` function, the function body gets inlined into the caller's code at compile time. If that inline function calls an `internal` function, the compiler complains — the caller's module can't see `internal` symbols. `@PublishedApi` makes the function accessible from inline code while keeping it hidden from normal callers. It's a niche tool, but when you need it, there's no substitute.

Back to the restaurant analogy: `public` is what's on the menu, `internal` is the kitchen, and `@PublishedApi` is the kitchen door the waiter uses. Customers don't walk into the kitchen, but the waiter needs access to bring the food out.

> **🧠 Think about it:** Look at the last library module you shipped. How many of the public classes were genuinely part of the API contract — and how many were implementation details that leaked out because you forgot to mark them `internal`?

## Kotlin-Idiomatic Patterns

You know what's the fastest way to spot a Kotlin API designed by someone still thinking in Java? The builder pattern. `Builder().setX().setY().build()` — it works, but it reads like filling out a government form. Name here. Date here. Sign here. Initial here. Stamp here.

Kotlin's lambda-with-receiver syntax lets you create DSL builders that read like configuration blocks instead. And the difference isn't just aesthetics — DSLs provide scope, nesting, and can enforce required fields at compile time through `@DslMarker`.

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

Read those two side by side. The DSL version reads like you're describing what you want, not instructing a machine how to build it. That's the shift.

The tradeoff with DSLs is discoverability. A traditional builder has autocomplete for every `set` method. A DSL requires the developer to know which properties are available inside the lambda. Good documentation and a `@DslMarker` annotation to prevent accidental scope leaking are essential.

Default parameters are another area where Kotlin eliminates Java boilerplate. In Java, you'd write 4 overloads to handle different parameter combinations. In Kotlin, one function with defaults covers everything. Named arguments at the call site make the code self-documenting — `fetchUsers(page = 3, sortBy = SortField.CREATED_AT)` is instantly clear compared to `fetchUsers(3, 20, "name")`. What does `20` mean? What does `"name"` mean? You'd have to go read the function signature. Named arguments eliminate that guesswork entirely. If Java interop matters, add `@JvmOverloads`, but be aware it only generates overloads by removing parameters from right to left, so some combinations are inaccessible from Java.

Extension functions round out the idiomatic toolkit. Here's the key insight: they should feel like they belong on the type. `String.toSlug()` makes sense — slugifying is a natural thing to do with a string. `String.processPayment()` does not — that's business logic shoehorned onto a data type. It's like duct-taping a coffee maker to your steering wheel. Sure, it technically works, but nobody expects it there. Keep extension functions scoped to the package that uses them, not in a global `Extensions.kt`. If an extension is used in only one file, make it `private`. Only make it `public` if it's genuinely part of your module's API.

## Real-World API Design Patterns

Theory is one thing. But I think the best API design lessons come from studying how production libraries actually work.

Google's AndroidX libraries are a masterclass in what I'd call progressive disclosure. It's the same idea behind a good camera. Point and shoot mode for beginners, manual controls for pros, and you never see the manual controls unless you go looking for them. Look at Room: you annotate a data class with `@Entity`, an interface with `@Dao`, and an abstract class with `@Database`. That's the 80% case, and it takes maybe 20 lines of code. But when you need migrations, type converters, multi-process support, or pre-packaged databases, Room exposes those surfaces without complicating the default path.

This progressive disclosure pattern should inform how you design your own APIs, especially repository interfaces and data layer contracts. I've seen teams create repository interfaces with 15 methods on day one because they *might* need them. Can you guess what happens? Half those methods never get called. The other half get called wrong because nobody remembers what `getUsersFiltered()` vs `getUsersByFilter()` vs `getFilteredUserList()` was supposed to do.

The better approach: start with the smallest useful surface, and grow it when actual use cases demand it. A `UserRepository` with `getUser()`, `observeUser()`, and `saveUser()` serves most features. Add `searchUsers()` or `getUsersByRole()` when a feature actually calls for them, not before.

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

> **🔥 Real talk:** I've watched teams name every data retrieval method `get` and then wonder why their app is sluggish. When `getUser()` secretly hits the network every time, the name is lying to you. `fetch` makes the cost visible. Your future self will thank you for being honest in your naming.

## Evolving APIs Without Breaking Things

The moment someone else uses your API — another module, another team, a library consumer — you're responsible for not breaking them. I've been on both sides of this: the developer who breaks things and the developer whose build turns red because a dependency changed its API. Neither side enjoys it. It's like remodeling your kitchen and accidentally bricking your neighbor's plumbing because the pipes are connected.

The simplest backward compatibility strategy: make new parameters optional with defaults. Instead of changing `fun sendNotification(title: String, body: String)` to require a `channel` parameter, add it with a default value. Every existing call site continues to work. No one's build breaks. No angry Slack messages.

For more complex evolution, Kotlin's `@Deprecated` annotation with a `replaceWith` parameter gives callers a migration path — the IDE shows a warning with an auto-fix that transforms the old call to the new API. It's like putting up a "road closed, use detour" sign instead of just bulldozing the road while people are driving on it.

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

> **⚡ Quick check:** Can you add a new required parameter to one of your public API functions right now without breaking any existing callers? If not, you probably need a default value or a request object wrapper.

Thanks for reading!
