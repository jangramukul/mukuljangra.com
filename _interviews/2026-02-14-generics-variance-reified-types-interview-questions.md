---
title: "Generics, Variance & Reified Types"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 4
sequence: 4
description: "Generics come up in almost every Kotlin interview round."
---

## Generics, Variance & Reified Types

Generics come up in almost every Kotlin interview round. Interviewers use variance and reified types to check whether you understand how Kotlin's type system works beyond basic syntax.

#### What are generics in Kotlin and why do we need them?

Generics allow you to write classes and functions that work with any data type while keeping type safety at compile time. Without generics, you'd either lose type safety by using `Any` everywhere or duplicate code for every type.

```kotlin
class Repository<T>(private val items: MutableList<T> = mutableListOf()) {
    fun add(item: T) { items.add(item) }
    fun getAll(): List<T> = items.toList()
}

val userRepo = Repository<User>()
userRepo.add(User("Mukul"))
// userRepo.add(Product("Phone")) // Compile error
```

#### What is type erasure and how does it affect generics?

Type erasure means the compiler removes all generic type information at runtime. A `List<String>` and `List<Int>` are both just `List` in the bytecode. This is inherited from the JVM.

Because of erasure, you can't do `if (value is List<String>)` at runtime — you can only check `if (value is List<*>)`. You also can't create instances of a generic type directly — `T()` won't compile because `T` doesn't exist at runtime.

#### What does covariance mean? Explain the out keyword.

Covariance means if `Dog` is a subtype of `Animal`, then `List<Dog>` is also a subtype of `List<Animal>`. You declare covariance using `out`. A type parameter marked `out` can only appear in output positions — return types, not function parameters.

```kotlin
interface Source<out T> {
    fun next(): T
    // fun add(item: T) // compile error — T in input position
}

val dogSource: Source<Dog> = /* ... */
fun handleAnimals(source: Source<Animal>) { /* ... */ }
handleAnimals(dogSource) // Works — Source<Dog> is subtype of Source<Animal>
```

`List<T>` in Kotlin is declared as `List<out T>`, which is why you can pass a `List<Dog>` where `List<Animal>` is expected.

#### What does contravariance mean? Explain the in keyword.

Contravariance is the opposite — if `Dog` is a subtype of `Animal`, then `Consumer<Animal>` is a subtype of `Consumer<Dog>`. You declare contravariance using `in`. A type parameter marked `in` can only appear in input positions.

```kotlin
interface Consumer<in T> {
    fun consume(item: T)
    // fun produce(): T // compile error — T in output position
}

val animalConsumer: Consumer<Animal> = /* ... */
fun feedDogs(consumer: Consumer<Dog>) { /* ... */ }
feedDogs(animalConsumer) // Works — Consumer<Animal> is subtype of Consumer<Dog>
```

This makes sense intuitively — a consumer that can handle any `Animal` can certainly handle a `Dog`.

#### What is the PECS principle and how does it apply in Kotlin?

PECS stands for "Producer Extends, Consumer Super" — from Java's `? extends T` and `? super T`. In Kotlin, the equivalent is `out` for producers and `in` for consumers.

- **Producer** — You only read from it, so use `out`.
- **Consumer** — You only write to it, so use `in`.

If you do both read and write, you can't use variance — the type must be invariant.

#### How does variance work with MutableList vs List?

`List<T>` is declared as `List<out T>` — covariant because it's read-only. `MutableList<T>` is invariant because it both reads and writes. A `MutableList<Dog>` is NOT a subtype of `MutableList<Animal>`.

This is necessary for type safety. If `MutableList<Dog>` were a subtype of `MutableList<Animal>`, you could add a `Cat` through the `Animal` reference:

```kotlin
val dogs: MutableList<Dog> = mutableListOf(Dog("Rex"))
// If this were allowed:
val animals: MutableList<Animal> = dogs
animals.add(Cat("Whiskers")) // Cat in a Dog list!
val dog: Dog = dogs[1] // ClassCastException
```

Java arrays allow this and throw `ArrayStoreException` at runtime. Kotlin prevents it at compile time.

#### What is the difference between star projection and a generic type?

Star projection `*` represents an unknown type. `T` is a type parameter that must be specified. You use `*` when you don't care about the specific type.

```kotlin
fun printAll(items: List<*>) {
    items.forEach { println(it) } // read as Any?
}

fun <T> filterItems(items: List<T>, predicate: (T) -> Boolean): List<T> {
    return items.filter(predicate) // T is consistent
}
```

With star projection, you can read elements as `Any?` but you can't write to the collection.

#### What are generic constraints and the where clause?

Generic constraints restrict what types can be used as type arguments. A single upper bound uses `T : SomeType`. Multiple upper bounds use the `where` clause.

