---
title: Kotlin Control Flow Guide
layout: post
sequence: 85
categories: post
tags:
  - Kotlin
  - Android
---

Coming from Java, my mental model for control flow was rigid. `switch` only works on primitives and strings. `if` is a statement — you use it for branching, and then you assign variables separately. Casting requires explicit `instanceof` checks followed by explicit casts, and the compiler has zero memory of what you just checked. Every piece of control flow existed to direct execution, not to produce values.

Kotlin fundamentally changes this. Control flow constructs aren't just about directing where your program goes — they're expressions that produce values, carry type information forward, and integrate with the type system in ways that eliminate entire categories of bugs. The first time I wrote a `when` expression that returned a value, handled type checks with automatic casting, and got a compile error when I forgot a branch, I realized this wasn't just syntactic sugar. It was a different way of thinking about how code should work.

The shift is subtle but deep: instead of writing code that checks a condition, enters a block, and assigns a result, you write code that evaluates to a result directly. Instead of casting after checking, the compiler remembers what you checked. Instead of hoping you covered every case, the compiler tells you when you didn't.

## When Expressions

Java's `switch` statement is limited to `byte`, `short`, `char`, `int`, `String`, and enum constants. That's it. You can't switch on arbitrary objects, ranges, or conditions. Kotlin's `when` has none of these limitations — it works with any type, supports complex matching conditions, and returns a value.

The simplest upgrade is matching against any type, including type checks with `is`:

```kotlin
fun describe(obj: Any): String = when (obj) {
    is String -> "Text with ${obj.length} characters"
    is Int -> "Integer: $obj"
    is Boolean -> if (obj) "TRUE" else "FALSE"
    is List<*> -> "List with ${obj.size} elements"
    else -> "Unknown: ${obj::class.simpleName}"
}
```

Notice that inside the `is String` branch, `obj` is automatically smart-cast to `String` — I'm calling `obj.length` without any explicit cast. This is one of `when`'s most powerful features and I'll cover it in detail in the next section.

You can match ranges with `in`, combine multiple conditions with commas, and even use arbitrary boolean expressions. Here's a pattern I use frequently in Android code:

```kotlin
fun classifyAge(age: Int): String = when {
    age < 0 -> throw IllegalArgumentException("Age cannot be negative")
    age == 0 -> "Newborn"
    age in 1..12 -> "Child"
    age in 13..17 -> "Teenager"
    age in 18..64 -> "Adult"
    else -> "Senior"
}

fun classifyHttpStatus(code: Int): String = when (code) {
    200, 201, 204 -> "Success"
    301, 302 -> "Redirect"
    400 -> "Bad Request"
    401, 403 -> "Auth Error"
    404 -> "Not Found"
    in 500..599 -> "Server Error"
    else -> "Unknown ($code)"
}
```

The `when` without an argument (like `classifyAge`) acts as a cleaner replacement for long `if-else` chains. Each branch is an independent boolean expression, evaluated top to bottom. I reach for this pattern whenever I have more than two conditions — it's easier to scan vertically than nested `if-else` blocks, and adding a new condition is just adding a line rather than restructuring indentation.

One thing worth noting: `when` branches are evaluated in order, so put more specific conditions first. If you put `age in 1..17` before `age in 1..12`, the child range would never match. The compiler won't warn you about this — it's on you to order branches correctly.

## Smart Casts

Smart casts are one of those features that seem small until you realize how much ceremony they eliminate. In Java, checking a type and using it requires two steps:

```kotlin
// Java-style: check then cast
if (response instanceof SuccessResponse) {
    SuccessResponse success = (SuccessResponse) response;
    processData(success.getData());
}

// Kotlin: compiler remembers the check
if (response is SuccessResponse) {
    processData(response.data) // response is already SuccessResponse
}
```

After an `is` check, the Kotlin compiler automatically casts the variable to the checked type within the scope where the check holds true. Under the hood, this compiles to the same bytecode — an `instanceof` check followed by a `checkcast` instruction. The compiler is doing exactly what you'd do manually in Java, but it's handling the bookkeeping so you don't have to.

Smart casts work in `if` blocks, `when` branches, and even `&&` chains:

