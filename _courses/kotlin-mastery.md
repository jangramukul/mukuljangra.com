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

Kotlin's type system is smarter than Java's. You rarely need to declare types explicitly — the compiler figures it out through a process called type inference. When you write `val name = "Mukul"`, the compiler analyzes the right-hand expression, determines it's a `String`, and assigns that type to the variable. This isn't dynamic typing — the type is fixed at compile time. You just don't need to write it out. The Kotlin compiler uses the Hindley-Milner-style inference algorithm (adapted for an object-oriented language), which can propagate type information both forward and backward through expressions. This means the compiler can often determine the type of complex expressions involving generics, lambdas, and chained method calls without a single explicit type annotation.

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

**`val` vs `var`** — Use `val` by default. Only reach for `var` when you genuinely need mutation. This isn't a suggestion — it's how you prevent entire categories of bugs. Immutability is your first line of defense. When you see `val`, you know the reference never changes. When you see `var`, your brain shifts into alert mode because now you need to track where it changes. In production codebases, roughly 80-90% of your variables should be `val`. If you find yourself reaching for `var` frequently, that's a signal to rethink your data flow — maybe you need `map` instead of a loop, or `fold` instead of an accumulator.

**Under the hood**, `val` compiles to a `private final` field with a getter method. `var` compiles to a `private` field with both getter and setter. The `final` modifier on `val` fields means the JVM can optimize reads more aggressively because it knows the value won't change after initialization. For primitives like `Int` and `Boolean`, Kotlin uses JVM primitive types directly (`int`, `boolean`) — no boxing happens unless the type is nullable. This is an important performance detail: `val count: Int = 42` stores a raw `int` on the JVM, consuming just 4 bytes. But `val count: Int? = 42` must use `java.lang.Integer` because the JVM's primitive `int` cannot represent `null`. Each boxed `Integer` adds roughly 16 bytes of object header overhead, plus the pointer to it.

```kotlin
// Kotlin's numeric type hierarchy
val byte: Byte = 127           // 8-bit signed integer
val short: Short = 32_767      // 16-bit signed integer
val int: Int = 2_147_483_647   // 32-bit signed integer
val long: Long = 9_223_372_036_854_775_807L  // 64-bit signed integer
val float: Float = 3.14f       // 32-bit floating point
val double: Double = 3.14      // 64-bit floating point (default for decimals)

// Underscores for readability in numeric literals
val oneMillion = 1_000_000
val hexColor = 0xFF_EC_DE_5E
val binaryMask = 0b1111_0000_1010

// Explicit conversions — no implicit widening like Java
val intVal: Int = 42
// val longVal: Long = intVal  // ❌ Compile error — no implicit conversion
val longVal: Long = intVal.toLong()  // ✅ Explicit conversion
```

**No implicit type conversions** — Kotlin doesn't allow implicit numeric widening like Java. In Java, `long x = 42` compiles fine because `int` silently widens to `long`. Kotlin rejects this — you must call `intVal.toLong()` explicitly. This prevents subtle precision-loss bugs, especially with floating-point math. The explicit conversions are `toByte()`, `toShort()`, `toInt()`, `toLong()`, `toFloat()`, `toDouble()`, and `toChar()`. Each generates a single JVM instruction (like `i2l` for int-to-long), so there's zero performance overhead.

**`lateinit` vs `by lazy`** — Both solve the problem of deferred initialization, but they work differently. `lateinit` is for `var` properties that you promise to initialize before first use. `by lazy` is for `val` properties that are computed on first access and cached. `lateinit` gives you a mutable reference that throws `UninitializedPropertyAccessException` if you read it too early. `by lazy` gives you an immutable reference that's guaranteed to be initialized:

```kotlin
// lateinit — for vars you'll set during a lifecycle event
class MyFragment : Fragment() {
    lateinit var binding: FragmentMainBinding

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        binding = FragmentMainBinding.inflate(inflater, container, false)
        return binding.root
    }
}

// by lazy — for vals computed once on first access
class MyFragment : Fragment() {
    private val viewModel by lazy {
        ViewModelProvider(this)[MainViewModel::class.java]
    }
}

// Check if lateinit is initialized
if (::adapter.isInitialized) {
    adapter.notifyDataSetChanged()
}
```

**Common mistake:** Assuming `val` means the object itself is immutable. `val` only makes the reference immutable. A `val list = mutableListOf(1, 2, 3)` can still have elements added or removed. The reference `list` can't be reassigned, but the list's contents can change. True immutability requires using immutable data structures like `listOf()`. This distinction is critical in multithreaded code — `val` guarantees safe publication of the reference (thanks to the `final` field semantics in the JVM memory model), but it says nothing about the thread-safety of the object that reference points to.

```kotlin
// val makes the REFERENCE immutable, not the OBJECT
val mutableList = mutableListOf(1, 2, 3)
mutableList.add(4)       // ✅ This works — modifying the object
// mutableList = mutableListOf()  // ❌ This fails — reassigning the reference

// For true immutability, use immutable types
val immutableList = listOf(1, 2, 3)
// immutableList.add(4)  // ❌ No add() method on List

// const val — compile-time constants (only primitives and String)
companion object {
    const val MAX_RETRIES = 3           // Inlined as literal at every use site
    val TIMEOUT_MS = 5000L              // Regular property with getter
    const val API_VERSION = "v2"        // Inlined as "v2" at every use site
}
```

**`const val` vs `val` in companion objects** — `const val` is a true compile-time constant. The value is inlined directly into every use site as a literal — no field access, no getter call. `val` in a companion object is a regular property that gets a backing field and a getter. For frequently accessed constants like animation durations, buffer sizes, and string keys, `const val` eliminates one level of indirection per access. The limitation: `const val` only works with primitives and `String`.

**Key takeaway:** Kotlin's type inference eliminates boilerplate without losing type safety. The compiler knows the type — you don't need to repeat it. Default to `val` and only use `var` when mutation is genuinely required. Understand the difference between reference immutability (`val`) and object immutability (immutable types).


### Lesson 1.2: Null Safety — The Billion-Dollar Fix

This is Kotlin's killer feature. Tony Hoare called null references his "billion-dollar mistake." Kotlin fixes it at the type system level by distinguishing between nullable and non-nullable types. Every type in Kotlin exists in two forms: `String` (cannot be null) and `String?` (can be null). The compiler tracks this throughout your entire codebase and refuses to compile code that could produce a `NullPointerException`. This isn't a linting rule or a best practice — it's a fundamental part of the type system. If your code compiles, null-related crashes are mathematically impossible (barring Java interop and deliberate `!!` usage).

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

**The `!!` operator** is a code smell. Every `!!` in your codebase is a potential crash. If you find yourself using it, rethink your data flow. Use `?.let {}`, `?: return`, or smart casts instead. The only acceptable use of `!!` is when you can mathematically prove the value is non-null but the compiler can't see it — and even then, `requireNotNull()` with a descriptive message is better because it gives you context when things go wrong. In production code reviews, treat `!!` like a `FIXME` — it should trigger a conversation about whether the data model is correct.

**Under the hood**, nullable types compile differently than you might expect. At the bytecode level, `String` and `String?` are both `java.lang.String`. The null safety is enforced entirely at compile time through the Kotlin compiler's analysis. When you call a function that takes a non-null `String` parameter, the compiler inserts a null check at the function entry point (`Intrinsics.checkNotNullParameter`). If someone calls your Kotlin function from Java with null, the check triggers immediately with a clear error message rather than failing later in a confusing way. This is a deliberate design choice: fail fast at the boundary rather than propagating null deep into your call stack.

```kotlin
// What the compiler generates for a non-null parameter:
fun greet(name: String) {  // Kotlin source
    println("Hello, $name")
}

// Decompiled bytecode (approximately):
// public static void greet(String name) {
//     Intrinsics.checkNotNullParameter(name, "name");  // ← Inserted by compiler
//     System.out.println("Hello, " + name);
// }
```

**Smart casts with null checks** — The Kotlin compiler tracks null checks through control flow. After an `if (x != null)` check, the variable is automatically smart-cast to its non-nullable type within that branch. This eliminates the need for explicit casts and makes null-handling code concise:

```kotlin
fun processUser(user: User?) {
    if (user == null) return  // Early return pattern

    // Below this line, 'user' is smart-cast to User (non-null)
    println(user.name)
    println(user.email)
}

// Smart cast works with when expressions too
fun describe(obj: Any?) = when {
    obj == null -> "null"
    obj is String -> "String of length ${obj.length}"  // Smart cast to String
    obj is Int -> "Integer: ${obj * 2}"                 // Smart cast to Int
    else -> obj.toString()
}

// Combine safe calls with scope functions for elegant null handling
fun processPayment(payment: Payment?) {
    payment?.let { validPayment ->
        chargeCard(validPayment.cardToken)
        sendReceipt(validPayment.email)
        updateBalance(validPayment.amount)
    } ?: logWarning("Attempted to process null payment")
}
```

**Platform types** are Kotlin's escape hatch for Java interop. When you call a Java method that returns `String`, Kotlin doesn't know if it can be null — Java doesn't express that in its type system. The return type becomes `String!` (a platform type). Never let platform types leak into your Kotlin code. Assign them to either `String` or `String?` immediately:

```kotlin
// Java method: public String getName() { ... }
val name: String = javaObject.getName()   // Crash if Java returns null
val name: String? = javaObject.getName()  // Safe — you handle null

// Always prefer the nullable assignment unless you're certain
val safeName: String = javaObject.getName() ?: "Unknown"
```

**`requireNotNull` vs `!!`** — At system boundaries (parsing intents, reading API responses), use `requireNotNull` with descriptive messages. The difference is stark: `!!` gives you `KotlinNullPointerException` with no context. `requireNotNull` gives you `IllegalArgumentException` with your custom message that explains what went wrong and what the caller should fix:

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

**Nullable types in collections** — Kotlin distinguishes between `List<String>` (non-null list of non-null strings), `List<String?>` (non-null list of nullable strings), `List<String>?` (nullable list of non-null strings), and `List<String?>?` (nullable list of nullable strings). Each has different semantics and requires different handling. The `filterNotNull()` function converts `List<T?>` to `List<T>`, stripping all null elements:

```kotlin
val mixedList: List<String?> = listOf("hello", null, "world", null, "kotlin")
val cleanList: List<String> = mixedList.filterNotNull()  // ["hello", "world", "kotlin"]

// mapNotNull combines map and filterNotNull
val lengths: List<Int> = mixedList.mapNotNull { it?.length }  // [5, 5, 6]

// orEmpty() converts null to empty collection
fun getUsers(): List<User>? = null
val users: List<User> = getUsers().orEmpty()  // Empty list instead of null
```

**Common pitfall: `?.let` with nullable return** — Be careful with `?.let { ... } ?: fallback`. If the `let` block itself returns null, the fallback executes even though the original value wasn't null. This creates a subtle logic bug:

```kotlin
// ❌ Dangerous: if transform() returns null, fallback runs
val result = apiResponse?.let { transform(it) } ?: fallback()

// ✅ Safer: plain if-else when you need both branches
val result = if (apiResponse != null) transform(apiResponse) else fallback()

// ✅ Also safe: use run with explicit null check
val result = apiResponse?.run {
    transform(this) ?: error("transform should never return null for valid input")
} ?: fallback()
```

**Key takeaway:** Nullable types force you to handle null at compile time, not runtime. The compiler becomes your safety net. Push null checks to system boundaries and make your domain models non-null. Use `requireNotNull` over `!!` at boundaries, `?.let` for null-safe operations, and `filterNotNull` for cleaning collections.


### Lesson 1.3: When Expressions and Smart Casts

`when` replaces Java's `switch` and does it better. It works with any type (not just primitives and strings), supports ranges, type checks, and arbitrary conditions. Combined with smart casts, it eliminates explicit casting entirely. Java's `switch` was limited for decades — only primitives, strings, and enums. Kotlin's `when` works with any type, any expression, and any condition. It's one of the most versatile control flow constructs in any modern language.

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

**Smart casts** are one of Kotlin's best features. After an `is` check, the compiler knows the type — no explicit cast needed. This works in `if`, `when`, and `&&` chains. The compiler tracks the type through control flow, so after `if (obj is String)`, every branch that can only be reached when `obj` is a `String` has access to `String` methods. This eliminates an entire category of `ClassCastException` bugs that plague Java code, where developers frequently forget to cast or cast to the wrong type.

**Under the hood**, smart casts compile to regular `instanceof` checks followed by `checkcast` instructions in the bytecode. The difference is that the Kotlin compiler inserts the casts automatically and guarantees they're safe. In Java, you write `if (obj instanceof String) { String s = (String) obj; s.length(); }`. In Kotlin, the compiler generates the equivalent bytecode from `if (obj is String) { obj.length }` — the `checkcast` is still there in the bytecode, but you never see it in your source code, and it's guaranteed to succeed because the compiler only allows it after a verified `instanceof` check.

```kotlin
// Smart casts work through control flow analysis
fun processValue(value: Any) {
    if (value !is String) return  // Early return narrows the type

    // Below here, value is smart-cast to String
    println(value.uppercase())
    println(value.length)
}

// Smart casts in && chains
fun handleInput(input: Any) {
    if (input is String && input.length > 5) {
        // input is smart-cast to String because of the 'is' check
        // The length check is safe because && short-circuits
        println("Long string: ${input.uppercase()}")
    }
}

// Smart casts with sealed classes — the most powerful combination
sealed interface Shape {
    data class Circle(val radius: Double) : Shape
    data class Rectangle(val width: Double, val height: Double) : Shape
    data class Triangle(val base: Double, val height: Double) : Shape
}

fun calculateArea(shape: Shape): Double = when (shape) {
    is Shape.Circle -> Math.PI * shape.radius * shape.radius
    is Shape.Rectangle -> shape.width * shape.height
    is Shape.Triangle -> 0.5 * shape.base * shape.height
    // No else needed — all cases covered
}
```

Smart casts have a limitation: they only work on `val` variables or local variables. If a property is `var` or has a custom getter, the compiler can't guarantee the type hasn't changed between the check and the use. In those cases, you need a local variable. This limitation exists because another thread could modify the `var` property between your `is` check and your use of the smart-cast, creating a race condition. The compiler refuses to introduce potential `ClassCastException` bugs:

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

// Properties with custom getters also can't smart cast
class Container {
    val content: Any
        get() = computeContent()  // Could return different types

    fun process() {
        val captured = content  // Capture in a local val
        if (captured is String) {
            println(captured.length)  // ✅ Works now
        }
    }
}
```

**Exhaustive `when`** — When used as an expression (returning a value), `when` must cover all cases. With sealed classes and enums, this means the compiler forces you to handle every variant. Adding a new sealed subtype produces compile errors everywhere you forgot to handle it. This is one of the most powerful safety mechanisms in Kotlin. It turns runtime errors ("I forgot to handle this new case") into compile-time errors that you must fix before the code ships:

```kotlin
enum class PaymentMethod { CREDIT_CARD, DEBIT_CARD, CASH, CRYPTO }

// As an expression — must be exhaustive
val icon = when (method) {
    PaymentMethod.CREDIT_CARD -> R.drawable.ic_credit
    PaymentMethod.DEBIT_CARD -> R.drawable.ic_debit
    PaymentMethod.CASH -> R.drawable.ic_cash
    PaymentMethod.CRYPTO -> R.drawable.ic_crypto
    // If you add BANK_TRANSFER to the enum, this becomes a compile error
}

// As a statement — not exhaustive by default
when (method) {
    PaymentMethod.CREDIT_CARD -> processCredit()
    PaymentMethod.DEBIT_CARD -> processDebit()
    // Other cases silently ignored — this might be intentional or a bug
}

// Force exhaustiveness on statement when using .let or Unit
when (method) {
    PaymentMethod.CREDIT_CARD -> processCredit()
    PaymentMethod.DEBIT_CARD -> processDebit()
    PaymentMethod.CASH -> processCash()
    PaymentMethod.CRYPTO -> processCrypto()
}.let { }  // .let{} forces exhaustiveness even as a statement
```

**Multi-condition branches** — A single `when` branch can match multiple values using commas, making it more concise than chaining `||` conditions:

```kotlin
fun isWeekend(day: DayOfWeek): Boolean = when (day) {
    DayOfWeek.SATURDAY, DayOfWeek.SUNDAY -> true
    else -> false
}

// Combining different condition types
fun classify(input: Any): String = when (input) {
    0, 1 -> "Binary digit"
    is Int -> "Other integer: $input"
    is String -> "String: $input"
    in listOf(true, false) -> "Boolean"
    else -> "Unknown: ${input::class.simpleName}"
}
```

**Common pitfall: `else` branch hiding new cases** — When you use `else` in a `when` expression over a sealed class or enum, you lose exhaustiveness checking. If someone adds a new subtype, it silently falls into `else` instead of causing a compile error. Only use `else` when you genuinely want a catch-all, not as a convenience to avoid listing all cases:

```kotlin
// ❌ Bad — else hides new sealed subtypes
fun handle(result: NetworkResult<*>) = when (result) {
    is NetworkResult.Success -> showData()
    else -> showError()  // Loading, Error, and any future types all land here
}

