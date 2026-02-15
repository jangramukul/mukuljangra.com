---
title: Android Memory Leaks Guide
layout: post
sequence: 59
categories: post
tags:
  - Android
  - Performance
  - Best Practices
---

About two years ago, I got a bug report that our app was crashing with `OutOfMemoryError` after extended use. Not immediately — users had to navigate between screens for several minutes before it happened. The crash logs pointed to bitmap allocations, which was misleading. The real problem was far more subtle: a background task held a reference to a destroyed `Activity`, which held references to its entire view hierarchy, which held references to decoded bitmaps. One leaked `Activity` was keeping around 30-40 MB of memory that should have been freed. After three or four navigation cycles, the heap was exhausted.

That experience reshaped how I think about memory on Android. **Memory leaks are almost never about allocating too much — they're about holding memory too long.** The GC knows how to free unreferenced objects. The problem is when your code creates references that survive longer than the lifecycle of the component they point to. An `Activity` that should be collected after `onDestroy` stays alive because something — a static field, a callback, an inner class — still holds a reference to it.

## How the GC Decides What to Keep

To understand memory leaks, you need to understand how Android's garbage collector determines what's alive. The GC starts from a set of **GC roots** — static fields, thread-local variables, active thread stacks, and JNI references — and walks every reference chain from those roots. Any object reachable from a root is considered alive and won't be collected. Anything unreachable is garbage.

A memory leak happens when an object that should be unreachable — like a destroyed `Activity` — is still reachable from a GC root. The object isn't technically "leaked" in the C sense. It's just kept alive longer than it should be. The GC is doing its job perfectly — it's your code that created a reference path that shouldn't exist.

This is why memory leaks in Android are **lifecycle problems**. The framework creates and destroys `Activity`, `Fragment`, and `View` objects based on user navigation and configuration changes. Your code needs to release references to these objects at the right lifecycle moment. Every memory leak I've ever debugged boils down to one thing: a reference that outlives the lifecycle of the thing it points to.

## WeakReference vs SoftReference

Before getting into the leak patterns, it's worth understanding two JVM reference types that directly relate to memory management: `WeakReference` and `SoftReference`. They both let the GC collect the referenced object, but with very different timing guarantees.

A **WeakReference** is collected at the next GC cycle, regardless of memory pressure. If the only path to an object is through weak references, it's gone. This makes `WeakReference` ideal for listener registries and observer patterns — situations where you want to reference an object without preventing its collection. I've used this for things like analytics event listeners where a detached `Fragment` shouldn't keep receiving callbacks.

A **SoftReference** is collected only when the JVM is under memory pressure. The GC tries to keep soft-referenced objects around as long as there's available heap space. This makes `SoftReference` a natural fit for memory-sensitive caches — like decoded bitmap caches where you want to keep images around for reuse but not at the cost of an `OutOfMemoryError`. In practice, I've found soft references unreliable on Android because the GC behavior varies across devices and OEMs. For image caching specifically, `LruCache` with a fixed size limit gives you more predictable behavior than `SoftReference` ever will.

Here's the thing — don't use `WeakReference` as a band-aid for leaks. If you find yourself wrapping an `Activity` reference in a `WeakReference` to avoid a leak, you've got a design problem. The real fix is restructuring the code so the reference doesn't exist in the first place.

## Static Context Leaks

The most straightforward leak pattern: storing an `Activity` or `Context` in a `companion object` or top-level singleton. Static fields are GC roots — they live for the entire process lifetime. If a static field holds a reference to an `Activity`, that `Activity` can never be garbage collected.

```kotlin
class ImageCache {
    companion object {
        // LEAK: This holds the Activity's context forever
        private lateinit var context: Context

        fun init(context: Context) {
            this.context = context
        }
    }
}
```

The fix is always `applicationContext`. The `Application` object lives as long as the process, so holding a reference to it doesn't create a lifecycle mismatch. But I've seen a subtler variant that trips people up: storing a `View` in a static field. Views hold a reference to their parent `Context` (which is usually the `Activity`), so even if you think you're just caching a `View`, you're actually keeping the entire `Activity` alive.

The singleton pattern is especially dangerous. I've worked on codebases where a `UserManager` singleton stored the `Activity` context to show dialogs. Every configuration change leaked the old `Activity`. The rule is simple: **singletons should only ever hold `Application` context.** If your singleton needs to start an `Activity` or show a `Toast`, pass the `Application` context during initialization and pass `Activity` context per-call when you genuinely need it.

## Inner Class and Lambda Leaks

In Java and Kotlin, non-static inner classes hold an implicit reference to their enclosing class. This is the source of an enormous number of Android memory leaks, and it's easy to miss because the reference is invisible in the source code.

Anonymous `object` expressions in Kotlin work the same way — they capture a reference to the enclosing instance. And here's something that catches Kotlin developers off guard: **lambdas that access members of the enclosing class also capture `this`**. A lambda passed to `postDelayed` that calls an `Activity` method captures the `Activity` reference, just like an anonymous inner class would.

