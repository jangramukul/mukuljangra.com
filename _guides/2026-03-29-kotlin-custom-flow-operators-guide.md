---
title: Kotlin Custom Flow Operators Guide
layout: post
sequence: 123
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

The standard Flow operators cover most cases. `map`, `filter`, `debounce`, `combine`, `flatMapLatest` — they handle 90% of what you'll build in a typical Android app. But sometimes you hit a gap: batching emissions with a timer, retry logic with exponential backoff, or `throttleFirst` for button click protection that kotlinx.coroutines doesn't ship. Building custom operators is straightforward once you understand the primitives, and they pay for themselves as reusable infrastructure.

I started building custom operators after a project where we had the same retry-with-delay pattern copy-pasted across 12 repositories. When I extracted it into a single `retryWithBackoff` operator, the 12 call sites dropped from ~25 lines to 3. More importantly, we fixed a `CancellationException` swallowing bug in one place instead of hunting it across 12.

## Extension Functions on Flow

The simplest way to build a custom operator is an extension function on `Flow<T>` that returns a new `Flow<R>`. Inside, you call `collect` on the upstream flow and `emit` values downstream.

Here's a `bufferTimeout` operator. The built-in `chunked(size)` batches emissions by count but only flushes when the batch is full. In real apps, you often want to flush on *either* condition — the batch is full, or a timeout has elapsed. Think of analytics events: you want to batch them for efficient network calls, but you don't want events sitting in memory for minutes if the user stops generating them.

```kotlin
fun <T> Flow<T>.bufferTimeout(
    maxSize: Int,
    timeoutMs: Long
): Flow<List<T>> = channelFlow {
    val buffer = mutableListOf<T>()
    val mutex = Mutex()
    var timerJob: Job? = null

    collect { value ->
        mutex.withLock {
            buffer.add(value)
            if (buffer.size >= maxSize) {
                send(buffer.toList())
                buffer.clear()
                timerJob?.cancel()
                timerJob = null
            } else if (timerJob == null) {
                timerJob = launch {
                    delay(timeoutMs)
                    mutex.withLock {
                        if (buffer.isNotEmpty()) {
                            send(buffer.toList())
                            buffer.clear()
                        }
                    }
                    timerJob = null
                }
            }
        }
    }

    // Flush remaining items when upstream completes
    mutex.withLock {
        if (buffer.isNotEmpty()) {
            send(buffer.toList())
        }
    }
}
```

Notice I used `channelFlow` instead of `flow` here. That's because the timer needs to launch a separate coroutine that can `send` values concurrently. Regular `flow { }` doesn't allow concurrent emissions — it enforces sequential, single-coroutine execution. `channelFlow` provides a `ProducerScope` backed by a channel, which makes concurrent sends safe. The rule of thumb: if your operator only transforms values one at a time in the `collect` lambda, use `flow { }`. If it needs coroutines, timers, or concurrent operations, use `channelFlow { }`.

## channelFlow for Concurrent Operators

When your custom operator needs to collect multiple upstream flows concurrently or launch background coroutines, `channelFlow` is the tool. It gives you a `ProducerScope` — a `CoroutineScope` combined with a `SendChannel`. You can launch child coroutines, each collecting a different flow, and all send to the same downstream channel safely.

The official `merge` function is built on `channelFlow`, but it combines flows of the same type without priority. Here's a `priorityMerge` that prefers values from a primary flow over a secondary one:

```kotlin
fun <T> Flow<T>.priorityMerge(
    secondary: Flow<T>,
    yieldWindowMs: Long = 50
): Flow<T> = channelFlow {
    val primaryActive = AtomicBoolean(false)

    launch {
        collect { value ->
            primaryActive.set(true)
            send(value)
            launch {
                delay(yieldWindowMs)
                primaryActive.set(false)
            }
        }
    }

    launch {
        secondary.collect { value ->
            if (!primaryActive.get()) {
                send(value)
            }
        }
    }
}
```

The key pattern is launching separate coroutines for each upstream flow. Both call `send` on the same `ProducerScope`, which is thread-safe. The `channelFlow` block completes when all child coroutines complete. If you need the flow to stay alive until explicitly cancelled (callback-based APIs), use `callbackFlow` and `awaitClose` instead.

