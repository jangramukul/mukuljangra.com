---
title: Kotlin Dispatchers Guide
layout: post
sequence: 109
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Every coroutine runs on a thread. Which thread is the dispatcher's job. I spent my first year with coroutines thinking dispatchers were just a way to say "run this on a background thread," and that was enough until I hit my first ANR in production. A network call inside `viewModelScope.launch` ran on `Dispatchers.Main` without a dispatcher switch. The app froze for 4 seconds. The fix was one line: `withContext(Dispatchers.IO)`. But dispatchers aren't an afterthought you sprinkle on when something breaks. They're a fundamental decision about where work executes, and getting it wrong causes ANRs, crashes, or silent performance degradation.

## Dispatchers.Main

`Dispatchers.Main` dispatches coroutines onto Android's main `Looper` thread — the same thread that handles view layout, draw passes, and touch events. Android targets 16ms per frame, and anything beyond 5 seconds triggers an ANR. Use Main for updating UI state, emitting to `StateFlow`, and orchestrating suspending calls. You launch on Main, call a suspend function that switches internally, and when it returns, you're back on Main ready to update state.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _results = MutableStateFlow<List<SearchResult>>(emptyList())
    val results: StateFlow<List<SearchResult>> = _results.asStateFlow()

    fun search(query: String) {
        viewModelScope.launch { // Dispatchers.Main by default
            _results.value = searchRepository.search(query) // suspends, switches internally
        }
    }
}
```

There's a subtle but important variant: `Dispatchers.Main.immediate`. The standard `Main` dispatcher always posts to the main thread's message queue, even if you're already on it — meaning there's a one-frame delay. `Main.immediate` checks if you're already on the main thread and executes immediately without dispatching. Both `viewModelScope` and `lifecycleScope` use `Main.immediate` by default, which is why StateFlow emissions feel instant. If you're creating a custom scope for UI work, prefer `Main.immediate`.

The tradeoff is predictability. With `Main`, every launch is queued and executes in order. With `Main.immediate`, a launch on Main runs inline, which can cause re-entrancy if a StateFlow emission triggers a collector that launches another coroutine. For most cases, `Main.immediate` is correct, but be aware of the edge case.

## Dispatchers.IO

`Dispatchers.IO` is for blocking I/O — network calls, file reads, database queries, SharedPreferences access. The thread pool can grow up to 64 threads (or CPU core count, whichever is larger). This is deliberately large because blocking I/O means threads sit idle waiting. You want many threads so one slow network call doesn't starve other operations.

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val db: ArticleDao,
    private val dispatchers: DispatcherProvider
) {
    suspend fun getArticles(): List<Article> = withContext(dispatchers.io) {
        try {
            val remote = api.fetchArticles() // blocking network call
            db.insertAll(remote)              // blocking database write
            remote
        } catch (e: IOException) {
            db.getAll() // fallback to cached data
        }
    }
}
```

Here's the thing most developers don't realize: `Dispatchers.IO` and `Dispatchers.Default` share the same underlying thread pool. They're not two separate pools. The Kotlin coroutines library uses a single `CoroutineScheduler`, and the dispatcher controls how many threads a particular type of work can occupy. Default limits itself to CPU core count, IO can use up to 64. A thread running a Default task can immediately pick up an IO task without thread switching overhead. This is why `withContext(Dispatchers.IO)` inside a Default coroutine is essentially free — no thread migration, just a permission change.

This sharing has a real consequence: 64 simultaneous blocking IO operations consume the entire IO allocation. In a production app doing parallel image downloads, database writes, and analytics calls, you can hit this ceiling. The solution is `limitedParallelism()`, covered below.

## Dispatchers.Default

`Dispatchers.Default` is for CPU-intensive work — sorting large lists, parsing JSON, image processing. The thread pool is sized to CPU core count (typically 4-8 on Android). Beyond that count, you're just adding context-switching overhead.

```kotlin
class ImageProcessor(private val dispatchers: DispatcherProvider) {

    suspend fun processImages(
        images: List<RawImage>
    ): List<ProcessedImage> = withContext(dispatchers.default) {
        images.map { image ->
            async {
                val resized = resize(image, maxWidth = 1080)
                val compressed = compress(resized, quality = 85)
                applyWatermark(compressed)
            }
        }.awaitAll()
    }
}
```

