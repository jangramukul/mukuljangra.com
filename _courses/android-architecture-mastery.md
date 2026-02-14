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

**Key takeaway:** Architecture is about separation of concerns — each class has one job, one reason to change. This makes code testable, maintainable, and understandable.

### Lesson 1.2: Google's Recommended Architecture

Google's official architecture guide defines three layers that form the backbone of every well-structured Android app. Understanding these layers is foundational — every pattern we'll cover in this course builds on top of this layered structure.

The **UI Layer** displays data and handles user input. It contains two sub-components: UI elements (Compose composables or XML Views) and state holders (ViewModel). The UI elements are dumb — they receive state and render it. The ViewModel holds the state, processes user events, and coordinates with the data layer. The UI layer never fetches data directly, never writes to databases, and never applies business rules.

The **Domain Layer** is optional but recommended for complex apps. It contains business logic encapsulated in Use Cases (also called Interactors). The Domain layer sits between UI and Data, providing a clean API for the ViewModel to consume. It coordinates between multiple repositories, applies business rules, and transforms data. The Domain layer has zero Android dependencies — it's pure Kotlin, which makes it trivially testable.

The **Data Layer** manages data from network APIs, local databases, SharedPreferences, and other sources. It contains Repositories and Data Sources. Repositories are the API that the rest of the app uses to access data — they coordinate between remote and local sources, handle caching, and manage data freshness. Data Sources are the actual implementations that talk to Retrofit, Room, or DataStore.

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

**Data flows down, events flow up.** The UI layer observes state from ViewModel. ViewModel gets data from Use Cases or Repositories. Repositories coordinate data sources. No layer reaches upward — the Repository never imports ViewModel classes, and the Domain layer never imports UI classes.

**Key takeaway:** Follow the dependency rule — outer layers depend on inner layers, never the reverse. The UI depends on the ViewModel, but the ViewModel never imports UI classes.

### Lesson 1.3: Dependency Rule and Inversion

The Dependency Inversion Principle is the most important SOLID principle for Android architecture. It states that high-level modules should not depend on low-level modules — both should depend on abstractions. In practice, this means your ViewModel depends on a `UserRepository` interface, not on `UserRepositoryImpl` that uses Retrofit and Room.

Why does this matter? Because without dependency inversion, changing your network library from Retrofit to Ktor means changing every ViewModel that uses the repository. With dependency inversion, you change one implementation class and everything else continues to work. The same applies to testing — you swap the real implementation for a fake, and the ViewModel doesn't know the difference.

Dependency inversion also enforces the direction of the dependency rule. The domain layer defines interfaces (`UserRepository`), and the data layer implements them (`UserRepositoryImpl`). This means the domain layer has zero knowledge of Retrofit, Room, or any other framework. It's pure Kotlin — portable, testable, and stable.

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

**Key takeaway:** Depend on abstractions, not implementations. This is the Dependency Inversion Principle — it makes your code testable (swap implementations in tests) and flexible (change database without touching ViewModel).

### Lesson 1.4: SOLID Principles in Android

SOLID principles aren't abstract theory — they're the engineering foundation that makes architecture decisions stick. Every principle maps directly to a common Android architecture problem.

**Single Responsibility (S)** — A class should have one reason to change. A ViewModel that fetches data, applies business rules, formats strings, tracks analytics, AND manages navigation has five reasons to change. Split it: the ViewModel manages state, a Use Case applies business rules, a Repository fetches data, a Formatter handles display logic, and an AnalyticsTracker handles tracking. Each class is focused, testable, and independently modifiable.

**Open-Closed (O)** — Classes should be open for extension but closed for modification. A `PaymentProcessor` that uses `when` branches for every payment method violates this — adding Apple Pay means modifying the existing class. Instead, define a `PaymentMethod` interface and implement `CreditCardPayment`, `GooglePayPayment`, `ApplePayPayment`. Adding a new method means adding a new class, not touching existing ones.

**Liskov Substitution (L)** — Subtypes must be substitutable for their base types. If `UserRepository` has a `getUser()` method that returns a `User`, then `CachedUserRepository` must also return a `User` without surprising behavior. A `CachedUserRepository` that throws an exception when the cache is empty instead of returning null violates this — the caller expected the same contract.

**Interface Segregation (I)** — Clients should not depend on methods they don't use. A `UserRepository` with `getUser()`, `updateUser()`, `deleteUser()`, `getUserPosts()`, `getUserSettings()`, and `getUserAnalytics()` forces every consumer to depend on all six methods. Split it into `UserReadRepository`, `UserWriteRepository`, and `UserAnalyticsRepository`.

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

**Key takeaway:** SOLID principles prevent architecture decay. Single Responsibility keeps classes focused, Open-Closed prevents modification cascades, and Dependency Inversion enables testing and flexibility.

### Lesson 1.5: The Law of Demeter

The Law of Demeter (also called "don't talk to strangers") states that an object should only interact with its immediate dependencies, not with dependencies of dependencies. In Android architecture, this principle prevents tight coupling and keeps layer boundaries clean.

Consider a chat application with three classes: `ChatManager`, `MessageRepository`, and `DatabaseConnection`. The `ChatManager` should talk to `MessageRepository`, and `MessageRepository` should talk to `DatabaseConnection`. But `ChatManager` should never reach through `MessageRepository` to directly access `DatabaseConnection`. Each layer only knows about the layer directly below it.

This principle is especially important when designing APIs for internal use. If your ViewModel accesses `repository.dataSource.database.query()`, you've created a chain of dependencies where changing the database implementation requires updating the ViewModel. Instead, the ViewModel calls `repository.getMessages()`, and the repository internally decides how to get them.

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

Understanding where Android architecture came from helps you understand why current patterns exist. Each era solved real problems from the previous one and introduced new problems for the next. It's not progress toward perfection — it's tradeoffs shifting as tools improved and the platform evolved.

### Lesson 2.1: The Wild West — MVC (2008-2012)

Android launched in 2008 with Activity as the primary building block. There was no architecture guidance from Google — Activity was your controller, your view, and often your model. You fetched data in `onCreate`, parsed JSON with bare `try/catch` blocks, stored results in member variables, and updated Views directly. Background work meant raw `Thread` or `AsyncTask`.

The problems were immediate and severe. `AsyncTask` held implicit references to the Activity, causing memory leaks and crashes when the Activity was destroyed before the task completed. Configuration changes (screen rotation) destroyed and recreated the Activity, wiping out all in-memory state. There was no lifecycle management, so developers had to manually track whether the Activity was still alive before touching UI. Testing was impossible because all logic lived inside framework classes.

But here's the thing — it worked for the apps of that era. Apps in 2008-2012 were simple by today's standards. A few screens, basic CRUD, minimal state. The architecture didn't need to scale because the apps didn't. The problems only became painful as apps grew complex.

```kotlin
// The 2010 way — everything in the Activity
class OrderActivity : Activity() {
    private var orders: List<Order>? = null // lost on rotation

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_orders)

        val task = object : AsyncTask<Void, Void, List<Order>>() {
            override fun doInBackground(vararg params: Void?): List<Order> {
                return ApiClient.fetchOrders() // raw HTTP, manual JSON parsing
            }
            override fun onPostExecute(result: List<Order>) {
                orders = result // state lost on rotation
                updateList(result) // crash if Activity is destroyed
            }
        }
        task.execute()
    }
}
```

**Key takeaway:** MVC on Android was never intentional — it was the absence of architecture. Activity became the God Object because there was no alternative. Understanding this origin explains why every subsequent pattern focused on extracting logic out of the Activity.

### Lesson 2.2: MVP and the Square Influence (2013-2015)

The MVP (Model-View-Presenter) pattern arrived through Square's engineering team. Square was building complex financial apps — payment flows, multi-step forms, real-time data — and the Activity-does-everything approach was clearly failing. They open-sourced libraries like Mortar and Flow, introducing Presenters as lifecycle-independent components.

The core insight of MVP was separation: the View handles display, the Presenter handles logic, the Model handles data. The Presenter works through a View interface and doesn't know about Android framework classes. For the first time on Android, you could unit test business logic on the JVM without Robolectric.

Dagger (also from Square) made dependency injection practical. Without DI, creating Presenters with their dependencies required massive constructor chains. This era also brought the first serious conversations about Clean Architecture on Android — separating code into data, domain, and presentation layers.

The main problem with MVP was boilerplate. Every screen needed a View interface, a Presenter class, and DI wiring — multiple files before writing any logic. The Presenter also had lifecycle issues: you needed to manually call `onAttach` and `onDetach` to prevent updating a destroyed View. Many teams got this wrong, leading to the same crashes MVP was supposed to prevent.

```kotlin
// MVP — separated but verbose
interface OrderListView {
    fun showOrders(orders: List<OrderUiModel>)
    fun showLoading()
    fun showError(message: String)
    fun navigateToDetail(orderId: String)
}

class OrderListPresenter(
    private val repository: OrderRepository
) {
    private var view: OrderListView? = null

    fun attachView(view: OrderListView) { this.view = view }
    fun detachView() { this.view = null } // forget this = memory leak

    fun loadOrders() {
        view?.showLoading()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val orders = repository.getOrders()
                withContext(Dispatchers.Main) {
                    view?.showOrders(orders.map { it.toUiModel() })
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    view?.showError(e.message ?: "Unknown error")
                }
            }
        }
    }
}
```

**Key takeaway:** MVP solved the testability problem by extracting logic from Activities into plain Kotlin classes. But its manual lifecycle management and boilerplate made it fragile. Google's Architecture Components would solve these problems in the next era.

### Lesson 2.3: Architecture Components and MVVM (2016-2018)

In 2017, Google did something unprecedented: they published official architecture guidance. Architecture Components introduced `ViewModel`, `LiveData`, `Room`, and `Lifecycle` — a cohesive set of libraries pushing the community toward MVVM. This was the first time Google said "here's how you should structure your app."

`ViewModel` solved the lifecycle problem that plagued MVP. It survived configuration changes automatically because it was scoped to a `ViewModelStoreOwner` and retained across Activity recreation — no manual attach/detach needed. `LiveData` was lifecycle-aware and automatically stopped emitting when the UI was in the background. `Room` gave type-safe SQL with compile-time verification.

The shift from MVP to MVVM was also a shift in data flow philosophy. MVP was imperative — the Presenter called methods on the View interface to update UI. MVVM was reactive — the ViewModel exposed observable streams, and the View subscribed to them. This made data flow unidirectional and easier to reason about.

Kotlin's arrival (officially supported from 2017) supercharged MVVM. Sealed classes made state representation type-safe, data classes eliminated value-type boilerplate, and coroutines replaced callback-heavy AsyncTask chains with sequential code.

```kotlin
// MVVM with Architecture Components (2017 style)
class OrderViewModel(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _orders = MutableLiveData<List<Order>>()
    val orders: LiveData<List<Order>> = _orders

    private val _isLoading = MutableLiveData<Boolean>()
    val isLoading: LiveData<Boolean> = _isLoading

    fun loadOrders() {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val result = orderRepository.getOrders()
                _orders.value = result
            } catch (e: Exception) {
                // error handling
            } finally {
                _isLoading.value = false
            }
        }
    }
}
```

**Key takeaway:** Google's Architecture Components made good architecture accessible to every Android developer. ViewModel solved lifecycle issues, LiveData prevented UI crashes, and the community finally had a shared vocabulary for app structure.

### Lesson 2.4: MVI and the Single State Object (2018-2020)

MVI gained traction as a response to a real problem with MVVM: state inconsistency. When your ViewModel exposes 5-6 separate LiveData fields, they can get out of sync — one field shows "loading" while another shows "data available." The View has to reconcile independently updating streams into a coherent screen, which is error-prone.

MVI collapsed all state into a single object. Inspired by Redux and the Elm Architecture from the web, MVI introduced a unidirectional flow: the View sends Intents (user actions), the ViewModel processes them through a Reducer, and produces a single State that the View renders. Because there's one state object, fields can't get out of sync.

The tradeoff was boilerplate. Every user action needed a sealed class entry. Every state transition went through a reducer. For simple screens, this was over-engineering. For complex screens with interconnected state — a multi-step checkout, a real-time dashboard — MVI's predictability was worth the extra code.

```kotlin
// MVI — single state, unidirectional flow
data class OrderState(
    val orders: List<Order> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedFilter: OrderFilter = OrderFilter.ALL
)

sealed interface OrderIntent {
    data object LoadOrders : OrderIntent
    data class FilterChanged(val filter: OrderFilter) : OrderIntent
    data class OrderClicked(val orderId: String) : OrderIntent
}

class OrderViewModel(
    private val repository: OrderRepository
) : ViewModel() {
    private val _state = MutableStateFlow(OrderState())
    val state: StateFlow<OrderState> = _state.asStateFlow()

    fun processIntent(intent: OrderIntent) {
        when (intent) {
            is OrderIntent.LoadOrders -> loadOrders()
            is OrderIntent.FilterChanged -> _state.update {
                it.copy(selectedFilter = intent.filter)
            }
            is OrderIntent.OrderClicked -> { /* navigate */ }
        }
    }

    private fun loadOrders() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                val orders = repository.getOrders()
                _state.update { it.copy(orders = orders, isLoading = false, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
```

**Key takeaway:** MVI solved state inconsistency by making all state transitions go through a single reducer. It's more structured than MVVM but adds boilerplate. Choose MVI when state complexity demands predictability.

### Lesson 2.5: Modern Compose Era and Presenters (2021-Present)

Jetpack Compose fundamentally changed how we think about the UI layer. With Compose, the UI is a function of state — `@Composable fun Screen(state: UiState)`. This eliminated the View/ViewModel binding problem entirely. You don't observe LiveData and call `setText()` — you pass state to composables and they render.

StateFlow replaced LiveData as the preferred state container. It's a Kotlin-first API that works naturally with coroutines, supports operators like `map`, `combine`, and `flatMapLatest`, and integrates cleanly with Compose via `collectAsStateWithLifecycle()`. The combination of Compose + StateFlow + coroutines created a purely reactive pipeline from data layer to pixels on screen.

An emerging pattern is the Compose Presenter — a plain Kotlin class (not a ViewModel) that produces state for a specific composable. Unlike ViewModel, a Presenter doesn't survive configuration changes because Compose handles that through `rememberSaveable`. Presenters are lighter weight, don't require Hilt wiring, and can be scoped to individual composables rather than entire screens. Libraries like Circuit from Slack formalize this pattern.

