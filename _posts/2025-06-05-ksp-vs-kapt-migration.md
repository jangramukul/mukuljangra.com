---
title: KSP vs KAPT — Why You Should Migrate Today
layout: post
categories: post
tags:
  - Kotlin
  - Gradle
  - Performance
---

Last year I migrated a mid-sized Android project from KAPT to KSP. Clean debug builds dropped from around 4 minutes to just under 2 minutes. Incremental builds — the ones you actually feel during development — went from 45 seconds after a single-file change to about 20. But here's the thing: the performance win isn't even the most important reason to migrate. KAPT is actively blocking your path to the K2 compiler, and every month you delay, the migration debt compounds.

I put off this migration for months because I assumed it would be a weekend of debugging obscure annotation processor failures. It ended up being about two hours for the main module, and most of that was reading documentation, not fixing bugs. If your project uses Room, Hilt, and Moshi — which covers a huge chunk of Android apps — you can migrate today with almost no friction. The libraries have done the hard work already.

So why did I wait so long? Same reason you probably are: "It's working, don't touch it." But once you understand what KAPT is actually doing behind your back every single build, you'll wonder why you didn't migrate sooner.

## How KAPT Actually Works

To understand why KSP is faster, you need to understand what KAPT does under the hood. And honestly, once you see it, you might be a little horrified.

KAPT — Kotlin Annotation Processing Tool — exists because of a fundamental incompatibility: Java annotation processors (JSR 269) only understand Java code, but your source code is Kotlin. KAPT's solution is a workaround. Before any annotation processing happens, the Kotlin compiler runs a partial compilation pass that generates `.java` stub files for every Kotlin class that might be relevant. These stubs contain the class structure — methods, fields, annotations — but no implementation bodies. Then, standard Java annotation processors run against these stubs as if they were real Java source files.

Imagine you wrote an essay in French, but your editor only reads English. So before the editor can review it, someone has to translate the entire essay into English — not just the paragraphs the editor cares about, *the whole thing*. The editor marks up the English version, and then you have to reconcile those edits back into your French original. That's KAPT. Every. Single. Build.

