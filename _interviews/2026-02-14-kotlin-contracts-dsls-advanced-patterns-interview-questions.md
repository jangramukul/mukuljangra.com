---
title: "Kotlin Contracts, DSLs & Advanced Patterns"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 10
sequence: 51
description: "These topics separate senior Kotlin developers from intermediate ones."
---

## Kotlin Contracts, DSLs & Advanced Patterns

These topics separate senior Kotlin developers from intermediate ones. Contracts, DSL builders, context receivers, and sealed hierarchies for error handling show up in senior-level and staff-level interviews at companies that use Kotlin heavily.

### Core Questions (Beginner → Intermediate)

#### Q1: What are inline value classes and why would you use them?

Inline value classes (declared with `@JvmInline value class`) wrap a single value without runtime allocation overhead. The compiler replaces the wrapper with the underlying value at compile time, so you get type safety without the cost of creating objects on the heap.

```kotlin
@JvmInline
value class UserId(val id: String)

@JvmInline
value class OrderId(val id: String)

fun fetchOrder(userId: UserId, orderId: OrderId) { ... }

// Won't compile — type safe even though both are Strings
fetchOrder(orderId, userId)
```

Common use cases are wrapping primitive types to prevent mixing them up (passing an `OrderId` where a `UserId` is expected), units of measurement (`Meters` vs `Feet`), and validated wrappers (an `Email` class that validates format at construction). The compiler boxes the value class when it's used as a nullable type, stored in a collection, or passed as a generic type parameter.

#### Q2: What is the Result type in Kotlin?

`Result<T>` is a built-in inline class that wraps either a successful value or a `Throwable`. It replaces the pattern of using nullable returns or try-catch blocks for operations that can fail. You create successes with `Result.success(value)` and failures with `Result.failure(exception)`.

```kotlin
fun parseConfig(raw: String): Result<Config> {
    return runCatching {
        Json.decodeFromString<Config>(raw)
    }
}

val config = parseConfig(rawJson)
    .map { it.copy(debug = false) }
    .getOrElse { Config.default() }
```

`Result` has functional operators — `map`, `mapCatching`, `getOrElse`, `getOrDefault`, `onSuccess`, `onFailure`, `fold`, and `recover`. One restriction: Kotlin doesn't allow `Result` as a direct return type of a function declared with the `suspend` modifier because coroutines already use `Result` internally for their continuation mechanism. You can return `Result` from regular functions without any issues.

#### Q3: How do sealed classes and sealed interfaces help with error handling?

Sealed hierarchies let you model a fixed set of outcomes that the compiler can verify exhaustively in `when` expressions. Unlike exceptions, they make error cases explicit in the function signature and force callers to handle every case.

```kotlin
sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>
    data class HttpError(val code: Int, val message: String) : NetworkResult<Nothing>
    data class NetworkError(val cause: Throwable) : NetworkResult<Nothing>
    data object Loading : NetworkResult<Nothing>
}

fun handleResult(result: NetworkResult<User>) = when (result) {
    is NetworkResult.Success -> showUser(result.data)
    is NetworkResult.HttpError -> showError(result.message)
    is NetworkResult.NetworkError -> showRetry()
    is NetworkResult.Loading -> showLoader()
    // No else needed — compiler knows all cases
}
```

Sealed interfaces are more flexible than sealed classes because a subtype can implement multiple sealed interfaces. The `Nothing` type parameter on error subtypes lets them work with any `NetworkResult<T>` since `Nothing` is a subtype of everything.

#### Q4: What is the difference between sealed class and sealed interface?

A sealed class can hold state (constructor properties) and provide shared behavior. A sealed interface has no constructor and allows subtypes from different class hierarchies.

The key difference — a class can only extend one sealed class (single inheritance), but it can implement multiple sealed interfaces. If your subtypes need to belong to multiple restricted hierarchies, sealed interfaces are the only option. Both must have their direct subtypes defined in the same package and module.

Use sealed classes when subtypes share common state or constructor logic. Use sealed interfaces when you only need to restrict the type hierarchy and want the flexibility of multiple interface implementation.

#### Q5: What is class delegation in Kotlin and how does it differ from inheritance?

Class delegation lets a class implement an interface by forwarding all method calls to a delegate object, without inheriting from it. The compiler generates the forwarding code at compile time.

