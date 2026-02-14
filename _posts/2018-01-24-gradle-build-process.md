---
title: Gradle Build Process Guide
layout: post
categories: post
tags:
  - Android
  - Gradle
---

When I started Android development, I treated Gradle like a black box. I'd paste dependencies into `build.gradle`, hit sync, and pray. Version conflicts? No idea. Mysterious compilation errors? Google it and try random fixes. 4-minute clean builds? Just stare at the progress bar and question my career choices.

The problem was simple: I had no mental model for what was actually happening. I thought Gradle was a dependency manager. It's not. It's a programmable build system with a well-defined execution model, and understanding that model is the difference between copy-pasting Stack Overflow snippets and actually controlling your build.

Think of Gradle like a restaurant kitchen. You don't just throw ingredients at a stove and hope food comes out. There's a head chef (Gradle) who reads the order (your build files), plans which stations need to work (task graph), and coordinates the whole thing so dishes come out in the right order. Your `build.gradle.kts` files? Those are the recipes. And once you understand how the kitchen operates, you stop burning things.

Gradle uses a Groovy or Kotlin DSL to define build logic. Android Studio uses Gradle with the Android Gradle Plugin (AGP) to compile source code, merge resources, run annotation processors, generate DEX files, and package everything into an APK or AAB. Every step in that pipeline is a Gradle task, and those tasks are organized into a directed acyclic graph (DAG) that Gradle resolves and executes in dependency order. Once you see the build as a graph of tasks, the entire system clicks.

## The Three Build Phases

Here's where most developers go wrong with Gradle, and I was one of them for a long time. Gradle builds execute in three distinct phases, and understanding *when* your code runs is critical. Code that runs in the wrong phase is one of the most common causes of slow builds.

Imagine you're organizing a big dinner party. There are three stages: figuring out who's coming (Initialization), planning the menu and prep work for every dish (Configuration), and actually cooking (Execution). You wouldn't start chopping onions while you're still counting guests, right? Same idea with Gradle.

**Initialization** is where Gradle determines which projects participate in the build. It reads `settings.gradle.kts` (or `settings.gradle`), which lists every module in your project. For a single-module app, this is trivial. For a multi-module project with 20 modules, Gradle creates a `Project` object for each one during this phase. The `settings.gradle.kts` file is also where you configure the dependency resolution strategy, plugin repositories, and version catalogs. If your `settings.gradle.kts` has expensive logic — like network calls to resolve dynamic versions — it slows down every single build invocation, including `gradle help`.

**Configuration** is where Gradle evaluates all `build.gradle.kts` files and configures every task. Here's the thing most developers miss: configuration runs for *every* task in *every* module, even the ones you're not executing. If you call `./gradlew :app:assembleDebug`, Gradle still configures every module and every task — it just only *executes* the ones in the dependency chain of `assembleDebug`. This is why having expensive logic at the top level of your `build.gradle.kts` is a problem — it runs even when you're just running `./gradlew tasks`.

Going back to the dinner party analogy, this is like planning the prep for *every dish in the cookbook*, even though you're only cooking three of them tonight. Sounds wasteful, right? It is. And that's exactly why you need to keep configuration cheap.

**Execution** is where Gradle actually runs the tasks needed to produce your output. It walks the task dependency graph, skips tasks whose inputs haven't changed (up-to-date checking), pulls results from the build cache where possible, and executes everything else. This is the only phase where real work happens.

```kotlin
// settings.gradle.kts — runs during Initialization
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MyApp"
include(":app")
include(":core:data")
include(":core:network")
include(":feature:orders")
include(":feature:profile")
```

Now here's where it gets real. I've seen builds where someone computed a git hash by executing `git rev-parse HEAD` at the top level of `build.gradle.kts`. That shell command ran for every module on every build invocation — even `./gradlew tasks`. Moving it into a task — so it only runs during execution, and only when needed — cut the configuration phase from 8 seconds to under 1 second.

> **🔥 Real talk:** If your build feels slow and you're not sure why, check what's running during configuration. Run `./gradlew --profile assembleDebug` and look at the configuration time. If it's more than a couple of seconds, you've probably got code executing in the wrong phase. I've wasted hours debugging "slow builds" that turned out to be a single misplaced shell command.

## The Android Build Pipeline

When you hit "Run" in Android Studio, the Android Gradle Plugin orchestrates a pipeline of tasks. The high-level flow goes: compile Kotlin/Java → run annotation processors (Room, Hilt, etc.) → merge resources → transform bytecode → generate DEX files → package into APK/AAB → sign → align. Each step is a Gradle task, and they're chained through declared inputs and outputs.

