---
title: Modularization Best Practices Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
  - Gradle
---

I've worked on Android codebases at both extremes of the modularization spectrum. On one end: a single module with 200 files crammed into a handful of packages. On the other: a 40+ module project where adding a new feature meant creating three modules before writing a single line of business logic.

Both taught me something. The single-module project was fast to navigate and simple to reason about — until four developers started stepping on each other's toes in every pull request. The heavily modularized project gave teams independence, but the build configuration overhead and navigation indirection made onboarding a nightmare.

Think of it like organizing a kitchen. A home kitchen with one person cooking? Just throw everything in a few drawers, you'll find it. A restaurant kitchen with ten chefs? You need stations — prep station, grill station, dessert station — with clear boundaries and their own tools. But if you create 40 stations for a five-person bistro, people spend more time walking between stations than actually cooking. Modularization is the same tradeoff: the right level of separation depends entirely on the size and shape of your team.

Modularization isn't something you do because a conference talk told you to. It's an organizational and architectural decision that should be driven by real pain — slow builds, merge conflicts, teams blocking each other, or code boundaries that keep getting violated. When done well, it gives you parallel builds, clear ownership, and the ability to reason about features in isolation. When done poorly, it gives you 30 Gradle files to maintain, circular dependency headaches, and build times that somehow got worse.

Here's what I've learned actually matters when modularizing an Android codebase. Not the theory-heavy stuff you find in architecture docs, but the practical decisions that determine whether your multi-module setup helps or hurts your team.

## Module Types and Naming Conventions

Before writing any code, you need a clear taxonomy of what kinds of modules exist in your project and what goes where. I've seen teams invent module names ad hoc — `:utils`, `:shared`, `:common`, `:base` — and six months later nobody can tell you what the difference between `:common` and `:shared` is.

Sound familiar? Yeah. A consistent naming convention prevents this entirely.

The module types I've found work best across projects of different sizes are `:app`, `:feature:*`, `:core:*`, and `:lib:*`. Think of it like departments in a company. The `:app` module is like the CEO's office — it's the entry point that coordinates everything. It applies the `com.android.application` plugin, owns the `Application` class, wires DI, and declares the navigation graph. It depends on everything but nothing depends on it.

Feature modules are the product teams — `:feature:search`, `:feature:checkout`, `:feature:profile`. Each one owns its screens, ViewModels, repositories, and DI bindings for a single user-facing feature. They work independently and ship independently.

Core modules are the shared services — `:core:network`, `:core:database`, `:core:ui`, `:core:testing`. Owned by a platform team, they should have a stable API that rarely changes. Like the company's IT department: everyone uses them, they need to be reliable, and they shouldn't be changing their interfaces every week.

Finally, `:lib:*` is for pure Kotlin/Java libraries with no Android dependencies — `:lib:analytics-api`, `:lib:formatting`. These compile faster because they skip the Android Gradle plugin overhead entirely.

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

Here's where I see the most common modularization mistake, and it's a sneaky one because it *looks* clean on a whiteboard.

Teams split by architectural layer — a `:data` module, a `:domain` module, a `:presentation` module. Neat diagram, right? Three boxes, clean arrows. But here's the problem: these modules change for *every single feature*. Add a new screen? You touch all three modules. Every pull request crosses module boundaries, and you lose the main benefit of modularization: independent, parallel work on isolated features.

It's like organizing a restaurant kitchen by utensil type instead of by cooking station. One drawer for all knives, one shelf for all pots, one cabinet for all spices. Sounds organized until the pasta chef and the grill chef are fighting over the same drawer at the same time. You've organized things, but you haven't given anyone independence.

Feature-based modules flip this. They group everything a feature needs — its UI, its repository, its use cases, its models — into one module. The `:feature:search` module contains search-related screens, data sources, and domain logic. The `:feature:checkout` module owns the checkout flow end to end. Two developers working on search and checkout never touch the same files or create merge conflicts.

> **🧠 Think about it:** If two developers on your team are constantly creating merge conflicts, is that a people problem or a module boundary problem?

