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

When a class creates its own dependencies, three things go wrong. You can't test the class in isolation because you can't substitute a fake dependency. Swapping implementations requires modifying the class itself. And the dependency graph becomes implicit — there's no single place to see what depends on what.

Every class that creates its own `Retrofit`, `OkHttpClient`, or database instance is also wasteful. In a real app you want a single shared `OkHttpClient` with connection pooling, not one per screen. Each `OrderViewModel` creating its own HTTP client means duplicated connections, duplicated interceptors, and duplicated configuration scattered across your codebase.

The deeper problem is architectural. When classes reach into global state to get what they need, the code becomes a web of hidden dependencies. Adding a new feature means tracing through constructor calls across files to figure out what depends on what. Removing a feature means hoping nothing else secretly depended on it.

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

**Key takeaway:** DI means a class receives its dependencies instead of creating them. This one shift — from "I create what I need" to "I declare what I need" — has cascading effects on testability, flexibility, and maintainability.

### Lesson 1.2: Constructor vs Field vs Method Injection

Constructor injection is the default choice, and field injection should be the exception. When dependencies are passed through the constructor, the class declares upfront exactly what it needs — you can read the constructor signature and immediately understand its collaborators. With field injection, dependencies are invisible until you scan the class body for `@Inject lateinit var` annotations.

Beyond readability, constructor-injected dependencies are available from the moment the object is created. Field-injected dependencies are set after construction, so there's a window where the object exists but isn't fully initialized. If any code runs during construction that touches a field-injected dependency, you get an `UninitializedPropertyAccessException` — notoriously hard to reproduce because they depend on initialization ordering.

Method injection is the rarest form. It's useful for optional dependencies or when you need to inject something after construction but before the object is used. In practice, you'll almost never need it.

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

The tradeoff is that Android's Activity and Fragment classes don't support constructor injection because the system instantiates them. For these entry points, field injection through `@AndroidEntryPoint` is the practical choice. But everything behind those entry points — ViewModels, repositories, use cases — should use constructor injection exclusively.

**Key takeaway:** Always prefer constructor injection. It makes dependencies explicit, enforces immutability, and works naturally with testing. Reserve field injection for Android entry points where you don't control construction.

### Lesson 1.3: Service Locator vs Dependency Injection

Before talking about frameworks, it's worth distinguishing DI from another pattern it's often confused with: the Service Locator. Both provide dependencies from a central place, but they work differently. A Service Locator is a registry that classes reach into to get their dependencies. The class actively looks up what it needs. A DI container pushes dependencies to the class — the class passively receives them through its constructor.

The Service Locator pattern has two problems. First, dependencies are hidden — looking at the class's constructor doesn't tell you what it needs. You have to read the body to discover that it depends on `OrderRepository`. Second, testing requires setting up the global locator with test fakes before every test and cleaning up after, which creates shared mutable state between tests.

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

Koin, despite being marketed as a DI framework, is technically a service locator. Its `get()` function reaches into a global registry at runtime. This distinction matters when you're choosing a DI strategy — runtime resolution (service locator) versus compile-time resolution (true DI) affects both safety and testability.

**Key takeaway:** With DI, dependencies are pushed into a class from the outside. With a service locator, the class pulls them from a global registry. DI makes dependencies explicit and testing straightforward. Service locators hide dependencies and create shared mutable state.

### Lesson 1.4: Manual DI — The Simplest Starting Point

Before reaching for Dagger or Hilt, it's worth understanding manual DI. Constructor injection — passing dependencies as constructor parameters — is DI in its purest form. No framework, no code generation, no magic. A simple container class wires everything together.

Manual DI works well for small apps with a handful of dependencies. But as your app grows to 50+ classes with complex dependency graphs, manually wiring everything becomes tedious and error-prone. You have to manage lifetimes (should this be a singleton or a new instance?), handle scoping (should the payment flow share a single `PaymentManager` instance?), and remember the construction order. That's where DI frameworks come in.

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

Now `OrderViewModel` doesn't know or care how `OrderRepository` is built. In tests, you pass a `FakeOrderRepository`. In production, the `AppContainer` provides the real one. The ViewModel went from untestable to trivially testable with one change — moving dependency construction outside the class.

**Key takeaway:** Manual DI using a container class is the simplest way to understand DI. It works for small apps but doesn't scale. Frameworks like Hilt automate the wiring, scoping, and lifecycle management that manual DI forces you to handle yourself.

### Lesson 1.5: The Dependency Inversion Principle

DI is often confused with the Dependency Inversion Principle (DIP), but they're related concepts, not the same thing. DIP says that high-level modules should not depend on low-level modules — both should depend on abstractions. DI is one technique for achieving DIP.

In practice, DIP means your `ProfileViewModel` should depend on a `UserRepository` interface, not on `UserRepositoryImpl` directly. The implementation detail — whether the repository calls a REST API, a local database, or both — is hidden behind the abstraction. This lets you swap implementations without touching the consumer.

When you combine DIP with DI, you get maximum flexibility. The ViewModel depends on an interface (DIP). The DI framework provides the concrete implementation at construction time (DI). The ViewModel never knows which implementation it's using, and you can swap it for tests, different build flavors, or future refactors.

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

**Key takeaway:** DI is how you deliver dependencies. DIP is about depending on abstractions, not concretions. Together, they make code modular, testable, and resistant to change.

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

Hilt is Google's recommended DI framework for Android. It builds on top of Dagger and provides a set of standard components and annotations that reduce boilerplate. Setting up Hilt requires three things: the Gradle plugin, the KSP compiler dependency, and annotating your Application class.

The `@HiltAndroidApp` annotation triggers Hilt's code generation and creates the application-level dependency container. Every Activity, Fragment, or other Android component that needs injected dependencies must be annotated with `@AndroidEntryPoint`. This tells Hilt to generate the injection code for that component.

Under the hood, `@HiltAndroidApp` generates a base class that your Application extends (via bytecode transformation). This base class holds the `SingletonComponent` — the root of Hilt's component hierarchy. When an `@AndroidEntryPoint` Activity is created, Hilt looks up the component hierarchy, creates the appropriate sub-component, and injects the declared dependencies.

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

