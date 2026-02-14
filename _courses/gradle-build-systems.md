---
title: "Gradle & Build Systems"
layout: course
description: "Master Gradle for Android — build scripts, plugins, variant management, build optimization, version catalogs, and custom tasks."
icon: "⚙️"
color: "#2dd4bf"
difficulty: "Beginner to Advanced"
modules: 10
lessons: 56
duration: "6 weeks"
order: 7
tags:
  - Gradle
  - Build System
  - Android
what_you_learn:
  - "Write and migrate build scripts using Kotlin DSL"
  - "Centralize dependencies with Version Catalogs (libs.versions.toml)"
  - "Configure build types, product flavors, and signing"
  - "Optimize build speed with caching, parallel execution, and configuration cache"
  - "Create custom Gradle tasks and convention plugins"
  - "Set up CI/CD pipelines with GitHub Actions for Android"
  - "Migrate from KAPT to KSP for faster annotation processing"
  - "Configure R8, ProGuard rules, and Baseline Profiles"
  - "Profile and debug build performance bottlenecks"
  - "Structure multi-module builds with composite builds and build-logic"
prerequisites:
  - "Basic Android project experience"
  - "Terminal/command line familiarity"
---

## Module 1: Gradle Fundamentals

Gradle is the build system behind every Android project. Most developers treat it like a black box — paste dependencies, hit sync, pray. But Gradle is a programmable build system with a well-defined execution model, and understanding that model is the difference between copy-pasting Stack Overflow snippets and actually controlling your build.

### Lesson 1.1: What Gradle Actually Is

Gradle is not just a dependency manager. It's a general-purpose build automation tool that uses a Groovy or Kotlin DSL to define build logic. Android Studio uses Gradle with the Android Gradle Plugin (AGP) to compile source code, merge resources, run annotation processors, generate DEX files, and package everything into an APK or AAB. Every step in that pipeline is a Gradle task, and those tasks are organized into a directed acyclic graph (DAG) that Gradle resolves and executes in dependency order. Once you see the build as a graph of tasks, the entire system makes sense.

The Gradle Wrapper (`gradlew` / `gradlew.bat`) is a script checked into your project that downloads and runs the correct version of Gradle. This ensures every developer and CI server uses the same Gradle version regardless of what's installed globally. The wrapper version is defined in `gradle/wrapper/gradle-wrapper.properties`, and bumping the `distributionUrl` there is how you upgrade Gradle. Never install Gradle globally and use that for Android builds — always use the wrapper.

Gradle's configuration is code. The `build.gradle.kts` file isn't a config file — it's a Kotlin program that runs during your build. The `dependencies {}` block is a function call. The `plugins {}` block is a function call. Understanding this means you can debug build issues the same way you debug application code — add print statements, inspect objects, and trace execution.

**Key takeaway:** Gradle is a programmable build system that models your build as a directed acyclic graph of tasks. The Gradle Wrapper ensures reproducible builds. Build scripts are executable Kotlin programs, not static configuration files.

### Lesson 1.2: Build Script Anatomy

Every Android project has at least two build script files: the root `build.gradle.kts` that declares plugin versions and repository configuration, and a module-level `build.gradle.kts` that configures the actual build for that module. Understanding what belongs where prevents the most common Gradle confusion.

The root build script is the first thing Gradle evaluates after `settings.gradle.kts`. Its primary role is declaring which plugins the project uses and their versions, without applying them. The `plugins` block with `apply false` tells Gradle "make this plugin available to subprojects, but don't apply it here." This pattern ensures plugin versions are defined in one place rather than scattered across modules.

The module-level build script is where actual configuration happens. It applies plugins, configures the Android extension (`android {}`), declares dependencies, and optionally registers custom tasks. Here's a complete module-level build script:

```kotlin
// build.gradle.kts (Module-level)
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.yourapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.yourapp"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(platform(libs.compose.bom))
    implementation(libs.bundles.compose)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    testImplementation(libs.junit)
}
```

**Key takeaway:** Build scripts are code. The root script declares plugin versions, the module script applies and configures them. Treat build files with the same care as application code — keep them clean, documented, and consistent.

### Lesson 1.3: Project Structure and settings.gradle.kts

The `settings.gradle.kts` file is the entry point for your entire Gradle build. It runs during the Initialization phase and tells Gradle which projects participate in the build, where to find plugins, and how to resolve dependencies. For a single-module app, this is trivial. For a multi-module project with 20+ modules, this file defines the entire module graph.

```kotlin
// settings.gradle.kts
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MyApp"
include(":app")
include(":core:data")
include(":core:network")
include(":core:model")
include(":feature:orders")
include(":feature:profile")
```

The `pluginManagement` block configures where Gradle looks for plugins. The `dependencyResolutionManagement` block centralizes repository declarations — `FAIL_ON_PROJECT_REPOS` ensures no module declares its own repositories, keeping resolution consistent. This matters because if module A resolves from Maven Central but module B adds a custom repo, you get inconsistent dependency resolution across the project.

```
project-root/
├── build.gradle.kts          (Root — plugin versions, repositories)
├── settings.gradle.kts       (Module declarations, version catalogs)
├── gradle.properties          (Build properties, JVM args)
├── gradle/
│   ├── libs.versions.toml    (Version catalog)
│   └── wrapper/
│       └── gradle-wrapper.properties
├── build-logic/              (Convention plugins)
│   ├── settings.gradle.kts
│   └── convention/
│       └── build.gradle.kts
├── app/
│   └── build.gradle.kts      (Application module)
├── core/
│   ├── data/
│   │   └── build.gradle.kts  (Library module)
│   ├── network/
│   │   └── build.gradle.kts
│   └── model/
│       └── build.gradle.kts
└── feature/
    ├── orders/
    │   └── build.gradle.kts
    └── profile/
        └── build.gradle.kts
```

If your `settings.gradle.kts` has expensive logic — like network calls to resolve dynamic versions — it slows down every single build invocation, including `./gradlew help`. Keep this file lean and declarative.

**Key takeaway:** `settings.gradle.kts` is the entry point for your build. It defines the module graph, repository strategy, and plugin resolution. Keep it declarative and never put expensive computation here.

### Lesson 1.4: The Three Build Phases

Gradle builds execute in three distinct phases, and understanding when your code runs is critical. Code that runs in the wrong phase is one of the most common causes of slow builds.

**Initialization** is where Gradle determines which projects participate in the build. It reads `settings.gradle.kts`, creates a `Project` object for each included module, and sets up the build environment. For a 20-module project, that's 20 `Project` objects created before any build logic runs.

**Configuration** is where Gradle evaluates all `build.gradle.kts` files and configures every task. Here's the thing most developers miss: configuration runs for *every* task in *every* module, even the ones you're not executing. If you call `./gradlew :app:assembleDebug`, Gradle still configures every module and every task — it just only *executes* the ones in the dependency chain of `assembleDebug`. This is why having expensive logic at the top level of your `build.gradle.kts` is a performance problem — it runs even when you're just running `./gradlew tasks`.

**Execution** is where Gradle actually runs the tasks needed to produce your output. It walks the task dependency graph, skips tasks whose inputs haven't changed (up-to-date checking), pulls results from the build cache where possible, and executes everything else. This is the only phase where real work should happen.

I've seen builds where someone computed a git hash by executing `git rev-parse HEAD` at the top level of `build.gradle.kts`. That shell command ran for every module on every build invocation. Moving it into a task — so it only runs during execution, and only when needed — cut the configuration phase from 8 seconds to under 1 second.

**Key takeaway:** Configuration happens for ALL tasks, not just the ones you run. Never put expensive computation in the configuration phase — use providers and lazy evaluation to defer work to the execution phase.

### Lesson 1.5: Tasks and the Task Graph

Every Gradle build boils down to running tasks. A task is a unit of work — compiling Kotlin, merging resources, generating DEX files, running tests. Tasks declare inputs, outputs, and dependencies on other tasks, forming a directed acyclic graph that Gradle traverses during execution.

```bash
# List all available tasks
./gradlew tasks --all

# Run a specific task
./gradlew assembleDebug

# Run with dependency insight
./gradlew :app:dependencies --configuration runtimeClasspath

# Dry run — see what would execute without running it
./gradlew assembleDebug --dry-run

# Run with detailed logging
./gradlew assembleDebug --info
```

When you run `./gradlew assembleDebug`, Gradle doesn't just run one task. It resolves the full dependency chain: `compileDebugKotlin` depends on `generateDebugBuildConfig` and `processDebugResources`, which depend on `mergeDebugResources`, and so on. The `--dry-run` flag shows you this entire chain without executing anything — extremely useful for understanding what a build actually does.

Task avoidance is one of Gradle's most powerful features. If a task's inputs haven't changed since the last run, Gradle marks it UP-TO-DATE and skips it entirely. This is why incremental builds are fast — after changing a single file, only the tasks whose inputs are affected actually run. The build cache extends this further by storing task outputs keyed by their inputs, allowing reuse even across clean builds and different machines.

The `--dry-run` flag is underrated. Before adding a new plugin or dependency, run a dry-run to see how it affects the task graph. I've caught plugins that silently registered 20+ tasks across every module just by checking what `--dry-run` showed before and after adding the plugin.

**Key takeaway:** Tasks form a dependency graph. Gradle skips tasks whose inputs haven't changed. Use `--dry-run` to understand the task graph and `--info` to debug build issues.

### Lesson 1.6: The Android Build Pipeline

When you hit "Run" in Android Studio, the Android Gradle Plugin orchestrates a pipeline of tasks. The high-level flow goes: compile Kotlin/Java → run annotation processors (Room, Hilt) → merge resources → transform bytecode → generate DEX files → package into APK/AAB → sign → align. Each step is a Gradle task chained through declared inputs and outputs.

The DEX step is worth understanding. Android doesn't run JVM bytecode directly — it runs Dalvik Executable (DEX) format on the ART runtime. The dexing task converts `.class` files into `.dex` files. For apps that exceed 64K methods, multidex kicks in and splits the output into multiple DEX files. This is handled automatically by AGP when you set `minSdk` to 21 or higher, because ART natively supports multidex. Below API 21, you need the multidex support library.

Resource merging is another important step. Android merges resources from your module, its library dependencies, and the Android SDK into a single resource set. Conflicts are resolved by priority — your module's resources override library resources, and build-type-specific resources override the defaults. Understanding this hierarchy helps debug cases where a resource doesn't look right in a specific build variant.

The signing step at the end is what makes an APK installable. Debug builds use a default keystore automatically generated by the SDK. Release builds require a custom keystore with a private key. The signed APK then goes through ZIP alignment (`zipalign`) to optimize it for memory-mapped access on the device.

**Key takeaway:** The Android build is a pipeline of Gradle tasks: compile → process annotations → merge resources → DEX → package → sign → align. Each step has inputs and outputs that Gradle tracks for incremental builds.

### Quiz: Gradle Fundamentals

#### What are the three phases of the Gradle build lifecycle?

- ❌ Compilation, Linking, Execution
- ❌ Setup, Build, Deploy
- ✅ Initialization, Configuration, Execution
- ❌ Download, Compile, Package

> **Explanation:** Gradle's build lifecycle consists of Initialization (determines which projects are in the build), Configuration (configures all tasks), and Execution (runs the requested tasks).

#### Why should you migrate from Groovy (`.gradle`) to Kotlin DSL (`.gradle.kts`)?

- ❌ Kotlin DSL builds are faster than Groovy builds
- ✅ Kotlin DSL provides IDE autocomplete, type safety, and refactoring support
- ❌ Groovy is deprecated and no longer supported by Gradle
- ❌ Kotlin DSL files are smaller in size

> **Explanation:** Kotlin DSL gives you IDE autocomplete, type safety, and refactoring support. Groovy is still supported, but Kotlin DSL is the recommended approach for Android projects.

#### Which file declares the modules included in a Gradle project?

- ❌ build.gradle.kts
- ❌ gradle.properties
- ✅ settings.gradle.kts
- ❌ gradle-wrapper.properties

> **Explanation:** `settings.gradle.kts` is where you declare which modules are included in the build via `include()` statements. It's evaluated during the Initialization phase.

#### During which phase does Gradle evaluate `build.gradle.kts` files?

- ❌ Initialization
- ✅ Configuration
- ❌ Execution
- ❌ Compilation

> **Explanation:** The Configuration phase evaluates all `build.gradle.kts` files and configures every task in every module, even tasks that won't run. This is why expensive top-level code slows down every build command.

### Coding Challenge: Register a Custom Greeting Task

Create a custom Gradle task called `greetDeveloper` that prints a greeting message including the project name and the current date. Register it under the `"custom"` group.

#### Solution

```kotlin
// In your module's build.gradle.kts
tasks.register("greetDeveloper") {
    group = "custom"
    description = "Prints a greeting with project name and date"

    doLast {
        val date = java.time.LocalDate.now()
        println("Hello from ${project.name}! Today is $date")
    }
}
```

The task is registered lazily using `tasks.register` (not `tasks.create`), which means Gradle only configures it when it's actually needed. The `doLast` block ensures the print logic runs during the Execution phase, not during Configuration. Run it with `./gradlew greetDeveloper`.

---

## Module 2: Kotlin DSL Deep Dive

Kotlin DSL is the modern way to write Gradle build scripts. It replaces the Groovy-based `.gradle` files with `.gradle.kts` files that are full Kotlin programs with type safety, IDE autocomplete, and refactoring support.

### Lesson 2.1: Kotlin DSL Fundamentals

Kotlin DSL uses Kotlin language features — extension functions, lambdas with receivers, and property delegation — to create a declarative build configuration that's still fully programmable. When you write `android { compileSdk = 35 }`, you're calling an extension function `android` with a lambda that configures an `ApplicationExtension` or `LibraryExtension` object. The `compileSdk = 35` line is a property assignment on that extension.

This matters because understanding the DSL as Kotlin code unlocks debugging. If `compileSdk` shows a red underline, it's because the extension type doesn't have that property — probably because you applied the wrong plugin. If `libs.compose.bom` doesn't resolve, it's because the version catalog accessor isn't generated yet — try syncing the project or checking the TOML file for typos.

The biggest win over Groovy is compile-time checking. In Groovy DSL, a typo like `implmentation` instead of `implementation` compiles fine and fails silently or at runtime. In Kotlin DSL, the compiler catches it immediately. For teams with 20+ modules, each with their own build file, this alone prevents hours of debugging per month.

One quirk to know: first-time project sync with Kotlin DSL is slower than Groovy because the IDE needs to compile and index the build scripts for type resolution. After the initial sync, autocomplete and navigation work just like regular Kotlin code.

**Key takeaway:** Kotlin DSL turns build scripts into real Kotlin programs with compile-time checking, IDE autocomplete, and refactoring support. It's slower on first sync but prevents entire categories of build configuration bugs.

### Lesson 2.2: Migrating from Groovy to Kotlin DSL

