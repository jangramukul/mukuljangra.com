---
title: "Gradle & Build Systems"
layout: course
description: "Master Gradle for Android — build scripts, plugins, variant management, build optimization, version catalogs, and custom tasks."
icon: "⚙️"
color: "#2dd4bf"
difficulty: "Beginner to Advanced"
modules: 7
lessons: 32
duration: "4 weeks"
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
prerequisites:
  - "Basic Android project experience"
  - "Terminal/command line familiarity"
---

## Module 1: Gradle Fundamentals

Gradle is the build system behind every Android project. Understanding it saves hours of debugging build failures.

### Lesson 1.1: Build Script Basics

```kotlin
// build.gradle.kts (Module-level)
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
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
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.compose.ui)
    testImplementation(libs.junit)
}
```

**Groovy vs Kotlin DSL** — Kotlin DSL (`.gradle.kts`) gives you IDE autocomplete, type safety, and refactoring support. Migrate to Kotlin DSL if you haven't already.

**Key takeaway:** Build scripts are code. Treat them with the same care as your application code — keep them clean, documented, and consistent.

### Lesson 1.2: Project Structure

```
project-root/
├── build.gradle.kts          (Root — plugin versions, repositories)
├── settings.gradle.kts       (Module declarations, version catalogs)
├── gradle.properties          (Build properties, JVM args)
├── gradle/
│   ├── libs.versions.toml    (Version catalog)
│   └── wrapper/
│       └── gradle-wrapper.properties
├── app/
│   └── build.gradle.kts      (Application module)
├── core/
│   └── build.gradle.kts      (Library module)
```

### Lesson 1.3: Tasks and the Build Lifecycle

```bash
# List all tasks
./gradlew tasks

# Run specific task
./gradlew assembleDebug

# Task with dependencies
./gradlew build  # Runs: compile → test → assemble
```

**Three phases:**
1. **Initialization** — Determines which projects are in the build
2. **Configuration** — Configures all tasks (even ones that won't run)
3. **Execution** — Runs the requested tasks

**Key takeaway:** Configuration happens for ALL tasks, not just the ones you run. Expensive code in the configuration phase slows down every build command.

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
        println("👋 Hello from ${project.name}! Today is $date")
    }
}
```

The task is registered lazily using `tasks.register` (not `tasks.create`), which means Gradle only configures it when it's actually needed. The `doLast` block ensures the print logic runs during the Execution phase, not during Configuration. Run it with `./gradlew greetDeveloper`.

---

## Module 2: Version Catalogs

### Lesson 2.1: libs.versions.toml

```toml
[versions]
kotlin = "2.1.0"
compose-bom = "2025.01.01"
hilt = "2.53.1"
coroutines = "1.10.1"
room = "2.7.0"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version = "1.15.0" }
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }

[bundles]
compose = ["compose-ui", "compose-material3"]
room = ["room-runtime", "room-ktx"]

[plugins]
android-application = { id = "com.android.application", version = "8.8.0" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
ksp = { id = "com.google.devtools.ksp", version = "2.1.0-1.0.29" }
```

```kotlin
// Usage in build.gradle.kts
dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.bundles.compose)
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)
}
```

**Key takeaway:** Version catalogs centralize dependency management. Update versions in one place. Bundles group related dependencies together.

### Quiz: Version Catalogs

#### In `libs.versions.toml`, what does `version.ref` do in a library declaration?

- ❌ It pins the library to a fixed version that cannot be overridden
- ❌ It creates a new version entry automatically
- ✅ It references a version defined in the `[versions]` section
- ❌ It fetches the latest version from Maven Central

> **Explanation:** `version.ref` points to a named version in the `[versions]` section, allowing multiple libraries to share the same version (e.g., Room runtime and Room KTX both using `version.ref = "room"`).

#### What is the purpose of `[bundles]` in a version catalog?

- ❌ To bundle the app into an APK or AAB
- ✅ To group related dependencies so they can be added with a single line
- ❌ To define plugin groups for multi-module projects
- ❌ To create dependency exclusion rules

> **Explanation:** Bundles group related libraries together. Instead of adding `compose-ui` and `compose-material3` separately, you can use `implementation(libs.bundles.compose)` to add them all at once.

### Coding Challenge: Extend the Version Catalog

Add Retrofit and OkHttp to the version catalog (`libs.versions.toml`) with a shared version, then create a bundle and use it in a `build.gradle.kts` file.

#### Solution

```toml
# In gradle/libs.versions.toml
[versions]
retrofit = "2.11.0"
okhttp = "4.12.0"