**Key takeaway:** `@HiltAndroidApp` on your Application class sets up the root dependency container. `@AndroidEntryPoint` on Activities and Fragments tells Hilt to generate injection code for those components. Without both, Hilt won't inject anything.

### Lesson 2.2: @Provides — Constructing Dependencies

When you need to provide instances of classes you don't own — third-party libraries, builders, factory methods — you use `@Provides` inside a Hilt module. A module is a class annotated with `@Module` and `@InstallIn`, which tells Hilt which component (and therefore which lifecycle) the bindings belong to.

Each `@Provides` function tells Hilt: "When someone needs this type, call this function to create it." Hilt reads the function parameters, resolves them from the dependency graph, and passes them in automatically. The return type is what gets registered in the graph.

The `@InstallIn` annotation is what connects a module to a component. `@InstallIn(SingletonComponent::class)` means the bindings live for the entire app lifetime. If you forget `@InstallIn`, Hilt ignores the module entirely — a common source of "missing binding" errors.

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

Notice that `provideRetrofit` takes an `OkHttpClient` parameter — Hilt automatically resolves this from `provideOkHttpClient`. This is the dependency graph in action. `provideUserApi` is unscoped (no `@Singleton`), meaning a new instance is created on every injection — which is fine because `retrofit.create()` is lightweight.

**Key takeaway:** Use `@Provides` when you need to construct objects yourself — third-party libraries, builder patterns, factory methods. The module's `@InstallIn` determines which component lifecycle the bindings belong to.

### Lesson 2.3: @Binds — Interface-to-Implementation Mapping

When you have an interface and its implementation, and the implementation uses `@Inject constructor`, you don't need `@Provides`. Instead, use `@Binds` — it's more efficient because Hilt doesn't generate a separate factory class. It simply tells the graph: "When someone asks for this interface, give them this implementation."

The key requirement for `@Binds` is that the module must be `abstract`, and the implementation must have an `@Inject constructor` so Hilt knows how to create it. If the implementation doesn't have `@Inject constructor`, you need `@Provides` instead.

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

**Key takeaway:** Use `@Provides` when you construct the object yourself (third-party libraries, builders). Use `@Binds` when mapping an interface to its implementation. `@Binds` is more efficient — it doesn't generate a factory class. The implementation must have `@Inject constructor`.

### Lesson 2.4: @Inject Constructor — Automatic Binding

For classes you own and that don't implement interfaces, the simplest approach is `@Inject constructor`. This tells Hilt: "I know how to create this class — just resolve my constructor parameters from the graph." No module needed.

This is the most common pattern for use cases, mappers, formatters, and other classes that don't need interface abstraction. Every constructor parameter must be available in the Hilt graph — if one is missing, you get a compile-time error with a clear message about the missing binding.

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

**Key takeaway:** Use `@Inject constructor` for classes you own that don't need interface abstraction. Hilt registers them in the graph automatically — no `@Module`, `@Provides`, or `@Binds` needed.

### Lesson 2.5: Combining @Provides and @Binds in Practice

In real projects, you'll often need both `@Provides` and `@Binds` in the same feature. A common pattern is to use `@Provides` for third-party APIs and builders, and `@Binds` for your own interface-to-implementation mappings. Since `@Binds` requires an abstract class and `@Provides` requires concrete functions, you can't mix them in the same module — split them into separate modules.

The organizational pattern that scales best is one module per feature or layer: `NetworkModule` provides Retrofit and OkHttp, `DatabaseModule` provides Room, `RepositoryModule` binds repository interfaces. This keeps each module focused and easy to reason about.

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

**Key takeaway:** Split `@Provides` (concrete `object` modules) and `@Binds` (abstract class modules) into separate classes. Organize modules by feature or layer for maintainability.

### Lesson 2.6: Hilt Built-in Bindings

Hilt provides several bindings out of the box that you can inject without creating any modules. The most important ones are `@ApplicationContext` and `@ActivityContext`, which provide `Context` instances scoped to the appropriate lifecycle. `Application` itself is also directly injectable.

These built-in bindings save you from the common anti-pattern of passing `Context` through constructor chains or storing it in global variables. Hilt ensures you get the right `Context` for the right scope — `@ApplicationContext` for long-lived objects like repositories, `@ActivityContext` for Activity-scoped objects like UI helpers.

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

**Key takeaway:** Use `@ApplicationContext` for long-lived dependencies and `@ActivityContext` for Activity-scoped ones. Never store `@ActivityContext` in a singleton — it leaks the Activity.

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

Hilt organizes dependencies into a hierarchy of components, each tied to an Android lifecycle. Understanding this hierarchy is essential for scoping dependencies correctly. Each component is a child of the one above it, and child components can access all bindings from their parent.

The hierarchy reflects Android's lifecycle model. `SingletonComponent` lives for the entire process. `ActivityRetainedComponent` survives configuration changes (it's backed by a `ViewModel` internally). `ViewModelComponent` is scoped to individual ViewModels. `ActivityComponent`, `FragmentComponent`, and `ViewComponent` match their respective Android lifecycle owners.

A dependency scoped to a component is created once per instance of that component and shared across all injection sites within it. An unscoped dependency in `SingletonComponent` creates a new instance every time it's injected — which is fine for lightweight, stateless objects like use cases or mappers.

```
SingletonComponent            (Application lifetime)
├── ActivityRetainedComponent  (Survives config changes)
│   ├── ViewModelComponent     (ViewModel lifetime)
│   └── ActivityComponent      (Activity lifetime)
│       ├── FragmentComponent  (Fragment lifetime)
│       └── ViewComponent      (View lifetime)
└── ServiceComponent           (Service lifetime)
```

**Key takeaway:** Each Hilt component maps to an Android lifecycle. Scope dependencies to the smallest lifecycle that makes sense — `@Singleton` for app-wide state, `@ViewModelScoped` for screen state, unscoped for lightweight stateless objects.

### Lesson 3.2: Scoping Dependencies Correctly

The most common DI mistake isn't about how dependencies are injected — it's about how long they live. A database instance scoped to an Activity gets destroyed on every rotation. A user session scoped as a singleton leaks state across different users. The mental model is straightforward: a dependency's scope should match the lifetime of the thing that needs it.

