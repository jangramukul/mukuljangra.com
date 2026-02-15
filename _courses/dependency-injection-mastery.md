---
title: "Dependency Injection Mastery"
layout: course
description: "Master DI in Android — Hilt, Dagger, Koin, manual DI, scoping, multi-module architecture, and testing patterns."
icon: "💉"
color: "#f472b6"
difficulty: "Beginner to Advanced"
modules: 10
lessons: 57
duration: "6 weeks"
order: 9
tags:
  - Dependency Injection
  - Hilt
  - Dagger
  - Architecture
what_you_learn:
  - "Understand why DI matters for testable, modular code"
  - "Set up Hilt with @Module, @Provides, @Binds, and @Inject"
  - "Scope dependencies correctly — Singleton, ViewModel, Activity"
  - "Integrate Hilt with ViewModel, Navigation Compose, and WorkManager"
  - "Structure DI in multi-module Android projects"
  - "Replace dependencies in tests with @UninstallModules"
  - "Understand how Dagger generates code under the hood"
  - "Explore Metro — the next-gen Kotlin-native DI framework"
  - "Migrate from KAPT to KSP for faster DI builds"
prerequisites:
  - "Kotlin fundamentals"
  - "Android architecture basics (MVVM)"
  - "Basic understanding of interfaces and abstraction"
---

## Module 1: Why Dependency Injection

### Lesson 1.1: The Problem Without DI

When a class creates its own dependencies, three things go wrong. You can't test the class in isolation because you can't substitute a fake dependency. Swapping implementations requires modifying the class itself. And the dependency graph becomes implicit — there's no single place to see what depends on what. These three problems compound as your codebase grows, turning what should be simple refactors into multi-file surgery.

Every class that creates its own `Retrofit`, `OkHttpClient`, or database instance is also wasteful. In a real app you want a single shared `OkHttpClient` with connection pooling, not one per screen. Each `OrderViewModel` creating its own HTTP client means duplicated connections, duplicated interceptors, and duplicated configuration scattered across your codebase. In a production app with 40+ screens, this can mean dozens of redundant HTTP clients consuming memory and file descriptors.

The deeper problem is architectural. When classes reach into global state to get what they need, the code becomes a web of hidden dependencies. Adding a new feature means tracing through constructor calls across files to figure out what depends on what. Removing a feature means hoping nothing else secretly depended on it. This is the hallmark of a "big ball of mud" architecture — everything is connected to everything else through invisible wires.

Consider the lifecycle implications. A ViewModel that creates its own database instance now owns that instance's lifecycle. When does it close the database? What if two ViewModels create separate instances of the same database — you get SQLite lock contention. What if a ViewModel creates a Retrofit instance with a specific interceptor configuration, but another ViewModel needs a different configuration? Without DI, you end up with a mess of factory methods, companion objects, and global singletons, each one a potential source of bugs.

The testing problem is the one that hurts most in practice. Without DI, writing a unit test for a ViewModel requires either (a) running a real network call, real database, and real analytics — making the test slow, flaky, and dependent on external services — or (b) using reflection or mocking libraries to hack around the hard-coded dependencies. Both approaches are fragile. The test becomes coupled to implementation details rather than behavior.

In a multi-module project, the problem becomes even worse. If `:feature:checkout` directly instantiates a `PaymentGateway` from `:core:payments`, it now has a hard compile-time dependency on the concrete implementation. You can't compile or test the checkout feature without the entire payments module and all of its transitive dependencies. This kills build parallelism and makes incremental builds slow.

Let's look at what tight coupling actually looks like in code, and then see how DI transforms the same class into something testable and maintainable.

```kotlin
// ❌ Without DI — tight coupling, untestable
class ProfileViewModel {
    private val api = RetrofitClient.instance.create(UserApi::class.java)
    private val database = AppDatabase.getInstance(MyApp.context)
    private val analytics = FirebaseAnalytics.getInstance(MyApp.context)

    // How do you test this? You can't swap the real API for a fake one.
    suspend fun loadProfile() {
        val user = api.getUser("1")     // Real network call in tests!
        database.userDao().insert(user) // Real database in tests!
        analytics.track("profile_viewed") // Real analytics in tests!
    }
}
```

```kotlin
// ✅ With DI — dependencies injected, easily testable
class ProfileViewModel(
    private val userRepository: UserRepository,
    private val analytics: Analytics,
) {
    suspend fun loadProfile() {
        val user = userRepository.getUser("1")
        analytics.track("profile_viewed")
    }
}

// In tests — swap with fakes
val viewModel = ProfileViewModel(
    userRepository = FakeUserRepository(),
    analytics = FakeAnalytics()
)
```

```kotlin
// ❌ Hidden dependency chains — impossible to trace
class OrderViewModel {
    private val paymentProcessor = PaymentProcessor.create() // What does this need internally?
    // PaymentProcessor internally creates:
    //   - StripeClient (needs API key from BuildConfig)
    //   - FraudDetector (needs ML model from assets)
    //   - TransactionLogger (needs database and network)
    // None of this is visible from OrderViewModel's perspective
}

// ✅ Explicit dependency chains — everything is visible
class OrderViewModel(
    private val paymentProcessor: PaymentProcessor,
    // PaymentProcessor's constructor lists all its needs
    // You can trace the entire graph from constructors alone
)
```

```kotlin
// ❌ Singleton abuse — global mutable state
object UserManager {
    private var currentUser: User? = null // Shared mutable state across the app

    fun setUser(user: User) { currentUser = user }
    fun getUser(): User = currentUser ?: throw IllegalStateException("Not logged in")
}

class ProfileViewModel {
    fun loadProfile() {
        val user = UserManager.getUser() // Hidden dependency on global state
    }
}

// ✅ Injected — no global state
class ProfileViewModel(
    private val userSession: UserSession, // Explicit, scoped, testable
) {
    fun loadProfile() {
        val user = userSession.currentUser
    }
}
```

```kotlin
// The cost of no-DI at scale: duplicated configuration
class HomeViewModel {
    private val client = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(TokenStore.instance))
        .addInterceptor(HttpLoggingInterceptor())
        .connectTimeout(30, TimeUnit.SECONDS)
        .build() // Duplicated in every ViewModel!
}

class SearchViewModel {
    private val client = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(TokenStore.instance))
        .addInterceptor(HttpLoggingInterceptor())
        .connectTimeout(30, TimeUnit.SECONDS) // Copy-paste from HomeViewModel
        .build()
}

// With DI: configured once, shared everywhere
// NetworkModule provides a single OkHttpClient to all consumers
```

**Key takeaway:** DI means a class receives its dependencies instead of creating them. This one shift — from "I create what I need" to "I declare what I need" — has cascading effects on testability, flexibility, and maintainability. Without DI, your code becomes a web of hidden dependencies, duplicated configuration, and untestable logic.

### Lesson 1.2: Constructor vs Field vs Method Injection

Constructor injection is the default choice, and field injection should be the exception. When dependencies are passed through the constructor, the class declares upfront exactly what it needs — you can read the constructor signature and immediately understand its collaborators. With field injection, dependencies are invisible until you scan the class body for `@Inject lateinit var` annotations.

Beyond readability, constructor-injected dependencies are available from the moment the object is created. Field-injected dependencies are set after construction, so there's a window where the object exists but isn't fully initialized. If any code runs during construction that touches a field-injected dependency, you get an `UninitializedPropertyAccessException` — notoriously hard to reproduce because they depend on initialization ordering.

Constructor injection also enforces immutability. Dependencies declared as `private val` in the constructor can't be reassigned after creation. Field-injected dependencies use `lateinit var` — they're mutable by definition, which means nothing prevents code from accidentally reassigning them later. Immutability is a cornerstone of safe concurrent programming, and constructor injection gives it to you for free.

There's a practical consequence for testing too. With constructor injection, you create the object by calling its constructor with fakes — no framework needed. With field injection, you need either a DI framework (Hilt's test rules) or reflection to set the fields. This means your unit tests depend on the DI framework, which defeats the purpose of loose coupling.

Method injection is the rarest form. It's useful for optional dependencies or when you need to inject something after construction but before the object is used. In Dagger, method injection runs after constructor and field injection, so it's sometimes used for initialization logic that needs all dependencies to be in place. In practice, you'll almost never need it — constructor injection with default parameters covers most cases.

When Dagger/Hilt processes these different injection styles, it generates different code for each. For constructor injection, it generates a `_Factory` class that calls the constructor. For field injection, it generates a `_MembersInjector` that sets each field individually after the object exists. The factory approach is cleaner because it produces a fully-initialized object in one step. The members injector approach requires a two-phase initialization — create the object, then inject its fields — which is inherently more fragile.

The tradeoff is that Android's Activity and Fragment classes don't support constructor injection because the system instantiates them. For these entry points, field injection through `@AndroidEntryPoint` is the practical choice. But everything behind those entry points — ViewModels, repositories, use cases — should use constructor injection exclusively.

In Hilt versus Koin versus manual DI, constructor injection is the universal winner. Hilt generates factories for `@Inject constructor` classes. Koin resolves constructor parameters through its DSL. Manual DI simply calls the constructor directly. All three approaches can deliver constructor-injected dependencies. The only case where you're forced into field injection is Android framework classes that the system instantiates.

```kotlin
// Constructor injection — preferred
class UserRepository(
    private val api: UserApi,      // Injected via constructor
    private val dao: UserDao,      // Injected via constructor
)

// Field injection — only when you don't control construction (Activity, Fragment)
@AndroidEntryPoint
class ProfileActivity : AppCompatActivity() {
    @Inject lateinit var analytics: Analytics  // Field injection
}

// Method injection — rare, used for optional dependencies
class Logger {
    private var crashReporter: CrashReporter? = null

    @Inject
    fun setCrashReporter(reporter: CrashReporter) {
        crashReporter = reporter
    }
}
```

```kotlin
// What Hilt generates for constructor injection
// Your code:
class UserRepository @Inject constructor(
    private val api: UserApi,
    private val dao: UserDao,
)

// Generated: UserRepository_Factory.java (simplified)
// class UserRepository_Factory implements Factory<UserRepository> {
//     private final Provider<UserApi> apiProvider;
//     private final Provider<UserDao> daoProvider;
//
//     override fun get(): UserRepository {
//         return UserRepository(apiProvider.get(), daoProvider.get())
//     }
// }
// → Single step: fully initialized object
```

```kotlin
// What Hilt generates for field injection
// Your code:
@AndroidEntryPoint
class ProfileActivity : AppCompatActivity() {
    @Inject lateinit var analytics: Analytics
    @Inject lateinit var logger: Logger
}

// Generated: ProfileActivity_MembersInjector.java (simplified)
// class ProfileActivity_MembersInjector implements MembersInjector<ProfileActivity> {
//     override fun injectMembers(instance: ProfileActivity) {
//         instance.analytics = analyticsProvider.get()
//         instance.logger = loggerProvider.get()
//     }
// }
// → Two steps: create Activity, then inject fields
```

```kotlin
// ❌ Anti-pattern: field injection for classes you control
class OrderRepository {
    @Inject lateinit var api: OrderApi       // Why? You control this class!
    @Inject lateinit var database: OrderDao   // Use constructor injection instead

    fun getOrders(): List<Order> {
        // If this runs before injection, crash!
        return api.getOrders()
    }
}

// ✅ Constructor injection — always initialized, always safe
class OrderRepository @Inject constructor(
    private val api: OrderApi,
    private val database: OrderDao,
) {
    fun getOrders(): List<Order> {
        // api and database are guaranteed to be initialized
        return api.getOrders()
    }
}
```

```kotlin
// Constructor injection with default parameters — Kotlin advantage
class ImageLoader @Inject constructor(
    private val httpClient: OkHttpClient,
    private val memoryCache: MemoryCache,
    private val diskCache: DiskCache,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO, // Default if not in graph (Metro only)
)
```

**Key takeaway:** Always prefer constructor injection. It makes dependencies explicit, enforces immutability, and works naturally with testing. Reserve field injection for Android entry points where you don't control construction. Method injection is almost never needed in practice.

### Lesson 1.3: Service Locator vs Dependency Injection

Before talking about frameworks, it's worth distinguishing DI from another pattern it's often confused with: the Service Locator. Both provide dependencies from a central place, but they work differently. A Service Locator is a registry that classes reach into to get their dependencies. The class actively looks up what it needs. A DI container pushes dependencies to the class — the class passively receives them through its constructor.

The Service Locator pattern has two fundamental problems. First, dependencies are hidden — looking at the class's constructor doesn't tell you what it needs. You have to read the body to discover that it depends on `OrderRepository`. Second, testing requires setting up the global locator with test fakes before every test and cleaning up after, which creates shared mutable state between tests. If one test forgets to clean up, subsequent tests see stale state and fail intermittently.

The compile-time safety difference is the most important practical distinction. With true DI (Dagger/Hilt), the entire dependency graph is validated at compile time. If a binding is missing, you get a compile error with a clear message. With a service locator (Koin, or a hand-built registry), missing bindings are only discovered at runtime when `get()` is called. This means a missing binding in an error-handling path might not be discovered until production — when a real user triggers the error.

There's also a code navigation difference. With constructor injection, any IDE can trace from a class to its dependencies — click on the parameter type and you're at the interface. With a service locator, the dependency is resolved by a generic `get<SomeType>()` call that most IDEs can't trace through. You lose "find usages" and "go to definition" for dependency relationships.

Service locators also make it harder to enforce architectural boundaries. With constructor injection, if a class depends on something it shouldn't (like a feature module depending on a data layer implementation), the compile-time dependency makes this visible in your build graph. With a service locator, the dependency is invisible — the build graph doesn't reflect it, and the violation goes unnoticed.

However, service locators have a real advantage: simplicity. Setting up Koin takes five minutes. Setting up Hilt takes thirty minutes of Gradle configuration, annotation setup, and understanding component hierarchies. For small apps, prototypes, or Kotlin Multiplatform projects where Hilt isn't available, a service locator is a pragmatic choice. The key is understanding the tradeoff you're making.

Koin, despite being marketed as a DI framework, is technically a service locator. Its `get()` function reaches into a global registry at runtime. This distinction matters when you're choosing a DI strategy — runtime resolution (service locator) versus compile-time resolution (true DI) affects both safety and testability. Koin's `verify()` function mitigates the safety gap but doesn't eliminate it.

In Metro's design, this distinction is explicit. Metro's documentation states that service locators are "anti-patterns in large codebases" because they hide the dependency graph from the compiler. Metro, like Dagger, builds the complete graph at compile time and validates it exhaustively. Every `@Inject`-annotated class must have all its dependencies resolvable, or the build fails.

```kotlin
// Service Locator — the class reaches INTO the container
class OrderViewModel : ViewModel() {
    private val repository = ServiceLocator.get<OrderRepository>()
}

// Dependency Injection — the class RECEIVES from outside
class OrderViewModel(
    private val repository: OrderRepository  // pushed in
) : ViewModel()
```

```kotlin
// The testing problem with Service Locators
class OrderViewModelTest {
    @Before
    fun setup() {
        // Must configure global state before EVERY test
        ServiceLocator.register<OrderRepository>(FakeOrderRepository())
        ServiceLocator.register<Analytics>(FakeAnalytics())
    }

    @After
    fun teardown() {
        // Must clean up global state after EVERY test
        ServiceLocator.clear() // Forgot this? Next test gets stale fakes!
    }

    @Test
    fun `loads orders`() {
        val viewModel = OrderViewModel() // Dependencies are hidden inside
        // ...
    }
}

// Compare with DI — no global state, no setup/teardown
class OrderViewModelTest {
    @Test
    fun `loads orders`() {
        val viewModel = OrderViewModel(
            repository = FakeOrderRepository(),
            // Dependencies are explicit — no global state needed
        )
    }
}
```

```kotlin
// Koin — service locator in disguise
class ProfileViewModel : ViewModel() {
    private val userRepo: UserRepository by inject() // Reaches into global registry
    private val analytics: Analytics by inject()     // Runtime resolution
}

// Hilt — true dependency injection
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,  // Pushed in at compile time
    private val analytics: Analytics,      // Compile-time validated
) : ViewModel()
```

```kotlin
// Compile-time safety comparison
// Hilt: missing binding = compile error
// Error: [Dagger/MissingBinding] UserRepository cannot be provided
// without an @Inject constructor or an @Provides-annotated method.
// → You fix it before the app ever runs

// Koin: missing binding = runtime crash
// org.koin.core.error.NoBeanDefFoundException:
// No definition found for type 'UserRepository'
// → Might only happen in a rarely-triggered code path
```

**Key takeaway:** With DI, dependencies are pushed into a class from the outside. With a service locator, the class pulls them from a global registry. DI makes dependencies explicit and testing straightforward. Service locators hide dependencies and create shared mutable state. Choose DI for production apps; service locators are acceptable for prototypes and small KMP projects.

### Lesson 1.4: Manual DI — The Simplest Starting Point

Before reaching for Dagger or Hilt, it's worth understanding manual DI. Constructor injection — passing dependencies as constructor parameters — is DI in its purest form. No framework, no code generation, no magic. A simple container class wires everything together. Understanding this foundation makes DI frameworks less mysterious — they automate what you could do by hand.

Manual DI works well for small apps with a handful of dependencies. But as your app grows to 50+ classes with complex dependency graphs, manually wiring everything becomes tedious and error-prone. You have to manage lifetimes (should this be a singleton or a new instance?), handle scoping (should the payment flow share a single `PaymentManager` instance?), and remember the construction order. That's where DI frameworks come in — they automate exactly these concerns.

The construction order problem is subtle but real. If class A depends on B, and B depends on C, you must create C first, then B, then A. In a manual container, this ordering is implicit in the code. If you accidentally create B before C exists, you get a null reference or uninitialized state. DI frameworks solve this by topologically sorting the dependency graph at compile time — they guarantee that every dependency is created before it's needed.

Scoping is the other thing manual DI handles poorly. In a DI framework, you annotate a binding as `@Singleton` and the framework handles lazy creation and thread-safe access. In manual DI, you implement this yourself with `lazy` delegates or double-checked locking. For Activity-scoped or ViewModel-scoped dependencies, you need to create and destroy sub-containers manually at the right lifecycle points. This is doable but error-prone — miss a cleanup and you leak memory.

The comparison between manual DI, Hilt, and Koin is instructive. Manual DI requires zero dependencies but maximum manual effort. Koin requires minimal setup but gives you runtime-only validation. Hilt requires significant setup (Gradle plugins, annotation processing) but gives you compile-time validation and automatic scoping. Each is the right choice for a different project size and risk tolerance.

In a multi-module project, manual DI becomes especially painful. Each module needs its own container, and the app module needs to compose them. If module A depends on a type from module B's container, you need to pass it explicitly. With Hilt, this wiring happens automatically because Hilt discovers all `@Module` classes across the entire dependency graph. With manual DI, you're the compiler.

One pattern that helps manual DI scale slightly better is the "container interface" pattern — define an interface for each module's container, then implement it in the app module. This keeps each module ignorant of others while allowing the app to wire them together. But even this pattern breaks down past 20-30 classes.

```kotlin
// A simple container that wires everything together
class AppContainer(private val context: Context) {
    private val httpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(context))
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl("https://api.myapp.com")
        .client(httpClient)
        .addConverterFactory(MoshiConverterFactory.create())
        .build()

    private val orderApi = retrofit.create(OrderApi::class.java)
    val orderRepository = OrderRepository(orderApi)
}

// ViewModel receives its dependencies — doesn't know how they're built
class OrderViewModel(
    private val repository: OrderRepository
) : ViewModel() {
    fun loadOrders() {
        viewModelScope.launch {
            val orders = repository.getOrders()
            _uiState.value = UiState.Success(orders)
        }
    }
}
```

```kotlin
// Manual DI with lazy singletons and scoping
class AppContainer(private val context: Context) {
    // Lazy singleton — created on first access, thread-safe
    val database: AppDatabase by lazy {
        Room.databaseBuilder(context, AppDatabase::class.java, "app.db")
            .build()
    }

    val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(HttpLoggingInterceptor())
            .connectTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    // Factory method — new instance each time
    fun createOrderViewModel(): OrderViewModel {
        return OrderViewModel(
            repository = OrderRepository(
                api = retrofit.create(OrderApi::class.java),
                dao = database.orderDao(),
            )
        )
    }
}

// Scoped container — created and destroyed with Activity
class CheckoutContainer(private val appContainer: AppContainer) {
    val paymentProcessor by lazy {
        PaymentProcessor(
            gateway = StripeGateway(appContainer.httpClient),
        )
    }

    // Clean up when the checkout flow ends
    fun destroy() {
        // Release resources
    }
}
```

```kotlin
// Container interface pattern for multi-module manual DI
// :core:domain — defines what the container provides
interface AppDependencies {
    val userRepository: UserRepository
    val orderRepository: OrderRepository
    val analytics: Analytics
}

// :feature:profile — depends on the interface, not the implementation
class ProfileViewModel(
    private val deps: AppDependencies,
) : ViewModel() {
    fun loadProfile() {
        viewModelScope.launch {
            val user = deps.userRepository.getUser("1")
        }
    }
}

// :app — implements the container
class AppContainerImpl(context: Context) : AppDependencies {
    override val userRepository = UserRepositoryImpl(/* ... */)
    override val orderRepository = OrderRepositoryImpl(/* ... */)
    override val analytics = FirebaseAnalyticsImpl(/* ... */)
}
```

```kotlin
// Comparison: Manual DI vs Hilt vs Koin

// Manual DI
class AppContainer(context: Context) {
    val retrofit by lazy { Retrofit.Builder().baseUrl("...").build() }
    val userApi by lazy { retrofit.create(UserApi::class.java) }
    val userRepo by lazy { UserRepositoryImpl(userApi) }
    // Must manually handle threading, scoping, lifecycle cleanup
}

// Hilt — compile-time validated, auto-scoped
@Module @InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun provideRetrofit(): Retrofit = Retrofit.Builder().baseUrl("...").build()
}
// Hilt generates factories, handles threading, validates graph at compile time

// Koin — runtime DSL, simple setup
val appModule = module {
    single { Retrofit.Builder().baseUrl("...").build() }
    single<UserApi> { get<Retrofit>().create(UserApi::class.java) }
    single<UserRepository> { UserRepositoryImpl(get()) }
}
// Simple but missing bindings crash at runtime
```

Now `OrderViewModel` doesn't know or care how `OrderRepository` is built. In tests, you pass a `FakeOrderRepository`. In production, the `AppContainer` provides the real one. The ViewModel went from untestable to trivially testable with one change — moving dependency construction outside the class.

**Key takeaway:** Manual DI using a container class is the simplest way to understand DI. It works for small apps but doesn't scale. Frameworks like Hilt automate the wiring, scoping, and lifecycle management that manual DI forces you to handle yourself. Understanding manual DI makes DI frameworks less magical.

### Lesson 1.5: The Dependency Inversion Principle

DI is often confused with the Dependency Inversion Principle (DIP), but they're related concepts, not the same thing. DIP says that high-level modules should not depend on low-level modules — both should depend on abstractions. DI is one technique for achieving DIP. You can have DI without DIP (injecting concrete classes), and you can have DIP without DI (using a factory pattern), but they work best together.

In practice, DIP means your `ProfileViewModel` should depend on a `UserRepository` interface, not on `UserRepositoryImpl` directly. The implementation detail — whether the repository calls a REST API, a local database, or both — is hidden behind the abstraction. This lets you swap implementations without touching the consumer. The ViewModel doesn't care whether the data comes from the network or a cache.

When you combine DIP with DI, you get maximum flexibility. The ViewModel depends on an interface (DIP). The DI framework provides the concrete implementation at construction time (DI). The ViewModel never knows which implementation it's using, and you can swap it for tests, different build flavors, or future refactors. This combination is the foundation of Clean Architecture.

In Hilt, DIP is expressed through `@Binds` — you declare "when someone needs `UserRepository`, give them `UserRepositoryImpl`." In Koin, it's `single<UserRepository> { UserRepositoryImpl(get()) }`. In Metro, it's `@ContributesBinding`. The mechanism differs, but the principle is the same: high-level code depends on the abstraction, and the DI framework wires in the implementation.

DIP also has module-level implications. In a multi-module project, `:feature:profile` should depend on `:core:domain` (which contains `UserRepository` interface) rather than `:core:data` (which contains `UserRepositoryImpl`). This way, changes to the data layer don't force recompilation of feature modules. The dependency arrow points toward abstractions, not implementations — that's "inversion."

However, DIP can be overdone. Creating an interface for every single class adds boilerplate without benefit. A `DateFormatter` with exactly one implementation and no plans for a second doesn't need an interface. Apply DIP at architectural boundaries — between layers (data ↔ domain ↔ presentation) and between modules. Inside a single module, concrete dependencies are often fine.

The relationship between DI, DIP, and the SOLID principles is worth understanding. DIP is the "D" in SOLID. DI is a technique for implementing DIP. IoC (Inversion of Control) is the broader principle that DI embodies — the framework controls the flow of dependency creation, not your classes. These three concepts work together to produce modular, testable architecture.

In Dagger's generated code, DIP manifests as `Provider<T>` interfaces. The generated component doesn't hold concrete references to your classes — it holds providers that can produce instances on demand. The provider for `UserRepository` might point to `UserRepositoryImpl_Factory`, but the consuming code only sees `Provider<UserRepository>`. The abstraction boundary is preserved even in generated code.

```kotlin
// High-level module depends on abstraction
class ProfileViewModel(
    private val userRepo: UserRepository,  // Interface — not UserRepositoryImpl
) : ViewModel()

// Low-level module implements the abstraction
class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao,
) : UserRepository {
    override suspend fun getUser(id: String): User {
        return dao.getUser(id) ?: api.getUser(id).also { dao.insert(it) }
    }
}
```

```kotlin
// DIP at the module level
// :core:domain — defines the abstraction
interface UserRepository {
    suspend fun getUser(id: String): User?
    suspend fun saveUser(user: User)
    fun observeUser(id: String): Flow<User>
}

// :core:data — implements the abstraction (depends on :core:domain)
class UserRepositoryImpl @Inject constructor(
    private val api: UserApi,
    private val dao: UserDao,
    @IoDispatcher private val dispatcher: CoroutineDispatcher,
) : UserRepository {
    override suspend fun getUser(id: String): User? =
        withContext(dispatcher) {
            dao.getUser(id) ?: api.getUser(id)?.also { dao.insert(it) }
        }

    override suspend fun saveUser(user: User) =
        withContext(dispatcher) {
            api.updateUser(user)
            dao.insert(user)
        }

    override fun observeUser(id: String): Flow<User> =
        dao.observeUser(id)
}

// :feature:profile — depends ONLY on :core:domain
// Never sees UserRepositoryImpl, UserApi, or UserDao
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository, // Interface from :core:domain
) : ViewModel()
```

```kotlin
// ❌ Over-applying DIP — unnecessary interface
interface FormatDateUseCaseInterface {
    fun format(date: LocalDate): String
}
class FormatDateUseCaseImpl @Inject constructor() : FormatDateUseCaseInterface {
    override fun format(date: LocalDate): String = date.format(DateTimeFormatter.ISO_DATE)
}
// Two files, a binding, and an interface for one line of formatting logic

// ✅ Skip the interface when it's not needed
class FormatDateUseCase @Inject constructor() {
    fun format(date: LocalDate): String = date.format(DateTimeFormatter.ISO_DATE)
}
// Same functionality, less ceremony
```

```kotlin
// How DI frameworks implement DIP
// Hilt: @Binds maps interface to implementation
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
}

// Metro: @ContributesBinding does the same thing declaratively
@ContributesBinding(AppScope::class)
@Inject
class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao,
) : UserRepository

// Koin: DSL binding
val repositoryModule = module {
    single<UserRepository> { UserRepositoryImpl(get(), get()) }
}

// All three achieve the same result: the consumer depends on UserRepository,
// and the framework provides UserRepositoryImpl at runtime
```

**Key takeaway:** DI is how you deliver dependencies. DIP is about depending on abstractions, not concretions. Together, they make code modular, testable, and resistant to change. Apply DIP at architectural boundaries (between layers and modules), but don't over-abstract simple classes that only have one implementation.

### Quiz: Why Dependency Injection

#### What is the primary benefit of Dependency Injection?

- ❌ It makes code run faster at runtime
- ❌ It reduces the number of classes in your project
- ✅ It makes code testable and loosely coupled
- ❌ It eliminates the need for interfaces

> **Explanation:** DI decouples a class from the creation of its dependencies. This makes it easy to swap real implementations with fakes/mocks in tests and keeps modules loosely coupled.

#### Which type of injection should you prefer in Kotlin/Android?

- ✅ Constructor injection
- ❌ Field injection
- ❌ Method injection
- ❌ Static injection

> **Explanation:** Constructor injection makes dependencies explicit, enforces immutability, and doesn't require a DI framework for unit testing. Field injection is only used when you don't control construction (e.g., Activities, Fragments).

#### What is the key difference between a Service Locator and Dependency Injection?

- ❌ Service Locators are faster at runtime
- ❌ Service Locators work at compile time, DI works at runtime
- ✅ With a Service Locator, the class pulls dependencies from a registry. With DI, dependencies are pushed into the class from outside
- ❌ Service Locators only work with singletons

> **Explanation:** A Service Locator hides dependencies inside the class body, requiring you to read the implementation to discover them. DI makes dependencies visible in the constructor signature. This affects testability — DI lets you pass fakes directly, while service locators require setting up global state.

#### What is wrong with a class creating its own dependencies using `RetrofitClient.instance`?

- ❌ It violates Kotlin naming conventions
- ❌ It causes memory leaks
- ✅ It creates tight coupling and makes the class impossible to unit test with fakes
- ❌ It makes the app slower to compile

> **Explanation:** When a class creates its own dependencies via singletons or static accessors, you cannot substitute fakes during testing, and the class is tightly coupled to specific implementations.

### Coding Challenge: Refactor to Constructor Injection

Take the tightly coupled `OrderViewModel` below and refactor it to use constructor injection so it can be unit tested with fakes.

**Before (tightly coupled):**
```kotlin
class OrderViewModel {
    private val api = RetrofitClient.instance.create(OrderApi::class.java)
    private val db = AppDatabase.getInstance().orderDao()

    suspend fun placeOrder(order: Order) {
        api.submitOrder(order)
        db.insert(order)
    }
}
```

#### Solution

```kotlin
// Step 1: Define interfaces
interface OrderApi {
    suspend fun submitOrder(order: Order)
}

interface OrderDao {
    suspend fun insert(order: Order)
}

// Step 2: Refactor to constructor injection
class OrderViewModel(
    private val api: OrderApi,
    private val dao: OrderDao,
) {
    suspend fun placeOrder(order: Order) {
        api.submitOrder(order)
        dao.insert(order)
    }
}

// Step 3: Now you can test with fakes
val viewModel = OrderViewModel(
    api = FakeOrderApi(),
    dao = FakeOrderDao(),
)
```

The refactored class receives its dependencies through the constructor. This means you can pass fake implementations in tests without needing any framework — just plain Kotlin constructors. Notice we also introduced interfaces — this follows the Dependency Inversion Principle and allows the ViewModel to work with any implementation.

---

## Module 2: Hilt Fundamentals

### Lesson 2.1: Hilt Setup and Entry Points

Hilt is Google's recommended DI framework for Android. It builds on top of Dagger and provides a set of standard components and annotations that reduce boilerplate. Setting up Hilt requires three things: the Gradle plugin, the KSP compiler dependency, and annotating your Application class. What took hundreds of lines of Dagger boilerplate — component definitions, subcomponent factories, module declarations — becomes a handful of annotations with Hilt.

The `@HiltAndroidApp` annotation triggers Hilt's code generation and creates the application-level dependency container. Every Activity, Fragment, or other Android component that needs injected dependencies must be annotated with `@AndroidEntryPoint`. This tells Hilt to generate the injection code for that component. Without `@AndroidEntryPoint`, Hilt won't inject any dependencies into that component, even if you annotate fields with `@Inject`.

Under the hood, `@HiltAndroidApp` generates a base class that your Application extends (via bytecode transformation). This base class holds the `SingletonComponent` — the root of Hilt's component hierarchy. When an `@AndroidEntryPoint` Activity is created, Hilt looks up the component hierarchy, creates the appropriate sub-component, and injects the declared dependencies. This all happens before your `onCreate()` body runs, which is why `@Inject lateinit var` fields are available immediately.

The Gradle setup has evolved over the years. Originally, Hilt required KAPT for annotation processing. Now, KSP is the recommended approach — it's faster because it skips the Java stub generation step that KAPT requires. The migration from KAPT to KSP is a build file change only — no source code modifications needed. If you're starting a new project, use KSP from day one.

One common setup mistake is forgetting to apply the Hilt Gradle plugin. Without it, the bytecode transformation that makes `@AndroidEntryPoint` work doesn't run. You'll get cryptic errors about missing generated classes. Another common mistake is adding the `hilt-android` dependency but forgetting the `hilt-compiler` KSP dependency — Hilt needs both the runtime library and the compile-time code generator.

In the generated code, Hilt creates a `Hilt_MyApp` class that extends `Application`. Your `MyApp` class is then bytecode-rewritten to extend `Hilt_MyApp` instead of `Application` directly. Similarly, each `@AndroidEntryPoint` Activity gets a generated `Hilt_MainActivity` that handles component creation and injection. This bytecode transformation is invisible to you but is the mechanism that makes field injection in Activities work.

Compared to raw Dagger, Hilt eliminates three major sources of boilerplate: you don't need to define `@Component` interfaces, you don't need to create `@Subcomponent` factories for Activities and Fragments, and you don't need to write `ViewModelProvider.Factory` implementations. Hilt provides all of these through its standard component hierarchy and annotation-driven code generation.

The tradeoff for Hilt's convenience is flexibility. Hilt's component hierarchy is fixed — you can't add custom components between Activity and ViewModel. If you need a custom scope that doesn't map to any of Hilt's standard components, you have to work around it using `@EntryPoint` or custom solutions. Metro and raw Dagger give you more flexibility here, at the cost of more setup.

```kotlin
// build.gradle.kts
plugins {
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

dependencies {
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
}
```

```kotlin
// Application class — the root of the Hilt graph
@HiltAndroidApp
class MyApp : Application()

// Activity — Hilt injects dependencies here
@AndroidEntryPoint
class MainActivity : ComponentActivity()

// Fragment — also an entry point
@AndroidEntryPoint
class ProfileFragment : Fragment()
```

```kotlin
// What Hilt generates for @HiltAndroidApp (conceptual)
// 1. Hilt_MyApp extends Application
//    - Creates SingletonComponent in onCreate()
//    - Stores it as the root component
//
// 2. MyApp is bytecode-rewritten to extend Hilt_MyApp
//    - Your code thinks it extends Application
//    - At runtime, the class hierarchy is: MyApp → Hilt_MyApp → Application

// What Hilt generates for @AndroidEntryPoint (conceptual)
// 1. Hilt_MainActivity extends ComponentActivity
//    - In onCreate(), gets parent component from Application
//    - Creates ActivityComponent as subcomponent
//    - Injects @Inject fields into the Activity
//
// 2. MainActivity is bytecode-rewritten to extend Hilt_MainActivity
```

```kotlin
// ❌ Common mistake: Missing @AndroidEntryPoint
class BrokenActivity : ComponentActivity() {
    @Inject lateinit var analytics: Analytics // Never injected!

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        analytics.track("screen_viewed") // UninitializedPropertyAccessException!
    }
}

// ✅ Fixed: Add @AndroidEntryPoint
@AndroidEntryPoint
class FixedActivity : ComponentActivity() {
    @Inject lateinit var analytics: Analytics // Injected in super.onCreate()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        analytics.track("screen_viewed") // Works!
    }
}
```

