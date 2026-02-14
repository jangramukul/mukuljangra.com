---
title: Common Architectural Principles Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Best Practices
---

A few years into my Android career, I noticed something. Not a cool pattern from a conference talk — a pain pattern. Every codebase that made me dread Monday morning violated the same handful of principles. Activities that did everything — fetching data, formatting strings, managing navigation state, validating input. ViewModels that exposed mutable state directly to the UI like leaving your diary open on a park bench. Repositories that returned network DTOs straight to the presentation layer. The features worked, sure. But every bug fix risked breaking something else, and every new feature required reading the entire file just to figure out what was safe to touch.

Sound familiar?

The architectural principles Google recommends for Android aren't academic rules invented to make code "cleaner." I used to think they were — just something senior devs liked to lecture about. But after enough production bugs traced back to the same root causes, I realized these principles exist because they solve real, specific problems: testability, maintainability, and the ability to change one thing without the whole house of cards collapsing. Here's what each principle actually means when you apply it to real Android code.

## Separation of Concerns

The most frequently stated and most frequently violated architectural principle. Separation of concerns means each component has one well-defined responsibility. In Android, the classic violation is putting everything in an Activity or Fragment — network calls, database queries, UI logic, validation, navigation — all crammed into one class.

Think of it like a restaurant. You wouldn't want the waiter cooking your food, managing the budget, AND washing the dishes. Not because it's "bad form," but because when the waiter burns your steak, no one's taking orders either. Everything grinds to a halt.

Same thing in code. When an Activity handles everything, you can't test business logic without booting an emulator. You can't reuse validation logic across screens. You can't change your network library without touching UI code. Every concern is tangled with every other concern, and pulling on one thread unravels the whole thing.

In modern Android architecture, separation looks like this: the **UI layer** (Activities, Fragments, Composables) handles only rendering and user interaction. It observes state and forwards user actions — nothing else. The **ViewModel** holds UI state and orchestrates business logic, but doesn't know about Android views or navigation implementation. The **Repository** coordinates data sources. The **data sources** (network, database) handle raw data access.

Each piece does its job and stays in its lane.

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

Notice the Composable doesn't know how orders are fetched. It doesn't care. It just renders whatever state the ViewModel gives it. And the ViewModel doesn't know what a `@Composable` function even looks like — it just manages state.

So what does this buy you in practice? Imagine you need to add a search feature to the orders screen. You add a method to the ViewModel and a search bar to the Composable. That's it. You don't need to understand or modify the repository, the database, or the network layer. Each concern is isolated, and changes stay contained.

## Single Source of Truth

Here's a scenario. You have an orders list. The user edits an order on a detail screen, goes back, and the list still shows the old data. They pull to refresh and now they see the update. But wait — if they rotate the device, the old data flashes for a second before the new data appears.

What's going on? Two copies of the same data living in two different places, slowly getting out of sync. This is exactly the bug that **Single Source of Truth** prevents.

The principle is straightforward: every data type in your app should have exactly one authoritative source. All other parts of the app read from that source. Only the owner can modify it. Think of it like a bank account — you don't keep your "real" balance in your wallet AND your bank app AND a sticky note on your fridge. The bank's ledger is the one truth. Everything else is just a view into it.

In practice, the Single Source of Truth for most data types is the local database. When your app fetches data from the network, it writes it to the database, and the UI observes the database — not the network response directly. This means even if the network call fails, the UI shows the last known good data. And there's never a question about which version of the data is "correct" — the database is always the answer.

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

See the beauty here? The UI never touches the API response. The network data flows into the database, and the database's `Flow` automatically re-emits to the UI. One pipe, one direction, no confusion.

A common mistake I've seen (and made, honestly) is having two sources of truth: a `StateFlow` in the ViewModel that holds the network response, AND a Room database that stores the same data. The ViewModel shows the network response directly, and the database is used as a "backup." When the data gets out of sync — and it will — the UI flickers between two versions. One source. One owner. That's the whole rule.

> **🧠 Think about it:** If your user edits an item on screen B and navigates back to screen A, does screen A show the updated data automatically? If not, you probably have more than one source of truth.

## Drive UI From Data Models

Imagine your UI is an actor in a play. The script (the data model) tells the actor exactly what to say and do. The actor doesn't improvise. They don't decide mid-scene to change the ending. They follow the script.

That's what "drive UI from data models" means. The UI should be a function of state, not a manager of state. The ViewModel exposes an immutable state object that fully describes what the UI should display, and the UI renders it without adding its own logic.

