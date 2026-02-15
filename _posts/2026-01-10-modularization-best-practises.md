---
title: Modularization Best Practices Guide
layout: post
sequence: 76
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
  - Gradle
---

I've worked on Android codebases that ranged from a single module with 200 files dumped into a handful of packages, all the way to 40+ module projects where adding a new feature meant creating three modules before writing a single line of business logic. Both extremes taught me something. The single-module project was fast to navigate and simple to reason about — until four developers started stepping on each other's toes in every pull request. The heavily modularized project gave teams independence, but the build configuration overhead and navigation indirection made onboarding a nightmare.

Modularization isn't something you do because a conference talk told you to. It's an organizational and architectural decision that should be driven by real pain — slow builds, merge conflicts, teams blocking each other, or code boundaries that keep getting violated. When done well, it gives you parallel builds, clear ownership, and the ability to reason about features in isolation. When done poorly, it gives you 30 Gradle files to maintain, circular dependency headaches, and build times that somehow got worse.

Here's what I've learned actually matters when modularizing an Android codebase. Not the theory-heavy stuff you find in architecture docs, but the practical decisions that determine whether your multi-module setup helps or hurts your team.

## Module Types and Naming Conventions

Before writing any code, you need a clear taxonomy of what kinds of modules exist in your project and what goes where. I've seen teams invent module names ad hoc — `:utils`, `:shared`, `:common`, `:base` — and six months later nobody can tell you what the difference between `:common` and `:shared` is. A consistent naming convention prevents this entirely.

The module types I've found work best across projects of different sizes are `:app`, `:feature:*`, `:core:*`, and `:lib:*`. The `:app` module is your application entry point — it applies the `com.android.application` plugin, owns `Application` class, wires DI, and declares the navigation graph. It depends on everything but nothing depends on it. Feature modules follow the `:feature:<name>` pattern — `:feature:search`, `:feature:checkout`, `:feature:profile`. Each one owns its screens, ViewModels, repositories, and DI bindings for a single user-facing feature. Core modules use `:core:<name>` for shared infrastructure — `:core:network`, `:core:database`, `:core:ui`, `:core:testing`. These are owned by a platform team and should have a stable API that rarely changes. Finally, `:lib:*` is for pure Kotlin/Java libraries with no Android dependencies — `:lib:analytics-api`, `:lib:formatting`. These compile faster because they skip the Android Gradle plugin overhead entirely.

When you adopt the API/impl split, the naming extends naturally. `:core:network:api` holds the interfaces and models, `:core:network:impl` holds the Retrofit or Ktor implementation. Feature modules only depend on `:api` modules, never on `:impl`. The `:app` module is the only place that wires `:impl` to `:api` through DI bindings.

```kotlin
// settings.gradle.kts — a well-structured module graph
include(":app")

// Feature modules — one per user-facing feature
include(":feature:search")
include(":feature:checkout")
include(":feature:profile")
include(":feature:order-history")

// Core modules — shared Android infrastructure
include(":core:network:api")
include(":core:network:impl")
include(":core:database")
include(":core:ui")
include(":core:navigation")
include(":core:testing")

// Lib modules — pure Kotlin, no Android dependency
include(":lib:analytics-api")
include(":lib:formatting")
include(":lib:result")
```

The naming convention itself is the documentation. When a new developer sees `:feature:checkout`, they know it's a self-contained feature. When they see `:core:network:api`, they know it's a stable interface module. Teams that establish this taxonomy early spend far less time debating "where does this code go?" in code review.

## Feature-Based Modules and Team Ownership

The most common modularization mistake is splitting by architectural layer — a `:data` module, a `:domain` module, a `:presentation` module. This feels clean on a diagram, but it creates modules that change for every feature. Add a new screen? You touch all three modules. Every pull request crosses module boundaries, and you lose the main benefit of modularization: independent, parallel work on isolated features.

Feature-based modules group everything a feature needs — its UI, its repository, its use cases, its models — into one module. The `:feature:search` module contains search-related screens, data sources, and domain logic. The `:feature:checkout` module owns the checkout flow end to end. Two developers working on search and checkout never touch the same files or create merge conflicts.