```kotlin
// ❌ Common mistake: @AndroidEntryPoint Fragment inside non-Hilt Activity
class PlainActivity : ComponentActivity() { // Missing @AndroidEntryPoint!
    // Adding a Hilt Fragment here will crash at runtime
}

@AndroidEntryPoint
class MyFragment : Fragment() { // Needs parent Activity to be @AndroidEntryPoint too
    @Inject lateinit var repo: UserRepository
}

// ✅ Fixed: Both Activity and Fragment need @AndroidEntryPoint
@AndroidEntryPoint
class HiltActivity : ComponentActivity()

@AndroidEntryPoint
class MyFragment : Fragment() {
    @Inject lateinit var repo: UserRepository
}
```

**Key takeaway:** `@HiltAndroidApp` on your Application class sets up the root dependency container. `@AndroidEntryPoint` on Activities and Fragments tells Hilt to generate injection code for those components. Without both, Hilt won't inject anything. Use KSP instead of KAPT for faster builds.

### Lesson 2.2: @Provides — Constructing Dependencies

When you need to provide instances of classes you don't own — third-party libraries, builders, factory methods — you use `@Provides` inside a Hilt module. A module is a class annotated with `@Module` and `@InstallIn`, which tells Hilt which component (and therefore which lifecycle) the bindings belong to. This is the most common way to add third-party dependencies to your Hilt graph.

Each `@Provides` function tells Hilt: "When someone needs this type, call this function to create it." Hilt reads the function parameters, resolves them from the dependency graph, and passes them in automatically. The return type is what gets registered in the graph. The function name doesn't matter to Hilt — only the return type and parameter types affect graph resolution.

The `@InstallIn` annotation is what connects a module to a component. `@InstallIn(SingletonComponent::class)` means the bindings live for the entire app lifetime. If you forget `@InstallIn`, Hilt ignores the module entirely — a common source of "missing binding" errors that can be confusing because the module exists and looks correct.

When Dagger processes a `@Provides` function, it generates a factory class for it. For example, `provideRetrofit(client: OkHttpClient)` generates `NetworkModule_ProvideRetrofitFactory`. This factory receives a `Provider<OkHttpClient>`, calls it to get the client, then calls your `provideRetrofit()` function with that client. The factory pattern means Dagger can control when and how often the function is called — once for singletons, every time for unscoped bindings.

The `@Singleton` scope annotation on a `@Provides` function is critically important for expensive objects. Without `@Singleton`, Dagger calls the `@Provides` function every time someone injects the type. For lightweight objects like API interfaces (created via `retrofit.create()`), this is fine — each call is cheap. But for `OkHttpClient` or `Room` databases, creating a new instance on every injection wastes resources and breaks shared state (like connection pools).

A common anti-pattern is putting all `@Provides` functions in a single "GodModule." As your app grows to dozens of provided dependencies, this module becomes a merge conflict magnet and hard to navigate. Instead, organize modules by concern: `NetworkModule`, `DatabaseModule`, `AnalyticsModule`. Each module should provide a cohesive set of related dependencies.

In a multi-module project, each Gradle module should define its own Hilt modules. `:core:network` defines `NetworkModule` with Retrofit and OkHttp bindings. `:core:database` defines `DatabaseModule` with Room bindings. The `:app` module doesn't need to know about these modules — Hilt discovers them automatically during compilation as long as they're in the Gradle dependency graph.

One subtle difference between Hilt and Koin: in Hilt, `@Provides` functions are validated at compile time. If a `@Provides` function has a parameter type that nothing in the graph provides, you get a compile error. In Koin, the equivalent `single { Retrofit.Builder().client(get()).build() }` only fails when `get()` is called at runtime. This compile-time validation is Hilt's biggest advantage over service locators.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(HttpLoggingInterceptor())
            .connectTimeout(30, TimeUnit.SECONDS)
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl("https://api.yourapp.com/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()

    @Provides
    fun provideUserApi(retrofit: Retrofit): UserApi =
        retrofit.create(UserApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "app.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideUserDao(db: AppDatabase): UserDao = db.userDao()
}
```

```kotlin
// What Dagger generates for @Provides (simplified)
// For: fun provideRetrofit(client: OkHttpClient): Retrofit

// Generated: NetworkModule_ProvideRetrofitFactory
class NetworkModule_ProvideRetrofitFactory(
    private val clientProvider: Provider<OkHttpClient>,
) : Factory<Retrofit> {

    override fun get(): Retrofit {
        return NetworkModule.provideRetrofit(clientProvider.get())
    }

    companion object {
        fun create(
            clientProvider: Provider<OkHttpClient>,
        ): NetworkModule_ProvideRetrofitFactory =
            NetworkModule_ProvideRetrofitFactory(clientProvider)
    }
}

// In the component's initialize() method:
// retrofitProvider = DoubleCheck.provider(
//     NetworkModule_ProvideRetrofitFactory.create(okHttpClientProvider)
// )
// DoubleCheck wraps it because of @Singleton — ensures single instance
```

```kotlin
// ❌ Anti-pattern: GodModule with everything
@Module
@InstallIn(SingletonComponent::class)
object GodModule {
    @Provides @Singleton fun provideOkHttp(): OkHttpClient = /* ... */
    @Provides @Singleton fun provideRetrofit(c: OkHttpClient): Retrofit = /* ... */
    @Provides @Singleton fun provideDatabase(ctx: Context): AppDatabase = /* ... */
    @Provides fun provideUserApi(r: Retrofit): UserApi = /* ... */
    @Provides fun provideOrderApi(r: Retrofit): OrderApi = /* ... */
    @Provides fun provideUserDao(db: AppDatabase): UserDao = /* ... */
    @Provides fun provideOrderDao(db: AppDatabase): OrderDao = /* ... */
    @Provides @Singleton fun provideAnalytics(ctx: Context): Analytics = /* ... */
    // ... 20 more functions. Merge conflicts everywhere!
}

// ✅ Organized by concern
@Module @InstallIn(SingletonComponent::class)
object NetworkModule { /* OkHttp, Retrofit, API interfaces */ }

@Module @InstallIn(SingletonComponent::class)
object DatabaseModule { /* Room, DAOs */ }

@Module @InstallIn(SingletonComponent::class)
object AnalyticsModule { /* Analytics implementations */ }
```

```kotlin
// ❌ Missing @Singleton — new database on every injection!
@Module
@InstallIn(SingletonComponent::class)
object BadDatabaseModule {
    @Provides // No @Singleton!
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "app.db").build()
    // Every ViewModel that injects AppDatabase gets a NEW database instance
    // This wastes memory and breaks Room's internal caching
}

// ✅ @Singleton ensures one shared instance
@Module
@InstallIn(SingletonComponent::class)
object GoodDatabaseModule {
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "app.db").build()
}
```

Notice that `provideRetrofit` takes an `OkHttpClient` parameter — Hilt automatically resolves this from `provideOkHttpClient`. This is the dependency graph in action. `provideUserApi` is unscoped (no `@Singleton`), meaning a new instance is created on every injection — which is fine because `retrofit.create()` is lightweight.

**Key takeaway:** Use `@Provides` when you need to construct objects yourself — third-party libraries, builder patterns, factory methods. The module's `@InstallIn` determines which component lifecycle the bindings belong to. Always add `@Singleton` for expensive objects. Organize modules by concern, not as a single GodModule.

### Lesson 2.3: @Binds — Interface-to-Implementation Mapping

When you have an interface and its implementation, and the implementation uses `@Inject constructor`, you don't need `@Provides`. Instead, use `@Binds` — it's more efficient because Hilt doesn't generate a separate factory class. It simply tells the graph: "When someone asks for this interface, give them this implementation." The generated code directly aliases the interface's provider to the implementation's provider.

The key requirement for `@Binds` is that the module must be `abstract`, and the implementation must have an `@Inject constructor` so Hilt knows how to create it. If the implementation doesn't have `@Inject constructor`, you need `@Provides` instead. This is a common source of confusion — if your `@Binds` method causes a "cannot be provided" error, check that the implementation class has `@Inject constructor`.

Understanding why `@Binds` is more efficient requires understanding what Dagger generates. For a `@Provides` function, Dagger generates a factory class that wraps the function call — one extra class per binding. For `@Binds`, Dagger generates nothing. It simply maps the interface type to the implementation's existing factory. In a large app with 50+ bindings, this difference means 50 fewer generated classes with `@Binds`, which directly translates to faster compilation and a smaller APK.

The semantic difference between `@Binds` and `@Provides` also communicates intent to other developers. When you see `@Binds`, you know it's a simple interface-to-implementation mapping — no construction logic, no configuration, no side effects. When you see `@Provides`, you know the function does something — builds an object, configures a builder, calls a factory method. This distinction makes modules more readable at a glance.

In Metro, the equivalent of `@Binds` is `@ContributesBinding`. The difference is that Metro's approach is decentralized — you annotate the implementation class itself, and Metro automatically discovers and registers the binding. With Hilt's `@Binds`, you need a centralized module class that lists all the bindings. Metro's approach scales better in multi-module projects because each module declares its own bindings without needing a central registry.

A common mistake is trying to add logic to a `@Binds` method. Since `@Binds` is abstract, you can't add any body. If you need to do any work — like wrapping the implementation in a decorator, adding logging, or conditionally choosing between implementations — you need `@Provides` instead. `@Binds` is purely declarative.

Another common mistake is forgetting that `@Binds` methods can have scope annotations. If you want the bound type to be a singleton, put `@Singleton` on the `@Binds` method. Without it, a new instance of the implementation is created every time the interface is injected.

In Koin, the equivalent pattern is `single<UserRepository> { UserRepositoryImpl(get(), get()) }`. Notice that Koin doesn't distinguish between "providing" and "binding" — everything goes through the same DSL. This means Koin always has the indirection overhead that `@Binds` eliminates in Dagger. It's a small difference per binding, but it adds up in large apps.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindUserRepository(impl: UserRepositoryImpl): UserRepository

    @Binds
    abstract fun bindAnalytics(impl: FirebaseAnalyticsImpl): Analytics
}

// The implementation uses @Inject constructor — Hilt knows how to create it
class UserRepositoryImpl @Inject constructor(
    private val api: UserApi,
    private val dao: UserDao,
) : UserRepository {
    override suspend fun getUser(id: String): User {
        return dao.getUser(id) ?: api.getUser(id).also { dao.insert(it) }
    }
}

class FirebaseAnalyticsImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : Analytics {
    override fun track(event: String) {
        FirebaseAnalytics.getInstance(context).logEvent(event, null)
    }
}
```

```kotlin
// @Binds generates NO factory — zero-cost mapping
// Your code:
@Binds abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository

// What Dagger does internally (pseudocode):
// userRepositoryProvider = userRepositoryImplProvider
// That's it. No wrapper class. No generated file.

// Compare with @Provides:
@Provides fun provideUserRepo(impl: UserRepositoryImpl): UserRepository = impl

// Dagger generates: RepositoryModule_ProvideUserRepoFactory
// A whole class that wraps a trivial function call.
// Unnecessary overhead for a simple type mapping.
```

```kotlin
// ❌ Common mistake: @Binds without @Inject constructor on implementation
@Module
@InstallIn(SingletonComponent::class)
abstract class BrokenModule {
    @Binds
    abstract fun bindCache(impl: DiskCacheImpl): Cache
}

class DiskCacheImpl(  // Missing @Inject!
    private val cacheDir: File,
) : Cache

// Error: DiskCacheImpl cannot be provided without an @Inject constructor
// or an @Provides-annotated method.

// Fix option 1: Add @Inject constructor
class DiskCacheImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : Cache {
    private val cacheDir = File(context.cacheDir, "disk_cache")
}

// Fix option 2: Use @Provides instead (when you need custom construction)
@Module
@InstallIn(SingletonComponent::class)
object CacheModule {
    @Provides
    @Singleton
    fun provideCache(@ApplicationContext context: Context): Cache =
        DiskCacheImpl(File(context.cacheDir, "disk_cache"))
}
```

```kotlin
// ❌ Common mistake: Trying to add logic to @Binds
@Module
@InstallIn(SingletonComponent::class)
abstract class LoggingModule {
    @Binds
    abstract fun bindLogger(impl: FileLoggerImpl): Logger
    // What if you want to wrap it? Can't add body to abstract fun!
}

// ✅ Use @Provides when you need construction logic
@Module
@InstallIn(SingletonComponent::class)
object LoggingModule {
    @Provides
    @Singleton
    fun provideLogger(fileLogger: FileLoggerImpl, analytics: Analytics): Logger =
        LoggingDecorator(fileLogger, analytics) // Wraps with extra behavior
}
```

```kotlin
// Multi-module @Binds pattern
// :core:data — each repository binding is in its own module
@Module
@InstallIn(SingletonComponent::class)
abstract class UserDataModule {
    @Binds @Singleton
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
}

@Module
@InstallIn(SingletonComponent::class)
abstract class OrderDataModule {
    @Binds @Singleton
    abstract fun bindOrderRepo(impl: OrderRepositoryImpl): OrderRepository
}

// Each module is small, focused, and unlikely to cause merge conflicts
```

**Key takeaway:** Use `@Provides` when you construct the object yourself (third-party libraries, builders). Use `@Binds` when mapping an interface to its implementation. `@Binds` is more efficient — it doesn't generate a factory class. The implementation must have `@Inject constructor`. Use `@Provides` when you need any construction logic beyond simple type mapping.

### Lesson 2.4: @Inject Constructor — Automatic Binding

For classes you own and that don't implement interfaces, the simplest approach is `@Inject constructor`. This tells Hilt: "I know how to create this class — just resolve my constructor parameters from the graph." No module needed. This is the least boilerplate of any binding mechanism, and it's what you should reach for first.

This is the most common pattern for use cases, mappers, formatters, and other classes that don't need interface abstraction. Every constructor parameter must be available in the Hilt graph — if one is missing, you get a compile-time error with a clear message about the missing binding. The error message includes the full dependency chain, making it easy to trace where the missing type is needed.

When Dagger processes `@Inject constructor`, it generates a `_Factory` class for the annotated class. This factory is almost identical to what's generated for `@Provides` — it implements `Factory<T>`, takes `Provider<Dependency>` for each constructor parameter, and has a `get()` method that calls the constructor. The main difference is that no module is involved — the factory is generated directly from the class itself.

The generated factory's `companion object` typically has two convenience methods: `create()` for creating the factory itself, and `newInstance()` for directly creating the object. The `create()` method is used by the component during graph wiring. The `newInstance()` method is occasionally useful in tests where you want to bypass the DI framework entirely.

A common question is when to use `@Inject constructor` versus `@Binds` versus `@Provides`. The decision tree is simple: if the class doesn't implement an interface that consumers depend on, use `@Inject constructor` alone — no module needed. If it implements an interface, add `@Binds` in a module to map the interface to the implementation. Use `@Provides` only when you can't add `@Inject` to the class (third-party classes) or when you need custom construction logic.

One thing to watch out for: `@Inject constructor` registers the class in the graph by its concrete type. If you inject `FormatPriceUseCase` directly (not through an interface), that's what consumers depend on. If you later decide to introduce an interface and a different implementation, you'll need to update every injection site. This is fine for internal helper classes but not ideal for types that might need swapping.

In Metro, the equivalent of `@Inject constructor` is `@Inject` on the class itself (not the constructor). Metro reads the primary constructor's parameters and generates the factory. Default parameter values work as optional bindings — if the type isn't in the graph, the default value is used instead. This is a feature unique to Metro; Dagger and Hilt can't see default values because they're not visible to annotation processors.

Scoping matters even with `@Inject constructor`. By default, a class with `@Inject constructor` is unscoped — a new instance is created every time it's injected. If you want a singleton, add `@Singleton` to the class itself. For ViewModelScoped, you'd need a module with `@InstallIn(ViewModelComponent::class)` because scope annotations on the class directly can only use `@Singleton` (tied to SingletonComponent).

```kotlin
// No module needed — @Inject constructor registers this in the graph automatically
class FormatPriceUseCase @Inject constructor(
    private val currencyProvider: CurrencyProvider,
    private val localeProvider: LocaleProvider,
) {
    fun format(amount: Double): String {
        val formatter = NumberFormat.getCurrencyInstance(localeProvider.locale)
        formatter.currency = currencyProvider.currency
        return formatter.format(amount)
    }
}

// Hilt resolves FormatPriceUseCase automatically wherever it's injected
@HiltViewModel
class ProductViewModel @Inject constructor(
    private val productRepo: ProductRepository,
    private val formatPrice: FormatPriceUseCase,
) : ViewModel()
```

```kotlin
// What Dagger generates for @Inject constructor (simplified)
// Your code:
class FormatPriceUseCase @Inject constructor(
    private val currencyProvider: CurrencyProvider,
    private val localeProvider: LocaleProvider,
)

// Generated: FormatPriceUseCase_Factory
class FormatPriceUseCase_Factory(
    private val currencyProviderProvider: Provider<CurrencyProvider>,
    private val localeProviderProvider: Provider<LocaleProvider>,
) : Factory<FormatPriceUseCase> {

    override fun get(): FormatPriceUseCase =
        FormatPriceUseCase(
            currencyProviderProvider.get(),
            localeProviderProvider.get(),
        )

    companion object {
        fun create(
            currencyProviderProvider: Provider<CurrencyProvider>,
            localeProviderProvider: Provider<LocaleProvider>,
        ): FormatPriceUseCase_Factory =
            FormatPriceUseCase_Factory(currencyProviderProvider, localeProviderProvider)

        fun newInstance(
            currencyProvider: CurrencyProvider,
            localeProvider: LocaleProvider,
        ): FormatPriceUseCase =
            FormatPriceUseCase(currencyProvider, localeProvider)
    }
}
```

```kotlin
// Decision tree: @Inject constructor vs @Binds vs @Provides

// Case 1: Class you own, no interface needed
// → Use @Inject constructor only
class ValidateEmailUseCase @Inject constructor()

// Case 2: Class you own, implements an interface
// → Use @Inject constructor + @Binds module
class UserRepositoryImpl @Inject constructor(
    private val api: UserApi,
) : UserRepository

@Module @InstallIn(SingletonComponent::class)
abstract class RepoModule {
    @Binds abstract fun bind(impl: UserRepositoryImpl): UserRepository
}

// Case 3: Class you don't own (third-party)
// → Use @Provides
@Module @InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides fun provideUserApi(retrofit: Retrofit): UserApi =
        retrofit.create(UserApi::class.java)
}
```

```kotlin
// Scoping with @Inject constructor
// Unscoped — new instance each time (default)
class DateFormatter @Inject constructor()

// Singleton — add @Singleton to the class
@Singleton
class AuthTokenManager @Inject constructor(
    private val tokenStore: TokenStore,
)
// Now AuthTokenManager is created once and shared across the entire app
```

**Key takeaway:** Use `@Inject constructor` for classes you own that don't need interface abstraction. Hilt registers them in the graph automatically — no `@Module`, `@Provides`, or `@Binds` needed. Add `@Singleton` to the class if you need a single shared instance.

### Lesson 2.5: Combining @Provides and @Binds in Practice

In real projects, you'll often need both `@Provides` and `@Binds` in the same feature. A common pattern is to use `@Provides` for third-party APIs and builders, and `@Binds` for your own interface-to-implementation mappings. Since `@Binds` requires an abstract class and `@Provides` requires concrete functions, you can't mix them in the same module — split them into separate modules.

The organizational pattern that scales best is one module per feature or layer: `NetworkModule` provides Retrofit and OkHttp, `DatabaseModule` provides Room, `RepositoryModule` binds repository interfaces. This keeps each module focused and easy to reason about. When a new developer joins the team, they can look at a feature's Hilt modules and immediately understand what dependencies it provides.

There's a Kotlin trick that lets you combine `@Provides` and `@Binds` in a single file using a companion object. The abstract class holds the `@Binds` methods, and its companion object (annotated with `@Module`) holds the `@Provides` methods. Both are installed in the same component. This reduces the number of files but can be less readable — use it when the provides and binds are tightly related.

In a multi-module project, the split between `@Provides` and `@Binds` modules often aligns with the split between Gradle modules. `:core:network` has `NetworkModule` (object with `@Provides`). `:core:data` has `RepositoryBindingsModule` (abstract class with `@Binds`). Feature modules might have their own `@Provides` for feature-specific dependencies and `@Binds` for feature-specific interfaces.

When organizing modules, consider the principle of least surprise. Group related bindings together. If someone is looking for "where is the Retrofit instance provided?", they should find it in `NetworkModule`, not in `AppModule` or `RetrofitProviderModule`. If they're looking for "where is UserRepository bound to its implementation?", it should be in `UserDataModule` or `RepositoryModule`, not scattered across multiple files.

One pattern to avoid is the "module-per-class" anti-pattern, where every `@Binds` gets its own module class. This creates dozens of tiny module files that are tedious to navigate. Group related bindings — all repository bindings in one module, all use case bindings in another, all navigator bindings in a third. Each module should have 3-8 bindings, roughly corresponding to one feature or one architectural layer.

```kotlin
// @Provides for third-party construction
@Module
@InstallIn(SingletonComponent::class)
object AuthNetworkModule {
    @Provides
    fun provideAuthApi(retrofit: Retrofit): AuthApi =
        retrofit.create(AuthApi::class.java)
}

// @Binds for interface mapping
@Module
@InstallIn(SingletonComponent::class)
abstract class AuthBindingsModule {
    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    abstract fun bindTokenStore(impl: SharedPrefsTokenStore): TokenStore
}

// Implementation with @Inject constructor
class AuthRepositoryImpl @Inject constructor(
    private val api: AuthApi,
    private val tokenStore: TokenStore,
) : AuthRepository {
    override suspend fun login(email: String, password: String): AuthToken {
        val token = api.login(LoginRequest(email, password))
        tokenStore.save(token)
        return token
    }
}
```

```kotlin
// Companion object trick — combine @Provides and @Binds in one file
@Module
@InstallIn(SingletonComponent::class)
abstract class PaymentModule {

    @Binds
    @Singleton
    abstract fun bindPaymentGateway(impl: StripeGateway): PaymentGateway

    @Binds
    abstract fun bindReceiptGenerator(impl: PdfReceiptGenerator): ReceiptGenerator

    companion object {
        @Provides
        fun provideStripeClient(): StripeClient =
            StripeClient.Builder()
                .apiKey(BuildConfig.STRIPE_KEY)
                .build()

        @Provides
        fun providePaymentApi(retrofit: Retrofit): PaymentApi =
            retrofit.create(PaymentApi::class.java)
    }
}
// Both the abstract @Binds and concrete @Provides are installed
// in SingletonComponent through the same module declaration
```

```kotlin
// Real-world multi-module module organization
// :core:network/di/NetworkModule.kt
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton fun provideOkHttp(): OkHttpClient = /* ... */
    @Provides @Singleton fun provideRetrofit(client: OkHttpClient): Retrofit = /* ... */
    @Provides @Singleton fun provideMoshi(): Moshi = /* ... */
}

// :core:data/di/RepositoryModule.kt
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds @Singleton abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
    @Binds @Singleton abstract fun bindOrderRepo(impl: OrderRepositoryImpl): OrderRepository
    @Binds @Singleton abstract fun bindProductRepo(impl: ProductRepositoryImpl): ProductRepository
}

// :feature:checkout/di/CheckoutModule.kt
@Module
@InstallIn(ViewModelComponent::class)
object CheckoutModule {
    @Provides @ViewModelScoped
    fun provideCartCalculator(taxService: TaxService): CartCalculator =
        CartCalculator(taxService)
}
```

```kotlin
// ❌ Anti-pattern: module per class
// UserRepoModule.kt — one file for one binding
@Module @InstallIn(SingletonComponent::class)
abstract class UserRepoModule {
    @Binds abstract fun bind(impl: UserRepositoryImpl): UserRepository
}
// OrderRepoModule.kt — another file for one binding
@Module @InstallIn(SingletonComponent::class)
abstract class OrderRepoModule {
    @Binds abstract fun bind(impl: OrderRepositoryImpl): OrderRepository
}
// ... 30 more files with one binding each. Unnavigable!

// ✅ Group related bindings
@Module @InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
    @Binds abstract fun bindOrderRepo(impl: OrderRepositoryImpl): OrderRepository
    @Binds abstract fun bindProductRepo(impl: ProductRepositoryImpl): ProductRepository
}
```

**Key takeaway:** Split `@Provides` (concrete `object` modules) and `@Binds` (abstract class modules) into separate classes. Organize modules by feature or layer for maintainability. Group 3-8 related bindings per module. Avoid God modules and module-per-class anti-patterns.

### Lesson 2.6: Hilt Built-in Bindings

Hilt provides several bindings out of the box that you can inject without creating any modules. The most important ones are `@ApplicationContext` and `@ActivityContext`, which provide `Context` instances scoped to the appropriate lifecycle. `Application` itself is also directly injectable. These built-in bindings save you from the common anti-pattern of passing `Context` through constructor chains or storing it in global variables.

Hilt ensures you get the right `Context` for the right scope — `@ApplicationContext` for long-lived objects like repositories, `@ActivityContext` for Activity-scoped objects like UI helpers. Using the wrong context is one of the most common sources of memory leaks in Android apps. Injecting `@ActivityContext` into a `@Singleton`-scoped class means the singleton holds a reference to the Activity, preventing garbage collection when the Activity is destroyed.

Beyond Context, Hilt automatically provides `Application` (the concrete class, not just Context), which is useful for initialization code that needs Application-specific APIs. In `ViewModelComponent`, Hilt provides `SavedStateHandle` automatically — this is what makes `@HiltViewModel` so convenient. You don't need a custom `AbstractSavedStateViewModelFactory` like you would with raw Dagger.

Understanding what Hilt provides by default helps you avoid creating redundant bindings. A `@Provides` function that returns `context.applicationContext` is unnecessary — `@ApplicationContext` already does this. Similarly, providing `getSystemService()` results can often use `@ApplicationContext` directly in the consuming class rather than adding a separate `@Provides` function.

The component-to-built-in-binding mapping is important to know. `SingletonComponent` provides `Application` and `@ApplicationContext Context`. `ActivityComponent` additionally provides `Activity` and `@ActivityContext Context`. `FragmentComponent` adds `Fragment`. `ViewComponent` adds `View`. `ViewModelComponent` adds `SavedStateHandle`. Each child component inherits all bindings from its parent.

In Koin, there's no automatic provision of these types — you have to explicitly pass `androidContext(this)` during setup and then inject it with `get()`. In Metro, `@ApplicationContext` isn't available (Metro is platform-agnostic), so you provide Context through `@DependencyGraph.Factory` parameters. Hilt's built-in Android bindings are one of its strongest advantages for Android-only projects.

Hilt also provides `@ActivityRetainedComponent` bindings that survive configuration changes. This is useful for objects that should persist across rotations but not across Activity restarts. The `ActivityRetainedComponent` is backed by a `ViewModel` internally, which is how it survives configuration changes.

A common mistake is injecting `@ActivityContext` into a class that's installed in `SingletonComponent`. Hilt catches this at compile time with a clear error — you can't inject a shorter-lived context into a longer-lived component. This compile-time safety prevents a whole category of memory leak bugs.

```kotlin
// @ApplicationContext — safe for singletons, survives Activity destruction
class ImageCacheManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val cacheDir = File(context.cacheDir, "images")
}

// @ActivityContext — tied to Activity lifecycle, destroyed on config changes
class ThemeHelper @Inject constructor(
    @ActivityContext private val context: Context,
) {
    fun resolveColor(attr: Int): Int {
        val typedValue = TypedValue()
        context.theme.resolveAttribute(attr, typedValue, true)
        return typedValue.data
    }
}

// Application is directly injectable
class AppInitializer @Inject constructor(
    private val application: Application,
) {
    fun initialize() {
        Timber.plant(Timber.DebugTree())
    }
}
```

```kotlin
// ❌ Memory leak: @ActivityContext in a Singleton
@Singleton
class LeakyManager @Inject constructor(
    @ActivityContext private val context: Context, // COMPILE ERROR!
    // Hilt prevents this — @ActivityContext can't be in SingletonComponent
)

// ❌ Memory leak (without Hilt protection)
@Singleton
class LeakyManagerManual(
    private val activityContext: Context, // Holds Activity reference forever!
)

// ✅ Use @ApplicationContext for singletons
@Singleton
class SafeManager @Inject constructor(
    @ApplicationContext private val context: Context, // App context — no leak
)
```

```kotlin
// Built-in bindings per component
// SingletonComponent: Application, @ApplicationContext Context
// ActivityRetainedComponent: (inherits from Singleton)
// ViewModelComponent: SavedStateHandle (+ inherited)
// ActivityComponent: Activity, @ActivityContext Context (+ inherited)
// FragmentComponent: Fragment (+ inherited)
// ViewComponent: View (+ inherited)
// ServiceComponent: Service (+ inherited)

// SavedStateHandle is automatically available in @HiltViewModel
@HiltViewModel
class DetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle, // Auto-provided by Hilt
    private val repository: DetailRepository,
) : ViewModel() {
    private val itemId: String = checkNotNull(savedStateHandle["itemId"])
}
```

```kotlin
// ❌ Redundant: manually providing what Hilt already provides
@Module
@InstallIn(SingletonComponent::class)
object UnnecessaryModule {
    @Provides
    fun provideAppContext(@ApplicationContext context: Context): Context = context
    // Hilt already provides @ApplicationContext Context!
}

// ✅ Just inject @ApplicationContext directly where needed
class FileManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun getFilesDir(): File = context.filesDir
}
```

**Key takeaway:** Use `@ApplicationContext` for long-lived dependencies and `@ActivityContext` for Activity-scoped ones. Never store `@ActivityContext` in a singleton — Hilt catches this at compile time. Know what Hilt provides automatically to avoid creating redundant bindings.

### Quiz: Hilt Fundamentals

#### What annotation must be placed on your `Application` class to enable Hilt?

- ❌ @AndroidEntryPoint
- ✅ @HiltAndroidApp
- ❌ @InstallIn
- ❌ @Module

> **Explanation:** `@HiltAndroidApp` triggers Hilt's code generation and sets up the application-level dependency container. `@AndroidEntryPoint` is used on Activities, Fragments, and other Android components — not the Application class.

#### When should you use `@Binds` instead of `@Provides`?

- ❌ When providing third-party library instances
- ❌ When you need to call a builder pattern
- ✅ When mapping an interface to its existing implementation class that has `@Inject constructor`
- ❌ When creating unscoped dependencies

> **Explanation:** `@Binds` tells Hilt which implementation to use for an interface. It's more efficient than `@Provides` because Hilt doesn't generate a separate factory — it just wires the binding directly. The implementation must have `@Inject constructor`.

#### What does `@InstallIn(SingletonComponent::class)` mean on a Hilt module?

- ❌ The module is only used in unit tests
- ❌ The module provides exactly one dependency
- ❌ The module is installed only once per build
- ✅ The module's bindings are available for the entire application lifetime

> **Explanation:** `@InstallIn(SingletonComponent::class)` attaches the module to the application-level component, making its bindings available throughout the app's lifecycle. The component you install into determines the lifetime and scope of the provided dependencies.

#### What happens if you forget `@InstallIn` on a Hilt module?

- ❌ Hilt defaults to SingletonComponent
- ❌ The module is installed in all components
- ✅ Hilt ignores the module entirely, causing "missing binding" errors
- ❌ The app crashes at runtime

> **Explanation:** Without `@InstallIn`, Hilt doesn't know which component to attach the module to, so it ignores the module completely. Any types provided by that module will appear as missing bindings at compile time.

### Coding Challenge: Create a Complete Hilt Module

Create Hilt modules that provide an `AuthApi` (via Retrofit), bind an `AuthRepository` interface to its implementation, and make a `TokenStore` available throughout the app.

#### Solution

```kotlin
// Interfaces
interface AuthRepository {
    suspend fun login(email: String, password: String): AuthToken
}

interface TokenStore {
    fun save(token: AuthToken)
    fun get(): AuthToken?
}

// Implementations with @Inject constructor
class AuthRepositoryImpl @Inject constructor(
    private val api: AuthApi,
    private val tokenStore: TokenStore,
) : AuthRepository {
    override suspend fun login(email: String, password: String): AuthToken {
        val token = api.login(LoginRequest(email, password))
        tokenStore.save(token)
        return token
    }
}

class SharedPrefsTokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) : TokenStore {
    private val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
    override fun save(token: AuthToken) { prefs.edit().putString("token", token.value).apply() }
    override fun get(): AuthToken? = prefs.getString("token", null)?.let { AuthToken(it) }
}

// @Provides for Retrofit-created API
@Module
@InstallIn(SingletonComponent::class)
object AuthNetworkModule {
    @Provides
    fun provideAuthApi(retrofit: Retrofit): AuthApi =
        retrofit.create(AuthApi::class.java)
}

// @Binds for interface mappings
@Module
@InstallIn(SingletonComponent::class)
abstract class AuthBindingsModule {
    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindTokenStore(impl: SharedPrefsTokenStore): TokenStore
}
```

`@Provides` is used for `AuthApi` because Retrofit creates the instance via `retrofit.create()`. `@Binds` maps both `AuthRepository` and `TokenStore` to their implementations. Both implementations use `@Inject constructor` so Hilt can create them automatically.

---

## Module 3: Scoping, Qualifiers, and Components

### Lesson 3.1: Hilt Component Hierarchy

Hilt organizes dependencies into a hierarchy of components, each tied to an Android lifecycle. Understanding this hierarchy is essential for scoping dependencies correctly. Each component is a child of the one above it, and child components can access all bindings from their parent. This hierarchical model mirrors Android's own lifecycle hierarchy — Applications contain Activities, Activities contain Fragments.

The hierarchy reflects Android's lifecycle model. `SingletonComponent` lives for the entire process. `ActivityRetainedComponent` survives configuration changes (it's backed by a `ViewModel` internally). `ViewModelComponent` is scoped to individual ViewModels. `ActivityComponent`, `FragmentComponent`, and `ViewComponent` match their respective Android lifecycle owners. Each component is destroyed when its corresponding lifecycle owner is destroyed.

A dependency scoped to a component is created once per instance of that component and shared across all injection sites within it. An unscoped dependency in `SingletonComponent` creates a new instance every time it's injected — which is fine for lightweight, stateless objects like use cases or mappers. The scoping decision is about whether you need a shared instance or fresh instances.

Understanding the hierarchy is critical for avoiding subtle bugs. A `@Singleton` dependency can't depend on an `@ActivityScoped` dependency — that would mean the singleton holds a reference to something that gets destroyed when the Activity dies, causing crashes or stale data. Hilt validates these scope relationships at compile time. If you try to inject an Activity-scoped dependency into a Singleton-scoped one, you get a compile error.

The `ActivityRetainedComponent` is particularly important for Compose apps. It survives configuration changes like rotation, which means dependencies scoped to it persist across recompositions triggered by rotation. This is the right scope for state that should survive rotation but not outlive the Activity — like a flow checkout state or a media player session.

In Dagger's generated code, each component is a class that holds providers for all its bindings plus references to its parent component's providers. The `SingletonComponent` has no parent. The `ActivityComponent` holds a reference to `SingletonComponent` and can access its providers. This parent reference is how child components inherit bindings from parents.

Metro's equivalent hierarchy uses `@DependencyGraph` and `@GraphExtension`. Unlike Hilt's fixed hierarchy, Metro lets you define custom parent-child relationships. This gives you more flexibility but requires you to manage the hierarchy manually. Hilt's fixed hierarchy is less flexible but eliminates an entire category of architectural decisions.

Koin handles scoping differently — it uses named scopes that you create and destroy manually. There's no automatic lifecycle management. If you forget to close a scope, the scoped dependencies leak. Hilt's lifecycle-tied components make scope management automatic.

```
SingletonComponent            (Application lifetime)
├── ActivityRetainedComponent  (Survives config changes)
│   ├── ViewModelComponent     (ViewModel lifetime)
│   └── ActivityComponent      (Activity lifetime)
│       ├── FragmentComponent  (Fragment lifetime)
│       └── ViewComponent      (View lifetime)
└── ServiceComponent           (Service lifetime)
```

