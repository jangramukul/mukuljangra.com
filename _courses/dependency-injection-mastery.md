---
title: "Dependency Injection Mastery"
layout: course
description: "Master DI in Android — Hilt, Dagger, Koin, manual DI, scoping, multi-module architecture, and testing patterns."
icon: "💉"
color: "#f472b6"
difficulty: "Beginner to Advanced"
modules: 7
lessons: 33
duration: "4 weeks"
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
prerequisites:
  - "Kotlin fundamentals"
  - "Android architecture basics (MVVM)"
  - "Basic understanding of interfaces and abstraction"
---

## Module 1: Why Dependency Injection

### Lesson 1.1: The Problem Without DI

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

**Key takeaway:** DI means a class receives its dependencies instead of creating them. This makes code testable, modular, and flexible.

### Lesson 1.2: Constructor vs Field vs Method Injection

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

**Key takeaway:** Always prefer constructor injection. It makes dependencies explicit, enforces immutability, and works naturally with testing.

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

The refactored class receives its dependencies through the constructor. This means you can pass fake implementations in tests without needing any framework — just plain Kotlin constructors.

---

## Module 2: Hilt — The Standard

### Lesson 2.1: Hilt Setup

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
// Application class
@HiltAndroidApp
class MyApp : Application()

// Activity
@AndroidEntryPoint
class MainActivity : ComponentActivity()
```

### Lesson 2.2: Providing Dependencies with Modules

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

### Lesson 2.3: @Binds for Interface Binding

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

// The implementation uses @Inject constructor
class UserRepositoryImpl @Inject constructor(
    private val api: UserApi,
    private val dao: UserDao,
) : UserRepository {
    // ...
}
```

**Key takeaway:** Use `@Provides` when you construct the object yourself (third-party libraries, builders). Use `@Binds` when mapping an interface to its implementation. `@Binds` is more efficient — it doesn't generate a factory class.

### Quiz: Hilt — The Standard

#### What annotation must be placed on your `Application` class to enable Hilt?

- ❌ @AndroidEntryPoint
- ✅ @HiltAndroidApp
- ❌ @InstallIn
- ❌ @Module

> **Explanation:** `@HiltAndroidApp` triggers Hilt's code generation and sets up the application-level dependency container. `@AndroidEntryPoint` is used on Activities, Fragments, and other Android components — not the Application class.

#### When should you use `@Binds` instead of `@Provides`?

- ❌ When providing third-party library instances
- ❌ When you need to call a builder pattern
- ✅ When mapping an interface to its existing implementation class
- ❌ When creating unscoped dependencies

> **Explanation:** `@Binds` tells Hilt which implementation to use for an interface. It's more efficient than `@Provides` because Hilt doesn't generate a separate factory — it just wires the binding directly. `@Provides` is for cases where you need to construct the object yourself.

#### What does `@InstallIn(SingletonComponent::class)` mean on a Hilt module?

- ❌ The module is only used in unit tests
- ❌ The module provides exactly one dependency
- ❌ The module is installed only once per build
- ✅ The module's bindings are available for the entire application lifetime

> **Explanation:** `@InstallIn(SingletonComponent::class)` attaches the module to the application-level component, making its bindings available throughout the app's lifecycle. The component you install into determines the lifetime and scope of the provided dependencies.

### Coding Challenge: Create a Hilt Module

Create a Hilt module that provides an `AuthApi` (via Retrofit) and binds an `AuthRepository` interface to its implementation.

#### Solution

```kotlin
// Interface and implementation
interface AuthRepository {
    suspend fun login(email: String, password: String): AuthToken
}

class AuthRepositoryImpl @Inject constructor(
    private val api: AuthApi,
) : AuthRepository {
    override suspend fun login(email: String, password: String): AuthToken {
        return api.login(LoginRequest(email, password))
    }
}

// Hilt module — @Provides for Retrofit-created API, @Binds for interface mapping
@Module
@InstallIn(SingletonComponent::class)
object AuthNetworkModule {
    @Provides
    fun provideAuthApi(retrofit: Retrofit): AuthApi =
        retrofit.create(AuthApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthBindingsModule {
    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository
}
```

