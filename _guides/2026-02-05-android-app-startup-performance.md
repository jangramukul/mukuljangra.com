---
title: Android App Startup Performance Guide
layout: post
sequence: 63
categories: post
tags:
  - Android
  - Performance
---

The first time I seriously measured our app's cold start time, I was embarrassed. 3.2 seconds. I had assumed it was "fast enough" because it felt quick on my Pixel 7. Then a teammate pulled it up on a Samsung A13, and we both sat there watching the white screen. That moment changed how I think about startup — it's not about what you feel on a flagship device. It's about what the system actually does between the user tapping your icon and the first frame rendering on screen.

Most guides on startup performance start with the App Startup library or tell you to defer initialization. That's surface-level advice. The real wins come from understanding what the system does during those critical seconds — how the Zygote forks your process, how DEX files get loaded and optimized, how ART decides what to compile, and where Baseline Profiles fit into the picture. Once you see the full chain, you stop guessing and start measuring.

## Cold, Warm, and Hot — What Actually Happens

Everyone knows there are three types of app starts, but most developers describe them wrong. A cold start isn't just "the app wasn't in memory." A hot start isn't just "the app was in the background." The distinction comes down to what the system has to recreate.

**Cold start** is the most expensive. Your process doesn't exist. The system has to fork a new process from Zygote, load your APK, create the Application object, initialize ContentProviders, create the Activity, inflate the layout, measure, layout, and draw the first frame. Every one of these steps is a potential bottleneck. On a cold start, ART also has to load DEX files and decide which methods to interpret versus JIT-compile. If you don't have Baseline Profiles installed, the JIT compiler starts from scratch, interpreting bytecode for methods it hasn't seen before.

**Warm start** means the process still exists but the Activity was destroyed. The system doesn't need to fork a process or reinitialize the Application. It recreates the Activity, which means `onCreate` → `onStart` → `onResume` still runs, but the DEX is already loaded, the JIT cache is warm, and your singletons are alive. Warm starts are typically 40-60% faster than cold starts because the heaviest work is already done.

**Hot start** is the cheapest. The process is alive, the Activity is alive but was stopped. The system just calls `onRestart` → `onStart` → `onResume`. No creation, no inflation. The main cost here is any work you trigger in `onResume`, so keep that lifecycle callback lean.

## The Zygote and Process Creation

Here's the layer most developers never look at. Every Android app process is forked from the Zygote process, which is a pre-initialized ART VM that starts when the device boots. The Zygote has already loaded the Android framework classes, initialized the core libraries, and set up the runtime. When your app starts cold, the system calls `fork()` on the Zygote, which creates a copy-on-write clone. This is why cold starts are measured in seconds, not tens of seconds — the Zygote gives your process a massive head start by sharing the framework's memory pages.

But here's the thing: everything after the fork is your code's responsibility. The system creates your `Application` class, then initializes every `ContentProvider` declared in your merged manifest. Libraries like Firebase, WorkManager, and analytics SDKs often register their own ContentProviders for auto-initialization. Each one runs `onCreate()` on the main thread before your Activity even starts. I've seen apps with 8-10 auto-initialized ContentProviders adding 200-400ms to cold start before a single line of app code runs.

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

But here's what the docs don't emphasize enough: **App Startup doesn't make initialization faster. It makes it sequential and visible.** The real benefit is that you can now see everything that runs before your first Activity, control the order, and decide what to defer. In our app, replacing 6 auto-initialized ContentProviders with App Startup and deferring 3 non-critical initializers saved ~180ms on cold start. The critical insight was that crash reporting doesn't need to be ready before the first frame — it needs to be ready before the first crash, which gives you a comfortable window to initialize it on a background thread after the UI is up.

## Lazy Initialization Patterns

Deferring work sounds simple, but the details matter. Kotlin's `by lazy` is the most straightforward tool — it delays initialization until the first access. But where and how you use it makes a big difference. I've seen teams slap `by lazy` on everything in `Application.onCreate()` and call it a day. That works until you realize some of those lazy properties get accessed during `Activity.onCreate()`, which means you've moved the cost from one main thread callback to another without actually saving anything.

The real power comes from combining lazy delegates with dependency injection. If you're using Hilt, you can inject `Provider<T>` instead of `T` directly, which gives you explicit control over when the object gets created without changing the DI graph. Here's a pattern we used for deferring our HTTP client setup until the first network call:

```kotlin
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val productRepoProvider: Provider<ProductRepository>,
    private val analyticsProvider: Provider<AnalyticsTracker>
) : ViewModel() {

    private val productRepo by lazy { productRepoProvider.get() }

    fun loadProducts() {
        viewModelScope.launch {
            val products = productRepo.fetchFeatured()
            // Analytics initialized only when actually needed
            analyticsProvider.get().trackScreenView("home")
        }
    }
}
```

