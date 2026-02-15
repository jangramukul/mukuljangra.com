---
title: Kotlin Coroutines Fundamentals Guide
layout: post
sequence: 107
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

A few years ago, I was managing background work with `AsyncTask` and `Handler.postDelayed`. Then RxJava came along and gave us composable async pipelines — `subscribeOn`, `observeOn`, `flatMap`, `zip`. For a while, that felt like the answer. But RxJava had a cost: business logic drowned in operator chains. A simple "fetch user, then fetch posts" turned into a reactive declaration that took real effort to read. When a junior developer asked me to explain a chain of `flatMapSingle` → `observeOn` → `doOnError` → `retry`, I realized I was spending more time explaining the plumbing than the actual logic.

Kotlin coroutines changed that equation. When I first wrote `val user = repository.getUser(id)` inside a coroutine and it just worked — no callbacks, no operators, no threading boilerplate — I was skeptical. Code that looks synchronous but runs asynchronously felt like it was hiding something. And it is hiding something, but it's hiding the right things. The compiler handles the suspension and resumption. The dispatcher handles the threading. You write the logic. That's the deal, and after shipping coroutine-based code in production for years, I think it's the best deal Android developers have ever gotten for async programming.

But understanding coroutines well means understanding more than just `suspend fun`. The coroutine builders, the context system, the job hierarchy — these are the load-bearing pieces. Get them right and your concurrent code is clean, cancellable, and leak-free. Get them wrong and you'll chase memory leaks and swallowed exceptions for weeks. This guide covers the fundamentals from the ground up.

## What Coroutines Actually Are

The common explanation is "lightweight threads." That's not wrong, but it hides the important part. A thread is an OS-level construct. Creating a thread allocates a stack (typically 1MB on Android), registers it with the OS scheduler, and the OS decides when it runs. You can create maybe a few hundred threads before performance degrades. A coroutine is a different thing entirely — it's a suspendable computation. It can pause at any suspension point, release the thread it was running on, and resume later on the same or a different thread.

Here's the key insight that changed my mental model: **a coroutine doesn't own a thread.** It borrows one from a dispatcher when it needs to execute code, and gives it back when it suspends. Between `delay(1000)` and the code after it, no thread is occupied. The coroutine is just a state machine sitting in memory, waiting to be scheduled. This is why you can launch 100,000 coroutines and the app stays responsive — they're not 100,000 threads. They're 100,000 small objects sharing a pool of maybe 64 threads. The coroutines library manages the scheduling, and the dispatcher determines which thread pool to use.

This suspension-and-resumption mechanism is what makes coroutines fundamentally different from threads. When a thread calls `Thread.sleep(1000)`, it blocks — it's sitting there consuming memory and an OS scheduler slot, doing nothing. When a coroutine calls `delay(1000)`, it suspends — the thread is freed to run other coroutines. After 1000ms, the dispatcher picks an available thread from the pool and resumes the coroutine on it. The coroutine might resume on a completely different thread than where it started. That's fine, because the coroutine carries its own context — its local variables are stored in the state machine object, not on the thread stack. I remember the first time I logged `Thread.currentThread().name` before and after a `delay()` call and saw two different thread names. That's when coroutines clicked for me.

## Coroutine Builders

Coroutine builders are the entry points — the functions that actually create and start coroutines. There are four you'll use regularly, and understanding when to use each one is fundamental.

**`launch`** is the fire-and-forget builder. It starts a coroutine and returns a `Job` — a handle you can use to cancel or check the status, but not to get a result back. Use `launch` when you need to do work but don't need a return value from it.

```kotlin
class OrderViewModel(
    private val orderRepository: OrderRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    fun placeOrder(order: Order) {
        viewModelScope.launch {
            val result = orderRepository.submit(order)
            _orderState.value = result

            // Fire-and-forget analytics — we don't need the result
            launch {
                analyticsTracker.trackOrderPlaced(order.id)
            }
        }
    }
}
```

**`async`** is for when you need a result. It returns a `Deferred<T>` — a future-like object that you call `await()` on to get the value. The real power of `async` shows up when you need to run multiple operations in parallel. Without `async`, two sequential suspend calls run one after the other. With `async`, they run concurrently, and you only wait for both to finish when you call `await()`.

