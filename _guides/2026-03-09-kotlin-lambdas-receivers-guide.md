---
title: Kotlin Lambdas with Receivers Guide
layout: post
sequence: 103
categories: post
tags:
  - Kotlin
  - Android
---

When I first encountered the `T.() -> Unit` syntax in Kotlin, it didn't click. I'd been writing lambdas for a while — passing them to `map`, `filter`, `launch` — and they all made sense. A lambda is a function you pass around. But then I saw things like `buildString { append("hello") }` and Gradle's `dependencies { implementation("...") }`, and the syntax felt like something different was happening. How could I call `append` without a receiver? Where did `implementation` come from? The answer is lambdas with receivers, and understanding them unlocked my understanding of how Kotlin's entire DSL ecosystem works.

Here's what separates Kotlin from languages that have lambdas but can't build real DSLs. Java has lambdas since Java 8, Swift has closures, JavaScript has arrow functions — but none of them have the concept of a lambda that runs "inside" an object. The `T.() -> Unit` syntax means the lambda executes with `T` as its implicit `this`. You don't access `T` as a parameter. You *become* `T` for the duration of the lambda. This single feature is what makes Compose's `Column { }`, Ktor's `routing { }`, and Gradle's `android { }` feel like custom languages when they're actually just function calls. Once you understand this mechanism, you stop being a consumer of DSLs and start being someone who can build them.

## Regular Lambda vs Lambda with Receiver

The difference is small in syntax but huge in ergonomics. A regular lambda takes the object as an explicit parameter. A lambda with receiver makes the object the implicit `this`.

```kotlin
// Regular lambda — access StringBuilder as 'it'
val buildRegular: (StringBuilder) -> Unit = {
    it.append("Hello, ")
    it.append("World!")
}

// Lambda with receiver — access StringBuilder as 'this'
val buildWithReceiver: StringBuilder.() -> Unit = {
    append("Hello, ")
    append("World!")
}
```

In the regular lambda, every call needs `it.` prefix. The lambda receives a `StringBuilder` as its parameter, and you interact with it explicitly. In the receiver version, `this` inside the lambda refers to the `StringBuilder` instance. You call `append` directly, as if you were writing code inside a `StringBuilder` method. The difference between `(T) -> Unit` and `T.() -> Unit` is where the `T` object lives: parameter versus `this`.

This isn't just about saving a few characters. When you're building something with multiple method calls — setting properties, calling configuration methods, adding items — the receiver version reads like a configuration block rather than a sequence of operations on a variable. Compare how these two feel in practice:

```kotlin
// Regular lambda — feels procedural
fun buildNotification(config: (NotificationConfig) -> Unit): Notification {
    val notificationConfig = NotificationConfig()
    config(notificationConfig)
    return notificationConfig.build()
}

buildNotification { config ->
    config.title = "Download Complete"
    config.message = "Your file is ready"
    config.priority = Priority.HIGH
    config.channel = "downloads"
}

// Lambda with receiver — feels declarative
fun buildNotification(config: NotificationConfig.() -> Unit): Notification {
    val notificationConfig = NotificationConfig()
    notificationConfig.config()
    return notificationConfig.build()
}

buildNotification {
    title = "Download Complete"
    message = "Your file is ready"
    priority = Priority.HIGH
    channel = "downloads"
}
```

The receiver version drops all the `config.` prefixes. The lambda body looks like you're *inside* the `NotificationConfig` object, setting its properties directly. This is the fundamental building block of every Kotlin DSL.

## How apply, run, with Work

If you've used `apply`, `run`, or `with`, you've already been using lambdas with receivers. These scope functions aren't magic — they're tiny functions that accept receiver lambdas and differ only in what they return and how they receive the object.

`apply` takes `T.() -> Unit` and returns `T`. You configure the object and get it back. `run` takes `T.() -> R` and returns whatever the lambda returns — useful when you need to compute a value from the object. `with` does the same as `run`, but takes the object as a regular parameter instead of being called on it. Here's how they're defined internally (simplified):

