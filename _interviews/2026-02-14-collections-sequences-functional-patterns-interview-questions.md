---
title: "Collections, Sequences & Functional Patterns"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 3
sequence: 3
description: "Collections and functional operations come up in almost every Kotlin interview."
---

## Collections, Sequences & Functional Patterns

Collections and functional operations come up in almost every Kotlin interview. Interviewers want to see if you understand how data flows through transformations, when lazy evaluation matters, and whether you can use delegation and destructuring beyond textbook examples.

#### What is the difference between List and MutableList in Kotlin?

`List` is a read-only interface — you can read elements but can't add, remove, or modify them. `MutableList` extends `List` and adds mutation operations like `add()`, `remove()`, and `set()`. Under the hood, `listOf()` returns a `java.util.Arrays$ArrayList` (fixed-size), while `mutableListOf()` returns a `java.util.ArrayList`.

`List` being read-only doesn't mean immutable. If you cast a `List` to `MutableList`, you can mutate it. The read-only interface is a compile-time contract, not a runtime guarantee.

#### What does map do, and how is it different from flatMap?

`map` transforms each element and returns a list of the same size. `flatMap` transforms each element into a collection and flattens all those collections into a single list.

```kotlin
val orders = listOf(
    Order(items = listOf("Laptop", "Mouse")),
    Order(items = listOf("Keyboard"))
)

val nested = orders.map { it.items }
// [["Laptop", "Mouse"], ["Keyboard"]]

val allItems = orders.flatMap { it.items }
// ["Laptop", "Mouse", "Keyboard"]
```

Use `flatMap` when each element maps to multiple results and you want a single flat list.

#### What is the difference between fold and reduce?

Both accumulate a result by applying an operation across the collection. `reduce` uses the first element as the initial accumulator, so it fails on empty collections. `fold` takes an explicit initial value, works safely on empty collections, and can return a different type.

```kotlin
val prices = listOf(10.0, 25.0, 15.0)

val total = prices.reduce { acc, price -> acc + price } // 50.0

val receipt = prices.fold("Items: ") { acc, price ->
    "$acc$$price "
}
```

Use `fold` when you need an initial value or a different return type. Use `reduce` when the accumulation is the same type and the collection is non-empty.

#### Explain groupBy and associateBy. When do you use each?

`groupBy` creates a `Map<K, List<V>>` — each key maps to a list of matching elements. `associateBy` creates a `Map<K, V>` — each key maps to a single element. If multiple elements share the same key in `associateBy`, only the last one is kept.

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

Use `groupBy` when multiple elements can share a key. Use `associateBy` when keys are unique.

#### What do partition, chunked, and windowed do?

`partition` splits a collection into two lists based on a predicate. `chunked` breaks a collection into fixed-size sublists. `windowed` creates a sliding window over the collection — unlike `chunked`, windows can overlap.

```kotlin
val numbers = listOf(1, 2, 3, 4, 5, 6)

val (even, odd) = numbers.partition { it % 2 == 0 }

val chunks = numbers.chunked(2)
// [[1, 2], [3, 4], [5, 6]]

val windows = numbers.windowed(3, step = 1)
// [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]
```

`windowed` is useful for computing moving averages. `chunked` works well for batching API requests or paginating data.

#### What is destructuring in Kotlin and how does it work?

Destructuring lets you unpack an object into multiple variables. The compiler translates destructuring into calls to `component1()`, `component2()`, etc. Data classes generate these automatically for each property in the primary constructor.

```kotlin
data class Coordinate(val lat: Double, val lng: Double)

val location = Coordinate(37.7749, -122.4194)
val (latitude, longitude) = location
// Compiles to:
// val latitude = location.component1()
// val longitude = location.component2()
```

You can destructure in `for` loops, lambda parameters, and `let`/`apply` blocks. Maps support destructuring because `Map.Entry` has `component1()` (key) and `component2()` (value). You can add destructuring to any class by defining `operator fun componentN()` functions.

#### What is operator overloading in Kotlin?

Operator overloading lets you define custom behavior for operators like `+`, `-`, `*`, `[]`, and `invoke` by implementing specific named functions with the `operator` modifier. Kotlin maps each operator to a named function — `+` maps to `plus()`, `[]` maps to `get()` and `set()`.

```kotlin
data class Money(val amount: Long, val currency: String) {
    operator fun plus(other: Money): Money {
        require(currency == other.currency)
        return Money(amount + other.amount, currency)
    }
}

val total = Money(100, "USD") + Money(50, "USD")
```

Don't overload operators in ways that break expectations. `+` on `Money` makes sense. `+` on a `User` does not.

#### What is the by keyword in Kotlin? What are property delegates?

The `by` keyword is used for delegation — both class delegation and property delegation. For properties, `by` delegates the getter (and setter for `var`) to another object.

Built-in delegates:
- **lazy** — Initializes the value on first access and caches it. Thread-safe by default.
- **observable** — Calls a callback whenever the value changes, after the assignment.
- **vetoable** — Callback runs before the assignment and can reject the new value.
- **map** — Reads property values from a `Map`, using the property name as the key.

```kotlin
class UserProfile(map: Map<String, Any?>) {
    val name: String by map
    val email: String by map
}

val profile = UserProfile(mapOf("name" to "Alice", "email" to "a@b.com"))
println(profile.name) // "Alice"
```

#### Explain Sequence vs Iterable. When does using a Sequence matter?

`Iterable` operations are eager — each transformation creates a new intermediate list. `Sequence` operations are lazy — elements are processed one at a time through the entire chain with no intermediate lists.

