---
title: Dependency Injection Best Practices Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
---

Imagine you're working on an Android app. You need to swap out the payment gateway for testing. Should be easy, right? You open the class, and... the `PaymentGateway` is created right there inside the class with `PaymentGateway()`. The `InventoryService` too. And the `NotificationSender`. Every dependency is hardwired. To change one thing, you have to crack open the class, rewrite it, and pray nothing else breaks.

I've been there. I've worked on projects where dependency injection was an afterthought — classes creating their own dependencies, singletons scattered everywhere, and test suites that required a running emulator because nothing could be faked. Changing one network client meant touching 15 files.

That experience taught me something important: DI isn't about frameworks or annotations. It's about making your code honest about what it needs. Think of it like ordering at a coffee shop. You don't walk behind the counter and grind the beans yourself — you tell the barista what you want, and it shows up. DI works the same way. Your class says "I need a PaymentGateway," and the framework delivers one. The class never knows or cares how it was made.

What follows is everything I wish someone had told me before I made these mistakes myself.

## Constructor Injection Over Field Injection

Here's a question for you: if you opened a class for the first time, how would you figure out what it depends on?

With constructor injection, the answer is trivial — you read the constructor. It's like a restaurant menu. Everything the class needs is listed right there, upfront, before you even step inside. With field injection, though, the dependencies are hidden in the class body behind `@Inject lateinit var` annotations. It's like showing up to a restaurant with no menu and finding out what's available only after you sit down and start asking.

Beyond readability, constructor-injected dependencies are available from the moment the object is created. Field-injected dependencies are set *after* construction, so there's a window where the object exists but isn't fully initialized. If any code runs during construction that touches a field-injected dependency, you get an `UninitializedPropertyAccessException` — notoriously hard to reproduce because they depend on initialization ordering.

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

Now, there's a catch. Android's Activity and Fragment classes don't support constructor injection because the system instantiates them — you don't get to control that constructor. For these entry points, field injection through `@AndroidEntryPoint` is the practical choice. But everything behind those entry points — ViewModels, repositories, use cases — should use constructor injection exclusively.

## Scoping Dependencies Correctly

The most common DI mistake I see isn't about *how* dependencies are injected — it's about *how long they live*.

Think of scoping like renting an apartment. You wouldn't sign a 30-year lease for a place you only need for a weekend trip. And you wouldn't book a hotel room if you're planning to live somewhere for years. Same idea with dependencies. A database instance scoped to an Activity gets destroyed on every rotation — that's the weekend hotel for a permanent resident. A user session scoped as a singleton leaks state across different users — that's the 30-year lease for a weekend guest. The mental model is straightforward: a dependency's scope should match the lifetime of the thing that needs it.

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

Here's the thing most developers miss: over-scoping is just as bad as under-scoping. Making everything a `@Singleton` feels safe — like "better too long than too short," right? But singletons hold state for the entire process lifetime. I've seen this cause real data leakage bugs in production — user A sees user B's cached data because a `UserSessionManager` singleton wasn't cleared between sessions.

> **🔥 Real talk:** That data leakage bug took us two days to track down. The `UserSessionManager` was `@Singleton` scoped, and nobody thought to clear its cache on logout. User B logged in and saw user A's profile photo. In production. With real users reporting it.

## Service Locator Is Not Dependency Injection

These two get confused a lot, so let me make the distinction crystal clear.

With DI, dependencies are *pushed* into a class from the outside — the class doesn't know where they come from. It's like getting a gift delivered to your door. You didn't go shopping, you didn't pick the store — the gift just showed up. With a service locator, the class *pulls* dependencies from a registry. It knows about the registry and actively reaches into it. That's like having to drive to a specific warehouse, find the right shelf, and grab the item yourself. The class now has a hidden dependency on the locator itself, and it becomes impossible to know what a class needs without reading its implementation.

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

Testing tells the whole story. The service locator version requires setting up the global registry before every test and tearing it down after. The DI version? Pass fakes through the constructor — two lines of setup. Done. With constructor injection, every new dependency is visible in the class signature, which also makes code reviews way more effective at catching SRP violations. When a PR adds a 6th parameter to a constructor, that's a signal you can see at a glance.

