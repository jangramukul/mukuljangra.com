---
title: "Android Architecture Mastery"
layout: course
description: "Design scalable, testable Android apps — MVVM, MVI, Clean Architecture, Repository pattern, Use Cases, and modularization strategies."
icon: "🏗️"
color: "#34d399"
difficulty: "Intermediate to Expert"
modules: 8
lessons: 38
duration: "6 weeks"
order: 4
tags:
  - Architecture
  - Android
  - Design Patterns
what_you_learn:
  - "Implement MVVM with proper separation of concerns"
  - "Build the Repository pattern for offline-first data access"
  - "Apply Clean Architecture — domain, data, and presentation layers"
  - "Design unidirectional data flow with MVI pattern"
  - "Structure multi-module Android projects"
  - "Handle errors gracefully across all architecture layers"
prerequisites:
  - "Kotlin and coroutines basics"
  - "Android development experience"
  - "ViewModel and LiveData/Flow familiarity"
---

## Module 1: Why Architecture Matters

Bad architecture doesn't hurt on day one. It hurts on day 100 when a simple feature takes a week, every change breaks something else, and testing is impossible.

### Lesson 1.1: The Cost of No Architecture

Without clear architecture, Android apps become Activity-centric monsters — 2,000-line Activities that mix UI, business logic, network calls, and database access. This is the "God Activity" anti-pattern.

```kotlin
// ❌ God Activity — everything in one place
class ProfileActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // UI setup
        // Network call
        // Database query
        // Business logic
        // Analytics
        // Navigation
        // Error handling
        // All in 2,000 lines
    }
}

// ✅ Separated concerns
class ProfileScreen {  // UI only
    fun render(state: ProfileState) { }
}

class ProfileViewModel {  // Business logic
    fun loadProfile(userId: String) { }
}

class ProfileRepository {  // Data access
    fun getProfile(userId: String): Profile { }
}
```

**Key takeaway:** Architecture is about separation of concerns — each class has one job, one reason to change. This makes code testable, maintainable, and understandable.

### Lesson 1.2: Google's Recommended Architecture

Google's official architecture guide defines three layers.

- **UI Layer** — Displays data, handles user input. Contains UI elements (Compose/Views) and state holders (ViewModel).
- **Domain Layer** (optional) — Contains business logic in Use Cases. Sits between UI and Data.
- **Data Layer** — Manages data from network, database, and preferences. Contains Repositories and Data Sources.

**Data flows down, events flow up.** The UI layer observes state from ViewModel. ViewModel gets data from Repository. Repository coordinates data sources. No layer reaches upward.

**Key takeaway:** Follow the dependency rule — outer layers depend on inner layers, never the reverse. The UI depends on the ViewModel, but the ViewModel never imports UI classes.

### Lesson 1.3: Dependency Rule and Inversion

```kotlin
// ❌ ViewModel depends on concrete implementation
class UserViewModel {
    private val api = RetrofitUserApi()  // Hard dependency
    private val db = RoomUserDao()       // Hard dependency
}

// ✅ ViewModel depends on abstraction
class UserViewModel(
    private val repository: UserRepository  // Interface
) : ViewModel()

// Repository interface defined in domain layer
interface UserRepository {
    fun observeUser(id: String): Flow<User>
    suspend fun refreshUser(id: String)
}

// Implementation in data layer
class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao
) : UserRepository
```

**Key takeaway:** Depend on abstractions, not implementations. This is the Dependency Inversion Principle — it makes your code testable (swap implementations in tests) and flexible (change database without touching ViewModel).

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

Take the following God Activity and refactor it into properly separated classes following Google's recommended architecture layers.

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

// Data Layer — handles data sources
interface ProductRepository {
    fun observeProducts(): Flow<List<Product>>
    suspend fun refreshProducts()
}

class ProductRepositoryImpl(
    private val api: ProductApi,
    private val dao: ProductDao
) : ProductRepository {
    override fun observeProducts(): Flow<List<Product>> = dao.observeAll()
    override suspend fun refreshProducts() {
        val products = api.fetchProducts()
        dao.insertAll(products)
    }
}

