---
title: "Gradle, Build System & CI/CD"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 26
sequence: 26
description: "Build system questions cover Gradle internals, dependency management, and CI/CD pipelines for Android projects."
---

## Gradle, Build System & CI/CD

Build system questions cover Gradle internals, dependency management, and CI/CD pipelines for Android projects.

#### What is the difference between `implementation`, `api`, and `compileOnly` dependency configurations?

- `implementation` — available at compile time and runtime for this module only. Not exposed to modules that depend on it.
- `api` — available at compile time and runtime, and exposed transitively to dependent modules.
- `compileOnly` — available at compile time only. Not included in the final APK.

```kotlin
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    api("com.squareup.retrofit2:retrofit:2.11.0")
    compileOnly("javax.annotation:javax.annotation-api:1.3.2")
}
```

Use `implementation` by default. Only use `api` when you need to expose a dependency's types in your module's public API. Changing an `api` dependency triggers recompilation of all dependent modules, while `implementation` only recompiles the changed module.

#### What are the three phases of a Gradle build?

Every Gradle build goes through three phases:

- **Initialization** — reads `settings.gradle.kts` to find which modules are in the build.
- **Configuration** — evaluates every `build.gradle.kts` file. Plugins are applied, dependencies declared, tasks created, and the task graph is built. No compilation happens here.
- **Execution** — runs tasks in dependency order. Source code compiles, resources merge, DEX files generate, and the APK/AAB is assembled.

Anything at the top level of `build.gradle.kts` runs during configuration on every build invocation, even `gradle help`. Expensive operations should be deferred to the execution phase by placing them inside task actions.

#### What are build types and product flavors, and how do they combine?

Build types define how the app is built. `debug` and `release` are the defaults. Debug builds have debugging enabled and R8 disabled. Release builds enable minification and use a release signing key.

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

Build types and product flavors combine into build variants. With 2 flavors and 2 build types, you get 4 variants: `devDebug`, `devRelease`, `prodDebug`, `prodRelease`. Each variant can have its own source set, resources, and manifest entries.

#### What is the difference between `build.gradle.kts` at the project level vs the module level?

The root `build.gradle.kts` configures settings that apply to all modules. You declare plugins with `apply false` at the root to make them available without applying them.

```kotlin
// Root build.gradle.kts
plugins {
    id("com.android.application") version "8.7.0" apply false
    id("com.android.library") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
}
```

Module-level `build.gradle.kts` files configure each module individually — compile SDK, min SDK, dependencies, build types, product flavors, and applied plugins.

The `settings.gradle.kts` file sits above both. It declares which modules are included (`include(":app", ":core:network")`), configures repository resolution through `dependencyResolutionManagement`, and sets up `pluginManagement` for plugin repositories.

#### How does the Android build process work from source code to APK?

The build goes through several stages:

- Kotlin compiler compiles `.kt` files into `.class` files. Annotation processors (KAPT/KSP) run during this step.
- D8 converts `.class` files into `.dex` files. If minification is enabled, R8 runs instead — it combines dexing with shrinking, optimization, and obfuscation in one step.
- AAPT2 compiles resources (XML layouts, drawables, strings) into binary format and generates `R.java` for resource IDs.
- The manifest is merged from all modules and libraries.
- The APK builder packages DEX files, compiled resources, native libraries, and assets into a ZIP, aligns it with `zipalign`, and signs it.

For AABs, the output is a bundle format that Google Play processes to generate optimized APKs per device.

#### What is the difference between APK and Android App Bundle (AAB)?

An APK is a complete installable package containing all code and resources for every device configuration. An AAB is a publishing format where Google Play generates device-specific split APKs — one for screen density, one for CPU architecture, one for language. Users download only what they need.

A universal APK might be 80MB. The same app as split APKs might be 40MB per device. Google Play requires AAB for new apps since 2021.

The tradeoff is AABs require Google Play to serve them. For side-loading, Firebase App Distribution, or alternative stores, you still need APKs. You can generate universal APKs from an AAB using `bundletool`.

#### What is the Gradle wrapper and why should you use it?

The Gradle wrapper (`gradlew`) is a script bundled in the project that downloads and uses a specific Gradle version. It ensures every developer and CI machine uses the exact same Gradle version, avoiding "works on my machine" issues.

The wrapper files are `gradlew` (Unix), `gradlew.bat` (Windows), and `gradle/wrapper/gradle-wrapper.properties` which specifies the Gradle distribution URL and version. You should commit these files to version control. To update the Gradle version, run `./gradlew wrapper --gradle-version=8.11`.

#### What is the difference between KSP and KAPT?

KAPT generates Java stubs from Kotlin source files, then runs Java annotation processors on those stubs. Every Kotlin file gets analyzed twice — once for stubs and once for compilation. It is slow.

