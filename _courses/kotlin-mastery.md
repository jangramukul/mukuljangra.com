---
title: "Kotlin Mastery"
layout: course
description: "Master Kotlin from fundamentals to advanced patterns — null safety, generics, DSLs, inline functions, and idiomatic Kotlin for production Android code."
icon: "🟣"
color: "#a78bfa"
difficulty: "Beginner to Expert"
modules: 8
lessons: 42
duration: "6 weeks"
order: 1
tags:
  - Kotlin
  - Android
  - Language
---

## Module 1: Kotlin Fundamentals

The foundation every Kotlin developer needs. If you're coming from Java, this is where you unlearn old habits and start thinking in Kotlin.

### Lesson 1.1: Variables, Types, and Type Inference

Kotlin's type system is smarter than Java's. You rarely need to declare types explicitly — the compiler figures it out.

```kotlin
val name = "Mukul"          // String, immutable
var counter = 0             // Int, mutable
val pi = 3.14               // Double

// Type is inferred, but you can be explicit
val explicitName: String = "Mukul"
```

**`val` vs `var`** — Use `val` by default. Only reach for `var` when you genuinely need mutation. This isn't a suggestion — it's how you prevent entire categories of bugs. Immutability is your first line of defense.

**Key takeaway:** Kotlin's type inference eliminates boilerplate without losing type safety. The compiler knows the type — you don't need to repeat it.

### Lesson 1.2: Null Safety

This is Kotlin's killer feature. Tony Hoare called null references his "billion-dollar mistake." Kotlin fixes it at the type system level.

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
```

**The `!!` operator** is a code smell. Every `!!` in your codebase is a potential crash. If you find yourself using it, rethink your data flow. Use `?.let {}`, `?: return`, or smart casts instead.

**Key takeaway:** Nullable types force you to handle null at compile time, not runtime. The compiler becomes your safety net.

### Lesson 1.3: When Expressions and Smart Casts

`when` replaces Java's `switch` and does it better. Combined with smart casts, it eliminates explicit casting.

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

**Smart casts** are one of Kotlin's best features. After an `is` check, the compiler knows the type — no explicit cast needed. This works in `if`, `when`, and `&&` chains.

**Key takeaway:** `when` is exhaustive when used with sealed classes, forcing you to handle every case. Combined with smart casts, it makes type-safe branching effortless.

### Lesson 1.4: String Templates and Raw Strings

```kotlin
val user = "Mukul"
val greeting = "Hello, $user!"
val calculation = "2 + 2 = ${2 + 2}"

// Multiline strings with trimMargin
val query = """
    |SELECT *
    |FROM users
    |WHERE active = true
    |ORDER BY name
""".trimMargin()
```

**Key takeaway:** String templates replace `String.format()` and concatenation. Raw strings with `trimMargin()` make SQL queries, JSON templates, and regex patterns readable.

---

## Module 2: Functions and Lambdas

Kotlin treats functions as first-class citizens. This module covers everything from basic functions to higher-order patterns that power coroutines and Compose.

### Lesson 2.1: Function Declarations and Default Parameters

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
```

**Named arguments** make code self-documenting. Instead of `createUser("Mukul", "m@x.com", true, false)` where you have to guess what those booleans mean, named arguments make intent explicit.

**Key takeaway:** Default parameters replace the builder pattern and method overloading in most cases. Named arguments make function calls readable without needing to check the signature.

### Lesson 2.2: Extension Functions

Extension functions let you add behavior to existing classes without inheritance or decoration.

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
```

**Under the hood**, extension functions compile to static methods. `"hello".isValidEmail()` becomes `StringExtKt.isValidEmail("hello")`. They don't modify the class — they're syntactic sugar for static utility functions.

**Key takeaway:** Extensions make utility functions discoverable through IDE autocomplete. But don't overuse them — if a function doesn't logically belong to the receiver type, keep it as a standalone function.

### Lesson 2.3: Higher-Order Functions and Lambdas

Functions that take functions as parameters. This is the foundation of Kotlin's functional style and how APIs like `map`, `filter`, and Compose's `@Composable` work.

```kotlin
// Higher-order function
fun <T> List<T>.customFilter(predicate: (T) -> Boolean): List<T> {
    val result = mutableListOf<T>()
    for (item in this) {
        if (predicate(item)) result.add(item)
    }
    return result
}

// Lambda syntax
val adults = users.customFilter { it.age >= 18 }

// Trailing lambda convention
val names = users
    .filter { it.isActive }
    .map { it.name }
    .sorted()
