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

1. **Choose Feature-Based Modules Over Layer-Based Modules**
The most common modularization mistake is splitting by architectural layer — a `:data` module, a `:domain` module, a `:presentation` module. This feels clean on a diagram, but it creates modules that change for every feature. Add a new screen? You touch all three modules. Every pull request crosses module boundaries, and you lose the main benefit of modularization: independent, parallel work on isolated features.

Feature-based modules group everything a feature needs — its UI, its repository, its use cases, its models — into one module. The `:search` module contains search-related screens, data sources, and domain logic. The `:checkout` module owns the checkout flow end to end. Shared infrastructure like networking and database lives in a `:core` module. This way, two developers working on search and checkout never touch the same files or create merge conflicts.

```kotlin
// Feature-based module structure
// :feature:search/
//   ui/SearchScreen.kt
//   data/SearchRepository.kt
//   domain/SearchUseCase.kt
//   di/SearchModule.kt
//
// :feature:checkout/
//   ui/CheckoutScreen.kt
//   data/CheckoutRepository.kt
//   domain/CheckoutUseCase.kt
//   di/CheckoutModule.kt
//
// :core:network/
//   HttpClient.kt
//   AuthInterceptor.kt
//
// :core:database/
//   AppDatabase.kt
```

The tradeoff is that feature modules can duplicate some code. Two features might define similar data classes or utility functions. The instinct is to extract everything shared into `:core`, but over-extracting creates a bloated core module that everything depends on — defeating the purpose of modularization. My rule of thumb: duplicate code across features until you see the same abstraction appear three times, then extract it. Premature extraction creates coupling; late extraction is a simple refactor.

2. **Avoid Circular Dependencies at All Costs**
Circular dependencies between modules are the modularization equivalent of spaghetti code. Module A depends on Module B, which depends on Module A. Gradle won't even compile this — you get a build error. But the real problem starts earlier, when the dependency graph is technically acyclic but practically circular through transitive dependencies. Module A depends on B, B depends on C, and C depends on A through a shared utility.

The fix is dependency inversion. If `:feature:checkout` needs to navigate to `:feature:profile`, it shouldn't depend on the profile module directly. Instead, both modules depend on a `:navigation` or `:core:contracts` module that defines navigation interfaces. The checkout module calls the interface; the app module wires up the concrete implementation.

```kotlin
// :core:navigation — defines contracts, depends on nothing feature-specific
interface ProfileNavigator {
    fun navigateToProfile(userId: String)
}

interface CheckoutNavigator {
    fun navigateToCheckout(cartId: String)
}

// :feature:checkout — depends on :core:navigation, not on :feature:profile
class CheckoutViewModel(
    private val profileNavigator: ProfileNavigator
) : ViewModel() {
    fun onViewSellerProfile(sellerId: String) {
        profileNavigator.navigateToProfile(sellerId)
    }
}

// :app — wires concrete implementations
class AppProfileNavigator(
    private val navController: NavController
) : ProfileNavigator {
    override fun navigateToProfile(userId: String) {
        navController.navigate("profile/$userId")
    }
}
```

This pattern adds indirection, and for a 3-module app it's over-engineering. But the moment you have 10+ feature modules, circular dependency prevention through contracts becomes the only way to keep the dependency graph clean and builds parallelizable. I've seen codebases where adding this pattern reduced build times by 40% because Gradle could finally compile modules in parallel instead of waiting for the tangled dependency chain to resolve sequentially.

3. **Create API Modules for Internal Implementation Modules**
When Module A depends on Module B, it can access everything in B's public API — including internal implementation classes that happen to be `public` in Kotlin. This leaks implementation details across module boundaries. The solution is to split each module into an API module (public contracts) and an implementation module (private details).

```kotlin
// :feature:search:api — only interfaces and models
interface SearchRepository {
    suspend fun search(query: String): List<SearchResult>
    fun observeRecentSearches(): Flow<List<String>>
}

data class SearchResult(
    val id: String,
    val title: String,
    val relevanceScore: Float
)

// :feature:search:impl — the actual implementation, depends on :api
internal class SearchRepositoryImpl(
    private val searchApi: SearchApi,
    private val searchDao: SearchDao,
    private val ioDispatcher: CoroutineDispatcher
) : SearchRepository {
    override suspend fun search(query: String): List<SearchResult> {
        return withContext(ioDispatcher) {
            val remote = searchApi.search(query)
            searchDao.cacheResults(remote)
            remote.map { it.toSearchResult() }
        }
    }

    override fun observeRecentSearches(): Flow<List<String>> {
        return searchDao.observeRecentQueries()
    }
}
```

