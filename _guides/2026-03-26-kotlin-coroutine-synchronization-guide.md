---
title: Kotlin Coroutine Synchronization Guide
layout: post
sequence: 120
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Coroutines don't magically solve shared state problems. I learned this the hard way when a counter in a production analytics module was consistently undercounting events. The code looked fine — a simple `var counter = 0` incremented from `viewModelScope.launch` calls — but under load, multiple coroutines on `Dispatchers.Default` were reading and writing that variable simultaneously. The final count was wrong by 10-15% on every run. Switching to `synchronized` fixed the count but introduced a different problem: the `synchronized` block was holding a thread lock while a suspend function tried to yield, effectively defeating the purpose of coroutines.

The fundamental issue is that coroutines run on threads, and when multiple coroutines share a dispatcher like `Dispatchers.Default` (which uses a thread pool sized to CPU cores), they execute in parallel on real threads. Shared mutable state needs synchronization — but the traditional Java tools (`synchronized`, `ReentrantLock`) block threads, which is exactly what coroutines are designed to avoid. Kotlin provides coroutine-native synchronization primitives that suspend instead of blocking, and choosing the right one depends on what kind of shared state you're protecting.

## Mutex

`Mutex` is the coroutine equivalent of `synchronized` — it ensures only one coroutine can execute a critical section at a time. The critical difference is that `Mutex.lock()` is a suspending function. When a coroutine hits a locked Mutex, it suspends and frees up the thread for other coroutines. A `synchronized` block, by contrast, parks the thread itself, which means that thread can't run any other coroutines until the lock is released. On a 4-core device using `Dispatchers.Default`, blocking one thread with `synchronized` means 25% of your CPU-bound capacity is wasted on waiting.

Here's the classic race condition and the Mutex fix. Consider an order tracking system that counts processed items:

```kotlin
// BROKEN — race condition with parallel coroutines
var processedCount = 0

suspend fun processOrders(orders: List<Order>) {
    coroutineScope {
        orders.forEach { order ->
            launch(Dispatchers.Default) {
                processOrder(order)
                processedCount++ // Not atomic — reads and writes interleave
            }
        }
    }
    // processedCount will be less than orders.size
}
```

The increment `processedCount++` is actually three operations: read the current value, add one, write the new value. Two coroutines can read the same value, both add one, and both write back — losing an increment. The Mutex fix:

```kotlin
val mutex = Mutex()
var processedCount = 0

suspend fun processOrders(orders: List<Order>) {
    coroutineScope {
        orders.forEach { order ->
            launch(Dispatchers.Default) {
                processOrder(order)
                mutex.withLock {
                    processedCount++
                }
            }
        }
    }
    // processedCount == orders.size, guaranteed
}
```

`withLock` is syntactic sugar for `mutex.lock(); try { ... } finally { mutex.unlock() }`. It guarantees the lock is released even if the block throws. One thing to watch out for: Kotlin's `Mutex` is not reentrant. If a coroutine holding a Mutex tries to acquire it again (say, through a nested function call), it deadlocks. This is a deliberate design choice by the JetBrains team — reentrant locks are harder to reason about and can mask bugs where you accidentally hold a lock longer than intended. If you find yourself needing reentrancy, it's usually a sign that your critical section is too large and should be restructured.

The tradeoff with Mutex is performance. Fine-grained locking — wrapping every single increment in `withLock` — adds suspension overhead on every operation. For a simple counter, there's a faster tool.

## Atomic Variables

For simple counters and flags, atomic variables are the right tool. `AtomicInteger`, `AtomicLong`, and `AtomicReference` use CPU-level compare-and-swap (CAS) instructions to perform lock-free updates. No suspension, no locking, no thread blocking — just a hardware-guaranteed atomic operation.

```kotlin
val processedCount = AtomicInteger(0)

suspend fun processOrders(orders: List<Order>) {
    coroutineScope {
        orders.forEach { order ->
            launch(Dispatchers.Default) {
                processOrder(order)
                processedCount.incrementAndGet() // Atomic — no lock needed
            }
        }
    }
    println("Processed: ${processedCount.get()}") // Always correct
}
```

The official Kotlin docs confirm this is the fastest solution for the counter problem. CAS operations complete in nanoseconds compared to the microsecond-scale overhead of Mutex suspension. But atomics only work for simple, single-step operations. You can atomically increment a counter or swap a reference, but you can't atomically update two related variables or perform a read-modify-write on a complex data structure. For those, you need Mutex.

Here's something worth knowing: `MutableStateFlow` uses atomics internally. When you call `update { }` on a `MutableStateFlow`, it uses a CAS loop under the hood — it reads the current value, applies your transformation, and attempts to write it back. If another thread modified the value between the read and write, the CAS fails and the lambda runs again with the new value. This is why `update { }` is thread-safe without external synchronization, and why you should prefer it over `value = ...` when the new value depends on the old one.