```kotlin
class OrderHistoryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // LEAK: This lambda captures 'this' (the Activity)
        // because loadOrders() is an Activity method
        handler.postDelayed({
            loadOrders()
        }, 30_000)
    }
    // If the user navigates away within 30 seconds,
    // the Activity leaks until the delayed message executes.
}
```

The classic Java fix was the static inner class with a `WeakReference` to the outer class — a pattern you'll still see in older codebases. But in modern Android development, the right fix is almost always lifecycle-aware scoping. Use `lifecycleScope.launch { delay(30_000); loadOrders() }` and the coroutine automatically cancels when the `Activity` is destroyed. No leaked references, no manual cleanup.

## Handler Leaks — The Mechanism

Handler leaks deserve their own section because the mechanism is non-obvious. When you call `handler.postDelayed(runnable, delay)`, the `Handler` wraps your `Runnable` in a `Message` object and enqueues it in the `Looper`'s `MessageQueue`. Here's the reference chain: **MessageQueue → Message → Runnable → Activity**. The `MessageQueue` is tied to the `Looper`, and the main `Looper` lives for the entire process. So any pending message in the main queue is a GC root path.

This means `postDelayed` with a long delay is basically a timed memory leak. Post with a 60-second delay, rotate the device 3 times in that window, and you've leaked 3 `Activity` instances. `HandlerThread` creates a separate `Looper` on a background thread — same problem. Any `Runnable` posted to it that captures an `Activity` reference will leak until the message is processed.

```kotlin
class DashboardActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        schedulePeriodicSync()
    }

    private fun schedulePeriodicSync() {
        handler.postDelayed({
            syncDashboardData()
            schedulePeriodicSync() // re-posts itself — permanent leak
        }, 60_000)
    }

    override fun onDestroy() {
        super.onDestroy()
        // MUST remove all pending messages
        handler.removeCallbacksAndMessages(null)
    }
}
```

IMO, raw `Handler` usage should be extremely rare in modern Android code. `lifecycleScope` with `delay()` handles the vast majority of use cases, and `repeatOnLifecycle` handles the periodic case. Both are lifecycle-aware by default — no cleanup code needed.

## BroadcastReceiver Leaks

`BroadcastReceiver` registered with `registerReceiver()` keeps a reference to the receiver object, which typically holds a reference to the `Activity` or `Fragment`. If you don't call `unregisterReceiver()` in the matching lifecycle callback, the system holds your receiver alive indefinitely.

```kotlin
class NotificationActivity : AppCompatActivity() {
    private val networkReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            updateConnectionBanner(intent) // captures Activity
        }
    }

    override fun onStart() {
        super.onStart()
        registerReceiver(
            networkReceiver,
            IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION)
        )
    }

    override fun onStop() {
        super.onStop()
        unregisterReceiver(networkReceiver)
    }
}
```

The register/unregister pair matters: `onStart`/`onStop` or `onCreate`/`onDestroy`. Mix them up (register in `onCreate`, unregister in `onStop`) and you'll either leak or crash with `IllegalArgumentException` for unregistering a receiver that wasn't registered.

Worth noting: `LocalBroadcastManager` was deprecated in favor of other observable patterns like `LiveData`, `Flow`, or even plain callbacks. If you're still using it, now's the time to migrate. For system-level broadcasts, manifest-declared receivers don't have this leak problem because they're not tied to a component instance — but they have their own restrictions starting from API 26.

## ViewModel Holding View References

`ViewModel` survives configuration changes — that's its entire purpose. But this means it outlives the `Activity` or `Fragment` that created it. If a `ViewModel` holds a reference to a `View`, `Context`, or `Activity`, that reference survives the configuration change and keeps the old (destroyed) `Activity` alive.

```kotlin
class CheckoutViewModel : ViewModel() {
    // LEAK: ViewModel survives config changes, View doesn't
    var submitButton: Button? = null

    // LEAK: Context is tied to the Activity lifecycle
    lateinit var context: Context
}
```

I've seen this pattern in codebases where developers pass `View` references to the `ViewModel` to update UI directly. The `ViewModel` should expose state (via `StateFlow`, `LiveData`, or Compose state), and the UI layer should observe it. If you need a `Context` in the `ViewModel`, use `AndroidViewModel` which provides the `Application` context — though I'd argue even that is a code smell, and you should inject the dependency you actually need instead of the whole `Context`.

## Detecting Leaks With LeakCanary

LeakCanary is, in my opinion, the single most valuable debugging tool for Android development. It automatically detects memory leaks during development by watching for objects that should have been garbage collected but weren't.

Here's how it works under the hood: when an `Activity` or `Fragment` is destroyed, LeakCanary creates a `WeakReference` to it and adds the reference key to a set of "watched" objects. After 5 seconds, it checks whether the `WeakReference` has been cleared. If it has, no leak. If it hasn't, LeakCanary triggers a heap dump and uses the **Shark** library to analyze the `.hprof` file, finding the shortest reference chain from a GC root to the leaked object. Shark is LeakCanary's standalone heap analysis engine — a Kotlin library that parses heap dumps and computes dominator trees. You can use Shark independently for CI-based leak detection.

