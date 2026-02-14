---
title: Dependency Injection Best Practices Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
---

I've worked on Android projects where dependency injection was an afterthought — classes creating their own dependencies, singletons scattered everywhere, and test suites that required a running emulator because nothing could be faked. Changing one network client meant touching 15 files. That taught me DI isn't about frameworks or annotations — it's about making your code honest about what it needs.

What follows is everything I wish someone had told me before I made these mistakes myself.

## Constructor Injection Over Field Injection

Constructor injection is the default choice, and field injection should be the exception. When dependencies are passed through the constructor, the class declares upfront exactly what it needs — you can read the constructor signature and immediately understand its collaborators. With field injection, dependencies are invisible until you scan the class body for `@Inject lateinit var` annotations.

Beyond readability, constructor-injected dependencies are available from the moment the object is created. Field-injected dependencies are set after construction, so there's a window where the object exists but isn't fully initialized. If any code runs during construction that touches a field-injected dependency, you get an `UninitializedPropertyAccessException` — notoriously hard to reproduce because they depend on initialization ordering.

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
class OrderProcessor @Inject constructor(
    private val paymentGateway: PaymentGateway,
    private val inventoryService: InventoryService,
    private val notificationSender: NotificationSender
) {
    fun process(order: Order) {
        inventoryService.reserve(order.items)
    }
}
```

The tradeoff is that Android's Activity and Fragment classes don't support constructor injection because the system instantiates them. For these entry points, field injection through `@AndroidEntryPoint` is the practical choice. But everything behind those entry points — ViewModels, repositories, use cases — should use constructor injection exclusively.

## Scoping Dependencies Correctly

The most common DI mistake I see isn't about how dependencies are injected — it's about how long they live. A database instance scoped to an Activity gets destroyed on every rotation. A user session scoped as a singleton leaks state across different users. The mental model is straightforward: a dependency's scope should match the lifetime of the thing that needs it.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
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
    @ViewModelScoped
    fun provideSearchPaginator(
        searchApi: SearchApi
    ): SearchPaginator {
        return SearchPaginator(searchApi, pageSize = 20)
    }
}
```

Here's the thing most developers miss: over-scoping is just as bad as under-scoping. Making everything a `@Singleton` feels safe, but singletons hold state for the entire process lifetime. I've seen this cause real data leakage bugs in production — user A sees user B's cached data because a `UserSessionManager` singleton wasn't cleared between sessions.

## Service Locator Is Not Dependency Injection

With DI, dependencies are pushed into a class from the outside — the class doesn't know where they come from. With a service locator, the class pulls dependencies from a registry. It knows about the locator and actively reaches into it. This creates a hidden dependency on the locator itself and makes it impossible to know what a class needs without reading its implementation.

```kotlin
// Service locator — class reaches into a global registry
class ShippingCalculator {
    fun calculateCost(order: Order): Double {
        val taxService = ServiceLocator.get<TaxService>()
        val rateProvider = ServiceLocator.get<ShippingRateProvider>()
        return rateProvider.getRate(order.weight) + taxService.calculate(order.total)
    }
}

// Dependency injection — dependencies are visible and explicit
class ShippingCalculator @Inject constructor(
    private val taxService: TaxService,
    private val rateProvider: ShippingRateProvider
) {
    fun calculateCost(order: Order): Double {
        return rateProvider.getRate(order.weight) + taxService.calculate(order.total)
    }
}
```

Testing the service locator version requires setting up the global registry before every test and tearing it down after. Testing the DI version requires passing fakes through the constructor — two lines of setup. With constructor injection, every new dependency is visible in the class signature, making code reviews more effective at catching SRP violations.

## Using Interfaces for Swappable Dependencies

Not every dependency needs an interface. A utility class that formats dates doesn't need a `DateFormatter` interface. But any dependency that talks to the outside world — network, database, file system, sensors — should be hidden behind an interface. This isn't about following SOLID for its own sake. It's about having a seam where you can insert fakes during testing and swap implementations without changing consumers.

My rule of thumb: if the class does I/O, crosses a process boundary, or has behavior that's inconvenient in tests (like timers, GPS, or analytics), give it an interface. If it's pure logic operating on in-memory data, skip the interface and test it directly.

## @Provides vs @Binds

This trips up every team I've worked with. Both tell Hilt how to create a dependency, but they work differently under the hood. `@Provides` is a concrete factory method — you write the instantiation logic. `@Binds` is a declaration that an interface should be satisfied by a specific implementation that Hilt already knows how to create via its `@Inject` constructor.

The key insight is what Hilt generates. A `@Provides` method generates a factory class with the full method body. A `@Binds` method generates no factory at all — Hilt just records the mapping. Less generated code means faster builds and a smaller APK. On a project with 40+ modules, I measured roughly 12% fewer generated classes after converting eligible `@Provides` methods to `@Binds`.