```kotlin
// apply: configure and return the object
inline fun <T> T.apply(block: T.() -> Unit): T {
    block()  // 'this' inside block is the T instance
    return this
}

// run: compute something from the object
inline fun <T, R> T.run(block: T.() -> R): R {
    return block()  // 'this' inside block is the T instance
}

// with: same as run, but object is a parameter
inline fun <T, R> with(receiver: T, block: T.() -> R): R {
    return receiver.block()
}
```

The key insight is that all three call `block()` on the receiver instance. When `apply` calls `block()`, the `T` instance becomes `this` inside the lambda. That's the entire implementation. There's no reflection, no code generation, no special compiler magic beyond the standard receiver lambda resolution. Once you see that `apply` is literally "call this lambda with me as the receiver and return me," the function stops being mysterious.

In practice, I reach for `apply` when I'm configuring a mutable object — building a `Bundle`, setting up a `Paint`, or initializing a builder. I use `run` when I need to transform or extract from an object — converting a response to a domain model, computing a value from a configuration. And `with` mostly shows up when I already have the object in a variable and want to do multiple things with it without repeating the name.

## Building Type-Safe Builders

This is where lambdas with receivers become genuinely powerful. The pattern is straightforward: create a class with configuration methods, write a function that takes `T.() -> Unit`, instantiate the class, pass it as receiver, return the configured object.

Let's build a real example — an HTTP request builder, because every Android developer has dealt with configuring network requests.

```kotlin
class RequestBuilder {
    var url: String = ""
    var method: String = "GET"
    var timeoutMs: Long = 30_000
    private val headers = mutableMapOf<String, String>()
    private var body: String? = null

    fun header(name: String, value: String) {
        headers[name] = value
    }

    fun headers(block: HeaderScope.() -> Unit) {
        HeaderScope().apply(block)
    }

    fun body(content: String) {
        body = content
    }

    fun build(): HttpRequest = HttpRequest(url, method, headers.toMap(), body, timeoutMs)

    inner class HeaderScope {
        infix fun String.to(value: String) {
            headers[this] = value
        }
    }
}

data class HttpRequest(
    val url: String,
    val method: String,
    val headers: Map<String, String>,
    val body: String?,
    val timeoutMs: Long
)

fun httpRequest(block: RequestBuilder.() -> Unit): HttpRequest {
    return RequestBuilder().apply(block).build()
}
```

The `httpRequest` function is the entry point. It creates a `RequestBuilder`, passes it as the receiver of the lambda, and calls `build()` on the configured result. The caller's code reads like a DSL:

```kotlin
val request = httpRequest {
    url = "https://api.example.com/users"
    method = "POST"
    headers {
        "Authorization" to "Bearer $token"
        "Content-Type" to "application/json"
    }
    body("""{"name": "Mukul", "role": "engineer"}""")
    timeoutMs = 15_000
}
```

Notice the nested `headers { }` block. That's a second layer of receiver lambdas — `HeaderScope.() -> Unit`. The `to` infix function inside `HeaderScope` lets you write `"key" to "value"` naturally. Each layer of nesting is just another receiver lambda, and the pattern scales to arbitrary depth. Gradle's build scripts are exactly this pattern stacked several levels deep.

## Extension Function Types

When receiver lambdas show up repeatedly in your codebase, type aliases clean up the signatures. The type `T.() -> Unit` is called an "extension function type" because it behaves like an extension function on `T` — it adds behavior to `T` without modifying the class.

```kotlin
typealias BuildAction<T> = T.() -> Unit
typealias Validator<T> = T.() -> Boolean
typealias Transformation<T, R> = T.() -> R
```

These aliases communicate intent. `BuildAction<ServerConfig>` reads more naturally than `ServerConfig.() -> Unit` when it appears in function signatures. You can store receiver lambdas in properties, pass them around, and compose them:

```kotlin
class AppConfig {
    var debugMode: Boolean = false
    var logLevel: String = "INFO"
    var analyticsEnabled: Boolean = true
}

fun <T> configure(target: T, action: BuildAction<T>): T {
    return target.apply(action)
}

// Store configurations as reusable actions
val debugConfig: BuildAction<AppConfig> = {
    debugMode = true
    logLevel = "VERBOSE"
    analyticsEnabled = false
}

val productionConfig: BuildAction<AppConfig> = {
    debugMode = false
    logLevel = "ERROR"
    analyticsEnabled = true
}

// Apply the stored configuration
val config = configure(AppConfig(), debugConfig)
```

Storing `BuildAction<AppConfig>` in a variable means you can swap configurations at runtime, pass them through dependency injection, or compose multiple actions sequentially. This is a pattern I use heavily in test setup code — defining reusable configuration blocks that you mix and match across test cases instead of duplicating setup logic.

## Under the Hood

Here's the reframe moment: receiver lambdas have zero special runtime representation. `T.() -> Unit` compiles to exactly the same bytecode as `(T) -> Unit`. On the JVM, `StringBuilder.() -> Unit` becomes `Function1<StringBuilder, Unit>`. The receiver simply becomes the first parameter of the function.

```kotlin
// What you write
val action: StringBuilder.() -> Unit = { append("hello") }

// What the JVM sees (conceptually)
val action: Function1<StringBuilder, Unit> = { sb -> sb.append("hello") }
```

The compiler handles all the `this` binding at compile time. When you write `append("hello")` inside a receiver lambda, the compiler resolves it to `this.append("hello")` and generates bytecode that calls `append` on the first parameter. There's no reflection involved, no dynamic dispatch beyond what the JVM normally does, no special receiver-passing mechanism. The entire feature is a compile-time transformation.

This means you can actually pass a regular lambda `(T) -> Unit` where a receiver lambda `T.() -> Unit` is expected and vice versa. They're the same type after erasure. The compiler allows this implicitly:

```kotlin
val regular: (StringBuilder) -> Unit = { it.append("hello") }
val receiver: StringBuilder.() -> Unit = regular // Works fine
```

Understanding this demolishes any concern about performance overhead from receiver lambdas. If you've already accepted the cost of a regular lambda (which is zero when inlined, and one small object allocation when not), receiver lambdas cost exactly the same. The differentiation is entirely a developer experience feature — the compiler gives you `this` binding so your DSLs read naturally, then compiles away the distinction completely.

## Common Pitfalls

The most common issue with receiver lambdas is ambiguous `this` in nested contexts. When you nest two receiver lambdas, both receivers are in scope, and calling a method that exists on both creates confusion.

```kotlin
class Outer {
    fun outerMethod() = println("outer")
    fun sharedMethod() = println("outer shared")
}

class Inner {
    fun innerMethod() = println("inner")
    fun sharedMethod() = println("inner shared")
}

fun buildOuter(block: Outer.() -> Unit) = Outer().apply(block)
fun Outer.buildInner(block: Inner.() -> Unit) = Inner().apply(block)

buildOuter {
    outerMethod()           // Fine — resolved to Outer
    buildInner {
        innerMethod()       // Fine — resolved to Inner
        sharedMethod()      // Ambiguous! Calls Inner.sharedMethod()
        this@buildOuter.sharedMethod()  // Explicit: calls Outer.sharedMethod()
    }
}
```

The `this@label` syntax disambiguates which receiver you mean. Without it, the innermost receiver wins. This is the correct behavior — you usually want the closest scope — but it means you can accidentally call the wrong receiver's method when names overlap. In practice, this bites people most often in Compose, where nested layout lambdas all have scopes with methods like `align` or `weight` that exist on multiple scope types.

The Kotlin team introduced `@DslMarker` to solve this at a broader level. When you annotate your DSL scope classes with a `@DslMarker` annotation, the compiler prevents implicit access to outer receivers from inner lambdas. You can still reach the outer receiver with `this@label`, but you can't accidentally call its methods without qualification. This turns a runtime "wrong receiver" bug into a compile-time error, which is exactly what you want in a type-safe builder.