```kotlin
// Each component level has a corresponding scope annotation
// SingletonComponent    → @Singleton
// ActivityRetainedComponent → @ActivityRetainedScoped
// ViewModelComponent    → @ViewModelScoped
// ActivityComponent     → @ActivityScoped
// FragmentComponent     → @FragmentScoped
// ViewComponent         → @ViewScoped
// ServiceComponent      → @ServiceScoped

// Example: scoping to different levels
@Singleton
class AppDatabase @Inject constructor(/* ... */) // Lives for entire app

@ActivityRetainedScoped
class CheckoutSession @Inject constructor(/* ... */) // Survives rotation

@ViewModelScoped
class SearchPaginator @Inject constructor(/* ... */) // Per-ViewModel

@ActivityScoped
class PermissionHelper @Inject constructor(/* ... */) // Per-Activity

@FragmentScoped
class FormValidator @Inject constructor(/* ... */) // Per-Fragment
```

```kotlin
// ❌ Scope violation: Singleton depends on Activity-scoped
@Singleton
class UserManager @Inject constructor(
    @ActivityContext private val context: Context, // COMPILE ERROR!
    // A Singleton can't depend on something that lives shorter
)

// ✅ Fixed: use the right context scope
@Singleton
class UserManager @Inject constructor(
    @ApplicationContext private val context: Context, // Singleton-safe
)
```

```kotlin
// How Dagger generates the component hierarchy (simplified)
// DaggerSingletonComponent {
//     private val databaseProvider: Provider<AppDatabase>
//     private val retrofitProvider: Provider<Retrofit>
//
//     inner class ActivityComponentImpl : ActivityComponent {
//         // Can access parent's providers
//         private val navigatorProvider: Provider<Navigator>
//
//         inner class FragmentComponentImpl : FragmentComponent {
//             // Can access both Activity and Singleton providers
//         }
//     }
// }
```

```kotlin
// Comparison: Hilt vs Metro vs Koin component hierarchy

// Hilt — fixed hierarchy, automatic lifecycle
// Components are predefined, scopes are automatic
@Module @InstallIn(SingletonComponent::class) // Lives with Application
object AppModule { /* ... */ }

// Metro — custom hierarchy, manual lifecycle
// You define the graph structure yourself
@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val loggedInGraphFactory: LoggedInGraph.Factory
}
@GraphExtension(LoggedInScope::class)
interface LoggedInGraph { /* ... */ }

// Koin — named scopes, manual lifecycle
scope<CheckoutActivity> {
    scoped { CheckoutSession() } // Must manually close scope!
}
```

**Key takeaway:** Each Hilt component maps to an Android lifecycle. Scope dependencies to the smallest lifecycle that makes sense — `@Singleton` for app-wide state, `@ViewModelScoped` for screen state, unscoped for lightweight stateless objects. Hilt validates scope relationships at compile time.

### Lesson 3.2: Scoping Dependencies Correctly

The most common DI mistake isn't about how dependencies are injected — it's about how long they live. A database instance scoped to an Activity gets destroyed on every rotation. A user session scoped as a singleton leaks state across different users. The mental model is straightforward: a dependency's scope should match the lifetime of the thing that needs it.

Over-scoping is just as bad as under-scoping. Making everything a `@Singleton` feels safe, but singletons hold state for the entire process lifetime. This can cause real data leakage bugs in production — user A sees user B's cached data because a `UserSessionManager` singleton wasn't cleared between sessions. In Android, the process can live much longer than a user session, especially on devices with plenty of RAM.

Under-scoping wastes resources and causes inconsistency. If two Fragments both inject an unscoped `ShoppingCart`, they each get separate instances. Adding an item in one Fragment doesn't show up in the other. If you unscope a database, each injection creates a new database connection — wasteful and potentially causing lock contention.

The right mental model is to ask: "What is the natural lifetime of this object?" An `OkHttpClient` manages connection pools and thread pools — it should live as long as the app. A `SearchPaginator` holds page state for a specific search session — it should live as long as the ViewModel. A `DateFormatter` is stateless — it doesn't need scoping at all; creating a new one on every injection is fine.

In Dagger's generated code, scoping is implemented through `DoubleCheck`. When a binding has `@Singleton`, the component wraps its provider in `DoubleCheck.provider()`, which uses double-checked locking to ensure the instance is created only once. Unscoped bindings call the factory directly on every `get()` call. Understanding this helps you make informed decisions — the `DoubleCheck` overhead is negligible, but unnecessary singletons waste memory by keeping objects alive longer than needed.

A production debugging story: an app had a `CartManager` scoped as `@Singleton`. When a user completed a purchase and started a new shopping session, the cart still showed items from the previous purchase. The singleton was never cleared because it was designed to live forever. The fix was to scope the `CartManager` to `ActivityRetainedComponent` so it was naturally destroyed when the user navigated away from the shopping flow. Scope discipline would have prevented this bug entirely.

Hilt, Koin, and Metro all handle scoping differently in terms of enforcement. Hilt validates scope consistency at compile time — you can't accidentally create a singleton that depends on an Activity-scoped binding. Koin has no compile-time scope validation — scope mismatches are runtime errors. Metro validates scoping at compile time like Hilt, and is actually stricter — it requires explicit scope annotations and flags ambiguities that Dagger silently accepts.

For ViewModels specifically, `@ViewModelScoped` is almost always the right choice for stateful dependencies. The ViewModel survives configuration changes (rotation, theme changes) but is destroyed when the user navigates away. Dependencies scoped to the ViewModel share this lifecycle. This is the sweet spot for screen-level state — it survives recomposition but doesn't leak across screens.

```kotlin
// Singleton — one instance for the entire app
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideAuthManager(tokenStore: TokenStore): AuthManager =
        AuthManagerImpl(tokenStore)
}

// ViewModelScoped — lives as long as the ViewModel, shared across recompositions
@Module
@InstallIn(ViewModelComponent::class)
object FeatureModule {
    @Provides
    @ViewModelScoped
    fun provideSearchPaginator(searchApi: SearchApi): SearchPaginator =
        SearchPaginator(searchApi, pageSize = 20)
}

// Activity-scoped — new instance per Activity
@Module
@InstallIn(ActivityComponent::class)
abstract class ActivityModule {
    @Binds
    @ActivityScoped
    abstract fun bindNavigator(impl: NavigatorImpl): Navigator
}

// Unscoped — new instance every time it's injected
class FormatDateUseCase @Inject constructor(
    private val localeProvider: LocaleProvider,
)
```

```kotlin
// ❌ Over-scoped — holds state for too long
@Singleton
class UserSession @Inject constructor() {
    var currentUser: User? = null // Persists across login/logout!
    var authToken: String? = null  // Previous user's token lives here!
}

// ✅ Correctly scoped — tied to login session lifecycle
// Use ActivityRetainedComponent or a custom scope
@Module
@InstallIn(ActivityRetainedComponent::class)
object SessionModule {
    @Provides
    @ActivityRetainedScoped
    fun provideUserSession(): UserSession = UserSession()
}
```

```kotlin
// ❌ Under-scoped — duplicate instances cause inconsistency
class ShoppingCart @Inject constructor() { // Unscoped!
    private val items = mutableListOf<CartItem>()
    fun addItem(item: CartItem) { items.add(item) }
    fun getItems(): List<CartItem> = items.toList()
}

// Fragment A injects ShoppingCart → gets instance #1
// Fragment B injects ShoppingCart → gets instance #2
// Adding item in Fragment A doesn't appear in Fragment B!

// ✅ Correctly scoped — shared instance across the flow
@Module
@InstallIn(ViewModelComponent::class)
object CartModule {
    @Provides
    @ViewModelScoped
    fun provideShoppingCart(): ShoppingCart = ShoppingCart()
}
```

```kotlin
// Scoping decision checklist
// 1. Does the object hold mutable state?
//    No  → Unscoped (new instance each time is fine)
//    Yes → Needs scoping. Continue to 2.
//
// 2. Should the state survive configuration changes?
//    No  → @ActivityScoped or @FragmentScoped
//    Yes → Continue to 3.
//
// 3. Should the state survive navigation (back stack)?
//    No  → @ViewModelScoped or @ActivityRetainedScoped
//    Yes → Continue to 4.
//
// 4. Should the state live for the entire app?
//    Yes → @Singleton
//    No  → Reconsider your design. Maybe use a cache with TTL.
```

```kotlin
// How Dagger implements scoping internally
// Unscoped binding:
// userRepositoryProvider = UserRepository_Factory.create(apiProvider, daoProvider)
// → Every .get() call creates a new UserRepository

// Scoped binding (@Singleton):
// userRepositoryProvider = DoubleCheck.provider(
//     UserRepository_Factory.create(apiProvider, daoProvider)
// )
// → First .get() creates the instance; subsequent .get() returns the cached one
// → DoubleCheck uses double-checked locking for thread safety
```

**Key takeaway:** Scope dependencies to the smallest lifecycle that makes sense. `@Singleton` for app-wide shared state, `@ViewModelScoped` for screen state that survives configuration changes, `@ActivityScoped` for Activity-bound state. Unscoped is fine for lightweight stateless objects. Over-scoping causes data leakage; under-scoping causes waste and inconsistency.

### Lesson 3.3: Qualifiers — Disambiguating Same-Type Bindings

When you have multiple bindings of the same type, Hilt can't tell which one to inject. Qualifiers solve this by adding a type-safe label to each binding. Without qualifiers, Hilt would fail at compile time with an ambiguous binding error. Qualifiers are one of the most practical DI features — you'll use them in every non-trivial project.

Qualifiers are annotation classes you define. They must have `@Qualifier` and `@Retention(AnnotationRetention.BINARY)` — binary retention means the annotation is preserved in compiled bytecode (which Hilt needs) but isn't available at runtime through reflection (which you don't need). Every injection site must specify which qualified binding it wants. Forgetting the qualifier at the injection site causes a compile error.

The most common use case is dispatchers, but qualifiers are also useful for base URLs, API keys, feature flags, database names, and any other case where you have multiple values of the same type. In a multi-module project, you might have qualified dispatchers, qualified CoroutineScopes, qualified base URLs for different API environments, and qualified feature flags.

Under the hood, Dagger treats qualified types as distinct types in the graph. `@IoDispatcher CoroutineDispatcher` and `@MainDispatcher CoroutineDispatcher` are two completely separate entries in the dependency graph. The qualifier is part of the type identity for graph resolution purposes. This means you can have one scoped as `@Singleton` and the other unscoped — they're independent bindings.

In Dagger's generated code, qualifiers appear in the factory's parameter names and in the component's provider field names. The component might have `ioDispatcherProvider` and `mainDispatcherProvider` as separate fields, each pointing to a different `@Provides` function. The qualifier-to-provider mapping is resolved entirely at compile time — there's no runtime lookup.

A common mistake is forgetting to add the qualifier at the injection site. If your module provides `@IoDispatcher CoroutineDispatcher` and your class injects `CoroutineDispatcher` without the qualifier, Hilt treats it as a request for an unqualified `CoroutineDispatcher` — which might not exist in the graph, causing a "missing binding" error.

Metro handles qualifiers differently. Since Metro operates inside the compiler, it can use Kotlin's type system more naturally. Metro supports `@Named` and custom qualifiers like Dagger, but it also supports using the parameter name as an implicit qualifier in some cases. However, explicit qualifiers are still the recommended approach for clarity.

Koin uses `named()` for qualification: `single(named("io")) { Dispatchers.IO }`. The qualification is string-based, which means typos aren't caught until runtime. This is one of the key safety differences between Koin and Hilt — Hilt's qualifiers are type-checked at compile time.

```kotlin
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class MainDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DefaultDispatcher

@Module
@InstallIn(SingletonComponent::class)
object DispatcherModule {

    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO

    @Provides
    @MainDispatcher
    fun provideMainDispatcher(): CoroutineDispatcher = Dispatchers.Main

    @Provides
    @DefaultDispatcher
    fun provideDefaultDispatcher(): CoroutineDispatcher = Dispatchers.Default
}

// Usage — qualifier tells Hilt exactly which dispatcher to inject
class UserRepository @Inject constructor(
    private val api: UserApi,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    suspend fun getUser(id: String) = withContext(ioDispatcher) {
        api.getUser(id)
    }
}

class SearchUseCase @Inject constructor(
    private val index: SearchIndex,
    @DefaultDispatcher private val computeDispatcher: CoroutineDispatcher,
) {
    suspend fun search(query: String) = withContext(computeDispatcher) {
        index.query(query)
    }
}
```

```kotlin
// Qualified CoroutineScopes — common in production apps
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AppScope

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoScope

@Module
@InstallIn(SingletonComponent::class)
object ScopeModule {
    @Provides
    @Singleton
    @AppScope
    fun provideAppScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @Singleton
    @IoScope
    fun provideIoScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO)
}

// Inject the specific scope you need
class SyncManager @Inject constructor(
    @IoScope private val ioScope: CoroutineScope,
) {
    fun startPeriodicSync() {
        ioScope.launch {
            while (isActive) {
                syncData()
                delay(15.minutes)
            }
        }
    }
}
```

```kotlin
// ❌ Missing qualifier at injection site
class BrokenRepository @Inject constructor(
    private val dispatcher: CoroutineDispatcher, // No qualifier!
    // Error: CoroutineDispatcher cannot be provided without a qualifier
)

// ✅ Always specify the qualifier
class FixedRepository @Inject constructor(
    @IoDispatcher private val dispatcher: CoroutineDispatcher, // Qualified!
)
```

```kotlin
// Qualifiers for multiple API base URLs
@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class AuthBaseUrl

@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class ContentBaseUrl

@Module
@InstallIn(SingletonComponent::class)
object UrlModule {
    @Provides @AuthBaseUrl
    fun provideAuthUrl(): String = "https://auth.myapp.com/"

    @Provides @ContentBaseUrl
    fun provideContentUrl(): String = "https://api.myapp.com/v2/"
}

// Create separate Retrofit instances for different APIs
@Module
@InstallIn(SingletonComponent::class)
object RetrofitModule {
    @Provides @Singleton @AuthBaseUrl
    fun provideAuthRetrofit(
        client: OkHttpClient,
        @AuthBaseUrl baseUrl: String,
    ): Retrofit = Retrofit.Builder().baseUrl(baseUrl).client(client).build()

    @Provides @Singleton @ContentBaseUrl
    fun provideContentRetrofit(
        client: OkHttpClient,
        @ContentBaseUrl baseUrl: String,
    ): Retrofit = Retrofit.Builder().baseUrl(baseUrl).client(client).build()
}
```

**Key takeaway:** Use `@Qualifier` annotations to distinguish between multiple bindings of the same type. Every injection site must specify the qualifier. Without qualifiers, Hilt fails at compile time with an ambiguous binding error. Qualifiers are type-safe, unlike Koin's string-based `named()`.

### Lesson 3.4: @Named vs Custom Qualifiers

Hilt provides a built-in `@Named` qualifier that takes a string parameter. While convenient for quick prototyping, custom qualifiers are safer because they're type-checked at compile time. A typo in `@Named("io_dispatcer")` compiles fine but fails at runtime (or gives the wrong binding). A typo in `@IoDispatcer` fails to compile.

Custom qualifiers are also self-documenting. When you see `@IoDispatcher` in code, you know exactly what it means. `@Named("io")` requires you to remember what "io" refers to. In large codebases with many qualified bindings, this difference in readability compounds. An IDE can also show all usages of a custom qualifier annotation — with `@Named`, you'd need to search for the specific string.

Custom qualifiers can carry additional metadata if needed. While this is rare in Android DI, you could theoretically add parameters to a qualifier annotation for more complex disambiguation. `@Named` is limited to a single string parameter.

In the generated code, `@Named` and custom qualifiers are handled identically by Dagger. Both become part of the type key for graph resolution. The difference is purely in the developer experience — custom qualifiers are safer and more readable. The generated factories look the same either way.

One practical consideration: if you're using qualifiers across multiple Gradle modules, custom qualifier annotations should live in a shared module (like `:core:common`) that all modules depend on. This ensures consistency. `@Named` strings can be defined anywhere, which makes them harder to keep consistent — one module might use `@Named("io")` and another `@Named("IO")` or `@Named("io_dispatcher")`.

In Koin, all qualification is string-based: `named("io")`. There's no type-safe option. This is one of the fundamental safety differences between Koin and Hilt. Metro supports both `@Named` and custom qualifiers, and also supports the `@ForScope` qualifier for scope-specific bindings.

There is one legitimate use case for `@Named`: when you're prototyping quickly and don't want to create annotation classes for every qualifier. In this case, use `@Named` initially and refactor to custom qualifiers before shipping to production. The refactor is mechanical — change the annotation and update all usage sites.

```kotlin
// @Named — works but fragile
@Module
@InstallIn(SingletonComponent::class)
object UrlModule {
    @Provides
    @Named("production")
    fun provideProductionUrl(): String = "https://api.myapp.com/"

    @Provides
    @Named("staging")
    fun provideStagingUrl(): String = "https://staging-api.myapp.com/"
}

// Custom qualifiers — type-safe, self-documenting
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ProductionUrl

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class StagingUrl

@Module
@InstallIn(SingletonComponent::class)
object BetterUrlModule {
    @Provides
    @ProductionUrl
    fun provideProductionUrl(): String = "https://api.myapp.com/"

    @Provides
    @StagingUrl
    fun provideStagingUrl(): String = "https://staging-api.myapp.com/"
}
```

```kotlin
// ❌ @Named typo — compiles fine, fails at runtime
class ApiClient @Inject constructor(
    @Named("prodction") private val baseUrl: String, // Typo! Silent failure
)

// ✅ Custom qualifier typo — compile error
class ApiClient @Inject constructor(
    @Prodction private val baseUrl: String, // Compile error: Unresolved reference
)
```

```kotlin
// IDE support difference
// Custom qualifier: "Find Usages" on @IoDispatcher shows every injection site
// @Named("io"): "Find Usages" shows every @Named annotation, not filtered by value

// Refactoring difference
// Custom qualifier: "Rename" on @IoDispatcher updates all usages automatically
// @Named("io"): Must manually find-replace the string "io" — error-prone
```

```kotlin
// Organizing qualifiers in a multi-module project
// :core:common/src/main/kotlin/com/app/di/Qualifiers.kt
@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class MainDispatcher

@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class DefaultDispatcher

@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class ProductionUrl

@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class DebugUrl

// All modules depend on :core:common, so all modules can use these qualifiers
// No string duplication, no inconsistency
```

**Key takeaway:** Prefer custom `@Qualifier` annotations over `@Named`. Custom qualifiers are type-safe, self-documenting, and catch typos at compile time. Reserve `@Named` for quick prototypes. Store qualifiers in a shared `:core:common` module for multi-module consistency.

### Lesson 3.5: Assisted Injection

Sometimes a class needs a mix of dependencies from the graph and values that are only known at runtime. Assisted injection handles this. You annotate runtime parameters with `@Assisted` and define a factory interface with `@AssistedFactory`. Hilt generates the factory implementation that bridges graph-provided dependencies with runtime-provided values.

This pattern is common for classes that need both injected services and dynamic configuration — like a payment processor that needs an amount, or a media player that needs a track URL. Without assisted injection, you'd have to create the object manually and pass all dependencies by hand, which means knowing about dependencies you shouldn't need to care about.

Under the hood, Hilt generates the factory implementation at compile time. The generated factory receives `Provider<T>` for each graph-provided dependency and has a `create()` method that takes the assisted parameters. When you call `factory.create(orderId, amount)`, the generated code calls the constructor with both the assisted parameters and the resolved providers. It's essentially a code-generated builder pattern.

The key rule for `@Assisted` parameters: they must be distinguishable by type. If you have two `@Assisted String` parameters, Dagger can't tell them apart in the factory method. You need to use `@Assisted("orderId")` and `@Assisted("description")` with named tags to disambiguate. Metro has better support for this because it can see Kotlin parameter names directly.

Assisted injection is different from `@Provides` with runtime parameters. With `@Provides`, the module function can only access values that are in the graph. With assisted injection, the factory method can accept any runtime value. This is why `@HiltWorker` uses `@AssistedInject` — `Context` and `WorkerParameters` are runtime values that WorkManager provides, not graph bindings.

A common mistake is using assisted injection when you should be using `@Provides` with a qualifier or `SavedStateHandle`. If the "runtime" value is actually a navigation argument, it's available in `SavedStateHandle` and doesn't need assisted injection. Use assisted injection only for truly dynamic values that aren't known at graph creation time.

In Koin, the equivalent is Koin's parametersOf: `viewModel { params -> MyViewModel(params.get(), get()) }`. The parameter passing is runtime and untyped. In Metro, assisted injection works similarly to Dagger but with Kotlin-native improvements — `fun interface` for the factory, and the ability to use parameter names instead of `@Assisted` tags.

```kotlin
class PaymentProcessor @AssistedInject constructor(
    @Assisted val orderId: String,
    @Assisted val amount: Double,
    private val paymentGateway: PaymentGateway,
    private val analytics: Analytics,
) {
    suspend fun processPayment(): PaymentResult {
        analytics.track("payment_started", mapOf("amount" to amount))
        return paymentGateway.charge(orderId, amount)
    }

    @AssistedFactory
    interface Factory {
        fun create(orderId: String, amount: Double): PaymentProcessor
    }
}

// Usage — inject the factory, create instances with runtime values
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val paymentProcessorFactory: PaymentProcessor.Factory,
) : ViewModel() {

    fun checkout(orderId: String, amount: Double) {
        val processor = paymentProcessorFactory.create(orderId, amount)
        viewModelScope.launch {
            val result = processor.processPayment()
            _state.value = CheckoutState.Complete(result)
        }
    }
}
```

```kotlin
// What Hilt generates for @AssistedFactory (simplified)
// class PaymentProcessor_Factory_Impl implements PaymentProcessor.Factory {
//     private final Provider<PaymentGateway> gatewayProvider;
//     private final Provider<Analytics> analyticsProvider;
//
//     override fun create(orderId: String, amount: Double): PaymentProcessor {
//         return PaymentProcessor(
//             orderId,           // @Assisted — passed through
//             amount,            // @Assisted — passed through
//             gatewayProvider.get(),  // From graph
//             analyticsProvider.get(), // From graph
//         )
//     }
// }
```

```kotlin
// Disambiguating multiple @Assisted parameters of the same type
class NotificationSender @AssistedInject constructor(
    @Assisted("title") val title: String,
    @Assisted("body") val body: String,
    private val pushService: PushService,
) {
    @AssistedFactory
    interface Factory {
        fun create(
            @Assisted("title") title: String,
            @Assisted("body") body: String,
        ): NotificationSender
    }
}
```

```kotlin
// ❌ Anti-pattern: using assisted injection for navigation args
class DetailViewModel @AssistedInject constructor(
    @Assisted val itemId: String, // This is a navigation arg!
    private val repo: ItemRepository,
) : ViewModel()
// Don't do this — use SavedStateHandle instead

// ✅ SavedStateHandle for navigation args
@HiltViewModel
class DetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repo: ItemRepository,
) : ViewModel() {
    private val itemId: String = checkNotNull(savedStateHandle["itemId"])
}
```

```kotlin
// Real-world assisted injection: image processor with runtime config
class ImageProcessor @AssistedInject constructor(
    @Assisted val maxWidth: Int,
    @Assisted val maxHeight: Int,
    @Assisted val quality: Int,
    private val diskCache: DiskCache,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    suspend fun process(uri: Uri): Bitmap = withContext(ioDispatcher) {
        val cached = diskCache.get(uri.toString())
        if (cached != null) return@withContext cached

        val bitmap = decodeBitmap(uri, maxWidth, maxHeight, quality)
        diskCache.put(uri.toString(), bitmap)
        bitmap
    }

    @AssistedFactory
    interface Factory {
        fun create(maxWidth: Int, maxHeight: Int, quality: Int): ImageProcessor
    }
}
```

**Key takeaway:** Use `@AssistedInject` and `@AssistedFactory` when a class needs both graph-provided dependencies and runtime values. Hilt generates the factory implementation — you just inject the factory and call `create()` with the runtime parameters. Don't use assisted injection for values available in `SavedStateHandle`.

### Lesson 3.6: EntryPoints — Accessing Hilt from Non-Hilt Code

Not every class in your app is managed by Hilt. Content providers, third-party library callbacks, and legacy code may need access to Hilt-provided dependencies. `@EntryPoint` defines an interface that Hilt implements, giving non-Hilt code a way to access the dependency graph. It's the escape hatch when standard injection isn't possible.

Use entry points sparingly — they're an escape hatch, not a primary injection mechanism. If you find yourself creating many entry points, it's a sign that the code should be restructured to use standard injection. Entry points are most commonly needed for `ContentProvider` (initialized before `Application.onCreate()`), third-party library initialization callbacks, and custom `BroadcastReceiver` classes.

Under the hood, `@EntryPoint` tells Hilt to implement the interface on the generated component. When you call `EntryPointAccessors.fromApplication()`, it casts the component to your entry point interface and returns it. The dependencies are resolved from the same graph as everything else — entry points don't create a parallel DI system.

ContentProviders are the most common use case because they're initialized before `Application.onCreate()` runs. This means Hilt's component hierarchy isn't set up yet when the ContentProvider's `onCreate()` is called. You can work around this by accessing the entry point lazily (in `query()` or `insert()` instead of `onCreate()`), or by using `EntryPointAccessors.fromApplication()` which waits for the component to be available.

Entry points can be defined at different component levels. `@InstallIn(SingletonComponent::class)` gives you access to app-wide singletons. `@InstallIn(ActivityComponent::class)` gives you access to Activity-scoped dependencies, but you need an Activity context to access them via `EntryPointAccessors.fromActivity()`.

A common anti-pattern is using entry points to bypass Hilt's component hierarchy — accessing Activity-scoped dependencies from a place that should only have Singleton access. This defeats Hilt's scope safety. If you need Activity-scoped dependencies in non-Hilt code, pass them explicitly rather than using an entry point.

In Metro, the equivalent is declaring an accessor property on the graph interface. There's no special "entry point" concept — you just add a property to the graph and access it directly. In Koin, you access dependencies from anywhere using `KoinComponent` — which is essentially the service locator pattern, so there's no distinction between "normal" injection and "entry point" injection.

```kotlin
@EntryPoint
@InstallIn(SingletonComponent::class)
interface AnalyticsEntryPoint {
    fun analytics(): Analytics
}

// Usage in a ContentProvider (not managed by Hilt)
class SyncProvider : ContentProvider() {
    override fun onCreate(): Boolean {
        val entryPoint = EntryPointAccessors.fromApplication(
            context!!.applicationContext,
            AnalyticsEntryPoint::class.java
        )
        val analytics = entryPoint.analytics()
        analytics.track("sync_provider_created")
        return true
    }
}
```

```kotlin
// Entry point for a third-party library callback
@EntryPoint
@InstallIn(SingletonComponent::class)
interface CrashReporterEntryPoint {
    fun crashReporter(): CrashReporter
    fun userSession(): UserSession
}

class CustomCrashHandler : Thread.UncaughtExceptionHandler {
    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        val context = MyApp.instance.applicationContext
        val entryPoint = EntryPointAccessors.fromApplication(
            context,
            CrashReporterEntryPoint::class.java,
        )
        entryPoint.crashReporter().report(throwable)
    }
}
```

```kotlin
// ❌ Anti-pattern: too many entry points
@EntryPoint @InstallIn(SingletonComponent::class)
interface UserEntryPoint { fun userRepo(): UserRepository }
@EntryPoint @InstallIn(SingletonComponent::class)
interface OrderEntryPoint { fun orderRepo(): OrderRepository }
@EntryPoint @InstallIn(SingletonComponent::class)
interface AnalyticsEntryPoint { fun analytics(): Analytics }
// If you have this many, restructure to use standard injection!

// ✅ Consolidate if needed, but prefer standard injection
@EntryPoint
@InstallIn(SingletonComponent::class)
interface LegacyCodeEntryPoint {
    fun userRepo(): UserRepository
    fun analytics(): Analytics
}
```

```kotlin
// Activity-level entry point
@EntryPoint
@InstallIn(ActivityComponent::class)
interface ThemeEntryPoint {
    fun themeHelper(): ThemeHelper
}

// Access with Activity context
class CustomView(context: Context, attrs: AttributeSet) : View(context, attrs) {
    private val themeHelper by lazy {
        val activity = context as Activity
        val entryPoint = EntryPointAccessors.fromActivity(
            activity,
            ThemeEntryPoint::class.java,
        )
        entryPoint.themeHelper()
    }
}
```

**Key takeaway:** Use `@EntryPoint` to access Hilt dependencies from non-Hilt code like ContentProviders or third-party callbacks. It's an escape hatch — prefer standard injection for Hilt-managed components. Keep entry points minimal and consolidate them when possible.

### Quiz: Scoping, Qualifiers, and Components

#### What happens when you do NOT apply a scope annotation (like `@Singleton`) to a `@Provides` function?

- ❌ Hilt throws a compile-time error
- ❌ The dependency is automatically scoped to `SingletonComponent`
- ✅ A new instance is created every time the dependency is injected
- ❌ The dependency is scoped to `ActivityComponent` by default

> **Explanation:** Without a scope annotation, Hilt treats the binding as unscoped, meaning a fresh instance is created on every injection. This is fine for lightweight, stateless objects but wrong for things like databases or auth managers that should be shared.

#### Why are custom `@Qualifier` annotations preferred over `@Named`?

- ❌ `@Named` doesn't work with KSP
- ✅ Custom qualifiers are type-safe and catch typos at compile time, while `@Named` strings can have silent typos
- ❌ `@Named` adds runtime overhead
- ❌ Custom qualifiers generate faster code

> **Explanation:** A typo in `@Named("io_dispatcer")` compiles fine but gives you the wrong binding or a missing binding crash. A typo in a custom qualifier annotation like `@IoDispatcer` fails to compile immediately. Custom qualifiers are also self-documenting.

#### Which Hilt component survives configuration changes like screen rotation?

- ❌ ActivityComponent
- ✅ ActivityRetainedComponent
- ❌ FragmentComponent
- ❌ SingletonComponent

> **Explanation:** `ActivityRetainedComponent` is tied to the `ViewModel` lifecycle internally and survives configuration changes. `ActivityComponent` is destroyed and recreated on rotation. `SingletonComponent` also survives but has application-wide scope, which is broader than needed.

### Coding Challenge: Scoped Qualifiers for API Configuration

Create qualified bindings for production and staging base URLs, plus an `@IoDispatcher` qualified dispatcher. Inject them into a `ConfigurableApiClient` class.

#### Solution

```kotlin
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ProductionUrl

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class StagingUrl

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Module
@InstallIn(SingletonComponent::class)
object ConfigModule {

    @Provides
    @ProductionUrl
    fun provideProductionUrl(): String = "https://api.myapp.com/"

    @Provides
    @StagingUrl
    fun provideStagingUrl(): String = "https://staging-api.myapp.com/"

    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO
}

class ConfigurableApiClient @Inject constructor(
    @ProductionUrl private val productionUrl: String,
    @StagingUrl private val stagingUrl: String,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    fun getBaseUrl(isDebug: Boolean): String =
        if (isDebug) stagingUrl else productionUrl

    suspend fun <T> execute(block: suspend () -> T): T =
        withContext(ioDispatcher) { block() }
}
```

Without qualifiers, Hilt would see two `String` bindings and a `CoroutineDispatcher` binding without knowing which is which. Qualifiers disambiguate at the injection site, and typos are caught at compile time.

---

## Module 4: Hilt with Jetpack Libraries

### Lesson 4.1: Hilt + ViewModel

`@HiltViewModel` is the bridge between Hilt's dependency graph and Android's ViewModel. When you annotate a ViewModel with `@HiltViewModel` and give it an `@Inject constructor`, Hilt generates a `ViewModelProvider.Factory` that knows how to create the ViewModel with all its dependencies resolved. You never write a factory manually. This single annotation eliminates one of the most tedious patterns in pre-Hilt Android development.

In Compose, `hiltViewModel()` retrieves or creates the ViewModel from the current `ViewModelStoreOwner` (usually the NavBackStackEntry or Activity). It handles scoping automatically — the ViewModel is created once and survives recompositions and configuration changes. The first call to `hiltViewModel()` creates the ViewModel; subsequent calls return the same instance.

`SavedStateHandle` is one of the most useful auto-injected dependencies. Hilt provides it automatically in `@HiltViewModel` constructors, and it's pre-populated with navigation arguments. You can use `getStateFlow()` to create reactive flows that persist across process death. This means your search query, scroll position, or selected filter survives even if Android kills your process in the background.

Under the hood, Hilt generates a `ViewModelFactory` for each `@HiltViewModel`. This factory implements `AbstractSavedStateViewModelFactory` (or `ViewModelProvider.Factory` depending on the Hilt version) and calls the ViewModel's constructor with resolved dependencies. The factory is registered through Hilt's `ViewModelComponent`, which is a child of `ActivityRetainedComponent`. This hierarchy is why ViewModels survive configuration changes.

When Dagger processes `@HiltViewModel`, it generates two things: a `_HiltModules` class that installs the ViewModel's factory into the `ViewModelComponent`, and the factory itself that creates the ViewModel. The `_HiltModules` class uses multibinding to register the factory — this is how Hilt knows about all ViewModels without requiring a central registry.

A common mistake is forgetting `@Inject constructor` on the ViewModel. `@HiltViewModel` without `@Inject constructor` won't work — Hilt needs the `@Inject` annotation to know which constructor to use and which parameters to resolve. Another common mistake is trying to inject `Activity` or `@ActivityContext` into a `@HiltViewModel` — ViewModels outlive Activities, so this would cause a memory leak. Hilt prevents this at compile time.

In Koin, ViewModel injection uses `viewModel { MyViewModel(get()) }` in the module definition and `val viewModel: MyViewModel by viewModel()` at the injection site. The dependency resolution is runtime, so a missing binding crashes at runtime. In Metro, ViewModel integration is still evolving — you'd typically use a factory pattern similar to pre-Hilt Dagger. Hilt's ViewModel integration is one of its strongest advantages.

For Compose specifically, the `hiltViewModel()` function from `androidx.hilt:hilt-navigation-compose` is the standard entry point. It creates the ViewModel scoped to the nearest `NavBackStackEntry`. For ViewModels that need to be shared across destinations, you scope to a parent navigation graph's back stack entry.

```kotlin
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchRepo: SearchRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    // Restore query from process death
    private val query = savedStateHandle.getStateFlow("query", "")

    val results = query
        .debounce(300)
        .filter { it.isNotBlank() }
        .flatMapLatest { searchRepo.search(it) }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    fun updateQuery(newQuery: String) {
        savedStateHandle["query"] = newQuery
    }
}

// In Compose — hiltViewModel() handles creation and scoping
@Composable
fun SearchScreen(viewModel: SearchViewModel = hiltViewModel()) {
    val results by viewModel.results.collectAsStateWithLifecycle()
    // ...
}
```

```kotlin
// What Hilt generates for @HiltViewModel (simplified)
// 1. SearchViewModel_HiltModules — installs the factory
@Module
@InstallIn(ViewModelComponent::class)
object SearchViewModel_HiltModules {
    @Provides
    @IntoMap
    @StringKey("com.app.SearchViewModel")
    fun provide(
        searchRepoProvider: Provider<SearchRepository>,
        savedStateHandleProvider: Provider<SavedStateHandle>,
    ): ViewModel {
        return SearchViewModel(
            searchRepoProvider.get(),
            savedStateHandleProvider.get(),
        )
    }
}

// 2. Hilt's ViewModelFactory uses the multibinding map to create any ViewModel
// When hiltViewModel<SearchViewModel>() is called:
//   → ViewModelFactory looks up "com.app.SearchViewModel" in the map
//   → Calls the @Provides function above
//   → Returns the created ViewModel
```

```kotlin
// ❌ Common mistakes with @HiltViewModel

// Missing @Inject constructor
@HiltViewModel
class BrokenViewModel(  // No @Inject! Hilt can't create this
    private val repo: UserRepository,
) : ViewModel()

// Injecting Activity context into ViewModel
@HiltViewModel
class LeakyViewModel @Inject constructor(
    @ActivityContext private val context: Context, // COMPILE ERROR!
    // ViewModels outlive Activities — this would cause memory leaks
) : ViewModel()

// ✅ Use @ApplicationContext if you need Context
@HiltViewModel
class SafeViewModel @Inject constructor(
    @ApplicationContext private val context: Context, // Safe!
) : ViewModel()
```

