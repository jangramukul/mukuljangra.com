---
title: "Kotlin Contracts, DSLs & Advanced Patterns"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 28
sequence: 28
description: "These topics separate senior Kotlin developers from intermediate ones."
---

## Kotlin Contracts, DSLs & Advanced Patterns

These topics separate senior Kotlin developers from intermediate ones. Contracts, DSL builders, context receivers, and sealed hierarchies for error handling show up in senior-level interviews at companies that use Kotlin heavily.

#### What is the Result type in Kotlin?

`Result<T>` is a built-in inline class that wraps either a successful value or a `Throwable`. It replaces using nullable returns or try-catch for operations that can fail.

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

`Result` has functional operators — `map`, `mapCatching`, `getOrElse`, `getOrDefault`, `onSuccess`, `onFailure`, `fold`, and `recover`. One restriction: `Result` can't be a direct return type of a `suspend` function because coroutines use `Result` internally.

#### How do sealed classes help with error handling?

Sealed hierarchies model a fixed set of outcomes that the compiler verifies exhaustively. Unlike exceptions, they make error cases explicit in the function signature and force callers to handle every case.

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
}
```

The `Nothing` type parameter on error subtypes lets them work with any `NetworkResult<T>`.

#### How does Result compare to sealed classes for error handling?

`Result<T>` wraps success or failure as `Throwable`. It's good for simple pass/fail operations. Sealed classes let you define specific, typed error cases that callers must handle.

Use `Result` when errors are generic (parsing failed, network call failed). Use sealed hierarchies when errors are domain-specific and need different handling — `InvalidCredentials` should show different UI than `NetworkFailure`. Many codebases use sealed classes at the domain layer and `Result` at the infrastructure layer.

#### What is class delegation and how does it differ from inheritance?

Class delegation lets a class implement an interface by forwarding all calls to a delegate object. The compiler generates the forwarding code at compile time.

```kotlin
interface Analytics {
    fun trackEvent(name: String)
    fun trackScreen(screen: String)
}

class AnalyticsLogger(
    delegate: Analytics
) : Analytics by delegate {
    override fun trackEvent(name: String) {
        println("Event: $name")
        delegate.trackEvent(name)
    }
    // trackScreen forwarded automatically
}
```

With inheritance, you'd extend the implementation class, locking yourself into it. With delegation, you can swap the delegate — pass `FirebaseAnalytics` in production and `FakeAnalytics` in tests. You can override specific methods while the rest are forwarded.

#### What is interface delegation and the Decorator pattern?

Interface delegation is Kotlin's built-in support for the Decorator pattern. You implement an interface, delegate all calls to an existing implementation, and selectively override methods. The compiler handles the boilerplate — decorating a 10-method interface means writing overrides only for the methods you change.

#### What is a DSL in Kotlin and what makes it possible?

A DSL (Domain-Specific Language) uses lambdas with receivers, extension functions, and operator overloading to create code that reads like a specialized language. The key feature is the lambda with receiver — `T.() -> Unit` — which lets code inside the lambda access `T`'s members directly.

```kotlin
fun buildHtml(init: HtmlBuilder.() -> Unit): String {
    val builder = HtmlBuilder()
    builder.init()
    return builder.build()
}

val page = buildHtml {
    head { title("My Page") }
    body { p("Hello, world!") }
}
```

The standard library uses this pattern everywhere — `buildList`, `apply`, `with`, `buildString`. Frameworks like Ktor and Jetpack Compose are built on this concept.

#### What is @DslMarker and why is it important?

`@DslMarker` prevents accidental access to outer receivers in nested DSL blocks. Without it, inner blocks can implicitly call methods from any enclosing receiver.

```kotlin
@DslMarker
annotation class HtmlDsl

@HtmlDsl
class Table { fun tr(init: Row.() -> Unit) { ... } }

@HtmlDsl
class Row { fun td(text: String) { ... } }

// Without @DslMarker — compiles but is wrong
table {
    tr {
        tr { }  // accidentally calling table's tr inside row
    }
}

// With @DslMarker — compiler error on inner tr
```

When builder classes are annotated with `@DslMarker`, the compiler restricts implicit access to the closest receiver only. Every production DSL should use it.

#### How do you build a type-safe builder?

A type-safe builder combines lambdas with receivers, builder classes, and `@DslMarker`.

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

val loginForm = form {
    textField("email") { required = true }
    textField("password") { required = true; maxLength = 50 }
}
```

#### What are Kotlin contracts and what problem do they solve?