// ✅ Good — explicit handling, compiler catches new subtypes
fun handle(result: NetworkResult<*>) = when (result) {
    is NetworkResult.Success -> showData()
    is NetworkResult.Error -> showError()
    NetworkResult.Loading -> showLoading()
}
```

**Key takeaway:** `when` is exhaustive when used with sealed classes, forcing you to handle every case. Combined with smart casts, it makes type-safe branching effortless. Avoid `else` branches on sealed types — you want the compiler to catch missing cases.


### Lesson 1.4: String Templates and Raw Strings

Kotlin's string templates eliminate the need for `String.format()` and concatenation. You embed expressions directly in strings using `$variable` or `${expression}`. The compiler converts these to `StringBuilder` calls in the bytecode, so there's no performance penalty compared to manual concatenation. String templates are not just syntactic sugar — they fundamentally change how you think about string construction. Instead of breaking out of a string to concatenate a variable and then continuing, the string flows naturally with expressions embedded inline.

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

**Under the hood**, the Kotlin compiler transforms string templates into efficient bytecode. For simple cases like `"Hello, $name"`, the compiler generates a single `StringBuilder` chain: `new StringBuilder().append("Hello, ").append(name).toString()`. For templates with multiple expressions, it chains all the appends into one `StringBuilder` instance. This is exactly what a skilled Java developer would write by hand, but the Kotlin compiler guarantees it for every template. The important detail is that the compiler is smart about it — it doesn't create unnecessary intermediate strings.

```kotlin
// Kotlin template:
val msg = "User $name logged in at $timestamp from $location"

// Compiles to (approximately):
// new StringBuilder()
//     .append("User ")
//     .append(name)
//     .append(" logged in at ")
//     .append(timestamp)
//     .append(" from ")
//     .append(location)
//     .toString()
```

**Raw strings** (triple-quoted) preserve whitespace, newlines, and don't require escape characters. This makes them ideal for SQL queries, JSON templates, regex patterns, and multi-line text. `trimMargin()` strips leading whitespace up to the margin character (`|` by default), giving you clean indentation in code while producing properly formatted output. You can also use `trimIndent()` which removes the common leading whitespace from all lines:

```kotlin
// trimMargin uses | as the default margin prefix
val html = """
    |<html>
    |  <body>
    |    <h1>Hello, $name</h1>
    |  </body>
    |</html>
""".trimMargin()

// trimIndent removes common leading whitespace
val json = """
    {
        "name": "$name",
        "email": "$email",
        "active": true
    }
""".trimIndent()

// Custom margin character
val sql = """
    #SELECT u.name, u.email
    #FROM users u
    #INNER JOIN orders o ON u.id = o.user_id
    #WHERE o.total > $minAmount
    #ORDER BY o.created_at DESC
    #LIMIT $pageSize OFFSET $offset
""".trimMargin("#")

// Raw strings for regex — no double-escaping needed
val phoneRegex = """\+?(\d{1,3})?[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}""".toRegex()
// In a regular string, this would need: "\\+?(\\d{1,3})?[-\\.\\s]?\\(?\\d{1,4}\\)?..."
```

**String templates with complex expressions** — You can embed any Kotlin expression inside `${}`. This includes function calls, ternary-style `if` expressions, `when` expressions, and even multi-line blocks (though readability should limit how complex you make them):

```kotlin
// Function calls in templates
val summary = "Found ${results.size} results in ${elapsed}ms"

// Method chains in templates
val initials = "Initials: ${name.split(" ").map { it.first().uppercase() }.joinToString("")}"

// When expression in a template (keep it short)
val label = "Priority: ${when(priority) { Priority.HIGH -> "🔴"; Priority.MEDIUM -> "��"; else -> "🟢" }}"

// For anything complex, extract to a variable first
val formattedDate = date.format(DateTimeFormatter.ISO_LOCAL_DATE)
val logLine = "[$formattedDate] $level: $message"
```

**Performance note:** For simple templates like `"User $name logged in"`, the compiler generates efficient bytecode. But inside loops, string concatenation with `+=` creates a new `String` object on every iteration because strings are immutable. Each `+=` allocates a new string, copies all existing characters, and appends the new content. For 100 iterations, you're doing O(n²) work. Use `buildString` instead — it creates a single `StringBuilder` and uses amortized O(1) appends:

```kotlin
// ❌ O(n²) — allocates a new String every iteration
var result = ""
for (item in items) result += "$item, "

// ✅ O(n) — single StringBuilder, amortized growth
val result = buildString {
    for (item in items) append(item).append(", ")
}

// ✅ Even better for joining — use joinToString
val result = items.joinToString(", ")

// buildString with more complex logic
val report = buildString {
    appendLine("=== Report ===")
    appendLine("Date: ${LocalDate.now()}")
    appendLine()
    items.forEachIndexed { index, item ->
        appendLine("${index + 1}. ${item.name}: ${item.value}")
    }
    appendLine()
    appendLine("Total: ${items.sumOf { it.value }}")
}
```

**Common pitfall: `$` in raw strings** — If you need a literal `$` character in a template string, you can use `${'$'}`. In raw strings, there's no escape character, so this is the only way to include a literal dollar sign:

```kotlin
// Regular string — use backslash escape
val price = "Price: \$${amount}"

// Raw string — use expression to produce $
val shellScript = """
    |#!/bin/bash
    |echo "Hello, ${'$'}USER"
    |export PATH=${'$'}PATH:/usr/local/bin
""".trimMargin()
```

**Key takeaway:** String templates replace `String.format()` and concatenation. Raw strings with `trimMargin()` make SQL queries, JSON templates, and regex patterns readable. Use `buildString` for loop-based string construction and `joinToString` for collection joining. The compiler ensures templates are as efficient as manual `StringBuilder` usage.

### Lesson 1.5: Control Flow as Expressions

In Kotlin, `if`, `when`, and `try` are expressions — they return values. This eliminates temporary variables and makes code more declarative. Instead of assigning a variable inside branches, you assign the result of the entire expression. This is a fundamental shift from Java's statement-oriented control flow. When control flow returns values, you can write code that declares what something is rather than describing the steps to compute it.

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

**Why expressions matter** — Expressions eliminate an entire class of bugs: uninitialized or incorrectly initialized variables. In Java, you declare a variable, then assign it inside an `if-else` or `switch`. If a branch is missing, the variable might be uninitialized. In Kotlin, the expression must produce a value for every branch, so the compiler guarantees completeness. This is especially powerful with `when` on sealed classes — the expression literally cannot compile unless every subtype is handled:

```kotlin
// Java-style (Kotlin allows this too, but it's not idiomatic)
val message: String
if (user.isAdmin) {
    message = "Welcome, admin"
} else if (user.isPremium) {
    message = "Welcome, premium user"
} else {
    message = "Welcome"
}

// Kotlin-style — cleaner, no uninitialized variable risk
val message = when {
    user.isAdmin -> "Welcome, admin"
    user.isPremium -> "Welcome, premium user"
    else -> "Welcome"
}
```

**Expression bodies** let you write single-expression functions without braces or `return`. The compiler infers the return type from the expression. This is the idiomatic Kotlin style for simple transformations, accessors, and utility functions:

```kotlin
fun Double.toCelsius() = (this - 32) * 5.0 / 9.0
fun Int.isEven() = this % 2 == 0
fun User.displayName() = "$firstName $lastName"

// Expression body with when
fun HttpStatus.toCategory() = when (code) {
    in 200..299 -> "Success"
    in 300..399 -> "Redirect"
    in 400..499 -> "Client Error"
    in 500..599 -> "Server Error"
    else -> "Unknown"
}

// Expression body with if
fun clamp(value: Int, min: Int, max: Int) =
    if (value < min) min else if (value > max) max else value
```

This style is idiomatic for simple transformations. The compiler infers the return type from the expression. For functions longer than a single line, use block bodies with explicit return types — readability matters more than brevity. A useful rule of thumb: if the expression is short enough to read without scrolling horizontally, use an expression body. If it wraps to multiple lines, consider a block body.

**`try` as expression** — This is particularly useful for parsing and conversion operations where you need a fallback value. The last expression in the `try` or `catch` block becomes the return value:

```kotlin
// Parse with fallback
val port = try { config["port"]!!.toInt() } catch (_: Exception) { 8080 }

// Nested try-catch expression
val data = try {
    parseJson(input)
} catch (e: JsonParseException) {
    try {
        parseLegacyFormat(input)
    } catch (_: Exception) {
        defaultData()
    }
}

// Using runCatching as a more idiomatic alternative
val port = runCatching { config["port"]!!.toInt() }.getOrDefault(8080)
```

**`takeIf` and `takeUnless`** — These extension functions conditionally return the receiver or null, enabling expressive chains:

```kotlin
// takeIf — return the value if the predicate is true, otherwise null
val validEmail = input.takeIf { it.contains("@") }
val positiveNumber = result.takeIf { it > 0 }

// takeUnless — opposite of takeIf
val nonBlank = input.takeUnless { it.isBlank() }

// Powerful when combined with Elvis operator
val displayName = user.name
    .takeIf { it.isNotBlank() }
    ?: user.email.substringBefore("@")
    .takeIf { it.isNotBlank() }
    ?: "Anonymous User"
```

**Key takeaway:** Expressions reduce mutable state by letting you compute values directly. Prefer expression bodies for simple functions and expression-style `if`/`when` for conditional assignment. Use `takeIf`/`takeUnless` for conditional nulling in chains.

### Lesson 1.6: Ranges, Progressions, and Destructuring

Ranges and destructuring are small features that make a big difference in day-to-day code. Ranges define intervals with `..` and can be used in `for` loops, `when` expressions, and containment checks. They're backed by the `ClosedRange` and `IntProgression` types, which means they work with any `Comparable` type — not just numbers. You can create ranges of `Char`, `String`, `LocalDate`, or any custom type that implements `Comparable`.

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

**Under the hood**, ranges compile to efficient JVM constructs. `for (i in 1..10)` compiles to a simple `for (int i = 1; i <= 10; i++)` loop — no `IntRange` object is allocated. The Kotlin compiler recognizes this common pattern and optimizes it away entirely. However, `if (x in someRange)` where `someRange` is a variable might allocate the range object. For hot paths, consider using explicit comparison instead: `if (x >= min && x <= max)`.

```kotlin
// Compiled efficiently — no allocation
for (i in 0 until list.size) { /* ... */ }
// Equivalent bytecode: for (int i = 0; i < list.size(); i++) { ... }

// Also efficient — indices property
for (i in list.indices) { /* ... */ }

// withIndex for both index and element — allocates an Iterator
for ((index, value) in list.withIndex()) {
    println("$index: $value")
}

// forEachIndexed — no destructuring overhead, inline
list.forEachIndexed { index, value ->
    println("$index: $value")
}
```

**Custom ranges** — You can create ranges for any `Comparable` type. Date ranges are a common real-world example:

```kotlin
// Date ranges
val startDate = LocalDate.of(2024, 1, 1)
val endDate = LocalDate.of(2024, 12, 31)
val isInYear = today in startDate..endDate

// Char ranges
val isDigit = char in '0'..'9'
val isHexChar = char in '0'..'9' || char in 'a'..'f' || char in 'A'..'F'

// String ranges (lexicographic comparison)
val isInRange = "hello" in "a".."z"  // true — "hello" is lexicographically between "a" and "z"
```

**Under the hood**, destructuring uses `componentN()` functions. Data classes generate these automatically. For custom classes, you can define them as operator functions. This is how Kotlin's destructuring integrates with any type — it's not special syntax baked into the compiler, it's just a convention based on operator functions:

```kotlin
class Color(val r: Int, val g: Int, val b: Int) {
    operator fun component1() = r
    operator fun component2() = g
    operator fun component3() = b
}

val (red, green, blue) = Color(255, 128, 0)

// Regex match groups use destructuring
val regex = """(\d+)-(\d+)-(\d+)""".toRegex()
val matchResult = regex.matchEntire("2024-01-15")
matchResult?.destructured?.let { (year, month, day) ->
    println("Year: $year, Month: $month, Day: $day")
}
```

**Common mistake:** Destructuring ignores trailing properties, but you can't skip middle ones. Use `_` as a placeholder for unused components. This is important for readability — it tells the reader "I intentionally don't need this value" rather than leaving them wondering if you forgot it:

```kotlin
val (_, email) = user  // Skip name, only take email
val (id, _, _, createdAt) = order  // Skip name and email

// In lambda parameters
map.entries.forEach { (_, value) ->  // Only need the value, not the key
    process(value)
}

// Destructuring with Pair and Triple
val (first, second) = Pair("hello", 42)
val (a, b, c) = Triple(1, "two", 3.0)
```

**Progressions** — Ranges with a step are represented by `IntProgression`, `LongProgression`, or `CharProgression`. These define a start, end, and step value. You can query their properties:

```kotlin
val progression = 0..100 step 10
println(progression.first)  // 0
println(progression.last)   // 100
println(progression.step)   // 10
println(progression.toList())  // [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

// Reversed progression
val countdown = (10 downTo 1).toList()  // [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
```

**Key takeaway:** Ranges make iteration and containment checks readable. Destructuring eliminates temporary variables when working with data classes, maps, and pairs. Both compile to efficient bytecode — ranges in `for` loops are optimized to simple counter loops with zero allocation.


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

Kotlin functions come in several forms, but the most impactful feature is default parameters. In Java, when you need a function with optional arguments, you write overloads — three, four, sometimes eight versions of the same function. Kotlin eliminates this with default parameter values. You define the function once, and callers provide only the arguments they need. This doesn't just reduce code — it eliminates an entire category of maintenance burden where you need to keep multiple overloads synchronized.

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

**Named arguments** make code self-documenting. Instead of `createUser("Mukul", "m@x.com", true, false)` where you have to guess what those booleans mean, named arguments make intent explicit. You can also reorder named arguments freely. This is particularly valuable for constructors and factory methods with multiple parameters of the same type — `createRect(10, 20, 30, 40)` is ambiguous (is it x, y, width, height? or left, top, right, bottom?), but `createRect(x = 10, y = 20, width = 30, height = 40)` is crystal clear.

**Under the hood**, when you use `@JvmOverloads` annotation, the Kotlin compiler generates actual Java overloads for each combination of default parameters. Without it, Java callers must provide all arguments. The generated overloads fill in the defaults from right to left. The compiler creates a synthetic method with a bitmask parameter that tracks which arguments were provided and which should use defaults:

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

// Under the hood, the compiler generates:
// public static Notification createNotification$default(
//     String title, String body, int priority, String channel,
//     int mask, Object handler) {
//     if ((mask & 4) != 0) priority = PRIORITY_DEFAULT;
//     if ((mask & 8) != 0) channel = "default";
//     return createNotification(title, body, priority, channel);
// }
```

**Function types and overloading** — Kotlin functions can have different signatures based on parameter types, just like Java. But the combination of default parameters and named arguments means you rarely need overloading. The cases where overloading is still useful are: when parameter types differ (not just defaults), when you want to accept different types for the same logical parameter, or when you need different return types:

```kotlin
// Overloading is still useful for different parameter types
fun parse(input: String): Config = parseConfigFromString(input)
fun parse(file: File): Config = parseConfigFromFile(file)
fun parse(stream: InputStream): Config = parseConfigFromStream(stream)

// But for optional parameters, use defaults instead
// ❌ Java-style overloading
fun log(message: String) = log(message, LogLevel.INFO)
fun log(message: String, level: LogLevel) = log(message, level, null)
fun log(message: String, level: LogLevel, throwable: Throwable?) { /* ... */ }

// ✅ Kotlin default parameters
fun log(
    message: String,
    level: LogLevel = LogLevel.INFO,
    throwable: Throwable? = null
) { /* ... */ }
```

**`vararg` parameters** — Kotlin supports variable-length arguments, similar to Java's varargs. The `vararg` parameter is treated as an `Array<T>` inside the function. Use the spread operator `*` to pass an existing array as a vararg argument:

```kotlin
fun printAll(vararg messages: String) {
    for (message in messages) {
        println(message)
    }
}

printAll("Hello", "World", "Kotlin")

// Spread operator to pass an array as vararg
val words = arrayOf("one", "two", "three")
printAll(*words)

// Combining spread with additional arguments
printAll("zero", *words, "four")
```

**Common mistake:** Using default parameters for values that change based on context. Defaults should be reasonable defaults, not conditional logic. If the "default" is actually a computed value, use an overloaded function or a builder instead. Also, be careful with default parameters that reference other parameters — the evaluation order is left-to-right, so a default can reference parameters that appear before it in the signature but not after.

```kotlin
// ✅ Good — sensible defaults
fun fetchPage(url: String, timeout: Long = 30_000L, retries: Int = 3) { /* ... */ }

// ❌ Bad — "default" depends on runtime state
fun sendMessage(content: String, timestamp: Long = System.currentTimeMillis()) { /* ... */ }
// This creates a new timestamp on every call where timestamp isn't provided
// If that's the intent, it's fine. If you want a fixed timestamp, it's a bug.

// ✅ Default referencing an earlier parameter
fun createRange(start: Int, end: Int = start + 10) = start..end
```