// Domain Layer — business logic
class ApplyDiscountsUseCase(private val repository: ProductRepository) {
    operator fun invoke(): Flow<List<Product>> {
        return repository.observeProducts().map { products ->
            products.map { it.copy(price = it.price * 0.9) }
        }
    }
}

// UI Layer — state holder
class ProductViewModel(
    private val applyDiscounts: ApplyDiscountsUseCase,
    private val repository: ProductRepository
) : ViewModel() {
    private val _state = MutableStateFlow<List<Product>>(emptyList())
    val state: StateFlow<List<Product>> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.refreshProducts()
            applyDiscounts().collect { _state.value = it }
        }
    }
}
```

Each class now has a single responsibility: the Repository manages data access, the Use Case applies business logic, and the ViewModel holds UI state. The Activity/Screen simply observes the ViewModel's state.

---

## Module 2: MVVM Pattern

Model-View-ViewModel is the standard Android architecture. Google recommends it, and Android Jetpack is built around it.

### Lesson 2.1: ViewModel Responsibilities

```kotlin
class OrdersViewModel(
    private val ordersRepository: OrdersRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _state = MutableStateFlow(OrdersState())
    val state: StateFlow<OrdersState> = _state.asStateFlow()

    init {
        loadOrders()
    }

    fun onEvent(event: OrdersEvent) {
        when (event) {
            is OrdersEvent.RefreshOrders -> loadOrders()
            is OrdersEvent.FilterChanged -> applyFilter(event.filter)
            is OrdersEvent.OrderClicked -> selectOrder(event.orderId)
        }
    }

    private fun loadOrders() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            ordersRepository.observeOrders()
                .catch { e -> _state.update { it.copy(error = e.message) } }
                .collect { orders ->
                    _state.update { it.copy(orders = orders, isLoading = false) }
                }
        }
    }
}
```

**ViewModel rules:**
- Holds UI state and exposes it via `StateFlow`
- Handles user events and business logic
- Survives configuration changes
- Never references `Activity`, `Context`, or `View` directly
- Uses `viewModelScope` for coroutines

**Key takeaway:** The ViewModel is the single source of truth for UI state. The UI observes it, never modifies it directly.

### Lesson 2.2: UI State Design

```kotlin
// ✅ Single state class — one source of truth
data class ProfileState(
    val user: User? = null,
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

// ✅ Sealed interface for distinct screen states
sealed interface ProfileState {
    data object Loading : ProfileState
    data class Success(val user: User, val posts: List<Post>) : ProfileState
    data class Error(val message: String) : ProfileState
}
```

**Single class vs Sealed** — Use a single `data class` when multiple fields can be independently loaded (loading + partial data). Use `sealed interface` when the screen has distinct, mutually exclusive states.

**Key takeaway:** Design your UI state as an immutable data class. Every UI update creates a new state object via `copy()`.

### Lesson 2.3: One-Time Events

```kotlin
// ❌ Anti-pattern — boolean flags for events
data class LoginState(
    val navigateToHome: Boolean = false  // Who resets this?
)

// ✅ Channel-based events
class LoginViewModel : ViewModel() {
    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            val result = authRepository.login(email, password)
            if (result.isSuccess) {
                _events.send(LoginEvent.NavigateToHome)
            } else {
                _events.send(LoginEvent.ShowError(result.errorMessage))
            }
        }
    }
}

sealed interface LoginEvent {
    data object NavigateToHome : LoginEvent
    data class ShowError(val message: String) : LoginEvent
}
```

**Key takeaway:** Use `Channel` for one-time events (navigation, snackbars, toasts). State is for what the screen looks like. Events are for things that happen once.

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

Create a `SearchViewModel` that manages a search screen with UI state (query, results, loading) exposed as `StateFlow` and one-time events (show error toast) via `Channel`.

#### Solution

```kotlin
data class SearchState(
    val query: String = "",
    val results: List<String> = emptyList(),
    val isLoading: Boolean = false
)

sealed interface SearchEvent {
    data class ShowError(val message: String) : SearchEvent
}

