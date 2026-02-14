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

Kotlin Coroutines is the library that makes this possible on JVM and Android. It's not just syntactic sugar over threads — it's a completely different execution model built on top of Continuation Passing Style (CPS) and state machines. When you write a `suspend` function, the Kotlin compiler transforms it into a state machine class with a `label` field that tracks where the coroutine paused. Each suspension point becomes a state, and each resume is a re-entry into that state machine at the next label.

The practical result is that you write code that reads sequentially, with no callbacks:

```kotlin
suspend fun fetchUserProfile(userId: String): UserProfile {
    val user = api.getUser(userId)           // Suspends, doesn't block
    val posts = api.getUserPosts(userId)      // Suspends, doesn't block
    return UserProfile(user, posts)
}
```

Under the hood, this function is split into three states by the compiler. State 0 calls `getUser` and potentially suspends. If it does, the function returns `COROUTINE_SUSPENDED` and the thread is free. When the network call completes, the state machine re-enters at state 1, which calls `getUserPosts`. State 2 assembles the result.

**Coroutines vs Threads** — A thread is an OS-level construct that costs ~1MB of stack memory. A coroutine is a Kotlin-level construct that costs ~100 bytes — just a small object with fields for local variables and a label integer. You can launch 100,000 coroutines on a single thread without breaking a sweat. Try that with threads and you'll run out of memory before you hit 10,000.

**Key takeaway:** Coroutines let you write sequential-looking code that executes asynchronously. The `suspend` keyword marks functions that can pause and resume, and the compiler generates the state machine that makes it work.

### Lesson 1.2: CoroutineScope and Structured Concurrency

Structured concurrency means every coroutine has a parent, and if the parent is cancelled, all children are cancelled too. No orphan coroutines leaking resources, no fire-and-forget jobs accumulating silently, no coroutines crashing because they try to update a destroyed UI.

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

**Why structured concurrency matters** — Without it, you get fire-and-forget coroutines that leak memory, crash after the UI is gone, and are impossible to test. A `GlobalScope.launch` in a ViewModel will keep running after the ViewModel is destroyed, potentially writing stale data to the database or crashing when it tries to update a collected `StateFlow` on a dead scope.

**Key takeaway:** Never use `GlobalScope`. Always launch coroutines within a scope that has a defined lifecycle — `viewModelScope`, `lifecycleScope`, or a custom scope you control with `SupervisorJob`.

### Lesson 1.3: Dispatchers — Threading Model

Dispatchers determine which thread pool a coroutine runs on. They're the bridge between coroutines (a language-level concept) and threads (an OS-level concept).

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

**IO vs Default internals** — `Dispatchers.IO` is backed by a thread pool of 64 threads (by default, configurable via `kotlinx.coroutines.io.parallelism`) designed for blocking operations. `Dispatchers.Default` uses a thread pool sized to CPU cores, optimized for computation. They actually share the same underlying thread pool but have different concurrency limits. When a coroutine switches from `Default` to `IO`, it may stay on the same physical thread — only the concurrency limit changes.

**The Unconfined trap** — `Dispatchers.Unconfined` says "don't dispatch, just run on whatever thread we're on." But after a suspension point like `delay()`, the coroutine resumes on whatever thread the delay mechanism uses (the `DefaultExecutor` daemon thread). This means code after a suspension point runs on a different thread than code before it. If you're doing UI work, this causes `CalledFromWrongThreadException`. The real implementation of Unconfined is simple — `isDispatchNeeded` always returns `false` and the `dispatch` method throws because it should never be called. The fix isn't a different dispatcher — it's `EmptyCoroutineContext`, which doesn't override the dispatcher at all.

**Swap dispatchers** — Each `Continuation` object holds a `CoroutineContext` that includes the dispatcher. Before calling `resumeWith`, the coroutine machinery reads the dispatcher from the context and dispatches the resume to the correct thread. This is why `withContext(Dispatchers.IO)` works — it swaps the dispatcher in the continuation's context, and when the block completes, the original dispatcher resumes execution on its thread.

**Key takeaway:** Use `Dispatchers.Main` for UI, `Dispatchers.IO` for network/disk, `Dispatchers.Default` for computation. Use `withContext()` to switch dispatchers. Never use `Dispatchers.Unconfined` in production — use `EmptyCoroutineContext` when you need a no-op context for testing.

