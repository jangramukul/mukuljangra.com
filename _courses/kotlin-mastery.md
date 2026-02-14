---
title: "Kotlin Mastery"
layout: course
description: "Master Kotlin from fundamentals to advanced patterns — null safety, generics, DSLs, inline functions, and idiomatic Kotlin for production Android code."
icon: "🟣"
color: "#a78bfa"
difficulty: "Beginner to Expert"
modules: 8
lessons: 49
duration: "10 weeks"
order: 1
tags:
  - Kotlin
  - Android
  - Language
what_you_learn:
  - "Write idiomatic Kotlin with null safety, sealed classes, and data classes"
  - "Master higher-order functions, lambdas, and functional patterns"
  - "Build type-safe DSLs and use advanced generics with variance"
  - "Apply scope functions (let, run, apply, also, with) correctly"
  - "Use inline functions, reified types, and delegation patterns"
  - "Design production-ready code with Kotlin best practices"
prerequisites:
  - "Basic programming experience"
  - "Android Studio installed"
---

## Module 1: Kotlin Fundamentals

The foundation every Kotlin developer needs. If you're coming from Java, this is where you unlearn old habits and start thinking in Kotlin. Kotlin compiles to JVM bytecode, which means everything you write ultimately becomes the same `.class` files Java produces. But the language gives you far better tools for expressing intent, catching bugs at compile time, and writing concise code without sacrificing readability.

### Lesson 1.1: Variables, Types, and Type Inference

Kotlin's type system is smarter than Java's. You rarely need to declare types explicitly — the compiler figures it out through a process called type inference. When you write `val name = "Mukul"`, the compiler analyzes the right-hand expression, determines it's a `String`, and assigns that type to the variable. This isn't dynamic typing — the type is fixed at compile time. You just don't need to write it out.

```kotlin
val name = "Mukul"          // String, immutable
var counter = 0             // Int, mutable
val pi = 3.14               // Double
val isActive = true         // Boolean

// Type is inferred, but you can be explicit
val explicitName: String = "Mukul"

// Late initialization for non-null properties
lateinit var adapter: RecyclerView.Adapter<*>
```

**`val` vs `var`** — Use `val` by default. Only reach for `var` when you genuinely need mutation. This isn't a suggestion — it's how you prevent entire categories of bugs. Immutability is your first line of defense. When you see `val`, you know the reference never changes. When you see `var`, your brain shifts into alert mode because now you need to track where it changes.

**Under the hood**, `val` compiles to a `private final` field with a getter method. `var` compiles to a `private` field with both getter and setter. The `final` modifier on `val` fields means the JVM can optimize reads more aggressively because it knows the value won't change after initialization. For primitives like `Int` and `Boolean`, Kotlin uses JVM primitive types directly (`int`, `boolean`) — no boxing happens unless the type is nullable.

**Common mistake:** Assuming `val` means the object itself is immutable. `val` only makes the reference immutable. A `val list = mutableListOf(1, 2, 3)` can still have elements added or removed. The reference `list` can't be reassigned, but the list's contents can change. True immutability requires using immutable data structures like `listOf()`.

**Key takeaway:** Kotlin's type inference eliminates boilerplate without losing type safety. The compiler knows the type — you don't need to repeat it. Default to `val` and only use `var` when mutation is genuinely required.

### Lesson 1.2: Null Safety — The Billion-Dollar Fix

This is Kotlin's killer feature. Tony Hoare called null references his "billion-dollar mistake." Kotlin fixes it at the type system level by distinguishing between nullable and non-nullable types. Every type in Kotlin exists in two forms: `String` (cannot be null) and `String?` (can be null). The compiler tracks this throughout your entire codebase and refuses to compile code that could produce a `NullPointerException`.

```kotlin
var name: String = "Mukul"
// name = null  // ❌ Compile error — non-null type

var nullable: String? = "Mukul"
nullable = null  // ✅ Explicitly nullable

// Safe call operator
val length = nullable?.length  // Returns null if nullable is null

// Elvis operator
val len = nullable?.length ?: 0  // Default to 0 if null

// Non-null assertion (avoid this)
val forced = nullable!!.length  // Throws NPE if null

// Safe calls chain naturally
val city = user?.address?.city?.uppercase()
```

**The `!!` operator** is a code smell. Every `!!` in your codebase is a potential crash. If you find yourself using it, rethink your data flow. Use `?.let {}`, `?: return`, or smart casts instead. The only acceptable use of `!!` is when you can mathematically prove the value is non-null but the compiler can't see it — and even then, `requireNotNull()` with a descriptive message is better because it gives you context when things go wrong.

**Under the hood**, nullable types compile differently than you might expect. At the bytecode level, `String` and `String?` are both `java.lang.String`. The null safety is enforced entirely at compile time through the Kotlin compiler's analysis. When you call a function that takes a non-null `String` parameter, the compiler inserts a null check at the function entry point (`Intrinsics.checkNotNullParameter`). If someone calls your Kotlin function from Java with null, the check triggers immediately with a clear error message rather than failing later in a confusing way.

**Platform types** are Kotlin's escape hatch for Java interop. When you call a Java method that returns `String`, Kotlin doesn't know if it can be null — Java doesn't express that in its type system. The return type becomes `String!` (a platform type). Never let platform types leak into your Kotlin code. Assign them to either `String` or `String?` immediately:

```kotlin
// Java method: public String getName() { ... }
val name: String = javaObject.getName()   // Crash if Java returns null
val name: String? = javaObject.getName()  // Safe — you handle null

// Always prefer the nullable assignment unless you're certain
val safeName: String = javaObject.getName() ?: "Unknown"
```

**`requireNotNull` vs `!!`** — At system boundaries (parsing intents, reading API responses), use `requireNotNull` with descriptive messages:

```kotlin
fun handleDeepLink(intent: Intent): DeepLinkParams {
    val rawUri = requireNotNull(intent.data) {
        "DeepLink intent must contain a URI, received: $intent"
    }
    val userId = requireNotNull(rawUri.getQueryParameter("user_id")) {
        "DeepLink URI missing required user_id parameter: $rawUri"
    }
    return DeepLinkParams(userId = userId, uri = rawUri)
}
```

**Key takeaway:** Nullable types force you to handle null at compile time, not runtime. The compiler becomes your safety net. Push null checks to system boundaries and make your domain models non-null.

### Lesson 1.3: When Expressions and Smart Casts

`when` replaces Java's `switch` and does it better. It works with any type (not just primitives and strings), supports ranges, type checks, and arbitrary conditions. Combined with smart casts, it eliminates explicit casting entirely.

```kotlin
fun describe(obj: Any): String = when (obj) {
    is Int -> "Integer: ${obj * 2}"     // Smart cast — obj is Int here
    is String -> "String of length ${obj.length}"
    is Boolean -> if (obj) "True" else "False"
    else -> "Unknown"
}

// When as a statement with ranges
fun classifyAge(age: Int) = when (age) {
    in 0..12 -> "Child"
    in 13..19 -> "Teenager"
    in 20..64 -> "Adult"
    else -> "Senior"
}

// When without argument — replaces if-else chains
fun processInput(input: String) = when {
    input.isBlank() -> "Empty input"
    input.length > 100 -> "Too long"
    input.startsWith("@") -> "Mention: $input"
    else -> input
}
```

**Smart casts** are one of Kotlin's best features. After an `is` check, the compiler knows the type — no explicit cast needed. This works in `if`, `when`, and `&&` chains. The compiler tracks the type through control flow, so after `if (obj is String)`, every branch that can only be reached when `obj` is a `String` has access to `String` methods.

Smart casts have a limitation: they only work on `val` variables or local variables. If a property is `var` or has a custom getter, the compiler can't guarantee the type hasn't changed between the check and the use. In those cases, you need a local variable:

```kotlin
// Won't smart cast — property could change between check and use
var currentState: Any = "hello"
if (currentState is String) {
    // currentState.length  // ❌ Compile error
}

// Fix: capture in a local val
val state = currentState
if (state is String) {
    println(state.length)  // ✅ Smart cast works
}
```

**Exhaustive `when`** — When used as an expression (returning a value), `when` must cover all cases. With sealed classes and enums, this means the compiler forces you to handle every variant. Adding a new sealed subtype produces compile errors everywhere you forgot to handle it. This is one of the most powerful safety mechanisms in Kotlin.

**Key takeaway:** `when` is exhaustive when used with sealed classes, forcing you to handle every case. Combined with smart casts, it makes type-safe branching effortless.

### Lesson 1.4: String Templates and Raw Strings

Kotlin's string templates eliminate the need for `String.format()` and concatenation. You embed expressions directly in strings using `$variable` or `${expression}`. The compiler converts these to `StringBuilder` calls in the bytecode, so there's no performance penalty compared to manual concatenation.

```kotlin
val user = "Mukul"
val greeting = "Hello, $user!"
val calculation = "2 + 2 = ${2 + 2}"
val conditional = "Status: ${if (isActive) "Active" else "Inactive"}"

// Multiline strings with trimMargin
val query = """
    |SELECT *
    |FROM users
    |WHERE active = true
    |ORDER BY name
""".trimMargin()

// Raw strings for regex patterns
val emailPattern = """[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}""".toRegex()
```

**Raw strings** (triple-quoted) preserve whitespace, newlines, and don't require escape characters. This makes them ideal for SQL queries, JSON templates, regex patterns, and multi-line text. `trimMargin()` strips leading whitespace up to the margin character (`|` by default), giving you clean indentation in code while producing properly formatted output.

**Performance note:** For simple templates like `"User $name logged in"`, the compiler generates efficient bytecode. But inside loops, string concatenation with `+=` creates a new `String` object on every iteration because strings are immutable. Each `+=` allocates a new string, copies all existing characters, and appends the new content. For 100 iterations, you're doing O(n²) work. Use `buildString` instead:

```kotlin
// ❌ O(n²) — allocates a new String every iteration
var result = ""
for (item in items) result += "$item, "

// ✅ O(n) — single StringBuilder, amortized growth
val result = buildString {
    for (item in items) append(item).append(", ")
}
```

**Key takeaway:** String templates replace `String.format()` and concatenation. Raw strings with `trimMargin()` make SQL queries, JSON templates, and regex patterns readable. Use `buildString` for loop-based string construction.

### Lesson 1.5: Control Flow as Expressions

In Kotlin, `if`, `when`, and `try` are expressions — they return values. This eliminates temporary variables and makes code more declarative. Instead of assigning a variable inside branches, you assign the result of the entire expression.

```kotlin
// if as expression
val max = if (a > b) a else b

// when as expression
val label = when (status) {
    Status.ACTIVE -> "Active"
    Status.SUSPENDED -> "Suspended"
    Status.DELETED -> "Deleted"
}

// try as expression
val number = try {
    input.toInt()
} catch (e: NumberFormatException) {
    -1
}

// Chaining expressions
val displayName = user?.name?.takeIf { it.isNotBlank() }
    ?: user?.email?.substringBefore("@")
    ?: "Anonymous"
```

**Expression bodies** let you write single-expression functions without braces or `return`:

```kotlin
fun Double.toCelsius() = (this - 32) * 5.0 / 9.0
fun Int.isEven() = this % 2 == 0
fun User.displayName() = "$firstName $lastName"
```

This style is idiomatic for simple transformations. The compiler infers the return type from the expression. For functions longer than a single line, use block bodies with explicit return types — readability matters more than brevity.

**Key takeaway:** Expressions reduce mutable state by letting you compute values directly. Prefer expression bodies for simple functions and expression-style `if`/`when` for conditional assignment.

### Lesson 1.6: Ranges, Progressions, and Destructuring

Ranges and destructuring are small features that make a big difference in day-to-day code. Ranges define intervals with `..` and can be used in `for` loops, `when` expressions, and containment checks.

```kotlin
// Ranges
for (i in 1..10) println(i)          // 1 to 10 inclusive
for (i in 0 until 10) println(i)     // 0 to 9 (exclusive end)
for (i in 10 downTo 1) println(i)    // 10 to 1
for (i in 0..100 step 5) println(i)  // 0, 5, 10, ..., 100

// Containment check
val isValid = age in 18..65
val isLetter = char in 'a'..'z' || char in 'A'..'Z'

// Destructuring declarations
val (name, email, age) = user  // Uses component1(), component2(), component3()

// Destructuring in lambdas
userMap.forEach { (key, value) ->
    println("$key: $value")
}

// Destructuring with data classes
data class Coordinate(val x: Double, val y: Double)
val (x, y) = Coordinate(3.0, 4.0)
```

**Under the hood**, destructuring uses `componentN()` functions. Data classes generate these automatically. For custom classes, you can define them as operator functions:

```kotlin
class Color(val r: Int, val g: Int, val b: Int) {
    operator fun component1() = r
    operator fun component2() = g
    operator fun component3() = b
}

val (red, green, blue) = Color(255, 128, 0)
```

**Common mistake:** Destructuring ignores trailing properties, but you can't skip middle ones. Use `_` as a placeholder for unused components:

```kotlin
val (_, email) = user  // Skip name, only take email
val (id, _, _, createdAt) = order  // Skip name and email
```

**Key takeaway:** Ranges make iteration and containment checks readable. Destructuring eliminates temporary variables when working with data classes, maps, and pairs.

### Quiz: Kotlin Fundamentals

#### What is the difference between `val` and `var` in Kotlin?

- ❌ `val` is for primitive types and `var` is for reference types
- ❌ `val` creates a constant known at compile time, `var` creates a runtime variable
- ✅ `val` declares a read-only (immutable) reference and `var` declares a mutable reference
- ❌ `val` is thread-safe and `var` is not

> **Explanation:** `val` (value) creates a read-only reference that cannot be reassigned after initialization. `var` (variable) creates a mutable reference. Note that `val` doesn't make the object itself immutable — only the reference. A `val list = mutableListOf(1, 2, 3)` can still have elements added to it.

#### What does the Elvis operator (`?:`) do?

- ❌ It throws a NullPointerException if the left side is null
- ❌ It converts a nullable type to a non-null type unconditionally
- ✅ It returns the left-hand value if it's not null, otherwise returns the right-hand default value
- ❌ It checks if two nullable values are both null

> **Explanation:** The Elvis operator `?:` provides a fallback value when the left side is null. For example, `name?.length ?: 0` returns the length if `name` is not null, or `0` if it is. It's named after Elvis Presley's hairstyle resemblance.

#### What happens after an `is` check in a `when` expression?

- ❌ You must explicitly cast the variable to use type-specific methods
- ❌ The variable is copied into a new variable of the checked type
- ✅ The compiler smart-casts the variable to the checked type automatically
- ❌ A runtime type check is performed each time you access the variable

> **Explanation:** Kotlin's smart casts automatically cast a variable to the checked type after an `is` check. Inside the `when` branch `is String -> obj.length`, the compiler knows `obj` is a `String` and allows calling `.length` without an explicit cast. Smart casts only work on `val` or local variables.

### Coding Challenge: Safe Parser

Write a function `parseInput` that takes a `String?` input and returns a formatted result string. It should:

- Return `"Empty input"` if the input is null or blank
- Return `"Integer: X (even/odd)"` if the input is a valid integer, indicating whether it's even or odd
- Return `"Decimal: X"` if the input is a valid decimal number
- Return `"Text: X (N chars)"` for all other non-blank strings
- Use null safety operators and `when` expression (no `if-else` chains)

#### Solution

