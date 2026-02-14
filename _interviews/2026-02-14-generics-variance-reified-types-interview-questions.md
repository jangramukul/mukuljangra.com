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

Here's the thing about generics in interviews — they sound simple until someone asks you to explain variance. Then suddenly you're drawing arrows on a whiteboard trying to remember which direction `in` and `out` go. This topic shows up in almost every Kotlin round, and interviewers love going deep into variance and reified types to see if you really get how Kotlin's type system works under the hood.

#### What are generics in Kotlin and why do we need them?

Think of generics like a vending machine that only accepts one type of coin. Without generics, you'd have a machine that takes anything — coins, buttons, bottle caps — and you'd only find out something went wrong when you try to use what comes out. Generics let you write classes and functions that work with any type while the compiler enforces type safety at compile time. Without them, you'd either lose type safety by using `Any` everywhere or copy-paste the same code for every type.

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

Type erasure is the JVM's way of saying "I don't remember what you told me." At compile time, the compiler knows your `List<String>` from your `List<Int>`. But at runtime? They're both just `List`. The JVM strips out all generic type information in the bytecode.

This means you can't do `if (value is List<String>)` at runtime — the best you can get is `if (value is List<*>)`. You also can't create instances of a generic type directly — `T()` won't compile because `T` doesn't exist at runtime.

> **🧠 Think about it:** If the JVM erases all type information at runtime, how does Kotlin's `reified` keyword manage to preserve it?

#### What does covariance mean? Explain the out keyword.

Here's a simple way to think about it. If a Dog is an Animal, shouldn't a list of Dogs also be a list of Animals? That's covariance — the subtype relationship flows in the same direction. You declare it in Kotlin using `out`. The catch is that a type parameter marked `out` can only appear in output positions — return types, not function parameters. It's like a vending machine: you can take things out, but you can't put things in.

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

Now this one trips people up because the subtype relationship flips. If Dog is a subtype of Animal, then `Consumer<Animal>` becomes a subtype of `Consumer<Dog>`. You declare it using `in`, and the type parameter can only appear in input positions.

```kotlin
interface Consumer<in T> {
    fun consume(item: T)
    // fun produce(): T // compile error — T in output position
}

val animalConsumer: Consumer<Animal> = /* ... */
fun feedDogs(consumer: Consumer<Dog>) { /* ... */ }
feedDogs(animalConsumer) // Works — Consumer<Animal> is subtype of Consumer<Dog>
```

But wait — why does this make sense? Think of it like a trash bin. A bin that accepts any garbage (Animal) can definitely handle dog waste (Dog). A consumer that can handle any Animal can certainly handle a Dog.

#### What is the PECS principle and how does it apply in Kotlin?

PECS stands for "Producer Extends, Consumer Super" — it's Java's mnemonic for `? extends T` and `? super T`. In Kotlin, it maps directly to `out` and `in`.

- **Producer** — You only read from it, so use `out`.
- **Consumer** — You only write to it, so use `in`.

If you do both read and write, you can't use variance — the type must be invariant. It's like a door — if it only opens outward, it's `out`. If it only opens inward, it's `in`. If it swings both ways, you can't restrict it.

#### How does variance work with MutableList vs List?

`List<T>` is declared as `List<out T>` — covariant because it's read-only. `MutableList<T>` is invariant because it both reads and writes. So a `MutableList<Dog>` is NOT a subtype of `MutableList<Animal>`.

Here's why that matters. If the compiler allowed it, you could sneak a Cat into a Dog list through the Animal reference:

```kotlin
val dogs: MutableList<Dog> = mutableListOf(Dog("Rex"))
// If this were allowed:
val animals: MutableList<Animal> = dogs
animals.add(Cat("Whiskers")) // Cat in a Dog list!
val dog: Dog = dogs[1] // ClassCastException
```

Java arrays actually allow this and throw `ArrayStoreException` at runtime. Kotlin is smarter — it catches this at compile time.

> **🧠 Think about it:** If `List` is covariant (`out`) and `MutableList` is invariant, what does that tell you about why Kotlin separates read-only and mutable collections in the first place?