`@Provides` is used for `AuthApi` because Retrofit creates the instance via `retrofit.create()`. `@Binds` is used for `AuthRepository` because we're simply telling Hilt that `AuthRepositoryImpl` is the implementation to use.

---

## Module 3: Hilt Scoping and Components

### Lesson 3.1: Component Hierarchy

```
SingletonComponent        (Application lifetime)
├── ActivityRetainedComponent  (Survives config changes)
│   ├── ViewModelComponent     (ViewModel lifetime)
│   └── ActivityComponent      (Activity lifetime)
│       ├── FragmentComponent  (Fragment lifetime)
│       └── ViewComponent      (View lifetime)
└── ServiceComponent           (Service lifetime)
```

### Lesson 3.2: Scoping Dependencies

```kotlin
// Singleton — one instance for the entire app
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideAuthManager(): AuthManager = AuthManagerImpl()
}

// ViewModel-scoped — survives config changes, cleared when ViewModel clears
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,
) : ViewModel()

// Activity-scoped — new instance per Activity
@Module
@InstallIn(ActivityComponent::class)
abstract class ActivityModule {
    @Binds
    @ActivityScoped
    abstract fun bindNavigator(impl: NavigatorImpl): Navigator
}
```

### Lesson 3.3: Qualifiers

```kotlin
// Define qualifiers for same-type dependencies
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class MainDispatcher

@Module
@InstallIn(SingletonComponent::class)
object DispatcherModule {

    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO

    @Provides
    @MainDispatcher
    fun provideMainDispatcher(): CoroutineDispatcher = Dispatchers.Main
}

// Usage
class UserRepository @Inject constructor(
    private val api: UserApi,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    suspend fun getUser(id: String) = withContext(ioDispatcher) {
        api.getUser(id)
    }
}
```

**Key takeaway:** Scope dependencies to the smallest lifecycle that makes sense. `@Singleton` for app-wide state, `ViewModelComponent` for screen state. Unscoped dependencies create new instances on every injection — which is fine for lightweight objects.

### Quiz: Hilt Scoping and Components

#### What happens when you do NOT apply a scope annotation (like `@Singleton`) to a `@Provides` function?

- ❌ Hilt throws a compile-time error
- ❌ The dependency is automatically scoped to `SingletonComponent`
- ✅ A new instance is created every time the dependency is injected
- ❌ The dependency is scoped to `ActivityComponent` by default

> **Explanation:** Without a scope annotation, Hilt treats the binding as unscoped, meaning a fresh instance is created on every injection. This is fine for lightweight, stateless objects but wrong for things like databases or auth managers that should be shared.

#### Why do you need `@Qualifier` annotations?

- ❌ To mark dependencies as optional
- ✅ To distinguish between multiple bindings of the same type
- ❌ To make dependencies available across modules
- ❌ To enable compile-time validation

> **Explanation:** When you have multiple bindings of the same type (e.g., `@IoDispatcher` and `@MainDispatcher` both providing `CoroutineDispatcher`), Hilt can't tell which one to inject. Qualifiers disambiguate same-type bindings.

#### Which Hilt component survives configuration changes like screen rotation?

- ❌ ActivityComponent
- ✅ ActivityRetainedComponent
- ❌ FragmentComponent
- ❌ SingletonComponent

> **Explanation:** `ActivityRetainedComponent` is tied to the `ViewModel` lifecycle internally and survives configuration changes. `ActivityComponent` is destroyed and recreated on rotation. `SingletonComponent` also survives but has application-wide scope, which is broader than needed.

### Coding Challenge: Scoped Qualifiers for Base URLs

Create two qualified string bindings — one for a production base URL and one for a staging base URL — and inject the correct one into a `ConfigManager` class.

#### Solution

```kotlin
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ProductionUrl

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class StagingUrl

@Module
@InstallIn(SingletonComponent::class)
object UrlModule {

    @Provides
    @ProductionUrl
    fun provideProductionUrl(): String = "https://api.myapp.com/"

    @Provides
    @StagingUrl
    fun provideStagingUrl(): String = "https://staging-api.myapp.com/"
}

class ConfigManager @Inject constructor(
    @ProductionUrl private val productionUrl: String,
    @StagingUrl private val stagingUrl: String,
) {
    fun getBaseUrl(isDebug: Boolean): String =
        if (isDebug) stagingUrl else productionUrl
}
```