Setting it up is a single dependency:

```kotlin
// build.gradle.kts
dependencies {
    debugImplementation("com.squareup.leakcanary:leakcanary-android:2.14")
}
```

No code changes needed. It hooks into `Application.ActivityLifecycleCallbacks` automatically in debug builds and watches every `Activity` and `Fragment` for leaks. The `debugImplementation` scope ensures it's stripped from release builds entirely, so there's zero overhead in production.

Reading the leak trace is straightforward once you know the pattern. LeakCanary shows the reference chain from GC root to leaked object — something like `Thread → Handler → Message → Runnable → OrderHistoryActivity`. Each line shows the class, the field name holding the reference, and whether it's highlighted as the likely culprit. The **bold underlined reference** in the trace is where LeakCanary thinks you should break the chain. Start there.

For custom objects, enable LeakCanary's `ObjectWatcher`. If you have a dependency injection scope tied to a user session, you can tell LeakCanary to watch it:

```kotlin
class UserSession(val userId: String) {
    fun destroy() {
        AppWatcher.objectWatcher.expectWeaklyReachable(
            this,
            "UserSession for $userId should be GC'd after logout"
        )
    }
}
```

This catches leaks in your own architecture, not just framework components.

## Android Profiler Memory View

LeakCanary is great for catching leaks during development, but sometimes you need to investigate memory usage more broadly — fragmentation, allocation patterns, or leaks that only reproduce in specific flows. That's where **Android Studio's Memory Profiler** comes in.

The Memory Profiler shows a real-time graph of your app's memory broken into categories: Java/Kotlin heap, native heap, graphics, stack, code, and "other." The Java heap number is the one most relevant for leak hunting. If you see it grow steadily as you navigate through screens without dropping back down after GC, something is leaking.

To capture a **heap dump**, click the camera icon while your app is running. The dump shows every live object grouped by class — sort by **Retained Size** to find the biggest offenders. If you see multiple instances of the same `Activity` class when only one should exist, you've found your leak. **Allocation tracking** lets you record a window of time and see every object allocated, which helps find excessive allocation patterns that cause GC pressure even without outright leaks.

## Real-World Leak Patterns

In production, leaks rarely announce themselves clearly. Here's my systematic approach to finding them.

**The navigation loop test**: pick your app's most common user flow — the one that involves creating and destroying `Activity` or `Fragment` instances. Navigate through it 10 times. Open the Memory Profiler, force a GC, take a heap dump. Count instances of your `Activity` classes. If you see 10 instances of `HomeActivity` when there should be 1, you've got a leak. This single test catches probably 80% of real-world leaks.

**The configuration change test**: rotate the device 5-6 times on each major screen. Same process — force GC, heap dump, count `Activity` instances. This catches `ViewModel`-to-`View` leaks, `Handler` leaks, and any callback that isn't cleaned up in `onDestroy`.

**The background/foreground test**: press Home, wait 30 seconds, come back. Repeat several times. This catches leaks from services, broadcast receivers, and location listeners that aren't unregistered properly.

One pattern I've seen in production: a third-party analytics SDK registering an `ActivityLifecycleCallbacks` that held strong references internally. The leak wasn't in our code — it was in the SDK. LeakCanary's trace showed it clearly, and the fix was upgrading the SDK version.

## The Reframe: Leaks Are Lifecycle Mismatches

Here's how I think about memory leaks now: **every memory leak is a lifecycle mismatch — something short-lived is referenced by something long-lived.** `Activity` (short) referenced by a static field (long). `Fragment` (short) referenced by a `ViewModel` (longer). `View` (short) referenced by a background thread (potentially indefinite). Once you see leaks this way, preventing them becomes a design question rather than a debugging question.

The practical rule I follow: when any object takes a reference to another object, ask "which one will be destroyed first?" If the reference holder outlives the referenced object, you either need to clear the reference at the right lifecycle moment or restructure so the lifetimes match. Coroutine scopes tied to lifecycle, `WeakReference` for observer registries, `Flow` collection that stops automatically — these align reference lifetimes with component lifetimes. Use them by default, not as fixes after a leak is found.

The tradeoff is vigilance. Unlike Rust, which enforces lifetime correctness at compile time, Kotlin and the JVM give you no compile-time guarantees about reference lifetimes. You're responsible for matching them correctly, and the only feedback is a LeakCanary notification or an `OutOfMemoryError` in production. Keep LeakCanary enabled in every debug build, run through your app's navigation flows regularly, and treat every leak notification as a P1 bug. Memory leaks compound — one leaked `Activity` is 30 MB. Four navigation cycles later, that's 120 MB your app shouldn't be using, and the OOM crash is inevitable.

Thank You!
