---
title: Kotlin Collections Guide
layout: post
sequence: 97
categories: post
tags:
  - Kotlin
  - Android
---

Coming from Java, I was used to a world where every `ArrayList` handed you both read and write access. You'd pass a `List<User>` to a function, and there was nothing stopping that function from calling `add()`, `remove()`, or `clear()` behind your back. The only defense was discipline and documentation — "please don't modify this list" — and discipline doesn't scale across a team of twenty engineers working on the same codebase. When I moved to Kotlin, the type system started enforcing what Java left to convention. `List<T>` has no `add()`. `MutableList<T>` does. That single distinction eliminates an entire category of bugs.

This separation isn't just syntactic sugar. It changes how you think about ownership and intent. When a function accepts `List<T>`, it's telling you — at the type level — that it only reads. When it returns `MutableList<T>`, it's saying the caller can modify the result. In Java, you'd communicate this through Javadoc comments and hope everyone reads them. In Kotlin, the compiler enforces it. I've seen this prevent real bugs in production Android apps, especially in ViewModels where a Fragment could accidentally mutate a list that the ViewModel was still observing. The type system catches it at compile time, not in a crash report at 2 AM.

## Read-Only vs Mutable

Kotlin's collection framework splits every collection type into two interfaces: a read-only version and a mutable version. `List<T>` is read-only — it exposes `get()`, `size`, `contains()`, `iterator()`, but no mutation methods. `MutableList<T>` extends `List<T>` and adds `add()`, `remove()`, `set()`, and `clear()`. The same pattern applies to `Set`/`MutableSet` and `Map`/`MutableMap`.

```kotlin
val readOnly: List<String> = listOf("alpha", "beta", "gamma")
// readOnly.add("delta") — compile error, no add() on List<T>

val mutable: MutableList<String> = mutableListOf("alpha", "beta", "gamma")
mutable.add("delta") // works fine
mutable.removeAt(0) // also fine
```

The distinction communicates intent through the type system. When you write a function that accepts `List<T>`, you're making a contract with every caller: "I will not modify your data." When you accept `MutableList<T>`, you're explicitly saying mutation will happen. This makes code reviews faster because you don't need to scan function bodies to figure out if someone is modifying a passed-in collection — the parameter type already tells you.

Here's the thing most developers don't appreciate until they've been bitten: `listOf()` and `mutableListOf()` return fundamentally different objects with different capabilities. It's not just about removing methods from the API surface. The type system uses this to enforce correct data flow throughout your entire application. A `List<String>` can be passed to any function expecting `Collection<String>` or `Iterable<String>`, and you know it won't be modified. That guarantee flows up through your entire call stack.

## Under the Hood

Kotlin's read-only collections aren't truly immutable — they're read-only from your reference. This is a critical distinction that catches people off guard. When you call `listOf("a", "b", "c")`, the Kotlin standard library returns a `java.util.Arrays.ArrayList` (for small lists) or wraps elements with `java.util.Collections.unmodifiableList()` semantics. When you call `mutableListOf()`, you get a plain `java.util.ArrayList`. Both live on the JVM's standard collection infrastructure.

The aliasing problem is where this gets dangerous. You can create a `MutableList`, obtain a read-only view of it, and then modify the original — the read-only reference sees the changes:

```kotlin
val mutableUsers = mutableListOf("Alice", "Bob")
val readOnlyView: List<String> = mutableUsers

println(readOnlyView) // [Alice, Bob]
mutableUsers.add("Charlie")
println(readOnlyView) // [Alice, Bob, Charlie] — it changed!
```

The `readOnlyView` variable is typed as `List<String>`, so you can't call `add()` on it. But it's pointing at the same underlying `ArrayList` as `mutableUsers`. Anyone with the mutable reference can change what the read-only reference sees. This is by design — Kotlin chose read-only projections over true immutability for performance reasons. Creating a deep copy every time you want a read-only view would be expensive, especially for large collections in Android where memory pressure is real.