One thing worth knowing: `channelFlow` adds overhead compared to `flow { }`. It creates a channel, allocates coroutine machinery for concurrent sends, and synchronizes access. Don't reach for `channelFlow` by default — use it when you genuinely need concurrency inside the operator.

## Retry with Exponential Backoff

The built-in `retry` operator re-collects the upstream flow on exceptions. You can add `delay()` inside its predicate for simple backoff. But a dedicated `retryWithBackoff` gives you cleaner call sites and centralizes the logic — initial delay, multiplier, max delay, jitter, and max attempts.

```kotlin
fun <T> Flow<T>.retryWithBackoff(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 30_000,
    multiplier: Double = 2.0,
    jitter: Boolean = true,
    retryOn: (Throwable) -> Boolean = { it is IOException }
): Flow<T> = retryWhen { cause, attempt ->
    if (attempt >= maxRetries || !retryOn(cause)) {
        return@retryWhen false
    }

    val baseDelay = (initialDelayMs * multiplier.pow(attempt.toDouble()))
        .toLong()
        .coerceAtMost(maxDelayMs)

    val actualDelay = if (jitter) {
        (baseDelay * Random.nextDouble(0.5, 1.5)).toLong()
    } else {
        baseDelay
    }

    delay(actualDelay)
    true
}
```

This builds on top of `retryWhen`, which is the more flexible built-in operator. `retryWhen` gives you the cause and the attempt number (zero-based), and you return `true` to retry or `false` to propagate the exception. By wrapping it, the call site becomes expressive:

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dispatchers: DispatcherProvider
) {
    fun articles(): Flow<List<Article>> = flow {
        emit(api.fetchArticles())
    }.retryWithBackoff(
        maxRetries = 3,
        initialDelayMs = 500,
        retryOn = { it is IOException || it is HttpException }
    ).flowOn(dispatchers.io)
}
```

The jitter is important. Without it, if 50 clients fail simultaneously, they all retry at the same intervals — 1s, 2s, 4s — creating a "thundering herd." I've seen this in production: ~200 clients retried at exactly 2 seconds, triggering a second failure. Adding ±50% jitter fixed it completely.

The `retryOn` predicate defaults to `IOException` intentionally. You never want to retry on `IllegalStateException` or `NullPointerException` — those are bugs that retrying won't fix. And `retryWhen` is already transparent to `CancellationException`, so you don't need to worry about accidentally retrying on cancellation.

## throttleFirst and throttleLatest

These two operators solve different problems. `throttleFirst` emits the first value immediately, then ignores everything for a time window. `throttleLatest` waits for the window to pass, then emits the most recent value. Neither is in kotlinx.coroutines.

**throttleFirst** is the button-click protector. User taps "Place Order," you process it immediately, and you ignore the next 500ms of frantic re-taps. The first tap matters; the duplicates don't.

```kotlin
fun <T> Flow<T>.throttleFirst(
    windowMs: Long
): Flow<T> = flow {
    var lastEmitTime = 0L
    collect { value ->
        val now = System.currentTimeMillis()
        if (now - lastEmitTime >= windowMs) {
            lastEmitTime = now
            emit(value)
        }
    }
}
```

This uses `flow { }` because there's no concurrency — it processes each value sequentially. The `System.currentTimeMillis()` approach works because Flow collection is sequential, so no synchronization is needed.

**throttleLatest** needs a timer running concurrently with collection. When a value arrives, it starts (or resets) a timer. When the timer fires, it emits the latest value. This requires `channelFlow`.

```kotlin
fun <T> Flow<T>.throttleLatest(
    windowMs: Long
): Flow<T> = channelFlow {
    var latest: Any? = UNINITIALIZED
    var timerJob: Job? = null
    val mutex = Mutex()

    collect { value ->
        mutex.withLock { latest = value }

        if (timerJob?.isActive != true) {
            timerJob = launch {
                delay(windowMs)
                mutex.withLock {
                    if (latest !== UNINITIALIZED) {
                        @Suppress("UNCHECKED_CAST")
                        send(latest as T)
                        latest = UNINITIALIZED
                    }
                }
            }
        }
    }

    // Emit any remaining value after upstream completes
    mutex.withLock {
        if (latest !== UNINITIALIZED) {
            @Suppress("UNCHECKED_CAST")
            send(latest as T)
        }
    }
}

