---
title: Kotlin Generics Deep Dive
layout: post
categories: post
tags:
  - Kotlin
  - Best Practices
---

Generics were one of those features I thought I understood until I had to actually use them beyond `List<String>`. I was writing a caching layer that needed to store different types — `User`, `Settings`, `List<Transaction>` — and return them with the correct type at the call site. My first attempt used `Any` with manual casts. It compiled fine, crashed at runtime with `ClassCastException`, and I realized I needed to actually learn how the type system works rather than working around it.

The deeper I went, the more I discovered that Kotlin's generics are fundamentally shaped by a constraint most developers never think about: the JVM erases generic type information at runtime. Everything interesting about Kotlin generics — variance annotations, star projections, reified type parameters — exists either to work within that constraint or to work around it. Understanding type erasure first makes everything else make sense.

## Type Erasure — The Constraint That Shapes Everything

When Kotlin (or Java) compiles generic code, the compiler verifies all type relationships at compile time and then throws away the type parameters. A `List<String>` and a `List<Int>` compile to the same bytecode — both become `List` with `Object` references internally. The JVM has no concept of "a list of strings" at runtime. It just sees a list of objects.

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

Both of these fail because `T` doesn't exist at runtime. The `is` check needs to know the actual type to compare against, and `Array` needs the actual type to allocate the right kind of backing array. The compiler knows this won't work and refuses to compile it.

Type erasure is a deliberate design decision from Java 5. When generics were added to Java, Sun needed backward compatibility with billions of lines of existing code that used raw types. Erasing type information at runtime meant generic and non-generic code could coexist in the same JVM without changes to the runtime. Kotlin inherited this decision because it targets the JVM. Languages that don't target the JVM (like C#) can and do preserve generic types at runtime — but that requires runtime support that the JVM doesn't have.

The practical consequence: any operation that needs to know a generic type at runtime requires a workaround. Kotlin provides two main workarounds — `reified` type parameters and explicit `KClass` arguments. More on those later.

## Variance — `in`, `out`, and Why It Matters

Variance answers a deceptively simple question: if `Dog` is a subtype of `Animal`, is `List<Dog>` a subtype of `List<Animal>`?

The intuitive answer is yes — a list of dogs should be usable wherever a list of animals is expected. But it's not that simple. If `List<Animal>` lets you add elements, then someone could add a `Cat` to your `List<Dog>` through the `List<Animal>` reference. That's a type safety violation. So the answer depends on what operations the generic type supports.

**Covariance (`out`)** — A `Producer<out T>` only produces values of type `T`, never consumes them. Because it only outputs, it's safe to treat a `Producer<Dog>` as a `Producer<Animal>`. You're only ever getting values out, and a `Dog` is always a valid `Animal`.

**Contravariance (`in`)** — A `Consumer<in T>` only consumes values of type `T`, never produces them. Because it only takes input, it's safe to treat a `Consumer<Animal>` as a `Consumer<Dog>`. If it can handle any `Animal`, it can certainly handle a `Dog`.

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

The `out` keyword restricts `T` to appear only in "out" positions — return types, val properties, `List<T>` return values. The `in` keyword restricts `T` to "in" positions — function parameters, `Comparable<T>` inputs. If you need both, you leave the type parameter invariant (no annotation), and you lose the subtyping flexibility.

Kotlin's standard library uses this extensively. `List<out E>` is covariant — you can read elements but not add them through the `List` interface. `MutableList<E>` is invariant because it supports both reading and writing. `Comparable<in T>` is contravariant — a `Comparable<Number>` can compare any `Number`, so it can certainly compare an `Int`.

### Use-Site Variance — When You Can't Change the Declaration

Sometimes you're working with an invariant type but you only need it in a covariant or contravariant way at a specific call site. Kotlin lets you apply variance at the use site:

```kotlin
// EventStore<T> is invariant — declared without in/out
fun <T> copyEvents(
    source: EventStore<out T>,  // treat as producer only at this call site
    target: EventStore<in T>    // treat as consumer only at this call site
) {
    val event = source.get()
    target.set(event)
}
```

This is equivalent to Java's `? extends T` and `? super T` wildcards, but with clearer naming. `out` at the use site says "I promise to only read from this." `in` says "I promise to only write to this." The compiler enforces the promise.

## Star Projection — When You Don't Know (or Care About) the Type

`*` is Kotlin's star projection — it's what you use when you have a generic type but don't know or don't care about the type argument. It's similar to Java's `?` wildcard, but with more nuanced behavior.

```kotlin
fun printCollectionInfo(collection: MutableList<*>) {
    println("Size: ${collection.size}")
    println("First element: ${collection.firstOrNull()}")

    // You can read — elements come out as Any?
    val element: Any? = collection[0]

    // You CANNOT add — the compiler doesn't know what type is safe
    // collection.add("hello") — COMPILE ERROR
}
```

