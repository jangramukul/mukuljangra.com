---
title: KSP vs KAPT — Why You Should Migrate Today
layout: post
categories: post
tags:
  - Kotlin
  - Gradle
  - Performance
---

Last year I migrated a mid-sized project from KAPT to KSP, and the build times dropped from around 4 minutes to just under 2 minutes for a clean debug build. The incremental builds improved even more — what used to take 45 seconds after a single-file change came down to about 20. But the performance win isn't even the most compelling reason to migrate. The real urgency is that KAPT is actively blocking your adoption of the K2 compiler, and the longer you wait, the more painful the eventual migration becomes.

I'll be honest — I put off this migration for months because I assumed it would be a weekend-long ordeal of fixing obscure annotation processor issues. It ended up being about two hours for the main module. Most of that time was reading documentation, not fixing bugs. If your project uses Room, Hilt, and Moshi — which covers a huge percentage of Android apps — you can migrate today with minimal friction.

## How KAPT Actually Works (And Why It's Slow)

To understand why KSP is faster, you need to understand what KAPT does under the hood. KAPT stands for Kotlin Annotation Processing Tool, and its core mechanism is a workaround for a fundamental incompatibility: Java annotation processors (JSR 269) only understand Java code, but your code is written in Kotlin.

KAPT's solution is generating Java stubs. Before any annotation processing happens, the Kotlin compiler runs a partial compilation pass that generates `.java` stub files for every Kotlin class that might be relevant to annotation processing. These stubs contain the class structure — methods, fields, annotations — but no implementation. Then, standard Java annotation processors run against these stubs as if they were real Java source files.

This stub generation phase is expensive. For a module with 200 Kotlin files, KAPT generates 200 corresponding Java stubs, even if only 10 of those files have annotations that any processor cares about. The stub generator doesn't know which files are relevant, so it processes everything. And because it runs as part of the Kotlin compiler, it effectively adds a full compilation pass before annotation processing even begins.

There's another cost: KAPT runs annotation processors in a separate JVM process. The communication overhead between the Kotlin compiler and the annotation processor adds latency, and the processor's JVM needs its own warmup time. In large projects with multiple modules, you're paying this cost for every module that uses KAPT.

The kotlin daemon stale files problem makes this worse in practice. KAPT generates stub files that sometimes linger from previous builds. When the incremental compilation tries to reuse cached stubs, it occasionally picks up stale versions, leading to cryptic compilation errors that disappear with a clean build. If you've ever run `./gradlew clean` as your first debugging step, KAPT's stale stubs were probably the root cause at least some of those times.

## How KSP Works Differently

KSP — Kotlin Symbol Processing — takes a fundamentally different approach. Instead of generating Java stubs and running Java annotation processors, KSP works directly with Kotlin's compiler symbols. A KSP processor receives a structured representation of your Kotlin code — classes, functions, properties, annotations — as a Kotlin symbol graph. No Java translation needed.

This design eliminates the stub generation pass entirely. KSP doesn't need to convert your Kotlin code to Java because it never leaves the Kotlin world. The processor sees Kotlin code as Kotlin, including Kotlin-specific features like extension functions, sealed classes, inline classes, and suspend functions that are awkward or impossible to represent accurately in Java stubs.

The performance difference is significant. In my experience, KSP is roughly 2x faster than KAPT for annotation-heavy modules. Google's own benchmarks show similar numbers — 2x or more improvement for typical Room and Dagger usage. The gains come from two places: eliminating stub generation (which was effectively a full compilation pass) and more efficient incremental processing. KSP tracks which files are affected by code changes and only reprocesses those files, while KAPT tends to rerun the full stub generation even for small changes.

The incremental processing is where KSP really shines in day-to-day development. KAPT's incremental support is fragile — many annotation processors don't properly declare their incremental behavior, so Gradle falls back to full reprocessing. KSP was designed with incremental processing as a first-class concern. Processors explicitly declare whether they depend on specific files or the entire module, and KSP only re-invokes them when their declared inputs change.

## The K2 Compiler Blocker

Here's the thing that makes this migration urgent rather than just nice-to-have: **KAPT is incompatible with the K2 compiler**. If your project uses KAPT, you must keep `languageVersion = "1.9"` in your Kotlin compiler settings. You cannot adopt K2, which means you miss out on the K2 compiler's substantial improvements — faster compilation, better type inference, smarter smart casts, and the new compiler frontend that JetBrains is building all future Kotlin features on.

Starting with Kotlin 2.0, K2 is the default compiler. JetBrains has stated that the old compiler frontend will eventually be deprecated. KAPT compatibility mode exists to keep old projects working, but it forces you onto a legacy code path that won't receive new optimizations or features. Every month you stay on KAPT is another month of accumulating migration debt.

KSP, on the other hand, is fully compatible with K2. It was designed to work with Kotlin's compiler infrastructure directly, so the K2 transition is seamless for KSP processors. This isn't just a theoretical concern — I know teams that wanted to adopt K2 for its compile-time improvements but couldn't because one KAPT dependency held them back. In a 15-module project, a single module using KAPT forces the entire project to stay on the legacy compiler path.

## The Migration Path

For most Android projects, the migration is straightforward because the major libraries already have KSP support.

