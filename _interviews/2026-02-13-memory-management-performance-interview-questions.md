---
title: "Memory Management & Performance"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 24
sequence: 24
description: "This covers how memory works on Android, why frames drop, and how to find and fix performance problems."
---

## Memory Management & Performance

This covers how memory works on Android, why frames drop, and how to find and fix performance problems.

#### What is a memory leak in Android?

A memory leak happens when an object is no longer needed but something still holds a reference to it. The garbage collector can't reclaim it because it's still reachable. Activities are the most dangerous to leak because they hold references to the entire view hierarchy, bitmaps, and resources.

Common causes:
- An inner class (like a `Handler` or `Runnable`) holding an implicit reference to the Activity
- A static field referencing an Activity context
- A listener registered on a singleton that's never unregistered
- A coroutine or thread that outlives the Activity and captures it in a closure
- A `ViewModel` holding a reference to a View or Activity

```kotlin
// Leak: Runnable holds implicit reference to Activity for 30 seconds
class LeakyActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val handler = Handler(Looper.getMainLooper())
        handler.postDelayed({
            updateUI()
        }, 30_000)
    }
}

// Fix: cancel the callback in onDestroy
class FixedActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val updateRunnable = Runnable { updateUI() }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(updateRunnable)
    }
}
```

#### How does garbage collection work on Android?

Android uses ART's garbage collector. It's generational, concurrent, and moving. Young objects sit in a nursery. Objects that survive multiple GC cycles get promoted to the old generation. Most objects are short-lived, so collecting the young generation frequently is efficient.

GC runs concurrently alongside app threads with pause times typically under 1ms. It can also relocate objects to reduce fragmentation. GC roots include local variables on the call stack, static fields, active threads, and JNI references. Anything not reachable from a GC root gets collected.

#### Why does an Android app lag?

Android renders at 60 FPS, so each frame gets a 16ms budget. On 90Hz or 120Hz displays, that drops to 11ms and 8.3ms. When the main thread can't finish its work within that budget, the frame is dropped and the UI stutters.

Each frame goes through measure/layout, draw, and GPU compositing. Heavy work on the main thread, excessive GC, or complex view hierarchies push past the frame deadline and cause jank. I use Android Studio's CPU Profiler or Perfetto to see where each frame's time is spent.

#### What are the common causes of `OutOfMemoryError`?

- Loading full-resolution bitmaps without subsampling
- Memory leaks accumulating over time, especially leaking Activities
- Holding large collections in memory that should be paged
- Creating too many objects in a tight loop
- Background services holding references to large data structures

Prevention comes down to using image loading libraries, running LeakCanary in debug builds, paginating large data sets, profiling with Memory Profiler, and handling `onTrimMemory()`. I'd use `largeHeap=true` only as a last resort.

#### How do you handle large bitmaps efficiently?

A 12-megapixel photo at ARGB_8888 takes 48MB of memory. Loading a few of those crashes the app. The solution is subsampling — load the bitmap at a reduced resolution using `BitmapFactory.Options.inSampleSize`.

