---
title: "Kotlin Flows — Cold Flows & Operators"
date: 2026-02-14
layout: interview
tags: [Kotlin Round]
order: 6
---

## Kotlin Flows — Cold Flows & Operators

Flow is one of the most heavily tested topics in Kotlin interviews. Companies want to know if you understand cold vs hot flows, how operators chain together, and how to handle errors and backpressure in real applications.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a Flow and why is it called "cold"?

Flow is a cold data stream. These are based on suspended functions. When you collect a flow, the producer starts emitting values — no collector means no emission. Each time you call `collect`, the flow runs from scratch.

- It emits data only when there is a collector or consumer
- It does not store data
- It cannot have multiple collectors — each collector gets its own independent execution

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

This is different from SharedFlow or StateFlow which are hot — they emit regardless of whether anyone is collecting.

#### Q2: What are the different ways to create a Flow?

There are three main builders:

- **`flow { }`** — The most common builder. You call `emit()` inside the lambda to send values. This is a cold flow that runs the block on every collection
- **`flowOf()`** — Creates a flow from a fixed set of values. Like `listOf()` but for flows: `flowOf(1, 2, 3)`
- **`asFlow()`** — Converts collections, ranges, or sequences into a flow: `(1..10).asFlow()` or `listOf("a", "b").asFlow()`

```kotlin
// Builder
val userFlow = flow {
    val users = api.fetchUsers()
    users.forEach { emit(it) }
}

// Fixed values
val statusFlow = flowOf("loading", "success")

// From collection
val rangeFlow = (1..100).asFlow()
```

`flow { }` is the one you'll use most in production. `flowOf` and `asFlow` are convenient for testing and simple transformations.

#### Q3: What are terminal operators? Name the most common ones.

Terminal operators are the ones that actually trigger flow collection — nothing happens until a terminal operator is called. They are suspend functions because they wait for the flow to complete.

- **`collect { }`** — Collects every emitted value. The most common terminal operator
- **`toList()`** — Collects all values into a `List`
- **`toSet()`** — Collects all values into a `Set`
- **`first()`** — Takes the first emitted value and cancels the flow
- **`reduce { }`** — Accumulates values starting from the first element: `flow.reduce { acc, value -> acc + value }`
- **`fold(initial) { }`** — Like `reduce` but with an initial value: `flow.fold(0) { acc, value -> acc + value }`

```kotlin
val sum = flowOf(1, 2, 3, 4, 5).reduce { acc, value -> acc + value }
// sum = 15

val product = flowOf(1, 2, 3, 4).fold(1) { acc, value -> acc * value }
// product = 24
```

The difference between `reduce` and `fold` is that `reduce` uses the first emitted value as the initial accumulator, while `fold` lets you provide your own initial value.

#### Q4: What are intermediate operators? How do map, filter, and transform work?

Intermediate operators transform the flow without triggering collection. They return a new flow and are lazy — they only execute when a terminal operator is called.

- **`map { }`** — Transforms each value: `flow.map { it * 2 }`
- **`filter { }`** — Only emits values matching the predicate: `flow.filter { it > 0 }`
- **`transform { }`** — The most flexible operator. You can emit zero, one, or multiple values for each input

```kotlin
val userNames = usersFlow
    .filter { it.isActive }
    .map { it.name }

// transform can emit multiple values per input
val expandedFlow = flowOf(1, 2, 3).transform { value ->
    emit(value)
    emit(value * 10)
}
// emits: 1, 10, 2, 20, 3, 30
```

`transform` is essentially what `map` and `filter` are built on. If you need to do something that doesn't fit `map` or `filter`, use `transform`.

#### Q5: How do take, zip, combine, and merge differ?

These operators work with flow values or multiple flows:

- **`take(n)`** — Collects only the first `n` values, then cancels the flow
- **`zip`** — Pairs values from two flows one-to-one. Waits for both flows to emit before combining. Completes when either flow completes
- **`combine`** — Combines the latest values from two flows. Re-emits whenever either flow emits a new value
- **`merge`** — Merges multiple flows into one. Values are emitted in arrival order, not paired

```kotlin
val flow1 = flowOf(1, 2, 3)
val flow2 = flowOf("a", "b", "c")

// zip: (1,"a"), (2,"b"), (3,"c") — paired strictly
flow1.zip(flow2) { num, letter -> "$num$letter" }

// combine: emits on every new value from either flow
// useful for UI state that depends on multiple data sources
flow1.combine(flow2) { num, letter -> "$num$letter" }
```

Use `zip` when you need one-to-one pairing (like matching requests with responses). Use `combine` when you want the latest from multiple sources (like combining search query + filter selection into a single UI state). Use `merge` when you just want all events from multiple sources in a single stream.

#### Q6: What does flowOn do and why is it important?

`flowOn` changes the coroutine dispatcher for the upstream flow — everything above it in the chain. It does not affect the collector or operators below it.

```kotlin
flow {
    // runs on Dispatchers.IO
    val data = readFromDisk()
    emit(data)
}
.flowOn(Dispatchers.IO)
.map { processData(it) }  // runs on collector's dispatcher
.collect { updateUI(it) } // runs on collector's dispatcher
```

Without `flowOn`, everything runs on the dispatcher of the collector. If you collect on `Dispatchers.Main` and your flow reads from disk, you'd be doing I/O on the main thread. `flowOn` adds a buffer between the upstream and downstream — the upstream emits into a channel, and the downstream reads from it.

You cannot use `withContext` inside a `flow { }` builder to switch dispatchers — it throws an exception. Always use `flowOn` instead.

#### Q7: What is onStart and onCompletion?

`onStart` runs a block before the flow starts emitting values. `onCompletion` runs after the flow completes, whether it completed normally, was cancelled, or threw an exception.

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

`onCompletion` receives a nullable `Throwable` — it's `null` if the flow completed normally, non-null if it failed. Note that `onCompletion` sees the exception but doesn't handle it — the exception still propagates downstream. Use `catch` for actual error handling.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How does the catch operator work? Where should it be placed in the chain?

`catch` intercepts exceptions thrown by upstream operators — anything above it in the chain. It does not catch exceptions from downstream operators or the `collect` block.

```kotlin
flow { emit(fetchData()) }
    .map { process(it) }      // exception here IS caught
    .catch { e -> emit(fallbackData()) }
    .collect { display(it) }  // exception here is NOT caught
```

Inside `catch`, you can emit fallback values, log the error, or rethrow. If you need to catch exceptions from the collector, wrap the `collect` call in a `try/catch` instead. Placing `catch` right before `collect` catches everything from the upstream chain but nothing from the collector itself.

#### Q9: How do retry and retryWhen work?

`retry` re-collects the upstream flow when an exception occurs, up to a specified number of times. `retryWhen` gives you more control — it receives the exception and the current attempt count, and you return `true` to retry or `false` to give up.

```kotlin
// Simple retry — 3 attempts
fetchDataFlow()
    .retry(3)
    .collect { data -> display(data) }

// Conditional retry with delay
fetchDataFlow()
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000L * (attempt + 1)) // exponential-ish backoff
            true
        } else {
            false
        }
    }
    .collect { data -> display(data) }
```

Each retry re-executes the entire upstream flow from scratch — it's a cold flow, so a new collection starts from the beginning. `retryWhen` is preferred in production because you can add delays between retries and filter which exceptions are worth retrying.

#### Q10: What is the difference between buffer and conflate?

Buffer in Kotlin Flows acts as a temporary storage mechanism for values that are emitted faster than they can be collected. By default, flow is sequential — the producer suspends until the collector processes the current value. `buffer()` decouples them by introducing a channel between producer and collector.