class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _state = MutableStateFlow(SearchState())
    val state: StateFlow<SearchState> = _state.asStateFlow()

    private val _events = Channel<SearchEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onQueryChanged(query: String) {
        _state.update { it.copy(query = query) }
    }

    fun onSearch() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                val results = searchRepository.search(_state.value.query)
                _state.update { it.copy(results = results, isLoading = false) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false) }
                _events.send(SearchEvent.ShowError("Search failed: ${e.message}"))
            }
        }
    }
}
```

The `SearchState` data class holds all UI state as a single source of truth, exposed via immutable `StateFlow`. One-time error events use a `Channel` so they fire exactly once and aren't replayed on configuration changes.

---

## Module 3: Repository Pattern

### Lesson 3.1: Single Source of Truth

```kotlin
class ArticlesRepository(
    private val api: ArticlesApi,
    private val dao: ArticlesDao,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    // Database is the single source of truth
    fun observeArticles(): Flow<List<Article>> = dao.observeAll()

    // Network refreshes the database, not the UI directly
    suspend fun refresh() = withContext(dispatcher) {
        try {
            val articles = api.getArticles()
            dao.insertAll(articles)
        } catch (e: Exception) {
            // Network failure — cached data still flows via observeArticles()
        }
    }
}
```

**Key takeaway:** The database is the source of truth. Network responses update the database. The UI observes the database. This gives you offline support and consistent state.

### Lesson 3.2: Offline-First Strategy

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao
) {
    fun observeUser(userId: String): Flow<Resource<User>> = flow {
        // 1. Emit cached data immediately
        val cached = dao.getUser(userId)
        if (cached != null) {
            emit(Resource.Success(cached))
        }

        // 2. Fetch from network
        try {
            val fresh = api.getUser(userId)
            dao.insertUser(fresh)
            emit(Resource.Success(fresh))
        } catch (e: Exception) {
            if (cached == null) {
                emit(Resource.Error(e))
            }
            // If we have cached data, the user already has something to see
        }
    }
}

sealed interface Resource<out T> {
    data class Success<T>(val data: T) : Resource<T>
    data class Error(val exception: Throwable) : Resource<Nothing>
    data object Loading : Resource<Nothing>
}
```

**Key takeaway:** Show cached data first, refresh in background. The user should never stare at a loading spinner when you have perfectly good cached data.

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

> **Explanation:** If cached data exists and the network fails, the user already has something to see. Showing an error screen would be a worse experience than displaying slightly stale data. The app can silently retry later.

### Coding Challenge: Build an Offline-First Repository

Implement a `NewsRepository` that observes articles from a local database, refreshes from network in the background, and wraps results in a `Resource` sealed interface.

#### Solution

```kotlin
sealed interface Resource<out T> {
    data object Loading : Resource<Nothing>
    data class Success<T>(val data: T) : Resource<T>
    data class Error(val exception: Throwable) : Resource<Nothing>
}

class NewsRepository(
    private val api: NewsApi,
    private val dao: NewsDao
) {
    fun observeArticles(): Flow<Resource<List<Article>>> = flow {
        emit(Resource.Loading)

        // Emit cached data immediately
        val cached = dao.getAllArticles()
        if (cached.isNotEmpty()) {
            emit(Resource.Success(cached))
        }

        // Refresh from network
        try {
            val fresh = api.getArticles()
            dao.insertAll(fresh)
            emit(Resource.Success(dao.getAllArticles()))
        } catch (e: Exception) {
            if (cached.isEmpty()) {
                emit(Resource.Error(e))
            }
            // If cached data exists, user already sees content — no error needed
        }
    }
}
```

The repository emits cached data first so the user sees content immediately, then refreshes from the network in the background. If the network fails and no cache exists, only then is an error emitted.

---

## Module 4: Clean Architecture

### Lesson 4.1: Use Cases (Interactors)

```kotlin
// Use case — single responsibility, single public method
class GetUserProfileUseCase(
    private val userRepository: UserRepository,
    private val postsRepository: PostsRepository
) {
    operator fun invoke(userId: String): Flow<UserProfile> {
        return combine(
            userRepository.observeUser(userId),
            postsRepository.observeUserPosts(userId)
        ) { user, posts ->
            UserProfile(user, posts)
        }
    }
}

// Usage in ViewModel
class ProfileViewModel(
    private val getUserProfile: GetUserProfileUseCase
) : ViewModel() {
    fun loadProfile(userId: String) {
        viewModelScope.launch {
            getUserProfile(userId).collect { profile ->
                _state.value = ProfileState.Success(profile)
            }
        }
    }
}
```

