---
title: "Gradle, Build System & CI/CD"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 10
---

## Gradle, Build System & CI/CD — What Interviewers Really Ask

Build system questions show up more often in senior Android interviews than people expect. Companies with large codebases care deeply about build performance, dependency management, and CI/CD pipelines because a slow build wastes engineering hours at scale. Interviewers use this topic to gauge whether you just press the green "Run" button in Android Studio or whether you actually understand what happens when you build an Android app.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the three phases of a Gradle build, and what happens in each?

Every Gradle build goes through three sequential phases. The **initialization** phase reads `settings.gradle.kts` to determine which projects (modules) are included in the build. In a multi-module project, this is where Gradle discovers all your feature modules, library modules, and the app module. The **configuration** phase evaluates every `build.gradle.kts` file in every included project. This is where plugins are applied, dependencies are declared, tasks are created and configured, and the task dependency graph is built. No actual compilation happens here — Gradle is just planning. The **execution** phase runs the requested tasks in dependency order. This is where source code compiles, resources merge, DEX files generate, and the APK/AAB is assembled.

Understanding these phases matters for build performance. Code that runs in the configuration phase (anything at the top level of `build.gradle.kts`) executes on every build invocation, even `gradle help`. Expensive operations like reading files, making network calls, or iterating over large collections should be deferred to the execution phase by placing them inside task actions.

#### Q2: What is the difference between `build.gradle.kts` at the project level vs the module level?

The project-level (root) `build.gradle.kts` configures settings that apply to all modules — plugin versions, repository declarations, and project-wide build logic. With the modern plugins DSL, you declare plugins with `apply false` at the root, meaning "make this plugin available but don't apply it here."

```kotlin
// Root build.gradle.kts
plugins {
    id("com.android.application") version "8.7.0" apply false
    id("com.android.library") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("com.google.dagger.hilt.android") version "2.51.1" apply false
}
```

Module-level `build.gradle.kts` files configure each module individually — compile SDK, min SDK, dependencies, build types, product flavors, and applied plugins. Each module applies the plugins it needs and declares its own dependencies.

The `settings.gradle.kts` file sits above both — it configures the build itself. It declares which modules are included (`include(":app", ":core:network", ":feature:login")`), configures repository resolution through `dependencyResolutionManagement`, and can also configure `pluginManagement` for plugin repositories.

#### Q3: What are build types and product flavors, and how do they combine?

Build types define how the app is built — `debug` and `release` are the defaults. Debug builds have debugging enabled, ProGuard/R8 disabled, and a debug signing key. Release builds enable minification, use a release signing key, and optimize the output. You can create custom build types like `staging` or `benchmark`.

Product flavors define different versions of your app — for example, a `free` and `paid` flavor, or `dev`, `staging`, and `prod` flavors that point to different API endpoints. Flavors are organized into dimensions.

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

The Gradle daemon is a long-running background process that stays alive between builds. Without the daemon, every `./gradlew` invocation would start a new JVM, load all the Gradle classes and plugins, and discard everything when the build finishes. With the daemon, the JVM stays running, the Gradle class loader and plugin caches remain warm, and the JIT-compiled code from previous builds is reused. This typically makes builds 15-75% faster for subsequent invocations.

The daemon is enabled by default. It survives for 3 hours of idleness and shuts down automatically. You can check running daemons with `./gradlew --status` and stop them with `./gradlew --stop`. In CI environments, some teams disable the daemon because each build runs in a fresh container anyway, and the daemon adds memory overhead. But on developer machines, keeping it enabled is almost always the right choice.

#### Q5: What is the difference between `implementation`, `api`, and `compileOnly` dependency configurations?

These control the dependency's visibility and transitivity. `implementation` means the dependency is available at compile time and runtime for this module, but NOT exposed to modules that depend on this one. `api` means the dependency is available at compile time and runtime AND is exposed transitively to dependents. `compileOnly` means the dependency is only available at compile time — it's not included in the final APK.

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

The build performance implication is significant. When you change a module with `api` dependencies, all modules that depend on it need to recompile (because their classpath changed). With `implementation`, only the changed module recompiles. In a large multi-module project, preferring `implementation` over `api` can dramatically reduce incremental build times. The rule of thumb: use `implementation` by default, only use `api` when you genuinely need to expose a dependency's types in your module's public API.

#### Q6: What are version catalogs (TOML) and why were they introduced?

Version catalogs are Gradle's solution for centralizing dependency versions across a multi-module project. Before version catalogs, teams used `ext` blocks, `buildSrc` constants, or convention plugins to share versions. Version catalogs use a `libs.versions.toml` file in the `gradle/` directory that defines versions, libraries, bundles, and plugins in a structured format.

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

In `build.gradle.kts`, you reference them as `libs.retrofit`, `libs.bundles.compose`, `libs.plugins.android.application`. The main benefits: a single source of truth for versions, IDE support with auto-completion, and Gradle generates type-safe accessors. This replaced the scattered version definitions that used to cause dependency conflicts in large projects.

#### Q7: What is the difference between KSP and KAPT?