Migration from Groovy to Kotlin DSL is mostly mechanical, but there are several syntax differences that trip people up. The key changes are: single quotes become double quotes, parentheses are required for method calls, assignment uses `=` instead of a space, and the `plugins` block syntax changes slightly.

```kotlin
// Groovy: build.gradle
// apply plugin: 'com.android.application'
// android {
//     compileSdkVersion 35
//     defaultConfig {
//         minSdkVersion 24
//     }
// }
// dependencies {
//     implementation 'androidx.core:core-ktx:1.15.0'
// }

// Kotlin DSL: build.gradle.kts
plugins {
    id("com.android.application")
}
android {
    compileSdk = 35
    defaultConfig {
        minSdk = 24
    }
}
dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
}
```

The practical approach to migration is to go one file at a time. Start with `settings.gradle` → `settings.gradle.kts`, then the root `build.gradle` → `build.gradle.kts`, then module files one at a time. Rename the file extension, fix the compilation errors, sync, and verify the build passes. The Android Studio "Migrate to Kotlin DSL" option works for simple projects but struggles with complex custom logic — manual migration is more reliable.

One gotcha that catches most teams: `extra` properties. In Groovy, you'd set `ext.compileSdkVersion = 35` in the root build file and reference it in modules. In Kotlin DSL, the equivalent is `extra["compileSdkVersion"] = 35` with `val compileSdkVersion: Int by rootProject.extra` in consuming modules. But this pattern is fragile and not type-safe — version catalogs are the proper replacement for shared constants.

**Key takeaway:** Migration is mostly syntax translation: double quotes, parentheses for method calls, `=` for assignment. Migrate one file at a time, starting with `settings.gradle.kts`. Replace `ext` properties with version catalogs.

### Lesson 2.3: Type-Safe Accessors and Extensions

When you apply a plugin in Kotlin DSL, Gradle generates type-safe accessors for the extensions that plugin provides. The `android {}` block, the `dependencies {}` block, and even custom plugin extensions all get generated Kotlin code that provides autocomplete and compile-time checking.

```kotlin
// These are generated accessors — not magic
android {
    // 'android' is an extension function generated when you apply
    // the Android plugin. It configures an ApplicationExtension.
    namespace = "com.yourapp"
    compileSdk = 35

    defaultConfig {
        // defaultConfig is a nested extension with its own properties
        applicationId = "com.yourapp"
        minSdk = 24
        targetSdk = 35
    }
}

// The 'libs' accessor in dependencies is generated from
// the version catalog in gradle/libs.versions.toml
dependencies {
    implementation(libs.androidx.core.ktx)
}
```

You can also create your own extensions for custom configuration:

```kotlin
// Define a custom extension in a convention plugin
abstract class AppConfigExtension {
    abstract val appName: Property<String>
    abstract val apiBaseUrl: Property<String>
}

// Register it in a plugin
class AppConfigPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        val extension = target.extensions.create<AppConfigExtension>("appConfig")

        target.afterEvaluate {
            println("App: ${extension.appName.get()}")
            println("API: ${extension.apiBaseUrl.get()}")
        }
    }
}

// Use it in a module's build.gradle.kts
appConfig {
    appName.set("My Application")
    apiBaseUrl.set("https://api.yourapp.com")
}
```

The `afterEvaluate` block is necessary here because the extension values aren't set until after the build script finishes evaluating. In production convention plugins, you'd use `providers` and `Property` types instead to keep everything lazy.

**Key takeaway:** Kotlin DSL generates type-safe accessors for all plugin extensions. You get IDE autocomplete for `android {}`, `dependencies {}`, and custom extensions. Understanding that these are generated extension functions helps debug resolution issues.

### Lesson 2.4: Providers and Lazy Configuration

Gradle's `Provider` and `Property` APIs are the mechanism for lazy configuration — deferring value resolution from configuration time to execution time. This is critical for build performance because it means expensive computations only happen when a task actually needs the value.

```kotlin
// BAD: Eager — runs during configuration phase, every build
val gitHash = Runtime.getRuntime()
    .exec("git rev-parse --short HEAD")
    .inputStream.bufferedReader().readText().trim()

android {
    defaultConfig {
        buildConfigField("String", "GIT_HASH", "\"$gitHash\"")
    }
}

// GOOD: Lazy — only runs when BuildConfig is actually generated
val gitHashProvider = providers.exec {
    commandLine("git", "rev-parse", "--short", "HEAD")
}.standardOutput.asText.map { it.trim() }

android {
    defaultConfig {
        buildConfigField(
            "String",
            "GIT_HASH",
            gitHashProvider.map { "\"$it\"" }
        )
    }
}
```

The `Property<T>` type is what you use in custom tasks and extensions. It wraps a value that can be set during configuration but resolved lazily during execution. Combined with `@Input` and `@OutputFile` annotations, properties enable Gradle's up-to-date checking and build cache:

```kotlin
abstract class VersionPropertiesTask : DefaultTask() {

    @get:Input
    abstract val versionName: Property<String>

    @get:Input
    abstract val versionCode: Property<Int>

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    @TaskAction
    fun generate() {
        val props = buildString {
            appendLine("versionName=${versionName.get()}")
            appendLine("versionCode=${versionCode.get()}")
            appendLine("buildTime=${System.currentTimeMillis()}")
        }
        outputFile.get().asFile.writeText(props)
    }
}

tasks.register<VersionPropertiesTask>("generateVersionProps") {
    versionName.set(android.defaultConfig.versionName)
    versionCode.set(android.defaultConfig.versionCode)
    outputFile.set(layout.buildDirectory.file("version.properties"))
}
```

**Key takeaway:** Use `Provider` and `Property` types to defer computation to execution time. Eager computation in the configuration phase runs on every build command. Lazy providers only compute when the value is actually needed.

### Lesson 2.5: Kotlin DSL Best Practices

After migrating several projects to Kotlin DSL, there are patterns that consistently make build scripts cleaner and more maintainable.

First, use the `plugins` block with `alias()` for version catalog references instead of `id()` with inline versions. This keeps versions in one place and gives you type-safe plugin references:

```kotlin
// Preferred — version from catalog
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Avoid — version hardcoded in build script
plugins {
    id("com.android.application") version "8.8.0"
    id("org.jetbrains.kotlin.android") version "2.1.0"
}
```

Second, prefer `layout.buildDirectory` over `project.buildDir` for output paths. The old `buildDir` property is deprecated and doesn't work well with configuration cache. `layout.buildDirectory` returns a `DirectoryProperty` that plays nicely with Gradle's lazy API.

Third, avoid `subprojects {}` and `allprojects {}` blocks in the root build script. They force configuration of all modules even when building a single one, and they break configuration cache. Convention plugins are the proper replacement — they apply configuration only to modules that opt in.

```kotlin
// BAD: Forces configuration on all subprojects
subprojects {
    tasks.withType<KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }
}

// GOOD: Convention plugin applied per-module
// build-logic/convention/src/main/kotlin/KotlinConventionPlugin.kt
class KotlinConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        target.extensions.configure<KotlinAndroidProjectExtension> {
            compilerOptions {
                jvmTarget.set(JvmTarget.JVM_17)
            }
        }
    }
}
```

**Key takeaway:** Use `alias()` for plugin references, `layout.buildDirectory` for output paths, and convention plugins instead of `allprojects`/`subprojects` blocks. These patterns make builds faster, cacheable, and easier to maintain.

### Quiz: Kotlin DSL Deep Dive

#### What is the main advantage of Kotlin DSL (`.gradle.kts`) over Groovy (`.gradle`)?

- ❌ Kotlin DSL builds execute faster at runtime
- ✅ Kotlin DSL provides compile-time type checking and IDE autocomplete
- ❌ Kotlin DSL files are shorter and more concise
- ❌ Kotlin DSL supports more Gradle plugins

> **Explanation:** Kotlin DSL provides compile-time type checking — a typo like `implmentation` instead of `implementation` is caught by the compiler immediately. Groovy DSL would accept it silently and fail at runtime or produce unexpected behavior.

#### Why should you avoid `subprojects {}` in the root `build.gradle.kts`?

- ❌ It only works with Groovy DSL, not Kotlin DSL
- ❌ It prevents modules from having their own build files
- ✅ It forces configuration of all modules and breaks configuration cache
- ❌ It is deprecated in Gradle 9.0

> **Explanation:** `subprojects {}` eagerly configures all modules even when building a single one. This adds unnecessary configuration time and is incompatible with Gradle's configuration cache. Convention plugins are the proper alternative.

#### What does `providers.exec {}` do compared to `Runtime.getRuntime().exec()`?

- ❌ It runs the command in a sandboxed environment
- ❌ It provides better error messages
- ✅ It defers command execution from configuration time to when the value is actually needed
- ❌ It runs the command asynchronously in a background thread

> **Explanation:** `providers.exec` creates a lazy provider. The command only executes when the provider's value is resolved during the execution phase. `Runtime.getRuntime().exec()` runs immediately during configuration, slowing down every Gradle command.

### Coding Challenge: Create a Lazy Build Info Provider

Create a task that generates a `build-info.json` file containing the git commit hash, branch name, and build timestamp. Use `providers.exec` for the git commands so they only run when the task executes.

#### Solution

```kotlin
abstract class BuildInfoTask : DefaultTask() {

    @get:Input
    abstract val gitHash: Property<String>

    @get:Input
    abstract val gitBranch: Property<String>

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    @TaskAction
    fun generate() {
        val json = buildString {
            appendLine("{")
            appendLine("  \"commitHash\": \"${gitHash.get()}\",")
            appendLine("  \"branch\": \"${gitBranch.get()}\",")
            appendLine("  \"buildTime\": \"${java.time.Instant.now()}\"")
            appendLine("}")
        }
        outputFile.get().asFile.writeText(json)
    }
}

tasks.register<BuildInfoTask>("generateBuildInfo") {
    group = "custom"

    gitHash.set(providers.exec {
        commandLine("git", "rev-parse", "--short", "HEAD")
    }.standardOutput.asText.map { it.trim() })

    gitBranch.set(providers.exec {
        commandLine("git", "rev-parse", "--abbrev-ref", "HEAD")
    }.standardOutput.asText.map { it.trim() })

    outputFile.set(layout.buildDirectory.file("build-info.json"))
}
```

The `providers.exec` calls are lazy — the git commands only run when the task actually executes. The `@Input` annotations on the properties enable up-to-date checking: if the commit hash and branch haven't changed, Gradle skips the task entirely.

---

## Module 3: Version Catalogs and Dependency Management

Before version catalogs, multi-module projects managed dependencies through `ext` blocks in the root `build.gradle`, `buildSrc` constants, or convention plugins. Each had tradeoffs — `ext` blocks weren't type-safe, `buildSrc` invalidated the entire build cache when any constant changed, and convention plugins required more setup. Version catalogs solve all of this.

### Lesson 3.1: libs.versions.toml Structure

Version catalogs (introduced in Gradle 7.0, stable since 7.4) centralize dependency declarations in a `gradle/libs.versions.toml` file. Gradle reads this file and generates type-safe accessors that you use in build scripts. The TOML file has four sections: `[versions]` for version strings, `[libraries]` for dependency coordinates, `[bundles]` for groups of related libraries, and `[plugins]` for Gradle plugin declarations.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.1.0"
agp = "8.8.0"
compose-bom = "2025.01.01"
hilt = "2.53.1"
coroutines = "1.10.1"
room = "2.7.0"
retrofit = "2.11.0"
okhttp = "4.12.0"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version = "1.15.0" }
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler = { group = "com.google.dagger", name = "hilt-android-compiler", version.ref = "hilt" }
room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }
retrofit-core = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-converter-kotlinx = { group = "com.squareup.retrofit2", name = "converter-kotlinx-serialization", version.ref = "retrofit" }
okhttp-core = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
okhttp-logging = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }
coroutines-core = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-core", version.ref = "coroutines" }
coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }

[bundles]
compose = ["compose-ui", "compose-material3", "compose-ui-tooling-preview"]
room = ["room-runtime", "room-ktx"]
networking = ["retrofit-core", "retrofit-converter-kotlinx", "okhttp-core", "okhttp-logging"]
coroutines = ["coroutines-core", "coroutines-android"]

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
ksp = { id = "com.google.devtools.ksp", version = "2.1.0-1.0.29" }
```

The naming convention for libraries matters — hyphens in the key become dots in the accessor. So `compose-material3` becomes `libs.compose.material3` and `room-runtime` becomes `libs.room.runtime`. Keeping a consistent naming scheme makes the accessors predictable.

**Key takeaway:** Version catalogs centralize all dependency declarations in one TOML file. Gradle generates type-safe accessors. Changing a version is a one-line edit in one file, and it doesn't invalidate the build cache the way `buildSrc` changes do.

### Lesson 3.2: Bundles and BOMs

Bundles group related libraries so you can add them with a single line. Instead of declaring five Compose dependencies individually, `implementation(libs.bundles.compose)` adds them all. But bundles have a limitation — they can only reference libraries already declared in the `[libraries]` section, and all libraries in a bundle use the same dependency configuration (`implementation`, `api`, etc.).

BOMs (Bill of Materials) solve a different problem — version alignment across a family of libraries. The Compose BOM ensures all Compose libraries use compatible versions even though they're released independently. When you use a BOM, you declare individual libraries without versions — the BOM provides them:

```kotlin
dependencies {
    // BOM provides versions for all Compose libraries
    implementation(platform(libs.compose.bom))

    // No version needed — the BOM handles it
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    // Bundle for non-BOM libraries
    implementation(libs.bundles.networking)

    // Room — bundle plus separate KSP dependency
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)
}
```

The key distinction: bundles are a version catalog feature that groups dependency declarations. BOMs are a Maven concept that aligns versions across a library family. You can use both together — the BOM manages Compose versions while bundles group your networking or database libraries.

One thing to watch out for: when you add a library to a bundle, every module that uses that bundle gets the new dependency. This can bloat modules that don't need it. I prefer keeping bundles small and focused — `compose-ui`, `room`, `networking` — rather than creating giant bundles that pull in half your dependency graph.

**Key takeaway:** Bundles group related version catalog entries for single-line imports. BOMs align versions across a library family. Use both: BOMs for Compose, bundles for your own library groups. Keep bundles small and focused.

### Lesson 3.3: Dependency Configurations Explained

Gradle dependency configurations control how dependencies are exposed across modules and build phases. Choosing the wrong configuration — using `api` where `implementation` is sufficient — leaks transitive dependencies and slows compilation across your entire module graph.

```kotlin
dependencies {
    // implementation — available to this module only, not exposed to consumers
    implementation(libs.retrofit.core)

    // api — exposed to consumers of this module (use sparingly)
    api(libs.okhttp.core)

    // compileOnly — available at compile time, not in APK
    compileOnly(libs.annotation.processor)

    // runtimeOnly — in APK but not available at compile time
    runtimeOnly(libs.slf4j.android)

    // ksp — Kotlin Symbol Processing
    ksp(libs.room.compiler)

    // testImplementation — unit test classpath only
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)

    // androidTestImplementation — instrumented test classpath
    androidTestImplementation(libs.compose.test)

    // debugImplementation — debug builds only
    debugImplementation(libs.leakcanary)
}
```

The `implementation` vs `api` distinction matters more than most people realize. When module A declares `api(libs.okhttp)`, every module that depends on A can see and use OkHttp's classes directly. When module A declares `implementation(libs.okhttp)`, OkHttp is an internal detail — consumers of A can't access OkHttp classes. The build impact: changing an `api` dependency triggers recompilation of every downstream module, while changing an `implementation` dependency only recompiles the declaring module.

Rule of thumb: use `implementation` by default. Switch to `api` only when the dependency's types appear in your module's public API — for example, if your module's public interface returns an OkHttp `Response` type, OkHttp must be `api`. If your module wraps OkHttp internally and exposes its own types, keep it as `implementation`.

**Key takeaway:** Prefer `implementation` over `api` to limit the recompilation blast radius. Use `api` only when dependency types appear in your module's public interface. Use `debugImplementation` for dev-only tools and `ksp` over `kapt` for annotation processing.

### Lesson 3.4: Dependency Resolution and Conflict Management

When multiple modules or transitive dependencies pull in different versions of the same library, Gradle resolves the conflict using a default strategy: highest version wins. This usually works, but it can introduce subtle bugs when a transitive dependency upgrades to a version with breaking changes.

```kotlin
// Check what version Gradle resolved for a specific dependency
// ./gradlew :app:dependencies --configuration runtimeClasspath

