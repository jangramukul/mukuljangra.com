---
title: Kotlin Coroutine Cancellation Guide
layout: post
sequence: 112
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Cancellation is where most coroutine bugs live. Not in launching coroutines, not in switching dispatchers — in cancellation. I've seen production code where a background sync kept running for minutes after the user left the screen because the developer assumed `job.cancel()` would just stop the coroutine. It didn't. The coroutine was doing CPU-bound work in a tight loop, never checking whether it was still supposed to be running.

The core idea is that cancellation in Kotlin coroutines is **cooperative**. The runtime doesn't kill your coroutine the way `Thread.interrupt()` was supposed to kill a thread. Instead, it sets a flag — "you should stop now" — and trusts the coroutine to check that flag and actually stop. If the coroutine never checks, it never stops. This design is intentional. Forcibly stopping a coroutine mid-execution could leave resources in an inconsistent state — half-written database rows, unclosed streams, leaked connections. Cooperative cancellation puts the responsibility on the coroutine to clean up properly before stopping.

This guide covers how cancellation works under the hood, patterns for honoring it, and the bugs that happen when you don't.

## Cooperative Cancellation

When you call `job.cancel()`, the coroutine doesn't immediately stop. The runtime marks the Job as "cancelling," and the coroutine continues running until it hits a **suspension point**. At that suspension point — a call to `delay()`, `yield()`, `withContext()`, or any other suspend function — the runtime checks the cancellation flag and throws a `CancellationException`. That exception unwinds the coroutine, runs any `finally` blocks, and the coroutine is done.

The problem is CPU-bound work. A loop that does computation without ever calling a suspend function has no suspension points. It never gives the runtime a chance to check the flag. The coroutine runs to completion regardless of cancellation.

```kotlin
class ImageProcessor(
    private val imageRepository: ImageRepository
) {
    suspend fun processAllImages(images: List<RawImage>): List<ProcessedImage> =
        withContext(Dispatchers.Default) {
            val results = mutableListOf<ProcessedImage>()
            for (image in images) {
                // CPU-heavy work — no suspension point
                val processed = applyFilters(image)
                results.add(processed)
            }
            results
        }

    private fun applyFilters(image: RawImage): ProcessedImage {
        // Heavy computation: resize, color correct, sharpen
        // This never suspends, so cancellation is ignored
        return ProcessedImage(image.data)
    }
}
```

If you cancel the coroutine running `processAllImages` while it's halfway through a batch of 500 images, it keeps going. All 500 images get processed. The coroutine is already marked as cancelled, but it never looks at the flag.

The fix is to check cancellation manually in the loop. You have three options: check `isActive`, call `ensureActive()`, or call `yield()`.

```kotlin
suspend fun processAllImages(images: List<RawImage>): List<ProcessedImage> =
    withContext(Dispatchers.Default) {
        val results = mutableListOf<ProcessedImage>()
        for (image in images) {
            ensureActive() // Throws CancellationException if cancelled
            val processed = applyFilters(image)
            results.add(processed)
        }
        results
    }
```

`ensureActive()` is the cleanest option for most cases — it checks the coroutine's cancellation state and throws `CancellationException` immediately if the coroutine is cancelled. `isActive` gives you more control if you want to do cleanup before stopping. `yield()` does the same check but also gives other coroutines a chance to run on the same dispatcher, which matters when you're on a limited thread pool like `Dispatchers.Default`. For CPU-bound loops, I default to `ensureActive()` unless I specifically need the cooperative scheduling that `yield()` provides.

## How Cancellation Works

When you call `job.cancel()`, the Job transitions to the **Cancelling** state. It doesn't jump straight to **Cancelled** — there's a window between Cancelling and Cancelled where the coroutine runs its cleanup code. During this window, `isActive` returns `false`, `isCancelled` returns `true`, and the next suspension point throws `CancellationException`.

`CancellationException` is special. Unlike other exceptions, the coroutines framework treats it as a normal termination signal, not a failure. When a child coroutine is cancelled, its parent doesn't fail — it just acknowledges that the child is done. This is different from an `IOException`, which would propagate to the parent and potentially cancel siblings in a regular `coroutineScope`.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private var searchJob: Job? = null

    fun search(query: String) {
        searchJob?.cancel() // Cancel previous search — this is normal, not an error
        searchJob = viewModelScope.launch {
            delay(300) // Debounce
            val results = searchRepository.search(query)
            _searchState.value = SearchUiState.Results(results)
        }
    }
}
```

In this search debounce pattern, every new keystroke cancels the previous search coroutine. That cancellation throws `CancellationException` inside the old coroutine, which terminates cleanly. The `viewModelScope` doesn't fail. No error is logged. The parent Job stays healthy. This is cooperative cancellation working exactly as designed — cancellation is a normal part of the coroutine lifecycle, not an error condition.

Here's the critical rule that I've seen violated more times than I can count: **never swallow `CancellationException`**. If you catch it, rethrow it. The coroutines framework relies on `CancellationException` propagating to complete the cancellation process. If you catch it and eat it, the coroutine looks like it completed normally, but the cancellation state is corrupted. The parent thinks the child finished successfully when it was supposed to be cancelled.

```kotlin
// Dangerous — catch (e: Exception) catches CancellationException too
suspend fun fetchData(): Data {
    return try {
        apiService.getData()
    } catch (e: Exception) {
        // This catches CancellationException silently!
        // The coroutine continues running when it should be dead
        defaultData
    }
}

