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

The thing is, Google's official guidance gives you the basics — use `viewModelScope`, expose `StateFlow`, survive configuration changes. But it doesn't tell you how these patterns interact in a real production app with process death, complex state, and a team of engineers who each have their own habits. What I'm sharing here is the set of practices I've settled on after years of building, breaking, and fixing ViewModels in production. These aren't theoretical — every single one comes from a real problem I hit or a pattern I saw fail at scale.

I think the core principle is simple: a ViewModel should be a pure Kotlin class that coordinates between UI and data, nothing more. The moment it starts reaching into Android framework classes, hardcoding threading decisions, or accumulating business rules, things start breaking — in tests first, then in production.

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

This same principle extends to dispatchers, which is something a lot of people overlook. Hardcoding `Dispatchers.IO` or `Dispatchers.Main` inside a ViewModel makes your tests flaky or forces you into `Dispatchers.setMain()` workarounds. The real fix is treating dispatchers as dependencies. Inject them through the constructor, and in tests, pass `StandardTestDispatcher` or `UnconfinedTestDispatcher` to get deterministic, fast-executing coroutines.

```kotlin
class PaymentViewModel(
    private val paymentRepository: PaymentRepository,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            val receipt = withContext(ioDispatcher) {
                paymentRepository.charge(amount)
            }
            _uiState.update { it.copy(receipt = receipt) }
        }
    }
}
```

The injected `ioDispatcher` is where most people trip up — they hardcode `Dispatchers.IO` in `withContext` calls scattered across the ViewModel, and then wonder why their tests are timing out or running on real IO threads. A single constructor parameter eliminates the entire class of problems.

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

Once you've settled on StateFlow, the next question is how to structure it. There are two schools of thought on ViewModel state. The single-state approach wraps everything in one data class and exposes one `StateFlow<ScreenUiState>`. The multiple-state approach uses separate `StateFlow` fields for independent pieces of state. Both are valid, and I've used both in production. The deciding factor is whether your state fields are independent or interconnected.

```kotlin
// Single state — good when fields are interconnected
data class CheckoutUiState(
    val items: List<CartItem> = emptyList(),
    val total: Double = 0.0,
    val isLoading: Boolean = false,
    val error: UiMessage? = null
)

// Multiple states — good when fields are independent
class DashboardViewModel(
    notificationRepo: NotificationRepository,
    feedRepo: FeedRepository,
    profileRepo: ProfileRepository
) : ViewModel() {

    val notifications: StateFlow<List<Notification>> =
        notificationRepo.observe()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val feed: StateFlow<List<FeedItem>> =
        feedRepo.observeFeed()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val profile: StateFlow<UserProfile> =
        profileRepo.observeProfile()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), UserProfile.Empty)
}
```

With a single state object, every update causes recomposition of every Composable that collects the state. With multiple StateFlows, each Composable subscribes only to what it needs. On a complex dashboard, multiple StateFlows can reduce unnecessary recompositions from ~20 per update cycle to ~4. The single-state approach shines on focused screens like checkout where every field affects the others.

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

Testing process death is something most teams skip, and it shows. The standard way to test it is through the "Don't keep activities" developer option, but even that doesn't fully simulate what happens when the OS kills your process after 30 minutes in the background. The key things that survive process death are: the Activity's `savedInstanceState` bundle, `SavedStateHandle` in ViewModels, and your persistent storage (Room, DataStore, files). Everything else — in-memory caches, singleton state, static variables, running coroutines — is gone.

Here's the mental model I use: after process death, your app is a fresh process with a partially restored Activity stack. The navigation back stack is restored, but every ViewModel is reconstructed. Transient state like half-filled forms, unsaved drafts, or multi-step wizard progress is lost unless you persisted it via `SavedStateHandle`, Room, or DataStore.

```kotlin
class WizardViewModel(
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    // Survives process death
    var currentStep: Int
        get() = savedStateHandle["step"] ?: 0
        set(value) { savedStateHandle["step"] = value }

    // Survives process death
    var formData: WizardFormData
        get() = savedStateHandle["formData"] ?: WizardFormData()
        set(value) { savedStateHandle["formData"] = value }

    fun nextStep() {
        currentStep = currentStep + 1
    }
}

@Parcelize
data class WizardFormData(
    val name: String = "",
    val email: String = "",
    val plan: String = ""
) : Parcelable
```

