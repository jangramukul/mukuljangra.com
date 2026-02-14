---
title: "Kotlin Coroutines — Basics"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 4
sequence: 12
description: "Kotlin Coroutines is a simplified version of managing asynchronous tasks or operations in Android."
---

## Kotlin Coroutines — Basics

Kotlin Coroutines is a simplified version of managing asynchronous tasks or operations in Android. Almost every Android interview will have at least 3-5 coroutine questions — from basic suspend functions to structured concurrency.

### Core Questions (Beginner → Intermediate)

#### Q1: What are Kotlin Coroutines and why use them over threads?

Kotlin Coroutines is a simplified version of managing asynchronous tasks or operations in Android. Compared to threads, coroutines need less code, are lightweight because you can run multiple coroutine jobs on the same reusable thread, and perform better because creating a thread is an expensive operation while coroutines use a pool of reusable threads.

#### Q2: What is a suspend function?

A suspend function is a function marked with the `suspend` keyword that can be paused and resumed without blocking the thread. Under the hood, the Kotlin compiler converts a suspend function into callbacks and adds an extra parameter named `Continuation`. A suspend function can only be called from another suspend function or from within a coroutine.

```kotlin
suspend fun fetchUserProfile(userId: String): UserProfile {
    val user = userApi.getUser(userId)     // Suspends, doesn't block
    val posts = postApi.getPosts(userId)   // Suspends again
    return UserProfile(user, posts)
}
```

#### Q3: What is a CoroutineScope?

Coroutine Scope is a fundamental unit of coroutine. It is responsible for launching and managing coroutine jobs. Every coroutine runs inside a scope, and when the scope is cancelled, all coroutines within it are cancelled too. In Android, `viewModelScope` and `lifecycleScope` are the most commonly used scopes.

```kotlin
class SearchViewModel : ViewModel() {
    fun search(query: String) {
        viewModelScope.launch {
            val results = repository.search(query)
            _uiState.value = SearchState.Success(results)
        }
    }
    // When ViewModel is cleared, viewModelScope cancels all jobs
}
```

#### Q4: What is the difference between launch and async?

`launch` is fire-and-forget — it starts a coroutine and returns a `Job`. You use it when you don't need a result back. `async` starts a coroutine and returns a `Deferred<T>`, which is a future value you can retrieve by calling `await()`.

```kotlin
// launch — fire and forget, returns Job
val job = scope.launch {
    saveUserToDatabase(user)
}

// async — returns a Deferred with a result
val deferred = scope.async {
    fetchUserFromNetwork(userId)
}
val user = deferred.await() // Suspends until result is ready
```

Use `launch` for side effects like saving data or logging. Use `async` when you need to run tasks concurrently and combine their results.

#### Q5: What are Dispatchers? Explain each one.

Coroutine Dispatcher is responsible for coroutine job thread. It determines what thread (IO, Main, Default) will be used by the coroutine job.

- **Dispatchers.Main** — Used for UI operations like rendering views, updating state, and handling click events. Runs on the Android main thread.
- **Dispatchers.IO** — Used for normal input/output background tasks like network API calls, database queries, and file operations. Has a pool of 64 threads by default.
- **Dispatchers.Default** — Used for CPU-intensive tasks like complex math calculations, sorting large lists, and JSON parsing. Uses a thread pool sized to the number of CPU cores.
- **Dispatchers.Unconfined** — Starts in the caller thread but resumes in whatever thread the suspending function resumes in. Rarely used in production — mostly for testing or very specific cases.

#### Q6: What is withContext and when do you use it?