Think of it like an assembly line in a car factory. Raw materials (your source code) enter at one end, pass through a series of stations where each one transforms them a bit more, and a finished product (your APK) rolls off at the other end. Each station only cares about its own inputs and outputs, but they have to run in the right order — you can't paint the car before you've welded the frame.

The DEX step is worth understanding. Android doesn't run JVM bytecode directly — it runs Dalvik Executable (DEX) format on the ART runtime. The `dexing` task converts `.class` files into `.dex` files. For apps that exceed 64K methods, multidex kicks in and splits the output into multiple DEX files. This is handled automatically by AGP when you set `minSdk` to 21 or higher, because ART natively supports multidex. Below API 21, you need the multidex support library.

## Version Catalogs — Centralized Dependency Management

Before version catalogs, multi-module projects managed dependencies through `ext` blocks in the root `build.gradle`, `buildSrc` constants, or convention plugins. Each had tradeoffs — `ext` blocks weren't type-safe, `buildSrc` invalidated the entire build cache when any constant changed, and convention plugins required more setup.

Imagine you have 20 feature modules and each one declares its own version of Room. One module is on 2.6.0, another on 2.6.1, a third one still on 2.5.2 because nobody updated it. Now you've got a version conflict. Sound familiar?

Version catalogs (introduced in Gradle 7.0, stable since 7.4) solve all of this. You define dependencies and versions in a single `libs.versions.toml` file, and Gradle generates type-safe accessors. One source of truth. Change the version in one place, every module picks it up.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "1.9.22"
compose-bom = "2024.02.00"
room = "2.6.1"
hilt = "2.50"

[libraries]
kotlin-stdlib = { module = "org.jetbrains.kotlin:kotlin-stdlib", version.ref = "kotlin" }
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "compose-bom" }
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }
room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
hilt-android = { module = "com.google.dagger:hilt-android", version.ref = "hilt" }

[bundles]
room = ["room-runtime", "room-ktx"]

[plugins]
android-application = { id = "com.android.application", version = "8.2.2" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

```kotlin
// In a module's build.gradle.kts — type-safe, IDE-autocomplete
dependencies {
    implementation(libs.compose.bom)
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)
    implementation(libs.hilt.android)
}
```

The big advantage over `buildSrc` is incremental. Changing a version in `libs.versions.toml` doesn't invalidate the entire build cache the way changing a constant in `buildSrc` does. On a 20-module project, that difference can save minutes per build. Let that sink in — *minutes* — just because of where you store a version string.

## Convention Plugins — Sharing Build Logic

In multi-module projects, you end up repeating the same configuration across modules — compile SDK, Kotlin options, common dependencies, ProGuard rules. If you've ever created a new feature module and copied 40+ lines of build configuration from an existing one, hoping you didn't miss anything or leave a stale value behind — you know exactly why this is a problem.

Convention plugins let you define that shared configuration once and apply it everywhere. It's like creating a template. Instead of every module reinventing its own build setup, they just say "I'm a feature module" and inherit all the right defaults.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")

            extensions.configure<LibraryExtension> {
                compileSdk = 34
                defaultConfig {
                    minSdk = 24
                    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
                }
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }

            dependencies {
                add("implementation", project(":core:data"))
                add("implementation", project(":core:ui"))
            }
        }
    }
}
```

Now look at what a feature module's build file becomes:

```kotlin
// feature/orders/build.gradle.kts — clean and minimal
plugins {
    id("myapp.android.feature")
}

dependencies {
    implementation(libs.bundles.room)
}
```

That's it. Two blocks. The Google "Now In Android" sample app uses this pattern extensively, and it's the approach I recommend for any project with more than three or four modules. Without convention plugins, adding a new feature module means copying 40+ lines of build configuration and hoping you don't miss the one line that's different. With them, it's two lines — apply the convention plugin and add module-specific dependencies.

> **💡 The "aha" moment:** Convention plugins aren't about convenience — they're about correctness. When every module defines its own `compileSdk`, `minSdk`, and Java version, someone *will* set one wrong and you won't notice until a weird bug shows up on an old device. Centralize it once, and the whole project stays consistent by default.

## Build Cache and Task Avoidance

Gradle's build cache is one of those features that seems almost too good to be true. It stores the outputs of tasks keyed by their inputs. If you run `:app:compileDebugKotlin` and the inputs (source files, dependencies, compiler options) haven't changed since the last build, Gradle skips execution entirely and uses the cached output. This works across clean builds too — the build cache persists between `./gradlew clean` calls (unless you manually clear it).

Think of it like a smart chef who remembers: "I already prepped this exact sauce with these exact ingredients yesterday, and it's still in the fridge. Why would I make it again?" That's what Gradle's build cache does for your tasks.

The task avoidance API takes this further. Instead of configuring all tasks eagerly during the configuration phase, you register tasks lazily and only configure them when they're actually needed for execution. Here's the difference in code:

```kotlin
// Eager — configures the task even if it's never executed
tasks.create("generateBuildInfo") {
    doLast {
        // ... write build info file
    }
}