// Force a specific version across the entire project
configurations.all {
    resolutionStrategy {
        force("com.squareup.okhttp3:okhttp:4.12.0")
    }
}

// Or use dependency constraints for a softer approach
dependencies {
    constraints {
        implementation("com.squareup.okhttp3:okhttp:4.12.0") {
            because("Version 4.13 has a known connection pool bug")
        }
    }
}
```

Dependency locking goes further — it records every resolved version into a lockfile that's committed to version control. This ensures builds are reproducible regardless of when you build:

```kotlin
// Enable dependency locking
dependencyLocking {
    lockAllConfigurations()
}
```

Run `./gradlew dependencies --write-locks` to generate the lockfile, then commit it. This is the same concept as `package-lock.json` in npm — reproducible dependency resolution is not optional for production software. Dynamic versions like `implementation("com.squareup.okhttp3:okhttp:4.+")` are dangerous because the same code can produce different APKs depending on when you build.

**Key takeaway:** Gradle resolves version conflicts by picking the highest version. Use `force()` or dependency constraints to pin critical versions. Enable dependency locking for reproducible builds — dynamic versions have no place in production.

### Lesson 3.5: Version Catalog vs buildSrc vs ext

The big advantage of version catalogs over `buildSrc` is incremental. Changing a version in `libs.versions.toml` doesn't invalidate the entire build cache the way changing a constant in `buildSrc` does. On a 20-module project, that difference can save minutes per build.

With `buildSrc`, you'd define dependency versions as constants in a Kotlin object:

```kotlin
// buildSrc/src/main/kotlin/Dependencies.kt
// AVOID — any change here invalidates ALL module caches
object Versions {
    const val kotlin = "2.1.0"
    const val compose = "2025.01.01"
}

object Deps {
    const val coreKtx = "androidx.core:core-ktx:1.15.0"
}
```

The problem is that `buildSrc` is compiled as part of the build initialization. Any source change in `buildSrc` — even a comment — triggers a full recompilation of the `buildSrc` module, which then invalidates the configuration cache for every module in the project. On a 20-module project, bumping one version means recompiling everything from scratch.

Version catalogs are parsed, not compiled. They're declarative TOML that Gradle reads and generates accessors from. Changing a version only affects modules that depend on that specific library. The other approach — `ext` blocks — has the same cache issue as `buildSrc` plus the absence of type safety. `ext["kotlin_version"]` is a string that could be anything, and typos compile fine in Groovy.

If you still have `buildSrc` with dependency constants, the migration path is straightforward: move the versions and coordinates into `libs.versions.toml`, replace `buildSrc` references with catalog accessors, and delete the `buildSrc` dependency objects. Keep `buildSrc` only for complex build logic that needs real Kotlin code, and even then consider moving it to `build-logic/` as a composite build.

**Key takeaway:** Version catalogs are the standard for dependency management. They're declarative, type-safe, and don't invalidate the build cache. Migrate from `buildSrc` constants and `ext` blocks to `libs.versions.toml`.

### Lesson 3.6: Dependency Analysis Plugin

Most teams think they know their dependency graph, but every multi-module project has unused dependencies and misused `api` vs `implementation` declarations. Gradle doesn't tell you about this — you declare a dependency, stop using it six months later, and nobody notices because the build still compiles.

The Dependency Analysis Gradle Plugin by Tony Robalik catches exactly this. It scans your bytecode and source to determine which dependencies are actually used, which are unused, which are used transitively but should be declared directly, and which `api` dependencies should be `implementation`:

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

Run `./gradlew buildHealth` and it produces a report telling you exactly what to fix — which dependencies to remove, which to add, and which to change from `api` to `implementation`. On a 20-module project I ran it on, it found 34 unused dependencies and 12 incorrect `api` vs `implementation` declarations. Removing the unused ones shaved 8 seconds off a clean build. Setting the severity to `fail` means CI catches any regressions going forward.

**Key takeaway:** Use the Dependency Analysis Plugin to find unused dependencies and incorrect `api`/`implementation` declarations. Run `./gradlew buildHealth` regularly. Set severity to `fail` in CI to prevent regressions.

### Quiz: Version Catalogs and Dependency Management

#### In `libs.versions.toml`, what does `version.ref` do in a library declaration?

- ❌ It pins the library to a fixed version that cannot be overridden
- ❌ It creates a new version entry automatically
- ✅ It references a version defined in the `[versions]` section
- ❌ It fetches the latest version from Maven Central

> **Explanation:** `version.ref` points to a named version in the `[versions]` section, allowing multiple libraries to share the same version (e.g., Room runtime and Room KTX both using `version.ref = "room"`).

#### What is the key advantage of version catalogs over `buildSrc` for dependency management?

- ❌ Version catalogs support more dependency formats
- ❌ Version catalogs provide better IDE support
- ✅ Changing a version catalog entry doesn't invalidate the entire build cache
- ❌ Version catalogs can resolve dependencies from private repositories

> **Explanation:** `buildSrc` is compiled as part of build initialization — any source change invalidates the configuration cache for every module. Version catalogs are declarative TOML files that only invalidate modules depending on the changed library.

#### When should you use `api` instead of `implementation` for a dependency?

- ❌ When the dependency is used frequently across the module
- ❌ When you want faster compilation times
- ✅ When the dependency's types appear in your module's public API
- ❌ When the dependency is a Google library

> **Explanation:** Use `api` only when your module exposes types from the dependency in its public interfaces or classes. `implementation` keeps the dependency internal and limits the recompilation blast radius when the dependency changes.

### Coding Challenge: Extend the Version Catalog with a Networking Stack

Add Retrofit, OkHttp, and kotlinx.serialization to the version catalog with proper version refs, create a networking bundle, and configure them in a build script with the KSP plugin for the serialization compiler.

#### Solution

```toml
# In gradle/libs.versions.toml
[versions]
retrofit = "2.11.0"
okhttp = "4.12.0"
kotlinx-serialization = "1.7.3"

[libraries]
retrofit-core = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-converter-kotlinx = { group = "com.squareup.retrofit2", name = "converter-kotlinx-serialization", version.ref = "retrofit" }
okhttp-core = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
okhttp-logging = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }
kotlinx-serialization-json = { group = "org.jetbrains.kotlinx", name = "kotlinx-serialization-json", version.ref = "kotlinx-serialization" }

[bundles]
networking = ["retrofit-core", "retrofit-converter-kotlinx", "okhttp-core", "okhttp-logging", "kotlinx-serialization-json"]

[plugins]
kotlinx-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
```

```kotlin
// In core/network/build.gradle.kts
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlinx.serialization)
}

