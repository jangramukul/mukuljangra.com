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

The project is Zac Sweers' personal creation, not a Slack project (despite Zac working at Slack). But Cash App — the team that originally built and maintained Anvil — migrated their entire 1,500-module Android codebase to Metro. That's not a toy adoption. That's production validation at serious scale.

Here's the thing that reframed how I think about DI tooling: **Metro doesn't process your code and generate new source files. It operates inside the Kotlin compiler itself.** Dagger uses an annotation processor (kapt or KSP) that reads your source code, generates new `.java` or `.kt` files, and those files get compiled in a separate pass. Metro uses FIR for error reporting and diagnostics, and both FIR and IR for code generation. It generates code directly into the compiler's intermediate representation, skipping the source-generation round-trip entirely. This is why it can do things that source-generation tools physically cannot — like reading private declarations, using default parameter values as optional dependencies, and injecting into private properties. It's not limited by what's visible from outside a file. It's inside the compiler.

## How It Compares to Dagger and Hilt

The API surface will feel familiar if you've used Dagger. `@Inject` for constructor injection, `@Provides` for explicit bindings, `@DependencyGraph` instead of `@Component`. But the differences run deeper than naming.

Dagger's build pipeline involves kapt (or KSP) running a separate annotation processing step, generating Java source files, then compiling those generated files with javac. That's multiple compiler invocations per module. Hilt adds its own Gradle plugin and bytecode transformation on top of that. Metro replaces all of this with a single Kotlin compiler plugin — one compilation step, no generated source files, no kapt, no KSP, no bytecode transforms.

On the language side, Metro is Kotlin-native in ways Dagger never was. Default parameter values work as optional dependencies — if a binding doesn't exist in the graph, the default kicks in. Providers can be `private`. Member injection targets `private` properties and functions. Dagger can't do any of this because Java annotation processors can't see Kotlin's `private` declarations or default values. Metro can, because it's running inside the same compiler that processes those declarations. Metro also supports all Kotlin Multiplatform targets — JVM, Android, JS, WASM, and Native — which makes it the first DI framework with real compile-time validation across all KMP targets.

## Setup

Getting Metro running is minimal. Apply the Gradle plugin, and you're done:

```kotlin
plugins {
    id("dev.zacsweers.metro") version "<version>"
}
```

That's it. The plugin handles adding Metro's runtime dependencies and all the compiler plugin wiring. No annotation processor configuration, no kapt block, no KSP setup. If you want IDE support for Metro's FIR diagnostics and generated declarations in the editor, you need K2 mode enabled and the `kotlin.k2.only.bundled.compiler.plugins.enabled` registry flag set to `false` in IntelliJ. It's not required for compilation, but it's nice to have for error highlighting.

## @Inject — Constructor Injection

Most types should use constructor injection. You annotate the class itself if it has a single primary constructor:

```kotlin
@Inject
class UserRepository(
    private val api: ApiClient,
    private val database: UserDatabase,
)
```

Metro's compiler sees the `@Inject` annotation, resolves `ApiClient` and `UserDatabase` from the dependency graph, and generates a factory that constructs this class with the right dependencies. If you have multiple constructors, annotate the specific one you want Metro to use. Constructor-injected classes are fully managed by Metro — it handles instantiation and encourages immutability.

For types that need runtime arguments alongside injected dependencies, assisted injection works with `@AssistedInject`, `@Assisted`, and `@AssistedFactory`:

```kotlin
@AssistedInject
class PaymentProcessor(
    @Assisted val amount: Long,
    val gateway: PaymentGateway,
    val logger: TransactionLogger,
) {
    @AssistedFactory
    fun interface Factory {
        fun create(amount: Long): PaymentProcessor
    }
}
```

Metro also supports member injection for classes you can't constructor-inject, like Android Activities. Unlike Dagger, injected members can be `private` — you expose a `fun inject(target: MyActivity)` function on the graph, and Metro handles the rest.

