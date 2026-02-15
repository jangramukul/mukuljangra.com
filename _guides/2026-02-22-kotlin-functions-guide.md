---
title: Kotlin Function Declarations and Default Parameters Guide
layout: post
sequence: 88
categories: post
tags:
  - Kotlin
  - Android
---

If you've ever maintained a Java codebase with complex APIs, you know the overload dance. A method like `createUser` starts with two parameters — name and email. Then someone needs an optional admin flag. Then a verified flag. Then a role string. Before you know it, you're staring at six or seven overloads of the same method, each calling the next with one more argument filled in. I've maintained Android SDKs where a single builder-style class had 15 overloads for various combinations of optional parameters. The cognitive overhead wasn't in writing them — it was in reading them six months later and figuring out which overload did what. Every new optional parameter meant touching every existing overload, adding tests for each, and hoping you didn't wire the wrong default somewhere.

Kotlin default parameters eliminate this entire category of code. You declare a function once, specify defaults for the parameters that are optional, and callers provide only what they need. It sounds simple, and it is — but the second-order effects are significant. Your API surface shrinks, your maintenance burden drops, and your call sites become self-documenting. I've refactored Java classes with 8 constructor overloads into a single Kotlin primary constructor with defaults, and the file went from 120 lines to 25. That's not a cosmetic improvement. That's an entire class of bugs — wrong defaults, missing overloads, inconsistent initialization — that simply can't happen anymore.

The features I want to walk through here — default parameters, named arguments, expression-body functions, `@JvmOverloads`, varargs, and the question of when overloading still matters — are foundational to writing clean Kotlin. They're also features where the surface simplicity hides real depth in how the compiler handles them.

## Default Parameters

The core idea is straightforward: you declare a function with default values for some parameters, and callers can omit those arguments. The compiler fills in the defaults. But the power isn't in the syntax — it's in what it replaces. In Java, every combination of optional parameters requires a separate method signature. In Kotlin, you write the function once.

```kotlin
fun createUser(
    name: String,
    email: String,
    isAdmin: Boolean = false,
    isVerified: Boolean = false,
    role: String = "member",
    maxRetries: Int = 3
): User {
    val user = User(name, email, role)
    if (isAdmin) user.grantAdminAccess()
    if (isVerified) user.markVerified()
    user.configureRetries(maxRetries)
    return user
}

// Callers provide only what they need
val basicUser = createUser("Alice", "alice@example.com")
val admin = createUser("Bob", "bob@corp.com", isAdmin = true)
val verifiedAdmin = createUser(
    name = "Carol",
    email = "carol@corp.com",
    isAdmin = true,
    isVerified = true,
    role = "superadmin"
)
```

In Java, this function would require at least four overloads to cover the common calling patterns — and you'd still lose the ability to skip middle parameters. Want to specify `maxRetries` without specifying `isAdmin`? In Java, you either write another overload or pass `false` explicitly. In Kotlin, you just name the argument: `createUser("Dave", "dave@corp.com", maxRetries = 5)`. The maintenance burden difference is real. I've worked on Android library APIs where adding a single optional parameter to a Java method meant updating 4 overloads, their Javadoc, and their unit tests. In Kotlin, you add the parameter with a default and you're done. One line changed, zero overloads to update.

The compiler handles this by generating a synthetic companion method with a bitmask that tracks which parameters the caller actually provided. When you call `createUser("Alice", "alice@example.com")`, the compiler generates a call that passes a bitmask indicating "only the first two arguments are caller-provided, fill in defaults for the rest." This is an implementation detail you never interact with directly, but understanding it explains why default parameters have essentially zero runtime cost — there's no reflection, no map lookup, just a bitmask check and a branch.

## Named Arguments

Named arguments solve a different but related problem: call-site readability. Consider this function call in a geometry library:

```kotlin
val rect = createRect(10, 20, 30, 40)
```

Is that `x, y, width, height`? Or `left, top, right, bottom`? Or `x, y, right, bottom`? Without jumping to the function declaration, you genuinely cannot tell. Now compare:

```kotlin
val rect = createRect(x = 10, y = 20, width = 30, height = 40)
```

There's no ambiguity. The call site is self-documenting. I use named arguments aggressively for any function with more than two parameters, and always for boolean parameters. `setVisibility(true, false)` is meaningless at the call site. `setVisibility(isVisible = true, animate = false)` is crystal clear.

