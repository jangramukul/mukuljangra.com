---
title: Kotlin Enum Classes Guide
layout: post
sequence: 93
categories: post
tags:
  - Kotlin
  - Android
---

Most developers first encounter enums as a way to replace magic strings and integer constants — and that alone makes them worth using. But Kotlin enums go much further than Java's. They can hold properties, implement methods, conform to interfaces, and even define abstract behavior that each constant implements differently. I've worked on Android codebases where enums replaced entire class hierarchies, and others where they should have been swapped out for sealed classes much earlier. Knowing where that line falls is the difference between clean modeling and fighting your own types.

Here's the thing about enums that I think gets underappreciated: every enum constant is a real object. It's not just a label or an integer under the hood. It's a singleton instance of the enum class, allocated once, reused everywhere. This means you can attach behavior, state, and identity to each constant — and the compiler guarantees you'll handle every one of them. That exhaustiveness check in `when` expressions has caught more bugs in my code than I'd like to admit. Once you internalize what enums actually are at the object level, the rest of the features — properties, abstract methods, interface implementation — follow naturally.

## Basic Enums

At their simplest, enums define a fixed set of named constants. Each constant is a singleton instance of the enum class, created once at class loading time and reused for the lifetime of the process.

```kotlin
enum class Direction {
    NORTH, SOUTH, EAST, WEST
}

fun describeMovement(direction: Direction): String = when (direction) {
    Direction.NORTH -> "Moving up"
    Direction.SOUTH -> "Moving down"
    Direction.EAST -> "Moving right"
    Direction.WEST -> "Moving left"
}
```

No `else` branch needed. The compiler knows `Direction` has exactly four constants, so the `when` is exhaustive. If someone later adds `NORTHEAST` to the enum, every `when` expression that doesn't handle it becomes a compile error. This is one of the most valuable properties of enums — the compiler forces you to handle new states, rather than silently falling through to a default branch that might do the wrong thing.

## Enums with Properties and Methods

Enums can have constructors, properties, and methods just like regular classes. The syntax has one quirk that trips people up: you need a semicolon after the last constant, before any member declarations. This is one of the very few places in Kotlin where a semicolon is required.

```kotlin
enum class LogLevel(val priority: Int, val label: String) {
    VERBOSE(0, "V"),
    DEBUG(1, "D"),
    INFO(2, "I"),
    WARN(3, "W"),
    ERROR(4, "E");

    fun isAtLeast(level: LogLevel): Boolean = this.priority >= level.priority

    fun formatTag(tag: String): String = "$label/$tag"
}
```

Each constant passes its arguments to the primary constructor. `LogLevel.ERROR.priority` is `4`, `LogLevel.DEBUG.label` is `"D"`, and `LogLevel.WARN.isAtLeast(LogLevel.INFO)` returns `true`. These aren't computed at call site — the values are baked into each singleton instance at class loading. In a logging framework, you'd use `isAtLeast` to decide whether a message should be emitted based on the current log threshold, avoiding the string comparison mess I've seen in codebases that use raw strings for log levels.

## Enums with Abstract Methods

This is where enums start feeling less like constants and more like polymorphic types. You can declare an abstract method in the enum class, and each constant must provide its own implementation. Each constant becomes an anonymous subclass of the enum.

```kotlin
enum class Operation(val symbol: String) {
    ADD("+") {
        override fun apply(a: Double, b: Double): Double = a + b
    },
    SUBTRACT("-") {
        override fun apply(a: Double, b: Double): Double = a - b
    },
    MULTIPLY("*") {
        override fun apply(a: Double, b: Double): Double = a * b
    },
    DIVIDE("/") {
        override fun apply(a: Double, b: Double): Double =
            if (b != 0.0) a / b else throw ArithmeticException("Division by zero")
    };

    abstract fun apply(a: Double, b: Double): Double

    fun describe(a: Double, b: Double): String =
        "$a $symbol $b = ${apply(a, b)}"
}
```

Each constant is effectively a subclass that overrides `apply`. Calling `Operation.ADD.apply(10.0, 3.0)` returns `13.0`, while `Operation.DIVIDE.apply(10.0, 0.0)` throws. The compiler enforces that every constant implements the abstract method — you can't add a new `MODULO` constant without providing `apply`. This pattern replaces the classic "strategy" setup of an interface plus separate classes with a single enum definition. I use this frequently for things like sort comparators, formatting strategies, and mathematical operations where the set of options is truly fixed.

## Enums Implementing Interfaces

Enums can implement interfaces, which is useful when you want enum constants to participate in a type system beyond the enum itself. The enum class can provide a single implementation for all constants, or each constant can override independently.

