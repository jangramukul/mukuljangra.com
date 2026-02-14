---
title: "Kotlin Coroutines — Advanced"
date: 2026-02-14
layout: interview
tags: [Kotlin Round]
order: 5
level: mid
sequence: 30
---

## Kotlin Coroutines — Advanced

Advanced coroutine questions test whether you actually understand what happens under the hood — CPS transformation, state machines, cancellation cooperation, and concurrency primitives. These come up frequently at Google, Meta, and other companies with heavy Kotlin codebases.

### Core Questions (Beginner → Intermediate)

#### Q1: What is CPS transformation and how does the Kotlin compiler handle suspend functions?

Under the hood, Kotlin Compiler converts a suspend function into callbacks and adds an extra parameter named Continuation. A Continuation is an interface with a `CoroutineContext` and a `resumeWith(result)` function. The compiler rewrites every suspend function to accept this extra parameter so coroutines can pause and resume execution without blocking threads.

```kotlin
// What you write
suspend fun fetchUser(userId: String): User { ... }

// What the compiler generates (simplified)
fun fetchUser(userId: String, continuation: Continuation<User>): Any? {
    // returns User or COROUTINE_SUSPENDED
}
```

The bytecode of this suspend function returns `Any?` because it's a union type of `T | COROUTINE_SUSPENDED`. When the coroutine suspends, it returns `COROUTINE_SUSPENDED` to the caller. When it completes, it returns the actual result through the Continuation.

#### Q2: What is the state machine that the compiler generates for suspend functions?

The Conversion of suspend modifier or coroutines into bytecode by the compiler is also named as State Machine. The compiler assigns each suspension point a label (an integer). A `when` block checks the label to know which part of the function to execute next. Each time the coroutine suspends, it saves the current label and local variables into the Continuation object, and when it resumes, it jumps to the correct label.

```kotlin
// Compiler-generated pseudocode for a function with two suspension points
fun fetchUser(userId: String, cont: Continuation<Any?>): Any? {
    val sm = cont as? FetchUserContinuation ?: FetchUserContinuation(cont)
    when (sm.label) {
        0 -> {
            sm.label = 1
            val result = getProfile(userId, sm) // suspension point 1
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
        }
        1 -> {
            sm.label = 2
            val result = getSettings(sm.userId, sm) // suspension point 2
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
        }
        2 -> {
            return User(sm.profile, sm.settings)
        }
    }
}
```

This means a suspend function with 3 suspension points generates a state machine with 4 states (0, 1, 2, 3). No extra threads or callbacks are created — it's just a `when` block that resumes where it left off.

#### Q3: How does coroutine cancellation work? What does "cooperative cancellation" mean?

Coroutine cancellation is cooperative — calling `cancel()` on a Job doesn't forcefully stop the coroutine. It sets the Job's state to "cancelling" and throws a `CancellationException` at the next suspension point. If your coroutine never suspends (like a tight computation loop), it will never be cancelled.

You can check for cancellation in three ways:
- **`isActive`** — Check the flag manually in loops: `while (isActive) { ... }`
- **`ensureActive()`** — Throws `CancellationException` immediately if the coroutine is cancelled. More concise than checking `isActive`
- **`yield()`** — Checks for cancellation and also gives other coroutines a chance to run on the same dispatcher

`ensureActive()` is preferred over `isActive` in most cases because it throws immediately — with `isActive` you need to handle the exit yourself.

#### Q4: What is the difference between ensureActive() and yield()?

Both check for cancellation, but they behave differently. `ensureActive()` only checks whether the coroutine is still active and throws `CancellationException` if it's not. It doesn't suspend — it's a simple check.

`yield()` does three things: checks for cancellation, suspends the coroutine, and gives the dispatcher a chance to run other coroutines. If you have two coroutines on `Dispatchers.Main` and one is doing heavy work, `yield()` lets the other one get CPU time.

```kotlin
suspend fun processItems(items: List<Item>) {
    for (item in items) {
        ensureActive() // just cancellation check, no suspension
        process(item)
    }
}

suspend fun processItemsFairly(items: List<Item>) {
    for (item in items) {
        yield() // cancellation check + lets other coroutines run
        process(item)
    }
}
```

Use `ensureActive()` when you only care about cancellation. Use `yield()` when you want to be fair with shared dispatchers.

