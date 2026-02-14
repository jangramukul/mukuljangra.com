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

Think of it like sharing tools in an office. `implementation` is a tool you keep in your desk — you use it, but nobody else in the office even knows it's there. `api` is a tool you put on the shared shelf — anyone who works with you can grab it too. `compileOnly` is a reference manual you consult while writing a report, but it never leaves the building with the finished document.

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

Default to `implementation`. Always. Only reach for `api` when your module's public API exposes types from that dependency — like if your public function returns a Retrofit `Call` object. Here's the real cost: changing an `api` dependency triggers recompilation of all dependent modules, while `implementation` only recompiles the changed module. In a 30-module project, that difference is brutal.

#### What are the three phases of a Gradle build?

Every Gradle build is like putting on a play. Three acts, every time, no skipping:

- **Initialization** — reads `settings.gradle.kts` to figure out which modules are even in the build. This is Gradle looking at the cast list.
- **Configuration** — evaluates every `build.gradle.kts` file. Plugins get applied, dependencies declared, tasks created, and the task graph is built. Think of this as the rehearsal — everyone gets their scripts and blocking, but nobody performs yet. No compilation happens here.
- **Execution** — the actual show. Tasks run in dependency order. Source code compiles, resources merge, DEX files generate, and the APK/AAB is assembled.

Here's the thing that trips people up: anything at the top level of `build.gradle.kts` runs during configuration on every single build invocation, even `gradle help`. That expensive network call you threw in there? It runs every time. Defer expensive operations to the execution phase by placing them inside task actions.

#### What are build types and product flavors, and how do they combine?

Build types define *how* the app is built. `debug` and `release` are the defaults — debug has debugging enabled and R8 disabled, release enables minification and uses a release signing key. Think of them as cooking instructions: same ingredients, different preparation.

Product flavors define *which version* of the app you're building. Maybe `dev` and `prod` flavors pointing to different API endpoints, or `free` and `paid` with different feature sets. Flavors are organized into dimensions.

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

Now here's where it gets interesting — build types and product flavors multiply into build variants. With 2 flavors and 2 build types, you get 4 variants: `devDebug`, `devRelease`, `prodDebug`, `prodRelease`. Each variant can have its own source set, resources, and manifest entries. It's a matrix, not a list.

#### What is the difference between `build.gradle.kts` at the project level vs the module level?

Picture a company org chart. The root `build.gradle.kts` is the CEO memo — it sets company-wide policy. You declare plugins with `apply false` at the root to make them available without activating them anywhere yet.

```kotlin
// Root build.gradle.kts
plugins {
    id("com.android.application") version "8.7.0" apply false
    id("com.android.library") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
}
```

Module-level `build.gradle.kts` files are the individual team leads — each one configures its own module: compile SDK, min SDK, dependencies, build types, product flavors, and which plugins actually get applied.

Then there's `settings.gradle.kts`, which sits above both. It's the receptionist at the door — it declares which modules are included (`include(":app", ":core:network")`), configures repository resolution through `dependencyResolutionManagement`, and sets up `pluginManagement` for plugin repositories. Three files, three jobs, and they run in that exact order.

#### How does the Android build process work from source code to APK?

It's an assembly line with several stations, and your code passes through each one:

- Kotlin compiler compiles `.kt` files into `.class` files. Annotation processors (KAPT/KSP) run during this step.
- D8 converts `.class` files into `.dex` files. If minification is enabled, R8 runs instead — it combines dexing with shrinking, optimization, and obfuscation in one step. Two-for-one deal.
- AAPT2 compiles resources (XML layouts, drawables, strings) into binary format and generates `R.java` for resource IDs.
- The manifest merger takes manifests from all modules and libraries and smashes them into one.
- Finally, the APK builder packages DEX files, compiled resources, native libraries, and assets into a ZIP, aligns it with `zipalign`, and signs it.

For AABs, the output is a bundle format instead. Google Play takes that bundle and generates optimized APKs per device configuration — but that's Play's job, not yours.

#### What is the difference between APK and Android App Bundle (AAB)?

