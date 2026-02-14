---
title: Profiling and Benchmarking Android Apps
layout: post
categories: post
tags:
  - Android
  - Performance
  - Testing
---

A few months ago, QA filed a ticket: "The home screen feels slow." No numbers, no reproduction steps, no specific device. Just "feels slow." I did what most developers do — I looked at the code, found a few things that seemed suspicious, optimized a RecyclerView adapter, added some caching, and shipped it. QA tested again. "Still feels slow."

The problem wasn't my fix. The problem was that I had no idea where the time was actually going. I was optimizing by intuition, and my intuition was wrong. When I finally attached the CPU Profiler and recorded a trace, I discovered that 40% of the startup time was spent in a third-party analytics SDK initializing on the main thread — something I never would have guessed by reading the code. The RecyclerView I "optimized" was taking 12ms total. The analytics init was taking 380ms.

That experience changed how I think about performance work. **Profiling tools don't just find problems — they fundamentally change how you reason about performance by showing you where time actually goes, which is almost never where you think.** Without a profiler, you're an engineer debugging a car engine by listening to the sound it makes. With a profiler, you have a diagnostic readout of every component.

## CPU Profiler — Sampling vs Method Tracing

The CPU Profiler in Android Studio gives you two very different recording modes, and choosing the wrong one will either mislead you or slow your app to the point where the profile is useless. Understanding how each mode works at the implementation level matters.

**Sample-based recording** periodically captures the call stack of every thread at a configurable interval — typically every 1ms or 5ms. It doesn't instrument your code at all. The profiler sets up a timer that fires at the sampling interval, snapshots the current stack, and records it. The result is a statistical approximation: if method A appears in 300 out of 1000 samples, it was on the CPU roughly 30% of the time. This is how most production-grade profilers work, and the key insight is that **you're not measuring how long a method takes — you're measuring how often it's on the stack.** A method that runs for 2ms but gets called 500 times will dominate the profile just like a method that runs for 1000ms once.

The tradeoff is that sampling can miss short-lived methods entirely. If a function executes in 200μs and your sampling interval is 1ms, there's a real chance the sampler never catches it on the stack. You'll never know it exists. For most performance work this is fine — you care about the methods that take the most aggregate time, not the ones that execute in microseconds.

**Method tracing** is the opposite approach. It instruments every method entry and exit in your code. The profiler records the exact timestamp when each method starts and when it returns. You get precise call counts and exact durations. But here's the thing most people miss: **method tracing slows your app by 5-10x.** Every single method call now has instrumentation overhead — writing timestamps, maintaining the trace buffer, synchronizing access. The absolute times you see in a method trace are meaningless. A method that shows 50ms in the trace might take 5ms in production. The only thing you can trust is relative proportions — if method A takes 3x longer than method B in the trace, that ratio roughly holds in production too.

I use sampling for initial investigation — "where is time going?" — and method tracing only when I need exact call counts. If I suspect a method is being called 10,000 times when it should be called once, method tracing gives me that number. But I never look at absolute times from a method trace and think they reflect reality.

```kotlin
class TransactionListViewModel(
    private val repository: TransactionRepository,
    private val formatter: CurrencyFormatter,
) : ViewModel() {

    // CPU Profiler revealed this was called once per item per recomposition
    // instead of being cached. 3,000 calls on a list of 50 items.
    fun loadTransactions() = viewModelScope.launch {
        val transactions = repository.getAll()
        val formatted = transactions.map { transaction ->
            // formatter.format() was doing locale lookup on every call
            TransactionUiModel(
                amount = formatter.format(transaction.amount),
                date = formatDate(transaction.timestamp),
                category = transaction.category.displayName,
            )
        }
        _uiState.update { it.copy(transactions = formatted) }
    }
}
```

In this case, sampling showed `CurrencyFormatter.format()` consuming 22% of the frame time. Method tracing revealed it was called 3,000 times for 50 items because the list was recomposing more aggressively than expected. Each approach told a different part of the story.

## Memory Profiler — Beyond Finding Leaks