For true isolation, use `toList()` to create a defensive copy. This allocates a new `ArrayList`, copies all elements, and returns it wrapped as a `List<T>`. Now the original and the copy are completely independent — modifications to one don't affect the other. I use this pattern heavily at API boundaries, especially when returning collections from repositories or ViewModels where multiple consumers might hold references.

```kotlin
val source = mutableListOf("Alice", "Bob")
val snapshot = source.toList() // defensive copy

source.add("Charlie")
println(snapshot) // [Alice, Bob] — unaffected
println(source)   // [Alice, Bob, Charlie]
```

The cost is O(n) for the copy, but in practice this is negligible for most Android use cases. The bugs you prevent are worth far more than the microseconds you spend copying a few hundred elements.

## buildList, buildMap, buildSet

Before builder functions existed, constructing a collection with conditional logic was awkward. You'd create a `mutableListOf()`, run your conditions, add elements, then either return the mutable list (leaking mutation capability) or call `toList()` at the end (easy to forget). The `buildList`, `buildMap`, and `buildSet` functions solve this elegantly — you get a mutable builder inside the lambda and an immutable result outside.

```kotlin
fun buildPermissions(user: User): Set<String> = buildSet {
    add("read")
    add("profile.view")

    if (user.isVerified) {
        add("comment")
        add("upload")
    }

    if (user.role == Role.ADMIN) {
        add("delete")
        add("user.manage")
        add("settings.edit")
    }

    if (user.subscription == Subscription.PREMIUM) {
        add("export")
        add("analytics.view")
    }
}
```

Inside the lambda, `this` is a `MutableSet<String>`, so you have full access to `add()`, `remove()`, `addAll()`, and every other mutation method. But the return type of `buildSet` is `Set<String>` — immutable. The mutable builder is scoped to the lambda and doesn't escape. This is the same pattern that Kotlin uses elsewhere with scoped receivers, and it's particularly clean for configuration-style construction.

`buildMap` is equally useful for assembling request parameters, feature flags, or configuration maps where some entries depend on runtime conditions:

```kotlin
fun buildAnalyticsPayload(event: AnalyticsEvent): Map<String, Any> = buildMap {
    put("event_name", event.name)
    put("timestamp", System.currentTimeMillis())

    event.userId?.let { put("user_id", it) }
    event.sessionId?.let { put("session_id", it) }

    if (event.properties.isNotEmpty()) {
        putAll(event.properties)
    }

    put("platform", "android")
    put("app_version", BuildConfig.VERSION_NAME)
}
```

The builder functions compile down to creating a `MutableList`/`MutableSet`/`MutableMap` internally, passing it to your lambda, and then wrapping the result. There's no magic — it's the same "mutable construction, immutable result" pattern you'd write manually, but with the boilerplate eliminated and the immutability guarantee enforced by the return type. I prefer these over manual `mutableListOf()` + `toList()` because the intent is clearer and you can't forget the final conversion.

## Collection Hierarchy

Understanding Kotlin's collection hierarchy helps you write more flexible function signatures. The hierarchy goes: `Iterable` -> `Collection` -> `List`/`Set`. `Map` is separate — it does not extend `Iterable` or `Collection`, though its `entries`, `keys`, and `values` properties do return collections that are iterable.

The practical implication is about choosing the right type for function parameters versus return types. For parameters, use the most general type that provides the operations you need. If you only iterate, accept `Iterable<T>`. If you need `size` or `contains()`, accept `Collection<T>`. If you need indexed access, accept `List<T>`. This makes your function usable with more collection types.

```kotlin
// Too restrictive — only accepts List
fun printItems(items: List<String>) {
    for (item in items) println(item)
}

// Better — accepts List, Set, or any Iterable
fun printItems(items: Iterable<String>) {
    for (item in items) println(item)
}

// Needs size check — use Collection
fun isEmpty(items: Collection<String>): Boolean = items.isEmpty()
```

For return types, do the opposite — be specific. Return `List<T>` when order matters, `Set<T>` when uniqueness matters. The caller gets maximum information about what they're receiving. This progressive narrowing pattern — general inputs, specific outputs — is a principle I follow throughout my Android code and it makes APIs significantly more flexible without sacrificing type safety.