```

**Trailing lambda** — when the last parameter is a function, you can move the lambda outside the parentheses. This is why Compose's `Column { ... }` syntax works.

**Key takeaway:** Higher-order functions are the backbone of Kotlin's standard library, coroutines, and Compose. Understanding them is non-negotiable.

### Lesson 2.4: Scope Functions (let, run, with, apply, also)

Five functions that execute a block of code in the context of an object. Each has a specific use case.

```kotlin
// let — null-safe operations, transformations
user?.let { activeUser ->
    sendWelcomeEmail(activeUser)
    trackLogin(activeUser.id)
}

// apply — object configuration (returns the object)
val textView = TextView(context).apply {
    text = "Hello"
    textSize = 16f
    setTextColor(Color.WHITE)
}

// also — side effects without changing the chain
fun createUser(name: String) = User(name)
    .also { log("Created user: ${it.name}") }
    .also { analytics.track("user_created") }

// run — execute a block and return the result
val result = service.run {
    connect()
    fetchData()
}

// with — call multiple methods on an object
with(binding) {
    titleText.text = item.title
    subtitleText.text = item.subtitle
    icon.setImageResource(item.iconRes)
}
```

**Key takeaway:** `let` for null checks, `apply` for configuration, `also` for side effects, `run` for computing a result, `with` for grouping calls. Don't chain more than 2 — readability drops fast.

---

## Module 3: Object-Oriented Kotlin

Kotlin makes OOP concise. Data classes, sealed classes, and delegation replace hundreds of lines of Java boilerplate.

### Lesson 3.1: Data Classes

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
```

**What the compiler generates** — A `data class` with 4 properties generates roughly 100 lines of bytecode: `equals()` that compares all properties, `hashCode()` that combines all hashes, `toString()` that prints them, `copy()` with defaults, and `component1()` through `component4()`.

**Key takeaway:** Data classes are for holding data. Don't add business logic to them. If you need behavior, use a regular class.

### Lesson 3.2: Sealed Classes and Sealed Interfaces

Sealed types restrict inheritance to a known set of subtypes. Combined with `when`, they create exhaustive type hierarchies.

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

**Sealed class vs sealed interface** — Use `sealed interface` when subtypes need to extend other classes. Use `sealed class` when you need shared state or constructor parameters. Since Kotlin 1.5, sealed interfaces are the preferred choice.

**Key takeaway:** Sealed types + `when` = compile-time exhaustiveness. Adding a new subtype forces you to update every `when` expression — the compiler catches forgotten cases.

### Lesson 3.3: Object Declarations and Companion Objects

```kotlin
// Singleton
object Analytics {
    fun track(event: String) { /* ... */ }
}

// Companion object — factory pattern
class User private constructor(val name: String, val role: Role) {
    companion object {
        fun admin(name: String) = User(name, Role.ADMIN)
        fun guest() = User("Guest", Role.GUEST)
    }
}

val admin = User.admin("Mukul")
```

**Key takeaway:** `object` creates a thread-safe singleton. Companion objects replace Java's static methods while being more powerful — they can implement interfaces and be extended.

### Lesson 3.4: Delegation (by keyword)

Kotlin's delegation eliminates boilerplate for implementing interfaces by forwarding to another object.

```kotlin
// Class delegation
class LoggingList<T>(
    private val inner: MutableList<T> = mutableListOf()
) : MutableList<T> by inner {
    override fun add(element: T): Boolean {
        println("Adding: $element")
        return inner.add(element)
    }
}

// Property delegation
class UserPreferences(private val prefs: SharedPreferences) {
    var username: String by prefs.string("username", "")
    var darkMode: Boolean by prefs.boolean("dark_mode", false)
}
```

**Key takeaway:** Delegation follows the composition-over-inheritance principle. Instead of extending a class, you wrap it and selectively override methods.

---

## Module 4: Collections and Functional Operations

Kotlin's collection API is one of the best in any language. This module covers the operations you'll use daily.

### Lesson 4.1: Immutable vs Mutable Collections

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

**Key takeaway:** Always default to read-only collections. Use `buildList`/`buildMap`/`buildSet` when you need mutable construction but immutable result.

### Lesson 4.2: Transformation Operations

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

// associate — create a map
val ordersByStatus = orders.associateBy { it.status }

// flatMap — flatten nested collections
val allTags = posts.flatMap { it.tags }

// Chaining operations
val topSpenders = orders
    .filter { it.status == "completed" }
    .groupBy { it.userId }
    .mapValues { (_, orders) -> orders.sumOf { it.amount } }
    .entries
    .sortedByDescending { it.value }
    .take(5)
