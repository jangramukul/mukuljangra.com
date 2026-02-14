---
title: Android App Startup Performance Guide
layout: post
categories: post
tags:
  - Android
  - Performance
---

The first time I seriously measured our app's cold start time, I was embarrassed. 3.2 seconds. I had assumed it was "fast enough" because it felt quick on my Pixel 7. Then a teammate pulled it up on a Samsung A13, and we both sat there watching the white screen. That moment changed how I think about startup — it's not about what you feel on a flagship device. It's about what the system actually does between the user tapping your icon and the first frame rendering on screen.

Most guides on startup performance start with the App Startup library or tell you to defer initialization. That's surface-level advice. The real wins come from understanding what the system does during those critical seconds — how the Zygote forks your process, how DEX files get loaded and optimized, how ART decides what to compile, and where Baseline Profiles and Startup Profiles fit into the picture. Once you see the full chain, you stop guessing and start measuring.

## Cold, Warm, and Hot — What Actually Happens

Everyone knows there are three types of app starts, but most developers describe them wrong. A cold start isn't just "the app wasn't in memory." A hot start isn't just "the app was in the background." The distinction comes down to what the system has to recreate.

**Cold start** is the most expensive. Your process doesn't exist. The system has to fork a new process from Zygote, load your APK, create the Application object, initialize ContentProviders, create the Activity, inflate the layout, measure, layout, and draw the first frame. Every one of these steps is a potential bottleneck. On a cold start, ART also has to load DEX files and decide which methods to interpret versus JIT-compile. If you don't have Baseline Profiles installed, the JIT compiler starts from scratch, interpreting bytecode for methods it hasn't seen before.

**Warm start** means the process still exists but the Activity was destroyed. The system doesn't need to fork a process or reinitialize the Application. It recreates the Activity, which means `onCreate` → `onStart` → `onResume` still runs, but the DEX is already loaded, the JIT cache is warm, and your singletons are alive. Warm starts are typically 40-60% faster than cold starts because the heaviest work is already done.

**Hot start** is the cheapest. The process is alive, the Activity is alive but was stopped. The system just calls `onRestart` → `onStart` → `onResume`. No creation, no inflation. This usually happens when the user switches back from another app. The main cost here is any work you trigger in `onResume`, so keep that lifecycle callback lean.

## The Zygote and Process Creation

Here's the layer most developers never look at. Every Android app process is forked from the Zygote process, which is a pre-initialized Dalvik/ART VM that starts when the device boots. The Zygote has already loaded the Android framework classes, initialized the core libraries, and set up the runtime. When your app starts cold, the system calls `fork()` on the Zygote, which creates a copy-on-write clone. This is why cold starts are measured in seconds, not tens of seconds — the Zygote gives your process a massive head start by sharing the framework's memory pages.

But here's the thing: everything after the fork is your code's responsibility. The system creates your `Application` class, then initializes every `ContentProvider` declared in your merged manifest. This is where a lot of hidden startup cost lives. Libraries like Firebase, WorkManager, and analytics SDKs often register their own ContentProviders for auto-initialization. Each one runs `onCreate()` on the main thread before your Activity even starts. I've seen apps with 8-10 auto-initialized ContentProviders adding 200-400ms to cold start before a single line of app code runs.

## The App Startup Library Fix

The Jetpack App Startup library exists specifically to solve the ContentProvider problem. Instead of each library registering its own ContentProvider, they all share a single one (`InitializationProvider`), and you define initialization order through `Initializer` interfaces with dependency graphs.

```kotlin
class AnalyticsInitializer : Initializer<AnalyticsClient> {
    override fun create(context: Context): AnalyticsClient {
        val config = AnalyticsConfig.Builder()
            .setEndpoint(BuildConfig.ANALYTICS_URL)
            .setFlushInterval(30_000)
            .build()
        return AnalyticsClient.initialize(context, config)
    }

    override fun dependencies(): List<Class<out Initializer<*>>> {
        return listOf(WorkManagerInitializer::class.java)
    }
}
```

But here's what the docs don't emphasize enough: **App Startup doesn't make initialization faster. It makes it sequential and visible.** The real benefit is that you can now see everything that runs before your first Activity, control the order, and decide what to defer. In our app, replacing 6 auto-initialized ContentProviders with App Startup and deferring 3 non-critical initializers (analytics, remote config, crash reporting) saved ~180ms on cold start. The critical insight was that crash reporting doesn't need to be ready before the first frame — it needs to be ready before the first crash, which gives you a comfortable window to initialize it on a background thread after the first frame.