dependencies {
    implementation(libs.bundles.networking)
}
```

The serialization plugin is a compiler plugin, not an annotation processor — so no `ksp()` or `kapt()` dependency is needed. It generates serializers at compile time as part of the Kotlin compilation step.

---

## Module 4: Build Variants, Flavors, and Signing

Build variants let you create different versions of your app from the same codebase — debug builds with extra logging, staging builds pointing at test servers, free and paid tiers with different feature sets. Understanding variants is essential for any production Android project.

### Lesson 4.1: Build Types

Build types define compilation and packaging behavior. Every Android project has at least two: `debug` and `release`. Debug builds are unoptimized with debugging enabled, while release builds enable R8 code shrinking and require a signing key.

```kotlin
android {
    buildTypes {
        debug {
            isDebuggable = true
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            // Debug builds don't minify — faster iteration
            isMinifyEnabled = false
        }

        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }

        // Custom build type for staging/QA
        create("staging") {
            initWith(getByName("release"))
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            isDebuggable = true
            // Inherit all release settings but allow debugging
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}
```

The `initWith()` method copies configuration from an existing build type. The staging type above inherits all release settings (minification, resource shrinking, ProGuard rules) but overrides debuggability and signing. This is useful for QA testing against a build that's close to production but allows debugging.

The `applicationIdSuffix` property is critical for side-by-side installation. With `.debug` and `.staging` suffixes, you can install debug, staging, and release versions on the same device simultaneously. Each has a unique application ID on the device, so they don't conflict.

**Key takeaway:** Build types control compilation behavior (minification, debugging, signing). Use `initWith()` to create custom types based on existing ones. Add `applicationIdSuffix` for side-by-side installation of different variants.

### Lesson 4.2: Product Flavors

Product flavors represent different versions of your app — environments (staging, production), distribution channels (playStore, galaxy), or feature tiers (free, paid). Flavors operate on a different axis than build types, and Gradle combines them to produce the full set of build variants.

```kotlin
android {
    flavorDimensions += "environment"

    productFlavors {
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            buildConfigField("String", "API_URL", "\"https://staging-api.yourapp.com\"")
            buildConfigField("Boolean", "ENABLE_LOGGING", "true")
            resValue("string", "app_name", "YourApp Staging")
        }

        create("production") {
            dimension = "environment"
            buildConfigField("String", "API_URL", "\"https://api.yourapp.com\"")
            buildConfigField("Boolean", "ENABLE_LOGGING", "false")
            resValue("string", "app_name", "YourApp")
        }
    }
}
```

The `buildConfigField` method generates constants in the `BuildConfig` class that you access at runtime: `BuildConfig.API_URL`, `BuildConfig.ENABLE_LOGGING`. The `resValue` method generates Android resources — useful for changing the app name per flavor without duplicating `strings.xml` files.

Each flavor can also have its own source set. Files in `src/staging/` override or supplement files in `src/main/`. This lets you provide flavor-specific implementations — for example, a mock API client in staging and a real one in production — without conditional code in your main source set.

**Key takeaway:** Use build types for debug/release configuration. Use product flavors for environment or brand variations. Combined, they create build variants: `stagingDebug`, `productionRelease`, etc. Flavor-specific source sets (`src/staging/`) allow implementation differences without runtime conditionals.

### Lesson 4.3: Multi-Dimension Flavors

Real-world projects often need more than one flavor dimension. An e-commerce app might need both environment variants (staging, production) and tier variants (free, paid). Gradle generates the Cartesian product of all dimensions crossed with all build types.

```kotlin
android {
    flavorDimensions += listOf("environment", "tier")

    productFlavors {
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            buildConfigField("String", "API_URL", "\"https://staging-api.yourapp.com\"")
        }
        create("production") {
            dimension = "environment"
            buildConfigField("String", "API_URL", "\"https://api.yourapp.com\"")
        }
        create("free") {
            dimension = "tier"
            buildConfigField("Boolean", "PREMIUM_FEATURES", "false")
        }
        create("paid") {
            dimension = "tier"
            buildConfigField("Boolean", "PREMIUM_FEATURES", "true")
        }
    }

    // Filter out unnecessary combinations
    androidComponents {
        beforeVariants { variant ->
            // Don't build staging + paid — not needed for testing
            if (variant.productFlavors.containsAll(
                listOf("environment" to "staging", "tier" to "paid")
            )) {
                variant.enable = false
            }
        }
    }
}
```

With 2 environments × 2 tiers × 3 build types (debug, staging, release), Gradle generates 12 variants. That's a lot of build tasks and IDE configuration. The `androidComponents.beforeVariants` block lets you disable combinations you don't need — this reduces configuration time and keeps the variant selector manageable in Android Studio.

Source set priority with multi-dimension flavors follows a specific order. For the `stagingFreeDebug` variant, sources are merged in this priority (highest to lowest): `src/stagingFreeDebug/` → `src/stagingFree/` → `src/stagingDebug/` → `src/staging/` → `src/freeDebug/` → `src/free/` → `src/debug/` → `src/main/`. In practice, most teams only use `src/main/` plus flavor-specific directories like `src/staging/` and `src/production/`.

**Key takeaway:** Multi-dimension flavors create Cartesian product variants. Use `androidComponents.beforeVariants` to disable unnecessary combinations. Source sets follow a priority ordering based on the dimension and build type combination.

### Lesson 4.4: Signing Configuration

Release builds must be signed with a private key. The signing configuration should never hardcode keystore passwords in build scripts — they should come from environment variables or a local properties file that's excluded from version control.

```kotlin
android {
    signingConfigs {
        create("release") {
            val keystoreFile = rootProject.file("keystore/release.jks")
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                    ?: project.findProperty("KEYSTORE_PASSWORD") as? String
                    ?: error("KEYSTORE_PASSWORD not set")
                keyAlias = System.getenv("KEY_ALIAS")
                    ?: project.findProperty("KEY_ALIAS") as? String
                    ?: error("KEY_ALIAS not set")
                keyPassword = System.getenv("KEY_PASSWORD")
                    ?: project.findProperty("KEY_PASSWORD") as? String
                    ?: error("KEY_PASSWORD not set")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

The pattern above tries environment variables first (for CI), then falls back to `gradle.properties` (for local development). The `gradle.properties` file containing passwords should be in your home directory (`~/.gradle/gradle.properties`), not in the project, and should never be committed to version control.

For local development, create `~/.gradle/gradle.properties`:

```properties
# Never commit this file to version control
KEYSTORE_PASSWORD=your_keystore_password
KEY_ALIAS=your_key_alias
KEY_PASSWORD=your_key_password
```

In CI environments like GitHub Actions, store these as encrypted secrets and pass them as environment variables. The keystore file itself can be base64-encoded and stored as a secret, then decoded during the CI build step.

**Key takeaway:** Never hardcode signing credentials in build scripts. Use environment variables (CI) or `~/.gradle/gradle.properties` (local). The keystore file stays in the repo but passwords come from external sources.

### Lesson 4.5: Disabling Unused Build Features

The Android Gradle Plugin enables several build features by default — `BuildConfig` generation, AIDL support, RenderScript, view binding, and more. If you're using Compose exclusively and don't need these features, they're adding compilation time to every build. Disabling unused features in every module shaves seconds off each build.

```kotlin
// In a convention plugin or per-module build.gradle.kts
android {
    buildFeatures {
        buildConfig = false    // Enable only in modules that need BuildConfig
        aidl = false           // Unless you use IPC
        renderScript = false   // Deprecated, almost never needed
        resValues = false      // Unless you use resValue() in build scripts
        shaders = false        // Unless you use OpenGL shaders
    }
}
```

Enable only what you actually use. If your app module needs `BuildConfig` for version info and API URLs, enable it there but keep it disabled in library modules. The principle is that every enabled build feature adds a code generation step — multiply that by your module count and the savings are real. On a 30-module project, disabling `BuildConfig` in 25 library modules saved about 4 seconds per incremental build.

**Key takeaway:** Disable unused build features (`buildConfig`, `aidl`, `renderScript`, `shaders`) to eliminate unnecessary code generation. Enable features only in modules that need them. The time savings compound across module count.

### Quiz: Build Variants, Flavors, and Signing

#### If you have 3 build types and 2 product flavors, how many build variants does Gradle generate?

- ❌ 3
- ❌ 5
- ✅ 6
- ❌ 8

> **Explanation:** Build variants are the Cartesian product of build types and product flavors. 3 types × 2 flavors = 6 variants.

#### What does `isMinifyEnabled = true` do in a release build type?

- ❌ Minifies image assets to reduce APK size
- ❌ Removes unused Gradle modules from the build
- ✅ Enables R8 code shrinking and obfuscation
- ❌ Compresses the APK using ZIP compression

> **Explanation:** `isMinifyEnabled = true` enables R8, which shrinks unused code, optimizes bytecode, and obfuscates class/method names. It's typically paired with `isShrinkResources = true` to also remove unused resources.

#### Why should you never hardcode keystore passwords in `build.gradle.kts`?

- ❌ Gradle cannot read passwords from build scripts
- ❌ Hardcoded passwords slow down the build
- ✅ Build scripts are committed to version control, exposing credentials
- ❌ Gradle encrypts passwords automatically and hardcoding bypasses it

> **Explanation:** Build scripts are committed to version control and visible to everyone with repository access. Keystore passwords should come from environment variables (CI) or `~/.gradle/gradle.properties` (local development) — neither of which is committed.

### Coding Challenge: Configure a Multi-Dimension Build with Variant Filtering

Set up an Android project with `environment` (staging, production) and `tier` (free, premium) flavor dimensions, a custom `staging` build type, and filter out the `productionFree` + `staging` build type combination.

#### Solution

```kotlin
android {
    flavorDimensions += listOf("environment", "tier")

    productFlavors {
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            buildConfigField("String", "API_URL", "\"https://staging-api.yourapp.com\"")
        }
        create("production") {
            dimension = "environment"
            buildConfigField("String", "API_URL", "\"https://api.yourapp.com\"")
        }
        create("free") {
            dimension = "tier"
            buildConfigField("Boolean", "PREMIUM_FEATURES", "false")
        }
        create("premium") {
            dimension = "tier"
            buildConfigField("Boolean", "PREMIUM_FEATURES", "true")
        }
    }

    buildTypes {
        debug { }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        create("staging") {
            initWith(getByName("release"))
            isDebuggable = true
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    androidComponents {
        beforeVariants { variant ->
            val isProductionFreeStaging =
                variant.productFlavors.containsAll(
                    listOf("environment" to "production", "tier" to "free")
                ) && variant.buildType == "staging"
            if (isProductionFreeStaging) {
                variant.enable = false
            }
        }
    }
}
```

This generates 11 variants (2 × 2 × 3 = 12, minus the 1 disabled combination). The `staging` build type inherits release configuration but allows debugging — perfect for QA testing against optimized builds.

---

## Module 5: Build Optimization and Performance Profiling

Build time is developer experience. Every second you shave off the build loop compounds across every developer, every commit, every day. A 6-person team losing 30+ minutes each per day to build times means 15 hours of engineering time per week watching a progress bar. This module covers how to profile where time is spent and apply targeted optimizations.

### Lesson 5.1: Profiling Your Build

Before applying any optimization, know where your build time is actually spent. Gradle provides several tools for this, and the most common mistake is applying optimizations you read about without profiling first. You might enable configuration cache when your bottleneck is KAPT, or add more RAM when your build is IO-bound.

```bash
# Generate a build scan (uploads to scans.gradle.com)
./gradlew assembleDebug --scan

# Local profile report (no upload)
./gradlew assembleDebug --profile

# Verbose logging with task timing
./gradlew assembleDebug --info

# Show only task names that executed
./gradlew assembleDebug --console=plain 2>&1 | grep "> Task"
```

The `--profile` flag generates an HTML report in `build/reports/profile/` without uploading anything to external servers. The report shows configuration time per module, task execution times, and dependency resolution timing. Look for the longest-running tasks, cache misses when you expect hits, and configuration time that grows linearly with module count.

Build scans (`--scan`) provide the most detailed view — they show cache hit rates, task dependency chains, configuration phase breakdown, and even suggest optimizations. The tradeoff is that build data is uploaded to Gradle's servers. For sensitive projects, use `--profile` instead.

Common findings when profiling Android builds: KAPT is usually the slowest step — migrating to KSP can cut annotation processing time by 50-70%. Unused `kapt` configurations in modules that don't need annotation processing add 2-3 seconds each. Configuration time that's 10+ seconds usually means expensive top-level code or too many eagerly configured tasks.

**Key takeaway:** Profile before you optimize. Use `--profile` for local reports and `--scan` for detailed analysis. The most common bottlenecks are KAPT processing, configuration phase overhead, and cache misses.

### Lesson 5.2: gradle.properties Optimization

The `gradle.properties` file is the single most impactful place for build optimization. Three settings together can cut build times by 30-50% on multi-module projects:

```properties
# === Core Performance ===

# Run independent module tasks in parallel
org.gradle.parallel=true

# Cache task outputs for reuse across builds
org.gradle.caching=true

# Cache the task graph to skip configuration phase
org.gradle.configuration-cache=true
org.gradle.configuration-cache.problems=warn

# === JVM Memory ===

# Gradle daemon JVM — 4GB minimum for multi-module projects
org.gradle.jvmargs=-Xmx4g -XX:+UseParallelGC -XX:MaxMetaspaceSize=512m

# Kotlin compiler daemon — separate from Gradle daemon
kotlin.daemon.jvmargs=-Xmx2g

# === Android-Specific ===

# Limit each module's R class to its own resources only
android.nonTransitiveRClass=true

# Use relative paths for better cache relocation
android.enableBuildCacheGarbageCollection=true
```

The JVM memory settings deserve explanation. The default Gradle daemon heap is 512MB, which is wildly insufficient for a multi-module Android project with Kotlin compilation, annotation processing, and resource merging happening simultaneously. 4GB is a reasonable starting point — bump to 6-8GB if you have 30+ modules. `UseParallelGC` is generally the best garbage collector for build systems where throughput matters more than pause times.

Non-transitive R classes (`android.nonTransitiveRClass=true`) limit each module's R class to only its own resources. By default, every module's R class includes resource IDs from all transitive dependencies — in a 20-module project, the app module's R class contains thousands of redundant fields. One project I migrated saw R class field count drop from 45,000 to 8,000 across all modules, with measurable build time improvement.

**Key takeaway:** Enable parallel execution, build cache, and configuration cache in `gradle.properties`. Increase JVM heap to at least 4GB. Enable non-transitive R classes. These settings provide the biggest build speed improvement for the least effort.

### Lesson 5.3: Configuration Cache

Gradle's configuration phase parses every `build.gradle.kts` file, resolves plugins, and builds the task graph before any task executes. On a 15-module Android project, this phase alone can take 8-15 seconds — and it runs on every single build. The configuration cache serializes the task graph after the first run and reuses it on subsequent builds, skipping the entire configuration phase.

Start with `problems=warn` because some plugins aren't configuration-cache compatible yet. The Gradle build will report which plugins or build logic access project state in ways that can't be cached. Common offenders are older versions of AGP (pre-8.0), some KSP processors, and custom tasks that read `project` properties at execution time:

```kotlin
// BAD: Reads project at execution time — breaks configuration cache
tasks.register("printProjectName") {
    doLast {
        println(project.name)  // 'project' captured at execution time
    }
}

// GOOD: Capture value at configuration time, use at execution
tasks.register("printProjectName") {
    val projectName = project.name  // Captured during configuration
    doLast {
        println(projectName)  // Uses the captured value
    }
}
```

The fix is usually refactoring tasks to capture values during configuration rather than reading `project` at execution time. Once all warnings are resolved, switch to `problems=fail` to prevent regressions. In my experience, configuration cache cuts incremental build times by 25-40% on medium to large projects.

**Key takeaway:** Configuration cache skips the configuration phase on subsequent builds. Start with `problems=warn`, fix incompatibilities, then switch to `problems=fail`. It typically saves 25-40% on incremental builds.

### Lesson 5.4: Configuration Avoidance API

Gradle has two ways to register tasks: `tasks.create()` and `tasks.register()`. The difference is that `create()` eagerly instantiates and configures the task immediately during the configuration phase, while `register()` defers all of that until the task is actually needed. In a 30-module project, you might have hundreds of tasks defined across all modules, but any given build only executes a fraction of them.

```kotlin
// BAD: Eager — configures this task on EVERY build invocation
tasks.create("generateDocs") {
    doLast {
        // generate documentation
    }
}

// GOOD: Lazy — only configures when this task is actually requested
tasks.register("generateDocs") {
    doLast {
        // generate documentation
    }
}
```

I ran into this when a custom convention plugin registered 6 tasks per module using `tasks.create()`. Across 25 modules, that's 150 tasks being instantiated and configured on every build — even when running something unrelated like `assembleDebug`. Switching to `tasks.register()` dropped the configuration phase by about 3 seconds. That doesn't sound dramatic, but it's 3 seconds on every single build, including incremental ones where the actual compilation might only take 4-5 seconds.

The same principle extends to configurations. Use `configurations.register()` instead of `configurations.create()`, and use `Provider`/`Property` types instead of resolving values eagerly. Gradle's build scan flags eagerly created tasks — look for "Eager task creation" deprecation warnings. They're warnings now, but Gradle has signaled they'll become errors in a future major version.

**Key takeaway:** Always use `tasks.register()` over `tasks.create()`. Eager task creation adds unnecessary configuration overhead. The savings compound across modules — 6 tasks × 25 modules = 150 unnecessary configurations on every build.

### Lesson 5.5: Parallel Execution and Build Caching

Parallel execution and build caching are separate features that complement each other. Parallel execution runs independent tasks across modules simultaneously — on a multi-core machine, tasks from `:core:network` and `:feature:profile` can compile at the same time if they don't depend on each other. Build caching stores task outputs keyed by inputs and reuses them when inputs haven't changed, even across clean builds.

```properties
# Enable both in gradle.properties
org.gradle.parallel=true
org.gradle.caching=true
```

The tradeoff with parallel execution is that it exposes ordering issues in your build scripts. If module A writes a file that module B reads without declaring an explicit task dependency, sequential builds work fine but parallel builds fail intermittently. These are legitimate bugs in your build configuration that parallel mode surfaces early — which is actually a good thing. Fix them by declaring proper task dependencies.

Build caching works at the task level. Each task's inputs (source files, dependencies, configuration) are hashed to create a cache key. If the cache contains an entry for that key, Gradle uses the cached output instead of running the task. This works across clean builds — `./gradlew clean assembleDebug` still benefits from cached compilation outputs. The cache can also be shared across machines via a remote cache server, which is particularly valuable for CI where multiple agents build the same codebase.

One subtle point: the build cache only works if tasks properly declare their inputs and outputs using `@Input`, `@OutputFile`, `@OutputDirectory`, and related annotations. If a custom task doesn't declare its inputs, Gradle can't compute the cache key and falls back to running the task every time. Always verify cache behavior using `--scan` to check the cache hit rate.

**Key takeaway:** Parallel execution runs independent tasks concurrently. Build caching reuses task outputs across builds. Both require proper task input/output declarations. Use `--scan` to verify cache hit rates and diagnose misses.

### Lesson 5.6: Avoiding Common Performance Pitfalls

Beyond the big settings, several smaller issues compound into significant build slowdowns. Each one might cost 2-5 seconds, but stack five of them and you've added 15+ seconds to every build.

**Avoid `allprojects`/`subprojects` blocks.** These force configuration of every module even when building a single one, and they're incompatible with configuration cache. Move shared logic into convention plugins.

**Don't leave KAPT applied without processors.** If a module has the `kotlin-kapt` plugin applied but no `kapt()` dependencies, it still initializes the KAPT infrastructure on every build — adding 2-3 seconds per module. Remove the plugin from modules that don't use annotation processing.

**Use `implementation` over `api`.** Every `api` dependency exposes transitive types to downstream modules, expanding the compilation graph. In a chain of 5 modules all using `api`, changing one library triggers recompilation across all 5.

**Avoid dynamic versions.** `implementation("com.squareup.okhttp3:okhttp:4.+")` forces Gradle to check Maven Central for the latest version on every build, adding network latency to the configuration phase.

```kotlin
// Check configuration time per module
// ./gradlew assembleDebug --profile
// Look for modules with disproportionately long configuration times

// Measure the impact of a change
// Before: ./gradlew --profile assembleDebug (note total time)
// Make change
// After: ./gradlew --profile assembleDebug (compare)
```

**Key takeaway:** Remove unused KAPT plugins, replace `allprojects` with convention plugins, prefer `implementation` over `api`, and avoid dynamic versions. Profile before and after each optimization to verify the impact.

### Quiz: Build Optimization and Performance Profiling

#### Which three `gradle.properties` settings together provide the biggest build speed improvement?

- ❌ `org.gradle.daemon=true`, `org.gradle.logging.level=quiet`, `org.gradle.workers.max=4`
- ✅ `org.gradle.parallel=true`, `org.gradle.caching=true`, `org.gradle.configuration-cache=true`
- ❌ `org.gradle.jvmargs=-Xmx8g`, `kotlin.incremental=true`, `android.enableJetifier=true`
- ❌ `org.gradle.debug=false`, `org.gradle.console=plain`, `android.nonTransitiveRClass=true`

> **Explanation:** Parallel execution runs independent tasks concurrently, build cache reuses outputs from previous builds, and configuration cache skips the configuration phase on subsequent runs. Together they provide the biggest speed improvement.

#### Why is running `"git rev-list --count HEAD".execute()` in `defaultConfig` a problem?

- ❌ It fails on Windows because `execute()` is Unix-only
- ❌ It makes the APK larger because it embeds git history
- ✅ It runs during the Configuration phase, slowing down every Gradle command
- ❌ It causes merge conflicts in multi-developer teams

> **Explanation:** Code in the configuration block runs on every Gradle invocation — even `./gradlew tasks`. Using `providers.exec` makes it lazy, so it only executes when the value is actually needed during the Execution phase.

#### What should you check first when investigating slow builds?

- ❌ Upgrade to the latest Gradle version
- ❌ Increase JVM memory to 16GB
- ✅ Run `--profile` or `--scan` to identify the actual bottleneck
- ❌ Enable all available optimization flags

> **Explanation:** Profile before you optimize. The bottleneck might be KAPT, configuration overhead, cache misses, or something else entirely. Applying random optimizations without profiling is guesswork.

### Coding Challenge: Create a Build Performance Report Task

Write a custom Gradle task that measures and prints configuration phase timing, lists the 10 slowest tasks in the execution graph, and reports the build cache hit rate.

#### Solution

```kotlin
// In root build.gradle.kts
val configStartTime = System.currentTimeMillis()

gradle.projectsEvaluated {
    val elapsed = System.currentTimeMillis() - configStartTime
    println("Configuration phase: ${elapsed}ms across ${rootProject.allprojects.size} projects")
}

gradle.taskGraph.whenReady {
    println("Task graph contains ${allTasks.size} tasks")
}

tasks.register("buildPerformanceReport") {
    group = "custom"
    description = "Reports build performance information"

    doLast {
        println("Build Performance Report")
        println("========================")
        println("Projects: ${rootProject.allprojects.size}")
        println("Tasks in graph: ${gradle.taskGraph.allTasks.size}")
        println()
        println("Configured tasks:")
        gradle.taskGraph.allTasks.take(10).forEach { task ->
            val state = task.state
            val status = when {
                state.skipped -> "SKIPPED"
                state.upToDate -> "UP-TO-DATE"
                state.noSource -> "NO-SOURCE"
                state.executed -> "EXECUTED"
                else -> "UNKNOWN"
            }
            println("  ${task.path} [$status]")
        }
    }
}
```

The `gradle.projectsEvaluated` callback fires right after the Configuration phase, giving you a timing measurement. The `taskGraph.whenReady` callback fires after the execution plan is built. The task itself reports which tasks executed, were cached, or were skipped — useful for identifying cache misses.

---

## Module 6: Custom Tasks and Convention Plugins

Convention plugins are the highest-leverage improvement you can make to a multi-module Android project. They extract shared build configuration into reusable plugins, eliminating copy-paste duplication and ensuring consistency across modules.

### Lesson 6.1: Understanding Custom Tasks

Custom Gradle tasks automate project-specific workflows — generating version info from git, checking for snapshot dependencies before release, cleaning up generated files, or running custom validation. The key to well-behaved tasks is proper input/output declarations that enable up-to-date checking and build cache support.

```kotlin
// Simple inline task — good for quick scripts
tasks.register("printVersionInfo") {
    group = "custom"
    description = "Prints version information"

    doLast {
        val versionName = android.defaultConfig.versionName
        val versionCode = android.defaultConfig.versionCode
        println("Version: $versionName ($versionCode)")
    }
}
```

For tasks with real inputs and outputs, use a typed task class. The `@Input`, `@OutputFile`, and `@TaskAction` annotations tell Gradle what the task depends on and produces, enabling up-to-date checking and caching:

```kotlin
abstract class GenerateConfigTask : DefaultTask() {

    @get:Input
    abstract val environment: Property<String>

    @get:Input
    abstract val versionName: Property<String>

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    @TaskAction
    fun generate() {
        val config = buildString {
            appendLine("environment=${environment.get()}")
            appendLine("version=${versionName.get()}")
            appendLine("buildTime=${java.time.Instant.now()}")
        }
        outputFile.get().asFile.writeText(config)
        logger.lifecycle("Generated config: ${outputFile.get().asFile.absolutePath}")
    }
}

tasks.register<GenerateConfigTask>("generateAppConfig") {
    environment.set("production")
    versionName.set(android.defaultConfig.versionName ?: "unknown")
    outputFile.set(layout.buildDirectory.file("config/app-config.properties"))
}
```

When you run this task a second time without changing the environment or version, Gradle skips it with UP-TO-DATE because the inputs haven't changed and the output file already exists with the correct content.

**Key takeaway:** Custom tasks automate project-specific workflows. Use typed task classes with `@Input`/`@OutputFile` annotations for caching and up-to-date checking. Always use `tasks.register()`, never `tasks.create()`.

### Lesson 6.2: Real-World Custom Tasks

Here are task patterns I've used in production projects. These solve common problems that every Android team eventually faces.

**Generating version info from git** — useful for embedding the commit hash in crash reports:

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

        val commitCount = providers.exec {
            commandLine("git", "rev-list", "--count", "HEAD")
        }.standardOutput.asText.get().trim()

        outputFile.get().asFile.writeText(buildString {
            appendLine("commitHash=$commitHash")
            appendLine("branch=$branchName")
            appendLine("commitCount=$commitCount")
        })
    }
}
```

**Checking for snapshot dependencies before release** — a quality gate that prevents shipping with development dependencies:

```kotlin
tasks.register("checkNoSnapshots") {
    group = "verification"
    description = "Ensures no SNAPSHOT dependencies in release builds"

    doLast {
        val snapshots = mutableListOf<String>()
        configurations.filter { it.isCanBeResolved }.forEach { config ->
            config.resolvedConfiguration.resolvedArtifacts
                .filter { it.moduleVersion.id.version.contains("SNAPSHOT") }
                .forEach { artifact ->
                    val id = artifact.moduleVersion.id
                    snapshots.add("${id.group}:${id.name}:${id.version}")
                }
        }
        if (snapshots.isNotEmpty()) {
            throw GradleException(
                "Release build contains SNAPSHOT dependencies:\n" +
                snapshots.joinToString("\n") { "  - $it" }
            )
        }
        logger.lifecycle("No SNAPSHOT dependencies found")
    }
}
```

You can wire this into your release build by adding a dependency: `tasks.named("assembleRelease") { dependsOn("checkNoSnapshots") }`. Now every release build automatically verifies there are no snapshot dependencies.

**Key takeaway:** Custom tasks solve real problems — version embedding, snapshot checking, build validation. Wire quality-gate tasks into the build graph so they run automatically on release builds.

### Lesson 6.3: Convention Plugins Fundamentals

Convention plugins extract shared build configuration into reusable plugins. Without them, adding a new feature module means copying 40+ lines of build configuration and hoping you don't miss the one line that's different. With convention plugins, it's two lines — apply the plugin and add module-specific dependencies.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig {
                    minSdk = 24
                    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
                }
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

Change `compileSdk` once in the convention plugin and it applies everywhere. Miss it in one module with copy-pasted config and you get mysterious build failures that take 20 minutes to track down.

**Key takeaway:** Convention plugins define shared build configuration once and apply it everywhere. They eliminate copy-paste duplication, ensure consistency, and scale to any module count. This is the single biggest build improvement for multi-module projects.

### Lesson 6.4: Structuring build-logic

Convention plugins need a proper home. The `build-logic/` directory is itself a standalone Gradle project — it has its own `settings.gradle.kts` and typically a single `convention` submodule. Getting this structure right matters because it determines how your build logic is compiled, cached, and shared.

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

gradlePlugin {
    plugins {
        register("androidApplication") {
            id = "myapp.android.application"
            implementationClass = "AndroidApplicationConventionPlugin"
        }
        register("androidLibrary") {
            id = "myapp.android.library"
            implementationClass = "AndroidLibraryConventionPlugin"
        }
        register("androidLibraryCompose") {
            id = "myapp.android.library.compose"
            implementationClass = "ComposeLibraryConventionPlugin"
        }
        register("androidFeature") {
            id = "myapp.android.feature"
            implementationClass = "AndroidFeatureConventionPlugin"
        }
    }
}
```

The `compileOnly` scope is deliberate — the actual plugin JARs come from the consuming project's `pluginManagement` block, so `build-logic` only needs them at compile time for the API types. The version catalog is shared from the parent project via `from(files("../gradle/libs.versions.toml"))`, ensuring convention plugins use the same dependency versions as the rest of the app.

You need to reference these Gradle plugin dependencies in your version catalog for this to work:

```toml
# In gradle/libs.versions.toml — add these for build-logic
[libraries]
android-gradlePlugin = { group = "com.android.tools.build", name = "gradle", version.ref = "agp" }
kotlin-gradlePlugin = { group = "org.jetbrains.kotlin", name = "kotlin-gradle-plugin", version.ref = "kotlin" }
compose-gradlePlugin = { group = "org.jetbrains.kotlin", name = "compose-compiler-gradle-plugin", version.ref = "kotlin" }
```

Then in the root `settings.gradle.kts`, include the build-logic project:

```kotlin
// settings.gradle.kts
pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
```

**Key takeaway:** `build-logic/` is a standalone Gradle project included via `includeBuild()`. It shares the version catalog from the parent project, uses `compileOnly` for plugin APIs, and registers convention plugins via `gradlePlugin {}`. This structure keeps build logic versioned, testable, and independent.

### Lesson 6.5: Composite Builds vs buildSrc

`buildSrc` is Gradle's built-in way to share build logic, but it has a critical flaw: any change to `buildSrc` invalidates the entire project's build cache. Change a single constant in your `Dependencies.kt` object, and every module recompiles from scratch. On a 20-module project, that's the difference between a 30-second incremental build and a 5-minute full rebuild.

Composite builds (`includeBuild()` in `settings.gradle.kts`) solve this. They compile independently and only invalidate modules that actually depend on the changed code. The setup is slightly more involved — you create a separate Gradle project under `build-logic/` — but the build performance improvement is substantial.

If you already have `buildSrc`, the migration is straightforward: move the contents into `build-logic/convention/`, add a `build.gradle.kts` that applies `kotlin-dsl` and declares dependencies on the Gradle and AGP APIs, replace `buildSrc` with `includeBuild("build-logic")` in settings, and delete the `buildSrc` directory. The first build takes a few seconds longer, but every subsequent build benefits from proper cache invalidation.

The key insight is that `buildSrc` is compiled as part of build initialization — it's tightly coupled to the build lifecycle. Composite builds are compiled as separate projects with their own caching and incremental compilation. This decoupling is what makes them cache-friendly.

**Key takeaway:** Composite builds (`includeBuild`) replace `buildSrc` with independent compilation and proper cache invalidation. Migrate from `buildSrc` by moving code into `build-logic/` and using `includeBuild()`. The build cache improvement is immediate and significant.

### Lesson 6.6: Building a Complete Plugin Library

A production multi-module project typically needs 4-6 convention plugins covering the common module archetypes. Here's a complete Compose feature module plugin that applies everything a feature module needs:

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")
            pluginManager.apply("org.jetbrains.kotlin.plugin.compose")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig {
                    minSdk = 24
                    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
                }

                buildFeatures {
                    compose = true
                    buildConfig = false
                }

                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }

            extensions.configure<KotlinAndroidProjectExtension> {
                compilerOptions {
                    jvmTarget.set(JvmTarget.JVM_17)
                }
            }

            dependencies {
                add("implementation", project(":core:ui"))
                add("implementation", project(":core:model"))

                val composeBom = platform("androidx.compose:compose-bom:2025.01.01")
                add("implementation", composeBom)
                add("implementation", "androidx.compose.ui:ui")
                add("implementation", "androidx.compose.material3:material3")
                add("implementation", "androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
                add("debugImplementation", "androidx.compose.ui:ui-tooling")

                add("testImplementation", "junit:junit:4.13.2")
                add("testImplementation", "org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.1")
            }
        }
    }
}
```

Now creating a new feature module is two lines:

```kotlin
// feature/orders/build.gradle.kts
plugins {
    id("myapp.android.feature")
}

