---
title: "Collections, Sequences & Functional Patterns"
date: 2026-02-14
layout: interview
tags: [Kotlin Round]
order: 9
level: junior
sequence: 11
---

## Collections, Sequences & Functional Patterns

Collections and functional operations come up in almost every Kotlin interview. Interviewers want to see if you understand how data flows through transformations, when lazy evaluation matters, and whether you can use delegation and destructuring beyond textbook examples.

### Core Questions (Beginner → Intermediate)

#### Q1: What is the difference between List and MutableList in Kotlin?

`List` is a read-only interface — you can read elements but can't add, remove, or modify them. `MutableList` extends `List` and adds mutation operations like `add()`, `remove()`, and `set()`. Under the hood, `listOf()` returns a `java.util.Arrays$ArrayList` which is a fixed-size list, while `mutableListOf()` returns a `java.util.ArrayList`.

One thing to note — `List` being read-only doesn't mean immutable. If you cast a `List` to `MutableList`, you can mutate it. The read-only interface is a compile-time contract, not a runtime guarantee.

#### Q2: What does map do, and how is it different from flatMap?

`map` transforms each element and returns a list of the same size. `flatMap` transforms each element into a collection and then flattens all those collections into a single list.

```kotlin
val orders = listOf(
    Order(items = listOf("Laptop", "Mouse")),
    Order(items = listOf("Keyboard"))
)

// map gives List<List<String>>
val nested = orders.map { it.items }
// [["Laptop", "Mouse"], ["Keyboard"]]

// flatMap gives List<String>
val allItems = orders.flatMap { it.items }
// ["Laptop", "Mouse", "Keyboard"]
```

Use `flatMap` when each element maps to multiple results and you want a single flat list.

#### Q3: What is the difference between fold and reduce?

Both accumulate a result by applying an operation across the collection. `reduce` uses the first element as the initial accumulator, so it fails on empty collections with an `UnsupportedOperationException`. `fold` takes an explicit initial value, which means it works safely on empty collections and can return a different type than the collection's element type.

```kotlin
val prices = listOf(10.0, 25.0, 15.0)

val total = prices.reduce { acc, price -> acc + price } // 50.0

val receipt = prices.fold("Items: ") { acc, price ->
    "$acc$$price "
} // "Items: $10.0 $25.0 $15.0 "
```

Use `fold` when you need an initial value or a different return type. Use `reduce` when the accumulation is the same type and you know the collection is non-empty.

#### Q4: Explain groupBy and associateBy. When do you use each?

`groupBy` creates a `Map<K, List<V>>` — it groups elements by a key and each key maps to a list of matching elements. `associateBy` creates a `Map<K, V>` — each key maps to a single element. If multiple elements share the same key in `associateBy`, only the last one is kept.

```kotlin
val employees = listOf(
    Employee("Alice", "Engineering"),
    Employee("Bob", "Engineering"),
    Employee("Carol", "Design")
)

val byDept = employees.groupBy { it.department }
// {"Engineering": [Alice, Bob], "Design": [Carol]}

val byName = employees.associateBy { it.name }
// {"Alice": Alice, "Bob": Bob, "Carol": Carol}
```

Use `groupBy` when multiple elements can share a key. Use `associateBy` when keys are unique, like mapping by ID.

#### Q5: What do partition, chunked, and windowed do?

`partition` splits a collection into two lists based on a predicate — first list contains elements matching the predicate, second contains the rest. It returns a `Pair<List<T>, List<T>>`.

`chunked` breaks a collection into fixed-size sublists. The last chunk may be smaller if the collection size isn't evenly divisible.

`windowed` creates a sliding window over the collection. Unlike `chunked`, windows can overlap.

```kotlin
val numbers = listOf(1, 2, 3, 4, 5, 6)

val (even, odd) = numbers.partition { it % 2 == 0 }
// even = [2, 4, 6], odd = [1, 3, 5]

val chunks = numbers.chunked(2)
// [[1, 2], [3, 4], [5, 6]]

val windows = numbers.windowed(3, step = 1)
// [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]
```