Over-scoping is just as bad as under-scoping. Making everything a `@Singleton` feels safe, but singletons hold state for the entire process lifetime. This can cause real data leakage bugs in production — user A sees user B's cached data because a `UserSessionManager` singleton wasn't cleared between sessions.

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

**Key takeaway:** Scope dependencies to the smallest lifecycle that makes sense. `@Singleton` for app-wide shared state, `@ViewModelScoped` for screen state that survives configuration changes, `@ActivityScoped` for Activity-bound state. Unscoped is fine for lightweight stateless objects.

### Lesson 3.3: Qualifiers — Disambiguating Same-Type Bindings

When you have multiple bindings of the same type, Hilt can't tell which one to inject. Qualifiers solve this by adding a type-safe label to each binding. Without qualifiers, Hilt would fail at compile time with an ambiguous binding error.

Qualifiers are annotation classes you define. They must have `@Qualifier` and `@Retention(AnnotationRetention.BINARY)` — binary retention means the annotation is preserved in compiled bytecode (which Hilt needs) but isn't available at runtime through reflection (which you don't need). Every injection site must specify which qualified binding it wants.

The most common use case is dispatchers, but qualifiers are also useful for base URLs, API keys, feature flags, and any other case where you have multiple values of the same type.

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

**Key takeaway:** Use `@Qualifier` annotations to distinguish between multiple bindings of the same type. Every injection site must specify the qualifier. Without qualifiers, Hilt fails at compile time with an ambiguous binding error.

### Lesson 3.4: @Named vs Custom Qualifiers

Hilt provides a built-in `@Named` qualifier that takes a string parameter. While convenient for quick prototyping, custom qualifiers are safer because they're type-checked at compile time. A typo in `@Named("io_dispatcer")` compiles fine but fails at runtime (or gives the wrong binding). A typo in `@IoDispatcer` fails to compile.

Custom qualifiers are also self-documenting. When you see `@IoDispatcher` in code, you know exactly what it means. `@Named("io")` requires you to remember what "io" refers to. In large codebases with many qualified bindings, this difference in readability compounds.

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

**Key takeaway:** Prefer custom `@Qualifier` annotations over `@Named`. Custom qualifiers are type-safe, self-documenting, and catch typos at compile time. Reserve `@Named` for quick prototypes.

### Lesson 3.5: Assisted Injection

Sometimes a class needs a mix of dependencies from the graph and values that are only known at runtime. Assisted injection handles this. You annotate runtime parameters with `@Assisted` and define a factory interface with `@AssistedFactory`. Hilt generates the factory implementation.

This pattern is common for classes that need both injected services and dynamic configuration — like a payment processor that needs an amount, or a media player that needs a track URL. Without assisted injection, you'd have to create the object manually and pass all dependencies by hand.

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

**Key takeaway:** Use `@AssistedInject` and `@AssistedFactory` when a class needs both graph-provided dependencies and runtime values. Hilt generates the factory implementation — you just inject the factory and call `create()` with the runtime parameters.

### Lesson 3.6: EntryPoints — Accessing Hilt from Non-Hilt Code

Not every class in your app is managed by Hilt. Content providers, third-party library callbacks, and legacy code may need access to Hilt-provided dependencies. `@EntryPoint` defines an interface that Hilt implements, giving non-Hilt code a way to access the dependency graph.

Use entry points sparingly — they're an escape hatch, not a primary injection mechanism. If you find yourself creating many entry points, it's a sign that the code should be restructured to use standard injection.

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

**Key takeaway:** Use `@EntryPoint` to access Hilt dependencies from non-Hilt code like ContentProviders or third-party callbacks. It's an escape hatch — prefer standard injection for Hilt-managed components.

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

`@HiltViewModel` is the bridge between Hilt's dependency graph and Android's ViewModel. When you annotate a ViewModel with `@HiltViewModel` and give it an `@Inject constructor`, Hilt generates a `ViewModelProvider.Factory` that knows how to create the ViewModel with all its dependencies resolved. You never write a factory manually.

In Compose, `hiltViewModel()` retrieves or creates the ViewModel from the current `ViewModelStoreOwner` (usually the NavBackStackEntry or Activity). It handles scoping automatically — the ViewModel is created once and survives recompositions and configuration changes.

`SavedStateHandle` is one of the most useful auto-injected dependencies. Hilt provides it automatically in `@HiltViewModel` constructors, and it's pre-populated with navigation arguments. You can use `getStateFlow()` to create reactive flows that persist across process death.

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

**Key takeaway:** `@HiltViewModel` + `hiltViewModel()` eliminates manual ViewModel factories. `SavedStateHandle` is auto-injected and pre-populated with navigation arguments. Use `getStateFlow()` for reactive persistence across process death.

### Lesson 4.2: Hilt + Navigation Compose

Navigation Compose works naturally with Hilt. Each `composable()` destination gets its own ViewModel instance scoped to its `NavBackStackEntry`. This means navigating to the same destination twice creates two separate ViewModels with independent state.

For sharing state across destinations (like a checkout flow), you can scope a ViewModel to a parent navigation graph. Use `hiltViewModel()` with a `ViewModelStoreOwner` parameter pointing to the parent graph's back stack entry.

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

**Key takeaway:** Each Navigation destination gets its own ViewModel by default. For shared state across a flow, scope ViewModels to a parent navigation graph. Navigation arguments are automatically available in `SavedStateHandle`.

### Lesson 4.3: Hilt + WorkManager

WorkManager workers have a unique challenge: `Context` and `WorkerParameters` are provided at runtime by the system, not by Hilt. This is where `@AssistedInject` comes in — it lets you mix system-provided parameters with Hilt-injected dependencies.

`@HiltWorker` is a convenience annotation that sets up the assisted injection wiring. You also need to configure a custom `WorkerFactory` in your Application class. With Hilt's `HiltWorkerFactory`, this is done by implementing `Configuration.Provider`.

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

**Key takeaway:** Use `@HiltWorker` with `@AssistedInject` for WorkManager workers. `Context` and `WorkerParameters` are `@Assisted` (system-provided), while other dependencies come from Hilt. Configure `HiltWorkerFactory` in your Application class.

