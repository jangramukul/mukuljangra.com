---
title: Common Architectural Principles Guide
layout: post
sequence: 16
categories: post
tags:
  - Android
  - Architecture
  - Best Practices
---

A few years into my Android career, I noticed a pattern. Every codebase that was painful to work on violated the same handful of principles. Activities that did everything — fetching data, formatting strings, managing navigation state, validating input. ViewModels that exposed mutable state directly to the UI. Repositories that returned network DTOs straight to the presentation layer. The features worked, but every bug fix risked breaking something else, and every new feature required understanding the entire file to know what was safe to change.

The architectural principles Google recommends for Android aren't academic rules invented to make code "cleaner." They're practical guidelines that directly address real problems — testability, maintainability, and the ability to change one thing without breaking another. I've internalized these through enough production bugs to know they matter, so here's what each principle actually means when applied to Android code.

## Separation of Concerns

The most frequently stated and most frequently violated architectural principle. Separation of concerns means each component has one well-defined responsibility. In Android, the most common violation is putting everything in an Activity or Fragment — network calls, database queries, UI logic, validation, navigation — all in one class.

The problem isn't just aesthetics. When an Activity handles everything, you can't test business logic without booting an emulator. You can't reuse validation logic across screens. You can't change your network library without touching UI code. Every concern is tangled with every other concern.

In modern Android architecture, separation looks like this: the **UI layer** (Activities, Fragments, Composables) handles only rendering and user interaction. It observes state and forwards user actions — nothing else. The **ViewModel** holds UI state and orchestrates business logic, but doesn't know about Android views or navigation implementation. The **Repository** coordinates data sources. The **data sources** (network, database) handle raw data access.

```kotlin
// UI — only rendering and forwarding actions
@Composable
fun OrderListScreen(
    viewModel: OrderListViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    when (val state = uiState) {
        is OrderUiState.Loading -> LoadingIndicator()
        is OrderUiState.Success -> OrderList(
            orders = state.orders,
            onRefresh = { viewModel.refresh() }
        )
        is OrderUiState.Error -> ErrorView(
            message = state.message,
            onRetry = { viewModel.refresh() }
        )
    }
}

// ViewModel — state management, no Android view references
@HiltViewModel
class OrderListViewModel @Inject constructor(
    private val getOrdersUseCase: GetOrdersUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow<OrderUiState>(OrderUiState.Loading)
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = OrderUiState.Loading
            try {
                val orders = getOrdersUseCase()
                _uiState.value = OrderUiState.Success(orders)
            } catch (e: Exception) {
                _uiState.value = OrderUiState.Error(e.message ?: "Failed to load orders")
            }
        }
    }
}
```

Real-world application: if you later need to add a search feature to the orders screen, you add a method to the ViewModel and a search bar to the Composable. You don't need to understand or modify the repository, the database, or the network layer. Each concern is isolated.

## Single Source of Truth

Every data type in your app should have exactly one authoritative source. All other parts of the app read from that source. Only the owner can modify it. This principle prevents the bugs that come from multiple copies of the same data getting out of sync.

In practice, the Single Source of Truth for most data types is the local database. When your app fetches data from the network, it writes it to the database, and the UI observes the database — not the network response directly. This means even if the network call fails, the UI shows the last known good data. It also means there's never a question about which version of the data is "correct" — the database is always the answer.

```kotlin
class OrderRepository(
    private val orderApi: OrderApi,
    private val orderDao: OrderDao
) {

    // Database is the single source of truth
    // UI observes this, not the API response
    fun observeOrders(): Flow<List<Order>> {
        return orderDao.observeAllOrders()
            .map { entities -> entities.map { it.toDomain() } }
    }

    // Network data goes INTO the database, then the Flow emits automatically
    suspend fun refreshOrders() {
        val remoteOrders = orderApi.fetchOrders()
        orderDao.insertAll(remoteOrders.map { it.toEntity() })
        // No need to manually update the UI — the Flow re-emits
    }
}
```

