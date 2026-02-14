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

Alright, this is where Kotlin gets really interesting. Contracts, DSL builders, context receivers, sealed hierarchies for error handling -- these are the topics that separate "I know Kotlin" from "I *think* in Kotlin." If you're interviewing at a company that writes serious Kotlin, expect questions from this list.

#### What is the Result type in Kotlin?

`Result<T>` is a built-in inline class that wraps either a successful value or a `Throwable`. Think of it like a package delivery -- you either get your item, or you get a note explaining what went wrong. Instead of littering your code with try-catch or returning nullables, you get a clean wrapper that carries either the success or the failure.

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

Here's the thing -- `Result` comes loaded with functional operators: `map`, `mapCatching`, `getOrElse`, `getOrDefault`, `onSuccess`, `onFailure`, `fold`, and `recover`. One gotcha worth knowing: `Result` can't be a direct return type of a `suspend` function because coroutines use `Result` internally.

#### How do sealed classes help with error handling?

Sealed hierarchies let you model a fixed set of outcomes, and the compiler makes sure you handle every single one. It's like a multiple-choice test where the compiler won't let you skip any answer. Unlike exceptions, error cases are right there in the function signature -- callers can't pretend they don't exist.

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

The `Nothing` type parameter on error subtypes is a nice trick -- it lets them work with any `NetworkResult<T>` without caring about the success type.

#### How does Result compare to sealed classes for error handling?

`Result<T>` is like a traffic light -- green or red, that's it. Sealed classes are like a full dashboard with specific warning lights for each problem. `Result` wraps success or failure as a `Throwable`, which is great for simple pass/fail operations. Sealed classes let you define specific, typed error cases that callers must handle.

Use `Result` when errors are generic (parsing failed, network call failed). Use sealed hierarchies when errors are domain-specific -- `InvalidCredentials` needs completely different UI than `NetworkFailure`. Many codebases use sealed classes at the domain layer and `Result` at the infrastructure layer, which is a solid pattern.

> **🧠 Think about it:** If you're building a payment flow with errors like card declined, insufficient funds, and network timeout -- would you reach for `Result` or a sealed class? Why?

#### What is class delegation and how does it differ from inheritance?

Class delegation lets a class implement an interface by forwarding all calls to a delegate object. The compiler generates the forwarding code at compile time. It's like hiring a contractor -- you're the face of the business, but the contractor does the actual work behind the scenes.

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

But wait -- with inheritance, you'd extend the implementation class, locking yourself into that specific implementation forever. With delegation, you can swap the delegate freely. Pass `FirebaseAnalytics` in production, `FakeAnalytics` in tests. And you only override the methods you actually care about -- the rest get forwarded automatically.

#### What is interface delegation and the Decorator pattern?

Interface delegation is basically Kotlin saying "I'll handle the Decorator pattern boilerplate for you." You implement an interface, delegate all calls to an existing implementation, and selectively override the methods you want to change. Here's where it really shines -- decorating a 10-method interface means you only write overrides for the methods you actually change. The compiler generates the other nine forwarding methods for you.

#### What is a DSL in Kotlin and what makes it possible?

A DSL (Domain-Specific Language) uses lambdas with receivers, extension functions, and operator overloading to create code that reads like a specialized mini-language. The secret ingredient is the lambda with receiver -- `T.() -> Unit` -- which lets code inside the lambda access `T`'s members directly, as if you were inside that class.

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

Think of it like walking into someone's house -- once you're inside the lambda, you can use all their stuff (methods, properties) without asking. The standard library uses this pattern everywhere: `buildList`, `apply`, `with`, `buildString`. Frameworks like Ktor and Jetpack Compose are built entirely on this concept.

#### What is @DslMarker and why is it important?

Here's a problem you don't see coming until it bites you. Without `@DslMarker`, inner DSL blocks can accidentally call methods from any enclosing receiver. It's like being in a meeting room and accidentally shouting instructions to people in the hallway -- you meant to talk to the people in your room, not everyone in the building.

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

When builder classes are annotated with `@DslMarker`, the compiler restricts implicit access to the closest receiver only. Every production DSL should use it -- no exceptions.

> **🧠 Think about it:** What would happen if Jetpack Compose didn't use `@DslMarker`? Could you accidentally call a parent composable's scope functions inside a child?

#### How do you build a type-safe builder?

A type-safe builder combines all three ingredients: lambdas with receivers, builder classes, and `@DslMarker`. It's like building with LEGO instructions -- each piece only snaps into the right place, and the compiler is your instruction manual making sure you don't put a wheel where a window goes.

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

Contracts let you tell the compiler things it can't figure out on its own. Think of it like leaving a note for the compiler: "Hey, if this function returns normally, I promise this condition is true." Without contracts, calling `require(x != null)` wouldn't smart-cast `x` to non-null in the code that follows -- the compiler just wouldn't know.

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