```kotlin
fun fetchActiveUsers(allUsers: Iterable<User>): List<User> {
    return allUsers.filter { it.isActive }.sortedBy { it.name }
}

fun fetchUniqueRoles(users: Collection<User>): Set<Role> {
    return users.map { it.role }.toSet()
}
```

One thing worth noting: `Sequence<T>` is not part of this hierarchy. Sequences implement lazy evaluation and have their own `Sequence` interface that's separate from `Iterable`. You convert between them with `asSequence()` and `toList()`. For large collections where you chain multiple operations (filter, map, take), sequences avoid creating intermediate lists — but for small collections (under a few hundred elements), the overhead of sequence machinery often isn't worth it.

## The Backing Property Pattern

Never expose a `MutableList` from a class's public API. This is one of the most common mistakes I see in Android code reviews, and it completely defeats the purpose of Kotlin's read-only collection types. If your ViewModel exposes a `MutableList<User>`, any Fragment or Composable can call `add()` or `clear()` on it, bypassing whatever update logic your ViewModel is supposed to enforce.

The standard pattern uses a private mutable backing field paired with a public read-only property:

```kotlin
class UserRepository {
    private val _users = mutableListOf<User>()
    val users: List<User> get() = _users

    fun addUser(user: User) {
        _users.add(user)
    }

    fun removeUser(userId: String) {
        _users.removeAll { it.id == userId }
    }
}
```

The `_users` field is `MutableList<User>` and fully mutable inside the class. The `users` property returns it as `List<User>`, hiding the mutation methods. External code can read `repository.users` and iterate, filter, or display the data, but it cannot modify the list directly. All mutations go through the repository's methods, which can enforce validation, logging, or notification logic.

This same pattern appears with `StateFlow` in ViewModels — the canonical Android architecture pattern. You have a private `MutableStateFlow` and expose a public `StateFlow`:

```kotlin
class UserViewModel(
    private val repository: UserRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow<UserUiState>(UserUiState.Loading)
    val uiState: StateFlow<UserUiState> = _uiState.asStateFlow()

    fun loadUsers() {
        viewModelScope.launch {
            val users = repository.getUsers()
            _uiState.value = UserUiState.Success(users.toList())
        }
    }
}

sealed interface UserUiState {
    data object Loading : UserUiState
    data class Success(val users: List<User>) : UserUiState
    data class Error(val message: String) : UserUiState
}
```

Notice the `users.toList()` call when creating the `Success` state. This creates a defensive copy, so even if the repository's internal list changes later, the UI state holds an independent snapshot. Without that copy, the UI state would reference the repository's live list, and modifications to the repository could cause inconsistencies between what the UI thinks it's displaying and what's actually in memory. I've debugged exactly this kind of issue in production — a RecyclerView showing stale data because the backing list was mutated without the adapter being notified.

## Common Mistakes

**Exposing mutable collections from public APIs.** This is the most frequent issue. You return `mutableListOf()` from a function, and now every caller has write access to your internal state. The fix is simple — return `toList()` for a copy, or use the backing property pattern. Even returning the mutable list upcast as `List<T>` is better than nothing, though a `toList()` copy is safer because it prevents the aliasing problem I described earlier.

**Assuming List<T> is truly immutable.** It's read-only from your reference, not immutable in the Java sense. If someone else holds a `MutableList` reference to the same underlying object, they can modify it and your `List<T>` reference will see the changes. This is the aliasing trap. If you need a genuine snapshot that won't change, call `toList()`. If you need thread-safe immutable collections, look at Kotlinx Immutable Collections (`kotlinx.collections.immutable`), which provides `PersistentList`, `PersistentSet`, and `PersistentMap` — true persistent data structures that return new instances on modification.

**Modifying a collection during iteration.** This throws `ConcurrentModificationException` at runtime, and it's surprisingly easy to trigger. You're iterating a list, find an element that needs removal, and call `remove()` on the list — boom. The safe alternatives are `removeAll { predicate }`, `filterTo()` into a new collection, or using an explicit `Iterator` with `iterator.remove()`. In coroutine-heavy Android code, this can also happen across threads — one coroutine iterating a shared mutable list while another modifies it. Use `toList()` before iterating shared state, or switch to a concurrent collection if you genuinely need concurrent access.

