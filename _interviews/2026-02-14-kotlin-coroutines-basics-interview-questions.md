---
title: "Kotlin Coroutines — Basics"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 12
sequence: 12
description: "Kotlin Coroutines is a simplified version of managing asynchronous tasks or operations in Android."
---

## Kotlin Coroutines — Basics

Kotlin Coroutines is a simplified version of managing asynchronous tasks or operations in Android. Almost every Android interview will have at least 3-5 coroutine questions — from basic suspend functions to structured concurrency.

#### What are Kotlin Coroutines and why use them over threads?

Kotlin Coroutines is a simplified version of managing asynchronous tasks or operations in Android. Compared to threads, coroutines need less code, are lightweight because you can run multiple coroutine jobs on the same reusable thread, and perform better because creating a thread is expensive while coroutines use a pool of reusable threads.

#### What is a suspend function?

A suspend function is a function marked with the `suspend` keyword that can be paused and resumed without blocking the thread. Under the hood, the Kotlin compiler converts a suspend function into callbacks and adds an extra parameter named `Continuation`. A suspend function can only be called from another suspend function or from within a coroutine.

```kotlin
suspend fun fetchUserProfile(userId: String): UserProfile {
    val user = userApi.getUser(userId)
    val posts = postApi.getPosts(userId)
    return UserProfile(user, posts)
}
```

#### What is a CoroutineScope?

CoroutineScope is a fundamental unit of coroutine. It is responsible for launching and managing coroutine jobs. Every coroutine runs inside a scope, and when the scope is cancelled, all coroutines within it are cancelled too. In Android, `viewModelScope` and `lifecycleScope` are the most commonly used scopes.

```kotlin
class SearchViewModel : ViewModel() {
    fun search(query: String) {
        viewModelScope.launch {
            val results = repository.search(query)
            _uiState.value = SearchState.Success(results)
        }
    }
}
```

#### What is the difference between launch and async?

`launch` is fire-and-forget — it starts a coroutine and returns a `Job`. Use it when you don't need a result. `async` starts a coroutine and returns a `Deferred<T>`, which you retrieve by calling `await()`.

```kotlin
val job = scope.launch {
    saveUserToDatabase(user)
}

val deferred = scope.async {
    fetchUserFromNetwork(userId)
}
val user = deferred.await()
```

Use `launch` for side effects like saving data. Use `async` when you need to run tasks concurrently and combine their results.

#### What are Dispatchers? Explain each one.

Dispatcher determines what thread will be used by the coroutine job.

- **Dispatchers.Main** — For UI operations. Runs on the Android main thread.
- **Dispatchers.IO** — For network calls, database queries, file operations. Has a pool of 64 threads by default.
- **Dispatchers.Default** — For CPU-intensive tasks like sorting large lists and JSON parsing. Uses a thread pool sized to the number of CPU cores.
- **Dispatchers.Unconfined** — Starts in the caller thread but resumes in whatever thread the suspending function resumes in. Rarely used in production.

#### What is withContext and when do you use it?

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

`withContext` doesn't create a new coroutine — it just changes the execution context of the current one.

#### What is structured concurrency?

Structured concurrency means every coroutine has a parent scope, and the parent waits for all its children to complete. If the parent is cancelled, all children are cancelled. If a child fails with an exception, the parent and its other children are cancelled too.

```kotlin
viewModelScope.launch {
    val user = async { fetchUser() }
    val posts = async { fetchPosts() }
    // If fetchUser() fails, fetchPosts() is cancelled automatically
    updateUI(user.await(), posts.await())
}
```

This prevents coroutine leaks. Without structured concurrency (like with `GlobalScope`), you'd have to manually track and cancel every coroutine.

#### What is a Job and what are its lifecycle states?

A `Job` represents a cancellable piece of work. Every coroutine created with `launch` or `async` returns a `Job` (or `Deferred` which extends `Job`).

States: **New** (created with `LAZY`), **Active** (running), **Completing** (waiting for children), **Completed** (done), **Cancelling** (being cancelled), **Cancelled** (terminal).

```kotlin
val job = scope.launch {
    longRunningTask()
}

job.isActive
job.join()          // suspends until done
job.cancel()        // requests cancellation
job.cancelAndJoin() // cancels and waits
```

#### What is the difference between join and cancel on a Job?

`join()` suspends the current coroutine until the job completes. `cancel()` requests cancellation. Cancellation is cooperative — the coroutine must check for cancellation at suspension points or explicitly check `isActive`.

After calling `cancel()`, the coroutine doesn't stop immediately. It stops at the next suspension point like `delay()`, `yield()`, or `withContext()`.

#### What is SupervisorJob and how is it different from a regular Job?

With a regular `Job`, if any child fails, the parent and all siblings are cancelled. `SupervisorJob` changes this — a failing child does not affect the parent or other children.

```kotlin
// Regular Job — one failure cancels everything
val scope = CoroutineScope(Job() + Dispatchers.Main)

// SupervisorJob — failures are isolated
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
scope.launch { fetchUser() }    // if this fails...
scope.launch { fetchPosts() }   // ...this keeps running
```

`viewModelScope` uses `SupervisorJob` internally. You don't want a failed search request to cancel an unrelated save operation.

#### What is the difference between coroutineScope and supervisorScope?