### Lesson 4.4: Hilt + Compose Side Effects and Lifecycle

Hilt dependencies can be injected into ViewModel, but sometimes you need dependencies in Composable functions that aren't ViewModel-scoped. Hilt doesn't directly inject into Composables, but you can access dependencies through ViewModels or `LocalContext`.

For Compose-specific patterns, consider providing dependencies through `CompositionLocal`. This is particularly useful for things like analytics trackers, theme providers, or navigation helpers that many Composables need access to.

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

**Key takeaway:** Hilt doesn't inject directly into Composables. Access dependencies through `@HiltViewModel` or bridge them via `CompositionLocal`. Use `staticCompositionLocalOf` for dependencies that rarely change.

### Lesson 4.5: Hilt + Shared ViewModels Across Fragments

In Fragment-based apps, sharing a ViewModel between fragments requires scoping to the Activity. Hilt handles this through `@AndroidEntryPoint` on both the Activity and Fragments, combined with `activityViewModels()` for the shared scope.

This pattern is common for master-detail layouts, stepper flows, or any case where two Fragments need access to the same state. The ViewModel lives as long as the Activity, so it persists across Fragment transactions.

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

**Key takeaway:** Use `activityViewModels()` in Fragments to share a Hilt ViewModel across Fragments within the same Activity. The ViewModel lives as long as the Activity.

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

In a multi-module Android project, DI organization follows the module dependency graph. Each Gradle module provides what it owns and depends on what it needs. The key insight is that Hilt resolves dependencies across Gradle modules automatically — as long as every module is in the dependency graph of the `:app` module.

The standard structure separates concerns into layers. `:core:domain` holds interfaces and use cases — it has no DI framework dependency. `:core:data` implements those interfaces and provides Hilt bindings. Feature modules depend on `:core:domain` for abstractions and never see `:core:data` directly. This follows the Dependency Inversion Principle at the module level.

The `:app` module acts as the aggregation point. It depends on all feature modules and all core modules, so Hilt can discover every `@Module` and merge them into the final component at compile time. Feature modules never depend on each other — they communicate through shared abstractions in `:core:domain`.

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

**Key takeaway:** Each Gradle module provides what it owns. Feature modules depend on `:core:domain` (abstractions), not `:core:data` (implementations). The `:app` module aggregates everything, and Hilt merges all bindings at compile time.

### Lesson 5.2: Providing Dependencies Across Modules

The pattern for cross-module DI is straightforward. Core modules define `@Module`-annotated classes with their bindings. Feature modules consume those bindings through `@Inject` constructors. No explicit registration or wiring is needed in the `:app` module — Hilt's compile-time code generation discovers everything automatically.

The key rule: a `@Module` class must be in a Gradle module that can see all the types it references. A `NetworkModule` in `:core:network` can provide `Retrofit` and `OkHttpClient`. A `DataModule` in `:core:data` can bind `UserRepositoryImpl` to `UserRepository` because it depends on both `:core:domain` (for the interface) and `:core:network` (for the API types).

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

**Key takeaway:** Hilt automatically discovers `@Module`-annotated classes in all Gradle modules in the dependency graph. Feature modules consume abstractions — they never reference implementation classes or Hilt modules from other layers.

### Lesson 5.3: Qualifier Organization in Multi-Module Projects

In multi-module projects, qualifiers should live in a shared `:core:common` module that all modules depend on. If qualifiers are defined in a leaf module, other modules can't reference them. Centralizing qualifiers ensures consistency and avoids duplicated qualifier definitions.

Define a `Qualifiers.kt` file in `:core:common` with all your project-wide qualifiers. Module-specific qualifiers (rare) can live in their own module, but dispatchers, base URLs, and other cross-cutting qualifiers should be centralized.

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

**Key takeaway:** Centralize qualifiers in `:core:common` so all modules can reference them. Dispatchers, scopes, and cross-cutting configuration qualifiers belong here.

### Lesson 5.4: API Module Pattern for Feature Isolation

For large apps with many feature modules, the API module pattern adds another layer of isolation. Each feature exposes a `:feature:X:api` module with only its public interfaces and data classes. The implementation lives in `:feature:X:impl`. Other features depend on the `:api` module only.

This prevents feature modules from accidentally depending on each other's implementation details. It also improves build times — changes to `:feature:checkout:impl` don't trigger recompilation of `:feature:profile` if the `:feature:checkout:api` hasn't changed.

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

**Key takeaway:** The API module pattern separates public contracts from implementations. Feature modules depend on each other's `:api` modules, never their `:impl` modules. This prevents tight coupling and improves build times.

### Lesson 5.5: Avoiding Common Multi-Module DI Mistakes

Several patterns that work fine in single-module apps become problems at scale. Understanding these anti-patterns helps you build a DI architecture that stays clean as the project grows.

The most common mistake is putting all Hilt modules in the `:app` module. This creates a God module that knows about every implementation detail in the project. As the app grows, this module becomes a merge conflict magnet and defeats the purpose of modularization. Each module should define its own Hilt modules.

Another pitfall is feature modules depending on `:core:data` directly instead of `:core:domain`. This means the feature module can see implementation classes and accidentally couple to them. The fix is simple: feature modules should only have `implementation` dependencies on `:core:domain`, never on `:core:data`.

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

**Key takeaway:** Each Gradle module should define its own Hilt modules. Feature modules should depend on `:core:domain` for abstractions, not `:core:data` for implementations. Avoid God modules in `:app` that centralize all bindings.

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

KAPT is also incompatible with the K2 compiler. If your project uses KAPT, you're pinned to `languageVersion = "1.9"`. You cannot adopt K2, which means you miss out on faster compilation, better type inference, and smarter smart casts. In a multi-module project, one module using KAPT forces every module to stay on the legacy compiler. KSP is fully compatible with K2 because it was designed to work with Kotlin's compiler infrastructure directly.

**Key takeaway:** KAPT generates Java stubs before running Dagger's Java annotation processor — this is expensive and blocks K2 adoption. KSP eliminates the stub generation step, giving ~2x build speedup. Migrate from KAPT to KSP by changing `kapt(...)` to `ksp(...)` in your build file.

### Lesson 6.2: What Dagger Generates — Factory Classes

