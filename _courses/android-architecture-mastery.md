---
title: "Android Architecture Mastery"
layout: course
description: "Design scalable, testable Android apps — MVVM, MVI, Clean Architecture, Repository pattern, Use Cases, and modularization strategies."
icon: "🏗️"
color: "#34d399"
difficulty: "Intermediate to Expert"
modules: 10
lessons: 56
duration: "10 weeks"
order: 4
tags:
  - Architecture
  - Android
  - Design Patterns
what_you_learn:
  - "Trace the evolution of Android architecture from MVC to Compose Presenters"
  - "Implement MVVM with proper state management and one-time events"
  - "Build the Repository pattern for offline-first data access"
  - "Apply Clean Architecture — domain, data, and presentation layers"
  - "Design unidirectional data flow with MVI pattern"
  - "Master ViewModel best practises for production apps"
  - "Structure multi-module Android projects with proper dependency graphs"
  - "Handle errors gracefully across all architecture layers"
  - "Design internal APIs and frameworks with clear naming conventions"
  - "Test every architecture layer with fakes, Turbine, and coroutine test utilities"
prerequisites:
  - "Kotlin and coroutines basics"
  - "Android development experience"
  - "ViewModel and LiveData/Flow familiarity"
---

## Module 1: Why Architecture Matters

Bad architecture doesn't hurt on day one. It hurts on day 100 when a simple feature takes a week, every change breaks something else, and testing is impossible. Architecture is the set of decisions that are expensive to change later — layer boundaries, data flow direction, state ownership, and module structure. Getting these right early saves you from rewrites that cost weeks or months.

The real cost of bad architecture isn't visible in the code. It's visible in the velocity chart — features that used to take a day now take a week because every change ripples through tightly coupled classes. It's visible in the bug tracker — regression bugs from changes in one screen breaking another. And it's visible in the team's morale — developers dread touching certain parts of the codebase because they know they'll break something.

### Lesson 1.1: The Cost of No Architecture

Without clear architecture, Android apps become Activity-centric monsters — 2,000-line Activities that mix UI, business logic, network calls, and database access. This is the "God Activity" anti-pattern. Every Android developer has seen one. The Activity handles user input, makes API calls, parses JSON, queries the database, applies business rules, formats strings, tracks analytics, and manages navigation — all in one file.

The God Activity pattern doesn't just make code hard to read. It makes code impossible to test. You can't unit test business logic that lives inside `onCreate()` because it's entangled with Android framework classes that require an emulator or Robolectric to run. You can't mock the network layer because it's instantiated inline. You can't verify state transitions because state is scattered across twenty member variables with no single source of truth.

The pattern also destroys team productivity. When everything lives in one file, every feature change touches the same class. Two developers working on the same Activity create merge conflicts constantly. Code reviews become painful because reviewers need to understand the entire 2,000-line file to evaluate a 50-line change. The coupling means that fixing a bug in the payment flow can break the profile screen because they share mutable state through the Activity.

Beyond the immediate code quality problems, the God Activity pattern creates a hidden cost that compounds over time: developer velocity decay. In the first month of a project, features ship fast because the Activity is only 200 lines. By month six, it's 1,500 lines and every change requires understanding the entire file. By month twelve, it's 3,000 lines and the team avoids touching it altogether, instead building workarounds. I've seen teams create "helper" Activities that duplicate half the logic from the God Activity just to avoid dealing with it. The original Activity becomes a legacy artifact that nobody understands but everyone depends on.

The testing cost deserves deeper examination. In a God Activity, the business logic for calculating discounts is interleaved with the UI code that displays them. To test that a premium user gets a 10% discount, you'd need to launch the entire Activity, mock the network response, wait for the UI to render, and check the displayed text. This is a 500ms instrumentation test that could be a 5ms unit test if the discount logic lived in its own class. Multiply this by hundreds of test cases, and you have a CI pipeline that takes 45 minutes instead of 3.

Configuration changes expose the worst of the God Activity pattern. When the user rotates the device, Android destroys and recreates the Activity. Any state stored in member variables is lost. The God Activity responds by either ignoring rotation (locking orientation, which breaks tablets), saving everything to `onSaveInstanceState` (which has size limits and can't handle complex objects), or re-fetching everything from the network (which wastes bandwidth and shows loading spinners on rotation). All three solutions are hacks around a fundamental design flaw — state shouldn't live in the Activity in the first place.

The economic argument for architecture is straightforward. A team spending 30% of their time on bug fixes caused by coupling is losing 30% productivity. A team whose CI takes 45 minutes instead of 3 is context-switching away from every test run. A team that can't onboard new developers because "you just have to know how this Activity works" is bottlenecked on tribal knowledge. Architecture is an investment that pays dividends in velocity, quality, and team scaling.

```kotlin
// ❌ God Activity — everything in one place
class ProfileActivity : AppCompatActivity() {
    private var userData: User? = null
    private var isLoading = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // UI setup mixed with business logic
        isLoading = true
        updateLoadingUI()

        // Network call directly in Activity
        val client = OkHttpClient()
        val request = Request.Builder()
            .url("https://api.example.com/user/123")
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                // JSON parsing in Activity
                val json = response.body?.string()
                userData = Gson().fromJson(json, User::class.java)

                // Business logic in Activity
                val displayName = if (userData!!.isPremium) {
                    "⭐ ${userData!!.name}"
                } else {
                    userData!!.name
                }

                // UI update from background thread — crash waiting to happen
                runOnUiThread {
                    nameTextView.text = displayName
                    isLoading = false
                    updateLoadingUI()
                }
            }

            override fun onFailure(call: Call, e: IOException) {
                // Error handling mixed with UI
                runOnUiThread {
                    Toast.makeText(this@ProfileActivity, e.message, Toast.LENGTH_SHORT).show()
                }
            }
        })
    }
}
```

```kotlin
// ❌ Another symptom: God Activity with analytics, navigation, and formatting
class OrderActivity : AppCompatActivity() {
    private var orders: List<Order> = emptyList()
    private var currentFilter = "all"
    private var sortOrder = "date"
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Analytics tracking in Activity
        FirebaseAnalytics.getInstance(this).logEvent("order_screen_viewed", null)
        
        // Direct SharedPreferences access
        val prefs = getSharedPreferences("settings", MODE_PRIVATE)
        currentFilter = prefs.getString("last_filter", "all") ?: "all"
        
        // Network call with manual JSON parsing
        Thread {
            val url = URL("https://api.example.com/orders")
            val connection = url.openConnection() as HttpURLConnection
            val json = connection.inputStream.bufferedReader().readText()
            orders = JSONArray(json).let { array ->
                (0 until array.length()).map { i ->
                    val obj = array.getJSONObject(i)
                    Order(
                        id = obj.getString("id"),
                        total = obj.getDouble("total"),
                        date = obj.getString("date")
                    )
                }
            }
            
            // Business logic: filtering + sorting
            val filtered = when (currentFilter) {
                "pending" -> orders.filter { it.status == "pending" }
                "completed" -> orders.filter { it.status == "completed" }
                else -> orders
            }
            
            // Formatting in Activity
            val formatted = filtered.map { order ->
                "${order.id}: $${String.format("%.2f", order.total)}"
            }
            
            runOnUiThread {
                adapter.submitList(formatted) // crash if Activity is destroyed
            }
        }.start()
    }
    
    // Navigation logic in Activity
    fun onOrderClicked(orderId: String) {
        val intent = Intent(this, OrderDetailActivity::class.java)
        intent.putExtra("order_id", orderId)
        startActivity(intent)
        
        // More analytics
        FirebaseAnalytics.getInstance(this)
            .logEvent("order_clicked", bundleOf("order_id" to orderId))
    }
}
```

```kotlin
// ✅ Separated concerns — each class has one job
class ProfileScreen {
    fun render(state: ProfileState) { /* UI only */ }
}

class ProfileViewModel(
    private val repository: ProfileRepository
) : ViewModel() {
    fun loadProfile(userId: String) { /* State management only */ }
}

class ProfileRepository(
    private val api: ProfileApi,
    private val dao: ProfileDao
) {
    suspend fun getProfile(userId: String): Profile { /* Data access only */ }
}
```

```kotlin
// ✅ The same order feature with proper separation
// Each class is independently testable

class OrderViewModel(
    private val getOrders: GetFilteredOrdersUseCase,
    private val analyticsTracker: AnalyticsTracker,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {
    
    private val currentFilter = savedStateHandle.getStateFlow("filter", OrderFilter.ALL)
    
    val uiState: StateFlow<OrderUiState> = currentFilter
        .flatMapLatest { filter -> getOrders(filter) }
        .map { orders -> OrderUiState.Success(orders) }
        .catch { e -> emit(OrderUiState.Error(e.message ?: "Failed")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), OrderUiState.Loading)
    
    fun onFilterChanged(filter: OrderFilter) {
        savedStateHandle["filter"] = filter
        analyticsTracker.trackEvent("filter_changed", mapOf("filter" to filter.name))
    }
}

class GetFilteredOrdersUseCase(
    private val repository: OrderRepository
) {
    operator fun invoke(filter: OrderFilter): Flow<List<Order>> =
        repository.observeOrders().map { orders ->
            when (filter) {
                OrderFilter.ALL -> orders
                OrderFilter.PENDING -> orders.filter { it.status == OrderStatus.PENDING }
                OrderFilter.COMPLETED -> orders.filter { it.status == OrderStatus.COMPLETED }
            }
        }
}
```

#### Common Mistakes

The most common mistake when moving away from God Activities is creating God ViewModels instead. Teams extract the network calls and database queries from the Activity but dump all the logic into the ViewModel. The ViewModel becomes 800 lines with 12 constructor parameters. This is just moving the problem — you need to distribute logic across Use Cases, Repositories, and Formatters.

Another common mistake is premature architecture. For a hackathon prototype or a one-screen utility app, the God Activity is fine. Over-engineering a simple app with five layers of abstraction wastes time and adds complexity without benefit. Architecture should match complexity — simple apps get simple architecture, complex apps get robust architecture.

**Key takeaway:** Architecture is about separation of concerns — each class has one job, one reason to change. This makes code testable, maintainable, and understandable.

### Lesson 1.2: Google's Recommended Architecture

Google's official architecture guide defines three layers that form the backbone of every well-structured Android app. Understanding these layers is foundational — every pattern we'll cover in this course builds on top of this layered structure.

The **UI Layer** displays data and handles user input. It contains two sub-components: UI elements (Compose composables or XML Views) and state holders (ViewModel). The UI elements are dumb — they receive state and render it. The ViewModel holds the state, processes user events, and coordinates with the data layer. The UI layer never fetches data directly, never writes to databases, and never applies business rules.

The **Domain Layer** is optional but recommended for complex apps. It contains business logic encapsulated in Use Cases (also called Interactors). The Domain layer sits between UI and Data, providing a clean API for the ViewModel to consume. It coordinates between multiple repositories, applies business rules, and transforms data. The Domain layer has zero Android dependencies — it's pure Kotlin, which makes it trivially testable.

The **Data Layer** manages data from network APIs, local databases, SharedPreferences, and other sources. It contains Repositories and Data Sources. Repositories are the API that the rest of the app uses to access data — they coordinate between remote and local sources, handle caching, and manage data freshness. Data Sources are the actual implementations that talk to Retrofit, Room, or DataStore.

The reason Google standardized on this three-layer model is that it maps naturally to Android's lifecycle constraints. The UI layer is lifecycle-aware — it starts and stops with Activities and Fragments. The ViewModel survives configuration changes, providing a lifecycle-independent home for state. The Data layer operates independently of any lifecycle, persisting data through Room and DataStore. Each layer handles a different timescale: the UI handles milliseconds (user taps), the ViewModel handles seconds to minutes (screen sessions), and the Data layer handles hours to days (cached data).

A critical subtlety that teams often miss is the difference between the Data layer's two roles: data retrieval and data mutation. For retrieval, the Repository returns `Flow<T>` — a continuous stream of data that updates automatically when the database changes. For mutation, the Repository exposes suspend functions — `suspend fun updateUser(user: User)`. The retrieval path is passive (observe and react), while the mutation path is active (call and wait). Mixing these two models — for example, having a function that both mutates data and returns a stream — creates confusing APIs.

The three-layer model also dictates where error handling happens. Network errors are caught in the Data layer and converted to domain-friendly error types. Business rule violations are caught in the Domain layer. The UI layer receives clean, typed errors and maps them to user-facing messages. No layer shows raw exceptions to the user.

One misconception teams have is that every app needs all three layers from day one. Google explicitly marks the Domain layer as "optional." For a simple app with straightforward CRUD operations, the ViewModel can call the Repository directly. The Domain layer becomes valuable when business logic is complex (multi-step calculations, rule engines) or shared (the same pricing logic used by both the cart screen and the order summary screen). Adding Use Cases too early creates unnecessary boilerplate; adding them too late means extracting logic from bloated ViewModels.

```kotlin
// The dependency rule visualized in code

// Data Layer — knows about network and database
class UserRepositoryImpl(
    private val remoteDataSource: UserRemoteDataSource,
    private val localDataSource: UserLocalDataSource
) : UserRepository {
    override fun observeUser(id: String): Flow<User> =
        localDataSource.observeUser(id)

    override suspend fun refreshUser(id: String) {
        val user = remoteDataSource.fetchUser(id)
        localDataSource.insertUser(user)
    }
}

// Domain Layer — knows nothing about Android, Retrofit, or Room
class GetUserWithPostsUseCase(
    private val userRepository: UserRepository,
    private val postsRepository: PostsRepository
) {
    operator fun invoke(userId: String): Flow<UserWithPosts> = combine(
        userRepository.observeUser(userId),
        postsRepository.observeUserPosts(userId)
    ) { user, posts -> UserWithPosts(user, posts) }
}

// UI Layer — knows about ViewModel and Compose, not data sources
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val getUserWithPosts: GetUserWithPostsUseCase
) : ViewModel() {
    val uiState: StateFlow<ProfileUiState> = getUserWithPosts("user-1")
        .map { ProfileUiState.Success(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ProfileUiState.Loading)
}
```

```kotlin
// ❌ Violating layer boundaries — UI layer accessing data sources directly
@Composable
fun ProfileScreen() {
    val db = Room.databaseBuilder(LocalContext.current, AppDatabase::class.java, "app.db").build()
    val user = db.userDao().getUser("123") // UI directly accesses database
    Text(text = user.name)
}

// ❌ ViewModel reaching into data source implementation details
class ProfileViewModel(
    private val retrofit: Retrofit, // should depend on Repository, not Retrofit
    private val database: AppDatabase // should depend on Repository, not Room
) : ViewModel()

// ✅ Proper layer boundaries — each layer only knows about the layer below it
@Composable
fun ProfileScreen(viewModel: ProfileViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    // UI only knows about ViewModel, never about Repository or Database
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepository: UserRepository // depends on interface, not implementation
) : ViewModel()
```

```kotlin
// The complete data flow path from network to UI

// 1. Network response arrives
data class UserDto(
    @SerializedName("user_id") val userId: String,
    @SerializedName("display_name") val displayName: String
)

// 2. Data Source converts to entity and saves to database
class UserRemoteDataSource(private val api: UserApi) {
    suspend fun fetchUser(id: String): UserDto = api.getUser(id)
}

class UserLocalDataSource(private val dao: UserDao) {
    fun observeUser(id: String): Flow<UserEntity> = dao.observeUser(id)
    suspend fun save(entity: UserEntity) = dao.insert(entity)
}

// 3. Repository coordinates and maps to domain model
class UserRepositoryImpl(
    private val remote: UserRemoteDataSource,
    private val local: UserLocalDataSource
) : UserRepository {
    override fun observeUser(id: String): Flow<User> =
        local.observeUser(id).map { it.toDomain() }
    
    override suspend fun refreshUser(id: String) {
        val dto = remote.fetchUser(id)
        local.save(dto.toEntity())
    }
}

// 4. ViewModel exposes UI state
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: UserRepository
) : ViewModel() {
    val uiState = repository.observeUser("user-1")
        .map { user -> ProfileUiState.Success(user) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ProfileUiState.Loading)
}

// 5. Composable renders state
@Composable
fun ProfileScreen(viewModel: ProfileViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    when (state) {
        is ProfileUiState.Loading -> CircularProgressIndicator()
        is ProfileUiState.Success -> {
            val user = (state as ProfileUiState.Success).user
            Text(text = user.name)
        }
    }
}
```

**Data flows down, events flow up.** The UI layer observes state from ViewModel. ViewModel gets data from Use Cases or Repositories. Repositories coordinate data sources. No layer reaches upward — the Repository never imports ViewModel classes, and the Domain layer never imports UI classes.

#### Common Mistakes

The most frequent violation is the "shortcut dependency" — a ViewModel importing a DAO class directly because "it's faster than going through the Repository." This works today but breaks tomorrow when you need to add caching, offline support, or a second data source. The Repository abstraction exists precisely to absorb these future changes.

Another common mistake is putting Android framework code in the Domain layer. The moment your Use Case imports `android.content.Context` or `android.util.Log`, your pure Kotlin business logic is coupled to the Android platform and can no longer run in plain JUnit tests.

**Key takeaway:** Follow the dependency rule — outer layers depend on inner layers, never the reverse. The UI depends on the ViewModel, but the ViewModel never imports UI classes.

### Lesson 1.3: Dependency Rule and Inversion

The Dependency Inversion Principle is the most important SOLID principle for Android architecture. It states that high-level modules should not depend on low-level modules — both should depend on abstractions. In practice, this means your ViewModel depends on a `UserRepository` interface, not on `UserRepositoryImpl` that uses Retrofit and Room.

Why does this matter? Because without dependency inversion, changing your network library from Retrofit to Ktor means changing every ViewModel that uses the repository. With dependency inversion, you change one implementation class and everything else continues to work. The same applies to testing — you swap the real implementation for a fake, and the ViewModel doesn't know the difference.

Dependency inversion also enforces the direction of the dependency rule. The domain layer defines interfaces (`UserRepository`), and the data layer implements them (`UserRepositoryImpl`). This means the domain layer has zero knowledge of Retrofit, Room, or any other framework. It's pure Kotlin — portable, testable, and stable.

The practical impact of dependency inversion becomes obvious during a library migration. Consider a team that wants to migrate from Retrofit to Ktor for their networking. Without dependency inversion, `RetrofitUserApi` is referenced directly in `UserViewModel`, `OrderViewModel`, `ProfileViewModel`, and twelve other ViewModels. Migrating means changing all of them simultaneously, testing all of them, and hoping none of the changes interact badly. With dependency inversion, the ViewModels depend on `UserRepository` (an interface). The migration touches `UserRepositoryImpl` and `UserRemoteDataSource` — two files. The ViewModels don't even need to be recompiled because their dependency (the interface) didn't change.

This principle extends beyond just network libraries. Consider a team that starts with SharedPreferences for settings storage and later needs to migrate to DataStore. With dependency inversion, the ViewModel depends on `SettingsRepository`, and the implementation swap from `SharedPreferencesSettingsRepository` to `DataStoreSettingsRepository` is invisible to the ViewModel. Without it, every ViewModel that reads settings has direct `SharedPreferences` references that must be updated.

Dependency inversion is also the foundation of the "plugin architecture" — the ability to swap implementations at runtime. Feature flags can route to different implementations. A/B tests can compare two repository implementations. Debug builds can use in-memory databases while release builds use Room. All of this is possible only when the consuming code depends on abstractions.

The cost of dependency inversion is primarily one additional file per dependency — the interface. Some developers argue this is boilerplate. But the interface serves as documentation of the contract between layers, forces you to think about the public API surface, and catches breaking changes at compile time. When a team member adds a method to `UserRepositoryImpl` without updating the interface, the ViewModel that needs it won't compile until the interface is updated — which triggers a conversation about whether the method belongs in the contract.

In large codebases, dependency inversion also enables parallel development. The UI team can write ViewModels against the `UserRepository` interface before the data team has finished implementing `UserRepositoryImpl`. They write their fakes and tests, and when the real implementation is ready, they plug it in through DI. Without dependency inversion, the UI team is blocked until the data team delivers.

```kotlin
// ❌ ViewModel depends on concrete implementation
class UserViewModel {
    private val api = RetrofitUserApi()  // Hard dependency — can't swap for testing
    private val db = RoomUserDao()       // Hard dependency — needs Android context
}

// ✅ ViewModel depends on abstraction
class UserViewModel(
    private val repository: UserRepository  // Interface — can be faked in tests
) : ViewModel()

// Repository interface defined in domain layer
interface UserRepository {
    fun observeUser(id: String): Flow<User>
    suspend fun refreshUser(id: String)
}

// Implementation in data layer — the only place that knows about Retrofit and Room
class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao
) : UserRepository {
    override fun observeUser(id: String): Flow<User> = dao.observeUser(id)
    override suspend fun refreshUser(id: String) {
        val user = api.getUser(id)
        dao.insertUser(user.toDomain())
    }
}
```

```kotlin
// ❌ Without DI — hard to swap, hard to test, hard to migrate
class SettingsViewModel {
    private val prefs = context.getSharedPreferences("settings", MODE_PRIVATE)
    
    fun isDarkMode(): Boolean = prefs.getBoolean("dark_mode", false)
    fun setDarkMode(enabled: Boolean) {
        prefs.edit().putBoolean("dark_mode", enabled).apply()
    }
}

// ✅ With DI — swap implementations freely
interface SettingsRepository {
    fun observeDarkMode(): Flow<Boolean>
    suspend fun setDarkMode(enabled: Boolean)
}

// Production implementation
class DataStoreSettingsRepository(
    private val dataStore: DataStore<Preferences>
) : SettingsRepository {
    override fun observeDarkMode(): Flow<Boolean> =
        dataStore.data.map { it[DARK_MODE_KEY] ?: false }
    
    override suspend fun setDarkMode(enabled: Boolean) {
        dataStore.edit { it[DARK_MODE_KEY] = enabled }
    }
}

// Test implementation
class FakeSettingsRepository : SettingsRepository {
    private val darkMode = MutableStateFlow(false)
    
    override fun observeDarkMode(): Flow<Boolean> = darkMode
    override suspend fun setDarkMode(enabled: Boolean) { darkMode.value = enabled }
}
```

```kotlin
// Dependency Injection wiring with Hilt
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    abstract fun bindUserRepository(
        impl: UserRepositoryImpl
    ): UserRepository
    
    @Binds
    abstract fun bindSettingsRepository(
        impl: DataStoreSettingsRepository
    ): SettingsRepository
}

// The ViewModel never knows which implementation it's using
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository // interface
) : ViewModel() {
    val darkMode = settingsRepository.observeDarkMode()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    
    fun toggleDarkMode() {
        viewModelScope.launch {
            settingsRepository.setDarkMode(!darkMode.value)
        }
    }
}
```

```kotlin
// Runtime implementation swapping via feature flags
@Module
@InstallIn(SingletonComponent::class)
object FeatureFlagModule {
    @Provides
    fun providePaymentProcessor(
        featureFlags: FeatureFlags,
        stripeProcessor: StripePaymentProcessor,
        inHouseProcessor: InHousePaymentProcessor
    ): PaymentProcessor {
        return if (featureFlags.useNewPaymentSystem) {
            inHouseProcessor
        } else {
            stripeProcessor
        }
    }
}
```

#### Anti-patterns

The "interface for everything" anti-pattern is when developers create interfaces for classes that will never have a second implementation. A `StringFormatter` utility class doesn't need a `StringFormatterInterface`. Create interfaces for classes that represent boundaries — repositories, data sources, external services — not for every utility class. The rule: if the class wraps an external dependency or sits at a layer boundary, give it an interface. If it's a pure function or utility, skip the interface.

**Key takeaway:** Depend on abstractions, not implementations. This is the Dependency Inversion Principle — it makes your code testable (swap implementations in tests) and flexible (change database without touching ViewModel).

### Lesson 1.4: SOLID Principles in Android

SOLID principles aren't abstract theory — they're the engineering foundation that makes architecture decisions stick. Every principle maps directly to a common Android architecture problem. When teams skip SOLID, their architecture degrades under the pressure of deadline-driven development. When teams follow SOLID, the architecture holds up even as the codebase grows.

**Single Responsibility (S)** — A class should have one reason to change. A ViewModel that fetches data, applies business rules, formats strings, tracks analytics, AND manages navigation has five reasons to change. Split it: the ViewModel manages state, a Use Case applies business rules, a Repository fetches data, a Formatter handles display logic, and an AnalyticsTracker handles tracking. Each class is focused, testable, and independently modifiable.

The Single Responsibility Principle is the most frequently violated principle in Android codebases, and the violation is insidious because it happens gradually. The ViewModel starts with 100 lines and one responsibility. Then someone adds analytics tracking — "it's just two lines." Then someone adds string formatting — "it's just a helper function." Then someone adds input validation — "we need it before the API call." Six months later, the ViewModel is 800 lines with ten responsibilities, and nobody can pinpoint when it went wrong because each addition was "just a small change."

**Open-Closed (O)** — Classes should be open for extension but closed for modification. A `PaymentProcessor` that uses `when` branches for every payment method violates this — adding Apple Pay means modifying the existing class. Instead, define a `PaymentMethod` interface and implement `CreditCardPayment`, `GooglePayPayment`, `ApplePayPayment`. Adding a new method means adding a new class, not touching existing ones.

The Open-Closed Principle is particularly important for features that grow over time. Notification channels, analytics event types, error handlers, formatters — these are all categories that accumulate new entries. If adding a new notification type requires modifying the `NotificationManager`, every change risks breaking existing notification types. If each notification type is a separate class implementing a `NotificationBuilder` interface, new types are additions, not modifications.

**Liskov Substitution (L)** — Subtypes must be substitutable for their base types. If `UserRepository` has a `getUser()` method that returns a `User`, then `CachedUserRepository` must also return a `User` without surprising behavior. A `CachedUserRepository` that throws an exception when the cache is empty instead of returning null violates this — the caller expected the same contract.

The Liskov Substitution Principle is critical when using dependency injection because the whole point of DI is that implementations are interchangeable. If `FakeUserRepository` in your tests behaves differently from `UserRepositoryImpl` in production — for example, by throwing different exceptions, returning different default values, or having different threading behavior — your tests are lying to you. The fake must honor the same contract as the real implementation.

**Interface Segregation (I)** — Clients should not depend on methods they don't use. A `UserRepository` with `getUser()`, `updateUser()`, `deleteUser()`, `getUserPosts()`, `getUserSettings()`, and `getUserAnalytics()` forces every consumer to depend on all six methods. Split it into `UserReadRepository`, `UserWriteRepository`, and `UserAnalyticsRepository`.

Interface Segregation becomes critical in modularized projects. If `:feature:profile` only needs to read user data, it should depend on `UserReadRepository`, not on a fat `UserRepository` that includes admin operations. This reduces the module's dependency surface and makes the contract explicit — you know exactly which capabilities each feature module requires.

**Dependency Inversion (D)** — Depend on abstractions, not implementations. We covered this in the previous lesson. In Android, this means injecting interfaces through constructors and using Hilt or Koin to wire the implementations.

```kotlin
// Single Responsibility — each class has one job
class FormatPriceUseCase {
    operator fun invoke(cents: Long, currency: String): String {
        val amount = cents / 100.0
        return when (currency) {
            "USD" -> "$${String.format("%.2f", amount)}"
            "EUR" -> "€${String.format("%.2f", amount)}"
            else -> "${String.format("%.2f", amount)} $currency"
        }
    }
}

// Open-Closed — extend without modifying
interface PaymentMethod {
    suspend fun processPayment(amount: Long): PaymentResult
}

class CreditCardPayment(private val api: PaymentApi) : PaymentMethod {
    override suspend fun processPayment(amount: Long): PaymentResult {
        return api.chargeCreditCard(amount).toResult()
    }
}

class GooglePayPayment(private val api: PaymentApi) : PaymentMethod {
    override suspend fun processPayment(amount: Long): PaymentResult {
        return api.chargeGooglePay(amount).toResult()
    }
}

// Interface Segregation — focused interfaces
interface UserReadRepository {
    fun observeUser(id: String): Flow<User>
    suspend fun getUser(id: String): User?
}

interface UserWriteRepository {
    suspend fun updateUser(user: User)
    suspend fun deleteUser(id: String)
}
```

```kotlin
// ❌ Violating Single Responsibility — ViewModel does everything
class OrderViewModel(
    private val repository: OrderRepository,
    private val context: Context
) : ViewModel() {
    
    fun getFormattedPrice(cents: Long): String {
        // Formatting logic in ViewModel
        return "$${String.format("%.2f", cents / 100.0)}"
    }
    
    fun validateEmail(email: String): Boolean {
        // Validation logic in ViewModel
        return android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()
    }
    
    fun trackPurchase(orderId: String) {
        // Analytics in ViewModel
        FirebaseAnalytics.getInstance(context).logEvent("purchase", bundleOf("id" to orderId))
    }
    
    fun navigateToConfirmation(orderId: String) {
        // Navigation in ViewModel — but ViewModel shouldn't know about navigation
    }
}

// ✅ Following Single Responsibility — each concern is a separate class
class FormatPriceUseCase {
    operator fun invoke(cents: Long): String = "$${String.format("%.2f", cents / 100.0)}"
}

class ValidateEmailUseCase {
    operator fun invoke(email: String): Boolean = email.contains("@") && email.contains(".")
}

class AnalyticsTracker(private val analytics: Analytics) {
    fun trackPurchase(orderId: String) = analytics.logEvent("purchase", mapOf("id" to orderId))
}
```

```kotlin
// ❌ Violating Open-Closed — adding a new type requires modifying existing code
class NotificationHandler {
    fun handle(notification: Notification) {
        when (notification.type) {
            "message" -> showMessageNotification(notification)
            "order" -> showOrderNotification(notification)
            "promo" -> showPromoNotification(notification)
            // Adding "payment" means modifying this class
        }
    }
}

// ✅ Following Open-Closed — adding a new type means adding a new class
interface NotificationHandler {
    fun canHandle(type: String): Boolean
    fun handle(notification: Notification)
}

class MessageNotificationHandler : NotificationHandler {
    override fun canHandle(type: String) = type == "message"
    override fun handle(notification: Notification) { /* ... */ }
}

class OrderNotificationHandler : NotificationHandler {
    override fun canHandle(type: String) = type == "order"
    override fun handle(notification: Notification) { /* ... */ }
}

// Router finds the right handler — no when/if chains
class NotificationRouter(private val handlers: Set<NotificationHandler>) {
    fun route(notification: Notification) {
        handlers.firstOrNull { it.canHandle(notification.type) }
            ?.handle(notification)
    }
}
```

#### Production War Story

A team I worked with had a `DataManager` class that violated every SOLID principle. It had 47 public methods, accessed three databases, two APIs, shared preferences, and the file system. Every feature depended on it, so every feature change touched `DataManager`. The file had 3,200 lines and 200+ merge conflicts per quarter. The fix took six weeks: they split `DataManager` into 12 focused repositories, each with an interface. Build times dropped 40% because modules could compile in parallel. Merge conflicts dropped 90%. New feature development accelerated because developers could understand a 200-line Repository without reading 3,200 lines.

**Key takeaway:** SOLID principles prevent architecture decay. Single Responsibility keeps classes focused, Open-Closed prevents modification cascades, and Dependency Inversion enables testing and flexibility.

### Lesson 1.5: The Law of Demeter

The Law of Demeter (also called "don't talk to strangers") states that an object should only interact with its immediate dependencies, not with dependencies of dependencies. In Android architecture, this principle prevents tight coupling and keeps layer boundaries clean.

Consider a chat application with three classes: `ChatManager`, `MessageRepository`, and `DatabaseConnection`. The `ChatManager` should talk to `MessageRepository`, and `MessageRepository` should talk to `DatabaseConnection`. But `ChatManager` should never reach through `MessageRepository` to directly access `DatabaseConnection`. Each layer only knows about the layer directly below it.

This principle is especially important when designing APIs for internal use. If your ViewModel accesses `repository.dataSource.database.query()`, you've created a chain of dependencies where changing the database implementation requires updating the ViewModel. Instead, the ViewModel calls `repository.getMessages()`, and the repository internally decides how to get them.

The Law of Demeter is the architectural equivalent of information hiding. When you reach through an object to access its internals, you're creating a dependency on the entire chain. Every class in the chain becomes a coupling point — change any one of them, and the caller breaks. The chain `viewModel.repository.remoteDataSource.api.httpClient.connectionPool` has five coupling points. The call `viewModel.getUser()` has one.

In large codebases, Demeter violations create invisible dependency webs. A seemingly innocent refactoring — renaming a field in `DatabaseConnection` — breaks `ChatManager` three layers up because `ChatManager` reached through to access that field directly. Without the Law of Demeter violation, the rename would only affect `MessageRepository`, which is the only class that directly uses `DatabaseConnection`.

The principle also applies to data classes. When your Composable receives a `UserWithOrdersAndSettings` object and accesses `user.orders[0].items[2].product.category.name`, you've coupled the Composable to the internal structure of five nested classes. Instead, flatten the data into a UI model that contains exactly the fields the Composable needs.

The Law of Demeter has a natural tension with convenience. Chaining through objects is often the shortest path to the data you need. But the shortest path creates the most coupling. The discipline is to create intermediate methods that encapsulate the chain — `repository.getMessages()` instead of `repository.dataSource.database.query("SELECT * FROM messages")`.

In object-oriented programming, the formal rule is: a method `M` of object `O` may only invoke methods of (1) `O` itself, (2) `M`'s parameters, (3) objects created within `M`, (4) `O`'s direct component objects. Anything else is a Demeter violation. In Android terms: a ViewModel can call its own methods, methods on injected dependencies, methods on objects it creates, and methods on its member properties — but not methods on objects returned by its dependencies.

```kotlin
// ❌ Violating Law of Demeter — reaching through layers
class ChatViewModel(private val chatManager: ChatManager) : ViewModel() {
    fun loadMessages() {
        // Reaching through ChatManager to access its internal dependencies
        val db = chatManager.messageRepository.databaseConnection
        val messages = db.query("SELECT * FROM messages")
    }
}

// ✅ Following Law of Demeter — only talk to direct dependencies
class ChatViewModel(private val chatRepository: ChatRepository) : ViewModel() {
    fun loadMessages() {
        viewModelScope.launch {
            chatRepository.observeMessages().collect { messages ->
                _state.update { it.copy(messages = messages) }
            }
        }
    }
}
```

```kotlin
// ❌ Demeter violation in Composable — reaching into nested data structures
@Composable
fun OrderSummary(order: Order) {
    // Accessing deeply nested fields creates coupling to internal structure
    val categoryName = order.items[0].product.category.name
    val supplierPhone = order.items[0].product.supplier.contactInfo.phone
    val warehouseCity = order.shipping.warehouse.address.city
    
    Text("Category: $categoryName")
    Text("Supplier: $supplierPhone")
    Text("Ships from: $warehouseCity")
}

// ✅ Flatten into a UI model — Composable depends only on its direct input
data class OrderSummaryUiModel(
    val categoryName: String,
    val supplierPhone: String,
    val shippingCity: String
)

@Composable
fun OrderSummary(model: OrderSummaryUiModel) {
    Text("Category: ${model.categoryName}")
    Text("Supplier: ${model.supplierPhone}")
    Text("Ships from: ${model.shippingCity}")
}
```

```kotlin
// ❌ Chain of calls across multiple objects
class PaymentViewModel(private val checkoutService: CheckoutService) : ViewModel() {
    fun getPaymentStatus() {
        val status = checkoutService
            .getPaymentGateway()
            .getTransactionManager()
            .getLastTransaction()
            .getStatus()
        // 4 objects traversed — 4 coupling points
    }
}

// ✅ Each object encapsulates its internals
class PaymentViewModel(private val paymentRepository: PaymentRepository) : ViewModel() {
    fun getPaymentStatus() {
        viewModelScope.launch {
            val status = paymentRepository.getLastPaymentStatus()
            // 1 call — 1 coupling point
            _state.update { it.copy(paymentStatus = status) }
        }
    }
}

class PaymentRepository(private val gateway: PaymentGateway) {
    suspend fun getLastPaymentStatus(): PaymentStatus {
        return gateway.getLastTransactionStatus()
    }
}

class PaymentGateway(private val transactionManager: TransactionManager) {
    suspend fun getLastTransactionStatus(): PaymentStatus {
        return transactionManager.getLastTransaction().status
    }
}
```

#### Common Mistakes

The most common Demeter violation in Android is accessing `context.resources.getString()` in a ViewModel. The ViewModel reaches through `context` to `resources` to get a string — three objects in a chain. Beyond the Demeter violation, this also couples the ViewModel to Android's `Context`, making it untestable in plain JUnit. The fix: pass resource IDs or sealed classes instead of resolved strings.

Another common violation is navigation. `activity.findNavController().navigate(R.id.action_to_detail)` chains through two objects. The fix: inject a `Navigator` interface that the ViewModel calls directly.

**Key takeaway:** Each class should only call methods on its direct dependencies. If you find yourself chaining through multiple objects (`a.b.c.doSomething()`), you're violating the Law of Demeter and creating brittle coupling.

### Quiz: Why Architecture Matters

#### What is the primary problem with the "God Activity" anti-pattern?

- ❌ It uses too much memory at runtime
- ❌ It prevents the app from compiling efficiently
- ✅ It mixes UI, business logic, and data access in one class, making it untestable and unmaintainable
- ❌ It causes crashes on configuration changes

> **Explanation:** The God Activity anti-pattern violates separation of concerns by putting UI rendering, business logic, network calls, and database access all in a single Activity class. This makes the code impossible to unit test and extremely difficult to maintain.

#### What does the Dependency Inversion Principle state?

- ❌ Higher-level modules should depend on lower-level modules
- ✅ Depend on abstractions, not concrete implementations
- ❌ Every class should have multiple responsibilities
- ❌ The UI layer should directly access the database

> **Explanation:** The Dependency Inversion Principle says that high-level modules should not depend on low-level modules — both should depend on abstractions (interfaces). This allows swapping implementations for testing and flexibility.

#### In Google's recommended architecture, which direction does data flow?

- ❌ Data flows up from UI to Data layer
- ❌ Data flows horizontally between layers
- ✅ Data flows down from Data layer to UI layer, events flow up
- ❌ Data flows in both directions equally

> **Explanation:** In Google's recommended architecture, data flows downward — the Data layer provides data to the Domain layer, which provides it to the UI layer. Events (user actions) flow upward from UI to ViewModel to Repository.

### Coding Challenge: Refactor a God Activity

Take the following God Activity and refactor it into properly separated classes following Google's recommended architecture layers. Apply the Single Responsibility Principle and Dependency Inversion.

#### Solution

```kotlin
// Before: God Activity
class ProductActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Fetches products from API, saves to DB, applies discount logic,
        // formats prices, and renders UI — all in one class
    }
}

// After: Separated concerns

// Domain Layer — pure Kotlin interfaces and models
interface ProductRepository {
    fun observeProducts(): Flow<List<Product>>
    suspend fun refreshProducts()
}

data class Product(val id: String, val name: String, val price: Double)

class ApplyDiscountsUseCase(private val repository: ProductRepository) {
    operator fun invoke(): Flow<List<Product>> {
        return repository.observeProducts().map { products ->
            products.map { product ->
                if (product.price > 100) {
                    product.copy(price = product.price * 0.9) // 10% off for items > $100
                } else {
                    product
                }
            }
        }
    }
}

// Data Layer — handles data sources
class ProductRepositoryImpl(
    private val api: ProductApi,
    private val dao: ProductDao
) : ProductRepository {
    override fun observeProducts(): Flow<List<Product>> = dao.observeAll()
    override suspend fun refreshProducts() {
        val products = api.fetchProducts()
        dao.insertAll(products.map { it.toEntity() })
    }
}

// UI Layer — state holder
@HiltViewModel
class ProductViewModel @Inject constructor(
    private val applyDiscounts: ApplyDiscountsUseCase,
    private val repository: ProductRepository
) : ViewModel() {
    private val _state = MutableStateFlow<ProductState>(ProductState.Loading)
    val state: StateFlow<ProductState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.refreshProducts()
            applyDiscounts()
                .catch { e -> _state.value = ProductState.Error(e.message ?: "Unknown error") }
                .collect { products -> _state.value = ProductState.Success(products) }
        }
    }
}

sealed interface ProductState {
    data object Loading : ProductState
    data class Success(val products: List<Product>) : ProductState
    data class Error(val message: String) : ProductState
}
```

Each class now has a single responsibility: the Repository manages data access, the Use Case applies business logic, and the ViewModel holds UI state. The Activity/Screen simply observes the ViewModel's state and renders it.

---

## Module 2: The Evolution of Android Architecture

Android architecture didn't arrive fully formed — it evolved through pain, production bugs, and hard-won lessons over 15 years. Understanding this evolution isn't just history for the sake of it. Every architectural pattern that exists today — MVVM, MVI, Compose Presenters — was a direct response to real problems developers hit with the previous generation. If you don't understand *why* MVP replaced MVC, or *why* MVI emerged from MVVM's limitations, you'll make the same mistakes that drove those transitions. This module walks through every major era, the problems that defined it, the solutions that emerged, and the tradeoffs teams discovered only after shipping to production. By the end, you won't just know what these patterns are — you'll understand the forces that shaped them, and you'll have a mental framework for choosing the right architecture for your own projects.

---

### Lesson 2.1: The Wild West — MVC (2008-2012)

When Android launched in 2008, there was no official architecture guidance. Google gave developers `Activity`, told them it was a "controller," and left them to figure out the rest. The result was predictable: every team invented their own patterns, and most of those patterns were terrible. Activities became god objects — 2,000-line monsters that handled UI rendering, business logic, network calls, database queries, and navigation all in one file. I've worked on codebases from this era, and they were genuinely painful. You'd open `MainActivity.java` and find networking code mixed with button click handlers mixed with SQLite cursor parsing. The term "MVC" was thrown around loosely, but what most Android teams practiced was closer to "Massive View Controller" — a pattern iOS developers had already identified and warned about.

The theoretical idea was simple enough: the Activity is the Controller, your XML layouts are the View, and your data classes are the Model. But the Android framework made a proper MVC separation almost impossible. Unlike web frameworks where the controller is a plain object that receives requests and returns responses, an Android Activity is deeply coupled to the View layer. It inflates layouts, holds references to `TextView` and `Button` objects, registers click listeners, and manages the UI state directly. There's no clean boundary between "controlling" and "viewing." The Activity *is* the view in every practical sense — it just also happens to do everything else.

```kotlin
// Typical 2010-era Activity — everything in one class
class UserActivity : Activity() {
    private lateinit var db: SQLiteDatabase
    private lateinit var nameText: TextView
    private lateinit var loadingSpinner: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user)
        nameText = findViewById(R.id.name_text)
        loadingSpinner = findViewById(R.id.loading)
        db = DatabaseHelper(this).writableDatabase

        loadingSpinner.visibility = View.VISIBLE
        // Network call on the main thread — yes, this was common
        val url = URL("https://api.example.com/user/123")
        val connection = url.openConnection() as HttpURLConnection
        val response = connection.inputStream.bufferedReader().readText()
        val name = JSONObject(response).getString("name")

        // Save to database right here in the Activity
        db.execSQL("INSERT INTO users (name) VALUES (?)", arrayOf(name))

        nameText.text = name
        loadingSpinner.visibility = View.GONE
    }
}
```

This wasn't considered bad practice in 2008 — it was just how Android development worked. Google's own sample code looked like this. But the problems compounded quickly as apps grew beyond a few screens. Testing was virtually impossible because every piece of logic was tied to the Activity lifecycle. You couldn't unit test your networking code without spinning up an entire Activity. You couldn't verify your database logic without running on a device or emulator. Mocking wasn't practical because there was nothing to mock — everything was concrete Android framework calls inline.

The lifecycle problem was even worse than the testing problem. Activities get destroyed and recreated on configuration changes like screen rotation. In the MVC era, developers either ignored rotation entirely (locking to portrait, which was shockingly common) or tried to save and restore state manually with `onSaveInstanceState`. But saving a half-completed network request? Saving the state of a complex multi-step form? These were unsolved problems that teams just hacked around.

```kotlin
// The "solution" to configuration changes — lock orientation
// This was genuinely considered acceptable in 2009-2010
<activity
    android:name=".UserActivity"
    android:screenOrientation="portrait"
    android:configChanges="orientation|keyboardHidden" />
```

```kotlin
// Or the slightly better but still broken approach: AsyncTask
class UserActivity : Activity() {
    private inner class LoadUserTask : AsyncTask<String, Void, User>() {
        override fun doInBackground(vararg params: String): User {
            // Background thread — good!
            return apiService.getUser(params[0])
        }

        override fun onPostExecute(result: User) {
            // But this crashes if Activity is destroyed during the request
            nameText.text = result.name  // potential NPE or leaked Activity
            loadingSpinner.visibility = View.GONE
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user)
        LoadUserTask().execute("123")
    }
}
```

`AsyncTask` deserves special attention because it was Google's official solution and it was fundamentally broken. The inner class held an implicit reference to the Activity, which meant every `AsyncTask` was a memory leak waiting to happen. If the Activity was destroyed while the task was running — rotation, back press, system killing the process — the `onPostExecute` callback would try to update views that no longer existed. At best you got a crash. At worst the `AsyncTask` kept the destroyed Activity in memory, leaking the entire view hierarchy. Google eventually deprecated `AsyncTask` in API 30, but the damage was done — millions of apps shipped with this pattern.

The biggest lesson from this era is that **the absence of architecture is itself an architectural decision**, and it's always the wrong one. Teams that didn't adopt any pattern ended up with the worst pattern by default: everything in the Activity. The codebase became unmaintainable after a few months, onboarding new developers was painful, and bugs from lifecycle mismanagement were constant. This pain is what drove the industry toward MVP.

```kotlin
// What "architecture" looked like in 2010 — the god Activity
class OrderActivity : Activity() {
    // 50 fields for views, database helpers, network clients, state flags
    private var isLoading = false
    private var currentOrder: Order? = null
    private var retryCount = 0

    override fun onCreate(savedInstanceState: Bundle?) { /* 200 lines */ }
    override fun onResume() { /* refresh data, re-register listeners */ }
    override fun onPause() { /* unregister listeners, cancel timers */ }
    override fun onSaveInstanceState(outState: Bundle) { /* save 15 fields */ }
    override fun onRestoreInstanceState(savedInstanceState: Bundle) { /* restore 15 fields */ }

    private fun loadOrder() { /* 80 lines of networking + parsing + UI update */ }
    private fun submitOrder() { /* 60 lines of validation + API call + error handling */ }
    private fun updateUI() { /* 40 lines of conditional visibility logic */ }
    // ... 20 more private methods
}
```

#### Common Mistakes from the MVC Era

The mistakes from this era are worth cataloging because they still show up in codebases today. First, performing network calls on the main thread — Android eventually added `StrictMode` and `NetworkOnMainThreadException` to stop this, but early apps did it routinely. Second, using `AsyncTask` for long-running operations — it was designed for tasks under a few seconds, but teams used it for file downloads, large database operations, and complex API chains. Third, storing state in Activity fields without `onSaveInstanceState` — guaranteed data loss on rotation. Fourth, using `static` references to Activities or Contexts — the fastest way to leak memory. Fifth, not canceling background work when the Activity was destroyed — leading to crashes, leaked memory, and wasted battery.

**Key takeaway:** The MVC era taught the Android community that the Activity is fundamentally unsuitable as a controller. It's a lifecycle-bound UI component, and treating it as anything else leads to untestable, leak-prone, unmaintainable code. Every architecture pattern that followed was a direct attempt to get business logic *out* of the Activity.

---

### Lesson 2.2: MVP and the Square Influence (2013-2015)

Around 2013, the Android community started looking for real architectural patterns, and MVP (Model-View-Presenter) emerged as the dominant solution. The credit for popularizing MVP on Android goes largely to the engineering team at Square. Engineers like Jake Wharton and Jesse Wilson were writing blog posts, giving conference talks, and shipping open-source libraries that demonstrated how to build Android apps with clean separation. Square's influence on Android architecture can't be overstated — they essentially created the modern Android development culture of caring about architecture, testing, and code quality.

The core idea of MVP is clean and compelling: extract all the business logic out of the Activity and put it in a plain Kotlin (or Java, at the time) class called the Presenter. The Activity becomes a thin "View" that only handles UI rendering — inflating layouts, setting text, showing/hiding views. The Presenter holds the logic, makes API calls, processes data, and tells the View what to display through a View interface. Because the Presenter is a plain class with no Android framework dependencies, you can unit test it without Robolectric, without an emulator, without any Android tooling at all. This was revolutionary.

```kotlin
// The View interface — defines what the UI can do
interface UserView {
    fun showLoading()
    fun hideLoading()
    fun showUser(user: User)
    fun showError(message: String)
    fun navigateToProfile(userId: String)
}

// The Presenter — pure business logic, no Android imports
class UserPresenter(
    private val userRepository: UserRepository,
    private val analytics: AnalyticsTracker
) {
    private var view: UserView? = null

    fun attachView(view: UserView) {
        this.view = view
    }

    fun detachView() {
        this.view = null
    }

    fun loadUser(userId: String) {
        view?.showLoading()
        userRepository.getUser(userId,
            onSuccess = { user ->
                analytics.trackUserLoaded(userId)
                view?.showUser(user)
                view?.hideLoading()
            },
            onError = { error ->
                view?.showError(error.message ?: "Unknown error")
                view?.hideLoading()
            }
        )
    }
}
```

```kotlin
// The Activity — thin view implementation
class UserActivity : AppCompatActivity(), UserView {
    private lateinit var presenter: UserPresenter
    private lateinit var nameText: TextView
    private lateinit var loadingSpinner: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user)
        nameText = findViewById(R.id.name_text)
        loadingSpinner = findViewById(R.id.loading)

        presenter = UserPresenter(UserRepositoryImpl(), AnalyticsTrackerImpl())
        presenter.attachView(this)
        presenter.loadUser(intent.getStringExtra("USER_ID") ?: "")
    }

    override fun onDestroy() {
        presenter.detachView()  // Critical — forgetting this leaks the Activity
        super.onDestroy()
    }

    override fun showLoading() { loadingSpinner.visibility = View.VISIBLE }
    override fun hideLoading() { loadingSpinner.visibility = View.GONE }
    override fun showUser(user: User) { nameText.text = user.name }
    override fun showError(message: String) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show() }
    override fun navigateToProfile(userId: String) { startActivity(ProfileActivity.intent(this, userId)) }
}
```

The testability win was genuine and significant. For the first time, Android developers could write fast, reliable unit tests for their business logic. You'd create a mock implementation of `UserView`, pass it to the Presenter, call `loadUser()`, and verify that `showLoading()` was called, then `showUser()` was called with the right data. No emulator, no Robolectric, tests running in milliseconds. Teams that adopted MVP saw their test coverage go from near-zero to meaningful levels.

```kotlin
// Testing a Presenter — fast, no Android framework needed
class UserPresenterTest {
    private val mockView = mock<UserView>()
    private val mockRepository = mock<UserRepository>()
    private val mockAnalytics = mock<AnalyticsTracker>()
    private val presenter = UserPresenter(mockRepository, mockAnalytics)

    @Before
    fun setup() {
        presenter.attachView(mockView)
    }

    @Test
    fun `loadUser shows loading then user on success`() {
        val expectedUser = User("123", "Mukul")
        whenever(mockRepository.getUser(eq("123"), any(), any())).thenAnswer {
            val onSuccess = it.getArgument<(User) -> Unit>(1)
            onSuccess(expectedUser)
        }

        presenter.loadUser("123")

        verify(mockView).showLoading()
        verify(mockView).showUser(expectedUser)
        verify(mockView).hideLoading()
        verify(mockAnalytics).trackUserLoaded("123")
    }

    @Test
    fun `loadUser shows error on failure`() {
        whenever(mockRepository.getUser(eq("123"), any(), any())).thenAnswer {
            val onError = it.getArgument<(Exception) -> Unit>(2)
            onError(RuntimeException("Network error"))
        }

        presenter.loadUser("123")

        verify(mockView).showLoading()
        verify(mockView).showError("Network error")
        verify(mockView).hideLoading()
    }
}
```

But MVP came with its own set of problems, and the biggest one was lifecycle management. The Presenter holds a reference to the View (the Activity), and if you forget to call `detachView()` in `onDestroy()`, you leak the entire Activity — the exact same class of bugs that MVP was supposed to prevent. I've seen this happen in production. A team migrates to MVP, feels good about the testability improvements, and then three months later discovers their app's memory usage is climbing because half their Presenters are still holding references to destroyed Activities. The irony was painful.

The View interface itself was also a source of problems. As the screen gets more complex, the View interface grows. I've seen View interfaces with 20+ methods: `showLoading()`, `hideLoading()`, `showUser()`, `showError()`, `showRetry()`, `hideRetry()`, `enableButton()`, `disableButton()`, `showDialog()`, `dismissDialog()`, and so on. Each method represents one UI mutation, and the Presenter has to call them in the right order. If you call `showUser()` without first calling `hideLoading()`, the UI is in an inconsistent state. There's no single source of truth for what the screen looks like — the truth is scattered across the history of method calls.

```kotlin
// The View interface explosion — real example from a production codebase
interface CheckoutView {
    fun showLoading()
    fun hideLoading()
    fun showCart(items: List<CartItem>)
    fun showEmptyCart()
    fun showTotal(total: String)
    fun showDiscount(discount: String)
    fun hideDiscount()
    fun enableCheckoutButton()
    fun disableCheckoutButton()
    fun showPaymentMethods(methods: List<PaymentMethod>)
    fun selectPaymentMethod(method: PaymentMethod)
    fun showAddressForm()
    fun fillAddress(address: Address)
    fun showError(message: String)
    fun showNetworkError()
    fun showConfirmationDialog(order: Order)
    fun navigateToConfirmation(orderId: String)
    fun showPromoCodeInput()
    fun hidePromoCodeInput()
    fun showPromoCodeError(message: String)
    fun showPromoCodeSuccess(code: String)
    // ... and it keeps growing
}
```

Configuration changes were still a problem too. The Presenter lived as long as the Activity, which meant it was destroyed and recreated on rotation. Some teams worked around this by using retained fragments or singleton Presenters, but these were hacks with their own edge cases. The fundamental issue was that MVP didn't have a lifecycle-aware component that survived configuration changes — that wouldn't arrive until Architecture Components in 2017.

#### Anti-patterns in MVP

The most common anti-pattern was the "Fat Presenter" — developers would move all the code out of the Activity and into the Presenter, creating a Presenter that was just as bloated as the original Activity. The point of MVP isn't to move the mess; it's to separate concerns. If your Presenter is doing API calls, database queries, data transformation, business logic, and navigation all in one class, you've just moved the god object — you haven't eliminated it. The Presenter should only contain presentation logic: deciding what to show, when to show it, and how to respond to user actions. Data fetching belongs in repositories, business rules belong in use cases or domain services.

**Key takeaway:** MVP proved that separating business logic from UI is possible and valuable on Android, and the testability improvements were real. But the manual lifecycle management (attach/detach), the exploding View interface, and the lack of configuration-change survival showed that the pattern needed framework-level support to work reliably. That support arrived with Architecture Components.

---

### Lesson 2.3: Architecture Components and MVVM (2016-2018)

In 2017, Google did something they'd never done before: they published official architecture guidance. At Google I/O 2017, the Android team unveiled Architecture Components — ViewModel, LiveData, Room, and Lifecycle — and with them, an official recommendation to use MVVM (Model-View-ViewModel). This was a watershed moment. For nearly a decade, Google had stayed silent on how to architect Android apps, letting the community figure it out through trial and error. The introduction of Architecture Components was an acknowledgment that the framework needed to solve lifecycle management at a system level, not leave it to individual developers.

The `ViewModel` class solved the biggest problem with MVP in one stroke: it survives configuration changes. When an Activity is destroyed and recreated due to rotation, the ViewModel stays in memory, held by the `ViewModelStore` associated with the Activity's `ViewModelStoreOwner`. No more lost state on rotation. No more retained fragments. No more singleton Presenters. The framework handles it. Under the hood, `ViewModel` instances are stored in a `ViewModelStore` that's retained through `onRetainNonConfigurationInstance()` — the same mechanism retained fragments used, but properly encapsulated.

```kotlin
// ViewModel survives configuration changes automatically
@HiltViewModel
class UserViewModel @Inject constructor(
    private val repository: UserRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _user = MutableLiveData<User>()
    val user: LiveData<User> = _user

    private val _loading = MutableLiveData<Boolean>()
    val loading: LiveData<Boolean> = _loading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    fun loadUser(userId: String) {
        _loading.value = true
        viewModelScope.launch {
            try {
                val result = repository.getUser(userId)
                _user.value = result
                _error.value = null
            } catch (e: Exception) {
                _error.value = e.message
            } finally {
                _loading.value = false
            }
        }
    }
}
```

LiveData was the other half of the equation. It's a lifecycle-aware observable — it only delivers updates to observers that are in an active lifecycle state (STARTED or RESUMED). This eliminated an entire class of bugs. In MVP, if the Presenter tried to call `view.showUser()` when the Activity was in the background, you'd get crashes or visual artifacts. With LiveData, the update is simply held until the observer is active again. No manual attach/detach, no null checks on the view reference, no `isActivityDestroyed()` guards. The framework handles it.

```kotlin
// Activity with ViewModel — no attach/detach, no lifecycle management
class UserActivity : AppCompatActivity() {

    private val viewModel: UserViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user)

        val nameText = findViewById<TextView>(R.id.name_text)
        val loadingSpinner = findViewById<ProgressBar>(R.id.loading)
        val errorText = findViewById<TextView>(R.id.error_text)

        // Observe LiveData — lifecycle-aware, no leaks
        viewModel.user.observe(this) { user ->
            nameText.text = user.name
        }

        viewModel.loading.observe(this) { isLoading ->
            loadingSpinner.visibility = if (isLoading) View.VISIBLE else View.GONE
        }

        viewModel.error.observe(this) { error ->
            errorText.visibility = if (error != null) View.VISIBLE else View.GONE
            errorText.text = error ?: ""
        }

        if (savedInstanceState == null) {
            viewModel.loadUser(intent.getStringExtra("USER_ID") ?: "")
        }
    }
}
```

The View interface from MVP? Gone. Instead of defining 20 methods for every possible UI mutation, MVVM exposes observable state that the View subscribes to. The ViewModel doesn't know about the View at all — it just updates its state, and whatever is observing that state reacts accordingly. This is a fundamental shift from imperative ("call these methods in this order") to declarative ("here's the current state, render it"). The ViewModel became the single source of truth for the screen's state, and the View became a pure function of that state.

But MVVM had its own problems, and they took a while to surface. The first was state fragmentation. In the ViewModel above, the screen state is split across three separate LiveData fields: `user`, `loading`, and `error`. This seems fine for simple screens. But on a real production screen with 8-10 pieces of state — user data, loading flags, error messages, button enabled states, dialog visibility, form validation results — you end up with 8-10 separate LiveData fields that can get out of sync. Is it possible to have `loading = true` and `error = "something"` at the same time? It shouldn't be, but with separate fields, the code doesn't enforce that.

```kotlin
// State fragmentation — the core MVVM problem
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val paymentRepository: PaymentRepository
) : ViewModel() {

    // 8 separate observable fields — any combination is possible
    private val _cartItems = MutableLiveData<List<CartItem>>()
    val cartItems: LiveData<List<CartItem>> = _cartItems

    private val _total = MutableLiveData<String>()
    val total: LiveData<String> = _total

    private val _loading = MutableLiveData<Boolean>()
    val loading: LiveData<Boolean> = _loading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    private val _paymentMethods = MutableLiveData<List<PaymentMethod>>()
    val paymentMethods: LiveData<List<PaymentMethod>> = _paymentMethods

    private val _selectedPayment = MutableLiveData<PaymentMethod?>()
    val selectedPayment: LiveData<PaymentMethod?> = _selectedPayment

    private val _checkoutEnabled = MutableLiveData<Boolean>()
    val checkoutEnabled: LiveData<Boolean> = _checkoutEnabled

    private val _promoApplied = MutableLiveData<Boolean>()
    val promoApplied: LiveData<Boolean> = _promoApplied

    // Bug: can loading be true while error is non-null?
    // Bug: can checkoutEnabled be true while cartItems is empty?
    // Nothing in the code prevents impossible state combinations
}
```

The second problem was LiveData's limitations as a reactive stream. LiveData was designed for simple value observation, not for complex data transformations. `Transformations.map()` and `Transformations.switchMap()` existed, but they were clunky compared to RxJava's operator chains. LiveData couldn't handle one-time events well — things like "show a Toast" or "navigate to another screen" that should happen exactly once, not every time the observer re-subscribes. The community invented `SingleLiveEvent`, `Event` wrapper classes, and Channels to work around this, but they were all hacks. This eventually led to the adoption of `StateFlow` and `SharedFlow` from Kotlin Coroutines as replacements for LiveData.

```kotlin
// The SingleLiveEvent hack — a sign that LiveData wasn't enough
open class SingleLiveEvent<T> : MutableLiveData<T>() {
    private val pending = AtomicBoolean(false)

    override fun observe(owner: LifecycleOwner, observer: Observer<in T>) {
        super.observe(owner) { t ->
            if (pending.compareAndSet(true, false)) {
                observer.onChanged(t)
            }
        }
    }

    override fun setValue(t: T?) {
        pending.set(true)
        super.setValue(t)
    }
}

// Usage — awkward and easy to misuse
class LoginViewModel : ViewModel() {
    private val _navigateToHome = SingleLiveEvent<Unit>()
    val navigateToHome: LiveData<Unit> = _navigateToHome

    fun onLoginSuccess() {
        _navigateToHome.value = Unit  // fires once, then ignored
    }
}
```

Despite these issues, MVVM with Architecture Components was a massive step forward. It eliminated the manual lifecycle management that plagued MVP, it gave developers a framework-supported way to survive configuration changes, and it established the pattern of ViewModels as the source of truth for UI state. The testing story improved too — ViewModels are plain classes that can be tested with `InstantTaskExecutorRule` for LiveData, and later with `Turbine` for StateFlow. The transition from LiveData to StateFlow happened gradually between 2020 and 2022, and most modern codebases now use `StateFlow` exclusively.

#### Common Mistakes with MVVM

The most common mistake was putting UI logic in the Activity/Fragment instead of the ViewModel. Teams would observe LiveData in the Fragment and then add conditional logic: "if the user is premium, show this; otherwise show that." That logic belongs in the ViewModel — the View should receive the fully computed state and just render it. Another common mistake was exposing `MutableLiveData` directly instead of backing it with a private mutable field and a public immutable one. This lets the View modify state directly, defeating the purpose of unidirectional data flow.

**Key takeaway:** MVVM with Architecture Components solved MVP's lifecycle problems and eliminated manual attach/detach, but introduced state fragmentation when screens had many observable fields. The real insight was that the ViewModel should be the single source of truth — a principle that MVI would take to its logical conclusion.

---

### Lesson 2.4: MVI and the Single State Object (2018-2020)

MVI (Model-View-Intent) emerged from a specific frustration with MVVM: state inconsistency. When your ViewModel exposes 6 separate `StateFlow` fields, nothing prevents them from getting into impossible combinations. Loading is true but there's also an error showing. The cart is empty but the checkout button is enabled. The payment method is selected but the payment methods list hasn't loaded yet. In theory, these states shouldn't coexist. In practice, with separate mutable fields, they absolutely can — and they do, especially in complex screens with multiple concurrent data sources. MVI's solution is radical in its simplicity: collapse all state into a single object.

The "Model" in MVI isn't a data model — it's the entire state of the screen, represented as a single immutable data class. The "Intent" isn't Android's `Intent` class — it's a user action or event, typically modeled as a sealed class. The "View" renders the current state and emits intents. The flow is unidirectional: the View emits an Intent, the ViewModel processes it through a reducer function, produces a new state, and the View re-renders. At any point in time, the entire screen state is captured in one object. You can log it, serialize it, compare it, and reason about it. There's no ambiguity about what the screen looks like.

```kotlin
// MVI: Single state object — impossible states become impossible
data class CheckoutState(
    val cartItems: List<CartItem> = emptyList(),
    val total: String = "$0.00",
    val paymentMethods: List<PaymentMethod> = emptyList(),
    val selectedPayment: PaymentMethod? = null,
    val promoCode: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null
) {
    // Derived state — computed from the single state object
    val isCheckoutEnabled: Boolean
        get() = cartItems.isNotEmpty() &&
                selectedPayment != null &&
                !isLoading &&
                error == null

    val showEmptyCart: Boolean
        get() = cartItems.isEmpty() && !isLoading
}

// Intents — every possible user action
sealed interface CheckoutIntent {
    data object LoadCart : CheckoutIntent
    data class RemoveItem(val itemId: String) : CheckoutIntent
    data class SelectPayment(val method: PaymentMethod) : CheckoutIntent
    data class ApplyPromo(val code: String) : CheckoutIntent
    data object PlaceOrder : CheckoutIntent
}
```

The reducer pattern is the heart of MVI. Every state change goes through a single function that takes the current state and an action, and returns a new state. This makes state transitions explicit, traceable, and testable. You can look at the reducer and see every possible state transition in one place. Compare this to MVVM where state mutations are scattered across multiple methods, each modifying a different `MutableStateFlow`.

```kotlin
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val paymentRepository: PaymentRepository,
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _state = MutableStateFlow(CheckoutState())
    val state: StateFlow<CheckoutState> = _state.asStateFlow()

    private val _sideEffects = Channel<CheckoutSideEffect>(Channel.BUFFERED)
    val sideEffects: Flow<CheckoutSideEffect> = _sideEffects.receiveAsFlow()

    fun processIntent(intent: CheckoutIntent) {
        when (intent) {
            is CheckoutIntent.LoadCart -> loadCart()
            is CheckoutIntent.RemoveItem -> removeItem(intent.itemId)
            is CheckoutIntent.SelectPayment -> selectPayment(intent.method)
            is CheckoutIntent.ApplyPromo -> applyPromo(intent.code)
            is CheckoutIntent.PlaceOrder -> placeOrder()
        }
    }

    private fun loadCart() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                val items = cartRepository.getCartItems()
                val methods = paymentRepository.getPaymentMethods()
                _state.update { it.copy(
                    cartItems = items,
                    total = calculateTotal(items),
                    paymentMethods = methods,
                    isLoading = false
                )}
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    private fun selectPayment(method: PaymentMethod) {
        _state.update { it.copy(selectedPayment = method) }
    }

    private fun placeOrder() {
        val currentState = _state.value
        if (!currentState.isCheckoutEnabled) return

        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                val orderId = orderRepository.placeOrder(
                    items = currentState.cartItems,
                    payment = currentState.selectedPayment!!,
                    promoCode = currentState.promoCode
                )
                _sideEffects.send(CheckoutSideEffect.NavigateToConfirmation(orderId))
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    private fun calculateTotal(items: List<CartItem>): String {
        val total = items.sumOf { it.price * it.quantity }
        return "$${String.format("%.2f", total / 100.0)}"
    }
}
```

One-time events — navigation, toasts, snackbar messages — are the trickiest part of MVI. They don't fit the "state" model because they're not persistent state; they're things that happen once and shouldn't be re-triggered when the state is re-observed. The community settled on using `Channel` or `SharedFlow` for side effects (also called "effects" or "events"), kept separate from the main state. This isn't ideal — it breaks the "single state" purity — but it's the practical solution that works. Some teams model events as part of the state and then "consume" them, but that approach has its own problems with race conditions.

```kotlin
// Side effects — events that happen once, not persistent state
sealed interface CheckoutSideEffect {
    data class NavigateToConfirmation(val orderId: String) : CheckoutSideEffect
    data class ShowToast(val message: String) : CheckoutSideEffect
    data object ShowRatingDialog : CheckoutSideEffect
}

// Collecting side effects in Compose
@Composable
fun CheckoutScreen(
    viewModel: CheckoutViewModel = hiltViewModel(),
    onNavigateToConfirmation: (String) -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.sideEffects.collect { effect ->
            when (effect) {
                is CheckoutSideEffect.NavigateToConfirmation ->
                    onNavigateToConfirmation(effect.orderId)
                is CheckoutSideEffect.ShowToast -> { /* show toast */ }
                is CheckoutSideEffect.ShowRatingDialog -> { /* show dialog */ }
            }
        }
    }

    CheckoutContent(
        state = state,
        onIntent = viewModel::processIntent
    )
}
```

Testing is where MVI really shines compared to MVVM. Because the entire state is in one object and every transition is explicit, tests become straightforward state-in, state-out assertions. You set up an initial state, send an intent, and assert the resulting state. No mocking of view interfaces, no verifying method call order, no dealing with multiple observable streams. You're testing a pure function: given this state and this intent, produce this new state.

```kotlin
class CheckoutViewModelTest {
    private val cartRepository = FakeCartRepository()
    private val paymentRepository = FakePaymentRepository()
    private val orderRepository = FakeOrderRepository()
    private lateinit var viewModel: CheckoutViewModel

    @Before
    fun setup() {
        viewModel = CheckoutViewModel(cartRepository, paymentRepository, orderRepository)
    }

    @Test
    fun `loading cart updates state with items and payment methods`() = runTest {
        val items = listOf(CartItem("1", "Widget", 999, 2))
        val methods = listOf(PaymentMethod("card", "Visa ending 4242"))
        cartRepository.setItems(items)
        paymentRepository.setMethods(methods)

        viewModel.processIntent(CheckoutIntent.LoadCart)

        val state = viewModel.state.value
        assertFalse(state.isLoading)
        assertEquals(items, state.cartItems)
        assertEquals(methods, state.paymentMethods)
        assertNull(state.error)
        assertEquals("$19.98", state.total)
    }

    @Test
    fun `checkout enabled only when cart has items and payment selected`() = runTest {
        val emptyState = CheckoutState()
        assertFalse(emptyState.isCheckoutEnabled)

        val withItems = emptyState.copy(cartItems = listOf(CartItem("1", "Widget", 999, 1)))
        assertFalse(withItems.isCheckoutEnabled)  // still no payment

        val ready = withItems.copy(selectedPayment = PaymentMethod("card", "Visa"))
        assertTrue(ready.isCheckoutEnabled)

        val loading = ready.copy(isLoading = true)
        assertFalse(loading.isCheckoutEnabled)  // can't checkout while loading
    }
}
```

The tradeoffs of MVI are real, though. The biggest is boilerplate. Every user action needs an Intent class. Every state change goes through `copy()`. For simple screens — a settings page, a static info screen — MVI is overkill. You're writing sealed classes, intent processors, and reducer logic for something that could be three lines of code in a simple ViewModel. I've seen teams mandate MVI for every screen and end up with 200-line ViewModels for screens that display a single list. The pattern should match the complexity of the screen.

The other tradeoff is performance. When you have a single state object with 15 fields and you update one field, the entire state is re-emitted. In Compose, this means the composable receives a new state object and needs to figure out what actually changed. Compose handles this well with its smart recomposition, but it's worth being aware of. For screens with high-frequency updates — a real-time chat, a stock ticker — the constant state copying can add up. Some teams split their state into sub-states or use `distinctUntilChanged()` on derived flows to mitigate this.

#### Anti-patterns in MVI

The biggest anti-pattern is what I call "MVI theater" — teams that adopt the terminology (intents, state, reducer) but don't actually follow the pattern. They have an `Intent` sealed class but modify state from multiple places. They have a single state object but also expose separate `MutableStateFlow` fields. They call it MVI but the state transitions aren't going through a single reducer. If you're going to use MVI, commit to it. Half-measures give you the boilerplate of MVI without the benefits. Another anti-pattern is putting side effects in the state object — having a field like `navigateToScreen: String?` that you set and then immediately clear. This creates race conditions and makes the state unreliable.

**Key takeaway:** MVI solved state inconsistency by collapsing all state into a single immutable object with explicit transitions. It makes testing straightforward and debugging easy — you can log every state transition. But the boilerplate cost is real, and MVI is overkill for simple screens. Use it where state complexity justifies it, and use simpler patterns for simpler screens.

---

### Lesson 2.5: Modern Compose Era and Presenters (2021-Present)

Jetpack Compose changed the conversation about Android architecture in ways that are still unfolding. Before Compose, the View layer was XML layouts inflated by Activities and Fragments. The architecture was about managing the boundary between the imperative view system and the reactive data layer. With Compose, the View layer itself became declarative and reactive — composables are functions that take state and produce UI. This alignment between the architecture pattern (reactive state) and the UI framework (reactive rendering) opened up new possibilities that weren't practical with the XML view system.

The first thing Compose changed was the role of Fragments. In the XML world, Fragments were the primary unit of UI composition — each screen was a Fragment, navigation was Fragment-based, and ViewModels were scoped to Fragments. With Compose, composable functions replaced Fragments for most use cases. A "screen" in Compose is just a composable function that takes a ViewModel and renders state. Navigation is handled by the Compose Navigation library, which routes to composables, not Fragments. This simplification eliminated an entire layer of lifecycle complexity — no more Fragment lifecycle bugs, no more `viewLifecycleOwner` vs `this`, no more `childFragmentManager` issues.

```kotlin
// Modern Compose screen — no Fragment, no XML, just a function
@Composable
fun SearchScreen(
    viewModel: SearchViewModel = hiltViewModel(),
    onNavigateToDetail: (String) -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        SearchBar(
            query = state.query,
            onQueryChange = { viewModel.processIntent(SearchIntent.UpdateQuery(it)) },
            onSearch = { viewModel.processIntent(SearchIntent.Search) }
        )

        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.error != null -> {
                ErrorContent(
                    message = state.error!!,
                    onRetry = { viewModel.processIntent(SearchIntent.Search) }
                )
            }
            state.results.isEmpty() && state.hasSearched -> {
                EmptyState(message = "No results found for \"${state.query}\"")
            }
            else -> {
                SearchResults(
                    results = state.results,
                    onItemClick = { onNavigateToDetail(it.id) }
                )
            }
        }
    }
}
```

The more interesting development is the emergence of Compose Presenters — plain Kotlin classes that produce state for composables without using `ViewModel` at all. This approach was popularized by Cash App's Molecule library and by the Circuit library. The idea is that `ViewModel` is a heavyweight solution: it requires Hilt wiring, it's scoped to an entire screen, and it carries lifecycle semantics (like `viewModelScope`) that aren't always necessary. A Compose Presenter is just a class — or even a composable function — that produces state. No DI framework needed, no lifecycle callbacks, no `SavedStateHandle` ceremony.

```kotlin
// Molecule-style Presenter — a composable function that produces state
@Composable
fun SearchPresenter(
    repository: SearchRepository,
    events: Flow<SearchEvent>
): SearchState {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<SearchResult>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var hasSearched by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        events.collect { event ->
            when (event) {
                is SearchEvent.UpdateQuery -> query = event.query
                is SearchEvent.Search -> {
                    isLoading = true
                    error = null
                    hasSearched = true
                    try {
                        results = repository.search(query)
                    } catch (e: Exception) {
                        error = e.message
                    } finally {
                        isLoading = false
                    }
                }
            }
        }
    }

    return SearchState(
        query = query,
        results = results,
        isLoading = isLoading,
        error = error,
        hasSearched = hasSearched
    )
}
```

The key advantage of Compose Presenters is composability — in the functional programming sense. A ViewModel is monolithic: one ViewModel per screen, handling all the logic for that screen. A Presenter can be scoped to any composable, not just the screen root. You can have a `SearchBarPresenter` that handles search logic, a `FilterPresenter` that handles filter state, and a `ResultsPresenter` that handles pagination — each independently testable, each reusable across screens. This is a fundamentally different granularity than ViewModel provides.

```kotlin
// Presenter per component — not per screen
@Composable
fun FilterChipBar(
    repository: FilterRepository
) {
    val filters = rememberFilterPresenter(repository)

    LazyRow {
        items(filters.available) { filter ->
            FilterChip(
                selected = filter in filters.selected,
                onClick = { filters.toggle(filter) },
                label = { Text(filter.label) }
            )
        }
    }
}

// The presenter is scoped to this composable, not the whole screen
class FilterPresenterState(
    val available: List<Filter>,
    val selected: Set<Filter>,
    val toggle: (Filter) -> Unit
)

@Composable
fun rememberFilterPresenter(repository: FilterRepository): FilterPresenterState {
    var available by remember { mutableStateOf<List<Filter>>(emptyList()) }
    var selected by remember { mutableStateOf<Set<Filter>>(emptySet()) }

    LaunchedEffect(Unit) {
        available = repository.getFilters()
    }

    return FilterPresenterState(
        available = available,
        selected = selected,
        toggle = { filter ->
            selected = if (filter in selected) selected - filter else selected + filter
        }
    )
}
```

But Compose Presenters come with tradeoffs that you need to understand before adopting them. The biggest one: they don't survive configuration changes. When the Activity is destroyed and recreated, a plain Presenter class is gone. Its state is gone. Compose's `remember` is tied to the composition, and the composition is tied to the Activity. `rememberSaveable` can persist primitive state across configuration changes, but complex objects — lists, nested data classes, network responses — need custom `Saver` implementations or serialization. ViewModel handles this automatically because the framework retains it. So Presenters trade simplicity for responsibility — you gain a lighter-weight component, but you take on state persistence yourself.

```kotlin
// ViewModel vs Presenter — the configuration change tradeoff
// ViewModel: survives rotation automatically
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repository: SearchRepository
) : ViewModel() {
    // This state survives rotation — ViewModel is retained
    private val _state = MutableStateFlow(SearchState())
    val state: StateFlow<SearchState> = _state.asStateFlow()
}

// Presenter: does NOT survive rotation — state is lost
@Composable
fun SearchPresenter(): SearchState {
    // This state is lost on rotation unless you use rememberSaveable
    var query by rememberSaveable { mutableStateOf("") }
    // Complex objects need custom Savers
    var results by remember { mutableStateOf<List<SearchResult>>(emptyList()) }
    // results will be empty after rotation — you'd need to re-fetch

    return SearchState(query = query, results = results)
}
```

The modern Compose era has also brought a shift in how we think about state management more broadly. The `collectAsStateWithLifecycle()` extension from the `lifecycle-runtime-compose` library replaced `collectAsState()` as the recommended way to collect flows in Compose. It's lifecycle-aware — it stops collecting when the composable leaves the screen, reducing unnecessary work and preventing updates to invisible UI. This subtle change represents the maturity of the ecosystem: the lifecycle-awareness that was revolutionary in LiveData is now baked into the standard flow collection pattern.

The current state of the art is pragmatic: most production apps use ViewModel for screen-level state management and Compose for the UI layer. Some teams — particularly those influenced by Square/Cash App — use Molecule or Circuit for a more Compose-native approach. The "right" answer depends on your team's experience, your app's complexity, and whether you need features like process death survival (ViewModel + SavedStateHandle) or component-level reuse (Presenters). The important thing is that the ecosystem now offers real choices, not just one hacky approach that everyone suffers through together.

**Key takeaway:** Compose Presenters offer lighter-weight, more composable state management than ViewModel, but they don't survive configuration changes. The modern approach is pragmatic — use ViewModel for screen-level state that needs persistence, and consider Presenters for component-level state that can be recomputed. The best architecture for Compose is the one that matches your specific needs, not the one with the most blog posts.

---

### Lesson 2.6: Choosing the Right Architecture

Here's the thing about architecture discussions: they often devolve into religious wars. MVI advocates argue it's the only pattern that guarantees consistency. MVVM defenders point out that MVI's boilerplate is unnecessary for 80% of screens. Compose Presenter enthusiasts want to throw out ViewModel entirely. The truth is that architecture is about tradeoffs, and the right choice depends on your team, your app, and your specific constraints. There is no universally "best" architecture — only the best architecture for your situation.

The first factor is team size and experience. A solo developer building a side project doesn't need the ceremony of full MVI with sealed intent classes and side effect channels. A simple ViewModel with a single `StateFlow<UiState>` is probably enough. But a team of 20 developers working on a banking app? They need the guardrails that MVI provides — enforced unidirectional data flow, explicit state transitions, and a single state object that prevents the kind of subtle bugs that slip through code review. The pattern should match the team's need for structure, not the individual developer's preference.

```kotlin
// Simple screen — ViewModel is plenty, MVI is overkill
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    val settings: StateFlow<SettingsState> = settingsRepository
        .observeSettings()
        .map { prefs ->
            SettingsState(
                darkMode = prefs.darkMode,
                notifications = prefs.notificationsEnabled,
                language = prefs.language
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsState())

    fun toggleDarkMode() {
        viewModelScope.launch {
            settingsRepository.setDarkMode(!settings.value.darkMode)
        }
    }

    fun toggleNotifications() {
        viewModelScope.launch {
            settingsRepository.setNotifications(!settings.value.notifications)
        }
    }
}
```

The second factor is screen complexity. Screens with simple, independent state — a list of items, a toggle switch, a text field — work fine with basic MVVM. But screens with interdependent state — where the value of one field affects the validity of another, where multiple loading states need to be coordinated, where the order of operations matters — these screens benefit from MVI's single state object. I've found that if a screen has more than 4-5 pieces of mutable state that interact with each other, MVI starts paying for itself. Below that threshold, it's overhead.

```kotlin
// Complex screen — MVI's single state object prevents bugs
data class LoanApplicationState(
    val personalInfo: PersonalInfo = PersonalInfo(),
    val employmentInfo: EmploymentInfo = EmploymentInfo(),
    val currentStep: Step = Step.PERSONAL_INFO,
    val isSubmitting: Boolean = false,
    val validationErrors: Map<String, String> = emptyMap(),
    val eligibilityResult: EligibilityResult? = null,
    val documents: List<Document> = emptyList(),
    val termsAccepted: Boolean = false
) {
    val canProceedToNextStep: Boolean
        get() = when (currentStep) {
            Step.PERSONAL_INFO -> personalInfo.isValid && validationErrors.isEmpty()
            Step.EMPLOYMENT -> employmentInfo.isValid
            Step.DOCUMENTS -> documents.size >= 2
            Step.REVIEW -> termsAccepted && eligibilityResult?.eligible == true
        }

    val progress: Float
        get() = (currentStep.ordinal + 1).toFloat() / Step.entries.size

    enum class Step { PERSONAL_INFO, EMPLOYMENT, DOCUMENTS, REVIEW }
}
```

The third factor is testing requirements. If your team has strong testing discipline and wants to test state transitions exhaustively, MVI makes tests clean and predictable: set up state, send intent, assert new state. If testing is more ad-hoc or focused on integration tests rather than unit tests, the simpler MVVM approach is fine. Don't adopt MVI just because it has better testing ergonomics if your team doesn't actually write unit tests — that's paying the boilerplate cost without getting the benefit.

```kotlin
// Decision framework — which pattern for which screen?
// Use this as a mental model, not a rigid rule

// SIMPLE SCREEN → Basic ViewModel with StateFlow
// - Settings, Profile, About, Static content
// - 1-3 pieces of state, minimal user interaction
// - No complex state interdependencies

// MEDIUM SCREEN → ViewModel with sealed UiState
// - List + detail, search, basic forms
// - 3-5 pieces of state, some interaction
// - States are mostly independent

sealed interface ArticleListUiState {
    data object Loading : ArticleListUiState
    data class Success(val articles: List<Article>) : ArticleListUiState
    data class Error(val message: String) : ArticleListUiState
}

// COMPLEX SCREEN → Full MVI with intents and reducer
// - Multi-step forms, checkout flows, real-time dashboards
// - 5+ pieces of interdependent state
// - Multiple concurrent operations
// - Order of state transitions matters
```

The fourth factor is whether you need process death survival. If your app handles sensitive data — a half-completed form, an unsaved draft, a payment flow — you need state to survive process death. ViewModel's `SavedStateHandle` handles this. Compose Presenters with `rememberSaveable` can handle simple state, but complex state requires more work. If process death recovery is critical, ViewModel has a clear advantage over Presenters for that specific requirement.

```kotlin
// Process death survival — ViewModel + SavedStateHandle
@HiltViewModel
class DraftViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val draftRepository: DraftRepository
) : ViewModel() {

    // Survives both configuration changes AND process death
    val title = savedStateHandle.getStateFlow("title", "")
    val body = savedStateHandle.getStateFlow("body", "")

    fun updateTitle(newTitle: String) {
        savedStateHandle["title"] = newTitle
    }

    fun updateBody(newBody: String) {
        savedStateHandle["body"] = newBody
    }

    fun saveDraft() {
        viewModelScope.launch {
            draftRepository.save(
                Draft(title = title.value, body = body.value)
            )
        }
    }
}
```

One approach I've seen work well in larger codebases is a hybrid: use MVI for complex screens with interdependent state, and use simple MVVM for everything else. The key is consistency within each screen — don't mix patterns within a single screen. A settings screen with basic MVVM next to a checkout flow with full MVI is fine. A single screen that uses MVI for some state and direct mutation for other state is a recipe for bugs.

The architectural decision you make today will affect your team for years. Choose based on your actual constraints — team size, screen complexity, testing discipline, state persistence needs — not based on what's trending on Twitter. The best architecture is the one your team can maintain, understand, and extend without fear. If everyone on the team understands simple MVVM but nobody understands MVI, adopting MVI will slow you down even if it's theoretically "better." Architecture serves the team, not the other way around.

**Key takeaway:** There is no single "best" architecture. Choose based on concrete factors: team size and experience, screen complexity, testing requirements, and process death needs. Use simple MVVM for simple screens, MVI for complex screens with interdependent state, and consider Compose Presenters when you need component-level reuse. Consistency within each screen matters more than consistency across the entire app.

---

### Quiz: Evolution of Android Architecture

#### What problem did MVI solve that MVVM couldn't?

- ❌ MVI eliminated the need for ViewModel
- ✅ MVI solved state inconsistency by collapsing all state into a single object with a single reducer
- ❌ MVI made apps faster at runtime
- ❌ MVI eliminated the need for coroutines

> **Explanation:** When MVVM exposes 5-6 separate LiveData/StateFlow fields, they can get out of sync. MVI collapsed all state into a single object, so fields can't become inconsistent. Every state change goes through one reducer function.

#### Why did MVP introduce lifecycle problems despite solving testability?

- ❌ MVP didn't use ViewModel
- ❌ MVP required coroutines which didn't exist yet
- ✅ MVP required manual attach/detach of the View reference, and forgetting to detach caused memory leaks
- ❌ MVP didn't support configuration changes at all

> **Explanation:** In MVP, the Presenter holds a reference to the View interface. You must manually call `detachView()` when the Activity is destroyed to prevent memory leaks. Forgetting this — which many teams did — caused the exact same leaks MVP was supposed to prevent.

#### What is the main advantage of Compose Presenters over ViewModel?

- ❌ They are faster at runtime
- ✅ They can be scoped to individual composables rather than entire screens, and don't require DI wiring
- ❌ They survive process death automatically
- ❌ They replace the need for state management

> **Explanation:** Compose Presenters are plain Kotlin classes that produce state for specific composables. They're lighter weight than ViewModel and don't require Hilt wiring. However, they don't survive configuration changes — Compose's `rememberSaveable` handles that instead.

### Coding Challenge: Migrate MVP to MVVM

Take the MVP Presenter below and convert it to a proper MVVM ViewModel with StateFlow, eliminating the manual lifecycle management.

#### Solution

```kotlin
// Before: MVP Presenter with manual lifecycle
class UserPresenter(private val repository: UserRepository) {
    private var view: UserView? = null
    fun attachView(view: UserView) { this.view = view }
    fun detachView() { this.view = null }
    fun loadUser(id: String) {
        view?.showLoading()
        // fetch and call view?.showUser(user)
    }
}

// After: MVVM ViewModel — no lifecycle management needed
sealed interface UserUiState {
    data object Loading : UserUiState
    data class Success(val user: User) : UserUiState
    data class Error(val message: String) : UserUiState
}

@HiltViewModel
class UserViewModel @Inject constructor(
    private val repository: UserRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val userId = savedStateHandle.get<String>("userId") ?: ""

    val uiState: StateFlow<UserUiState> = flow {
        emit(UserUiState.Loading)
        try {
            val user = repository.getUser(userId)
            emit(UserUiState.Success(user))
        } catch (e: Exception) {
            emit(UserUiState.Error(e.message ?: "Failed to load user"))
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), UserUiState.Loading)
}

// In Compose — no attach/detach, no memory leaks
@Composable
fun UserScreen(viewModel: UserViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    when (state) {
        is UserUiState.Loading -> LoadingIndicator()
        is UserUiState.Success -> UserContent((state as UserUiState.Success).user)
        is UserUiState.Error -> ErrorMessage((state as UserUiState.Error).message)
    }
}
```

The ViewModel version eliminates attach/detach entirely. `StateFlow` + `collectAsStateWithLifecycle()` handles lifecycle automatically — no memory leaks, no manual callbacks, no crashes from updating a destroyed View.

---
## Module 3: MVVM Pattern Deep Dive

Model-View-ViewModel is the standard Android architecture. Google recommends it, Android Jetpack is built around it, and the ecosystem's tooling assumes it. But "use MVVM" is the beginning of the conversation, not the end. How you structure the ViewModel, how you manage state, how you handle events — these decisions separate a clean MVVM implementation from a God ViewModel that's just a God Activity wearing a different hat.

### Lesson 3.1: ViewModel Responsibilities and Boundaries

The first question every Android developer should answer before writing a single line in a ViewModel is: what belongs here and what doesn't? I've reviewed codebases where a ViewModel was 2,000 lines long, calling APIs directly, formatting dates, building notification strings, querying SharedPreferences, and holding a reference to the Activity's toolbar. That's not MVVM — that's a God Activity that moved to a different file. The ViewModel exists for one reason: to hold and manage UI-related state in a lifecycle-aware way. Everything else is somebody else's job.

A ViewModel's responsibilities are narrow by design. It takes user actions from the UI layer, delegates business logic to use cases or repositories, and exposes state that the UI observes. It does not format strings. It does not directly access the database. It does not know whether it's feeding a Fragment, an Activity, or a Compose screen. This boundary matters because the moment a ViewModel starts doing work that belongs in a different layer, you lose testability — and testability is the whole point of separating concerns in the first place.

```kotlin
// WRONG: ViewModel doing too much
class OrderViewModel(
    private val database: OrderDatabase,
    private val sharedPrefs: SharedPreferences,
    private val context: Context // Never do this
) : ViewModel() {

    fun loadOrders() {
        viewModelScope.launch {
            val orders = database.orderDao().getAll() // Direct DB access
            val formatted = orders.map { order ->
                order.copy(
                    displayDate = SimpleDateFormat("MMM dd", Locale.US).format(order.date),
                    statusText = context.getString(order.statusResId) // Context usage
                )
            }
            _uiState.value = formatted
        }
    }
}
```

The fix is straightforward. The ViewModel calls a use case or repository that handles data access. Formatting happens either in the UI layer (for display-only transforms) or through a mapper that the ViewModel delegates to. Context never touches the ViewModel.

```kotlin
// RIGHT: ViewModel with clear boundaries
@HiltViewModel
class OrderViewModel @Inject constructor(
    private val getOrdersUseCase: GetOrdersUseCase
) : ViewModel() {

    val uiState: StateFlow<OrderUiState> = getOrdersUseCase()
        .map { orders ->
            OrderUiState.Success(
                orders = orders.map { it.toUiModel() }
            )
        }
        .catch { emit(OrderUiState.Error(it.message ?: "Unknown error")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), OrderUiState.Loading)
}
```

Notice what disappeared: no database, no SharedPreferences, no Context, no date formatting. The ViewModel's job is to connect the data layer's output to the UI layer's input. The `toUiModel()` mapper converts domain models to UI models, but it doesn't use Context either — it passes resource IDs, not resolved strings.

One boundary that trips up even experienced developers is resource access. You need to show an error message from `R.string.network_error`, so you grab a Context reference. Don't. Instead, pass the resource ID or use a sealed class that represents the error type, and let the UI resolve the string. The UI layer already has Context — that's where string resolution belongs.

```kotlin
// Pass resource IDs, not resolved strings
data class OrderUiModel(
    val id: String,
    val title: String,
    val statusResId: Int, // R.string reference, not the resolved string
    val statusColor: Int  // R.color reference
)

// Or better: use a sealed type the UI maps to a string
sealed interface OrderStatus {
    data object Pending : OrderStatus
    data object Shipped : OrderStatus
    data object Delivered : OrderStatus
}

// In Compose UI
@Composable
fun OrderStatusText(status: OrderStatus) {
    val text = when (status) {
        OrderStatus.Pending -> stringResource(R.string.status_pending)
        OrderStatus.Shipped -> stringResource(R.string.status_shipped)
        OrderStatus.Delivered -> stringResource(R.string.status_delivered)
    }
    Text(text = text)
}
```

There's another boundary people violate constantly: using ViewModels in Services, BroadcastReceivers, or ContentProviders. A ViewModel is tied to a `ViewModelStoreOwner` — an Activity or Fragment. Services don't have a `ViewModelStore`. Attempting to create a ViewModel inside a Service means you're manually constructing it without lifecycle management, which defeats its entire purpose. If your Service needs shared state, use a repository scoped to the Application or a dependency injection scope that outlives both the Service and the Activity.

The `AndroidViewModel` subclass exists as a compromise — it gives you Application context, not Activity context. But I'd argue that even `AndroidViewModel` is a code smell in most cases. If you need Application context, whatever you're doing with it (accessing a system service, getting a content resolver) should be injected as a dependency, not accessed through a context reference. The only legitimate use I've seen for `AndroidViewModel` in production was accessing the `ConnectivityManager` before we had a proper reactive network-state wrapper — and we replaced it within a month.

```kotlin
// Avoid AndroidViewModel when possible
// Instead of this:
class NetworkViewModel(application: Application) : AndroidViewModel(application) {
    private val connectivityManager =
        application.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
}

// Do this:
@HiltViewModel
class NetworkViewModel @Inject constructor(
    private val networkMonitor: NetworkMonitor // Injected, testable
) : ViewModel() {

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnline
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)
}
```

A clean ViewModel is boring. It receives events, calls use cases, and exposes state. If your ViewModel is exciting — doing clever things with reflection, managing its own threading, building SQL queries — something has gone wrong. The goal is a ViewModel so simple that code review takes thirty seconds.

**Key takeaway:** A ViewModel's only job is to bridge user actions and UI state. It delegates business logic to use cases, never holds Context or View references, never accesses resources directly, and never lives outside an Activity or Fragment lifecycle. If your ViewModel needs more than a constructor and a few functions, you're putting logic in the wrong place.

### Lesson 3.2: Constructor Injection and Dispatchers

The way you construct a ViewModel determines whether it's testable in isolation or permanently welded to the Android framework. I've seen teams write ViewModels that work perfectly in production but are impossible to unit test because they hardcode `Dispatchers.IO` inside `viewModelScope.launch`, create repository instances internally, or rely on static singletons. Constructor injection solves all of this — and dispatcher injection specifically solves a class of flaky test failures that will cost you hours of debugging if you ignore it.

The rule is simple: every dependency a ViewModel needs comes through the constructor. No `getInstance()` calls. No `ServiceLocator.get()`. No lazy initialization of repositories inside the ViewModel body. With Hilt, this is nearly effortless — annotate the ViewModel with `@HiltViewModel`, annotate the constructor with `@Inject`, and let the DI graph handle wiring. The payoff is that in tests, you swap real implementations for fakes with zero reflection magic.

```kotlin
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val getUserProfile: GetUserProfileUseCase,
    private val updateProfile: UpdateProfileUseCase,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>("userId")
        ?: throw IllegalArgumentException("userId required")

    val uiState: StateFlow<ProfileUiState> = getUserProfile(userId)
        .map { ProfileUiState.Loaded(it) }
        .catch { emit(ProfileUiState.Error(it.message ?: "Failed to load profile")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ProfileUiState.Loading)
}
```

Now let's talk about the dispatcher problem. When you write `viewModelScope.launch { repository.fetchData() }`, that launch uses `Dispatchers.Main.immediate` by default — that's what `viewModelScope` is configured with. Inside `fetchData()`, you probably switch to `Dispatchers.IO` with `withContext`. This works fine in production but creates a problem in tests: `Dispatchers.Main` doesn't exist outside the Android runtime. You'll get "Module with the Main dispatcher had failed to initialize" and your test crashes before it starts.

The standard solution is `Dispatchers.setMain()` in test setup. But that only solves half the problem. If your ViewModel hardcodes `Dispatchers.IO` for a `withContext` call, your test now runs real IO dispatching on a background thread, introducing non-determinism and race conditions in tests. The proper fix is injecting dispatchers so tests can replace them with `StandardTestDispatcher` or `UnconfinedTestDispatcher`.

```kotlin
// Define a dispatcher provider interface
interface DispatcherProvider {
    val main: CoroutineDispatcher
    val io: CoroutineDispatcher
    val default: CoroutineDispatcher
}

class DefaultDispatcherProvider @Inject constructor() : DispatcherProvider {
    override val main: CoroutineDispatcher = Dispatchers.Main
    override val io: CoroutineDispatcher = Dispatchers.IO
    override val default: CoroutineDispatcher = Dispatchers.Default
}

// ViewModel uses injected dispatchers
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchRepository: SearchRepository,
    private val dispatchers: DispatcherProvider
) : ViewModel() {

    private val _query = MutableStateFlow("")

    val results: StateFlow<SearchUiState> = _query
        .debounce(300)
        .filter { it.length >= 2 }
        .flatMapLatest { query ->
            flow {
                emit(SearchUiState.Loading)
                val results = withContext(dispatchers.io) {
                    searchRepository.search(query)
                }
                emit(SearchUiState.Success(results))
            }.catch { emit(SearchUiState.Error(it.message ?: "Search failed")) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SearchUiState.Idle)
}
```

In tests, you inject a test dispatcher provider that makes everything synchronous. No flaky tests, no race conditions, no "it passes locally but fails on CI" nightmares.

```kotlin
class TestDispatcherProvider(
    testDispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : DispatcherProvider {
    override val main: CoroutineDispatcher = testDispatcher
    override val io: CoroutineDispatcher = testDispatcher
    override val default: CoroutineDispatcher = testDispatcher
}

class SearchViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private val dispatchers = TestDispatcherProvider(testDispatcher)
    private val fakeRepository = FakeSearchRepository()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `search emits results for valid query`() = runTest {
        val viewModel = SearchViewModel(fakeRepository, dispatchers)
        fakeRepository.setResults(listOf(SearchResult("Kotlin Coroutines")))

        viewModel.results.test {
            assertEquals(SearchUiState.Idle, awaitItem())
            // Trigger search and verify results...
        }
    }
}
```

One mistake I see repeatedly is injecting a `CoroutineScope` instead of dispatchers. The ViewModel already has `viewModelScope` — you don't need another scope. What you need is control over which threads your coroutines run on. Injecting a scope creates confusion about cancellation ownership: does the ViewModel cancel it, or does the caller? With dispatcher injection, `viewModelScope` still owns cancellation (it cancels when `onCleared()` is called), but you control thread assignment.

Another anti-pattern is using `GlobalScope` inside a ViewModel. I once inherited a codebase where a developer used `GlobalScope.launch` to "make sure the API call finishes even if the user navigates away." The intent was reasonable, but the execution was catastrophic. Those coroutines leaked, kept running after the ViewModel was cleared, and occasionally tried to update a StateFlow that nothing was collecting — silently wasting CPU. If you genuinely need work to outlive the ViewModel, that work belongs in a `WorkManager` task or a use case with its own scope, not in `GlobalScope`.

The initial state of your ViewModel also deserves injection. If a ViewModel needs a user ID, a search query, or a filter mode that was passed from the previous screen, that state should come through `SavedStateHandle` — not through a companion object method, not through a static variable, and certainly not through a shared ViewModel that you're accessing from a different lifecycle owner. `SavedStateHandle` is constructor-injected by Hilt and survives process death, making it the canonical way to pass arguments to a ViewModel.

```kotlin
@HiltViewModel
class TransactionListViewModel @Inject constructor(
    private val getTransactions: GetTransactionsUseCase,
    private val dispatchers: DispatcherProvider,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val accountId: String = checkNotNull(savedStateHandle["accountId"]) {
        "accountId is required to display transactions"
    }

    private val _filter = MutableStateFlow(
        savedStateHandle.get<TransactionFilter>("filter") ?: TransactionFilter.ALL
    )

    fun setFilter(filter: TransactionFilter) {
        _filter.value = filter
        // Persist filter choice across process death
        savedStateHandle["filter"] = filter
    }

    val uiState: StateFlow<TransactionUiState> = _filter
        .flatMapLatest { filter ->
            getTransactions(accountId, filter)
        }
        .map { TransactionUiState.Loaded(it) }
        .catch { emit(TransactionUiState.Error(it.message ?: "Failed to load")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TransactionUiState.Loading)
}
```

**Key takeaway:** Every ViewModel dependency — repositories, use cases, dispatchers, initial state — comes through the constructor. Hardcoded `Dispatchers.IO` makes tests flaky. `GlobalScope` makes coroutines leak. Static singletons make isolation impossible. Inject everything, control everything, test everything.

### Lesson 3.3: Managing State with StateFlow

LiveData served Android well for years, but StateFlow is the modern standard — and the difference isn't just "coroutines instead of Lifecycle." StateFlow changes how you think about state because it's a value holder with a conflation guarantee: it always has a current value, it never emits the same value twice in a row, and it integrates naturally with Kotlin's Flow operators for transformation, combination, and filtering. Once you understand StateFlow's semantics, you'll wonder how we ever built complex screens with LiveData's limited operator set.

The starting point is understanding the difference between `MutableStateFlow` and `StateFlow`. `MutableStateFlow` is the internal, writable version — only the ViewModel should hold a reference to it. `StateFlow` is the read-only projection exposed to the UI. This pattern mirrors the old `MutableLiveData` / `LiveData` split, but with one critical difference: `StateFlow` requires an initial value. There's no "uninitialized" state. This forces you to think about what the screen shows before data arrives, which is a design improvement whether you appreciate it in the moment or not.

```kotlin
@HiltViewModel
class FeedViewModel @Inject constructor(
    private val feedRepository: FeedRepository
) : ViewModel() {

    // Internal mutable state
    private val _uiState = MutableStateFlow(FeedUiState())
    // External read-only state
    val uiState: StateFlow<FeedUiState> = _uiState.asStateFlow()

    init {
        loadFeed()
    }

    private fun loadFeed() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val posts = feedRepository.getFeed()
                _uiState.update { it.copy(posts = posts, isLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message, isLoading = false) }
            }
        }
    }

    fun refresh() {
        loadFeed()
    }
}
```

The `update` function on `MutableStateFlow` is atomic — it takes the current value, applies your transformation, and sets the new value in a thread-safe way. This matters when multiple coroutines might modify state concurrently. Without `update`, you'd write `_uiState.value = _uiState.value.copy(...)`, which has a race condition: between reading the value and writing the copy, another coroutine might have changed it. The `update` function eliminates this entire class of bugs.

But the more powerful pattern is deriving `StateFlow` from upstream Flows using `stateIn`. Instead of imperatively setting state in `init` blocks and launch calls, you declare a reactive pipeline that transforms repository data into UI state. This is where StateFlow's integration with the Flow ecosystem shines.

```kotlin
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val analyticsRepository: AnalyticsRepository
) : ViewModel() {

    val uiState: StateFlow<DashboardUiState> = combine(
        userRepository.observeUser(),
        analyticsRepository.observeWeeklyStats()
    ) { user, stats ->
        DashboardUiState(
            userName = user.displayName,
            totalOrders = stats.orderCount,
            revenue = stats.revenue,
            growthPercentage = stats.growthPercent
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = DashboardUiState()
    )
}
```

`SharingStarted.WhileSubscribed(5000)` deserves explanation because I see developers copy-pasting it without understanding the tradeoff. The 5000-millisecond stop timeout means: when the last subscriber disappears (e.g., during a configuration change), keep the upstream Flow active for 5 more seconds before cancelling it. If a new subscriber appears within that window (the Activity recreates after rotation), it gets the cached value instantly without re-triggering the upstream query. If nobody subscribes within 5 seconds, the upstream is cancelled to save resources. This timeout is a sweet spot for configuration changes, which typically complete in under 2 seconds. If you set it to 0, every rotation re-fetches data. If you set it to `Long.MAX_VALUE`, you've essentially created `SharingStarted.Lazily` and the upstream never stops.

The collection side matters just as much as the emission side. In Compose, you use `collectAsStateWithLifecycle()` — not `collectAsState()`. The lifecycle-aware version stops collection when the app goes to the background, which means your upstream Flows also stop (assuming `WhileSubscribed`). This prevents unnecessary network calls, database queries, and sensor reads when the user isn't looking at the screen.

```kotlin
@Composable
fun DashboardScreen(viewModel: DashboardViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    when {
        state.userName.isEmpty() -> LoadingIndicator()
        else -> DashboardContent(
            userName = state.userName,
            totalOrders = state.totalOrders,
            revenue = state.revenue,
            growthPercentage = state.growthPercentage
        )
    }
}
```

A common mistake is creating multiple `MutableStateFlow` instances for different pieces of state and then trying to coordinate them manually. You end up with `_isLoading`, `_data`, `_error`, `_selectedFilter` — four separate flows that need to be combined in the UI, and the ViewModel has no single source of truth. This works for simple screens but falls apart the moment state interactions become complex. Did you set `_isLoading = false` before or after setting `_data`? If after, the UI briefly shows loading with stale data.

The better approach depends on your screen complexity. For screens with one primary data source, a single `MutableStateFlow<UiState>` with `copy` works well. For screens combining multiple independent data streams — say, a user profile with separate sections for posts, followers, and badges, each loading independently — `combine` multiple repository Flows into a single `StateFlow`. The key insight is that your state representation should match your data dependencies: if two pieces of data load independently, they should flow independently and merge at the ViewModel level.

Race conditions in state updates are real. I once debugged a checkout flow where two concurrent API calls (validate coupon and fetch shipping options) both tried to update the same `MutableStateFlow`. Without `update`, one overwrote the other's changes. With `update`, the atomic read-modify-write ensured both mutations applied. For more complex scenarios — say, a paginated list where scroll events and pull-to-refresh can overlap — you might need a `Mutex` to serialize state transitions.

```kotlin
@HiltViewModel
class PaginatedListViewModel @Inject constructor(
    private val repository: ItemRepository
) : ViewModel() {

    private val mutex = Mutex()
    private val _uiState = MutableStateFlow(PaginatedUiState())
    val uiState: StateFlow<PaginatedUiState> = _uiState.asStateFlow()

    fun loadNextPage() {
        viewModelScope.launch {
            mutex.withLock {
                if (_uiState.value.isLoadingMore || !_uiState.value.hasMore) return@launch
                _uiState.update { it.copy(isLoadingMore = true) }
            }
            try {
                val nextPage = repository.getPage(_uiState.value.currentPage + 1)
                mutex.withLock {
                    _uiState.update {
                        it.copy(
                            items = it.items + nextPage.items,
                            currentPage = it.currentPage + 1,
                            hasMore = nextPage.hasMore,
                            isLoadingMore = false
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoadingMore = false, error = e.message) }
            }
        }
    }
}
```

**Key takeaway:** StateFlow replaces LiveData as the standard for UI state in modern Android. Use `update` for thread-safe mutations, `stateIn` with `WhileSubscribed(5000)` for reactive pipelines, `combine` for merging independent data sources, and `collectAsStateWithLifecycle` on the Compose side. When concurrent mutations are possible, use `Mutex` to serialize critical sections.

### Lesson 3.4: UI State Design — Data Class vs Sealed Interface

This is the decision that shapes every screen you build, and getting it wrong means either fighting your state representation for the life of the feature or refactoring under pressure when edge cases start appearing in production. The question is simple: should your screen's UI state be a single data class with all possible fields, or a sealed interface with distinct subtypes for each screen state? The answer depends on whether your states are independent or mutually exclusive — and most developers get this wrong because they default to one approach for every screen.

A data class works when your screen has multiple independent pieces of state that can be combined freely. Think of a profile screen: the user's name is always shown, the avatar might still be loading, and an error banner might appear at the top without hiding the profile content. These states coexist — the screen isn't in "one state at a time," it's showing multiple states simultaneously. A data class captures this naturally.

```kotlin
// Good use of data class: independent, combinable fields
data class ProfileUiState(
    val userName: String = "",
    val avatarUrl: String? = null,
    val isAvatarLoading: Boolean = false,
    val posts: List<PostUiModel> = emptyList(),
    val isPostsLoading: Boolean = true,
    val followerCount: Int = 0,
    val errorBanner: String? = null,
    val isRefreshing: Boolean = false
)
```

A sealed interface works when your screen has mutually exclusive states — it can only be in one state at a time, and the data available in each state is completely different. A payment processing screen is either showing a form, processing a transaction, displaying a success confirmation, or showing an error. You can't be "processing" and "successful" simultaneously. Trying to represent this with a data class leads to illegal state combinations.

```kotlin
// Good use of sealed interface: mutually exclusive states
sealed interface PaymentUiState {
    data object Loading : PaymentUiState
    data class Form(
        val amount: String,
        val cardLast4: String,
        val isValid: Boolean
    ) : PaymentUiState
    data object Processing : PaymentUiState
    data class Success(val transactionId: String, val amount: String) : PaymentUiState
    data class Error(val message: String, val canRetry: Boolean) : PaymentUiState
}
```

The advantage of the sealed interface is that the compiler enforces exhaustiveness. When you write a `when` expression over `PaymentUiState`, the compiler forces you to handle every case. Add a new state six months later? Every `when` block that consumes this type will produce a compilation error until you handle it. With a data class, you silently ignore new fields, and bugs hide until a user hits the unhandled combination in production.

Here's where it gets interesting: many screens need both. You have mutually exclusive top-level states but also need combinable sub-state within one of those states. The pattern is a sealed interface at the top level with data classes as the success variant.

```kotlin
sealed interface CheckoutUiState {
    data object Loading : CheckoutUiState
    data class Loaded(
        val items: List<CartItemUiModel>,
        val subtotal: String,
        val tax: String,
        val total: String,
        val selectedPayment: PaymentMethod?,
        val isPlacingOrder: Boolean = false,
        val couponCode: String? = null,
        val couponDiscount: String? = null
    ) : CheckoutUiState
    data class Error(val message: String) : CheckoutUiState
}
```

The `Loaded` state is a data class with multiple independent fields — `isPlacingOrder` can be true while the items are displayed, and a `couponCode` can be applied without changing anything else. But `Loading`, `Loaded`, and `Error` are mutually exclusive at the top level. This hybrid approach gives you the best of both worlds.

The biggest anti-pattern I see is a data class with boolean flags that simulate a sealed interface. You get `isLoading`, `isError`, `isSuccess` — three booleans that should never all be true simultaneously, but nothing prevents it. Then someone sets `isLoading = true` but forgets to set `isError = false` from the previous failure, and the screen shows a loading spinner on top of an error message. I've seen this exact bug in three different production apps.

```kotlin
// ANTI-PATTERN: Booleans simulating mutually exclusive states
data class PaymentUiState(
    val isLoading: Boolean = false,
    val isProcessing: Boolean = false,
    val isSuccess: Boolean = false,
    val isError: Boolean = false,
    val errorMessage: String? = null,
    val transactionId: String? = null,
    val amount: String = ""
)

// What happens when isLoading = true AND isError = true?
// What about isSuccess = true AND isProcessing = true?
// The data class allows 16 boolean combinations. Only 4 are valid.
```

Another mistake is over-engineering the sealed interface. I've seen developers create 12 subtypes for a screen that really just has "loading," "content," and "error." Each subtype carried one additional field compared to the previous one, creating a hierarchy that was harder to understand than a flat data class would have been. If most of your states share 80% of the same fields, a data class with an `isLoading` flag is simpler and more maintainable than a sealed hierarchy with duplicated fields across subtypes.

The decision framework I use in production is straightforward. First, list every visual state your screen can be in. If they're mutually exclusive with different data requirements, use a sealed interface. If they overlap and combine freely, use a data class. If you have both — mutually exclusive top-level states with combinable fields in the "content" state — use the hybrid: sealed interface at the top, data class for the content subtype. This covers roughly 95% of real-world screens. The remaining 5% are screens complex enough that you should reconsider whether they should be one screen at all.

One production scenario drove this lesson home for me. We had a messaging screen that started as a data class: `messages`, `isLoading`, `error`, `isTyping`, `draftMessage`. Over six months, it accumulated `isSearching`, `searchResults`, `searchQuery`, `selectedMessages`, `isMultiSelectMode`, `replyingTo`, `forwardingTo`. The data class had 15 fields and dozens of invalid combinations. We refactored it into a sealed interface with `Loading`, `Conversation`, and `Search` as top-level states. The `Conversation` subtype was a data class with its own fields. The refactoring took two days, but it eliminated an entire category of bugs where search state leaked into conversation state and vice versa.

**Key takeaway:** Use a sealed interface when screen states are mutually exclusive (Loading/Success/Error). Use a data class when state fields are independent and combinable. Use the hybrid approach (sealed interface with data class subtypes) for complex screens. Never simulate mutually exclusive states with boolean flags — the compiler can't protect you from invalid combinations that a sealed interface prevents at compile time.

### Lesson 3.5: One-Time Events — The Right Way

One-time events are the most debated topic in Android architecture, and for good reason — they expose a fundamental tension between state-driven UI and imperative actions. A snackbar should show once, not re-show every time the screen recomposes. Navigation should happen once, not repeat after rotation. A toast confirming deletion should fire once, not haunt the user on every configuration change. Getting this wrong leads to some of the most confusing bugs in Android development, where users report "the app keeps showing the same error message" or "it navigated me to the same screen twice."

The naive approach is putting a boolean flag in your UI state data class: `showError = true`. The UI observes this, shows the snackbar, and then... needs to reset it. So the UI calls `viewModel.errorShown()`, which sets `showError = false`. This creates a round-trip: state flows from ViewModel to UI, then the UI sends an event back to ViewModel to clear state. It works until it doesn't — configuration changes can cause the state to be re-emitted before the reset call arrives, showing the error twice. And now your UI is telling the ViewModel about its own state, which inverts the data flow MVVM was designed to enforce.

```kotlin
// ANTI-PATTERN: Boolean flag for one-time events
data class FormUiState(
    val isSubmitting: Boolean = false,
    val showSuccessMessage: Boolean = false, // Who resets this?
    val showError: Boolean = false,          // Race condition waiting to happen
    val errorMessage: String? = null
)

// UI has to call back to ViewModel to clear the flag
// viewModel.onSuccessMessageShown() -> sets showSuccessMessage = false
// But what if recomposition happens before the call?
```

The `SingleLiveEvent` pattern from the Architecture Components samples was an attempt to solve this with LiveData, but it had its own problems: it only supported one observer, broke with multiple observers (which happens with shared ViewModels), and was removed from the official samples because Google recognized it as a flawed pattern. The Kotlin-first replacement is `Channel` with `receiveAsFlow()`.

A `Channel` is a coroutine communication primitive that sends values from one coroutine to another. When you send an event to a `Channel`, it's buffered until a receiver consumes it. `receiveAsFlow()` converts the channel into a Flow, and each event is consumed exactly once — even if the collector restarts after configuration change, the event was already consumed by the previous collector. This is the semantics you want for one-time events.

```kotlin
@HiltViewModel
class RegistrationViewModel @Inject constructor(
    private val registerUser: RegisterUserUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegistrationUiState())
    val uiState: StateFlow<RegistrationUiState> = _uiState.asStateFlow()

    // Channel for one-time events
    private val _events = Channel<RegistrationEvent>(Channel.BUFFERED)
    val events: Flow<RegistrationEvent> = _events.receiveAsFlow()

    fun onRegisterClicked(email: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isRegistering = true) }
            registerUser(email, password)
                .onSuccess { user ->
                    _uiState.update { it.copy(isRegistering = false) }
                    _events.send(RegistrationEvent.NavigateToHome(user.id))
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isRegistering = false) }
                    _events.send(RegistrationEvent.ShowError(error.message ?: "Registration failed"))
                }
        }
    }
}

sealed interface RegistrationEvent {
    data class NavigateToHome(val userId: String) : RegistrationEvent
    data class ShowError(val message: String) : RegistrationEvent
}
```

On the UI side, you collect events in a `LaunchedEffect` that's tied to the ViewModel's lifecycle, not the composable's recomposition. This ensures events are consumed once and only once.

```kotlin
@Composable
fun RegistrationScreen(
    viewModel: RegistrationViewModel = hiltViewModel(),
    onNavigateToHome: (String) -> Unit
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is RegistrationEvent.NavigateToHome -> onNavigateToHome(event.userId)
                is RegistrationEvent.ShowError -> snackbarHostState.showSnackbar(event.message)
            }
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        RegistrationContent(
            state = state,
            onRegisterClicked = viewModel::onRegisterClicked,
            modifier = Modifier.padding(padding)
        )
    }
}
```

There's a nuance with `Channel.BUFFERED` that matters in practice. A buffered channel has a default capacity of 64 elements. If the UI isn't collecting (e.g., the app is in the background), events accumulate in the buffer. When the UI resumes, all buffered events are delivered. For navigation events, this is usually fine — the user navigated away and comes back, the pending navigation fires. For snackbars, you might get a rapid sequence of error messages. If this is a concern, you can use `Channel(Channel.CONFLATED)` which only keeps the latest event, or handle deduplication in the UI.

Google's official guidance has evolved on this topic. The current recommendation from the Android team is to model most "events" as state transitions. Instead of a "navigate" event, set a `navigatedToConfirmation = true` state, and have the UI navigate when it observes this state, then call back to clear it. This is the state-as-events approach, and it works for cases where process death recovery matters — if the app is killed and restored, the state still says "navigated," so the UI knows where it should be. But for fire-and-forget events like snackbars, the Channel approach is more pragmatic and avoids the reset ceremony.

```kotlin
// Hybrid approach: state for recoverable navigation, channel for fire-and-forget
@HiltViewModel
class OrderViewModel @Inject constructor(
    private val placeOrder: PlaceOrderUseCase,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _uiState = MutableStateFlow(OrderUiState())
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()

    // Fire-and-forget events (snackbar, toast)
    private val _effects = Channel<OrderEffect>(Channel.BUFFERED)
    val effects: Flow<OrderEffect> = _effects.receiveAsFlow()

    fun submitOrder() {
        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true) }
            placeOrder(uiState.value.toOrderRequest())
                .onSuccess { orderId ->
                    // Navigation stored as state (survives process death)
                    _uiState.update {
                        it.copy(isProcessing = false, completedOrderId = orderId)
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isProcessing = false) }
                    // Error is a one-time effect (doesn't need to survive process death)
                    _effects.send(OrderEffect.ShowError(error.message ?: "Order failed"))
                }
        }
    }
}
```

I've found the hybrid approach to be the most practical in production. Navigation destinations that the user should return to after process death belong in state (and in `SavedStateHandle`). Transient UI effects — snackbars, toasts, haptic feedback triggers — belong in a Channel. The dividing line is: would the user be confused if this event didn't replay after a process kill? If yes, it's state. If no, it's an effect.

**Key takeaway:** Use `Channel` with `receiveAsFlow()` for one-time events like snackbars and toasts. Use state transitions for navigation that must survive process death. Never use boolean flags that require manual reset — they create race conditions and invert the data flow. The hybrid approach (state for recoverable actions, Channel for fire-and-forget effects) covers real-world needs without overcomplicating the architecture.

### Lesson 3.6: Avoiding ViewModel Anti-Patterns

Every anti-pattern I'm about to describe came from a production codebase. Not from a theoretical exercise, not from a contrived example — from real code written by competent developers under deadline pressure. Anti-patterns in ViewModels are particularly dangerous because they don't crash the app immediately. They create subtle bugs that manifest as memory leaks, state inconsistencies, flaky tests, and screens that "sometimes work." By the time you notice the problem, the pattern is entrenched across dozens of ViewModels.

**Anti-pattern #1: The God ViewModel.** This is the most common sin. A ViewModel that handles authentication, navigation, analytics, feature flags, user preferences, and the actual screen state — all in one class. I've seen ViewModels with 40+ functions and 15+ StateFlow properties. The fix is decomposition: extract use cases for business logic, extract state holders for complex state management, and keep the ViewModel as a thin coordinator.

```kotlin
// GOD VIEWMODEL: Does everything, tests nothing
class HomeViewModel(
    private val userApi: UserApi,
    private val postApi: PostApi,
    private val analyticsTracker: AnalyticsTracker,
    private val featureFlagService: FeatureFlagService,
    private val notificationManager: NotificationManager,
    private val locationProvider: LocationProvider,
    private val cacheManager: CacheManager,
    private val deepLinkHandler: DeepLinkHandler
) : ViewModel() {
    // 800 lines of interleaved concerns
    // Impossible to test any single behavior in isolation
}

// DECOMPOSED: ViewModel coordinates, doesn't implement
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val getHomeFeed: GetHomeFeedUseCase,
    private val trackScreenView: TrackScreenViewUseCase,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    val uiState: StateFlow<HomeUiState> = getHomeFeed()
        .map { HomeUiState.Loaded(it) }
        .catch { emit(HomeUiState.Error(it.message ?: "Failed to load")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HomeUiState.Loading)

    init {
        viewModelScope.launch { trackScreenView("home") }
    }
}
```

**Anti-pattern #2: Holding Context references.** I keep repeating this because I keep seeing it. A ViewModel that holds a reference to `Context`, `Activity`, `Fragment`, or any `View` is a memory leak. The ViewModel outlives the Activity during configuration changes. The old Activity is destroyed, but the ViewModel holds a reference to it, preventing garbage collection. On a low-memory device, this can cascade — multiple leaked Activities, each holding their entire view hierarchy.

```kotlin
// MEMORY LEAK: ViewModel holds Activity reference
class LeakyViewModel(private val activity: Activity) : ViewModel() {
    fun showToast(message: String) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        // activity is leaked across configuration changes
    }
}

// FIX: Send events to the UI layer, which has Context
@HiltViewModel
class SafeViewModel @Inject constructor() : ViewModel() {
    private val _effects = Channel<UiEffect>(Channel.BUFFERED)
    val effects: Flow<UiEffect> = _effects.receiveAsFlow()

    fun onActionCompleted() {
        viewModelScope.launch {
            _effects.send(UiEffect.ShowToast(R.string.action_completed))
        }
    }
}

sealed interface UiEffect {
    data class ShowToast(@StringRes val messageResId: Int) : UiEffect
}
```

**Anti-pattern #3: Business logic in the ViewModel.** If your ViewModel contains validation rules, price calculation formulas, or data transformation algorithms, those belong in use cases or domain-layer utilities. The problem isn't just organization — it's testability. Testing a price calculation shouldn't require instantiating a ViewModel, setting up `Dispatchers.setMain()`, and dealing with `viewModelScope`. A pure function in a use case takes inputs and returns outputs. No coroutines, no lifecycle, no framework dependencies.

**Anti-pattern #4: Launching coroutines without structure.** Every `viewModelScope.launch` creates a new coroutine. If the user taps a button rapidly, you get multiple concurrent executions of the same operation. For idempotent reads, this wastes resources. For writes like "place order," it creates duplicate orders. The fix is tracking the active job and cancelling previous launches, or disabling the trigger in the UI while processing.

```kotlin
// ANTI-PATTERN: Uncontrolled concurrent launches
class UnsafeViewModel : ViewModel() {
    fun placeOrder() {
        viewModelScope.launch {
            // User double-taps, two orders are placed
            repository.placeOrder(currentState.items)
        }
    }
}

// FIX: Track and control coroutine execution
@HiltViewModel
class SafeOrderViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private var orderJob: Job? = null

    fun placeOrder() {
        if (orderJob?.isActive == true) return // Already processing

        orderJob = viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true) }
            try {
                val orderId = orderRepository.placeOrder(uiState.value.items)
                _events.send(OrderEvent.NavigateToConfirmation(orderId))
            } catch (e: Exception) {
                _events.send(OrderEvent.ShowError(e.message ?: "Order failed"))
            } finally {
                _uiState.update { it.copy(isProcessing = false) }
            }
        }
    }
}
```

**Anti-pattern #5: Observing Flows without lifecycle awareness.** In the Fragment/Activity world, collecting a Flow in `onCreate` without tying it to the lifecycle means it keeps collecting when the app is backgrounded. This wastes battery, triggers unnecessary recompositions, and can crash if you try to update UI while the Fragment's view is destroyed. Always use `repeatOnLifecycle` in Fragments or `collectAsStateWithLifecycle` in Compose.

```kotlin
// ANTI-PATTERN: Collecting without lifecycle awareness in Fragment
class ProfileFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        // BAD: Keeps collecting when app is in background
        lifecycleScope.launch {
            viewModel.uiState.collect { state -> updateUi(state) }
        }

        // GOOD: Stops collecting when lifecycle drops below STARTED
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state -> updateUi(state) }
            }
        }
    }
}
```

**Anti-pattern #6: Using ViewModel in the wrong components.** ViewModels are designed for Activities and Fragments — components that implement `ViewModelStoreOwner`. Using them in Services, BroadcastReceivers, or ContentProviders doesn't work correctly because these components have different lifecycles. A Service can outlive all Activities, and a BroadcastReceiver exists only for the duration of `onReceive()`. If you need shared business logic across these components, use a repository or use case scoped to the application, not a ViewModel scoped to a non-existent `ViewModelStoreOwner`.

**Anti-pattern #7: Exposing MutableStateFlow to the UI.** This seems minor, but it breaks encapsulation. If the UI can directly set `viewModel.mutableState.value = newState`, the ViewModel loses control over state transitions. Invariants can be violated, and you can't add logging, validation, or analytics to state changes because they bypass the ViewModel's functions. Always expose `StateFlow` (read-only) and provide functions for state modifications.

The meta-lesson across all these anti-patterns is that a ViewModel should be a passive coordinator with minimal logic. It receives actions, delegates to use cases, and exposes state. When it starts doing more — holding references, implementing business rules, managing its own threading, reaching into Android framework classes — it's accumulating responsibilities that make it fragile, untestable, and increasingly difficult to change.

**Key takeaway:** The most dangerous ViewModel anti-patterns don't crash your app — they silently degrade quality. Never hold Context references. Never put business logic in ViewModels. Control concurrent coroutine launches. Always collect with lifecycle awareness. Keep ViewModels inside Activities and Fragments. Every violation creates a bug you won't find until production.

### Lesson 3.7: SavedStateHandle and Process Death

Process death is the most underrated source of bugs in Android development. Most developers test their apps by rotating the screen (configuration change) and calling it a day. But process death is a different beast entirely: the system kills your app's process while it's in the background, destroys every in-memory object including all ViewModels, and when the user returns, Android recreates the Activity from scratch using only the data you explicitly saved. If you didn't save it, it's gone. The user's form input, the selected tab, the scroll position, the search query — all lost.

`SavedStateHandle` is the ViewModel's bridge to the saved state mechanism. It's a key-value map that's automatically persisted across process death and restored when the ViewModel is recreated. Under the hood, it uses the same `Bundle` mechanism as `onSaveInstanceState()`, but it's accessible directly in the ViewModel's constructor — no Fragment arguments, no Activity intent extras, no manual save/restore ceremony.

```kotlin
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchRepository: SearchRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    // Survives both configuration changes and process death
    private val searchQuery = savedStateHandle.getStateFlow("query", "")

    val uiState: StateFlow<SearchUiState> = searchQuery
        .debounce(300)
        .flatMapLatest { query ->
            if (query.isBlank()) {
                flowOf(SearchUiState.Idle)
            } else {
                flow {
                    emit(SearchUiState.Loading)
                    val results = searchRepository.search(query)
                    emit(SearchUiState.Results(results, query))
                }.catch { emit(SearchUiState.Error(it.message ?: "Search failed")) }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SearchUiState.Idle)

    fun onQueryChanged(query: String) {
        savedStateHandle["query"] = query // Persisted automatically
    }
}
```

The `getStateFlow` method on `SavedStateHandle` is particularly powerful — it returns a `StateFlow` that's backed by the saved state, so changes are both reactive and persistent. When you write `savedStateHandle["query"] = newValue`, the `StateFlow` emits the new value to all collectors, and the value is marked for persistence. If the process dies and recreates, the `getStateFlow` call returns a flow initialized with the last saved value instead of the default.

Not everything should go into `SavedStateHandle`. The `Bundle` mechanism has a size limit (roughly 500KB for the entire transaction, shared across all Fragments and Activities in the task). Large objects — lists of hundreds of items, bitmap data, complex nested structures — will cause `TransactionTooLargeException` and crash the app. The rule is: save identifiers and small state, re-fetch large data.

```kotlin
@HiltViewModel
class ArticleListViewModel @Inject constructor(
    private val articleRepository: ArticleRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    // SAVE: Small state that affects what data to load
    private val selectedCategory = savedStateHandle.getStateFlow("category", Category.ALL)
    private val sortOrder = savedStateHandle.getStateFlow("sort", SortOrder.NEWEST)

    // DO NOT SAVE: Large data that can be re-fetched
    // The articles list is derived from the saved category and sort order
    val uiState: StateFlow<ArticleListUiState> = combine(
        selectedCategory,
        sortOrder
    ) { category, sort ->
        Pair(category, sort)
    }.flatMapLatest { (category, sort) ->
        articleRepository.observeArticles(category, sort)
            .map { articles -> ArticleListUiState.Loaded(articles, category, sort) }
            .onStart { emit(ArticleListUiState.Loading) }
            .catch { emit(ArticleListUiState.Error(it.message ?: "Failed")) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ArticleListUiState.Loading)

    fun selectCategory(category: Category) {
        savedStateHandle["category"] = category
    }

    fun setSortOrder(order: SortOrder) {
        savedStateHandle["sort"] = order
    }
}
```

Testing process death behavior requires specific tooling. You can't simulate process death by pressing the back button or force-stopping the app from settings — both destroy the Activity's saved state. The correct way to test is: put the app in the background, then kill the process using `adb shell am kill <package>`, then switch back to the app. Android will recreate the Activity using saved state. You can also enable "Don't keep activities" in Developer Options, which destroys Activities immediately when they leave the foreground — this simulates process death for every navigation event and is the single best testing tool for catching saved state bugs.

A common production bug is forgetting that `SavedStateHandle` arguments come from Navigation component's arguments, Fragment arguments, or Activity intent extras. When you navigate to `ProfileFragment` with `userId = "123"` via Navigation, that argument is available in `SavedStateHandle` automatically. But if you navigate without the argument, `savedStateHandle.get<String>("userId")` returns null and your ViewModel crashes if you're using `checkNotNull`. Always validate early and fail with clear messages.

```kotlin
@HiltViewModel
class EditProfileViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val userId: String = checkNotNull(savedStateHandle["userId"]) {
        "EditProfileViewModel requires userId argument. " +
        "Ensure navigation action includes userId in arguments."
    }

    // User edits are saved to handle for process death
    private val editedName = savedStateHandle.getStateFlow("editedName", "")
    private val editedBio = savedStateHandle.getStateFlow("editedBio", "")

    // Original profile for comparison (re-fetched, not saved)
    private val originalProfile = userRepository.observeUser(userId)
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val uiState: StateFlow<EditProfileUiState> = combine(
        originalProfile,
        editedName,
        editedBio
    ) { profile, name, bio ->
        if (profile == null) {
            EditProfileUiState.Loading
        } else {
            EditProfileUiState.Editing(
                originalName = profile.name,
                originalBio = profile.bio,
                editedName = name.ifEmpty { profile.name },
                editedBio = bio.ifEmpty { profile.bio },
                hasChanges = name.isNotEmpty() || bio.isNotEmpty()
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), EditProfileUiState.Loading)

    fun onNameChanged(name: String) {
        savedStateHandle["editedName"] = name
    }

    fun onBioChanged(bio: String) {
        savedStateHandle["editedBio"] = bio
    }
}
```

The edit profile example illustrates the correct separation: user input (the edited name and bio) is saved via `SavedStateHandle` because losing a user's edits after process death is a terrible experience. The original profile data is re-fetched from the repository because it's large, it might have changed, and saving it would waste Bundle space.

One gotcha with `SavedStateHandle` is that only certain types are supported by the `Bundle` mechanism. Primitive types, strings, `Parcelable`, and `Serializable` work. Custom objects need to implement `Parcelable` (prefer `@Parcelize` from the Kotlin Android extensions). If you try to save an object that isn't `Bundle`-compatible, you'll get a runtime exception — not a compile-time error. For enum values, they work because enums are `Serializable` by default in Kotlin. For sealed classes, you need `@Parcelize` on each subtype.

```kotlin
// Enums work automatically with SavedStateHandle
enum class SortOrder { NEWEST, OLDEST, POPULAR }

// For sealed types, use @Parcelize
@Parcelize
sealed interface PaymentMethod : Parcelable {
    @Parcelize data object CreditCard : PaymentMethod
    @Parcelize data object PayPal : PaymentMethod
    @Parcelize data class BankTransfer(val bankId: String) : PaymentMethod
}

// Now safe to use with SavedStateHandle
savedStateHandle["payment"] = PaymentMethod.CreditCard
val payment: PaymentMethod? = savedStateHandle["payment"]
```

The mental model I use is: if the user would be confused or annoyed when state is lost, save it. Tab selections, form inputs, filter choices, scroll positions — save these. API responses, computed lists, cached images — re-fetch these. And test with `adb shell am kill` regularly. I add process death testing to our QA checklist for every feature. It catches bugs that no amount of rotation testing will find, because rotation preserves ViewModels while process death destroys them.

**Key takeaway:** `SavedStateHandle` bridges ViewModels and Android's saved state mechanism. Use `getStateFlow` for reactive, persistent state. Save small user inputs and navigation state; re-fetch large data. Test with `adb shell am kill`, not just rotation. Remember the Bundle size limit — store identifiers and user choices, not entire API responses. Process death is not an edge case; it's a normal part of the Android lifecycle that happens whenever the system needs memory.

### Quiz: MVVM Pattern

#### What should a ViewModel NEVER reference directly?

- ❌ StateFlow or MutableStateFlow
- ❌ Repository interfaces
- ✅ Activity, Context, or View
- ❌ Coroutine scopes

> **Explanation:** The ViewModel must never reference Activity, Context, or View directly because these are lifecycle-bound Android components. Holding references to them causes memory leaks and violates separation of concerns.

#### When should you use a sealed interface for UI state instead of a single data class?

- ❌ When the screen has only one loading state
- ✅ When the screen has distinct, mutually exclusive states (Loading, Success, Error)
- ❌ When you need to track multiple independent fields
- ❌ When the ViewModel uses viewModelScope

> **Explanation:** A sealed interface is ideal when the screen can only be in one state at a time — Loading, Success, or Error. A single data class is better when multiple fields can be independently loaded (e.g., loading indicator shown alongside partial data).

#### How should one-time events like navigation or snackbars be handled in MVVM?

- ❌ Using a Boolean flag in the UI state data class
- ❌ Using LiveData with setValue
- ✅ Using a Channel with receiveAsFlow
- ❌ Calling the Activity directly from ViewModel

> **Explanation:** Channel-based events ensure the event is consumed exactly once, even across configuration changes. Boolean flags in state cause issues because someone must reset them, leading to bugs where events fire multiple times.

### Coding Challenge: Build a ViewModel with State and Events

Create a `CheckoutViewModel` that manages checkout state (cart items, total, payment method) as `StateFlow`, processes user actions through a single `onEvent` function, and handles one-time events (navigation, error snackbar) via `Channel`. Include SavedStateHandle for the selected payment method.

#### Solution

```kotlin
data class CheckoutUiState(
    val items: List<CartItem> = emptyList(),
    val subtotal: Long = 0,
    val shipping: Long = 0,
    val total: Long = 0,
    val selectedPayment: PaymentMethod? = null,
    val isProcessing: Boolean = false
)

sealed interface CheckoutUserAction {
    data class SelectPayment(val method: PaymentMethod) : CheckoutUserAction
    data class UpdateQuantity(val itemId: String, val quantity: Int) : CheckoutUserAction
    data object PlaceOrder : CheckoutUserAction
    data class RemoveItem(val itemId: String) : CheckoutUserAction
}

sealed interface CheckoutEvent {
    data class NavigateToConfirmation(val orderId: String) : CheckoutEvent
    data class ShowError(val message: String) : CheckoutEvent
}

@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val orderRepository: OrderRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val selectedPayment = savedStateHandle.getStateFlow<PaymentMethod?>("payment", null)

    val uiState: StateFlow<CheckoutUiState> = combine(
        cartRepository.observeCart(),
        selectedPayment
    ) { cart, payment ->
        CheckoutUiState(
            items = cart.items,
            subtotal = cart.subtotal,
            shipping = cart.shipping,
            total = cart.subtotal + cart.shipping,
            selectedPayment = payment
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), CheckoutUiState())

    private val _events = Channel<CheckoutEvent>(Channel.BUFFERED)
    val events: Flow<CheckoutEvent> = _events.receiveAsFlow()

    fun onEvent(action: CheckoutUserAction) {
        when (action) {
            is CheckoutUserAction.SelectPayment -> {
                savedStateHandle["payment"] = action.method
            }
            is CheckoutUserAction.UpdateQuantity -> {
                viewModelScope.launch {
                    cartRepository.updateQuantity(action.itemId, action.quantity)
                }
            }
            is CheckoutUserAction.RemoveItem -> {
                viewModelScope.launch {
                    cartRepository.removeItem(action.itemId)
                }
            }
            is CheckoutUserAction.PlaceOrder -> placeOrder()
        }
    }

    private fun placeOrder() {
        val payment = selectedPayment.value ?: run {
            viewModelScope.launch {
                _events.send(CheckoutEvent.ShowError("Select a payment method"))
            }
            return
        }
        viewModelScope.launch {
            try {
                val orderId = orderRepository.placeOrder(uiState.value.items, payment)
                _events.send(CheckoutEvent.NavigateToConfirmation(orderId))
            } catch (e: Exception) {
                _events.send(CheckoutEvent.ShowError(e.message ?: "Order failed"))
            }
        }
    }
}
```

The ViewModel uses `combine` to merge cart data with saved payment selection, `SavedStateHandle` for process death survival, `Channel` for one-time events, and a single `onEvent` function that routes all user actions.

---

## Module 4: Repository Pattern and Data Layer

The Repository is the gatekeeper between your app's business logic and its data sources. It coordinates between network APIs, local databases, and in-memory caches. A well-designed Repository gives the rest of the app a clean, unified API for data access — the ViewModel doesn't need to know whether data came from Retrofit, Room, or a memory cache.

### Lesson 4.1: Single Source of Truth

Every Android app that works with remote data faces the same fundamental question: which copy of the data is the "real" one? The network response you just received? The database row from five minutes ago? The in-memory object the ViewModel is holding? When you have multiple copies floating around, they inevitably drift apart. The user sees one thing on the list screen, taps into the detail screen, and sees something different. Or worse — a background sync updates the database, but the ViewModel is still holding stale data from its initial network call. The Single Source of Truth (SSOT) principle eliminates this class of bugs entirely by declaring that one data source is authoritative, and everything else reads from it.

In Android architecture, the database is the single source of truth — not the network. This might feel counterintuitive because the server obviously has the "latest" data. But here's the thing: the network is unreliable. It can fail, time out, return partial responses, or simply be unavailable when the user is on the subway. The database, on the other hand, is always available, always fast, and always consistent within the app. So the pattern is: network responses write to the database, and the UI observes the database. The network is a data source that refreshes the SSOT — it's never observed directly by the UI.

The practical implementation of SSOT centers around Room's `Flow` support. When your DAO returns `Flow<List<Message>>`, Room automatically re-emits whenever the underlying table changes. This means your UI reacts to database changes regardless of what caused them — a network refresh, a local user action, a background sync, or even a different screen updating the same entity. You get reactive updates for free without building any custom observation mechanism. The ViewModel collects the Flow, maps it to UI state, and the screen renders. There's exactly one data pipeline, and it always goes through the database.

Without SSOT, teams build fragile synchronization logic. I've seen codebases where the ViewModel fetches data from the network, stores it in a `MutableStateFlow`, and simultaneously writes it to Room — but then a different screen reads from Room and gets a different version because the first screen's write hasn't committed yet. Or the ViewModel caches data in a `HashMap`, the database has a slightly different version, and the network just returned a third version. Debugging these inconsistencies is a nightmare because the bug isn't in any single component — it's in the interaction between three sources that should have been one.

The SSOT pattern also simplifies your Repository API dramatically. Instead of methods like `getMessagesFromNetwork()`, `getMessagesFromCache()`, and `getMessagesFromDatabase()`, you have exactly two methods: `observeMessages()` which returns a `Flow` from the database, and `refreshMessages()` which fetches from the network and writes to the database. The caller doesn't choose the data source — the Repository always returns database data and handles refresh internally.

One subtlety teams miss is that SSOT doesn't mean "always show database data even if it's ancient." It means the database is the pipeline, not that you skip network calls. The typical flow is: the UI subscribes to the database Flow, the Repository checks if a refresh is needed (based on staleness, user action, or lifecycle), fetches from the network, writes the response to Room, and Room's Flow automatically pushes the update to the UI. The refresh is transparent to the ViewModel — it just sees new data appearing in the Flow.

SSOT also enables something powerful: offline writes. When the user creates a message while offline, you insert it into the database with a `PENDING` status. The UI immediately shows it because it's observing the database. When connectivity returns, a background worker sends it to the server, receives the server ID, and updates the database row. The UI updates again automatically. The user never waits for a network round-trip to see their own action reflected in the UI. This is the foundation of offline-first architecture, which we'll explore in the next lesson.

```kotlin
// ❌ Without SSOT — ViewModel observes network directly
class ChatViewModel(private val api: ChatApi) : ViewModel() {
    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    fun loadMessages(chatId: String) {
        viewModelScope.launch {
            try {
                _messages.value = api.getMessages(chatId) // stale if network fails
            } catch (e: Exception) {
                // No cached data to fall back on — user sees nothing
                _messages.value = emptyList()
            }
        }
    }
}
```

```kotlin
// ✅ With SSOT — ViewModel observes database, Repository handles refresh
class ChatViewModel(
    private val repository: ChatRepository
) : ViewModel() {
    
    val messages: StateFlow<List<Message>> = repository
        .observeMessages(chatId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            repository.refreshIfNeeded(chatId) // updates database, Flow emits automatically
        }
    }
}
```

```kotlin
// The Repository that enforces SSOT
class ChatRepository(
    private val api: ChatApi,
    private val messageDao: MessageDao
) {
    // SSOT: always read from database
    fun observeMessages(chatId: String): Flow<List<Message>> =
        messageDao.observeMessages(chatId)
            .map { entities -> entities.map { it.toDomain() } }

    // Network writes TO the database — never returned to the caller directly
    suspend fun refreshIfNeeded(chatId: String) {
        val lastSync = messageDao.getLastSyncTimestamp(chatId) ?: 0L
        val isStale = System.currentTimeMillis() - lastSync > CACHE_TTL_MS

        if (isStale) {
            try {
                val networkMessages = api.getMessages(chatId)
                messageDao.replaceMessages(
                    chatId,
                    networkMessages.map { it.toEntity(syncedAt = System.currentTimeMillis()) }
                )
            } catch (e: Exception) {
                // Network failed — database data is still valid, UI keeps showing it
            }
        }
    }

    companion object {
        private const val CACHE_TTL_MS = 2 * 60 * 1000L
    }
}
```

```kotlin
// Room DAO that enables reactive SSOT
@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE chat_id = :chatId ORDER BY timestamp DESC")
    fun observeMessages(chatId: String): Flow<List<MessageEntity>>

    @Query("SELECT MAX(synced_at) FROM messages WHERE chat_id = :chatId")
    suspend fun getLastSyncTimestamp(chatId: String): Long?

    @Transaction
    suspend fun replaceMessages(chatId: String, messages: List<MessageEntity>) {
        deleteMessagesByChatId(chatId)
        insertAll(messages)
    }

    @Query("DELETE FROM messages WHERE chat_id = :chatId")
    suspend fun deleteMessagesByChatId(chatId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(messages: List<MessageEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: MessageEntity)
}
```

#### Common Mistakes

The most dangerous mistake with SSOT is having "two sources of truth." This happens when the ViewModel holds a `MutableStateFlow<List<Message>>` that it manually updates from network responses, while also reading from Room in some places. The two get out of sync within days. The fix is simple: never hold domain data in the ViewModel's mutable state. The ViewModel's `StateFlow` should be derived from the Repository's database Flow — it's a read-only projection, not a writable cache.

Another mistake is bypassing the database for "simple" reads. A developer thinks "I just fetched this from the network, why write it to Room and read it back? That's an extra step." But that "extra step" is the entire point. The moment you return network data directly to the ViewModel, you've created a second source of truth that won't update when the database changes.

**Key takeaway:** The database is the single source of truth. Network responses update the database, and the UI observes the database via Flow. This guarantees consistent state, enables offline support, and eliminates the entire class of bugs caused by stale or conflicting data copies.

### Lesson 4.2: Offline-First Architecture

Offline-first doesn't mean "handle the offline case." It means the app is designed to work offline as the default state, and network connectivity is a bonus that improves freshness. This is a fundamental mindset shift. Most apps are built network-first: they fetch data from the server, display it, and show an error screen when the network is unavailable. Offline-first apps read from the local database, display immediately, and sync with the server when possible. The user never sees a loading spinner for data that already exists locally.

The reason offline-first matters so much for Android is that Android devices live in hostile network environments. Users go through tunnels, enter buildings with terrible reception, fly on airplanes, and commute through dead zones. In emerging markets — where Android has massive market share — connectivity is intermittent and expensive. An app that shows "No internet connection" every time the signal drops is broken for these users. An offline-first app shows cached data instantly and silently refreshes in the background when connectivity returns.

The core of offline-first is the SSOT pattern from the previous lesson, but extended to handle writes. Reading offline is straightforward — you always read from the database, so if the database has data, the user sees it regardless of network state. Writing offline is harder because you need to track which local changes haven't been synced to the server yet. This is where the "pending action" pattern comes in. When the user performs a write operation (send a message, delete an item, update their profile) and the network is unavailable, you apply the change locally and queue a sync action for later.

The pending action queue is a separate database table that tracks operations that need to be sent to the server. Each entry contains the action type, the payload, and a retry count. When connectivity returns, a background worker processes the queue in order, sending each action to the server and removing it from the queue on success. If a server call fails, the action stays in the queue with an incremented retry count. This guarantees that no user action is ever lost — even if the app is killed, the pending actions are persisted in Room and processed on the next launch.

The MobileNativeFoundation's Store library provides a battle-tested implementation of the offline-first pattern. Store wraps your network fetcher and local cache (Room DAO) and handles staleness, deduplication, and error recovery automatically. Instead of building cache validation logic from scratch, you configure a `StoreBuilder` with a `Fetcher` (how to get data from the network) and a `SourceOfTruth` (how to read/write from/to the database). Store handles the orchestration — it reads from the database first, checks staleness, fetches from the network if needed, and writes the result back to the database.

A critical detail in offline-first architecture is how you handle conflicts. When the user modifies data offline and the server has a different version, you need a conflict resolution strategy. The simplest approach is "last write wins" — the most recent timestamp takes precedence. A more robust approach is "server wins for reads, client wins for writes" — you always display the server's latest data, but client write operations (sends, deletes) are always honored and re-applied. For most consumer apps, the simple approach is sufficient. Banking and collaborative editing apps need more sophisticated conflict resolution.

The user experience of offline-first requires careful UI design. The user needs to know the state of their actions: is this message sent, pending, or failed? A subtle icon or color change on pending items gives the user confidence that their action was registered without being intrusive. Failed items should offer a retry option. The key principle is: never hide state from the user. If a message is pending, show it as pending. If an operation failed after retries, tell the user. But don't block them from continuing to use the app.

WorkManager is the backbone of offline sync on Android. Unlike coroutines launched in `viewModelScope`, WorkManager persists across app restarts and device reboots. When you enqueue a sync worker with a `CONNECTED` network constraint, Android guarantees it will run when connectivity is available — even if the user closed the app hours ago. This is essential for offline-first because the user might perform actions offline, close the app, and not open it again until they have connectivity. Without WorkManager, those pending actions would be lost.

```kotlin
// Pending action model — persisted in Room
@Entity(tableName = "pending_actions")
data class PendingAction(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val type: String,       // "SEND_MESSAGE", "DELETE_MESSAGE", "UPDATE_PROFILE"
    val payload: String,    // JSON-serialized action data
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0
)

@Dao
interface PendingActionDao {
    @Query("SELECT * FROM pending_actions ORDER BY createdAt ASC")
    suspend fun getAllPending(): List<PendingAction>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(action: PendingAction)

    @Delete
    suspend fun delete(action: PendingAction)

    @Query("UPDATE pending_actions SET retryCount = retryCount + 1 WHERE id = :id")
    suspend fun incrementRetryCount(id: String)
}
```

```kotlin
// WorkManager worker that processes the pending action queue
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val pendingActionDao: PendingActionDao,
    private val api: ChatApi,
    private val messageDao: MessageDao
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val pendingActions = pendingActionDao.getAllPending()

        for (action in pendingActions) {
            try {
                when (action.type) {
                    "SEND_MESSAGE" -> {
                        val parts = action.payload.split("|")
                        val chatId = parts[0]
                        val localId = parts[1]
                        val text = parts[2]
                        val response = api.sendMessage(chatId, text)
                        messageDao.updateStatus(localId, MessageStatus.SENT, serverId = response.id)
                        pendingActionDao.delete(action)
                    }
                    "DELETE_MESSAGE" -> {
                        api.deleteMessage(action.payload)
                        pendingActionDao.delete(action)
                    }
                }
            } catch (e: Exception) {
                pendingActionDao.incrementRetryCount(action.id)
                if (action.retryCount >= MAX_RETRIES) {
                    messageDao.updateStatus(action.payload, MessageStatus.FAILED)
                    pendingActionDao.delete(action)
                }
            }
        }

        return Result.success()
    }

    companion object {
        private const val MAX_RETRIES = 5
    }
}
```

```kotlin
// Enqueuing the sync worker with proper constraints
fun enqueueSyncWork(workManager: WorkManager) {
    val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .setBackoffCriteria(
            BackoffPolicy.EXPONENTIAL,
            30,
            TimeUnit.SECONDS
        )
        .build()

    workManager.enqueueUniqueWork(
        "sync_pending_actions",
        ExistingWorkPolicy.KEEP,  // don't duplicate if already enqueued
        syncRequest
    )
}
```

```kotlin
// Repository method for offline-capable message sending
suspend fun sendMessage(chatId: String, text: String) {
    val localId = UUID.randomUUID().toString()
    val entity = MessageEntity(
        id = localId,
        chatId = chatId,
        text = text,
        status = MessageStatus.PENDING,
        timestamp = System.currentTimeMillis()
    )

    // Optimistic local insert — UI sees it immediately via the database Flow
    messageDao.insert(entity)

    try {
        val response = api.sendMessage(chatId, text)
        messageDao.updateStatus(localId, MessageStatus.SENT, serverId = response.id)
    } catch (e: Exception) {
        // Queue for later — WorkManager handles retry
        pendingActionDao.insert(
            PendingAction(type = "SEND_MESSAGE", payload = "$chatId|$localId|$text")
        )
        enqueueSyncWork(workManager)
    }
}
```

#### Anti-patterns

The biggest offline-first anti-pattern is "offline as an afterthought." Teams build the entire app network-first, then try to bolt on offline support at the end. This never works well because the architecture wasn't designed for it. Offline-first needs to be a foundational decision — the database-first data flow, the pending action queue, the sync worker — these aren't features you add later. They're structural choices that shape how every Repository method works.

Another anti-pattern is silent data loss. When a network call fails and the app silently drops the user's action without any indication, the user loses trust. If you can't sync an action, persist it and tell the user its status. Every write action should be in one of three visible states: synced, pending, or failed.

**Key takeaway:** Offline-first means the app works offline by default. Read from the database always, write locally with a pending action queue, and use WorkManager to sync when connectivity returns. The user's actions are never lost, and the app is always usable.

### Lesson 4.3: Cache Validation Strategies

Caching is easy. Cache invalidation is one of the hardest problems in computer science — and the quote exists because it's true. Every Repository that reads from a cache needs a strategy for answering a deceptively simple question: is this cached data still good enough to show the user? Show stale data and the user sees outdated information. Refresh too aggressively and you waste bandwidth, drain battery, and slow down the app with unnecessary network calls. The right cache validation strategy depends on your data's update frequency, your user's tolerance for staleness, and your network cost budget.

The most common strategy is time-based TTL (Time To Live). You store a timestamp alongside every cached entry and consider it stale after a fixed duration. For a messaging app, a 30-second TTL makes sense because messages arrive frequently. For a user profile, a 5-minute TTL is fine because profiles rarely change. For a settings configuration fetched from the server, a 24-hour TTL works because server configs change infrequently. The simplicity of TTL is its strength — it's easy to implement, easy to reason about, and easy to tune.

The downside of pure TTL is that it's a blunt instrument. A 2-minute TTL means you'll make unnecessary network calls every 2 minutes even if the data hasn't changed on the server. For apps with millions of users, this adds up to significant server load. Conversely, a 10-minute TTL means users might see 10-minute-old data, which is unacceptable for real-time features like chat or live scores. TTL works best when you can tolerate some staleness and when the data's update frequency is relatively predictable.

ETag-based validation is more sophisticated. The server returns an `ETag` header with each response — a hash of the content. On subsequent requests, the client sends the ETag in an `If-None-Match` header. If the data hasn't changed, the server returns `304 Not Modified` with no body, saving bandwidth. If the data has changed, the server returns `200` with the new data and a new ETag. This approach eliminates unnecessary data transfer while still checking freshness on every request. The tradeoff is that you still make a network round-trip for the validation check, even when nothing changed.

A hybrid approach combines TTL with event-driven invalidation. Use TTL as the baseline — data is considered fresh for N minutes. But certain user actions immediately invalidate the cache. When the user sends a message, invalidate the message list cache and trigger a refresh. When the user updates their profile, invalidate the profile cache. This gives you the efficiency of TTL (no unnecessary polling) with the responsiveness of event-driven updates (user actions are reflected immediately).

For apps that need real-time freshness without polling, server-push mechanisms like WebSockets, Server-Sent Events, or Firebase Realtime Database bypass caching entirely for specific data types. The chat message list might use a WebSocket for real-time updates while the user profile uses TTL-based caching. Mixing strategies per data type is not only acceptable — it's the right approach. Different data has different freshness requirements, and a one-size-fits-all cache strategy will either over-fetch or under-fetch for at least some of your data types.

Another strategy worth knowing is version-based invalidation. The server includes a version number with each response. The client stores the version alongside the cached data. On app launch or at regular intervals, the client fetches only the version numbers for all cached entities (a lightweight API call). If any version has changed, the client fetches the full data for those entities only. This is particularly effective for catalog-style data — product listings, menu items, configuration — where the full dataset is large but changes are infrequent and localized.

Cache validation also needs to account for multi-screen consistency. If the user is on the chat list screen with a 2-minute-old cache and navigates to a specific chat, the detail screen might fetch fresh data and show newer messages than the list screen. When the user navigates back, the list screen's stale cache shows the old preview. The fix is to share the cache between screens — both read from the same Room table, so when the detail screen triggers a refresh, the list screen updates automatically. This is another benefit of the SSOT pattern.

```kotlin
// Time-based TTL cache validation
class ArticleRepository(
    private val api: ArticleApi,
    private val articleDao: ArticleDao
) {
    companion object {
        private const val ARTICLE_TTL_MS = 5 * 60 * 1000L       // 5 minutes for list
        private const val ARTICLE_DETAIL_TTL_MS = 10 * 60 * 1000L // 10 minutes for detail
    }

    fun observeArticles(): Flow<List<Article>> =
        articleDao.observeAll().map { entities -> entities.map { it.toDomain() } }

    suspend fun refreshArticlesIfStale() {
        val lastSync = articleDao.getLastSyncTimestamp() ?: 0L
        if (System.currentTimeMillis() - lastSync > ARTICLE_TTL_MS) {
            val fresh = api.getArticles()
            articleDao.replaceAll(
                fresh.map { it.toEntity(syncedAt = System.currentTimeMillis()) }
            )
        }
    }
}
```

```kotlin
// ETag-based cache validation
class ConfigRepository(
    private val api: ConfigApi,
    private val configDao: ConfigDao
) {
    suspend fun refreshConfig() {
        val cached = configDao.getConfig()
        val etag = cached?.etag

        val response = api.getConfig(ifNoneMatch = etag)

        when (response.code()) {
            304 -> { /* data unchanged — nothing to do */ }
            200 -> {
                val newEtag = response.headers()["ETag"]
                val config = response.body()!!
                configDao.insert(
                    config.toEntity(etag = newEtag)
                )
            }
            else -> throw HttpException(response)
        }
    }
}

// Retrofit API with conditional headers
interface ConfigApi {
    @GET("config")
    suspend fun getConfig(
        @Header("If-None-Match") ifNoneMatch: String? = null
    ): Response<ConfigDto>
}
```

```kotlin
// Hybrid: TTL + event-driven invalidation
class ProductRepository(
    private val api: ProductApi,
    private val productDao: ProductDao
) {
    companion object {
        private const val PRODUCT_TTL_MS = 10 * 60 * 1000L // 10 minutes
    }

    fun observeProducts(): Flow<List<Product>> =
        productDao.observeAll().map { entities -> entities.map { it.toDomain() } }

    // TTL-based: called on screen enter
    suspend fun refreshIfStale() {
        val lastSync = productDao.getLastSyncTimestamp() ?: 0L
        if (System.currentTimeMillis() - lastSync > PRODUCT_TTL_MS) {
            forceRefresh()
        }
    }

    // Event-driven: called after user actions that change data
    suspend fun forceRefresh() {
        try {
            val products = api.getProducts()
            productDao.replaceAll(
                products.map { it.toEntity(syncedAt = System.currentTimeMillis()) }
            )
        } catch (e: Exception) {
            // Cache is still valid — don't wipe it on network failure
        }
    }

    suspend fun addProduct(product: NewProduct) {
        api.createProduct(product)
        forceRefresh() // invalidate cache immediately after mutation
    }
}
```

```kotlin
// Version-based invalidation for catalog data
class MenuRepository(
    private val api: MenuApi,
    private val menuDao: MenuDao
) {
    suspend fun syncIfVersionChanged() {
        val localVersion = menuDao.getVersion() ?: -1
        val remoteVersion = api.getMenuVersion().version

        if (remoteVersion > localVersion) {
            val menu = api.getFullMenu()
            menuDao.replaceAll(menu.items.map { it.toEntity() })
            menuDao.setVersion(remoteVersion)
        }
    }
}
```

#### Common Mistakes

The most common cache validation mistake is using the same TTL for all data types. Chat messages need freshness measured in seconds. User profiles can tolerate minutes. App configuration can tolerate hours. Using a single 5-minute TTL means your chat is too stale and your config makes unnecessary network calls. Define TTL per entity type based on its actual update frequency and the user's tolerance for staleness.

Another mistake is wiping the cache on network failure. Some implementations clear the database before inserting fresh data — `deleteAll()` then `insertAll()`. If the network call fails between those two operations, the user is left with an empty screen. Always use a transactional `replaceAll()` or insert first, then clean up old entries.

**Key takeaway:** Cache validation strategy should match data characteristics. Use TTL for predictable data, ETag for bandwidth-sensitive data, event-driven invalidation for user-mutated data, and hybrid approaches for complex apps. The goal is showing fresh-enough data without wasting bandwidth.

### Lesson 4.4: Memory Cache with Repository Getters

Room provides disk-based caching through SQLite, and for most data types that's exactly right — it persists across app restarts and is always consistent. But some data access patterns need something faster. When the ViewModel calls `repository.getCurrentUser()` fifty times during a screen session — for permission checks, display name formatting, avatar loading, and feature flag evaluation — hitting Room's SQLite each time creates unnecessary overhead. A memory cache eliminates that overhead by keeping frequently accessed, rarely changing data in a simple in-memory variable.

The simplest memory cache is a nullable variable in the Repository. When `getCurrentUser()` is called, the Repository checks the in-memory variable first. If it's populated, return it immediately — no coroutine suspension, no disk I/O, no database query. If it's null, fetch from Room (or the network if Room is also empty), populate the in-memory variable, and return. This turns a 2-5ms database query into a nanosecond memory read for subsequent calls within the same app session.

The tricky part is thread safety. Multiple coroutines can call `getCurrentUser()` simultaneously — during app startup, three ViewModels might all request the current user at the same time. Without synchronization, you get a race condition: all three see the in-memory cache as null, all three hit the database, and all three write to the cache variable. This wastes resources and can cause subtle bugs if the database result changes between reads. Kotlin's `Mutex` solves this cleanly. Wrap the cache-check-and-populate logic in `mutex.withLock {}`, and the first coroutine fetches while the others wait for the result.

`Mutex` is the right choice for coroutines because it suspends waiting coroutines instead of blocking their threads. Java's `synchronized` or `ReentrantLock` block the underlying thread, which can cause deadlocks when used on `Dispatchers.Main` or exhaust the limited threads in `Dispatchers.IO`. `Mutex.withLock` is a suspend function — the waiting coroutines yield their threads and resume when the lock is available. This is a critical distinction that many developers miss, leading to ANRs or thread starvation in production.

Memory caches also introduce the invalidation problem. If the user updates their profile on the profile screen, the in-memory cache in `UserRepository` is stale. You need a way to clear or update the cache when the underlying data changes. The simplest approach is to invalidate on write — whenever a method like `updateUserProfile()` is called, set the cache variable back to null so the next read fetches fresh data. A more sophisticated approach is to update the cache inline: after the write succeeds, update the in-memory variable with the new value so subsequent reads get the latest data without a database round-trip.

One pattern that deserves attention is using `WeakReference` for context-holding caches. If your Repository holds a reference to something that indirectly references an Activity or Fragment context, you risk memory leaks. A `WeakReference` allows the garbage collector to reclaim the referenced object when there are no strong references to it. This is especially relevant when caching bitmap references, View-related data, or anything that might hold a context chain. For domain objects like `User` or `Profile`, regular strong references are fine because they don't reference Android framework objects.

For data that changes more frequently, consider using a `StateFlow` as your memory cache instead of a nullable variable. A `StateFlow<User?>` holds the latest value in memory, and any collector gets the current value immediately plus future updates. This gives you both memory caching (the `.value` property is always available) and reactive updates (collectors are notified when the value changes). The Repository can update the StateFlow when it fetches fresh data, and every ViewModel that's collecting it gets the update automatically.

The memory cache should never be the source of truth — Room is. The memory cache is a performance optimization that sits in front of Room. If the memory cache is invalidated or the process is killed, the app falls back to Room seamlessly. Think of it as L1 cache (memory) in front of L2 cache (Room) in front of the origin server (network). Each layer trades persistence for speed.

```kotlin
// Memory cache with Mutex for thread-safe access
class UserRepository(
    private val api: UserApi,
    private val userDao: UserDao
) {
    private var cachedUser: User? = null
    private val mutex = Mutex()

    suspend fun getCurrentUser(): User {
        // Fast path — return from memory if available
        cachedUser?.let { return it }

        // Slow path — fetch with lock to prevent duplicate database hits
        return mutex.withLock {
            // Double-check after acquiring lock (another coroutine may have populated it)
            cachedUser?.let { return@withLock it }

            val user = userDao.getCurrentUser()?.toDomain()
                ?: api.getCurrentUser().also { networkUser ->
                    userDao.insert(networkUser.toEntity())
                }.toDomain()

            cachedUser = user
            user
        }
    }

    suspend fun updateProfile(name: String, bio: String) {
        val updated = api.updateProfile(name, bio)
        userDao.insert(updated.toEntity())
        // Update in-memory cache so subsequent reads get fresh data
        cachedUser = updated.toDomain()
    }

    fun invalidateCache() {
        cachedUser = null
    }
}
```

```kotlin
// StateFlow-based memory cache — reactive and always fresh
class SessionRepository(
    private val api: AuthApi,
    private val sessionDao: SessionDao
) {
    private val _currentSession = MutableStateFlow<Session?>(null)

    // Collectors get the current value immediately + future updates
    fun observeSession(): StateFlow<Session?> = _currentSession.asStateFlow()

    suspend fun initialize() {
        // Load from database on app start
        val saved = sessionDao.getSession()?.toDomain()
        _currentSession.value = saved
    }

    suspend fun login(credentials: Credentials): LoginResult {
        return try {
            val session = api.login(credentials)
            sessionDao.insert(session.toEntity())
            _currentSession.value = session.toDomain() // memory cache updated
            LoginResult.Success
        } catch (e: Exception) {
            LoginResult.Error(e.message ?: "Login failed")
        }
    }

    suspend fun logout() {
        sessionDao.clear()
        _currentSession.value = null // memory cache cleared
    }
}
```

```kotlin
// ❌ Race condition without Mutex
class UnsafeRepository(private val dao: UserDao) {
    private var cached: User? = null

    suspend fun getUser(): User {
        cached?.let { return it }
        // Two coroutines reach here simultaneously — both query the database
        val user = dao.getCurrentUser()!!.toDomain()
        cached = user // both write — wasted work, potential inconsistency
        return user
    }
}

// ❌ Using synchronized blocks with coroutines — blocks threads
class BlockingRepository(private val dao: UserDao) {
    private var cached: User? = null

    suspend fun getUser(): User {
        synchronized(this) {
            // This BLOCKS the thread — bad on Dispatchers.Main, wasteful on Dispatchers.IO
            cached?.let { return it }
            val user = dao.getCurrentUser()!!.toDomain()
            cached = user
            return user
        }
    }
}
```

```kotlin
// WeakReference for context-sensitive caches
class ImageCacheRepository {
    // WeakReference allows GC to reclaim when memory pressure is high
    private var cachedBitmap: WeakReference<Pair<String, Bitmap>>? = null

    fun getCachedBitmap(key: String): Bitmap? {
        val cached = cachedBitmap?.get()
        return if (cached != null && cached.first == key) cached.second else null
    }

    fun cacheBitmap(key: String, bitmap: Bitmap) {
        cachedBitmap = WeakReference(Pair(key, bitmap))
    }
}
```

#### Anti-patterns

The "immortal cache" anti-pattern is a memory cache that's never invalidated. The user updates their name on the server via the web app, but the Android app keeps showing the old name until the process is killed. Every memory cache needs an invalidation strategy — either time-based, event-based, or lifecycle-based (invalidate on app resume).

A related anti-pattern is caching mutable objects. If you cache a `MutableList<Message>` and a consumer modifies it, the cache is corrupted. Always cache immutable data classes. Kotlin's `data class` with `val` properties ensures this by default.

**Key takeaway:** Memory caches are L1 performance optimizations in front of Room's L2 cache. Use `Mutex` for thread-safe coroutine access, invalidate on writes, and never let the memory cache become the source of truth. Room is the SSOT — memory is just speed.

### Lesson 4.5: Data Source Abstraction

A well-structured data layer doesn't just have a Repository — it has a Repository that delegates to clearly separated Data Sources. The Repository is the coordinator; the Data Sources are the specialists. `UserRemoteDataSource` knows how to talk to Retrofit. `UserLocalDataSource` knows how to talk to Room. `UserCacheDataSource` knows how to manage the in-memory cache. The Repository orchestrates between them without knowing the implementation details of any individual source. This separation might seem like extra classes, but it pays for itself the first time you need to swap a data source.

The most common data source abstraction is the remote/local split. `RemoteDataSource` wraps your API client (Retrofit, Ktor, GraphQL) and handles network-specific concerns: authentication headers, retry logic, response parsing, and error mapping. `LocalDataSource` wraps your database (Room, SQLDelight) and handles persistence concerns: entity mapping, migration, transactions, and query optimization. The Repository decides when to call each source and how to combine their results. This separation means that a Retrofit-to-Ktor migration only touches the `RemoteDataSource` — the Repository and everything above it are unchanged.

The abstraction becomes critical during testing. Without data source separation, testing the Repository requires mocking both Retrofit and Room — two framework-heavy dependencies that are painful to mock correctly. With data source separation, you mock two simple interfaces: `RemoteDataSource` returns domain models from a fake network, and `LocalDataSource` reads/writes from an in-memory map. Your Repository tests verify the coordination logic (when to fetch, when to cache, how to handle errors) without touching any framework code. These tests run in milliseconds, not seconds.

Data source abstraction also enables gradual migrations. Consider a team migrating from SharedPreferences to DataStore for user settings. Without abstraction, every Repository that reads settings has direct SharedPreferences calls. The migration is all-or-nothing — you can't partially migrate. With a `SettingsLocalDataSource` interface, you create `SharedPreferencesSettingsDataSource` and `DataStoreSettingsDataSource`, implement both, and gradually switch repositories to use the new implementation. You can even run both in parallel during the migration to verify consistency.

The interface for each data source should be defined in terms of domain concepts, not framework concepts. Don't expose `suspend fun getUser(): Response<UserDto>` — that leaks Retrofit's `Response` type into the Repository. Expose `suspend fun getUser(): UserDto` or even `suspend fun getUser(): User` if you map to domain models in the data source. The Repository shouldn't know whether the remote source uses Retrofit, Ktor, or raw `HttpURLConnection`. It just knows it can call `getUser()` and get a domain object back.

One pattern I've found particularly effective is the "data source as mapper boundary." The remote data source receives DTOs (Data Transfer Objects) from the API and maps them to domain models before returning them. The local data source receives entities from Room and maps them to domain models before returning them. This means the Repository only deals with domain models — it never touches DTOs or entities. The mapping logic is encapsulated where it belongs: at the boundary between the framework and the domain.

In a modular project, data sources often live in separate Gradle modules. The `:core:network` module provides the Retrofit instance and API interfaces. The `:core:database` module provides the Room database and DAOs. The `:data:user` module provides `UserRemoteDataSource`, `UserLocalDataSource`, and `UserRepositoryImpl`. The `:domain` module provides the `UserRepository` interface. This module structure enforces the abstraction at the build system level — the Repository module doesn't even have Retrofit on its classpath, so it physically can't bypass the data source abstraction.

When you have three data sources (remote, local, memory), the Repository's coordination logic follows a predictable pattern: check memory first, then check local (Room), then fetch from remote. After a remote fetch, write to local and update memory. This three-tier cache pattern is the same one hardware engineers use (L1/L2/RAM) and the same one CDNs use (edge/regional/origin). It's a universal pattern because it works.

```kotlin
// Data source interfaces — clean contracts
interface UserRemoteDataSource {
    suspend fun fetchUser(id: String): User
    suspend fun updateUser(user: User): User
    suspend fun searchUsers(query: String): List<User>
}

interface UserLocalDataSource {
    fun observeUser(id: String): Flow<User?>
    suspend fun getUser(id: String): User?
    suspend fun saveUser(user: User)
    suspend fun deleteUser(id: String)
    suspend fun getLastSyncTimestamp(id: String): Long?
}
```

```kotlin
// Remote data source — maps DTOs to domain models at the boundary
class UserRemoteDataSourceImpl(
    private val api: UserApi
) : UserRemoteDataSource {

    override suspend fun fetchUser(id: String): User {
        val dto = api.getUser(id)
        return dto.toDomain() // mapping happens HERE, not in the Repository
    }

    override suspend fun updateUser(user: User): User {
        val request = user.toUpdateRequest()
        val dto = api.updateUser(user.id, request)
        return dto.toDomain()
    }

    override suspend fun searchUsers(query: String): List<User> {
        return api.searchUsers(query).users.map { it.toDomain() }
    }
}

// Extension functions for mapping — keeps the data source clean
private fun UserDto.toDomain(): User = User(
    id = this.id,
    name = this.fullName,
    email = this.emailAddress,
    avatarUrl = this.profileImageUrl,
    isPremium = this.subscriptionTier != "free"
)
```

```kotlin
// Local data source — maps entities to domain models at the boundary
class UserLocalDataSourceImpl(
    private val userDao: UserDao
) : UserLocalDataSource {

    override fun observeUser(id: String): Flow<User?> =
        userDao.observeUser(id).map { entity -> entity?.toDomain() }

    override suspend fun getUser(id: String): User? =
        userDao.getUser(id)?.toDomain()

    override suspend fun saveUser(user: User) {
        userDao.insert(user.toEntity())
    }

    override suspend fun deleteUser(id: String) {
        userDao.deleteById(id)
    }

    override suspend fun getLastSyncTimestamp(id: String): Long? =
        userDao.getLastSyncTimestamp(id)
}

private fun UserEntity.toDomain(): User = User(
    id = this.id,
    name = this.name,
    email = this.email,
    avatarUrl = this.avatarUrl,
    isPremium = this.isPremium
)

private fun User.toEntity(): UserEntity = UserEntity(
    id = this.id,
    name = this.name,
    email = this.email,
    avatarUrl = this.avatarUrl,
    isPremium = this.isPremium,
    syncedAt = System.currentTimeMillis()
)
```

```kotlin
// Repository that coordinates data sources — knows nothing about Retrofit or Room
class UserRepositoryImpl(
    private val remoteDataSource: UserRemoteDataSource,
    private val localDataSource: UserLocalDataSource
) : UserRepository {

    companion object {
        private const val USER_CACHE_TTL_MS = 5 * 60 * 1000L
    }

    override fun observeUser(id: String): Flow<User> =
        localDataSource.observeUser(id).filterNotNull()

    override suspend fun refreshUserIfNeeded(id: String) {
        val lastSync = localDataSource.getLastSyncTimestamp(id) ?: 0L
        if (System.currentTimeMillis() - lastSync > USER_CACHE_TTL_MS) {
            try {
                val freshUser = remoteDataSource.fetchUser(id)
                localDataSource.saveUser(freshUser)
            } catch (e: Exception) {
                // Local data is still valid
            }
        }
    }

    override suspend fun updateUser(user: User): User {
        val updated = remoteDataSource.updateUser(user)
        localDataSource.saveUser(updated)
        return updated
    }
}
```

```kotlin
// Testing becomes trivial with data source abstraction
class FakeUserRemoteDataSource : UserRemoteDataSource {
    var users = mutableMapOf<String, User>()
    var shouldFail = false

    override suspend fun fetchUser(id: String): User {
        if (shouldFail) throw IOException("Network error")
        return users[id] ?: throw NotFoundException("User not found")
    }

    override suspend fun updateUser(user: User): User {
        users[user.id] = user
        return user
    }

    override suspend fun searchUsers(query: String): List<User> =
        users.values.filter { it.name.contains(query, ignoreCase = true) }
}

class FakeUserLocalDataSource : UserLocalDataSource {
    private val store = MutableStateFlow<Map<String, User>>(emptyMap())

    override fun observeUser(id: String): Flow<User?> =
        store.map { it[id] }

    override suspend fun getUser(id: String): User? = store.value[id]

    override suspend fun saveUser(user: User) {
        store.update { it + (user.id to user) }
    }

    override suspend fun deleteUser(id: String) {
        store.update { it - id }
    }

    override suspend fun getLastSyncTimestamp(id: String): Long? = null
}
```

#### Common Mistakes

The most common mistake is leaking framework types through data source interfaces. If `UserRemoteDataSource.fetchUser()` returns a `retrofit2.Response<UserDto>`, the Repository now depends on Retrofit — defeating the purpose of the abstraction. Data source interfaces should return domain types or data-layer-specific types, never framework types.

Another mistake is putting coordination logic inside data sources. A `RemoteDataSource` that checks the local database before making a network call is doing the Repository's job. Data sources should be dumb — they do exactly one thing (fetch from network, read from database) and let the Repository decide when and how to use them.

**Key takeaway:** Data source abstraction separates framework concerns from coordination logic. Remote data sources handle network details, local data sources handle database details, and the Repository orchestrates between them. This enables easy testing, gradual migrations, and clean separation of concerns.

### Quiz: Repository Pattern

#### What is the "single source of truth" in the Repository pattern?

- ❌ The network API response
- ✅ The local database
- ❌ The ViewModel's StateFlow
- ❌ The SharedPreferences

> **Explanation:** The database is the single source of truth. Network responses update the database, and the UI observes the database via Flow. This guarantees consistent state and enables offline support — even if the network fails, cached data is available.

#### In an offline-first strategy, what should happen when the network call fails but cached data exists?

- ❌ Show an error screen immediately
- ❌ Retry the network call indefinitely
- ✅ Continue showing the cached data without interrupting the user
- ❌ Clear the cache and show a loading spinner

> **Explanation:** If cached data exists and the network fails, the user already has something to see. Showing an error screen would be a worse experience than displaying slightly stale data. The app can silently retry later or show a subtle offline indicator.

#### How should offline write operations (like deleting a message without network) be handled?

- ❌ Show an error and prevent the action
- ❌ Silently drop the action
- ✅ Apply the change locally and queue the server sync for when connectivity returns
- ❌ Wait until network is available, then apply

> **Explanation:** Offline write operations should use optimistic local updates with pending action queues. Mark the message as deleted locally, queue the server deletion, and use WorkManager to process the queue when connectivity returns.

### Coding Challenge: Build an Offline-First Repository

Implement a `ChatRepository` that follows SSOT, supports offline message sending with pending actions, and uses time-based cache validation. Include a memory cache for the current user's profile.

#### Solution

```kotlin
class ChatRepository(
    private val api: ChatApi,
    private val messageDao: MessageDao,
    private val pendingActionDao: PendingActionDao,
    private val workManager: WorkManager
) {
    companion object {
        private const val CACHE_TTL_MS = 2 * 60 * 1000L // 2 minutes
    }

    // SSOT — observe from database
    fun observeMessages(chatId: String): Flow<List<Message>> =
        messageDao.observeMessages(chatId)
            .map { entities -> entities.map { it.toDomain() } }

    // Refresh if stale
    suspend fun refreshIfNeeded(chatId: String) {
        val lastSync = messageDao.getLastSyncTimestamp(chatId) ?: 0L
        if (System.currentTimeMillis() - lastSync > CACHE_TTL_MS) {
            try {
                val messages = api.getMessages(chatId)
                messageDao.replaceMessages(
                    chatId,
                    messages.map { it.toEntity(syncedAt = System.currentTimeMillis()) }
                )
            } catch (e: Exception) { /* use cached data */ }
        }
    }

    // Offline-capable send with pending action
    suspend fun sendMessage(chatId: String, text: String) {
        val localId = UUID.randomUUID().toString()
        val entity = MessageEntity(
            id = localId,
            chatId = chatId,
            text = text,
            status = MessageStatus.PENDING,
            timestamp = System.currentTimeMillis()
        )

        // Show immediately in UI
        messageDao.insert(entity)

        try {
            val response = api.sendMessage(chatId, text)
            messageDao.updateStatus(localId, MessageStatus.SENT, serverId = response.id)
        } catch (e: Exception) {
            messageDao.updateStatus(localId, MessageStatus.FAILED)
            pendingActionDao.insert(
                PendingAction(type = "SEND_MESSAGE", payload = "$chatId|$localId|$text")
            )
            workManager.enqueueUniqueWork(
                "sync_messages",
                ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<MessageSyncWorker>()
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                    )
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
            )
        }
    }
}
```

The repository shows messages from the database immediately, refreshes from network when the cache is stale, and queues failed sends for retry via WorkManager. The user sees their message immediately regardless of network state.

---

## Module 5: Clean Architecture — Domain Layer

Clean Architecture separates your app into layers with strict dependency rules. The domain layer sits at the center — it contains business logic in Use Cases, defines repository interfaces, and holds domain models. It has zero Android dependencies, zero framework imports, and zero knowledge of how data is fetched or displayed. This purity makes it the most testable, stable, and portable layer in your entire app.

### Lesson 5.1: Use Cases — When and Why

Use Cases are the most misunderstood component in Android architecture. Some teams create a Use Case for every single Repository method — a `GetUserUseCase` that does nothing but call `userRepository.getUser()`. Other teams skip Use Cases entirely and dump all business logic into ViewModels. Both extremes are wrong. Use Cases exist for a specific purpose: to encapsulate business logic that is either complex enough to warrant its own class or shared across multiple ViewModels. If you can't explain what business logic a Use Case adds beyond what the Repository provides, you don't need it.

The canonical Use Case pattern in Kotlin uses `operator fun invoke()` to make the class callable like a function. Instead of writing `getDashboardUseCase.execute(userId)`, you write `getDashboard(userId)`. This isn't just syntactic sugar — it communicates intent. A Use Case is a single action, a verb: "get dashboard," "apply discounts," "validate checkout." The `invoke` operator makes this read naturally at the call site, and it signals to other developers that this class does exactly one thing.

The strongest signal that you need a Use Case is when two or more ViewModels need the same business logic. Consider a shopping app where both the cart screen and the order summary screen need to calculate the total price with discounts, tax, and shipping. Without a Use Case, that calculation lives in each ViewModel — duplicated, and guaranteed to diverge over time when someone updates one but not the other. A `CalculateTotalUseCase` centralizes the logic. Both ViewModels call it, and when the pricing rules change, you update one class.

The second signal is when a ViewModel needs to coordinate multiple repositories. A `GetDashboardUseCase` that combines data from `UserRepository`, `OrdersRepository`, and `NotificationsRepository` keeps the ViewModel clean. The ViewModel doesn't know or care that three repositories are involved — it calls the Use Case and gets a `DashboardData` object. If you later add a fourth data source (loyalty points, for example), only the Use Case changes. The ViewModel's interface remains stable.

The third signal is complex business logic that deserves its own test suite. Input validation, pricing calculations, eligibility checks, data transformations with business rules — these are logic-heavy operations that benefit from focused unit tests. A `ValidateCheckoutUseCase` that checks inventory availability, validates payment method, applies promo codes, and calculates shipping estimates has enough logic to justify its own class with its own tests. Stuffing all of that into the ViewModel makes the ViewModel test suite enormous and unfocused.

Use Cases should return `Flow<T>` for observable data and be `suspend fun` for one-shot operations. When a Use Case combines multiple repository Flows using `combine()`, the ViewModel simply collects the result. When a Use Case performs a one-shot action like `PlaceOrderUseCase`, it's a suspend function that the ViewModel calls inside `viewModelScope.launch`. The Use Case doesn't know about `viewModelScope` — it receives the coroutine context from its caller.

A common debate is whether Use Cases should handle errors internally or propagate them. The pragmatic answer is: Use Cases should catch expected domain errors and return them as typed results (sealed classes), but let unexpected exceptions propagate to the ViewModel's `catch` block. A `LoginUseCase` should return `LoginResult.InvalidCredentials` or `LoginResult.AccountLocked` — these are business outcomes. But if Room throws an `SQLiteException`, that's an infrastructure failure that the Use Case shouldn't catch.

The economic argument for Use Cases is about long-term velocity. In the first month, creating Use Cases feels like extra boilerplate. By month six, the team has twenty ViewModels, and business logic changes frequently. Without Use Cases, every pricing change requires updating four ViewModels, testing them all, and hoping none were missed. With Use Cases, you update one class, run its tests, and deploy with confidence. The initial overhead pays for itself many times over in maintenance cost reduction.

```kotlin
// ❌ Pass-through Use Case — adds no value
class GetUserUseCase(private val userRepository: UserRepository) {
    operator fun invoke(userId: String): Flow<User> =
        userRepository.observeUser(userId)  // Just delegates — why does this class exist?
}

// The ViewModel could call the Repository directly with the same result
class ProfileViewModel(private val userRepository: UserRepository) : ViewModel() {
    val user = userRepository.observeUser(userId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
}
```

```kotlin
// ✅ Use Case with real business logic — coordinates and transforms
class GetProfileWithStatsUseCase(
    private val userRepository: UserRepository,
    private val ordersRepository: OrdersRepository,
    private val reviewsRepository: ReviewsRepository
) {
    operator fun invoke(userId: String): Flow<ProfileWithStats> = combine(
        userRepository.observeUser(userId),
        ordersRepository.observeOrderCount(userId),
        reviewsRepository.observeAverageRating(userId)
    ) { user, orderCount, avgRating ->
        ProfileWithStats(
            displayName = formatDisplayName(user),
            memberTier = calculateMemberTier(orderCount),
            averageRating = avgRating,
            badgeCount = calculateBadges(orderCount, avgRating, user.memberSince)
        )
    }

    private fun formatDisplayName(user: User): String =
        if (user.isPremium) "⭐ ${user.name}" else user.name

    private fun calculateMemberTier(orderCount: Int): MemberTier = when {
        orderCount >= 100 -> MemberTier.PLATINUM
        orderCount >= 50 -> MemberTier.GOLD
        orderCount >= 10 -> MemberTier.SILVER
        else -> MemberTier.BRONZE
    }

    private fun calculateBadges(orderCount: Int, rating: Double, memberSince: Instant): Int {
        var badges = 0
        if (orderCount >= 50) badges++
        if (rating >= 4.5) badges++
        if (memberSince.isBefore(Instant.now().minus(365, ChronoUnit.DAYS))) badges++
        return badges
    }
}
```

```kotlin
// ✅ One-shot Use Case with typed error handling
class PlaceOrderUseCase(
    private val cartRepository: CartRepository,
    private val inventoryRepository: InventoryRepository,
    private val paymentRepository: PaymentRepository,
    private val ordersRepository: OrdersRepository
) {
    suspend operator fun invoke(paymentMethodId: String): OrderResult {
        val cartItems = cartRepository.getCartItems()
        if (cartItems.isEmpty()) return OrderResult.EmptyCart

        // Check inventory availability
        val unavailable = inventoryRepository.checkAvailability(cartItems)
        if (unavailable.isNotEmpty()) {
            return OrderResult.ItemsUnavailable(unavailable)
        }

        // Process payment
        val total = cartItems.sumOf { it.price * it.quantity }
        val paymentResult = paymentRepository.charge(paymentMethodId, total)
        if (paymentResult is PaymentResult.Declined) {
            return OrderResult.PaymentFailed(paymentResult.reason)
        }

        // Create order
        val order = ordersRepository.createOrder(cartItems, paymentResult.transactionId)
        cartRepository.clearCart()

        return OrderResult.Success(order)
    }
}

sealed interface OrderResult {
    data class Success(val order: Order) : OrderResult
    data object EmptyCart : OrderResult
    data class ItemsUnavailable(val items: List<CartItem>) : OrderResult
    data class PaymentFailed(val reason: String) : OrderResult
}
```

```kotlin
// ✅ Use Case shared across ViewModels — the strongest justification
class CalculatePriceUseCase(
    private val promoRepository: PromoRepository
) {
    suspend operator fun invoke(items: List<CartItem>, promoCode: String?): PriceBreakdown {
        val subtotal = items.sumOf { it.price * it.quantity }

        val discount = promoCode?.let { code ->
            val promo = promoRepository.validatePromo(code)
            when (promo) {
                is PromoResult.Valid -> (subtotal * promo.discountPercent / 100)
                is PromoResult.Invalid -> 0L
                is PromoResult.Expired -> 0L
            }
        } ?: 0L

        val taxRate = 0.08
        val afterDiscount = subtotal - discount
        val tax = (afterDiscount * taxRate).toLong()
        val shipping = if (afterDiscount >= 5000L) 0L else 499L

        return PriceBreakdown(
            subtotal = subtotal,
            discount = discount,
            tax = tax,
            shipping = shipping,
            total = afterDiscount + tax + shipping
        )
    }
}

// Used in CartViewModel
class CartViewModel(private val calculatePrice: CalculatePriceUseCase) : ViewModel() {
    // ...
    val priceBreakdown = combine(cartItems, promoCode) { items, code ->
        calculatePrice(items, code)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), PriceBreakdown.EMPTY)
}

// Used in OrderSummaryViewModel — same logic, no duplication
class OrderSummaryViewModel(private val calculatePrice: CalculatePriceUseCase) : ViewModel() {
    // ...
    val pricing = combine(orderItems, appliedPromo) { items, promo ->
        calculatePrice(items, promo)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), PriceBreakdown.EMPTY)
}
```

#### Common Mistakes

The biggest mistake is creating a Use Case for every Repository method. If `GetUserUseCase` just calls `userRepository.getUser()`, delete it. The ViewModel can call the Repository directly. Use Cases exist for business logic, not for indirection. The litmus test: if you removed the Use Case and inlined its body into the ViewModel, would you lose anything? If the answer is no, the Use Case is unnecessary boilerplate.

Another mistake is injecting Use Cases into other Use Cases. `GetDashboardUseCase` calling `GetUserUseCase` which calls `UserRepository` creates a chain of wrappers. Use Cases should depend on Repositories, not on other Use Cases. Each Use Case orchestrates repositories directly — if two Use Cases share a sub-calculation, extract it into a utility function, not another Use Case.

**Key takeaway:** Use Cases encapsulate business logic that is shared, complex, or multi-repository. Don't create pass-through Use Cases that just delegate to a Repository. Use `operator fun invoke()` for clean call-site syntax, and return typed results for error handling.

### Lesson 5.2: Domain Models vs Data Transfer Objects

One of the most impactful decisions in your architecture is whether the same class represents data across all layers — and the answer should be no. Your API returns a `UserResponse` with 30 fields including `created_at` timestamps in Unix milliseconds, nested `address` objects with `zip_code` fields, and a `subscription_tier` string that maps to your app's premium logic. Your Room entity has an auto-generated primary key, a `syncedAt` timestamp, and snake_case column names matching the API. None of this belongs in your domain layer, and definitely none of it belongs in your UI layer.

Domain models represent your app's business concepts in the purest possible form. A domain `User` has `name`, `email`, `isPremium`, and `memberSince` — the fields that business logic cares about. It doesn't have `created_at_millis` or `subscription_tier` or `_id`. It uses `Instant` for timestamps, not `Long`. It uses `Boolean` for premium status, not a string that needs to be parsed. Domain models are designed for the developers who write business logic, not for the API that returns data or the database that stores it.

DTOs (Data Transfer Objects) represent the exact shape of the data as it travels over the wire. They mirror the API's JSON structure with `@SerializedName` or `@Json` annotations. They often have nullable fields because the API might not return everything. They use the API's naming conventions and types. DTOs are throw-away containers — they exist to deserialize the API response, then immediately get mapped to domain models. They should never leak beyond the data layer.

Room entities represent the exact shape of the data as it sits in SQLite. They have `@Entity`, `@PrimaryKey`, and `@ColumnInfo` annotations. They might include metadata columns like `syncedAt` or `isDeleted` that aren't part of the business domain. Like DTOs, entities are framework-bound — they depend on Room annotations and are only used inside the data layer.

The mapping between these types happens at data source boundaries. The `RemoteDataSource` deserializes JSON into DTOs, maps them to domain models, and returns domain models to the Repository. The `LocalDataSource` reads Room entities from the DAO, maps them to domain models, and returns domain models. The Repository never sees DTOs or entities — it works exclusively with domain models. This boundary discipline means that if the API changes a field name from `user_name` to `full_name`, you update the DTO and the mapper — nothing else in the entire app changes.

The cost of having three model types is more classes and mapper functions. A `User` feature now has `UserDto`, `UserEntity`, and `User` — three data classes and two mapper functions. But the alternative — using one class everywhere — creates a monster class with `@SerializedName`, `@Entity`, `@PrimaryKey`, `@ColumnInfo`, nullable API fields, and domain logic all mixed together. This class changes for three different reasons (API change, schema change, business rule change), violating the Single Responsibility Principle. It also creates ripple effects: changing a `@ColumnInfo` annotation triggers recompilation of every file that references `User`, including ViewModels and composables that have nothing to do with the database.

A practical tip for mapper functions: use extension functions rather than `toX()` methods inside the data class. Extension functions keep the mapping logic close to the layer boundary where it belongs, without polluting the domain model with knowledge of DTOs or entities. `UserDto.toDomain()` is an extension function in the data module. `User.toEntity()` is an extension function in the data module. The domain module — where `User` is defined — has zero knowledge that DTOs or entities exist.

One debate teams have is whether to use domain models in the UI layer or create yet another layer of "UI models." For most apps, domain models are fine for the UI. A `User` domain model with `name: String` and `isPremium: Boolean` is perfectly usable in a Composable. Create UI-specific models only when the UI needs significant transformation — for example, a `ProfileUiState` that combines user data with formatted strings, computed display values, and UI-specific flags like `isEditButtonVisible`. But don't create a `UserUiModel` that's identical to `User` — that's pointless indirection.

```kotlin
// DTO — mirrors the API response exactly
@JsonClass(generateAdapter = true)
data class UserDto(
    @Json(name = "id") val id: String,
    @Json(name = "full_name") val fullName: String,
    @Json(name = "email_address") val emailAddress: String,
    @Json(name = "profile_image_url") val profileImageUrl: String?,
    @Json(name = "subscription_tier") val subscriptionTier: String,
    @Json(name = "created_at") val createdAtMillis: Long,
    @Json(name = "address") val address: AddressDto?,
    @Json(name = "phone_numbers") val phoneNumbers: List<String>?
)

@JsonClass(generateAdapter = true)
data class AddressDto(
    @Json(name = "street") val street: String?,
    @Json(name = "city") val city: String?,
    @Json(name = "zip_code") val zipCode: String?,
    @Json(name = "country_code") val countryCode: String?
)
```

```kotlin
// Room Entity — mirrors the database schema exactly
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "email") val email: String,
    @ColumnInfo(name = "avatar_url") val avatarUrl: String?,
    @ColumnInfo(name = "is_premium") val isPremium: Boolean,
    @ColumnInfo(name = "member_since") val memberSince: Long,
    @ColumnInfo(name = "synced_at") val syncedAt: Long  // metadata — not a business field
)
```

```kotlin
// Domain Model — pure business representation, zero framework dependencies
data class User(
    val id: String,
    val name: String,
    val email: String,
    val avatarUrl: String?,
    val isPremium: Boolean,
    val memberSince: Instant
)
```

```kotlin
// Mapper extensions — live in the data module, not the domain module

// DTO → Domain (in :data module)
fun UserDto.toDomain(): User = User(
    id = this.id,
    name = this.fullName,
    email = this.emailAddress,
    avatarUrl = this.profileImageUrl,
    isPremium = this.subscriptionTier != "free",
    memberSince = Instant.ofEpochMilli(this.createdAtMillis)
)

// Entity → Domain (in :data module)
fun UserEntity.toDomain(): User = User(
    id = this.id,
    name = this.name,
    email = this.email,
    avatarUrl = this.avatarUrl,
    isPremium = this.isPremium,
    memberSince = Instant.ofEpochMilli(this.memberSince)
)

// Domain → Entity (in :data module)
fun User.toEntity(syncedAt: Long = System.currentTimeMillis()): UserEntity = UserEntity(
    id = this.id,
    name = this.name,
    email = this.email,
    avatarUrl = this.avatarUrl,
    isPremium = this.isPremium,
    memberSince = this.memberSince.toEpochMilli(),
    syncedAt = syncedAt
)
```

```kotlin
// ❌ Single model for everything — coupling nightmare
@Entity(tableName = "users")
@JsonClass(generateAdapter = true)
data class User(
    @PrimaryKey
    @Json(name = "id") val id: String,
    @ColumnInfo(name = "name")
    @Json(name = "full_name") val name: String,     // Which name? API or DB?
    @ColumnInfo(name = "email")
    @Json(name = "email_address") val email: String,
    @ColumnInfo(name = "subscription_tier")
    @Json(name = "subscription_tier") val subscriptionTier: String,  // Leaked API detail
    @ColumnInfo(name = "synced_at")
    @Transient val syncedAt: Long = 0L  // DB metadata leaking into domain
)
// This class changes when the API changes, when the schema changes,
// AND when business logic changes — triple responsibility
```

#### Anti-patterns

The "shared model" anti-pattern uses one data class for the API, database, and domain. It seems efficient but creates a class with annotations from three frameworks, nullable fields for API responses, metadata fields for the database, and business methods for the domain. Any change to the API forces recompilation of every ViewModel and Composable that uses this class. The three-model approach isolates changes to their layer.

Another anti-pattern is mapping too eagerly. Some teams map from DTO to domain model to UI model for every single field pass-through. If the domain model and UI model are identical, skip the UI model. Mapping should add value — transformation, filtering, combining — not just rename fields.

**Key takeaway:** DTOs mirror the API, entities mirror the database, and domain models represent business concepts. Map at boundaries using extension functions. This isolation ensures that API changes don't ripple through your entire codebase.

### Lesson 5.3: Repository Interfaces in Domain

This is one of the most critical architectural decisions in Clean Architecture, and getting it wrong undermines the entire layer separation. The Repository interface must be defined in the domain layer, not the data layer. The data layer implements the interface, but the interface itself lives in the domain module. This is Dependency Inversion in action — the inner layer (domain) defines the contract, and the outer layer (data) fulfills it.

Why does the interface location matter so much? Because it determines the direction of dependencies. If the Repository interface lives in the data module, the domain module must depend on the data module to reference it. That violates the fundamental rule of Clean Architecture: inner layers must never depend on outer layers. The domain layer would suddenly know about the data module — and by extension, about Retrofit, Room, and every other framework in the data layer. The whole point of the domain layer's purity is lost.

When the Repository interface lives in the domain module, the dependency flows correctly: the data module depends on the domain module (to implement the interface), and the domain module depends on nothing. The UI module depends on the domain module (to call Use Cases and reference domain models), and it never touches the data module directly. The dependency graph is a clean DAG (Directed Acyclic Graph) with domain at the center, never pointing outward.

This architecture provides a concrete benefit during data layer changes. Consider a team migrating from REST to GraphQL. The `UserRepository` interface in the domain module defines `fun observeUser(id: String): Flow<User>` and `suspend fun refreshUser(id: String)`. The REST implementation in `UserRepositoryImpl` uses Retrofit. The new GraphQL implementation in `UserGraphQLRepository` uses Apollo. Both implement the same interface. The migration is a single line change in the DI module — swap the binding from `UserRepositoryImpl` to `UserGraphQLRepository`. Zero changes in the domain layer. Zero changes in any ViewModel. Zero risk of breaking business logic.

The interface design itself follows important rules. Repository interfaces should return domain models, not DTOs or entities. They should use `Flow<T>` for observable data and `suspend fun` for one-shot operations. They should not expose implementation details like cache policies, retry counts, or database transaction options. The interface is a contract that says "what data is available" — not "how the data is obtained."

Method naming in Repository interfaces should reflect domain concepts, not data operations. Instead of `queryUserFromDatabase(id)` or `fetchUserFromApi(id)`, use `observeUser(id)` and `refreshUser(id)`. The caller doesn't need to know — and shouldn't know — whether data comes from a database, API, or in-memory cache. If the Repository's API surface reveals its implementation strategy, the abstraction is leaking.

One subtle but important guideline: the Repository interface in the domain module should not import any Android or framework types. No `Context`, no `LiveData`, no `PagingSource`. If the Repository needs to return paginated data, define a domain-level pagination model. If it needs connectivity information, inject a domain-level `ConnectivityChecker` interface. The domain module's `build.gradle` uses `org.jetbrains.kotlin.jvm`, not `com.android.library` — it physically cannot import Android types, and that's the point.

The practical impact of this design on team velocity is significant. When the domain module is stable (interfaces rarely change), feature teams can work independently. The team building the profile screen codes against `UserRepository` — they don't care whether it's backed by REST, GraphQL, or a flat file. The data team can refactor internals, swap databases, change API clients — none of it breaks feature development. The interface is the contract, and as long as it holds, the teams are decoupled.

```kotlin
// Domain module — pure Kotlin, no Android dependencies
// build.gradle.kts
// plugins { id("org.jetbrains.kotlin.jvm") }  // NOT com.android.library

// Repository interface defined in domain
interface UserRepository {
    fun observeUser(id: String): Flow<User>
    fun observeUsers(): Flow<List<User>>
    suspend fun refreshUser(id: String)
    suspend fun updateUser(user: User)
    suspend fun deleteUser(id: String)
}

interface OrdersRepository {
    fun observeOrders(userId: String): Flow<List<Order>>
    fun observeRecentOrders(userId: String): Flow<List<Order>>
    suspend fun placeOrder(items: List<OrderItem>): Order
    suspend fun cancelOrder(orderId: String)
}

interface NotificationsRepository {
    fun observeUnreadCount(userId: String): Flow<Int>
    fun observeNotifications(userId: String): Flow<List<Notification>>
    suspend fun markAsRead(notificationId: String)
    suspend fun markAllAsRead(userId: String)
}
```

```kotlin
// Data module — implements the domain interface
// build.gradle.kts
// plugins { id("com.android.library") }
// dependencies { implementation(project(":domain")) }  // data depends on domain

class UserRepositoryImpl(
    private val remoteDataSource: UserRemoteDataSource,
    private val localDataSource: UserLocalDataSource
) : UserRepository {  // implements domain interface

    override fun observeUser(id: String): Flow<User> =
        localDataSource.observeUser(id).filterNotNull()

    override fun observeUsers(): Flow<List<User>> =
        localDataSource.observeAllUsers()

    override suspend fun refreshUser(id: String) {
        try {
            val user = remoteDataSource.fetchUser(id)
            localDataSource.saveUser(user)
        } catch (e: Exception) {
            // cached data remains valid
        }
    }

    override suspend fun updateUser(user: User) {
        val updated = remoteDataSource.updateUser(user)
        localDataSource.saveUser(updated)
    }

    override suspend fun deleteUser(id: String) {
        remoteDataSource.deleteUser(id)
        localDataSource.deleteUser(id)
    }
}
```

```kotlin
// DI module — wires interface to implementation
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    abstract fun bindUserRepository(impl: UserRepositoryImpl): UserRepository

    @Binds
    abstract fun bindOrdersRepository(impl: OrdersRepositoryImpl): OrdersRepository

    @Binds
    abstract fun bindNotificationsRepository(
        impl: NotificationsRepositoryImpl
    ): NotificationsRepository
}

// Swapping implementations is a one-line change:
// @Binds abstract fun bindUserRepository(impl: UserGraphQLRepository): UserRepository
```

```kotlin
// ❌ Repository interface in data module — broken dependency direction
// data/src/main/kotlin/com/app/data/UserRepository.kt
interface UserRepository {
    fun observeUser(id: String): Flow<User>  // defined in data module
}

// domain/build.gradle.kts
// dependencies { implementation(project(":data")) }  // ❌ domain depends on data!
// Now domain knows about the data module — Clean Architecture is broken

// ✅ Repository interface in domain module — correct dependency direction
// domain/src/main/kotlin/com/app/domain/repository/UserRepository.kt
interface UserRepository {
    fun observeUser(id: String): Flow<User>  // defined in domain module
}

// data/build.gradle.kts
// dependencies { implementation(project(":domain")) }  // ✅ data depends on domain
// data implements what domain defines — dependency flows inward
```

```kotlin
// ❌ Repository interface leaking implementation details
interface UserRepository {
    fun queryUserFromDatabase(id: String): Flow<UserEntity>     // leaks Room entity
    suspend fun fetchUserFromApi(id: String): Response<UserDto>  // leaks Retrofit type
    fun getUserWithCachePolicy(id: String, ttlMs: Long): Flow<User>  // leaks caching strategy
}

// ✅ Repository interface expressing domain concepts only
interface UserRepository {
    fun observeUser(id: String): Flow<User>       // domain model, no framework types
    suspend fun refreshUser(id: String)            // abstract — could be API, WebSocket, anything
    suspend fun updateUser(user: User)             // domain model in, no DTO/entity
}
```

#### Common Mistakes

The most common mistake is putting the Repository interface in the data module "because that's where the implementation is." This creates a dependency from domain to data, breaking the clean architecture dependency rule. Always define the interface where it's consumed (domain), not where it's implemented (data). The implementation depends on the interface, not the other way around.

Another mistake is exposing framework-specific types in the Repository interface. If `observeUser()` returns `LiveData<User>`, the domain module needs the Android lifecycle library — which defeats the purpose of keeping it as pure Kotlin. Use `Flow<T>` instead — it's a Kotlin-only type that works everywhere.

**Key takeaway:** Repository interfaces belong in the domain module, not the data module. This enforces the dependency rule: inner layers define contracts, outer layers implement them. The domain module stays pure Kotlin with zero Android dependencies.

### Lesson 5.4: Structuring the Domain Layer

The domain layer is often the smallest layer in the codebase, but its structure has outsized impact on maintainability. A poorly organized domain layer — with fifty Use Cases in a flat directory and models scattered across packages — becomes as hard to navigate as the God Activity. A well-organized domain layer groups related concepts into features, making it immediately obvious which Use Cases, models, and repository interfaces belong together.

The recommended approach is organizing by feature, not by type. The "by type" approach creates directories like `usecases/`, `models/`, and `repositories/` at the top level. This means `GetUserUseCase`, `GetOrdersUseCase`, `GetNotificationsUseCase`, and `PlaceOrderUseCase` all live in the same `usecases/` directory. To understand the user feature, you need to look in three directories. The "by feature" approach creates `user/`, `orders/`, and `notifications/` directories, each containing its own Use Cases, models, and repository interface. Everything about the user feature is in one place.

The feature-based structure maps naturally to team ownership. The "user" feature team owns the `user/` package — they can add Use Cases, modify domain models, and evolve the repository interface without conflicting with the "orders" team. In the type-based structure, every team contributes to the same `usecases/` directory, creating merge conflicts and unclear ownership.

Inside each feature package, the structure is minimal. A typical feature has: the repository interface, one or more domain models, and zero to three Use Cases. Not every feature needs Use Cases. If the user feature is simple CRUD with no complex business logic, the `user/` package might contain only `UserRepository.kt` and `User.kt`. Use Cases are added when the complexity justifies them — not as a default. This is an important mindset shift from "every feature must have Use Cases" to "Use Cases exist to serve a purpose."

Shared domain concepts — models and interfaces used across features — go in a `common/` or `shared/` package. An `Amount` value class used by both `orders/` and `payments/` lives in `common/model/`. A `PaginationConfig` used by multiple repositories lives in `common/`. But be conservative about what goes in `common/` — if something is only used by one feature, it belongs in that feature's package, even if you think it might be reused someday.

The domain module's `build.gradle` is perhaps its most distinctive characteristic. It uses the `org.jetbrains.kotlin.jvm` plugin, not `com.android.library`. This is not just a build optimization — it's an architectural firewall. The domain module cannot import `android.content.Context`, `android.os.Bundle`, or any other Android type. If a developer tries to use `LiveData`, `WorkManager`, or `Room` in the domain module, it won't compile. This compile-time enforcement is far more reliable than code review — it makes the wrong thing impossible rather than just discouraged.

The module's dependency list should be minimal. In a typical project, the domain module depends on Kotlin standard library, `kotlinx-coroutines-core` (for `Flow` and `suspend`), and potentially a serialization library if domain models need serialization. That's it. No Hilt, no Dagger, no Retrofit, no Room. If the domain module has more than three dependencies, something is leaking in from the outer layers.

One pattern that works well for complex domains is the "result type" pattern. Instead of throwing exceptions, domain operations return sealed interfaces that represent all possible outcomes. A `LoginResult` can be `Success`, `InvalidCredentials`, `AccountLocked`, or `NetworkError`. This makes error handling explicit at the type level — the compiler forces every caller to handle every case. It also eliminates the ambiguity of "which exceptions can this function throw?" — the answer is encoded in the return type.

```kotlin
// Domain module structure — organized by feature
// domain/
//   src/main/kotlin/com/app/domain/
//     user/
//       User.kt
//       UserRepository.kt
//       GetProfileWithStatsUseCase.kt
//     orders/
//       Order.kt
//       OrderItem.kt
//       OrderStatus.kt
//       OrdersRepository.kt
//       PlaceOrderUseCase.kt
//       CalculatePriceUseCase.kt
//     notifications/
//       Notification.kt
//       NotificationsRepository.kt
//     auth/
//       Session.kt
//       Credentials.kt
//       AuthRepository.kt
//       LoginUseCase.kt
//       LoginResult.kt
//     common/
//       Amount.kt
//       PaginationConfig.kt
//       DomainError.kt

// Each feature is self-contained — all related types in one package
package com.app.domain.orders

data class Order(
    val id: String,
    val items: List<OrderItem>,
    val status: OrderStatus,
    val createdAt: Instant,
    val total: Long
)

data class OrderItem(
    val productId: String,
    val name: String,
    val price: Long,
    val quantity: Int
)

enum class OrderStatus {
    PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED
}

interface OrdersRepository {
    fun observeOrders(userId: String): Flow<List<Order>>
    fun observeRecentOrders(userId: String): Flow<List<Order>>
    suspend fun placeOrder(items: List<OrderItem>): Order
    suspend fun cancelOrder(orderId: String)
}
```

```kotlin
// ❌ Organized by type — hard to navigate, unclear ownership
// domain/
//   usecases/
//     GetUserUseCase.kt
//     GetOrdersUseCase.kt
//     PlaceOrderUseCase.kt
//     LoginUseCase.kt
//     GetNotificationsUseCase.kt
//     CalculatePriceUseCase.kt
//   models/
//     User.kt
//     Order.kt
//     OrderItem.kt
//     Notification.kt
//     Session.kt
//   repositories/
//     UserRepository.kt
//     OrdersRepository.kt
//     NotificationsRepository.kt
//     AuthRepository.kt

// To understand "orders", you look in 3 directories
// Team boundaries are unclear — everyone touches usecases/
```

```kotlin
// Domain module build.gradle.kts — pure Kotlin, no Android
plugins {
    id("org.jetbrains.kotlin.jvm")  // NOT com.android.library
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    // That's it. No Hilt, no Room, no Retrofit, no Android SDK.
}
```

```kotlin
// Result type pattern — explicit error handling in domain
package com.app.domain.auth

sealed interface LoginResult {
    data class Success(val session: Session) : LoginResult
    data class InvalidCredentials(val attemptsRemaining: Int) : LoginResult
    data object AccountLocked : LoginResult
    data class NetworkError(val message: String) : LoginResult
}

class LoginUseCase(
    private val authRepository: AuthRepository,
    private val sessionRepository: SessionRepository
) {
    suspend operator fun invoke(credentials: Credentials): LoginResult {
        if (credentials.email.isBlank() || credentials.password.length < 8) {
            return LoginResult.InvalidCredentials(attemptsRemaining = -1)
        }

        return try {
            val session = authRepository.login(credentials)
            sessionRepository.saveSession(session)
            LoginResult.Success(session)
        } catch (e: InvalidCredentialsException) {
            LoginResult.InvalidCredentials(attemptsRemaining = e.remainingAttempts)
        } catch (e: AccountLockedException) {
            LoginResult.AccountLocked
        } catch (e: Exception) {
            LoginResult.NetworkError(e.message ?: "Login failed")
        }
    }
}
```

```kotlin
// Common domain types — shared across features
package com.app.domain.common

@JvmInline
value class Amount(val cents: Long) {
    fun toDisplayString(): String = "$${cents / 100}.${"%02d".format(cents % 100)}"
    operator fun plus(other: Amount): Amount = Amount(cents + other.cents)
    operator fun times(multiplier: Int): Amount = Amount(cents * multiplier)
}

sealed interface DomainError {
    data class Network(val message: String) : DomainError
    data class NotFound(val resource: String, val id: String) : DomainError
    data class Unauthorized(val reason: String) : DomainError
    data class Validation(val field: String, val message: String) : DomainError
}
```

#### Anti-patterns

The "anemic domain" anti-pattern is when domain models are just data holders with no behavior, and all logic lives in Use Cases. If `Order` has a `calculateTotal()` method that depends only on its own `items`, that method belongs on the `Order` class, not in a Use Case. Domain models can and should have methods that operate on their own data.

Another anti-pattern is creating a `BaseUseCase<Input, Output>` abstract class that all Use Cases extend. This adds unnecessary inheritance, makes Use Cases harder to understand at a glance, and provides no real benefit. Each Use Case is simple enough — a class with an `invoke` method — that a base class is just noise.

**Key takeaway:** Organize the domain layer by feature, not by type. Keep the domain module pure Kotlin with the `kotlin.jvm` plugin. Use result types for explicit error handling. The domain layer should be the most stable, most testable layer in your app.

### Lesson 5.5: Layer Separation with Modules

Gradle modules are the enforcement mechanism for Clean Architecture. You can write architecture guidelines in a wiki and hope developers follow them, or you can encode the rules in the build system so that violations don't compile. When the domain module doesn't have Retrofit on its classpath, a developer literally cannot import `retrofit2.Response` — the IDE shows a red underline, and the build fails. This is the difference between "please don't do this" and "you can't do this."

The standard module structure for Clean Architecture has three core modules: `:domain`, `:data`, and `:app`. The `:domain` module contains repository interfaces, domain models, and Use Cases. The `:data` module contains repository implementations, data sources, Room database, Retrofit API interfaces, DTOs, and entities. The `:app` module contains the DI setup (Hilt modules that bind interfaces to implementations), navigation, and the Application class. Feature modules (`:feature:chat`, `:feature:profile`) contain ViewModels and UI components.

The dependency graph follows strict rules. Feature modules depend on `:domain` (to call Use Cases and reference domain models). The `:data` module depends on `:domain` (to implement repository interfaces). The `:app` module depends on everything (to wire DI bindings). Critically, `:domain` depends on nothing except Kotlin standard library and coroutines. And no feature module depends on `:data` — features access data exclusively through domain interfaces wired by DI.

This module structure provides a concrete benefit beyond just architecture hygiene: build performance. When a developer changes a Room entity in the `:data` module, only `:data` and `:app` recompile. The `:domain` module and all feature modules are untouched because they don't depend on `:data`. In a large project with twenty feature modules, this can reduce incremental build times from 90 seconds to 15 seconds. The module boundary acts as a recompilation firewall — changes are isolated to the modules they affect.

For larger projects, the core infrastructure splits into specialized modules. `:core:network` provides the Retrofit/Ktor instance, interceptors, and base API configuration. `:core:database` provides the Room database instance, base DAOs, and type converters. `:core:common` provides shared utilities, extension functions, and base classes. Data modules split by feature: `:data:user`, `:data:orders`, `:data:notifications`. Each data module depends on `:domain` and the relevant `:core` modules.

The feature module structure deserves special attention. A feature module like `:feature:chat` contains the ViewModel, Compose screens, navigation routes, and any feature-specific UI utilities. It depends on `:domain` for Use Cases and models. It does not depend on `:data`, `:core:network`, or `:core:database`. The feature team works exclusively with domain interfaces — they don't know or care whether messages come from REST, WebSocket, or a local file. This isolation also means feature modules can be developed and tested independently.

Inter-module communication is a challenge in modular projects. Feature modules can't depend on each other (that would create circular dependencies), so navigation between features goes through a shared navigation module or a navigator interface defined in `:domain`. The chat feature doesn't import the profile feature — it declares a `NavigateToProfile(userId: String)` event, and the `:app` module's navigation graph handles the actual navigation. This keeps features completely decoupled.

One mistake teams make is creating too many modules too early. A project with five screens doesn't need twenty Gradle modules. Start with the three-module core (`:domain`, `:data`, `:app`) and extract feature modules when a feature grows large enough to benefit from isolation. Each new module adds build configuration overhead, increases IDE indexing time, and requires DI wiring. The right time to extract a feature module is when it has its own ViewModel, multiple screens, and at least one developer who primarily works on it.

Another consideration is test modules. Each module should be testable independently. `:domain` tests run with plain JUnit — no Android runner, no Robolectric, no emulator. They execute in milliseconds. `:data` tests mock the data sources and verify Repository coordination logic. Feature module tests mock Use Cases and verify ViewModel behavior. Only `:app` needs instrumentation tests for integration testing. This testing pyramid naturally emerges from the module structure.

```kotlin
// Module dependency configuration

// domain/build.gradle.kts
plugins {
    id("org.jetbrains.kotlin.jvm")
}
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}

// data/build.gradle.kts
plugins {
    id("com.android.library")
    id("com.google.devtools.ksp")
    id("dagger.hilt.android.plugin")
}
dependencies {
    implementation(project(":domain"))  // data depends on domain
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    // Framework dependencies live here — not in domain
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("androidx.room:room-ktx:2.6.0")
    ksp("androidx.room:room-compiler:2.6.0")
}

// feature/chat/build.gradle.kts
plugins {
    id("com.android.library")
    id("dagger.hilt.android.plugin")
}
dependencies {
    implementation(project(":domain"))  // feature depends on domain ONLY
    // NO dependency on :data, :core:network, or :core:database
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.2")
    implementation("androidx.compose.runtime:runtime:1.5.4")
}
```

```kotlin
// app/build.gradle.kts — the wiring module
plugins {
    id("com.android.application")
    id("dagger.hilt.android.plugin")
}
dependencies {
    implementation(project(":domain"))
    implementation(project(":data"))
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    implementation(project(":feature:chat"))
    implementation(project(":feature:profile"))
    implementation(project(":feature:orders"))
    // App module sees everything — it wires DI bindings
}
```

```kotlin
// ❌ Feature module depending on data — breaks isolation
// feature/chat/build.gradle.kts
dependencies {
    implementation(project(":domain"))
    implementation(project(":data"))  // ❌ Now the chat feature knows about Room and Retrofit
}

// This allows a developer to bypass the repository and call the DAO directly:
class ChatViewModel(
    private val messageDao: MessageDao  // ❌ direct database access from feature module
) : ViewModel()

// ✅ Feature module depending only on domain — proper isolation
dependencies {
    implementation(project(":domain"))  // ✅ Only domain interfaces and models
}

class ChatViewModel(
    private val observeMessages: ObserveMessagesUseCase,  // ✅ domain interface
    private val sendMessage: SendMessageUseCase            // ✅ domain interface
) : ViewModel()
```

```kotlin
// Inter-module navigation — features don't depend on each other
// domain/src/main/kotlin/com/app/domain/navigation/Navigator.kt
interface AppNavigator {
    fun navigateToProfile(userId: String)
    fun navigateToChat(chatId: String)
    fun navigateToOrderDetail(orderId: String)
    fun navigateBack()
}

// feature/chat/src/main/kotlin/com/app/feature/chat/ChatViewModel.kt
class ChatViewModel(
    private val navigator: AppNavigator,
    private val observeMessages: ObserveMessagesUseCase
) : ViewModel() {

    fun onUserAvatarClicked(userId: String) {
        navigator.navigateToProfile(userId)  // doesn't know about profile module
    }
}

// app/src/main/kotlin/com/app/navigation/AppNavigatorImpl.kt
class AppNavigatorImpl(
    private val navController: NavController
) : AppNavigator {
    override fun navigateToProfile(userId: String) {
        navController.navigate("profile/$userId")
    }
    override fun navigateToChat(chatId: String) {
        navController.navigate("chat/$chatId")
    }
    override fun navigateToOrderDetail(orderId: String) {
        navController.navigate("order/$orderId")
    }
    override fun navigateBack() {
        navController.popBackStack()
    }
}
```

```kotlin
// Testing benefits of module separation

// Domain test — runs in milliseconds, no Android dependencies
class CalculatePriceUseCaseTest {
    private val fakePromoRepo = FakePromoRepository()
    private val useCase = CalculatePriceUseCase(fakePromoRepo)

    @Test
    fun `applies percentage discount correctly`() = runTest {
        fakePromoRepo.setPromo("SAVE10", PromoResult.Valid(discountPercent = 10))

        val items = listOf(CartItem("p1", "Widget", 1000L, 2))
        val result = useCase(items, "SAVE10")

        assertEquals(2000L, result.subtotal)
        assertEquals(200L, result.discount)
        assertEquals(1800L + result.tax + result.shipping, result.total)
    }

    @Test
    fun `free shipping over 50 dollars`() = runTest {
        val items = listOf(CartItem("p1", "Expensive Widget", 6000L, 1))
        val result = useCase(items, null)

        assertEquals(0L, result.shipping)
    }
}

// Data test — mocks data sources, verifies coordination
class UserRepositoryImplTest {
    private val fakeRemote = FakeUserRemoteDataSource()
    private val fakeLocal = FakeUserLocalDataSource()
    private val repository = UserRepositoryImpl(fakeRemote, fakeLocal)

    @Test
    fun `refreshUser fetches from remote and saves locally`() = runTest {
        val user = User("1", "Alice", "a@b.com", null, false, Instant.now())
        fakeRemote.users["1"] = user

        repository.refreshUser("1")

        assertEquals(user, fakeLocal.getUser("1"))
    }
}
```

#### Common Mistakes

The most common mistake is making the `:app` module too heavy. Teams dump ViewModels, screens, business logic, and utilities into `:app` because "it has access to everything." The `:app` module should contain DI wiring, the Application class, and the main navigation graph — nothing else. All feature logic belongs in feature modules, and all business logic belongs in the domain module.

Another mistake is circular dependencies between feature modules. `:feature:chat` depends on `:feature:profile` to show user profiles, and `:feature:profile` depends on `:feature:chat` to show recent messages. This won't compile — Gradle doesn't allow circular dependencies. The fix is the navigator pattern: features communicate through a shared abstraction defined in `:domain`, and the `:app` module wires the actual navigation.

**Key takeaway:** Gradle modules enforce Clean Architecture rules at compile time. The domain module uses `kotlin.jvm` and has no Android dependencies. Feature modules depend only on domain. The data module implements domain interfaces. The app module wires everything together through DI.

### Quiz: Clean Architecture

#### When should you create a Use Case class?

- ❌ For every single Repository method — always wrap it
- ✅ When business logic is shared across ViewModels or complex enough to warrant its own class
- ❌ Only when the app has more than 10 screens
- ❌ Never — ViewModels should contain all business logic

> **Explanation:** Use Cases should encapsulate reusable or complex business logic. Creating a Use Case that simply delegates to a Repository with no additional logic is unnecessary indirection. Use them when logic is shared, coordinates multiple sources, or is complex.

#### What is the key characteristic of the domain layer in Clean Architecture?

- ❌ It depends on the Android framework
- ❌ It contains Retrofit and Room implementations
- ✅ It has zero Android dependencies — pure Kotlin only
- ❌ It directly accesses the database

> **Explanation:** The domain layer uses `org.jetbrains.kotlin.jvm` plugin, not `com.android.library`. It contains only interfaces, data models, and use cases in pure Kotlin. This makes business logic testable without Robolectric or Android instrumentation.

#### Which module dependency is FORBIDDEN in Clean Architecture?

- ❌ Feature module depending on domain module
- ❌ Data module depending on domain module
- ✅ Domain module depending on data module
- ❌ App module depending on feature modules

> **Explanation:** The domain layer must never depend on the data layer. The dependency rule says inner layers (domain) must not depend on outer layers (data, UI). The data layer implements interfaces defined in the domain layer, not the other way around.

### Coding Challenge: Build a Complete Use Case with Domain Models

Create a `GetDashboardUseCase` that combines user profile, recent orders, and unread notifications from three separate repositories. Include domain models, mapper functions, and typed error handling.

#### Solution

```kotlin
// Domain models
data class DashboardData(
    val userName: String,
    val memberSince: Instant,
    val recentOrders: List<RecentOrder>,
    val unreadNotifications: Int,
    val loyaltyPoints: Int
)

data class RecentOrder(
    val id: String,
    val itemCount: Int,
    val total: Long,
    val status: OrderStatus
)

// Use Case
class GetDashboardUseCase(
    private val userRepository: UserRepository,
    private val ordersRepository: OrdersRepository,
    private val notificationsRepository: NotificationsRepository
) {
    operator fun invoke(userId: String): Flow<DashboardResult> = combine(
        userRepository.observeUser(userId),
        ordersRepository.observeRecentOrders(userId),
        notificationsRepository.observeUnreadCount(userId)
    ) { user, orders, unreadCount ->
        DashboardResult.Success(
            DashboardData(
                userName = user.name,
                memberSince = user.createdAt,
                recentOrders = orders
                    .sortedByDescending { it.createdAt }
                    .take(5)
                    .map { order ->
                        RecentOrder(
                            id = order.id,
                            itemCount = order.items.size,
                            total = order.items.sumOf { it.price * it.quantity },
                            status = order.status
                        )
                    },
                unreadNotifications = unreadCount,
                loyaltyPoints = calculateLoyaltyPoints(orders, user.isPremium)
            )
        )
    }.catch { e ->
        emit(DashboardResult.Error(e.message ?: "Failed to load dashboard"))
    }

    private fun calculateLoyaltyPoints(orders: List<Order>, isPremium: Boolean): Int {
        val multiplier = if (isPremium) 2 else 1
        return orders.sumOf { it.items.sumOf { item -> item.price.toInt() } } * multiplier / 100
    }
}

sealed interface DashboardResult {
    data class Success(val data: DashboardData) : DashboardResult
    data class Error(val message: String) : DashboardResult
}
```

The Use Case coordinates three repositories, applies business logic (sorting, limiting to 5 orders, calculating loyalty points with premium multiplier), and returns a clean domain model. The ViewModel simply collects the result — it doesn't know which repositories are involved.

---
## Module 6: MVI Pattern Deep Dive

MVI (Model-View-Intent) builds on MVVM by adding strict structure around state management. While MVVM lets you mutate state from multiple places, MVI funnels all state changes through a single reducer function. This makes state transitions predictable, reproducible, and trivially testable. The tradeoff is more boilerplate — but for complex screens, the predictability is worth it.

---

### Lesson 6.1: Unidirectional Data Flow

Every architecture pattern tries to answer the same question: how does state change, and who's allowed to change it? In MVVM, the answer is pretty loose — your ViewModel exposes mutable state, and any function inside the ViewModel can update it. Call `setState` from `loadData()`, call it from `onRetry()`, call it from a callback three levels deep. It works fine until it doesn't. The moment you have a bug where the screen shows stale data, you start scrolling through every function that touches `_uiState` trying to figure out which one fired last. MVI's answer to this question is rigid and deliberate: state only changes through one function, and that function takes the current state plus an intent and returns the new state.

The core idea behind unidirectional data flow is that data moves in a single direction through your system — from user action to intent to reducer to state to UI — and never backwards. The View dispatches an Intent (a sealed class describing what happened), the Reducer processes that Intent against the current State and produces a new State, and the View observes the new State and renders it. There's no two-way binding, no observable property that the View can write back to directly. This one-way loop is what makes MVI state changes predictable. You can look at any state and trace exactly which intent produced it, because every state transition goes through the same chokepoint.

Let me show you what this looks like in practice. Here's the simplest possible MVI setup — a counter. It's trivial, but it shows the shape of the pattern clearly before we add real complexity.

```kotlin
data class CounterState(val count: Int = 0)

sealed interface CounterIntent {
    data object Increment : CounterIntent
    data object Decrement : CounterIntent
    data object Reset : CounterIntent
}

fun reduce(state: CounterState, intent: CounterIntent): CounterState = when (intent) {
    CounterIntent.Increment -> state.copy(count = state.count + 1)
    CounterIntent.Decrement -> state.copy(count = state.count - 1)
    CounterIntent.Reset -> state.copy(count = 0)
}
```

Notice what the reducer is — it's a pure function. No side effects, no coroutine launches, no repository calls. It takes state and intent, returns new state. Period. This is the heart of MVI and it's what makes the pattern so testable. You can write a unit test for every state transition without mocking anything: pass in a state, pass in an intent, assert on the output. No coroutine test dispatchers, no turbine, no flow collectors. Just function calls and assertions.

Now here's how the ViewModel ties the loop together. The ViewModel holds the current state, receives intents from the UI, runs them through the reducer, and emits the new state.

```kotlin
class CounterViewModel : ViewModel() {
    private val _state = MutableStateFlow(CounterState())
    val state: StateFlow<CounterState> = _state.asStateFlow()

    fun processIntent(intent: CounterIntent) {
        _state.update { currentState ->
            reduce(currentState, intent)
        }
    }
}
```

The `_state.update` call is atomic — it reads the current state, passes it to the reducer, and sets the result as the new state in one operation. This matters when you have rapid user interactions. If the user taps Increment three times quickly, each tap gets the latest state because `update` handles concurrency for you. Compare this to MVVM where you might have `_state.value = _state.value.copy(count = _state.value.count + 1)` — which technically has a race condition if two coroutines update simultaneously.

The UI side is straightforward — it collects state and dispatches intents. In Compose, the intent dispatch is just a lambda call.

```kotlin
@Composable
fun CounterScreen(viewModel: CounterViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column {
        Text("Count: ${state.count}")
        Button(onClick = { viewModel.processIntent(CounterIntent.Increment) }) {
            Text("Add")
        }
        Button(onClick = { viewModel.processIntent(CounterIntent.Reset) }) {
            Text("Reset")
        }
    }
}
```

Here's the thing people miss about unidirectional data flow — it's not just an organizational preference. It fundamentally changes how you debug problems. In MVVM, when the screen shows wrong data, you have to trace backwards from the state to figure out which of potentially dozens of functions mutated it. In MVI, you log the intents. Every state change has a corresponding intent that caused it, so you get a complete, ordered history of everything that happened. In production, teams log intents to crash reporting tools so they can replay exactly what the user did before a crash. That's something you simply cannot do with MVVM's scattered mutation model.

One pattern I've seen teams struggle with is deciding what counts as an Intent versus what's just internal logic. The rule is simple: if the UI triggered it, it's an Intent. If the system triggered it (a network response came back, a timer fired), it's also an Intent — but one that the ViewModel dispatches internally. Intents represent events that change state, regardless of where they originate. The key constraint is that they all flow through the same reducer, maintaining the single point of state transition.

**Key takeaway:** Unidirectional data flow means state changes only happen through a single reducer function. This creates a predictable, traceable, and testable state machine where every transition has a clear cause. The tradeoff is verbosity — you need an Intent for every possible state change — but for complex screens, the debugging and testing benefits far outweigh the extra code.

---

### Lesson 6.2: Side Effects in MVI

The reducer is a pure function. It takes state and intent, returns new state, and does nothing else. No network calls, no database writes, no analytics events, no navigation. This is a hard rule, not a suggestion. The moment you put a side effect inside a reducer, you lose every benefit MVI gives you — determinism, testability, and the ability to replay state transitions. But real apps are full of side effects. Users tap "Add to Cart" and you need to write to a database. They pull to refresh and you need to hit a network endpoint. So where do side effects actually go?

Side effects live in the ViewModel, outside the reducer. The pattern works like this: the ViewModel receives an Intent, runs it through the reducer to get the new state (which might be a "loading" state), then checks whether the intent requires a side effect. If it does, the ViewModel launches a coroutine to perform the side effect, and when the side effect completes, it dispatches a new Intent with the result. That result Intent goes through the reducer to produce the final state. The reducer remains pure throughout.

Here's a concrete example. A search screen where the user types a query, we show a loading indicator, fetch results from the network, and display them — or show an error.

```kotlin
data class SearchState(
    val query: String = "",
    val results: List<Product> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

sealed interface SearchIntent {
    data class QueryChanged(val query: String) : SearchIntent
    data class Search(val query: String) : SearchIntent
    data class SearchSuccess(val results: List<Product>) : SearchIntent
    data class SearchFailed(val error: String) : SearchIntent
}

fun reduce(state: SearchState, intent: SearchIntent): SearchState = when (intent) {
    is SearchIntent.QueryChanged -> state.copy(query = intent.query)
    is SearchIntent.Search -> state.copy(isLoading = true, error = null)
    is SearchIntent.SearchSuccess -> state.copy(
        results = intent.results,
        isLoading = false
    )
    is SearchIntent.SearchFailed -> state.copy(
        error = intent.error,
        isLoading = false
    )
}
```

Notice the reducer handles four intents, but none of them perform the actual search. `Search` just sets `isLoading = true`. The ViewModel is where the actual network call happens.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {
    private val _state = MutableStateFlow(SearchState())
    val state: StateFlow<SearchState> = _state.asStateFlow()

    fun processIntent(intent: SearchIntent) {
        _state.update { reduce(it, intent) }
        handleSideEffect(intent)
    }

    private fun handleSideEffect(intent: SearchIntent) {
        when (intent) {
            is SearchIntent.Search -> {
                viewModelScope.launch {
                    try {
                        val results = searchRepository.search(intent.query)
                        processIntent(SearchIntent.SearchSuccess(results))
                    } catch (e: Exception) {
                        processIntent(SearchIntent.SearchFailed(e.message ?: "Search failed"))
                    }
                }
            }
            else -> Unit
        }
    }
}
```

The side effect flow is: `Search` intent → reducer sets loading → `handleSideEffect` launches a coroutine → network call completes → `SearchSuccess` or `SearchFailed` intent dispatched → reducer produces final state. The reducer never sees the coroutine, the repository, or the exception. It just processes intents and returns state.

This separation gives you something powerful — you can test the reducer and the side effects independently. Reducer tests are pure function tests. Side effect tests mock the repository and verify that the right intents get dispatched.

```kotlin
class SearchReducerTest {
    @Test
    fun `Search intent sets loading and clears error`() {
        val state = SearchState(error = "Previous error")
        val result = reduce(state, SearchIntent.Search("kotlin"))
        
        assertTrue(result.isLoading)
        assertNull(result.error)
    }

    @Test
    fun `SearchSuccess clears loading and sets results`() {
        val state = SearchState(isLoading = true)
        val products = listOf(Product("1", "Kotlin Book"))
        val result = reduce(state, SearchIntent.SearchSuccess(products))
        
        assertFalse(result.isLoading)
        assertEquals(products, result.results)
    }
}
```

A common mistake I see is putting the side effect result directly into state without going through an intent. Something like `_state.update { it.copy(results = results, isLoading = false) }` inside the coroutine. This breaks the MVI contract. You now have two places that modify state — the reducer and the coroutine — and you've lost the ability to trace state changes through intents. It might seem like unnecessary ceremony to create `SearchSuccess` and `SearchFailed` intents just to feed them back into the reducer, but that ceremony is the whole point. Every state transition has a named intent, and that intent goes through the reducer. No exceptions.

Another pattern that comes up is one-time events — showing a snackbar, navigating to another screen, playing a sound. These aren't state in the traditional sense because they happen once and don't persist. If you put `showSnackbar = true` in your state, you have to remember to set it back to `false` after the snackbar is shown, which creates a second intent just for cleanup. The cleaner approach is to use a separate Channel for one-time effects.

```kotlin
class CheckoutViewModel(
    private val orderRepository: OrderRepository
) : ViewModel() {
    private val _state = MutableStateFlow(CheckoutState())
    val state: StateFlow<CheckoutState> = _state.asStateFlow()

    private val _effects = Channel<CheckoutEffect>(Channel.BUFFERED)
    val effects: Flow<CheckoutEffect> = _effects.receiveAsFlow()

    fun processIntent(intent: CheckoutIntent) {
        _state.update { reduce(it, intent) }
        handleSideEffect(intent)
    }

    private fun handleSideEffect(intent: CheckoutIntent) {
        when (intent) {
            is CheckoutIntent.PlaceOrder -> {
                viewModelScope.launch {
                    try {
                        val order = orderRepository.placeOrder(intent.cart)
                        processIntent(CheckoutIntent.OrderPlaced(order.id))
                        _effects.send(CheckoutEffect.NavigateToConfirmation(order.id))
                    } catch (e: Exception) {
                        processIntent(CheckoutIntent.OrderFailed(e.message ?: "Failed"))
                        _effects.send(CheckoutEffect.ShowError(e.message ?: "Order failed"))
                    }
                }
            }
            else -> Unit
        }
    }
}

sealed interface CheckoutEffect {
    data class NavigateToConfirmation(val orderId: String) : CheckoutEffect
    data class ShowError(val message: String) : CheckoutEffect
}
```

This keeps the state clean — it only contains data that the UI renders persistently — while effects handle the fire-and-forget events. The UI collects effects in a `LaunchedEffect` and handles them without polluting the state.

**Key takeaway:** Side effects never go inside the reducer. They live in the ViewModel (or middleware), and their results are fed back as new intents that the reducer processes. This keeps the reducer pure and testable while still allowing your app to interact with the outside world. Use a separate Channel for one-time effects like navigation and snackbars.

---

### Lesson 6.3: MVI with Middleware

As your MVI implementation grows, the `handleSideEffect` function in your ViewModel starts to bloat. Every new side effect — logging, analytics, network calls, caching, debouncing — gets shoved into the same when-block. You end up with a 200-line function that handles everything from API calls to crash reporting. Middleware solves this by breaking side effects into composable, reusable layers that sit between the intent dispatch and the reducer. Each middleware sees every intent, can perform its own side effects, and can emit new intents. The ViewModel stays thin and each concern gets its own class.

The concept comes from Redux in the JavaScript world, where middleware is a core part of the architecture. In Android MVI, middleware is a function or class that intercepts intents before or after they reach the reducer. Think of it like OkHttp interceptors — each middleware gets the intent, does something with it, and passes it along. You can chain multiple middleware together, and each one is independent of the others.

Here's a simple middleware interface and how the ViewModel wires them together:

```kotlin
fun interface Middleware<S, I> {
    suspend fun process(
        intent: I,
        currentState: S,
        dispatch: (I) -> Unit
    )
}

class MviViewModel<S, I>(
    private val initialState: S,
    private val reducer: (S, I) -> S,
    private val middlewares: List<Middleware<S, I>>
) : ViewModel() {
    private val _state = MutableStateFlow(initialState)
    val state: StateFlow<S> = _state.asStateFlow()

    fun processIntent(intent: I) {
        _state.update { reducer(it, intent) }

        viewModelScope.launch {
            middlewares.forEach { middleware ->
                middleware.process(intent, _state.value) { newIntent ->
                    processIntent(newIntent)
                }
            }
        }
    }
}
```

The flow is: intent arrives → reducer updates state immediately → each middleware sees the intent and current state → middleware can dispatch new intents which start the cycle again. This is a simplified version — production implementations often run middleware before the reducer, or both before and after, depending on the use case.

Now here's where middleware gets practical. Say you have a search feature and you want to debounce the user's typing. Without middleware, you'd put debounce logic inside the ViewModel's `handleSideEffect`, tangled with the actual search logic. With middleware, you write a `DebouncingMiddleware` that handles it independently.

```kotlin
class DebouncingMiddleware<S>(
    private val debounceMs: Long = 300L,
    private val shouldDebounce: (Any) -> Boolean,
    private val createDebouncedIntent: (Any) -> Any
) : Middleware<S, Any> {
    private var debounceJob: Job? = null

    override suspend fun process(
        intent: Any,
        currentState: S,
        dispatch: (Any) -> Unit
    ) {
        if (shouldDebounce(intent)) {
            debounceJob?.cancel()
            debounceJob = CoroutineScope(currentCoroutineContext()).launch {
                delay(debounceMs)
                dispatch(createDebouncedIntent(intent))
            }
        }
    }
}
```

Logging is another natural fit for middleware. Every app needs to track what users do — for analytics, crash reporting, and debugging. A logging middleware sees every intent that flows through the system without touching any business logic.

```kotlin
class LoggingMiddleware<S, I> : Middleware<S, I> {
    override suspend fun process(
        intent: I,
        currentState: S,
        dispatch: (I) -> Unit
    ) {
        Log.d("MVI", "Intent: $intent")
        Log.d("MVI", "State after: $currentState")
    }
}
```

In production, you'd send these to your analytics platform or crash reporting tool instead of Logcat. The point is that this concern is completely isolated. You can add or remove the logging middleware without changing a single line of business logic. And because every intent flows through it, you get complete coverage automatically — you never forget to add logging to a new feature.

Here's what a real feature looks like when you compose middleware together. An expense tracker with networking, analytics, and error handling, each in its own middleware.

```kotlin
class ExpenseNetworkMiddleware(
    private val repository: ExpenseRepository
) : Middleware<ExpenseState, ExpenseIntent> {
    override suspend fun process(
        intent: ExpenseIntent,
        currentState: ExpenseState,
        dispatch: (ExpenseIntent) -> Unit
    ) {
        when (intent) {
            is ExpenseIntent.AddExpense -> {
                try {
                    val saved = repository.save(
                        Expense(
                            id = UUID.randomUUID().toString(),
                            amount = intent.amount,
                            category = intent.category,
                            note = intent.note
                        )
                    )
                    dispatch(ExpenseIntent.ExpenseAdded(saved))
                } catch (e: Exception) {
                    dispatch(ExpenseIntent.Error(e.message ?: "Save failed"))
                }
            }
            is ExpenseIntent.DeleteExpense -> {
                try {
                    repository.delete(intent.id)
                } catch (e: Exception) {
                    dispatch(ExpenseIntent.Error(e.message ?: "Delete failed"))
                }
            }
            else -> Unit
        }
    }
}

class AnalyticsMiddleware(
    private val analytics: Analytics
) : Middleware<ExpenseState, ExpenseIntent> {
    override suspend fun process(
        intent: ExpenseIntent,
        currentState: ExpenseState,
        dispatch: (ExpenseIntent) -> Unit
    ) {
        when (intent) {
            is ExpenseIntent.AddExpense -> analytics.track("expense_added", 
                mapOf("category" to intent.category))
            is ExpenseIntent.DeleteExpense -> analytics.track("expense_deleted")
            is ExpenseIntent.FilterByCategory -> analytics.track("filter_applied",
                mapOf("category" to (intent.category ?: "all")))
            else -> Unit
        }
    }
}
```

The ViewModel becomes almost trivially simple — it just wires the reducer and middleware together.

```kotlin
class ExpenseViewModel(
    repository: ExpenseRepository,
    analytics: Analytics
) : MviViewModel<ExpenseState, ExpenseIntent>(
    initialState = ExpenseState(),
    reducer = ::reduce,
    middlewares = listOf(
        LoggingMiddleware(),
        ExpenseNetworkMiddleware(repository),
        AnalyticsMiddleware(analytics)
    )
)
```

A common mistake with middleware is creating circular dispatches — middleware A dispatches an intent that triggers middleware B, which dispatches an intent that triggers middleware A again. This creates infinite loops. The fix is simple: middleware should only dispatch "result" intents (like `ExpenseAdded`, `SearchSuccess`) that other middleware doesn't react to. If you find two middleware bouncing intents back and forth, one of them is doing too much.

Another anti-pattern is putting business logic in middleware that should be in the reducer. Middleware handles side effects — things that interact with the outside world. State transitions belong in the reducer. If your middleware is reading state fields and conditionally updating them, that logic should move to the reducer where it's deterministic and testable.

**Key takeaway:** Middleware decomposes side effects into composable, reusable layers. Each middleware handles one concern — networking, analytics, logging, debouncing — and the ViewModel stays thin. The pattern scales well because adding a new concern means adding a new middleware, not modifying existing code. Watch out for circular dispatches and keep business logic in the reducer.

---

### Lesson 6.4: MVI vs MVVM — Choosing the Right Pattern

I've seen teams adopt MVI project-wide because they read a blog post about unidirectional data flow, then spend weeks wrapping simple screens in intents and reducers that add nothing but boilerplate. I've also seen teams stick with MVVM long after their state management became a tangled mess because "MVVM is simpler." Both are wrong. The right answer depends on the screen, not the project. You can use MVVM for simple screens and MVI for complex ones in the same app. They're not competing religions — they're tools with different strength profiles.

MVVM works well when your screen has independent state fields that don't affect each other. A profile settings screen where the user can toggle dark mode, change their display name, and update their email — these are independent operations. Changing the display name doesn't affect the dark mode toggle. Each operation is a simple function in the ViewModel that updates one field. There's no complex state transition to get wrong.

```kotlin
// MVVM works fine here — independent state updates
class ProfileViewModel(
    private val userRepository: UserRepository
) : ViewModel() {
    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    fun updateDisplayName(name: String) {
        viewModelScope.launch {
            userRepository.updateName(name)
            _state.update { it.copy(displayName = name) }
        }
    }

    fun toggleDarkMode(enabled: Boolean) {
        viewModelScope.launch {
            userRepository.setDarkMode(enabled)
            _state.update { it.copy(darkMode = enabled) }
        }
    }

    fun updateEmail(email: String) {
        viewModelScope.launch {
            userRepository.updateEmail(email)
            _state.update { it.copy(email = email) }
        }
    }
}
```

MVI shines when state fields are interconnected — when changing one field requires updating multiple others atomically. A checkout screen is the classic example. When the user changes their shipping address, you need to recalculate tax, update available shipping methods, recalculate the shipping cost, check if the selected payment method is available in that region, and update the total. These five updates must happen atomically — if the UI renders between the tax update and the shipping cost update, the user sees an inconsistent total for a frame.

```kotlin
// MVI is better here — interconnected state transitions
fun reduce(state: CheckoutState, intent: CheckoutIntent): CheckoutState = when (intent) {
    is CheckoutIntent.ShippingAddressChanged -> {
        val newTax = calculateTax(state.cart, intent.address)
        val shippingOptions = getShippingOptions(intent.address)
        val defaultShipping = shippingOptions.first()
        val newTotal = state.subtotal + newTax + defaultShipping.cost
        state.copy(
            shippingAddress = intent.address,
            tax = newTax,
            availableShippingOptions = shippingOptions,
            selectedShipping = defaultShipping,
            total = newTotal,
            canPlaceOrder = state.paymentMethod != null
        )
    }
    is CheckoutIntent.PaymentMethodSelected -> {
        state.copy(
            paymentMethod = intent.method,
            canPlaceOrder = state.shippingAddress != null
        )
    }
    // ... other intents
}
```

The reducer updates all five fields in a single function call and returns a new state object. There's no intermediate state where tax is updated but shipping isn't. The UI gets the complete, consistent state in one emission.

Here's a practical decision framework I use. If a screen has fewer than 5 state fields and they're mostly independent, MVVM is fine. If a screen has interconnected state where changing one field cascades to others, use MVI. If you need to debug complex user flows or replay state transitions, use MVI. If the screen is a simple form or settings page, MVVM saves you from writing intents and reducers that add no value.

```kotlin
// The same app can use both patterns
// Simple screen → MVVM
class SettingsViewModel : ViewModel() {
    private val _state = MutableStateFlow(SettingsState())
    val state = _state.asStateFlow()

    fun setNotificationsEnabled(enabled: Boolean) {
        _state.update { it.copy(notificationsEnabled = enabled) }
    }
}

// Complex screen → MVI
class OrderViewModel : ViewModel() {
    private val _state = MutableStateFlow(OrderState())
    val state = _state.asStateFlow()

    fun processIntent(intent: OrderIntent) {
        _state.update { reduce(it, intent) }
        handleSideEffect(intent)
    }
}
```

One thing I want to be direct about: MVI does not make your code "better" by default. It makes complex state management safer and more predictable. But for simple screens, it makes your code worse — more boilerplate, more indirection, harder for new team members to follow. A `SettingsIntent.ToggleDarkMode` that goes through a reducer to do `state.copy(darkMode = !state.darkMode)` is strictly worse than calling `toggleDarkMode()` directly. You've added a sealed class, a when-branch, and a function call for zero benefit.

The real-world signal that tells you to switch from MVVM to MVI is when you start finding bugs caused by inconsistent state. If you've had bugs where the loading indicator stays visible after data loads, or the error message shows alongside valid results, or the "Place Order" button is enabled when the form is incomplete — these are signs that your state mutations are scattered and your state fields need to update together. That's when MVI pays for itself.

There's also a middle ground that works well — MVVM with a single state class and `update` blocks. You get the single state emission of MVI without the formal intent/reducer ceremony. Many teams use this and never need full MVI.

```kotlin
// MVVM with disciplined state management — the middle ground
class CartViewModel(private val repository: CartRepository) : ViewModel() {
    private val _state = MutableStateFlow(CartState())
    val state = _state.asStateFlow()

    fun addItem(product: Product) {
        _state.update { current ->
            val updatedItems = current.items + CartItem(product, 1)
            current.copy(
                items = updatedItems,
                subtotal = updatedItems.sumOf { it.product.price * it.quantity },
                itemCount = updatedItems.size
            )
        }
    }

    fun removeItem(productId: String) {
        _state.update { current ->
            val updatedItems = current.items.filter { it.product.id != productId }
            current.copy(
                items = updatedItems,
                subtotal = updatedItems.sumOf { it.product.price * it.quantity },
                itemCount = updatedItems.size
            )
        }
    }
}
```

This approach updates all related fields atomically inside the `update` lambda, preventing inconsistent state. You don't get the formal intent logging and replay of full MVI, but you avoid 90% of the state consistency bugs. For most teams, this is the sweet spot.

**Key takeaway:** MVI and MVVM are tools, not ideologies. Use MVI when state fields are interconnected and need atomic updates, when you need intent logging for debugging, or when multiple developers work on the same complex screen. Use MVVM for simple, independent state updates. The middle ground — MVVM with atomic `update` blocks — covers most cases without the ceremony of full MVI.

---

### Lesson 6.5: Testing MVI Reducers

Testing is where MVI truly pays for itself. In MVVM, testing a ViewModel means dealing with coroutines, flow collectors, test dispatchers, and mock repositories. You're testing behavior through side effects — call a function, collect the flow, assert on the emitted values. It works, but every test has ceremony. In MVI, the reducer is a pure function. No coroutines, no flows, no mocks. Pass in a state, pass in an intent, assert on the output. That's it. You can write 50 reducer tests in the time it takes to set up one MVVM ViewModel test properly.

Here's what reducer testing looks like at its simplest. Given a state and an intent, what's the resulting state? No test harness, no @Before setup, no injected dependencies.

```kotlin
class LoginReducerTest {
    @Test
    fun `EmailChanged updates email and clears error`() {
        val state = LoginState(error = "Invalid credentials")
        val result = reduce(state, LoginIntent.EmailChanged("user@test.com"))

        assertEquals("user@test.com", result.email)
        assertNull(result.error)
    }

    @Test
    fun `SubmitLogin sets loading and clears error`() {
        val state = LoginState(
            email = "user@test.com",
            password = "pass123",
            error = "Old error"
        )
        val result = reduce(state, LoginIntent.SubmitLogin)

        assertTrue(result.isLoading)
        assertNull(result.error)
    }

    @Test
    fun `LoginFailed clears loading and sets error`() {
        val state = LoginState(isLoading = true)
        val result = reduce(state, LoginIntent.LoginFailed("Invalid credentials"))

        assertFalse(result.isLoading)
        assertEquals("Invalid credentials", result.error)
    }
}
```

Each test is 3-4 lines. No setup, no mocking, no dispatchers. This is the kind of test that developers actually write because there's zero friction. I've worked on projects where the ViewModel had 200+ lines of business logic and exactly zero tests because setting up the test was too painful. With MVI, the same business logic lives in a reducer that takes 5 minutes to cover completely.

But the real power shows up when you test state transitions — sequences of intents that exercise the full flow. This is where you catch bugs that individual intent tests miss. What happens when the user types a query, starts a search, types a new query, and the first search result comes back? Does the state correctly reflect the second query, not the first?

```kotlin
class SearchReducerTest {
    @Test
    fun `full search flow produces correct state at each step`() {
        var state = SearchState()

        // User types query
        state = reduce(state, SearchIntent.QueryChanged("kotlin"))
        assertEquals("kotlin", state.query)
        assertFalse(state.isLoading)

        // User submits search
        state = reduce(state, SearchIntent.Search("kotlin"))
        assertTrue(state.isLoading)

        // User changes query while search is in flight
        state = reduce(state, SearchIntent.QueryChanged("kotlin coroutines"))
        assertEquals("kotlin coroutines", state.query)
        assertTrue(state.isLoading) // still loading from first search

        // First search results arrive
        val results = listOf(Product("1", "Kotlin in Action"))
        state = reduce(state, SearchIntent.SearchSuccess(results))
        assertFalse(state.isLoading)
        assertEquals(results, state.results)
        assertEquals("kotlin coroutines", state.query) // query preserved
    }
}
```

This test tells a story — it walks through a realistic user interaction and verifies that every intermediate state is correct. You can read it like a script of what the user did and what the screen showed at each step. These sequential tests are incredibly effective at catching edge cases that you'd never think to test individually.

Testing interconnected state updates is where MVI reducer tests really prove their value. In the checkout example from the previous lesson, changing a shipping address updates five fields simultaneously. Testing this in MVVM means mocking a repository, launching a coroutine, collecting a flow, and hoping the timing works out. In MVI, it's one function call.

```kotlin
class CheckoutReducerTest {
    @Test
    fun `ShippingAddressChanged updates tax, shipping, and total atomically`() {
        val state = CheckoutState(
            subtotal = 10000L,
            tax = 800L,
            selectedShipping = ShippingOption("Standard", 500L),
            total = 11300L
        )

        val newAddress = Address(state = "CA", zip = "90210")
        val result = reduce(state, CheckoutIntent.ShippingAddressChanged(newAddress))

        // All fields update together
        assertEquals(newAddress, result.shippingAddress)
        assertEquals(725L, result.tax) // CA tax rate
        assertNotNull(result.selectedShipping)
        assertEquals(
            result.subtotal + result.tax + result.selectedShipping!!.cost,
            result.total
        )
    }

    @Test
    fun `total is always consistent — no field can be out of sync`() {
        var state = CheckoutState(subtotal = 10000L)

        // Apply multiple intents in sequence
        state = reduce(state, CheckoutIntent.ShippingAddressChanged(
            Address(state = "CA", zip = "90210")
        ))
        state = reduce(state, CheckoutIntent.ShippingMethodSelected(
            ShippingOption("Express", 1500L)
        ))
        state = reduce(state, CheckoutIntent.CouponApplied(
            Coupon("SAVE10", 1000L)
        ))

        // Total must equal subtotal + tax + shipping - discount at every step
        val expectedTotal = state.subtotal + state.tax +
            state.selectedShipping!!.cost - state.discount
        assertEquals(expectedTotal, state.total)
    }
}
```

That second test is a property test — it verifies an invariant that must always hold, regardless of which intents are applied. The total must always equal the sum of its parts. You can extend this idea with property-based testing frameworks like Kotest to generate random sequences of intents and verify that the invariant holds for all of them.

Testing side effects requires a different approach since they live outside the reducer. For side effects, you're back to ViewModel testing with mocks and coroutines — but the scope is narrower because the side effect handler only dispatches intents.

```kotlin
class SearchViewModelTest {
    @Test
    fun `Search intent triggers repository call and dispatches result`() = runTest {
        val repository = mockk<SearchRepository>()
        val products = listOf(Product("1", "Kotlin in Action"))
        coEvery { repository.search("kotlin") } returns products

        val viewModel = SearchViewModel(repository)
        viewModel.processIntent(SearchIntent.Search("kotlin"))

        advanceUntilIdle()

        // Verify the final state reflects SearchSuccess
        val state = viewModel.state.value
        assertEquals(products, state.results)
        assertFalse(state.isLoading)
    }

    @Test
    fun `Search failure dispatches error intent`() = runTest {
        val repository = mockk<SearchRepository>()
        coEvery { repository.search(any()) } throws IOException("Network error")

        val viewModel = SearchViewModel(repository)
        viewModel.processIntent(SearchIntent.Search("kotlin"))

        advanceUntilIdle()

        val state = viewModel.state.value
        assertFalse(state.isLoading)
        assertEquals("Network error", state.error)
    }
}
```

A common mistake in MVI testing is over-testing the reducer with trivial assertions. Testing that `QueryChanged("foo")` sets `query` to `"foo"` is a tautology — you're testing that `copy(query = "foo")` works. Focus your tests on meaningful behavior: state transitions that involve multiple fields, edge cases where intents arrive in unexpected orders, and invariants that must always hold. Don't write tests for `copy()`.

Another anti-pattern is testing internal implementation details of the reducer. Your tests should assert on the output state, not on how the reducer computed it. If you refactor the reducer to use helper functions or restructure the when-block, your tests should still pass without changes. Test behavior, not implementation.

The testing strategy for MVI is simple: reducer tests cover all state transitions (pure function tests, no mocks), middleware tests verify side effects in isolation (mock external dependencies), and integration tests verify the full ViewModel flow (limited, focused on critical paths). This layered approach gives you high coverage with minimal test maintenance.

**Key takeaway:** MVI reducers are pure functions, making them the easiest code in your app to test. Write sequential intent tests that tell a story, verify invariants that must always hold, and skip trivial copy-field assertions. Test side effects separately with mocks. The testing ease alone often justifies choosing MVI for complex screens.

---

### Quiz: MVI Pattern

#### What makes MVI different from MVVM?

- ❌ MVI does not use ViewModel
- ❌ MVI allows bidirectional data flow
- ✅ MVI enforces strict unidirectional data flow with a reducer function for all state transitions
- ❌ MVI eliminates the need for state management

> **Explanation:** MVI adds a strict unidirectional flow where all state changes go through a single reducer function. This makes state transitions predictable and easy to debug, unlike MVVM where state can be mutated from multiple places.

#### Where do side effects (network calls, database writes) happen in MVI?

- ❌ Inside the Reducer function
- ✅ Outside the Reducer, in the ViewModel's coroutine scope or Middleware, with results fed back as new Intents
- ❌ In the View layer
- ❌ Side effects are not allowed in MVI

> **Explanation:** The Reducer must remain a pure function — no side effects. Side effects happen in the ViewModel or Middleware, and their results are dispatched as new Intents that the Reducer processes to update state.

#### When should you choose MVI over MVVM?

- ❌ Always — MVI is strictly better than MVVM
- ❌ Only for apps with more than 20 screens
- ✅ When state fields are interconnected and changing one field requires updating multiple others atomically
- ❌ Only when using Jetpack Compose

> **Explanation:** MVI's reducer ensures that interconnected state fields update atomically. When changing a shipping address requires recalculating tax, shipping cost, and available payment methods simultaneously, the reducer handles this in a single function call, preventing inconsistency.

---

### Coding Challenge: Build a Complete MVI Feature

Implement a complete MVI pattern for an expense tracker with intents for adding expenses, filtering by category, and calculating totals. Include a reducer, side effects for persisting to a repository, and unit tests for the reducer.

#### Solution

```kotlin
data class Expense(val id: String, val amount: Long, val category: String, val note: String)

data class ExpenseState(
    val expenses: List<Expense> = emptyList(),
    val selectedCategory: String? = null,
    val filteredExpenses: List<Expense> = emptyList(),
    val totalAmount: Long = 0,
    val isAdding: Boolean = false
)

sealed interface ExpenseIntent {
    data class AddExpense(val amount: Long, val category: String, val note: String) : ExpenseIntent
    data class ExpenseAdded(val expense: Expense) : ExpenseIntent
    data class FilterByCategory(val category: String?) : ExpenseIntent
    data class DeleteExpense(val id: String) : ExpenseIntent
    data class ExpensesLoaded(val expenses: List<Expense>) : ExpenseIntent
}

fun reduce(state: ExpenseState, intent: ExpenseIntent): ExpenseState = when (intent) {
    is ExpenseIntent.AddExpense -> state.copy(isAdding = true)
    is ExpenseIntent.ExpenseAdded -> {
        val updated = state.expenses + intent.expense
        val filtered = applyFilter(updated, state.selectedCategory)
        state.copy(
            expenses = updated,
            filteredExpenses = filtered,
            totalAmount = filtered.sumOf { it.amount },
            isAdding = false
        )
    }
    is ExpenseIntent.FilterByCategory -> {
        val filtered = applyFilter(state.expenses, intent.category)
        state.copy(
            selectedCategory = intent.category,
            filteredExpenses = filtered,
            totalAmount = filtered.sumOf { it.amount }
        )
    }
    is ExpenseIntent.DeleteExpense -> {
        val updated = state.expenses.filter { it.id != intent.id }
        val filtered = applyFilter(updated, state.selectedCategory)
        state.copy(
            expenses = updated,
            filteredExpenses = filtered,
            totalAmount = filtered.sumOf { it.amount }
        )
    }
    is ExpenseIntent.ExpensesLoaded -> {
        val filtered = applyFilter(intent.expenses, state.selectedCategory)
        state.copy(
            expenses = intent.expenses,
            filteredExpenses = filtered,
            totalAmount = filtered.sumOf { it.amount }
        )
    }
}

private fun applyFilter(expenses: List<Expense>, category: String?): List<Expense> =
    if (category == null) expenses else expenses.filter { it.category == category }

// Reducer tests
class ExpenseReducerTest {
    @Test
    fun `FilterByCategory updates filtered list and total`() {
        val state = ExpenseState(
            expenses = listOf(
                Expense("1", 5000, "Food", "Lunch"),
                Expense("2", 3000, "Transport", "Uber"),
                Expense("3", 7000, "Food", "Dinner")
            )
        )
        val result = reduce(state, ExpenseIntent.FilterByCategory("Food"))

        assertEquals(2, result.filteredExpenses.size)
        assertEquals(12000L, result.totalAmount)
        assertEquals("Food", result.selectedCategory)
    }
}
```
## Module 7: Modularization

Modularization is an organizational and architectural decision that should be driven by real pain — slow builds, merge conflicts, teams blocking each other, or code boundaries that keep getting violated. When done well, it gives you parallel builds, clear ownership, and the ability to reason about features in isolation. When done poorly, it gives you 30 Gradle files to maintain, circular dependency headaches, and build times that somehow got worse.

---

### Lesson 7.1: Module Types and Naming Conventions

Before you create a single module, you need a clear taxonomy. Every module in your project should fit into a well-defined type, and anyone reading the `settings.gradle.kts` should immediately understand what each module contains and what it depends on. Without this discipline, modularization devolves into a random collection of folders with unclear boundaries. I've seen projects with modules named `common`, `shared`, `base`, `utils`, and `helpers` — all containing overlapping code with no clear ownership. That's not modularization, that's just moving the mess into more directories.

There are six primary module types in a well-structured Android project, and each has a specific responsibility. The **App module** (`:app`) is the entry point. It wires everything together through dependency injection, holds the Application class, the manifest, and the navigation graph. It depends on everything but nothing depends on it. The **Feature modules** (`:feature:*`) contain the UI, ViewModel, and presentation logic for a single feature. A feature module owns one user-facing flow — catalog browsing, checkout, user profile. It depends on domain and core modules but never on other feature modules. The **Domain module** (`:domain`) holds business logic, use cases, and domain models. It's a pure Kotlin module — no Android dependencies, no framework code. This makes it trivially testable and reusable across platforms if you ever move to KMP.

The **Core modules** (`:core:*`) provide shared infrastructure — networking, database, preferences, analytics, UI components. Each core module handles one technical concern. The **Data modules** (`:data:*` or embedded in core) implement repository interfaces defined in domain, handling the actual data fetching and caching. The **UI module** (`:core:ui`) holds shared design system components — theme, common composables, typography, colors — that feature modules use for consistent styling.

```kotlin
// settings.gradle.kts — clear taxonomy in the file structure
include(":app")

// Domain — pure Kotlin, no Android
include(":domain")

// Core — shared infrastructure
include(":core:network:api")
include(":core:network:impl")
include(":core:database")
include(":core:ui")
include(":core:navigation")
include(":core:contracts")
include(":core:analytics")
include(":core:preferences")
include(":core:testing")

// Features — one per user-facing flow
include(":feature:catalog")
include(":feature:cart")
include(":feature:checkout")
include(":feature:profile")
include(":feature:order-history")
include(":feature:search")

// Libraries — pure utility, no business logic
include(":lib:formatting")
include(":lib:image-loading")
```

Naming conventions matter more than you'd think. When you have 30+ modules, a consistent naming scheme is the difference between navigating the project easily and spending five minutes finding where something lives. The convention I've seen work best is `:<type>:<name>` — `:feature:cart`, `:core:network`, `:lib:formatting`. This creates a natural grouping in the IDE's project view and makes the dependency graph readable.

The `api/impl` split is critical for core modules that other modules depend on heavily. The `:core:network:api` module contains only the interfaces and data classes — the contract. The `:core:network:impl` module contains the actual Retrofit setup, interceptors, and implementation. Feature modules depend on `:core:network:api`, not the implementation. The `:app` module wires the implementation to the interface through DI. This prevents a cascade of recompilation: if you change an interceptor in `:core:network:impl`, only `:core:network:impl` and `:app` recompile. Every feature module that uses the network API is unaffected because the interface didn't change.

```kotlin
// :core:network:api — just the contract
interface ApiClient {
    suspend fun <T> get(endpoint: String, responseType: KClass<T>): T
    suspend fun <T> post(endpoint: String, body: Any, responseType: KClass<T>): T
}

data class NetworkConfig(
    val baseUrl: String,
    val timeoutMs: Long = 30_000,
    val retryCount: Int = 3
)

// :core:network:impl — the actual implementation
internal class RetrofitApiClient(
    private val config: NetworkConfig,
    private val okHttpClient: OkHttpClient,
    private val moshi: Moshi
) : ApiClient {
    override suspend fun <T> get(endpoint: String, responseType: KClass<T>): T {
        // Retrofit implementation — changes here don't recompile feature modules
    }

    override suspend fun <T> post(endpoint: String, body: Any, responseType: KClass<T>): T {
        // Retrofit implementation
    }
}
```

Notice the `internal` visibility on `RetrofitApiClient`. This is deliberate. The implementation class is `internal` to the `:core:network:impl` module, so no other module can accidentally depend on it directly. They must use the `ApiClient` interface from `:core:network:api`. Kotlin's `internal` visibility modifier is one of the most underappreciated tools for enforcing module boundaries. In Java, you'd need complex package-private gymnastics. In Kotlin, `internal` means "visible within this Gradle module" — exactly what you need.

A common mistake is creating "god modules" that accumulate unrelated code. The `:core:utils` module is the usual culprit — it starts with a few extension functions, then someone adds a date formatter, then a string helper, then a custom view, and before you know it every module in the project depends on `:core:utils` and any change to it triggers a full rebuild. If a utils module has more than 10-15 files, it's too big. Split it into specific modules: `:lib:formatting`, `:lib:date-utils`, `:core:extensions`. The goal is that each module has a clear, single responsibility and a name that tells you exactly what's inside.

Another anti-pattern is the "common" module that holds models shared across features. This sounds reasonable until you realize that adding a field to a shared model triggers recompilation across every feature that uses it. Better to define models where they're owned — in domain for business entities, in the feature module for UI-specific models, and in `:core:contracts` for cross-feature communication types.

**Key takeaway:** Define a clear taxonomy of module types (app, feature, core, domain, lib), follow consistent naming conventions (`:type:name`), use the `api/impl` split for core modules, and leverage Kotlin's `internal` visibility to enforce boundaries. Avoid god modules like `:core:utils` and split shared code into specific, focused modules.

---

### Lesson 7.2: Feature-Based vs Layer-Based Modules

This is the fundamental structural decision of modularization, and getting it wrong means a painful migration later. Layer-based modularization organizes by architectural layer — `:data`, `:domain`, `:presentation`. Feature-based modularization organizes by product feature — `:feature:catalog`, `:feature:cart`, `:feature:checkout`. Both have legitimate uses, but they optimize for very different things, and most production apps benefit more from feature-based structure.

Layer-based modularization groups all data access code together, all business logic together, and all UI code together. It looks clean in theory — three modules, clear separation of concerns. But in practice, every feature change touches all three modules. Adding a "wishlist" feature means adding code to `:data` (repository, DAO), `:domain` (use cases, models), and `:presentation` (ViewModel, screens). If two developers are building different features simultaneously, they're editing the same modules and creating merge conflicts. The data module becomes a bottleneck that everyone touches.

```kotlin
// Layer-based: looks organized, creates cross-team bottlenecks
// settings.gradle.kts
include(":app")
include(":data")        // Every feature's repositories, DAOs, API services
include(":domain")      // Every feature's use cases, business models
include(":presentation") // Every feature's ViewModels, screens, composables
```

Feature-based modularization flips this. Each feature module contains its own data, domain, and presentation layers internally. The wishlist feature is entirely inside `:feature:wishlist`. A developer working on wishlist never touches `:feature:cart` or `:feature:checkout`. There are no merge conflicts between feature teams. Each module can be built, tested, and reasoned about in isolation.

```kotlin
// Feature-based: isolated features, parallel team development
// settings.gradle.kts
include(":app")
include(":domain")         // shared business models and interfaces
include(":core:network:api")
include(":core:database")
include(":core:ui")
include(":feature:catalog")
include(":feature:cart")
include(":feature:wishlist")
include(":feature:checkout")
include(":feature:profile")
```

Inside a feature module, you still have layered organization — but it's scoped to that feature. The module has its own `data/`, `domain/`, and `ui/` packages. The key difference is that these are packages within one module, not separate Gradle modules. This means a change to the cart's data layer only recompiles the cart module, not a shared data module that every other feature depends on.

```kotlin
// :feature:cart internal structure
// feature/cart/data/CartRepository.kt
internal class CartRepositoryImpl(
    private val cartDao: CartDao,
    private val apiClient: ApiClient
) : CartRepository {
    override fun observeItems(): Flow<List<CartItem>> = cartDao.observeAll()
    override suspend fun addItem(product: Product, quantity: Int) {
        cartDao.insert(CartItemEntity(product.id, quantity))
        apiClient.post("cart/add", AddToCartRequest(product.id, quantity), Unit::class)
    }
}

// feature/cart/domain/CartUseCase.kt
internal class CalculateCartTotalUseCase(
    private val repository: CartRepository
) {
    operator fun invoke(): Flow<Long> = repository.observeItems()
        .map { items -> items.sumOf { it.price * it.quantity } }
}

// feature/cart/ui/CartViewModel.kt
internal class CartViewModel(
    private val calculateTotal: CalculateCartTotalUseCase,
    private val repository: CartRepository
) : ViewModel() {
    // presentation logic scoped to cart
}
```

Everything is `internal`. The cart's repository, use cases, and ViewModel are invisible to other modules. The only public surface of `:feature:cart` is whatever it exposes through `:core:contracts` for cross-feature communication (like the `CartProvider` interface). This is real encapsulation — not a convention that developers might follow, but a compiler-enforced boundary.

The tradeoff is real, though. Feature-based modularization can lead to code duplication. If both `:feature:cart` and `:feature:wishlist` need to display product cards, you have two choices: duplicate the composable in each feature module, or extract it into `:core:ui`. The right answer depends on how identical the implementations are. If they're truly the same component, extract it. If they look similar but have different behavior (cart cards have quantity controls, wishlist cards have remove buttons), keep them separate. Premature extraction creates coupled shared components that become hard to change because multiple features depend on them.

Layer-based modularization does have genuine advantages in smaller teams and simpler projects. When you have 2-3 developers working on the same features, the bottleneck argument doesn't apply — there's no team boundary being violated. And layer-based modules are easier to set up initially. The shared `:data` module gives you one place for all your repositories, one place for all your DAOs, one DI module for data layer dependencies. For apps with fewer than 10 features and a small team, this simplicity can outweigh the isolation benefits of feature-based modules.

The hybrid approach works well in practice — feature-based for product features, layer-based for shared infrastructure. Your core modules (`:core:network`, `:core:database`, `:core:ui`) are layer-based by nature. Your feature modules are feature-based. The shared `:domain` module holds business models that multiple features need. This gives you the isolation of feature-based modularization where it matters most (product features developed by different teams) while keeping shared infrastructure in logical layer-based modules.

A common mistake is starting with feature-based modularization before you have enough features to justify it. If your app has three screens, three feature modules plus core modules plus domain gives you 8+ Gradle files for what used to be one. Start with layer-based (or even a single module), and split into features when you hit the pain points — slow builds, merge conflicts, or teams needing to work independently. Premature modularization adds complexity without solving a real problem.

**Key takeaway:** Feature-based modularization provides isolation, parallel team development, and compiler-enforced encapsulation. Layer-based modularization is simpler and works for smaller teams. Most production apps use a hybrid — feature-based for product features, layer-based for shared infrastructure. Don't modularize by feature until you have real pain that justifies the overhead.

---

### Lesson 7.3: Managing Dependencies Between Modules

Module dependencies are the make-or-break of your architecture. Get them right and you have fast builds, clear ownership, and easy refactoring. Get them wrong and you have circular dependencies, full rebuilds on every change, and modules that can't be understood without reading three other modules first. The two principles that matter most are **low coupling** (modules depend on as few other modules as possible) and **high cohesion** (everything inside a module belongs together and serves a single purpose).

The dependency rule is simple: dependencies flow inward toward the domain and downward toward infrastructure. Feature modules depend on domain and core. Core modules depend on nothing or on other core modules. Domain depends on nothing — it's pure Kotlin. The app module depends on everything because it's the composition root that wires it all together. And the hard rule: **feature modules never depend on other feature modules**. This is the most important constraint in the entire module graph.

```kotlin
// :feature:checkout/build.gradle.kts
plugins {
    id("app.android.feature")
}

dependencies {
    implementation(project(":domain"))
    implementation(project(":core:contracts"))
    implementation(project(":core:network:api"))
    implementation(project(":core:ui"))
    implementation(project(":core:navigation"))

    // NEVER this — feature depending on feature
    // implementation(project(":feature:cart"))  // FORBIDDEN
    // implementation(project(":feature:profile")) // FORBIDDEN

    testImplementation(project(":core:testing"))
}
```

When `:feature:checkout` needs data from the cart (the items to purchase, the total), it can't import `:feature:cart` directly. Instead, it depends on a contract interface defined in `:core:contracts`, and the `:app` module wires the actual implementation at runtime through dependency injection. This is the Dependency Inversion Principle applied at the module level — checkout depends on an abstraction (the interface), not a concrete implementation (the cart module).

```kotlin
// :core:contracts — shared interface definitions
interface CartProvider {
    fun observeCartItems(): Flow<List<CartItem>>
    suspend fun getCartTotal(): Long
    suspend fun clearCart()
}

interface UserProfileProvider {
    suspend fun getCurrentUser(): User?
    suspend fun getDefaultShippingAddress(): ShippingAddress?
    suspend fun getDefaultPaymentMethod(): PaymentMethod?
}

// These data classes also live in :core:contracts
data class CartItem(
    val productId: String,
    val name: String,
    val price: Long,
    val quantity: Int
)
```

The implementation lives in the feature that owns the data. `:feature:cart` implements `CartProvider` because the cart module owns cart data. But the implementation is `internal` — only the `:app` module sees it through DI configuration.

```kotlin
// Inside :feature:cart — provides the implementation
internal class CartProviderImpl(
    private val cartRepository: CartRepository
) : CartProvider {
    override fun observeCartItems(): Flow<List<CartItem>> =
        cartRepository.observeAll().map { entities ->
            entities.map { it.toCartItem() }
        }

    override suspend fun getCartTotal(): Long =
        cartRepository.getAll().sumOf { it.price * it.quantity }

    override suspend fun clearCart() = cartRepository.deleteAll()
}
```

The `api` vs `implementation` Gradle configuration controls what's exposed to consuming modules. When you declare a dependency as `implementation`, it's only available within that module — transitive consumers don't see it. When you declare it as `api`, transitive consumers get access too. The rule of thumb is: use `implementation` by default, use `api` only when the dependency is part of your module's public API.

```kotlin
// :feature:catalog/build.gradle.kts
dependencies {
    // 'implementation' — Retrofit is an internal detail, consumers don't see it
    implementation(project(":core:network:impl"))

    // 'api' — domain models are part of catalog's public interface
    api(project(":domain"))

    // 'implementation' — UI components are used internally
    implementation(project(":core:ui"))
}
```

Using `api` carelessly creates a leaky abstraction problem. If `:feature:catalog` declares `:core:network:impl` as `api`, then any module that depends on `:feature:catalog` suddenly has access to Retrofit internals — something that was supposed to be encapsulated. Worse, changing the Retrofit version now triggers recompilation in modules that shouldn't care about networking at all. The build system has to check if any public API of the transitive dependency changed, even if the consuming module never imports anything from Retrofit.

Circular dependencies are the most common structural problem in modularized projects. Module A depends on Module B, and Module B depends on Module A — Gradle won't even compile this. It usually happens between feature modules (cart needs checkout's address picker, checkout needs cart's item list) or between core modules (network needs authentication, authentication needs network). The fix is always the same: extract the shared contract into a third module that both depend on.

```kotlin
// Before: circular dependency
// :feature:cart depends on :feature:checkout (for address selection)
// :feature:checkout depends on :feature:cart (for cart items)
// This won't compile.

// After: break the cycle with contracts
// :core:contracts defines both interfaces
interface CartProvider {
    fun observeCartItems(): Flow<List<CartItem>>
}

interface AddressProvider {
    suspend fun getSelectedAddress(): Address?
    suspend fun selectAddress(): Address // launches address picker
}

// :feature:cart implements CartProvider, depends on AddressProvider
// :feature:checkout implements AddressProvider, depends on CartProvider
// Both depend on :core:contracts, not on each other
```

The `:app` module is where all the wiring happens. It has visibility into every module and binds implementations to interfaces through Hilt or whatever DI framework you use.

```kotlin
// :app/di/ContractModule.kt — the composition root
@Module
@InstallIn(SingletonComponent::class)
abstract class ContractModule {
    @Binds abstract fun bindCartProvider(impl: CartProviderImpl): CartProvider
    @Binds abstract fun bindUserProfileProvider(impl: UserProfileProviderImpl): UserProfileProvider
    @Binds abstract fun bindAddressProvider(impl: AddressProviderImpl): AddressProvider
}
```

A common anti-pattern is the "dependency magnet" — a module that everything depends on, making it a compile-time bottleneck. `:domain` or `:core:ui` often becomes this. If you change a method signature in `:domain`, every feature module recompiles. The mitigation is keeping these widely-depended-on modules extremely stable. Don't put volatile code in `:domain`. Don't add experimental UI components to `:core:ui`. These modules should change rarely and predictably.

Another mistake is using runtime reflection or service locators to bypass module boundaries. If you find yourself using `Class.forName()` to access a class in another feature module, you're working around the architecture instead of working with it. The contract interface pattern handles every legitimate cross-module communication case. If it feels too verbose, that's a signal that your modules might be too granular, not that you need to break encapsulation.

**Key takeaway:** Dependencies flow inward toward domain and downward toward infrastructure. Feature modules never depend on each other — they communicate through contract interfaces in `:core:contracts`, wired by the `:app` module via DI. Use `implementation` by default, `api` only when a dependency is part of your public surface. Break circular dependencies by extracting shared interfaces into a third module.

---

### Lesson 7.4: Navigation Between Feature Modules

Navigation in a modularized app is harder than navigation in a single-module app. In a single module, you can reference any screen's Composable directly — `NavHost` has access to everything. In a modularized app, `:feature:cart` can't reference `CheckoutScreen` because it doesn't depend on `:feature:checkout`. You need an indirection layer that lets features declare their destinations and navigate to each other without direct dependencies. This is where the `:core:navigation` module comes in.

The navigation module sits in the core layer and does two things: it defines route contracts (the destinations that exist and the arguments they accept), and it provides a navigation API that feature modules use to navigate. The actual screen composables stay in their feature modules — the navigation module only knows about routes, not about UI.

```kotlin
// :core:navigation — route definitions
object Routes {
    const val CATALOG = "catalog"
    const val PRODUCT_DETAIL = "product/{productId}"
    const val CART = "cart"
    const val CHECKOUT = "checkout"
    const val PROFILE = "profile"
    const val ORDER_HISTORY = "orders"
    const val ORDER_DETAIL = "orders/{orderId}"

    fun productDetail(productId: String) = "product/$productId"
    fun orderDetail(orderId: String) = "orders/$orderId"
}
```

Each feature module registers its screens with the navigation graph through an extension function. The feature module depends on `:core:navigation` for the route constants and `NavGraphBuilder` extensions, but the navigation module doesn't depend on any feature.

```kotlin
// :feature:catalog — registers its own screens
fun NavGraphBuilder.catalogGraph(navController: NavController) {
    composable(Routes.CATALOG) {
        CatalogScreen(
            onProductClick = { productId ->
                navController.navigate(Routes.productDetail(productId))
            }
        )
    }
    composable(
        route = Routes.PRODUCT_DETAIL,
        arguments = listOf(navArgument("productId") { type = NavType.StringType })
    ) { backStackEntry ->
        val productId = backStackEntry.arguments?.getString("productId") ?: return@composable
        ProductDetailScreen(
            productId = productId,
            onAddToCart = { navController.navigate(Routes.CART) },
            onBack = { navController.popBackStack() }
        )
    }
}

// :feature:checkout — registers its screens
fun NavGraphBuilder.checkoutGraph(navController: NavController) {
    composable(Routes.CHECKOUT) {
        CheckoutScreen(
            onOrderPlaced = { orderId ->
                navController.navigate(Routes.orderDetail(orderId)) {
                    popUpTo(Routes.CART) { inclusive = true }
                }
            },
            onBack = { navController.popBackStack() }
        )
    }
}
```

The `:app` module assembles the full navigation graph by calling each feature's registration function. This is the only place where all features come together.

```kotlin
// :app — assembles the full navigation graph
@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Routes.CATALOG) {
        catalogGraph(navController)
        cartGraph(navController)
        checkoutGraph(navController)
        profileGraph(navController)
        orderHistoryGraph(navController)
    }
}
```

This pattern has a subtle but important property: feature modules navigate by route string, not by composable reference. When `:feature:catalog` calls `navController.navigate(Routes.CART)`, it doesn't know or care what `CartScreen` looks like or which module provides it. It just knows that a destination with that route exists. If you later reorganize the cart feature into a different module, no other feature needs to change as long as the route string stays the same.

For apps that need feature availability checks — maybe some features are behind a feature flag or require a paid subscription — the navigation module can hold a feature registry.

```kotlin
// :core:navigation — feature availability
interface FeatureRegistry {
    fun isFeatureEnabled(route: String): Boolean
}

class DefaultFeatureRegistry(
    private val featureFlags: FeatureFlags
) : FeatureRegistry {
    override fun isFeatureEnabled(route: String): Boolean = when (route) {
        Routes.ORDER_HISTORY -> featureFlags.isOrderHistoryEnabled()
        Routes.CHECKOUT -> featureFlags.isCheckoutEnabled()
        else -> true
    }
}

// Navigation wrapper that checks availability
fun NavController.navigateIfEnabled(
    route: String,
    registry: FeatureRegistry,
    fallback: () -> Unit = {}
) {
    if (registry.isFeatureEnabled(route)) {
        navigate(route)
    } else {
        fallback()
    }
}
```

For type-safe navigation, Jetpack Navigation 2.8+ supports Kotlin serialization-based routes. Instead of raw strings, you define route classes that carry their arguments with type safety.

```kotlin
// :core:navigation — type-safe route definitions
@Serializable
data object CatalogRoute

@Serializable
data class ProductDetailRoute(val productId: String)

@Serializable
data object CartRoute

@Serializable
data class OrderDetailRoute(val orderId: String)

// :feature:catalog uses typed routes
fun NavGraphBuilder.catalogGraph(navController: NavController) {
    composable<CatalogRoute> {
        CatalogScreen(
            onProductClick = { productId ->
                navController.navigate(ProductDetailRoute(productId))
            }
        )
    }
    composable<ProductDetailRoute> { backStackEntry ->
        val route = backStackEntry.toRoute<ProductDetailRoute>()
        ProductDetailScreen(
            productId = route.productId,
            onAddToCart = { navController.navigate(CartRoute) }
        )
    }
}
```

This eliminates the string-matching bugs where you mistype a route or pass the wrong argument type. The compiler catches errors at build time instead of crashing at runtime.

A common mistake is passing complex objects through navigation arguments. Navigation arguments should be IDs, not full objects. Don't serialize an entire `Product` into a navigation argument — pass the `productId` and let the destination screen load the product from the repository. Navigation arguments survive process death and configuration changes, so they should be small and serializable. A product ID is a string; a product object with images, descriptions, and pricing is a serialization nightmare waiting to break.

Another anti-pattern is feature modules holding direct references to `NavController`. This tightly couples the feature to Jetpack Navigation. Better to pass navigation actions as lambdas (`onProductClick: (String) -> Unit`) and let the app module or parent composable wire them to `NavController`. This keeps feature modules testable in isolation — you can test the screen by passing fake lambdas instead of setting up a real navigation graph.

**Key takeaway:** The `:core:navigation` module defines routes without knowing which screens implement them. Feature modules register their screens as navigation destinations via `NavGraphBuilder` extensions. The `:app` module assembles the complete graph. Navigate by route, not by composable reference. Pass IDs, not objects, through navigation arguments.

---

### Lesson 7.5: Build Configuration and Optimization

The number one reason teams modularize is build speed, and the number one reason modularization fails to deliver is bad build configuration. Splitting into 20 modules means nothing if every module applies the same heavyweight plugins, each one running its own annotation processor, with no caching strategy. I've seen projects where the modularized build was slower than the monolith because each module duplicated the entire build configuration stack. Getting the build right is at least as important as getting the module boundaries right.

Convention plugins are the foundation of scalable build configuration. Instead of copying the same 50 lines of `build.gradle.kts` into every module, you define shared build logic in custom Gradle plugins that modules apply with a single line. Google's Now in Android project popularized this pattern, and it's now the standard approach for multi-module Android projects.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply {
                apply("com.android.library")
                apply("org.jetbrains.kotlin.android")
                apply("com.google.dagger.hilt.android")
                apply("org.jetbrains.kotlin.plugin.compose")
            }

            extensions.configure<LibraryExtension> {
                compileSdk = 35
                defaultConfig {
                    minSdk = 26
                    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
                }
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
                buildFeatures {
                    compose = true
                }
            }

            dependencies {
                add("implementation", project(":core:ui"))
                add("implementation", project(":domain"))
                add("implementation", libs.findLibrary("hilt.android").get())
                add("ksp", libs.findLibrary("hilt.compiler").get())
                add("testImplementation", project(":core:testing"))
            }
        }
    }
}
```

Now every feature module's `build.gradle.kts` is just a few lines:

```kotlin
// :feature:catalog/build.gradle.kts
plugins {
    id("app.android.feature")
}

dependencies {
    implementation(project(":core:network:api"))
    implementation(project(":core:contracts"))
}
```

That's it. The convention plugin handles everything shared — SDK versions, Compose setup, Hilt configuration, common dependencies, test setup. When you need to bump `compileSdk` from 34 to 35, you change it in one place, not in 20 `build.gradle.kts` files. When you need to add a new plugin to all feature modules, you add it to the convention plugin. This eliminates configuration drift where modules slowly diverge in their build settings, causing subtle inconsistencies.

Version catalogs centralize dependency versions in a single TOML file. Every module references the catalog instead of hardcoding version strings.

```kotlin
// gradle/libs.versions.toml
[versions]
kotlin = "2.0.21"
compose-bom = "2024.12.01"
hilt = "2.52"
room = "2.6.1"
coroutines = "1.9.0"

[libraries]
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "compose-bom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
compose-material3 = { group = "androidx.compose.material3", name = "material3" }
hilt-android = { group = "com.google.dagger", name = "hilt-android", version.ref = "hilt" }
hilt-compiler = { group = "com.google.dagger", name = "hilt-compiler", version.ref = "hilt" }
room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }
coroutines-core = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-core", version.ref = "coroutines" }
coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }

[plugins]
android-application = { id = "com.android.application", version = "8.7.3" }
android-library = { id = "com.android.library", version = "8.7.3" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

Build caching is where the real speed gains come from. Gradle's build cache stores task outputs so that unchanged modules don't rebuild. But it only works if your build is deterministic — the same inputs produce the same outputs. Non-deterministic tasks (tasks that include timestamps, random values, or absolute paths in their output) poison the cache and force rebuilds. Enable the local build cache in `gradle.properties` and configure remote caching for CI.

```kotlin
// gradle.properties
org.gradle.caching=true
org.gradle.parallel=true
org.gradle.configureondemand=true
org.gradle.daemon=true
org.gradle.jvmargs=-Xmx4g -XX:+HeapDumpOnOutOfMemoryError

// For CI — remote cache configuration
// settings.gradle.kts
buildCache {
    local {
        isEnabled = true
    }
    remote<HttpBuildCache> {
        url = uri("https://your-cache-server/cache/")
        isPush = System.getenv("CI") != null
    }
}
```

Parallel builds are automatic with modularization — Gradle builds modules that don't depend on each other simultaneously. In a monolith, everything is sequential. With 15 feature modules that don't depend on each other, Gradle can compile all of them in parallel on your 8-core machine. This is the "free" build speed improvement you get from modularization, but only if your dependency graph actually allows parallelism. If every feature module depends on `:core:utils` and `:core:utils` takes 30 seconds to compile, all features wait for it before they can start.

The `implementation` vs `api` choice has direct build performance implications beyond encapsulation. When you change a module declared as `implementation`, only the immediate consumer recompiles. When you change a module declared as `api`, the consumer and everything that depends on the consumer recompiles. On a large project, one careless `api` declaration can turn a 2-minute incremental build into a 10-minute full rebuild. Audit your `api` declarations regularly — every one should be justified.

A common mistake is applying heavyweight plugins to modules that don't need them. Not every module needs Hilt, Compose, or Room. Your `:domain` module is pure Kotlin — it shouldn't apply the Android plugin at all. Your `:lib:formatting` module doesn't need Compose. Each unnecessary plugin adds configuration time and annotation processing overhead. Create separate convention plugins for different module types: `app.android.feature` (full Android + Compose + Hilt), `app.android.library` (Android library without Compose), `app.kotlin.library` (pure Kotlin, no Android), `app.android.test` (test utilities).

**Key takeaway:** Convention plugins eliminate build configuration duplication across modules. Version catalogs centralize dependency management. Build caching and parallel execution are the real speed wins, but they require a clean dependency graph and deterministic builds. Use `implementation` by default, apply only the plugins each module actually needs, and create separate convention plugins for different module types.

---

### Lesson 7.6: When to Modularize

Here's the most honest advice on modularization: don't do it until you have to. Every blog post and conference talk about modularization shows the end state — a clean dependency graph with 30 modules, each with clear ownership. What they don't show is the six months of migration pain, the build failures from circular dependencies nobody anticipated, and the team debates about which module owns the shared logic for formatting currency. Modularization is a solution to specific problems. If you don't have those problems, you're adding complexity for complexity's sake.

The three pain points that justify modularization are build times, team conflicts, and boundary violations. Build time is the most concrete one. If your incremental build takes more than 30-40 seconds and most changes only touch one feature, modularization lets Gradle skip recompiling everything else. A single-module app recompiles everything on every change because Gradle can't know that your change to `CartViewModel` doesn't affect `ProfileScreen`. With modules, Gradle knows exactly which modules changed and only recompiles those and their dependents.

Team conflicts happen when multiple developers edit the same files. In a single-module app, all ViewModels are in the same package. Two developers building different features create merge conflicts in the same directory, accidentally break each other's code, and block each other's pull requests. Modularization puts each feature in its own module with its own directory. Merge conflicts between features drop to near zero because the files don't overlap.

Boundary violations are the insidious one. You design a clean architecture with layers — data, domain, presentation. But in a single module, any file can import any other file. Nothing prevents a ViewModel from importing a DAO directly, bypassing the repository. Nothing prevents a screen composable from calling a network endpoint. Code reviews catch some violations, but they're human and they miss things. Modules enforce boundaries at compile time. If `:feature:cart` doesn't depend on `:core:database`, no file in the cart module can import a DAO. Period. The compiler is a better boundary enforcer than any code review process.

```kotlin
// In a single module, nothing prevents this violation
class CartViewModel(
    private val cartDao: CartDao  // Direct DAO access — skips the repository
) : ViewModel() {
    // Business logic mixed with data layer concerns
    fun addItem(product: Product) {
        viewModelScope.launch {
            cartDao.insert(CartItemEntity(product.id, 1))  // Should go through repository
        }
    }
}

// With modules, this won't compile if :feature:cart
// doesn't depend on :core:database
// The compiler enforces the boundary
```

Here's a practical migration approach for teams that decide to modularize. Don't try to split everything at once. Start by extracting one core module — typically `:core:ui` for your design system or `:core:network` for your API layer. Get the build working with that split. Then extract one feature module — pick the most independent feature, the one with the fewest dependencies on other features. Get that working. Now you have a pattern to follow, and you can extract more features incrementally, one per sprint. Each extraction is a small, reviewable pull request, not a massive refactor.

```kotlin
// Migration phases — incremental extraction
// Phase 1: Extract core modules
// settings.gradle.kts
include(":app")
include(":core:ui")      // shared composables, theme
include(":core:network")  // Retrofit, API client

// Phase 2: Extract most independent feature
include(":feature:profile")  // minimal dependencies on other features

// Phase 3: Extract features one by one
include(":feature:catalog")
include(":feature:cart")

// Phase 4: Extract domain when feature count justifies it
include(":domain")

// Phase 5: Split core modules further as needed
include(":core:network:api")
include(":core:network:impl")
include(":core:database")
include(":core:contracts")
```

The "don't modularize" case is just as valid. A solo developer or two-person team building an app with 5-10 screens gains almost nothing from modularization. The build is already fast because the app is small. There are no team conflicts because there's one team. Boundary violations are caught in code review because one person reviews everything. In this case, modularization adds 15 Gradle files, a build-logic module, convention plugins, and version catalogs — all for a project that was building fine in 10 seconds. That's overhead, not improvement.

There's also a timing consideration. Modularizing too early means you'll guess wrong about module boundaries. You don't know yet which features will be independent and which will be tightly coupled. You might create `:feature:cart` and `:feature:checkout` as separate modules, then discover that they share so much logic that the boundary is artificial and you spend more time maintaining the contract interfaces than you save. Better to wait until the codebase has enough history to reveal its natural seams — the places where code clusters together and has minimal connections to the rest.

A real-world signal I use: if you run `git log --since="3 months ago" --name-only` and see that 80% of commits only touch files in one feature area, that's a natural module boundary. If commits consistently span multiple feature areas, those features are coupled and splitting them into modules will create pain without benefit.

The metric that matters is build time impact. Before modularizing, measure your clean build time and your average incremental build time. After modularizing, measure again. If incremental builds didn't get faster, your module boundaries are wrong — modules are too coupled, or you have too many `api` dependencies causing cascading recompilation. Modularization is an optimization. Measure before and after, just like any other optimization.

**Key takeaway:** Modularize when you have specific pain — slow builds, merge conflicts between teams, or architectural boundary violations the compiler should enforce. Don't modularize preemptively, don't split everything at once, and measure build times before and after to verify the investment paid off. For small teams and small apps, a single module with good architecture is perfectly fine.

---

### Quiz: Modularization

#### Which module dependency is FORBIDDEN in a properly modularized project?

- ❌ Feature module depending on core:ui
- ❌ Feature module depending on domain
- ✅ Feature module depending on another feature module
- ❌ App module depending on feature modules

> **Explanation:** Feature modules must never depend on each other. This ensures encapsulation — features can't access each other's internals. Communication between features goes through contracts in shared modules, wired by the app module through DI.

#### What is the main advantage of feature-based modularization over layer-based?

- ❌ It requires fewer modules
- ✅ Teams can work on features independently without touching the same modules
- ❌ It eliminates the need for a domain layer
- ❌ It makes the app run faster

> **Explanation:** Feature-based modularization groups all code for a feature into one module. Two developers working on search and checkout never touch the same files. Layer-based modularization creates cross-team bottlenecks because every feature change touches the same data, domain, and presentation modules.

#### How should circular dependencies between feature modules be resolved?

- ❌ By merging the two feature modules into one
- ✅ By defining a contract interface in a shared module and wiring the implementation through DI in the app module
- ❌ By using reflection to access classes across modules
- ❌ By duplicating the shared code in both modules

> **Explanation:** Dependency inversion through contract interfaces breaks circular dependencies. Define the interface in `:core:contracts`, implement it in the providing module, and wire it through DI in `:app`. The consuming module depends only on the interface.

---

### Coding Challenge: Design a Complete Module Graph

Design the complete module structure for an e-commerce app with features for product catalog, shopping cart, checkout, user profile, and order history. Include settings.gradle.kts, build.gradle.kts for one feature module, and a contract interface for cross-feature communication.

#### Solution

```kotlin
// settings.gradle.kts
include(":app")
include(":domain")
include(":feature:catalog")
include(":feature:cart")
include(":feature:checkout")
include(":feature:profile")
include(":feature:order-history")
include(":core:network:api")
include(":core:network:impl")
include(":core:database")
include(":core:ui")
include(":core:navigation")
include(":core:contracts")
include(":core:testing")
include(":lib:formatting")

// :feature:checkout/build.gradle.kts
plugins {
    id("app.android.feature")
}

dependencies {
    implementation(project(":core:contracts"))  // for ShippingAddressProvider
    implementation(project(":core:network:api")) // for payment API
}

// :core:contracts — cross-feature interfaces
interface CartProvider {
    fun observeCartItems(): Flow<List<CartItem>>
    suspend fun getCartTotal(): Long
    suspend fun clearCart()
}

interface UserProfileProvider {
    suspend fun getCurrentUser(): User?
    suspend fun getDefaultPaymentMethod(): PaymentMethod?
    suspend fun getDefaultShippingAddress(): ShippingAddress?
}

// :feature:cart provides CartProvider implementation
internal class CartProviderImpl(
    private val cartRepository: CartRepository
) : CartProvider {
    override fun observeCartItems() = cartRepository.observeItems()
    override suspend fun getCartTotal() = cartRepository.getTotal()
    override suspend fun clearCart() = cartRepository.clear()
}

// :app wires it all
@Module
@InstallIn(SingletonComponent::class)
abstract class ContractModule {
    @Binds abstract fun bindCartProvider(impl: CartProviderImpl): CartProvider
    @Binds abstract fun bindUserProfileProvider(impl: UserProfileProviderImpl): UserProfileProvider
}
```

The module graph follows strict rules: features depend on `:domain`, `:core:*`, and `:core:contracts` — never on each other. Cross-feature communication uses contract interfaces. The `:app` module wires implementations to contracts.
## Module 8: Error Handling Across Layers

Error handling is where architecture either proves itself or collapses. A well-architected app handles errors at the right layer, presents meaningful messages to users, and never swallows exceptions silently. A poorly-architected app wraps everything in `try/catch(Exception)` and shows "Something went wrong" for every failure.

### Lesson 8.1: Exception Strategy — Top-Level vs Low-Level

Most Android codebases get error handling backwards. Developers scatter `try/catch` blocks across every function, every network call, every database query — wrapping everything in generic exception handlers "just to be safe." The result is an app that never crashes but also never works correctly, because exceptions are silently swallowed three layers below where anyone can observe them. The error vanishes, the user sees stale data, and nobody knows why.

The fundamental principle of exception handling in well-architected code is this: catching exceptions should happen at the top level of your codebase, not inside low-level APIs. This comes from a core insight — exceptions are meant to propagate. That's their entire purpose. When a low-level function catches an exception internally, it makes a decision about how to handle a failure that it doesn't have enough context to make. A network client doesn't know whether a 404 means "show an empty state" or "navigate back" — only the UI layer has that context. When the network client catches the exception and returns `null` instead, it strips away the information the higher layers need to make the right decision.

Think of exceptions like alarms in a building. If a fire alarm goes off in the basement and the basement janitor silences it without telling anyone, the building burns down. The alarm needs to propagate to the people who can act on it — evacuate the building, call the fire department, shut down the gas line. Low-level code is the basement janitor. It should let the alarm ring up to the top-level coordinators who have the full picture.

In practice, this means your Retrofit service, your Room DAO, and your DataStore wrapper should not catch exceptions internally. They should let exceptions propagate naturally to the boundary layer — typically the Repository — where they're converted into typed values. This conversion at the boundary is the key architectural decision. Below the boundary, exceptions flow freely. Above the boundary, everything is a typed result.

```kotlin
// ❌ Low-level API catching exceptions — loses information
class UserApi(private val retrofit: Retrofit) {
    suspend fun getUser(id: String): User? {
        return try {
            retrofit.create(UserService::class.java).getUser(id)
        } catch (e: Exception) {
            null // What happened? 401? 500? No network? We'll never know
        }
    }
}
```

```kotlin
// ✅ Low-level API lets exceptions propagate
class UserApi(private val service: UserService) {
    suspend fun getUser(id: String): UserDto = service.getUser(id)
}

// Boundary layer (Repository) catches and converts
class UserRepository(private val api: UserApi) {
    suspend fun getUser(id: String): AppResult<User> = safeApiCall {
        api.getUser(id).toDomain()
    }
}
```

The distinction between where exceptions originate and where they're handled creates a clear separation of concerns. The low-level API's job is to make the network call. The Repository's job is to translate infrastructure failures into domain-meaningful results. The ViewModel's job is to decide what the user sees. Each layer handles what it has the context to handle — nothing more.

There's an important nuance here that many developers miss. Not all exceptions are equal. Roman Elizarov, the lead designer of Kotlin coroutines, distinguishes between two categories. Condition exceptions are thrown based on business conditions — like throwing `InsufficientFundsException` when a payment fails a validation check. These are essentially control flow using the exception mechanism. Logical exceptions are thrown due to programming errors — null pointer dereferences, array index out of bounds, illegal argument values. The handling strategy differs dramatically between these two types.

For condition exceptions that your code deliberately throws, the right approach is to not throw them at all. Convert them into values at the boundary. Instead of throwing `InsufficientFundsException`, return `PaymentResult.InsufficientFunds`. This makes the error path explicit in the type system and forces callers to handle it. For logical exceptions — `NullPointerException`, `IllegalStateException`, `ClassCastException` — these represent bugs in your code. They should never be caught. Let them crash. A crash with a stack trace is infinitely more useful than a silently swallowed bug that manifests as mysterious data corruption three screens later.

```kotlin
// ❌ Using exceptions for business conditions — control flow via exceptions
fun processPayment(amount: Double, balance: Double): PaymentReceipt {
    if (amount > balance) throw InsufficientFundsException()
    if (amount <= 0) throw InvalidAmountException()
    return PaymentReceipt(amount, Date())
}

// Caller must remember to catch — nothing in the type system forces it
try {
    val receipt = processPayment(amount, balance)
    showSuccess(receipt)
} catch (e: InsufficientFundsException) {
    showError("Not enough funds")
} catch (e: InvalidAmountException) {
    showError("Invalid amount")
}
```

```kotlin
// ✅ Business conditions as values — explicit, type-safe, impossible to forget
fun processPayment(amount: Double, balance: Double): PaymentResult {
    if (amount <= 0) return PaymentResult.InvalidAmount
    if (amount > balance) return PaymentResult.InsufficientFunds(balance)
    return PaymentResult.Success(PaymentReceipt(amount, Date()))
}

sealed interface PaymentResult {
    data class Success(val receipt: PaymentReceipt) : PaymentResult
    data class InsufficientFunds(val currentBalance: Double) : PaymentResult
    data object InvalidAmount : PaymentResult
}

// Caller MUST handle all cases — compiler enforces it
when (val result = processPayment(amount, balance)) {
    is PaymentResult.Success -> showSuccess(result.receipt)
    is PaymentResult.InsufficientFunds -> showError("Balance: ${result.currentBalance}")
    is PaymentResult.InvalidAmount -> showError("Enter a valid amount")
}
```

Kotlin gives you two powerful tools for logical exception checking: `check()` and `requireNotNull()`. Use `check()` to verify that your code's internal state is valid — if the check fails, it's a programming error, not a user error. Use `requireNotNull()` to assert that a value you expect to be non-null is actually non-null. Both throw `IllegalStateException` or `IllegalArgumentException` respectively, which will crash the app with a clear message pointing to the exact line where the invariant was violated. This is intentional. A crash with a message like "User ID must not be null at CartViewModel.kt:42" is a gift to the developer debugging it at 2 AM.

```kotlin
// ✅ Using check and requireNotNull for programming errors
class CartViewModel(private val savedStateHandle: SavedStateHandle) : ViewModel() {
    
    private val userId: String = requireNotNull(savedStateHandle["userId"]) {
        "CartViewModel requires a userId in SavedStateHandle"
    }
    
    fun checkout(items: List<CartItem>) {
        check(items.isNotEmpty()) { "Cannot checkout with empty cart" }
        check(items.all { it.quantity > 0 }) { "All items must have positive quantity" }
        // proceed with checkout — we know the state is valid
    }
}
```

**Key takeaway:** Catch exceptions at the top level (Repository boundary), not inside low-level APIs. Convert business conditions into typed values using sealed classes. Let programming errors crash with `check()` and `requireNotNull()`. If you're only interested in success or failure and there's a single failure mode, return `null`. If there are multiple distinct failure modes, use a sealed class.

### Lesson 8.2: Result Types and the AppResult Pattern

Once you accept that exceptions should be converted to values at boundaries, the next question is: what should those values look like? Kotlin's standard library provides `kotlin.Result<T>`, but it's intentionally limited — it captures a `Throwable` for the failure case, which means you're still dealing with untyped exceptions. In a well-architected app, you want your error types to carry domain-meaningful information: error codes, user-facing messages, retry eligibility, and enough context for the UI layer to make informed decisions.

The `AppResult` pattern addresses this by creating a sealed interface that represents either success with data or failure with typed error information. Unlike `kotlin.Result`, which only gives you a `Throwable`, `AppResult` carries an `ErrorCode` enum that maps directly to user-facing behavior. A `NETWORK_ERROR` code means "show the offline banner and enable retry." An `UNAUTHORIZED` code means "navigate to the login screen." A `NOT_FOUND` code means "show a 'not found' empty state." The error code isn't just metadata — it's the contract between the data layer and the UI layer about what went wrong and what to do about it.

```kotlin
sealed interface AppResult<out T> {
    data class Success<T>(val data: T) : AppResult<T>
    data class Error(
        val message: String,
        val exception: Throwable? = null,
        val code: ErrorCode = ErrorCode.UNKNOWN
    ) : AppResult<Nothing>
}

enum class ErrorCode {
    NETWORK_ERROR,
    UNAUTHORIZED,
    NOT_FOUND,
    SERVER_ERROR,
    TIMEOUT,
    RATE_LIMITED,
    UNKNOWN
}
```

The design of `AppResult.Error` is deliberate. The `message` field is a developer-facing string useful for logging — never shown to users directly. The `exception` field is nullable and preserves the original exception for crash reporting tools like Firebase Crashlytics. The `code` field is the primary piece of information the ViewModel uses to decide what to show the user. This separation means the UI never constructs error messages from exception messages (which are often technical gibberish like "unexpected end of stream on Connection{api.example.com:443}") and instead uses the error code to select a localized string resource.

Here's an important design decision: `AppResult.Error` extends `AppResult<Nothing>`. The `Nothing` type means an `Error` value can be returned from any function regardless of its success type. A `fun getUser(): AppResult<User>` can return `AppResult.Error(...)` without any type casting because `Nothing` is a subtype of every type. This is a Kotlin type system feature that makes the sealed interface work elegantly across different return types.

```kotlin
// Extension functions make AppResult ergonomic to use
inline fun <T> AppResult<T>.onSuccess(action: (T) -> Unit): AppResult<T> {
    if (this is AppResult.Success) action(data)
    return this
}

inline fun <T> AppResult<T>.onError(action: (AppResult.Error) -> Unit): AppResult<T> {
    if (this is AppResult.Error) action(this)
    return this
}

fun <T> AppResult<T>.getOrNull(): T? = when (this) {
    is AppResult.Success -> data
    is AppResult.Error -> null
}

fun <T, R> AppResult<T>.map(transform: (T) -> R): AppResult<R> = when (this) {
    is AppResult.Success -> AppResult.Success(transform(data))
    is AppResult.Error -> this
}
```

The extension functions `onSuccess` and `onError` enable a fluent style that reads naturally in ViewModel code. Instead of `when` blocks everywhere, you can chain: `repository.getUser(id).onSuccess { _state.value = ... }.onError { handleError(it) }`. The `map` function lets you transform the success data without unwrapping — converting a `AppResult<UserDto>` to `AppResult<User>` without touching the error path. These extensions make the error handling code expressive without being verbose.

A common question is whether to use `AppResult` everywhere or only at specific boundaries. The answer is: only at the Repository boundary going up. Below the Repository — in API services, DAOs, and data sources — use regular return types and let exceptions propagate. Above the Repository — in Use Cases, ViewModels, and UI — use `AppResult`. Use Cases that don't need to add error logic can simply pass the `AppResult` through. Use Cases that coordinate multiple repositories can combine results.

```kotlin
// Use Case combining multiple AppResults
class GetOrderDetailsUseCase(
    private val orderRepo: OrderRepository,
    private val userRepo: UserRepository
) {
    suspend operator fun invoke(orderId: String): AppResult<OrderDetails> {
        val orderResult = orderRepo.getOrder(orderId)
        if (orderResult is AppResult.Error) return orderResult

        val order = (orderResult as AppResult.Success).data
        val userResult = userRepo.getUser(order.userId)

        return when (userResult) {
            is AppResult.Success -> AppResult.Success(
                OrderDetails(order, userResult.data)
            )
            is AppResult.Error -> AppResult.Success(
                OrderDetails(order, user = null) // Degrade gracefully
            )
        }
    }
}
```

Notice the design decision in the Use Case above. If the order fetch fails, the entire operation fails — we can't show order details without the order. But if the user fetch fails, we degrade gracefully — we still show the order, just without the user's name. This kind of partial-failure handling is only possible when errors are values. With exceptions, the user fetch failure would have short-circuited the entire operation, and you'd need nested `try/catch` blocks to implement graceful degradation.

One approach I want to explicitly caution against is returning `null` as a universal error signal. Returning `null` is appropriate when there's exactly one failure mode and the caller doesn't need to distinguish why it failed — for example, `fun findUserByEmail(email: String): User?` where `null` simply means "no user found." But when there are multiple distinct failure modes (network error vs. not found vs. unauthorized), returning `null` collapses all of them into a single "something failed" signal. The ViewModel can't show a meaningful error message because it doesn't know what went wrong. Use `null` for single-mode failures, sealed classes for multi-mode failures. This rule of thumb from Kotlin best practices keeps your error surfaces honest.

```kotlin
// ✅ Null for single failure mode — simple and appropriate
interface SearchRepository {
    suspend fun findUserByEmail(email: String): User? // null = not found, nothing else
}

// ✅ Sealed class for multiple failure modes — informative and type-safe
interface AuthRepository {
    suspend fun login(email: String, password: String): AppResult<AuthToken>
    // Could fail: invalid credentials, account locked, network error, server error
}
```

**Key takeaway:** `AppResult<T>` makes error handling explicit in the type system. Design it with a typed `ErrorCode` so the UI layer can map errors to user-facing behavior without parsing exception messages. Use `null` for single failure modes, `AppResult` for multiple failure modes. Keep `AppResult` at the Repository boundary and above — never inside low-level data sources.

### Lesson 8.3: Repository Error Mapping with safeApiCall

The `safeApiCall` wrapper is where the rubber meets the road in your error handling architecture. It's the single function that sits at the Repository boundary and converts raw infrastructure exceptions — `HttpException`, `IOException`, `SocketTimeoutException` — into typed `AppResult` values. Without it, every Repository function would have its own `try/catch` block, duplicating the same exception-to-error-code mapping logic dozens of times across your codebase. With it, the mapping is centralized, consistent, and testable.

The implementation is deceptively simple, but every line carries architectural weight. The function takes a suspend lambda, executes it inside a `try/catch`, and returns either `AppResult.Success` with the result or `AppResult.Error` with a mapped error code. The critical detail is the first `catch` clause: `CancellationException` must be re-thrown, never caught. This is one of the most important rules in Kotlin coroutines and one of the most commonly violated.

```kotlin
suspend fun <T> safeApiCall(call: suspend () -> T): AppResult<T> = try {
    AppResult.Success(call())
} catch (e: CancellationException) {
    throw e // NEVER catch — breaks structured concurrency
} catch (e: HttpException) {
    val code = when (e.code()) {
        401 -> ErrorCode.UNAUTHORIZED
        403 -> ErrorCode.UNAUTHORIZED
        404 -> ErrorCode.NOT_FOUND
        408 -> ErrorCode.TIMEOUT
        429 -> ErrorCode.RATE_LIMITED
        in 500..599 -> ErrorCode.SERVER_ERROR
        else -> ErrorCode.UNKNOWN
    }
    AppResult.Error("HTTP ${e.code()}: ${e.message()}", e, code)
} catch (e: IOException) {
    AppResult.Error("Network error: ${e.message}", e, ErrorCode.NETWORK_ERROR)
} catch (e: Exception) {
    AppResult.Error("Unexpected: ${e.message}", e, ErrorCode.UNKNOWN)
}
```

Why is re-throwing `CancellationException` so critical? Because `CancellationException` is how Kotlin coroutines implement cooperative cancellation. When a ViewModel is cleared (the user navigates away), `viewModelScope` cancels all its child coroutines by throwing `CancellationException` inside their suspension points. If your `safeApiCall` catches that exception and wraps it in `AppResult.Error`, the coroutine doesn't actually cancel. It continues executing, the Repository processes the "error," the ViewModel updates state for a screen that no longer exists, and you've created a resource leak. In production, this manifests as memory leaks, unnecessary network calls, and occasionally crashes when the coroutine tries to update a destroyed UI.

I've seen this bug in production codebases more than once, and it's always the same pattern. Someone writes `catch (e: Exception)` in a generic wrapper, `CancellationException` gets caught, and the app starts exhibiting weird behavior — screens loading data they shouldn't, background operations that never stop, memory usage climbing until the OS kills the process. The fix is always the same: add `catch (e: CancellationException) { throw e }` before any generic catch clause. This is so common that it should be the first thing you look for in any code review involving coroutines and exception handling.

```kotlin
// ❌ Silent killer: catches CancellationException
suspend fun <T> badSafeCall(call: suspend () -> T): Result<T> = try {
    Result.success(call())
} catch (e: Exception) { // CancellationException is an Exception!
    Result.failure(e) // Coroutine thinks it handled the cancellation
    // But the scope is trying to cancel — now it can't
}

// ✅ Always re-throw CancellationException
suspend fun <T> goodSafeCall(call: suspend () -> T): AppResult<T> = try {
    AppResult.Success(call())
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    AppResult.Error(e.message ?: "Unknown error", e, ErrorCode.UNKNOWN)
}
```

With `safeApiCall` in place, Repository functions become clean one-liners. Each function delegates the actual API call and wraps it with `safeApiCall`. The mapper (`.toDomain()`) converts the DTO to a domain model inside the `safeApiCall` block, which means mapping errors (like a null field that should be non-null) are also caught and converted to `AppResult.Error`. This is intentional — if the API returns malformed data, the user should see a meaningful error, not a `NullPointerException` crash.

```kotlin
class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao
) {
    suspend fun getProduct(id: String): AppResult<Product> =
        safeApiCall { api.getProduct(id).toDomain() }

    suspend fun getProducts(): AppResult<List<Product>> =
        safeApiCall { api.getProducts().map { it.toDomain() } }

    suspend fun searchProducts(query: String): AppResult<List<Product>> =
        safeApiCall { api.searchProducts(query).map { it.toDomain() } }

    suspend fun refreshAndCache(id: String): AppResult<Product> = safeApiCall {
        val product = api.getProduct(id).toDomain()
        dao.insertProduct(product.toEntity())
        product
    }
}
```

For repositories that coordinate between network and local storage — which is most repositories in production apps — `safeApiCall` pairs naturally with an offline-first strategy. The Repository first tries the network call via `safeApiCall`. If it succeeds, it caches the result locally. If it fails with a network error, it falls back to the local cache. If the local cache also has no data, it returns the original error. This pattern gives you offline support without sacrificing error granularity.

```kotlin
class OrderRepository(
    private val api: OrderApi,
    private val dao: OrderDao
) {
    suspend fun getOrders(): AppResult<List<Order>> {
        // Try network first
        val networkResult = safeApiCall { api.getOrders().map { it.toDomain() } }

        return when (networkResult) {
            is AppResult.Success -> {
                // Cache on success
                dao.insertOrders(networkResult.data.map { it.toEntity() })
                networkResult
            }
            is AppResult.Error -> {
                // Fallback to cache on network failure
                val cached = dao.getOrders().map { it.toDomain() }
                if (cached.isNotEmpty()) {
                    AppResult.Success(cached)
                } else {
                    networkResult // Return original error if cache is empty too
                }
            }
        }
    }
}
```

One thing to be aware of is resource management inside `safeApiCall`. If your API call opens a stream, file, or connection that needs to be closed, Kotlin's `use` function ensures the resource is closed even if an exception occurs. This is the Kotlin equivalent of Java's try-with-resources, and it's especially important in `safeApiCall` where exceptions are caught and converted — without `use`, a caught exception would prevent the `finally` block from running if you relied on manual cleanup.

```kotlin
// ✅ Using Kotlin's use function for resource safety
suspend fun downloadFile(url: String, destination: File): AppResult<File> = safeApiCall {
    val response = api.downloadFile(url)
    response.byteStream().use { input ->
        destination.outputStream().use { output ->
            input.copyTo(output)
        }
    }
    destination
}
```

#### Common Mistakes

The most common mistake with `safeApiCall` is making it too granular or too generic. Too granular means creating separate `safeApiCall` variants for every HTTP code — `safeApiCallWith404AsNull`, `safeApiCallWithRetry`, etc. This leads to a proliferation of wrapper functions that are hard to compose. Too generic means catching everything as `ErrorCode.UNKNOWN` and losing the error granularity you worked to build. The sweet spot is a single `safeApiCall` with comprehensive HTTP code mapping, and any special handling done at the Repository or ViewModel level based on the `ErrorCode` it returns.

Another mistake is putting business logic validation inside `safeApiCall`. The wrapper is purely for infrastructure error mapping — converting HTTP exceptions and IO exceptions to typed codes. Business validation (like checking if a product is in stock) belongs in the Use Case or Repository logic after the API call succeeds. Mixing infrastructure error handling with business validation creates a confusing function that's hard to test and reason about.

**Key takeaway:** `safeApiCall` centralizes exception-to-error-code mapping at the Repository boundary. Always re-throw `CancellationException` first. Use `use` for resource cleanup inside the call. Keep the wrapper focused on infrastructure errors — don't mix in business validation.

### Lesson 8.4: Error Handling in the UI Layer

The UI layer is the final stop for errors, and it has one job: translate error codes into something the user can understand and act on. The ViewModel receives `AppResult.Error` from the Repository, decides what the user experience should be based on the error code, and exposes that decision through state. The UI composable reads the state and renders the appropriate message. At no point does the UI layer parse exception messages, check HTTP codes, or make networking decisions. It simply reads typed state and renders.

The ViewModel's error handling logic is where architectural decisions about user experience happen. A `NETWORK_ERROR` might mean showing a snackbar with a retry button if the user was refreshing, or showing a full-screen offline state if it was the initial load. An `UNAUTHORIZED` error should navigate the user to the login screen — this is an event, not state, because it's a one-time navigation action. A `NOT_FOUND` error might show a permanent empty state. A `SERVER_ERROR` might show a generic error with retry. These decisions are expressed through the ViewModel's state sealed class and its event channel.

```kotlin
// ViewModel state covers all UI scenarios
sealed interface ProductState {
    data object Loading : ProductState
    data class Success(val product: Product) : ProductState
    data object NotFound : ProductState
    data class Error(val code: ErrorCode) : ProductState
}

// Events for one-time actions (navigation, toasts)
sealed interface ProductEvent {
    data object NavigateToLogin : ProductEvent
    data class ShowSnackbar(val messageResId: Int) : ProductEvent
}
```

```kotlin
@HiltViewModel
class ProductViewModel @Inject constructor(
    private val repository: ProductRepository
) : ViewModel() {
    private val _state = MutableStateFlow<ProductState>(ProductState.Loading)
    val state: StateFlow<ProductState> = _state.asStateFlow()

    private val _events = Channel<ProductEvent>(Channel.BUFFERED)
    val events: Flow<ProductEvent> = _events.receiveAsFlow()

    fun loadProduct(id: String) {
        viewModelScope.launch {
            _state.value = ProductState.Loading
            repository.getProduct(id)
                .onSuccess { _state.value = ProductState.Success(it) }
                .onError { error ->
                    when (error.code) {
                        ErrorCode.UNAUTHORIZED -> _events.send(ProductEvent.NavigateToLogin)
                        ErrorCode.NOT_FOUND -> _state.value = ProductState.NotFound
                        else -> _state.value = ProductState.Error(error.code)
                    }
                }
        }
    }
}
```

The distinction between state and events in error handling is critical. An error that changes what the user sees on screen is state — the screen transitions from "loading" to "error" and stays there until the user retries. An error that triggers a one-time action is an event — the user sees a snackbar for 3 seconds, or gets navigated to a different screen. Using state for one-time actions causes bugs: if the user rotates the device, they see the error again because the state is replayed. Using events for persistent errors causes the opposite bug: if the user rotates, the error disappears because the event was already consumed.

The `Channel` with `receiveAsFlow()` is a well-established pattern for ViewModel events. The `BUFFERED` capacity ensures events aren't lost if the UI isn't collecting when the event is sent (which happens briefly during configuration changes). The composable collects these events in a `LaunchedEffect` and handles them — navigating, showing snackbars, or triggering other one-time UI actions.

In the composable, error codes map to localized string resources. This is where internationalization happens. The error code `NETWORK_ERROR` maps to `R.string.error_network`, which might be "Check your internet connection" in English and "Überprüfen Sie Ihre Internetverbindung" in German. The composable never contains hardcoded error strings. Every user-facing message comes from string resources, selected based on the typed error code.

```kotlin
@Composable
fun ProductScreen(
    viewModel: ProductViewModel = hiltViewModel(),
    onNavigateToLogin: () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // Handle one-time events
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ProductEvent.NavigateToLogin -> onNavigateToLogin()
                is ProductEvent.ShowSnackbar -> {
                    snackbarHostState.showSnackbar(
                        message = event.messageResId.toString()
                    )
                }
            }
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        when (val current = state) {
            is ProductState.Loading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is ProductState.Success -> ProductContent(current.product, Modifier.padding(padding))
            is ProductState.NotFound -> {
                ErrorScreen(
                    message = stringResource(R.string.product_not_found),
                    icon = Icons.Default.SearchOff
                )
            }
            is ProductState.Error -> {
                ErrorScreen(
                    message = when (current.code) {
                        ErrorCode.NETWORK_ERROR -> stringResource(R.string.error_network)
                        ErrorCode.SERVER_ERROR -> stringResource(R.string.error_server)
                        ErrorCode.TIMEOUT -> stringResource(R.string.error_timeout)
                        else -> stringResource(R.string.error_generic)
                    },
                    onRetry = { viewModel.loadProduct("productId") }
                )
            }
        }
    }
}
```

A critical anti-pattern in UI error handling is using `context` in the ViewModel to resolve string resources. I've seen ViewModels that take `Context` as a constructor parameter to call `context.getString(R.string.error_network)` and put the resolved string directly into the state. This breaks testability — you can't unit test a ViewModel that depends on Android `Context` without Robolectric. It also violates the architecture boundary — the ViewModel is a UI-agnostic state holder, and string resolution is a UI concern. Instead, the ViewModel exposes error codes or string resource IDs, and the composable resolves them using `stringResource()`.

```kotlin
// ❌ ViewModel resolving strings — breaks testability
class BadViewModel(private val context: Context) : ViewModel() {
    private val _errorMessage = MutableStateFlow("")
    val errorMessage: StateFlow<String> = _errorMessage

    fun load() {
        viewModelScope.launch {
            repository.getData()
                .onError { _errorMessage.value = context.getString(R.string.error_generic) }
        }
    }
}

// ✅ ViewModel exposes typed error — UI resolves strings
class GoodViewModel : ViewModel() {
    private val _state = MutableStateFlow<ScreenState>(ScreenState.Loading)
    val state: StateFlow<ScreenState> = _state

    fun load() {
        viewModelScope.launch {
            repository.getData()
                .onError { _state.value = ScreenState.Error(it.code) }
        }
    }
}
```

The `ErrorScreen` composable itself should be a reusable component that accepts a message string and an optional retry action. Making it reusable means every error screen in your app looks consistent and behaves the same way. The retry button calls back to the ViewModel, which re-triggers the loading flow. This creates a clean retry loop: Error state → user taps retry → Loading state → Success or Error state again.

One more thing about the UI layer: don't show raw error messages from the API. I've seen apps that display `"HTTP 500 Internal Server Error"` or worse, `"com.google.gson.JsonSyntaxException: Expected BEGIN_OBJECT but was STRING"` directly to users. These messages are meaningless to users and embarrassing for the team. Every error the user sees should be a crafted, localized message that tells them what went wrong in plain language and what they can do about it. The typed error code architecture guarantees this — the UI maps codes to human messages, and raw exception details stay in the logs.

**Key takeaway:** The ViewModel translates error codes into state (persistent) or events (one-time). The UI composable maps error codes to localized string resources — never hardcode error messages, never use `Context` in the ViewModel. Use `Channel` with `receiveAsFlow()` for one-time events like navigation. Keep the `ErrorScreen` composable reusable across features.

### Lesson 8.5: Error Handling Best Practises

This lesson consolidates everything from the module into actionable rules you can apply to any Android codebase. These aren't theoretical guidelines — they're patterns extracted from production apps that handle millions of requests and need to fail gracefully when things go wrong. And things always go wrong.

The first and most fundamental rule: never swallow exceptions silently. A `catch (e: Exception) { }` block with an empty body is worse than no error handling at all. At least without error handling, the app crashes and you get a stack trace in Crashlytics. With a silently swallowed exception, the app continues in a corrupted state — the user sees stale data, a button does nothing when tapped, or a screen is stuck on a loading spinner forever. Silent failures are the hardest bugs to diagnose because there's no evidence that anything went wrong. At minimum, log the exception. Better yet, convert it to a typed error that surfaces to the user.

```kotlin
// ❌ The silent killer — never do this
try {
    val data = api.fetchData()
    processData(data)
} catch (e: Exception) {
    // TODO: handle this later
    // "later" never comes
}

// ❌ Slightly better but still bad — logging without surfacing
try {
    val data = api.fetchData()
    processData(data)
} catch (e: Exception) {
    Log.e("TAG", "Failed to fetch data", e) // User sees nothing, stale data persists
}

// ✅ Convert to typed error and surface to the user
suspend fun fetchData(): AppResult<Data> = safeApiCall {
    api.fetchData().toDomain()
}
// Error flows up to ViewModel → UI → user sees meaningful message
```

The second rule: layer your error handling. Each architectural layer has a specific responsibility in the error handling pipeline. The data source layer (Retrofit services, Room DAOs) throws exceptions — it doesn't handle them. The Repository layer catches exceptions and converts them to `AppResult` using `safeApiCall`. The Use Case layer may combine or transform `AppResult` values but doesn't add new error handling. The ViewModel layer maps `AppResult.Error` codes to UI state or events. The UI layer renders error messages from string resources based on the error state. When every layer does its job and only its job, the error handling pipeline is clean, testable, and maintainable.

```kotlin
// Layer responsibilities in the error pipeline

// 1. Data Source — throws, doesn't catch
interface PaymentApi {
    @POST("payments")
    suspend fun processPayment(@Body request: PaymentRequest): PaymentResponse
}

// 2. Repository — catches and converts at the boundary
class PaymentRepository(private val api: PaymentApi) {
    suspend fun processPayment(request: PaymentRequest): AppResult<Payment> =
        safeApiCall { api.processPayment(request).toDomain() }
}

// 3. Use Case — transforms, may add business rules
class ProcessPaymentUseCase(
    private val paymentRepo: PaymentRepository,
    private val balanceRepo: BalanceRepository
) {
    suspend operator fun invoke(amount: Long): AppResult<Payment> {
        val balance = balanceRepo.getBalance().getOrNull()
            ?: return AppResult.Error("Could not check balance", code = ErrorCode.UNKNOWN)

        if (amount > balance.available) {
            return AppResult.Error("Insufficient funds", code = ErrorCode.INSUFFICIENT_FUNDS)
        }
        return paymentRepo.processPayment(PaymentRequest(amount))
    }
}

// 4. ViewModel — maps to UI state/events
// 5. UI — renders localized messages from state
```

The third rule: make error handling explicit, not implicit. This is the core advantage of the `AppResult` pattern over exception-based error handling. With exceptions, error handling is implicit — the caller can forget to add a `try/catch`, and the exception propagates silently to the nearest catch or crashes the app. With `AppResult`, error handling is explicit — the caller must handle both `Success` and `Error` cases to get the data. The Kotlin compiler enforces exhaustive `when` expressions on sealed interfaces, so you literally cannot forget to handle an error case.

The fourth rule: differentiate between retryable and non-retryable errors. A network timeout is retryable — the server might respond on the next attempt. A 401 Unauthorized is not retryable without user action (logging in again). A 404 Not Found is never retryable — the resource doesn't exist. Your `ErrorCode` enum should encode this distinction, and the UI should show or hide the retry button accordingly.

```kotlin
// Extension to determine if an error is retryable
fun ErrorCode.isRetryable(): Boolean = when (this) {
    ErrorCode.NETWORK_ERROR -> true
    ErrorCode.TIMEOUT -> true
    ErrorCode.SERVER_ERROR -> true
    ErrorCode.RATE_LIMITED -> true // After a delay
    ErrorCode.UNAUTHORIZED -> false // Needs re-auth
    ErrorCode.NOT_FOUND -> false // Resource doesn't exist
    ErrorCode.UNKNOWN -> false
}

// ViewModel uses this to decide UI behavior
fun handleError(error: AppResult.Error) {
    if (error.code == ErrorCode.UNAUTHORIZED) {
        _events.trySend(ScreenEvent.NavigateToLogin)
    } else {
        _state.value = ScreenState.Error(
            code = error.code,
            showRetry = error.code.isRetryable()
        )
    }
}
```

The fifth rule: handle partial failures gracefully. In real apps, a single screen often depends on multiple API calls — user profile, notifications count, recommended products, recent orders. If one of these fails, the screen shouldn't show a full error state. Show the data you have and indicate the specific section that failed. This is graceful degradation, and it's only possible when your error handling pipeline returns typed results rather than throwing exceptions that short-circuit everything.

```kotlin
// ❌ All-or-nothing — one failure kills the entire screen
class HomeViewModel : ViewModel() {
    fun loadHome() {
        viewModelScope.launch {
            try {
                val profile = userRepo.getProfile()
                val orders = orderRepo.getRecentOrders()
                val recommendations = productRepo.getRecommendations()
                _state.value = HomeState.Success(profile, orders, recommendations)
            } catch (e: Exception) {
                _state.value = HomeState.Error // Everything fails if one call fails
            }
        }
    }
}

// ✅ Partial failure — show what you have
class HomeViewModel : ViewModel() {
    fun loadHome() {
        viewModelScope.launch {
            val profile = userRepo.getProfile()
            val orders = orderRepo.getRecentOrders()
            val recommendations = productRepo.getRecommendations()

            _state.value = HomeState.Success(
                profile = profile.getOrNull(),
                orders = orders.getOrNull() ?: emptyList(),
                recommendations = recommendations.getOrNull() ?: emptyList(),
                failedSections = buildList {
                    if (profile is AppResult.Error) add(HomeSection.PROFILE)
                    if (orders is AppResult.Error) add(HomeSection.ORDERS)
                    if (recommendations is AppResult.Error) add(HomeSection.RECOMMENDATIONS)
                }
            )
        }
    }
}
```

The sixth rule: always log errors for observability, even when you handle them gracefully. When the user sees "Check your internet connection" and retries successfully, you still want to know that the first request failed. Aggregate error logs reveal patterns — if `NETWORK_ERROR` spikes at 3 PM every Tuesday, maybe there's a server-side deployment happening. If `SERVER_ERROR` is climbing steadily, maybe a backend service is degrading. The error handling pipeline should log every `AppResult.Error` to your analytics or crash reporting tool, even the ones the user never notices.

```kotlin
// Log every error, even handled ones
suspend fun <T> safeApiCallWithLogging(
    tag: String,
    logger: ErrorLogger,
    call: suspend () -> T
): AppResult<T> {
    val result = safeApiCall(call)
    if (result is AppResult.Error) {
        logger.logError(
            tag = tag,
            message = result.message,
            errorCode = result.code,
            exception = result.exception
        )
    }
    return result
}
```

The seventh rule: use Kotlin's `use` extension function to ensure resources are closed after use. Whether you're reading a file, opening a database cursor, or downloading a stream, `use` guarantees the resource is closed even if an exception occurs inside the block. This is Kotlin's equivalent of Java's try-with-resources, and it prevents resource leaks that cause memory issues and file descriptor exhaustion in long-running apps.

```kotlin
// ✅ use ensures resources are closed even on exception
fun readConfig(file: File): AppResult<Config> = try {
    val content = file.bufferedReader().use { reader ->
        reader.readText()
    }
    AppResult.Success(parseConfig(content))
} catch (e: IOException) {
    AppResult.Error("Failed to read config", e, ErrorCode.UNKNOWN)
}
```

#### Common Mistakes

The biggest meta-mistake in error handling is inconsistency. When half your repositories use `safeApiCall` and half use raw `try/catch` with different error mapping, the ViewModel can't make reliable assumptions about what error types it'll receive. When some ViewModels use state for errors and others use events, the UI behavior is unpredictable. Establish the error handling pipeline once, document it, and enforce it in code reviews. Consistency across the codebase is more valuable than perfection in one feature.

Another common mistake is catching `Exception` when you mean to catch `IOException`. Generic catch blocks hide bugs. If your code throws an `IllegalArgumentException` because of a programming error, a `catch (e: Exception)` block will silently convert that bug into an error message the user sees, rather than crashing and giving you a stack trace to fix the root cause. Be specific about which exceptions you catch. Catch `IOException` for network errors, `HttpException` for HTTP errors, and let everything else crash.

**Key takeaway:** Layer your error handling — each layer has one job. Never swallow exceptions silently. Make errors explicit with `AppResult` and exhaustive `when`. Differentiate retryable from non-retryable errors. Handle partial failures gracefully. Log every error for observability. Use `use` for resource safety. Above all, be consistent — the same error handling pattern across every feature.

### Quiz: Error Handling

#### Where should raw exceptions (HttpException, IOException) be mapped to domain error types?

- ❌ In the ViewModel
- ❌ In the UI layer
- ✅ At the Repository boundary using a safeApiCall wrapper
- ❌ In the Use Case

> **Explanation:** The Repository is the boundary between the data layer and the rest of the app. `safeApiCall` centralizes exception mapping, ensuring the ViewModel and domain layer only see typed `AppResult` errors, never raw framework exceptions.

#### Why should you never catch CancellationException in coroutines?

- ❌ It causes a compile error
- ✅ Catching it breaks structured concurrency — the coroutine won't cancel properly when its scope is cancelled
- ❌ It's not an actual exception
- ❌ It only happens in tests

> **Explanation:** `CancellationException` is how Kotlin coroutines implement cooperative cancellation. When a scope is cancelled (e.g., ViewModel.onCleared()), all child coroutines receive `CancellationException`. Catching it prevents the cancellation from propagating, causing resource leaks and unexpected behavior.

#### What is the advantage of using a sealed interface like `AppResult<T>` over throwing exceptions?

- ❌ It is faster at runtime
- ✅ It makes error handling explicit and forces callers to handle both success and error cases
- ❌ It eliminates all runtime crashes
- ❌ It reduces the number of classes in the project

> **Explanation:** A sealed `AppResult` type makes the error path explicit in the type system. Callers must handle both `Success` and `Error` — you can't accidentally forget error handling like you can with exceptions that propagate silently.

### Coding Challenge: Build a Complete Error Handling Pipeline

Create a `safeApiCall` wrapper, a repository that uses it, a ViewModel that handles errors with typed error codes, and a UI composable that maps errors to localized messages.

#### Solution

```kotlin
// 1. safeApiCall wrapper
suspend fun <T> safeApiCall(call: suspend () -> T): AppResult<T> = try {
    AppResult.Success(call())
} catch (e: CancellationException) { throw e }
  catch (e: HttpException) {
    val code = when (e.code()) {
        401 -> ErrorCode.UNAUTHORIZED
        404 -> ErrorCode.NOT_FOUND
        in 500..599 -> ErrorCode.SERVER_ERROR
        else -> ErrorCode.UNKNOWN
    }
    AppResult.Error("HTTP ${e.code()}", e, code)
} catch (e: IOException) {
    AppResult.Error("Network error", e, ErrorCode.NETWORK_ERROR)
}

// 2. Repository using safeApiCall
class ProductRepository(private val api: ProductApi) {
    suspend fun getProduct(id: String): AppResult<Product> =
        safeApiCall { api.getProduct(id).toDomain() }
}

// 3. ViewModel with typed error handling
@HiltViewModel
class ProductViewModel @Inject constructor(
    private val repository: ProductRepository
) : ViewModel() {
    private val _state = MutableStateFlow<ProductState>(ProductState.Loading)
    val state: StateFlow<ProductState> = _state.asStateFlow()

    private val _events = Channel<ProductEvent>(Channel.BUFFERED)
    val events: Flow<ProductEvent> = _events.receiveAsFlow()

    fun loadProduct(id: String) {
        viewModelScope.launch {
            _state.value = ProductState.Loading
            repository.getProduct(id)
                .onSuccess { _state.value = ProductState.Success(it) }
                .onError { error ->
                    when (error.code) {
                        ErrorCode.UNAUTHORIZED -> _events.send(ProductEvent.NavigateToLogin)
                        ErrorCode.NOT_FOUND -> _state.value = ProductState.NotFound
                        else -> _state.value = ProductState.Error(error.code)
                    }
                }
        }
    }
}

// 4. UI with localized error messages
@Composable
fun ProductScreen(viewModel: ProductViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    when (val current = state) {
        is ProductState.Loading -> CircularProgressIndicator()
        is ProductState.Success -> ProductContent(current.product)
        is ProductState.NotFound -> ErrorScreen(stringResource(R.string.product_not_found))
        is ProductState.Error -> ErrorScreen(
            message = when (current.code) {
                ErrorCode.NETWORK_ERROR -> stringResource(R.string.error_network)
                ErrorCode.SERVER_ERROR -> stringResource(R.string.error_server)
                else -> stringResource(R.string.error_generic)
            },
            onRetry = { viewModel.loadProduct(current.toString()) }
        )
    }
}
```

Errors flow cleanly through layers: raw exceptions → `safeApiCall` → `AppResult` → ViewModel → typed events/state → UI → localized strings.

---
## Module 9: Designing Internal APIs and Naming Conventions

Architecture isn't just about layers and patterns — it's about how you name things. Clear, consistent naming conventions make code self-documenting. When a new developer sees a class named `WebsocketMessageProcessor`, they know exactly what it does without reading the source. When they see `Utils2`, they know the codebase needs help.

### Lesson 9.1: Component Naming Taxonomy

Naming is one of the hardest problems in software engineering, and most teams solve it by not solving it — they name things whatever comes to mind first and move on. The result is a codebase where `UserHelper`, `UserManager`, `UserService`, and `UserUtils` all exist in the same project, and nobody can explain the difference between them. Each developer has their own mental model of what these suffixes mean, which means the names communicate nothing. They're just labels with no shared meaning.

A naming taxonomy fixes this by assigning specific, agreed-upon meanings to class suffixes. When your team decides that "Manager" means "handles a specific responsibility completely, end-to-end" and "Service" means "wraps a low-level API or external data source," those words carry architectural weight. A new developer reading `WebsocketManager` knows this class owns the entire websocket lifecycle — connecting, reconnecting, sending, receiving, disconnecting. Reading `RemoteConfigService`, they know it's a thin wrapper around Firebase Remote Config that doesn't own any business logic.

Here's the taxonomy I've found works well in production Android codebases. It's not the only valid taxonomy, but it's internally consistent and covers the component types you'll encounter in most apps.

**Service** is a low-level API or data source wrapper. It wraps a third-party SDK or a system API and provides a clean interface for the rest of the codebase. It doesn't contain business logic — it just translates between the external API's interface and your app's conventions. `RemoteConfigService` wraps Firebase Remote Config. `LocationService` wraps Android's FusedLocationProvider. `AnalyticsService` wraps your analytics SDK. The key characteristic is that if you swapped the underlying SDK (from Firebase to LaunchDarkly, for example), only the Service class would change.

**Manager** handles a complete responsibility end-to-end. Unlike a Service that wraps one API, a Manager coordinates multiple components to fulfill a responsibility. `WebsocketManager` handles connecting, reconnecting on failure, sending messages, receiving messages, and cleaning up resources. `NotificationChannelManager` creates notification channels, manages their settings, and displays notifications. A Manager often contains a Service internally but adds lifecycle management, state tracking, and coordination logic on top.

**Repository** manages business logic with a single responsibility, coordinating between data sources. This is the most well-known suffix in Android architecture. `UserRepository` coordinates between `UserApi` (network) and `UserDao` (local database), applying caching strategies and data mapping. The Repository is the boundary where raw infrastructure data becomes domain data. It's worth emphasizing that a Repository should have a single responsibility — if your `UserRepository` is also managing authentication tokens and notification preferences, it needs to be split.

```kotlin
// Service — thin wrapper around external API
class RemoteConfigService(private val firebaseRemoteConfig: FirebaseRemoteConfig) {
    suspend fun fetchConfig(): Map<String, String> {
        firebaseRemoteConfig.fetchAndActivate().await()
        return firebaseRemoteConfig.all.mapValues { it.value.asString() }
    }

    fun getString(key: String): String = firebaseRemoteConfig.getString(key)
    fun getBoolean(key: String): Boolean = firebaseRemoteConfig.getBoolean(key)
}

// Manager — end-to-end responsibility
class WebsocketManager(
    private val connectionWrapper: WebsocketConnectionWrapper,
    private val messageProcessor: WebsocketMessageProcessor,
    private val scope: CoroutineScope
) {
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    fun connect(url: String) {
        scope.launch {
            _connectionState.value = ConnectionState.CONNECTING
            connectionWrapper.connect(url)
            _connectionState.value = ConnectionState.CONNECTED
            connectionWrapper.messages.collect { message ->
                messageProcessor.process(message)
            }
        }
    }

    fun disconnect() {
        connectionWrapper.disconnect()
        _connectionState.value = ConnectionState.DISCONNECTED
    }
}

// Repository — coordinates data sources
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao
) {
    fun observeUser(id: String): Flow<User> = dao.observeUser(id).map { it.toDomain() }

    suspend fun refreshUser(id: String): AppResult<User> = safeApiCall {
        val user = api.getUser(id).toDomain()
        dao.insertUser(user.toEntity())
        user
    }
}
```

**Factory** creates objects. This is a straightforward adoption of the Factory design pattern. `TicketStatusFactory` creates different ticket status instances based on the ticket's current state. `NotificationBuilderFactory` creates `NotificationCompat.Builder` instances configured for different notification types. The Factory encapsulates creation logic that would otherwise be scattered across multiple call sites. If creating an object requires conditional logic, validation, or multiple steps, it belongs in a Factory.

**Provider** exposes an API or provides access to a resource. It's the read-only cousin of a Manager. `IntentProvider` creates and provides Intent objects for specific navigation targets. `NotificationPreferencesProvider` provides access to notification settings. `ThemeProvider` provides the current theme configuration. Providers are typically stateless or read-only — they don't modify the resources they provide.

**Processor** handles specific logic for a particular operation. `WebsocketMessageProcessor` processes incoming websocket messages — parsing the payload, routing to the correct handler, and updating the appropriate data store. `PaymentProcessor` handles the logic of processing a payment after validation. Processors are focused — they take input, do one specific thing with it, and produce output. They don't manage lifecycle or coordinate multiple concerns.

**Wrapper** hides the complexity of a low-level API and prevents other classes from directly depending on the underlying library. `WebsocketConnectionWrapper` wraps OkHttp's `WebSocket` class, providing a simpler interface and shielding the rest of the codebase from OkHttp-specific types. The key benefit is decoupling — if you switch from OkHttp's websocket implementation to Ktor's, only the Wrapper changes. Every class that depends on the Wrapper continues to work unchanged because it depends on your API, not OkHttp's.

```kotlin
// Factory — creates objects based on conditions
class NotificationDisplayFactory(private val context: Context) {
    fun create(notification: AppNotification): NotificationCompat.Builder {
        val builder = NotificationCompat.Builder(context, notification.channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setAutoCancel(true)

        return when (notification.type) {
            NotificationType.MESSAGE -> builder
                .setContentTitle(notification.senderName)
                .setContentText(notification.body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(notification.body))
            NotificationType.ORDER_UPDATE -> builder
                .setContentTitle("Order Update")
                .setContentText("Order #${notification.orderId}: ${notification.status}")
            NotificationType.PROMO -> builder
                .setContentTitle(notification.title)
                .setContentText(notification.body)
                .setPriority(NotificationCompat.PRIORITY_LOW)
        }
    }
}

// Provider — exposes read-only access
class ThemeProvider(private val dataStore: DataStore<Preferences>) {
    fun observeTheme(): Flow<AppTheme> = dataStore.data.map { prefs ->
        when (prefs[THEME_KEY]) {
            "dark" -> AppTheme.DARK
            "light" -> AppTheme.LIGHT
            else -> AppTheme.SYSTEM
        }
    }
}

// Wrapper — hides low-level API complexity
class WebsocketConnectionWrapper(private val client: OkHttpClient) {
    private var webSocket: WebSocket? = null
    private val _messages = MutableSharedFlow<WebsocketMessage>()
    val messages: SharedFlow<WebsocketMessage> = _messages.asSharedFlow()

    fun connect(url: String) {
        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                _messages.tryEmit(WebsocketMessage.Text(text))
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _messages.tryEmit(WebsocketMessage.Error(t))
            }
        })
    }

    fun send(message: String) { webSocket?.send(message) }
    fun disconnect() { webSocket?.close(1000, "Client disconnect") }
}
```

**UseCase** represents a specific business action. `SendMessageUseCase` coordinates the steps needed to send a message — validate the content, upload attachments, send via the API, and update the local database. Use Cases are named with a verb and represent a single action the user or system performs. They're the bridge between the ViewModel (which knows what the user wants to do) and the Repositories (which know how to access data).

**Observer** listens for changes and responds to them. `MessagesPagingObserver` monitors paging events and triggers data loads. `ConnectivityObserver` watches network state changes and emits updates. Observers are reactive components that don't perform actions themselves but detect when actions need to happen.

```kotlin
// UseCase — specific business action
class SendMessageUseCase(
    private val chatRepository: ChatRepository,
    private val attachmentRepository: AttachmentRepository
) {
    suspend operator fun invoke(
        chatId: String,
        text: String,
        attachments: List<Attachment>
    ): AppResult<Message> {
        // Upload attachments first
        val uploadedUrls = attachments.map { attachment ->
            val result = attachmentRepository.upload(attachment)
            if (result is AppResult.Error) return result
            (result as AppResult.Success).data
        }

        // Send message with attachment URLs
        return chatRepository.sendMessage(chatId, text, uploadedUrls)
    }
}

// Observer — watches for changes
class ConnectivityObserver(private val context: Context) {
    val networkState: Flow<NetworkState> = callbackFlow {
        val connectivityManager = context.getSystemService<ConnectivityManager>()
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(NetworkState.AVAILABLE) }
            override fun onLost(network: Network) { trySend(NetworkState.LOST) }
        }
        connectivityManager?.registerDefaultNetworkCallback(callback)
        awaitClose { connectivityManager?.unregisterNetworkCallback(callback) }
    }
}
```

The real value of this taxonomy isn't in the individual definitions — it's in the shared vocabulary it creates across your team. When a developer creates a pull request with a class called `PaymentProcessor`, every reviewer immediately knows its role: it processes payment logic, it doesn't manage payment lifecycle (that would be a Manager), it doesn't create payment objects (that would be a Factory), and it doesn't wrap a payment SDK (that would be a Wrapper). The naming convention carries architectural intent. This shared understanding speeds up code reviews, reduces misunderstandings, and makes the codebase navigable for new team members.

#### Common Mistakes

The most common mistake is using "Utils" as a catch-all for anything that doesn't fit another category. `UserUtils` with 40 static methods is a code smell — it means you haven't thought about where those methods belong. Break `UserUtils.formatDisplayName()` into a `DisplayNameFormatter`. Break `UserUtils.validateEmail()` into a `EmailValidator`. Break `UserUtils.calculateAge()` into the `User` domain model itself. If a method has a natural home in an existing class, put it there. Only create a Utils class for genuinely universal helper functions that have no domain-specific home.

Another mistake is confusing Manager with Service. If your `AuthenticationManager` is just a wrapper around Firebase Auth with no additional coordination logic, it's really an `AuthenticationService`. The distinction matters because Services are expected to be simple and replaceable, while Managers are expected to contain coordination logic that's worth testing independently.

**Key takeaway:** Adopt a naming taxonomy and enforce it consistently. Service wraps external APIs. Manager handles end-to-end responsibilities. Repository coordinates data sources. Factory creates objects. Provider exposes read-only access. Processor handles specific logic. Wrapper decouples from third-party libraries. UseCase represents business actions. Observer watches for changes. The suffix tells the reader what a class does before they open the file.

### Lesson 9.2: Designing New Features — The Checklist Approach

I've watched developers immediately jump into coding when they get a new feature ticket. They open Android Studio, create a new package, start writing the ViewModel, realize halfway through that they need a new Repository method, go write that, realize the API doesn't return the data they need, start designing the API contract, then realize the database schema needs a new table. Three hours in, they have half-finished code scattered across four layers with no clear direction. The feature eventually works, but the architecture is whatever shape the random walk of development produced.

The antidote is designing on paper before opening the IDE. Take 15 minutes — literally just 15 minutes — to answer a structured set of questions about the feature before writing any code. This tiny investment prevents hours of rework because you catch structural issues before they're embedded in code. You discover edge cases before they become bugs. You identify reusable components before duplicating logic. The checklist approach turns architecture from an accident into a deliberate decision.

Here's the checklist I use before starting any feature. It's simple, but answering every question forces you to think through the architecture before building it.

The first question: **What components do I need?** List every class this feature requires — ViewModels, Repositories, Use Cases, data sources, models, mappers. Give each one a name using the taxonomy from the previous lesson. If you can't name a component clearly, you don't understand its role yet. The naming exercise forces clarity. If you find yourself writing `FeatureHelper` or `FeatureUtils`, stop and think harder about what that class actually does.

```kotlin
// Example: designing a "Product Reviews" feature

// Components identified during design phase:
// - ReviewRepository — coordinates review data from API and local cache
// - ReviewApi — Retrofit service for review endpoints
// - ReviewDao — Room DAO for cached reviews
// - SubmitReviewUseCase — validates and submits a new review
// - ReviewListViewModel — manages the review list screen state
// - WriteReviewViewModel — manages the write review form state
// - ReviewDto / ReviewEntity / Review — data models for each layer
// - ReviewMapper — converts between DTO, Entity, and Domain models
```

The second question: **What are the interactions?** Draw the data flow between components. How does user input flow from the UI to the data layer? How does data flow from the API to the screen? Where does caching happen? Where does validation happen? Mapping the interactions often reveals missing components — "oh, I need a mapper between the DTO and the domain model" or "I need a Use Case to coordinate the review submission with the product update."

```kotlin
// Data flow designed on paper:

// Read flow:
// UI → ReviewListViewModel → ReviewRepository → ReviewDao (observe)
//                                              → ReviewApi (refresh)
//                                              → ReviewDao (cache)

// Write flow:
// UI → WriteReviewViewModel → SubmitReviewUseCase → validates review
//                                                 → ReviewRepository.submit()
//                                                 → ReviewApi.postReview()
//                                                 → ReviewDao.insert() (optimistic)
```

The third question: **What are the edge cases?** Edge cases are where features break and where architecture proves itself. For a reviews feature: What happens when the user submits a review while offline? What if the API returns reviews with missing fields? What if two users submit reviews for the same product simultaneously? What if the review text exceeds the character limit? What if the user navigates away mid-submission? Listing edge cases before coding ensures your architecture handles them instead of your QA team finding them.

The fourth question: **What design patterns apply?** Once you know the components and interactions, identify which patterns structure them best. Does the review list need pagination? Use the Paging library. Does the review submission need optimistic updates? Use a pattern where you insert locally first, then sync to the server, and roll back on failure. Does the review form need validation? Use a validation pipeline. Identifying patterns early means you build on proven solutions instead of inventing ad-hoc ones.

```kotlin
// Design patterns identified:

// 1. Offline-first: Cache reviews locally, show cached data immediately,
//    refresh in background
// 2. Optimistic update: Insert review locally immediately on submit,
//    sync to server in background, roll back if server rejects
// 3. Pagination: Reviews list uses Paging 3 for infinite scroll
// 4. Form validation: WriteReviewViewModel validates before submission

// Optimistic update pattern for review submission
class SubmitReviewUseCase(
    private val repository: ReviewRepository,
    private val validator: ReviewValidator
) {
    suspend operator fun invoke(review: Review): AppResult<Review> {
        // Step 1: Validate locally
        val validationResult = validator.validate(review)
        if (validationResult is ValidationResult.Invalid) {
            return AppResult.Error(validationResult.message, code = ErrorCode.VALIDATION_ERROR)
        }

        // Step 2: Insert locally (optimistic)
        val pendingReview = review.copy(status = ReviewStatus.PENDING)
        repository.insertLocal(pendingReview)

        // Step 3: Submit to server
        val serverResult = repository.submitToServer(review)

        // Step 4: Update local status based on result
        return when (serverResult) {
            is AppResult.Success -> {
                repository.updateLocal(serverResult.data)
                serverResult
            }
            is AppResult.Error -> {
                repository.deleteLocal(pendingReview.id) // Roll back
                serverResult
            }
        }
    }
}
```

The fifth question: **What API surface do I need?** Define the public interface of each component before implementing it. What methods does the Repository expose? What state does the ViewModel emit? What parameters does the Use Case accept? Defining the API surface first means your components are designed to work together — you won't discover interface mismatches when you try to wire them up.

This entire process takes 15 minutes on a piece of paper or a text file. You don't need a formal design document, a UML diagram, or a meeting. Just five questions answered in short bullets. The time investment is trivial compared to the hours saved by not building the wrong architecture and then refactoring it after you discover the edge cases.

```kotlin
// API surface defined before implementation

interface ReviewRepository {
    fun observeReviews(productId: String): Flow<List<Review>>
    suspend fun refreshReviews(productId: String): AppResult<Unit>
    suspend fun submitReview(review: Review): AppResult<Review>
    suspend fun deleteReview(reviewId: String): AppResult<Unit>
    suspend fun insertLocal(review: Review)
    suspend fun updateLocal(review: Review)
    suspend fun deleteLocal(reviewId: String)
}

// ViewModel state defined before implementation
sealed interface ReviewListState {
    data object Loading : ReviewListState
    data class Success(
        val reviews: List<Review>,
        val isRefreshing: Boolean = false
    ) : ReviewListState
    data class Error(val code: ErrorCode) : ReviewListState
}
```

I want to stress something about this process: it's not about creating documentation that nobody reads. It's about thinking before doing. The paper or text file is just a tool to force that thinking. You can throw it away after you've implemented the feature. The value was in the 15 minutes of structured thought, not in the artifact it produced.

**Key takeaway:** Spend 15 minutes designing before coding. Answer five questions: What components? What interactions? What edge cases? What patterns? What API surface? This prevents hours of rework and produces architecture that handles requirements from the start instead of being retrofitted after the fact.

### Lesson 9.3: API Surface Design

The API surface of a class is its public interface — the methods, properties, and types visible to code outside the class. A well-designed API surface is narrow, consistent, and hard to misuse. A poorly-designed API surface exposes implementation details, accepts invalid inputs without complaint, and requires callers to "just know" how to use it correctly based on tribal knowledge. Your API surface is a contract with every developer who uses your code, including future you six months from now.

The first principle of API surface design is minimizing exposure. By default, every class, function, and property should be `internal` or `private`. Only make things `public` when there's a concrete consumer that needs access. In a multi-module project, this is enforced by Kotlin's `internal` visibility modifier — `internal` classes are visible within the module but invisible to other modules. This means you can refactor the entire internal implementation of a module without breaking any consumers, as long as the public interface doesn't change.

```kotlin
// ❌ Everything public — consumers depend on implementation details
class PaymentRepository(
    val api: PaymentApi, // Exposed — consumers can call API directly
    val dao: PaymentDao  // Exposed — consumers can bypass the Repository
) {
    fun processPayment(amount: Long): AppResult<Payment> { /* ... */ }
    fun mapDtoToDomain(dto: PaymentDto): Payment { /* ... */ } // Internal detail exposed
    fun getCachedPayments(): List<PaymentEntity> { /* ... */ } // Leaks entity type
}

// ✅ Minimal public surface — only expose what consumers need
class PaymentRepository internal constructor(
    private val api: PaymentApi,
    private val dao: PaymentDao
) {
    suspend fun processPayment(amount: Long): AppResult<Payment> { /* ... */ }
    fun observePayments(): Flow<List<Payment>> { /* ... */ }
    
    // Internal details stay private
    private fun mapDtoToDomain(dto: PaymentDto): Payment { /* ... */ }
    private fun getCachedPayments(): List<PaymentEntity> { /* ... */ }
}
```

Notice the `internal constructor` in the good example. This prevents code outside the module from instantiating `PaymentRepository` directly — they must go through a DI framework like Hilt that's configured within the module. The constructor parameters are `private`, preventing consumers from accessing the API or DAO directly. The only public methods are the ones consumers actually need: `processPayment` and `observePayments`. The mapping function and entity access are private because they're implementation details that no consumer should depend on.

The second principle is designing methods that are hard to misuse. A method signature should make it obvious what inputs are valid and what the output means. Avoid boolean parameters — `sendMessage(text, true, false)` is unreadable at the call site. What does `true` mean? What does `false` mean? Use named parameters, enums, or separate methods instead.

```kotlin
// ❌ Boolean parameters — unreadable at the call site
fun sendMessage(text: String, isUrgent: Boolean, showNotification: Boolean)

// Call site is incomprehensible:
sendMessage("Hello", true, false) // What does true mean? What does false mean?

// ✅ Named parameters — self-documenting
fun sendMessage(
    text: String,
    priority: MessagePriority = MessagePriority.NORMAL,
    notification: NotificationPolicy = NotificationPolicy.DEFAULT
)

// Call site is clear:
sendMessage("Hello", priority = MessagePriority.URGENT, notification = NotificationPolicy.SILENT)
```

```kotlin
// ❌ Accepting raw strings for typed values — easy to pass wrong argument
fun loadProduct(id: String, category: String, currency: String)

// What stops someone from writing: loadProduct("USD", "electronics", "prod-123")?
// All three parameters are String — the compiler can't help you.

// ✅ Inline value classes — type safety with zero overhead
@JvmInline value class ProductId(val value: String)
@JvmInline value class CategoryId(val value: String)
@JvmInline value class CurrencyCode(val value: String)

fun loadProduct(id: ProductId, category: CategoryId, currency: CurrencyCode)

// Now the compiler catches argument swaps:
// loadProduct(CurrencyCode("USD"), CategoryId("electronics"), ProductId("prod-123"))
// ❌ Compile error — types don't match
```

The third principle is consistency in naming and signatures. If one Repository method returns `Flow<List<User>>` for observation and another returns `LiveData<List<Order>>`, consumers have to handle two different reactive types. If one Use Case uses `operator fun invoke()` and another uses `fun execute()`, there's no predictable pattern for callers. Establish conventions and stick to them: all Repositories expose `Flow` for observation and `suspend fun` for one-shot operations. All Use Cases use `operator fun invoke()`. All error-returning functions use `AppResult<T>`.

```kotlin
// ✅ Consistent API patterns across all Repositories
interface UserRepository {
    fun observeUser(id: String): Flow<User>         // Observation → Flow
    suspend fun refreshUser(id: String): AppResult<Unit>  // One-shot → suspend + AppResult
    suspend fun updateUser(user: User): AppResult<User>   // Mutation → suspend + AppResult
}

interface OrderRepository {
    fun observeOrders(): Flow<List<Order>>           // Same pattern as UserRepository
    suspend fun refreshOrders(): AppResult<Unit>
    suspend fun cancelOrder(id: String): AppResult<Unit>
}

// ✅ Consistent Use Case pattern
class GetUserProfileUseCase(private val repo: UserRepository) {
    suspend operator fun invoke(id: String): AppResult<UserProfile> { /* ... */ }
}

class CancelOrderUseCase(private val repo: OrderRepository) {
    suspend operator fun invoke(orderId: String): AppResult<Unit> { /* ... */ }
}
```

The fourth principle is making interfaces reveal the abstraction, not the implementation. When you write an interface for your Repository, the methods should describe what the consumer needs to do, not how the Repository implements it internally. A method named `fetchFromNetworkAndCacheThenReturnFromDb()` leaks the implementation strategy into the API. The consumer shouldn't know or care that the data comes from a network call, gets cached in SQLite, and is then returned from a Room query. They just want to get data. Name it `getUser()` and let the implementation handle the strategy internally.

```kotlin
// ❌ Interface reveals implementation strategy
interface BadUserRepository {
    suspend fun fetchFromApi(id: String): UserDto
    suspend fun cacheToDatabase(user: UserDto)
    suspend fun getFromDatabase(id: String): UserEntity?
    suspend fun fetchAndCache(id: String): User
}

// ✅ Interface reveals the abstraction
interface UserRepository {
    fun observeUser(id: String): Flow<User>
    suspend fun getUser(id: String): AppResult<User>
    suspend fun refreshUser(id: String): AppResult<Unit>
    suspend fun updateUser(user: User): AppResult<User>
}
```

The fifth principle is documentation through types. Your API should be self-documenting through its type signatures. A function that returns `AppResult<User>` tells the caller that it can fail and they need to handle errors. A function that returns `Flow<User>` tells the caller that the data changes over time and they should observe it. A function that takes `ProductId` instead of `String` tells the caller exactly what kind of identifier to provide. Good type design reduces the need for documentation comments because the types themselves communicate intent.

One more design consideration that many teams overlook: versioning your internal APIs. When a module's public interface needs to change, you can't just modify it if other modules depend on the old signature. The `internal` modifier protects you from this — classes marked `internal` can be changed freely because no code outside the module sees them. For public interfaces that must evolve, add new methods while deprecating old ones using `@Deprecated("Use newMethod() instead", replaceWith = ReplaceWith("newMethod()"))`. This gives consumers a migration path and lets Android Studio auto-apply the replacement.

```kotlin
interface ChatRepository {
    // Original API
    @Deprecated(
        "Use observeMessages(chatId, pagination) for paginated access",
        replaceWith = ReplaceWith("observeMessages(chatId, PaginationConfig())")
    )
    fun observeMessages(chatId: String): Flow<List<Message>>

    // New API with pagination support
    fun observeMessages(chatId: String, pagination: PaginationConfig): Flow<PagingData<Message>>
}
```

**Key takeaway:** Design API surfaces that are narrow (minimal exposure), safe (hard to misuse), consistent (same patterns everywhere), abstract (hide implementation), and self-documenting (types communicate intent). Default to `internal`/`private` and only expose what consumers genuinely need. Use inline value classes for type safety and named parameters for readability. Consistency across your API surfaces is more valuable than perfection in any single one.

### Lesson 9.4: Refactoring Architectural Debt

Every codebase accumulates architectural debt. It happens naturally — features ship under deadline pressure, requirements change after the code is written, and quick fixes become permanent fixtures. Architectural debt isn't the same as messy code. You can have beautifully formatted, well-commented code that's architecturally broken — a ViewModel that directly calls a network client, a Repository that knows about Android Context, a Use Case that updates UI state. The code looks clean line-by-line, but the structural decisions are wrong.

Recognizing architectural debt is the first step. Here are the signals that tell you a codebase has accumulated debt. God classes with hundreds or thousands of lines that do too many things. Circular dependencies where module A depends on module B and module B depends on module A. Leaky abstractions where a ViewModel references Room entities or Retrofit response types instead of domain models. Duplicated logic where the same business rule is implemented in three different ViewModels. Unused code — deprecated APIs, unused classes, dead feature flags — that nobody removes because they're afraid of breaking something. Hardcoded strings, API keys, or configuration values scattered throughout the codebase instead of centralized in configuration files.

```kotlin
// Signals of architectural debt

// ❌ God class — too many responsibilities
class ChatManager(
    private val api: ChatApi,
    private val db: ChatDatabase,
    private val context: Context,
    private val notificationManager: NotificationManager
) {
    // Network calls
    suspend fun fetchMessages() { /* ... */ }
    suspend fun sendMessage() { /* ... */ }
    // Database operations
    fun cacheMessages() { /* ... */ }
    fun clearCache() { /* ... */ }
    // Notification logic
    fun showNotification() { /* ... */ }
    fun createChannel() { /* ... */ }
    // UI formatting (!)
    fun formatMessageTime(timestamp: Long): String { /* ... */ }
    fun formatSenderName(user: User): String { /* ... */ }
    // Analytics (!)
    fun trackMessageSent() { /* ... */ }
    fun trackMessageRead() { /* ... */ }
    // 500+ more lines...
}
```

The right approach to refactoring architectural debt is incremental, not big-bang. A "stop the world and rewrite everything" approach almost always fails — it takes too long, introduces regression bugs, blocks feature development, and often ends up being abandoned halfway through. Instead, refactor incrementally using the Strangler Fig pattern: build the new architecture alongside the old one, migrate one piece at a time, and delete the old code only after the new code is proven.

Here's how you'd refactor the `ChatManager` god class incrementally. You don't rewrite it in one PR. You extract one responsibility at a time, update callers to use the extracted class, and verify nothing breaks. Each extraction is a small, reviewable, testable PR.

```kotlin
// Step 1: Extract notification logic into NotificationChannelManager
class NotificationChannelManager(private val context: Context) {
    fun createChannel(id: String, name: String, importance: Int) { /* ... */ }
    fun showNotification(notification: AppNotification) { /* ... */ }
}

// Step 2: Extract message formatting into a separate concern
class MessageDisplayFormatter {
    fun formatTime(timestamp: Long): String {
        val now = System.currentTimeMillis()
        val diff = now - timestamp
        return when {
            diff < 60_000 -> "Just now"
            diff < 3600_000 -> "${diff / 60_000}m ago"
            diff < 86400_000 -> "${diff / 3600_000}h ago"
            else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(timestamp))
        }
    }

    fun formatSenderName(user: User): String = when {
        user.displayName.isNotBlank() -> user.displayName
        else -> user.email.substringBefore('@')
    }
}

// Step 3: Extract analytics tracking
class ChatAnalyticsTracker(private val analytics: AnalyticsService) {
    fun trackMessageSent(chatId: String, messageType: MessageType) {
        analytics.logEvent("message_sent", mapOf("chat_id" to chatId, "type" to messageType.name))
    }
    fun trackMessageRead(messageId: String) {
        analytics.logEvent("message_read", mapOf("message_id" to messageId))
    }
}

// ChatManager is now smaller — only coordination logic remains
class ChatManager(
    private val repository: ChatRepository,
    private val notificationManager: NotificationChannelManager,
    private val analyticsTracker: ChatAnalyticsTracker
) {
    // Only coordination logic — delegating to focused components
    suspend fun onMessageReceived(message: Message) {
        repository.cacheMessage(message)
        notificationManager.showNotification(message.toNotification())
        analyticsTracker.trackMessageRead(message.id)
    }
}
```

The key to successful incremental refactoring is this: every intermediate state must work. After extracting `NotificationChannelManager`, the app must compile, pass tests, and function identically. After extracting `MessageDisplayFormatter`, same thing. You never have a "the app is broken while we refactor" phase. Each PR is small enough to review in 15 minutes, and if something goes wrong, you can revert a single PR instead of undoing a week of work.

When you're prioritizing what to refactor, focus on the code that changes most frequently. A god class that hasn't been modified in two years is technical debt, but it's stable debt. A god class that gets modified with every sprint is active debt — it's slowing you down right now. Use your version control history to find the files with the most commits, and prioritize refactoring those. The hotspot analysis approach — identifying files that change frequently and have high complexity — is one of the most effective ways to find the architectural debt that matters most.

```kotlin
// Before refactoring: one class handling everything for a feature
class OrderProcessor(
    private val api: OrderApi,
    private val db: OrderDatabase,
    private val paymentGateway: PaymentGateway,
    private val inventoryService: InventoryService,
    private val emailService: EmailService
) {
    suspend fun placeOrder(cart: Cart): Order {
        // Validate inventory — should be a Use Case
        cart.items.forEach { item ->
            val stock = inventoryService.checkStock(item.productId)
            if (stock < item.quantity) throw OutOfStockException(item.productId)
        }
        // Process payment — should be a separate Use Case
        val paymentResult = paymentGateway.charge(cart.total)
        if (!paymentResult.success) throw PaymentFailedException()
        // Create order — should be Repository logic
        val order = Order(items = cart.items, paymentId = paymentResult.id)
        db.orderDao().insert(order.toEntity())
        api.createOrder(order.toDto())
        // Send confirmation — should be a separate side effect
        emailService.sendConfirmation(order)
        return order
    }
}

// After refactoring: each responsibility in the right place
class PlaceOrderUseCase(
    private val validateInventory: ValidateInventoryUseCase,
    private val processPayment: ProcessPaymentUseCase,
    private val orderRepository: OrderRepository,
    private val sendConfirmation: SendOrderConfirmationUseCase
) {
    suspend operator fun invoke(cart: Cart): AppResult<Order> {
        val inventoryResult = validateInventory(cart.items)
        if (inventoryResult is AppResult.Error) return inventoryResult

        val paymentResult = processPayment(cart.total)
        if (paymentResult is AppResult.Error) return paymentResult

        val orderResult = orderRepository.createOrder(cart, (paymentResult as AppResult.Success).data)
        if (orderResult is AppResult.Error) return orderResult

        // Non-critical — don't fail the order if email fails
        sendConfirmation(orderResult.data)
        return orderResult
    }
}
```

Another critical aspect of refactoring is removing dead code. Every codebase has classes, methods, and features that are no longer used but still exist "just in case." Dead code is worse than no code because it misleads developers into thinking it's still relevant, it increases build times, it clutters search results, and it creates false positives in static analysis. When you refactor, actively identify and remove deprecated classes, unused utility functions, dead feature flags, and commented-out code blocks. If you need them later, they're in version control history.

#### Anti-patterns in Refactoring

The "rewrite from scratch" impulse is the most dangerous anti-pattern. When you look at a messy codebase, it's tempting to think "I could rewrite this properly in two weeks." You can't. The messy codebase contains hundreds of implicit decisions, edge case handling, and bug fixes that you'll rediscover one by one as users report regressions. Joel Spolsky's famous essay on the Netscape rewrite applies just as much to an Android module. Refactor incrementally. Test continuously. Ship the improved code alongside the old code.

The "perfect architecture" impulse is equally dangerous. Don't refactor code into a perfect theoretical architecture if the current code works and doesn't change often. Refactoring has a cost — developer time, review cycles, risk of regressions. Only refactor code where the architectural debt is actively causing problems: slowing down feature development, causing bugs, or making the codebase hard to understand.

**Key takeaway:** Refactor incrementally using the Strangler Fig pattern — extract one responsibility at a time, verify nothing breaks, repeat. Prioritize refactoring code that changes frequently (hotspots). Remove dead code aggressively. Never rewrite from scratch. Every intermediate state must work. Refactoring is an investment — only spend it where the debt is actively costing you.

### Lesson 9.5: Application-Level Architecture Decisions

Beyond the feature-level architecture of ViewModels, Repositories, and Use Cases, there are application-level decisions that affect the entire codebase. These are the foundational choices you make early in a project that are expensive to change later — how you initialize components, how you handle background work, how you manage resources, and how you structure your offline experience. Getting these right early saves you from painful migrations later.

The first application-level decision is initialization. Android apps often need to initialize analytics SDKs, crash reporters, database connections, remote config, and other services at startup. The naive approach is dumping everything into the `Application.onCreate()` method, which turns it into a 200-line function that runs on the main thread and delays the first frame. Every millisecond in `Application.onCreate()` is a millisecond added to your app's startup time, and users notice startup delays more than almost any other performance issue.

The App Startup library solves this by providing a structured way to define initializers with dependency ordering. Each initializer declares what it depends on, and the library figures out the correct initialization order. Initializers that don't depend on each other can run in parallel. Initializers that do have dependencies run in the correct order without manual orchestration. This replaces the fragile, order-dependent sequence of calls in `Application.onCreate()` with a declarative dependency graph.

```kotlin
// ❌ Everything in Application.onCreate() — fragile, slow, hard to maintain
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Each line adds to startup time
        FirebaseApp.initializeApp(this)
        CrashReporter.init(this)
        Analytics.init(this, API_KEY) // Must be after Firebase
        RemoteConfig.init(this) // Must be after Analytics
        ImageLoader.init(this)
        Database.init(this)
        // What's the correct order? Who remembers?
    }
}
```

```kotlin
// ✅ App Startup — declarative initialization with dependency ordering
class AnalyticsInitializer : Initializer<Analytics> {
    override fun create(context: Context): Analytics {
        return Analytics.init(context)
    }

    override fun dependencies(): List<Class<out Initializer<*>>> {
        return listOf(FirebaseInitializer::class.java) // Depends on Firebase
    }
}

class RemoteConfigInitializer : Initializer<RemoteConfig> {
    override fun create(context: Context): RemoteConfig {
        return RemoteConfig.init(context)
    }

    override fun dependencies(): List<Class<out Initializer<*>>> {
        return listOf(AnalyticsInitializer::class.java) // Depends on Analytics
    }
}

// Dependencies are declared, order is automatic, initialization is structured
```

The second application-level decision is background work. Android's process lifecycle means your app can be killed at any time — when the user navigates away, when the OS needs memory, when the device restarts. Any work that needs to survive process death must use `WorkManager`. Sending messages, syncing data, uploading files, processing images — all of these need `WorkManager` if they must complete even if the app is killed. Using a coroutine in `viewModelScope` for these operations is a common mistake: the coroutine dies when the ViewModel is cleared, and the work never completes.

```kotlin
// ❌ Background work in ViewModel scope — dies when user navigates away
class ChatViewModel : ViewModel() {
    fun sendMessage(text: String) {
        viewModelScope.launch {
            // If user navigates away, this coroutine is cancelled
            // Message is lost — never sent
            api.sendMessage(text)
            dao.markAsSent(text)
        }
    }
}

// ✅ WorkManager for work that must complete
class SendMessageWorker(
    context: Context,
    params: WorkerParameters,
    private val api: ChatApi,
    private val dao: MessageDao
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val messageId = inputData.getString("messageId") ?: return Result.failure()
        val message = dao.getMessage(messageId) ?: return Result.failure()

        return try {
            api.sendMessage(message.toDto())
            dao.markAsSent(messageId)
            Result.success()
        } catch (e: IOException) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}

// Queue the work — survives process death
fun queueMessageSend(messageId: String) {
    val request = OneTimeWorkRequestBuilder<SendMessageWorker>()
        .setInputData(workDataOf("messageId" to messageId))
        .setConstraints(Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()

    WorkManager.getInstance(context).enqueue(request)
}
```

The third decision is image format strategy. This might seem minor, but it affects APK size, runtime memory usage, and rendering performance across your entire app. Use SVG (vector drawables) instead of raster formats (JPG, PNG, WebP) wherever possible. Vector drawables scale to any density without quality loss, take up less APK space than multiple density-specific raster images, and render sharply on every screen size. The only exceptions are photographs (which must be raster) and complex illustrations with gradients that are too expensive to render as vectors.

```kotlin
// ✅ Vector drawable for icons — scales perfectly, tiny file size
// res/drawable/ic_notification.xml
// <vector android:height="24dp" android:width="24dp" ...>
//   <path android:fillColor="#FF000000" android:pathData="..."/>
// </vector>

// Reference in code — works at any density
Icon(
    painter = painterResource(R.drawable.ic_notification),
    contentDescription = "Notification",
    modifier = Modifier.size(24.dp)
)

// For photographs, use Coil with proper sizing
AsyncImage(
    model = ImageRequest.Builder(LocalContext.current)
        .data(product.imageUrl)
        .size(Size.ORIGINAL)
        .crossfade(true)
        .build(),
    contentDescription = product.name
)
```

The fourth and perhaps most impactful decision is offline-first architecture. Most apps treat offline as an error state — if the network is unavailable, show an error. Offline-first apps treat local data as the primary source and network as a synchronization mechanism. The user always sees data (from the local cache), and network requests happen in the background to refresh that cache. If the network is unavailable, the app still works — it just doesn't have the latest data. This approach dramatically improves perceived performance and user experience, especially on unreliable connections.

The Store library from Mobile Native Foundation provides a well-tested implementation of this pattern. It manages the read path (check cache → fetch from network → update cache → emit updates) and handles staleness, concurrent requests, and conflict resolution. Instead of building your own caching layer in every Repository, Store gives you a composable pipeline for offline-first data access.

```kotlin
// Offline-first architecture with Store library
class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao
) {
    private val store = StoreBuilder.from(
        fetcher = Fetcher.of { id: String -> api.getProduct(id).toDomain() },
        sourceOfTruth = SourceOfTruth.of(
            reader = { id -> dao.observeProduct(id).map { it?.toDomain() } },
            writer = { _, product -> dao.insertProduct(product.toEntity()) },
            delete = { id -> dao.deleteProduct(id) },
            deleteAll = { dao.deleteAll() }
        )
    ).build()

    // Fresh data — hits network, updates cache, returns result
    fun getProduct(id: String): Flow<StoreResponse<Product>> =
        store.stream(StoreRequest.fresh(id))

    // Cached data — returns cache if available, fetches if stale
    fun observeProduct(id: String): Flow<StoreResponse<Product>> =
        store.stream(StoreRequest.cached(id, refresh = true))
}
```

The fifth decision is handling pending actions for offline writes. When a user deletes a message and there's no network connection, the deletion should happen locally immediately and sync to the server when connectivity is restored. This requires storing pending actions — operations that have been applied locally but not yet confirmed by the server — in a local database. Each pending action is a record of what operation to perform, with what parameters, when the network becomes available. WorkManager is the natural execution engine for these pending actions.

```kotlin
// Pending action pattern for offline writes
@Entity(tableName = "pending_actions")
data class PendingAction(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String, // "delete_message", "send_message", "update_profile"
    val payload: String, // JSON-serialized parameters
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0
)

class PendingActionProcessor(
    private val dao: PendingActionDao,
    private val actionExecutors: Map<String, ActionExecutor>
) {
    suspend fun processAll() {
        val actions = dao.getAllPending()
        actions.forEach { action ->
            val executor = actionExecutors[action.type] ?: return@forEach
            try {
                executor.execute(action.payload)
                dao.delete(action.id)
            } catch (e: IOException) {
                dao.incrementRetry(action.id)
                // WorkManager will retry later
            }
        }
    }
}
```

These application-level decisions create the foundation that every feature builds on. If you choose offline-first architecture, every Repository follows the cache-first pattern. If you use WorkManager for background operations, every feature that needs reliable execution uses Workers. If you use App Startup, every initialization is structured and ordered. The consistency these foundational decisions create is what makes the codebase feel cohesive rather than cobbled together.

**Key takeaway:** Application-level decisions shape every feature in your codebase. Use App Startup for structured initialization. Use WorkManager for work that must survive process death. Prefer SVG over raster images. Design for offline-first architecture with local storage as the primary data source and network as a sync mechanism. Store pending actions for offline writes and process them when connectivity returns. These decisions are expensive to change later — make them deliberately.

### Quiz: API Design and Naming

#### What does a "Wrapper" class do in the naming taxonomy?

- ❌ It wraps multiple repositories into a single class
- ✅ It hides the complexity of a low-level API and prevents direct access to the underlying library
- ❌ It wraps exceptions into Result types
- ❌ It wraps Composables for reuse

> **Explanation:** A Wrapper class abstracts away the complexity of a third-party library or low-level API. For example, `WebsocketConnectionWrapper` wraps the websocket library's connection API, providing a simpler interface and preventing other classes from directly depending on the library.

#### What should you do before writing code for a new feature?

- ❌ Start coding immediately and refactor later
- ✅ Design on paper: list components, interactions, edge cases, and patterns before opening the IDE
- ❌ Copy the architecture from the nearest existing feature
- ❌ Write tests first, then design the architecture

> **Explanation:** A 15-minute design session prevents hours of refactoring. Writing down components, interactions, edge cases, and applicable design patterns before coding ensures the architecture supports all requirements from the start.

#### Why should internal API classes be marked `internal` by default?

- ❌ To improve runtime performance
- ✅ To prevent other modules from depending on implementation details, exposing only the public interface
- ❌ To reduce the number of generated DEX files
- ❌ To make the code compile faster

> **Explanation:** Marking implementation classes `internal` ensures other modules can only depend on the public interface (the contract). This prevents tight coupling to implementation details and makes it safe to refactor internals without breaking consumers.

### Coding Challenge: Design and Name a Feature's Components

You're building a notification system. Design the complete component taxonomy: name each class with the correct suffix, define the interfaces, and show how they interact.

#### Solution

```kotlin
// Component taxonomy for a notification system

// Service — wraps Firebase Cloud Messaging
class FirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        NotificationProcessor(/* deps */).process(message)
    }
}

// Processor — handles incoming notification logic
class NotificationProcessor(
    private val repository: NotificationRepository,
    private val channelManager: NotificationChannelManager
) {
    suspend fun process(message: RemoteMessage) {
        val notification = message.toNotification()
        repository.saveNotification(notification)
        channelManager.showNotification(notification)
    }
}

// Manager — manages notification channels end-to-end
class NotificationChannelManager(private val context: Context) {
    fun createChannels() {
        createChannel("messages", "Messages", NotificationManager.IMPORTANCE_HIGH)
        createChannel("updates", "Updates", NotificationManager.IMPORTANCE_DEFAULT)
    }

    fun showNotification(notification: AppNotification) { /* ... */ }
    private fun createChannel(id: String, name: String, importance: Int) { /* ... */ }
}

// Repository — coordinates notification data
interface NotificationRepository {
    fun observeUnread(): Flow<List<AppNotification>>
    suspend fun saveNotification(notification: AppNotification)
    suspend fun markAsRead(id: String)
    suspend fun clearAll()
}

// Factory — creates notification display objects
class NotificationDisplayFactory {
    fun create(notification: AppNotification): NotificationCompat.Builder {
        return when (notification.type) {
            NotificationType.MESSAGE -> createMessageNotification(notification)
            NotificationType.ORDER_UPDATE -> createOrderNotification(notification)
            NotificationType.PROMO -> createPromoNotification(notification)
        }
    }
}

// Provider — exposes notification preferences
class NotificationPreferencesProvider(
    private val dataStore: DataStore<Preferences>
) {
    fun observeEnabled(): Flow<Boolean> = dataStore.data.map { it[ENABLED_KEY] ?: true }
    suspend fun setEnabled(enabled: Boolean) { /* ... */ }
}

// UseCase — specific business action
class MarkAllNotificationsReadUseCase(
    private val repository: NotificationRepository,
    private val analyticsTracker: AnalyticsTracker
) {
    suspend operator fun invoke() {
        repository.clearAll()
        analyticsTracker.trackEvent("notifications_cleared")
    }
}
```

Each class has a clear role indicated by its suffix. The naming convention makes the architecture self-documenting — a new developer understands the system by reading class names.

---
## Module 10: Testing Architecture

Testing is where your architecture proves its value. A well-architected app is easy to test — each layer has clear inputs and outputs, dependencies are injected, and state is observable. A poorly-architected app requires mocking twelve classes, setting up Android context, and running on an emulator just to test business logic. If testing is hard, the problem isn't testing — it's the architecture.

### Lesson 10.1: Testing ViewModels

ViewModels are the most important layer to test because they contain the logic that drives your entire UI. Every state transition, every error handling decision, every navigation trigger lives in the ViewModel. If the ViewModel works correctly, the UI is just a rendering layer — it displays whatever state the ViewModel emits. If the ViewModel has bugs, no amount of UI testing will save you because the source of truth is wrong.

The reason ViewModels are testable in a well-architected app is dependency injection. A ViewModel that creates its own Repository internally is untestable — you can't control what data the Repository returns, so you can't verify how the ViewModel reacts to different scenarios. A ViewModel that receives its Repository through the constructor is trivially testable — you pass in a fake Repository that returns whatever data you need for the test, and you verify the ViewModel's state output.

Testing a ViewModel requires three pieces of infrastructure. First, you need `Dispatchers.setMain()` to replace the main dispatcher with a test dispatcher, because `viewModelScope` uses `Dispatchers.Main` by default, and there's no main looper in a JUnit test. Second, you need a `StandardTestDispatcher` or `UnconfinedTestDispatcher` to control coroutine execution. Third, you need the Turbine library to assert on `StateFlow` and `Flow` emissions in order. Without Turbine, testing flows requires manual collection with timeouts, which is fragile and verbose.

```kotlin
// Basic ViewModel test setup
class ProductListViewModelTest {
    private val fakeRepo = FakeProductRepository()
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() = ProductListViewModel(fakeRepo)
}
```

The `StandardTestDispatcher` gives you explicit control over when coroutines execute. Coroutines launched on this dispatcher don't run until you call `advanceUntilIdle()` or `advanceTimeBy()`. This is critical for testing state transitions — you can verify that the ViewModel emits `Loading` immediately, then advances to `Success` or `Error` after the coroutine completes. With `UnconfinedTestDispatcher`, coroutines run eagerly, which means you might miss intermediate states like `Loading` because it's immediately overwritten by the next state.

```kotlin
@Test
fun `emits loading then success when products load`() = runTest(testDispatcher) {
    val products = listOf(Product("1", "Laptop", 99900), Product("2", "Phone", 59900))
    fakeRepo.setProducts(products)

    val viewModel = createViewModel()

    viewModel.state.test {
        assertEquals(ProductListState.Loading, awaitItem()) // Initial state
        advanceUntilIdle()
        val successState = awaitItem()
        assertTrue(successState is ProductListState.Success)
        assertEquals(2, (successState as ProductListState.Success).products.size)
        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `emits error when repository fails`() = runTest(testDispatcher) {
    fakeRepo.setShouldFail(true)

    val viewModel = createViewModel()

    viewModel.state.test {
        assertEquals(ProductListState.Loading, awaitItem())
        advanceUntilIdle()
        val errorState = awaitItem()
        assertTrue(errorState is ProductListState.Error)
        cancelAndIgnoreRemainingEvents()
    }
}
```

Testing ViewModel events (one-time actions like navigation or snackbars) uses the same Turbine approach but on the events flow. Events are consumed once, so the test collects the event and verifies it was sent. A common pitfall is forgetting to advance the dispatcher before asserting on events — the event isn't sent until the coroutine that sends it actually runs.

```kotlin
@Test
fun `navigates to login on unauthorized error`() = runTest(testDispatcher) {
    fakeRepo.setErrorCode(ErrorCode.UNAUTHORIZED)

    val viewModel = createViewModel()
    viewModel.loadProducts()

    viewModel.events.test {
        advanceUntilIdle()
        val event = awaitItem()
        assertTrue(event is ProductEvent.NavigateToLogin)
        cancelAndIgnoreRemainingEvents()
    }
}
```

Testing ViewModels that use `SavedStateHandle` is straightforward — you construct a `SavedStateHandle` with the initial values your ViewModel expects. This simulates the arguments that would normally come from navigation. For process death testing, you verify that the ViewModel reads its initial state from `SavedStateHandle` and produces the correct output. The `SavedStateHandle` is a `Map`-like object, so creating one for tests is just `SavedStateHandle(mapOf("key" to "value"))`.

```kotlin
@Test
fun `loads product from SavedStateHandle argument`() = runTest(testDispatcher) {
    fakeRepo.setProduct(Product("p1", "Laptop", 99900))
    val savedState = SavedStateHandle(mapOf("productId" to "p1"))
    val viewModel = ProductDetailViewModel(fakeRepo, savedState)

    advanceUntilIdle()

    viewModel.state.test {
        val state = awaitItem()
        assertTrue(state is ProductState.Success)
        assertEquals("Laptop", (state as ProductState.Success).product.name)
        cancelAndIgnoreRemainingEvents()
    }
}
```

#### Common Mistakes

The most common ViewModel testing mistake is not replacing the main dispatcher. If you forget `Dispatchers.setMain(testDispatcher)`, any coroutine launched in `viewModelScope` will try to use `Dispatchers.Main`, which doesn't exist in a JUnit test, and you'll get a cryptic `IllegalStateException: Module with the Main dispatcher had failed to initialize`. Every ViewModel test class needs the `setMain`/`resetMain` pair in `@Before`/`@After`.

Another mistake is using `runBlocking` instead of `runTest`. `runBlocking` doesn't understand test dispatchers — it blocks the real thread and doesn't give you time control. `runTest` integrates with `StandardTestDispatcher`, gives you `advanceTimeBy()` and `advanceUntilIdle()`, and skips `delay()` calls by default. Always use `runTest` for coroutine tests.

**Key takeaway:** ViewModel tests verify state transitions and event emissions. Use `StandardTestDispatcher` for explicit coroutine control, Turbine for flow assertions, and `Dispatchers.setMain()` to replace the main dispatcher. Test the happy path, error cases, edge cases, and process death scenarios with `SavedStateHandle`. If testing is hard, the ViewModel's dependencies aren't properly injected.

### Lesson 10.2: Fakes vs Mocks — Why Fakes Win

The testing community has debated fakes versus mocks for years, and in Android architecture testing, fakes win decisively. A mock is a generated object that records method calls and returns pre-programmed responses. A fake is a real implementation of an interface that uses simple in-memory data instead of a real database or network. The difference sounds academic until you've maintained a test suite with hundreds of tests — then it becomes painfully practical.

Mocks test implementation details, not behavior. When you write `verify(repository).getUser("123")`, you're asserting that a specific method was called with a specific argument. This makes your test brittle — if you refactor the ViewModel to call `repository.observeUser("123")` instead, the test breaks even though the behavior is identical. You didn't change what the ViewModel does (it still shows the user's profile), you changed how it gets the data. The mock-based test fails for the wrong reason. You spend time updating tests instead of finding bugs.

Fakes test behavior. A `FakeUserRepository` has a `users` map that you populate before the test. The ViewModel calls whatever methods it needs, and you assert on the ViewModel's output state. If you refactor the ViewModel to use a different Repository method, the fake still works because it implements the full interface. The test doesn't care how the ViewModel gets the data — it only cares that the ViewModel produces the correct state.

```kotlin
// Mock-based test — brittle, tests implementation
@Test
fun `loads user profile`() {
    val mockRepo = mock<UserRepository>()
    whenever(mockRepo.getUser("123")).thenReturn(User("123", "Alice"))

    val viewModel = ProfileViewModel(mockRepo)
    viewModel.loadProfile("123")

    verify(mockRepo).getUser("123") // Tests HOW, not WHAT
    // If ViewModel changes to use observeUser(), this test breaks
}

// Fake-based test — resilient, tests behavior
@Test
fun `loads user profile`() = runTest {
    val fakeRepo = FakeUserRepository()
    fakeRepo.setUser(User("123", "Alice"))

    val viewModel = ProfileViewModel(fakeRepo)
    viewModel.loadProfile("123")
    advanceUntilIdle()

    viewModel.state.test {
        val state = awaitItem()
        assertEquals("Alice", (state as ProfileState.Success).user.name)
        cancelAndIgnoreRemainingEvents()
    }
    // Tests WHAT the ViewModel produces, not how it gets data
}
```

There's a deeper architectural benefit to fakes: they catch interface changes at compile time. When you add a new method to the `UserRepository` interface, every fake that implements the interface gets a compile error until you implement the new method. With mocks, there's no compile error — the mock library generates a stub at runtime, and you don't discover the missing method until a test fails with a confusing runtime error, or worse, you don't discover it at all because no test exercises the new method.

Fakes are also reusable across your entire test suite. You write `FakeUserRepository` once, and every test that needs user data uses it. Each test configures the fake differently — `setUser()` for a success case, `setShouldFail(true)` for an error case, `setNetworkAvailable(false)` for an offline case. With mocks, you repeat the `whenever().thenReturn()` setup in every test, and any change to the setup logic must be replicated across all tests that use it.

```kotlin
// A well-designed fake — reusable across all tests
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    private var shouldFail = false
    private var errorCode = ErrorCode.UNKNOWN

    // Test configuration methods
    fun setUser(user: User) { users[user.id] = user }
    fun setUsers(userList: List<User>) { userList.forEach { users[it.id] = it } }
    fun setShouldFail(fail: Boolean, code: ErrorCode = ErrorCode.SERVER_ERROR) {
        shouldFail = fail
        errorCode = code
    }
    fun clear() { users.clear(); shouldFail = false }

    // Real interface implementation
    override fun observeUser(id: String): Flow<User?> = flow {
        emit(users[id])
    }

    override suspend fun getUser(id: String): AppResult<User> {
        if (shouldFail) return AppResult.Error("Failed", code = errorCode)
        val user = users[id] ?: return AppResult.Error("Not found", code = ErrorCode.NOT_FOUND)
        return AppResult.Success(user)
    }

    override suspend fun updateUser(user: User): AppResult<User> {
        if (shouldFail) return AppResult.Error("Failed", code = errorCode)
        users[user.id] = user
        return AppResult.Success(user)
    }

    override suspend fun deleteUser(id: String): AppResult<Unit> {
        if (shouldFail) return AppResult.Error("Failed", code = errorCode)
        users.remove(id)
        return AppResult.Success(Unit)
    }
}
```

The design of a good fake follows a pattern. It implements the full interface with in-memory data structures (maps, lists, variables). It provides setter methods for test configuration — `setUser()`, `setShouldFail()`, `setNetworkAvailable()`. It returns realistic responses based on its internal state — if a user exists in the map, return success; if it doesn't, return not found. It supports all the failure modes the real implementation can produce, controlled by test configuration.

Some developers argue that fakes require more upfront effort than mocks. This is true — writing `FakeUserRepository` takes 10 minutes, while a mock takes 10 seconds. But that 10-minute investment pays off across hundreds of tests. Every test that uses the fake is simpler, more readable, and more resilient to refactoring. The total time spent on testing goes down, not up, because you're not constantly updating brittle mock setups.

```kotlin
// Compare: same 3 tests with mocks vs fakes

// Mocks — repetitive setup, brittle
@Test fun `success`() {
    whenever(mockRepo.getUser("1")).thenReturn(AppResult.Success(User("1", "Alice")))
    // ... assert
}
@Test fun `not found`() {
    whenever(mockRepo.getUser("1")).thenReturn(AppResult.Error("Not found", code = ErrorCode.NOT_FOUND))
    // ... assert
}
@Test fun `network error`() {
    whenever(mockRepo.getUser("1")).thenReturn(AppResult.Error("Network", code = ErrorCode.NETWORK_ERROR))
    // ... assert
}

// Fakes — clean configuration, resilient
@Test fun `success`() {
    fakeRepo.setUser(User("1", "Alice"))
    // ... assert
}
@Test fun `not found`() {
    // Don't set any user — fake naturally returns not found
    // ... assert
}
@Test fun `network error`() {
    fakeRepo.setShouldFail(true, ErrorCode.NETWORK_ERROR)
    // ... assert
}
```

There are situations where mocks are appropriate — primarily for verifying that side effects occurred. If your Use Case should call `analytics.trackEvent("purchase_completed")`, a mock is a valid way to verify that the tracking call was made. But for data-providing dependencies like Repositories and data sources, fakes are superior because they test behavior rather than implementation.

**Key takeaway:** Prefer fakes over mocks for testing. Fakes are reusable, catch interface changes at compile time, and test behavior rather than implementation details. Write one fake per interface, configure it per test, and share it across your entire test suite. Reserve mocks for verifying side effects (analytics tracking, logging) where you need to confirm a method was called.

### Lesson 10.3: Testing Use Cases

Use Cases are the simplest layer to test because they have the clearest input-output contract. A Use Case takes input parameters, coordinates one or more repositories, applies business logic, and returns a result. There's no UI framework dependency, no lifecycle complexity, no dispatcher management. Just pure business logic that you can test with straightforward unit tests.

The testing strategy for Use Cases is: inject fakes for all dependencies, call the Use Case with specific inputs, and assert on the output. Each test covers one scenario — success, a specific error case, a validation failure, an edge case. Because Use Cases are small and focused (each represents a single business action), the test suite for a Use Case is typically 5-10 tests that cover all meaningful scenarios.

```kotlin
class GetProductDetailsUseCaseTest {
    private val fakeProductRepo = FakeProductRepository()
    private val fakeReviewRepo = FakeReviewRepository()
    private val useCase = GetProductDetailsUseCase(fakeProductRepo, fakeReviewRepo)

    @Test
    fun `returns product with reviews on success`() = runTest {
        fakeProductRepo.setProduct(Product("p1", "Laptop", 99900))
        fakeReviewRepo.setReviews("p1", listOf(
            Review("r1", "p1", "Great product", 5),
            Review("r2", "p1", "Good value", 4)
        ))

        val result = useCase("p1")

        assertTrue(result is AppResult.Success)
        val details = (result as AppResult.Success).data
        assertEquals("Laptop", details.product.name)
        assertEquals(2, details.reviews.size)
        assertEquals(4.5, details.averageRating, 0.01)
    }

    @Test
    fun `returns error when product not found`() = runTest {
        // No product set — fake returns NOT_FOUND

        val result = useCase("missing")

        assertTrue(result is AppResult.Error)
        assertEquals(ErrorCode.NOT_FOUND, (result as AppResult.Error).code)
    }

    @Test
    fun `returns product without reviews when review fetch fails`() = runTest {
        fakeProductRepo.setProduct(Product("p1", "Laptop", 99900))
        fakeReviewRepo.setShouldFail(true)

        val result = useCase("p1")

        // Should still succeed — reviews are optional
        assertTrue(result is AppResult.Success)
        val details = (result as AppResult.Success).data
        assertEquals("Laptop", details.product.name)
        assertTrue(details.reviews.isEmpty())
    }
}
```

Notice the third test — it verifies graceful degradation. The product loads successfully, but the reviews fail. The Use Case should still return a success result with the product and an empty reviews list, rather than failing the entire operation because of an optional component. This kind of partial-failure handling is exactly what Use Case tests should verify because it's a business decision (reviews are optional for display) that's easy to get wrong if the Use Case naively short-circuits on any error.

Testing Use Cases that coordinate sequential operations requires verifying that the operations happen in the correct order and that earlier failures prevent later operations from executing. For example, a `PlaceOrderUseCase` should validate inventory before charging the payment. If inventory validation fails, the payment should never be processed. Your fake can track which methods were called to verify ordering without using mocks.

```kotlin
class PlaceOrderUseCaseTest {
    private val fakeInventory = FakeInventoryRepository()
    private val fakePayment = FakePaymentRepository()
    private val fakeOrder = FakeOrderRepository()

    private val useCase = PlaceOrderUseCase(fakeInventory, fakePayment, fakeOrder)

    @Test
    fun `does not charge payment when inventory check fails`() = runTest {
        fakeInventory.setShouldFail(true) // Out of stock

        val cart = Cart(listOf(CartItem("p1", quantity = 2)))
        val result = useCase(cart)

        assertTrue(result is AppResult.Error)
        assertFalse(fakePayment.wasChargeCalled) // Payment was never attempted
    }

    @Test
    fun `rolls back payment when order creation fails`() = runTest {
        fakeInventory.setStock("p1", available = 10)
        fakePayment.setChargeResult(PaymentResult("pay-123"))
        fakeOrder.setShouldFail(true) // Order creation fails

        val cart = Cart(listOf(CartItem("p1", quantity = 2)))
        val result = useCase(cart)

        assertTrue(result is AppResult.Error)
        assertTrue(fakePayment.wasRefundCalled) // Payment was refunded
        assertEquals("pay-123", fakePayment.lastRefundedPaymentId)
    }

    @Test
    fun `creates order successfully`() = runTest {
        fakeInventory.setStock("p1", available = 10)
        fakePayment.setChargeResult(PaymentResult("pay-123"))

        val cart = Cart(listOf(CartItem("p1", quantity = 2)))
        val result = useCase(cart)

        assertTrue(result is AppResult.Success)
        val order = (result as AppResult.Success).data
        assertEquals("pay-123", order.paymentId)
        assertEquals(1, order.items.size)
    }
}
```

Testing Use Cases that transform data — calculating discounts, applying filters, sorting results — is where you verify the business logic directly. These tests are the closest to pure function tests and are the most valuable per line of test code because they verify the core business rules of your app.

```kotlin
class ApplyDiscountsUseCaseTest {
    private val fakeRepo = FakeProductRepository()
    private val fakeUserRepo = FakeUserRepository()
    private val useCase = ApplyDiscountsUseCase(fakeRepo, fakeUserRepo)

    @Test
    fun `premium users get 10 percent discount`() = runTest {
        fakeRepo.setProducts(listOf(Product("p1", "Laptop", 100_00)))
        fakeUserRepo.setUser(User("u1", "Alice", isPremium = true))

        val result = useCase("u1")

        assertTrue(result is AppResult.Success)
        val products = (result as AppResult.Success).data
        assertEquals(90_00, products[0].discountedPrice)
    }

    @Test
    fun `regular users get no discount`() = runTest {
        fakeRepo.setProducts(listOf(Product("p1", "Laptop", 100_00)))
        fakeUserRepo.setUser(User("u1", "Bob", isPremium = false))

        val result = useCase("u1")

        assertTrue(result is AppResult.Success)
        val products = (result as AppResult.Success).data
        assertEquals(100_00, products[0].discountedPrice)
    }

    @Test
    fun `discount never goes below zero`() = runTest {
        fakeRepo.setProducts(listOf(Product("p1", "Cheap Item", 5))) // 5 cents
        fakeUserRepo.setUser(User("u1", "Alice", isPremium = true))

        val result = useCase("u1")

        assertTrue(result is AppResult.Success)
        val products = (result as AppResult.Success).data
        assertTrue(products[0].discountedPrice >= 0)
    }
}
```

#### Common Mistakes

The biggest mistake in Use Case testing is testing too little. A Use Case with 5 lines of code and 1 test isn't well-tested — it's minimally tested. Think about all the paths through the Use Case: success, each distinct failure mode, edge cases (empty lists, zero values, max values), and the interaction between multiple dependencies. A well-tested Use Case has a test for every meaningful scenario, not just the happy path.

Another mistake is testing Use Cases that are just passthroughs. If your Use Case literally does `return repository.getProduct(id)` with no additional logic, there's nothing to test that the Repository test doesn't already cover. Don't write tests for pass-through code — it's wasted effort. Tests should verify logic, not delegation.

**Key takeaway:** Use Case tests are the purest form of business logic testing — no framework dependencies, no lifecycle complexity. Test success, every error path, partial failures, operation ordering, and edge cases. Use fakes for all dependencies. Don't test pass-through Use Cases — focus testing effort on Use Cases that contain actual business logic.

### Lesson 10.4: Testing Repositories

Repository tests verify the coordination between data sources — that network responses are cached correctly, that cache is returned when the network is unavailable, that data is mapped correctly between layers, and that the `safeApiCall` wrapper produces the correct `AppResult` types. These tests are slightly more complex than Use Case tests because Repositories often coordinate between multiple data sources (API, DAO, preferences) and need to verify the interaction between them.

The testing strategy for Repositories uses fake data sources — `FakeProductApi` and `FakeProductDao` — injected into the real Repository class. You test the actual Repository implementation, not a mock of it. This verifies the real coordination logic: caching strategies, data mapping, error handling, and the interaction between network and local storage.

```kotlin
class ProductRepositoryTest {
    private val fakeApi = FakeProductApi()
    private val fakeDao = FakeProductDao()
    private val repository = ProductRepositoryImpl(fakeApi, fakeDao)

    @Test
    fun `caches network response in local database`() = runTest {
        fakeApi.setProducts(listOf(
            ProductDto("p1", "Laptop", 99900),
            ProductDto("p2", "Phone", 59900)
        ))

        val result = repository.refreshProducts()

        assertTrue(result is AppResult.Success)
        // Verify data was cached
        val cached = fakeDao.getAll()
        assertEquals(2, cached.size)
        assertEquals("Laptop", cached[0].name)
    }

    @Test
    fun `returns cached data when network fails`() = runTest {
        // Pre-populate cache
        fakeDao.insertAll(listOf(
            ProductEntity("p1", "Cached Laptop", 99900)
        ))
        fakeApi.setShouldFail(true)

        val result = repository.getProducts()

        assertTrue(result is AppResult.Success)
        val products = (result as AppResult.Success).data
        assertEquals(1, products.size)
        assertEquals("Cached Laptop", products[0].name)
    }

    @Test
    fun `returns network error when both network and cache fail`() = runTest {
        fakeApi.setShouldFail(true)
        // Cache is empty — no fallback

        val result = repository.getProducts()

        assertTrue(result is AppResult.Error)
        assertEquals(ErrorCode.NETWORK_ERROR, (result as AppResult.Error).code)
    }
}
```

Testing the data mapping layer is important because mapping bugs are common and subtle. A DTO field named `price_cents` that gets mapped to a domain field named `price` might be off by a factor of 100 if the mapper doesn't convert cents to dollars. A nullable DTO field that maps to a non-nullable domain field needs a default value, and the test should verify that default is correct. Mapping tests catch these issues before they reach the UI.

```kotlin
@Test
fun `maps DTO to domain model correctly`() = runTest {
    fakeApi.setProducts(listOf(
        ProductDto(
            id = "p1",
            name = "Laptop",
            priceCents = 99900,
            category = "electronics",
            inStock = true,
            rating = 4.5,
            imageUrl = null // Nullable in DTO
        )
    ))

    val result = repository.getProducts()

    assertTrue(result is AppResult.Success)
    val product = (result as AppResult.Success).data[0]
    assertEquals("p1", product.id)
    assertEquals("Laptop", product.name)
    assertEquals(99900, product.priceCents)
    assertEquals(ProductCategory.ELECTRONICS, product.category)
    assertTrue(product.inStock)
    assertEquals(4.5, product.rating, 0.01)
    assertEquals("", product.imageUrl) // Default for null
}
```

Testing the `safeApiCall` wrapper itself is valuable because it's the single point where exception mapping happens. These tests verify that each exception type maps to the correct `ErrorCode`, and most importantly, that `CancellationException` is re-thrown rather than caught.

```kotlin
class SafeApiCallTest {

    @Test
    fun `maps HttpException 401 to UNAUTHORIZED`() = runTest {
        val result = safeApiCall {
            throw HttpException(Response.error<Any>(401, "".toResponseBody()))
        }
        assertTrue(result is AppResult.Error)
        assertEquals(ErrorCode.UNAUTHORIZED, (result as AppResult.Error).code)
    }

    @Test
    fun `maps HttpException 404 to NOT_FOUND`() = runTest {
        val result = safeApiCall {
            throw HttpException(Response.error<Any>(404, "".toResponseBody()))
        }
        assertTrue(result is AppResult.Error)
        assertEquals(ErrorCode.NOT_FOUND, (result as AppResult.Error).code)
    }

    @Test
    fun `maps IOException to NETWORK_ERROR`() = runTest {
        val result = safeApiCall { throw IOException("No network") }
        assertTrue(result is AppResult.Error)
        assertEquals(ErrorCode.NETWORK_ERROR, (result as AppResult.Error).code)
    }

    @Test(expected = CancellationException::class)
    fun `re-throws CancellationException`() = runTest {
        safeApiCall { throw CancellationException("Scope cancelled") }
    }

    @Test
    fun `returns success for successful call`() = runTest {
        val result = safeApiCall { "data" }
        assertTrue(result is AppResult.Success)
        assertEquals("data", (result as AppResult.Success).data)
    }
}
```

The fake data sources for Repository tests need to be more detailed than the fakes for ViewModel tests because they simulate the behavior of real APIs and databases. A `FakeProductDao` should actually store data in a list and support queries. A `FakeProductApi` should support both success and failure scenarios with configurable responses.

```kotlin
class FakeProductApi : ProductApi {
    private val products = mutableListOf<ProductDto>()
    private var shouldFail = false
    private var failureCode = 500

    fun setProducts(productList: List<ProductDto>) {
        products.clear()
        products.addAll(productList)
    }

    fun setShouldFail(fail: Boolean, code: Int = 500) {
        shouldFail = fail
        failureCode = code
    }

    override suspend fun getProducts(): List<ProductDto> {
        if (shouldFail) throw HttpException(
            Response.error<Any>(failureCode, "".toResponseBody())
        )
        return products.toList()
    }

    override suspend fun getProduct(id: String): ProductDto {
        if (shouldFail) throw HttpException(
            Response.error<Any>(failureCode, "".toResponseBody())
        )
        return products.find { it.id == id }
            ?: throw HttpException(Response.error<Any>(404, "".toResponseBody()))
    }
}

class FakeProductDao : ProductDao {
    private val products = mutableListOf<ProductEntity>()

    override fun observeAll(): Flow<List<ProductEntity>> = flow {
        emit(products.toList())
    }

    override fun getAll(): List<ProductEntity> = products.toList()

    override suspend fun insertAll(entities: List<ProductEntity>) {
        products.clear()
        products.addAll(entities)
    }

    override suspend fun insert(entity: ProductEntity) {
        products.removeAll { it.id == entity.id }
        products.add(entity)
    }

    override suspend fun deleteAll() { products.clear() }
}
```

#### Common Mistakes

A common mistake is testing the Repository with mocked data sources and only verifying that specific methods were called. This misses the actual value of Repository tests — verifying the coordination logic. If you mock the DAO and only verify `dao.insertAll()` was called, you haven't tested that the data was actually cached correctly or that the mapping from DTO to Entity was done right. Use fakes that store data, and verify the stored data matches expectations.

Another mistake is not testing the cache fallback behavior. The most important Repository tests are the ones that verify behavior when the network fails and the cache has data. This is the scenario your users encounter most often — intermittent connectivity on mobile networks. If your Repository tests only cover the happy path (network works, data is fresh), you've missed the most important test scenarios.

**Key takeaway:** Repository tests verify the coordination between data sources — caching, fallback, mapping, and error handling. Use fake APIs and fake DAOs, not mocks. Test network success + cache, network failure + cache fallback, and network failure + empty cache. Test data mapping explicitly — mapping bugs are common and subtle. Always test that `safeApiCall` re-throws `CancellationException`.

### Lesson 10.5: Testing Coroutines

Coroutine testing requires understanding two concepts: dispatcher replacement and time control. Dispatcher replacement lets you run coroutines that would normally use `Dispatchers.Main` or `Dispatchers.IO` on a test dispatcher instead. Time control lets you fast-forward through `delay()` calls instantly, making tests that involve debouncing, timeouts, or periodic polling run in milliseconds instead of seconds.

`StandardTestDispatcher` is the workhorse of coroutine testing. Coroutines launched on this dispatcher are queued but don't run until you explicitly advance the scheduler. This gives you control over execution order and lets you assert on intermediate states. When you call `advanceUntilIdle()`, all queued coroutines run until there's nothing left to execute. When you call `advanceTimeBy(300)`, the virtual clock moves forward 300 milliseconds and any `delay()` calls that would have completed in that time window execute.

```kotlin
@Test
fun `debounced search waits 300ms before executing`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val fakeRepo = FakeSearchRepository()
    fakeRepo.setResults("lap", listOf(Product("1", "Laptop", 99900)))

    val viewModel = SearchViewModel(fakeRepo, testDispatcher)

    viewModel.onSearchQueryChanged("l")
    advanceTimeBy(100) // Only 100ms passed
    viewModel.onSearchQueryChanged("la")
    advanceTimeBy(100) // Only 200ms total since last keystroke
    viewModel.onSearchQueryChanged("lap")
    advanceTimeBy(100) // Only 100ms since "lap" — debounce hasn't fired yet

    viewModel.state.test {
        // Still loading — debounce hasn't completed
        assertTrue(awaitItem() is SearchState.Loading)
        cancelAndIgnoreRemainingEvents()
    }

    advanceTimeBy(200) // Now 300ms since "lap" — debounce fires
    advanceUntilIdle()

    viewModel.state.test {
        val state = awaitItem()
        assertTrue(state is SearchState.Success)
        assertEquals(1, (state as SearchState.Success).results.size)
        cancelAndIgnoreRemainingEvents()
    }
}
```

The Turbine library is essential for testing `Flow` and `StateFlow` emissions. Without Turbine, testing flows requires launching a coroutine to collect values into a list, waiting for emissions with timeouts, and manually managing the collection job. Turbine wraps all of this into a clean `flow.test { }` block where you call `awaitItem()` to get the next emission and assert on it. If no emission arrives within the timeout (default 3 seconds), the test fails with a clear message.

```kotlin
@Test
fun `state flow emits loading then success in order`() = runTest {
    val fakeRepo = FakeProductRepository()
    fakeRepo.setProducts(listOf(Product("1", "Laptop", 99900)))
    val viewModel = ProductListViewModel(fakeRepo)

    viewModel.state.test {
        // First emission — Loading (initial state)
        assertEquals(ProductListState.Loading, awaitItem())

        advanceUntilIdle()

        // Second emission — Success (after data loads)
        val success = awaitItem()
        assertTrue(success is ProductListState.Success)
        assertEquals(1, (success as ProductListState.Success).products.size)

        cancelAndIgnoreRemainingEvents()
    }
}
```

Testing coroutines that use `withContext(Dispatchers.IO)` requires injecting the dispatcher as a dependency. If your Repository hardcodes `withContext(Dispatchers.IO)`, the test can't control execution on the IO dispatcher. Instead, inject the dispatcher through the constructor and replace it with the test dispatcher in tests.

```kotlin
// Hardcoded dispatcher — untestable
class ProductRepository(private val api: ProductApi) {
    suspend fun getProducts(): List<Product> = withContext(Dispatchers.IO) {
        api.getProducts().map { it.toDomain() }
    }
}

// Injected dispatcher — testable
class ProductRepository(
    private val api: ProductApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun getProducts(): List<Product> = withContext(ioDispatcher) {
        api.getProducts().map { it.toDomain() }
    }
}

// Test replaces IO dispatcher with test dispatcher
@Test
fun `getProducts maps DTOs to domain models`() = runTest {
    val fakeApi = FakeProductApi()
    fakeApi.setProducts(listOf(ProductDto("1", "Laptop", 99900)))
    val repo = ProductRepository(fakeApi, StandardTestDispatcher(testScheduler))

    val products = repo.getProducts()

    assertEquals(1, products.size)
    assertEquals("Laptop", products[0].name)
}
```

Testing flows that combine multiple sources requires setting up all the sources before the flow starts collecting. A common pattern in ViewModels is combining multiple `StateFlow` or `Flow` emissions using `combine()`. Each source emits independently, and the combined flow emits whenever any source changes. Testing this requires emitting values from each source and verifying the combined output.

```kotlin
@Test
fun `combines user and orders into dashboard state`() = runTest {
    val fakeUserRepo = FakeUserRepository()
    val fakeOrderRepo = FakeOrderRepository()

    fakeUserRepo.setUser(User("u1", "Alice", isPremium = true))
    fakeOrderRepo.setOrders(listOf(
        Order("o1", "u1", 15000, OrderStatus.DELIVERED),
        Order("o2", "u1", 8900, OrderStatus.SHIPPED)
    ))

    val viewModel = DashboardViewModel(fakeUserRepo, fakeOrderRepo)
    advanceUntilIdle()

    viewModel.state.test {
        val state = awaitItem()
        assertTrue(state is DashboardState.Success)
        val dashboard = state as DashboardState.Success
        assertEquals("Alice", dashboard.userName)
        assertEquals(2, dashboard.recentOrders.size)
        assertTrue(dashboard.isPremium)
        cancelAndIgnoreRemainingEvents()
    }
}
```

Testing timeout behavior uses `advanceTimeBy()` to simulate the passage of time. If your ViewModel has a timeout that shows an error after 10 seconds of no response, you can advance the virtual clock by 10 seconds instantly without waiting for real time.

```kotlin
@Test
fun `shows timeout error after 10 seconds`() = runTest {
    val fakeRepo = FakeProductRepository()
    fakeRepo.setDelay(15_000) // Simulate a 15-second response
    val viewModel = ProductViewModel(fakeRepo)

    viewModel.loadProduct("p1")
    advanceTimeBy(10_000) // Jump ahead 10 seconds

    viewModel.state.test {
        val state = awaitItem()
        assertTrue(state is ProductState.Error)
        assertEquals(ErrorCode.TIMEOUT, (state as ProductState.Error).code)
        cancelAndIgnoreRemainingEvents()
    }
}
```

#### Common Mistakes

The most common mistake is using `Thread.sleep()` in coroutine tests. `Thread.sleep()` blocks the real thread for the specified duration, making tests slow and flaky. Use `advanceTimeBy()` instead — it advances virtual time instantly and is deterministic. A test that uses `Thread.sleep(5000)` takes 5 seconds to run. The same test with `advanceTimeBy(5000)` takes milliseconds.

Another mistake is using `Dispatchers.Unconfined` in tests. `Unconfined` runs coroutines eagerly and immediately, which means you can't test intermediate states or ordering. It's sometimes used as a quick fix, but it hides real timing bugs. `StandardTestDispatcher` is the correct choice because it gives you full control over execution order and timing.

**Key takeaway:** Use `StandardTestDispatcher` for explicit coroutine control and `advanceTimeBy()` for time-dependent behavior. Inject dispatchers as constructor parameters so tests can replace them. Use Turbine's `flow.test { awaitItem() }` for asserting on flow emissions. Never use `Thread.sleep()` or `Dispatchers.Unconfined` in tests — they make tests slow, flaky, or wrong.

### Lesson 10.6: Integration and Architecture Tests

Unit tests verify individual components in isolation. Integration tests verify that components work together correctly. In Android architecture, the most valuable integration tests verify the flow from ViewModel through Use Case to Repository, with fakes replacing only the external boundaries (network and database). This middle ground gives you confidence that the layers integrate correctly without the cost and complexity of full end-to-end tests.

The integration test setup uses the real ViewModel, real Use Cases, real Repositories, but fake APIs and fake DAOs. This means you're testing the actual wiring between layers — the dependency injection graph, the data flow, the error propagation path. If a Use Case passes the wrong parameter to a Repository method, the integration test catches it. If the Repository's error mapping produces an error code that the ViewModel doesn't handle, the integration test catches it.

```kotlin
class ProductFeatureIntegrationTest {
    private val fakeApi = FakeProductApi()
    private val fakeDao = FakeProductDao()
    private val testDispatcher = StandardTestDispatcher()

    // Real implementations wired together
    private val repository = ProductRepositoryImpl(fakeApi, fakeDao)
    private val getProductUseCase = GetProductUseCase(repository)
    private val searchProductsUseCase = SearchProductsUseCase(repository)

    @Before fun setup() { Dispatchers.setMain(testDispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun `full flow - loads product and displays`() = runTest(testDispatcher) {
        fakeApi.setProducts(listOf(ProductDto("p1", "Laptop", 99900)))

        val viewModel = ProductDetailViewModel(
            getProduct = getProductUseCase,
            savedStateHandle = SavedStateHandle(mapOf("productId" to "p1"))
        )

        advanceUntilIdle()

        viewModel.state.test {
            val state = awaitItem()
            assertTrue(state is ProductState.Success)
            assertEquals("Laptop", (state as ProductState.Success).product.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `full flow - network error falls back to cache`() = runTest(testDispatcher) {
        // Pre-populate cache
        fakeDao.insert(ProductEntity("p1", "Cached Laptop", 99900))
        fakeApi.setShouldFail(true)

        val viewModel = ProductDetailViewModel(
            getProduct = getProductUseCase,
            savedStateHandle = SavedStateHandle(mapOf("productId" to "p1"))
        )

        advanceUntilIdle()

        viewModel.state.test {
            val state = awaitItem()
            assertTrue(state is ProductState.Success)
            assertEquals("Cached Laptop", (state as ProductState.Success).product.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `full flow - search with empty results`() = runTest(testDispatcher) {
        fakeApi.setProducts(emptyList())

        val viewModel = SearchViewModel(searchProductsUseCase)
        viewModel.onSearch("nonexistent")

        advanceUntilIdle()

        viewModel.state.test {
            val state = awaitItem()
            assertTrue(state is SearchState.Empty)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

Integration tests are especially valuable for testing the error handling pipeline end-to-end. A unit test verifies that `safeApiCall` maps `HttpException(401)` to `ErrorCode.UNAUTHORIZED`. An integration test verifies that a 401 from the API propagates all the way through the Repository, Use Case, and ViewModel to produce a `NavigateToLogin` event that the UI can handle. This end-to-end error path verification catches issues that unit tests miss — like a ViewModel that handles `UNAUTHORIZED` but maps it to `Error` state instead of a navigation event.

```kotlin
@Test
fun `error propagation - 401 triggers login navigation`() = runTest(testDispatcher) {
    fakeApi.setShouldFail(true, code = 401)

    val viewModel = ProductDetailViewModel(
        getProduct = getProductUseCase,
        savedStateHandle = SavedStateHandle(mapOf("productId" to "p1"))
    )

    viewModel.events.test {
        advanceUntilIdle()
        val event = awaitItem()
        assertTrue(event is ProductEvent.NavigateToLogin)
        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `error propagation - 500 shows error state with retry`() = runTest(testDispatcher) {
    fakeApi.setShouldFail(true, code = 500)

    val viewModel = ProductDetailViewModel(
        getProduct = getProductUseCase,
        savedStateHandle = SavedStateHandle(mapOf("productId" to "p1"))
    )

    advanceUntilIdle()

    viewModel.state.test {
        val state = awaitItem()
        assertTrue(state is ProductState.Error)
        assertEquals(ErrorCode.SERVER_ERROR, (state as ProductState.Error).code)
        cancelAndIgnoreRemainingEvents()
    }
}
```

Architecture tests are a specialized form of integration tests that verify structural properties of your codebase. While you can use tools like ArchUnit or custom lint rules for automated architecture enforcement, conceptual architecture tests verify that your layer boundaries are respected, that data flows in the correct direction, and that no layer skips another.

One practical architecture test is verifying that your ViewModel never directly depends on data layer types. If the ViewModel receives a `ProductEntity` (a Room entity) instead of a `Product` (a domain model), the layer boundary is broken — the ViewModel now depends on the database schema. This kind of test can be written manually or enforced through module boundaries in a multi-module project.

```kotlin
// Architecture test: verify the ViewModel state contains domain types only
@Test
fun `product state uses domain model not entity`() {
    // This test exists to prevent accidental data layer leakage
    val successState = ProductState.Success(
        product = Product("p1", "Laptop", 99900) // Domain model
    )
    // If someone changes ProductState.Success to accept ProductEntity,
    // this test won't compile — catching the boundary violation
    assertTrue(successState.product is Product)
}
```

Multi-module projects get architecture enforcement for free through Kotlin's visibility modifiers. If the `feature:product` module depends on the `data:product` module's public interface but not its internal implementation, the ViewModel physically cannot reference `ProductEntity` because it's marked `internal` in the data module. This is the strongest form of architecture testing — compile-time enforcement rather than runtime verification.

```kotlin
// Module structure enforces architecture
// :data:product module
internal class ProductEntity(/* ... */) // Internal — invisible outside data module
class Product(/* ... */) // Public — domain model visible to feature module

interface ProductRepository { // Public — contract visible to feature module
    suspend fun getProduct(id: String): AppResult<Product>
}

internal class ProductRepositoryImpl(/* ... */) : ProductRepository // Internal impl

// :feature:product module
// Can see: Product, ProductRepository (public)
// Cannot see: ProductEntity, ProductRepositoryImpl (internal)
// Architecture boundary enforced by the compiler
```

**Key takeaway:** Integration tests verify that layers work together correctly — data flows from API through Repository and Use Case to ViewModel state. They catch wiring errors and end-to-end error propagation issues that unit tests miss. Use real implementations for everything except the external boundaries (API, DAO). Architecture tests verify structural properties — layer boundaries, type safety, and dependency direction. Multi-module projects get the strongest architecture enforcement through `internal` visibility modifiers.

### Lesson 10.7: Testing Checklist

This lesson is a practical reference — a checklist you can use before shipping any feature to verify that your test coverage addresses the scenarios that matter most. Not every item needs its own test, but every item should be considered. The checklist is organized by architectural layer, starting from the ViewModel and working down.

**ViewModel Testing Checklist:**

Every ViewModel should have tests for initial state, success state, every distinct error state, loading transitions, and user-triggered actions. The initial state test verifies what the user sees immediately after the screen opens — usually a loading indicator or empty state. The success state test verifies that data from the Repository is correctly transformed into UI state. Error state tests verify that each error code produces the correct UI behavior — some errors show full-screen error states, some show snackbars, some trigger navigation.

```kotlin
// ViewModel testing checklist in practice
class OrderListViewModelTest {
    private val fakeRepo = FakeOrderRepository()
    private val testDispatcher = StandardTestDispatcher()

    @Before fun setup() { Dispatchers.setMain(testDispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    // Initial state
    @Test fun `initial state is loading`() = runTest(testDispatcher) {
        val vm = OrderListViewModel(fakeRepo)
        vm.state.test {
            assertEquals(OrderListState.Loading, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // Success state
    @Test fun `displays orders on success`() = runTest(testDispatcher) {
        fakeRepo.setOrders(listOf(Order("o1", "Product A", 5000)))
        val vm = OrderListViewModel(fakeRepo)
        advanceUntilIdle()
        vm.state.test {
            assertTrue(awaitItem() is OrderListState.Success)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // Empty state
    @Test fun `displays empty state when no orders`() = runTest(testDispatcher) {
        fakeRepo.setOrders(emptyList())
        val vm = OrderListViewModel(fakeRepo)
        advanceUntilIdle()
        vm.state.test {
            assertTrue(awaitItem() is OrderListState.Empty)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // Error state
    @Test fun `displays error on network failure`() = runTest(testDispatcher) {
        fakeRepo.setShouldFail(true, ErrorCode.NETWORK_ERROR)
        val vm = OrderListViewModel(fakeRepo)
        advanceUntilIdle()
        vm.state.test {
            val state = awaitItem()
            assertTrue(state is OrderListState.Error)
            assertEquals(ErrorCode.NETWORK_ERROR, (state as OrderListState.Error).code)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // User action — refresh
    @Test fun `refresh reloads data`() = runTest(testDispatcher) {
        fakeRepo.setOrders(listOf(Order("o1", "Product A", 5000)))
        val vm = OrderListViewModel(fakeRepo)
        advanceUntilIdle()

        // Add new order
        fakeRepo.setOrders(listOf(
            Order("o1", "Product A", 5000),
            Order("o2", "Product B", 3000)
        ))
        vm.refresh()
        advanceUntilIdle()

        vm.state.test {
            val state = awaitItem() as OrderListState.Success
            assertEquals(2, state.orders.size)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

**Use Case Testing Checklist:**

Test the primary success path, every distinct failure mode, validation logic, edge cases (empty inputs, boundary values), and the coordination between multiple repositories. For Use Cases that coordinate sequential operations, verify that failures in early operations prevent later operations from executing.

**Repository Testing Checklist:**

Test network success with cache update, network failure with cache fallback, network failure with empty cache, data mapping from DTO to domain model, and the `safeApiCall` error code mapping. For offline-first repositories, test the full sync cycle: cached data shown immediately, background refresh updates the cache, and UI updates with fresh data.

**Coroutine Testing Checklist:**

Test debounce and throttle behavior with `advanceTimeBy()`. Test cancellation — verify that when a scope is cancelled, in-flight operations don't produce side effects. Test concurrent operations — verify that multiple simultaneous requests don't corrupt shared state. Test retry behavior — verify that failed operations retry the correct number of times with the correct backoff.

```kotlin
// Cancellation test — verify no side effects after cancellation
@Test
fun `cancelled load does not update state`() = runTest {
    val fakeRepo = FakeProductRepository()
    fakeRepo.setDelay(5000) // Slow response
    val viewModel = ProductViewModel(fakeRepo)

    val job = viewModel.loadProduct("p1")

    advanceTimeBy(1000) // Start loading but don't finish
    job.cancel() // Cancel the operation
    advanceUntilIdle()

    // State should still be Loading, not Success or Error
    viewModel.state.test {
        assertTrue(awaitItem() is ProductState.Loading)
        cancelAndIgnoreRemainingEvents()
    }
}
```

**Process Death Testing Checklist:**

Test that critical data survives process death via `SavedStateHandle`. Verify that the ViewModel reads its arguments from `SavedStateHandle` on recreation. Verify that transient state (like scroll position or form input) is either saved to `SavedStateHandle` or gracefully reset on recreation. Process death is the most under-tested scenario in Android apps, and it's where users encounter the most frustrating bugs.

```kotlin
// Process death test — verify SavedStateHandle preserves critical data
@Test
fun `survives process death via SavedStateHandle`() = runTest(testDispatcher) {
    fakeRepo.setProduct(Product("p1", "Laptop", 99900))
    val savedState = SavedStateHandle(mapOf("productId" to "p1"))

    // First instance
    val vm1 = ProductDetailViewModel(fakeRepo, savedState)
    advanceUntilIdle()
    vm1.state.test {
        assertTrue(awaitItem() is ProductState.Success)
        cancelAndIgnoreRemainingEvents()
    }

    // Simulate process death — recreate with same SavedStateHandle
    val vm2 = ProductDetailViewModel(fakeRepo, savedState)
    advanceUntilIdle()
    vm2.state.test {
        val state = awaitItem()
        assertTrue(state is ProductState.Success)
        assertEquals("Laptop", (state as ProductState.Success).product.name)
        cancelAndIgnoreRemainingEvents()
    }
}
```

**What Not to Test:**

Not everything needs a test. Don't test Android framework behavior — you don't need to verify that `StateFlow` emits values or that `viewModelScope` cancels on `onCleared()`. Google tests those. Don't test pass-through functions that just delegate to another layer without adding logic. Don't test data classes — Kotlin generates `equals()`, `hashCode()`, and `copy()` correctly. Don't test private methods directly — test them through the public API that uses them. Focus your testing effort on code that contains logic, makes decisions, coordinates components, or handles errors.

The 80/20 rule applies to testing: 80% of your bugs come from 20% of your code. That 20% is typically the coordination logic in ViewModels and Use Cases, the error handling pipeline, and the data mapping between layers. Focus your testing effort there.

```kotlin
// Don't test: pass-through function
class GetUserUseCase(private val repo: UserRepository) {
    suspend operator fun invoke(id: String) = repo.getUser(id) // Just delegation
}
// Writing a test for this adds maintenance cost but catches no bugs

// Do test: function with actual logic
class GetUserWithDiscountUseCase(
    private val userRepo: UserRepository,
    private val discountRepo: DiscountRepository
) {
    suspend operator fun invoke(userId: String): AppResult<UserWithDiscount> {
        val user = userRepo.getUser(userId)
        if (user is AppResult.Error) return user

        val discount = discountRepo.getDiscount((user as AppResult.Success).data.tier)
        return AppResult.Success(
            UserWithDiscount(user.data, discount.getOrNull()?.percentage ?: 0)
        )
    }
}
// This has logic worth testing: error handling, graceful degradation, data combining
```

#### Common Mistakes

The most pervasive testing mistake is writing tests after the code is finished and the feature is "done." Tests written as an afterthought tend to be shallow — they verify the happy path and call it a day. Tests written alongside the code or even before it (TDD-style) tend to be thorough because they force you to think about edge cases and error handling as you build the feature. You don't need to practice strict TDD, but writing tests concurrently with code produces better coverage than writing them later.

Another mistake is measuring test quality by coverage percentage alone. A codebase with 90% line coverage but no error handling tests is worse than a codebase with 60% coverage that tests every error path and edge case. Coverage measures quantity, not quality. Focus on testing the scenarios that matter — errors, edge cases, state transitions — not on hitting a coverage number.

**Key takeaway:** Use the checklist to verify test coverage for every feature: initial state, success, empty, every error type, user actions, process death, cancellation, and data mapping. Focus testing effort on code that contains logic and makes decisions. Don't test framework behavior, pass-throughs, or data classes. Write tests concurrently with code, not as an afterthought. Quality of test scenarios matters more than coverage percentage.

### Quiz: Testing Architecture

#### Why are fakes preferred over mocks for testing?

- ❌ Fakes are faster to write
- ❌ Fakes use less memory
- ✅ Fakes are reusable, catch interface changes at compile time, and test behavior rather than implementation
- ❌ Fakes don't require any setup

> **Explanation:** Fakes are real implementations with in-memory data. They're reusable across tests, catch breaking interface changes at compile time (mocks don't), and verify actual behavior rather than just checking that specific methods were called.

#### What testing library function is used to test StateFlow emissions in order?

- ❌ collectLatest {}
- ✅ Turbine's flow.test { awaitItem() }
- ❌ runBlocking { collect {} }
- ❌ assertFlow {}

> **Explanation:** The Turbine library's `test {}` extension on Flow allows you to assert emissions in order using `awaitItem()`. This makes it easy to verify that a ViewModel emits Loading first, then Success or Error, in the correct sequence.

#### How do you test time-dependent coroutine behavior like debouncing?

- ❌ Using Thread.sleep() in tests
- ❌ Using runBlocking with real delays
- ✅ Using StandardTestDispatcher with advanceTimeBy() to control virtual time
- ❌ Using Dispatchers.Unconfined

> **Explanation:** `StandardTestDispatcher` with `advanceTimeBy()` gives you control over virtual time. You can simulate 300ms of debounce delay instantly, making tests fast and deterministic without relying on real-time delays.

### Coding Challenge: Write Complete Tests for a Feature

Create a `FakeProductRepository`, and use it to write ViewModel, Use Case, and Repository integration tests for a product detail feature. Include tests for success, error, offline cache, and process death.

#### Solution

```kotlin
// Fake Repository
class FakeProductRepository : ProductRepository {
    private val products = mutableMapOf<String, Product>()
    private var shouldFail = false
    private var networkAvailable = true

    fun setProduct(product: Product) { products[product.id] = product }
    fun setShouldFail(fail: Boolean) { shouldFail = fail }
    fun setNetworkAvailable(available: Boolean) { networkAvailable = available }

    override fun observeProduct(id: String): Flow<Product?> = flow {
        emit(products[id])
    }

    override suspend fun refreshProduct(id: String) {
        if (shouldFail) throw IOException("API error")
        if (!networkAvailable) throw IOException("No network")
    }

    override suspend fun getProduct(id: String): AppResult<Product> {
        if (shouldFail) return AppResult.Error("Failed", code = ErrorCode.SERVER_ERROR)
        val product = products[id]
            ?: return AppResult.Error("Not found", code = ErrorCode.NOT_FOUND)
        return AppResult.Success(product)
    }
}

// ViewModel Tests
class ProductDetailViewModelTest {
    private val fakeRepo = FakeProductRepository()
    private val testDispatcher = StandardTestDispatcher()

    @Before fun setup() { Dispatchers.setMain(testDispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun `displays product on success`() = runTest(testDispatcher) {
        fakeRepo.setProduct(Product("p1", "Laptop", 99900))
        val vm = ProductDetailViewModel(fakeRepo, SavedStateHandle(mapOf("productId" to "p1")))

        advanceUntilIdle()

        vm.state.test {
            val state = awaitItem()
            assertTrue(state is ProductState.Success)
            assertEquals("Laptop", (state as ProductState.Success).product.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows error when product not found`() = runTest(testDispatcher) {
        val vm = ProductDetailViewModel(fakeRepo, SavedStateHandle(mapOf("productId" to "missing")))

        advanceUntilIdle()

        vm.state.test {
            assertTrue(awaitItem() is ProductState.NotFound)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows cached product when network fails`() = runTest(testDispatcher) {
        fakeRepo.setProduct(Product("p1", "Cached Laptop", 99900))
        fakeRepo.setNetworkAvailable(false)
        val vm = ProductDetailViewModel(fakeRepo, SavedStateHandle(mapOf("productId" to "p1")))

        advanceUntilIdle()

        vm.state.test {
            val state = awaitItem()
            assertTrue(state is ProductState.Success)
            assertEquals("Cached Laptop", (state as ProductState.Success).product.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `product ID survives process death via SavedStateHandle`() = runTest(testDispatcher) {
        fakeRepo.setProduct(Product("p1", "Laptop", 99900))
        val savedState = SavedStateHandle(mapOf("productId" to "p1"))

        // Simulate process death and recreation
        val vm1 = ProductDetailViewModel(fakeRepo, savedState)
        advanceUntilIdle()

        // Recreate with same SavedStateHandle
        val vm2 = ProductDetailViewModel(fakeRepo, savedState)
        advanceUntilIdle()

        vm2.state.test {
            assertTrue(awaitItem() is ProductState.Success)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

The test suite covers all critical scenarios: success, error, offline cache, and process death. Each test uses the same `FakeProductRepository`, configured differently for each scenario. Tests are deterministic because of `StandardTestDispatcher`.

---

Thank You for completing the Android Architecture Mastery course! Good architecture is invisible when it works and painful when it's missing. The patterns you've learned — MVVM, MVI, Clean Architecture, Repository, modularization, error handling, and testing — are the foundation of every well-built Android app. The key isn't memorizing patterns. It's understanding the tradeoffs behind each decision and choosing the right tool for your specific context. Architecture is a series of tradeoffs, and now you have the knowledge to make them deliberately. 🏗️