```kotlin
interface Displayable {
    fun displayName(): String
    fun icon(): String
}

enum class PaymentMethod : Displayable {
    CREDIT_CARD {
        override fun displayName() = "Credit Card"
        override fun icon() = "💳"
    },
    BANK_TRANSFER {
        override fun displayName() = "Bank Transfer"
        override fun icon() = "🏦"
    },
    DIGITAL_WALLET {
        override fun displayName() = "Digital Wallet"
        override fun icon() = "📱"
    };
}

fun renderPaymentOptions(methods: List<Displayable>) {
    methods.forEach { method ->
        println("${method.icon()} ${method.displayName()}")
    }
}
```

The power here is that `renderPaymentOptions` accepts any `Displayable`, not just `PaymentMethod`. You could pass a mix of enums and regular classes that implement `Displayable`, and the function doesn't care. This is how I integrate enums into UI layers — the ViewModel exposes a list of `Displayable` items, and the UI renders them without knowing or caring whether they're enum constants or something else entirely. It keeps your enum constants interchangeable with other types while still getting the exhaustiveness guarantees when you `when`-match on the enum directly.

## Under the Hood

Understanding how enums compile helps you avoid a few common performance traps. Each enum constant becomes a `public static final` field on the generated class. So `Direction.NORTH` isn't a method call or property access — it's a direct field read, as cheap as it gets.

The `values()` function, however, has a gotcha. Every call to `Direction.values()` creates a new array. It has to — if it returned the same array, calling code could modify it and corrupt the enum's state. In most cases this doesn't matter. But if you're calling `values()` in a tight loop, inside a `RecyclerView` adapter's `onBindViewHolder`, or in any hot path that runs per-frame, those allocations add up. I've seen this show up in allocation profiling on Android apps — dozens of small arrays created per second from innocent-looking `values()` calls.

The fix arrived in Kotlin 1.9 with the `entries` property. Unlike `values()`, `entries` returns a pre-computed, cached immutable `List`. No allocation on each access. For any code that iterates over all enum constants — populating spinners, running validation loops, mapping to UI elements — `entries` is what you should reach for.

```kotlin
// Avoid in hot paths — allocates a new array each call
val allDirections = Direction.values()

// Preferred — cached, zero-allocation
val allDirections = Direction.entries
```

For converting strings to enum constants, `valueOf()` parses by name and throws `IllegalArgumentException` if the string doesn't match any constant. This is useful for deserializing API responses or reading from SharedPreferences, but always wrap it in a try-catch or use `entries.find {}` for user-facing input where invalid values are expected. Every enum constant also has a `name` property (the string representation of the declaration name) and an `ordinal` property (the position in the declaration order, starting at 0). I avoid relying on `ordinal` for anything persistent — adding a new constant in the middle of the list shifts all subsequent ordinals, which silently corrupts stored data.

## Enums vs Sealed Classes

This is the decision I see developers struggle with most, and the answer comes down to one question: do all your variants have the same shape?

Enums work when every constant carries the same properties and methods. `Direction` with `NORTH`, `SOUTH`, `EAST`, `WEST` — same structure, different values. `LogLevel` with a priority integer — same structure, different values. Each constant is a singleton, so they don't hold mutable state or per-instance data.

Sealed classes work when each variant needs different data. A network result type is the classic example: `Success` carries the response data, `Error` carries an exception and maybe an error code, `Loading` carries nothing at all. You can't model this with an enum because each constant would need different constructor parameters.

```kotlin
// Enum works — same shape for every constant
enum class ConnectionState {
    CONNECTED, DISCONNECTED, CONNECTING
}

// Sealed class works — different data per subtype
sealed class NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>()
    data class Error(val code: Int, val message: String) : NetworkResult<Nothing>()
    data object Loading : NetworkResult<Nothing>()
}
```

Here's my rule of thumb: start with an enum. If you find yourself wanting to pass different arguments to different constants, or if one constant needs to be a `data class` while another is a plain object, switch to a sealed class. The `when` exhaustiveness check works identically for both, so you don't lose compile-time safety. The tradeoff is that sealed class subtypes aren't singletons by default (unless you use `data object`), so they don't get the free identity comparison and zero-allocation reuse that enum constants do.

## Practical Patterns

Beyond the basics, a few patterns come up repeatedly in real Android projects.

**Feature flags** are a natural fit for enums. Each flag has a key for remote config lookup and a default state. Pairing enums with a remote config client gives you type-safe feature gating without the scattered string constants I've seen in too many codebases.

```kotlin
enum class FeatureFlag(val key: String, val defaultEnabled: Boolean) {
    DARK_MODE("feature_dark_mode", false),
    NEW_CHECKOUT("feature_new_checkout", false),
    ANALYTICS_V2("feature_analytics_v2", true);

    fun isEnabled(remoteConfig: RemoteConfig): Boolean =
        remoteConfig.getBoolean(key, defaultEnabled)
}
```

**Navigation destinations** work well as enums when your app's screens are a fixed set. Each destination carries its route string, and you avoid typos that would compile fine but crash at runtime.

```kotlin
enum class Screen(val route: String) {
    HOME("home"),
    PROFILE("profile/{userId}"),
    SETTINGS("settings"),
    SEARCH("search?query={query}");

    fun createRoute(vararg args: Pair<String, String>): String =
        args.fold(route) { acc, (key, value) -> acc.replace("{$key}", value) }
}
```