When Dagger processes your `@Inject constructor`, it generates a factory class. This factory implements `Provider<T>` and knows how to create your class with all its dependencies resolved. Understanding this generated code demystifies what Dagger actually does — it's not magic, it's code generation.

For each class with `@Inject constructor`, Dagger generates a `_Factory` class. This factory has a `get()` method that calls the constructor with the right dependencies. The factory itself receives `Provider<T>` for each dependency, which enables lazy instantiation and scoping.

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

The `Provider<T>` wrapper is the key to Dagger's flexibility. When the binding is unscoped, `provider.get()` calls the factory every time, creating a new instance. When scoped with `@Singleton`, Dagger wraps the provider in a `DoubleCheck` that ensures lazy, thread-safe singleton creation.

**Key takeaway:** Dagger generates a `_Factory` class for each `@Inject constructor`. The factory uses `Provider<T>` wrappers for lazy, potentially-scoped instantiation. There's no reflection — everything is plain constructor calls at runtime.

### Lesson 6.3: What Dagger Generates — Module Methods

For `@Provides` methods, Dagger generates a similar factory class. Each `@Provides` method gets its own factory that calls the module method with the resolved dependencies. For `@Binds` methods, Dagger is more efficient — it doesn't generate a separate factory at all.

When you use `@Binds`, Dagger simply maps the interface type to the implementation's existing factory. This is why `@Binds` is more efficient than `@Provides` for interface mappings — it eliminates one layer of indirection and one generated class.

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

**Key takeaway:** Each `@Provides` method generates its own factory class. `@Binds` generates nothing — it directly maps the interface to the implementation's existing factory. This is why `@Binds` is the better choice for simple interface-to-implementation mappings.

### Lesson 6.4: What Dagger Generates — The Component

The component is the heart of the generated code. Dagger generates a class (e.g., `DaggerAppComponent`) that implements your `@Component` interface. This class holds all the providers, wires them together, and exposes the accessor methods you declared.

For Hilt, the generated component hierarchy is more complex because Hilt manages multiple component levels (Singleton, Activity, ViewModel, etc.). But the principle is the same — a generated class that holds providers and wires dependencies. Hilt also generates bytecode transformations that inject into `@AndroidEntryPoint`-annotated Activities and Fragments.

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

Notice how `DoubleCheck.provider()` wraps `@Singleton`-scoped bindings. `DoubleCheck` uses double-checked locking to ensure thread-safe lazy initialization — the instance is created on first access and reused on subsequent calls. Unscoped bindings (like `userApiProvider`) call the factory directly without `DoubleCheck`.

**Key takeaway:** Dagger generates a component class that wires all providers together. `@Singleton` bindings use `DoubleCheck` for thread-safe lazy singleton creation. The entire graph is validated and wired at compile time — no reflection at runtime.

### Lesson 6.5: Hilt's Bytecode Transformation

Hilt adds a layer on top of Dagger's generated code. When you annotate an Activity with `@AndroidEntryPoint`, Hilt doesn't just generate a Dagger component — it also performs bytecode transformation to inject dependencies into the Activity's lifecycle.

Under the hood, Hilt generates a base class that your Activity extends (via bytecode rewriting). This base class overrides `onCreate()` to perform injection before your code runs. This is why `@Inject lateinit var` fields are available in `onCreate()` — they're set before your `onCreate()` body executes.

Hilt also generates the component hierarchy automatically. Instead of manually defining `@Component`, `@Subcomponent`, and their factories (which is what raw Dagger requires), Hilt creates the standard Android component tree — `SingletonComponent`, `ActivityComponent`, `FragmentComponent`, etc. — and wires them together. This eliminates a huge amount of boilerplate that made raw Dagger tedious.

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

**Key takeaway:** Hilt uses bytecode transformation to inject dependencies into Android components. Your Activity is rewritten at compile time to extend a generated base class that handles component creation and injection. This is why `@Inject` fields are available in `onCreate()`.

### Lesson 6.6: Graph Validation and Error Messages

One of Dagger/Hilt's greatest strengths is compile-time graph validation. The entire dependency graph is analyzed during compilation, and missing bindings, circular dependencies, and scope violations are reported as compile errors — not runtime crashes.

Dagger uses Tarjan's algorithm and topological sorting to validate the graph. It builds a directed acyclic graph (DAG) of all bindings and checks that every dependency can be resolved. If you have a circular dependency (A needs B, B needs C, C needs A), Dagger detects it and reports a clear error with the cycle path.

Understanding how to read Dagger's error messages saves significant debugging time. The most common error — "missing binding" — tells you exactly which type is missing and where it's needed. The fix is usually adding a `@Provides` method, a `@Binds` declaration, or an `@Inject constructor`.

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

**Key takeaway:** Dagger validates the entire dependency graph at compile time using graph algorithms. Missing bindings, circular dependencies, and scope violations are compile errors. Learn to read Dagger's error messages — they tell you exactly what's wrong and where.

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

The biggest payoff of constructor injection is unit testing. When every dependency is a constructor parameter, you don't need a DI framework in tests at all. You create the class under test directly, passing fake implementations for each dependency. No Hilt, no setup, no component hierarchy.

This is the fastest and most reliable way to test. Each test constructs its own instance with fresh fakes, so there's no shared state between tests. The test is a pure Kotlin function — it runs on any machine without an emulator, Android framework, or Hilt test rules.

The pattern is simple: create fake implementations of your interfaces, construct the class under test with those fakes, configure the fake's behavior, call the method under test, and assert the result.

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

**Key takeaway:** Unit tests don't need a DI framework. Constructor injection means you pass fakes directly — no Hilt setup, no emulator, no overhead. Each test gets fresh fakes with no shared state.

### Lesson 7.2: Fakes vs Mocks

There are two approaches to test doubles: fakes and mocks. Fakes are real implementations with simplified behavior — an in-memory repository instead of one backed by a database. Mocks use libraries like Mockito or MockK to create objects that record calls and return configured values.

Fakes are generally preferred for repositories and data sources because they actually execute logic. A fake repository that stores data in a `MutableMap` behaves like a real repository — you can insert data, query it, update it, and verify the state. Mocks verify interactions ("was this method called?") but don't actually do anything.