android {
    namespace = "com.myapp.feature.orders"
}

dependencies {
    implementation(project(":core:data"))
    implementation(libs.bundles.room)
}
```

**Key takeaway:** Build a library of convention plugins covering your common module types — application, library, compose library, feature, and test modules. Each new module starts with a one-line plugin application and adds only its unique dependencies.

### Quiz: Custom Tasks and Convention Plugins

#### What is the difference between `tasks.register` and `tasks.create` in Gradle?

- ❌ `register` is for Kotlin DSL, `create` is for Groovy DSL
- ❌ `create` is lazy and `register` is eager
- ✅ `register` is lazy (configures only when needed), `create` is eager (configures immediately)
- ❌ There is no difference — they are aliases

> **Explanation:** `tasks.register` uses lazy task configuration — the task is only created and configured when it's actually needed. `tasks.create` eagerly creates the task during the Configuration phase, even if it won't run. Always prefer `register`.

#### Why do convention plugins use `compileOnly` for AGP and Kotlin Gradle Plugin dependencies?

- ❌ To reduce the APK size of the final app
- ❌ To avoid version conflicts between plugins
- ✅ Because the actual plugin JARs come from the consuming project's classpath at runtime
- ❌ Because `implementation` is not supported in `kotlin-dsl` projects

> **Explanation:** Convention plugins only need the AGP and Kotlin plugin APIs at compile time for type checking. At runtime, the actual plugin JARs are provided by the consuming project's `pluginManagement` block, so `compileOnly` avoids bundling duplicate JARs.

#### What is the main advantage of composite builds over `buildSrc`?

- ❌ Composite builds support more programming languages
- ❌ Composite builds compile faster than `buildSrc`
- ✅ Changes to composite builds don't invalidate the entire project's build cache
- ❌ Composite builds can be published to Maven Central

> **Explanation:** `buildSrc` is compiled as part of build initialization — any source change invalidates the entire project's build cache. Composite builds compile independently with their own caching, so changes only affect modules that depend on the changed code.

### Coding Challenge: Build a Compose Library Convention Plugin

Create a convention plugin that configures an Android library module with full Compose support, including the Compose compiler plugin, BOM-managed dependencies, and proper Kotlin compiler options. Register it with the ID `myapp.android.library.compose`.

#### Solution

```kotlin
// build-logic/convention/src/main/kotlin/ComposeLibraryConventionPlugin.kt
class ComposeLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")
            pluginManager.apply("org.jetbrains.kotlin.plugin.compose")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig.minSdk = 24

                buildFeatures {
                    compose = true
                    buildConfig = false
                }

                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }

            extensions.configure<KotlinAndroidProjectExtension> {
                compilerOptions {
                    jvmTarget.set(JvmTarget.JVM_17)
                }
            }

            dependencies {
                val bom = platform("androidx.compose:compose-bom:2025.01.01")
                add("implementation", bom)
                add("implementation", "androidx.compose.ui:ui")
                add("implementation", "androidx.compose.material3:material3")
                add("implementation", "androidx.compose.ui:ui-tooling-preview")
                add("debugImplementation", "androidx.compose.ui:ui-tooling")
                add("androidTestImplementation", "androidx.compose.ui:ui-test-junit4")
            }
        }
    }
}
```

Register it in `build-logic/convention/build.gradle.kts`:

```kotlin
gradlePlugin {
    plugins {
        register("androidLibraryCompose") {
            id = "myapp.android.library.compose"
            implementationClass = "ComposeLibraryConventionPlugin"
        }
    }
}
```

Any module needing Compose just applies `plugins { id("myapp.android.library.compose") }` and gets the full Compose setup with BOM-managed versions, tooling preview, and test dependencies.

---

## Module 7: KSP, KAPT, and Annotation Processing

Annotation processing is one of the biggest contributors to build time in Android projects. Understanding the difference between KAPT and KSP — and migrating to KSP — can cut your annotation processing time by 50-70%.

### Lesson 7.1: How KAPT Works (And Why It's Slow)

KAPT — Kotlin Annotation Processing Tool — exists because of a fundamental incompatibility: Java annotation processors (JSR 269) only understand Java code, but your source code is Kotlin. KAPT's solution is a workaround. Before any annotation processing happens, the Kotlin compiler runs a partial compilation pass that generates `.java` stub files for every Kotlin class that might be relevant. These stubs contain the class structure — methods, fields, annotations — but no implementation bodies. Then, standard Java annotation processors run against these stubs as if they were real Java source files.

This stub generation phase is where the cost lives. According to the official KSP documentation, stub generation alone costs roughly one-third of a full `kotlinc` analysis. For a module with 200 Kotlin files, KAPT generates 200 corresponding Java stubs, even if only 10 of those files have annotations that any processor cares about. The stub generator can't know which files are relevant, so it processes everything. You're effectively paying for an extra compilation pass before annotation processing even begins.

There's a practical cost beyond raw time. KAPT generates stub files that sometimes linger from previous builds. When incremental compilation tries to reuse cached stubs, it occasionally picks up stale versions, leading to cryptic compilation errors that vanish after `./gradlew clean`. If you've ever had clean builds succeed while incremental builds fail with impossible errors about missing generated types, stale KAPT stubs were probably the cause.

**Key takeaway:** KAPT generates Java stubs for every Kotlin file in the module, even if most don't need annotation processing. This stub generation costs roughly one-third of a full compilation pass and is the primary reason KAPT builds are slow.

### Lesson 7.2: What KSP Is and Why It's Faster

KSP — Kotlin Symbol Processing — is a Google-built API for developing lightweight compiler plugins. Rather than generating Java stubs and running Java annotation processors against them, KSP plugs directly into the Kotlin compiler and provides processors with a structured symbol graph of your Kotlin code. Classes, functions, properties, annotations, type parameters — a KSP processor sees all of these as first-class Kotlin symbols through the `Resolver` API. No Java translation layer in between.

This is a fundamental architectural difference, not just an optimization. KAPT delegates to `javac` and forces everything through a Java lens. Kotlin-specific features like extension functions, sealed classes, `value` classes, declaration-site variance, and `suspend` functions are awkward or impossible to represent accurately in Java stubs. KSP understands these natively because it operates on Kotlin's own symbol model.

The performance numbers follow directly from the architecture. Official KSP benchmarks show that for a simplified Glide processor, KAPT took 8.67 seconds while KSP took 1.15 seconds — roughly a 7.5x speedup for the processing step itself. In practice, across typical Room and Dagger workloads, the overall build improvement is around 2x because stub generation was the dominant cost and KSP eliminates it entirely.

KSP's incremental processing is also superior. KAPT's incremental support has always been fragile — many processors don't properly declare their incremental behavior, so Gradle falls back to full reprocessing. KSP uses a dependency model with **isolating** outputs (depend only on declared source files) and **aggregating** outputs (may depend on any input). If you change `PaymentDao.kt`, only its generated implementation gets reprocessed. KAPT's stub generation can't be this selective.

**Key takeaway:** KSP operates directly on Kotlin symbols, eliminating stub generation entirely. This gives 2x faster builds for typical Room/Hilt workloads and better incremental processing. It also understands Kotlin-specific features that KAPT can't represent.

### Lesson 7.3: Migrating Room, Moshi, and Hilt to KSP

For most Android projects, the migration is straightforward because the major libraries already support KSP. The changes are in build files only — your Kotlin source code doesn't change.

**Room** has had full KSP support since version 2.4:

```kotlin
// BEFORE (KAPT)
plugins {
    id("org.jetbrains.kotlin.kapt")
}
dependencies {
    implementation("androidx.room:room-runtime:2.7.0")
    kapt("androidx.room:room-compiler:2.7.0")
}

