---
title: Gradle Convention Plugins Guide
layout: post
sequence: 134
categories: post
tags:
  - Gradle
  - Build Systems
  - Android
---

When you have 20+ modules in an Android project, there's a specific kind of pain that has nothing to do with your app's logic. It's the build configuration. Every module's `build.gradle.kts` repeats the same `compileSdk`, the same `minSdk`, the same Kotlin compiler options, the same test dependencies. You copy-paste from an existing module, tweak one thing, and move on. It works until someone bumps `compileSdk` from 34 to 35, and suddenly you're editing 30 files. Miss one, and you get a cryptic build failure that takes 20 minutes to trace back to a mismatched SDK version in `:feature:notifications`.

I hit this wall on a project with 22 modules. Every new module required copying 40+ lines of boilerplate. Modules would silently drift — one feature module was still targeting Java 11 while everything else had moved to 17, and we only caught it when a CI build failed three weeks later. Convention plugins solve this entirely. You define your shared build logic once, and every module applies it with one line. This is the approach Google's [Now in Android](https://github.com/android/nowinandroid) reference project uses, and it's based on Square's "[Herding Elephants](https://developer.squareup.com/blog/herding-elephants/)" approach — treat build configuration like code, not like copy-pasted config files.

## The Problem

Here's what a typical library module's `build.gradle.kts` looks like without convention plugins:

```kotlin
// feature/search/build.gradle.kts
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
}

android {
    namespace = "com.myapp.feature.search"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner =
            "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(
            org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
        )
        freeCompilerArgs.addAll(
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi"
        )
    }
}
```

Multiply that across 20 modules. Every single one repeats `compileSdk = 35`, `minSdk = 26`, and the Kotlin compiler options. When you bump `compileSdk`, you touch every file. The real cost isn't the time spent editing — it's the time spent debugging when one module falls out of sync. Convention plugins centralize all of this into one line: `plugins { id("myapp.android.library") }`.

## Setting Up build-logic Module

The first decision is where to put your convention plugins. I'd argue `buildSrc` is a trap for any serious project — any change to `buildSrc` invalidates the entire project's build cache. Bump a version constant in `buildSrc/Dependencies.kt`, and every module recompiles from scratch. On a 20-module project, that's the difference between a 30-second incremental build and a 5-minute full rebuild.

Included builds (`includeBuild()`) compile independently with their own build cache, and only invalidate modules that depend on the changed code. Here's the directory structure:

```
project-root/
├── build-logic/
│   ├── convention/
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/
│   │       ├── AndroidLibraryConventionPlugin.kt
│   │       ├── AndroidApplicationConventionPlugin.kt
│   │       └── AndroidComposeConventionPlugin.kt
│   └── settings.gradle.kts
├── app/
├── feature/
├── core/
├── gradle/
│   └── libs.versions.toml
└── settings.gradle.kts
```

The `build-logic/settings.gradle.kts` is a standalone Gradle project that pulls in the version catalog from the parent:

```kotlin
// build-logic/settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))
        }
    }
}

rootProject.name = "build-logic"
include(":convention")
```

The `convention` module applies `kotlin-dsl` and declares `compileOnly` dependencies on the Gradle plugin APIs:

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

The `compileOnly` scope is deliberate — the actual plugin JARs come from the consuming project's `pluginManagement` block. You'll need entries in `libs.versions.toml` for these:

```toml
[libraries]
android-gradlePlugin = { group = "com.android.tools.build",
    name = "gradle", version.ref = "agp" }
kotlin-gradlePlugin = { group = "org.jetbrains.kotlin",
    name = "kotlin-gradle-plugin", version.ref = "kotlin" }
compose-gradlePlugin = { group = "org.jetbrains.kotlin",
    name = "compose-compiler-gradle-plugin", version.ref = "kotlin" }
```

Finally, wire it into your root `settings.gradle.kts`:

```kotlin
// settings.gradle.kts (project root)
pluginManagement {
    includeBuild("build-logic")
}
```

That's the scaffolding. Now you can write actual plugins.

## Writing a Convention Plugin

A convention plugin is a Kotlin class implementing `Plugin<Project>`. Here's an `AndroidLibraryConventionPlugin` that replaces the 40+ lines of boilerplate:

```kotlin
// build-logic/convention/src/main/kotlin/
// AndroidLibraryConventionPlugin.kt
import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinAndroidProjectExtension

class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("org.jetbrains.kotlin.android")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig {
                    minSdk = 26
                    testInstrumentationRunner =
                        "androidx.test.runner.AndroidJUnitRunner"
                }
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
                buildFeatures {
                    buildConfig = false
                }
            }

            extensions.configure<KotlinAndroidProjectExtension> {
                compilerOptions {
                    jvmTarget.set(JvmTarget.JVM_17)
                    freeCompilerArgs.addAll(
                        "-opt-in=kotlinx.coroutines" +
                            ".ExperimentalCoroutinesApi"
                    )
                }
            }
        }
    }
}
```

