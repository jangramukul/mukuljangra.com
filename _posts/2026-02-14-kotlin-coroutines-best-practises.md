---
title: Kotlin Coroutines Best Practices Guide
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Best Practices
---

1. **Use Structured Concurrency, Always**
Structured concurrency is the single most important concept in Kotlin coroutines, and most developers underestimate it. The idea is simple: every coroutine you launch must be tied to a scope that controls its lifetime. When that scope is cancelled, every coroutine inside it is cancelled too. No orphans, no leaks, no fire-and-forget jobs floating around your process.

Here's the thing — structured concurrency isn't just a convenience. It's a design contract. When you launch a coroutine inside `viewModelScope`, you're saying "this work is only meaningful while the ViewModel is alive." When you launch inside `lifecycleScope`, you're saying "this work is tied to the screen." If you can't articulate which scope owns the work, you don't understand the work well enough to launch it.

```kotlin
class PaymentViewModel(
    private val paymentRepository: PaymentRepository
) : ViewModel() {

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            val result = paymentRepository.charge(amount)
            _paymentState.value = result
        }
        // When ViewModel is cleared, this coroutine is cancelled automatically.
        // No manual cleanup. No leaked network calls.
    }
}
```

The tradeoff is that structured concurrency makes it harder to do "background work that outlives a screen." And that's intentional — it forces you to think about where long-lived work actually belongs (usually a `WorkManager` job or a service-scoped coroutine, not a ViewModel).

2. **Inject Dispatchers Instead of Hardcoding Them**
I've seen codebases where `Dispatchers.IO` is scattered across every repository call, every use case, every mapper. It works — until you try to write a unit test and realize your test is actually hitting real threads, running non-deterministically, and occasionally flaking on CI.

The fix is straightforward: inject your dispatchers through constructors. This follows the same principle as any other dependency — if your class depends on something, it should receive it from the outside, not reach for a global singleton.

```kotlin
class TransactionRepository(
    private val api: PaymentApi,
    private val db: TransactionDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun getTransactions(): List<Transaction> {
        return withContext(ioDispatcher) {
            try {
                val remote = api.fetchTransactions()
                db.insertAll(remote)
                remote
            } catch (e: IOException) {
                db.getAllCached()
            }
        }
    }
}
```

In tests, you pass `StandardTestDispatcher()` or `UnconfinedTestDispatcher()` and get fully deterministic, single-threaded execution. `StandardTestDispatcher` queues coroutines and only runs them when you advance the test scheduler — good for testing timing and ordering. `UnconfinedTestDispatcher` runs coroutines eagerly, which is simpler for most unit tests but hides timing bugs. I prefer `StandardTestDispatcher` for anything involving multiple concurrent coroutines, and `UnconfinedTestDispatcher` for straightforward sequential tests.

3. **Avoid GlobalScope Like a Memory Leak**
`GlobalScope` is the coroutine equivalent of a static reference to an Activity. It creates coroutines that live for the entire lifetime of your process and are never automatically cancelled. Google's own coroutines documentation explicitly warns against it, yet I still see it in production codebases.

The problem isn't just memory. A `GlobalScope.launch` that makes a network call will continue even after the user has navigated away, the ViewModel is cleared, and the result is meaningless. You're wasting battery, bandwidth, and potentially writing stale data to your database. Worse, if that coroutine captures a reference to a ViewModel or UI state, you have a genuine leak.

```kotlin
// Don't do this
fun syncUserData() {
    GlobalScope.launch {
        repository.syncAll() // Runs forever, even if no one cares about the result
    }
}

// Instead, scope it properly
class SyncManager(
    private val repository: UserRepository,
    private val applicationScope: CoroutineScope // Inject an application-scoped scope
) {
    fun syncUserData() {
        applicationScope.launch {
            repository.syncAll()
        }
    }
}
```

If you genuinely need process-level work, create an application-scoped `CoroutineScope` with a `SupervisorJob` and inject it. That way it's still controlled, testable, and can be cancelled during tests or when the app is shutting down.

4. **Use supervisorScope When Children Should Fail Independently**
By default, when a child coroutine fails, it cancels its parent and all siblings. This is structured concurrency doing its job — if part of a computation fails, the whole thing fails. But sometimes you genuinely want independent failure. Loading a dashboard where the feed, recommendations, and notifications are fetched in parallel — one failing shouldn't kill the others.