```kotlin
fun decodeSampledBitmap(
    resources: Resources,
    resId: Int,
    targetWidth: Int,
    targetHeight: Int
): Bitmap {
    val options = BitmapFactory.Options().apply {
        inJustDecodeBounds = true
    }
    BitmapFactory.decodeResource(resources, resId, options)

    options.inSampleSize = calculateInSampleSize(
        options.outWidth, options.outHeight,
        targetWidth, targetHeight
    )
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

In practice, image loading libraries like Coil and Glide handle subsampling, caching, lifecycle awareness, and request cancellation automatically.

#### How would you profile and fix a janky RecyclerView?

Record a trace with Android Studio Profiler or Perfetto while scrolling. Frames over 16ms show up in red. Click a dropped frame to see what the main thread was doing.

Common causes and fixes:
- `onBindViewHolder()` doing too much work — load images async, don't create objects in `onBind`
- Calling `notifyDataSetChanged()` — use `DiffUtil` or `AsyncListDiffer` instead
- Nested RecyclerViews without a shared `RecycledViewPool`
- Complex view hierarchies — flatten with `ConstraintLayout` or use Compose
- Missing `setHasFixedSize(true)` when the RecyclerView size doesn't change
- `requestLayout()` calls during scroll triggering unnecessary layout passes

#### How do you measure and optimize app startup time?

Android has three startup types:
- **Cold start** — process doesn't exist. System creates it, initializes Application, creates Activity, inflates layout, draws first frame
- **Warm start** — process exists but Activity was destroyed, skips process creation
- **Hot start** — Activity is still in memory, just brought to foreground

I measure cold start by calling `reportFullyDrawn()` when meaningful content is visible. Logcat shows timing in the `Displayed` line.

Common optimizations:
- Lazy-initialize libraries using App Startup with deferred initialization
- Move heavy initialization off the main thread
- Reduce main dex file size for faster class loading
- Avoid disk I/O in `Application.onCreate()` and `Activity.onCreate()`

#### What is `onTrimMemory()` and how do you respond to it?

The system calls `onTrimMemory()` on your Application, Activity, Service, and ContentProvider when it needs to reclaim memory. The `level` parameter tells you how critical the situation is:
- `TRIM_MEMORY_RUNNING_LOW` / `TRIM_MEMORY_RUNNING_CRITICAL` — app is in foreground but system is low on memory. Release non-essential caches
- `TRIM_MEMORY_UI_HIDDEN` — user navigated away. Release UI resources
- `TRIM_MEMORY_BACKGROUND` / `TRIM_MEMORY_MODERATE` / `TRIM_MEMORY_COMPLETE` — app is in background and increasingly likely to be killed. Release as much as possible

The most actionable level is `TRIM_MEMORY_UI_HIDDEN` — clear image caches, drop preloaded data, release large objects. Image loading libraries handle this automatically. Custom caches should do the same.

#### What is overdraw and how do you reduce it?

Overdraw happens when the same pixel is drawn multiple times in a single frame. If you have a background on your Activity, a FrameLayout, and a CardView stacked, that pixel area gets drawn three times. Minor overdraw (2x) is normal, but 4x+ on large areas hurts performance.

Enable "Debug GPU Overdraw" in Developer Options. It color-codes the screen — blue is 1x, green is 2x, light red is 3x, dark red is 4x+.

The fix is removing unnecessary backgrounds. Remove `android:background` from your window theme and only set backgrounds where needed. The `<merge>` tag also helps by eliminating wrapper layout layers.

#### What is StrictMode?

StrictMode detects things like disk reads or network calls on the main thread. It has two policies:
- **ThreadPolicy** — detects disk reads/writes, network operations, and slow calls on the current thread
- **VmPolicy** — detects leaked objects, leaked closable resources, and Activity leaks

```kotlin
if (BuildConfig.DEBUG) {
    StrictMode.setThreadPolicy(
        StrictMode.ThreadPolicy.Builder()
            .detectDiskReads()
            .detectDiskWrites()
            .detectNetwork()
            .penaltyLog()
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

Never enable it in release builds. In development, it catches things like `SharedPreferences.commit()` on the main thread, checking `File.exists()` on the main thread, or forgetting to close a `Cursor`.

#### Is it possible to force garbage collection in Android?

You can request GC using `System.gc()`, but it can't be forced. The system treats it as a suggestion. ART decides when and how to collect based on memory pressure and allocation rates. Calling `System.gc()` in production is almost always wrong — it can trigger a full GC pause that hurts performance. The only legitimate use is in test or benchmarking code.

#### What is LruCache and how does it work?

LruCache is a fixed-size cache that evicts the least recently accessed entry when full. You define a max size, and when a new entry exceeds the limit, the oldest entry is removed.

```kotlin
val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
val cacheSize = maxMemory / 8

val bitmapCache = object : LruCache<String, Bitmap>(cacheSize) {
    override fun sizeOf(key: String, bitmap: Bitmap): Int {
        return bitmap.byteCount / 1024
    }
}

bitmapCache.put("profile_photo", bitmap)
val cached: Bitmap? = bitmapCache.get("profile_photo")
```

A common strategy is two-tier caching — `LruCache` for fast in-memory access plus `DiskLruCache` for persistent disk cache. Image libraries do exactly this. They check memory cache first (instant), then disk cache (fast), then network (slow).

#### What is the difference between `ARGB_8888` and `RGB_565`?

`ARGB_8888` uses 4 bytes per pixel. Full transparency support, 16.7 million colors. A 1000x1000 bitmap takes 4MB. `RGB_565` uses 2 bytes per pixel — no alpha channel, only 65K colors, but half the memory.

`ARGB_8888` is the default and right for most images. `RGB_565` is useful for images without transparency when memory is tight, like thumbnails in a long list. The visual difference is barely noticeable for photos but can cause banding in gradients.

#### What is R8 and how does it affect performance?

R8 is Google's replacement for ProGuard. It does four things:
- **Shrinking** — removes unused classes, methods, and fields
- **Optimization** — inlines methods, removes dead branches
- **Obfuscation** — renames classes and methods to short names
- **Resource shrinking** — removes unused resources when combined with `shrinkResources`

```kotlin
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

R8 can't see into reflection, JSON serialization, or certain framework callbacks. You need keep rules for classes accessed reflectively. Getting this wrong causes runtime crashes in production that don't show up in debug builds.

#### What is the difference between ART and Dalvik?

Dalvik used JIT (Just-In-Time) compilation — bytecode was interpreted at runtime, and hot methods were compiled to native code on the fly. Faster installs, slower app startup. ART, introduced in Android 5.0, switched to AOT (Ahead-Of-Time) compilation — apps were fully compiled to native code during installation.

From Android 7.0, ART uses a hybrid approach called profile-guided compilation. The app initially runs with an interpreter and JIT compiler. ART profiles which methods are hot, and during idle charging, a background daemon AOT-compiles those methods. Over time the app gets faster.

#### What are baseline profiles?

Baseline profiles solve the cold start problem. Even with profile-guided compilation, the first several launches are slow because no profile exists yet. Baseline profiles ship a pre-built profile with your APK that tells ART which methods to AOT-compile at install time. First launch becomes as fast as the hundredth.

They improve code execution speed by about 30% from first launch. You generate them using the Macrobenchmark library by writing tests that exercise critical user journeys.

```kotlin
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generateBaselineProfile() {
        rule.collect(packageName = "com.example.app") {
            pressHome()
            startActivityAndWait()

            device.findObject(By.text("Feed")).click()
            device.waitForIdle()
        }
    }
}
```

The generated profile ships in your AAB. Google Play distributes it with cloud profiles. On devices without Play Store, the profile is bundled in the APK itself.

#### What is `inBitmap` and how does bitmap pooling work?

Bitmap pooling reuses memory from discarded bitmaps instead of allocating fresh memory every time. When you're done with a bitmap, you put it in a pool. When you need a new bitmap of equal or smaller size, you pull one from the pool and decode into its existing memory.

```kotlin
val options = BitmapFactory.Options().apply {
    inMutable = true
    inBitmap = reusableBitmap
}
val bitmap = BitmapFactory.decodeStream(stream, null, options)
```

On API 19+, `inBitmap` can reuse any bitmap that's equal or larger than the target. This reduces GC pressure significantly when scrolling through image-heavy lists. Glide and Coil maintain internal bitmap pools automatically.

#### What is the difference between `invalidate()` and `requestLayout()`?

`invalidate()` triggers a redraw of the view. It calls `onDraw()` again but doesn't recalculate sizes or positions. Use it when the visual content changed but the view's bounds are the same — like updating a color or toggling a drawable.

`requestLayout()` triggers the full measure-layout-draw cycle from the parent down. It recalculates sizes and positions. Use it when the view's size or position needs to change — like when text content changes length.

Calling `requestLayout()` is more expensive. Doing it during scroll or animation causes jank because it forces the entire view tree to re-measure.

#### How does LeakCanary detect memory leaks?

When an Activity or Fragment is destroyed, LeakCanary creates a `WeakReference` to it. After a GC cycle, it checks if that reference was enqueued. If it wasn't, the object is still alive — it's leaked. LeakCanary then triggers a heap dump and analyzes the reference chain from the leaked object back to the GC root, showing exactly which reference is keeping it alive.

```kotlin
dependencies {
    debugImplementation("com.squareup.leakcanary:leakcanary-android:2.14")
}
```

It automatically watches Activities, Fragments, ViewModels, and Services after they're destroyed. You can also watch custom objects with `AppWatcher.objectWatcher.expectWeaklyReachable()`.

#### What is Macrobenchmark and how does it differ from Microbenchmark?

Macrobenchmark measures real user-facing metrics — startup time, frame timing, scroll smoothness. It launches the app in a separate process and measures from the outside. Microbenchmark measures execution time of individual code blocks — a function call, a parsing operation. It runs in-process with JIT warmup.

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun startupCold() {
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

I use both together. Macrobenchmark tells me "startup takes 800ms" but not why. Microbenchmark tells me "this JSON parsing takes 50ms" but not whether it matters in the real user journey.

#### How does hardware acceleration affect rendering?

Hardware acceleration offloads drawing operations from the CPU to the GPU. It's enabled by default since API 14. Most standard drawing operations are faster with it — the GPU handles Canvas operations, bitmap compositing, and animations more efficiently than the CPU.

But not all Canvas operations are GPU-accelerated. Custom `onDraw()` code using certain paths, clip operations, or `drawBitmapMesh()` may fall back to software rendering. You can check if a Canvas is hardware-accelerated with `canvas.isHardwareAccelerated`. If a specific view needs software rendering, disable it per-view with `setLayerType(View.LAYER_TYPE_SOFTWARE, null)`.

#### How would you reduce APK size?

- Enable R8 shrinking and resource shrinking in release builds
- Use Android App Bundle (AAB) — Play Store generates optimized APKs per device configuration
- Use vector drawables instead of multiple PNG resolutions
- Compress PNG and JPEG assets. Use WebP where possible
- Remove unused libraries and transitive dependencies
- Use `resConfigs` to strip unused locale resources
- Inspect the APK with Android Studio's APK Analyzer to find the biggest contributors

APK size matters for install conversion rates and also affects runtime performance. Smaller APKs mean faster installs, less disk usage, and smaller dex files to load at startup.

### Common Follow-ups

- How does Compose's `LazyColumn` differ from RecyclerView in terms of performance?
- What are startup profiles and how do they differ from baseline profiles?
- How do you detect memory leaks in production?
- What is the difference between `WeakReference` and `SoftReference`?
- How does View recycling work in RecyclerView?
- What's the impact of deep view hierarchies on performance?
- How do you profile native memory usage on Android?
- What is ANR and how do you debug it?
