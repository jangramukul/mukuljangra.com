---
title: "Android Performance Mastery"
layout: course
description: "Optimize every layer — startup time, memory management, rendering performance, battery efficiency, APK size, and profiling with Android Studio tools."
icon: "🚀"
color: "#fb923c"
difficulty: "Intermediate to Expert"
modules: 8
lessons: 38
duration: "5 weeks"
order: 6
tags:
  - Performance
  - Android
  - Optimization
what_you_learn:
  - "Reduce app startup time with lazy initialization and App Startup library"
  - "Profile and fix memory leaks using LeakCanary and Android Profiler"
  - "Optimize rendering — eliminate jank, overdraw, and layout bottlenecks"
  - "Shrink APK size with R8, resource optimization, and dynamic delivery"
  - "Improve battery efficiency with WorkManager and job scheduling"
  - "Use Android Studio profiling tools for CPU, memory, and network analysis"
prerequisites:
  - "Android development experience"
  - "Kotlin fundamentals"
  - "Android Studio installed"
---

## Module 1: Performance Mindset

Performance isn't about micro-optimizations. It's about understanding where time is spent and making data-driven decisions.

### Lesson 1.1: The Performance Budget

Every app has a performance budget whether you define one or not. Users define it with their patience.

- **App startup** — Cold start under 500ms feels instant. Over 2 seconds feels broken
- **Frame rendering** — 16.6ms per frame at 60fps. Miss it and users see jank
- **Touch response** — Under 100ms feels instantaneous. Over 300ms feels laggy
- **Network** — First meaningful content within 1-2 seconds
- **APK size** — Every 6MB increase reduces installs by 1% (Google data)

**Key takeaway:** Measure before optimizing. A profiler tells you where the bottleneck is. Guessing usually leads to optimizing the wrong thing.

### Lesson 1.2: Profiling Tools

- **Android Studio Profiler** — CPU, Memory, Network, Energy in real-time
- **System Trace (Perfetto)** — Low-overhead system-wide tracing
- **Baseline Profiles** — Pre-compiled hot paths for faster startup
- **Macrobenchmark** — Automated startup and scroll performance tests
- **LeakCanary** — Automatic memory leak detection
- **Layout Inspector** — Recomposition counts in Compose

**Key takeaway:** Use the right tool for the right problem. Profiler for CPU/memory, Perfetto for rendering, Macrobenchmark for regression testing.

---

## Module 2: App Startup Optimization

### Lesson 2.1: Cold, Warm, and Hot Start

- **Cold start** — Process not running. Creates Application, launches Activity. Slowest
- **Warm start** — Process alive but Activity destroyed. Recreates Activity
- **Hot start** — Process and Activity alive (from background). Fastest

```kotlin
// Measure startup time in code
class AppStartupListener : Application() {
    override fun onCreate() {
        super.onCreate()
        val startTime = Process.getStartElapsedRealtime()
        // Log or report startup duration
    }
}
```

### Lesson 2.2: Lazy Initialization

```kotlin
// ❌ Initialize everything in Application.onCreate()
class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Analytics.init(this)           // 200ms
        CrashReporter.init(this)       // 150ms
        ImageLoader.init(this)         // 100ms
        Database.init(this)            // 300ms
        // Total: 750ms before first frame
    }
}

// ✅ Lazy initialization — only when needed
class MyApp : Application() {
    val analytics by lazy { Analytics.create(this) }
    val imageLoader by lazy { ImageLoader.create(this) }

    override fun onCreate() {
        super.onCreate()
        // Only critical path: crash reporter
        CrashReporter.init(this)
    }
}
```

### Lesson 2.3: Baseline Profiles

```kotlin
// benchmark/src/main/java/BaselineProfileGenerator.kt
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generateBaselineProfile() {
        rule.collect(packageName = "com.yourapp") {
            // Navigate through critical user journeys
            pressHome()
            startActivityAndWait()

            // Scroll main list
            device.findObject(By.res("main_list"))
                .also { it.setGestureMargin(device.displayWidth / 5) }
                .fling(Direction.DOWN)

            // Navigate to detail
            device.findObject(By.text("First Item")).click()
            device.waitForIdle()
        }
    }
}
```