This stub generation phase is where the cost lives. According to the [official KSP documentation](https://kotlinlang.org/docs/ksp-why-ksp.html), stub generation alone costs roughly one-third of a full `kotlinc` analysis — roughly the same order as `kotlinc` code generation itself. For a module with 200 Kotlin files, KAPT generates 200 corresponding Java stubs, even if only 10 of those files have annotations that any processor cares about. The stub generator can't know which files are relevant, so it processes everything. You're effectively paying for an extra compilation pass before annotation processing even begins.

There's a practical cost beyond raw time. KAPT generates stub files that sometimes linger from previous builds. When incremental compilation tries to reuse cached stubs, it occasionally picks up stale versions, leading to cryptic compilation errors that vanish after `./gradlew clean`. If you've ever had clean builds succeed while incremental builds fail with impossible errors about missing generated types, stale KAPT stubs were probably the cause. Yeah — those ghost errors that make you question your sanity? Stale stubs.

## What KSP Is and How It Differs

KSP — Kotlin Symbol Processing — is a Google-built API for developing lightweight compiler plugins. Rather than generating Java stubs and running Java annotation processors against them, KSP plugs directly into the Kotlin compiler and provides processors with a structured symbol graph of your Kotlin code. Classes, functions, properties, annotations, type parameters — a KSP processor sees all of these as first-class Kotlin symbols through the `Resolver` API. No Java translation layer in between.

Going back to our essay analogy — KSP is like hiring an editor who actually reads French. No translation step, no intermediate artifacts, no stale copies floating around. The editor reads your original work directly and gives feedback in the same language.

This is a fundamental architectural difference, not just an optimization. KAPT delegates to `javac` and forces everything through a Java lens. Kotlin-specific features like extension functions, sealed classes, `value` classes, declaration-site variance, and `suspend` functions are awkward or impossible to represent accurately in Java stubs. KSP understands these natively because it operates on Kotlin's own symbol model — conceptually similar to `kotlin.reflect.KType`, but resolved at compile time.

The performance numbers follow directly from the architecture. The [official KSP benchmarks](https://kotlinlang.org/docs/ksp-why-ksp.html) show that for a simplified Glide processor running against the Tachiyomi project, KAPT took 8.67 seconds while the KSP implementation took 1.15 seconds — with a total Kotlin compilation time of 21.55 seconds. That's roughly a 7.5x speedup for the processing step itself. In practice, across typical Room and Dagger workloads, the overall build improvement is around 2x because stub generation was the dominant cost and KSP eliminates it entirely.

> **💡 The "aha" moment:** KSP isn't a "faster version of KAPT." It's a completely different approach — it skips the entire Java translation layer that made KAPT slow in the first place. You can't optimize a detour; you eliminate it.

### Incremental Processing Done Right

The day-to-day impact shows up most in incremental builds. KAPT's incremental support has always been fragile. Many annotation processors don't properly declare their incremental behavior, so Gradle falls back to full reprocessing on any source change. KSP was designed with incremental processing as a first-class concern.

KSP uses a dependency model with two categories: **isolating** outputs that depend only on their declared source files, and **aggregating** outputs that may depend on any input. A Room DAO processor, for example, generates an implementation class for each `@Dao` interface — that's isolating. If you change `PaymentDao.kt`, only its generated implementation gets reprocessed. The `UserDao` output is untouched. KAPT's stub generation can't be this selective because it regenerates stubs for every file in the module regardless of what changed.

It's like the difference between repainting one wall versus repainting the entire house every time you get a scratch. KAPT repaints the house. KSP repaints the wall.

## Build Time Comparison

The 2x improvement I mentioned isn't a theoretical number — it came from actual Gradle build scans before and after migration. On a project with 15 modules, 3 of which used annotation processing heavily (Room, Moshi, Hilt), the numbers broke down like this. Clean debug builds went from ~4 minutes to ~2 minutes. Incremental builds after touching a single file in an annotated module dropped from ~45 seconds to ~20 seconds. The `kaptGenerateStubs` task, which was consistently one of the slowest tasks in the build, simply disappeared from the timeline.

Gone. Just... gone from the build scan.

The incremental improvement matters more than the clean build improvement because you run incremental builds hundreds of times a day. Saving 25 seconds per build across a team of five engineers doing 50 builds each per day adds up to over 100 minutes of recovered engineering time daily. That's not theoretical productivity math — it's real time you spend staring at the build output instead of writing code.

## The K2 Compiler Blocker

Here's what makes this migration urgent rather than just nice-to-have: **KAPT is incompatible with the K2 compiler**. If your project uses KAPT, you're pinned to `languageVersion = "1.9"`. You cannot adopt K2, which means you miss out on faster compilation, better type inference, smarter smart casts, and the new compiler frontend that JetBrains is building all future Kotlin features on top of.

Starting with Kotlin 2.0, K2 is the default compiler. JetBrains has stated that the old compiler frontend will eventually be deprecated. KAPT has a compatibility mode that keeps old projects building, but it forces you onto a legacy code path that won't receive new optimizations. I know teams that wanted to adopt K2 for its compile-time improvements but couldn't because a single KAPT dependency in one module held the entire project back. One module. In a multi-module project, one module using KAPT forces every module to stay on the legacy compiler.

KSP is fully compatible with K2 because it was designed to work with Kotlin's compiler infrastructure directly. The K2 transition is seamless for KSP processors. This is the reframe: **the KSP migration isn't really about build speed — it's about unblocking the K2 compiler, which itself gives you build speed, better language features, and a path forward that KAPT permanently blocks.**

> **🧠 Think about it:** If KAPT is going away and K2 is the future, every day you stay on KAPT isn't "keeping things stable" — it's accumulating debt. What's the cost of migrating now versus being forced to migrate later when you're also trying to adopt a new Kotlin version?

## Migrating Room, Moshi, and Hilt

For most Android projects, the migration is straightforward because the major libraries already support KSP. The pattern is almost boringly consistent: swap one word in your build file, run tests, move on.

### Room

Room has had full KSP support since version 2.4. It was one of the first major Jetpack libraries to adopt KSP, and Google's own sample apps use the KSP configuration. The migration is a build file change — nothing in your Kotlin source code changes:

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

Replace the `kapt` plugin with `ksp`, change `kapt(...)` to `ksp(...)` in your dependencies. Your `@Dao`, `@Entity`, and `@Database` annotations work identically — Room's KSP processor generates the same output as the KAPT one.

### Moshi

Moshi has KSP support through `moshi-kotlin-codegen`. The artifact name doesn't change — swap the configuration from `kapt` to `ksp`:

```kotlin
// BEFORE
kapt("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")

// AFTER
ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.0")
```

Zac Sweers, who maintains Moshi, was an early KSP advocate and built the KSP support alongside the KAPT version. The processor output is identical — your `@JsonClass(generateAdapter = true)` annotations continue to work without changes.

### Hilt and Dagger

This one requires a note of caution. Dagger's KSP support is currently in **alpha** according to the [official Dagger documentation](https://dagger.dev/dev-guide/ksp). It works, and many teams are using it in production, but it's not at the same maturity level as Room or Moshi's KSP support:

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

One important gotcha: **KSP processors cannot resolve types generated by other KAPT processors**. If you have a KAPT processor generating classes that Hilt needs to inject, both processors must be on KSP. The `androidx.hilt:hilt-compiler` also needs to be migrated to the `ksp` configuration — KSP support is available from version 1.1.x. Test thoroughly after migration, especially in multi-module setups with complex component hierarchies.

## Library Support Status

The ecosystem has moved fast. Here's where the major libraries stand:

- **Room** — full KSP support since 2.4, stable and production-ready
- **Moshi** — full KSP support, same artifact, just swap the configuration
- **Glide** — full KSP support, [officially supported](https://github.com/bumptech/glide)
- **Koin Annotations** — full KSP support
- **Dagger/Hilt** — KSP support in alpha, works but not yet stable
- **Epoxy** (Airbnb) — full KSP support
- **Ktorfit** — full KSP support
- **AutoFactory** — not yet supported, still requires KAPT

IMO, for most Android projects, Room and Moshi alone cover the majority of annotation processing needs. If those are your only KAPT dependencies, you can migrate completely today.

## Mixed KAPT + KSP Setup

Not every annotation processor has a KSP equivalent yet. If your project depends on a library that still requires KAPT, you can run both side by side in the same module. This is a transitional setup, not a permanent solution:

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

The build performance benefit is reduced in this configuration because KAPT still runs its stub generation phase for the remaining processors. But every processor you move to KSP is one less running through the stub pipeline, so there's still a measurable improvement. The key thing to understand: **as long as even one `kapt(...)` dependency exists in a module, that module pays the full stub generation cost.** This means migrating 3 out of 4 processors to KSP helps, but you only get the full benefit when the last one is gone.

> **🔥 Real talk:** I've seen teams celebrate migrating Room and Moshi to KSP, only to wonder why their builds aren't much faster. Then they check — one lonely `kapt("com.some.legacy:processor:1.0")` is still there, forcing stub generation for the entire module. One holdout ruins the party.

This mixed mode also doesn't solve the K2 blocker. You need zero KAPT dependencies across your entire project before K2 becomes an option.

## The Future: Compiler Plugins

Both KAPT and KSP are annotation processing tools — they inspect annotations and generate code. But a newer category of tools skips this model entirely: **Kotlin compiler plugins**.

Jetpack Compose is the most prominent example. The Compose compiler plugin runs as part of the Kotlin compiler itself, transforming `@Composable` functions at the IR (intermediate representation) level. There's no separate processing step, no generated files sitting in `build/generated`, no incremental processing to manage. The transformation is part of compilation itself.

Metro, a DI framework from the Slack team built by Zac Sweers, takes the same approach. Instead of using annotation processing to generate Dagger-like components, Metro resolves dependency injection graphs and generates code as a compiler pass. The motivation was explicit — even KSP adds overhead that a compiler plugin can avoid entirely. The K2 compiler's plugin API is more powerful and stable than the old one, so more libraries will move to compiler plugins over time.

If annotation processing is like hiring an external editor to review your code, compiler plugins are like teaching the compiler itself to understand your intent. No handoff, no intermediary, no generated artifacts to manage. KSP is the bridge between the annotation processing world and the compiler plugin future. KAPT is the past.

## My Migration Checklist

When I migrate a project, I follow this order to minimize risk. First, audit every `kapt(...)` dependency in your build files and check if a KSP equivalent exists — Room, Moshi, Hilt, and Glide all have one. Second, migrate one module at a time, starting with the module that has the fewest KAPT dependencies. Run the full test suite after each module. Third, once a module has zero `kapt(...)` dependencies, remove the `kotlin-kapt` plugin from that module's build file entirely — don't leave it applied with nothing to process, because it still adds overhead from initializing the stub generation infrastructure. Fourth, when every module is free of KAPT, try enabling K2 by removing the `languageVersion = "1.9"` constraint and running a full build.

The biggest lesson from my migration: the hardest part was deciding to start. The actual changes were mechanical — find `kapt`, replace with `ksp`, run tests, verify. The libraries have done the work to make this seamless. IMO, if you're still on KAPT for libraries that already support KSP, you're paying a build-time tax and accumulating K2 migration debt for no good reason. The migration path is clear, the tooling is ready, and the benefits — faster builds, K2 enablement, fewer stale stub headaches — are immediate.

Thanks for reading!