[libraries]
retrofit-core = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-gson = { group = "com.squareup.retrofit2", name = "converter-gson", version.ref = "retrofit" }
okhttp-core = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
okhttp-logging = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }

[bundles]
networking = ["retrofit-core", "retrofit-gson", "okhttp-core", "okhttp-logging"]
```

```kotlin
// In build.gradle.kts
dependencies {
    implementation(libs.bundles.networking)
}
```

The Retrofit libraries share a single `retrofit` version ref, and OkHttp libraries share an `okhttp` version ref. The `networking` bundle groups all four so you add them with one line.

---

## Module 3: Build Variants and Flavors

### Lesson 3.1: Build Types

```kotlin
android {
    buildTypes {
        debug {
            isDebuggable = true
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

### Lesson 3.2: Product Flavors

```kotlin
android {
    flavorDimensions += "environment"
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
    }
}
```

**Key takeaway:** Use build types for debug/release configuration. Use product flavors for environment or brand variations. Combined, they create build variants: `stagingDebug`, `productionRelease`, etc.

### Quiz: Build Variants and Flavors

#### If you have 2 build types (debug, release) and 2 product flavors (staging, production), how many build variants does Gradle generate?

- ❌ 2
- ❌ 3
- ✅ 4
- ❌ 6

> **Explanation:** Build variants are the Cartesian product of build types and product flavors. 2 types × 2 flavors = 4 variants: `stagingDebug`, `stagingRelease`, `productionDebug`, `productionRelease`.

#### What does `isMinifyEnabled = true` do in a release build type?

- ❌ Minifies image assets to reduce APK size
- ❌ Removes unused Gradle modules from the build
- ✅ Enables R8 code shrinking and obfuscation
- ❌ Compresses the APK using ZIP compression

> **Explanation:** `isMinifyEnabled = true` enables R8, which shrinks unused code, optimizes bytecode, and obfuscates class/method names. It's typically paired with `isShrinkResources = true` to also remove unused resources.

#### What is the purpose of `applicationIdSuffix` in a build type or flavor?

- ❌ It changes the app's display name on the device
- ✅ It appends a suffix to the applicationId so multiple variants can be installed side-by-side
- ❌ It adds a suffix to the APK filename
- ❌ It modifies the package name in source code

> **Explanation:** `applicationIdSuffix` appends to the base `applicationId`, creating a unique ID per variant. This allows you to install both debug (`.debug`) and release versions of the app on the same device simultaneously.

### Coding Challenge: Add a Free and Paid Flavor Dimension

Configure a multi-dimension flavor setup with an `environment` dimension (staging, production) and a `tier` dimension (free, paid), where the paid tier includes a `PREMIUM_FEATURES` build config field.

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
        create("paid") {
            dimension = "tier"
            buildConfigField("Boolean", "PREMIUM_FEATURES", "true")
        }
    }
}
```

With two dimensions (2 environments × 2 tiers × 2 build types), Gradle generates 8 variants: `stagingFreeDebug`, `stagingPaidRelease`, `productionFreeDebug`, etc. You can check `BuildConfig.PREMIUM_FEATURES` at runtime to gate premium features.

---

## Module 4: Build Optimization

### Lesson 4.1: Build Speed Analysis

```bash
# Generate build scan
./gradlew assembleDebug --scan

# Profile build performance
./gradlew assembleDebug --profile

# Show task execution times
./gradlew assembleDebug --info | grep "Task :"
```

### Lesson 4.2: gradle.properties Optimization

```properties
# Parallel execution
org.gradle.parallel=true

# Configuration cache
org.gradle.configuration-cache=true

# Build cache
org.gradle.caching=true

# JVM memory
org.gradle.jvmargs=-Xmx4096m -XX:+UseParallelGC

# Kotlin daemon
kotlin.daemon.jvmargs=-Xmx2048m

# Non-transitive R classes (reduces build time)
android.nonTransitiveRClass=true
```

### Lesson 4.3: Avoiding Configuration Phase Bottlenecks

```kotlin
// ❌ Expensive work during configuration
android {
    defaultConfig {
        // This runs on EVERY Gradle command, even `./gradlew tasks`
        versionCode = "git rev-list --count HEAD".execute().toInt()
    }
}

// ✅ Use providers for lazy evaluation
android {
    defaultConfig {
        versionCode = providers.exec {
            commandLine("git", "rev-list", "--count", "HEAD")
        }.standardOutput.asText.get().trim().toInt()
    }
}
```

**Key takeaway:** Enable parallel execution, build cache, and configuration cache. These three settings alone can cut build times by 30-50%.

### Quiz: Build Optimization

#### Which three `gradle.properties` settings together can reduce build times by 30-50%?

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

### Coding Challenge: Create a Build Timing Task

Write a custom Gradle task that measures and prints the total time taken to configure all projects in the build, helping you identify configuration-phase bottlenecks.

#### Solution

```kotlin
// In root build.gradle.kts
val configStartTime = System.currentTimeMillis()

gradle.projectsEvaluated {
    val elapsed = System.currentTimeMillis() - configStartTime
    println("⏱️ Configuration phase took ${elapsed}ms across ${rootProject.allprojects.size} projects")
}

tasks.register("buildTimingReport") {
    group = "custom"
    description = "Reports build timing information"

    doLast {
        println("📊 Build Timing Report:")
        println("   Projects: ${rootProject.allprojects.size}")
        println("   Tasks in graph: ${gradle.taskGraph.allTasks.size}")
        gradle.taskGraph.allTasks.forEach { task ->
            println("   - ${task.path}")
        }
    }
}
```

The `gradle.projectsEvaluated` callback fires right after the Configuration phase completes, giving you an accurate timing measurement. The `buildTimingReport` task lists all tasks in the execution graph. Run `./gradlew buildTimingReport` to see the report.

---

## Module 5: Custom Tasks and Plugins

### Lesson 5.1: Custom Gradle Tasks

```kotlin
// Define a custom task
tasks.register("printVersionInfo") {
    group = "custom"
    description = "Prints version information"

    doLast {
        val versionName = android.defaultConfig.versionName
        val versionCode = android.defaultConfig.versionCode
        println("Version: $versionName ($versionCode)")
    }
}

// Task with inputs/outputs for caching
abstract class GenerateConfigTask : DefaultTask() {
    @get:Input
    abstract val environment: Property<String>

    @get:OutputFile
    abstract val outputFile: RegularFileProperty

    @TaskAction
    fun generate() {
        val config = when (environment.get()) {
            "staging" -> "API_URL=https://staging.api.com"
            "production" -> "API_URL=https://api.com"
            else -> error("Unknown environment")
        }
        outputFile.get().asFile.writeText(config)
    }
}
```

### Lesson 5.2: Convention Plugins

```kotlin
// build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig.minSdk = 24
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }
        }
    }
}

