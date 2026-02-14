---
title: Android Memory Leaks Guide
layout: post
categories: post
tags:
  - Android
  - Performance
  - Best Practices
---

About two years ago, I got a bug report that our app was crashing with `OutOfMemoryError` after extended use. Not immediately — users had to navigate between screens for several minutes before it happened. The crash logs pointed to bitmap allocations, which was misleading. The real problem was far more subtle: a background task held a reference to a destroyed `Activity`, which held references to its entire view hierarchy, which held references to decoded bitmaps. One leaked `Activity` was keeping around 30-40 MB of memory that should have been freed. After three or four navigation cycles, the heap was exhausted.

That experience taught me something important: **memory leaks in Android are almost never about allocating too much memory — they're about holding memory too long.** The garbage collector knows how to free unreferenced objects. The problem is when your code creates references that survive longer than the lifecycle of the component they point to. An `Activity` that should be garbage collected after `onDestroy` stays alive because something — a static field, a callback, an inner class — still holds a reference to it. And because an `Activity` holds its entire view tree, one leaked reference can keep megabytes in memory.

## How the GC Decides What to Keep

To understand memory leaks, you need to understand how Android's garbage collector determines what's alive. The GC starts from a set of "roots" — static fields, thread-local variables, active thread stacks, and JNI references — and walks every reference chain from those roots. Any object reachable from a root is considered alive and won't be collected. Anything unreachable is garbage.

A memory leak happens when an object that should be unreachable — like a destroyed `Activity` — is still reachable from a GC root through some reference chain. The object isn't technically "leaked" in the C sense (there's no dangling pointer). It's just kept alive longer than it should be. The GC is doing its job perfectly — it's your code that created a reference path that shouldn't exist.

This is why memory leaks in Android are lifecycle problems. The Android framework creates and destroys `Activity`, `Fragment`, and `View` objects based on user navigation and configuration changes. Your code needs to release references to these objects at the right lifecycle moment. Every memory leak I've ever debugged boils down to one thing: a reference that outlives the lifecycle of the thing it points to.

## The Common Culprits

### Static References

The most obvious leak: storing an `Activity` or `Context` in a `static` (or Kotlin `companion object`) field. Static fields are GC roots — they live for the entire process lifetime. If a static field holds a reference to an `Activity`, that `Activity` can never be garbage collected.

```kotlin
class ImageCache {
    companion object {
        // LEAK: This holds the Activity's context forever
        private lateinit var context: Context

        fun init(context: Context) {
            this.context = context // if called with Activity context, it leaks
        }
    }
}
```

The fix is always `applicationContext`. The `Application` object lives as long as the process, so holding a reference to it doesn't create a lifecycle mismatch. But I've seen a subtler variant: storing a `View` in a static field. Views hold a reference to their parent `Context` (which is usually the `Activity`), so even if you think you're just caching a `View`, you're actually keeping the entire `Activity` alive.

### Non-Static Inner Classes

In Java and Kotlin, non-static inner classes hold an implicit reference to their enclosing class. This is the source of an enormous number of Android memory leaks, and it's easy to miss because the reference is invisible in the source code.

```kotlin
class OrderHistoryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // LEAK: This Runnable is a non-static inner class.
        // It holds an implicit reference to OrderHistoryActivity.
        val refreshTask = object : Runnable {
            override fun run() {
                loadOrders() // accesses Activity method
                handler.postDelayed(this, 30_000)
            }
        }
        handler.post(refreshTask)
    }

    // If the user navigates away, the Activity is destroyed,
    // but the Handler still holds the Runnable, which holds the Activity.
    // The Activity can't be garbage collected until the Runnable finishes.
}
```

The `Runnable` is an anonymous inner class that captures `this` (the `Activity`). It's posted to a `Handler` with a 30-second delay. If the user navigates away during that 30 seconds, the `Activity` is destroyed but the `Handler`'s message queue still holds the `Runnable`, which still holds the `Activity`. That's a 30-second leak. If the `Runnable` re-posts itself (as in the example), it's a permanent leak.

The fix is to remove callbacks in `onDestroy`:

```kotlin
override fun onDestroy() {
    super.onDestroy()
    handler.removeCallbacksAndMessages(null)
}
```

Or better, avoid `Handler` entirely and use coroutines with a lifecycle-aware scope. `lifecycleScope` automatically cancels when the lifecycle is destroyed, which eliminates this entire class of leaks.

### ViewModel Holding View References

`ViewModel` survives configuration changes — that's its entire purpose. But this means it outlives the `Activity` or `Fragment` that created it. If a `ViewModel` holds a reference to a `View`, `Context`, or `Activity`, that reference survives the configuration change and keeps the old (destroyed) `Activity` alive.

