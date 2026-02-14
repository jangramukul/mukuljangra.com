---
title: Kotlin Coroutines Best Practices Guide
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Best Practices
---

When coroutines first landed in Kotlin, I treated them like a nicer version of RxJava — just swap `Observable` for `Flow` and `subscribeOn` for `withContext`, right? It took a production memory leak and a silent data corruption bug before I realized coroutines have their own mental model, and trying to map old patterns onto them leads to exactly the kinds of bugs they were designed to prevent. The memory leak was a `GlobalScope.launch` that outlived its ViewModel by minutes, writing stale data to the database. The corruption bug was a swallowed `CancellationException` that let a cancelled write operation complete halfway.

What I've learned since then is that coroutines are opinionated about how concurrent work should be structured, and fighting those opinions always ends badly. Structured concurrency, cooperative cancellation, explicit dispatcher control — these aren't nice-to-haves, they're the load-bearing walls of the entire system. The practices below are the ones I wish I'd internalized before shipping coroutine-based code to production.

## Structured Concurrency Is Non-Negotiable

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

## Scope Management Patterns

Once you internalize structured concurrency, the next question is always: "Where does long-lived work go?" The answer is a properly built application-scoped `CoroutineScope`. I've seen teams use `GlobalScope` for this, which throws away every guarantee structured concurrency gives you. The right approach is creating a scope with `SupervisorJob` and injecting it like any other dependency.

The `SupervisorJob` is critical here. Without it, a single failed coroutine in your application scope cancels every other coroutine running in it — analytics logging, sync jobs, token refreshes, all dead because one unrelated task threw an exception. With `SupervisorJob`, failures stay isolated. In a Hilt-based project, I wire this up as a singleton `@ApplicationScope` and inject it into services, WorkManager workers, and managers that need process-level coroutines. The scope gets a real dispatcher, it's testable with a `StandardTestDispatcher`, and it can be cancelled cleanly in tests.

```kotlin
@Singleton
class ApplicationCoroutineScope @Inject constructor() :
    CoroutineScope by CoroutineScope(SupervisorJob() + Dispatchers.Default)

class SyncManager(
    private val repository: UserRepository,
    private val appScope: ApplicationCoroutineScope
) {
    fun syncUserData() {
        appScope.launch {
            repository.syncAll()
        }
    }
}

// WorkManager worker — uses its own scope, NOT GlobalScope
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val repository: UserRepository
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        repository.syncAll()
        return Result.success()
    }
}
```

For WorkManager, you don't even need your own scope — `CoroutineWorker` gives you a `suspend doWork()` that's already scoped to the worker's lifetime. The framework handles cancellation when the worker is stopped. I think the key mental model is a hierarchy: `viewModelScope` for screen-level work, your injected application scope for process-level work, and `CoroutineWorker` for system-managed background work.

## Injecting Dispatchers

I've seen codebases where `Dispatchers.IO` is scattered across every repository call, every use case, every mapper. It works — until you try to write a unit test and realize your test is actually hitting real threads, running non-deterministically, and occasionally flaking on CI. The fix is straightforward: inject your dispatchers through constructors, just like any other dependency.

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

In tests, you pass `StandardTestDispatcher()` or `UnconfinedTestDispatcher()` and get fully deterministic, single-threaded execution. `StandardTestDispatcher` queues coroutines and only runs them when you advance the test scheduler — good for testing timing and ordering. `UnconfinedTestDispatcher` runs coroutines eagerly, which is simpler but hides timing bugs. I prefer `StandardTestDispatcher` for anything involving multiple concurrent coroutines.

## Independent Failure With supervisorScope

By default, when a child coroutine fails, it cancels its parent and all siblings. But sometimes you genuinely want independent failure — loading a dashboard where the feed, recommendations, and notifications are fetched in parallel, and one failing shouldn't kill the others.

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

## The CancellationException Trap

Cancellation in coroutines is cooperative — calling `job.cancel()` sets a flag, and the coroutine only stops if it checks that flag. All `suspend` functions in `kotlinx.coroutines` (like `delay`, `yield`, `withContext`) check for cancellation automatically. But there's a deeper problem that bites almost every team at some point: accidentally swallowing `CancellationException`.

When you write `catch (e: Exception)`, you're catching `CancellationException` too, because it extends `Exception` (not `Error`). This silently breaks the entire cancellation machinery. The coroutine thinks it handled the error and keeps running, but the parent scope expects the child to be cancelled. I've debugged production issues where a network call kept retrying after the user left the screen, all because a broad `catch` block ate the cancellation signal.

The `runCatching` stdlib function has the same problem. It catches everything, including `CancellationException`, and wraps it in a `Result.failure`. Your code happily processes the "failure" case instead of propagating cancellation. The Kotlin team has acknowledged this is a footgun — there's even a `runCatching` lint warning in some static analysis tools now.