// Usage in any module
plugins {
    id("yourapp.android.library")  // Custom convention plugin
}
```

**Key takeaway:** Convention plugins extract shared build configuration into reusable plugins. This eliminates duplication across modules and ensures consistency.

### Quiz: Custom Tasks and Plugins

#### What is the difference between `tasks.register` and `tasks.create` in Gradle?

- ❌ `register` is for Kotlin DSL, `create` is for Groovy DSL
- ❌ `create` is lazy and `register` is eager
- ✅ `register` is lazy (configures only when needed), `create` is eager (configures immediately)
- ❌ There is no difference — they are aliases

> **Explanation:** `tasks.register` uses lazy task configuration — the task is only created and configured when it's actually needed. `tasks.create` eagerly creates the task during the Configuration phase, even if it won't run. Always prefer `register` to keep configuration fast.

#### Why should you annotate task properties with `@Input` and `@OutputFile`?

- ❌ It generates documentation for the task automatically
- ❌ It makes the task visible in Android Studio's Gradle panel
- ✅ It enables Gradle's up-to-date checking and build cache support
- ❌ It is required by the Kotlin compiler for abstract properties

> **Explanation:** `@Input` and `@OutputFile` annotations tell Gradle what the task depends on and produces. Gradle uses this to skip tasks whose inputs haven't changed (up-to-date checking) and to cache outputs for reuse across builds.

### Coding Challenge: Build a Convention Plugin

Create a convention plugin that configures any Android library module with Compose support, including the Compose compiler and common Compose dependencies.

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
                }

                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }

            dependencies {
                val bom = platform("androidx.compose:compose-bom:2025.01.01")
                add("implementation", bom)
                add("implementation", "androidx.compose.ui:ui")
                add("implementation", "androidx.compose.material3:material3")
                add("debugImplementation", "androidx.compose.ui:ui-tooling")
            }
        }
    }
}
```