```kotlin
// SavedStateHandle with navigation arguments
// Navigation route: "profile/{userId}?tab={selectedTab}"
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    // Navigation args are automatically in SavedStateHandle
    private val userId: String = checkNotNull(savedStateHandle["userId"])
    private val selectedTab: String = savedStateHandle["selectedTab"] ?: "posts"

    // Reactive state that survives process death
    val tabState = savedStateHandle.getStateFlow("selectedTab", selectedTab)

    fun selectTab(tab: String) {
        savedStateHandle["selectedTab"] = tab
    }
}
```

```kotlin
// Multiple ViewModels in one screen
@Composable
fun DashboardScreen(
    statsViewModel: StatsViewModel = hiltViewModel(),
    feedViewModel: FeedViewModel = hiltViewModel(),
    notificationsViewModel: NotificationsViewModel = hiltViewModel(),
) {
    // Each ViewModel is independently scoped to the same NavBackStackEntry
    // Each gets its own SavedStateHandle, repositories, etc.
}
```

**Key takeaway:** `@HiltViewModel` + `hiltViewModel()` eliminates manual ViewModel factories. `SavedStateHandle` is auto-injected and pre-populated with navigation arguments. Use `getStateFlow()` for reactive persistence across process death. Never inject `@ActivityContext` into a ViewModel.

### Lesson 4.2: Hilt + Navigation Compose

Navigation Compose works naturally with Hilt. Each `composable()` destination gets its own ViewModel instance scoped to its `NavBackStackEntry`. This means navigating to the same destination twice creates two separate ViewModels with independent state — navigating to Profile for user A and then user B gives you two distinct `ProfileViewModel` instances.

For sharing state across destinations (like a checkout flow), you can scope a ViewModel to a parent navigation graph. Use `hiltViewModel()` with a `ViewModelStoreOwner` parameter pointing to the parent graph's back stack entry. This pattern is essential for multi-step flows where several screens need to read and write shared state.

Navigation arguments are automatically available in `SavedStateHandle`. When you define a route like `"profile/{userId}"`, the `userId` value is automatically placed in the `SavedStateHandle` of the ViewModel created for that destination. You don't need to parse arguments manually — just read them from `SavedStateHandle` in the ViewModel's constructor.

The scoping model in Navigation Compose with Hilt is powerful but has subtle implications. When a destination is popped from the back stack, its ViewModel is cleared, and all dependencies scoped to `ViewModelComponent` are destroyed. When a destination is on the back stack but not visible, its ViewModel stays alive. This means expensive resources in ViewModelScoped dependencies stay in memory for as long as the destination is on the back stack.

Type-safe navigation with Hilt works through serializable route classes. Instead of `"profile/{userId}"`, you define a `data class ProfileRoute(val userId: String)` and use it with type-safe navigation APIs. The route class properties are automatically available in `SavedStateHandle`. This provides compile-time safety for navigation arguments.

One common pitfall is trying to share a ViewModel between destinations by scoping to the Activity. This works but over-scopes the ViewModel — it lives as long as the Activity, not as long as the flow. The better approach is to scope to a nested navigation graph that represents the flow. The ViewModel is created when the flow starts and destroyed when the user navigates out of the flow.

In Koin, Navigation Compose integration requires `koinViewModel()` and manual passing of navigation arguments. There's no automatic `SavedStateHandle` population. In Metro, Navigation Compose integration is not built-in — you'd need to implement custom ViewModel factories. Hilt's deep integration with Navigation Compose is a significant productivity advantage.

```kotlin
@Composable
fun AppNavGraph(navController: NavHostController) {
    NavHost(navController, startDestination = "home") {
        composable("home") {
            val viewModel: HomeViewModel = hiltViewModel()
            HomeScreen(viewModel)
        }
        composable("profile/{userId}") { backStackEntry ->
            // Navigation args are in SavedStateHandle automatically
            val viewModel: ProfileViewModel = hiltViewModel()
            ProfileScreen(viewModel)
        }

        // Nested graph for checkout flow — shared ViewModel
        navigation(startDestination = "cart", route = "checkout_flow") {
            composable("cart") { entry ->
                val parentEntry = remember(entry) {
                    navController.getBackStackEntry("checkout_flow")
                }
                val viewModel: CheckoutViewModel = hiltViewModel(parentEntry)
                CartScreen(viewModel)
            }
            composable("payment") { entry ->
                val parentEntry = remember(entry) {
                    navController.getBackStackEntry("checkout_flow")
                }
                val viewModel: CheckoutViewModel = hiltViewModel(parentEntry)
                PaymentScreen(viewModel)
            }
        }
    }
}

// The ViewModel automatically receives the "userId" navigation arg
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val userId: String = checkNotNull(savedStateHandle["userId"])

    val profile = userRepo.observeUser(userId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
}
```

```kotlin
// Shared ViewModel for multi-step checkout flow
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val cartRepo: CartRepository,
    private val paymentRepo: PaymentRepository,
    private val addressRepo: AddressRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val _items = MutableStateFlow<List<CartItem>>(emptyList())
    val items = _items.asStateFlow()

    private val _selectedAddress = MutableStateFlow<Address?>(null)
    val selectedAddress = _selectedAddress.asStateFlow()

    private val _paymentMethod = MutableStateFlow<PaymentMethod?>(null)
    val paymentMethod = _paymentMethod.asStateFlow()

    fun selectAddress(address: Address) {
        _selectedAddress.value = address
    }

    fun selectPayment(method: PaymentMethod) {
        _paymentMethod.value = method
    }

    suspend fun placeOrder(): OrderResult {
        return paymentRepo.processPayment(
            items = _items.value,
            address = _selectedAddress.value!!,
            payment = _paymentMethod.value!!,
        )
    }
}

// Cart screen and Payment screen both get the SAME CheckoutViewModel
// because they're scoped to the "checkout_flow" navigation graph
```

```kotlin
// Type-safe navigation with Hilt
@Serializable
data class ProfileRoute(val userId: String)

@Serializable
data class ProductRoute(val productId: Long, val source: String = "browse")

@Composable
fun TypeSafeNavGraph(navController: NavHostController) {
    NavHost(navController, startDestination = HomeRoute) {
        composable<HomeRoute> {
            HomeScreen(hiltViewModel())
        }
        composable<ProfileRoute> {
            // ProfileRoute.userId is automatically in SavedStateHandle
            ProfileScreen(hiltViewModel())
        }
        composable<ProductRoute> {
            // productId and source both available in SavedStateHandle
            ProductScreen(hiltViewModel())
        }
    }
}
```

```kotlin
// ❌ Over-scoping: sharing ViewModel via Activity scope
@Composable
fun CartScreen() {
    val viewModel: CheckoutViewModel = hiltViewModel(
        viewModelStoreOwner = LocalContext.current as ComponentActivity
    ) // Lives as long as the Activity — not the checkout flow!
}

// ✅ Correctly scoped: sharing via nested navigation graph
@Composable
fun CartScreen(navController: NavHostController) {
    val parentEntry = remember {
        navController.getBackStackEntry("checkout_flow")
    }
    val viewModel: CheckoutViewModel = hiltViewModel(parentEntry)
    // Lives only as long as the checkout flow is on the back stack
}
```

**Key takeaway:** Each Navigation destination gets its own ViewModel by default. For shared state across a flow, scope ViewModels to a parent navigation graph. Navigation arguments are automatically available in `SavedStateHandle`. Use type-safe navigation routes for compile-time safety.

### Lesson 4.3: Hilt + WorkManager

WorkManager workers have a unique challenge: `Context` and `WorkerParameters` are provided at runtime by the system, not by Hilt. This is where `@AssistedInject` comes in — it lets you mix system-provided parameters with Hilt-injected dependencies. Without Hilt integration, you'd have to manually access dependencies through the Application class or a service locator.

`@HiltWorker` is a convenience annotation that sets up the assisted injection wiring. You also need to configure a custom `WorkerFactory` in your Application class. With Hilt's `HiltWorkerFactory`, this is done by implementing `Configuration.Provider`. The factory knows how to create workers with both assisted and injected parameters.

Under the hood, `@HiltWorker` generates a factory that implements `WorkerAssistedFactory`. Hilt's `HiltWorkerFactory` maintains a map of worker class names to their factories (using multibinding, similar to ViewModel factories). When WorkManager creates a worker, `HiltWorkerFactory` looks up the factory, calls `create()` with the system-provided `Context` and `WorkerParameters`, and the factory resolves the remaining dependencies from the graph.

A common mistake is forgetting to implement `Configuration.Provider` in the Application class. Without it, WorkManager uses the default `WorkerFactory`, which doesn't know about Hilt. Your `@HiltWorker` classes will crash with "Could not instantiate worker" errors. Another common mistake is not disabling the default initializer in the manifest — WorkManager auto-initializes, and if it initializes before Hilt, the custom factory isn't set up yet.

The worker lifecycle is different from Activities and ViewModels. Workers can run when the app isn't in the foreground, can be rescheduled after failures, and can run on any process. This means workers shouldn't depend on Activity-scoped or ViewModel-scoped bindings — only Singleton-scoped dependencies are safe.

Testing workers with Hilt requires special setup. You can't use `@HiltAndroidTest` directly because workers run in a different lifecycle. Instead, use `TestWorkerBuilder` from `androidx.work:work-testing` and manually provide dependencies. For integration tests, set up a test `WorkerFactory` that creates workers with fake dependencies.

```kotlin
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val syncRepo: SyncRepository,
    private val notifier: SyncNotifier,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val changes = syncRepo.syncAll()
            if (changes > 0) {
                notifier.notifySyncComplete(changes)
            }
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry()
            else Result.failure()
        }
    }
}

// Application setup for Hilt WorkManager integration
@HiltAndroidApp
class MyApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
```

```kotlin
// Disable default WorkManager initialization in AndroidManifest.xml
// <provider
//     android:name="androidx.startup.InitializationProvider"
//     android:authorities="${applicationId}.androidx-startup"
//     tools:node="merge">
//     <meta-data
//         android:name="androidx.work.WorkManagerInitializer"
//         android:value="androidx.startup"
//         tools:node="remove" />
// </provider>
```

```kotlin
// Worker with multiple injected dependencies
@HiltWorker
class DataExportWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val userRepo: UserRepository,
    private val orderRepo: OrderRepository,
    private val fileExporter: FileExporter,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(ioDispatcher) {
        val userId = inputData.getString("userId") ?: return@withContext Result.failure()
        val user = userRepo.getUser(userId) ?: return@withContext Result.failure()
        val orders = orderRepo.getOrdersForUser(userId)
        fileExporter.exportToCSV(user, orders)
        Result.success()
    }
}
```

```kotlin
// Unit testing a HiltWorker (without Hilt — pure constructor injection)
class SyncWorkerTest {
    @Test
    fun `sync succeeds when repository syncs`() = runTest {
        val fakeRepo = FakeSyncRepository(changesToReturn = 5)
        val fakeNotifier = FakeSyncNotifier()

        val worker = TestWorkerBuilder<SyncWorker>(
            context = ApplicationProvider.getApplicationContext(),
        ).build()
        // Note: For pure unit test, use constructor directly
        val result = SyncWorker(
            context = ApplicationProvider.getApplicationContext(),
            params = WorkerParameters(/* ... */),
            syncRepo = fakeRepo,
            notifier = fakeNotifier,
        ).doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertTrue(fakeNotifier.wasNotified)
    }
}
```

**Key takeaway:** Use `@HiltWorker` with `@AssistedInject` for WorkManager workers. `Context` and `WorkerParameters` are `@Assisted` (system-provided), while other dependencies come from Hilt. Configure `HiltWorkerFactory` in your Application class and disable the default WorkManager initializer.

### Lesson 4.4: Hilt + Compose Side Effects and Lifecycle

Hilt dependencies can be injected into ViewModel, but sometimes you need dependencies in Composable functions that aren't ViewModel-scoped. Hilt doesn't directly inject into Composables, but you can access dependencies through ViewModels or `LocalContext`. Understanding the boundary between Hilt's DI world and Compose's declarative world is important for clean architecture.

For Compose-specific patterns, consider providing dependencies through `CompositionLocal`. This is particularly useful for things like analytics trackers, theme providers, or navigation helpers that many Composables need access to. `CompositionLocal` acts as implicit dependency injection within the Compose tree — it's the Compose-native way of making shared dependencies available without threading them through every parameter.

The distinction between `staticCompositionLocalOf` and `compositionLocalOf` matters for DI. `staticCompositionLocalOf` is for values that rarely or never change — like an injected `Analytics` instance. When the value changes, the entire tree recomposes. `compositionLocalOf` is for values that change more frequently — when the value changes, only composables that read it recompose. For DI-provided dependencies that are initialized once, `staticCompositionLocalOf` is the right choice.

A common question is whether to use `CompositionLocal` or ViewModel for providing dependencies to deep Composable trees. The answer depends on the dependency's scope. If it's app-wide (analytics, theme, navigation), `CompositionLocal` is appropriate. If it's screen-specific (repository, use case), put it in the ViewModel. Don't use `CompositionLocal` for screen-specific data — it makes testing harder and creates implicit dependencies.

Side effects in Compose (`LaunchedEffect`, `DisposableEffect`) often need access to dependencies. The pattern is to access them through the ViewModel and call ViewModel methods from effects. Don't inject dependencies directly into Composables via `CompositionLocal` just to use them in effects — pass them through the ViewModel instead.

In terms of lifecycle, Hilt-injected ViewModels follow the standard ViewModel lifecycle within Compose. `hiltViewModel()` creates the ViewModel when the composition enters the tree and clears it when the `ViewModelStoreOwner` is destroyed. `LaunchedEffect` and `DisposableEffect` within the composable function follow the composition lifecycle, not the ViewModel lifecycle.

```kotlin
// Provide dependencies via CompositionLocal
val LocalAnalytics = staticCompositionLocalOf<Analytics> {
    error("No Analytics provided")
}

@Composable
fun AppContent(analytics: Analytics) {
    CompositionLocalProvider(LocalAnalytics provides analytics) {
        AppNavGraph()
    }
}

// Access in any child Composable without passing through parameters
@Composable
fun ProductCard(product: Product) {
    val analytics = LocalAnalytics.current

    Card(
        modifier = Modifier.clickable {
            analytics.track("product_clicked", mapOf("id" to product.id))
        }
    ) {
        // Product UI
    }
}

// Wire it up in Activity
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var analytics: Analytics

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppContent(analytics)
        }
    }
}
```

```kotlin
// ❌ Anti-pattern: CompositionLocal for screen-specific data
val LocalUserRepository = staticCompositionLocalOf<UserRepository> {
    error("No UserRepository provided")
}

@Composable
fun ProfileScreen() {
    val repo = LocalUserRepository.current // Implicit dependency!
    // Hard to test — must wrap with CompositionLocalProvider
}

// ✅ Better: use ViewModel for screen-specific dependencies
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository, // Explicit, testable
) : ViewModel()

@Composable
fun ProfileScreen(viewModel: ProfileViewModel = hiltViewModel()) {
    // Dependencies accessed through ViewModel — clean and testable
}
```

```kotlin
// Side effects with ViewModel dependencies
@HiltViewModel
class LocationViewModel @Inject constructor(
    private val locationTracker: LocationTracker,
    private val analytics: Analytics,
) : ViewModel() {

    val location = locationTracker.locationFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    fun startTracking() {
        viewModelScope.launch {
            locationTracker.startTracking()
            analytics.track("location_tracking_started")
        }
    }

    fun stopTracking() {
        locationTracker.stopTracking()
    }
}

@Composable
fun MapScreen(viewModel: LocationViewModel = hiltViewModel()) {
    val location by viewModel.location.collectAsStateWithLifecycle()

    // Start/stop tracking with composition lifecycle
    DisposableEffect(Unit) {
        viewModel.startTracking()
        onDispose {
            viewModel.stopTracking()
        }
    }
}
```

```kotlin
// Multiple CompositionLocals for app-wide dependencies
val LocalAnalytics = staticCompositionLocalOf<Analytics> {
    error("Analytics not provided")
}

val LocalFeatureFlags = staticCompositionLocalOf<FeatureFlags> {
    error("FeatureFlags not provided")
}

val LocalAppNavigator = staticCompositionLocalOf<AppNavigator> {
    error("AppNavigator not provided")
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var analytics: Analytics
    @Inject lateinit var featureFlags: FeatureFlags
    @Inject lateinit var navigator: AppNavigator

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CompositionLocalProvider(
                LocalAnalytics provides analytics,
                LocalFeatureFlags provides featureFlags,
                LocalAppNavigator provides navigator,
            ) {
                AppTheme { AppNavGraph() }
            }
        }
    }
}
```

**Key takeaway:** Hilt doesn't inject directly into Composables. Access dependencies through `@HiltViewModel` or bridge them via `CompositionLocal`. Use `staticCompositionLocalOf` for app-wide dependencies that rarely change (analytics, navigation). Keep screen-specific dependencies in ViewModels, not CompositionLocals.

### Lesson 4.5: Hilt + Shared ViewModels Across Fragments

In Fragment-based apps, sharing a ViewModel between fragments requires scoping to the Activity. Hilt handles this through `@AndroidEntryPoint` on both the Activity and Fragments, combined with `activityViewModels()` for the shared scope. This pattern is common for master-detail layouts, stepper flows, or any case where two Fragments need access to the same state.

The ViewModel lives as long as the Activity, so it persists across Fragment transactions. When Fragment A adds an item and Fragment B displays the list, both see the same state because they share the same ViewModel instance. The ViewModel is only cleared when the Activity is finished (not on configuration changes).

The key delegate function difference is `viewModels()` versus `activityViewModels()`. `viewModels()` scopes the ViewModel to the Fragment — each Fragment gets its own instance. `activityViewModels()` scopes to the Activity — all Fragments in the Activity share one instance. Both work with Hilt — the Hilt-generated factory is used regardless of the scoping mechanism.

In Navigation Component (Fragment-based), you can also scope ViewModels to a navigation graph, similar to Navigation Compose. Use `navGraphViewModels(R.id.checkout_graph)` to scope a ViewModel to a specific navigation graph. This is more precise than Activity scoping — the ViewModel is cleared when the graph is popped from the back stack.

A common mistake is using `activityViewModels()` for state that should only be shared within a specific flow. If you have a checkout flow and a settings flow, and both use `activityViewModels()` for their shared ViewModels, the ViewModels live for the entire Activity — even when the user isn't in that flow. Use `navGraphViewModels()` for flow-scoped sharing.

Testing shared ViewModels is straightforward with Hilt. Use `@HiltAndroidTest` with `launchFragmentInHiltContainer` for individual Fragment tests. For shared ViewModel tests, launch the Activity and test the interaction between Fragments through the shared ViewModel state.

```kotlin
@HiltViewModel
class SharedOrderViewModel @Inject constructor(
    private val orderRepo: OrderRepository,
    private val inventoryChecker: InventoryChecker,
) : ViewModel() {

    private val _selectedItems = MutableStateFlow<List<OrderItem>>(emptyList())
    val selectedItems: StateFlow<List<OrderItem>> = _selectedItems.asStateFlow()

    fun addItem(item: OrderItem) {
        _selectedItems.update { it + item }
    }

    suspend fun validateOrder(): Boolean {
        return inventoryChecker.checkAvailability(_selectedItems.value)
    }
}

// Both fragments share the same ViewModel instance
@AndroidEntryPoint
class ItemListFragment : Fragment() {
    private val sharedViewModel: SharedOrderViewModel by activityViewModels()

    // Uses sharedViewModel to add items
}

@AndroidEntryPoint
class OrderSummaryFragment : Fragment() {
    private val sharedViewModel: SharedOrderViewModel by activityViewModels()

    // Uses sharedViewModel to display and validate selected items
}
```

```kotlin
// Navigation graph scoped ViewModel (more precise than Activity scope)
@AndroidEntryPoint
class CartFragment : Fragment() {
    // Scoped to the checkout navigation graph, not the entire Activity
    private val checkoutViewModel: CheckoutViewModel by navGraphViewModels(R.id.checkout_graph)
}

@AndroidEntryPoint
class PaymentFragment : Fragment() {
    // Same instance as CartFragment's checkoutViewModel
    private val checkoutViewModel: CheckoutViewModel by navGraphViewModels(R.id.checkout_graph)
}
```

```kotlin
// ❌ Over-scoping with activityViewModels
@AndroidEntryPoint
class SettingsFragment : Fragment() {
    // This ViewModel lives for the entire Activity!
    // Even when the user leaves settings, it stays in memory
    private val settingsViewModel: SettingsViewModel by activityViewModels()
}

// ✅ Correct scoping with viewModels (Fragment-scoped)
@AndroidEntryPoint
class SettingsFragment : Fragment() {
    // Scoped to this Fragment only — cleared when Fragment is destroyed
    private val settingsViewModel: SettingsViewModel by viewModels()
}
```

```kotlin
// Comparison: viewModels() vs activityViewModels() vs navGraphViewModels()

// viewModels() — Fragment-scoped
// Each Fragment instance gets its own ViewModel
// ViewModel cleared when Fragment is destroyed

// activityViewModels() — Activity-scoped
// All Fragments in the Activity share one instance
// ViewModel cleared when Activity is finished

// navGraphViewModels(R.id.graph) — Navigation graph-scoped
// All Fragments in the nav graph share one instance
// ViewModel cleared when the nav graph is popped from back stack
// Most precise scoping for multi-step flows
```

**Key takeaway:** Use `activityViewModels()` in Fragments to share a Hilt ViewModel across Fragments within the same Activity. Prefer `navGraphViewModels()` for flow-scoped sharing — it's more precise. Use plain `viewModels()` for Fragment-specific ViewModels. The ViewModel lives as long as its scope owner.

### Quiz: Hilt with Jetpack Libraries

#### What does `SavedStateHandle` give you inside a `@HiltViewModel`?

- ❌ Access to the Hilt dependency graph
- ❌ A handle to the Activity's saved instance state bundle
- ✅ A key-value store that survives process death and is auto-populated with navigation arguments
- ❌ A reference to the Navigation back stack

> **Explanation:** `SavedStateHandle` persists data across process death and is automatically populated with navigation arguments. Hilt injects it automatically into `@HiltViewModel` constructors — no extra setup required.

#### Why does `@HiltWorker` use `@AssistedInject` instead of regular `@Inject`?

- ❌ WorkManager runs on a background thread
- ✅ `Context` and `WorkerParameters` are provided at runtime by WorkManager, not by Hilt
- ❌ Workers are singletons and need special construction
- ❌ `@AssistedInject` is faster than `@Inject`

> **Explanation:** WorkManager provides `Context` and `WorkerParameters` at runtime when it creates the worker. These can't come from Hilt's graph, so `@AssistedInject` marks them as "assisted" parameters supplied externally, while Hilt injects the remaining dependencies normally.

#### How do you share a ViewModel between two Navigation Compose destinations?

- ❌ Use `@Singleton` on the ViewModel
- ❌ Store the ViewModel in a global variable
- ✅ Scope the ViewModel to a parent navigation graph using `hiltViewModel(parentBackStackEntry)`
- ❌ Use `@SharedViewModel` annotation

> **Explanation:** By passing the parent navigation graph's back stack entry to `hiltViewModel()`, both destinations get the same ViewModel instance. The ViewModel lives as long as the parent graph is in the back stack.

### Coding Challenge: HiltViewModel with SavedStateHandle

Create a `NotesViewModel` that uses `SavedStateHandle` to persist a search query across process death and exposes a filtered list of notes as a `StateFlow`.

#### Solution

```kotlin
@HiltViewModel
class NotesViewModel @Inject constructor(
    private val notesRepository: NotesRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val searchQuery = savedStateHandle.getStateFlow("search_query", "")

    val filteredNotes: StateFlow<List<Note>> = searchQuery
        .flatMapLatest { query ->
            notesRepository.getAllNotes().map { notes ->
                if (query.isBlank()) notes
                else notes.filter { it.title.contains(query, ignoreCase = true) }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun updateSearch(query: String) {
        savedStateHandle["search_query"] = query
    }
}

// In Compose
@Composable
fun NotesScreen(viewModel: NotesViewModel = hiltViewModel()) {
    val notes by viewModel.filteredNotes.collectAsStateWithLifecycle()
    // Render notes list
}
```

`savedStateHandle.getStateFlow()` creates a reactive flow that both persists across process death and triggers recomposition when the query changes. The `"search_query"` key is automatically saved and restored by the framework.

---

## Module 5: Multi-Module DI Architecture

### Lesson 5.1: Module Boundaries and Dependency Flow

In a multi-module Android project, DI organization follows the module dependency graph. Each Gradle module provides what it owns and depends on what it needs. The key insight is that Hilt resolves dependencies across Gradle modules automatically — as long as every module is in the dependency graph of the `:app` module. You don't need to manually register modules or pass references between them.

The standard structure separates concerns into layers. `:core:domain` holds interfaces and use cases — it has no DI framework dependency. `:core:data` implements those interfaces and provides Hilt bindings. Feature modules depend on `:core:domain` for abstractions and never see `:core:data` directly. This follows the Dependency Inversion Principle at the module level — high-level feature modules depend on abstractions, not low-level data implementations.

The `:app` module acts as the aggregation point. It depends on all feature modules and all core modules, so Hilt can discover every `@Module` and merge them into the final component at compile time. Feature modules never depend on each other — they communicate through shared abstractions in `:core:domain` or through navigation interfaces in `:feature:X:api` modules.

In a well-structured multi-module project, changing the implementation of a repository in `:core:data` doesn't trigger recompilation of any feature module. Only `:core:data` and `:app` recompile. This is because feature modules depend on `:core:domain` (interfaces), not `:core:data` (implementations). This build isolation is one of the key benefits of modularization combined with DIP.

The dependency flow should always be unidirectional: `:app` → `:feature:*` → `:core:domain`. Data flows backward through interfaces: `:core:data` implements interfaces from `:core:domain`, and Hilt wires the implementations to the interfaces at compile time in the `:app` module. No module should depend on a sibling module at the same level — features don't depend on other features, and core modules minimize inter-dependencies.

In Metro, the multi-module story is even better because `@ContributesBinding` eliminates the need for centralized binding modules. Each implementation module declares its own bindings, and Metro aggregates them automatically. This is closer to Anvil's model, which was specifically designed for multi-module DI at scale.

In Koin, multi-module DI works through module composition — you pass all Koin modules to `startKoin { modules(...) }` in the Application class. The modules must be explicitly listed, unlike Hilt where discovery is automatic. This manual registration means adding a new module requires updating the Application class.

```
:app              → @AndroidEntryPoint, assembles all modules
:feature:home     → HomeViewModel, HomeScreen
:feature:profile  → ProfileViewModel, ProfileScreen
:feature:checkout → CheckoutViewModel, CheckoutScreen
:core:network     → NetworkModule, API interfaces
:core:database    → DatabaseModule, DAOs
:core:domain      → Use cases, repository interfaces
:core:data        → Repository implementations, Hilt @Binds modules
:core:common      → Shared utilities, qualifiers
```

```kotlin
// Dependency flow in build.gradle.kts files

// :app/build.gradle.kts
dependencies {
    implementation(project(":feature:home"))
    implementation(project(":feature:profile"))
    implementation(project(":feature:checkout"))
    implementation(project(":core:data"))     // Hilt discovers modules here
    implementation(project(":core:network"))  // And here
    implementation(project(":core:database")) // And here
}

// :feature:home/build.gradle.kts
dependencies {
    implementation(project(":core:domain"))  // Interfaces only
    implementation(project(":core:common"))  // Qualifiers, utilities
    // Does NOT depend on :core:data, :core:network, or :core:database
}

// :core:data/build.gradle.kts
dependencies {
    implementation(project(":core:domain"))   // For interfaces to implement
    implementation(project(":core:network"))  // For API types
    implementation(project(":core:database")) // For DAO types
}
```

```kotlin
// Build isolation in action:
// Change UserRepositoryImpl in :core:data
// → Recompiles: :core:data, :app (Hilt re-merges the graph)
// → Does NOT recompile: :feature:home, :feature:profile, :core:domain
// Because features depend on UserRepository (interface), not UserRepositoryImpl

// Without DIP (bad structure):
// :feature:home depends on :core:data
// Change UserRepositoryImpl → Recompiles everything including all features
// No build isolation benefit
```

```kotlin
// ❌ Bad: circular dependency between modules
// :feature:home depends on :feature:profile (for ProfileNavigator)
// :feature:profile depends on :feature:home (for HomeNavigator)
// → Gradle circular dependency error!

// ✅ Fixed: communication through :core:domain or :feature:X:api
// :feature:home depends on :core:domain (ProfileNavigator interface lives here)
// :feature:profile depends on :core:domain (HomeNavigator interface lives here)
// Both interfaces implemented in their respective :impl modules
// No circular dependencies
```

**Key takeaway:** Each Gradle module provides what it owns. Feature modules depend on `:core:domain` (abstractions), not `:core:data` (implementations). The `:app` module aggregates everything, and Hilt merges all bindings at compile time. This structure enables build isolation and prevents tight coupling.

### Lesson 5.2: Providing Dependencies Across Modules

The pattern for cross-module DI is straightforward. Core modules define `@Module`-annotated classes with their bindings. Feature modules consume those bindings through `@Inject` constructors. No explicit registration or wiring is needed in the `:app` module — Hilt's compile-time code generation discovers everything automatically.

The key rule: a `@Module` class must be in a Gradle module that can see all the types it references. A `NetworkModule` in `:core:network` can provide `Retrofit` and `OkHttpClient`. A `DataModule` in `:core:data` can bind `UserRepositoryImpl` to `UserRepository` because it depends on both `:core:domain` (for the interface) and `:core:network` (for the API types).

Hilt's automatic discovery works through annotation processing at compile time. When KSP processes the `:app` module, it sees all `@Module`-annotated classes from all transitive dependencies. It merges them into the generated component and validates that the complete graph is resolvable. If a binding in `:feature:checkout` needs a `PaymentGateway` that's provided in `:core:payments`, Hilt finds the connection automatically.

A common mistake is trying to use `api` dependencies instead of `implementation` for Hilt module discovery. Hilt doesn't need `api` — it discovers modules through KSP processing, not through compile-time classpath visibility. Use `implementation` for everything to keep your module's API surface minimal.

When a feature module needs a dependency that doesn't exist in its direct dependencies, Hilt resolves it transitively through the `:app` module's merged component. The feature module doesn't need to know where the dependency comes from — it just declares what it needs via `@Inject constructor`, and Hilt handles the rest.

For large projects (100+ modules), the compile-time graph resolution in `:app` can become slow because Hilt must process every `@Module` from every dependency. This is where Metro's approach shines — its compiler plugin aggregation is significantly faster than KSP-based processing. Cash App's 1,500-module project saw 59% faster incremental builds after migrating from Dagger to Metro.

```kotlin
// :core:network — provides Retrofit, OkHttp
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
    ): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(HttpLoggingInterceptor())
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl("https://api.yourapp.com/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
}

// :core:data — binds repository implementations
@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {
    @Binds
    @Singleton
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository

    @Binds
    @Singleton
    abstract fun bindOrderRepo(impl: OrderRepositoryImpl): OrderRepository
}

// :feature:profile — consumes UserRepository, doesn't know about UserRepositoryImpl
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,
    private val formatDate: FormatDateUseCase,
) : ViewModel()
```

```kotlin
// Cross-module dependency resolution example
// :core:network provides AuthInterceptor
class AuthInterceptor @Inject constructor(
    private val tokenStore: TokenStore, // From :core:data
) : Interceptor { /* ... */ }

// :core:data provides TokenStore
@Module
@InstallIn(SingletonComponent::class)
abstract class AuthDataModule {
    @Binds @Singleton
    abstract fun bindTokenStore(impl: SharedPrefsTokenStore): TokenStore
}

// Hilt resolves the chain automatically:
// ProfileViewModel → UserRepository → UserRepositoryImpl → UserApi → Retrofit
//                                                                   → OkHttpClient → AuthInterceptor → TokenStore
// Each type comes from a different Gradle module, but Hilt wires them all together
```

```kotlin
// ❌ Common mistake: putting bindings in the wrong module
// :feature:profile/di/ProfileModule.kt
@Module
@InstallIn(SingletonComponent::class)
abstract class ProfileModule {
    @Binds
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
    // UserRepositoryImpl is in :core:data, not :feature:profile!
    // This module can't see UserRepositoryImpl unless :feature:profile
    // depends on :core:data (which it shouldn't!)
}

// ✅ Binding belongs in :core:data where the implementation lives
// :core:data/di/UserDataModule.kt
@Module
@InstallIn(SingletonComponent::class)
abstract class UserDataModule {
    @Binds @Singleton
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
}
```

```kotlin
// Multi-module Koin comparison — manual registration required
// :app/MyApp.kt
class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin {
            androidContext(this@MyApp)
            modules(
                networkModule,      // Must explicitly list every module!
                databaseModule,
                userDataModule,
                orderDataModule,
                homeModule,
                profileModule,
                checkoutModule,     // Forget one → runtime crash
            )
        }
    }
}
// With Hilt: just @HiltAndroidApp, and all modules are auto-discovered
```

**Key takeaway:** Hilt automatically discovers `@Module`-annotated classes in all Gradle modules in the dependency graph. Feature modules consume abstractions — they never reference implementation classes or Hilt modules from other layers. Place `@Module` classes in the Gradle module that owns the implementations they reference.

### Lesson 5.3: Qualifier Organization in Multi-Module Projects

In multi-module projects, qualifiers should live in a shared `:core:common` module that all modules depend on. If qualifiers are defined in a leaf module, other modules can't reference them. Centralizing qualifiers ensures consistency and avoids duplicated qualifier definitions.

Define a `Qualifiers.kt` file in `:core:common` with all your project-wide qualifiers. Module-specific qualifiers (rare) can live in their own module, but dispatchers, base URLs, and other cross-cutting qualifiers should be centralized. The convention is one file with all qualifiers, not one file per qualifier.

The same principle applies to qualifier providers. Dispatcher modules and scope modules should live in `:core:common` because every module in the project might need dispatchers or app-level scopes. If the dispatcher module lives in `:core:network`, then `:core:database` can't access `@IoDispatcher` unless it depends on `:core:network` — creating an unnecessary coupling.

A common mistake is duplicating qualifier definitions across modules. If `:core:network` defines `@IoDispatcher` and `:core:database` independently defines its own `@IoDispatcher`, they're different annotations to Dagger. Injecting `@IoDispatcher` from one module won't match the provider from the other. Centralizing in `:core:common` prevents this entirely.

For very large projects, you might split qualifiers into categories: `DispatcherQualifiers.kt`, `UrlQualifiers.kt`, `DatabaseQualifiers.kt`. Each file groups related qualifiers. This prevents the single `Qualifiers.kt` file from growing unwieldy while keeping everything in the same module.

```kotlin
// :core:common/src/main/kotlin/com/app/di/Qualifiers.kt
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class MainDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DefaultDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AppScope

// :core:common — provides dispatchers (every module depends on :core:common)
@Module
@InstallIn(SingletonComponent::class)
object DispatcherModule {
    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO

    @Provides
    @MainDispatcher
    fun provideMainDispatcher(): CoroutineDispatcher = Dispatchers.Main

    @Provides
    @DefaultDispatcher
    fun provideDefaultDispatcher(): CoroutineDispatcher = Dispatchers.Default

    @Provides
    @AppScope
    @Singleton
    fun provideAppScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.Default)
}
```

```kotlin
// ❌ Duplicated qualifiers across modules
// :core:network/di/Qualifiers.kt
@Qualifier annotation class IoDispatcher // ← Network's IoDispatcher

// :core:database/di/Qualifiers.kt
@Qualifier annotation class IoDispatcher // ← Database's IoDispatcher

// These are DIFFERENT annotations! Dagger treats them as separate types
// Providing @IoDispatcher from :core:network won't match
// @IoDispatcher injected in :core:database

// ✅ Single definition in :core:common
// :core:common/di/Qualifiers.kt
@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher
// Both :core:network and :core:database use this same qualifier
```

