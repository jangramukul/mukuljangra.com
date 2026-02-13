---
title: "Memory Management & Performance"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 8
---

## Memory Management & Performance — What Interviewers Really Ask

Performance is where senior candidates get separated from everyone else. Interviewers use this topic to check if you understand what happens beneath your Kotlin code — how memory works on Android, why frames drop, and how to actually find and fix performance problems instead of guessing. Expect questions that start simple ("what's a memory leak?") and quickly go deep into profiling tools, GC internals, and real optimization strategies.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a memory leak in Android, and what are the most common causes?

A memory leak happens when an object that's no longer needed is still held in memory because something keeps a reference to it, preventing the garbage collector from reclaiming it. In Android, the most dangerous leaks involve holding a reference to an Activity or Context after it's destroyed, because Activities hold references to their entire view hierarchy, bitmaps, and resources — that's often several megabytes per leaked Activity.

The most common causes: an inner class (like a `Handler` callback or `Runnable`) that holds an implicit reference to the outer Activity. A static field that references an Activity context. A listener or callback registered on a long-lived object (like a singleton) that's never unregistered. A thread or coroutine that outlives the Activity and captures it in a closure. A `ViewModel` holding a reference to a View or Activity (ViewModel survives configuration changes, but the Activity doesn't).

```kotlin
// Classic leak: anonymous Runnable holds reference to Activity
class LeakyActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val handler = Handler(Looper.getMainLooper())
        // This Runnable is an anonymous inner class that holds
        // an implicit reference to LeakyActivity
        handler.postDelayed({
            updateUI() // 'this' reference to Activity lives for 30 seconds
        }, 30_000)
    }
}

// Fix: use a WeakReference or cancel the callback in onDestroy
class FixedActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val updateRunnable = Runnable { updateUI() }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(updateRunnable)
    }
}
```

#### Q2: How does garbage collection work on Android?

Android uses the ART (Android Runtime) garbage collector, which is a generational, concurrent, moving collector. "Generational" means objects are categorized by age — young objects (just allocated) are in the nursery/young generation, and objects that survive multiple GC cycles get promoted to the old generation. The insight is that most objects are short-lived, so collecting the young generation frequently is efficient. "Concurrent" means the GC runs mostly alongside your app threads, minimizing pause times — ART's concurrent copying collector achieves pause times typically under 1ms. "Moving" means the GC can relocate objects in memory to reduce fragmentation, which improves allocation performance.

The GC considers objects "reachable" if they can be reached from GC roots — local variables on the call stack, static fields, active threads, JNI references, and system class references. Everything that's not reachable from any GC root is eligible for collection. This is why a leaked Activity is specifically a problem — if anything reachable holds a reference to it, the GC can't touch it.

#### Q3: What is LeakCanary and how does it detect memory leaks?

LeakCanary is Square's open-source memory leak detection library. It works by using `WeakReference` and the `ReferenceQueue` mechanism. When an Activity or Fragment is destroyed, LeakCanary creates a `WeakReference` to it and checks if that reference gets enqueued (meaning the GC collected the object). If after a GC cycle the reference is not enqueued, the object wasn't collected — it's leaked.

LeakCanary then triggers a heap dump (`.hprof` file) and analyzes the reference chain from the leaked object back to the GC root. It presents this chain in a notification, showing you exactly which reference is keeping the object alive. In practice, you add it as a `debugImplementation` dependency so it only runs in debug builds.

```kotlin
// build.gradle.kts — that's literally all you need
dependencies {
    debugImplementation("com.squareup.leakcanary:leakcanary-android:2.14")
}
```

The sophisticated part is that LeakCanary knows which objects to watch. It automatically watches Activities, Fragments, Fragment Views, ViewModels, and Services after they're destroyed. You can also watch custom objects by calling `AppWatcher.objectWatcher.expectWeaklyReachable()`.

#### Q4: What is the 16ms frame budget and why does it matter?

Android's display system targets 60 frames per second, which means the system has 16.67ms to complete all work for each frame — measure, layout, draw, and any other work on the main thread. If a frame takes longer than 16ms, it's dropped and the user sees jank (visible stuttering). On modern devices with 90Hz or 120Hz displays, the budget is even tighter — 11ms for 90Hz, 8.3ms for 120Hz.