Without `@ProductionUrl` and `@StagingUrl` qualifiers, Hilt would see two `String` bindings and fail at compile time with an ambiguous binding error. Qualifiers let Hilt know exactly which `String` to inject at each injection site.

---

## Module 4: Hilt with Jetpack

### Lesson 4.1: Hilt + ViewModel

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

// In Compose
@Composable
fun SearchScreen(viewModel: SearchViewModel = hiltViewModel()) {
    val results by viewModel.results.collectAsStateWithLifecycle()
    // ...
}
```

### Lesson 4.2: Hilt + Navigation Compose

```kotlin
@Composable
fun AppNavGraph(navController: NavHostController) {
    NavHost(navController, startDestination = "home") {
        composable("home") {
            // Each destination gets its own ViewModel instance
            val viewModel: HomeViewModel = hiltViewModel()
            HomeScreen(viewModel)
        }
        composable("profile/{userId}") { backStackEntry ->
            val viewModel: ProfileViewModel = hiltViewModel()
            ProfileScreen(viewModel)
        }
    }
}
```

### Lesson 4.3: Hilt + WorkManager

```kotlin
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val syncRepo: SyncRepository,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            syncRepo.syncAll()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
```

**Key takeaway:** Hilt integrates with ViewModel, Navigation, and WorkManager out of the box. Use `@HiltViewModel` with `hiltViewModel()` in Compose. Use `@HiltWorker` with `@AssistedInject` for WorkManager.

### Quiz: Hilt with Jetpack

#### What does `SavedStateHandle` give you inside a `@HiltViewModel`?

- ❌ Access to the Hilt dependency graph
- ❌ A handle to the Activity's saved instance state bundle
- ✅ A key-value store that survives process death and can be used with navigation arguments
- ❌ A reference to the Navigation back stack

> **Explanation:** `SavedStateHandle` persists data across process death and is automatically populated with navigation arguments. Hilt injects it automatically into `@HiltViewModel` constructors — no extra setup required.

#### Why does `@HiltWorker` use `@AssistedInject` instead of regular `@Inject`?

- ❌ WorkManager runs on a background thread
- ✅ `Context` and `WorkerParameters` are provided at runtime by WorkManager, not by Hilt
- ❌ Workers are singletons and need special construction
- ❌ `@AssistedInject` is faster than `@Inject`

> **Explanation:** WorkManager provides `Context` and `WorkerParameters` at runtime when it creates the worker. These can't come from Hilt's graph, so `@AssistedInject` marks them as "assisted" parameters supplied externally, while Hilt injects the remaining dependencies normally.

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

## Module 5: Multi-Module DI

### Lesson 5.1: Module Boundaries

```
:app              → @AndroidEntryPoint, assembles all modules
:feature:home     → HomeViewModel, HomeScreen
:feature:profile  → ProfileViewModel, ProfileScreen
:core:network     → NetworkModule, API interfaces
:core:database    → DatabaseModule, DAOs
:core:domain      → Use cases, repository interfaces
:core:data        → Repository implementations
```

```kotlin
// :core:network — provides Retrofit, OkHttp
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun provideRetrofit(): Retrofit = /* ... */
}

// :core:data — binds repository implementations
@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {
    @Binds @Singleton
    abstract fun bindUserRepo(impl: UserRepositoryImpl): UserRepository
}

// :feature:profile — consumes UserRepository
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository, // Hilt resolves this across modules
) : ViewModel()
```

**Key takeaway:** Each module provides what it owns and depends on what it needs. Hilt resolves dependencies across modules automatically as long as modules are in the dependency graph.

### Quiz: Multi-Module DI

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

### Coding Challenge: Multi-Module Hilt Wiring

Given a `:core:domain` module with a `PaymentRepository` interface and a `:core:data` module with its implementation, create the Hilt modules needed to wire them together so a `:feature:checkout` module can inject `PaymentRepository`.

#### Solution

```kotlin
// :core:domain — repository interface (no Hilt dependency needed)
interface PaymentRepository {
    suspend fun processPayment(amount: Double): PaymentResult
}

