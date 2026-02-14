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

So when Cash App announced they'd completed a migration of their entire 1500-module Android project from Dagger and Anvil to Metro — Zac Sweers' new compile-time DI framework — I paid close attention. Not because I follow hype, but because Cash App's engineering team doesn't make changes like this lightly. They built Anvil. They've been running Dagger at scale for years. If they're moving away, the reasons are worth understanding.

## Why Leave Dagger At All?

Here's the thing about Dagger that most people don't think about until it bites them: **Dagger is fundamentally a Java library.** It was created at Square (now Block) back in 2012, before Kotlin was even a thing on Android. Dagger 2, maintained by Google since 2018, uses Java annotation processing. On a Kotlin codebase, that means kapt — the Kotlin Annotation Processing Tool — which acts as a bridge between Kotlin's compiler and Java's annotation processor infrastructure.

This creates a build pipeline that's more complex than it needs to be. Your Kotlin code gets compiled, stubs get generated for Java's annotation processor to read, Dagger's processor runs and generates Java code, and then that Java code gets compiled by javac. For a small project, this overhead is negligible. For Cash App's 1500-module monorepo? Every unnecessary compiler pass adds up.

But the build speed wasn't the only issue. Kotlin 2.0 shipped with K2 — the next-generation compiler with significantly better performance and IDE integration. Cash App had upgraded to Kotlin 2.0 but couldn't enable K2 because Anvil, which is a Kotlin compiler plugin, didn't support it yet. They were stuck on language version 1.9, missing out on K2's improvements. Anvil's team was working on K2 support, but as Metro gained traction and internal evaluations showed it aligned better with their long-term vision, they made the call. Anvil moved to maintenance mode, and the migration to Metro began.

## What Metro Actually Is

Metro, created by Zac Sweers, is a compile-time dependency injection framework implemented as a Kotlin compiler plugin. That distinction matters. Unlike Dagger, which runs as a separate annotation processing step, Metro runs during Kotlin compilation itself. There's no kapt, no Java stub generation, no separate javac pass. Your DI graph gets resolved and validated as part of the normal Kotlin compilation, which is fundamentally simpler and faster.

Metro draws heavy inspiration from Dagger, Anvil, and kotlin-inject, unifying their best features under one framework. It has its own annotations — `@Inject`, `@Provides`, `@DependencyGraph` (Metro's equivalent of Dagger's `@Component`) — but ships with comprehensive interop tooling that can understand Dagger and Anvil annotations during a migration period. This interop capability was the key that made Cash App's migration possible without a big-bang rewrite.

The fact that Metro is Kotlin-first matters beyond just build speed. It honors Kotlin's type system properly — nullable vs non-nullable types are distinguished, which Dagger's Java-based processor simply cannot do. Cash App discovered during their migration that they had a "surprisingly large number of bindings that returned nullable types for non-nullable injection sites and vice versa." Dagger silently accepted this because Java doesn't distinguish the two. Metro caught it, forcing them to fix actual potential `NullPointerException` sources.

## The Dual-Build Strategy

Cash App's migration approach was clever. Instead of migrating everything at once and hoping for the best, they set up a dual-build system controlled by a single Gradle property:

```kotlin
// gradle.properties
mad.di=AnvilDagger // Or Metro
```

This meant they could build the exact same codebase with either DI framework:

```kotlin
// Build with Dagger/Anvil
./gradlew app:assembleDebug -Pmad.di=AnvilDagger

// Build with Metro
./gradlew app:assembleDebug -Pmad.di=Metro
```

They set up separate CI shards building in both modes, catching regressions regardless of which framework was currently the default. This is the kind of safety net you need when migrating infrastructure that touches every module in a 1500-module project. You can't feature-flag a DI framework at runtime — the decision happens at build time — so having both pipelines running simultaneously was their rollback strategy.

## Convention Plugin: The Single Switch

The actual switching logic lived in a convention plugin. Cash App uses convention plugins extensively to consolidate build configuration across modules — instead of copy-pasting the same Gradle setup into 1500 `build.gradle` files, one plugin handles it:

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
                    interop.includeDagger(includeJavax = true, includeJakarta = false)
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

