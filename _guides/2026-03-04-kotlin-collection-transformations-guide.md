---
title: Kotlin Collection Transformations Guide
layout: post
sequence: 98
categories: post
tags:
  - Kotlin
  - Android
---

Every Android codebase I've worked on has the same pattern hiding in plain sight — manual `for` loops that iterate, check conditions, build new lists, and accumulate results. It works, but it buries the intent under boilerplate. Kotlin's standard library replaces all of that with declarative transformations that say *what* you want, not *how* to get it. Instead of writing fifteen lines to filter active users and extract their emails, you write `users.filter { it.isActive }.map { it.email }` and move on. The code reads like a description of the result, not a recipe for producing it. Once I started thinking in transformations instead of loops, my ViewModels and repositories got noticeably shorter and easier to reason about.

The core operations — `map`, `filter`, `flatMap`, `groupBy`, `fold` — aren't just convenience methods bolted onto collections. They represent a fundamentally different way of thinking about data processing. Instead of mutating state step by step, you describe a pipeline of transformations that flows from input to output. This matters beyond readability. When your data processing is a chain of pure transformations with no mutable variables, testing becomes trivial — you pass input in and assert on the output. No shared state, no setup, no mocking. I think this is one of the most practically useful parts of Kotlin that many Android developers still underuse because they learned Java's imperative style first and never fully switched mental models.

## Filtering

Filtering is the most common collection operation in any Android app. You have a list of things, and you need a subset of them based on some condition. The `filter` function takes a predicate — a lambda that returns `Boolean` — and returns a new list containing only the elements where the predicate returned `true`.

```kotlin
data class User(val id: String, val name: String, val isActive: Boolean, val role: String)

val users = fetchAllUsers()

val activeUsers = users.filter { it.isActive }
val admins = users.filter { it.role == "admin" }
val inactiveAdmins = users.filter { !it.isActive && it.role == "admin" }
```

`filterNot` is the inverse — it keeps elements where the predicate returns `false`. I use this when the negative condition reads more naturally than negating the positive one. Instead of `filter { !it.isArchived }`, writing `filterNot { it.isArchived }` communicates the intent better. It's a small thing, but readability compounds across a codebase.

When you're working with heterogeneous lists — which happens more than you'd expect with sealed class hierarchies — `filterIsInstance` is invaluable. It filters by type and smart-casts the result in one step. No need for manual `is` checks followed by unsafe casts.

```kotlin
sealed class UiEvent {
    data class Click(val viewId: String) : UiEvent()
    data class Scroll(val position: Int) : UiEvent()
    data class TextInput(val text: String) : UiEvent()
}

val events: List<UiEvent> = collectAnalyticsEvents()

val clickEvents: List<UiEvent.Click> = events.filterIsInstance<UiEvent.Click>()
val inputTexts = events.filterIsInstance<UiEvent.TextInput>().map { it.text }
```

`filterNotNull` strips null values from a `List<T?>` and returns a `List<T>`. This is useful after operations like `mapNotNull` or when working with nullable API responses where some entries might be missing.

One operation that doesn't get enough attention is `partition`. It splits a list into two lists based on a predicate — the first list contains elements matching the predicate, the second contains the rest. This is cleaner than calling `filter` twice with opposite conditions, which iterates the collection twice instead of once.

```kotlin
data class Order(val id: String, val amount: Double, val isPaid: Boolean)

val orders = fetchOrders()

val (paidOrders, unpaidOrders) = orders.partition { it.isPaid }

// Now you can process each group separately
val totalRevenue = paidOrders.sumOf { it.amount }
val pendingAmount = unpaidOrders.sumOf { it.amount }
```

## Mapping and Transforming

`map` transforms each element of a collection into something else. One input, one output, always the same size list. This is the bread and butter of converting domain models to UI models — a pattern you'll use in every ViewModel.

