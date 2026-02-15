---
title: Kotlin Generics Deep Dive
layout: post
sequence: 8
categories: post
tags:
  - Kotlin
  - Best Practices
---

Generics were one of those features I thought I understood until I had to actually use them beyond `List<String>`. I was building a caching layer that needed to store different types — `User`, `Settings`, `List<Transaction>` — and return them with the correct type at the call site. My first attempt used `Any` with manual casts everywhere. It compiled fine, crashed at runtime with `ClassCastException`, and I realized I needed to actually learn how the type system works rather than working around it.

The deeper I went, the more I discovered that Kotlin's generics are fundamentally shaped by a constraint most developers never think about: the JVM erases generic type information at runtime. Everything interesting about Kotlin generics — variance annotations, star projections, reified type parameters — exists either to work within that constraint or to work around it. Understanding type erasure first makes everything else click.

## Type Erasure — The Constraint That Shapes Everything

When Kotlin compiles generic code, the compiler verifies all type relationships at compile time and then throws away the type parameters. A `List<String>` and a `List<Int>` compile to the same bytecode — both become `List` with `Object` references internally. The JVM has no concept of "a list of strings" at runtime. It just sees a list of objects.

This means you can't do certain things that feel like they should be possible:

```kotlin
fun <T> isInstanceOf(value: Any): Boolean {
    // COMPILE ERROR: Cannot check for instance of erased type: T
    return value is T
}

fun <T> createArray(): Array<T> {
    // COMPILE ERROR: Cannot use T as reified type parameter
    return Array<T>(10) { TODO() }
}
```

Both fail because `T` doesn't exist at runtime. The `is` check needs the actual type to compare against, and `Array` needs it to allocate the right backing array. Type erasure was a deliberate design decision from Java 5 — Sun needed backward compatibility with billions of lines of existing code that used raw types, so erasing type information at runtime meant generic and non-generic code could coexist without changes to the JVM. Kotlin inherited this because it targets the JVM. Languages like C# that have their own runtime can and do preserve generic types at runtime, but the JVM simply doesn't support it.

The practical consequence: any operation that needs to know a generic type at runtime requires a workaround. Kotlin gives you two — `reified` type parameters and explicit `KClass` arguments.

## Variance — Covariance, Contravariance, and the Producer/Consumer Rule

Variance answers a deceptively simple question: if `Dog` is a subtype of `Animal`, is `List<Dog>` a subtype of `List<Animal>`?

The intuitive answer is yes — a list of dogs should be usable wherever a list of animals is expected. But here's the thing. If `List<Animal>` lets you add elements, someone could add a `Cat` to your `List<Dog>` through the `List<Animal>` reference. That's a type safety violation. So the answer depends entirely on what operations the generic type supports.

Java developers know this rule as **PECS — Producer Extends, Consumer Super**. In Kotlin, the same concept is cleaner: **Producer `out`, Consumer `in`**. I find Kotlin's version much easier to remember because the keywords literally describe what `T` does — it goes **out** of the class (return types) or comes **in** to the class (parameters).

**Covariance (`out`)** means the type only produces values of `T`. A `Producer<out Dog>` is safely a `Producer<Animal>` because you're only ever getting values out, and a `Dog` is always a valid `Animal`. Think of a read-only repository — it hands you data, never takes it.

**Contravariance (`in`)** means the type only consumes values of `T`. A `Consumer<in Animal>` is safely a `Consumer<Dog>` because if it can handle any `Animal`, it can certainly handle a `Dog`. Think of an event handler or a comparator — it accepts input, never returns the parameterized type.

