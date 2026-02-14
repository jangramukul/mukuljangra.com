---
title: Dependency Injection Best Practices Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
---

1. **Prefer Constructor Injection Over Field Injection**
Constructor injection is the default choice for dependency injection, and field injection should be the exception, not the rule. When dependencies are passed through the constructor, the class declares upfront exactly what it needs to function. You can read the constructor signature and immediately understand the class's collaborators. With field injection, dependencies are invisible until you scan the class body for `@Inject lateinit var` annotations.

There's a deeper reason beyond readability. Constructor-injected dependencies are available from the moment the object is created. Field-injected dependencies are set after construction, which means there's a window where the object exists but isn't fully initialized. If any code runs during construction that touches a field-injected dependency, you get an `UninitializedPropertyAccessException` — and these are notoriously hard to reproduce because they depend on initialization ordering.

```kotlin
// Field injection — dependencies are invisible and late-initialized
class OrderProcessor {
    @Inject lateinit var paymentGateway: PaymentGateway
    @Inject lateinit var inventoryService: InventoryService
    @Inject lateinit var notificationSender: NotificationSender

    fun process(order: Order) {
        // What if this is called before injection completes?
        inventoryService.reserve(order.items)
    }
}

// Constructor injection — explicit, complete from creation
class OrderProcessor(
    private val paymentGateway: PaymentGateway,
    private val inventoryService: InventoryService,
    private val notificationSender: NotificationSender
) {
    fun process(order: Order) {
        inventoryService.reserve(order.items)
    }
}
```

The tradeoff is that Android's Activity and Fragment classes don't support constructor injection because the system instantiates them. For these entry points, field injection through `@AndroidEntryPoint` in Hilt is the practical choice. But that's where it should stop — everything behind those entry points (ViewModels, repositories, use cases, data sources) should use constructor injection exclusively.

2. **Scope Your Dependencies Correctly**
The most common DI mistake I see isn't about how dependencies are injected — it's about how long they live. A database instance scoped to an Activity gets destroyed and recreated on every rotation. A user session scoped as a singleton leaks memory and state across different users. Getting scopes right is the difference between an app that works and an app that works correctly.

The mental model is straightforward: a dependency's scope should match the lifetime of the thing that needs it. Singletons for app-lifetime objects (database, HTTP client, analytics). Activity-scoped for things tied to a user session or feature flow. ViewModel-scoped for things tied to a screen's data lifecycle.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton // Lives for the entire app process
    fun provideHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor())
            .build()
    }
}

@Module
@InstallIn(ViewModelComponent::class)
object FeatureModule {
    @Provides
    @ViewModelScoped // Lives as long as the ViewModel
    fun provideSearchPaginator(
        searchApi: SearchApi
    ): SearchPaginator {
        return SearchPaginator(searchApi, pageSize = 20)
    }
}
```

Here's the thing most developers miss: over-scoping is just as bad as under-scoping. Making everything a `@Singleton` feels safe — "it's created once, no waste." But singletons hold state for the entire process lifetime. If your `UserSessionManager` is a singleton and the user logs out and logs in as a different user, that singleton still holds the previous user's state unless you manually reset it. I've seen this cause real data leakage bugs in production — user A sees user B's cached data because the repository singleton wasn't cleared between sessions.

3. **Don't Use Service Locator Pattern as Dependency Injection**
Service locator and dependency injection solve the same problem — decoupling a class from the concrete creation of its dependencies. But they solve it in fundamentally different ways, and the difference matters for testability and maintainability.

With DI, dependencies are pushed into a class from the outside. The class doesn't know where they come from. With a service locator, the class pulls dependencies from a registry. It knows about the locator and actively reaches into it. This creates a hidden dependency on the locator itself and makes it impossible to know what a class needs without reading its implementation.

```kotlin
// Service locator — class reaches into a global registry
class ShippingCalculator {
    fun calculateCost(order: Order): Double {
        val taxService = ServiceLocator.get<TaxService>() // Hidden dependency
        val rateProvider = ServiceLocator.get<ShippingRateProvider>() // Another one
        val tax = taxService.calculate(order.total)
        return rateProvider.getRate(order.weight) + tax
    }
}