```kotlin
fun parseInput(input: String?): String {
    val trimmed = input?.trim()?.takeIf { it.isNotBlank() } ?: return "Empty input"

    return when {
        trimmed.toIntOrNull() != null -> {
            val num = trimmed.toInt()
            "Integer: $num (${if (num % 2 == 0) "even" else "odd"})"
        }
        trimmed.toDoubleOrNull() != null -> "Decimal: ${trimmed.toDouble()}"
        else -> "Text: $trimmed (${trimmed.length} chars)"
    }
}

fun main() {
    println(parseInput(null))        // Empty input
    println(parseInput("  "))        // Empty input
    println(parseInput("42"))        // Integer: 42 (even)
    println(parseInput("3.14"))      // Decimal: 3.14
    println(parseInput("Kotlin"))    // Text: Kotlin (6 chars)
}
```

This solution uses the safe call operator `?.`, the Elvis operator `?: return` for early return, `takeIf` for conditional nulling, string templates, and `when` without an argument for clean branching.

---

## Module 2: Functions and Lambdas

Kotlin treats functions as first-class citizens. This module covers everything from basic functions to higher-order patterns that power coroutines, Compose, and the entire Kotlin standard library.

### Lesson 2.1: Function Declarations and Default Parameters

Kotlin functions come in several forms, but the most impactful feature is default parameters. In Java, when you need a function with optional arguments, you write overloads — three, four, sometimes eight versions of the same function. Kotlin eliminates this with default parameter values. You define the function once, and callers provide only the arguments they need.

```kotlin
// Default parameters eliminate overloads
fun createUser(
    name: String,
    email: String,
    isAdmin: Boolean = false,
    verified: Boolean = false
): User = User(name, email, isAdmin, verified)

// Call with named arguments for clarity
val user = createUser(
    name = "Mukul",
    email = "mukul@example.com",
    isAdmin = true
)

// Single-expression functions
fun Double.toCelsius() = (this - 32) * 5.0 / 9.0
fun Int.isEven() = this % 2 == 0
```

**Named arguments** make code self-documenting. Instead of `createUser("Mukul", "m@x.com", true, false)` where you have to guess what those booleans mean, named arguments make intent explicit. You can also reorder named arguments freely.

**Under the hood**, when you use `@JvmOverloads` annotation, the Kotlin compiler generates actual Java overloads for each combination of default parameters. Without it, Java callers must provide all arguments. The generated overloads fill in the defaults from right to left:

```kotlin
@JvmOverloads
fun createNotification(
    title: String,
    body: String,
    priority: Int = PRIORITY_DEFAULT,
    channel: String = "default"
): Notification { /* ... */ }

// Java sees these overloads:
// createNotification(String, String, int, String)
// createNotification(String, String, int)
// createNotification(String, String)
```

**Common mistake:** Using default parameters for values that change based on context. Defaults should be reasonable defaults, not conditional logic. If the "default" is actually a computed value, use an overloaded function or a builder instead.

**Key takeaway:** Default parameters replace the builder pattern and method overloading in most cases. Named arguments make function calls readable without needing to check the signature.

### Lesson 2.2: Extension Functions

Extension functions let you add behavior to existing classes without inheritance or decoration. They're syntactic sugar that makes utility functions discoverable through IDE autocomplete.

```kotlin
fun String.isValidEmail(): Boolean {
    return this.contains("@") && this.contains(".")
}

fun List<Int>.secondOrNull(): Int? {
    return if (this.size >= 2) this[1] else null
}

// Usage — reads like a built-in method
val email = "mukul@example.com"
if (email.isValidEmail()) { /* ... */ }

// Extensions on nullable types
fun String?.orEmpty(): String = this ?: ""
fun Any?.toSafeString(): String = this?.toString() ?: "null"
```

**Under the hood**, extension functions compile to static methods. `"hello".isValidEmail()` becomes `StringExtKt.isValidEmail("hello")` in the bytecode. The receiver object is passed as the first parameter. This has a critical implication: extension functions are resolved **statically**, not dynamically. They don't participate in polymorphism:

```kotlin
open class Animal
class Dog : Animal()

fun Animal.greet() = "I'm an animal"
fun Dog.greet() = "I'm a dog"

val animal: Animal = Dog()
println(animal.greet())  // "I'm an animal" — resolved by declared type, not runtime type
```

This catches people off guard when they expect polymorphic dispatch. The extension is resolved based on the compile-time type of the receiver, not the runtime type. For polymorphic behavior, use member functions.

**Best practice for extensions:** An extension function should feel like it *belongs* on that type. If you have to explain why it's an extension instead of a regular function, it probably shouldn't be one. Use extensions for types you don't own — Android framework classes, third-party library types, standard library types. Don't use them for complex business logic that happens to take a particular type as input:

```kotlin
// ✅ Good — genuinely extends View behavior
fun View.fadeIn(duration: Long = 300L) {
    alpha = 0f
    visibility = View.VISIBLE
    animate().alpha(1f).setDuration(duration).start()
}

// ❌ Bad — business logic pretending to be an extension
fun String.calculateTax(): Double = // This belongs in a TaxCalculator class
```

**Key takeaway:** Extensions make utility functions discoverable through IDE autocomplete. But they're resolved statically, don't override member functions, and shouldn't be used for business logic that doesn't logically belong to the receiver type.

### Lesson 2.3: Higher-Order Functions and Lambdas

Functions that take functions as parameters or return them. This is the foundation of Kotlin's functional style and how APIs like `map`, `filter`, Compose's `@Composable`, and coroutine builders all work.

```kotlin
// Higher-order function
fun <T> List<T>.customFilter(predicate: (T) -> Boolean): List<T> {
    val result = mutableListOf<T>()
    for (item in this) {
        if (predicate(item)) result.add(item)
    }
    return result
}

// Lambda syntax variations
val adults = users.customFilter { it.age >= 18 }
val adults = users.customFilter { user -> user.age >= 18 }  // Named parameter
val adults = users.customFilter(predicate = { it.age >= 18 })

// Function references
val adults = users.customFilter(User::isAdult)

// Trailing lambda convention
val names = users
    .filter { it.isActive }
    .map { it.name }
    .sorted()
```

**Trailing lambda** — when the last parameter is a function, you can move the lambda outside the parentheses. This is why Compose's `Column { ... }` syntax works and why `buildList { add(item) }` reads naturally. If the lambda is the *only* parameter, you can omit the parentheses entirely: `names.forEach { println(it) }`.

**Lambda captures and closures** — Lambdas can capture variables from the enclosing scope. Unlike Java's anonymous classes (which require `final` or effectively final variables), Kotlin lambdas can capture and modify `var` variables:

```kotlin
var count = 0
val incrementAndPrint = { count++; println(count) }
incrementAndPrint()  // 1
incrementAndPrint()  // 2
```

**Under the hood**, each lambda compiles to an anonymous class that implements `FunctionN<>`. A lambda `{ x: Int -> x * 2 }` becomes an instance of `Function1<Int, Int>`. This means every non-inline lambda creates an object allocation. For hot paths, this matters — which is why `inline` exists (covered in Module 6).

**Key takeaway:** Higher-order functions are the backbone of Kotlin's standard library, coroutines, and Compose. Understanding lambdas, trailing lambda convention, and function references is non-negotiable for idiomatic Kotlin.

### Lesson 2.4: Scope Functions (let, run, with, apply, also)

Five functions that execute a block of code in the context of an object. Each has a specific use case determined by two axes: what the context object is called (`this` vs `it`) and what the function returns (the lambda result vs the context object).

```kotlin
// let — null-safe operations, transformations
// Context: it | Returns: lambda result
user?.let { activeUser ->
    sendWelcomeEmail(activeUser)
    trackLogin(activeUser.id)
}

// apply — object configuration (returns the object)
// Context: this | Returns: context object
val textView = TextView(context).apply {
    text = "Hello"
    textSize = 16f
    setTextColor(Color.WHITE)
}

// also — side effects without changing the chain
// Context: it | Returns: context object
fun createUser(name: String) = User(name)
    .also { log("Created user: ${it.name}") }
    .also { analytics.track("user_created") }

// run — execute a block and return the result
// Context: this | Returns: lambda result
val result = service.run {
    connect()
    fetchData()
}

// with — call multiple methods on an object
// Context: this | Returns: lambda result (non-extension)
with(binding) {
    titleText.text = item.title
    subtitleText.text = item.subtitle
    icon.setImageResource(item.iconRes)
}
```

**The two-axis mental model:**

- **`let`**: `it` + lambda result — null checks, transformations, mapping
- **`run`**: `this` + lambda result — computing a result using an object's members
- **`with`**: `this` + lambda result (non-extension) — operating on a known non-null subject
- **`apply`**: `this` + context object — configuring/initializing objects
- **`also`**: `it` + context object — side effects like logging, caching, analytics

**The `?.let` trap:** Be careful with `?.let { ... } ?: fallback`. If the `let` block itself returns null, the fallback executes even though the original value wasn't null. Use a plain `if` when you need both branches:

```kotlin
// ❌ Dangerous: if transform() returns null, fallback runs
val result = apiResponse?.let { transform(it) } ?: fallback()

// ✅ Safer: plain if-else when you need both branches
val result = if (apiResponse != null) transform(apiResponse) else fallback()
```

**Common mistake:** Chaining three or four scope functions together. If you find yourself writing `object.let { }.run { }.also { }`, stop. That's unreadable. One scope function per chain is the rule. Two if you absolutely must. Beyond that, use local variables.

**Key takeaway:** `let` for null checks, `apply` for configuration, `also` for side effects, `run` for computing a result, `with` for grouping calls. Don't nest more than 2 — readability drops fast.

### Lesson 2.5: Function Types and References

Kotlin has a rich system for representing function types. Understanding this system is essential for working with higher-order functions, storing callbacks, and using method references.

```kotlin
// Function types
val greet: (String) -> String = { name -> "Hello, $name!" }
val add: (Int, Int) -> Int = { a, b -> a + b }
val logAction: () -> Unit = { println("Action performed") }

// Nullable function types
val callback: ((String) -> Unit)? = null
callback?.invoke("data")  // Safe call on function type

// Function type with receiver
val buildString: StringBuilder.() -> Unit = {
    append("Hello, ")
    append("World!")
}

// Function references — four kinds
val ref1 = ::topLevelFunction       // Top-level function
val ref2 = String::length           // Member function
val ref3 = String::isBlank          // Extension function
val ref4 = User::name.getter        // Property reference
```

**Receiver function types** (`StringBuilder.() -> Unit`) are what power DSLs and scope functions. Inside the lambda, `this` refers to the receiver object. This is how `apply` works — it takes a `T.() -> Unit` parameter:

```kotlin
// apply is essentially:
inline fun <T> T.apply(block: T.() -> Unit): T {
    block()  // `this` inside block is the receiver
    return this
}
```

**Storing lambdas** — You can store function types in properties, pass them through constructors, and use them as callback mechanisms. This is cleaner than Java's anonymous interface implementations:

```kotlin
class Button(private val onClick: () -> Unit) {
    fun click() = onClick()
}

val button = Button { println("Clicked!") }
```

**Key takeaway:** Function types are first-class types in Kotlin. Understanding receiver function types (`T.() -> Unit`) is essential for DSLs and scope functions. Method references (`::functionName`) provide a concise alternative to lambdas for passing existing functions.

### Lesson 2.6: Infix Functions and Operator Overloading

Infix functions and operator overloading let you write more expressive APIs by defining how operators and dot-free syntax work with your types.

```kotlin
// Infix functions — called without dot or parentheses
infix fun Int.pow(exponent: Int): Long {
    var result = 1L
    repeat(exponent) { result *= this }
    return result
}
val result = 2 pow 10  // 1024

// Standard library infix functions
val pair = "key" to "value"   // Creates Pair<String, String>
val isInRange = 5 in 1..10    // Containment check

// Operator overloading
data class Vector(val x: Double, val y: Double) {
    operator fun plus(other: Vector) = Vector(x + other.x, y + other.y)
    operator fun minus(other: Vector) = Vector(x - other.x, y - other.y)
    operator fun times(scalar: Double) = Vector(x * scalar, y * scalar)
    operator fun unaryMinus() = Vector(-x, -y)
}

val v1 = Vector(1.0, 2.0)
val v2 = Vector(3.0, 4.0)
val sum = v1 + v2          // Vector(4.0, 6.0)
val scaled = v1 * 2.5      // Vector(2.5, 5.0)
val negated = -v1           // Vector(-1.0, -2.0)
```

**Operator conventions** — Kotlin maps operators to function calls: `a + b` calls `a.plus(b)`, `a[i]` calls `a.get(i)`, `a in b` calls `b.contains(a)`. This is how destructuring works too — `val (a, b) = pair` calls `pair.component1()` and `pair.component2()`.

**Common mistake:** Overusing operator overloading. If `+` doesn't intuitively make sense for your type, don't define it. Code like `user + permission` is confusing — use a named method like `user.grantPermission(permission)` instead. Operators should behave as mathematically or logically expected.

**Key takeaway:** Infix functions enable natural-language-like syntax for specific use cases. Operator overloading lets custom types work with standard operators, but use it sparingly — only when the operation is intuitive.

### Quiz: Functions and Lambdas

#### What is the trailing lambda convention in Kotlin?

- ❌ Lambdas must always be the last parameter in a function declaration
- ✅ When the last parameter of a function is a lambda, it can be placed outside the parentheses at the call site
- ❌ Trailing lambdas are always executed after the function returns
- ❌ Trailing lambdas cannot capture variables from the enclosing scope

> **Explanation:** The trailing lambda convention is syntactic sugar — if a function's last parameter is a function type, the lambda argument can be placed outside the parentheses. This is why `list.filter { it > 0 }` works instead of `list.filter({ it > 0 })`.

#### How do extension functions work under the hood?

- ❌ They modify the original class bytecode at compile time
- ❌ They use runtime reflection to add methods to the class
- ✅ They compile to static methods where the receiver object is passed as the first argument
- ❌ They create a subclass with the new method and cast to it

> **Explanation:** `fun String.isValidEmail()` compiles to a static method like `public static boolean isValidEmail(String $this)`. No class modification occurs — extension functions are resolved statically based on the declared type, not the runtime type.

#### Which scope function returns the object itself (not the lambda result) and refers to the object as `it`?

- ❌ `let`
- ❌ `apply`
- ✅ `also`
- ❌ `run`

> **Explanation:** `also` returns the receiver object and refers to it as `it` (not `this`). It's designed for side effects like logging or analytics without interrupting a call chain. `apply` also returns the receiver but uses `this`.

### Coding Challenge: Pipeline Builder

Write a `Pipeline<T>` class using higher-order functions that:

- Stores a chain of transformation functions `(T) -> T`
- Has an `addStep` method to register a transformation
- Has an `execute` method that applies all steps in order to an input value
- Uses extension function syntax for a clean API

#### Solution

```kotlin
class Pipeline<T> {
    private val steps = mutableListOf<(T) -> T>()

    fun addStep(transform: (T) -> T): Pipeline<T> {
        steps.add(transform)
        return this
    }

    fun execute(input: T): T {
        return steps.fold(input) { acc, step -> step(acc) }
    }
}

fun <T> buildPipeline(block: Pipeline<T>.() -> Unit): Pipeline<T> {
    return Pipeline<T>().apply(block)
}

fun main() {
    val textPipeline = buildPipeline<String> {
        addStep { it.trim() }
        addStep { it.lowercase() }
        addStep { it.replace("\\s+".toRegex(), "-") }
        addStep { it.take(50) }
    }

    val slug = textPipeline.execute("  Hello World  Kotlin Example  ")
    println(slug) // "hello-world--kotlin-example"
}
```