`windowed` is useful for computing moving averages or comparing consecutive elements. `chunked` works well for batching API requests or paginating data.

#### Q6: What is destructuring in Kotlin and how does it work under the hood?

Destructuring lets you unpack an object into multiple variables. The compiler translates destructuring into calls to `component1()`, `component2()`, etc. Data classes generate these functions automatically for each property in the primary constructor, in declaration order.

```kotlin
data class Coordinate(val lat: Double, val lng: Double)

val location = Coordinate(37.7749, -122.4194)
val (latitude, longitude) = location
// Compiles to:
// val latitude = location.component1()
// val longitude = location.component2()
```

You can destructure in `for` loops, lambda parameters, and `let`/`apply` blocks. Maps support destructuring because `Map.Entry` has `component1()` (key) and `component2()` (value). You can add destructuring to any class by defining `operator fun componentN()` functions.

#### Q7: What is operator overloading in Kotlin? Give a practical example.

Operator overloading lets you define custom behavior for operators like `+`, `-`, `*`, `[]`, and `invoke` by implementing specific named functions with the `operator` modifier. Kotlin maps each operator to a named function — `+` maps to `plus()`, `[]` maps to `get()` and `set()`, `()` maps to `invoke()`.

```kotlin
data class Money(val amount: Long, val currency: String) {
    operator fun plus(other: Money): Money {
        require(currency == other.currency)
        return Money(amount + other.amount, currency)
    }

    operator fun compareTo(other: Money): Int {
        require(currency == other.currency)
        return amount.compareTo(other.amount)
    }
}

val total = Money(100, "USD") + Money(50, "USD")
// Money(150, "USD")
```

Don't overload operators in ways that break expectations. `+` on a `Money` class makes sense. `+` on a `User` class does not. Kotlin intentionally doesn't allow you to invent new operators — only override existing ones.

#### Q8: What is the by keyword in Kotlin? What are property delegates?

The `by` keyword is used for delegation — both class delegation and property delegation. For properties, `by` delegates the getter (and setter for `var`) to another object that implements the `ReadOnlyProperty` or `ReadWriteProperty` interface.

Kotlin provides several built-in delegates:
- **`lazy`** — Initializes the value on first access and caches it. Thread-safe by default (`LazyThreadSafetyMode.SYNCHRONIZED`).
- **`observable`** — Calls a callback whenever the value changes, after the assignment.
- **`vetoable`** — Similar to `observable`, but the callback runs before the assignment and can reject the new value by returning `false`.
- **`map`** — Reads property values from a `Map`, using the property name as the key.

```kotlin
class UserProfile(map: Map<String, Any?>) {
    val name: String by map
    val email: String by map
}

val profile = UserProfile(mapOf("name" to "Alice", "email" to "a@b.com"))
println(profile.name) // "Alice"
```

The `map` delegate is useful for parsing JSON or config data where keys match property names.

### Deep Dive Questions (Advanced → Expert)

#### Q9: Explain Sequence vs Iterable. When does using a Sequence actually matter?

`Iterable` operations are eager — each transformation creates a new intermediate list. If you chain `.filter().map().take()`, the filter runs on every element and creates a list, then map runs on every filtered element and creates another list, then take returns the first N.

`Sequence` operations are lazy — elements are processed one at a time through the entire chain. No intermediate lists are created. An element goes through filter, then map, then take, before the next element starts.

```kotlin
// Eager — creates 2 intermediate lists
val result = (1..1_000_000)
    .filter { it % 2 == 0 }
    .map { it * 2 }
    .take(10)

// Lazy — processes element by element, stops after 10
val result = (1..1_000_000).asSequence()
    .filter { it % 2 == 0 }
    .map { it * 2 }
    .take(10)
    .toList()
```

