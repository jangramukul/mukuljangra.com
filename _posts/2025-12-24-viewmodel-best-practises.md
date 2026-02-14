---
title: ViewModel Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
---

Over the past few years, I've worked on several Android codebases — some greenfield, some legacy migrations, some scaling from a handful of screens to hundreds. The one class I always end up refactoring first is the ViewModel. It's the place where architecture decisions compound, where shortcuts taken early become expensive later, and where the gap between "works on my machine" and "works in production" is widest. I've seen ViewModels that are 800-line god classes doing network calls, validation, formatting, and navigation all at once, and I've seen ViewModels so thin they just proxy the repository with zero value added.

Google's official guidance gives you the basics — use `viewModelScope`, expose `StateFlow`, survive configuration changes. But it doesn't tell you how these patterns interact in a real production app with process death, complex state, and a team of engineers who each have their own habits. What I'm sharing here is what I've settled on after years of building, breaking, and fixing ViewModels in production. Every single one comes from a real problem I hit or a pattern I saw fail at scale. The core principle is simple: a ViewModel should be a pure Kotlin class that coordinates between UI and data, nothing more.

## Constructor Injection and Dependency Management

The biggest mistake I see in production codebases is ViewModels creating their own dependencies. When a ViewModel instantiates a repository or use case internally, you've lost the ability to swap that dependency during testing. Constructor injection makes the dependency graph explicit and testable. Hilt's `@HiltViewModel` with `@Inject constructor` handles this cleanly, but even without Hilt, a custom `ViewModelProvider.Factory` works. The point is that every dependency your ViewModel needs — repositories, use cases, mappers — should arrive through the constructor, never through manual instantiation inside the class.

```kotlin
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val loginRepository: LoginRepository,
    private val analyticsTracker: AnalyticsTracker,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            val result = loginRepository.signIn(email, password)
            analyticsTracker.trackLoginAttempt(result.isSuccess)
        }
    }
}
```

When you test this, you pass fakes or mocks directly. No reflection hacks, no initializer blocks reaching into service locators. The constructor tells you exactly what this ViewModel depends on, which also serves as a design pressure — if the constructor grows beyond 5-6 parameters, the ViewModel is doing too much.

This same principle extends to dispatchers. Hardcoding `Dispatchers.IO` inside a ViewModel makes your tests flaky or forces you into `Dispatchers.setMain()` workarounds. Inject them through the constructor, and in tests, pass `StandardTestDispatcher` to get deterministic coroutines. A single constructor parameter eliminates the entire class of threading problems.

## Managing State With StateFlow

LiveData served us well for years, but StateFlow is the better fit for modern Android development. StateFlow is a Kotlin-first API that works naturally with coroutines, supports operators like `map`, `combine`, and `flatMapLatest`, and doesn't require lifecycle-aware observation boilerplate when used with Compose's `collectAsStateWithLifecycle()`. The practical difference is that StateFlow gives you a reactive pipeline from data layer to UI, while LiveData forces you into imperative updates scattered across the ViewModel.

```kotlin
class ProfileViewModel(
    private val userRepository: UserRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val _isEditing = MutableStateFlow(false)

    val uiState: StateFlow<ProfileUiState> = combine(
        userRepository.observeUser(),
        settingsRepository.observeSettings(),
        _isEditing
    ) { user, settings, editing ->
        ProfileUiState(
            name = user.name,
            email = user.email,
            darkMode = settings.darkMode,
            isEditing = editing
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = ProfileUiState()
    )
}
```

The `stateIn` operator converts the cold `combine` flow into a hot `StateFlow` that the UI collects. But the `SharingStarted` strategy you choose here matters more than most people realize. `Eagerly` and `Lazily` both keep the upstream active for the entire ViewModel lifetime, which means database observers and network listeners stay alive even when the app is in the background. `WhileSubscribed(5000)` stops the upstream 5 seconds after the last collector disappears.