// Dependency injection — dependencies are visible and explicit
class ShippingCalculator(
    private val taxService: TaxService,
    private val rateProvider: ShippingRateProvider
) {
    fun calculateCost(order: Order): Double {
        val tax = taxService.calculate(order.total)
        return rateProvider.getRate(order.weight) + tax
    }
}
```

Testing the service locator version requires setting up the global registry before every test and tearing it down after. Testing the DI version requires passing fake implementations through the constructor — two lines of setup. The service locator version also makes it easy to add dependencies without anyone noticing — just add another `ServiceLocator.get()` call. With constructor injection, every new dependency is visible in the class signature, making code reviews more effective at catching SRP violations.

4. **Use Interfaces for Dependencies You Need to Swap**
Not every dependency needs an interface. A `String` utility class that formats dates doesn't need a `DateFormatter` interface. But any dependency that talks to the outside world — network, database, file system, sensors — should be hidden behind an interface. This isn't about following SOLID for its own sake. It's about having a seam where you can insert fakes during testing and swap implementations without changing consumers.

```kotlin
// Interface defines the contract
interface LocationProvider {
    fun getCurrentLocation(): Flow<Location>
    suspend fun getLastKnownLocation(): Location?
}

// Production implementation
class FusedLocationProvider(
    private val client: FusedLocationProviderClient
) : LocationProvider {
    override fun getCurrentLocation(): Flow<Location> {
        return callbackFlow {
            val callback = object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    result.lastLocation?.let { trySend(it) }
                }
            }
            client.requestLocationUpdates(locationRequest, callback, Looper.getMainLooper())
            awaitClose { client.removeLocationUpdates(callback) }
        }
    }

    override suspend fun getLastKnownLocation(): Location? {
        return client.lastLocation.await()
    }
}

// Test fake — no GPS needed
class FakeLocationProvider(
    private val fixedLocation: Location = Location("test").apply {
        latitude = 37.7749; longitude = -122.4194
    }
) : LocationProvider {
    override fun getCurrentLocation() = flowOf(fixedLocation)
    override suspend fun getLastKnownLocation() = fixedLocation
}
```

The tradeoff is that interfaces add indirection. For simple classes that you'll never swap or fake, the interface is ceremony without benefit. My rule of thumb: if the class does I/O, crosses a process boundary, or has behavior that's inconvenient in tests (like timers, GPS, or analytics), give it an interface. If it's pure logic operating on in-memory data, skip the interface and test it directly.

5. **Too Many Dependencies Is a Design Smell**
If your class constructor has 8 parameters, the problem isn't dependency injection — it's that your class is doing too much. A class with 8 dependencies has 8 reasons to change, which violates the Single Responsibility Principle. DI frameworks make it effortless to add dependencies, which masks the design problem.

I use a rough threshold: if a class has more than 5 injected dependencies, it needs to be decomposed. Usually the fix is to group related dependencies into a new class that handles a specific concern. A `CheckoutViewModel` with dependencies on payment, inventory, shipping, notifications, analytics, user preferences, and discount calculation probably needs a `CheckoutOrchestrator` use case that coordinates some of those concerns.

```kotlin
// Too many dependencies — this class does too much
class CheckoutViewModel(
    private val paymentProcessor: PaymentProcessor,
    private val inventoryChecker: InventoryChecker,
    private val shippingCalculator: ShippingCalculator,
    private val discountEngine: DiscountEngine,
    private val notificationService: NotificationService,
    private val analyticsTracker: AnalyticsTracker,
    private val userPreferences: UserPreferences,
    private val cartRepository: CartRepository
) : ViewModel() { /* ... */ }