The other pitfall is overusing receiver lambdas when a regular lambda is clearer. If the lambda only calls one or two methods on the object, the receiver syntax adds complexity without adding readability. `apply` on an object where you set a single property is more ceremony than `also { it.name = "test" }`. Receiver lambdas earn their complexity when the lambda body has three or more interactions with the receiver — property sets, method calls, nested builders. For simple one-liners, a regular lambda with `it` is more straightforward and easier to read.

Lambdas with receivers are one of those features where the concept is simple but the implications run deep. They're what make Kotlin's DSL capabilities possible, and they're the mechanism behind the scope functions you use every day. The fact that they compile down to ordinary function calls with no runtime overhead makes them one of the cleanest abstractions in the language.

Thanks for reading!

## Quiz

#### What's the difference between `(T) -> Unit` and `T.() -> Unit`?

- **Wrong** They're identical — just different syntax for the same thing
- **Correct** In `T.() -> Unit`, `this` inside the lambda refers to T — you call T's methods directly. In `(T) -> Unit`, you access T as the explicit parameter `it`
- **Wrong** `T.() -> Unit` can only be used with inline functions
- **Wrong** `(T) -> Unit` is for pure functions, `T.() -> Unit` is for side effects

> **Explanation:** `T.() -> Unit` is a "lambda with receiver" — inside the lambda, the T object becomes `this`. This lets you call its methods without qualification: `buildString { append("hello") }` instead of `buildString { it.append("hello") }`. Both compile to `Function1<T, Unit>` on the JVM.

#### How does a lambda with receiver compile on the JVM?

- **Wrong** It creates a special Receiver class
- **Correct** The receiver becomes the first parameter — `T.() -> Unit` compiles to `Function1<T, Unit>`, same as `(T) -> Unit`
- **Wrong** It uses reflection to bind `this`
- **Wrong** It creates a subclass of T at runtime

> **Explanation:** There's no special runtime mechanism. `StringBuilder.() -> Unit` compiles to `Function1<StringBuilder, Unit>`. The difference is purely at the call site — the compiler passes the receiver as the first argument and binds `this` appropriately. The type safety is a compile-time feature.

## Coding Challenge

Create a type-safe HTTP request builder using lambdas with receivers: `val request = httpRequest { url("https://api.example.com/users"); method(GET); headers { "Authorization" to "Bearer token"; "Content-Type" to "application/json" }; timeout(30_000) }`. Implement the `HttpRequest` data class, `HeadersBuilder`, and the `httpRequest` builder function.

#### Solution

```kotlin
data class HttpRequest(
    val url: String,
    val method: Method,
    val headers: Map<String, String>,
    val timeoutMs: Long
)

enum class Method { GET, POST, PUT, DELETE, PATCH }

class HeadersBuilder {
    private val headers = mutableMapOf<String, String>()

    infix fun String.to(value: String) {
        headers[this] = value
    }

    fun build(): Map<String, String> = headers.toMap()
}

class HttpRequestBuilder {
    private var url: String = ""
    private var method: Method = Method.GET
    private var timeoutMs: Long = 30_000
    private val headersBuilder = HeadersBuilder()

    fun url(value: String) { url = value }
    fun method(value: Method) { method = value }
    fun timeout(ms: Long) { timeoutMs = ms }

    fun headers(block: HeadersBuilder.() -> Unit) {
        headersBuilder.apply(block)
    }

    fun build(): HttpRequest = HttpRequest(
        url = url,
        method = method,
        headers = headersBuilder.build(),
        timeoutMs = timeoutMs
    )
}

fun httpRequest(block: HttpRequestBuilder.() -> Unit): HttpRequest {
    return HttpRequestBuilder().apply(block).build()
}

// Usage
val request = httpRequest {
    url("https://api.example.com/users")
    method(Method.GET)
    headers {
        "Authorization" to "Bearer token"
        "Content-Type" to "application/json"
    }
    timeout(30_000)
}

println(request)
// HttpRequest(url=https://api.example.com/users, method=GET,
//   headers={Authorization=Bearer token, Content-Type=application/json},
//   timeoutMs=30000)
```
