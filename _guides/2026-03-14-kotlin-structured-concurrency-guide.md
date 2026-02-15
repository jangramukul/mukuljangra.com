---
title: Kotlin Structured Concurrency Guide
layout: post
sequence: 108
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Structured concurrency is, in my opinion, the single biggest innovation Kotlin coroutines brought to Android development. Not `suspend fun`. Not `Flow`. Not even the CPS transformation that turns sequential-looking code into a state machine. The thing that actually changed how I build apps is the rule that every coroutine must have a scope, and when that scope dies, everything inside it dies too. It sounds simple — almost obvious — but it solves a class of bugs that plagued Android for a decade.

Before coroutines, the "fire and forget and leak" problem was just part of the job. You'd launch something on a background thread, the user would rotate the screen or press back, and that background task would keep running with a reference to a dead Activity. I once spent an entire day tracking down a bug where a network callback was updating a fragment's views after `onDestroyView` had already been called. The fix was three lines of cleanup code that I'd forgotten to write. Structured concurrency makes that category of bug structurally impossible — not "harder to write," but impossible. The runtime enforces the cleanup you used to forget.

## The Problem Structured Concurrency Solves

Think about what happens without structured concurrency. You're in an Activity, you start a network call on a background thread, the user presses back. The Activity is destroyed, but the thread doesn't care — it has no concept of the Activity's lifecycle. The network call completes, the callback fires, it tries to call `findViewById` on a destroyed Activity. You get a `NullPointerException`, or worse, you get nothing — the thread silently updates a reference to a garbage-collected object, and the data is lost.

```kotlin
// The old way — fire and forget
class ProfileActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        loadProfile()
    }

    private fun loadProfile() {
        Thread {
            val user = api.fetchUser() // Takes 5 seconds
            runOnUiThread {
                // Activity might be destroyed by now
                // This either crashes or silently fails
                nameTextView.text = user.name
            }
        }.start()
    }
}
```

This is a toy example, but the real-world version is nastier. In production, you'd have a thread pool executing multiple tasks, each holding references to various UI components. The RxJava era improved things with `CompositeDisposable`, but the cleanup was manual — add every subscription to a disposable, call `clear()` in `onDestroy`. Forget one subscription and you have a leak. I've reviewed codebases where `onDestroy` was 40 lines of manual cleanup. That's 40 lines of code that exist only because the concurrency model didn't understand lifecycles.

Structured concurrency flips the model. Instead of "launch work and remember to cancel it later," you say "launch work inside this scope." The scope is tied to a lifecycle. When the lifecycle ends, the scope cancels, and every coroutine inside it gets cancelled. There is no cleanup code to write because the cleanup is the structure itself.

## CoroutineScope as a Lifecycle Boundary

Every coroutine in Kotlin lives inside a `CoroutineScope`. The scope isn't just a launcher — it's a lifecycle boundary. When the scope is cancelled, every coroutine launched in it receives a cancellation signal. No scope, no coroutine. The compiler enforces this — you literally cannot call `launch` or `async` without a scope.