The Memory Profiler gets used mostly for one thing: finding memory leaks. And it's good at that — you capture a heap dump, look for activities or fragments that shouldn't exist, trace the reference chain back to the root, and fix it. But the more valuable use case, in my experience, is understanding **allocation pressure**.

Allocation pressure is what happens when your code creates thousands of short-lived objects in a tight loop. The objects themselves get garbage collected quickly, but the GC runs take time. On ART, a young-generation GC pause is typically 2-5ms, but if you're triggering GC every 3-4 frames, those pauses stack up and cause visible jank. The Memory Profiler's allocation tracking mode shows you exactly which methods are allocating and how much they're creating per second.

One pattern I've seen repeatedly in production is string concatenation inside draw or layout methods. Kotlin's string templates compile to `StringBuilder` allocations, and if you're building debug strings or formatted labels inside `onDraw()`, you're creating garbage 60 times per second. The Memory Profiler's allocation timeline makes this obvious — you see a sawtooth pattern where allocations spike during drawing, GC runs, allocations spike again. The fix is always the same: pre-allocate, cache, or move the work out of the hot path.

The profiler also shows you the breakdown between Java heap, native heap, graphics memory, and stack. When your app's total memory is climbing but Java heap looks flat, native memory is usually the culprit — bitmap allocations, native libraries, or WebView internals. This distinction matters because Java heap issues respond to standard GC-based fixes, but native leaks require completely different debugging tools like `malloc` tracking or the native memory profiler.

## Perfetto and Reading Flame Charts

Perfetto is where you go when Android Studio's profilers aren't enough. It's a system-wide tracing tool that captures everything — CPU scheduling, disk I/O, GPU rendering, binder transactions, and your app's custom trace points — all on a unified timeline. Under the hood, Perfetto uses Linux's `ftrace` infrastructure. It hooks into the kernel's scheduler to record exactly when each thread is running, when it gets preempted, and why it's blocked. This means you can see things like "my render thread was ready to run but was waiting 8ms for a CPU core because a background service was hogging all four cores."

The traces are stored in a compact protobuf format and opened in the Perfetto UI at `ui.perfetto.dev`. Fair warning: **production traces can easily hit 100MB+ and the web UI will struggle or crash with traces over 200MB.** I've learned to keep trace durations short — 5-10 seconds max — and filter to specific categories. You can use `adb shell perfetto` with a config file to control exactly which data sources you capture.

Now, flame charts. I think flame charts are one of the most misunderstood visualizations in software engineering. People see colors and assume "red means hot" or "wider means worse." Here's what a flame chart actually represents: **the x-axis is time, and the y-axis is stack depth.** Each rectangle is a method on the stack. A wider rectangle means that method was on the stack for a longer wall-clock duration. The colors are arbitrary — they're just there to visually distinguish different stack frames. There's no "hot" or "cold" encoding.

When you're reading a flame chart, look for three things. First, wide rectangles at the bottom of the stack — these are methods that run for a long time and are responsible for everything above them. Second, deep narrow spikes — these are deeply nested call chains that execute quickly, usually not a problem unless they repeat thousands of times. Third, gaps on the main thread timeline — these are periods where the main thread was idle or blocked, often waiting on a lock, I/O, or a binder transaction to another process.

```kotlin
// Custom trace points help you find YOUR code in a Perfetto trace
// that's full of framework and system noise
class PaymentProcessor(
    private val paymentGateway: PaymentGateway,
    private val receiptGenerator: ReceiptGenerator,
    private val analyticsTracker: AnalyticsTracker,
) {

    suspend fun processPayment(order: Order): PaymentResult {
        Trace.beginSection("PaymentProcessor.processPayment")
        try {
            Trace.beginSection("PaymentProcessor.validateOrder")
            val validated = validateOrder(order)
            Trace.endSection()

            Trace.beginSection("PaymentProcessor.chargeGateway")
            val charge = paymentGateway.charge(validated)
            Trace.endSection()

            Trace.beginSection("PaymentProcessor.generateReceipt")
            val receipt = receiptGenerator.create(charge)
            Trace.endSection()

            analyticsTracker.trackPurchase(order.total)
            return PaymentResult.Success(receipt)
        } finally {
            Trace.endSection()
        }
    }
}
```