```kotlin
// Module-specific qualifiers (rare but valid)
// :feature:search/di/SearchQualifiers.kt
@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class SearchIndex // Only used within :feature:search

@Qualifier @Retention(AnnotationRetention.BINARY)
annotation class SuggestionIndex // Only used within :feature:search

// These don't need to be in :core:common because no other module needs them
```

**Key takeaway:** Centralize qualifiers in `:core:common` so all modules can reference them. Dispatchers, scopes, and cross-cutting configuration qualifiers belong here. Module-specific qualifiers can stay local. Never duplicate qualifier definitions across modules.

### Lesson 5.4: API Module Pattern for Feature Isolation

For large apps with many feature modules, the API module pattern adds another layer of isolation. Each feature exposes a `:feature:X:api` module with only its public interfaces and data classes. The implementation lives in `:feature:X:impl`. Other features depend on the `:api` module only.

This prevents feature modules from accidentally depending on each other's implementation details. It also improves build times — changes to `:feature:checkout:impl` don't trigger recompilation of `:feature:profile` if the `:feature:checkout:api` hasn't changed. In a 50-module project, this build isolation can save minutes per incremental build.

The API module pattern follows the same principle as DIP but at the Gradle module level. The "interface" is the `:api` module (public contract). The "implementation" is the `:impl` module (concrete code). Consumers depend on the contract, not the implementation. Hilt wires the implementation to the contract at compile time.

The API module typically contains: navigation interfaces (how to navigate to this feature), result types (what the feature produces), and event interfaces (how to communicate with the feature). It should not contain ViewModels, Composables, repositories, or any implementation code.

The `:impl` module provides Hilt bindings that map the API interfaces to their implementations. These bindings are installed in the appropriate component (usually `ActivityComponent` for navigators). The `:app` module depends on both `:api` and `:impl` for each feature, so Hilt can discover all bindings.

In Metro, the API module pattern works the same way, but `@ContributesBinding` in the `:impl` module eliminates the need for a separate Hilt module class. The binding is declared directly on the implementation class.

```
:feature:checkout:api    → CheckoutNavigator interface, CheckoutResult data class
:feature:checkout:impl   → CheckoutNavigatorImpl, CheckoutViewModel, CheckoutScreen
:feature:profile:api     → ProfileNavigator interface
:feature:profile:impl    → ProfileNavigatorImpl, ProfileViewModel, ProfileScreen
```

```kotlin
// :feature:checkout:api — only interfaces and data classes
interface CheckoutNavigator {
    fun navigateToCheckout(orderId: String)
}

data class CheckoutResult(val orderId: String, val success: Boolean)

// :feature:checkout:impl — provides the implementation
class CheckoutNavigatorImpl @Inject constructor(
    private val navController: NavController,
) : CheckoutNavigator {
    override fun navigateToCheckout(orderId: String) {
        navController.navigate("checkout/$orderId")
    }
}

// :feature:checkout:impl — Hilt module
@Module
@InstallIn(ActivityComponent::class)
abstract class CheckoutModule {
    @Binds
    abstract fun bindCheckoutNavigator(
        impl: CheckoutNavigatorImpl
    ): CheckoutNavigator
}

// :feature:profile:impl — depends only on :feature:checkout:api
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,
    private val checkoutNavigator: CheckoutNavigator,
) : ViewModel()
```

```kotlin
// Gradle dependencies with API module pattern

// :feature:profile:impl/build.gradle.kts
dependencies {
    implementation(project(":feature:profile:api"))    // Own API
    implementation(project(":feature:checkout:api"))   // Checkout's API only
    implementation(project(":core:domain"))
    // Does NOT depend on :feature:checkout:impl!
}

// :app/build.gradle.kts
dependencies {
    implementation(project(":feature:profile:api"))
    implementation(project(":feature:profile:impl"))
    implementation(project(":feature:checkout:api"))
    implementation(project(":feature:checkout:impl"))   // App wires everything
}
```

```kotlin
// Build isolation benefit
// Change CheckoutNavigatorImpl (in :feature:checkout:impl)
// → Recompiles: :feature:checkout:impl, :app
// → Does NOT recompile: :feature:profile:impl (depends on :api, not :impl)

// Without API module pattern:
// Change CheckoutNavigatorImpl (in :feature:checkout)
// → Recompiles: :feature:checkout, :feature:profile, :app
// → Everything that depends on :feature:checkout recompiles
```

```kotlin
// API module contents checklist:
// ✅ Navigation interfaces (CheckoutNavigator)
// ✅ Result/event data classes (CheckoutResult, CheckoutEvent)
// ✅ Feature-specific callback interfaces
// ❌ ViewModels (implementation detail)
// ❌ Composable functions (implementation detail)
// ❌ Repository implementations (data layer)
// ❌ Hilt modules (wiring detail)
```

**Key takeaway:** The API module pattern separates public contracts from implementations. Feature modules depend on each other's `:api` modules, never their `:impl` modules. This prevents tight coupling and improves build times. The `:api` module contains only interfaces and data classes.

### Lesson 5.5: Avoiding Common Multi-Module DI Mistakes

Several patterns that work fine in single-module apps become problems at scale. Understanding these anti-patterns helps you build a DI architecture that stays clean as the project grows. Most of these mistakes are architectural — they're about where bindings live and how modules depend on each other.

The most common mistake is putting all Hilt modules in the `:app` module. This creates a God module that knows about every implementation detail in the project. As the app grows, this module becomes a merge conflict magnet and defeats the purpose of modularization. Each module should define its own Hilt modules — the `:core:data` module should contain the bindings for its repository implementations.

Another pitfall is feature modules depending on `:core:data` directly instead of `:core:domain`. This means the feature module can see implementation classes and accidentally couple to them. The fix is simple: feature modules should only have `implementation` dependencies on `:core:domain`, never on `:core:data`.

A third mistake is creating Hilt modules in `:core:domain`. The domain layer should have zero DI framework dependencies — it should contain only pure Kotlin interfaces, data classes, and use cases. Adding Hilt annotations to `:core:domain` couples it to the DI framework and prevents reuse in non-Android contexts (like a shared Kotlin Multiplatform domain layer).

Circular module dependencies through DI are another common trap. If `:feature:home` provides a binding that `:feature:profile` needs, and `:feature:profile` provides a binding that `:feature:home` needs, you have a circular dependency. The fix is to extract the shared interface into `:core:domain` and provide both implementations in their respective modules.

Finally, overusing `@EntryPoint` in multi-module projects often signals an architectural problem. If a module needs many entry points to access the graph, it should probably be restructured to use standard injection. Entry points should be rare — used only for ContentProviders, legacy code, and third-party callbacks.

```kotlin
// ❌ Bad: feature module depends on :core:data
// build.gradle.kts (:feature:profile)
dependencies {
    implementation(project(":core:data"))   // Can see UserRepositoryImpl!
    implementation(project(":core:domain"))
}

// ✅ Good: feature module depends only on :core:domain
// build.gradle.kts (:feature:profile)
dependencies {
    implementation(project(":core:domain")) // Only sees UserRepository interface
}
```

```kotlin
// ❌ Bad: God module in :app
@Module
@InstallIn(SingletonComponent::class)
abstract class AppModule {
    @Binds abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
    @Binds abstract fun bindOrderRepo(impl: OrderRepositoryImpl): OrderRepository
    @Binds abstract fun bindPaymentRepo(impl: PaymentRepositoryImpl): PaymentRepository
    // ... 50 more bindings
}

// ✅ Good: each module defines its own bindings
// :core:data
@Module
@InstallIn(SingletonComponent::class)
abstract class UserDataModule {
    @Binds @Singleton
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
}
```

```kotlin
// ❌ Bad: DI framework in domain layer
// :core:domain/UserRepository.kt
interface UserRepository {
    suspend fun getUser(id: String): User?
}

// :core:domain/GetUserUseCase.kt
class GetUserUseCase @Inject constructor( // @Inject in domain layer!
    private val userRepo: UserRepository,
) {
    suspend operator fun invoke(id: String): User? = userRepo.getUser(id)
}
// Now :core:domain depends on javax.inject or Hilt!

// ✅ Good: pure Kotlin domain layer
// :core:domain/GetUserUseCase.kt
class GetUserUseCase(  // No DI annotations
    private val userRepo: UserRepository,
) {
    suspend operator fun invoke(id: String): User? = userRepo.getUser(id)
}

// :core:data provides the DI wiring
@Module
@InstallIn(SingletonComponent::class)
object UseCaseModule {
    @Provides
    fun provideGetUserUseCase(userRepo: UserRepository): GetUserUseCase =
        GetUserUseCase(userRepo)
}
// Alternative: add @Inject constructor in :core:data wrapper
```

```kotlin
// ❌ Bad: circular dependency through DI
// :feature:home needs NavigateToProfile (from :feature:profile)
// :feature:profile needs NavigateToHome (from :feature:home)
// → Gradle circular dependency!

// ✅ Good: shared navigation interfaces in :core:domain
// :core:domain/navigation/Navigators.kt
interface NavigateToProfile {
    fun navigate(userId: String)
}

interface NavigateToHome {
    fun navigate()
}

// :feature:home:impl provides NavigateToHome implementation
// :feature:profile:impl provides NavigateToProfile implementation
// Both depend on :core:domain, no circular dependency
```

**Key takeaway:** Each Gradle module should define its own Hilt modules. Feature modules should depend on `:core:domain` for abstractions, not `:core:data` for implementations. Keep the domain layer free of DI framework dependencies. Avoid God modules in `:app` that centralize all bindings.

### Quiz: Multi-Module DI Architecture

#### How does Hilt resolve dependencies across Gradle modules?

- ❌ You must manually register each module's bindings in the `:app` module
- ❌ Each module needs its own `@HiltAndroidApp` annotation
- ✅ Hilt automatically discovers `@Module`-annotated classes in all modules that are in the Gradle dependency graph
- ❌ You need to use `@CrossModule` annotation to enable cross-module resolution

> **Explanation:** Hilt uses compile-time code generation across the entire dependency graph. As long as a Gradle module is a dependency (direct or transitive) of the `:app` module, Hilt discovers and merges its `@Module` and `@InstallIn` annotated classes automatically.

#### Where should repository interface definitions live in a multi-module project?

- ❌ In the `:app` module
- ❌ In the `:core:data` module alongside implementations
- ✅ In the `:core:domain` module so feature modules depend on abstractions, not implementations
- ❌ In each feature module that uses them

> **Explanation:** Placing interfaces in `:core:domain` follows the Dependency Inversion Principle. Feature modules depend on `:core:domain` (abstractions), while `:core:data` implements those interfaces. This keeps feature modules decoupled from data layer details.

#### What is the API module pattern?

- ❌ A module that contains all API endpoint definitions
- ✅ Splitting each feature into an `:api` module (public interfaces) and an `:impl` module (implementations) so other features depend only on the `:api`
- ❌ A pattern for organizing Retrofit API interfaces
- ❌ A testing pattern for mocking API calls

> **Explanation:** The API module pattern separates public contracts from implementations. Other features depend on `:feature:X:api` (interfaces and data classes only), never on `:feature:X:impl`. This prevents tight coupling and improves incremental build times.

### Coding Challenge: Multi-Module Hilt Wiring

Given a `:core:domain` module with a `PaymentRepository` interface and a `:core:data` module with its implementation, create the Hilt modules needed to wire them together so a `:feature:checkout` module can inject `PaymentRepository`.

#### Solution

```kotlin
// :core:domain — repository interface (no Hilt dependency needed)
interface PaymentRepository {
    suspend fun processPayment(amount: Double): PaymentResult
    suspend fun getPaymentHistory(): List<Transaction>
}

// :core:data — implementation with @Inject constructor
class PaymentRepositoryImpl @Inject constructor(
    private val paymentApi: PaymentApi,
    private val transactionDao: TransactionDao,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : PaymentRepository {
    override suspend fun processPayment(amount: Double): PaymentResult =
        withContext(ioDispatcher) {
            val result = paymentApi.charge(amount)
            transactionDao.insert(Transaction(amount, result.status))
            result
        }

    override suspend fun getPaymentHistory(): List<Transaction> =
        withContext(ioDispatcher) {
            transactionDao.getAll()
        }
}

// :core:data — Hilt module to bind interface to implementation
@Module
@InstallIn(SingletonComponent::class)
abstract class PaymentDataModule {
    @Binds
    @Singleton
    abstract fun bindPaymentRepository(impl: PaymentRepositoryImpl): PaymentRepository
}

// :feature:checkout — just inject the interface, Hilt resolves it
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val paymentRepo: PaymentRepository,
    private val formatPrice: FormatPriceUseCase,
) : ViewModel() {
    fun processPayment(amount: Double) {
        viewModelScope.launch {
            _state.value = CheckoutState.Processing
            val result = paymentRepo.processPayment(amount)
            _state.value = CheckoutState.Complete(result)
        }
    }
}
```

The `:feature:checkout` module only depends on `:core:domain` (for the interface). The `:core:data` module provides the Hilt binding. The `:app` module depends on both, so Hilt merges everything at compile time.

---

## Module 6: How Dagger/Hilt Generates Code

### Lesson 6.1: KAPT, KSP, and Annotation Processing

To understand how Dagger and Hilt work, you need to understand how annotation processing fits into the build pipeline. Dagger was built in the Java era, using Java's annotation processing API (JSR 269). On a Kotlin project, that means KAPT — the Kotlin Annotation Processing Tool — which bridges Kotlin's compiler with Java's annotation processors.

KAPT's approach is expensive. Before any annotation processing happens, the Kotlin compiler runs a partial compilation pass that generates `.java` stub files for every Kotlin class that might be relevant. These stubs contain the class structure — methods, fields, annotations — but no implementation bodies. Then Dagger's annotation processor runs against these stubs as if they were real Java source files. This stub generation alone costs roughly one-third of a full `kotlinc` analysis.

KSP (Kotlin Symbol Processing) eliminates the stub generation step entirely. It plugs directly into the Kotlin compiler and provides processors with a structured symbol graph of your Kotlin code. Dagger added KSP support in 2024, and Hilt supports it as well. Migrating from KAPT to KSP typically gives you a 2x build speed improvement because the most expensive step — stub generation — simply disappears.

KAPT is also incompatible with the K2 compiler. If your project uses KAPT, you're pinned to `languageVersion = "1.9"`. You cannot adopt K2, which means you miss out on faster compilation, better type inference, and smarter smart casts. In a multi-module project, one module using KAPT forces every module to stay on the legacy compiler. KSP is fully compatible with K2 because it was designed to work with Kotlin's compiler infrastructure directly.

Metro takes a completely different approach — it's a Kotlin compiler plugin, not an annotation processor. It doesn't use KAPT or KSP at all. Instead, it hooks into Kotlin's FIR (Frontend Intermediate Representation) and IR (Intermediate Representation) phases directly. This means Metro generates code inside the compiler in a single pass — no separate annotation processing step, no generated source files, no extra compilation round. This is architecturally the most efficient approach possible.

The practical build time differences are significant. In a 500-module benchmark, Dagger KAPT took 23.2s for non-ABI changes, Dagger KSP took 11.5s, and Metro took 11.4s. For ABI-breaking changes, the difference was dramatic: Dagger KSP took 119.6s while Metro took 17.5s. The reason is that ABI changes trigger re-processing in KSP (which needs to re-generate source files), but Metro's IR generation doesn't require a separate pass.

Understanding these pipeline differences helps you make informed choices about your DI framework. If build performance matters (and in large projects, it always does), the processing architecture is the biggest factor. KAPT is the slowest, KSP is 2x faster, and compiler plugins like Metro eliminate the annotation processing overhead entirely.

```kotlin
// build.gradle.kts — KAPT (legacy, slow)
plugins {
    id("org.jetbrains.kotlin.kapt")
}
dependencies {
    implementation("com.google.dagger:hilt-android:2.51")
    kapt("com.google.dagger:hilt-compiler:2.51")
}

// build.gradle.kts — KSP (modern, faster)
plugins {
    id("com.google.devtools.ksp")
}
dependencies {
    implementation("com.google.dagger:hilt-android:2.51")
    ksp("com.google.dagger:hilt-compiler:2.51")
}
```

```kotlin
// Build pipeline comparison (detailed)
//
// KAPT pipeline:
// 1. kotlinc partial pass → generate .java stubs (EXPENSIVE)
// 2. Run Dagger's Java annotation processor on stubs
// 3. Dagger generates Java source files
// 4. javac compiles generated Java files
// 5. kotlinc compiles Kotlin files (full pass)
// = 4-5 compiler invocations, stub generation overhead
//
// KSP pipeline:
// 1. kotlinc analysis pass → build symbol graph
// 2. Run KSP processor (Dagger) on symbol graph
// 3. Dagger generates Kotlin source files
// 4. kotlinc compiles everything (including generated files)
// = 2 compiler invocations, no stub generation
//
// Metro pipeline:
// 1. kotlinc (with Metro plugin) → FIR analysis + IR generation
//    Metro generates code directly into IR during compilation
// = 1 compiler invocation, no generated source files
```

```kotlin
// K2 compatibility
// KAPT: ❌ Blocks K2 adoption (pins to languageVersion = "1.9")
// KSP: ✅ Fully compatible with K2
// Metro: ✅ Designed for K2 from the ground up

// In a multi-module project:
// If ANY module uses KAPT → entire project pinned to legacy compiler
// With KSP → free to adopt K2 in all modules
// With Metro → native K2 support, fastest possible builds
```

```kotlin
// Benchmark results (500-module synthetic project)
// Non-ABI changes (implementation-only):
//   Dagger KAPT:  23.2s
//   Dagger KSP:   11.5s
//   Metro:        11.4s
//   kotlin-inject: 11.7s
//
// ABI-breaking changes (interface changes):
//   Dagger KAPT:  not measured
//   Dagger KSP:   119.6s
//   Metro:        17.5s  (584% faster than Dagger KSP!)
//   kotlin-inject: 18.9s
```

**Key takeaway:** KAPT generates Java stubs before running Dagger's Java annotation processor — this is expensive and blocks K2 adoption. KSP eliminates the stub generation step, giving ~2x build speedup. Metro operates as a compiler plugin, generating code directly into IR with zero annotation processing overhead. Migrate from KAPT to KSP by changing `kapt(...)` to `ksp(...)` in your build file.

### Lesson 6.2: What Dagger Generates — Factory Classes

When Dagger processes your `@Inject constructor`, it generates a factory class. This factory implements `Provider<T>` and knows how to create your class with all its dependencies resolved. Understanding this generated code demystifies what Dagger actually does — it's not magic, it's code generation. Every `@Inject`-annotated class gets its own factory.

For each class with `@Inject constructor`, Dagger generates a `_Factory` class. This factory has a `get()` method that calls the constructor with the right dependencies. The factory itself receives `Provider<T>` for each dependency, which enables lazy instantiation and scoping. The `Provider` interface is the key abstraction — it defers creation until `get()` is called.

The `Provider<T>` wrapper is the key to Dagger's flexibility. When the binding is unscoped, `provider.get()` calls the factory every time, creating a new instance. When scoped with `@Singleton`, Dagger wraps the provider in a `DoubleCheck` that ensures lazy, thread-safe singleton creation. This single abstraction — `Provider<T>` — handles both scoped and unscoped bindings uniformly.

The generated factory's `companion object` has two static methods: `create()` for building the factory itself, and `newInstance()` for directly creating an instance without the provider indirection. The `create()` method is used by the component during graph wiring. The `newInstance()` method is a convenience that bypasses providers — useful in tests or generated code that doesn't need lazy/scoped behavior.

In multi-module projects, each module's `@Inject` classes get their own factory generated in that module. The `:app` module's component then references these factories by their generated class names. This is why all modules must be in the dependency graph of `:app` — the component needs to see all factory classes to wire them together.

The factory pattern is what makes Dagger different from reflection-based DI frameworks. Guice (Dagger's predecessor) creates instances using `Constructor.newInstance()` via reflection. Dagger generates a plain constructor call — `new UserRepository(api, dao)` — which is exactly what you'd write by hand. The only overhead is the `Provider` wrapper and, for singletons, the `DoubleCheck` lock. This is why Dagger is fast at runtime — it's doing the same thing you'd do manually, just with generated code.

Metro generates similar factory code but directly into Kotlin IR instead of source files. The runtime behavior is identical — constructor calls wrapped in providers — but the build-time cost is lower because there's no source generation step.

```kotlin
// Your code
class UserRepository @Inject constructor(
    private val api: UserApi,
    private val dao: UserDao,
) : UserRepository

// What Dagger generates (simplified)
class UserRepository_Factory(
    private val apiProvider: Provider<UserApi>,
    private val daoProvider: Provider<UserDao>,
) : Factory<UserRepository> {

    override fun get(): UserRepository {
        return UserRepository(apiProvider.get(), daoProvider.get())
    }

    companion object {
        fun create(
            apiProvider: Provider<UserApi>,
            daoProvider: Provider<UserDao>,
        ): UserRepository_Factory {
            return UserRepository_Factory(apiProvider, daoProvider)
        }

        fun newInstance(api: UserApi, dao: UserDao): UserRepository {
            return UserRepository(api, dao)
        }
    }
}
```

```kotlin
// How scoping wraps the factory
// In the component's initialize() method:

// Unscoped — factory called directly on every get()
val userRepositoryProvider = UserRepository_Factory.create(apiProvider, daoProvider)
// userRepositoryProvider.get() → new UserRepository(api, dao) every time

// Singleton — wrapped in DoubleCheck
val userRepositoryProvider = DoubleCheck.provider(
    UserRepository_Factory.create(apiProvider, daoProvider)
)
// First .get() → new UserRepository(api, dao), cached
// Subsequent .get() → returns cached instance
// Thread-safe via double-checked locking
```

```kotlin
// DoubleCheck implementation (simplified)
class DoubleCheck<T>(private val provider: Provider<T>) : Provider<T> {
    @Volatile private var instance: Any? = UNINITIALIZED

    override fun get(): T {
        var result = instance
        if (result == UNINITIALIZED) {
            synchronized(this) {
                result = instance
                if (result == UNINITIALIZED) {
                    result = provider.get()
                    instance = result
                }
            }
        }
        return result as T
    }
}
// First call: enters synchronized block, creates instance, caches it
// Subsequent calls: volatile read returns cached instance (no lock!)
```

```kotlin
// Factory for a class with many dependencies
class OrderService @Inject constructor(
    private val orderApi: OrderApi,
    private val orderDao: OrderDao,
    private val paymentGateway: PaymentGateway,
    private val inventoryChecker: InventoryChecker,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
    private val analytics: Analytics,
)

// Generated factory has Provider<T> for each dependency:
// class OrderService_Factory(
//     private val orderApiProvider: Provider<OrderApi>,
//     private val orderDaoProvider: Provider<OrderDao>,
//     private val paymentGatewayProvider: Provider<PaymentGateway>,
//     private val inventoryCheckerProvider: Provider<InventoryChecker>,
//     private val ioDispatcherProvider: Provider<CoroutineDispatcher>,
//     private val analyticsProvider: Provider<Analytics>,
// ) : Factory<OrderService> { ... }
```

**Key takeaway:** Dagger generates a `_Factory` class for each `@Inject constructor`. The factory uses `Provider<T>` wrappers for lazy, potentially-scoped instantiation. There's no reflection — everything is plain constructor calls at runtime. `DoubleCheck` provides thread-safe singleton behavior through double-checked locking.

### Lesson 6.3: What Dagger Generates — Module Methods

For `@Provides` methods, Dagger generates a similar factory class. Each `@Provides` method gets its own factory that calls the module method with the resolved dependencies. For `@Binds` methods, Dagger is more efficient — it doesn't generate a separate factory at all. Understanding this difference explains why `@Binds` is always recommended for simple interface-to-implementation mappings.

When you use `@Binds`, Dagger simply maps the interface type to the implementation's existing factory. This is why `@Binds` is more efficient than `@Provides` for interface mappings — it eliminates one layer of indirection and one generated class. In a project with 50 interface bindings, that's 50 fewer classes to generate, compile, and include in your APK.

The generated factory for a `@Provides` method is nearly identical to an `@Inject constructor` factory. The main difference is that instead of calling a constructor, it calls the module's method. For `object` modules, this is a static call. For class modules, the factory holds a reference to the module instance.

One subtlety: when a `@Provides` function is in an `object` module (which is the recommended pattern), Dagger generates a factory that calls the function statically — `NetworkModule.provideRetrofit(client)`. For non-object modules (regular classes), Dagger generates a factory that takes a module instance as a constructor parameter and calls the method on it. This is one reason `object` modules are preferred — the generated code is simpler and has less overhead.

For Hilt specifically, the `@Module` and `@InstallIn` annotations generate additional metadata. Hilt generates an `_HiltModules` class that registers the module into the correct component. This metadata is how Hilt knows to include the module's bindings in `SingletonComponent` versus `ActivityComponent`. The generated metadata classes are small but add up in large projects.

```kotlin
// Your @Provides method
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl("https://api.app.com/")
            .client(client)
            .build()
}

// What Dagger generates (simplified)
class NetworkModule_ProvideRetrofitFactory(
    private val clientProvider: Provider<OkHttpClient>,
) : Factory<Retrofit> {

    override fun get(): Retrofit {
        return NetworkModule.provideRetrofit(clientProvider.get())
    }

    companion object {
        fun create(clientProvider: Provider<OkHttpClient>): NetworkModule_ProvideRetrofitFactory {
            return NetworkModule_ProvideRetrofitFactory(clientProvider)
        }
    }
}

// For @Binds — no factory generated!
// Dagger just reuses the implementation's factory directly.
// @Binds abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
// → UserRepository's provider IS UserRepositoryImpl's provider. No wrapper.
```

```kotlin
// Code generation comparison: @Provides vs @Binds

// @Provides for interface mapping — generates a factory
@Provides
fun provideUserRepo(impl: UserRepositoryImpl): UserRepository = impl
// Generated: RepositoryModule_ProvideUserRepoFactory (unnecessary wrapper!)
// At runtime: factory.get() → module.provideUserRepo(impl.get()) → returns impl
// Extra indirection: call module method, which just returns its parameter

// @Binds for interface mapping — generates NOTHING
@Binds
abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
// Generated: nothing
// At runtime: UserRepository provider === UserRepositoryImpl provider
// Zero indirection: they're the same object
```

```kotlin
// object module vs class module — generated code difference
// object module (recommended):
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides fun provideApi(retrofit: Retrofit): UserApi =
        retrofit.create(UserApi::class.java)
}
// Generated factory calls: NetworkModule.provideApi(retrofit)
// Static call — no module instance needed

// class module (less common):
@Module
@InstallIn(SingletonComponent::class)
class ConfigModule(private val config: AppConfig) {
    @Provides fun provideBaseUrl(): String = config.baseUrl
}
// Generated factory takes module instance:
// class ConfigModule_ProvideBaseUrlFactory(private val module: ConfigModule)
// Calls: module.provideBaseUrl()
// Needs module instance — more overhead
```

```kotlin
// What Hilt generates for @InstallIn metadata
// For each @Module @InstallIn(SingletonComponent::class):
// Hilt generates: NetworkModule_HiltModules
// This tells Hilt's code generator to include NetworkModule's
// bindings in the SingletonComponent graph
//
// For each @HiltViewModel:
// Hilt generates: MyViewModel_HiltModules
// This registers the ViewModel's factory in ViewModelComponent's
// multibinding map
```

**Key takeaway:** Each `@Provides` method generates its own factory class. `@Binds` generates nothing — it directly maps the interface to the implementation's existing factory. This is why `@Binds` is the better choice for simple interface-to-implementation mappings. Use `object` modules for `@Provides` to get static calls in generated code.

### Lesson 6.4: What Dagger Generates — The Component

The component is the heart of the generated code. Dagger generates a class (e.g., `DaggerAppComponent`) that implements your `@Component` interface. This class holds all the providers, wires them together, and exposes the accessor methods you declared. It's the composition root — the single place where the entire dependency graph is assembled.

For Hilt, the generated component hierarchy is more complex because Hilt manages multiple component levels (Singleton, Activity, ViewModel, etc.). But the principle is the same — a generated class that holds providers and wires dependencies. Hilt also generates bytecode transformations that inject into `@AndroidEntryPoint`-annotated Activities and Fragments.

The component's `initialize()` method is where the magic happens. It creates providers for every binding in the graph, wires them together through `Provider<T>` references, and wraps scoped bindings in `DoubleCheck`. The order of initialization is topologically sorted — dependencies are created before dependents. Dagger validates this ordering at compile time, so there are no circular dependency surprises at runtime.

Notice how `DoubleCheck.provider()` wraps `@Singleton`-scoped bindings. `DoubleCheck` uses double-checked locking to ensure thread-safe lazy initialization — the instance is created on first access and reused on subsequent calls. Unscoped bindings (like `userApiProvider`) call the factory directly without `DoubleCheck`.

In Hilt's component hierarchy, each sub-component (ActivityComponent, ViewModelComponent) is generated as an inner class of the parent component. This nesting gives child components access to parent providers. When Hilt creates an `ActivityComponent`, it passes the `SingletonComponent` reference, allowing Activity-scoped bindings to access Singleton-scoped providers.

The generated component class is typically large — in a production app with hundreds of bindings, it can be thousands of lines. This is why Dagger's compile time increases with app size — the component file gets bigger and takes longer to generate and compile. Metro avoids this by generating directly into IR, which doesn't produce a source file at all.

```kotlin
// Your component definition
@Component(modules = [NetworkModule::class, DatabaseModule::class])
@Singleton
interface AppComponent {
    fun userRepository(): UserRepository
    fun inject(activity: MainActivity)
}

// What Dagger generates (heavily simplified)
class DaggerAppComponent private constructor() : AppComponent {

    // Providers for every binding in the graph
    private lateinit var okHttpClientProvider: Provider<OkHttpClient>
    private lateinit var retrofitProvider: Provider<Retrofit>
    private lateinit var userApiProvider: Provider<UserApi>
    private lateinit var databaseProvider: Provider<AppDatabase>
    private lateinit var userDaoProvider: Provider<UserDao>
    private lateinit var userRepositoryProvider: Provider<UserRepository>

    private fun initialize() {
        // Wire everything together
        okHttpClientProvider = DoubleCheck.provider(
            NetworkModule_ProvideOkHttpClientFactory.create()
        )
        retrofitProvider = DoubleCheck.provider(
            NetworkModule_ProvideRetrofitFactory.create(okHttpClientProvider)
        )
        userApiProvider = NetworkModule_ProvideUserApiFactory.create(retrofitProvider)
        databaseProvider = DoubleCheck.provider(
            DatabaseModule_ProvideDatabaseFactory.create(contextProvider)
        )
        userDaoProvider = DatabaseModule_ProvideUserDaoFactory.create(databaseProvider)
        userRepositoryProvider = DoubleCheck.provider(
            UserRepository_Factory.create(userApiProvider, userDaoProvider)
        )
    }

    override fun userRepository(): UserRepository = userRepositoryProvider.get()

    class Builder { /* ... */ }
}
```

```kotlin
// Hilt's component hierarchy in generated code (conceptual)
class DaggerMyApp_HiltComponents_SingletonC : SingletonComponent {
    // All @Singleton-scoped providers
    private val databaseProvider: Provider<AppDatabase>
    private val retrofitProvider: Provider<Retrofit>

    // Sub-component factories
    fun activityRetainedComponentBuilder(): ActivityRetainedComponent.Builder

    inner class ActivityRetainedCImpl : ActivityRetainedComponent {
        // Inherits parent's providers
        // Has its own @ActivityRetainedScoped providers

        inner class ViewModelCImpl : ViewModelComponent {
            // Has access to SavedStateHandle
            // Has @ViewModelScoped providers
        }

        inner class ActivityCImpl : ActivityComponent {
            // Has @ActivityContext
            // Has @ActivityScoped providers

            inner class FragmentCImpl : FragmentComponent {
                // Has Fragment reference
                // Has @FragmentScoped providers
            }
        }
    }
}
```

```kotlin
// How the component resolves a complex dependency chain
// Request: ProfileViewModel needs UserRepository
//
// DaggerComponent.initialize() wires:
// 1. contextProvider → ApplicationContextProvider (built-in)
// 2. databaseProvider → DoubleCheck(DatabaseModule_ProvideDatabaseFactory(contextProvider))
// 3. userDaoProvider → DatabaseModule_ProvideUserDaoFactory(databaseProvider)
// 4. okHttpProvider → DoubleCheck(NetworkModule_ProvideOkHttpFactory())
// 5. retrofitProvider → DoubleCheck(NetworkModule_ProvideRetrofitFactory(okHttpProvider))
// 6. userApiProvider → NetworkModule_ProvideUserApiFactory(retrofitProvider)
// 7. userRepoProvider → DoubleCheck(UserRepository_Factory(userApiProvider, userDaoProvider))
// 8. profileViewModelProvider → ProfileViewModel_Factory(userRepoProvider, ...)
//
// Each provider calls .get() on its dependencies when needed
// Singletons create once (DoubleCheck), others create on every .get()
```

**Key takeaway:** Dagger generates a component class that wires all providers together. `@Singleton` bindings use `DoubleCheck` for thread-safe lazy singleton creation. The entire graph is validated and wired at compile time — no reflection at runtime. Hilt generates a hierarchy of nested component classes matching Android's lifecycle.

### Lesson 6.5: Hilt's Bytecode Transformation

Hilt adds a layer on top of Dagger's generated code. When you annotate an Activity with `@AndroidEntryPoint`, Hilt doesn't just generate a Dagger component — it also performs bytecode transformation to inject dependencies into the Activity's lifecycle. This transformation is what makes Hilt's API so simple compared to raw Dagger.

Under the hood, Hilt generates a base class that your Activity extends (via bytecode rewriting). This base class overrides `onCreate()` to perform injection before your code runs. This is why `@Inject lateinit var` fields are available in `onCreate()` — they're set before your `onCreate()` body executes.

Hilt also generates the component hierarchy automatically. Instead of manually defining `@Component`, `@Subcomponent`, and their factories (which is what raw Dagger requires), Hilt creates the standard Android component tree — `SingletonComponent`, `ActivityComponent`, `FragmentComponent`, etc. — and wires them together. This eliminates a huge amount of boilerplate that made raw Dagger tedious.

The bytecode transformation is performed by a Gradle transform plugin. During the build, after Kotlin compilation, Hilt's transform scans for classes annotated with `@AndroidEntryPoint` and modifies their superclass to point to the generated Hilt base class. This is an ASM-based transformation that modifies `.class` files directly. It's why Hilt requires the Gradle plugin — without the transform, the generated base classes are never wired in.

One consequence of bytecode transformation is that your class hierarchy changes at compile time. If you debug and look at the class hierarchy in a debugger, you'll see `MainActivity → Hilt_MainActivity → ComponentActivity`. This can be confusing if you're not aware of it. The transformation is also why Hilt is Android-specific — bytecode transformation depends on Android's build pipeline.

Metro doesn't use bytecode transformation. As a compiler plugin, Metro generates code directly into the compiler's IR, which is a more integrated approach. There's no post-compilation transformation step. This is one reason Metro is architecturally cleaner — it doesn't require a separate Gradle plugin for bytecode manipulation.

```kotlin
// What you write
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var analytics: Analytics

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // analytics is already injected here
        analytics.track("main_activity_created")
    }
}

// What Hilt generates (conceptually)
// 1. Hilt_MainActivity — a generated base class that:
//    - Creates/gets the ActivityComponent in onCreate()
//    - Calls inject(this) to populate @Inject fields
//    - Delegates to your onCreate() after injection
//
// 2. Your class is bytecode-rewritten to extend Hilt_MainActivity
//    instead of ComponentActivity directly
//
// 3. The injection happens in super.onCreate(), which is why
//    fields are available when your onCreate() body runs
```

```kotlin
// Hilt_MainActivity generated base class (simplified pseudocode)
abstract class Hilt_MainActivity : ComponentActivity() {
    private var injected = false

    override fun onCreate(savedInstanceState: Bundle?) {
        // Step 1: Get the SingletonComponent from the Application
        val app = application as GeneratedComponentManager<*>
        val singletonComponent = app.generatedComponent()

        // Step 2: Create ActivityComponent as subcomponent
        val activityComponent = singletonComponent
            .activityComponentBuilder()
            .activity(this)
            .build()

        // Step 3: Inject fields
        activityComponent.inject(this as MainActivity)
        injected = true

        // Step 4: Call super (which calls YOUR onCreate body)
        super.onCreate(savedInstanceState)
    }
}

// After bytecode transformation:
// class MainActivity extends Hilt_MainActivity (not ComponentActivity!)
```

```kotlin
// The bytecode transformation changes the class hierarchy
// Before transformation (what you write):
// MainActivity → ComponentActivity → Activity

// After transformation (what runs):
// MainActivity → Hilt_MainActivity → ComponentActivity → Activity

// You can verify this in a debugger:
// Log.d("DI", this.javaClass.superclass?.name)
// Output: "com.app.Hilt_MainActivity"
```

```kotlin
// Why the Hilt Gradle plugin is required
// build.gradle.kts
plugins {
    id("com.google.dagger.hilt.android") // This plugin!
}
// Without this plugin:
// - Bytecode transformation doesn't run
// - MainActivity still extends ComponentActivity (not Hilt_MainActivity)
// - @Inject fields are never set
// - App crashes with UninitializedPropertyAccessException

// The plugin registers a Gradle Transform that:
// 1. Scans .class files for @AndroidEntryPoint
// 2. Uses ASM to change the superclass
// 3. Outputs modified .class files
```

**Key takeaway:** Hilt uses bytecode transformation to inject dependencies into Android components. Your Activity is rewritten at compile time to extend a generated base class that handles component creation and injection. This is why `@Inject` fields are available in `onCreate()` — they're set in `super.onCreate()` before your code runs.

### Lesson 6.6: Graph Validation and Error Messages

One of Dagger/Hilt's greatest strengths is compile-time graph validation. The entire dependency graph is analyzed during compilation, and missing bindings, circular dependencies, and scope violations are reported as compile errors — not runtime crashes. This is the fundamental safety advantage over service locators like Koin.

Dagger uses Tarjan's algorithm and topological sorting to validate the graph. It builds a directed acyclic graph (DAG) of all bindings and checks that every dependency can be resolved. If you have a circular dependency (A needs B, B needs C, C needs A), Dagger detects it and reports a clear error with the cycle path.

Understanding how to read Dagger's error messages saves significant debugging time. The most common error — "missing binding" — tells you exactly which type is missing and where it's needed. The fix is usually adding a `@Provides` method, a `@Binds` declaration, or an `@Inject constructor`. The error message includes the injection chain, showing you exactly how the missing type is requested.

Scope validation is another compile-time check. If a `@Singleton`-scoped binding depends on an `@ActivityScoped` binding, Dagger reports a scope violation. This prevents the common bug where a singleton holds a reference to a shorter-lived object. The error message tells you which scopes are incompatible and suggests how to fix it.

Duplicate binding errors occur when two modules provide the same type without qualifiers. Dagger can't decide which binding to use, so it reports the conflict. The fix is either removing one binding or adding qualifiers to disambiguate.

Metro's validation is stricter than Dagger's in some areas. Metro flags nullable type mismatches, duplicate module includes, and scope annotations on `@Binds` methods (which should be on the implementation class instead). These are things Dagger silently accepts but that can cause subtle bugs. When migrating from Dagger to Metro, expect to fix a handful of these stricter validation errors.

```kotlin
// Common error: Missing binding
// Error: [Dagger/MissingBinding] UserRepository cannot be provided
// without an @Inject constructor or an @Provides-annotated method.
//   UserRepository is injected at ProfileViewModel(userRepo)
//   ProfileViewModel is injected at ...

// Fix: Add @Inject constructor or @Binds
class UserRepositoryImpl @Inject constructor(
    private val api: UserApi,
) : UserRepository

// Common error: Circular dependency
// Error: [Dagger/DependencyCycle] Found a dependency cycle:
//   ClassA is injected at ClassB(a)
//   ClassB is injected at ClassA(b)

// Fix: Break the cycle with Provider<T> or Lazy<T>
class ClassA @Inject constructor(
    private val b: Provider<ClassB>,  // Defer creation
)
```

```kotlin
// Reading Dagger error messages — the injection chain
// Error: [Dagger/MissingBinding]
// com.app.data.UserApi cannot be provided without an @Provides method.
//
//   com.app.data.UserApi is injected at
//       com.app.data.UserRepositoryImpl(api)
//   com.app.data.UserRepositoryImpl is injected at
//       com.app.di.DataModule.bindUserRepo(impl)
//   com.app.domain.UserRepository is injected at
//       com.app.feature.ProfileViewModel(userRepo)
//   com.app.feature.ProfileViewModel is injected at
//       [com.app.SingletonComponent]
//
// Read bottom-up: ProfileViewModel needs UserRepository,
// which is bound to UserRepositoryImpl, which needs UserApi.
// UserApi has no @Provides — that's the missing piece!

// Fix: Add UserApi provider
@Module
@InstallIn(SingletonComponent::class)
object ApiModule {
    @Provides
    fun provideUserApi(retrofit: Retrofit): UserApi =
        retrofit.create(UserApi::class.java)
}
```

```kotlin
// Scope violation error
// Error: [Dagger/IncompatiblyScopedBindings]
// @Singleton class DatabaseManager may not reference
// @ActivityScoped class ThemeHelper
//
// A singleton can't depend on something Activity-scoped
// because the singleton outlives the Activity

// Fix: change ThemeHelper to @Singleton or change DatabaseManager to @ActivityScoped
```

```kotlin
// Duplicate binding error
// Error: [Dagger/DuplicateBindings]
// String is bound multiple times:
//   @Provides String NetworkModule.provideBaseUrl()
//   @Provides String ConfigModule.provideApiKey()
//
// Two @Provides functions return String without qualifiers

// Fix: Add qualifiers
@Provides @BaseUrl fun provideBaseUrl(): String = "..."
@Provides @ApiKey fun provideApiKey(): String = "..."
```

```kotlin
// Breaking circular dependencies
// ❌ Circular: A needs B, B needs A
class ServiceA @Inject constructor(private val b: ServiceB)
class ServiceB @Inject constructor(private val a: ServiceA)

// ✅ Fix 1: Use Provider<T> to defer creation
class ServiceA @Inject constructor(private val bProvider: Provider<ServiceB>) {
    fun doWork() {
        val b = bProvider.get() // Created when needed, not at construction time
    }
}
class ServiceB @Inject constructor(private val a: ServiceA)

// ✅ Fix 2: Use Lazy<T> for lazy initialization
class ServiceA @Inject constructor(private val b: Lazy<ServiceB>) {
    fun doWork() {
        val b = b.get() // Created once, cached
    }
}

// ✅ Fix 3: Restructure to eliminate the cycle (best approach)
// Extract shared logic into a third class that both depend on
class SharedLogic @Inject constructor()
class ServiceA @Inject constructor(private val shared: SharedLogic)
class ServiceB @Inject constructor(private val shared: SharedLogic)
```

**Key takeaway:** Dagger validates the entire dependency graph at compile time using graph algorithms. Missing bindings, circular dependencies, and scope violations are compile errors. Learn to read Dagger's error messages — they tell you exactly what's wrong and where. Break circular dependencies by restructuring or using `Provider<T>`/`Lazy<T>`.

### Quiz: How Dagger/Hilt Generates Code

#### What does KAPT do before Dagger's annotation processor runs?

- ❌ It compiles your Kotlin code to bytecode
- ✅ It generates Java stub files for every Kotlin class so Java annotation processors can read them
- ❌ It validates the dependency graph
- ❌ It generates Dagger's factory classes

> **Explanation:** KAPT generates `.java` stub files that mirror your Kotlin classes. This is necessary because Java annotation processors (like Dagger's) only understand Java code. This stub generation costs roughly one-third of a full compilation and is the main reason KSP is faster.

#### Why is `@Binds` more efficient than `@Provides` for interface mappings?

- ❌ `@Binds` uses reflection instead of code generation
- ❌ `@Binds` skips compile-time validation
- ✅ `@Binds` doesn't generate a separate factory class — it reuses the implementation's existing factory
- ❌ `@Binds` creates instances lazily while `@Provides` creates them eagerly

> **Explanation:** When you use `@Binds`, Dagger maps the interface type directly to the implementation's factory. No additional factory class is generated. `@Provides` always generates its own factory class, adding one layer of indirection.

#### How does Dagger ensure `@Singleton` bindings are thread-safe?

- ❌ Using `synchronized` blocks on the component
- ✅ Using `DoubleCheck` — a double-checked locking wrapper around the provider
- ❌ Using Kotlin's `lazy` delegate
- ❌ Creating all singletons eagerly at startup

> **Explanation:** `DoubleCheck` wraps the provider and uses double-checked locking to ensure the instance is created only once, even when accessed from multiple threads simultaneously. The instance is created lazily on first access and cached for subsequent calls.

### Coding Challenge: Read Generated Dagger Code

Given the following Hilt module, describe what Dagger generates for each binding. Identify which bindings get their own factory class and which don't.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): AppDatabase =
        Room.databaseBuilder(ctx, AppDatabase::class.java, "app.db").build()
}

@Module
@InstallIn(SingletonComponent::class)
abstract class RepoModule {
    @Binds
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
}

class UserRepositoryImpl @Inject constructor(
    private val db: AppDatabase,
)
```

#### Solution

```kotlin
// 1. AppModule_ProvideDatabaseFactory — GENERATED
//    A factory class that calls AppModule.provideDatabase(context)
//    Wrapped in DoubleCheck because of @Singleton

// 2. RepoModule — NO factory generated for @Binds
//    Dagger maps UserRepository → UserRepositoryImpl's factory directly
//    No separate class needed

// 3. UserRepositoryImpl_Factory — GENERATED
//    A factory that calls UserRepositoryImpl(db)
//    The provider for AppDatabase is passed in

// In the component's initialize():
//   databaseProvider = DoubleCheck.provider(
//       AppModule_ProvideDatabaseFactory.create(contextProvider)
//   )
//   userRepositoryImplProvider = UserRepositoryImpl_Factory.create(databaseProvider)
//   // userRepositoryProvider just points to userRepositoryImplProvider
//   // because @Binds doesn't add indirection
```

Total generated factories: 2 (`AppModule_ProvideDatabaseFactory` and `UserRepositoryImpl_Factory`). The `@Binds` declaration generates nothing — it's a zero-cost mapping that reuses the implementation's existing factory.


---

## Module 7: Testing with Dependency Injection

### Lesson 7.1: Unit Testing with Constructor Injection

The biggest payoff of constructor injection is unit testing. When every dependency is a constructor parameter, you don't need a DI framework in tests at all. You create the class under test directly, passing fake implementations for each dependency. No Hilt, no setup, no component hierarchy. This is the fastest and most reliable way to test.

Each test constructs its own instance with fresh fakes, so there's no shared state between tests. The test is a pure Kotlin function — it runs on any machine without an emulator, Android framework, or Hilt test rules. A typical unit test runs in milliseconds, compared to seconds or minutes for instrumented tests.

The pattern is simple: create fake implementations of your interfaces, construct the class under test with those fakes, configure the fake's behavior, call the method under test, and assert the result. No mocking library needed, no annotation magic, no test rules. Just Kotlin constructors and assertions.

Fakes are more valuable than mocks for unit testing because they have real behavior. A `FakeUserRepository` backed by a `MutableMap` actually stores and retrieves data. When your ViewModel calls `repository.getUser("1")`, the fake returns the data you set up — or null if nothing was set up. This catches real bugs that mock-based tests miss, like incorrect null handling or wrong key lookups.

The testing advantage of constructor injection is why it's the recommended injection style for all non-Android-entry-point classes. Every ViewModel, repository, use case, and helper class should use constructor injection. This gives you a clean testing story without any framework dependency.

In contrast, field-injected classes require either Hilt's test infrastructure (`@HiltAndroidTest`) or reflection-based mocking libraries to set the `lateinit var` fields. Both approaches are slower, more complex, and more brittle than plain constructor calls. This is the practical cost of field injection — it trades testability for convenience.

When testing coroutine-based code, inject dispatchers as constructor parameters (using qualifiers) so you can replace them with `StandardTestDispatcher` in tests. This gives your tests deterministic control over coroutine execution timing. Without injectable dispatchers, your tests depend on real thread scheduling, making them flaky.

For ViewModel testing specifically, use `runTest` from `kotlinx-coroutines-test` along with `StandardTestDispatcher`. The test dispatcher lets you advance coroutine execution manually, verifying state at each step. Combined with constructor-injected fakes, this gives you complete control over both data and timing.

```kotlin
// Fake implementation — simple in-memory version
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()

    fun addUser(user: User) { users[user.id] = user }
    fun clear() { users.clear() }

    override suspend fun getUser(id: String): User? = users[id]
    override suspend fun saveUser(user: User) { users[user.id] = user }
}