The tradeoff is that feature modules can duplicate some code. Two features might define similar data classes or utility functions. The instinct is to extract everything shared into `:core`, but over-extracting creates a bloated core module that everything depends on — defeating the purpose of modularization. My rule of thumb: duplicate code across features until you see the same abstraction appear three times, then extract it. Premature extraction creates coupling; late extraction is a simple refactor.

This structure works even better when module boundaries and team boundaries align. If the payments team owns `:feature:payment` and the search team owns `:feature:search`, module boundaries become ownership boundaries. Each team works autonomously — they own their tests, their CI pipeline, their release cadence. When module boundaries don't match team boundaries, you get constant cross-team pull requests — a 2-day delay for a 10-minute code change. The healthiest multi-module codebases I've seen have a small, stable core and fat, autonomous feature modules.

## Managing Dependencies Between Modules

Circular dependencies between modules are the modularization equivalent of spaghetti code. Gradle won't compile them — you get a build error. But the real problem starts earlier, when the dependency graph is technically acyclic but practically circular through transitive dependencies.

Imagine this: `:feature:checkout` needs the user's shipping address, which lives in `:feature:profile`. So you add a dependency from checkout to profile. Then the profile team needs to show recent orders on the profile page — so they add a dependency from profile to checkout.

Boom. Circular dependency. Gradle throws an error and refuses to compile.

The fix is dependency inversion — and the analogy here is a restaurant menu. The kitchen (`:feature:profile`) doesn't need to know who's ordering. It just publishes a menu (an interface in `:core:contracts`). The waiter (`:app` module) takes the order from the customer (`:feature:checkout`) and passes it to the kitchen. The customer never walks into the kitchen, and the kitchen never walks out to the table. Everyone communicates through the menu.

In code, that means defining an interface in a shared module like `:core:contracts`, and letting the app module wire the concrete implementation at runtime through DI. The checkout module never knows about profiles — it asks for a `ShippingAddressProvider` and gets one.

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

> **💡 The "aha" moment:** The API/impl split isn't about organization — it's about making it *physically impossible* for one module to depend on another's implementation details. You can't accidentally call a function that doesn't exist in your dependency's public surface.

## Navigation Between Feature Modules

Here's a problem that bites every multi-module project: how does `:feature:checkout` navigate to `:feature:profile` without depending on it?

If the checkout module imports `ProfileScreen` directly, you've created a hard dependency. Every feature ends up depending on every other feature, and your module graph collapses into a monolith with extra Gradle files. You did all that work splitting things apart, and your imports just glued them right back together.

The contract-based approach applies here too. Think of it like an airport. Gates (feature modules) don't have direct tunnels to each other. Instead, they all connect to a central terminal (`:core:navigation`) with a departure board (route objects). A passenger at Gate B doesn't need to know anything about Gate C — they just look at the departure board and follow the signs. The airport (`:app` module) wires all the gates together into a navigation graph.

Each feature module registers its routes as type-safe route objects in a shared `:core:navigation` module, and the `:app` module builds the full `NavHost` that wires everything together. No feature module ever imports another feature's screen composable.

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

Notice something important? Feature composables expose navigation as lambda parameters — `onViewSeller: (String) -> Unit` — instead of taking a `NavController` directly. This keeps feature modules completely unaware of the navigation framework. You could swap Navigation Compose for Circuit's navigation or even a custom solution, and no feature module changes. Deep linking works naturally too — you define URI patterns on the `composable` declarations in the `:app` module, and the same route objects handle both in-app navigation and external deep links.

That lambda pattern is the key. The feature says "I need to go somewhere" and the app decides where. Clean separation.

## Dependency Injection in Multi-Module Apps

DI in a single-module app is straightforward. But the moment you split into 15 modules, questions pile up. Where do you put `@Module` classes? How does a feature module provide bindings that other modules consume? How do you access the DI graph from places Hilt doesn't natively support?

With Hilt, each module defines its own `@Module`-annotated class with `@InstallIn` to specify which component it belongs to. `SingletonComponent` for app-scoped singletons, `ViewModelComponent` for ViewModel-scoped dependencies, `ActivityComponent` for activity-scoped ones. Feature modules install their bindings into the appropriate component, and Hilt merges everything at compile time. No feature module needs to know about any other feature module's bindings.

