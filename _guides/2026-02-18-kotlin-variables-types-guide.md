---
title: Kotlin Variables, Types, and Type Inference Guide
layout: post
sequence: 84
categories: post
tags:
  - Kotlin
  - Android
---

When I moved from Java to Kotlin, the first thing that struck me wasn't coroutines or extension functions — it was how differently I started thinking about variable declarations. In Java, every line was `final String name = "Mukul"` or `int count = 0`, and most teams I worked on didn't even bother with `final` because it was verbose and nobody enforced it. Kotlin flipped that around. The language nudges you toward immutability by default, and the type system does so much work behind the scenes that you barely think about it after a while. But that invisible work is exactly what's worth understanding.

The reframe moment for me was realizing that Kotlin's type system isn't just syntactic sugar over Java's. It's a fundamentally different contract between you and the compiler. When you write `val name = "Mukul"`, you're not just saving keystrokes by skipping the type annotation — you're letting the compiler prove something about your code at compile time that Java couldn't. And when you write `Int?` instead of `Int`, you're opting into a completely different JVM representation with real memory and performance consequences. Once I started seeing the bytecode implications behind every declaration, my code got both safer and more intentional.

This guide covers the core building blocks — variables, types, inference, nullability, and initialization patterns — with the JVM details that I think every Android engineer should internalize.

## val vs var — Reference Immutability

Default to `val`. In every codebase I've worked on, somewhere between 80% and 90% of local variables and properties end up as `val`, and that's exactly where you want to be. A `val` declaration compiles to a private final field with a generated getter method. A `var` compiles to a private field with both a getter and a setter. That extra setter isn't just bytecode overhead — it's a signal that this value changes, and changes are where bugs live.

Here's the thing that trips people up early: `val` means the **reference** is read-only, not that the **object** is immutable. This is a crucial distinction that I've seen cause real production bugs.

```kotlin
val users = mutableListOf("Alice", "Bob")
users.add("Charlie") // compiles fine — the list content changed, not the reference

// val users = listOf("Alice", "Bob", "Charlie") // reassignment won't compile
```

The `users` reference can never point to a different list, but the list itself can be mutated freely. If you want true immutability, you need both `val` and an immutable collection type like `List<T>` instead of `MutableList<T>`. I've seen teammates write `val` and assume the data is thread-safe. It's not. The reference is final, but the object behind it can still be modified by any thread.

If you decompile a simple Kotlin class with `val` and `var` properties, the bytecode difference is clear. A `val name: String` produces a `private final` field and a `getName()` method. A `var counter: Int` produces a `private` field (no `final`), a `getCounter()`, and a `setCounter(int)`. The JVM's JIT compiler can also optimize final fields more aggressively — it knows the value won't change after construction, so it can inline reads and skip memory barriers in certain cases. This is a small but real benefit that compounds across a large codebase.

## Type Inference — How the Compiler Figures It Out

Kotlin uses a bidirectional type inference system inspired by Hindley-Milner style algorithms. In practice, this means the compiler can determine the type of a variable from its initializer expression, function return types from their body, and generic type parameters from how they're used — all without you writing a single type annotation.

```kotlin
val name = "Mukul"           // inferred as String
var counter = 0              // inferred as Int
val ratio = 3.14             // inferred as Double
val active = true            // inferred as Boolean
val tags = listOf("Kotlin", "Android")  // inferred as List<String>
```

The compiler does forward propagation (inferring from the right-hand side) and backward propagation (inferring from expected types). When you pass a lambda to a function that expects `(String) -> Boolean`, the compiler knows the lambda parameter is a `String` without you declaring it. This cascading inference is what makes Kotlin code feel concise without sacrificing type safety.

But there's a rule I follow: **add explicit types when the initializer doesn't make the type obvious.** If you're calling a function that returns some complex generic type, or if you're doing a computation where the resulting type isn't immediately clear to a human reader, annotate it. The compiler always knows, but your code reviewer might not. I also always annotate public API return types — the Kotlin style guide recommends this, and it prevents accidental API breakage when you refactor the function body.