The tradeoff: fakes require writing and maintaining real code, while mocks are quick to set up. For core abstractions used across many tests (repositories, APIs), invest in fakes. For one-off dependencies (analytics, loggers), mocks or simple fakes are fine.

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

**Key takeaway:** Prefer fakes over mocks for core abstractions like repositories. Fakes have real behavior and catch bugs that interaction-based mocking misses. Reserve mocks for one-off dependencies where writing a full fake isn't worth the effort.

### Lesson 7.3: Hilt Integration Tests with @UninstallModules

For integration tests and UI tests that need the full Hilt component hierarchy, use `@HiltAndroidTest`. This sets up Hilt's injection infrastructure in your test. To replace production dependencies with test fakes, use `@UninstallModules` to remove the production module and provide a test module with fake bindings.

The pattern is: annotate the test class with `@HiltAndroidTest`, add a `HiltAndroidRule`, uninstall the production module, define a test module with fake bindings, and inject the fakes into the test class so you can configure them.

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

**Key takeaway:** Use `@HiltAndroidTest` + `@UninstallModules` for integration tests that need the full Hilt graph with fake dependencies. Unit tests should use plain constructor injection without Hilt.

### Lesson 7.4: TestInstallIn — Global Test Replacements

When you want to replace a production binding for all test classes (not just one), use `@TestInstallIn`. This replaces a production module globally in the test build — no need for `@UninstallModules` on every test class.

`@TestInstallIn` is useful for cross-cutting concerns like analytics (you never want real analytics in tests), crash reporting, or network clients. Define the test module in your `androidTest` source set, and it automatically replaces the production module.

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

**Key takeaway:** Use `@TestInstallIn` for dependencies you always want to fake in tests — analytics, crash reporting, remote config. It replaces the production module globally so you don't need `@UninstallModules` on every test class.

### Lesson 7.5: Testing Dispatchers with Hilt

Testing coroutine-based code requires controlling dispatchers. The standard pattern is to inject dispatchers through Hilt qualifiers and replace them with `StandardTestDispatcher` or `UnconfinedTestDispatcher` in tests. This gives your tests deterministic control over coroutine execution.

For unit tests, just pass the test dispatcher directly. For integration tests, provide a test module that replaces the dispatcher bindings.

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

**Key takeaway:** Always inject dispatchers through qualifiers so you can replace them in tests. Use `StandardTestDispatcher` for deterministic control or `UnconfinedTestDispatcher` for simpler tests where ordering doesn't matter.

### Lesson 7.6: The Testing Pyramid with DI

DI should inform your testing strategy. Constructor-injected classes are trivially unit-testable — these form the base of your testing pyramid. Integration tests with `@HiltAndroidTest` verify that Hilt wiring works correctly. End-to-end tests verify the full app.

The vast majority of your tests should be unit tests using plain constructor injection. They're fast, reliable, and easy to write. Integration tests should focus on verifying that the DI graph is correctly wired and that components interact correctly. End-to-end tests are expensive — use them sparingly for critical user flows.

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

**Key takeaway:** Unit tests with constructor injection form the base of your pyramid — fast, reliable, no framework. Integration tests verify DI wiring. E2E tests cover critical flows. DI makes all three levels easier by decoupling dependencies.

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

Koin is popular in Kotlin Multiplatform projects because it has no platform-specific code generation requirements. It works identically on Android, iOS, desktop, and server-side Kotlin. For small projects or prototypes where compile-time safety is less critical, Koin's simplicity is attractive.

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

**Key takeaway:** Koin uses a runtime DSL with no code generation. It's simpler to set up but catches missing bindings at runtime, not compile time. Good for KMP projects and prototypes, but risky for large production apps.

### Lesson 8.2: Koin Scoping and Qualifiers

Koin supports scoping through `scope` blocks and qualifiers through `named()`. Scopes are tied to lifecycle owners — you can scope dependencies to an Activity, Fragment, or custom scope. Qualifiers distinguish same-type bindings, similar to Hilt's `@Qualifier`.

The key difference from Hilt is that scope violations aren't caught at compile time. If you access a scope that's already been closed, you get a runtime exception. This means you need to be more careful about lifecycle management.

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

**Key takeaway:** Koin supports scoping and qualifiers through its DSL, but violations are runtime errors. Hilt catches these at compile time. If you're using Koin, write thorough integration tests to catch missing or mis-scoped bindings.

### Lesson 8.3: Koin Verify — Compile-Time-Like Checks

Koin 3.4+ introduced `verify()` — a function that checks your module definitions at test time. While not true compile-time validation, it gives you a safety net by verifying that all bindings can be resolved before the app ships.

You write a unit test that calls `verify()` on each Koin module. If any `get()` call would fail at runtime, the test fails. This doesn't catch everything (it can't verify lifecycle scoping), but it catches the most common error — missing bindings.

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

**Key takeaway:** Use `verify()` in tests to catch missing Koin bindings before shipping. It's not as good as compile-time validation, but it's the best safety net Koin offers.

### Lesson 8.4: Manual DI for Libraries and SDKs

Manual DI — a container class that wires dependencies together — is the right choice for libraries and SDKs. Adding Hilt or Koin as a transitive dependency to your library forces consumers to use the same framework and version. Manual DI has zero external dependencies.

The pattern is a single entry point class (often called `Client` or `SDK`) that takes configuration parameters and internally constructs all dependencies. Consumers create the entry point and use it — they never see the internal dependency wiring.

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

**Key takeaway:** Use manual DI for libraries and SDKs to avoid leaking DI framework dependencies to consumers. A builder pattern provides a clean public API while internally managing the dependency graph.

### Lesson 8.5: Koin to Hilt Migration Path

If you're on Koin and want to move to Hilt, the migration is mechanical. Koin's `module { }` DSL maps to Hilt's `@Module`/`@Provides`/`@Binds`. Koin's `single { }` maps to `@Singleton`. Koin's `get()` is replaced by Hilt's automatic resolution. Koin's `viewModel { }` maps to `@HiltViewModel`.

