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

Flow is a cold data stream built on suspend functions. When you collect a flow, the producer starts emitting values — no collector means no emission. Each time you call `collect`, the flow runs from scratch.

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

- **`flow { }`** — The most common builder. Call `emit()` inside the lambda. This is a cold flow that runs on every collection.
- **`flowOf()`** — Creates a flow from fixed values: `flowOf(1, 2, 3)`
- **`asFlow()`** — Converts collections, ranges, or sequences: `(1..10).asFlow()`

```kotlin
val userFlow = flow {
    val users = api.fetchUsers()
    users.forEach { emit(it) }
}

val statusFlow = flowOf("loading", "success")
val rangeFlow = (1..100).asFlow()
```

#### What are terminal operators?

Terminal operators trigger flow collection — nothing happens until one is called. They are suspend functions.

- **`collect { }`** — Collects every emitted value. Most common.
- **`toList()`** / **`toSet()`** — Collects all values into a collection.
- **`first()`** — Takes the first value and cancels the flow.
- **`reduce { }`** — Accumulates from the first element.
- **`fold(initial) { }`** — Like `reduce` but with an initial value.

```kotlin
val sum = flowOf(1, 2, 3, 4, 5).reduce { acc, value -> acc + value }
// sum = 15
```

The difference between `reduce` and `fold` is that `reduce` uses the first emitted value as the initial accumulator, while `fold` lets you provide your own.

#### What are intermediate operators? How do map, filter, and transform work?

Intermediate operators transform the flow without triggering collection. They return a new flow and are lazy.

- **`map { }`** — Transforms each value.
- **`filter { }`** — Emits only values matching the predicate.
- **`transform { }`** — Most flexible. Can emit zero, one, or multiple values per input.

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

#### How do take, zip, combine, and merge differ?

- **`take(n)`** — Collects only the first `n` values, then cancels.
- **`zip`** — Pairs values from two flows one-to-one. Waits for both. Completes when either completes.
- **`combine`** — Combines latest values. Re-emits whenever either flow emits.
- **`merge`** — Merges multiple flows. Values emitted in arrival order.

```kotlin
val flow1 = flowOf(1, 2, 3)
val flow2 = flowOf("a", "b", "c")

// zip: (1,"a"), (2,"b"), (3,"c")
flow1.zip(flow2) { num, letter -> "$num$letter" }

// combine: emits on every new value from either flow
flow1.combine(flow2) { num, letter -> "$num$letter" }
```

Use `zip` for one-to-one pairing. Use `combine` for latest from multiple sources (like search query + filter selection). Use `merge` for all events from multiple sources in one stream.

#### What does flowOn do and why is it important?

`flowOn` changes the dispatcher for the upstream flow — everything above it in the chain. It does not affect the collector or operators below it.

```kotlin
flow {
    val data = readFromDisk()
    emit(data)
}
.flowOn(Dispatchers.IO)
.map { processData(it) }  // runs on collector's dispatcher
.collect { updateUI(it) }
```

Without `flowOn`, everything runs on the collector's dispatcher. You cannot use `withContext` inside a `flow { }` builder — it throws an exception. Always use `flowOn` instead.

#### What is onStart and onCompletion?

`onStart` runs before the flow starts emitting. `onCompletion` runs after the flow completes — normally, cancelled, or with an exception.

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

`onCompletion` receives a nullable `Throwable` — null if completed normally. It sees the exception but doesn't handle it — use `catch` for error handling.

#### How does the catch operator work?

`catch` intercepts exceptions from upstream operators — anything above it in the chain. It does not catch exceptions from downstream or the `collect` block.

```kotlin
flow { emit(fetchData()) }
    .map { process(it) }      // exception here IS caught
    .catch { e -> emit(fallbackData()) }
    .collect { display(it) }  // exception here is NOT caught
```

Inside `catch`, you can emit fallback values, log, or rethrow. If you need to catch collector exceptions, wrap the `collect` in `try/catch`.

#### How do retry and retryWhen work?