Why 5 seconds and not immediately? Because configuration changes like screen rotation destroy and recreate the UI, which temporarily removes all collectors. If you used `WhileSubscribed(0)`, every rotation would cancel and restart your upstream flows — re-querying the database, re-establishing network connections. The 5-second window gives the UI enough time to resubscribe after a configuration change without restarting the upstream. Google's own Now In Android reference app uses this exact pattern.

The tradeoff is real though. If your upstream is a one-shot network call that you converted to a flow, `WhileSubscribed` will re-trigger that call every time the user leaves and returns to the screen after 5 seconds. For expensive one-shot operations, `Lazily` might be the better choice. The rule I follow: use `WhileSubscribed(5000)` for continuous data streams (database observers, real-time updates), and `Lazily` for data that's fetched once and doesn't change.

### Single vs Multiple State

There are two schools of thought on ViewModel state. The single-state approach wraps everything in one data class and exposes one `StateFlow<ScreenUiState>`. The multiple-state approach uses separate `StateFlow` fields for independent pieces of state. Both are valid, and I've used both in production. The deciding factor is whether your state fields are independent or interconnected.

With a single state object, every update causes recomposition of every Composable that collects the state. With multiple StateFlows, each Composable subscribes only to what it needs. On a complex dashboard, multiple StateFlows can reduce unnecessary recompositions from ~20 per update cycle to ~4. The single-state approach shines on focused screens like checkout where every field affects the others.

## One-Time Events: Channel vs SharedFlow

Here's a problem that trips up almost every team at some point. You have a ViewModel that needs to tell the UI to show a snackbar, navigate to another screen, or display a toast. Your first instinct is to put it in the `StateFlow` — maybe an `error: String?` field in your UI state. But `StateFlow` is designed for state, not events. It replays the latest value to new collectors, so if the user rotates the screen, that snackbar shows up again. You can work around it with "consumed" flags, but now you've got boilerplate for every single event and a race condition if the UI reads the flag before resetting it.

The real question is `Channel` vs `SharedFlow`. A `Channel` with `Channel.BUFFERED` gives you fire-and-forget semantics — each event is delivered exactly once to one collector. A `SharedFlow` with `replay = 0` also doesn't replay, but if there's no collector at the moment of emission, the event is lost. In practice, I reach for `Channel` when I need guaranteed delivery of one-time events because it buffers events even when the UI is temporarily detached during configuration changes.

```kotlin
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckoutUiState())
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    private val _events = Channel<CheckoutEvent>(Channel.BUFFERED)
    val events: Flow<CheckoutEvent> = _events.receiveAsFlow()

    fun placeOrder(order: Order) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            orderRepository.place(order)
                .onSuccess { receipt ->
                    _events.send(CheckoutEvent.NavigateToConfirmation(receipt.id))
                }
                .onFailure {
                    _events.send(CheckoutEvent.ShowSnackbar("Order failed"))
                }
            _uiState.update { it.copy(isLoading = false) }
        }
    }
}

sealed interface CheckoutEvent {
    data class NavigateToConfirmation(val orderId: String) : CheckoutEvent
    data class ShowSnackbar(val message: String) : CheckoutEvent
}
```

The UI collects `events` inside a `LaunchedEffect` and handles each one without worrying about replay. The key thing to understand is that `receiveAsFlow()` creates a flow that consumes from the channel — once an event is received, it's gone. This is exactly what you want for navigation, snackbars, and toasts. Keep `StateFlow` for screen state, keep `Channel` for one-shot side effects.

## ViewModel Scoping Beyond Activity

By default, a ViewModel is scoped to the Activity or Fragment that created it. But in a multi-screen app with shared state, that's often not what you want. The Navigation component lets you scope a ViewModel to a `NavBackStackEntry`, which means the ViewModel lives as long as that destination is on the back stack. This is how you share state between screens without leaking it to the entire Activity lifecycle.

