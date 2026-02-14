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

Collections and functional operations come up in almost every Kotlin interview. If you can't explain how data flows through `filter`, `map`, and `flatMap` -- or when lazy beats eager -- you're going to have a rough time.

#### What is the difference between List and MutableList in Kotlin?

Think of `List` like a menu behind glass at a restaurant -- you can look at everything, but you can't reach in and change it. `MutableList` is the kitchen whiteboard -- you can add items, erase them, rearrange them however you want.

`List` is a read-only interface. You can read elements but can't `add()`, `remove()`, or `set()`. `MutableList` extends `List` and adds all those mutation operations. Under the hood, `listOf()` returns a `java.util.Arrays$ArrayList` (fixed-size), while `mutableListOf()` returns a `java.util.ArrayList`.

Here's the thing though -- read-only is not the same as immutable. If you cast a `List` to `MutableList`, you can absolutely mutate it. The read-only interface is a compile-time contract, not a runtime guarantee. The compiler trusts you. Don't betray that trust.

#### What does map do, and how is it different from flatMap?

`map` is a one-to-one transformation -- every element goes in, exactly one transformed element comes out. Same size list. `flatMap` is a one-to-many transformation that then squishes everything flat into a single list.

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

Picture it this way: `map` is like asking each person in a room for their name -- you get back one answer per person. `flatMap` is like asking each person for all their phone numbers -- some people have two, some have three -- and then dumping all those numbers into one big list. Use `flatMap` when each element maps to multiple results and you want a single flat list.

#### What is the difference between fold and reduce?

Both accumulate a result by applying an operation across the collection, but they start differently. `reduce` grabs the first element and says "okay, you're the starting point." That means it crashes on an empty collection -- there's nobody to start with. `fold` lets you bring your own starting value, so it works on empty collections and can even return a completely different type.

```kotlin
val prices = listOf(10.0, 25.0, 15.0)

val total = prices.reduce { acc, price -> acc + price } // 50.0

val receipt = prices.fold("Items: ") { acc, price ->
    "$acc$$price "
}
```

Notice how `fold` starts with a `String` and accumulates into a `String`, even though the list contains `Double` values. `reduce` can't do that -- it's locked into the collection's type. Use `fold` when you need an initial value or a different return type. Use `reduce` when the accumulation is the same type and you know the collection is non-empty.

#### Explain groupBy and associateBy. When do you use each?

`groupBy` is like sorting students into classrooms -- each classroom (key) can have multiple students (a list). `associateBy` is like assigning locker numbers -- each locker (key) holds exactly one student. If two students somehow get the same locker number, the second one kicks the first one out.

`groupBy` creates a `Map<K, List<V>>`. `associateBy` creates a `Map<K, V>`.

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

> **🧠 Think about it:** What happens if you call `associateBy` with a non-unique key -- say, grouping employees by department? Which employees survive, and which silently disappear?

#### What do partition, chunked, and windowed do?

Three different ways to slice up a collection, and they each solve a different problem.

`partition` is like standing at a fork in the road -- every element goes left or right based on a predicate. Two lists, that's it. `chunked` is like packing boxes -- you grab a fixed number of items, pack them into a box, grab the next batch, pack another box. `windowed` is like a magnifying glass sliding across a page -- it looks at a fixed-size window, then slides forward by some step. Unlike `chunked`, windows can overlap.

```kotlin
val numbers = listOf(1, 2, 3, 4, 5, 6)

val (even, odd) = numbers.partition { it % 2 == 0 }

val chunks = numbers.chunked(2)
// [[1, 2], [3, 4], [5, 6]]

val windows = numbers.windowed(3, step = 1)
// [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6]]
```

`windowed` is great for computing moving averages. `chunked` works well for batching API requests or paginating data.

#### What is destructuring in Kotlin and how does it work?

Destructuring lets you unpack an object into multiple variables in one shot. But here's what's actually happening behind the curtain -- the compiler translates destructuring into calls to `component1()`, `component2()`, etc. Data classes generate these automatically for each property in the primary constructor.

```kotlin
data class Coordinate(val lat: Double, val lng: Double)

val location = Coordinate(37.7749, -122.4194)
val (latitude, longitude) = location
// Compiles to:
// val latitude = location.component1()
// val longitude = location.component2()
```

