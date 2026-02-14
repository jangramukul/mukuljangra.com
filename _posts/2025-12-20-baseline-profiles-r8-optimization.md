---
title: Baseline Profiles and R8 Optimization Guide
layout: post
categories: post
tags:
  - Android
  - Performance
  - Gradle
---

Picture this: it's Friday afternoon. I'm running our release build on a mid-range Pixel — fully signed, minified, everything production-ready. The splash screen just... hangs. Nearly two seconds before the app shows up. I switch to the debug build. Same device, same code, same network. Buttery smooth, almost instant.

Wait, what?

My first instinct was to blame R8 for stripping something it shouldn't have. I spent hours checking keep rules, verifying class retention, making sure nothing critical was being removed. Dead end after dead end. The problem wasn't code stripping at all. The problem was something I'd never thought about before: **how ART compiles your app after the user installs it.** That Friday rabbit hole through ART's compilation pipeline, Baseline Profiles, and R8 optimization genuinely changed how I think about Android app performance at the bytecode level.

## How ART Actually Compiles Your App

Most Android developers know that ART replaced Dalvik back in Android 5.0. But "ART runs your app" is about as useful as saying "the CPU executes instructions." The interesting part is *how* it runs your code, and the answer has changed significantly over the years.

Think of ART like a new employee at a restaurant. On day one, they follow the recipe book line by line — slow, methodical, checking every step. That's **interpretation**: ART reads your dex bytecode instruction by instruction, and yeah, it's slow. But as the employee gets comfortable, they start memorizing the popular dishes. That's the **JIT compiler** kicking in — it identifies "hot" methods your app keeps calling and compiles them to native machine code right there in memory. Way faster. But here's the catch: that memorized knowledge only exists in the employee's head (RAM). Send them home (kill the app), and tomorrow they start over.

Now here's where it gets interesting. While the JIT is running, ART also collects a **runtime profile** on the device. This profile records which methods were JIT-compiled, which classes were loaded during startup, and how frequently each code path was hit. Over time — usually after the device is idle and charging — ART's background `dex2oat` process takes this profile and performs **profile-guided AOT compilation**. It compiles only the hot methods into an `.odex` file that persists on disk. The next time the app launches, those methods are already native code — no interpretation, no JIT warmup needed. It's like the restaurant printing a permanent cheat sheet of the top 20 dishes so every new shift starts fast.

This three-stage pipeline — interpret, JIT, profile-guided AOT — is elegant. But it has a massive cold-start problem. On first install, there is no profile. The user's first experience with your app is the worst it will ever be: fully interpreted, no JIT cache, no AOT compilation. The app needs several sessions of real usage before the profile matures enough for `dex2oat` to produce meaningful AOT code.

And if the user only opens your app once and decides it's slow? They never get to experience the optimized version. They just uninstall.

## The Cloud Profile Problem

Google tried to solve this with **Play Store cloud profiles**. The idea is smart: aggregate runtime profiles from users who already have the app, then distribute them to new users during download. Crowdsourced optimization — sounds great on paper, right?

But cloud profiles take **two to three weeks** to propagate after you publish an update. Google needs enough users to generate stable profiles, then the profiles get aggregated and bundled into distribution. If you're shipping weekly releases, your users are running on stale or missing profiles for the first two weeks of every release cycle. For apps with smaller install bases, the cloud profile might never reach critical mass at all.

I've seen this firsthand. We shipped a major refactor that restructured several critical startup paths. For two weeks, cold start times regressed by 400-600ms because the old cloud profiles no longer matched the new code structure. The metrics didn't recover until new profiles propagated. That's when I started taking Baseline Profiles seriously.

## Baseline Profiles — Shortcutting the Cold Start Penalty

Imagine you could hand that new restaurant employee a cheat sheet on their very first day — "here are the 20 most popular orders, pre-memorized." No learning curve, no slow first shift. That's exactly what Baseline Profiles do for ART.

Instead of waiting for runtime profiles to build up on user devices or cloud profiles to propagate through Play, you **generate the profile at build time and ship it inside the APK itself.** When the app is installed, ART's `dex2oat` reads this bundled profile and immediately AOT-compiles the critical code paths. No waiting, no warmup period, no dependency on user behavior.

> **💡 The "aha" moment:** ART doesn't just run your app — it learns from it, profiles it, and recompiles the hot paths into native code over time. Baseline Profiles let you shortcut that entire learning process. You're telling ART upfront, "these are the methods and classes that matter for startup and core user journeys, compile them now."