It's like a potluck dinner. Each team (module) brings their own dish (`@Module` with `@InstallIn`), and Hilt is the host who sets everything out on the same table. Nobody needs to coordinate with anyone else — just show up with your contribution, declare what table you belong on (`SingletonComponent`, `ViewModelComponent`), and Hilt handles the rest.

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

> **⚡ Quick check:** Can you think of a case where you'd actually need `ActivityComponent` scoping instead of `SingletonComponent` or `ViewModelComponent`? If you can't think of one off the top of your head, that's exactly the point — it's rarer than it sounds.

Now, there's one more Hilt concept that becomes critical in multi-module apps: `@EntryPoint`. Hilt can only inject into classes it knows about — Activities, Fragments, ViewModels, and a few others. But sometimes you need DI access from a `ContentProvider`, a `WorkManager` worker, or a class that a third-party SDK instantiates. `@EntryPoint` defines an interface that lets you pull dependencies from the component hierarchy manually.

Think of it like a side door. Hilt's front door only opens for its VIP guests (Activities, ViewModels, etc.). But `@EntryPoint` gives you a side door — you knock, show your `applicationContext`, and Hilt hands you whatever you need.

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

One of the primary reasons to modularize is faster builds. But — and this is important — this only works if your module graph actually allows parallel compilation. If every module depends on `:core` and `:core` depends on half the codebase, Gradle still compiles most things sequentially. The goal is a wide, shallow dependency graph — many modules at the same depth level that can compile in parallel, with minimal serial dependencies between them.

Here's what actually moves the needle on build times, and it's surprisingly simple: use `implementation` instead of `api` in your `build.gradle.kts` dependencies.

What's the difference? Think of it like gossip. When Module A uses `api` to depend on Module B, it's like A telling everyone about B. Any module depending on A also sees B's classes — and a change in B triggers recompilation of A *and* everything that depends on A. The gossip spreads everywhere.

With `implementation`, A keeps B to itself. B's changes only recompile A. The gossip stops. Use `api` only when a type from the dependency appears in your module's public function signatures — that's the only case where downstream modules genuinely need to know about it.

In a codebase I worked on, changing all unnecessary `api` declarations to `implementation` reduced incremental build times from 90 seconds to 35 seconds. That's not a typo.

```kotlin
// build.gradle.kts for :feature:search:impl
dependencies {
    implementation(project(":core:network"))
    implementation(project(":core:database"))

    // 'api' only because SearchResult appears in public function signatures
    api(project(":feature:search:api"))
}
```

> **🔥 Real talk:** I've seen teams where every single dependency was declared as `api` because "it just works." It does work — it just compiles three times slower than it needs to. This is one of those 5-minute fixes that saves hours over time.

Once your module count grows, managing dependency versions across separate `build.gradle.kts` files becomes a consistency nightmare. Version catalogs solve this by centralizing every dependency in a single `libs.versions.toml` file. The type-safe accessor (`libs.retrofit.core`) gives you IDE autocomplete and compile-time errors. Updating a library version becomes a one-line change instead of find-and-replace across 15 build files.

Convention plugins take this further by eliminating boilerplate. Every module's `build.gradle.kts` repeats the same `compileSdk`, `jvmTarget`, and plugin set. With a convention plugin, you define it once and apply it with a single plugin ID. It's like a cookie cutter for module configurations — stamp out perfectly consistent modules every time.

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

But here's the thing — module boundaries only work if they're actually enforced. Think of it like a diet. You can have the best meal plan in the world, but the moment someone stress-eats a whole pizza at 2 AM, it falls apart. Same with modules. Without enforcement, a developer under deadline pressure adds a direct dependency on `:feature:profile:impl` from `:feature:order` because it's faster than creating an interface. Six months later, your clean module graph is a tangled mess.

You can enforce dependency rules programmatically to fail the build when a module depends on something it shouldn't.

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
