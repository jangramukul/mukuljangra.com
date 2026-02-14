---
title: Application Level Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
---

A while back, I was working on a production app that had about twelve ContentProviders registered in the manifest — most of them just for initializing third-party SDKs. Cold start was sitting at nearly 3 seconds on mid-range devices. The profiler showed that a huge chunk of that time was spent in `Application.onCreate()` doing synchronous init work that didn't even need to happen at launch. That experience completely changed how I think about application-level configuration. It's not glamorous work, but getting your app's foundation right — startup, memory, build config, crash prevention — is what separates a smooth production app from one that's constantly fighting fires.

Here's the thing: most Android developers focus heavily on UI and architecture patterns, but the application layer is where silent performance killers live. ANRs, leaked resources, bloated startup sequences, misconfigured ProGuard rules — these are the issues that show up in production and are painful to debug after the fact. I've learned it's much cheaper to get these right upfront.

## App Startup Library

Before the **App Startup** library existed, the standard pattern for SDK initialization was to register a ContentProvider in the manifest. Firebase, WorkManager, and dozens of other libraries each registered their own ContentProvider, and the system instantiated all of them before `Application.onCreate()` even ran. On a large app with 10+ libraries doing this, you're paying a real cost — each ContentProvider goes through `onCreate()` sequentially, and that time adds up fast.

The App Startup library from Jetpack replaces this pattern with a single ContentProvider (`InitializationProvider`) that coordinates all your initializers through the `Initializer<T>` interface. You implement `create()` to do your init work and `dependencies()` to declare what must initialize first. The framework topologically sorts your initializers and runs them in the correct order.

```kotlin
class AnalyticsInitializer : Initializer<AnalyticsClient> {
    override fun create(context: Context): AnalyticsClient {
        val config = AnalyticsConfig.Builder()
            .setTrackingEnabled(!BuildConfig.DEBUG)
            .setSessionTimeout(30_000L)
            .build()
        return AnalyticsClient.initialize(context, config)
    }

    override fun dependencies(): List<Class<out Initializer<*>>> {
        // Analytics depends on crash reporting being set up first
        return listOf(CrashReportingInitializer::class.java)
    }
}

class CrashReportingInitializer : Initializer<CrashReporter> {
    override fun create(context: Context): CrashReporter {
        return CrashReporter.init(context, enableInDebug = false)
    }

    override fun dependencies(): List<Class<out Initializer<*>>> {
        return emptyList()
    }
}
```

In practice, I use this for analytics, crash reporting, and logging setup. One thing to note — if you're using Hilt or Koin for DI, don't initialize your DI container through App Startup. The DI container usually needs to be available in `Application.onCreate()` before anything else, and mixing it with App Startup's dependency graph creates ordering headaches. Keep DI init in `Application.onCreate()` and use App Startup for everything else.

## StrictMode for Catching Silent Issues

**StrictMode** is one of those tools that every Android developer knows about but very few actually enable. I ignored it for years. Then I turned it on in a project and immediately found three places where we were reading SharedPreferences on the main thread during fragment transitions. Those reads were taking 8-15ms each — not enough to cause a visible jank individually, but they stacked up.