Each frame goes through three phases in the rendering pipeline: measure/layout (where the view hierarchy computes sizes and positions), draw (where views generate a display list of drawing commands), and the RenderThread composites those commands on the GPU. If your main thread work pushes the first two phases past the frame deadline, the frame misses VSYNC and gets displayed one (or more) frames late. Tools like Android Studio's CPU Profiler and Perfetto's frame timeline visualize exactly where each frame's time is spent.

#### Q5: What is overdraw and how do you detect it?

Overdraw happens when the same pixel is drawn multiple times in a single frame. For example, if you have a background on your Activity, a background on a FrameLayout, and a background on a CardView, that pixel area is drawn three times even though only the topmost layer is visible. Each layer costs GPU time. Minor overdraw (2x) is normal, but excessive overdraw (4x+) on large areas hurts performance, especially on lower-end devices.

You can visualize overdraw by enabling "Debug GPU Overdraw" in Developer Options. It color-codes the screen: no color = no overdraw, blue = 1x overdraw, green = 2x, light red = 3x, dark red = 4x+. The fix is usually removing unnecessary backgrounds. A very common one: removing `android:background` from your Activity theme's window and only setting backgrounds where needed. The `<merge>` tag also helps by eliminating a wrapper layout layer.

#### Q6: How do you handle large bitmaps efficiently on Android?

Large bitmaps are one of the most common causes of `OutOfMemoryError` on Android. A 12-megapixel camera photo (4000x3000) at ARGB_8888 (4 bytes per pixel) takes 48MB of memory — you can crash the app with just 3-4 of those. The key technique is subsampling: load the bitmap at a reduced resolution using `BitmapFactory.Options.inSampleSize`.

```kotlin
fun decodeSampledBitmap(
    resources: Resources,
    resId: Int,
    targetWidth: Int,
    targetHeight: Int
): Bitmap {
    // First, decode bounds only (no memory allocation)
    val options = BitmapFactory.Options().apply {
        inJustDecodeBounds = true
    }
    BitmapFactory.decodeResource(resources, resId, options)

    // Calculate the sample size
    options.inSampleSize = calculateInSampleSize(
        options.outWidth, options.outHeight,
        targetWidth, targetHeight
    )

    // Decode with the sample size
    options.inJustDecodeBounds = false
    return BitmapFactory.decodeResource(resources, resId, options)
}

fun calculateInSampleSize(
    rawWidth: Int, rawHeight: Int,
    targetWidth: Int, targetHeight: Int
): Int {
    var sampleSize = 1
    if (rawHeight > targetHeight || rawWidth > targetWidth) {
        val halfHeight = rawHeight / 2
        val halfWidth = rawWidth / 2
        while (halfHeight / sampleSize >= targetHeight &&
               halfWidth / sampleSize >= targetWidth) {
            sampleSize *= 2
        }
    }
    return sampleSize
}
```

In practice, you almost never write this yourself. Image loading libraries like Coil and Glide handle subsampling, caching (memory + disk), lifecycle awareness, and request cancellation. But interviewers want to know you understand what these libraries are doing for you.

#### Q7: What is LruCache and how does it work?

`LruCache` (Least Recently Used Cache) is a fixed-size cache that evicts the least recently accessed entry when it's full. Android provides `android.util.LruCache` specifically for in-memory caching. You specify a maximum size (usually in bytes for bitmap caching), and when a new entry would exceed the limit, the cache removes the entry that was accessed longest ago.

```kotlin
val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
val cacheSize = maxMemory / 8 // Use 1/8th of available memory

val bitmapCache = object : LruCache<String, Bitmap>(cacheSize) {
    override fun sizeOf(key: String, bitmap: Bitmap): Int {
        // Size in kilobytes
        return bitmap.byteCount / 1024
    }
}

// Usage
bitmapCache.put("profile_photo", bitmap)
val cached: Bitmap? = bitmapCache.get("profile_photo")
```

The common follow-up question is about a two-tier caching strategy: `LruCache` for fast in-memory access plus `DiskLruCache` for persistent disk cache. Image loading libraries implement exactly this — they check memory cache first (instant), then disk cache (fast), then network (slow).

### Deep Dive Questions (Advanced → Expert)

#### Q8: Explain the difference between ART and Dalvik. What was the motivation for the switch?

