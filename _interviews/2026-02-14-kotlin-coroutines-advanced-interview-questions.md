---
title: "Kotlin Coroutines — Advanced"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 13
sequence: 13
description: "Advanced coroutine questions test whether you actually understand what happens under the hood — CPS transformation, state machines, cancellation cooperation, and concurrency primitives."
---

## Kotlin Coroutines — Advanced

Advanced coroutine questions test whether you actually understand what happens under the hood — CPS transformation, state machines, cancellation cooperation, and concurrency primitives. These come up frequently at companies with heavy Kotlin codebases.

#### How does exception handling work in coroutines?

`try/catch` works inside a coroutine the same way as in regular code. `CoroutineExceptionHandler` is a last-resort handler that catches uncaught exceptions from `launch` coroutines. It only works when installed on the root scope or root `launch`.

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

For `async`, the exception is deferred — it's thrown when you call `.await()`. You must wrap `.await()` in a `try/catch`.

#### How do exceptions propagate in a coroutine hierarchy?

When a child coroutine throws, it propagates upward to the parent. The parent cancels all its other children, then propagates to its own parent. This continues until the root scope.

With `SupervisorJob`, a child's failure doesn't affect other children. The exception is handled locally.

```kotlin
// Regular Job — one failure cancels everything
coroutineScope {
    launch { delay(1000); println("Task 1") } // cancelled
    launch { throw Exception("failed") }
}

// SupervisorJob — siblings survive
supervisorScope {
    launch { delay(1000); println("Task 1") } // still runs
    launch { throw Exception("failed") }
}
```

#### How does coroutine cancellation work? What does "cooperative cancellation" mean?

Calling `cancel()` on a Job doesn't forcefully stop the coroutine. It sets the state to "cancelling" and throws a `CancellationException` at the next suspension point. If your coroutine never suspends (like a tight loop), it will never be cancelled.

You can check for cancellation in three ways:
- **`isActive`** — Check the flag manually: `while (isActive) { ... }`
- **`ensureActive()`** — Throws `CancellationException` immediately if cancelled. More concise.
- **`yield()`** — Checks for cancellation and gives other coroutines a chance to run.

`ensureActive()` is preferred over `isActive` in most cases because it throws immediately.

#### What is the difference between ensureActive() and yield()?

Both check for cancellation, but `ensureActive()` only checks and throws. It doesn't suspend. `yield()` does three things: checks for cancellation, suspends the coroutine, and gives the dispatcher a chance to run other coroutines.

```kotlin
suspend fun processItems(items: List<Item>) {
    for (item in items) {
        ensureActive() // just cancellation check
        process(item)
    }
}

suspend fun processItemsFairly(items: List<Item>) {
    for (item in items) {
        yield() // cancellation check + lets others run
        process(item)
    }
}
```

Use `ensureActive()` when you only care about cancellation. Use `yield()` when you want to be fair with shared dispatchers.

#### What happens when you cancel a coroutine doing CPU-intensive work with no suspension points?

Nothing happens until the coroutine hits a suspension point. A tight loop like `while (true) { compute() }` will never be cancelled because it never suspends.

```kotlin
// This will NOT be cancelled
launch {
    var i = 0
    while (i < 1_000_000) {
        heavyComputation(i)
        i++
    }
}

// This WILL be cancelled
launch {
    var i = 0
    while (i < 1_000_000) {
        ensureActive()
        heavyComputation(i)
        i++
    }
}
```

For CPU-bound work, sprinkle `ensureActive()` or `yield()` calls at regular intervals.

#### What is NonCancellable and when would you use it?

`NonCancellable` is a special `Job` that can never be cancelled. You use it with `withContext(NonCancellable)` to run cleanup code even after a coroutine has been cancelled. Once a coroutine is in the "cancelling" state, any new suspend calls inside it will immediately throw `CancellationException` — unless you switch to `NonCancellable`.

```kotlin
suspend fun saveData(data: Data) {
    try {
        uploadToServer(data)
    } finally {
        withContext(NonCancellable) {
            localDb.save(data) // guaranteed to complete
        }
    }
}
```

The typical use case is persisting data in a `finally` block.

#### What is CPS transformation and how does the compiler handle suspend functions?

The Kotlin compiler adds an extra `Continuation` parameter to every suspend function and changes the return type to `Any?`. The return type is a union of the actual return value and `COROUTINE_SUSPENDED`. When the coroutine suspends, it returns `COROUTINE_SUSPENDED`. When it completes, the `Continuation.resumeWith()` delivers the result.

```kotlin
// What you write
suspend fun fetchUser(userId: String): User

// What the compiler generates (simplified)
fun fetchUser(userId: String, continuation: Continuation<User>): Any?
```

#### How does the compiler generate a state machine for suspend functions?

The compiler assigns each suspension point a label (an integer). A `when` block checks the label to know which part to execute next. Each time the coroutine suspends, it saves the current label and local variables into the Continuation object.

```kotlin
// Compiler-generated pseudocode
fun fetchUser(userId: String, cont: Continuation<Any?>): Any? {
    val sm = cont as? FetchUserContinuation ?: FetchUserContinuation(cont)
    when (sm.label) {
        0 -> {
            sm.label = 1
            val result = getProfile(userId, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
        }
        1 -> {
            sm.label = 2
            val result = getSettings(sm.userId, sm)
            if (result == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
        }
        2 -> {
            return User(sm.profile, sm.settings)
        }
    }
}
```

A suspend function with 3 suspension points generates 4 states. No extra threads or callbacks are created — just a `when` block that resumes where it left off.