## Using Interfaces for Swappable Dependencies

Not every dependency needs an interface. A utility class that formats dates doesn't need a `DateFormatter` interface — that's ceremony for ceremony's sake. But any dependency that talks to the outside world — network, database, file system, sensors — should be hidden behind an interface. This isn't about following SOLID for its own sake. It's about having a seam where you can insert fakes during testing and swap implementations without changing consumers.

Think of it like a power outlet. You don't care if the electricity comes from solar panels, wind turbines, or a coal plant. The outlet is the interface — you plug in, and it works. Your classes should work the same way with external dependencies.

My rule of thumb: if the class does I/O, crosses a process boundary, or has behavior that's inconvenient in tests (like timers, GPS, or analytics), give it an interface. If it's pure logic operating on in-memory data, skip the interface and test it directly.

> **⚡ Quick check:** You have a class that parses JSON strings into data objects. Does it need an interface? What about a class that reads JSON from a file on disk?

## @Provides vs @Binds

This trips up every team I've worked with. Both tell Hilt how to create a dependency, but they work differently under the hood.

`@Provides` is a concrete factory method — you write the instantiation logic yourself. Think of it as cooking a meal from scratch. You pick the ingredients, you follow the recipe, you plate it. `@Binds` is more like pointing at a menu item and saying "that one." It's a declaration that an interface should be satisfied by a specific implementation that Hilt already knows how to create via its `@Inject` constructor.

But here's where it gets interesting. What does Hilt actually *generate* for each one? A `@Provides` method generates a factory class with the full method body. A `@Binds` method generates no factory at all — Hilt just records the mapping internally. Less generated code means faster builds and a smaller APK. On a project with 40+ modules, I measured roughly 12% fewer generated classes after converting eligible `@Provides` methods to `@Binds`. That's not nothing.

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

So when do you use which? Use `@Binds` whenever you're mapping an interface to an implementation that has an `@Inject` constructor. Use `@Provides` when you need to call a builder, configure an object, or create something from a third-party library that you can't annotate with `@Inject`. The tradeoff is that `@Binds` requires an abstract module class instead of an `object`, but the build performance gain is worth it.

> **💡 The "aha" moment:** `@Binds` isn't just syntactic sugar — it actually changes what Hilt generates. Fewer generated factories means faster annotation processing, faster builds, and a smaller APK. The difference scales with the size of your project.

## @EntryPoint for Non-Injected Classes

Hilt injects Activities, Fragments, ViewModels, and Services automatically. But what happens when you need the dependency graph from a class Hilt doesn't manage?

Imagine you have a `BroadcastReceiver` that fires when a sync alarm goes off. The system creates it — you don't control the constructor. But inside `onReceive()`, you need a `SyncRepository` and an `AnalyticsTracker`. How do you get them?

That's where `@EntryPoint` comes in. It defines an interface that acts as a bridge into the Hilt graph. You're essentially saying, "Hey Hilt, I know you didn't create this class, but I still need access to these dependencies." I've used this most often for `BroadcastReceiver` subclasses that need a repository to persist incoming data.

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

The important detail is picking the right component — `@InstallIn(SingletonComponent::class)` gives you app-scoped dependencies, while activity-scoped dependencies need `EntryPointAccessors.fromActivity()`. The tradeoff is that `@EntryPoint` is essentially a service locator scoped to Hilt — use it only for the few classes where Hilt genuinely can't inject, not as a general escape hatch. If you find yourself reaching for `@EntryPoint` in five different places, something in your architecture probably needs rethinking.

## AssistedInject for Runtime Parameters

Standard constructor injection works great when all dependencies come from the DI graph. But what happens when a class needs *both* injected dependencies and runtime values?

Imagine you're building an image processing feature. The `ImageProcessor` needs an `ImageCompressor` and a `StorageClient` from the DI graph — those are stable, shared dependencies. But it also needs an `outputPath` and a `quality` setting that come from the user's action at runtime. You can't put a file path the user just selected into the DI graph ahead of time. So what do you do?

