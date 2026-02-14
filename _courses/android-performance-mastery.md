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

### Quiz: Performance Mindset

#### What is the frame rendering budget at 60fps?

- ❌ 8.3ms
- ❌ 33.3ms
- ✅ 16.6ms
- ❌ 100ms

> **Explanation:** At 60fps, each frame must render within 1000ms / 60 = 16.6ms. Missing this budget causes dropped frames (jank). 8.3ms is the budget for 120fps displays.

#### Which tool is best for detecting memory leaks automatically?

- ❌ System Trace (Perfetto)
- ❌ Macrobenchmark
- ✅ LeakCanary
- ❌ Layout Inspector

> **Explanation:** LeakCanary is purpose-built for automatic memory leak detection. It monitors object references and notifies you when an object that should be garbage collected is still held in memory.

#### According to Google's data, what happens for every 6MB increase in APK size?

- ❌ Crash rate increases by 1%
- ✅ Installs decrease by 1%
- ❌ Startup time increases by 100ms
- ❌ Battery usage increases by 5%

> **Explanation:** Google's research shows that every 6MB increase in APK size reduces install conversion rates by approximately 1%. This makes APK size a critical business metric, not just a technical one.

### Coding Challenge: Build a Simple Performance Timer

Create a utility class that measures and logs execution time of any code block, similar to how you'd profile specific operations before using a full profiler.

#### Solution

```kotlin
object PerfTimer {
    private val timings = mutableMapOf<String, MutableList<Long>>()

    inline fun <T> measure(tag: String, block: () -> T): T {
        val start = System.nanoTime()
        val result = block()
        val elapsed = (System.nanoTime() - start) / 1_000_000 // Convert to ms
        timings.getOrPut(tag) { mutableListOf() }.add(elapsed)
        Log.d("PerfTimer", "$tag took ${elapsed}ms")
        return result
    }

    fun report(): String {
        return timings.entries.joinToString("\n") { (tag, times) ->
            val avg = times.average()
            val max = times.max()
            val min = times.min()
            "$tag — avg: ${avg}ms, min: ${min}ms, max: ${max}ms, runs: ${times.size}"
        }
    }

    fun clear() = timings.clear()
}

// Usage
val user = PerfTimer.measure("loadUser") {
    repository.getUser(userId)
}
```

This utility helps you identify slow code paths before reaching for heavier profiling tools. The `measure` function uses `inline` to avoid lambda allocation overhead, and tracks multiple runs so you can see averages, not just one-off measurements.

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

### Quiz: App Startup Optimization

#### Which type of app start is the slowest?

- ❌ Hot start
- ❌ Warm start
- ✅ Cold start
- ❌ They are all the same speed

> **Explanation:** Cold start is the slowest because the process is not running at all. Android must create the Application object, launch the Activity, inflate layouts, and draw the first frame — all from scratch.

#### What is the primary benefit of Baseline Profiles?

- ❌ They reduce APK size by removing unused code
- ❌ They cache network responses for offline use
- ✅ They pre-compile hot code paths so ART avoids JIT compilation at runtime
- ❌ They compress images during build time

> **Explanation:** Baseline Profiles tell ART which code paths are frequently used during startup and common user journeys. ART pre-compiles these paths ahead of time (AOT), eliminating JIT compilation delays at runtime. Google reports 30-40% startup improvement.

#### Which initialization strategy best reduces cold start time?

- ❌ Initialize everything in a background thread in Application.onCreate()
- ✅ Use lazy initialization and only init critical-path components eagerly
- ❌ Move all initialization to the first Activity's onCreate()
- ❌ Use a splash screen to hide initialization time

> **Explanation:** Lazy initialization with Kotlin's `by lazy` defers non-critical initialization until the component is actually needed. Only critical-path components (like crash reporting) should initialize eagerly in Application.onCreate(). This directly reduces the time to first frame.

### Coding Challenge: Implement App Startup Library Initializer

Use the AndroidX App Startup library to replace manual ContentProvider-based initialization with a single, ordered initialization sequence.

#### Solution