private val UNINITIALIZED = Any()
```

The `UNINITIALIZED` sentinel is necessary because `T` could be nullable — you can't use `null` to mean "no value."

Where to use each: `throttleFirst` for user actions where immediate response matters (button clicks, pull-to-refresh, navigation events). `throttleLatest` for data streams where you want the freshest value at controlled intervals (stock prices, progress updates, real-time metrics). The tradeoff with both is that you're dropping data. For pipelines where every value matters, `buffer` or `conflate` handle backpressure without silently discarding emissions.

## Testing Custom Operators

Custom operators need tests, and Turbine makes Flow testing straightforward. The key things to verify: correct emissions, timing behavior, error handling, and cancellation.

Here's how I test the `throttleFirst` operator:

```kotlin
class ThrottleFirstTest {

    @Test
    fun `emits first value immediately`() = runTest {
        flowOf(1, 2, 3)
            .throttleFirst(1000)
            .test {
                assertEquals(1, awaitItem())
                // 2 and 3 arrive within the window — dropped
                awaitComplete()
            }
    }

    @Test
    fun `emits again after window expires`() = runTest {
        flow {
            emit("tap1")
            delay(100)
            emit("tap2")  // within window — dropped
            delay(1000)
            emit("tap3")  // after window — emitted
        }.throttleFirst(500)
            .test {
                assertEquals("tap1", awaitItem())
                assertEquals("tap3", awaitItem())
                awaitComplete()
            }
    }

    @Test
    fun `propagates upstream errors`() = runTest {
        flow<Int> {
            emit(1)
            throw IOException("Network down")
        }.throttleFirst(500)
            .test {
                assertEquals(1, awaitItem())
                val error = awaitError()
                assertTrue(error is IOException)
            }
    }

    @Test
    fun `respects cancellation`() = runTest {
        val emissions = mutableListOf<Int>()
        val job = launch {
            flow {
                repeat(100) {
                    emit(it)
                    delay(10)
                }
            }.throttleFirst(50)
                .collect { emissions.add(it) }
        }

        delay(150)
        job.cancel()

        // Should have collected some values, not all 100
        assertTrue(emissions.size < 100)
        assertEquals(0, emissions.first())
    }
}
```

The testing principles: test the happy path with `flowOf`, test timing with `delay`, test error propagation (operators should be transparent to upstream exceptions), and test cancellation to ensure no coroutine leaks.

## Quiz

**Question 1.** You write a custom operator using `flow { }` that launches a coroutine with `launch { }` inside the `collect` lambda to process values concurrently. What happens?

**Wrong**: It works fine because `flow { }` runs inside a coroutine context that supports launching children.

**Correct**: It fails to compile. The `flow { }` builder provides a `FlowCollector` scope, not a `CoroutineScope`. You can't call `launch` inside `flow { }` without a `CoroutineScope`. This is by design — `flow { }` enforces sequential emission to guarantee context preservation. If you need to launch coroutines inside an operator, use `channelFlow { }`, which provides a `ProducerScope` that extends `CoroutineScope`.

**Question 2.** You build a retry operator using `catch { }` followed by re-collecting the upstream flow. A `CancellationException` is thrown during collection. What happens with your custom retry?

**Wrong**: The `catch` operator catches it and triggers a retry, just like any other exception.

**Correct**: The `catch` operator is transparent to `CancellationException` — it does not catch exceptions thrown to cancel the flow. The cancellation propagates normally and the flow terminates. This is why building retry on top of `retryWhen` is safer than building it manually with `catch`: `retryWhen` already handles the `CancellationException` case correctly. If you build retry from scratch, you must explicitly check for `CancellationException` and rethrow it.

## Coding Challenge

Build a `rateLimitedFlatMap` operator that maps each upstream value to a `Flow<R>` (like `flatMapConcat`), but limits the number of concurrent inner collections to a configurable `maxConcurrency` parameter. Use `channelFlow` and a `Semaphore` to control concurrency. The operator should: (1) launch a new coroutine for each inner flow, (2) acquire a semaphore permit before collecting, (3) release the permit when the inner flow completes or fails, and (4) properly cancel all inner collections when the downstream collector is cancelled. Test it with Turbine by mapping 10 items with `maxConcurrency = 3` and verifying that no more than 3 inner flows are collected simultaneously.

Thanks for reading!