```kotlin
val items = mutableListOf("a", "b", "c", "d")

// Wrong — ConcurrentModificationException
for (item in items) {
    if (item == "b") items.remove(item)
}

// Correct — safe removal with predicate
items.removeAll { it == "b" }

// Also correct — iterator-based removal
val iterator = items.iterator()
while (iterator.hasNext()) {
    if (iterator.next() == "c") iterator.remove()
}
```

One more subtle mistake: using `as MutableList<T>` to force-cast a read-only list to mutable. This compiles, and it might even work at runtime if the underlying object happens to be a `MutableList`. But it's undefined behavior — `listOf()` is allowed to return any `List` implementation, and future Kotlin versions could return a truly unmodifiable list that throws `UnsupportedOperationException` on mutation. If you need a mutable version, call `toMutableList()` to get a proper copy. Casting to bypass the type system is exactly the kind of hack that breaks during a Kotlin version upgrade.

Thanks for reading!

## Quiz

#### Is `List<T>` in Kotlin truly immutable?

- **Wrong** Yes — it's completely immutable and thread-safe
- **Correct** No — it's read-only from your reference, but the underlying collection can be modified through a MutableList reference to the same object
- **Wrong** Yes, but only for primitive types
- **Wrong** No — you can cast it to MutableList to modify it

> **Explanation:** `List<T>` guarantees that YOU can't modify it through that reference. But if someone holds a `MutableList` reference to the same underlying collection, they can modify it. For true isolation, use `toList()` to create a defensive copy.

#### What does `buildList` return?

- **Wrong** A MutableList that can be modified after creation
- **Correct** An immutable List — the mutable builder is only available inside the lambda
- **Wrong** A lazy sequence that builds on first access
- **Wrong** A copy of the builder's internal state

> **Explanation:** `buildList` creates a `MutableList` internally, passes it to your lambda for population, then wraps the result in an unmodifiable list. You get mutable construction with an immutable result.

## Coding Challenge

Create a `ShoppingCart` class using the backing property pattern. It should have: a private mutable list of `CartItem(name, quantity, price)`, a public read-only list, methods to add/remove/update items, a computed `total` property, and a `checkout()` function that returns the items as an immutable list and clears the cart. Use `buildList` for creating a summary report of items grouped by price range.

#### Solution

```kotlin
data class CartItem(val name: String, val quantity: Int, val price: Double)

class ShoppingCart {
    private val _items = mutableListOf<CartItem>()
    val items: List<CartItem> get() = _items

    val total: Double get() = _items.sumOf { it.price * it.quantity }

    fun addItem(name: String, quantity: Int, price: Double) {
        val existing = _items.indexOfFirst { it.name == name }
        if (existing != -1) {
            _items[existing] = _items[existing].copy(
                quantity = _items[existing].quantity + quantity
            )
        } else {
            _items.add(CartItem(name, quantity, price))
        }
    }

    fun removeItem(name: String) {
        _items.removeAll { it.name == name }
    }

    fun updateQuantity(name: String, newQuantity: Int) {
        val index = _items.indexOfFirst { it.name == name }
        if (index != -1) {
            _items[index] = _items[index].copy(quantity = newQuantity)
        }
    }

    fun checkout(): List<CartItem> {
        val purchased = _items.toList()
        _items.clear()
        return purchased
    }

    fun summaryReport(): List<String> = buildList {
        val budget = _items.filter { it.price < 20.0 }
        val mid = _items.filter { it.price in 20.0..99.99 }
        val premium = _items.filter { it.price >= 100.0 }

        if (budget.isNotEmpty()) {
            add("Budget (under $20): ${budget.joinToString { it.name }}")
        }
        if (mid.isNotEmpty()) {
            add("Mid-range ($20-$99): ${mid.joinToString { it.name }}")
        }
        if (premium.isNotEmpty()) {
            add("Premium ($100+): ${premium.joinToString { it.name }}")
        }
        add("Total: $${String.format("%.2f", total)}")
    }
}
```