The tradeoff is that feature modules can duplicate some code. Two features might define similar data classes or utility functions. The instinct is to extract everything shared into `:core`, but over-extracting creates a bloated core module that everything depends on — defeating the purpose of modularization. My rule of thumb: duplicate code across features until you see the same abstraction appear three times, then extract it. Premature extraction creates coupling; late extraction is a simple refactor.

This structure works even better when module boundaries and team boundaries align. If the payments team owns `:feature:payment` and the search team owns `:feature:search`, module boundaries become ownership boundaries. Each team works autonomously — they own their tests, their CI pipeline, their release cadence. When module boundaries don't match team boundaries, you get constant cross-team pull requests — a 2-day delay for a 10-minute code change. The healthiest multi-module codebases I've seen have a small, stable core and fat, autonomous feature modules.

## Managing Dependencies Between Modules

Circular dependencies between modules are the modularization equivalent of spaghetti code. Gradle won't compile them — you get a build error. But the real problem starts earlier, when the dependency graph is technically acyclic but practically circular through transitive dependencies.

The fix is dependency inversion. If `:feature:checkout` needs data from `:feature:profile`, define an interface in a shared module like `:core:contracts`, and let the app module wire the concrete implementation at runtime through DI. The checkout module never knows about profiles — it asks for a `ShippingAddressProvider` and gets one.

```kotlin
// Defined in :core:contracts
interface ShippingAddressProvider {
    suspend fun getDefaultAddress(userId: String): ShippingAddress?
}

// Implemented in :feature:profile
internal class ProfileShippingAddressProvider(
    private val profileRepository: ProfileRepository
) : ShippingAddressProvider {
    override suspend fun getDefaultAddress(userId: String): ShippingAddress? {
        return profileRepository.getProfile(userId)
            ?.defaultAddress
            ?.toShippingAddress()
    }
}

// Wired in :app's DI module
@Module
@InstallIn(SingletonComponent::class)
abstract class AddressBindingsModule {
    @Binds
    abstract fun bindShippingAddressProvider(
        impl: ProfileShippingAddressProvider
    ): ShippingAddressProvider
}
```

This pattern adds indirection, and for a 3-module app it's over-engineering. But the moment you have 10+ feature modules, circular dependency prevention through contracts becomes the only way to keep the dependency graph clean and builds parallelizable. I've seen codebases where adding this pattern reduced build times by 40% because Gradle could finally compile modules in parallel instead of waiting for a tangled dependency chain to resolve sequentially.

Taking this further, the API/impl split I mentioned earlier prevents a subtler problem. When Module A depends on Module B, it can access everything in B's public API — including implementation classes that happen to be `public` in Kotlin. The split puts only interfaces and data classes in `:api`, marks implementation classes `internal` in `:impl`, and ensures other modules can only depend on the stable contract. The tradeoff is double the module count, but in practice the API modules are tiny — a few interfaces and data classes each — so the maintenance burden is low.

## Navigation Between Feature Modules

Here's a problem that bites every multi-module project: how does `:feature:checkout` navigate to `:feature:profile` without depending on it? If the checkout module imports `ProfileScreen` directly, you've created a hard dependency. Every feature ends up depending on every other feature, and your module graph collapses into a monolith with extra Gradle files.

The contract-based approach applies here too. Each feature module registers its routes as type-safe route objects in a shared `:core:navigation` module, and the `:app` module builds the full `NavHost` that wires everything together. No feature module ever imports another feature's screen composable.