Both are annotation processing tools, but they work fundamentally differently. KAPT (Kotlin Annotation Processing Tool) works by generating Java stubs from Kotlin source files, then running standard Java annotation processors (APT) on those stubs. This means every Kotlin file has to be analyzed twice — once to generate stubs and once for actual compilation. It's slow.

KSP (Kotlin Symbol Processing) reads the Kotlin compiler's internal representation (PSI/IR) directly, skipping the Java stub generation entirely. It understands Kotlin-specific features like data classes, sealed classes, extension functions, and nullability natively. KSP is typically 2x faster than KAPT for annotation processing.

```kotlin
dependencies {
    // KAPT — old approach (slower)
    kapt("androidx.room:room-compiler:2.6.1")

    // KSP — modern approach (faster)
    ksp("androidx.room:room-compiler:2.6.1")
}
```

Most major libraries now support KSP: Room, Moshi, Hilt (since Dagger 2.48), and many others. If a library only supports KAPT, you can still use it — but migrating to KSP whenever possible gives you a noticeable build time improvement, especially in projects with many annotation-processed classes.

### Deep Dive Questions (Advanced → Expert)

#### Q8: What are convention plugins and why are they better than `buildSrc` for shared build logic?

Convention plugins are pre-configured Gradle plugins that encapsulate common build configuration. In a multi-module project, you might have 20 feature modules that all need the same Android configuration — compile SDK, min SDK, Compose setup, testing dependencies. Instead of duplicating this in every module's `build.gradle.kts`, you create a convention plugin that applies it.

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

Then in any feature module: `plugins { id("app.android.feature") }` — one line replaces 30+ lines of configuration. The key advantage over `buildSrc` is that convention plugins in a separate `build-logic` included build don't cause full project reconfiguration when you change them. With `buildSrc`, any change triggers recompilation of every module's build script. Convention plugins are the approach Google uses in the Now in Android reference app, and it's the pattern recommended by the Android team.

#### Q9: How does the Android build process work from source code to APK?

The process has several stages. First, the Kotlin compiler compiles `.kt` files to `.class` files. Annotation processors (KAPT/KSP) run during compilation to generate additional source and class files. Then D8 (the dexer) converts all `.class` files (including dependencies) into `.dex` files — this is the Dalvik Executable format that ART understands. If minification is enabled, R8 runs instead of D8 — R8 combines dexing with shrinking, optimization, and obfuscation in a single step.

In parallel, AAPT2 (Android Asset Packaging Tool 2) compiles resources — XML layouts, drawables, strings — into a flat binary format and generates `R.java` (resource IDs). The Android manifest is merged from all modules and libraries. Finally, the APK builder packages everything — DEX files, compiled resources, native libraries, assets — into a ZIP file, aligns it with `zipalign`, and signs it with either debug or release keys. For Android App Bundles (AAB), the process is similar but outputs a bundle format that Google Play processes to generate optimized APKs for each device configuration.

#### Q10: What is the difference between APK and Android App Bundle (AAB)?

An APK is a complete, installable package containing all code and resources for every device configuration. An AAB is a publishing format that defers APK generation to Google Play. When you upload an AAB, Google Play generates configuration-specific APKs (called split APKs) for each device — one for the device's screen density, one for its CPU architecture, one for its language. Users download only the code and resources they need.

The size savings are significant. An app that includes resources for all densities, all ABIs (arm64-v8a, armeabi-v7a, x86, x86_64), and all languages in a universal APK might be 80MB. The same app as split APKs might be 40MB per device because each device only gets its own density, ABI, and language resources. Google Play requires AAB format for new apps since 2021.

The tradeoff: you need Google Play to serve AABs. For side-loading, internal distribution (Firebase App Distribution), or alternative app stores, you still need APKs. You can generate universal APKs from an AAB using Google's `bundletool` for these cases.

#### Q11: How does signing work in Android, and what's the difference between debug and release signing?

Every APK must be signed before it can be installed. The signature verifies that the APK hasn't been tampered with and identifies the developer. Android uses a certificate-based signing scheme — you sign with a private key, and the device verifies with the corresponding public key embedded in the APK.

Debug signing uses a keystore automatically generated by Android Studio at `~/.android/debug.keystore`. All debug builds use this, which is why you can install debug builds without any signing configuration. Release signing uses your own keystore with a private key that you generate and protect. This key is your identity on the Play Store — all updates to your app must be signed with the same key, or the Play Store rejects them.

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

Android supports multiple signing schemes. v1 (JAR-based) signs individual files within the APK. v2 (introduced in Android 7.0) signs the entire APK as a binary blob — faster verification and detects any modification. v3 (Android 9.0) adds key rotation support. v4 (Android 11) supports incremental installation via ADB. Modern builds should use v2+ at minimum. Google Play also offers Play App Signing, where Google manages your upload key and signs the final APK with a key they hold — this protects against losing your signing key.

#### Q12: What is R8's full-mode and how does it differ from compatibility mode?