```kotlin
fun processEvent(event: AppEvent) {
    // Smart cast in && chain
    if (event is ClickEvent && event.targetId == "submit_button") {
        handleSubmit(event.payload)
    }

    // Smart cast in when
    when (event) {
        is ClickEvent -> trackClick(event.targetId, event.timestamp)
        is ScrollEvent -> trackScroll(event.offset, event.velocity)
        is NavigationEvent -> trackNavigation(event.destination)
    }
}
```

In the `&&` chain, after `event is ClickEvent` evaluates to true, the right side of `&&` can access `event.targetId` directly — the compiler knows the cast is safe because `&&` short-circuits. If the left side is false, the right side never executes.

But here's the limitation that catches people: **smart casts only work on `val` declarations and local variables, not on `var` or properties with custom getters.** The reason is thread safety. Between the `is` check and the point where you use the cast value, another thread could reassign a `var` to a completely different type. The compiler can't guarantee the type is still what you checked, so it refuses to smart-cast.

```kotlin
class EventProcessor {
    var lastEvent: AppEvent? = null // var — can be reassigned

    fun process() {
        // Won't compile: smart cast impossible because
        // lastEvent is a mutable property
        if (lastEvent is ClickEvent) {
            // lastEvent.targetId  // ERROR
        }

        // Fix: capture in a local val
        val event = lastEvent
        if (event is ClickEvent) {
            handleClick(event.targetId) // works — event is a local val
        }
    }
}
```

The fix is straightforward — capture the mutable property in a local `val` before the check. This is a pattern I use constantly in Android, especially in Fragments and Activities where mutable state fields are common. Once the value is in a local `val`, the compiler knows nothing can change it between the check and the use.

Properties with custom getters also prevent smart casts for the same reason — calling the getter twice could return different values. If your property delegates to a backing field but has a custom getter, the compiler doesn't analyze the getter body to prove stability. It just refuses the smart cast.

## Exhaustive When

When `when` is used as an expression (meaning its result is assigned to something or returned), the compiler requires you to handle every possible case. This is nice with basic types, but it becomes genuinely powerful with sealed classes and enums.

```kotlin
sealed interface NetworkResult {
    data class Success(val data: String) : NetworkResult
    data class Error(val code: Int, val message: String) : NetworkResult
    data object Loading : NetworkResult
    data object Idle : NetworkResult
}

fun renderState(result: NetworkResult): ViewState = when (result) {
    is NetworkResult.Success -> ViewState.Content(result.data)
    is NetworkResult.Error -> ViewState.Error(result.message)
    NetworkResult.Loading -> ViewState.Loading
    NetworkResult.Idle -> ViewState.Empty
}
```

No `else` branch needed. The compiler knows `NetworkResult` is sealed, so the four subclasses are the only possibilities. Here's the critical part: if someone adds a new subclass — say `NetworkResult.Timeout` — every `when` expression over `NetworkResult` immediately becomes a compile error. The compiler forces you to handle the new case before the code will build.

This is the real safety net of sealed classes, and **using `else` throws it away.** When you write `else -> ViewState.Error("Unknown")` on a sealed type, you're telling the compiler "I don't care about future cases, just silently handle them." The day someone adds `NetworkResult.Timeout`, it silently falls into your `else` branch. No compile error, no warning. The new state gets the wrong treatment, and you find out at runtime — or worse, you don't find out at all and users see a generic error when they should see a timeout retry screen.

My rule: **never use `else` on sealed types in `when` expressions.** The whole point of sealing a hierarchy is compile-time exhaustiveness. If you `else` it away, you've opted out of the compiler's safety net for zero benefit.

But here's a gap — `when` as a statement (where the result isn't used) doesn't require exhaustiveness. You can write a `when` statement that only handles two of four sealed subtypes, and the compiler says nothing. This is a real problem in Android code where you might want to perform side effects for every state:

```kotlin
// This compiles even though Loading and Idle aren't handled
when (result) {
    is NetworkResult.Success -> showContent(result.data)
    is NetworkResult.Error -> showError(result.message)
}
```