// :core:data — implementation with @Inject constructor
class PaymentRepositoryImpl @Inject constructor(
    private val paymentApi: PaymentApi,
    private val transactionDao: TransactionDao,
) : PaymentRepository {
    override suspend fun processPayment(amount: Double): PaymentResult {
        val result = paymentApi.charge(amount)
        transactionDao.insert(Transaction(amount, result.status))
        return result
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
) : ViewModel() {
    // paymentRepo is resolved from :core:data's binding
}
```

The `:feature:checkout` module only depends on `:core:domain` (for the interface). The `:core:data` module provides the Hilt binding. The `:app` module depends on both, so Hilt merges everything at compile time.

---

## Module 6: Testing with DI

### Lesson 6.1: Replacing Dependencies in Tests

```kotlin
@HiltAndroidTest
@UninstallModules(RepositoryModule::class)
class ProfileFeatureTest {

    @get:Rule
    val hiltRule = HiltAndroidRule(this)

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
        fakeRepo.setUser(testUser)
        // Launch Activity/Composable and verify UI shows testUser data
    }
}
```

### Lesson 6.2: Constructor Injection in Unit Tests

```kotlin
// No Hilt needed for unit tests — just construct with fakes
class ProfileViewModelTest {
    private val fakeRepo = FakeUserRepository()
    private val fakeAnalytics = FakeAnalytics()

    private val viewModel = ProfileViewModel(
        userRepo = fakeRepo,
        analytics = fakeAnalytics,
    )

    @Test
    fun `loads profile successfully`() = runTest {
        fakeRepo.setUser(testUser)
        viewModel.loadProfile("1")
        assertEquals(ProfileState.Success(testUser), viewModel.state.value)
    }
}
```

**Key takeaway:** Unit tests don't need a DI framework. Constructor injection means you just pass fakes directly. Only use `@HiltAndroidTest` for integration/UI tests where you need the full dependency graph.

### Quiz: Testing with DI

#### When should you use `@HiltAndroidTest` in your tests?

- ❌ For every test class that involves injected dependencies
- ❌ Only when testing `@HiltViewModel` classes
- ✅ For integration/UI tests that need the full Hilt dependency graph
- ❌ For unit tests that use fakes

> **Explanation:** `@HiltAndroidTest` sets up the full Hilt component hierarchy, which is only needed for instrumented/integration tests. Unit tests should just construct classes directly with fakes via constructor injection — no framework overhead needed.

#### What does `@UninstallModules(RepositoryModule::class)` do in a Hilt test?

- ❌ It removes the module from the production build
- ✅ It removes the module's bindings from the test's dependency graph so you can provide test replacements
- ❌ It uninstalls the Gradle module from the project
- ❌ It disables scope validation for that module

> **Explanation:** `@UninstallModules` tells Hilt to exclude the specified module when building the test component. This lets you replace production bindings (e.g., real repositories) with test bindings (e.g., fakes) by providing a test module with the same interface bindings.

#### Why is constructor injection preferred over field injection for testability?

- ❌ Constructor injection runs faster at runtime
- ❌ Field injection doesn't work with Kotlin
- ✅ Constructor injection lets you create objects with fakes directly — no DI framework needed in tests
- ❌ Field injection causes memory leaks in tests

> **Explanation:** With constructor injection, you simply call `MyClass(fakeDep1, fakeDep2)` in tests. Field injection requires a DI framework to set `@Inject lateinit var` fields, which adds unnecessary complexity to unit tests.

### Coding Challenge: Hilt Test with Fake Replacement

Write a Hilt integration test for a `CartActivity` that replaces the real `CartRepository` with a `FakeCartRepository` that returns a predefined list of cart items.

#### Solution

```kotlin
// Fake implementation
class FakeCartRepository @Inject constructor() : CartRepository {
    private val items = mutableListOf<CartItem>()

    fun setItems(cartItems: List<CartItem>) {
        items.clear()
        items.addAll(cartItems)
    }

    override suspend fun getItems(): List<CartItem> = items
}