**Key takeaway:** Default parameters replace the builder pattern and method overloading in most cases. Named arguments make function calls readable without needing to check the signature. Use `@JvmOverloads` when your Kotlin code needs to be callable from Java with defaults.

### Lesson 2.2: Extension Functions

Extension functions let you add behavior to existing classes without inheritance or decoration. They're syntactic sugar that makes utility functions discoverable through IDE autocomplete. Instead of `StringUtils.isValidEmail(email)`, you write `email.isValidEmail()`. The IDE suggests it when you type `email.` — the function is discoverable exactly where you need it. This is a fundamental shift in API design from static utility classes to contextual, discoverable methods.

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

**Under the hood**, extension functions compile to static methods. `"hello".isValidEmail()` becomes `StringExtKt.isValidEmail("hello")` in the bytecode. The receiver object is passed as the first parameter. This has a critical implication: extension functions are resolved **statically**, not dynamically. They don't participate in polymorphism. The JVM dispatches extension function calls based on the compile-time type of the receiver, exactly like Java static method calls. There's no virtual dispatch table lookup, no polymorphism, no override mechanism:

```kotlin
open class Animal
class Dog : Animal()

fun Animal.greet() = "I'm an animal"
fun Dog.greet() = "I'm a dog"

val animal: Animal = Dog()
println(animal.greet())  // "I'm an animal" — resolved by declared type, not runtime type
```

This catches people off guard when they expect polymorphic dispatch. The extension is resolved based on the compile-time type of the receiver, not the runtime type. For polymorphic behavior, use member functions. If both an extension function and a member function with the same signature exist, the member function always wins:

```kotlin
class Logger {
    fun log(message: String) = println("MEMBER: $message")
}

fun Logger.log(message: String) = println("EXTENSION: $message")

val logger = Logger()
logger.log("Hello")  // "MEMBER: Hello" — member always wins
```

**Extensions on Android framework classes** — This is where extensions truly shine. Android's framework classes are notoriously verbose, and you can't modify them. Extensions let you add the convenience methods that should have been there all along:

```kotlin
// ✅ Good — genuinely extends View behavior
fun View.fadeIn(duration: Long = 300L) {
    alpha = 0f
    visibility = View.VISIBLE
    animate().alpha(1f).setDuration(duration).start()
}

fun View.fadeOut(duration: Long = 300L) {
    animate().alpha(0f).setDuration(duration).withEndAction {
        visibility = View.GONE
    }.start()
}

// Context extensions for common operations
fun Context.toast(message: String, duration: Int = Toast.LENGTH_SHORT) {
    Toast.makeText(this, message, duration).show()
}

fun Context.dpToPx(dp: Int): Int =
    (dp * resources.displayMetrics.density).roundToInt()

// Fragment extensions for navigation
fun Fragment.navigateBack() {
    requireActivity().onBackPressedDispatcher.onBackPressed()
}
```

**Extensions on generic types** — You can write extensions that work with any type parameter, which is how many of Kotlin's standard library functions work:

```kotlin
// Extension on any nullable type
fun <T> T?.orDefault(default: T): T = this ?: default

// Extension on collections of comparable items
fun <T : Comparable<T>> List<T>.isSorted(): Boolean {
    return this.zipWithNext().all { (a, b) -> a <= b }
}

// Extension with receiver and generic constraint
fun <T : Closeable, R> T.useAndReturn(block: (T) -> R): R {
    return try {
        block(this)
    } finally {
        close()
    }
}
```

**Best practice for extensions:** An extension function should feel like it *belongs* on that type. If you have to explain why it's an extension instead of a regular function, it probably shouldn't be one. Use extensions for types you don't own — Android framework classes, third-party library types, standard library types. Don't use them for complex business logic that happens to take a particular type as input:

```kotlin
// ✅ Good — genuinely belongs on the type
fun String.isValidEmail() = contains("@") && substringAfter("@").contains(".")
fun Long.toFormattedDuration() = "${this / 60}m ${this % 60}s"
fun Bundle.getStringOrThrow(key: String) = requireNotNull(getString(key)) { "Missing key: $key" }

// ❌ Bad — business logic pretending to be an extension
fun String.calculateTax(): Double = // This belongs in a TaxCalculator class
fun User.sendNotification(): Boolean = // This belongs in a NotificationService
```

**Key takeaway:** Extensions make utility functions discoverable through IDE autocomplete. But they're resolved statically, don't override member functions, and shouldn't be used for business logic that doesn't logically belong to the receiver type. Use them for types you don't own and operations that genuinely belong on that type.


### Lesson 2.3: Higher-Order Functions and Lambdas

Functions that take functions as parameters or return them. This is the foundation of Kotlin's functional style and how APIs like `map`, `filter`, Compose's `@Composable`, and coroutine builders all work. Higher-order functions elevate functions from mere procedures to values that can be stored, passed, and composed. This paradigm shift is what makes Kotlin's standard library so expressive — instead of writing loops, you describe transformations.

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

**Trailing lambda** — when the last parameter is a function, you can move the lambda outside the parentheses. This is why Compose's `Column { ... }` syntax works and why `buildList { add(item) }` reads naturally. If the lambda is the *only* parameter, you can omit the parentheses entirely: `names.forEach { println(it) }`. This convention is what makes Kotlin DSLs possible — the entire structure of Gradle, Ktor, and Compose relies on trailing lambdas creating nested blocks that look like custom language constructs.

**Lambda captures and closures** — Lambdas can capture variables from the enclosing scope. Unlike Java's anonymous classes (which require `final` or effectively final variables), Kotlin lambdas can capture and modify `var` variables. The compiler achieves this by wrapping captured mutable variables in a `Ref` object, which holds the actual value. This adds a small allocation, but it's usually insignificant:

```kotlin
var count = 0
val incrementAndPrint = { count++; println(count) }
incrementAndPrint()  // 1
incrementAndPrint()  // 2

// Under the hood for captured var:
// final IntRef count$ref = new IntRef();
// count$ref.element = 0;
// Function0 incrementAndPrint = () -> {
//     count$ref.element++;
//     System.out.println(count$ref.element);
// };
```