Android's Jetpack libraries provide scopes that are already wired to the right lifecycles. `viewModelScope` cancels all its coroutines when the ViewModel's `onCleared()` is called. `lifecycleScope` cancels when the lifecycle owner (Activity or Fragment) reaches the `DESTROYED` state. You don't register cleanup callbacks. You don't call `cancel()` manually. The framework does it.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _results = MutableStateFlow<List<SearchResult>>(emptyList())
    val results: StateFlow<List<SearchResult>> = _results.asStateFlow()

    fun search(query: String) {
        viewModelScope.launch {
            val data = searchRepository.search(query)
            _results.value = data
        }
        // User navigates away, ViewModel is cleared —
        // viewModelScope cancels, search coroutine is cancelled.
        // No manual cleanup. No leaked network call.
    }
}
```

Here's the thing most people miss: `viewModelScope` internally uses `SupervisorJob() + Dispatchers.Main.immediate`. The `SupervisorJob` means one failed coroutine in the scope doesn't cancel all siblings — crucial for ViewModels where you might have multiple independent operations running. The `Dispatchers.Main.immediate` means the coroutine starts on the main thread without re-dispatching if you're already on main, which avoids an unnecessary frame delay. These are deliberate choices by the AndroidX team, and understanding them helps you know when to create your own scopes with different configurations.

The hierarchy looks like this: a scope contains coroutines, each coroutine has a `Job`, and that Job is a child of the scope's Job. When the scope's Job is cancelled, it walks the entire tree and cancels every child. This tree structure is what makes structured concurrency "structured" — it's not a flat list of tasks, it's a hierarchy that mirrors the lifecycle hierarchy of your app.

## Parent-Child Relationships

Jobs in coroutines form a tree. This is where structured concurrency gets its real power — and where most of the confusion lives. Every `launch` or `async` creates a new Job that becomes a child of the current coroutine's Job. Cancelling a parent cancels all children. A child's failure propagates to the parent (unless the parent has a `SupervisorJob`). This propagation is what makes exceptions in coroutines feel different from regular Kotlin exceptions.

```kotlin
class OrderViewModel(
    private val orderRepository: OrderRepository,
    private val analyticsService: AnalyticsService
) : ViewModel() {

    fun placeOrder(order: Order) {
        viewModelScope.launch {  // Parent coroutine (Job A)

            launch {  // Child coroutine (Job B)
                orderRepository.submitOrder(order)
            }

            launch {  // Child coroutine (Job C)
                analyticsService.trackOrderPlaced(order.id)
            }

            // If Job B fails:
            // - With regular Job: Job B's failure cancels Job A,
            //   which cancels Job C. Everything stops.
            // - With SupervisorJob (what viewModelScope uses at the top):
            //   Job B's failure does NOT cancel Job C.
        }
    }
}
```

The subtlety here is that `viewModelScope` has a `SupervisorJob` at its root, but the `launch` inside it creates a regular Job. So if `submitOrder` throws, that exception propagates to the parent `launch` block, which cancels the analytics child. The `SupervisorJob` at the viewModelScope level prevents it from tearing down other top-level `launch` calls in the same ViewModel — but within a single `launch` block, sibling children still cancel each other.

This behavior is intentional. The coroutines team at JetBrains designed it this way because within a single logical operation (one `launch` block), if part of the operation fails, the whole operation should fail. You don't want half an order submission to succeed while the other half silently fails. But across independent operations (separate `launch` blocks in a ViewModel), one failure shouldn't nuke everything else. The `SupervisorJob` at the scope level draws that boundary.

## coroutineScope vs supervisorScope

These two scope builders look similar but behave very differently when children fail.

`coroutineScope` follows the strict structured concurrency contract: if any child fails, it cancels all other children and rethrows the exception. This is what you want when all the children are part of one logical operation that should succeed or fail as a unit.

`supervisorScope` isolates failures: if one child fails, other children keep running. The failed child's exception doesn't propagate to siblings. This is what you want when children are independent operations that happen to run at the same time.

```kotlin
class DashboardViewModel(
    private val userRepository: UserRepository,
    private val feedRepository: FeedRepository,
    private val notificationRepository: NotificationRepository
) : ViewModel() {

    fun loadDashboard() {
        viewModelScope.launch {
            // supervisorScope — each section loads independently
            supervisorScope {
                val userDeferred = async { userRepository.getProfile() }
                val feedDeferred = async { feedRepository.getLatestFeed() }
                val notifDeferred = async { notificationRepository.getUnreadCount() }

                // If feed fails, user and notifications still complete
                _userState.value = runCatching { userDeferred.await() }
                    .getOrElse { UserState.Error }
                _feedState.value = runCatching { feedDeferred.await() }
                    .getOrElse { FeedState.Error }
                _notifState.value = runCatching { notifDeferred.await() }
                    .getOrElse { NotifState.Error }
            }
        }
    }
}
```

Compare this with `coroutineScope` — if the feed API throws, it cancels the user and notification calls too. That's terrible UX. The user sees a blank dashboard because one out of three API calls failed. With `supervisorScope`, the user profile and notification count still load, and only the feed section shows an error.

But here's the tradeoff: with `supervisorScope`, you must handle each child's failure individually. If you use `coroutineScope`, a single try-catch around the whole block handles everything. With `supervisorScope`, you need `runCatching` or individual try-catch blocks around each `await()`. More control, more code.

I use `coroutineScope` when all the work is part of one transaction — like fetching data and then writing it to the database. If the fetch fails, I don't want the write to proceed with stale data. I use `supervisorScope` when I'm loading independent UI sections in parallel, where partial success is better than total failure.

## Creating Custom Scopes

`viewModelScope` and `lifecycleScope` cover most cases, but sometimes you need a scope that outlives a screen but doesn't live forever. Repositories, sync services, and app-level operations need their own scopes. The mistake I see most often is reaching for `GlobalScope`.

`GlobalScope` is dangerous because it throws away structured concurrency. A coroutine launched in `GlobalScope` has no parent — nothing cancels it automatically. Memory leaks, stale operations, race conditions — all the problems structured concurrency solved come right back.

```kotlin
// Never do this
fun syncData() {
    GlobalScope.launch {
        repository.syncAll()  // Runs until completion, no lifecycle awareness
    }
}
```

The alternative is creating a custom scope with explicit lifecycle management. For an application-scoped scope, pair it with `SupervisorJob` so individual failures don't cascade.

```kotlin
@Singleton
class AppCoroutineScope @Inject constructor() : CoroutineScope {
    override val coroutineContext: CoroutineContext =
        SupervisorJob() + Dispatchers.Default + CoroutineName("AppScope")
}