```kotlin
// @Provides — you manually create the instance
@Module
@InstallIn(SingletonComponent::class)
object AnalyticsModule {
    @Provides
    @Singleton
    fun provideAnalyticsTracker(
        context: @ApplicationContext Context
    ): AnalyticsTracker {
        return FirebaseAnalyticsTracker(context)
    }
}

// @Binds — Hilt uses the @Inject constructor directly, no factory
@Module
@InstallIn(SingletonComponent::class)
abstract class AnalyticsModule {
    @Binds
    @Singleton
    abstract fun bindAnalyticsTracker(
        impl: FirebaseAnalyticsTracker
    ): AnalyticsTracker
}

// The implementation must have an @Inject constructor
class FirebaseAnalyticsTracker @Inject constructor(
    @ApplicationContext private val context: Context
) : AnalyticsTracker { /* ... */ }
```

Use `@Binds` whenever you're mapping an interface to an implementation that has an `@Inject` constructor. Use `@Provides` when you need to call a builder, configure an object, or create something from a third-party library that you can't annotate with `@Inject`. The tradeoff is that `@Binds` requires an abstract module class instead of an `object`, but the build performance gain is worth it.

## @EntryPoint for Non-Injected Classes

Hilt injects Activities, Fragments, ViewModels, and Services automatically. But sometimes you need the dependency graph from a class Hilt doesn't manage — a `BroadcastReceiver`, a `ContentProvider`, or a class instantiated by a third-party SDK. `@EntryPoint` defines an interface that bridges into the Hilt graph. I've used this most often for `BroadcastReceiver` subclasses that need a repository to persist incoming data, since receivers are instantiated by the system with no constructor you control.

```kotlin
// Define the entry point interface
@EntryPoint
@InstallIn(SingletonComponent::class)
interface SyncReceiverEntryPoint {
    fun syncRepository(): SyncRepository
    fun analyticsTracker(): AnalyticsTracker
}

// Use it in a class Hilt doesn't inject
class SyncBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val entryPoint = EntryPointAccessors.fromApplication(
            context.applicationContext,
            SyncReceiverEntryPoint::class.java
        )
        val repo = entryPoint.syncRepository()
        val tracker = entryPoint.analyticsTracker()

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            repo.syncNow()
            tracker.logEvent("sync_triggered")
            pendingResult.finish()
        }
    }
}
```

The important detail is picking the right component — `@InstallIn(SingletonComponent::class)` gives you app-scoped dependencies, while activity-scoped dependencies need `EntryPointAccessors.fromActivity()`. The tradeoff is that `@EntryPoint` is essentially a service locator scoped to Hilt — use it only for the few classes where Hilt genuinely can't inject, not as a general escape hatch.

## AssistedInject for Runtime Parameters

Standard constructor injection works when all dependencies come from the DI graph. But sometimes a class needs both injected dependencies and runtime values — a user ID from a previous screen, a file path selected by the user, or a config flag from a deep link. `@AssistedInject` solves this without manual factories. The pattern requires the `@AssistedInject` constructor marking runtime parameters with `@Assisted`, and an `@AssistedFactory` interface that Hilt implements. Before this existed, I wrote these factory classes by hand — usually 15-20 lines of boilerplate per class.

```kotlin
class ImageProcessor @AssistedInject constructor(
    private val imageCompressor: ImageCompressor,  // From DI graph
    private val storageClient: StorageClient,      // From DI graph
    @Assisted private val outputPath: String,      // Runtime value
    @Assisted private val quality: Int             // Runtime value
) {
    suspend fun processAndSave(bitmap: Bitmap) {
        val compressed = imageCompressor.compress(bitmap, quality)
        storageClient.save(compressed, outputPath)
    }
}

@AssistedFactory
interface ImageProcessorFactory {
    fun create(outputPath: String, quality: Int): ImageProcessor
}

// Usage — inject the factory, call create() with runtime values
class GalleryViewModel @Inject constructor(
    private val processorFactory: ImageProcessorFactory
) : ViewModel() {
    fun onImageSelected(path: String) {
        val processor = processorFactory.create(
            outputPath = "/storage/processed/${path.substringAfterLast("/")}",
            quality = 85
        )
        viewModelScope.launch { processor.processAndSave(loadBitmap(path)) }
    }
}
```

One thing worth noting: for ViewModels, `SavedStateHandle` is already assisted-injected by Hilt through `@HiltViewModel`. If your only runtime parameter is navigation arguments, `SavedStateHandle` already has them. Use `@AssistedInject` when you need runtime values that aren't navigation args, or for non-ViewModel classes like workers and processors.

## Too Many Dependencies Is a Design Smell

If your class constructor has 8 parameters, the problem isn't dependency injection — it's that your class is doing too much. DI frameworks make it effortless to add dependencies, which masks the design problem. I use a rough threshold: more than 5 injected dependencies means the class needs decomposition.

```kotlin
// Too many dependencies — this class does too much
class CheckoutViewModel @Inject constructor(
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
class CheckoutViewModel @Inject constructor(
    private val processCheckout: ProcessCheckoutUseCase,
    private val calculateTotal: CalculateTotalUseCase,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() { /* ... */ }
```

