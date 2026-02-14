---
title: Baseline Profiles and R8 Optimization Guide
layout: post
categories: post
tags:
  - Android
  - Performance
  - Gradle
---

I noticed it on a Friday afternoon. Our release build — fully signed, minified, everything production-ready — felt sluggish on cold start. The splash screen lingered for nearly two seconds on a mid-range Pixel. Debug builds? Smooth, almost instant. Same device, same code, same network. But release felt like a different app entirely.

My first instinct was to blame ProGuard or R8 for stripping something it shouldn't have. I spent hours checking keep rules, verifying class retention, ensuring nothing critical was being removed. But the problem wasn't code stripping. The problem was something I'd never thought about before: **how ART compiles your app after the user installs it.** That Friday sent me down a rabbit hole into ART's compilation pipeline, Baseline Profiles, and R8 optimization — and what I found changed how I think about Android app performance at the bytecode level.

## How ART Actually Compiles Your App

Most Android developers know that ART replaced Dalvik back in Android 5.0 (Lollipop). But "ART runs your app" is about as useful as saying "the CPU executes instructions." The interesting part is *how* it runs your code, and the answer has changed significantly over the years.

When your app first launches on a device, ART doesn't AOT-compile the entire thing upfront. It starts with **interpretation** — reading dex bytecode and executing it line by line, which is slow. As the app runs, ART's JIT (Just-In-Time) compiler kicks in. The JIT identifies "hot" methods — code paths that execute frequently — and compiles them to native machine code in memory. This compiled code runs much faster than interpreted bytecode, but it only exists in RAM. Kill the app, and you lose all that compiled code.

Here's where it gets interesting. While the JIT is running, ART also collects a **runtime profile** on the device. This profile records which methods were JIT-compiled, which classes were loaded during startup, and how frequently each code path was hit. Over time — usually after the device is idle and charging — ART's background `dex2oat` process takes this profile and performs **profile-guided AOT compilation**. It compiles only the hot methods from the profile into an `.odex` file that persists on disk. The next time the app launches, those methods are already native code — no interpretation, no JIT warmup needed.

This three-stage pipeline — interpret → JIT → profile-guided AOT — is elegant. But it has a massive cold-start problem. On first install, there is no profile. The user's first experience with your app is the worst it will ever be: fully interpreted, no JIT cache, no AOT compilation. The app needs several sessions of real usage before the profile matures enough for `dex2oat` to produce meaningful AOT code. And if the user only opens your app once and decides it's slow? They never get to experience the optimized version.

## The Cloud Profile Problem

Google tried to solve this with **Play Store cloud profiles**. The idea is smart: aggregate runtime profiles from users who already have the app, then distribute the aggregated profile to new users during download. This way, new installs benefit from existing users' usage patterns.

But here's the thing — cloud profiles take **two to three weeks** to propagate after you publish an update. Google needs enough users to generate stable profiles, then the profiles get aggregated and bundled into distribution. If you're shipping weekly releases, your users are running on stale or missing profiles for the first two weeks of every release cycle. For apps with smaller install bases, the cloud profile might never reach critical mass at all.

I've seen this firsthand. We shipped a major refactor that restructured several critical startup paths. For two weeks, cold start times regressed by 400-600ms because the old cloud profiles no longer matched the new code structure. The metrics didn't recover until new profiles propagated. That's when I started taking Baseline Profiles seriously.

## Baseline Profiles — Shortcutting the Cold Start Penalty

Baseline Profiles are the fix for this cold start gap. Instead of waiting for runtime profiles to build up on user devices or cloud profiles to propagate through Play, you **generate the profile at build time and ship it inside the APK itself.** When the app is installed, ART's `dex2oat` reads this bundled profile and immediately AOT-compiles the critical code paths. No waiting, no warmup period, no dependency on user behavior.

The reframe here is subtle but important: **ART doesn't just run your app — it learns from it, profiles it, and recompiles the hot paths into native code over time. Baseline Profiles let you shortcut that entire learning process.** You're telling ART upfront, "these are the methods and classes that matter for startup and core user journeys, compile them now." The user gets the optimized experience from the very first launch.

Google's own benchmarks show **30% or more improvement on cold start times** with Baseline Profiles. In my experience, the improvement varies depending on how much work your app does during startup. Apps with heavy DI initialization (Dagger/Hilt component building, module loading) see massive gains because those code paths are complex and deeply nested — exactly the kind of code that benefits most from AOT compilation.

## Generating and Shipping Baseline Profiles

The Jetpack Macrobenchmark library provides the tooling for generating Baseline Profiles. The basic idea is to write an instrumentation test that exercises your app's critical paths — startup, navigation, scrolling — while the framework records which methods and classes are accessed.