```kotlin
// Eager — creates 2 intermediate lists, processes all 1M elements
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

Sequences win when you have large collections or expensive operations with early termination (`take`, `first`, `find`). For small collections (under ~100 elements), the overhead of Sequence's iterator machinery can actually make it slower.

#### What are intermediate and terminal operations on a Sequence?

Intermediate operations like `filter`, `map`, `flatMap`, `take`, and `drop` return another Sequence and do nothing until a terminal operation triggers execution.

Terminal operations like `toList()`, `toSet()`, `first()`, `count()`, `forEach()`, and `sum()` trigger actual processing. Without a terminal operation, no element is ever evaluated. This is the same model as Java Streams, but Sequences don't support parallel processing.

#### What is the difference between Sequence and Flow?

`Sequence` is synchronous — it processes elements one by one on the calling thread using an `Iterator`. `Flow` is asynchronous — it's built on coroutines and can suspend, switch dispatchers, and handle backpressure.

Use Sequence for in-memory transformations on local data. Use Flow when the data source involves I/O, network calls, or when data arrives over time.

#### How does lazy delegation work internally?

`lazy` creates a `Lazy<T>` instance that computes the value on first access and caches it. The default mode is `SYNCHRONIZED`, which uses double-checked locking. Other modes are `PUBLICATION` (multiple threads compute but only the first result is used) and `NONE` (no synchronization).

```kotlin
val heavyObject: HeavyObject by lazy { HeavyObject() }

// Use NONE on Android main thread properties
val adapter: RecyclerAdapter by lazy(LazyThreadSafetyMode.NONE) {
    RecyclerAdapter(items)
}
```

On Android, most UI properties are only accessed from the main thread. Using `NONE` avoids unnecessary synchronization overhead.

#### How do observable and vetoable delegates work?

`observable` takes an initial value and a callback that fires after every change. You can't prevent the change — it's already happened when the callback runs.

`vetoable` fires the callback before the assignment. If the callback returns `false`, the assignment is rejected.

```kotlin
var quantity: Int by Delegates.vetoable(0) { _, _, newValue ->
    newValue >= 0 // reject negative values
}

quantity = 5  // accepted
quantity = -1 // rejected, stays 5
```

Use `observable` when you need to react to changes (update UI, log analytics). Use `vetoable` when you need to enforce invariants.

#### How do you write a custom property delegate?

A custom delegate implements `ReadOnlyProperty<T, V>` for `val` or `ReadWriteProperty<T, V>` for `var`.

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

var username: String by SharedPrefDelegate(prefs, "username", "")
```

Custom delegates are powerful for cross-cutting concerns — SharedPreferences, database access, dependency injection.

#### Explain class delegation with the by keyword.

Class delegation lets a class implement an interface by forwarding all calls to a delegate object. The compiler generates the forwarding methods at compile time.

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

With inheritance, `NetworkClient` would need to extend a Logger class, consuming its single inheritance slot. With delegation, it can implement multiple interfaces by delegating each to a different object. You can override specific methods while the rest are forwarded.

#### How does the order of collection operations affect performance?

Putting `filter` before `map` processes fewer elements through the map step. Putting `map` before `filter` transforms every element first, then filters.

```kotlin
val users = loadAllUsers() // 10,000 users

// Better — filter first, then transform 500 active users
val names = users
    .filter { it.isActive }
    .map { "${it.firstName} ${it.lastName}" }

// Worse — transform all 10,000, then filter
val names = users
    .map { "${it.firstName} ${it.lastName}" }
    .filter { it.isNotBlank() }
```

With Sequences this matters even more because operations are applied per-element. Moving `filter` before `map` means elements that don't pass the filter never reach the map.

#### How do you transform a Map using Kotlin's collection functions?

Maps have their own transformation functions. `mapValues` transforms values while keeping keys, `mapKeys` transforms keys, and `filterKeys`/`filterValues` filter specifically.

```kotlin
val prices = mapOf("laptop" to 999, "mouse" to 29, "keyboard" to 79)

val discounted = prices.mapValues { (_, price) -> price * 0.9 }

val expensive = prices.filterValues { it > 50 }

val pairs = prices.map { (name, price) -> "$name: $$price" }
```

#### What does buildList do and why is it useful?

`buildList` creates a list using a builder lambda where you can call mutable operations but the returned list is read-only.

```kotlin
val filteredUsers = buildList {
    add(adminUser)
    addAll(activeUsers)
    if (includeGuests) {
        addAll(guestUsers.filter { it.isVerified })
    }
}
```

There are matching `buildSet` and `buildMap` functions. These are cleaner than creating a `mutableListOf()`, populating it, and then calling `.toList()`.

#### What is the difference between associate, associateBy, and associateWith?

All three create a `Map` from a collection, but they differ in what you control:

- **associate** — You provide both the key and value: `list.associate { it.id to it.name }`
- **associateBy** — You provide the key, the element itself is the value: `list.associateBy { it.id }`
- **associateWith** — The element is the key, you provide the value: `list.associateWith { it.name.length }`

```kotlin
val users = listOf(User("u1", "Alice"), User("u2", "Bob"))

val idToUser = users.associateBy { it.id }       // {u1=Alice, u2=Bob}
val userToLen = users.associateWith { it.name.length } // {Alice=5, Bob=3}
val idToName = users.associate { it.id to it.name }    // {u1=Alice, u2=Bob}
```

### Common Follow-ups

- When would you use `asSequence()` on a small collection and still see a benefit?
- How does `sortedBy` compare to `sortedWith` for multi-field sorting?
- Can you destructure a Triple? What about a class with only `component1()`?
- What happens if a `lazy` property throws an exception on first access?
- Does `Delegates.observable` fire the callback on the initial value assignment?
- How would you implement a cache using a custom property delegate with expiration?
- Can you combine class delegation and property delegation in the same class?
