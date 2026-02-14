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

My first instinct was that the network call was somehow running on Main. But it wasn't — every `suspend` function was wrapped in `withContext(Dispatchers.IO)`. The actual problem was subtler. We had a JSON parsing step that ran on `Dispatchers.IO` after the network response came back. Parsing 200+ transactions with nested objects was CPU-intensive work, and we had it running on the IO dispatcher alongside dozens of other IO operations. The IO pool was saturated with blocking calls, the CPU-bound parsing was waiting in line behind them, and the UI was starving because results weren't coming back fast enough to render the next frame. The fix wasn't moving anything to Main — it was moving the parsing to `Dispatchers.Default` and keeping IO for actual IO. ANRs dropped to zero.

That experience taught me something I should have understood earlier: **dispatchers are not interchangeable labels. They are thread pool configurations with specific sizing, scheduling characteristics, and contention behavior.** Picking the wrong one doesn't just make things slower — it can starve other operations and freeze your app.

## How Dispatchers Actually Work

Most developers treat dispatchers as three named slots: Main for UI, IO for network/disk, Default for "everything else." But what's actually happening underneath is more interesting, and knowing it changes how you make decisions.

Both `Dispatchers.IO` and `Dispatchers.Default` are backed by the same underlying thread pool — an instance of `CoroutineScheduler` inside `kotlinx.coroutines`. They don't each create their own set of threads. The `CoroutineScheduler` is a work-stealing scheduler with a core pool sized to the number of CPU cores (minimum 2). When you dispatch work to `Dispatchers.Default`, it runs on these core threads. When you dispatch to `Dispatchers.IO`, the scheduler uses an **elasticity mechanism** — it can expand the thread count up to 64 (or `kotlinx.coroutines.io.parallelism` if you've set it) to handle blocking operations that would otherwise tie up the core threads.

Here's the thing — because they share the same scheduler, a thread that was just running an IO task can immediately pick up a Default task without any cross-pool overhead. The separation between IO and Default isn't about different thread pools. It's about **different concurrency limits on the same pool**. Default is limited to CPU core count. IO can expand beyond that to absorb blocking calls. This is why putting CPU-bound work on `Dispatchers.IO` is wasteful: you're consuming one of those 64 elastic slots for work that doesn't actually block, and you're potentially preventing real blocking IO from getting a thread.

`Dispatchers.Main`, on the other hand, is entirely separate. On Android, it's backed by the main thread's `Looper` and `Handler`. When a coroutine resumes on `Dispatchers.Main`, it posts a message to the main thread's message queue via `Handler.post()`. This means every dispatch to Main adds a message to the queue and waits for the Looper to process it — which brings us to an important distinction.

## Main vs Main.immediate

`Dispatchers.Main` and `Dispatchers.Main.immediate` seem almost identical, and in many cases they behave the same. But the difference matters in performance-sensitive code, especially animations and UI updates.

When you use `Dispatchers.Main`, every resume goes through `Handler.post()`. Even if the coroutine is already executing on the main thread, it still posts to the message queue and waits for the next Looper cycle. That's one extra message queue dispatch — and on a busy main thread, that can mean waiting behind other queued messages including input events, layout passes, and view invalidations.

`Dispatchers.Main.immediate` checks if the coroutine is already on the main thread. If it is, it resumes **immediately** in the current execution context without posting to the queue. If it's not on the main thread, it falls back to the same `Handler.post()` behavior as regular Main. This skips one full dispatch cycle, which in practice saves somewhere around 50-100μs per dispatch depending on message queue pressure.

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

This is why `viewModelScope` defaults to `SupervisorJob() + Dispatchers.Main.immediate` rather than plain `Dispatchers.Main`. Google made this choice deliberately. In animation code, one extra frame of delay between a state change and the UI update can cause visible stutter. If your coroutine updates a `MutableStateFlow` that drives a Compose recomposition, `Main.immediate` means the recomposition is triggered in the same frame rather than being pushed to the next one.

But `Main.immediate` isn't universally better. If you have deeply recursive suspend calls that all resolve immediately (no actual suspension), `Main.immediate` keeps stacking frames on the call stack without ever yielding. With regular `Main`, each step goes through the message queue, which effectively unwinds the stack. In extreme cases — think recursive tree traversal where each node is a suspend call — `Main.immediate` can overflow the stack. I've never hit this in production, but it's worth knowing the mechanism. If you suspect this is happening, you can use `yield()` to force a dispatch point and break the recursion.

## Dispatchers.IO — Why 64 Threads