This solution demonstrates higher-order functions (storing lambdas in a list), `fold` for sequential application, receiver lambdas for the builder DSL, and method chaining with `apply`.

---

## Module 3: Object-Oriented Kotlin

Kotlin makes OOP concise. Data classes, sealed classes, and delegation replace hundreds of lines of Java boilerplate. But Kotlin also gives you tools Java doesn't have — value classes for zero-overhead wrappers, sealed interfaces for flexible hierarchies, and enum classes with superpowers.

### Lesson 3.1: Classes, Properties, and Constructors

Kotlin classes are concise by default. The primary constructor is part of the class header, and properties can be declared directly in it. What takes 50 lines in Java often takes 5 in Kotlin.

```kotlin
// Primary constructor with properties
class User(
    val name: String,
    val email: String,
    var isActive: Boolean = true
)

// Secondary constructors
class ApiException : Exception {
    val code: Int

    constructor(code: Int, message: String) : super(message) {
        this.code = code
    }

    constructor(code: Int, message: String, cause: Throwable) : super(message, cause) {
        this.code = code
    }
}

// init blocks execute after primary constructor
class DatabaseConnection(url: String) {
    val driver: String
    val host: String

    init {
        require(url.startsWith("jdbc:")) { "Invalid JDBC URL: $url" }
        driver = url.substringBefore("://")
        host = url.substringAfter("://").substringBefore("/")
    }
}
```

**Properties under the hood** — Every `val` property generates a backing field and a getter. Every `var` generates a backing field, getter, and setter. You can customize these:

```kotlin
class Temperature(celsius: Double) {
    var celsius: Double = celsius
        set(value) {
            require(value >= -273.15) { "Below absolute zero" }
            field = value  // 'field' is the backing field identifier
        }

    val fahrenheit: Double
        get() = celsius * 9.0 / 5.0 + 32  // Computed property, no backing field
}
```

**`open` and inheritance** — Kotlin classes are `final` by default. You must explicitly mark a class as `open` to allow inheritance. This is the opposite of Java's default and prevents accidental inheritance hierarchies:

```kotlin
open class Shape(val color: String) {
    open fun area(): Double = 0.0
}

class Circle(color: String, val radius: Double) : Shape(color) {
    override fun area() = Math.PI * radius * radius
}
```

**Key takeaway:** Kotlin's concise class syntax eliminates boilerplate. Properties in the primary constructor, `init` blocks for validation, and `final` by default all push you toward better design. Use `open` only when inheritance is intentional.

### Lesson 3.2: Data Classes

Data classes are Kotlin's answer to Java's value objects. The compiler auto-generates `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions — roughly 100 lines of bytecode from a single declaration.

```kotlin
data class User(
    val id: Long,
    val name: String,
    val email: String,
    val createdAt: Instant = Instant.now()
)

// Auto-generated: equals(), hashCode(), toString(), copy(), componentN()
val user = User(1, "Mukul", "mukul@example.com")
val updated = user.copy(name = "Mukul Jangra")

// Destructuring
val (id, name, email) = user

// toString is useful for debugging
println(user) // User(id=1, name=Mukul, email=mukul@example.com, createdAt=...)
```

**What the compiler generates** — The `equals()` method compares all primary constructor properties. `hashCode()` combines their hashes. `toString()` prints them. `copy()` creates a new instance with some properties changed. `component1()` through `componentN()` enable destructuring. Properties declared in the class body are excluded from all of these.

**Common mistakes with data classes:**

```kotlin
// ❌ Mutable data classes — copy() shares references to mutable state
data class User(var name: String, var email: String)

// ✅ Immutable data classes — copy() is always safe
data class User(val name: String, val email: String)

// ❌ Properties in body — excluded from equals/hashCode/copy
data class CachedUser(val id: Long, val name: String) {
    var lastAccessed: Instant = Instant.now()  // NOT in equals()!
}

// Two CachedUser instances with same id and name but different
// lastAccessed times will be considered equal — often a bug
```

**When NOT to use data classes** — Don't use them for entities with identity semantics. A `User` should probably be equal based on `id` alone, not every field. Also, `copy()` is shallow — if your data class holds a `MutableList`, the original and the copy share the same list instance.

**Key takeaway:** Data classes are for holding data. Don't add business logic to them. Keep all properties `val` for true immutability. If you need identity-based equality, use a regular class with a custom `equals()`.

### Lesson 3.3: Sealed Classes and Sealed Interfaces

Sealed types restrict inheritance to a known set of subtypes. Combined with `when`, they create exhaustive type hierarchies that catch missing cases at compile time. This is one of Kotlin's most powerful modeling tools.

```kotlin
sealed interface Result<out T> {
    data class Success<T>(val data: T) : Result<T>
    data class Error(val exception: Throwable) : Result<Nothing>
    data object Loading : Result<Nothing>
}

// Exhaustive when — compiler ensures you handle every case
fun <T> handleResult(result: Result<T>) = when (result) {
    is Result.Success -> showData(result.data)
    is Result.Error -> showError(result.exception.message)
    Result.Loading -> showSpinner()
    // No else needed — all cases covered
}
```

**Sealed class vs sealed interface** — This distinction matters in practice. Sealed classes can have constructors, `init` blocks, and shared mutable state in the base class. Sealed interfaces can't — they're purely abstract contracts. But sealed interfaces allow multiple inheritance, which is the more common need:

```kotlin
sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>
    data class Error(val code: Int, val message: String) : NetworkResult<Nothing>
    data object Loading : NetworkResult<Nothing>
}

sealed interface Cacheable {
    val cacheKey: String
    val expiresAt: Long
}

// A type that participates in BOTH hierarchies
data class CachedSuccess<T>(
    val data: T,
    override val cacheKey: String,
    override val expiresAt: Long
) : NetworkResult<T>, Cacheable
```

This is impossible with sealed classes because Kotlin (like Java) only supports single class inheritance. Use `sealed interface` when subtypes need to extend other classes or implement multiple sealed hierarchies. Use `sealed class` only when you need shared constructor parameters or state.

**Why exhaustive `when` matters** — Imagine you add `RequiresVerification(val verificationUrl: String)` to `PaymentState`. With sealed classes, every `when` expression that matches on `PaymentState` immediately becomes a compile error. The compiler forces you to handle the new state everywhere. With an `else` branch, the new value silently falls into `else`, and you discover the bug when a user reports a blank screen.

**Key takeaway:** Sealed types + `when` = compile-time exhaustiveness. Adding a new subtype forces you to update every `when` expression. Prefer `sealed interface` over `sealed class` since Kotlin 1.5 unless you need shared state.

### Lesson 3.4: Enum Classes

Enums define a fixed set of constants. Unlike sealed classes, every enum value has the same structure. They're perfect for simple, uniform sets of options.

```kotlin
enum class Direction { NORTH, SOUTH, EAST, WEST }

// Enum with properties and methods
enum class LogLevel(val priority: Int) {
    DEBUG(0),
    INFO(1),
    WARN(2),
    ERROR(3);

    fun isAtLeast(level: LogLevel) = this.priority >= level.priority
}

// Enum with abstract method
enum class Operation {
    ADD {
        override fun apply(a: Double, b: Double) = a + b
    },
    SUBTRACT {
        override fun apply(a: Double, b: Double) = a - b
    },
    MULTIPLY {
        override fun apply(a: Double, b: Double) = a * b
    };

    abstract fun apply(a: Double, b: Double): Double
}

// Usage
val result = Operation.ADD.apply(3.0, 4.0)  // 7.0
```

**Enums vs sealed classes** — Use enums when your values are uniform (same structure, same data). Use sealed classes when each variant carries different data. The payment example makes this clear: `PaymentState.LOADING` carries no data, `PaymentState.SUCCESS` carries a transaction ID, and `PaymentState.FAILED` carries an error message. Different data per variant = sealed class.

**Key takeaway:** Enums are for fixed, uniform sets of constants. When variants need different data, upgrade to sealed classes.

### Lesson 3.5: Object Declarations and Companion Objects

`object` in Kotlin serves multiple roles: singletons, companion objects, and anonymous implementations.

```kotlin
// Singleton — thread-safe, lazily initialized
object Analytics {
    private val events = mutableListOf<String>()

    fun track(event: String) {
        events.add(event)
    }
}

// Companion object — factory pattern
class User private constructor(val name: String, val role: Role) {
    companion object {
        fun admin(name: String) = User(name, Role.ADMIN)
        fun guest() = User("Guest", Role.GUEST)

        // Can implement interfaces
        fun fromJson(json: String): User { /* ... */ }
    }
}

val admin = User.admin("Mukul")

// Anonymous object — replaces Java's anonymous inner class
val comparator = object : Comparator<User> {
    override fun compare(a: User, b: User): Int {
        return a.name.compareTo(b.name)
    }
}
```

**Under the hood**, `object` declarations compile to a class with a `private` constructor and a `public static final INSTANCE` field. Initialization is thread-safe because the JVM guarantees that static field initialization happens exactly once, synchronized by the class loader. The companion object compiles to a static inner class named `Companion` — which is why Java code accesses it as `User.Companion.admin("Mukul")` unless you add `@JvmStatic`.

**Key takeaway:** `object` creates a thread-safe singleton. Companion objects replace Java's static methods while being more powerful — they can implement interfaces and be extended.

### Lesson 3.6: Value Classes (Inline Classes)

Value classes wrap a single value with zero runtime overhead. At compile time, the wrapper enforces type safety. At runtime, the JVM uses the underlying primitive directly — no object allocation.

```kotlin
@JvmInline
value class UserId(val value: Long)

@JvmInline
value class Email(val value: String) {
    init {
        require(value.contains("@")) { "Invalid email: $value" }
    }

    fun domain(): String = value.substringAfter("@")
}

// Type safety at compile time
fun findUser(id: UserId): User? { /* ... */ }
fun sendEmail(to: Email, subject: String) { /* ... */ }

// These are different types — can't mix them up
val userId = UserId(123L)
val orderId = OrderId(123L)
// findUser(orderId)  // ❌ Compile error — wrong type
```

**Under the hood**, the Kotlin compiler replaces `UserId` with `Long` wherever possible. `findUser(UserId(123L))` compiles to `findUser(123L)` at the bytecode level. No wrapper object is created. Boxing only happens when the value class is used as a generic type parameter or cast to an interface it implements. This makes value classes ideal for domain primitives like IDs, currency amounts, and coordinates — you get type safety without any memory overhead.

**Common mistake:** Adding too many methods to value classes. They're meant for lightweight wrappers. If you need complex behavior, use a regular `data class`. Value classes can have `init` blocks and functions, but they can only wrap a single property.

**Key takeaway:** Value classes provide type-safe wrappers around single values with zero runtime overhead. Use them for domain primitives like IDs, amounts, and coordinates to prevent parameter-swapping bugs.

### Lesson 3.7: Delegation (by keyword)

Kotlin's delegation eliminates boilerplate for implementing interfaces by forwarding to another object. The compiler generates the forwarding code at compile time — zero runtime overhead compared to writing it by hand.

```kotlin
// Class delegation
interface AnalyticsTracker {
    fun trackEvent(name: String, properties: Map<String, Any>)
    fun trackScreen(screenName: String)
    fun setUserId(userId: String)
    fun reset()
}

class LoggingAnalyticsTracker(
    private val delegate: AnalyticsTracker
) : AnalyticsTracker by delegate {
    override fun trackEvent(name: String, properties: Map<String, Any>) {
        Log.d("Analytics", "Event: $name, props: $properties")
        delegate.trackEvent(name, properties)
    }
    // trackScreen, setUserId, reset — all auto-forwarded
}

// Property delegation
class UserPreferences(private val prefs: SharedPreferences) {
    var username: String by prefs.string("username", "")
    var darkMode: Boolean by prefs.boolean("dark_mode", false)
}
```

**Class delegation** generates forwarding implementations for every interface method. You only override the ones you want to customize. If `AnalyticsTracker` has 15 methods and you only care about intercepting `trackEvent`, you write one override instead of fifteen forwarding functions. When someone adds a new method to the interface, the compiler automatically forwards it.

**Property delegation** uses the `by` keyword with `ReadOnlyProperty` or `ReadWriteProperty`. The standard library includes `lazy`, `observable`, `vetoable`, and map-backed delegates. Writing custom delegates extracts cross-cutting concerns like persistence, validation, or logging into reusable components:

```kotlin
// by lazy — thread-safe deferred initialization
val heavyObject by lazy { ExpensiveComputation() }

// by Delegates.observable — react to changes
var theme: String by Delegates.observable("light") { _, old, new ->
    println("Theme changed: $old -> $new")
}

// by Delegates.vetoable — reject invalid changes
var email: String by Delegates.vetoable("") { _, _, new ->
    new.contains("@")  // Reject if no @ symbol
}
```

**Key takeaway:** Delegation follows the composition-over-inheritance principle. Class delegation generates forwarding code. Property delegation extracts repeated patterns into reusable components. Both eliminate boilerplate.

### Quiz: Object-Oriented Kotlin

#### What methods does the compiler auto-generate for a `data class`?

- ❌ Only `toString()` and `equals()`
- ❌ `toString()`, `equals()`, `hashCode()`, and `clone()`
- ✅ `toString()`, `equals()`, `hashCode()`, `copy()`, and `componentN()` functions
- ❌ `toString()`, `equals()`, `hashCode()`, `copy()`, and `serialize()`

> **Explanation:** Data classes automatically generate `equals()` (compares all primary constructor properties), `hashCode()`, `toString()`, `copy()` (with default parameter values), and `componentN()` functions for destructuring. Properties declared in the class body are excluded from all generated methods.

#### When should you prefer `sealed interface` over `sealed class`?

- ❌ When you need shared constructor parameters across subtypes
- ✅ When subtypes need to extend other classes, since a class can implement multiple interfaces but extend only one class
- ❌ When you have more than 5 subtypes
- ❌ When you need the sealed type to be serializable

> **Explanation:** Since Kotlin 1.5, `sealed interface` is preferred because it allows subtypes to extend other classes and implement multiple sealed hierarchies simultaneously. `sealed class` is only needed when you want shared state or constructor parameters in the base type.

#### What does `@JvmInline value class` provide?

- ❌ A class that runs on a separate thread for performance
- ❌ A class that uses reflection to avoid memory allocation
- ✅ A type-safe wrapper around a single value that is eliminated at runtime, using the underlying primitive directly
- ❌ A class that is automatically cached by the JVM

> **Explanation:** Value classes wrap a single value and provide type safety at compile time. At runtime, the wrapper is eliminated and the underlying type is used directly, resulting in zero memory overhead. This makes them ideal for domain primitives like IDs and amounts.

### Coding Challenge: Sealed Result Handler

Create a sealed interface `NetworkResult<out T>` with three states: `Success`, `Error`, and `Loading`. Then write a `map` extension function that transforms the `Success` data while preserving `Error` and `Loading` states unchanged.

#### Solution

```kotlin
sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>
    data class Error(val message: String, val code: Int) : NetworkResult<Nothing>
    data object Loading : NetworkResult<Nothing>
}

