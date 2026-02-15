---
title: Kotlin Classes, Properties, and Constructors Guide
layout: post
sequence: 91
categories: post
tags:
  - Kotlin
  - Android
---

When I first moved from Java to Kotlin on an Android project, the thing that hit me hardest wasn't coroutines or extension functions — it was how much less code I needed for the basics. A Java POJO with 5 fields — name, email, age, role, active status — requires a private field declaration, a constructor assignment, a getter, a setter, an `equals()`, a `hashCode()`, and a `toString()`. That's roughly 80 lines of boilerplate for a class that carries five pieces of data. In Kotlin, the same thing is a one-line `data class`. What took an entire file in Java takes a single statement. That's not a minor convenience — it's an entire category of bugs (mismatched equals/hashCode, forgotten fields in toString, copy-paste errors in setters) that simply cannot happen.

But concise syntax isn't just about saving keystrokes. Every line of code you write is a line that can contain a bug. When you go from 80 lines to 5, you're not making the same logic shorter — you're eliminating the surface area where mistakes live. I've lost count of the number of times I've seen Java `equals()` implementations that check four fields when the class has five, or `hashCode()` methods that drift out of sync with `equals()` after a refactor adds a new field. Kotlin's class system was designed to make these errors structurally impossible. The properties, the constructors, the generated methods — they all work together so the compiler handles the ceremony and you focus on the logic that actually matters.

## Primary Constructors

In Kotlin, the constructor isn't a separate block inside the class body — it's part of the class header itself. You declare the class name and its constructor parameters in one line. But here's where it gets interesting: if you add `val` or `var` before a constructor parameter, Kotlin promotes it from a plain parameter to a class property. That single keyword does three things simultaneously — it declares the parameter, creates a backing field, and generates the accessor methods. No separate field declaration, no manual assignment in the constructor body.

```kotlin
class User(
    val name: String,
    val email: String,
    var isActive: Boolean = true
)
```

That's it. Three properties, a constructor, generated `equals`-compatible accessors, and a default value for `isActive`. The equivalent Java would be a field block, a constructor with three assignments, three getters, one setter, and probably a builder class if you're following best practices. The default value on `isActive` means callers can construct a `User("Alice", "alice@dev.com")` without specifying the active flag — it defaults to `true`. In Java, you'd need a second constructor overload for that behavior.

Constructor parameters without `val` or `var` are just parameters — they exist during construction and then disappear. They're useful when you need a value for initialization logic but don't want it stored as a property. I use this pattern when a constructor takes raw config data that gets transformed during initialization.

```kotlin
class DatabaseConfig(
    host: String,
    port: Int,
    val connectionString: String = "jdbc:postgresql://$host:$port/app_db"
)
```

Here `host` and `port` are plain parameters used to compute `connectionString`, which is the only property that survives. The caller provides the pieces, the class assembles them, and only the result is retained. This keeps the class API clean — consumers see `connectionString` and nothing else.

## Secondary Constructors

Primary constructors handle 90% of cases, but sometimes you need multiple construction paths. Secondary constructors use the `constructor` keyword inside the class body and must delegate to the primary constructor — either directly or through another secondary constructor. This delegation chain guarantees that the primary constructor's initialization always runs, which prevents the partially-initialized objects that plague Java codebases with multiple independent constructors.

```kotlin
class ApiException(
    val code: Int,
    override val message: String,
    override val cause: Throwable? = null
) : Exception(message, cause) {

    constructor(message: String) : this(
        code = -1,
        message = message
    )

    constructor(code: Int, message: String) : this(
        code = code,
        message = message,
        cause = null
    )
}
```

Each secondary constructor delegates to the primary with `this(...)`. This creates a funnel — no matter which constructor a caller uses, the object ends up fully initialized through the same path. In Java, it's common to see constructors that set some fields and forget others, especially when a class has five or six constructors added over time by different developers. Kotlin's mandatory delegation makes that structurally impossible.

I'll be honest though — I rarely write secondary constructors in practice. Default parameters on the primary constructor cover most cases. The main scenario where secondary constructors earn their keep is when extending Java classes that have multiple constructors (like Android's `View` class), or when the construction logic genuinely differs between entry points rather than just defaulting some values.

## init Blocks

The `init` block runs immediately after the primary constructor, and you can have multiple of them — they execute in the order they appear in the class body, interleaved with property initializations. This is where you put validation logic, computed setup, or anything that needs to run during construction but doesn't belong in a property initializer.