Other modules depend on `:feature:search:api`, not `:feature:search:impl`. The `internal` visibility modifier on the implementation class ensures nothing outside the impl module can instantiate it directly. Only the DI module wires the interface to its implementation. This is the same principle as `interface` vs `class` at the code level, applied at the module level. The tradeoff is double the module count — for 10 features, you have 20 modules. In practice, the API modules are tiny (a few interfaces and data classes each), so the maintenance burden is low.

4. **Optimize Build Times Through Module Graph Design**
One of the primary reasons to modularize is faster builds. But this only works if your module graph actually allows parallel compilation. If every module depends on `:core` and `:core` depends on half the codebase, Gradle still compiles most things sequentially.

The goal is a wide, shallow dependency graph — many modules at the same depth level that can compile in parallel, with minimal serial dependencies between them. Measure this by looking at your critical path: the longest chain of module dependencies from a leaf to the root.

Here's what actually moves the needle on build times: use `implementation` instead of `api` in your `build.gradle.kts` dependencies. When Module A uses `api` to depend on Module B, any module depending on A also sees B's classes. This means a change in B triggers recompilation of A and everything that depends on A. With `implementation`, B's changes only recompile A — everything else is isolated.

```kotlin
// build.gradle.kts for :feature:search:impl

dependencies {
    // 'implementation' — SearchApi changes don't trigger recompilation
    // of modules that depend on :feature:search:impl
    implementation(project(":core:network"))
    implementation(project(":core:database"))

    // 'api' — only for types exposed in public function signatures
    api(project(":feature:search:api"))
}
```

The rule is: use `api` only when a type from the dependency appears in your module's public API (public function parameters, return types, or supertypes). Everything else should be `implementation`. In a codebase I worked on, changing all unnecessary `api` declarations to `implementation` reduced incremental build times from 90 seconds to 35 seconds because Gradle could skip recompilation of unaffected modules.

5. **Apply Dependency Inversion Between Modules**
When a feature module needs something from another feature module, the instinct is to add a direct dependency. `:feature:order` needs the user's shipping address, so it depends on `:feature:profile`. This creates coupling — changes to the profile module's internal structure can break the order module, and you can't work on orders without pulling in the entire profile module.

Dependency inversion flips this: instead of depending on the concrete module, depend on an abstraction. Define an interface in a shared module or in the consuming module, and let the app module wire up the concrete implementation at runtime through DI.

```kotlin
// Defined in :feature:order (or :core:contracts)
interface ShippingAddressProvider {
    suspend fun getDefaultAddress(userId: String): ShippingAddress?
}

// Implemented in :feature:profile:impl
class ProfileShippingAddressProvider(
    private val profileRepository: ProfileRepository
) : ShippingAddressProvider {
    override suspend fun getDefaultAddress(userId: String): ShippingAddress? {
        return profileRepository.getProfile(userId)?.defaultAddress?.toShippingAddress()
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

The order module never knows about profiles. It asks for a `ShippingAddressProvider` and gets one. If you later decide to store addresses in a separate service instead of the profile, you change one implementation class and one DI binding — zero changes to the order module. This is the same dependency inversion principle from SOLID, applied at the module architecture level.

6. **Know When NOT to Modularize**
Not every project needs modularization. I've seen teams spend weeks extracting modules from a 20-screen app, adding build configuration complexity, navigation indirection, and DI ceremony — only to realize that their build times went up because the Gradle module resolution overhead exceeded the parallelization gains.

Modularization pays off when you have more than 3 developers working on the same codebase, when your clean build exceeds 3-4 minutes, or when features are genuinely independent enough that teams can own them separately. For a solo developer or a small team on a focused app, a well-organized single-module project with clear package boundaries is simpler and faster to work with.

The honest truth is that modularization is an organizational solution as much as a technical one. It enforces boundaries that a disciplined team could enforce through code review and convention. If your team is small and disciplined, packages with clear naming conventions give you 80% of the benefit with 20% of the complexity. If your team is large or growing, modules provide hard boundaries that don't rely on discipline — Gradle enforces them at compile time, and that's worth the overhead.

7. **Use Version Catalogs for Dependency Management**
When you have 15 modules, managing dependency versions across separate `build.gradle.kts` files is a consistency nightmare. Module A uses Retrofit 2.9.0, Module B uses 2.11.0, and Module C accidentally uses 2.8.0 because someone copied from an old template. Version catalogs centralize every dependency version in a single `libs.versions.toml` file that every module references.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.0.21"
coroutines = "1.9.0"
retrofit = "2.11.0"
room = "2.6.1"
hilt = "2.51.1"

[libraries]
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
retrofit-core = { module = "com.squareup.retrofit2:retrofit", version.ref = "retrofit" }
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }

[bundles]
coroutines = ["kotlinx-coroutines-core", "kotlinx-coroutines-android"]
```