In Compose with Hilt, `hiltViewModel()` scopes the ViewModel to the current `NavBackStackEntry` by default. But the real power comes from scoping to a navigation graph. Say you have a checkout flow — cart, shipping, payment, confirmation — and all four screens need access to the same cart state. Instead of passing data between screens or scoping to the Activity, you scope one ViewModel to the nested navigation graph that wraps the entire checkout flow.

```kotlin
// In your NavHost setup
NavHost(navController, startDestination = "home") {
    navigation(startDestination = "cart", route = "checkout_graph") {
        composable("cart") { backStackEntry ->
            val checkoutEntry = remember(backStackEntry) {
                navController.getBackStackEntry("checkout_graph")
            }
            val sharedViewModel: SharedCheckoutViewModel =
                hiltViewModel(checkoutEntry)
            CartScreen(sharedViewModel)
        }
        composable("shipping") { backStackEntry ->
            val checkoutEntry = remember(backStackEntry) {
                navController.getBackStackEntry("checkout_graph")
            }
            val sharedViewModel: SharedCheckoutViewModel =
                hiltViewModel(checkoutEntry)
            ShippingScreen(sharedViewModel)
        }
    }
}
```

The `SharedCheckoutViewModel` is created when the user enters the checkout graph and destroyed when they leave it. Every screen inside the graph gets the same instance. This is fundamentally different from Activity-scoped ViewModels — the lifecycle is tied to the navigation flow, not the Activity. I've seen teams scope shared ViewModels to the Activity and wonder why their cart state survives even after the user completes checkout. Graph-scoped ViewModels solve this cleanly because the ViewModel dies when the user pops back out of the graph.

## Process Death and SavedStateHandle

