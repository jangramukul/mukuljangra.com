---
title: Kotlin Coroutines Best Practices Guide
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Best Practices
---

When coroutines first landed in Kotlin, I treated them like a nicer version of RxJava — just swap `Observable` for `Flow` and `subscribeOn` for `withContext`, right? Sounds reasonable. It was not.

It took a production memory leak and a silent data corruption bug before I realized coroutines have their own mental model, and trying to map old patterns onto them leads to exactly the kinds of bugs they were designed to prevent. The memory leak was a `GlobalScope.launch` that outlived its ViewModel by minutes, writing stale data to the database. The corruption bug? A swallowed `CancellationException` that let a cancelled write operation complete halfway. Half-written payment data in production. Fun times.

Here's the thing — coroutines are opinionated about how concurrent work should be structured, and fighting those opinions always ends badly. Think of it like plumbing in a house: structured concurrency, cooperative cancellation, and explicit dispatcher control aren't decorative fixtures you can skip. They're the load-bearing walls. Remove one, and the ceiling eventually comes down on you at 2 AM. The practices below are the ones I wish I'd internalized before shipping coroutine-based code to production.

## Structured Concurrency Is Non-Negotiable

Structured concurrency is the single most important concept in Kotlin coroutines, and most developers underestimate it. The idea is simple: every coroutine you launch must be tied to a scope that controls its lifetime. When that scope is cancelled, every coroutine inside it is cancelled too. No orphans, no leaks, no fire-and-forget jobs floating around your process.

Think of it like a company org chart. Every employee (coroutine) reports to a manager (scope). When the manager leaves the company, their entire team is let go too. No one is left wandering the hallways with badge access, running up server costs after their project got cancelled. That's what `GlobalScope.launch` does — it creates a rogue employee with no manager, and nobody knows when to fire them.

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

Once you internalize structured concurrency, the next question is always: "Where does long-lived work go?" The answer is a properly built application-scoped `CoroutineScope`. I've seen teams reach for `GlobalScope` here, which throws away every guarantee structured concurrency gives you. It's like buying a house with a security system and then leaving all the doors wide open.

The right approach is creating a scope with `SupervisorJob` and injecting it like any other dependency.

Why `SupervisorJob`? Imagine you have four coroutines running in your application scope: analytics logging, a data sync, a token refresh, and a push notification registration. Without `SupervisorJob`, if the analytics logging throws an exception, it cancels the parent job, which cancels the sync, the token refresh, and the push registration. Everything dies because of one unrelated failure. That's like a fire in the kitchen shutting off electricity to the entire building — including the fire alarm. With `SupervisorJob`, failures stay isolated. The analytics crash, the sync keeps running, and life goes on.

In a Hilt-based project, I wire this up as a singleton `@ApplicationScope` and inject it into services, WorkManager workers, and managers that need process-level coroutines. The scope gets a real dispatcher, it's testable with a `StandardTestDispatcher`, and it can be cancelled cleanly in tests.

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

I've seen codebases where `Dispatchers.IO` is scattered across every repository call, every use case, every mapper. It works — until you try to write a unit test and realize your test is actually hitting real threads, running non-deterministically, and occasionally flaking on CI.

Sound familiar?

The fix is straightforward: inject your dispatchers through constructors, just like any other dependency. You wouldn't hardcode a database URL inside your repository class, right? Same idea. The dispatcher is an external resource your code depends on. Treat it like one.

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

> **🧠 Think about it:** If your tests pass with `UnconfinedTestDispatcher` but fail with `StandardTestDispatcher`, what does that tell you? It usually means your code has a hidden timing dependency that only works by accident in production.

## Independent Failure With supervisorScope

By default, when a child coroutine fails, it cancels its parent and all siblings. That makes sense most of the time — if step 2 of a 3-step process blows up, you probably don't want steps 1 and 3 to keep going.

But sometimes you genuinely want independent failure. Imagine you're loading a dashboard with three sections: the feed, recommendations, and notifications, all fetched in parallel. If the recommendations API is having a bad day, should the user see a completely blank screen? Of course not. Show the feed, show the notifications, and put a "couldn't load recommendations" placeholder where the suggestions would go.

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

The `runCatching` around each `await()` is essential. Without it, the first exception would propagate up even though `supervisorScope` prevents sibling cancellation. I see this mistake constantly — developers add `supervisorScope` thinking it "handles errors" and then wonder why their app still crashes. It isolates failures between siblings, yes. But you still have to catch them yourself.

## The CancellationException Trap

Cancellation in coroutines is cooperative — calling `job.cancel()` sets a flag, and the coroutine only stops if it checks that flag. All `suspend` functions in `kotlinx.coroutines` (like `delay`, `yield`, `withContext`) check for cancellation automatically. But there's a deeper problem that bites almost every team at some point: accidentally swallowing `CancellationException`.

Here's an analogy. Imagine a factory assembly line where a manager yells "STOP THE LINE!" when something goes wrong. The stop signal travels down the line, and every worker checks for it between tasks. Now imagine one worker is wearing noise-cancelling headphones (your `catch (e: Exception)` block). The manager yells stop, the signal reaches the worker, the worker catches it, shrugs, and keeps assembling. The rest of the line has stopped, but this one worker is still churning out parts that nobody wants anymore.

That's what happens when you write `catch (e: Exception)` in a suspend function. You're catching `CancellationException` too, because it extends `Exception` (not `Error`). This silently breaks the entire cancellation machinery. The coroutine thinks it handled the error and keeps running, but the parent scope expects the child to be cancelled. I've debugged production issues where a network call kept retrying after the user left the screen, all because a broad `catch` block ate the cancellation signal.

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

