---
title: Threading and Dispatcher Performance in Android
layout: post
categories: post
tags:
  - Android
  - Performance
  - Kotlin Coroutines
---

A few months ago, we shipped a feature that loaded a user's transaction history alongside their profile on a single screen. Everything looked fine in development — fast network, small datasets, no visible lag. Then the ANR reports started rolling in from production. Not a handful. Hundreds of them, all pointing to the same screen. The main thread was frozen for 5+ seconds on devices with slower CPUs.

My first instinct was that the network call was somehow running on Main. But it wasn't — every `suspend` function was wrapped in `withContext(Dispatchers.IO)`. The actual problem was subtler. We had a JSON parsing step running on `Dispatchers.IO` after the network response came back. Parsing 200+ transactions with nested objects was CPU-intensive work, sitting on the IO dispatcher alongside dozens of actual blocking calls. The IO pool was saturated, the CPU-bound parsing was waiting in line, and the UI was starving because results weren't coming back fast enough. The fix was moving the parsing to `Dispatchers.Default` and keeping IO for actual IO. ANRs dropped to zero.

That experience taught me something I should have understood earlier: **dispatchers are not interchangeable labels. They are thread pool configurations with specific sizing, scheduling characteristics, and contention behavior.** Picking the wrong one doesn't just make things slower — it can starve other operations and freeze your app.

Think of it like a restaurant kitchen. You have one station for grilling (CPU work), another for plating and garnishing (UI work), and a window where waiters drop off orders and pick up plates (IO — mostly waiting around). Now imagine you tell the grill cook to also stand at the window waiting for orders. He's blocking a burner while doing nothing. Meanwhile, steaks are piling up with nobody to cook them. That's what happens when you put CPU-bound work on the IO dispatcher. Right tool, right station.

## How Dispatchers Actually Work

Most developers treat dispatchers as three named slots: Main for UI, IO for network/disk, Default for "everything else." That mental model will get you through 90% of your code. But the other 10% — the part where your app freezes under load and you have no idea why — that's where understanding what's *actually* happening underneath matters.

Both `Dispatchers.IO` and `Dispatchers.Default` are backed by the same underlying thread pool — an instance of `CoroutineScheduler` inside `kotlinx.coroutines`. They don't each create their own set of threads. Wait, what? Yeah, they share threads. The `CoroutineScheduler` is a work-stealing scheduler with a core pool sized to the number of CPU cores (minimum 2). When you dispatch to `Dispatchers.Default`, it runs on these core threads. When you dispatch to `Dispatchers.IO`, the scheduler uses an **elasticity mechanism** — it can expand the thread count up to 64 (or `kotlinx.coroutines.io.parallelism` if you've set it) to handle blocking operations that would otherwise tie up the core threads.

Here's the thing — because they share the same scheduler, a thread that was just running an IO task can immediately pick up a Default task without any cross-pool overhead. The separation between IO and Default isn't about different thread pools. It's about **different concurrency limits on the same pool**. Default is limited to CPU core count. IO can expand beyond that to absorb blocking calls.

Back to our kitchen analogy: IO and Default aren't separate kitchens. They're different *rules* about how many cooks can work at the same station. The grill station (Default) only fits as many cooks as you have burners — no point crowding it. But the order window (IO) can have way more people standing there, because they're mostly just waiting, not actively using equipment.

This is why putting CPU-bound work on `Dispatchers.IO` is wasteful: you're consuming one of those 64 elastic slots for work that doesn't actually block, and you're potentially preventing real blocking IO from getting a thread.

`Dispatchers.Main`, on the other hand, is entirely separate. On Android, it's backed by the main thread's `Looper` and `Handler`. Every dispatch to Main posts a message to the queue and waits for the Looper to process it — which brings us to an important distinction.

## Main vs Main.immediate

When you use `Dispatchers.Main`, every resume goes through `Handler.post()`. Even if the coroutine is already executing on the main thread, it still posts to the message queue and waits for the next Looper cycle. That's one extra dispatch — and on a busy main thread, that can mean waiting behind input events, layout passes, and view invalidations.

Imagine you're already standing in the kitchen and you need to flip a burger. With `Dispatchers.Main`, instead of just flipping it, you walk out, write "flip burger" on a ticket, hand it to the waiter, wait for the waiter to bring it back, read it, and then flip the burger. Sounds ridiculous, right? That's what regular Main does when you're already on the main thread.

`Dispatchers.Main.immediate` checks if the coroutine is already on the main thread. If it is, it resumes **immediately** in the current execution context without posting to the queue. If not, it falls back to the same `Handler.post()` behavior. This skips one full dispatch cycle, saving roughly 50-100μs per dispatch depending on message queue pressure.