// Better — use cases encapsulate related operations
class CheckoutViewModel(
    private val processCheckout: ProcessCheckoutUseCase,
    private val calculateTotal: CalculateTotalUseCase,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() { /* ... */ }
```

The `ProcessCheckoutUseCase` now owns the coordination between payment, inventory, shipping, and notifications. The ViewModel is reduced to its actual job: managing UI state and delegating to use cases. This also makes testing dramatically simpler — you mock 3 dependencies instead of 8.

6. **Understand When to Choose Hilt, Koin, or Manual DI**
The Android DI landscape has three main options, and each makes different tradeoffs. Hilt is Google's recommended framework — compile-time code generation, strong integration with Android components, and catch-at-compile errors. Koin is a lightweight service locator (yes, technically a service locator, not true DI) with runtime resolution and a simpler API. Manual DI means you write your own factories and wire dependencies by hand.

Hilt catches dependency graph errors at compile time. If you forget to provide a binding, your app won't build. Koin catches them at runtime — your app builds fine but crashes when it tries to resolve a missing dependency. In a large team with multiple modules, compile-time safety prevents entire categories of bugs that would otherwise reach QA or production. For a small project or a prototype, Koin's simplicity and zero annotation processing overhead can be the right tradeoff.

Manual DI sounds extreme, but it's what Google's architecture samples used before Hilt existed. For small apps with 10-20 classes, a hand-written `AppContainer` class that creates and holds dependencies is perfectly reasonable. You avoid the learning curve of a framework and the build time overhead of annotation processing. The breakpoint is around 30-40 classes — beyond that, manual wiring becomes a maintenance burden.

Here's what I've seen work well in practice: Hilt for production apps with multiple developers and modules. Koin for side projects, prototypes, and KMP targets where Hilt's Android-specific code generation doesn't work. Manual DI for tiny apps and for understanding how DI actually works before adopting a framework.

7. **Organize Modules by Feature, Not by Layer**
Most Hilt tutorials show a single `AppModule` or separate modules by layer — `NetworkModule`, `DatabaseModule`, `RepositoryModule`. This works for small apps, but it creates god-modules that every feature depends on, makes it hard to find where something is provided, and prevents effective modularization.

Organizing DI modules by feature means each feature has its own module that provides everything it needs. The `search` feature has a `SearchModule`, the `checkout` feature has a `CheckoutModule`. Shared infrastructure (HTTP client, database) stays in a common module, but feature-specific bindings live with the feature.

```kotlin
// Shared infrastructure — things every feature needs
@Module
@InstallIn(SingletonComponent::class)
object CoreNetworkModule {
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient = OkHttpClient.Builder().build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl("https://api.example.com/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
}

// Feature-specific module — lives with the feature code
@Module
@InstallIn(ViewModelComponent::class)
object SearchModule {
    @Provides
    fun provideSearchApi(retrofit: Retrofit): SearchApi {
        return retrofit.create(SearchApi::class.java)
    }

    @Provides
    fun provideSearchRepository(api: SearchApi, db: SearchDao): SearchRepository {
        return SearchRepository(api, db)
    }
}
```

When you later extract the search feature into its own Gradle module, the `SearchModule` moves with it cleanly. If everything was in a monolithic `AppModule`, you'd need to untangle which bindings belong to which feature — a refactoring nightmare that discourages modularization. The tradeoff is more module files, but each one is small, focused, and obvious about what it provides.

8. **Don't Inject ViewModels Into Other ViewModels**
This sounds like a non-issue, but I've seen it attempted. A `CartViewModel` wants data from `UserViewModel`, so a developer tries to inject one ViewModel into the other. This breaks the ViewModel lifecycle contract — ViewModels are scoped to their owner (Activity or Fragment), and injecting one into another creates ambiguous ownership, lifecycle mismatches, and circular dependency risks.

The right pattern is to have ViewModels share data through a repository or use case that both depend on. If `CartViewModel` needs the current user, it gets it from `UserRepository`, not from `UserViewModel`. The repository is the shared state owner; ViewModels are independent consumers of that state.

```kotlin
// Wrong — ViewModel depending on another ViewModel
class CartViewModel(
    private val userViewModel: UserViewModel // Lifecycle nightmare
) : ViewModel()

// Right — both ViewModels depend on shared repository
class CartViewModel(
    private val cartRepository: CartRepository,
    private val userRepository: UserRepository
) : ViewModel() {
    fun loadCart() {
        viewModelScope.launch {
            val user = userRepository.getCurrentUser()
            val cart = cartRepository.getCartForUser(user.id)
            _state.value = CartState.Loaded(cart)
        }
    }
}
```

If two ViewModels truly need to communicate events (not shared data), use a shared Flow scoped to the Activity or a navigation-level scope. But in most cases, the need for ViewModel-to-ViewModel communication signals that the data layer is missing an abstraction.

9. **Use Qualifiers to Distinguish Same-Type Dependencies**
When your DI graph has multiple instances of the same type — two `OkHttpClient` instances (one with auth, one without), two `CoroutineDispatcher` instances (IO vs Default), or two `String` URLs (base URL vs CDN URL) — the framework can't tell them apart by type alone. This is where qualifiers solve the ambiguity.

```kotlin
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AuthenticatedClient

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PublicClient

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    @AuthenticatedClient
    fun provideAuthClient(tokenStore: TokenStore): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .build()
    }

    @Provides
    @Singleton
    @PublicClient
    fun providePublicClient(): OkHttpClient {
        return OkHttpClient.Builder().build()
    }
}

// Usage — explicit about which client is needed
class PaymentRepository(
    @AuthenticatedClient private val client: OkHttpClient
)

class PublicContentRepository(
    @PublicClient private val client: OkHttpClient
)
```

Without qualifiers, Hilt would throw a compile error about duplicate bindings. Koin would silently pick one (usually the last registered), which is worse — you'd get the wrong client at runtime with no warning. Qualifiers make the intent explicit and prevent subtle, hard-to-debug injection mistakes. The downside is more annotations and more ceremony, but it's a small price for correctness when your DI graph has ambiguous types.

And here we are done!
Thanks for reading!