The trick to force exhaustiveness on `when` statements is to make them expressions by using `.let {}`:

```kotlin
when (result) {
    is NetworkResult.Success -> showContent(result.data)
    is NetworkResult.Error -> showError(result.message)
    NetworkResult.Loading -> showLoading()
    NetworkResult.Idle -> { /* no-op */ }
}.let {} // forces exhaustiveness — compile error if branch is missing
```

By calling `.let {}` on the result, you've turned the `when` into an expression. Now removing a branch is a compile error. Some teams use an `exhaustive` extension property instead (`val <T> T.exhaustive get() = this`), but the `.let {}` approach requires no utility code.

## Control Flow as Expressions

In Java, `if`, `switch`, and `try` are statements. They direct execution but don't produce values. This leads to a specific pattern: declare a variable, enter a branch, assign it inside, use it after.

```kotlin
// Java-style: variable declaration separated from assignment
val label: String
if (count == 0) {
    label = "empty"
} else if (count == 1) {
    label = "single"
} else {
    label = "multiple"
}
```

In Kotlin, `if`, `when`, and `try` all return values, so you can assign the result directly:

```kotlin
// Kotlin: expression produces the value
val label = if (count == 0) "empty" else if (count == 1) "single" else "multiple"

// Even cleaner with when
val label = when {
    count == 0 -> "empty"
    count == 1 -> "single"
    else -> "multiple"
}
```

This isn't just shorter — it's structurally different. In the Java style, `label` is declared as a `var` (or an uninitialized `val` with deferred assignment), and the compiler has to track whether every branch assigns it. In the Kotlin style, `label` is a `val` initialized once, and the compiler guarantees it has a value because the expression must be exhaustive.

`try` as an expression is particularly useful for parsing and conversion:

```kotlin
val port = try {
    config.getProperty("server.port").toInt()
} catch (e: NumberFormatException) {
    8080
}

val userAge: Int = try {
    ageInput.text.toString().toInt()
} catch (e: NumberFormatException) {
    -1
}
```

No temporary variables, no uninitialized state. The value either comes from the happy path or the catch block. I use this pattern constantly for parsing user input in Android — EditText values, Intent extras, SharedPreferences defaults.

Expression bodies work beautifully with single-expression functions. When your function is just a `when` or `if` expression, drop the braces and use `=`:

```kotlin
fun User.displayName(): String = when {
    nickname.isNotBlank() -> nickname
    firstName.isNotBlank() -> "$firstName ${lastName.first()}."
    else -> email.substringBefore("@")
}

fun Int.toHttpCategory(): String = when (this) {
    in 200..299 -> "Success"
    in 300..399 -> "Redirect"
    in 400..499 -> "Client Error"
    in 500..599 -> "Server Error"
    else -> "Unknown"
}
```

Expression bodies signal to the reader that this function is a pure mapping — input goes in, output comes out, no side effects. I treat any function that's just a `when` or `if` as a candidate for expression body syntax. If the function has side effects or multiple statements, I use block body with explicit `return`. This convention makes the function's nature visible from its signature.

## takeIf and takeUnless

`takeIf` and `takeUnless` are two small standard library functions that become surprisingly powerful once you integrate them into your control flow patterns. `takeIf` evaluates a predicate on the receiver — if true, returns the receiver; if false, returns null. `takeUnless` does the inverse.

On their own, they're mildly useful. Combined with the Elvis operator, they create expressive fallback chains:

```kotlin
fun User.displayLabel(): String =
    nickname.takeIf { it.isNotBlank() }
        ?: fullName.takeIf { it.isNotBlank() }
        ?: email.substringBefore("@")
```

This reads almost like English: take the nickname if it's not blank, otherwise take the full name if it's not blank, otherwise fall back to the email prefix. No `if-else` nesting, no temporary variables. Each step either produces a value or yields null, and the Elvis chain moves to the next option.

I use this pattern for building display strings, resolving configuration values, and any situation where I'm trying a series of options in priority order. The alternative — nested `if` statements checking each option — works but doesn't communicate the "try this, then this, then this" intent as clearly.

`takeUnless` is less common but reads naturally for negative conditions:

```kotlin
fun getCachedResponse(key: String): CachedResponse? =
    responseCache[key]?.takeUnless { it.isExpired() }

fun validateInput(input: String): String? =
    input.trim().takeUnless { it.isEmpty() }
```

Here's the honest tradeoff: `takeIf` and `takeUnless` can reduce readability when the predicate is complex or when chaining gets too deep. A three-step `takeIf` chain is elegant. A five-step chain with multi-line predicates is hard to follow. I cap it at three levels and switch to explicit `when` if I need more branches. The goal is clarity, and sometimes a plain `when` expression is clearer than a clever chain.

One more thing — `takeIf` returns null when the predicate fails, which means the receiver type becomes nullable. If you're chaining operations after `takeIf`, you need safe-call operators. This is by design, not a bug — it forces you to handle the "predicate failed" case. But it can surprise you if you're expecting a non-null return type.

Thanks for reading!

## Quiz

#### What happens after an `is` check in a `when` expression?

- **Wrong** You must explicitly cast the variable to use type-specific methods
- **Wrong** The variable is copied into a new variable of the checked type
- **Correct** The compiler smart-casts the variable to the checked type automatically
- **Wrong** A runtime type check is performed each time you access the variable

> **Explanation:** Kotlin's smart casts automatically cast a variable after an `is` check. In `is String -> obj.length`, the compiler knows `obj` is a `String`. Smart casts only work on `val` or local variables.

#### Why should you avoid `else` in `when` expressions over sealed classes?

- **Wrong** It causes a runtime exception
- **Wrong** It makes the code slower
- **Correct** It hides new sealed subtypes — the compiler can't warn you about unhandled cases
- **Wrong** It's a syntax error

> **Explanation:** When you use `else` on a sealed class, new subtypes silently fall into the else branch. Without `else`, the compiler produces a compile error when you add a new subtype, forcing you to handle it explicitly.

## Coding Challenge

Write a function `processNetworkResponse` that takes an `Any` parameter representing different response types. Use smart casts and when expressions to handle: `String` (parse as JSON success message), `Int` (HTTP status code classification into success/redirect/client error/server error), `List<*>` (batch response with item count), and `Throwable` (error with message). Return a descriptive String for each case. Use expression body and no else branch.

#### Solution

```kotlin
sealed interface NetworkResponse {
    data class JsonSuccess(val message: String) : NetworkResponse
    data class StatusCode(val code: Int) : NetworkResponse
    data class BatchResult(val items: List<Any>) : NetworkResponse
    data class Failure(val error: Throwable) : NetworkResponse
}

fun processNetworkResponse(response: NetworkResponse): String = when (response) {
    is NetworkResponse.JsonSuccess ->
        "Success: ${response.message}"

    is NetworkResponse.StatusCode -> when (response.code) {
        in 200..299 -> "HTTP ${response.code}: Success"
        in 300..399 -> "HTTP ${response.code}: Redirect"
        in 400..499 -> "HTTP ${response.code}: Client Error"
        in 500..599 -> "HTTP ${response.code}: Server Error"
        else -> "HTTP ${response.code}: Unknown"
    }

    is NetworkResponse.BatchResult ->
        "Batch response: ${response.items.size} items processed"

    is NetworkResponse.Failure ->
        "Error: ${response.error.message ?: "Unknown error"}"
}

// Usage
fun main() {
    val responses = listOf(
        NetworkResponse.JsonSuccess("User created"),
        NetworkResponse.StatusCode(404),
        NetworkResponse.BatchResult(listOf("a", "b", "c")),
        NetworkResponse.Failure(IllegalStateException("Connection timeout"))
    )

    responses.forEach { response ->
        println(processNetworkResponse(response))
    }
}
// Output:
// Success: User created
// HTTP 404: Client Error
// Batch response: 3 items processed
// Error: Connection timeout
```

This solution uses a sealed interface so the `when` expression is exhaustive without an `else` branch. Adding a new `NetworkResponse` subtype forces you to handle it — the compiler won't let you forget. Each branch benefits from smart casts, accessing type-specific properties like `response.message`, `response.code`, `response.items`, and `response.error` without any explicit casting.