class FakeAnalytics : Analytics {
    val trackedEvents = mutableListOf<String>()
    override fun track(event: String) { trackedEvents.add(event) }
}

// Unit test — no DI framework needed
class ProfileViewModelTest {
    private val fakeRepo = FakeUserRepository()
    private val fakeAnalytics = FakeAnalytics()
    private val viewModel = ProfileViewModel(
        userRepo = fakeRepo,
        analytics = fakeAnalytics,
    )

    @Test
    fun `loads profile successfully`() = runTest {
        val testUser = User(id = "1", name = "Alice")
        fakeRepo.addUser(testUser)

        viewModel.loadProfile("1")

        assertEquals(ProfileState.Success(testUser), viewModel.state.value)
        assertTrue(fakeAnalytics.trackedEvents.contains("profile_viewed"))
    }

    @Test
    fun `handles missing user`() = runTest {
        viewModel.loadProfile("nonexistent")
        assertEquals(ProfileState.Error("User not found"), viewModel.state.value)
    }
}
```

```kotlin
// Testing with injectable dispatchers
class UserViewModelTest {
    private val testDispatcher = StandardTestDispatcher()
    private val fakeRepo = FakeUserRepository()

    private val viewModel = UserViewModel(
        userRepo = fakeRepo,
        ioDispatcher = testDispatcher,
    )

    @Test
    fun `loads users on init`() = runTest(testDispatcher) {
        fakeRepo.addUser(User("1", "Alice"))

        advanceUntilIdle() // Execute all pending coroutines

        assertEquals(
            listOf(User("1", "Alice")),
            viewModel.users.value
        )
    }

    @Test
    fun `shows loading state before data arrives`() = runTest(testDispatcher) {
        fakeRepo.addUser(User("1", "Alice"))

        // Don't advance — coroutines haven't run yet
        assertEquals(UiState.Loading, viewModel.state.value)

        advanceUntilIdle()
        assertEquals(UiState.Success(listOf(User("1", "Alice"))), viewModel.state.value)
    }
}
```

```kotlin
// Fake with configurable error behavior
class FakeOrderRepository : OrderRepository {
    private val orders = mutableListOf<Order>()
    var shouldFail = false
    var failureException: Exception = IOException("Network error")

    override suspend fun getOrders(): List<Order> {
        if (shouldFail) throw failureException
        return orders.toList()
    }

    override suspend fun placeOrder(order: Order) {
        if (shouldFail) throw failureException
        orders.add(order)
    }

    fun addOrder(order: Order) { orders.add(order) }
}

@Test
fun `shows error state on network failure`() = runTest {
    val fakeRepo = FakeOrderRepository().apply { shouldFail = true }
    val viewModel = OrderViewModel(fakeRepo, testDispatcher)

    viewModel.loadOrders()
    advanceUntilIdle()

    assertTrue(viewModel.state.value is OrderState.Error)
}
```

**Key takeaway:** Unit tests don't need a DI framework. Constructor injection means you pass fakes directly — no Hilt setup, no emulator, no overhead. Each test gets fresh fakes with no shared state. Use injectable dispatchers for deterministic coroutine testing.

### Lesson 7.2: Fakes vs Mocks

There are two approaches to test doubles: fakes and mocks. Fakes are real implementations with simplified behavior — an in-memory repository instead of one backed by a database. Mocks use libraries like Mockito or MockK to create objects that record calls and return configured values. Both have their place, but understanding the tradeoffs is essential for an effective testing strategy.

Fakes are generally preferred for repositories and data sources because they actually execute logic. A fake repository that stores data in a `MutableMap` behaves like a real repository — you can insert data, query it, update it, and verify the state. Mocks verify interactions ("was this method called?") but don't actually do anything — they test implementation details rather than behavior.

The tradeoff: fakes require writing and maintaining real code, while mocks are quick to set up. For core abstractions used across many tests (repositories, APIs), invest in fakes. For one-off dependencies (analytics, loggers), mocks or simple fakes are fine.

A concrete example of why fakes catch bugs that mocks miss: suppose your ViewModel calls `repository.getUser(userId)` and you refactor it to call `repository.findUser(userId)` instead. With mocks, you'd have to update every test that mocked `getUser()` — the tests break even though the behavior is identical. With fakes, the tests continue working because the fake implements the entire interface — both `getUser()` and `findUser()` work.

Mock-based tests also tend to be more brittle because they're coupled to the order and frequency of method calls. A test that verifies `verify(repo).getUser("1")` will break if the ViewModel adds caching and only calls `getUser()` on the first load. A fake-based test that checks the final state doesn't care how many times the repository was called — it just verifies the result.

However, mocks shine for verifying side effects. If you need to verify that `analytics.track("purchase_completed")` was called exactly once with the right parameters, a mock is the right tool. Fakes for analytics (like the `FakeAnalytics` above) can also record events, but mocks provide richer verification APIs out of the box.

In Hilt-based testing, the same principle applies. When you replace dependencies with `@UninstallModules` or `@TestInstallIn`, you're injecting fakes into the Hilt graph. The fakes behave the same way whether they're used in unit tests (via constructor injection) or integration tests (via Hilt). This uniformity makes your test doubles reusable across testing levels.

```kotlin
// Fake — has real behavior, stores state
class FakeOrderRepository : OrderRepository {
    private val orders = mutableListOf<Order>()
    var shouldFailNextCall = false

    override suspend fun getOrders(): List<Order> {
        if (shouldFailNextCall) {
            shouldFailNextCall = false
            throw IOException("Simulated network error")
        }
        return orders.toList()
    }

    override suspend fun placeOrder(order: Order) {
        orders.add(order)
    }
}

// Test using fake — verifies actual behavior
@Test
fun `retries on network error`() = runTest {
    val fakeRepo = FakeOrderRepository()
    fakeRepo.shouldFailNextCall = true
    val viewModel = OrderViewModel(fakeRepo)

    viewModel.loadOrders()
    assertEquals(OrderState.Error, viewModel.state.value)

    // Second attempt succeeds
    viewModel.loadOrders()
    assertEquals(OrderState.Success(emptyList()), viewModel.state.value)
}
```

```kotlin
// Mock-based test (using MockK) — tests interactions, not behavior
@Test
fun `calls repository on load`() = runTest {
    val mockRepo = mockk<OrderRepository>()
    coEvery { mockRepo.getOrders() } returns listOf(Order("1"))

    val viewModel = OrderViewModel(mockRepo)
    viewModel.loadOrders()

    coVerify(exactly = 1) { mockRepo.getOrders() }
    // This test passes, but what if we add caching?
    // The test would break even though behavior is correct
}

// Fake-based test — tests behavior, not interactions
@Test
fun `loads orders from repository`() = runTest {
    val fakeRepo = FakeOrderRepository()
    fakeRepo.addOrder(Order("1"))

    val viewModel = OrderViewModel(fakeRepo)
    viewModel.loadOrders()

    assertEquals(listOf(Order("1")), viewModel.orders.value)
    // Doesn't care HOW many times repo was called
    // Only cares about the final result
}
```

```kotlin
// When mocks are the right choice — verifying side effects
@Test
fun `tracks purchase event on successful order`() = runTest {
    val fakeRepo = FakeOrderRepository()
    val mockAnalytics = mockk<Analytics>(relaxed = true)

    val viewModel = OrderViewModel(fakeRepo, mockAnalytics)
    viewModel.placeOrder(Order("1", total = 99.99))

    verify {
        mockAnalytics.track("purchase_completed", mapOf("total" to 99.99))
    }
}

// Alternative: use a recording fake instead of a mock
class RecordingAnalytics : Analytics {
    val events = mutableListOf<Pair<String, Map<String, Any>>>()

    override fun track(event: String, properties: Map<String, Any>) {
        events.add(event to properties)
    }
}

@Test
fun `tracks purchase event`() = runTest {
    val analytics = RecordingAnalytics()
    val viewModel = OrderViewModel(FakeOrderRepository(), analytics)
    viewModel.placeOrder(Order("1", total = 99.99))

    assertEquals("purchase_completed", analytics.events.first().first)
}
```

**Key takeaway:** Prefer fakes over mocks for core abstractions like repositories. Fakes have real behavior and catch bugs that interaction-based mocking misses. Reserve mocks for one-off dependencies where writing a full fake isn't worth the effort, or for verifying side effects.

### Lesson 7.3: Hilt Integration Tests with @UninstallModules

For integration tests and UI tests that need the full Hilt component hierarchy, use `@HiltAndroidTest`. This sets up Hilt's injection infrastructure in your test. To replace production dependencies with test fakes, use `@UninstallModules` to remove the production module and provide a test module with fake bindings.

The pattern is: annotate the test class with `@HiltAndroidTest`, add a `HiltAndroidRule`, uninstall the production module, define a test module with fake bindings, and inject the fakes into the test class so you can configure them. The order of test rules matters — `HiltAndroidRule` must come before `ActivityScenarioRule` or `ComposeTestRule`.

`@UninstallModules` removes the specified module from the Hilt graph for that test class. You then provide a replacement module (defined as an inner class of the test) that binds the same types to fake implementations. The fake implementations should use `@Inject constructor` so Hilt can create them and inject them into the test class itself.

One important detail: `@UninstallModules` works at the module level, not the binding level. If a production module provides 5 bindings and you only want to replace 1, you still have to uninstall the entire module and re-provide all 5 bindings in your test module. This can be tedious for large modules — it's one reason to keep production modules small and focused.

The test module pattern works for both instrumented tests (running on a device/emulator) and Robolectric tests. In both cases, Hilt sets up the component hierarchy and injects dependencies according to the test module's bindings. The difference is the test runner — `AndroidJUnit4` for instrumented tests, `RobolectricTestRunner` for local tests.

A common mistake is forgetting `hiltRule.inject()` in `@Before`. Without this call, `@Inject` fields in the test class remain uninitialized. Another mistake is defining the test module outside the test class — inner modules are automatically scoped to the test class, while top-level modules affect all tests.

```kotlin
@HiltAndroidTest
@UninstallModules(RepositoryModule::class)
class ProfileFeatureTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Module
    @InstallIn(SingletonComponent::class)
    abstract class TestModule {
        @Binds
        abstract fun bindUserRepo(fake: FakeUserRepository): UserRepository
    }

    @Inject
    lateinit var fakeRepo: FakeUserRepository

    @Before
    fun setup() {
        hiltRule.inject()
    }

    @Test
    fun showsUserProfile() {
        fakeRepo.addUser(User(id = "1", name = "Alice", email = "alice@example.com"))

        composeRule.onNodeWithText("Alice").assertIsDisplayed()
        composeRule.onNodeWithText("alice@example.com").assertIsDisplayed()
    }

    @Test
    fun showsErrorWhenUserNotFound() {
        // FakeUserRepository returns null for unknown IDs
        composeRule.onNodeWithText("User not found").assertIsDisplayed()
    }
}
```

```kotlin
// ❌ Common mistakes with @HiltAndroidTest

// Forgetting to call inject()
@HiltAndroidTest
class BrokenTest {
    @get:Rule val hiltRule = HiltAndroidRule(this)
    @Inject lateinit var repo: UserRepository

    @Test
    fun test() {
        // repo is NOT injected! UninitializedPropertyAccessException
        repo.getUser("1")
    }
}

// Wrong rule order
@HiltAndroidTest
class WrongOrderTest {
    @get:Rule(order = 1) // Should be 0!
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 0) // Should be 1!
    val composeRule = createAndroidComposeRule<MainActivity>()
    // Compose rule runs before Hilt is set up → crash
}
```

```kotlin
// Testing with Compose and Hilt
@HiltAndroidTest
@UninstallModules(OrderModule::class)
class OrderScreenTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Module
    @InstallIn(SingletonComponent::class)
    abstract class TestModule {
        @Binds abstract fun bindOrderRepo(fake: FakeOrderRepository): OrderRepository
    }

    @Inject lateinit var fakeRepo: FakeOrderRepository

    @Before
    fun setup() {
        hiltRule.inject()
        fakeRepo.addOrder(Order("1", "Laptop", 999.99))
        fakeRepo.addOrder(Order("2", "Mouse", 49.99))
    }

    @Test
    fun displaysOrderList() {
        composeRule.onNodeWithText("Laptop").assertIsDisplayed()
        composeRule.onNodeWithText("Mouse").assertIsDisplayed()
    }

    @Test
    fun displaysEmptyStateWhenNoOrders() {
        fakeRepo.clear()
        composeRule.onNodeWithText("No orders yet").assertIsDisplayed()
    }
}
```

**Key takeaway:** Use `@HiltAndroidTest` + `@UninstallModules` for integration tests that need the full Hilt graph with fake dependencies. Unit tests should use plain constructor injection without Hilt. Remember to call `hiltRule.inject()` and set rule order correctly.

### Lesson 7.4: TestInstallIn — Global Test Replacements

When you want to replace a production binding for all test classes (not just one), use `@TestInstallIn`. This replaces a production module globally in the test build — no need for `@UninstallModules` on every test class. Define it once in your `androidTest` source set and it applies everywhere.

`@TestInstallIn` is useful for cross-cutting concerns like analytics (you never want real analytics in tests), crash reporting, or network clients. Define the test module in your `androidTest` source set, and it automatically replaces the production module.

The difference between `@UninstallModules` and `@TestInstallIn` is scope. `@UninstallModules` is per-test-class — each test class specifies which modules to remove. `@TestInstallIn` is global — it replaces the production module for every test class in the test build. Use `@TestInstallIn` for dependencies that should always be faked (analytics, crash reporting). Use `@UninstallModules` for dependencies that need different fakes in different tests (repositories with specific test data).

One caveat: `@TestInstallIn` can't be overridden per-test-class. If you globally replace `AnalyticsModule` with `TestAnalyticsModule`, every test class gets `FakeAnalytics`. If one test class needs a different analytics fake, you can't use `@UninstallModules` to override the `@TestInstallIn` — the replacement is permanent for the test build.

In practice, most projects use `@TestInstallIn` for 3-5 modules (analytics, crash reporting, feature flags, remote config) and `@UninstallModules` for test-specific replacements (repositories, APIs). This combination gives you a clean baseline where non-essential services are always faked, with per-test customization where needed.

```kotlin
// In androidTest source set — replaces AnalyticsModule globally
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [AnalyticsModule::class]
)
abstract class TestAnalyticsModule {
    @Binds
    abstract fun bindAnalytics(fake: FakeAnalytics): Analytics
}

class FakeAnalytics @Inject constructor() : Analytics {
    val events = mutableListOf<Pair<String, Map<String, Any>>>()

    override fun track(event: String, properties: Map<String, Any>) {
        events.add(event to properties)
    }

    override fun identify(userId: String) { /* no-op */ }
}

// Now ALL @HiltAndroidTest classes automatically get FakeAnalytics
// No @UninstallModules needed
```

```kotlin
// Common @TestInstallIn replacements
// 1. Analytics — never send real events in tests
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [AnalyticsModule::class],
)
abstract class TestAnalyticsModule {
    @Binds abstract fun bind(fake: FakeAnalytics): Analytics
}

// 2. Crash reporting — never report crashes in tests
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [CrashReportingModule::class],
)
abstract class TestCrashModule {
    @Binds abstract fun bind(fake: NoOpCrashReporter): CrashReporter
}

// 3. Feature flags — predictable flag values in tests
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [FeatureFlagModule::class],
)
object TestFeatureFlagModule {
    @Provides @Singleton
    fun provideFeatureFlags(): FeatureFlags =
        FixedFeatureFlags(allEnabled = true)
}
```

```kotlin
// Combining @TestInstallIn (global) with @UninstallModules (per-test)
// Global: analytics always faked via @TestInstallIn
// Per-test: repository faked via @UninstallModules

@HiltAndroidTest
@UninstallModules(UserRepositoryModule::class) // Only this test
class ProfileTest {
    @Module
    @InstallIn(SingletonComponent::class)
    abstract class TestModule {
        @Binds abstract fun bind(fake: FakeUserRepository): UserRepository
    }

    @Inject lateinit var fakeRepo: FakeUserRepository
    @Inject lateinit var fakeAnalytics: FakeAnalytics // From @TestInstallIn

    @Before
    fun setup() {
        hiltRule.inject()
        fakeRepo.addUser(User("1", "Alice"))
    }
}
```

**Key takeaway:** Use `@TestInstallIn` for dependencies you always want to fake in tests — analytics, crash reporting, remote config. It replaces the production module globally so you don't need `@UninstallModules` on every test class. Use `@UninstallModules` for per-test-class replacements.

### Lesson 7.5: Testing Dispatchers with Hilt

Testing coroutine-based code requires controlling dispatchers. The standard pattern is to inject dispatchers through Hilt qualifiers and replace them with `StandardTestDispatcher` or `UnconfinedTestDispatcher` in tests. This gives your tests deterministic control over coroutine execution.

For unit tests, just pass the test dispatcher directly — no Hilt needed. For integration tests, provide a test module that replaces the dispatcher bindings. `UnconfinedTestDispatcher` executes coroutines eagerly (immediately), while `StandardTestDispatcher` requires explicit advancement. Use `StandardTestDispatcher` when you need to test intermediate states (loading → success) and `UnconfinedTestDispatcher` for simpler tests.

The pattern works with both `@UninstallModules` (per-test) and `@TestInstallIn` (global). For most projects, globally replacing dispatchers with `@TestInstallIn` is the right choice — you always want test dispatchers in tests.

A common mistake is not replacing dispatchers in tests, which causes tests to depend on real thread scheduling. This makes tests flaky — they pass on fast machines and fail on slow CI runners. Injectable dispatchers eliminate this flakiness entirely.

Another mistake is using `Dispatchers.setMain()` as a workaround instead of injecting dispatchers. While `Dispatchers.setMain()` works for ViewModel tests, it only replaces the Main dispatcher. If your code uses `Dispatchers.IO` or `Dispatchers.Default`, those still use real threads. Injecting all dispatchers through Hilt gives you complete control.

```kotlin
// Unit test — pass test dispatcher directly
class UserViewModelTest {
    @Test
    fun `loads users on init`() = runTest {
        val testDispatcher = StandardTestDispatcher(testScheduler)
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(User("1", "Alice"))

        val viewModel = UserViewModel(
            userRepo = fakeRepo,
            ioDispatcher = testDispatcher,
        )

        // Advance past the initial load
        advanceUntilIdle()

        assertEquals(
            listOf(User("1", "Alice")),
            viewModel.users.value
        )
    }
}

// Integration test — replace dispatchers via Hilt
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [DispatcherModule::class]
)
object TestDispatcherModule {
    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = UnconfinedTestDispatcher()

    @Provides
    @MainDispatcher
    fun provideMainDispatcher(): CoroutineDispatcher = UnconfinedTestDispatcher()

    @Provides
    @DefaultDispatcher
    fun provideDefaultDispatcher(): CoroutineDispatcher = UnconfinedTestDispatcher()
}
```

```kotlin
// Testing intermediate states with StandardTestDispatcher
@Test
fun `shows loading then success`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val fakeRepo = FakeUserRepository()
    fakeRepo.addUser(User("1", "Alice"))

    val viewModel = UserViewModel(fakeRepo, testDispatcher)

    // Before advancing: should be loading
    assertEquals(UiState.Loading, viewModel.state.value)

    // After advancing: should be success
    advanceUntilIdle()
    assertEquals(UiState.Success(listOf(User("1", "Alice"))), viewModel.state.value)
}

// Simpler test with UnconfinedTestDispatcher (no advancement needed)
@Test
fun `loads users immediately`() = runTest {
    val fakeRepo = FakeUserRepository()
    fakeRepo.addUser(User("1", "Alice"))

    val viewModel = UserViewModel(fakeRepo, UnconfinedTestDispatcher())

    // No advanceUntilIdle() needed — coroutines execute immediately
    assertEquals(UiState.Success(listOf(User("1", "Alice"))), viewModel.state.value)
}
```

**Key takeaway:** Always inject dispatchers through qualifiers so you can replace them in tests. Use `StandardTestDispatcher` for deterministic control or `UnconfinedTestDispatcher` for simpler tests where ordering doesn't matter. Replace dispatchers globally with `@TestInstallIn`.

### Lesson 7.6: The Testing Pyramid with DI

DI should inform your testing strategy. Constructor-injected classes are trivially unit-testable — these form the base of your testing pyramid. Integration tests with `@HiltAndroidTest` verify that Hilt wiring works correctly. End-to-end tests verify the full app.

The vast majority of your tests should be unit tests using plain constructor injection. They're fast (milliseconds), reliable (no shared state), and easy to write (just constructors and assertions). Integration tests should focus on verifying that the DI graph is correctly wired and that components interact correctly. End-to-end tests are expensive — use them sparingly for critical user flows.

A practical ratio: 70% unit tests (constructor injection, fakes), 20% integration tests (Hilt graph wiring, UI interaction), 10% end-to-end tests (critical flows). The exact ratio varies by project, but the principle is consistent: maximize fast tests, minimize slow tests.

DI makes the testing pyramid work because it enables substitution at every level. Unit tests substitute fakes via constructors. Integration tests substitute fakes via Hilt modules. E2E tests run with real dependencies (or a staging backend). Each level tests different things — behavior, wiring, and real-world interaction.

One test that every project should have: a graph validation test. This is a simple Hilt integration test that creates the full graph and verifies that all bindings are resolvable. If any binding is missing, the test fails. This catches wiring errors that unit tests can't find.

```kotlin
// Level 1: Unit tests (most tests) — no Hilt
class CalculateTaxUseCaseTest {
    private val useCase = CalculateTaxUseCase(rate = 0.08)

    @Test
    fun `calculates tax correctly`() {
        assertEquals(8.0, useCase.calculate(100.0), 0.001)
    }
}

// Level 2: Integration tests (some tests) — Hilt wiring
@HiltAndroidTest
class CheckoutFlowTest {
    @get:Rule val hiltRule = HiltAndroidRule(this)

    @Inject lateinit var paymentRepo: PaymentRepository

    @Test
    fun `payment repository is correctly wired`() {
        hiltRule.inject()
        assertNotNull(paymentRepo)
    }
}

// Level 3: E2E tests (few tests) — full app
@HiltAndroidTest
class CriticalFlowTest {
    // Test the entire checkout flow from product selection to payment
}
```

```kotlin
// Graph validation test — catches wiring errors
@HiltAndroidTest
class HiltGraphTest {
    @get:Rule val hiltRule = HiltAndroidRule(this)

    // Inject every key type to verify the graph is complete
    @Inject lateinit var userRepo: UserRepository
    @Inject lateinit var orderRepo: OrderRepository
    @Inject lateinit var analytics: Analytics
    @Inject lateinit var authManager: AuthManager