```kotlin
interface Analytics {
    fun trackEvent(name: String)
    fun trackScreen(screen: String)
}

class FirebaseAnalytics : Analytics {
    override fun trackEvent(name: String) { /* Firebase impl */ }
    override fun trackScreen(screen: String) { /* Firebase impl */ }
}

class AnalyticsLogger(
    delegate: Analytics
) : Analytics by delegate {
    override fun trackEvent(name: String) {
        println("Event: $name")  // extra behavior
        delegate.trackEvent(name)
    }
    // trackScreen is forwarded automatically
}
```

With inheritance, you'd need to extend `FirebaseAnalytics`, locking yourself into its implementation. With delegation, you can swap the delegate at construction time — pass `FirebaseAnalytics` in production and `FakeAnalytics` in tests. You can override specific methods while the rest are forwarded automatically.

#### Q6: What is interface delegation and how is it used for the Decorator pattern?

Interface delegation is Kotlin's built-in support for the Decorator pattern. You implement an interface, delegate all calls to an existing implementation, and selectively override the methods you want to change. The compiler handles the boilerplate.

Without delegation, decorating an interface with 10 methods means writing 10 forwarding methods manually. With `by`, you only write overrides for the methods you actually want to modify. This is how Kotlin's standard library implements things like `Collections.unmodifiableList` — it delegates everything and throws on mutation methods.

#### Q7: What is a DSL in Kotlin and what language features make it possible?

A DSL (Domain-Specific Language) in Kotlin uses lambdas with receivers, extension functions, and operator overloading to create code that reads like a specialized language. The key feature is the lambda with receiver — `T.() -> Unit` — which lets code inside the lambda access `T`'s members directly without qualification.

```kotlin
fun buildHtml(init: HtmlBuilder.() -> Unit): String {
    val builder = HtmlBuilder()
    builder.init()
    return builder.build()
}

val page = buildHtml {
    head { title("My Page") }  // 'this' is HtmlBuilder
    body {
        p("Hello, world!")
    }
}
```

The standard library uses this pattern everywhere — `buildList`, `apply`, `with`, `buildString`. Frameworks like Ktor, Exposed, and Jetpack Compose are built entirely on this concept.

### Deep Dive Questions (Advanced → Expert)

#### Q8: What are Kotlin contracts and what problem do they solve?

Contracts let you communicate information to the compiler that it can't infer on its own. The compiler uses this information for smarter type checking and control flow analysis. Without contracts, calling a function like `require(x != null)` wouldn't smart-cast `x` to non-null in the code that follows — the compiler can't look inside function bodies.

```kotlin
@OptIn(ExperimentalContracts::class)
fun requireUser(user: User?) {
    contract {
        returns() implies (user != null)
    }
    if (user == null) throw IllegalArgumentException("User required")
}

fun processUser(user: User?) {
    requireUser(user)
    // Compiler knows user is non-null here because of the contract
    println(user.name)
}
```

Contracts are still `@ExperimentalContracts` as of Kotlin 2.x, but the standard library uses them extensively. Functions like `require()`, `check()`, `checkNotNull()`, and `requireNotNull()` all have contracts that enable smart casting after the call.

#### Q9: What does the callsInPlace contract effect do?

`callsInPlace` tells the compiler how many times a lambda parameter will be invoked. This enables two things: the compiler can allow `val` initialization inside the lambda, and it can verify that the variable is definitely assigned after the function call.

```kotlin
@OptIn(ExperimentalContracts::class)
inline fun <R> executeOnce(block: () -> R): R {
    contract {
        callsInPlace(block, InvocationKind.EXACTLY_ONCE)
    }
    return block()
}

fun example() {
    val result: String
    executeOnce {
        result = "initialized"  // allowed because of callsInPlace
    }
    println(result)  // compiler knows result is assigned
}
```

The four invocation kinds are `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE`, and `UNKNOWN` (default). `EXACTLY_ONCE` is the most common — it's used by `run`, `with`, `apply`, `also`, `let`, and `buildList`. Without this contract, the compiler would reject the `val` assignment because it can't prove the lambda runs exactly once.

#### Q10: What does returns implies do in a contract?

`returns() implies (condition)` tells the compiler that if the function returns normally (without throwing), the given condition is true. This enables smart casting after the function call.

```kotlin
@OptIn(ExperimentalContracts::class)
fun isValidSession(session: Session?): Boolean {
    contract {
        returns(true) implies (session != null)
    }
    return session != null && !session.isExpired
}

fun loadDashboard(session: Session?) {
    if (isValidSession(session)) {
        // session is smart-cast to non-null here
        showDashboard(session.userId)
    }
}
```