// Lazy (task avoidance) — only configures when this task needs to run
tasks.register("generateBuildInfo") {
    val outputFile = layout.buildDirectory.file("build-info.txt")
    outputs.file(outputFile)
    doLast {
        outputFile.get().asFile.writeText("Build time: ${System.currentTimeMillis()}")
    }
}
```

`tasks.register` instead of `tasks.create` — that's the task avoidance API. The difference seems small, but on a project with hundreds of custom tasks, it reduces configuration time significantly because Gradle only instantiates and configures tasks that are in the execution path. The Android Gradle Plugin uses task avoidance internally, and you should too for any custom tasks.

> **⚡ Quick check:** Look at your project's custom tasks right now. Are they using `tasks.create` or `tasks.register`? If you see `create`, you're paying configuration cost for tasks that might never run. Swap them to `register` — it's a one-word change with real impact.

## Custom Tasks — Real-World Use Cases

Custom Gradle tasks are useful for automating project-specific workflows. Here are patterns I've used in production.

**Generating version info from git** — imagine your app crashes in production, and the crash report says version "1.2.3". But which commit was that? Was it from the release branch or that hotfix? Embedding the commit hash in your build answers that question instantly:

```kotlin
abstract class GitVersionTask : DefaultTask() {

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    @TaskAction
    fun execute() {
        val commitHash = providers.exec {
            commandLine("git", "rev-parse", "--short", "HEAD")
        }.standardOutput.asText.get().trim()

        val branchName = providers.exec {
            commandLine("git", "rev-parse", "--abbrev-ref", "HEAD")
        }.standardOutput.asText.get().trim()

        outputFile.get().asFile.writeText(
            "commitHash=$commitHash\nbranch=$branchName"
        )
    }
}

tasks.register<GitVersionTask>("generateGitVersion") {
    outputFile.set(layout.buildDirectory.file("git-version.properties"))
}
```

Notice that this uses `providers.exec` — the Gradle-idiomatic way to run external commands — and it's wrapped in a proper task with declared outputs. This means Gradle can cache the result and skip re-execution if the inputs haven't changed. Compare that to the naive approach of calling `Runtime.exec("git ...")` at the top of your build file, where it runs on every single build invocation. Same result, completely different performance characteristics.

**Checking for snapshot dependencies before release** — a quality gate that prevents shipping with development dependencies:

```kotlin
tasks.register("checkNoSnapshots") {
    doLast {
        val snapshots = configurations.flatMap { config ->
            config.resolvedConfiguration.resolvedArtifacts
                .filter { it.moduleVersion.id.version.contains("SNAPSHOT") }
                .map { "${it.moduleVersion.id.group}:${it.moduleVersion.id.name}:${it.moduleVersion.id.version}" }
        }
        if (snapshots.isNotEmpty()) {
            throw GradleException("Release build contains SNAPSHOT dependencies:\n${snapshots.joinToString("\n")}")
        }
    }
}
```

Wire this into your CI pipeline before a release build, and you'll never accidentally ship a SNAPSHOT dependency to production. It's a small task, but it saves you from a very embarrassing kind of bug.

## The Reframe — Gradle Is a Programming Language, Not a Config File

Here's the insight that changed how I think about Gradle: **`build.gradle.kts` isn't a configuration file. It's a Kotlin program that runs during your build.** Every line is executable code. The `dependencies {}` block is a function call. The `plugins {}` block is a function call. Understanding this means you can debug build issues the same way you debug application code — add print statements, step through with a debugger, inspect objects.

That's powerful. But with great power comes great "oh no, what happened to our build times."

The tradeoff is that Gradle builds can become slow and complex when developers treat them as application code rather than build configuration. I've seen `build.gradle.kts` files with 200+ lines of custom logic, network calls, file parsing, and conditional compilation. The build system should configure and execute tasks, not run business logic. Keep build files declarative where possible — define what you want, not how to do it — and push complex logic into convention plugins where it can be tested and maintained separately.

The honest truth is that Gradle has a steep learning curve, and the Android build toolchain adds another layer of complexity on top. But once you internalize the three-phase model (Initialization, Configuration, Execution), understand task dependencies and caching, and learn to use convention plugins and version catalogs, your builds become faster, more reliable, and easier to maintain. The time invested in understanding Gradle pays for itself every single day you work on an Android project. You stop being the person who just hits sync and prays — and you start being the person your team asks when the build breaks.

Thank You!