```kotlin
// Type is obvious — skip annotation
val userId = "usr_12345"
val retryCount = 3

// Type is NOT obvious — annotate
val config: NetworkConfig = buildConfig(environment)
val transformer: (RawEvent) -> AnalyticsEvent = createEventMapper()

// Public API — always annotate
fun fetchUser(id: String): Flow<UserState> {
    // ...
}
```

One thing worth noting: type inference happens entirely at compile time. There's zero runtime cost. The emitted bytecode is identical whether you wrote `val name: String = "Mukul"` or `val name = "Mukul"`. The compiler erases the inference machinery and produces the same typed instructions either way.

## Numeric Types and No Implicit Conversions

Kotlin has a clean numeric hierarchy: `Byte` (8-bit), `Short` (16-bit), `Int` (32-bit), `Long` (64-bit), `Float` (32-bit), and `Double` (64-bit). These map directly to JVM primitives on the bytecode level. But unlike Java, Kotlin does **not** perform implicit widening conversions. You can't assign an `Int` to a `Long` without an explicit call.

```kotlin
val pixels: Int = 1920
// val screenWidth: Long = pixels   // won't compile
val screenWidth: Long = pixels.toLong()  // explicit conversion required

val fileSize: Long = 2_147_483_648L
val percentage: Double = 0.85
val sensorReading: Float = 36.6f
```

This caught me off guard coming from Java, where `int` silently widens to `long` everywhere. Kotlin's designers made this decision intentionally — implicit conversions are a source of subtle bugs, especially when dealing with integer overflow. Each conversion call (`.toInt()`, `.toLong()`, `.toDouble()`) compiles down to a single JVM instruction (`i2l`, `i2d`, etc.), so there's no performance concern. It's one bytecode instruction that makes your intent explicit.

The underscore separator (`2_147_483_648L`) is a small feature I wish more people used. When you're dealing with buffer sizes, timeout values in milliseconds, or file size thresholds, readability matters. `86_400_000L` is immediately recognizable as 86.4 million (milliseconds in a day) in a way that `86400000L` is not. I use underscores in any numeric literal longer than four digits.

One gotcha with numeric types: Kotlin number literals default to `Int` when they fit in 32 bits, and `Double` for decimal numbers. If you write `val x = 42`, it's `Int`. If you write `val x = 42L`, it's `Long`. If you write `val x = 42.0`, it's `Double`, not `Float`. This is consistent behavior, but you need to know it when working with APIs that expect specific types like `Float` in graphics code or sensor data processing.

## Nullable Types and Boxing

This is where Kotlin's type system has real, measurable performance implications. When you declare `val count: Int = 42`, the Kotlin compiler emits a JVM primitive `int`. It takes 4 bytes on the stack or in a field. When you declare `val count: Int? = 42`, the compiler must use `java.lang.Integer` — a boxed wrapper object — because JVM primitives cannot represent `null`.

That boxed `Integer` carries roughly 16 bytes of object header overhead (on a 64-bit JVM with compressed oops). For a single variable, this doesn't matter. But when you're dealing with collections, tight loops, or data classes with dozens of numeric fields, the difference adds up fast. A `List<Int>` in Kotlin is actually a `List<java.lang.Integer>` on the JVM — every element is a boxed object, each with its own heap allocation and GC pressure. This is why performance-sensitive code uses `IntArray` (which maps to `int[]`) instead of `List<Int>`.

```kotlin
// Primitive int on JVM — 4 bytes, no allocation
val frameCount: Int = 60

// Boxed java.lang.Integer — ~16 bytes overhead per object
val cachedFrameCount: Int? = 60

// int[] on JVM — contiguous memory, no boxing
val frameTimes = IntArray(120)

// List<java.lang.Integer> — every element is boxed
val frameTimesList: List<Int> = listOf(16, 17, 16, 18)
```

