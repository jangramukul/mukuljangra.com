---
title: Gradle Build Best Practises Guide
layout: post
sequence: 78
categories: post
tags:
  - Android
  - Best Practices
  - Gradle
---

When I joined a project last year, the first thing I noticed was how long builds took. A clean build on the CI server ran for 14 minutes. Incremental builds on my M1 MacBook took 45 seconds. The team had gotten so used to it that nobody even complained — they'd trigger a build, open Twitter, and come back to check if it was done. But here's the thing: every developer on a 6-person team was losing 30+ minutes a day to build times. That's 15 hours a week of engineering time spent watching a progress bar.

I spent a weekend profiling the build and found the usual suspects. Every module copy-pasted the same 40 lines of build configuration. `buildSrc` was invalidating the entire build cache on every version bump. Kapt was running in modules that didn't even use annotation processing. The Gradle JVM heap was set to the default 512MB, which meant constant garbage collection pauses during compilation. After applying a handful of targeted optimizations — not exotic tricks, just standard Gradle hygiene — the clean build dropped to 6 minutes and incremental builds went down to 12 seconds.

None of these optimizations were novel. They're all documented in Gradle's performance guide and Google's build optimization talks. But most teams don't apply them because Gradle configuration feels like plumbing — unglamorous work that nobody wants to do until the build times become unbearable. I'd argue it's the highest-leverage work you can do on a multi-module project. Every second you shave off the build loop compounds across every developer, every commit, every day.

## Version Catalogs for Dependency Management

Before version catalogs, Android projects scattered dependency versions across multiple `build.gradle.kts` files, or centralized them in `buildSrc` with `object` declarations. Both approaches had problems — scattered versions led to version mismatches across modules, and `buildSrc` invalidated the entire build cache on any change. Version catalogs, introduced as stable in Gradle 7.4, solve both issues with a single `libs.versions.toml` file in the `gradle/` directory.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.1.0"
compose-bom = "2024.12.01"
coroutines = "1.9.0"
hilt = "2.53.1"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
coroutines-core = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-core", version.ref = "coroutines" }
hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }

[plugins]
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

The catalog generates type-safe accessors — `libs.compose.ui`, `libs.coroutines.core` — with IDE autocompletion. When you bump a version, it's one line change in one file, and Gradle only invalidates what depends on that specific library. In that project with 20+ modules, this alone saved us from chasing version conflicts that used to take 30 minutes to debug.

## The Configuration Cache

Gradle's configuration phase parses every `build.gradle.kts` file, resolves plugins, and builds the task graph before any task executes. On a 15-module Android project, this phase alone can take 8-15 seconds — and it runs on every single build. The configuration cache serializes the task graph after the first run and reuses it on subsequent builds, skipping the entire configuration phase. In my experience, this cuts incremental build times by 25-40% on medium to large projects.

Enable it in `gradle.properties`:

```properties
org.gradle.configuration-cache=true
org.gradle.configuration-cache.problems=warn
```

Start with `problems=warn` because some plugins aren't configuration-cache compatible yet. The Gradle build will report which plugins or build logic access project state in ways that can't be cached. Common offenders are older versions of the Android Gradle Plugin (pre-8.0), some KSP processors, and custom tasks that read `project` properties at execution time. The fix is usually updating the plugin or refactoring the task to capture values during configuration rather than reading `project` at execution time. Setting `problems=fail` once everything is clean ensures no regressions.

## Configuration Avoidance API

This one is subtle but it makes a real difference on large projects. Gradle has two ways to register tasks: `tasks.create()` and `tasks.register()`. The difference is that `create()` eagerly instantiates and configures the task immediately during the configuration phase, while `register()` defers all of that until the task is actually needed. In a 30-module project, you might have hundreds of tasks defined across all modules, but any given build only executes a fraction of them. With eager creation, Gradle still pays the cost of configuring every single one.

I ran into this when a custom convention plugin was registering 6 tasks per module using `tasks.create()`. Across 25 modules, that's 150 tasks being instantiated and configured on every build — even when running something unrelated like `assembleDebug` that would never touch those tasks. Switching to `tasks.register()` dropped the configuration phase by about 3 seconds. That doesn't sound dramatic, but it's 3 seconds on every single build, including incremental ones where the actual compilation might only take 4-5 seconds. The same principle extends to Gradle's `Provider` and `Property` types — instead of resolving values at configuration time, you wrap them in providers so Gradle resolves them lazily at execution time.