## DEX Optimization and How ART Loads Your Code

When your APK is installed, ART processes the DEX files through several compilation strategies. Understanding these strategies explains why your app is slower on first launch after install than on subsequent launches, and why Baseline Profiles make such a dramatic difference.

ART has four execution modes for DEX bytecode. **Interpreted** means bytecode is executed directly by the interpreter — this is the slowest mode. **JIT-compiled** means the method has been compiled to native code at runtime by the just-in-time compiler — faster, but the compilation itself costs CPU time. **AOT-compiled** means the method was compiled ahead-of-time during installation or by the background dex2oat service — this is the fastest mode. **Baseline Profile-guided AOT** means the method was AOT-compiled because a Baseline Profile told ART this method is used during startup or common user journeys.

On first install, most of your code starts in interpreted mode. As the user runs the app, ART's JIT compiler identifies hot methods and compiles them. After the device is idle and charging, a background job runs `dex2oat` to AOT-compile methods that the JIT identified as hot, using the profile data collected at runtime. This is called profile-guided compilation, and it's why your app gets faster over a few days of use.

The problem is obvious: the first launch is always the worst, and the first launch is exactly when the user forms their impression of your app.

## Baseline Profiles and Startup Profiles

Baseline Profiles solve the first-launch problem by shipping JIT profile data with your APK. Instead of waiting for the runtime to discover which methods are hot, you tell ART upfront: "these are the methods the user hits during startup and common journeys — AOT-compile them at install time."

When you upload an APK or AAB to the Play Store with a Baseline Profile, the Play Store processes it and includes the profile in the optimized distribution. On the device, ART reads the profile during installation and AOT-compiles the listed methods. The result is that the first cold start after install behaves like a cold start after days of use — the hot methods are already compiled to native code.

**Startup Profiles** are related but different. While Baseline Profiles guide runtime AOT compilation, Startup Profiles optimize the DEX file layout at build time. They tell R8 to reorder classes in the DEX file so that classes needed during startup are in the same DEX file and close together. This matters because reading from disk is sequential, and if your startup-critical classes are scattered across multiple DEX files, the system has to seek around the APK. Startup Profiles reduce the number of page faults during class loading by co-locating startup classes.

In practice, I recommend using both. Baseline Profiles handle runtime performance; Startup Profiles handle I/O during class loading. Together, they cover the two main bottlenecks: CPU (interpretation vs native code) and disk (class loading order).

## Generating Baseline Profiles with Macrobenchmark

