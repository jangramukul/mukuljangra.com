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

Think of it like a hotel guest who checked out but never returned their room key. The room is "occupied" in the system even though nobody's using it. A memory leak is when an object is no longer needed but something still holds a reference to it, so the garbage collector can't reclaim it. Activities are the scariest ones to leak because they drag along the entire view hierarchy, bitmaps, and resources with them.

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

Picture a janitor who cleans the office building every night. The janitor (GC) walks through every room starting from the lobby (GC roots) and marks every room that's still connected by hallways. Anything unreachable gets swept out. Android uses ART's garbage collector, which is generational, concurrent, and moving. Young objects sit in a nursery, and objects that survive multiple GC cycles get promoted to the old generation. Most objects are short-lived, so collecting the young generation frequently is efficient.

GC runs concurrently alongside app threads with pause times typically under 1ms. It can also relocate objects to reduce fragmentation. GC roots include local variables on the call stack, static fields, active threads, and JNI references. Anything not reachable from a GC root gets collected.

#### Why does an Android app lag?

Android renders at 60 FPS, which gives each frame a 16ms budget. That's it. On 90Hz or 120Hz displays, that drops to 11ms and 8.3ms. When the main thread can't finish its work within that budget, the frame is dropped and the user sees a stutter. It's like a conveyor belt at a factory -- if the worker can't finish assembling a part before the next slot arrives, an empty box ships out.

> **🧠 Think about it:** If each frame goes through measure/layout, draw, and GPU compositing, what kind of main-thread work do you think would blow past that 16ms deadline?

Heavy work on the main thread, excessive GC, or complex view hierarchies push past the frame deadline and cause jank. I use Android Studio's CPU Profiler or Perfetto to see where each frame's time is spent.

#### What are the common causes of `OutOfMemoryError`?

Yeah, this one has bitten me at 2am more than once. The usual suspects:

- Loading full-resolution bitmaps without subsampling
- Memory leaks accumulating over time, especially leaking Activities
- Holding large collections in memory that should be paged
- Creating too many objects in a tight loop
- Background services holding references to large data structures

Prevention comes down to using image loading libraries, running LeakCanary in debug builds, paginating large data sets, profiling with Memory Profiler, and handling `onTrimMemory()`. I'd use `largeHeap=true` only as a last resort -- it's like asking for a bigger apartment instead of cleaning up the mess in your current one.

#### How do you handle large bitmaps efficiently?

Here's the thing -- a 12-megapixel photo at ARGB_8888 takes 48MB of memory. Load a few of those and your app crashes before the user even sees anything. The solution is subsampling. Instead of loading the full image and then shrinking it (wasteful), you tell `BitmapFactory` to only decode every Nth pixel using `inSampleSize`. It's like reading every other page of a book when you only need the summary.

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

In practice, image loading libraries like Coil and Glide handle subsampling, caching, lifecycle awareness, and request cancellation automatically. You almost never write this by hand anymore, but understanding what happens underneath is what separates you in an interview.

#### How would you profile and fix a janky RecyclerView?

Record a trace with Android Studio Profiler or Perfetto while scrolling. Frames over 16ms show up in red. Click a dropped frame to see what the main thread was doing -- it's like reading the crime scene report.

Common causes and fixes:
- `onBindViewHolder()` doing too much work -- load images async, don't create objects in `onBind`
- Calling `notifyDataSetChanged()` -- use `DiffUtil` or `AsyncListDiffer` instead
- Nested RecyclerViews without a shared `RecycledViewPool`
- Complex view hierarchies -- flatten with `ConstraintLayout` or use Compose
- Missing `setHasFixedSize(true)` when the RecyclerView size doesn't change
- `requestLayout()` calls during scroll triggering unnecessary layout passes

#### How do you measure and optimize app startup time?

Android has three startup types, and they're not all created equal:
- **Cold start** -- process doesn't exist. System creates it, initializes Application, creates Activity, inflates layout, draws first frame. This is the big one
- **Warm start** -- process exists but Activity was destroyed, skips process creation
- **Hot start** -- Activity is still in memory, just brought to foreground. Basically free

I measure cold start by calling `reportFullyDrawn()` when meaningful content is visible. Logcat shows timing in the `Displayed` line.

Common optimizations:
- Lazy-initialize libraries using App Startup with deferred initialization
- Move heavy initialization off the main thread
- Reduce main dex file size for faster class loading
- Avoid disk I/O in `Application.onCreate()` and `Activity.onCreate()`

Think of cold start like opening a restaurant for the day. You don't want the first customer waiting while you chop onions, heat ovens, and set up tables. Do as much prep in advance (or in the background) as you can.

#### What is `onTrimMemory()` and how do you respond to it?

The system calls `onTrimMemory()` on your Application, Activity, Service, and ContentProvider when it needs to reclaim memory. Think of it as the OS politely knocking on your door saying "hey, we're running low, mind cleaning up?" The `level` parameter tells you how desperate the situation is:

- `TRIM_MEMORY_RUNNING_LOW` / `TRIM_MEMORY_RUNNING_CRITICAL` -- app is in foreground but system is low on memory. Release non-essential caches
- `TRIM_MEMORY_UI_HIDDEN` -- user navigated away. Release UI resources
- `TRIM_MEMORY_BACKGROUND` / `TRIM_MEMORY_MODERATE` / `TRIM_MEMORY_COMPLETE` -- app is in background and increasingly likely to be killed. Release as much as possible

The most actionable level is `TRIM_MEMORY_UI_HIDDEN` -- clear image caches, drop preloaded data, release large objects. Image loading libraries handle this automatically. Custom caches should do the same.

#### What is overdraw and how do you reduce it?

Overdraw is when the GPU paints the same pixel multiple times in a single frame. If you have a background on your Activity, a FrameLayout, and a CardView stacked on top, that pixel area gets painted three times. It's like painting a wall white, then blue, then red -- only the red shows, but you wasted time on all three coats. Minor overdraw (2x) is normal, but 4x+ on large areas hurts performance.

Enable "Debug GPU Overdraw" in Developer Options. It color-codes the screen -- blue is 1x, green is 2x, light red is 3x, dark red is 4x+.

The fix is removing unnecessary backgrounds. Remove `android:background` from your window theme and only set backgrounds where needed. The `<merge>` tag also helps by eliminating wrapper layout layers.

#### What is StrictMode?

StrictMode is like a strict gym coach watching your main thread. It detects things you shouldn't be doing there -- disk reads, network calls, slow operations -- and yells at you (via logs) when you mess up. It has two policies:

- **ThreadPolicy** -- detects disk reads/writes, network operations, and slow calls on the current thread
- **VmPolicy** -- detects leaked objects, leaked closable resources, and Activity leaks

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

Short answer: no. You can *request* GC using `System.gc()`, but it's a suggestion, not a command. ART decides when and how to collect based on memory pressure and allocation rates. It's like asking your roommate to take out the trash -- they might do it now, they might do it later, they might ignore you entirely. Calling `System.gc()` in production is almost always wrong because it can trigger a full GC pause that hurts performance. The only legitimate use is in test or benchmarking code.

> **🧠 Think about it:** If the system already runs GC automatically when memory gets tight, what could go wrong if you force a full GC cycle right in the middle of a scroll animation?

#### What is LruCache and how does it work?

LruCache is a fixed-size cache that evicts the least recently accessed entry when it's full. Think of it like a shelf with room for 10 books. When you bring book number 11, the book you haven't touched in the longest time gets kicked off. You define a max size, and when a new entry exceeds the limit, the oldest entry is removed.

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

A common strategy is two-tier caching -- `LruCache` for fast in-memory access plus `DiskLruCache` for persistent disk cache. Image libraries do exactly this. They check memory cache first (instant), then disk cache (fast), then network (slow). It's like checking your pocket, then your desk drawer, then driving to the store.

#### What is the difference between `ARGB_8888` and `RGB_565`?

`ARGB_8888` uses 4 bytes per pixel -- full transparency support, 16.7 million colors. A 1000x1000 bitmap takes 4MB. `RGB_565` uses 2 bytes per pixel -- no alpha channel, only 65K colors, but half the memory. It's the difference between a full HD photo and a slightly compressed version that looks nearly identical to the human eye.

`ARGB_8888` is the default and right for most images. `RGB_565` is useful for images without transparency when memory is tight, like thumbnails in a long list. The visual difference is barely noticeable for photos but can cause banding in gradients.

#### What is R8 and how does it affect performance?

R8 is Google's replacement for ProGuard. Think of it as a code janitor that does four things before your app ships:

- **Shrinking** -- removes unused classes, methods, and fields
- **Optimization** -- inlines methods, removes dead branches
- **Obfuscation** -- renames classes and methods to short names
- **Resource shrinking** -- removes unused resources when combined with `shrinkResources`

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

But here's the catch -- R8 can't see into reflection, JSON serialization, or certain framework callbacks. You need keep rules for classes accessed reflectively. Getting this wrong causes runtime crashes in production that don't show up in debug builds. I've seen this break Retrofit interfaces, Gson models, and WorkManager workers in production. Always test your release build.

#### What is the difference between ART and Dalvik?

Dalvik used JIT (Just-In-Time) compilation -- bytecode was interpreted at runtime, and hot methods were compiled to native code on the fly. Faster installs, slower app startup. ART, introduced in Android 5.0, flipped the script with AOT (Ahead-Of-Time) compilation -- apps were fully compiled to native code during installation. Slower installs, faster runtime.

From Android 7.0, ART got smarter with a hybrid approach called profile-guided compilation. The app initially runs with an interpreter and JIT compiler. ART profiles which methods are hot, and during idle charging, a background daemon AOT-compiles those methods. It's like a road crew that watches which paths people walk on most, then paves those first. Over time the app gets faster.

#### What are baseline profiles?