Register it in `build-logic/convention/build.gradle.kts` with `gradlePlugin { plugins { create("composeLibrary") { id = "yourapp.android.library.compose"; implementationClass = "ComposeLibraryConventionPlugin" } } }`. Then any module just applies `plugins { id("yourapp.android.library.compose") }` to get full Compose support.

---

## Module 6: Dependency Management

### Lesson 6.1: Dependency Configurations

```kotlin
dependencies {
    // implementation — available to this module only
    implementation(libs.retrofit)

    // api — exposed to consumers of this module
    api(libs.okhttp)

    // compileOnly — available at compile time, not in APK
    compileOnly(libs.annotation.processor)

    // ksp — Kotlin Symbol Processing (replaces kapt)
    ksp(libs.room.compiler)

    // testImplementation — test classpath only
    testImplementation(libs.junit)
    testImplementation(libs.turbine)

    // androidTestImplementation — instrumented test classpath
    androidTestImplementation(libs.compose.test)

    // debugImplementation — debug builds only
    debugImplementation(libs.leakcanary)
}
```

**`implementation` vs `api`** — Use `implementation` by default. Only use `api` when the dependency's types appear in your module's public API. Using `api` everywhere leaks transitive dependencies and slows builds.

**Key takeaway:** Prefer `implementation` over `api`. Use `ksp` over `kapt` (faster, Kotlin-native). Use `debugImplementation` for dev tools like LeakCanary.

### Quiz: Dependency Management

#### When should you use `api` instead of `implementation` for a dependency?

- ❌ When the dependency is used frequently across the module
- ❌ When you want faster compilation times
- ✅ When the dependency's types appear in your module's public API
- ❌ When the dependency is a Google library

> **Explanation:** Use `api` only when your module exposes types from the dependency in its public interfaces or classes. If consumers of your module need to access those types directly, use `api`. Otherwise, `implementation` keeps the dependency internal and speeds up builds.

#### Why is `ksp` preferred over `kapt` for annotation processing?

- ❌ `ksp` supports more annotation processors than `kapt`
- ✅ `ksp` is Kotlin-native and faster because it doesn't generate Java stubs
- ❌ `kapt` is deprecated and removed in Kotlin 2.0
- ❌ `ksp` produces smaller APK files

> **Explanation:** `kapt` works by generating Java stubs from Kotlin code, then running Java annotation processors on those stubs. `ksp` operates directly on Kotlin symbols, skipping the stub generation step entirely, which makes it significantly faster.

#### What does `debugImplementation` do?

- ❌ It logs dependency resolution details during the build
- ❌ It adds the dependency only when running unit tests
- ❌ It includes the dependency in all build variants
- ✅ It adds the dependency only to debug build variants

