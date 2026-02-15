---
title: "Kotlin Coroutines & Flows"
layout: course
description: "Master structured concurrency, suspend functions, Flow operators, StateFlow, Channels, and exception handling for production Android apps."
icon: "⚡"
color: "#fbbf24"
difficulty: "Intermediate to Expert"
modules: 9
lessons: 50
duration: "10 weeks"
order: 2
tags:
  - Kotlin Coroutines
  - Flows
  - Android
what_you_learn:
  - "Understand structured concurrency and coroutine lifecycle"
  - "See how the compiler transforms suspend functions into state machines"
  - "Handle exceptions and cancellation in production coroutine code"
  - "Build reactive data streams with Flow, StateFlow, and SharedFlow"
  - "Use Flow operators — map, filter, combine, flatMapLatest, debounce"
  - "Implement Channels and backpressure strategies for coroutine communication"
  - "Convert callback APIs to coroutines with suspendCancellableCoroutine and callbackFlow"
  - "Protect shared state with Mutex, Semaphore, and atomic operations"
  - "Test coroutines and Flows with Turbine and TestDispatcher"
prerequisites:
  - "Kotlin fundamentals"
  - "Basic Android development"
---

## Module 1: Coroutines Fundamentals

Coroutines aren't threads. They're a way to write asynchronous code that looks synchronous. Understanding this distinction is the foundation for everything that follows.

### Lesson 1.1: What Are Coroutines?

A coroutine is a suspendable computation. It can pause execution at a suspension point, free the thread, and resume later — potentially on a different thread. This is the fundamental shift from threading: instead of blocking a thread while waiting for I/O, a coroutine suspends, releasing the thread to do other work.

Kotlin Coroutines is the library that makes this possible on JVM and Android. It's not just syntactic sugar over threads — it's a completely different execution model built on top of Continuation Passing Style (CPS) and state machines. When you write a `suspend` function, the Kotlin compiler transforms it into a state machine class with a `label` field that tracks where the coroutine paused. Each suspension point becomes a state, and each resume is a re-entry into that state machine at the next label. This transformation happens at compile time — there is no runtime reflection, no dynamic bytecode generation. The state machine class is a concrete class in the output `.class` file, which means it gets the same JIT optimization treatment as any other JVM class.

The practical result is that you write code that reads sequentially, with no callbacks:

```kotlin
suspend fun fetchUserProfile(userId: String): UserProfile {
    val user = api.getUser(userId)           // Suspends, doesn't block
    val posts = api.getUserPosts(userId)      // Suspends, doesn't block
    return UserProfile(user, posts)
}
```

Under the hood, this function is split into three states by the compiler. State 0 calls `getUser` and potentially suspends. If it does, the function returns `COROUTINE_SUSPENDED` and the thread is free. When the network call completes, the state machine re-enters at state 1, which calls `getUserPosts`. State 2 assembles the result. The entire local variable scope — `user`, `posts` — is lifted from the stack into fields on the state machine class. This is why a coroutine that suspends doesn't hold onto a thread stack frame. The thread's call stack unwinds completely, and the only thing left in memory is a small object (the state machine) with a few fields.

To understand why this matters, consider what happens with threads. When a thread calls a blocking I/O function, the operating system puts that thread to sleep. The thread's entire stack frame — typically 512KB to 1MB of memory — sits in memory doing nothing. The OS scheduler has to track this sleeping thread, and when the I/O completes, it has to wake the thread and context-switch back to it. With thousands of concurrent connections (as in a server), this means thousands of sleeping threads, each consuming a megabyte of memory. Coroutines eliminate this entirely. The thread is returned to the pool immediately on suspension, and the only memory cost is the state machine object — typically 100-400 bytes.

```kotlin
// Demonstrating coroutine lightweight nature
fun main() = runBlocking {
    // Launch 100,000 coroutines — each one suspends for 1 second
    val jobs = List(100_000) {
        launch {
            delay(1000L)
            print(".")
        }
    }
    jobs.forEach { it.join() }
    // All 100,000 complete in ~1 second, using only a handful of threads
}
```

This works because `delay` is a suspend function — it doesn't block the thread. The coroutine library schedules a timer and returns the thread to the pool. When the timer fires, the coroutine is resumed on whatever thread is available. The entire 100,000 coroutines share a small thread pool (typically equal to the number of CPU cores).

**Coroutines vs Threads** — A thread is an OS-level construct that costs ~1MB of stack memory. A coroutine is a Kotlin-level construct that costs ~100 bytes — just a small object with fields for local variables and a label integer. You can launch 100,000 coroutines on a single thread without breaking a sweat. Try that with threads and you'll run out of memory before you hit 10,000. Threads are preemptively scheduled by the OS — the OS can pause a thread at any instruction boundary. Coroutines are cooperatively scheduled — they only yield control at suspension points (calls to `suspend` functions). This cooperative nature is why coroutines are more predictable: you know exactly where your code can be interrupted.

```kotlin
// Thread approach — expensive and limited
fun threadApproach() {
    val threads = List(10_000) {
        thread {
            Thread.sleep(1000)  // Blocks 1MB of stack memory
            println("Done")
        }
    }
    threads.forEach { it.join() }
    // Likely crashes with OutOfMemoryError before completing
}

// Coroutine approach — lightweight and scalable
fun coroutineApproach() = runBlocking {
    val jobs = List(100_000) {
        launch {
            delay(1000)  // Suspends, frees the thread
            println("Done")
        }
    }
    jobs.forEach { it.join() }
    // Completes successfully using minimal memory
}
```

The history of async programming on Android went through several phases: raw `Thread` + `Handler`, `AsyncTask` (deprecated), `RxJava` (powerful but complex), and finally coroutines. Each iteration tried to solve the same problem — how to do work off the main thread without callback hell. Coroutines solved it by making the compiler do the hard work. The `suspend` keyword is the only thing the developer writes; the compiler generates all the callback machinery.

```kotlin
// The evolution of Android async code:

// 1. AsyncTask (deprecated) — manual lifecycle management
class FetchUserTask : AsyncTask<String, Void, User>() {
    override fun doInBackground(vararg params: String): User {
        return api.getUser(params[0])  // Blocking call
    }
    override fun onPostExecute(result: User) {
        textView.text = result.name  // Might crash if Activity is destroyed
    }
}

// 2. Callbacks — callback hell
fun fetchUser(userId: String, callback: (User) -> Unit) {
    api.getUser(userId) { user ->
        api.getPosts(user.id) { posts ->
            api.getComments(posts[0].id) { comments ->
                // Deeply nested, error-prone, hard to cancel
                callback(user)
            }
        }
    }
}

// 3. Coroutines — sequential, cancellable, structured
suspend fun fetchUser(userId: String): User {
    val user = api.getUser(userId)
    val posts = api.getPosts(user.id)
    val comments = api.getComments(posts[0].id)
    return user  // Clean, sequential, automatically cancellable
}
```

**Common Mistakes**

The most common mistake beginners make is thinking that marking a function `suspend` automatically makes it run on a background thread. It doesn't. `suspend` only means the function *can* pause. Where it runs depends on the dispatcher. A suspend function called from `Dispatchers.Main` still runs on the main thread — it just has the ability to suspend at specific points. If you do CPU-intensive work inside a suspend function without switching dispatchers, you'll still freeze the UI.

```kotlin
// WRONG — suspend doesn't mean "background thread"
suspend fun parseJson(json: String): Data {
    // This runs on whatever thread called it
    // If called from Main, it blocks the UI
    return Json.decodeFromString(json)  // CPU-intensive on Main thread
}

// CORRECT — explicitly switch to appropriate dispatcher
suspend fun parseJson(json: String): Data = withContext(Dispatchers.Default) {
    Json.decodeFromString(json)  // Now runs on Default (CPU) thread pool
}
```

Another common mistake is calling blocking functions inside coroutines without `withContext`. If you call `Thread.sleep(1000)` inside a coroutine on `Dispatchers.Main`, you block the main thread for 1 second. The coroutine doesn't know the difference between a blocking call and a fast call — it's just executing code sequentially. Only `suspend` function calls trigger the suspension machinery.

**Key takeaway:** Coroutines let you write sequential-looking code that executes asynchronously. The `suspend` keyword marks functions that can pause and resume, and the compiler generates the state machine that makes it work. A coroutine costs ~100-400 bytes versus ~1MB for a thread. The `suspend` keyword doesn't determine which thread code runs on — that's the dispatcher's job.

### Lesson 1.2: CoroutineScope and Structured Concurrency

Structured concurrency means every coroutine has a parent, and if the parent is cancelled, all children are cancelled too. No orphan coroutines leaking resources, no fire-and-forget jobs accumulating silently, no coroutines crashing because they try to update a destroyed UI. This is the single most important design decision in Kotlin coroutines, and it separates them from every other async framework.

The concept comes from a simple observation: in well-structured code, the lifetime of concurrent work should match the lifetime of the scope that started it. If a ViewModel is destroyed, all its coroutines should stop. If a function returns, all the concurrent work it started should be complete. If a parent task fails, child tasks should be cancelled because their results are no longer needed. Structured concurrency enforces these rules automatically.

The mechanism is `CoroutineScope`. A scope owns zero or more child coroutines, and its lifecycle determines their lifetime. When the scope is cancelled (e.g., a ViewModel is cleared), every coroutine inside it receives a `CancellationException`. Android provides two built-in scopes:

```kotlin
class UserViewModel : ViewModel() {
    fun loadProfile(userId: String) {
        viewModelScope.launch {
            val profile = fetchUserProfile(userId)
            _state.value = ProfileState.Loaded(profile)
        }
    }
}

class ProfileFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        viewLifecycleOwner.lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect { state ->
                    updateUI(state)
                }
            }
        }
    }
}
```

The hierarchy works like this: `CoroutineScope` contains a `CoroutineContext`, which contains a `Job`. When you `launch` a new coroutine, its `Job` becomes a child of the scope's `Job`. Cancelling the parent `Job` cascades to all children. This is why `viewModelScope` is safe — when Android clears the ViewModel, it cancels the scope's job, which cancels every coroutine inside it.

To understand the parent-child relationship more deeply, consider what happens when you nest `launch` calls:

```kotlin
viewModelScope.launch {              // Coroutine A — child of viewModelScope's Job
    launch {                          // Coroutine B — child of A
        launch {                      // Coroutine C — child of B
            delay(Long.MAX_VALUE)
        }
    }
    launch {                          // Coroutine D — child of A
        delay(Long.MAX_VALUE)
    }
}
// When viewModelScope is cancelled:
// viewModelScope.Job cancelled → A cancelled → B cancelled → C cancelled
//                                            → D cancelled
```

Every `launch` creates a new `Job` that becomes a child of the enclosing coroutine's `Job`. This creates a tree. Cancelling any node in the tree cancels all its descendants. This is implemented through the `Job.children` property — each `Job` maintains a linked list of its child jobs. When `cancel()` is called, it walks this list and calls `cancel()` on each child recursively.

You can also create custom scopes for work that lives beyond a single screen. The key is using `SupervisorJob` so one failed child doesn't bring down the entire scope:

```kotlin
@Singleton
class ApplicationCoroutineScope @Inject constructor() :
    CoroutineScope by CoroutineScope(SupervisorJob() + Dispatchers.Default)

class SyncManager(
    private val appScope: ApplicationCoroutineScope
) {
    fun syncUserData() {
        appScope.launch {
            repository.syncAll()
        }
    }
}
```

**Why creating your own CoroutineScope requires care** — When you create a `CoroutineScope` manually, you're taking responsibility for its lifecycle. You must cancel it when it's no longer needed. This is why Android provides `viewModelScope` and `lifecycleScope` — they're cancelled automatically at the right lifecycle event. If you create a custom scope in a singleton, it lives for the entire app lifecycle, which is appropriate for app-level background work but dangerous for UI-related work.

```kotlin
// DANGEROUS — creating a scope without lifecycle management
class LeakyService {
    private val scope = CoroutineScope(Dispatchers.IO)

    fun doWork() {
        scope.launch {
            // This coroutine lives forever unless you manually cancel scope
            // If LeakyService is recreated, old scope keeps running
        }
    }
    // No cancel() method — resource leak
}

// CORRECT — scope with explicit lifecycle
class ManagedService : Closeable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun doWork() {
        scope.launch {
            // Work happens here
        }
    }

    override fun close() {
        scope.cancel()  // Clean up all coroutines
    }
}
```

**The `coroutineScope` builder vs `CoroutineScope` constructor** — These look similar but serve completely different purposes. The `coroutineScope { }` builder is a suspend function that creates a child scope, runs its block, and waits for all children to complete before returning. It's for decomposing a single operation into parallel parts. The `CoroutineScope()` constructor creates a standalone scope with its own lifecycle — it's for creating scopes that outlive a single function call.

```kotlin
// coroutineScope builder — creates a temporary child scope
suspend fun fetchBoth(): Pair<User, Orders> = coroutineScope {
    val user = async { api.getUser("123") }
    val orders = async { api.getOrders("123") }
    user.await() to orders.await()
    // coroutineScope returns only after both async blocks complete
}

// CoroutineScope constructor — creates a standalone scope
class WorkManager {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    // This scope lives until explicitly cancelled
}
```

**Common Mistakes**

The biggest mistake with scopes is using `GlobalScope`. `GlobalScope` is a singleton scope that lives for the entire application lifetime. Coroutines launched in it are never automatically cancelled. This means if you launch a coroutine in `GlobalScope` from a ViewModel, it keeps running after the ViewModel is destroyed. It might try to update a `StateFlow` that nobody is collecting, or write stale data to the database.

```kotlin
// WRONG — coroutine outlives the ViewModel
class DangerousViewModel : ViewModel() {
    fun loadData() {
        GlobalScope.launch {
            val data = api.fetchData()
            // ViewModel might be cleared by now
            // _state might be garbage collected
            _state.value = data  // Potential crash or silent failure
        }
    }
}

// CORRECT — coroutine dies with the ViewModel
class SafeViewModel : ViewModel() {
    fun loadData() {
        viewModelScope.launch {
            val data = api.fetchData()
            _state.value = data  // Safe — cancelled if ViewModel is cleared
        }
    }
}
```

Another common mistake is launching multiple independent coroutines with `launch` inside a regular `coroutineScope` when they should be independent. If one fails, all siblings are cancelled. Use `supervisorScope` if you want independent failure handling.

**Why structured concurrency matters** — Without it, you get fire-and-forget coroutines that leak memory, crash after the UI is gone, and are impossible to test. A `GlobalScope.launch` in a ViewModel will keep running after the ViewModel is destroyed, potentially writing stale data to the database or crashing when it tries to update a collected `StateFlow` on a dead scope. Testing becomes impossible too — how do you wait for a `GlobalScope.launch` to complete in a test? You can't, because there's no handle to the scope's job.

```kotlin
// Production pattern: scope with error handling for app-level work
@Singleton
class AppScope @Inject constructor() {
    private val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
        Logger.e("AppScope", "Unhandled exception", throwable)
        CrashReporter.report(throwable)
    }

    val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default + exceptionHandler
    )

    fun cancel() = scope.cancel()
}
```

**Key takeaway:** Never use `GlobalScope`. Always launch coroutines within a scope that has a defined lifecycle — `viewModelScope`, `lifecycleScope`, or a custom scope you control with `SupervisorJob`. The parent-child `Job` hierarchy is the enforcement mechanism — cancelling a parent cascades to all children. The `coroutineScope` builder creates a temporary child scope; the `CoroutineScope` constructor creates a standalone scope with its own lifecycle.

### Lesson 1.3: Dispatchers — Threading Model

Dispatchers determine which thread pool a coroutine runs on. They're the bridge between coroutines (a language-level concept) and threads (an OS-level concept). Every coroutine runs on a dispatcher, and the dispatcher decides which thread (or threads) execute the coroutine's code. Understanding dispatchers is essential because choosing the wrong one causes either UI freezes (doing I/O on Main) or crashes (`CalledFromWrongThreadException` when touching views from a background thread).

```kotlin
withContext(Dispatchers.Main) {
    textView.text = "Updated"  // UI operations only
}

withContext(Dispatchers.IO) {
    val data = database.query("SELECT * FROM users")
    val response = httpClient.get("https://api.example.com")
}

withContext(Dispatchers.Default) {
    val sorted = hugeList.sorted()
    val parsed = json.parse(largePayload)
}
```

**How dispatchers work internally** — A dispatcher implements the `ContinuationInterceptor` interface, which has two key methods: `isDispatchNeeded(context)` and `dispatch(context, block)`. When a coroutine is about to resume, the coroutine machinery calls `isDispatchNeeded`. If it returns `true`, the `dispatch` method is called, which posts the continuation as a `Runnable` to the dispatcher's thread pool. If `isDispatchNeeded` returns `false`, the coroutine resumes immediately on the current thread.

For `Dispatchers.Main` on Android, the `dispatch` method posts a `Runnable` to the main `Looper`'s `Handler`. This is how coroutines interact with the Android message queue — each resume is a message posted to the main thread's handler. For `Dispatchers.Default` and `Dispatchers.IO`, the `dispatch` method submits the `Runnable` to a shared `CoroutineScheduler` thread pool.

**IO vs Default internals** — `Dispatchers.IO` is backed by a thread pool of 64 threads (by default, configurable via `kotlinx.coroutines.io.parallelism`) designed for blocking operations. `Dispatchers.Default` uses a thread pool sized to CPU cores, optimized for computation. They actually share the same underlying thread pool but have different concurrency limits. When a coroutine switches from `Default` to `IO`, it may stay on the same physical thread — only the concurrency limit changes. This sharing is an optimization — the coroutine scheduler reuses threads between the two dispatchers rather than maintaining two separate pools.

```kotlin
// Demonstrating thread sharing between IO and Default
suspend fun demonstrateThreadSharing() {
    withContext(Dispatchers.Default) {
        println("Default: ${Thread.currentThread().name}")
        // Output: DefaultDispatcher-worker-1

        withContext(Dispatchers.IO) {
            println("IO: ${Thread.currentThread().name}")
            // Output: DefaultDispatcher-worker-1  (same thread!)
            // The thread didn't change — only the concurrency limit did
        }
    }
}
```

The reason `Dispatchers.IO` allows 64 threads while `Default` limits to CPU cores is about the nature of the work. CPU-bound work benefits from at most CPU-count threads — more threads just add context switching overhead without improving throughput. I/O-bound work spends most of its time waiting (for network responses, disk reads), so having more threads means more concurrent I/O operations. The 64-thread default for IO is a reasonable balance — high enough for most apps, but not so high that it wastes OS resources.

```kotlin
// You can increase IO parallelism for apps with heavy concurrent I/O
// Set this system property before any coroutine is launched:
System.setProperty("kotlinx.coroutines.io.parallelism", "128")

// Or use limitedParallelism for fine-grained control
val databaseDispatcher = Dispatchers.IO.limitedParallelism(4)
val networkDispatcher = Dispatchers.IO.limitedParallelism(20)

// Each limited dispatcher carves out a subset of the IO pool
// This prevents one category of work from starving another
suspend fun fetchAndSave() {
    val data = withContext(networkDispatcher) { api.fetch() }
    withContext(databaseDispatcher) { db.save(data) }
}
```

**Dispatchers.Main.immediate** — When you call `withContext(Dispatchers.Main)` while already on the main thread, it still posts a message to the handler and resumes later. `Dispatchers.Main.immediate` optimizes this: if you're already on the main thread, it executes immediately without dispatching. This eliminates a frame of latency for same-thread operations.

```kotlin
// Without immediate — always dispatches, even if already on Main
suspend fun updateUIWithDispatch() {
    withContext(Dispatchers.Main) {
        // Posts to handler, executes on next message loop iteration
        textView.text = "Updated"  // One frame delay
    }
}

// With immediate — executes instantly if already on Main
suspend fun updateUIImmediate() {
    withContext(Dispatchers.Main.immediate) {
        // If already on Main, executes right now
        // If not on Main, dispatches (same as Dispatchers.Main)
        textView.text = "Updated"  // No unnecessary delay
    }
}
```

**The Unconfined trap** — `Dispatchers.Unconfined` says "don't dispatch, just run on whatever thread we're on." But after a suspension point like `delay()`, the coroutine resumes on whatever thread the delay mechanism uses (the `DefaultExecutor` daemon thread). This means code after a suspension point runs on a different thread than code before it. If you're doing UI work, this causes `CalledFromWrongThreadException`. The real implementation of Unconfined is simple — `isDispatchNeeded` always returns `false` and the `dispatch` method throws because it should never be called. The fix isn't a different dispatcher — it's `EmptyCoroutineContext`, which doesn't override the dispatcher at all.

```kotlin
// Demonstrating the Unconfined thread-switching problem
suspend fun unconfinedDanger() {
    withContext(Dispatchers.Unconfined) {
        println("Before delay: ${Thread.currentThread().name}")
        // Output: main

        delay(100)

        println("After delay: ${Thread.currentThread().name}")
        // Output: kotlinx.coroutines.DefaultExecutor
        // DIFFERENT THREAD! UI operations here would crash
    }
}
```

**Real-world production pattern: dispatcher injection** — Never hardcode dispatchers. Always inject them so tests can substitute `TestDispatcher`:

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val defaultDispatcher: CoroutineDispatcher = Dispatchers.Default
) {
    suspend fun getUser(id: String): User = withContext(ioDispatcher) {
        val raw = api.fetchUser(id)
        withContext(defaultDispatcher) {
            parseUser(raw)  // CPU-intensive parsing on Default
        }
    }
}

// In tests:
val testDispatcher = StandardTestDispatcher()
val repo = UserRepository(
    api = fakeApi,
    dao = fakeDao,
    ioDispatcher = testDispatcher,
    defaultDispatcher = testDispatcher
)
```

**Swap dispatchers** — Each `Continuation` object holds a `CoroutineContext` that includes the dispatcher. Before calling `resumeWith`, the coroutine machinery reads the dispatcher from the context and dispatches the resume to the correct thread. This is why `withContext(Dispatchers.IO)` works — it swaps the dispatcher in the continuation's context, and when the block completes, the original dispatcher resumes execution on its thread. The actual mechanics involve creating a `DispatchedContinuation` that wraps the real continuation and intercepts `resumeWith` to dispatch to the correct thread.

**Common Mistakes**

Using `Dispatchers.IO` for CPU-intensive work is a common mistake. While it won't crash, it wastes threads. `Dispatchers.IO` has 64 threads — if you do heavy computation on all 64, you're context-switching 64 threads on a device with 4-8 CPU cores. `Dispatchers.Default` limits to CPU cores, which is optimal for computation.

Another mistake is calling `Thread.sleep()` inside a coroutine instead of `delay()`. `Thread.sleep()` blocks the underlying thread, meaning no other coroutines can run on it. `delay()` suspends the coroutine and frees the thread.

```kotlin
// WRONG — blocks the thread, wastes resources
suspend fun wrongDelay() {
    Thread.sleep(1000)  // Blocks the thread for 1 second
}

// CORRECT — suspends the coroutine, frees the thread
suspend fun correctDelay() {
    delay(1000)  // Thread is free to run other coroutines
}
```

**Key takeaway:** Use `Dispatchers.Main` for UI, `Dispatchers.IO` for network/disk, `Dispatchers.Default` for computation. Use `withContext()` to switch dispatchers. Never use `Dispatchers.Unconfined` in production — use `EmptyCoroutineContext` when you need a no-op context for testing. Use `Dispatchers.IO.limitedParallelism()` to create isolated sub-dispatchers for different types of I/O work. Always inject dispatchers for testability.

### Lesson 1.4: Coroutine Builders — launch, async, runBlocking

Kotlin provides several coroutine builders, each with different semantics for how the coroutine is started and how its result is delivered. Understanding the differences is critical because using the wrong builder causes subtle bugs — exceptions that silently propagate, deadlocked threads, or wasted resources.

The four primary builders are `launch`, `async`, `runBlocking`, and `withContext`. Each fills a specific role in the coroutine ecosystem:

```kotlin
// launch — fire-and-forget, returns Job
val job = scope.launch {
    sendAnalytics(event)
}
job.cancel()

// async — returns Deferred<T>, call await() for result
val deferred = scope.async {
    api.getUser(userId)
}
val user = deferred.await()

// Parallel decomposition with async
suspend fun loadDashboard(): Dashboard = coroutineScope {
    val user = async { api.getUser(userId) }
    val orders = async { api.getOrders(userId) }
    val recs = async { api.getRecommendations(userId) }

    Dashboard(
        user = user.await(),
        orders = orders.await(),
        recommendations = recs.await()
    )
}

// runBlocking — blocks the current thread
fun main() = runBlocking {
    val result = fetchData()
    println(result)
}

// withContext — switches context while maintaining parent scope
suspend fun fetchUser(): User = withContext(Dispatchers.IO) {
    api.getUser("123")
}

// coroutineScope — creates a new scope, waits for all children
suspend fun fetchBoth(): Pair<User, Orders> = coroutineScope {
    val user = async { api.getUser("123") }
    val orders = async { api.getOrders("123") }
    user.await() to orders.await()
}
```

**How `launch` works internally** — When you call `scope.launch { }`, it creates a new `StandaloneCoroutine` (or `LazyStandaloneCoroutine` if you use `CoroutineStart.LAZY`). This coroutine gets a new `Job` that becomes a child of the scope's `Job`. The lambda you pass becomes the `invokeSuspend` method of the generated state machine. `launch` returns this `Job` immediately — it doesn't wait for the coroutine to complete. The coroutine is scheduled on the dispatcher and will start executing (possibly on a different thread) after `launch` returns.

```kotlin
// launch starts immediately (by default) and returns Job
val job = scope.launch {
    println("This might execute after 'Job created'")
}
println("Job created")
// Output order depends on the dispatcher
// With Dispatchers.Default, the launch block might run before or after "Job created"
// With Dispatchers.Main, "Job created" prints first (launch dispatches to handler)
```

**How `async` works internally** — `async` creates a `DeferredCoroutine` instead of a `StandaloneCoroutine`. A `Deferred<T>` extends `Job` with an `await()` method. The result is stored in the deferred when the coroutine completes. `await()` is a suspend function — if the result isn't ready, it suspends the calling coroutine until it is. If the deferred completed with an exception, `await()` rethrows that exception.

```kotlin
// async returns immediately, computation runs concurrently
val deferred: Deferred<User> = scope.async {
    api.getUser("123")  // This runs concurrently
}
// ... do other work while getUser is in progress ...
val user: User = deferred.await()  // Suspends until result is ready
```

**The async trap** — `async` without `await()` is a bug waiting to happen. If the async coroutine throws, the exception is stored in the `Deferred` but also propagates up to the parent scope immediately. The exception doesn't wait for `await()`. By the time your `catch` block around `await()` runs, the parent scope may already be cancelled. Use `supervisorScope` if you need to handle `async` failures independently.

```kotlin
// DANGEROUS — exception propagates before await()
scope.launch {
    val deferred = async {
        throw IOException("Network error")
        // Exception propagates to parent launch IMMEDIATELY
    }

    try {
        deferred.await()  // This catch might be too late
    } catch (e: IOException) {
        // The parent launch might already be cancelled
        // Other siblings might already be cancelled
    }
}

// SAFE — supervisorScope prevents propagation
scope.launch {
    supervisorScope {
        val deferred = async {
            throw IOException("Network error")
            // Exception stored in Deferred, does NOT propagate up
        }

        try {
            deferred.await()  // Exception thrown here
        } catch (e: IOException) {
            // Safe to handle — parent is not affected
            handleError(e)
        }
    }
}
```

**CoroutineStart options** — By default, `launch` and `async` start immediately (`CoroutineStart.DEFAULT`). You can change this:

```kotlin
// LAZY — doesn't start until explicitly started or awaited
val deferred = async(start = CoroutineStart.LAZY) {
    api.expensiveCall()
}
// ... later, when you actually need the result ...
deferred.start()  // or deferred.await() which starts it too

// UNDISPATCHED — starts immediately on the current thread,
// then dispatches after the first suspension point
scope.launch(start = CoroutineStart.UNDISPATCHED) {
    // This line runs on the calling thread, NOT dispatched
    println("Immediate: ${Thread.currentThread().name}")

    delay(100)

    // After suspension, runs on the dispatcher's thread
    println("After delay: ${Thread.currentThread().name}")
}
```

**runBlocking vs coroutineScope** — `runBlocking` blocks the thread it's called on. It exists primarily for `main()` functions and test code. `coroutineScope` suspends (doesn't block) and creates a child scope that waits for all its children. In Android, you should almost never use `runBlocking` — it defeats the purpose of coroutines. The key difference is visible in their implementations: `runBlocking` creates an event loop on the current thread and blocks until all child coroutines complete. `coroutineScope` just suspends the current coroutine.

```kotlin
// runBlocking blocks the thread — NEVER use on Android main thread
fun main() = runBlocking {
    // This is fine in main() or tests
    val data = fetchData()
    println(data)
}

// NEVER do this on Android:
class BadActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        runBlocking {
            // This blocks the main thread — ANR guaranteed
            val data = api.fetchData()
            textView.text = data.toString()
        }
    }
}

// withContext vs coroutineScope:
// withContext switches the dispatcher, coroutineScope doesn't
suspend fun example() {
    coroutineScope {
        // Inherits the caller's dispatcher
        // Purpose: parallel decomposition
    }

    withContext(Dispatchers.IO) {
        // Switches to IO dispatcher
        // Purpose: context switch for a block of code
    }
}
```

**Common Mistakes**

A frequent mistake is using `async` when `launch` would suffice. If you don't need the return value, use `launch`. Using `async` without `await()` means exceptions might propagate unexpectedly.

Another mistake is nesting `runBlocking` inside another coroutine. This blocks the thread of the outer coroutine, potentially causing deadlocks if the inner `runBlocking` needs a thread from the same pool.

```kotlin
// DEADLOCK risk — runBlocking inside a coroutine
scope.launch(Dispatchers.Default) {
    // If Default pool has N threads and N coroutines each call runBlocking...
    runBlocking {
        // This blocks a Default thread, waiting for inner work
        // But inner work might need a Default thread too — deadlock
        withContext(Dispatchers.Default) { compute() }
    }
}
```

**Key takeaway:** Use `launch` when you don't need a return value. Use `async`/`await` for parallel work where you need results. Wrap parallel `async` calls in `coroutineScope` for structured concurrency. Never use `runBlocking` on the Android main thread. Use `supervisorScope` with `async` when you need to handle failures independently.

### Lesson 1.5: CoroutineContext — The Configuration Bag

A `CoroutineContext` is an indexed set of elements that configure how a coroutine runs. Think of it as a `Map` where each key maps to exactly one element. The most common elements are `Job`, `CoroutineDispatcher`, `CoroutineName`, and `CoroutineExceptionHandler`. Every coroutine has a context, and the context determines the coroutine's dispatcher, its parent job, its name (for debugging), and how unhandled exceptions are processed.

The context is implemented as a persistent data structure — adding elements creates a new context without modifying the original. This immutability is important because contexts are shared across coroutine boundaries. The `+` operator is used to combine context elements:

```kotlin
val context = SupervisorJob() + Dispatchers.IO + CoroutineName("sync")

val dispatcher = context[CoroutineDispatcher]  // Dispatchers.IO
val job = context[Job]                          // SupervisorJob

val scope = CoroutineScope(
    SupervisorJob() + Dispatchers.Main + handler
)

scope.launch {
    // This coroutine's context = parent context + new child Job
}

scope.launch(Dispatchers.Main) {
    val data = withContext(Dispatchers.IO) {
        // Switched to IO — only dispatcher changed
        // Job, name, handler still inherited from parent
        api.fetchData()
    }
    updateUI(data)
}
```

**How context inheritance works** — When you launch a child coroutine, the child inherits the parent's context but creates a new `Job` that becomes a child of the parent's `Job`. This is the mechanism behind structured concurrency — the parent-child `Job` hierarchy. The formula is:

```
Child context = Parent context + Explicit arguments + New child Job
```

```kotlin
// Demonstrating context inheritance
val parentScope = CoroutineScope(
    SupervisorJob() + Dispatchers.Main + CoroutineName("parent")
)

parentScope.launch(Dispatchers.IO) {
    // This coroutine's context:
    // Job = new child Job (parent is SupervisorJob from parentScope)
    // Dispatcher = Dispatchers.IO (overridden by launch argument)
    // Name = "parent" (inherited from parentScope)

    println(coroutineContext[CoroutineName])  // CoroutineName(parent)
    println(coroutineContext[CoroutineDispatcher])  // Dispatchers.IO
    println(coroutineContext[Job])  // child Job, NOT the SupervisorJob
}
```

**The `CoroutineContext.Element` system** — Each context element implements `CoroutineContext.Element` and has a companion `Key` object. The key is how you look up elements in the context. This design means you can only have one element per key — adding a new dispatcher replaces the old one:

```kotlin
// Context elements use companion Key objects
val ctx = Dispatchers.IO + CoroutineName("worker")

// Lookup by key
val dispatcher = ctx[CoroutineDispatcher.Key]  // Dispatchers.IO
val name = ctx[CoroutineName.Key]              // CoroutineName("worker")
val job = ctx[Job.Key]                          // null (no Job added)