`Trace.beginSection` / `Trace.endSection` show up as labeled blocks in both the CPU Profiler's system trace and in Perfetto. Without these, your app's code is a blob of `invokeSuspend` and framework methods. With them, you can see exactly how long `chargeGateway` took versus `generateReceipt`. I add these to every critical path — startup, checkout, search — and leave them in production builds. They have near-zero overhead when tracing isn't active because the `Trace` API checks a flag before doing anything.

## Macrobenchmark vs Microbenchmark

Android's Jetpack Benchmark library ships two modules, and they solve completely different problems. Getting them confused leads to bad measurements and worse decisions.

**Microbenchmark** (`androidx.benchmark:benchmark-junit4`) runs inside your app's process, in a tight loop, and measures the execution time of a specific function or code block. It handles warmup iterations automatically, measures in nanoseconds, and reports median and percentile timings. Use it for questions like "is this JSON parser faster than that one?" or "does this sort implementation beat `Collections.sort` for my data shape?" Microbenchmark is a JMH-style benchmarking harness adapted for Android's runtime.

**Macrobenchmark** (`androidx.benchmark:benchmark-macro-junit4`) measures app-level behavior from the outside. It launches your app using UIAutomator, drives real user interactions (scroll, tap, navigate), and captures system-level metrics via Perfetto traces. This is how you measure startup time, frame timings during scrolling, and animation smoothness. Macrobenchmark measures what users actually experience, not what a function does in isolation.

Here's the layer-below detail that matters: Macrobenchmark measures startup using two distinct metrics — **Time to Initial Display (TTID)** and **Time to Full Display (TTFD)**. TTID is when the first frame of your activity is drawn. The system measures this automatically. But TTFD — the moment when your screen is actually usable with real data — requires you to manually signal it by calling `reportFullyDrawn()` on your activity. If you don't call `reportFullyDrawn()`, Macrobenchmark can only report TTID, and your startup metrics will look great while your users stare at a loading spinner for another 2 seconds.

```kotlin
class HomeActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val uiState by homeViewModel.uiState.collectAsStateWithLifecycle()

            LaunchedEffect(uiState) {
                if (uiState is HomeUiState.Loaded) {
                    // Signal that the screen is fully rendered with real data.
                    // Without this, Macrobenchmark only captures TTID, not TTFD.
                    reportFullyDrawn()
                }
            }

            HomeScreen(uiState = uiState)
        }
    }
}
```

