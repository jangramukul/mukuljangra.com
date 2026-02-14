---
title: ViewModel Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
---

Think of a ViewModel like the manager of a restaurant kitchen. The waiters (UI) take orders from customers, pass them to the kitchen manager, and the kitchen manager coordinates the cooks (repositories, use cases) to get the food out. A good kitchen manager doesn't cook the food themselves, doesn't walk out to take orders from tables, and definitely doesn't store raw ingredients in their pockets. They coordinate. That's it.

Over the past few years, I've worked on several Android codebases — some greenfield, some legacy migrations, some scaling from a handful of screens to hundreds. The one class I always end up refactoring first is the ViewModel. It's the place where architecture decisions compound, where shortcuts taken early become expensive later, and where the gap between "works on my machine" and "works in production" is widest. I've seen ViewModels that are 800-line god classes doing network calls, validation, formatting, and navigation all at once. I've also seen ViewModels so thin they just proxy the repository with zero value added.

Google's official guidance gives you the basics — use `viewModelScope`, expose `StateFlow`, survive configuration changes. But it doesn't tell you how these patterns interact in a real production app with process death, complex state, and a team of engineers who each have their own habits. What I'm sharing here is what I've settled on after years of building, breaking, and fixing ViewModels in production. Every single one comes from a real problem I hit or a pattern I saw fail at scale. The core principle is simple: a ViewModel should be a pure Kotlin class that coordinates between UI and data, nothing more.

## Constructor Injection and Dependency Management

Imagine you're ordering coffee. You walk up to the counter and say "I want an oat milk latte." You don't walk behind the counter, grab the espresso machine, steam the milk yourself, and pour it. You tell someone what you need, and they hand it to you.

That's constructor injection. Your ViewModel says "I need a `LoginRepository` and an `AnalyticsTracker`" and the DI framework hands them over. The alternative — your ViewModel reaching into a service locator or instantiating dependencies internally — is like the customer walking behind the counter. It works, technically. But now you can't swap the espresso machine for a decaf one during testing. You've coupled yourself to the exact implementation behind the counter.

Hilt's `@HiltViewModel` with `@Inject constructor` handles this cleanly, but even without Hilt, a custom `ViewModelProvider.Factory` works. The point is that every dependency your ViewModel needs — repositories, use cases, mappers — should arrive through the constructor, never through manual instantiation inside the class.

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

When you test this, you pass fakes or mocks directly. No reflection hacks, no initializer blocks reaching into service locators. The constructor tells you exactly what this ViewModel depends on, which also serves as a design pressure — if the constructor grows beyond 5-6 parameters, the ViewModel is doing too much. That's not a limitation, that's a feature. The constructor is whispering "hey, I have too many responsibilities."

This same principle extends to dispatchers. Hardcoding `Dispatchers.IO` inside a ViewModel makes your tests flaky or forces you into `Dispatchers.setMain()` workarounds. Inject them through the constructor, and in tests, pass `StandardTestDispatcher` to get deterministic coroutines. A single constructor parameter eliminates the entire class of threading problems in tests.

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

The `stateIn` operator converts the cold `combine` flow into a hot `StateFlow` that the UI collects. But here's where it gets interesting — the `SharingStarted` strategy you choose matters more than most people realize. `Eagerly` and `Lazily` both keep the upstream active for the entire ViewModel lifetime, which means database observers and network listeners stay alive even when the app is in the background. `WhileSubscribed(5000)` stops the upstream 5 seconds after the last collector disappears.

Why 5 seconds and not immediately? Picture this: the user rotates their phone. The Activity is destroyed and recreated. For a brief moment, there are zero collectors on your StateFlow. If you used `WhileSubscribed(0)`, every rotation would cancel and restart your upstream flows — re-querying the database, re-establishing network connections. That 5-second window is like a grace period. It gives the UI enough time to resubscribe after a configuration change without restarting the upstream. Google's own Now In Android reference app uses this exact pattern.

The tradeoff is real though. If your upstream is a one-shot network call that you converted to a flow, `WhileSubscribed` will re-trigger that call every time the user leaves and returns to the screen after 5 seconds. For expensive one-shot operations, `Lazily` might be the better choice. The rule I follow: use `WhileSubscribed(5000)` for continuous data streams (database observers, real-time updates), and `Lazily` for data that's fetched once and doesn't change.

