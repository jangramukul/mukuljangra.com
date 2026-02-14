---
title: "Generics, Variance & Reified Types"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 3
sequence: 29
description: "Generics come up in almost every Kotlin interview round."
---

## Generics, Variance & Reified Types

Generics come up in almost every Kotlin interview round. Interviewers use variance and reified types to check whether you understand how Kotlin's type system works beyond basic syntax.

### Core Questions (Beginner → Intermediate)

#### Q1: What are generics in Kotlin and why do we need them?

Generics allow you to write classes and functions that work with any data type while keeping type safety at compile time. Without generics, you'd either lose type safety by using `Any` everywhere or duplicate code for every type. A generic class like `List<T>` works with `String`, `Int`, or any custom type, and the compiler catches type mismatches before runtime.

```kotlin
class Repository<T>(private val items: MutableList<T> = mutableListOf()) {
    fun add(item: T) { items.add(item) }
    fun getAll(): List<T> = items.toList()
}

val userRepo = Repository<User>()
userRepo.add(User("Mukul"))
// userRepo.add(Product("Phone")) // Compile error — type safety
```

#### Q2: What is the difference between star projection and generic type?

In generics, star projection `*` represents an unknown data type and generic type `T` represents a data type that needs to be specified. You use `*` when you don't care about the specific type — `List<*>` means a list of something but you don't know what. With `T`, you're declaring a type parameter that must be consistent throughout the class or function.

```kotlin
fun printAll(items: List<*>) {
    // Can read items as Any?, but cannot add to the list
    items.forEach { println(it) }
}

fun <T> filterItems(items: List<T>, predicate: (T) -> Boolean): List<T> {
    return items.filter(predicate) // T is consistent throughout
}
```

With star projection, you can read elements as `Any?` but you can't write to the collection because the compiler doesn't know the actual type.

#### Q3: How do you create a generic function in Kotlin?

You declare a type parameter in angle brackets before the function name. The type parameter can be used for parameters, return types, and within the function body.

```kotlin
fun <T> singletonList(item: T): List<T> {
    return listOf(item)
}

fun <T : Comparable<T>> findMax(a: T, b: T): T {
    return if (a > b) a else b
}

val maxValue = findMax(10, 20) // T inferred as Int
```

Kotlin infers the type parameter from the arguments, so you don't need to specify it explicitly most of the time.

#### Q4: What are generic constraints and the where clause?

Generic constraints restrict what types can be used as type arguments. A single upper bound uses the colon syntax `T : SomeType`. When you need multiple upper bounds, you use the `where` clause.

```kotlin
// Single upper bound
fun <T : Comparable<T>> sort(list: List<T>) { /* ... */ }

// Multiple upper bounds with where clause
fun <T> processItem(item: T)
    where T : Serializable,
          T : Comparable<T> {
    // T must implement both Serializable and Comparable
}
```

Without constraints, `T` has an implicit upper bound of `Any?`, meaning it can be nullable. If you want to restrict to non-null types, use `T : Any`.

#### Q5: What is type erasure and how does it affect generics?

Type erasure means the compiler removes all generic type information at runtime. A `List<String>` and `List<Int>` are both just `List` in the bytecode. This is inherited from the JVM — Java generics work the same way.

Because of erasure, you can't do `if (value is List<String>)` at runtime — the compiler doesn't know it's a `List<String>` vs `List<Int>`. You can only check `if (value is List<*>)`. This also means you can't create instances of a generic type directly — `T()` won't compile because `T` doesn't exist at runtime.

#### Q6: What does covariance mean? Explain the out keyword.

Covariance means if `Dog` is a subtype of `Animal`, then `List<Dog>` is also a subtype of `List<Animal>`. You declare covariance using the `out` keyword. A type parameter marked `out` can only appear in output positions — return types, not function parameters.

```kotlin
interface Source<out T> {
    fun next(): T  // T in output position — allowed
    // fun add(item: T) // T in input position — compile error
}

fun handleAnimals(source: Source<Animal>) { /* ... */ }

val dogSource: Source<Dog> = /* ... */
handleAnimals(dogSource) // Works — Source<Dog> is subtype of Source<Animal>
```

`List<T>` in Kotlin is declared as `List<out T>`, which is why you can pass a `List<Dog>` where a `List<Animal>` is expected.

#### Q7: What does contravariance mean? Explain the in keyword.

Contravariance is the opposite of covariance — if `Dog` is a subtype of `Animal`, then `Consumer<Animal>` is a subtype of `Consumer<Dog>`. You declare contravariance using the `in` keyword. A type parameter marked `in` can only appear in input positions — function parameters, not return types.