#### What is Mutex and how is it different from synchronized?

Mutex protects shared resources between coroutines. It ensures only one coroutine executes a block at a time. The key difference from `synchronized` is that Mutex suspends the coroutine instead of blocking the thread.

```kotlin
private val mutex = Mutex()
private var counter = 0

suspend fun incrementSafely() {
    mutex.withLock {
        counter++
    }
}
```

`synchronized` blocks the thread entirely, which defeats the purpose of coroutines. One gotcha: Mutex is not reentrant. If a coroutine tries to lock a Mutex it already holds, it deadlocks.

#### What is Semaphore and how does it differ from Mutex?

Mutex allows exactly one coroutine. Semaphore allows a configurable number. When all permits are taken, the next coroutine suspends until one is released.

```kotlin
val semaphore = Semaphore(permits = 3)

suspend fun makeApiCall() {
    semaphore.withPermit {
        api.fetchData()
    }
}
```

Semaphore is useful for rate-limiting concurrent network requests. Mutex is essentially a Semaphore with `permits = 1`.

#### Explain Channel types — Rendezvous, Buffered, Conflated, and Unlimited.

Channels are used for communication between coroutines. The four types differ in buffer behavior:

- **Rendezvous** (`Channel()`) — No buffer. Sender suspends until receiver is ready. This is the default.
- **Buffered** (`Channel(capacity)`) — Fixed-size buffer. Sender suspends when full. Default capacity is 64.
- **Conflated** (`Channel(CONFLATED)`) — Keeps only the latest value. Intermediate values are dropped.
- **Unlimited** (`Channel(UNLIMITED)`) — No limit. Sender never suspends. Risk of `OutOfMemoryError`.

```kotlin
val rendezvous = Channel<Int>()
val buffered = Channel<Int>(10)
val conflated = Channel<Int>(CONFLATED)
val unlimited = Channel<Int>(UNLIMITED)
```

In practice, use buffered channels with a reasonable capacity.

#### How does the select expression work?

`select` lets a coroutine wait on multiple suspending operations and proceed with whichever completes first.

```kotlin
val channel1 = Channel<String>()
val channel2 = Channel<String>()

suspend fun receiveFirst(): String = select {
    channel1.onReceive { value -> "From channel1: $value" }
    channel2.onReceive { value -> "From channel2: $value" }
}
```

`select` is biased — if multiple clauses are ready, the first one in code wins. It's useful for timeouts, racing data sources, or fan-in patterns.

#### What is suspendCoroutine and when do you use it?

`suspendCoroutine` bridges callback-based APIs and coroutines. It suspends the current coroutine and gives you a `Continuation` object to call `resume()` or `resumeWithException()` on.

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

You can only call `resume` once — calling it twice throws `IllegalStateException`.

#### What is suspendCancellableCoroutine and how does it differ?

`suspendCancellableCoroutine` adds cancellation support. If the coroutine is cancelled before the callback fires, `invokeOnCancellation` runs so you can clean up.

```kotlin
suspend fun fetchLocation(): Location = suspendCancellableCoroutine { cont ->
    val task = locationClient.getLastLocation()
    task.addOnSuccessListener { location ->
        if (cont.isActive) cont.resume(location)
    }
    task.addOnFailureListener { exception ->
        if (cont.isActive) cont.resumeWithException(exception)
    }
    cont.invokeOnCancellation {
        task.cancel()
    }
}
```

Always check `cont.isActive` before calling `resume`. In production, prefer `suspendCancellableCoroutine` over `suspendCoroutine`.

#### How do you convert a multi-shot callback API into a Flow?

For callbacks that fire multiple times, use `callbackFlow`. It creates a cold Flow backed by a Channel.

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

`awaitClose` suspends until the collector cancels. Without it, the flow completes immediately and the callback is never cleaned up.

#### How does withContext actually switch threads?

Each Continuation object holds a `CoroutineContext` which includes the dispatcher. Before `resumeWith` is called, the coroutine reads the dispatcher and dispatches to the correct thread.

`withContext` doesn't create a new coroutine — it switches the dispatcher of the current coroutine. When the block completes, it reads the parent's dispatcher and dispatches back. This is why `withContext` is more efficient than `launch` + `join`.

#### What is the difference between coroutineScope and supervisorScope for exception handling?

`coroutineScope` follows structured concurrency strictly — if any child fails, all others are cancelled and the exception is rethrown. `supervisorScope` isolates failures — each child handles its own exceptions.

```kotlin
// All-or-nothing
suspend fun loadUserData(): UserData = coroutineScope {
    val profile = async { fetchProfile() }
    val settings = async { fetchSettings() }
    UserData(profile.await(), settings.await())
}

// Independent
suspend fun loadUserData(): UserData = supervisorScope {
    val profile = async { runCatching { fetchProfile() }.getOrNull() }
    val settings = async { fetchSettings() }
    UserData(profile.await(), settings.await())
}
```

Use `coroutineScope` when all tasks must succeed. Use `supervisorScope` when tasks are independent.

### Common Follow-ups

- What's the difference between `Job` and `SupervisorJob`? Can you install `SupervisorJob` on a child coroutine?
- How does `CoroutineExceptionHandler` interact with `SupervisorJob`?
- What happens if you call `resume()` twice on the same Continuation?
- How does `Dispatchers.Unconfined` work and when would you use it?
- What happens at the bytecode level when a suspend function has no suspension points?
- How would you implement a rate limiter using Semaphore?
- What's the difference between `Channel.close()` and `Channel.cancel()`?
- How does backpressure work with Channels vs Flows?