fun <T, R> NetworkResult<T>.map(transform: (T) -> R): NetworkResult<R> = when (this) {
    is NetworkResult.Success -> NetworkResult.Success(transform(data))
    is NetworkResult.Error -> this    // Nothing is subtype of R
    NetworkResult.Loading -> NetworkResult.Loading
}

data class UserDto(val name: String, val email: String)
data class User(val displayName: String)

fun main() {
    val raw: NetworkResult<UserDto> = NetworkResult.Success(UserDto("Mukul", "m@x.com"))
    val mapped: NetworkResult<User> = raw.map { dto -> User(dto.name) }
    println(mapped) // Success(data=User(displayName=Mukul))

    val error: NetworkResult<UserDto> = NetworkResult.Error("Not found", 404)
    val mappedError: NetworkResult<User> = error.map { User(it.name) }
    println(mappedError) // Error(message=Not found, code=404)
}
```

The `out` variance on `T` allows `NetworkResult<Nothing>` (used by `Error` and `Loading`) to be a subtype of any `NetworkResult<T>`. The exhaustive `when` ensures all cases are handled, and the `map` function mirrors how monadic transformations work in functional programming.

---

## Module 4: Collections and Functional Operations

Kotlin's collection API is one of the best in any language. It transforms how you think about data manipulation — from imperative loops to declarative chains. This module covers the operations you'll use daily and the performance characteristics you need to understand.

### Lesson 4.1: Immutable vs Mutable Collections

Kotlin separates read-only and mutable collections at the type level. `List<T>` has no `add()` method. `MutableList<T>` does. This distinction is enforced at compile time and prevents accidental mutation across API boundaries.

```kotlin
// Read-only (default)
val names: List<String> = listOf("Alice", "Bob", "Charlie")
// names.add("Dave")  // ❌ No add method on List

// Mutable
val mutableNames: MutableList<String> = mutableListOf("Alice", "Bob")
mutableNames.add("Charlie")  // ✅

// buildList — create immutable from mutable builder
val users = buildList {
    add(User("Alice"))
    add(User("Bob"))
    if (includeAdmin) add(User.admin("Admin"))
}
```

**Under the hood**, `listOf()` returns `java.util.Collections.unmodifiableList()` on the JVM. `mutableListOf()` returns `java.util.ArrayList`. The `List` interface is genuinely read-only — even through reflection or casting, attempting to modify it throws `UnsupportedOperationException`. But here's the nuance: `List<T>` guarantees that *you* can't modify it through that reference. If someone else holds a `MutableList` reference to the same underlying list, they can modify it. For true immutability guarantees, use persistent data structures or `toList()` to create a copy.

**`buildList`, `buildMap`, `buildSet`** — These are the idiomatic way to construct collections when you need conditional or loop-based logic during creation. Inside the lambda, you have a mutable builder. The return value is an immutable collection:

```kotlin
val config = buildMap {
    put("host", "localhost")
    put("port", "5432")
    if (isProduction) {
        put("ssl", "true")
        put("pool_size", "20")
    }
}
```

**Common mistake:** Exposing `MutableList` from a class. Always expose `List` from your public API. Internal mutation is fine, but callers should only see the read-only interface:

```kotlin
class UserRepository {
    private val _users = mutableListOf<User>()
    val users: List<User> get() = _users  // Exposed as read-only
}
```

**Key takeaway:** Always default to read-only collections. Use `buildList`/`buildMap`/`buildSet` when you need mutable construction but immutable result. Never expose `MutableList` in your public API.

### Lesson 4.2: Transformation Operations

Kotlin's transformation functions replace most `for` loops with declarative, chainable operations. The key ones are `map`, `filter`, `flatMap`, `groupBy`, and `associate`.

```kotlin
data class Order(val userId: Long, val amount: Double, val status: String)

val orders = listOf(
    Order(1, 99.99, "completed"),
    Order(2, 149.50, "pending"),
    Order(1, 29.99, "completed"),
    Order(3, 199.99, "completed")
)

// map — transform each element
val amounts = orders.map { it.amount }

// filter — keep elements matching condition
val completed = orders.filter { it.status == "completed" }

// groupBy — group elements by key
val byUser = orders.groupBy { it.userId }
// {1=[Order(1,99.99,completed), Order(1,29.99,completed)], 2=[...], 3=[...]}

// associate — create a map from elements
val amountById = orders.associate { it.userId to it.amount }

// flatMap — flatten nested collections
val allTags = posts.flatMap { it.tags }

// mapNotNull — transform and filter nulls in one step
val validEmails = inputs.mapNotNull { it.toEmailOrNull() }
```

**Chaining operations** — The real power is in composing these operations. Each operation returns a new collection, so they chain naturally:

```kotlin
val topSpenders = orders
    .filter { it.status == "completed" }
    .groupBy { it.userId }
    .mapValues { (_, userOrders) -> userOrders.sumOf { it.amount } }
    .entries
    .sortedByDescending { it.value }
    .take(5)
```

**Under the hood**, each chained operation creates an intermediate `List`. For `filter { }.map { }.take(3)` on a list of 10,000 elements, you create a filtered list (maybe 5,000 elements), then a mapped list (5,000 elements), then take 3. The intermediate lists are garbage. For small collections, this is fine. For large collections, use sequences (next lesson).

**Key takeaway:** Chain operations for readability, but know that each step creates an intermediate collection. For large data sets with multiple transformations, switch to sequences.

### Lesson 4.3: Sequences for Lazy Evaluation

Sequences process elements lazily — one element at a time through the entire chain, creating no intermediate collections. They're Kotlin's answer to Java 8 Streams.

```kotlin
// Without sequences — creates 3 intermediate lists
val result = (1..1_000_000)
    .filter { it % 2 == 0 }    // List of 500,000
    .map { it * 2 }             // Another list of 500,000
    .take(10)                   // Final list of 10

// With sequences — processes lazily, no intermediate lists
val lazyResult = (1..1_000_000)
    .asSequence()
    .filter { it % 2 == 0 }
    .map { it * 2 }
    .take(10)
    .toList()  // Terminal operation triggers evaluation
```

The sequence version processes elements one at a time: take element 1, check filter, skip. Take element 2, passes filter, apply map, add to result. Continue until we have 10 results. It never even looks at elements beyond what's needed. This is dramatically more efficient when you have a large source and an early termination like `take()`, `first()`, or `find()`.

**Terminal vs intermediate operations** — Sequence operations are either intermediate (return another sequence) or terminal (trigger evaluation). `filter`, `map`, `flatMap` are intermediate — they build a chain of lazy transformations. `toList()`, `first()`, `count()`, `forEach()` are terminal — they execute the chain. Nothing happens until a terminal operation is called.

**When to use sequences vs regular collections:**

- **Small collections (< 100 elements):** Regular collection operations. The overhead of sequence machinery isn't worth it.
- **Large collections with multiple chained operations:** Sequences. Avoid intermediate allocations.
- **Operations with early termination (`first`, `take`, `find`):** Sequences. They stop processing once the result is found.
- **Single operation:** Regular collections. No intermediate list problem with one operation.

**Common mistake:** Calling `toList()` between sequence operations. This defeats the purpose by materializing an intermediate list:

```kotlin
// ❌ Defeats lazy evaluation
val result = items.asSequence()
    .filter { it.isValid() }
    .toList()  // Materializes here!
    .asSequence()
    .map { it.transform() }
    .toList()
```

**Key takeaway:** Sequences process elements one at a time through the entire chain, avoiding intermediate collection allocations. Use them for large data sets with multiple transformations or early termination operations.

### Lesson 4.4: Practical Collection Patterns

Beyond the basics, Kotlin provides specialized operations for common data manipulation patterns. These replace dozens of lines of manual loop code with single, descriptive function calls.

```kotlin
// partition — split into two lists by predicate
val (active, inactive) = users.partition { it.isActive }

// zip — combine two lists element-wise
val pairs = names.zip(scores) { name, score -> "$name: $score" }

// fold/reduce — accumulate a result
val total = orders.fold(0.0) { acc, order -> acc + order.amount }
val product = numbers.reduce { acc, num -> acc * num }

// distinct and distinctBy
val uniqueEmails = users.distinctBy { it.email }

// chunked — break into fixed-size groups
val batches = items.chunked(50)  // List<List<Item>>, each inner list has up to 50

// windowed — sliding window
val movingAvg = prices.windowed(7) { window -> window.average() }

// scan — like fold but returns all intermediate results
val runningTotal = amounts.scan(0.0) { acc, amount -> acc + amount }
```

**`groupBy` + `mapValues`** — This combination is how you transform flat API responses into UI-ready structures. Group by a key, then transform each group:

```kotlin
// Transform flat transactions into grouped-by-date display format
val grouped = transactions
    .groupBy { it.date.toLocalDate() }
    .mapValues { (_, dayTransactions) ->
        DayGroup(
            total = dayTransactions.sumOf { it.amount },
            transactions = dayTransactions.sortedByDescending { it.timestamp }
        )
    }
    .toSortedMap(compareByDescending { it })
```

**`associate` vs `groupBy`** — `associate` creates a `Map` with one value per key (last writer wins if duplicates). `groupBy` creates a `Map<K, List<V>>` with all values per key. Know which one you need.

**Key takeaway:** Kotlin's collection API covers almost every data manipulation you'll need. Before writing a `for` loop, check if there's a collection function for it. `partition`, `chunked`, `windowed`, and `scan` are underrated tools.

### Lesson 4.5: Map Operations

Maps are central to Kotlin programming — configuration, caching, grouping, and lookup patterns all rely on them. Kotlin provides both read-only `Map` and `MutableMap`, plus powerful transformation operations.

```kotlin
// Creating maps
val config = mapOf("host" to "localhost", "port" to "5432")
val mutable = mutableMapOf<String, Int>()

// getOrDefault / getOrElse
val port = config.getOrDefault("port", "3000")
val timeout = config.getOrElse("timeout") { calculateDefault() }

// getOrPut — for caches
val cache = mutableMapOf<String, User>()
fun getUser(id: String): User = cache.getOrPut(id) {
    fetchUserFromNetwork(id)  // Only called if key is absent
}

// filterKeys / filterValues
val activeUsers = userMap.filterValues { it.isActive }
val adminKeys = userMap.filterKeys { it.startsWith("admin_") }

// mapKeys / mapValues
val uppercased = config.mapKeys { (key, _) -> key.uppercase() }
val doubled = scores.mapValues { (_, value) -> value * 2 }

// merge — combine two maps
val combined = map1 + map2  // map2 values override map1 on key conflicts
```

**Key takeaway:** Maps have a rich API beyond simple get/put. `getOrPut` is essential for caching patterns. `filterValues`/`filterKeys` and `mapValues`/`mapKeys` transform maps without manual iteration.

### Lesson 4.6: Collection Performance Considerations

Not all collection operations have the same performance characteristics. Understanding the underlying data structures helps you make better choices.

```kotlin
// ArrayList (default for mutableListOf): O(1) random access, O(n) insert/remove at middle
// LinkedList: O(1) insert/remove at ends, O(n) random access
// HashSet: O(1) contains/add/remove (average)
// TreeSet: O(log n) contains/add/remove, sorted iteration

// Use the right collection for the job
val frequentLookups: Set<String> = hashSetOf("a", "b", "c")  // O(1) contains
val sortedData: Set<String> = sortedSetOf("c", "a", "b")     // Sorted iteration

// sumOf is more efficient than map + sum
val total = orders.sumOf { it.amount }  // Single pass
// vs
val total = orders.map { it.amount }.sum()  // Two passes, intermediate list
```

**`any`, `none`, `all`** — These short-circuit, meaning they stop as soon as the result is determined. Use them instead of `filter { }.isNotEmpty()` or `filter { }.isEmpty()`:

```kotlin
// ❌ Processes entire list, creates intermediate list
val hasActiveUsers = users.filter { it.isActive }.isNotEmpty()

// ✅ Stops at first active user
val hasActiveUsers = users.any { it.isActive }
```

**`first` vs `find`** — `first { }` throws if no match. `find { }` returns null. Prefer `find` unless you can guarantee a match exists. Same principle: `firstOrNull()` is safer than `first()`.

**Key takeaway:** Choose the right collection type for your access pattern. Use short-circuiting operations like `any`, `none`, `all` instead of `filter` + size checks. Prefer `sumOf` over `map` + `sum` for single-pass efficiency.

### Quiz: Collections and Functional Operations

#### What is the key difference between regular collection operations and Sequence operations?

- ❌ Sequences can only be used with primitive types
- ❌ Regular operations are lazy while Sequences are eager
- ✅ Sequences process elements lazily one at a time through the chain, avoiding intermediate collection allocations
- ❌ Sequences are thread-safe while regular operations are not

> **Explanation:** Regular collection chains (like `list.filter{}.map{}`) create a new intermediate list at each step. Sequences evaluate lazily — each element passes through the entire chain before the next one is processed, creating no intermediate collections.

#### What does `partition` return?

- ❌ A single list with elements reordered by the predicate
- ❌ A Map grouping elements by the predicate result
- ✅ A Pair of two Lists — the first containing elements matching the predicate, the second containing those that don't
- ❌ An iterator that yields matching elements first, then non-matching

> **Explanation:** `partition` splits a collection into two lists based on a predicate and returns them as a `Pair<List<T>, List<T>>`. Destructuring (`val (match, noMatch) = list.partition { ... }`) makes it clean to use.

#### When should you prefer `buildList` over `mutableListOf`?

- ❌ When the list will contain more than 100 elements
- ❌ When thread safety is required
- ✅ When you need mutable construction but want the final result to be an immutable List
- ❌ When the list elements are nullable

> **Explanation:** `buildList` gives you a `MutableList` inside its lambda for construction, but returns a read-only `List`. This is ideal when you need conditional logic during creation but want to expose an immutable collection afterward.

### Coding Challenge: Order Analytics

Given a list of orders, write a function `analyzeOrders` that returns an `OrderReport` containing:

- Total revenue from completed orders
- Number of unique customers
- The top 3 customers by total spend (as a list of `CustomerSpend` with `userId` and `total`)
- Average order value across all completed orders

#### Solution

```kotlin
data class Order(val userId: Long, val amount: Double, val status: String)
data class CustomerSpend(val userId: Long, val total: Double)
data class OrderReport(
    val totalRevenue: Double,
    val uniqueCustomers: Int,
    val topSpenders: List<CustomerSpend>,
    val averageOrderValue: Double
)

fun analyzeOrders(orders: List<Order>): OrderReport {
    val completed = orders.filter { it.status == "completed" }
    val totalRevenue = completed.sumOf { it.amount }
    val uniqueCustomers = orders.map { it.userId }.distinct().size
    val topSpenders = completed
        .groupBy { it.userId }
        .map { (userId, userOrders) -> CustomerSpend(userId, userOrders.sumOf { it.amount }) }
        .sortedByDescending { it.total }
        .take(3)
    val averageOrderValue = if (completed.isNotEmpty()) totalRevenue / completed.size else 0.0

    return OrderReport(totalRevenue, uniqueCustomers, topSpenders, averageOrderValue)
}
```

This solution chains `filter`, `sumOf`, `groupBy`, `map`, `sortedByDescending`, and `take` — demonstrating practical use of Kotlin's collection API for real-world data analysis without a single `for` loop.

---

## Module 5: Generics

Generics in Kotlin go beyond Java's. Understanding variance (`in`, `out`), type erasure, reified types, and star projection unlocks powerful, type-safe APIs. Everything interesting about Kotlin generics exists either to work within the JVM's type erasure constraint or to work around it.

### Lesson 5.1: Basic Generics and Type Constraints

Generics let you write code that works with any type while maintaining compile-time type safety. Without generics, you'd use `Any` with manual casts everywhere — which compiles fine but crashes at runtime with `ClassCastException`.

```kotlin
// Generic class
class Repository<T>(private val dataSource: DataSource<T>) {
    fun getById(id: Long): T? = dataSource.findById(id)
    fun getAll(): List<T> = dataSource.findAll()
}