```kotlin
data class UserEntity(val id: String, val firstName: String, val lastName: String, val avatarUrl: String?)
data class UserUiModel(val displayName: String, val avatarUrl: String)

val entities: List<UserEntity> = userRepository.getAll()

val uiModels = entities.map { entity ->
    UserUiModel(
        displayName = "${entity.firstName} ${entity.lastName}",
        avatarUrl = entity.avatarUrl ?: DEFAULT_AVATAR
    )
}
```

`mapNotNull` combines mapping and filtering — it applies the transformation and drops any null results. This is particularly useful when a transformation can legitimately fail for some elements and you want to skip those without crashing. I use this constantly when parsing optional fields from API responses.

```kotlin
data class ApiProduct(val id: String, val price: String?, val name: String)

val products: List<ApiProduct> = api.fetchProducts()

val validPrices = products.mapNotNull { product ->
    product.price?.toDoubleOrNull()?.let { price ->
        product.name to price
    }
}
```

`mapIndexed` gives you both the element and its index. This is handy when position matters — building numbered lists, alternating row backgrounds, or tracking position in analytics. It avoids the ugly pattern of maintaining a separate counter variable alongside a `map` call.

`flatMap` is where things get interesting. While `map` transforms each element to one result, `flatMap` transforms each element to a *collection* and then flattens all results into a single list. Think of it as a one-to-many transformation. The most common use case is extracting nested collections.

```kotlin
data class Department(val name: String, val employees: List<Employee>)
data class Employee(val name: String, val skills: List<String>)

val departments: List<Department> = fetchDepartments()

// Get all employees across all departments
val allEmployees = departments.flatMap { it.employees }

// Get every unique skill across the entire company
val allSkills = departments
    .flatMap { it.employees }
    .flatMap { it.skills }
    .distinct()
```

Without `flatMap`, you'd need nested loops and a mutable accumulator list. With `flatMap`, the one-to-many relationship is expressed in a single line. The mental model is simple: "for each department, give me its employees, then flatten everything into one list."

## Grouping and Associating

`groupBy` takes a collection and organizes it into a `Map` where the key is whatever you group by, and the value is a list of matching elements. This is one of the most powerful operations for data categorization — and one that would take ten-plus lines of manual loop code with a `MutableMap<K, MutableList<V>>`.

```kotlin
data class Transaction(val id: String, val category: String, val amount: Double, val userId: String)

val transactions = fetchTransactions()

val byCategory: Map<String, List<Transaction>> = transactions.groupBy { it.category }
val byUser: Map<String, List<Transaction>> = transactions.groupBy { it.userId }

// Count transactions per category
val categoryCounts = byCategory.mapValues { (_, txns) -> txns.size }

// Total spend per user
val userSpending = byUser.mapValues { (_, txns) -> txns.sumOf { it.amount } }
```

`associateBy` creates a `Map<K, V>` where each element maps to a single value by key. Use this when you know the key is unique — like building a lookup map from a list of users by their ID. If duplicate keys exist, the last element wins silently, which can be a subtle source of bugs. I always make sure the key is genuinely unique before using `associateBy`.

```kotlin
val usersById: Map<String, User> = users.associateBy { it.id }

// O(1) lookup instead of scanning the list every time
val targetUser = usersById["user_42"]
```

`associate` gives you full control over both the key and the value. You return a `Pair<K, V>` for each element, and the result is a `Map<K, V>`. This is useful when neither the key nor the value is a direct property of the element — you need to compute both.

```kotlin
val userEmailToName: Map<String, String> = users.associate { it.email to it.name }

val productPriceMap: Map<String, Double> = products.associate { it.sku to it.price * it.quantity }
```

## Aggregation

Aggregation operations reduce a collection down to a single value. `sumOf`, `count`, `any`, `all`, and `none` handle the common cases. `fold` and `reduce` handle everything else.

```kotlin
val orders = fetchOrders()

val totalRevenue = orders.sumOf { it.amount }
val orderCount = orders.count { it.isPaid }
val hasUnpaidOrders = orders.any { !it.isPaid }
val allShipped = orders.all { it.status == "shipped" }
val noCancelled = orders.none { it.status == "cancelled" }
```