**Room** has full KSP support and has had it since Room 2.4. Room was actually one of the first major libraries to adopt KSP, and Google's own samples use the KSP configuration. The migration is a build file change:

```kotlin
// build.gradle.kts — BEFORE (KAPT)
plugins {
    id("org.jetbrains.kotlin.kapt")
}

dependencies {
    implementation("androidx.room:room-runtime:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
}
```

```kotlin
// build.gradle.kts — AFTER (KSP)
plugins {
    id("com.google.devtools.ksp") version "2.1.10-1.0.29"
}

dependencies {
    implementation("androidx.room:room-runtime:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
}
```

That's it. Replace the `kapt` plugin with `ksp`, change `kapt(...)` to `ksp(...)` in your dependencies. Room's KSP processor generates the same output as the KAPT processor, so your `@Dao`, `@Entity`, and `@Database` annotations work identically.

**Moshi** has KSP support through `moshi-kotlin-codegen`. Replace `kapt("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")` with `ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")`. Same artifact, just swap the configuration. Zac Sweers (who maintains Moshi) was an early advocate of KSP and built the KSP support alongside the KAPT version.

**Hilt** added KSP support as well. The migration requires updating to the latest Hilt version and switching the annotation processor:

```kotlin
// build.gradle.kts — Hilt with KSP
plugins {
    id("com.google.devtools.ksp") version "2.1.10-1.0.29"
    id("dagger.hilt.android.plugin")
}

dependencies {
    implementation("com.google.dagger:hilt-android:2.54")
    ksp("com.google.dagger:hilt-android-compiler:2.54")
}
```

One important gotcha with Hilt's KSP migration: if you have custom `@EntryPoint` interfaces or complex multi-module setups, test thoroughly. The KSP processor is functionally equivalent, but I've seen edge cases where argument passing in deeply nested component hierarchies behaved slightly differently during the initial migration. A full test suite run after migration is essential.

## When You Can't Migrate (Yet)

Not every annotation processor has a KSP equivalent. Some older or less maintained libraries still require KAPT. If your project depends on one of these, you have a few options.

You can run KAPT and KSP side by side in the same module. This isn't ideal — you're paying the KAPT stub generation cost for the remaining KAPT processors — but it lets you migrate the libraries you can while keeping the ones you can't. Migrate Room, Moshi, and Hilt to KSP, leave the remaining processor on KAPT, and remove KAPT entirely when the last dependency gets KSP support.

```kotlin
// build.gradle.kts — Mixed KAPT + KSP (transitional)
plugins {
    id("org.jetbrains.kotlin.kapt")
    id("com.google.devtools.ksp") version "2.1.10-1.0.29"
}

dependencies {
    ksp("androidx.room:room-compiler:2.6.1")
    ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")
    kapt("com.some.legacy:annotation-processor:1.0.0")
}
```

The build performance benefit is reduced in this configuration because KAPT still runs its stub generation phase. But any processor you move to KSP is one less that runs through the stub pipeline, so there's still a measurable improvement.

## The Future: Compiler Plugins Skip Both

Here's a broader perspective that I think is worth understanding. Both KAPT and KSP are annotation processing tools — they run after (or during) compilation, inspect annotations, and generate code. But a newer category of tools skips this model entirely: **compiler plugins**.

Jetpack Compose is the most prominent example. The Compose compiler plugin runs as part of the Kotlin compiler itself. It doesn't process annotations in the traditional sense — it transforms `@Composable` functions at the IR (intermediate representation) level, rewriting them into state-tracking code. There's no separate processing step, no generated files in a `build/generated` directory, no incremental processing to worry about. The transformation is part of compilation.

Metro, a DI framework from the Slack team built by Zac Sweers, takes the same approach. Instead of using annotations processed by KAPT or KSP to generate Dagger-like components, Metro is a compiler plugin that does dependency injection graph resolution and code generation as a compiler pass. The motivation was explicit — annotation processing, even KSP, adds overhead and complexity that a compiler plugin can avoid entirely.

This is the trajectory of the Kotlin ecosystem. The K2 compiler's plugin API is more powerful and stable than the old one, which means more libraries will move to compiler plugins over time. KSP is the right choice today — it's the bridge between the annotation processing world and the compiler plugin future. KAPT is the past.

## My Migration Checklist

When I migrate a project, I follow this order to minimize risk. First, audit every `kapt(...)` dependency in your build files and check if a KSP equivalent exists. Room, Moshi, Hilt, and Glide all have KSP support. Second, migrate one module at a time, starting with the module that has the fewest KAPT dependencies. Run the full test suite after each module. Third, once a module has zero `kapt(...)` dependencies, remove the `kotlin-kapt` plugin from that module's build file. Don't leave it applied with nothing to process — it still adds overhead. Fourth, when every module is free of KAPT, try enabling K2 by removing the `languageVersion = "1.9"` constraint and running a full build.

The biggest lesson from my migration was that the hardest part was deciding to start. The actual code changes were mechanical — find `kapt`, replace with `ksp`, run tests. The libraries have done the work to make this seamless. IMO, if you're still on KAPT for libraries that already support KSP, you're paying a build-time tax and accumulating K2 migration debt for no reason.

Thanks for reading!