class SyncService @Inject constructor(
    private val repository: DataRepository,
    private val appScope: AppCoroutineScope
) {
    fun startPeriodicSync() {
        appScope.launch {
            while (isActive) {
                repository.syncAll()
                delay(15.minutes)
            }
        }
    }
}
```

For repository-scoped operations — work that should outlive a ViewModel but not the repository — create a scope owned by the repository and cancel it when the repository is no longer needed. In a Hilt-based app, a `@ActivityRetainedScoped` repository's scope naturally outlives configuration changes but gets cleaned up when the activity is truly finished.

The key insight is that every scope should map to a real lifecycle in your app. If you can't point to a moment when the scope should be cancelled, you're probably using the wrong scope. `viewModelScope` maps to "while this screen's ViewModel exists." An app scope maps to "while the process is running." A repository scope maps to "while this feature is active." The scope is documentation — it tells future developers exactly how long this work is supposed to live. And in testing, custom scopes become trivial to control — inject one backed by `StandardTestDispatcher` instead of the real scope, and your tests are deterministic.

## Quiz

#### What happens when a child coroutine fails inside `coroutineScope`?

- **Wrong** Only the failed child is cancelled
- **Wrong** The exception is silently swallowed
- **Correct** All sibling coroutines are cancelled and the exception is rethrown to the parent
- **Wrong** The parent scope restarts the failed child

> **Explanation:** `coroutineScope` follows strict structured concurrency — if any child fails, it cancels all other children in the scope and rethrows the exception. This ensures the entire operation fails as a unit rather than producing partial results. Use `supervisorScope` if you need failure isolation between children.

#### Why should you avoid `GlobalScope` in Android apps?

- **Wrong** It's deprecated in the latest Kotlin version
- **Wrong** It only works on the main thread
- **Correct** It breaks structured concurrency — coroutines launched in it have no parent, no automatic cancellation, and no lifecycle awareness
- **Wrong** It causes compilation errors with Android's Jetpack libraries

> **Explanation:** `GlobalScope` launches coroutines with no parent Job, so nothing cancels them automatically when a component is destroyed. This brings back the same memory leak and stale-update bugs that structured concurrency was designed to prevent. Create a custom scope with `SupervisorJob` and proper lifecycle management instead.

## Coding Challenge

Build a `DashboardLoader` that loads three independent data sources in parallel using `supervisorScope`. If any single source fails, the others should still complete successfully. Each result should be wrapped in a sealed class representing success or failure. The loader should use a custom `CoroutineScope` (not `GlobalScope`) and support cancellation. Include a `cancel()` method that tears down all running work.

#### Solution

```kotlin
sealed class LoadResult<out T> {
    data class Success<T>(val data: T) : LoadResult<T>()
    data class Failure(val error: Throwable) : LoadResult<Nothing>()
}

class DashboardLoader(
    private val userRepo: UserRepository,
    private val feedRepo: FeedRepository,
    private val statsRepo: StatsRepository
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    suspend fun loadAll(): Triple<LoadResult<User>, LoadResult<Feed>, LoadResult<Stats>> {
        return scope.async {
            supervisorScope {
                val user = async {
                    runCatching { userRepo.getProfile() }
                        .fold({ LoadResult.Success(it) }, { LoadResult.Failure(it) })
                }
                val feed = async {
                    runCatching { feedRepo.getLatest() }
                        .fold({ LoadResult.Success(it) }, { LoadResult.Failure(it) })
                }
                val stats = async {
                    runCatching { statsRepo.getDashboardStats() }
                        .fold({ LoadResult.Success(it) }, { LoadResult.Failure(it) })
                }
                Triple(user.await(), feed.await(), stats.await())
            }
        }.await()
    }

    fun cancel() {
        scope.cancel()
    }
}
```

Thanks for reading!
