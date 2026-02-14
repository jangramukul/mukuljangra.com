---
title: Android Threading With Handler and Looper
layout: post
categories: post
tags:
  - Android
  - Performance
  - Architecture
---

A few years ago, I remember managing almost everything with raw `Thread` objects. Need to fetch data from the network? `new Thread(() -> { ... }).start()`. Need to update the UI after? `runOnUiThread(() -> { ... })`. Need to do something periodically? Create a thread, put it in a `while(true)` loop with `Thread.sleep()`. It worked, technically. It was also a nightmare to debug, impossible to cancel cleanly, and leaked memory in ways that would make garbage collectors weep.

The thing is, Android's threading model has always had a more principled system underneath — `Handler`, `Looper`, and `MessageQueue`. These three classes form the backbone of how Android processes work on every thread, including the main thread. Understanding how they work doesn't just help with legacy code. It gives you a mental model for why modern tools like Coroutines and `Dispatchers.Main` behave the way they do.

## How the Main Thread Actually Works

Every Android developer knows the rule: don't block the main thread. But what *is* the main thread, really? It's not just "the thread that handles UI." It's a thread running an infinite loop — a `Looper` — that pulls messages from a `MessageQueue` one at a time and processes them.

When your app launches, the system calls `ActivityThread.main()`. That method does something remarkably simple: it creates a `Looper`, attaches it to the main thread, and calls `Looper.loop()`. That loop runs forever — or until the app process is killed. Every UI event, every lifecycle callback, every `View.post()` Runnable, every `Handler.sendMessage()` — they all end up as `Message` objects sitting in the main thread's `MessageQueue`, waiting to be processed one by one.

```kotlin
// Simplified version of what Android's ActivityThread.main() does
fun main() {
    Looper.prepareMainLooper()

    val handler = Handler(Looper.getMainLooper())

    // This is the secret — every Activity lifecycle callback,
    // every touch event, every invalidation is dispatched
    // through this message queue
    Looper.loop()  // Blocks forever, processing messages
}
```

This is why blocking the main thread causes jank. If your `onClick` listener takes 200ms to run, the Looper can't pull the next message from the queue until it finishes. Touch events, animations, layout passes — they're all queued up waiting. The user sees the app freeze because the Looper is stuck processing your slow message.

## The Trio — Looper, MessageQueue, Handler

**Looper** is the infinite loop. Each thread can have at most one Looper, and the main thread always has one. When you call `Looper.loop()`, it blocks the current thread and starts processing messages from its MessageQueue. It will keep running until `quit()` is called.

**MessageQueue** is the queue that holds `Message` objects. Messages are ordered by their `when` timestamp — which is why `Handler.postDelayed()` works. The message is enqueued with a future timestamp, and the Looper won't process it until that time arrives. The MessageQueue also handles synchronization barriers for async messages, which is how Android prioritizes UI rendering messages over regular messages.

**Handler** is your interface for putting messages into a specific thread's queue and defining how they're processed. When you create a Handler, you attach it to a Looper. When you call `handler.sendMessage()` or `handler.post()`, the message goes into that Looper's MessageQueue. When the Looper processes it, it calls `handler.handleMessage()` or runs the posted Runnable.

```kotlin
class LocationTracker(
    private val locationClient: FusedLocationProviderClient,
    private val onLocationUpdate: (Location) -> Unit
) {

    private val mainHandler = Handler(Looper.getMainLooper())

    // Messages are identified by what codes
    companion object {
        private const val MSG_LOCATION_UPDATE = 1
        private const val MSG_TRACKING_TIMEOUT = 2
    }

    private val callbackHandler = object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            when (msg.what) {
                MSG_LOCATION_UPDATE -> {
                    val location = msg.obj as Location
                    onLocationUpdate(location)
                }
                MSG_TRACKING_TIMEOUT -> {
                    stopTracking()
                }
            }
        }
    }

    fun startTracking(timeoutMs: Long = 30_000L) {
        // Post a delayed message — Looper won't process it
        // until timeoutMs has passed
        callbackHandler.sendEmptyMessageDelayed(MSG_TRACKING_TIMEOUT, timeoutMs)
    }

    fun stopTracking() {
        // Remove pending messages to prevent leaks
        callbackHandler.removeMessages(MSG_TRACKING_TIMEOUT)
        callbackHandler.removeMessages(MSG_LOCATION_UPDATE)
    }
}
```

The pattern of `removeMessages()` in cleanup is critical and often forgotten. If you post a delayed message and then the Activity or Fragment is destroyed, that message still sits in the queue holding a reference to your Handler, which holds a reference to your outer class. This is one of the classic Android memory leak patterns — and it's why using an inner `Handler` class without a `WeakReference` shows up as a lint warning.

## HandlerThread — A Thread With Its Own Looper