The `ProcessCheckoutUseCase` owns the coordination between payment, inventory, shipping, and notifications. The ViewModel is reduced to its actual job: managing UI state and delegating to use cases. Testing also gets simpler — you mock 3 dependencies instead of 8.

## Choosing Between Hilt, Koin, and Manual DI

Hilt catches dependency graph errors at compile time — forget a binding and your app won't build. Koin catches them at runtime, so your app builds but crashes when resolving a missing dependency. For large teams, compile-time safety prevents entire categories of bugs. For small projects, Koin's simplicity and zero annotation processing overhead can be the right tradeoff. Manual DI works for apps with 10-20 classes — beyond 30-40, it becomes a maintenance burden. Here's what I've seen work: Hilt for production apps, Koin for side projects and KMP targets, Manual DI for understanding how DI works before adopting a framework.

## Organizing Modules by Feature

Most Hilt tutorials show a single `AppModule` or separate modules by layer — `NetworkModule`, `DatabaseModule`, `RepositoryModule`. This creates god-modules that every feature depends on. Organizing by feature means each feature has its own module. Shared infrastructure stays in a common module, but feature-specific bindings live with the feature code.

```kotlin
// Shared infrastructure
@Module
@InstallIn(SingletonComponent::class)
object CoreNetworkModule {
    @Provides
    @Singleton
    fun provideRetrofit(): Retrofit {
        return Retrofit.Builder()
            .baseUrl("https://api.example.com/")
            .client(OkHttpClient.Builder().build())
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
}
```

When you later extract the search feature into its own Gradle module, the `SearchModule` moves with it cleanly. If everything was in a monolithic `AppModule`, you'd need to untangle which bindings belong to which feature — a refactoring nightmare that discourages modularization.

## ViewModels Should Never Depend on Other ViewModels

I've seen this attempted more than once. A `CartViewModel` wants data from `UserViewModel`, so someone tries injecting one into the other. This breaks the ViewModel lifecycle contract — ViewModels are scoped to their owner, and cross-injection creates ambiguous ownership and circular dependency risks. The right pattern is sharing data through a repository both ViewModels depend on.

```kotlin
// Wrong — ViewModel depending on another ViewModel
class CartViewModel(
    private val userViewModel: UserViewModel // Lifecycle nightmare
) : ViewModel()

// Right — both ViewModels depend on shared repository
class CartViewModel @Inject constructor(
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

If two ViewModels truly need to communicate events, use a shared Flow scoped to the Activity or navigation graph. But in most cases, the need for ViewModel-to-ViewModel communication signals that the data layer is missing an abstraction.

## Qualifiers for Same-Type Dependencies

When your DI graph has multiple instances of the same type — two `OkHttpClient` instances, two `CoroutineDispatcher` instances, or two `String` URLs — the framework can't tell them apart by type alone. Qualifiers solve this.

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
    @Provides @Singleton @AuthenticatedClient
    fun provideAuthClient(tokenStore: TokenStore): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .build()
    }

    @Provides @Singleton @PublicClient
    fun providePublicClient(): OkHttpClient {
        return OkHttpClient.Builder().build()
    }
}

// Usage — explicit about which client is needed
class PaymentRepository @Inject constructor(
    @AuthenticatedClient private val client: OkHttpClient
)
```

Without qualifiers, Hilt throws a compile error about duplicate bindings. Koin would silently pick one (usually the last registered) — you'd get the wrong client at runtime with no warning.

## Testing with Hilt

This is where the whole DI investment pays off. Hilt provides `@HiltAndroidTest` to set up a real dependency graph in instrumented tests with the ability to swap bindings. The two tools I reach for most are `@UninstallModules` to remove a production module entirely, and `@BindValue` to replace a single dependency with a fake. I default to `@BindValue` because it keeps the test graph as close to production as possible — you only fake what you must (network calls, analytics), and everything else stays real.

```kotlin
@HiltAndroidTest
@UninstallModules(AnalyticsModule::class)
class CheckoutFlowTest {

    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    // Replaces the real PaymentGateway in the graph
    @BindValue
    val paymentGateway: PaymentGateway = FakePaymentGateway()

    // Provide a test analytics module since we uninstalled the real one
    @Module
    @InstallIn(SingletonComponent::class)
    object TestAnalyticsModule {
        @Provides @Singleton
        fun provideAnalytics(): AnalyticsTracker = NoOpAnalyticsTracker()
    }

    @Before
    fun setup() {
        hiltRule.inject()
    }

    @Test
    fun checkout_with_valid_card_succeeds() {
        // paymentGateway is the fake — no real charges
        // everything else (repositories, use cases) is the real production graph
    }
}
```

One gotcha I ran into: `@BindValue` fields must be initialized before `hiltRule.inject()` is called. If you're using a `lateinit var` initialized in `@Before`, make sure the `HiltAndroidRule` runs after your setup — rule ordering matters, and getting it wrong gives you a cryptic `NullPointerException` in Hilt's generated code. Also, `@UninstallModules` doesn't work with `@HiltViewModel` modules. For ViewModel testing, use `@BindValue` to swap the repository or use case instead.

And here we are done!
Thanks for reading!
