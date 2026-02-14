---
title: "Modularization & Multi-Module Architecture"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 4
sequence: 36
description: "Modularization questions are common in senior and lead Android interviews."
---

## Modularization & Multi-Module Architecture — What Interviewers Really Ask

Modularization questions are common in senior and lead Android interviews. Interviewers want to know that you've worked with multi-module projects, understand the tradeoffs, and can design a module structure for a real app — not just explain the concept.

### Core Questions (Beginner → Intermediate)

#### Q1: What is modularization and why do we modularize?

Modularization is the process of breaking down a monolithic codebase into smaller, isolated, reusable modules. You modularize to scale the application codebase, work with large teams, and reduce build time. When a project is a single module, every code change triggers a full recompilation. With multiple modules, Gradle only recompiles the modules that changed and their dependents.

Beyond build time, modularization enforces code ownership and isolation. If the chat team works in `:feature:chat` and the payments team works in `:feature:payments`, they can't accidentally break each other's code because module boundaries enforce visibility rules.

#### Q2: What are the common types of modules in an Android project?

- **app module** — The application entry point. Contains the Application class, main activity, navigation graph, and DI setup. It depends on all feature modules.
- **feature modules** — Independent product features like `:feature:auth`, `:feature:cart`, `:feature:profile`. Each contains its own UI, ViewModel, and feature-specific logic.
- **core modules** — Shared infrastructure like `:core:network`, `:core:database`, `:core:common`. Provide utilities that multiple features depend on.
- **data modules** — Repository implementations, API services, and data sources. Can be per-feature (`:data:auth`) or shared (`:data`).
- **domain modules** — Use cases and repository interfaces. Pure Kotlin with no Android dependencies.

The exact split depends on the project size and team structure. A 5-person team doesn't need the same granularity as a 50-person team.

#### Q3: What is the difference between feature-based and layer-based modularization?

Feature-based means each module is a product feature — `:feature:auth`, `:feature:chat`, `:feature:settings`. Each feature module contains its own presentation, domain, and data layers internally. This is more isolated and more scalable — teams own entire features.

Layer-based means modules are split by architectural layer — `:presentation`, `:domain`, `:data`. All features share the same layer modules. This is more flexible and more reusable, but features aren't isolated from each other within a layer.

Most production apps use a hybrid approach — feature modules for isolation with shared core/data modules for common infrastructure. The choice depends on product requirements. Feature-based is better for large teams with clear feature ownership. Layer-based works for smaller teams where code sharing is more important than isolation.

#### Q4: What does the dependency graph of a multi-module project look like?

The app module sits at the top and depends on all feature modules. Feature modules depend on core and domain modules but never on each other. Core modules depend on nothing or only on other core modules. Domain modules are pure Kotlin with no external dependencies.

```
:app → :feature:auth, :feature:cart, :feature:profile
:feature:auth → :core:network, :core:ui, :domain
:feature:cart → :core:network, :core:ui, :domain
:core:network → :core:common
:domain → (nothing — pure Kotlin)
```

The key rule is that dependencies flow downward. Feature modules never depend on each other, and core modules never depend on feature modules. This keeps the graph acyclic and prevents circular dependencies.

#### Q5: What is the difference between api and implementation in Gradle dependencies?

`implementation` means the dependency is internal to the module — other modules that depend on this one can't see it. `api` means the dependency is exposed — other modules can see and use it transitively.

```kotlin
// In :core:network module
dependencies {
    implementation(libs.okhttp)        // Only :core:network sees OkHttp
    api(libs.retrofit)                 // Modules depending on :core:network can also see Retrofit
}
```

Use `implementation` by default. It limits what gets exposed and improves build times because a change in an `implementation` dependency only recompiles the current module. Use `api` only when the dependency is part of your module's public API — like when a method in your public interface returns a Retrofit type.

Using `api` everywhere defeats the purpose of modularization because changes ripple through the entire graph. A large project with mostly `api` dependencies builds almost as slowly as a single module.

#### Q6: How do you avoid circular dependencies?

Circular dependencies happen when module A depends on module B and module B depends on module A. Gradle doesn't allow this — the build fails. The solution is to extract the shared code into a third module that both depend on.

For example, if `:feature:auth` needs to navigate to `:feature:profile` and `:feature:profile` needs to check auth status, don't make them depend on each other. Instead, create `:core:navigation` that defines navigation routes both features use, and `:domain` that defines an `AuthRepository` interface both can access.

The general pattern is: if two modules need each other's code, the shared part should move to a lower-level module that both depend on.

#### Q7: How do you handle navigation between feature modules?

Feature modules can't depend on each other, so one feature can't directly reference another feature's Activity or Composable. The common solutions are:

**Navigation routes in a shared module** — Define route constants or sealed classes in a `:core:navigation` module. Each feature module registers its routes, and the app module assembles the navigation graph.

```kotlin
// :core:navigation — shared routes
object Routes {
    const val AUTH = "auth"
    const val PROFILE = "profile/{userId}"
    fun profile(userId: String) = "profile/$userId"
}

// :feature:auth — navigates to profile without knowing about :feature:profile
fun onLoginSuccess(userId: String) {
    navController.navigate(Routes.profile(userId))
}
```

**Interface-based navigation** — Define a `Navigator` interface in a core module, implement it in the app module. Feature modules depend on the interface and call methods like `navigator.goToProfile(userId)` without knowing the implementation.

#### Q8: What are the build time benefits of modularization?

Gradle compiles modules in parallel and uses incremental compilation. When you change code in `:feature:auth`, only that module and modules that depend on it are recompiled. Modules that don't depend on `:feature:auth` use their cached outputs.

The real gains come from how `implementation` dependencies limit recompilation scope. If `:feature:auth` changes an internal class, only `:feature:auth` recompiles. If it changes a public API, its dependents recompile too. The more modules you have with `implementation` dependencies, the smaller the recompilation scope.

In practice, a well-modularized project with 30+ modules can see build times drop from 3-4 minutes to under 1 minute for incremental builds. Full clean builds might actually be slower because of the overhead of configuring many Gradle modules, but incremental builds — which developers do hundreds of times a day — get significantly faster.

### Deep Dive Questions (Advanced → Expert)

#### Q9: What are Gradle convention plugins and why do multi-module projects need them?

Convention plugins are custom Gradle plugins that define shared build configuration. In a multi-module project, every module needs similar setup — Kotlin version, compile SDK, min SDK, common dependencies, test configurations. Without convention plugins, you copy-paste this configuration into every `build.gradle.kts`.

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

Then each feature module's `build.gradle.kts` becomes a single line: `plugins { id("app.android.feature") }`. This eliminates duplication, reduces errors, and makes it easy to update configuration across all modules at once. Google's Now In Android project uses this pattern extensively.

#### Q10: How does Hilt work in a multi-module project?

Hilt's annotation processing works across Gradle modules automatically. Each module defines its own `@Module` classes with `@InstallIn`, and Hilt aggregates them at the app level during compilation.

Feature modules define their ViewModels with `@HiltViewModel` and their modules with `@InstallIn(ViewModelComponent::class)`. Core modules provide shared dependencies with `@InstallIn(SingletonComponent::class)`. The app module applies the `dagger.hilt.android.plugin` and has `@HiltAndroidApp` on the Application class — this triggers the final aggregation.

The important detail is that Hilt uses `@InstallIn` to determine which component a module belongs to, not which Gradle module it's in. A `@Module` in `:feature:auth` installed in `SingletonComponent` provides an app-wide singleton, which might not be what you want. Match the Hilt scope to the feature's lifecycle — feature-specific dependencies should be `ViewModelScoped` or `ActivityScoped`, not `Singleton`.

#### Q11: How do you structure shared resources across modules?

Common resources like colors, typography, shared strings, and base themes go in a `:core:ui` or `:core:design` module. Feature modules depend on it and use its resources. Feature-specific resources (strings, drawables) stay in the feature module.

The key rule is that `:core:ui` should only contain resources that are genuinely shared across 3+ features. If a color is only used in two features, it doesn't belong in the shared module — put it in each feature module. Over-sharing in core modules leads to a bloated module that everything depends on, which defeats the purpose of modularization because changes to `:core:ui` trigger recompilation of every feature.

#### Q12: What are dynamic feature modules?

Dynamic feature modules are modules that can be downloaded on demand instead of being included in the initial app download. They use the Play Feature Delivery API. The initial APK is smaller, and features like a camera editor, AR viewer, or admin dashboard are downloaded only when the user needs them.

Dynamic features have an inverted dependency — the dynamic feature module depends on the app module (not the other way around). This is because the app must be installable without the dynamic feature. Communication between the app and dynamic features uses reflection or the `SplitInstallManager` API to check if a feature is installed before navigating to it.

In practice, dynamic feature modules add complexity — testing is harder, dependency injection requires workarounds, and the Play Store delivery can be unreliable. Most teams only use them for genuinely large optional features where the APK size saving justifies the effort.

#### Q13: How do you decide the right granularity for modules?

Too few modules means you don't get the build time and isolation benefits. Too many modules means excessive boilerplate, complex dependency graphs, and slow Gradle configuration phase.