Google's own benchmarks show **30% or more improvement on cold start times** with Baseline Profiles. In my experience, the improvement varies depending on how much work your app does during startup — apps with heavy DI initialization (Dagger/Hilt component building, module loading) see massive gains because those code paths are complex and deeply nested.

## Generating and Shipping Baseline Profiles

So how do you actually create one of these profiles? The Jetpack Macrobenchmark library provides the tooling. You write an instrumentation test that exercises your app's critical paths — startup, navigation, scrolling — while the framework records which methods and classes are accessed. Think of it as giving ART a guided tour of your app's most important rooms.

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

The generated profile is a text file listing methods and classes with flags indicating whether they should be AOT-compiled or included in the startup image. After generation, the profile gets bundled into your APK via the Baseline Profile Gradle plugin. In your `app/build.gradle.kts`, you need the plugin and the dependency on your benchmark module:

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

Setting `saveInSrc = true` writes the generated profile to `src/main/baselineProfiles/` so it gets committed to version control. I think this is the right default — you want the profile to be reproducible and reviewable in code review, not silently generated during CI.

One tradeoff worth mentioning: the profile quality depends entirely on how well your generator test covers the critical paths. If you only test cold startup but your users spend most of their time scrolling lists or navigating between tabs, you'll miss the methods that matter most for perceived performance. Your guided tour needs to visit the rooms your users actually spend time in.

## ProfileInstaller — Making Profiles Work Without Play

Here's something that trips up a lot of teams: Baseline Profiles shipped in the APK only get installed automatically through the Play Store's install flow. If you're sideloading APKs for testing, distributing through Firebase App Distribution, or using any install path that isn't Play, the profile just sits inside the APK doing nothing. ART never sees it.

Sounds weird, right? You bundled it, shipped it, and... nothing happens.

This is where **ProfileInstaller** comes in. The `androidx.profileinstaller` library includes a `ProfileInstallerInitializer` that uses App Startup to install the bundled profile at first launch. When it runs, it reads the binary profile from the APK's assets, transcodes it into the format the device's ART version expects, and writes it to the location where `dex2oat` picks it up on the next compilation pass. The key insight: Play Store does this step during install, but without Play you need the library to do it at runtime. Adding it is straightforward — just include the dependency and the initializer runs automatically via App Startup's `ContentProvider`.

For CI pipelines and automated testing, you also want to know whether the profile was actually installed and compiled. That's what `ProfileVerifier` is for. It lets you query the compilation status of your app's profile at runtime — whether it's pending, compiled, or failed. I use this in our staging builds to log the profile status on startup, which has caught issues where the profile format was incompatible with the device's ART version:

```kotlin
class ProfileStatusLogger {

    suspend fun checkProfileStatus(context: Context) {
        val result = ProfileVerifier
            .getCompilationStatusAsync()
            .await()

        when (result.profileInstallResultCode) {
            ProfileVerifier.CompilationStatus
                .RESULT_CODE_COMPILED_WITH_PROFILE -> {
                Log.d("ProfileCheck", "Profile active and compiled")
            }
            ProfileVerifier.CompilationStatus
                .RESULT_CODE_PROFILE_ENQUEUED_FOR_COMPILATION -> {
                Log.d("ProfileCheck", "Profile pending dex2oat")
            }
            ProfileVerifier.CompilationStatus
                .RESULT_CODE_NO_PROFILE -> {
                Log.w("ProfileCheck", "No profile found")
            }
            else -> {
                Log.w("ProfileCheck",
                    "Unexpected status: ${result.profileInstallResultCode}")
            }
        }
    }
}
```

Without `ProfileVerifier`, you're flying blind — you ship profiles but have no way to confirm they're actually being used on real devices. IMO this should be the first thing you add after enabling Baseline Profiles, especially if your team distributes test builds outside of Play.

## R8 — What It Actually Does to Your Bytecode

Okay, so Baseline Profiles optimize how ART *compiles* your bytecode. But what about optimizing the bytecode itself *before* it ever reaches the device? That's R8's job. And it's a completely different game.

Here's an analogy: imagine you're shipping a moving truck to a new apartment. R8 is the person who throws away the junk you don't need, consolidates three half-empty boxes into one, and removes the packaging around items so the truck is lighter and smaller. Baseline Profiles are the people at the other end who unpack the most important boxes first so you can sleep in a bed on night one. They're complementary — R8 makes your shipment leaner, Baseline Profiles make sure the essentials are ready immediately.

