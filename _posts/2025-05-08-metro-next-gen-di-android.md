---
title: Metro — Next Generation Dependency Injection for Android
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Libraries
---

My DI journey on Android has been a progression of increasingly frustrated compromises. First it was manual constructor injection — workable for small projects, completely unmanageable at scale. Then Dagger came along and gave us compile-time safety with generated code, but it was a Java library at heart, with a Java annotation processor, generating Java code. When Kotlin became the dominant language, we bolted on kapt to bridge the gap, and every build felt it. Hilt abstracted some of Dagger's boilerplate away, but it was still Dagger underneath, still Java-centric, still running kapt. Anvil from Square added powerful aggregation and simplified multi-module graphs, but it was a compiler plugin built for the K1 compiler, and K2 was coming.

Every step forward solved a real problem but carried the weight of the previous generation's constraints. We were writing Kotlin-first apps powered by a Java-first DI framework, processed by a compatibility layer, generating code in a language we weren't writing anymore. It worked. But it felt like we were holding the ecosystem together with duct tape.

Then Zac Sweers released Metro, and for the first time in years, the DI layer felt like it was designed for the Kotlin world we actually live in.

## What Metro Is

Metro is a compile-time dependency injection framework implemented entirely as a Kotlin compiler plugin. It draws from three existing tools — Dagger's generated code approach and runtime patterns, kotlin-inject's Kotlin-native API design, and Anvil's aggregation model — and unifies them into a single, cohesive solution. It's not a wrapper around Dagger. It's not an incremental improvement. It's a ground-up reimplementation that targets K2 and Kotlin Multiplatform from day one.

The project is Zac Sweers' personal creation, not a Slack project (despite Zac working at Slack). But Cash App — the team that built and maintained Anvil — migrated their entire 1,500-module Android codebase to Metro. That's not a toy adoption. That's a production validation at serious scale.

What makes Metro fundamentally different from Dagger is the compiler plugin architecture. Dagger uses an annotation processor (kapt or KSP) that reads your source code, generates new source files, and those files get compiled in a separate pass. Metro operates inside the Kotlin compiler itself, using FIR for error reporting and both FIR and IR for code generation. It generates code directly into the compiler's intermediate representation, skipping the source-generation round-trip entirely.

## The Core APIs

If you've used Dagger or kotlin-inject, Metro's API will feel immediately familiar. The naming is slightly different, but the concepts map directly. Here's a minimal dependency graph:

```kotlin
@DependencyGraph
interface AppGraph {
    val httpClient: HttpClient
    val database: AppDatabase

    @Provides
    fun provideFileSystem(): FileSystem = FileSystem.SYSTEM

    @Provides
    fun provideDatabase(fs: FileSystem): AppDatabase {
        return AppDatabase.create(fs)
    }
}

@Inject
class HttpClient(
    private val fileSystem: FileSystem,
    private val database: AppDatabase,
)

// Create the graph
val graph = createGraph<AppGraph>()
val client = graph.httpClient
```

Graphs are interfaces or abstract classes annotated with `@DependencyGraph`. Dependencies are provided through `@Inject` constructors or `@Provides` functions defined directly in the graph. The `createGraph()` function generates the implementation at compile time — no reflection, no runtime graph building.

Assisted injection works the way you'd expect, with `@Assisted` parameters and `@AssistedFactory` interfaces:

```kotlin
@Inject
class PaymentProcessor(
    @Assisted val amount: Long,
    val gateway: PaymentGateway,
    val logger: TransactionLogger,
) {
    @AssistedFactory
    interface Factory {
        fun create(amount: Long): PaymentProcessor
    }
}
```

Where Metro starts to diverge from Dagger is in its Kotlin-native features. Default parameter values work as optional dependencies — if the dependency doesn't exist in the graph, the default value is used. Providers can be `private`. Member injection can target private properties. These are things that source-generation tools physically cannot do because they can't access private declarations in another file. Metro can, because it operates inside the compiler.

## Anvil-Style Aggregation

The feature that made Anvil indispensable for large projects was `@ContributesBinding` and `@ContributesTo` — the ability to declare bindings in the modules where they belong and have them automatically aggregated into the right dependency graph. No more maintaining giant module lists in your app module. Metro carries this forward:

```kotlin
// In your :payments module
@ContributesBinding(AppScope::class)
@Inject
class StripePaymentGateway(
    private val apiClient: ApiClient,
) : PaymentGateway

// In your :analytics module
@ContributesBinding(AppScope::class)
@Inject
class MixpanelTracker(
    private val config: AnalyticsConfig,
) : AnalyticsTracker

// In your app module — both bindings are
// automatically included in the graph
@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val paymentGateway: PaymentGateway
    val tracker: AnalyticsTracker
}
```

This is the same decentralized binding model that made Anvil work at scale. Each feature module declares its own bindings with the scope they belong to, and Metro aggregates them at compile time. You don't need to manually wire modules together in the app-level graph.

## Build Performance

This is where the compiler plugin architecture pays off in hard numbers. Zac benchmarked Metro against Dagger/Anvil on his CatchUp app — a ~35 module project that was previously using anvil-ksp and K2 kapt for dagger-compiler.

**ABI-breaking changes** (the worst case, where downstream modules need recompilation): **47% faster.** Without incremental compilation: **28% faster.**

**Non-ABI changes** (where compilation avoidance kicks in): **56% faster.** Without incremental compilation: **25.5% faster.**

These aren't synthetic benchmarks. They're measured on a real app with real module dependencies. The performance improvement comes from two sources. First, Metro avoids the extra frontend compiler invocations that kapt and KSP require to analyze sources and generate new ones. Second, generating directly to FIR/IR means the generated code doesn't need a separate compilation pass — it gets lowered directly into target platforms alongside your own code.

The honest caveat: 35 modules is mid-sized. At 1,500 modules (Cash App's scale), the absolute time savings are larger but the percentage improvements may vary depending on graph complexity and module topology. Cash App hasn't published detailed benchmarks yet, but the fact that they migrated their entire codebase is a strong signal that the performance story holds at scale.

## Cash App's Migration Story

Cash App's migration from Dagger/Anvil to Metro is probably the most significant real-world validation of a new DI framework in the Android ecosystem. Their approach was methodical — they introduced a Gradle property to build with either Dagger/Anvil or Metro, ran CI in both modes to catch regressions, and gradually moved modules over.

Metro's interop capabilities were critical to making this work. Metro understands Dagger's `@Inject`, `@Provides`, and `@Module` annotations through its interop configuration, so you don't need to change every annotated file during migration. You can configure Metro to interpret Anvil's `@ContributesBinding` and `@ContributesTo` annotations directly. This means migration is incremental — you can have some modules on Metro and others still using Dagger annotations, and they all compose into the same dependency graph.

The migration wasn't friction-free though. Cash App had to fix nullability mismatches that Dagger's Java heritage had been silently ignoring, convert `@Component.Builder` to `@Component.Factory`, remove direct calls to `@Provides` methods from test code, and untangle some `@MergeModule` patterns. But most of these changes were things that should have been done anyway — Metro's stricter validation exposed latent issues in their dependency graph.

The fact that the migration required cleaning up tech debt rather than introducing new complexity is, IMO, a good sign for the framework's design philosophy. Metro is stricter than Dagger in places where Dagger was too lenient, and those strictness points catch real bugs.

## What This Means for Our DI Stack

Here's where I'll be opinionated. If you're starting a new Kotlin project today — especially a multiplatform one — Metro is the obvious choice. It's Kotlin-first, compile-time safe, multiplatform, and faster than Dagger. The API is clean and familiar. The aggregation model works at scale. And it's backed by someone (Zac Sweers) with a decade of experience building DI and compiler tooling in the Android ecosystem.

If you're on an existing Dagger/Hilt project, the calculus is different. Metro's interop makes migration feasible, but it's still work. You need to evaluate whether the build performance gains and the Kotlin-native API justify the migration cost for your team. For a small project with a simple Dagger graph, the answer is probably "not yet." For a large multi-module project where kapt build times are a daily frustration, it's worth serious consideration.

The tradeoff to acknowledge is maturity. Metro 0.1.x is a first release. It will have bugs. Features like nullable bindings and `@ContributesGraphExtension` are still on the roadmap. And compiler plugins depend on Kotlin compiler internals that can change between Kotlin versions, though Zac has a track record of maintaining compiler plugins across versions. You're betting on a single maintainer's library, which is a real risk — but it's also the same bet the community made on Anvil, and that bet paid off.

The bigger picture is that Kotlin's DI ecosystem is finally catching up to where the language itself has been for years. We've been writing Kotlin apps with a Java DI framework for too long. Metro doesn't just fix the build tool problem — it removes the entire impedance mismatch between our DI declarations and our language. And that's a shift worth paying attention to.

Thanks for reading!