You register this plugin in `build-logic/convention/build.gradle.kts` with a custom plugin ID:

```kotlin
// build-logic/convention/build.gradle.kts
gradlePlugin {
    plugins {
        register("androidLibrary") {
            id = "myapp.android.library"
            implementationClass =
                "AndroidLibraryConventionPlugin"
        }
    }
}
```

Now any module can use it:

```kotlin
// feature/search/build.gradle.kts
plugins {
    id("myapp.android.library")
}

android {
    namespace = "com.myapp.feature.search"
}
```

Forty lines reduced to four. The namespace is the only genuinely unique thing per module. Everything else lives in one place — bump `compileSdk` to 36 next year, and it's a one-line change that propagates everywhere.

The reframe here: convention plugins turn build configuration from duplicated config files into actual code. You get type safety, IDE autocompletion, and refactoring support. The `Plugin<Project>` class approach gives you full Kotlin with proper types — unlike precompiled script plugins (`.gradle.kts` files in `buildSrc`), which have weaker IDE support and can't be composed as cleanly.

## Plugin Composition

Here's where convention plugins get genuinely powerful. Plugins can apply other plugins. This means you can build a layered system where each plugin adds one concern, and higher-level plugins compose lower-level ones.

In Now in Android, the `AndroidFeatureImplConventionPlugin` doesn't duplicate the library configuration — it applies the `AndroidLibraryConventionPlugin` and then adds feature-specific concerns on top:

```kotlin
// AndroidFeatureConventionPlugin.kt
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            // Applies library + kotlin + lint config
            pluginManager.apply("myapp.android.library")
            // Adds Hilt support (KSP + Hilt plugin)
            pluginManager.apply("myapp.hilt")

            dependencies {
                "implementation"(project(":core:ui"))
                "implementation"(project(":core:designsystem"))
                "implementation"(
                    libs.findLibrary(
                        "androidx.lifecycle.viewModelCompose"
                    ).get()
                )
            }
        }
    }
}
```

Similarly, a Compose plugin layers Compose-specific configuration on top of the library plugin:

```kotlin
// AndroidComposeConventionPlugin.kt
class AndroidComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("myapp.android.library")
            pluginManager.apply(
                "org.jetbrains.kotlin.plugin.compose"
            )

            extensions.configure<LibraryExtension> {
                buildFeatures {
                    compose = true
                }
            }
        }
    }
}
```

The composition pattern in practice: `myapp.android.library` handles compileSdk, minSdk, Kotlin, and Java compatibility. `myapp.android.compose` applies library plus Compose settings. `myapp.android.feature` applies library plus Hilt plus common feature dependencies. Your module `build.gradle.kts` files become declarative descriptions of what the module is:

```kotlin
// feature/search/build.gradle.kts — a Compose feature module
plugins {
    id("myapp.android.feature")
    id("myapp.android.compose")
}

android {
    namespace = "com.myapp.feature.search"
}

dependencies {
    implementation(project(":core:data"))
}
```

Two plugin lines replace 60+ lines of configuration. The Hilt configuration exists in exactly one file. The Compose compiler setup exists in exactly one file. The tradeoff is indirection — a new developer needs to trace through the plugin chain to understand what `:feature:search` is configured with. I think this is a fair tradeoff, and the convention plugin names should be descriptive enough that you rarely need to look at the implementation.

## Version Catalog Integration

Convention plugins become even more useful when they can access the project's version catalog. Instead of hardcoding dependency coordinates, your plugins can pull versions and libraries from `libs.versions.toml`, keeping everything centralized.

The key is the `libs` extension. In Now in Android, they define a helper extension property to access the catalog cleanly:

```kotlin
// build-logic/convention/src/main/kotlin/
// ProjectExtensions.kt
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalog
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.getByType

val Project.libs: VersionCatalog
    get() = extensions.getByType<VersionCatalogsExtension>()
        .named("libs")
```

With this, any plugin can reference catalog entries:

```kotlin
class HiltConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.google.devtools.ksp")

            dependencies {
                "ksp"(libs.findLibrary("hilt.compiler").get())
            }

            pluginManager.withPlugin("com.android.base") {
                pluginManager.apply(
                    "dagger.hilt.android.plugin"
                )
                dependencies {
                    "implementation"(
                        libs.findLibrary("hilt.android").get()
                    )
                }
            }
        }
    }
}
```