```kotlin
class DatabaseConnection(val url: String) {

    val host: String
    val port: Int
    val database: String

    init {
        require(url.startsWith("jdbc:")) {
            "Invalid JDBC URL: must start with 'jdbc:'"
        }
        require(url.contains("://")) {
            "Invalid JDBC URL: missing protocol separator"
        }
    }

    init {
        val parts = url.substringAfter("://").split(":", "/")
        host = parts.getOrElse(0) { throw IllegalArgumentException("Missing host") }
        port = parts.getOrElse(1) { "5432" }.toIntOrNull() ?: 5432
        database = parts.getOrElse(2) { "default" }
    }
}
```

The first `init` block validates the URL format using `require` — which throws `IllegalArgumentException` with your message if the condition fails. The second `init` block parses the URL into components. Splitting them into two blocks makes the intent clear: validate first, then parse. You could put everything in one `init` block, but separating validation from initialization is a pattern I've found makes classes easier to debug when construction fails. The `require` calls act as contract checks — if someone passes garbage to the constructor, they get a clear error message instead of a `NullPointerException` three method calls deep.

One important detail: `init` blocks and property initializers form a single initialization sequence. A property declared between two `init` blocks will be initialized between them. The compiler processes them top-to-bottom, which means the order in your source file actually matters for initialization. This is different from Java, where field initializers and instance initializer blocks have subtly different ordering rules that almost nobody remembers correctly.

## Properties Under the Hood

Every `val` in a Kotlin class compiles to a `private final` backing field plus a public getter method on the JVM. Every `var` compiles to a `private` backing field plus a public getter and setter. This is why Java code calling Kotlin classes uses `user.getName()` and `user.setEmail(...)` — those methods are generated by the compiler even though you never wrote them. Understanding this mapping is essential for interop, and it's also why Kotlin properties aren't just "fields with syntactic sugar." They're accessor-based abstractions that can contain arbitrary logic.

Custom getters let you compute a value on access instead of storing it. Custom setters let you intercept and validate writes. The `field` identifier inside a custom accessor refers to the actual backing field — it's a special keyword that only exists inside get/set blocks.

```kotlin
class Temperature(celsius: Double) {

    var celsius: Double = celsius
        set(value) {
            require(value >= -273.15) {
                "Temperature below absolute zero: $value°C"
            }
            field = value
        }

    val fahrenheit: Double
        get() = celsius * 9.0 / 5.0 + 32.0

    val kelvin: Double
        get() = celsius + 273.15
}
```

The `celsius` property has a custom setter that prevents physically impossible values. Note the `field = value` assignment — if you wrote `celsius = value` instead, you'd trigger the setter recursively and blow the stack. The `field` keyword is how Kotlin avoids that trap. The `fahrenheit` and `kelvin` properties have custom getters and no backing field at all — they're computed on every access from `celsius`. The compiler is smart enough to skip generating a backing field when a property only has a custom getter with no `field` reference.

Here's where it gets practical for Android. I use computed properties constantly for UI state derivation. A `ViewModel` might store raw data but expose computed properties for display:

```kotlin
class OrderSummaryViewModel(
    val items: List<OrderItem>,
    val taxRate: Double = 0.08
) {
    val subtotal: Double
        get() = items.sumOf { it.price * it.quantity }

    val tax: Double
        get() = subtotal * taxRate

    val total: Double
        get() = subtotal + tax

    val formattedTotal: String
        get() = "$${String.format("%.2f", total)}"

    val isEmpty: Boolean
        get() = items.isEmpty()
}
```

None of these computed properties store anything — they derive everything from `items` and `taxRate`. This means they're always consistent. You never hit a stale-cache bug where `subtotal` says one thing and `total` says another because someone forgot to recalculate after modifying the item list. The tradeoff is that complex computations re-execute on every access, so for expensive calculations you'd want to cache with a backing field and invalidate manually. But for simple derivations like these, the consistency guarantee outweighs the negligible performance cost.

## Visibility Modifiers

Kotlin's visibility system has four levels: `public` (default), `private`, `protected`, and `internal`. The most notable difference from Java is the default — Java defaults to package-private, which leaks implementation details to every class in the same package. Kotlin defaults to `public`, which sounds more permissive but actually encourages a better practice. When everything is public by default, you're forced to consciously think about what should be restricted. In Java, package-private is a silent middle ground that developers rely on without intention.