// Adding a new element with the same key replaces the old one
val updated = ctx + Dispatchers.Default
// Now dispatcher is Default, IO is gone
val newDispatcher = updated[CoroutineDispatcher.Key]  // Dispatchers.Default
```

When `withContext` is called, it creates a new context by merging elements. Only the elements you provide override the parent's — everything else is inherited. Internally, `withContext` creates a new `DispatchedCoroutine` with the merged context, suspends the current coroutine, executes the block, and then resumes the original coroutine with the result on the original dispatcher.

```kotlin
// withContext merges contexts
suspend fun demonstrateMerge() {
    // Assume we're in a coroutine with context:
    // Job=parentJob, Dispatcher=Main, Name="outer"

    withContext(Dispatchers.IO + CoroutineName("inner")) {
        // Context is now:
        // Job = new child Job (parent is parentJob)
        // Dispatcher = IO (overridden)
        // Name = "inner" (overridden)
        // ExceptionHandler = inherited from parent
    }

    // Back to original context:
    // Job=parentJob, Dispatcher=Main, Name="outer"
}
```

**Custom context elements** — You can create your own context elements for passing data through the coroutine hierarchy. This is useful for tracing, logging, or passing auth tokens:

```kotlin
// Custom context element for request tracing
data class RequestId(val id: String) : AbstractCoroutineContextElement(RequestId) {
    companion object Key : CoroutineContext.Key<RequestId>
}

// Usage
suspend fun handleRequest(requestId: String) {
    withContext(RequestId(requestId)) {
        // All child coroutines can access the request ID
        processStep1()
        processStep2()
    }
}

suspend fun processStep1() {
    val requestId = coroutineContext[RequestId]?.id
    log("Processing step 1 for request: $requestId")
}
```

**Common Mistakes**

A common mistake is confusing `CoroutineScope` and `CoroutineContext`. A `CoroutineScope` is simply a wrapper around a `CoroutineContext`. It exists to prevent accidentally passing a context where a scope is expected. The `CoroutineScope` interface has a single property: `coroutineContext`.

Another mistake is creating a `CoroutineScope` without a `Job`. If you do `CoroutineScope(Dispatchers.IO)`, the scope has no job, which means it can't be cancelled and structured concurrency doesn't work properly.

```kotlin
// WRONG — no Job, can't cancel this scope
val badScope = CoroutineScope(Dispatchers.IO)

// CORRECT — Job enables cancellation and structured concurrency
val goodScope = CoroutineScope(Job() + Dispatchers.IO)
// Or better, use SupervisorJob for independent child failure
val bestScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
```

**Key takeaway:** `CoroutineContext` is the configuration bag that travels with every coroutine. It holds the dispatcher, job, name, and exception handler. Child coroutines inherit their parent's context but get their own `Job`. Use `withContext` to override specific elements without losing the rest. You can create custom context elements for cross-cutting concerns like request tracing.

### Lesson 1.6: Suspend Functions — Deep Dive

A `suspend` function can be paused and resumed. But `suspend` is a compiler hint, not a thread annotation. A suspend function can run on any thread. It just means "this function might pause." The `suspend` keyword triggers the most important compiler transformation in Kotlin — the CPS (Continuation Passing Style) transformation that converts sequential code into a state machine.

The compiler transforms every suspend function using Continuation Passing Style. It adds an extra `Continuation` parameter and changes the return type to `Any?` — a union of the actual return type and `COROUTINE_SUSPENDED`. The `Continuation` interface is simple:

```kotlin
public interface Continuation<in T> {
    public val context: CoroutineContext
    public fun resumeWith(result: Result<T>)
}
```

It holds a `CoroutineContext` (which contains the dispatcher, job, exception handler) and a single `resumeWith` function. When the suspended operation finishes, someone calls `resumeWith` with the result, and the coroutine continues from the next state. The `Result<T>` wrapper allows passing either a successful value or an exception — this is how exceptions propagate through suspension points.

Let's trace through exactly what happens when a suspend function is called. Consider this simple function:

```kotlin
suspend fun fetchAndSave(userId: String): Boolean {
    val user = api.getUser(userId)      // suspension point 1
    val saved = database.save(user)     // suspension point 2
    return saved
}
```

When the compiler processes this, it generates a state machine class (let's call it `FetchAndSaveSM`) that extends `ContinuationImpl`. This class has fields for `label` (the current state), `result` (the last suspended operation's result), and any local variables that need to survive across suspension points (`user` in this case).

The first time `fetchAndSave` is called, the continuation parameter is the caller's continuation. The function creates a new `FetchAndSaveSM` instance (or casts the continuation if it's already one — this is the recursive re-entry optimization). It starts at label 0, calls `api.getUser(userId, sm)`, and checks the return value. If the API call returns `COROUTINE_SUSPENDED`, the function itself returns `COROUTINE_SUSPENDED`, and the thread is free. The `FetchAndSaveSM` object sits in memory, waiting. When the network call completes, the network layer calls `sm.resumeWith(Result.success(user))`. This triggers the state machine to re-enter the `fetchAndSave` function at label 1, where it calls `database.save(user, sm)`, and the process repeats.

For converting callback-based APIs to suspend functions, always prefer `suspendCancellableCoroutine`:

```kotlin
suspend fun getCurrentLocation(): Location =
    suspendCancellableCoroutine { cont ->
        locationClient.lastLocation
            .addOnSuccessListener { location ->
                if (cont.isActive) {
                    cont.resume(location)
                }
            }
            .addOnFailureListener { exception ->
                cont.resumeWithException(exception)
            }

        cont.invokeOnCancellation {
            locationClient.removeLocationUpdates()
        }
    }
```

**suspendCoroutine vs suspendCancellableCoroutine** — Always prefer `suspendCancellableCoroutine`. It gives you `isActive` (to check if the coroutine is still alive before resuming) and `invokeOnCancellation` (to clean up resources). Plain `suspendCoroutine` doesn't support cancellation, which means the callback may try to resume a cancelled coroutine — a recipe for leaks and crashes. The difference is that `suspendCancellableCoroutine` creates a `CancellableContinuationImpl` which integrates with the job's cancellation mechanism, while `suspendCoroutine` creates a `SafeContinuation` that ignores cancellation.

```kotlin
// DANGEROUS — no cancellation support
suspend fun fetchUnsafe(): Data = suspendCoroutine { cont ->
    api.fetchData { result ->
        // If the coroutine was cancelled while waiting, this still runs
        // Calling resume on a cancelled continuation throws IllegalStateException
        cont.resume(result)
    }
    // No way to clean up the API callback if coroutine is cancelled
}

// SAFE — proper cancellation support
suspend fun fetchSafe(): Data = suspendCancellableCoroutine { cont ->
    val call = api.fetchData { result ->
        if (cont.isActive) {
            cont.resume(result)  // Only resume if still active
        }
    }
    cont.invokeOnCancellation {
        call.cancel()  // Clean up the network call on cancellation
    }
}
```

**Real-world example: wrapping OkHttp with cancellation** — This pattern is essential for production Android apps:

```kotlin
suspend fun OkHttpClient.executeSuspend(request: Request): Response =
    suspendCancellableCoroutine { cont ->
        val call = newCall(request)

        call.enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                if (cont.isActive) {
                    cont.resume(response)
                }
            }

            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) {
                    cont.resumeWithException(e)
                }
            }
        })

        cont.invokeOnCancellation {
            call.cancel()  // Cancel the HTTP call when coroutine is cancelled
        }
    }
```

The compiler transforms a suspend function with N suspension points into N+1 states (0 through N). State 0 is the initial entry, and each subsequent state handles the result of the previous suspension:

```kotlin
// What the compiler generates (simplified) for:
// suspend fun fetchAndSave(userId: String) {
//     val user = api.getUser(userId)    // suspension point 1
//     database.saveUser(user)            // suspension point 2
// }

