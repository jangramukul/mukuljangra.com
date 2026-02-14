---
title: Memory Management and Leak Prevention in Android
layout: post
categories: post
tags:
  - Android
  - Performance
  - Kotlin
---

I once spent two days tracking down a memory leak in production that caused our app to crash on devices with 2GB RAM. The OOM report was useless — just a `java.lang.OutOfMemoryError` with a stack trace pointing to a Bitmap allocation. The Bitmap wasn't the problem. The problem was a Fragment callback registered in `onCreate` and never unregistered, holding a reference chain that kept three Fragments, two Activities, and about 40MB of Bitmap data alive in memory. The GC couldn't touch any of it because there was one strong reference at the root of the chain — a static singleton holding a listener.

That experience taught me something that I think every Android developer needs to internalize early: **the garbage collector is not your safety net. It's a system with specific rules about what it can and can't reclaim, and if you don't understand those rules, you will create leaks.** Memory management on Android isn't about calling `System.gc()` or hoping the runtime figures it out. It's about understanding how ART's GC works, how reference types control reachability, and how the most common leak patterns emerge from Android's lifecycle model.

## How ART's Garbage Collector Actually Works

Android's runtime (ART) uses a generational, concurrent garbage collector. But what does that actually mean in practice? The heap is divided into regions based on object age and size. The key spaces are:

**Young generation (nursery space):** Newly allocated objects land here. This region is small and collected frequently. The collector uses a semi-space copying algorithm — it copies live objects to the other half of the space and reclaims the dead ones in bulk. This is fast because most young objects die quickly (the "generational hypothesis"), so only a small fraction needs copying. Young generation GC pauses are typically under 2ms on modern devices.

**Old generation (main space):** Objects that survive several young GC cycles get promoted here. This space is collected less frequently using a concurrent mark-sweep algorithm. The collector runs in the background, marking reachable objects while your app threads continue running, then sweeping dead objects. The concurrent design means old-gen collections don't freeze your UI — but they do compete for CPU time, which can cause subtle frame timing jank on lower-end devices.

**Large object space:** Objects larger than 12KB (primarily Bitmaps and large arrays) go directly here, bypassing the young generation. These are collected with the old generation. This is why large Bitmap leaks are especially painful — they never get the benefit of fast nursery collection.

Here's what most developers miss: **GC doesn't know what you want to keep. It only knows what's reachable.** The collector starts from GC roots — static fields, thread stacks, JNI references, and a few runtime-internal roots — and traces every reference chain. If an object is reachable from any GC root through any chain of strong references, it will never be collected, no matter how long it's been unused. A memory leak is simply an object that remains reachable when you intended it to become unreachable.

## The Four Reference Types

Java and Kotlin provide four reference types that give you control over how the GC treats your objects. Understanding these isn't academic — they're practical tools for cache management and leak prevention.

**Strong reference** is the default. Any regular variable or field holding an object creates a strong reference. As long as a strong reference exists in a reachable chain from a GC root, the object lives. Period.

**WeakReference** tells the GC: "collect this object whenever you need to, even if I still have a reference to it." The referent can be collected at any GC cycle, and `weakRef.get()` returns `null` once it's collected. Use WeakReference when you need to observe an object but don't want to prevent its collection — like holding a reference to an Activity from a background task.

```kotlin
class LocationTracker(activity: Activity) {
    // BAD: strong reference to Activity — classic leak if LocationTracker lives longer
    // private val activityRef = activity

    // GOOD: WeakReference lets Activity be collected when destroyed
    private val activityRef = WeakReference(activity)

    fun onLocationUpdated(location: Location) {
        val activity = activityRef.get() ?: return  // Activity already collected
        activity.updateLocationUI(location)
    }
}
```

**SoftReference** is similar to WeakReference but with a critical difference: the GC only collects soft-referenced objects when it's running low on memory. This makes SoftReference ideal for memory-sensitive caches. The object stays alive as long as there's enough heap space, and gets collected under memory pressure.

```kotlin
class BitmapMemoryCache {
    private val cache = mutableMapOf<String, SoftReference<Bitmap>>()

    fun get(key: String): Bitmap? = cache[key]?.get()

    fun put(key: String, bitmap: Bitmap) {
        cache[key] = SoftReference(bitmap)
    }
}
```