The `@Parcelize` annotation lets you store complex data classes in `SavedStateHandle`. The tradeoff is the `Parcelable` requirement — if your data class contains non-parcelable types, you'll need to convert them. For large objects, consider persisting to Room or DataStore instead and only storing the identifier in `SavedStateHandle`.

## Keeping ViewModels Pure

One thing I feel strongly about is that a ViewModel should be a pure Kotlin class — no Android framework imports, no business logic, no eager initialization. The moment you import `android.content.Context`, `R.string`, or any Android framework class into your ViewModel, you've created a hard dependency on the Android runtime. This means your ViewModel can't run in a plain JVM unit test — you'll need Robolectric or instrumented tests, which are 10-50x slower. The solution is to push resource resolution to the UI layer. Represent errors as domain types and let the Composable or Fragment decide how to display them.

```kotlin
// Instead of this
class BadViewModel(private val context: Context) : ViewModel() {
    fun getError(): String = context.getString(R.string.network_error)
}

// Do this
sealed interface UiMessage {
    data class NetworkError(val retryable: Boolean) : UiMessage
    data class ValidationError(val field: String) : UiMessage
}

class OrderViewModel(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _messages = MutableSharedFlow<UiMessage>()
    val messages = _messages.asSharedFlow()

    fun placeOrder(order: Order) {
        viewModelScope.launch {
            orderRepository.place(order).onFailure {
                _messages.emit(UiMessage.NetworkError(retryable = true))
            }
        }
    }
}
```

This keeps the ViewModel as a pure Kotlin class. Every test runs on the JVM in milliseconds. If you absolutely need `Application` context (for non-UI things like file paths), use `AndroidViewModel` — but treat it as a last resort, not a default choice.

Another pattern I've seen cause real problems is putting business logic in the `init` block. I've seen ViewModels where `init` triggers network calls, starts database observers, and performs validation — all before the UI has even subscribed to the state. The problem is that `init` runs during ViewModel construction. If the init block launches a coroutine that updates state before the UI starts collecting, intermediate states are lost.

```kotlin
// Problematic — init fires before UI collects
class ArticleViewModel(
    private val articleRepository: ArticleRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val articleId: String = checkNotNull(savedStateHandle["articleId"])
    private val _uiState = MutableStateFlow<ArticleUiState>(ArticleUiState.Loading)
    val uiState: StateFlow<ArticleUiState> = _uiState.asStateFlow()

    init {
        // This launches immediately during construction
        viewModelScope.launch {
            val article = articleRepository.getArticle(articleId)
            _uiState.value = ArticleUiState.Success(article)
        }
    }
}
```

For `StateFlow`, the init pattern mostly works because it replays the latest value. But the loading-to-success transition happens before the UI subscribes, so the UI never shows the loading state. Prefer lazy initialization with `stateIn` — the upstream only starts when the first collector appears.

```kotlin
// Better — upstream starts when UI subscribes
class ArticleViewModel(
    articleRepository: ArticleRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val articleId: String = checkNotNull(savedStateHandle["articleId"])

    val uiState: StateFlow<ArticleUiState> = flow {
        emit(ArticleUiState.Loading)
        val article = articleRepository.getArticle(articleId)
        emit(ArticleUiState.Success(article))
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = ArticleUiState.Loading
    )
}
```

Finally, a ViewModel should coordinate between the UI and the data layer, not contain business logic itself. When a ViewModel reaches 500+ lines with validation, data transformation, and business rules mixed together, those responsibilities belong in use cases or domain layer classes.

```kotlin
// Too much logic in ViewModel
class RegistrationViewModel(...) : ViewModel() {
    fun register(email: String, password: String) {
        if (!email.contains("@")) { /* ... */ }
        if (password.length < 8) { /* ... */ }
        if (!password.any { it.isUpperCase() }) { /* ... */ }
        // 50 more lines of validation and business rules
    }
}

// Better — delegate to use cases
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

Use cases are also independently testable. You can verify `ValidatePasswordUseCase` with 15 unit tests covering edge cases, without ever instantiating a ViewModel. In a codebase I worked on, extracting business logic from ViewModels into use cases reduced the average ViewModel from ~400 lines to ~120 lines and increased test coverage from 45% to 82% because the isolated use cases were trivial to test.

Thanks for reading!
