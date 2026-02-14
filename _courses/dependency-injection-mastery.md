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

---

Thank You for completing the Dependency Injection Mastery course! DI is the backbone of clean, testable Android architecture. 💉