The current best practice is pragmatic: use ViewModel when you need lifecycle survival (configuration changes, process death), and consider Presenters for composable-scoped logic where the state can be reconstructed cheaply. Most production apps still use ViewModel as the primary state holder because process death handling is non-trivial.

```kotlin
// Modern Compose + ViewModel pattern
@HiltViewModel
class OrderViewModel @Inject constructor(
    private val repository: OrderRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val selectedFilter = savedStateHandle.getStateFlow("filter", OrderFilter.ALL)

    val uiState: StateFlow<OrderUiState> = combine(
        repository.observeOrders(),
        selectedFilter
    ) { orders, filter ->
        val filtered = when (filter) {
            OrderFilter.ALL -> orders
            OrderFilter.PENDING -> orders.filter { it.status == Status.PENDING }
            OrderFilter.COMPLETED -> orders.filter { it.status == Status.COMPLETED }
        }
        OrderUiState.Success(filtered, filter)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), OrderUiState.Loading)
}

// Compose Presenter pattern (Circuit-style)
class OrderPresenter(
    private val repository: OrderRepository
) {
    @Composable
    fun present(): OrderUiState {
        var filter by rememberSaveable { mutableStateOf(OrderFilter.ALL) }
        val orders by repository.observeOrders()
            .collectAsStateWithLifecycle(emptyList())

        return OrderUiState(
            orders = orders.applyFilter(filter),
            filter = filter,
            onFilterChanged = { filter = it }
        )
    }
}
```

**Key takeaway:** The Compose era blurred the line between ViewModel and Presenter. Use ViewModel for lifecycle-critical state and Presenters for composable-scoped logic. The important thing is reactive, unidirectional data flow — the specific holder is secondary.

### Lesson 2.6: Choosing the Right Architecture

There is no universally "best" architecture. The right choice depends on your project's complexity, your team's size and experience, and the specific problems you're trying to solve. Picking something too complex for a simple project wastes time on ceremony. Picking something too simple for a complex project leads to unmaintainable code.

**MVC fits** quick prototypes and simple utility apps. If the entire feature is one screen with minimal logic, MVC is the least ceremony. **MVC breaks** the moment you need to test business logic or when Activities start exceeding 500 lines.

**MVP fits** projects that need testable business logic but can't adopt Jetpack ViewModel — legacy codebases or multi-platform shared presenters. **MVP breaks** when the View interface becomes unwieldy (20+ methods) or when configuration changes require custom retention logic.

**MVVM fits** most Android apps. It's the sweet spot of testability, lifecycle handling, and community support. If you have no strong reason to choose something else, MVVM is the default. **MVVM breaks** when multiple user actions modify the same state simultaneously, causing race conditions.

**MVI fits** complex screens with interconnected state — dashboards, multi-step forms, collaborative editing. **MVI breaks** when applied to simple screens where the reducer boilerplate exceeds the actual business logic.

```kotlin
// Decision framework in code comments
// Simple screen, solo developer → MVVM without Use Cases
// Complex screen, multiple state sources → MVI with single state object
// Team of 5+, shared business logic → Clean Architecture with Use Cases
// Feature-rich app, 10+ modules → MVI + Clean Architecture + Modularization
```

**Key takeaway:** Architecture is a tradeoff, not a ranking. Choose based on your actual constraints — project complexity, team size, and the problems you're currently experiencing. Don't choose MVI for a todo app, and don't choose MVC for a banking app.

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

A ViewModel has exactly three responsibilities: hold UI state, process user events, and coordinate with the data layer. Anything beyond these three creates a bloated class that's hard to test and hard to reason about. The most common mistake is turning the ViewModel into a second Activity — formatting strings, managing navigation, handling analytics, validating inputs, and coordinating animations all in the same class.

A well-designed ViewModel is a pure Kotlin class that coordinates between UI and data, nothing more. It receives events from the UI, delegates work to repositories or use cases, and updates state. It never references `Activity`, `Context`, or any Android View class. It never accesses resources directly — no `R.string`, no `getString()`. If you need to display a localized error message, pass a resource ID or a sealed class that the UI maps to a string.

The constructor tells you if a ViewModel is doing too much. If it has more than 5-6 constructor parameters, the ViewModel has too many responsibilities. Split the logic into Use Cases that the ViewModel coordinates. Think of the ViewModel as a traffic controller, not the entire highway system.

```kotlin
// ❌ God ViewModel — too many responsibilities
class OrderViewModel(
    private val orderRepository: OrderRepository,
    private val userRepository: UserRepository,
    private val analyticsTracker: AnalyticsTracker,
    private val priceFormatter: PriceFormatter,
    private val discountCalculator: DiscountCalculator,
    private val inventoryChecker: InventoryChecker,
    private val notificationManager: NotificationManager,
    private val shippingCalculator: ShippingCalculator
) : ViewModel() { /* 800 lines of code */ }

// ✅ Focused ViewModel — coordinates Use Cases
@HiltViewModel
class OrderViewModel @Inject constructor(
    private val getOrderDetails: GetOrderDetailsUseCase,
    private val placeOrder: PlaceOrderUseCase,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val orderId = savedStateHandle.get<String>("orderId") ?: ""

    private val _state = MutableStateFlow(OrderUiState())
    val state: StateFlow<OrderUiState> = _state.asStateFlow()

    private val _events = Channel<OrderEvent>(Channel.BUFFERED)
    val events: Flow<OrderEvent> = _events.receiveAsFlow()

    init { loadOrder() }

    fun onEvent(event: OrderUserAction) {
        when (event) {
            is OrderUserAction.PlaceOrder -> submitOrder()
            is OrderUserAction.UpdateQuantity -> updateQuantity(event.itemId, event.quantity)
            is OrderUserAction.RemoveItem -> removeItem(event.itemId)
        }
    }

    private fun loadOrder() {
        viewModelScope.launch {
            getOrderDetails(orderId).collect { details ->
                _state.update { it.copy(orderDetails = details, isLoading = false) }
            }
        }
    }

    private fun submitOrder() {
        viewModelScope.launch {
            _state.update { it.copy(isSubmitting = true) }
            placeOrder(_state.value.orderDetails)
                .onSuccess { _events.send(OrderEvent.NavigateToConfirmation(it.orderId)) }
                .onError { _events.send(OrderEvent.ShowError(it.message)) }
            _state.update { it.copy(isSubmitting = false) }
        }
    }
}
```

**Key takeaway:** The ViewModel is the single source of truth for UI state. It coordinates, it doesn't compute. Complex business logic belongs in Use Cases, not in the ViewModel.

### Lesson 3.2: Constructor Injection and Dispatchers

The biggest mistake in production codebases is ViewModels creating their own dependencies. When a ViewModel instantiates a repository internally, you've lost the ability to swap that dependency during testing. Constructor injection makes the dependency graph explicit and testable.

This same principle extends to dispatchers. Hardcoding `Dispatchers.IO` inside a ViewModel makes your tests flaky or forces you into `Dispatchers.setMain()` workarounds. Inject dispatchers through the constructor — in production, pass `Dispatchers.IO`; in tests, pass `StandardTestDispatcher` for deterministic coroutines. A single constructor parameter eliminates the entire class of threading problems in tests.

```kotlin
// ❌ Hardcoded dispatchers — tests are flaky
class UserViewModel(private val repository: UserRepository) : ViewModel() {
    fun loadUser(id: String) {
        viewModelScope.launch(Dispatchers.IO) { // can't control in tests
            val user = repository.getUser(id)
            withContext(Dispatchers.Main) { // breaks without Dispatchers.setMain()
                _state.value = UserState.Success(user)
            }
        }
    }
}

// ✅ Injected dispatchers — tests are deterministic
@HiltViewModel
class UserViewModel @Inject constructor(
    private val repository: UserRepository,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {
    fun loadUser(id: String) {
        viewModelScope.launch {
            val user = withContext(ioDispatcher) {
                repository.getUser(id)
            }
            _state.value = UserState.Success(user)
        }
    }
}

// In tests — StandardTestDispatcher gives you control
class UserViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @Test
    fun `loadUser emits success`() = runTest {
        val viewModel = UserViewModel(
            repository = FakeUserRepository(),
            ioDispatcher = testDispatcher,
            savedStateHandle = SavedStateHandle()
        )
        viewModel.loadUser("1")
        testDispatcher.scheduler.advanceUntilIdle()
        assertTrue(viewModel.state.value is UserState.Success)
    }
}
```

**Key takeaway:** Inject every dependency through the constructor — repositories, use cases, dispatchers, and SavedStateHandle. If you can't instantiate a ViewModel in a plain JUnit test without Android, your design needs work.

### Lesson 3.3: Managing State with StateFlow

LiveData served Android well for years, but StateFlow is the better fit for modern development. StateFlow is a Kotlin-first API that works naturally with coroutines, supports operators like `map`, `combine`, and `flatMapLatest`, and integrates cleanly with Compose via `collectAsStateWithLifecycle()`.

There are two schools of thought on ViewModel state. The **single-state approach** wraps everything in one data class. The **multiple-state approach** uses separate StateFlow fields combined at the end. Both are valid — the deciding factor is whether your state fields are independent or interconnected.

With multiple StateFlows combined using the `combine` operator, each upstream only triggers updates when its specific data changes. The `stateIn` operator converts the cold `combine` flow into a hot `StateFlow`. The `SharingStarted` strategy matters: `WhileSubscribed(5000)` stops the upstream 5 seconds after the last collector disappears, giving the UI time to resubscribe after configuration changes without restarting upstream flows.

```kotlin
// Multiple-state approach — combine independent state flows
class DashboardViewModel(
    private val userRepository: UserRepository,
    private val ordersRepository: OrdersRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    // Individual state flows from different sources
    private val _isRefreshing = MutableStateFlow(false)

    val uiState: StateFlow<DashboardUiState> = combine(
        userRepository.observeUser(),
        ordersRepository.observeRecentOrders(),
        settingsRepository.observeSettings(),
        _isRefreshing
    ) { user, orders, settings, refreshing ->
        DashboardUiState(
            userName = user.name,
            recentOrders = orders.take(5),
            darkMode = settings.darkMode,
            isRefreshing = refreshing
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = DashboardUiState()
    )

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            ordersRepository.refreshOrders()
            _isRefreshing.value = false
        }
    }
}

data class DashboardUiState(
    val userName: String = "",
    val recentOrders: List<Order> = emptyList(),
    val darkMode: Boolean = false,
    val isRefreshing: Boolean = false
)
```

Use `WhileSubscribed(5000)` for continuous data streams (database observers, real-time updates), and `Lazily` for data that's fetched once and doesn't change. The 5-second window prevents upstream restarts during configuration changes.

**Key takeaway:** Use `combine` to merge independent state sources into a single UI state. Use `stateIn` with `WhileSubscribed(5000)` to share the combined flow as a hot StateFlow that pauses when no one is collecting.

### Lesson 3.4: UI State Design — Data Class vs Sealed Interface

Choosing between a single `data class` and a `sealed interface` for UI state is one of the most common design decisions in MVVM. Both are valid, and using the wrong one creates real problems.

Use a **single data class** when the screen has multiple independently loading sections. A dashboard that shows user info, recent orders, and notifications should use a data class because each section can show data while another is loading. The loading indicator is per-section, not per-screen.

Use a **sealed interface** when the screen has distinct, mutually exclusive states. A login flow is either showing the form, loading, showing success, or showing an error — never two at once. The sealed interface makes impossible states unrepresentable in the type system.

```kotlin
// ✅ Data class — independent sections, partial loading
data class DashboardState(
    val user: User? = null,
    val orders: List<Order> = emptyList(),
    val isOrdersLoading: Boolean = false,
    val notifications: Int = 0,
    val error: String? = null
)

// ✅ Sealed interface — mutually exclusive states
sealed interface LoginState {
    data object Idle : LoginState
    data object Loading : LoginState
    data class Success(val user: User) : LoginState
    data class Error(val message: String) : LoginState
}

// ✅ Hybrid — sealed interface with data class for Success
sealed interface CheckoutState {
    data object Loading : CheckoutState
    data class Active(
        val items: List<CartItem> = emptyList(),
        val subtotal: Long = 0,
        val shipping: Long = 0,
        val isProcessing: Boolean = false,
        val selectedPayment: PaymentMethod? = null
    ) : CheckoutState
    data class Error(val message: String) : CheckoutState
    data class Completed(val orderId: String) : CheckoutState
}
```

**Key takeaway:** Data class for screens with independently updating sections. Sealed interface for screens with mutually exclusive states. The hybrid approach — sealed interface with a data class inside Success — gives you the best of both.

### Lesson 3.5: One-Time Events — The Right Way

One-time events are the most debated topic in Android architecture. Google says "model everything as state." The community pushes back because navigation, snackbars, and toasts are not persistent state — they're things that happen once and should never replay.

If you model a navigation event as a boolean in your state (`navigateToHome = true`), it replays on every configuration change. The user rotates the phone and navigates again. You add an `onNavigated()` callback to reset the flag, but now you have transient events pretending to be persistent state, cleanup functions whose only purpose is resetting flags, and race conditions between consumption and recomposition.

The solution is to separate state from events. Use `StateFlow` for persistent state (what the screen looks like) and `Channel` for one-time events (things that happen once). A `Channel` with `Channel.BUFFERED` gives fire-and-forget semantics — each event is delivered exactly once, and events are buffered during configuration changes.

```kotlin
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    // Persistent state — what the screen looks like
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    // One-time events — things that happen once
    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events: Flow<LoginEvent> = _events.receiveAsFlow()

    fun onLogin(email: String, password: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            when (val result = authRepository.login(email, password)) {
                is AuthResult.Success -> {
                    analyticsTracker.trackLogin(success = true)
                    _events.send(LoginEvent.NavigateToHome)
                }
                is AuthResult.InvalidCredentials -> {
                    _uiState.update { it.copy(isLoading = false) }
                    _events.send(LoginEvent.ShowError("Invalid email or password"))
                }
                is AuthResult.NetworkError -> {
                    _uiState.update { it.copy(isLoading = false) }
                    _events.send(LoginEvent.ShowError("Check your internet connection"))
                }
            }
        }
    }
}

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false
    // ❌ NO navigateToHome, NO errorMessage — those are events, not state
)

sealed interface LoginEvent {
    data object NavigateToHome : LoginEvent
    data class ShowError(val message: String) : LoginEvent
}

// Collecting events in Compose
@Composable
fun LoginScreen(viewModel: LoginViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is LoginEvent.NavigateToHome -> { /* navigate */ }
                is LoginEvent.ShowError -> {
                    snackbarHostState.showSnackbar(event.message)
                }
            }
        }
    }
}
```