    @Test
    fun `all bindings are resolvable`() {
        hiltRule.inject()
        // If any binding is missing, inject() throws
        assertNotNull(userRepo)
        assertNotNull(orderRepo)
        assertNotNull(analytics)
        assertNotNull(authManager)
    }
}
```

```kotlin
// Testing pyramid with DI
//
//         /\
//        /E2E\         10% — Critical user flows
//       /------\       Run on device/emulator
//      /Integr- \      20% — Hilt wiring, component interaction
//     / ation    \     @HiltAndroidTest + fakes
//    /------------\
//   / Unit Tests   \   70% — Pure Kotlin, constructor injection
//  / (no framework) \  Fakes, no Hilt, millisecond execution
// /==================\
```

**Key takeaway:** Unit tests with constructor injection form the base of your pyramid — fast, reliable, no framework. Integration tests verify DI wiring. E2E tests cover critical flows. DI makes all three levels easier by decoupling dependencies. Every project should have a graph validation test.

### Quiz: Testing with Dependency Injection

#### When should you use `@HiltAndroidTest` in your tests?

- ❌ For every test class that involves injected dependencies
- ❌ Only when testing `@HiltViewModel` classes
- ✅ For integration/UI tests that need the full Hilt dependency graph
- ❌ For unit tests that use fakes

> **Explanation:** `@HiltAndroidTest` sets up the full Hilt component hierarchy, which is only needed for instrumented/integration tests. Unit tests should just construct classes directly with fakes via constructor injection — no framework overhead needed.

#### What is the difference between `@UninstallModules` and `@TestInstallIn`?

- ❌ `@UninstallModules` works at compile time, `@TestInstallIn` works at runtime
- ✅ `@UninstallModules` replaces modules per-test-class, while `@TestInstallIn` replaces modules globally for all test classes
- ❌ `@TestInstallIn` can only replace singleton-scoped modules
- ❌ They're interchangeable — both do the same thing

> **Explanation:** `@UninstallModules` is per-test-class — each test class specifies which modules to remove. `@TestInstallIn` is global — define it once in your test source set and it replaces the production module for all test classes automatically.

#### Why are fakes generally preferred over mocks for repositories?

- ❌ Fakes run faster than mocks
- ❌ Mocks don't work with Kotlin coroutines
- ✅ Fakes have real behavior and catch bugs that interaction-based mocking misses
- ❌ Mocks require additional Gradle dependencies

> **Explanation:** A fake repository with an in-memory `Map` actually stores and retrieves data, catching real bugs like incorrect query logic. Mocks only verify that methods were called, missing behavioral issues. Fakes also make tests more readable and less brittle.

### Coding Challenge: Hilt Test with Fake Replacement

Write a Hilt integration test for a `CartActivity` that replaces the real `CartRepository` with a `FakeCartRepository` that returns a predefined list of cart items.

#### Solution

```kotlin
class FakeCartRepository @Inject constructor() : CartRepository {
    private val items = mutableListOf<CartItem>()

    fun setItems(cartItems: List<CartItem>) {
        items.clear()
        items.addAll(cartItems)
    }

    override suspend fun getItems(): List<CartItem> = items
    override suspend fun addItem(item: CartItem) { items.add(item) }
    override suspend fun removeItem(id: String) { items.removeAll { it.id == id } }
}

@HiltAndroidTest
@UninstallModules(CartModule::class)
class CartActivityTest {

    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    @Module
    @InstallIn(SingletonComponent::class)
    abstract class TestCartModule {
        @Binds
        abstract fun bindCartRepository(fake: FakeCartRepository): CartRepository
    }

    @Inject
    lateinit var fakeRepo: FakeCartRepository

    @Before
    fun setup() {
        hiltRule.inject()
        fakeRepo.setItems(
            listOf(
                CartItem(id = "1", name = "Keyboard", price = 79.99),
                CartItem(id = "2", name = "Mouse", price = 49.99),
            )
        )
    }

    @Test
    fun displaysCartItems() {
        // Launch CartActivity and verify "Keyboard" and "Mouse" appear in the UI
    }

    @Test
    fun displaysCorrectTotal() {
        // Verify that the total shows 129.98
    }
}
```

The test uninstalls the production `CartModule` and replaces it with `TestCartModule` that binds `FakeCartRepository`. The fake is also `@Inject`-able so Hilt can inject it into the test class itself, letting you configure test data before launching the Activity.


---

## Module 8: Alternatives — Koin and Manual DI

### Lesson 8.1: Koin Setup and Basics

Koin takes a completely different approach from Hilt. There's no code generation, no annotation processing, no compile-time graph validation. Instead, you define your dependencies in Kotlin DSL blocks at runtime. The tradeoff is simplicity versus safety — Koin is faster to set up but catches missing bindings only when the code runs, not when it compiles.

Koin is popular in Kotlin Multiplatform projects because it has no platform-specific code generation requirements. It works identically on Android, iOS, desktop, and server-side Kotlin. For small projects or prototypes where compile-time safety is less critical, Koin's simplicity is attractive. Setup takes minutes, not the 30+ minutes of Hilt Gradle configuration.

The core concepts map directly to Hilt: `single { }` is like `@Provides @Singleton`, `factory { }` is like an unscoped `@Provides`, `viewModel { }` provides a ViewModel, and `get()` resolves a dependency from the graph. The key difference is that `get()` is a runtime lookup — if the type isn't registered, you get a runtime exception.

Koin's DSL is pure Kotlin — no annotations, no generated code. This makes it easy to understand and debug. You can set breakpoints in your module definitions, step through dependency resolution, and inspect the graph at runtime. With Hilt, the generated code is harder to debug because it's auto-generated and often minified.

However, Koin's runtime resolution has a real cost. Missing bindings, wrong scope configurations, and circular dependencies are only discovered when the code runs. In production, this means a missing binding in an error-handling path might not be discovered until a real user triggers that error. Hilt catches all of these at compile time.

The performance characteristics are different too. Koin resolves dependencies at runtime using reflection-like type lookups. Hilt generates direct constructor calls at compile time. For most apps, the runtime performance difference is negligible, but in performance-critical paths (like RecyclerView item creation), Hilt's generated code is measurably faster.

In terms of generated code comparison: Hilt generates factory classes, component classes, and module metadata. Koin generates nothing — it's pure runtime. Metro generates code directly into IR. Each approach has different tradeoffs for build time vs. runtime performance vs. safety.

```kotlin
// Koin module definition — pure Kotlin DSL
val networkModule = module {
    single {
        OkHttpClient.Builder()
            .addInterceptor(HttpLoggingInterceptor())
            .build()
    }
    single {
        Retrofit.Builder()
            .baseUrl("https://api.yourapp.com/")
            .client(get())
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
    }
    single<UserApi> { get<Retrofit>().create(UserApi::class.java) }
}

val repositoryModule = module {
    single<UserRepository> { UserRepositoryImpl(api = get(), dao = get()) }
}

val viewModelModule = module {
    viewModel { ProfileViewModel(userRepo = get()) }
}

// Start Koin in Application
class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin {
            androidContext(this@MyApp)
            modules(networkModule, repositoryModule, viewModelModule)
        }
    }
}

// Usage in Fragment
class ProfileFragment : Fragment() {
    private val viewModel: ProfileViewModel by viewModel()
}
```

```kotlin
// Hilt vs Koin comparison — same functionality

// Hilt: compile-time validated, annotation-driven
@Module @InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder().baseUrl("...").client(client).build()
}
// Missing binding → compile error

// Koin: runtime resolved, DSL-driven
val networkModule = module {
    single { Retrofit.Builder().baseUrl("...").client(get()).build() }
}
// Missing binding → runtime crash: NoBeanDefFoundException
```

```kotlin
// Koin's runtime error (what happens when a binding is missing)
// org.koin.core.error.NoBeanDefFoundException:
// No definition found for type 'com.app.data.UserDao'.
// Check your Modules configuration and add missing type and/or qualifier!
//
// This only happens when getUser() is called, not at app startup
// If getUser() is in a rarely-used code path, the bug ships to production
```

```kotlin
// Koin for KMP — works on all platforms
// commonMain
val commonModule = module {
    single<UserRepository> { UserRepositoryImpl(get()) }
    single { CreateUserUseCase(get()) }
}

// androidMain
val androidModule = module {
    single<Database> { AndroidDatabase(get()) }
}

// iosMain
val iosModule = module {
    single<Database> { IOSDatabase() }
}
```

**Key takeaway:** Koin uses a runtime DSL with no code generation. It's simpler to set up but catches missing bindings at runtime, not compile time. Good for KMP projects and prototypes, but risky for large production apps. The tradeoff is simplicity versus safety.

### Lesson 8.2: Koin Scoping and Qualifiers

Koin supports scoping through `scope` blocks and qualifiers through `named()`. Scopes are tied to lifecycle owners — you can scope dependencies to an Activity, Fragment, or custom scope. Qualifiers distinguish same-type bindings, similar to Hilt's `@Qualifier`.

The key difference from Hilt is that scope violations aren't caught at compile time. If you access a scope that's already been closed, you get a runtime exception. This means you need to be more careful about lifecycle management — Hilt handles this automatically through its component hierarchy.

Koin qualifiers use `named("string")` — they're string-based, not type-safe. A typo in the qualifier string compiles fine but fails at runtime. This is one of the fundamental safety differences between Koin and Hilt. Hilt's custom `@Qualifier` annotations catch typos at compile time.

Koin's scoping model is manual. You create scopes with `createScope()` and close them with `close()`. If you forget to close a scope, the scoped dependencies leak. Hilt's scopes are tied to Android lifecycle components and are automatically managed — no manual creation or cleanup needed.

For ViewModel scoping, Koin provides `viewModel { }` which automatically scopes to the ViewModel lifecycle. This is equivalent to Hilt's `@HiltViewModel`. The ViewModel is created when first requested and cleared when the lifecycle owner is destroyed.

```kotlin
val appModule = module {
    // Singleton — lives for the entire app
    single { AuthManager(tokenStore = get()) }

    // Qualified bindings
    single(named("io")) { Dispatchers.IO }
    single(named("main")) { Dispatchers.Main }

    // Scoped to a custom scope
    scope<CheckoutActivity> {
        scoped { PaymentProcessor(gateway = get()) }
        viewModel { CheckoutViewModel(paymentProcessor = get()) }
    }
}

// Usage with qualifier
class UserRepository(
    private val api: UserApi,
    private val ioDispatcher: CoroutineDispatcher,
) {
    companion object {
        fun create(koin: Koin): UserRepository {
            return UserRepository(
                api = koin.get(),
                ioDispatcher = koin.get(named("io"))
            )
        }
    }
}
```

```kotlin
// Koin scoping — manual lifecycle management
class CheckoutActivity : AppCompatActivity(), KoinScopeComponent {
    override val scope: Scope by activityScope()

    // Dependencies scoped to this Activity
    private val paymentProcessor: PaymentProcessor by inject()

    override fun onDestroy() {
        super.onDestroy()
        // Must close scope manually in some cases!
        // activityScope() handles this automatically, but custom scopes don't
    }
}
```

```kotlin
// ❌ Koin qualifier typo — compiles fine, crashes at runtime
val module = module {
    single(named("io_dispatcher")) { Dispatchers.IO }
}

class MyRepo : KoinComponent {
    private val dispatcher: CoroutineDispatcher by inject(named("io_dispatcer"))
    // Typo! "dispatcer" instead of "dispatcher"
    // Crashes: NoBeanDefFoundException at runtime
}

// Compare with Hilt custom qualifier — typo caught at compile time
// @IoDispatcer → Unresolved reference (compile error)
```

**Key takeaway:** Koin supports scoping and qualifiers through its DSL, but violations are runtime errors. Hilt catches these at compile time. If you're using Koin, write thorough integration tests to catch missing or mis-scoped bindings. Consider `verify()` for additional safety.

### Lesson 8.3: Koin Verify — Compile-Time-Like Checks

Koin 3.4+ introduced `verify()` — a function that checks your module definitions at test time. While not true compile-time validation, it gives you a safety net by verifying that all bindings can be resolved before the app ships. It's the closest Koin gets to Hilt's compile-time graph validation.

You write a unit test that calls `verify()` on each Koin module. If any `get()` call would fail at runtime, the test fails. This doesn't catch everything (it can't verify lifecycle scoping or conditional resolution), but it catches the most common error — missing bindings.

The `extraTypes` parameter tells `verify()` about types that are provided externally (like Android's `Context`). Without specifying these, `verify()` would report them as missing. List all externally-provided types to avoid false positives.

`verify()` should be part of your CI pipeline. Run it on every PR to catch missing bindings before they reach production. It's not as good as compile-time validation, but it's significantly better than nothing. In practice, `verify()` catches 80% of the binding errors that Hilt would catch at compile time.

```kotlin
class KoinModuleVerificationTest {
    @Test
    fun `verify all Koin modules`() {
        networkModule.verify(
            extraTypes = listOf(
                android.content.Context::class,
                android.app.Application::class,
            )
        )
        repositoryModule.verify()
        viewModelModule.verify()
    }
}
```

```kotlin
// What verify() catches
// ✅ Missing bindings (most common error)
// ✅ Wrong type references in get()
// ✅ Missing qualifier matches
// ❌ Scope lifecycle violations
// ❌ Conditional resolution paths
// ❌ Thread safety issues
// ❌ Runtime-dependent bindings (get() inside if/else)
```

```kotlin
// Running verify() in CI
// Add to your CI pipeline:
// ./gradlew :app:testDebugUnitTest --tests "*KoinModuleVerificationTest*"
// This runs in seconds and catches the most common Koin errors
```

**Key takeaway:** Use `verify()` in tests to catch missing Koin bindings before shipping. It's not as good as compile-time validation, but it's the best safety net Koin offers. Run it in CI on every PR.

### Lesson 8.4: Manual DI for Libraries and SDKs

Manual DI — a container class that wires dependencies together — is the right choice for libraries and SDKs. Adding Hilt or Koin as a transitive dependency to your library forces consumers to use the same framework and version. Manual DI has zero external dependencies. This is a critical design decision for library authors.

The pattern is a single entry point class (often called `Client` or `SDK`) that takes configuration parameters and internally constructs all dependencies. Consumers create the entry point and use it — they never see the internal dependency wiring. The builder pattern provides a clean, fluent API for configuration.

For testability, the entry point class should accept interfaces for its core dependencies. This lets consumers (and your own tests) substitute implementations. The builder provides defaults for everything, so basic usage requires minimal configuration.

Manual DI for libraries follows the same principles as framework-based DI: constructor injection internally, interface abstraction for swappable components, lazy initialization for expensive resources. The difference is that you manage the container yourself instead of using a framework.

One advantage of manual DI for libraries is that it forces you to think carefully about your public API. With Hilt, it's easy to expose too many internal types through the graph. With manual DI, you explicitly choose what's public (the builder and its configuration options) and what's internal (the dependency wiring).

```kotlin
// Public API — consumers only see this
class PaymentSdk private constructor(
    private val processor: PaymentProcessor,
    private val validator: PaymentValidator,
) {
    suspend fun processPayment(amount: Double, currency: String): PaymentResult {
        validator.validate(amount, currency)
        return processor.charge(amount, currency)
    }

    class Builder(private val apiKey: String) {
        private var environment: Environment = Environment.PRODUCTION
        private var timeout: Long = 30_000L

        fun environment(env: Environment) = apply { this.environment = env }
        fun timeout(millis: Long) = apply { this.timeout = millis }

        fun build(): PaymentSdk {
            val httpClient = OkHttpClient.Builder()
                .connectTimeout(timeout, TimeUnit.MILLISECONDS)
                .build()

            val api = Retrofit.Builder()
                .baseUrl(environment.baseUrl)
                .client(httpClient)
                .addConverterFactory(MoshiConverterFactory.create())
                .build()
                .create(PaymentApi::class.java)

            val processor = PaymentProcessor(api, apiKey)
            val validator = PaymentValidator()

            return PaymentSdk(processor, validator)
        }
    }
}

// Consumer usage — no DI framework leaked
val paymentSdk = PaymentSdk.Builder("sk_live_...")
    .environment(Environment.PRODUCTION)
    .timeout(15_000L)
    .build()
```

```kotlin
// Testing a library built with manual DI
@Test
fun `processes payment successfully`() = runTest {
    val fakeApi = FakePaymentApi(result = PaymentResult.Success)

    // Internal constructor for testing (or use a test builder)
    val sdk = PaymentSdk(
        processor = PaymentProcessor(fakeApi, "test_key"),
        validator = PaymentValidator(),
    )

    val result = sdk.processPayment(99.99, "USD")
    assertEquals(PaymentResult.Success, result)
}
```

```kotlin
// Why manual DI for libraries — avoiding transitive dependency issues
// ❌ Library with Hilt dependency
// compile("my-payment-sdk:1.0") // Pulls in Hilt 2.48
// Your app uses Hilt 2.51 → version conflict!
// Your app uses Koin → forced to add Hilt just for the SDK!

// ✅ Library with manual DI
// compile("my-payment-sdk:1.0") // Zero DI framework dependencies
// Works with any DI framework (or none)
// No version conflicts
```

**Key takeaway:** Use manual DI for libraries and SDKs to avoid leaking DI framework dependencies to consumers. A builder pattern provides a clean public API while internally managing the dependency graph. This prevents version conflicts and framework coupling.

### Lesson 8.5: Koin to Hilt Migration Path

If you're on Koin and want to move to Hilt, the migration is mechanical. Koin's `module { }` DSL maps to Hilt's `@Module`/`@Provides`/`@Binds`. Koin's `single { }` maps to `@Singleton`. Koin's `get()` is replaced by Hilt's automatic resolution. Koin's `viewModel { }` maps to `@HiltViewModel`.

The biggest change is mindset: Koin's runtime resolution (`get()` looks up the type at runtime) is replaced by Hilt's compile-time resolution (dependencies are wired during compilation). You'll discover missing bindings that Koin was hiding — classes that happened to be in the graph but weren't explicitly declared.

The migration can be done incrementally. Start by converting one feature module at a time. Create Hilt modules alongside Koin modules, and gradually move injection sites from Koin to Hilt. Remove Koin modules as their bindings are absorbed into Hilt modules. The final step is removing `startKoin` from the Application class.

Common issues during migration: Koin's `get()` calls hidden inside factory lambdas need to become explicit constructor parameters. Koin's `named()` qualifiers need to become custom `@Qualifier` annotations. Koin's `scope` blocks need to be mapped to Hilt's component hierarchy. And classes that Koin resolved lazily need `@Inject constructor` added.

The compile-time validation Hilt provides will likely catch several latent bugs that Koin was silently ignoring. These are typically missing bindings in rarely-used code paths, scope mismatches, or duplicate bindings. Fixing these during migration improves code quality.

```kotlin
// Koin
val appModule = module {
    single<UserApi> {
        Retrofit.Builder()
            .baseUrl("https://api.app.com/")
            .build()
            .create(UserApi::class.java)
    }
    single<UserRepository> { UserRepositoryImpl(get()) }
    viewModel { ProfileViewModel(get()) }
}

class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin { androidContext(this@MyApp); modules(appModule) }
    }
}

class ProfileFragment : Fragment() {
    private val viewModel: ProfileViewModel by viewModel()
}
```

```kotlin
// Equivalent Hilt
@HiltAndroidApp
class MyApp : Application()

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideUserApi(): UserApi =
        Retrofit.Builder()
            .baseUrl("https://api.app.com/")
            .build()
            .create(UserApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    @Singleton
    abstract fun bindUserRepository(impl: UserRepositoryImpl): UserRepository
}

class UserRepositoryImpl @Inject constructor(
    private val api: UserApi,
) : UserRepository

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,
) : ViewModel()

@AndroidEntryPoint
class ProfileFragment : Fragment() {
    private val viewModel: ProfileViewModel by viewModels()
}
```

```kotlin
// Migration checklist
// 1. Add Hilt Gradle plugin and KSP dependency
// 2. Add @HiltAndroidApp to Application class
// 3. Convert Koin modules to Hilt @Module classes
//    - single { } → @Provides @Singleton
//    - factory { } → @Provides (no scope)
//    - viewModel { } → @HiltViewModel
//    - get() → @Inject constructor parameters
//    - named("x") → custom @Qualifier annotations
// 4. Add @AndroidEntryPoint to Activities/Fragments
// 5. Change by viewModel() (Koin) → by viewModels() (AndroidX)
// 6. Remove startKoin { } from Application
// 7. Remove Koin dependencies from build.gradle
```

The key changes: `startKoin {}` → `@HiltAndroidApp`, `module {}` → `@Module` classes with `@Provides`/`@Binds`, `by viewModel()` (Koin) → `by viewModels()` (AndroidX + Hilt), and all implementations get `@Inject constructor`.

**Key takeaway:** Koin-to-Hilt migration is mechanical — DSL blocks become annotated classes. The real benefit is moving from runtime resolution to compile-time safety. Expect to fix some bindings that Koin was silently ignoring. Migrate incrementally, one feature at a time.

### Quiz: Alternatives — Koin and Manual DI

#### What is the main disadvantage of Koin compared to Hilt?

- ❌ Koin doesn't support ViewModel injection
- ❌ Koin requires annotation processing
- ✅ Koin resolves dependencies at runtime, so missing bindings crash at runtime instead of failing at compile time
- ❌ Koin doesn't work with Kotlin coroutines

> **Explanation:** Koin uses a service locator pattern and resolves dependencies at runtime via `get()`. If a binding is missing, you won't know until the app crashes. Hilt validates the entire dependency graph at compile time, catching errors before the app ever runs.

#### When is manual DI (no framework) the best choice?

- ❌ For apps with 50+ screens and complex navigation
- ❌ When you need scoped dependencies tied to Activity lifecycle
- ✅ For libraries and SDKs where you don't want to leak DI framework dependencies to consumers
- ❌ When you need compile-time graph validation

> **Explanation:** Libraries and SDKs should use manual DI to avoid forcing consumers to adopt a specific DI framework. A builder pattern provides a clean API while internally managing dependencies.

#### What does Koin's `verify()` function do?

- ❌ It validates the dependency graph at compile time
- ✅ It checks at test time that all `get()` calls can be resolved, catching missing bindings before shipping
- ❌ It generates code for missing bindings
- ❌ It converts Koin modules to Hilt modules

> **Explanation:** `verify()` runs your module definitions and checks that every dependency can be resolved. It's not compile-time validation, but it catches the most common Koin error — missing bindings — in your test suite before the app ships.

### Coding Challenge: Build a Manual DI Container

Create a manual DI container for a small notes app with `NotesRepository`, `NotesApi`, and database access. The container should use lazy initialization and provide a clean API.

#### Solution

```kotlin
class AppContainer(private val context: Context) {
    private val retrofit by lazy {
        Retrofit.Builder()
            .baseUrl("https://api.notes.app/")
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
    }

    private val database by lazy {
        Room.databaseBuilder(context, NotesDatabase::class.java, "notes.db")
            .build()
    }

    val notesApi: NotesApi by lazy {
        retrofit.create(NotesApi::class.java)
    }

    val notesDao: NotesDao by lazy {
        database.notesDao()
    }

    val notesRepository: NotesRepository by lazy {
        NotesRepositoryImpl(
            api = notesApi,
            dao = notesDao,
            ioDispatcher = Dispatchers.IO,
        )
    }

    fun createNotesViewModel(): NotesViewModel {
        return NotesViewModel(notesRepository)
    }
}

class MyApp : Application() {
    val container by lazy { AppContainer(this) }
}

// Usage in Activity
class NotesActivity : AppCompatActivity() {
    private val viewModel by lazy {
        (application as MyApp).container.createNotesViewModel()
    }
}
```

Manual DI works well here — the `AppContainer` uses `lazy` for singleton-like behavior, provides a clean API, and has zero framework dependencies. The tradeoff is no compile-time validation and manual lifecycle management.


---

## Module 9: Metro — Next-Generation Kotlin-Native DI

### Lesson 9.1: What Metro Is and Why It Exists

Metro is a compile-time dependency injection framework created by Zac Sweers, implemented entirely as a Kotlin compiler plugin. It draws from three existing tools — Dagger's generated code approach and runtime patterns, kotlin-inject's Kotlin-native API design, and Anvil's aggregation model — and unifies them into a single, cohesive solution. It's not a wrapper around Dagger. It's a ground-up reimplementation that targets K2 and Kotlin Multiplatform from day one.

The key architectural difference is that Metro doesn't use annotation processing at all. Dagger uses KAPT or KSP to read your source code, generate new files, and compile those files in a separate pass. Metro operates inside the Kotlin compiler itself — it uses FIR (Frontend Intermediate Representation) for error reporting and diagnostics, and both FIR and IR (Intermediate Representation) for code generation. It generates code directly into the compiler's intermediate representation, skipping the source-generation round-trip entirely.

This is why Metro can do things that source-generation tools physically cannot. It can read `private` declarations, use default parameter values as optional dependencies, and inject into `private` properties. It's not limited by what's visible from outside a file — it's inside the compiler. Cash App migrated their entire 1,500-module Android codebase from Dagger and Anvil to Metro, and multiple other companies (Freeletics, BandLab) have followed.

Metro exists because Dagger was designed for Java and carries Java's limitations into the Kotlin world. Dagger can't see Kotlin default parameters, can't inject private members, requires Java-compatible annotation processing, and generates Java-style code. Metro was designed from scratch for Kotlin, leveraging Kotlin's type system, default parameters, sealed classes, and multiplatform capabilities.

The Anvil heritage is equally important. Anvil (also created by the Dagger team at Square/Cash App) solved the "God module" problem by letting bindings be declared where implementations live. Metro integrates this aggregation model as a first-class feature through `@ContributesBinding` and `@ContributesTo`. In Dagger, you needed both Dagger and Anvil as separate tools. In Metro, they're unified.

For existing Dagger projects, Metro offers an interop mode that understands Dagger and Anvil annotations. This enables incremental migration — you can have some modules on Metro annotations and others still on Dagger, all composing into the same graph. Cash App used this approach to migrate their 1,500-module codebase incrementally without a big-bang rewrite.

```kotlin
// Metro setup — just a Gradle plugin, no annotation processor
plugins {
    id("dev.zacsweers.metro") version "<version>"
}
// That's it. No kapt, no KSP, no additional dependencies.
```

```kotlin
// Why Metro can do things Dagger can't
// 1. Read private declarations (compiler plugin has full visibility)
// 2. Use default parameter values as optional bindings
// 3. Inject into private properties
// 4. Generate code in a single compiler pass (no round-trip)
// 5. Work on all Kotlin targets (JVM, JS, WASM, Native)

// Example: default parameters as optional dependencies
@Inject
class ImageLoader(
    private val httpClient: HttpClient,
    private val memoryCache: MemoryCache,
    private val logger: Logger = ConsoleLogger(), // Optional! Uses default if not in graph
)
// In Dagger: impossible. Annotation processors can't see default values.
// In Metro: works naturally. The compiler sees everything.
```

```kotlin
// Metro's heritage
// From Dagger: compile-time validation, Provider<T> pattern, graph resolution
// From kotlin-inject: Kotlin-native API, KMP support, @DependencyGraph
// From Anvil: @ContributesBinding, @ContributesTo, decentralized modules
// Result: one tool that replaces three
```

**Key takeaway:** Metro is a Kotlin compiler plugin that replaces Dagger, Hilt, and Anvil. It operates inside the Kotlin compiler itself, generating code directly into IR — no annotation processing, no generated source files. It supports K2 and Kotlin Multiplatform natively.

### Lesson 9.2: Metro's Core API — @Inject, @Provides, @DependencyGraph

Metro's API will feel familiar if you've used Dagger. `@Inject` for constructor injection, `@Provides` for explicit bindings, `@DependencyGraph` instead of `@Component`. But the differences go deeper than naming.

Constructor injection uses `@Inject` on the class itself (not the constructor). Metro's compiler sees the annotation, resolves dependencies from the graph, and generates a factory. Default parameter values work as optional dependencies — if a binding doesn't exist in the graph, the default kicks in. This is impossible with annotation processing because Java/KSP processors can't see Kotlin's default values.

`@DependencyGraph` replaces Dagger's `@Component`. You declare an interface with accessor properties for the types you need, and Metro generates the implementation at compile time. For simple graphs, `createGraph<AppGraph>()` creates the graph directly. For graphs with runtime parameters, define a `@DependencyGraph.Factory`.

One key API difference: Metro doesn't have `@Module`. Instead, provider functions live in interfaces that the graph extends. This is cleaner — providers are part of the graph's type hierarchy, not separate module classes. You define an interface with `@Provides` functions and make your graph extend it. Metro merges the providers into the graph automatically.

The `@DependencyGraph.Factory` pattern replaces Dagger's `@Component.Builder` and `@Component.Factory`. It uses `fun interface` for clean Kotlin integration. Parameters annotated with `@Provides` are bound into the graph as dependencies available to all bindings.

For graph creation, Metro provides `createGraph<T>()` for simple graphs and `createGraphFactory<T>()` for graphs with runtime parameters. Both are top-level functions that return the generated implementation. The graph implementation is generated at compile time with the name `Metro${GraphName}`.

Metro validates the graph with the same rigor as Dagger — missing bindings, circular dependencies, and scope violations are compile errors. But Metro adds Kotlin-specific validation: nullable type mismatches, default parameter handling, and stricter scope placement rules.

```kotlin
// @Inject — annotate the class, not the constructor
@Inject
class UserRepository(
    private val api: ApiClient,
    private val database: UserDatabase,
    private val logger: Logger = ConsoleLogger(),  // Optional — default used if not in graph
)

// @Provides — for types you can't constructor-inject
interface NetworkProviders {
    @Provides
    fun provideHttpClient(): HttpClient = HttpClient()

    @Provides
    fun provideApiClient(httpClient: HttpClient): ApiClient =
        ApiClient(httpClient)
}

// @DependencyGraph — the root of the graph
@DependencyGraph
interface AppGraph : NetworkProviders {
    val userRepository: UserRepository
}

// Create the graph
val graph = createGraph<AppGraph>()
val repo = graph.userRepository
```

```kotlin
// Graph with runtime parameters via Factory
@DependencyGraph
interface AppGraph {
    val userRepository: UserRepository
    val paymentGateway: PaymentGateway

    @DependencyGraph.Factory
    fun interface Factory {
        fun create(
            @Provides apiKey: String,
            @Provides baseUrl: String,
        ): AppGraph
    }
}

val graph = createGraphFactory<AppGraph.Factory>()
    .create(apiKey = "key-123", baseUrl = "https://api.myapp.com")
```

```kotlin
// Metro vs Dagger API comparison

// Dagger: @Component + @Module
@Component(modules = [NetworkModule::class])
interface AppComponent {
    fun userRepository(): UserRepository
}
@Module
object NetworkModule {
    @Provides fun provideClient(): HttpClient = HttpClient()
}

// Metro: @DependencyGraph + provider interface
@DependencyGraph
interface AppGraph : NetworkProviders {
    val userRepository: UserRepository
}
interface NetworkProviders {
    @Provides fun provideClient(): HttpClient = HttpClient()
}
// No @Module annotation needed — providers are just interfaces
```

```kotlin
// Metro's Kotlin-native advantages
// 1. @Inject on class (not constructor) — cleaner syntax
@Inject class UserRepo(val api: UserApi) // Metro
class UserRepo @Inject constructor(val api: UserApi) // Dagger

// 2. Default parameters as optional bindings
@Inject class Config(
    val timeout: Long = 30_000L, // Used if Long not in graph
    val retries: Int = 3,        // Used if Int not in graph
)

// 3. Properties instead of functions in graph interface
@DependencyGraph
interface AppGraph {
    val userRepo: UserRepository // Property, not fun userRepo()
}
```

**Key takeaway:** Metro's core API mirrors Dagger's concepts with Kotlin-native enhancements. `@Inject` goes on the class, default parameters are optional bindings, `@DependencyGraph` replaces `@Component`. No `@Module` annotation — providers live in interfaces that the graph extends.

### Lesson 9.3: Scoping and Graph Hierarchy

Metro uses `@SingleIn` to scope bindings to a specific graph. When a binding is annotated with `@SingleIn(AppScope::class)`, Metro generates a `DoubleCheck`-backed provider that ensures lazy, thread-safe singleton behavior within that graph instance — the same approach Dagger uses internally.

For parent-child graph hierarchies, Metro uses `@GraphExtension` — similar to Dagger's subcomponents. A graph extension inherits all bindings from its parent and adds its own. The parent graph exposes the extension's factory, and you create child graphs with runtime parameters.

Metro enforces that scoped bindings match their graph's scope at compile time — a binding scoped to `UserScope` in an `AppScope` graph is a compile error. This is stricter than Dagger in some cases, but it catches scope mismatches that Dagger silently accepts. The strictness is intentional — Metro's philosophy is to catch errors early.

Scope markers in Metro are simple abstract classes with private constructors. They serve as type-safe labels — `AppScope`, `LoggedInScope`, `FeatureScope`. The actual scope lifetime is determined by the graph instance's lifecycle — when the graph is garbage collected, its scoped instances are too.

`@GraphExtension` creates a parent-child relationship between graphs. The child graph can access all of the parent's bindings but also has its own scope. This is useful for login sessions (create a `LoggedInGraph` when the user logs in, destroy it on logout), feature flows (create a `CheckoutGraph` for the checkout process), and multi-tenant apps (create a `TenantGraph` per tenant).

```kotlin
// Scoped binding — singleton within the AppScope graph
@SingleIn(AppScope::class)
@Inject
class AuthManager(
    private val tokenStore: TokenStore,
)

@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val authManager: AuthManager  // Same instance every time
    val loggedInGraphFactory: LoggedInGraph.Factory
}

// Graph extension — child graph with its own scope
@GraphExtension(LoggedInScope::class)
interface LoggedInGraph {
    val userProfile: UserProfile
    val feedRepository: FeedRepository

    @GraphExtension.Factory
    interface Factory {
        fun create(@Provides userId: String): LoggedInGraph
    }
}

// Usage
val appGraph = createGraph<AppGraph>()
val loggedInGraph = appGraph.loggedInGraphFactory.create(userId = "user-123")
val profile = loggedInGraph.userProfile
```

```kotlin
// Scope markers — simple abstract classes
abstract class AppScope private constructor()
abstract class LoggedInScope private constructor()
abstract class FeatureScope private constructor()

// ❌ Scope mismatch — compile error in Metro
@SingleIn(LoggedInScope::class)
@Inject
class UserProfile(private val api: UserApi)

@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val userProfile: UserProfile // ERROR: UserProfile is LoggedInScope, graph is AppScope
}
```

```kotlin
// Metro vs Dagger scoping comparison
// Dagger: @Singleton, @Reusable, custom scope annotations
@Singleton class AuthManager @Inject constructor(/* ... */)

// Metro: @SingleIn(Scope::class) — explicit scope marker
@SingleIn(AppScope::class) @Inject class AuthManager(/* ... */)

// Dagger: @Subcomponent for child graphs
@Subcomponent interface LoggedInComponent { /* ... */ }

// Metro: @GraphExtension for child graphs
@GraphExtension(LoggedInScope::class) interface LoggedInGraph { /* ... */ }
```

**Key takeaway:** `@SingleIn(Scope::class)` scopes bindings to a graph. `@GraphExtension` creates child graphs that inherit parent bindings. Metro validates scope consistency at compile time — mismatches are compile errors.

### Lesson 9.4: Anvil-Style Aggregation with @ContributesBinding

The feature that made Anvil indispensable for large projects was `@ContributesBinding` and `@ContributesTo` — the ability to declare bindings in the modules where they belong and have them automatically aggregated into the right graph. Metro carries this forward as a first-class feature.

With `@ContributesBinding`, you annotate an implementation class and Metro automatically binds it to its supertype in the specified scope's graph. No module file needed. The binding is declared where the implementation lives — in the feature module, not in a centralized God module. This scales perfectly for multi-module projects.

`@ContributesTo` works similarly for provider interfaces — Metro merges contributed interfaces into the graph automatically. Both annotations support `replaces` for test overrides and are repeatable for contributing to multiple scopes.

The aggregation model is what makes Metro practical for large projects. In a 500-module project, you can't have a central module file listing every binding — it would be thousands of lines and a merge conflict nightmare. With `@ContributesBinding`, each module declares its own bindings, and Metro aggregates them across the entire project at compile time.

The `replaces` parameter on `@ContributesBinding` is particularly useful for testing. You can define a fake implementation that replaces the production implementation in test graphs. This is Metro's equivalent of Hilt's `@TestInstallIn`.

```kotlin
// In :payments module — binding declared where implementation lives
@ContributesBinding(AppScope::class)
@Inject
class StripePaymentGateway(
    private val apiClient: ApiClient,
) : PaymentGateway

