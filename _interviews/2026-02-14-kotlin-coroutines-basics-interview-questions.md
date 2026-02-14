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

If you're prepping for an Android interview, coroutines are basically guaranteed to show up. Interviewers love them because they touch threading, lifecycle, error handling, and architecture all at once. You'll want these answers to feel second nature, so let's make sure they stick.

#### What are Kotlin Coroutines and why use them over threads?

Here's the thing — threads are expensive. Like, really expensive. Creating a new thread is like hiring a full-time employee when you just need someone to deliver a package. Coroutines flip this around. They're lightweight tasks that run on a pool of reusable threads, so you can fire off thousands of them without breaking a sweat. Less boilerplate, better performance, and they play nicely with Android's lifecycle. Once you use coroutines, going back to raw threads feels painful.

#### What is a suspend function?

A suspend function is just a function marked with `suspend` that can pause and pick up later without blocking the thread. Think of it like putting a bookmark in a book — you stop reading, do something else, and come back exactly where you left off. Under the hood, the Kotlin compiler rewrites it into callbacks and adds a `Continuation` parameter. You can only call a suspend function from another suspend function or from inside a coroutine.

```kotlin
suspend fun fetchUserProfile(userId: String): UserProfile {
    val user = userApi.getUser(userId)
    val posts = postApi.getPosts(userId)
    return UserProfile(user, posts)
}
```

#### What is a CoroutineScope?

A CoroutineScope is like a manager at a company. It launches coroutines (employees) and keeps track of them. When the manager leaves, all the employees go home too. That's exactly how it works — when the scope is cancelled, every coroutine inside it gets cancelled. In Android, you'll mostly use `viewModelScope` and `lifecycleScope`, which are already tied to the right lifecycle for you.

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

> **🧠 Think about it:** If `viewModelScope` cancels all its coroutines when the ViewModel is cleared, what happens to coroutines launched in `GlobalScope` when the Activity is destroyed?

#### What is the difference between launch and async?

`launch` is fire-and-forget — it kicks off work and hands you a `Job`. You don't get a result back, and that's fine for things like saving to a database. `async` is different — it returns a `Deferred<T>`, which is basically a promise. You call `await()` on it to get the actual result.

```kotlin
val job = scope.launch {
    saveUserToDatabase(user)
}

val deferred = scope.async {
    fetchUserFromNetwork(userId)
}
val user = deferred.await()
```