```kotlin
// build-logic/convention/src/main/kotlin/CoverageReportPlugin.kt
class CoverageReportPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            // BAD: tasks.create() eagerly configures the task
            // even if nobody runs "coverageReport" in this build
            // tasks.create("coverageReport") { ... }

            // GOOD: tasks.register() defers configuration
            // until the task is actually requested
            tasks.register<JacocoReport>("coverageReport") {
                dependsOn("testDebugUnitTest")

                reports {
                    xml.required.set(true)
                    html.required.set(true)
                }

                // Provider-based: resolved lazily at execution time
                val mainSrc = layout.projectDirectory.dir("src/main/kotlin")
                sourceDirectories.setFrom(mainSrc)

                val classTree = layout.buildDirectory.dir(
                    "tmp/kotlin-classes/debug"
                )
                classDirectories.setFrom(classTree)
                executionData.setFrom(
                    fileTree(layout.buildDirectory) { include("**/*.exec") }
                )
            }
        }
    }
}
```

The rule of thumb is simple: never use `tasks.create()` in build logic, always use `tasks.register()`. If you're also using `configurations.create()`, switch to `configurations.register()` for the same reason. Gradle's build scan will actually flag eagerly created tasks — look for the "Eager task creation" deprecation warnings. They're deprecation warnings now, but Gradle has signaled they'll become errors in a future major version.

## Convention Plugins Over Copy-Pasted Build Logic

This was the single biggest improvement in that project I mentioned. Fifteen modules, each with the same `compileSdk`, `minSdk`, `composeOptions`, and Kotlin compiler settings copy-pasted into `build.gradle.kts`. Change the `compileSdk` and you're editing 15 files. Miss one and you get a mysterious build failure that takes 20 minutes to track down. Convention plugins let you define shared build configuration once and apply it with a single line.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig.minSdk = 26

                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }

            extensions.configure<KotlinAndroidProjectExtension> {
                compilerOptions {
                    jvmTarget.set(JvmTarget.JVM_17)
                    freeCompilerArgs.addAll(
                        "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi"
                    )
                }
            }
        }
    }
}
```

Then in any module: `plugins { id("myapp.android.library") }`. One line replaces 40+ lines of duplicated configuration. Google's Now In Android sample uses this exact pattern in their `build-logic/` directory. The convention plugin approach scales from 5 modules to 500 modules with the same maintenance cost.

## Structuring the build-logic Directory

Convention plugins need a proper home, and getting the `build-logic/` directory structure right matters more than most guides let on. I've seen teams create convention plugins but dump everything into a single flat module with no organization, and within months it becomes its own maintenance burden.

The `build-logic/` directory is itself a standalone Gradle project — it has its own `settings.gradle.kts` and typically a single `convention` submodule. The root settings file pulls in the version catalog from the parent project so your convention plugins use the same dependency versions as the rest of the app.

```kotlin
// build-logic/settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))
        }
    }
}

include(":convention")
```

```kotlin
// build-logic/convention/build.gradle.kts
plugins {
    `kotlin-dsl`
}