```kotlin
// BROKEN — silently swallows cancellation
suspend fun fetchUser(id: String): User? {
    return try {
        api.getUser(id)
    } catch (e: Exception) {
        // CancellationException lands here too — coroutine won't cancel properly
        null
    }
}

// CORRECT — always rethrow CancellationException
suspend fun fetchUser(id: String): User? {
    return try {
        api.getUser(id)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}

// For CPU-intensive loops, use ensureActive()
suspend fun processLargeDataset(items: List<RawTransaction>) {
    items.forEach { item ->
        ensureActive() // Throws CancellationException if cancelled
        val processed = heavyTransformation(item)
        repository.save(processed)
    }
}
```

`ensureActive()` is cleaner than checking `isActive` manually because it throws `CancellationException` immediately, which is the proper cancellation mechanism. My rule of thumb: every `catch (e: Exception)` in a `suspend` function should have `if (e is CancellationException) throw e` at the top, or better yet, catch the specific exception type you expect (like `IOException`) instead of the broad `Exception`.

## Exception Handling With CoroutineExceptionHandler

The rules for exception handling differ between `launch` and `async`. With `launch`, unhandled exceptions propagate up the scope hierarchy and crash the app. With `async`, exceptions are deferred until you call `await()`. A `CoroutineExceptionHandler` is your last line of defense for `launch`-based coroutines, but it only works when installed on the root coroutine — installing it on a child has no effect.

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

In practice, I use `try-catch` inside the coroutine for expected errors (network failures, validation errors) and `CoroutineExceptionHandler` only as a safety net for truly unexpected exceptions. If you find yourself putting all your error logic in the handler, you're probably doing it wrong.

## withContext for Thread Switching

A common mistake is launching a new coroutine just to switch dispatchers. `withContext` suspends the current coroutine, switches to the specified dispatcher, runs the block, and returns the result — all sequentially. `launch` creates a new concurrent coroutine with no direct way to return a result. When you just need to move blocking work off the main thread, `withContext` is almost always what you want.

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

Reserve `launch` and `async` for when you genuinely need concurrency — multiple things happening at the same time. And avoid nesting `withContext` calls with the same dispatcher. If you're already inside `withContext(Dispatchers.IO)`, wrapping another call in `withContext(Dispatchers.IO)` is a no-op that adds overhead. The cleanest pattern is having the caller decide the dispatcher, making repository functions plain `suspend` functions.

## Flow Best Practices

A `suspend` function returns a single value. If your data changes over time — login state, a list of messages, download progress — you need `Flow`. But raw `Flow` in a ViewModel creates problems: every new collector restarts the upstream, and configuration changes trigger redundant work. This is where `stateIn` and `shareIn` become essential.

`stateIn` converts a cold Flow into a `StateFlow` that shares a single upstream subscription across all collectors. The key parameter is `SharingStarted.WhileSubscribed(5000)` — it keeps the upstream alive for 5 seconds after the last collector disappears. This covers configuration changes (where the Activity is destroyed and recreated within milliseconds) without leaking subscriptions when the user actually leaves the screen. I've seen teams use `SharingStarted.Eagerly` and then wonder why their database observation runs forever even on screens the user never visits.

```kotlin
class ChatViewModel(
    private val chatRepository: ChatRepository
) : ViewModel() {

    val messages: StateFlow<List<Message>> = chatRepository
        .observeMessages(chatId = "main")
        .distinctUntilChanged()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    // Search with debounce and automatic cancellation of stale queries
    private val _searchQuery = MutableStateFlow("")

    val searchResults: StateFlow<List<Message>> = _searchQuery
        .debounce(300)
        .distinctUntilChanged()
        .flatMapLatest { query ->
            if (query.isBlank()) flowOf(emptyList())
            else chatRepository.searchMessages(query)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }
}
```

A few operators I reach for constantly: `distinctUntilChanged()` prevents redundant emissions when the underlying data hasn't actually changed — without it, Room database observations can fire multiple times for the same data during transactions. `debounce(300)` on search input avoids firing a query on every keystroke. And `flatMapLatest` is the key to cancelable searches — when a new query arrives, it automatically cancels the previous search Flow, so you never get stale results arriving after newer ones.

On the UI side, collect with `collectAsStateWithLifecycle()` from the `lifecycle-runtime-compose` artifact. It's lifecycle-aware and stops collection when the UI goes to the background, which pairs perfectly with `WhileSubscribed(5000)` to shut down the entire upstream chain when the app isn't visible.

## Testing With runTest

`runBlocking` blocks the current thread and runs in real time — a `delay(5000)` actually waits 5 seconds. `runTest` from `kotlinx-coroutines-test` uses a virtual time scheduler that skips delays automatically. The key insight is passing `StandardTestDispatcher(testScheduler)` to your class under test so it shares the same virtual clock as `runTest`.

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

If you inject a separate `StandardTestDispatcher()` without sharing the scheduler, your virtual time controls won't affect the coroutines inside the class, and you'll get confusing test failures. This is the single most common testing mistake I see with coroutines.

Thanks for reading!