### Lesson 1.4: Coroutine Builders — launch, async, runBlocking

Kotlin provides several coroutine builders, each with different semantics for how the coroutine is started and how its result is delivered.

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

**The async trap** — `async` without `await()` is a bug waiting to happen. If the async coroutine throws, the exception is stored in the `Deferred` but also propagates up to the parent scope immediately. The exception doesn't wait for `await()`. By the time your `catch` block around `await()` runs, the parent scope may already be cancelled. Use `supervisorScope` if you need to handle `async` failures independently.

**runBlocking vs coroutineScope** — `runBlocking` blocks the thread it's called on. It exists primarily for `main()` functions and test code. `coroutineScope` suspends (doesn't block) and creates a child scope that waits for all its children. In Android, you should almost never use `runBlocking` — it defeats the purpose of coroutines.

**Key takeaway:** Use `launch` when you don't need a return value. Use `async`/`await` for parallel work where you need results. Wrap parallel `async` calls in `coroutineScope` for structured concurrency. Never use `runBlocking` on the Android main thread.

### Lesson 1.5: CoroutineContext — The Configuration Bag

A `CoroutineContext` is an indexed set of elements that configure how a coroutine runs. Think of it as a `Map` where each key maps to exactly one element. The most common elements are `Job`, `CoroutineDispatcher`, `CoroutineName`, and `CoroutineExceptionHandler`.

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

When you launch a child coroutine, the child inherits the parent's context but creates a new `Job` that becomes a child of the parent's `Job`. This is the mechanism behind structured concurrency — the parent-child `Job` hierarchy. When `withContext` is called, it creates a new context by merging elements. Only the elements you provide override the parent's — everything else is inherited.

**Key takeaway:** `CoroutineContext` is the configuration bag that travels with every coroutine. It holds the dispatcher, job, name, and exception handler. Child coroutines inherit their parent's context but get their own `Job`. Use `withContext` to override specific elements without losing the rest.

### Lesson 1.6: Suspend Functions — Deep Dive

A `suspend` function can be paused and resumed. But `suspend` is a compiler hint, not a thread annotation. A suspend function can run on any thread. It just means "this function might pause."

The compiler transforms every suspend function using Continuation Passing Style. It adds an extra `Continuation` parameter and changes the return type to `Any?` — a union of the actual return type and `COROUTINE_SUSPENDED`. The `Continuation` interface is simple:

```kotlin
public interface Continuation<in T> {
    public val context: CoroutineContext
    public fun resumeWith(result: Result<T>)
}
```

It holds a `CoroutineContext` (which contains the dispatcher, job, exception handler) and a single `resumeWith` function. When the suspended operation finishes, someone calls `resumeWith` with the result, and the coroutine continues from the next state.

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

**suspendCoroutine vs suspendCancellableCoroutine** — Always prefer `suspendCancellableCoroutine`. It gives you `isActive` (to check if the coroutine is still alive before resuming) and `invokeOnCancellation` (to clean up resources). Plain `suspendCoroutine` doesn't support cancellation, which means the callback may try to resume a cancelled coroutine — a recipe for leaks and crashes.

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

**Key takeaway:** `suspend` is a compiler hint that triggers CPS transformation. Always use `suspendCancellableCoroutine` over `suspendCoroutine` for proper cancellation support. The compiler generates a state machine with one state per suspension point.

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

**Key takeaway:** CPS is the compile-time transformation that makes coroutines work. The compiler adds a `Continuation` parameter to every suspend function and changes the return type to `Any?` to represent either a result or a suspension marker.

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

**Key takeaway:** The compiler generates a state machine class for each suspend function. Each suspension point becomes a label in a `when` expression. Local variables that cross suspension boundaries are saved as fields in the state machine object.

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

The continuation chain works by nesting: each coroutine's state machine continuation wraps the outer continuation. When the innermost suspend function completes, it calls `resumeWith` on the state machine, which advances the label and may call `resumeWith` on the next outer continuation, and so on up the chain.

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

**Key takeaway:** Continuations form a chain — each state machine wraps the outer continuation. The dispatcher reads the context to decide which thread to resume on. Understanding this chain explains why coroutine stack traces show `invokeSuspend` and `BaseContinuationImpl.resumeWith` instead of your actual function hierarchy.

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