The practical rule I follow: keep numeric types non-nullable whenever possible, especially in hot paths. If a property genuinely might be absent, `Int?` is the right choice — correctness beats performance. But if you're defaulting to nullable because "it might be null at some point," consider using a sentinel value or restructuring your data model to avoid the boxing cost entirely. I've seen measurable GC improvements in frame rendering code just from switching `Float?` fields to non-nullable `Float` with sensible defaults.

## lateinit vs by lazy

Both `lateinit` and `by lazy` solve the same fundamental problem — you need a property that can't be initialized at construction time — but they solve it in opposite ways, and picking the wrong one leads to either crashes or wasted memory.

`lateinit` is for `var` properties that you promise to initialize before first use. The compiler generates a backing field without a default value, and accessing it before initialization throws `UninitializedPropertyAccessException`. This is the right tool for Android lifecycle scenarios where a dependency arrives after object creation, like injecting a repository in `onCreate` or binding views in `onViewCreated`.

```kotlin
class SearchFragment : Fragment(R.layout.fragment_search) {

    private lateinit var searchAdapter: SearchAdapter
    private lateinit var viewModel: SearchViewModel

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel = ViewModelProvider(this)[SearchViewModel::class.java]
        searchAdapter = SearchAdapter { query -> viewModel.search(query) }

        // Safe check before accessing
        if (::searchAdapter.isInitialized) {
            searchAdapter.submitList(emptyList())
        }
    }
}
```

`lateinit` has restrictions: it only works with `var` (not `val`), it can't be a primitive type (no `lateinit var count: Int`), and it can't be nullable. The `::property.isInitialized` check is useful in teardown scenarios — for example, in `onDestroyView` when you're not sure if `onViewCreated` was called.

`by lazy` is the opposite pattern — it's for `val` properties that are expensive to create and should be computed on first access, then cached forever. The delegate generates a thread-safe wrapper (by default using `LazyThreadSafetyMode.SYNCHRONIZED`) that computes the value once and returns the cached result on subsequent reads.

```kotlin
class AnalyticsViewModel(
    private val eventRepository: EventRepository,
    private val userSession: UserSession
) : ViewModel() {

    // Computed once on first access, cached afterward
    private val eventProcessor by lazy {
        EventProcessor(
            sessionId = userSession.currentSessionId,
            batchSize = 50,
            flushInterval = 30_000L
        )
    }

    // Cheaper alternative when thread safety isn't needed
    private val dateFormatter by lazy(LazyThreadSafetyMode.NONE) {
        SimpleDateFormat("yyyy-MM-dd", Locale.US)
    }

    fun trackEvent(event: AnalyticsEvent) {
        eventProcessor.enqueue(event)
    }
}
```

The tradeoff is clear: `lateinit` gives you a mutable property with no initialization overhead but the risk of runtime crashes. `by lazy` gives you an immutable property with thread-safe initialization but the overhead of a `Lazy<T>` wrapper object and synchronization on first access. In most Android code, I use `lateinit` for dependencies injected during lifecycle callbacks, and `by lazy` for derived or computed properties that should only exist when needed. If you're on a single-threaded context (like main thread UI code), pass `LazyThreadSafetyMode.NONE` to `by lazy` to skip the synchronization overhead.

## const val vs val

This is one of those distinctions that seems trivial until you understand what the compiler does with each. A `val` at the top level or in a companion object compiles to a private static field with a getter method. Every time you reference it, the JVM calls that getter. A `const val` is inlined at every call site as a literal value — no field, no getter, no method call. The constant is baked directly into the bytecode wherever it's referenced.