The `internal` modifier is Kotlin's genuinely unique contribution. It restricts visibility to the current module — meaning the current Gradle module, IntelliJ module, or Maven project. This is exactly what Android developers need for multi-module architectures. You want a class visible to everything in your `:feature:auth` module but invisible to `:feature:profile`? That's `internal`. Java's package-private can't do this because packages aren't module-aware — a class in `com.app.auth.internal` is accessible to any code that declares the same package, even in a different module.

I use `private` for implementation details that nothing outside the class should touch — backing data structures, helper functions, cached computations. `protected` is for base class members that subclasses need but external callers shouldn't see. `internal` is the sweet spot for module-level APIs: repository implementations, use-case classes, mapper functions that the feature module uses internally but shouldn't leak to the app module. And `public` is for the actual API surface you're intentionally exposing. The key insight is that each modifier maps to a real architectural boundary, not just an access control mechanism.

## Abstract Classes vs Interfaces

Both abstract classes and interfaces define contracts, but they serve different architectural roles. Interfaces can have default method implementations (since Kotlin 1.0, not a late addition like Java 8), but they cannot hold state — no backing fields, no constructors, no initialized properties that store data. Abstract classes can have constructors, hold state, and define both abstract and concrete members. The choice between them comes down to one question: does the contract need shared state?

```kotlin
interface Authenticator {
    fun authenticate(credentials: Credentials): AuthResult
    fun logout()

    // Default implementation — no state needed
    fun isTokenValid(token: String): Boolean {
        return token.isNotBlank() && token.length > 10
    }
}

abstract class BaseRepository(
    protected val apiService: ApiService,
    protected val database: AppDatabase
) {
    protected var lastSyncTimestamp: Long = 0L

    abstract suspend fun sync()

    protected fun shouldSync(): Boolean {
        return System.currentTimeMillis() - lastSyncTimestamp > SYNC_INTERVAL
    }

    companion object {
        const val SYNC_INTERVAL = 15 * 60 * 1000L // 15 minutes
    }
}
```

`Authenticator` is an interface because it defines behavior without needing shared state. Any class can implement it regardless of its inheritance hierarchy. `BaseRepository` is abstract because it needs to hold shared state (`apiService`, `database`, `lastSyncTimestamp`) and provide concrete helper methods that depend on that state. Subclasses like `UserRepository` and `OrderRepository` inherit the sync-checking logic and the service references without duplicating them.

The practical rule I follow in Android: use interfaces for defining capabilities (what a class can do), use abstract classes for sharing implementation (how related classes work). A `ClickHandler` should be an interface. A `BaseViewModel` with shared error handling and loading state should be an abstract class. Kotlin's single-inheritance constraint means you only get one abstract base class, so save it for genuine "is-a" relationships where shared state matters.

## Inheritance

Kotlin classes are `final` by default. You cannot extend a class unless it's explicitly marked `open`. This follows the advice from Effective Java — "Design and document for inheritance or else prohibit it." In practice, this means fragile base class problems are opt-in rather than the default. Every class you make `open` is a conscious decision that you're designing it for extension and accepting the maintenance cost that comes with it.

```kotlin
open class NetworkClient(
    protected val baseUrl: String,
    protected val timeout: Long = 30_000L
) {
    open fun buildHeaders(): Map<String, String> {
        return mapOf("Content-Type" to "application/json")
    }

    open fun handleError(code: Int, body: String): Nothing {
        throw NetworkException(code, body)
    }

    fun get(endpoint: String): Response {
        val headers = buildHeaders()
        return executeRequest("GET", "$baseUrl$endpoint", headers)
    }

    private fun executeRequest(
        method: String,
        url: String,
        headers: Map<String, String>
    ): Response {
        // actual HTTP execution
        return Response(200, "{}")
    }
}

class AuthenticatedClient(
    baseUrl: String,
    private val tokenProvider: () -> String
) : NetworkClient(baseUrl) {

    override fun buildHeaders(): Map<String, String> {
        return super.buildHeaders() + ("Authorization" to "Bearer ${tokenProvider()}")
    }

    override fun handleError(code: Int, body: String): Nothing {
        if (code == 401) throw SessionExpiredException("Token expired")
        super.handleError(code, body)
    }
}
```

Both the class and the individual methods need `open`. `NetworkClient` is `open` to allow subclassing. `buildHeaders()` and `handleError()` are `open` to allow overriding. `get()` is not `open` — subclasses use it but can't change its behavior, which is intentional. `executeRequest()` is `private` — it's an implementation detail that subclasses shouldn't touch at all. This granularity gives you precise control over your extension surface. In Java, every non-final method is overridable by default, which means your entire class is an extension point whether you designed it that way or not.

