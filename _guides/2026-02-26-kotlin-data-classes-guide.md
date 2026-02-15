---
title: Kotlin Data Classes Guide
layout: post
sequence: 92
categories: post
tags:
  - Kotlin
  - Android
---

When I first moved from Java to Kotlin, data classes felt like the headline feature. A single line — `data class Point(val x: Int, val y: Int)` — and the compiler generates roughly 100 lines of bytecode covering `equals()`, `hashCode()`, `toString()`, `copy()`, and destructuring. No more forgotten fields in `equals()`. No more `hashCode()` that silently drifts out of sync after someone adds a property and forgets to regenerate the boilerplate. That entire category of bugs just vanishes. In a production Android codebase, where data classes might represent UI state, API responses, database entities, and navigation arguments, this isn't a small thing.

But here's what I didn't appreciate early on: the compiler's behavior around data classes is full of subtle design decisions that can bite you if you don't understand them. Which properties participate in `equals()`? What does `copy()` actually copy? Can you inherit from a data class? These questions sound basic, but I've seen senior engineers get them wrong in code reviews because the answers aren't always intuitive. The gap between "I use data classes" and "I understand data classes" is bigger than most people think, and that gap shows up as real bugs in production code.

## What the Compiler Generates

When you declare `data class Point(val x: Int, val y: Int)`, the compiler generates five functions that all operate exclusively on the primary constructor properties. Not all properties in the class — only the ones in the constructor. This distinction is critical and I'll come back to it later.

The generated `equals()` compares each primary constructor property using structural equality (`==`). For `Point`, it checks whether `other` is a `Point`, then compares `this.x == other.x` and `this.y == other.y`. The generated `hashCode()` uses the standard 31-multiply-and-add algorithm — `31 * x.hashCode() + y.hashCode()` — which gives a decent distribution for hash-based collections like `HashMap` and `HashSet`. The `toString()` returns a human-readable `Point(x=1, y=2)` format. And `componentN()` functions — `component1()` returns `x`, `component2()` returns `y` — enable destructuring declarations.

Here's approximately what the compiler generates under the hood for a simple two-property data class:

```kotlin
data class Point(val x: Int, val y: Int)

// Compiler generates (simplified):
// override fun equals(other: Any?): Boolean {
//     if (this === other) return true
//     if (other !is Point) return false
//     return x == other.x && y == other.y
// }
//
// override fun hashCode(): Int {
//     var result = x.hashCode()
//     result = 31 * result + y.hashCode()
//     return result
// }
//
// override fun toString(): String = "Point(x=$x, y=$y)"
//
// fun copy(x: Int = this.x, y: Int = this.y) = Point(x, y)
//
// operator fun component1() = x
// operator fun component2() = y
```

The `copy()` function is particularly well-designed. It uses default parameters matching each constructor property, so you can override just the fields you want: `point.copy(y = 10)` creates a new `Point` with the same `x` but a new `y`. This pattern is the backbone of immutable state updates across the entire Android ecosystem.

One thing that catches people off guard: **properties declared in the class body are excluded from all generated methods.** If you add a `var label: String = ""` inside the body of `Point`, it won't appear in `equals()`, `hashCode()`, `toString()`, `copy()`, or destructuring. The compiler only sees the primary constructor. This is by design — body properties are treated as implementation details, not part of the data class's identity. But it means two `Point` instances with different `label` values will still be considered equal, which is sometimes exactly what you want and sometimes a silent bug.

## copy() and Shallow Copy Semantics

The `copy()` function creates a new instance, but it copies property values by reference — it does not deep-copy anything. For immutable types like `String`, `Int`, `Boolean`, and other data classes with `val` properties, this is perfectly safe. Immutable values can't be changed after creation, so sharing references between the original and the copy is harmless.

The danger appears the moment you put a mutable type inside a data class. Consider a `Project` that holds a list of team members:

```kotlin
data class Project(
    val name: String,
    val members: MutableList<String>
)

fun main() {
    val original = Project("App", mutableListOf("Alice", "Bob"))
    val forked = original.copy(name = "App Fork")

    forked.members.add("Charlie")

    println(original.members) // [Alice, Bob, Charlie] — surprise!
    println(forked.members)   // [Alice, Bob, Charlie]
    println(original.members === forked.members) // true — same object
}
```

Both `original` and `forked` point to the exact same `MutableList` instance. When you mutate through one reference, you mutate through both. I've seen this cause real production bugs in Android apps — a ViewModel copies a state object to update one field, but a mutable collection inside the state gets shared, and a later mutation in one place corrupts the other.

The fix is straightforward: don't put mutable types in data classes. Use `List` instead of `MutableList`, `Map` instead of `MutableMap`, and `Set` instead of `MutableSet`. If you need to modify a collection, create a new one. This isn't just a theoretical best practice — it's the only way to guarantee that `copy()` behaves like a true copy. If you absolutely need to deep-copy a mutable structure, you have to write the copy logic yourself, because `copy()` will never do it for you.