```kotlin
class DashboardViewModel(
    private val userRepo: UserRepository,
    private val statsRepo: StatsRepository,
    private val notificationRepo: NotificationRepository
) : ViewModel() {

    fun loadDashboard() {
        viewModelScope.launch {
            // These three calls run in PARALLEL
            val userDeferred = async { userRepo.getCurrentUser() }
            val statsDeferred = async { statsRepo.getWeeklyStats() }
            val notificationsDeferred = async { notificationRepo.getUnread() }

            // Now we wait for all three
            val user = userDeferred.await()
            val stats = statsDeferred.await()
            val notifications = notificationsDeferred.await()

            _dashboardState.value = DashboardData(user, stats, notifications)
        }
    }
}
```

This pattern — launching parallel requests with `async` and combining results with `await()` — is one of the things coroutines do dramatically better than callbacks or even RxJava. With callbacks, you'd need a counter or a `CountDownLatch`. With Rx, you'd use `zip`. With coroutines, the code reads like sequential logic even though the network calls are concurrent. Three parallel API calls that used to be 40+ lines of Rx operators are now 6 lines of straightforward code.

**`withContext`** switches the coroutine context — most commonly to change the dispatcher. This is how you move work off the main thread. Unlike `launch`, `withContext` doesn't create a new coroutine with its own Job. It suspends the current coroutine, runs the block on the specified context, and returns the result inline.

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val db: ArticleDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun getArticle(id: String): Article {
        return withContext(ioDispatcher) {
            val cached = db.findById(id)
            if (cached != null && !cached.isStale()) {
                cached
            } else {
                val fresh = api.fetchArticle(id)
                db.insertOrUpdate(fresh)
                fresh
            }
        }
    }
}
```

I want to emphasize an important convention: suspend functions should be **main-safe**. That means the caller should never have to worry about which thread a suspend function runs on — the function itself should switch to the right dispatcher internally using `withContext`. The `getArticle` function above handles its own threading. The ViewModel just calls it from `viewModelScope.launch` (which runs on `Dispatchers.Main`) and everything works.

**`runBlocking`** bridges the blocking world and the suspending world. It blocks the current thread and runs the coroutine inside it. This is useful for `main()` functions and tests, but never use it on the main thread in a production Android app — it will freeze the UI. I've seen teams accidentally use `runBlocking` in a click handler. The app hung for 3 seconds while the network call completed. Use `viewModelScope.launch` or `lifecycleScope.launch` instead.

```kotlin
// Good — in a test
@Test
fun `fetch user returns cached data`() = runBlocking {
    val repo = UserRepository(fakeApi, fakeDao)
    val user = repo.getUser("123")
    assertEquals("Mukul", user.name)
}

// BAD — never do this in production Android code
fun onButtonClicked() {
    val user = runBlocking { repository.getUser(id) } // BLOCKS THE MAIN THREAD
    textView.text = user.name
}
```

## CoroutineContext

Every coroutine has a `CoroutineContext` — think of it as a bag of elements that configure how the coroutine behaves. The four elements you'll interact with most are `Job`, `CoroutineDispatcher`, `CoroutineName`, and `CoroutineExceptionHandler`. The context determines which thread pool runs your code, how exceptions are handled, and how the coroutine's lifecycle is managed.

Contexts are immutable and composable. You combine elements using the `+` operator, and later elements override earlier ones of the same type. This is how you customize a coroutine's behavior at launch time.

```kotlin
val customContext = Dispatchers.IO +
    CoroutineName("DataSync") +
    CoroutineExceptionHandler { _, throwable ->
        logger.error("DataSync failed", throwable)
    }