**When to use Use Cases** — When business logic is shared across multiple ViewModels, or when the logic is complex enough to warrant its own class. Don't create a UseCase that just delegates to a Repository — that's unnecessary indirection.

**Key takeaway:** Use Cases encapsulate business logic that doesn't belong in ViewModel or Repository. They coordinate between repositories and apply business rules.

### Lesson 4.2: Layer Separation with Modules

```kotlin
// Domain layer — pure Kotlin, no Android dependencies
// :domain module
interface UserRepository {
    fun observeUser(id: String): Flow<User>
}

data class User(val id: String, val name: String, val email: String)

// Data layer — Android dependencies allowed
// :data module (depends on :domain)
class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao
) : UserRepository

// UI layer — Compose/Views + ViewModel
// :feature:profile module (depends on :domain)
class ProfileViewModel(
    private val userRepository: UserRepository
) : ViewModel()
```

**Key takeaway:** The domain layer has zero Android dependencies. It contains interfaces, data models, and use cases. This makes business logic testable without Robolectric or Android instrumentation.

### Quiz: Clean Architecture

#### When should you create a Use Case class?

- ❌ For every single Repository method — always wrap it
- ✅ When business logic is shared across ViewModels or complex enough to warrant its own class
- ❌ Only when the app has more than 10 screens
- ❌ Never — ViewModels should contain all business logic

> **Explanation:** Use Cases should encapsulate reusable or complex business logic. Creating a Use Case that simply delegates to a Repository with no additional logic is unnecessary indirection. Use them when logic is shared or complex.

#### What is the key characteristic of the domain layer in Clean Architecture?

- ❌ It depends on the Android framework
- ❌ It contains Retrofit and Room implementations
- ✅ It has zero Android dependencies — pure Kotlin only
- ❌ It directly accesses the database

> **Explanation:** The domain layer contains only interfaces, data models, and use cases — all in pure Kotlin. This means business logic can be unit tested without Robolectric or any Android instrumentation, making tests fast and reliable.

#### Which module dependency is FORBIDDEN in Clean Architecture?

- ❌ Feature module depending on domain module
- ❌ Data module depending on domain module
- ✅ Domain module depending on data module
- ❌ App module depending on feature modules

> **Explanation:** The domain layer must never depend on the data layer. The dependency rule says inner layers (domain) must not depend on outer layers (data, UI). The data layer implements interfaces defined in the domain layer, not the other way around.

### Coding Challenge: Create a Use Case That Coordinates Repositories

Build a `GetDashboardUseCase` that combines data from three repositories — user profile, recent orders, and notifications — into a single `DashboardData` model.

#### Solution

```kotlin
data class DashboardData(
    val userName: String,
    val recentOrders: List<Order>,
    val unreadNotifications: Int
)

class GetDashboardUseCase(
    private val userRepository: UserRepository,
    private val ordersRepository: OrdersRepository,
    private val notificationsRepository: NotificationsRepository
) {
    operator fun invoke(userId: String): Flow<DashboardData> {
        return combine(
            userRepository.observeUser(userId),
            ordersRepository.observeRecentOrders(userId),
            notificationsRepository.observeUnreadCount(userId)
        ) { user, orders, unreadCount ->
            DashboardData(
                userName = user.name,
                recentOrders = orders.take(5),
                unreadNotifications = unreadCount
            )
        }
    }
}
```

This Use Case coordinates three repositories and applies business logic (limiting to 5 recent orders). The ViewModel simply calls `getDashboard(userId)` and collects the result — it doesn't need to know which repositories are involved.

---

## Module 5: MVI Pattern

### Lesson 5.1: Model-View-Intent

