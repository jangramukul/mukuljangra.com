---
title: Memory Management and Leak Prevention in Android
layout: post
categories: post
tags:
  - Android
  - Performance
  - Kotlin
---

I once spent two days tracking down a memory leak in production that caused our app to crash on devices with 2GB RAM. Two full days. The OOM report was useless — just a `java.lang.OutOfMemoryError` with a stack trace pointing to a Bitmap allocation. Naturally, I assumed the Bitmap was the problem. It wasn't. The actual culprit was a Fragment callback registered in `onCreate` and never unregistered, holding a reference chain that kept three Fragments, two Activities, and about 40MB of Bitmap data alive in memory. The GC couldn't touch any of it because there was one strong reference at the root of the chain — a static singleton holding a listener.

That experience taught me something I think every Android developer needs to internalize early: **the garbage collector is not your safety net.** Think of the GC like a janitor with a strict rulebook. It only cleans up rooms that nobody has a key to. If even one person is still holding a key — even by accident, even if they forgot they had it — the janitor walks right past that room. It doesn't matter that the room is full of garbage. The key exists, so the room stays. The GC has specific rules about what it can and can't reclaim, and if you don't understand those rules, you will create leaks. But memory management on Android goes beyond just the GC — it extends to how you cache data, how you respond to system memory pressure, and how the OS itself decides which processes to kill when things get tight.

## How ART's Garbage Collector Actually Works

Android's runtime (ART) uses a generational, concurrent garbage collector. The heap is divided into regions based on object age and size, and once you understand these regions, a lot of confusing leak behavior starts making perfect sense.

**Young generation (nursery space):** This is the "front door" of memory. Every newly allocated object lands here first. Think of it like a probation period — most objects are short-lived (a temporary string here, a quick calculation result there), so ART collects this region frequently using a semi-space copying algorithm. It copies the survivors to the other half and wipes the rest in bulk. This is called the "generational hypothesis" — the bet that most objects die young. And it's a good bet. Pauses are typically under 2ms, so your UI barely notices.

**Old generation (main space):** Objects that survive several young GC cycles earn their way here — they're the "tenured employees" of your heap. This space is collected less frequently using a concurrent mark-sweep algorithm. The key word is *concurrent* — ART marks reachable objects while your app threads continue running, then sweeps the dead ones. Old-gen collections don't freeze your UI, but they compete for CPU time, which can cause subtle jank on lower-end devices.

**Large object space:** Objects larger than 12KB — primarily Bitmaps and large arrays — skip the young generation entirely and go straight here. They're collected alongside the old generation, which is why large Bitmap leaks are especially painful. Your 5MB hero image doesn't get the fast young-gen cleanup. It sits in the large object space until a full collection cycle runs.

Here's what most developers miss: **GC doesn't know what you *want* to keep. It only knows what's *reachable*.** The collector starts from GC roots — static fields, thread stacks, JNI references — and traces every reference chain outward, like following a web of strings. If an object is reachable from any root through strong references, it will never be collected. A memory leak, then, is simply an object that remains reachable when you intended it to become unreachable. The GC isn't broken. You just accidentally left a string attached.