Sequences win when you have large collections or expensive operations with early termination (`take`, `first`, `find`). The eager version processes all 1 million elements through filter and map before taking 10. The lazy version stops as soon as it finds 10 matching elements. For small collections (under ~100 elements), the overhead of Sequence's iterator machinery can actually make it slower than eager evaluation.

#### Q10: What are intermediate and terminal operations on a Sequence?

Intermediate operations like `filter`, `map`, `flatMap`, `take`, and `drop` return another Sequence and do nothing until a terminal operation triggers execution. They just build up a pipeline of transformations.

Terminal operations like `toList()`, `toSet()`, `first()`, `count()`, `forEach()`, and `sum()` trigger the actual processing. Without a terminal operation, no element is ever evaluated. This is the same model as Java Streams, but Sequences are simpler — they don't support parallel processing and are just an `Iterator` wrapper underneath.

#### Q11: How does lazy delegation work internally? What are the thread safety modes?

`lazy` creates a `Lazy<T>` instance that computes the value on first access and caches it. The default mode is `SYNCHRONIZED`, which uses a lock to ensure only one thread initializes the value. The other modes are `PUBLICATION` (multiple threads can compute the value but only the first result is used) and `NONE` (no synchronization, fastest but unsafe for multi-threaded access).

```kotlin
// Default — synchronized, safe but has lock overhead
val heavyObject: HeavyObject by lazy { HeavyObject() }

// Use NONE on Android main thread properties
val adapter: RecyclerAdapter by lazy(LazyThreadSafetyMode.NONE) {
    RecyclerAdapter(items)
}
```

On Android, most UI properties are only accessed from the main thread. Using `LazyThreadSafetyMode.NONE` avoids unnecessary synchronization overhead. The compiled bytecode for `SYNCHRONIZED` mode uses a `volatile` field and double-checked locking, similar to the classic Java singleton pattern.

#### Q12: How do observable and vetoable delegates work? When would you use vetoable over observable?

`observable` takes an initial value and a callback that fires after every change. The callback receives the property, old value, and new value. You can't prevent the change — it's already happened when the callback runs.

`vetoable` fires the callback before the assignment. If the callback returns `false`, the assignment is rejected and the property keeps its old value. This is useful for validation.

```kotlin
var quantity: Int by Delegates.vetoable(0) { _, _, newValue ->
    newValue >= 0 // reject negative values
}

quantity = 5  // accepted, quantity = 5
quantity = -1 // rejected, quantity stays 5
```

Use `observable` when you need to react to changes (update UI, log analytics). Use `vetoable` when you need to enforce invariants (non-negative values, max length, valid ranges).

#### Q13: How do you write a custom property delegate?

A custom delegate implements `ReadOnlyProperty<T, V>` for `val` or `ReadWriteProperty<T, V>` for `var`. The `getValue` and `setValue` operators receive the property owner and property metadata.

```kotlin
class SharedPrefDelegate<T>(
    private val prefs: SharedPreferences,
    private val key: String,
    private val default: T
) : ReadWriteProperty<Any?, T> {

    @Suppress("UNCHECKED_CAST")
    override fun getValue(thisRef: Any?, property: KProperty<*>): T {
        return prefs.all[key] as? T ?: default
    }

    override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
        prefs.edit { putString(key, value.toString()) }
    }
}

// Usage
var username: String by SharedPrefDelegate(prefs, "username", "")
```

Custom delegates are powerful for cross-cutting concerns — SharedPreferences, database access, dependency injection, argument parsing. Libraries like Koin use delegates (`by inject()`) to provide dependency injection.

#### Q14: Explain class delegation with the by keyword. How is it different from inheritance?

Class delegation lets a class implement an interface by forwarding all calls to a delegate object. The compiler generates the forwarding methods at compile time, so there's no runtime reflection overhead.