**Key takeaway:** Coroutine stack traces unwind completely on suspension. Use `kotlinx-coroutines-debug` to get logical stack traces that show the actual call hierarchy. Understanding the state machine explains why debugging coroutines requires different tools than debugging threads.

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

Thread switching is the real cost. Every `withContext(Dispatchers.IO)` that actually needs to dispatch involves posting a `Runnable` to a thread pool. If the coroutine is already on an IO thread, `withContext(Dispatchers.IO)` detects this and skips the dispatch. But if it needs to switch, you're paying the cost of a context switch — roughly 10-50 microseconds.

**Key takeaway:** Coroutines are cheap (~200-400 bytes) but not free. Avoid launching thousands of coroutines for trivial work. Thread dispatching is the real cost — minimize unnecessary dispatcher switches. The compiler optimizes the state machine with `tableswitch` and only saves variables that cross suspension boundaries.

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

This is one of the most common coroutine bugs. The `async` block throws, the exception propagates to the `launch` coroutine, the `launch` coroutine is cancelled, and the `catch` block may or may not run depending on timing.

**Key takeaway:** `launch` propagates exceptions immediately to the parent. `async` stores exceptions for `await()` BUT also propagates to the parent immediately. This dual behavior is the source of most coroutine exception bugs.

### Lesson 3.2: CoroutineExceptionHandler

`CoroutineExceptionHandler` is a last-resort safety net, not a replacement for `try/catch`. It only catches exceptions from root-level `launch` coroutines — direct children of the scope.

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

**Key takeaway:** `CoroutineExceptionHandler` is a last resort, not a replacement for try-catch. It only catches exceptions from root-level `launch` coroutines. Use try-catch inside coroutines for recoverable errors.

### Lesson 3.3: SupervisorJob and supervisorScope

`SupervisorJob` changes the propagation rule: child failures don't cancel the parent or siblings. Each child's failure is isolated. This is what you want when parallel operations are independent.

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

**Important detail** — `viewModelScope` already uses `SupervisorJob` internally. That's why one failed `viewModelScope.launch` doesn't cancel your other launches. But if you create a child `coroutineScope` inside a `viewModelScope.launch`, that inner scope uses a regular `Job` — failures in that inner scope will cancel all siblings within it.

**Key takeaway:** `SupervisorJob` prevents failure cascading. Use `supervisorScope` when parallel operations are independent and should fail independently. Use `coroutineScope` when you want all-or-nothing semantics.

### Lesson 3.4: Cancellation — The Cooperative Contract

Cancellation in coroutines is cooperative, not preemptive. The runtime doesn't forcibly stop your coroutine — it sets a flag and expects your code to check it. All built-in suspend functions (`delay`, `yield`, `withContext`, channel operations) check for cancellation automatically. But CPU-intensive code that doesn't call suspend functions won't be cancelled.

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

**CancellationException is special** — It doesn't propagate to the parent. It's the normal cancellation mechanism. Never catch `CancellationException` and swallow it:

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

**NonCancellable for cleanup** — Sometimes you need to run suspend functions in a `finally` block, but the coroutine is already cancelled:

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

**Key takeaway:** Cancellation is cooperative. Long-running code must check `isActive`, call `ensureActive()`, or call `yield()`. Never catch and swallow `CancellationException`. Use `NonCancellable` for cleanup in `finally` blocks.

### Lesson 3.5: withTimeout and Timeout Patterns

`withTimeout` throws `TimeoutCancellationException` (a subclass of `CancellationException`) when the timeout expires. Because it's a `CancellationException`, it doesn't propagate to the parent by default.

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

**Key takeaway:** `withTimeout` throws `TimeoutCancellationException`, which is a `CancellationException` — it doesn't crash the parent scope. Use `withTimeoutOrNull` for a null-returning alternative. Protect critical side effects inside `withTimeout` with `NonCancellable`.

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

A cold flow doesn't produce values until someone collects it. Each collector gets its own independent stream — the `flow { }` builder code re-executes for every collector.

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

The important constraint: `flow { }` is sequential. You cannot call `emit()` from a different coroutine or thread. If you need concurrent emission, use `channelFlow` instead.

**Key takeaway:** `flow { }` creates a cold stream. Code inside the builder only runs when `collect` is called. Each collector gets a fresh execution. Flows are built on suspend functions — simple, sequential, and cooperative.

### Lesson 4.2: Transformation Operators