```kotlin
// State
data class CounterState(
    val count: Int = 0,
    val isLoading: Boolean = false
)

// Intent (user actions)
sealed interface CounterIntent {
    data object Increment : CounterIntent
    data object Decrement : CounterIntent
    data object Reset : CounterIntent
}

// Reducer — pure function
fun reduce(state: CounterState, intent: CounterIntent): CounterState {
    return when (intent) {
        CounterIntent.Increment -> state.copy(count = state.count + 1)
        CounterIntent.Decrement -> state.copy(count = state.count - 1)
        CounterIntent.Reset -> state.copy(count = 0)
    }
}

// ViewModel with MVI
class CounterViewModel : ViewModel() {
    private val _state = MutableStateFlow(CounterState())
    val state: StateFlow<CounterState> = _state.asStateFlow()

    fun processIntent(intent: CounterIntent) {
        _state.update { reduce(it, intent) }
    }
}
```

**MVI vs MVVM** — MVI adds a strict unidirectional flow with a reducer function. State transitions are predictable and testable. MVVM is more flexible but can become messy with many state mutations. MVI shines when state is complex.

**Key takeaway:** MVI guarantees predictable state transitions. Every state change goes through a single reducer function, making debugging and testing straightforward.

### Quiz: MVI Pattern

#### What makes MVI different from MVVM?

- ❌ MVI does not use ViewModel
- ❌ MVI allows bidirectional data flow
- ✅ MVI enforces strict unidirectional data flow with a reducer function for all state transitions
- ❌ MVI eliminates the need for state management

> **Explanation:** MVI adds a strict unidirectional flow where all state changes go through a single reducer function. This makes state transitions predictable and easy to debug, unlike MVVM where state can be mutated from multiple places.

#### What is a "reducer" in MVI?

- ❌ A function that reduces the number of states
- ✅ A pure function that takes the current state and an intent, and returns a new state
- ❌ A class that reduces memory usage
- ❌ A coroutine that reduces latency

> **Explanation:** A reducer is a pure function: `(State, Intent) -> State`. It takes the current state and a user intent (action), and returns a new state. Being a pure function means it has no side effects and always produces the same output for the same input, making it trivially testable.

### Coding Challenge: Build an MVI Todo List

Implement a complete MVI pattern for a Todo list with intents to add, toggle, and delete items, a reducer function, and a ViewModel.

#### Solution

```kotlin
data class Todo(val id: String, val text: String, val isDone: Boolean = false)

data class TodoState(
    val todos: List<Todo> = emptyList(),
    val inputText: String = ""
)

sealed interface TodoIntent {
    data class UpdateInput(val text: String) : TodoIntent
    data object AddTodo : TodoIntent
    data class ToggleTodo(val id: String) : TodoIntent
    data class DeleteTodo(val id: String) : TodoIntent
}

fun reduce(state: TodoState, intent: TodoIntent): TodoState {
    return when (intent) {
        is TodoIntent.UpdateInput -> state.copy(inputText = intent.text)
        is TodoIntent.AddTodo -> {
            if (state.inputText.isBlank()) return state
            val newTodo = Todo(id = UUID.randomUUID().toString(), text = state.inputText)
            state.copy(todos = state.todos + newTodo, inputText = "")
        }
        is TodoIntent.ToggleTodo -> state.copy(
            todos = state.todos.map {
                if (it.id == intent.id) it.copy(isDone = !it.isDone) else it
            }
        )
        is TodoIntent.DeleteTodo -> state.copy(
            todos = state.todos.filter { it.id != intent.id }
        )
    }
}

class TodoViewModel : ViewModel() {
    private val _state = MutableStateFlow(TodoState())
    val state: StateFlow<TodoState> = _state.asStateFlow()

    fun processIntent(intent: TodoIntent) {
        _state.update { reduce(it, intent) }
    }
}
```

Every user action is an `Intent`, every state change goes through the `reduce` function, and the ViewModel simply pipes intents through the reducer. Testing is straightforward — call `reduce()` with a known state and intent, then assert the output.

---

## Module 6: Modularization

### Lesson 6.1: Feature Modules

```
app/
├── :app                    (Application module — wiring)
├── :core:network            (Retrofit, OkHttp)
├── :core:database           (Room)
├── :core:common             (Extensions, utils)
├── :core:ui                 (Shared Compose components)
├── :feature:home            (Home screen)
├── :feature:profile         (Profile feature)
├── :feature:settings        (Settings feature)
└── :domain                  (Business logic, interfaces)
```