```

**Key takeaway:** Chain operations for readability, but know when to use `Sequence` (next lesson) for large collections to avoid creating intermediate lists.

### Lesson 4.3: Sequences for Lazy Evaluation

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

**When to use Sequences** — When you have large collections (1000+ elements) with multiple chained operations. For small collections, regular chains are fine — the overhead of sequence machinery isn't worth it.

**Key takeaway:** Sequences process elements one at a time through the entire chain, avoiding intermediate collection allocations. Use them for large data sets with multiple transformations.

### Lesson 4.4: Practical Collection Patterns

```kotlin
// Partition — split into two lists
val (active, inactive) = users.partition { it.isActive }

// zip — combine two lists element-wise
val pairs = names.zip(scores) { name, score -> "$name: $score" }

// fold/reduce — accumulate a result
val total = orders.fold(0.0) { acc, order -> acc + order.amount }

// distinct and distinctBy
val uniqueEmails = users.distinctBy { it.email }

// chunked and windowed
val batches = items.chunked(50) // Process in batches of 50
val movingAvg = prices.windowed(7) { it.average() } // 7-day moving average
```

**Key takeaway:** Kotlin's collection API covers almost every data manipulation you'll need. Before writing a `for` loop, check if there's a collection function for it.

---

## Module 5: Generics

Generics in Kotlin go beyond Java's. Understanding variance (`in`, `out`) and reified types unlocks powerful, type-safe APIs.

### Lesson 5.1: Basic Generics and Type Constraints

```kotlin
// Generic class
class Repository<T>(private val dataSource: DataSource<T>) {
    fun getById(id: Long): T? = dataSource.findById(id)
    fun getAll(): List<T> = dataSource.findAll()
}

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

**Key takeaway:** Type constraints ensure generic code only accepts types with the capabilities you need. Use `where` for multiple constraints.

### Lesson 5.2: Variance — in and out

Variance defines how subtypes relate through generics. This is where most developers get confused.

```kotlin
// out = covariant (producer) — can only return T, not accept T
interface Source<out T> {
    fun next(): T
    // fun add(item: T)  // ❌ Not allowed — T is out
}

// in = contravariant (consumer) — can only accept T, not return T
interface Sink<in T> {
    fun put(item: T)
    // fun get(): T  // ❌ Not allowed — T is in
}

// Practical example
val strings: Source<String> = // ...
val objects: Source<Any> = strings  // ✅ Source<String> → Source<Any> (covariant)

val anySink: Sink<Any> = // ...
val stringSink: Sink<String> = anySink  // ✅ Sink<Any> → Sink<String> (contravariant)
```

**The PECS rule** (Producer Extends, Consumer Super) from Java becomes simpler in Kotlin: **Producer = out, Consumer = in**. If your generic type only produces values, use `out`. If it only consumes values, use `in`.

**Key takeaway:** `out` means "I only give you T" (covariant). `in` means "I only take T from you" (contravariant). This is how `List<out T>` allows `List<String>` to be assigned to `List<Any>`.

### Lesson 5.3: Reified Type Parameters

Normally, generic types are erased at runtime. `reified` preserves the type information — but only works with `inline` functions.

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

// Practical usage — Kotlin's standard library
inline fun <reified T> Bundle.getParcelableCompat(key: String): T? {
    return if (Build.VERSION.SDK_INT >= 33) {
        getParcelable(key, T::class.java)
    } else {
        @Suppress("DEPRECATION")
        getParcelable(key) as? T
    }
}
```

**Key takeaway:** `reified` eliminates the `Class<T>` parameter pattern. It only works with `inline` functions because the function body is copied to the call site, where the actual type is known.

---

## Module 6: Coroutine-Ready Kotlin Patterns

Patterns that prepare you for coroutines and modern Android development.

### Lesson 6.1: Functional Interfaces (SAM)

```kotlin
fun interface Mapper<I, O> {
    fun map(input: I): O
}

// Usage with lambda
val userMapper = Mapper<UserEntity, User> { entity ->
    User(entity.name, entity.email)
}

// Java interop — SAM conversion
button.setOnClickListener { view ->
    handleClick(view)
}
```

**Key takeaway:** `fun interface` (SAM) allows lambda expressions for single-method interfaces. This powers most of Android's callback-based APIs.

### Lesson 6.2: Inline Functions and Performance

```kotlin
// Inline eliminates the lambda allocation overhead
inline fun <T> measureTime(block: () -> T): Pair<T, Long> {
    val start = System.nanoTime()
    val result = block()
    val elapsed = System.nanoTime() - start
    return result to elapsed
}

// noinline — prevent inlining for specific lambdas
inline fun execute(
    setup: () -> Unit,
    noinline onComplete: () -> Unit  // Can be stored, passed around
) {
    setup()
    onComplete()
}