The default parallelism limit for `Dispatchers.IO` is 64 threads. That number isn't arbitrary. It's based on the assumption that IO-dispatched work is **blocking** — waiting on network sockets, disk reads, database queries. While a thread is blocked on IO, it's not using CPU. So you can have many more threads than CPU cores because most of them are just waiting. The number 64 is a practical default that handles most apps without tuning. It's high enough to keep many concurrent network requests in flight, but low enough to avoid excessive thread creation overhead.

You can change it globally with the system property `kotlinx.coroutines.io.parallelism`, but I'd argue that's almost never the right move. If you need more parallelism for a specific subsystem, `limitedParallelism` is the better tool.

The real problem developers run into isn't the 64-thread limit — it's putting the wrong kind of work on IO. I've seen codebases where JSON deserialization, image decoding, and even sorting large lists all happen on `Dispatchers.IO` because they were "part of the data loading pipeline." Each of those operations is CPU-bound. They don't block on anything external. They just burn CPU cycles. And when they're running on IO alongside actual blocking calls, two things go wrong. First, you're using elastic threads for work that should run on the fixed core pool, which means fewer threads are available for real IO. Second, CPU-bound work runs slower on a thread pool sized for 64 because you get more context switching and cache thrashing than you would on a pool sized to your core count.

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

This separation might look pedantic, but in our production app, moving the JSON parsing from IO to Default reduced P95 parse times by about 40% on mid-range devices. The Default pool, being sized to the CPU core count, avoids the overhead of over-scheduling and keeps the work on threads that are warm in the CPU cache.

## Dispatchers.Default and the Core Count Connection

`Dispatchers.Default` creates a thread pool equal to the number of CPU cores available to the JVM, with a minimum of 2. On a modern Android phone with 8 cores, that's 8 threads. On an older device with 4 cores, it's 4. This sizing is intentional — for CPU-bound work, adding more threads than cores doesn't make things faster. It makes things slower because of context switching overhead.

Each context switch — where the OS saves one thread's state and loads another's — costs roughly 5-15μs on most ARM processors. That seems negligible, but if you have 64 threads competing for 8 cores to do CPU work, the scheduler is constantly swapping threads, and those microseconds add up. Worse, each swap can flush the CPU cache, meaning the new thread has to reload data from main memory. This is exactly what happens when you run CPU-bound work on `Dispatchers.IO` — you get more threads than cores, more switches, and worse cache utilization.

There's an important subtlety about how Default and IO share the `CoroutineScheduler`. The scheduler maintains a global queue and per-thread local queues. When a thread finishes its current task, it first checks its local queue (fast, no contention), then tries to steal from another thread's queue (moderate cost), and finally falls back to the global queue (requires synchronization). CPU-bound work benefits from this work-stealing design because related tasks tend to stay on the same thread, preserving cache locality. But if you mix CPU and IO work by dispatching everything to the same dispatcher, you lose that locality benefit because blocking IO tasks interrupt the work-stealing pattern.

## limitedParallelism — The Right Way to Control Concurrency

Before `limitedParallelism` was introduced, developers would create custom dispatchers with `Executors.newFixedThreadPool(n).asCoroutineDispatcher()`. This created entirely separate thread pools, which meant those threads couldn't be shared with anything else. If you created a 4-thread pool for database writes and another 4-thread pool for file operations, you had 8 dedicated threads sitting around even when one pool was idle and the other was saturated.

`limitedParallelism` solves this by creating a **view** over the parent dispatcher, not a new thread pool. It limits how many coroutines from this view can run concurrently, but the actual threads come from the parent pool. This means unused capacity is available to other work on the same pool.

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

```kotlin
class ImageRepository(
    private val dispatchers: AppDispatchers,
    private val imageApi: ImageApi,
    private val imageProcessor: ImageProcessor,
) {
    suspend fun processUserImages(imageUrls: List<String>): List<ProcessedImage> {
        return coroutineScope {
            imageUrls.map { url ->
                async(dispatchers.databaseDispatcher) {
                    val raw = imageApi.downloadImage(url)
                    withContext(dispatchers.imageProcessingDispatcher) {
                        imageProcessor.compress(raw)
                    }
                }
            }.awaitAll()
        }
    }
}
```

The `databaseDispatcher` above limits database concurrency to 4, which protects SQLite from too many concurrent writers (SQLite serializes writes anyway, so more threads just means more lock contention). The `imageProcessingDispatcher` limits CPU-intensive image work to 2 threads so it doesn't monopolize the Default pool and starve other computational work like layout calculations or data transformations.