Dalvik used Just-In-Time (JIT) compilation — bytecode was interpreted at runtime, and hot methods were compiled to native code on the fly. This meant faster install times but slower app startup because the runtime did compilation work each time the app launched. ART, introduced in Android 5.0, switched to Ahead-Of-Time (AOT) compilation — apps were fully compiled to native code during installation. This made apps launch and run faster, but install times and storage usage increased significantly.

Starting with Android 7.0, ART uses a hybrid approach — profile-guided compilation. The app initially runs with an interpreter and JIT compiler (like Dalvik), but ART profiles which methods are "hot." During idle charging, a background daemon AOT-compiles those hot methods. Over time, the app gets faster as more critical paths are compiled. This hybrid approach gives the best of both worlds: fast installs, low initial storage, and optimized performance for the code paths that actually matter.

#### Q9: What are baseline profiles, and how do they improve performance?

Baseline profiles solve the "first run problem." Even with ART's profile-guided compilation, the first several launches of an app are slower because no profile exists yet. Baseline profiles let you ship a pre-built profile with your APK or AAB. This profile tells ART exactly which methods to AOT-compile during installation, so the first launch is as fast as the hundredth.

Google reports that baseline profiles improve code execution speed by about 30% from first launch. They make startup, navigation, and scrolling noticeably smoother. You generate them using the Macrobenchmark library by writing tests that exercise critical user journeys.

```kotlin
// Baseline profile generator using Macrobenchmark
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generateBaselineProfile() {
        rule.collect(packageName = "com.example.app") {
            // Start the app
            pressHome()
            startActivityAndWait()

            // Navigate through critical user journeys
            device.findObject(By.text("Feed")).click()
            device.waitForIdle()

            device.findObject(By.text("Profile")).click()
            device.waitForIdle()
        }
    }
}
```

The generated profile is included in your AAB, and Google Play distributes it with cloud profiles to devices. On devices without Play Store, the profile is bundled in the APK itself.

#### Q10: How do you measure and optimize app startup time?

Android defines three startup types. Cold start is the slowest — the process doesn't exist, so the system creates the process, initializes the Application class, creates the Activity, inflates the layout, and draws the first frame. Warm start is faster — the process exists in memory but the Activity was destroyed, so it skips process creation. Hot start is the fastest — the Activity is still in memory and just needs to come to the foreground.

To measure cold start time, use the `Fully Drawn` reporting API. Call `reportFullyDrawn()` on your Activity when the first meaningful content is visible (not just when `onCreate()` finishes, but when data is actually loaded and displayed). Logcat shows the timing in the `Displayed` log line.

Common startup optimizations: lazy-initialize libraries that aren't needed immediately (using `App Startup` library with deferred initialization), move heavy initialization to background threads, reduce the main `dex` file size so class loading is faster, avoid disk I/O in `Application.onCreate()` and `Activity.onCreate()`, and use a placeholder/splash screen while data loads.

#### Q11: What is ProGuard/R8 and how does it affect performance?

R8 is Google's replacement for ProGuard, and it's the default in Android Gradle Plugin 3.4+. R8 does four things: shrinking (removes unused classes, methods, and fields), optimization (inlines methods, simplifies code, removes dead branches), obfuscation (renames classes and methods to short names like `a`, `b`, `c`), and resource shrinking (when combined with `shrinkResources`). Optimization directly improves runtime performance by reducing method call overhead and simplifying bytecode. Shrinking reduces APK size, which improves download time and cold start time (fewer classes to load). Obfuscation makes reverse engineering harder.

```kotlin
// build.gradle.kts
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}
```

The challenge is ProGuard/R8 rules. R8 uses static analysis to determine what's used, but it can't see into reflection, JSON serialization, or certain framework callbacks. You need to write keep rules for classes that are accessed reflectively. Getting this wrong causes runtime crashes in production that don't appear in debug builds — one of the more painful debugging experiences in Android.

#### Q12: What is the Macrobenchmark library and how does it differ from Microbenchmark?

Macrobenchmark measures real user-facing metrics — app startup time, frame timing during scrolling, animation smoothness, and screen transitions. It runs on a real device or emulator, launches your app in a separate process, and measures from the outside. It's the right tool for measuring "how long does it take to open the app?" or "does the feed scroll at 60fps?"