The real power comes from `fold` and `reduce`. Both accumulate a result by applying a function across the collection, but they differ in one critical way: `fold` takes an explicit initial value, and `reduce` uses the first element as the starting accumulator.

```kotlin
val numbers = listOf(10, 20, 30, 40)

// fold — starts with 0, works through all elements
val sum = numbers.fold(0) { acc, num -> acc + num } // 100

// reduce — uses first element (10) as initial accumulator
val product = numbers.reduce { acc, num -> acc * num } // 240000
```

Here's the thing most people miss: `reduce` throws `UnsupportedOperationException` on an empty collection because there's no first element to use as the initial value. `fold` handles empty collections gracefully because it always has its initial value to fall back on. In production code, I almost always reach for `fold` over `reduce` for this reason. The only time `reduce` makes sense is when you're guaranteed a non-empty collection and the initial value is naturally the first element itself — like finding the maximum of a list of comparable values.

`fold` also lets you change the accumulator type, which `reduce` cannot do. With `reduce`, the accumulator must be the same type as the collection elements. With `fold`, you can accumulate a `String` from a list of integers, build a `Map` from a list of objects, or construct any arbitrary result type. This makes `fold` strictly more powerful.

```kotlin
data class CartItem(val name: String, val price: Double, val quantity: Int)

val cart = listOf(
    CartItem("Keyboard", 89.99, 1),
    CartItem("Mouse", 49.99, 2),
    CartItem("Monitor", 399.99, 1)
)

val receipt = cart.fold("Order Summary:\n") { acc, item ->
    acc + "  ${item.name} x${item.quantity}: $${item.price * item.quantity}\n"
}
```

## Sorting

Kotlin provides several sorting functions, and the distinction between them matters. `sortedBy` sorts by a single property using natural ordering. `sortedByDescending` does the same in reverse. Both return new lists — they never mutate the original.

```kotlin
data class Task(val title: String, val priority: Int, val createdAt: Long)

val tasks = fetchTasks()

val byPriority = tasks.sortedBy { it.priority }
val newestFirst = tasks.sortedByDescending { it.createdAt }
```

For multi-field sorting, `sortedWith` combined with `compareBy` is the way to go. `compareBy` takes multiple selectors and creates a `Comparator` that sorts by the first field, breaks ties with the second, and so on. This replaces the verbose Java pattern of chaining `.thenComparing()` calls.

```kotlin
data class Employee(val department: String, val name: String, val salary: Double)

val employees = fetchEmployees()

// Sort by department first, then by salary descending within each department
val sorted = employees.sortedWith(
    compareBy<Employee> { it.department }
        .thenByDescending { it.salary }
)
```

One thing worth knowing: Kotlin's sorting is stable, meaning elements that compare as equal retain their original relative order. This matters when you sort by one field and then sort by another — the second sort won't scramble the ordering from the first within groups of equal elements. Stable sorting is what makes multi-step sorting predictable, and it's guaranteed by the standard library because it uses TimSort under the hood, the same algorithm as Java's `Arrays.sort` for objects.

## Chaining Transformations

The real power of collection transformations shows up when you chain multiple operations together. Each function returns a new collection, so you can pipe the output of one operation directly into the next. This is where declarative data processing becomes genuinely more readable than imperative loops.

```kotlin
data class Order(val userId: String, val items: List<OrderItem>, val status: String)
data class OrderItem(val productName: String, val price: Double, val category: String)

val orders = fetchOrders()

val topSpendingUserIds = orders
    .filter { it.status == "completed" }
    .groupBy { it.userId }
    .mapValues { (_, userOrders) ->
        userOrders.flatMap { it.items }.sumOf { it.price }
    }
    .entries
    .sortedByDescending { it.value }
    .take(10)
    .map { it.key }
```

A readability tip I follow strictly: put each transformation on its own line. When you write the entire chain on one line, it becomes unreadable fast. One operation per line, each starting with a dot, makes the pipeline scannable. You can read it top to bottom and understand exactly what happens at each step — filter completed orders, group by user, sum their totals, sort by total descending, take the top 10, extract the user IDs.

