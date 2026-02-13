---
title: "Gradle, Build System & CI/CD"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 10
---

## Gradle, Build System & CI/CD

Build system questions cover Gradle internals, dependency management, and CI/CD pipelines for Android projects.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the three phases of a Gradle build, and what happens in each?

Every Gradle build goes through three phases:

- **Initialization** — reads `settings.gradle.kts` to find which modules are included in the build.
- **Configuration** — evaluates every `build.gradle.kts` file. Plugins are applied, dependencies declared, tasks created, and the task graph is built. No compilation happens here.
- **Execution** — runs the tasks in dependency order. Source code compiles, resources merge, DEX files generate, and the APK/AAB is assembled.

Anything at the top level of `build.gradle.kts` runs during configuration on every build invocation, even `gradle help`. Expensive operations like file reads or network calls should be deferred to the execution phase by placing them inside task actions.

#### Q2: What is the difference between `build.gradle.kts` at the project level vs the module level?

The root `build.gradle.kts` configures settings that apply to all modules. With the modern plugins DSL, you declare plugins with `apply false` at the root to make them available without applying them.

```kotlin
// Root build.gradle.kts
plugins {
    id("com.android.application") version "8.7.0" apply false
    id("com.android.library") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("com.google.dagger.hilt.android") version "2.51.1" apply false
}
```

Module-level `build.gradle.kts` files configure each module individually — compile SDK, min SDK, dependencies, build types, product flavors, and applied plugins.

The `settings.gradle.kts` file sits above both. It declares which modules are included (`include(":app", ":core:network", ":feature:login")`), configures repository resolution through `dependencyResolutionManagement`, and sets up `pluginManagement` for plugin repositories.

#### Q3: What are build types and product flavors, and how do they combine?

Build types define how the app is built. `debug` and `release` are the defaults. Debug builds have debugging enabled and R8 disabled. Release builds enable minification and use a release signing key. You can also create custom build types like `staging`.

Product flavors define different versions of your app — for example, `dev` and `prod` flavors pointing to different API endpoints. Flavors are organized into dimensions.

```kotlin
android {
    buildTypes {
        debug {
            isDebuggable = true
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            buildConfigField("String", "API_URL", "\"https://dev.api.example.com\"")
            applicationIdSuffix = ".dev"
        }
        create("prod") {
            dimension = "environment"
            buildConfigField("String", "API_URL", "\"https://api.example.com\"")
        }
    }
}
```

Build types and product flavors combine to create build variants. With 2 flavors and 2 build types, you get 4 variants: `devDebug`, `devRelease`, `prodDebug`, `prodRelease`. Each variant can have its own source set, resources, and manifest entries.

#### Q4: What is the Gradle daemon and how does it speed up builds?

The Gradle daemon keeps an instance of Gradle running in the background even after a build finishes. It avoids starting a new JVM on every build invocation, keeping class loaders warm and reusing JIT-compiled code from previous builds. This makes subsequent builds 15-75% faster.

The daemon is enabled by default and shuts down after 3 hours of idleness. You can check running daemons with `./gradlew --status` and stop them with `./gradlew --stop`. Some CI setups disable it because each build runs in a fresh container, but on developer machines it should stay enabled.

#### Q5: What is the difference between `implementation`, `api`, and `compileOnly` dependency configurations?

- `implementation` — dependency is available at compile time and runtime for this module, but not exposed to modules that depend on it.
- `api` — dependency is available at compile time and runtime, and exposed transitively to dependent modules.
- `compileOnly` — dependency is only available at compile time and not included in the final APK.

```kotlin
dependencies {
    // Only this module can see OkHttp at compile time
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Any module that depends on this one can also use Retrofit
    api("com.squareup.retrofit2:retrofit:2.11.0")

    // Available at compile time only — the runtime provides it
    compileOnly("javax.annotation:javax.annotation-api:1.3.2")
}
```

When you change a module with `api` dependencies, all dependent modules need to recompile. With `implementation`, only the changed module recompiles. Use `implementation` by default and only use `api` when you need to expose a dependency's types in your module's public API.

#### Q6: What are version catalogs (TOML) and why were they introduced?

Version catalogs centralize dependency versions across a multi-module project. They use a `libs.versions.toml` file in the `gradle/` directory that defines versions, libraries, bundles, and plugins in a structured format.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.1.0"
compose-bom = "2024.12.01"
retrofit = "2.11.0"
room = "2.6.1"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
retrofit = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }

[bundles]
compose = ["compose-ui", "compose-material3"]

