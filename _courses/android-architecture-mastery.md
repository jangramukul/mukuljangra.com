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

---

Thank You for completing the Android Architecture Mastery course! Good architecture is invisible when it works and painful when it's missing. Invest in it early. 🏗️