fun fetchAndSave(userId: String, cont: Continuation<Unit>): Any? {
    val sm = cont as? FetchAndSaveSM ?: FetchAndSaveSM(cont)

    when (sm.label) {
        0 -> {
            sm.label = 1
            val result = api.getUser(userId, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
        }
        1 -> {
            val user = sm.result as User
            sm.label = 2
            val result = database.saveUser(user, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
        }
        2 -> {
            return Unit
        }
    }
}
```

**How suspend functions compose** — One of the elegant aspects of suspend functions is that they compose naturally. A suspend function can call other suspend functions, and the state machine handles the nesting. The caller's state machine passes itself as the continuation to the callee. When the callee completes (or suspends), the caller's state machine handles the result:

```kotlin
// Suspend functions compose naturally
suspend fun loadUserWithPosts(userId: String): UserWithPosts {
    val user = fetchUser(userId)           // Calls another suspend function
    val posts = fetchPosts(user.id)        // Calls another suspend function
    val enriched = enrichPosts(posts)      // Calls another suspend function
    return UserWithPosts(user, enriched)
}
// The compiler generates a state machine with 4 states (0-3)
// Each suspend call is a potential exit/re-entry point
```

**Common Mistakes**

A common mistake is making a function `suspend` when it doesn't need to be. If your function doesn't call any suspend functions, don't mark it as `suspend` — it adds unnecessary overhead (the continuation parameter) and misleads readers into thinking the function might pause.

```kotlin
// WRONG — no suspend calls, shouldn't be suspend
suspend fun formatName(first: String, last: String): String {
    return "$first $last"  // Pure computation, no suspension needed
}

// CORRECT — not marked as suspend
fun formatName(first: String, last: String): String {
    return "$first $last"
}
```

Another mistake is resuming a continuation more than once. Each continuation can only be resumed once. Calling `resume` twice throws `IllegalStateException`. The `suspendCancellableCoroutine` version protects against this with the `isActive` check.

**Key takeaway:** `suspend` is a compiler hint that triggers CPS transformation. Always use `suspendCancellableCoroutine` over `suspendCoroutine` for proper cancellation support. The compiler generates a state machine with one state per suspension point. Suspend functions compose naturally — calling one suspend function from another just adds states to the caller's state machine. Don't mark functions as `suspend` unless they actually call other suspend functions.

### Quiz: Coroutines Fundamentals

#### What happens if you use `GlobalScope.launch` in a ViewModel?

- ❌ The coroutine is automatically cancelled when the ViewModel is cleared
- ❌ The coroutine runs on `Dispatchers.Main` by default
- ✅ The coroutine keeps running even after the ViewModel is destroyed, potentially leaking resources
- ❌ The app crashes immediately with an `IllegalStateException`

> **Explanation:** `GlobalScope` is not tied to any lifecycle. Coroutines launched in it are never automatically cancelled, which leads to resource leaks and potential crashes when they try to update destroyed UI.

#### Which dispatcher should you use for parsing a large JSON payload?

- ❌ `Dispatchers.Main`
- ❌ `Dispatchers.IO`
- ✅ `Dispatchers.Default`
- ❌ `Dispatchers.Unconfined`

> **Explanation:** JSON parsing is a CPU-intensive computation, not a blocking I/O operation. `Dispatchers.Default` is backed by a thread pool sized to CPU cores, optimized for exactly this kind of work.

#### Why is `Dispatchers.Unconfined` dangerous in production code?

- ❌ It always throws `UnsupportedOperationException`
- ❌ It runs coroutines on the main thread
- ✅ After a suspension point, the coroutine resumes on whatever thread the suspended operation completed on, breaking thread safety
- ❌ It uses too many threads, causing `OutOfMemoryError`

> **Explanation:** `Dispatchers.Unconfined` starts on the caller's thread but after suspension (e.g., `delay`), the coroutine resumes on the thread the suspending function used — often the `DefaultExecutor` daemon thread. This breaks UI code that expects to be on the main thread.

#### What is the key difference between `launch` and `async`?

- ❌ `launch` runs on `Dispatchers.Main`, `async` runs on `Dispatchers.IO`
- ✅ `launch` returns a `Job` (no result), `async` returns a `Deferred<T>` (with result via `await()`)
- ❌ `async` is used for sequential work, `launch` for parallel work
- ❌ `launch` is faster than `async`

> **Explanation:** `launch` is fire-and-forget — use it when you don't need a return value. `async` returns a `Deferred<T>` that you can `await()` to get the result, making it ideal for parallel decomposition.

### Coding Challenge: Parallel Data Fetching

Write a suspend function `fetchDashboardData` that fetches a user's profile, notifications, and feed items **in parallel** from three different API calls. Return a `DashboardData` data class combining all three results. Use structured concurrency so that if any call fails, all others are cancelled.

#### Solution

```kotlin
data class DashboardData(
    val profile: UserProfile,
    val notifications: List<Notification>,
    val feed: List<FeedItem>
)

suspend fun fetchDashboardData(userId: String): DashboardData = coroutineScope {
    val profile = async { api.getUserProfile(userId) }
    val notifications = async { api.getNotifications(userId) }
    val feed = async { api.getFeedItems(userId) }

    DashboardData(
        profile = profile.await(),
        notifications = notifications.await(),
        feed = feed.await()
    )
}
```

Using `coroutineScope` ensures structured concurrency — if any `async` call throws, the scope cancels all sibling coroutines. All three calls run in parallel because `async` starts immediately, and `await()` only suspends until the result is ready.

---
## Module 2: Coroutines Under the Hood

Understanding what the compiler generates changes how you debug, reason about, and optimize coroutines. This module takes you inside the bytecode.

### Lesson 2.1: CPS Transformation

Before coroutines, Android had a painful history with async code — `AsyncTask`, then `RxJava`, then callback hell. The core problem was always the same: you needed to break sequential logic into pieces that could run later, but you had to wire those pieces together manually.

Kotlin coroutines solve this with **Continuation Passing Style (CPS)**. The idea is old — it comes from Scheme and functional programming — but the Kotlin compiler applies it automatically. When you write:

```kotlin
suspend fun fetchUser(userId: String): User {
    val token = authenticate(userId)    // suspension point 1
    val user = loadProfile(token)       // suspension point 2
    return user
}
```

The compiler transforms this into something conceptually like:

```kotlin
fun fetchUser(userId: String, continuation: Continuation<User>): Any? {
    val token = authenticate(userId, continuation)
    if (token == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED

    val user = loadProfile(token as Token, continuation)
    if (user == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED

    return user
}
```

Two things changed. First, an extra parameter was added: a `Continuation<User>` object. This is the callback — it knows how to resume the function when the suspended operation completes. Second, the return type changed from `User` to `Any?`. Kotlin doesn't have union types, so `Any?` is the only way to express "either T or COROUTINE_SUSPENDED."

The bytecode of every suspend function returns `Any?` because it's a union type of `T | COROUTINE_SUSPENDED`. Here, `T` is the return value that's supposed to return when coroutine execution completes, and `COROUTINE_SUSPENDED` returns when the coroutine has suspended and the thread should be freed.

To see the CPS transformation more concretely, let's look at a function with no suspension points versus one with suspension points:

```kotlin
// No suspension points — compiler still adds Continuation parameter
suspend fun greet(name: String): String {
    return "Hello, $name"
}

// Compiler transforms to:
fun greet(name: String, cont: Continuation<String>): Any? {
    return "Hello, $name"
    // No state machine needed — no suspension points
    // The function returns the result directly, never COROUTINE_SUSPENDED
}
```

```kotlin
// With suspension points — full CPS transformation
suspend fun fetchAndProcess(id: String): Result {
    val raw = fetchRaw(id)           // suspension point 1
    val validated = validate(raw)     // suspension point 2
    val processed = process(validated) // suspension point 3
    return processed
}

// Compiler transforms to (simplified):
fun fetchAndProcess(id: String, cont: Continuation<Result>): Any? {
    // Each call passes the continuation
    // Each call might return COROUTINE_SUSPENDED
    // If it does, the function exits immediately
    // When the operation completes, cont.resumeWith() is called
    // which re-enters this function at the next state
}
```

The CPS transformation is the foundation, but it's not the complete picture. The simplified version above passes the same continuation to every call, which means it can't track which suspension point it's at when resumed. That's where the state machine comes in (next lesson). The CPS transformation is the conceptual model — "every suspend function gets a continuation parameter." The state machine is the implementation — "the continuation tracks which suspension point we're at."

**Why `Any?` and not a sealed class?** — You might wonder why the compiler uses `Any?` instead of a proper union type. The reason is JVM compatibility. The JVM doesn't support union types, and creating a sealed class for every suspend function's return would generate too many classes. `Any?` is the simplest way to represent "either the real result or the COROUTINE_SUSPENDED marker." The cost is type safety at the bytecode level, but the compiler handles this correctly and you never see `Any?` in your Kotlin source code.

```kotlin
// COROUTINE_SUSPENDED is a singleton marker object
internal val COROUTINE_SUSPENDED = CoroutineSingletons.COROUTINE_SUSPENDED

// It's used as a sentinel value to indicate suspension
// When a suspend function returns this marker, the caller knows
// the function has suspended and will be resumed later via the continuation
```

**How the continuation parameter is threaded** — In a chain of suspend function calls, each function passes a continuation to the next. But it's not the original continuation from the top-level caller — it's the state machine continuation of the current function. This is how the resume chain works: when the innermost function completes, it resumes the continuation it received, which is the state machine of its caller, which advances to the next state and potentially resumes the next outer continuation, and so on.

```kotlin
// Call chain: fetchUser -> authenticate -> httpPost
// Continuation chain: fetchUserSM <- authenticateSM <- httpPostCallback
//
// When httpPost completes:
// 1. httpPostCallback calls authenticateSM.resumeWith(token)
// 2. authenticateSM advances to next state, returns token
// 3. This calls fetchUserSM.resumeWith(token)
// 4. fetchUserSM advances to next state, calls loadProfile
```

**Common Mistakes**

A common misconception is that CPS means callbacks. While CPS is related to callbacks (the continuation is essentially a callback), the key difference is that the compiler generates the callbacks automatically. You never write a callback in your source code. The compiler ensures that every suspension point correctly saves state and every resume correctly restores it. This eliminates the entire class of bugs related to manual callback management — forgotten callbacks, wrong callback order, callback not called on the right thread.

**Key takeaway:** CPS is the compile-time transformation that makes coroutines work. The compiler adds a `Continuation` parameter to every suspend function and changes the return type to `Any?` to represent either a result or a suspension marker. The continuation is threaded through the call chain, forming a chain that unwinds on completion.

### Lesson 2.2: The State Machine

The CPS transformation above was simplified. In reality, the compiler doesn't generate separate function calls with continuation threading. It generates a **state machine** — a single class with a `label` field that tracks where the coroutine paused.

For our `fetchUser` function, the compiler generates something like this:

```kotlin
fun fetchUser(userId: String, completion: Continuation<User>): Any? {
    val sm = completion as? FetchUserStateMachine
        ?: FetchUserStateMachine(completion)

    when (sm.label) {
        0 -> {
            sm.label = 1
            val result = authenticate(userId, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
            sm.result = result
        }
        1 -> {
            sm.result.throwOnFailure()
            val token = sm.result as Token
            sm.label = 2
            val result = loadProfile(token, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
            sm.result = result
        }
        2 -> {
            sm.result.throwOnFailure()
            return sm.result as User
        }
        else -> throw IllegalStateException("Invalid label")
    }
}
```

The state machine class stores every local variable that needs to survive across suspension points. The `label` field is just an `Int` that gets incremented at each suspension point. When the coroutine resumes, `resumeWith` is called on the continuation, which re-enters the same function but now jumps to the correct label.

This is the key insight: **there's no thread parking, no fiber, no continuation object floating in memory waiting for a signal.** There's a class with fields, and a when-expression. Each suspend point is a potential exit, and each resume is a re-entry at the next label. For N suspension points, the compiler generates N+1 states (0 through N). State 0 is the initial entry, and each subsequent state handles the result of the previous suspension.

Let's look at the actual state machine class that the compiler generates:

```kotlin
// The compiler generates an inner class like this:
class FetchUserStateMachine(
    private val completion: Continuation<User>
) : ContinuationImpl(completion) {

    var label: Int = 0        // Current state
    var result: Any? = null   // Result from last suspension

    // Local variables that cross suspension boundaries
    var userId: String? = null
    var token: Token? = null

    override fun invokeSuspend(result: Result<Any?>): Any? {
        this.result = result
        return fetchUser(userId!!, this)  // Re-enter the function
    }
}
```

The `invokeSuspend` method is the entry point when the coroutine is resumed. It stores the result from the completed operation and re-enters the original function with `this` as the continuation. The function then checks `sm.label` and jumps to the correct state.

**Why a state machine instead of nested callbacks?** — The state machine approach has several advantages over generating nested callbacks. First, there's only one object allocated per suspend function call (the state machine), regardless of how many suspension points there are. With nested callbacks, you'd allocate one closure per suspension point. Second, the state machine is a flat switch statement, which the JVM can optimize with `tableswitch` bytecode — O(1) dispatch. Nested callbacks create a deep call stack. Third, the state machine naturally supports saving and restoring local variables as fields.

```kotlin
// Nested callbacks would look like this (not what Kotlin generates):
fun fetchUser_callbacks(userId: String, callback: (User) -> Unit) {
    authenticate(userId) { token ->           // Callback 1
        loadProfile(token) { user ->          // Callback 2
            callback(user)                     // Callback 3
        }
    }
    // Problems: 3 closures allocated, deep nesting, hard to cancel
}

// State machine (what Kotlin actually generates):
// 1 object allocated (the state machine), flat switch, easy to cancel
```

**Examining the bytecode** — You can see the actual state machine by compiling a suspend function and decompiling the bytecode:

```kotlin
// Kotlin source:
suspend fun twoSteps(): Int {
    val a = step1()  // suspension point 1
    val b = step2(a) // suspension point 2
    return a + b
}

// Decompiled bytecode (simplified):
// - Function signature: twoSteps(Continuation<Int>): Object
// - State machine class with label, result, and saved variables
// - The `when` expression compiles to a tableswitch instruction
// - Label 0: call step1, save result if suspended
// - Label 1: retrieve step1 result, call step2
// - Label 2: compute a + b, return
```

**Variables that cross suspension boundaries** — The compiler analyzes which local variables are used after a suspension point. Only those variables are promoted to state machine fields. Variables used only within a single state stay on the stack (zero allocation cost):

```kotlin
suspend fun example() {
    val temp = computeLocally()    // temp NOT saved — used only in state 0
    val a = suspendCall1(temp)     // a IS saved — used after suspension
    val b = computeLocally2()      // b NOT saved — used only in state 1
    val c = suspendCall2(a + b)    // c IS saved — used after suspension
    return a + c
}
// State machine fields: a, c (2 fields)
// Stack variables: temp, b (not saved — zero allocation cost)
```

**Common Mistakes**

A common misconception is that each suspension point creates a new object or thread. It doesn't. The state machine is a single object, and suspending/resuming just changes the `label` field and re-enters the function. No new allocations happen on resume — only the label changes and the result is read.

Another misconception is that the state machine is slow due to the `when` expression. In reality, the `when` on an `Int` label compiles to a `tableswitch` JVM bytecode instruction, which is O(1) — a direct jump to the target label. It's as fast as a computed goto.

**Key takeaway:** The compiler generates a state machine class for each suspend function. Each suspension point becomes a label in a `when` expression. Local variables that cross suspension boundaries are saved as fields in the state machine object. The state machine is a single object per function call with O(1) state dispatch via `tableswitch`.

### Lesson 2.3: Continuation Internals

The `Continuation` interface is the core abstraction that makes coroutines work. Every suspend function receives one, and every resume goes through one. But the actual implementation has layers:

```kotlin
public interface Continuation<in T> {
    public val context: CoroutineContext
    public fun resumeWith(result: Result<T>)
}

// Extension functions for convenience
public fun <T> Continuation<T>.resume(value: T) =
    resumeWith(Result.success(value))

public fun <T> Continuation<T>.resumeWithException(exception: Throwable) =
    resumeWith(Result.failure(exception))
```

The implementation you'll encounter most is `BaseContinuationImpl`, which is the base class for all generated state machine continuations. When `resumeWith` is called, it re-enters the `invokeSuspend` method of the state machine, which is where the `when (label)` expression lives.

Let's trace the complete continuation hierarchy:

```kotlin
// 1. Continuation<T> — the interface
//    Has: context, resumeWith(Result<T>)

// 2. BaseContinuationImpl — abstract base for generated state machines
//    Implements: resumeWith by calling invokeSuspend in a loop
//    Subclassed by: every generated state machine class

// 3. ContinuationImpl — adds interception support
//    Wraps the continuation in a DispatchedContinuation
//    This is where the dispatcher intercepts resumes

// 4. DispatchedContinuation — dispatches resume to the correct thread
//    Wraps the actual continuation
//    Before calling resumeWith, checks if dispatch is needed
//    If yes, posts to dispatcher's thread pool
//    If no, calls resumeWith directly

// 5. SuspendLambda — base class for lambda-based state machines
//    Generated for suspend lambdas (like the block in launch {})
```

The continuation chain works by nesting: each coroutine's state machine continuation wraps the outer continuation. When the innermost suspend function completes, it calls `resumeWith` on the state machine, which advances the label and may call `resumeWith` on the next outer continuation, and so on up the chain.

```kotlin
// Visualizing the continuation chain:
// launch { fetchUser("123") }
//
// Chain: DispatchedContinuation
//          -> LaunchCoroutine (completion)
//            -> FetchUserSM (state machine)
//              -> AuthenticateSM (state machine)
//                -> HttpCallContinuation (actual I/O callback)
//
// When HTTP call completes:
// HttpCallContinuation.resumeWith(response)
//   -> AuthenticateSM.invokeSuspend(result) [advances label]
//   -> FetchUserSM.invokeSuspend(result) [advances label]
//   -> LaunchCoroutine completes
```

Each continuation also holds a reference to the `CoroutineContext`, which is how the dispatcher swap works. Before calling `resumeWith`, the coroutine machinery reads the `ContinuationInterceptor` (which is the dispatcher) from the context. If the interceptor determines that a dispatch is needed (current thread isn't one of its threads), it wraps the resume in a `Runnable` and posts it to its thread pool. If no dispatch is needed, it calls `resumeWith` directly.

```kotlin
// What happens when a suspend function completes:
// 1. The suspended operation calls continuation.resumeWith(result)
// 2. The ContinuationInterceptor checks if dispatch is needed
// 3. If yes: wraps resumeWith in Runnable, posts to dispatcher's thread pool
// 4. If no: calls resumeWith directly on current thread
// 5. resumeWith calls invokeSuspend() on the state machine
// 6. State machine enters the next label in the when-expression
```

**The `BaseContinuationImpl.resumeWith` loop** — An important optimization in the implementation is that `BaseContinuationImpl.resumeWith` runs in a loop instead of recursively. When one state machine completes and needs to resume the outer state machine, instead of making a recursive call (which could overflow the stack for deep coroutine chains), it loops back and processes the next continuation:

```kotlin
// Simplified BaseContinuationImpl.resumeWith
internal abstract class BaseContinuationImpl : Continuation<Any?> {
    override fun resumeWith(result: Result<Any?>) {
        var current = this
        var param = result
        while (true) {
            val outcome = current.invokeSuspend(param)
            if (outcome == COROUTINE_SUSPENDED) return
            val completion = current.completion
            if (completion is BaseContinuationImpl) {
                current = completion
                param = Result.success(outcome)
                // Loop instead of recursive call — prevents stack overflow
            } else {
                completion.resumeWith(Result.success(outcome))
                return
            }
        }
    }
}
```

This loop-based approach means that even a chain of 1000 nested suspend function calls won't overflow the stack. Each one is processed as an iteration of the loop, not a recursive call.

**DispatchedContinuation and thread switching** — The `DispatchedContinuation` class is responsible for the actual thread switching. It wraps a continuation and intercepts `resumeWith` to check if dispatching is needed:

```kotlin
// Simplified DispatchedContinuation
class DispatchedContinuation(
    val dispatcher: CoroutineDispatcher,
    val continuation: Continuation<Any?>
) : Continuation<Any?> {

    override fun resumeWith(result: Result<Any?>) {
        if (dispatcher.isDispatchNeeded(context)) {
            // Post to the dispatcher's thread pool
            dispatcher.dispatch(context, Runnable {
                continuation.resumeWith(result)
            })
        } else {
            // Already on the right thread, execute directly
            continuation.resumeWith(result)
        }
    }
}
```

**Common Mistakes**

A common misconception is that continuations are expensive. A continuation is just a small object with a few fields (label, result, saved variables). The `DispatchedContinuation` wrapper adds one more object. The total overhead per coroutine is typically 200-400 bytes — far less than a thread's 1MB stack.

Another mistake is thinking that `resumeWith` always involves a thread switch. If the coroutine is already on the dispatcher's thread, `isDispatchNeeded` returns `false` and the resume happens immediately on the current thread, with zero dispatching overhead.

**Key takeaway:** Continuations form a chain — each state machine wraps the outer continuation. The dispatcher reads the context to decide which thread to resume on. Understanding this chain explains why coroutine stack traces show `invokeSuspend` and `BaseContinuationImpl.resumeWith` instead of your actual function hierarchy. The `resumeWith` implementation uses a loop to prevent stack overflow in deep coroutine chains.

### Lesson 2.4: Stack Traces and Debugging

Understanding the state machine explains why coroutine stack traces look weird. When a coroutine suspends, the actual call stack unwinds completely. The state machine saves local variables into its fields, returns `COROUTINE_SUSPENDED` up the chain, and the thread is free.

When it resumes, a new call stack is created starting from the dispatcher. The state machine re-enters at the correct label, but the original call stack is gone. This is why you see frames like `invokeSuspend` and `BaseContinuationImpl.resumeWith`:

```kotlin
// You expect to see:
// at fetchUser()
// at loadDashboard()
// at DashboardViewModel.load()

// You actually see:
// at fetchUser.invokeSuspend(FetchUser.kt:15)
// at BaseContinuationImpl.resumeWith(ContinuationImpl.kt:33)
// at DispatchedTask.run(DispatchedTask.kt:106)
// at CoroutineScheduler.runSafely(CoroutineScheduler.kt:571)
```

This is fundamentally different from thread-based code. With threads, the stack trace shows the full call chain because the thread's stack frame is preserved while sleeping. With coroutines, the stack unwinds on suspension — there's nothing left on the thread's stack. The state is in the state machine objects on the heap, not in stack frames.

To understand this concretely, consider what happens step by step when a coroutine suspends:

```kotlin
// Step 1: Your code is executing
suspend fun fetchUser(id: String): User {
    val token = authenticate(id)  // About to suspend here
    // ...
}

// Step 2: authenticate() returns COROUTINE_SUSPENDED
// fetchUser() returns COROUTINE_SUSPENDED to its caller
// The caller returns COROUTINE_SUSPENDED to its caller
// This bubbles all the way up to the dispatcher

// Step 3: The thread's call stack is now:
// (empty — the thread is free to do other work)

// Step 4: The state is preserved in:
// FetchUserSM.label = 1 (will resume at state 1)
// FetchUserSM.userId = "123" (saved local variable)
// The SM object is referenced by the pending I/O callback

// Step 5: When I/O completes, the callback calls:
// fetchUserSM.resumeWith(Result.success(token))
// A new stack frame is created starting from the dispatcher

// Step 6: New stack trace looks like:
// at fetchUser.invokeSuspend() — re-entered at label 1
// at BaseContinuationImpl.resumeWith()
// at DispatchedContinuation.resumeWith()
// at SomeIOCallback.onComplete()
```

Kotlin addressed this with the `kotlinx-coroutines-debug` module, which stitches together the logical call stack by tracking continuation chains:

```kotlin
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-debug:1.7.3")
}

// In your Application.onCreate()
DebugProbes.install()

// Then stack traces include the creation stack:
// Coroutine "DashboardLoader#42", state: SUSPENDED
//   at fetchUser(FetchUser.kt:15)
//   at loadDashboard(Dashboard.kt:8)
//   at DashboardViewModel.load(DashboardViewModel.kt:22)
```

**How DebugProbes works** — `DebugProbes.install()` replaces the default `CoroutineDispatcher` wrappers with instrumented versions that track the creation stack trace of every coroutine. When a coroutine is created, the current stack trace is captured and stored. When you dump coroutine state (or an exception occurs), the debug module attaches this creation stack trace to provide context. This has overhead (capturing stack traces is expensive), so it's recommended only for debugging, not production.

```kotlin
// Dumping all coroutine states for debugging
DebugProbes.dumpCoroutines()
// Output:
// Coroutine "StandaloneCoroutine#1":DeferredCoroutine{Active}@1e4a7dd4
//     at fetchUser(UserRepository.kt:15)
//     at loadDashboard(DashboardVM.kt:22)
//     (Coroutine creation stacktrace)
//     at DashboardViewModel.load(DashboardViewModel.kt:30)
//     at DashboardFragment.onViewCreated(DashboardFragment.kt:45)

// You can also get info about a specific job
val info = DebugProbes.jobToString(viewModelScope.coroutineContext[Job]!!)
```

**CoroutineName for debugging** — Adding a `CoroutineName` to your context makes debugging much easier. The name appears in thread names and debug output:

```kotlin
viewModelScope.launch(CoroutineName("LoadDashboard")) {
    // Thread name becomes: DefaultDispatcher-worker-1 @LoadDashboard#42
    fetchUser(userId)
}

// You can also set it globally for a scope
val debugScope = CoroutineScope(
    SupervisorJob() + Dispatchers.Default + CoroutineName("BackgroundSync")
)
```

**Android Studio debugger integration** — Android Studio has built-in coroutine debugging support. The Coroutines panel shows all running coroutines, their states, and their creation stack traces. To enable it, make sure you have `-ea` (enable assertions) in your JVM arguments and the `kotlinx-coroutines-debug` dependency.

```kotlin
// Practical debugging pattern: add context to exceptions
suspend fun fetchUser(id: String): User {
    return try {
        api.getUser(id)
    } catch (e: Exception) {
        val coroutineName = coroutineContext[CoroutineName]?.name ?: "unknown"
        val job = coroutineContext[Job]
        throw DebugException(
            "Failed to fetch user $id in coroutine '$coroutineName' " +
            "(job=${job?.key})", e
        )
    }
}
```

**Common Mistakes**

A common mistake is enabling `DebugProbes` in production builds. The overhead of capturing stack traces on every coroutine creation is significant — it can slow down your app by 10-30% depending on how many coroutines you create. Use it only in debug builds.

Another mistake is trying to use traditional exception breakpoints for coroutine code. Because exceptions cross suspension boundaries through `Result.failure`, a traditional "break on exception" might trigger inside the coroutine machinery rather than at your code. Use conditional breakpoints with `CoroutineName` filters instead.

**Key takeaway:** Coroutine stack traces unwind completely on suspension. Use `kotlinx-coroutines-debug` to get logical stack traces that show the actual call hierarchy. Understanding the state machine explains why debugging coroutines requires different tools than debugging threads. Add `CoroutineName` to your contexts for better debugging output. Only enable `DebugProbes` in debug builds.

### Lesson 2.5: Performance Implications

Knowing the internals lets you reason about performance. Each suspend function generates a state machine class — a small object allocated on the heap. Each coroutine launch creates a `Job` object and a continuation chain. These are lightweight (tens to hundreds of bytes), but they're not free.

```kotlin
// Each launch creates: Job + DispatchedContinuation + state machine
// Overhead: ~200-400 bytes per coroutine

// DON'T: Launch a coroutine per item in a large list
items.forEach { item ->
    scope.launch { processItem(item) }  // 100K coroutines = ~40MB overhead
}

// DO: Use chunking or flow-based processing
items.chunked(100).forEach { chunk ->
    scope.launch {
        chunk.forEach { processItem(it) }
    }
}

// Or use a Flow with limited concurrency
items.asFlow()
    .flatMapMerge(concurrency = 10) { item ->
        flow { emit(processItem(item)) }
    }
    .collect { result -> handleResult(result) }
```

The state machine itself is efficient — the `when` expression compiles to a `tableswitch` bytecode instruction, which is O(1) dispatch. Local variables that don't cross suspension points are kept on the stack (free), while those that do are promoted to state machine fields (heap allocated). The compiler is smart about this — only variables that are actually used after a suspension point are saved.

**Measuring the real cost** — Let's quantify the actual costs involved:

```kotlin
// Cost breakdown per coroutine:
// 1. StandaloneCoroutine object: ~64 bytes
// 2. Job + JobSupport fields: ~48 bytes
// 3. DispatchedContinuation: ~32 bytes
// 4. State machine object: ~32 bytes + 8 bytes per saved variable
// 5. Context elements: shared with parent (no extra cost)
// Total: ~176 bytes minimum, ~200-400 bytes typical

// Compare with a thread:
// Thread object + native stack: ~512KB - 1MB
// Context switch cost: ~1-10 microseconds
// Creation cost: ~50-100 microseconds
```

```kotlin
// Benchmarking coroutine creation vs thread creation
fun benchmarkCreation() {
    // Coroutine creation: ~0.1 microseconds
    val coroutineTime = measureTimeMillis {
        runBlocking {
            repeat(1_000_000) {
                launch { }
            }
        }
    }
    println("1M coroutines: ${coroutineTime}ms")
    // Typical output: ~500ms for 1M coroutines

    // Thread creation: ~50 microseconds each
    val threadTime = measureTimeMillis {
        val threads = List(10_000) {
            thread { }
        }
        threads.forEach { it.join() }
    }
    println("10K threads: ${threadTime}ms")
    // Typical output: ~1000ms for just 10K threads
}
```

Thread switching is the real cost. Every `withContext(Dispatchers.IO)` that actually needs to dispatch involves posting a `Runnable` to a thread pool. If the coroutine is already on an IO thread, `withContext(Dispatchers.IO)` detects this and skips the dispatch. But if it needs to switch, you're paying the cost of a context switch — roughly 10-50 microseconds.

**Avoiding unnecessary dispatching** — Understanding when dispatching happens helps you optimize:

```kotlin
// INEFFICIENT — dispatches to IO, then dispatches back to Default
suspend fun processData(): Result = withContext(Dispatchers.Default) {
    val raw = withContext(Dispatchers.IO) { fetchFromNetwork() }
    // Dispatch back to Default happens here
    val processed = parseData(raw)
    // Another dispatch to IO
    withContext(Dispatchers.IO) { saveToDatabase(processed) }
    // Dispatch back to Default
    return@withContext processed
}
// Total dispatches: 4 thread switches

// EFFICIENT — minimize dispatches
suspend fun processDataOptimized(): Result {
    val raw = withContext(Dispatchers.IO) {
        fetchFromNetwork()
    }
    val processed = withContext(Dispatchers.Default) {
        parseData(raw)
    }
    withContext(Dispatchers.IO) {
        saveToDatabase(processed)
    }
    return processed
}
// Total dispatches: 3 thread switches (or fewer if threads are reused)
```

**Memory considerations for long-lived coroutines** — A coroutine that suspends for a long time (e.g., waiting for a channel message) holds its state machine in memory. If the state machine references large objects, those objects can't be garbage collected:

```kotlin
// PROBLEM — large object kept alive during suspension
suspend fun processLargeData() {
    val largeData = loadLargeDataset()  // 100MB dataset
    val summary = computeSummary(largeData)  // Uses largeData

    saveSummary(summary)  // SUSPENDS HERE
    // largeData is saved in the state machine because it's a local variable
    // that was used before the suspension point
    // Even though it's not needed after saveSummary, it's kept alive

    logCompletion()
}

// FIX — null out references before suspension
suspend fun processLargeDataFixed() {
    val summary = run {
        val largeData = loadLargeDataset()
        computeSummary(largeData)
        // largeData goes out of scope here, can be GC'd
    }

    saveSummary(summary)
    logCompletion()
}
```

**GC pressure from coroutine-heavy code** — Launching many short-lived coroutines creates garbage (state machine objects that are immediately discarded). The JVM's garbage collector handles this well for young-generation objects, but in extremely hot paths (millions of coroutines per second), the GC pressure can be measurable. In such cases, consider batching work instead of creating a coroutine per unit of work.

```kotlin
// HIGH GC PRESSURE — millions of tiny coroutines
suspend fun processEvents(events: List<Event>) = coroutineScope {
    events.map { event ->
        async { processEvent(event) }  // Creates SM + Job + Deferred per event
    }.awaitAll()
}

// LOWER GC PRESSURE — batch processing
suspend fun processEventsBatched(events: List<Event>) = coroutineScope {
    events.chunked(1000).map { batch ->
        async {
            batch.forEach { processEvent(it) }  // One coroutine per batch
        }
    }.awaitAll()
}
```

**Common Mistakes**

The most common performance mistake is premature optimization — worrying about coroutine overhead when the real bottleneck is network I/O or database queries. A coroutine's 200 bytes is nothing compared to a 10KB HTTP response. Focus on reducing unnecessary network calls and database queries before optimizing coroutine count.

Another mistake is using `Dispatchers.IO` everywhere "just to be safe." If your code doesn't do blocking I/O, running it on IO wastes threads. CPU-bound work should use `Dispatchers.Default`, and non-blocking code (like updating a StateFlow) should stay on whatever dispatcher it's already on.

**Key takeaway:** Coroutines are cheap (~200-400 bytes) but not free. Avoid launching thousands of coroutines for trivial work. Thread dispatching is the real cost — minimize unnecessary dispatcher switches. The compiler optimizes the state machine with `tableswitch` and only saves variables that cross suspension boundaries. For hot paths, batch work to reduce GC pressure.
### Quiz: Coroutines Under the Hood

#### What does the compiler add to every suspend function's signature?

- ❌ A `Thread` parameter specifying which thread to run on
- ❌ A `Callback<T>` parameter for async results
- ✅ A `Continuation<T>` parameter that knows how to resume the function
- ❌ A `CoroutineScope` parameter for structured concurrency

> **Explanation:** The compiler adds a `Continuation<T>` parameter to every suspend function. This continuation holds the `CoroutineContext` and a `resumeWith` method. The return type also changes to `Any?` to represent either the result or `COROUTINE_SUSPENDED`.

#### Why do coroutine stack traces look different from regular stack traces?

- ❌ Coroutines run in a special JVM mode that hides stack frames
- ✅ When a coroutine suspends, the call stack unwinds completely, and resuming creates a new stack starting from the dispatcher
- ❌ The Kotlin compiler strips stack frames for performance
- ❌ Coroutines don't use the JVM call stack at all

> **Explanation:** On suspension, the state machine saves local variables into its fields and returns `COROUTINE_SUSPENDED` up the call chain, unwinding the stack. On resume, `resumeWith` creates a new stack from the dispatcher, so you see `invokeSuspend` and `BaseContinuationImpl.resumeWith` instead of your actual function calls.

#### How many states does the compiler generate for a suspend function with 3 suspension points?

- ❌ 3 states
- ✅ 4 states (0 through 3)
- ❌ 6 states (2 per suspension point)
- ❌ It depends on the complexity of the function

> **Explanation:** For N suspension points, the compiler generates N+1 states. State 0 is the initial entry point, and each subsequent state (1 through N) handles the result of the previous suspension.

### Coding Challenge: Trace the State Machine

Given this suspend function, write out the simplified state machine the compiler would generate. Identify each state, what local variables need to be saved, and where `COROUTINE_SUSPENDED` is returned.

```kotlin
suspend fun processOrder(orderId: String): Receipt {
    val order = fetchOrder(orderId)
    val payment = chargeCard(order.total)
    val receipt = generateReceipt(order, payment)
    return receipt
}
```

#### Solution

```kotlin
fun processOrder(orderId: String, cont: Continuation<Receipt>): Any? {
    val sm = cont as? ProcessOrderSM ?: ProcessOrderSM(cont)

    when (sm.label) {
        0 -> {
            sm.label = 1
            val result = fetchOrder(orderId, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
            sm.order = result as Order
        }
        1 -> {
            sm.order = sm.result as Order
            sm.label = 2
            val result = chargeCard(sm.order.total, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
            sm.payment = result as Payment
        }
        2 -> {
            sm.payment = sm.result as Payment
            sm.label = 3
            val result = generateReceipt(sm.order, sm.payment, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
            return result as Receipt
        }
        3 -> {
            return sm.result as Receipt
        }
    }
    return COROUTINE_SUSPENDED
}
```

The state machine saves `order` and `payment` as fields because they're needed across suspension points. `orderId` doesn't need saving because it's only used in state 0. Three suspension points produce 4 states (0-3).

---

## Module 3: Exception Handling and Cancellation

Getting exception handling right in coroutines is harder than it looks. The rules are different from regular try-catch, and getting them wrong causes bugs where a failure in one feature silently terminates an unrelated feature.

### Lesson 3.1: Exception Propagation Rules

In structured concurrency, every coroutine has a parent. When a child coroutine throws an unhandled exception, it doesn't just fail — it cancels its parent, which cancels all other children. This is by design. The idea is that if one part of a concurrent operation fails, the whole operation should fail rather than producing partial, inconsistent results.

The exception propagation rules differ based on the coroutine builder used. Understanding these differences is the key to writing correct error handling code:

```kotlin
// launch — exceptions propagate UP to parent immediately
scope.launch {
    throw RuntimeException("Boom")  // Cancels the parent scope
}

// async — exceptions are stored AND propagate to parent
val deferred = scope.async {
    throw RuntimeException("Boom")  // Stored in Deferred AND propagates up
}
deferred.await()  // Re-throws the exception here too
```

**How exception propagation actually works internally** — When a coroutine throws an unhandled exception, the internal `handleJobException` method is called. For `launch`, this method immediately notifies the parent job via `childCancelled(exception)`. The parent then calls `cancelChildren(exception)` on all its other children and propagates the exception further up. For `async`, the exception is first stored in the `Deferred` result, but `handleJobException` still notifies the parent. The key insight is that `async` does BOTH — it stores the exception for `await()` AND propagates to the parent.

For sequential code in a single coroutine, `try/catch` works exactly as you'd expect:

```kotlin
viewModelScope.launch {
    try {
        val user = userRepository.getCurrentUser()
        val orders = orderRepository.getRecentOrders(user.id)
        _uiState.value = DashboardState.Success(user, orders)
    } catch (e: Exception) {
        _uiState.value = DashboardState.Error(e.message ?: "Unknown error")
    }
}
```

The complexity starts when you introduce concurrency. With `async`, the exception propagates to the parent scope **immediately when thrown**, not when you call `await()`:

```kotlin
viewModelScope.launch {
    // DANGER: If productSearch throws, it cancels the parent
    // before storeResults.await() ever runs
    val productResults = async { productSearch.search(query) }
    val storeResults = async { storeSearch.search(query) }

    try {
        val products = productResults.await()
        val stores = storeResults.await()
        _uiState.value = SearchState.Success(products, stores)
    } catch (e: Exception) {
        // This catch might not even execute
        _uiState.value = SearchState.Error(e.message)
    }
}
```

This is one of the most common coroutine bugs. The `async` block throws, the exception propagates to the `launch` coroutine, the `launch` coroutine is cancelled, and the `catch` block may or may not run depending on timing. Let's trace through what happens step by step:

```kotlin
// Step 1: Both async coroutines start
// Step 2: productSearch.search(query) throws IOException
// Step 3: productResults async catches the exception internally
//         - Stores it in the Deferred result
//         - Calls parent.childCancelled(IOException)
// Step 4: The parent (launch coroutine) receives childCancelled
//         - Cancels itself
//         - Cancels storeResults (CancellationException)
// Step 5: The launch coroutine's body is being cancelled
//         - The try/catch block might or might not execute
//         - Even if it does, the scope is already cancelled
```

**The correct way to handle async exceptions** — Use `supervisorScope` or `coroutineScope` with try-catch around individual `await()` calls:

```kotlin
// Approach 1: supervisorScope — each async fails independently
viewModelScope.launch {
    supervisorScope {
        val productResults = async {
            try { productSearch.search(query) }
            catch (e: Exception) { emptyList() }
        }
        val storeResults = async {
            try { storeSearch.search(query) }
            catch (e: Exception) { emptyList() }
        }
        _uiState.value = SearchState.Success(
            productResults.await(),
            storeResults.await()
        )
    }
}

// Approach 2: coroutineScope with wrapped async
viewModelScope.launch {
    try {
        coroutineScope {
            val products = async { productSearch.search(query) }
            val stores = async { storeSearch.search(query) }
            _uiState.value = SearchState.Success(
                products.await(), stores.await()
            )
        }
    } catch (e: Exception) {
        // coroutineScope rethrows the first child exception
        // after cancelling all other children
        _uiState.value = SearchState.Error(e.message)
    }
}
```

**Exception propagation with nested coroutines** — Exceptions always propagate upward until they hit a supervisor boundary or the root scope:

```kotlin
scope.launch {                           // Coroutine A (root)
    launch {                              // Coroutine B (child of A)
        launch {                          // Coroutine C (child of B)
            throw IOException("Failed")  // Exception starts here
        }
        // C's exception propagates to B
    }
    // B's exception propagates to A
    // A is the root, so CoroutineExceptionHandler is checked
}
// Without SupervisorJob, the entire hierarchy is cancelled
```

**Production pattern: typed exception handling** — In production code, handle specific exception types differently:

```kotlin
viewModelScope.launch {
    try {
        val data = repository.fetchData()
        _state.value = UiState.Success(data)
    } catch (e: HttpException) {
        when (e.code()) {
            401 -> _events.emit(UiEvent.NavigateToLogin)
            403 -> _state.value = UiState.Error("Access denied")
            404 -> _state.value = UiState.Error("Not found")
            in 500..599 -> {
                _state.value = UiState.Error("Server error, retrying...")
                delay(2000)
                retryFetch()
            }
            else -> _state.value = UiState.Error("HTTP ${e.code()}")
        }
    } catch (e: IOException) {
        _state.value = UiState.Error("Network error — check connection")
    } catch (e: CancellationException) {
        throw e  // NEVER swallow cancellation
    } catch (e: Exception) {
        _state.value = UiState.Error("Unexpected: ${e.message}")
        crashReporter.report(e)
    }
}
```

**Common Mistakes**

The most dangerous mistake is catching `Exception` without rethrowing `CancellationException`. Since `CancellationException` is a subclass of `Exception` (via `IllegalStateException`), a broad `catch (e: Exception)` will catch it, breaking structured concurrency:

```kotlin
// DANGEROUS — catches CancellationException
try {
    suspendingWork()
} catch (e: Exception) {
    log(e)  // Silently swallows cancellation!
}

// SAFE — always rethrow CancellationException
try {
    suspendingWork()
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    log(e)
}
```

**Key takeaway:** `launch` propagates exceptions immediately to the parent. `async` stores exceptions for `await()` BUT also propagates to the parent immediately. This dual behavior is the source of most coroutine exception bugs. Always handle `CancellationException` separately from other exceptions.

### Lesson 3.2: CoroutineExceptionHandler

`CoroutineExceptionHandler` is a last-resort safety net, not a replacement for `try/catch`. It only catches exceptions from root-level `launch` coroutines — direct children of the scope. Understanding where to install it and what it can't do is essential for building robust error handling.

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    log("Caught: ${exception.message}")
    crashReporter.report(exception)
}

val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main + handler)

// This works — handler catches it
scope.launch {
    riskyOperation()
}

// Nested coroutine — handler still catches it at the scope level
// but the outer launch is already cancelled
scope.launch {
    launch {
        throw Exception("Propagates to parent, then handler")
    }
}

// Does NOT work with async — exceptions go to await()
scope.async {
    throw Exception("Handler never sees this")
}
```

The handler works because when an uncaught exception reaches the root coroutine (direct child of the scope), the coroutine machinery checks the context for a `CoroutineExceptionHandler` before crashing. If one exists, it's called. If not, the exception goes to the thread's uncaught exception handler (which on Android means a crash).

**Why CEH doesn't work with async** — `async` is designed to deliver its result (or exception) through `await()`. The exception is part of the `Deferred`'s result, not an "unhandled" exception in the CEH sense. If you never call `await()`, the exception is silently lost (plus it still propagates to the parent job). This is why you should always `await()` your deferreds or use `launch` with try-catch instead.

```kotlin
// CEH placement matters — it must be on the scope or root coroutine
val handler = CoroutineExceptionHandler { _, e -> log("Caught: $e") }

// WORKS — handler on the scope
val scope = CoroutineScope(SupervisorJob() + handler)
scope.launch { throw Exception("Caught by handler") }

// WORKS — handler on the root launch
scope.launch(handler) { throw Exception("Caught by handler") }

// DOES NOT WORK — handler on a nested launch
scope.launch {
    launch(handler) {
        throw Exception("Handler is IGNORED — exception propagates to parent")
    }
}
```

**Why handler on nested launch doesn't work** — The exception from the nested `launch` propagates to the parent `launch` first. The parent `launch` is the one that handles (or fails to handle) the exception. The handler on the nested launch is ignored because the exception is "handled" by propagating it upward.

**Production exception handler pattern** — In production, your exception handler should log, report to crash analytics, and potentially show a user-facing error:

```kotlin
@Singleton
class AppExceptionHandler @Inject constructor(
    private val crashReporter: CrashReporter,
    private val logger: Logger
) {
    val handler = CoroutineExceptionHandler { context, exception ->
        val coroutineName = context[CoroutineName]?.name ?: "unnamed"
        logger.error("Unhandled exception in coroutine '$coroutineName'", exception)

        when (exception) {
            is CancellationException -> {
                // This shouldn't reach here, but just in case
                logger.debug("Cancellation in '$coroutineName'")
            }
            is IOException -> {
                logger.warn("Network error in '$coroutineName'")
                // Don't report network errors to crash analytics
            }
            else -> {
                crashReporter.report(exception)
            }
        }
    }
}

// Usage in Application scope
val appScope = CoroutineScope(
    SupervisorJob() + Dispatchers.Default + appExceptionHandler.handler
)
```

**CEH and multiple exceptions** — If multiple children throw exceptions, the first exception is the primary one. Subsequent exceptions are added as suppressed exceptions:

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    println("Primary: ${exception.message}")
    exception.suppressed.forEach {
        println("Suppressed: ${it.message}")
    }
}

val scope = CoroutineScope(Job() + handler)
scope.launch {
    launch { throw IOException("Error 1") }
    launch {
        delay(10)
        throw IllegalStateException("Error 2")
    }
}
// Output:
// Primary: Error 1
// Suppressed: Error 2
```

**Common Mistakes**

A common mistake is relying on CEH as the primary error handling mechanism. CEH is for unexpected, unrecoverable errors — the last line of defense. All expected errors (network failures, validation errors, timeout) should be handled with try-catch inside the coroutine. CEH should only catch truly unexpected exceptions that slip through your error handling.

Another mistake is installing CEH on `viewModelScope`. Since `viewModelScope` already uses `SupervisorJob`, exceptions from `launch` don't crash the app — they just cancel the individual coroutine. But the exception is still "unhandled" and will be logged to Logcat. If you want custom handling, add a CEH to `viewModelScope` via `viewModelScope.launch(handler) { }`.

**Key takeaway:** `CoroutineExceptionHandler` is a last resort, not a replacement for try-catch. It only catches exceptions from root-level `launch` coroutines. Use try-catch inside coroutines for recoverable errors. CEH is for logging and crash reporting of truly unexpected exceptions.

### Lesson 3.3: SupervisorJob and supervisorScope

`SupervisorJob` changes the propagation rule: child failures don't cancel the parent or siblings. Each child's failure is isolated. This is what you want when parallel operations are independent — a failed image download shouldn't cancel the text loading, and a failed analytics call shouldn't crash the checkout flow.

```kotlin
// Regular Job — one child failure cancels all siblings
scope.launch {
    launch { api.syncOrders() }   // If this fails...
    launch { api.syncProfile() }  // ...this gets cancelled too
}

// SupervisorJob — child failures don't affect siblings
val supervisorScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
supervisorScope.launch {
    launch { api.syncOrders() }   // If this fails...
    launch { api.syncProfile() }  // ...this keeps running
}

// supervisorScope builder — use inside suspend functions
suspend fun searchEverything(query: String): SearchResult {
    return supervisorScope {
        val products = async {
            try { productSearch.search(query) }
            catch (e: Exception) { emptyList() }
        }
        val stores = async {
            try { storeSearch.search(query) }
            catch (e: Exception) { emptyList() }
        }
        SearchResult(products.await(), stores.await())
    }
}
```

**How SupervisorJob works internally** — The difference between `Job` and `SupervisorJob` is in one method: `childCancelled(cause: Throwable)`. In a regular `Job`, when a child calls `childCancelled`, the parent propagates the exception upward and cancels all children. In a `SupervisorJob`, `childCancelled` returns `false`, meaning "I'm not handling this exception, let the child deal with it." The exception then falls through to the `CoroutineExceptionHandler` on the scope (if one exists) or the thread's uncaught exception handler.

```kotlin
// Regular Job behavior:
// Child throws -> parent.childCancelled(exception) returns true
// -> Parent cancels itself and all other children
// -> Exception propagates up

// SupervisorJob behavior:
// Child throws -> parent.childCancelled(exception) returns false
// -> Parent does NOT cancel itself or other children
// -> Exception goes to CoroutineExceptionHandler
// -> If no CEH, goes to thread's uncaught exception handler
```

**Important detail** — `viewModelScope` already uses `SupervisorJob` internally. That's why one failed `viewModelScope.launch` doesn't cancel your other launches. But if you create a child `coroutineScope` inside a `viewModelScope.launch`, that inner scope uses a regular `Job` — failures in that inner scope will cancel all siblings within it.

```kotlin
// viewModelScope uses SupervisorJob — launches are independent
viewModelScope.launch { fetchUser() }    // If this fails...
viewModelScope.launch { fetchOrders() }  // ...this is NOT affected

// But coroutineScope inside a launch uses regular Job
viewModelScope.launch {
    coroutineScope {
        launch { fetchUser() }    // If this fails...
        launch { fetchOrders() }  // ...this IS cancelled
    }
}

// supervisorScope inside a launch — children are independent
viewModelScope.launch {
    supervisorScope {
        launch { fetchUser() }    // If this fails...
        launch { fetchOrders() }  // ...this is NOT affected
    }
}
```

**SupervisorJob vs supervisorScope** — `SupervisorJob()` is for creating standalone scopes. `supervisorScope { }` is for creating supervisor boundaries within existing coroutines. The `supervisorScope` builder creates a new `Job` with supervisor behavior, runs the block, and waits for all children to complete:

```kotlin
// supervisorScope waits for all children, even failed ones
suspend fun syncAllIndependently() {
    supervisorScope {
        val job1 = launch {
            delay(1000)
            throw IOException("Sync 1 failed")
        }
        val job2 = launch {
            delay(2000)
            println("Sync 2 completed")
        }
        // supervisorScope waits for both to finish
        // job1 fails at 1s, but job2 continues until 2s
    }
    // After supervisorScope returns, both children have completed/failed
}
```

**Real-world pattern: independent parallel operations with partial results** — In production, you often want to show whatever succeeds, even if some parts fail:

```kotlin
suspend fun loadDashboard(): DashboardData = supervisorScope {
    val userDeferred = async {
        try { userRepo.getUser() }
        catch (e: Exception) { null }
    }
    val ordersDeferred = async {
        try { orderRepo.getRecentOrders() }
        catch (e: Exception) { emptyList() }
    }
    val recsDeferred = async {
        try { recsRepo.getRecommendations() }
        catch (e: Exception) { emptyList() }
    }

    DashboardData(
        user = userDeferred.await(),           // Might be null
        orders = ordersDeferred.await(),       // Might be empty
        recommendations = recsDeferred.await() // Might be empty
    )
}
```

**Common Mistakes**

A common mistake is thinking that `SupervisorJob` makes exceptions disappear. It doesn't — it just prevents them from cancelling siblings. The exception still needs to be handled somewhere (try-catch, CEH, or it goes to the uncaught exception handler). Without any handler, on Android, the uncaught exception handler typically crashes the app.

Another mistake is using `SupervisorJob()` as the parent when creating a `coroutineScope`:

```kotlin
// WRONG — SupervisorJob() as parent of coroutineScope
coroutineScope {
    // This scope uses a regular Job internally
    // The SupervisorJob() passed to CoroutineScope would be the PARENT
    // But coroutineScope doesn't accept a Job parameter
}

// CORRECT — use supervisorScope for supervisor behavior
supervisorScope {
    // This scope uses SupervisorJob internally
}
```

**Key takeaway:** `SupervisorJob` prevents failure cascading. Use `supervisorScope` when parallel operations are independent and should fail independently. Use `coroutineScope` when you want all-or-nothing semantics. Remember that `viewModelScope` already uses `SupervisorJob`.

### Lesson 3.4: Cancellation — The Cooperative Contract

Cancellation in coroutines is cooperative, not preemptive. The runtime doesn't forcibly stop your coroutine — it sets a flag and expects your code to check it. All built-in suspend functions (`delay`, `yield`, `withContext`, channel operations) check for cancellation automatically. But CPU-intensive code that doesn't call suspend functions won't be cancelled. Understanding this cooperative contract is essential for writing coroutines that respond properly to cancellation.

The cancellation mechanism works through the `Job` object. When `job.cancel()` is called, the job's state changes to "cancelling." This sets an internal flag. The next time a cancellation-aware suspend function is called (like `delay`, `yield`, or `withContext`), it checks this flag and throws `CancellationException` if the job is cancelled. This exception propagates up the call stack, unwinding the coroutine normally (through `finally` blocks).

```kotlin
// This will NOT be cancelled — no suspension points
suspend fun computeForever() {
    var i = 0
    while (true) {
        i++  // Runs forever even if scope is cancelled
    }
}

// Fix 1: Check isActive manually
suspend fun computeCooperatively() = coroutineScope {
    var i = 0
    while (isActive) {
        i++
    }
}

// Fix 2: Use ensureActive() — throws CancellationException
suspend fun processItems(items: List<Item>) {
    for (item in items) {
        ensureActive()
        process(item)
    }
}

// Fix 3: Use yield() — checks cancellation AND lets other coroutines run
suspend fun cpuIntensiveWork() {
    for (i in 1..1_000_000) {
        yield()
        compute(i)
    }
}
```

**`isActive` vs `ensureActive()` vs `yield()`** — These three approaches have different behaviors. `isActive` is a boolean property — checking it doesn't throw, so you can do cleanup before returning. `ensureActive()` throws `CancellationException` immediately, which is simpler but gives you less control. `yield()` does both cancellation checking AND cooperative scheduling — it gives other coroutines a chance to run on the same thread, which is important for fairness.

```kotlin
// isActive — you control what happens
suspend fun withManualCleanup() = coroutineScope {
    while (isActive) {
        val data = processNext()
        if (!isActive) {
            // Graceful cleanup before stopping
            savePartialResults(data)
            return@coroutineScope
        }
        commit(data)
    }
}

// ensureActive — throws immediately
suspend fun withAutoCancel() {
    for (item in items) {
        ensureActive()  // Throws CancellationException if cancelled
        process(item)   // Skipped if cancelled
    }
}

// yield — cooperative scheduling + cancellation check
suspend fun fairProcessing() {
    for (item in items) {
        yield()  // Let other coroutines run, check cancellation
        heavyComputation(item)
    }
}
```

**CancellationException is special** — It doesn't propagate to the parent. It's the normal cancellation mechanism. When a parent cancels a child, it sends `CancellationException`. The child's `Job` completes in the "cancelled" state, but the parent is NOT notified of an error. This is by design — cancellation is normal, not exceptional. Never catch `CancellationException` and swallow it:

```kotlin
// WRONG — swallows CancellationException
suspend fun riskyFetch() {
    try {
        api.fetchData()
    } catch (e: Exception) {
        // CancellationException is an Exception!
        // Swallowing it means the coroutine keeps running after cancellation
        log("Error: ${e.message}")
    }
}

// CORRECT — rethrow CancellationException
suspend fun safeFetch() {
    try {
        api.fetchData()
    } catch (e: CancellationException) {
        throw e  // Always rethrow
    } catch (e: Exception) {
        log("Error: ${e.message}")
    }
}
```

**What happens when a coroutine is cancelled** — When `cancel()` is called on a job:
1. The job's state changes to "cancelling"
2. All children's `cancel()` is called (cascading)
3. The next suspension point throws `CancellationException`
4. The exception unwinds the call stack through `finally` blocks
5. After all `finally` blocks complete, the job state changes to "cancelled"

```kotlin
// Demonstrating the cancellation flow
val job = scope.launch {
    try {
        println("Starting work")
        delay(5000)  // Cancellation point
        println("This never prints if cancelled")
    } catch (e: CancellationException) {
        println("Cancelled: ${e.message}")
        throw e  // Re-throw to complete cancellation
    } finally {
        println("Finally block — cleanup here")
        // WARNING: suspend functions throw here because job is cancelled
    }
}

delay(100)
job.cancel(CancellationException("User navigated away"))
// Output:
// Starting work
// Cancelled: User navigated away
// Finally block — cleanup here
```

**NonCancellable for cleanup** — Sometimes you need to run suspend functions in a `finally` block, but the coroutine is already cancelled. In the "cancelling" state, any suspend function call immediately throws `CancellationException`. `NonCancellable` overrides this by providing a job that is always active:

```kotlin
suspend fun saveAndClose() {
    try {
        saveData()
    } finally {
        withContext(NonCancellable) {
            database.close()  // Must complete even if cancelled
            cache.flush()
        }
    }
}
```

```kotlin
// Why NonCancellable is needed:
val job = launch {
    try {
        delay(Long.MAX_VALUE)
    } finally {
        // Job is in "cancelling" state here

        // This throws CancellationException immediately:
        delay(100)  // THROWS — can't suspend in cancelled state

        // This works — NonCancellable ignores cancellation:
        withContext(NonCancellable) {
            delay(100)  // OK — runs to completion
            saveState()  // OK — completes normally
        }
    }
}
```

**Real-world cancellation: auth token refresh** — A production pattern where cancellation matters:

```kotlin
class AuthTokenManager(private val authApi: AuthApi) {
    private val mutex = Mutex()
    private var currentToken: AuthToken? = null

    suspend fun getValidToken(): String {
        val token = currentToken
        if (token != null && !token.isExpired) {
            return token.accessToken
        }

        return mutex.withLock {
            // Double-check after acquiring lock
            val latestToken = currentToken
            if (latestToken != null && !latestToken.isExpired) {
                return@withLock latestToken.accessToken
            }

            // Refresh the token — this should NOT be cancelled
            // even if the requesting coroutine is cancelled
            val newToken = withContext(NonCancellable) {
                authApi.refreshToken(latestToken?.refreshToken ?: "")
            }
            currentToken = newToken
            newToken.accessToken
        }
    }
}
```

**Common Mistakes**

The most common cancellation mistake is doing long-running CPU work without checking for cancellation. Image processing, JSON parsing of large payloads, and database migrations are typical culprits. Always add `ensureActive()` or `yield()` in loops.

Another mistake is catching `CancellationException` in a broad `catch (e: Exception)` block and not rethrowing it. This silently breaks cancellation, meaning the coroutine continues running even though its scope has been cancelled.

**Key takeaway:** Cancellation is cooperative. Long-running code must check `isActive`, call `ensureActive()`, or call `yield()`. Never catch and swallow `CancellationException`. Use `NonCancellable` for cleanup in `finally` blocks. Remember that `isActive` gives you control over cleanup, while `ensureActive()` throws immediately.

### Lesson 3.5: withTimeout and Timeout Patterns

`withTimeout` throws `TimeoutCancellationException` (a subclass of `CancellationException`) when the timeout expires. Because it's a `CancellationException`, it doesn't propagate to the parent by default. This makes it safe for setting time limits on individual operations without crashing the entire scope.

```kotlin
suspend fun fetchWithTimeout(): Result<Data> {
    return try {
        withTimeout(5_000) {
            val data = api.fetchData()
            Result.success(data)
        }
    } catch (e: TimeoutCancellationException) {
        Result.failure(e)
    }
}

// withTimeoutOrNull — returns null instead of throwing
suspend fun fetchOrNull(): Data? {
    return withTimeoutOrNull(5_000) {
        api.fetchData()
    }
}

// Race pattern — first to complete wins
suspend fun fetchFastest(): Data = coroutineScope {
    select {
        async { primaryApi.fetch() }.onAwait { it }
        async { fallbackApi.fetch() }.onAwait { it }
    }
}
```

**How withTimeout works internally** — `withTimeout` creates a child coroutine scope with a `delay`-based timer. When the timer fires, it cancels the scope with `TimeoutCancellationException`. The code inside `withTimeout` runs in this scope, so all its child coroutines are cancelled when the timeout fires. Because `TimeoutCancellationException` extends `CancellationException`, it follows cancellation rules — it doesn't propagate to the parent scope.

```kotlin
// withTimeout is roughly equivalent to:
suspend fun <T> withTimeout(timeMs: Long, block: suspend CoroutineScope.() -> T): T {
    return coroutineScope {
        val timer = launch {
            delay(timeMs)
            throw TimeoutCancellationException("Timed out after $timeMs ms")
        }
        try {
            block()
        } finally {
            timer.cancel()
        }
    }
}
```

**Important subtlety: withTimeout and cancellation scope** — There's a subtle but critical difference between `TimeoutCancellationException` thrown by `withTimeout` and regular `CancellationException`. The `TimeoutCancellationException` from `withTimeout` is considered a failure of the `withTimeout` block, not a cancellation of the outer scope. This means `try/catch` around `withTimeout` works correctly:

```kotlin
suspend fun safeTimeout() {
    try {
        withTimeout(1000) {
            delay(5000)  // Will timeout
        }
    } catch (e: TimeoutCancellationException) {
        // This WORKS — the exception is caught here
        // The outer coroutine continues normally
        println("Timed out, using fallback")
    }
}
```

There's a subtle pitfall with `withTimeout` and non-cancellable resources. If the code inside `withTimeout` starts a side effect (like writing to a database) and the timeout fires mid-write, the write is cancelled. For critical operations, wrap the commit in `NonCancellable`:

```kotlin
suspend fun saveWithTimeout(data: Data) {
    withTimeout(10_000) {
        val processed = processData(data)  // Can be cancelled
        withContext(NonCancellable) {
            database.save(processed)  // Must complete even if timed out
        }
    }
}
```

**Production timeout patterns** — Real-world timeout strategies for network calls:

```kotlin
// Timeout with fallback
suspend fun fetchWithFallback(): Data {
    return withTimeoutOrNull(3_000) {
        remoteApi.fetch()
    } ?: localCache.get()  // Fallback to cache on timeout
}

// Progressive timeouts
suspend fun fetchWithRetry(): Data {
    val timeouts = listOf(2_000L, 5_000L, 10_000L)
    for (timeout in timeouts) {
        val result = withTimeoutOrNull(timeout) {
            api.fetch()
        }
        if (result != null) return result
    }
    throw TimeoutException("All attempts timed out")
}

// Timeout with cancellation of in-flight request
suspend fun fetchWithCancelledRequest(): Data {
    return withTimeout(5_000) {
        suspendCancellableCoroutine { cont ->
            val call = httpClient.newCall(request)
            call.enqueue(object : Callback {
                override fun onResponse(call: Call, response: Response) {
                    if (cont.isActive) cont.resume(response.toData())
                }
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }
            })
            cont.invokeOnCancellation { call.cancel() }
            // When withTimeout fires, invokeOnCancellation cancels the HTTP call
        }
    }
}
```

**Common Mistakes**

A common mistake is using `withTimeout` for operations that have their own timeout mechanisms. For example, OkHttp has built-in read/write/connect timeouts. Adding `withTimeout` on top creates two timeout mechanisms that can interact unexpectedly. Prefer using the library's native timeout when available.

Another mistake is not protecting critical side effects inside `withTimeout`. If a database transaction is interrupted by a timeout, the transaction might be left in an inconsistent state. Always wrap critical commits in `NonCancellable`.

**Key takeaway:** `withTimeout` throws `TimeoutCancellationException`, which is a `CancellationException` — it doesn't crash the parent scope. Use `withTimeoutOrNull` for a null-returning alternative. Protect critical side effects inside `withTimeout` with `NonCancellable`. For production code, consider progressive timeouts with fallback strategies.
### Quiz: Exception Handling and Cancellation

#### What happens when a child coroutine launched with `launch` inside a regular `Job` scope throws an exception?

- ❌ Only the failed child coroutine is cancelled
- ✅ The exception propagates to the parent, cancelling all sibling coroutines
- ❌ The exception is silently swallowed
- ❌ The exception is stored and rethrown when the parent completes

> **Explanation:** With a regular `Job`, failure in one child cancels the parent, which in turn cancels all other children. This is the default behavior of structured concurrency. Use `SupervisorJob` to prevent this cascading failure.

#### Where must a `CoroutineExceptionHandler` be installed for it to catch exceptions?

- ❌ On any `launch` coroutine, including nested ones
- ❌ In the `catch` block of a try-catch
- ✅ On a root coroutine — a direct child of the `CoroutineScope`
- ❌ On the `async` builder

> **Explanation:** `CoroutineExceptionHandler` only works on root-level `launch` coroutines (direct children of the scope). Nested coroutines propagate exceptions to their parent, bypassing the handler.

#### Why should you never catch and swallow `CancellationException`?

- ❌ It causes an `OutOfMemoryError`
- ❌ It makes the app crash silently
- ✅ It breaks structured concurrency by preventing the coroutine from actually being cancelled
- ❌ It is automatically rethrown by the Kotlin runtime

> **Explanation:** `CancellationException` is the mechanism for cooperative cancellation. Swallowing it means the coroutine continues running even though its parent or scope requested cancellation, breaking the structured concurrency contract.

### Coding Challenge: Resilient Parallel Sync

Write a `syncAllData` function that syncs orders, profile, and settings **independently** — if syncing orders fails, profile and settings should still complete. Each sync has a 10-second timeout. Log any individual failures without crashing the whole operation.

#### Solution

```kotlin
suspend fun syncAllData() = supervisorScope {
    val ordersJob = launch {
        try {
            withTimeout(10_000) { api.syncOrders() }
        } catch (e: TimeoutCancellationException) {
            log("Orders sync timed out")
        } catch (e: Exception) {
            log("Orders sync failed: ${e.message}")
        }
    }

    val profileJob = launch {
        try {
            withTimeout(10_000) { api.syncProfile() }
        } catch (e: TimeoutCancellationException) {
            log("Profile sync timed out")
        } catch (e: Exception) {
            log("Profile sync failed: ${e.message}")
        }
    }

    val settingsJob = launch {
        try {
            withTimeout(10_000) { api.syncSettings() }
        } catch (e: TimeoutCancellationException) {
            log("Settings sync timed out")
        } catch (e: Exception) {
            log("Settings sync failed: ${e.message}")
        }
    }
}
```

`supervisorScope` ensures that each child coroutine is independent — a failure in one doesn't cancel the others. Each `launch` wraps its work in try-catch to log failures. `withTimeout` adds a per-operation timeout so a stalled network call doesn't block the sync indefinitely.

---

## Module 4: Kotlin Flow

Flow is Kotlin's answer to reactive streams. It's cold, sequential, and integrated with coroutines. Where coroutines handle one-shot async operations, Flow handles streams of values over time.

### Lesson 4.1: Cold Flows and Flow Builders

A cold flow doesn't produce values until someone collects it. Each collector gets its own independent stream — the `flow { }` builder code re-executes for every collector. This is fundamentally different from hot streams like `StateFlow` or `SharedFlow`, which maintain state and emit regardless of collectors.

The cold flow concept comes from the observer pattern: the flow is the observable, and the collector is the observer. But unlike traditional observer patterns (like RxJava's `Observable`), a cold Flow is purely pull-based at its core — it only runs when pulled by a `collect` call.

```kotlin
fun observeUsers(): Flow<List<User>> = flow {
    while (true) {
        val users = database.getAllUsers()
        emit(users)                    // Send data downstream
        delay(5_000)                   // Wait 5 seconds
    }
}

// Collecting triggers execution
viewModelScope.launch {
    observeUsers().collect { users ->
        _state.value = UsersState.Loaded(users)
    }
}

// flowOf — create a flow from fixed values
val numbers = flowOf(1, 2, 3, 4, 5)

// asFlow — convert collections to flows
val flow = listOf("a", "b", "c").asFlow()

// Convert ranges to flows
val range = (1..100).asFlow()
```

Under the hood, a `Flow` is just an interface with a single `collect` method. The `flow { }` builder creates an implementation of this interface. When you call `collect`, it invokes the builder's lambda, which calls `emit()` to send values to the collector. The collector itself is a `FlowCollector` — another simple interface with an `emit` method. This simplicity is deliberate — Flows are built on suspend functions, not on complex reactive machinery.

```kotlin
// The Flow interface — remarkably simple
public interface Flow<out T> {
    public suspend fun collect(collector: FlowCollector<T>)
}

// The FlowCollector interface — equally simple
public fun interface FlowCollector<in T> {
    public suspend fun emit(value: T)
}

// What flow { } builder actually creates:
fun <T> flow(block: suspend FlowCollector<T>.() -> Unit): Flow<T> {
    return object : Flow<T> {
        override suspend fun collect(collector: FlowCollector<T>) {
            // The block runs with collector as the receiver
            // So emit() inside the block calls collector.emit()
            collector.block()
        }
    }
}
```

The fact that both `collect` and `emit` are `suspend` functions is the key to how Flow handles backpressure naturally. When the collector is slow, `emit` suspends until the collector processes the previous value. This is automatic backpressure with zero configuration — the producer can't outrun the consumer.

```kotlin
// Demonstrating natural backpressure
val fastProducer = flow {
    for (i in 1..100) {
        emit(i)
        println("Emitted $i at ${System.currentTimeMillis()}")
    }
}

fastProducer.collect { value ->
    delay(100)  // Slow consumer
    println("Collected $value at ${System.currentTimeMillis()}")
}
// Each emit() suspends until the previous collect block completes
// The producer automatically runs at the consumer's speed
```

**Cold flow re-execution** — Each collector gets its own independent execution of the flow builder. This means side effects in the builder run once per collector:

```kotlin
var executionCount = 0
val countingFlow = flow {
    executionCount++
    println("Flow builder executing (count: $executionCount)")
    emit(42)
}

// Collector 1
countingFlow.collect { println("Collector 1: $it") }
// Output: Flow builder executing (count: 1)
//         Collector 1: 42

// Collector 2
countingFlow.collect { println("Collector 2: $it") }
// Output: Flow builder executing (count: 2)
//         Collector 2: 42
// The builder ran TWICE — once per collector
```

The important constraint: `flow { }` is sequential. You cannot call `emit()` from a different coroutine or thread. If you need concurrent emission, use `channelFlow` instead.

```kotlin
// WRONG — emit from different coroutine
fun wrongFlow(): Flow<Int> = flow {
    coroutineScope {
        launch { emit(1) }  // CRASH: emit from different coroutine
        launch { emit(2) }
    }
}

// CORRECT — use channelFlow for concurrent emission
fun correctFlow(): Flow<Int> = channelFlow {
    launch { send(1) }  // OK — channelFlow uses a channel internally
    launch { send(2) }
}
```

**Real-world flow builders** — In production Android apps, flows typically come from Room, DataStore, or network polling:

```kotlin
// Room DAO returns Flow — database changes auto-emit
@Dao
interface UserDao {
    @Query("SELECT * FROM users WHERE id = :userId")
    fun observeUser(userId: String): Flow<User>
    // Emits new value whenever the 'users' table changes
}

// DataStore returns Flow
val settingsFlow: Flow<Settings> = dataStore.data.map { prefs ->
    Settings(
        darkMode = prefs[DARK_MODE_KEY] ?: false,
        notifications = prefs[NOTIFICATIONS_KEY] ?: true
    )
}

// Network polling with flow builder
fun pollServerStatus(): Flow<ServerStatus> = flow {
    while (true) {
        try {
            val status = api.getServerStatus()
            emit(status)
        } catch (e: IOException) {
            emit(ServerStatus.Unknown)
        }
        delay(30_000)  // Poll every 30 seconds
    }
}
```

**Common Mistakes**

A common mistake is collecting the same cold flow multiple times thinking they share state. They don't — each `collect` call re-executes the flow builder independently. If you want shared state, convert to a hot flow with `stateIn` or `shareIn`.

Another mistake is calling `emit` from `withContext` inside a `flow { }` builder. This violates context preservation and throws `IllegalStateException`:

```kotlin
// WRONG — violates context preservation
fun brokenFlow(): Flow<Data> = flow {
    withContext(Dispatchers.IO) {
        emit(fetchData())  // CRASH: different context
    }
}

// CORRECT — use flowOn for upstream context change
fun fixedFlow(): Flow<Data> = flow {
    emit(fetchData())
}.flowOn(Dispatchers.IO)
```

**Key takeaway:** `flow { }` creates a cold stream. Code inside the builder only runs when `collect` is called. Each collector gets a fresh execution. Flows are built on suspend functions — simple, sequential, and cooperative. The natural backpressure of suspend-based emit/collect means the producer automatically runs at the consumer's speed.

### Lesson 4.2: Transformation Operators

Flow operators are lazy — they build a pipeline that executes only when collected. Each operator creates a new `Flow` that wraps the upstream `Flow`. Understanding how operators chain internally helps you reason about performance and behavior.

```kotlin
// map — transform each value
val userNames = observeUsers()
    .map { users -> users.map { it.name } }

// filter — only emit matching values
val activeUsers = observeUsers()
    .filter { users -> users.any { it.isActive } }

// transform — emit zero, one, or multiple values per input
val expanded = numbersFlow
    .transform { value ->
        emit(value)
        emit(value * 10)
    }

// distinctUntilChanged — skip consecutive duplicates
val deduped = sensorFlow
    .distinctUntilChanged()

// take — only emit first N values
val firstFive = numbersFlow.take(5)

// takeWhile — emit while predicate is true
val untilError = statusFlow
    .takeWhile { it != Status.ERROR }

// scan — running accumulation (like fold but emits each step)
val runningTotal = paymentsFlow
    .scan(0.0) { acc, payment -> acc + payment.amount }
```

**How operators work internally** — Each operator like `map` or `filter` returns a new `Flow` object. When `collect` is called on the outermost flow, it triggers a chain: the outer flow collects from the inner flow, which collects from the next inner flow, all the way down to the original `flow { }` builder. Each value passes through each operator's transformation function before reaching the terminal `collect`. This is why operators are "lazy" — nothing executes until the terminal `collect` call.

Let's look at how `map` is actually implemented:

```kotlin
// Simplified implementation of map
fun <T, R> Flow<T>.map(transform: suspend (T) -> R): Flow<R> = flow {
    collect { value ->
        emit(transform(value))
    }
}

// When you write:
val result = sourceFlow.map { it * 2 }.filter { it > 10 }.collect { println(it) }

// It's equivalent to:
sourceFlow.collect { value ->            // Source emits a value
    val mapped = value * 2                // map transforms it
    if (mapped > 10) {                    // filter checks predicate
        println(mapped)                    // collect processes it
    }
}
```

This means the entire pipeline executes synchronously for each value — there's no buffering, no scheduling, no intermediate collections. A value enters the pipeline, passes through every operator, reaches the collector, and only then does the next value enter. This is the "sequential" nature of cold flows.

```kotlin
// Simplified implementation of filter
fun <T> Flow<T>.filter(predicate: suspend (T) -> Boolean): Flow<T> = flow {
    collect { value ->
        if (predicate(value)) {
            emit(value)
        }
        // If predicate returns false, value is simply not emitted
        // No allocation, no buffering
    }
}

// Simplified implementation of transform
fun <T, R> Flow<T>.transform(block: suspend FlowCollector<R>.(T) -> Unit): Flow<R> = flow {
    collect { value ->
        block(value)  // The block can call emit 0, 1, or many times
    }
}
```

**The `transform` operator** — `transform` is the most powerful transformation operator because it gives you full control over emission. You can emit zero values (like filter), one value (like map), or multiple values (like flatMap). In fact, `map` and `filter` are implemented in terms of `transform`:

```kotlin
// map in terms of transform
fun <T, R> Flow<T>.mapViaTransform(f: suspend (T) -> R): Flow<R> =
    transform { emit(f(it)) }

// filter in terms of transform
fun <T> Flow<T>.filterViaTransform(p: suspend (T) -> Boolean): Flow<T> =
    transform { if (p(it)) emit(it) }

// Practical use: emit header before each group
val withHeaders = itemsFlow.transform { item ->
    if (item.isNewCategory) {
        emit(ListItem.Header(item.category))
    }
    emit(ListItem.Content(item))
}
```

**`distinctUntilChanged` internals** — This operator keeps track of the previously emitted value and only emits when the new value differs. By default, it uses `equals()` for comparison, but you can provide a custom comparator:

```kotlin
// Default — uses equals()
val deduped = priceFlow.distinctUntilChanged()

// Custom comparison — only emit when price changes by more than $1
val significantChanges = priceFlow.distinctUntilChanged { old, new ->
    abs(old - new) < 1.0  // Return true if "same" (don't emit)
}

// Compare by specific field
val uniqueStatuses = stateFlow.distinctUntilChanged { old, new ->
    old.status == new.status  // Only re-emit when status field changes
}
```

**`scan` for running state** — `scan` is incredibly useful for maintaining running state across emissions. Unlike `fold` (which produces a single final value), `scan` emits every intermediate accumulation:

```kotlin
// Running total of payments
val runningBalance = paymentsFlow
    .scan(0.0) { balance, payment ->
        balance + payment.amount
    }
// Input: 100, 50, -30, 200
// Output: 0.0, 100.0, 150.0, 120.0, 320.0 (includes initial value)

// Track state transitions
val stateHistory = eventFlow
    .scan(AppState.Initial) { state, event ->
        state.reduce(event)
    }
```

**Operator fusion** — Some operators are "transparent" to the runtime and can be fused. For example, multiple consecutive `map` calls are not literally nested — the runtime still processes them sequentially, but the JVM's JIT compiler can inline the lambdas for performance:

```kotlin
// These two chains have identical runtime behavior:
val chain1 = flow.map { it * 2 }.map { it + 1 }.map { it.toString() }

// Equivalent to:
val chain2 = flow.map { (it * 2 + 1).toString() }
// The JIT compiler often optimizes chain1 to look like chain2
```

**Common Mistakes**

A common mistake is performing side effects in operators like `map` or `filter`. These operators should be pure transformations. Use `onEach` for side effects:

```kotlin
// WRONG — side effect in map
val wrong = flow.map { value ->
    analytics.track("value_received")  // Side effect in map
    transform(value)
}

// CORRECT — use onEach for side effects
val correct = flow
    .onEach { analytics.track("value_received") }
    .map { transform(it) }
```

Another mistake is applying operators after `collect`. `collect` is a terminal operator — nothing can come after it in the pipeline:

```kotlin
// WRONG — map after collect is not possible
flow.collect { value -> process(value) }.map { it * 2 }  // Compile error

// CORRECT — operators before collect
flow.map { it * 2 }.collect { process(it) }
```

**Key takeaway:** Flow operators are lazy — they build a pipeline that executes only when collected. Each operator wraps the upstream Flow and transforms values as they pass through. The pipeline executes synchronously for each value with zero buffering. Use `transform` for maximum flexibility, `onEach` for side effects, and `distinctUntilChanged` to avoid redundant processing.

### Lesson 4.3: Combining Flows

When your UI depends on multiple data sources, you need to combine flows. Kotlin provides three main strategies, each with different semantics. Choosing the right one depends on whether you need the latest values from all sources, strict one-to-one pairing, or transformed inner flows.

```kotlin
// combine — re-emits whenever ANY source emits
val uiState = combine(
    userFlow,
    settingsFlow,
    networkStatusFlow
) { user, settings, network ->
    UiState(user, settings, network)
}
```

`combine` waits for all flows to emit at least one value, then re-emits whenever any flow produces a new value. This is your go-to for merging multiple data sources into a single UI state. When combining more than 5 flows, you can use the array overload:

```kotlin
inline fun <T1, T2, T3, T4, T5, T6, R> combine(
    flow: Flow<T1>,
    flow2: Flow<T2>,
    flow3: Flow<T3>,
    flow4: Flow<T4>,
    flow5: Flow<T5>,
    flow6: Flow<T6>,
    crossinline transform: suspend (T1, T2, T3, T4, T5, T6) -> R
): Flow<R> {
    return kotlinx.coroutines.flow.combine(
        flow, flow2, flow3, flow4, flow5, flow6
    ) { args: Array<*> ->
        @Suppress("UNCHECKED_CAST")
        transform(
            args[0] as T1, args[1] as T2, args[2] as T3,
            args[3] as T4, args[4] as T5, args[5] as T6,
        )
    }
}
```

**How `combine` works internally** — `combine` collects all input flows concurrently using separate coroutines. Each flow's latest value is stored in an array slot. When any flow emits a new value, the slot is updated and the transform function is called with all current slot values. The first emission only happens after all flows have emitted at least one value. Internally, `combine` uses channels to coordinate between the collection coroutines and the emission coroutine.

```kotlin
// Visualizing combine behavior:
// Flow A: --1------2------3------
// Flow B: ----a------b----------
// Result: ----1a---2a---2b-3b---
//
// Wait for both to emit, then re-emit on any change
// Always uses the LATEST value from each flow
```

```kotlin
// zip — pairs emissions one-to-one, completes when either completes
val paired = flow1.zip(flow2) { a, b -> Pair(a, b) }

// flatMapLatest — cancel previous inner flow when new value arrives
val searchResults = searchQuery
    .debounce(300)
    .flatMapLatest { query ->
        if (query.isBlank()) flowOf(emptyList())
        else searchApi.search(query)
    }

// flatMapConcat — process inner flows sequentially
val details = idsFlow
    .flatMapConcat { id -> fetchDetails(id) }

// flatMapMerge — process inner flows concurrently
val allDetails = idsFlow
    .flatMapMerge(concurrency = 4) { id -> fetchDetails(id) }
```

**combine vs zip — a detailed comparison** — `combine` re-emits with every new value from any source (using the latest value from other sources). `zip` pairs values one-to-one and only emits when both sources have a new value. Use `combine` for UI state (you always want the latest). Use `zip` when you need strict pairing.

```kotlin
// Visualizing zip behavior:
// Flow A: --1------2------3------
// Flow B: ----a------b----------
// Result: ----1a-----2b----------
//
// Pairs strictly one-to-one
// Completes when EITHER flow completes
// Values that don't have a pair are discarded

// zip waits for both flows to have a value
val zipped = flowOf(1, 2, 3).zip(flowOf("a", "b")) { num, letter ->
    "$num$letter"
}
// Emits: "1a", "2b" — 3 has no pair, so it's discarded
```

```kotlin
// Practical use of zip: correlating request/response
val requestTimes = flow { while (true) { emit(System.currentTimeMillis()); delay(1000) } }
val responses = requestTimes.map { api.ping() }
val latencies = requestTimes.zip(responses) { sentAt, response ->
    System.currentTimeMillis() - sentAt
}
```

**flatMap variants** — These are the most powerful combining operators. Each one maps a value to a flow (one-to-many transformation) and then flattens the result:

```kotlin
// flatMapLatest — CANCEL previous inner flow on new upstream value
// Perfect for: search-as-you-type, navigation state
val searchResults = queryFlow
    .flatMapLatest { query ->
        flow {
            emit(SearchState.Loading)
            val results = api.search(query)
            emit(SearchState.Results(results))
        }
    }
// If user types "ko", "kot", "kotl" quickly:
// "ko" search starts -> cancelled when "kot" arrives
// "kot" search starts -> cancelled when "kotl" arrives
// Only "kotl" search completes

// flatMapConcat — process ONE AT A TIME, in order
// Perfect for: sequential processing, ordered operations
val orderedResults = idsFlow
    .flatMapConcat { id ->
        flow {
            emit(ProcessState.Processing(id))
            val result = process(id)
            emit(ProcessState.Done(id, result))
        }
    }
// Processes each id fully before starting the next

// flatMapMerge — process CONCURRENTLY with limit
// Perfect for: batch processing, parallel downloads
val parallelResults = urlsFlow
    .flatMapMerge(concurrency = 4) { url ->
        flow {
            val data = download(url)
            emit(DownloadResult(url, data))
        }
    }
// Up to 4 downloads run simultaneously
```

**Real-world combining pattern: dashboard with multiple data sources**

```kotlin
class DashboardViewModel(
    userRepo: UserRepository,
    orderRepo: OrderRepository,
    notifRepo: NotificationRepository,
    networkMonitor: NetworkMonitor
) : ViewModel() {

    val dashboardState: StateFlow<DashboardState> = combine(
        userRepo.observeUser(),
        orderRepo.observeRecentOrders(),
        notifRepo.observeUnreadCount(),
        networkMonitor.isOnline
    ) { user, orders, notifCount, isOnline ->
        DashboardState(
            user = user,
            recentOrders = orders,
            unreadNotifications = notifCount,
            isOffline = !isOnline
        )
    }
    .catch { e -> emit(DashboardState.Error(e.message)) }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardState.Loading)
}
```

**Common Mistakes**

A common mistake with `combine` is not realizing it waits for ALL flows to emit before producing the first value. If one flow is slow to emit, the combined flow won't emit until it does. Use `onStart { emit(defaultValue) }` on slow flows to provide an initial value:

```kotlin
// PROBLEM — combine waits for all flows
val state = combine(
    userFlow,                            // Emits quickly
    heavyComputationFlow                 // Takes 5 seconds to emit first value
) { user, result -> State(user, result) }
// UI shows nothing for 5 seconds

// FIX — provide initial values
val state = combine(
    userFlow,
    heavyComputationFlow.onStart { emit(defaultResult) }
) { user, result -> State(user, result) }
// UI shows immediately with default result
```

**Key takeaway:** `combine` is your go-to for merging multiple data sources into a single UI state. Use `flatMapLatest` for search patterns where only the latest result matters. Use `zip` for strict one-to-one pairing. Use `flatMapMerge` for concurrent processing with controlled parallelism. Always provide initial values for slow flows when using `combine`.

### Lesson 4.4: Lifecycle Operators

Flow provides hooks for the start, each emission, and completion of a stream. These lifecycle operators don't consume values — they intercept them, making them perfect for cross-cutting concerns like logging, analytics, and loading states.

```kotlin
val monitoredFlow = dataFlow
    .onStart {
        log("Flow started")
        emit(DataState.Loading)  // Can emit values in onStart
    }
    .onEach { data ->
        log("Received: $data")
        analytics.track("data_received")
    }
    .onCompletion { cause ->
        if (cause == null) log("Flow completed normally")
        else log("Flow failed: ${cause.message}")
    }
```

**onStart** runs before the first value is collected. It can emit values — this is useful for emitting a loading state before the real data arrives. Internally, `onStart` creates a flow that first calls your block (with `FlowCollector` as receiver so you can `emit`), then collects the upstream flow. **onEach** runs for every value without consuming it (the value continues downstream). **onCompletion** runs when the flow completes, either normally or with an exception. The `cause` parameter is null for normal completion and contains the exception for abnormal completion.

```kotlin
// Practical pattern: loading state + data + completion tracking
fun observeOrders(): Flow<OrderState> = repository
    .getOrders()
    .map { orders -> OrderState.Success(orders) as OrderState }
    .onStart { emit(OrderState.Loading) }
    .onCompletion { cause ->
        if (cause != null) {
            analytics.trackError("orders_flow_failed", cause)
        }
    }
```

**How `onStart` works internally** — `onStart` wraps the upstream flow and runs your block before starting collection:

```kotlin
// Simplified onStart implementation
fun <T> Flow<T>.onStart(action: suspend FlowCollector<T>.() -> Unit): Flow<T> = flow {
    action()       // Run the onStart block (can emit values)
    collect { emit(it) }  // Then collect upstream
}
```

**`onCompletion` vs `finally`** — Both run when the flow ends, but `onCompletion` is a flow operator that can emit values, while `finally` is a Kotlin language construct:

```kotlin
// onCompletion can emit fallback values
val withFallback = dataFlow
    .onCompletion { cause ->
        if (cause is IOException) {
            emit(DataState.Offline)  // Emit a fallback state
        }
    }

// finally in collect cannot emit
dataFlow.collect { value ->
    try {
        process(value)
    } finally {
        cleanup()  // Can't emit here
    }
}
```

**Chaining lifecycle operators** — You can chain multiple lifecycle operators to build complex pipelines:

```kotlin
fun observeSearchResults(query: Flow<String>): Flow<SearchState> = query
    .onStart { log("Search flow started") }
    .debounce(300)
    .onEach { log("Query after debounce: $it") }
    .distinctUntilChanged()
    .onEach { log("Distinct query: $it") }
    .flatMapLatest { q ->
        searchApi.search(q)
            .onStart { log("API call started for: $q") }
            .onCompletion { log("API call completed for: $q") }
    }
    .onEach { result -> analytics.trackSearch(result) }
    .onCompletion { cause ->
        log("Search flow completed: ${cause?.message ?: "normally"}")
    }
```

**Common Mistakes**

A common mistake is trying to use `onCompletion` to detect cancellation. When a flow collector's coroutine is cancelled, the flow is cancelled too, and `onCompletion` receives a `CancellationException`. But you should be careful about doing work in `onCompletion` during cancellation, because the coroutine might already be in the "cancelling" state.

```kotlin
// CAUTION — suspend calls might fail in onCompletion during cancellation
dataFlow
    .onCompletion { cause ->
        if (cause is CancellationException) {
            // Suspend calls might throw here
            withContext(NonCancellable) {
                savePartialResults()  // Wrap in NonCancellable
            }
        }
    }
```

**Key takeaway:** `onStart` can emit values (great for loading states), `onEach` is for side effects on each value, and `onCompletion` handles cleanup. These operators don't consume values — they intercept them. Use `onStart` for loading states, `onEach` for logging/analytics, and `onCompletion` for cleanup and error tracking.

### Lesson 4.5: flowOn and Context Preservation

Flow has a strict rule: the `flow { }` builder must emit values in the same coroutine context as the collector. You can't just launch a coroutine inside `flow { }` and call `emit()` from it. This is called **context preservation**, and it's one of the most important safety guarantees in the Flow API.

Context preservation exists to prevent a subtle class of bugs. If `emit()` could be called from any context, the collector might receive values on unexpected threads. In UI code, this would mean processing UI updates on a background thread — a guaranteed crash. By enforcing context preservation, Flow guarantees that the collector always runs on the context it was started in.

To change the dispatcher for upstream operations, use `flowOn`:

```kotlin
// flowOn changes the context for UPSTREAM operations
val processedData = flow {
    // This runs on Dispatchers.Default (specified by flowOn below)
    val data = heavyComputation()
    emit(data)
}
.flowOn(Dispatchers.Default)  // Only affects code ABOVE this line
.map { transform(it) }        // This runs on the collector's dispatcher
.collect { updateUI(it) }     // This runs on the collector's dispatcher
```

`flowOn` only affects upstream operators — everything above it in the chain. Everything below it (including `collect`) runs on the collector's context. This is fundamentally different from `subscribeOn`/`observeOn` in RxJava. In RxJava, `subscribeOn` affects the source and `observeOn` affects downstream. In Flow, `flowOn` affects upstream only — there's no equivalent to `observeOn` because the collector's context is always the context of the coroutine that calls `collect`.

```kotlin
// Common mistake — using withContext inside flow { }
fun wrongFlow(): Flow<Data> = flow {
    withContext(Dispatchers.IO) {
        emit(fetchData())  // CRASH: emit called from different context
    }
}

// Correct — use flowOn
fun correctFlow(): Flow<Data> = flow {
    emit(fetchData())
}
.flowOn(Dispatchers.IO)
```

**How `flowOn` works internally** — `flowOn` creates a channel between the upstream flow and the downstream collector. The upstream flow runs in its own coroutine on the specified dispatcher and sends values to the channel. The downstream collector reads from the channel on its original dispatcher. This channel is how Flow handles the context switch without violating context preservation.

```kotlin
// What flowOn does internally (simplified):
fun <T> Flow<T>.flowOn(dispatcher: CoroutineDispatcher): Flow<T> = flow {
    // Create a channel to bridge the context boundary
    val channel = Channel<T>(Channel.BUFFERED)

    // Collect upstream on the specified dispatcher
    val upstreamJob = CoroutineScope(dispatcher).launch {
        this@flowOn.collect { value ->
            channel.send(value)  // Send to channel from upstream context
        }
        channel.close()
    }

    // Read from channel on the collector's context
    for (value in channel) {
        emit(value)  // Emit on collector's context
    }
}
```

**Multiple `flowOn` operators** — You can use multiple `flowOn` operators to run different parts of the pipeline on different dispatchers:

```kotlin
val result = flow {
    // Runs on Dispatchers.IO (nearest flowOn below)
    emit(readFromDatabase())
}
.flowOn(Dispatchers.IO)
.map { data ->
    // Runs on Dispatchers.Default (nearest flowOn below)
    parseData(data)
}
.flowOn(Dispatchers.Default)
.collect { result ->
    // Runs on the collector's dispatcher (e.g., Main)
    updateUI(result)
}
```

Each `flowOn` creates a separate channel internally. This means three separate contexts are involved: IO for the source, Default for the map, and the collector's context. While flexible, this creates overhead from the channel buffers. In most cases, a single `flowOn` is sufficient.

**flowOn vs withContext in a flow context** — The key rule is: never use `withContext` to change the emission context inside `flow { }`. Use `flowOn` instead. However, you CAN use `withContext` inside operators like `map` that don't call `emit` directly:

```kotlin
// WRONG — withContext around emit
flow {
    withContext(Dispatchers.IO) {
        emit(fetchData())  // CRASH
    }
}

// OK — withContext inside map (no direct emit)
flow { emit(rawData) }
    .map { data ->
        withContext(Dispatchers.Default) {
            heavyTransform(data)  // Returns transformed value, doesn't emit
        }
    }
    .collect { updateUI(it) }

// BUT PREFERRED — use flowOn instead
flow { emit(rawData) }
    .map { heavyTransform(it) }
    .flowOn(Dispatchers.Default)
    .collect { updateUI(it) }
```

**Common Mistakes**

The biggest mistake is using `withContext` inside `flow { }` to change the emission context. This always crashes with `IllegalStateException: Flow invariant is violated`. Use `flowOn` instead.

Another mistake is putting `flowOn` after `collect`. Since `collect` is a terminal operator, nothing can come after it. `flowOn` must be placed between operators in the pipeline.

**Key takeaway:** Use `flowOn` to change the dispatcher for upstream operations. Never use `withContext` inside `flow { }` to change the emission context. `flowOn` only affects operators above it — everything below runs on the collector's context. Internally, `flowOn` creates a channel to bridge the context boundary safely.

### Lesson 4.6: debounce, sample, and Rate Limiting

When data arrives faster than you want to process it, use rate-limiting operators. These are essential for user input handling (search, clicks), sensor data processing, and high-frequency event streams.

```kotlin
// debounce — wait for a pause in emissions
val searchQuery = queryFlow
    .debounce(300)  // Wait 300ms after last emission
    .distinctUntilChanged()
    .flatMapLatest { query -> searchRepository.search(query) }

// sample — emit at fixed intervals, taking the latest value
val sensorData = sensorFlow
    .sample(1000)  // Emit the latest value every second

// Custom throttleFirst — emit first, then ignore for duration
fun <T> Flow<T>.throttleFirst(windowMs: Long): Flow<T> = flow {
    var lastEmitTime = 0L
    collect { value ->
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastEmitTime >= windowMs) {
            lastEmitTime = currentTime
            emit(value)
        }
    }
}

// Usage — prevent double-clicks
button.clicks()
    .throttleFirst(500)
    .collect { handleClick() }
```

**How `debounce` works internally** — `debounce` uses a timer internally. When a value is received, it starts (or resets) a timer. If another value arrives before the timer fires, the timer is reset. Only when the timer fires (no new values for the specified duration) is the last received value emitted. This is implemented using a channel and a `select` expression:

```kotlin
// Simplified debounce implementation
fun <T> Flow<T>.debounce(timeoutMs: Long): Flow<T> = flow {
    var lastValue: T? = null
    var hasValue = false

    // Conceptually:
    // On each value: save it, start/reset timer
    // When timer fires: emit saved value
    // On next value before timer: cancel timer, save new value, restart timer

    coroutineScope {
        val values = produce { collect { send(it) } }
        var timerJob: Job? = null

        for (value in values) {
            timerJob?.cancel()
            lastValue = value
            hasValue = true
            timerJob = launch {
                delay(timeoutMs)
                if (hasValue) {
                    emit(lastValue!!)
                    hasValue = false
                }
            }
        }
    }
}
```

```kotlin
// Visualizing debounce behavior:
// Input:  --a-b-c-------d--e-------f------
// Time:   0 1 2 3 4 5 6 7 8 9 10 11 12
// Output: ----------c-----------e-----f---
//         (300ms after last rapid input)
```

**debounce vs sample** — `debounce` waits for a pause in emissions. If values keep coming, it keeps waiting. This is ideal for search-as-you-type where you want to wait until the user stops typing. `sample` emits at fixed intervals regardless of emission frequency. This is better for high-frequency data like sensor readings where you want a consistent update rate.

```kotlin
// Visualizing sample behavior:
// Input:  a-b-c-d-e-f-g-h-i-j-k
// Time:   0 1 2 3 4 5 6 7 8 9 10
// Sample: ----c-----f-----i-----  (every 4 units)
//         Takes the LATEST value at each interval

// sample is perfect for:
// - GPS updates (sample every 5 seconds)
// - Accelerometer data (sample every 100ms for UI)
// - Stock price feeds (sample every second)
val gpsUpdates = locationFlow
    .sample(5000)  // Update map every 5 seconds with latest location
```

**Custom rate-limiting operators** — You can build domain-specific operators for your app's needs:

```kotlin
// throttleLatest — emit first value immediately, then latest value
// after each window
fun <T> Flow<T>.throttleLatest(windowMs: Long): Flow<T> = flow {
    var lastEmitTime = 0L
    var pendingValue: T? = null
    var hasPending = false

    collect { value ->
        val now = System.currentTimeMillis()
        if (now - lastEmitTime >= windowMs) {
            emit(value)
            lastEmitTime = now
            hasPending = false
        } else {
            pendingValue = value
            hasPending = true
        }
    }

    if (hasPending) {
        emit(pendingValue!!)
    }
}

// bufferTimeout — emit batches based on count OR timeout
fun <T> Flow<T>.bufferTimeout(
    maxSize: Int,
    timeoutMs: Long
): Flow<List<T>> = flow {
    val buffer = mutableListOf<T>()
    var lastEmitTime = System.currentTimeMillis()

    collect { value ->
        buffer.add(value)
        val now = System.currentTimeMillis()
        if (buffer.size >= maxSize || now - lastEmitTime >= timeoutMs) {
            emit(buffer.toList())
            buffer.clear()
            lastEmitTime = now
        }
    }

    if (buffer.isNotEmpty()) {
        emit(buffer.toList())
    }
}

// Usage — batch analytics events
analyticsEvents
    .bufferTimeout(maxSize = 50, timeoutMs = 5000)
    .collect { batch -> api.sendAnalytics(batch) }
```

**Real-world search implementation with debounce:**

```kotlin
class SearchViewModel(
    private val searchRepo: SearchRepository
) : ViewModel() {

    private val _query = MutableStateFlow("")

    val searchResults: StateFlow<SearchState> = _query
        .debounce(300)                    // Wait for typing pause
        .distinctUntilChanged()            // Skip duplicate queries
        .flatMapLatest { query ->
            if (query.length < 2) {
                flowOf(SearchState.Idle)   // Don't search short queries
            } else {
                flow {
                    emit(SearchState.Loading)
                    val results = searchRepo.search(query)
                    emit(SearchState.Results(results))
                }.catch { e ->
                    emit(SearchState.Error(e.message))
                }
            }
        }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            SearchState.Idle
        )

    fun onQueryChanged(query: String) {
        _query.value = query
    }
}
```

**Common Mistakes**

A common mistake is using `debounce` when you should use `throttleFirst`. `debounce` waits for a pause, so if the user keeps typing, nothing is emitted until they stop. `throttleFirst` emits immediately on the first event, then ignores subsequent events for the window. For button clicks, `throttleFirst` is better (instant response). For search queries, `debounce` is better (wait for the user to finish).

Another mistake is using very short debounce times. A 50ms debounce is effectively useless for search — users type faster than that. 200-300ms is typical for search-as-you-type. For real-time validation, 100-200ms works well.

**Key takeaway:** Use `debounce` for user input (wait until they stop typing). Use `sample` for high-frequency data (emit at fixed intervals). Build custom operators with `flow { collect { } }` for domain-specific rate limiting. Choose debounce values based on the interaction pattern: 200-300ms for search, 500ms for button clicks, 100ms for validation.
### Quiz: Kotlin Flow

#### What is the key difference between a cold Flow and a hot StateFlow?

- ❌ Cold flows are faster than hot flows
- ✅ A cold flow doesn't produce values until collected; a StateFlow produces values regardless of collectors
- ❌ Cold flows can only emit one value; StateFlow can emit multiple values
- ❌ StateFlow requires `Dispatchers.Main`; cold flows run on `Dispatchers.IO`

> **Explanation:** Cold flows are lazy — the `flow { }` builder code only executes when `collect` is called, and each collector gets an independent execution. `StateFlow` is hot — it always holds a current value and emits to all collectors.

#### What does `flatMapLatest` do when a new value is emitted upstream?

- ❌ It buffers the previous emission and processes both
- ❌ It ignores the new value until the current one finishes
- ✅ It cancels the previous inner flow and starts a new one for the latest value
- ❌ It merges both emissions into a single result

> **Explanation:** `flatMapLatest` cancels any in-progress inner flow when a new upstream value arrives. This makes it perfect for search-as-you-type where only the latest query matters.

#### Why can't you use `withContext` inside a `flow { }` builder to change the emission context?

- ❌ `withContext` is not a suspend function
- ❌ `withContext` always throws inside flows
- ✅ Flow enforces context preservation — emissions must happen in the same context as the collector. Use `flowOn` instead.
- ❌ `withContext` causes memory leaks in flows

> **Explanation:** Flow has a strict context preservation rule. The `flow { }` builder must emit in the same coroutine context as the collector. Violating this throws an `IllegalStateException`. Use `flowOn` to change the upstream context — it creates an internal channel to bridge the context boundary safely.

### Coding Challenge: Reactive Search Pipeline

Build a `StateFlow<SearchState>` that takes a `MutableStateFlow<String>` as input query, debounces for 300ms, skips empty queries, uses `flatMapLatest` to call a search repository, and handles errors gracefully. Convert it to a `StateFlow` using `stateIn` with `WhileSubscribed(5_000)`.

#### Solution

```kotlin
sealed class SearchState {
    object Idle : SearchState()
    object Loading : SearchState()
    data class Results(val items: List<String>) : SearchState()
    data class Error(val message: String?) : SearchState()
}

class SearchViewModel(
    private val repository: SearchRepository
) : ViewModel() {

    private val query = MutableStateFlow("")

    val searchState: StateFlow<SearchState> = query
        .debounce(300)
        .distinctUntilChanged()
        .flatMapLatest { q ->
            if (q.isBlank()) flowOf(SearchState.Idle)
            else flow {
                emit(SearchState.Loading)
                val results = repository.search(q)
                emit(SearchState.Results(results))
            }.catch { e -> emit(SearchState.Error(e.message)) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SearchState.Idle)

    fun onQueryChanged(newQuery: String) {
        query.value = newQuery
    }
}
```

The pipeline chains `debounce` then `distinctUntilChanged` then `flatMapLatest` to ensure only the latest query is processed. `catch` handles errors per-query, and `stateIn` with `WhileSubscribed(5_000)` keeps the upstream alive through configuration changes.

---

## Module 5: StateFlow, SharedFlow, and Hot Streams

Hot flows emit values regardless of whether anyone is collecting. Understanding when to use StateFlow vs SharedFlow — and how `stateIn`/`shareIn` work — is critical for Android architecture.

### Lesson 5.1: StateFlow — The State Holder

`StateFlow` is a hot flow that always holds a current value. It replays the latest value to new collectors and uses equality-based conflation — setting the same value twice doesn't emit twice. It's the replacement for `LiveData` in coroutine-based architectures.

```kotlin
class ProfileViewModel : ViewModel() {
    private val _state = MutableStateFlow<ProfileState>(ProfileState.Loading)
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    fun loadProfile(userId: String) {
        viewModelScope.launch {
            _state.value = ProfileState.Loading
            try {
                val profile = repository.getProfile(userId)
                _state.value = ProfileState.Success(profile)
            } catch (e: Exception) {
                _state.value = ProfileState.Error(e.message)
            }
        }
    }
}
```

Internally, `StateFlow` is backed by a single atomic slot. Every write overwrites the previous value, and every read gets the latest. The Kotlin docs describe it as equivalent to a `SharedFlow` with `replay = 1`, `onBufferOverflow = DROP_OLDEST`, plus `distinctUntilChanged`. That's the precise mental model.

The equality-based conflation means that if you emit a value that's `equals()` to the current one, nothing happens — no emission, no notification, no recomposition in Compose. This is why your data classes need correct `equals()` implementations. If you accidentally create new instances with the same data, `StateFlow` correctly deduplicates them.

**How StateFlow implements conflation** — Every time you set `_state.value = newValue`, StateFlow internally calls `newValue.equals(currentValue)`. If they're equal, the value is discarded. If they're different, the value is stored and all active collectors are notified. This is atomic — concurrent writes are serialized through an atomic compare-and-set operation.

```kotlin
// StateFlow conflation in action
val state = MutableStateFlow(0)

state.value = 1  // Emits 1 (different from 0)
state.value = 1  // Does NOT emit (equals current value)
state.value = 2  // Emits 2 (different from 1)

// With data classes
data class UserState(val name: String, val age: Int)
val userState = MutableStateFlow(UserState("Alice", 25))

userState.value = UserState("Alice", 25)  // Does NOT emit (equals)
userState.value = UserState("Alice", 26)  // Emits (age changed)
```

**StateFlow vs LiveData** — StateFlow is the modern replacement for LiveData in Android. The key differences:

```kotlin
// LiveData:
// - Android-specific (lifecycle-aware by default)
// - No initial value required (nullable by default)
// - Emits on main thread only
// - No built-in operators (map, filter, etc.)

// StateFlow:
// - Kotlin-native (works in KMM, backend, etc.)
// - Requires initial value (non-null)
// - Emits on any dispatcher
// - Rich operator support (all Flow operators)
// - Requires lifecycle-aware collection in UI

// Migration pattern:
// Before (LiveData):
class OldViewModel : ViewModel() {
    private val _user = MutableLiveData<User>()
    val user: LiveData<User> = _user
}

// After (StateFlow):
class NewViewModel : ViewModel() {
    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()
}
```

```kotlin
// StateFlow has a value property for synchronous reads
val currentState = viewModel.state.value

// StateFlow never completes — it's always active
// This means collect {} never returns normally
viewModelScope.launch {
    viewModel.state.collect { state ->
        // This lambda runs for every state change
        // It never terminates on its own
    }
}
```

**The `update` function for thread-safe state modifications** — When you need to read the current state and compute the next state atomically, use `update`:

```kotlin
// WRONG — race condition with concurrent updates
fun addItem(item: Item) {
    _state.value = _state.value.copy(
        items = _state.value.items + item  // Read and write are not atomic
    )
}

// CORRECT — atomic read-modify-write
fun addItem(item: Item) {
    _state.update { current ->
        current.copy(items = current.items + item)
    }
}

// update is implemented as a CAS (compare-and-swap) loop:
// 1. Read current value
// 2. Compute new value
// 3. compareAndSet(current, new)
// 4. If another thread changed the value between 1 and 3, retry
```

**Common Mistakes**

A common mistake is using `StateFlow` for events. StateFlow conflates equal values, which means repeated events (like "show toast") will be lost if the same message is emitted twice. Use `SharedFlow` for events:

```kotlin
// WRONG — duplicate events are lost
val _event = MutableStateFlow<String?>(null)
fun showToast(message: String) {
    _event.value = message  // If same message twice, second is lost
}

// CORRECT — use SharedFlow for events
val _event = MutableSharedFlow<String>()
suspend fun showToast(message: String) {
    _event.emit(message)  // Every emission is delivered
}
```

Another mistake is not providing a meaningful initial value. Setting the initial value to `null` and then null-checking everywhere defeats the purpose of StateFlow's type safety.

**Key takeaway:** Use `StateFlow` for UI state that always has a current value. It conflates by equality, replays the latest value to new collectors, and has a synchronous `value` property. It's the coroutine replacement for `LiveData`. Use `update` for thread-safe state modifications. Don't use it for events — use `SharedFlow` instead.

### Lesson 5.2: SharedFlow — The Event Stream

`SharedFlow` is a hot flow without a mandatory current value. It doesn't replay by default (configurable via `replay`), doesn't conflate, and supports multiple subscribers. It's for events — things that happened — not state — what something is right now.

```kotlin
class PaymentViewModel : ViewModel() {
    private val _events = MutableSharedFlow<UiEvent>()
    val events: SharedFlow<UiEvent> = _events.asSharedFlow()

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            try {
                paymentService.charge(amount)
                _events.emit(UiEvent.ShowSnackbar("Payment successful"))
                _events.emit(UiEvent.NavigateToReceipt)
            } catch (e: Exception) {
                _events.emit(UiEvent.ShowSnackbar("Payment failed: ${e.message}"))
            }
        }
    }
}
```

**SharedFlow configuration** — `MutableSharedFlow()` has three parameters that control its behavior:

```kotlin
// replay = 0: no history, new subscribers miss past events
// replay = 1: last event replayed to new subscribers
val events = MutableSharedFlow<UiEvent>(
    replay = 0,
    extraBufferCapacity = 10,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
)
```

**`replay`** controls how many past values new subscribers receive. `replay = 0` means no history — new subscribers only see future events. `replay = 3` means every new subscriber immediately gets the last 3 emissions.

**`extraBufferCapacity`** adds buffer space beyond the replay cache. With `replay = 1` and `extraBufferCapacity = 10`, the SharedFlow can hold 11 values before it needs to handle overflow.

**`onBufferOverflow`** decides what happens when the buffer is full. `SUSPEND` (default) suspends the emitter. `DROP_OLDEST` drops the oldest value. `DROP_LATEST` drops the newest value.

**How SharedFlow works internally** — SharedFlow maintains a buffer array and a list of collectors. When `emit` is called, the value is added to the buffer. If there are active collectors, each one is notified. If a collector is slow, the buffer grows until it hits the capacity limit. At that point, the overflow strategy kicks in.

```kotlin
// SharedFlow buffer behavior:
// replay = 2, extraBufferCapacity = 3
// Total buffer capacity = 2 + 3 = 5

// Emissions: a, b, c, d, e, f
// Buffer after 'e': [a, b, c, d, e] (full)
// Emit 'f' with DROP_OLDEST: [b, c, d, e, f]
// New collector sees: [e, f] (last 2 = replay count)
// Emit 'f' with SUSPEND: emitter suspends until collector processes a value
// Emit 'f' with DROP_LATEST: 'f' is discarded, buffer stays [a, b, c, d, e]
```

**SharedFlow vs StateFlow — detailed comparison**

```kotlin
// StateFlow:
// - Always has a value (mandatory initial value)
// - Conflates by equality (duplicates suppressed)
// - replay = 1 always
// - value property for synchronous access
// - Best for: UI state, configuration, settings

// SharedFlow:
// - No mandatory value (configurable replay)
// - Does NOT conflate (every emission delivered)
// - Configurable replay, buffer, overflow
// - No value property (unless replay >= 1)
// - Best for: events, navigation commands, toasts, analytics

// Relationship: StateFlow IS a specialized SharedFlow
// StateFlow = SharedFlow(replay=1, overflow=DROP_OLDEST) + distinctUntilChanged + initialValue
```

**When to use `replay` with SharedFlow** — Setting `replay > 0` means new collectors get historical values. This is useful for "sticky" events — events that should be processed even if the collector starts late:

```kotlin
// replay = 0 — good for truly one-time events
val navigationEvents = MutableSharedFlow<NavEvent>(replay = 0)
// If no collector is active when the event is emitted, it's lost

// replay = 1 — good for "latest event" semantics
val authState = MutableSharedFlow<AuthState>(replay = 1)
// New collectors get the latest auth state immediately

// The danger of replay with events:
// If replay = 1 and you emit NavigateToReceipt, then the user
// rotates the screen, the new collector gets NavigateToReceipt again
// causing a double navigation. This is why events should use replay = 0.
```

**StateFlow vs SharedFlow mental model** — `StateFlow` models **what something is right now** — the current search results, the current user profile, the loading state. `SharedFlow` models **what happened** — an analytics event fired, a payment was processed, a notification arrived. This maps directly to the state-vs-event distinction in Android architecture.

**Production pattern: ViewModel with both StateFlow and SharedFlow**

```kotlin
class CartViewModel(
    private val cartRepo: CartRepository,
    private val paymentService: PaymentService
) : ViewModel() {

    // STATE — always has a current value, UI observes this
    private val _cartState = MutableStateFlow<CartState>(CartState.Empty)
    val cartState: StateFlow<CartState> = _cartState.asStateFlow()

    // EVENTS — one-time actions, UI reacts once
    private val _events = MutableSharedFlow<CartEvent>(
        extraBufferCapacity = 10,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val events: SharedFlow<CartEvent> = _events.asSharedFlow()

    fun checkout() {
        viewModelScope.launch {
            _cartState.value = CartState.Processing
            try {
                val receipt = paymentService.charge(_cartState.value.total)
                _cartState.value = CartState.Empty
                _events.emit(CartEvent.NavigateToReceipt(receipt.id))
                _events.emit(CartEvent.ShowSnackbar("Payment successful!"))
            } catch (e: Exception) {
                _cartState.value = CartState.Error(e.message)
                _events.emit(CartEvent.ShowSnackbar("Payment failed"))
            }
        }
    }
}
```

**Common Mistakes**

A common mistake is using `SharedFlow` with `replay = 1` for navigation events. When the screen rotates, the new collector receives the replayed event and navigates again. Use `replay = 0` for one-time events.

Another mistake is forgetting that `emit` on `MutableSharedFlow` is a suspend function. If no collectors are active and the buffer is full with `onBufferOverflow = SUSPEND` (the default), `emit` will suspend indefinitely. Use `tryEmit` for fire-and-forget events from non-suspend contexts, or set `extraBufferCapacity > 0`.

```kotlin
// PROBLEM — emit suspends if no collectors and buffer is full
val events = MutableSharedFlow<Event>()  // No buffer
fun onClick() {
    scope.launch {
        events.emit(Event.Click)  // Suspends if no collector!
    }
}

// FIX — add buffer so emit doesn't suspend
val events = MutableSharedFlow<Event>(extraBufferCapacity = 10)
fun onClick() {
    events.tryEmit(Event.Click)  // Non-suspending, returns false if full
}
```

**Key takeaway:** Use `SharedFlow` for events (navigation, snackbars, analytics). Use `StateFlow` for state (UI representation). `SharedFlow` doesn't conflate and has configurable replay, buffer, and overflow. Use `replay = 0` for one-time events to prevent duplicate processing after configuration changes.

### Lesson 5.3: stateIn — Converting Cold to Hot StateFlow

`stateIn` converts a cold `Flow` into a `StateFlow`. The result always has a current value, which you provide via `initialValue`. This is the bridge between your repository layer (which exposes cold Flows) and your UI layer (which needs hot StateFlows).

```kotlin
class SearchViewModel(
    private val repository: SearchRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val searchQuery = savedStateHandle.getStateFlow("query", "")
    private val selectedFilter = savedStateHandle.getStateFlow("filter", Filter.ALL)

    val searchResults: StateFlow<UiState<List<SearchResult>>> =
        combine(searchQuery, selectedFilter) { query, filter ->
            query to filter
        }
        .debounce(300)
        .flatMapLatest { (query, filter) ->
            repository.search(query, filter)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = UiState.Loading
        )
}
```

The `started` parameter controls when the upstream flow is collected:

```kotlin
// Always active while scope lives (no cleanup when UI goes away)
SharingStarted.Eagerly

// Starts on first subscriber, never stops
SharingStarted.Lazily

// Starts on first subscriber, stops 5 seconds after last subscriber leaves
SharingStarted.WhileSubscribed(5_000)

// Stops immediately when no subscribers
SharingStarted.WhileSubscribed(0)
```

**`WhileSubscribed(5_000)` explained** — When the last subscriber disappears (e.g., the screen goes to the background), the upstream flow collection stops after 5 seconds. If a new subscriber appears within those 5 seconds (e.g., configuration change takes ~300ms), the upstream isn't restarted — the cached value is immediately available. If no subscriber appears within 5 seconds, the upstream stops and restarts when a new subscriber arrives.

**How the `started` strategies differ in practice:**

```kotlin
// Eagerly — upstream runs from scope creation until scope cancellation
// Pros: Fastest response for first subscriber
// Cons: Wastes resources when no subscribers
// Use when: Data is always needed (app-wide settings)
val alwaysOn = flow.stateIn(scope, SharingStarted.Eagerly, initial)

// Lazily — upstream starts on first subscriber, runs until scope cancellation
// Pros: Doesn't waste resources before first use
// Cons: Still runs after last subscriber leaves
// Use when: Data is needed once, then always (auth state)
val lazyStart = flow.stateIn(scope, SharingStarted.Lazily, initial)

// WhileSubscribed — upstream runs only while subscribers exist
// Pros: Saves resources when no one is listening
// Cons: Restart delay after all subscribers leave
// Use when: UI-bound data (search results, lists)
val smartStart = flow.stateIn(
    scope, SharingStarted.WhileSubscribed(5_000), initial
)
```

**The `replayExpirationMillis` parameter** — `WhileSubscribed` has an optional second parameter that controls how long the replay cache is kept after the upstream stops:

```kotlin
// Default: replay cache is kept forever
SharingStarted.WhileSubscribed(stopTimeoutMillis = 5_000)

// Clear replay cache 1 second after upstream stops
SharingStarted.WhileSubscribed(
    stopTimeoutMillis = 5_000,
    replayExpirationMillis = 1_000
)
// After cache expires, new subscribers get initialValue instead of stale cache
```

**Why `initialValue` matters** — The `initialValue` is what your UI renders before the upstream flow has a chance to emit. Set it to a `Loading` state so the UI shows a shimmer or skeleton immediately. Don't set it to `null` — that pushes null-handling into every composable.

```kotlin
// GOOD — explicit loading state
val state = flow.stateIn(scope, started, UiState.Loading)

// BAD — null initial value forces null checks everywhere
val state = flow.stateIn(scope, started, null)
// Every collector needs: val s = state.value ?: return
```

**Common Mistakes**

A common mistake is calling `stateIn` inside a function that's called multiple times. Each call creates a new SharedFlow and starts a new collection:

```kotlin
// WRONG — creates new StateFlow on every access
val state: StateFlow<Data> get() = repository.observeData()
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Data.Empty)
// Each access creates a new stateIn — multiple upstream collections!

// CORRECT — create once in init or property declaration
val state: StateFlow<Data> = repository.observeData()
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Data.Empty)
// Single StateFlow, shared by all collectors
```

**Key takeaway:** `stateIn` converts a cold flow to a hot `StateFlow`. `WhileSubscribed(5_000)` is the recommended strategy for Android UI because it survives configuration changes (~300ms) while stopping when the user truly navigates away. Always create `stateIn` once (in a property declaration or init block), not inside a getter.

### Lesson 5.4: shareIn — Converting Cold to Hot SharedFlow

`shareIn` converts a cold `Flow` into a `SharedFlow`. Unlike `stateIn`, the result has no mandatory initial value — its behavior depends on `replay`.

```kotlin
class AnalyticsViewModel(
    private val tracker: AnalyticsTracker
) : ViewModel() {

    val analyticsEvents: SharedFlow<AnalyticsEvent> =
        tracker.events()
            .shareIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                replay = 0  // No replay — events are ephemeral
            )
}
```

`shareIn` with `replay = 0` means new subscribers get nothing from the past — they only see events that happen after they start collecting. With `replay = 1`, the last event is cached and replayed. But unlike `stateIn`, there's no `initialValue` — if nothing has been emitted yet, new subscribers get nothing even with `replay = 1`.

**`shareIn` vs multiple collectors on a cold flow** — Without `shareIn`, each collector triggers an independent execution of the upstream flow. With `shareIn`, the upstream runs once and all collectors share the result:

```kotlin
// WITHOUT shareIn — upstream executes THREE times
val coldFlow = flow {
    println("Fetching data...")  // Prints 3 times
    emit(api.fetchData())
}