```kotlin
// Covariant: only produces T values
interface EventProducer<out T> {
    fun getLatest(): T
    fun getAll(): List<T>
    // fun add(item: T) — COMPILE ERROR: T is declared as 'out'
}

// Contravariant: only consumes T values
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

The `out` keyword restricts `T` to "out" positions — return types, `val` properties. The `in` keyword restricts `T` to "in" positions — function parameters. If you need both, you leave the type parameter invariant (no annotation) and lose the subtyping flexibility. Kotlin's standard library uses this everywhere: `List<out E>` is covariant, `MutableList<E>` is invariant, `Comparable<in T>` is contravariant.

## Declaration-Site vs Use-Site Variance

Here's a distinction that tripped me up for a while. **Declaration-site variance** is when you put `in` or `out` on the class or interface definition itself. You do this when you own the class and you know it will always be a producer or always be a consumer.

Kotlin's `List<out E>` is declaration-site — the Kotlin team knew `List` would never have add methods, so they declared it covariant once, and every use of `List` gets the subtyping benefit automatically. You don't have to think about variance at every call site. This is one of those areas where Kotlin genuinely improves on Java, because Java has no declaration-site variance at all — you have to use `? extends E` wildcards every single time.

But sometimes you're working with a type you didn't write, or one that's invariant for good reasons (it both reads and writes). That's where **use-site variance** comes in — you apply variance at a specific call site to restrict how you use the type:

```kotlin
// EventStore<T> is invariant — it has both get() and set()
// But at this call site, we only need specific capabilities
fun <T> copyEvents(
    source: EventStore<out T>,  // I'll only read from source
    target: EventStore<in T>    // I'll only write to target
) {
    val event = source.get()
    target.set(event)
}
```

This is Kotlin's equivalent of Java's `? extends T` and `? super T` wildcards, but with names that actually make sense. `out` at the use site says "I promise to only read from this." `in` says "I promise to only write to this." The compiler enforces the promise — try calling `source.set()` and it won't compile.

IMO, the rule of thumb is simple: if you control the class and it's purely a producer or consumer, use declaration-site. If you don't control the class or it's invariant but you only need one direction at a particular call site, use use-site.

## Type Projections and Star Projection

Use-site `out` and `in` are actually called **type projections** — you're projecting an invariant type into a covariant or contravariant view. Star projection (`*`) is the extreme version: you're projecting away all type information entirely.

`MutableList<*>` means "a mutable list of some specific type that I don't know." You can read from it (elements come out as `Any?`), but you can't write to it because the compiler can't verify your value matches the unknown type. The behavior depends on the original variance:

- For `out` types: `List<*>` behaves like `List<out Any?>` — full read access, `Any?` return types
- For `in` types: `Comparable<*>` behaves like `Comparable<in Nothing>` — you effectively can't call consuming methods because `Nothing` has no instances
- For invariant types: reads return `Any?`, writes are blocked

I use star projection most often in DI containers and reflection-heavy code where the actual type is determined at runtime. It's also the right tool when you just need metadata about a generic object — checking its size, logging its class, passing it through without caring about the type argument.

## Reified Type Parameters — Beating Type Erasure

`reified` is Kotlin's escape hatch from type erasure. By marking a type parameter as `reified` on an `inline` function, the compiler inlines the function body at every call site and substitutes the actual type argument into the bytecode. The type information survives to runtime because it's baked in at compile time.

```kotlin
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

// Usage — type is inferred and preserved at runtime
val username = prefs.get<String>("username", "")
val darkMode = prefs.get<Boolean>("dark_mode", false)
val retryCount = prefs.get<Int>("retry_count", 3)
```

Without `reified`, you'd need to pass a `KClass<T>` parameter manually. With `reified`, the compiler replaces `T::class` with the actual class at each call site. The function must be `inline` because that's how the compiler gets access to the actual type argument — it copies the function body into the caller, substituting the real type.

Android's Jetpack libraries use reified types extensively — `by viewModels()`, Intent extras like `intent.getParcelableExtra<User>("user")`, and navigation argument parsing. The limitation is that reified only works on `inline` functions. You can't have a reified type parameter on a class, a non-inline function, or a virtual function. If you need a type reference that persists, you're back to `KClass<T>`.

## Generic Constraints and the `where` Clause

Type bounds restrict what types can be used as type arguments. The simplest form is a single upper bound — `T : Comparable<T>` means `T` must implement `Comparable`. But real code often needs multiple constraints. That's where the `where` clause comes in:

```kotlin
fun <T> serializeAndCache(item: T)
    where T : Serializable,
          T : Identifiable {
    val id = item.getId()
    val bytes = serialize(item)
    cache.put(id, bytes)
    networkClient.send(id, bytes)
}

// Only types implementing BOTH interfaces can be passed
serializeAndCache(userProfile)  // UserProfile : Serializable, Identifiable
```

I use multiple bounds most often when building repository layers that need entities to be both persistable and identifiable, or when writing utility functions that need a type to be both `Comparable` and `Serializable` for sorted caching. Java uses `&` syntax for this (`<T extends Serializable & Identifiable>`), but Kotlin's `where` clause reads better, especially with three or more bounds.

Here's a pattern I use frequently — a self-bounded type for type-safe event dispatch:

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

The recursive bound `T : TypedEvent<T>` ensures each event type's `accept` method takes a handler typed to itself. `PaymentCompleted` takes `EventHandler<PaymentCompleted>`, not some generic `EventHandler<TypedEvent<*>>`. This is the Curiously Recurring Template Pattern, and it gives you compile-time type safety across the entire dispatch system without any casts.

## The `Nothing` Type in Generics

`Nothing` is Kotlin's bottom type — a type with no instances. At first glance it seems useless, but in generics it's surprisingly powerful. `Nothing` is a subtype of every other type, which means `List<Nothing>` is a subtype of `List<String>`, `List<Int>`, `List<anything>`. This is why `emptyList()` works everywhere:

```kotlin
// emptyList returns List<Nothing>, which is assignable to any List<T>
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

The `Error` class extends `Result<Nothing>` because it doesn't produce any `T` value. Since `Nothing` is a subtype of everything and `Result` is covariant (`out T`), `Result<Nothing>` is a subtype of `Result<User>`, `Result<String>`, or any other `Result`. This pattern shows up constantly in sealed class hierarchies where some branches carry data and others don't. Without `Nothing`, you'd need awkward workarounds like `Result<Unit>` or nullable type parameters.

## Real-World Generic Patterns

The patterns I keep reaching for in production code all revolve around type safety without boilerplate. Here are the ones I've found most useful.

### The `TypedKey` Pattern

This is a pattern I picked up for type-safe key-value stores. Instead of stringly-typed lookups with manual casts, the key itself carries the type information:

```kotlin
class TypedKey<T>(val name: String)

class TypedPreferences(private val prefs: SharedPreferences) {
    fun <T : Any> get(key: TypedKey<T>, default: T): T {
        @Suppress("UNCHECKED_CAST")
        return prefs.all[key.name] as? T ?: default
    }

    fun <T : Any> set(key: TypedKey<T>, value: T) {
        prefs.edit().apply {
            when (value) {
                is String -> putString(key.name, value)
                is Int -> putInt(key.name, value)
                is Boolean -> putBoolean(key.name, value)
                else -> throw IllegalArgumentException("Unsupported type")
            }
        }.apply()
    }
}

// Keys are defined once with their types baked in
val USERNAME = TypedKey<String>("username")
val DARK_MODE = TypedKey<Boolean>("dark_mode")
val RETRY_COUNT = TypedKey<Int>("retry_count")

// Usage — impossible to get the types wrong
val name: String = typedPrefs.get(USERNAME, "")
val dark: Boolean = typedPrefs.get(DARK_MODE, false)
```

The cast inside `get()` is safe because the `TypedKey<T>` constrains both the storage and retrieval to the same `T`. You trade one unchecked cast in the implementation for perfect type safety at every call site. I use this pattern for feature flags, analytics event properties, and any key-value API where stringly-typed lookups would be error-prone.

### Generic Repository

```kotlin
interface Repository<T : Entity> {
    suspend fun getById(id: String): T?
    suspend fun getAll(): List<T>
    suspend fun save(entity: T)
    suspend fun delete(id: String)
}

class CachedRepository<T : Entity>(
    private val remote: Repository<T>,
    private val cache: MutableMap<String, T> = mutableMapOf()
) : Repository<T> {
    override suspend fun getById(id: String): T? {
        return cache[id] ?: remote.getById(id)?.also { cache[id] = it }
    }

    override suspend fun getAll(): List<T> = remote.getAll()
    override suspend fun save(entity: T) { remote.save(entity) }
    override suspend fun delete(id: String) { cache.remove(id); remote.delete(id) }
}
```

The bound `T : Entity` ensures every repository works with types that have an `id` property, while `CachedRepository` adds caching to any repository without knowing the specific entity type. I've used this exact pattern to wrap Room DAOs, Retrofit services, and Firebase references with a unified caching layer.

## Generic Extension Functions

One of Kotlin's best tricks is combining generics with extension functions. This lets you add type-safe utility methods to existing types without modifying them or creating wrapper classes:

```kotlin
inline fun <reified T> Bundle.getTypedParcelable(key: String): T?
    where T : Parcelable {
    return if (Build.VERSION.SDK_INT >= 33) {
        getParcelable(key, T::class.java)
    } else {
        @Suppress("DEPRECATION")
        getParcelable(key)
    }
}

// Extension that works on any list of Comparable items
fun <T : Comparable<T>> List<T>.isSorted(): Boolean {
    return zipWithNext().all { (a, b) -> a <= b }
}

// Type-safe JSON parsing as an extension
inline fun <reified T> String.parseJson(gson: Gson): T {
    return gson.fromJson(this, T::class.java)
}

// Usage
val user = bundle.getTypedParcelable<UserProfile>("user")
val sorted = transactions.isSorted()
val config = jsonString.parseJson<AppConfig>(gson)
```

The `Bundle.getTypedParcelable` example is one I use in every project — it handles the API 33 deprecation cleanly while giving you type inference at the call site. Generic extensions are especially powerful with `reified` because you get both the ergonomics of extension syntax and runtime type access. This combination is why Kotlin's generic APIs often feel cleaner than Java's — you're not passing `Class<T>` tokens everywhere.

## The Reframe: Generics Are a Compile-Time Contract

Here's how I think about Kotlin generics now: **they're a contract that the compiler enforces and then erases.** The type parameters, variance annotations, and bounds exist to give the compiler enough information to verify your code is type-safe. Once it's satisfied, the information is discarded — except for `reified` parameters, which get baked into inlined bytecode.

This means generics are fundamentally a compile-time tool. They prevent you from putting a `String` into a `List<Int>`, from reading a `Dog` from a `Consumer<Animal>`, from using a type without the methods you need. But they don't help you at runtime — you can't reflect on type parameters, you can't create instances of `T`, you can't check `is T` without `reified`.

The tradeoff is complexity in API design. Choosing between `in`, `out`, and invariant requires thinking about how your type will be used — will consumers only read? Only write? Both? Getting it wrong means either restricting callers unnecessarily or opening type safety holes. But getting it right means your generic APIs compose naturally — a `Flow<Dog>` works wherever a `Flow<Animal>` is expected, a `Comparator<Animal>` works wherever a `Comparator<Dog>` is needed — and the compiler keeps everything safe without runtime checks.

IMO, the investment in learning variance pays off the moment you start designing your own generic interfaces. The same clarity that makes `Flow`, `List`, and `Comparable` just work with subtyping is available for your own types. You think about the producer/consumer semantics once, declare `in` or `out`, and the type system does the rest.

Thank You!