> **🧠 Think about it:** If every user downloads the same APK but only needs resources for their specific screen density, CPU architecture, and language — how much space is being wasted?

An APK is a complete installable package containing all code and resources for every device configuration. It's like shipping an entire wardrobe when the customer only ordered a jacket. An AAB is a publishing format where Google Play generates device-specific split APKs — one for screen density, one for CPU architecture, one for language. Users download only what they need.

A universal APK might be 80MB. The same app as split APKs might be 40MB per device. Google Play requires AAB for new apps since 2021, and that size difference is exactly why.

The tradeoff is real though — AABs require Google Play to serve them. For side-loading, Firebase App Distribution, or alternative stores, you still need APKs. You can generate universal APKs from an AAB using `bundletool`.

#### What is the Gradle wrapper and why should you use it?

You know the "works on my machine" meme? The Gradle wrapper exists to kill that, at least for the build tool itself.

The wrapper (`gradlew`) is a script bundled in the project that downloads and uses a specific Gradle version. Every developer and CI machine uses the exact same Gradle version, no questions asked. It's like checking a specific compiler into your repo — except lighter.

The wrapper files are `gradlew` (Unix), `gradlew.bat` (Windows), and `gradle/wrapper/gradle-wrapper.properties` which specifies the Gradle distribution URL and version. Commit all of these to version control. To update the Gradle version, run `./gradlew wrapper --gradle-version=8.11`.

#### What is the difference between KSP and KAPT?

This one catches people off guard because the migration is so simple, but the performance difference is dramatic.

KAPT generates Java stubs from Kotlin source files, then runs Java annotation processors on those stubs. Every Kotlin file gets analyzed twice — once for stubs and once for compilation. It's like translating a novel into a second language, running spell check on the translation, then going back and editing the original. Slow.

KSP reads the Kotlin compiler's internal representation directly and skips stub generation entirely. It understands Kotlin features like data classes, sealed classes, and nullability natively — no translation layer needed. KSP is typically 2x faster than KAPT.

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

Every APK must be signed before installation. The signature verifies the APK hasn't been tampered with and identifies the developer. It's like a wax seal on a letter — break it and everyone knows something's wrong.

Debug signing uses a keystore auto-generated by Android Studio at `~/.android/debug.keystore`. Release signing uses your own keystore with a private key that you generate and protect. All updates on the Play Store must be signed with the same key — lose it, and you can never update your app again.

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

Android supports signing schemes v1 (JAR-based), v2 (full APK signing, Android 7.0+), v3 (key rotation, Android 9.0+), and v4 (incremental install, Android 11+). Modern builds should use v2+ at minimum. Play App Signing lets Google manage your signing key, which protects against the nightmare scenario of losing it.

#### What are version catalogs and why are they used?

Imagine managing dependency versions in a 20-module project where each module declares its own version of Retrofit. Someone updates it in 18 modules but misses 2. Now you've got two different versions floating around and weird runtime bugs. Version catalogs fix this.

They centralize dependency versions across a multi-module project using a single `libs.versions.toml` file in the `gradle/` directory.

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

In `build.gradle.kts`, you reference them as `libs.retrofit`, `libs.bundles.compose`, `libs.plugins.android.application`. One source of truth for versions, IDE auto-completion, and type-safe accessors generated by Gradle. Change a version in one place, it updates everywhere.

#### What is `buildConfigField` and how does it differ from `resValue`?

Both inject values into your build, but they live in different worlds. `buildConfigField` generates a constant in the auto-generated `BuildConfig` class — it's a Kotlin/Java compile-time constant your code can reference directly. `resValue` generates a resource value that lives in the Android resource system (`R.string`, `R.integer`, etc.).

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

The rule of thumb: `buildConfigField` for values consumed by code — API URLs, feature flags, constants. `resValue` for values consumed by the resource system — app names displayed in the launcher, dynamic strings referenced in XML. Bonus: `BuildConfig` fields are compile-time constants that R8 can inline, so they have zero runtime cost.

#### What is Multidex and why was it needed?

> **🧠 Think about it:** The DEX format uses a 16-bit index for method references. What's the maximum number of methods a single DEX file can reference?