You can also use `returns(true)`, `returns(false)`, or `returns(null)` to tie the implication to a specific return value. This is how `isNullOrEmpty()` and `isNullOrBlank()` enable smart casting — they have `returns(false) implies (this != null)` contracts.

#### Q11: What is @DslMarker and why is it important for type-safe builders?

`@DslMarker` prevents accidental access to outer receivers in nested DSL blocks. Without it, inner blocks can implicitly call methods from any enclosing receiver, which leads to confusing bugs.

```kotlin
@DslMarker
annotation class HtmlDsl

@HtmlDsl
class Table {
    fun tr(init: Row.() -> Unit) { ... }
}

@HtmlDsl
class Row {
    fun td(text: String) { ... }
}

// Without @DslMarker — this compiles but is wrong
table {
    tr {
        tr { }  // accidentally calling table's tr from inside row
    }
}

// With @DslMarker — compiler error on the inner tr
```

When you annotate builder classes with `@DslMarker`, the compiler restricts implicit access to only the closest receiver. You can still access outer receivers explicitly with a labeled `this` (`this@table.tr {}`), but the accidental case is prevented. Every production DSL should use `@DslMarker`.

#### Q12: How do you build a type-safe builder in Kotlin? Walk through the pattern.

A type-safe builder combines lambdas with receivers, builder classes, and `@DslMarker` to create a structured API where the compiler enforces valid nesting.

```kotlin
@DslMarker
annotation class FormDsl

@FormDsl
class FormBuilder {
    private val fields = mutableListOf<Field>()

    fun textField(name: String, init: TextFieldBuilder.() -> Unit = {}) {
        val builder = TextFieldBuilder(name)
        builder.init()
        fields.add(builder.build())
    }

    fun build(): Form = Form(fields)
}

@FormDsl
class TextFieldBuilder(private val name: String) {
    var required: Boolean = false
    var maxLength: Int = 255
    fun build(): Field = Field(name, required, maxLength)
}

fun form(init: FormBuilder.() -> Unit): Form {
    return FormBuilder().apply(init).build()
}

// Usage
val loginForm = form {
    textField("email") { required = true }
    textField("password") { required = true; maxLength = 50 }
}
```

The entry point function (`form`) creates the root builder, the lambda with receiver (`FormBuilder.() -> Unit`) provides the scope, and each nested function creates child builders with their own scopes. `@DslMarker` ensures `textField` can't accidentally be called inside `TextFieldBuilder`.

#### Q13: What are context receivers (context parameters) and what problem do they solve?

Context receivers (being redesigned as context parameters in newer Kotlin versions) let you declare that a function requires certain objects to be in scope without passing them as regular parameters. They're like implicit parameters — the caller provides the context, and the function can use it directly.

```kotlin
context(Logger, TransactionScope)
fun processPayment(payment: Payment) {
    log("Processing payment ${payment.id}")  // from Logger
    execute("INSERT INTO payments ...") // from TransactionScope
}

// Caller must provide both contexts
with(logger) {
    with(transactionScope) {
        processPayment(payment)
    }
}
```

The problem they solve is "parameter drilling" — passing the same dependency through 5 layers of functions. Without context receivers, you'd either pass `Logger` and `TransactionScope` as parameters to every function in the chain, or use global singletons. Context receivers provide the middle ground — explicit about what's needed, implicit about how it's threaded through.

This feature is still evolving. The original `context()` syntax is being replaced with `context(param: Type)` syntax in Kotlin 2.2+ as "context parameters," which are more explicit and composable.

#### Q14: How does the delegation pattern compare to dependency injection? When do you use which?

Both solve the problem of decoupling a class from its dependencies, but at different levels. Class delegation is a language-level pattern — the compiler generates forwarding code and you get interface implementation for free. DI is an architecture-level pattern — a framework (Hilt, Koin, Metro) provides dependencies at runtime.

Delegation is for when a class needs to act as a particular interface by forwarding to an implementation. DI is for when a class needs to use a dependency without knowing how to create it. They work well together — you can use DI to provide the delegate instance and class delegation to implement the interface.

```kotlin
class OfflineFirstRepository(
    private val localSource: DataSource,   // injected by DI
    private val remoteSource: DataSource   // injected by DI
) : DataSource by localSource {
    // All DataSource methods forward to localSource
    // Override specific methods for sync logic
    override suspend fun getItems(): List<Item> {
        return try {
            remoteSource.getItems().also { localSource.saveItems(it) }
        } catch (e: IOException) {
            localSource.getItems()
        }
    }
}
```

