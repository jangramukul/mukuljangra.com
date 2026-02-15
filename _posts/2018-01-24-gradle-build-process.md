---
title: Gradle Build Process Guide
layout: post
sequence: 3
categories: post
tags:
  - Android
  - Gradle
---

When I started Android development, I treated Gradle like a black box. I'd paste dependencies into `build.gradle`, hit sync, and pray. When something broke — version conflicts, mysterious compilation errors, 4-minute clean builds — I had no mental model for what was happening. It took me an embarrassingly long time to learn that Gradle isn't just a dependency manager. It's a programmable build system with a well-defined execution model, and understanding that model is the difference between copy-pasting Stack Overflow snippets and actually controlling your build.

Gradle uses a Groovy or Kotlin DSL to define build logic. Android Studio uses Gradle with the Android Gradle Plugin (AGP) to compile source code, merge resources, run annotation processors, generate DEX files, and package everything into an APK or AAB. Every step in that pipeline is a Gradle task, and those tasks are organized into a directed acyclic graph (DAG) that Gradle resolves and executes in dependency order. Once you see the build as a graph of tasks, the entire system makes sense.

## The Three Build Phases

Gradle builds execute in three distinct phases, and understanding when your code runs is critical. Code that runs in the wrong phase is one of the most common causes of slow builds.

**Initialization** is where Gradle determines which projects participate in the build. It reads `settings.gradle.kts` (or `settings.gradle`), which lists every module in your project. For a single-module app, this is trivial. For a multi-module project with 20 modules, Gradle creates a `Project` object for each one during this phase. The `settings.gradle.kts` file is also where you configure the dependency resolution strategy, plugin repositories, and version catalogs. If your `settings.gradle.kts` has expensive logic — like network calls to resolve dynamic versions — it slows down every single build invocation, including `gradle help`.

**Configuration** is where Gradle evaluates all `build.gradle.kts` files and configures every task. Here's the thing most developers miss: configuration runs for *every* task in *every* module, even the ones you're not executing. If you call `./gradlew :app:assembleDebug`, Gradle still configures every module and every task — it just only *executes* the ones in the dependency chain of `assembleDebug`. This is why having expensive logic at the top level of your `build.gradle.kts` is a problem — it runs even when you're just running `./gradlew tasks`.

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

The practical impact of these phases: never put expensive computation in the configuration phase. I've seen builds where someone computed a git hash by executing `git rev-parse HEAD` at the top level of `build.gradle.kts`. That shell command ran for every module on every build invocation. Moving it into a task — so it only runs during execution, and only when needed — cut the configuration phase from 8 seconds to under 1 second.

## The Android Build Pipeline

When you hit "Run" in Android Studio, the Android Gradle Plugin orchestrates a pipeline of tasks. The high-level flow goes: compile Kotlin/Java → run annotation processors (Room, Hilt, etc.) → merge resources → transform bytecode → generate DEX files → package into APK/AAB → sign → align. Each step is a Gradle task, and they're chained through declared inputs and outputs.

The DEX step is worth understanding. Android doesn't run JVM bytecode directly — it runs Dalvik Executable (DEX) format on the ART runtime. The `dexing` task converts `.class` files into `.dex` files. For apps that exceed 64K methods, multidex kicks in and splits the output into multiple DEX files. This is handled automatically by AGP when you set `minSdk` to 21 or higher, because ART natively supports multidex. Below API 21, you need the multidex support library.

## Version Catalogs — Centralized Dependency Management

Before version catalogs, multi-module projects managed dependencies through `ext` blocks in the root `build.gradle`, `buildSrc` constants, or convention plugins. Each had tradeoffs — `ext` blocks weren't type-safe, `buildSrc` invalidated the entire build cache when any constant changed, and convention plugins required more setup.

Version catalogs (introduced in Gradle 7.0, stable since 7.4) solve all of this. You define dependencies and versions in a `libs.versions.toml` file, and Gradle generates type-safe accessors.

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

The big advantage over `buildSrc` is incremental. Changing a version in `libs.versions.toml` doesn't invalidate the entire build cache the way changing a constant in `buildSrc` does. On a 20-module project, that difference can save minutes per build.

## Convention Plugins — Sharing Build Logic

In multi-module projects, you end up repeating the same configuration across modules — compile SDK, Kotlin options, common dependencies, ProGuard rules. Convention plugins let you define that shared configuration once and apply it everywhere.

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

```kotlin
// feature/orders/build.gradle.kts — clean and minimal
plugins {
    id("myapp.android.feature")
}

dependencies {
    implementation(libs.bundles.room)
}
```

The Google "Now In Android" sample app uses this pattern extensively, and it's the approach I recommend for any project with more than three or four modules. Without convention plugins, adding a new feature module means copying 40+ lines of build configuration and hoping you don't miss the one line that's different. With them, it's two lines — apply the convention plugin and add module-specific dependencies.

## Build Cache and Task Avoidance

Gradle's build cache stores the outputs of tasks keyed by their inputs. If you run `:app:compileDebugKotlin` and the inputs (source files, dependencies, compiler options) haven't changed since the last build, Gradle skips execution entirely and uses the cached output. This works across clean builds too — the build cache persists between `./gradlew clean` calls (unless you manually clear it).

The task avoidance API takes this further. Instead of configuring all tasks eagerly during the configuration phase, you register tasks lazily and only configure them when they're actually needed for execution.

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

`tasks.register` instead of `tasks.create` is the task avoidance API. The difference seems small, but on a project with hundreds of custom tasks, it reduces configuration time significantly because Gradle only instantiates and configures tasks that are in the execution path. The Android Gradle Plugin uses task avoidance internally, and you should too for any custom tasks.

## Custom Tasks — Real-World Use Cases

Custom Gradle tasks are useful for automating project-specific workflows. Here are patterns I've used in production.

**Generating version info from git** — useful for embedding the commit hash in your build for crash reporting:

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

## The Reframe — Gradle Is a Programming Language, Not a Config File

Here's the insight that changed how I think about Gradle: **`build.gradle.kts` isn't a configuration file. It's a Kotlin program that runs during your build.** Every line is executable code. The `dependencies {}` block is a function call. The `plugins {}` block is a function call. Understanding this means you can debug build issues the same way you debug application code — add print statements, step through with a debugger, inspect objects.

The tradeoff with this power is that Gradle builds can become slow and complex when developers treat them as application code rather than build configuration. I've seen `build.gradle.kts` files with 200+ lines of custom logic, network calls, file parsing, and conditional compilation. The build system should configure and execute tasks, not run business logic. Keep build files declarative where possible — define what you want, not how to do it — and push complex logic into convention plugins where it can be tested and maintained separately.

The honest truth is that Gradle has a steep learning curve, and the Android build toolchain adds another layer of complexity on top. But once you internalize the three-phase model, understand task dependencies and caching, and learn to use convention plugins and version catalogs, your builds become faster, more reliable, and easier to maintain. The time invested in understanding Gradle pays for itself every day you work on an Android project.

Thank You!