The biggest change is mindset: Koin's runtime resolution (`get()` looks up the type at runtime) is replaced by Hilt's compile-time resolution (dependencies are wired during compilation). You'll discover missing bindings that Koin was hiding — classes that happened to be in the graph but weren't explicitly declared.

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

The key changes: `startKoin {}` → `@HiltAndroidApp`, `module {}` → `@Module` classes with `@Provides`/`@Binds`, `by viewModel()` (Koin) → `by viewModels()` (AndroidX + Hilt), and all implementations get `@Inject constructor`.

**Key takeaway:** Koin-to-Hilt migration is mechanical — DSL blocks become annotated classes. The real benefit is moving from runtime resolution to compile-time safety. Expect to fix some bindings that Koin was silently ignoring.

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

```kotlin
// Metro setup — just a Gradle plugin, no annotation processor
plugins {
    id("dev.zacsweers.metro") version "<version>"
}
// That's it. No kapt, no KSP, no additional dependencies.
```

**Key takeaway:** Metro is a Kotlin compiler plugin that replaces Dagger, Hilt, and Anvil. It operates inside the Kotlin compiler itself, generating code directly into IR — no annotation processing, no generated source files. It supports K2 and Kotlin Multiplatform natively.

### Lesson 9.2: Metro's Core API — @Inject, @Provides, @DependencyGraph

Metro's API will feel familiar if you've used Dagger. `@Inject` for constructor injection, `@Provides` for explicit bindings, `@DependencyGraph` instead of `@Component`. But the differences go deeper than naming.

Constructor injection uses `@Inject` on the class itself (not the constructor). Metro's compiler sees the annotation, resolves dependencies from the graph, and generates a factory. Default parameter values work as optional dependencies — if a binding doesn't exist in the graph, the default kicks in. This is impossible with annotation processing because Java/KSP processors can't see Kotlin's default values.

`@DependencyGraph` replaces Dagger's `@Component`. You declare an interface with accessor properties for the types you need, and Metro generates the implementation at compile time. For simple graphs, `createGraph<AppGraph>()` creates the graph directly. For graphs with runtime parameters, define a `@DependencyGraph.Factory`.

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

**Key takeaway:** Metro's core API mirrors Dagger's concepts with Kotlin-native enhancements. `@Inject` goes on the class, default parameters are optional bindings, `@DependencyGraph` replaces `@Component`. No `@Module` annotation — providers live in interfaces that the graph extends.

### Lesson 9.3: Scoping and Graph Hierarchy

Metro uses `@SingleIn` to scope bindings to a specific graph. When a binding is annotated with `@SingleIn(AppScope::class)`, Metro generates a `DoubleCheck`-backed provider that ensures lazy, thread-safe singleton behavior within that graph instance — the same approach Dagger uses internally.

For parent-child graph hierarchies, Metro uses `@GraphExtension` — similar to Dagger's subcomponents. A graph extension inherits all bindings from its parent and adds its own. The parent graph exposes the extension's factory, and you create child graphs with runtime parameters.

Metro enforces that scoped bindings match their graph's scope at compile time — a binding scoped to `UserScope` in an `AppScope` graph is a compile error. This is stricter than Dagger in some cases, but it catches scope mismatches that Dagger silently accepts.

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

**Key takeaway:** `@SingleIn(Scope::class)` scopes bindings to a graph. `@GraphExtension` creates child graphs that inherit parent bindings. Metro validates scope consistency at compile time — mismatches are compile errors.

### Lesson 9.4: Anvil-Style Aggregation with @ContributesBinding

The feature that made Anvil indispensable for large projects was `@ContributesBinding` and `@ContributesTo` — the ability to declare bindings in the modules where they belong and have them automatically aggregated into the right graph. Metro carries this forward as a first-class feature.

With `@ContributesBinding`, you annotate an implementation class and Metro automatically binds it to its supertype in the specified scope's graph. No module file needed. The binding is declared where the implementation lives — in the feature module, not in a centralized God module.

`@ContributesTo` works similarly for provider interfaces — Metro merges contributed interfaces into the graph automatically. Both annotations support `replaces` for test overrides and are repeatable for contributing to multiple scopes.

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

**Key takeaway:** `@ContributesBinding` eliminates centralized module files. Bindings are declared where implementations live and automatically aggregated into the right graph. This scales well for multi-module projects — no God modules, no manual registration.

### Lesson 9.5: Metro's Build Performance

Metro's compiler plugin architecture delivers measurable build performance improvements. In a 500-module benchmark, Metro was 584% faster than Dagger KSP for ABI-breaking changes (17.5s vs 119.6s). For non-ABI changes, Metro and kotlin-inject were nearly identical at ~11.5s, while Dagger KAPT lagged at 23.2s.

These improvements come from two sources. First, Metro avoids the extra frontend compiler invocations that KAPT and KSP require to analyze sources and generate new ones. Second, generating directly to FIR/IR means the generated code doesn't need a separate compilation pass — it gets lowered directly into target platform code alongside your own code.

Real-world results confirm the benchmarks. Cash App reported ~59% faster incremental builds and 16% faster clean builds after migrating their 1,500-module codebase. Freeletics saw 40-55% faster ABI changes across 551 modules. BandLab measured 55% faster incremental builds on their 929-module project.

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

**Key takeaway:** Metro is significantly faster than Dagger because it generates code inside the compiler in a single pass, eliminating the extra compilation steps that annotation processing requires. Production teams report 40-60% faster incremental builds.

### Lesson 9.6: Assisted Injection and Member Injection

Metro supports assisted injection for classes that need runtime arguments alongside injected dependencies. The pattern is similar to Dagger's `@AssistedInject` but with a cleaner Kotlin-native API. Unlike Dagger, Metro can inject into `private` members and `private` constructors because it operates inside the compiler.

Member injection works for classes you can't constructor-inject, like Android Activities. In Dagger, injected members must be public or package-private (Java limitation). In Metro, they can be `private` — the compiler plugin has full visibility.

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

**Key takeaway:** Metro supports assisted injection and member injection with the same patterns as Dagger, but with Kotlin-native improvements. Private members can be injected because Metro operates inside the compiler, not through external annotation processing.

### Lesson 9.7: Metro vs Dagger/Hilt — When to Choose What