Standard library functions like `require()`, `check()`, `checkNotNull()` all have contracts baked in. That's why smart casts work after calling them.

#### What does callsInPlace do in a contract?

`callsInPlace` tells the compiler how many times a lambda parameter will be invoked. Here's why that matters -- without this guarantee, the compiler won't let you initialize a `val` inside a lambda because it doesn't know if the lambda runs once, twice, or never.

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

It's like telling the compiler "I promise this will run exactly once, so go ahead and trust that the `val` gets assigned." The four kinds are `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE`, and `UNKNOWN`. `EXACTLY_ONCE` is used by `run`, `with`, `apply`, `also`, `let`, and `buildList`.

#### What does returns implies do?

`returns() implies (condition)` is you making a promise to the compiler: "If I return normally, this condition is guaranteed to be true." It's the mechanism behind smart casting after boolean checks.

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

This is exactly how `isNullOrEmpty()` and `isNullOrBlank()` enable smart casting. Without the contract, the compiler would have no idea that returning `false` from `isNullOrBlank()` means the value is non-null.

#### What are context receivers (context parameters)?

Context receivers let you declare that a function requires certain objects to be in scope without passing them as regular parameters. Think of it like walking into a workshop -- you don't carry every tool with you, the tools are just there on the workbench when you need them.

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

They solve "parameter drilling" -- that annoying pattern where you pass the same dependency through five layers of function calls just so the bottom layer can use it. The original `context()` syntax is being replaced with `context(param: Type)` in Kotlin 2.2+ as "context parameters."

> **🧠 Think about it:** How are context receivers different from dependency injection? Both provide dependencies without explicit parameter passing -- so when would you pick one over the other?

#### What are the limitations of Kotlin contracts?

Here's the thing -- the compiler trusts contracts blindly. If your contract lies, the compiler won't catch it, and you'll get unsound casts that blow up at runtime. It's like a security guard who believes every badge without checking the photo. Contracts can only be on top-level or member functions, not lambdas or local functions. The condition syntax is limited to `implies`, `returns`, and `callsInPlace`. They're still `@ExperimentalContracts` because making them fully verifiable is a genuinely hard computer science problem.

#### How do sealed hierarchies work with exhaustive when expressions?

The compiler enforces exhaustive `when` on sealed types -- you must handle every subtype or add `else`. But here's the real power: you *don't* add `else`. That way, when someone adds a new sealed subtype, the compiler screams at every unhandled `when` expression in the codebase. It's like a safety net that catches missing cases at compile time instead of in production.

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

Adding `AccountSuspended` to `AuthError` breaks both `when` expressions at compile time. That's the whole point -- the compiler becomes your checklist.

#### How does the delegation pattern compare to dependency injection?

Both decouple a class from its dependencies, but they operate at completely different levels. Delegation is language-level -- the compiler generates forwarding code. DI is architecture-level -- a framework provides dependencies at runtime. It's like the difference between a power tool (delegation, built into the language) and a whole workshop setup (DI, an external system).

Delegation is for when a class needs to *be* a particular interface. DI is for when a class needs to *use* a dependency without knowing how to create it. But wait -- they actually work beautifully together. Use DI to provide the delegate instance, delegation to implement the interface.

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

Scope functions and DSLs are cousins -- they share the same DNA. Both use lambdas with receivers. `apply` and `with` use `T.() -> Unit`, making `this` the receiver. When you call `apply(init)` on a builder instance, you're using the exact same mechanism that powers DSLs.

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

The difference? Scope functions configure a single object -- like decorating one room. DSLs create nested, structured configurations with multiple builder types -- like designing an entire house with rooms inside rooms.

#### What are inline value classes and when would you use them?

Value classes wrap a single value without any runtime allocation overhead. The compiler erases the wrapper entirely and replaces it with the underlying value at compile time. It's like putting a label on a wire -- the label costs nothing at runtime, but it prevents you from plugging the wrong wire into the wrong socket.

```kotlin
@JvmInline
value class UserId(val id: String)

@JvmInline
value class OrderId(val id: String)

fun fetchOrder(userId: UserId, orderId: OrderId) { ... }
fetchOrder(orderId, userId) // won't compile — type safe
```

Common use cases: preventing parameter mixing (like above), units of measurement (`Meters` vs `Feet`), and validated wrappers. One thing to watch out for -- boxing occurs when used as nullable, in collections, or as a generic type parameter, which means the zero-cost abstraction isn't always zero-cost.

### Common Follow-ups

- Can you write a contract for a function that guarantees a callback is never called?
- How would you test a DSL builder?
- What happens if you use `@DslMarker` on a scope function like `apply`?
- How do context receivers interact with coroutine scopes?
- Can a value class implement an interface? What about boxing?
- How would you model a state machine using sealed classes?
- What's the difference between `runCatching` and try-catch in performance?
- How does Kotlin's delegation differ from Java's Proxy?
