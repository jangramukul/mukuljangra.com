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

---

Thank You for completing the Gradle & Build Systems course! Gradle is the tool you use every day but rarely master. Understanding it deeply saves hours of frustration. ⚙️