```kotlin
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generateStartupProfile() {
        rule.collect(
            packageName = "com.example.newsreader",
            includeInStartupProfile = true
        ) {
            // Cold start the app
            pressHome()
            startActivityAndWait()

            // Navigate through critical user journeys
            device.findObject(By.res("feed_list"))
                .wait(Until.hasObject(By.res("article_card")), 5_000)

            // Scroll the main feed — this is a hot path
            device.findObject(By.res("feed_list"))
                .scroll(Direction.DOWN, 2.0f)

            // Open an article detail screen
            device.findObject(By.res("article_card")).click()
            device.wait(Until.hasObject(By.res("article_content")), 3_000)
        }
    }
}
```

This test runs on a real device or emulator, and the framework captures the profile data. The generated profile is a text file listing methods and classes with flags indicating whether they should be AOT-compiled or included in the startup image. After generation, the profile gets bundled into your APK via the Baseline Profile Gradle plugin.

In your `app/build.gradle.kts`, you need the plugin and the dependency on your benchmark module:

```kotlin
plugins {
    id("com.android.application")
    id("androidx.baselineprofile")
}

android {
    // ...
}

dependencies {
    baselineProfile(project(":benchmark"))
}

baselineProfile {
    automaticGenerationDuringBuild = true
    saveInSrc = true
}
```

Setting `saveInSrc = true` writes the generated profile to `src/main/baselineProfiles/` so it gets committed to version control. I think this is the right default — you want the profile to be reproducible and reviewable in code review, not silently generated during CI. When `automaticGenerationDuringBuild` is enabled, the profile regenerates on each release build, which is great for keeping it in sync with code changes but adds 5-10 minutes to your build time because it needs to run the instrumentation tests.

One tradeoff worth mentioning: the profile quality depends entirely on how well your generator test covers the critical paths. If you only test cold startup but your users spend most of their time scrolling lists or navigating between tabs, you'll miss the methods that matter most for perceived performance. I've seen teams ship Baseline Profiles that only covered the splash screen, then wonder why scrolling performance didn't improve. The profile is only as good as the journeys you simulate.

## R8 — What It Actually Does to Your Bytecode

Baseline Profiles optimize how ART *compiles* your bytecode. R8 optimizes the bytecode itself *before* it ever reaches the device. They're complementary — R8 makes your app smaller and your bytecode more efficient, Baseline Profiles ensure the most important parts of that bytecode are AOT-compiled from the first launch.

R8 is the default code shrinker, optimizer, and obfuscator for Android release builds. It replaced ProGuard as the default in AGP 3.4, and while it's backward-compatible with ProGuard rules, it does significantly more. At a high level, R8 performs four major optimization passes on your compiled Kotlin/Java bytecode.

**Tree shaking** is the most impactful. R8 starts from your app's entry points — Activities, Services, content providers, anything referenced in the manifest — and traces all reachable code paths. Any class, method, or field that isn't reachable from an entry point gets removed entirely. In a typical app using large libraries like OkHttp, Retrofit, Gson, and AndroidX, tree shaking can remove **30-50% of the total method count**. IMO, this is R8's single biggest win. Most apps ship megabytes of library code they never actually call.

**Code inlining** replaces short method calls with the method body itself. If you have a utility function that just wraps a single expression, R8 can eliminate the method call overhead entirely. This matters more than you'd think on Android — each method invocation has overhead in the dex format (method references, invoke instructions), and Kotlin's extension functions and inline-heavy style generate a lot of small methods.

**Class merging** combines classes that have a single implementation or simple hierarchies into fewer classes. If you have an interface with exactly one implementation, R8 can merge them into one class, eliminating the interface dispatch overhead and reducing the class count.

**Dead code elimination** removes code within methods that can never execute — unreachable branches, unused variables, assignments whose results are never read. Combined with constant propagation, this can simplify complex method bodies significantly.

## R8 Full Mode — Real Numbers, Real Tradeoffs

R8 has two modes: normal (compatible) mode and full mode. Normal mode maintains backward compatibility with ProGuard — it respects all ProGuard rules and avoids optimizations that could break code relying on reflection, serialization, or other dynamic features. Full mode is more aggressive.

In full mode, R8 enables additional optimizations that can break assumptions ProGuard-compatible code makes. The most significant difference: **in full mode, R8 does not preserve class hierarchy for classes that aren't explicitly kept.** If a class isn't referenced through a keep rule or reachable from an entry point, R8 might merge it, inline its methods into callers, or remove it entirely — even if some library tries to access it via reflection at runtime.

```kotlin
// In build.gradle.kts — enabling R8 full mode
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

// In gradle.properties
// android.enableR8.fullMode=true
```

The numbers speak for themselves. On a production app I worked on with roughly 120 third-party dependencies, switching from R8 normal mode to full mode dropped the APK size from 18.2 MB to 12.6 MB — a **31% reduction**. The dex file count went from 3 multi-dex files to 2. Method count dropped by about 40%. Build time increased by roughly 15 seconds because R8 has more optimization passes to run, but for a release build that's negligible.