> **🔥 Real talk:** I've seen this bug in three different production codebases. Each time, the symptom was something subtle — a screen that kept loading after being dismissed, a sync that ran twice, a stale write that overwrote fresh data. Each time, the root cause was a `catch (e: Exception)` swallowing cancellation. Make this check a reflex.

## Exception Handling With CoroutineExceptionHandler

The rules for exception handling differ between `launch` and `async`, and mixing them up causes real headaches. With `launch`, unhandled exceptions propagate up the scope hierarchy and crash the app. With `async`, exceptions are deferred — they sit quietly inside the `Deferred` object, waiting to blow up when you call `await()`.

A `CoroutineExceptionHandler` is your last line of defense for `launch`-based coroutines, but it only works when installed on the root coroutine — installing it on a child has no effect. That trips people up. You put the handler on a nested `launch` and wonder why exceptions still crash the app. It's because the exception walks up the hierarchy to the root, and the handler on the child never gets a chance to run.

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

In practice, I use `try-catch` inside the coroutine for expected errors (network failures, validation errors) and `CoroutineExceptionHandler` only as a safety net for truly unexpected exceptions. Think of it like a building's fire suppression system — you don't cook dinner using the sprinklers. You use the stove (try-catch) for normal cooking and let the sprinklers (handler) activate only when something has gone genuinely wrong. If you find yourself putting all your error logic in the handler, you're probably doing it wrong.

## withContext for Thread Switching

A common mistake is launching a new coroutine just to switch dispatchers. I've reviewed PRs where developers use `async(Dispatchers.IO)` followed immediately by `.await()`, creating a whole new concurrent coroutine just to run one sequential operation on a different thread.

`withContext` does exactly what you need here. It suspends the current coroutine, switches to the specified dispatcher, runs the block, and returns the result — all sequentially. No new concurrent coroutine, no `Deferred` to manage, no ceremony. When you just need to move blocking work off the main thread, `withContext` is almost always what you want.

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

Same result, half the code, zero unnecessary concurrency.

Reserve `launch` and `async` for when you genuinely need concurrency — multiple things happening at the same time. And avoid nesting `withContext` calls with the same dispatcher. If you're already inside `withContext(Dispatchers.IO)`, wrapping another call in `withContext(Dispatchers.IO)` is a no-op that adds overhead. The cleanest pattern is having the caller decide the dispatcher, making repository functions plain `suspend` functions.

> **⚡ Quick check:** You see `async(Dispatchers.IO) { someApiCall() }.await()` in a code review. What's wrong with it, and what would you replace it with?

## Flow Best Practices

A `suspend` function returns a single value. But what about data that changes over time — login state, a list of messages, download progress? You need something that can emit multiple values over time. That's `Flow`.

But here's where teams get tripped up. Raw `Flow` in a ViewModel creates problems: every new collector restarts the upstream, and configuration changes trigger redundant work. Imagine a user rotates their phone while your `Flow` is fetching messages from the database. Without any sharing, the rotation destroys the old collector, creates a new one, and restarts the entire database query from scratch. Multiply this by every `Flow` in your ViewModel, and you're doing a lot of unnecessary work.

This is where `stateIn` and `shareIn` become essential. `stateIn` converts a cold Flow into a `StateFlow` that shares a single upstream subscription across all collectors. The key parameter is `SharingStarted.WhileSubscribed(5000)` — it keeps the upstream alive for 5 seconds after the last collector disappears. This covers configuration changes (where the Activity is destroyed and recreated within milliseconds) without leaking subscriptions when the user actually leaves the screen. I've seen teams use `SharingStarted.Eagerly` and then wonder why their database observation runs forever even on screens the user never visits.

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

A few operators I reach for constantly: `distinctUntilChanged()` prevents redundant emissions when the underlying data hasn't actually changed — without it, Room database observations can fire multiple times for the same data during transactions. `debounce(300)` on search input avoids firing a query on every keystroke. And `flatMapLatest` is the key to cancelable searches — when a new query arrives, it automatically cancels the previous search Flow, so you never get stale results arriving after newer ones. It's like a restaurant kitchen that throws away the half-cooked burger when the customer changes their order, instead of finishing it and serving both.

On the UI side, collect with `collectAsStateWithLifecycle()` from the `lifecycle-runtime-compose` artifact. It's lifecycle-aware and stops collection when the UI goes to the background, which pairs perfectly with `WhileSubscribed(5000)` to shut down the entire upstream chain when the app isn't visible.

## Testing With runTest

Here's where I see teams waste hours. `runBlocking` blocks the current thread and runs in real time — a `delay(5000)` actually waits 5 seconds. Your test suite has 200 tests, each with a retry delay, and suddenly CI takes 15 minutes.

`runTest` from `kotlinx-coroutines-test` uses a virtual time scheduler that skips delays automatically. It's like a fast-forward button for your coroutines — all the logic runs in the correct order, but `delay(5000)` completes in microseconds instead of seconds. The key insight is passing `StandardTestDispatcher(testScheduler)` to your class under test so it shares the same virtual clock as `runTest`.

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

If you inject a separate `StandardTestDispatcher()` without sharing the scheduler, your virtual time controls won't affect the coroutines inside the class, and you'll get confusing test failures. The test clock says "I advanced 5 seconds" but the coroutine inside your repository is on a completely different clock that hasn't moved at all. This is the single most common testing mistake I see with coroutines, and it's one of those bugs that makes you stare at the screen for an hour wondering why the test just... hangs.

> **💡 The "aha" moment:** `runTest` and your class under test must share the same `testScheduler`. Two separate `StandardTestDispatcher()` instances means two separate clocks, and advancing one does nothing to the other. Always pass `StandardTestDispatcher(testScheduler)` from inside your `runTest` block.

Thanks for reading!