But here's the real-world nuance: **on Android, SoftReferences are often collected more aggressively than you'd expect.** ART's GC considers the heap size target (which varies by device RAM) and starts collecting SoftReferences well before an actual OOM. On a 2GB RAM device, I've seen SoftReference caches get cleared when the app was only using 150MB. For image caching, this means your SoftReference cache becomes a cache with unpredictable eviction, which is why libraries like Coil and Glide use LRU caches with fixed size limits instead of relying on SoftReference behavior.

**PhantomReference** is the rarest — you get notified when the object has been finalized but before its memory is reclaimed. Almost no one uses these directly. They're used internally by the runtime for cleanup of native resources.

## The Five Classic Leak Patterns

After dealing with memory leaks across several production apps, I've found that almost every Android memory leak falls into one of five patterns. Understanding these patterns means you can spot leaks in code review before they ever reach production.

**Pattern 1: Static reference to a Context.** This is the most common and most dangerous. Any static field (companion object property, singleton field) that holds an Activity, Fragment, or View reference prevents the entire component — and all its associated Bitmaps, adapters, and child views — from being collected.

```kotlin
// LEAK: Singleton holds Activity reference forever
object EventBus {
    private val listeners = mutableListOf<OnEventListener>()

    fun register(listener: OnEventListener) {
        listeners.add(listener)
    }

    // Forgot to call unregister — Activity/Fragment implementing
    // OnEventListener stays in memory permanently
}
```

The fix is always one of: use `applicationContext` instead of Activity context, use WeakReference, or implement proper unregistration in `onDestroy`.

**Pattern 2: Non-static inner classes.** In Kotlin, inner classes (declared without the `inner` keyword in some cases, but always with it in others) hold an implicit reference to their outer class. If the inner class instance outlives the outer class, the outer class leaks. The classic Android example is an anonymous `Handler` or `Runnable` inside an Activity.

```kotlin
class OrderActivity : AppCompatActivity() {
    // LEAK: anonymous Runnable holds implicit reference to OrderActivity
    private val delayedCheck = Runnable {
        checkOrderStatus()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handler.postDelayed(delayedCheck, 30_000) // 30-second delay
    }
    // If user navigates away before 30s, Activity can't be collected
    // because the Handler's MessageQueue holds the Runnable which holds the Activity
}
```

The fix is to remove callbacks in `onDestroy`, or better yet, use coroutines with `lifecycleScope` which automatically cancels when the lifecycle is destroyed.

```kotlin
class OrderActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            delay(30_000)
            checkOrderStatus() // Automatically cancelled if Activity is destroyed
        }
    }
}
```

**Pattern 3: Unclosed resources.** Streams, cursors, database connections, and TypedArrays that aren't closed keep their underlying native resources (and sometimes their source objects) alive. Kotlin's `.use { }` extension function solves this cleanly for `Closeable` types, but I still see production code that opens a `Cursor` in one method and closes it in another — with an early return path between them that skips the close.

```kotlin
// BAD: cursor leaks if exception is thrown before close()
fun loadUserNames(db: SQLiteDatabase): List<String> {
    val cursor = db.query("users", arrayOf("name"), null, null, null, null, null)
    val names = mutableListOf<String>()
    while (cursor.moveToNext()) {
        names.add(cursor.getString(0))
    }
    cursor.close()
    return names
}

// GOOD: .use guarantees closure
fun loadUserNames(db: SQLiteDatabase): List<String> {
    return db.query("users", arrayOf("name"), null, null, null, null, null).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(cursor.getString(0))
            }
        }
    }
}
```

**Pattern 4: ViewModel holding View references.** ViewModel survives configuration changes — that's its purpose. But if your ViewModel holds a reference to a View, Fragment, or Activity context, it prevents the destroyed instance from being collected while keeping a reference to a stale, detached View that can cause crashes if you try to use it.

```kotlin
// LEAK: ViewModel outlives the Activity — View reference becomes a leak
class DashboardViewModel : ViewModel() {
    // Never hold View, Fragment, or Activity references in ViewModel
    var recyclerView: RecyclerView? = null  // This is always wrong
}
```

If you need Context in a ViewModel, use `AndroidViewModel` which holds `Application` context (not Activity context), or better, inject the specific dependency you actually need (like a string resource provider or a repository) rather than the entire Context.

