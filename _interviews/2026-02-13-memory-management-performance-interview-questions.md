---
title: "Memory Management & Performance"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 8
sequence: 25
description: "This covers how memory works on Android, why frames drop, and how to find and fix performance problems."
---

## Memory Management & Performance

This covers how memory works on Android, why frames drop, and how to find and fix performance problems.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a memory leak in Android, and what are the most common causes?

A memory leak happens when an object is no longer needed but something still holds a reference to it, so the garbage collector can't reclaim it. Activities are the most dangerous ones to leak because they hold references to the entire view hierarchy, bitmaps, and resources.

Common causes:
- An inner class (like a `Handler` callback or `Runnable`) holding an implicit reference to the outer Activity
- A static field referencing an Activity context
- A listener or callback registered on a singleton that's never unregistered
- A thread or coroutine that outlives the Activity and captures it in a closure
- A `ViewModel` holding a reference to a View or Activity

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

Android uses ART's garbage collector which is generational, concurrent, and moving. Objects are categorized by age — young objects sit in a nursery, and ones that survive multiple GC cycles get promoted to the old generation. Most objects are short-lived, so collecting the young generation frequently is efficient. The concurrent part means GC runs alongside app threads with pause times typically under 1ms. Moving means the GC can relocate objects to reduce fragmentation.

GC roots include local variables on the call stack, static fields, active threads, and JNI references. Any object not reachable from a GC root gets collected. This is why a leaked Activity is a problem — if anything reachable holds a reference to it, the GC can't touch it.

#### Q3: What is LeakCanary and how does it detect memory leaks?

LeakCanary is Square's memory leak detection library. When an Activity or Fragment is destroyed, LeakCanary creates a `WeakReference` to it and checks if that reference gets enqueued after a GC cycle. If it's not enqueued, the object wasn't collected — it's leaked. LeakCanary then triggers a heap dump and analyzes the reference chain from the leaked object back to the GC root, showing exactly which reference is keeping it alive.

```kotlin
// build.gradle.kts — that's literally all you need
dependencies {
    debugImplementation("com.squareup.leakcanary:leakcanary-android:2.14")
}
```

It automatically watches Activities, Fragments, Fragment Views, ViewModels, and Services after they're destroyed. You can also watch custom objects by calling `AppWatcher.objectWatcher.expectWeaklyReachable()`.

#### Q4: What is the 16ms frame budget and why does it matter?

Android updates views every 16ms (60 FPS) to render. When this takes more than 16ms, the frame is dropped and the UI lags. On 90Hz or 120Hz displays, the budget is even tighter — 11ms and 8.3ms respectively.

Each frame goes through three phases: measure/layout (compute sizes and positions), draw (generate display list commands), and RenderThread compositing on the GPU. If main thread work pushes past the frame deadline, the frame misses VSYNC and gets displayed late. Tools like Android Studio's CPU Profiler and Perfetto help visualize where each frame's time is spent.

#### Q5: What is overdraw and how do you detect it?

Overdraw happens when the same pixel is drawn multiple times in a single frame. For example, if you have a background on your Activity, a FrameLayout, and a CardView, that pixel area is drawn three times even though only the top layer is visible. Minor overdraw (2x) is normal, but 4x+ on large areas hurts performance.

Enable "Debug GPU Overdraw" in Developer Options to see it. It color-codes the screen:
- No color = no overdraw
- Blue = 1x, Green = 2x, Light red = 3x, Dark red = 4x+

The fix is usually removing unnecessary backgrounds. Remove `android:background` from your Activity theme's window and only set backgrounds where needed. The `<merge>` tag also helps by eliminating wrapper layout layers.

#### Q6: How do you handle large bitmaps efficiently on Android?

Large bitmaps are one of the most common causes of `OutOfMemoryError`. A 12-megapixel photo (4000x3000) at ARGB_8888 takes 48MB of memory. Loading 3-4 of those can crash the app. The solution is subsampling — load the bitmap at a reduced resolution using `BitmapFactory.Options.inSampleSize`.

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

In practice, image loading libraries like Coil and Glide handle subsampling, caching (memory + disk), lifecycle awareness, and request cancellation automatically.

#### Q7: What is LruCache and how does it work?

LruCache is a fixed-size cache that evicts the least recently accessed entry when it's full. You define a max size, and when a new entry would exceed the limit, the cache auto-clears the oldest entry. It's one of the most easy and optimised solutions for in-memory caching.

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