// Safe — rethrow CancellationException
suspend fun fetchData(): Data {
    return try {
        apiService.getData()
    } catch (e: CancellationException) {
        throw e // Always rethrow
    } catch (e: Exception) {
        defaultData
    }
}
```

This is such a common bug that I consider `catch (e: Exception)` inside a suspend function a code smell. The safer pattern is to catch specific exceptions you expect — `IOException`, `HttpException` — and let everything else propagate.

## NonCancellable Context

Sometimes cancellation is exactly what you don't want. After a coroutine is cancelled, its `finally` block runs — but `finally` runs in a cancelled coroutine context. Any suspend function you call from `finally` will immediately throw `CancellationException` because the coroutine is already cancelled. That's a problem when your cleanup needs to do suspending work: writing to a database, sending an analytics event, flushing a log buffer.

`withContext(NonCancellable)` solves this. It creates a new context that ignores cancellation, allowing suspend functions to complete even though the parent coroutine is being torn down.

```kotlin
class TransactionRepository(
    private val transactionDao: TransactionDao,
    private val analyticsService: AnalyticsService,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun processTransaction(transaction: Transaction) {
        try {
            withContext(ioDispatcher) {
                transactionDao.beginTransaction(transaction)
                // Long-running processing that might get cancelled...
                val result = heavyComputation(transaction)
                transactionDao.commitTransaction(result)
            }
        } finally {
            withContext(NonCancellable) {
                // These MUST complete even if the coroutine was cancelled
                transactionDao.releaseConnection()
                analyticsService.logTransactionAttempt(transaction.id)
            }
        }
    }
}
```

Without `NonCancellable`, calling `transactionDao.releaseConnection()` inside `finally` would throw `CancellationException` immediately — the connection stays open, the database lock is held, and you've got a resource leak. `NonCancellable` lets the cleanup code run to completion.

But use it sparingly. `NonCancellable` is a sharp tool. If you wrap too much code in `NonCancellable`, you defeat the purpose of cooperative cancellation — the coroutine keeps running long after it should have stopped. Keep `NonCancellable` blocks small and focused: release a resource, log an event, write a partial result. Don't put your entire business logic inside `NonCancellable` just to avoid dealing with cancellation properly.

One thing I want to be explicit about: `NonCancellable` is a `Job` that is always active. When you do `withContext(NonCancellable)`, you replace the current Job in the coroutine context with one that never transitions to Cancelling. Suspend functions inside that block see an active Job and execute normally. Once the block completes, the coroutine returns to its cancelled context and finishes terminating.

## Cancellation and Resources

Resource cleanup during cancellation is where things get real. Streams, database connections, sensor listeners, location callbacks — all of these need to be released when a coroutine is cancelled, or you're leaking resources until the process dies.

The simplest pattern is `try`/`finally`. It works for most cases because `finally` runs whether the coroutine completes normally, throws an exception, or is cancelled.

```kotlin
class SensorCollector(
    private val sensorManager: SensorManager,
    private val accelerometer: Sensor
) {
    suspend fun collectReadings(
        duration: Duration
    ): List<SensorReading> = suspendCancellableCoroutine { continuation ->
        val readings = mutableListOf<SensorReading>()

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                readings.add(SensorReading(event.values.copyOf(), event.timestamp))
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }

        sensorManager.registerListener(
            listener, accelerometer, SensorManager.SENSOR_DELAY_NORMAL
        )

        continuation.invokeOnCancellation {
            // This runs when the coroutine is cancelled
            sensorManager.unregisterListener(listener)
        }
    }
}
```

`invokeOnCancellation` is the callback you get from `suspendCancellableCoroutine` specifically for this purpose. When the coroutine is cancelled while suspended, this callback fires and you clean up. Without it, the sensor listener stays registered, draining battery and holding a reference to the coroutine's closure.

For `AutoCloseable` resources — streams, connections, cursors — Kotlin's `use()` extension handles cleanup automatically.

```kotlin
suspend fun readConfig(file: File): AppConfig = withContext(Dispatchers.IO) {
    file.bufferedReader().use { reader ->
        // reader is automatically closed when this block exits,
        // whether by normal completion, exception, or cancellation
        parseConfig(reader.readText())
    }
}
```

`use()` calls `close()` in a `finally` block internally, so cancellation triggers the same cleanup path as normal completion. I prefer `use()` over manual `try`/`finally` for any resource that implements `AutoCloseable` — it's less code and you can't forget the cleanup.

## Common Cancellation Bugs

After debugging cancellation issues across multiple projects, I've found the same bugs show up over and over. Here are the ones I see most frequently.

**Not checking `isActive` in CPU-bound work.** Any loop doing computation without calling a suspend function needs an explicit cancellation check. I've seen image processing pipelines and data migration tasks run for 30+ seconds after cancellation because nobody added `ensureActive()` to the loop. The rule: if your loop body doesn't call a suspend function, add `ensureActive()` at the top.

**Catching `CancellationException` accidentally.** A broad `catch (e: Exception)` inside a suspend function catches `CancellationException` along with everything else. The coroutine should be dead, but instead it continues with a fallback value. I've seen this cause duplicate network requests and stale UI updates where a cancelled operation completed alongside the new one.

```kotlin
// Bug: CancellationException caught, coroutine doesn't actually cancel
suspend fun syncData() {
    try {
        repository.uploadPendingChanges()
    } catch (e: Exception) {
        // Meant to catch network errors, but also catches cancellation
        logger.warn("Sync failed, will retry")
        scheduleRetry() // Now we're retrying a cancelled operation
    }
}