This is what `supervisorScope` is for. It breaks the automatic failure propagation so each child's failure stays local. But here's the part most tutorials skip: `supervisorScope` doesn't handle exceptions for you. Failed children still throw, and if you don't catch those exceptions, they hit the uncaught exception handler and can crash your app.

```kotlin
suspend fun loadDashboard(): DashboardState {
    return supervisorScope {
        val feedDeferred = async { feedRepository.loadFeed() }
        val notificationsDeferred = async { notificationRepository.getUnread() }
        val suggestionsDeferred = async { suggestionRepository.getSuggestions() }

        DashboardState(
            feed = runCatching { feedDeferred.await() }.getOrDefault(emptyList()),
            notifications = runCatching { notificationsDeferred.await() }.getOrDefault(emptyList()),
            suggestions = runCatching { suggestionsDeferred.await() }.getOrDefault(emptyList())
        )
    }
}
```

The `runCatching` around each `await()` is essential. Without it, the first exception would propagate up even though `supervisorScope` prevents sibling cancellation. I see this mistake constantly — developers add `supervisorScope` thinking it "handles errors" and then wonder why their app still crashes.

5. **Make Your Coroutines Cooperatively Cancellable**
Cancellation in coroutines is cooperative. Calling `job.cancel()` doesn't force-stop anything — it sets a flag, and the coroutine only stops if it checks that flag. All `suspend` functions in `kotlinx.coroutines` (like `delay`, `yield`, `withContext`) check for cancellation automatically. But if your coroutine is doing CPU-intensive work in a tight loop, it will run forever unless you explicitly check.

```kotlin
suspend fun processLargeDataset(items: List<RawTransaction>) {
    items.forEach { item ->
        ensureActive() // Throws CancellationException if the coroutine is cancelled
        val processed = heavyTransformation(item)
        repository.save(processed)
    }
}
```

`ensureActive()` is cleaner than checking `isActive` manually because it throws `CancellationException` immediately, which is the proper cancellation mechanism. If you use `isActive`, you need to handle the early return yourself and make sure you don't accidentally swallow the cancellation. One gotcha: never catch `CancellationException` and suppress it. If you have a `catch (e: Exception)` block, add `if (e is CancellationException) throw e` at the top, or use a more specific exception type in your catch.

6. **Handle Exceptions Deliberately With CoroutineExceptionHandler**
Exception handling in coroutines is one of the most misunderstood areas. The rules are different depending on whether you use `launch` or `async`. With `launch`, unhandled exceptions propagate up the scope hierarchy and eventually crash the app. With `async`, exceptions are deferred until you call `await()`. This asymmetry trips up even experienced developers.

A `CoroutineExceptionHandler` is your last line of defense for `launch`-based coroutines. It catches exceptions that would otherwise be unhandled. But it only works when installed on the root coroutine — installing it on a child coroutine has no effect, because the child propagates its exception to the parent before the handler gets a chance to run.

```kotlin
class OrderViewModel(
    private val orderRepository: OrderRepository,
    private val crashReporter: CrashReporter
) : ViewModel() {

    private val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
        crashReporter.log(throwable)
        _uiState.value = OrderUiState.Error(throwable.toUserMessage())
    }

    fun placeOrder(cart: Cart) {
        viewModelScope.launch(exceptionHandler) {
            _uiState.value = OrderUiState.Loading
            val order = orderRepository.submit(cart)
            _uiState.value = OrderUiState.Success(order)
        }
    }
}
```

The tradeoff with `CoroutineExceptionHandler` is that it's a catch-all. You lose the granularity of handling different exception types differently. In practice, I use `try-catch` inside the coroutine for expected errors (network failures, validation errors) and `CoroutineExceptionHandler` only as a safety net for truly unexpected exceptions. If you find yourself putting all your error logic in the handler, you're probably doing it wrong.

7. **Use withContext for Thread Switching, Not launch**
A common mistake is launching a new coroutine just to switch dispatchers. You see `launch(Dispatchers.IO) { ... }` inside an existing coroutine when `withContext(Dispatchers.IO) { ... }` would be simpler, more sequential, and easier to reason about.

`withContext` suspends the current coroutine, switches to the specified dispatcher, runs the block, and returns the result — all sequentially. `launch` creates a new concurrent coroutine with no direct way to return a result. When you just need to move blocking work off the main thread, `withContext` is almost always what you want.