Start coarse-grained and split when you have a reason. Good reasons to split a module: the module is too large for one team to own, build times are slow because changes in the module trigger too much recompilation, or you want to enforce that a specific part of the code doesn't access certain APIs.

A practical rule: if your project has 5-10 developers, 10-20 modules is reasonable. If you have 50+ developers, 50-100+ modules makes sense. Google's apps have hundreds of modules, but they also have hundreds of engineers and custom build infrastructure.

#### Q14: How do you enforce module boundaries and prevent leaking internal APIs?

Kotlin's `internal` visibility modifier limits access to the same module. Any class, function, or property marked `internal` in `:feature:auth` is invisible to `:feature:cart`. This is the primary tool for enforcing boundaries.

For more control, you can use Gradle's `api` vs `implementation` to limit transitive dependencies. Linting tools like `dependency-analysis-plugin` detect unused dependencies and `api` dependencies that should be `implementation`. Some teams also use architecture tests (ArchUnit for JVM) to verify that modules don't access packages they shouldn't.

The strongest enforcement is the dependency graph itself. If `:feature:auth` doesn't depend on `:feature:cart`, there's no way for auth code to reference cart code — the compiler prevents it.

#### Q15: How do you handle shared data across feature modules?

Feature modules can't depend on each other, so sharing data directly isn't possible. The common approaches are:

**Shared repository in a core module** — Both features depend on `:core:data` which provides a `UserRepository`. When `:feature:auth` updates the user, `:feature:profile` observes the change through the same repository's Flow.

**Event bus or shared state holder** — A `SessionManager` in a core module holds the current user session. Feature modules inject it and observe changes. This works for global state like auth tokens, user preferences, or feature flags.

**Navigation arguments** — For one-time data passing between features, send data through navigation arguments. The source feature puts data in the route, and the destination feature reads it from `SavedStateHandle`.

#### Q16: What is the impact of modularization on testing?

Each module can be tested independently with its own test suite. A feature module's unit tests only need to set up dependencies for that feature, not the entire app. This makes tests faster and more focused.

Module boundaries also force better testability. When `:feature:auth` depends on a `UserRepository` interface from `:domain`, the tests naturally use a fake implementation without needing a mocking library. The architecture enforced by modularization (depending on abstractions) is the same architecture that makes code testable.

Integration tests become more intentional. Instead of testing the entire app, you test specific module combinations. A test for `:feature:cart` with `:core:network` and `:core:database` verifies the cart feature works end-to-end without involving auth, profile, or other features.

#### Q17: What is the recommended module structure for a medium-to-large Android app?

A practical structure for a team of 10-20 developers working on an app with 5-8 major features:

```
:app                          // Entry point, navigation, DI root
:core:common                  // Extensions, utils, base classes
:core:network                 // Retrofit setup, interceptors, API config
:core:database                // Room setup, base DAOs, migrations
:core:ui                      // Shared Compose components, theme, design tokens
:core:navigation              // Route definitions, Navigator interface
:domain                       // Use cases, repository interfaces, domain models
:feature:auth                 // Login, signup, password reset
:feature:home                 // Home screen, dashboard
:feature:profile              // User profile, settings
:feature:chat                 // Messaging feature
:feature:notifications        // Notification center
```

Each feature module contains its own data layer (API service, mappers) and presentation layer (ViewModel, Composables). The domain module holds shared business logic. Core modules provide infrastructure. The app module wires everything together.

#### Q18: How do you migrate a monolithic app to a multi-module architecture?

Start from the bottom. Extract `:core:network` and `:core:database` first — these have the fewest dependencies on app code. Then extract `:domain` with repository interfaces and use cases. Finally, extract feature modules one at a time, starting with the most isolated feature.

The practical steps for extracting a feature module: identify all classes belonging to the feature, move them to a new module, make everything that other modules need `public`, make everything else `internal`, add the dependency in the app module's `build.gradle.kts`, and fix compilation errors. The compilation errors tell you exactly where the module boundary isn't clean — those are the spots that need an interface or a shared module.

Don't try to modularize everything at once. Extract one module, stabilize, then extract the next. A full migration for a large app can take months of incremental work alongside regular feature development.

### Common Follow-ups

- How do you handle version catalogs (TOML) in a multi-module project?
- What is the build performance impact of KSP vs KAPT in multi-module?
- How do you share test fixtures and test utilities across modules?
- What is the role of `buildSrc` vs `build-logic` convention plugins?
- How do you handle feature flags that enable or disable entire feature modules?
- What happens when a feature module grows too large — how do you split it further?
- How do you handle ProGuard/R8 rules in a multi-module project?
- What is the difference between Android library module and pure Kotlin/JVM module?
