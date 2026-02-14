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

The CPU Profiler in Android Studio gives you two very different recording modes, and choosing the wrong one will either mislead you or slow your app to the point where the profile is useless.

**Sample-based recording** periodically captures the call stack at a configurable interval — typically every 1ms or 5ms. The result is a statistical approximation: if method A appears in 300 out of 1000 samples, it was on the CPU roughly 30% of the time. The key insight is that **you're not measuring how long a method takes — you're measuring how often it's on the stack.** The tradeoff is that sampling can miss short-lived methods. If a function executes in 200μs and your sampling interval is 1ms, the sampler might never catch it.

**Method tracing** instruments every method entry and exit. You get precise call counts and exact durations. But here's the thing: **method tracing slows your app by 5-10x.** The absolute times are meaningless — a method showing 50ms might take 5ms in production. The only thing you can trust is relative proportions.

I use sampling for initial investigation — "where is time going?" — and method tracing only when I need exact call counts. If I suspect a method is being called 10,000 times when it should be called once, method tracing gives me that number.

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

### Memory and Network Profiler

The Memory Profiler gets used mostly for finding leaks, but the more valuable use case is understanding **allocation pressure**. When your code creates thousands of short-lived objects in a tight loop, GC pauses stack up and cause jank. On ART, a young-generation GC pause is 2-5ms, but triggering GC every 3-4 frames adds up. The allocation tracking mode shows exactly which methods are allocating and how much per second.

One pattern I've seen repeatedly is string concatenation inside `onDraw()`. Kotlin's string templates compile to `StringBuilder` allocations, and inside draw methods, you're creating garbage 60 times per second. The Memory Profiler makes this obvious — a sawtooth pattern where allocations spike, GC runs, spike again. It also breaks down Java heap, native heap, graphics memory, and stack — when total memory climbs but Java heap looks flat, native memory is usually the culprit.

The Network Profiler rounds out the Android Studio tooling by showing every network request on a timeline — timing, payload size, and thread. It's useful for spotting duplicate requests and identifying calls that happen on the main thread. I find it most useful during startup, where you can see which network calls fire before the first frame.

## Perfetto and Reading Flame Charts

Perfetto is where you go when Android Studio's profilers aren't enough. It's a system-wide tracing tool that captures CPU scheduling, disk I/O, GPU rendering, binder transactions, and custom trace points on a unified timeline. Under the hood, Perfetto uses Linux's `ftrace` infrastructure, hooking into the kernel's scheduler to record exactly when each thread runs and why it's blocked. Traces are stored in protobuf format and opened at `ui.perfetto.dev`. Fair warning: **production traces can hit 100MB+ and the web UI struggles with traces over 200MB.** Keep durations short — 5-10 seconds max.

Now, flame charts. I think flame charts are one of the most misunderstood visualizations in engineering. People see colors and assume "red means hot." Here's what they actually represent: **the x-axis is time, the y-axis is stack depth.** A wider rectangle means longer wall-clock duration. The colors are arbitrary. When reading one, look for: wide rectangles at the bottom (long-running methods responsible for everything above them), deep narrow spikes (deeply nested chains, usually fine unless repeated thousands of times), and gaps on the main thread (blocked on a lock, I/O, or binder transaction).

```kotlin
class PaymentProcessor(
    private val paymentGateway: PaymentGateway,
    private val receiptGenerator: ReceiptGenerator,
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

            return PaymentResult.Success(receipt)
        } finally {
            Trace.endSection()
        }
    }
}
```

`Trace.beginSection` / `Trace.endSection` show up as labeled blocks in both the CPU Profiler's system trace and in Perfetto. Without these, your app's code is a blob of `invokeSuspend` and framework methods. I add these to every critical path — startup, checkout, search — and leave them in production builds. They have near-zero overhead when tracing isn't active because the `Trace` API checks a flag before doing anything.

## Startup Tracing — Finding Where the Seconds Go

Startup is where profiling pays off the most, because cold start involves the entire system: Zygote forks a process, ART loads DEX files, ContentProviders auto-initialize, the Application class runs `onCreate`, and your Activity inflates, measures, and draws the first frame. Any of these stages can be the bottleneck, and without tracing, you're guessing which one.

The practical approach is to capture a Perfetto trace during cold start by configuring the CPU Profiler to start recording on app launch. In the trace, look at the main thread timeline from the first scheduling event to the `Choreographer#doFrame` that renders the first frame — that's your TTID window.

I've found that the biggest cold start killers fall into three categories. First, ContentProvider auto-initialization — libraries like Firebase, WorkManager, and analytics SDKs each run `onCreate()` on the main thread before your Activity even starts. I've seen apps with 8-10 auto-initialized ContentProviders adding 200-400ms. Second, synchronous disk reads — SharedPreferences, database init, or config files on the main thread. Third, eager DI graph initialization in `Application.onCreate()` when most of it isn't needed until later.

The distinction between **TTID** and **TTFD** matters here. TTID (Time to Initial Display) is when the first frame renders — the system reports this automatically in Logcat with the `Displayed` tag. TTFD (Time to Full Display) is when your screen actually has real data and is usable. You signal TTFD by calling `reportFullyDrawn()` on your activity. A fast TTID with a skeleton screen that takes 3 seconds to populate isn't a good user experience — it's just a fast loading indicator.

## Macrobenchmark and Microbenchmark

Android's Jetpack Benchmark library ships two modules that solve completely different problems. Getting them confused leads to bad measurements.

