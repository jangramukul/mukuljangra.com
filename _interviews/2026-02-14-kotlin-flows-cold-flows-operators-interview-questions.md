---
title: "Kotlin Flows — Cold Flows & Operators"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 14
sequence: 14
description: "Flow is one of the most heavily tested topics in Kotlin interviews."
---

## Kotlin Flows — Cold Flows & Operators

Flow is one of the most heavily tested topics in Kotlin interviews. Companies want to know if you understand cold vs hot flows, how operators chain together, and how to handle errors and backpressure.

#### What is a Flow and why is it called "cold"?

Think of a Flow like a vending machine. It doesn't do anything until you put a coin in and press a button. That "coin" is `collect`. A Flow is a cold data stream built on suspend functions -- no collector means no emission. Each time you call `collect`, the entire flow runs from scratch, giving every collector its own independent execution.

- It emits data only when there is a collector
- It does not store data
- Each collector gets its own independent execution

```kotlin
val numbersFlow = flow {
    println("Flow started")
    emit(1)
    emit(2)
    emit(3)
}

// "Flow started" prints here, not when the flow is defined
numbersFlow.collect { value -> println(value) }
```

#### What are the different ways to create a Flow?

You've got three main builders:

- **`flow { }`** -- The workhorse. You call `emit()` inside the lambda, and it runs fresh on every collection.
- **`flowOf()`** -- Quick and easy for fixed values: `flowOf(1, 2, 3)`.
- **`asFlow()`** -- Converts collections, ranges, or sequences: `(1..10).asFlow()`.

```kotlin
val userFlow = flow {
    val users = api.fetchUsers()
    users.forEach { emit(it) }
}

val statusFlow = flowOf("loading", "success")
val rangeFlow = (1..100).asFlow()
```

#### What are terminal operators?

Here's the thing -- a flow does absolutely nothing until a terminal operator kicks it off. They're the ignition key. All terminal operators are suspend functions.

- **`collect { }`** -- Collects every emitted value. You'll use this one the most.
- **`toList()`** / **`toSet()`** -- Collects all values into a collection.
- **`first()`** -- Grabs the first value and cancels the flow.
- **`reduce { }`** -- Accumulates starting from the first element.
- **`fold(initial) { }`** -- Like `reduce` but you provide the starting value.

```kotlin
val sum = flowOf(1, 2, 3, 4, 5).reduce { acc, value -> acc + value }
// sum = 15
```

The key difference: `reduce` uses the first emitted value as the initial accumulator, while `fold` lets you bring your own.

#### What are intermediate operators? How do map, filter, and transform work?

Intermediate operators are like adding stations on an assembly line -- they transform values as they pass through, but they don't start the line moving. They return a new flow and are completely lazy.

- **`map { }`** -- Transforms each value.
- **`filter { }`** -- Only lets values through that match your predicate.
- **`transform { }`** -- The Swiss Army knife. You can emit zero, one, or multiple values per input.

```kotlin
val userNames = usersFlow
    .filter { it.isActive }
    .map { it.name }

val expandedFlow = flowOf(1, 2, 3).transform { value ->
    emit(value)
    emit(value * 10)
}
// emits: 1, 10, 2, 20, 3, 30
```

> **🧠 Think about it:** If `map` can only emit one value per input and `filter` can emit zero or one, what makes `transform` more powerful than both combined?

#### How do take, zip, combine, and merge differ?

These four operators do very different things, so let me break them down:

- **`take(n)`** -- Collects only the first `n` values, then cancels. Simple as that.
- **`zip`** -- Pairs values from two flows one-to-one, like a zipper on a jacket. Waits for both sides. Completes when either flow completes.
- **`combine`** -- Combines the latest values. Re-emits whenever either flow emits something new.
- **`merge`** -- Throws everything from multiple flows into one stream, in arrival order.

```kotlin
val flow1 = flowOf(1, 2, 3)
val flow2 = flowOf("a", "b", "c")

// zip: (1,"a"), (2,"b"), (3,"c")
flow1.zip(flow2) { num, letter -> "$num$letter" }

// combine: emits on every new value from either flow
flow1.combine(flow2) { num, letter -> "$num$letter" }
```