```kotlin
interface Logger {
    fun log(message: String)
    fun error(message: String)
}

class ConsoleLogger : Logger {
    override fun log(message: String) = println("LOG: $message")
    override fun error(message: String) = println("ERROR: $message")
}

class NetworkClient(logger: Logger) : Logger by logger {
    fun fetchData() {
        log("Fetching data...")  // forwarded to logger
    }
}
```

With inheritance, `NetworkClient` would need to extend a Logger class, consuming its single inheritance slot. With delegation, it can implement multiple interfaces by delegating each to a different object. You can also override specific methods while delegating the rest — the overridden method takes priority over the delegate. This is the Decorator pattern built into the language.

#### Q15: What happens when you chain multiple collection operations? How does order affect performance?

The order of operations matters for both eager and lazy evaluation. Putting `filter` before `map` processes fewer elements through the map step. Putting `map` before `filter` transforms every element first, then filters.

```kotlin
val users = loadAllUsers() // 10,000 users

// Better — filter first, then transform 500 active users
val names = users
    .filter { it.isActive }
    .map { "${it.firstName} ${it.lastName}" }

// Worse — transform 10,000 names, then filter
val names = users
    .map { "${it.firstName} ${it.lastName}" }
    .filter { it.isNotBlank() }
```

With Sequences this matters even more because operations are applied per-element. Moving `filter` before `map` in a Sequence chain means elements that don't pass the filter never reach the map at all.

#### Q16: What is the difference between Sequence and Flow in Kotlin?

`Sequence` is synchronous — it processes elements one by one on the calling thread using an `Iterator`. `Flow` is asynchronous — it's built on coroutines and can suspend, switch dispatchers, and handle backpressure. Sequences block the thread while computing the next value. Flows suspend the coroutine.

Use Sequence for in-memory transformations on local data. Use Flow when the data source involves I/O, network calls, database queries, or when you need the data to arrive over time. Conceptually, Sequence is a lazy `Iterable` and Flow is a lazy reactive stream.

#### Q17: How would you transform a Map using Kotlin's collection functions?

Maps have their own set of transformation functions. `mapValues` transforms values while keeping keys, `mapKeys` transforms keys, and `filterKeys`/`filterValues` filter by key or value specifically. You can also use the general `map` function, which gives you `Map.Entry` and returns a `List<R>`.

```kotlin
val prices = mapOf("laptop" to 999, "mouse" to 29, "keyboard" to 79)

val discounted = prices.mapValues { (_, price) -> price * 0.9 }
// {laptop=899.1, mouse=26.1, keyboard=71.1}

val expensive = prices.filterValues { it > 50 }
// {laptop=999, keyboard=79}

val pairs = prices.map { (name, price) -> "$name: $$price" }
// ["laptop: $999", "mouse: $29", "keyboard: $79"]
```

#### Q18: What does the buildList function do and why is it useful?

`buildList` creates a list using a builder lambda where you can call mutable operations (`add`, `addAll`, `removeAll`) but the returned list is read-only. It combines the convenience of mutable construction with the safety of an immutable result.

```kotlin
val filteredUsers = buildList {
    add(adminUser)
    addAll(activeUsers)
    if (includeGuests) {
        addAll(guestUsers.filter { it.isVerified })
    }
}
// filteredUsers is List<User>, not MutableList
```

There are matching `buildSet` and `buildMap` functions. These are cleaner than creating a `mutableListOf()`, populating it, and then calling `.toList()` to get a read-only copy.

### Common Follow-ups

- When would you use `asSequence()` on a small collection and still see a benefit?
- How does `sortedBy` compare to `sortedWith` when you need multi-field sorting?
- Can you destructure a Triple? What about a class that only has `component1()` but not `component2()`?
- What happens if a `lazy` property throws an exception on first access — is the exception cached?
- How does `Delegates.observable` handle the initial value assignment — does the callback fire?
- What's the difference between `associate`, `associateBy`, and `associateWith`?
- How would you implement a cache using a custom property delegate with expiration?
- Can you combine class delegation and property delegation in the same class?