**Key takeaway:** Use `Channel` for one-time events like navigation, snackbars, and toasts. Use `StateFlow` for persistent state like form data, loading indicators, and lists. Never mix transient events into your state data class.

### Lesson 3.6: Avoiding ViewModel Anti-Patterns

Several patterns look correct but cause real problems in production. Knowing these anti-patterns saves you from debugging sessions that waste hours.

**Don't use Context in ViewModel.** If your ViewModel needs a resource string, pass the resource ID and let the UI resolve it. If an internal API needs Context, create a Wrapper class that abstracts it away. ViewModel should be a pure Kotlin class — the moment you import `android.content.Context`, you've coupled your business logic to the Android framework.

**Don't use ViewModel in Services or BroadcastReceivers.** ViewModel is tied to Activity/Fragment lifecycle. For communication between a Service and UI, use a singleton repository with `StateFlow`, or use `BroadcastReceiver`.

**Don't collect flows from ViewModel init without a proper sharing strategy.** Using `.collect {}` in `init` keeps the upstream alive for the entire ViewModel lifetime, even when the app is in the background.

```kotlin
// ❌ Anti-pattern: Context in ViewModel
class ProfileViewModel(private val context: Context) : ViewModel() {
    fun getErrorMessage(): String {
        return context.getString(R.string.error_generic) // leaks Context
    }
}

// ✅ Pattern: Pass resource IDs or sealed classes
class ProfileViewModel(private val repository: ProfileRepository) : ViewModel() {
    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    fun loadProfile() {
        viewModelScope.launch {
            try {
                val user = repository.getUser()
                _state.update { it.copy(user = user) }
            } catch (e: UnauthorizedException) {
                _state.update { it.copy(error = ProfileError.Unauthorized) }
            } catch (e: IOException) {
                _state.update { it.copy(error = ProfileError.Network) }
            }
        }
    }
}

// UI resolves the error type to a string
sealed interface ProfileError {
    data object Unauthorized : ProfileError
    data object Network : ProfileError
}

@Composable
fun ProfileScreen(viewModel: ProfileViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    state.error?.let { error ->
        val message = when (error) {
            ProfileError.Unauthorized -> stringResource(R.string.error_unauthorized)
            ProfileError.Network -> stringResource(R.string.error_network)
        }
        ErrorBanner(message)
    }
}
```

**Key takeaway:** Keep ViewModel free from Android framework dependencies. Pass resource IDs instead of strings, use sealed classes for error types, and never hold Context references. The ViewModel should compile and run in a plain JUnit test.

### Lesson 3.7: SavedStateHandle and Process Death

`SavedStateHandle` is the ViewModel's tool for surviving process death. When Android kills your process in the background, regular ViewModel state is lost — `MutableStateFlow` values, in-memory caches, everything. `SavedStateHandle` persists key-value pairs through the saved instance state mechanism, surviving both configuration changes and process death.

Use `SavedStateHandle` for navigation arguments, user input that shouldn't be lost (search queries, form fields), and filter/sort selections. Don't use it for large data sets or complex objects — it's backed by a `Bundle` with size limits. For large state, persist to Room or DataStore and re-fetch on process recreation.

```kotlin
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchRepository: SearchRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    // Survives process death
    val searchQuery = savedStateHandle.getStateFlow("query", "")

    // Doesn't survive process death — re-fetched from repository
    val searchResults: StateFlow<SearchResults> = searchQuery
        .debounce(300)
        .filter { it.length >= 2 }
        .flatMapLatest { query ->
            flow {
                emit(SearchResults.Loading)
                try {
                    val results = searchRepository.search(query)
                    emit(SearchResults.Success(results))
                } catch (e: Exception) {
                    emit(SearchResults.Error(e.message ?: "Search failed"))
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SearchResults.Idle)

    fun onQueryChanged(query: String) {
        savedStateHandle["query"] = query // persists through process death
    }
}
```

**Key takeaway:** Use `SavedStateHandle.getStateFlow()` for state that must survive process death — navigation args, search queries, filter selections. Reconstruct derived state (search results, computed values) from the saved inputs.

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

The most important principle in the data layer is the Single Source of Truth (SSOT). The database is the source of truth — not the network, not the ViewModel, not memory. Network responses update the database, and the UI observes the database. This gives you offline support, consistent state, and a clear data flow.

When the network call succeeds, you write the response to the database. The database emits the new data through a `Flow`, and the UI updates automatically. When the network call fails, the cached data in the database is still there — the user sees stale data instead of an error screen. This is fundamentally better UX than showing a loading spinner followed by an error.

The SSOT pattern also prevents a common bug: inconsistent state. If the ViewModel holds data from both the network and the database, it can show different versions of the same entity on the same screen. With SSOT, there's only one copy of the data, and everyone reads from the same place.

```kotlin
class MessagesRepository(
    private val api: MessagesApi,
    private val dao: MessagesDao,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    // Database is the single source of truth — UI always observes this
    fun observeMessages(chatId: String): Flow<List<Message>> =
        dao.observeMessages(chatId)

    // Network refreshes the database, not the UI directly
    suspend fun refreshMessages(chatId: String) = withContext(dispatcher) {
        try {
            val messages = api.getMessages(chatId)
            dao.insertAll(messages.map { it.toEntity() })
        } catch (e: Exception) {
            // Network failure — cached data still flows via observeMessages()
            // Caller can decide whether to show an error indicator
        }
    }

    // Deletes use soft-delete to support pending actions
    suspend fun deleteMessage(messageId: String) = withContext(dispatcher) {
        // Mark as deleted locally first (optimistic update)
        dao.markAsDeleted(messageId)
        try {
            api.deleteMessage(messageId)
            dao.hardDelete(messageId)
        } catch (e: Exception) {
            // Keep the soft-delete flag — retry when network is available
        }
    }
}
```

**Key takeaway:** The database is the source of truth. Network responses update the database. The UI observes the database. This gives you offline support and consistent state automatically.

### Lesson 4.2: Offline-First Architecture

Offline-first means the app works without network connectivity and syncs when connectivity returns. This isn't just about caching — it's about designing data flow so that network availability is an optimization, not a requirement. Users should never see a loading spinner when you have perfectly good cached data.

The pattern is: emit cached data immediately, fetch from network in background, update the database. The UI shows cached data instantly and updates seamlessly when fresh data arrives. If the network fails, the user still has a usable app. The Store library from MobileNativeFoundation formalizes this pattern with built-in cache policies, request deduplication, and pagination support.

For write operations, implement pending actions. If a user deletes a message and the network is unavailable, mark it as deleted locally and queue the deletion for when connectivity returns. Use WorkManager to process the pending action queue — it handles retries, backoff, and network constraints automatically.

```kotlin
class OrderRepository(
    private val api: OrderApi,
    private val dao: OrderDao,
    private val pendingActionDao: PendingActionDao,
    private val workManager: WorkManager
) {
    fun observeOrders(): Flow<Resource<List<Order>>> = flow {
        emit(Resource.Loading)

        // 1. Emit cached data immediately
        val cached = dao.getAllOrders()
        if (cached.isNotEmpty()) {
            emit(Resource.Success(cached.map { it.toDomain() }))
        }

        // 2. Refresh from network
        try {
            val fresh = api.getOrders()
            dao.replaceAll(fresh.map { it.toEntity() })
            emit(Resource.Success(dao.getAllOrders().map { it.toDomain() }))
        } catch (e: Exception) {
            if (cached.isEmpty()) {
                emit(Resource.Error(e))
            }
            // If cached data exists, user already sees content
        }
    }

    // Offline-capable write operation with pending action
    suspend fun cancelOrder(orderId: String) {
        // Optimistic local update
        dao.updateStatus(orderId, OrderStatus.CANCELLED)

        try {
            api.cancelOrder(orderId)
        } catch (e: Exception) {
            // Queue for retry
            pendingActionDao.insert(
                PendingAction(
                    type = ActionType.CANCEL_ORDER,
                    payload = orderId,
                    createdAt = System.currentTimeMillis()
                )
            )
            workManager.enqueueUniqueWork(
                "sync_pending_actions",
                ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<SyncPendingActionsWorker>()
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build()
            )
        }
    }
}

sealed interface Resource<out T> {
    data object Loading : Resource<Nothing>
    data class Success<T>(val data: T) : Resource<T>
    data class Error(val exception: Throwable) : Resource<Nothing>
}
```

**Key takeaway:** Show cached data first, refresh in background. Implement pending actions for write operations that can happen offline. Use WorkManager to process the queue when connectivity returns.

### Lesson 4.3: Cache Validation Strategies

Caching is easy. Knowing when your cache is stale is hard. There are two primary strategies for cache validation: ETag-based validation and time-based expiration. Each has tradeoffs depending on your data freshness requirements.

**ETag validation** — The server returns an `ETag` header with each response. You store the ETag alongside the cached data. On the next request, send the stored ETag in an `If-None-Match` header. If the data hasn't changed, the server returns `304 Not Modified` with no body — saving bandwidth and parse time. If the data changed, you get the full response with a new ETag. This is the most accurate validation but requires server support.

**Time-based expiration** — Each cached entity stores a `lastModifiedAt` timestamp. Before using cached data, check if the elapsed time exceeds your freshness threshold (e.g., 5 minutes for a feed, 1 hour for user profile). If expired, fetch fresh data. This is simpler than ETag but can serve stale data if the threshold is too generous.

```kotlin
class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao
) {
    companion object {
        private const val CACHE_MAX_AGE_MS = 5 * 60 * 1000L // 5 minutes
    }

    fun observeProducts(): Flow<List<Product>> = dao.observeAll()

    suspend fun refreshIfStale() {
        val lastUpdate = dao.getLastUpdateTimestamp() ?: 0L
        val elapsed = System.currentTimeMillis() - lastUpdate

        if (elapsed > CACHE_MAX_AGE_MS) {
            try {
                val products = api.getProducts()
                dao.replaceAll(
                    products.map { it.toEntity(updatedAt = System.currentTimeMillis()) }
                )
            } catch (e: Exception) {
                // Stale data is better than no data
            }
        }
    }

    // ETag-based validation for critical data
    suspend fun refreshWithETag(productId: String) {
        val cachedETag = dao.getETag(productId)

        try {
            val response = api.getProduct(productId, ifNoneMatch = cachedETag)
            when (response.code()) {
                200 -> {
                    val newETag = response.headers()["ETag"]
                    dao.insertProduct(
                        response.body()!!.toEntity(eTag = newETag)
                    )
                }
                304 -> { /* cache is fresh, nothing to do */ }
            }
        } catch (e: Exception) {
            // Use cached data
        }
    }
}
```

**Key takeaway:** Use time-based expiration for feeds and lists where slight staleness is acceptable. Use ETag validation for critical data where accuracy matters. Always prefer stale data over no data.

### Lesson 4.4: Memory Cache with Repository Getters

For frequently accessed data that doesn't change often — user profile, app configuration, feature flags — an in-memory cache in the Repository avoids repeated database reads. The pattern is simple: a private property with a backing getter and setter.

The memory cache sits above the database cache. When the ViewModel requests data, the Repository checks memory first, then database, then network. This three-layer caching (memory → database → network) gives you sub-millisecond access for hot data, millisecond access for warm data, and network latency only for cold data.

Use `Mutex` to protect the memory cache from race conditions. Without synchronization, two coroutines requesting the same data simultaneously could both trigger a network call instead of one populating the cache for the other.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao
) {
    // In-memory cache
    private val mutex = Mutex()
    private var cachedUser: User? = null

    suspend fun getUser(id: String): User = mutex.withLock {
        // 1. Check memory cache
        cachedUser?.let { if (it.id == id) return it }

        // 2. Check database cache
        val dbUser = dao.getUser(id)
        if (dbUser != null) {
            cachedUser = dbUser.toDomain()
            return cachedUser!!
        }

        // 3. Fetch from network
        val networkUser = api.getUser(id)
        dao.insertUser(networkUser.toEntity())
        cachedUser = networkUser.toDomain()
        return cachedUser!!
    }

    fun observeUser(id: String): Flow<User> = dao.observeUser(id)
        .map { it.toDomain() }

    suspend fun invalidateCache() = mutex.withLock {
        cachedUser = null
    }
}
```

**Key takeaway:** Use in-memory cache for frequently accessed, rarely changing data. Protect it with `Mutex` to prevent race conditions. Always have a database cache as fallback — memory cache is lost on process death.

### Lesson 4.5: Data Source Abstraction

Repositories should coordinate Data Sources, not implement data access directly. A Data Source is a class that wraps a single data provider — one for the network, one for the database, one for preferences. This separation makes testing easier (mock one source, not the entire repository) and keeps the Repository focused on coordination logic.

```kotlin
// Remote Data Source — wraps network API
class UserRemoteDataSource(
    private val api: UserApi,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun fetchUser(id: String): UserDto = withContext(dispatcher) {
        api.getUser(id)
    }

    suspend fun updateUser(user: UserDto): UserDto = withContext(dispatcher) {
        api.updateUser(user.id, user)
    }
}

// Local Data Source — wraps database
class UserLocalDataSource(
    private val dao: UserDao
) {
    fun observeUser(id: String): Flow<UserEntity?> = dao.observeUser(id)

    suspend fun insertUser(entity: UserEntity) = dao.insert(entity)

    suspend fun getUser(id: String): UserEntity? = dao.getUser(id)
}