`MutableList<*>` means "a mutable list of some specific type that I don't know." You can read from it (elements are typed as `Any?` since that's the safe supertype of everything), but you can't write to it because the compiler can't verify that your value matches the unknown type. The only thing you can add is `null` (if the type parameter is nullable), because `null` is valid for every nullable type.

For covariant types, `List<*>` behaves the same as `List<out Any?>` — read-only access with `Any?` return types. For contravariant types, `Comparable<*>` behaves the same as `Comparable<in Nothing>` — the compiler restricts the input to `Nothing` (which means you effectively can't call consuming methods). For invariant types, star projection gives you covariant-like behavior for reads and blocks writes.

I use star projection most often in reflection-heavy code and dependency injection containers where the actual type parameter is determined at runtime. It's the right tool when you need to handle "any generic variant" without committing to a specific type argument.

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

// Usage — type is inferred and preserved
val username = prefs.get<String>("username", "")
val darkMode = prefs.get<Boolean>("dark_mode", false)
val retryCount = prefs.get<Int>("retry_count", 3)
```

Without `reified`, you'd need to pass a `KClass<T>` parameter manually, because `T` doesn't exist at runtime. With `reified`, the compiler replaces `T::class` with the actual class at each call site. The function must be `inline` because that's how the compiler gets access to the actual type argument — it copies the function body into the caller, substituting the real type.

Android's Jetpack libraries use reified types extensively. `Fragment.findNavController()`, activity and fragment `by viewModels()`, and Intent extension functions like `intent.getParcelableExtra<User>("user")` all use reified parameters to avoid manual class passing. It's one of those Kotlin features that, once you start using it, you wonder how you ever lived without it.

The limitation: reified only works on `inline` functions. You can't have a reified type parameter on a class, a non-inline function, or a virtual function. This means you can't store a reified type for later use — it's consumed at the call site during inlining. If you need a type reference that persists, you're back to `KClass<T>` parameters.

## Type Bounds and Generic Constraints

Type bounds restrict what types can be used as type arguments. The simplest form is an upper bound:

```kotlin
fun <T : Comparable<T>> findMax(items: List<T>): T {
    return items.reduce { acc, item -> if (item > acc) item else acc }
}

// Works with any Comparable type
val maxInt = findMax(listOf(3, 1, 4, 1, 5, 9))
val maxString = findMax(listOf("banana", "apple", "cherry"))
```

`T : Comparable<T>` means "T must implement `Comparable<T>`." Without this bound, the compiler wouldn't allow the `>` operator because it doesn't know that `T` supports comparison.

When you need multiple bounds, Kotlin uses a `where` clause:

```kotlin
fun <T> serializeAndSend(item: T)
    where T : Serializable,
          T : Identifiable {
    val id = item.getId()
    val bytes = serialize(item)
    networkClient.send(id, bytes)
}
```

The `where` clause says `T` must implement both `Serializable` and `Identifiable`. Java supports multiple bounds with `&` syntax (`<T extends Serializable & Identifiable>`), but Kotlin uses the `where` clause for readability when there are multiple constraints.

### Generic Constraints in Practice

Here's a pattern I use frequently — a type-safe event bus where each event type has its own typed handler:

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

class OrderCancelled(
    val orderId: String,
    val reason: String
) : TypedEvent<OrderCancelled>() {
    override fun accept(handler: EventHandler<OrderCancelled>) {
        handler.handle(this)
    }
}
```

The recursive type bound `T : TypedEvent<T>` is the "Curiously Recurring Template Pattern" (CRTP). It ensures that each event type's `accept` method takes a handler typed to itself — `PaymentCompleted` takes `EventHandler<PaymentCompleted>`, not `EventHandler<OrderCancelled>`. This gives you compile-time type safety across the event dispatch system without any casts.

## The Reframe: Generics Are a Compile-Time Contract

Here's how I think about Kotlin generics now: **they're a contract that the compiler enforces and then erases.** The type parameters, variance annotations, and bounds exist to give the compiler enough information to verify your code is type-safe. Once it's satisfied, the information is discarded (except for `reified` parameters, which get baked into the inlined bytecode).

This means generics are fundamentally a compile-time tool. They prevent you from putting a `String` into a `List<Int>`, from reading a `Dog` from a `Consumer<Animal>`, from using a type without the methods you need. But they don't help you at runtime — you can't reflect on type parameters, you can't create instances of `T`, you can't check `is T`. Every time you feel like you need runtime type information, you need either `reified` (for inline functions) or an explicit `KClass<T>` parameter (for everything else).

The tradeoff of Kotlin's variance system is that it adds complexity to API design. Choosing between `in`, `out`, and invariant for each type parameter requires thinking about how the type will be used — will consumers only read? Only write? Both? Getting it wrong means either restricting callers unnecessarily (invariant when covariant would work) or opening type safety holes. But getting it right means your generic APIs compose naturally — a `Flow<Dog>` works wherever a `Flow<Animal>` is expected, a `Comparator<Animal>` works wherever a `Comparator<Dog>` is expected — and the compiler keeps everything safe without runtime checks.

IMO, the investment in learning variance pays off the moment you start designing your own generic interfaces. Library authors get it right, and that's why `Flow`, `List`, and `Comparable` just work with subtyping. The same clarity is available for your own types — you just have to think about the producer/consumer semantics once, declare `in` or `out`, and the type system does the rest.

Thank You!