**EnumMap and EnumSet** are collections you should know about. `EnumMap` is backed by a simple array indexed by ordinal — no hashing, no collision handling, just a direct array lookup. For enum-keyed maps, it's faster and uses less memory than `HashMap`. On Android, where every allocation matters in hot paths, this is a real win.

```kotlin
// Faster than HashMap for enum keys — backed by a flat array
val statusCounts = EnumMap<ConnectionState, Int>(ConnectionState::class.java)
ConnectionState.entries.forEach { statusCounts[it] = 0 }
```

**Exhaustive `when` matching** is arguably the single biggest reason to use enums. When every branch is covered, the compiler knows it — and when someone adds a new constant, the compiler tells you everywhere you need to handle it. I treat non-exhaustive `when` on enums as a code smell. If you're reaching for an `else` branch, ask yourself whether you really want to silently handle unknown future states.

```kotlin
fun handleApiError(error: ApiError): UserMessage = when (error) {
    ApiError.UNAUTHORIZED -> UserMessage("Please log in again")
    ApiError.FORBIDDEN -> UserMessage("You don't have access")
    ApiError.NOT_FOUND -> UserMessage("Content not found")
    ApiError.RATE_LIMITED -> UserMessage("Too many requests, try later")
    ApiError.SERVER_ERROR -> UserMessage("Something went wrong on our end")
}
```

If `ApiError` gains a new constant tomorrow, this function won't compile until it's handled. That's not a nuisance — it's the compiler doing exactly what you want it to do.

Enums look simple on the surface, but they carry a surprising amount of power once you start using properties, abstract methods, and interface implementation. They're one of Kotlin's best tools for modeling fixed sets of related constants with behavior attached. Know when they're the right fit, know when sealed classes serve you better, and lean on the compiler's exhaustiveness checks to keep your code correct as it evolves.

Thanks for reading!

## Quiz

#### What's the difference between `values()` and `entries` for enums?

- **Wrong** They're identical — `entries` is just an alias for `values()`
- **Correct** `values()` creates a new array each call; `entries` returns a cached List (more efficient)
- **Wrong** `entries` only works with sealed classes, not enums
- **Wrong** `values()` returns them sorted, `entries` returns insertion order

> **Explanation:** `values()` allocates a new array on every call. `entries` (Kotlin 1.9+) returns a pre-computed, cached immutable List. For hot paths or repeated access, `entries` avoids unnecessary allocations.

#### When should you use a sealed class instead of an enum?

- **Wrong** When you have more than 10 constants
- **Wrong** When you need to use `when` expressions
- **Correct** When different subtypes need different properties or when subtypes need to hold data
- **Wrong** When you need thread-safe singletons

> **Explanation:** Enums work for fixed sets where every constant has the same structure. Sealed classes allow each subtype to have different properties (e.g., `Success(data)` vs `Error(message)` vs `Loading`). If your variants carry different data, sealed classes are the right choice.

## Coding Challenge

Create an `HttpStatus` enum with common HTTP status codes (200 OK, 201 CREATED, 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 500 INTERNAL_ERROR). Give each a code (Int) and message (String) property. Add methods: `isSuccess()`, `isClientError()`, `isServerError()` using ranges. Add a companion object with `fromCode(Int)` that returns the matching status or throws. Show exhaustive when usage.

#### Solution

```kotlin
enum class HttpStatus(val code: Int, val message: String) {
    OK(200, "OK"),
    CREATED(201, "Created"),
    BAD_REQUEST(400, "Bad Request"),
    UNAUTHORIZED(401, "Unauthorized"),
    FORBIDDEN(403, "Forbidden"),
    NOT_FOUND(404, "Not Found"),
    INTERNAL_ERROR(500, "Internal Server Error");

    fun isSuccess(): Boolean = code in 200..299
    fun isClientError(): Boolean = code in 400..499
    fun isServerError(): Boolean = code in 500..599

    companion object {
        fun fromCode(code: Int): HttpStatus =
            entries.find { it.code == code }
                ?: throw IllegalArgumentException("Unknown HTTP status code: $code")
    }
}

fun handleResponse(status: HttpStatus): String = when (status) {
    HttpStatus.OK -> "Request successful"
    HttpStatus.CREATED -> "Resource created"
    HttpStatus.BAD_REQUEST -> "Check your request parameters"
    HttpStatus.UNAUTHORIZED -> "Authentication required"
    HttpStatus.FORBIDDEN -> "Access denied"
    HttpStatus.NOT_FOUND -> "Resource not found"
    HttpStatus.INTERNAL_ERROR -> "Server error — retry later"
}

fun main() {
    val status = HttpStatus.fromCode(404)
    println("${status.code} ${status.message}")
    println("Client error? ${status.isClientError()}")
    println(handleResponse(status))
}
```
