---
title: "Modularization & Multi-Module Architecture"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 4
sequence: 36
description: "Modularization questions are common in senior and lead Android interviews."
---

## Modularization & Multi-Module Architecture

Modularization is one of the most common topics in senior Android interviews. You need to show that you've actually worked with multi-module projects and understand the real tradeoffs.

#### What is modularization and why do I modularize?

Modularization means breaking a monolithic codebase into smaller, isolated modules. I modularize to scale the codebase, work with large teams, and reduce build time. In a single-module project, every change triggers a full recompilation. With multiple modules, Gradle only recompiles what changed and its dependents.

It also enforces isolation. If my chat team works in `:feature:chat` and payments works in `:feature:payments`, they can't accidentally break each other's code. Module boundaries enforce visibility rules at the compiler level.

#### What are the common types of modules?

- **app module** — Entry point. Contains the Application class, main activity, navigation graph, and DI setup. Depends on all feature modules.
- **feature modules** — Independent product features like `:feature:auth`, `:feature:cart`. Each has its own UI, ViewModel, and logic.
- **core modules** — Shared infrastructure like `:core:network`, `:core:database`, `:core:common`.
- **data modules** — Repository implementations, API services, data sources. Can be per-feature or shared.
- **domain modules** — Use cases and repository interfaces. Pure Kotlin, no Android dependencies.

The exact split depends on project size and team structure.

#### What is the difference between feature-based and layer-based modularization?

Feature-based means each module is a product feature — `:feature:auth`, `:feature:chat`, `:feature:settings`. Each one contains its own presentation, domain, and data layers internally. More isolated, more scalable.

Layer-based means modules are split by architectural layer — `:presentation`, `:domain`, `:data`. All features share the same layer modules. More flexible, more reusable, but features aren't isolated from each other within a layer.

Most production apps use a hybrid — feature modules for isolation with shared core modules for common infrastructure. Feature-based works better for large teams with clear ownership. Layer-based works for smaller teams where sharing matters more than isolation.

#### What does the dependency graph look like?

The app module sits at the top and depends on all feature modules. Feature modules depend on core and domain modules but never on each other. Domain modules are pure Kotlin with no external dependencies.

```
:app → :feature:auth, :feature:cart, :feature:profile
:feature:auth → :core:network, :core:ui, :domain
:feature:cart → :core:network, :core:ui, :domain
:core:network → :core:common
:domain → (nothing — pure Kotlin)
```

Dependencies flow downward. Feature modules never depend on each other, and core modules never depend on feature modules. This keeps the graph acyclic.

#### What is the difference between api and implementation in Gradle?

`implementation` means the dependency is internal — other modules that depend on this one can't see it. `api` means the dependency is exposed transitively.

```kotlin
// In :core:network module
dependencies {
    implementation(libs.okhttp)        // Only :core:network sees OkHttp
    api(libs.retrofit)                 // Dependents can also see Retrofit
}
```

I use `implementation` by default. It limits what gets exposed and improves build times because a change in an `implementation` dependency only recompiles the current module. I use `api` only when the dependency is part of my module's public API — like when a public method returns a Retrofit type.

Using `api` everywhere defeats the purpose. Changes ripple through the entire graph and build times get close to a single-module project.

#### How do I handle navigation between feature modules?

Feature modules can't depend on each other, so one feature can't directly reference another feature's Activity or Composable. I need a separate navigation module in the core layer.

**Shared route definitions** — I define route constants in a `:core:navigation` module. Each feature registers its routes. The app module assembles the full navigation graph.

```kotlin
// :core:navigation
object Routes {
    const val AUTH = "auth"
    const val PROFILE = "profile/{userId}"
    fun profile(userId: String) = "profile/$userId"
}

// :feature:auth — navigates without knowing about :feature:profile
fun onLoginSuccess(userId: String) {
    navController.navigate(Routes.profile(userId))
}
```

**Interface-based navigation** — I define a `Navigator` interface in a core module and implement it in the app module. Feature modules call `navigator.goToProfile(userId)` without knowing the implementation.

#### How do I avoid circular dependencies?

Circular dependencies happen when module A depends on B and B depends on A. Gradle fails the build. The fix is to extract the shared code into a third module that both depend on.

If `:feature:auth` needs to navigate to `:feature:profile` and `:feature:profile` needs to check auth status, I don't make them depend on each other. I put navigation routes in `:core:navigation` and the `AuthRepository` interface in `:domain`. Both features depend on those lower-level modules instead.

The general pattern: if two modules need each other's code, the shared part moves to a module that sits below both.

#### What are the build time benefits?

Gradle compiles modules in parallel and uses incremental compilation. When I change code in `:feature:auth`, only that module and its dependents recompile. Everything else uses cached outputs.

The real gains come from `implementation` dependencies. If I change an internal class in `:feature:auth`, only that module recompiles. If I change a public API, its dependents recompile too. More modules with `implementation` dependencies means a smaller recompilation scope.

In practice, a well-modularized project with 30+ modules can see incremental builds drop from 3-4 minutes to under 1 minute. Clean builds might be slightly slower because of Gradle configuration overhead, but incremental builds — which I do hundreds of times a day — get much faster.

#### How does Hilt work across modules?

Each module defines its own `@Module` classes with `@InstallIn`, and Hilt aggregates them at the app level during compilation. Feature modules use `@HiltViewModel` and `@InstallIn(ViewModelComponent::class)`. Core modules provide shared dependencies with `@InstallIn(SingletonComponent::class)`. The app module has `@HiltAndroidApp` on the Application class, which triggers the final aggregation.