// Repository — coordinates data sources
class UserRepositoryImpl(
    private val remote: UserRemoteDataSource,
    private val local: UserLocalDataSource
) : UserRepository {

    override fun observeUser(id: String): Flow<User> =
        local.observeUser(id).filterNotNull().map { it.toDomain() }

    override suspend fun refreshUser(id: String) {
        val dto = remote.fetchUser(id)
        local.insertUser(dto.toEntity())
    }

    override suspend fun updateUser(user: User) {
        local.insertUser(user.toEntity()) // optimistic update
        try {
            remote.updateUser(user.toDto())
        } catch (e: Exception) {
            // Queue for retry or revert local update
        }
    }
}
```

**Key takeaway:** Separate Data Sources from Repositories. Remote Data Source wraps the API, Local Data Source wraps the database, and the Repository coordinates between them. This keeps each class focused and independently testable.

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

Use Cases (also called Interactors) encapsulate a single piece of business logic. They sit between the ViewModel and the Repository. The ViewModel delegates business logic to Use Cases, and Use Cases coordinate between repositories.

The key question is: when should you create a Use Case? The answer: when business logic is **shared across multiple ViewModels**, when it **coordinates multiple repositories**, or when it's **complex enough** to warrant its own class and test. Don't create a Use Case that simply delegates to a Repository — that's unnecessary indirection that adds files without adding value.

A well-designed Use Case has one public method, typically implemented as `operator fun invoke()`. It takes input parameters, coordinates between repositories, applies business rules, and returns a result. The Use Case doesn't know about ViewModel, StateFlow, or Compose — it's pure Kotlin.

```kotlin
// ✅ Good Use Case — coordinates multiple repositories with business logic
class GetOrderSummaryUseCase(
    private val orderRepository: OrderRepository,
    private val pricingRepository: PricingRepository,
    private val userRepository: UserRepository
) {
    operator fun invoke(orderId: String): Flow<OrderSummary> = combine(
        orderRepository.observeOrder(orderId),
        userRepository.observeCurrentUser()
    ) { order, user ->
        val discount = if (user.isPremium) 0.10 else 0.0
        val subtotal = order.items.sumOf { it.price * it.quantity }
        val discountAmount = (subtotal * discount).toLong()
        val shipping = if (subtotal > 5000) 0L else 599L // free shipping over $50

        OrderSummary(
            items = order.items,
            subtotal = subtotal,
            discount = discountAmount,
            shipping = shipping,
            total = subtotal - discountAmount + shipping,
            isPremiumDiscount = user.isPremium
        )
    }
}

// ❌ Bad Use Case — just delegates to repository, no added value
class GetUserUseCase(private val repository: UserRepository) {
    operator fun invoke(id: String): Flow<User> = repository.observeUser(id)
    // This adds a file without adding logic. Just use the repository directly.
}
```

**Key takeaway:** Use Cases encapsulate business logic that doesn't belong in ViewModel or Repository. They coordinate between repositories and apply business rules. Don't create Use Cases that are thin wrappers around single repository calls.

### Lesson 5.2: Domain Models vs Data Transfer Objects

A common mistake is using the same model class across all layers. Your Retrofit API returns a `UserDto` with snake_case fields and nullable everything. Your Room entity has `UserEntity` with database annotations. Your UI needs a `UserUiModel` with formatted strings. These are different concerns — using one class for all three couples your layers together.

Domain models are the canonical representation of your data. They use Kotlin types (non-nullable where appropriate, value classes for type safety), and they contain no framework annotations — no `@SerializedName`, no `@Entity`, no `@Composable`. Mapping between layers happens at the boundaries.

```kotlin
// Network layer — DTOs match API contract
data class UserDto(
    @SerializedName("user_id") val userId: String?,
    @SerializedName("full_name") val fullName: String?,
    @SerializedName("email_address") val emailAddress: String?,
    @SerializedName("is_premium") val isPremium: Boolean?,
    @SerializedName("created_at") val createdAt: String?
)

// Database layer — entities match table schema
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val name: String,
    val email: String,
    val isPremium: Boolean,
    val createdAtMillis: Long,
    val lastSyncedAt: Long
)

// Domain layer — clean Kotlin, no annotations, no nullability surprises
data class User(
    val id: String,
    val name: String,
    val email: String,
    val isPremium: Boolean,
    val createdAt: Instant
)

// Mapper extensions — defined at the boundary of each layer
fun UserDto.toDomain(): User = User(
    id = requireNotNull(userId) { "User ID cannot be null" },
    name = fullName ?: "Unknown",
    email = requireNotNull(emailAddress) { "Email cannot be null" },
    isPremium = isPremium ?: false,
    createdAt = Instant.parse(createdAt ?: Instant.EPOCH.toString())
)

fun UserEntity.toDomain(): User = User(
    id = id,
    name = name,
    email = email,
    isPremium = isPremium,
    createdAt = Instant.ofEpochMilli(createdAtMillis)
)

fun User.toEntity(lastSyncedAt: Long = System.currentTimeMillis()): UserEntity = UserEntity(
    id = id,
    name = name,
    email = email,
    isPremium = isPremium,
    createdAtMillis = createdAt.toEpochMilli(),
    lastSyncedAt = lastSyncedAt
)
```

**Key takeaway:** Each layer has its own model. DTOs for network, Entities for database, Domain models for business logic. Map at the boundaries. This prevents API changes from rippling through your entire app.

### Lesson 5.3: Repository Interfaces in Domain

In Clean Architecture, the domain layer defines repository interfaces, and the data layer implements them. This is Dependency Inversion in action — the domain layer says "I need a way to get users" without knowing whether they come from Retrofit, Room, or a CSV file.

This inversion means the domain module has zero dependencies on the data module. The `:domain` module compiles without `:data` even existing. The `:data` module depends on `:domain` to implement the interfaces. The `:app` module wires the implementation to the interface through dependency injection.

```kotlin
// Defined in :domain module — pure Kotlin, no Android dependencies
interface OrderRepository {
    fun observeOrders(): Flow<List<Order>>
    fun observeOrder(id: String): Flow<Order>
    suspend fun refreshOrders()
    suspend fun placeOrder(items: List<OrderItem>): String // returns order ID
    suspend fun cancelOrder(id: String)
}

// Defined in :domain module — pure Kotlin Use Case
class PlaceOrderUseCase(
    private val orderRepository: OrderRepository,
    private val inventoryRepository: InventoryRepository,
    private val paymentRepository: PaymentRepository
) {
    sealed interface Result {
        data class Success(val orderId: String) : Result
        data class InsufficientStock(val items: List<String>) : Result
        data class PaymentFailed(val reason: String) : Result
    }

    suspend operator fun invoke(
        items: List<OrderItem>,
        paymentMethod: PaymentMethod
    ): Result {
        // Check stock for all items
        val outOfStock = items.filter { item ->
            !inventoryRepository.isInStock(item.productId, item.quantity)
        }
        if (outOfStock.isNotEmpty()) {
            return Result.InsufficientStock(outOfStock.map { it.productId })
        }

        // Process payment
        val paymentResult = paymentRepository.charge(
            amount = items.sumOf { it.price * it.quantity },
            method = paymentMethod
        )
        if (!paymentResult.isSuccess) {
            return Result.PaymentFailed(paymentResult.errorMessage)
        }

        // Place order
        val orderId = orderRepository.placeOrder(items)
        return Result.Success(orderId)
    }
}
```

**Key takeaway:** The domain layer defines what it needs (interfaces), and the data layer provides it (implementations). This keeps business logic independent of frameworks and makes it testable with simple fakes.

### Lesson 5.4: Structuring the Domain Layer

The domain layer should contain four types of classes: repository interfaces, domain models, use cases, and domain exceptions. Nothing else. No Android imports, no framework annotations, no utility classes with static methods.

Organize the domain layer by feature, not by type. Don't create packages named `usecases/`, `models/`, `repositories/`. Instead, create packages named `order/`, `user/`, `payment/`. Each package contains the repository interface, models, use cases, and exceptions for that feature.

```kotlin
// Domain module structure
// :domain/
//   order/
//     OrderRepository.kt       (interface)
//     Order.kt                 (domain model)
//     OrderItem.kt             (domain model)
//     PlaceOrderUseCase.kt     (use case)
//     GetOrderSummaryUseCase.kt (use case)
//     OrderError.kt            (domain exception)
//   user/
//     UserRepository.kt
//     User.kt
//     GetUserProfileUseCase.kt
//   payment/
//     PaymentRepository.kt
//     PaymentMethod.kt
//     PaymentResult.kt

// Domain exceptions — typed errors, not generic Exceptions
sealed interface OrderError {
    data class InsufficientStock(val productIds: List<String>) : OrderError
    data class PaymentDeclined(val reason: String) : OrderError
    data object OrderLimitExceeded : OrderError
    data class InvalidOrder(val violations: List<String>) : OrderError
}

// Use case that returns typed errors
class ValidateOrderUseCase {
    operator fun invoke(items: List<OrderItem>): List<String> {
        val violations = mutableListOf<String>()

        if (items.isEmpty()) {
            violations.add("Order must contain at least one item")
        }

        items.forEach { item ->
            if (item.quantity <= 0) {
                violations.add("${item.productId}: quantity must be positive")
            }
            if (item.price <= 0) {
                violations.add("${item.productId}: price must be positive")
            }
        }

        if (items.size > 50) {
            violations.add("Order cannot contain more than 50 items")
        }

        return violations
    }
}
```

**Key takeaway:** The domain layer is organized by feature, contains only interfaces, models, use cases, and domain exceptions. It has zero Android dependencies — it's a pure Kotlin module that compiles and runs anywhere.

### Lesson 5.5: Layer Separation with Modules

The physical separation of layers into Gradle modules enforces the dependency rule at compile time. If the `:domain` module doesn't depend on `:data`, a developer can't accidentally import a Room annotation into a domain model — the compiler won't let them.

The module graph for Clean Architecture follows a clear pattern: `:feature:*` depends on `:domain`. `:data` depends on `:domain`. `:domain` depends on nothing (or only pure Kotlin libraries). `:app` depends on everything and wires implementations to interfaces through DI.

```kotlin
// :domain/build.gradle.kts — no Android plugin, pure Kotlin
plugins {
    id("org.jetbrains.kotlin.jvm") // NOT com.android.library
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    // That's it. No Retrofit, no Room, no Android.
}

// :data/build.gradle.kts — depends on :domain
plugins {
    id("com.android.library")
}

dependencies {
    implementation(project(":domain"))
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("androidx.room:room-runtime:2.6.1")
}

// :feature:orders/build.gradle.kts — depends on :domain, not :data
dependencies {
    implementation(project(":domain"))
    implementation(project(":core:ui"))
    // ❌ NEVER: implementation(project(":data"))
}

// :app/build.gradle.kts — wires everything
dependencies {
    implementation(project(":domain"))
    implementation(project(":data"))
    implementation(project(":feature:orders"))
    implementation(project(":feature:profile"))
}
```

**Key takeaway:** Physical module separation enforces Clean Architecture at compile time. The domain module uses `kotlin.jvm` plugin (not Android), making it impossible to accidentally import Android classes into business logic.

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

### Lesson 6.1: Unidirectional Data Flow

MVI enforces a strict cycle: the View sends Intents (user actions), the ViewModel processes them through a Reducer, and a single State object is emitted back to the View. State changes are predictable because they always flow in one direction. The View never mutates state directly — it only sends Intents describing what happened.

The Reducer is a pure function: `(State, Intent) -> State`. Given the same state and intent, it always produces the same output. No side effects, no network calls, no database access — just state transformation. This makes the Reducer trivially testable. Side effects (network calls, database writes) happen outside the Reducer, typically in the ViewModel's coroutine scope.

```kotlin
// State — complete representation of the screen
data class CartState(
    val items: List<CartItem> = emptyList(),
    val subtotal: Long = 0,
    val promoCode: String = "",
    val promoDiscount: Long = 0,
    val isLoading: Boolean = false,
    val error: String? = null
)

// Intent — user actions + internal events
sealed interface CartIntent {
    data class AddItem(val product: Product) : CartIntent
    data class RemoveItem(val itemId: String) : CartIntent
    data class UpdateQuantity(val itemId: String, val quantity: Int) : CartIntent
    data class ApplyPromoCode(val code: String) : CartIntent
    data object ClearCart : CartIntent
    // Internal events from side effects
    data class PromoValidated(val discount: Long) : CartIntent
    data class PromoFailed(val message: String) : CartIntent
}

// Reducer — pure function, no side effects
fun reduce(state: CartState, intent: CartIntent): CartState {
    return when (intent) {
        is CartIntent.AddItem -> {
            val existing = state.items.find { it.productId == intent.product.id }
            val updatedItems = if (existing != null) {
                state.items.map {
                    if (it.productId == intent.product.id)
                        it.copy(quantity = it.quantity + 1)
                    else it
                }
            } else {
                state.items + CartItem(
                    productId = intent.product.id,
                    name = intent.product.name,
                    price = intent.product.price,
                    quantity = 1
                )
            }
            state.copy(
                items = updatedItems,
                subtotal = updatedItems.sumOf { it.price * it.quantity }
            )
        }
        is CartIntent.RemoveItem -> {
            val updatedItems = state.items.filter { it.productId != intent.itemId }
            state.copy(
                items = updatedItems,
                subtotal = updatedItems.sumOf { it.price * it.quantity }
            )
        }
        is CartIntent.UpdateQuantity -> {
            val updatedItems = state.items.map {
                if (it.productId == intent.itemId) it.copy(quantity = intent.quantity) else it
            }.filter { it.quantity > 0 }
            state.copy(
                items = updatedItems,
                subtotal = updatedItems.sumOf { it.price * it.quantity }
            )
        }
        is CartIntent.ApplyPromoCode -> state.copy(
            promoCode = intent.code,
            isLoading = true,
            error = null
        )
        is CartIntent.ClearCart -> CartState()
        is CartIntent.PromoValidated -> state.copy(
            promoDiscount = intent.discount,
            isLoading = false
        )
        is CartIntent.PromoFailed -> state.copy(
            isLoading = false,
            error = intent.message
        )
    }
}
```

**Key takeaway:** MVI guarantees predictable state transitions. Every state change goes through a single reducer function — a pure function with no side effects. Testing is just: `assertEquals(expectedState, reduce(initialState, intent))`.

### Lesson 6.2: Side Effects in MVI

The Reducer is pure, but real apps need side effects — network calls, database writes, analytics. In MVI, side effects happen outside the Reducer. The ViewModel processes the Intent, triggers side effects in coroutines, and feeds the results back as new Intents.

The pattern is: Intent → Reducer (immediate state change) → Side Effect (async work) → Result Intent → Reducer (update with result). The Reducer handles both user Intents and internal result Intents using the same pure function.

```kotlin
class CartViewModel(
    private val promoRepository: PromoRepository,
    private val cartRepository: CartRepository
) : ViewModel() {

    private val _state = MutableStateFlow(CartState())
    val state: StateFlow<CartState> = _state.asStateFlow()

    private val _events = Channel<CartEvent>(Channel.BUFFERED)
    val events: Flow<CartEvent> = _events.receiveAsFlow()

    fun processIntent(intent: CartIntent) {
        // 1. Update state through pure reducer
        _state.update { reduce(it, intent) }

        // 2. Trigger side effects based on intent
        when (intent) {
            is CartIntent.ApplyPromoCode -> validatePromo(intent.code)
            is CartIntent.ClearCart -> {
                viewModelScope.launch { cartRepository.clearCart() }
            }
            else -> { /* no side effect needed */ }
        }
    }

    private fun validatePromo(code: String) {
        viewModelScope.launch {
            try {
                val discount = promoRepository.validatePromo(code)
                processIntent(CartIntent.PromoValidated(discount))
            } catch (e: Exception) {
                processIntent(CartIntent.PromoFailed("Invalid promo code"))
            }
        }
    }
}