But — and this is where full mode gets dangerous — it broke three things on our first attempt:

- **Gson deserialization** failed silently. R8 full mode removed the no-arg constructor from a data class used for JSON parsing because it determined the constructor wasn't called from application code. Gson needs that constructor via reflection. No crash, just null fields. We caught it only because a QA engineer noticed missing data on a details screen.
- **Retrofit interface methods** were being inlined in unexpected ways. One of our API interfaces had a method that returned `Response<List<Article>>`. R8 full mode stripped some generic type information that Retrofit's reflection-based converter needed. The fix was a single keep rule, but finding the issue took hours.
- **Firebase Crashlytics** mapping files didn't match the obfuscated stack traces because R8 full mode renamed and merged classes more aggressively than the Crashlytics plugin expected. We had to update the Crashlytics Gradle plugin to a version that understood R8 full mode's output.

The lesson: R8 full mode is absolutely worth the APK size reduction, but **you need comprehensive runtime testing, not just compilation testing.** Code that compiles fine can still break at runtime when R8 removes something that's accessed reflectively. Every serialization library (Gson, Moshi, kotlinx.serialization), every reflection-based framework (Retrofit, Hilt, Room), and every dynamic feature needs careful keep rules.

Here's a reasonable set of keep rules for a typical production app:

```kotlin
// proguard-rules.pro — essential R8 full mode rules

// Keep data classes used for JSON serialization
-keepclassmembers class com.example.newsreader.data.model.** {
    <init>(...);
    <fields>;
}

// Keep Retrofit API interfaces
-keep interface com.example.newsreader.data.api.** { *; }

// Keep classes with @SerializedName annotations
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

// Keep enum values — reflection is used to deserialize enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

// Preserve source file names for Crashlytics stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

## Combining Both for Maximum Impact

The real power comes from using Baseline Profiles and R8 together. R8 removes unused code, inlines small methods, and shrinks the dex files. This means the bytecode that reaches the device is already leaner and more efficient. Baseline Profiles then ensure that the *remaining* critical code paths are AOT-compiled from the first launch, so there's no interpretation overhead for startup and core user journeys.

On the same production app, combining R8 full mode with Baseline Profiles produced these Macrobenchmark results on a Pixel 6a:

- **Cold start time** dropped from 1,840ms to 1,120ms — a **39% improvement**
- **Time to first frame** dropped from 2,400ms to 1,580ms
- **APK size** went from 24.1 MB (no R8, no profiles) to 12.6 MB — the profiles added only ~180 KB
- **Startup profile** covered 847 methods and 312 classes — about 15% of total code but 90%+ of the startup path

But I want to be honest about the build complexity. You now have a benchmark module, generator tests, R8 keep rules, and the baseline profile Gradle plugin — all of which need to stay in sync as your codebase evolves. When we refactored our networking layer, three R8 keep rules became stale and we shipped a build with broken API response parsing. These tools are powerful, but they're not "set and forget."

## What `dex2oat` Does Under the Hood

Going one layer below — when ART receives your APK with a bundled Baseline Profile, what actually happens during installation? The `dex2oat` tool converts dex bytecode to native code. Without a profile, `dex2oat` on modern Android runs in **speed-profile** mode: it only compiles methods that appear in a profile. No profile means nothing gets AOT-compiled at install time.

When a Baseline Profile is present, `dex2oat` reads it and compiles the listed methods using the **optimizing compiler backend**. This backend performs register allocation, instruction scheduling, null check elimination, and bounds check elimination — optimizations the JIT also does, but `dex2oat` can spend more time on them because it runs offline. The output is an `.odex` file and a `.vdex` file stored in the app's data directory.

The critical detail: **profile-guided compilation doesn't just compile the listed methods — it uses the profile to make better inlining decisions.** If the profile says method A always calls method B, the compiler might inline B into A even if B wouldn't normally meet the inlining threshold. This is why Baseline Profiles aren't just "pre-compile everything" — they give the compiler real usage pattern information that produces tighter native code for your hot paths.

## The Key Insight

After going through all of this — ART's compilation pipeline, Baseline Profiles, R8's optimization passes — the thing that stuck with me is how much performance is left on the table by default. Most Android apps ship without Baseline Profiles, run R8 in normal mode, and rely entirely on cloud profiles that take weeks to propagate. The tools exist, they're well-documented, and they produce measurable results. But they require understanding what's happening at the bytecode and runtime level, not just adding a Gradle plugin and hoping for the best.

If you take away one thing from this post, it's this: **your app is a moving target for the runtime.** ART is constantly profiling, recompiling, and optimizing your code based on how users actually interact with it. Baseline Profiles and R8 are your tools for taking control of that process instead of leaving it to chance. The first-install experience matters more than any benchmark after a week of usage, and that's exactly where these tools have the biggest impact.

Thanks for reading through all of this :), Happy Coding!
