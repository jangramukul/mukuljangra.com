---
title: Hilt Complete Guide
layout: post
sequence: 133
categories: post
tags:
  - Dependency Injection
  - Hilt
  - Android
---

The first time I set up Dagger on a production project, I spent an entire afternoon debugging a `MissingBinding` error that turned out to be a missing `@Component.Builder` method. The module was correct, the inject site was correct, but the wiring between them wasn't. Dagger is powerful — it generates the entire dependency graph at compile time with zero reflection — but the cost is boilerplate. You write components, subcomponents, component factories, scope annotations, and then wire them all together manually. On a team of five, at least two people didn't fully understand the graph, and every new feature meant touching the component hierarchy.

Hilt exists because Google's Android team looked at how developers actually used Dagger and realized that 90% of Android apps need the same component structure: one singleton component for the app, one per Activity, one per Fragment, one per ViewModel. So instead of making you build that hierarchy yourself, Hilt gives it to you out of the box. It's built on top of Dagger — every Hilt annotation generates real Dagger code underneath — but it removes the ceremony. You still get compile-time safety, zero reflection, and generated code you can read. You just don't have to write the plumbing anymore.

But here's the thing: Hilt's simplicity can be deceptive. If you don't understand what it's doing under the hood — what components exist, how scoping works, what `@InstallIn` actually means — you'll hit walls the moment your app grows beyond a few screens. This guide covers everything from setup to testing, with the internals you need to make good decisions.

## Setup and @HiltAndroidApp

Every Hilt app starts with one annotation on the `Application` class. This is non-negotiable — without it, nothing works.

```kotlin
@HiltAndroidApp
class MyApplication : Application() {
    // That's it. No component builder, no module list, no graph initialization.
}
```

What `@HiltAndroidApp` actually generates is significant. It creates a `SingletonComponent` — Hilt's root component — and attaches it to your Application instance. This component lives for the entire process lifetime and serves as the parent of every other component in the hierarchy. If you look at the generated code (in `build/generated/hilt/`), you'll see a class like `Hilt_MyApplication` that implements `GeneratedComponentManagerHolder`. It initializes the component lazily on first access, which means the dependency graph isn't built until something first requests an injection.

For Gradle, you need the Hilt plugin and the compiler dependency:

```kotlin
// build.gradle.kts (project-level)
plugins {
    id("com.google.dagger.hilt.android") version "2.56.2" apply false
}

// build.gradle.kts (app-level)
plugins {
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

dependencies {
    implementation("com.google.dagger:hilt-android:2.56.2")
    ksp("com.google.dagger:hilt-compiler:2.56.2")
}
```

One thing worth noting: Hilt used to require KAPT for annotation processing, but since Dagger 2.48+ it fully supports KSP. On a project I migrated recently, switching from KAPT to KSP cut the annotation processing time from 14 seconds to about 5 seconds per module. If you're still using KAPT with Hilt, switch — there's no reason not to.

## @Inject and Constructor Injection

Constructor injection is the foundation of Hilt, and I'd argue it's the cleanest way to wire dependencies in any system. You annotate a class's constructor with `@Inject`, and Hilt knows how to create that class and provide it wherever it's needed.

```kotlin
class OrderRepository @Inject constructor(
    private val orderApi: OrderApi,
    private val orderDao: OrderDao
) {
    suspend fun getOrders(): List<Order> {
        return try {
            val remote = orderApi.fetchOrders()
            orderDao.insertAll(remote)
            remote
        } catch (e: IOException) {
            orderDao.getAllOrders()
        }
    }
}
```

When Hilt sees `@Inject constructor`, it registers the class in the dependency graph automatically — no module needed, no `@Provides` method. If `OrderApi` and `OrderDao` are also in the graph (either through their own `@Inject` constructors or through modules), Hilt connects everything at compile time.

Constructor injection is preferred over field injection for three reasons. First, the dependencies are explicit — you can read the constructor and immediately know what collaborators the class needs. Second, the object is fully initialized from the moment it's created. No `lateinit var` that might throw `UninitializedPropertyAccessException` if something runs before injection completes. Third, constructor-injected classes are trivially testable — just pass fakes through the constructor in your test.

Field injection exists because Android forces it on you. Activities and Fragments are instantiated by the system — you don't control their constructors. For these, you use `@AndroidEntryPoint` and `@Inject lateinit var`:

```kotlin
@AndroidEntryPoint
class OrderActivity : AppCompatActivity() {

    @Inject lateinit var analyticsTracker: AnalyticsTracker

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // analyticsTracker is available here
        analyticsTracker.trackScreenView("orders")
    }
}
```

But everything behind those entry points — ViewModels, repositories, use cases, data sources — should use constructor injection exclusively. If you find yourself using `@Inject lateinit var` in a class you control, reconsider the design.