```kotlin
class CartViewModel : ViewModel() {
    private val _itemCount = MutableStateFlow(0)
    val itemCount: StateFlow<Int> = _itemCount.asStateFlow()

    fun addItem() {
        _itemCount.update { current -> current + 1 } // CAS loop — safe
    }

    // DON'T do this — read and write are separate, non-atomic operations
    fun addItemUnsafe() {
        _itemCount.value = _itemCount.value + 1 // Race condition
    }
}
```

For boolean flags — like "is syncing in progress" or "has the user seen the onboarding" — `AtomicBoolean` works. But in practice, I reach for `MutableStateFlow<Boolean>` instead because it gives me the atomicity plus the ability to observe changes reactively. Atomics are fire-and-forget; StateFlow is fire-and-observe.

## Semaphore

A Mutex is a binary lock — one coroutine in, everyone else waits. A `Semaphore` generalizes this to N concurrent operations. You create it with a number of permits, and each coroutine acquires a permit before proceeding. When all permits are taken, the next coroutine suspends until one is released.

The most common real-world use case is rate-limiting API calls. If your backend allows 4 concurrent requests before throttling, or your database connection pool has 4 connections, a Semaphore enforces that limit:

```kotlin
class ImageDownloader(
    private val httpClient: HttpClient,
    private val imageDao: ImageDao
) {
    // Allow at most 4 simultaneous downloads
    private val downloadSemaphore = Semaphore(permits = 4)

    suspend fun downloadAll(urls: List<String>): List<ImageResult> {
        return coroutineScope {
            urls.map { url ->
                async {
                    downloadSemaphore.withPermit {
                        val bytes = httpClient.downloadImage(url)
                        imageDao.save(url, bytes)
                        ImageResult.Success(url)
                    }
                }
            }.awaitAll()
        }
    }
}
```

Without the Semaphore, 200 URLs would launch 200 simultaneous downloads, overwhelming the server (or getting you rate-limited), consuming massive memory for buffered responses, and likely causing OOM on lower-end devices. With `Semaphore(4)`, only 4 downloads run at a time. The other 196 coroutines suspend — they don't block threads, they don't consume CPU, they just wait efficiently until a permit becomes available.

The difference between Semaphore and `limitedParallelism` is subtle but important. `Dispatchers.IO.limitedParallelism(4)` limits how many threads your work can occupy. `Semaphore(4)` limits how many coroutines can enter a section regardless of which threads they're on. If your bottleneck is a shared resource (API rate limit, connection pool), Semaphore is the right abstraction. If your bottleneck is CPU or thread availability, `limitedParallelism` is better.

One tradeoff: Semaphore doesn't know about fairness by default. Under heavy contention, some coroutines might acquire permits more often than others. For most Android use cases this doesn't matter, but it's worth knowing if you're building a system where every coroutine needs guaranteed access.

## Single-Threaded Confinement

Sometimes the simplest solution is the best one. If all access to shared mutable state happens on a single thread, you don't need any synchronization at all. No Mutex, no atomics, no CAS loops — just the guarantee that only one thread touches the data.