```kotlin
// Step 1: Define initializers with dependencies
class CrashReporterInitializer : Initializer<CrashReporter> {
    override fun create(context: Context): CrashReporter {
        return CrashReporter.init(context)
    }
    override fun dependencies(): List<Class<out Initializer<*>>> = emptyList()
}

class AnalyticsInitializer : Initializer<Analytics> {
    override fun create(context: Context): Analytics {
        return Analytics.init(context)
    }
    // Analytics depends on CrashReporter being initialized first
    override fun dependencies(): List<Class<out Initializer<*>>> {
        return listOf(CrashReporterInitializer::class.java)
    }
}

// Step 2: Disable auto-init for on-demand initialization
// In AndroidManifest.xml:
// <provider
//     android:name="androidx.startup.InitializationProvider"
//     android:authorities="${applicationId}.androidx-startup"
//     tools:node="merge">
//     <meta-data
//         android:name="com.yourapp.AnalyticsInitializer"
//         tools:node="remove" />
// </provider>

// Step 3: Manually initialize when needed
val analytics = AppInitializer.getInstance(context)
    .initializeComponent(AnalyticsInitializer::class.java)
```

The App Startup library replaces multiple ContentProviders (each adding ~2ms to startup) with a single provider that handles ordered initialization. By disabling auto-init for non-critical components, you can defer them to when they are actually needed.

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

### Quiz: Memory Management

#### Why does storing an Activity context in a singleton cause a memory leak?

- ❌ Singletons are destroyed before Activities
- ❌ Activity contexts are immutable and cannot be stored
- ✅ The singleton outlives the Activity, preventing garbage collection of the entire Activity object graph
- ❌ Android does not allow Context references in static fields

> **Explanation:** A singleton lives for the entire app lifetime. If it holds a reference to an Activity, that Activity (and everything it references — views, drawables, bitmaps) can never be garbage collected even after the Activity is destroyed. Always use `context.applicationContext` in singletons.

#### What does `inJustDecodeBounds = true` do in BitmapFactory.Options?

- ❌ Loads the bitmap with reduced color depth
- ✅ Reads only the image dimensions without loading pixels into memory
- ❌ Compresses the bitmap to reduce file size
- ❌ Enables hardware-accelerated decoding

> **Explanation:** Setting `inJustDecodeBounds = true` lets you read the width and height of an image without allocating memory for the actual pixels. This is the first step in calculating an appropriate `inSampleSize` to downsample the image before loading it.

### Coding Challenge: Build a Lifecycle-Aware Memory Cache

Create a memory cache that automatically clears entries when the app receives a low-memory signal, preventing OOM crashes.

#### Solution

```kotlin
class LifecycleAwareCache<K, V>(
    private val maxSize: Int = 50
) : ComponentCallbacks2 {

    private val cache = object : LinkedHashMap<K, V>(maxSize, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>?): Boolean {
            return size > maxSize
        }
    }

    fun get(key: K): V? = synchronized(cache) { cache[key] }

    fun put(key: K, value: V) = synchronized(cache) { cache[key] = value }

    fun clear() = synchronized(cache) { cache.clear() }

    override fun onTrimMemory(level: Int) {
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE -> {
                // App is in the middle of the LRU list — clear everything
                clear()
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> {
                // App moved to background — drop half the cache
                synchronized(cache) {
                    val entriesToRemove = cache.keys.take(cache.size / 2)
                    entriesToRemove.forEach { cache.remove(it) }
                }
            }
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {}
    override fun onLowMemory() = clear()

    fun register(context: Context) {
        context.applicationContext.registerComponentCallbacks(this)
    }

    fun unregister(context: Context) {
        context.applicationContext.unregisterComponentCallbacks(this)
    }
}

// Usage
val imageCache = LifecycleAwareCache<String, Bitmap>(maxSize = 30)
imageCache.register(applicationContext)
```

This cache uses `ComponentCallbacks2` to listen for system memory pressure signals. When the system is low on memory, it progressively clears entries instead of letting the app crash with an OOM error. The LRU eviction policy ensures least-recently-used items are removed first.

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

### Quiz: Rendering Performance