A common two-tier strategy uses `LruCache` for fast in-memory access plus `DiskLruCache` for persistent disk cache. Image loading libraries do exactly this — they check memory cache first (instant), then disk cache (fast), then network (slow).

### Deep Dive Questions (Advanced → Expert)

#### Q8: Explain the difference between ART and Dalvik. What was the motivation for the switch?

Dalvik used JIT (Just-In-Time) compilation — bytecode was interpreted at runtime, and hot methods were compiled to native code on the fly. This meant faster installs but slower app startup. ART, introduced in Android 5.0, switched to AOT (Ahead-Of-Time) compilation — apps were fully compiled to native code during installation. Apps launched faster, but install times and storage usage increased.

From Android 7.0, ART uses a hybrid approach called profile-guided compilation. The app initially runs with an interpreter and JIT compiler. ART profiles which methods are "hot" and during idle charging, a background daemon AOT-compiles those methods. Over time the app gets faster as more critical paths are compiled.

#### Q9: What are baseline profiles, and how do they improve performance?

Baseline profiles solve the first-run problem. Even with profile-guided compilation, the first several launches are slower because no profile exists yet. Baseline profiles let you ship a pre-built profile with your APK or AAB that tells ART which methods to AOT-compile during installation. This way the first launch is as fast as the hundredth.

They improve code execution speed by about 30% from first launch. You generate them using the Macrobenchmark library by writing tests that exercise critical user journeys.

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

Android has three startup types:
- **Cold start** — process doesn't exist, system creates it, initializes Application, creates Activity, inflates layout, draws first frame
- **Warm start** — process exists but Activity was destroyed, skips process creation
- **Hot start** — Activity is still in memory, just comes to foreground

To measure cold start, call `reportFullyDrawn()` on your Activity when the first meaningful content is visible. Logcat shows the timing in the `Displayed` log line.

Common optimizations:
- Lazy-initialize libraries using `App Startup` with deferred initialization
- Move heavy initialization to background threads
- Reduce main `dex` file size for faster class loading
- Avoid disk I/O in `Application.onCreate()` and `Activity.onCreate()`
- Use a splash screen while data loads

#### Q11: What is ProGuard/R8 and how does it affect performance?

R8 is Google's replacement for ProGuard and the default since Android Gradle Plugin 3.4+. It does four things:
- **Shrinking** — removes unused classes, methods, and fields
- **Optimization** — inlines methods, simplifies code, removes dead branches
- **Obfuscation** — renames classes and methods to short names
- **Resource shrinking** — removes unused resources when combined with `shrinkResources`

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

R8 can't see into reflection, JSON serialization, or certain framework callbacks. You need to write keep rules for classes accessed reflectively. Getting this wrong causes runtime crashes in production that don't appear in debug builds.

#### Q12: What is the Macrobenchmark library and how does it differ from Microbenchmark?

Macrobenchmark measures real user-facing metrics — startup time, frame timing during scrolling, animation smoothness. It launches your app in a separate process and measures from the outside.

Microbenchmark measures execution time of individual code blocks — a function call, a serialization operation. It runs in-process with JIT warmup for stable measurements.

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

You need both. Macrobenchmark tells you "startup takes 800ms" but not why. Microbenchmark tells you "this JSON parsing takes 50ms" but not whether it matters in the real user journey. Use Macrobenchmark to find slow areas, then Microbenchmark to optimize the specific bottleneck.

#### Q13: How does `onTrimMemory()` work and what should you do with each level?

The system calls `onTrimMemory()` on your Application, Activity, Service, and ContentProvider when it needs to reclaim memory. The `level` parameter tells you how critical the situation is:
- `TRIM_MEMORY_RUNNING_LOW` / `TRIM_MEMORY_RUNNING_CRITICAL` — app is in foreground but system is low on memory, release non-essential caches
- `TRIM_MEMORY_UI_HIDDEN` — user navigated away, release UI-related resources
- `TRIM_MEMORY_BACKGROUND` / `TRIM_MEMORY_MODERATE` / `TRIM_MEMORY_COMPLETE` — app is in background and increasingly likely to be killed, release as much as possible

The most actionable level is `TRIM_MEMORY_UI_HIDDEN` — clear your image memory cache, drop preloaded data, release large objects. Libraries like Coil and Glide handle this automatically for their caches. Custom caches should do the same.

#### Q14: How would you profile and fix a janky RecyclerView scroll?

Record a trace with Android Studio Profiler or Perfetto while scrolling. Each frame that takes more than 16ms shows up in red. Click a dropped frame to see what the main thread was doing.