KSP reads the Kotlin compiler's internal representation directly and skips stub generation. It understands Kotlin features like data classes, sealed classes, and nullability natively. KSP is typically 2x faster than KAPT.

```kotlin
dependencies {
    // KAPT — old approach
    kapt("androidx.room:room-compiler:2.6.1")

    // KSP — modern approach
    ksp("androidx.room:room-compiler:2.6.1")
}
```

Most major libraries support KSP now — Room, Moshi, Hilt (since Dagger 2.48). Migrating to KSP gives a noticeable build time improvement, especially in projects with many annotation-processed classes.

#### How does signing work in Android?

Every APK must be signed before installation. The signature verifies the APK hasn't been tampered with and identifies the developer.

Debug signing uses a keystore auto-generated by Android Studio at `~/.android/debug.keystore`. Release signing uses your own keystore with a private key that you generate and protect. All updates on the Play Store must be signed with the same key.

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

Android supports signing schemes v1 (JAR-based), v2 (full APK signing, Android 7.0+), v3 (key rotation, Android 9.0+), and v4 (incremental install, Android 11+). Modern builds should use v2+ at minimum. Play App Signing lets Google manage your signing key, which protects against losing it.

#### What are version catalogs and why are they used?

Version catalogs centralize dependency versions across a multi-module project. They use a `libs.versions.toml` file in the `gradle/` directory.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.1.0"
compose-bom = "2024.12.01"
retrofit = "2.11.0"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
retrofit = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }

[bundles]
compose = ["compose-ui", "compose-material3"]

[plugins]
android-application = { id = "com.android.application", version = "8.7.0" }
```

In `build.gradle.kts`, you reference them as `libs.retrofit`, `libs.bundles.compose`, `libs.plugins.android.application`. The benefits are a single source of truth for versions, IDE auto-completion, and type-safe accessors generated by Gradle.

#### What is `buildConfigField` and how does it differ from `resValue`?

`buildConfigField` generates a constant in the auto-generated `BuildConfig` class, available at compile time in Kotlin/Java code. `resValue` generates a resource value available through the resource system (`R.string`, `R.integer`, etc.).

```kotlin
android {
    buildTypes {
        debug {
            buildConfigField("String", "API_URL", "\"https://dev.api.example.com\"")
            resValue("string", "app_label", "MyApp Debug")
        }
        release {
            buildConfigField("String", "API_URL", "\"https://api.example.com\"")
            resValue("string", "app_label", "MyApp")
        }
    }
}
```

Use `buildConfigField` for values consumed by code — API URLs, feature flags, constants. Use `resValue` for values consumed by the resource system — app names, dynamic strings. `BuildConfig` fields are compile-time constants that R8 can inline.

#### What is Multidex and why was it needed?

A single DEX file has a limit of 65,536 methods (64K limit) because the DEX format uses a 16-bit index for method references. When your app plus libraries exceed this limit, the build fails. Multidex splits the app into multiple DEX files — `classes.dex`, `classes2.dex`, etc.

Before Android 5.0, you had to explicitly enable multidex because Dalvik only loaded one DEX file. ART (Android 5.0+) natively supports multiple DEX files, so apps with `minSdk 21+` get multidex automatically. R8 shrinking reduces the method count by removing unused code, which can keep you under the limit.

#### What is the Gradle daemon and how does it speed up builds?

The Gradle daemon keeps a Gradle instance running in the background after a build finishes. It avoids starting a new JVM on every build, keeping class loaders warm and reusing JIT-compiled code. This makes subsequent builds 15-75% faster.

The daemon is enabled by default and shuts down after 3 hours of idleness. You can check running daemons with `./gradlew --status` and stop them with `./gradlew --stop`. Some CI setups disable it because each build runs in a fresh container.

#### What are the main strategies for reducing build time in a large Android project?

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

#### How does Gradle's build cache work?

Gradle's build cache stores task outputs keyed by their inputs. If a task runs with the same inputs as before, Gradle reuses the cached output instead of running the task again.

The local cache stores outputs on disk at `~/.gradle/caches/build-cache-1/`. The remote cache is a shared server that all developers and CI machines use. When one developer compiles a module, the output goes to the remote cache. Another developer building the same module with the same inputs downloads the cached output instead of compiling.

Remote caching gives the biggest wins in multi-module projects. If CI compiled the entire project, developer machines can pull cached outputs for modules they haven't changed.

#### What is the Configuration Cache and how does it differ from the Build Cache?

The build cache caches task outputs — the files a task produces. The configuration cache caches the result of the configuration phase — the task graph itself.

When you enable `org.gradle.configuration-cache=true`, Gradle serializes the configured task graph after the first run. On subsequent builds, if no build scripts or `gradle.properties` changed, Gradle skips configuration entirely and jumps straight to execution. This saves several seconds on every build, especially in large multi-module projects.

The configuration cache has stricter requirements. Build scripts can't reference `Project` objects at execution time, and certain API patterns need refactoring. Gradle reports all violations and won't cache until they're fixed.

#### What are convention plugins and why are they better than `buildSrc`?

Convention plugins encapsulate common build configuration into reusable plugins. Instead of duplicating the same Android config in 20 feature modules, you create one convention plugin.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply {
                apply("com.android.library")
                apply("org.jetbrains.kotlin.android")
            }
            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig.minSdk = 26
            }
        }
    }
}
```