## @Provides — Providing Dependencies

When you can't use constructor injection — third-party classes, interface bindings, or factory methods — you use `@Provides` functions. These can live directly in the graph:

```kotlin
@DependencyGraph
interface AppGraph {
    val httpClient: HttpClient

    @Provides
    fun provideHttpClient(cache: HttpCache): HttpClient {
        return HttpClient(cache)
    }
}
```

For organizing providers into logical groups, you can extract them into supertypes that the graph extends. This is similar to how Dagger uses modules, but without the `@Module` annotation overhead:

```kotlin
interface NetworkProviders {
    @Provides
    fun provideHttpClient(): HttpClient = HttpClient()
}

@DependencyGraph
interface AppGraph : NetworkProviders
```

Metro also has `@BindingContainer` for more complex cases — annotated classes or objects that hold `@Provides` and `@Binds` declarations without being full graphs. These are analogous to Dagger's `@Module` and can be included via `@Includes` parameters on graph factories or directly referenced in the `@DependencyGraph` annotation.

## @DependencyGraph — Building the Graph

`@DependencyGraph` is Metro's equivalent of Dagger's `@Component`. You declare an interface with accessor properties or functions for the types you need, and Metro generates the implementation at compile time:

```kotlin
@DependencyGraph
interface AppGraph {
    val userRepository: UserRepository
    val paymentGateway: PaymentGateway

    @DependencyGraph.Factory
    fun interface Factory {
        fun create(
            @Provides apiKey: String,
            @Includes networkConfig: NetworkConfig,
        ): AppGraph
    }
}

// Create the graph
val graph = createGraphFactory<AppGraph.Factory>()
    .create(apiKey = "key-123", networkConfig = config)
```

For simple graphs without runtime inputs, use `createGraph<AppGraph>()` directly. For graphs that need runtime parameters, define a `@DependencyGraph.Factory` interface — this replaces both Dagger's `@Component.Factory` and `@Component.Builder`. The `@Provides` annotation on factory parameters works like Dagger's `@BindsInstance`, making the instance available as a binding. `@Includes` parameters provide access to another type's accessors as usable dependencies.

Metro validates the entire dependency graph at compile time using Tarjan's algorithm and topological sort. Missing bindings, circular dependencies, and scope mismatches are all caught during compilation with detailed error messages that tell you exactly what's wrong and how to fix it.

## Component Hierarchy — Scoping and Parent-Child Graphs

Metro uses `@SingleIn` to scope bindings to a specific graph. When a binding is annotated with `@SingleIn(AppScope::class)`, Metro generates a `DoubleCheck`-backed provider that ensures lazy, thread-safe singleton behavior within that graph instance:

```kotlin
@SingleIn(AppScope::class)
@Inject
class AuthManager(
    private val tokenStore: TokenStore,
)

@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val authManager: AuthManager
}
```

Every call to `appGraph.authManager` returns the same instance. Declaring a `scope` on the graph is functionally equivalent to annotating the graph itself with `@SingleIn` for that scope. Metro enforces that scoped bindings match their graph's scope — a binding scoped to `UserScope` in an `AppScope` graph is a compile-time error.

For parent-child graph hierarchies, Metro uses `@GraphExtension` — similar to Dagger's subcomponents. A graph extension inherits all bindings from its parent and adds its own:

```kotlin
@GraphExtension(LoggedInScope::class)
interface LoggedInGraph {
    val userProfile: UserProfile

    @GraphExtension.Factory
    interface Factory {
        fun create(@Provides userId: String): LoggedInGraph
    }
}

@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val loggedInGraphFactory: LoggedInGraph.Factory
}
```

The parent graph exposes the extension's factory, and you create child graphs with runtime parameters. Extensions can be chained and implicitly inherit their parents' scopes.

## Anvil-Style Aggregation