The other technique worth knowing is deferring work to after the first frame. There are two common approaches: `window.decorView.post { }` and `Choreographer.getInstance().postFrameCallback { }`. They sound similar but behave differently. `decorView.post` queues a `Runnable` on the view's message queue, which runs after the view is attached and laid out — typically after the first frame. `Choreographer.postFrameCallback` fires on the next vsync signal, which is more precise but can run before the first frame if the view hierarchy hasn't finished layout yet. In practice, I prefer `decorView.post` for startup deferral because it guarantees the first frame has been dispatched to the display before your deferred work runs.

## The Splash Screen API

Before Android 12, most apps either showed a blank window during cold start or implemented a custom splash Activity. The custom Activity approach had a real cost — it meant the system had to create two Activities instead of one, adding its own overhead to the startup path. Starting with Android 12, the system automatically shows a splash screen built from your app icon and `windowBackground` on every cold and warm start. You don't opt into it — it just happens.

The `SplashScreen` compat library (`androidx.core:core-splashscreen`) backports this behavior to API 23+. The key integration point is `installSplashScreen()`, which you call in your Activity's `onCreate` before `super.onCreate()`. What most developers miss is that this API isn't just cosmetic — it gives you a clean mechanism to hold the splash screen while critical data loads, replacing the old pattern of custom splash Activities with loading spinners.

Here's how we integrated it with our ViewModel's initialization state using `setKeepOnScreenCondition`:

```kotlin
class HomeActivity : ComponentActivity() {
    private val viewModel: HomeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)

        // Hold splash screen until initial data is ready
        splashScreen.setKeepOnScreenCondition {
            viewModel.uiState.value is HomeUiState.Loading
        }

        splashScreen.setOnExitAnimationListener { splashView ->
            val fadeOut = ObjectAnimator.ofFloat(
                splashView, View.ALPHA, 1f, 0f
            )
            fadeOut.duration = 300L
            fadeOut.doOnEnd { splashView.remove() }
            fadeOut.start()
        }

        setContent {
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            HomeScreen(state = state)
        }
    }
}
```

`setKeepOnScreenCondition` works by adding an `OnPreDrawListener` internally — as long as the condition returns `true`, the system suppresses drawing, keeping the splash screen visible. The moment your ViewModel flips to a loaded state, the condition returns `false`, the first frame draws, and the exit animation fires. This is much cleaner than the old pattern of `SplashActivity` → `finish()` → `MainActivity`, which added a whole Activity lifecycle to the startup path.

One gotcha: don't load heavy data behind `setKeepOnScreenCondition`. If the user stares at the splash screen for more than a second or two, it feels like the app is frozen. The splash screen should only cover lightweight, fast-completing initialization — config loading, auth token checks, feature flag fetches. For heavier data loading, let the splash dismiss and show a skeleton or loading state in your actual UI.

## Baseline Profiles and Startup Profiles

Baseline Profiles solve the first-launch problem by shipping JIT profile data with your APK. Instead of waiting for the runtime to discover which methods are hot, you tell ART upfront: "these are the methods the user hits during startup and common journeys — AOT-compile them at install time."

When you upload an AAB to the Play Store with a Baseline Profile, the Play Store processes it and includes the profile in the optimized distribution. On the device, ART reads the profile during installation and AOT-compiles the listed methods. The result is that the first cold start after install behaves like a cold start after days of use — the hot methods are already native code.

**Startup Profiles** are related but different. While Baseline Profiles guide runtime AOT compilation, Startup Profiles optimize the DEX file layout at build time. They tell R8 to reorder classes so that classes needed during startup are in the same DEX file and close together. This reduces page faults during class loading by co-locating startup classes. I recommend using both — Baseline Profiles handle the CPU bottleneck (interpretation vs native code), Startup Profiles handle the I/O bottleneck (class loading order).