`Dispatchers.Default.limitedParallelism(1)` creates a single-threaded dispatcher backed by the Default pool. Any coroutine dispatched to it executes sequentially, never concurrently. I covered this in the [Dispatchers Guide](https://mukuljangra.com/2026/03/15/kotlin-dispatchers-guide.html), but it's worth revisiting in the synchronization context because it's often the cleanest option.

```kotlin
class NotificationTracker {
    private val singleThread = Dispatchers.Default.limitedParallelism(1)
    private val sentNotifications = mutableListOf<String>()
    private var totalCount = 0

    suspend fun recordSent(notificationId: String) {
        withContext(singleThread) {
            sentNotifications.add(notificationId)
            totalCount++
            // Both operations happen atomically — no interleaving possible
        }
    }

    suspend fun getStats(): NotificationStats {
        return withContext(singleThread) {
            NotificationStats(
                totalSent = totalCount,
                recentIds = sentNotifications.takeLast(10)
            )
        }
    }
}
```

The beauty of this approach is that you can do complex multi-step mutations without any locking ceremony. Updating a list and a counter together? Just do it — no `withLock`, no atomic wrappers, no thinking about which operations are atomic. Everything on that dispatcher runs sequentially by definition.

The tradeoff is dispatch overhead. Every call to `withContext(singleThread)` involves dispatching the coroutine to that single thread, even if the operation is trivial. For a simple counter increment, an `AtomicInteger` is faster. But for complex state updates — where you'd need a Mutex to protect multiple steps — single-threaded confinement is simpler and harder to get wrong. I reach for it when the critical section involves more than one variable or when the state is a mutable collection. The mental model is just "all state access goes through this dispatcher," and there's nothing else to think about.

The Kotlin official docs actually list both fine-grained and coarse-grained thread confinement as solutions. Fine-grained (wrapping each operation individually in `withContext`) is slow because of constant thread switching. Coarse-grained (running the entire business logic block on the confined dispatcher) is fast and correct. In practice, coarse-grained is almost always what you want.

## Comparison and Guidelines

Choosing the right synchronization tool comes down to what you're protecting and how complex the access pattern is.

**Mutex** is for complex critical sections where multiple steps need to happen atomically. Think "read a value, compute something from it, write the result back" or "update three related fields together." It suspends instead of blocking, so it plays well with coroutines. But it adds suspension overhead on every acquisition and it's not reentrant — nested locking will deadlock.

**Atomic variables** (`AtomicInteger`, `AtomicLong`, `AtomicReference`) are for simple single-variable updates — counters, flags, reference swaps. They're lock-free and faster than Mutex for these cases. But they can't protect multi-step operations, and complex CAS loops with `AtomicReference` become hard to reason about quickly.

**Semaphore** is for limiting concurrency, not mutual exclusion. It answers the question "how many coroutines can do this at the same time?" Use it for rate-limiting API calls, capping database connections, or controlling parallel downloads. It's not a replacement for Mutex — it's a different tool for a different problem.

**Single-threaded confinement** via `limitedParallelism(1)` is for when you want the simplest mental model. All state access goes through one dispatcher, no concurrent access is possible, no locking needed. It has dispatch overhead, but for complex state objects it's the approach least likely to have bugs. I use it more than Mutex in practice because it's harder to misuse.

**`MutableStateFlow.update { }`** is specifically for UI state in ViewModels. It uses CAS internally, it's thread-safe, and it integrates with Compose and lifecycle-aware collection. If your shared state is a `StateFlow`, use `update { }` and you don't need any of the other tools.

My rule of thumb: start with the simplest tool that solves the problem. For a counter, use `AtomicInteger`. For UI state, use `StateFlow.update`. For complex shared state in a repository or cache, use `limitedParallelism(1)`. Reserve Mutex for cases where you specifically need mutual exclusion with minimal overhead and the critical section is short. And if you ever find yourself reaching for `synchronized` in coroutine code — stop. It blocks threads, and blocking threads in coroutines defeats the entire point.

## Quiz

#### What happens if you use a `synchronized` block inside a coroutine on `Dispatchers.Default`?

- **Wrong** It works the same as Mutex — the coroutine suspends until the lock is available
- **Wrong** It throws a runtime exception because `synchronized` is incompatible with coroutines
- **Correct** It blocks the underlying thread, preventing that thread from running any other coroutines until the lock is released
- **Wrong** It automatically converts to a Mutex at compile time

> **Explanation:** `synchronized` is a JVM thread-level lock — it doesn't know about coroutines. When a coroutine hits a `synchronized` block that's already locked, the thread itself is parked. On `Dispatchers.Default` with 4 threads, blocking one thread means 25% of your CPU-bound capacity is wasted on waiting. Use `Mutex` instead — it suspends the coroutine and frees the thread for other work.

#### When should you use Semaphore instead of Mutex?

- **Wrong** When you need to protect a shared counter from race conditions
- **Wrong** When you want faster performance than Mutex for critical sections
- **Correct** When you need to limit how many coroutines can perform an operation concurrently (e.g., capping API calls to 4 at a time)
- **Wrong** When you need reentrant locking behavior

> **Explanation:** Mutex is binary — one coroutine in, everyone else waits. Semaphore allows N coroutines to proceed simultaneously. It's designed for rate-limiting and resource pooling scenarios, not mutual exclusion. If your database allows 4 concurrent connections or your API rate-limits at 10 requests per second, Semaphore is the right tool.

## Coding Challenge

Build a `RateLimitedApiClient` that wraps an HTTP client and enforces a maximum of 3 concurrent API requests. It should accept a list of endpoints, fetch all of them in parallel (limited by the semaphore), and return results as a `Map<String, ApiResult>` where `ApiResult` is a sealed class with `Success(data: String)` and `Error(exception: Throwable)` variants. Track the total number of completed requests using an `AtomicInteger`. Use `supervisorScope` so one failed request doesn't cancel the others.

#### Solution

```kotlin
sealed class ApiResult {
    data class Success(val data: String) : ApiResult()
    data class Error(val exception: Throwable) : ApiResult()
}

class RateLimitedApiClient(
    private val httpClient: HttpClient
) {
    private val semaphore = Semaphore(permits = 3)
    private val completedCount = AtomicInteger(0)

    suspend fun fetchAll(endpoints: List<String>): Map<String, ApiResult> {
        return supervisorScope {
            endpoints.map { endpoint ->
                async {
                    val result = semaphore.withPermit {
                        try {
                            val response = httpClient.get(endpoint)
                            ApiResult.Success(response)
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            ApiResult.Error(e)
                        } finally {
                            completedCount.incrementAndGet()
                        }
                    }
                    endpoint to result
                }
            }.awaitAll().toMap()
        }
    }

    fun getCompletedCount(): Int = completedCount.get()
}
```

Thanks for reading!