**Benefits:**
- **Build speed** — Only changed modules recompile
- **Encapsulation** — Features can't access each other's internals
- **Team scalability** — Teams own modules, not files
- **Testability** — Each module has focused tests

### Lesson 6.2: Module Dependencies

```kotlin
// :feature:profile/build.gradle.kts
dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:ui"))
    implementation(project(":domain"))
    // ❌ Never depend on other feature modules
    // implementation(project(":feature:settings"))
}
```

**The rule** — Feature modules depend on core and domain modules. Feature modules never depend on each other. Communication between features goes through the app module or a navigation abstraction.

**Key takeaway:** Modularization pays off when the project grows beyond 3-4 developers. Start with core + features separation. Don't over-modularize a small project.

### Quiz: Modularization

#### Which module dependency is FORBIDDEN in a properly modularized project?

- ❌ Feature module depending on core:ui
- ❌ Feature module depending on domain
- ✅ Feature module depending on another feature module
- ❌ App module depending on feature modules

> **Explanation:** Feature modules must never depend on each other. This ensures encapsulation — features can't access each other's internals. Communication between features should go through the app module or a navigation abstraction.

#### When does modularization start paying off?

- ❌ Immediately on any project, no matter the size
- ❌ Only on projects with 50+ modules
- ✅ When the project grows beyond 3-4 developers
- ❌ Only when using Jetpack Compose

> **Explanation:** Modularization adds complexity — build configuration, module wiring, and dependency management. The benefits (build speed, encapsulation, team scalability) outweigh the costs once multiple developers work on the codebase. Over-modularizing a solo project creates unnecessary overhead.

### Coding Challenge: Design Module Dependencies

Given a shopping app with features for catalog, cart, and checkout, define the correct `build.gradle.kts` dependencies for each module, ensuring no feature-to-feature dependencies.

#### Solution

```kotlin
// :core:network/build.gradle.kts
dependencies {
    implementation(project(":core:common"))
}

// :core:database/build.gradle.kts
dependencies {
    implementation(project(":core:common"))
}

// :domain/build.gradle.kts
dependencies {
    // Pure Kotlin — no Android or other module dependencies
}

// :feature:catalog/build.gradle.kts
dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:ui"))
    implementation(project(":domain"))
    // ❌ NEVER: implementation(project(":feature:cart"))
}

// :feature:cart/build.gradle.kts
dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:ui"))
    implementation(project(":domain"))
    // ❌ NEVER: implementation(project(":feature:catalog"))
}

// :feature:checkout/build.gradle.kts
dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:ui"))
    implementation(project(":domain"))
    // ❌ NEVER: implementation(project(":feature:cart"))
}

// :app/build.gradle.kts — wires everything together
dependencies {
    implementation(project(":feature:catalog"))
    implementation(project(":feature:cart"))
    implementation(project(":feature:checkout"))
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    implementation(project(":domain"))
}
```

Each feature module only depends on core and domain modules. The `:app` module is the only one that knows about all features and wires them together. If catalog needs to navigate to cart, it uses a navigation abstraction defined in `:core:common` or `:domain`.

---

## Module 7: Error Handling Strategies

### Lesson 7.1: Result Types

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
    UNKNOWN
}

// Extension for clean error handling
inline fun <T> AppResult<T>.onSuccess(action: (T) -> Unit): AppResult<T> {
    if (this is AppResult.Success) action(data)
    return this
}