```kotlin
interface Consumer<in T> {
    fun consume(item: T) // T in input position — allowed
    // fun produce(): T  // T in output position — compile error
}

fun feedDogs(consumer: Consumer<Dog>) { /* ... */ }

val animalConsumer: Consumer<Animal> = /* ... */
feedDogs(animalConsumer) // Works — Consumer<Animal> is subtype of Consumer<Dog>
```

This makes sense intuitively — a consumer that can handle any `Animal` can certainly handle a `Dog`.

#### Q8: What is the PECS principle and how does it apply in Kotlin?

PECS stands for "Producer Extends, Consumer Super" — it comes from Java's `? extends T` and `? super T` wildcards. In Kotlin, the equivalent is `out` for producers and `in` for consumers.

- **Producer** — You only read from it, so use `out`. A `List<out Animal>` produces Animals.
- **Consumer** — You only write to it, so use `in`. A `Comparable<in String>` consumes Strings.

The rule is simple: if you take items out, use `out`. If you put items in, use `in`. If you do both, you can't use variance — the type must be invariant.

### Deep Dive Questions (Advanced → Expert)

#### Q9: What is the difference between declaration-site and use-site variance?

Declaration-site variance is when you put `in` or `out` on the class/interface declaration itself. It applies everywhere that type is used. Kotlin's `List<out E>` is declaration-site — every `List` is covariant in `E`.

Use-site variance is when you apply `in` or `out` at the point where you use the type, not where it's declared. This is what Java does with `? extends T` and `? super T`, and Kotlin supports it too.

```kotlin
// Declaration-site — variance is part of the type definition
interface Source<out T> {
    fun next(): T
}

// Use-site — variance applied at the call site
fun copy(from: MutableList<out Animal>, to: MutableList<in Animal>) {
    for (item in from) {
        to.add(item)
    }
}
```

You use use-site variance when the class itself needs to be invariant (like `MutableList<T>` which both reads and writes) but a specific function only reads or only writes.

#### Q10: What is the reified keyword and why does it require inline?

The `reified` keyword allows you to access the type information of a generic type at runtime. Normally, generic types are erased at runtime due to type erasure. But when you mark a function as `inline`, the compiler copies the function body to every call site — and with `reified`, it substitutes the actual type at each call site.

```kotlin
inline fun <reified T> isType(value: Any): Boolean {
    return value is T // Works because T is reified
}

inline fun <reified T : Activity> startActivity(context: Context) {
    val intent = Intent(context, T::class.java)
    context.startActivity(intent)
}

// At the call site, compiler replaces T with the actual type
startActivity<PaymentActivity>(context)
```

Without `inline`, the function exists as a single compiled method where `T` is erased. With `inline`, the function body is copied to each call site, so the compiler knows the concrete type and can replace `T` with it directly.

#### Q11: Can you use reified with classes? Why not?

No, `reified` only works with inline functions. You can't inline a class, so `reified` type parameters on classes are not possible. A class is instantiated at runtime and its methods are called through virtual dispatch — the compiler can't copy the class body to every usage site the way it does with inline functions.

If you need runtime type information in a class, pass a `KClass<T>` parameter or use `Class<T>` explicitly:

```kotlin
class TypedParser<T : Any>(private val type: KClass<T>) {
    fun parse(json: String): T {
        return gson.fromJson(json, type.java)
    }
}

val parser = TypedParser(User::class)
```

This is the standard workaround — pass the class reference as a constructor parameter instead of relying on reified generics.

#### Q12: How does Nothing type work in generics?

`Nothing` is the bottom type in Kotlin's type hierarchy — it's a subtype of every other type. No value can ever be of type `Nothing`. This makes it useful in generics because `List<Nothing>` is a subtype of `List<T>` for any `T` (when `T` is covariant).

`emptyList()` in Kotlin returns `List<Nothing>`, which is why you can assign it to any `List<T>`:

```kotlin
val strings: List<String> = emptyList() // List<Nothing> → List<String>
val ints: List<Int> = emptyList()       // List<Nothing> → List<Int>
```

Functions that never return (like `error()` or `throw`) have return type `Nothing`. This lets the compiler know the branch never completes, which is useful in `when` expressions where every branch must produce a value.

#### Q13: How does variance work with MutableList vs List in Kotlin?

`List<T>` is declared as `List<out T>` — it's covariant because it's read-only. You can pass a `List<Dog>` where `List<Animal>` is expected. `MutableList<T>` is invariant — it's not `out` or `in` — because it both reads and writes. A `MutableList<Dog>` is NOT a subtype of `MutableList<Animal>`.