#### Q5: How does exception handling work in coroutines? What's the difference between try/catch and CoroutineExceptionHandler?

`try/catch` works inside a coroutine the same way it works in regular code — you wrap the suspend call and catch the exception. This is the standard way to handle exceptions for `async` and regular suspend functions.

`CoroutineExceptionHandler` is a last-resort handler that catches uncaught exceptions from `launch` coroutines. It only works when installed on the root coroutine scope or the root `launch` — it doesn't catch exceptions from child coroutines or `async` blocks.

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    Log.e("Coroutine", "Caught: ${exception.message}")
}

val scope = CoroutineScope(SupervisorJob() + handler)

scope.launch {
    throw RuntimeException("crash") // caught by handler
}

scope.async {
    throw RuntimeException("crash") // NOT caught by handler
    // exception surfaces when you call .await()
}
```

For `async`, the exception is deferred — it's thrown when you call `.await()`. You must wrap `.await()` in a `try/catch` to handle it.

#### Q6: How do exceptions propagate in a coroutine hierarchy?

When a child coroutine throws an exception, it propagates upward to the parent. The parent cancels all its other children, then propagates the exception to its own parent. This continues until it reaches the root scope. This is the default behavior with a regular `Job`.

With `SupervisorJob`, the failure of one child doesn't affect other children. The exception is handled locally — either by the child's own `try/catch` or by the `CoroutineExceptionHandler` on the scope.

```kotlin
// Regular Job — one failure cancels everything
coroutineScope {
    launch { delay(1000); println("Task 1") } // cancelled
    launch { throw Exception("failed") }       // fails
}

// SupervisorJob — siblings survive
supervisorScope {
    launch { delay(1000); println("Task 1") } // still runs
    launch { throw Exception("failed") }       // fails alone
}
```

`coroutineScope` rethrows the exception, so you can wrap it in `try/catch`. `supervisorScope` does not rethrow — each child handles its own failures.

#### Q7: What is NonCancellable and when would you use it?

`NonCancellable` is a special `Job` that can never be cancelled. You use it with `withContext(NonCancellable)` to run cleanup code even after a coroutine has been cancelled. Once a coroutine is in the "cancelling" state, any new suspend calls inside it will immediately throw `CancellationException` — unless you switch to `NonCancellable`.

```kotlin
suspend fun saveData(data: Data) {
    try {
        uploadToServer(data)
    } finally {
        // Without NonCancellable, this save might not complete
        // because the coroutine is already cancelled
        withContext(NonCancellable) {
            localDb.save(data) // guaranteed to complete
        }
    }
}
```

The typical use case is persisting data in a `finally` block — saving to a database, logging analytics, or closing a resource. Without `NonCancellable`, the suspend call in `finally` would be immediately cancelled.

#### Q8: What is Mutex and how is it different from synchronized?

Mutex is used for protecting the shared resources between coroutines. Mutex ensures that only one specific portion of code can be executed at one point of time. The key difference from `synchronized` is that Mutex suspends the coroutine instead of blocking the thread — this means other coroutines can use that thread while waiting for the lock.

```kotlin
private val mutex = Mutex()
private var counter = 0

suspend fun incrementSafely() {
    mutex.withLock {
        counter++
    }
}
```

`synchronized` blocks the thread entirely, which defeats the purpose of coroutines. In KMM projects, `synchronized` isn't even available — only Mutex and atomic variables work across platforms. One gotcha: Mutex is not reentrant by default. If a coroutine tries to lock a Mutex it already holds, it causes a deadlock.

### Deep Dive Questions (Advanced → Expert)

#### Q9: What is Semaphore and how does it differ from Mutex?

Mutex allows exactly one coroutine to access a resource. Semaphore allows a configurable number of coroutines. You create it with `Semaphore(permits)` where `permits` is the maximum number of concurrent accesses. When all permits are taken, the next coroutine suspends until one is released.

```kotlin
val semaphore = Semaphore(permits = 3)