scope.launch { coldFlow.collect { } }  // Execution 1
scope.launch { coldFlow.collect { } }  // Execution 2
scope.launch { coldFlow.collect { } }  // Execution 3

// WITH shareIn — upstream executes ONCE
val sharedFlow = coldFlow.shareIn(scope, SharingStarted.Eagerly, replay = 1)

scope.launch { sharedFlow.collect { } }  // Shares execution
scope.launch { sharedFlow.collect { } }  // Shares execution
scope.launch { sharedFlow.collect { } }  // Shares execution
```

This is useful for expensive upstream operations (network calls, database queries) that shouldn't be repeated for each collector.

**When to use `shareIn` vs `stateIn`** — Use `stateIn` when you need a current value (UI state). Use `shareIn` when you need event distribution (analytics, navigation commands, one-time messages). The decision tree is simple:

```kotlin
// Does the data have a "current value" that makes sense at all times?
//   YES → stateIn (e.g., user profile, settings, list items)
//   NO → shareIn (e.g., click events, navigation commands, toasts)

// Do you need to read the value synchronously (without collecting)?
//   YES → stateIn (has .value property)
//   NO → shareIn (no .value property unless replay > 0)
```

**Common Mistakes**

A common mistake is using `shareIn` with `replay = 1` for navigation events. Like with SharedFlow, this causes duplicate navigation on configuration changes. Use `replay = 0` for events.

Another mistake is using `shareIn` when `stateIn` would be more appropriate. If your UI always needs a current value (even before any emission), use `stateIn` with an explicit `initialValue`.

**Key takeaway:** `shareIn` converts a cold flow to a hot `SharedFlow`. Use it for events where you don't need a current value. Use `stateIn` for state where you always need a value. `shareIn` is also useful for expensive upstream operations that shouldn't be repeated for each collector.

### Lesson 5.5: Collecting Safely in Android UI

Collecting flows in Android requires lifecycle awareness. Without it, you collect even when the app is in the background, wasting resources and potentially crashing. This lesson covers the correct patterns for both Views/Fragments and Compose.

```kotlin
// In Views/Fragments — use repeatOnLifecycle
viewLifecycleOwner.lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { state ->
            when (state) {
                ProfileState.Loading -> showLoading()
                is ProfileState.Success -> showProfile(state.profile)
                is ProfileState.Error -> showError(state.message)
            }
        }
    }
}