Contracts let you tell the compiler information it can't infer on its own — for smarter type checking and control flow analysis. Without contracts, calling `require(x != null)` wouldn't smart-cast `x` to non-null in subsequent code.

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
    println(user.name) // smart-cast to non-null
}
```

Standard library functions like `require()`, `check()`, `checkNotNull()` all have contracts.

#### What does callsInPlace do in a contract?

`callsInPlace` tells the compiler how many times a lambda parameter will be invoked. This lets the compiler allow `val` initialization inside the lambda and verify definite assignment.

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
    println(result)  // compiler knows it's assigned
}
```

The four kinds are `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE`, and `UNKNOWN`. `EXACTLY_ONCE` is used by `run`, `with`, `apply`, `also`, `let`, and `buildList`.

#### What does returns implies do?

`returns() implies (condition)` tells the compiler that if the function returns normally, the condition is true.

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
        showDashboard(session.userId) // smart-cast
    }
}
```

This is how `isNullOrEmpty()` and `isNullOrBlank()` enable smart casting.

#### What are context receivers (context parameters)?

Context receivers let you declare that a function requires certain objects to be in scope without passing them as regular parameters.

```kotlin
context(Logger, TransactionScope)
fun processPayment(payment: Payment) {
    log("Processing payment ${payment.id}")
    execute("INSERT INTO payments ...")
}

with(logger) {
    with(transactionScope) {
        processPayment(payment)
    }
}
```

They solve "parameter drilling" — passing the same dependency through many layers. The original `context()` syntax is being replaced with `context(param: Type)` in Kotlin 2.2+ as "context parameters."

#### What are the limitations of Kotlin contracts?

The compiler trusts contracts without verifying them — if your contract lies, the compiler won't catch it, leading to unsound casts at runtime. Contracts can only be on top-level or member functions, not lambdas or local functions. The condition syntax is limited to `implies`, `returns`, and `callsInPlace`. They're still `@ExperimentalContracts` because making them fully verifiable is a hard problem.

#### How do sealed hierarchies work with exhaustive when expressions?

The compiler enforces exhaustive `when` on sealed types — you must handle every subtype or add `else`. Removing `else` is the point: adding a new sealed subtype produces compile errors at every unhandled `when`.

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

Adding `AccountSuspended` to `AuthError` breaks both `when` expressions at compile time.

#### How does the delegation pattern compare to dependency injection?

Both decouple a class from its dependencies, but at different levels. Delegation is language-level — the compiler generates forwarding code. DI is architecture-level — a framework provides dependencies at runtime.

Delegation is for when a class needs to act as a particular interface. DI is for when a class needs to use a dependency without knowing how to create it. They work well together — use DI to provide the delegate instance, delegation to implement the interface.

```kotlin
class OfflineFirstRepository(
    private val localSource: DataSource,
    private val remoteSource: DataSource
) : DataSource by localSource {
    override suspend fun getItems(): List<Item> {
        return try {
            remoteSource.getItems().also { localSource.saveItems(it) }
        } catch (e: IOException) {
            localSource.getItems()
        }
    }
}
```

#### How do scope functions relate to DSL building?

Scope functions use the same mechanism — lambdas with receivers. `apply` and `with` use `T.() -> Unit`, making `this` the receiver. For DSLs, calling `apply(init)` on a builder instance provides the receiver scope.

```kotlin
fun notification(init: NotificationBuilder.() -> Unit): Notification {
    return NotificationBuilder().apply(init).build()
}

// Uses the same mechanism as
val builder = NotificationBuilder().apply {
    title = "New Message"
    body = "You have 3 unread messages"
}
```

Scope functions configure a single object. DSLs create nested, structured configurations with multiple builder types.

#### What are inline value classes and when would you use them?

Value classes wrap a single value without runtime allocation. The compiler replaces the wrapper with the underlying value at compile time.

```kotlin
@JvmInline
value class UserId(val id: String)

@JvmInline
value class OrderId(val id: String)

fun fetchOrder(userId: UserId, orderId: OrderId) { ... }
fetchOrder(orderId, userId) // won't compile — type safe
```

Common use cases: preventing parameter mixing, units of measurement (`Meters` vs `Feet`), validated wrappers. Boxing occurs when used as nullable, in collections, or as a generic type parameter.

### Common Follow-ups

- Can you write a contract for a function that guarantees a callback is never called?
- How would you test a DSL builder?
- What happens if you use `@DslMarker` on a scope function like `apply`?
- How do context receivers interact with coroutine scopes?
- Can a value class implement an interface? What about boxing?
- How would you model a state machine using sealed classes?
- What's the difference between `runCatching` and try-catch in performance?
- How does Kotlin's delegation differ from Java's Proxy?