dependencies {
    compileOnly(libs.android.gradlePlugin)
    compileOnly(libs.kotlin.gradlePlugin)
    compileOnly(libs.compose.gradlePlugin)
}
```

The `compileOnly` scope is deliberate — the actual plugin JARs come from the consuming project's `pluginManagement` block, so `build-logic` only needs them at compile time for the API types. I prefer the `Plugin<Project>` class approach over precompiled script plugins because it gives you full Kotlin with type safety. The key thing is that this structure keeps your build logic versioned, testable, and completely decoupled from `buildSrc` cache invalidation.

## Why Composite Builds Beat buildSrc

`buildSrc` is Gradle's built-in way to share build logic, but it has a critical flaw that most teams discover too late: any change to `buildSrc` invalidates the entire project's build cache. Change a single constant in your `Dependencies.kt` object, and every module recompiles from scratch. On a 20-module project, that's the difference between a 30-second incremental build and a 5-minute full rebuild.

Composite builds (`includeBuild()` in `settings.gradle.kts`) solve this. They compile independently and only invalidate modules that actually depend on the changed code. The setup is slightly more involved — you create a separate Gradle project under `build-logic/` with its own `settings.gradle.kts` and `build.gradle.kts` — but the build performance improvement is substantial.

```kotlin
// settings.gradle.kts
pluginManagement {
    includeBuild("build-logic")
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

include(":app")
include(":core:data")
include(":core:domain")
include(":feature:login")
include(":feature:dashboard")
```

If you already have `buildSrc`, the migration is straightforward: move the contents into `build-logic/convention/`, add a `build.gradle.kts` that applies `kotlin-dsl` and declares dependencies on the Gradle and Android Gradle Plugin APIs, and switch from `buildSrc` to `includeBuild`. The first build takes a few seconds longer, but every subsequent build benefits from proper cache invalidation.

## Parallel Execution and Build Caching

Gradle can execute independent tasks across modules simultaneously, but parallel execution isn't enabled by default. On a multi-module project with a modern multi-core machine, enabling parallelism can cut full build times by 30-60% depending on your module graph. Build caching goes further — it stores task outputs and reuses them when inputs haven't changed, even across clean builds.

```properties
# gradle.properties
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.jvmargs=-Xmx4g -XX:+UseParallelGC
```

The `jvmargs` line matters more than most people realize. The default Gradle JVM heap is 512MB, which is laughably insufficient for a multi-module Android project with Kotlin compilation, annotation processing, and resource merging happening simultaneously. 4GB is a reasonable starting point — bump to 6-8GB if you have 30+ modules. `UseParallelGC` is generally the best garbage collector choice for build systems where throughput matters more than pause times.

The tradeoff with parallel execution is that it exposes ordering issues in your build scripts. If module A writes a file that module B reads without declaring an explicit dependency, sequential builds work fine but parallel builds fail intermittently. These are legitimate bugs in your build configuration that parallel mode surfaces early — which is actually a good thing.

## Dependency Analysis Plugin

Most teams think they know their dependency graph, but every multi-module Android project has unused dependencies and misused `api` vs `implementation` declarations. Gradle doesn't tell you about this. You declare `implementation(libs.gson)` in a module, stop using Gson six months later, and nobody notices because the build still compiles — the dependency just bloats your configuration time and APK size for no reason.

The [Dependency Analysis Gradle Plugin](https://github.com/autonomousapps/dependency-analysis-gradle-plugin) by Tony Robalik catches exactly this. It scans your bytecode and source to determine which dependencies are actually used, which are unused, which are used transitively but should be declared directly, and which `api` dependencies should be `implementation`. On a 20-module project I ran it on, it found 34 unused dependencies and 12 incorrect `api` vs `implementation` declarations. Removing the unused ones shaved 8 seconds off a clean build.

```kotlin
// root build.gradle.kts
plugins {
    id("com.autonomousapps.dependency-analysis") version "2.7.1"
}

dependencyAnalysis {
    issues {
        all {
            onUsedTransitiveDependencies { severity("fail") }
            onUnusedDependencies { severity("fail") }
            onIncorrectConfiguration { severity("fail") }
        }
    }
}
```

Run `./gradlew buildHealth` and it produces a report telling you exactly what to fix — which dependencies to remove, which to add, and which to change from `api` to `implementation`. Setting the severity to `fail` means CI will catch any regressions. The `api` vs `implementation` distinction matters more than people think: declaring something as `api` exposes it to all downstream modules, which means changing that library's version triggers recompilation across a wider graph. Keeping everything as `implementation` unless a module genuinely exposes types from that dependency in its public API minimizes the recompilation blast radius.

## Dependency Locking and Exact Versions

Dynamic versions like `implementation("com.squareup.okhttp3:okhttp:4.+")` or version ranges are dangerous in production builds. They make your builds non-reproducible — the same code can produce different APKs depending on when you build, because a new transitive dependency version might have been published. I've seen a production crash caused by a transitive dependency auto-upgrading from `1.2.3` to `1.3.0` with a breaking API change that no one noticed until users reported it.

Use exact versions everywhere. For transitive dependencies you want to pin, Gradle's dependency locking writes a lockfile that records every resolved version:

```kotlin
// build.gradle.kts
dependencyLocking {
    lockAllConfigurations()
}
```

Run `./gradlew dependencies --write-locks` to generate the lockfile, then commit it to version control. Now every build resolves the exact same versions. This is the same concept as `package-lock.json` in npm — reproducible dependency resolution is not optional for production software. The maintenance cost is regenerating lockfiles periodically, but compared to debugging a crash caused by an invisible transitive dependency upgrade at 2 AM, that overhead is trivial.

## R8 Full Mode

R8 is Android's code shrinker and optimizer, and most projects use it in its default "compatibility" mode. Full mode is more aggressive — it performs additional optimizations like class merging, more aggressive inlining, and removing more unused code. In a production app I worked on, switching from compatibility to full mode reduced the APK size by an additional 12% and improved cold start time by ~200ms.

```kotlin
// gradle.properties
android.enableR8.fullMode=true
```

```kotlin
// build.gradle.kts (app module)
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

The tradeoff is that full mode can break reflection-based code more aggressively. Libraries that use reflection (some serialization libraries, DI frameworks without compile-time code generation) may need additional ProGuard rules. The approach I recommend is: enable it, run your full test suite against the release build, and add keep rules only for verified breakages rather than preemptively keeping everything.

## Non-Transitive R Classes

By default, Android generates R classes where each module's R class includes resource IDs from all its transitive dependencies. In a 20-module project, this means the `:app` module's R class contains every resource ID from every module — thousands of fields generated, compiled, and dexed redundantly. Non-transitive R classes limit each module's R class to only its own resources.

```properties
# gradle.properties
android.nonTransitiveRClass=true
```

This setting became the default for new projects in AGP 8.0, but existing projects need to opt in. The immediate effect is a reduction in generated code — one project I migrated saw R class generation drop from 45,000 fields to 8,000 fields across all modules. Build times improved because there's less code to compile and dex, and incremental builds are faster because changing a resource in one module doesn't trigger R class regeneration in every dependent module.

The migration cost is updating resource references. After enabling non-transitive R classes, `R.string.app_name` in a feature module won't compile if `app_name` is defined in the `:core:ui` module — you need to import the correct R class: `import com.myapp.core.ui.R`. Android Studio's "Migrate to Non-Transitive R Classes" refactoring handles most of this automatically.

## Disabling Unused Build Features

The Android Gradle Plugin enables several build features by default — `BuildConfig` generation, AIDL support, RenderScript, and view binding. If you're using Compose exclusively and don't need these features, they're just adding compilation time. Disabling unused build features in every module shaves seconds off each build.

```kotlin
// Convention plugin or per-module build.gradle.kts
android {
    buildFeatures {
        buildConfig = false
        aidl = false
        renderScript = false
        resValues = false
        shaders = false
    }
}
```

Enable only what you use. If your app module needs `BuildConfig` for version info, enable it there but keep it disabled in library modules. The principle is that every enabled build feature adds a code generation step — multiply that by your module count and the savings are real. On a 30-module project, disabling `BuildConfig` in 25 library modules saved ~4 seconds per incremental build.

## Profile Before You Optimize

I saved this for last because it's the most important principle, and it's the one most teams get backwards. Before applying any optimization, know where your build time is actually spent. Gradle's built-in build scan gives you a detailed breakdown of configuration time, task execution time, and which tasks were cache hits vs cache misses. You might discover that 40% of your build time is spent on annotation processing in one module, or that a custom task is disabling incremental compilation.

```bash
# Generate a build scan
./gradlew assembleDebug --scan

# Or use the local profile report
./gradlew assembleDebug --profile
```

The `--profile` flag generates an HTML report in `build/reports/profile/` without uploading anything. Look for the longest-running tasks, cache misses when you expect hits, and configuration time that grows with module count. Common findings: Kapt is usually the slowest step — migrating to KSP can cut annotation processing time by 50-70%. Unused `kapt` configurations in modules that don't need them add 2-3 seconds each.

The mistake I see teams make is applying build optimizations they read about without profiling first. They enable configuration cache but their bottleneck is Kapt. They add more RAM but their build is IO-bound. Profile first, optimize second, measure the improvement. That's the cycle that actually produces results.

Thanks for reading!