// In Compose — use collectAsStateWithLifecycle
@Composable
fun ProfileScreen(viewModel: ProfileViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    when (val current = state) {
        ProfileState.Loading -> LoadingIndicator()
        is ProfileState.Success -> ProfileContent(current.profile)
        is ProfileState.Error -> ErrorMessage(current.message)
    }
}
```

**How `repeatOnLifecycle` works** — `repeatOnLifecycle` is a suspend function that suspends until the lifecycle reaches the specified state, then starts a new coroutine to run the block. When the lifecycle drops below the specified state, the block's coroutine is cancelled. When the lifecycle reaches the state again, a new coroutine is started with a fresh execution of the block. This means your flow collection restarts on every lifecycle transition (e.g., every time the app comes back from the background).

```kotlin
// What repeatOnLifecycle does internally:
// 1. Suspend until lifecycle is STARTED
// 2. Launch a new coroutine running the block
// 3. When lifecycle goes below STARTED (e.g., app backgrounded):
//    - Cancel the block's coroutine (stops flow collection)
// 4. When lifecycle is STARTED again:
//    - Launch a new coroutine with the block
// 5. Repeat steps 2-4 until the lifecycle is DESTROYED
```

**`collectAsStateWithLifecycle` vs `collectAsState`** — `collectAsStateWithLifecycle()` stops collecting when the app goes to the background and restarts when foregrounded. Plain `collectAsState()` keeps collecting even when the UI isn't visible. This matters because background collection can trigger unnecessary network calls, database queries, and GPS readings.

```kotlin
// collectAsState — collects even in background
@Composable
fun BadScreen(viewModel: MyViewModel) {
    val state by viewModel.locationFlow.collectAsState(initial = null)
    // GPS keeps updating even when app is backgrounded
    // Wasting battery, processing data nobody sees
}

// collectAsStateWithLifecycle — stops in background
@Composable
fun GoodScreen(viewModel: MyViewModel) {
    val state by viewModel.locationFlow.collectAsStateWithLifecycle(initialValue = null)
    // GPS updates stop when app is backgrounded
    // Restarts when app returns to foreground
}
```

You can customize when collection starts and stops using `minActiveState`:

```kotlin
// Start collecting when RESUMED, stop when below RESUMED
val state by viewModel.state.collectAsStateWithLifecycle(
    minActiveState = Lifecycle.State.RESUMED
)