suspend fun makeApiCall() {
    semaphore.withPermit {
        // At most 3 coroutines execute this block concurrently
        api.fetchData()
    }
}
```

Semaphore is useful for rate-limiting — for example, limiting concurrent network requests to avoid overwhelming a server. Mutex is essentially a Semaphore with `permits = 1`.

#### Q10: Explain Channel types — Rendezvous, Buffered, Conflated, and Unlimited.

Channels are used for communication between coroutines. Channel is an asynchronous stream of values. The four types differ in how they handle the buffer between sender and receiver:

- **Rendezvous (`Channel()` or `Channel(0)`)** — No buffer. The sender suspends until a receiver is ready, and vice versa. Both meet at the same time. This is the default
- **Buffered (`Channel(capacity)`)** — Has a fixed-size buffer. The sender only suspends when the buffer is full. Default buffered capacity is 64 elements
- **Conflated (`Channel(Channel.CONFLATED)`)** — Single-slot buffer that keeps only the latest value. If the receiver is slow, intermediate values are dropped
- **Unlimited (`Channel(Channel.UNLIMITED)`)** — No capacity limit. The sender never suspends. Risk of `OutOfMemoryError` if the receiver can't keep up

```kotlin
val rendezvous = Channel<Int>()           // sender waits for receiver
val buffered = Channel<Int>(10)           // 10-element buffer
val conflated = Channel<Int>(CONFLATED)   // keeps latest only
val unlimited = Channel<Int>(UNLIMITED)   // no limit, risky
```

In practice, use buffered channels with a reasonable capacity. Unlimited channels should only be used when you know the number of elements is bounded.

#### Q11: How does the select expression work with Channels?

`select` lets a coroutine wait on multiple suspending operations simultaneously and proceed with whichever one completes first. It works with Channel's `onReceive`, `onReceiveCatching`, and `onSend` clauses.

```kotlin
val channel1 = Channel<String>()
val channel2 = Channel<String>()

suspend fun receiveFirst(): String = select {
    channel1.onReceive { value -> "From channel1: $value" }
    channel2.onReceive { value -> "From channel2: $value" }
}
```

`select` is biased — if multiple clauses are ready at the same time, the first one in the code wins. It's useful for implementing timeouts, racing multiple data sources, or fan-in patterns where you consume from multiple producers.

#### Q12: What is suspendCoroutine and when do you use it?

`suspendCoroutine` is used for single-shot callbacks. It suspends the current coroutine and gives you a `Continuation` object that you can call `resume()` or `resumeWithException()` on. The coroutine will suspend until `resume(result)` is called.

```kotlin
suspend fun fetchLocation(): Location = suspendCoroutine { continuation ->
    locationClient.getLastLocation()
        .addOnSuccessListener { location ->
            continuation.resume(location)
        }
        .addOnFailureListener { exception ->
            continuation.resumeWithException(exception)
        }
}
```

This is the bridge between callback-based APIs and coroutines. You can only call `resume` once — calling it twice throws `IllegalStateException`. For APIs where you need cancellation support, use `suspendCancellableCoroutine` instead.

#### Q13: What is suspendCancellableCoroutine and how does it differ from suspendCoroutine?

`suspendCancellableCoroutine` allows handling cancellation properly. If the coroutine is cancelled before the callback fires, `invokeOnCancellation` is executed so you can clean up — unregister listeners, cancel network requests, or release resources.

```kotlin
suspend fun fetchLocation(): Location = suspendCancellableCoroutine { cont ->
    val task = locationClient.getLastLocation()
    task.addOnSuccessListener { location ->
        if (cont.isActive) {
            cont.resume(location)
        }
    }
    task.addOnFailureListener { exception ->
        if (cont.isActive) {
            cont.resumeWithException(exception)
        }
    }
    cont.invokeOnCancellation {
        task.cancel() // clean up the underlying request
    }
}
```

Always check `cont.isActive` before calling `resume` because the coroutine might have been cancelled between the callback firing and your resume call. In production code, prefer `suspendCancellableCoroutine` over `suspendCoroutine` — there's almost no reason to use the non-cancellable version.

#### Q14: How do you handle the case where a Mutex causes a deadlock? What is reentrant locking?

A deadlock happens when a coroutine tries to lock a Mutex it already holds. Since Mutex is not reentrant by default, the coroutine waits forever for a lock it can never release.

```kotlin
val mutex = Mutex()

suspend fun outer() {
    mutex.withLock {
        inner() // deadlock — mutex is already locked
    }
}