You generate Baseline Profiles by running an instrumented test that exercises your app's startup and critical journeys. The Macrobenchmark library records which methods are executed and generates a profile file.

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun startupCompilationNone() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.shopapp",
            metrics = listOf(StartupTimingMetric()),
            iterations = 10,
            compilationMode = CompilationMode.None(),
            startupMode = StartupMode.COLD,
        ) {
            pressHome()
            startActivityAndWait()
        }
    }

    @Test
    fun startupCompilationBaselineProfile() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.shopapp",
            metrics = listOf(StartupTimingMetric()),
            iterations = 10,
            compilationMode = CompilationMode.Partial(
                baselineProfile = BaselineProfileMode.Require
            ),
            startupMode = StartupMode.COLD,
        ) {
            pressHome()
            startActivityAndWait()
        }
    }
}
```

The `CompilationMode.None()` test gives you the baseline — this is what the user sees on first install without Baseline Profiles. The `CompilationMode.Partial` test shows the improvement with Baseline Profiles applied. The difference between these two numbers is your Baseline Profile's value, measured in milliseconds.

For generating the profile itself, use the BaselineProfileRule:

```kotlin
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generateProfile() {
        rule.collect(
            packageName = "com.example.shopapp",
            includeInStartupProfile = true,
        ) {
            pressHome()
            startActivityAndWait()

            // Exercise critical user journeys
            findObject(By.text("Search")).click()
            device.waitForIdle()

            findObject(By.res("product_list")).scroll(Direction.DOWN, 2f)
            device.waitForIdle()
        }
    }
}
```

The `includeInStartupProfile = true` parameter generates both a Baseline Profile and a Startup Profile from the same test run. The Baseline Profile goes into `src/main/baselineProfiles/` and gets bundled with your release APK. The Startup Profile feeds into R8's DEX layout optimization.

## How We Got from 3.2s to 1.1s

On that project I mentioned, we took a methodical approach to cold start optimization. Here's what we measured and what each change contributed, tested on a mid-range device (Samsung Galaxy A23, Android 13).

**Starting point: 3.2 seconds cold start** (CompilationMode.None, no Baseline Profiles).

**Step 1: Audit ContentProvider initialization.** We found 7 auto-initializing ContentProviders in the merged manifest. Four were libraries we actively used (Firebase, WorkManager, Coil, analytics). Three were transitive dependencies we didn't even know about. We migrated to App Startup and deferred analytics and remote config to post-first-frame initialization. **Saved: ~220ms. New time: ~3.0s.**

**Step 2: Lazy initialization in Application.onCreate().** We were eagerly initializing our DI graph, database, and HTTP client in `Application.onCreate()`. We moved HTTP client and database initialization behind lazy delegates and only initialized the DI root component eagerly (since Activities need it immediately). **Saved: ~280ms. New time: ~2.7s.**

**Step 3: Remove synchronous disk reads on the main thread.** Systrace showed SharedPreferences reads blocking the main thread during Activity creation. We migrated the three most accessed preference files to DataStore and loaded them asynchronously. One preference file that was only needed for a settings screen was loaded lazily on navigation. **Saved: ~180ms. New time: ~2.5s.**

**Step 4: Baseline Profiles.** We generated profiles covering startup and the three most common user journeys (home feed scroll, search, product detail). This was the single biggest improvement. **Saved: ~800ms. New time: ~1.7s.**

**Step 5: Reduce initial view complexity.** Our home screen was loading and rendering a complex layout with a ViewPager, two RecyclerViews, and a bottom sheet on first frame. We simplified the initial frame to show only the skeleton UI — a lightweight placeholder — and loaded the full content after the first frame rendered using `window.decorView.post { }`. **Saved: ~350ms. New time: ~1.35s.**

**Step 6: Startup Profile + R8 DEX optimization.** Adding a Startup Profile for DEX layout optimization reduced class loading time. This was the smallest individual gain, but it was essentially free. **Saved: ~150ms. New time: ~1.1s (CompilationMode.None).**

With Baseline Profiles already installed (simulating a user who got the optimized APK from the Play Store), the cold start measured at approximately 1.1 seconds. On subsequent launches after JIT warming, it was under a second.

## Tradeoffs and What I Got Wrong

Baseline Profiles aren't magic. They increase your APK size slightly (the profile data is typically 50-200KB), and AOT compilation during install takes longer. On low-storage devices, the compiled code takes more space than interpreted bytecode. For most apps, this is a worthwhile tradeoff, but if you're targeting ultra-low-end devices with 8GB storage, be aware of it.

I also initially over-deferred initialization. We moved crash reporting to background initialization, which was fine — but we also deferred our authentication token refresh, which meant the first authenticated API call after a cold start had an extra 400ms latency for token validation. The lesson is: defer initialization based on when the user needs the result, not just "defer everything and hope for the best." Map out your critical path and defer only what's not on it.

The other mistake was measuring only on our test devices. Baseline Profile improvements are more dramatic on lower-end devices with slower CPUs. Our Pixel 7 showed a 20% improvement; the Samsung A23 showed a 45% improvement. Always benchmark on the device tier your users actually have, not the device in your pocket.

## Measuring What Matters

The metric that matters for startup is **Time To Initial Display (TTID)** and **Time To Full Display (TTFD)**. TTID is when the system considers your first frame rendered. TTFD is when your app has actually loaded its content and is ready for interaction. The system reports TTID automatically in Logcat with the `Displayed` tag. For TTFD, you call `reportFullyDrawn()` when your content is loaded.

```kotlin
class HomeActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val homeState by homeViewModel.uiState.collectAsStateWithLifecycle()

            LaunchedEffect(homeState) {
                if (homeState is HomeUiState.Loaded) {
                    reportFullyDrawn()
                }
            }

            HomeScreen(state = homeState)
        }
    }
}
```

Don't obsess over TTID while ignoring TTFD. A fast TTID with a skeleton screen that takes 3 seconds to fill with real data isn't a good user experience — it's just a fast loading indicator. Both metrics matter, and optimizing them requires different strategies. TTID is about process initialization and first frame rendering. TTFD is about how fast your data layer can deliver content. They're two different problems with two different solution spaces.

The work we did on startup optimization fundamentally changed how I approach performance. It's not about applying tips from blog posts — it's about understanding the system from Zygote fork to first frame, measuring each stage, and making targeted improvements where the data tells you to.

Thanks for reading!