The tradeoff with Macrobenchmark is cost. Each iteration takes 10-30 seconds because it's launching a real app, driving UI interactions, and capturing system traces. A benchmark suite with 5 scenarios and 10 iterations each can take 15-20 minutes. Microbenchmark iterations run in microseconds to milliseconds. And Macrobenchmark requires either a physical device or an emulator — it needs a real Android system to capture meaningful traces. You can't shortcut this with Robolectric or a unit test runner.

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {

    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun startupCompilationFull() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.shopapp",
            metrics = listOf(StartupTimingMetric()),
            iterations = 10,
            startupMode = StartupMode.COLD,
            compilationMode = CompilationMode.Full(),
        ) {
            pressHome()
            startActivityAndWait()

            // Wait for the actual content to load, not just the first frame
            device.wait(
                Until.hasObject(By.res("product_list")),
                10_000L,
            )
        }
    }

    @Test
    fun scrollPerformance() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.shopapp",
            metrics = listOf(FrameTimingMetric()),
            iterations = 5,
            startupMode = StartupMode.WARM,
            compilationMode = CompilationMode.Full(),
        ) {
            startActivityAndWait()

            val list = device.findObject(By.res("product_list"))
            list.setGestureMargin(device.displayWidth / 5)
            list.fling(Direction.DOWN)
            device.waitForIdle()
        }
    }
}
```

IMO, most teams should start with Macrobenchmark for startup and scroll performance — the two things users notice most — and add Microbenchmark only when they've identified a specific function that's a bottleneck and want to compare implementation alternatives.

## Making Performance Regression-Proof with CI Benchmarking

Having benchmarks that you run manually is better than nothing, but it's not much better. Performance regressions slip in one commit at a time — a new interceptor adds 15ms here, a data transformation adds 8ms there — and nobody notices until the app "feels slow" again three months later. The way to catch these is to run benchmarks on every PR or at least nightly.

But here's the honest truth: **CI benchmarking on Android is hard, and the results are often noisy.** The fundamental problem is clock speed variation. Emulators run on shared CI hardware where CPU throttling, other workloads, and virtualization overhead cause significant variance between runs. I've seen the same benchmark report 450ms on one run and 620ms on the next, on the same code, on the same CI machine. That 38% variance makes it nearly impossible to detect a real 10% regression.

Physical devices solve the noise problem but create logistics problems. You need dedicated devices connected to your CI system, a lab setup like Firebase Test Lab, or a service like Emerald that provides consistent hardware. Firebase Test Lab works well for Macrobenchmark — it runs on real devices with consistent specs — but it adds cost and complexity to your CI pipeline. I think Firebase Test Lab is the most practical path for most teams. You upload your APK and test APK, specify the device and API level, and get back benchmark results in JSON format that you can compare against your baseline.

The setup requires a separate benchmark module in your project, a CI job that builds and runs the benchmarks, and a comparison script that flags regressions above a threshold. I typically use a 5-10% threshold for startup metrics and 15-20% for frame timings, because frame timing has naturally higher variance.

```kotlin
// benchmark/build.gradle.kts
plugins {
    id("com.android.test")
    id("androidx.benchmark")
}

android {
    namespace = "com.example.shopapp.benchmark"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        targetSdk = 35
        testInstrumentationRunner = "androidx.benchmark.junit4.AndroidBenchmarkRunner"

        // Suppress errors so benchmarks still run on emulators during development.
        // On CI with real devices, remove this to get accurate numbers.
        buildConfigField(
            "Boolean",
            "ENABLE_EMULATOR_BENCHMARKS",
            "true",
        )
    }

    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true
}

dependencies {
    implementation("androidx.benchmark:benchmark-macro-junit4:1.3.3")
    implementation("androidx.test.ext:junit:1.2.1")
    implementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
```

The `com.android.test` plugin creates a separate test module that installs alongside your app and instruments it from outside — this is how Macrobenchmark works. It's a different module type than your regular `androidTest` directory.

One thing I learned the hard way: **don't run benchmarks in debug builds.** Debug builds have no R8 optimization, have debuggable enabled (which disables ART optimizations), and include extra instrumentation. The numbers you get from a debug benchmark have no correlation to production performance. Always benchmark against a release build or a benchmark build type that mirrors your release configuration.

## Putting It All Together

Performance tooling on Android isn't one tool — it's a hierarchy. Start with Macrobenchmark to establish baseline metrics for what users experience: startup time, scroll smoothness, animation frame rates. When a Macrobenchmark shows a regression, drop into Perfetto or the CPU Profiler's system trace to understand where the time is going at the system level. When you've identified the suspicious component, use the CPU Profiler's method trace or sampling mode to pinpoint the exact methods. When you've found the bottleneck and want to compare solutions, use Microbenchmark to measure the alternatives in isolation.

Each tool answers a different question at a different abstraction level. Macrobenchmark answers "is the app fast?" Perfetto answers "where is the system spending time?" CPU Profiler answers "which methods are responsible?" Microbenchmark answers "which implementation is faster?" Trying to use one tool for everything is how you end up with misleading numbers and misguided optimizations.

The reframe I keep coming back to is this: profiling isn't something you do when performance is bad. It's something you build into your development process so you know when performance changes at all. A team that runs benchmarks on CI and reviews flame charts during code review will catch the 15ms regression before it compounds into the 500ms "feels slow" ticket. A team that only profiles when there's a fire will spend days hunting for a problem that could have been caught in minutes.

Thanks for reading through all of this :), Happy Coding!