The feature that made Anvil indispensable for large projects was `@ContributesBinding` and `@ContributesTo` — the ability to declare bindings in the modules where they belong and have them automatically aggregated into the right dependency graph. No more maintaining giant module lists in your app module. Metro carries this forward as a first-class feature, not a separate plugin:

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
// automatically included
@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val paymentGateway: PaymentGateway
    val tracker: AnalyticsTracker
}
```

Each feature module declares its own bindings with the scope they belong to, and Metro aggregates them at compile time. Unlike Anvil, which needed a separate `@MergeComponent` annotation, Metro's `@DependencyGraph` handles scope merging directly — including support for `additionalScopes` when a graph needs to aggregate contributions from multiple scopes. `@ContributesTo` works for contributing provider interfaces, and both annotations support `replaces` for test overrides and are repeatable for contributing to multiple scopes.

## Build Performance

This is where the compiler plugin architecture pays off in hard numbers. Metro's official benchmarks against a generated 500-module project tell the story clearly.

**ABI-breaking changes** (the worst case): Metro at **17.5s** vs Dagger KSP at **119.6s** — that's **584% faster**. Even kotlin-inject comes in at 32.3s, nearly double Metro's time. **Non-ABI changes**: Metro and kotlin-inject are nearly identical at ~11.5s, while Dagger KAPT lags at 23.2s. **Raw graph processing**: Metro at **22.6s** vs Dagger KSP at **88.1s**.

These improvements come from two sources. First, Metro avoids the extra frontend compiler invocations that kapt and KSP require to analyze sources and generate new ones. Second, generating directly to FIR/IR means the generated code doesn't need a separate compilation pass — it gets lowered directly into target platform code alongside your own code.

Real-world results confirm the synthetic benchmarks. Cash App reported **~59% faster incremental builds** and **16% faster clean builds** after migrating their 1,500-module codebase. Freeletics saw 40-55% faster ABI changes across 551 modules. BandLab measured 55% faster incremental builds on their 929-module project. These are production numbers from teams that shipped the migration.

## Migration Considerations

If you're starting a new Kotlin project today — especially a multiplatform one — I think Metro is the obvious choice. It's Kotlin-first, compile-time safe, multiplatform, and faster than Dagger. The API is clean and familiar. The aggregation model works at scale.

If you're on an existing Dagger/Hilt project, Metro's interop capabilities make migration feasible but not trivial. You can configure Metro to understand Dagger's `@Inject`, `@Provides`, `@Module`, and Anvil's `@ContributesBinding` and `@ContributesTo` annotations through its interop Gradle DSL. Cash App ran CI builds in both Dagger and Metro modes simultaneously during their migration, catching regressions before they shipped. The migration is incremental — some modules on Metro, others still using Dagger annotations, all composing into the same dependency graph.

But the migration isn't friction-free. Cash App had to fix nullability mismatches that Dagger's Java heritage had been silently ignoring, convert `@Component.Builder` to `@Component.Factory` (Metro has no builder equivalent), remove direct calls to `@Provides` methods from test code, and untangle some `@MergeModule` patterns. Most of these were tech debt that should have been cleaned up anyway — Metro's stricter validation just exposed it. I think that's actually a good sign for the framework's design philosophy.

The tradeoff to acknowledge is maturity. Metro depends on Kotlin compiler internals that can change between versions, though Zac has a track record of maintaining compiler plugins across versions (Anvil, Moshi, etc.). You're betting on a single maintainer's library, which is a real risk — but it's the same bet the community made on Anvil, and that bet paid off for years. Metro currently supports Kotlin 2.2.20 through 2.4.0-dev, and the framework is already past version 0.10, with active development and real production usage at multiple companies.

The bigger picture is that Kotlin's DI ecosystem is finally catching up to where the language itself has been for years. We've been writing Kotlin apps with a Java DI framework for too long. Metro doesn't just fix the build tool problem — it removes the entire impedance mismatch between our DI declarations and our language. And that's a shift worth paying attention to.

Thanks for reading!