**What Baseline Profiles do** — They tell the ART runtime which code paths are hot during startup and common user journeys. ART pre-compiles these paths ahead of time, reducing JIT compilation at runtime. Google reports 30-40% startup improvement.

**Key takeaway:** Baseline Profiles are the single biggest startup optimization with the least effort. Add them to every production app.

---

## Module 3: Memory Management

### Lesson 3.1: Android Memory Model

Android uses a managed memory model with garbage collection. But "managed" doesn't mean "worry-free."

- **Heap limit** — Each app gets a fixed heap (128-512MB depending on device)
- **GC pauses** — Garbage collection can pause your app for milliseconds
- **Low memory** — Android kills background apps when memory is low (LMK)

### Lesson 3.2: Common Memory Leaks

```kotlin
// ❌ Leak — Activity reference in singleton
object ImageCache {
    private var context: Context? = null  // Holds Activity!
    fun init(context: Context) {
        this.context = context
    }
}

// ✅ Fix — use Application context
object ImageCache {
    private lateinit var appContext: Context
    fun init(context: Context) {
        appContext = context.applicationContext
    }
}

// ❌ Leak — unregistered listener
class LocationFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        locationManager.requestLocationUpdates(listener)
        // Missing: removeUpdates in onDestroyView
    }
}

// ❌ Leak — inner class holding outer reference
class MyActivity : AppCompatActivity() {
    val handler = Handler(Looper.getMainLooper())
    val runnable = Runnable { updateUI() }  // Holds MyActivity reference

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(runnable)  // Must clean up
    }
}
```

### Lesson 3.3: Bitmap Memory

```kotlin
// Load bitmaps efficiently — don't load full resolution
fun decodeSampledBitmap(res: Resources, resId: Int, reqWidth: Int, reqHeight: Int): Bitmap {
    val options = BitmapFactory.Options().apply {
        inJustDecodeBounds = true  // Get dimensions without loading pixels
    }
    BitmapFactory.decodeResource(res, resId, options)

    options.inSampleSize = calculateInSampleSize(options, reqWidth, reqHeight)
    options.inJustDecodeBounds = false
    return BitmapFactory.decodeResource(res, resId, options)
}

// Use Coil/Glide — they handle this automatically
AsyncImage(
    model = ImageRequest.Builder(LocalContext.current)
        .data(url)
        .size(200, 200)  // Only decode to needed size
        .crossfade(true)
        .build(),
    contentDescription = null
)
```

**Key takeaway:** Images are the biggest memory consumers. Use image loading libraries (Coil, Glide) that handle downsampling, caching, and lifecycle automatically.

---

## Module 4: Rendering Performance

### Lesson 4.1: Understanding Jank

Jank = dropped frames. At 60fps, each frame has 16.6ms. At 120fps, 8.3ms. If your frame takes longer, the user sees stuttering.

**Common causes:**
- Expensive layout calculations (deep view hierarchies)
- Main thread I/O (disk reads, database queries)
- Large bitmap operations on the main thread
- Excessive recomposition in Compose
- Heavy object allocation triggering GC pauses

### Lesson 4.2: Compose Performance

```kotlin
// ❌ Unstable parameter — always recomposes
@Composable
fun UserList(users: List<User>) {  // List is unstable
    LazyColumn {
        items(users) { UserCard(it) }
    }
}

// ✅ Stable parameter — skips recomposition when unchanged
@Composable
fun UserList(users: ImmutableList<User>) {  // ImmutableList is stable
    LazyColumn {
        items(users, key = { it.id }) { UserCard(it) }
    }
}

// ❌ Reading state during composition when only needed in layout
@Composable
fun ScrollHeader(scrollState: ScrollState) {
    val offset = scrollState.value  // Reads in Composition phase
    Box(modifier = Modifier.offset(y = (-offset).dp))
}

// ✅ Defer state read to layout phase
@Composable
fun ScrollHeader(scrollState: ScrollState) {
    Box(modifier = Modifier.offset {
        IntOffset(0, -scrollState.value)  // Reads in Layout phase only
    })
}
```

**Key takeaway:** In Compose, defer state reads to the latest possible phase. Use Layout Inspector's recomposition counter to find composables that recompose too often.

---

## Module 5: Network Performance

### Lesson 5.1: Efficient Network Calls