This invariance is necessary for type safety. If `MutableList<Dog>` were a subtype of `MutableList<Animal>`, you could add a `Cat` through the `Animal` reference and break the `Dog` guarantee:

```kotlin
val dogs: MutableList<Dog> = mutableListOf(Dog("Rex"))
// If this were allowed:
val animals: MutableList<Animal> = dogs
animals.add(Cat("Whiskers")) // Cat in a Dog list!
val dog: Dog = dogs[1] // ClassCastException at runtime
```

Java arrays allow this and throw `ArrayStoreException` at runtime. Kotlin's variance system prevents it at compile time.

#### Q14: What happens when you combine multiple generic constraints with variance?

When you combine upper bounds with variance, the constraints must be compatible. An `out` type parameter can only have covariant or invariant upper bounds. An `in` type parameter can only have contravariant or invariant upper bounds.

```kotlin
interface ReadOnlyCache<out T : Any> {
    fun get(key: String): T?
    fun getAll(): List<T>
}

fun <T> mergeInto(
    source: ReadOnlyCache<out T>,
    destination: MutableList<in T>
) where T : Serializable {
    destination.addAll(source.getAll())
}
```

With the `where` clause, all constraints must be satisfied simultaneously. If `T : Comparable<T>` and `T : Serializable`, only types that implement both interfaces qualify.

#### Q15: Explain type projection with a real example. When would you use out or in at the call site?

Type projection is use-site variance — applying `out` or `in` at the point of use rather than at the declaration. You use it when a class is invariant but your specific function doesn't need full read-write access.

```kotlin
// Array<T> is invariant — it reads and writes
// But this function only reads from source
fun <T> copyArray(source: Array<out T>, dest: Array<in T>) {
    for (i in source.indices) {
        dest[i] = source[i]
    }
}

val strings: Array<String> = arrayOf("hello", "world")
val objects: Array<Any> = arrayOf("a", "b")
copyArray(strings, objects) // Works with type projection
```

Without `out` on `source`, you couldn't pass `Array<String>` where `Array<Any>` is expected because `Array` is invariant. The `out` projection tells the compiler "I'll only read from this, so covariance is safe here."

#### Q16: How do you handle generic types with inline classes (value classes)?

Value classes with generics have specific behavior. A value class can use a generic type parameter, but the wrapping/unboxing optimization only applies when the value class is used with a concrete type, not when it's used generically.

```kotlin
@JvmInline
value class UserId(val value: String)

@JvmInline
value class Amount<T : Number>(val value: T)

// When used with concrete type — no boxing
val amount = Amount(100) // Unboxed at runtime

// When used generically — boxing may occur
fun <T : Number> processAmount(amount: Amount<T>) {
    // T is erased, so Amount may be boxed here
}
```

If your value class wraps a generic type, the compiler can't always guarantee unboxing because it doesn't know the concrete type at compile time. For performance-critical code, prefer concrete types over generic value classes.

#### Q17: What are the practical differences between `Class<T>`, `KClass<T>`, and reified T?

These are three ways to hold type information, each with different use cases:

- **`Class<T>`** — Java's runtime type token. Used with Java reflection and libraries like Gson. You get it via `T::class.java` (only works with reified or concrete types).
- **`KClass<T>`** — Kotlin's runtime type token. Used with Kotlin reflection. You get it via `T::class`. Provides Kotlin-specific metadata like `isData`, `sealedSubclasses`, etc.
- **reified T** — Compile-time substitution. The compiler replaces `T` with the actual type at each call site. No runtime overhead, works with `is` checks and `::class`, but only available in inline functions.

```kotlin
// reified — cleanest API, but limited to inline functions
inline fun <reified T> parse(json: String): T {
    return Gson().fromJson(json, T::class.java)
}

// KClass — works anywhere, explicit parameter
fun <T : Any> parse(json: String, type: KClass<T>): T {
    return Gson().fromJson(json, type.java)
}
```

Prefer `reified` when possible for cleaner call-site syntax. Fall back to `KClass<T>` when you need the type in a class constructor or non-inline function.

### Common Follow-ups

- What's the difference between `List<*>` and `List<Any?>`? Can you write to either?
- If `out` means covariant and `in` means contravariant, what does no modifier (invariant) mean in practice?
- Why does Kotlin use `in`/`out` keywords instead of Java's `? extends`/`? super` wildcard syntax?
- How does type erasure affect equality checks — can you compare `List<String>::class` and `List<Int>::class`?
- Can you combine `reified` with variance? For example, `inline fun <reified out T>` — is that valid?
- How do sealed classes interact with generics? Can you have a sealed class with a type parameter?
- What's the difference between `T : Any` and `T : Any?` as a generic constraint?