scope.launch(customContext) {
    // Runs on IO dispatcher, named "DataSync" in debug logs,
    // and exceptions are caught by the handler
    syncDataFromServer()
}
```

Context inheritance is where things get interesting and where bugs creep in. When you launch a child coroutine, it inherits its parent's context. But the child gets a new `Job` that becomes a child of the parent's `Job`. This is the mechanism behind structured concurrency — the parent-child relationship is established through the context's `Job` element. If you pass a custom context to `launch`, it's merged with the parent context, and matching element types from your custom context override the parent's.

One subtlety that trips people up: dispatchers are inherited too. If you `launch` inside a `withContext(Dispatchers.IO)` block without specifying a dispatcher, the child coroutine runs on `Dispatchers.IO`. This is usually fine, but it can surprise you. If a child coroutine needs to update UI, you have to explicitly specify `Dispatchers.Main`, even if the grandparent scope was main-dispatched.

```kotlin
viewModelScope.launch { // Dispatchers.Main (from viewModelScope)
    withContext(Dispatchers.IO) {
        val data = api.fetchData()

        // This child inherits Dispatchers.IO, NOT Dispatchers.Main
        launch {
            // Still on IO — if you try to update UI here, crash
            // _state.value = data  // WRONG — wrong thread
        }

        // Correct — explicitly switch back to Main
        withContext(Dispatchers.Main) {
            _state.value = data
        }
    }
}
```

## Job and Lifecycle

Every coroutine you launch gets a `Job` object. Jobs form a tree — when you launch a coroutine inside another coroutine, the child's `Job` becomes a child of the parent's `Job`. This tree is the backbone of structured concurrency. It's what makes cancellation propagate downward and failure propagate upward.

Cancelling a parent `Job` cancels all its children. This is why `viewModelScope` works so well — when the ViewModel is cleared, its scope's `Job` is cancelled, and every coroutine launched in that scope stops. No manual cleanup, no leaked network calls. But the reverse direction is where it gets nuanced: by default, if a child coroutine fails with an exception, it cancels the parent, which cancels all siblings. One failed API call can take down every coroutine in the scope.

That's where `SupervisorJob` comes in. With a `SupervisorJob`, child failures don't propagate upward. Each child's failure is isolated. This is why `viewModelScope` actually uses `SupervisorJob` internally — you don't want a failed analytics event to cancel your data loading coroutine.

```kotlin
// Without SupervisorJob — one failure cancels everything
val scope = CoroutineScope(Job() + Dispatchers.Main)
scope.launch { loadUserProfile() }     // If this fails...
scope.launch { loadNotifications() }   // ...this gets cancelled too

// With SupervisorJob — failures are isolated
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
scope.launch { loadUserProfile() }     // If this fails...
scope.launch { loadNotifications() }   // ...this keeps running
```

A `Job` moves through a defined set of states: **New** (created with `CoroutineStart.LAZY`), **Active** (running), **Completing** (waiting for children to finish), **Completed** (done successfully), **Cancelling** (cancellation requested, running cancellation handlers), and **Cancelled** (done with cancellation). You can check states with `isActive`, `isCompleted`, and `isCancelled`. In practice, I check `isActive` most often — it's the standard way to make long-running coroutines cooperatively cancellable. If your coroutine does CPU-intensive work in a loop, check `isActive` or call `ensureActive()` periodically so it responds to cancellation. Without that, a cancelled coroutine just keeps running until it hits the next suspension point.

```kotlin
suspend fun processLargeDataset(items: List<DataItem>) {
    for (item in items) {
        ensureActive() // Throws CancellationException if Job is cancelled
        processItem(item)
    }
}
```

## Practical Patterns

In Android, you almost never create `CoroutineScope` directly. Instead, you use lifecycle-aware scopes that the framework provides. `viewModelScope` is tied to the ViewModel's lifecycle — coroutines are cancelled when `onCleared()` is called. `lifecycleScope` is tied to the Activity or Fragment lifecycle. Both use `SupervisorJob` and `Dispatchers.Main.immediate` by default, which is the right configuration for most Android work.

`GlobalScope` exists, and you should avoid it. Coroutines launched in `GlobalScope` have no parent — they bypass structured concurrency entirely. They won't be cancelled when your Activity is destroyed, your ViewModel is cleared, or your Fragment is detached. I've seen `GlobalScope.launch` update a RecyclerView adapter after the Fragment was already destroyed. The result was a crash buried in production logs that took days to reproduce. If you need work that outlives a screen, use a properly scoped `CoroutineScope` injected at the application level, or use `WorkManager` for truly persistent work.

The repository pattern with coroutines is clean. Repository functions are `suspend` functions that handle their own threading with `withContext`. The ViewModel launches coroutines in `viewModelScope` and calls the repository. The repository returns domain objects — no wrapping in `Flow` or `LiveData` for single-shot operations. Error handling is straightforward `try-catch`, which is one of the most underappreciated advantages of coroutines over RxJava. With Rx, error handling required `onErrorReturn`, `onErrorResumeNext`, `doOnError` — each with different semantics. With coroutines, it's just `try-catch`. The exception lands in the catch block with the full stack trace. You decide what to do with it.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    fun search(query: String) {
        viewModelScope.launch {
            _uiState.value = SearchState.Loading
            try {
                val results = searchRepository.search(query)
                _uiState.value = SearchState.Success(results)
            } catch (e: CancellationException) {
                throw e // Never swallow CancellationException
            } catch (e: Exception) {
                _uiState.value = SearchState.Error(e.message ?: "Search failed")
            }
        }
    }
}
```