A single DEX file has a limit of 65,536 methods (the 64K limit) because of that 16-bit index. When your app plus its libraries exceed this limit, the build fails. It's like a phone book that can only hold 65,536 entries — once you run out of slots, you need a second book. Multidex splits the app into multiple DEX files — `classes.dex`, `classes2.dex`, etc.

Before Android 5.0, you had to explicitly enable multidex because Dalvik only loaded one DEX file at startup. ART (Android 5.0+) natively supports multiple DEX files, so apps with `minSdk 21+` get multidex automatically. R8 shrinking reduces the method count by removing unused code, which can often keep you under the limit entirely.

#### What is the Gradle daemon and how does it speed up builds?

The Gradle daemon is like keeping your car engine running between errands instead of turning it off and restarting it every time. It keeps a Gradle instance running in the background after a build finishes, avoiding the cost of starting a new JVM on every build. Class loaders stay warm, JIT-compiled code gets reused. This makes subsequent builds 15-75% faster.

The daemon is enabled by default and shuts down after 3 hours of idleness. You can check running daemons with `./gradlew --status` and stop them with `./gradlew --stop`. Some CI setups disable it because each build runs in a fresh container anyway — no point keeping an engine warm if you're scrapping the car after one trip.

#### What are the main strategies for reducing build time in a large Android project?

This is a layered problem, so think about it at three levels:

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
- Avoid dynamic versions (`1.+`) — they force Gradle to check for updates on every build, even if nothing changed.
- Remove unused dependencies since they still participate in resolution and slow things down.

The biggest bang for your buck in most projects? Modularization plus the build cache. Those two together can turn a 5-minute clean build into a 30-second incremental one.

#### How does Gradle's build cache work?

Think of it like a kitchen that remembers every dish it's ever cooked. If you ask for the same meal with the same ingredients, it just hands you the cached version instead of cooking again.

Gradle's build cache stores task outputs keyed by their inputs. If a task runs with the same inputs as before, Gradle reuses the cached output instead of running the task again.

The local cache stores outputs on disk at `~/.gradle/caches/build-cache-1/`. The remote cache is the really powerful part — it's a shared server that all developers and CI machines use. When one developer compiles a module, the output goes to the remote cache. Another developer building the same module with the same inputs just downloads the cached output instead of compiling. It's like the whole team shares one kitchen memory.

Remote caching gives the biggest wins in multi-module projects. If CI compiled the entire project, developer machines can pull cached outputs for modules they haven't changed.

#### What is the Configuration Cache and how does it differ from the Build Cache?

> **🧠 Think about it:** The build cache saves task outputs. But what about the work Gradle does *before* any task runs — reading build scripts, resolving plugins, building the task graph? Can that be cached too?

Yes, and that's exactly what the configuration cache does. The build cache caches task outputs — the files a task produces. The configuration cache caches the result of the configuration phase — the task graph itself.

When you enable `org.gradle.configuration-cache=true`, Gradle serializes the configured task graph after the first run. On subsequent builds, if no build scripts or `gradle.properties` changed, Gradle skips configuration entirely and jumps straight to execution. This saves several seconds on every build, especially in large multi-module projects where configuration alone can take 10+ seconds.

The catch: the configuration cache has stricter requirements. Build scripts can't reference `Project` objects at execution time, and certain API patterns need refactoring. Gradle reports all violations and won't cache until they're fixed. It's worth the cleanup though.

#### What are convention plugins and why are they better than `buildSrc`?

Picture this: you have 20 feature modules, and every single one has the same 30+ lines of Android configuration — compile SDK, min SDK, Kotlin setup, the works. Copy-paste city. Convention plugins let you extract all that into a reusable plugin.

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

Then in any feature module: `plugins { id("app.android.feature") }` — one line replaces 30+ lines of configuration.

But wait, why not just use `buildSrc` for this? Here's the key difference: convention plugins in a separate `build-logic` included build don't cause full project reconfiguration when you change them. With `buildSrc`, any change — even a typo fix — triggers recompilation of every module's build script. In a large project, that's the difference between a 5-second feedback loop and a 45-second one.

