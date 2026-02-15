---
title: Kotlin Flow Context and flowOn Guide
layout: post
sequence: 114
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Flow has a context preservation rule that most developers don't think about until it breaks their code. The rule is simple: the `flow { }` body runs in the same coroutine context as the collector. You don't get to pick. The collector decides the context, and the emitter inherits it. This design follows the principle of least surprise — when you call `collect` on a flow inside a `viewModelScope.launch`, the flow body runs on whatever dispatcher that scope uses. No implicit thread-hopping, no hidden concurrency.

I didn't appreciate this rule until I tried to read a file inside a `flow { }` builder while the collector was on `Dispatchers.Main`. My instinct was `withContext(Dispatchers.IO)` inside the builder, the same pattern I'd use in any suspend function. The app crashed immediately with an `IllegalStateException`. That crash taught me something important: `flowOn` isn't just an alternative to `withContext` in flows — it's the *only* safe way to shift context in a flow pipeline, and the difference is more than cosmetic.

## Context Preservation

By default, `flow { emit(value) }` runs on whatever dispatcher the collector uses. If you collect in a coroutine launched on `Dispatchers.Main`, the flow body executes on Main. If you collect on `Dispatchers.Default`, the body executes on Default. The flow builder inherits the collector's context automatically.

```kotlin
class SettingsViewModel : ViewModel() {
    val settings = flow {
        // This runs on Main because viewModelScope uses Dispatchers.Main
        val config = loadConfig()
        emit(config)
    }

    init {
        viewModelScope.launch {
            settings.collect { config ->
                // Collector runs on Main — and so does the flow body above
                _uiState.value = config
            }
        }
    }
}
```

The runtime enforces this at every `emit()` call. It compares the current coroutine context against the collector's context, and if they don't match, it throws `IllegalStateException` with the message: `Flow invariant is violated`. This check happens at runtime, not compile time, which means the code compiles fine and only crashes when you actually collect the flow.

Why is the rule this strict? Because without it, you'd have a producer and consumer running on different threads with no synchronization. The emitter could overwrite shared state while the collector is halfway through reading it. The context preservation rule forces you through `flowOn`, which internally creates a channel to coordinate emission and collection across dispatchers. That channel is the synchronization point that makes the whole thing safe.

## The Problem

You want to do IO work inside a flow producer — reading files, making network calls, querying a legacy database — but the collector is on `Dispatchers.Main`. Your first instinct is `withContext(Dispatchers.IO)` inside the `flow { }` builder. It compiles. It looks correct. And it crashes.

```kotlin
// Crashes at runtime with IllegalStateException
val articleFlow = flow {
    withContext(Dispatchers.IO) {
        val articles = articleDao.getAll()
        emit(articles)  // Flow invariant violated!
    }
}
```

The error happens because `withContext` changes the coroutine context — specifically, it creates a new child `Job`. The flow runtime checks the `Job` element of the context at each `emit()`, and `withContext` makes it a different `Job` than the collector's. The contexts don't match even if the dispatcher is technically the same. This is a deliberate design decision. `withContext` inside a flow builder would mean emission and collection happen in different coroutines with no coordination mechanism. `flowOn` solves this by creating a channel between the two sides, providing the synchronization that raw context switching lacks.

## flowOn Operator

`flowOn` changes the upstream context. Everything *above* `flowOn` runs on the specified dispatcher. Everything *below* `flowOn` runs on the collector's context. This is the key mental model — `flowOn` shifts what's above it, not what's below.

```kotlin
val configFlow = flow {
    val data = configFile.readText()  // runs on Dispatchers.IO
    emit(parseConfig(data))           // runs on Dispatchers.IO
}
.flowOn(Dispatchers.IO)               // shifts the flow builder to IO
.map { config ->
    config.validate()                 // runs on collector's dispatcher (Main)
}
```

Under the hood, `flowOn` creates a separate coroutine for the upstream portion and connects it to the downstream through a channel. The upstream emits values into the channel on the IO dispatcher, and the downstream reads from the channel on the collector's dispatcher. This channel is what makes `flowOn` safe where `withContext` isn't — it provides proper synchronization between two coroutines running on different threads.

Here's the thing most people miss: `flowOn` only affects upstream, never downstream. I've seen code where someone puts `.flowOn(Dispatchers.IO)` at the very end of a chain expecting the collector to run on IO. That's not what happens. The collector always runs in the context of the coroutine that calls `collect()`. If you need the collector on a specific dispatcher, launch the collection coroutine on that dispatcher.

A real-world repository using `flowOn` for file-based data:

```kotlin
class TransactionRepository(
    private val legacyDb: LegacyDatabase,
    private val dispatchers: DispatcherProvider
) {
    fun observeTransactions(accountId: String): Flow<List<Transaction>> = flow {
        while (currentCoroutineContext().isActive) {
            val transactions = legacyDb.queryTransactions(accountId)
            emit(transactions)
            delay(5_000)
        }
    }.flowOn(dispatchers.io)
}
```

The entire flow body — the database query, the emission, the delay — all run on `Dispatchers.IO`. The ViewModel collecting this flow on Main never has to think about threading. The `DispatcherProvider` pattern makes it testable by letting you swap in `TestDispatcher` during tests.

## Multiple flowOn

You can chain `flowOn` operators. Each one affects the upstream segment until the previous `flowOn`. This lets you build pipelines where different stages run on different dispatchers.