// In :analytics module
@ContributesBinding(AppScope::class)
@Inject
class MixpanelTracker(
    private val config: AnalyticsConfig,
) : AnalyticsTracker

// In :app module — both bindings are automatically included
@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val paymentGateway: PaymentGateway   // Resolved to StripePaymentGateway
    val tracker: AnalyticsTracker         // Resolved to MixpanelTracker
}

// Contributing provider interfaces
@ContributesTo(AppScope::class)
interface DatabaseProviders {
    @Provides
    fun provideDatabase(): AppDatabase = Room.databaseBuilder(/* ... */).build()
}
```

```kotlin
// Test replacement with @ContributesBinding(replaces = ...)
@ContributesBinding(AppScope::class, replaces = [StripePaymentGateway::class])
@Inject
class FakePaymentGateway : PaymentGateway {
    override suspend fun charge(amount: Double): PaymentResult =
        PaymentResult.Success
}
// In test builds, FakePaymentGateway replaces StripePaymentGateway
```

```kotlin
// Comparison: Hilt @Module vs Metro @ContributesBinding

// Hilt: centralized module file
@Module @InstallIn(SingletonComponent::class)
abstract class PaymentModule {
    @Binds abstract fun bind(impl: StripePaymentGateway): PaymentGateway
}
// Binding lives in a separate file from the implementation

// Metro: decentralized, binding lives with implementation
@ContributesBinding(AppScope::class)
@Inject
class StripePaymentGateway(/* ... */) : PaymentGateway
// No separate module file needed!

// In a 50-module project:
// Hilt: 50 module files + 50 implementation files = 100 files
// Metro: 50 implementation files (each has @ContributesBinding) = 50 files
```

**Key takeaway:** `@ContributesBinding` eliminates centralized module files. Bindings are declared where implementations live and automatically aggregated into the right graph. This scales well for multi-module projects — no God modules, no manual registration.

### Lesson 9.5: Metro's Build Performance

Metro's compiler plugin architecture delivers measurable build performance improvements. In a 500-module benchmark, Metro was 584% faster than Dagger KSP for ABI-breaking changes (17.5s vs 119.6s). For non-ABI changes, Metro and kotlin-inject were nearly identical at ~11.5s, while Dagger KAPT lagged at 23.2s.

These improvements come from two sources. First, Metro avoids the extra frontend compiler invocations that KAPT and KSP require to analyze sources and generate new ones. Second, generating directly to FIR/IR means the generated code doesn't need a separate compilation pass — it gets lowered directly into target platform code alongside your own code.

Real-world results confirm the benchmarks. Cash App reported ~59% faster incremental builds and 16% faster clean builds after migrating their 1,500-module codebase. Freeletics saw 40-55% faster ABI changes across 551 modules. BandLab measured 55% faster incremental builds on their 929-module project.

The ABI-breaking change performance is where Metro's architecture really shines. When you change a public interface in module A, KSP must re-process module A and all modules that depend on it (because their generated code might reference types from A). Metro avoids this cascade because its generated code is embedded in IR, not separate source files that need recompilation.

For small projects (under 20 modules), the build performance difference is negligible — both Dagger KSP and Metro compile in seconds. The performance advantage becomes significant at scale, where build times directly impact developer productivity.

```kotlin
// The performance comes from architecture:
//
// Dagger (KAPT) pipeline:
//   kotlinc → generate stubs → run annotation processor
//   → generate Java source → javac
//   = 3+ compiler invocations
//
// Dagger (KSP) pipeline:
//   kotlinc → run KSP processor → generate Kotlin source → kotlinc
//   = 2+ compiler invocations
//
// Metro pipeline:
//   kotlinc (with Metro plugin generating directly to IR)
//   = 1 compiler invocation
```

```kotlin
// Real-world migration results
//
// Cash App (1,500 modules):
//   Incremental builds: 59% faster
//   Clean builds: 16% faster
//
// Freeletics (551 modules):
//   ABI changes: 40-55% faster
//
// BandLab (929 modules):
//   Incremental builds: 55% faster
//
// These aren't synthetic benchmarks — they're real production codebases
```

**Key takeaway:** Metro is significantly faster than Dagger because it generates code inside the compiler in a single pass, eliminating the extra compilation steps that annotation processing requires. Production teams report 40-60% faster incremental builds.

### Lesson 9.6: Assisted Injection and Member Injection

Metro supports assisted injection for classes that need runtime arguments alongside injected dependencies. The pattern is similar to Dagger's `@AssistedInject` but with a cleaner Kotlin-native API. Unlike Dagger, Metro can inject into `private` members and `private` constructors because it operates inside the compiler.

Member injection works for classes you can't constructor-inject, like Android Activities. In Dagger, injected members must be public or package-private (Java limitation). In Metro, they can be `private` — the compiler plugin has full visibility. This is a significant advantage for encapsulation.

Metro's assisted injection uses `fun interface` for factories, which is more idiomatic Kotlin than Dagger's regular interface factories. The `fun interface` enables SAM conversion, so you can call the factory as a lambda in some cases.

The `@AssistedFactory` pattern in Metro generates the factory implementation at compile time, just like Dagger. The generated code is functionally identical — a class that bridges graph-provided dependencies with runtime-provided parameters. The difference is that Metro generates it in IR instead of source code.

```kotlin
// Assisted injection in Metro
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

// Member injection — private members work in Metro
class MainActivity : ComponentActivity() {
    @Inject
    private lateinit var analytics: Analytics  // Private! Works in Metro.

    @Inject
    private lateinit var navigator: Navigator

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // analytics and navigator are injected
    }
}

// Graph exposes injection function
@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    fun inject(activity: MainActivity)
}
```

```kotlin
// Metro vs Dagger: private member injection
// Dagger: injected members MUST be public or internal
class Activity {
    @Inject lateinit var analytics: Analytics // Must be public!
    // @Inject private lateinit var analytics // ERROR in Dagger
}

// Metro: injected members can be private
class Activity {
    @Inject private lateinit var analytics: Analytics // Works in Metro!
    // Better encapsulation — analytics is not exposed to other code
}
```

```kotlin
// Metro assisted factory with fun interface (Kotlin-native)
@AssistedInject
class ImageProcessor(
    @Assisted val uri: Uri,
    val cache: ImageCache,
    val decoder: ImageDecoder,
) {
    @AssistedFactory
    fun interface Factory {
        fun create(uri: Uri): ImageProcessor
    }
}

// Usage — fun interface enables clean syntax
@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val imageProcessorFactory: ImageProcessor.Factory
}

val processor = graph.imageProcessorFactory.create(imageUri)
```

**Key takeaway:** Metro supports assisted injection and member injection with the same patterns as Dagger, but with Kotlin-native improvements. Private members can be injected because Metro operates inside the compiler, not through external annotation processing.

### Lesson 9.7: Metro vs Dagger/Hilt — When to Choose What

For new Kotlin projects — especially Kotlin Multiplatform projects — Metro is the strongest choice. It's Kotlin-native, compile-time safe, fast, and supports all KMP targets (JVM, Android, JS, WASM, Native). The API is clean, familiar, and takes advantage of Kotlin language features that Dagger can't use.

For existing Hilt projects, migration is feasible but not trivial. Metro's interop mode can understand Dagger and Anvil annotations during migration, so you don't need a big-bang rewrite. But you'll need to fix nullability mismatches, convert `@Component.Builder` to `@Component.Factory`, and handle Metro's stricter validation. The migration path is incremental — some modules on Metro, others still on Dagger, all composing into the same graph.

For Android-only projects starting fresh, Hilt is still a reasonable choice due to its deep integration with Jetpack (ViewModel, WorkManager, Navigation) and extensive documentation. But Metro is rapidly catching up in ecosystem support and offers significantly better build performance.

The decision framework is: Metro for new KMP projects, Metro for large projects where build time matters, Hilt for Android-only projects that want Jetpack integration and ecosystem maturity, and manual DI for libraries. Koin for small prototypes where setup speed matters more than safety.

Metro's ecosystem is younger than Hilt's, which means less documentation, fewer blog posts, and smaller community support. This gap is closing rapidly as more companies adopt Metro, but it's a real consideration for teams that rely on community resources for learning and troubleshooting.

```kotlin
// Metro interop — understands Dagger annotations during migration
metro {
    interop {
        includeDagger(includeJavax = true, includeJakarta = false)
        includeAnvil(
            includeDaggerAnvil = true,
            includeKotlinInjectAnvil = false,
        )
    }
}

// Existing Dagger code works unchanged with interop enabled:
@Inject
class UserRepository(
    private val api: UserApi,
) // Metro understands Dagger's @Inject

@Module
@ContributesTo(AppScope::class)
abstract class DataModule {
    @Binds
    abstract fun bind(impl: UserRepositoryImpl): UserRepository
}
// Metro understands Dagger's @Module and Anvil's @ContributesTo
```

```kotlin
// Decision framework
//
// New KMP project → Metro
//   Kotlin-native, all targets, compile-time safe, fast builds
//
// New Android-only project → Hilt or Metro
//   Hilt: Jetpack integration, documentation, community
//   Metro: Better build performance, Kotlin-native API
//
// Large existing Dagger project → Consider Metro migration
//   Use interop mode for incremental migration
//   Significant build time improvements at scale
//
// Library or SDK → Manual DI
//   Zero framework dependencies for consumers
//
// Small prototype → Koin
//   Fastest setup, runtime resolution acceptable for prototypes
```

```kotlin
// Common issues when migrating Dagger → Metro
// 1. @Component.Builder → @Component.Factory (Metro requires Factory)
// 2. Nullable type mismatches (Dagger's Java heritage ignores nullability)
// 3. Scope on @Binds methods → move to implementation class
// 4. Duplicate module includes (Dagger tolerates, Metro flags)
// Most fixes are tech debt cleanup that improves code quality
```

**Key takeaway:** Choose Metro for new Kotlin/KMP projects. Stick with Hilt for existing Android projects unless build performance is a pain point. Metro's interop mode makes incremental migration from Dagger possible without a rewrite.

### Quiz: Metro — Next-Generation DI

#### What is the fundamental architectural difference between Metro and Dagger?

- ❌ Metro uses runtime reflection while Dagger uses code generation
- ❌ Metro generates Java code while Dagger generates Kotlin code
- ✅ Metro is a Kotlin compiler plugin that generates code directly into IR, while Dagger uses annotation processing to generate source files
- ❌ Metro only works on Android while Dagger is multiplatform

> **Explanation:** Dagger runs as a separate annotation processing step (KAPT or KSP) that generates source files, which then need another compilation pass. Metro hooks directly into Kotlin's FIR and IR compilation phases, generating code in a single pass with no extra compilation steps.

#### Why can Metro inject into private members while Dagger cannot?

- ❌ Metro uses reflection at runtime
- ❌ Metro requires a special Gradle configuration
- ✅ Metro operates inside the Kotlin compiler and has visibility into all declarations, including private ones
- ❌ Dagger was designed before Kotlin had private members

> **Explanation:** Dagger's annotation processors (KAPT/KSP) can only see public and internal declarations from outside a file. Metro, as a compiler plugin, runs inside the same compiler that processes private declarations. It has full visibility into the code.

#### What does `@ContributesBinding(AppScope::class)` do in Metro?

- ❌ It marks a class as an interface implementation for testing only
- ✅ It automatically binds the implementation to its supertype in the specified scope's graph, without needing a separate module file
- ❌ It creates a new scope called AppScope
- ❌ It makes the binding available across all scopes

> **Explanation:** `@ContributesBinding` declares the binding where the implementation lives. Metro automatically aggregates it into the graph with the matching scope. This eliminates centralized module files and scales well for multi-module projects.

#### When should you choose Hilt over Metro for a new project?

- ❌ When you need compile-time safety
- ❌ When you want better build performance
- ✅ When you need deep Jetpack integration (ViewModel, WorkManager, Navigation) and extensive community documentation
- ❌ When you're building a Kotlin Multiplatform project

> **Explanation:** Hilt has purpose-built integrations with `@HiltViewModel`, `@HiltWorker`, and Navigation Compose that Metro doesn't currently provide. It also has years of documentation, blog posts, and community knowledge. Metro is technically superior but newer and has a smaller ecosystem.

### Coding Challenge: Build a Metro Dependency Graph

Create a Metro dependency graph for a notes app with `NotesRepository`, `NotesApi`, and a scoped `AuthManager`. Use `@ContributesBinding` for the repository.

#### Solution

```kotlin
// Scope marker
abstract class AppScope private constructor()

// Constructor-injected types
@SingleIn(AppScope::class)
@Inject
class AuthManager(
    private val tokenStore: TokenStore,
    private val httpClient: HttpClient,
)

// Interface and contributed binding
interface NotesRepository {
    suspend fun getNotes(): List<Note>
    suspend fun saveNote(note: Note)
}

@ContributesBinding(AppScope::class)
@Inject
class NotesRepositoryImpl(
    private val api: NotesApi,
    private val dao: NotesDao,
    private val authManager: AuthManager,
) : NotesRepository {
    override suspend fun getNotes(): List<Note> = api.getNotes()
    override suspend fun saveNote(note: Note) {
        api.saveNote(note)
        dao.insert(note)
    }
}

// Providers for third-party types
@ContributesTo(AppScope::class)
interface NetworkProviders {
    @Provides
    fun provideHttpClient(): HttpClient = HttpClient()

    @Provides
    fun provideNotesApi(client: HttpClient): NotesApi =
        NotesApi(client)
}

// The graph — NotesRepositoryImpl is automatically bound via @ContributesBinding
@DependencyGraph(scope = AppScope::class)
interface AppGraph {
    val notesRepository: NotesRepository
    val authManager: AuthManager
}

// Usage
val graph = createGraph<AppGraph>()
val notes = graph.notesRepository.getNotes()
```

Notice how `NotesRepositoryImpl` doesn't need a separate module file — `@ContributesBinding` handles it. The `NetworkProviders` interface is merged into the graph via `@ContributesTo`. The entire graph is validated at compile time.

---

## Module 10: DI Best Practices and Migration

### Lesson 10.1: Scope Discipline — The Most Common DI Mistake

The number one DI mistake in production Android apps is incorrect scoping. Over-scoping (making everything `@Singleton`) causes data leakage between user sessions and wastes memory. Under-scoping (making stateful objects unscoped) causes duplicate instances, lost state, and inconsistent behavior.

The mental model: ask "what is the natural lifetime of this object?" An `OkHttpClient` should live as long as the app — it manages connection pools and thread pools. A `SearchPaginator` should live as long as the screen — it holds page state. A `DateFormatter` is stateless — it doesn't need scoping at all.

A real production bug: a `UserSessionManager` was scoped as `@Singleton`. When user A logged out and user B logged in, the singleton still held user A's cached session data. User B briefly saw user A's profile. The fix was clearing the session on logout, but the real fix was questioning whether the session manager needed to be a process-lifetime singleton in the first place.

Over-scoping has hidden memory costs. Every `@Singleton` stays in memory for the entire process lifetime — even after the user navigates away from the screen that used it. In an app with 50 singletons, some of which hold significant data structures, this can add up to megabytes of retained memory. The solution is to scope dependencies to the smallest appropriate lifecycle.

Under-scoping causes a different class of bugs. If two screens need to share a shopping cart and the cart is unscoped, each screen gets its own instance. Adding items in one screen doesn't appear in the other. If a database connection is unscoped, each injection opens a new connection — wasting resources and potentially causing lock contention.

The scoping decision tree is: (1) Is the object stateless? → Unscoped. (2) Should it survive configuration changes? → `@ViewModelScoped`. (3) Should it live for the entire app? → `@Singleton`. (4) Is it tied to a specific Activity or Fragment? → `@ActivityScoped` or `@FragmentScoped`. Most objects fall into category 1 (unscoped) or 2 (`@ViewModelScoped`).

In Metro, scoping uses `@SingleIn(Scope::class)` which makes the scope explicit in the annotation. In Koin, scoping is manual — you create and destroy scopes yourself. Both Hilt and Metro validate scope consistency at compile time. Koin doesn't — scope violations are runtime errors.

```kotlin
// ❌ Over-scoped — holds state for too long
@Module
@InstallIn(SingletonComponent::class)
object BadModule {
    @Provides
    @Singleton  // Why singleton? This holds user-specific state!
    fun provideUserSession(): UserSession = UserSession()
}

// ✅ Correctly scoped — tied to logged-in lifecycle
@Module
@InstallIn(ActivityRetainedComponent::class)
object BetterModule {
    @Provides
    @ActivityRetainedScoped
    fun provideUserSession(): UserSession = UserSession()
}

// ✅ No scope needed — stateless, lightweight
class FormatCurrencyUseCase @Inject constructor(
    private val localeProvider: LocaleProvider,
    // No scope annotation — new instance each time, which is fine
)
```

```kotlin
// Scoping decision examples
// Stateless utility → Unscoped
class DateFormatter @Inject constructor() // New instance each time, cheap

// Screen state → @ViewModelScoped
@ViewModelScoped
class SearchPaginator @Inject constructor(private val api: SearchApi) // Per-screen

// App infrastructure → @Singleton
@Singleton
class AppDatabase @Inject constructor(/* ... */) // One for the entire app

// Flow state → @ActivityRetainedScoped
@ActivityRetainedScoped
class CheckoutSession @Inject constructor() // Lives through the checkout flow
```

```kotlin
// Real-world scope bug: data leakage
@Singleton // ❌ Process-lifetime singleton holding user-specific data
class UserCache @Inject constructor() {
    private val cachedProfile = MutableStateFlow<UserProfile?>(null)

    fun cacheProfile(profile: UserProfile) {
        cachedProfile.value = profile
    }

    fun getCachedProfile(): UserProfile? = cachedProfile.value
}

// User A logs in → profile cached
// User A logs out, User B logs in
// User B sees User A's cached profile! Data leakage!

// Fix: clear cache on logout, or better, use ViewModel-scoped cache
```

**Key takeaway:** Match a dependency's scope to its natural lifetime. Singletons for app infrastructure (HTTP clients, databases). ViewModel-scoped for screen state. Unscoped for stateless logic. Over-scoping causes data leakage. Under-scoping causes waste.

### Lesson 10.2: Interface Segregation in DI

Not every class needs an interface. The blanket advice "always program to an interface" leads to unnecessary abstraction — a `UserRepository` interface with exactly one implementation and no plans for a second. The overhead of maintaining the interface, the binding, and the implementation isn't worth it.

Use interfaces when: (1) you have or plan to have multiple implementations, (2) you need to substitute fakes in tests and the class has complex behavior worth faking, or (3) the interface crosses a module boundary (`:core:domain` defines it, `:core:data` implements it). For simple classes, `@Inject constructor` is enough.

The cost of unnecessary interfaces is real: each interface adds a file, a `@Binds` method in a module, and a layer of indirection in code navigation. When you have 100 interfaces with exactly one implementation each, that's 100 extra files and 100 extra bindings that provide no value. The codebase becomes harder to navigate without providing any testability or flexibility benefit.

Simple utility classes, formatters, validators, and mappers typically don't need interfaces. If the class is stateless and has straightforward logic, you can inject the concrete class directly. If you need to test it in isolation, just construct it directly in your test — no fake needed.

The exception is architectural boundaries. Repository interfaces in `:core:domain` are essential even if they have one implementation — they prevent feature modules from coupling to data layer implementations. Use case interfaces are also valuable at module boundaries. But within a single module, concrete injection is usually fine.

```kotlin
// ✅ Interface makes sense — multiple implementations, cross-module boundary
interface PaymentGateway {
    suspend fun charge(amount: Double): PaymentResult
}

class StripePaymentGateway @Inject constructor(/* ... */) : PaymentGateway
class PayPalPaymentGateway @Inject constructor(/* ... */) : PaymentGateway

// ✅ Interface makes sense — need a fake for complex behavior
interface UserRepository {
    suspend fun getUser(id: String): User?
    suspend fun saveUser(user: User)
    fun observeUser(id: String): Flow<User>
}

// ❌ Unnecessary interface — one implementation, simple logic
interface DateFormatterInterface {
    fun format(date: LocalDate): String
}
class DateFormatterImpl @Inject constructor() : DateFormatterInterface

// ✅ Better — just use the class directly
class DateFormatter @Inject constructor(
    private val localeProvider: LocaleProvider,
) {
    fun format(date: LocalDate): String = /* ... */
}
```

```kotlin
// When to use interfaces — decision guide
// Cross-module boundary? → YES, use interface
// Multiple implementations? → YES, use interface
// Complex behavior worth faking? → YES, use interface
// Simple, stateless utility? → NO, use concrete class
// Single implementation, same module? → Probably NO
```

**Key takeaway:** Don't create interfaces for every class. Use interfaces when you have multiple implementations, need test fakes for complex behavior, or cross module boundaries. For simple, single-implementation classes, `@Inject constructor` is cleaner.

### Lesson 10.3: Organizing Hilt Modules at Scale

As your project grows, module organization matters. The pattern that scales best: one Hilt module per concern, located in the Gradle module that owns the implementations. Avoid God modules that centralize all bindings.

Name modules clearly: `NetworkModule` provides network infrastructure, `UserDataModule` binds user-related repositories, `AnalyticsModule` provides analytics implementations. When a module gets too large (10+ bindings), split it by sub-concern.

A useful convention: `@Provides`-only modules are `object`s (concrete). `@Binds`-only modules are `abstract class`es. When you need both for the same feature, create two modules with a clear naming convention (`AuthNetworkModule` for `@Provides`, `AuthBindingsModule` for `@Binds`). Or use the companion object trick to keep them in one file.

In a multi-module project, the module location matters. Network modules go in `:core:network`. Database modules go in `:core:database`. Repository binding modules go in `:core:data`. Feature-specific modules go in the feature's `:impl` module. The `:app` module should have zero or minimal Hilt modules.

For Metro projects, module organization is different because `@ContributesBinding` eliminates module files entirely for interface bindings. You still need provider interfaces for third-party types, but the number of DI-related files is significantly lower. This is one of Metro's organizational advantages.

```kotlin
// Organized by layer and concern
// :core:network
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule { /* OkHttp, Retrofit */ }

// :core:database
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule { /* Room database, DAOs */ }

// :core:data — split by domain
@Module
@InstallIn(SingletonComponent::class)
abstract class UserDataModule {
    @Binds @Singleton
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
}

@Module
@InstallIn(SingletonComponent::class)
abstract class OrderDataModule {
    @Binds @Singleton
    abstract fun bindOrderRepo(impl: OrderRepositoryImpl): OrderRepository
}

// :feature:checkout — feature-specific bindings
@Module
@InstallIn(ViewModelComponent::class)
object CheckoutModule {
    @Provides
    @ViewModelScoped
    fun provideCartCalculator(taxService: TaxService): CartCalculator =
        CartCalculator(taxService)
}
```

```kotlin
// Module organization checklist
// ✅ One module per concern (NetworkModule, DatabaseModule)
// ✅ Module lives in the Gradle module that owns the implementations
// ✅ 3-8 bindings per module
// ✅ Clear naming: XxxNetworkModule, XxxBindingsModule
// ❌ God module with 50+ bindings
// ❌ Module-per-class (one binding per file)
// ❌ All modules in :app
```

**Key takeaway:** One Hilt module per concern, located in the Gradle module that owns the implementations. Split large modules by sub-concern. Use clear naming conventions to distinguish `@Provides` and `@Binds` modules.

### Lesson 10.4: KAPT to KSP Migration

If you're still using KAPT for Dagger/Hilt, migrating to KSP is one of the highest-impact build performance improvements you can make. The migration is a build file change — no Kotlin source code changes required.

KAPT generates Java stubs for all Kotlin files before running annotation processors. KSP eliminates this step by plugging directly into the Kotlin compiler. The result is typically a 2x build speedup, and more importantly, KSP unblocks the K2 compiler. KAPT pins you to `languageVersion = "1.9"` and prevents K2 adoption.

The migration is straightforward: replace `kapt(...)` with `ksp(...)` in your dependencies block, and replace the `kotlin-kapt` plugin with `com.google.devtools.ksp`. If you have other KAPT dependencies (like Room), migrate those to KSP too. Once all KAPT dependencies are migrated, remove the KAPT plugin entirely.

After migration, verify with a clean build. The `kaptGenerateStubs` task should disappear from your build timeline. If it's still present, you have a remaining KAPT dependency that needs migration.

One potential issue: some libraries haven't migrated their annotation processors to KSP yet. Check each library's documentation for KSP support. Major libraries (Dagger, Hilt, Room, Moshi) all support KSP. If a library doesn't support KSP, you'll need to keep KAPT for that specific dependency.

```kotlin
// build.gradle.kts — BEFORE (KAPT)
plugins {
    id("org.jetbrains.kotlin.kapt")
}
dependencies {
    implementation("com.google.dagger:hilt-android:2.51")
    kapt("com.google.dagger:hilt-compiler:2.51")
    implementation("androidx.room:room-runtime:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
}

// build.gradle.kts — AFTER (KSP)
plugins {
    id("com.google.devtools.ksp") version "2.1.10-1.0.29"
}
dependencies {
    implementation("com.google.dagger:hilt-android:2.51")
    ksp("com.google.dagger:hilt-compiler:2.51")
    implementation("androidx.room:room-runtime:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
}
```

```kotlin
// Migration checklist
// 1. Replace kapt("...") → ksp("...") for each dependency
// 2. Replace id("org.jetbrains.kotlin.kapt") → id("com.google.devtools.ksp")
// 3. Clean build to verify everything compiles
// 4. Verify kaptGenerateStubs task is gone from build timeline
// 5. Remove kapt plugin if no remaining KAPT dependencies
// 6. Enable K2 compiler (optional but recommended)
```

After migration, remove the `kapt` plugin if no other dependencies use it. Run a clean build to verify everything compiles. The `kaptGenerateStubs` task disappears from your build timeline — that's where the time savings come from.

**Key takeaway:** Migrate from KAPT to KSP by changing `kapt(...)` to `ksp(...)` in your build file. No source code changes needed. You get ~2x build speedup and unblock K2 compiler adoption.

### Lesson 10.5: Migrating from Dagger to Metro

If build performance is a pain point and you're ready for the next generation, Metro offers an incremental migration path from Dagger. The key is Metro's interop mode, which understands Dagger and Anvil annotations without requiring you to change them.

Cash App's migration approach is the template to follow: set up a dual-build system with a Gradle property flag, run CI in both modes, fix what Metro's stricter validation catches, and gradually flip the default. The interop configuration lets your existing `@Inject`, `@Provides`, `@Module`, and `@ContributesTo` annotations work unchanged.

The common issues you'll encounter: duplicate module includes (Dagger tolerates, Metro flags), `@Component.Builder` needs conversion to `@Component.Factory`, scope annotations on `@Binds` methods should move to implementation classes, and nullable type mismatches that Dagger's Java heritage silently accepted.

Most of these fixes are actually tech debt cleanup. Duplicate module includes indicate a misconfigured graph. Scope annotations on `@Binds` methods indicate unclear ownership. Nullable mismatches indicate potential runtime NPEs that Dagger was hiding. Metro's stricter validation is catching real problems.

The dual-build approach is essential for safety. Run your entire test suite under both Dagger and Metro on CI. This ensures the migration doesn't change runtime behavior. Once all tests pass on Metro, flip the default. Keep Dagger as a fallback for a release cycle before removing it entirely.

```kotlin
// gradle.properties — dual build flag
di.implementation=Dagger  // or Metro

// Convention plugin switches based on flag
class DiPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        val impl = providers.gradleProperty("di.implementation").getOrElse("Dagger")
        when (impl) {
            "Dagger" -> {
                pluginManager.apply("com.google.dagger.hilt.android")
                pluginManager.apply("com.google.devtools.ksp")
                dependencies.add("implementation", "com.google.dagger:hilt-android:2.51")
                dependencies.add("ksp", "com.google.dagger:hilt-compiler:2.51")
            }
            "Metro" -> {
                pluginManager.apply("dev.zacsweers.metro")
                extensions.configure<MetroPluginExtension> {
                    interop.includeDagger(includeJavax = true)
                    interop.includeAnvil(includeDaggerAnvil = true)
                }
            }
        }
    }
}
```

```kotlin
// Common fix: move scope from @Binds to implementation
// Before (Dagger accepts, Metro rejects)
@Module
abstract class DataModule {
    @Binds
    @Singleton  // ❌ Metro: scope belongs on implementation
    abstract fun bind(impl: UserRepoImpl): UserRepo
}

// After (both accept)
@Singleton // or @SingleIn(AppScope::class) for Metro
class UserRepoImpl @Inject constructor(/* ... */) : UserRepo

@Module
abstract class DataModule {
    @Binds
    abstract fun bind(impl: UserRepoImpl): UserRepo
}
```

```kotlin
// Common fix: @Component.Builder → @Component.Factory
// Before (Dagger Builder — Metro doesn't support)
@Component
interface AppComponent {
    @Component.Builder
    interface Builder {
        @BindsInstance fun context(context: Context): Builder
        fun build(): AppComponent
    }
}

// After (Factory — both support)
@Component
interface AppComponent {
    @Component.Factory
    interface Factory {
        fun create(@BindsInstance context: Context): AppComponent
    }
}
```

**Key takeaway:** Metro's interop mode lets you migrate incrementally from Dagger without rewriting annotations. Use a dual-build system for safety. Fix stricter validation issues (duplicate modules, scope placement, nullability). Most fixes are tech debt cleanup that should have been done anyway.

### Lesson 10.6: DI Decision Framework

Choosing the right DI approach depends on your project's size, requirements, and constraints. Here's a decision framework based on real-world tradeoffs.

For **new Android-only projects**: Start with Hilt. It has the best Jetpack integration, the most documentation, and compile-time safety. Switch to Metro when build performance becomes a bottleneck or when you want to adopt K2 with KAPT holdouts.

For **new Kotlin Multiplatform projects**: Use Metro (or kotlin-inject as an alternative). Hilt and Dagger are Android-only. Koin works on KMP but lacks compile-time safety.

For **libraries and SDKs**: Use manual DI. Never leak a DI framework as a transitive dependency to your consumers.

For **small apps or prototypes**: Koin is fine. The speed of setup outweighs the risk of runtime resolution for small codebases. Migrate to Hilt or Metro if the app grows.

For **existing Dagger projects with build pain**: Evaluate Metro with its interop mode. The dual-build approach lets you prove the migration works before committing.

The framework landscape is evolving rapidly. Metro is gaining adoption, Hilt continues to improve, and Koin is adding safety features. The principles remain constant: prefer compile-time validation, scope dependencies correctly, and keep your domain layer free of DI framework dependencies.

**Key takeaway:** There's no universal "best" DI framework. Choose based on project size, platform targets, and team constraints. Hilt for Android-only with Jetpack. Metro for KMP or build performance. Manual DI for libraries. Koin for prototypes.

### Quiz: DI Best Practices and Migration

#### What is the most common DI mistake in production Android apps?

- ❌ Using field injection instead of constructor injection
- ❌ Using too many interfaces
- ✅ Incorrect scoping — over-scoping causes data leakage, under-scoping causes duplicate instances
- ❌ Not using Hilt

> **Explanation:** Over-scoping (making everything `@Singleton`) causes data to leak between user sessions. Under-scoping (making stateful objects unscoped) causes duplicate instances and inconsistent state. Match a dependency's scope to its natural lifetime.

#### Why should you migrate from KAPT to KSP?

- ❌ KAPT doesn't support Room
- ✅ KSP eliminates stub generation for ~2x build speedup and unblocks the K2 compiler
- ❌ KSP generates more efficient runtime code
- ❌ KAPT will be removed in the next Kotlin version

> **Explanation:** KAPT generates Java stubs before running annotation processors, which costs roughly one-third of a full compilation. KSP eliminates this step. More importantly, KAPT pins you to `languageVersion = "1.9"` and prevents K2 adoption.

#### When is it NOT worth creating an interface for DI?

- ❌ When the class crosses a module boundary
- ❌ When you need to substitute test fakes
- ✅ When there's exactly one implementation, no plans for a second, and the class is simple enough that a fake isn't needed
- ❌ When using Hilt's `@Binds`

> **Explanation:** Creating an interface for every class adds maintenance overhead without benefit. If the class is simple, has one implementation, and doesn't need faking in tests, use `@Inject constructor` directly. Reserve interfaces for classes with multiple implementations or complex behavior worth faking.

#### What is Metro's interop mode used for?

- ❌ Running Dagger and Metro simultaneously at runtime
- ✅ Allowing Metro to understand Dagger and Anvil annotations during incremental migration
- ❌ Converting Dagger annotations to Metro annotations automatically
- ❌ Providing backward compatibility with Java code

> **Explanation:** Metro's interop mode configures the compiler plugin to understand Dagger's `@Inject`, `@Provides`, `@Module`, and Anvil's `@ContributesTo`, `@ContributesBinding` annotations. This lets you migrate incrementally — some modules on Metro annotations, others still on Dagger, all composing into the same graph.

### Coding Challenge: Design a DI Architecture

You're building a new e-commerce Android app with 8 feature modules. Design the Gradle module structure and DI architecture. Specify which DI framework to use, where interfaces live, where bindings are declared, and how features communicate.

#### Solution

```kotlin
// Module structure
// :app                    — assembles everything, @HiltAndroidApp
// :core:common            — qualifiers, shared utilities
// :core:network           — NetworkModule, OkHttp, Retrofit
// :core:database          — DatabaseModule, Room
// :core:domain            — repository interfaces, use cases
// :core:data              — repository implementations, @Binds modules
// :feature:home:api       — HomeNavigator interface
// :feature:home:impl      — HomeViewModel, HomeScreen, HomeNavigatorImpl
// :feature:product:api    — ProductNavigator interface
// :feature:product:impl   — ProductViewModel, ProductScreen
// :feature:cart:api        — CartNavigator interface
// :feature:cart:impl       — CartViewModel, CartScreen
// :feature:checkout:api   — CheckoutNavigator interface
// :feature:checkout:impl  — CheckoutViewModel, CheckoutScreen
// (plus search, profile, orders, settings)

// :core:common — centralized qualifiers
@Qualifier annotation class IoDispatcher
@Qualifier annotation class MainDispatcher

// :core:domain — interfaces only, no DI dependency
interface ProductRepository {
    suspend fun getProducts(): List<Product>
    fun observeProduct(id: String): Flow<Product>
}

interface CartRepository {
    suspend fun addToCart(productId: String, quantity: Int)
    fun observeCart(): Flow<Cart>
}

// :core:data — implementations with Hilt bindings
class ProductRepositoryImpl @Inject constructor(
    private val api: ProductApi,
    private val dao: ProductDao,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : ProductRepository { /* ... */ }

@Module
@InstallIn(SingletonComponent::class)
abstract class ProductDataModule {
    @Binds @Singleton
    abstract fun bind(impl: ProductRepositoryImpl): ProductRepository
}

// :feature:product:api — public contract only
interface ProductNavigator {
    fun navigateToProduct(productId: String)
}

// :feature:product:impl — implementation
class ProductNavigatorImpl @Inject constructor(
    private val navController: NavController,
) : ProductNavigator {
    override fun navigateToProduct(productId: String) {
        navController.navigate("product/$productId")
    }
}

// :feature:home:impl — depends on :feature:product:api, not :impl
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val productRepo: ProductRepository,
    private val productNavigator: ProductNavigator,
) : ViewModel()
```

The architecture follows dependency inversion at every level. Feature modules depend on `:core:domain` interfaces and other features' `:api` modules. Implementations live in `:impl` modules with their own Hilt bindings. The `:app` module depends on everything and Hilt merges all bindings at compile time.

---

Thank You for completing the Dependency Injection Mastery course! DI is the backbone of clean, testable Android architecture. 💉