R8 is the default code shrinker, optimizer, and obfuscator for Android release builds. It replaced ProGuard as the default in AGP 3.4, and while it's backward-compatible with ProGuard rules, it does significantly more. R8 performs four major optimization passes on your compiled bytecode. **Tree shaking** traces all reachable code paths from entry points and removes everything unreachable — in a typical app with large libraries, this can cut **30-50% of the total method count**. IMO, this is R8's single biggest win. **Code inlining** replaces short method calls with the method body itself, which matters a lot with Kotlin's extension functions and inline-heavy style. **Class merging** combines single-implementation interfaces into fewer classes, eliminating dispatch overhead. **Dead code elimination** removes unreachable branches, unused variables, and assignments whose results are never read.

Put another way: your app probably ships 50+ dependencies, and you use maybe 10% of each library. R8 figures out which 10% you actually touch and throws away the rest.

## R8 Full Mode and Reflection Handling

R8 has two modes: normal (compatible) mode and full mode. Normal mode respects all ProGuard rules and avoids optimizations that could break reflection-based code. Full mode is more aggressive — **it does not preserve class hierarchy for classes that aren't explicitly kept.** R8 might merge, inline, or remove classes even if some library tries to access them via reflection at runtime.

```kotlin
// build.gradle.kts — enabling R8 full mode
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

// gradle.properties
// android.enableR8.fullMode=true
```

On a production app I worked on with roughly 120 third-party dependencies, switching from R8 normal mode to full mode dropped the APK size from 18.2 MB to 12.6 MB — a **31% reduction**. Method count dropped by about 40%. Build time increased by roughly 15 seconds, which is negligible for a release build.

But the real challenge with full mode is **reflection handling**, and this is where serialization library choice makes a huge difference.

> **🔥 Real talk:** We hit this exact bug with Gson. Gson uses runtime reflection to inspect class fields and call constructors — R8 has no visibility into that, so it strips no-arg constructors and field types it thinks are unused. Our Gson deserialization started returning null fields silently. No crash, no exception, just missing data that a QA engineer caught on a details screen days later. Reflection-based libraries and R8 full mode are like two coworkers who never talk to each other — eventually something falls through the cracks.

Here's the thing — **kotlinx.serialization is R8-friendly by default** because it uses a compiler plugin to generate serializers at compile time. There's no reflection involved. R8 can see the entire code path, so it knows exactly what to keep and what to remove. With `@Serializable` annotated classes, you don't need any keep rules at all. Compare that to Gson, where every model class needs explicit rules. The `@SerialName` annotation in kotlinx.serialization just maps JSON keys to Kotlin properties at the compiler plugin level — R8 treats the generated serializer like regular code and optimizes it safely:

```kotlin
// R8-safe — kotlinx.serialization uses codegen, no reflection
@Serializable
data class Article(
    @SerialName("article_id") val id: String,
    @SerialName("article_title") val title: String,
    val author: String,
    val publishedAt: Long
)

// R8-unsafe without keep rules — Gson uses reflection
// Needs: -keepclassmembers for fields and constructor
data class ArticleGson(
    @SerializedName("article_id") val id: String,
    @SerializedName("article_title") val title: String,
    val author: String,
    val publishedAt: Long
)
```

For Kotlin reflection specifically — `kotlin-reflect` is a large dependency that R8 struggles with because it introspects class metadata at runtime. If you're using `KClass` references, `::class.memberProperties`, or any of the reflection APIs, you need broad keep rules that defeat much of R8's optimization. The `@Keep` annotation is the surgical alternative: annotate individual classes or members that must survive R8, rather than keeping entire packages. My rule of thumb: if you're adding more than 5-6 keep rules for a single library's models, reconsider whether a codegen-based approach would be cleaner.

## Measuring Real Startup Impact

All of this optimization work is meaningless if you can't measure the actual impact. I've seen teams add Baseline Profiles, announce a performance win, and have no data to back it up. "We added Baseline Profiles so startup is faster now!" Cool. By how much? On what device? Compared to what baseline?

> **🧠 Think about it:** If someone on your team shipped Baseline Profiles last month, could you prove right now — with numbers — that it actually helped? Or would you just be guessing?

