---
title: Gradle Version Catalogs Guide
layout: post
sequence: 135
categories: post
tags:
  - Gradle
  - Build Systems
  - Android
---

I spent the first two years of my Android career hunting for dependency versions across three different places. The app module had Retrofit pinned inline. A `buildSrc/Dependencies.kt` object held Compose and Coroutines versions. And someone had put Room's version in a root-level `ext` block that half the team didn't know existed. Every version bump was an archaeology expedition — figure out where the version lived, change it, then pray nothing broke because another module was using a different version of the same library. On a 12-module project, this wasn't just annoying. It was a source of real bugs. We shipped a build once where two modules used different Moshi versions, and the runtime crash only showed up in production.

Gradle version catalogs fix this by giving you a single TOML file — `gradle/libs.versions.toml` — that holds every dependency version, library coordinate, plugin version, and dependency bundle for the entire project. Gradle reads this file and generates type-safe accessors with IDE autocomplete. No more string typos. No more version mismatches across modules. No more `buildSrc` invalidating your entire build cache every time you bump a patch version. Version catalogs became stable in Gradle 7.4.1, and I'd argue they're now the only reasonable way to manage dependencies in any multi-module Android project.

## libs.versions.toml

The catalog file lives at `gradle/libs.versions.toml` in your project root. Gradle picks it up automatically — no configuration needed. The file has four sections, each with a specific role.

**`[versions]`** declares version strings that can be referenced by libraries and plugins. **`[libraries]`** maps dependency aliases to their Maven coordinates (group, artifact, version). **`[bundles]`** groups related library aliases so you can pull them in with a single line. **`[plugins]`** maps plugin aliases to plugin IDs and versions.

Here's what a real Android project's catalog looks like — not a toy example, but the kind of file you'd see in a production app with Compose, Hilt, Retrofit, Room, and Coroutines:

```toml
[versions]
kotlin = "2.1.0"
agp = "8.7.3"
compose-bom = "2024.12.01"
compose-compiler = "1.5.15"
hilt = "2.53.1"
retrofit = "2.11.0"
room = "2.6.1"
coroutines = "1.9.0"
lifecycle = "2.8.7"
ksp = "2.1.0-1.0.29"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
compose-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
compose-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }

hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler = { group = "com.google.dagger", name = "hilt-android-compiler", version.ref = "hilt" }

retrofit-core = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-moshi = { group = "com.squareup.retrofit2", name = "converter-moshi", version.ref = "retrofit" }

room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }

coroutines-core = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-core", version.ref = "coroutines" }
coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }

lifecycle-viewmodel = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycle" }
lifecycle-runtime = { group = "androidx.lifecycle", name = "lifecycle-runtime-compose", version.ref = "lifecycle" }

junit = { group = "junit", name = "junit", version = "4.13.2" }
mockk = { group = "io.mockk", name = "mockk", version = "1.13.13" }
turbine = { group = "app.cash.turbine", name = "turbine", version = "1.2.0" }

[bundles]
compose = ["compose-ui", "compose-material3", "compose-tooling-preview"]
retrofit = ["retrofit-core", "retrofit-moshi"]
room = ["room-runtime", "room-ktx"]
testing = ["junit", "mockk", "turbine", "coroutines-test"]

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
compose-compiler = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
```

Notice a few things. Libraries that don't specify a `version.ref` — like `compose-ui` and `compose-material3` — get their versions from a BOM (more on that below). The `version.ref` string points back to a key in `[versions]`, so changing Coroutines from 1.9.0 to 1.10.0 is exactly one line change. The dashes in alias names like `compose-ui` become dots in the generated accessors: `libs.compose.ui`. Gradle normalizes dashes, underscores, and dots into the same dot-separated accessor chain.

One detail the docs don't emphasize enough: the TOML file is parsed at settings evaluation time, before any `build.gradle.kts` runs. This means the catalog is available to every module in the project without any imports or references. It just works. Compare this to `buildSrc`, where changing a single version constant invalidated the entire build cache because Gradle treated `buildSrc` as a project dependency of every module.

## Using in build.gradle.kts

Once the catalog exists, you reference dependencies through the generated `libs` accessor. Here's what a typical module's `build.gradle.kts` looks like:

```kotlin
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.compose.compiler)
}

android {
    namespace = "com.example.feature.search"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.bundles.compose)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    implementation(libs.bundles.retrofit)

    implementation(libs.lifecycle.viewmodel)
    implementation(libs.lifecycle.runtime)

    implementation(libs.coroutines.core)
    implementation(libs.coroutines.android)

    testImplementation(libs.bundles.testing)
}
```

The `alias()` function in the `plugins` block applies a plugin from the catalog. In the `dependencies` block, you reference libraries directly with `libs.hilt.android` or pull in entire bundles with `libs.bundles.compose`. Every reference is type-safe — if you mistype `libs.hilt.andriod`, the build fails at compile time, not at runtime with a cryptic "dependency not found" error. The IDE also autocompletes these accessors, so you can type `libs.` and see every available dependency. This sounds minor, but on a project with 80+ dependencies, it's a real productivity gain.

If you need to access a version string directly — say, for passing a version to a Gradle task or custom build logic — use `libs.versions.compose.bom.get()`. The `.get()` call returns the version as a `String`. This is useful for things like configuring Room's schema export directory or passing a version to a code generator.

## Bundles

Bundles are where version catalogs go from "nice to have" to "I can't live without this." A bundle groups related library aliases into a single reference. Instead of listing five Compose dependencies in every module, you declare the bundle once and reference it everywhere.

Look at the `[bundles]` section from the catalog above. The `compose` bundle includes `compose-ui`, `compose-material3`, and `compose-tooling-preview`. The `testing` bundle pulls in `junit`, `mockk`, `turbine`, and `coroutines-test`. In your `build.gradle.kts`, `implementation(libs.bundles.compose)` expands to three separate `implementation` declarations. The build output is identical — bundles are purely a build script convenience, not a dependency resolution mechanism.

I maintain bundles for every logical group in our project. A `retrofit` bundle for networking. A `room` bundle for database. A `testing` bundle for unit tests. Before bundles, our feature modules each had 15-20 lines of dependency declarations. Now they have 6-8. That's not just fewer lines — it's fewer places where someone can accidentally add a dependency to the wrong configuration or forget to include a companion library that another one depends on.

The tradeoff is discoverability. When a new developer opens `build.gradle.kts` and sees `libs.bundles.compose`, they don't immediately know what's inside. They have to go look at the TOML file. I think this is a fair trade — you read the TOML file once, and then bundles save you time on every module thereafter. If you're onboarding someone, pointing them to `libs.versions.toml` first is a good move anyway. It's the dependency manifest for the entire project.

## BOM Integration

BOMs (Bill of Materials) and version catalogs serve overlapping purposes — both centralize version management. But they work at different levels, and combining them correctly matters. A BOM is a published Maven artifact that declares compatible versions for a set of libraries. The Compose BOM, for example, ensures that `compose-ui`, `compose-material3`, and `compose-animation` all use versions that were tested together by the Compose team.

In your catalog, you declare the BOM as a regular library:

```toml
[versions]
compose-bom = "2024.12.01"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
```

Notice that `compose-ui` and `compose-material3` don't have versions. In your `build.gradle.kts`, you import the BOM with `platform()` and then add the individual libraries without versions:

```kotlin
dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
}
```

The `platform()` wrapper tells Gradle to treat the BOM as a dependency constraint source — it provides versions but doesn't add any actual code to your classpath. The BOM's versions win over anything in the catalog for those specific artifacts. This is important: if you accidentally add a `version.ref` to `compose-ui` in your TOML file and it conflicts with the BOM's version, Gradle's standard version conflict resolution kicks in and picks the higher version. That can break compatibility if the BOM chose a lower version for a reason. IMO, when using a BOM, always leave the individual library versions out of the catalog to avoid conflicts.

The Firebase BOM works the same way. Declare `firebase-bom` with a version in the catalog, declare the individual Firebase libraries without versions, and import the BOM with `platform()` in each module that uses Firebase. One version to bump, all Firebase libraries stay in sync.

## Migration from buildSrc/ext

If your project currently uses `buildSrc` or `ext` blocks for dependency versions, you don't have to migrate everything at once. Version catalogs and legacy approaches can coexist during the transition. I've migrated three projects, and doing it gradually — one module per PR — is far less risky than a big-bang rewrite.