Named arguments also let you reorder parameters freely, which matters when you're skipping defaults. Without named arguments, you can only omit trailing parameters. With them, you can provide any subset in any order:

```kotlin
fun configureNetwork(
    baseUrl: String,
    timeout: Long = 30_000,
    retries: Int = 3,
    logging: Boolean = false,
    interceptors: List<Interceptor> = emptyList()
) { /* ... */ }

// Skip timeout and retries, provide only logging
configureNetwork(
    baseUrl = "https://api.example.com",
    logging = true
)
```

One thing worth noting: named arguments are a compile-time feature. The parameter names are embedded in the function's metadata, but at runtime, arguments are passed positionally like any JVM method call. This means renaming a parameter is a binary-compatible change but a source-breaking one — callers using the old name won't compile. In library APIs, treat parameter names as part of your public contract.

## Expression-Body Functions

When a function's entire body is a single expression, you can drop the braces, the `return` keyword, and often the return type:

```kotlin
fun toCelsius(fahrenheit: Double) = (fahrenheit - 32) * 5.0 / 9.0

fun Int.isEven() = this % 2 == 0

fun User.displayName() = if (nickname.isNotBlank()) nickname else "$firstName $lastName"

fun List<Transaction>.totalAmount() = sumOf { it.amount }
```

The compiler infers the return type from the expression. For `toCelsius`, it infers `Double`. For `isEven`, `Boolean`. For `displayName`, `String`. You can still declare the return type explicitly — and for public API functions, I'd recommend it. Explicit return types serve as documentation and catch accidental type changes. But for private utility functions, letting the compiler infer saves visual noise.

My rule of thumb: if the expression fits on one line without horizontal scrolling (roughly 80-100 characters), use expression body. If it wraps to multiple lines or involves complex logic, use a block body with explicit `return`. Expression body is about clarity, and a three-line expression crammed after `=` is less clear than a proper block body. I see developers abuse this with multi-line `when` expressions or chained calls that span 4-5 lines. At that point, you're not making the code more readable — you're playing code golf.

Expression body also works with generic functions, extension functions, and operator overloads. It's not limited to simple calculations. But the readability principle still applies. The moment you find yourself debating whether an expression body is clear enough, switch to block body. The `return` keyword and braces cost almost nothing in readability but provide a clear signal about what the function does.

## @JvmOverloads Under the Hood

If you're writing Kotlin that Java code needs to call — libraries, shared modules, or mixed-language codebases — `@JvmOverloads` becomes essential. Without it, Java callers see only one method signature: the full one with every parameter. All your carefully designed defaults? Invisible to Java.

```kotlin
@JvmOverloads
fun sendEmail(
    to: String,
    subject: String,
    body: String = "",
    cc: String = "",
    isHtml: Boolean = false
) { /* ... */ }
```

The `@JvmOverloads` annotation tells the compiler to generate actual Java overloads. For the function above, it generates these signatures in the bytecode:

- `sendEmail(String to, String subject, String body, String cc, boolean isHtml)`
- `sendEmail(String to, String subject, String body, String cc)`
- `sendEmail(String to, String subject, String body)`
- `sendEmail(String to, String subject)`

The compiler fills in defaults from right to left. It also generates a synthetic bridge method with an `int` bitmask parameter and a `DefaultConstructorMarker` or similar sentinel — this is the method that actually contains the default-filling logic. The public overloads delegate to this synthetic method with the appropriate bitmask value.

Here's the thing most developers miss: `@JvmOverloads` generates overloads by removing parameters from right to left. You can't skip a middle parameter. If you have `fun f(a: Int, b: Int = 0, c: Int = 0)`, Java callers get `f(a)`, `f(a, b)`, and `f(a, b, c)` — but never `f(a, c)`. This is a limitation compared to Kotlin's named arguments, and it means parameter ordering matters. Put the most commonly omitted parameters last.

When to use `@JvmOverloads`: any public or protected function in a Kotlin class that Java code will call, and that has default parameters. When to skip it: pure Kotlin modules where no Java caller exists. Don't sprinkle it everywhere — each annotation generates N additional methods in your bytecode, which increases your method count. In a large codebase, unnecessary `@JvmOverloads` on internal functions adds up.