The most common violation? Exposing multiple streams of data from the ViewModel — one for the user, one for the loading state, one for errors — and making the UI combine them. This creates race conditions, inconsistent states (loading AND showing data simultaneously), and makes the UI responsible for state management logic it has no business handling.

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

With the "bad" approach, can you tell me what the screen shows when `isLoading` is `true` AND `error` is non-null AND `user` has stale data? Yeah, neither can I. That combination shouldn't even be possible, but with three independent streams, nothing stops it from happening.

With the single `ProfileUiState`, every possible screen state is explicitly modeled. The UI just renders what it's given. No guesswork, no impossible states.

Real-world benefit: when you write UI tests, you don't need to test state management logic — you just verify that given a certain `ProfileUiState`, the UI renders correctly. The state management logic is tested separately in ViewModel unit tests. Clean separation, easy to reason about.

## The UI Layer vs Data Layer Responsibility

A clear boundary between the UI layer and the data layer prevents a category of bugs I see constantly: the UI directly accessing data sources, or the data layer making assumptions about the UI.

Here's a simple way to think about it. The **UI layer** is the cashier at a store — they interact with the customer, take orders, and hand over the goods. The **data layer** is the warehouse — it stores inventory, manages stock, and fulfills orders. The cashier never walks into the warehouse to grab things themselves, and the warehouse never decides how to arrange the display shelves.

The **UI layer** is responsible for: displaying data, capturing user input, navigation, and showing transient messages (toasts, snackbars). It should never call a network API directly, never write to a database directly, and never contain business logic like price calculation or validation rules.

The **data layer** is responsible for: fetching from the network, storing in the database, caching, synchronization, and data transformation between DTOs and domain models. It should never hold a reference to a Context (use application context through DI), never format strings for display, and never know about the UI state.

When these boundaries blur — and they always want to — you get bugs like "the price calculation changes when you rotate the screen" or "the error message shows up in the wrong language because the data layer was formatting it." Keeping the layers honest about their responsibilities prevents entire categories of these headaches.

> **⚡ Quick check:** Look at your current project. Does any Repository or data source class import anything from `android.widget` or `android.view`? If yes, your data layer is reaching into UI territory.

## The Domain Layer — Do You Need It?

This is the one that generates the most debate. Google's official architecture guide makes the domain layer optional, and I agree with that guidance. The domain layer contains use cases that encapsulate business logic. For simple CRUD apps where the ViewModel calls the repository and maps the result to UI state, a domain layer adds boilerplate without adding value.

I know, I know — some teams mandate use cases for every single operation, even when the use case is literally just calling one repository method and returning the result. That's ceremony for ceremony's sake.

You need a domain layer when: multiple ViewModels share the same business logic (three screens all need "get pending orders sorted by priority"), when business logic is complex enough to warrant independent unit testing (price calculation with discounts, taxes, and promotions), or when you want to enforce the dependency rule strictly (feature modules depend on domain, not on data).

You don't need it when: each ViewModel has unique logic that won't be reused, when the business logic is a simple pass-through from repository to UI, or when the project is small enough that adding a layer adds more complexity than it removes.

> **🔥 Real talk:** I've worked on projects where every screen had a use case class that was a one-liner calling the repository. It didn't make the code more testable — the ViewModel tests were already fine. It just doubled the number of files I had to touch for every feature. Add a domain layer when you feel the pain of not having one, not because a diagram told you to.

## The Reframe — Principles Are About Preventing Categories of Bugs

Here's what I've come to believe about architectural principles, and it took me a while to get here: **they're not about writing "good code." They're about preventing specific categories of bugs.**

Read that again.

Separation of concerns prevents "changing the network layer broke the UI." Single source of truth prevents "the list shows stale data after editing." Immutable UI state prevents "the UI is in an impossible combination of loading and error." Driving UI from models prevents "the screen flickers between states." Each principle is a vaccine against a specific disease. You don't need every vaccine if you're not exposed to every disease.

> **💡 The "aha" moment:** Architectural principles aren't a purity test for your code. They're a bug-prevention toolkit. Pick the ones that prevent the bugs your project actually has.

Every principle has a cost — more files, more abstractions, more ceremony. The question isn't whether to follow every principle to the letter. The question is: which categories of bugs does your project experience, and which principles prevent them? For a solo project with a handful of screens, you might only need separation of concerns and single source of truth. For a team of ten working on a banking app, you probably need all of them.

The best architecture isn't the most pure. It's the one where your team can add features, fix bugs, and onboard new developers without constantly breaking things. These principles are the guardrails that make that possible.

Thanks for reading!