Then in any feature module: `plugins { id("app.android.feature") }` — one line replaces 30+ lines of configuration. The key advantage over `buildSrc` is that convention plugins in a separate `build-logic` included build don't cause full project reconfiguration when you change them. With `buildSrc`, any change triggers recompilation of every module's build script.

#### What is R8 and how does it differ from ProGuard?

R8 is the default code shrinker and obfuscator for Android, replacing ProGuard. It performs shrinking (removing unused code), optimization, obfuscation (renaming classes/methods), and desugaring — all in a single step during the dex compilation.

ProGuard ran as a separate step before dexing. R8 integrates with D8 (the dexer) and processes bytecode directly, which makes it faster. R8 is backward-compatible with ProGuard keep rules.

R8 has two modes. Compatibility mode (default) respects ProGuard rules as-is. Full mode (`android.enableR8.fullMode=true`) is more aggressive — stricter class merging and inlining. Full mode produces smaller APKs but has a higher risk of breaking reflection-dependent code.

#### How would you set up a CI/CD pipeline for an Android project?

A typical pipeline has these stages:
- **Build and lint** — compile the project, run Android Lint, run Detekt or ktlint.
- **Unit tests** — run JUnit tests across modules.
- **Instrumented tests** — run UI tests on an emulator or Firebase Test Lab.
- **Build artifacts** — generate the signed release AAB/APK.
- **Deploy** — upload to Google Play internal track.

```yaml
# .github/workflows/android.yml
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
      - run: ./gradlew lintDebug
      - run: ./gradlew testDebugUnitTest
      - run: ./gradlew bundleRelease
```

Cache the Gradle dependency directory and use the build cache for faster CI builds. Store signing keys and passwords as CI secrets, never in the repository.

#### How do you handle dependency conflicts in Gradle?

When two libraries depend on different versions of the same transitive dependency, Gradle picks the highest version by default. You can inspect the resolved dependency tree with `./gradlew dependencies` or `./gradlew :app:dependencyInsight --dependency <name>`.

To force a specific version, use `resolutionStrategy`:

```kotlin
configurations.all {
    resolutionStrategy {
        force("com.squareup.okhttp3:okhttp:4.12.0")
    }
}
```

You can also exclude transitive dependencies:

```kotlin
implementation("com.example:library:1.0") {
    exclude(group = "com.squareup.okhttp3", module = "okhttp")
}
```

For strict control, enable dependency locking. Gradle writes a lock file with resolved versions, and the build fails if versions change unexpectedly.

#### What is `settings.gradle.kts` and what does `dependencyResolutionManagement` do?

`settings.gradle.kts` runs during the initialization phase. It declares which modules are in the build using `include()`, configures where Gradle looks for plugins via `pluginManagement`, and controls dependency repositories via `dependencyResolutionManagement`.

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
```

`FAIL_ON_PROJECT_REPOS` ensures repositories are only declared in settings, not in individual module build files. This keeps repository configuration centralized and prevents modules from adding unexpected repositories.

#### What is the difference between `includeBuild` and `include` in settings?

`include(":app")` adds a subproject to the build. It shares the same build lifecycle, configuration, and dependency graph.

`includeBuild("build-logic")` adds a composite build — a separate Gradle build that's linked to the main build. It has its own `settings.gradle.kts` and build scripts. Dependencies between the builds are substituted automatically.

The main use case for `includeBuild` is convention plugins. You put shared build logic in a separate `build-logic` directory with its own build. This way, changes to build logic don't invalidate the configuration cache of the main build.

### Common Follow-ups

- How do you profile a slow Gradle build?
- What is the difference between `api` and `implementation` in terms of the compile classpath?
- How do dynamic feature modules work with app bundles?
- How does Gradle's incremental compilation work?
- What are Gradle task inputs and outputs, and why do they matter for caching?
- How do you handle different signing configs for different environments?
- What is the difference between `allprojects` and `subprojects` blocks?
- How do you create a custom Gradle task?