#### What is R8 and how does it differ from ProGuard?

R8 is the default code shrinker and obfuscator for Android, and it replaced ProGuard by being smarter about how it does the same job. It performs shrinking (removing unused code), optimization, obfuscation (renaming classes/methods), and desugaring — all in a single step during dex compilation.

ProGuard ran as a separate step before dexing — compile, then shrink, then dex. Three steps. R8 integrates with D8 (the dexer) and processes bytecode directly, collapsing that into fewer steps. Faster, same result. And it's backward-compatible with ProGuard keep rules, so migration is mostly painless.

R8 has two modes. Compatibility mode (default) respects ProGuard rules as-is. Full mode (`android.enableR8.fullMode=true`) is more aggressive — stricter class merging and inlining. Full mode produces smaller APKs but has a higher risk of breaking reflection-dependent code. If you're using Gson or any library that relies on reflection, test thoroughly before flipping that switch.

#### How would you set up a CI/CD pipeline for an Android project?

A typical pipeline is like a series of quality gates. Your code has to pass each one before it reaches the user:

- **Build and lint** — compile the project, run Android Lint, run Detekt or ktlint. Catches code quality issues early.
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

Cache the Gradle dependency directory and use the build cache for faster CI builds. And this should go without saying, but store signing keys and passwords as CI secrets, never in the repository.

#### How do you handle dependency conflicts in Gradle?

When two libraries depend on different versions of the same transitive dependency, Gradle picks the highest version by default. That's usually fine, but sometimes it's not — a library might break with a newer version of its dependency that it wasn't tested against.

You can inspect the resolved dependency tree with `./gradlew dependencies` or `./gradlew :app:dependencyInsight --dependency <name>` to see exactly what got pulled in and why.

To force a specific version, use `resolutionStrategy`:

```kotlin
configurations.all {
    resolutionStrategy {
        force("com.squareup.okhttp3:okhttp:4.12.0")
    }
}
```

You can also exclude transitive dependencies entirely:

```kotlin
implementation("com.example:library:1.0") {
    exclude(group = "com.squareup.okhttp3", module = "okhttp")
}
```

For strict control, enable dependency locking. Gradle writes a lock file with resolved versions, and the build fails if versions change unexpectedly. It's like pinning your dependencies — nothing shifts under you without you knowing about it.

#### What is `settings.gradle.kts` and what does `dependencyResolutionManagement` do?

`settings.gradle.kts` is the first file Gradle reads — it runs during the initialization phase. It has three main jobs: declaring which modules are in the build using `include()`, configuring where Gradle looks for plugins via `pluginManagement`, and controlling dependency repositories via `dependencyResolutionManagement`.

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

That `FAIL_ON_PROJECT_REPOS` setting is the interesting part. It ensures repositories are only declared in settings, not in individual module build files. Without it, any module could quietly add its own repository — maybe a sketchy Maven repo someone found on a blog. This keeps repository configuration centralized and prevents modules from adding unexpected repositories. One front door, not twenty.

#### What is the difference between `includeBuild` and `include` in settings?

`include(":app")` adds a subproject to the build. It's like adding an employee to your team — they share the same office, same rules, same schedule. The subproject shares the same build lifecycle, configuration, and dependency graph.

`includeBuild("build-logic")` adds a composite build — a separate Gradle build that's linked to the main build but lives independently. It has its own `settings.gradle.kts` and build scripts. It's more like hiring a contractor — they do work for you, but they have their own setup. Dependencies between the builds are substituted automatically.

The main use case for `includeBuild` is convention plugins. You put shared build logic in a separate `build-logic` directory with its own build. This way, changes to build logic don't invalidate the configuration cache of the main build — a huge deal for iteration speed.

### Common Follow-ups

- How do you profile a slow Gradle build?
- What is the difference between `api` and `implementation` in terms of the compile classpath?
- How do dynamic feature modules work with app bundles?
- How does Gradle's incremental compilation work?
- What are Gradle task inputs and outputs, and why do they matter for caching?
- How do you handle different signing configs for different environments?
- What is the difference between `allprojects` and `subprojects` blocks?
- How do you create a custom Gradle task?