You generate Baseline Profiles by running an instrumented test that exercises your app's startup and critical journeys:

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

            findObject(By.text("Search")).click()
            device.waitForIdle()

            findObject(By.res("product_list"))
                .scroll(Direction.DOWN, 2f)
            device.waitForIdle()
        }
    }
}
```

The `includeInStartupProfile = true` parameter generates both profiles from the same test run. The Baseline Profile goes into `src/main/baselineProfiles/` and gets bundled with your release APK. The Startup Profile feeds into R8's DEX layout optimization.

## Startup Tracing with Perfetto

All the optimizations above are guesswork without a trace. Perfetto is the platform's tracing tool (Android 10+), and it's the single best tool for understanding where your startup time actually goes. You can capture a startup trace from the command line or through Android Studio's profiler, but I prefer the command line because it gives you more control over the trace configuration.

To capture a cold start trace, force-stop the app first, start the trace, then launch:

```kotlin
// Terminal commands (not Kotlin — shown for clarity)
// adb shell am force-stop com.example.shopapp
// adb shell perfetto -o /data/misc/perfetto-traces/startup.perfetto-trace \
//   -t 10s -b 32mb \
//   --app com.example.shopapp \
//   sched freq idle am wm gfx view binder_driver hal dalvik camera input res
// adb shell am start -n com.example.shopapp/.HomeActivity
// adb pull /data/misc/perfetto-traces/startup.perfetto-trace
```

Open the `.perfetto-trace` file at [ui.perfetto.dev](https://ui.perfetto.dev) and look for the "Android App Startups" row — this shows the entire startup duration as a single slice. Pin that row and then expand your app's process to zoom into the main thread. The slices you care about are `bindApplication` (Application creation and ContentProvider init), `activityStart` and `activityResume` (Activity lifecycle), and `inflate` (layout inflation). JIT compilation shows up as `JIT compiling` slices on a background thread — if you see heavy JIT activity overlapping with your main thread work, that's a sign your Baseline Profiles aren't covering enough methods.

The reframe moment for me was seeing our `bindApplication` slice was 900ms, and over half of that was ContentProvider initialization I didn't even know about. No amount of Activity-level optimization would have fixed that. The trace told me exactly where to look, and the fix (migrating to App Startup and deferring three initializers) was straightforward once I could see the problem.

## How We Got from 3.2s to 1.1s

On that project I mentioned, we took a methodical approach to cold start optimization. Every change was measured on a mid-range device (Samsung Galaxy A23, Android 13) with `CompilationMode.None`.

**Starting point: 3.2 seconds cold start.**

**Step 1: Audit ContentProvider initialization.** We found 7 auto-initializing ContentProviders in the merged manifest. Four were libraries we actively used (Firebase, WorkManager, Coil, analytics). Three were transitive dependencies we didn't even know about. We migrated to App Startup and deferred analytics and remote config to post-first-frame. **Saved: ~220ms → ~3.0s.**

**Step 2: Lazy initialization in Application.onCreate().** We were eagerly initializing our DI graph, database, and HTTP client. We moved HTTP client and database behind lazy delegates and `Provider<T>` wrappers, keeping only the DI root component eager (since Activities need it immediately). **Saved: ~280ms → ~2.7s.**

**Step 3: Remove synchronous disk reads.** Perfetto showed SharedPreferences reads blocking the main thread during Activity creation. We migrated the three most accessed preference files to DataStore and loaded them asynchronously. **Saved: ~180ms → ~2.5s.**

**Step 4: Baseline Profiles.** We generated profiles covering startup and the three most common user journeys (home feed scroll, search, product detail). This was the single biggest improvement. **Saved: ~800ms → ~1.7s.**

**Step 5: Reduce initial view complexity.** Our home screen was loading a complex layout with a ViewPager, two RecyclerViews, and a bottom sheet on first frame. We simplified the initial frame to a skeleton UI and loaded full content after the first frame using `window.decorView.post { }`. **Saved: ~350ms → ~1.35s.**

**Step 6: Startup Profile + R8 DEX optimization.** Adding a Startup Profile for DEX layout optimization reduced class loading time. Smallest individual gain, but essentially free. **Saved: ~150ms → ~1.1s.**

With Baseline Profiles installed (simulating a user who got the optimized APK from the Play Store), the cold start measured at approximately 1.1 seconds. On subsequent launches after JIT warming, it was under a second.

## Tradeoffs and What I Got Wrong

Baseline Profiles aren't magic. They increase your APK size slightly (the profile data is typically 50-200KB), and AOT compilation during install takes longer. On low-storage devices, the compiled code takes more space than interpreted bytecode. For most apps, this is a worthwhile tradeoff, but if you're targeting ultra-low-end devices with 8GB storage, be aware of it.

I also initially over-deferred initialization. We deferred our authentication token refresh, which meant the first authenticated API call after a cold start had an extra 400ms latency for token validation. The lesson is: defer initialization based on when the user needs the result, not just "defer everything and hope for the best." Map out your critical path and defer only what's not on it.

The other mistake was measuring only on our test devices. Baseline Profile improvements are more dramatic on lower-end devices with slower CPUs. Our Pixel 7 showed a 20% improvement; the Samsung A23 showed a 45% improvement. Always benchmark on the device tier your users actually have, not the device in your pocket.

## Measuring TTID and TTFD

The metrics that matter for startup are **Time To Initial Display (TTID)** and **Time To Full Display (TTFD)**. TTID is when the system considers your first frame rendered — it gets reported automatically in Logcat with the `Displayed` tag. TTFD is when your app has actually loaded its content and is ready for interaction. For TTFD, you call `reportFullyDrawn()` when your content is loaded.

```kotlin
class HomeActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent {
            val homeState by homeViewModel.uiState
                .collectAsStateWithLifecycle()

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

Don't obsess over TTID while ignoring TTFD. A fast TTID with a skeleton screen that takes 3 seconds to fill with real data isn't a good experience — it's just a fast loading indicator. TTID is about process initialization and first frame rendering. TTFD is about how fast your data layer can deliver content. They're two different problems with two different solution spaces, and optimizing startup means treating both seriously.

The work we did on startup optimization fundamentally changed how I approach performance. It's not about applying tips from blog posts — it's about understanding the system from Zygote fork to first frame, tracing each stage in Perfetto, and making targeted improvements where the data tells you to.

Thanks for reading!