`conflate()` keeps only the latest value when the collector is too slow. Intermediate values that arrive while the collector is busy are dropped.

```kotlin
// Without buffer: total time = sum of emit + collect times (sequential)
// With buffer: producer and collector run concurrently
flow {
    emit(1) // emits immediately
    emit(2) // doesn't wait for collector to finish processing 1
    emit(3)
}.buffer()

// Conflate: if collector is slow, skip intermediate values
sensorReadings()
    .conflate()
    .collect { reading ->
        // always gets the most recent reading
        // may skip some if processing is slow
        updateDisplay(reading)
    }
```

`buffer()` keeps all values and runs producer/collector concurrently. `conflate()` drops old values to keep only the latest. Use `buffer` when every value matters. Use `conflate` for real-time data like sensor readings or stock prices where only the current value matters.

#### Q11: What are the buffer overflow strategies?

When a buffer is full, you can control what happens with `BufferOverflow`:

- **`SUSPEND`** (default) — Suspends the producer until space is available in the buffer
- **`DROP_OLDEST`** — Removes the oldest value to make room for the new one. Useful for real-time data streams
- **`DROP_LATEST`** — Discards the new value if the buffer is full. Preserves historical data

```kotlin
flow { ... }
    .buffer(capacity = 10, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    .collect { process(it) }
```

`conflate()` is a shorthand for `buffer(capacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)`. In production, always specify buffer capacity explicitly — unlimited buffers risk `OutOfMemoryError`.

#### Q12: How does debounce work and where is it commonly used?

`debounce` drops values that are followed by newer values within a specified time window. It only emits a value after no new values have arrived for the given duration. This is commonly used for search-as-you-type where you don't want to fire an API call on every keystroke.

```kotlin
searchQueryFlow
    .debounce(300) // wait 300ms after last keystroke
    .distinctUntilChanged()
    .filter { it.length >= 2 }
    .flatMapLatest { query -> searchApi.search(query) }
    .collect { results -> displayResults(results) }
```

If the user types "kot" quickly, only the final "kot" triggers a search. Each intermediate keystroke resets the 300ms timer. `debounce` is also useful for button click protection — preventing double-taps from triggering duplicate actions.

#### Q13: What does distinctUntilChanged do?

`distinctUntilChanged` only emits a value when it's different from the previous one. If the same value is emitted consecutively, duplicates are filtered out.

```kotlin
flowOf(1, 1, 2, 2, 3, 1, 1)
    .distinctUntilChanged()
    .collect { println(it) }
// prints: 1, 2, 3, 1
```

Notice it only compares consecutive values — `1` appears twice in the output because there were other values between them. You can pass a custom comparator for complex objects: `distinctUntilChanged { old, new -> old.id == new.id }`. This operator is important for UI state flows — it prevents unnecessary recomposition or view updates when the state hasn't actually changed.

#### Q14: Explain flatMapConcat, flatMapMerge, and flatMapLatest. When do you use each?

All three map each emitted value to a new flow and flatten the results, but they differ in concurrency:

- **`flatMapConcat`** — Processes flows sequentially. Waits for each inner flow to complete before starting the next one
- **`flatMapMerge`** — Processes flows concurrently. All inner flows run in parallel (limited by `concurrency` parameter, default 16)
- **`flatMapLatest`** — Cancels the previous inner flow when a new value arrives. Only the latest inner flow runs

```kotlin
// Sequential: flow1 completes, then flow2, then flow3
flowOf(1, 2, 3).flatMapConcat { id ->
    fetchUserDetails(id) // each one waits for the previous
}

// Concurrent: all three run in parallel
flowOf(1, 2, 3).flatMapMerge { id ->
    fetchUserDetails(id) // all start immediately
}

// Latest only: typing "ab" cancels search for "a"
searchQuery.flatMapLatest { query ->
    searchApi.search(query) // previous search is cancelled
}
```