> **🧠 Think about it:** If GC can only collect what's unreachable, and a static singleton holds a listener that holds a Fragment... when does that Fragment's memory get freed? (Spoiler: it doesn't.)

## The Four Reference Types

Java and Kotlin provide four reference types that give you control over how the GC treats your objects. These aren't some academic curiosity you'll never use — they're practical tools for cache management and leak prevention. Think of them as different strengths of grip on an object.

**Strong reference** is the default — the death grip. Any regular variable or field holding an object creates a strong reference. As long as a strong reference exists in a reachable chain from a GC root, the object lives. Period. No negotiation.

**WeakReference** is more like a polite suggestion. It tells the GC: "I'm interested in this object, but don't keep it alive on my account." The referent can be collected at any GC cycle, and `weakRef.get()` returns `null` once it's gone. Use WeakReference when you need to observe an object but don't want to prevent its collection — like holding a reference to an Activity from a background task.

```kotlin
class LocationTracker(activity: Activity) {
    // BAD: strong reference to Activity — classic leak if LocationTracker lives longer
    // private val activityRef = activity

    // GOOD: WeakReference lets Activity be collected when destroyed
    private val activityRef = WeakReference(activity)

    fun onLocationUpdated(location: Location) {
        val activity = activityRef.get() ?: return
        activity.updateLocationUI(location)
    }
}
```

See the `?: return` on `get()`? That's the contract with WeakReference — you always have to check if your object is still around. It might have been collected between the last time you looked and now.

**SoftReference** is the tricky one. It's similar to WeakReference but with a critical difference: the GC only collects soft-referenced objects when it's running low on memory. Sounds perfect for caches, right? The object stays alive as long as there's enough heap space, and gets cleaned up under pressure.

But here's the real-world nuance: **on Android, SoftReferences are often collected more aggressively than you'd expect.** ART's GC considers the heap size target (which varies by device RAM) and starts collecting SoftReferences well before an actual OOM. On a 2GB RAM device, I've seen SoftReference caches get cleared when the app was only using 150MB. That's barely scratching the surface of available memory, and the cache is already gone. This unpredictable eviction is why libraries like Coil and Glide use `LruCache` with fixed size limits instead. They learned this lesson the hard way so you don't have to.

**PhantomReference** is the rarest — you get notified when the object has been finalized but before its memory is reclaimed. Almost no one uses these directly. They're used internally by the runtime for cleanup of native resources. If you find yourself reaching for PhantomReference in app code, you're probably solving the wrong problem.

## LruCache for In-Memory Caching

So if SoftReferences are unreliable on Android, what do you use instead? The platform gives you `android.util.LruCache` — and I think of it as a bouncer at a nightclub. The club has a strict capacity. When a new guest arrives and the place is full, the bouncer kicks out whoever has been standing in the corner the longest without talking to anyone (the least-recently-used entry). Everyone who stays is a VIP with a strong reference — no GC is touching them.

An LruCache keeps a fixed number of strong references, evicting the least-recently-used entry when the cache exceeds its size limit. The key design decision is how to size it.

The standard approach is to use a fraction of the available heap. `Runtime.getRuntime().maxMemory()` gives you the total heap your app can use — typically 256MB on modern devices, but as low as 64MB on older ones. I usually allocate 1/8th of that for a primary cache, though the right fraction depends on how central caching is to your app's experience. A photo gallery app might go up to 1/4, while an app that just caches a few parsed API responses can get away with 1/16.

The real power of `LruCache` comes from the `entryRemoved` callback. It fires whenever an entry is evicted, explicitly removed, or replaced — giving you a hook to recycle resources, log cache misses, or persist evicted data to disk as a secondary cache layer. It's like the bouncer handing the ejected guest a flyer for the bar next door.

```kotlin
class ParsedDataCache(context: Context) {
    private val maxMemory = Runtime.getRuntime().maxMemory() / 1024
    private val cacheSize = (maxMemory / 8).toInt()

    private val cache = object : LruCache<String, ParsedArticle>(cacheSize) {
        override fun sizeOf(key: String, article: ParsedArticle): Int {
            // Size in KB — must match the unit used for cacheSize
            return article.estimatedSizeKb
        }

        override fun entryRemoved(
            evicted: Boolean,
            key: String,
            oldValue: ParsedArticle,
            newValue: ParsedArticle?
        ) {
            if (evicted) {
                // Entry was evicted due to size limit, not replaced
                // Optionally persist to disk cache as a fallback
                diskCache.put(key, oldValue)
            }
        }
    }

    fun get(key: String): ParsedArticle? = cache.get(key)
    fun put(key: String, article: ParsedArticle) = cache.put(key, article)
}
```

> **🔥 Real talk:** `sizeOf` must return a consistent unit. If your `cacheSize` is in kilobytes, `sizeOf` must return kilobytes. I've debugged cache issues twice where someone used bytes for `sizeOf` but KB for the max size, giving the cache effectively 1000x more capacity than intended. The cache "worked" in testing but ate 200MB of heap in production. Two different teams, same exact mistake.

## Responding to Memory Pressure with onTrimMemory

Even with proper caching, your app needs to cooperate with the system when memory gets tight. Think of it this way — Android is like a landlord managing apartments in a building. When the building is running out of space, the landlord starts knocking on doors asking tenants to clean up. If you cooperate, you get to stay. If you ignore the knocks, you get evicted.

Android communicates this "knocking" through `ComponentCallbacks2.onTrimMemory()`, and the different trim levels tell you exactly how urgent the situation is.

The levels that matter most fall into two categories. When your app is running in the foreground, you'll see `TRIM_MEMORY_RUNNING_MODERATE`, `TRIM_MEMORY_RUNNING_LOW`, and `TRIM_MEMORY_RUNNING_CRITICAL` — each one more urgent than the last. At `RUNNING_LOW`, I start clearing non-essential caches like parsed data or precomputed layouts. At `RUNNING_CRITICAL`, the system is about to start killing background processes to free memory, so you should release everything you can rebuild — image caches, pooled objects, any preloaded data.

The second category is `TRIM_MEMORY_UI_HIDDEN`, which fires when your app moves to the background. This is your cue to release UI resources like cached Bitmaps or View references that only matter when the user is looking at the screen. Nobody's looking at your UI right now — why are you holding onto those thumbnails?

```kotlin
class ArticleReaderApp : Application(), ComponentCallbacks2 {
    lateinit var articleCache: ParsedDataCache
    lateinit var thumbnailCache: LruCache<String, Bitmap>

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        when {
            level >= TRIM_MEMORY_RUNNING_CRITICAL -> {
                // System will start killing processes soon
                articleCache.evictAll()
                thumbnailCache.evictAll()
            }
            level >= TRIM_MEMORY_RUNNING_LOW -> {
                // Free non-essential caches
                articleCache.trimToSize(articleCache.maxSize() / 2)
            }
            level >= TRIM_MEMORY_UI_HIDDEN -> {
                // App backgrounded — release UI-only resources
                thumbnailCache.evictAll()
            }
        }
    }
}
```

I've seen teams ignore `onTrimMemory` entirely and wonder why their app gets killed in the background more often than competitors. Here's the thing — the system tracks which apps cooperate with trim requests. Apps that release memory when asked are more likely to survive in the background, which means faster warm starts and a better user experience. Apps that hoard memory get killed first. It's that simple.

## The Low Memory Killer

Now here's where it gets interesting. Everything we've talked about so far — GC, references, caches, trim callbacks — all of that happens *inside* your process. The Low Memory Killer operates entirely outside it. When the system runs low on RAM and needs to reclaim memory, it doesn't politely ask your GC to clean up. It kills entire processes. Gone. No callback, no warning, no chance to save state.

Understanding how it chooses its victims matters for any app that does background work.

Android's `lmkd` (Low Memory Killer Daemon) assigns every process an `oom_adj_score` based on its importance. Imagine a priority queue where the most expendable processes are at the front. Foreground processes (the Activity the user is interacting with) get the lowest score and are killed last — they're VIPs. Visible processes (like an Activity behind a transparent dialog) are next. Service processes sit in the middle. Cached processes — apps the user has navigated away from — have the highest score and are killed first. And within each bucket, the process using the most memory dies first.

The practical implication is straightforward: **your app's process priority directly determines how long it survives in the background.** If your app uses 300MB of cached memory and another cached app uses 80MB, yours gets killed first when the system needs RAM. This is where `onTrimMemory` connects back — releasing memory when backgrounded lowers your footprint, making you less of a target. It's also why a foreground Service keeps your process alive during background work — it moves you from the "cached" bucket to the "service" bucket, which has a much lower `oom_adj_score`.

> **💡 The "aha" moment:** You're not just competing with your own heap limit — you're competing with *every other app on the device* for physical RAM. An app that leaks 50MB might never OOM, but it will get killed in the background more aggressively, lose its saved state more often, and deliver a worse experience on low-RAM devices. Memory discipline isn't about avoiding crashes. It's about survival.

## The Five Classic Leak Patterns

After dealing with memory leaks across several production apps, I've found that almost every Android memory leak falls into one of five patterns. Once you learn these, you start spotting leaks in code review before they ever reach production. It's like learning to see the Matrix — suddenly the patterns are everywhere.

**Pattern 1: Static reference to a Context.** This is the most common and most dangerous. Any static field (companion object property, singleton field) that holds an Activity, Fragment, or View reference prevents the entire component — and all its associated Bitmaps, adapters, and child views — from being collected. It's like nailing a piece of furniture to the floor and then wondering why you can't move it out of the room.

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

**Pattern 2: Non-static inner classes.** In Kotlin, inner classes hold an implicit reference to their outer class. If the inner class instance outlives the outer class, the outer class leaks. The classic example is an anonymous `Handler` or `Runnable` inside an Activity. Can you spot the problem here?

```kotlin
class OrderActivity : AppCompatActivity() {
    // LEAK: anonymous Runnable holds implicit reference to OrderActivity
    private val delayedCheck = Runnable {
        checkOrderStatus()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handler.postDelayed(delayedCheck, 30_000)
    }
    // If user navigates away before 30s, Activity can't be collected
    // because the Handler's MessageQueue holds the Runnable
}
```

That lambda captures `this` (the Activity) because it calls `checkOrderStatus()`. The Handler's MessageQueue holds the Runnable for 30 seconds. If the user navigates away before the timer fires, the Activity is destroyed but can't be collected — the MessageQueue is still gripping that Runnable, which is still gripping the Activity.

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

Much cleaner. No manual cleanup, no forgotten unregistration. The lifecycle owns the coroutine, and when the lifecycle ends, the coroutine dies with it.

**Pattern 3: Unclosed resources.** Streams, cursors, database connections, and TypedArrays that aren't closed keep their underlying native resources alive. Kotlin's `.use { }` extension function solves this cleanly for `Closeable` types, but I still see production code that opens a `Cursor` in one method and closes it in another — with an early return path between them that skips the close. You know the kind of code I'm talking about. An `if` check on line 12 returns early, and the `cursor.close()` is sitting on line 40, never to be reached.

**Pattern 4: ViewModel holding View references.** ViewModel survives configuration changes — that's its entire purpose. But if your ViewModel holds a reference to a View or Activity context, it prevents the destroyed instance from being collected while keeping a reference to a stale, detached View. Imagine rotating your phone — the old Activity is destroyed and a new one is created, but your ViewModel is still clutching the corpse of the old one. If you need Context in a ViewModel, use `AndroidViewModel` which holds `Application` context, or better, inject the specific dependency you actually need rather than the entire Context.

**Pattern 5: Coroutine scope leaks.** Using `GlobalScope` or creating a `CoroutineScope` without tying it to a lifecycle means coroutines can run indefinitely, holding references to captured variables in their closures. This is the modern equivalent of the old `AsyncTask` leak — same problem, new syntax. Use `lifecycleScope` for Activity/Fragment work and `viewModelScope` for ViewModel work — both are cancelled automatically when their owner is destroyed.

> **⚡ Quick check:** You see a `GlobalScope.launch` inside a Fragment that captures a reference to a RecyclerView adapter. What happens when the user navigates away from that Fragment? (Answer: the Fragment can't be collected because the coroutine's closure holds the adapter, which holds the Fragment's view hierarchy.)

## Profiling and Detecting Leaks

Knowing the patterns is half the battle. Finding them in a running app is the other half.

Android Studio's Memory Profiler is the primary tool for detecting leaks in development. The approach I use is almost mechanical: establish a baseline heap size after a forced GC, trigger the suspected leak by repeating the action 5-10 times (navigate to a screen and back, open a dialog and close it), force GC again, and capture a heap dump. If your heap has grown and stays grown after GC, you have a leak. In the heap dump, sort by **Retained Size** and look for multiple instances of Activities or Fragments that should only have one alive. If you see five instances of `DetailActivity` when only one should exist, something is holding onto the old four. The reference chain tells you exactly which field is preventing collection.

One honest limitation: **debug builds allocate differently than release builds.** Debug builds disable R8 optimizations and add metadata that creates allocation patterns you won't see in production. So your leak might not reproduce in debug, or worse, a debug-only leak might send you on a wild goose chase.

This is where LeakCanary becomes essential — it watches for leaked instances, forces GC, and analyzes reference chains automatically. But the part that changed how our team works is `leakcanary-android-release`, the production variant. We integrated it at 5% sampling and discovered that 15% of our OOM crashes came from a single `DialogFragment` callback leak. The fix was three lines of code, and OOM crashes dropped by 12%. Three lines. Twelve percent. That's the kind of return on investment that makes you wonder what else is hiding in your heap.

## What the GC Tells You About Your Architecture

Here's the reframe that changed my perspective on memory management: **memory leaks are architecture feedback.** Every leak I've debugged points to a structural problem — a component without clear lifecycle boundaries, a dependency flowing in the wrong direction, or a responsibility that belongs somewhere else. The leak is just the symptom. The disease is in your design.

When a ViewModel holds a View reference, the architecture is wrong — the ViewModel shouldn't know about Views. When a singleton holds a listener that captures an Activity, the event system's lifecycle isn't aligned with the component lifecycle. When a coroutine in `GlobalScope` captures a Fragment, the concurrency model isn't tied to the navigation model. In every case, the GC is doing exactly what it's designed to do — it can't collect objects that are reachable. If something is reachable that shouldn't be, your component boundaries are leaking, and the memory leak is just how you found out.

This perspective extends to everything we covered. `LruCache` forces you to think about how much memory a feature actually needs — it puts a budget on your appetite. `onTrimMemory` forces you to define what's essential versus what's rebuildable — it makes you separate the must-haves from the nice-to-haves. And the Low Memory Killer reminds you that your app doesn't exist in isolation — it shares a device with dozens of other apps, all competing for the same physical RAM.

Memory management isn't just about preventing crashes. It's about designing systems with clear ownership, explicit lifecycles, and respect for the constrained environment your code runs in. Get that right, and the GC becomes your ally instead of your adversary.

Thanks for reading through all of this :), Happy Coding!