Common causes and fixes:
- `onBindViewHolder()` doing too much work — use async image loading, avoid creating new objects in `onBind`
- Calling `notifyDataSetChanged()` — use `DiffUtil` or `AsyncListDiffer` instead
- Nested RecyclerViews without shared `RecycledViewPool`
- Complex view hierarchies — flatten with `ConstraintLayout` or migrate to Compose
- Expensive `onDraw()` methods — cache drawing computations, avoid allocations
- Missing `setHasFixedSize(true)` when RecyclerView size doesn't change
- `requestLayout()` calls during scroll triggering unnecessary layout passes

#### Q15: What are the common sources of `OutOfMemoryError` and how do you prevent them?

Common sources:
- Loading full-resolution bitmaps without subsampling
- Memory leaks accumulating over time, especially leaking Activities
- Creating too many objects in rapid succession
- Holding large collections in memory that should be paged or streamed
- Background services holding references to large data structures

Prevention:
- Use image loading libraries that handle bitmap lifecycle and memory pressure
- Run LeakCanary in debug builds to catch leaks early
- Implement pagination for large data sets
- Profile with Memory Profiler to understand allocation patterns
- Handle `onTrimMemory()` to release caches proactively
- Use `largeHeap=true` only as a last resort

#### Q16: Is it possible to force garbage collection in Android?

You can request GC using `System.gc()` or `Runtime.getRuntime().gc()`, but it cannot be forced. The system treats it as a suggestion. ART's GC decides when and how to collect based on memory pressure, allocation rates, and its own heuristics. Calling `System.gc()` in production is almost always wrong — it can trigger a full GC pause that hurts performance. The one legitimate use case is in test or benchmarking code where you want a clean memory state.

#### Q17: What is StrictMode and how do you use it to catch performance issues?

StrictMode detects things like disk reads or network calls on the main thread. It has two policies:
- **ThreadPolicy** — detects disk reads/writes, network operations, and slow calls on the current thread
- **VmPolicy** — detects leaked objects, leaked closable resources, and activity leaks

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

Never enable StrictMode in release builds. In development, it catches things like `SharedPreferences.commit()` on the main thread, checking `File.exists()` on the main thread, or forgetting to close a `Cursor`. Many production ANRs can be prevented by catching these issues early with StrictMode.

#### Q18: What is the difference between `Bitmap.Config.ARGB_8888` and `RGB_565`?

`ARGB_8888` uses 4 bytes per pixel — full transparency support and 16.7 million colors. A 1000x1000 bitmap takes 4MB. `RGB_565` uses 2 bytes per pixel — no alpha channel, only 65,536 colors, but exactly half the memory.

`ARGB_8888` is the default and right for most images — photos, complex graphics, anything with transparency. `RGB_565` is useful for images without transparency when memory is tight, like thumbnails in a long list. The visual difference is usually not noticeable for photos but can cause visible banding in gradients.

#### Q19: What is `inBitmap` and how does bitmap pooling work?

Bitmap pooling reuses memory from discarded bitmaps instead of allocating new memory for every image load. When you're done with a bitmap, instead of letting GC reclaim it, you put it in a pool. When you need a new bitmap of the same (or smaller) size, you pull one from the pool and decode into its existing memory.

```kotlin
val options = BitmapFactory.Options().apply {
    inMutable = true
    inBitmap = reusableBitmap // decode into this existing allocation
}
val bitmap = BitmapFactory.decodeStream(stream, null, options)
```

On API 19+, `inBitmap` can reuse any bitmap that's equal or larger than the target — it doesn't need to be the exact same dimensions. This dramatically reduces GC pressure when scrolling through image-heavy lists. Image libraries like Glide and Coil maintain internal bitmap pools automatically. Glide's `BitmapPool` uses an LRU strategy, keeping recently released bitmaps and evicting the oldest when the pool exceeds its size limit. If you're building a custom image pipeline, implementing a bitmap pool is one of the highest-impact optimizations you can make.

### Common Follow-ups

- What's the difference between `Bitmap.Config.ARGB_8888` and `RGB_565`?
- How does hardware acceleration affect rendering performance?
- What does `StrictMode` detect, and should you use it in production?
- How would you reduce APK size, and why does it matter for performance?
- What's the difference between `invalidate()` and `requestLayout()`?
- How does Compose's lazy column differ from RecyclerView in terms of performance?
- What are startup profiles and how do they differ from baseline profiles?
- How do you detect memory leaks in production using Firebase Crashlytics?