Flow operators are lazy — they build a pipeline that executes only when collected. Each operator creates a new `Flow` that wraps the upstream `Flow`.

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

**Key takeaway:** Flow operators are lazy — they build a pipeline that executes only when collected. Each operator wraps the upstream Flow and transforms values as they pass through.

### Lesson 4.3: Combining Flows

When your UI depends on multiple data sources, you need to combine flows. Kotlin provides three main strategies, each with different semantics.

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

**combine vs zip** — `combine` re-emits with every new value from any source (using the latest value from other sources). `zip` pairs values one-to-one and only emits when both sources have a new value. Use `combine` for UI state (you always want the latest). Use `zip` when you need strict pairing.

**flatMap variants** — `flatMapLatest` is for search-as-you-type (cancel the old query when a new one arrives). `flatMapConcat` processes one at a time in order. `flatMapMerge` processes concurrently (use `concurrency` parameter to limit).

**Key takeaway:** `combine` is your go-to for merging multiple data sources into a single UI state. Use `flatMapLatest` for search patterns where only the latest result matters.

### Lesson 4.4: Lifecycle Operators

Flow provides hooks for the start, each emission, and completion of a stream:

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

**onStart** runs before the first value is collected. It can emit values — this is useful for emitting a loading state before the real data arrives. **onEach** runs for every value without consuming it (the value continues downstream). **onCompletion** runs when the flow completes, either normally or with an exception. The `cause` parameter is null for normal completion and contains the exception for abnormal completion.

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

**Key takeaway:** `onStart` can emit values (great for loading states), `onEach` is for side effects on each value, and `onCompletion` handles cleanup. These operators don't consume values — they intercept them.

### Lesson 4.5: flowOn and Context Preservation

Flow has a strict rule: the `flow { }` builder must emit values in the same coroutine context as the collector. You can't just launch a coroutine inside `flow { }` and call `emit()` from it. This is called **context preservation**.

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

`flowOn` only affects upstream operators — everything above it in the chain. Everything below it (including `collect`) runs on the collector's context. This is fundamentally different from `subscribeOn`/`observeOn` in RxJava.

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

Internally, `flowOn` creates a channel between the upstream flow and the downstream collector. The upstream flow runs in its own coroutine on the specified dispatcher and sends values to the channel. The downstream collector reads from the channel on its original dispatcher. This channel is how Flow handles the context switch without violating context preservation.

**Key takeaway:** Use `flowOn` to change the dispatcher for upstream operations. Never use `withContext` inside `flow { }` to change the emission context. `flowOn` only affects operators above it — everything below runs on the collector's context.

### Lesson 4.6: debounce, sample, and Rate Limiting

When data arrives faster than you want to process it, use rate-limiting operators:

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

**debounce vs sample** — `debounce` waits for a pause in emissions. If values keep coming, it keeps waiting. This is ideal for search-as-you-type where you want to wait until the user stops typing. `sample` emits at fixed intervals regardless of emission frequency. This is better for high-frequency data like sensor readings where you want a consistent update rate.

**Key takeaway:** Use `debounce` for user input (wait until they stop typing). Use `sample` for high-frequency data (emit at fixed intervals). Build custom operators with `flow { collect { } }` for domain-specific rate limiting.

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

**Key takeaway:** Use `StateFlow` for UI state that always has a current value. It conflates by equality, replays the latest value to new collectors, and has a synchronous `value` property. It's the coroutine replacement for `LiveData`.

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

**StateFlow vs SharedFlow mental model** — `StateFlow` models **what something is right now** — the current search results, the current user profile, the loading state. `SharedFlow` models **what happened** — an analytics event fired, a payment was processed, a notification arrived. This maps directly to the state-vs-event distinction in Android architecture.

**Key takeaway:** Use `SharedFlow` for events (navigation, snackbars, analytics). Use `StateFlow` for state (UI representation). `SharedFlow` doesn't conflate and has configurable replay, buffer, and overflow.

### Lesson 5.3: stateIn — Converting Cold to Hot StateFlow

`stateIn` converts a cold `Flow` into a `StateFlow`. The result always has a current value, which you provide via `initialValue`.

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

**Why `initialValue` matters** — The `initialValue` is what your UI renders before the upstream flow has a chance to emit. Set it to a `Loading` state so the UI shows a shimmer or skeleton immediately. Don't set it to `null` — that pushes null-handling into every composable.

