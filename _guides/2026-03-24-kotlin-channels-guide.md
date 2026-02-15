---
title: Kotlin Channels Guide
layout: post
sequence: 118
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Channels are the coroutine equivalent of `BlockingQueue`. Where a blocking queue uses `put` and `take` that block threads, a channel uses `send` and `receive` that suspend coroutines. They let two coroutines communicate by passing values through a shared pipe — no shared mutable state, no locks, no `synchronized` blocks. One coroutine sends, another receives, and the channel handles the synchronization.

I think channels are one of the most misunderstood parts of the coroutines library. Not because they're complicated — the API is small and the mental model is straightforward. The confusion comes from when to use them. When `SharedFlow` and `StateFlow` landed in `kotlinx.coroutines 1.4`, they covered 90% of the use cases that people were reaching for channels to solve. Sharing state across the UI layer, broadcasting events, building reactive streams — Flow handles all of that more cleanly. But channels aren't obsolete. They solve a different problem: direct, point-to-point communication between coroutines, especially when you need work distribution or coordination primitives. The trick is knowing which problem you're actually solving.

This guide covers what channels are, how they work internally, and — more importantly — where they genuinely belong in your Android architecture versus where Flow is the better tool.

## Channel Basics

A channel has two operations: `send()` and `receive()`. Both are suspend functions. `send` suspends when the channel is full (or has no receiver, depending on the channel type). `receive` suspends when the channel is empty. This is the fundamental contract — the sender waits for capacity, the receiver waits for data, and the channel coordinates the handoff.

```kotlin
class ImageProcessor(
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun processImages(urls: List<String>): List<Bitmap> {
        val channel = Channel<String>()
        val results = mutableListOf<Bitmap>()

        coroutineScope {
            // Producer — feeds URLs into the channel
            launch {
                for (url in urls) {
                    channel.send(url)
                }
                channel.close()
            }

            // Consumer — processes each URL
            launch(ioDispatcher) {
                for (url in channel) {
                    val bitmap = downloadAndDecode(url)
                    results.add(bitmap)
                }
            }
        }

        return results
    }
}
```

There's a critical detail here: `channel.close()`. Unlike a `Flow` that completes when the builder block returns, a channel stays open until you explicitly close it or the producing coroutine is cancelled. Forgetting to close a channel means the receiving `for` loop hangs forever, waiting for more elements. This is the most common channel bug I've seen in code reviews, and it's one reason `produce` (covered below) is usually the better choice — it closes the channel automatically when the coroutine completes.

Channels are **hot**. The moment a coroutine calls `send`, the value is dispatched. There's no lazy evaluation, no "nothing happens until you collect." If nobody is receiving, the sender either suspends (waiting for a receiver) or the value sits in the buffer. This is fundamentally different from a cold `Flow`, where emissions only happen when a collector triggers the upstream. In practice, this means channels are stateful pipes — they have a lifecycle, they accumulate or drop values, and they need explicit management. Flows are declarative descriptions of data transformation that execute on demand.

## Channel Types

When you create a channel with `Channel<T>(capacity)`, the capacity determines the buffering behavior. This isn't just a performance knob — it changes the fundamental semantics of how producers and consumers interact.

**Rendezvous (capacity = 0)** is the default. The sender suspends until a receiver is ready, and the receiver suspends until a sender is ready. They must "meet" to transfer the value. No buffering at all. This gives you the tightest synchronization — the producer can never get ahead of the consumer. I use rendezvous channels when I need lock-step coordination between two coroutines, like a handshake protocol or a ping-pong pattern.

**Buffered (capacity = N)** allows the sender to send up to N values before suspending. Once the buffer is full, `send` suspends until the receiver consumes something. A buffer of 64 is the default for `Channel.BUFFERED`. This is the right choice when the producer is bursty but the consumer can keep up on average.

```kotlin
// Buffered channel for batch processing
val taskChannel = Channel<AnalyticsEvent>(capacity = 64)

// Producer — fast, bursty
launch {
    userActions.collect { action ->
        taskChannel.send(action.toAnalyticsEvent())
    }
}

// Consumer — slower, batched writes
launch(Dispatchers.IO) {
    val batch = mutableListOf<AnalyticsEvent>()
    for (event in taskChannel) {
        batch.add(event)
        if (batch.size >= 20) {
            analyticsApi.sendBatch(batch.toList())
            batch.clear()
        }
    }
}
```

**Unlimited (capacity = Channel.UNLIMITED)** never suspends the sender. Values pile up in an internal linked list with no backpressure. This is dangerous in Android because there's no upper bound on memory usage. If the consumer is slower than the producer, you're building an ever-growing queue that eventually causes an `OutOfMemoryError`. I've seen this happen with location updates — the GPS fires faster than the network can upload, and the channel grows until the app crashes. Use unlimited channels only when you're certain the total number of values is bounded and small.