sealed interface CartEvent {
    data object NavigateToCheckout : CartEvent
    data class ShowError(val message: String) : CartEvent
}
```

**Key takeaway:** Side effects happen outside the Reducer, in the ViewModel's coroutine scope. Results from side effects are fed back as new Intents, keeping the Reducer pure and all state transitions going through one function.

### Lesson 6.3: MVI with Middleware

For complex apps, side effects in the ViewModel become tangled. Middleware provides a structured way to intercept Intents, perform side effects, and emit new Intents. Each Middleware handles a specific concern — logging, analytics, network calls — keeping the ViewModel focused on routing.

```kotlin
// Middleware interface
fun interface Middleware<S, I> {
    suspend fun process(state: S, intent: I, dispatch: (I) -> Unit)
}

// Analytics middleware — logs every intent
class AnalyticsMiddleware(
    private val tracker: AnalyticsTracker
) : Middleware<CartState, CartIntent> {
    override suspend fun process(
        state: CartState,
        intent: CartIntent,
        dispatch: (CartIntent) -> Unit
    ) {
        tracker.trackEvent("cart_intent", mapOf("type" to intent::class.simpleName))
    }
}

// Promo validation middleware
class PromoMiddleware(
    private val promoRepository: PromoRepository
) : Middleware<CartState, CartIntent> {
    override suspend fun process(
        state: CartState,
        intent: CartIntent,
        dispatch: (CartIntent) -> Unit
    ) {
        if (intent is CartIntent.ApplyPromoCode) {
            try {
                val discount = promoRepository.validatePromo(intent.code)
                dispatch(CartIntent.PromoValidated(discount))
            } catch (e: Exception) {
                dispatch(CartIntent.PromoFailed("Invalid promo code"))
            }
        }
    }
}

// ViewModel with middleware support
class CartViewModel(
    private val middlewares: List<Middleware<CartState, CartIntent>>
) : ViewModel() {

    private val _state = MutableStateFlow(CartState())
    val state: StateFlow<CartState> = _state.asStateFlow()

    fun processIntent(intent: CartIntent) {
        _state.update { reduce(it, intent) }

        viewModelScope.launch {
            middlewares.forEach { middleware ->
                middleware.process(_state.value, intent) { resultIntent ->
                    processIntent(resultIntent)
                }
            }
        }
    }
}
```

**Key takeaway:** Middleware separates side effect concerns into independent, testable units. Each Middleware handles one concern (analytics, validation, persistence), keeping the ViewModel clean and the architecture scalable.

### Lesson 6.4: MVI vs MVVM — Choosing the Right Pattern

MVI and MVVM aren't competitors — they're tools for different situations. Understanding when each pattern shines prevents over-engineering simple screens and under-engineering complex ones.

**Choose MVVM** when the screen is focused with independent state fields. A profile screen with name, email, and avatar can use separate StateFlows or a simple data class. MVVM's flexibility is an advantage here — you don't need a Reducer for three independent fields.

**Choose MVI** when state fields are interconnected and consistency matters. A multi-step checkout where changing the shipping address affects tax, available payment methods, and delivery date. A real-time collaborative editor where actions from multiple users must be serialized. A dashboard where filtering one section affects others. In these cases, the Reducer's single-function-handles-all-changes approach prevents state inconsistency.

```kotlin
// Simple screen → MVVM is cleaner
class ProfileViewModel(private val repository: UserRepository) : ViewModel() {
    val user = repository.observeUser().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val isEditing = MutableStateFlow(false)

    fun toggleEdit() { isEditing.update { !it } }
    fun saveProfile(name: String) {
        viewModelScope.launch { repository.updateName(name) }
    }
}

// Complex screen → MVI prevents state inconsistency
data class CheckoutState(
    val items: List<CartItem> = emptyList(),
    val shippingAddress: Address? = null,
    val availablePayments: List<PaymentMethod> = emptyList(),
    val selectedPayment: PaymentMethod? = null,
    val tax: Long = 0,
    val shipping: Long = 0,
    val total: Long = 0,
    val step: CheckoutStep = CheckoutStep.CART
)

// When address changes, tax + shipping + available payments ALL change
// A reducer ensures they update atomically
fun reduce(state: CheckoutState, intent: CheckoutIntent): CheckoutState {
    return when (intent) {
        is CheckoutIntent.AddressSelected -> {
            val tax = calculateTax(state.items, intent.address)
            val shipping = calculateShipping(state.items, intent.address)
            val payments = getAvailablePayments(intent.address.country)
            state.copy(
                shippingAddress = intent.address,
                tax = tax,
                shipping = shipping,
                availablePayments = payments,
                selectedPayment = if (state.selectedPayment in payments) state.selectedPayment else null,
                total = state.items.sumOf { it.price * it.quantity } + tax + shipping
            )
        }
        // ... other intents
        else -> state
    }
}
```

**Key takeaway:** MVVM for simple screens with independent state. MVI for complex screens with interconnected state. The deciding factor is whether state fields affect each other — if changing one field requires recalculating three others, MVI's atomic reducer prevents inconsistency.

### Lesson 6.5: Testing MVI Reducers

MVI reducers are the easiest code to test in your entire app. They're pure functions — given the same input, they always produce the same output. No mocking, no fakes, no coroutine test utilities. Just call the function and assert the result.

```kotlin
class CartReducerTest {
    @Test
    fun `AddItem adds new item to empty cart`() {
        val initialState = CartState()
        val product = Product(id = "p1", name = "Laptop", price = 99900)

        val newState = reduce(initialState, CartIntent.AddItem(product))

        assertEquals(1, newState.items.size)
        assertEquals("Laptop", newState.items[0].name)
        assertEquals(99900L, newState.subtotal)
    }

    @Test
    fun `AddItem increments quantity for existing item`() {
        val initialState = CartState(
            items = listOf(CartItem("p1", "Laptop", 99900, quantity = 1)),
            subtotal = 99900
        )
        val product = Product(id = "p1", name = "Laptop", price = 99900)

        val newState = reduce(initialState, CartIntent.AddItem(product))

        assertEquals(1, newState.items.size)
        assertEquals(2, newState.items[0].quantity)
        assertEquals(199800L, newState.subtotal)
    }

    @Test
    fun `RemoveItem removes item and recalculates subtotal`() {
        val initialState = CartState(
            items = listOf(
                CartItem("p1", "Laptop", 99900, 1),
                CartItem("p2", "Mouse", 2999, 2)
            ),
            subtotal = 105898
        )

        val newState = reduce(initialState, CartIntent.RemoveItem("p1"))

        assertEquals(1, newState.items.size)
        assertEquals("Mouse", newState.items[0].name)
        assertEquals(5998L, newState.subtotal)
    }

    @Test
    fun `ClearCart returns empty state`() {
        val initialState = CartState(
            items = listOf(CartItem("p1", "Laptop", 99900, 1)),
            subtotal = 99900,
            promoCode = "SAVE10"
        )

        val newState = reduce(initialState, CartIntent.ClearCart)

        assertEquals(CartState(), newState) // completely reset
    }

    @Test
    fun `ApplyPromoCode sets loading state`() {
        val initialState = CartState()

        val newState = reduce(initialState, CartIntent.ApplyPromoCode("SAVE10"))

        assertTrue(newState.isLoading)
        assertEquals("SAVE10", newState.promoCode)
        assertNull(newState.error)
    }
}
```

**Key takeaway:** MVI reducers are pure functions, making them the easiest code in your app to test. No coroutines, no mocking, no setup — just input, function call, and assertion.

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

---


## Module 7: Modularization

Modularization is an organizational and architectural decision that should be driven by real pain — slow builds, merge conflicts, teams blocking each other, or code boundaries that keep getting violated. When done well, it gives you parallel builds, clear ownership, and the ability to reason about features in isolation. When done poorly, it gives you 30 Gradle files to maintain, circular dependency headaches, and build times that somehow got worse.

### Lesson 7.1: Module Types and Naming Conventions

Before writing any code, you need a clear taxonomy of what kinds of modules exist. Teams that invent names ad hoc — `:utils`, `:shared`, `:common`, `:base` — end up with modules nobody can distinguish. A consistent naming convention prevents this entirely.

The module types that work best are `:app`, `:feature:*`, `:core:*`, and `:lib:*`. The `:app` module is the entry point — it owns the `Application` class, wires DI, and declares the navigation graph. Feature modules follow `:feature:<name>` — each owns its screens, ViewModels, repositories, and DI bindings for a single user-facing feature. Core modules use `:core:<name>` for shared infrastructure — networking, database, UI components, testing utilities. Finally, `:lib:*` is for pure Kotlin/Java libraries with no Android dependencies — they compile faster because they skip the Android Gradle plugin.

When you adopt the API/impl split, the naming extends naturally. `:core:network:api` holds interfaces and models, `:core:network:impl` holds the Retrofit implementation. Feature modules only depend on `:api` modules, never on `:impl`. The `:app` module wires `:impl` to `:api` through DI.

```kotlin
// settings.gradle.kts — a well-structured module graph
include(":app")

// Feature modules — one per user-facing feature
include(":feature:search")
include(":feature:checkout")
include(":feature:profile")
include(":feature:order-history")

// Core modules — shared Android infrastructure
include(":core:network:api")
include(":core:network:impl")
include(":core:database")
include(":core:ui")
include(":core:navigation")
include(":core:testing")

// Domain module — pure Kotlin, business logic
include(":domain")

// Lib modules — pure Kotlin, no Android dependency
include(":lib:analytics-api")
include(":lib:formatting")
include(":lib:result")
```

The naming convention itself is the documentation. When a new developer sees `:feature:checkout`, they know it's a self-contained feature. When they see `:core:network:api`, they know it's a stable interface module.

**Key takeaway:** Establish a clear module taxonomy early: `:app`, `:feature:*`, `:core:*`, `:lib:*`, `:domain`. The naming convention eliminates "where does this code go?" debates.

### Lesson 7.2: Feature-Based vs Layer-Based Modules

The most common modularization mistake is splitting by architectural layer — a `:data` module, a `:domain` module, a `:presentation` module. This feels clean on a diagram, but it creates modules that change for every feature. Add a new screen? You touch all three modules. Every pull request crosses module boundaries, and you lose the main benefit of modularization.

Feature-based modules group everything a feature needs into one module. The `:feature:search` module contains search-related screens, data sources, and domain logic. Two developers working on search and checkout never touch the same files.

The tradeoff is code duplication. Two features might define similar data classes. The instinct is to extract everything shared into `:core`, but over-extracting creates a bloated core module that everything depends on. My rule: duplicate code across features until you see the same abstraction appear three times, then extract it.

```kotlin
// ❌ Layer-based — every feature touches every module
// :data/
//   UserRemoteDataSource.kt
//   OrderRemoteDataSource.kt    ← order team touches data module
//   SearchRemoteDataSource.kt   ← search team touches same module
// :domain/
//   GetUserUseCase.kt
//   PlaceOrderUseCase.kt        ← order team touches domain module
//   SearchProductsUseCase.kt    ← search team touches same module

// ✅ Feature-based — teams work independently
// :feature:orders/
//   data/OrderRemoteDataSource.kt
//   data/OrderLocalDataSource.kt
//   data/OrderRepositoryImpl.kt
//   domain/PlaceOrderUseCase.kt
//   ui/OrderViewModel.kt
//   ui/OrderScreen.kt
// :feature:search/
//   data/SearchRemoteDataSource.kt
//   domain/SearchProductsUseCase.kt
//   ui/SearchViewModel.kt
//   ui/SearchScreen.kt
```

This structure works even better when module boundaries match team boundaries. The payments team owns `:feature:payment`, the search team owns `:feature:search`. Each team works autonomously.

**Key takeaway:** Feature-based modularization gives teams independence. Layer-based modularization creates cross-team bottlenecks. Duplicate code across features until you see the same pattern three times, then extract to `:core`.

### Lesson 7.3: Managing Dependencies Between Modules

Circular dependencies between modules are the modularization equivalent of spaghetti code. Gradle won't compile them. But the real problem starts when the dependency graph is technically acyclic but practically circular through transitive dependencies.

The fix is dependency inversion with contract modules. If `:feature:checkout` needs data from `:feature:profile`, define an interface in `:core:contracts` and let the `:app` module wire the concrete implementation through DI. The checkout module never knows about profiles.

```kotlin
// Defined in :core:contracts — shared interface
interface ShippingAddressProvider {
    suspend fun getDefaultAddress(userId: String): ShippingAddress?
}

// Implemented in :feature:profile (internal visibility)
internal class ProfileShippingAddressProvider(
    private val profileRepository: ProfileRepository
) : ShippingAddressProvider {
    override suspend fun getDefaultAddress(userId: String): ShippingAddress? {
        return profileRepository.getProfile(userId)
            ?.defaultAddress
            ?.toShippingAddress()
    }
}

// Used in :feature:checkout — depends on interface, not profile
class CheckoutViewModel(
    private val shippingAddressProvider: ShippingAddressProvider,
    private val orderRepository: OrderRepository
) : ViewModel() {
    fun loadShippingAddress(userId: String) {
        viewModelScope.launch {
            val address = shippingAddressProvider.getDefaultAddress(userId)
            _state.update { it.copy(shippingAddress = address) }
        }
    }
}