## Data Classes as State in Android

This is where data classes become genuinely load-bearing in Android development. The modern Android architecture — ViewModels exposing `StateFlow`, Compose observing that state — relies entirely on data class behavior. Your UI state is typically a data class, and every state update is a `copy()` call.

```kotlin
data class SearchUiState(
    val query: String = "",
    val results: List<SearchResult> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

class SearchViewModel : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    fun onQueryChanged(query: String) {
        _state.update { it.copy(query = query, isLoading = true) }
        performSearch(query)
    }

    private fun performSearch(query: String) {
        viewModelScope.launch {
            try {
                val results = repository.search(query)
                _state.update { it.copy(results = results, isLoading = false) }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message, isLoading = false) }
            }
        }
    }
}
```

The `copy()` pattern here is doing two things at once. First, it creates a new instance every time, so `StateFlow` detects the emission as a new value (it uses `equals()` internally to skip duplicate emissions, but since we're changing at least one field, the new state is structurally different). Second, it preserves all the fields you didn't change — you don't accidentally reset `query` when you update `isLoading`.

In Jetpack Compose, this matters even more. Compose's recomposition engine relies on structural equality to decide whether a composable's inputs have changed. When a composable receives a data class parameter, Compose compares the new value to the previous one using `equals()`. If they're equal, Compose skips recomposition for that subtree. The auto-generated `equals()` from data classes makes this comparison efficient and correct without you writing any comparison logic. This is one reason the Compose team strongly recommends using stable, immutable data classes for UI state — the entire rendering optimization pipeline depends on `equals()` working correctly and cheaply.

## Properties in Body vs Constructor

I mentioned earlier that body properties are excluded from generated methods. This is sometimes exactly what you want. Timestamps, cached computations, and transient metadata often shouldn't affect equality. A log entry with a timestamp might be "the same event" regardless of when it was logged:

```kotlin
data class NetworkRequest(
    val url: String,
    val method: HttpMethod,
    val body: String?
) {
    val timestamp: Long = System.currentTimeMillis()
    val id: String = UUID.randomUUID().toString()
}

val req1 = NetworkRequest("https://api.example.com", HttpMethod.GET, null)
val req2 = NetworkRequest("https://api.example.com", HttpMethod.GET, null)

println(req1 == req2)       // true — timestamp and id don't affect equality
println(req1.id == req2.id) // false — different UUIDs
```

Here, `timestamp` and `id` are intentionally excluded. Two requests to the same URL with the same method are semantically equal even if they were created at different times with different tracking IDs.

But this same behavior becomes a bug when you accidentally declare a semantically meaningful property in the body. I've reviewed code where someone added an `isArchived` flag in the body of a `Document` data class, and then spent hours debugging why archived and non-archived documents were comparing as equal in a `Set`. The property looked like it was part of the class, but the compiler treated it as invisible. My rule: every property that matters for identity goes in the primary constructor. Body properties should only be used for derived values, caches, or metadata you explicitly want excluded.

Also worth noting: `copy()` doesn't copy body properties at all. It creates a new instance using only the constructor, so body properties get re-initialized from their declarations. In the `NetworkRequest` example above, `req1.copy()` would produce a new instance with a different `timestamp` and `id` — because those are re-evaluated, not carried over. This is another reason to be deliberate about what goes in the body.

## Data Class Limitations

Data classes have hard constraints that you'll eventually bump into. The most significant one: **data classes cannot extend other data classes.** You can't write `data class Admin(...) : User(...)` where `User` is also a data class. The reason is fundamental — the compiler generates `equals()` and `hashCode()` for both classes, and there's no sound way to compose them. If `Admin.equals()` compares admin-specific fields and `User.equals()` compares user-specific fields, should `admin == user` be true when the user fields match? There's no universally correct answer, so Kotlin just disallows it.

Data classes also can't be `abstract`, `open`, `sealed`, or `inner`. The `open` restriction is the one I see people try to work around most often, because they want to share common properties across related data classes. The idiomatic workaround is to use a sealed class or sealed interface as the common type, with data class subtypes:

```kotlin
sealed interface UiEvent {
    data class NavigateTo(val route: String) : UiEvent
    data class ShowError(val message: String, val retry: Boolean) : UiEvent
    data class ShowSnackbar(val text: String, val duration: SnackbarDuration) : UiEvent
    data object Loading : UiEvent
}

fun handleEvent(event: UiEvent) {
    when (event) {
        is UiEvent.NavigateTo -> navigator.navigate(event.route)
        is UiEvent.ShowError -> showErrorDialog(event.message, event.retry)
        is UiEvent.ShowSnackbar -> snackbarHost.showSnackbar(event.text, event.duration)
        UiEvent.Loading -> showLoadingIndicator()
    }
}
```

This pattern gives you both type safety and structural equality. Each `data class` subtype gets its own generated `equals()`, `hashCode()`, and `copy()`. The `sealed` modifier gives you exhaustive `when` checking so the compiler warns you if a new event type is added but not handled. Data classes can also implement regular interfaces freely, which covers most cases where you need shared behavior across different data types.

One more constraint: every data class must have at least one `val` or `var` parameter in its primary constructor. `data class Empty()` won't compile. This makes sense — a data class with no properties would generate trivial `equals()` (always true), `hashCode()` (always the same), and `toString()` (always empty), which defeats the purpose.

## Data Class vs Regular Class vs Value Class

Choosing between these three is something I think about on almost every new type I create. The decision comes down to what kind of equality and performance characteristics you need.

**Data classes** are the right choice when you have a type with multiple properties and you want structural equality — two instances with the same property values should be considered equal. UI state, API responses, domain entities, events, and configuration objects are all natural data classes. The auto-generated `equals()`, `hashCode()`, `toString()`, and `copy()` save you from writing and maintaining boilerplate that's easy to get wrong.

**Value classes** (the `@JvmInline value class` construct) serve a completely different purpose. They wrap a single value with zero runtime overhead — the compiler erases the wrapper and uses the underlying type directly in the bytecode. Use them when you want type safety without allocation cost. A `UserId` that wraps a `String` prevents you from accidentally passing an `OrderId` where a `UserId` is expected, and at runtime it's just a `String` with no wrapper object on the heap.

```kotlin
@JvmInline
value class UserId(val value: String)

@JvmInline
value class OrderId(val value: String)

fun fetchOrder(userId: UserId, orderId: OrderId): Order {
    // Compiler prevents: fetchOrder(orderId, userId) — type mismatch
    return repository.getOrder(userId.value, orderId.value)
}
```

**Regular classes** are what you use when identity matters more than content. Two `Thread` objects aren't equal just because they have the same name. Two `ViewModel` instances shouldn't be considered interchangeable. Regular classes use reference equality by default (`===`), and you override `equals()` manually only when you have a specific reason. I also use regular classes for anything with complex mutable state, side effects, or behavior that goes beyond holding data — services, repositories, managers, and anything with a lifecycle.

IMO the mental model is simple: if you're asking "are these the same data?", use a data class. If you're asking "is this the same object?", use a regular class. And if you're wrapping a single primitive for type safety, use a value class.

Thanks for reading!

## Quiz

#### Which properties are included in a data class's auto-generated `equals()` and `hashCode()`?

- **Wrong** All properties in the class, including those declared in the body
- **Correct** Only properties declared in the primary constructor
- **Wrong** Only `val` properties, not `var`
- **Wrong** Only properties annotated with `@EqualsAndHashCode`

> **Explanation:** Only primary constructor properties participate in equals(), hashCode(), toString(), copy(), and componentN(). Properties declared in the class body are excluded. This is intentional — body properties are considered implementation details, not part of the data class's identity.

#### What happens when you `copy()` a data class that contains a MutableList property?

- **Wrong** The list is deep-copied — changes to one don't affect the other
- **Correct** The list reference is copied — both the original and copy share the same mutable list
- **Wrong** The list is converted to an immutable list in the copy
- **Wrong** It causes a compile error

> **Explanation:** `copy()` performs a shallow copy — it copies references, not the objects they point to. For mutable types like MutableList, both the original and the copy reference the same list. Mutating through one affects the other.

## Coding Challenge

Design a `TodoItem` data class for a todo app with id, title, description, completed (default false), and priority (enum HIGH/MEDIUM/LOW). Then write a `TodoList` class that stores items and provides: `toggle(id)` using copy(), `updateTitle(id, newTitle)` using copy(), and `stats()` that uses destructuring to count completed vs pending items by priority.

#### Solution

```kotlin
enum class Priority { HIGH, MEDIUM, LOW }

data class TodoItem(
    val id: Int,
    val title: String,
    val description: String,
    val completed: Boolean = false,
    val priority: Priority = Priority.MEDIUM
)

class TodoList {
    private val items = mutableListOf<TodoItem>()

    fun add(item: TodoItem) { items.add(item) }

    fun toggle(id: Int) {
        val index = items.indexOfFirst { it.id == id }
        if (index != -1) {
            items[index] = items[index].copy(completed = !items[index].completed)
        }
    }

    fun updateTitle(id: Int, newTitle: String) {
        val index = items.indexOfFirst { it.id == id }
        if (index != -1) {
            items[index] = items[index].copy(title = newTitle)
        }
    }

    fun stats(): String {
        val completed = items.filter { it.completed }
        val pending = items.filter { !it.completed }

        val summary = StringBuilder("Completed: ${completed.size}, Pending: ${pending.size}\n")
        for (item in pending) {
            val (id, title, _, _, priority) = item
            summary.append("  #$id '$title' [$priority]\n")
        }
        return summary.toString()
    }
}
```