#### Why does passing `List<User>` to a Composable cause unnecessary recompositions?

- ❌ Lists cannot be used as Composable parameters
- ❌ Lists are too large for the Compose compiler to handle
- ✅ `List` is an unstable type — Compose cannot guarantee it hasn't changed, so it always recomposes
- ❌ Lists trigger garbage collection which causes recomposition

> **Explanation:** Kotlin's `List` interface is considered unstable by the Compose compiler because it could be backed by a `MutableList` that changes between compositions. Using `ImmutableList` from kotlinx-collections-immutable tells the compiler the data won't change, enabling it to skip recomposition when the reference is the same.

#### What is the benefit of using `Modifier.offset { }` (lambda version) over `Modifier.offset(y = value.dp)`?

- ❌ The lambda version uses less memory
- ❌ The lambda version supports animation automatically
- ✅ The lambda version defers the state read to the Layout phase, skipping the Composition phase entirely
- ❌ The lambda version enables hardware acceleration

> **Explanation:** Compose has three phases: Composition → Layout → Drawing. The lambda version of `Modifier.offset { }` reads the state value during the Layout phase, meaning changes to scroll position only trigger Layout and Drawing — not a full recomposition. This is a critical optimization for scroll-driven animations.

#### At 120fps, what is the per-frame rendering budget?

- ❌ 16.6ms
- ✅ 8.3ms
- ❌ 4.2ms
- ❌ 33.3ms

> **Explanation:** At 120fps, each frame must render within 1000ms / 120 = 8.3ms. This is half the budget of 60fps (16.6ms), making rendering optimizations even more critical on modern high-refresh-rate displays.

### Coding Challenge: Optimize a Recomposition-Heavy List

Refactor a poorly performing Compose list that recomposes every item on every state change into an optimized version using stable types, keys, and derivedStateOf.

#### Solution

```kotlin
// ❌ Before: Every item recomposes on any change
@Composable
fun BadTaskList(viewModel: TaskViewModel) {
    val tasks = viewModel.tasks.collectAsState().value  // Unstable List
    val searchQuery = viewModel.searchQuery.collectAsState().value

    LazyColumn {
        items(tasks) { task ->  // No key — position-based
            val isVisible = task.title.contains(searchQuery, ignoreCase = true)
            if (isVisible) {
                TaskRow(task.title, task.isCompleted)
            }
        }
    }
}

// ✅ After: Minimal recomposition with stable types and deferred reads
@Immutable
data class StableTask(
    val id: Long,
    val title: String,
    val isCompleted: Boolean
)

@Composable
fun OptimizedTaskList(viewModel: TaskViewModel) {
    val tasks by viewModel.tasks.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()

    val filteredTasks by remember(tasks, searchQuery) {
        derivedStateOf {
            tasks.filter { it.title.contains(searchQuery, ignoreCase = true) }
                .toImmutableList()
        }
    }

    LazyColumn {
        items(
            items = filteredTasks,
            key = { it.id }  // Stable key — preserves state across reorders
        ) { task ->
            TaskRow(task.title, task.isCompleted)
        }
    }
}

@Composable
private fun TaskRow(title: String, isCompleted: Boolean) {
    // Primitive parameters are always stable — skippable composable
    Row(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Checkbox(checked = isCompleted, onCheckedChange = null)
        Text(text = title, modifier = Modifier.padding(start = 8.dp))
    }
}
```

The key optimizations are: (1) `@Immutable` data class so Compose knows the type is stable, (2) `derivedStateOf` to avoid recomputing the filtered list unless inputs change, (3) `key` in `items()` so Compose can reuse item compositions across list changes, and (4) primitive parameters in `TaskRow` which are inherently stable.

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

### Quiz: Network Performance

#### What is the main advantage of using `async { }` with `coroutineScope` for multiple API calls?

- ❌ It automatically retries failed requests
- ❌ It reduces the total data transferred
- ✅ It runs requests in parallel so total time equals the slowest request, not the sum
- ❌ It compresses request payloads automatically

> **Explanation:** Using `async { }` launches coroutines concurrently within the scope. Three requests taking 200ms, 300ms, and 250ms individually would take 750ms sequentially but only 300ms in parallel (the duration of the slowest request).