StrictMode has two policies: **ThreadPolicy** catches things you shouldn't do on the main thread (disk reads/writes, network calls, custom slow calls), and **VmPolicy** catches resource leaks (unclosed cursors, leaked SQLite objects, non-SDK API usage). You should only enable it in debug builds — it's a diagnostic tool, not a production guard.

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectDiskReads()
                    .detectDiskWrites()
                    .detectNetwork()
                    .penaltyLog()
                    .penaltyFlashScreen() // red border flash on violation
                    .build()
            )
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder()
                    .detectLeakedClosableObjects()
                    .detectLeakedSqlLiteObjects()
                    .detectActivityLeaks()
                    .penaltyLog()
                    .build()
            )
        }
    }
}
```

The `penaltyFlashScreen()` option is honestly the most useful one during development — it flashes a red border whenever a violation happens, so you catch them while manually testing instead of having to grep through logcat. IMO, every debug build should have StrictMode enabled. The issues it catches — disk I/O on the main thread, leaked Closeable objects — are exactly the kind of bugs that are invisible during development but cause ANRs and memory pressure in production.

## ANR Prevention

An **ANR** (Application Not Responding) dialog appears when the main thread is blocked for more than 5 seconds for input events, or when a BroadcastReceiver doesn't finish `onReceive()` within 10 seconds. These thresholds are enforced by the system, and in modern Android (12+), ANR rates directly affect your app's visibility on the Play Store through the Android vitals dashboard.

The root cause is almost always the same: doing blocking work on the main thread. Database queries, network calls, JSON parsing of large payloads, heavy bitmap decoding — any of these can push you past the 5-second threshold, especially on lower-end devices. The fix is straightforward: move work to a background thread using coroutine dispatchers.

```kotlin
class OrderRepository(
    private val orderDao: OrderDao,
    private val apiService: OrderApiService
) {
    // Wrong: this blocks the main thread if called from a click handler
    // fun getOrderHistory() = orderDao.getAllOrders()

    // Right: explicitly dispatch to IO
    suspend fun getOrderHistory(): List<Order> =
        withContext(Dispatchers.IO) {
            val cached = orderDao.getAllOrders()
            if (cached.isEmpty()) {
                val remote = apiService.fetchOrders()
                orderDao.insertAll(remote)
                remote
            } else {
                cached
            }
        }
}
```

For BroadcastReceivers, the approach is different — you can't just launch a coroutine because the receiver's lifecycle ends when `onReceive()` returns. Use `goAsync()` to get a `PendingResult` that extends the window, then complete it from a coroutine. But honestly, for any real background work triggered by a broadcast, I just delegate to WorkManager and keep the receiver itself lightweight.

## Memory Optimization

Memory issues are sneaky because they don't crash your app immediately — they degrade performance gradually until the GC starts thrashing or the system kills your process. The biggest offenders I've seen in production are **bitmap handling** and **view-related leaks**.

For bitmaps, always use a library like Coil or Glide that handles downsampling and memory caching for you. If you're decoding bitmaps manually for some reason, use `BitmapFactory.Options` with `inSampleSize` to load a downscaled version that matches your ImageView's actual dimensions. Loading a 4000x3000 camera photo into a 400x300 thumbnail view wastes roughly 45MB of memory for no reason.

The `onTrimMemory()` callback in your Application class is something most developers ignore, but it's your chance to voluntarily release resources before the system force-kills your process. When you receive `TRIM_MEMORY_RUNNING_LOW` or `TRIM_MEMORY_UI_HIDDEN`, clear image caches, release pooled objects, and drop any data you can reconstruct later. Apps that respond to trim callbacks survive in the background longer because the LMK (Low Memory Killer) scores them more favorably.

One thing I'd caution against: don't set `android:largeHeap="true"` in your manifest unless you genuinely need it (like a photo editing app or a PDF renderer). It increases your heap limit but also increases GC pause times because there's more memory to scan. I've seen teams use it as a band-aid for memory leaks, and it just delays the inevitable OOM while making GC pauses worse in the meantime.

## ProGuard and R8 Configuration

**R8** is the default code shrinker and optimizer that replaced ProGuard in AGP 3.4+. It does three things: **shrinking** (removing unused classes, methods, and fields), **obfuscation** (renaming identifiers to short names like `a`, `b`, `c`), and **optimization** (inlining methods, removing dead branches, merging classes). On a typical app, R8 can reduce the DEX file size by 20-40%.

The tricky part is writing **keep rules** correctly. R8 uses static analysis to determine what's reachable, but it can't see dynamic references — reflection, JNI calls, serialization, and XML-referenced classes are all invisible to its analysis. If R8 removes or renames something that's accessed reflectively, you get a `ClassNotFoundException` or `NoSuchMethodException` at runtime.

```
# proguard-rules.pro

# Keep data classes used with Gson/Moshi reflection-based adapters
-keep class com.myapp.data.model.** { *; }

# Keep classes referenced in AndroidManifest.xml
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver

# Keep Retrofit service interfaces
-keep,allowobfuscation interface com.myapp.network.api.** {
    @retrofit2.http.* <methods>;
}

# Debugging: keep source file and line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