But `limitedParallelism` isn't free. It adds a coordination layer — a semaphore-like mechanism that tracks how many coroutines are currently active in the view. Each dispatch checks this counter, and if the limit is reached, the coroutine is queued until a slot opens. For very high-throughput scenarios where you're dispatching thousands of small tasks per second, this coordination overhead becomes measurable. In most Android apps, it's negligible, but IMO it's good to know you're trading a small amount of dispatch latency for better resource control. For a single-writer pattern (like `limitedParallelism(1)` for sequential access), this is essentially a coroutine-based mutex and works well, though a real `Mutex` might be more readable for that specific pattern.

## Measuring Dispatch Overhead

I think most developers don't realize that dispatching itself has a cost. Switching from one dispatcher to another isn't free — it involves queueing work, potentially waking a thread, and synchronizing state. Here's a rough way to measure it:

```kotlin
suspend fun measureDispatchOverhead() {
    val iterations = 10_000

    val ioToDefaultTime = measureTimeMillis {
        repeat(iterations) {
            withContext(Dispatchers.IO) {
                withContext(Dispatchers.Default) {
                    // Empty — just measuring the dispatch
                }
            }
        }
    }

    val mainImmediateTime = measureTimeMillis {
        withContext(Dispatchers.Main.immediate) {
            repeat(iterations) {
                withContext(Dispatchers.Main.immediate) {
                    // Same thread — should be near zero
                }
            }
        }
    }

    Log.d("DispatchBench",
        "IO→Default: ${ioToDefaultTime / iterations.toDouble()}ms per dispatch")
    Log.d("DispatchBench",
        "Main.immediate→same: ${mainImmediateTime / iterations.toDouble()}ms per dispatch")
}
```

On a Pixel 7 running this in a release build, I measured roughly 0.05-0.1ms (50-100μs) per `IO → Default` context switch, and under 0.005ms for `Main.immediate` when already on the main thread. That 50-100μs might seem tiny, but consider a screen that loads 10 items from a paginated API, where each item goes through IO fetch → Default parse → Main render. That's 30 dispatcher switches per page load. At 100μs each, you're spending 3ms just on dispatching overhead — not doing any actual work. On a 16ms frame budget, that's nearly 20% spent on thread coordination.

This is why I don't recommend wrapping every single function in `withContext`. If you have a chain of operations that all belong on the same dispatcher, keep them in one `withContext` block. The overhead of unnecessary context switches is small individually but adds up in hot paths. On the other hand, skipping `withContext` when you actually need it — like doing disk IO on Default — is far worse than the dispatch cost. It's a tradeoff, and the right answer depends on profiling your specific code path.

## Practical Guidelines

After debugging enough dispatcher-related issues, here's how I think about choosing dispatchers in practice:

- **Network calls, database queries, file reads/writes** → `Dispatchers.IO`. These operations block the thread while waiting for external resources. That's exactly what the elastic IO pool is designed for.

- **JSON parsing, list sorting, image processing, encryption** → `Dispatchers.Default`. These are CPU-bound. They don't block on anything external — they just need CPU time. The core-sized pool gives them better performance than the oversized IO pool.

- **UI state updates, triggering recompositions** → `Dispatchers.Main.immediate` (which `viewModelScope` already provides). Use plain `Dispatchers.Main` only if you specifically want to defer execution to the next message queue cycle.

- **Rate-limiting a specific subsystem** → `limitedParallelism` on the appropriate parent dispatcher. Database writes? `Dispatchers.IO.limitedParallelism(4)`. Heavy computation that shouldn't starve the rest? `Dispatchers.Default.limitedParallelism(2)`.

- **Don't create standalone thread pools** via `Executors.newFixedThreadPool().asCoroutineDispatcher()` unless you have a very specific reason (like isolating a third-party library that does something unpredictable with threads). Prefer `limitedParallelism` to keep threads shared and utilization high.

One last thing — always inject your dispatchers. Hardcoding `Dispatchers.IO` throughout your codebase makes testing painful because you can't swap in `TestDispatcher`. Wrapping dispatchers in an injectable interface or a simple data class means your tests run on `UnconfinedTestDispatcher` or `StandardTestDispatcher`, which gives you deterministic control over coroutine execution without flaky timing issues.

```kotlin
class AppCoroutineDispatchers(
    val main: CoroutineDispatcher = Dispatchers.Main.immediate,
    val io: CoroutineDispatcher = Dispatchers.IO,
    val default: CoroutineDispatcher = Dispatchers.Default,
    val database: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(4),
)
```

Dispatchers are one of those things that seem simple until they aren't. They work fine with defaults for most code. But the moment your app hits real-world scale — hundreds of concurrent operations, mixed CPU and IO workloads, tight frame budgets — understanding what's happening underneath the API becomes the difference between an app that feels smooth and one that freezes on your users' devices.

Thanks for reading through all of this :), Happy Coding!