Use `zip` for one-to-one pairing. Use `combine` when you need the latest from multiple sources (like a search query + filter selection). Use `merge` when you want all events from multiple sources in one stream.

#### What does flowOn do and why is it important?

`flowOn` changes the dispatcher for the upstream flow -- everything above it in the chain. It does not affect the collector or anything below it. Think of it like a "do this work over there" sign that only applies to the code above the sign.

```kotlin
flow {
    val data = readFromDisk() // runs on IO
    emit(data)
}
.flowOn(Dispatchers.IO)
.map { processData(it) }  // runs on collector's dispatcher
.collect { updateUI(it) }
```

Without `flowOn`, everything runs on the collector's dispatcher. And here's something that trips people up: you cannot use `withContext` inside a `flow { }` builder -- it throws an exception. Always use `flowOn` instead.

#### What is onStart and onCompletion?

`onStart` runs before the flow starts emitting -- great for showing a loading spinner. `onCompletion` runs after the flow completes, whether it finished normally, got cancelled, or blew up with an exception.

```kotlin
fetchUsersFlow()
    .onStart { showLoading() }
    .onCompletion { cause ->
        hideLoading()
        if (cause != null) showError(cause.message)
    }
    .catch { emit(emptyList()) }
    .collect { users -> displayUsers(users) }
```

`onCompletion` receives a nullable `Throwable` -- null if completed normally. But here's the thing: it sees the exception but doesn't handle it. You still need `catch` for actual error handling.

#### How does the catch operator work?

`catch` intercepts exceptions from upstream operators -- anything above it in the chain. Plot twist: it does not catch exceptions from downstream or the `collect` block.

```kotlin
flow { emit(fetchData()) }
    .map { process(it) }      // exception here IS caught
    .catch { e -> emit(fallbackData()) }
    .collect { display(it) }  // exception here is NOT caught
```

Inside `catch`, you can emit fallback values, log the error, or rethrow. If you need to catch collector exceptions, wrap the `collect` call in a `try/catch`.

#### How do retry and retryWhen work?

`retry` re-collects the upstream flow when an exception occurs, up to a specified number of times. `retryWhen` gives you more control -- you decide whether to retry based on the exception type and attempt count.

```kotlin
fetchDataFlow()
    .retry(3)
    .collect { data -> display(data) }

fetchDataFlow()
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000L * (attempt + 1)) // exponential backoff
            true
        } else {
            false
        }
    }
    .collect { data -> display(data) }
```

Each retry re-executes the entire upstream from scratch. In production, `retryWhen` is the way to go because you can add delays and filter which exceptions are actually worth retrying.

#### What is the difference between buffer and conflate?

By default, flow is sequential -- the producer suspends until the collector finishes processing the current value. It's like a single-lane road. `buffer()` adds more lanes by introducing a channel to decouple producer and collector. `conflate()` takes a different approach: it just keeps the latest value and drops everything the collector missed.

```kotlin
flow {
    emit(1)
    emit(2)
    emit(3)
}.buffer()

sensorReadings()
    .conflate()
    .collect { reading ->
        updateDisplay(reading)
    }
```

Use `buffer` when every value matters (like database writes). Use `conflate` for real-time data where you only care about the most current value (like sensor readings or stock prices).

> **🧠 Think about it:** If your collector takes 1 second to process each value and the producer emits 100 values instantly, what happens with `buffer()` vs `conflate()`?

#### What are the buffer overflow strategies?

When a buffer is full, `BufferOverflow` controls what happens next:

- **`SUSPEND`** (default) -- Suspends the producer until space opens up.
- **`DROP_OLDEST`** -- Removes the oldest value to make room for the new one.
- **`DROP_LATEST`** -- Discards the incoming value if there's no room.

```kotlin
flow { ... }
    .buffer(capacity = 10, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    .collect { process(it) }
```

And here's a fun fact: `conflate()` is just shorthand for `buffer(capacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)`.

#### How does debounce work?

`debounce` waits for a quiet period. It drops values that are followed by newer values within a time window, and only emits after no new values arrive for the given duration. It's like an elevator door -- it keeps resetting the close timer every time someone walks in.