## Modules and @Provides

Constructor injection works great for classes you own. But for third-party libraries — Retrofit, Room, OkHttp — you can't annotate their constructors. That's what modules are for. A module is a class annotated with `@Module` that tells Hilt how to create instances it can't figure out on its own.

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            })
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl("https://api.myapp.com/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    fun provideOrderApi(retrofit: Retrofit): OrderApi {
        return retrofit.create(OrderApi::class.java)
    }
}
```

Notice how `provideRetrofit` takes `OkHttpClient` as a parameter. Hilt resolves this automatically — it sees that `provideOkHttpClient` produces an `OkHttpClient`, so it wires them together. You never manually call one provider from another.

`@InstallIn(SingletonComponent::class)` tells Hilt which component this module belongs to. This is critical because it determines the scope — bindings installed in `SingletonComponent` are available everywhere, while bindings installed in `ActivityComponent` are only available within Activities and their children.

For database dependencies, the pattern is the same:

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "myapp.db"
        ).build()
    }

    @Provides
    fun provideOrderDao(database: AppDatabase): OrderDao {
        return database.orderDao()
    }
}
```

Notice `provideOrderDao` isn't scoped with `@Singleton`. The DAO itself is a lightweight object — Room returns the same DAO instance from the same database, so there's no need to cache it. Scoping the database is enough.

For binding interfaces to implementations, use `@Binds` instead of `@Provides`. It generates less code because Hilt doesn't need a factory method — it just records the mapping:

```kotlin
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    abstract fun bindOrderRepository(
        impl: OrderRepositoryImpl
    ): OrderRepository
}
```

The catch is that the implementation (`OrderRepositoryImpl`) must have an `@Inject` constructor. If it does, `@Binds` is always preferred — on one project with 40+ modules, converting eligible `@Provides` to `@Binds` reduced generated classes by roughly 12%.

## Components and Scopes

This is where most Hilt confusion lives. Hilt defines a fixed component hierarchy, and each component has a corresponding scope annotation. The hierarchy looks like this:

- **SingletonComponent** (`@Singleton`) — lives as long as the Application. Created once, never destroyed until process death.
- **ActivityRetainedComponent** (`@ActivityRetainedScoped`) — survives configuration changes. Tied to ViewModel lifecycle internally.
- **ActivityComponent** (`@ActivityScoped`) — lives as long as an Activity instance. Destroyed on configuration change.
- **FragmentComponent** (`@FragmentScoped`) — lives as long as a Fragment instance.
- **ViewModelComponent** (`@ViewModelScoped`) — lives as long as a ViewModel. This is the one you'll use most often.
- **ViewComponent** (`@ViewScoped`) — lives as long as a View.
- **ServiceComponent** (`@ServiceScoped`) — lives as long as a Service.

Each component is a child of the one above it. A binding in `SingletonComponent` is accessible from every child component. A binding in `ViewModelComponent` is only accessible within that ViewModel's injection scope.

The common mistake is scoping everything as `@Singleton`. I've reviewed codebases where repositories, use cases, formatters, and even mapper classes were all singletons. The result was a massive root component that held references to everything, increased memory pressure, and made it impossible to garbage collect anything until process death.

My rule: only scope a dependency when **sharing the same instance matters for correctness**. An `OkHttpClient` should be a singleton because you want shared connection pools. A `Retrofit` instance should be a singleton because it caches reflection metadata. But a `OrderMapper` that converts DTOs to domain models? It holds no state — create a new one every time. Unscoped bindings are created fresh on each injection, and that's usually what you want.

```kotlin
// Over-scoped — this holds no state, why is it a singleton?
@Singleton
class OrderMapper @Inject constructor() {
    fun toDomain(dto: OrderDto): Order = Order(dto.id, dto.total)
}

// Correct — no scope annotation, created fresh each time
class OrderMapper @Inject constructor() {
    fun toDomain(dto: OrderDto): Order = Order(dto.id, dto.total)
}
```

The practical difference: `@ViewModelScoped` is your best friend for dependencies that should be shared across a single screen but cleaned up when the user leaves. A paginator, a form validator, a search debouncer — these belong in `ViewModelComponent`, not `SingletonComponent`.

## Qualifiers

When you have two different instances of the same type, Hilt can't distinguish them without help. This comes up constantly with networking — you might need one `Retrofit` for your main API and another for a third-party service, or one `OkHttpClient` with authentication and another without.

You can use `@Named` for quick cases:

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    @Named("authenticated")
    fun provideAuthenticatedClient(
        tokenProvider: TokenProvider
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenProvider))
            .build()
    }

    @Provides
    @Singleton
    @Named("public")
    fun providePublicClient(): OkHttpClient {
        return OkHttpClient.Builder().build()
    }
}
```

Then at the injection site:

```kotlin
class PaymentRepository @Inject constructor(
    @Named("authenticated") private val client: OkHttpClient
) { /* ... */ }