**Conflated (capacity = Channel.CONFLATED)** keeps only the latest value. When a new value arrives and the previous one hasn't been received yet, the old value is silently dropped. This is useful for "latest state" scenarios — sensor readings, location updates, progress indicators — where only the most recent value matters. But here's the thing: if you need conflated behavior for a stream that multiple consumers read, `StateFlow` is almost always better. `StateFlow` is essentially a conflated broadcast mechanism with a cleaner API. Use conflated channels only when you have a single consumer and need the channel semantics (like using it with `select`).

## produce Builder

The `produce` coroutine builder solves two problems with raw channels: structured concurrency and automatic closing. When you create a channel manually and launch a coroutine to send into it, you have to remember to close the channel when done. With `produce`, the channel closes automatically when the coroutine completes — either normally or by cancellation. And because `produce` is a `CoroutineScope` extension, the produced channel is tied to the scope's lifecycle.

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    fun CoroutineScope.fetchAllPages(): ReceiveChannel<List<Article>> = produce(ioDispatcher) {
        var page = 1
        var hasMore = true

        while (hasMore) {
            val response = api.getArticles(page = page, pageSize = 25)
            send(response.articles)
            hasMore = response.hasNextPage
            page++
        }
        // Channel closes automatically here — no explicit close() needed
    }
}
```

This pattern is particularly clean for paginated API calls. Each page is sent as it arrives, and the consumer processes pages as they come in rather than waiting for all pages to load. The consumer just iterates the `ReceiveChannel` with a `for` loop, and when the producer finishes (no more pages), the loop ends naturally.

The return type is `ReceiveChannel<T>`, not `Channel<T>`. This is intentional — the consumer shouldn't be able to send back into the channel. It's a one-directional pipe: the `produce` block sends, and the receiver consumes. Compare this to creating a `Channel<T>()` and handing it to both sides — either side can accidentally call the wrong operation. `produce` enforces the direction at the type level.

One thing worth noting: `produce` uses a rendezvous channel by default (capacity 0). If your producer is faster than your consumer, pass a capacity parameter: `produce(capacity = Channel.BUFFERED)`. Without it, the producer suspends on every `send` until the consumer is ready, which defeats the purpose of asynchronous page loading.

## Fan-Out and Fan-In

Channels have a property that `Flow` doesn't: **each element is received by exactly one consumer**. When multiple coroutines receive from the same channel, each value goes to one of them — the first one that calls `receive`. This is work distribution, not broadcasting. This is the key distinction from `SharedFlow`, where every collector gets every emission.

Fan-out is perfect for parallel processing where each item should be processed once:

```kotlin
class NotificationSender(
    private val notificationApi: NotificationApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun sendBulkNotifications(
        notifications: List<PushNotification>,
        workerCount: Int = 4
    ) {
        coroutineScope {
            val channel = produce {
                for (notification in notifications) {
                    send(notification)
                }
            }

            // Launch N workers — each takes one notification at a time
            repeat(workerCount) { workerId ->
                launch(ioDispatcher) {
                    for (notification in channel) {
                        notificationApi.send(notification)
                    }
                }
            }
        }
    }
}
```

Four workers pull from the same channel. If worker #2 is busy with a slow push, workers #1, #3, and #4 keep pulling and sending. The channel handles the load balancing automatically — whichever worker calls `receive` first gets the next item. I've used this pattern for bulk operations like sending 10,000 push notifications. With 8 workers, the total time dropped from around 50 minutes (sequential) to roughly 7 minutes (parallel, limited by API rate limits).

Fan-in is the opposite: multiple producers sending to one channel. The items interleave in the order they arrive. Multiple feed sources can each launch a coroutine that sends into one shared channel. The consumer reads from a single stream without caring which source produced which item. There's no guaranteed ordering across producers — items arrive as fast as each source produces them.

## Channels vs Flow

This is the section that matters most for practical Android development. Channels and Flow solve different problems, and using the wrong one creates unnecessary complexity.

**Channels are hot, imperative, and mutable.** They exist as objects. They have state (buffered values, open/closed). They support multiple concurrent producers and multiple concurrent consumers. Each value is consumed exactly once. They're a communication primitive — a pipe between coroutines.

**Flow is cold (usually), declarative, and composable.** A `Flow` is a description of a computation. It doesn't run until collected. Each collector gets its own independent execution of the upstream. It has rich transformation operators — `map`, `filter`, `flatMapLatest`, `combine`, `debounce`. It's the reactive stream abstraction for Kotlin.

Here's my rule of thumb: if you're building a data pipeline that transforms, filters, or combines streams, use Flow. If you're coordinating concurrent coroutines or distributing work, use channels. In Android specifically, SharedFlow and StateFlow cover almost every "I need to share data between layers" scenario. Channels shine in the narrow space where you need work distribution (fan-out), coroutine coordination, or interop with `select` expressions.

The biggest mistake I see is using a `Channel` where `SharedFlow` works. Someone creates a channel in a repository, sends events into it, and collects from it in a ViewModel. That's just a worse `SharedFlow` — you lose replay, you lose the ability to have multiple collectors, and you take on the burden of managing the channel's lifecycle. Unless you specifically need the "each value goes to one consumer" guarantee, reach for Flow.

```kotlin
// Don't do this — channel as an event bus
class EventBus {
    private val channel = Channel<AppEvent>(Channel.BUFFERED)
    suspend fun emit(event: AppEvent) = channel.send(event)
    fun events(): ReceiveChannel<AppEvent> = channel
}