```kotlin
// Any module's build.gradle.kts
dependencies {
    implementation(libs.retrofit.core)
    implementation(libs.bundles.coroutines)
    implementation(libs.room.runtime)
    ksp(libs.room.compiler)
}
```

The type-safe accessor (`libs.retrofit.core`) gives you IDE autocomplete and compile-time errors if you reference a dependency that doesn't exist in the catalog. Updating a library version is a one-line change in `libs.versions.toml` instead of a find-and-replace across 15 build files. The tradeoff is that version catalogs have a learning curve, and the TOML syntax is unfamiliar to most Android developers. But the investment pays for itself after the second time you need to update a library across the project.

8. **Use Convention Plugins to Share Build Logic**
Once you have more than 5 modules, you'll notice that every module's `build.gradle.kts` repeats the same boilerplate — the same `compileSdk`, the same `jvmTarget`, the same set of plugins. Convention plugins let you define shared build configuration once and apply it everywhere.

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

Without convention plugins, adding a new module means copying 40 lines of build configuration from an existing module and hoping you didn't miss anything. With convention plugins, it's one plugin ID. More importantly, when you need to bump `compileSdk` or `minSdk`, you change it in one place instead of 15. Google's Now In Android reference project uses this pattern extensively, and it's become the standard approach for multi-module Android projects. The initial setup takes a couple of hours, but it eliminates an entire category of "my module has a different config" bugs.

9. **Design Your Module Boundaries Around Team Ownership**
Technical boundaries and team boundaries should align. If the payments team owns `:feature:payment` and the search team owns `:feature:search`, module boundaries become ownership boundaries. Each team can work autonomously — they own their module's tests, their CI pipeline, their release cadence (if using dynamic feature modules).

When module boundaries don't match team boundaries, you get constant cross-team pull requests. The search team needs a change in the `:data` layer module that the platform team owns, so they submit a PR, wait for review, negotiate the API — a 2-day delay for a 10-minute code change. Feature modules owned by a single team eliminate this coordination overhead.

This also affects how you decide what goes into `:core`. Core modules should be owned by a platform or infrastructure team. They should have a stable API that changes infrequently. If `:core` is changing every sprint because feature teams keep needing new utilities, either the core module's scope is too broad or the feature modules need to own more of their dependencies. The healthiest multi-module codebases I've seen have a small, stable core and fat, autonomous feature modules.

10. **Enforce Module Boundaries With Gradle Dependency Rules**
Module boundaries only work if they're enforced. Without enforcement, a developer under deadline pressure adds a direct dependency on `:feature:profile:impl` from `:feature:order` because it's faster than creating an interface. Six months later, your clean module graph is a tangled mess.

Gradle provides tools to enforce dependency rules programmatically. You can write custom Gradle plugins or use dependency constraints to fail the build when a module depends on something it shouldn't.

```kotlin
// settings.gradle.kts — enforce that feature modules can't depend on each other's impl
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
                            "Module $path cannot depend on another feature's impl: ${requested}"
                        )
                    }
                }
            }
        }
    }
}
```

This is blunt but effective. A more sophisticated approach is to use tools like Dependency Guard or custom lint rules that validate the module graph on CI. The point is that module boundaries are only as strong as their enforcement. Code review catches some violations, but automated checks catch all of them. One violation that goes unchecked sets a precedent, and soon "just this once" becomes "we always do this."

Thanks for reading through all of this :), Happy Coding!