```kotlin
// ❌ Sequential requests — slow
suspend fun loadDashboard(): Dashboard {
    val user = api.getUser(userId)                  // 200ms
    val orders = api.getOrders(userId)              // 300ms
    val recommendations = api.getRecommendations()  // 250ms
    // Total: 750ms
    return Dashboard(user, orders, recommendations)
}

// ✅ Parallel requests — fast
suspend fun loadDashboard(): Dashboard = coroutineScope {
    val user = async { api.getUser(userId) }
    val orders = async { api.getOrders(userId) }
    val recommendations = async { api.getRecommendations() }
    // Total: 300ms (slowest request)
    Dashboard(user.await(), orders.await(), recommendations.await())
}
```

### Lesson 5.2: Caching Strategies

```kotlin
// OkHttp cache
val client = OkHttpClient.Builder()
    .cache(Cache(
        directory = File(context.cacheDir, "http_cache"),
        maxSize = 50L * 1024 * 1024  // 50 MB
    ))
    .build()

// Cache-Control headers
@Headers("Cache-Control: max-age=300")  // Cache for 5 minutes
@GET("config")
suspend fun getConfig(): Config
```

**Key takeaway:** Cache aggressively. Every avoided network call is faster, cheaper, and works offline.

---

## Module 6: APK Size Optimization

### Lesson 6.1: Analyzing APK Size

```bash
# Generate APK size report
./gradlew :app:analyzeReleaseBundle

# Use Android Studio: Build > Analyze APK
# Shows: DEX files, resources, native libraries, assets
```

### Lesson 6.2: Size Reduction Techniques

- **Enable R8** — removes unused code (20-40% reduction)
- **Remove unused resources** — `shrinkResources true` in build.gradle
- **Use WebP** — 25-34% smaller than PNG with same quality
- **Use vector drawables** — Resolution-independent, tiny file size
- **App Bundle** — Only delivers resources for user's device config

```kotlin
// build.gradle.kts
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

**Key takeaway:** APK size directly impacts install rates. Use App Bundles (AAB), enable R8, shrink resources, and convert images to WebP.

---

## Module 7: Battery Optimization

### Lesson 7.1: Doze Mode and App Standby

Android aggressively limits background work to save battery. Your app must work within these constraints.

- **Doze mode** — Device idle + screen off → network, sync, alarms restricted
- **App Standby Buckets** — Apps ranked by usage → less-used apps get fewer resources
- **Background Execution Limits** — Since Android 8, background services are limited

```kotlin
// Use WorkManager for deferrable background work
val syncWork = OneTimeWorkRequestBuilder<SyncWorker>()
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
    )
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
    .build()

WorkManager.getInstance(context).enqueueUniqueWork(
    "sync",
    ExistingWorkPolicy.REPLACE,
    syncWork
)
```

**Key takeaway:** Use WorkManager for background work. It respects Doze mode, App Standby, and battery optimization automatically. Never use `AlarmManager` or raw `Service` for deferrable work.

---

## Module 8: Performance Testing

### Lesson 8.1: Macrobenchmark

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun startupCompilation() {
        benchmarkRule.measureRepeated(
            packageName = "com.yourapp",
            metrics = listOf(StartupTimingMetric()),
            iterations = 10,
            startupMode = StartupMode.COLD
        ) {
            pressHome()
            startActivityAndWait()
        }
    }

    @Test
    fun scrollPerformance() {
        benchmarkRule.measureRepeated(
            packageName = "com.yourapp",
            metrics = listOf(FrameTimingMetric()),
            iterations = 5
        ) {
            startActivityAndWait()
            val list = device.findObject(By.res("main_list"))
            list.setGestureMargin(device.displayWidth / 5)
            list.fling(Direction.DOWN)
        }
    }
}
```

### Lesson 8.2: Performance CI Pipeline

- Run Macrobenchmark on every PR
- Track startup time, frame timing, memory usage
- Set thresholds — fail CI if startup exceeds 1 second
- Compare against baseline — detect regressions early

**Key takeaway:** Performance testing must be automated. Manual testing catches obvious jank but misses gradual regressions. Macrobenchmark in CI catches problems before users do.

---

Thank You for completing the Android Performance Mastery course! Performance is a feature. Users feel it even when they can't articulate it. 🚀