// Generic function
fun <T> List<T>.secondOrNull(): T? =
    if (size >= 2) this[1] else null

// Type constraint — T must implement Comparable
fun <T : Comparable<T>> List<T>.findMax(): T? {
    if (isEmpty()) return null
    var max = this[0]
    for (item in this) {
        if (item > max) max = item
    }
    return max
}

// Multiple constraints with where
fun <T> ensureValid(item: T) where T : Serializable, T : Comparable<T> {
    // T must be both Serializable and Comparable
}
```

**Type constraints** restrict which types can be used as type arguments. The upper bound `T : Comparable<T>` means only types that implement `Comparable` can be used. Without the constraint, you couldn't use comparison operators inside the function. The `where` clause allows multiple constraints — useful when building repository layers that need entities to be both persistable and identifiable.

**Under the hood**, the JVM erases generic type information at runtime. A `List<String>` and a `List<Int>` compile to the same bytecode — both become `List` with `Object` references internally. This is called **type erasure**. The compiler verifies all type relationships at compile time and then throws away the type parameters:

```kotlin
fun <T> isInstanceOf(value: Any): Boolean {
    // COMPILE ERROR: Cannot check for instance of erased type: T
    return value is T
}
```

This fails because `T` doesn't exist at runtime. Every interesting feature of Kotlin generics — `reified`, variance annotations, star projection — exists because of this constraint.

**Key takeaway:** Type constraints ensure generic code only accepts types with the capabilities you need. Use `where` for multiple constraints. Type erasure means generic types don't exist at runtime — Kotlin provides workarounds.

### Lesson 5.2: Variance — Covariance and Contravariance

Variance answers a deceptively simple question: if `Dog` is a subtype of `Animal`, is `List<Dog>` a subtype of `List<Animal>`? The answer depends entirely on what operations the generic type supports.

If `List<Animal>` lets you add elements, someone could add a `Cat` to your `List<Dog>` through the `List<Animal>` reference. That's a type safety violation. So the relationship depends on whether the type only produces values, only consumes values, or does both.

Java developers know this rule as **PECS — Producer Extends, Consumer Super**. In Kotlin, the same concept is cleaner: **Producer `out`, Consumer `in`**. The keywords literally describe what `T` does — it goes **out** of the class (return types) or comes **in** to the class (parameters).

```kotlin
// Covariant: only produces T values (out = read-only)
interface EventProducer<out T> {
    fun getLatest(): T
    fun getAll(): List<T>
    // fun add(item: T) — COMPILE ERROR: T is declared as 'out'
}

// Contravariant: only consumes T values (in = write-only)
interface EventConsumer<in T> {
    fun process(event: T)
    fun processAll(events: List<T>)
    // fun getLatest(): T — COMPILE ERROR: T is declared as 'in'
}

// Invariant: both produces and consumes T
interface EventStore<T> {
    fun get(): T
    fun set(value: T)
}
```

**Covariance (`out`)** — `Producer<out Dog>` is safely a `Producer<Animal>` because you're only ever getting values out, and a `Dog` is always a valid `Animal`. Think of a read-only repository — it hands you data, never takes it. Kotlin's `List<out E>` is covariant, which is why `List<String>` can be assigned to `List<Any>`.

**Contravariance (`in`)** — `Consumer<in Animal>` is safely a `Consumer<Dog>` because if it can handle any `Animal`, it can certainly handle a `Dog`. Think of a comparator — `Comparator<Animal>` can compare dogs just fine. Kotlin's `Comparable<in T>` is contravariant.

```kotlin
val dogProducer: EventProducer<Dog> = DogFactory()
val animalProducer: EventProducer<Animal> = dogProducer  // ✅ Covariant

val animalConsumer: EventConsumer<Animal> = AnimalProcessor()
val dogConsumer: EventConsumer<Dog> = animalConsumer  // ✅ Contravariant
```

**Key takeaway:** `out` means "I only give you T" (covariant, safe for reading). `in` means "I only take T from you" (contravariant, safe for writing). If you need both, the type is invariant and you lose the subtyping flexibility.

### Lesson 5.3: Declaration-Site vs Use-Site Variance

**Declaration-site variance** is when you put `in` or `out` on the class or interface definition itself. You do this when you own the class and know it will always be a producer or always be a consumer. Kotlin's `List<out E>` is declaration-site — the Kotlin team knew `List` would never have add methods, so they declared it covariant once. Every use of `List` automatically gets the subtyping benefit.

This is one of the areas where Kotlin genuinely improves on Java. Java has no declaration-site variance — you have to use `? extends E` wildcards every single time at the call site.

**Use-site variance** is for when you're working with a type you didn't write, or one that's invariant for good reasons (it both reads and writes). You apply variance at a specific call site:

```kotlin
// EventStore<T> is invariant — it has both get() and set()
// But at this call site, we only need specific capabilities
fun <T> copyEvents(
    source: EventStore<out T>,  // I'll only read from source
    target: EventStore<in T>    // I'll only write to target
) {
    val event = source.get()
    target.set(event)
    // source.set(event)  // ❌ Compile error — out projection
    // target.get()       // ❌ Compile error — in projection
}
```

`out` at the use site says "I promise to only read from this." `in` says "I promise to only write to this." The compiler enforces the promise. This is Kotlin's equivalent of Java's `? extends T` and `? super T` wildcards, but with names that actually make sense.

**Rule of thumb:** If you control the class and it's purely a producer or consumer, use declaration-site. If you don't control the class or it's invariant but you only need one direction at a particular call site, use use-site.

**Key takeaway:** Declaration-site variance declares the variance once on the class definition. Use-site variance applies it at specific call sites. Kotlin's approach is cleaner than Java's wildcards because `out` and `in` describe what `T` does.

### Lesson 5.4: Star Projection and the Nothing Type

**Star projection** (`*`) is the extreme version of use-site variance — you're projecting away all type information entirely. `MutableList<*>` means "a mutable list of some specific type that I don't know."

```kotlin
// Star projection — unknown type
fun printListSize(list: List<*>) {
    println("Size: ${list.size}")
    // Elements come out as Any?
    val first: Any? = list.firstOrNull()
}

// Behavior depends on original variance:
// For out types: List<*> → List<out Any?> (full read access)
// For in types: Comparable<*> → Comparable<in Nothing> (can't call consuming methods)
// For invariant types: reads return Any?, writes are blocked
```

Star projection is most useful in reflection-heavy code, DI containers, and cases where you just need metadata about a generic object — checking its size, logging its class, passing it through without caring about the type argument.

**The `Nothing` type** is Kotlin's bottom type — a type with no instances. It's a subtype of every other type, which makes it surprisingly powerful in generics:

```kotlin
// emptyList returns List<Nothing>, assignable to any List<T>
val strings: List<String> = emptyList()
val users: List<User> = emptyList()

// Nothing is the natural type for sealed hierarchies that represent failure
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Throwable) : Result<Nothing>()
}

// Error doesn't carry a T, so Nothing lets it fit any Result<T>
fun fetchUser(): Result<User> {
    return try {
        Result.Success(api.getUser())
    } catch (e: Exception) {
        Result.Error(e)  // Result<Nothing> is a valid Result<User>
    }
}
```

**`Nothing` vs `Unit` vs `Any`** — `Any` is the root of the type hierarchy (everything is `Any`). `Unit` means "returns nothing useful" (like Java's `void`). `Nothing` means "never returns" — a function with return type `Nothing` always throws an exception or loops forever. `Nothing` has no instances, which is why it's the bottom type.

**Key takeaway:** Star projection (`*`) means "I don't know or care about the type argument." `Nothing` is the bottom type that makes `emptyList()` work everywhere and lets `Error` states fit any `Result<T>`.

### Lesson 5.5: Reified Type Parameters

Normally, generic types are erased at runtime. `reified` preserves the type information — but only works with `inline` functions. The compiler inlines the function body at every call site, substituting the actual type argument into the bytecode.

```kotlin
// Without reified — need to pass Class explicitly
fun <T> parseJson(json: String, clazz: Class<T>): T {
    return gson.fromJson(json, clazz)
}
val user = parseJson(jsonString, User::class.java)

// With reified — type available at runtime
inline fun <reified T> parseJson(json: String): T {
    return gson.fromJson(json, T::class.java)
}
val user = parseJson<User>(jsonString)

// Practical: type-safe SharedPreferences
inline fun <reified T> SharedPreferences.get(key: String, default: T): T {
    return when (T::class) {
        String::class -> getString(key, default as String) as T
        Int::class -> getInt(key, default as Int) as T
        Boolean::class -> getBoolean(key, default as Boolean) as T
        Long::class -> getLong(key, default as Long) as T
        Float::class -> getFloat(key, default as Float) as T
        else -> throw IllegalArgumentException("Unsupported type: ${T::class}")
    }
}

val username = prefs.get<String>("username", "")
val darkMode = prefs.get<Boolean>("dark_mode", false)
```

**Why `inline` is required** — `reified` only works with `inline` functions because that's how the compiler gets access to the actual type argument. It copies the function body into the caller, substituting the real type. At the call site, `T::class` becomes `User::class` — the type information is baked into the bytecode.

**Android use cases** — Reified types are used extensively in Jetpack: `by viewModels()`, Intent extras like `intent.getParcelableExtra<User>("user")`, `Bundle.getParcelableCompat<T>()`, and navigation argument parsing.

**Limitations** — Reified only works on `inline` functions. You can't have a reified type parameter on a class, a non-inline function, or a virtual function. If you need a type reference that persists beyond the function call, you're back to `KClass<T>`.

**Key takeaway:** `reified` eliminates the `Class<T>` parameter pattern. It only works with `inline` functions because the function body is copied to the call site, where the actual type is known. This is the JVM's escape hatch from type erasure.

### Lesson 5.6: Advanced Generic Patterns

Real-world generics often require combining multiple features — constraints, variance, and reified types — into practical patterns.

**Self-bounded types** (Curiously Recurring Template Pattern):

```kotlin
abstract class TypedEvent<T : TypedEvent<T>> {
    abstract fun accept(handler: EventHandler<T>)
}

interface EventHandler<T : TypedEvent<T>> {
    fun handle(event: T)
}

class PaymentCompleted(
    val orderId: String,
    val amount: Double
) : TypedEvent<PaymentCompleted>() {
    override fun accept(handler: EventHandler<PaymentCompleted>) {
        handler.handle(this)
    }
}
```

The recursive bound `T : TypedEvent<T>` ensures each event type's `accept` method takes a handler typed to itself. This gives compile-time type safety across the entire dispatch system without any casts.

**Generic factory pattern:**

```kotlin
inline fun <reified T : ViewModel> Fragment.viewModel(
    noinline factory: () -> T
): Lazy<T> = lazy {
    ViewModelProvider(this, object : ViewModelProvider.Factory {
        override fun <V : ViewModel> create(modelClass: Class<V>): V {
            @Suppress("UNCHECKED_CAST")
            return factory() as V
        }
    })[T::class.java]
}

// Usage — type is inferred from the lambda return type
private val viewModel by viewModel { SearchViewModel(repository) }
```

**Type-safe heterogeneous container:**

```kotlin
class TypedMap {
    private val map = mutableMapOf<KClass<*>, Any>()

    fun <T : Any> put(key: KClass<T>, value: T) {
        map[key] = value
    }

    @Suppress("UNCHECKED_CAST")
    fun <T : Any> get(key: KClass<T>): T? = map[key] as? T
}

inline fun <reified T : Any> TypedMap.put(value: T) = put(T::class, value)
inline fun <reified T : Any> TypedMap.get(): T? = get(T::class)
```

**Key takeaway:** Advanced generic patterns combine constraints, variance, and reified types for powerful, type-safe APIs. Self-bounded types give compile-time safety for dispatch systems. Reified factory patterns eliminate `Class<T>` boilerplate.

### Quiz: Generics

#### What does the `out` keyword mean when applied to a generic type parameter?

- ❌ The type parameter can only be used as an input (function parameter)
- ✅ The type parameter can only be used as an output (return type), making the type covariant
- ❌ The type parameter is erased at runtime
- ❌ The type parameter must be a subclass of Any

> **Explanation:** `out` declares a type parameter as covariant — it can only appear in "out" positions (return types). This allows `List<String>` to be treated as `List<Any>` because if a container only produces `String`, it's safe to treat those as `Any`.

#### Why must `reified` type parameters be used with `inline` functions?

- ❌ Because `inline` functions run faster than regular functions
- ❌ Because only `inline` functions can accept generic parameters
- ✅ Because `inline` copies the function body to the call site where the actual type is known, preserving type information that would otherwise be erased
- ❌ Because `reified` types require compile-time constant expressions

> **Explanation:** Generic types are normally erased at runtime (type erasure). Since `inline` functions are copied to the call site during compilation, the compiler can substitute the actual type for the reified parameter, preserving the type information at runtime.

#### What is the difference between declaration-site and use-site variance?

- ❌ Declaration-site is for classes, use-site is for functions
- ✅ Declaration-site puts `in`/`out` on the class definition (applies everywhere), use-site applies it at a specific call site for invariant types
- ❌ Declaration-site is checked at compile time, use-site is checked at runtime
- ❌ There is no practical difference, they're interchangeable

> **Explanation:** Declaration-site variance is applied once on the class/interface definition and affects all uses. Use-site variance is applied at a specific call site to restrict how an invariant type is used at that point — for example, `EventStore<out T>` restricts the store to read-only at that location.

### Coding Challenge: Type-Safe Container

Create a generic `TypedRegistry` that stores and retrieves items by their class type using reified type parameters. It should:

- Store items of any type, keyed by their `KClass`
- Provide a reified `register` function to store an item
- Provide a reified `resolve` function that returns the item or null
- Ensure type safety at compile time

#### Solution

```kotlin
class TypedRegistry {
    private val map = mutableMapOf<kotlin.reflect.KClass<*>, Any>()

    inline fun <reified T : Any> register(instance: T) {
        map[T::class] = instance
    }

    inline fun <reified T : Any> resolve(): T? {
        return map[T::class] as? T
    }
}

fun main() {
    val registry = TypedRegistry()
    registry.register("Hello, Kotlin!")
    registry.register(42)
    registry.register(listOf("a", "b", "c"))

    val text: String? = registry.resolve<String>()       // "Hello, Kotlin!"
    val number: Int? = registry.resolve<Int>()            // 42
    val missing: Double? = registry.resolve<Double>()     // null

    println(text)    // Hello, Kotlin!
    println(number)  // 42
    println(missing) // null
}
```

This solution uses `reified` type parameters to avoid passing `Class<T>` explicitly. The `KClass` serves as a type-safe key, and the `as? T` safe cast ensures type safety on retrieval.

---

## Module 6: Inline Functions, SAM Interfaces, and Contracts

This module covers the patterns that make Kotlin efficient at runtime and expressive at the API level. Inline functions eliminate lambda allocation overhead. SAM interfaces enable clean callback APIs. Contracts teach the compiler facts it can't infer on its own.

### Lesson 6.1: Functional Interfaces (SAM Conversion)

SAM stands for Single Abstract Method. A `fun interface` in Kotlin declares an interface with exactly one abstract method, enabling lambda expressions as implementations. This is what makes Android's callback APIs clean in Kotlin.

```kotlin
fun interface Mapper<I, O> {
    fun map(input: I): O
}