```kotlin
// Unnecessary complexity
suspend fun loadUserProfile(userId: String): UserProfile {
    return coroutineScope {
        val deferred = async(Dispatchers.IO) {
            userApi.fetchProfile(userId)
        }
        deferred.await()
    }
}

// Clear and sequential
suspend fun loadUserProfile(userId: String): UserProfile {
    return withContext(Dispatchers.IO) {
        userApi.fetchProfile(userId)
    }
}
```

The second version is 4 lines shorter, doesn't create an unnecessary `Deferred`, and makes the execution flow obvious. Reserve `launch` and `async` for when you genuinely need concurrency — multiple things happening at the same time.

8. **Test Coroutines With runTest, Not runBlocking**
`runBlocking` blocks the current thread and runs coroutines inside it. This works for simple tests, but it runs in real time — a `delay(5000)` actually waits 5 seconds. `runTest` from `kotlinx-coroutines-test` uses a virtual time scheduler that skips delays automatically, making tests fast and deterministic.

```kotlin
@Test
fun `payment retry waits before second attempt`() = runTest {
    val repository = PaymentRepository(
        api = FakePaymentApi(failFirstAttempt = true),
        ioDispatcher = StandardTestDispatcher(testScheduler)
    )

    val result = repository.processWithRetry(amount = 50.0)

    assertEquals(PaymentResult.Success, result)
    // The retry had a 2-second delay, but runTest skipped it entirely.
    // Total test time: milliseconds, not seconds.
}
```

The key insight is passing `StandardTestDispatcher(testScheduler)` to your class under test. This ensures the class uses the same virtual clock as `runTest`, so `advanceTimeBy()` and `advanceUntilIdle()` work correctly. If you inject a separate `StandardTestDispatcher()` without sharing the scheduler, your virtual time controls won't affect the coroutines inside the class, and you'll get confusing test failures.

9. **Prefer Flow Over Suspend Functions for Streams of Data**
A `suspend` function returns a single value. If your data changes over time — a user's login state, a list of messages, a download progress indicator — you need `Flow`. This seems obvious, but I've seen codebases where ViewModels poll a suspend function on a timer to simulate reactivity instead of collecting a Flow.

```kotlin
class ChatRepository(
    private val chatDao: ChatDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    // Reactive stream — emits whenever the database changes
    fun observeMessages(chatId: String): Flow<List<Message>> {
        return chatDao.observeMessages(chatId)
            .flowOn(ioDispatcher)
            .catch { emit(emptyList()) }
    }
}
```

Use `flowOn` to control which dispatcher the upstream runs on, and `catch` to handle exceptions in the flow pipeline. One thing to be aware of: `flowOn` only affects the operators above it in the chain, not below. This is a common source of confusion when you place `flowOn` in the wrong position and wonder why your database query is still running on the main thread.

10. **Don't Nest withContext Calls Unnecessarily**
If you're already inside `withContext(Dispatchers.IO)`, calling `withContext(Dispatchers.IO)` again inside it is a no-op at the dispatcher level — the coroutine is already on IO. But it does add overhead: each `withContext` call involves a dispatch check and potential context switching machinery. In a codebase where every repository function wraps itself in `withContext(Dispatchers.IO)`, calling them from a use case that also uses `withContext(Dispatchers.IO)` creates nested switches that accomplish nothing.

The cleanest pattern is to have the caller decide the dispatcher. Make your repository functions plain `suspend` functions, and let the ViewModel or use case wrap the call in the appropriate dispatcher. This keeps each layer focused on its own responsibility and avoids redundant thread switching across 3-4 layers deep.

```kotlin
// Repository — just a suspend function, no dispatcher decision
class InvoiceRepository(private val api: InvoiceApi) {
    suspend fun getInvoices(): List<Invoice> = api.fetchAll()
}

// ViewModel — decides the dispatcher
class InvoiceViewModel(
    private val repository: InvoiceRepository,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {
    fun loadInvoices() {
        viewModelScope.launch {
            val invoices = withContext(ioDispatcher) {
                repository.getInvoices()
            }
            _state.value = InvoiceState.Loaded(invoices)
        }
    }
}
```

The tradeoff is that the repository is no longer "main-safe" on its own — callers must remember to switch dispatchers. In practice, I find this acceptable because it makes the dispatcher strategy explicit and testable rather than buried inside every function in the chain. If your team prefers main-safe repositories, that's fine too — just pick one convention and stick with it across the entire codebase.

Thanks for reading!