#### What does the `Cache-Control: max-age=300` header do?

- ❌ Limits the response payload to 300 bytes
- ❌ Retries the request up to 300 times
- ✅ Tells the HTTP cache to serve the cached response for 300 seconds without revalidating
- ❌ Sets a 300ms timeout for the request

> **Explanation:** `max-age=300` means the response is considered fresh for 5 minutes (300 seconds). During this window, OkHttp serves the cached response directly without making a network call, which is faster and works offline.

### Coding Challenge: Implement an Offline-First Repository

Build a repository that serves cached data immediately while fetching fresh data from the network, following the stale-while-revalidate pattern.

#### Solution

```kotlin
class OfflineFirstRepository(
    private val api: ApiService,
    private val dao: UserDao,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    fun getUsers(): Flow<Resource<List<User>>> = flow {
        // Step 1: Emit cached data immediately
        val cachedUsers = dao.getAllUsers()
        if (cachedUsers.isNotEmpty()) {
            emit(Resource.Success(cachedUsers, fromCache = true))
        } else {
            emit(Resource.Loading)
        }

        // Step 2: Fetch fresh data from network
        try {
            val freshUsers = api.getUsers()
            dao.deleteAllAndInsert(freshUsers)  // Atomic update
            emit(Resource.Success(freshUsers, fromCache = false))
        } catch (e: Exception) {
            if (cachedUsers.isEmpty()) {
                emit(Resource.Error(e, cachedUsers))
            }
            // If we already emitted cache, silently fail
        }
    }.flowOn(dispatcher)
}

sealed class Resource<out T> {
    object Loading : Resource<Nothing>()
    data class Success<T>(val data: T, val fromCache: Boolean) : Resource<T>()
    data class Error<T>(val exception: Exception, val cachedData: T?) : Resource<T>()
}

@Dao
interface UserDao {
    @Query("SELECT * FROM users")
    suspend fun getAllUsers(): List<User>

    @Transaction
    suspend fun deleteAllAndInsert(users: List<User>) {
        deleteAll()
        insertAll(users)
    }

    @Query("DELETE FROM users")
    suspend fun deleteAll()

    @Insert
    suspend fun insertAll(users: List<User>)
}
```

This pattern provides instant UI with cached data, then updates seamlessly when fresh data arrives. The `fromCache` flag lets the UI show a subtle refresh indicator. The atomic `deleteAllAndInsert` prevents showing partial data during updates.

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

### Quiz: APK Size Optimization

#### What percentage of APK size reduction does R8 typically achieve?

- ❌ 5-10%
- ❌ 50-70%
- ✅ 20-40%
- ❌ 80-90%

> **Explanation:** R8 removes unused code (tree shaking), optimizes bytecode, and obfuscates class/method names. This typically reduces DEX file size by 20-40%. Combined with resource shrinking, the total APK size reduction can be significant.

#### What is the advantage of Android App Bundles (AAB) over traditional APKs?

- ❌ AABs are encrypted for better security
- ❌ AABs load faster because they use a different file format
- ✅ AABs only deliver resources matching the user's device configuration (density, ABI, language)
- ❌ AABs bypass Google Play review for faster publishing

> **Explanation:** App Bundles let Google Play generate optimized APKs for each device configuration. A user with an xxhdpi arm64 device only downloads xxhdpi resources and arm64 native libraries, instead of all densities and ABIs. This typically reduces download size by 15-30%.

### Coding Challenge: Detect Unused Resources in a Build Script

Create a Gradle task that scans for potentially unused resources by cross-referencing resource declarations with code references.

#### Solution