Microbenchmark measures the execution time of individual code blocks — a function call, a serialization operation, a sorting algorithm. It runs in-process and uses JIT warmup to give stable measurements. It's the right tool for "is JSON parsing faster with Moshi or kotlinx.serialization?" or "which list transformation is faster?"

```kotlin
// Macrobenchmark: measuring startup time
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun startupColdCompilation() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.app",
            metrics = listOf(StartupTimingMetric()),
            compilationMode = CompilationMode.None(),
            iterations = 5,
            startupMode = StartupMode.COLD
        ) {
            pressHome()
            startActivityAndWait()
        }
    }
}
```

The key insight is that you need both. Macrobenchmark tells you "startup takes 800ms" but not why. Microbenchmark tells you "this JSON parsing takes 50ms" but not whether that matters in the real user journey. Use Macrobenchmark to identify slow areas, then Microbenchmark to optimize the specific bottleneck.

#### Q13: How does `onTrimMemory()` work and what should you do with each level?

The system calls `onTrimMemory()` on your Application, Activity, Service, and ContentProvider when it needs to reclaim memory. The callback provides a `level` parameter indicating how critical the situation is. `TRIM_MEMORY_RUNNING_LOW` and `TRIM_MEMORY_RUNNING_CRITICAL` mean your app is in the foreground but the system is low on memory — you should release non-essential caches. `TRIM_MEMORY_UI_HIDDEN` means the user navigated away — release UI-related resources. `TRIM_MEMORY_BACKGROUND`, `TRIM_MEMORY_MODERATE`, and `TRIM_MEMORY_COMPLETE` mean your app is in the background and increasingly likely to be killed — release as much memory as possible.

In practice, the most actionable level is `TRIM_MEMORY_UI_HIDDEN` — clear your image memory cache, drop any preloaded data you can reload later, and release large objects. Image loading libraries like Coil and Glide register for these callbacks and automatically trim their memory caches. If your app has custom caches, you should do the same.

#### Q14: How would you profile and fix a janky RecyclerView scroll?

Start with the Android Studio Profiler or Perfetto. Record a trace while scrolling the list, then look at the frame timeline. Each frame that takes more than 16ms shows up in red. Click on a dropped frame to see what the main thread was doing during that time.

Common causes and fixes: `onBindViewHolder()` is doing too much work — move image loading to an async library, avoid creating new objects in `onBind`, don't call `notifyDataSetChanged()` (use `DiffUtil` or `AsyncListDiffer` instead). Nested RecyclerViews without shared `RecycledViewPool`. Complex view hierarchies in each item — flatten with `ConstraintLayout` or migrate to Compose. Expensive custom view `onDraw()` methods — cache drawing computations, avoid allocations in `onDraw()`. Missing `setHasFixedSize(true)` when the RecyclerView size doesn't change (skips unnecessary re-measurement). Items triggering unnecessary layout passes — check for `requestLayout()` calls during scroll.

#### Q15: What are the common sources of `OutOfMemoryError` and how do you prevent them?