R8 runs in "compatibility mode" by default, which behaves like ProGuard — it respects the same keep rules and has the same behavior for edge cases. R8's "full mode" (enabled with `android.enableR8.fullMode=true` in `gradle.properties`) is more aggressive. It doesn't keep `@Keep`-annotated classes by default, it has stricter default rules for class merging and inlining, and it can optimize code patterns that compatibility mode leaves alone.

Full mode typically produces a smaller and faster APK but has a higher risk of breaking things — especially with reflection, serialization, and libraries that depend on specific class structures being preserved. It requires more careful testing and sometimes additional keep rules. Google's recommendation is to use full mode for new projects and migrate existing projects gradually, testing thoroughly.

#### Q13: How would you set up a CI/CD pipeline for an Android project?

A typical CI/CD pipeline for an Android app has these stages. **Build and lint**: compile the project, run Android Lint, and run Detekt or ktlint for code style. **Unit tests**: run all JUnit tests across modules. **Instrumented tests**: run Espresso or Compose UI tests on an emulator (using Firebase Test Lab or a local emulator in CI). **Code coverage**: generate JaCoCo reports and enforce minimum thresholds. **Build artifacts**: generate the signed release AAB/APK. **Deploy**: upload to Google Play (internal track) using the Google Play Developer API or Fastlane.

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

Key considerations: cache the Gradle dependency directory (`~/.gradle/caches`) to speed up builds. Use the Gradle build cache for incremental CI builds. Store signing keys and passwords as CI secrets, never in the repository. Run tests in parallel where possible. For instrumented tests, consider running them only on the main branch or PR merges (they're slow and expensive).

#### Q14: How does Gradle's build cache work, and what's the difference between local and remote cache?

Gradle's build cache stores task outputs keyed by their inputs. If a task runs with the same inputs as a previous execution (same source files, dependencies, and configuration), Gradle reuses the cached output instead of running the task again. This is different from the up-to-date check — up-to-date only works within the same project on the same machine, while the build cache works across builds and machines.

The local cache stores outputs on disk (typically in `~/.gradle/caches/build-cache-1/`). The remote cache is a shared server (you can use Gradle Enterprise or a custom HTTP server) that all developers and CI machines share. When one developer compiles a module, the output goes to the remote cache. When another developer (or CI) needs to build the same module with the same inputs, it downloads the cached output instead of compiling.

In practice, remote caching gives the biggest wins in multi-module projects. If a CI build compiled the entire project, developer machines can pull cached outputs for modules they haven't changed. This can reduce incremental build times from minutes to seconds for large projects.

#### Q15: What are the main strategies for reducing build time in a large Android project?

Build time optimization is a layered problem. At the module level: use `implementation` instead of `api` to reduce recompilation cascading. Migrate from KAPT to KSP. Enable the Gradle build cache. Use convention plugins to keep configuration fast and DRY.

At the project level: modularize your codebase so incremental builds only recompile changed modules. Use configuration caching (`org.gradle.configuration-cache=true`) to skip the configuration phase when build scripts haven't changed. Use parallel execution (`org.gradle.parallel=true`). Increase Gradle's JVM heap if you're running out (`org.gradle.jvmargs=-Xmx4g`). Use the `--build-cache` flag (enabled by default since Gradle 7).

At the dependency level: avoid dynamic versions (`1.+`) — they force Gradle to check for new versions on every build. Use version catalogs for consistent dependency resolution. Remove unused dependencies (they still participate in resolution). Consider using dependency locking to prevent unexpected version changes.

At the CI level: use remote build cache. Cache the Gradle wrapper and dependency directories. Use incremental builds instead of clean builds when possible. Run tests in parallel across multiple CI nodes.

### Common Follow-ups

- What is `settings.gradle.kts` and what role does it play in the build?
- How does `dependencyResolutionManagement` work?
- What is the difference between `includeBuild` and `include` in settings?
- How do you handle different signing configs for different environments?
- What is the `Configuration Cache` and how does it differ from the `Build Cache`?
- How does `buildConfigField` work and when would you use it?
- What is `gradlew` and why should you use the wrapper?
- How do dynamic feature modules work with app bundles?

### Tips for the Interview

1. **Know the three phases** — Initialization, configuration, execution. This is the foundational mental model for understanding Gradle. When someone asks "why is my build slow?", the first step is identifying which phase is slow.

2. **Talk about real build performance wins** — "We migrated from KAPT to KSP and cut annotation processing time by 50%." "We switched from `api` to `implementation` in our shared modules and reduced incremental build time by 40%." Concrete numbers make your answers memorable.

3. **Convention plugins are the senior answer** — When asked how you manage build configuration across modules, convention plugins is the answer that signals senior-level build system knowledge. Know the pattern from Now in Android.

4. **Understand signing deeply** — Lost signing keys are catastrophic. Know about Play App Signing, key rotation with v3 scheme, and why you should never commit keystores to version control.

5. **CI/CD shows full-stack thinking** — Being able to discuss the entire pipeline from commit to Play Store deployment shows you think beyond just writing code. Know the basic GitHub Actions / CI setup even if you're not a DevOps specialist.