```kotlin
// build.gradle.kts — custom task to find large resources
tasks.register("findLargeResources") {
    doLast {
        val resDir = file("src/main/res")
        val largeFiles = mutableListOf<Pair<File, Long>>()

        resDir.walkTopDown()
            .filter { it.isFile }
            .filter { it.extension in listOf("png", "jpg", "jpeg", "webp", "gif") }
            .forEach { file ->
                val sizeKB = file.length() / 1024
                if (sizeKB > 100) {  // Flag images over 100KB
                    largeFiles.add(file to sizeKB)
                }
            }

        if (largeFiles.isEmpty()) {
            println("✅ No oversized resources found")
        } else {
            println("⚠️ Found ${largeFiles.size} resources over 100KB:")
            largeFiles
                .sortedByDescending { it.second }
                .forEach { (file, size) ->
                    val relativePath = file.relativeTo(projectDir)
                    println("  ${size}KB — $relativePath")
                }
            println("\nConsider converting PNG/JPG to WebP or using vector drawables.")
        }
    }
}
```

Run with `./gradlew findLargeResources` to identify image resources that are candidates for WebP conversion or replacement with vector drawables. Images over 100KB are often the lowest-hanging fruit for APK size reduction.

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

### Quiz: Battery Optimization

#### What happens to network access when a device enters Doze mode?

- ❌ Network speed is throttled to 2G
- ❌ Only HTTPS connections are allowed
- ✅ Network access is restricted — deferred until the next maintenance window
- ❌ Network access continues normally

> **Explanation:** In Doze mode (device idle + screen off), Android restricts network access, syncs, alarms, and wakelocks. The system periodically opens brief maintenance windows where deferred work can execute. WorkManager automatically schedules work within these windows.

#### Why should you avoid using AlarmManager for deferrable background work?

- ❌ AlarmManager is deprecated in modern Android
- ✅ AlarmManager doesn't respect Doze mode or App Standby, and WorkManager handles constraints and retries automatically
- ❌ AlarmManager can only schedule work up to 24 hours in advance
- ❌ AlarmManager requires the SCHEDULE_EXACT_ALARM permission

> **Explanation:** WorkManager is the recommended API for deferrable background work because it respects system constraints (Doze, App Standby, battery), handles retries with backoff, supports constraints (network, battery, charging), and works across API levels. AlarmManager is only appropriate for exact-time alarms like calendar events.

#### What are App Standby Buckets?

- ❌ Storage quotas assigned to each app
- ❌ Memory limits based on app priority
- ✅ Usage-based rankings that determine how many system resources (jobs, alarms, network) an app receives
- ❌ Categories of apps based on their Play Store rating

> **Explanation:** Android ranks apps into buckets (Active, Working Set, Frequent, Rare, Restricted) based on how recently and frequently the user interacts with them. Less-used apps get progressively fewer resources — fewer jobs, deferred alarms, and restricted network access.

### Coding Challenge: Implement Battery-Aware Sync with WorkManager

Create a periodic sync worker that adjusts its frequency based on network type and battery state, with proper retry logic and unique work to prevent duplicates.

#### Solution

```kotlin
class SmartSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val repository = AppContainer.syncRepository
            repository.syncAll()
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()  // Exponential backoff kicks in
            } else {
                Result.failure(workDataOf("error" to e.message))
            }
        }
    }
}

object SyncScheduler {
    fun schedulePeriodicSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .setRequiresStorageNotLow(true)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<SmartSyncWorker>(
            repeatInterval = 1, repeatIntervalTimeUnit = TimeUnit.HOURS,
            flexInterval = 15, flexTimeUnit = TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
            .addTag("periodic_sync")
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "data_sync",
            ExistingPeriodicWorkPolicy.KEEP,  // Don't restart if already scheduled
            syncRequest
        )
    }

    fun cancelSync(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork("data_sync")
    }
}
```

The flex interval (15 minutes within each 1-hour period) gives WorkManager freedom to batch this sync with other work, reducing battery impact. `ExistingPeriodicWorkPolicy.KEEP` prevents duplicate schedules. The worker retries up to 3 times with exponential backoff before reporting failure.

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

### Quiz: Performance Testing

#### What does `StartupMode.COLD` measure in a Macrobenchmark test?

- ❌ The time to resume an Activity from the background
- ❌ The time to recreate an Activity after configuration change
- ✅ The full startup time from process creation to first frame rendered
- ❌ The time to load the first network response