inline fun <T> AppResult<T>.onError(action: (AppResult.Error) -> Unit): AppResult<T> {
    if (this is AppResult.Error) action(this)
    return this
}
```

### Lesson 7.2: Repository Error Mapping

```kotlin
class UserRepository(private val api: UserApi) {
    suspend fun getUser(id: String): AppResult<User> {
        return try {
            val response = api.getUser(id)
            AppResult.Success(response.toDomain())
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> AppResult.Error("Session expired", e, ErrorCode.UNAUTHORIZED)
                404 -> AppResult.Error("User not found", e, ErrorCode.NOT_FOUND)
                else -> AppResult.Error("Server error", e, ErrorCode.SERVER_ERROR)
            }
        } catch (e: IOException) {
            AppResult.Error("No internet connection", e, ErrorCode.NETWORK_ERROR)
        }
    }
}
```

**Key takeaway:** Map exceptions to domain-specific error types at the Repository boundary. The ViewModel should never see raw HTTP exceptions or IOExceptions.

### Quiz: Error Handling Strategies

#### Where should raw exceptions (HttpException, IOException) be mapped to domain error types?

- ❌ In the ViewModel
- ❌ In the UI layer
- ✅ At the Repository boundary
- ❌ In the Use Case

> **Explanation:** The Repository is the boundary between the data layer and the rest of the app. Mapping exceptions here ensures the ViewModel and domain layer never deal with framework-specific exceptions like HttpException or IOException — they only see clean domain error types.

#### What is the advantage of using a sealed interface like `AppResult<T>` over throwing exceptions?

- ❌ It is faster at runtime
- ✅ It makes error handling explicit and forces callers to handle both success and error cases
- ❌ It eliminates all runtime crashes
- ❌ It reduces the number of classes in the project

> **Explanation:** A sealed `AppResult` type makes the error path explicit in the type system. Callers must handle both `Success` and `Error` cases — you can't accidentally forget error handling like you can with try-catch where exceptions propagate silently.

### Coding Challenge: Build a Safe API Caller

Create a reusable `safeApiCall` function that wraps any suspend API call, catches common exceptions, and returns an `AppResult`.

#### Solution

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
    NETWORK_ERROR, UNAUTHORIZED, NOT_FOUND, SERVER_ERROR, TIMEOUT, UNKNOWN
}

suspend fun <T> safeApiCall(apiCall: suspend () -> T): AppResult<T> {
    return try {
        AppResult.Success(apiCall())
    } catch (e: HttpException) {
        when (e.code()) {
            401 -> AppResult.Error("Session expired", e, ErrorCode.UNAUTHORIZED)
            404 -> AppResult.Error("Not found", e, ErrorCode.NOT_FOUND)
            in 500..599 -> AppResult.Error("Server error", e, ErrorCode.SERVER_ERROR)
            else -> AppResult.Error("Request failed", e, ErrorCode.UNKNOWN)
        }
    } catch (e: SocketTimeoutException) {
        AppResult.Error("Request timed out", e, ErrorCode.TIMEOUT)
    } catch (e: IOException) {
        AppResult.Error("No internet connection", e, ErrorCode.NETWORK_ERROR)
    }
}

// Usage in Repository
class ProductRepository(private val api: ProductApi) {
    suspend fun getProduct(id: String): AppResult<Product> {
        return safeApiCall { api.getProduct(id).toDomain() }
    }
}
```

The `safeApiCall` function is reusable across all repositories. It centralizes exception-to-error mapping, so every repository call automatically gets consistent, domain-specific error handling without duplicating try-catch blocks.

---

## Module 8: Testing Architecture

### Lesson 8.1: Testing ViewModels

```kotlin
class ProfileViewModelTest {
    private val fakeRepository = FakeUserRepository()
    private lateinit var viewModel: ProfileViewModel

    @Before
    fun setup() {
        viewModel = ProfileViewModel(fakeRepository)
    }

    @Test
    fun `loadProfile emits success state`() = runTest {
        fakeRepository.setUser(testUser)

        viewModel.state.test {
            assertEquals(ProfileState.Loading, awaitItem())
            viewModel.loadProfile("user-1")
            assertEquals(ProfileState.Success(testUser), awaitItem())
        }
    }

    @Test
    fun `loadProfile emits error on failure`() = runTest {
        fakeRepository.setShouldFail(true)

        viewModel.state.test {
            awaitItem() // Loading
            viewModel.loadProfile("user-1")
            assertTrue(awaitItem() is ProfileState.Error)
        }
    }
}
```

### Lesson 8.2: Fake vs Mock