Baseline profiles solve a chicken-and-egg problem. Even with profile-guided compilation, the first several launches are slow because no profile exists yet -- ART doesn't know which methods matter. Baseline profiles ship a pre-built profile with your APK that tells ART which methods to AOT-compile at install time. First launch becomes as fast as the hundredth.

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

Bitmap pooling is like reusing shipping boxes. Instead of buying a new box every time you ship something, you keep old boxes around and stuff new items into them. When you're done with a bitmap, you put it in a pool. When you need a new bitmap of equal or smaller size, you pull one from the pool and decode into its existing memory -- no fresh allocation needed.

```kotlin
val options = BitmapFactory.Options().apply {
    inMutable = true
    inBitmap = reusableBitmap
}
val bitmap = BitmapFactory.decodeStream(stream, null, options)
```

On API 19+, `inBitmap` can reuse any bitmap that's equal or larger than the target. This reduces GC pressure significantly when scrolling through image-heavy lists. Glide and Coil maintain internal bitmap pools automatically.

#### What is the difference between `invalidate()` and `requestLayout()`?

`invalidate()` says "repaint yourself" -- it calls `onDraw()` again but doesn't recalculate sizes or positions. Use it when the visual content changed but the view's bounds are the same, like updating a color or toggling a drawable. It's touching up the paint on a wall.

`requestLayout()` says "recalculate everything" -- it triggers the full measure-layout-draw cycle from the parent down. It recalculates sizes and positions. Use it when the view's size or position needs to change, like when text content changes length. It's knocking down a wall and rebuilding.

Calling `requestLayout()` is more expensive. Doing it during scroll or animation causes jank because it forces the entire view tree to re-measure.

> **🧠 Think about it:** You're building a custom progress bar that smoothly fills from 0% to 100%. Would you call `invalidate()` or `requestLayout()` on each animation frame, and why?

#### How does LeakCanary detect memory leaks?

When an Activity or Fragment is destroyed, LeakCanary creates a `WeakReference` to it. After a GC cycle, it checks if that reference was enqueued in the reference queue. If it wasn't, the object is still alive -- it's leaked. LeakCanary then triggers a heap dump and walks the reference chain from the leaked object back to the GC root, showing exactly which reference is keeping it alive. It's basically a detective that follows the chain of evidence from the crime scene to the culprit.

```kotlin
dependencies {
    debugImplementation("com.squareup.leakcanary:leakcanary-android:2.14")
}
```

It automatically watches Activities, Fragments, ViewModels, and Services after they're destroyed. You can also watch custom objects with `AppWatcher.objectWatcher.expectWeaklyReachable()`.

#### What is Macrobenchmark and how does it differ from Microbenchmark?

Macrobenchmark is the big-picture view -- it measures real user-facing metrics like startup time, frame timing, and scroll smoothness. It launches your app in a separate process and measures from the outside, like a stopwatch held by someone watching the user. Microbenchmark is the microscope -- it measures execution time of individual code blocks, a single function call or a parsing operation, running in-process with JIT warmup.

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

I use both together. Macrobenchmark tells me "startup takes 800ms" but not why. Microbenchmark tells me "this JSON parsing takes 50ms" but not whether it matters in the real user journey. One gives you the symptom, the other gives you the diagnosis.

#### How does hardware acceleration affect rendering?

Hardware acceleration offloads drawing operations from the CPU to the GPU. It's enabled by default since API 14, and for good reason -- the GPU handles Canvas operations, bitmap compositing, and animations way more efficiently than the CPU. It's like handing off number-crunching to a calculator instead of doing it on paper.

But not all Canvas operations are GPU-accelerated. Custom `onDraw()` code using certain paths, clip operations, or `drawBitmapMesh()` may fall back to software rendering. You can check if a Canvas is hardware-accelerated with `canvas.isHardwareAccelerated`. If a specific view needs software rendering, disable it per-view with `setLayerType(View.LAYER_TYPE_SOFTWARE, null)`.

#### How would you reduce APK size?

- Enable R8 shrinking and resource shrinking in release builds
- Use Android App Bundle (AAB) -- Play Store generates optimized APKs per device configuration
- Use vector drawables instead of multiple PNG resolutions
- Compress PNG and JPEG assets. Use WebP where possible
- Remove unused libraries and transitive dependencies
- Use `resConfigs` to strip unused locale resources
- Inspect the APK with Android Studio's APK Analyzer to find the biggest contributors

APK size matters for install conversion rates and also affects runtime performance. Smaller APKs mean faster installs, less disk usage, and smaller dex files to load at startup. Every megabyte you shave off is more users who actually complete the download -- especially on slower networks.

### Common Follow-ups

- How does Compose's `LazyColumn` differ from RecyclerView in terms of performance?
- What are startup profiles and how do they differ from baseline profiles?
- How do you detect memory leaks in production?
- What is the difference between `WeakReference` and `SoftReference`?
- How does View recycling work in RecyclerView?
- What's the impact of deep view hierarchies on performance?
- How do you profile native memory usage on Android?
- What is ANR and how do you debug it?
