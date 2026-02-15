---
title: Kotlin withTimeout Patterns Guide
layout: post
sequence: 113
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

`withTimeout` does one thing: it wraps any suspend function with a time limit. If the operation finishes before the deadline, you get the result. If it doesn't, you get an exception. Simple enough — until you realize that the exception it throws is `TimeoutCancellationException`, which inherits from `CancellationException`. And in the world of structured concurrency, `CancellationException` has special treatment. It's not a regular failure. It's a cooperative signal. This one inheritance decision creates a set of gotchas that I've watched trip up experienced engineers in production code.

I started paying attention to timeout patterns after a production incident where a retry loop swallowed a timeout and kept retrying indefinitely. The timeout was "working" — it was throwing — but the catch block treated it as a regular exception and retried the call. The coroutine never actually cancelled. It just burned through battery and bandwidth until the user killed the app. The fix was two lines, but the lesson was bigger: you need to understand what `withTimeout` actually throws and how the coroutine machinery treats that exception.

This guide covers the two timeout functions, the `CancellationException` trap, practical patterns for real Android code, and resource cleanup under timeout.

## withTimeout vs withTimeoutOrNull

Kotlin gives you two functions, and choosing the right one depends on whether a timeout is an error or a fallback case.

`withTimeout` throws `TimeoutCancellationException` when the deadline passes. Use it when timeout genuinely means something went wrong — the server is down, the operation is stuck, the user shouldn't wait any longer. The exception propagates up through structured concurrency like any other failure, which is exactly what you want when a timeout is an error condition.

```kotlin
class PaymentRepository(
    private val api: PaymentApi,
    private val dispatchers: DispatcherProvider
) {
    suspend fun processPayment(request: PaymentRequest): PaymentResult =
        withContext(dispatchers.io) {
            withTimeout(10_000L) {
                // If this takes more than 10 seconds, something is wrong.
                // We WANT an exception — the caller needs to know it failed.
                api.submitPayment(request)
            }
        }
}
```