The `findLibrary()` API returns an `Optional<Provider<MinimalExternalModuleDependency>>` — you call `.get()` to unwrap it. If the library doesn't exist in the catalog, you get a clear error at configuration time rather than a mysterious resolution failure later. The `pluginManager.withPlugin("com.android.base")` block is worth noting — it's a reactive callback that only runs when the Android plugin is present. This lets the Hilt plugin work for both Android modules and pure JVM modules without conditional logic. In an Android module, it applies the Hilt Android plugin. In a JVM module, it just adds the core Hilt dependency.

One gotcha: `findLibrary()` uses the catalog key name with dots, not dashes. If your catalog entry is `hilt-compiler`, the lookup key is `hilt.compiler`. Gradle converts dashes to dots automatically in the accessor generation — this trips people up.

As your plugin count grows, you'll notice repeated configuration across the library and application plugins. Extract shared logic into Kotlin extension functions. The key insight is that both `LibraryExtension` and `ApplicationExtension` extend `CommonExtension`, so a function that takes `CommonExtension` works for both. This is what Now in Android does with `KotlinAndroid.kt` and `AndroidCompose.kt` — the plugins become thin orchestrators that delegate to shared functions.

## Migration Strategy

If you have an existing multi-module project, don't try to extract every piece of build logic into convention plugins at once. I've seen teams spend a week building an elaborate plugin hierarchy, only to realize they over-abstracted and now need to undo half of it. Start small and extract incrementally.

**Step 1: Create the build-logic scaffolding.** Set up the `build-logic/` directory, `settings.gradle.kts`, and the `convention` module. Get a single empty plugin compiling and applying successfully to one module. This validates the infrastructure without changing any behavior.

**Step 2: Extract the most common module type.** In most Android projects, this is the library module. Write an `AndroidLibraryConventionPlugin` that captures the `compileSdk`, `minSdk`, Kotlin options, and Java compatibility settings that every library module shares. Apply it to one module, verify the build still works, then roll it out to the rest.

**Step 3: Add composition one layer at a time.** Once the base library plugin is stable, add a Compose plugin for modules that use Compose, a Hilt plugin for modules that use DI, and a Feature plugin that composes both. Each new plugin should be tested on one module before being applied broadly.

**Step 4: Move dependency declarations.** If certain dependencies appear in every module of a given type (like `kotlin-test` in every library), move those into the convention plugin. Keep feature-specific dependencies in the module's own `build.gradle.kts`.

The principle is simple: only extract configuration that's genuinely shared across 3+ modules. One-off configurations belong in the module's own build file. The Now in Android README puts it well: "If there is one-off logic for a module without shared code, it's preferable to define that directly in the module's `build.gradle`."

The honest tradeoff is complexity and indirection. New team members need to understand that `id("myapp.android.library")` isn't a third-party plugin — it's your own build-logic module. Build errors in convention plugins can produce confusing stack traces. But for any project beyond 10 modules, I think the tradeoff is overwhelmingly worth it. The alternative — maintaining 20+ nearly-identical build files and hoping nobody introduces drift — costs more in the long run than the upfront investment.

## Quiz

**Q1:** You have `buildSrc` with shared build configuration. You change a single version constant in `buildSrc/Dependencies.kt`. What happens on the next build?

**Wrong**: Only modules that use that dependency recompile.

**Correct**: The entire project's build cache is invalidated and every module recompiles from scratch. This is the fundamental problem with `buildSrc` — any change, no matter how small, invalidates everything. Included builds (`includeBuild()`) solve this by compiling independently and only invalidating modules that depend on the changed code.

**Q2:** Your convention plugin registers a plugin with `id = "myapp.android.library"` and applies the Android library plugin internally using `pluginManager.apply("com.android.library")`. A module applies your convention plugin. Can the module's `build.gradle.kts` also apply `com.android.library` directly?

**Wrong**: Yes, applying the same plugin twice just works.

**Correct**: Technically, yes — Gradle is idempotent about plugin application, so applying the same plugin twice doesn't cause an error. But it's unnecessary and misleading. The convention plugin already applies it internally. The danger is when a module applies a different version or configuration of the same plugin, which can cause subtle conflicts. The rule is: if a convention plugin handles it, don't also handle it in the module.

## Coding Challenge

Build a convention plugin system for a multi-module Android project with three plugin types: `myapp.android.library` (base config), `myapp.android.compose` (Compose support), and `myapp.android.feature` (feature module with Hilt). The feature plugin should compose both the library and Hilt plugins. Create the full `build-logic/` directory structure, register all three plugins in `gradlePlugin {}`, and write a sample `feature/search/build.gradle.kts` that uses the feature and compose plugins. Verify that `compileSdk`, Kotlin JVM target, and Compose are all configured in exactly one place.

Thanks for reading!