```kotlin
// :core:navigation — shared route definitions
sealed interface AppRoute {
    @Serializable data class Profile(val userId: String) : AppRoute
    @Serializable data class Checkout(val cartId: String) : AppRoute
    @Serializable data object Search : AppRoute
}

// :feature:checkout — navigates using route objects, no profile dependency
@Composable
fun CheckoutScreen(
    cartId: String,
    onViewSeller: (String) -> Unit
) {
    // ... checkout UI
    Button(onClick = { onViewSeller(sellerId) }) {
        Text("View Seller")
    }
}

// :app — wires the full navigation graph
@Composable
fun AppNavHost(navController: NavHostController) {
    NavHost(navController, startDestination = AppRoute.Search) {
        composable<AppRoute.Search> {
            SearchScreen(onProductClick = { id ->
                navController.navigate(AppRoute.Checkout(id))
            })
        }
        composable<AppRoute.Checkout> { entry ->
            val route = entry.toRoute<AppRoute.Checkout>()
            CheckoutScreen(
                cartId = route.cartId,
                onViewSeller = { navController.navigate(AppRoute.Profile(it)) }
            )
        }
        composable<AppRoute.Profile> { entry ->
            ProfileScreen(userId = entry.toRoute<AppRoute.Profile>().userId)
        }
    }
}
```

The key insight is that feature composables expose navigation as lambda parameters — `onViewSeller: (String) -> Unit` — instead of taking a `NavController` directly. This keeps feature modules completely unaware of the navigation framework. You could swap Navigation Compose for Circuit's navigation or even a custom solution, and no feature module changes. Deep linking works naturally too — you define URI patterns on the `composable` declarations in the `:app` module, and the same route objects handle both in-app navigation and external deep links.

## Dependency Injection in Multi-Module Apps

DI in a single-module app is straightforward. But the moment you split into 15 modules, questions pile up. Where do you put `@Module` classes? How does a feature module provide bindings that other modules consume? How do you access the DI graph from places Hilt doesn't natively support?

With Hilt, each module defines its own `@Module`-annotated class with `@InstallIn` to specify which component it belongs to. `SingletonComponent` for app-scoped singletons, `ViewModelComponent` for ViewModel-scoped dependencies, `ActivityComponent` for activity-scoped ones. Feature modules install their bindings into the appropriate component, and Hilt merges everything at compile time. No feature module needs to know about any other feature module's bindings.

```kotlin
// :core:network:impl — provides app-scoped network dependencies
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .build()
    }
}

// :feature:search — provides search-scoped dependencies
@Module
@InstallIn(ViewModelComponent::class)
abstract class SearchModule {
    @Binds
    abstract fun bindSearchRepository(
        impl: SearchRepositoryImpl
    ): SearchRepository
}

// :feature:search — ViewModel just @Injects what it needs
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchRepository: SearchRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {
    // searchRepository comes from SearchModule
    // analyticsTracker comes from :core:analytics, installed in SingletonComponent
}
```

The rule I follow: `@InstallIn(SingletonComponent::class)` for infrastructure that lives for the entire app lifetime — network clients, databases, analytics. `@InstallIn(ViewModelComponent::class)` for feature-specific bindings that should be scoped to a ViewModel's lifetime. Avoid `@InstallIn(ActivityComponent::class)` unless you genuinely need activity-scoped state, which is rarer than people think.

Now, there's one more Hilt concept that becomes critical in multi-module apps: `@EntryPoint`. Hilt can only inject into classes it knows about — Activities, Fragments, ViewModels, and a few others. But sometimes you need DI access from a `ContentProvider`, a `WorkManager` worker, or a class that a third-party SDK instantiates. `@EntryPoint` defines an interface that lets you pull dependencies from the component hierarchy manually.

```kotlin
// :core:sync — needs DI access from a WorkManager Worker
@EntryPoint
@InstallIn(SingletonComponent::class)
interface SyncEntryPoint {
    fun syncRepository(): SyncRepository
    fun analyticsTracker(): AnalyticsTracker
}

class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val entryPoint = EntryPointAccessors
            .fromApplication(applicationContext, SyncEntryPoint::class.java)
        val syncRepo = entryPoint.syncRepository()
        val tracker = entryPoint.analyticsTracker()

        return try {
            syncRepo.syncPendingChanges()
            tracker.trackSyncCompleted()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
```

Without `@EntryPoint`, you'd have to pass dependencies manually through the `WorkerFactory`, which gets messy across module boundaries. The entry point pattern lets any module reach into the DI graph as long as it knows the interface.

## Build Performance and Gradle Configuration