[plugins]
android-application = { id = "com.android.application", version = "8.7.0" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
```

In `build.gradle.kts`, you reference them as `libs.retrofit`, `libs.bundles.compose`, `libs.plugins.android.application`. The main benefits are a single source of truth for versions, IDE auto-completion, and type-safe accessors generated by Gradle.

#### Q7: What is the difference between KSP and KAPT?

KAPT (Kotlin Annotation Processing Tool) generates Java stubs from Kotlin source files, then runs Java annotation processors on those stubs. Every Kotlin file gets analyzed twice — once for stubs and once for compilation. It is slow.

KSP (Kotlin Symbol Processing) reads the Kotlin compiler's internal representation directly and skips stub generation. It understands Kotlin features like data classes, sealed classes, and nullability natively. KSP is typically 2x faster than KAPT.

```kotlin
dependencies {
    // KAPT — old approach (slower)
    kapt("androidx.room:room-compiler:2.6.1")

    // KSP — modern approach (faster)
    ksp("androidx.room:room-compiler:2.6.1")
}
```

Most major libraries now support KSP — Room, Moshi, Hilt (since Dagger 2.48), and others. Migrating to KSP gives a noticeable build time improvement, especially in projects with many annotation-processed classes.

### Deep Dive Questions (Advanced → Expert)

#### Q8: What are convention plugins and why are they better than `buildSrc` for shared build logic?

Convention plugins encapsulate common build configuration into reusable plugins. Instead of duplicating the same Android config in 20 feature modules, you create one convention plugin that applies it all.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply {
                apply("com.android.library")
                apply("org.jetbrains.kotlin.android")
                apply("com.google.devtools.ksp")
            }
            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig.minSdk = 26
                buildFeatures.compose = true
            }
            dependencies {
                add("implementation", libs.findLibrary("compose-bom").get())
                add("implementation", libs.findLibrary("compose-ui").get())
                add("ksp", libs.findLibrary("hilt-compiler").get())
            }
        }
    }
}
```

Then in any feature module: `plugins { id("app.android.feature") }` — one line replaces 30+ lines of configuration. The key advantage over `buildSrc` is that convention plugins in a separate `build-logic` included build don't cause full project reconfiguration when you change them. With `buildSrc`, any change triggers recompilation of every module's build script.

#### Q9: How does the Android build process work from source code to APK?

The build goes through several stages:

- Kotlin compiler compiles `.kt` files into `.class` files. Annotation processors (KAPT/KSP) run during this step to generate additional source and class files.
- D8 (the dexer) converts all `.class` files into `.dex` files. If minification is enabled, R8 runs instead — it combines dexing with shrinking, optimization, and obfuscation in one step.
- AAPT2 compiles resources (XML layouts, drawables, strings) into binary format and generates `R.java` for resource IDs.
- The Android manifest is merged from all modules and libraries.
- The APK builder packages DEX files, compiled resources, native libraries, and assets into a ZIP, aligns it with `zipalign`, and signs it.

For Android App Bundles (AAB), the output is a bundle format that Google Play processes to generate optimized APKs per device.

#### Q10: What is the difference between APK and Android App Bundle (AAB)?

An APK is a complete installable package containing all code and resources for every device configuration. An AAB is a publishing format where Google Play generates device-specific split APKs — one for screen density, one for CPU architecture, one for language. Users download only what they need.

A universal APK with all densities, ABIs, and languages might be 80MB. The same app as split APKs might be 40MB per device. Google Play requires AAB format for new apps since 2021.

The tradeoff is that AABs require Google Play to serve them. For side-loading, Firebase App Distribution, or alternative stores, you still need APKs. You can generate universal APKs from an AAB using `bundletool`.

#### Q11: How does signing work in Android, and what's the difference between debug and release signing?

Every APK must be signed before installation. The signature verifies that the APK hasn't been tampered with and identifies the developer.

Debug signing uses a keystore auto-generated by Android Studio at `~/.android/debug.keystore`. Release signing uses your own keystore with a private key that you generate and protect. All updates to your app on the Play Store must be signed with the same key.

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("release-keystore.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = "release"
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

Android supports multiple signing schemes:
- v1 (JAR-based) — signs individual files within the APK.
- v2 (Android 7.0) — signs the entire APK as a binary blob for faster verification.
- v3 (Android 9.0) — adds key rotation support.
- v4 (Android 11) — supports incremental installation via ADB.

Modern builds should use v2+ at minimum. Play App Signing lets Google manage your signing key, which protects against losing it.

#### Q12: What is R8's full-mode and how does it differ from compatibility mode?

R8 compatibility mode (the default) behaves like ProGuard and respects the same keep rules. Full mode (enabled with `android.enableR8.fullMode=true` in `gradle.properties`) is more aggressive — it has stricter default rules for class merging and inlining, and can optimize patterns that compatibility mode leaves alone.

Full mode produces a smaller and faster APK but has a higher risk of breaking things, especially with reflection, serialization, and libraries that depend on specific class structures. It requires more careful testing and sometimes additional keep rules.

#### Q13: How would you set up a CI/CD pipeline for an Android project?

A typical pipeline has these stages:
- **Build and lint** — compile the project, run Android Lint, run Detekt or ktlint.
- **Unit tests** — run JUnit tests across modules.
- **Instrumented tests** — run Espresso or Compose UI tests on an emulator or Firebase Test Lab.
- **Code coverage** — generate JaCoCo reports and enforce minimum thresholds.
- **Build artifacts** — generate the signed release AAB/APK.
- **Deploy** — upload to Google Play internal track using the Play Developer API or Fastlane.

```yaml
# .github/workflows/android.yml (GitHub Actions)
name: Android CI
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
          distribution: 'zulu'
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4

      - name: Run lint
        run: ./gradlew lintDebug

      - name: Run unit tests
        run: ./gradlew testDebugUnitTest

      - name: Build release AAB
        run: ./gradlew bundleRelease
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
```

Cache the Gradle dependency directory (`~/.gradle/caches`) and use the Gradle build cache for faster CI builds. Store signing keys and passwords as CI secrets, never in the repository.

#### Q14: How does Gradle's build cache work, and what's the difference between local and remote cache?

Gradle's build cache stores task outputs keyed by their inputs. If a task runs with the same inputs as before (same source files, dependencies, configuration), Gradle reuses the cached output instead of running the task again.

The local cache stores outputs on disk at `~/.gradle/caches/build-cache-1/`. The remote cache is a shared server that all developers and CI machines use. When one developer compiles a module, the output goes to the remote cache. When another developer builds the same module with the same inputs, it downloads the cached output instead of compiling.

Remote caching gives the biggest wins in multi-module projects. If CI compiled the entire project, developer machines can pull cached outputs for modules they haven't changed, reducing build times from minutes to seconds.

#### Q15: What are the main strategies for reducing build time in a large Android project?

At the module level:
- Use `implementation` instead of `api` to reduce recompilation cascading.
- Migrate from KAPT to KSP.
- Enable the Gradle build cache.

At the project level:
- Modularize the codebase so incremental builds only recompile changed modules.
- Use configuration caching (`org.gradle.configuration-cache=true`) to skip configuration when build scripts haven't changed.
- Use parallel execution (`org.gradle.parallel=true`).
- Increase the JVM heap (`org.gradle.jvmargs=-Xmx4g`).

At the dependency level:
- Avoid dynamic versions (`1.+`) — they force Gradle to check for updates on every build.
- Remove unused dependencies since they still participate in resolution.
- Use dependency locking to prevent unexpected version changes.

At the CI level:
- Use remote build cache.
- Cache the Gradle wrapper and dependency directories.
- Run tests in parallel across multiple CI nodes.

#### Q16: What is Multidex and why was it needed?

An application source code compiles into DEX files. A single DEX file has a limit of 65,536 methods (64K method limit) because the DEX format uses a 16-bit index for method references. When your app plus libraries exceed this limit, the build fails. Multidex splits the app into multiple DEX files — `classes.dex`, `classes2.dex`, `classes3.dex`, etc.

Before Android 5.0 (API 21), you had to explicitly enable multidex and include the support library because Dalvik only loaded one DEX file. ART (Android 5.0+) natively supports multiple DEX files, so apps with `minSdk 21+` get multidex automatically.

```kotlin
android {
    defaultConfig {
        // Only needed for minSdk < 21
        multiDexEnabled = true
    }
}

// In Application class (minSdk < 21 only)
class App : MultiDexApplication() {
    // MultiDexApplication handles installing secondary DEX files
}
```

R8/ProGuard shrinking reduces the method count by removing unused code, which can keep you under the limit or reduce the number of DEX files, slightly improving cold start time.

#### Q17: What is `buildConfigField` and how does it differ from `resValue`?

`buildConfigField` generates a constant in the auto-generated `BuildConfig` class, available at compile time in Kotlin/Java code. `resValue` generates a resource value available through the resource system (`R.string`, `R.integer`, etc.).

```kotlin
android {
    buildTypes {
        debug {
            buildConfigField("String", "API_URL", "\"https://dev.api.example.com\"")
            buildConfigField("Boolean", "ENABLE_LOGGING", "true")
            resValue("string", "app_label", "MyApp Debug")
        }
        release {
            buildConfigField("String", "API_URL", "\"https://api.example.com\"")
            buildConfigField("Boolean", "ENABLE_LOGGING", "false")
            resValue("string", "app_label", "MyApp")
        }
    }
}

// Access in code
val baseUrl = BuildConfig.API_URL
if (BuildConfig.ENABLE_LOGGING) { /* ... */ }
```

Use `buildConfigField` for values consumed by code — API URLs, feature flags, constants. Use `resValue` for values consumed by the resource system — app names, dynamic strings. `BuildConfig` fields are compile-time constants that R8 can inline, while resource values go through the standard resource resolution system.

### Common Follow-ups

- What is `settings.gradle.kts` and what role does it play in the build?
- How does `dependencyResolutionManagement` work?
- What is the difference between `includeBuild` and `include` in settings?
- How do you handle different signing configs for different environments?
- What is the `Configuration Cache` and how does it differ from the `Build Cache`?
- How does `buildConfigField` work and when would you use it?
- What is `gradlew` and why should you use the wrapper?
- How do dynamic feature modules work with app bundles?