`withContext` switches the coroutine to a different dispatcher without creating a new coroutine. It suspends the current coroutine, runs the block on the specified dispatcher, and returns the result.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val db: UserDao
) {
    suspend fun getUser(userId: String): User {
        return withContext(Dispatchers.IO) {
            val user = api.fetchUser(userId)
            db.insert(user)
            user
        }
    }
}
```

`withContext` is the standard way to switch dispatchers inside a suspend function. It doesn't create a new coroutine like `launch` or `async` — it just changes the execution context of the current one. Each `Continuation` object has a `CoroutineContext`, and before resume calls, the coroutine reads the dispatcher from it and uses that dispatcher.

#### Q7: What is structured concurrency?

Structured concurrency means every coroutine has a parent scope, and the parent waits for all its children to complete. If the parent is cancelled, all children are cancelled. If a child fails with an exception, the parent and its other children are cancelled too.

```kotlin
viewModelScope.launch {
    // Both run concurrently, both are children of this scope
    val user = async { fetchUser() }
    val posts = async { fetchPosts() }

    // If fetchUser() fails, fetchPosts() is cancelled automatically
    updateUI(user.await(), posts.await())
}
```

This prevents coroutine leaks. Without structured concurrency (like with `GlobalScope`), you'd have to manually track and cancel every coroutine. The structure ensures no coroutine outlives its intended scope.

#### Q8: What is a Job and what are its lifecycle states?

A `Job` represents a cancellable piece of work. Every coroutine created with `launch` or `async` returns a `Job` (or `Deferred` which extends `Job`). A Job goes through these states:

- **New** — Created but not started yet (using `CoroutineStart.LAZY`)
- **Active** — Running. This is the default state after launch
- **Completing** — Waiting for children to finish
- **Completed** — Done successfully
- **Cancelling** — Being cancelled, running cancellation handlers
- **Cancelled** — Cancelled, terminal state

```kotlin
val job = scope.launch {
    longRunningTask()
}

job.isActive    // true while running
job.join()      // Suspends until the job completes
job.cancel()    // Cancels the job
job.cancelAndJoin() // Cancels and waits for completion
```

#### Q9: What is the difference between join and cancel on a Job?

`join()` suspends the current coroutine until the job completes — it's a way to wait for a coroutine to finish. `cancel()` requests cancellation of the job. Cancellation is cooperative — the coroutine must check for cancellation at suspension points or explicitly check `isActive`.

```kotlin
val job = scope.launch {
    repeat(1000) { i ->
        delay(100) // Suspension point — cancellation checked here
        println("Processing $i")
    }
}

delay(500)
job.cancel()  // Requests cancellation
job.join()    // Waits for cancellation to complete
// Or use job.cancelAndJoin() which does both
```

After calling `cancel()`, the coroutine doesn't stop immediately. It stops at the next suspension point like `delay()`, `yield()`, or `withContext()`.

#### Q10: What is runBlocking and when should you use it?

`runBlocking` blocks the current thread and runs a coroutine on it. It bridges the gap between regular blocking code and coroutines. The thread stays blocked until all coroutines inside finish.

```kotlin
// In tests — the primary use case
@Test
fun testFetchUser() = runBlocking {
    val user = repository.getUser("123")
    assertEquals("Mukul", user.name)
}

// In main function
fun main() = runBlocking {
    val result = fetchData()
    println(result)
}
```

Never use `runBlocking` on the main thread in an Android app — it will freeze the UI. It's meant for testing and `main()` functions. In Android, use `viewModelScope.launch` or `lifecycleScope.launch` instead.

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is SupervisorJob and how is it different from a regular Job?

With a regular `Job`, if any child coroutine fails, the parent and all sibling coroutines are cancelled. `SupervisorJob` changes this — a failing child does not affect the parent or other children.

```kotlin
// Regular Job — one failure cancels everything
val scope = CoroutineScope(Job() + Dispatchers.Main)
scope.launch { fetchUser() }    // If this fails...
scope.launch { fetchPosts() }   // ...this gets cancelled too

// SupervisorJob — failures are isolated
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
scope.launch { fetchUser() }    // If this fails...
scope.launch { fetchPosts() }   // ...this keeps running
```

`viewModelScope` uses `SupervisorJob` internally. This makes sense because you don't want a failed search request to cancel an unrelated save operation happening in the same ViewModel.

#### Q12: What is the difference between coroutineScope and supervisorScope?

`coroutineScope` and `supervisorScope` are both suspend functions that create a new scope and wait for all children to complete. The difference is how they handle failures.

`coroutineScope` cancels all children if any child fails — it follows regular structured concurrency. `supervisorScope` lets each child fail independently — it uses `SupervisorJob` underneath.

```kotlin
// coroutineScope — one failure cancels all
suspend fun loadData() = coroutineScope {
    val user = async { fetchUser() }       // If this fails...
    val settings = async { fetchSettings() } // ...this is cancelled
    Pair(user.await(), settings.await())
}