Both create a new scope and wait for all children to complete. `coroutineScope` cancels all children if any child fails. `supervisorScope` lets each child fail independently.

```kotlin
// coroutineScope — one failure cancels all
suspend fun loadData() = coroutineScope {
    val user = async { fetchUser() }
    val settings = async { fetchSettings() }
    Pair(user.await(), settings.await())
}

// supervisorScope — failures are independent
suspend fun loadData() = supervisorScope {
    val user = async { fetchUser() }
    val settings = async { fetchSettings() }
    val userResult = runCatching { user.await() }
    val settingsResult = runCatching { settings.await() }
}
```

Use `coroutineScope` when tasks depend on each other. Use `supervisorScope` when tasks are independent and you want partial results.

#### What is CoroutineContext and what does it contain?

CoroutineContext is like a bag of elements — dispatcher, job, name, exception handler. Each element has a unique key.

- **Job** — Controls lifecycle and parent-child relationship
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

Contexts are combined with `+`. Child coroutines inherit the parent's context but can override specific elements.

#### What is runBlocking and when should you use it?

`runBlocking` blocks the current thread and runs a coroutine on it. It bridges blocking code and coroutines.

```kotlin
@Test
fun testFetchUser() = runBlocking {
    val user = repository.getUser("123")
    assertEquals("Mukul", user.name)
}
```

Never use `runBlocking` on the main thread in Android — it freezes the UI. It's meant for testing and `main()` functions.

#### How does viewModelScope work internally?

`viewModelScope` is an extension property on `ViewModel` that creates a `CoroutineScope` with `SupervisorJob() + Dispatchers.Main.immediate`. When `ViewModel.onCleared()` is called, the scope's Job is cancelled, which cancels all coroutines launched in that scope.

`Dispatchers.Main.immediate` means coroutines execute on the main thread and dispatch immediately if already on the main thread, avoiding unnecessary re-dispatching.

#### What is Dispatchers.Main.immediate and how is it different from Dispatchers.Main?

`Dispatchers.Main` always dispatches through the message queue, even if you're already on the main thread. `Dispatchers.Main.immediate` checks whether you're already on the main thread — if yes, it executes immediately without dispatching.

`viewModelScope` and `lifecycleScope` both use `Dispatchers.Main.immediate` by default. The difference is noticeable in rapid UI updates where the extra dispatch adds visible latency.

#### What is the difference between GlobalScope and a custom CoroutineScope?

`GlobalScope` lives for the entire application lifetime and has no parent Job. Coroutines launched in `GlobalScope` are not tied to any lifecycle, so they keep running even after the Activity or ViewModel is destroyed. This breaks structured concurrency and can cause memory leaks.

```kotlin
// Bad — no lifecycle awareness
GlobalScope.launch {
    val data = heavyComputation()
    updateUI(data) // potential crash
}

// Good — tied to ViewModel lifecycle
viewModelScope.launch {
    val data = heavyComputation()
    updateUI(data)
}
```

`GlobalScope` should only be used for truly application-level operations. Even then, a custom `CoroutineScope` in your `Application` class is better.

#### How do you run two suspend functions in parallel?

Use `async` to launch both concurrently and `await` to collect results.

```kotlin
// Sequential — ~2 seconds total
suspend fun loadSequential(): UserData {
    val user = fetchUser()       // 1 second
    val posts = fetchPosts()     // 1 second
    return UserData(user, posts)
}

// Parallel — ~1 second total
suspend fun loadParallel(): UserData = coroutineScope {
    val user = async { fetchUser() }
    val posts = async { fetchPosts() }
    UserData(user.await(), posts.await())
}
```

Wrapping in `coroutineScope` ensures structured concurrency — if `fetchUser()` fails, `fetchPosts()` is cancelled automatically.

#### Can you call a suspend function from a regular function?

You cannot call a suspend function directly from a regular function. You need a coroutine to bridge the gap:

- **launch or async** from a `CoroutineScope` — standard approach in Android
- **runBlocking** — blocks the thread, only for tests and `main()`
- **Callback pattern** — launch a coroutine internally and deliver via callback

```kotlin
fun loadUser() {
    viewModelScope.launch {
        val user = fetchUser()
        _state.value = UserState.Loaded(user)
    }
}
```

#### How does structured concurrency prevent coroutine leaks?

Structured concurrency enforces a parent-child hierarchy where the parent scope cannot complete until all children complete. This gives three guarantees:

- **Lifecycle binding** — When the scope is cancelled, all coroutines are cancelled.
- **Error propagation** — An unhandled exception in a child cancels the parent and siblings (unless `SupervisorJob`).
- **Completion ordering** — A parent waits for all children before completing.

Without structured concurrency, every coroutine launched with `GlobalScope` is a potential leak.

### Common Follow-ups

- What happens if you call `delay()` vs `Thread.sleep()` inside a coroutine?
- How does cancellation work with `withContext(NonCancellable)`?
- What's the difference between `scope.launch` and `launch` inside a `coroutineScope` block?
- How do you handle exceptions in `launch` vs `async`?
- What happens if you cancel a Job but the coroutine has no suspension points?
- How does `viewModelScope` get cancelled — who calls `cancel()` on it?
- What's the difference between `CoroutineScope(Dispatchers.IO)` and `withContext(Dispatchers.IO)`?