For new Kotlin projects — especially Kotlin Multiplatform projects — Metro is the strongest choice. It's Kotlin-native, compile-time safe, fast, and supports all KMP targets (JVM, Android, JS, WASM, Native). The API is clean, familiar, and takes advantage of Kotlin language features that Dagger can't use.

For existing Hilt projects, migration is feasible but not trivial. Metro's interop mode can understand Dagger and Anvil annotations during migration, so you don't need a big-bang rewrite. But you'll need to fix nullability mismatches, convert `@Component.Builder` to `@Component.Factory`, and handle Metro's stricter validation. The migration path is incremental — some modules on Metro, others still on Dagger, all composing into the same graph.

For Android-only projects starting fresh, Hilt is still a reasonable choice due to its deep integration with Jetpack (ViewModel, WorkManager, Navigation) and extensive documentation. But Metro is rapidly catching up in ecosystem support and offers significantly better build performance.

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

A real production bug I've seen: a `UserSessionManager` was scoped as `@Singleton`. When user A logged out and user B logged in, the singleton still held user A's cached session data. User B briefly saw user A's profile. The fix was clearing the session on logout, but the real fix was questioning whether the session manager needed to be a process-lifetime singleton in the first place.

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

**Key takeaway:** Match a dependency's scope to its natural lifetime. Singletons for app infrastructure (HTTP clients, databases). ViewModel-scoped for screen state. Unscoped for stateless logic. Over-scoping causes data leakage. Under-scoping causes waste.

### Lesson 10.2: Interface Segregation in DI

Not every class needs an interface. The blanket advice "always program to an interface" leads to unnecessary abstraction — a `UserRepository` interface with exactly one implementation and no plans for a second. The overhead of maintaining the interface, the binding, and the implementation isn't worth it.

Use interfaces when: (1) you have or plan to have multiple implementations, (2) you need to substitute fakes in tests and the class has complex behavior worth faking, or (3) the interface crosses a module boundary (`:core:domain` defines it, `:core:data` implements it). For simple classes, `@Inject constructor` is enough.

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

**Key takeaway:** Don't create interfaces for every class. Use interfaces when you have multiple implementations, need test fakes for complex behavior, or cross module boundaries. For simple, single-implementation classes, `@Inject constructor` is cleaner.

### Lesson 10.3: Organizing Hilt Modules at Scale

As your project grows, module organization matters. The pattern that scales best: one Hilt module per concern, located in the Gradle module that owns the implementations. Avoid God modules that centralize all bindings.

Name modules clearly: `NetworkModule` provides network infrastructure, `UserDataModule` binds user-related repositories, `AnalyticsModule` provides analytics implementations. When a module gets too large (10+ bindings), split it by sub-concern.

A useful convention: `@Provides`-only modules are `object`s (concrete). `@Binds`-only modules are `abstract class`es. When you need both for the same feature, create two modules with a clear naming convention (`AuthNetworkModule` for `@Provides`, `AuthBindingsModule` for `@Binds`).

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

**Key takeaway:** One Hilt module per concern, located in the Gradle module that owns the implementations. Split large modules by sub-concern. Use clear naming conventions to distinguish `@Provides` and `@Binds` modules.

### Lesson 10.4: KAPT to KSP Migration

If you're still using KAPT for Dagger/Hilt, migrating to KSP is one of the highest-impact build performance improvements you can make. The migration is a build file change — no Kotlin source code changes required.

KAPT generates Java stubs for all Kotlin files before running annotation processors. KSP eliminates this step by plugging directly into the Kotlin compiler. The result is typically a 2x build speedup, and more importantly, KSP unblocks the K2 compiler. KAPT pins you to `languageVersion = "1.9"` and prevents K2 adoption.

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

After migration, remove the `kapt` plugin if no other dependencies use it. Run a clean build to verify everything compiles. The `kaptGenerateStubs` task disappears from your build timeline — that's where the time savings come from.

**Key takeaway:** Migrate from KAPT to KSP by changing `kapt(...)` to `ksp(...)` in your build file. No source code changes needed. You get ~2x build speedup and unblock K2 compiler adoption.

### Lesson 10.5: Migrating from Dagger to Metro

If build performance is a pain point and you're ready for the next generation, Metro offers an incremental migration path from Dagger. The key is Metro's interop mode, which understands Dagger and Anvil annotations without requiring you to change them.

Cash App's migration approach is the template to follow: set up a dual-build system with a Gradle property flag, run CI in both modes, fix what Metro's stricter validation catches, and gradually flip the default. The interop configuration lets your existing `@Inject`, `@Provides`, `@Module`, and `@ContributesTo` annotations work unchanged.

The common issues you'll encounter: duplicate module includes (Dagger tolerates, Metro flags), `@Component.Builder` needs conversion to `@Component.Factory`, scope annotations on `@Binds` methods should move to implementation classes, and nullable type mismatches that Dagger's Java heritage silently accepted.

```kotlin
// gradle.properties — dual build flag
di.implementation=Dagger  # or Metro

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

**Key takeaway:** Metro's interop mode lets you migrate incrementally from Dagger without rewriting annotations. Use a dual-build system for safety. Fix stricter validation issues (duplicate modules, scope placement, nullability). Most fixes are tech debt cleanup that should have been done anyway.

### Lesson 10.6: DI Decision Framework

Choosing the right DI approach depends on your project's size, requirements, and constraints. Here's a decision framework based on real-world tradeoffs.

For **new Android-only projects**: Start with Hilt. It has the best Jetpack integration, the most documentation, and compile-time safety. Switch to Metro when build performance becomes a bottleneck or when you want to adopt K2 with KAPT holdouts.

For **new Kotlin Multiplatform projects**: Use Metro (or kotlin-inject as an alternative). Hilt and Dagger are Android-only. Koin works on KMP but lacks compile-time safety.

For **libraries and SDKs**: Use manual DI. Never leak a DI framework as a transitive dependency to your consumers.

For **small apps or prototypes**: Koin is fine. The speed of setup outweighs the risk of runtime resolution for small codebases. Migrate to Hilt or Metro if the app grows.

For **existing Dagger projects with build pain**: Evaluate Metro with its interop mode. The dual-build approach lets you prove the migration works before committing.

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