```kotlin
fun processedReadings(): Flow<MotionEvent> = flow {
    emit(readSensorData())            // runs on Dispatchers.IO
}
.flowOn(Dispatchers.IO)
.map { raw ->
    applyKalmanFilter(raw)            // runs on Dispatchers.Default
}
.map { filtered ->
    classifyMotion(filtered)          // runs on Dispatchers.Default
}
.flowOn(Dispatchers.Default)
.filter { event ->
    event.confidence > 0.8            // runs on collector's dispatcher (Main)
}
```

In this pipeline, reading sensor data is IO-bound so it runs on IO. The Kalman filter and motion classification are CPU-intensive, so they run on Default. The final filtering runs wherever the collector is — typically Main in an Android app. Each `flowOn` creates a channel boundary between segments. The data flows through two channels: one between IO and Default, another between Default and Main.

The tradeoff is that every `flowOn` adds overhead. Each channel boundary means an extra coroutine, an extra buffer, and context switching costs. For most Android flows this overhead is negligible — we're talking microseconds against operations that take milliseconds or more. But if you're processing thousands of items per second in a tight pipeline, stacking five `flowOn` calls will add measurable latency. Two `flowOn` calls in a pipeline is common. Three is occasionally justified. More than that usually means you should rethink the pipeline design.

## Common Mistakes

**Using `withContext` inside `flow { }`.** This is the most common mistake and it throws `IllegalStateException` at runtime. The fix is always `flowOn`. One exception: `withContext` *is* safe inside operators like `map` or `filter` because those don't call `emit` from a flow builder. But even there, I prefer `flowOn` for the whole segment — it's cleaner and you don't have to think about which operators are safe.

**Thinking `flowOn` affects downstream.** It doesn't. `flowOn(Dispatchers.IO)` placed after `collect` has zero effect on the collector. The collector runs in whatever context you launched it from. If you want collection on a specific dispatcher, change the coroutine scope, not the flow chain.

**Forgetting that `flowOn` introduces a buffer.** Because `flowOn` uses a channel internally, it adds buffering between upstream and downstream. This means the emitter and collector run concurrently — the emitter doesn't wait for the collector to finish processing before emitting the next value. For most cases this is fine, but if your flow emits large objects rapidly, you might see increased memory usage from the buffered items. You can control this with `buffer(capacity)` or `conflate()` to drop intermediate values.

**Putting `flowOn` after `collect`.** I've reviewed code where a developer chained `.collect { ... }.flowOn(Dispatchers.IO)` thinking it would shift the collector. `collect` is a terminal operator — it suspends and returns `Unit`. Nothing after it in the chain executes as part of the flow pipeline. The `flowOn` is dead code.

## Quiz

**Question 1.** What happens when you call `withContext(Dispatchers.IO)` inside a `flow { }` builder and then call `emit()`?

- **Wrong** The value emits on the IO thread and the collector receives it on Main
- **Wrong** The flow silently switches back to the collector's context before emitting
- **Correct** The flow throws `IllegalStateException` because `emit()` detects that the coroutine context no longer matches the collector's context — `withContext` creates a new child `Job` that violates the flow invariant
- **Wrong** It works normally because `withContext` is standard coroutine practice

**Question 2.** Given this code, which dispatcher does the `map` operation run on?

```kotlin
flow { emit(data) }
    .flowOn(Dispatchers.IO)
    .map { transform(it) }
    .flowOn(Dispatchers.Default)
    .collect { use(it) }  // collected on Main
```

- **Wrong** Dispatchers.IO — the first flowOn wins for all operators
- **Correct** Dispatchers.Default — the second `flowOn` shifts everything above it (including `map`) up to the previous `flowOn` boundary, so `map` runs on Default while the flow builder runs on IO
- **Wrong** Dispatchers.Main — map runs on the collector's context
- **Wrong** It throws because you can't chain two flowOn calls

## Coding Challenge

Build a `LogFileProcessor` that reads log entries from a file (IO-bound), parses and filters them for error-level entries (CPU-bound), and exposes a `Flow<List<LogEntry>>` that a ViewModel can collect on Main. Use `flowOn` to put each stage on the appropriate dispatcher. The flow should poll the file every 10 seconds. Use the `DispatcherProvider` pattern for testability.

#### Solution

```kotlin
data class LogEntry(val timestamp: Long, val level: String, val message: String)

class LogFileProcessor(
    private val logFile: File,
    private val dispatchers: DispatcherProvider
) {
    fun observeErrors(): Flow<List<LogEntry>> = flow {
        while (currentCoroutineContext().isActive) {
            val rawLines = logFile.readLines()
            emit(rawLines)
            delay(10_000)
        }
    }
    .flowOn(dispatchers.io)
    .map { lines ->
        lines.mapNotNull { line -> parseLogEntry(line) }
            .filter { entry -> entry.level == "ERROR" }
            .sortedByDescending { entry -> entry.timestamp }
    }
    .flowOn(dispatchers.default)

    private fun parseLogEntry(line: String): LogEntry? {
        val parts = line.split(" ", limit = 3)
        if (parts.size < 3) return null
        val timestamp = parts[0].toLongOrNull() ?: return null
        return LogEntry(timestamp = timestamp, level = parts[1], message = parts[2])
    }
}
```

Thanks for reading!