`withTimeoutOrNull` returns `null` instead of throwing. Use it when timeout is a normal, expected outcome — the operation is optional, or you have a fallback. Search-as-you-type is the classic example. You fire off a search request, but if the user types another character before the response arrives, the old request is irrelevant. The timeout isn't a failure; it's a design decision.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    fun search(query: String) {
        viewModelScope.launch {
            // Give the API 3 seconds. If it's slow, show cached results.
            val results = withTimeoutOrNull(3_000L) {
                searchRepository.searchRemote(query)
            } ?: searchRepository.searchLocal(query)

            _searchResults.value = results
        }
    }
}
```

The choice is about intent. If your code after the timeout block needs to handle "it didn't finish" as a regular control flow path — use `withTimeoutOrNull`. If "it didn't finish" is an exceptional situation that should propagate — use `withTimeout`. I default to `withTimeoutOrNull` in most Android UI code because users care about seeing *something*, even if it's stale. I use `withTimeout` in background processing where partial completion is worse than failure.

## TimeoutCancellationException Gotchas

Here's where things get subtle. `TimeoutCancellationException` extends `CancellationException`, and `CancellationException` is special in structured concurrency. When a coroutine catches a `CancellationException` and doesn't rethrow it, the coroutine stops being cooperative with cancellation. The coroutine framework treats `CancellationException` as "this coroutine is done," not as "something failed."

This creates a bug that's easy to write and hard to spot:

```kotlin
// **Wrong** — this swallows timeout AND cancellation
suspend fun fetchWithRetry(api: ArticleApi): List<Article> {
    repeat(3) { attempt ->
        try {
            return withTimeout(5_000L) {
                api.fetchArticles()
            }
        } catch (e: Exception) {
            // Catches TimeoutCancellationException (a CancellationException).
            // Also catches scope cancellation.
            // The coroutine is now ignoring cancellation — it will retry
            // even if the parent scope was cancelled.
            println("Attempt $attempt failed: ${e.message}")
        }
    }
    throw IllegalStateException("All retries failed")
}
```

The `catch (e: Exception)` block catches everything, including `CancellationException` from the parent scope. If the ViewModel is cleared while this is running, the coroutine should stop — but it won't. It swallows the cancellation and keeps retrying.

```kotlin
// **Correct** — rethrow CancellationException, catch timeout specifically
suspend fun fetchWithRetry(api: ArticleApi): List<Article> {
    repeat(3) { attempt ->
        try {
            return withTimeout(5_000L) {
                api.fetchArticles()
            }
        } catch (e: TimeoutCancellationException) {
            // Only catches timeout, not parent scope cancellation
            println("Attempt $attempt timed out")
        }
    }
    throw IllegalStateException("All retries failed")
}
```

By catching `TimeoutCancellationException` specifically instead of the broader `CancellationException` or `Exception`, you handle timeouts without interfering with structured concurrency's cancellation. This distinction matters because `TimeoutCancellationException` is thrown by the `withTimeout` block itself — it's a *local* cancellation. A `CancellationException` from the parent scope is an *external* cancellation, and swallowing it breaks the cooperative contract.

There's a second gotcha worth knowing. `withTimeout` creates its own child scope internally. The `TimeoutCancellationException` it throws is caught by the `withTimeout` function itself and converted to a thrown exception in the calling coroutine. But if your code inside `withTimeout` launches child coroutines, those children get cancelled when the timeout hits — and their `finally` blocks run. If those `finally` blocks are slow, your overall timeout is no longer precise. The 5-second timeout might actually take 7 seconds because child coroutines spent 2 seconds in cleanup.

## Practical Timeout Patterns

### Retry With Increasing Timeout

Sometimes the first attempt fails simply because the server is slow to warm up. A fixed timeout punishes cold starts. Increasing the timeout on each retry gives the operation more room on subsequent attempts while still failing fast on the first try.

```kotlin
suspend fun <T> retryWithBackoff(
    initialTimeout: Long = 3_000L,
    maxAttempts: Int = 3,
    backoffFactor: Double = 1.5,
    block: suspend () -> T
): T {
    var currentTimeout = initialTimeout
    repeat(maxAttempts) { attempt ->
        try {
            return withTimeout(currentTimeout) { block() }
        } catch (e: TimeoutCancellationException) {
            if (attempt == maxAttempts - 1) throw e
            currentTimeout = (currentTimeout * backoffFactor).toLong()
        }
    }
    error("Unreachable")
}

// Usage
val articles = retryWithBackoff {
    articleApi.fetchArticles()
}
```

### Timeout With Fallback Data

In Android, showing cached data is almost always better than showing an error screen. This pattern tries the network with a timeout and falls back to the local database if the network is slow.

```kotlin
class WeatherRepository(
    private val api: WeatherApi,
    private val dao: WeatherDao,
    private val dispatchers: DispatcherProvider
) {
    suspend fun getWeather(cityId: String): WeatherData =
        withContext(dispatchers.io) {
            val cached = dao.getWeather(cityId)
            val fresh = withTimeoutOrNull(4_000L) {
                api.fetchWeather(cityId).also { dao.save(it) }
            }
            fresh ?: cached ?: throw NoWeatherDataException(cityId)
        }
}
```

The order matters here. I fetch cached data *before* starting the network request. If the timeout fires, the cached data is already in memory and the fallback is instant. If the network succeeds, the cache gets updated for next time. If both are null, we throw — because we genuinely have nothing to show.

### Racing Multiple Sources

Sometimes you have multiple ways to get the same data and you want whichever responds first. `select` with `async` and a timeout gives you a race.

```kotlin
suspend fun getConfig(
    remoteSource: ConfigApi,
    localSource: ConfigDao
): AppConfig = coroutineScope {
    val remote = async { remoteSource.fetchConfig() }
    val local = async { localSource.getConfig() }

    // Take whichever finishes first, with a 2-second overall deadline
    withTimeout(2_000L) {
        select {
            remote.onAwait { it }
            local.onAwait { it }
        }
    }.also {
        // Cancel the loser
        remote.cancel()
        local.cancel()
    }
}
```

### Android API Call Pattern

For typical Android API calls, I use a pattern that combines timeout with structured error handling. The ViewModel gets a clean result type, and the timeout is an implementation detail of the repository.

```kotlin
sealed interface ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>
    data class Error(val exception: Throwable) : ApiResult<Nothing>
    data object TimedOut : ApiResult<Nothing>
}