// Wired in :app's DI module
@Module
@InstallIn(SingletonComponent::class)
abstract class ContractBindingsModule {
    @Binds
    abstract fun bindShippingAddressProvider(
        impl: ProfileShippingAddressProvider
    ): ShippingAddressProvider
}
```

**Key takeaway:** Use contract interfaces in shared modules to break dependencies between features. The `:app` module wires implementations to contracts through DI. This keeps the dependency graph clean and builds parallelizable.

### Lesson 7.4: Navigation Between Feature Modules

Feature modules can't directly reference each other's Activities or Composables. Navigation between features requires abstraction — typically a navigation module in `:core` that defines routes as constants or sealed classes, with the `:app` module providing the actual navigation implementation.

The navigation module also handles feature availability. If a feature is disabled (A/B test, feature flag, subscription tier), the navigation module returns a "feature unavailable" destination instead of crashing.

```kotlin
// :core:navigation — defines routes and navigator interface
sealed interface AppRoute {
    data object Home : AppRoute
    data class OrderDetail(val orderId: String) : AppRoute
    data class ProductDetail(val productId: String) : AppRoute
    data class Profile(val userId: String) : AppRoute
    data class Search(val query: String = "") : AppRoute
}

interface AppNavigator {
    fun navigate(route: AppRoute)
    fun navigateBack()
    fun isFeatureAvailable(route: AppRoute): Boolean
}

// :feature:orders — uses navigator without knowing about other features
class OrderListViewModel(
    private val navigator: AppNavigator,
    private val repository: OrderRepository
) : ViewModel() {

    fun onOrderClicked(orderId: String) {
        navigator.navigate(AppRoute.OrderDetail(orderId))
    }
}

// :app — implements navigator with actual navigation
class AppNavigatorImpl(
    private val navController: NavHostController,
    private val featureFlags: FeatureFlags
) : AppNavigator {

    override fun navigate(route: AppRoute) {
        if (!isFeatureAvailable(route)) {
            navController.navigate("feature-unavailable")
            return
        }
        when (route) {
            is AppRoute.Home -> navController.navigate("home")
            is AppRoute.OrderDetail -> navController.navigate("orders/${route.orderId}")
            is AppRoute.ProductDetail -> navController.navigate("products/${route.productId}")
            is AppRoute.Profile -> navController.navigate("profile/${route.userId}")
            is AppRoute.Search -> navController.navigate("search?query=${route.query}")
        }
    }

    override fun isFeatureAvailable(route: AppRoute): Boolean = when (route) {
        is AppRoute.Search -> featureFlags.isSearchEnabled
        else -> true
    }

    override fun navigateBack() { navController.popBackStack() }
}
```

**Key takeaway:** Navigation between features goes through an abstraction in `:core:navigation`. Feature modules call `navigator.navigate(route)` without knowing the destination's implementation. The `:app` module wires the actual navigation.

### Lesson 7.5: Build Configuration and Optimization

Modularization directly impacts build times. When modules are properly isolated, Gradle compiles them in parallel and uses incremental compilation — only changed modules recompile. But misconfigured dependencies can negate these benefits.

Use `implementation` instead of `api` for module dependencies. With `api`, a change in a transitive dependency triggers recompilation of all modules that depend on it. With `implementation`, the change is contained. Use version catalogs for consistent dependency versions. Use convention plugins to share build configuration without copy-pasting.

```kotlin
// gradle/libs.versions.toml — single source for dependency versions
[versions]
kotlin = "1.9.22"
compose-compiler = "1.5.8"
hilt = "2.50"
room = "2.6.1"

[libraries]
hilt-android = { module = "com.google.dagger:hilt-android", version.ref = "hilt" }
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }

[plugins]
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }

// Convention plugin — shared build config
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            with(pluginManager) {
                apply("com.android.library")
                apply("org.jetbrains.kotlin.android")
                apply("com.google.dagger.hilt.android")
            }
            dependencies {
                add("implementation", project(":domain"))
                add("implementation", project(":core:ui"))
                add("implementation", project(":core:navigation"))
                add("testImplementation", project(":core:testing"))
            }
        }
    }
}

// Usage in feature module
// :feature:orders/build.gradle.kts
plugins {
    id("app.android.feature") // applies convention plugin
}

dependencies {
    // Only feature-specific dependencies
    implementation(libs.room.runtime)
}
```

**Key takeaway:** Use `implementation` over `api` to contain recompilation. Use version catalogs for consistency. Use convention plugins to eliminate build config duplication across modules.

### Lesson 7.6: When to Modularize

Modularization isn't something you do because a conference talk said so. It adds complexity — more Gradle files, more module wiring, more navigation indirection. The benefits (build speed, encapsulation, team independence) outweigh the costs only when you're experiencing real pain.

Start modularizing when build times exceed 2-3 minutes (incremental). When merge conflicts happen on every PR because four developers share one module. When code ownership is unclear and changes in one feature break another. When onboarding takes weeks because the codebase is a monolith without boundaries.

Start small: separate `:app` from `:core` and one `:feature` module. Get the build configuration right, establish naming conventions, and prove the pattern works. Then extract more features incrementally. Going from 1 module to 30 in a weekend is a recipe for a broken build that takes days to fix.

**Key takeaway:** Modularize when you feel real pain — slow builds, merge conflicts, unclear ownership. Start with one feature extraction, prove the pattern, then scale gradually.

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

---


## Module 8: Error Handling Across Layers

Error handling is where architecture either proves itself or collapses. A well-architected app handles errors at the right layer, presents meaningful messages to users, and never swallows exceptions silently. A poorly-architected app wraps everything in `try/catch(Exception)` and shows "Something went wrong" for every failure.

### Lesson 8.1: Exception Strategy — Top-Level vs Low-Level

As a rule of thumb, catching exceptions should happen at the top level of your architecture, not in low-level APIs. If a low-level API throws exceptions for control flow (not logical errors), create a wrapper function that converts exceptions into appropriate return values. If you're only interested in success or failure, return null for failure. For multiple error types, use sealed classes.

Condition exceptions are thrown based on business conditions (insufficient stock, invalid input). Logical exceptions are unexpected errors (null pointer, array out of bounds). Condition exceptions should be converted to return values at the data layer boundary. Logical exceptions should propagate to crash reporting.

```kotlin
// ❌ Low-level API that throws for control flow
class PaymentGateway {
    fun processPayment(amount: Long): PaymentReceipt {
        if (amount <= 0) throw IllegalArgumentException("Amount must be positive")
        if (!isConnected()) throw PaymentException("Gateway unreachable")
        if (amount > maxLimit) throw PaymentException("Amount exceeds limit")
        // ... process
        return PaymentReceipt(id = "txn-123")
    }
}

// ✅ Wrapper that converts exceptions to values
class PaymentGatewayWrapper(private val gateway: PaymentGateway) {
    fun processPayment(amount: Long): PaymentResult {
        return try {
            val receipt = gateway.processPayment(amount)
            PaymentResult.Success(receipt)
        } catch (e: IllegalArgumentException) {
            PaymentResult.InvalidAmount(e.message ?: "Invalid amount")
        } catch (e: PaymentException) {
            PaymentResult.Failed(e.message ?: "Payment failed")
        }
    }
}

sealed interface PaymentResult {
    data class Success(val receipt: PaymentReceipt) : PaymentResult
    data class InvalidAmount(val reason: String) : PaymentResult
    data class Failed(val reason: String) : PaymentResult
}
```

**Key takeaway:** Convert exceptions to values at the boundary of low-level APIs. Use sealed classes for typed errors. Let the caller decide how to handle each case rather than forcing try/catch everywhere.

### Lesson 8.2: Result Types and the AppResult Pattern

Kotlin's `Result<T>` is a good starting point, but for production apps you need more context than just success/failure. An `AppResult` sealed interface carries the error message, the original throwable, and a domain-specific error code that the UI can map to user-friendly messages.

Define extension functions for clean, chainable error handling. This keeps error handling code readable without nested `when` blocks.

```kotlin
sealed interface AppResult<out T> {
    data class Success<T>(val data: T) : AppResult<T>
    data class Error(
        val message: String,
        val cause: Throwable? = null,
        val code: ErrorCode = ErrorCode.UNKNOWN
    ) : AppResult<Nothing>
}

enum class ErrorCode {
    NETWORK_ERROR,
    UNAUTHORIZED,
    NOT_FOUND,
    SERVER_ERROR,
    TIMEOUT,
    VALIDATION_ERROR,
    RATE_LIMITED,
    UNKNOWN
}

// Chainable extension functions
inline fun <T> AppResult<T>.onSuccess(action: (T) -> Unit): AppResult<T> {
    if (this is AppResult.Success) action(data)
    return this
}

inline fun <T> AppResult<T>.onError(action: (AppResult.Error) -> Unit): AppResult<T> {
    if (this is AppResult.Error) action(this)
    return this
}

inline fun <T, R> AppResult<T>.map(transform: (T) -> R): AppResult<R> = when (this) {
    is AppResult.Success -> AppResult.Success(transform(data))
    is AppResult.Error -> this
}

inline fun <T, R> AppResult<T>.flatMap(transform: (T) -> AppResult<R>): AppResult<R> = when (this) {
    is AppResult.Success -> transform(data)
    is AppResult.Error -> this
}

// Usage — clean, chainable error handling
class OrderViewModel(private val repository: OrderRepository) : ViewModel() {
    fun placeOrder() {
        viewModelScope.launch {
            repository.placeOrder(currentItems)
                .onSuccess { orderId ->
                    _events.send(OrderEvent.NavigateToConfirmation(orderId))
                }
                .onError { error ->
                    when (error.code) {
                        ErrorCode.UNAUTHORIZED -> _events.send(OrderEvent.NavigateToLogin)
                        ErrorCode.NETWORK_ERROR -> _events.send(OrderEvent.ShowRetryDialog)
                        else -> _events.send(OrderEvent.ShowError(error.message))
                    }
                }
        }
    }
}
```

**Key takeaway:** `AppResult<T>` with error codes gives the ViewModel enough context to decide how to handle each error — redirect to login, show retry dialog, or display a message. Extension functions keep the handling code clean and chainable.

### Lesson 8.3: Repository Error Mapping with safeApiCall

Every repository that calls a network API needs error handling. Rather than duplicating `try/catch` blocks in every method, create a reusable `safeApiCall` function that wraps any suspend function, catches common exceptions, and returns an `AppResult`.

The `safeApiCall` function handles `HttpException` (HTTP errors), `SocketTimeoutException` (timeouts), `IOException` (network failures), and `CancellationException` (which should be rethrown — never catch cancellation in coroutines).

```kotlin
suspend fun <T> safeApiCall(apiCall: suspend () -> T): AppResult<T> {
    return try {
        AppResult.Success(apiCall())
    } catch (e: CancellationException) {
        throw e // NEVER catch CancellationException in coroutines
    } catch (e: HttpException) {
        val code = when (e.code()) {
            401 -> ErrorCode.UNAUTHORIZED
            403 -> ErrorCode.UNAUTHORIZED
            404 -> ErrorCode.NOT_FOUND
            429 -> ErrorCode.RATE_LIMITED
            in 500..599 -> ErrorCode.SERVER_ERROR
            else -> ErrorCode.UNKNOWN
        }
        val body = e.response()?.errorBody()?.string()
        val message = parseErrorMessage(body) ?: "Request failed (${e.code()})"
        AppResult.Error(message, e, code)
    } catch (e: SocketTimeoutException) {
        AppResult.Error("Request timed out. Please try again.", e, ErrorCode.TIMEOUT)
    } catch (e: IOException) {
        AppResult.Error("No internet connection", e, ErrorCode.NETWORK_ERROR)
    }
}

private fun parseErrorMessage(body: String?): String? {
    return try {
        body?.let { JSONObject(it).optString("message") }
    } catch (e: Exception) {
        null
    }
}

// Repository usage — clean, consistent error handling
class OrderRepository(
    private val api: OrderApi,
    private val dao: OrderDao
) {
    suspend fun placeOrder(items: List<OrderItem>): AppResult<String> =
        safeApiCall {
            val response = api.placeOrder(OrderRequest(items.map { it.toDto() }))
            dao.insertOrder(response.toEntity())
            response.orderId
        }

    suspend fun getOrder(id: String): AppResult<Order> =
        safeApiCall { api.getOrder(id).toDomain() }

    suspend fun cancelOrder(id: String): AppResult<Unit> =
        safeApiCall { api.cancelOrder(id) }
}
```

**Key takeaway:** `safeApiCall` centralizes exception-to-error mapping for all network calls. Every repository method gets consistent error handling. Remember to always rethrow `CancellationException` — swallowing it breaks structured concurrency.

### Lesson 8.4: Error Handling in the UI Layer

The UI layer maps error codes to user-visible messages and decides how to present them — inline error, snackbar, dialog, or full-screen error. The ViewModel sends error information through events or state, and the UI composable resolves it to localized strings.

Never put string resources in the ViewModel. Instead, send sealed class errors and let the UI map them to `stringResource()` calls. This keeps the ViewModel framework-free and makes error messages localizable.

```kotlin
// ViewModel sends typed errors
sealed interface OrderError {
    data object NetworkError : OrderError
    data object Unauthorized : OrderError
    data class ServerError(val code: Int) : OrderError
    data class ValidationError(val fields: List<String>) : OrderError
    data class Unknown(val message: String) : OrderError
}

// UI maps errors to localized messages and presentation
@Composable
fun OrderScreen(viewModel: OrderViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is OrderEvent.ShowError -> {
                    val message = when (event.error) {
                        is OrderError.NetworkError ->
                            context.getString(R.string.error_no_connection)
                        is OrderError.Unauthorized ->
                            context.getString(R.string.error_session_expired)
                        is OrderError.ServerError ->
                            context.getString(R.string.error_server, event.error.code)
                        is OrderError.ValidationError ->
                            context.getString(R.string.error_validation,
                                event.error.fields.joinToString(", "))
                        is OrderError.Unknown -> event.error.message
                    }
                    snackbarHostState.showSnackbar(
                        message = message,
                        actionLabel = context.getString(R.string.retry),
                        duration = SnackbarDuration.Long
                    )
                }
                is OrderEvent.NavigateToLogin -> { /* navigate */ }
            }
        }
    }
}
```

**Key takeaway:** The UI layer is the only place that resolves error types to user-visible strings. The ViewModel sends sealed class errors, the UI maps them to `stringResource()`. This keeps the ViewModel testable and errors localizable.

### Lesson 8.5: Error Handling Best Practises

Several error handling patterns consistently cause problems in production. Avoiding these anti-patterns saves debugging time and improves user experience.

**Never use empty catch blocks.** At minimum, log the exception. Better yet, convert it to a typed error. An empty catch block means a failure happened silently — the user sees stale data and doesn't know why.

**Use `check` and `requireNotNull` for programming errors.** These throw `IllegalStateException` and `IllegalArgumentException` — they're for conditions that indicate bugs, not runtime failures. They should never be caught — they should crash the app and show up in crash reporting.

**Use `kotlin.runCatching` sparingly.** It catches everything including `CancellationException`, which breaks structured concurrency. If you must use it, explicitly rethrow `CancellationException`.

```kotlin
// ❌ Empty catch — silent failure
try {
    repository.saveOrder(order)
} catch (e: Exception) {
    // nothing — user thinks save succeeded
}