// crossinline — lambda can't use non-local returns
inline fun runSafely(crossinline block: () -> Unit) {
    try { block() } catch (e: Exception) { log(e) }
}
```

**Key takeaway:** `inline` copies the function body and lambda to the call site, eliminating allocation. Use it for small, frequently-called higher-order functions. Don't inline large functions — it bloats bytecode.

### Lesson 6.3: Contracts (Advanced)

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

**Key takeaway:** Contracts tell the compiler facts about function behavior that it can't infer on its own. They enable smart casts after custom check functions.

---

## Module 7: Kotlin DSLs and Type-Safe Builders

DSLs (Domain-Specific Languages) make APIs readable and type-safe. This is how Gradle build scripts and Compose work.

### Lesson 7.1: Building a DSL

```kotlin
// HTML DSL example
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

fun html(block: HtmlBuilder.() -> Unit): String {
    return HtmlBuilder().apply(block).build()
}

// Usage
val page = html {
    h1("Kotlin DSL")
    p("Building type-safe builders")
    ul {
        li("Clean syntax")
        li("Compile-time safety")
    }
}
```

**Key takeaway:** DSLs use receiver lambdas (`Type.() -> Unit`) to create scoped, readable APIs. The `@DslMarker` annotation prevents accidental access to outer scope receivers.

### Lesson 7.2: The @DslMarker Annotation

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
    }
}
```

**Key takeaway:** `@DslMarker` prevents scope leaking — you can't accidentally access `RequestBuilder` methods inside the `headers` block. This is what makes Compose's `Column { Row { } }` safe.

---

## Module 8: Idiomatic Kotlin and Best Practices

The patterns that separate beginner Kotlin from production-quality Kotlin.

### Lesson 8.1: Kotlin Coding Conventions

- Prefer `val` over `var` — immutability by default
- Use `data class` for DTOs and value objects
- Prefer expression bodies for simple functions: `fun isValid() = name.isNotBlank()`
- Use `require()` and `check()` for preconditions
- Prefer `sealed interface` over `sealed class` (since Kotlin 1.5)
- Name boolean properties/functions as questions: `isValid`, `hasPermission`, `canProceed`
- Use trailing commas in parameter lists and collections

```kotlin
// Preconditions
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
```

### Lesson 8.2: Common Mistakes and Anti-Patterns

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

// ❌ Don't: God classes with extension functions
fun String.calculateTax(): Double = // ???

// ✅ Do: Extensions that logically belong to the type
fun String.isValidEmail(): Boolean = contains("@") && contains(".")

// ❌ Don't: Overusing scope functions
user?.let { it.name.let { name -> name.trim().let { /* ... */ } } }

// ✅ Do: Simple, readable code
val name = user?.name?.trim() ?: return
```

### Lesson 8.3: Kotlin and Java Interop

```kotlin
// @JvmStatic — make companion object methods callable as static from Java
class ApiClient {
    companion object {
        @JvmStatic
        fun create(): ApiClient = ApiClient()
    }
}

// @JvmOverloads — generate Java overloads for default parameters
@JvmOverloads
fun createNotification(
    title: String,
    body: String,
    priority: Int = NotificationCompat.PRIORITY_DEFAULT,
    channel: String = "default"
): Notification { /* ... */ }

// @JvmField — expose as a field instead of getter/setter
class Config {
    @JvmField val MAX_RETRIES = 3
}
```

**Key takeaway:** Use `@Jvm*` annotations when your Kotlin code needs to be called from Java. In pure-Kotlin projects, you don't need them.

### Lesson 8.4: Performance Considerations

- **Avoid creating unnecessary objects** — Use `object` for stateless implementations
- **Use `inline` for small, frequently-called lambdas** — Eliminates allocation
- **Prefer `Array` over `List` for primitive-heavy code** — `IntArray` avoids boxing
- **Use `buildString` instead of string concatenation in loops**
- **Be careful with property delegates** — Each `by lazy` adds an object allocation

```kotlin
// ❌ Boxing overhead
val numbers: List<Int> = listOf(1, 2, 3) // Each Int is boxed

// ✅ No boxing
val numbers = intArrayOf(1, 2, 3) // Primitive int array

// ❌ String concatenation in loop
var result = ""
for (item in items) result += item.toString()

// ✅ StringBuilder via buildString
val result = buildString {
    for (item in items) append(item)
}
```

**Key takeaway:** Kotlin is designed for readability first, but understand the performance implications. Profile before optimizing — premature optimization is still the root of all evil.

---

Thank You for completing the Kotlin Mastery course! The language is your most important tool — master it, and everything else in Android development becomes easier. 🟣