> **Explanation:** `debugImplementation` includes the dependency only in debug builds. This is perfect for dev tools like LeakCanary that you want during development but must never ship to production.

### Coding Challenge: Configure a Multi-Module Dependency Graph

Set up dependencies for a `:feature:home` module that depends on `:core:network` (using `implementation`) and `:core:model` (using `api` because it exposes model types in its public API), with proper test dependencies.

#### Solution

```kotlin
// feature/home/build.gradle.kts
plugins {
    id("yourapp.android.library")
    id("yourapp.android.library.compose")
}

android {
    namespace = "com.yourapp.feature.home"
}

dependencies {
    // core:model uses api — its data classes appear in HomeUiState
    api(project(":core:model"))

    // core:network uses implementation — internal detail, not exposed
    implementation(project(":core:network"))

    // Compose
    implementation(libs.bundles.compose)
    implementation(libs.lifecycle.viewmodel.compose)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)

    // Debug tools
    debugImplementation(libs.compose.ui.tooling)
}
```

`:core:model` uses `api` because `HomeUiState` references model data classes that consumers of this module need to access. `:core:network` uses `implementation` because the networking logic is an internal detail — no network types leak into the module's public API.

---

## Module 7: CI/CD and Build Automation

### Lesson 7.1: GitHub Actions for Android

```yaml
name: Build & Test
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
      - run: ./gradlew build
      - run: ./gradlew testDebugUnitTest
```

### Lesson 7.2: Build Caching in CI

```yaml
- uses: gradle/actions/setup-gradle@v4
  with:
    cache-read-only: ${{ github.ref != 'refs/heads/main' }}
    gradle-home-cache-cleanup: true
```

**Key takeaway:** Cache Gradle dependencies and build outputs in CI. This turns a 10-minute build into a 3-minute build on subsequent runs.

### Quiz: CI/CD and Build Automation

#### Why should you set `cache-read-only` to `true` for non-main branches in CI?

- ❌ It prevents the CI from downloading dependencies
- ❌ It speeds up the build by skipping all caching
- ✅ It prevents PR branches from polluting the shared cache with branch-specific entries
- ❌ It is required by GitHub Actions for security reasons

> **Explanation:** Setting `cache-read-only: true` for non-main branches means PRs can read from the cache (benefiting from main branch builds) but won't write to it. This keeps the cache clean and prevents branch-specific artifacts from evicting useful entries.

#### What does the `gradle/actions/setup-gradle@v4` action do?

- ❌ It installs Gradle globally on the CI runner
- ❌ It only configures the JDK for Gradle to use
- ✅ It sets up Gradle with caching, wrapper validation, and build scan support
- ❌ It replaces the need for a `gradle-wrapper.properties` file

> **Explanation:** The `gradle/actions/setup-gradle` action configures the Gradle environment with intelligent caching of dependencies and build outputs, wrapper validation for security, and optional build scan integration. It works with the project's Gradle Wrapper — it doesn't install Gradle separately.

### Coding Challenge: Add a Lint and APK Upload Step to CI

Extend the GitHub Actions workflow to run Android Lint on PRs and upload the debug APK as a build artifact.

#### Solution

```yaml
name: Build, Test & Lint
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
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

      - name: Build
        run: ./gradlew assembleDebug

      - name: Run tests
        run: ./gradlew testDebugUnitTest

      - name: Run lint
        run: ./gradlew lintDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: debug-apk
          path: app/build/outputs/apk/debug/app-debug.apk

      - name: Upload lint report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lint-report
          path: app/build/reports/lint-results-debug.html
```

The lint report uses `if: always()` so it uploads even if the lint step fails — this ensures you can always review lint results. The APK artifact is available for download from the Actions tab, useful for QA testing PR builds.

---

Thank You for completing the Gradle & Build Systems course! Gradle is the tool you use every day but rarely master. Understanding it deeply saves hours of frustration. ⚙️