By default, a new `Thread` has no Looper. If you want a background thread that can receive and process messages sequentially, you need to set up a Looper on that thread. `HandlerThread` does exactly this — it's a thread that creates a Looper in its `run()` method and blocks on `Looper.loop()`.

This is useful when you have work that needs to happen off the main thread but in a sequential, ordered fashion. Database writes, file operations, analytics event batching — these are cases where you want a single background thread processing tasks in order, not a thread pool firing things concurrently.

```kotlin
class AnalyticsDispatcher {

    private val handlerThread = HandlerThread("analytics-worker").apply {
        start()  // Must start before accessing looper
    }

    private val workerHandler = Handler(handlerThread.looper)

    fun trackEvent(eventName: String, properties: Map<String, Any>) {
        // This Runnable will execute on the HandlerThread,
        // not on the thread that called trackEvent()
        workerHandler.post {
            val payload = buildPayload(eventName, properties)
            sendToServer(payload)  // Safe — we're on a background thread
        }
    }

    fun trackScreenView(screenName: String) {
        workerHandler.post {
            val payload = buildScreenPayload(screenName)
            sendToServer(payload)
        }
    }

    fun shutdown() {
        handlerThread.quitSafely()  // Process remaining messages, then stop
    }

    private fun buildPayload(event: String, props: Map<String, Any>): String {
        // Build JSON payload
        return """{"event": "$event", "props": $props}"""
    }

    private fun sendToServer(payload: String) {
        // Network call on background thread
    }
}
```

`quitSafely()` vs `quit()` is a subtle but important distinction. `quit()` removes all pending messages from the queue and stops the Looper immediately — even messages that were supposed to execute before the quit call. `quitSafely()` processes all messages that are already due and only removes future-dated ones. For most cases, `quitSafely()` is what you want because it guarantees that work you've already submitted gets completed.

## The Evolution — From Handlers to Coroutines

Understanding Handlers gives you a deeper appreciation for what coroutines do under the hood. When you write `withContext(Dispatchers.Main)` in a coroutine, you're ultimately using a Handler. The `Dispatchers.Main` dispatcher on Android is backed by a `Handler` that posts to the main thread's Looper. When your coroutine resumes on the main dispatcher, it's literally a `handler.post()` call under the surface.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    // Under the hood, Dispatchers.Main uses Handler(Looper.getMainLooper()).post()
    // to resume the coroutine on the main thread
    fun search(query: String) {
        viewModelScope.launch {
            // Running on Dispatchers.Main by default (viewModelScope)
            _uiState.value = SearchState.Loading

            // Switches to Dispatchers.IO — which is a thread pool
            val results = withContext(Dispatchers.IO) {
                searchRepository.search(query)
            }

            // Back on Dispatchers.Main — resumed via Handler.post()
            _uiState.value = SearchState.Success(results)
        }
    }
}
```

The same pattern that `Handler` established — post work to a specific thread's queue, process it when the Looper gets to it — is what coroutines do. The difference is that coroutines give you structured concurrency, automatic cancellation, and a much cleaner API. But the underlying mechanism is the same `Looper` and `MessageQueue` that've been in Android since API 1.

This is also why `Dispatchers.Main.immediate` exists. Regular `Dispatchers.Main` always posts to the queue, which means there's at least one frame delay before the coroutine resumes. `Dispatchers.Main.immediate` checks if you're already on the main thread, and if so, executes immediately without posting. It's a small optimization, but it matters for things like state updates that should be synchronous when possible.

## The Tradeoffs — Why Raw Handlers Still Exist

With coroutines available, why would anyone use Handlers directly? Honestly, in most application code, you wouldn't. Coroutines are more expressive, easier to cancel, and integrate with lifecycle-aware components.

But Handlers aren't going away. The framework uses them everywhere — `View.post()`, `Activity.runOnUiThread()`, `ContentProvider` callbacks, system service interactions. If you're writing a library that needs to be coroutine-agnostic, Handlers are the lower-level primitive that works without pulling in the coroutines dependency. And for certain patterns — like debouncing input with `removeMessages()` and `sendMessageDelayed()` — Handlers are more direct than setting up a coroutine with delay.

The honest tradeoff is complexity vs control. Handlers give you fine-grained control over message ordering, timing, and priority, but at the cost of manual lifecycle management and verbose code. Coroutines give you clean, sequential-looking async code with automatic cancellation, but they abstract away the message queue in ways that can surprise you when timing matters. For most Android app development, coroutines win. For framework-level work and library development, understanding Handlers is still essential.

The main thread's Looper is the heartbeat of every Android app. Every touch event, every lifecycle callback, every UI update passes through it. Whether you're using Handlers directly or writing coroutines that dispatch through them indirectly, the mental model is the same: work goes into a queue, the Looper processes it in order, and blocking that processing is what makes your app feel slow. Understanding that model makes you a better Android developer, regardless of which abstraction you prefer.

Thanks for reading!