**Under the hood**, each lambda compiles to an anonymous class that implements `FunctionN<>`. A lambda `{ x: Int -> x * 2 }` becomes an instance of `Function1<Int, Int>`. This means every non-inline lambda creates an object allocation. For hot paths, this matters — which is why `inline` exists (covered in Module 6). The Kotlin standard library has `Function0` through `Function22` interfaces for lambdas with 0 to 22 parameters. If you somehow need more than 22 parameters (you shouldn't), the compiler generates a custom `FunctionN` implementation.

```kotlin
// Each lambda creates an anonymous class
val double = { x: Int -> x * 2 }
// Compiles to something like:
// final class LambdaClass1 implements Function1<Integer, Integer> {
//     public Integer invoke(Integer x) {
//         return x * 2;
//     }
// }
// LambdaClass1 double = new LambdaClass1();

// In a loop, this means an allocation per iteration (unless inline)
for (item in items) {
    process({ it.transform() })  // New Function1 object each iteration
}
```

**Returning functions from functions** — Higher-order functions can also return functions. This enables factory patterns, currying, and partial application:

```kotlin
// Function factory
fun createMultiplier(factor: Int): (Int) -> Int = { it * factor }

val double = createMultiplier(2)
val triple = createMultiplier(3)
println(double(5))  // 10
println(triple(5))  // 15

// Composing functions
fun <A, B, C> compose(f: (B) -> C, g: (A) -> B): (A) -> C = { a -> f(g(a)) }

val toUpperCase: (String) -> String = { it.uppercase() }
val addExclamation: (String) -> String = { "$it!" }
val shout = compose(addExclamation, toUpperCase)
println(shout("hello"))  // "HELLO!"
```

**`it` — the implicit single parameter** — When a lambda has exactly one parameter, you can omit the parameter declaration and use `it` to refer to the single argument. This is convenient for short lambdas but should be avoided when the lambda body is more than one line or when `it` would be ambiguous due to nesting:

```kotlin
// ✅ Good — short, clear what 'it' is
val lengths = names.map { it.length }
val active = users.filter { it.isActive }

// ❌ Bad — nested 'it' is ambiguous
users.filter { it.orders.any { it.amount > 100 } }  // Which 'it'?

// ✅ Better — named parameters for clarity
users.filter { user -> user.orders.any { order -> order.amount > 100 } }
```

**Key takeaway:** Higher-order functions are the backbone of Kotlin's standard library, coroutines, and Compose. Understanding lambdas, trailing lambda convention, and function references is non-negotiable for idiomatic Kotlin. Each non-inline lambda creates an object allocation — use `inline` for performance-critical higher-order functions.

### Lesson 2.4: Scope Functions (let, run, with, apply, also)

Five functions that execute a block of code in the context of an object. Each has a specific use case determined by two axes: what the context object is called (`this` vs `it`) and what the function returns (the lambda result vs the context object). These five functions are among the most commonly used tools in Kotlin, and choosing the right one makes code dramatically more readable. Choosing the wrong one creates confusion.

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

**Under the hood**, all five scope functions are `inline`, which means no lambda allocation occurs. The compiler pastes the lambda body directly into the call site. This is why chaining scope functions has zero performance overhead compared to writing the equivalent code without them. Here's what `apply` actually looks like in the standard library:

```kotlin
// Standard library implementation of apply
public inline fun <T> T.apply(block: T.() -> Unit): T {
    block()
    return this
}

// When you write:
val view = TextView(context).apply {
    text = "Hello"
    textSize = 16f
}

// The compiler generates (approximately):
val view = TextView(context)
view.text = "Hello"
view.textSize = 16f
// No lambda object, no function call overhead
```

**Real-world patterns with scope functions:**

```kotlin
// let for null-safe transformations
val userDto = apiResponse?.let { response ->
    UserDto(
        name = response.name,
        email = response.email,
        avatarUrl = response.avatar?.url
    )
}

// apply for configuring complex objects
val notification = NotificationCompat.Builder(context, channelId).apply {
    setSmallIcon(R.drawable.ic_notification)
    setContentTitle(title)
    setContentText(body)
    setAutoCancel(true)
    setPriority(NotificationCompat.PRIORITY_HIGH)
    setContentIntent(pendingIntent)
}.build()

// also for debugging / logging without breaking chains
val result = repository.getUsers()
    .also { Log.d("Debug", "Fetched ${it.size} users") }
    .filter { it.isActive }
    .also { Log.d("Debug", "${it.size} active users") }
    .sortedBy { it.name }

// run for computing results from an object
val isValid = inputField.run {
    text.isNotBlank() && text.length >= minLength && error == null
}

// with for ViewHolder binding
override fun onBindViewHolder(holder: ViewHolder, position: Int) {
    val item = items[position]
    with(holder.binding) {
        titleText.text = item.title
        subtitleText.text = item.subtitle
        dateText.text = item.formattedDate
        root.setOnClickListener { onItemClick(item) }
    }
}
```

**The `?.let` trap:** Be careful with `?.let { ... } ?: fallback`. If the `let` block itself returns null, the fallback executes even though the original value wasn't null. Use a plain `if` when you need both branches:

```kotlin
// ❌ Dangerous: if transform() returns null, fallback runs
val result = apiResponse?.let { transform(it) } ?: fallback()

// ✅ Safer: plain if-else when you need both branches
val result = if (apiResponse != null) transform(apiResponse) else fallback()
```

**Common mistake:** Chaining three or four scope functions together. If you find yourself writing `object.let { }.run { }.also { }`, stop. That's unreadable. One scope function per chain is the rule. Two if you absolutely must. Beyond that, use local variables. Another common mistake is using `apply` when `also` is more appropriate — if you're calling methods with the object as a parameter (not calling methods *on* the object), use `also`:

```kotlin
// ❌ apply with external function calls — confusing 'this'
val user = User("Mukul").apply {
    saveToDatabase(this)  // 'this' here is ambiguous in nested contexts
    sendWelcomeEmail(this)
}

// ✅ also for external function calls
val user = User("Mukul").also { newUser ->
    saveToDatabase(newUser)
    sendWelcomeEmail(newUser)
}
```

**Key takeaway:** `let` for null checks, `apply` for configuration, `also` for side effects, `run` for computing a result, `with` for grouping calls. Don't nest more than 2 — readability drops fast. All scope functions are inline, so there's zero performance overhead.

### Lesson 2.5: Function Types and References

Kotlin has a rich system for representing function types. Understanding this system is essential for working with higher-order functions, storing callbacks, and using method references. Function types are real types in Kotlin's type system — they have supertypes, they can be nullable, and they can participate in generic constraints.

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

**Receiver function types** (`StringBuilder.() -> Unit`) are what power DSLs and scope functions. Inside the lambda, `this` refers to the receiver object. This is how `apply` works — it takes a `T.() -> Unit` parameter. The receiver function type is one of Kotlin's most unique features — no other mainstream JVM language has it. It's what makes the entire DSL ecosystem possible:

```kotlin
// apply is essentially:
inline fun <T> T.apply(block: T.() -> Unit): T {
    block()  // `this` inside block is the receiver
    return this
}

// You can convert between regular and receiver function types
val regularLambda: (StringBuilder) -> Unit = { sb -> sb.append("hello") }
val receiverLambda: StringBuilder.() -> Unit = { append("hello") }

// They are interchangeable
val asReceiver: StringBuilder.() -> Unit = regularLambda
val asRegular: (StringBuilder) -> Unit = receiverLambda
```

**Function references** come in four flavors, each serving a different purpose. They let you pass existing functions as arguments without wrapping them in lambdas:

```kotlin
// 1. Top-level function reference
fun isPositive(n: Int) = n > 0
val positives = numbers.filter(::isPositive)

// 2. Member function reference — requires an instance or bound reference
val lengths = strings.map(String::length)  // Unbound — takes String as first arg

val user = User("Mukul")
val getName = user::name.getter  // Bound — no argument needed

// 3. Extension function reference
fun String.isEmail() = contains("@")
val emails = strings.filter(String::isEmail)

// 4. Constructor reference
data class User(val name: String)
val createUser = ::User  // (String) -> User
val users = names.map(::User)

// Property references
val nameGetter: (User) -> String = User::name
val names = users.map(User::name)
```

**Storing lambdas** — You can store function types in properties, pass them through constructors, and use them as callback mechanisms. This is cleaner than Java's anonymous interface implementations and enables powerful patterns like strategy, observer, and command:

```kotlin
class Button(private val onClick: () -> Unit) {
    fun click() = onClick()
}

val button = Button { println("Clicked!") }

// Strategy pattern with function types
class Sorter<T>(private val comparator: (T, T) -> Int) {
    fun sort(items: MutableList<T>) {
        items.sortWith(Comparator(comparator))
    }
}

// Event bus with function type storage
class EventBus {
    private val listeners = mutableMapOf<String, MutableList<(Any) -> Unit>>()

    fun subscribe(event: String, handler: (Any) -> Unit) {
        listeners.getOrPut(event) { mutableListOf() }.add(handler)
    }

    fun emit(event: String, data: Any) {
        listeners[event]?.forEach { it(data) }
    }
}
```

**Suspending function types** — Kotlin coroutines introduce suspending function types (`suspend () -> T`). These are distinct from regular function types and can only be called from coroutine contexts:

```kotlin
// Suspending function type
val fetchData: suspend () -> Data = {
    delay(1000)
    api.getData()
}

// Higher-order function accepting suspend lambda
suspend fun <T> retryWithDelay(
    times: Int,
    delayMs: Long,
    block: suspend () -> T
): T {
    repeat(times - 1) {
        try { return block() }
        catch (_: Exception) { delay(delayMs) }
    }
    return block()
}
```

**Key takeaway:** Function types are first-class types in Kotlin. Understanding receiver function types (`T.() -> Unit`) is essential for DSLs and scope functions. Method references (`::functionName`) provide a concise alternative to lambdas for passing existing functions. Nullable function types (`((T) -> R)?`) enable optional callbacks.

### Lesson 2.6: Infix Functions and Operator Overloading

Infix functions and operator overloading let you write more expressive APIs by defining how operators and dot-free syntax work with your types. These features are about readability — they let your code express domain concepts in a natural way. But they come with a responsibility: if the syntax doesn't make the code clearer, don't use it.

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

**Infix function requirements** — To be declared `infix`, a function must: be a member function or an extension function, have exactly one parameter, and that parameter must not accept a variable number of arguments (`vararg`) or have a default value. The result is dot-free, parenthesis-free call syntax that reads more like natural language:

```kotlin
// Standard library infix examples
val mapEntry = 1 to "one"          // Pair(1, "one")
val contains = "hello" in listOf("hello", "world")  // true
mapOf(1 to "one", 2 to "two")     // Map entries using 'to'

// Custom infix for DSL-like syntax
infix fun <T> T.shouldEqual(expected: T) {
    if (this != expected) throw AssertionError("Expected $expected but got $this")
}

// Usage in tests
result shouldEqual 42
user.name shouldEqual "Mukul"
```

**Operator conventions** — Kotlin maps operators to function calls: `a + b` calls `a.plus(b)`, `a[i]` calls `a.get(i)`, `a in b` calls `b.contains(a)`. This is how destructuring works too — `val (a, b) = pair` calls `pair.component1()` and `pair.component2()`. Here's the complete mapping of the most commonly overloaded operators:

```kotlin
// Arithmetic operators
operator fun plus(other: T): T     // a + b
operator fun minus(other: T): T    // a - b
operator fun times(other: T): T    // a * b
operator fun div(other: T): T      // a / b
operator fun rem(other: T): T      // a % b

// Unary operators
operator fun unaryPlus(): T        // +a
operator fun unaryMinus(): T       // -a
operator fun not(): Boolean        // !a

// Comparison operators (implement Comparable instead)
operator fun compareTo(other: T): Int  // a < b, a > b, a <= b, a >= b

// Index operators
operator fun get(index: Int): T           // a[i]
operator fun set(index: Int, value: T)    // a[i] = value

// Invoke operator — makes an object callable like a function
operator fun invoke(): T           // a()
operator fun invoke(arg: T): R     // a(arg)

// In operator
operator fun contains(element: T): Boolean  // element in collection

// Iterator operator
operator fun iterator(): Iterator<T>  // for (item in a)
```

**Practical operator overloading — `invoke` for callable objects:**

```kotlin
class Validator(private val rules: List<(String) -> Boolean>) {
    operator fun invoke(input: String): Boolean = rules.all { it(input) }
}

val emailValidator = Validator(listOf(
    { it.isNotBlank() },
    { "@" in it },
    { "." in it.substringAfter("@") }
))

if (emailValidator("mukul@example.com")) {
    println("Valid email")
}
```

**Common mistake:** Overusing operator overloading. If `+` doesn't intuitively make sense for your type, don't define it. Code like `user + permission` is confusing — use a named method like `user.grantPermission(permission)` instead. Operators should behave as mathematically or logically expected. The same applies to infix functions — `data shouldBe valid` is readable, but `user perform action` is cryptic.

**Under the hood**, operator functions compile to regular method calls. `v1 + v2` becomes `v1.plus(v2)` in bytecode. Infix functions also compile to regular method calls — `2 pow 10` becomes `IntExtKt.pow(2, 10)`. There's no special runtime mechanism — it's purely syntactic sugar resolved at compile time.

**Key takeaway:** Infix functions enable natural-language-like syntax for specific use cases. Operator overloading lets custom types work with standard operators, but use it sparingly — only when the operation is intuitive. The `invoke` operator is particularly useful for creating callable objects like validators and handlers.


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

Kotlin classes are concise by default. The primary constructor is part of the class header, and properties can be declared directly in it. What takes 50 lines in Java often takes 5 in Kotlin. This isn't just about saving keystrokes — concise class declarations reduce the surface area for bugs. Every line of boilerplate you don't write is a line that can't contain a mistake. In Java, a simple POJO with 5 fields requires a constructor, getters, setters, equals, hashCode, and toString — roughly 80 lines that must all stay synchronized when you add or remove a field.

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

**Properties under the hood** — Every `val` property generates a backing field and a getter. Every `var` generates a backing field, getter, and setter. You can customize these. The JVM doesn't have a concept of "properties" — it only knows fields and methods. The Kotlin compiler translates properties into the appropriate combination. When Java code calls your Kotlin class, it sees getter and setter methods following JavaBean conventions:

```kotlin
class Temperature(celsius: Double) {
    var celsius: Double = celsius
        set(value) {
            require(value >= -273.15) { "Below absolute zero" }
            field = value  // 'field' is the backing field identifier
        }

    val fahrenheit: Double
        get() = celsius * 9.0 / 5.0 + 32  // Computed property, no backing field

    val kelvin: Double
        get() = celsius + 273.15
}

// Properties without backing fields (computed properties)
class Circle(val radius: Double) {
    val area: Double
        get() = Math.PI * radius * radius  // Computed on every access

    val circumference: Double
        get() = 2 * Math.PI * radius
}

// Property with private setter — readable externally, writable internally
class Counter {
    var count: Int = 0
        private set  // Only this class can modify count

    fun increment() { count++ }
    fun reset() { count = 0 }
}
```

**Initialization order** — Understanding the initialization order is critical for avoiding subtle bugs. When you create a Kotlin object, initialization happens in this order: primary constructor parameters are evaluated → property initializers and `init` blocks execute in declaration order → secondary constructor body executes. The key insight is that property initializers and `init` blocks are interleaved in the order they appear in the class body:

```kotlin
class InitDemo(param: String) {
    val first = "First: $param".also { println(it) }  // 1st

    init {
        println("Init block 1")  // 2nd
    }

    val second = "Second: $param".also { println(it) }  // 3rd

    init {
        println("Init block 2")  // 4th
    }
}
// Output:
// First: hello
// Init block 1
// Second: hello
// Init block 2
```

**`open` and inheritance** — Kotlin classes are `final` by default. You must explicitly mark a class as `open` to allow inheritance. This is the opposite of Java's default and prevents accidental inheritance hierarchies. The design philosophy is "closed for extension by default, open when intentional." This follows the Effective Java principle that classes should be designed for inheritance or explicitly prohibit it:

```kotlin
open class Shape(val color: String) {
    open fun area(): Double = 0.0
    fun describe() = "Shape($color)"  // Not open — cannot be overridden
}

class Circle(color: String, val radius: Double) : Shape(color) {
    override fun area() = Math.PI * radius * radius
    // override fun describe()  // ❌ Compile error — describe is final
}

// abstract classes — cannot be instantiated
abstract class BaseRepository<T> {
    abstract fun findById(id: Long): T?
    abstract fun save(entity: T): Long

    // Concrete methods are final by default
    fun findByIdOrThrow(id: Long): T =
        findById(id) ?: throw NoSuchElementException("Entity not found: $id")
}
```

**Interfaces** — Kotlin interfaces can have default method implementations, property declarations, and even property implementations (computed properties). Unlike abstract classes, a class can implement multiple interfaces:

```kotlin
interface Loggable {
    val logTag: String
        get() = this::class.simpleName ?: "Unknown"

    fun log(message: String) {
        println("[$logTag] $message")
    }
}

interface Validatable {
    fun validate(): Boolean
}

class UserForm(
    val name: String,
    val email: String
) : Loggable, Validatable {
    override fun validate(): Boolean {
        log("Validating user form")
        return name.isNotBlank() && email.contains("@")
    }
}
```

**Common pitfall: `init` blocks accessing uninitialized properties** — If an `init` block calls an `open` function that a subclass overrides, the subclass's override runs before the subclass constructor has completed. This can access uninitialized subclass properties:

```kotlin
// ❌ Dangerous — open function called during init
open class Parent {
    init { printInfo() }  // Calls overridden version in Child
    open fun printInfo() = println("Parent")
}

class Child(val data: String) : Parent() {
    override fun printInfo() = println("Child data: $data")
    // data is null when called from Parent's init!
}
// Output: "Child data: null" — data hasn't been initialized yet
```

**Key takeaway:** Kotlin's concise class syntax eliminates boilerplate. Properties in the primary constructor, `init` blocks for validation, and `final` by default all push you toward better design. Use `open` only when inheritance is intentional. Understand initialization order to avoid bugs with `open` functions in `init` blocks.

### Lesson 3.2: Data Classes

Data classes are Kotlin's answer to Java's value objects. The compiler auto-generates `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions — roughly 100 lines of bytecode from a single declaration. This eliminates an entire category of bugs where `equals()` and `hashCode()` get out of sync, or where `toString()` doesn't include the latest properties.

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

**What the compiler generates** — The `equals()` method compares all primary constructor properties. `hashCode()` combines their hashes using a standard algorithm (multiply by 31 and add). `toString()` prints them. `copy()` creates a new instance with some properties changed. `component1()` through `componentN()` enable destructuring. Properties declared in the class body are excluded from all of these. This is a critical design decision — if you want a property to participate in equality checks, it must be in the primary constructor:

```kotlin
// What the compiler generates (approximately):
data class Point(val x: Int, val y: Int)

// equals — compares all primary constructor properties
// override fun equals(other: Any?): Boolean {
//     if (this === other) return true
//     if (other !is Point) return false
//     return x == other.x && y == other.y
// }

// hashCode — combines property hashes
// override fun hashCode(): Int {
//     var result = x.hashCode()
//     result = 31 * result + y.hashCode()
//     return result
// }

// toString
// override fun toString(): String = "Point(x=$x, y=$y)"

// copy — creates new instance with optional property changes
// fun copy(x: Int = this.x, y: Int = this.y) = Point(x, y)

// componentN functions for destructuring
// operator fun component1() = x
// operator fun component2() = y
```

**`copy()` — shallow copy semantics** — `copy()` creates a new instance where each property is copied by reference. For immutable types (String, Int, other data classes with val properties), this is perfectly safe. For mutable types (MutableList, MutableMap), the original and the copy share the same mutable object:

```kotlin
data class Project(val name: String, val members: List<String>)

val original = Project("MyApp", mutableListOf("Alice", "Bob"))
val copied = original.copy(name = "MyApp v2")

// Both point to the same list instance!
(original.members as MutableList).add("Charlie")
println(copied.members)  // ["Alice", "Bob", "Charlie"] — unintended!

// Fix: use immutable collections or deep copy
data class SafeProject(val name: String, val members: List<String>)
val safeCopy = original.copy(members = original.members.toList())  // Defensive copy
```

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

**When NOT to use data classes** — Don't use them for entities with identity semantics. A `User` should probably be equal based on `id` alone, not every field. Also, data classes have restrictions: they must have at least one primary constructor parameter, they can't be `abstract`, `open`, `sealed`, or `inner`. If you need inheritance or identity-based equality, use a regular class:

```kotlin
// ❌ Wrong — entity equality should be based on id only
data class UserEntity(val id: Long, val name: String, val email: String)
// Two users with same name/email but different ids are "equal" — incorrect

// ✅ Right — regular class with explicit identity-based equals
class UserEntity(val id: Long, val name: String, val email: String) {
    override fun equals(other: Any?) = other is UserEntity && id == other.id
    override fun hashCode() = id.hashCode()
}

// ✅ Data class for DTOs, API responses, UI state — content-based equality
data class UserDto(val name: String, val email: String)
data class UserUiState(val name: String, val avatarUrl: String, val isOnline: Boolean)
```

**Data classes in production Android code** — Data classes are the backbone of modern Android architecture. They're used for DTOs, domain models, UI states, navigation arguments, and API responses:

```kotlin
// API response
data class ApiUser(
    val id: Long,
    val name: String,
    val email: String,
    val avatar: String?,
)

// Domain model
data class User(
    val id: UserId,
    val name: String,
    val email: Email,
)

// UI state
data class ProfileUiState(
    val userName: String = "",
    val avatarUrl: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
)
```

**Key takeaway:** Data classes are for holding data. Don't add business logic to them. Keep all properties `val` for true immutability. If you need identity-based equality, use a regular class with a custom `equals()`. Use data classes for DTOs, UI states, and any value-based object.

### Lesson 3.3: Sealed Classes and Sealed Interfaces

Sealed types restrict inheritance to a known set of subtypes. Combined with `when`, they create exhaustive type hierarchies that catch missing cases at compile time. This is one of Kotlin's most powerful modeling tools. Sealed types solve a fundamental problem: how do you model a closed set of possibilities where each possibility might carry different data? Enums handle the "closed set" part but force every variant to have the same structure. Sealed types combine the exhaustiveness of enums with the flexibility of class hierarchies.

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

**Under the hood**, sealed classes compile to abstract classes with a private constructor. In Kotlin 1.0-1.4, all subtypes had to be defined in the same file. Since Kotlin 1.5, subtypes can be in the same package (for sealed classes) or the same compilation unit (for sealed interfaces). The compiler knows all possible subtypes at compile time because it scans the declared hierarchy — this is what enables exhaustive `when` checking. At the bytecode level, there's nothing special about sealed classes — they're just abstract classes that the Kotlin compiler tracks.

**Sealed class vs sealed interface** — This distinction matters in practice. Sealed classes can have constructors, `init` blocks, and shared mutable state in the base class. Sealed interfaces can't — they're purely abstract contracts. But sealed interfaces allow multiple inheritance, which is the more common need. Since Kotlin 1.5, `sealed interface` is the preferred default:

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

**Sealed types for state modeling** — Sealed types excel at modeling UI states, navigation events, and domain results. Each state can carry exactly the data it needs — no more, no less:

```kotlin
sealed interface PaymentState {
    data object Idle : PaymentState
    data object Processing : PaymentState
    data class RequiresVerification(val verificationUrl: String) : PaymentState
    data class Completed(val transactionId: String, val amount: Double) : PaymentState
    data class Failed(val error: PaymentError, val retryable: Boolean) : PaymentState
}

sealed interface PaymentError {
    data class InsufficientFunds(val available: Double, val required: Double) : PaymentError
    data class CardDeclined(val reason: String) : PaymentError
    data class NetworkError(val cause: IOException) : PaymentError
    data object UnknownError : PaymentError
}

fun renderPaymentState(state: PaymentState) = when (state) {
    PaymentState.Idle -> showPayButton()
    PaymentState.Processing -> showSpinner()
    is PaymentState.RequiresVerification -> openWebView(state.verificationUrl)
    is PaymentState.Completed -> showReceipt(state.transactionId, state.amount)
    is PaymentState.Failed -> when (state.error) {
        is PaymentError.InsufficientFunds ->
            showError("Need ${state.error.required}, have ${state.error.available}")
        is PaymentError.CardDeclined -> showError("Card declined: ${state.error.reason}")
        is PaymentError.NetworkError -> showRetry("Network error, try again")
        PaymentError.UnknownError -> showError("Something went wrong")
    }
}
```

**Why exhaustive `when` matters** — Imagine you add `RequiresVerification(val verificationUrl: String)` to `PaymentState`. With sealed classes, every `when` expression that matches on `PaymentState` immediately becomes a compile error. The compiler forces you to handle the new state everywhere. With an `else` branch, the new value silently falls into `else`, and you discover the bug when a user reports a blank screen. This compile-time safety is worth more than any number of unit tests for state handling.

**Nested sealed hierarchies** — You can nest sealed types to create rich, expressive models with multiple levels of variants:

```kotlin
sealed interface NavigationEvent {
    data class Navigate(val destination: Screen) : NavigationEvent
    data object Back : NavigationEvent
    data class DeepLink(val uri: Uri) : NavigationEvent

    sealed interface Screen {
        data object Home : Screen
        data class Profile(val userId: String) : Screen
        data class Settings(val section: SettingsSection = SettingsSection.General) : Screen
    }

    enum class SettingsSection { General, Privacy, Notifications }
}
```

**Key takeaway:** Sealed types + `when` = compile-time exhaustiveness. Adding a new subtype forces you to update every `when` expression. Prefer `sealed interface` over `sealed class` since Kotlin 1.5 unless you need shared state. Use sealed types for UI states, navigation events, and any domain model with a closed set of variants.

### Lesson 3.4: Enum Classes

Enums define a fixed set of constants. Unlike sealed classes, every enum value has the same structure. They're perfect for simple, uniform sets of options. Enums in Kotlin are more powerful than Java enums — they can have properties, methods, and even implement interfaces. Each enum constant is a singleton instance of the enum class.

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

**Under the hood**, each enum constant is a `public static final` field on the enum class. `Direction.NORTH` compiles to a static field initialized in the class's static initializer block. The `values()` method returns an array of all constants (note: this creates a new array each time — cache it if you call it frequently). `valueOf(String)` parses a string back to an enum constant. Since Kotlin 1.9, `entries` provides a more efficient `List` alternative to `values()`:

```kotlin
// values() creates a new array each time — avoid in hot paths
val allDirections = Direction.values()  // Allocates new array

// entries (since Kotlin 1.9) returns a cached List — more efficient
val allDirections = Direction.entries   // No allocation

// valueOf for string parsing
val north = Direction.valueOf("NORTH")  // Direction.NORTH
// Direction.valueOf("INVALID")  // Throws IllegalArgumentException

// Enum properties
val name: String = Direction.NORTH.name      // "NORTH"
val ordinal: Int = Direction.NORTH.ordinal   // 0

// Enum implementing interfaces
enum class Severity : Comparable<Severity> {
    LOW, MEDIUM, HIGH, CRITICAL;

    // Comparable is already implemented — ordinal-based
}

if (currentSeverity >= Severity.HIGH) {
    alertOncall()
}
```

**Enums vs sealed classes** — Use enums when your values are uniform (same structure, same data). Use sealed classes when each variant carries different data. The decision tree is simple: if all variants have the same fields, use an enum. If different variants need different data, use a sealed class. If you have a mix (some variants have data, some don't), use a sealed class with `data object` for the no-data variants:

```kotlin
// ✅ Enum — all variants are uniform
enum class HttpMethod { GET, POST, PUT, DELETE, PATCH }

// ✅ Sealed class — variants carry different data
sealed interface HttpResponse {
    data class Success(val body: String, val code: Int) : HttpResponse
    data class Error(val message: String, val code: Int) : HttpResponse
    data object Timeout : HttpResponse
}

// ❌ Forcing different data into enum — awkward
enum class PaymentStatus(val transactionId: String?, val errorMsg: String?) {
    PENDING(null, null),
    COMPLETED("txn_123", null),     // Every constant needs all parameters
    FAILED(null, "Card declined")
}

// ✅ Sealed class — each variant has exactly the data it needs
sealed interface PaymentStatus {
    data object Pending : PaymentStatus
    data class Completed(val transactionId: String) : PaymentStatus
    data class Failed(val errorMsg: String) : PaymentStatus
}
```

**Key takeaway:** Enums are for fixed, uniform sets of constants. When variants need different data, upgrade to sealed classes. Use `entries` (Kotlin 1.9+) instead of `values()` for better performance. Enums can implement interfaces and have abstract methods.

### Lesson 3.5: Object Declarations and Companion Objects

`object` in Kotlin serves multiple roles: singletons, companion objects, and anonymous implementations. The `object` keyword is one of the most versatile constructs in Kotlin, and understanding its three forms is essential for writing idiomatic code.

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

**Under the hood**, `object` declarations compile to a class with a `private` constructor and a `public static final INSTANCE` field. Initialization is thread-safe because the JVM guarantees that static field initialization happens exactly once, synchronized by the class loader. The companion object compiles to a static inner class named `Companion` — which is why Java code accesses it as `User.Companion.admin("Mukul")` unless you add `@JvmStatic`:

```kotlin
// object declaration
object Logger {
    fun log(message: String) { println(message) }
}
// Compiles to (approximately):
// public final class Logger {
//     public static final Logger INSTANCE;
//     static { INSTANCE = new Logger(); }
//     private Logger() { }
//     public void log(String message) { System.out.println(message); }
// }

// companion object
class User {
    companion object Factory {
        fun create() = User()
    }
}
// Compiles to:
// public final class User {
//     public static final Factory Companion;
//     public static final class Factory {
//         public User create() { return new User(); }
//     }
//     static { Companion = new Factory(); }
// }
```

**Companion objects implementing interfaces** — This is a powerful pattern for factory registration, serialization frameworks, and service locator patterns:

```kotlin
interface JsonDeserializer<T> {
    fun fromJson(json: String): T
}

data class User(val name: String, val email: String) {
    companion object : JsonDeserializer<User> {
        override fun fromJson(json: String): User {
            // Parse JSON and create User
            return User("parsed", "parsed@email.com")
        }
    }
}

// Now you can pass User.Companion as a JsonDeserializer<User>
fun <T> loadFromCache(key: String, deserializer: JsonDeserializer<T>): T? {
    val json = cache.get(key) ?: return null
    return deserializer.fromJson(json)
}

val user = loadFromCache("user", User)  // User.Companion implements JsonDeserializer
```

**Named companion objects** — Companion objects can have names, which improves readability when they serve a specific purpose:

```kotlin
class Color(val r: Int, val g: Int, val b: Int) {
    companion object Palette {
        val RED = Color(255, 0, 0)
        val GREEN = Color(0, 255, 0)
        val BLUE = Color(0, 0, 255)
        fun fromHex(hex: String): Color { /* ... */ }
    }
}

val red = Color.RED           // Works without name reference
val blue = Color.Palette.BLUE // Also works with name
```

**Anonymous objects** — Unlike Java's anonymous classes, Kotlin's anonymous objects can implement multiple interfaces and access mutable local variables:

```kotlin
// Implementing multiple interfaces
val handler = object : ClickHandler, LongClickHandler {
    override fun onClick(view: View) { /* ... */ }
    override fun onLongClick(view: View): Boolean { /* ... */ return true }
}

// Anonymous objects capture mutable variables
var clickCount = 0
button.setOnClickListener(object : View.OnClickListener {
    override fun onClick(v: View) {
        clickCount++  // ✅ Can modify local var (unlike Java)
        updateUI(clickCount)
    }
})
```

**Key takeaway:** `object` creates a thread-safe singleton. Companion objects replace Java's static methods while being more powerful — they can implement interfaces and be extended. Anonymous objects replace Java's anonymous inner classes with more capabilities, including multiple interface implementation.

### Lesson 3.6: Value Classes (Inline Classes)

Value classes wrap a single value with zero runtime overhead. At compile time, the wrapper enforces type safety. At runtime, the JVM uses the underlying primitive directly — no object allocation. This is the solution to a common problem in large codebases: parameter-swapping bugs. When a function takes `fun transfer(fromId: Long, toId: Long, amount: Long)`, it's easy to pass the arguments in the wrong order. Value classes make each parameter a distinct type.

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

**Under the hood**, the Kotlin compiler replaces `UserId` with `Long` wherever possible. `findUser(UserId(123L))` compiles to `findUser(123L)` at the bytecode level. No wrapper object is created. Boxing only happens when the value class is used as a generic type parameter, cast to an interface it implements, used as a nullable type, or compared with `===`. This makes value classes ideal for domain primitives like IDs, currency amounts, and coordinates — you get type safety without any memory overhead.

```kotlin
// No boxing — UserId is erased to Long
fun findUser(id: UserId): User? { /* ... */ }
// Compiles to: fun findUser-<hash>(id: Long): User? { ... }
// The mangled name prevents accidental calls from Java

// Boxing happens here — generic type parameter
fun <T> wrapInList(value: T): List<T> = listOf(value)
wrapInList(UserId(123))  // UserId must be boxed to pass as Any

// Boxing happens here — nullable value class
val nullableId: UserId? = UserId(123)  // Must be boxed (Long can't be null)

// Boxing happens here — used as interface type
@JvmInline
value class Name(val value: String) : Comparable<Name> {
    override fun compareTo(other: Name) = value.compareTo(other.value)
}
val comparable: Comparable<Name> = Name("hello")  // Boxed
```

**Value classes with validation** — The `init` block runs during construction, providing validation without runtime cost for the wrapper itself:

```kotlin
@JvmInline
value class Percentage(val value: Double) {
    init {
        require(value in 0.0..100.0) { "Percentage must be 0-100, got $value" }
    }

    fun toFraction() = value / 100.0
    fun toFormattedString() = "${value}%"
}

@JvmInline
value class PositiveInt(val value: Int) {
    init {
        require(value > 0) { "Must be positive, got $value" }
    }
}

// Used at API boundaries for safety
fun applyDiscount(price: Double, discount: Percentage): Double {
    return price * (1.0 - discount.toFraction())
}
```

**Common mistake:** Adding too many methods to value classes. They're meant for lightweight wrappers. If you need complex behavior, use a regular `data class`. Value classes can have `init` blocks and functions, but they can only wrap a single property. Also, value classes cannot extend other classes (but they can implement interfaces).

**Key takeaway:** Value classes provide type-safe wrappers around single values with zero runtime overhead. Use them for domain primitives like IDs, amounts, and coordinates to prevent parameter-swapping bugs. Boxing only occurs in specific situations like nullability, generic contexts, and interface usage.

### Lesson 3.7: Delegation (by keyword)

Kotlin's delegation eliminates boilerplate for implementing interfaces by forwarding to another object. The compiler generates the forwarding code at compile time — zero runtime overhead compared to writing it by hand. This is Kotlin's native support for the Decorator pattern and the "composition over inheritance" principle. Instead of extending a class to modify its behavior, you compose it into a new class and delegate the unchanged behavior.

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

**Class delegation** generates forwarding implementations for every interface method. You only override the ones you want to customize. If `AnalyticsTracker` has 15 methods and you only care about intercepting `trackEvent`, you write one override instead of fifteen forwarding functions. When someone adds a new method to the interface, the compiler automatically forwards it. This is dramatically better than Java's manual delegation, where you have to write `@Override` methods for every single interface method:

```kotlin
// Under the hood, class delegation generates:
// public final class LoggingAnalyticsTracker implements AnalyticsTracker {
//     private final AnalyticsTracker delegate;
//
//     // Auto-generated forwarding methods
//     public void trackScreen(String screenName) {
//         delegate.trackScreen(screenName);  // ← Compiler generates this
//     }
//     public void setUserId(String userId) {
//         delegate.setUserId(userId);  // ← Compiler generates this
//     }
//     public void reset() {
//         delegate.reset();  // ← Compiler generates this
//     }
//
//     // Your override
//     public void trackEvent(String name, Map properties) {
//         Log.d("Analytics", "Event: " + name);
//         delegate.trackEvent(name, properties);
//     }
// }
```

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

// Map-backed delegation — useful for JSON-like objects
class JsonWrapper(private val map: Map<String, Any?>) {
    val name: String by map
    val age: Int by map
    val email: String by map
}

val wrapper = JsonWrapper(mapOf("name" to "Mukul", "age" to 28, "email" to "m@x.com"))
println(wrapper.name)  // "Mukul"
```

**Custom property delegates** — Creating your own delegate lets you extract repeated patterns into reusable components. The delegate must implement `getValue` (for `val`) or both `getValue` and `setValue` (for `var`):

```kotlin
// Custom SharedPreferences delegate
class SharedPreferenceDelegate<T>(
    private val prefs: SharedPreferences,
    private val key: String,
    private val defaultValue: T
) : ReadWriteProperty<Any?, T> {

    @Suppress("UNCHECKED_CAST")
    override fun getValue(thisRef: Any?, property: KProperty<*>): T {
        return when (defaultValue) {
            is String -> prefs.getString(key, defaultValue) as T
            is Int -> prefs.getInt(key, defaultValue) as T
            is Boolean -> prefs.getBoolean(key, defaultValue) as T
            is Long -> prefs.getLong(key, defaultValue) as T
            is Float -> prefs.getFloat(key, defaultValue) as T
            else -> throw IllegalArgumentException("Unsupported type")
        }
    }

    override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
        prefs.edit().apply {
            when (value) {
                is String -> putString(key, value)
                is Int -> putInt(key, value)
                is Boolean -> putBoolean(key, value)
                is Long -> putLong(key, value)
                is Float -> putFloat(key, value)
            }
            apply()
        }
    }
}

// Usage — clean property syntax backed by SharedPreferences
class Settings(prefs: SharedPreferences) {
    var username by SharedPreferenceDelegate(prefs, "username", "")
    var darkMode by SharedPreferenceDelegate(prefs, "dark_mode", false)
    var fontSize by SharedPreferenceDelegate(prefs, "font_size", 14)
}
```

**Key takeaway:** Delegation follows the composition-over-inheritance principle. Class delegation generates forwarding code — override only what you need to customize. Property delegation extracts repeated patterns like persistence, caching, and validation into reusable components. Both eliminate boilerplate while keeping code maintainable.


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

Kotlin separates read-only and mutable collections at the type level. `List<T>` has no `add()` method. `MutableList<T>` does. This distinction is enforced at compile time and prevents accidental mutation across API boundaries. This design is a departure from Java, where every `ArrayList` exposes `add()` and `remove()` regardless of whether the caller should be modifying the collection. In Kotlin, the type system communicates the intent: `List<T>` means "you can read from this," `MutableList<T>` means "you can modify this."

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

```kotlin
// The aliasing problem
val mutableList = mutableListOf(1, 2, 3)
val readOnlyView: List<Int> = mutableList  // Same underlying list!

println(readOnlyView)  // [1, 2, 3]
mutableList.add(4)
println(readOnlyView)  // [1, 2, 3, 4] — changed through the mutable reference!

// Defensive copy for true isolation
val safeCopy: List<Int> = mutableList.toList()  // Independent copy
mutableList.add(5)
println(safeCopy)  // [1, 2, 3, 4] — unchanged
```

**`buildList`, `buildMap`, `buildSet`** — These are the idiomatic way to construct collections when you need conditional or loop-based logic during creation. Inside the lambda, you have a mutable builder. The return value is an immutable collection. Under the hood, `buildList` creates a `MutableList`, passes it to your lambda, and then wraps the result in an unmodifiable list:

```kotlin
val config = buildMap {
    put("host", "localhost")
    put("port", "5432")
    if (isProduction) {
        put("ssl", "true")
        put("pool_size", "20")
    }
}

// buildSet for unique elements with conditional logic
val permissions = buildSet {
    add(Permission.READ)
    if (user.isAdmin) {
        add(Permission.WRITE)
        add(Permission.DELETE)
        add(Permission.ADMIN)
    }
    if (user.isModerator) {
        add(Permission.MODERATE)
    }
}
```

**Collection interfaces hierarchy** — Understanding the hierarchy helps you choose the right type for your API:

```kotlin
// Iterable → Collection → List (ordered, index access)
// Iterable → Collection → Set (unique elements)
// Map (key-value pairs, not an Iterable)

// Choose the most general type for function parameters
fun processItems(items: Iterable<Item>) { /* ... */ }  // Accepts List, Set, any iterable
fun processItems(items: Collection<Item>) { /* ... */ }  // Accepts List, Set
fun processItems(items: List<Item>) { /* ... */ }        // Only accepts List

// Choose the most specific type for return values
fun getActiveUsers(): List<User> { /* ... */ }  // Caller knows it's ordered, indexed
fun getUniqueEmails(): Set<String> { /* ... */ }  // Caller knows elements are unique
```

**Common mistake:** Exposing `MutableList` from a class. Always expose `List` from your public API. Internal mutation is fine, but callers should only see the read-only interface. This is a pattern used extensively in Android ViewModel classes:

```kotlin
class UserRepository {
    private val _users = mutableListOf<User>()
    val users: List<User> get() = _users  // Exposed as read-only
}

// Same pattern with StateFlow in ViewModels
class UserViewModel : ViewModel() {
    private val _state = MutableStateFlow(UserUiState())
    val state: StateFlow<UserUiState> = _state.asStateFlow()

    fun updateName(name: String) {
        _state.update { it.copy(name = name) }
    }
}
```

**Key takeaway:** Always default to read-only collections. Use `buildList`/`buildMap`/`buildSet` when you need mutable construction but immutable result. Never expose `MutableList` in your public API. Use the backing property pattern (`_mutableList` / `list`) for internal state management.

### Lesson 4.2: Transformation Operations

Kotlin's transformation functions replace most `for` loops with declarative, chainable operations. The key ones are `map`, `filter`, `flatMap`, `groupBy`, and `associate`. These functions express what you want to compute rather than how to compute it — the iteration, temporary variables, and accumulation are all handled for you.

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

**Chaining operations** — The real power is in composing these operations. Each operation returns a new collection, so they chain naturally. The key to readable chains is to think about each step as a sentence: "take orders, keep only completed ones, group by user, sum each user's orders, sort by total, take top 5":

```kotlin
val topSpenders = orders
    .filter { it.status == "completed" }
    .groupBy { it.userId }
    .mapValues { (_, userOrders) -> userOrders.sumOf { it.amount } }
    .entries
    .sortedByDescending { it.value }
    .take(5)

// More complex real-world example: API response transformation
val displayItems = apiResponse.items
    .filter { it.isActive && !it.isDeleted }
    .map { item ->
        DisplayItem(
            title = item.name.capitalize(),
            subtitle = "${item.category} · ${item.formattedPrice}",
            imageUrl = item.images.firstOrNull()?.thumbnailUrl,
            isBookmarked = bookmarkedIds.contains(item.id)
        )
    }
    .sortedWith(compareBy<DisplayItem> { !it.isBookmarked }.thenBy { it.title })
```

**`mapIndexed`, `filterIndexed`, `forEachIndexed`** — When you need the index alongside the element:

```kotlin
val numbered = items.mapIndexed { index, item -> "${index + 1}. ${item.name}" }

val everyOther = items.filterIndexed { index, _ -> index % 2 == 0 }

items.forEachIndexed { index, item ->
    println("$index: ${item.name}")
}
```

**Under the hood**, each chained operation creates an intermediate `List`. For `filter { }.map { }.take(3)` on a list of 10,000 elements, you create a filtered list (maybe 5,000 elements), then a mapped list (5,000 elements), then take 3. The intermediate lists are garbage. For small collections, this is fine. For large collections, use sequences (next lesson). The garbage collector handles the intermediate allocations efficiently for small to medium collections.

**Key takeaway:** Chain operations for readability, but know that each step creates an intermediate collection. For large data sets with multiple transformations, switch to sequences. Use `mapNotNull` instead of `map` + `filterNotNull` for a single-pass alternative.

### Lesson 4.3: Sequences for Lazy Evaluation

Sequences process elements lazily — one element at a time through the entire chain, creating no intermediate collections. They're Kotlin's answer to Java 8 Streams. The key difference between sequences and regular collections is the order of evaluation. Regular collections process all elements at each step (horizontal evaluation). Sequences process each element through all steps before moving to the next (vertical evaluation).

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

**Terminal vs intermediate operations** — Sequence operations are either intermediate (return another sequence) or terminal (trigger evaluation). `filter`, `map`, `flatMap` are intermediate — they build a chain of lazy transformations. `toList()`, `first()`, `count()`, `forEach()` are terminal — they execute the chain. Nothing happens until a terminal operation is called. This is the same model as Java Streams and Rx observables:

```kotlin
val sequence = listOf(1, 2, 3, 4, 5).asSequence()
    .filter {
        println("Filtering $it")
        it > 2
    }
    .map {
        println("Mapping $it")
        it * 10
    }
// Nothing printed yet! No terminal operation.

val result = sequence.toList()  // NOW the chain executes
// Output:
// Filtering 1
// Filtering 2
// Filtering 3
// Mapping 3     ← element 3 goes through entire chain
// Filtering 4
// Mapping 4     ← element 4 goes through entire chain
// Filtering 5
// Mapping 5     ← element 5 goes through entire chain
```

**Operation order matters with sequences** — Because sequences process elements one at a time, the order of operations can dramatically affect performance. Place `filter` before `map` to reduce the number of elements that need mapping:

```kotlin
// ❌ Inefficient — maps ALL elements, then filters
val result = items.asSequence()
    .map { it.expensiveTransform() }  // Runs on all 10,000 items
    .filter { it.isValid }
    .toList()

// ✅ Efficient — filters first, maps only what passes
val result = items.asSequence()
    .filter { it.isValid }           // Eliminates 8,000 items
    .map { it.expensiveTransform() } // Runs on only 2,000 items
    .toList()
```

**When to use sequences vs regular collections:**

- **Small collections (< 100 elements):** Regular collection operations. The overhead of sequence machinery isn't worth it.
- **Large collections with multiple chained operations:** Sequences. Avoid intermediate allocations.
- **Operations with early termination (`first`, `take`, `find`):** Sequences. They stop processing once the result is found.
- **Single operation:** Regular collections. No intermediate list problem with one operation.

**`generateSequence` and `sequence { }` builder** — Create infinite or computed sequences:

```kotlin
// generateSequence — simple infinite sequences
val naturals = generateSequence(1) { it + 1 }
val firstTenSquares = naturals.map { it * it }.take(10).toList()

// Fibonacci sequence
val fibonacci = generateSequence(Pair(0, 1)) { (a, b) -> Pair(b, a + b) }
    .map { it.first }
val first10 = fibonacci.take(10).toList()  // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]

// sequence builder — for complex logic with yield
val primes = sequence {
    yield(2)
    var candidate = 3
    while (true) {
        if ((2 until candidate).none { candidate % it == 0 }) {
            yield(candidate)
        }
        candidate += 2
    }
}
println(primes.take(10).toList())  // [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
```

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

**Key takeaway:** Sequences process elements one at a time through the entire chain, avoiding intermediate collection allocations. Use them for large data sets with multiple transformations or early termination operations. Place filters before maps for optimal performance. Use `generateSequence` and `sequence { }` for computed or infinite sequences.

### Lesson 4.4: Practical Collection Patterns

Beyond the basics, Kotlin provides specialized operations for common data manipulation patterns. These replace dozens of lines of manual loop code with single, descriptive function calls. Learning these patterns is what separates a Kotlin beginner from someone who writes truly idiomatic code.

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

**`fold` vs `reduce`** — `fold` takes an initial accumulator value and applies the operation. `reduce` uses the first element as the initial value. This means `reduce` throws on empty collections while `fold` returns the initial value:

```kotlin
val sum = listOf(1, 2, 3).fold(0) { acc, n -> acc + n }       // 6
val sum = listOf(1, 2, 3).reduce { acc, n -> acc + n }        // 6
val sum = emptyList<Int>().fold(0) { acc, n -> acc + n }       // 0
// emptyList<Int>().reduce { acc, n -> acc + n }               // ❌ Throws!

// Use fold when you need a different accumulator type
val csv = users.fold(StringBuilder()) { sb, user ->
    sb.append("${user.name},${user.email}\n")
}.toString()
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

**`chunked` for batch processing** — Essential for batch API calls, database insertions, or pagination:

```kotlin
// Process items in batches of 50
items.chunked(50).forEach { batch ->
    api.uploadBatch(batch)
}

// Transform chunks
val pages = items.chunked(20) { chunk ->
    Page(
        items = chunk,
        pageSize = chunk.size
    )
}
```

**`windowed` for time-series analysis:**

```kotlin
// 7-day moving average
val movingAverage = dailySales.windowed(7) { window ->
    window.average()
}

// Detect spikes — compare each value to the average of its neighbors
val spikes = values.windowed(3) { window ->
    val (prev, current, next) = window
    current > (prev + next) / 2 * 1.5
}
```

**`associate` vs `groupBy`** — `associate` creates a `Map` with one value per key (last writer wins if duplicates). `groupBy` creates a `Map<K, List<V>>` with all values per key. Know which one you need:

```kotlin
// associate — one value per key
val userById = users.associateBy { it.id }  // Map<Long, User>
val idToName = users.associate { it.id to it.name }  // Map<Long, String>

// groupBy — multiple values per key
val usersByCity = users.groupBy { it.city }  // Map<String, List<User>>
```

**Key takeaway:** Kotlin's collection API covers almost every data manipulation you'll need. Before writing a `for` loop, check if there's a collection function for it. `partition`, `chunked`, `windowed`, and `scan` are underrated tools. Use `fold` over `reduce` when the collection might be empty.

### Lesson 4.5: Map Operations

Maps are central to Kotlin programming — configuration, caching, grouping, and lookup patterns all rely on them. Kotlin provides both read-only `Map` and `MutableMap`, plus powerful transformation operations. Maps in Kotlin follow the same read-only vs mutable distinction as lists and sets.

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

**`getOrPut` — the caching workhorse** — This single function replaces the "check if exists, if not compute and store" pattern. It's atomic in the sense that the lambda runs only if the key is absent, and the result is both stored and returned:

```kotlin
// Common caching pattern
class ReflectionCache {
    private val cache = mutableMapOf<KClass<*>, List<KProperty1<*, *>>>()

    fun getProperties(klass: KClass<*>): List<KProperty1<*, *>> {
        return cache.getOrPut(klass) {
            klass.memberProperties.toList()
        }
    }
}

// Thread-safe version with ConcurrentHashMap
private val cache = ConcurrentHashMap<String, Bitmap>()
fun loadBitmap(url: String): Bitmap = cache.getOrPut(url) {
    BitmapFactory.decodeStream(URL(url).openStream())
}
```

**Destructuring in map operations** — Map entries can be destructured into key-value pairs, making transformations more readable:

```kotlin
// Destructuring in forEach
config.forEach { (key, value) ->
    println("$key = $value")
}

// Destructuring in map transformations
val formatted = userScores.map { (userId, score) ->
    "$userId scored $score points"
}

// Destructuring in filter
val highScorers = userScores.filter { (_, score) -> score > 1000 }
```

**Building complex maps:**

```kotlin
// groupBy + mapValues for aggregation
val categoryTotals = products
    .groupBy { it.category }
    .mapValues { (_, products) -> products.sumOf { it.price } }

// associateWith for "item to computed value" mappings
val nameLengths = names.associateWith { it.length }
// {"Alice"=5, "Bob"=3, "Charlie"=7}

// groupingBy for advanced aggregation
val countByCategory = products.groupingBy { it.category }.eachCount()
val maxByCategory = products.groupingBy { it.category }.reduce { _, a, b ->
    if (a.price > b.price) a else b
}
```

**Key takeaway:** Maps have a rich API beyond simple get/put. `getOrPut` is essential for caching patterns. `filterValues`/`filterKeys` and `mapValues`/`mapKeys` transform maps without manual iteration. Use destructuring for readable map operations.

### Lesson 4.6: Collection Performance Considerations

Not all collection operations have the same performance characteristics. Understanding the underlying data structures helps you make better choices. The difference between O(1) and O(n) for a `contains` check can mean the difference between a smooth UI and a janky one when processing thousands of items.

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

// ✅ Stops at first inactive user
val allActive = users.all { it.isActive }

// ✅ Stops at first matching element
val noErrors = results.none { it.isError }
```

**`first` vs `find`** — `first { }` throws if no match. `find { }` returns null. Prefer `find` unless you can guarantee a match exists. Same principle: `firstOrNull()` is safer than `first()`:

```kotlin
// ❌ Crashes if no active user exists
val firstActive = users.first { it.isActive }

// ✅ Returns null if no match
val firstActive = users.find { it.isActive }

// ✅ With fallback
val firstActive = users.find { it.isActive } ?: defaultUser
```

**`Set` for membership testing** — If you're checking `list.contains(item)` inside a loop, convert the list to a set first. `List.contains()` is O(n), `Set.contains()` is O(1):

```kotlin
// ❌ O(n²) — contains is O(n) on a list, called n times
val bookmarkedItems = items.filter { bookmarkedIds.contains(it.id) }

// ✅ O(n) — convert to Set first, contains is O(1)
val bookmarkedIdSet = bookmarkedIds.toSet()
val bookmarkedItems = items.filter { it.id in bookmarkedIdSet }
```

**Sorting considerations:**

```kotlin
// sortedBy creates a new list — use for immutable chains
val sorted = users.sortedBy { it.name }

// sortBy modifies in place — use for mutable lists
mutableUsers.sortBy { it.name }

// Multiple sort criteria with compareBy
val sorted = users.sortedWith(
    compareBy<User> { it.department }
        .thenByDescending { it.salary }
        .thenBy { it.name }
)
```

**Key takeaway:** Choose the right collection type for your access pattern. Use short-circuiting operations like `any`, `none`, `all` instead of `filter` + size checks. Prefer `sumOf` over `map` + `sum` for single-pass efficiency. Convert lists to sets when doing repeated membership checks.


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

Generics let you write code that works with any type while maintaining compile-time type safety. Without generics, you'd use `Any` with manual casts everywhere — which compiles fine but crashes at runtime with `ClassCastException`. Generics move the type checking from runtime to compile time, making your code both safer and more expressive.

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

**Type constraints** restrict which types can be used as type arguments. The upper bound `T : Comparable<T>` means only types that implement `Comparable` can be used. Without the constraint, you couldn't use comparison operators inside the function. The `where` clause allows multiple constraints — useful when building repository layers that need entities to be both persistable and identifiable:

```kotlin
// Multiple constraints in practice
interface Identifiable { val id: Long }
interface Cacheable { val cacheKey: String }

fun <T> cacheAndStore(item: T) where T : Identifiable, T : Cacheable {
    cache.put(item.cacheKey, item)
    database.save(item.id, item)
}

// The upper bound defaults to Any? — meaning T can be nullable
fun <T> singletonList(item: T): List<T> = listOf(item)  // T can be anything, including null

// Explicitly require non-null
fun <T : Any> nonNullSingletonList(item: T): List<T> = listOf(item)
// nonNullSingletonList(null)  // ❌ Compile error — T : Any excludes null
```

**Under the hood**, the JVM erases generic type information at runtime. A `List<String>` and a `List<Int>` compile to the same bytecode — both become `List` with `Object` references internally. This is called **type erasure**. The compiler verifies all type relationships at compile time and then throws away the type parameters. This is a JVM limitation inherited from Java's decision to add generics without changing the bytecode format (for backward compatibility with pre-generics code):

```kotlin
fun <T> isInstanceOf(value: Any): Boolean {
    // COMPILE ERROR: Cannot check for instance of erased type: T
    return value is T
}

// You also can't create arrays of generic types
// val array = Array<T>(10) { null }  // ❌ Error

// The workaround is to pass Class<T> explicitly
fun <T> isInstanceOf(value: Any, clazz: Class<T>): Boolean {
    return clazz.isInstance(value)
}

// Or use reified type parameters (covered in Lesson 5.5)
inline fun <reified T> isInstanceOf(value: Any): Boolean {
    return value is T  // ✅ Works with reified
}
```

**Generic extension functions** — Many of the standard library's most useful functions are generic extensions:

```kotlin
// Standard library examples
fun <T> T.also(block: (T) -> Unit): T { block(this); return this }
fun <T, R> T.let(block: (T) -> R): R = block(this)
fun <T> T.apply(block: T.() -> Unit): T { block(); return this }

// Custom generic extensions
fun <T : Comparable<T>> T.coerceIn(range: ClosedRange<T>): T = when {
    this < range.start -> range.start
    this > range.endInclusive -> range.endInclusive
    else -> this
}

fun <K, V> Map<K, V>.getOrThrow(key: K): V =
    get(key) ?: throw NoSuchElementException("Key not found: $key")
```

**Key takeaway:** Type constraints ensure generic code only accepts types with the capabilities you need. Use `where` for multiple constraints. Type erasure means generic types don't exist at runtime — Kotlin provides workarounds. The upper bound defaults to `Any?`, so use `T : Any` when null is not acceptable.

### Lesson 5.2: Variance — Covariance and Contravariance

Variance answers a deceptively simple question: if `Dog` is a subtype of `Animal`, is `List<Dog>` a subtype of `List<Animal>`? The answer depends entirely on what operations the generic type supports. Variance is the most intellectually challenging topic in generics, but it's also the most practical — understanding it prevents a whole class of type-safety bugs and enables more flexible APIs.

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

**Covariance (`out`)** — `Producer<out Dog>` is safely a `Producer<Animal>` because you're only ever getting values out, and a `Dog` is always a valid `Animal`. Think of a read-only repository — it hands you data, never takes it. Kotlin's `List<out E>` is covariant, which is why `List<String>` can be assigned to `List<Any>`. The `out` keyword is a promise to the compiler: "I will only ever return `T` from this class, never accept it as input."

**Contravariance (`in`)** — `Consumer<in Animal>` is safely a `Consumer<Dog>` because if it can handle any `Animal`, it can certainly handle a `Dog`. Think of a comparator — `Comparator<Animal>` can compare dogs just fine. Kotlin's `Comparable<in T>` is contravariant. The `in` keyword promises: "I will only ever accept `T` as input, never return it."

```kotlin
val dogProducer: EventProducer<Dog> = DogFactory()
val animalProducer: EventProducer<Animal> = dogProducer  // ✅ Covariant

val animalConsumer: EventConsumer<Animal> = AnimalProcessor()
val dogConsumer: EventConsumer<Dog> = animalConsumer  // ✅ Contravariant

// Why it's safe — reasoning through the types:
// If dogProducer gives me Dogs, and I treat them as Animals, that's fine.
// Dogs ARE Animals. Every property and method on Animal exists on Dog.

// If animalConsumer accepts any Animal, giving it a Dog is fine.
// Dog IS an Animal. The consumer's code works with Animal, Dog satisfies that.
```

**Real-world example — the Comparator pattern:**

```kotlin
// Comparator<Animal> can compare any animals, including dogs
val animalComparator = Comparator<Animal> { a, b -> a.name.compareTo(b.name) }

// Because Comparator is contravariant (in T), this assignment is valid
val dogComparator: Comparator<Dog> = animalComparator  // ✅

// Practical: sort dogs using an animal comparator
val dogs = listOf(Dog("Rex"), Dog("Buddy"))
dogs.sortedWith(animalComparator)  // Works because Comparator<in T>
```

**Key takeaway:** `out` means "I only give you T" (covariant, safe for reading). `in` means "I only take T from you" (contravariant, safe for writing). If you need both, the type is invariant and you lose the subtyping flexibility. Remember: Producer `out`, Consumer `in`.

### Lesson 5.3: Declaration-Site vs Use-Site Variance

**Declaration-site variance** is when you put `in` or `out` on the class or interface definition itself. You do this when you own the class and know it will always be a producer or always be a consumer. Kotlin's `List<out E>` is declaration-site — the Kotlin team knew `List` would never have add methods, so they declared it covariant once. Every use of `List` automatically gets the subtyping benefit.

This is one of the areas where Kotlin genuinely improves on Java. Java has no declaration-site variance — you have to use `? extends E` wildcards every single time at the call site. In Kotlin, you declare the variance once and forget about it.

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

**Comparison with Java wildcards:**

```kotlin
// Java:
// void copyAll(Collection<? extends E> source, Collection<? super E> target)

// Kotlin equivalent:
fun <E> copyAll(source: Collection<out E>, target: MutableCollection<in E>) {
    for (item in source) {
        target.add(item)
    }
}
```

**Rule of thumb:** If you control the class and it's purely a producer or consumer, use declaration-site. If you don't control the class or it's invariant but you only need one direction at a particular call site, use use-site. In practice, most variance in Kotlin is declaration-site because the standard library types already have the right variance annotations.

**Key takeaway:** Declaration-site variance declares the variance once on the class definition. Use-site variance applies it at specific call sites. Kotlin's approach is cleaner than Java's wildcards because `out` and `in` describe what `T` does.

### Lesson 5.4: Star Projection and the Nothing Type

**Star projection** (`*`) is the extreme version of use-site variance — you're projecting away all type information entirely. `MutableList<*>` means "a mutable list of some specific type that I don't know." It's Kotlin's equivalent of Java's `?` wildcard.

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

Star projection is most useful in reflection-heavy code, DI containers, and cases where you just need metadata about a generic object — checking its size, logging its class, passing it through without caring about the type argument. In production Android code, you encounter star projection most often when working with KClass references, type-erased callbacks, and generic utility functions:

```kotlin
// Common star projection use cases
fun logCollection(collection: Collection<*>) {
    println("Collection type: ${collection::class.simpleName}")
    println("Size: ${collection.size}")
    println("Empty: ${collection.isEmpty()}")
}

// Type-erased registry
private val adapters = mutableMapOf<KClass<*>, Adapter<*>>()

fun registerAdapter(klass: KClass<*>, adapter: Adapter<*>) {
    adapters[klass] = adapter
}
```

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

**`Nothing` vs `Unit` vs `Any`** — `Any` is the root of the type hierarchy (everything is `Any`). `Unit` means "returns nothing useful" (like Java's `void`). `Nothing` means "never returns" — a function with return type `Nothing` always throws an exception or loops forever. `Nothing` has no instances, which is why it's the bottom type:

```kotlin
// Any — supertype of everything
fun acceptAnything(value: Any) { /* ... */ }

// Unit — function returns, but the value is meaningless
fun logMessage(msg: String): Unit { println(msg) }

// Nothing — function NEVER returns normally
fun fail(message: String): Nothing = throw IllegalStateException(message)

// Nothing is useful for type inference
val result = map["key"] ?: fail("Key not found")
// Compiler knows fail() never returns, so result is non-null

// Nothing? has exactly one value: null
val nothing: Nothing? = null
```

**Key takeaway:** Star projection (`*`) means "I don't know or care about the type argument." `Nothing` is the bottom type that makes `emptyList()` work everywhere and lets `Error` states fit any `Result<T>`. `Nothing` functions never return — the compiler uses this fact for type narrowing.

### Lesson 5.5: Reified Type Parameters

Normally, generic types are erased at runtime. `reified` preserves the type information — but only works with `inline` functions. The compiler inlines the function body at every call site, substituting the actual type argument into the bytecode. This is the JVM's escape hatch from type erasure, and it's one of Kotlin's most unique features — no other JVM language offers this.

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

**Why `inline` is required** — `reified` only works with `inline` functions because that's how the compiler gets access to the actual type argument. It copies the function body into the caller, substituting the real type. At the call site, `T::class` becomes `User::class` — the type information is baked into the bytecode. A regular (non-inline) function exists as a single method in the bytecode that gets called from multiple places — there's no way to substitute different types at each call site.

```kotlin
// What the compiler does:
inline fun <reified T> isType(value: Any): Boolean = value is T

// When you call:
val isString = isType<String>("hello")

// The compiler generates (approximately):
val isString = "hello" is String  // T is replaced with String at the call site

// Another call:
val isInt = isType<Int>(42)

// Generates:
val isInt = 42 is Int  // T is replaced with Int at this call site
```

**Android use cases** — Reified types are used extensively in Jetpack and common Android patterns:

```kotlin
// Starting activities
inline fun <reified T : Activity> Context.startActivity(
    vararg extras: Pair<String, Any?>
) {
    val intent = Intent(this, T::class.java)
    extras.forEach { (key, value) ->
        when (value) {
            is String -> intent.putExtra(key, value)
            is Int -> intent.putExtra(key, value)
            is Boolean -> intent.putExtra(key, value)
            is Parcelable -> intent.putExtra(key, value)
        }
    }
    startActivity(intent)
}

// Usage
startActivity<ProfileActivity>("userId" to "123", "showEdit" to true)

// ViewModel creation
inline fun <reified T : ViewModel> Fragment.viewModels(): Lazy<T> = lazy {
    ViewModelProvider(this)[T::class.java]
}
```

**Limitations** — Reified only works on `inline` functions. You can't have a reified type parameter on a class, a non-inline function, or a virtual function. If you need a type reference that persists beyond the function call, you're back to `KClass<T>`. Also, reified type parameters can't be used for creating instances (`T()` is not allowed) — you still need a factory function or `Class<T>.newInstance()`.

**Key takeaway:** `reified` eliminates the `Class<T>` parameter pattern. It only works with `inline` functions because the function body is copied to the call site, where the actual type is known. This is the JVM's escape hatch from type erasure.

### Lesson 5.6: Advanced Generic Patterns

Real-world generics often require combining multiple features — constraints, variance, and reified types — into practical patterns. These patterns appear frequently in production Android code, library design, and framework internals.

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

The recursive bound `T : TypedEvent<T>` ensures each event type's `accept` method takes a handler typed to itself. This gives compile-time type safety across the entire dispatch system without any casts. The pattern is used in builder APIs, serialization frameworks, and event systems where type-safe dispatch is critical.

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

**Generic sealed class with extension functions** — Combining generics with sealed types creates powerful, type-safe result handling:

```kotlin
sealed interface Outcome<out S, out F> {
    data class Success<S>(val value: S) : Outcome<S, Nothing>
    data class Failure<F>(val error: F) : Outcome<Nothing, F>
}

fun <S, F, R> Outcome<S, F>.map(transform: (S) -> R): Outcome<R, F> = when (this) {
    is Outcome.Success -> Outcome.Success(transform(value))
    is Outcome.Failure -> this
}

fun <S, F, R> Outcome<S, F>.mapFailure(transform: (F) -> R): Outcome<S, R> = when (this) {
    is Outcome.Success -> this
    is Outcome.Failure -> Outcome.Failure(transform(error))
}

fun <S, F, R> Outcome<S, F>.flatMap(transform: (S) -> Outcome<R, F>): Outcome<R, F> = when (this) {
    is Outcome.Success -> transform(value)
    is Outcome.Failure -> this
}

// Usage — monadic chaining
val result = fetchUser(userId)
    .map { user -> user.profile }
    .flatMap { profile -> fetchAvatar(profile.avatarId) }
    .mapFailure { error -> error.toUserFriendlyMessage() }
```

**Key takeaway:** Advanced generic patterns combine constraints, variance, and reified types for powerful, type-safe APIs. Self-bounded types give compile-time safety for dispatch systems. Reified factory patterns eliminate `Class<T>` boilerplate. Generic sealed classes enable type-safe result chaining.


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

SAM stands for Single Abstract Method. A `fun interface` in Kotlin declares an interface with exactly one abstract method, enabling lambda expressions as implementations. This is what makes Android's callback APIs clean in Kotlin. Without SAM conversion, every callback would require verbose `object : Interface { override fun method() { } }` syntax.

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

**`fun interface` vs regular interface** — The `fun` keyword enables SAM conversion, meaning the interface can be instantiated with a lambda expression. Regular interfaces cannot. This is a deliberate restriction — if an interface has multiple abstract methods, a lambda wouldn't know which method to implement:

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

**When to use `fun interface` vs function types** — Use `fun interface` when you want a named, self-documenting type that communicates intent beyond just the signature. A `Mapper<UserDto, User>` is more descriptive than `(UserDto) -> User`. Use raw function types for simple, one-off lambdas where the name wouldn't add value. In practice, `fun interface` is also useful when you need the interface to carry additional default or non-abstract methods:

```kotlin
fun interface Transformer<I, O> {
    fun transform(input: I): O

    // Default method — provides additional functionality
    fun transformAll(inputs: List<I>): List<O> = inputs.map { transform(it) }
}

val uppercaser = Transformer<String, String> { it.uppercase() }
val results = uppercaser.transformAll(listOf("hello", "world"))
// ["HELLO", "WORLD"]
```

**Under the hood**, SAM conversion for Kotlin `fun interface` creates an anonymous class that implements the interface. For Java SAM interfaces, the Kotlin compiler can use `invokedynamic` on newer JVM targets, which is more efficient — the JVM generates the implementation at runtime without an explicit class file. The `invokedynamic` approach avoids generating a separate `.class` file for each lambda, reducing the APK/JAR size.

**Functional interfaces in Android architecture:**

```kotlin
// Click handler with SAM conversion
fun interface OnItemClickListener<T> {
    fun onItemClicked(item: T)
}

class UserAdapter(
    private val onItemClick: OnItemClickListener<User>
) : RecyclerView.Adapter<UserAdapter.ViewHolder>() {
    // ...
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val user = users[position]
        holder.itemView.setOnClickListener { onItemClick.onItemClicked(user) }
    }
}

// Clean usage with SAM conversion
val adapter = UserAdapter { user ->
    navigateToProfile(user.id)
}
```

**Key takeaway:** `fun interface` enables SAM conversion — lambda expressions for single-method interfaces. This powers most of Android's callback-based APIs and creates cleaner, more readable code than anonymous object expressions. Use `fun interface` for named, self-documenting types; use raw function types for simple callbacks.

### Lesson 6.2: Inline Functions — Eliminating Lambda Overhead

Every time you pass a lambda to a higher-order function, the compiler generates an anonymous class for that lambda. If the function is called in a loop or a hot path, you're allocating a new object on every invocation. The `inline` keyword eliminates this entirely — the compiler copies the function body and the lambda body directly into the call site. No anonymous class, no object allocation, no virtual method call.

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

**How it works in bytecode** — When you call `measureTimeInline { expensiveOperation() }`, the compiler doesn't generate a function call. Instead, it copies the body of `measureTimeInline` directly into the calling function's bytecode, with the lambda body substituted in place. No `Function` object, no virtual method call, no allocation:

```kotlin
// What you write:
val result = measureTimeInline {
    database.query("SELECT * FROM users")
}

// What the compiler generates (approximately):
val start = System.nanoTime()
val result = database.query("SELECT * FROM users")
println("Took ${System.nanoTime() - start}ns")
```

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

// This is why you can use return inside forEach
fun processUsers(users: List<User>) {
    users.forEach { user ->
        if (user.isBanned) return  // Returns from processUsers, not just the lambda
        processUser(user)
    }
}

// To return from just the lambda, use a labeled return
fun processAllUsers(users: List<User>) {
    users.forEach { user ->
        if (user.isBanned) return@forEach  // Skips this user, continues loop
        processUser(user)
    }
}
```

**When NOT to inline** — Don't inline large functions. `inline` copies the function body to every call site. A 50-line inline function called in 20 places adds 1,000 lines to your bytecode. Only inline small, frequently-called higher-order functions. The IDE will warn you if you use `inline` on a function that doesn't have lambda parameters — in that case, the performance benefit is negligible and you're just bloating the bytecode.

```kotlin
// ✅ Good candidate for inline — small, takes lambda, called frequently
inline fun <T> withLock(lock: Lock, action: () -> T): T {
    lock.lock()
    try { return action() }
    finally { lock.unlock() }
}

// ❌ Bad candidate — large function body, every call site gets all this code
inline fun processData(input: String, transform: (String) -> String): Result {
    // 50 lines of parsing, validation, transformation...
    // This entire body gets copied to EVERY call site
}
```

**Key takeaway:** `inline` copies the function body and lambda to the call site, eliminating allocation. Use it for small, frequently-called higher-order functions. The standard library inlines all scope functions and most collection operations. Non-local returns are possible in inline lambdas because the lambda becomes part of the calling function.

### Lesson 6.3: noinline and crossinline

`noinline` and `crossinline` are modifiers for lambda parameters of inline functions that handle edge cases where full inlining isn't possible or safe.

**`noinline`** — If you need to store a lambda in a field or pass it to a non-inline function, you mark that parameter `noinline`. It opts that specific parameter out of inlining so it can be treated as a regular object. Without `noinline`, you'd get a compile error because an inlined lambda doesn't exist as an object — it's been pasted into the bytecode:

```kotlin
inline fun execute(
    setup: () -> Unit,
    noinline onComplete: () -> Unit  // Can be stored, passed around
) {
    setup()  // This lambda is inlined
    scheduleCallback(onComplete)  // This one is passed as an object
}

// noinline is required when storing the lambda
inline fun registerCallback(
    noinline callback: (Result) -> Unit  // Must be noinline to store
) {
    callbackList.add(callback)  // Storing requires an object
}
```

**`crossinline`** — When a lambda is passed into a different execution context (like a `Runnable` or an `object` expression), non-local returns would be unsafe. `crossinline` prohibits them while still allowing the lambda body to be inlined. The lambda code is still pasted at the call site (avoiding allocation), but `return` is not allowed because the return would try to exit a function that may have already returned:

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
- **`noinline`:** Lambda needs to be stored, returned, or passed to a non-inline function. Becomes a regular `Function` object with allocation overhead.
- **`crossinline`:** Lambda is inlined but executed in a different context. Non-local returns are prohibited for safety. The lambda code is still inlined (no allocation).

**Under the hood — the three modes in bytecode:**

```kotlin
inline fun demo(
    normalBlock: () -> Unit,           // Inlined, non-local returns OK
    crossinline crossBlock: () -> Unit, // Inlined, no non-local returns
    noinline noBlock: () -> Unit        // NOT inlined, becomes Function0 object
) {
    normalBlock()           // Code pasted here directly
    thread { crossBlock() } // Code pasted inside thread lambda
    scheduleCallback(noBlock) // Passed as Function0 object
}
```

**Common mistake:** Inlining large functions. `inline` copies the function body to every call site. A 50-line inline function called in 20 places adds 1,000 lines to your bytecode. Only inline small, frequently-called higher-order functions. The compiler will emit a warning if you mark a function `inline` when it has no lambda parameters.

**Key takeaway:** `noinline` lets you store or pass a lambda as an object. `crossinline` prevents non-local returns in lambdas that execute in a different context. Use these when the compiler tells you to — they solve specific edge cases in inline function design.

### Lesson 6.4: Contracts

Contracts tell the compiler facts about function behavior that it can't infer on its own. They enable smart casts after custom check functions and inform the compiler about how many times a lambda parameter is called. Contracts are currently experimental but are used extensively in the standard library.

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

The standard library uses contracts extensively. `require()`, `check()`, `run()`, `apply()`, `also()`, `let()` all have contracts that enable smart casts and variable initialization. The `EXACTLY_ONCE` contract is why you can declare a `val` and initialize it inside a `run {}` block.

**Custom boolean check functions:**

```kotlin
@OptIn(ExperimentalContracts::class)
fun isValidUser(user: User?): Boolean {
    contract {
        returns(true) implies (user != null)
    }
    return user != null && user.name.isNotBlank()
}

fun greetUser(user: User?) {
    if (isValidUser(user)) {
        // user is smart-cast to User (non-null)
        println("Hello, ${user.name}")  // ✅ No null check needed
    }
}
```

**Invocation kinds:**

```kotlin
// EXACTLY_ONCE — lambda runs exactly once (run, apply, let, with, also)
// AT_MOST_ONCE — lambda runs zero or one time (?.let)
// AT_LEAST_ONCE — lambda runs one or more times (repeat with n >= 1)
// UNKNOWN — no guarantee (default)
```

**Key takeaway:** Contracts tell the compiler facts about function behavior. The `returns() implies` form enables smart casts after custom checks. The `callsInPlace` form enables variable initialization inside lambdas. They're experimental but already used throughout the standard library.

### Lesson 6.5: Lambdas with Receivers

Lambdas with receivers are the bridge between regular lambdas and DSLs. A lambda with receiver `T.() -> R` can call methods on the receiver object directly without qualification — just like an extension function. This is the single most important feature enabling Kotlin DSLs. Every Compose composable, every Gradle build script, and every Ktor route definition relies on this.

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

**The power of receiver lambdas** — Inside the lambda, `this` refers to the receiver object, so you can call its methods directly. This creates a scoped context where the builder's methods are available without qualification. Combined with IDE autocomplete, this means the developer gets a guided, type-safe API that feels like a custom language:

```kotlin
class NotificationBuilder {
    var title = ""
    var body = ""
    var priority = Priority.NORMAL
    private val actions = mutableListOf<Action>()

    fun action(label: String, intent: PendingIntent) {
        actions.add(Action(label, intent))
    }

    fun build(): Notification { /* ... */ }
}

fun notification(block: NotificationBuilder.() -> Unit): Notification {
    return NotificationBuilder().apply(block).build()
}

// Usage — inside the block, 'this' is NotificationBuilder
val notif = notification {
    title = "New Message"           // this.title = "New Message"
    body = "You have 3 unread..."    // this.body = "You have 3 ..."
    priority = Priority.HIGH         // this.priority = Priority.HIGH
    action("Reply", replyIntent)     // this.action("Reply", replyIntent)
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

**Key takeaway:** Lambdas with receivers (`T.() -> Unit`) make `this` available inside the lambda, enabling natural-language-like APIs. This is the mechanism behind `apply`, `run`, `with`, and all Kotlin DSLs. It's the most important building block for Kotlin's DSL ecosystem.

### Lesson 6.6: Type Aliases

Type aliases create alternative names for existing types. They don't create new types — they're purely for readability and reducing repetition of complex generic types. Think of them as `typedef` in C/C++ or type aliases in TypeScript.

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

**Type aliases vs value classes** — Type aliases don't provide type safety. `typealias UserId = Long` and `typealias OrderId = Long` are interchangeable — the compiler treats them as the same type. For type safety, use `@JvmInline value class UserId(val value: Long)`. Type aliases are for readability, value classes are for safety:

```kotlin
// ❌ Type alias — no type safety
typealias UserId = Long
typealias OrderId = Long
fun findUser(id: UserId): User? { /* ... */ }
fun findOrder(id: OrderId): Order? { /* ... */ }
findUser(orderId)  // ✅ Compiles — they're both Long!

// ✅ Value class — type safe
@JvmInline value class UserId(val value: Long)
@JvmInline value class OrderId(val value: Long)
fun findUser(id: UserId): User? { /* ... */ }
// findUser(orderId)  // ❌ Compile error — different types
```

**When type aliases are useful:**

```kotlin
// Complex function types
typealias OnUserSelected = (User, Int) -> Unit
typealias Middleware<S, A> = (store: Store<S>, next: (A) -> Unit, action: A) -> Unit

// Platform-specific types
typealias AndroidColor = android.graphics.Color
typealias ComposeColor = androidx.compose.ui.graphics.Color

// Generic type shorthand
typealias StringMap = Map<String, String>
typealias UserCache = MutableMap<UserId, User>
```

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

A Kotlin DSL is built from three core ingredients: receiver lambdas (`T.() -> Unit`), builder classes, and a top-level entry function. The receiver lambda sets `this` to the builder, so you can call its methods directly without qualification. Understanding these three components means you can build DSLs for any domain — network requests, UI layouts, data validation, test fixtures, or configuration files.

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

**Why this works:** Inside the `html { }` block, `this` is an `HtmlBuilder`. So `h1(...)` is actually `this.h1(...)`. Inside the `ul { }` block, `this` is a `UlBuilder`. The nesting mirrors the structure of the output, making the DSL intuitive to read and write. The IDE provides autocomplete for the builder's methods, so developers discover the API as they type.

**Under the hood**, the `html { }` call creates an `HtmlBuilder` instance, passes the lambda as a receiver function, and calls `build()` on the result. No special compiler magic — it's just regular Kotlin features composed together. The lambda with receiver is the key ingredient that makes the syntax clean.

**Real-world DSL patterns:** Gradle's `build.gradle.kts` uses this exact pattern. `dependencies { implementation("...") }` works because `dependencies` is a function that takes a `DependencyHandlerScope.() -> Unit` lambda. Ktor's routing uses `routing { get("/users") { } }`. Compose uses `Column { Text("Hello") }`. Every Android developer uses DSLs daily — understanding how they work demystifies these tools.

**Key takeaway:** DSLs use receiver lambdas (`Type.() -> Unit`) to create scoped, readable APIs. The builder pattern provides the structure, receiver lambdas provide the clean syntax. Three ingredients: builder class, receiver lambda, top-level entry function.

### Lesson 7.2: The @DslMarker Annotation

Without `@DslMarker`, nested DSL blocks can accidentally access methods from outer receivers. This creates subtle bugs and confusing behavior. `@DslMarker` prevents scope leaking by restricting access to only the nearest scope's receiver. This is a critical safety mechanism for any production DSL.

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

**How it works:** All classes annotated with the same `@DslMarker` annotation form a "scope group." Inside a lambda whose receiver belongs to that group, you can only access members of the innermost receiver. To explicitly access an outer receiver, you use a qualified `this@OuterBuilder.method()`. This explicit qualification makes the intent clear — you're deliberately reaching outside your scope:

```kotlin
// With @DslMarker, accessing outer scope requires explicit qualification
val req = request {
    url = "https://api.example.com/users"
    headers {
        "Content-Type" to "application/json"
        // To access outer scope explicitly:
        this@request.url = "modified"  // ✅ Explicit — intent is clear
    }
}
```

**This is what makes Compose safe:** Compose uses `@ComposableDsl` internally. Inside a `Row { }`, you can't accidentally call `Column`-specific modifiers from the enclosing `Column { }` scope. Without `@DslMarker`, scope leaking in Compose would cause layout bugs that are extremely hard to diagnose.

**Key takeaway:** `@DslMarker` prevents scope leaking — you can't accidentally access outer scope receivers inside nested DSL blocks. Always use it in production DSLs. This is what makes Compose's `Column { Row { } }` safe.

### Lesson 7.3: Building Real-World DSLs

Let's build a practical DSL for configuring network requests — something you'd actually use in a production Android app. Real-world DSLs differ from tutorial examples in that they need validation, sensible defaults, and clear error messages when misconfigured.

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

**Key takeaway:** Production DSLs combine builder classes, receiver lambdas, `@DslMarker`, and data classes. They provide type-safe, readable APIs that mirror the structure of the domain they represent. Add validation in builders with `require()`.

### Lesson 7.4: DSL Techniques — Infix, Operators, and Property Delegates

Advanced DSL techniques make the syntax even more natural by leveraging Kotlin's infix functions, operator overloading, and property delegation. These techniques transform code that reads like API calls into code that reads like a specification or a configuration language.

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

**Property delegates in DSLs** — Delegates can intercept property access and modification, enabling automatic tracking, validation, and registration:

```kotlin
@DslMarker
annotation class FormDsl

@FormDsl
class FormBuilder {
    private val fields = mutableMapOf<String, FieldConfig>()

    fun <T> field(
        name: String,
        default: T,
        validator: (T) -> Boolean = { true }
    ): ReadWriteProperty<FormBuilder, T> = object : ReadWriteProperty<FormBuilder, T> {
        var value = default
        override fun getValue(thisRef: FormBuilder, property: KProperty<*>) = value
        override fun setValue(thisRef: FormBuilder, property: KProperty<*>, value: T) {
            this.value = value
            fields[name] = FieldConfig(name, value, validator(value))
        }
    }
}
```

**Key takeaway:** Infix functions, operator overloading, and property delegates make DSL syntax more natural. Use them to create domain-specific vocabulary that reads like a specification rather than code. Combine multiple techniques for the most expressive DSLs.

### Lesson 7.5: Gradle and Compose — DSLs You Already Use

Understanding DSLs demystifies two tools every Android developer uses daily: Gradle build scripts and Jetpack Compose. Both are Kotlin DSLs that use receiver lambdas, builder patterns, and scope markers.

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

`Column { }` takes a `@Composable ColumnScope.() -> Unit` lambda. Inside it, `this` is a `ColumnScope`, which provides column-specific modifiers. This is a DSL built with receiver lambdas and `@DslMarker`-style scoping. Understanding this means Compose is no longer magical — it's predictable, debuggable Kotlin.

**Modifier chains as a DSL** — Compose's `Modifier` chain is itself a DSL pattern using extension functions and the builder pattern:

```kotlin
// Modifier is a chain of extension functions
val modifier = Modifier
    .fillMaxWidth()          // Extension function returning new Modifier
    .padding(16.dp)          // Chained extension
    .background(Color.White) // Another extension
    .clickable { onClick() } // Lambda parameter
```

**Key takeaway:** Gradle and Compose are Kotlin DSLs. Understanding receiver lambdas, builder patterns, and scope markers makes both tools less magical and more understandable. When you encounter confusing Compose or Gradle behavior, think about it as regular Kotlin code with receiver lambdas.


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

Idiomatic Kotlin isn't just about writing code that works — it's about writing code that communicates intent. These conventions are distilled from years of production Android development and code reviews. Following them means your code is immediately readable to any Kotlin developer without needing comments to explain what it does.

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

**`require()` vs `check()` vs `assert()`** — `require()` throws `IllegalArgumentException` for bad input from callers. `check()` throws `IllegalStateException` for invalid internal state. `assert()` is for development-time checks that can be disabled. Use `require` at function entry points, `check` for state invariants, and `error()` when something should never happen:

```kotlin
fun processPayment(payment: Payment) {
    // require — validates caller input
    require(payment.amount > 0) { "Amount must be positive" }
    require(payment.currency in supportedCurrencies) {
        "Unsupported currency: ${payment.currency}"
    }

    // check — validates internal state
    check(isInitialized) { "PaymentProcessor not initialized" }
    check(!isShutdown) { "PaymentProcessor has been shut down" }

    // error — for impossible states
    val gateway = when (payment.method) {
        PaymentMethod.CARD -> cardGateway
        PaymentMethod.BANK -> bankGateway
        else -> error("Unsupported payment method: ${payment.method}")
    }
}
```

**Naming conventions:**

```kotlin
// Boolean properties and functions as questions
val isVisible: Boolean
val hasErrors: Boolean
fun canProcess(): Boolean
fun shouldRetry(): Boolean

// Factory functions named like constructors
fun Color(hex: String): Color = Color.parseHex(hex)
fun CoroutineScope(context: CoroutineContext): CoroutineScope = /* ... */

// Extension function naming — verb phrases
fun String.toSlug(): String
fun List<User>.sortedByName(): List<User>
fun View.fadeIn(duration: Long = 300L)
```

**Key takeaway:** Idiomatic Kotlin is about clarity of intent. `require()` says "your input is wrong." `check()` says "the state is wrong." Expression bodies say "this is a simple transformation." Each convention communicates something specific to the reader.

### Lesson 8.2: Common Mistakes and Anti-Patterns

These are patterns I've seen repeatedly in code reviews — code that compiles and works but is fragile, unreadable, or subtly broken. Knowing these anti-patterns saves you from bugs that only surface in production.

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

// ✅ In coroutines, re-throw CancellationException
try {
    fetchData()
} catch (e: CancellationException) {
    throw e  // Must re-throw for coroutine cancellation to work
} catch (e: Exception) {
    handleError(e)
}
```

**Anti-pattern: Creating unnecessary wrapper objects in hot paths:**

```kotlin
// ❌ Allocates Pair on every call
fun getMinMax(list: List<Int>): Pair<Int, Int> {
    return Pair(list.min(), list.max())
}

// ✅ For hot paths, use out parameters or a dedicated data class
data class MinMax(val min: Int, val max: Int)
fun getMinMax(list: List<Int>) = MinMax(list.min(), list.max())
```

**Key takeaway:** Every `!!` is a potential crash. Every mutable data class is a potential shared-state bug. Every platform type leak is a ticking time bomb. Write defensively at system boundaries and idiomatically everywhere else.

### Lesson 8.3: How Kotlin Compiles — Under the Hood

Understanding what the Kotlin compiler produces helps you write more informed code. Kotlin compiles to JVM bytecode that runs identically to Java bytecode — the JVM doesn't know the difference. Knowing this mapping helps you reason about performance, predict Java interop behavior, and debug issues using JVM tools.

**The compilation pipeline:**

Kotlin source code (`.kt` files) → Kotlin compiler (`kotlinc`) → Java bytecode (`.class` files) → JVM execution. The Kotlin compiler and Java compiler both produce the same bytecode format. This is why Kotlin and Java can interoperate seamlessly — they speak the same bytecode language. You can view the bytecode of any Kotlin file in Android Studio via Tools → Kotlin → Show Kotlin Bytecode, then click "Decompile" to see the equivalent Java code.

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

// With inline, the lambda body is pasted at the call site — no class
inline fun execute(block: () -> Unit) { block() }
execute { println("hello") }
// Compiles to just: System.out.println("hello")
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

**Null safety → runtime checks:**

```kotlin
// Kotlin
fun greet(name: String) { println("Hello, $name") }

// Compiles to (approximately):
// public static void greet(String name) {
//     Intrinsics.checkNotNullParameter(name, "name");
//     System.out.println("Hello, " + name);
// }
```

**Key takeaway:** Kotlin compiles to standard JVM bytecode. Properties become getter/setter methods. Extension functions become static methods. Companion objects become static inner classes. Lambdas become `Function` objects unless inlined. Understanding this mapping helps you reason about performance and Java interop.

### Lesson 8.4: Kotlin and Java Interop

Kotlin is designed for seamless Java interoperability. But there are annotations and patterns that make the bridge cleaner, especially when your Kotlin code is called from Java. In a mixed Kotlin-Java codebase, these annotations are essential.

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

**@JvmName for resolving clashes** — Kotlin allows functions with the same JVM signature if they differ only in Kotlin type arguments (which are erased). `@JvmName` resolves the conflict:

```kotlin
// These would clash at the bytecode level without @JvmName
fun List<String>.filterStrings(): List<String> = filter { it.isNotBlank() }

@JvmName("filterInts")
fun List<Int>.filterInts(): List<Int> = filter { it > 0 }
```

**Key takeaway:** Use `@Jvm*` annotations when your Kotlin code needs to be called from Java. In pure-Kotlin projects, you don't need them. Always treat Java return values as potentially nullable. Add nullability annotations to your Java code for better Kotlin interop.

### Lesson 8.5: Performance Considerations

Performance in Kotlin is about knowing what the compiler does behind the scenes and making informed choices. Most of the time, readability wins. But in hot paths — per-frame rendering, large data processing, tight loops — these details matter. The key principle is: measure before optimizing. If you can't demonstrate a performance difference with benchmarks, keep the readable version.

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

**Avoiding autoboxing in generics** — Because JVM generics use type erasure and work with `Object`, any primitive used as a generic type argument must be boxed. This is why `List<Int>` stores `Integer` objects, not `int` primitives. For performance-critical numeric collections, use specialized containers:

```kotlin
// ❌ Boxing overhead — each Int is boxed to Integer
val numbers: List<Int> = listOf(1, 2, 3, 4, 5)

// ✅ No boxing — raw int array
val numbers = intArrayOf(1, 2, 3, 4, 5)

// Android-specific: SparseArray avoids boxing of keys
val map = SparseIntArray()  // int keys, int values, no boxing
map.put(1, 100)
map.put(2, 200)
```

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

**String operations in hot paths:**

```kotlin
// ❌ Creates new String object on each +=
var result = ""
for (item in items) result += "$item, "  // O(n²)

// ✅ Single StringBuilder
val result = buildString {
    for (item in items) append(item).append(", ")
}

// ✅ Or use joinToString
val result = items.joinToString(", ")
```

**When to optimize:**

- **Hot-path library code** (Compose internals, image processing): Every allocation and branch matters
- **Performance-sensitive app code** (DiffUtil, large list processing): Profile first, optimize second
- **Everything else** (login flow, settings screen): Optimize for readability

**Key takeaway:** `const val` for compile-time constants. `IntArray` over `List<Int>` for large numeric data. `buildString` over `+=` in loops. Profile before optimizing — if you can't measure the difference, keep the readable version.

### Lesson 8.6: Error Handling Patterns

Kotlin offers multiple approaches to error handling beyond try-catch. Understanding when to use each one makes your error handling clearer and more composable. The right error handling strategy depends on your layer — preconditions at boundaries, sealed classes for domain errors, `Result` for functional composition.

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

**Sealed class error modeling** — When errors carry different data and you want exhaustive handling:

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

**Choosing the right approach:**

```kotlin
// Preconditions — use require/check at function boundaries
fun transferMoney(from: Account, to: Account, amount: Double) {
    require(amount > 0) { "Amount must be positive" }
    check(from.balance >= amount) { "Insufficient funds" }
}

// Result — use for operations that can fail in expected ways
suspend fun loadUser(id: String): Result<User> = runCatching {
    api.getUser(id)
}

// Sealed classes — use when different errors need different handling
sealed interface LoadResult<out T> {
    data class Success<T>(val data: T) : LoadResult<T>
    data class NotFound(val id: String) : LoadResult<Nothing>
    data class NetworkError(val cause: IOException) : LoadResult<Nothing>
    data class Unauthorized(val message: String) : LoadResult<Nothing>
}
```

**Key takeaway:** Use `require`/`check` for preconditions, `runCatching`/`Result` for functional error handling, and sealed classes when errors carry different data. Choose the pattern that best fits your layer — preconditions at boundaries, `Result` in repositories, sealed errors in domain logic.

### Lesson 8.7: `==` vs `===`, Any, Unit, and Nothing

These fundamental concepts are frequently asked in interviews and often misunderstood. Understanding them deeply gives you a solid foundation for reasoning about Kotlin's type system and equality semantics.

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

`==` in Kotlin is equivalent to `equals()` in Java. `===` checks if two references point to the exact same object in memory. For `data class` instances, `==` compares all properties (auto-generated `equals()`). For regular classes, `==` checks reference equality by default unless `equals()` is overridden. Kotlin also handles null correctly: `null == null` is `true`, and `null == anyObject` is `false` — no `NullPointerException`.

**Important subtlety with primitives** — For boxed types (nullable primitives), `===` can surprise you:

```kotlin
val a: Int = 127
val b: Int = 127
println(a === b)  // true — JVM caches Integers -128 to 127

val c: Int = 128
val d: Int = 128
println(c === d)  // false — beyond cache range, different objects

// For non-nullable Int, this doesn't matter — they use primitive int
val e: Int = 128
val f: Int = 128
println(e == f)   // true — always use == for value comparison
```

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

**The relationship between Any, Unit, Nothing, and null:**

```kotlin
// Any — supertype of all non-nullable types
// Any? — supertype of ALL types (including nullable)
// Nothing — subtype of all types (has no instances)
// Nothing? — has exactly one value: null

// This is why emptyList<T>() works for any T:
fun <T> emptyList(): List<T> = EmptyList  // Returns List<Nothing>
// List<Nothing> is a subtype of List<T> for any T (covariance)

// Unit is a real object
val unit: Unit = Unit
println(unit)  // kotlin.Unit
// Unit inherits from Any
val any: Any = Unit  // ✅
```

**Key takeaway:** `==` checks structural equality (content), `===` checks referential equality (same object). `Any` is the root type, `Unit` replaces `void`, and `Nothing` means "this function never returns normally." Use `==` for all value comparisons — `===` is only needed when you specifically care about object identity.


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