## vararg Parameters

The `vararg` modifier lets a function accept a variable number of arguments of the same type. Inside the function, the parameter behaves as an `Array<T>`:

```kotlin
fun logMessages(tag: String, vararg messages: String) {
    messages.forEach { message ->
        Log.d(tag, message)
    }
}

// Call with individual arguments
logMessages("Network", "Request sent", "Waiting for response", "Response received")

// Spread an existing array with *
val errors = arrayOf("Timeout", "DNS failure", "SSL error")
logMessages("Errors", *errors)

// Combine spread with additional arguments
logMessages("Lifecycle", "onCreate called", *errors, "onDestroy pending")
```

The spread operator `*` unpacks an array into individual arguments. Under the hood, this creates a new array that combines all the arguments — so there's an allocation cost. If you're calling a vararg function in a tight loop with spread, be aware of this. For most Android code, it's negligible, but in performance-critical paths like custom view drawing or animation calculations, prefer passing the array directly if the API supports it.

One subtlety: a function can have at most one `vararg` parameter, and it's conventionally the last parameter (though Kotlin allows it at any position if you use named arguments for the rest). If `vararg` is not the last parameter, all subsequent arguments must be passed as named arguments:

```kotlin
fun buildQuery(vararg columns: String, from: String, where: String = "") =
    "SELECT ${columns.joinToString()} FROM $from" +
        if (where.isNotBlank()) " WHERE $where" else ""

// Must name 'from' and 'where' because vararg isn't last
val query = buildQuery("name", "email", "age", from = "users", where = "active = true")
```

I generally put `vararg` last to avoid this awkwardness. The only exception is when the API reads more naturally with vararg first — like the `buildQuery` example above where "select these columns from this table" reads in a natural order.

## Function Overloading vs Default Parameters

Default parameters don't replace all overloading — they replace overloading where the parameter types stay the same and you're just providing convenient shortcuts for common argument combinations. But when the parameter types themselves change, overloading is still the right tool.

Consider parsing. You might need to parse content from a `String`, a `File`, or an `InputStream`. These aren't optional variations of the same parameters — they're fundamentally different input sources requiring different implementation logic:

```kotlin
// Overloading is correct here — different types, different logic
fun parseConfig(raw: String): AppConfig {
    return json.decodeFromString(raw)
}

fun parseConfig(file: File): AppConfig {
    return parseConfig(file.readText())
}

fun parseConfig(stream: InputStream): AppConfig {
    return parseConfig(stream.bufferedReader().readText())
}
```

Default parameters can't help here because the input type is different in each case. Each overload delegates to the `String` version, which is a clean pattern — one canonical implementation with convenience overloads for different input sources.

Now contrast this with the pattern I see far too often in Java codebases migrated to Kotlin:

```kotlin
// Bad — Java-style overloading where defaults would suffice
fun log(message: String) = log(message, "INFO", true)
fun log(message: String, level: String) = log(message, level, true)
fun log(message: String, level: String, includeTimestamp: Boolean) {
    val prefix = if (includeTimestamp) "[${System.currentTimeMillis()}]" else ""
    println("$prefix [$level] $message")
}

// Good — single function with defaults
fun log(
    message: String,
    level: String = "INFO",
    includeTimestamp: Boolean = true
) {
    val prefix = if (includeTimestamp) "[${System.currentTimeMillis()}]" else ""
    println("$prefix [$level] $message")
}
```

The good version is a third of the code, easier to maintain, and supports combinations the overloaded version doesn't — like `log("error", includeTimestamp = false)`. I use a simple decision rule: if every overload calls through to the same implementation with hardcoded values for the missing arguments, replace all of them with one function and default parameters. If the overloads have genuinely different logic or types, keep them.

## Common Mistakes

Default parameters are clean, but there are a few traps I've run into and seen others hit. The first is using runtime state as a default value:

```kotlin
// Dangerous — evaluated at each call, not at declaration time
fun logEvent(
    event: String,
    timestamp: Long = System.currentTimeMillis()
) { /* ... */ }
```