The Macrobenchmark library gives you `StartupTimingMetric` for exactly this — it measures cold, warm, and hot startup times with statistical rigor across multiple iterations:

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {

    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun coldStartupNoProfile() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.newsreader",
            metrics = listOf(StartupTimingMetric()),
            iterations = 10,
            startupMode = StartupMode.COLD,
            compilationMode = CompilationMode.None()
        ) {
            pressHome()
            startActivityAndWait()
        }
    }

    @Test
    fun coldStartupWithProfile() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.newsreader",
            metrics = listOf(StartupTimingMetric()),
            iterations = 10,
            startupMode = StartupMode.COLD,
            compilationMode = CompilationMode.Partial(
                baselineProfileMode = BaselineProfileMode.Require
            )
        ) {
            pressHome()
            startActivityAndWait()
        }
    }
}
```

The `CompilationMode` parameter is what makes this work. `CompilationMode.None()` simulates a first install with no profiles — everything interpreted. `CompilationMode.Partial` with `BaselineProfileMode.Require` applies your Baseline Profile before running, simulating a Play Store install. Running both back-to-back on the same device gives you a clean before/after comparison. On our Pixel 6a, this showed cold start dropping from 1,840ms to 1,120ms — a **39% improvement**.

But raw timing numbers only tell you *that* things improved, not *why*. For that, you need Perfetto traces. When you open a Macrobenchmark trace in Perfetto (or Android Studio's profiler), look for the `JIT compiling` slices on the JIT thread pool. In the "no profile" trace, you'll see dozens of JIT compilation events during startup — each one represents a method being compiled on-the-fly while your user is waiting. In the "with profile" trace, those slices largely disappear because the methods were already AOT-compiled. The other thing to check is the `ClassLoad` events — with a startup profile, frequently needed classes are loaded from the pre-compiled `.odex` file rather than being verified and loaded from dex at runtime.

## What `dex2oat` Does Under the Hood

Going one layer below — when ART receives your APK with a bundled Baseline Profile, what actually happens during installation? The `dex2oat` tool converts dex bytecode to native code. Without a profile, `dex2oat` on modern Android runs in **speed-profile** mode: it only compiles methods that appear in a profile. No profile means nothing gets AOT-compiled at install time.

When a Baseline Profile is present, `dex2oat` reads it and compiles the listed methods using the **optimizing compiler backend**. This backend performs register allocation, instruction scheduling, null check elimination, and bounds check elimination — optimizations the JIT also does, but `dex2oat` can spend more time on them because it runs offline. Think of it like the difference between a student cramming for a test the morning of (JIT) versus studying over the weekend (AOT) — same material, but the weekend student has time to really internalize it.

> **⚡ Quick check:** Can you explain why a Baseline Profile might produce *better* native code than just pre-compiling every method in your app? (Hint: it's not just about what gets compiled — it's about what the compiler *knows*.)

Here's the critical detail: **profile-guided compilation doesn't just compile the listed methods — it uses the profile to make better inlining decisions.** If the profile says method A always calls method B, the compiler might inline B into A even if B wouldn't normally meet the inlining threshold. This is why Baseline Profiles aren't just "pre-compile everything" — they give the compiler real usage pattern information that produces tighter native code for your hot paths.

## Combining Everything

The real power comes from using Baseline Profiles and R8 together. R8 removes unused code, inlines small methods, and shrinks the dex files — so the bytecode that reaches the device is already leaner. Baseline Profiles then ensure the critical code paths in that leaner bytecode are AOT-compiled from the first launch. ProfileInstaller makes sure the profiles actually get installed regardless of the distribution channel. And `StartupTimingMetric` confirms the whole thing actually works.

But I want to be honest about the build complexity. You now have a benchmark module, generator tests, R8 keep rules, the baseline profile Gradle plugin, and ProfileInstaller — all of which need to stay in sync as your codebase evolves. When we refactored our networking layer, three R8 keep rules became stale and we shipped a build with broken API response parsing. These tools produce real results, but they're not "set and forget."

**Your app is a moving target for the runtime.** ART is constantly profiling, recompiling, and optimizing your code based on how users actually interact with it. Baseline Profiles and R8 are your tools for taking control of that process instead of leaving it to chance. The first-install experience matters more than any benchmark after a week of usage, and that's exactly where these tools have the biggest impact.

Thanks for reading through all of this :), Happy Coding!