Because Default and IO share the same `CoroutineScheduler`, CPU-bound work on Default doesn't prevent IO tasks from running. But if you accidentally run blocking IO on `Dispatchers.Default`, you're occupying one of your limited core-count threads with idle waiting. On a 4-core device, that's 25% of Default capacity wasted. Default is for work that actively uses the CPU, IO is for work that blocks while waiting.

One pattern I use frequently is running a heavy computation on Default and switching to Main for the result:

```kotlin
class AnalyticsViewModel(
    private val eventStore: EventStore,
    private val dispatchers: DispatcherProvider
) : ViewModel() {

    fun generateReport(month: Int) {
        viewModelScope.launch {
            _state.value = ReportState.Loading
            val report = withContext(dispatchers.default) {
                val events = eventStore.getEventsForMonth(month) // already cached in memory
                events
                    .groupBy { it.category }
                    .mapValues { (_, events) -> events.sumOf { it.duration } }
                    .toSortedMap()
            }
            _state.value = ReportState.Ready(report)
        }
    }
}
```

## Dispatchers.Unconfined

`Dispatchers.Unconfined` starts the coroutine in whatever thread the caller is on. After the first suspension point, it resumes in whatever thread the suspending function completed in. You have zero control over which thread runs your code after any suspension.

I've written a detailed guide on why this is dangerous: [Dispatchers.Unconfined Is a Trap](https://mukuljangra.com/2025/01/30/dispatchers-unconfined-trap.html). The short version — `Unconfined` violates the mental model that a dispatcher provides a stable execution context. After `delay()`, your coroutine might resume on `DefaultExecutor`. After a `withContext(Dispatchers.IO)` block, you're on an IO thread. Touch a UI component from there and you crash.

The only legitimate use case is tight performance-sensitive loops where you can guarantee no thread-confined operations happen after suspension. For testing, use `StandardTestDispatcher` or `UnconfinedTestDispatcher` — not `Dispatchers.Unconfined`. And if you need a no-op context for dependency injection, use `EmptyCoroutineContext` instead. `EmptyCoroutineContext` means "don't override the caller's dispatcher," which is fundamentally different from "run on whatever thread happens to be available."

## withContext for Switching

`withContext` is how suspend functions internally switch dispatchers without exposing that detail to callers. A suspend function's signature says "I suspend" but doesn't say "I need IO threads." The function handles its own dispatcher internally, and the caller doesn't need to know.

```kotlin
class PaymentRepository(
    private val api: PaymentApi,
    private val db: PaymentDao,
    private val dispatchers: DispatcherProvider
) {
    // Callers don't know or care that this uses Dispatchers.IO internally
    suspend fun processPayment(payment: Payment): PaymentResult {
        return withContext(dispatchers.io) {
            val response = api.charge(payment)
            db.saveTransaction(response.transaction)
            PaymentResult(
                transactionId = response.transaction.id,
                status = response.status
            )
        }
    }

    // Same pattern — internal dispatcher switching
    suspend fun getPaymentHistory(userId: String): List<Transaction> {
        return withContext(dispatchers.io) {
            db.getTransactionsForUser(userId)
        }
    }
}
```

This pattern — called "main-safety" — means the caller can always call the suspend function from any dispatcher without worrying about blocking the wrong thread. The suspend function is responsible for its own thread safety, not the caller.

`withContext` doesn't always switch threads. If you call `withContext(Dispatchers.Default)` while already on a Default thread, the coroutine continues on the same thread. Combined with the shared thread pool between IO and Default, `withContext` calls between these two dispatchers are nearly free — no thread migration, just a reclassification of the parallelism limit.

## Custom Dispatchers and limitedParallelism

The built-in dispatchers work for most cases, but sometimes you need finer control. `limitedParallelism()` creates a view of an existing dispatcher that caps how many coroutines can run simultaneously. It doesn't create new threads — it limits how many of the parent's threads your work can occupy.