`@AssistedInject` solves exactly this. The pattern requires the `@AssistedInject` constructor marking runtime parameters with `@Assisted`, and an `@AssistedFactory` interface that Hilt implements for you. Before this existed, I wrote these factory classes by hand — usually 15-20 lines of boilerplate per class. Every. Single. Time.

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

Here's a scenario. You're reviewing a PR and you see a constructor with 8 parameters. Your first instinct might be "that's a lot of DI." But the problem isn't dependency injection — it's that the class is doing too much. DI frameworks make it *effortless* to add dependencies, which is both their strength and their trap. Need another service? Just add a parameter. Done. No friction at all.

That lack of friction masks the design problem. It's like a credit card — spending feels painless until the bill arrives.

I use a rough threshold: more than 5 injected dependencies means the class needs decomposition.

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

> **🧠 Think about it:** Look at your current project's largest ViewModel. Count the constructor parameters. If it's above 5, which groups of dependencies could be bundled into a use case?

## Choosing Between Hilt, Koin, and Manual DI

This is one of those decisions teams agonize over, so let me give you the shortcut based on what I've actually seen work.

Hilt catches dependency graph errors at compile time — forget a binding and your app won't build. That's annoying in the moment, but it means the bug never reaches a user. Koin catches them at runtime, so your app builds just fine... and then crashes when resolving a missing dependency. For large teams, compile-time safety prevents entire categories of bugs. For small projects, Koin's simplicity and zero annotation processing overhead can be the right tradeoff.

And then there's manual DI — no framework, just you wiring things up by hand. It works for apps with 10-20 classes. Beyond 30-40, it becomes a maintenance burden that nobody wants to own.

Here's what I've seen work: Hilt for production apps, Koin for side projects and KMP targets, Manual DI for understanding how DI works before adopting a framework.

## Organizing Modules by Feature

Most Hilt tutorials show a single `AppModule` or separate modules by layer — `NetworkModule`, `DatabaseModule`, `RepositoryModule`. This seems organized at first, but it creates god-modules that every feature depends on. It's like having one giant junk drawer in your kitchen instead of organized cabinets. Everything is technically *in there*, but good luck finding what you need or pulling one thing out without disturbing everything else.

Organizing by feature means each feature has its own module. Shared infrastructure stays in a common module, but feature-specific bindings live with the feature code.

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

I've seen this attempted more than once. A `CartViewModel` wants data from `UserViewModel`, so someone tries injecting one into the other.

Stop. Don't do this.

This breaks the ViewModel lifecycle contract — ViewModels are scoped to their owner (an Activity, Fragment, or navigation graph), and cross-injection creates ambiguous ownership and circular dependency risks. It's like two people each claiming to be the other person's boss. Who gets fired first? Nobody knows, and that's the problem.

The right pattern is sharing data through a repository both ViewModels depend on.

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

What happens when your DI graph has two `OkHttpClient` instances — one with auth headers, one without? Or two `CoroutineDispatcher` instances — one for IO, one for computation? The framework can't tell them apart by type alone. It just sees `OkHttpClient` twice and throws its hands up.

Qualifiers solve this. They're like name tags at a conference where two people are both named "Chris." Without the name tags, you can't tell them apart. With them, you just look at the badge.

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

Without qualifiers, Hilt throws a compile error about duplicate bindings. Koin would silently pick one (usually the last registered) — you'd get the wrong client at runtime with no warning. I know which failure mode I prefer.

## Testing with Hilt

This is where the whole DI investment pays off. Everything we've talked about — constructor injection, interfaces, proper scoping — it all builds toward this moment: testing becomes almost pleasant.

Hilt provides `@HiltAndroidTest` to set up a real dependency graph in instrumented tests with the ability to swap bindings. The two tools I reach for most are `@UninstallModules` to remove a production module entirely, and `@BindValue` to replace a single dependency with a fake. I default to `@BindValue` because it keeps the test graph as close to production as possible — you only fake what you must (network calls, analytics), and everything else stays real.

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