Think of `launch` as sending a text message (you don't wait for a reply) and `async` as making a phone call (you wait for an answer).

#### What are Dispatchers? Explain each one.

A dispatcher decides which thread your coroutine runs on. It's like choosing which lane to drive in on a highway — each lane is optimized for a different kind of traffic.

- **Dispatchers.Main** — The UI lane. Runs on Android's main thread. Use it for updating views.
- **Dispatchers.IO** — The I/O lane. Has a pool of 64 threads by default. Network calls, database queries, file reads go here.
- **Dispatchers.Default** — The compute lane. Sized to the number of CPU cores. Heavy lifting like sorting large lists or parsing JSON.
- **Dispatchers.Unconfined** — The wild card. Starts in the caller thread but can resume anywhere. Rarely used in production and honestly, you should keep it that way.

#### What is withContext and when do you use it?

`withContext` lets you switch lanes mid-drive without starting a whole new car. It suspends the current coroutine, runs the block on a different dispatcher, and hands you the result when it's done. No new coroutine gets created — it just changes where the current one executes.

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

But wait — this is important. `withContext` doesn't create a new coroutine. It just shifts the execution context of the one you're already in. That's a common interview gotcha.

#### What is structured concurrency?

Structured concurrency is like a family road trip. The car (parent scope) doesn't leave until everyone (child coroutines) is in. If the trip gets cancelled, nobody goes. And if one kid throws up, well... the whole trip might be over.

Every coroutine has a parent scope, and the parent waits for all children to finish. If the parent is cancelled, children are cancelled. If a child throws an exception, the parent and siblings get cancelled too.

```kotlin
viewModelScope.launch {
    val user = async { fetchUser() }
    val posts = async { fetchPosts() }
    // If fetchUser() fails, fetchPosts() is cancelled automatically
    updateUI(user.await(), posts.await())
}
```

This prevents coroutine leaks. Without structured concurrency (like with `GlobalScope`), you'd have to manually track and cancel every coroutine yourself.

#### What is a Job and what are its lifecycle states?

A `Job` is a handle to a piece of work. Every coroutine you launch gives you one, and you can use it to check on the work, wait for it, or cancel it. Think of it like a package tracking number — it doesn't do the delivery, but it lets you monitor and control it.

A Job goes through these states: **New** (created with `LAZY`), **Active** (running), **Completing** (waiting for children), **Completed** (done), **Cancelling** (being cancelled), **Cancelled** (terminal).

```kotlin
val job = scope.launch {
    longRunningTask()
}

job.isActive
job.join()          // suspends until done
job.cancel()        // requests cancellation
job.cancelAndJoin() // cancels and waits
```

> **🧠 Think about it:** If you call `cancel()` on a Job but the coroutine inside has no suspension points (just a tight `while(true)` loop doing CPU work), will the coroutine actually stop?

#### What is the difference between join and cancel on a Job?

`join()` says "I'll wait here until you're done." `cancel()` says "Stop what you're doing." But here's the thing — cancellation is cooperative. The coroutine doesn't just die on the spot. It stops at the next suspension point like `delay()`, `yield()`, or `withContext()`. If there's no suspension point, the coroutine keeps running even after you cancel it. That's why checking `isActive` matters in long-running loops.

#### What is SupervisorJob and how is it different from a regular Job?

With a regular `Job`, one rotten apple spoils the bunch. If any child coroutine fails, the parent cancels, and all siblings go down with it. `SupervisorJob` is more chill — if one child fails, the others keep working like nothing happened.

```kotlin
// Regular Job — one failure cancels everything
val scope = CoroutineScope(Job() + Dispatchers.Main)

// SupervisorJob — failures are isolated
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
scope.launch { fetchUser() }    // if this fails...
scope.launch { fetchPosts() }   // ...this keeps running
```

`viewModelScope` uses `SupervisorJob` internally, and that makes total sense. You don't want a failed search request to cancel an unrelated save operation happening in the same ViewModel.

#### What is the difference between coroutineScope and supervisorScope?

Both create a new scope and wait for all children to complete, but they handle failures differently. `coroutineScope` is the strict parent — one child fails, everybody's grounded. `supervisorScope` is the lenient parent — each kid deals with their own problems.

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

Use `coroutineScope` when your tasks depend on each other — no point fetching posts if the user fetch failed. Use `supervisorScope` when tasks are independent and you'd rather have partial results than nothing.

#### What is CoroutineContext and what does it contain?

CoroutineContext is basically a backpack your coroutine carries around. Inside it are all the things that define how and where the coroutine runs. Each item has a unique key, so you can swap out individual pieces without touching the rest.

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

You combine context elements with `+`. Child coroutines inherit the parent's context but can override specific elements — like a kid inheriting their parent's last name but choosing their own career.

#### What is runBlocking and when should you use it?

`runBlocking` is the bridge between the blocking world and the coroutine world. It blocks the current thread and runs a coroutine on it. That's it.

```kotlin
@Test
fun testFetchUser() = runBlocking {
    val user = repository.getUser("123")
    assertEquals("Mukul", user.name)
}
```

Now here's where it gets important — never use `runBlocking` on the main thread in Android. It will freeze your UI completely. It's meant for tests and `main()` functions, period.

> **🧠 Think about it:** `viewModelScope` uses `SupervisorJob` + `Dispatchers.Main.immediate`. Why `immediate` instead of just `Dispatchers.Main`? What would change if it used regular `Main`?

#### How does viewModelScope work internally?

`viewModelScope` is an extension property on `ViewModel` that creates a `CoroutineScope` with `SupervisorJob() + Dispatchers.Main.immediate`. The clever part is the cleanup — when `ViewModel.onCleared()` is called, the scope's Job gets cancelled, which cascades and cancels every coroutine launched in that scope.

`Dispatchers.Main.immediate` means if you're already on the main thread, the coroutine executes right away instead of going through the message queue. It's a small optimization that matters for rapid UI updates.

#### What is Dispatchers.Main.immediate and how is it different from Dispatchers.Main?

`Dispatchers.Main` always goes through the message queue, even if you're already on the main thread. It's like taking a number at the deli counter when you're the only person there. `Dispatchers.Main.immediate` is smarter — it checks if you're already on the main thread and if so, skips the queue and executes right away.

Both `viewModelScope` and `lifecycleScope` use `Dispatchers.Main.immediate` by default. The difference shows up in rapid UI updates where that extra dispatch through the message queue adds visible latency.

#### What is the difference between GlobalScope and a custom CoroutineScope?

`GlobalScope` lives for the entire app lifetime and has no parent Job. That means coroutines launched in it keep running even after the Activity or ViewModel that started them is destroyed. It's like hiring a contractor with no end date — they'll keep working (and billing you) forever.

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

This breaks structured concurrency and can cause memory leaks or crashes. Even for truly app-level operations, a custom `CoroutineScope` in your `Application` class is a better choice than `GlobalScope`.

#### How do you run two suspend functions in parallel?

Wrap them in `async` and call `await()` on both. Without `async`, suspend functions run one after another — sequentially.

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

Wrapping in `coroutineScope` gives you structured concurrency for free — if `fetchUser()` fails, `fetchPosts()` is cancelled automatically instead of running for no reason.

#### Can you call a suspend function from a regular function?

Nope, not directly. A suspend function needs a coroutine to live in. You have a few ways to bridge the gap:

- **launch or async** from a `CoroutineScope` — the standard Android approach
- **runBlocking** — blocks the thread, only for tests and `main()`
- **Callback pattern** — launch a coroutine internally and deliver results via callback

```kotlin
fun loadUser() {
    viewModelScope.launch {
        val user = fetchUser()
        _state.value = UserState.Loaded(user)
    }
}
```

#### How does structured concurrency prevent coroutine leaks?

Structured concurrency enforces a parent-child hierarchy. The parent scope can't finish until all its children finish. It's like a teacher on a field trip who can't leave until every kid is back on the bus. This gives you three guarantees:

- **Lifecycle binding** — When the scope is cancelled, all coroutines are cancelled.
- **Error propagation** — An unhandled exception in a child cancels the parent and siblings (unless `SupervisorJob`).
- **Completion ordering** — A parent waits for all children before completing.

Without this, every coroutine launched with `GlobalScope` is a potential leak waiting to happen.

### Common Follow-ups

- What happens if you call `delay()` vs `Thread.sleep()` inside a coroutine?
- How does cancellation work with `withContext(NonCancellable)`?
- What's the difference between `scope.launch` and `launch` inside a `coroutineScope` block?
- How do you handle exceptions in `launch` vs `async`?
- What happens if you cancel a Job but the coroutine has no suspension points?
- How does `viewModelScope` get cancelled — who calls `cancel()` on it?
- What's the difference between `CoroutineScope(Dispatchers.IO)` and `withContext(Dispatchers.IO)`?