> **🧠 Think about it:** You have a screen that shows a user's bank balance from a WebSocket stream AND their profile photo fetched once from the server. Would you use the same `SharingStarted` strategy for both? Why or why not?

### Single vs Multiple State

There are two schools of thought on ViewModel state. The single-state approach wraps everything in one data class and exposes one `StateFlow<ScreenUiState>`. The multiple-state approach uses separate `StateFlow` fields for independent pieces of state. Both are valid, and I've used both in production. The deciding factor is whether your state fields are independent or interconnected.

Think of it like a news broadcast. If the anchor, weather, and sports segments are all on one teleprompter, updating the sports score means the anchor and weather person also have to re-read their scripts. That's single state — every update causes recomposition of every Composable that collects it. With multiple StateFlows, each segment has its own teleprompter. The sports ticker updates without disturbing anyone else. On a complex dashboard, multiple StateFlows can reduce unnecessary recompositions from ~20 per update cycle to ~4. The single-state approach shines on focused screens like checkout where every field affects the others.

## One-Time Events: Channel vs SharedFlow

Here's a problem that trips up almost every team at some point. You have a ViewModel that needs to tell the UI to show a snackbar, navigate to another screen, or display a toast. Your first instinct is to put it in the `StateFlow` — maybe an `error: String?` field in your UI state.

But wait. `StateFlow` is designed for *state*, not *events*. It replays the latest value to new collectors, so if the user rotates the screen, that snackbar shows up again. You can work around it with "consumed" flags, but now you've got boilerplate for every single event and a race condition if the UI reads the flag before resetting it.

It's like a post-it note on your monitor versus a text message. A post-it note (StateFlow) stays there until you peel it off — anyone who looks at your monitor sees it, even if it's outdated. A text message (Channel) is delivered once, you read it, and it's done. You don't want "Order failed" to be a post-it that keeps showing up every time someone glances at your screen.

So what do you reach for? `Channel` vs `SharedFlow`. A `Channel` with `Channel.BUFFERED` gives you fire-and-forget semantics — each event is delivered exactly once to one collector. A `SharedFlow` with `replay = 0` also doesn't replay, but if there's no collector at the moment of emission, the event is lost. In practice, I reach for `Channel` when I need guaranteed delivery of one-time events because it buffers events even when the UI is temporarily detached during configuration changes.

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

In Compose with Hilt, `hiltViewModel()` scopes the ViewModel to the current `NavBackStackEntry` by default. But the real power comes from scoping to a navigation graph. Imagine you're building a checkout flow — cart, shipping, payment, confirmation — and all four screens need access to the same cart state. You could pass the cart data between screens like a relay baton, but that gets messy fast. You could scope a ViewModel to the Activity, but then the cart state hangs around even after the user finishes checkout. That's like leaving your shopping cart in the middle of the parking lot — it shouldn't be there anymore.

The right move is to scope one ViewModel to the nested navigation graph that wraps the entire checkout flow.

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

> **💡 The "aha" moment:** A ViewModel's lifetime doesn't have to match the Activity's lifetime. You can tie it to a navigation graph, which means the ViewModel lives exactly as long as the user flow it supports — no longer, no shorter.

## Process Death and SavedStateHandle

Most developers know about configuration changes, but process death is where apps actually break in production. And I mean *break* — silently, confusingly, in ways that are hard to reproduce.

Here's the scenario. Your user is halfway through filling out a search form. They switch to another app to check something. Android, running low on memory, kills your app's process in the background. The user switches back. Android restores the Activity from `onSaveInstanceState`, recreates the navigation stack, and everything *looks* normal. But your ViewModel? Completely new instance. Fresh constructor. The search query they typed? Gone. The tab they selected? Reset to default. The scroll position? Back to the top.

`SavedStateHandle` solves this because it hooks directly into the saved state mechanism that survives process death.

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

The key insight here is that `SavedStateHandle.getStateFlow()` gives you a `StateFlow` that automatically persists to and restores from the saved state bundle. You don't need a separate `MutableStateFlow` plus manual save/restore logic. One API handles both reactive state and process death survival. That's two problems solved with one line of code.