Use `flatMapConcat` when order matters and each operation depends on the previous. Use `flatMapMerge` when you want parallelism (batch loading). Use `flatMapLatest` for search — you only care about the result of the most recent query.

#### Q15: How does the catch operator interact with flowOn?

`catch` only catches exceptions from upstream. Since `flowOn` changes the dispatcher for upstream operations, exceptions from the upstream code running on a different dispatcher are still caught by a downstream `catch` — the exception crosses the dispatcher boundary.

```kotlin
flow {
    // runs on IO
    val data = riskyDiskRead()
    emit(data)
}
.flowOn(Dispatchers.IO)
.catch { e ->
    // catches exceptions from the flow builder above,
    // even though it ran on a different dispatcher
    emit(fallbackData)
}
.collect { display(it) }
```

However, if you place `catch` before `flowOn`, it catches the exception on the upstream dispatcher's context. The placement relative to `flowOn` matters for determining which thread the `catch` block runs on, but both placements will catch the upstream exception.

#### Q16: What happens if you throw an exception inside the collect block?

Exceptions inside `collect` are not caught by the `catch` operator because `collect` is downstream. The exception propagates up to the coroutine scope and follows normal coroutine exception handling — it cancels the flow and the parent coroutine.

```kotlin
flow { emit(1) }
    .catch { /* this does NOT catch collect exceptions */ }
    .collect { value ->
        throw RuntimeException("collector failed")
        // propagates to the coroutine scope
    }

// Correct way to handle collector exceptions
try {
    flow { emit(1) }
        .catch { emit(fallback) }
        .collect { value -> riskyOperation(value) }
} catch (e: Exception) {
    handleError(e)
}
```

If you need to handle errors from both upstream and the collector, wrap the entire `collect` call in `try/catch`. Alternatively, move the risky logic into an `onEach` operator (which is upstream) so `catch` can handle it.

#### Q17: How do you test Flows? What tools are commonly used?

For testing cold flows, you can use `toList()` to collect all values and assert on the result. For more complex scenarios, Turbine is the standard library — it provides `test { }` which lets you assert on individual emissions, completion, and errors.

```kotlin
@Test
fun `search returns filtered results`() = runTest {
    val viewModel = SearchViewModel(FakeRepository())

    viewModel.searchResults.test {
        viewModel.onQueryChanged("kotlin")

        val loading = awaitItem()
        assertEquals(UiState.Loading, loading)

        val success = awaitItem()
        assertTrue(success is UiState.Success)

        cancelAndIgnoreRemainingEvents()
    }
}
```

`runTest` from `kotlinx-coroutines-test` provides a `TestDispatcher` that gives you control over virtual time — `advanceTimeBy()` and `advanceUntilIdle()` let you skip delays. Turbine's `awaitItem()` suspends until the next emission, and `expectNoEvents()` verifies nothing was emitted.

#### Q18: What is the execution order when chaining multiple flow operators?

Flow operators execute top-to-bottom for each individual value, not in batches. When a value is emitted, it passes through the entire chain before the next value is emitted. This is different from sequences in collections where all items pass through one operator before moving to the next.

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

Each value flows through `map` → `filter` → `collect` before the next value starts. This is the same execution model as Kotlin sequences — lazy, value-by-value processing. Adding `buffer()` between operators changes this behavior by decoupling upstream and downstream into concurrent execution.

### Common Follow-ups

- What's the difference between `collectLatest` and `flatMapLatest`?
- How does `flowOn` differ from `withContext` inside a flow builder?
- Can you call `emit()` from a different coroutine context inside `flow { }`?
- What happens when you collect the same cold flow twice — does it share state?
- How would you implement a search feature using `debounce`, `distinctUntilChanged`, and `flatMapLatest`?
- What's the difference between `onEach` and `map`?
- How does `stateIn` convert a cold flow to a hot StateFlow?
- When would you use `channelFlow` instead of `flow`?