// ❌ runCatching swallows CancellationException
val result = runCatching { repository.saveOrder(order) } // DANGER

// ✅ Explicit error handling with check/require for programming errors
fun placeOrder(items: List<OrderItem>, userId: String) {
    require(items.isNotEmpty()) { "Cannot place empty order" }
    requireNotNull(items.firstOrNull()) { "Items list is null" }
    check(userId.isNotBlank()) { "User ID must not be blank" }

    viewModelScope.launch {
        repository.placeOrder(items)
            .onSuccess { /* handle success */ }
            .onError { error ->
                // Always handle the error — log + show to user
                logger.error("Order failed", error.cause)
                _events.send(OrderEvent.ShowError(error))
            }
    }
}

// ✅ Safe runCatching that rethrows CancellationException
suspend fun <T> safeCatching(block: suspend () -> T): Result<T> {
    return try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

**Key takeaway:** Never swallow exceptions silently. Use `check`/`require` for programming errors. Be careful with `runCatching` in coroutines — always rethrow `CancellationException`.

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

Every class in your codebase should fit into a clear naming taxonomy. The suffix tells you what the class does, its scope, and where it lives in the architecture. This isn't about being pedantic — it's about making code navigable in a 500-file project.

A **Service** maintains a low-level API or data source. `RemoteConfigService` wraps Firebase Remote Config. A **Manager** handles a complete responsibility end-to-end. `WebsocketManager` manages connection lifecycle, reconnection, and message routing. A **Repository** manages business logic with a single responsibility and coordinates data sources.

A **Factory** creates objects. `TicketStatusFactory` creates different ticket status instances based on conditions. A **Provider** exposes an API or provides access to data. `IntentProvider` gives access to certain intents. A **Processor** handles specific logic or API processing. `WebsocketMessageProcessor` processes incoming websocket messages and routes them.

A **Wrapper** hides the complexity of low-level APIs. `WebsocketConnectionWrapper` wraps the connection logic and prevents direct access to the underlying library. A **UseCase** represents a specific action. `SendMessageUseCase` triggers the action of sending a message. An **Observer** listens for changes and responds. `MessagesPagingObserver` reacts to paging updates.

```kotlin
// ✅ Clear naming — each suffix tells you the class's role
class RemoteConfigService        // wraps Firebase Remote Config API
class WebsocketManager           // manages websocket lifecycle end-to-end
class ChatRepository             // coordinates chat data sources
class TicketStatusFactory        // creates ticket status objects
class DeepLinkProvider           // provides deep link URIs
class NotificationProcessor     // processes incoming notifications
class RetrofitWrapper            // hides Retrofit complexity
class SendMessageUseCase         // sends a message (single action)
class MessagesPagingObserver     // observes paging state changes

// ❌ Ambiguous naming — what does this class do?
class ChatHelper                  // helper doing what?
class Utils                       // utility for what?
class DataManager                 // manages all data? too broad
class Coordinator                 // coordinates what?
```

**Key takeaway:** Use consistent suffixes that tell you what a class does: Service, Manager, Repository, Factory, Provider, Processor, Wrapper, UseCase, Observer. Avoid vague names like Helper, Utils, Manager (without specificity), and Coordinator.

### Lesson 9.2: Designing New Features — The Checklist Approach

Before writing any code for a new feature or internal API, step back and design on paper. This checklist approach prevents the common mistake of jumping into code and realizing halfway through that the architecture doesn't support your requirements.

The design checklist: What problem are you solving? What components will you need? What interactions exist between them? What are the edge cases? What APIs or libraries will you use? What design patterns apply? Write down questions and challenges before writing code.

```kotlin
// Example: Designing a real-time chat feature
// Step 1: What components?
//   - WebsocketManager: manages connection lifecycle
//   - MessageRepository: coordinates local + remote messages
//   - MessageSyncWorker: syncs pending messages when online
//   - ChatViewModel: holds chat UI state

// Step 2: What interactions?
//   - WebsocketManager → MessageRepository (incoming messages)
//   - ViewModel → MessageRepository (load/send messages)
//   - MessageSyncWorker → MessageRepository (retry failed sends)

// Step 3: Edge cases?
//   - Message sent while offline → queue and retry
//   - Websocket disconnected → reconnect with exponential backoff
//   - Duplicate messages → deduplicate by server ID
//   - Messages arrive out of order → sort by timestamp

// Step 4: What design patterns?
//   - Observer pattern: ViewModel observes MessageRepository via Flow
//   - Repository pattern: SSOT with Room database
//   - Strategy pattern: different reconnection strategies

// Step 5: Implementation
interface ChatMessageRepository {
    fun observeMessages(chatId: String): Flow<List<ChatMessage>>
    suspend fun sendMessage(chatId: String, content: String): SendResult
    suspend fun retryFailed(chatId: String)
    suspend fun markAsRead(chatId: String, messageId: String)
}

class ChatMessageRepositoryImpl(
    private val localDataSource: ChatLocalDataSource,
    private val remoteDataSource: ChatRemoteDataSource,
    private val websocketManager: WebsocketManager
) : ChatMessageRepository {
    // implementation follows the design
}
```

**Key takeaway:** Design before you code. A 15-minute checklist session prevents hours of refactoring when you discover edge cases mid-implementation. Write down components, interactions, edge cases, and patterns before opening your IDE.

### Lesson 9.3: API Surface Design

When designing an internal API — a repository interface, a Use Case, a shared module's public API — apply the same principles you'd apply to a public SDK. Keep the surface minimal, make the API hard to misuse, and hide implementation details.

The Interface Segregation Principle applies directly: expose only what consumers need. A repository used by three features should expose three focused interfaces, not one interface with fifteen methods. Use Kotlin's `internal` visibility modifier aggressively in modules — everything is `internal` by default, and only the public API surface is `public`.

```kotlin
// ❌ Fat interface — forces consumers to depend on methods they don't use
interface UserRepository {
    fun observeUser(id: String): Flow<User>
    suspend fun updateUser(user: User)
    suspend fun deleteUser(id: String)
    suspend fun getUserPosts(id: String): List<Post>
    suspend fun getUserAnalytics(id: String): Analytics
    suspend fun exportUserData(id: String): ByteArray
    suspend fun importUserData(data: ByteArray)
    suspend fun searchUsers(query: String): List<User>
    suspend fun getUserFriends(id: String): List<User>
}

// ✅ Segregated interfaces — consumers depend only on what they use
interface UserReadRepository {
    fun observeUser(id: String): Flow<User>
    suspend fun getUser(id: String): User?
}

interface UserWriteRepository {
    suspend fun updateUser(user: User)
    suspend fun deleteUser(id: String)
}

interface UserSearchRepository {
    suspend fun searchUsers(query: String): List<User>
}

// Implementation can implement all interfaces
internal class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao
) : UserReadRepository, UserWriteRepository, UserSearchRepository {
    // single implementation, multiple focused interfaces
}
```

**Key takeaway:** Design internal APIs with minimal surface area. Use Interface Segregation to give each consumer only the methods it needs. Mark implementation classes `internal` — only interfaces are `public`.

### Lesson 9.4: Refactoring Architectural Debt

Every codebase accumulates architectural debt — deprecated APIs, hardcoded values, classes that grew beyond their original scope. Systematic refactoring addresses this debt without breaking the app.

Focus refactoring on four categories: **Security** (encrypted data storage, token handling), **Error handling** (proper error codes, user-facing messages), **Performance** (removing blocking calls, using proper dispatchers), and **Architecture** (removing deprecated APIs, extracting god classes, eliminating hardcoded values).

```kotlin
// Refactoring checklist for a codebase audit

// Security:
// - Are API keys hardcoded? → Move to BuildConfig or encrypted storage
// - Is sensitive data stored in SharedPreferences? → Use EncryptedSharedPreferences
// - Are network calls using HTTPS? → Enforce TLS

// Error handling:
// - Are there empty catch blocks? → Add logging or convert to Result types
// - Are raw exceptions leaking to ViewModel? → Add safeApiCall wrappers
// - Are error messages user-friendly? → Map to localized strings

// Performance:
// - Are there blocking calls on the main thread? → Move to Dispatchers.IO
// - Are there unnecessary recompositions? → Use derivedStateOf or remember
// - Are large bitmaps loaded without scaling? → Use Coil with size constraints

// Architecture:
// - Are there deprecated APIs? → Replace with modern equivalents
// - Are there god classes (500+ lines)? → Extract to focused classes
// - Are there hardcoded strings or keys? → Extract to constants or resources
// - Are there unused classes or imports? → Remove dead code

// Refactoring a hardcoded API URL
// ❌ Before
class ApiService {
    private val baseUrl = "https://api.example.com/v2" // hardcoded
    fun getUser(id: String) = "$baseUrl/users/$id"
}

// ✅ After
class ApiService(private val config: ApiConfig) {
    fun getUser(id: String) = "${config.baseUrl}/users/$id"
}

data class ApiConfig(
    val baseUrl: String,
    val apiKey: String,
    val timeout: Long
)
```

**Key takeaway:** Refactor systematically across four categories: security, error handling, performance, and architecture. Address the highest-impact items first — security issues and blocking main thread calls before cosmetic improvements.

### Lesson 9.5: Application-Level Architecture Decisions

Application-level decisions set the foundation for your entire codebase. Getting these right early saves months of refactoring later. These aren't per-feature decisions — they're project-wide standards that every developer follows.

**Use App Startup** for initialization instead of ContentProviders. Multiple libraries registering ContentProviders adds sequential startup cost. App Startup consolidates all initialization into a single ContentProvider with dependency ordering.

**Use WorkManager** for background work. Enqueueing and dequeueing work like sending messages, deleting chats, syncing data — WorkManager handles retries, backoff, and network constraints. Don't use raw coroutines for work that must complete even if the app is killed.

**Use SVG over raster formats** (JPG, PNG, WebP) for icons and illustrations. SVGs scale without quality loss and are typically smaller than equivalent PNGs.

```kotlin
// App Startup — consolidate initialization
class AnalyticsInitializer : Initializer<AnalyticsClient> {
    override fun create(context: Context): AnalyticsClient {
        return AnalyticsClient.initialize(
            context,
            AnalyticsConfig.Builder()
                .setTrackingEnabled(!BuildConfig.DEBUG)
                .setSessionTimeout(30_000L)
                .build()
        )
    }

    override fun dependencies(): List<Class<out Initializer<*>>> {
        return listOf(CrashReportingInitializer::class.java)
    }
}

// WorkManager for reliable background work
class MessageSyncWorker(
    context: Context,
    params: WorkerParameters,
    private val repository: MessageRepository
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            repository.syncPendingMessages()
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}

// Enqueue with constraints
fun scheduleMessageSync(workManager: WorkManager) {
    workManager.enqueueUniqueWork(
        "message_sync",
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
```

**Key takeaway:** Application-level architecture decisions affect every feature. Use App Startup for initialization, WorkManager for background work, and establish project-wide standards for asset formats, error handling, and dependency management.

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

ViewModel tests verify that user actions produce the correct state transitions and events. Because ViewModels use `StateFlow` and `Channel`, you need two tools: Turbine (for testing Flow emissions in order) and `runTest` (for controlling coroutine execution).

The test structure is consistent: create a ViewModel with fake dependencies, trigger an action, assert the resulting state. Each test covers one behavior — loading, success, error, or a specific user action. Keep tests focused and independent.

```kotlin
class OrderViewModelTest {
    private val fakeRepository = FakeOrderRepository()
    private val testDispatcher = StandardTestDispatcher()
    private lateinit var viewModel: OrderViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        viewModel = OrderViewModel(
            repository = fakeRepository,
            ioDispatcher = testDispatcher,
            savedStateHandle = SavedStateHandle()
        )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is loading`() = runTest {
        viewModel.state.test {
            assertEquals(OrderState.Loading, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadOrders emits success with orders`() = runTest {
        val testOrders = listOf(
            Order(id = "1", item = "Laptop", total = 99900),
            Order(id = "2", item = "Mouse", total = 2999)
        )
        fakeRepository.setOrders(testOrders)

        viewModel.loadOrders()
        testScheduler.advanceUntilIdle()

        viewModel.state.test {
            val state = awaitItem()
            assertTrue(state is OrderState.Success)
            assertEquals(2, (state as OrderState.Success).orders.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadOrders emits error on repository failure`() = runTest {
        fakeRepository.setShouldFail(true)

        viewModel.loadOrders()
        testScheduler.advanceUntilIdle()

        viewModel.state.test {
            val state = awaitItem()
            assertTrue(state is OrderState.Error)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `placeOrder sends navigation event on success`() = runTest {
        fakeRepository.setPlaceOrderResult(AppResult.Success("order-123"))

        viewModel.events.test {
            viewModel.placeOrder()
            testScheduler.advanceUntilIdle()

            val event = awaitItem()
            assertTrue(event is OrderEvent.NavigateToConfirmation)
            assertEquals("order-123", (event as OrderEvent.NavigateToConfirmation).orderId)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

**Key takeaway:** ViewModel tests verify state transitions and event emissions. Use `StandardTestDispatcher` for deterministic coroutines, Turbine for ordered Flow assertions, and `Dispatchers.setMain()` for main-safe testing.

### Lesson 10.2: Fakes vs Mocks — Why Fakes Win

There are two approaches to test dependencies: Fakes and Mocks. Fakes are real implementations with in-memory data. Mocks are proxy objects that record and verify method calls. In almost every case, Fakes are the better choice for Android testing.

Fakes are reusable across test classes. They catch interface changes at compile time — if you add a method to `OrderRepository`, `FakeOrderRepository` won't compile until you add it too. Mocks silently pass because they dynamically implement the interface. Fakes test behavior (does the ViewModel produce the right state?), while Mocks test implementation (did the ViewModel call `getOrders()` with the right argument?). Implementation testing is brittle — refactoring the ViewModel's internal logic breaks mock-based tests even if the behavior is unchanged.

```kotlin
// ✅ Fake — real implementation with in-memory data
class FakeOrderRepository : OrderRepository {
    private val orders = mutableListOf<Order>()
    private var shouldFail = false
    private var placeOrderResult: AppResult<String> = AppResult.Success("order-1")

    // Test configuration
    fun setOrders(list: List<Order>) { orders.clear(); orders.addAll(list) }
    fun setShouldFail(fail: Boolean) { shouldFail = fail }
    fun setPlaceOrderResult(result: AppResult<String>) { placeOrderResult = result }

    // Interface implementation
    override fun observeOrders(): Flow<List<Order>> = flow {
        if (shouldFail) throw IOException("Network error")
        emit(orders.toList())
    }

    override suspend fun refreshOrders() {
        if (shouldFail) throw IOException("Network error")
    }

    override suspend fun placeOrder(items: List<OrderItem>): AppResult<String> {
        if (shouldFail) return AppResult.Error("Failed", code = ErrorCode.NETWORK_ERROR)
        return placeOrderResult
    }

    override suspend fun cancelOrder(id: String) {
        if (shouldFail) throw IOException("Network error")
        orders.removeAll { it.id == id }
    }
}

// ❌ Mock-based test — brittle, tests implementation not behavior
@Test
fun `loadOrders calls repository`() {
    val mockRepo = mockk<OrderRepository>()
    coEvery { mockRepo.observeOrders() } returns flowOf(testOrders)

    val viewModel = OrderViewModel(mockRepo)
    viewModel.loadOrders()

    coVerify { mockRepo.observeOrders() } // breaks if ViewModel refactors internal logic
}

// ✅ Fake-based test — tests behavior, survives refactoring
@Test
fun `loadOrders shows orders in state`() = runTest {
    val fakeRepo = FakeOrderRepository()
    fakeRepo.setOrders(testOrders)

    val viewModel = OrderViewModel(fakeRepo)
    viewModel.loadOrders()

    viewModel.state.test {
        val state = awaitItem()
        assertEquals(testOrders, (state as OrderState.Success).orders)
    }
}
```

**Key takeaway:** Prefer fakes over mocks. Fakes are reusable, catch interface changes at compile time, and test behavior rather than implementation. Mock-based tests are brittle and break on internal refactoring.

### Lesson 10.3: Testing Use Cases

Use Cases are the easiest classes to test after MVI reducers. They're pure Kotlin classes with injected dependencies — no Android context, no lifecycle, no coroutine scope management. You inject fakes, call the Use Case, and assert the output.

For Use Cases that return `Flow`, use Turbine. For Use Cases that return suspend results, use `runTest` directly.

```kotlin
class GetOrderSummaryUseCaseTest {
    private val fakeOrderRepo = FakeOrderRepository()
    private val fakeUserRepo = FakeUserRepository()

    private val useCase = GetOrderSummaryUseCase(
        orderRepository = fakeOrderRepo,
        userRepository = fakeUserRepo
    )

    @Test
    fun `premium user gets 10% discount`() = runTest {
        fakeOrderRepo.setOrder(Order(
            id = "order-1",
            items = listOf(OrderItem("p1", "Laptop", price = 100000, quantity = 1))
        ))
        fakeUserRepo.setUser(User(id = "u1", name = "Test", isPremium = true))

        useCase("order-1").test {
            val summary = awaitItem()
            assertEquals(100000L, summary.subtotal)
            assertEquals(10000L, summary.discount) // 10% for premium
            assertEquals(90000L, summary.total) // subtotal - discount (free shipping > $50)
            assertTrue(summary.isPremiumDiscount)
            awaitComplete()
        }
    }

    @Test
    fun `non-premium user gets no discount`() = runTest {
        fakeOrderRepo.setOrder(Order(
            id = "order-1",
            items = listOf(OrderItem("p1", "Mouse", price = 2999, quantity = 1))
        ))
        fakeUserRepo.setUser(User(id = "u1", name = "Test", isPremium = false))

        useCase("order-1").test {
            val summary = awaitItem()
            assertEquals(2999L, summary.subtotal)
            assertEquals(0L, summary.discount)
            assertEquals(2999L + 599L, summary.total) // shipping for orders < $50
            assertFalse(summary.isPremiumDiscount)
            awaitComplete()
        }
    }
}
```

**Key takeaway:** Use Case tests are straightforward: inject fakes, call the function, assert the output. No Android context, no lifecycle management, no coroutine scope setup. If your Use Case tests require Android dependencies, the Use Case has too many responsibilities.

### Lesson 10.4: Testing Repositories

Repository tests verify the coordination between data sources — that network results update the database, that cached data is returned when the network fails, and that pending actions are queued correctly. Use fakes for both the remote and local data sources.

```kotlin
class OrderRepositoryTest {
    private val fakeApi = FakeOrderApi()
    private val fakeDao = FakeOrderDao()
    private val repository = OrderRepositoryImpl(
        api = fakeApi,
        dao = fakeDao
    )

    @Test
    fun `observeOrders returns data from database`() = runTest {
        val entity = OrderEntity(id = "1", item = "Laptop", total = 99900)
        fakeDao.insertAll(listOf(entity))

        repository.observeOrders().test {
            val orders = awaitItem()
            assertEquals(1, orders.size)
            assertEquals("Laptop", orders[0].item)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `refreshOrders fetches from API and inserts into database`() = runTest {
        val apiResponse = listOf(OrderDto(id = "1", item = "Laptop", total = 99900))
        fakeApi.setResponse(apiResponse)

        repository.refreshOrders()

        val stored = fakeDao.getAllOrders()
        assertEquals(1, stored.size)
        assertEquals("Laptop", stored[0].item)
    }

    @Test
    fun `refreshOrders does not clear database on network failure`() = runTest {
        // Pre-populate database with cached data
        fakeDao.insertAll(listOf(OrderEntity(id = "1", item = "Cached", total = 100)))
        fakeApi.setShouldFail(true)

        repository.refreshOrders() // should not throw

        val stored = fakeDao.getAllOrders()
        assertEquals(1, stored.size) // cached data preserved
        assertEquals("Cached", stored[0].item)
    }

    @Test
    fun `cancelOrder removes order from database`() = runTest {
        fakeDao.insertAll(listOf(OrderEntity(id = "1", item = "Laptop", total = 99900)))

        repository.cancelOrder("1")

        val stored = fakeDao.getAllOrders()
        assertTrue(stored.isEmpty())
    }
}

// Fake DAO — in-memory Room replacement
class FakeOrderDao : OrderDao {
    private val orders = mutableListOf<OrderEntity>()
    private val _flow = MutableSharedFlow<List<OrderEntity>>(replay = 1)

    override fun observeAll(): Flow<List<OrderEntity>> = _flow.onStart { emit(orders.toList()) }
    override suspend fun insertAll(entities: List<OrderEntity>) {
        orders.addAll(entities)
        _flow.emit(orders.toList())
    }
    override suspend fun getAllOrders(): List<OrderEntity> = orders.toList()
    override suspend fun delete(id: String) {
        orders.removeAll { it.id == id }
        _flow.emit(orders.toList())
    }
}
```

**Key takeaway:** Repository tests verify data source coordination: network updates database, database provides cached data, failures don't corrupt state. Use fake DAOs and fake APIs to isolate the coordination logic.

### Lesson 10.5: Testing Coroutines

Coroutine-based code requires special testing utilities. `runTest` from `kotlinx-coroutines-test` provides a `TestCoroutineScheduler` that controls virtual time — `delay()` calls advance instantly, and you can explicitly advance time to test timeout behavior.

Use `StandardTestDispatcher` for deterministic test execution. It doesn't execute coroutines automatically — you control when they run via `advanceUntilIdle()` or `advanceTimeBy()`. This prevents race conditions in tests and makes assertions predictable.

```kotlin
class SearchViewModelTest {
    private val testDispatcher = StandardTestDispatcher()
    private val fakeRepo = FakeSearchRepository()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `search debounces input for 300ms`() = runTest(testDispatcher) {
        val viewModel = SearchViewModel(fakeRepo, testDispatcher)
        fakeRepo.setResults(listOf("Kotlin", "Kotlin Coroutines"))

        // Type quickly — should not trigger search yet
        viewModel.onQueryChanged("K")
        advanceTimeBy(100)
        viewModel.onQueryChanged("Ko")
        advanceTimeBy(100)
        viewModel.onQueryChanged("Kot")
        advanceTimeBy(100)

        // Search should not have been called yet (only 300ms since last change)
        assertEquals(0, fakeRepo.searchCallCount)

        // After 300ms debounce window, search triggers
        advanceTimeBy(300)
        assertEquals(1, fakeRepo.searchCallCount)
        assertEquals("Kot", fakeRepo.lastQuery)
    }

    @Test
    fun `search cancels previous request when new query arrives`() = runTest(testDispatcher) {
        val viewModel = SearchViewModel(fakeRepo, testDispatcher)
        fakeRepo.setDelay(500) // simulate slow API

        viewModel.onQueryChanged("Kotlin")
        advanceTimeBy(350) // past debounce, search starts

        viewModel.onQueryChanged("Java") // new query cancels previous
        advanceTimeBy(800) // wait for debounce + API

        assertEquals("Java", fakeRepo.lastQuery)
        assertEquals(1, fakeRepo.completedSearchCount) // only one completed
    }
}
```

**Key takeaway:** Use `StandardTestDispatcher` with `advanceTimeBy()` to test time-dependent behavior like debouncing, timeouts, and retry delays. This makes tests deterministic — no flaky tests from real-time race conditions.

### Lesson 10.6: Integration and Architecture Tests

Unit tests verify individual classes. Integration tests verify that layers work together correctly — that the ViewModel correctly coordinates with the Repository, which correctly coordinates with Data Sources. Architecture tests verify structural rules — that the domain module doesn't import Android classes, that feature modules don't depend on each other.

For integration tests, use fakes at the outermost boundary (fake API server, in-memory database) and real implementations for everything in between. This catches integration issues that unit tests miss — mapper bugs, Flow operator ordering, state race conditions.

```kotlin
// Integration test — real ViewModel, real Repository, fake data sources
class OrderFlowIntegrationTest {
    private val fakeApi = FakeOrderApi()
    private val fakeDao = FakeOrderDao()
    private val testDispatcher = StandardTestDispatcher()

    private val repository = OrderRepositoryImpl(fakeApi, fakeDao)
    private val useCase = GetOrderSummaryUseCase(repository, FakeUserRepository())
    private lateinit var viewModel: OrderViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        viewModel = OrderViewModel(
            getOrderSummary = useCase,
            repository = repository,
            ioDispatcher = testDispatcher,
            savedStateHandle = SavedStateHandle()
        )
    }

    @Test
    fun `full flow - API response appears in ViewModel state`() = runTest(testDispatcher) {
        // Setup: API returns orders
        fakeApi.setResponse(listOf(
            OrderDto(id = "1", item = "Laptop", total = 99900)
        ))

        // Action: ViewModel refreshes
        viewModel.refreshOrders()
        advanceUntilIdle()

        // Assert: state contains the order from API, via Repository, via DAO
        viewModel.state.test {
            val state = awaitItem()
            assertTrue(state is OrderState.Success)
            assertEquals(1, (state as OrderState.Success).orders.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `full flow - network failure shows cached data`() = runTest(testDispatcher) {
        // Pre-populate cache
        fakeDao.insertAll(listOf(OrderEntity(id = "1", item = "Cached", total = 100)))

        // API fails
        fakeApi.setShouldFail(true)

        viewModel.refreshOrders()
        advanceUntilIdle()

        // Cached data should still be in state
        viewModel.state.test {
            val state = awaitItem()
            assertTrue(state is OrderState.Success)
            assertEquals("Cached", (state as OrderState.Success).orders[0].item)
            cancelAndIgnoreRemainingEvents()
        }
    }
}

// Architecture test — verify module dependency rules
class ArchitectureRulesTest {
    @Test
    fun `domain module does not import Android classes`() {
        // Using ArchUnit or custom validation
        val domainFiles = File("domain/src/main/kotlin")
            .walkTopDown()
            .filter { it.extension == "kt" }
            .toList()

        domainFiles.forEach { file ->
            val content = file.readText()
            assertFalse(
                content.contains("import android."),
                "Domain file ${file.name} imports Android classes"
            )
            assertFalse(
                content.contains("import androidx."),
                "Domain file ${file.name} imports AndroidX classes"
            )
        }
    }
}
```

**Key takeaway:** Integration tests verify that layers work together correctly — they catch mapper bugs, Flow ordering issues, and state race conditions that unit tests miss. Architecture tests enforce structural rules at the build level.

### Lesson 10.7: Testing Checklist

Before shipping any feature, verify that your tests cover these critical scenarios. Missing even one of these has caused production bugs in real apps.

**ViewModel tests:** initial state is correct, loading state appears, success state contains data, error state handles failure, one-time events fire exactly once, SavedStateHandle survives recreation.

**Repository tests:** cached data is returned when network fails, network updates database, stale cache is refreshed, pending actions are queued on offline writes.

**Use Case tests:** business rules are applied correctly, edge cases (empty input, maximum values) are handled, error types are returned correctly.

**Integration tests:** full flow from API response to UI state works, offline flow works, error flow produces correct UI state.

```kotlin
// Minimal test checklist for a feature
class FeatureTestChecklist {
    // ViewModel
    @Test fun `initial state is Loading`() { /* ... */ }
    @Test fun `success state contains data`() { /* ... */ }
    @Test fun `error state shows message`() { /* ... */ }
    @Test fun `navigation event fires on action`() { /* ... */ }
    @Test fun `state survives process death via SavedStateHandle`() { /* ... */ }

    // Repository
    @Test fun `returns cached data when network fails`() { /* ... */ }
    @Test fun `refreshes database from network`() { /* ... */ }
    @Test fun `queues pending action on offline write`() { /* ... */ }

    // Use Case
    @Test fun `applies business rules correctly`() { /* ... */ }
    @Test fun `handles edge cases`() { /* ... */ }
    @Test fun `returns typed errors`() { /* ... */ }

    // Integration
    @Test fun `API response flows to UI state`() { /* ... */ }
    @Test fun `offline mode shows cached data`() { /* ... */ }
}
```

**Key takeaway:** A test checklist ensures consistent coverage across features. Cover initial state, success, error, events, process death, offline, and edge cases. Missing any of these has caused production bugs.

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