suspend fun inner() {
    mutex.withLock {
        // never reaches here
    }
}
```

A Reentrant Lock allows the same thread or coroutine to acquire the same lock multiple times without deadlocking. Kotlin's Mutex doesn't have built-in reentrant support, but you can implement it by tracking the owner coroutine or restructuring your code to avoid nested locking. The simplest fix is to extract the shared logic into a function that assumes the lock is already held and call it from both places.

#### Q15: What happens when you call cancel() on a coroutine that's performing a non-cancellable operation like a CPU-intensive loop?

Nothing happens until the coroutine hits a suspension point. A tight loop like `while (true) { compute() }` will never be cancelled because it never suspends. The cancellation flag is set on the Job, but no one checks it.

```kotlin
// This will NOT be cancelled
launch {
    var i = 0
    while (i < 1_000_000) {
        heavyComputation(i) // no suspension point
        i++
    }
}

// This WILL be cancelled
launch {
    var i = 0
    while (i < 1_000_000) {
        ensureActive() // checks cancellation, throws if cancelled
        heavyComputation(i)
        i++
    }
}
```

For CPU-bound work, sprinkle `ensureActive()` or `yield()` calls at regular intervals. Without these, calling `job.cancel()` has no effect until the next `delay()`, `withContext()`, or other suspend call.

#### Q16: Explain Swap Dispatchers — how does withContext actually switch threads?

Each Continuation object holds a `CoroutineContext` which includes the dispatcher. Before `resume` or `resumeWithException` is called, the coroutine reads the dispatcher from the CoroutineContext and dispatches the resumption to the correct thread. This is called Swap Dispatchers.

```kotlin
suspend fun fetchAndDisplay() {
    val data = withContext(Dispatchers.IO) {
        // runs on IO thread pool
        api.fetchData()
    }
    // automatically resumes on the original dispatcher
    updateUI(data)
}
```

`withContext` doesn't create a new coroutine — it switches the dispatcher of the current coroutine. When the block completes, it reads the parent's dispatcher from the Continuation and dispatches back. This is why `withContext` is more efficient than `launch` + `join` for simple thread switching.

#### Q17: How do you convert a callback-based API that fires multiple times into a coroutine-friendly API?

For single-shot callbacks, use `suspendCancellableCoroutine`. For multi-shot callbacks that fire multiple times, use `callbackFlow`. It creates a cold Flow backed by a Channel.

```kotlin
fun locationUpdates(): Flow<Location> = callbackFlow {
    val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            trySend(result.lastLocation)
        }
    }
    locationClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
    awaitClose {
        locationClient.removeLocationUpdates(callback)
    }
}
```

`awaitClose` suspends the flow until the collector cancels. When the collector is cancelled (or the scope is cancelled), the lambda inside `awaitClose` runs — this is where you unregister the callback. Without `awaitClose`, the flow completes immediately and the callback is never cleaned up.

#### Q18: What is the difference between coroutineScope and supervisorScope in terms of exception handling?

`coroutineScope` follows structured concurrency strictly — if any child fails, all other children are cancelled and the exception is rethrown. It's a "one fails, all fail" model.

`supervisorScope` isolates failures. A failing child doesn't affect its siblings. Each child must handle its own exceptions. If a child throws and it's not caught, the exception goes to the `CoroutineExceptionHandler` (if one is installed) but doesn't cancel the scope.

```kotlin
// All-or-nothing: if fetchProfile fails, fetchSettings is cancelled
suspend fun loadUserData(): UserData = coroutineScope {
    val profile = async { fetchProfile() }
    val settings = async { fetchSettings() }
    UserData(profile.await(), settings.await())
}

// Independent: fetchSettings keeps running even if fetchProfile fails
suspend fun loadUserData(): UserData = supervisorScope {
    val profile = async { runCatching { fetchProfile() }.getOrNull() }
    val settings = async { fetchSettings() }
    UserData(profile.await(), settings.await())
}
```

Use `coroutineScope` when all tasks must succeed together. Use `supervisorScope` when tasks are independent — like loading a dashboard where some widgets can fail without affecting others.

### Common Follow-ups

- What's the difference between `Job` and `SupervisorJob`? Can you install `SupervisorJob` on a child coroutine?
- How does `CoroutineExceptionHandler` interact with `SupervisorJob`?
- What happens if you call `resume()` twice on the same Continuation?
- How does `Dispatchers.Unconfined` work and when would you use it?
- Can you explain what happens at the bytecode level when a suspend function has no suspension points?
- How would you implement a rate limiter using Semaphore?
- What's the difference between `Channel.close()` and `Channel.cancel()`?
- How does backpressure work with Channels vs Flows?