The tradeoff is that `SavedStateHandle` only supports types that can go into a `Bundle` — primitives, strings, parcelables. Complex objects need serialization or should be re-fetched from the data layer.

Here's the mental model I use: after process death, your app is a fresh process with a partially restored Activity stack. Think of it like waking up from amnesia in your own apartment. The furniture is all there (Activity stack restored), but you've forgotten every conversation you were having (ViewModel state wiped). `SavedStateHandle` is like the notebook on your nightstand where you wrote down the important stuff before you fell asleep. Transient state like half-filled forms or multi-step wizard progress is lost unless you persisted it via `SavedStateHandle`, Room, or DataStore.

## Keeping ViewModels Pure

One thing I feel strongly about is that a ViewModel should be a pure Kotlin class — no Android framework imports, no business logic, no eager initialization. The moment you import `android.content.Context`, `R.string`, or any Android framework class into your ViewModel, you've created a hard dependency on the Android runtime. This means your ViewModel can't run in a plain JVM unit test — you'll need Robolectric or instrumented tests, which are 10-50x slower. The solution is to push resource resolution to the UI layer. Represent errors as domain types and let the Composable or Fragment decide how to display them.

> **🔥 Real talk:** I once worked on a codebase where ViewModels imported `Context` to resolve string resources for error messages. Every single ViewModel test needed Robolectric, which made the test suite take 8 minutes instead of 40 seconds. We spent a weekend replacing `R.string` references with sealed error classes, and the test suite went from "I'll go grab coffee" to "already done."

Another pattern I've seen cause real problems is putting business logic in the `init` block. I've seen ViewModels where `init` triggers network calls, starts database observers, and performs validation — all before the UI has even subscribed to the state. Can you guess what goes wrong?

The problem is that `init` runs during ViewModel construction. If the init block launches a coroutine that updates state before the UI starts collecting, intermediate states are lost. For `StateFlow`, the init pattern mostly works because it replays the latest value, but the loading-to-success transition happens before the UI subscribes, so the UI never shows the loading state. The user sees a blank screen that suddenly jumps to content with no loading indicator. Prefer lazy initialization with `stateIn` — the upstream only starts when the first collector appears.

A ViewModel should coordinate between the UI and the data layer, not contain business logic itself. Remember our restaurant kitchen manager analogy? The manager shouldn't be the one cooking the food. When a ViewModel reaches 500+ lines with validation, data transformation, and business rules mixed together, those responsibilities belong in use cases or domain layer classes. Use cases are independently testable — you can verify `ValidatePasswordUseCase` with 15 unit tests covering edge cases, without ever instantiating a ViewModel.

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

Notice how clean this ViewModel reads. It doesn't know *how* to validate an email or *what* the password rules are. It just asks the use cases and reacts to the answers. In a codebase I worked on, extracting business logic from ViewModels into use cases reduced the average ViewModel from ~400 lines to ~120 lines and increased test coverage from 45% to 82% because the isolated use cases were trivial to test.

## Testing ViewModels

This is where all the previous practices pay off. If your ViewModel uses constructor injection, injects dispatchers, and exposes `StateFlow` — testing it is straightforward. Every good practice we've talked about was quietly setting you up for this moment.

The setup is minimal: `runTest` gives you a coroutine scope with virtual time, `StandardTestDispatcher` makes coroutine execution deterministic, and Turbine makes asserting on `StateFlow` emissions clean and readable.

The key thing `runTest` does is replace the real coroutine dispatcher with a test dispatcher that doesn't actually wait. A `delay(5000)` in your ViewModel completes instantly — like a fast-forward button for coroutines. And `StandardTestDispatcher` queues coroutines instead of running them eagerly, so you control exactly when work happens. This is critical for testing loading states, because without it, the coroutine completes before you can assert on the intermediate state. It's like trying to photograph a hummingbird — you need to be able to freeze time.

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

> **⚡ Quick check:** If you removed constructor injection from your ViewModel and hardcoded `Dispatchers.IO`, which parts of this test setup would break and why?

Thanks for reading!