This works, but it's not always what people expect. The default expression is evaluated fresh every time the function is called without that argument. For `System.currentTimeMillis()`, that's actually the desired behavior — you want the current time. But I've seen developers use database queries, shared preference reads, or other expensive operations as defaults, assuming they're evaluated once. They're not. Every omitted call re-evaluates the expression. If your default involves I/O or computation, extract it into the function body with a null sentinel instead.

The second trap is defaults that reference earlier parameters:

```kotlin
fun createPage(
    title: String,
    slug: String = title.lowercase().replace(" ", "-"),
    url: String = "/pages/$slug"
) { /* ... */ }
```

This compiles and works in Kotlin — parameters can reference earlier parameters in their default expressions. But it creates implicit coupling. If someone reorders the parameters during a refactor, the defaults break. And the evaluation order isn't always obvious to readers. I prefer keeping defaults simple and independent. If a default depends on another parameter, compute it inside the function body:

```kotlin
fun createPage(
    title: String,
    slug: String? = null,
    url: String? = null
) {
    val actualSlug = slug ?: title.lowercase().replace(" ", "-")
    val actualUrl = url ?: "/pages/$actualSlug"
    // ...
}
```

The third mistake is stuffing conditional logic into defaults. If your "default" is actually a complex decision — "use X on API 26+, Y on older devices, Z in debug builds" — that's not a default parameter. That's business logic masquerading as a default. Pull it into the function body or a separate configuration function. Defaults should be sensible, predictable values: `false`, `emptyList()`, `""`, `0`, or simple expressions. The moment a default requires an `if` expression with side effects, it belongs in the function body.

## Quiz

#### What does `@JvmOverloads` do on a Kotlin function with default parameters?

- **Wrong** It makes the function callable from JavaScript
- **Correct** It generates actual Java method overloads for each combination of default parameters
- **Wrong** It makes all parameters optional
- **Wrong** It adds null checks for each parameter

> **Explanation:** Without `@JvmOverloads`, Java callers must provide all arguments. With it, the compiler generates overloads filling in defaults from right to left, plus a synthetic method with a bitmask tracking which arguments were provided.

#### When should you prefer function overloading over default parameters?

- **Wrong** Always — overloading is cleaner
- **Wrong** Never — default parameters replace all overloading
- **Correct** When parameter types differ — e.g., parse(String) vs parse(File) vs parse(InputStream)
- **Wrong** When you have more than 3 parameters

> **Explanation:** Default parameters handle optional arguments of the same type. But when the parameter types themselves differ (parsing from String vs File vs InputStream), overloading is the right choice because each version needs different implementation logic.

## Coding Challenge

Write a `NotificationBuilder` using only Kotlin functions with default parameters and named arguments (no builder pattern class). Create a `sendNotification` function that accepts title, body, priority (default NORMAL), channel (default "general"), sound (default true), vibrate (default true), and an optional action callback. Show how callers can customize any subset of parameters using named arguments. Include a `@JvmOverloads` version for Java interop.

#### Solution

```kotlin
enum class Priority { LOW, NORMAL, HIGH, URGENT }

@JvmOverloads
fun sendNotification(
    title: String,
    body: String,
    priority: Priority = Priority.NORMAL,
    channel: String = "general",
    sound: Boolean = true,
    vibrate: Boolean = true,
    action: (() -> Unit)? = null
) {
    val notification = NotificationCompat.Builder(appContext, channel)
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(
            when (priority) {
                Priority.LOW -> NotificationCompat.PRIORITY_LOW
                Priority.NORMAL -> NotificationCompat.PRIORITY_DEFAULT
                Priority.HIGH -> NotificationCompat.PRIORITY_HIGH
                Priority.URGENT -> NotificationCompat.PRIORITY_MAX
            }
        )
        .setSound(if (sound) RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) else null)
        .setVibrate(if (vibrate) longArrayOf(0, 250, 250, 250) else null)
        .build()

    NotificationManagerCompat.from(appContext).notify(title.hashCode(), notification)
    action?.invoke()
}

// Callers use named arguments to customize any subset
sendNotification("Build Complete", "All 247 tests passed")

sendNotification(
    title = "Payment Failed",
    body = "Card ending in 4242 was declined",
    priority = Priority.URGENT,
    channel = "payments",
    action = { navigateToPaymentSettings() }
)

sendNotification(
    title = "Sync Finished",
    body = "12 records updated",
    sound = false,
    vibrate = false
)
```

Thanks for reading!