// This is more restrictive — collection pauses even during dialogs
// (Activity goes from RESUMED to STARTED when a dialog appears)
```

**Collecting multiple flows** — When you need to collect multiple flows in a Fragment, launch separate coroutines inside `repeatOnLifecycle`:

```kotlin
viewLifecycleOwner.lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        // Each flow gets its own coroutine
        launch {
            viewModel.state.collect { updateUI(it) }
        }
        launch {
            viewModel.events.collect { handleEvent(it) }
        }
        launch {
            viewModel.notifications.collect { showNotification(it) }
        }
    }
}
```

**The `flowWithLifecycle` alternative** — For cases where you need a lifecycle-aware flow in a chain (not at the terminal collection point), use `flowWithLifecycle`:

```kotlin
// flowWithLifecycle applies lifecycle awareness to a flow
viewModel.state
    .flowWithLifecycle(lifecycle, Lifecycle.State.STARTED)
    .onEach { state -> updateUI(state) }
    .launchIn(lifecycleScope)
```

**Common Mistakes**

A common mistake is collecting directly in `lifecycleScope.launch` without `repeatOnLifecycle`:

```kotlin
// WRONG — collects even when app is backgrounded
lifecycleScope.launch {
    viewModel.state.collect { updateUI(it) }
}

// CORRECT — stops and restarts with lifecycle
lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { updateUI(it) }
    }
}
```

Another mistake is using `launchWhenStarted` (which is deprecated):

```kotlin
// DEPRECATED — suspends collection but doesn't cancel it
lifecycleScope.launchWhenStarted {
    viewModel.state.collect { }  // Pauses but keeps upstream alive
}

// CORRECT — cancels and restarts collection
lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { }
    }
}
```

**Key takeaway:** Always use `collectAsStateWithLifecycle()` in Compose and `repeatOnLifecycle` in Views. They stop collection when the app isn't visible, preventing unnecessary work and potential crashes. Never collect flows directly in `lifecycleScope.launch` without lifecycle awareness.
### Quiz: StateFlow, SharedFlow, and Hot Streams

#### What is the fundamental difference between `stateIn` and `shareIn`?

- ❌ `stateIn` is faster than `shareIn`
- ❌ `stateIn` supports multiple collectors; `shareIn` does not
- ✅ `stateIn` produces a `StateFlow` with a mandatory initial value; `shareIn` produces a `SharedFlow` without one
- ❌ `stateIn` works with `Dispatchers.Main`; `shareIn` requires `Dispatchers.IO`

> **Explanation:** `stateIn` converts to `StateFlow`, which always has a current value (provided by `initialValue`). `shareIn` converts to `SharedFlow`, which has no mandatory value — behavior depends on the `replay` parameter.

#### Why does `WhileSubscribed(5_000)` use a 5-second stop timeout?

- ❌ It takes 5 seconds for the garbage collector to reclaim the flow
- ✅ It survives configuration changes like rotation (~300ms) without restarting the upstream flow
- ❌ It's the maximum time Android allows background work
- ❌ It matches the default ANR timeout

> **Explanation:** Screen rotation destroys and recreates the Activity/Fragment in about 300ms. The 5-second timeout keeps the upstream flow alive during this transition, avoiding an unnecessary restart. When the user truly navigates away, the flow stops after 5 seconds.

#### Why should you use `collectAsStateWithLifecycle()` instead of `collectAsState()` in Compose?

- ❌ `collectAsState()` causes compilation errors in Jetpack Compose
- ❌ `collectAsStateWithLifecycle()` is faster
- ✅ `collectAsStateWithLifecycle()` stops collecting when the app is backgrounded, saving resources
- ❌ `collectAsState()` doesn't support `StateFlow`

> **Explanation:** `collectAsStateWithLifecycle()` respects the Android lifecycle — it stops collection when the app goes to the background and restarts when foregrounded. Plain `collectAsState()` keeps collecting even when the UI isn't visible, wasting resources and potentially triggering unnecessary work.

### Coding Challenge: Multi-Source Dashboard State

Create a `DashboardViewModel` that combines three data sources — user profile, notification count, and network status — into a single `StateFlow<DashboardState>`. Use `combine` and `stateIn`. Each source should be observed as a `Flow` from its respective repository.

#### Solution

```kotlin
sealed class DashboardState {
    object Loading : DashboardState()
    data class Ready(
        val user: User,
        val notificationCount: Int,
        val isOnline: Boolean
    ) : DashboardState()
}

class DashboardViewModel(
    userRepository: UserRepository,
    notificationRepository: NotificationRepository,
    networkMonitor: NetworkMonitor
) : ViewModel() {

    val state: StateFlow<DashboardState> = combine(
        userRepository.observeCurrentUser(),
        notificationRepository.observeUnreadCount(),
        networkMonitor.isOnline
    ) { user, count, online ->
        DashboardState.Ready(user, count, online)
    }
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = DashboardState.Loading
    )
}
```

`combine` re-emits whenever any source produces a new value, always using the latest value from all sources. `stateIn` converts the cold combined flow into a hot `StateFlow` with `Loading` as the initial value. `WhileSubscribed(5_000)` stops all three upstream flows 5 seconds after the last subscriber leaves.

---

## Module 6: Channels, Backpressure, and callbackFlow

Channels are the low-level primitive that Flows are built on top of. Understanding them gives you the tools for concurrent emission, callback-based API integration, and backpressure management.

### Lesson 6.1: Channel Basics

A Channel is like a `BlockingQueue` but with suspending operations instead of blocking ones. It's a hot stream for communication between coroutines — values are sent and received, not emitted and collected. Channels are the fundamental building block that powers many Flow operators internally, including `buffer`, `flowOn`, `channelFlow`, and `callbackFlow`.

```kotlin
val channel = Channel<Int>()

// Producer
launch {
    for (i in 1..5) {
        channel.send(i)  // Suspends if buffer is full
    }
    channel.close()
}

// Consumer
launch {
    for (value in channel) {  // Iterates until closed
        println(value)
    }
}
```

Channels are fundamentally different from Flows. A channel has a single stream of values that is consumed — once a value is received, it's gone. Multiple receivers share the channel in fan-out fashion (each value goes to exactly one receiver). Flows, by contrast, give each collector its own independent stream.

**How channels work internally** — A channel maintains an internal buffer (or rendevouz point) and two queues: a queue of waiting senders and a queue of waiting receivers. When `send` is called: if a receiver is waiting, the value is transferred directly (fast path). If no receiver is waiting and the buffer isn't full, the value goes into the buffer. If the buffer is full, the sender is suspended and placed in the sender queue. `receive` works symmetrically.

```kotlin
// Channel is a point-to-point primitive
// Value goes to ONE receiver only
val channel = Channel<Int>()

launch { channel.send(1) }
launch { channel.send(2) }
launch { channel.send(3) }

// Only ONE of these receives each value:
launch { println("A: ${channel.receive()}") }  // Gets 1
launch { println("B: ${channel.receive()}") }  // Gets 2
launch { println("C: ${channel.receive()}") }  // Gets 3
// Each value is consumed by exactly one receiver
```

**Channel vs Flow — when to use which**

```kotlin
// Use Flow when:
// - You want each collector to get all values independently
// - You're building a data pipeline with operators
// - You want lifecycle-aware collection
// - The producer doesn't need to know about the consumer

// Use Channel when:
// - You need point-to-point communication (one sender, one receiver)
// - You need fan-out work distribution (one sender, multiple workers)
// - You need fan-in aggregation (multiple senders, one receiver)
// - You're bridging callback APIs (callbackFlow uses channels internally)
```

**Closing channels** — Always close channels when done sending. Failing to close a channel means receivers will suspend forever waiting for more values. The `for` loop on a channel naturally terminates when the channel is closed:

```kotlin
val channel = Channel<Int>()

launch {
    repeat(5) { channel.send(it) }
    channel.close()  // Signal that no more values will be sent
}

launch {
    for (value in channel) {
        // Iterates through 0, 1, 2, 3, 4
        // Loop ends when channel is closed
    }
    println("Channel closed, done processing")
}
```

**Common Mistakes**

A common mistake is forgetting to close channels, which causes receiver coroutines to hang indefinitely. Always use `produce` (which auto-closes) or explicitly call `channel.close()` in a `finally` block.

Another mistake is using channels when a Flow would be simpler. Channels are low-level — they require manual lifecycle management. Flows handle cleanup automatically through structured concurrency.

**Key takeaway:** Channels provide point-to-point communication between coroutines. Each value is consumed by exactly one receiver. Always close channels when done to prevent resource leaks. Prefer Flows for most use cases — use channels only when you need point-to-point communication, fan-out, or fan-in patterns.

### Lesson 6.2: Channel Types and Buffering

The channel's capacity determines how send and receive interact. Choosing the right capacity is crucial for performance and correctness:

```kotlin
// Rendezvous — no buffer (default)
val rendezvous = Channel<Int>()  // send suspends until receive

// Buffered — fixed buffer
val buffered = Channel<Int>(capacity = 10)  // send suspends when 10 items buffered

// Conflated — keeps only the latest value
val conflated = Channel<Int>(Channel.CONFLATED)  // send never suspends

// Unlimited — never suspends on send (dangerous)
val unlimited = Channel<Int>(Channel.UNLIMITED)  // Risk of OutOfMemoryError

// Buffered with default capacity (64 elements)
val defaultBuffered = Channel<Int>(Channel.BUFFERED)
```

**Rendezvous** creates tight synchronization — the sender waits for a receiver and vice versa. This is the default and the safest option. It guarantees that no values are buffered — every `send` is matched with a `receive` in real-time. This is useful when you need strict producer-consumer synchronization.

```kotlin
// Rendezvous: strict handoff
val channel = Channel<Int>()  // Rendezvous by default

launch {
    println("Sending 1...")
    channel.send(1)    // Suspends until receive() is called
    println("Sent 1")  // Only prints after someone received
}

launch {
    delay(1000)
    println("Receiving...")
    val value = channel.receive()  // Gets 1
    println("Received $value")
}
// Output:
// Sending 1...
// (1 second pause)
// Receiving...
// Sent 1
// Received 1
```

**Buffered channels** decouple the producer from the consumer up to the buffer capacity. `Channel.BUFFERED` uses the system default of 64 elements. When the buffer is full, `send` suspends until space opens up.

```kotlin
// Buffered: producer can run ahead of consumer
val channel = Channel<Int>(capacity = 3)

launch {
    for (i in 1..5) {
        println("Sending $i")
        channel.send(i)  // First 3 don't suspend (buffer space)
        println("Sent $i")
    }
    channel.close()
}

launch {
    delay(1000)  // Consumer starts late
    for (value in channel) {
        println("Received $value")
        delay(500)
    }
}
// Sends 1, 2, 3 immediately (buffered)
// Send 4 suspends until consumer receives 1
```

**Conflated channels** keep only the latest value. If a new value is sent before the previous one is received, the old value is dropped. This is ideal for UI updates where only the current state matters.

```kotlin
// Conflated: always the latest value
val channel = Channel<Int>(Channel.CONFLATED)

launch {
    channel.send(1)  // Stored
    channel.send(2)  // Replaces 1
    channel.send(3)  // Replaces 2
}

launch {
    delay(100)
    println(channel.receive())  // Gets 3 (latest)
}
```

**Unlimited channels** never suspend on send, buffering everything in memory. This is risky — if the producer is faster than the consumer, you get unbounded memory growth and eventually `OutOfMemoryError`. Use only when the total number of values is known and bounded.

**`trySend` and `tryReceive`** — Non-suspending channel operations for use outside of coroutines:

```kotlin
val channel = Channel<Int>(capacity = 10)

// trySend — non-suspending, returns ChannelResult
val result = channel.trySend(42)
if (result.isSuccess) {
    println("Sent successfully")
} else {
    println("Channel full or closed")
}

// tryReceive — non-suspending
val received = channel.tryReceive()
if (received.isSuccess) {
    println("Got: ${received.getOrNull()}")
} else {
    println("Channel empty or closed")
}
```

**Common Mistakes**

A common mistake is using `Channel.UNLIMITED` "just to be safe." While it prevents `send` from suspending, it trades one problem (backpressure) for a worse one (unbounded memory growth). Always prefer bounded buffers with explicit overflow handling.

**Key takeaway:** Choose the right channel type. Rendezvous for synchronization, buffered for producer-consumer decoupling, conflated for UI updates, and never use unlimited unless you're certain about bounds. The buffer capacity determines the decoupling between sender and receiver.

### Lesson 6.3: produce Builder and Fan-Out

The `produce` builder creates a channel-backed coroutine that automatically closes the channel when the coroutine completes. This is the structured concurrency version of channels — the channel is tied to the coroutine's lifecycle.

```kotlin
fun CoroutineScope.produceNumbers(): ReceiveChannel<Int> = produce {
    var x = 1
    while (true) {
        send(x++)
        delay(100)
    }
}

// Fan-out — multiple consumers share one channel
val producer = produceNumbers()
repeat(3) { consumerId ->
    launch {
        for (msg in producer) {
            println("Consumer $consumerId received $msg")
        }
    }
}
```

Fan-out distributes values across consumers automatically. Each value goes to exactly one consumer. This is useful for work distribution — imagine processing uploaded images across multiple worker coroutines.

**How fan-out distribution works** — When multiple coroutines call `receive()` on the same channel, they compete for values. The channel internally maintains a queue of waiting receivers. When a value is sent, the first waiting receiver gets it. This creates an automatic load balancing effect — faster consumers process more values.

```kotlin
// Fan-out work distribution
fun CoroutineScope.processImages(images: ReceiveChannel<Image>) {
    repeat(4) { workerId ->
        launch {
            for (image in images) {
                println("Worker $workerId processing ${image.id}")
                val thumbnail = generateThumbnail(image)
                saveThumbnail(thumbnail)
            }
        }
    }
}

// Usage
val images = produce {
    for (image in imageList) {
        send(image)
    }
}
processImages(images)
// 4 workers share the workload automatically
// Faster workers process more images
```

Fan-in is the reverse — multiple producers send to a single channel:

```kotlin
val channel = Channel<String>()

// Multiple producers
launch { repeat(5) { channel.send("Producer A: $it"); delay(100) } }
launch { repeat(5) { channel.send("Producer B: $it"); delay(150) } }

// Single consumer
launch {
    repeat(10) {
        println(channel.receive())
    }
}
```

**Fan-in for merging data sources** — Fan-in is useful when you have multiple data sources that should be processed by a single consumer:

```kotlin
// Merge multiple event sources into one channel
fun CoroutineScope.mergeEvents(
    clicks: ReceiveChannel<ClickEvent>,
    scrolls: ReceiveChannel<ScrollEvent>,
    gestures: ReceiveChannel<GestureEvent>
): ReceiveChannel<UiEvent> = produce {
    launch { for (e in clicks) send(UiEvent.Click(e)) }
    launch { for (e in scrolls) send(UiEvent.Scroll(e)) }
    launch { for (e in gestures) send(UiEvent.Gesture(e)) }
}
```

**The `produce` builder vs manual Channel** — `produce` is always preferred over manually creating channels because it provides automatic cleanup:

```kotlin
// MANUAL — must close explicitly, easy to forget
val channel = Channel<Int>()
launch {
    try {
        repeat(10) { channel.send(it) }
    } finally {
        channel.close()  // Must remember to close
    }
}

// PRODUCE — closes automatically when coroutine completes or is cancelled
val channel = produce {
    repeat(10) { send(it) }
    // Channel closes automatically here
}
```

**Common Mistakes**

A common mistake is assuming fan-out maintains order. Since values go to whichever consumer is ready first, the processing order is non-deterministic. If order matters, use a single consumer.

**Key takeaway:** Use `produce` for structured channel creation — the channel closes automatically. Fan-out distributes work across multiple consumers. Fan-in merges multiple producers into one stream. Always prefer `produce` over manual channel creation for automatic cleanup.

### Lesson 6.4: callbackFlow — Bridging Callback APIs

`callbackFlow` converts multi-shot callback APIs to cold Flows. It's built on channels internally, giving you a `ProducerScope` where you can call `send()`, `trySend()`, or `trySendBlocking()`. This is the standard way to integrate callback-based Android APIs (sensors, location, Firebase, etc.) with the Flow ecosystem.

```kotlin
fun observeConnectivity(context: Context): Flow<Boolean> = callbackFlow {
    val manager = context.getSystemService<ConnectivityManager>()
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { trySend(true) }
        override fun onLost(network: Network) { trySend(false) }
    }

    val request = NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()

    manager?.registerNetworkCallback(request, callback)

    awaitClose {
        manager?.unregisterNetworkCallback(callback)
    }
}
```

The `awaitClose` block is critical — it suspends until the flow collector is cancelled, then runs the cleanup code. Without it, the flow would complete immediately and the callback would never fire. This is because `callbackFlow` creates a coroutine scope, and if the coroutine body completes without suspending, the flow ends. `awaitClose` is the suspension point that keeps the flow alive.

For callbacks that might fire faster than the collector can process:

```kotlin
fun flowFrom(api: CallbackBasedApi): Flow<T> = callbackFlow {
    val callback = object : Callback {
        override fun onNextValue(value: T) {
            // trySendBlocking blocks the callback thread if channel is full
            trySendBlocking(value)
                .onFailure { throwable ->
                    // Downstream has been cancelled or failed
                }
        }
        override fun onApiError(cause: Throwable) {
            cancel(CancellationException("API Error", cause))
        }
        override fun onCompleted() = channel.close()
    }
    api.register(callback)
    awaitClose { api.unregister(callback) }
}.buffer(Channel.CONFLATED)  // Keep only latest if collector is slow
```

**trySend vs trySendBlocking vs send** — `trySend` is non-suspending and non-blocking; it returns immediately with success or failure. Use it in callbacks that run on threads you don't control. `trySendBlocking` blocks the calling thread until the channel has space — use it when blocking the callback thread is acceptable. `send` suspends (only usable from coroutines).

```kotlin
// trySend — best for most callbacks
// Non-blocking, returns immediately
// If channel is full, returns ChannelResult.failure
callbackFlow {
    val callback = Callback { value ->
        trySend(value)  // Returns immediately
    }
}

// trySendBlocking — when you must not lose values
// Blocks the thread until channel has space
// Use when the callback thread can afford to block
callbackFlow {
    val callback = Callback { value ->
        trySendBlocking(value)  // Blocks until channel accepts
            .onFailure { log("Failed to send: $it") }
    }
}

// send — only from coroutines
// Suspends until channel has space
callbackFlow {
    launch {
        while (true) {
            val data = api.poll()
            send(data)  // Suspends if channel is full
            delay(1000)
        }
    }
    awaitClose { }
}
```

**callbackFlow vs channelFlow** — `callbackFlow` is specifically designed for callback APIs. It requires `awaitClose` to signal that the flow should stay active. `channelFlow` is the general-purpose version for when you need concurrent emission from multiple coroutines:

```kotlin
fun mergedData(): Flow<Data> = channelFlow {
    launch { source1.collect { send(it) } }
    launch { source2.collect { send(it) } }
}
```

**Real-world examples of callbackFlow:**

```kotlin
// Firebase Firestore real-time listener
fun observeDocument(docRef: DocumentReference): Flow<DocumentSnapshot> = callbackFlow {
    val listener = docRef.addSnapshotListener { snapshot, error ->
        if (error != null) {
            cancel(CancellationException("Firestore error", error))
            return@addSnapshotListener
        }
        if (snapshot != null) {
            trySend(snapshot)
        }
    }
    awaitClose { listener.remove() }
}

// Sensor data
fun observeAccelerometer(context: Context): Flow<SensorEvent> = callbackFlow {
    val sensorManager = context.getSystemService<SensorManager>()
    val accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    val listener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            trySend(event)
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    sensorManager?.registerListener(listener, accelerometer, SensorManager.SENSOR_DELAY_UI)
    awaitClose { sensorManager?.unregisterListener(listener) }
}.conflate()  // Keep only latest sensor reading
```

**Common Mistakes**

The most common mistake is forgetting `awaitClose`. Without it, the callbackFlow body completes immediately, the flow ends, and your callback is never invoked (and never cleaned up). Always include `awaitClose` even if you don't need cleanup — use `awaitClose { }` with an empty block.

Another mistake is calling `send` (suspending) from a callback thread. Callbacks typically run on threads that aren't coroutines, so `send` can't be used. Use `trySend` instead.

**Key takeaway:** `callbackFlow` bridges callback-based APIs to Flow. Always call `awaitClose` to clean up resources. Use `trySend` for non-blocking emission from callbacks. Use `channelFlow` when you need concurrent emission from multiple coroutines. Add `conflate()` or `buffer()` for high-frequency callbacks.

### Lesson 6.5: Backpressure Strategies

Backpressure occurs when data is emitted faster than it can be processed. In Kotlin Flows, the default behavior is suspension — the producer suspends until the collector is ready. But you can configure different strategies based on your use case.

Understanding backpressure is critical for production apps. Without proper handling, a fast producer can cause memory growth (if buffered without limits), data loss (if dropped without tracking), or processing delays (if suspended for too long).

```kotlin
// buffer — decouple producer and collector with a buffer
val bufferedFlow = fastProducer
    .buffer(capacity = 50, onBufferOverflow = BufferOverflow.SUSPEND)
    .collect { slowProcess(it) }

// conflate — keep only the latest value, skip intermediate
val conflatedFlow = sensorFlow
    .conflate()  // Equivalent to buffer(1, DROP_OLDEST)
    .collect { updateUI(it) }

// collectLatest — cancel previous collection when new value arrives
val latestFlow = searchResults
    .collectLatest { results ->
        // If a new emission arrives while processing,
        // this block is cancelled and restarted with the new value
        val rendered = renderResults(results)
        updateUI(rendered)
    }
```

**How each strategy handles a fast producer (10 items/sec) with a slow consumer (1 item/sec):**

```kotlin
// 1. No strategy (default) — producer slows down to consumer's pace
//    Processed: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
//    Time: 10 seconds (producer runs at consumer speed)
//    Memory: O(1) — no buffering

// 2. buffer(5) — producer runs ahead by 5 items
//    Processed: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
//    Time: 10 seconds (same, just producer runs ahead initially)
//    Memory: O(5) — buffer of 5 items

// 3. conflate() — consumer always gets the latest
//    Processed: 1, 10 (intermediate values skipped)
//    Time: 2 seconds
//    Memory: O(1) — single-slot buffer

// 4. collectLatest — previous processing cancelled
//    Processed: 10 (only the last one completes)
//    Time: 1 second
//    Memory: O(1)
```

**buffer overflow strategies** — When a fixed-size buffer is full:

```kotlin
// SUSPEND (default) — producer suspends until space opens
flow.buffer(capacity = 10, BufferOverflow.SUSPEND)

// DROP_OLDEST — remove oldest value to make room for new one
flow.buffer(capacity = 10, BufferOverflow.DROP_OLDEST)

// DROP_LATEST — discard the new value when buffer is full
flow.buffer(capacity = 10, BufferOverflow.DROP_LATEST)
```

**`collectLatest` for UI rendering** — `collectLatest` is the ideal strategy for UI updates. When new data arrives while the UI is still rendering the previous data, the old rendering is cancelled and restarted with the new data:

```kotlin
viewModel.searchResults.collectLatest { results ->
    // This block is cancelled and restarted when new results arrive
    val processedResults = withContext(Dispatchers.Default) {
        results.map { enrichResult(it) }  // Heavy processing
    }
    adapter.submitList(processedResults)
    // If new results arrived during processing, this line never executes
    // The block restarts with the new results
}
```

**Common pitfalls:**

```kotlin
// Deadlock from circular channel dependencies
val channelA = Channel<Int>()
val channelB = Channel<Int>()
launch { channelA.send(channelB.receive()) }  // Waits for B
launch { channelB.send(channelA.receive()) }  // Waits for A — deadlock

// Memory leak from unlimited buffers
flow.buffer(Channel.UNLIMITED)  // Never suspends producer, unbounded memory

// Thread starvation from heavy computation on limited dispatcher
flow.flowOn(Dispatchers.Default)  // Default has only CPU-count threads
    .collect { heavyComputation(it) }  // Blocks all Default threads
```

**Real-world backpressure: analytics event batching**

```kotlin
// Batch analytics events: send every 50 events or every 5 seconds
fun observeAnalytics(events: Flow<AnalyticsEvent>): Flow<List<AnalyticsEvent>> =
    channelFlow {
        val buffer = mutableListOf<AnalyticsEvent>()
        val mutex = Mutex()
        var flushJob: Job? = null

        events.collect { event ->
            mutex.withLock {
                buffer.add(event)
                if (buffer.size >= 50) {
                    send(buffer.toList())
                    buffer.clear()
                    flushJob?.cancel()
                }
            }

            if (flushJob?.isActive != true) {
                flushJob = launch {
                    delay(5000)
                    mutex.withLock {
                        if (buffer.isNotEmpty()) {
                            send(buffer.toList())
                            buffer.clear()
                        }
                    }
                }
            }
        }
    }
```

**Key takeaway:** Use `buffer` to decouple fast producers from slow collectors. `conflate` keeps only the latest value (O(1) memory). `collectLatest` cancels previous processing when new data arrives. Always use bounded buffers in production. Choose the strategy based on whether you can afford to lose intermediate values.

### Lesson 6.6: Flow Internals — How Flow Uses Channels

Understanding that Flow operators like `buffer` and `flowOn` create channels internally helps you reason about performance and behavior. This knowledge is essential for optimizing flow pipelines and avoiding unexpected overhead.

When you call `flowOn(Dispatchers.IO)`, the library creates a channel between the upstream (running on IO) and the downstream (running on the collector's dispatcher). Values flow through this channel, which adds a small overhead but enables safe context switching.

When you call `buffer(50)`, a buffered channel of capacity 50 is created between the producer and consumer. The producer fills the buffer without waiting for the consumer, and the consumer drains it at its own pace.

`conflate()` is shorthand for `buffer(1, BufferOverflow.DROP_OLDEST)` — it creates a single-slot channel that always keeps the latest value.

```kotlin
// This chain creates two internal channels:
val result = sourceFlow
    .flowOn(Dispatchers.IO)     // Channel 1: IO -> collector's dispatcher
    .buffer(10)                  // Channel 2: 10-element buffer
    .collect { process(it) }

// Minimizing channel creation:
val optimized = sourceFlow
    .buffer(10)                  // Buffer before flowOn uses one channel
    .flowOn(Dispatchers.IO)      // flowOn fuses with the buffer
    .collect { process(it) }
```

When `flowOn` is placed after `buffer`, the library fuses them into a single channel with the specified capacity running on the specified dispatcher. This is a performance optimization — fewer channels means less overhead.

**How fusion works** — The flow library implements an optimization called "operator fusion." When certain operators are adjacent in the pipeline, they can be merged into a single operation instead of creating separate channels. The key fusion rules:

```kotlin
// These pairs FUSE into a single channel:
flow.buffer(10).flowOn(Dispatchers.IO)
// → Single buffered channel (capacity 10) on IO dispatcher

flow.flowOn(Dispatchers.IO).buffer(10)
// → Two channels (cannot fuse in this order)

flow.conflate().flowOn(Dispatchers.IO)
// → Single conflated channel on IO dispatcher

// Multiple buffers do NOT fuse:
flow.buffer(10).buffer(20)
// → Two channels (10 + 20 = potential for 30 values in flight)
```

**Counting channels in a pipeline** — To estimate memory usage and overhead, count the channels:

```kotlin
// Complex pipeline — how many channels?
val result = databaseFlow
    .map { transform(it) }        // No channel (inline transformation)
    .filter { it.isValid }         // No channel (inline check)
    .flowOn(Dispatchers.Default)   // Channel 1: Default -> collector
    .onEach { log(it) }           // No channel
    .buffer(20)                    // Channel 2: 20-element buffer
    .collect { display(it) }
// Total: 2 channels

// Optimized version:
val optimized = databaseFlow
    .map { transform(it) }
    .filter { it.isValid }
    .buffer(20)                    // Buffer BEFORE flowOn
    .flowOn(Dispatchers.Default)   // Fuses with buffer — Channel 1
    .onEach { log(it) }
    .collect { display(it) }
// Total: 1 channel (fused)
```

**Performance characteristics of channels** — Each channel adds overhead: memory for the buffer array, synchronization for concurrent access, and context switches for cross-thread communication. For most apps, this overhead is negligible. But in high-throughput scenarios (thousands of events per second), minimizing channels matters.

```kotlin
// Measuring flow pipeline overhead
val baseline = measureTimeMillis {
    (1..1_000_000).asFlow()
        .collect { }
}
// ~100ms — no operators, minimal overhead

val withOperators = measureTimeMillis {
    (1..1_000_000).asFlow()
        .map { it * 2 }
        .filter { it % 3 == 0 }
        .collect { }
}
// ~200ms — inline operators, no channels

val withChannel = measureTimeMillis {
    (1..1_000_000).asFlow()
        .buffer(64)
        .collect { }
}
// ~500ms — channel overhead for 1M values
```

**Common Mistakes**

A common mistake is adding unnecessary `buffer` operators thinking they improve performance. Without understanding the pipeline, extra buffers add overhead (channel creation, memory) without benefit. Profile before adding buffers.

Another mistake is not realizing that `flowOn` creates a channel. If you call `flowOn` multiple times with different dispatchers, each one creates a channel:

```kotlin
// THREE channels — probably unnecessary
flow
    .flowOn(Dispatchers.IO)
    .map { process(it) }
    .flowOn(Dispatchers.Default)
    .filter { it.isValid }
    .flowOn(Dispatchers.IO)
    .collect { }
```

**Key takeaway:** `flowOn` and `buffer` create internal channels. Place `buffer` before `flowOn` to enable fusion and reduce overhead. Understanding the channel-based internals helps you reason about memory usage and performance. Count channels in your pipeline and minimize unnecessary ones.
### Quiz: Channels, Backpressure, and callbackFlow

#### What is the default channel type when you create `Channel<Int>()`?

- ❌ Buffered with capacity 10
- ❌ Conflated — keeps only the latest value
- ✅ Rendezvous — no buffer, `send` suspends until a receiver is ready
- ❌ Unlimited — never suspends on send

> **Explanation:** The default channel is a rendezvous channel with zero buffer capacity. The sender suspends until a receiver calls `receive()`, and vice versa. This creates tight synchronization between producer and consumer.

#### Why must you always call `awaitClose` in a `callbackFlow`?

- ❌ It's required by the compiler — code won't compile without it
- ✅ Without it, the flow completes immediately and the callback is never cleaned up
- ❌ It prevents `OutOfMemoryError` from the internal channel
- ❌ It's only needed for performance optimization

> **Explanation:** `awaitClose` suspends the `callbackFlow` coroutine until the collector cancels. Without it, the coroutine body completes immediately, the flow ends, and the registered callback is never unregistered — causing resource leaks.

#### When would you use `collectLatest` instead of `collect`?

- ❌ When you need to process every single emission
- ✅ When new emissions should cancel any in-progress processing of previous emissions
- ❌ When the collector is faster than the producer
- ❌ When you want to buffer all values

> **Explanation:** `collectLatest` cancels the previous collection block when a new value arrives. This is ideal for UI rendering — if new search results arrive while you're still rendering the old ones, cancel the old rendering and start with the new data.

### Coding Challenge: Callback-to-Flow Bridge

Write a `callbackFlow` that observes location updates from a `LocationProvider` that has `startUpdates(listener)` and `stopUpdates()` methods. The listener receives `Location` objects. Buffer with conflation so the UI always gets the latest location.

#### Solution

```kotlin
fun observeLocation(provider: LocationProvider): Flow<Location> = callbackFlow {
    val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            trySend(location)
        }

        override fun onProviderDisabled() {
            close(LocationUnavailableException("Provider disabled"))
        }
    }

    provider.startUpdates(listener)

    awaitClose {
        provider.stopUpdates()
    }
}
.conflate()  // Keep only the latest location

// Usage in ViewModel
class MapViewModel(locationProvider: LocationProvider) : ViewModel() {
    val currentLocation: StateFlow<Location?> = observeLocation(locationProvider)
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = null
        )
}
```

`callbackFlow` bridges the callback API to a Flow. `trySend` is used because the callback runs on the location provider's thread, not a coroutine. `awaitClose` ensures `stopUpdates()` is called when the flow is cancelled. `conflate()` ensures the UI always gets the latest location without processing every intermediate update.

---

## Module 7: Error Handling in Flows

Exception handling in flows has its own rules, distinct from both regular Kotlin and coroutine-level exception handling. Getting it right is essential for building resilient data pipelines.

### Lesson 7.1: catch Operator — Upstream Only

The `catch` operator intercepts exceptions from upstream operators — everything declared above it in the chain. It does NOT catch exceptions from `collect` or operators below it. This directional behavior is the most important thing to understand about flow error handling.

```kotlin
// catch handles upstream errors
val safeFlow = dataFlow
    .map { processData(it) }      // If this throws...
    .catch { e ->                   // ...catch intercepts it here
        log("Error: ${e.message}")
        emit(DataState.Error(e))   // Emit a fallback value
    }
    .collect { data ->
        updateUI(data)              // If THIS throws, catch does NOT intercept
    }

