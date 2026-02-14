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

So you know what coroutines are and how to launch them. Now the interviewer wants to know if you actually understand what's happening under the hood. CPS transformation, state machines, cooperative cancellation, concurrency primitives -- this is where the real fun begins, and where most candidates either shine or stumble.

#### How does exception handling work in coroutines?

Here's the thing -- `try/catch` works exactly the way you'd expect inside a coroutine. No surprises there. But `CoroutineExceptionHandler` is a different beast. Think of it as a safety net at the top of a circus tent -- it only catches things falling from above, and it only works if you install it on the root scope or root `launch`. It won't catch anything from `async`.

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

For `async`, the exception is deferred -- it's a ticking time bomb that goes off when you call `.await()`. So you need to wrap `.await()` in a `try/catch`.

#### How do exceptions propagate in a coroutine hierarchy?

Think of it like a chain of dominoes. When a child coroutine throws, it tells the parent. The parent panics, cancels all its other children, and then passes the problem up to its own parent. This keeps going until the root scope falls over.

But wait -- `SupervisorJob` changes the rules. With a `SupervisorJob`, a child's failure stays local. The siblings keep running like nothing happened. It's like a manager who says "That's your problem, not everyone else's."

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

Calling `cancel()` on a Job doesn't yank the plug. It's more like putting up a "please leave" sign. The coroutine's state flips to "cancelling" and a `CancellationException` gets thrown at the next suspension point. But here's the catch -- if your coroutine never suspends (like a tight CPU loop), it will never see that sign and never stop.

That's why it's called "cooperative." The coroutine has to cooperate by checking for cancellation. You have three ways to do that:
- **`isActive`** -- Check the flag manually: `while (isActive) { ... }`
- **`ensureActive()`** -- Throws `CancellationException` immediately if cancelled. More concise.
- **`yield()`** -- Checks for cancellation and gives other coroutines a chance to run.

`ensureActive()` is preferred over `isActive` in most cases because it throws immediately.

> **🧠 Think about it:** If a coroutine is running a tight `while (true)` loop with no suspend calls inside, what happens when you call `cancel()` on its Job?

#### What is the difference between ensureActive() and yield()?

Both check for cancellation, but they're not the same. `ensureActive()` is like glancing at the exit sign -- it checks if you should leave and throws if yes, but it doesn't pause. `yield()` does three things: checks for cancellation, suspends the coroutine, and lets the dispatcher run other coroutines. It's like stepping aside in a hallway to let someone else pass.

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

Nothing. Absolutely nothing. The coroutine keeps crunching numbers, completely oblivious to your `cancel()` call. A tight loop like `while (true) { compute() }` has no suspension points, so the `CancellationException` never gets a chance to be thrown.

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

For CPU-bound work, sprinkle `ensureActive()` or `yield()` calls at regular intervals. It's like adding checkpoints in a long road trip where you can decide to turn around.

#### What is NonCancellable and when would you use it?

`NonCancellable` is a special `Job` that -- you guessed it -- can never be cancelled. Here's when you need it: once a coroutine enters the "cancelling" state, any new suspend call inside it immediately throws `CancellationException`. But what if you need to save data to disk in a `finally` block? That save call suspends, and boom -- cancelled before it finishes.

`withContext(NonCancellable)` is like telling the system "I don't care that we're shutting down, this must complete."

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

This is where the magic trick gets revealed. The Kotlin compiler takes every suspend function and adds a hidden extra parameter -- a `Continuation` -- and changes the return type to `Any?`. That return type is sneaky because it's a union: it can be either the actual return value or a special marker called `COROUTINE_SUSPENDED`.

Think of it like a restaurant order. You place your order (call the function), and either the food is ready instantly (returns the value) or the waiter says "we'll call you when it's ready" (returns `COROUTINE_SUSPENDED`). When it's ready, `Continuation.resumeWith()` delivers the result.

```kotlin
// What you write
suspend fun fetchUser(userId: String): User

// What the compiler generates (simplified)
fun fetchUser(userId: String, continuation: Continuation<User>): Any?
```

> **🧠 Think about it:** If a suspend function never actually suspends (no `delay`, no I/O, no other suspend calls inside), does the compiler still add the `Continuation` parameter?

#### How does the compiler generate a state machine for suspend functions?

Here's where it gets really clever. The compiler looks at every suspension point in your function and assigns each one a label -- just an integer. Then it wraps the whole function body in a `when` block that checks the label to know which chunk of code to run next. Every time the coroutine suspends, it saves the current label and local variables into the Continuation object, like bookmarking a page before you put a book down.

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

A suspend function with 3 suspension points generates 4 states. No extra threads, no callbacks, no allocations beyond the Continuation itself -- just a `when` block that picks up exactly where it left off.

#### What is Mutex and how is it different from synchronized?

Mutex protects shared resources between coroutines, allowing only one coroutine to execute a block at a time. But here's the key difference from `synchronized`: Mutex suspends the waiting coroutine instead of blocking the thread. It's like taking a number at a deli counter and sitting down versus standing in line blocking the aisle.

```kotlin
private val mutex = Mutex()
private var counter = 0

suspend fun incrementSafely() {
    mutex.withLock {
        counter++
    }
}
```