One critical rule: **never catch `CancellationException`**. If you write `catch (e: Exception)` — which catches everything — you're also catching `CancellationException`, which breaks structured concurrency. The coroutine thinks it completed normally, but it was actually cancelled. Always re-throw `CancellationException`, or use a more specific exception type in your catch blocks. This is the single most common coroutine bug I see in code reviews. It's subtle because the app doesn't crash — it just leaks work that should have been cancelled.

Coroutines fundamentally changed how I think about async code on Android. The progression from AsyncTask's manual thread management, through RxJava's operator chains, to coroutines' sequential-looking concurrent code represents a genuine improvement — not just in API ergonomics, but in how maintainable the code is six months later. The fundamentals covered here — builders, context, jobs, scoping — are the pieces that make everything else in the coroutines ecosystem work. Master these, and Flow, Channels, and advanced patterns all build naturally on top.

Thanks for reading!

## Quiz

#### What's the fundamental difference between `launch` and `async`?

- **Wrong** `launch` runs on the main thread, `async` runs on a background thread
- **Correct** `launch` returns a `Job` (fire-and-forget); `async` returns `Deferred<T>` and you can `await()` the result
- **Wrong** `async` is faster than `launch`
- **Wrong** `launch` is for I/O, `async` is for CPU work

> **Explanation:** `launch` is for coroutines where you don't need a return value — fire and forget. `async` is for coroutines that produce a result — call `await()` to get it. Both can run on any dispatcher. Use `async` when you need parallel decomposition.

#### Why should you never use `GlobalScope.launch` in production Android code?

- **Wrong** It crashes the app
- **Correct** It bypasses structured concurrency — coroutines launched in GlobalScope aren't tied to any lifecycle and won't be cancelled when the component is destroyed, risking memory leaks and crashes
- **Wrong** It's slower than other scopes
- **Wrong** It only works on the main thread

> **Explanation:** `GlobalScope` creates coroutines with no parent. They live until completed or the process dies. In Android, this means coroutines can outlive Activities, Fragments, and ViewModels — updating UI that no longer exists, holding references to destroyed contexts. Always use lifecycle-aware scopes.

## Coding Challenge

Write a `UserProfileLoader` that demonstrates all three coroutine builders. Use `async` to fetch user profile and user posts in parallel, `withContext(Dispatchers.IO)` for the actual network calls, and `launch` to fire a non-blocking analytics event. The function should return a combined `ProfileWithPosts` data class. Handle the case where posts fetch fails but profile succeeds (show partial result).

#### Solution

```kotlin
data class UserProfile(val id: String, val name: String, val avatarUrl: String)
data class UserPost(val id: String, val title: String, val timestamp: Long)
data class ProfileWithPosts(val profile: UserProfile, val posts: List<UserPost>)

class UserProfileLoader(
    private val userApi: UserApi,
    private val analyticsTracker: AnalyticsTracker,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {

    suspend fun loadProfileWithPosts(
        userId: String,
        scope: CoroutineScope
    ): ProfileWithPosts {
        val profileDeferred = scope.async {
            withContext(ioDispatcher) { userApi.fetchProfile(userId) }
        }

        val postsDeferred = scope.async {
            withContext(ioDispatcher) { userApi.fetchPosts(userId) }
        }

        // Fire-and-forget analytics — don't block the result
        scope.launch {
            withContext(ioDispatcher) {
                analyticsTracker.trackProfileViewed(userId)
            }
        }

        val profile = profileDeferred.await()

        val posts = try {
            postsDeferred.await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emptyList() // Partial result — profile loaded, posts failed
        }

        return ProfileWithPosts(profile, posts)
    }
}
```