// Usage with lambda — SAM conversion
val userMapper = Mapper<UserEntity, User> { entity ->
    User(entity.name, entity.email)
}

// Java interop — SAM conversion for Java interfaces
button.setOnClickListener { view ->
    handleClick(view)
}

// Without fun interface, this would require:
button.setOnClickListener(object : View.OnClickListener {
    override fun onClick(v: View) {
        handleClick(v)
    }
})
```

**`fun interface` vs regular interface** — The `fun` keyword enables SAM conversion, meaning the interface can be instantiated with a lambda expression. Regular interfaces cannot:

```kotlin
fun interface IntPredicate {
    fun test(value: Int): Boolean
}

val isEven = IntPredicate { it % 2 == 0 }  // ✅ SAM conversion
isEven.test(4)  // true

// Regular interface — no SAM conversion
interface Validator {
    fun validate(input: String): Boolean
}
// val v = Validator { it.isNotBlank() }  // ❌ Compile error
```

**When to use `fun interface` vs function types** — Use `fun interface` when you want a named, self-documenting type that communicates intent beyond just the signature. A `Mapper<UserDto, User>` is more descriptive than `(UserDto) -> User`. Use raw function types for simple, one-off lambdas where the name wouldn't add value.

**Under the hood**, SAM conversion for Kotlin `fun interface` creates an anonymous class that implements the interface. For Java SAM interfaces, the Kotlin compiler can use `invokedynamic` on newer JVM targets, which is more efficient — the JVM generates the implementation at runtime without an explicit class file.

**Key takeaway:** `fun interface` enables SAM conversion — lambda expressions for single-method interfaces. This powers most of Android's callback-based APIs and creates cleaner, more readable code than anonymous object expressions.

### Lesson 6.2: Inline Functions — Eliminating Lambda Overhead

Every time you pass a lambda to a higher-order function, the compiler generates an anonymous class for that lambda. If the function is called in a loop or a hot path, you're allocating a new object on every invocation. The `inline` keyword eliminates this entirely — the compiler copies the function body and the lambda body directly into the call site.

```kotlin
// Without inline: allocates a Function1 object per call
fun <T> measureTime(block: () -> T): T {
    val start = System.nanoTime()
    val result = block()
    println("Took ${System.nanoTime() - start}ns")
    return result
}

// With inline: zero allocation, code is pasted at the call site
inline fun <T> measureTimeInline(block: () -> T): T {
    val start = System.nanoTime()
    val result = block()
    println("Took ${System.nanoTime() - start}ns")
    return result
}
```

**How it works in bytecode** — When you call `measureTimeInline { expensiveOperation() }`, the compiler doesn't generate a function call. Instead, it copies the body of `measureTimeInline` directly into the calling function's bytecode, with the lambda body substituted in place. No `Function` object, no virtual method call, no allocation.

The standard library uses this aggressively — `let`, `run`, `apply`, `also`, `with`, `forEach`, `filter`, `map` are all inline. That's why chaining `list.filter { }.map { }` doesn't allocate two lambda objects. The lambda bodies get inlined directly into the calling function's bytecode.

**Non-local returns** — Because inline lambdas are part of the calling function's bytecode, you can use `return` inside them to return from the enclosing function:

```kotlin
inline fun <T> List<T>.findAndProcess(predicate: (T) -> Boolean, action: (T) -> Unit) {
    for (item in this) {
        if (predicate(item)) {
            action(item)
            return  // Returns from the CALLING function, not just the lambda
        }
    }
}
```

This is called a non-local return — the `return` exits the enclosing function, not just the lambda. This is natural and useful, but it creates issues when the lambda is executed in a different context (like inside a `Runnable`).

**Key takeaway:** `inline` copies the function body and lambda to the call site, eliminating allocation. Use it for small, frequently-called higher-order functions. The standard library inlines all scope functions and most collection operations.

### Lesson 6.3: noinline and crossinline

`noinline` and `crossinline` are modifiers for lambda parameters of inline functions that handle edge cases where full inlining isn't possible or safe.

**`noinline`** — If you need to store a lambda in a field or pass it to a non-inline function, you mark that parameter `noinline`. It opts that specific parameter out of inlining so it can be treated as a regular object:

```kotlin
inline fun execute(
    setup: () -> Unit,
    noinline onComplete: () -> Unit  // Can be stored, passed around
) {
    setup()  // This lambda is inlined
    scheduleCallback(onComplete)  // This one is passed as an object
}
```

**`crossinline`** — When a lambda is passed into a different execution context (like a `Runnable` or an `object` expression), non-local returns would be unsafe. `crossinline` prohibits them while still allowing the lambda body to be inlined:

```kotlin
inline fun runOnMainThread(crossinline block: () -> Unit) {
    handler.post(Runnable {
        block()  // block runs inside a Runnable — non-local return would break
        // return  // ❌ Not allowed in crossinline lambda
    })
}

// crossinline allows everything except non-local returns
inline fun runSafely(crossinline block: () -> Unit) {
    try {
        block()
    } catch (e: Exception) {
        log(e)
    }
}
```

**When to use each:**

- **Default (no modifier):** Lambda is fully inlined. Non-local returns are allowed. Use for most cases.
- **`noinline`:** Lambda needs to be stored, returned, or passed to a non-inline function. Becomes a regular `Function` object.
- **`crossinline`:** Lambda is inlined but executed in a different context. Non-local returns are prohibited for safety.

**Common mistake:** Inlining large functions. `inline` copies the function body to every call site. A 50-line inline function called in 20 places adds 1,000 lines to your bytecode. Only inline small, frequently-called higher-order functions.

**Key takeaway:** `noinline` lets you store or pass a lambda as an object. `crossinline` prevents non-local returns in lambdas that execute in a different context. Use these when the compiler tells you to.

### Lesson 6.4: Contracts

Contracts tell the compiler facts about function behavior that it can't infer on its own. They enable smart casts after custom check functions and inform the compiler about how many times a lambda parameter is called.

```kotlin
import kotlin.contracts.*

// Tell the compiler that after this call, the value is not null
@OptIn(ExperimentalContracts::class)
fun requireNotEmpty(value: String?) {
    contract {
        returns() implies (value != null)
    }
    if (value.isNullOrEmpty()) throw IllegalArgumentException("Must not be empty")
}

// Usage — compiler knows value is not null after the check
fun processName(name: String?) {
    requireNotEmpty(name)
    println(name.length)  // ✅ No null check needed — contract guarantees non-null
}
```

**`callsInPlace` contract** — This tells the compiler that a lambda is called a specific number of times. It enables variable initialization inside the lambda:

```kotlin
@OptIn(ExperimentalContracts::class)
inline fun <R> executeExactlyOnce(block: () -> R): R {
    contract {
        callsInPlace(block, InvocationKind.EXACTLY_ONCE)
    }
    return block()
}

// Without the contract, this wouldn't compile
val value: Int
executeExactlyOnce {
    value = 42  // ✅ Compiler knows this runs exactly once
}
println(value)  // ✅ Compiler knows value is initialized
```

The standard library uses contracts extensively. `require()`, `check()`, `run()`, `apply()`, `also()`, `let()` all have contracts that enable smart casts and variable initialization.

**Key takeaway:** Contracts tell the compiler facts about function behavior. The `returns() implies` form enables smart casts after custom checks. The `callsInPlace` form enables variable initialization inside lambdas.

### Lesson 6.5: Lambdas with Receivers

Lambdas with receivers are the bridge between regular lambdas and DSLs. A lambda with receiver `T.() -> R` can call methods on the receiver object directly without qualification — just like an extension function.

```kotlin
// Regular lambda
val greet: (String) -> String = { name -> "Hello, $name" }

// Lambda with receiver — String is the receiver
val greetWithReceiver: String.() -> String = { "Hello, $this" }

// They're used differently:
greet("Mukul")           // Called like a function
"Mukul".greetWithReceiver()  // Called on the receiver

// This is how scope functions work internally:
// apply takes T.() -> Unit — 'this' is the receiver
inline fun <T> T.apply(block: T.() -> Unit): T {
    block()
    return this
}

// This is how DSL builders work:
fun html(block: HtmlBuilder.() -> Unit): String {
    return HtmlBuilder().apply(block).build()
}
```

**Practical pattern — safe builder:**

```kotlin
class IntentBuilder(private val context: Context, private val clazz: Class<*>) {
    private val extras = Bundle()

    fun putExtra(key: String, value: String) { extras.putString(key, value) }
    fun putExtra(key: String, value: Int) { extras.putInt(key, value) }
    fun putExtra(key: String, value: Boolean) { extras.putBoolean(key, value) }

    fun build(): Intent = Intent(context, clazz).putExtras(extras)
}

inline fun <reified T : Activity> Context.buildIntent(
    block: IntentBuilder.() -> Unit
): Intent = IntentBuilder(this, T::class.java).apply(block).build()

// Usage
val intent = buildIntent<ProfileActivity> {
    putExtra("user_id", "123")
    putExtra("show_edit", true)
}
```

**Key takeaway:** Lambdas with receivers (`T.() -> Unit`) make `this` available inside the lambda, enabling natural-language-like APIs. This is the mechanism behind `apply`, `run`, `with`, and all Kotlin DSLs.

### Lesson 6.6: Type Aliases

Type aliases create alternative names for existing types. They don't create new types — they're purely for readability and reducing repetition of complex generic types.

```kotlin
// Simplify complex types
typealias EventHandler = (Event) -> Unit
typealias UserPredicate = (User) -> Boolean
typealias JsonMap = Map<String, Any?>

// Simplify nested generics
typealias NetworkResponse<T> = Result<Pair<T, ResponseMetadata>>
typealias Callback<T> = (Result<T>) -> Unit

// Usage
fun registerHandler(handler: EventHandler) { /* ... */ }
fun filterUsers(predicate: UserPredicate): List<User> { /* ... */ }

// Type aliases for function types with receivers
typealias BuildAction<T> = T.() -> Unit

fun <T> configure(target: T, action: BuildAction<T>): T {
    target.action()
    return target
}
```

**Type aliases vs value classes** — Type aliases don't provide type safety. `typealias UserId = Long` and `typealias OrderId = Long` are interchangeable — the compiler treats them as the same type. For type safety, use `@JvmInline value class UserId(val value: Long)`.

**Key takeaway:** Type aliases improve readability for complex generic types. They don't create new types or provide type safety — use value classes for that. Best used for function types, nested generics, and frequently repeated type expressions.

### Quiz: Inline Functions and SAM

#### What is the primary benefit of marking a function as `inline`?

- ❌ It makes the function run in a separate thread
- ❌ It caches the function's return value for repeated calls
- ✅ It eliminates lambda allocation overhead by copying the function body and lambda to the call site
- ❌ It allows the function to be called from Java without a wrapper

> **Explanation:** `inline` copies the function body to every call site at compile time, which eliminates the overhead of creating a Function object for each lambda parameter. This is especially beneficial for small, frequently-called higher-order functions.

#### What does `crossinline` prevent in an inline function's lambda parameter?

- ❌ The lambda from accessing variables outside its scope
- ❌ The lambda from being called more than once
- ✅ The lambda from using non-local returns (return from the enclosing function)
- ❌ The lambda from throwing exceptions

> **Explanation:** `crossinline` marks a lambda that will be invoked in a different execution context (e.g., inside another lambda or object). Non-local returns would be unsafe in such contexts, so `crossinline` prohibits them while still allowing the lambda to be inlined.

#### What is the difference between `fun interface` and a regular interface with one method?

- ❌ `fun interface` can have multiple methods, regular interface cannot
- ❌ `fun interface` is faster at runtime
- ✅ `fun interface` enables SAM conversion, allowing the interface to be instantiated with a lambda expression
- ❌ `fun interface` generates less bytecode

> **Explanation:** The `fun` keyword on an interface enables SAM (Single Abstract Method) conversion. This means you can create an instance using a lambda: `val predicate = IntPredicate { it > 0 }` instead of writing an anonymous object expression. Regular interfaces require explicit `object : Interface { }` syntax.

### Coding Challenge: Retry with Inline

Write an `inline` higher-order function called `retry` that:

- Takes a `maxAttempts: Int` and a `block: () -> T` lambda
- Executes the block up to `maxAttempts` times
- Returns the result on success, or throws the last exception if all attempts fail
- Logs each retry attempt using a `crossinline onRetry` callback

#### Solution

```kotlin
inline fun <T> retry(
    maxAttempts: Int,
    crossinline onRetry: (attempt: Int, exception: Exception) -> Unit = { _, _ -> },
    block: () -> T
): T {
    require(maxAttempts > 0) { "maxAttempts must be positive" }
    var lastException: Exception? = null
    for (attempt in 1..maxAttempts) {
        try {
            return block()
        } catch (e: Exception) {
            lastException = e
            if (attempt < maxAttempts) {
                onRetry(attempt, e)
            }
        }
    }
    throw lastException!!
}

// Usage
fun main() {
    val result = retry(maxAttempts = 3, onRetry = { attempt, e ->
        println("Attempt $attempt failed: ${e.message}. Retrying...")
    }) {
        fetchDataFromNetwork()
    }
}
```

The `block` parameter is `inline` (default for inline functions) enabling non-local returns, while `onRetry` is `crossinline` since it's called inside a catch block where non-local returns would be unsafe. The function uses `require()` for precondition validation.

---

## Module 7: Kotlin DSLs and Type-Safe Builders

DSLs (Domain-Specific Languages) make APIs readable and type-safe. This is how Gradle build scripts, Ktor routing, and Jetpack Compose work under the hood. Kotlin's language features — receiver lambdas, extension functions, infix functions, and operator overloading — combine to make DSLs a natural fit.

### Lesson 7.1: Anatomy of a Kotlin DSL

A Kotlin DSL is built from three core ingredients: receiver lambdas (`T.() -> Unit`), builder classes, and a top-level entry function. The receiver lambda sets `this` to the builder, so you can call its methods directly without qualification.

```kotlin
// The three ingredients:
// 1. Builder class with configuration methods
class HtmlBuilder {
    private val elements = mutableListOf<String>()

    fun h1(text: String) { elements.add("<h1>$text</h1>") }
    fun p(text: String) { elements.add("<p>$text</p>") }
    fun ul(block: UlBuilder.() -> Unit) {
        val builder = UlBuilder().apply(block)
        elements.add(builder.build())
    }

    fun build() = elements.joinToString("\n")
}

class UlBuilder {
    private val items = mutableListOf<String>()
    fun li(text: String) { items.add("<li>$text</li>") }
    fun build() = "<ul>\n${items.joinToString("\n")}\n</ul>"
}

// 2. Top-level entry function with receiver lambda
fun html(block: HtmlBuilder.() -> Unit): String {
    return HtmlBuilder().apply(block).build()
}