The important detail is that `@InstallIn` determines the component scope, not the Gradle module. A `@Module` in `:feature:auth` installed in `SingletonComponent` provides an app-wide singleton, which is probably not what I want. I match Hilt scope to the feature's lifecycle — feature-specific dependencies should be `ViewModelScoped`, not `Singleton`.

#### What are Gradle convention plugins?

Convention plugins are custom Gradle plugins that define shared build configuration. Every module needs similar setup — Kotlin version, compile SDK, min SDK, common dependencies. Without convention plugins, I copy-paste this into every `build.gradle.kts`.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeaturePlugin.kt
class AndroidFeaturePlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")
            pluginManager.apply("kotlin-android")
            pluginManager.apply("dagger.hilt.android.plugin")

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig.minSdk = 26
            }

            dependencies {
                add("implementation", project(":core:common"))
                add("implementation", project(":core:ui"))
                add("testImplementation", libs.findLibrary("junit").get())
            }
        }
    }
}
```

Then each feature module's build file becomes one line: `plugins { id("app.android.feature") }`. This eliminates duplication and makes it easy to update configuration across all modules at once.

#### How do I enforce module boundaries?

Kotlin's `internal` visibility modifier limits access to the same module. Anything marked `internal` in `:feature:auth` is invisible to `:feature:cart`. This is the primary enforcement tool.

I also use Gradle's `api` vs `implementation` to limit transitive dependencies. Tools like `dependency-analysis-plugin` detect unused dependencies and `api` dependencies that should be `implementation`.

The strongest enforcement is the dependency graph itself. If `:feature:auth` doesn't depend on `:feature:cart`, the compiler prevents any access. No runtime check needed.

#### How do I share data across feature modules?

Feature modules can't depend on each other, so I can't share data directly. The common approaches:

**Shared repository** — Both features depend on `:core:data` which provides a `UserRepository`. When `:feature:auth` updates the user, `:feature:profile` observes changes through the same repository's Flow.

**Shared state holder** — A `SessionManager` in a core module holds global state like auth tokens or user preferences. Feature modules inject it and observe changes.

**Navigation arguments** — For one-time data passing, I send data through navigation arguments. The source feature puts data in the route, the destination reads it from `SavedStateHandle`.

#### How do I decide the right granularity?

Too few modules means I miss out on build time and isolation benefits. Too many means excessive boilerplate and slow Gradle configuration.

I start coarse-grained and split when there's a real reason — the module is too large for one team, build times are slow because changes trigger too much recompilation, or I need to enforce that certain code can't access certain APIs.

As a rough guide: 5-10 developers can work with 10-20 modules. 50+ developers might need 50-100+ modules. Google's apps have hundreds, but they also have hundreds of engineers and custom build infrastructure.

#### What are dynamic feature modules?

Dynamic feature modules are downloaded on demand instead of being included in the initial APK. They use the Play Feature Delivery API. Features like a camera editor or admin dashboard get downloaded only when the user needs them.

The dependency is inverted — the dynamic feature depends on the app module, not the other way around. The app must be installable without the dynamic feature. Communication uses `SplitInstallManager` to check if a feature is installed before navigating to it.

In practice, dynamic features add a lot of complexity. Testing is harder, DI requires workarounds, and Play Store delivery can be unreliable. I only use them for genuinely large optional features where the APK size saving justifies the effort.

#### How do I structure shared resources?

Shared resources like colors, typography, and base themes go in a `:core:ui` or `:core:design` module. Feature-specific resources stay in the feature module.

I only put resources in `:core:ui` if they're genuinely used across 3+ features. Over-sharing creates a bloated module that everything depends on. Any change to `:core:ui` triggers recompilation of every feature, which defeats the purpose of modularization.

#### What is the impact on testing?

Each module can be tested independently. A feature module's tests only set up dependencies for that feature, not the entire app. Tests are faster and more focused.

Module boundaries also force better testability. When `:feature:auth` depends on a `UserRepository` interface from `:domain`, I naturally use a fake in tests without needing a mocking library. The architecture that modularization enforces — depending on abstractions — is the same architecture that makes code testable.

Integration tests become more intentional too. I test specific module combinations instead of the whole app. A test for `:feature:cart` with `:core:network` and `:core:database` verifies the cart feature end-to-end without involving auth or profile.

#### How do I migrate a monolithic app to multi-module?

I start from the bottom. Extract `:core:network` and `:core:database` first — they have the fewest dependencies on app code. Then extract `:domain` with repository interfaces and use cases. Finally, extract feature modules one at a time, starting with the most isolated feature.

For each extraction: identify all classes belonging to the feature, move them to a new module, make what other modules need `public`, make everything else `internal`, add the dependency in the app module's `build.gradle.kts`, and fix compilation errors. Those errors tell me exactly where the boundary isn't clean — those spots need an interface or a shared module.

I don't try to modularize everything at once. Extract one module, stabilize, then extract the next. A full migration for a large app takes months of incremental work alongside regular feature development.

### Common Follow-ups

- How do you handle version catalogs (TOML) in a multi-module project?
- What is the build performance impact of KSP vs KAPT in multi-module?
- How do you share test fixtures and test utilities across modules?
- What is the role of `buildSrc` vs `build-logic` convention plugins?
- How do you handle feature flags that enable or disable entire feature modules?
- What happens when a feature module grows too large — how do you split it further?
- How do you handle ProGuard/R8 rules in a multi-module project?
- What is the difference between Android library module and pure Kotlin/JVM module?