// AFTER (KSP)
plugins {
    id("com.google.devtools.ksp") version "2.1.0-1.0.29"
}
dependencies {
    implementation("androidx.room:room-runtime:2.7.0")
    ksp("androidx.room:room-compiler:2.7.0")
}
```

**Moshi** — swap the configuration from `kapt` to `ksp`:

```kotlin
// BEFORE
kapt("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")

// AFTER
ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")
```

**Hilt/Dagger** — KSP support is available but worth testing thoroughly:

```kotlin
// build.gradle.kts — Hilt with KSP
plugins {
    id("com.google.devtools.ksp") version "2.1.0-1.0.29"
    id("dagger.hilt.android.plugin")
}

dependencies {
    implementation("com.google.dagger:hilt-android:2.54")
    ksp("com.google.dagger:hilt-android-compiler:2.54")
}
```

One important gotcha: KSP processors cannot resolve types generated by other KAPT processors. If you have a mixed setup, all processors that depend on each other must be on the same processing pipeline.

**Key takeaway:** Room, Moshi, Glide, and Hilt all support KSP. Migration is a build file change — swap the KAPT plugin for KSP and change `kapt()` to `ksp()`. Test thoroughly, especially in multi-module setups with Hilt.

### Lesson 7.4: Mixed KAPT + KSP and Migration Strategy

Not every annotation processor has a KSP equivalent yet. If your project depends on a library that still requires KAPT, you can run both side by side in the same module as a transitional setup:

```kotlin
// build.gradle.kts — Mixed KAPT + KSP (transitional)
plugins {
    id("org.jetbrains.kotlin.kapt")
    id("com.google.devtools.ksp") version "2.1.0-1.0.29"
}

dependencies {
    ksp("androidx.room:room-compiler:2.7.0")
    ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")
    kapt("com.some.legacy:annotation-processor:1.0.0")
}
```

The build performance benefit is reduced in this configuration because KAPT still runs its stub generation phase for the remaining processors. But every processor you move to KSP is one less running through the stub pipeline. The critical thing to understand: **as long as even one `kapt()` dependency exists in a module, that module pays the full stub generation cost.** Migrating 3 out of 4 processors to KSP helps, but you only get the full benefit when the last one is gone.

My migration checklist: First, audit every `kapt()` dependency and check if a KSP equivalent exists. Second, migrate one module at a time, starting with the module that has the fewest KAPT dependencies. Run the full test suite after each module. Third, once a module has zero `kapt()` dependencies, remove the `kotlin-kapt` plugin entirely — don't leave it applied with nothing to process, because it still adds overhead from initializing the stub generation infrastructure.

**Key takeaway:** Mixed KAPT + KSP works as a transition strategy, but the full performance benefit only comes when all KAPT dependencies are removed. Migrate one module at a time, remove the KAPT plugin entirely when done.

### Lesson 7.5: The K2 Compiler Blocker

Here's what makes the KSP migration urgent rather than just nice-to-have: **KAPT is incompatible with the K2 compiler.** If your project uses KAPT, you're pinned to `languageVersion = "1.9"`. You cannot adopt K2, which means you miss out on faster compilation, better type inference, smarter smart casts, and the new compiler frontend.

Starting with Kotlin 2.0, K2 is the default compiler. JetBrains has stated that the old compiler frontend will eventually be deprecated. KAPT has a compatibility mode that keeps old projects building, but it forces you onto a legacy code path that won't receive new optimizations. In a multi-module project, one module using KAPT forces every module to stay on the legacy compiler.

KSP is fully compatible with K2 because it was designed to work with Kotlin's compiler infrastructure directly. The reframe here is important: **the KSP migration isn't really about build speed — it's about unblocking the K2 compiler, which itself gives you build speed, better language features, and a path forward that KAPT permanently blocks.**

The future direction is clear. Both KAPT and KSP are annotation processing tools — they inspect annotations and generate code. But compiler plugins like the Compose compiler plugin and Metro (from Slack) operate at a deeper level, transforming code at the IR (intermediate representation) level as part of compilation itself. KSP is the bridge between the annotation processing world and the compiler plugin future. KAPT is the past.

**Key takeaway:** KAPT blocks adoption of the K2 compiler. KSP is K2-compatible. The migration is about more than build speed — it's about unblocking future Kotlin language features and compiler improvements. Every month you delay, the migration debt compounds.

### Quiz: KSP, KAPT, and Annotation Processing

#### Why is KSP faster than KAPT for annotation processing?

- ❌ KSP uses a newer version of the Java compiler
- ✅ KSP eliminates the Java stub generation phase that KAPT requires
- ❌ KSP processes fewer files by default
- ❌ KSP runs annotation processors in parallel

> **Explanation:** KAPT generates Java stubs for every Kotlin file before annotation processing, costing roughly one-third of a full compilation. KSP plugs directly into the Kotlin compiler's symbol model, eliminating stub generation entirely.

#### What happens if you leave the `kotlin-kapt` plugin applied in a module with no `kapt()` dependencies?

- ❌ Nothing — Gradle ignores unused plugins
- ❌ The build fails with a configuration error
- ✅ The KAPT infrastructure still initializes, adding 2-3 seconds per build
- ❌ Gradle automatically removes the plugin

> **Explanation:** Even without `kapt()` dependencies, the KAPT plugin initializes its stub generation infrastructure during configuration. This adds unnecessary overhead to every build. Remove the plugin entirely when no processors need it.

#### Why does KAPT block adoption of the K2 compiler?

- ❌ KAPT uses Java APIs that K2 doesn't support
- ❌ K2 doesn't support annotation processing at all
- ✅ KAPT's stub generation depends on the old compiler frontend that K2 replaces
- ❌ KAPT requires Kotlin 1.x and K2 requires Kotlin 3.x

> **Explanation:** KAPT's stub generation phase is tightly coupled to the old Kotlin compiler frontend. K2 uses a completely different frontend architecture. Projects using KAPT must stay on `languageVersion = "1.9"`, blocking all K2 features and optimizations.

### Coding Challenge: Migrate a Module from KAPT to KSP

Given a module that uses KAPT for Room and Moshi, rewrite the build configuration to use KSP, ensuring the KAPT plugin is completely removed.

#### Solution

```kotlin
// BEFORE — build.gradle.kts with KAPT
// plugins {
//     alias(libs.plugins.android.library)
//     alias(libs.plugins.kotlin.android)
//     id("org.jetbrains.kotlin.kapt")
// }
// dependencies {
//     implementation(libs.room.runtime)
//     implementation(libs.room.ktx)
//     kapt(libs.room.compiler)
//     implementation(libs.moshi)
//     kapt(libs.moshi.codegen)
// }

// AFTER — build.gradle.kts with KSP
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
    // kotlin-kapt plugin is REMOVED — not just unused
}

android {
    namespace = "com.myapp.core.data"
}

dependencies {
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.moshi)
    ksp(libs.moshi.codegen)
}
```

The migration is three changes: replace the KAPT plugin with KSP, change `kapt()` to `ksp()` in dependencies, and remove the `kotlin-kapt` plugin line entirely. No changes to Kotlin source code — the `@Dao`, `@Entity`, `@Database`, and `@JsonClass` annotations work identically with KSP processors.

---

## Module 8: R8, ProGuard, and Baseline Profiles

R8 and Baseline Profiles are complementary optimization tools. R8 optimizes your bytecode at build time — shrinking, obfuscating, and optimizing before it reaches the device. Baseline Profiles optimize how ART compiles that bytecode on the device — ensuring critical code paths are AOT-compiled from the first launch.

### Lesson 8.1: R8 Code Shrinking and Optimization

R8 is the default code shrinker, optimizer, and obfuscator for Android release builds. It replaced ProGuard as the default in AGP 3.4, and while it's backward-compatible with ProGuard rules, it does significantly more. R8 performs four major optimization passes on your compiled bytecode.

**Tree shaking** traces all reachable code paths from entry points and removes everything unreachable — in a typical app with large libraries, this can cut 30-50% of the total method count. **Code inlining** replaces short method calls with the method body itself, which matters a lot with Kotlin's extension functions and inline-heavy style. **Class merging** combines single-implementation interfaces into fewer classes, eliminating dispatch overhead. **Dead code elimination** removes unreachable branches, unused variables, and assignments whose results are never read.

```kotlin
// build.gradle.kts — basic R8 configuration
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

The `proguard-android-optimize.txt` file is a default rules file from the SDK that includes common keep rules for Android framework classes. Your `proguard-rules.pro` file adds project-specific rules. `isShrinkResources = true` enables resource shrinking — removing resources that aren't referenced by any code after tree shaking.

**Key takeaway:** R8 performs tree shaking, code inlining, class merging, and dead code elimination on release builds. It can remove 30-50% of the total method count. Always enable `isMinifyEnabled` and `isShrinkResources` for release builds.

### Lesson 8.2: R8 Full Mode

R8 has two modes: compatible (default) and full mode. Compatible mode respects all ProGuard rules and avoids optimizations that could break reflection-based code. Full mode is more aggressive — it doesn't preserve class hierarchy for classes that aren't explicitly kept, and it can merge, inline, or remove classes even if some library tries to access them via reflection.

```properties
# gradle.properties — enable R8 full mode
android.enableR8.fullMode=true
```

On a production app with roughly 120 third-party dependencies, switching from compatible to full mode dropped the APK size from 18.2 MB to 12.6 MB — a 31% reduction. Method count dropped by about 40%. Build time increased by roughly 15 seconds, which is negligible for a release build.

The tradeoff is that full mode breaks reflection-based code more aggressively. This is where serialization library choice makes a huge difference. Gson uses runtime reflection to inspect class fields and call constructors — R8 can't see this usage, so it strips no-arg constructors and field types it thinks are unused. kotlinx.serialization, on the other hand, uses a compiler plugin to generate serializers at compile time. There's no reflection involved, so R8 can see the entire code path and optimize safely.

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

My rule of thumb: if you're adding more than 5-6 keep rules for a single library's models, reconsider whether a codegen-based approach (kotlinx.serialization, Moshi with codegen) would be cleaner.

**Key takeaway:** R8 full mode provides aggressive optimization — 30%+ APK size reduction. It requires careful keep rules for reflection-based libraries. Prefer codegen-based serialization (kotlinx.serialization, Moshi) over reflection-based (Gson) for R8 compatibility.

### Lesson 8.3: Writing ProGuard/R8 Keep Rules

Keep rules tell R8 which classes, methods, and fields must survive shrinking and obfuscation. The most common rules handle reflection-based access patterns, JNI callbacks, and serialization model classes.