**Key takeaway:** `stateIn` converts a cold flow to a hot `StateFlow`. `WhileSubscribed(5_000)` is the recommended strategy for Android UI because it survives configuration changes (~300ms) while stopping when the user truly navigates away.

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

**When to use `shareIn` vs `stateIn`** — Use `stateIn` when you need a current value (UI state). Use `shareIn` when you need event distribution (analytics, navigation commands, one-time messages).

**Key takeaway:** `shareIn` converts a cold flow to a hot `SharedFlow`. Use it for events where you don't need a current value. Use `stateIn` for state where you always need a value.

### Lesson 5.5: Collecting Safely in Android UI

Collecting flows in Android requires lifecycle awareness. Without it, you collect even when the app is in the background, wasting resources and potentially crashing.

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

**`collectAsStateWithLifecycle` vs `collectAsState`** — `collectAsStateWithLifecycle()` stops collecting when the app goes to the background and restarts when foregrounded. Plain `collectAsState()` keeps collecting even when the UI isn't visible. This matters because background collection can trigger unnecessary network calls, database queries, and GPS readings.

You can customize when collection starts and stops using `minActiveState`:

```kotlin
// Start collecting when RESUMED, stop when below RESUMED
val state by viewModel.state.collectAsStateWithLifecycle(
    minActiveState = Lifecycle.State.RESUMED
)
```

**Key takeaway:** Always use `collectAsStateWithLifecycle()` in Compose and `repeatOnLifecycle` in Views. They stop collection when the app isn't visible, preventing unnecessary work and potential crashes.

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

A Channel is like a `BlockingQueue` but with suspending operations instead of blocking ones. It's a hot stream for communication between coroutines — values are sent and received, not emitted and collected.

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

**Key takeaway:** Channels provide point-to-point communication between coroutines. Each value is consumed by exactly one receiver. Always close channels when done to prevent resource leaks.

### Lesson 6.2: Channel Types and Buffering

The channel's capacity determines how send and receive interact:

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

**Rendezvous** creates tight synchronization — the sender waits for a receiver and vice versa. This is the default and the safest option.

**Buffered channels** decouple the producer from the consumer up to the buffer capacity. `Channel.BUFFERED` uses the system default of 64 elements. When the buffer is full, `send` suspends until space opens up.

**Conflated channels** keep only the latest value. If a new value is sent before the previous one is received, the old value is dropped. This is ideal for UI updates where only the current state matters.

**Unlimited channels** never suspend on send, buffering everything in memory. This is risky — if the producer is faster than the consumer, you get unbounded memory growth and eventually `OutOfMemoryError`. Use only when the total number of values is known and bounded.

**Key takeaway:** Choose the right channel type. Rendezvous for synchronization, buffered for producer-consumer decoupling, conflated for UI updates, and never use unlimited unless you're certain about bounds.

### Lesson 6.3: produce Builder and Fan-Out

The `produce` builder creates a channel-backed coroutine that automatically closes the channel when the coroutine completes:

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

**Key takeaway:** Use `produce` for structured channel creation — the channel closes automatically. Fan-out distributes work across multiple consumers. Fan-in merges multiple producers into one stream.

### Lesson 6.4: callbackFlow — Bridging Callback APIs

`callbackFlow` converts multi-shot callback APIs to cold Flows. It's built on channels internally, giving you a `ProducerScope` where you can call `send()`, `trySend()`, or `trySendBlocking()`.

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

The `awaitClose` block is critical — it suspends until the flow collector is cancelled, then runs the cleanup code. Without it, the flow would complete immediately and the callback would never fire.

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

**callbackFlow vs channelFlow** — `callbackFlow` is specifically designed for callback APIs. `channelFlow` is the general-purpose version for when you need concurrent emission from multiple coroutines:

```kotlin
fun mergedData(): Flow<Data> = channelFlow {
    launch { source1.collect { send(it) } }
    launch { source2.collect { send(it) } }
}
```

**Key takeaway:** `callbackFlow` bridges callback-based APIs to Flow. Always call `awaitClose` to clean up resources. Use `trySend` for non-blocking emission from callbacks. Use `channelFlow` when you need concurrent emission from multiple coroutines.

### Lesson 6.5: Backpressure Strategies

Backpressure occurs when data is emitted faster than it can be processed. In Kotlin Flows, the default behavior is suspension — the producer suspends until the collector is ready. But you can configure different strategies:

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