A common mistake is having two sources of truth: a `StateFlow` in the ViewModel that holds the network response, AND a Room database that stores the same data. The ViewModel shows the network response directly, and the database is used as a "backup." When the data gets out of sync — and it will — the UI flickers between two versions. One source. One owner.

## Drive UI From Data Models

The UI should be a function of state, not a manager of state. This means the ViewModel exposes an immutable state object that fully describes what the UI should display, and the UI renders it without adding its own logic.

The most common violation is exposing multiple streams of data from the ViewModel — one for the user, one for the loading state, one for errors — and making the UI combine them. This creates race conditions, inconsistent states (loading AND showing data simultaneously), and makes the UI responsible for state management logic.

```kotlin
// Bad — multiple separate streams, UI does the combining
class BadViewModel : ViewModel() {
    val user = MutableLiveData<User>()
    val isLoading = MutableLiveData<Boolean>()
    val error = MutableLiveData<String?>()
}

// Good — single state object, UI just renders it
data class ProfileUiState(
    val userName: String = "",
    val email: String = "",
    val avatarUrl: String? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class ProfileViewModel @Inject constructor(
    private val userRepository: UserRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    fun loadProfile(userId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val user = userRepository.getUser(userId)
                _uiState.update { it.copy(
                    userName = user.name,
                    email = user.email,
                    avatarUrl = user.avatarUrl,
                    isLoading = false
                )}
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    isLoading = false,
                    errorMessage = e.message
                )}
            }
        }
    }
}
```

Real-world benefit: when you write UI tests, you don't need to test state management logic — you just verify that given a certain `ProfileUiState`, the UI renders correctly. The state management logic is tested separately in ViewModel unit tests.

## The UI Layer vs Data Layer Responsibility

A clear boundary between the UI layer and the data layer prevents a category of bugs I see constantly: the UI directly accessing data sources, or the data layer making assumptions about the UI.

The **UI layer** is responsible for: displaying data, capturing user input, navigation, and showing transient messages (toasts, snackbars). It should never call a network API directly, never write to a database directly, and never contain business logic like price calculation or validation rules.

The **data layer** is responsible for: fetching from the network, storing in the database, caching, synchronization, and data transformation between DTOs and domain models. It should never hold a reference to a Context (use application context through DI), never format strings for display, and never know about the UI state.

## The Domain Layer — Do You Need It?

Google's official architecture guide makes the domain layer optional, and I agree with that guidance. The domain layer contains use cases that encapsulate business logic. For simple CRUD apps where the ViewModel calls the repository and maps the result to UI state, a domain layer adds boilerplate without adding value.

You need a domain layer when: multiple ViewModels share the same business logic (three screens all need "get pending orders sorted by priority"), when business logic is complex enough to warrant independent unit testing (price calculation with discounts, taxes, and promotions), or when you want to enforce the dependency rule strictly (feature modules depend on domain, not on data).

You don't need it when: each ViewModel has unique logic that won't be reused, when the business logic is a simple pass-through from repository to UI, or when the project is small enough that adding a layer adds more complexity than it removes.

## The Reframe — Principles Are About Preventing Categories of Bugs

Here's what I've come to believe about architectural principles: **they're not about writing "good code." They're about preventing specific categories of bugs.** Separation of concerns prevents "changing the network layer broke the UI." Single source of truth prevents "the list shows stale data after editing." Immutable UI state prevents "the UI is in an impossible combination of loading and error." Driving UI from models prevents "the screen flickers between states."

Every principle has a cost — more files, more abstractions, more ceremony. The question isn't whether to follow every principle to the letter. The question is which categories of bugs does your project experience, and which principles prevent them. For a solo project with a handful of screens, you might only need separation of concerns and single source of truth. For a team of ten working on a banking app, you probably need all of them.

The best architecture isn't the most pure. It's the one where your team can add features, fix bugs, and onboard new developers without constantly breaking things. These principles are the guardrails that make that possible.

Thanks for reading!