```kotlin
class ApiClient {
    companion object {
        // Inlined as literal "https://api.example.com/v2" at every use site
        const val BASE_URL = "https://api.example.com/v2"
        const val MAX_RETRIES = 3
        const val CONNECT_TIMEOUT_MS = 30_000L

        // Backed by a static field + getter — not inlined
        val DEFAULT_HEADERS = mapOf(
            "Accept" to "application/json",
            "X-Client-Version" to BuildConfig.VERSION_NAME
        )
    }

    fun buildRequest(endpoint: String): Request {
        // BASE_URL is replaced with the literal string in bytecode
        // DEFAULT_HEADERS calls the getter method
        return Request.Builder()
            .url("$BASE_URL/$endpoint")
            .headers(DEFAULT_HEADERS.toHeaders())
            .build()
    }
}
```

`const val` is restricted to primitives (`Int`, `Long`, `Double`, `Float`, `Boolean`, `Byte`, `Short`, `Char`) and `String`. It can only appear at the top level or inside an `object`/`companion object`, and the value must be determinable at compile time — no function calls, no computed expressions. Think of it as Java's `static final` with guaranteed inlining.

The practical implication: for constants you reference frequently across the codebase (API endpoints, preference keys, intent extras, error codes), `const val` eliminates getter call overhead entirely. For anything that requires object creation or runtime computation, use regular `val`. I've seen codebases where frequently accessed preference keys were regular `val` strings in a companion object — switching them to `const val` saved thousands of getter calls per session. Not a game-changing optimization on its own, but the kind of free performance you get just by using the right keyword.

Thanks for reading!

## Quiz

#### What is the difference between `val` and `var` in Kotlin?

- **Wrong** `val` is for primitive types and `var` is for reference types
- **Wrong** `val` creates a constant known at compile time, `var` creates a runtime variable
- **Correct** `val` declares a read-only (immutable) reference and `var` declares a mutable reference
- **Wrong** `val` is thread-safe and `var` is not

> **Explanation:** `val` creates a read-only reference that cannot be reassigned. `var` creates a mutable reference. Note that `val` doesn't make the object itself immutable — a `val list = mutableListOf(1, 2, 3)` can still have elements added.

#### When does Kotlin box a primitive type?

- **Wrong** Always — Kotlin never uses JVM primitives
- **Correct** When the type is nullable (e.g., Int?) — the JVM primitive int cannot represent null
- **Wrong** Only when stored in a collection
- **Wrong** When using const val

> **Explanation:** `Int` compiles to JVM primitive `int` (4 bytes). `Int?` must use `java.lang.Integer` because JVM primitives cannot be null. This adds ~16 bytes of object header overhead per boxed value.

## Coding Challenge

Write a `ConfigLoader` class that demonstrates proper use of `val`, `var`, `lateinit`, `by lazy`, and `const val`. It should have a companion object with constants, a lateinit property for a config source that gets initialized later, and a lazy-computed derived property. Include a function that safely checks initialization state.

#### Solution

```kotlin
class ConfigLoader(private val environment: String) {

    companion object {
        const val DEFAULT_TIMEOUT_MS = 5_000L
        const val MAX_RETRY_COUNT = 3
        const val CONFIG_VERSION = "v2"
    }

    // Initialized later via inject() or setup()
    lateinit var configSource: RemoteConfigSource

    // Computed on first access, cached permanently
    private val parsedSettings: Map<String, String> by lazy {
        require(::configSource.isInitialized) { "configSource must be set before accessing settings" }
        configSource.fetchSettings(environment, CONFIG_VERSION)
    }

    // Mutable state that tracks reload count
    var reloadCount: Int = 0
        private set

    fun initialize(source: RemoteConfigSource) {
        configSource = source
    }

    fun getSetting(key: String): String? = parsedSettings[key]

    fun reload(): Map<String, String> {
        check(::configSource.isInitialized) { "Cannot reload — configSource not initialized" }
        reloadCount++
        return configSource.fetchSettings(environment, CONFIG_VERSION)
    }

    fun isReady(): Boolean = ::configSource.isInitialized
}
```