// 3. Usage — looks like a custom language
val page = html {
    h1("Kotlin DSL")
    p("Building type-safe builders")
    ul {
        li("Clean syntax")
        li("Compile-time safety")
    }
}
```

**Why this works:** Inside the `html { }` block, `this` is an `HtmlBuilder`. So `h1(...)` is actually `this.h1(...)`. Inside the `ul { }` block, `this` is a `UlBuilder`. The nesting mirrors the structure of the output, making the DSL intuitive to read and write.

**Under the hood**, the `html { }` call creates an `HtmlBuilder` instance, passes the lambda as a receiver function, and calls `build()` on the result. No special compiler magic — it's just regular Kotlin features composed together.

**Real-world DSL patterns:** Gradle's `build.gradle.kts` uses this exact pattern. `dependencies { implementation("...") }` works because `dependencies` is a function that takes a `DependencyHandlerScope.() -> Unit` lambda. Ktor's routing uses `routing { get("/users") { } }`. Compose uses `Column { Text("Hello") }`.

**Key takeaway:** DSLs use receiver lambdas (`Type.() -> Unit`) to create scoped, readable APIs. The builder pattern provides the structure, receiver lambdas provide the clean syntax.

### Lesson 7.2: The @DslMarker Annotation

Without `@DslMarker`, nested DSL blocks can accidentally access methods from outer receivers. This creates subtle bugs and confusing behavior. `@DslMarker` prevents scope leaking by restricting access to only the nearest scope's receiver.

```kotlin
@DslMarker
annotation class NetworkDsl

@NetworkDsl
class RequestBuilder {
    var url: String = ""
    var method: String = "GET"
    private var headers = mutableMapOf<String, String>()

    fun headers(block: HeadersBuilder.() -> Unit) {
        HeadersBuilder(headers).apply(block)
    }

    fun build() = Request(url, method, headers)
}

@NetworkDsl
class HeadersBuilder(private val headers: MutableMap<String, String>) {
    infix fun String.to(value: String) { headers[this] = value }
}

fun request(block: RequestBuilder.() -> Unit): Request {
    return RequestBuilder().apply(block).build()
}

// Usage
val req = request {
    url = "https://api.example.com/users"
    method = "POST"
    headers {
        "Authorization" to "Bearer token123"
        "Content-Type" to "application/json"
        // url = "..."  // ❌ Compile error — @DslMarker prevents this
    }
}
```

Without `@DslMarker`, the `headers { }` block could access `url` and `method` from the outer `RequestBuilder` scope. This is almost never what you want — setting `url` inside a headers block would be a confusing bug. `@DslMarker` makes the compiler enforce scope boundaries.

**How it works:** All classes annotated with the same `@DslMarker` annotation form a "scope group." Inside a lambda whose receiver belongs to that group, you can only access members of the innermost receiver. To explicitly access an outer receiver, you use a qualified `this@OuterBuilder.method()`.

**This is what makes Compose safe:** Compose uses `@ComposableDsl` internally. Inside a `Row { }`, you can't accidentally call `Column`-specific modifiers from the enclosing `Column { }` scope.

**Key takeaway:** `@DslMarker` prevents scope leaking — you can't accidentally access outer scope receivers inside nested DSL blocks. Always use it in production DSLs. This is what makes Compose's `Column { Row { } }` safe.

### Lesson 7.3: Building Real-World DSLs

Let's build a practical DSL for configuring network requests — something you'd actually use in a production Android app.

```kotlin
@DslMarker
annotation class HttpDsl

@HttpDsl
class HttpRequestBuilder {
    var url: String = ""
    var method: HttpMethod = HttpMethod.GET
    var timeout: Long = 30_000
    private val headers = mutableMapOf<String, String>()
    private var body: String? = null
    private var retryConfig: RetryConfig? = null

    fun headers(block: HeadersScope.() -> Unit) {
        HeadersScope(headers).apply(block)
    }

    fun body(content: String) {
        body = content
    }

    fun retry(block: RetryScope.() -> Unit) {
        retryConfig = RetryScope().apply(block).build()
    }

    fun build() = HttpRequest(url, method, timeout, headers, body, retryConfig)
}

@HttpDsl
class HeadersScope(private val headers: MutableMap<String, String>) {
    fun header(name: String, value: String) { headers[name] = value }
    fun authorization(token: String) { headers["Authorization"] = "Bearer $token" }
    fun contentType(type: String) { headers["Content-Type"] = type }
}

@HttpDsl
class RetryScope {
    var maxAttempts: Int = 3
    var delayMs: Long = 1000
    var backoffMultiplier: Double = 2.0
    fun build() = RetryConfig(maxAttempts, delayMs, backoffMultiplier)
}

enum class HttpMethod { GET, POST, PUT, DELETE, PATCH }
data class RetryConfig(val maxAttempts: Int, val delayMs: Long, val backoffMultiplier: Double)
data class HttpRequest(
    val url: String, val method: HttpMethod, val timeout: Long,
    val headers: Map<String, String>, val body: String?, val retryConfig: RetryConfig?
)

fun httpRequest(block: HttpRequestBuilder.() -> Unit): HttpRequest {
    return HttpRequestBuilder().apply(block).build()
}

// Clean, readable API
val request = httpRequest {
    url = "https://api.example.com/users"
    method = HttpMethod.POST
    timeout = 10_000

    headers {
        authorization("my-token")
        contentType("application/json")
        header("X-Request-Id", UUID.randomUUID().toString())
    }

    body("""{"name": "Mukul", "email": "m@x.com"}""")

    retry {
        maxAttempts = 3
        delayMs = 500
        backoffMultiplier = 1.5
    }
}
```

This DSL is type-safe (you can't set `maxAttempts` inside the `headers` block), readable (the structure mirrors the request), and validated (the builder can enforce constraints with `require`).

**Key takeaway:** Production DSLs combine builder classes, receiver lambdas, `@DslMarker`, and data classes. They provide type-safe, readable APIs that mirror the structure of the domain they represent.

### Lesson 7.4: DSL Techniques — Infix, Operators, and Property Delegates

Advanced DSL techniques make the syntax even more natural by leveraging Kotlin's infix functions, operator overloading, and property delegation.

```kotlin
// Infix for natural-language-like syntax
@DslMarker
annotation class RuleDsl

@RuleDsl
class ValidationRuleBuilder {
    private val rules = mutableListOf<(String) -> Boolean>()
    private val messages = mutableListOf<String>()

    infix fun String.mustBe(predicate: (String) -> Boolean) {
        rules.add(predicate)
        messages.add(this)
    }

    fun validate(input: String): List<String> {
        return rules.zip(messages)
            .filter { (rule, _) -> !rule(input) }
            .map { (_, message) -> message }
    }
}

fun validationRules(block: ValidationRuleBuilder.() -> Unit): ValidationRuleBuilder {
    return ValidationRuleBuilder().apply(block)
}

val emailRules = validationRules {
    "Email must not be blank" mustBe { it.isNotBlank() }
    "Email must contain @" mustBe { "@" in it }
    "Email must have a domain" mustBe { it.substringAfter("@").contains(".") }
}

val errors = emailRules.validate("")
// ["Email must not be blank", "Email must contain @", "Email must have a domain"]
```

**Operator overloading in DSLs:**

```kotlin
class RouteBuilder {
    private val routes = mutableListOf<Route>()

    operator fun String.div(path: String): String = "$this/$path"

    infix fun String.handles(handler: () -> String) {
        routes.add(Route(this, handler))
    }
}

// "api" / "users" / "profile" handles { getUserProfile() }
```

**Key takeaway:** Infix functions, operator overloading, and property delegates make DSL syntax more natural. Use them to create domain-specific vocabulary that reads like a specification rather than code.

### Lesson 7.5: Gradle and Compose — DSLs You Already Use

Understanding DSLs demystifies two tools every Android developer uses daily: Gradle build scripts and Jetpack Compose.

**Gradle's `build.gradle.kts`** is a Kotlin DSL:

```kotlin
// This is Kotlin code using receiver lambdas
plugins {
    id("com.android.application")  // Extension function on PluginDependenciesSpec
    kotlin("android")
}

android {  // Function taking AndroidExtension.() -> Unit
    compileSdk = 34

    defaultConfig {  // Nested receiver lambda
        applicationId = "com.example.app"
        minSdk = 24
        targetSdk = 34
    }

    buildFeatures {
        compose = true
    }
}

dependencies {  // Function taking DependencyHandlerScope.() -> Unit
    implementation("androidx.core:core-ktx:1.12.0")
    testImplementation("junit:junit:4.13.2")
}
```

Every block — `plugins { }`, `android { }`, `dependencies { }` — is a function that takes a receiver lambda. `implementation(...)` is a method on `DependencyHandlerScope`. The entire file is Kotlin code executed against Gradle's builders.

**Compose** uses the same principles:

```kotlin
@Composable
fun Greeting(name: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),  // Extension property, returns Dp
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Inside Column, 'this' is ColumnScope
        Text("Hello, $name!")
        Button(onClick = { /* ... */ }) {
            // Inside Button, 'this' is RowScope
            Icon(Icons.Default.Star, contentDescription = null)
            Text("Click me")
        }
    }
}
```

`Column { }` takes a `@Composable ColumnScope.() -> Unit` lambda. Inside it, `this` is a `ColumnScope`, which provides column-specific modifiers. This is a DSL built with receiver lambdas and `@DslMarker`-style scoping.

**Key takeaway:** Gradle and Compose are Kotlin DSLs. Understanding receiver lambdas, builder patterns, and scope markers makes both tools less magical and more understandable.

### Quiz: Kotlin DSLs

#### What is the purpose of receiver lambdas (`Type.() -> Unit`) in Kotlin DSLs?

- ❌ They restrict the lambda to only call private methods
- ✅ They allow calling methods of the receiver type directly inside the lambda without qualification
- ❌ They make the lambda execute asynchronously
- ❌ They prevent the lambda from capturing outer variables

> **Explanation:** Receiver lambdas set the receiver object as `this` inside the lambda block, allowing you to call its methods directly. This is what creates the clean, scoped syntax in DSLs like `apply { url = "..." }`.

#### What problem does `@DslMarker` solve?

- ❌ It enables compile-time validation of DSL syntax
- ❌ It improves runtime performance of DSL builders
- ✅ It prevents accidental access to outer scope receivers inside nested DSL blocks
- ❌ It automatically generates builder classes for the DSL

> **Explanation:** Without `@DslMarker`, nested lambdas can accidentally call methods from outer receivers. `@DslMarker` restricts access so that only the nearest scope's receiver methods are available, preventing subtle bugs like setting `url` inside a `headers { }` block.

### Coding Challenge: Configuration DSL

Build a type-safe DSL for configuring a `DatabaseConfig`. The DSL should support:

- Setting `host`, `port`, and `database` name as properties
- A nested `credentials` block for `username` and `password`
- A `pool` block for `maxConnections` and `timeoutMs`
- Use `@DslMarker` to prevent scope leaking

#### Solution

```kotlin
@DslMarker
annotation class ConfigDsl

@ConfigDsl
class DatabaseConfigBuilder {
    var host: String = "localhost"
    var port: Int = 5432
    var database: String = ""
    private var credentials: Credentials? = null
    private var pool: PoolConfig? = null

    fun credentials(block: CredentialsBuilder.() -> Unit) {
        credentials = CredentialsBuilder().apply(block).build()
    }

    fun pool(block: PoolConfigBuilder.() -> Unit) {
        pool = PoolConfigBuilder().apply(block).build()
    }

    fun build() = DatabaseConfig(host, port, database, credentials, pool)
}

@ConfigDsl
class CredentialsBuilder {
    var username: String = ""
    var password: String = ""
    fun build() = Credentials(username, password)
}

@ConfigDsl
class PoolConfigBuilder {
    var maxConnections: Int = 10
    var timeoutMs: Long = 5000
    fun build() = PoolConfig(maxConnections, timeoutMs)
}

data class DatabaseConfig(
    val host: String, val port: Int, val database: String,
    val credentials: Credentials?, val pool: PoolConfig?
)
data class Credentials(val username: String, val password: String)
data class PoolConfig(val maxConnections: Int, val timeoutMs: Long)

fun databaseConfig(block: DatabaseConfigBuilder.() -> Unit): DatabaseConfig {
    return DatabaseConfigBuilder().apply(block).build()
}

// Usage
val config = databaseConfig {
    host = "db.example.com"
    port = 5432
    database = "myapp"
    credentials {
        username = "admin"
        password = "secret"
        // host = "..."  // ❌ Compile error — @DslMarker prevents this
    }
    pool {
        maxConnections = 20
        timeoutMs = 10_000
    }
}
```

This DSL uses `@DslMarker` to prevent scope leaking, receiver lambdas for clean nested syntax, and the builder pattern internally to construct immutable data classes.

---

## Module 8: Idiomatic Kotlin and Best Practices

The patterns that separate beginner Kotlin from production-quality Kotlin. This module covers coding conventions, common mistakes, Java interop, performance considerations, and how Kotlin works under the hood at the bytecode level.

### Lesson 8.1: Kotlin Coding Conventions

Idiomatic Kotlin isn't just about writing code that works — it's about writing code that communicates intent. These conventions are distilled from years of production Android development and code reviews.

- **Prefer `val` over `var`** — immutability by default prevents entire categories of bugs
- **Use `data class` for DTOs and value objects** — let the compiler generate boilerplate
- **Prefer expression bodies for simple functions:** `fun isValid() = name.isNotBlank()`
- **Use `require()` and `check()` for preconditions** — clear intent and better error messages than manual `if` + `throw`
- **Prefer `sealed interface` over `sealed class`** (since Kotlin 1.5)
- **Name boolean properties/functions as questions:** `isValid`, `hasPermission`, `canProceed`
- **Use trailing commas** in parameter lists and collections for cleaner diffs

```kotlin
// Preconditions with require() and check()
fun withdraw(amount: Double) {
    require(amount > 0) { "Amount must be positive: $amount" }
    check(balance >= amount) { "Insufficient balance: $balance < $amount" }
    balance -= amount
}

// Expression body with when
fun UserStatus.toDisplayText() = when (this) {
    UserStatus.ACTIVE -> "Active"
    UserStatus.SUSPENDED -> "Suspended"
    UserStatus.DELETED -> "Deleted"
}

// Trailing commas for clean git diffs
data class UserConfig(
    val name: String,
    val email: String,
    val isAdmin: Boolean,  // trailing comma
)
```

**`require()` vs `check()` vs `assert()`** — `require()` throws `IllegalArgumentException` for bad input from callers. `check()` throws `IllegalStateException` for invalid internal state. `assert()` is for development-time checks that can be disabled. Use `require` at function entry points, `check` for state invariants, and `error()` when something should never happen.

**Key takeaway:** Idiomatic Kotlin is about clarity of intent. `require()` says "your input is wrong." `check()` says "the state is wrong." Expression bodies say "this is a simple transformation." Each convention communicates something specific to the reader.

### Lesson 8.2: Common Mistakes and Anti-Patterns

These are patterns I've seen repeatedly in code reviews — code that compiles and works but is fragile, unreadable, or subtly broken.

```kotlin
// ❌ Don't: Using !! everywhere
val name = user!!.name!!

// ✅ Do: Handle nullability properly
val name = user?.name ?: "Unknown"

// ❌ Don't: Mutable data classes
data class User(var name: String, var email: String)

// ✅ Do: Immutable data classes with copy()
data class User(val name: String, val email: String)
val updated = user.copy(name = "New Name")

// ❌ Don't: God extensions — business logic on unrelated types
fun String.calculateTax(): Double = // This makes no sense

// ✅ Do: Extensions that logically belong to the type
fun String.isValidEmail(): Boolean = contains("@") && contains(".")

