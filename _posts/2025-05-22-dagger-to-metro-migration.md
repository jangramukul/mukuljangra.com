---
title: From Dagger to Metro — A Migration Story
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Libraries
---

Every Android team I've worked on has had a complicated relationship with dependency injection. We know we need it — the alternative is manual service locators and constructor chains that make testing impossible. But the tooling around DI has always felt like it's fighting the language rather than working with it. I've been through the progression: manual injection, Dagger 1, Dagger 2, Dagger with Hilt, and most recently Dagger with Anvil. Each step solved real problems, but each also came with its own weight.

So when Cash App announced they'd completed a migration of their entire 1500-module Android project from Dagger and Anvil to Metro — Zac Sweers' compile-time DI framework — I paid close attention. Not because I follow hype, but because Cash App's engineering team doesn't make changes like this lightly. They built Anvil. They've been running Dagger at scale for years. If they're moving away, the reasons are worth understanding. And when I looked at the actual migration path, I realized this isn't just a Cash App story — it's a playbook any team on Dagger can study.

## Why Leave Dagger At All?

Here's the thing about Dagger that most people don't think about until it bites them: **Dagger is fundamentally a Java library.** Square (now Block) created it back in 2012, before Kotlin was even a thing on Android. Dagger 2, maintained by Google since 2018, uses Java annotation processing. On a Kotlin codebase, that means kapt — the Kotlin Annotation Processing Tool — which acts as a bridge between Kotlin's compiler and Java's annotation processor infrastructure.

This creates a build pipeline that's more complex than it needs to be. Your Kotlin code gets compiled, stubs get generated for Java's annotation processor to read, Dagger's processor runs and generates Java code, and then that Java code gets compiled by javac. For a small project, this overhead is negligible. For Cash App's 1500-module monorepo? Every unnecessary compiler pass adds up.

But the build speed wasn't the only issue. Kotlin 2.0 shipped with K2 — the next-generation compiler with significantly better performance and IDE integration. Cash App had upgraded to Kotlin 2.0 but couldn't enable K2 because Anvil, which is a Kotlin compiler plugin, didn't support it yet. They were stuck on language version 1.9, missing out on K2's improvements. Anvil's team was working on K2 support, but as Metro gained traction and internal evaluations showed it aligned better with their long-term vision, they made the call. Anvil moved to maintenance mode, and the migration to Metro began.

## What Metro Actually Is

Metro, created by Zac Sweers, is a compile-time dependency injection framework implemented as a Kotlin compiler plugin. That distinction matters. Unlike Dagger, which runs as a separate annotation processing step, Metro hooks directly into Kotlin's FIR and IR compilation phases. There's no kapt, no Java stub generation, no separate javac pass. Your DI graph gets resolved and validated as part of the normal Kotlin compilation, which is fundamentally simpler and faster.

Metro draws heavy inspiration from Dagger, Anvil, and kotlin-inject, unifying their best features under one framework. It supports multiplatform (JVM, JS, WASM, Native), has Anvil-style aggregation with `@ContributesTo` and `@ContributesBinding`, and offers features like optional dependencies through Kotlin default parameters and top-level function injection that none of the older frameworks support. But here's what I think is the real insight about Metro: **it's not a replacement for Dagger — it's what Dagger would be if it were designed for Kotlin from scratch.** The annotations look familiar, the mental model is the same, but the implementation is native to the language instead of fighting it through an annotation processing bridge.

Metro ships with comprehensive interop tooling that can understand Dagger and Anvil annotations during a migration period. This interop capability was the key that made Cash App's migration possible without a big-bang rewrite.

## What Changes, What Stays

Before getting into the migration path, it helps to understand the annotation mapping between the two frameworks. Metro's core annotations map cleanly to Dagger and Anvil concepts. `@Component` becomes `@DependencyGraph`. `@Component.Factory` becomes `@DependencyGraph.Factory`. `@Module` becomes `@BindingContainer`. `@BindsInstance` becomes `@Provides` on factory parameters. `@Subcomponent` becomes `@GraphExtension`.

But here's the key thing: **with interop enabled, you don't have to change any of these annotations immediately.** Metro can be configured to understand Dagger's `@Inject`, `@Provides`, `@Component`, `@Binds`, and Anvil's `@ContributesTo`, `@ContributesBinding` natively. The interop configuration is straightforward:

```kotlin
metro {
    interop {
        includeDagger(includeJavax = true, includeJakarta = false)
        includeAnvil(
            includeDaggerAnvil = true,
            includeKotlinInjectAnvil = false,
        )
    }
}
```

This means your existing `@Inject` constructors, your `@Provides` methods, your `@ContributesTo` modules — they all keep working. The migration is about fixing the places where Metro's stricter validation catches things Dagger silently accepted, not about rewriting every annotation in your codebase. Cash App ran their entire 1500-module codebase on Metro's interop mode before touching a single annotation.