Here's the step-by-step process I follow. First, create `gradle/libs.versions.toml` with the four section headers. Then pick one library family — say, Coroutines — and move its version and coordinates into the TOML file. Update one module's `build.gradle.kts` to use the catalog accessor instead of the `buildSrc` reference. Run the build, run the tests, merge it. Repeat for the next library family.

```kotlin
// Before: buildSrc/src/main/kotlin/Dependencies.kt
object Versions {
    const val coroutines = "1.9.0"
    const val retrofit = "2.11.0"
}

object Deps {
    const val coroutinesCore =
        "org.jetbrains.kotlinx:kotlinx-coroutines-core:${Versions.coroutines}"
    const val coroutinesAndroid =
        "org.jetbrains.kotlinx:kotlinx-coroutines-android:${Versions.coroutines}"
    const val retrofit =
        "com.squareup.retrofit2:retrofit:${Versions.retrofit}"
}

// Usage in build.gradle.kts
dependencies {
    implementation(Deps.coroutinesCore)
    implementation(Deps.coroutinesAndroid)
}
```

```kotlin
// After: using version catalog
// gradle/libs.versions.toml handles all of this
// build.gradle.kts becomes:
dependencies {
    implementation(libs.coroutines.core)
    implementation(libs.coroutines.android)
}
```

Once every module references the catalog instead of `buildSrc`, delete the `Dependencies.kt` file (or the entire `buildSrc` directory if it only contained dependency declarations). The key benefit you'll notice immediately: bumping a version no longer triggers a full rebuild. With `buildSrc`, any change to `Dependencies.kt` invalidated the compiled `buildSrc` jar, which Gradle treated as a classpath dependency of every module. That meant a full reconfiguration and often a near-clean rebuild. With the TOML file, Gradle only invalidates what actually depends on the changed library.

For `ext` block migration, the process is even simpler. Find every `ext["someVersion"]` or `rootProject.extra["someVersion"]` reference, move the version into `[versions]`, define the library in `[libraries]`, and replace the string interpolation with a catalog accessor. The `ext` approach was always fragile — no type safety, no autocomplete, and a runtime `ClassCastException` if someone put the wrong type in the map. Version catalogs eliminate all of those failure modes.

One thing I'd warn about: if your `buildSrc` contains convention plugins (not just dependency constants), don't delete it. Move only the dependency declarations to the TOML file and keep the convention plugin logic in `buildSrc` or better yet, migrate it to a `build-logic` included build. The catalog handles versions; convention plugins handle build configuration. They solve different problems.

## Quiz

**1.** You have `compose-ui` declared in your TOML file without a version, and you import the Compose BOM with `platform()`. A teammate adds `version.ref = "compose"` to the `compose-ui` entry, pointing to a newer version than the BOM specifies. What happens?

**Wrong**: The BOM version always wins because `platform()` enforces its versions.

**Correct**: Gradle's standard conflict resolution picks the higher version. If the catalog version is higher, it overrides the BOM. This can break compatibility because the BOM chose specific versions for a reason — its libraries were tested together at those exact versions.

**2.** You define a bundle called `testing` in your TOML file. When you use `testImplementation(libs.bundles.testing)`, does the bundle add a single dependency or multiple?

**Wrong**: It adds a single aggregate dependency that contains all the bundled libraries.

**Correct**: The bundle expands to multiple individual `testImplementation` declarations — one per library in the bundle. Bundles are a build script convenience, not a packaging mechanism. The dependency graph is identical to writing each `testImplementation` line manually.

## Coding Challenge

Create a version catalog for a multi-module Android project that has three feature modules (`:feature:home`, `:feature:search`, `:feature:profile`). Your catalog should define versions for the Kotlin compiler, AGP, Compose BOM, Room, and Ktor (for networking instead of Retrofit). Define at least two bundles — one for Compose UI dependencies and one for Ktor networking. Then write the `dependencies` block for `:feature:search` that uses the Compose BOM, both bundles, and Room. Make sure Ktor and Room versions are centralized in `[versions]` and Compose library entries omit versions since they come from the BOM.

Thanks for reading!