**buffer overflow strategies** — When a fixed-size buffer is full:

```kotlin
// SUSPEND (default) — producer suspends until space opens
flow.buffer(capacity = 10, BufferOverflow.SUSPEND)

// DROP_OLDEST — remove oldest value to make room for new one
flow.buffer(capacity = 10, BufferOverflow.DROP_OLDEST)

// DROP_LATEST — discard the new value when buffer is full
flow.buffer(capacity = 10, BufferOverflow.DROP_LATEST)
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

**Key takeaway:** Use `buffer` to decouple fast producers from slow collectors. `conflate` keeps only the latest value (O(1) memory). `collectLatest` cancels previous processing when new data arrives. Always use bounded buffers in production.

### Lesson 6.6: Flow Internals — How Flow Uses Channels

Understanding that Flow operators like `buffer` and `flowOn` create channels internally helps you reason about performance and behavior.

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

**Key takeaway:** `flowOn` and `buffer` create internal channels. Place `buffer` before `flowOn` to enable fusion and reduce overhead. Understanding the channel-based internals helps you reason about memory usage and performance.

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

The `catch` operator intercepts exceptions from upstream operators — everything declared above it in the chain. It does NOT catch exceptions from `collect` or operators below it.

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

`catch` can also emit values — this is how you provide fallbacks. When an exception is caught, the upstream flow is cancelled, but the downstream continues with whatever `catch` emits.

```kotlin
// Pattern: emit error state on failure, continue the flow
fun observeOrders(): Flow<OrderState> = repository
    .getOrders()
    .map { OrderState.Success(it) as OrderState }
    .onStart { emit(OrderState.Loading) }
    .catch { e -> emit(OrderState.Error(e.message)) }