```kotlin
class CheckoutViewModel : ViewModel() {
    // LEAK: ViewModel survives config changes, View doesn't
    var submitButton: Button? = null

    // LEAK: Context is tied to the Activity lifecycle
    lateinit var context: Context
}
```

I've seen this pattern in codebases where developers pass `View` references to the `ViewModel` to update UI directly. It's a fundamental misunderstanding of the architecture boundary. The `ViewModel` should expose state (via `StateFlow`, `LiveData`, or Compose state), and the UI layer should observe it. The `ViewModel` should never hold references to anything in the view layer. If you need a `Context` in the `ViewModel`, use `AndroidViewModel` which provides the `Application` context — though I'd argue even that is a code smell, and you should inject the dependency you actually need instead of the whole `Context`.

### Unregistered Listeners and Callbacks

Registering a listener and forgetting to unregister it is a classic leak source. `BroadcastReceiver`, `ContentObserver`, `LocationListener`, `SensorEventListener` — all of these hold a reference to the callback object, which typically holds a reference to the `Activity` or `Fragment`.

```kotlin
class LocationTrackingActivity : AppCompatActivity() {

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            // This callback holds a reference to the Activity
            updateMapPosition(result.lastLocation)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        fusedLocationClient.requestLocationUpdates(
            locationRequest, locationCallback, Looper.getMainLooper()
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }
}
```

The pattern is always the same: register in `onCreate` (or `onStart`), unregister in the corresponding `onDestroy` (or `onStop`). Miss the unregister call and the system service keeps your callback alive, which keeps your `Activity` alive. With coroutines and `Flow`, you can often replace callback-based APIs with `callbackFlow`, which ties the callback lifecycle to the coroutine scope automatically.

## Detecting Leaks With LeakCanary

LeakCanary is, in my opinion, the single most valuable debugging tool for Android development. It automatically detects memory leaks during development by watching for objects that should have been garbage collected but weren't.

Here's how it works under the hood: when an `Activity` or `Fragment` is destroyed, LeakCanary creates a `WeakReference` to it and adds the reference key to a set of "watched" objects. After a short delay (5 seconds by default), it checks whether the `WeakReference` has been cleared. If it has, the object was garbage collected — no leak. If it hasn't, LeakCanary triggers a heap dump, analyzes the `.hprof` file to find the shortest reference chain from a GC root to the leaked object, and shows you exactly what's keeping it alive.

The analysis is the genuinely brilliant part. LeakCanary doesn't just say "your Activity leaked." It shows you the full reference chain: `Thread → Handler → Message → Runnable → Activity`. You can read the chain from top to bottom and immediately see which reference needs to be broken. Before LeakCanary, debugging memory leaks meant manually analyzing heap dumps in Android Studio's profiler — a tedious process that required expertise in reading dominator trees and reference graphs. LeakCanary automates 90% of that work.

Setting it up is a single dependency:

```kotlin
// build.gradle.kts
dependencies {
    debugImplementation("com.squareup.leakcanary:leakcanary-android:2.14")
}
```

No code changes needed. It hooks into `Application.ActivityLifecycleCallbacks` automatically in debug builds and watches every `Activity` and `Fragment` for leaks. The `debugImplementation` scope ensures it's stripped from release builds entirely, so there's zero overhead in production.

One thing I'd recommend: enable LeakCanary's `ObjectWatcher` for your own objects too. If you have a custom scope — say, a dependency injection scope tied to a user session — you can tell LeakCanary to watch it:

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

## The Reframe: Leaks Are Lifecycle Mismatches

Here's how I think about memory leaks now: **every memory leak is a lifecycle mismatch — something short-lived is referenced by something long-lived.** `Activity` (short) referenced by a static field (long). `Fragment` (short) referenced by a `ViewModel` (longer). `View` (short) referenced by a background thread (potentially indefinite). Once you see leaks this way, preventing them becomes a design question rather than a debugging question.

The practical rule I follow: when any object takes a reference to another object, ask "which one will be destroyed first?" If the reference holder outlives the referenced object, you either need to clear the reference at the right lifecycle moment or restructure the relationship so the lifetimes match. Coroutine scopes tied to lifecycle, `WeakReference` for caches, `Flow` collection that automatically stops — these are all tools that align reference lifetimes with component lifetimes. Use them by default, not as fixes after a leak is found.

The tradeoff is vigilance. Unlike Rust, which enforces lifetime correctness at compile time, Kotlin and the JVM give you no compile-time guarantees about reference lifetimes. You're responsible for matching them correctly, and the only feedback is a LeakCanary notification or an `OutOfMemoryError` in production. Keep LeakCanary enabled in every debug build, run through your app's navigation flows regularly, and treat every leak notification as a P1 bug. Memory leaks compound — one leaked `Activity` is 30 MB. Four navigation cycles later, that's 120 MB your app shouldn't be using, and the OOM crash is inevitable.

Thank You!