The most common use case is database connection pooling. If your database allows 4 concurrent connections, running 64 parallel queries on `Dispatchers.IO` overwhelms the pool:

```kotlin
class DatabaseModule {
    // Only 4 coroutines can execute database queries simultaneously
    val databaseDispatcher = Dispatchers.IO.limitedParallelism(4)
}

class TransactionRepository(
    private val db: TransactionDao,
    private val dbDispatcher: CoroutineDispatcher
) {
    suspend fun batchInsert(transactions: List<Transaction>) {
        withContext(dbDispatcher) {
            transactions.chunked(100).forEach { chunk ->
                db.insertAll(chunk)
            }
        }
    }
}
```

There's a critical distinction: `Dispatchers.IO.limitedParallelism(n)` draws from the IO pool (up to 64 threads), while `Dispatchers.Default.limitedParallelism(n)` draws from the CPU-bound pool (core count). Choose based on whether your limited work is IO-bound or CPU-bound.

`Dispatchers.Default.limitedParallelism(1)` creates a single-threaded dispatcher backed by the Default pool. Coroutines dispatched to it execute sequentially — one at a time, never concurrently. This is a lightweight alternative to mutexes for protecting shared mutable state:

```kotlin
class InMemoryCache<K, V> {
    private val map = mutableMapOf<K, V>()
    private val cacheDispatcher = Dispatchers.Default.limitedParallelism(1)

    suspend fun get(key: K): V? = withContext(cacheDispatcher) {
        map[key]
    }

    suspend fun put(key: K, value: V) = withContext(cacheDispatcher) {
        map[key] = value
    }

    suspend fun getOrPut(key: K, compute: suspend () -> V): V {
        return withContext(cacheDispatcher) {
            map[key] ?: runBlocking { compute() }.also { map[key] = it }
        }
    }
}
```

The tradeoff compared to a `Mutex` is that `limitedParallelism(1)` uses thread confinement — all operations run sequentially on one thread — while a `Mutex` allows different threads but serializes access with locking. Thread confinement is simpler because you never have concurrent access, period. But it has higher dispatch overhead for short operations. For a cache with complex multi-step updates, the single-threaded dispatcher is safer. For frequent short reads, a `Mutex` might be more efficient.

## Injecting Dispatchers for Testing

Hardcoding dispatchers is one of the most common testing mistakes in Android. If your repository calls `withContext(Dispatchers.IO)` directly, your test deals with real IO threads — nondeterministic execution, timing-dependent assertions, flaky results. The fix is injecting dispatchers through a simple interface.

```kotlin
interface DispatcherProvider {
    val main: CoroutineDispatcher
    val io: CoroutineDispatcher
    val default: CoroutineDispatcher
}

class DefaultDispatcherProvider : DispatcherProvider {
    override val main: CoroutineDispatcher = Dispatchers.Main
    override val io: CoroutineDispatcher = Dispatchers.IO
    override val default: CoroutineDispatcher = Dispatchers.Default
}

class TestDispatcherProvider(
    testDispatcher: TestDispatcher = StandardTestDispatcher()
) : DispatcherProvider {
    override val main: CoroutineDispatcher = testDispatcher
    override val io: CoroutineDispatcher = testDispatcher
    override val default: CoroutineDispatcher = testDispatcher
}
```

With this pattern, every class takes `DispatcherProvider` as a constructor parameter. In production, your DI framework provides `DefaultDispatcherProvider`. In tests, you pass `TestDispatcherProvider` — fully deterministic, fully controllable.

```kotlin
class PaymentRepositoryTest {
    private val testDispatcher = StandardTestDispatcher()
    private val dispatchers = TestDispatcherProvider(testDispatcher)
    private val fakeApi = FakePaymentApi()
    private val fakeDb = FakePaymentDao()

    private val repository = PaymentRepository(fakeApi, fakeDb, dispatchers)

    @Test
    fun processPayment_savesTransaction() = runTest(testDispatcher) {
        fakeApi.chargeResult = PaymentResponse(
            transaction = Transaction(id = "txn_123", amount = 50.0),
            status = "success"
        )

        val result = repository.processPayment(Payment(amount = 50.0))

        assertEquals("txn_123", result.transactionId)
        assertEquals("success", result.status)
        assertTrue(fakeDb.savedTransactions.any { it.id == "txn_123" })
    }
}
```