```kotlin
class TransactionViewModel(
    private val repository: TransactionRepository,
) : ViewModel() {

    // viewModelScope uses Dispatchers.Main.immediate by default
    fun loadTransactions() {
        viewModelScope.launch {
            // Already on Main.immediate — no extra dispatch
            _uiState.value = UiState.Loading

            val transactions = withContext(Dispatchers.IO) {
                repository.fetchTransactions()
            }

            // Resumes on Main.immediate — immediate if already on main thread
            _uiState.value = UiState.Success(transactions)
        }
    }
}
```

This is why `viewModelScope` defaults to `SupervisorJob() + Dispatchers.Main.immediate` rather than plain `Dispatchers.Main`. Google made this choice deliberately — in animation code, one extra frame of delay between a state change and the UI update can cause visible stutter. If your coroutine updates a `MutableStateFlow` that drives a Compose recomposition, `Main.immediate` means the recomposition is triggered in the same frame rather than being pushed to the next one.

But `Main.immediate` isn't universally better. If you have deeply recursive suspend calls that all resolve immediately (no actual suspension), `Main.immediate` keeps stacking frames without ever yielding. With regular `Main`, each step goes through the message queue, which effectively unwinds the stack. In extreme cases — think recursive tree traversal where each node is a suspend call — `Main.immediate` can overflow the stack. If you suspect this is happening, `yield()` forces a dispatch point and breaks the recursion.

> **🧠 Think about it:** If `Main.immediate` can cause stack overflows in recursive suspend calls, why did Google still choose it as the default for `viewModelScope`? What does that tell you about the typical coroutine usage pattern in ViewModels?

## Dispatchers.Unconfined — The One Most People Get Wrong

`Dispatchers.Unconfined` is the dispatcher that doesn't dispatch. When a coroutine starts on Unconfined, it executes immediately in the caller's thread — no queue, no scheduling. But here's the part that trips people up: after the first suspension point, the coroutine resumes on whatever thread the suspending function happened to complete on. You have zero control over which thread that is.