```kotlin
searchQueryFlow
    .debounce(300)
    .distinctUntilChanged()
    .filter { it.length >= 2 }
    .flatMapLatest { query -> searchApi.search(query) }
    .collect { results -> displayResults(results) }
```

If the user types "kot" quickly, only the final "kot" triggers a search -- not "k", not "ko", just the final value after 300ms of silence.

#### What does distinctUntilChanged do?

`distinctUntilChanged` only emits when the value differs from the previous one. Consecutive duplicates get filtered out.

```kotlin
flowOf(1, 1, 2, 2, 3, 1, 1)
    .distinctUntilChanged()
    .collect { println(it) }
// prints: 1, 2, 3, 1
```

Notice that `1` appears twice in the output because other values separated them -- it only compares consecutive values, not all values ever seen. You can also pass a custom comparator: `distinctUntilChanged { old, new -> old.id == new.id }`. This is great for preventing unnecessary UI updates when the state hasn't actually changed.

#### Explain flatMapConcat, flatMapMerge, and flatMapLatest.

All three map each value to a new flow and flatten the results. The difference is how they handle concurrency:

- **`flatMapConcat`** -- Sequential. Waits for each inner flow to complete before starting the next. Like a polite queue.
- **`flatMapMerge`** -- Concurrent. All inner flows run in parallel (default concurrency: 16). Like opening all the checkout lanes at once.
- **`flatMapLatest`** -- Cancels the previous inner flow when a new value arrives. Like changing the TV channel -- you don't wait for the current show to end.

```kotlin
flowOf(1, 2, 3).flatMapConcat { id ->
    fetchUserDetails(id) // each waits for previous
}

flowOf(1, 2, 3).flatMapMerge { id ->
    fetchUserDetails(id) // all start immediately
}

searchQuery.flatMapLatest { query ->
    searchApi.search(query) // previous search cancelled
}
```

Use `flatMapConcat` when order matters. Use `flatMapMerge` for parallelism. Use `flatMapLatest` for search where you only care about the latest query.

#### What happens if you throw an exception inside the collect block?

This one catches people off guard. Exceptions inside `collect` are not caught by `catch` because `collect` is downstream. The exception propagates straight to the coroutine scope.

```kotlin
flow { emit(1) }
    .catch { /* does NOT catch collect exceptions */ }
    .collect { value ->
        throw RuntimeException("collector failed")
    }

// Correct approach
try {
    flow { emit(1) }
        .catch { emit(fallback) }
        .collect { value -> riskyOperation(value) }
} catch (e: Exception) {
    handleError(e)
}
```

Alternatively, you can move risky logic into `onEach` (which is upstream) so `catch` can handle it.

> **🧠 Think about it:** If `catch` only catches upstream exceptions, and `collect` is always downstream, is there any way to use `catch` to handle collector errors without `try/catch`?

#### What is the execution order when chaining flow operators?

Flow operators execute top-to-bottom for each individual value. When a value is emitted, it passes through the entire operator chain before the next value even starts. It's like a single ball rolling through a series of pipes -- one ball at a time.

```kotlin
flowOf(1, 2, 3)
    .map { println("map: $it"); it * 2 }
    .filter { println("filter: $it"); it > 2 }
    .collect { println("collect: $it") }

// Output:
// map: 1, filter: 2
// map: 2, filter: 4, collect: 4
// map: 3, filter: 6, collect: 6
```

Each value flows through `map` -> `filter` -> `collect` before the next value starts. Adding `buffer()` between operators changes this by decoupling them into concurrent execution.

### Common Follow-ups

- What's the difference between `collectLatest` and `flatMapLatest`?
- How does `flowOn` differ from `withContext` inside a flow builder?
- Can you call `emit()` from a different coroutine context inside `flow { }`?
- What happens when you collect the same cold flow twice — does it share state?
- What's the difference between `onEach` and `map`?
- How does `stateIn` convert a cold flow to a hot StateFlow?
- When would you use `channelFlow` instead of `flow`?
- What is the difference between `collectLatest` and `conflate`?