// ❌ Don't: Overusing scope functions
user?.let { it.name.let { name -> name.trim().let { /* ... */ } } }

// ✅ Do: Simple, readable code
val name = user?.name?.trim() ?: return
```

**Anti-pattern: Leaking platform types from Java interop.** When you call a Java method that returns `String!` (platform type), never let it propagate through your Kotlin code. Assign it to `String` or `String?` immediately:

```kotlin
// ❌ Platform type leaks — will crash if Java returns null
fun getUserName(): String = javaService.getUserName()  // No compiler warning!

// ✅ Explicit nullability
fun getUserName(): String? = javaService.getUserName()
fun getUserName(): String = javaService.getUserName() ?: "Unknown"
```

**Anti-pattern: Using `lateinit` when `by lazy` is better:**

```kotlin
// ❌ lateinit — requires you to remember initialization order
class MyFragment : Fragment() {
    private lateinit var adapter: UserAdapter

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        adapter = UserAdapter()
        // If you forget this line, crash on first use
    }
}

// ✅ by lazy — initialized on first access, guaranteed
class MyFragment : Fragment() {
    private val adapter by lazy { UserAdapter() }
}
```

**Anti-pattern: Catching `Exception` or `Throwable` broadly:**

```kotlin
// ❌ Catches everything including CancellationException in coroutines
try {
    fetchData()
} catch (e: Exception) {
    log(e)
}

// ✅ Catch specific exceptions
try {
    fetchData()
} catch (e: IOException) {
    showNetworkError()
} catch (e: JsonException) {
    showParseError()
}
```

**Key takeaway:** Every `!!` is a potential crash. Every mutable data class is a potential shared-state bug. Every platform type leak is a ticking time bomb. Write defensively at system boundaries and idiomatically everywhere else.

### Lesson 8.3: How Kotlin Compiles — Under the Hood

Understanding what the Kotlin compiler produces helps you write more informed code. Kotlin compiles to JVM bytecode that runs identically to Java bytecode — the JVM doesn't know the difference.

**The compilation pipeline:**

Kotlin source code (`.kt` files) → Kotlin compiler (`kotlinc`) → Java bytecode (`.class` files) → JVM execution. The Kotlin compiler and Java compiler both produce the same bytecode format. This is why Kotlin and Java can interoperate seamlessly — they speak the same bytecode language.

**Properties → getters/setters:**

```kotlin
// Kotlin
class User(val name: String, var age: Int)

// Compiles to (roughly):
// public final class User {
//     private final String name;
//     private int age;
//     public final String getName() { return name; }
//     public final int getAge() { return age; }
//     public final void setAge(int age) { this.age = age; }
// }
```

**Companion objects → static inner classes:**

```kotlin
// Kotlin
class User {
    companion object {
        fun create(name: String) = User()
    }
}

// Java caller: User.Companion.create("Mukul")
// With @JvmStatic: User.create("Mukul")
```

**Extension functions → static methods:**

```kotlin
// Kotlin
fun String.isValidEmail() = contains("@")

// Compiles to:
// public static boolean isValidEmail(String $this) {
//     return $this.contains("@");
// }
```

**Lambdas → anonymous classes (unless inline):**

```kotlin
// Kotlin
val square = { x: Int -> x * x }

// Compiles to an instance of Function1<Integer, Integer>
// Each lambda creates a new anonymous class file
```

**`object` declarations → singletons with static INSTANCE field:**

```kotlin
// Kotlin
object Logger { fun log(msg: String) { } }

// Compiles to:
// public final class Logger {
//     public static final Logger INSTANCE;
//     static { INSTANCE = new Logger(); }
//     public void log(String msg) { }
// }
```

**Key takeaway:** Kotlin compiles to standard JVM bytecode. Properties become getter/setter methods. Extension functions become static methods. Companion objects become static inner classes. Lambdas become `Function` objects unless inlined. Understanding this mapping helps you reason about performance and Java interop.

### Lesson 8.4: Kotlin and Java Interop

Kotlin is designed for seamless Java interoperability. But there are annotations and patterns that make the bridge cleaner, especially when your Kotlin code is called from Java.

```kotlin
// @JvmStatic — make companion object methods callable as static from Java
class ApiClient {
    companion object {
        @JvmStatic
        fun create(): ApiClient = ApiClient()
    }
}
// Java: ApiClient.create() instead of ApiClient.Companion.create()

// @JvmOverloads — generate Java overloads for default parameters
@JvmOverloads
fun createNotification(
    title: String,
    body: String,
    priority: Int = NotificationCompat.PRIORITY_DEFAULT,
    channel: String = "default"
): Notification { /* ... */ }
// Java sees 3 overloaded methods

// @JvmField — expose as a field instead of getter/setter
class Config {
    @JvmField val MAX_RETRIES = 3
}
// Java: config.MAX_RETRIES instead of config.getMAX_RETRIES()

// @JvmName — custom name visible from Java
@file:JvmName("StringUtils")
package com.example.util

fun String.isValidEmail() = contains("@")
// Java: StringUtils.isValidEmail(str) instead of StringExtKt.isValidEmail(str)
```

**Calling Java from Kotlin** — The biggest pitfall is platform types. When a Java method lacks nullability annotations, Kotlin shows the type as `String!` — it could be `String` or `String?`. Add `@Nullable`/`@NonNull` annotations to your Java code, or always treat Java return values as nullable in Kotlin:

```kotlin
// Safe pattern for Java interop
val name: String = javaObject.getName() ?: "default"
val items: List<Item> = javaObject.getItems().orEmpty()
```

**Key takeaway:** Use `@Jvm*` annotations when your Kotlin code needs to be called from Java. In pure-Kotlin projects, you don't need them. Always treat Java return values as potentially nullable.

### Lesson 8.5: Performance Considerations

Performance in Kotlin is about knowing what the compiler does behind the scenes and making informed choices. Most of the time, readability wins. But in hot paths — per-frame rendering, large data processing, tight loops — these details matter.

**`const val` vs `val`:**

```kotlin
class AnimationConfig {
    companion object {
        val DURATION_MS = 300L          // runtime: getter + field access
        const val FRAME_BUDGET_MS = 16L // compile-time: inlined as literal 16L
    }
}
```

Every reference to `DURATION_MS` compiles to `AnimationConfig.Companion.getDURATION_MS()` — a method call. Every reference to `FRAME_BUDGET_MS` compiles to the literal `16L`, as if you'd typed the number directly. For constants referenced in hot paths, `const val` eliminates a method call per access.

**Primitive arrays vs boxed arrays:**

```kotlin
// 4 KB, contiguous memory, cache-friendly
val pixelValues = IntArray(1000)

// ~20 KB, scattered heap objects, cache-unfriendly
val pixelValuesBoxed = Array<Int>(1000) { 0 }
```

`IntArray` compiles to a JVM `int[]` — contiguous 32-bit integers. `Array<Int>` compiles to `Integer[]` — each element is a boxed object on the heap with a 16-byte header. For 1,000 elements, that's 4 KB vs ~20 KB. `List<Int>` internally stores boxed `Integer` objects too. For large numeric data — pixel buffers, audio samples, sensor data — use primitive arrays.

**Array bounds check elimination:**

```kotlin
// 136 ARM64 instructions — each access has bounds checking
fun Matrix.isIdentity(): Boolean {
    return values[0] == 1f && values[1] == 0f && /* ... 14 more */
}

// 60 ARM64 instructions — single check eliminates all others
fun Matrix.isIdentity(): Boolean {
    val v = values
    if (v.size < 16) return false  // Helps compiler eliminate individual checks
    return v[0] == 1f && v[1] == 0f && /* ... 14 more */
}
```

A single bounds check at the top gives the compiler enough information to eliminate all 16 individual bounds checks. This technique comes from Compose's internal code where matrix operations run hundreds of times per frame.

**When to optimize:**

- **Hot-path library code** (Compose internals, image processing): Every allocation and branch matters
- **Performance-sensitive app code** (DiffUtil, large list processing): Profile first, optimize second
- **Everything else** (login flow, settings screen): Optimize for readability

**Key takeaway:** `const val` for compile-time constants. `IntArray` over `List<Int>` for large numeric data. `buildString` over `+=` in loops. Profile before optimizing — if you can't measure the difference, keep the readable version.

### Lesson 8.6: Error Handling Patterns

Kotlin offers multiple approaches to error handling beyond try-catch. Understanding when to use each one makes your error handling clearer and more composable.

**`require()`, `check()`, and `error()`** — Precondition functions:

```kotlin
fun processOrder(order: Order) {
    require(order.items.isNotEmpty()) { "Order must have at least one item" }
    require(order.total > 0) { "Order total must be positive: ${order.total}" }
    check(order.status == OrderStatus.PENDING) {
        "Can only process pending orders, got: ${order.status}"
    }
    // At this point, all preconditions are guaranteed
}
```

**`runCatching` and `Result`** — Functional error handling:

```kotlin
suspend fun fetchUserProfile(userId: String): Result<UserProfile> {
    return runCatching {
        val response = api.getUser(userId)
        response.toUserProfile()
    }
}

// Chaining with map, recover, and fold
val displayName = fetchUserProfile(userId)
    .map { it.displayName }
    .recover { "Unknown User" }
    .getOrDefault("Guest")

// fold — handle both cases explicitly
fetchUserProfile(userId).fold(
    onSuccess = { profile -> showProfile(profile) },
    onFailure = { error -> showError(error.message) }
)
```

**Sealed class error modeling** — When errors carry different data:

```kotlin
sealed interface AppError {
    data class Network(val code: Int, val message: String) : AppError
    data class Validation(val fields: List<String>) : AppError
    data class Auth(val reason: String) : AppError
    data object Unknown : AppError
}

fun handleError(error: AppError) = when (error) {
    is AppError.Network -> showNetworkError(error.code, error.message)
    is AppError.Validation -> highlightFields(error.fields)
    is AppError.Auth -> redirectToLogin(error.reason)
    AppError.Unknown -> showGenericError()
}
```

**Key takeaway:** Use `require`/`check` for preconditions, `runCatching`/`Result` for functional error handling, and sealed classes when errors carry different data. Choose the pattern that best fits your layer — preconditions at boundaries, `Result` in repositories, sealed errors in domain logic.

### Lesson 8.7: `==` vs `===`, Any, Unit, and Nothing

These fundamental concepts are frequently asked in interviews and often misunderstood.

**`==` vs `===`:**

```kotlin
val a = "hello"
val b = "hello"
val c = String("hello".toCharArray())

println(a == b)   // true — structural equality (calls equals())
println(a === b)  // true — referential equality (same object, string pool)
println(a == c)   // true — same content
println(a === c)  // false — different objects in memory
```

`==` in Kotlin is equivalent to `equals()` in Java. `===` checks if two references point to the exact same object in memory. For `data class` instances, `==` compares all properties (auto-generated `equals()`). For regular classes, `==` checks reference equality by default unless `equals()` is overridden.

**`Any`, `Unit`, and `Nothing`:**

```kotlin
// Any — root of the type hierarchy, like Java's Object
fun printAnything(value: Any) = println(value)

// Unit — "returns nothing useful", like Java's void
fun logMessage(msg: String): Unit {
    println(msg)
    // return Unit is implicit
}

// Nothing — "never returns", no instances exist
fun fail(message: String): Nothing {
    throw IllegalStateException(message)
}

// Nothing is useful for the compiler:
val result = map["key"] ?: fail("Key not found")
// Compiler knows fail() never returns, so result is non-null
```

`Any` is the supertype of everything. `Nothing` is the subtype of everything. `Unit` is a singleton object (there's exactly one instance of `Unit`). A function returning `Nothing` always throws an exception or loops forever — the compiler uses this to infer that code after a `Nothing` return is unreachable.

**Key takeaway:** `==` checks structural equality (content), `===` checks referential equality (same object). `Any` is the root type, `Unit` replaces `void`, and `Nothing` means "this function never returns normally."

### Quiz: Idiomatic Kotlin

#### What does the `require()` function do in Kotlin?

- ❌ It imports a dependency into the project
- ❌ It marks a function parameter as mandatory
- ✅ It throws an `IllegalArgumentException` if the condition is false
- ❌ It logs a warning message if the condition is false

> **Explanation:** `require()` is used for precondition checks on function arguments. If the condition evaluates to false, it throws an `IllegalArgumentException` with the provided message. It's the idiomatic way to validate input at function entry points.

#### Why should data classes use `val` properties instead of `var`?

- ❌ `var` properties are not allowed in data classes
- ✅ Immutable properties prevent accidental mutation and make `copy()` the explicit way to create modified instances
- ❌ `var` properties break the auto-generated `equals()` method
- ❌ The Kotlin compiler optimizes `val` properties for faster access

> **Explanation:** Using `val` ensures immutability, which prevents subtle bugs from shared mutable state. The `copy()` function provides a clear, intentional way to create modified versions. Additionally, `copy()` is shallow — mutable properties in data classes can lead to shared mutable state between the original and the copy.

#### What is the difference between `==` and `===` in Kotlin?

- ❌ `==` checks reference equality, `===` checks structural equality
- ❌ `==` is for primitives, `===` is for objects
- ✅ `==` checks structural equality (calls `equals()`), `===` checks referential equality (same object in memory)
- ❌ They are identical in behavior

> **Explanation:** `==` calls `equals()` to compare content. `===` checks if two references point to the exact same object in memory. For data classes, `==` compares all primary constructor properties. For regular classes without custom `equals()`, `==` defaults to reference equality.

### Coding Challenge: Safe User Validator

Write a `UserValidator` class that validates user input using idiomatic Kotlin patterns. It should:

- Use `require()` for argument validation at the boundary
- Use a sealed interface for validation results with structured error data
- Use extension body functions where appropriate
- Validate that name is not blank, email contains `@` and `.`, and age is between 13 and 120
- Collect all validation errors, not just the first one

#### Solution

```kotlin
sealed interface ValidationResult {
    data object Valid : ValidationResult
    data class Invalid(val reasons: List<String>) : ValidationResult
}

class UserValidator {

    fun validate(name: String, email: String, age: Int): ValidationResult {
        val errors = buildList {
            if (name.isBlank()) add("Name must not be blank")
            if (!email.isValidEmail()) add("Invalid email format")
            if (age !in 13..120) add("Age must be between 13 and 120")
        }
        return if (errors.isEmpty()) ValidationResult.Valid
        else ValidationResult.Invalid(errors)
    }

    private fun String.isValidEmail() = contains("@") && contains(".")
}

fun main() {
    val validator = UserValidator()

    when (val result = validator.validate("", "invalid", 10)) {
        is ValidationResult.Valid -> println("User is valid")
        is ValidationResult.Invalid -> println("Errors: ${result.reasons}")
        // Errors: [Name must not be blank, Invalid email format, Age must be between 13 and 120]
    }

    when (val result = validator.validate("Mukul", "mukul@example.com", 28)) {
        is ValidationResult.Valid -> println("User is valid")
        is ValidationResult.Invalid -> println("Errors: ${result.reasons}")
        // User is valid
    }
}
```

This solution combines sealed interfaces for type-safe results, extension functions for readability, `buildList` for immutable collection construction, range checks, expression body style, and exhaustive `when` with smart casts — all idiomatic Kotlin patterns covered in this module.

---

Thank You for completing the Kotlin Mastery course! The language is your most important tool — master it, and everything else in Android development becomes easier. 🟣