Most developers know about configuration changes, but process death is where apps actually break in production. When the system kills your app in the background and the user returns, `onSaveInstanceState` restores the Activity but your ViewModel is recreated from scratch. Any state that wasn't persisted is gone — the search query, the selected tab, the scroll position. `SavedStateHandle` solves this because it hooks directly into the saved state mechanism that survives process death.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    val searchQuery = savedStateHandle.getStateFlow("query", "")

    fun updateQuery(query: String) {
        savedStateHandle["query"] = query
    }

    val searchResults: StateFlow<List<SearchResult>> = searchQuery
        .debounce(300)
        .flatMapLatest { query ->
            if (query.isBlank()) flowOf(emptyList())
            else searchRepository.search(query)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
```

The key insight here is that `SavedStateHandle.getStateFlow()` gives you a `StateFlow` that automatically persists to and restores from the saved state bundle. You don't need a separate `MutableStateFlow` plus manual save/restore logic. One API handles both reactive state and process death survival. The tradeoff is that `SavedStateHandle` only supports types that can go into a `Bundle` — primitives, strings, parcelables. Complex objects need serialization or should be re-fetched from the data layer.

Here's the mental model I use: after process death, your app is a fresh process with a partially restored Activity stack. The navigation back stack is restored, but every ViewModel is reconstructed. Transient state like half-filled forms or multi-step wizard progress is lost unless you persisted it via `SavedStateHandle`, Room, or DataStore.

## Keeping ViewModels Pure

One thing I feel strongly about is that a ViewModel should be a pure Kotlin class — no Android framework imports, no business logic, no eager initialization. The moment you import `android.content.Context`, `R.string`, or any Android framework class into your ViewModel, you've created a hard dependency on the Android runtime. This means your ViewModel can't run in a plain JVM unit test — you'll need Robolectric or instrumented tests, which are 10-50x slower. The solution is to push resource resolution to the UI layer. Represent errors as domain types and let the Composable or Fragment decide how to display them.

Another pattern I've seen cause real problems is putting business logic in the `init` block. I've seen ViewModels where `init` triggers network calls, starts database observers, and performs validation — all before the UI has even subscribed to the state. The problem is that `init` runs during ViewModel construction. If the init block launches a coroutine that updates state before the UI starts collecting, intermediate states are lost. For `StateFlow`, the init pattern mostly works because it replays the latest value, but the loading-to-success transition happens before the UI subscribes, so the UI never shows the loading state. Prefer lazy initialization with `stateIn` — the upstream only starts when the first collector appears.

A ViewModel should coordinate between the UI and the data layer, not contain business logic itself. When a ViewModel reaches 500+ lines with validation, data transformation, and business rules mixed together, those responsibilities belong in use cases or domain layer classes. Use cases are independently testable — you can verify `ValidatePasswordUseCase` with 15 unit tests covering edge cases, without ever instantiating a ViewModel.

```kotlin
class RegistrationViewModel(
    private val validateEmail: ValidateEmailUseCase,
    private val validatePassword: ValidatePasswordUseCase,
    private val registerUser: RegisterUserUseCase
) : ViewModel() {

    fun register(email: String, password: String) {
        viewModelScope.launch {
            val emailResult = validateEmail(email)
            val passwordResult = validatePassword(password)

            if (emailResult.isValid && passwordResult.isValid) {
                registerUser(email, password)
                    .onSuccess { _uiState.update { it.copy(registered = true) } }
                    .onFailure { e -> _uiState.update { it.copy(error = e.toUiMessage()) } }
            } else {
                _uiState.update { it.copy(
                    emailError = emailResult.errorOrNull(),
                    passwordError = passwordResult.errorOrNull()
                )}
            }
        }
    }
}
```

In a codebase I worked on, extracting business logic from ViewModels into use cases reduced the average ViewModel from ~400 lines to ~120 lines and increased test coverage from 45% to 82% because the isolated use cases were trivial to test.

## Testing ViewModels

This is where all the previous practices pay off. If your ViewModel uses constructor injection, injects dispatchers, and exposes `StateFlow` — testing it is straightforward. The setup is minimal: `runTest` gives you a coroutine scope with virtual time, `StandardTestDispatcher` makes coroutine execution deterministic, and Turbine makes asserting on `StateFlow` emissions clean and readable.

The key thing `runTest` does is replace the real coroutine dispatcher with a test dispatcher that doesn't actually wait. A `delay(5000)` in your ViewModel completes instantly. And `StandardTestDispatcher` queues coroutines instead of running them eagerly, so you control exactly when work happens — critical for testing loading states, because without it, the coroutine completes before you can assert on the intermediate state.

```kotlin
class SearchViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val fakeRepository = FakeSearchRepository()

    @Test
    fun `search query emits loading then results`() = runTest(testDispatcher) {
        val savedStateHandle = SavedStateHandle()
        val viewModel = SearchViewModel(
            searchRepository = fakeRepository,
            savedStateHandle = savedStateHandle
        )

        viewModel.searchResults.test {
            // Initial empty state
            assertEquals(emptyList<SearchResult>(), awaitItem())

            // Trigger search
            viewModel.updateQuery("kotlin")
            // Advance past debounce
            advanceTimeBy(301)
            runCurrent()

            val results = awaitItem()
            assertEquals(3, results.size)
            assertEquals("kotlin", results.first().query)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `search with empty query returns empty list`() = runTest(testDispatcher) {
        val viewModel = SearchViewModel(
            searchRepository = fakeRepository,
            savedStateHandle = SavedStateHandle()
        )

        viewModel.searchResults.test {
            assertEquals(emptyList<SearchResult>(), awaitItem())
            viewModel.updateQuery("")
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

Turbine's `.test {}` extension on `Flow` is what makes this ergonomic. `awaitItem()` suspends until the next emission arrives, and `expectNoEvents()` asserts that nothing was emitted — exactly what you want for empty query scenarios. The pattern I follow is: assert initial state, trigger the action, advance time if needed, assert the result. Every ViewModel test I write follows this shape.

Thanks for reading!