`synchronized` blocks the thread entirely, which defeats the whole purpose of coroutines. One gotcha to remember: Mutex is not reentrant. If a coroutine tries to lock a Mutex it already holds, it deadlocks.

#### What is Semaphore and how does it differ from Mutex?

Mutex lets exactly one coroutine through. Semaphore lets a configurable number through. It's like a parking garage with a fixed number of spots -- when all spots are taken, the next car waits until someone leaves.

```kotlin
val semaphore = Semaphore(permits = 3)

suspend fun makeApiCall() {
    semaphore.withPermit {
        api.fetchData()
    }
}
```

Semaphore is great for rate-limiting concurrent network requests. And if you think about it, Mutex is essentially a Semaphore with `permits = 1`.

#### Explain Channel types — Rendezvous, Buffered, Conflated, and Unlimited.

Channels are how coroutines talk to each other -- like passing notes between classrooms. The four types differ in how they handle the "mailbox":

- **Rendezvous** (`Channel()`) -- No buffer. Sender suspends until receiver is ready. This is the default. Like a hand-to-hand delivery.
- **Buffered** (`Channel(capacity)`) -- Fixed-size buffer. Sender suspends when full. Default capacity is 64.
- **Conflated** (`Channel(CONFLATED)`) -- Keeps only the latest value. Intermediate values are dropped. Like a whiteboard that gets erased with each new message.
- **Unlimited** (`Channel(UNLIMITED)`) -- No limit. Sender never suspends. Risk of `OutOfMemoryError`.

```kotlin
val rendezvous = Channel<Int>()
val buffered = Channel<Int>(10)
val conflated = Channel<Int>(CONFLATED)
val unlimited = Channel<Int>(UNLIMITED)
```

In practice, use buffered channels with a reasonable capacity.

#### How does the select expression work?

`select` lets a coroutine wait on multiple suspending operations and go with whichever one completes first. It's like sitting at a restaurant and telling the waiter "bring me whichever dish is ready first."

```kotlin
val channel1 = Channel<String>()
val channel2 = Channel<String>()

suspend fun receiveFirst(): String = select {
    channel1.onReceive { value -> "From channel1: $value" }
    channel2.onReceive { value -> "From channel2: $value" }
}
```

One thing to know: `select` is biased. If multiple clauses are ready at the same time, the first one in your code wins. It's useful for timeouts, racing data sources, or fan-in patterns.

> **🧠 Think about it:** If you have two channels both ready with a value, and you use `select` -- will it ever pick the second one?

#### What is suspendCoroutine and when do you use it?

`suspendCoroutine` is the bridge between the old callback world and the coroutine world. It suspends the current coroutine and hands you a `Continuation` object. You pass that into your callback, and when the callback fires, you call `resume()` or `resumeWithException()` to wake the coroutine back up. It's like giving someone your phone number and saying "call me when you're done."

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

You can only call `resume` once -- calling it twice throws `IllegalStateException`.

#### What is suspendCancellableCoroutine and how does it differ?

`suspendCancellableCoroutine` is the grown-up version. It adds cancellation support -- if the coroutine gets cancelled before the callback fires, `invokeOnCancellation` runs so you can clean up resources. Without this, you'd leak listeners and tasks all over the place.

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

Always check `cont.isActive` before calling `resume`. In production, prefer `suspendCancellableCoroutine` over `suspendCoroutine` -- there's really no reason not to.

#### How do you convert a multi-shot callback API into a Flow?

For callbacks that fire multiple times, `suspendCoroutine` won't cut it -- that's a one-shot deal. You need `callbackFlow`. It creates a cold Flow backed by a Channel, so every time the callback fires, it sends a value downstream.

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

`awaitClose` is critical here -- it suspends until the collector cancels. Without it, the flow completes immediately and your callback is left dangling, never cleaned up.

#### How does withContext actually switch threads?

Each Continuation object carries a `CoroutineContext` which includes the dispatcher. Before `resumeWith` is called, the coroutine checks the dispatcher and dispatches to the correct thread. It's like a letter that has a return address -- the system always knows where to send it back.

`withContext` doesn't create a new coroutine -- it switches the dispatcher of the current one. When the block completes, it reads the parent's dispatcher and dispatches back. This is why `withContext` is more efficient than `launch` + `join`.

#### What is the difference between coroutineScope and supervisorScope for exception handling?

`coroutineScope` is all-or-nothing. If any child fails, every other child gets cancelled and the exception is rethrown. It's like a group project where one person failing means everyone fails. `supervisorScope` isolates failures -- each child is on its own. One can crash and burn while the others keep going.

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

Use `coroutineScope` when all tasks must succeed together. Use `supervisorScope` when tasks are independent and one failing shouldn't take the others down.

### Common Follow-ups

- What's the difference between `Job` and `SupervisorJob`? Can you install `SupervisorJob` on a child coroutine?
- How does `CoroutineExceptionHandler` interact with `SupervisorJob`?
- What happens if you call `resume()` twice on the same Continuation?
- How does `Dispatchers.Unconfined` work and when would you use it?
- What happens at the bytecode level when a suspend function has no suspension points?
- How would you implement a rate limiter using Semaphore?
- What's the difference between `Channel.close()` and `Channel.cancel()`?
- How does backpressure work with Channels vs Flows?