`retry` re-collects the upstream flow when an exception occurs, up to a specified number of times. `retryWhen` gives more control — you decide whether to retry based on the exception and attempt count.

```kotlin
fetchDataFlow()
    .retry(3)
    .collect { data -> display(data) }

fetchDataFlow()
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000L * (attempt + 1))
            true
        } else {
            false
        }
    }
    .collect { data -> display(data) }
```

Each retry re-executes the entire upstream from scratch. `retryWhen` is preferred in production for adding delays and filtering retryable exceptions.

#### What is the difference between buffer and conflate?

By default, flow is sequential — the producer suspends until the collector processes the current value. `buffer()` decouples them by introducing a channel. `conflate()` keeps only the latest value when the collector is slow.

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

`buffer()` keeps all values and runs producer/collector concurrently. `conflate()` drops old values. Use `buffer` when every value matters. Use `conflate` for real-time data where only the current value matters.

#### What are the buffer overflow strategies?

When a buffer is full, `BufferOverflow` controls what happens:

- **`SUSPEND`** (default) — Suspends the producer until space is available.
- **`DROP_OLDEST`** — Removes the oldest value.
- **`DROP_LATEST`** — Discards the new value.

```kotlin
flow { ... }
    .buffer(capacity = 10, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    .collect { process(it) }
```

`conflate()` is shorthand for `buffer(capacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)`.

#### How does debounce work?

`debounce` drops values followed by newer values within a time window. It only emits after no new values arrive for the given duration. Common for search-as-you-type.

```kotlin
searchQueryFlow
    .debounce(300)
    .distinctUntilChanged()
    .filter { it.length >= 2 }
    .flatMapLatest { query -> searchApi.search(query) }
    .collect { results -> displayResults(results) }
```

If the user types "kot" quickly, only the final "kot" triggers a search.

#### What does distinctUntilChanged do?

`distinctUntilChanged` only emits when the value differs from the previous one. Consecutive duplicates are filtered out.

```kotlin
flowOf(1, 1, 2, 2, 3, 1, 1)
    .distinctUntilChanged()
    .collect { println(it) }
// prints: 1, 2, 3, 1
```

It only compares consecutive values — `1` appears twice because other values separated them. You can pass a custom comparator: `distinctUntilChanged { old, new -> old.id == new.id }`. This prevents unnecessary UI updates when state hasn't changed.

#### Explain flatMapConcat, flatMapMerge, and flatMapLatest.

All three map each value to a new flow and flatten the results:

- **`flatMapConcat`** — Sequential. Waits for each inner flow to complete before starting the next.
- **`flatMapMerge`** — Concurrent. All inner flows run in parallel (default concurrency: 16).
- **`flatMapLatest`** — Cancels the previous inner flow when a new value arrives.

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

Use `flatMapConcat` when order matters. Use `flatMapMerge` for parallelism. Use `flatMapLatest` for search.

#### What happens if you throw an exception inside the collect block?

Exceptions inside `collect` are not caught by `catch` because `collect` is downstream. The exception propagates to the coroutine scope.

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

Alternatively, move risky logic into `onEach` (which is upstream) so `catch` can handle it.

#### What is the execution order when chaining flow operators?

Flow operators execute top-to-bottom for each individual value. When a value is emitted, it passes through the entire chain before the next value is emitted.

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

Each value flows through `map` -> `filter` -> `collect` before the next value starts. Adding `buffer()` between operators changes this by decoupling into concurrent execution.

### Common Follow-ups

- What's the difference between `collectLatest` and `flatMapLatest`?
- How does `flowOn` differ from `withContext` inside a flow builder?
- Can you call `emit()` from a different coroutine context inside `flow { }`?
- What happens when you collect the same cold flow twice — does it share state?
- What's the difference between `onEach` and `map`?
- How does `stateIn` convert a cold flow to a hot StateFlow?
- When would you use `channelFlow` instead of `flow`?
- What is the difference between `collectLatest` and `conflate`?