#### Q15: How do you use sealed hierarchies with when expressions for exhaustive error handling?

The compiler enforces exhaustive `when` on sealed types — you must handle every subtype or add an `else` branch. Removing the `else` is the entire point, because it means adding a new sealed subtype produces a compile error at every unhandled `when`, forcing you to handle it.

```kotlin
sealed interface AuthState {
    data object Idle : AuthState
    data object Loading : AuthState
    data class Authenticated(val user: User) : AuthState
    data class Error(val reason: AuthError) : AuthState
}

sealed interface AuthError {
    data object InvalidCredentials : AuthError
    data object NetworkFailure : AuthError
    data object AccountLocked : AuthError
}

fun renderAuth(state: AuthState) = when (state) {
    is AuthState.Idle -> showLoginForm()
    is AuthState.Loading -> showSpinner()
    is AuthState.Authenticated -> showHome(state.user)
    is AuthState.Error -> when (state.reason) {
        AuthError.InvalidCredentials -> showBadPassword()
        AuthError.NetworkFailure -> showRetry()
        AuthError.AccountLocked -> showContactSupport()
    }
}
```

The nested `when` on `AuthError` is also exhaustive. If you add `AccountSuspended` to `AuthError`, both the inner and outer `when` will break at compile time if not handled. This is much safer than using string error codes or integer constants.

#### Q16: How does Result compare to sealed classes for error handling? When would you choose one over the other?

`Result<T>` wraps success or failure as `Throwable`. It's good for simple success/fail operations where you just need to know if something worked. Sealed classes let you define specific, typed error cases that callers must handle explicitly.

Use `Result` when errors are generic (parsing failed, network call failed) and you just need the exception message. Use sealed hierarchies when errors are domain-specific and need different handling — `InvalidCredentials` should show a different UI than `NetworkFailure`. `Result` works well with `runCatching` for wrapping exception-throwing code. Sealed classes work well when you control the error definitions and want compile-time exhaustiveness.

In practice, many codebases use sealed classes at the domain layer (repository, use case) and `Result` at the infrastructure layer (JSON parsing, file I/O) where errors are more generic.

#### Q17: What are the limitations of Kotlin contracts? Why are they still experimental?

Contracts have several limitations. The compiler trusts contracts without verifying them — if you write a contract that says a function returns implies a condition, but your implementation doesn't actually enforce it, the compiler won't catch the lie. This can lead to unsound type casts at runtime.

Contracts can only be declared on top-level functions or member functions, not on lambdas or local functions. The condition syntax is limited — you can use `implies`, `returns`, and `callsInPlace`, but you can't express more complex relationships like "parameter A and parameter B are the same type." They also can't reference variables outside their scope.

The API has remained experimental because the Kotlin team is still exploring how to make contracts both expressive and sound. Making them fully verifiable at compile time is a hard problem — essentially theorem proving. For now, they work well for the common patterns the standard library needs.

#### Q18: Explain how Kotlin's apply, with, run, let, and also relate to DSL building.

All scope functions use lambdas with receivers or lambda parameters, which is the same mechanism that powers DSLs. `apply` and `with` use `T.() -> Unit` — the lambda's `this` is the receiver, so you can call methods directly. `let` and `also` pass the object as `it` parameter instead.

For DSL building, `apply` is the most relevant. When a builder function takes `T.() -> Unit`, calling `apply(init)` or `init()` on a builder instance provides the receiver scope. The DSL entry point creates a builder, applies the lambda, and returns the result.

```kotlin
// This DSL pattern
fun notification(init: NotificationBuilder.() -> Unit): Notification {
    return NotificationBuilder().apply(init).build()
}

// Uses the same mechanism as
val builder = NotificationBuilder().apply {
    title = "New Message"
    body = "You have 3 unread messages"
}
```

The difference between a scope function and a DSL is intent. Scope functions configure a single object. DSLs create nested, structured configurations with multiple builder types.

### Common Follow-ups

- Can you write a contract for a function that guarantees a callback is never called?
- How would you test a DSL builder to verify it produces the correct output?
- What happens if you use `@DslMarker` on a scope function like `apply`?
- How do context receivers interact with coroutine scopes and `CoroutineScope` receivers?
- Can a value class implement an interface? What are the boxing implications?
- How would you model a state machine using sealed classes and transitions?
- What's the difference between `runCatching` and try-catch in terms of performance and stack traces?
- How does Kotlin's delegation pattern differ from Java's Proxy mechanism?