// To handle collect errors, use try-catch around the entire collection
try {
    dataFlow
        .catch { e -> emit(fallback) }
        .collect { data -> updateUI(data) }
} catch (e: Exception) {
    // Handles exceptions from collect
    showError(e)
}
```

**Why `catch` is upstream-only** — This design is intentional. `catch` is a flow operator — it creates a new flow that wraps the upstream. When an upstream exception occurs, `catch` intercepts it and optionally emits fallback values. But operators below `catch` (including `collect`) are downstream — they're the "consumer" of the `catch` operator's output. `catch` can't control what the consumer does with the values it emits.

```kotlin
// How catch works internally (simplified):
fun <T> Flow<T>.catch(action: suspend FlowCollector<T>.(Throwable) -> Unit): Flow<T> = flow {
    try {
        collect { value ->
            emit(value)  // Pass through upstream values
        }
    } catch (e: Throwable) {
        // Only catches exceptions from upstream collect
        action(e)  // Run the catch handler (can emit fallback values)
    }
}
```

`catch` can also emit values — this is how you provide fallbacks. When an exception is caught, the upstream flow is cancelled, but the downstream continues with whatever `catch` emits.

```kotlin
// Pattern: emit error state on failure, continue the flow
fun observeOrders(): Flow<OrderState> = repository
    .getOrders()
    .map { OrderState.Success(it) as OrderState }
    .onStart { emit(OrderState.Loading) }
    .catch { e -> emit(OrderState.Error(e.message)) }
```

**Multiple `catch` operators** — You can chain multiple `catch` operators, each handling a different section of the pipeline:

```kotlin
val result = sourceFlow
    .map { riskyTransform1(it) }
    .catch { e ->
        log("Transform 1 failed: $e")
        emit(defaultValue1)  // Fallback for transform 1
    }
    .map { riskyTransform2(it) }
    .catch { e ->
        log("Transform 2 failed: $e")
        emit(defaultValue2)  // Fallback for transform 2
    }
    .collect { finalResult -> process(finalResult) }
```

Each `catch` only catches exceptions from the operators above it (up to the previous `catch`). This gives you fine-grained control over error handling in different stages of the pipeline.

**Pattern: moving collect into onEach** — A common pattern to make `catch` handle all errors (including what would be "collect" errors) is to move the collection logic into `onEach`:

```kotlin
// Instead of this (catch doesn't handle collect errors):
dataFlow
    .catch { emit(fallback) }
    .collect { updateUI(it) }  // Errors here not caught

// Do this (catch handles everything):
dataFlow
    .onEach { updateUI(it) }  // Now part of the "upstream" for catch
    .catch { emit(fallback) }
    .collect()  // Empty collect — just triggers the pipeline
```

**Common Mistakes**

A common mistake is placing `catch` after `collect`, which doesn't compile because `collect` is a terminal operator. Another mistake is thinking `catch` prevents the flow from completing — it doesn't. After `catch` handles an exception, the upstream flow is cancelled. Any values emitted by `catch` are the last values the downstream receives.

```kotlin
// MISCONCEPTION: catch keeps the flow running
flow {
    emit(1)
    emit(2)
    throw IOException("fail")
    emit(3)  // Never executed
}
.catch { e ->
    emit(-1)  // Fallback value
    // The flow is DONE after catch. emit(3) above never runs.
}
.collect { println(it) }
// Output: 1, 2, -1 (not 3)
```

**Key takeaway:** `catch` only catches upstream errors. Errors in `collect` or downstream operators are not caught. Use try-catch around `collect` for downstream error handling. Use `onEach` instead of `collect` body to make errors catchable by `catch`. After `catch` handles an exception, the upstream flow is cancelled.

### Lesson 7.2: retry and retryWhen — Automatic Recovery

`retry` re-executes the entire upstream flow when an exception occurs. The predicate function receives the exception and returns `true` to retry or `false` to propagate. This is the primary mechanism for handling transient failures like network timeouts and intermittent server errors.

```kotlin
val resilientFlow = api.observeData()
    .retry(retries = 3) { cause ->
        if (cause is IOException) {
            delay(1000)  // Wait before retry
            true         // Retry
        } else {
            false        // Don't retry non-IO exceptions
        }
    }
    .catch { e -> emit(DataState.Error(e.message)) }
```

**How `retry` works internally** — When an upstream exception occurs, `retry` catches it, checks the predicate, and if `true`, re-collects the entire upstream flow from scratch. This means the `flow { }` builder re-executes completely — including any side effects like network calls or database queries.

```kotlin
// Visualizing retry behavior:
var attempt = 0
val flow = flow {
    attempt++
    println("Attempt $attempt")
    if (attempt < 3) throw IOException("Transient failure")
    emit("Success")
}
.retry(3) { it is IOException }
.collect { println(it) }

// Output:
// Attempt 1 (throws IOException, retry)
// Attempt 2 (throws IOException, retry)
// Attempt 3 (succeeds)
// Success
```

For exponential backoff:

```kotlin
fun fetchDataFlow(): Flow<DataState> = flow {
    emit(DataState.Loading)
    val result = api.fetchData()
    emit(DataState.Success(result))
}.let { upstream ->
    var attempt = 0
    upstream.retry(retries = 3) { cause ->
        if (cause is IOException) {
            delay(1000L * (1 shl attempt))  // 1s, 2s, 4s
            attempt++
            true
        } else false
    }
}
.catch { e -> emit(DataState.Error(e.message)) }
.onEach { state -> log("State: $state") }
```

`retryWhen` gives you more control — it receives both the exception and the current attempt count:

```kotlin
val retryingFlow = dataFlow
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000L * (attempt + 1))  // Linear backoff
            true
        } else {
            false
        }
    }
```

**Production retry strategies** — In real apps, different types of failures need different retry strategies:

```kotlin
// Reusable retry extension with jitter
fun <T> Flow<T>.retryWithBackoff(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 30000,
    factor: Double = 2.0
): Flow<T> = retryWhen { cause, attempt ->
    if (cause is IOException && attempt < maxRetries) {
        val baseDelay = (initialDelayMs * factor.pow(attempt.toDouble())).toLong()
        val jitter = Random.nextLong(0, baseDelay / 2)  // Add randomness
        val delay = (baseDelay + jitter).coerceAtMost(maxDelayMs)
        log("Retry attempt $attempt after ${delay}ms")
        delay(delay)
        true
    } else {
        false
    }
}

// Auth token refresh with retry
fun <T> Flow<T>.retryOnAuthFailure(
    tokenManager: TokenManager
): Flow<T> = retryWhen { cause, attempt ->
    if (cause is HttpException && cause.code() == 401 && attempt < 1) {
        tokenManager.refreshToken()  // Refresh the auth token
        true  // Retry the request with new token
    } else {
        false
    }
}
```

**Common Mistakes**

A common mistake is not adding `catch` after `retry`. If all retries are exhausted, the exception propagates downstream. Without `catch`, this crashes the flow or propagates to the coroutine's exception handler.

Another mistake is retrying on all exceptions. Non-retryable errors like `IllegalArgumentException`, `NullPointerException`, or HTTP 400 should not be retried — they'll fail every time, wasting time and resources.

**Key takeaway:** `retry` re-executes the entire upstream flow. Use the predicate to filter which exceptions to retry and to add delays for backoff. `catch` handles any exceptions that exhaust retries or are non-retryable. Add jitter to backoff delays in production to prevent thundering herd problems.

### Lesson 7.3: Exception Transparency

Flow has a rule called **exception transparency**: the `flow { }` builder should not catch exceptions from downstream operators. This means you shouldn't use try-catch inside `flow { }` to swallow exceptions from `emit()`.

```kotlin
// WRONG — violates exception transparency
fun brokenFlow(): Flow<Int> = flow {
    try {
        emit(1)
        emit(2)
    } catch (e: Exception) {
        // This catches exceptions thrown by downstream operators
        // (like map, filter, or collect) — violating transparency
        log("Swallowed: ${e.message}")
    }
}

// CORRECT — let downstream exceptions propagate
fun correctFlow(): Flow<Int> = flow {
    emit(1)
    emit(2)
    // Downstream exceptions propagate naturally
}
.catch { e -> emit(-1) }  // Handle at the operator level
```

The reason for this rule is that `emit()` is a suspend function that calls downstream operators. If a downstream `map` or `collect` throws, that exception passes through `emit()`. Catching it inside the `flow { }` builder would silently swallow errors from code you don't control.

**How exceptions flow through `emit()`** — When you call `emit(value)` inside a `flow { }` builder, it internally calls the downstream collector's `emit` method. If the downstream throws (e.g., a `map` operator throws), that exception bubbles up through your `emit()` call. If you catch it, you've silently suppressed an error in someone else's code:

```kotlin
// What happens internally:
flow {
    try {
        emit(1)  // Internally calls: downstream.emit(1)
        // If downstream throws, the exception comes from emit()
    } catch (e: Exception) {
        // This catches: map { throw Error() }
        // You've silently swallowed downstream's error
    }
}
.map { throw Error("downstream error") }
.collect { }
```

**What you CAN do** — You can catch exceptions from your own operations inside `flow { }`, as long as you don't catch exceptions from `emit()`:

```kotlin
// OK — catching your own exceptions, not from emit()
fun safeFlow(): Flow<Data> = flow {
    val result = try {
        api.fetchData()  // YOUR code — OK to catch
    } catch (e: IOException) {
        fallbackData()
    }
    emit(result)  // emit() is outside try-catch
}

// Also OK — catch around non-emit operations
fun anotherSafeFlow(): Flow<ProcessedData> = flow {
    for (item in items) {
        val processed = try {
            heavyProcessing(item)
        } catch (e: Exception) {
            ProcessedData.Error(item, e)
        }
        emit(processed)
    }
}
```

**Common Mistakes**

The most common mistake is wrapping the entire `flow { }` body in try-catch. This catches exceptions from `emit()`, violating exception transparency. Instead, wrap individual operations (not `emit()`) in try-catch.

**Key takeaway:** Never catch exceptions from `emit()` inside a `flow { }` builder. Use `catch` and `retry` operators for error handling. This preserves exception transparency and prevents silent error swallowing. You can catch exceptions from your own operations as long as `emit()` calls are outside the try-catch.

### Lesson 7.4: Error Handling in Hot Flows

`StateFlow` and `SharedFlow` have different error handling semantics than cold flows. Since they're always active, an exception in their upstream can terminate the entire flow permanently. This is one of the most common bugs in production Android apps — a network error permanently freezes the UI.

```kotlin
// PROBLEM: An exception in the upstream kills the stateIn permanently
val state: StateFlow<UiState> = repository.observeData()
    .map { UiState.Success(it) }
    // Without catch, an exception terminates the stateIn upstream
    // The StateFlow keeps its last value but never updates again
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

// SOLUTION: Always add catch before stateIn
val safeState: StateFlow<UiState> = repository.observeData()
    .map { UiState.Success(it) as UiState }
    .catch { e -> emit(UiState.Error(e.message)) }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)
```

**Why hot flows die permanently** — When `stateIn` or `shareIn` starts collecting the upstream flow, it creates a coroutine that runs the collection. If the upstream throws an exception (and there's no `catch`), the collection coroutine fails. The `StateFlow` retains its last value but the upstream collection is dead — no new values will ever arrive. This is like a pipe that has burst — water stopped flowing, but the faucet (StateFlow) still has the last drops.

```kotlin
// Demonstrating permanent failure:
val counter = MutableStateFlow(0)

val doubled = counter
    .map { value ->
        if (value == 3) throw IOException("Simulated failure")
        value * 2
    }
    // NO catch — exception kills the pipeline
    .stateIn(scope, SharingStarted.Eagerly, 0)

counter.value = 1  // doubled emits 2
counter.value = 2  // doubled emits 4
counter.value = 3  // EXCEPTION — pipeline dies
counter.value = 4  // doubled does NOT emit 8 — it's dead
counter.value = 5  // still dead
// doubled.value is still 4 (last successful value)
```

For flows that should survive errors and keep running:

```kotlin
val resilientState: StateFlow<UiState> = repository.observeData()
    .map { UiState.Success(it) as UiState }
    .retry(3) { cause ->
        cause is IOException && run { delay(1000); true }
    }
    .catch { e -> emit(UiState.Error(e.message)) }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)
```

**Pattern: recoverable hot flow** — For flows that should recover after errors and continue providing updates:

```kotlin
// Self-recovering flow using a wrapper
fun <T> Flow<T>.recoverAndRetry(
    delayMs: Long = 5000L
): Flow<T> = flow {
    while (true) {
        try {
            collect { emit(it) }
            break  // Flow completed normally
        } catch (e: CancellationException) {
            throw e  // Don't catch cancellation
        } catch (e: Exception) {
            log("Flow failed, retrying in ${delayMs}ms: ${e.message}")
            delay(delayMs)
            // Loop continues, re-collects the upstream
        }
    }
}

// Usage
val state = repository.observeData()
    .map { UiState.Success(it) as UiState }
    .recoverAndRetry(delayMs = 5000)
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)
```

**Common Mistakes**

The most critical mistake is forgetting `catch` before `stateIn`. Without it, any upstream exception permanently freezes the StateFlow. This is especially dangerous with network-dependent flows — a single timeout can render an entire screen permanently unresponsive.

**Key takeaway:** Always add `catch` before `stateIn` or `shareIn`. Without it, an upstream exception permanently terminates the hot flow. Add `retry` for transient errors that should trigger automatic recovery. For flows that must never die, use a recovery wrapper that re-collects the upstream after failures.

### Lesson 7.5: Custom Error Recovery Patterns

For complex error handling, build reusable flow extensions. These patterns are the building blocks of production-quality data pipelines. They encapsulate retry logic, fallback strategies, and error state management.

```kotlin
// Reusable retry with exponential backoff
fun <T> Flow<T>.retryWithExponentialBackoff(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 10000
): Flow<T> = retryWhen { cause, attempt ->
    if (cause is IOException && attempt < maxRetries) {
        val delay = (initialDelayMs * (1 shl attempt.toInt()))
            .coerceAtMost(maxDelayMs)
        delay(delay)
        true
    } else {
        false
    }
}

// Reusable result wrapper
fun <T> Flow<T>.asResult(): Flow<Result<T>> = map { Result.success(it) }
    .catch { emit(Result.failure(it)) }

// Usage
val data: StateFlow<Result<List<Order>>> = repository.observeOrders()
    .retryWithExponentialBackoff()
    .asResult()
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Result.success(emptyList()))
```

**Error state management pattern** — A reusable sealed class for representing loading/success/error states:

```kotlin
sealed class Resource<out T> {
    object Loading : Resource<Nothing>()
    data class Success<T>(val data: T) : Resource<T>()
    data class Error(val message: String?, val cause: Throwable? = null) : Resource<Nothing>()
}

// Extension to wrap any flow in Resource
fun <T> Flow<T>.asResource(): Flow<Resource<T>> = map<T, Resource<T>> {
    Resource.Success(it)
}
.onStart { emit(Resource.Loading) }
.catch { e -> emit(Resource.Error(e.message, e)) }

// Usage in ViewModel
val orders: StateFlow<Resource<List<Order>>> = orderRepo.observeOrders()
    .retryWithExponentialBackoff()
    .asResource()
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading)
```

**Offline-first error handling** — A pattern that combines network and cache with proper error handling:

```kotlin
fun <T> offlineFirst(
    cache: Flow<T>,
    network: suspend () -> T,
    saveToCache: suspend (T) -> Unit
): Flow<T> = cache
    .onStart {
        try {
            val fresh = network()
            saveToCache(fresh)
        } catch (e: IOException) {
            // Network failure is silent — cache still provides data
            log("Network refresh failed: ${e.message}")
        }
    }

// Usage
fun observeUser(userId: String): Flow<User> = offlineFirst(
    cache = userDao.observeUser(userId),
    network = { userApi.getUser(userId) },
    saveToCache = { userDao.insertUser(it) }
)
```

**Common Mistakes**

A common mistake is over-engineering error handling. Not every flow needs retry logic. If the data comes from a local database, retrying won't help. Match your error handling strategy to the actual failure modes.

**Key takeaway:** Build reusable flow extensions for common error handling patterns like exponential backoff and result wrapping. This keeps your ViewModel code clean and consistent. Match your error handling strategy to the actual failure modes — not every flow needs retries.
### Quiz: Error Handling in Flows

#### Where does the `catch` operator catch exceptions in a Flow pipeline?

- ❌ It catches exceptions from both upstream and downstream operators
- ❌ It catches exceptions only in the `collect` block
- ✅ It catches exceptions only from upstream operators (those declared before `catch`)
- ❌ It catches exceptions from all operators regardless of position

> **Explanation:** `catch` is transparent to downstream exceptions. It only intercepts errors from operators declared above it in the chain. Exceptions thrown in `collect` are not caught by `catch` — you need a try-catch around `collect` for those.

#### What happens if you don't add `catch` before `stateIn`?

- ❌ The app crashes immediately
- ❌ The `stateIn` operator catches exceptions automatically
- ✅ An upstream exception permanently terminates the hot flow — it keeps its last value but never updates again
- ❌ The exception is silently swallowed

> **Explanation:** Without `catch`, an exception in the upstream flow terminates the `stateIn` collection permanently. The `StateFlow` retains its last emitted value but stops receiving new values from the upstream, effectively becoming frozen.

#### What does the `retry` operator's lambda return value indicate?

- ❌ `true` means stop retrying, `false` means continue retrying
- ✅ `true` means retry the upstream flow, `false` means propagate the exception
- ❌ It returns the number of retries remaining
- ❌ It returns the delay before the next retry

> **Explanation:** The `retry` predicate receives the exception as a parameter and returns `true` to retry or `false` to give up and let the exception propagate downstream. You can add a `delay()` inside the predicate for exponential backoff.

### Coding Challenge: Resilient Network Flow

Create a Flow that fetches data from an API, retries up to 3 times with exponential backoff (1s, 2s, 4s) only for `IOException`, emits a fallback error state for non-retryable exceptions, and logs each state transition.

#### Solution

```kotlin
sealed class DataState {
    object Loading : DataState()
    data class Success(val data: String) : DataState()
    data class Error(val message: String?) : DataState()
}

fun fetchDataFlow(): Flow<DataState> = flow {
    emit(DataState.Loading)
    val result = api.fetchData()
    emit(DataState.Success(result))
}.let { upstream ->
    var attempt = 0
    upstream.retry(retries = 3) { cause ->
        if (cause is IOException) {
            delay(1000L * (1 shl attempt))  // 1s, 2s, 4s
            attempt++
            true
        } else false
    }
}
.catch { e -> emit(DataState.Error(e.message)) }
.onEach { state -> log("State transition: $state") }
```

The `retry` operator re-executes the entire upstream `flow { }` block on failure. Exponential backoff uses bit shifting (`1 shl attempt`) to double the delay each time. `catch` handles any exceptions that exhaust retries or are non-retryable. `onEach` logs every state transition for debugging.

---

## Module 8: Concurrency, Shared State, and Synchronization

Coroutines make concurrency easy to write but don't eliminate concurrency bugs. When multiple coroutines access shared mutable state, you need synchronization primitives designed for the coroutine world.

### Lesson 8.1: Mutex — Coroutine-Safe Locking

`Mutex` is the coroutine equivalent of `synchronized`. It ensures that only one coroutine executes a critical section at a time. The key difference: `Mutex` suspends the coroutine while waiting, whereas `synchronized` blocks the thread. This distinction is fundamental — blocking a thread in coroutine code defeats the purpose of coroutines.

```kotlin
class ThreadSafeCounter {
    private val mutex = Mutex()
    private var count = 0

    suspend fun increment() = mutex.withLock {
        count++
    }

    suspend fun getCount(): Int = mutex.withLock {
        count
    }
}

// Without mutex — race condition
class BrokenCounter {
    private var count = 0

    suspend fun increment() {
        // Multiple coroutines can read count simultaneously
        // then write back the same incremented value
        count++  // NOT thread-safe
    }
}
```

**Mutex vs synchronized** — In coroutine code, always prefer `Mutex` over `synchronized`. Here's why: `synchronized` blocks the underlying thread, preventing it from executing other coroutines. If you have 4 coroutines on `Dispatchers.Default` (which has CPU-count threads) and all 4 hit a `synchronized` block, you've blocked every thread in the pool. `Mutex` cooperatively suspends the coroutine, freeing the thread for other work.

```kotlin
// WRONG — blocks the thread
class WrongApproach {
    private val lock = Any()

    suspend fun safeMethod() {
        synchronized(lock) {
            // This blocks the thread, not just the coroutine
            // Other coroutines on this thread can't run
        }
    }
}

// CORRECT — suspends the coroutine
class CorrectApproach {
    private val mutex = Mutex()

    suspend fun safeMethod() {
        mutex.withLock {
            // This suspends the coroutine, freeing the thread
            // Other coroutines on this thread can run
        }
    }
}
```

**How Mutex works internally** — When `mutex.lock()` is called, if the mutex is unlocked, it's locked immediately (fast path — no suspension). If the mutex is already locked by another coroutine, the calling coroutine is added to a FIFO queue and suspended. When the holding coroutine calls `mutex.unlock()`, the first coroutine in the queue is resumed and given the lock.

```kotlin
// Mutex state transitions:
// UNLOCKED: lock() -> acquire immediately, state = LOCKED
// LOCKED:   lock() -> suspend, add to wait queue
// LOCKED:   unlock() -> resume first waiter, state = LOCKED (or UNLOCKED if no waiters)
```

**Mutex deadlock warning** — Mutex is NOT reentrant. If a coroutine holding a mutex lock tries to acquire the same lock again, it deadlocks:

```kotlin
// DEADLOCK
val mutex = Mutex()
suspend fun outer() = mutex.withLock {
    inner()  // Tries to acquire the same mutex — deadlock
}
suspend fun inner() = mutex.withLock {
    // Never executes
}
```

The fix is to avoid nested locks or restructure your code so the inner function doesn't need the lock:

```kotlin
// FIX: separate the locked and unlocked operations
val mutex = Mutex()

suspend fun outer() {
    val data = mutex.withLock { readData() }
    processData(data)  // No lock needed for processing
}

suspend fun inner() {
    // If inner needs the lock too, call outer instead of locking separately
}
```

**Real-world Mutex use: token refresh with deduplication**

```kotlin
class TokenManager {
    private val mutex = Mutex()
    private var token: AuthToken? = null

    suspend fun getToken(): String {
        // Fast path: return cached token if valid
        token?.let { if (!it.isExpired) return it.value }

        // Slow path: refresh token under lock
        return mutex.withLock {
            // Double-check after acquiring lock
            // Another coroutine might have refreshed while we waited
            token?.let { if (!it.isExpired) return@withLock it.value }

            val newToken = authApi.refresh()
            token = newToken
            newToken.value
        }
    }
}
```

**Common Mistakes**

A common mistake is holding a mutex lock during long-running operations. If you hold the lock while making a network call, all other coroutines waiting for the lock are blocked for the entire network call duration. Lock only the critical section:

```kotlin
// WRONG — lock held during network call
suspend fun fetchAndSave(id: String) = mutex.withLock {
    val data = api.fetch(id)  // Network call under lock — bad
    db.save(data)
}

// CORRECT — lock only the critical section
suspend fun fetchAndSave(id: String) {
    val data = api.fetch(id)  // Network call without lock
    mutex.withLock {
        db.save(data)  // Only the write is locked
    }
}
```

**Key takeaway:** Use `Mutex` instead of `synchronized` in coroutine code. `Mutex` suspends (frees the thread), `synchronized` blocks (wastes the thread). Be careful — `Mutex` is not reentrant and can cause deadlocks if nested. Lock only the critical section, not long-running operations.

### Lesson 8.2: Atomic Variables

For simple read-modify-write operations on single values, atomic variables are lighter weight than `Mutex`. They use CPU-level compare-and-swap (CAS) instructions, which means no suspension, no locking, and no overhead beyond a single CPU instruction.

```kotlin
// AtomicInteger — lock-free thread-safe integer
class AtomicCounter {
    private val count = AtomicInteger(0)

    fun increment() {  // No suspend needed
        count.incrementAndGet()
    }

    fun getCount(): Int = count.get()
}

// AtomicReference — lock-free thread-safe reference
class ConfigHolder {
    private val config = AtomicReference(AppConfig.default())

    fun update(newConfig: AppConfig) {
        config.set(newConfig)
    }

    fun get(): AppConfig = config.get()
}

// Compare-and-swap for conditional updates
class SafeList<T> {
    private val items = AtomicReference<List<T>>(emptyList())

    fun add(item: T) {
        while (true) {
            val current = items.get()
            val updated = current + item
            if (items.compareAndSet(current, updated)) break
            // If another thread modified items between get() and compareAndSet(),
            // compareAndSet returns false and we retry
        }
    }
}
```

**How CAS works** — Compare-and-swap is a CPU instruction that atomically: (1) reads the current value, (2) compares it with an expected value, (3) if they match, writes a new value. If step 2 fails (another thread modified the value), the operation returns `false` and the caller retries. This "optimistic locking" approach works well when contention is low — most CAS operations succeed on the first try.

```kotlin
// CAS loop pattern:
fun atomicIncrement(atomic: AtomicInteger) {
    while (true) {
        val current = atomic.get()
        val next = current + 1
        if (atomic.compareAndSet(current, next)) break
        // Retry if another thread incremented between get() and CAS
    }
    // This is exactly what incrementAndGet() does internally
}
```

**Kotlin's `MutableStateFlow.update`** — `MutableStateFlow.update` uses a CAS loop internally, making it the idiomatic way to do atomic state updates in coroutine code:

```kotlin
// StateFlow.update is essentially a CAS loop:
fun <T> MutableStateFlow<T>.update(function: (T) -> T) {
    while (true) {
        val prevValue = value
        val nextValue = function(prevValue)
        if (compareAndSet(prevValue, nextValue)) return
    }
}

// Usage — always prefer update over direct assignment for read-modify-write
val _count = MutableStateFlow(0)

// WRONG — race condition
fun increment() { _count.value = _count.value + 1 }

// CORRECT — atomic update
fun increment() { _count.update { it + 1 } }
```

**Mutex vs Atomic** — Use atomics for simple single-variable operations (counters, flags, reference swaps). Use `Mutex` for multi-step operations where you need to read, compute, and write atomically across multiple variables.

```kotlin
// ATOMIC — simple single-variable operations
val counter = AtomicInteger(0)
counter.incrementAndGet()  // One variable, one operation

// MUTEX — multi-variable operations that must be consistent
val mutex = Mutex()
var balance = 0.0
var transactionCount = 0

suspend fun processPayment(amount: Double) = mutex.withLock {
    balance -= amount        // Must be consistent with...
    transactionCount++       // ...this increment
}
```

**Common Mistakes**

A common mistake is using `AtomicReference` with mutable objects. The atomic reference itself is thread-safe, but the object it references might not be. If multiple threads read the reference and modify the mutable object, you still have a race condition:

```kotlin
// WRONG — atomic reference to mutable list
val items = AtomicReference(mutableListOf<String>())
// Thread A: items.get().add("a")  // Modifies the list directly
// Thread B: items.get().add("b")  // Race condition on the list!

// CORRECT — atomic reference to immutable list with CAS
val items = AtomicReference(listOf<String>())
fun addItem(item: String) {
    while (true) {
        val current = items.get()
        val updated = current + item  // Creates new immutable list
        if (items.compareAndSet(current, updated)) break
    }
}
```

**Key takeaway:** Atomic variables provide lock-free thread safety for simple operations. Use `AtomicInteger` for counters, `AtomicReference` for reference types. They don't require `suspend` and are lighter than `Mutex`. Always use immutable objects with `AtomicReference` and prefer `MutableStateFlow.update` for state updates.

### Lesson 8.3: Semaphore — Limiting Concurrency

`Semaphore` limits the number of coroutines that can access a resource concurrently. Unlike `Mutex` (which allows only 1), `Semaphore` allows N. This is essential for rate-limiting API calls, controlling database connection pools, and preventing resource exhaustion.

```kotlin
suspend fun processAll(items: List<Item>) = coroutineScope {
    val semaphore = Semaphore(permits = 5)  // Max 5 concurrent

    items.map { item ->
        async {
            semaphore.withPermit {
                processItem(item)  // At most 5 run at once
            }
        }
    }.awaitAll()
}

// Practical: rate-limited API calls
class ApiClient(
    private val httpClient: HttpClient,
    private val rateLimiter: Semaphore = Semaphore(10)
) {
    suspend fun fetch(url: String): Response {
        return rateLimiter.withPermit {
            httpClient.get(url)
        }
    }
}
```

**How Semaphore works** — A semaphore maintains a counter of available permits. When `acquire()` is called: if permits > 0, a permit is consumed immediately. If permits = 0, the coroutine is suspended until a permit becomes available. When `release()` is called, a permit is returned and a waiting coroutine (if any) is resumed.

```kotlin
// Semaphore with 3 permits:
// Time 0: permits = 3
// Coroutine A acquires: permits = 2
// Coroutine B acquires: permits = 1
// Coroutine C acquires: permits = 0
// Coroutine D tries to acquire: SUSPENDS (no permits)
// Coroutine A releases: permits = 1, D resumes and acquires: permits = 0
```

**Production patterns with Semaphore:**

```kotlin
// Rate-limited batch processing with progress tracking
suspend fun processBatch(
    items: List<Item>,
    onProgress: (Int, Int) -> Unit
): List<Result> = coroutineScope {
    val semaphore = Semaphore(10)
    val completed = AtomicInteger(0)

    items.map { item ->
        async {
            semaphore.withPermit {
                val result = processItem(item)
                val done = completed.incrementAndGet()
                onProgress(done, items.size)
                result
            }
        }
    }.awaitAll()
}

// Database connection pool limiter
class DatabasePool(maxConnections: Int = 5) {
    private val semaphore = Semaphore(maxConnections)

    suspend fun <T> withConnection(block: suspend (Connection) -> T): T {
        return semaphore.withPermit {
            val connection = acquireConnection()
            try {
                block(connection)
            } finally {
                releaseConnection(connection)
            }
        }
    }
}
```

**Common Mistakes**

A common mistake is not matching `acquire` with `release`. Using `withPermit` (which is `try/finally` based) prevents this, but if you call `acquire/release` manually, make sure `release` is in a `finally` block.

**Key takeaway:** Use `Semaphore` to limit concurrency. This prevents overwhelming servers or databases when processing large batches in parallel. With `permits = 5`, at most 5 coroutines can enter the `withPermit` block simultaneously. Always use `withPermit` instead of manual `acquire/release`.

### Lesson 8.4: Locking Techniques Comparison

Kotlin and the JVM offer several synchronization mechanisms. Choose based on your context:

```kotlin
// 1. synchronized — blocks thread, Java/JVM only (deprecated in KMM)
private val lock = Any()
fun syncMethod() {
    synchronized(lock) {
        // thread-safe but blocks the thread
    }
}

// 2. Mutex — suspends coroutine, works in KMM
private val mutex = Mutex()
suspend fun mutexMethod() {
    mutex.withLock {
        // thread-safe, suspends instead of blocking
    }
}

// 3. ReentrantLock — more control, Java only
private val reentrantLock = ReentrantLock()
fun reentrantMethod() {
    reentrantLock.lock()
    try {
        // thread-safe, supports reentrancy
    } finally {
        reentrantLock.unlock()
    }
}

// 4. AtomicReference — lock-free, works everywhere
private val atomicRef = AtomicReference("initial")
fun atomicMethod() {
    atomicRef.set("new value")  // atomic write
    val current = atomicRef.get()  // atomic read
}
```

**Decision guide for choosing the right mechanism:**

```kotlin
// 1. Single variable, simple operation?
//    → AtomicInteger / AtomicReference / MutableStateFlow.update
//    Lightweight, no suspension, no locking

// 2. Multi-variable operation in coroutine context?
//    → Mutex
//    Suspends instead of blocking, KMM compatible

// 3. Multi-variable operation in non-coroutine context?
//    → synchronized or ReentrantLock (JVM only)
//    Blocking, but appropriate for non-coroutine code

// 4. Limiting concurrent access to N?
//    → Semaphore
//    N permits instead of binary lock

// 5. Single writer, multiple readers?
//    → StateFlow (for state) or AtomicReference (for references)
//    Built-in conflation and thread-safety
```

For Kotlin Multiplatform, only `Mutex` and atomic variables are supported. `synchronized` and `ReentrantLock` are JVM-only and deprecated in KMM contexts.

**Common Mistakes**

A common mistake is mixing synchronization mechanisms. Using both `synchronized` and `Mutex` on the same data creates confusion and potential deadlocks. Pick one mechanism and use it consistently.

**Key takeaway:** Use `Mutex` for coroutine code (suspends, not blocks). Use atomics for simple single-value operations. `synchronized` and `ReentrantLock` are JVM-only — avoid them in KMM projects. Choose the simplest mechanism that meets your requirements.

### Lesson 8.5: Parallel Work with Structured Patterns

Production concurrent code needs structure. Here are battle-tested patterns for parallel work, racing, and work distribution:

```kotlin
// Pattern 1: Parallel map with limited concurrency
suspend fun <T, R> List<T>.parallelMap(
    concurrency: Int = 10,
    transform: suspend (T) -> R
): List<R> = coroutineScope {
    val semaphore = Semaphore(concurrency)
    map { item ->
        async {
            semaphore.withPermit {
                transform(item)
            }
        }
    }.awaitAll()
}