There is a real cost to be aware of here. Each operation in the chain creates an intermediate `List`. If you chain five operations on a list of 10,000 elements, you're allocating five temporary lists. For most Android UI work, this is completely negligible — you're processing maybe a few hundred items at most. But for large datasets or hot code paths, those allocations add up. Kotlin provides `Sequence` as an alternative that evaluates lazily — instead of creating intermediate collections, it processes one element at a time through the entire chain before moving to the next. I won't go deep into sequences here, but if you find yourself chaining three or more operations on collections larger than a few thousand elements, consider switching to `asSequence()` at the start of the chain and `toList()` at the end. The API is identical; only the evaluation strategy changes.

The tradeoff is that sequences add overhead per element due to the lazy evaluation machinery, so they're actually *slower* than eager chains for small collections. The crossover point depends on the number of operations and collection size, but as a rule of thumb — if your collection fits comfortably in a RecyclerView or LazyColumn, stick with regular chains. If you're processing data files or database query results with thousands of rows, use sequences.

## Quiz

#### What's the difference between `map` and `flatMap`?

- **Wrong** `map` transforms elements; `flatMap` only filters them
- **Correct** `map` transforms each element to one result; `flatMap` transforms each element to a collection and flattens all results into a single list
- **Wrong** `flatMap` is faster than `map` for large collections
- **Wrong** `map` works on Lists, `flatMap` works on Sets

> **Explanation:** `map` applies a transformation 1:1 — each input produces one output. `flatMap` applies a transformation that produces a collection per input, then concatenates all results. Use `flatMap` for one-to-many transformations like getting all orders across all users.

#### What's the difference between `fold` and `reduce`?

- **Wrong** They're identical — `fold` is just an alias for `reduce`
- **Correct** `fold` takes an initial accumulator value; `reduce` uses the first element as the initial value and fails on empty collections
- **Wrong** `fold` is for numbers, `reduce` is for strings
- **Wrong** `reduce` is lazy, `fold` is eager

> **Explanation:** `fold(0) { acc, item -> acc + item }` starts from 0 and works through all elements. `reduce { acc, item -> acc + item }` uses the first element as the starting accumulator. `reduce` throws on empty collections because there's no first element to use.

## Coding Challenge

Given a list of `Transaction(id: String, userId: String, amount: Double, category: String, date: LocalDate)`, write functions that use collection transformations to: (1) find the top 3 spending categories by total amount, (2) get each user's average transaction amount, (3) find all users who had transactions in every category, and (4) create a monthly summary with total and count per month. Chain transformations without using any mutable variables.

#### Solution

```kotlin
import java.time.LocalDate
import java.time.YearMonth

data class Transaction(
    val id: String,
    val userId: String,
    val amount: Double,
    val category: String,
    val date: LocalDate
)

data class MonthlySummary(val month: YearMonth, val totalAmount: Double, val count: Int)

fun topSpendingCategories(transactions: List<Transaction>, limit: Int = 3): List<String> =
    transactions
        .groupBy { it.category }
        .mapValues { (_, txns) -> txns.sumOf { it.amount } }
        .entries
        .sortedByDescending { it.value }
        .take(limit)
        .map { it.key }

fun userAverageSpending(transactions: List<Transaction>): Map<String, Double> =
    transactions
        .groupBy { it.userId }
        .mapValues { (_, txns) -> txns.sumOf { it.amount } / txns.size }

fun usersInAllCategories(transactions: List<Transaction>): List<String> {
    val allCategories = transactions.map { it.category }.distinct().toSet()
    return transactions
        .groupBy { it.userId }
        .filter { (_, txns) -> txns.map { it.category }.distinct().toSet() == allCategories }
        .map { it.key }
}

fun monthlySummaries(transactions: List<Transaction>): List<MonthlySummary> =
    transactions
        .groupBy { YearMonth.from(it.date) }
        .map { (month, txns) ->
            MonthlySummary(
                month = month,
                totalAmount = txns.sumOf { it.amount },
                count = txns.size
            )
        }
        .sortedBy { it.month }
```

Thanks for reading!