Picture this: you get on a bus (start on the caller's thread). At the first stop, you get off and just... hop into whatever random car happens to be passing by. Could be a taxi. Could be a delivery truck. Could be someone's personal vehicle heading in the wrong direction. You have absolutely no say. That's Unconfined after suspension.

This means if you launch on `Dispatchers.Unconfined` and call a suspend function that internally completes on an IO thread, your code after the suspension is now running on that IO thread. If the suspend function completes on a callback thread from a native library, you're running there. The thread affinity is completely unpredictable after any suspension.

```kotlin
fun demonstrateUnconfined() {
    // Starts on the calling thread (e.g., main)
    CoroutineScope(Dispatchers.Unconfined).launch {
        println("Before suspend: ${Thread.currentThread().name}") // main

        delay(100) // suspends here

        // Resumes on whatever thread the delay timer completed on
        println("After suspend: ${Thread.currentThread().name}") // kotlinx.coroutines.DefaultExecutor
    }
}
```

So when is Unconfined actually useful? Mostly in testing and event-handling pipelines where you want zero dispatch overhead and you don't care about thread identity. `UnconfinedTestDispatcher` in `kotlinx-coroutines-test` is built on this concept — it lets coroutines run eagerly so your tests don't need to manually advance time for every launch. In production code, I'd reach for `CoroutineStart.UNDISPATCHED` on a specific launch instead of Unconfined on the whole scope, because UNDISPATCHED gives you the same "start immediately" behavior for the initial execution while still dispatching normally after suspension. It's the scoped version of the same optimization without the thread-safety landmine.

## Dispatchers.IO and Thread Pool Saturation

The default parallelism limit for `Dispatchers.IO` is 64 threads. That number is based on the assumption that IO-dispatched work is **blocking** — waiting on network sockets, disk reads, database queries. While a thread is blocked, it's not using CPU, so you can have many more threads than cores. The number 64 is a practical default: high enough to keep concurrent network requests in flight, low enough to avoid excessive thread creation overhead.

The real problem developers run into isn't the 64-thread limit — it's putting the wrong kind of work on IO. Can you guess what mistake I've seen most often? I've seen codebases where JSON deserialization, image decoding, and even sorting large lists all happen on `Dispatchers.IO` because they were "part of the data loading pipeline." The reasoning sounds logical: "I fetched data from the network on IO, so I'll parse it on IO too." But each of those is CPU-bound. When they're running alongside actual blocking calls, you're using elastic threads for work that should run on the fixed core pool, and CPU-bound work runs slower because you get more context switching and cache thrashing than you would on a pool sized to your core count.

The fix is straightforward — separate your IO from your computation:

```kotlin
class TransactionRepository(
    private val api: TransactionApi,
    private val parser: TransactionParser,
) {
    suspend fun fetchTransactions(): List<Transaction> {
        // Network call — genuinely blocking IO, belongs on IO
        val rawJson = withContext(Dispatchers.IO) {
            api.getRawTransactions()
        }

        // Parsing — CPU-bound work, belongs on Default
        val transactions = withContext(Dispatchers.Default) {
            parser.parseTransactions(rawJson)
        }

        return transactions
    }
}
```

In our production app, moving JSON parsing from IO to Default reduced P95 parse times by about 40% on mid-range devices.

But how do you know when your IO pool is actually saturated? The clearest signal is a thread dump. If you capture one during a slow operation (via Android Studio's debugger or `Thread.getAllStackTraces()`) and see most of your `DefaultDispatcher-worker-*` threads in `BLOCKED` or `WAITING` state on IO operations, you've hit saturation. In Perfetto traces, look for gaps between coroutine task slices on the thread track — long gaps mean threads are busy elsewhere and your work is queued. Another symptom: operations that should take milliseconds suddenly take seconds, but only under load. That's thread starvation — every IO slot is occupied and new work is waiting in the `CoroutineScheduler`'s global queue.

> **🔥 Real talk:** That 40% improvement from moving parsing to Default? We almost didn't catch it. Our development devices were fast enough that the wrong dispatcher "worked fine." It was only mid-range devices in production — the ones with 4 cores instead of 8 — where saturation actually hurt. Always profile on the weakest device you support, not the newest Pixel on your desk.

## Dispatchers.Default and the Core Count Connection

`Dispatchers.Default` creates a thread pool equal to the number of CPU cores, with a minimum of 2. On a modern phone with 8 cores, that's 8 threads. This sizing is intentional — for CPU-bound work, adding more threads than cores doesn't make things faster. It makes things slower because of context switching overhead. Each context switch costs roughly 5-15μs on most ARM processors, and each swap can flush the CPU cache, meaning the new thread reloads data from main memory.

Why does this matter? Think of it like a single-lane highway. If you have 4 lanes (cores) and 4 cars (threads), everyone cruises along smoothly. Now add 60 more cars. You don't go faster — you get traffic jams. Every lane change (context switch) slows everyone down, and nobody can keep their momentum (cache locality). That's exactly what happens when you run CPU-bound work on the 64-thread IO pool instead of the core-sized Default pool.

The `CoroutineScheduler` maintains a global queue and per-thread local queues. When a thread finishes its task, it first checks its local queue (fast, no contention), then tries to steal from another thread's queue (moderate cost), and finally falls back to the global queue (requires synchronization). CPU-bound work benefits from this work-stealing design because related tasks tend to stay on the same thread, preserving cache locality. But if you mix CPU and IO work by dispatching everything to the same dispatcher, blocking IO tasks interrupt the work-stealing pattern and you lose that locality benefit.

## withContext Cost Internals

`withContext` is the standard way to switch dispatchers mid-coroutine, but not every `withContext` call actually switches threads. When you call `withContext` with the **same dispatcher** the coroutine is already running on, the coroutines library takes a fast path — it skips the dispatch entirely and just runs the block inline. No thread switch, no queue, no scheduling overhead. This is why `withContext(Dispatchers.Default) { withContext(Dispatchers.Default) { ... } }` doesn't cost you two context switches. The inner call is essentially a no-op from a threading perspective.

When the dispatchers are different, `withContext` suspends the current coroutine, dispatches the block to the target dispatcher's queue, and then dispatches *back* to the original dispatcher when the block completes. That's two dispatches for one `withContext` call — one there, one back. At 50-100μs per dispatch on a Pixel 7, a single `withContext` that actually changes threads costs you 100-200μs round-trip.

Now here's where it gets interesting. Consider a screen that loads 10 items from a paginated API, where each item goes through IO fetch → Default parse → Main render. That's 30 dispatcher switches per page load. At 100μs each, you're spending 3ms just on dispatching overhead. On a 16ms frame budget, that's nearly 20% spent on thread coordination. Not on your actual work — just on moving work between threads.

> **⚡ Quick check:** If you have three operations that all belong on `Dispatchers.Default`, should you wrap each one in its own `withContext(Dispatchers.Default)` block, or put them all in a single block? And what happens if you nest one inside the other — does it cost you anything?

This is why I don't recommend wrapping every single function in `withContext`. If you have a chain of operations that all belong on the same dispatcher, keep them in one block. The overhead of unnecessary context switches is small individually but adds up in hot paths.

## limitedParallelism — The Right Way to Control Concurrency

Before `limitedParallelism`, developers created custom dispatchers with `Executors.newFixedThreadPool(n).asCoroutineDispatcher()`. This created entirely separate thread pools — those threads couldn't be shared with anything else. It's like building a whole new kitchen just because you need a dedicated pasta station. Expensive, wasteful, and those extra cooks sit idle most of the time.

`limitedParallelism` solves this by creating a **view** over the parent dispatcher, not a new thread pool. It limits how many coroutines from this view can run concurrently, but the actual threads come from the parent pool. Same kitchen, same cooks — you're just putting up a sign that says "maximum 4 people at this station."

```kotlin
class AppDispatchers {
    // Limits database operations to 4 concurrent coroutines
    // but uses threads from the IO pool
    val databaseDispatcher = Dispatchers.IO.limitedParallelism(4)

    // Limits file write operations to 2 concurrent coroutines
    val fileWriteDispatcher = Dispatchers.IO.limitedParallelism(2)

    // For heavy computation that shouldn't starve other Default work
    val imageProcessingDispatcher = Dispatchers.Default.limitedParallelism(2)
}
```

The `databaseDispatcher` limits database concurrency to 4, which protects SQLite from too many concurrent writers (SQLite serializes writes anyway, so more threads just means more lock contention). The `imageProcessingDispatcher` limits CPU-intensive image work to 2 threads so it doesn't monopolize the Default pool and starve other computational work.

But `limitedParallelism` isn't free. It adds a coordination layer — a semaphore-like mechanism that tracks how many coroutines are currently active in the view. Each dispatch checks this counter, and if the limit is reached, the coroutine is queued until a slot opens. In most Android apps this overhead is negligible, but IMO it's good to know you're trading a small amount of dispatch latency for better resource control. For `limitedParallelism(1)` as a single-writer pattern, this is essentially a coroutine-based mutex — works well, though a real `Mutex` might be more readable for that specific use case.

## Practical Guidelines

After debugging enough dispatcher-related issues, here's how I think about choosing dispatchers in practice:

- **Network calls, database queries, file reads/writes** → `Dispatchers.IO`. These operations block the thread while waiting for external resources. That's exactly what the elastic pool is designed for.

- **JSON parsing, list sorting, image processing, encryption** → `Dispatchers.Default`. These are CPU-bound. The core-sized pool gives them better performance than the oversized IO pool.

- **UI state updates, triggering recompositions** → `Dispatchers.Main.immediate` (which `viewModelScope` already provides). Use plain `Dispatchers.Main` only if you specifically want to defer execution to the next message queue cycle.

- **Rate-limiting a specific subsystem** → `limitedParallelism` on the appropriate parent dispatcher. Database writes? `Dispatchers.IO.limitedParallelism(4)`. Heavy computation that shouldn't starve the rest? `Dispatchers.Default.limitedParallelism(2)`.

- **Don't create standalone thread pools** via `Executors.newFixedThreadPool().asCoroutineDispatcher()` unless you have a very specific reason. Prefer `limitedParallelism` to keep threads shared and utilization high.

One last thing — always inject your dispatchers. Hardcoding `Dispatchers.IO` throughout your codebase makes testing painful because you can't swap in `TestDispatcher`. Wrapping dispatchers in an injectable class means your tests run on `UnconfinedTestDispatcher` or `StandardTestDispatcher`, giving you deterministic control over coroutine execution without flaky timing issues.

```kotlin
class AppCoroutineDispatchers(
    val main: CoroutineDispatcher = Dispatchers.Main.immediate,
    val io: CoroutineDispatcher = Dispatchers.IO,
    val default: CoroutineDispatcher = Dispatchers.Default,
    val database: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(4),
)
```

> **💡 The "aha" moment:** Dispatchers aren't just labels you slap on coroutines. They're thread pool *policies* — rules about how many threads can run your work and how those threads are shared. IO and Default aren't separate pools; they're different concurrency limits on the *same* pool. Once you see dispatchers as resource policies rather than named buckets, every decision about which one to use becomes obvious.

Dispatchers are one of those things that seem simple until they aren't. They work fine with defaults for most code. But the moment your app hits real-world scale — hundreds of concurrent operations, mixed CPU and IO workloads, tight frame budgets — understanding what's happening underneath the API becomes the difference between an app that feels smooth and one that freezes on your users' devices.

Thanks for reading through all of this :), Happy Coding!