// Usage
val thumbnails = images.parallelMap(concurrency = 5) { image ->
    imageProcessor.generateThumbnail(image)
}

// Pattern 2: Race — first to complete wins
suspend fun fetchFastest(): Data = coroutineScope {
    select {
        async { primaryApi.fetch() }.onAwait { it }
        async { fallbackApi.fetch() }.onAwait { it }
    }
}

// Pattern 3: Fan-out work distribution
suspend fun processInParallel(items: List<Item>) = coroutineScope {
    val channel = Channel<Item>()

    // Launch N workers
    val workers = List(4) { workerId ->
        launch {
            for (item in channel) {
                log("Worker $workerId processing ${item.id}")
                processItem(item)
            }
        }
    }

    // Feed items to workers
    items.forEach { channel.send(it) }
    channel.close()  // Signal completion
}
```

**Pattern 4: Timeout with fallback**

```kotlin
suspend fun fetchWithFallback(): Data {
    return try {
        withTimeout(3_000) {
            primaryApi.fetch()
        }
    } catch (e: TimeoutCancellationException) {
        // Primary timed out, try fallback
        try {
            withTimeout(5_000) {
                fallbackApi.fetch()
            }
        } catch (e: TimeoutCancellationException) {
            localCache.get()  // Both timed out, use cache
        }
    }
}
```

**Pattern 5: Parallel operations with partial results**

```kotlin
data class DashboardData(
    val user: User?,
    val orders: List<Order>,
    val recommendations: List<Product>
)

suspend fun loadDashboard(): DashboardData = supervisorScope {
    val user = async {
        try { userRepo.getCurrent() } catch (e: Exception) { null }
    }
    val orders = async {
        try { orderRepo.getRecent() } catch (e: Exception) { emptyList() }
    }
    val recs = async {
        try { recRepo.getForUser() } catch (e: Exception) { emptyList() }
    }

    DashboardData(
        user = user.await(),
        orders = orders.await(),
        recommendations = recs.await()
    )
}
```

**Common Mistakes**

A common mistake with `select` is not cancelling the losing coroutine. `select` returns the first result but doesn't automatically cancel the other `async` blocks. Use `coroutineScope` so that when the scope exits, all remaining children are cancelled.

**Key takeaway:** Use `parallelMap` with `Semaphore` for batch processing with controlled concurrency. Use `select` for racing multiple sources. Use channel-based fan-out for distributing work across a fixed pool of workers. Use `supervisorScope` when you want partial results from independent operations.
### Quiz: Concurrency, Shared State, and Synchronization

#### Why should you use `Mutex` instead of `synchronized` in coroutine code?

- ❌ `Mutex` is faster than `synchronized`
- ❌ `synchronized` is not available in Kotlin
- ✅ `Mutex` suspends the coroutine while waiting, whereas `synchronized` blocks the thread, defeating the purpose of coroutines
- ❌ `Mutex` supports reentrant locking; `synchronized` does not

> **Explanation:** `synchronized` blocks the underlying thread, preventing it from executing other coroutines. `Mutex` cooperatively suspends the coroutine, freeing the thread for other work. In a coroutine context, blocking a thread is wasteful and can cause thread pool starvation.

#### What does `Semaphore(permits = 5)` control in a coroutine context?

- ❌ The maximum number of threads in the thread pool
- ❌ The maximum number of values a channel can buffer
- ✅ The maximum number of coroutines that can execute the guarded block concurrently
- ❌ The maximum retry count for failed operations

> **Explanation:** `Semaphore` limits concurrent access to a resource. With `permits = 5`, at most 5 coroutines can enter the `withPermit` block at the same time. Others suspend until a permit is released.

#### Why is `Mutex` NOT reentrant?

- ❌ Reentrancy is not supported by the Kotlin language
- ✅ If a coroutine holding a lock tries to acquire the same lock again, it suspends indefinitely — causing a deadlock
- ❌ Reentrant mutexes use too much memory
- ❌ Reentrancy is only needed for thread-based code, not coroutines

> **Explanation:** Kotlin's `Mutex` does not support reentrancy. If a coroutine already holding the lock calls `mutex.withLock` again (directly or indirectly), it will suspend waiting for a lock that will never be released — a classic deadlock.

### Coding Challenge: Rate-Limited Batch Processor

Write a function `processUrls` that takes a list of 100 URLs and fetches them all concurrently, but limits concurrency to at most 10 simultaneous requests using `Semaphore`. Collect all results and return them. Handle individual request failures without failing the entire batch.

#### Solution

```kotlin
data class FetchResult(val url: String, val body: String?, val error: String?)

suspend fun processUrls(urls: List<String>): List<FetchResult> = coroutineScope {
    val semaphore = Semaphore(permits = 10)

    urls.map { url ->
        async {
            semaphore.withPermit {
                try {
                    val body = httpClient.get(url)
                    FetchResult(url, body = body, error = null)
                } catch (e: Exception) {
                    FetchResult(url, body = null, error = e.message)
                }
            }
        }
    }.awaitAll()
}
```

All 100 URLs launch `async` coroutines immediately, but `Semaphore(10)` ensures only 10 are actively fetching at any time. Each request handles its own errors via try-catch, so one failure doesn't cancel the batch. `awaitAll()` collects all results after every coroutine completes.

---

## Module 9: Testing and Android Architecture Patterns

Testing async code requires controlling time and concurrency. This module covers testing coroutines and Flows, plus architectural patterns that make your code testable.

### Lesson 9.1: runTest and TestDispatchers

`runTest` from `kotlinx-coroutines-test` provides a coroutine scope with virtual time — `delay(1000)` doesn't actually wait a second, it advances the virtual clock instantly. This makes coroutine tests fast and deterministic.

```kotlin
@Test
fun `loadUser updates state`() = runTest {
    val repository = FakeUserRepository()
    val viewModel = UserViewModel(repository)

    viewModel.loadUser("user-1")
    advanceUntilIdle()

    assertEquals(UserState.Loaded(fakeUser), viewModel.state.value)
}
```

**How `runTest` works** — `runTest` creates a `TestScope` with a `TestCoroutineScheduler` that controls virtual time. All dispatchers within this scope use the scheduler's virtual clock instead of real wall-clock time. When you call `delay(1000)`, the coroutine schedules a resume at virtual time +1000ms, but no real time passes. `advanceUntilIdle()` processes all pending tasks by advancing virtual time as needed.

```kotlin
@Test
fun `delay is virtual in runTest`() = runTest {
    var result = ""
    launch {
        delay(10_000)  // 10 seconds of virtual time
        result = "done"
    }
    // No real time has passed yet
    advanceTimeBy(10_001)  // Advance virtual clock
    assertEquals("done", result)
    // This test completes in milliseconds, not 10 seconds
}
```

**StandardTestDispatcher vs UnconfinedTestDispatcher** — `StandardTestDispatcher` queues coroutines and only runs them when you explicitly advance the scheduler. This gives you full control over execution order and timing. `UnconfinedTestDispatcher` runs coroutines eagerly (immediately), which is simpler but hides timing bugs.

```kotlin
@Test
fun `repository fetches on IO`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val repository = UserRepository(
        api = fakeApi,
        dao = fakeDao,
        dispatcher = testDispatcher
    )

    repository.refreshUser("user-1")
    advanceUntilIdle()  // Required with StandardTestDispatcher

    assertEquals(fakeUser, fakeDao.getUser("user-1"))
}

// With UnconfinedTestDispatcher — no need for advanceUntilIdle
@Test
fun `simpler test with unconfined`() = runTest(UnconfinedTestDispatcher()) {
    val viewModel = UserViewModel(FakeRepository())
    viewModel.loadUser("user-1")
    // No advanceUntilIdle needed — runs immediately
    assertEquals(UserState.Loaded(fakeUser), viewModel.state.value)
}
```

**When to use each dispatcher:**

```kotlin
// StandardTestDispatcher — for precise timing tests
@Test
fun `debounce waits correct amount`() = runTest {
    val viewModel = SearchViewModel(FakeRepo(), StandardTestDispatcher(testScheduler))

    viewModel.onQueryChanged("kot")
    advanceTimeBy(200)
    assertEquals(SearchState.Idle, viewModel.state.value)  // Not enough time

    advanceTimeBy(200)  // Total: 400ms > 300ms debounce
    assertEquals(SearchState.Loading, viewModel.state.value)  // Past debounce
}

// UnconfinedTestDispatcher — for simple state verification
@Test
fun `simple state test`() = runTest(UnconfinedTestDispatcher()) {
    val viewModel = ProfileViewModel(FakeRepo())
    viewModel.load()
    // State is updated immediately — no advance needed
    assertTrue(viewModel.state.value is ProfileState.Success)
}
```

**`advanceTimeBy` vs `advanceUntilIdle` vs `runCurrent`:**

```kotlin
@Test
fun `time control methods`() = runTest {
    launch {
        delay(100)
        println("A")  // At virtual time 100
    }
    launch {
        delay(200)
        println("B")  // At virtual time 200
    }

    runCurrent()       // Run tasks at current virtual time (0) — nothing runs
    advanceTimeBy(150) // Advance to 150 — "A" runs
    advanceTimeBy(100) // Advance to 250 — "B" runs
    advanceUntilIdle() // Run everything remaining — nothing left
}
```

**Common Mistakes**

A common mistake is forgetting `advanceUntilIdle()` with `StandardTestDispatcher`. Coroutines are queued but not executed until you advance the scheduler. Without it, your assertions run before the coroutine completes.

Another mistake is testing with real dispatchers. If your code uses `Dispatchers.IO` directly (not injected), `runTest` can't control its timing. The test becomes flaky because real I/O timing is non-deterministic.

**Key takeaway:** `runTest` controls virtual time. Use `StandardTestDispatcher` for precise control over coroutine execution. Use `advanceTimeBy()` to skip delays and `advanceUntilIdle()` to complete all pending coroutines. Always inject dispatchers for testability.

### Lesson 9.2: Testing Flows with Turbine

Turbine is the standard library for testing Flows. It provides `test { }` which collects a Flow and lets you assert emissions one at a time. Without Turbine, testing flows requires manual collection, timeout management, and complex assertions. Turbine makes it declarative.

```kotlin
@Test
fun `search emits results after debounce`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())

    viewModel.searchResults.test {
        assertEquals(SearchState.Empty, awaitItem())

        viewModel.onQueryChanged("kotlin")
        advanceTimeBy(301)  // Past debounce threshold

        assertEquals(SearchState.Loading, awaitItem())
        assertEquals(SearchState.Results(fakeResults), awaitItem())

        cancelAndConsumeRemainingEvents()
    }
}

@Test
fun `emits error on network failure`() = runTest {
    val repository = FakeRepository(shouldFail = true)
    val viewModel = ProfileViewModel(repository)

    viewModel.state.test {
        awaitItem()  // Loading
        viewModel.loadProfile("user-1")

        val error = awaitItem()
        assertTrue(error is ProfileState.Error)

        cancelAndConsumeRemainingEvents()
    }
}
```

**Turbine methods:**

```kotlin
flow.test {
    awaitItem()          // Suspends until next emission, fails on timeout
    awaitError()         // Suspends until flow throws
    awaitComplete()      // Suspends until flow completes
    expectNoEvents()     // Asserts no emissions/errors/completion
    cancelAndConsumeRemainingEvents()  // Clean up
    cancelAndIgnoreRemainingEvents()   // Clean up (ignore leftovers)
}
```

**`awaitItem()` behavior** — `awaitItem()` suspends until the next value is emitted. If no value arrives within the timeout (default: 1 second for real time, or virtual time in `runTest`), the test fails with a descriptive error message. This makes tests self-documenting — you see exactly which emission you're waiting for.

```kotlin
@Test
fun `state transitions in order`() = runTest {
    val viewModel = OrderViewModel(FakeOrderRepo())

    viewModel.orderState.test {
        // Verify initial state
        assertEquals(OrderState.Idle, awaitItem())

        // Trigger action
        viewModel.placeOrder(testOrder)
        advanceUntilIdle()

        // Verify state transitions
        assertEquals(OrderState.Validating, awaitItem())
        assertEquals(OrderState.Processing, awaitItem())
        assertEquals(OrderState.Complete(receipt), awaitItem())

        cancelAndConsumeRemainingEvents()
    }
}
```

**Testing hot flows (StateFlow/SharedFlow):**

```kotlin
@Test
fun `SharedFlow events are received`() = runTest {
    val viewModel = CartViewModel(FakePaymentService())

    viewModel.events.test {
        viewModel.checkout()
        advanceUntilIdle()

        assertEquals(CartEvent.ShowSnackbar("Payment successful!"), awaitItem())
        assertEquals(CartEvent.NavigateToReceipt("receipt-123"), awaitItem())

        cancelAndConsumeRemainingEvents()
    }
}
```

**Testing StateFlow conflation** — `StateFlow` conflates duplicate values. If your ViewModel emits `Loading` then `Loading` again (same value), Turbine only sees one emission. This catches real bugs — if your state machine emits the same state twice, it won't trigger a recomposition in Compose either.

```kotlin
@Test
fun `StateFlow conflation in tests`() = runTest {
    val state = MutableStateFlow(0)

    state.test {
        assertEquals(0, awaitItem())  // Initial value

        state.value = 1
        assertEquals(1, awaitItem())

        state.value = 1  // Same value — conflated, no emission
        expectNoEvents()  // Correctly asserts no duplicate

        state.value = 2
        assertEquals(2, awaitItem())

        cancelAndConsumeRemainingEvents()
    }
}
```

**`expectMostRecentItem` for skipping intermediate states:**

```kotlin
@Test
fun `verify final state after rapid updates`() = runTest {
    val viewModel = CounterViewModel()

    viewModel.count.test {
        assertEquals(0, awaitItem())

        // Rapid updates
        repeat(100) { viewModel.increment() }
        advanceUntilIdle()

        // Don't care about intermediate values
        // Just verify the final state
        val final = expectMostRecentItem()
        assertEquals(100, final)
    }
}
```

**Common Mistakes**

A common mistake is not calling `cancelAndConsumeRemainingEvents()` at the end of a test. Without it, Turbine throws an error if there are unconsumed events. This is actually a feature — it catches cases where your flow emits unexpected extra values.

Another mistake is not advancing time when testing flows that use `debounce` or `delay`. Turbine's `awaitItem()` will timeout if the emission is delayed by virtual time that hasn't been advanced.

**Key takeaway:** Use Turbine for testing Flows. `awaitItem()` captures each emission sequentially. Always end test blocks with `cancelAndConsumeRemainingEvents()`. `runTest` gives you virtual time for deterministic testing. Use `expectMostRecentItem()` when you only care about the final state.

### Lesson 9.3: Injecting Dispatchers for Testability

Hardcoded dispatchers make tests non-deterministic because they run on real threads. The fix is straightforward: inject dispatchers through constructors. This is the single most important pattern for testable coroutine code.

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

// In tests
@Test
fun `falls back to cache on network failure`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val fakeApi = FakePaymentApi(shouldFail = true)
    val fakeDb = FakeTransactionDao(cachedData = listOf(cachedTx))

    val repository = TransactionRepository(
        api = fakeApi,
        db = fakeDb,
        ioDispatcher = testDispatcher
    )

    val result = repository.getTransactions()
    advanceUntilIdle()

    assertEquals(listOf(cachedTx), result)
}
```

**The DispatcherProvider pattern** — For classes that use multiple dispatchers, inject a provider:

```kotlin
interface DispatcherProvider {
    val main: CoroutineDispatcher
    val io: CoroutineDispatcher
    val default: CoroutineDispatcher
}

class DefaultDispatcherProvider : DispatcherProvider {
    override val main = Dispatchers.Main
    override val io = Dispatchers.IO
    override val default = Dispatchers.Default
}

class TestDispatcherProvider(
    testDispatcher: TestDispatcher
) : DispatcherProvider {
    override val main = testDispatcher
    override val io = testDispatcher
    override val default = testDispatcher
}

// Usage in repository
class DataRepository(
    private val api: Api,
    private val dispatchers: DispatcherProvider = DefaultDispatcherProvider()
) {
    suspend fun fetchData(): Data = withContext(dispatchers.io) {
        api.fetchData()
    }

    suspend fun processData(data: Data): Result = withContext(dispatchers.default) {
        heavyProcessing(data)
    }
}
```

**EmptyCoroutineContext instead of Dispatchers.Unconfined** — When testing code that uses `withContext(mainDispatcher)`, don't inject `Dispatchers.Unconfined`. As covered in Module 1, Unconfined breaks after suspension points. Instead, inject `EmptyCoroutineContext`:

```kotlin
@Test
fun testPresenter() = runTest {
    val presenter = TransactionPresenter(
        repository = fakeRepository,
        ioDispatcher = EmptyCoroutineContext,    // Not Dispatchers.Unconfined
        mainDispatcher = EmptyCoroutineContext,  // Safe after suspend points
    )
    presenter.loadTransactions(testTextView)
    // No CalledFromWrongThreadException
}
```

**Common Mistakes**

A common mistake is injecting `Dispatchers.Unconfined` in tests. While it works for simple cases, it breaks after suspension points because the coroutine resumes on a different thread. Always use `StandardTestDispatcher` or `EmptyCoroutineContext`.

**Key takeaway:** Inject dispatchers through constructors for testability. Use `StandardTestDispatcher` in tests for deterministic execution. Use `EmptyCoroutineContext` instead of `Dispatchers.Unconfined` to avoid thread-safety bugs in tests. The DispatcherProvider pattern simplifies injection when multiple dispatchers are needed.

### Lesson 9.4: ViewModel Architectural Patterns

The standard ViewModel pattern for coroutines combines `StateFlow`, `stateIn`, and injected dispatchers. This pattern is the foundation of modern Android architecture with coroutines.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val searchQuery = MutableStateFlow("")

    val searchResults: StateFlow<SearchState> = searchQuery
        .debounce(300)
        .distinctUntilChanged()
        .flatMapLatest { query ->
            if (query.isBlank()) flowOf(SearchState.Empty)
            else searchRepository.search(query)
                .map<List<Result>, SearchState> { SearchState.Results(it) }
                .onStart { emit(SearchState.Loading) }
                .catch { emit(SearchState.Error(it.message)) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SearchState.Empty)

    fun onQueryChanged(query: String) {
        searchQuery.value = query
    }
}
```

**Event handling with SharedFlow:**

```kotlin
class CheckoutViewModel(
    private val paymentService: PaymentService
) : ViewModel() {

    private val _state = MutableStateFlow<CheckoutState>(CheckoutState.Idle)
    val state: StateFlow<CheckoutState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<CheckoutEvent>()
    val events: SharedFlow<CheckoutEvent> = _events.asSharedFlow()

    fun submitPayment(amount: Double) {
        viewModelScope.launch {
            _state.value = CheckoutState.Processing
            try {
                val receipt = paymentService.charge(amount)
                _state.value = CheckoutState.Success(receipt)
                _events.emit(CheckoutEvent.NavigateToReceipt(receipt.id))
            } catch (e: Exception) {
                _state.value = CheckoutState.Error(e.message)
                _events.emit(CheckoutEvent.ShowSnackbar("Payment failed"))
            }
        }
    }
}
```

**MVI (Model-View-Intent) pattern with coroutines:**

```kotlin
class TodoViewModel(
    private val repository: TodoRepository
) : ViewModel() {

    private val _intent = MutableSharedFlow<TodoIntent>()

    val state: StateFlow<TodoState> = _intent
        .flatMapLatest { intent ->
            when (intent) {
                is TodoIntent.LoadAll -> repository.observeAll()
                    .map { TodoState.Loaded(it) as TodoState }
                is TodoIntent.Add -> flow {
                    repository.add(intent.todo)
                    // Don't emit — the observeAll flow will re-emit
                }
                is TodoIntent.Delete -> flow {
                    repository.delete(intent.id)
                }
            }
        }
        .catch { e -> emit(TodoState.Error(e.message)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TodoState.Loading)

    fun send(intent: TodoIntent) {
        viewModelScope.launch { _intent.emit(intent) }
    }
}
```

**Common Mistakes**

A common mistake is creating `StateFlow`s inside functions instead of as class properties. Each call creates a new flow and a new upstream collection:

```kotlin
// WRONG — new StateFlow every call
fun getState(): StateFlow<Data> = flow { ... }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initial)

// CORRECT — single StateFlow, shared
val state: StateFlow<Data> = flow { ... }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initial)
```

**Key takeaway:** Use `StateFlow` for UI state (always has a value) and `SharedFlow` for one-time events (navigation, snackbars). Combine reactive streams with `combine` and convert to `StateFlow` with `stateIn`. Use `WhileSubscribed(5_000)` for lifecycle-aware upstream management.

### Lesson 9.5: Repository Layer Patterns

Repositories bridge data sources with the presentation layer. They expose `Flow` for observable data and `suspend` functions for one-shot operations. The repository pattern is the boundary between your app's business logic and its data sources.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    // Observable data — returns Flow
    fun observeUser(userId: String): Flow<User> = dao
        .observeUser(userId)
        .onStart {
            try {
                val networkUser = withContext(dispatcher) { api.getUser(userId) }
                dao.insertUser(networkUser)
            } catch (e: Exception) {
                // Network failure — database cache still works
            }
        }

    // One-shot operation — returns suspend
    suspend fun refreshUser(userId: String) = withContext(dispatcher) {
        val user = api.getUser(userId)
        dao.insertUser(user)
    }
}
```

**Offline-first pattern** — Observe the database as the source of truth. Refresh from network in the background. Room's `Flow` automatically re-emits when the data changes:

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    fun observeArticles(): Flow<List<Article>> = dao
        .observeAllArticles()
        .onStart {
            try {
                val fresh = withContext(ioDispatcher) { api.getArticles() }
                dao.insertAll(fresh)
            } catch (e: Exception) {
                // Network failure is silent — cached data still flows
            }
        }
}
```

**Repository with explicit refresh and loading states:**

```kotlin
class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    // Observable products from database
    fun observeProducts(): Flow<List<Product>> = dao.observeAll()

    // Explicit refresh — returns success/failure
    suspend fun refresh(): Result<Unit> = withContext(dispatcher) {
        try {
            val products = api.getProducts()
            dao.replaceAll(products)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Combined: observe + auto-refresh
    fun observeWithAutoRefresh(): Flow<List<Product>> = dao.observeAll()
        .onStart { refresh() }  // Trigger refresh on first collection
}
```

**Common Mistakes**

A common mistake is making repository functions that both observe AND return a single value. Flows are for continuous observation; suspend functions are for one-shot operations. Don't mix them.

**Key takeaway:** Repositories expose `Flow` for observable data and `suspend` functions for one-shot operations. Use the offline-first pattern with Room's `Flow` — observe the database and refresh from the network in the background.

### Lesson 9.6: Testing ViewModel State Transitions

Test that your ViewModel emits the correct sequence of states. This verifies the entire pipeline — from user action through business logic to UI state.

```kotlin
class CounterViewModel(
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default
) : ViewModel() {
    private val _count = MutableStateFlow(0)
    val count: StateFlow<Int> = _count.asStateFlow()

    fun increment() {
        viewModelScope.launch(dispatcher) {
            delay(500)
            _count.value += 1
        }
    }
}

@Test
fun `increment updates count after delay`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val viewModel = CounterViewModel(dispatcher = testDispatcher)

    viewModel.count.test {
        assertEquals(0, awaitItem())  // Initial state

        viewModel.increment()
        advanceTimeBy(501)  // Past the 500ms delay

        assertEquals(1, awaitItem())
        cancelAndConsumeRemainingEvents()
    }
}

@Test
fun `multiple increments`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val viewModel = CounterViewModel(dispatcher = testDispatcher)

    viewModel.count.test {
        assertEquals(0, awaitItem())

        viewModel.increment()
        viewModel.increment()
        viewModel.increment()
        advanceUntilIdle()

        // StateFlow conflates, so we might not see intermediate values
        // We just verify the final state
        val finalValue = expectMostRecentItem()
        assertEquals(3, finalValue)
    }
}
```

**Testing error states:**

```kotlin
@Test
fun `network error shows error state`() = runTest {
    val failingRepo = FakeUserRepo(shouldFail = true)
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val viewModel = UserViewModel(failingRepo, testDispatcher)

    viewModel.state.test {
        assertEquals(UserState.Idle, awaitItem())

        viewModel.loadUser("user-1")
        advanceUntilIdle()

        val state = awaitItem()
        assertTrue(state is UserState.Error)
        assertEquals("Network error", (state as UserState.Error).message)

        cancelAndConsumeRemainingEvents()
    }
}
```

**Common Mistakes**

A common mistake is not using the same `testScheduler` for both `runTest` and the injected `TestDispatcher`. If they use different schedulers, `advanceTimeBy` won't affect the ViewModel's coroutines.

**Key takeaway:** Inject `StandardTestDispatcher` tied to the same `testScheduler` as `runTest`. Use `advanceTimeBy()` for time-dependent tests. Use `advanceUntilIdle()` to complete all pending coroutines. Turbine's `awaitItem()` captures each state emission.

### Lesson 9.7: Custom Flow Operators

You can build custom operators using the `flow { }` builder. This is powerful for creating domain-specific streaming behavior. Custom operators follow the same pattern: create a new flow, collect the upstream, and emit transformed values.

```kotlin
// Throttle first — emit first item, then ignore for duration
fun <T> Flow<T>.throttleFirst(windowMs: Long): Flow<T> = flow {
    var lastEmitTime = 0L
    collect { value ->
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastEmitTime >= windowMs) {
            lastEmitTime = currentTime
            emit(value)
        }
    }
}

// Usage — prevent double-clicks
button.clicks()
    .throttleFirst(500)
    .collect { handleClick() }

// Chunk by time — batch emissions within a time window
fun <T> Flow<T>.chunkedByTime(windowMs: Long): Flow<List<T>> = flow {
    val buffer = mutableListOf<T>()
    var lastEmitTime = System.currentTimeMillis()

    collect { value ->
        buffer.add(value)
        val now = System.currentTimeMillis()
        if (now - lastEmitTime >= windowMs) {
            emit(buffer.toList())
            buffer.clear()
            lastEmitTime = now
        }
    }

    if (buffer.isNotEmpty()) {
        emit(buffer.toList())
    }
}

// Pairwise — emit consecutive pairs
fun <T> Flow<T>.pairwise(): Flow<Pair<T, T>> = flow {
    var previous: T? = null
    collect { current ->
        previous?.let { prev ->
            emit(prev to current)
        }
        previous = current
    }
}
```

**More advanced custom operators:**

```kotlin
// withPrevious — emit current and previous value together
fun <T> Flow<T>.withPrevious(): Flow<Pair<T?, T>> = flow {
    var previous: T? = null
    collect { current ->
        emit(previous to current)
        previous = current
    }
}

// Usage: detect changes
priceFlow.withPrevious()
    .filter { (prev, current) -> prev != null }
    .collect { (prev, current) ->
        val change = current!! - prev!!
        println("Price changed by $change")
    }

// retryWithCondition — retry only while a condition is true
fun <T> Flow<T>.retryWhile(
    condition: suspend () -> Boolean,
    delayMs: Long = 1000
): Flow<T> = retryWhen { _, _ ->
    delay(delayMs)
    condition()
}

// Usage: retry while network is available
dataFlow.retryWhile(
    condition = { networkMonitor.isOnline.value },
    delayMs = 2000
)
```

**Testing custom operators:**

```kotlin
@Test
fun `throttleFirst emits first then ignores`() = runTest {
    val flow = flow {
        emit(1)
        delay(100)
        emit(2)  // Within window — ignored
        delay(100)
        emit(3)  // Within window — ignored
        delay(400)
        emit(4)  // Past window — emitted
    }

    flow.throttleFirst(500).test {
        assertEquals(1, awaitItem())
        assertEquals(4, awaitItem())
        awaitComplete()
    }
}

@Test
fun `pairwise emits consecutive pairs`() = runTest {
    flowOf(1, 2, 3, 4).pairwise().test {
        assertEquals(1 to 2, awaitItem())
        assertEquals(2 to 3, awaitItem())
        assertEquals(3 to 4, awaitItem())
        awaitComplete()
    }
}
```

**Common Mistakes**

A common mistake when writing custom operators is breaking context preservation. If your operator launches a coroutine and calls `emit` from it, you'll get an `IllegalStateException`. Always call `emit` from the same coroutine that calls `collect`:

```kotlin
// WRONG — emit from different coroutine
fun <T> Flow<T>.brokenOperator(): Flow<T> = flow {
    coroutineScope {
        launch {
            collect { emit(it) }  // CRASH: emit from different coroutine
        }
    }
}

// CORRECT — emit from the same coroutine
fun <T> Flow<T>.correctOperator(): Flow<T> = flow {
    collect { value ->
        emit(transform(value))  // Same coroutine
    }
}

// If you need concurrent emission, use channelFlow
fun <T> Flow<T>.concurrentOperator(): Flow<T> = channelFlow {
    launch { collect { send(it) } }
    launch { otherSource.collect { send(it) } }
}
```

**Key takeaway:** You can build custom operators using the `flow { }` builder. Custom operators use `collect` internally to consume upstream values and `emit` to send transformed values downstream. Always maintain context preservation — emit from the same coroutine that collects. Use `channelFlow` if you need concurrent emission.
### Quiz: Testing and Android Architecture

#### Why should you inject `CoroutineDispatcher` into your classes instead of hardcoding `Dispatchers.IO`?

- ❌ `Dispatchers.IO` is deprecated in newer Kotlin versions
- ❌ Hardcoded dispatchers cause memory leaks
- ✅ Injecting dispatchers lets you swap in a `TestDispatcher` during tests for deterministic, controlled execution
- ❌ `Dispatchers.IO` doesn't work inside `runTest`

> **Explanation:** Hardcoded dispatchers run on real threads during tests, making them non-deterministic and slow. By injecting the dispatcher, you can replace it with `StandardTestDispatcher` or `UnconfinedTestDispatcher` in tests, giving you full control over coroutine execution and virtual time.

#### What does `advanceUntilIdle()` do inside `runTest`?

- ❌ It waits for real wall-clock time to pass
- ❌ It cancels all pending coroutines
- ✅ It advances virtual time and executes all pending coroutines until no work remains
- ❌ It suspends the test until a timeout occurs

> **Explanation:** `advanceUntilIdle()` processes all pending tasks in the `TestCoroutineScheduler`, including those behind `delay()` calls. It runs everything to completion instantly in virtual time, making tests fast and deterministic.

#### In a Repository, why should you expose `Flow` for observable data instead of `suspend` functions?

- ❌ `Flow` is faster than `suspend` functions
- ❌ `suspend` functions can't return data from a database
- ✅ `Flow` allows continuous observation of data changes over time, while `suspend` gives a one-shot result
- ❌ `Flow` automatically handles threading; `suspend` functions don't

> **Explanation:** A `Flow` keeps the collector updated whenever the underlying data changes (e.g., a Room database query emitting new results on insert). A `suspend` function returns once and the caller must manually re-fetch to get updates.

#### When testing Flows with Turbine, what does `awaitItem()` do?

- ❌ It immediately returns the first value in the flow without waiting
- ❌ It waits indefinitely until a value is emitted
- ✅ It suspends until the next item is emitted, failing with a timeout if no item arrives
- ❌ It collects all remaining items at once

> **Explanation:** `awaitItem()` suspends the test coroutine until the Flow emits its next value. If no value is emitted within the default timeout (typically 1 second), the test fails. This makes Flow assertions sequential and deterministic.

### Coding Challenge: Offline-First Repository with Tests

Write a Repository function `observeArticles` that returns a `Flow<List<Article>>`. It should observe the local database (Room DAO) for continuous updates, and on the first collection trigger a background network refresh that inserts fresh data into the database. Handle network failures silently. Then write a test that verifies the flow emits cached data immediately and refreshed data after the network call completes.

#### Solution

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    fun observeArticles(): Flow<List<Article>> = dao
        .observeAllArticles()
        .onStart {
            try {
                val fresh = withContext(ioDispatcher) { api.getArticles() }
                dao.insertAll(fresh)
            } catch (e: Exception) {
                // Network failure is silent — cached data still flows
            }
        }
}

@Test
fun `emits cached then refreshed articles`() = runTest {
    val cachedArticles = listOf(Article("cached-1"))
    val freshArticles = listOf(Article("fresh-1"), Article("fresh-2"))

    val fakeDao = FakeArticleDao(initialData = cachedArticles)
    val fakeApi = FakeArticleApi(response = freshArticles)
    val testDispatcher = StandardTestDispatcher(testScheduler)

    val repository = ArticleRepository(
        api = fakeApi,
        dao = fakeDao,
        ioDispatcher = testDispatcher
    )

    repository.observeArticles().test {
        // First emission: cached data from database
        assertEquals(cachedArticles, awaitItem())

        // Network refresh happens in onStart
        advanceUntilIdle()

        // Second emission: fresh data after network refresh
        assertEquals(freshArticles, awaitItem())

        cancelAndConsumeRemainingEvents()
    }
}
```

The `onStart` block triggers a network refresh before the first emission. Room's `Flow` automatically re-emits when `insertAll` updates the table, so collectors receive the fresh data seamlessly. The test verifies both the cached emission and the network-refreshed emission using Turbine.

---

Thank You for completing the Kotlin Coroutines & Flows course! Coroutines are the async backbone of modern Android — understanding them deeply, from state machines to backpressure strategies, changes how you design your entire app architecture. ⚡