That last rule — keeping `SourceFile` and `LineNumberTable` — is critical. Without it, your crash reports from production will show obfuscated stack traces with no line numbers, making them nearly impossible to debug. You can use the R8 mapping file (`build/outputs/mapping/release/mapping.txt`) to de-obfuscate crashes, but upload it to your crash reporting tool (Firebase Crashlytics does this automatically with the Gradle plugin). I've seen teams waste days debugging production crashes because they forgot to upload their mapping file.

## Build Variant Management

Android's build system gives you **build types** (debug, release) and **product flavors** (free, paid, staging) as two orthogonal dimensions. Build types control how the app is compiled — debug symbols, minification, signing. Product flavors control what the app contains — different API endpoints, feature flags, branding. The combination of a build type and a flavor creates a **build variant** like `freeDebug` or `paidRelease`.

```kotlin
// build.gradle.kts (app module)
android {
    buildTypes {
        debug {
            isMinifyEnabled = false
            buildConfigField("String", "API_BASE_URL",
                "\"https://staging-api.myapp.com\"")
            buildConfigField("Boolean", "ENABLE_LOGGING", "true")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "API_BASE_URL",
                "\"https://api.myapp.com\"")
            buildConfigField("Boolean", "ENABLE_LOGGING", "false")
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

`buildConfigField` is genuinely useful for environment-specific configuration — API URLs, feature toggles, logging flags. The values get compiled into the `BuildConfig` class, so there's no runtime reflection involved. One mistake I see often: storing signing credentials directly in `build.gradle`. Always pull them from `local.properties` or environment variables. Your `signingConfigs` block should reference `System.getenv("KEYSTORE_PASSWORD")` or read from a properties file that's `.gitignore`d.

## App Initialization Patterns

Here's a pattern I've settled on after working on several production apps: keep `Application.onCreate()` as thin as possible. Initialize your DI container (Hilt handles this automatically with `@HiltAndroidApp`, Koin needs a `startKoin` block), enable StrictMode in debug, and that's it. Everything else goes through App Startup or gets lazily initialized on first access.

**Lazy initialization** is particularly important for SDKs you don't need at launch. If your analytics SDK is only needed when the user reaches a specific screen, don't initialize it in `onCreate()`. Use Kotlin's `lazy` delegate or inject it through your DI graph with a lazy provider. I've measured this approach shaving 200-400ms off cold start times on apps with heavy SDK dependencies.

```kotlin
@HiltAndroidApp
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        enableStrictModeInDebug()
        // That's it. DI is handled by Hilt.
        // SDK init is handled by App Startup.
        // Feature-specific setup is lazy.
    }

    private fun enableStrictModeInDebug() {
        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectAll()
                    .penaltyLog()
                    .build()
            )
        }
    }
}
```

What NOT to do: I've seen `Application.onCreate()` methods that are 200+ lines long — initializing logging, analytics, crash reporting, feature flags, push notifications, A/B testing, ad SDKs, all synchronously on the main thread. Every millisecond you spend in `onCreate()` is a millisecond added to your cold start time. Users notice.

## Startup Profiling and Baseline Profiles

Understanding the difference between **cold**, **warm**, and **hot** starts is essential for optimization. A cold start means your process doesn't exist — the system forks it, creates the Application object, creates the Activity, inflates the layout, and draws the first frame. A warm start means your process exists but the Activity was destroyed, so it recreates the Activity. A hot start just brings an existing Activity to the foreground. Cold starts are the most expensive, often 2-5x slower than hot starts.

**Baseline Profiles** are one of the most impactful optimizations I've used for cold start. They're a list of classes and methods that should be AOT-compiled at install time instead of being JIT-compiled on first use. Google reports 30-40% faster cold start times with Baseline Profiles, and I've seen similar numbers in practice. The Macrobenchmark library generates these profiles automatically by running your app's critical user journeys.

For profiling startup, use Android Studio's **CPU Profiler** with the "Trace System Calls" or "Sample Java Methods" configuration. Start recording before launching the app, and you'll see exactly where time is being spent during cold start. In my experience, the biggest wins usually come from three areas: reducing ContentProvider count (App Startup), deferring SDK initialization (lazy init), and pre-compiling hot paths (Baseline Profiles). These three changes alone took one of my apps from a 2.8-second cold start down to 1.1 seconds on the same device.

Thank You!