> **Explanation:** `StartupMode.COLD` kills the process before each iteration and measures the complete cold start — from process creation, through Application.onCreate(), Activity lifecycle, layout inflation, to the first frame drawn on screen. This is the most comprehensive startup metric.

#### Why should performance benchmarks run in CI rather than manually?

- ❌ CI machines have faster hardware that gives more accurate results
- ❌ Manual benchmarks are not allowed by Google Play policies
- ✅ Automated benchmarks catch gradual regressions that are invisible in manual testing
- ❌ CI benchmarks run on more device configurations simultaneously

> **Explanation:** Performance regressions often happen gradually — a few milliseconds per PR that compound over weeks. Manual testing only catches obvious jank. Automated Macrobenchmark tests with defined thresholds catch these small regressions before they accumulate into user-facing problems.

#### What metric does `FrameTimingMetric()` capture?

- ❌ GPU clock speed during rendering
- ❌ Total number of frames rendered in a session
- ✅ Frame duration for each frame, identifying dropped frames and jank
- ❌ Time between user touch events

> **Explanation:** `FrameTimingMetric()` records how long each frame takes to render. Frames exceeding the budget (16.6ms at 60fps) are flagged as dropped frames. This helps identify scroll jank, animation stuttering, and rendering bottlenecks during automated testing.

### Coding Challenge: Build a Performance Regression Detector

Create a benchmark result comparator that compares current benchmark results against a baseline and fails CI if any metric regresses beyond a defined threshold.

#### Solution

```kotlin
data class BenchmarkResult(
    val testName: String,
    val medianMs: Double,
    val p95Ms: Double,
    val p99Ms: Double
)

class PerformanceRegressionDetector(
    private val maxRegressionPercent: Double = 10.0
) {
    data class Regression(
        val testName: String,
        val metric: String,
        val baseline: Double,
        val current: Double,
        val percentChange: Double
    )

    fun compare(
        baseline: List<BenchmarkResult>,
        current: List<BenchmarkResult>
    ): List<Regression> {
        val baselineMap = baseline.associateBy { it.testName }
        val regressions = mutableListOf<Regression>()

        current.forEach { result ->
            val base = baselineMap[result.testName] ?: return@forEach

            checkMetric(result.testName, "median", base.medianMs, result.medianMs)
                ?.let { regressions.add(it) }
            checkMetric(result.testName, "p95", base.p95Ms, result.p95Ms)
                ?.let { regressions.add(it) }
            checkMetric(result.testName, "p99", base.p99Ms, result.p99Ms)
                ?.let { regressions.add(it) }
        }

        return regressions
    }

    private fun checkMetric(
        testName: String, metric: String,
        baseline: Double, current: Double
    ): Regression? {
        val percentChange = ((current - baseline) / baseline) * 100
        return if (percentChange > maxRegressionPercent) {
            Regression(testName, metric, baseline, current, percentChange)
        } else null
    }

    fun formatReport(regressions: List<Regression>): String {
        if (regressions.isEmpty()) return "✅ No performance regressions detected"

        val report = StringBuilder("❌ Performance regressions detected:\n\n")
        regressions.forEach { r ->
            report.appendLine(
                "  ${r.testName} [${r.metric}]: " +
                "${r.baseline}ms → ${r.current}ms " +
                "(+${"%.1f".format(r.percentChange)}%)"
            )
        }
        report.appendLine("\nThreshold: ${maxRegressionPercent}% max regression allowed")
        return report.toString()
    }
}

// Usage in CI script
val detector = PerformanceRegressionDetector(maxRegressionPercent = 10.0)
val regressions = detector.compare(baselineResults, currentResults)
val report = detector.formatReport(regressions)
println(report)
if (regressions.isNotEmpty()) {
    throw GradleException("Performance regression detected. See report above.")
}
```

This comparator checks median, P95, and P99 latencies against baseline values. A 10% threshold allows for measurement noise while catching real regressions. Integrate this into your CI pipeline by storing baseline results as a JSON file in your repository and comparing each PR's benchmark output against it.

---

Thank You for completing the Android Performance Mastery course! Performance is a feature. Users feel it even when they can't articulate it. 🚀