```
# proguard-rules.pro

# Keep all classes with @Keep annotation
-keep @androidx.annotation.Keep class * { *; }

# Keep data classes used with Gson (if not migrated to kotlinx.serialization)
-keepclassmembers class com.myapp.data.model.** {
    <init>(...);
    <fields>;
}

# Keep enum values (used by serialization and Retrofit)
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Retrofit service interfaces
-keep,allowobfuscation interface com.myapp.data.api.*

# Keep Hilt entry points
-keep class * extends dagger.hilt.android.internal.lifecycle.HiltViewModelFactory { *; }

# Debugging: keep source file names and line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

The approach I recommend: enable R8 full mode, run your full test suite against the release build, and add keep rules only for verified breakages rather than preemptively keeping everything. Too many keep rules defeat the purpose of R8 — if you're keeping half your codebase, you're not getting meaningful size reduction.

For debugging R8 issues, use the `-printusage` and `-printseeds` flags. `-printusage` shows what R8 removed, and `-printseeds` shows what matched your keep rules. When a release build crashes but debug works, the R8 usage report tells you exactly which class or method was stripped.

```
# Diagnostic rules — add temporarily when debugging R8 issues
-printusage build/outputs/mapping/release/usage.txt
-printseeds build/outputs/mapping/release/seeds.txt
-printconfiguration build/outputs/mapping/release/configuration.txt
```

**Key takeaway:** Write keep rules for reflection-based access, JNI, and serialization models. Keep `-keepattributes SourceFile,LineNumberTable` for readable crash reports. Add rules reactively based on verified breakages, not preemptively.

### Lesson 8.4: Baseline Profiles — Solving the Cold Start Problem

When your app first launches after installation, ART interprets the dex bytecode line by line — which is slow. Over time, ART's JIT compiler identifies hot methods and compiles them to native code, and eventually performs profile-guided AOT compilation in the background. But on first install, there is no profile. The user's first experience with your app is the worst it will ever be.

Baseline Profiles solve this by shipping a profile inside the APK that tells ART which methods to AOT-compile immediately at install time. Google's benchmarks show 30% or more improvement on cold start times. Apps with heavy DI initialization (Dagger/Hilt component building) see massive gains because those code paths are deeply nested.

```kotlin
// benchmark/src/main/kotlin/BaselineProfileGenerator.kt
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generateStartupProfile() {
        rule.collect(
            packageName = "com.example.myapp",
            includeInStartupProfile = true
        ) {
            pressHome()
            startActivityAndWait()

            // Navigate through critical user journeys
            device.findObject(By.res("feed_list"))
                .wait(Until.hasObject(By.res("article_card")), 5_000)

            device.findObject(By.res("feed_list"))
                .scroll(Direction.DOWN, 2.0f)

            device.findObject(By.res("article_card")).click()
            device.wait(Until.hasObject(By.res("article_content")), 3_000)
        }
    }
}
```

The generator test exercises your app's critical paths — startup, navigation, scrolling — while the framework records which methods and classes are accessed. The generated profile gets bundled into your APK via the Baseline Profile Gradle plugin:

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("androidx.baselineprofile")
}

dependencies {
    baselineProfile(project(":benchmark"))
}

baselineProfile {
    automaticGenerationDuringBuild = true
    saveInSrc = true
}
```

Setting `saveInSrc = true` writes the profile to `src/main/baselineProfiles/` so it gets committed to version control. This makes the profile reproducible and reviewable in code review.

**Key takeaway:** Baseline Profiles tell ART which methods to AOT-compile at install time, eliminating the cold start penalty. Generate them using Macrobenchmark tests that exercise critical user journeys. Ship them inside the APK for immediate impact.

### Lesson 8.5: ProfileInstaller and Verification

Baseline Profiles shipped in the APK only get installed automatically through the Play Store's install flow. If you're sideloading APKs, distributing through Firebase App Distribution, or using any install path that isn't Play, the profile sits inside the APK doing nothing. ART never sees it.

`ProfileInstaller` from the `androidx.profileinstaller` library solves this. It includes a `ProfileInstallerInitializer` that uses App Startup to install the bundled profile at first launch. It reads the profile from the APK's assets, transcodes it into the format the device's ART version expects, and writes it where `dex2oat` picks it up.

For CI pipelines and staging builds, `ProfileVerifier` lets you query the compilation status at runtime:

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
        }
    }
}
```

Without `ProfileVerifier`, you're flying blind — you ship profiles but have no way to confirm they're actually being used on real devices. This should be the first thing you add after enabling Baseline Profiles, especially if your team distributes test builds outside of Play.

**Key takeaway:** Add `ProfileInstaller` to make Baseline Profiles work outside the Play Store. Use `ProfileVerifier` to confirm profiles are installed and compiled. Without these, sideloaded builds get zero benefit from your Baseline Profiles.

### Lesson 8.6: Measuring Startup Impact

All optimization work is meaningless without measurement. The Macrobenchmark library provides `StartupTimingMetric` for measuring cold, warm, and hot startup times with statistical rigor:

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {

    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun coldStartupNoProfile() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.myapp",
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
            packageName = "com.example.myapp",
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

The `CompilationMode` parameter is key. `CompilationMode.None()` simulates first install with no profiles — everything interpreted. `CompilationMode.Partial` with `BaselineProfileMode.Require` applies your Baseline Profile, simulating a Play Store install. Running both on the same device gives a clean before/after comparison. Typical results show 30-40% cold start improvement.

For deeper analysis, open the Macrobenchmark traces in Perfetto. In the "no profile" trace, you'll see dozens of JIT compilation events during startup — each representing a method being compiled on-the-fly while your user waits. In the "with profile" trace, those slices largely disappear because the methods were already AOT-compiled.

**Key takeaway:** Use `StartupTimingMetric` with `CompilationMode.None()` and `CompilationMode.Partial` to measure before/after impact. Open traces in Perfetto to understand why — look for JIT compilation slices that disappear with profiles.

### Quiz: R8, ProGuard, and Baseline Profiles

#### What is the primary benefit of R8 full mode over compatible mode?

- ❌ Full mode builds faster
- ✅ Full mode performs more aggressive optimizations, producing smaller APKs
- ❌ Full mode doesn't require ProGuard rules
- ❌ Full mode supports Compose and KSP

> **Explanation:** R8 full mode performs additional optimizations like class merging, aggressive inlining, and class hierarchy simplification. On a typical app with many third-party dependencies, this can reduce APK size by 30%+ compared to compatible mode. The tradeoff is that reflection-based code needs explicit keep rules.

#### Why are Baseline Profiles more reliable than Play Store cloud profiles?

- ❌ Baseline Profiles use a different ART compilation mode
- ❌ Baseline Profiles support more Android API levels
- ✅ Baseline Profiles ship in the APK and work immediately, while cloud profiles take 2-3 weeks to propagate
- ❌ Baseline Profiles cover all methods, not just hot ones

> **Explanation:** Cloud profiles aggregate from real users and take 2-3 weeks to propagate after each release. Baseline Profiles are generated at build time and ship in the APK, providing AOT compilation from the first install without waiting.

#### Why does kotlinx.serialization work better with R8 than Gson?

- ❌ kotlinx.serialization has built-in R8 support through the Android SDK
- ✅ kotlinx.serialization uses compile-time codegen instead of runtime reflection, so R8 can trace all code paths
- ❌ kotlinx.serialization produces smaller generated code
- ❌ Gson is incompatible with R8 full mode

> **Explanation:** Gson uses runtime reflection to inspect fields and call constructors — R8 can't see this usage and may strip necessary code. kotlinx.serialization uses a compiler plugin to generate serializers at compile time, so R8 can trace the entire code path and optimize safely without keep rules.

### Coding Challenge: Configure R8 Full Mode with Proper Keep Rules

Set up a release build configuration with R8 full mode, resource shrinking, keep rules for crash reporting, and a custom keep rule for Retrofit service interfaces.

#### Solution

```properties
# gradle.properties
android.enableR8.fullMode=true
```

```kotlin
// app/build.gradle.kts
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

```
# proguard-rules.pro

# Keep source file and line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep Retrofit service interfaces (accessed via Proxy.newProxyInstance)
-keep,allowobfuscation interface com.myapp.data.api.** {
    @retrofit2.http.* <methods>;
}

# Keep kotlinx.serialization — @Serializable classes (compiler-generated)
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep enum values for serialization
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
```

R8 full mode with these rules aggressively optimizes while keeping crash reports readable, Retrofit functional, and serialization working. The kotlinx.serialization rules are minimal because the compiler plugin generates code that R8 can trace — unlike Gson, which would need broad keep rules for every model class.

---

## Module 9: Multi-Module Build Architecture

As Android projects grow, modularization becomes essential for build performance, code organization, and team scalability. But modularization without a clear strategy leads to dependency tangles, build script duplication, and modules that don't actually provide build isolation.

### Lesson 9.1: Module Types and Responsibilities

A well-structured Android project uses distinct module types, each with clear responsibilities. The most common architecture follows the pattern used in Google's Now In Android sample: application modules, feature modules, core library modules, and convention plugin modules.

**Application modules** (`:app`) apply the `com.android.application` plugin, configure the application ID, signing, and variant-specific settings. They depend on feature modules and act as the composition root for dependency injection. Ideally, the app module contains minimal code — just the `Application` class, navigation graph, and DI setup.

**Feature modules** (`:feature:orders`, `:feature:profile`) contain UI, ViewModels, and navigation logic for a specific user-facing feature. They depend on core modules but never depend on other feature modules — this ensures features can be built independently and enables parallel compilation.

**Core library modules** (`:core:data`, `:core:network`, `:core:model`, `:core:ui`) provide shared infrastructure. `:core:model` holds data classes and domain models. `:core:network` wraps API clients. `:core:data` implements repositories. `:core:ui` provides shared Compose components and themes.

```kotlin
// feature/orders/build.gradle.kts
plugins {
    id("myapp.android.feature")  // Convention plugin handles all configuration
}

android {
    namespace = "com.myapp.feature.orders"
}

dependencies {
    implementation(project(":core:data"))
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)
}
```

The module dependency graph should be a DAG (directed acyclic graph) with clear layers. Feature modules depend on core modules, but never on each other. Core modules can depend on other core modules at the same or lower level. The app module depends on everything and wires it together.

**Key takeaway:** Use distinct module types with clear responsibilities. Feature modules never depend on other features. Core modules provide shared infrastructure. The app module is the composition root. This structure enables parallel builds and clean dependency boundaries.

### Lesson 9.2: Module Dependency Configuration

How you declare dependencies between modules has a direct impact on build performance. The `implementation` vs `api` choice controls the recompilation blast radius — how many modules need to recompile when you change one.

```kotlin
// feature/home/build.gradle.kts
dependencies {
    // core:model uses 'api' — its data classes appear in HomeUiState
    // which is exposed as public API from this module
    api(project(":core:model"))

    // core:network uses 'implementation' — internal detail, not exposed
    implementation(project(":core:network"))

    // core:data uses 'implementation' — repository is internal
    implementation(project(":core:data"))

    // Compose dependencies
    implementation(libs.bundles.compose)
    implementation(libs.lifecycle.viewmodel.compose)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.turbine)
}
```

The rule is strict: use `implementation` unless the dependency's types appear in your module's public API. If `HomeScreenViewModel` returns a `HomeUiState` that contains types from `:core:model`, then `:core:model` must be `api`. But `:core:network` and `:core:data` are internal details — no types from those modules appear in the feature module's public interface.

In a chain of 5 modules all using `api`, changing one library triggers recompilation across all 5. With `implementation`, only the declaring module recompiles. On a 20-module project, using `implementation` everywhere you can reduces incremental build times by 30-50% compared to naive `api` usage.

**Key takeaway:** Use `implementation` for module dependencies by default. Switch to `api` only when a dependency's types appear in your module's public API. Each `api` declaration expands the recompilation blast radius across the module graph.

### Lesson 9.3: Non-Transitive R Classes

By default, each module's R class includes resource IDs from all its transitive dependencies. In a 20-module project, the `:app` module's R class contains every resource ID from every module — thousands of fields generated, compiled, and dexed redundantly. Non-transitive R classes limit each module's R class to only its own resources.

```properties
# gradle.properties
android.nonTransitiveRClass=true
```

This setting became the default for new projects in AGP 8.0, but existing projects need to opt in. One project I migrated saw R class field count drop from 45,000 to 8,000 across all modules. Build times improved because there's less code to compile and dex, and incremental builds are faster because changing a resource in one module doesn't trigger R class regeneration in every dependent module.

The migration cost is updating resource references. After enabling non-transitive R classes, `R.string.app_name` in a feature module won't compile if `app_name` is defined in `:core:ui` — you need to import the correct R class:

```kotlin
// Before non-transitive R classes
// R.string.app_name works everywhere because R is transitive

// After non-transitive R classes
import com.myapp.core.ui.R
// Now R.string.app_name resolves to core:ui's resources
```

Android Studio's "Migrate to Non-Transitive R Classes" refactoring handles most of this automatically. Run it module by module and fix any remaining compilation errors manually.

**Key takeaway:** Enable `android.nonTransitiveRClass=true` to reduce R class size and improve build times. Each module's R class only contains its own resources. Migration requires updating imports but is largely automated by Android Studio.

### Lesson 9.4: Module-Level Build Feature Optimization

Each module should only enable the build features it actually uses. A `:core:network` module doesn't need Compose, BuildConfig, or AIDL. A `:core:model` module doesn't need anything except the Kotlin compiler. Every enabled feature adds a code generation step that multiplies across modules.

```kotlin
// Convention plugin for a pure Kotlin/data module
class KotlinLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig.minSdk = 24

                buildFeatures {
                    buildConfig = false
                    aidl = false
                    renderScript = false
                    resValues = false
                    shaders = false
                }

                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }
        }
    }
}
```

This plugin disables everything except the bare minimum for an Android library module. For modules that need Compose, use a separate convention plugin that enables `compose = true` and adds Compose dependencies. For modules that need BuildConfig, enable it only in those specific modules.

The cumulative effect is significant. On a 30-module project where 25 library modules had all build features enabled by default, selectively disabling unused features saved about 8 seconds per incremental build — the time previously spent generating unused BuildConfig, AIDL, and RenderScript code across every module.

**Key takeaway:** Create specialized convention plugins that enable only the build features each module type needs. A data module doesn't need Compose. A model module doesn't need BuildConfig. The savings compound across your module count.

### Lesson 9.5: Build Performance with Modularization

Modularization improves build performance through parallelism and cache isolation. Independent modules compile in parallel, and changes to one module don't invalidate the cache of unrelated modules. But there are diminishing returns — over-modularization adds configuration overhead and dependency resolution time.

```bash
# Check which modules are building in parallel
./gradlew assembleDebug --parallel --info 2>&1 | grep "Starting"

# View the module dependency graph
./gradlew :app:dependencies --configuration runtimeClasspath
```

A practical guideline: if a module has fewer than 5 source files, it probably shouldn't be its own module — the configuration overhead outweighs the parallelism benefit. If a module has more than 200 source files and serves multiple features, it should probably be split. The sweet spot for most teams is 10-30 modules for a medium-sized app.