// Fix: catch specific exceptions
suspend fun syncData() {
    try {
        repository.uploadPendingChanges()
    } catch (e: CancellationException) {
        throw e
    } catch (e: IOException) {
        logger.warn("Sync failed: ${e.message}")
        scheduleRetry()
    }
}
```

**Using `Thread.sleep()` instead of `delay()`.** `Thread.sleep()` blocks the thread and is invisible to the coroutine cancellation machinery. A coroutine calling `Thread.sleep(30_000)` holds a thread hostage for 30 seconds regardless of cancellation. `delay()` suspends the coroutine, releases the thread, and checks for cancellation when it resumes. I've found `Thread.sleep()` hiding inside utility functions written before the codebase adopted coroutines. Always grep for `Thread.sleep` in a coroutine-heavy codebase.

**Leaking resources in cancelled coroutines.** Opening a stream or registering a listener without a `finally` block or `use()` call means cancellation leaves the resource open. Database cursors are the worst offender — a leaked cursor holds a connection from the pool, and leaking enough of them causes new queries to block. I once traced a "database locked" ANR to exactly this — three cancelled coroutines each holding an unclosed cursor.

**Ignoring cancellation in `Flow` collectors.** Custom `flow {}` builders with non-suspending loops need explicit cancellation checks. `currentCoroutineContext().ensureActive()` inside a `flow {}` builder does the job. Built-in operators like `map`, `filter`, and `collect` already handle cancellation at each step.

## Quiz

**Question 1.** A coroutine runs a `for` loop that iterates 10,000 times, performing CPU-bound calculations on each iteration without calling any suspend functions. You call `job.cancel()` after the first 100 iterations. What happens?

**Wrong**: The coroutine stops after the current iteration completes because `cancel()` signals it to stop.

**Correct**: The coroutine runs all 10,000 iterations. `cancel()` sets the Job to the Cancelling state, but cancellation is cooperative — it only takes effect at suspension points. Since the loop never suspends, the cancellation flag is never checked. Adding `ensureActive()` at the top of the loop body would fix this by throwing `CancellationException` on the next iteration after cancellation.

**Question 2.** You have a `finally` block that needs to call a suspend function to close a database connection after the coroutine is cancelled. What happens if you call the suspend function directly without `withContext(NonCancellable)`?

**Wrong**: The suspend function executes normally because `finally` blocks always run completely.

**Correct**: The suspend function immediately throws `CancellationException` because the coroutine is already in the Cancelling state. Any suspension point in a cancelled coroutine throws `CancellationException`, including those in `finally` blocks. Wrapping the call in `withContext(NonCancellable)` replaces the cancelled Job with one that's always active, allowing the suspend function to complete.

## Coding Challenge

Build an `OrderBatchProcessor` that processes a list of `PendingOrder` objects. Each order requires CPU-bound validation (`validateOrder`) and a suspend function for database persistence (`orderDao.save(order)`). Implement proper cooperative cancellation so the processing stops promptly when the coroutine is cancelled. Include a `finally` block that uses `withContext(NonCancellable)` to flush any successfully processed orders to an `AuditLog` via a suspend function. Test that cancelling the processor mid-batch stops processing new orders but still completes the audit log write.

Thanks for reading!