// Do this instead — SharedFlow as an event bus
class EventBus {
    private val _events = MutableSharedFlow<AppEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<AppEvent> = _events.asSharedFlow()
    suspend fun emit(event: AppEvent) = _events.emit(event)
}
```

The `SharedFlow` version supports multiple collectors, doesn't require manual closing, and integrates cleanly with the rest of the Flow ecosystem (`combine`, `flatMapLatest`, lifecycle-aware collection). The channel version is a footgun — add a second collector and each event goes to only one of them, which is almost never what you want for an event bus.

That said, `Flow` is built on channels internally. `channelFlow` and `callbackFlow` both create channels under the hood, and `buffer()` adds a channel-backed buffer to a flow. Understanding channels helps you understand Flow's internals, even if you rarely use channels directly.

## When to Use Channels

After all the "prefer Flow" advice, here are the cases where channels genuinely are the right tool.

**Work distribution among parallel workers.** When you have N items to process and want M workers processing them concurrently, channels are the natural fit. Each item goes to exactly one worker. Flow can't do this — every collector gets every emission. The fan-out pattern described above is the canonical example. I've used this for parallel image uploads, batch database migrations, and bulk API calls.

**Coordinating concurrent coroutines.** When two coroutines need to signal each other — "I'm done with step 1, you can start step 2" — a rendezvous channel is a clean synchronization primitive. It's more explicit than a `Mutex` or `CompletableDeferred` when the coordination involves passing data along with the signal.

**Implementing the actor pattern.** An actor is a coroutine that processes messages sequentially from a channel. It's a thread-safe way to manage mutable state without locks — all mutations happen inside one coroutine, and other coroutines communicate with it by sending messages through a channel.

```kotlin
sealed class CounterMsg {
    object Increment : CounterMsg()
    class GetCount(val response: CompletableDeferred<Int>) : CounterMsg()
}

fun CoroutineScope.counterActor() = actor<CounterMsg> {
    var count = 0
    for (msg in channel) {
        when (msg) {
            is CounterMsg.Increment -> count++
            is CounterMsg.GetCount -> msg.response.complete(count)
        }
    }
}
```

The `actor` builder creates a coroutine with its own channel. All state mutation happens inside the `for` loop, which runs sequentially on a single coroutine. No race conditions, no locks. Other coroutines send messages, and the actor processes them one at a time. This is conceptually similar to how `Dispatchers.Main.immediate` makes UI state updates safe — serialization through a single execution context. The actor pattern just makes it explicit and gives you a typed message protocol.

**Rate limiting with ticker channels.** The `ticker` function creates a channel that emits `Unit` at fixed intervals. You can use it to throttle operations — for example, limiting API calls to one per second by receiving from a ticker channel before each call. Though for most Android rate-limiting scenarios, `Flow.debounce()` or `Flow.sample()` is simpler.

## Quiz

**Question 1.** You have a `Channel<Task>` and launch 3 coroutines that all call `for (task in channel)`. A producer sends 9 tasks into the channel. How are the tasks distributed?

**Wrong**: Each coroutine receives all 9 tasks (27 total task executions).

**Correct**: Each task goes to exactly one coroutine. The 9 tasks are distributed among the 3 workers — roughly 3 each, depending on processing speed. This is fan-out behavior. Channels deliver each element to the first coroutine that calls `receive`. This is fundamentally different from `SharedFlow`, where every collector would get all 9 emissions.

**Question 2.** What happens if you create a `Channel<String>()` (default rendezvous channel), launch a coroutine that calls `send("hello")`, but never call `receive`?

**Wrong**: The string is buffered inside the channel and waits until someone receives it.

**Correct**: The `send` call suspends indefinitely. A rendezvous channel has zero buffer capacity — `send` cannot complete until a receiver is ready to accept the value. If no coroutine ever calls `receive`, the sending coroutine stays suspended. In a structured concurrency scope, the scope would never complete because the sending coroutine never finishes. This is why rendezvous is called rendezvous — both parties must show up for the exchange to happen.

## Coding Challenge

Build a `ParallelDownloader` that downloads a list of file URLs using a configurable number of worker coroutines. Use a `produce` builder to feed URLs into a channel, and launch N worker coroutines that pull from the channel and download each file. Each worker should retry a failed download once before reporting it as failed. Return a list of `DownloadResult` (sealed class with `Success` and `Failure` variants). Verify that with 4 workers and 20 URLs, all URLs are processed exactly once and no URL is downloaded by more than one worker.

Thanks for reading!