The most common sources: loading full-resolution bitmaps without subsampling, memory leaks accumulating over time (especially leaking Activities), creating too many objects in rapid succession (triggering excessive GC that still can't keep up), holding large collections in memory when they should be paged or streamed, and background services holding references to large data structures.

Prevention strategies include using image loading libraries that handle bitmap lifecycle and memory pressure, running LeakCanary in debug builds to catch leaks early, using `largeHeap=true` in the manifest only as a last resort (it's a band-aid, not a fix), implementing pagination for large data sets, profiling with the Memory Profiler to understand your app's memory allocation patterns, and handling `onTrimMemory()` callbacks to release caches proactively. In production, catch `OutOfMemoryError` around bitmap operations and fall back gracefully rather than crashing.

#### Q16: Is it possible to force garbage collection in Android?

You can request GC by calling `System.gc()` or `Runtime.getRuntime().gc()`, but you cannot force it. The system treats this as a suggestion, not a command. ART's garbage collector decides when and how to collect based on memory pressure, allocation rates, and its own heuristics. Calling `System.gc()` explicitly is almost always the wrong thing to do in production code — it can trigger a full GC pause that hurts performance more than it helps. The GC is designed to run at optimal times. If you feel the need to call `System.gc()`, it usually means you have a memory management problem (leak, oversized allocation) that you should fix at the source rather than papering over with a manual GC request. The one legitimate use case is in test or benchmarking code where you want to start from a clean memory state.

#### Q17: What is StrictMode and how do you use it to catch performance issues?

`StrictMode` is a developer tool that detects things you might be doing by accident — like disk reads or network calls on the main thread. It has two policies: `ThreadPolicy` (detects disk reads/writes, network operations, and slow calls on the current thread) and `VmPolicy` (detects leaked objects, leaked closable resources, untagged sockets, and other VM-level issues).

```kotlin
// Enable in Application.onCreate() for debug builds only
if (BuildConfig.DEBUG) {
    StrictMode.setThreadPolicy(
        StrictMode.ThreadPolicy.Builder()
            .detectDiskReads()
            .detectDiskWrites()
            .detectNetwork()
            .penaltyLog()       // Log to Logcat
            .penaltyFlashScreen() // Flash the screen red
            .build()
    )
    StrictMode.setVmPolicy(
        StrictMode.VmPolicy.Builder()
            .detectLeakedSqlLiteObjects()
            .detectLeakedClosableObjects()
            .detectActivityLeaks()
            .penaltyLog()
            .build()
    )
}
```

Never enable StrictMode in release builds — the overhead and the crash penalties would hurt users. In development, it's incredibly useful. It catches subtle issues like: `SharedPreferences.commit()` on the main thread (disk write), checking `File.exists()` on the main thread (disk read), or forgetting to close a `Cursor` (leaked closable). Many production ANRs can be prevented by catching these issues early with StrictMode during development.

#### Q18: What is the difference between `Bitmap.Config.ARGB_8888` and `RGB_565`?

`ARGB_8888` uses 4 bytes per pixel (8 bits each for alpha, red, green, blue). It's the highest quality — supports full transparency and 16.7 million colors. A 1000x1000 bitmap at ARGB_8888 uses 4MB of memory. `RGB_565` uses 2 bytes per pixel (5 bits red, 6 bits green, 5 bits blue). It has no alpha channel (no transparency) and reduced color depth (65,536 colors), but uses exactly half the memory — that same 1000x1000 bitmap is only 2MB.

In practice, `ARGB_8888` is the default and the right choice for most images — photos, complex graphics, anything with transparency. `RGB_565` is useful when you're displaying images that don't need transparency and memory is tight, like thumbnails in a long list. Image loading libraries like Glide used to default to `RGB_565` for non-transparent images to save memory, though Coil defaults to `ARGB_8888`. The visual difference is usually imperceptible for photos but can cause visible banding in gradients.

### Common Follow-ups

- What's the difference between `Bitmap.Config.ARGB_8888` and `RGB_565`?
- How does hardware acceleration affect rendering performance?
- What does `StrictMode` detect, and should you use it in production?
- How would you reduce APK size, and why does it matter for performance?
- What's the difference between `invalidate()` and `requestLayout()`?
- How does Compose's lazy column differ from RecyclerView in terms of performance?
- What are startup profiles and how do they differ from baseline profiles?
- What is `inBitmap` and how does bitmap pooling work?

### Tips for the Interview

1. **Lead with measurement** — When asked "how would you optimize X?", always start with "I'd profile it first to find the actual bottleneck." Interviewers want to see a methodical approach, not shotgun optimization. Mention specific tools — Profiler, Perfetto, Macrobenchmark.

2. **Know the numbers** — 16ms per frame, 5-second ANR threshold, ART's sub-1ms GC pauses, 30% improvement from baseline profiles. Quantified claims show real understanding, not hand-waving.

3. **Memory leaks are a favorite topic** — Have 2-3 real examples ready. The Handler/Runnable leak, the singleton holding an Activity context, and the unregistered listener are the classics. Know how to find them with LeakCanary and the Memory Profiler.

4. **Understand the full stack** — A frame goes through measure, layout, draw on the main thread, then compositing on the RenderThread. Knowing this pipeline helps you reason about where jank comes from, rather than just listing generic tips.

5. **Connect performance to user impact** — Don't just say "it's faster." Say "cold start dropped from 1.2s to 600ms, which reduced Day 1 uninstall rate." This shows you understand why performance engineering matters, not just how to do it.