Monitor build performance as you modularize. Adding a module should reduce incremental build times because changes are more isolated. If adding a module increases build times, the module might be too granular (adding configuration overhead) or its dependencies might be wrong (pulling in too much of the graph).

**Key takeaway:** Modularization improves parallel compilation and cache isolation. But over-modularization adds configuration overhead. Aim for the sweet spot where each module is large enough to justify its existence but small enough to provide real build isolation.

### Quiz: Multi-Module Build Architecture

#### Why should feature modules never depend on other feature modules?

- ❌ Gradle doesn't allow dependencies between library modules
- ❌ Feature modules use different convention plugins
- ✅ Independent features enable parallel compilation and prevent tight coupling
- ❌ Android Studio can't navigate between feature modules

> **Explanation:** If `:feature:orders` depends on `:feature:profile`, they must build sequentially and changes in profile trigger recompilation of orders. Independent features build in parallel and have isolated caches, significantly improving build times.

#### What does `android.nonTransitiveRClass=true` do?

- ❌ It prevents resources from being included in the APK
- ❌ It removes the R class entirely, using data binding instead
- ✅ It limits each module's R class to only its own resources instead of including all transitive dependencies
- ❌ It generates R classes at runtime instead of compile time

> **Explanation:** By default, each module's R class includes resource IDs from all dependencies. Non-transitive R classes limit it to the module's own resources, reducing generated code from thousands of fields to hundreds and improving incremental build times.

#### When should you split a module into smaller modules?

- ❌ When the module has more than 10 classes
- ❌ When multiple developers work on the same module
- ✅ When the module serves multiple features and has over 200 source files
- ❌ When the module is the largest in the project

> **Explanation:** Split when a module is large enough that changes in one part trigger unnecessary recompilation of unrelated code. Over-modularization (fewer than 5 files per module) adds configuration overhead without meaningful parallelism benefit.

### Coding Challenge: Design a Multi-Module Dependency Graph

Set up the `build.gradle.kts` files for a multi-module project with `:app`, `:feature:home`, `:feature:orders`, `:core:network`, `:core:data`, and `:core:model`. Use proper `implementation` vs `api` declarations and convention plugins.

#### Solution

```kotlin
// core/model/build.gradle.kts
plugins {
    id("myapp.android.library")
}
android { namespace = "com.myapp.core.model" }
// Pure data classes — no dependencies on other modules

// core/network/build.gradle.kts
plugins {
    id("myapp.android.library")
}
android { namespace = "com.myapp.core.network" }
dependencies {
    api(project(":core:model"))  // Network responses use model types
    implementation(libs.bundles.networking)
}

// core/data/build.gradle.kts
plugins {
    id("myapp.android.library")
}
android { namespace = "com.myapp.core.data" }
dependencies {
    api(project(":core:model"))  // Repository methods return model types
    implementation(project(":core:network"))
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)
}

// feature/home/build.gradle.kts
plugins {
    id("myapp.android.feature")
}
android { namespace = "com.myapp.feature.home" }
dependencies {
    implementation(project(":core:data"))
}

// feature/orders/build.gradle.kts
plugins {
    id("myapp.android.feature")
}
android { namespace = "com.myapp.feature.orders" }
dependencies {
    implementation(project(":core:data"))
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)
}

// app/build.gradle.kts
plugins {
    id("myapp.android.application")
}
android { namespace = "com.myapp" }
dependencies {
    implementation(project(":feature:home"))
    implementation(project(":feature:orders"))
}
```

`:core:model` uses `api` in `:core:network` and `:core:data` because their public APIs return model types. Feature modules use `implementation` for everything because they don't expose types to other modules. The `:app` module ties it all together.

---

## Module 10: CI/CD and Build Automation

CI/CD is where all your build optimizations pay off at scale. A well-configured pipeline catches bugs early, enforces quality gates, and ships builds without manual intervention. For Android projects, the specific challenges are managing the Android SDK in headless environments, caching Gradle dependencies efficiently, and handling signing for release builds.

### Lesson 10.1: GitHub Actions for Android

GitHub Actions is the most common CI platform for Android projects hosted on GitHub. The basic workflow checks out the code, sets up JDK and Gradle, builds the project, and runs tests:

```yaml
# .github/workflows/build.yml
name: Build & Test
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: build-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: ${{ github.ref != 'refs/heads/main' }}
          gradle-home-cache-cleanup: true

      - name: Build debug
        run: ./gradlew assembleDebug

      - name: Run unit tests
        run: ./gradlew testDebugUnitTest

      - name: Run lint
        run: ./gradlew lintDebug
```

The `concurrency` block cancels in-progress builds when a new commit is pushed to the same branch. Without this, every push creates a new build and they pile up — wasting CI minutes. `cancel-in-progress: true` ensures only the latest commit is built.

The `gradle/actions/setup-gradle@v4` action provides intelligent caching of Gradle dependencies, wrapper validation, and build scan support. It replaces manual cache configuration with `actions/cache` — which is error-prone and often misconfigured.

**Key takeaway:** Use `gradle/actions/setup-gradle` for Gradle caching in CI. Add `concurrency` with `cancel-in-progress` to avoid wasting CI minutes. Run build, test, and lint steps separately for clear failure attribution.

### Lesson 10.2: Build Caching in CI

Proper caching transforms CI build times. Without caching, every CI build downloads dependencies and compiles from scratch. With caching, subsequent builds reuse downloaded dependencies and cached compilation outputs.

```yaml
- name: Set up Gradle
  uses: gradle/actions/setup-gradle@v4
  with:
    cache-read-only: ${{ github.ref != 'refs/heads/main' }}
    gradle-home-cache-cleanup: true
```

The `cache-read-only` setting is critical. When set to `true` for non-main branches, PR builds can read from the cache (benefiting from main branch builds) but won't write to it. This prevents branch-specific artifacts from polluting the shared cache and evicting useful entries. Only the main branch writes to the cache, ensuring a clean baseline.

`gradle-home-cache-cleanup` removes unused cache entries to prevent the cache from growing indefinitely. GitHub Actions limits cache storage to 10GB per repository, so aggressive cleanup is important for multi-module projects with large dependency graphs.

For larger projects, consider separating dependency download from compilation:

```yaml
- name: Download dependencies
  run: ./gradlew dependencies --quiet

- name: Build
  run: ./gradlew assembleDebug --build-cache

- name: Test
  run: ./gradlew testDebugUnitTest --build-cache
```

The `--build-cache` flag ensures task outputs are cached between CI runs. Combined with `--parallel`, this can reduce CI build times by 40-60% on subsequent runs.

**Key takeaway:** Cache Gradle dependencies and build outputs in CI. Use `cache-read-only` for non-main branches to keep the cache clean. This turns a 10-minute build into a 3-minute build on subsequent runs.

### Lesson 10.3: Signing and Release Builds in CI

Release builds in CI need access to the keystore and signing passwords. These should be stored as encrypted secrets in your CI platform, never committed to the repository.

```yaml
# .github/workflows/release.yml
name: Release Build
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - uses: gradle/actions/setup-gradle@v4

      - name: Decode keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
        run: echo "$KEYSTORE_BASE64" | base64 --decode > app/keystore/release.jks

      - name: Build release
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew assembleRelease

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: release-apk
          path: app/build/outputs/apk/release/app-release.apk

      - name: Upload AAB
        uses: actions/upload-artifact@v4
        with:
          name: release-aab
          path: app/build/outputs/bundle/release/app-release.aab
```

The keystore file is base64-encoded and stored as a GitHub secret. During the CI run, it's decoded to a file that the signing configuration references. The passwords come from separate secrets. After the build, both APK and AAB are uploaded as artifacts for download.

To encode your keystore for GitHub secrets: `base64 < app/keystore/release.jks | pbcopy` (macOS) or `base64 app/keystore/release.jks` (Linux). Then store the output as the `KEYSTORE_BASE64` secret.

**Key takeaway:** Store keystore as a base64-encoded secret and decode it during CI. Pass signing passwords as environment variables from encrypted secrets. Never commit credentials to the repository.

### Lesson 10.4: Quality Gates and Automated Checks

A mature CI pipeline goes beyond "build and test." It enforces quality gates that catch issues before they reach the main branch — lint violations, unused dependencies, snapshot dependency leaks, and APK size regressions.

```yaml
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: true

      - name: Lint
        run: ./gradlew lintDebug

      - name: Dependency analysis
        run: ./gradlew buildHealth

      - name: Check for snapshots
        run: ./gradlew checkNoSnapshots

      - name: Upload lint report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lint-report
          path: '**/build/reports/lint-results-*.html'
```

The `if: always()` on the upload step ensures lint reports are available even when the lint step fails — which is exactly when you need them most. The `buildHealth` task from the Dependency Analysis Plugin catches unused or misconfigured dependencies. The `checkNoSnapshots` task (from Module 6) prevents shipping with development dependencies.

For APK size monitoring, you can add a step that compares the release APK size against a baseline stored in the repository or a previous build artifact. Size regressions above a threshold (e.g., 5%) fail the build, prompting investigation before merging.

**Key takeaway:** Automate lint, dependency analysis, and snapshot checks in CI. Upload reports as artifacts with `if: always()`. Quality gates catch issues that humans reliably miss in code review.

### Lesson 10.5: Optimizing CI Build Times

CI minutes cost money, and slow pipelines slow down the entire team's feedback loop. Several optimizations are specific to CI environments and can dramatically reduce pipeline duration.

**Run tasks in a single Gradle invocation.** Instead of separate `./gradlew assembleDebug`, `./gradlew testDebugUnitTest`, and `./gradlew lintDebug` steps, combine them:

```yaml
- name: Build, Test, and Lint
  run: ./gradlew assembleDebug testDebugUnitTest lintDebug --parallel --build-cache
```

A single Gradle invocation avoids paying the JVM startup and configuration phase cost three times. On a 15-module project, this alone saves 20-30 seconds per CI run.

**Use `--no-daemon` in CI** (or let the Gradle action handle it). CI runners are ephemeral — the daemon provides no benefit because it's killed after the job finishes. The Gradle action handles this automatically.

**Split long-running jobs into parallel steps.** If your test suite takes 8 minutes, split it by module or test type. GitHub Actions supports matrix strategies for this:

```yaml
jobs:
  test:
    strategy:
      matrix:
        module: [':core:data', ':core:network', ':feature:home', ':feature:orders']
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: true

      - name: Test ${{ matrix.module }}
        run: ./gradlew ${{ matrix.module }}:testDebugUnitTest
```

This runs tests for each module in parallel on separate runners. If testing takes 8 minutes sequentially, parallel execution can bring it down to the duration of the slowest module.

**Key takeaway:** Combine Gradle tasks into single invocations to avoid repeated startup costs. Use matrix strategies to parallelize long-running test suites. Every second saved in CI compounds across every PR and every developer.

### Lesson 10.6: Automated Release Pipelines

A complete release pipeline handles version bumping, changelog generation, signing, uploading to Play Store, and tagging the release in git. The key principle is that releases should be reproducible and auditable — every release build maps to a specific git tag and commit.

```yaml
# .github/workflows/deploy.yml
name: Deploy to Play Store
on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - uses: gradle/actions/setup-gradle@v4

      - name: Decode keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
        run: echo "$KEYSTORE_BASE64" | base64 --decode > app/keystore/release.jks

      - name: Build release AAB
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew bundleRelease

      - name: Upload to Play Store
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_STORE_SERVICE_ACCOUNT }}
          packageName: com.myapp
          releaseFiles: app/build/outputs/bundle/release/app-release.aab
          track: internal
          status: completed
```

The workflow triggers on GitHub release publication. It builds the AAB, signs it, and uploads to the Play Store's internal track. Promotion from internal → alpha → beta → production happens manually through the Play Console, giving the team control over rollout timing.

The service account JSON for Play Store uploads should be generated in the Google Play Console under API Access. Store it as a GitHub secret, not in the repository. The `internal` track is used for initial upload — the team reviews and promotes through tracks as confidence grows.

**Key takeaway:** Automate release builds triggered by git tags or GitHub releases. Upload to Play Store's internal track automatically, promote to production manually. Store all credentials as encrypted secrets.

### Quiz: CI/CD and Build Automation

#### Why should you set `cache-read-only` to `true` for non-main branches in CI?

- ❌ It prevents the CI from downloading dependencies
- ❌ It speeds up the build by skipping all caching
- ✅ It prevents PR branches from polluting the shared cache with branch-specific entries
- ❌ It is required by GitHub Actions for security reasons

> **Explanation:** Setting `cache-read-only: true` for non-main branches means PRs can read from the cache (benefiting from main branch builds) but won't write to it. This keeps the cache clean and efficient.

#### Why combine multiple Gradle tasks into a single `./gradlew` invocation in CI?

- ❌ GitHub Actions only allows one Gradle step per job
- ❌ Multiple invocations cause dependency conflicts
- ✅ A single invocation avoids paying JVM startup and configuration phase costs multiple times
- ❌ Combined tasks produce a single, unified test report

> **Explanation:** Each Gradle invocation pays the JVM startup cost (~5 seconds) and configuration phase cost (~8-15 seconds for multi-module projects). Combining `assembleDebug`, `testDebugUnitTest`, and `lintDebug` into one invocation saves 20-30 seconds by doing startup and configuration once.

#### What is the recommended way to store an Android keystore for CI release builds?

- ❌ Commit the keystore file directly to the repository
- ❌ Store the keystore in a shared cloud drive and download during build
- ✅ Base64-encode the keystore and store it as an encrypted CI secret
- ❌ Generate a new keystore for each CI build

> **Explanation:** The keystore is base64-encoded and stored as an encrypted secret in the CI platform. During the build, it's decoded to a file. Passwords are stored as separate secrets. This keeps credentials out of version control while making them available during builds.

### Coding Challenge: Create a Complete CI Workflow with Quality Gates

Build a GitHub Actions workflow that runs on PRs and pushes to main, with parallel build/test and lint jobs, build caching, artifact uploads, and concurrency control.

#### Solution

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: ${{ github.ref != 'refs/heads/main' }}

      - name: Build and Test
        run: ./gradlew assembleDebug testDebugUnitTest --parallel --build-cache

      - name: Upload debug APK
        uses: actions/upload-artifact@v4
        with:
          name: debug-apk
          path: app/build/outputs/apk/debug/app-debug.apk

      - name: Upload test reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: '**/build/reports/tests/'

  lint-and-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: true

      - name: Lint and Dependency Analysis
        run: ./gradlew lintDebug buildHealth --parallel --build-cache

      - name: Upload lint report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lint-report
          path: '**/build/reports/lint-results-*.html'
```

The build/test and lint/analysis jobs run in parallel, cutting total pipeline time. Both share the Gradle cache from main branch builds. The `if: always()` on upload steps ensures reports are available for debugging even when tasks fail.

---

Thank You for completing the Gradle & Build Systems course! Gradle is the tool you use every day but rarely master. Understanding it deeply — from the three-phase lifecycle to convention plugins to CI optimization — saves hours of frustration and compounds across every build, every developer, every day. ⚙️