**Pattern 5: Coroutine scope leaks.** Using `GlobalScope` or creating a `CoroutineScope` without tying it to a lifecycle means coroutines can run indefinitely, holding references to captured variables in their closures. This is the modern equivalent of the old `AsyncTask` leak.

```kotlin
// LEAK: GlobalScope coroutine captures 'this' (Activity) and runs indefinitely
class AnalyticsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        GlobalScope.launch {
            while (true) {
                delay(60_000)
                trackEngagement(this@AnalyticsActivity) // Activity leaks
            }
        }
    }
}
```

Use `lifecycleScope` for Activity/Fragment work and `viewModelScope` for ViewModel work. Both are cancelled automatically when their owner is destroyed.

## Profiling with Memory Profiler

Android Studio's Memory Profiler is the primary tool for detecting leaks in development. But most people use it wrong — they open it, see the graph going up, and panic. Here's the systematic approach I use.

**Step 1: Establish a baseline.** Open the app, navigate to the screen you're testing, and force a GC by clicking the garbage can icon in the profiler. Note the heap size. This is your baseline.

**Step 2: Trigger the suspected leak.** Perform the action you think causes a leak — usually navigating to a screen and back, or rotating the device several times. Repeat the action 5-10 times to make leaks obvious through accumulation.

**Step 3: Force GC and capture a heap dump.** After repeating the action, force GC again and capture a heap dump. If your heap baseline has grown significantly (and stays grown after GC), you have a leak.

**Step 4: Analyze the heap dump.** In the heap dump, sort by **Retained Size** to find the biggest offenders. Look for multiple instances of Activities or Fragments that should only have one instance alive. If you see three instances of `OrderActivity` after navigating to it and back three times, all three are leaked. Click on an instance and trace its reference chain to find the GC root that's keeping it alive. The reference chain is the diagnostic — it tells you exactly which field in which class is preventing collection.

I want to be honest about the limitations here. The Memory Profiler works well for debug builds, but **debug builds allocate differently than release builds.** Debug builds disable R8 optimizations, add debugging metadata, and run code in a way that can create allocation patterns you won't see in production. Always verify suspected issues by also testing on a release build with LeakCanary.

## LeakCanary in Production

LeakCanary is the gold standard for automated leak detection. In development, it watches for Activity and Fragment instances that should have been collected, forces GC, and if they're still alive, dumps the heap and analyzes the reference chain. But the part that changed how our team handles leaks is **LeakCanary's production variant.**

With `leakcanary-android-release`, you can detect leaks in production without the full heap dump overhead. It uses a much lighter analysis that checks for known leak patterns and reports them to your crash reporting system. We integrated it with our analytics pipeline and discovered that 15% of our OOM crashes were caused by a single leak — a `DialogFragment` callback that held a reference to its parent Fragment after dismissal. The fix was three lines of code (nulling the callback in `onDismiss`), and OOM crashes dropped by 12% in the next release.

The pattern I recommend is: run full LeakCanary in debug builds during development, run the release variant in production with sampling (we sample 5% of sessions), and treat leak reports from production with the same priority as crash reports. A memory leak that doesn't crash immediately will eventually crash under pressure — on a low-RAM device, during multitasking, or after the user has been in the app for an extended session.

## What the GC Tells You About Your Architecture

Here's the reframe that changed my perspective on memory management: **memory leaks are architecture feedback.** Every leak I've debugged points to a structural problem — a component that doesn't have clear lifecycle boundaries, a dependency that flows in the wrong direction, or a responsibility that belongs somewhere else.

When a ViewModel holds a View reference, the architecture is wrong — the ViewModel shouldn't know about Views. When a singleton holds a listener that captures an Activity, the event system's lifecycle isn't aligned with the component lifecycle. When a coroutine in GlobalScope captures a Fragment, the concurrency model isn't tied to the navigation model. The GC is doing exactly what it's designed to do. It can't collect objects that are reachable. If something is reachable that shouldn't be, your component boundaries are leaking, and the memory leak is just the symptom.

This perspective made me much better at preventing leaks during design rather than hunting them in profiling. When I design a component now, I ask: "what holds a reference to this, and will that reference holder outlive this component?" If the answer is yes or maybe, I know I need a WeakReference, a lifecycle-aware registration, or a different dependency direction. The GC doesn't forgive unclear ownership, and that discipline produces better architecture.

Thanks for reading through all of this :), Happy Coding!