The `override` keyword isn't optional decoration — the compiler requires it. This protects you from accidental overrides when a base class adds a new method with the same signature as something you already defined. In Java, `@Override` is an optional annotation that you should use but the compiler won't enforce. Kotlin makes it a language requirement, which catches a real category of bugs at compile time rather than runtime.

One tradeoff worth mentioning: Kotlin's final-by-default design can conflict with mocking frameworks in tests. Libraries like Mockito can't create subclass-based mocks of final classes without extra configuration. This is why `mockito-inline` or the `all-open` compiler plugin exist. It's a real friction point, but I'd argue the production safety of final-by-default outweighs the test configuration cost. You're protecting every consumer of your class in exchange for one line in your build config.

Kotlin's class system does something rare — it takes the boilerplate that Java developers accepted for two decades and makes most of it disappear without losing any capability. Primary constructors, property declarations, smart defaults, and `final` by default aren't just syntactic conveniences. They're design decisions that push you toward safer, more intentional code. Every feature I've covered here — from `init` blocks validating invariants to `internal` visibility enforcing module boundaries — exists because the language designers studied what goes wrong in large codebases and made the safe choice the easy choice.

Thanks for reading!

## Quiz

#### What does a `val` property in a Kotlin class compile to on the JVM?

- **Wrong** A public field
- **Correct** A private final backing field with a public getter method
- **Wrong** A constant inlined at every use site
- **Wrong** A volatile field for thread safety

> **Explanation:** `val` compiles to a `private final` field with a generated getter. `var` compiles to a `private` field with both getter and setter. Java code accesses them through these getter/setter methods.

#### Why are Kotlin classes `final` by default?

- **Wrong** To improve compile times
- **Correct** To prevent accidental inheritance — classes must be explicitly marked `open` to be extended
- **Wrong** To reduce memory usage
- **Wrong** It's a compiler bug that was never fixed

> **Explanation:** Kotlin follows Effective Java's advice: "Design and document for inheritance or else prohibit it." Making classes final by default prevents fragile base class problems and makes the code's extension points explicit.

## Coding Challenge

Create a `BankAccount` class with: a primary constructor taking owner name and initial balance (default 0.0), a custom setter on balance that prevents negative values, computed properties for `isOverdrawn` and `formattedBalance`, an init block that validates the owner name, and a companion object factory method `createSavings` that sets a minimum balance. Include a secondary constructor that takes only owner name.

#### Solution

```kotlin
class BankAccount(
    val owner: String,
    initialBalance: Double = 0.0
) {
    var balance: Double = initialBalance
        set(value) {
            if (value < 0.0) {
                println("Transaction denied: balance cannot go below zero")
                return
            }
            field = value
        }

    val isOverdrawn: Boolean
        get() = balance <= 0.0

    val formattedBalance: String
        get() = "$${String.format("%.2f", balance)}"

    init {
        require(owner.isNotBlank()) {
            "Account owner name cannot be blank"
        }
        require(owner.length >= 2) {
            "Account owner name must be at least 2 characters"
        }
    }

    constructor(owner: String) : this(owner, 0.0)

    fun deposit(amount: Double) {
        require(amount > 0) { "Deposit amount must be positive" }
        balance += amount
    }

    fun withdraw(amount: Double): Boolean {
        require(amount > 0) { "Withdrawal amount must be positive" }
        val newBalance = balance - amount
        if (newBalance < 0.0) return false
        balance = newBalance
        return true
    }

    companion object {
        private const val MIN_SAVINGS_BALANCE = 100.0

        fun createSavings(owner: String, initialDeposit: Double): BankAccount {
            require(initialDeposit >= MIN_SAVINGS_BALANCE) {
                "Savings account requires minimum $$MIN_SAVINGS_BALANCE"
            }
            return BankAccount(owner, initialDeposit)
        }
    }
}

fun main() {
    val account = BankAccount("Alice", 500.0)
    println("${account.owner}: ${account.formattedBalance}")  // Alice: $500.00

    account.deposit(250.0)
    println("After deposit: ${account.formattedBalance}")     // $750.00

    account.withdraw(800.0)  // returns false — would go negative
    println("Is overdrawn: ${account.isOverdrawn}")           // false

    val savings = BankAccount.createSavings("Bob", 200.0)
    println("Savings: ${savings.formattedBalance}")           // $200.00
}
```