You can destructure in `for` loops, lambda parameters, and `let`/`apply` blocks. Maps support destructuring because `Map.Entry` has `component1()` (key) and `component2()` (value). You can add destructuring to any class by defining `operator fun componentN()` functions -- it's not magic reserved for data classes.

#### What is operator overloading in Kotlin?

Operator overloading lets you teach Kotlin what `+`, `-`, `*`, `[]`, or `invoke` means for your own types. You do this by implementing specific named functions with the `operator` modifier. Kotlin maps each operator to a named function -- `+` maps to `plus()`, `[]` maps to `get()` and `set()`.

```kotlin
data class Money(val amount: Long, val currency: String) {
    operator fun plus(other: Money): Money {
        require(currency == other.currency)
        return Money(amount + other.amount, currency)
    }
}

val total = Money(100, "USD") + Money(50, "USD")
```

The golden rule: don't overload operators in ways that break expectations. `+` on `Money` makes sense -- everyone understands adding money. `+` on a `User` does not. What would that even mean? Merging two people?

#### What is the by keyword in Kotlin? What are property delegates?

The `by` keyword is Kotlin's way of saying "I don't want to do this myself -- let someone else handle it." It's used for both class delegation and property delegation. For properties, `by` delegates the getter (and setter for `var`) to another object.

Built-in delegates:
- **lazy** -- Initializes the value on first access and caches it. Thread-safe by default. Like a vending machine that only makes the coffee when you actually press the button.
- **observable** -- Calls a callback whenever the value changes, after the assignment. It's a notification, not a veto.
- **vetoable** -- Callback runs before the assignment and can reject the new value. The bouncer at the door.
- **map** -- Reads property values from a `Map`, using the property name as the key.

```kotlin
class UserProfile(map: Map<String, Any?>) {
    val name: String by map
    val email: String by map
}

val profile = UserProfile(mapOf("name" to "Alice", "email" to "a@b.com"))
println(profile.name) // "Alice"
```

> **🧠 Think about it:** If `lazy` is thread-safe by default, what's the cost of that safety? And when can you safely skip it?

#### Explain Sequence vs Iterable. When does using a Sequence matter?

Here's the best analogy for this one. A Sequence is like a conveyor belt -- each item goes through all the stations (filter, map, take) one at a time before the next item even gets on the belt. An Iterable is like a batch factory -- every item goes through station 1, then every item goes through station 2, then every item goes through station 3. And at each station, the factory builds an entirely new intermediate list to hand off to the next one.

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

The eager version creates a 500,000-element filtered list, then creates another 500,000-element mapped list, and then throws away 499,990 of them. The Sequence version stops the conveyor belt after 10 items roll off the end.

Sequences win when you have large collections or expensive operations with early termination (`take`, `first`, `find`). For small collections (under ~100 elements), the overhead of Sequence's iterator machinery can actually make it slower.

#### What are intermediate and terminal operations on a Sequence?

Intermediate operations like `filter`, `map`, `flatMap`, `take`, and `drop` return another Sequence and do absolutely nothing by themselves. They're just setting up the pipeline. Nothing moves until someone turns the crank.

Terminal operations like `toList()`, `toSet()`, `first()`, `count()`, `forEach()`, and `sum()` are what turns the crank. They trigger actual processing. Without a terminal operation, no element is ever evaluated -- you've built a conveyor belt that nobody switched on. This is the same model as Java Streams, but Sequences don't support parallel processing.

#### What is the difference between Sequence and Flow?

`Sequence` is synchronous -- it processes elements one by one on the calling thread using an `Iterator`. It blocks that thread until it's done. `Flow` is asynchronous -- it's built on coroutines and can suspend, switch dispatchers, and handle backpressure.

Think of it this way: Sequence is like reading a book page by page -- you can't do anything else while you're reading. Flow is like a podcast playlist -- episodes download in the background, you can pause, skip, and your phone doesn't freeze while waiting.

Use Sequence for in-memory transformations on local data. Use Flow when the data source involves I/O, network calls, or when data arrives over time.

#### How does lazy delegation work internally?

`lazy` creates a `Lazy<T>` instance that computes the value on first access and caches it. The first time you touch it, the lambda runs. Every time after that, you just get the cached result. The default mode is `SYNCHRONIZED`, which uses double-checked locking to make it thread-safe. Other modes are `PUBLICATION` (multiple threads can compute the value, but only the first result is kept) and `NONE` (no synchronization at all -- fastest, but not thread-safe).