```kotlin
// ✅ Fake — real implementation with in-memory data
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    private var shouldFail = false

    fun setUser(user: User) { users[user.id] = user }
    fun setShouldFail(fail: Boolean) { shouldFail = fail }

    override fun observeUser(id: String): Flow<User> = flow {
        if (shouldFail) throw IOException("Fake error")
        users[id]?.let { emit(it) }
    }
}

// Fakes are better than mocks because:
// - They're reusable across tests
// - They catch interface changes at compile time
// - They test behavior, not implementation
```

**Key takeaway:** Prefer fakes over mocks. Fakes are real implementations that use in-memory data. They're more maintainable and catch more bugs than mock-based tests.

### Quiz: Testing Architecture

#### Why are fakes preferred over mocks for testing?

- ❌ Fakes are faster to write
- ❌ Fakes use less memory
- ✅ Fakes are reusable, catch interface changes at compile time, and test behavior rather than implementation
- ❌ Fakes don't require any setup

> **Explanation:** Fakes are real implementations with in-memory data. They're reusable across tests, catch breaking interface changes at compile time (mocks don't), and verify actual behavior rather than just checking that specific methods were called.

#### What testing library function is used to test StateFlow emissions in order?

- ❌ collectLatest {}
- ✅ flow.test { awaitItem() }
- ❌ runBlocking { collect {} }
- ❌ assertFlow {}

> **Explanation:** The Turbine library's `test {}` extension on Flow allows you to assert emissions in order using `awaitItem()`. This makes it easy to verify that a ViewModel emits Loading first, then Success or Error, in the correct sequence.

#### What is the main benefit of using constructor injection in ViewModels for testing?

- ❌ It makes the ViewModel faster
- ❌ It reduces the number of classes
- ✅ It allows swapping real dependencies with fakes or mocks in tests
- ❌ It eliminates the need for a ViewModel factory

> **Explanation:** Constructor injection means dependencies are passed in when the ViewModel is created. In tests, you pass fakes instead of real implementations. Without constructor injection, the ViewModel creates its own dependencies internally, making it impossible to substitute them for testing.

### Coding Challenge: Write ViewModel Tests with Fakes

Create a `FakeOrdersRepository` and use it to write tests for an `OrdersViewModel` that handles loading, success, and error states.

#### Solution

```kotlin
// Fake implementation
class FakeOrdersRepository : OrdersRepository {
    private val orders = mutableListOf<Order>()
    private var shouldFail = false

    fun addOrder(order: Order) { orders.add(order) }
    fun setShouldFail(fail: Boolean) { shouldFail = fail }

    override fun observeOrders(): Flow<List<Order>> = flow {
        if (shouldFail) throw IOException("Network error")
        emit(orders.toList())
    }

    override suspend fun refreshOrders() {
        if (shouldFail) throw IOException("Network error")
    }
}

// ViewModel tests
class OrdersViewModelTest {
    private val fakeRepository = FakeOrdersRepository()
    private lateinit var viewModel: OrdersViewModel

    @Before
    fun setup() {
        viewModel = OrdersViewModel(fakeRepository)
    }

    @Test
    fun `loadOrders emits success with orders`() = runTest {
        val testOrder = Order(id = "1", item = "Laptop", total = 999.99)
        fakeRepository.addOrder(testOrder)

        viewModel.loadOrders()

        viewModel.state.test {
            val state = awaitItem()
            assertEquals(false, state.isLoading)
            assertEquals(1, state.orders.size)
            assertEquals("Laptop", state.orders.first().item)
        }
    }

    @Test
    fun `loadOrders emits error on failure`() = runTest {
        fakeRepository.setShouldFail(true)

        viewModel.loadOrders()

        viewModel.state.test {
            val state = awaitItem()
            assertEquals(false, state.isLoading)
            assertNotNull(state.error)
        }
    }

    @Test
    fun `loadOrders emits empty list when no orders`() = runTest {
        viewModel.loadOrders()

        viewModel.state.test {
            val state = awaitItem()
            assertEquals(emptyList<Order>(), state.orders)
        }
    }
}
```

The `FakeOrdersRepository` is reusable across all test classes that need order data. Tests are readable and focused — each test configures the fake, triggers an action, and asserts the resulting state.

---

Thank You for completing the Android Architecture Mastery course! Good architecture is invisible when it works and painful when it's missing. Invest in it early. 🏗️