suspend fun <T> timedApiCall(
    timeoutMs: Long = 10_000L,
    block: suspend () -> T
): ApiResult<T> = try {
    val result = withTimeout(timeoutMs) { block() }
    ApiResult.Success(result)
} catch (e: TimeoutCancellationException) {
    ApiResult.TimedOut
} catch (e: CancellationException) {
    throw e // Never swallow scope cancellation
} catch (e: Exception) {
    ApiResult.Error(e)
}
```

Notice the explicit `catch (e: CancellationException) { throw e }` before the generic catch. This is defensive coding. Without it, a scope cancellation would be wrapped as `ApiResult.Error`, and the caller wouldn't know the coroutine was cancelled — it would try to process the "error" on a dead scope.

## Timeout and Resource Cleanup

Resources opened inside `withTimeout` need cleanup even when the timeout fires. The timeout cancels the coroutine, but it doesn't automatically close file handles, database cursors, or network connections. `try/finally` is the tool here, just like regular exception handling.

```kotlin
suspend fun importData(
    db: AppDatabase,
    api: DataApi
) {
    val transaction = db.openTransaction()
    try {
        withTimeout(30_000L) {
            val records = api.fetchAllRecords()
            records.forEach { record ->
                ensureActive() // Check cancellation between heavy operations
                transaction.insert(record)
            }
            transaction.commit()
        }
    } catch (e: TimeoutCancellationException) {
        transaction.rollback()
        throw e
    } finally {
        transaction.close()
    }
}
```

The `transaction.close()` in `finally` runs whether the block succeeds, times out, or throws any other exception. The rollback in the catch block is specific to the timeout case — if the import takes too long, we don't want a half-written database. And note the `ensureActive()` call inside the loop. If you're doing CPU-bound work inside `withTimeout`, cancellation only takes effect at suspension points. `ensureActive()` creates an explicit check point so the timeout can actually interrupt a long-running loop instead of waiting until the loop finishes.

One thing to watch: `finally` blocks run even after cancellation, but suspend functions called from `finally` will throw `CancellationException` immediately because the coroutine is already cancelled. If your cleanup itself is a suspend function — like flushing data to disk — wrap it in `withContext(NonCancellable)`:

```kotlin
} finally {
    withContext(NonCancellable) {
        // This suspend call will complete even though
        // the coroutine is cancelled
        analytics.logTimeout(operationName)
    }
    transaction.close()
}
```

## Quiz

**Question 1**: What happens if you catch `Exception` in a retry loop around `withTimeout`, and the parent scope gets cancelled?

- A) The retry loop stops immediately
- B) The retry loop continues because `CancellationException` is swallowed by `catch (e: Exception)`
- C) The app crashes with an unhandled exception

**Answer**: **B**. `CancellationException` is a subclass of `Exception` (via `IllegalStateException`). Catching `Exception` swallows it, and the retry loop keeps running on a cancelled scope. **Correct** approach: catch `TimeoutCancellationException` specifically, or rethrow `CancellationException`.

**Question 2**: You call a suspend function inside a `finally` block after a timeout. What happens?

- A) It runs normally
- B) It throws `CancellationException` immediately because the coroutine is cancelled
- C) It blocks until the function completes

**Answer**: **B**. After cancellation, any suspend function call in a `finally` block throws `CancellationException`. Use `withContext(NonCancellable)` if the cleanup suspend call must complete.

## Coding Challenge

Build a `resilientFetch` function that:
1. Tries a primary API with a 3-second timeout
2. On timeout, tries a secondary (fallback) API with a 5-second timeout
3. On second timeout, returns cached data from a local database
4. Properly handles scope cancellation at every step (never swallows `CancellationException`)
5. Cleans up any partial state if interrupted

Test it by simulating a slow primary API (4-second delay), a working secondary API, and verify that scope cancellation stops the entire chain immediately.

Thanks for reading!