// Hilt integration test
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
}
```

The test uninstalls the production `CartModule` and replaces it with `TestCartModule` that binds `FakeCartRepository`. The fake is also `@Inject`-able so Hilt can inject it into the test class itself, letting you configure test data before launching the Activity.

---

## Module 7: Alternatives — Koin and Manual DI

### Lesson 7.1: Koin

```kotlin
// Koin module definition
val appModule = module {
    single<UserApi> { Retrofit.Builder().build().create(UserApi::class.java) }
    single<UserRepository> { UserRepositoryImpl(get()) }
    viewModel { ProfileViewModel(get()) }
}

// Start Koin in Application
class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin {
            androidContext(this@MyApp)
            modules(appModule)
        }
    }
}

// Usage in Activity/Fragment
class ProfileFragment : Fragment() {
    private val viewModel: ProfileViewModel by viewModel()
}
```

**Koin vs Hilt** — Koin is simpler to set up (no code generation, no annotation processing). But dependency errors happen at runtime instead of compile time. For production apps, Hilt's compile-time safety is worth the setup cost.

### Lesson 7.2: Manual DI

```kotlin
// For small apps or when you want zero dependencies
class AppContainer(private val context: Context) {
    private val retrofit by lazy {
        Retrofit.Builder()
            .baseUrl("https://api.yourapp.com/")
            .build()
    }

    val userApi: UserApi by lazy { retrofit.create(UserApi::class.java) }
    val database: AppDatabase by lazy {
        Room.databaseBuilder(context, AppDatabase::class.java, "app.db").build()
    }
    val userRepository: UserRepository by lazy {
        UserRepositoryImpl(userApi, database.userDao())
    }
}

class MyApp : Application() {
    val container by lazy { AppContainer(this) }
}
```

**Key takeaway:** Use Hilt for production apps (compile-time safety). Consider Koin for rapid prototyping or KMP projects. Manual DI works for small apps but doesn't scale well.

### Quiz: Alternatives — Koin and Manual DI

#### What is the main disadvantage of Koin compared to Hilt?

- ❌ Koin doesn't support ViewModel injection
- ❌ Koin requires annotation processing
- ✅ Koin resolves dependencies at runtime, so missing bindings crash at runtime instead of failing at compile time
- ❌ Koin doesn't work with Kotlin coroutines

> **Explanation:** Koin uses a service locator pattern and resolves dependencies at runtime via `get()`. If a binding is missing, you won't know until the app crashes. Hilt validates the entire dependency graph at compile time, catching errors before the app ever runs.

#### When is manual DI (no framework) a reasonable choice?

- ❌ For apps with 50+ screens and complex navigation
- ❌ When you need scoped dependencies tied to Activity lifecycle
- ✅ For small apps or libraries where you want zero external dependencies
- ❌ When you need compile-time graph validation

> **Explanation:** Manual DI using a container class works well for small apps, SDKs, or libraries where adding a DI framework would be overkill. However, it becomes hard to maintain as the app grows because you manually manage scoping, lifecycle, and wiring.

### Coding Challenge: Koin to Hilt Migration

Migrate the following Koin setup to Hilt. Convert the module definition, Application class, and ViewModel injection.

**Koin version:**
```kotlin
val appModule = module {
    single<UserApi> { Retrofit.Builder().baseUrl("https://api.app.com/").build().create(UserApi::class.java) }
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

#### Solution

```kotlin
// Step 1: Application class — replace startKoin with @HiltAndroidApp
@HiltAndroidApp
class MyApp : Application()

// Step 2: Hilt module — replace Koin module DSL with @Module + @Provides/@Binds
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

// Step 3: Add @Inject constructor to implementation
class UserRepositoryImpl @Inject constructor(
    private val api: UserApi,
) : UserRepository

// Step 4: ViewModel — replace Koin viewModel() with @HiltViewModel
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepo: UserRepository,
) : ViewModel()

// Step 5: Fragment — replace Koin injection with @AndroidEntryPoint
@AndroidEntryPoint
class ProfileFragment : Fragment() {
    private val viewModel: ProfileViewModel by viewModels()
}
```

The key changes: `startKoin {}` → `@HiltAndroidApp`, `module {}` → `@Module` classes with `@Provides`/`@Binds`, `by viewModel()` (Koin) → `by viewModels()` (AndroidX + Hilt), and all implementations get `@Inject constructor`.

---

Thank You for completing the Dependency Injection Mastery course! DI is the backbone of clean, testable Android architecture. 💉