```

**Key takeaway:** `catch` only catches upstream errors. Errors in `collect` or downstream operators are not caught. Use try-catch around `collect` for downstream error handling.

### Lesson 7.2: retry and retryWhen — Automatic Recovery

`retry` re-executes the entire upstream flow when an exception occurs. The predicate function receives the exception and returns `true` to retry or `false` to propagate.

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

**Key takeaway:** `retry` re-executes the entire upstream flow. Use the predicate to filter which exceptions to retry and to add delays for backoff. `catch` handles any exceptions that exhaust retries or are non-retryable.

### Lesson 7.3: Exception Transparency

Flow has a rule called **exception transparency**: the `flow { }` builder should not catch exceptions from downstream operators. This means you shouldn't use try-catch inside `flow { }` to swallow exceptions from `emit()`:

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

**Key takeaway:** Never catch exceptions from `emit()` inside a `flow { }` builder. Use `catch` and `retry` operators for error handling. This preserves exception transparency and prevents silent error swallowing.

### Lesson 7.4: Error Handling in Hot Flows

`StateFlow` and `SharedFlow` have different error handling semantics than cold flows. Since they're always active, an exception in their upstream can terminate the entire flow permanently.

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

**Key takeaway:** Always add `catch` before `stateIn` or `shareIn`. Without it, an upstream exception permanently terminates the hot flow. Add `retry` for transient errors that should trigger automatic recovery.

### Lesson 7.5: Custom Error Recovery Patterns

For complex error handling, build reusable flow extensions:

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

**Key takeaway:** Build reusable flow extensions for common error handling patterns like exponential backoff and result wrapping. This keeps your ViewModel code clean and consistent.

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

`Mutex` is the coroutine equivalent of `synchronized`. It ensures that only one coroutine executes a critical section at a time. The key difference: `Mutex` suspends the coroutine while waiting, whereas `synchronized` blocks the thread.

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

**Key takeaway:** Use `Mutex` instead of `synchronized` in coroutine code. `Mutex` suspends (frees the thread), `synchronized` blocks (wastes the thread). Be careful — `Mutex` is not reentrant and can cause deadlocks if nested.

### Lesson 8.2: Atomic Variables

For simple read-modify-write operations on single values, atomic variables are lighter weight than `Mutex`:

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

**Mutex vs Atomic** — Use atomics for simple single-variable operations (counters, flags, reference swaps). Use `Mutex` for multi-step operations where you need to read, compute, and write atomically across multiple variables.

**Key takeaway:** Atomic variables provide lock-free thread safety for simple operations. Use `AtomicInteger` for counters, `AtomicReference` for reference types. They don't require `suspend` and are lighter than `Mutex`.

### Lesson 8.3: Semaphore — Limiting Concurrency

`Semaphore` limits the number of coroutines that can access a resource concurrently. Unlike `Mutex` (which allows only 1), `Semaphore` allows N:

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

**Key takeaway:** Use `Semaphore` to limit concurrency. This prevents overwhelming servers or databases when processing large batches in parallel. With `permits = 5`, at most 5 coroutines can enter the `withPermit` block simultaneously.

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

For Kotlin Multiplatform, only `Mutex` and atomic variables are supported. `synchronized` and `ReentrantLock` are JVM-only and deprecated in KMM contexts.

**Key takeaway:** Use `Mutex` for coroutine code (suspends, not blocks). Use atomics for simple single-value operations. `synchronized` and `ReentrantLock` are JVM-only — avoid them in KMM projects.

### Lesson 8.5: Parallel Work with Structured Patterns

Production concurrent code needs structure. Here are battle-tested patterns:

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

**Key takeaway:** Use `parallelMap` with `Semaphore` for batch processing with controlled concurrency. Use `select` for racing multiple sources. Use channel-based fan-out for distributing work across a fixed pool of workers.

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

`runTest` from `kotlinx-coroutines-test` provides a coroutine scope with virtual time — `delay(1000)` doesn't actually wait a second, it advances the virtual clock instantly.

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

**Key takeaway:** `runTest` controls virtual time. Use `StandardTestDispatcher` for precise control over coroutine execution. Use `advanceTimeBy()` to skip delays and `advanceUntilIdle()` to complete all pending coroutines. Always inject dispatchers for testability.

### Lesson 9.2: Testing Flows with Turbine

Turbine is the standard library for testing Flows. It provides `test { }` which collects a Flow and lets you assert emissions one at a time:

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

**Testing StateFlow conflation** — `StateFlow` conflates duplicate values. If your ViewModel emits `Loading` then `Loading` again (same value), Turbine only sees one emission. This catches real bugs — if your state machine emits the same state twice, it won't trigger a recomposition in Compose either.

**Key takeaway:** Use Turbine for testing Flows. `awaitItem()` captures each emission sequentially. Always end test blocks with `cancelAndConsumeRemainingEvents()`. `runTest` gives you virtual time for deterministic testing.

### Lesson 9.3: Injecting Dispatchers for Testability

Hardcoded dispatchers make tests non-deterministic because they run on real threads. The fix is straightforward: inject dispatchers through constructors:

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

**Key takeaway:** Inject dispatchers through constructors for testability. Use `StandardTestDispatcher` in tests for deterministic execution. Use `EmptyCoroutineContext` instead of `Dispatchers.Unconfined` to avoid thread-safety bugs in tests.

### Lesson 9.4: ViewModel Architectural Patterns

The standard ViewModel pattern for coroutines combines `StateFlow`, `stateIn`, and injected dispatchers:

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

**Key takeaway:** Use `StateFlow` for UI state (always has a value) and `SharedFlow` for one-time events (navigation, snackbars). Combine reactive streams with `combine` and convert to `StateFlow` with `stateIn`. Use `WhileSubscribed(5_000)` for lifecycle-aware upstream management.

### Lesson 9.5: Repository Layer Patterns

Repositories bridge data sources with the presentation layer. They expose `Flow` for observable data and `suspend` functions for one-shot operations:

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

**Key takeaway:** Repositories expose `Flow` for observable data and `suspend` functions for one-shot operations. Use the offline-first pattern with Room's `Flow` — observe the database and refresh from the network in the background.

### Lesson 9.6: Testing ViewModel State Transitions

Test that your ViewModel emits the correct sequence of states:

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

**Key takeaway:** Inject `StandardTestDispatcher` tied to the same `testScheduler` as `runTest`. Use `advanceTimeBy()` for time-dependent tests. Use `advanceUntilIdle()` to complete all pending coroutines. Turbine's `awaitItem()` captures each state emission.

### Lesson 9.7: Custom Flow Operators

You can build custom operators using the `flow { }` builder. This is powerful for creating domain-specific streaming behavior:

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

**Key takeaway:** You can build custom operators using the `flow { }` builder. Custom operators use `collect` internally to consume upstream values and `emit` to send transformed values downstream.

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