The `StandardTestDispatcher` queues coroutines and only executes them when the test scheduler advances (which `runTest` does automatically). If you want eager execution, use `UnconfinedTestDispatcher` — but be aware of the same re-entrancy caveats as `Dispatchers.Main.immediate`.

I've seen teams pass individual `CoroutineDispatcher` parameters instead: `class Repo(ioDispatcher: CoroutineDispatcher)`. This works for small projects. But once you have 20+ classes needing dispatchers, the interface approach pays for itself — one DI binding instead of three per class.

## Quiz

#### If a suspend function calls withContext(Dispatchers.IO), which dispatcher does the caller need to use?

- **Wrong** The caller must also use Dispatchers.IO
- **Wrong** The caller must use Dispatchers.Default to avoid conflicts
- **Correct** The caller can use any dispatcher — the suspend function handles its own thread safety internally with withContext
- **Wrong** The caller must use Dispatchers.Main.immediate

> **Explanation:** This is the main-safety pattern. A well-designed suspend function uses `withContext` internally to switch to the appropriate dispatcher. The caller doesn't need to know which dispatcher the function uses — it just calls the suspend function from whatever context it's already in. This is why Google recommends that suspend functions be "main-safe" by default.

#### What does Dispatchers.Default.limitedParallelism(1) create?

- **Wrong** A dispatcher that only runs on CPU core #1
- **Wrong** A copy of Dispatchers.Default with a single thread pool
- **Correct** A single-threaded dispatcher backed by the Default pool — coroutines dispatched to it execute sequentially, never concurrently
- **Wrong** A dispatcher identical to Dispatchers.Unconfined

> **Explanation:** `limitedParallelism(1)` creates a view of the parent dispatcher that allows only one coroutine to execute at a time. It doesn't create a new thread — it borrows threads from the Default pool but ensures only one is used at any moment. This provides thread confinement, making it a lightweight alternative to `Mutex` for protecting shared mutable state.

## Coding Challenge

Create a `NotificationService` that demonstrates proper dispatcher usage. It should: fetch preferences from a database (IO), format content with a template engine (Default), and update a UI state flow (Main). Use `DispatcherProvider` injection. Write a test verifying the flow handles database failures by falling back to default preferences.

#### Solution

```kotlin
class NotificationService(
    private val prefsDao: NotificationPrefsDao,
    private val templateEngine: TemplateEngine,
    private val dispatchers: DispatcherProvider
) {
    private val _notificationState = MutableStateFlow<NotificationState>(NotificationState.Idle)
    val notificationState: StateFlow<NotificationState> = _notificationState.asStateFlow()

    suspend fun prepareNotification(event: AppEvent) {
        _notificationState.value = NotificationState.Loading

        val prefs = withContext(dispatchers.io) {
            try {
                prefsDao.getPreferences(event.userId)
            } catch (e: Exception) {
                NotificationPrefs.DEFAULT // fallback on DB failure
            }
        }

        val formatted = withContext(dispatchers.default) {
            templateEngine.render(
                template = prefs.templateId,
                variables = mapOf(
                    "title" to event.title,
                    "body" to event.body,
                    "userName" to event.userName
                )
            )
        }

        _notificationState.value = NotificationState.Ready(formatted)
    }
}

// Test
class NotificationServiceTest {
    private val testDispatcher = StandardTestDispatcher()
    private val dispatchers = TestDispatcherProvider(testDispatcher)

    private val service = NotificationService(
        FakeNotificationPrefsDao().apply { shouldFail = true },
        FakeTemplateEngine().apply { renderResult = "Hello, Alex! New message." },
        dispatchers
    )

    @Test
    fun prepareNotification_withDbFailure_usesDefaults() = runTest(testDispatcher) {
        service.prepareNotification(
            AppEvent(userId = "u1", title = "New Message", body = "...", userName = "Alex")
        )
        val state = service.notificationState.value as NotificationState.Ready
        assertEquals("Hello, Alex! New message.", state.content)
    }
}
```

Thanks for reading!