// supervisorScope — failures are independent
suspend fun loadData() = supervisorScope {
    val user = async { fetchUser() }       // If this fails...
    val settings = async { fetchSettings() } // ...this continues
    val userResult = runCatching { user.await() }
    val settingsResult = runCatching { settings.await() }
}
```

Use `coroutineScope` when the tasks depend on each other — if one fails, the others are useless. Use `supervisorScope` when tasks are independent and you want partial results.

#### Q13: How does the Continuation interface work under the hood?

Under the hood, the Kotlin compiler converts a suspend function into callbacks and adds an extra parameter named `Continuation`. A `Continuation` is a simple interface with a `CoroutineContext` and a `resumeWith` function.

```kotlin
// What you write
suspend fun fetchUser(userId: String): User

// What the compiler generates (simplified)
fun fetchUser(userId: String, completion: Continuation<User>): Any? {
    // Returns COROUTINE_SUSPENDED if suspended
    // Returns User if completed synchronously
}
```

The return type becomes `Any?` because it's a union of the actual return type `T` and `COROUTINE_SUSPENDED`. When the coroutine suspends, it returns `COROUTINE_SUSPENDED` to the caller. When it completes, the `Continuation.resumeWith()` delivers the result. Each suspension point in the function becomes a state in a compiler-generated state machine, with labels tracking which state to resume from.

#### Q14: What is CoroutineContext and what does it contain?

Coroutine Context is like a bag of coroutine dispatcher, coroutine name, exception handler, and other elements. It's an indexed set of `Element` instances where each element has a unique key. Common elements include:

- **Job** — Controls the lifecycle (cancellation, parent-child relationship)
- **CoroutineDispatcher** — Determines the execution thread
- **CoroutineName** — Debug name for the coroutine
- **CoroutineExceptionHandler** — Handles uncaught exceptions

```kotlin
val context = SupervisorJob() +
    Dispatchers.IO +
    CoroutineName("DataSync") +
    CoroutineExceptionHandler { _, exception ->
        log("Sync failed: ${exception.message}")
    }

val scope = CoroutineScope(context)
```

Contexts are combined using the `+` operator, and child coroutines inherit the parent's context. A child can override specific elements — like switching the dispatcher with `withContext(Dispatchers.IO)` while keeping the parent's Job and exception handler.

#### Q15: How does viewModelScope work internally?

`viewModelScope` is an extension property on `ViewModel` that creates a `CoroutineScope` tied to the ViewModel's lifecycle. It uses `SupervisorJob() + Dispatchers.Main.immediate` as its context.

When `ViewModel.onCleared()` is called, the scope's `Job` is cancelled, which cancels all coroutines launched in that scope. `Dispatchers.Main.immediate` means coroutines execute on the main thread and dispatch immediately if already on the main thread, avoiding unnecessary re-dispatching.

Before `viewModelScope` existed, you had to create a custom scope in `init` and cancel it in `onCleared()` manually. `lifecycleScope` works the same way but is tied to the `LifecycleOwner` (Activity or Fragment) lifecycle instead.

#### Q16: What is the difference between GlobalScope and a custom CoroutineScope?

`GlobalScope` lives for the entire application lifetime and has no parent Job. Coroutines launched in `GlobalScope` are not tied to any lifecycle, so they keep running even after the Activity or ViewModel is destroyed. This breaks structured concurrency and can cause memory leaks.

```kotlin
// Bad — no lifecycle awareness
GlobalScope.launch {
    // Keeps running even after Activity is destroyed
    val data = heavyComputation()
    updateUI(data) // Potential crash — Activity gone
}