```kotlin
val heavyObject: HeavyObject by lazy { HeavyObject() }

// Use NONE on Android main thread properties
val adapter: RecyclerAdapter by lazy(LazyThreadSafetyMode.NONE) {
    RecyclerAdapter(items)
}
```

On Android, most UI properties are only accessed from the main thread. Using `NONE` avoids unnecessary synchronization overhead. Why pay for a lock nobody will ever contend?

#### How do observable and vetoable delegates work?

`observable` takes an initial value and a callback that fires after every change. You can't prevent the change -- by the time the callback runs, it's already happened. You're getting a notification, not a permission request.

`vetoable` is the opposite -- the callback fires before the assignment. If it returns `false`, the assignment gets rejected. The old value stays. Think of `observable` as a security camera (it records what happened) and `vetoable` as a security guard (it decides what's allowed in).

```kotlin
var quantity: Int by Delegates.vetoable(0) { _, _, newValue ->
    newValue >= 0 // reject negative values
}

quantity = 5  // accepted
quantity = -1 // rejected, stays 5
```

Use `observable` when you need to react to changes (update UI, log analytics). Use `vetoable` when you need to enforce invariants.

#### How do you write a custom property delegate?

A custom delegate implements `ReadOnlyProperty<T, V>` for `val` or `ReadWriteProperty<T, V>` for `var`. You're basically telling Kotlin: "When someone reads or writes this property, call my code instead."

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

Now reading `username` goes to SharedPreferences and writing to `username` saves there too. The calling code has no idea. Custom delegates are powerful for cross-cutting concerns -- SharedPreferences, database access, dependency injection.

#### Explain class delegation with the by keyword.

Class delegation lets a class implement an interface by forwarding all calls to a delegate object. Instead of writing all those override methods yourself, the compiler generates the forwarding methods at compile time. You're saying: "I implement this interface, but that guy over there does the actual work."

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

Here's why this matters: with inheritance, `NetworkClient` would need to extend a Logger class, consuming its single inheritance slot. With delegation, it can implement multiple interfaces by delegating each to a different object. And you can still override specific methods while the rest get forwarded automatically.

> **🧠 Think about it:** If `NetworkClient` overrides `log()` but not `error()`, and the delegate's `error()` internally calls `log()` -- which `log()` gets called? The overridden one, or the delegate's own?

#### How does the order of collection operations affect performance?

This one is all about doing less work. Putting `filter` before `map` means you only transform the elements that survived the filter. Putting `map` before `filter` transforms everything first, then throws away the ones you don't need. You just did a bunch of work for nothing.

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

With Sequences this matters even more because operations are applied per-element. Moving `filter` before `map` means elements that don't pass the filter never reach the map at all -- they're off the conveyor belt before they even get to that station.

#### How do you transform a Map using Kotlin's collection functions?

Maps have their own transformation functions, and they're more specific than you might expect. `mapValues` transforms values while keeping keys, `mapKeys` transforms keys, and `filterKeys`/`filterValues` let you filter on just one side of the key-value pair without writing a predicate that destructures the entry.

```kotlin
val prices = mapOf("laptop" to 999, "mouse" to 29, "keyboard" to 79)

val discounted = prices.mapValues { (_, price) -> price * 0.9 }

val expensive = prices.filterValues { it > 50 }

val pairs = prices.map { (name, price) -> "$name: $$price" }
```

#### What does buildList do and why is it useful?

`buildList` gives you a clever trick: inside the builder lambda, you get a `MutableList` with full `add()`, `addAll()`, and conditional logic. But the list that comes back out is read-only.

```kotlin
val filteredUsers = buildList {
    add(adminUser)
    addAll(activeUsers)
    if (includeGuests) {
        addAll(guestUsers.filter { it.isVerified })
    }
}
```

There are matching `buildSet` and `buildMap` functions. These are much cleaner than the old pattern of creating a `mutableListOf()`, populating it with a bunch of conditional logic, and then calling `.toList()` at the end.

#### What is the difference between associate, associateBy, and associateWith?

All three create a `Map` from a collection, but they differ in what you control:

- **associate** -- You provide both the key and value: `list.associate { it.id to it.name }`
- **associateBy** -- You provide the key, the element itself becomes the value: `list.associateBy { it.id }`
- **associateWith** -- The element is the key, you provide the value: `list.associateWith { it.name.length }`

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