**Macrobenchmark** (`androidx.benchmark:benchmark-macro-junit4`) measures app-level behavior from the outside. It launches your app using UIAutomator, drives real user interactions, and captures system-level metrics via Perfetto traces. `StartupTimingMetric` gives you TTID and TTFD. `FrameTimingMetric` measures frame durations during scrolling and animations. This is what users actually experience. Each iteration takes 10-30 seconds because it's launching a real app on a real device — you can't shortcut this with Robolectric.

**Microbenchmark** (`androidx.benchmark:benchmark-junit4`) runs inside your app's process in a tight loop, measuring a single function in nanoseconds. It handles warmup iterations automatically and reports median and percentile timings. Use it for questions like "is this JSON parser faster than that one?" — only after you've already identified the bottleneck with higher-level tools.

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {

    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun coldStartup() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.shopapp",
            metrics = listOf(StartupTimingMetric()),
            iterations = 10,
            startupMode = StartupMode.COLD,
            compilationMode = CompilationMode.Full(),
        ) {
            pressHome()
            startActivityAndWait()
            device.wait(Until.hasObject(By.res("product_list")), 10_000L)
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

IMO, most teams should start with Macrobenchmark for startup and scroll performance — the two things users notice most — and add Microbenchmark only when they've identified a specific function that's a bottleneck and want to compare alternatives.

## Baseline Profiles — Fixing the First Launch

Here's a pattern that frustrated me for a while: the app would benchmark well after a few runs, but the very first cold start after install was noticeably worse. The reason is ART's compilation strategy. On first install, most of your code starts in interpreted mode. As the user runs the app, ART's JIT compiler identifies hot methods and compiles them to native code. After the device is idle and charging, a background `dex2oat` job AOT-compiles what the JIT identified as hot. So your app gets faster over days of use — but the first launch, when the user forms their impression, is always the worst.

**Baseline Profiles solve this by shipping JIT profile data with your APK.** Instead of waiting for the runtime to discover which methods are hot, you tell ART upfront: "these methods are used during startup and common journeys — AOT-compile them at install time." According to the official docs, Baseline Profiles improve code execution speed by about 30% from the first launch by skipping interpretation and JIT steps for included code paths.

You generate Baseline Profiles using `BaselineProfileRule` in a Macrobenchmark module. The test exercises your app's startup and critical user journeys, and the rule records which methods execute:

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

            findObject(By.res("product_list")).scroll(Direction.DOWN, 2f)
            device.waitForIdle()
        }
    }
}
```

The `includeInStartupProfile = true` parameter generates both a Baseline Profile and a Startup Profile from the same run. The Baseline Profile guides runtime AOT compilation. The Startup Profile tells R8 to reorder classes in the DEX file so startup-critical classes are close together, reducing page faults during class loading. Together they cover both CPU (interpretation vs native code) and I/O (class loading order).

The tradeoff is real but small. Baseline Profiles increase APK size by 50-200KB and AOT compilation during install takes slightly longer. On a project I worked on, generating profiles for startup plus three user journeys dropped cold start from ~3.0s to ~1.7s on a mid-range Samsung device — the single biggest improvement in our optimization effort, bigger than all the code changes combined.

To measure the impact, run your Macrobenchmark with `CompilationMode.None()` (simulating first install without profiles) and `CompilationMode.Partial(baselineProfile = BaselineProfileMode.Require)` (with profiles applied). The difference between those two numbers is your Baseline Profile's value in milliseconds.

## CI Benchmarking and Regression Detection

Having benchmarks you run manually is better than nothing, but it's not much better. Performance regressions slip in one commit at a time — a new interceptor adds 15ms here, a data transformation adds 8ms there — and nobody notices until the app "feels slow" again three months later.

But here's the honest truth: **CI benchmarking on Android is hard, and the results are often noisy.** Emulators run on shared CI hardware where CPU throttling and virtualization overhead cause significant variance. I've seen the same benchmark report 450ms on one run and 620ms on the next, on the same code. That 38% variance makes it nearly impossible to detect a 10% regression.

Physical devices solve the noise problem but create logistics problems. Firebase Test Lab is, I think, the most practical path — it runs Macrobenchmark on real devices with consistent specs and returns results in JSON you can compare against a baseline. The setup requires a `com.android.test` module, a CI job that runs benchmarks, and a comparison script flagging regressions above a threshold. I use 5-10% for startup metrics and 15-20% for frame timings.

One thing I learned the hard way: **don't run benchmarks in debug builds.** Debug builds have no R8 optimization, debuggable is enabled (which disables ART optimizations), and extra instrumentation is included. The numbers you get have no correlation to production performance.

## The Profiling Hierarchy

Performance tooling on Android isn't one tool — it's a hierarchy, and using the right level matters more than mastering any single tool. Start with **Macrobenchmark** to establish baseline metrics for what users experience. When a benchmark shows a regression, drop into **Perfetto** to understand where time goes at the system level. When you've identified the suspicious component, use the **CPU Profiler** to pinpoint the exact methods. When you've found the bottleneck and want to compare solutions, use **Microbenchmark** to measure alternatives in isolation. Then use **Baseline Profiles** to ship the optimized result to users from day one.

Each tool answers a different question. Macrobenchmark: "is the app fast?" Perfetto: "where is the system spending time?" CPU Profiler: "which methods are responsible?" Microbenchmark: "which implementation is faster?" Trying to use one tool for everything is how you end up with misleading numbers.

The reframe I keep coming back to is this: profiling isn't something you do when performance is bad. It's something you build into your development process so you know when performance changes at all. A team that runs benchmarks on CI and reviews flame charts during code review will catch the 15ms regression before it compounds into the 500ms "feels slow" ticket. A team that only profiles when there's a fire will spend days hunting for a problem that could have been caught in minutes.

Thanks for reading through all of this :), Happy Coding!