```kotlin
fun <T : Comparable<T>> sort(list: List<T>) { /* ... */ }

fun <T> processItem(item: T)
    where T : Serializable,
          T : Comparable<T> {
    // T must implement both
}
```

Without constraints, `T` has an implicit upper bound of `Any?`. Use `T : Any` to restrict to non-null types.

#### What is the difference between declaration-site and use-site variance?

Declaration-site variance puts `in` or `out` on the class declaration itself — it applies everywhere that type is used. `List<out E>` is declaration-site.

Use-site variance applies `in` or `out` at the point of use. This is Java's wildcard approach, and Kotlin supports it too.

```kotlin
// Declaration-site
interface Source<out T> {
    fun next(): T
}

// Use-site — Array is invariant, but we only read from source
fun <T> copyArray(source: Array<out T>, dest: Array<in T>) {
    for (i in source.indices) {
        dest[i] = source[i]
    }
}
```

Use use-site variance when the class is invariant but your function only reads or only writes.

#### What is the reified keyword and why does it require inline?

`reified` allows you to access type information of a generic at runtime. Normally, types are erased. When a function is `inline`, the compiler copies the function body to every call site and substitutes the actual type.

```kotlin
inline fun <reified T> isType(value: Any): Boolean {
    return value is T
}

inline fun <reified T : Activity> startActivity(context: Context) {
    val intent = Intent(context, T::class.java)
    context.startActivity(intent)
}

startActivity<PaymentActivity>(context)
```

Without `inline`, the function exists as a single compiled method where `T` is erased. With `inline`, the compiler knows the concrete type at each call site.

#### Can you use reified with classes?

No. `reified` only works with inline functions. You can't inline a class. If you need runtime type information in a class, pass a `KClass<T>` parameter:

```kotlin
class TypedParser<T : Any>(private val type: KClass<T>) {
    fun parse(json: String): T {
        return gson.fromJson(json, type.java)
    }
}

val parser = TypedParser(User::class)
```

#### How does Nothing type work in generics?

`Nothing` is the bottom type — a subtype of every other type. No value can ever be of type `Nothing`. `List<Nothing>` is a subtype of `List<T>` for any `T` (when `T` is covariant).

`emptyList()` returns `List<Nothing>`, which is why you can assign it to any `List<T>`:

```kotlin
val strings: List<String> = emptyList()
val ints: List<Int> = emptyList()
```

Functions that never return (like `error()` or `throw`) have return type `Nothing`, which is useful in `when` expressions where every branch must produce a value.

#### What are the differences between Class<T>, KClass<T>, and reified T?

- **Class<T>** — Java's runtime type token. Used with Java reflection and libraries like Gson. Get it via `T::class.java`.
- **KClass<T>** — Kotlin's runtime type token. Used with Kotlin reflection. Provides Kotlin-specific metadata like `isData`, `sealedSubclasses`.
- **reified T** — Compile-time substitution. No runtime overhead. Only available in inline functions.

```kotlin
inline fun <reified T> parse(json: String): T {
    return Gson().fromJson(json, T::class.java)
}

fun <T : Any> parse(json: String, type: KClass<T>): T {
    return Gson().fromJson(json, type.java)
}
```

Prefer `reified` for cleaner call-site syntax. Fall back to `KClass<T>` when you need the type in a class or non-inline function.

#### Explain type projection with a real example.

Type projection is use-site variance — applying `out` or `in` at the point of use. You use it when a class is invariant but your function doesn't need full read-write access.

```kotlin
fun <T> copyArray(source: Array<out T>, dest: Array<in T>) {
    for (i in source.indices) {
        dest[i] = source[i]
    }
}

val strings: Array<String> = arrayOf("hello", "world")
val objects: Array<Any> = arrayOf("a", "b")
copyArray(strings, objects) // Works with type projection
```

Without `out` on `source`, you couldn't pass `Array<String>` where `Array<Any>` is expected because `Array` is invariant.

#### What happens when you combine multiple generic constraints with variance?

When you combine upper bounds with variance, the constraints must be compatible. An `out` type parameter can only have covariant or invariant upper bounds.

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

With the `where` clause, all constraints must be satisfied simultaneously.

### Common Follow-ups

- What's the difference between `List<*>` and `List<Any?>`? Can you write to either?
- Why does Kotlin use `in`/`out` instead of Java's `? extends`/`? super`?
- How does type erasure affect equality checks — can you compare `List<String>::class` and `List<Int>::class`?
- Can you combine `reified` with variance?
- How do sealed classes interact with generics?
- What's the difference between `T : Any` and `T : Any?` as a generic constraint?
- How do value classes behave with generic type parameters?