One of the primary reasons to modularize is faster builds. But this only works if your module graph actually allows parallel compilation. If every module depends on `:core` and `:core` depends on half the codebase, Gradle still compiles most things sequentially. The goal is a wide, shallow dependency graph — many modules at the same depth level that can compile in parallel, with minimal serial dependencies between them.

Here's what actually moves the needle on build times: use `implementation` instead of `api` in your `build.gradle.kts` dependencies. When Module A uses `api` to depend on Module B, any module depending on A also sees B's classes — a change in B triggers recompilation of A and everything that depends on A. With `implementation`, B's changes only recompile A. Use `api` only when a type from the dependency appears in your module's public function signatures. In a codebase I worked on, changing all unnecessary `api` declarations to `implementation` reduced incremental build times from 90 seconds to 35 seconds.

```kotlin
// build.gradle.kts for :feature:search:impl
dependencies {
    implementation(project(":core:network"))
    implementation(project(":core:database"))

    // 'api' only because SearchResult appears in public function signatures
    api(project(":feature:search:api"))
}
```

Once your module count grows, managing dependency versions across separate `build.gradle.kts` files becomes a consistency nightmare. Version catalogs solve this by centralizing every dependency in a single `libs.versions.toml` file. The type-safe accessor (`libs.retrofit.core`) gives you IDE autocomplete and compile-time errors. Updating a library version becomes a one-line change instead of find-and-replace across 15 build files.

Convention plugins take this further by eliminating boilerplate. Every module's `build.gradle.kts` repeats the same `compileSdk`, `jvmTarget`, and plugin set. With a convention plugin, you define it once and apply it with a single plugin ID.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeaturePlugin.kt
class AndroidFeaturePlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            with(pluginManager) {
                apply("com.android.library")
                apply("org.jetbrains.kotlin.android")
                apply("com.google.devtools.ksp")
                apply("com.google.dagger.hilt.android")
            }
            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig { minSdk = 26 }
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }
        }
    }
}

// Any feature module's build.gradle.kts — one line
plugins {
    id("app.android.feature")
}
```

The initial setup takes a couple of hours, but it eliminates an entire category of "my module has a different config" bugs. Google's Now In Android project uses this pattern extensively.

## When and How to Enforce Boundaries

Not every project needs modularization, and I think this is worth being honest about. I've seen teams spend weeks extracting modules from a 20-screen app — only to realize their build times went up because the Gradle module resolution overhead exceeded the parallelization gains.

Modularization pays off when you have more than 3 developers on the same codebase, when your clean build exceeds 3-4 minutes, or when features are genuinely independent enough for separate team ownership. For a solo developer or small team, a well-organized single-module project with clear package boundaries is simpler and faster. Packages give you 80% of the benefit with 20% of the complexity. Modules provide hard boundaries that Gradle enforces at compile time — and for larger teams, that's worth the overhead.

But here's the thing — module boundaries only work if they're actually enforced. Without enforcement, a developer under deadline pressure adds a direct dependency on `:feature:profile:impl` from `:feature:order` because it's faster than creating an interface. Six months later, your clean module graph is a tangled mess. You can enforce dependency rules programmatically to fail the build when a module depends on something it shouldn't.

```kotlin
// settings.gradle.kts — enforce that feature modules can't depend
// on each other's impl
gradle.lifecycle.beforeProject {
    afterEvaluate {
        if (path.startsWith(":feature:") && path.endsWith(":impl")) {
            configurations.all {
                resolutionStrategy.eachDependency {
                    if (requested.toString().contains(":feature:") &&
                        requested.toString().contains(":impl") &&
                        requested.toString() != project.path
                    ) {
                        throw GradleException(
                            "Module $path cannot depend on " +
                            "another feature's impl: ${requested}"
                        )
                    }
                }
            }
        }
    }
}
```

This is blunt but effective. A more sophisticated approach is to use tools like Dependency Guard or custom lint rules that validate the module graph on CI. Module boundaries are only as strong as their enforcement — code review catches some violations, but automated checks catch all of them.

Thanks for reading through all of this :), Happy Coding!