#### What is the difference between star projection and a generic type?

Star projection `*` is basically you telling the compiler "I have no idea what type this is, and I don't care." It represents an unknown type. `T`, on the other hand, is a type parameter you define and the compiler tracks consistently.

```kotlin
fun printAll(items: List<*>) {
    items.forEach { println(it) } // read as Any?
}

fun <T> filterItems(items: List<T>, predicate: (T) -> Boolean): List<T> {
    return items.filter(predicate) // T is consistent
}
```

With star projection, you can read elements as `Any?` but you can't write to the collection. Think of it like peeking into a mystery box — you can look, but you're not allowed to put anything back in because you don't know what belongs there.

#### What are generic constraints and the where clause?

Generic constraints are your bouncer at the door — they decide which types are allowed in. A single upper bound uses `T : SomeType`. When you need multiple bouncers checking different things, you use the `where` clause.

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

Declaration-site variance is like putting a permanent sign on a building — you put `in` or `out` on the class declaration itself, and it applies everywhere that type is used. `List<out E>` is declaration-site.

Use-site variance is more like a temporary badge — you apply `in` or `out` at the point of use. This is Java's wildcard approach, and Kotlin supports it too.

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

Here's the thing — normally, type erasure means your generic type `T` vanishes at runtime. But `reified` is Kotlin's clever workaround. When a function is `inline`, the compiler copy-pastes the function body into every call site. And since it knows the concrete type at each call site, it can substitute the real type right there. No erasure, no problem.

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

Without `inline`, the function exists as a single compiled method where `T` is erased. With `inline`, the compiler knows the concrete type at each call site. It's like the difference between a form letter ("Dear Customer") and a mail merge ("Dear Mukul") — inlining lets the compiler fill in the actual name.

> **🧠 Think about it:** If `reified` requires `inline`, and inlining copies the function body everywhere, what would happen to your APK size if you had a huge `reified` function called from 50 places?

#### Can you use reified with classes?

Nope. `reified` only works with inline functions, and you can't inline a class. If you need runtime type information in a class, the workaround is to pass a `KClass<T>` parameter explicitly:

```kotlin
class TypedParser<T : Any>(private val type: KClass<T>) {
    fun parse(json: String): T {
        return gson.fromJson(json, type.java)
    }
}

val parser = TypedParser(User::class)
```

#### How does Nothing type work in generics?

`Nothing` is the bottom type — a subtype of literally every other type. No value can ever be of type `Nothing`. It's like the universal donor in blood types — it fits everywhere, but nothing fits into it.

`emptyList()` returns `List<Nothing>`, which is why you can assign it to any `List<T>`:

```kotlin
val strings: List<String> = emptyList()
val ints: List<Int> = emptyList()
```

Functions that never return (like `error()` or `throw`) have return type `Nothing`, which is useful in `when` expressions where every branch must produce a value.

#### What are the differences between Class<T>, KClass<T>, and reified T?

Three ways to get type information, each with different tradeoffs:

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

Type projection is use-site variance — you slap `out` or `in` at the point of use when the class itself is invariant but your function doesn't need full read-write access. It's like borrowing someone's car with the agreement that you'll only drive it forward, not reverse.

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

When you combine upper bounds with variance, the constraints must play nice together. An `out` type parameter can only have covariant or invariant upper bounds — you can't mix conflicting directions.

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

With the `where` clause, all constraints must be satisfied simultaneously. Think of it as a job posting — the candidate must meet every requirement, not just pick one.

### Common Follow-ups

- What's the difference between `List<*>` and `List<Any?>`? Can you write to either?
- Why does Kotlin use `in`/`out` instead of Java's `? extends`/`? super`?
- How does type erasure affect equality checks — can you compare `List<String>::class` and `List<Int>::class`?
- Can you combine `reified` with variance?
- How do sealed classes interact with generics?
- What's the difference between `T : Any` and `T : Any?` as a generic constraint?
- How do value classes behave with generic type parameters?