class PublicFeedRepository @Inject constructor(
    @Named("public") private val client: OkHttpClient
) { /* ... */ }
```

`@Named` works, but I prefer custom qualifier annotations. String-based qualifiers are fragile — a typo in the string compiles fine and crashes at runtime. Custom qualifiers are checked at compile time:

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
    fun provideAuthenticatedClient(
        tokenProvider: TokenProvider
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenProvider))
            .build()
    }

    @Provides
    @Singleton
    @PublicClient
    fun providePublicClient(): OkHttpClient {
        return OkHttpClient.Builder().build()
    }
}
```

The injection site reads more clearly too — `@AuthenticatedClient client: OkHttpClient` says exactly what it is without needing to check a string constant somewhere else. On larger teams, this prevents the "someone typo'd the qualifier string" class of bugs entirely.

## ViewModel Injection

Before Hilt, injecting ViewModels meant writing a custom `ViewModelProvider.Factory` for every ViewModel — or a generic factory that used reflection. Hilt eliminates this with `@HiltViewModel`:

```kotlin
@HiltViewModel
class OrderListViewModel @Inject constructor(
    private val repository: OrderRepository,
    private val analyticsTracker: AnalyticsTracker,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val searchQuery = savedStateHandle.getStateFlow("query", "")

    val uiState: StateFlow<OrderListUiState> = searchQuery
        .flatMapLatest { query ->
            repository.searchOrders(query)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = OrderListUiState.Loading
        )

    fun onSearchQueryChanged(query: String) {
        savedStateHandle["query"] = query
    }
}
```

Three things happen under the hood. First, Hilt generates a `ViewModelProvider.Factory` that knows how to create `OrderListViewModel` with all its dependencies. Second, it registers this factory with the `ViewModelComponent`, scoped to the ViewModel's lifecycle. Third, it automatically provides `SavedStateHandle` — you don't need a module for it.

`SavedStateHandle` is special in Hilt. It's provided automatically within `ViewModelComponent` because Hilt integrates with `SavedStateViewModelFactory`. You just declare it as a constructor parameter and it shows up, pre-populated with any arguments from the navigation graph or Activity intent extras.

On the Activity or Fragment side, you just use `by viewModels()` as normal. `@AndroidEntryPoint` ensures the right factory is used:

```kotlin
@AndroidEntryPoint
class OrderListFragment : Fragment() {

    private val viewModel: OrderListViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.uiState.collect { state -> renderState(state) }
        }
    }
}
```

No factory boilerplate, no manual injection, no `ViewModelProvider.Factory` class per ViewModel. Before Hilt, every new ViewModel on my projects meant at least 15 lines of factory code. Multiply that by 30 ViewModels and you understand why Hilt was adopted so quickly.

## Assisted Inject

Sometimes a dependency needs both compile-time parameters (from the DI graph) and runtime parameters (from the caller). A ViewModel that needs a `repository` from DI but also an `orderId` passed from the navigation argument is the classic example. `@AssistedInject` handles exactly this case.

```kotlin
class OrderDetailViewModel @AssistedInject constructor(
    private val repository: OrderRepository,
    private val analyticsTracker: AnalyticsTracker,
    @Assisted private val orderId: String
) : ViewModel() {

    val uiState: StateFlow<OrderDetailUiState> = flow {
        val order = repository.getOrder(orderId)
        emit(OrderDetailUiState.Success(order))
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = OrderDetailUiState.Loading
    )
}
```

You then define a factory interface that Hilt implements:

```kotlin
@AssistedFactory
interface OrderDetailViewModelFactory {
    fun create(orderId: String): OrderDetailViewModel
}
```

The caller gets the factory injected and passes the runtime parameter:

```kotlin
@AndroidEntryPoint
class OrderDetailFragment : Fragment() {

    @Inject lateinit var viewModelFactory: OrderDetailViewModelFactory

    private val viewModel: OrderDetailViewModel by viewModels {
        val orderId = requireArguments().getString("order_id")!!
        object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return viewModelFactory.create(orderId) as T
            }
        }
    }
}
```

I'll be honest — the boilerplate at the call site is the main tradeoff of `@AssistedInject`. You're back to writing a `ViewModelProvider.Factory`, just a smaller one. Navigation libraries like Compose Navigation with Hilt's `hiltViewModel()` don't support assisted injection directly, so you need this manual wiring. For Compose screens, you'd typically use `SavedStateHandle` to read the navigation argument instead of assisted injection, which avoids the factory altogether. Assisted injection shines more for non-ViewModel classes — workers, use cases, or presenters — where you control instantiation directly.

## Testing with Hilt