## The Migration Path

Cash App's approach was methodical, and I think it's the right template for any team considering this migration. Here's the order of operations.

### Step 1: Set Up the Dual Build

Instead of migrating everything at once and hoping for the best, Cash App set up a dual-build system controlled by a single Gradle property. This is the most important architectural decision of the entire migration — it gives you a rollback path:

```kotlin
// gradle.properties
mad.di=AnvilDagger // Or Metro
```

The actual switching logic lived in a convention plugin. Instead of copy-pasting Gradle setup into 1500 `build.gradle` files, one plugin handles it:

```kotlin
class BaseDependencyInjectionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        val diImplementation = providers.gradleProperty("mad.di")
            .getOrElse("AnvilDagger")

        when (diImplementation) {
            "AnvilDagger" -> {
                pluginManager.apply(ANVIL_PLUGIN)
                dependencies.add("api", libs.dagger.runtime)
            }
            "Metro" -> {
                pluginManager.apply(METRO_PLUGIN)
                with(extensions.getByType(MetroPluginExtension::class.java)) {
                    interop.includeDagger(
                        includeJavax = true,
                        includeJakarta = false,
                    )
                    interop.includeAnvil(
                        includeDaggerAnvil = true,
                        includeKotlinInjectAnvil = false,
                    )
                }
            }
        }
    }
}
```

They also conditionally lifted the Kotlin language version pin. When building with Anvil, they were locked to language version 1.9. When building with Metro, that restriction was removed, enabling K2:

```kotlin
tasks.withType(KotlinCompilationTask::class.java).configureEach { task ->
    if (diImplementation == "AnvilDagger") {
        task.compilerOptions.languageVersion.set(KotlinVersion.KOTLIN_1_9)
    }
}
```

### Step 2: Set Up CI in Both Modes

Cash App set up separate CI shards building the app with both `AnvilDagger` and `Metro`, regardless of which was currently the default. You can't feature-flag a DI framework at runtime — the decision happens at build time — so having both pipelines running simultaneously was their rollback strategy. They actually caught regressions from overly eager post-K2 cleanup this way, so the dual CI paid for itself.

### Step 3: Fix What Metro's Validation Catches

This is where the actual work happens. Metro's validation is stricter than Dagger's in several specific places, and each difference requires targeted fixes. I'll cover the common issues in the next section.

### Step 4: Handle Graph Instantiation

The one area where code has to differ between the two builds is actual graph creation. Cash App used conditional source sets for this:

```kotlin
// src/metro/kotlin/.../factories.kt
internal fun appComponentFactory(): AppComponent.Factory {
    return createGraphFactory()
}

// src/anvilDagger/kotlin/.../factories.kt
internal fun appComponentFactory(): AppComponent.Factory {
    return DaggerAppComponent.factory()
}
```

### Step 5: Roll Out and Clean Up

Once both builds were green, Cash App flipped the default property to Metro, submitted the Metro-flavored build to the Play Store, and monitored. After a smooth rollout, they began gradually migrating to Metro's native annotations and disabling interop.

## Common Migration Issues

Getting the dual build working wasn't as simple as flipping a plugin. Here are the issues Cash App hit that I think most teams will encounter too.

### Duplicate Module Includes

Anvil's `@ContributesTo(Scope::class)` is an alternative to Dagger's `@Module(includes = ...)`, but over time some modules ended up with both — the `@ContributesTo` annotation and an explicit `includes` clause in an aggregator module. Dagger tolerated this duplication silently. Metro flags it as a module being added to the graph twice. The fix is straightforward: remove the redundant `includes` clauses and keep the `@ContributesTo` annotations.

### Component.Builder to Component.Factory

Metro's interop turns Dagger `@Component`s into `@DependencyGraph`s, but there's no equivalent of `@Component.Builder` in Metro. There is `@DependencyGraph.Factory`, which maps to `@Component.Factory`. The conversion is mechanical:

```kotlin
// Before: Component.Builder
@Component
interface AppComponent {
    @Component.Builder
    interface Builder {
        @BindsInstance fun refWatcher(refWatcher: RefWatcher): Builder
        @BindsInstance fun application(app: Application): Builder
        fun build(): AppComponent
    }
}

// After: Component.Factory
@Component
interface AppComponent {
    @Component.Factory
    fun interface Factory {
        fun create(
            @BindsInstance refWatcher: RefWatcher,
            @BindsInstance app: Application,
        ): AppComponent
    }
}
```

This is arguably a cleaner API anyway. The builder pattern adds ceremony — separate setter methods, a `build()` call — that a factory's single `create` method eliminates.

### Scoping on @Binds Declarations

This one revealed a subtle design improvement. In Dagger, you can put scoping annotations like `@SingleIn` on a `@Binds` method. Metro disallows this, and for a good reason: `@Binds` declarations should only map an implementation to an interface, nothing more. The scope belongs on the implementation class itself:

```kotlin
// Before: scope on @Binds method
@Module
@ContributesTo(AppScope::class)
abstract class SettingsStoreModule {
    @Binds
    @SingleIn(AppScope::class)
    abstract fun bindSettingsStore(real: RealSettingsStore): SettingsStore
}

// After: scope on the implementation
@SingleIn(AppScope::class)
class RealSettingsStore @Inject constructor() : SettingsStore
```

Both approaches work identically in Dagger. But Metro's stricter validation enforces cleaner separation — the scope is a property of the implementation, not of the binding declaration. IMO this is how it should have always been.

### Nullable Type Mismatches

This is the one that surprised me most. Cash App found a "surprisingly large number of bindings that returned nullable types for non-nullable injection sites and vice versa." Dagger silently accepted these because Java doesn't distinguish nullable from non-nullable types. Metro honors Kotlin's type system properly, so it caught every mismatch. Each one was a potential `NullPointerException` source hiding in the graph.

### Direct Calls to @Provides Methods

Cash App had test code calling `@Provides` methods directly on module objects. Metro doesn't allow this because as a compiler plugin, it needs the freedom to rewrite DI definitions for optimization. The fix was splitting bindings into a regular method containing the logic and a `@Provides` wrapper:

```kotlin
object NetworkingModule {
    fun okHttpClient(): OkHttpClient = OkHttpClient.Builder().build()

    @Provides
    fun provideOkHttpClient(): OkHttpClient = okHttpClient()
}
```

### @ClassKey to Custom Map Keys

Metro interops with `@ClassKey`, but since it's a Kotlin framework, it generates maps with `KClass` keys instead of Java's `Class` keys. Cash App couldn't support both in the dual-build setup, so they replaced `@ClassKey` with custom enum-based map keys. The result was more verbose but also more type-safe — the number of possible keys is bounded by the enum.

## The Results

After a few weeks of iterative code modifications, Cash App got their codebase building in both modes with zero code changes between them. They ran extensive regression testing with parallel CI shards and gradually rolled out.

The numbers from Cash App's benchmarks tell the story. Clean build speeds improved by over 16%, with raw compilation dropping from 242.97 seconds to 202.49 seconds. But the incremental build improvements were dramatic — ABI changes went from 28.77 seconds to 11.93 seconds, a 58.5% reduction. Non-ABI changes dropped from 17.45 seconds to 7.15 seconds, a 59% reduction. For a team making changes across 1500 modules every day, those seconds add up to hours of reclaimed productivity.

Metro's own benchmarks against a generated 500-module project tell an even more dramatic story for ABI changes specifically. Metro completed ABI-change builds in 17.5 seconds compared to Dagger with KSP at 119.6 seconds — an 80-85% improvement. Non-ABI changes were closer, with Metro and kotlin-inject both around 11.5 seconds and Dagger KSP at 13.8 seconds. The outlier was Dagger with kapt at 23.2 seconds for non-ABI changes, since kapt still has to run stub generation and annotation processing even when it could be avoided.

Cash App wasn't alone either. Gabriel Ittner from Freeletics reported 40-55% faster ABI change builds across their 551 modules. BandLab saw ABI incremental builds go from 59.7 seconds to 26.9 seconds across 929 modules. Madis Pink from emulator.wtf said `./gradlew classes` from clean became roughly 4x faster after migrating from Anvil.

Beyond raw speed, Cash App achieved three things that mattered architecturally. First, kapt is gone — no more Java stub generation, no more annotation processing as a separate build phase. Second, K2 is enabled, bringing the latest Kotlin compiler improvements. Third, Metro's stricter validation caught real bugs — nullable type mismatches, duplicate modules, dead code — that Dagger had been silently accepting for years.

## What This Means For the Rest of Us

I want to be honest about something. Most Android teams are not Cash App. Most of us don't have 1500 modules. Most of us aren't blocked by kapt's build overhead or Anvil's K2 support. For a 20-module app with a team of 5, Dagger with Hilt works fine and will continue to work fine for years.

But the direction is clear. The Android ecosystem is moving toward Kotlin-first tooling — KSP over kapt, Kotlin compiler plugins over Java annotation processors, K2 as the default compiler. Dagger is a Java library being used in a Kotlin world, and that impedance mismatch will only grow. Metro represents what DI looks like when it's designed for Kotlin from the ground up, and Cash App's migration proves it can work at massive scale.

Our team hasn't migrated yet, but we've started evaluating Metro for new modules. The interop story makes it possible to adopt incrementally — you don't have to rewrite everything on day one. And honestly, after reading about Cash App's experience, the thing that excites me most isn't the build speed improvement. It's the stricter validation catching bugs that were hiding in our Dagger graph all along. That's the part I didn't expect — a DI migration that actually finds production-grade issues in code that's been "working" for years.

Thanks for reading!