// Good — tied to ViewModel lifecycle
viewModelScope.launch {
    val data = heavyComputation()
    updateUI(data) // Safe — cancelled when ViewModel clears
}
```

`GlobalScope` should only be used for truly application-level operations that must outlive any single screen — like writing to a log file or sending analytics. Even then, a custom `CoroutineScope` in your `Application` class is better because you can cancel it during testing.

#### Q17: How does structured concurrency prevent coroutine leaks?

Structured concurrency enforces a parent-child hierarchy where the parent scope cannot complete until all children complete. This creates three guarantees:

- **Lifecycle binding** — When the scope is cancelled, all coroutines are cancelled. A `viewModelScope` coroutine can never outlive its ViewModel.
- **Error propagation** — An unhandled exception in a child cancels the parent and all siblings (unless using `SupervisorJob`).
- **Completion ordering** — A parent coroutine waits for all children before completing.

Without structured concurrency, every coroutine launched with `GlobalScope` or a raw `CoroutineScope(Dispatchers.IO)` without cancellation is a potential leak. If an Activity launches a coroutine that does a network call and the user navigates away, the coroutine keeps the Activity reference alive until it completes.

#### Q18: What is Dispatchers.Main.immediate and how is it different from Dispatchers.Main?

`Dispatchers.Main` always dispatches through the message queue, even if you're already on the main thread. `Dispatchers.Main.immediate` checks whether you're already on the main thread — if yes, it executes immediately without dispatching.

This matters for performance. If a coroutine on the main thread calls `withContext(Dispatchers.Main)`, it unnecessarily posts to the handler queue and executes on the next message loop iteration. With `Dispatchers.Main.immediate`, it runs right away if already on the main thread.

`viewModelScope` and `lifecycleScope` both use `Dispatchers.Main.immediate` by default for this reason. The difference is noticeable in rapid UI updates where the extra dispatch adds visible latency.

#### Q19: Can you call a suspend function from a regular function? What are the options?

You cannot call a suspend function directly from a regular function — the compiler enforces this. You need a coroutine to bridge the gap. The options are:

- **launch or async** from a `CoroutineScope` — the standard approach in Android
- **runBlocking** — blocks the thread until the coroutine completes, only for tests and `main()`
- **Callback pattern** — launch a coroutine internally and deliver the result via callback

```kotlin
// Standard approach — from a ViewModel
fun loadUser() {
    viewModelScope.launch {
        val user = fetchUser() // suspend function
        _state.value = UserState.Loaded(user)
    }
}

// Callback bridge — for legacy code
fun fetchUser(callback: (User) -> Unit) {
    scope.launch {
        val user = userRepository.getUser()
        callback(user)
    }
}
```

#### Q20: How do you run two suspend functions in parallel?

Use `async` to launch both concurrently and `await` to collect their results. Without `async`, calling two suspend functions sequentially means the second one waits for the first to finish.

```kotlin
// Sequential — takes ~2 seconds total
suspend fun loadSequential(): UserData {
    val user = fetchUser()       // 1 second
    val posts = fetchPosts()     // 1 second
    return UserData(user, posts)
}

// Parallel — takes ~1 second total
suspend fun loadParallel(): UserData = coroutineScope {
    val user = async { fetchUser() }     // Starts immediately
    val posts = async { fetchPosts() }   // Starts immediately
    UserData(user.await(), posts.await()) // Waits for both
}
```

Wrapping parallel calls in `coroutineScope` ensures structured concurrency — if `fetchUser()` fails, `fetchPosts()` is cancelled automatically instead of running uselessly.

### Common Follow-ups

- What happens if you call `delay()` vs `Thread.sleep()` inside a coroutine?
- How does cancellation work with `withContext(NonCancellable)`?
- What's the difference between `scope.launch` and `launch` inside a `coroutineScope` block?
- How do you handle exceptions in `launch` vs `async`? Where does the exception surface?
- What happens if you cancel a Job but the coroutine doesn't have any suspension points?
- How does `viewModelScope` get cancelled — who calls `cancel()` on it?
- What's the difference between `CoroutineScope(Dispatchers.IO)` and `withContext(Dispatchers.IO)`?
- Can a coroutine switch dispatchers mid-execution without `withContext`?