Notice the `interop` configuration in the Metro block. This tells Metro to understand Dagger's `@Inject`, `@Provides`, `@Component` annotations and Anvil's `@ContributesTo`, `@ContributesBinding`, and other annotations. With interop enabled, most of the existing code could compile under Metro without any annotation changes. The migration could be incremental — fix the code that Metro's stricter validation flagged, while leaving everything else untouched.

Another critical change was conditionally disabling the Kotlin language version override. When building with Anvil, they were pinned to language version 1.9. When building with Metro, that restriction was lifted, enabling K2:

```kotlin
tasks.withType(KotlinCompilationTask::class.java).configureEach { task ->
    if (diImplementation == "AnvilDagger") {
        task.compilerOptions.languageVersion.set(KotlinVersion.KOTLIN_1_9)
    }
}
```

## The Code Adjustments

Getting the dual build working wasn't as simple as flipping a plugin. Metro's validation is stricter than Dagger's in several places, and each difference required targeted fixes across the codebase.

**Removing duplicate Module includes.** Anvil's `@ContributesTo(Scope::class)` is an alternative to Dagger's `@Module(includes = ...)`, but over time some modules ended up with both — the `@ContributesTo` annotation and an explicit `includes` clause in an aggregator module. Dagger tolerated this; Metro flagged it as a module being added to the graph twice. The fix was straightforward: remove the redundant `includes` clauses and keep the `@ContributesTo` annotations.

**Converting Component.Builder to Component.Factory.** Metro's interop turns Dagger `@Component`s into `@DependencyGraph`s, but it has no equivalent of `@Component.Builder`. It does have `@DependencyGraph.Factory`, which maps to `@Component.Factory`. The conversion was mechanical:

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

**Moving scoping annotations from @Binds to type declarations.** This one revealed a subtle design improvement. In Dagger, you can put scoping annotations like `@SingleIn` on a `@Binds` method. Metro disallows this, and for a good reason: `@Binds` declarations should only map an implementation to an interface, nothing more. The scope belongs on the implementation class itself:

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

Both approaches work identically in Dagger, but Metro's stricter validation enforces cleaner separation of concerns. The scope is a property of the implementation, not of the binding declaration.

## The Results: Was It Worth It?

After a few weeks of iterative code modifications and fixing issues flagged by Metro's validation, Cash App got their codebase building in both modes with zero code changes between them. They ran extensive regression testing, set up parallel CI shards, and gradually rolled out.

The numbers speak for themselves. According to Cash App's benchmarks, clean build speeds improved by over 16%. But the incremental build improvements were dramatic — ABI changes went from 28.77 seconds to 11.93 seconds, a 58.5% reduction. Non-ABI changes dropped from 17.45 seconds to 7.15 seconds, a 59% reduction. For a team of engineers making changes across 1500 modules every day, those seconds add up to hours of reclaimed productivity.

Beyond raw speed, they achieved three things that mattered architecturally. First, kapt is gone — no more Java stub generation, no more annotation processing as a separate build phase. Second, K2 is enabled, bringing the latest Kotlin compiler improvements. Third, Metro's stricter validation caught real bugs — nullable type mismatches, duplicate modules, orphaned bindings — that Dagger had been silently accepting for years.

## What This Means For the Rest of Us

I want to be honest about something. Most Android teams are not Cash App. Most of us don't have 1500 modules. Most of us aren't blocked by kapt's build overhead or Anvil's K2 support. For a 20-module app with a team of 5, Dagger with Hilt works fine and will continue to work fine for years.

But the direction is clear. The Android ecosystem is moving toward Kotlin-first tooling — KSP over kapt, Kotlin compiler plugins over Java annotation processors, K2 as the default compiler. Dagger is a Java library being used in a Kotlin world, and that impedance mismatch will only grow. Metro represents what DI looks like when it's designed for Kotlin from the ground up, and Cash App's migration proves it can work at massive scale.

Our team hasn't migrated yet, but we've started evaluating Metro for new modules. The interop story makes it possible to adopt incrementally — you don't have to rewrite everything on day one. And honestly, after reading about Cash App's experience, the thing that excites me most isn't the build speed improvement. It's the stricter validation catching bugs that were hiding in our Dagger graph all along.

Thanks for reading!