This is where Hilt actually earns its keep. With raw Dagger, setting up test components was painful — you'd create test-specific `@Component` interfaces, test modules, and manually build the graph in setUp(). Hilt gives you `@HiltAndroidTest` which sets up the real Hilt graph in your test and lets you swap individual bindings.

The core setup:

```kotlin
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class OrderListTest {

    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    @Inject lateinit var repository: OrderRepository

    @Before
    fun setup() {
        hiltRule.inject()
    }

    @Test
    fun `fetching orders returns cached data when network fails`() {
        // repository is the real (or replaced) implementation
        // injected by Hilt's test component
    }
}
```

The real power is `@TestInstallIn`, which replaces a production module with a test module globally across the test suite:

```kotlin
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [NetworkModule::class]
)
object FakeNetworkModule {

    @Provides
    @Singleton
    fun provideFakeOrderApi(): OrderApi {
        return FakeOrderApi()
    }
}

class FakeOrderApi : OrderApi {
    private val orders = mutableListOf<Order>()

    fun addOrder(order: Order) { orders.add(order) }

    override suspend fun fetchOrders(): List<Order> = orders

    override suspend fun getOrder(id: String): Order {
        return orders.first { it.id == id }
    }
}
```

With `@TestInstallIn`, every `@HiltAndroidTest` in your test suite gets `FakeOrderApi` instead of the real one. No test hits the network, no test needs a mock server, and the fake is shared so you don't define it per test class.

For cases where you need to replace a module in a single test class rather than globally, use `@UninstallModules`:

```kotlin
@HiltAndroidTest
@UninstallModules(AnalyticsModule::class)
class CheckoutFlowTest {

    @Module
    @InstallIn(SingletonComponent::class)
    object TestAnalyticsModule {
        @Provides
        @Singleton
        fun provideAnalytics(): AnalyticsTracker = NoOpAnalyticsTracker()
    }

    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    @Test
    fun `checkout completes without analytics side effects`() {
        hiltRule.inject()
        // AnalyticsTracker is now NoOpAnalyticsTracker
        // only in this test class
    }
}
```

The tradeoff to know: `@TestInstallIn` applies to every test, so you can't have conflicting test modules. If test class A wants `FakeOrderApi` and test class B wants `MockOrderApi`, you can't use `@TestInstallIn` for both. Use `@UninstallModules` for per-class overrides and `@TestInstallIn` for defaults you want everywhere.

One gotcha I learned the hard way: Hilt test rules must be ordered correctly. The `HiltAndroidRule` must run before any rule that tries to launch an Activity. If you're using `ActivityScenarioRule`, declare the Hilt rule first and call `hiltRule.inject()` in `@Before` — not in the rule declaration order. Getting this wrong gives you a cryptic "Hilt component has not been created" error.

## Quiz

**Question 1:** What's wrong with this module?

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object UserModule {
    @Provides
    @Singleton
    fun provideUserRepository(
        userApi: UserApi,
        userDao: UserDao
    ): UserRepository {
        return UserRepositoryImpl(userApi, userDao)
    }
}
```

**Wrong** — This uses `@Provides` when `@Binds` would be more efficient. Since `UserRepositoryImpl` presumably has an `@Inject` constructor (it takes `UserApi` and `UserDao` which are already in the graph), you should use `@Binds` instead. `@Provides` generates a factory class with the full method body, while `@Binds` generates no factory at all — Hilt just records the mapping. On a large project, this difference compounds: fewer generated classes means faster builds and a smaller APK. Convert it to an abstract class with `@Binds abstract fun bindUserRepository(impl: UserRepositoryImpl): UserRepository`.

**Question 2:** You scoped a `FormValidator` class with `@Singleton`. The validator holds no state and just runs pure validation logic. Is this correct?

**Wrong** — Stateless classes shouldn't be scoped. Scoping a stateless class as `@Singleton` means Hilt holds a reference to it for the entire process lifetime — it can never be garbage collected. Since `FormValidator` holds no state, there's no benefit to reusing the same instance. Remove the `@Singleton` annotation and let Hilt create a fresh instance each time it's injected. Only scope dependencies when sharing the same instance matters for correctness (shared caches, connection pools, session state).

---

## Coding Challenge

Build a Hilt-powered feature module for a `BookmarkRepository` that supports both local (Room) and remote (Retrofit) data sources. Define the `BookmarkRepository` interface, an implementation that checks local cache first and falls back to remote, a `NetworkModule` providing the API client, and a `DatabaseModule` providing the DAO. Use `@Binds` for the repository binding. Scope the API and database as singletons, but leave the repository unscoped. Then write a `@HiltAndroidTest` that replaces the real API with a `FakeBookmarkApi` using `@TestInstallIn` and verifies that the repository returns cached data when the network fails.

Thanks for reading!
