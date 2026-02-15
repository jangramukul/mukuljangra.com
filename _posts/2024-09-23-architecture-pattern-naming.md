---
title: Follow Right Architecture Patterns Naming
layout: post
sequence: 18
categories: post
tags:
  - Android
  - Architecture
---

I once joined a project where the codebase had a class called `DataManager`. Sounds reasonable, right? Except it was 2,400 lines long, handled API calls, caching, database writes, and even some UI formatting. There was also a `DataHelper`, a `DataProvider`, and a `DataUtils` — each doing overlapping things with zero consistency. Nobody on the team could explain which one to use for what. Every new feature meant guessing where code should go, and half the time you'd guess wrong.

That experience taught me something I now believe deeply: **naming is architecture**. If your names are inconsistent or vague, your architecture is inconsistent and vague — no matter how many clean architecture diagrams you draw on a whiteboard. Good naming makes the codebase self-documenting. Bad naming makes even well-structured code feel like a maze. Here's how I think about naming across every layer of an Android app.

## Layer-by-Layer Naming Conventions

The first thing to get right is consistent naming within each architectural layer. Every class name should immediately tell you which layer it belongs to and what it does. When I look at a class name, I should know if I'm in the presentation layer, domain layer, or data layer without opening the file.

### Presentation Layer

The presentation layer is where your UI lives, and the naming should reflect that. **ViewModels** get the screen or feature name followed by `ViewModel` — `PaymentViewModel`, `ProfileViewModel`, `SearchViewModel`. The associated screen composable follows the same prefix — `PaymentScreen`, `ProfileScreen`. State classes that hold the UI state use the `UiState` suffix — `PaymentUiState`, `ProfileUiState`. This keeps everything grouped and instantly recognizable.

```kotlin
// Presentation layer naming for a payment feature
class PaymentViewModel(
    private val processPayment: ProcessPaymentUseCase,
    private val observePaymentStatus: ObservePaymentStatusUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(PaymentUiState())
    val uiState: StateFlow<PaymentUiState> = _uiState.asStateFlow()

    fun onPaymentSubmitted(amount: Double) {
        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true) }
            processPayment(amount)
                .onSuccess { _uiState.update { it.copy(isProcessing = false, isSuccess = true) } }
                .onFailure { error -> _uiState.update { it.copy(isProcessing = false, error = error.message) } }
        }
    }
}

data class PaymentUiState(
    val isProcessing: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)
```

### Domain Layer

The domain layer is all about business logic, and the naming should make actions and contracts crystal clear. **UseCases** follow the verb-noun pattern — `ProcessPaymentUseCase`, `GetUserProfileUseCase`, `ObserveCartItemsUseCase`. Repository interfaces live here too, named after the entity they manage — `PaymentRepository`, `UserRepository`. The key thing is that the domain layer defines the contract (interface), not the implementation. I always keep UseCase names as specific actions, never vague ones like `HandleDataUseCase`.

### Data Layer

The data layer is where things get concrete. **Repository implementations** use the `Impl` suffix or a source-specific prefix — `PaymentRepositoryImpl` or `OfflineFirstPaymentRepository` if the distinction matters. **DataSources** describe where the data comes from — `PaymentRemoteDataSource`, `PaymentLocalDataSource`. **Mappers** convert between layers — `PaymentDtoMapper`, `PaymentEntityMapper`. **DTOs** (Data Transfer Objects) represent API responses — `PaymentDto`, `UserDto`. **Entities** represent database models — `PaymentEntity`, `UserEntity`. The domain models themselves are just plain names — `Payment`, `User`, `CartItem`.

## Package Structure

I've seen teams argue endlessly about package structure, and honestly, both approaches have merit. But here's what I've settled on after working on apps of different sizes.

**Layer-based** packaging groups by technical layer — `data/`, `domain/`, `presentation/`. This works fine for small apps with 10-15 screens. You always know which folder to look in based on the type of class you need. But it falls apart in larger codebases because a single feature's code gets scattered across three different package trees. Making a change to the payment flow means jumping between `data/repository/`, `domain/usecase/`, and `presentation/viewmodel/`.

**Feature-based** packaging groups by feature — `payment/`, `profile/`, `search/`. Each feature folder contains its own `data/`, `domain/`, and `presentation/` subfolders. This is what I recommend for most production apps. When you work on the payment feature, everything you need is in one place. It also makes modularization easier down the line because each feature package maps naturally to a Gradle module.

```kotlin
// Feature-based structure (recommended for most apps)
// com.app.payment/
//   data/
//     PaymentRepositoryImpl.kt
//     PaymentRemoteDataSource.kt
//     PaymentLocalDataSource.kt
//     dto/PaymentDto.kt
//     mapper/PaymentDtoMapper.kt
//     entity/PaymentEntity.kt
//   domain/
//     PaymentRepository.kt (interface)
//     ProcessPaymentUseCase.kt
//     ObservePaymentStatusUseCase.kt
//     model/Payment.kt
//   presentation/
//     PaymentViewModel.kt
//     PaymentScreen.kt
//     PaymentUiState.kt
```

The hybrid approach uses feature-based at the top level but pulls truly shared components into a `core/` package — things like `core/network/`, `core/database/`, `core/common/`. I've found this works best. You get the benefits of feature isolation without duplicating infrastructure code across features.

## Class Naming Patterns

### Repository vs DataSource

This one trips up a lot of developers. A **Repository** is a mediator — it decides *where* to get data from (cache, network, database) and coordinates between sources. A **DataSource** is a single source of data with no decision-making. The Repository might call `PaymentRemoteDataSource` to fetch from the API and `PaymentLocalDataSource` to cache the result. The DataSource never knows about other sources; it just does one thing.

IMO, when you see a class that directly calls Retrofit or Room, it should be a DataSource. When you see a class that combines results from multiple DataSources or applies caching logic, that's a Repository.

### UseCase Naming

UseCases should always be verb-noun: `ProcessPaymentUseCase`, `ValidateEmailUseCase`, `SyncOrdersUseCase`. The verb tells you the action, the noun tells you the domain entity. I've seen teams use `PaymentUseCase` or `PaymentInteractor` — both are too vague. What does it do with the payment? Process it? Cancel it? Refund it? Be specific. Each UseCase should represent exactly one business action. If your UseCase has multiple public methods, it's doing too much.

```kotlin
class ProcessPaymentUseCase(
    private val paymentRepository: PaymentRepository,
    private val analyticsTracker: AnalyticsTracker
) {
    suspend operator fun invoke(amount: Double): Result<PaymentConfirmation> {
        if (amount <= 0) return Result.failure(InvalidAmountException())
        return paymentRepository.processPayment(amount).also { result ->
            result.onSuccess { analyticsTracker.trackPaymentSuccess(amount) }
            result.onFailure { analyticsTracker.trackPaymentFailure(amount, it) }
        }
    }
}
```

### DTO, Entity, and Model Distinctions

Here's the thing — these three words mean completely different things, and mixing them up causes real architectural problems. **DTO** (`PaymentDto`) is the raw shape of data from an external source, usually matching the API response JSON. **Entity** (`PaymentEntity`) is the database representation, annotated with Room's `@Entity`. **Model** (`Payment`) is your clean domain object — no serialization annotations, no database annotations, just pure business data. Mappers convert between these: `PaymentDtoMapper` converts DTO to domain model, `PaymentEntityMapper` converts entity to domain model and back.

## Method Naming Patterns

Method names should tell you about the execution behavior, not just what data you get back. I follow a simple convention: **`get`** prefix for one-shot `suspend` functions that return a single value. **`observe`** prefix for functions returning a `Flow` that emits over time. This distinction is critical because it tells the caller what to expect without reading the implementation.

```kotlin
interface PaymentRepository {
    // One-shot operations - caller knows these complete and return
    suspend fun getPaymentById(id: String): Payment
    suspend fun processPayment(amount: Double): Result<PaymentConfirmation>
    suspend fun cancelPayment(id: String): Result<Unit>

    // Reactive streams - caller knows to collect continuously
    fun observePaymentStatus(id: String): Flow<PaymentStatus>
    fun observeRecentPayments(): Flow<List<Payment>>
}
```

For boolean-returning methods, use `is` or `has` prefixes — `isPaymentValid()`, `hasActiveSubscription()`. For actions that trigger side effects, use strong verbs — `sync`, `refresh`, `invalidate`, `clear`. Avoid vague names like `update` or `handle` when a more specific verb exists. `refreshPaymentCache()` is infinitely more descriptive than `updatePayments()`.

## ViewModel State, Events, and Effects

I name my ViewModel communication types with clear suffixes that tell you their role. **UiState** holds the current screen state — `PaymentUiState`. **UiEvent** represents user actions coming *into* the ViewModel — `PaymentUiEvent`. **UiEffect** represents one-time side effects going *out* to the UI — `PaymentUiEffect`. These are navigation events, snackbar messages, or toast triggers that should only be consumed once.

```kotlin
data class PaymentUiState(
    val amount: String = "",
    val isProcessing: Boolean = false,
    val paymentMethods: List<PaymentMethod> = emptyList(),
    val selectedMethod: PaymentMethod? = null,
    val error: String? = null
)

sealed interface PaymentUiEvent {
    data class AmountChanged(val amount: String) : PaymentUiEvent
    data class MethodSelected(val method: PaymentMethod) : PaymentUiEvent
    data object SubmitClicked : PaymentUiEvent
}

sealed interface PaymentUiEffect {
    data class NavigateToConfirmation(val paymentId: String) : PaymentUiEffect
    data class ShowError(val message: String) : PaymentUiEffect
}
```

The naming consistency matters here. When every feature follows this pattern, any developer can jump into any feature and immediately know where to find the state definition, how user actions flow in, and where one-time effects are emitted. It reduces cognitive load across the entire codebase.

## Common Naming Mistakes

**God classes with vague names.** If you have a `PaymentManager` that's 1,000+ lines, it's not a manager — it's a monolith hiding behind a generic suffix. Break it into specific classes: `PaymentProcessor`, `PaymentValidator`, `PaymentCacheCoordinator`. Each name should describe a focused responsibility.

**Overusing Helper and Utils.** `PaymentHelper` tells you nothing. What does it help with? Validation? Formatting? Calculation? Name it `PaymentAmountFormatter` or `PaymentValidationRules`. The only acceptable `Utils` class is one with truly generic, stateless utility functions that don't belong to any specific domain — like `StringUtils` or `DateUtils`. Even then, Kotlin extension functions are usually a better choice.

**Inconsistent patterns across features.** I've seen codebases where the payment feature uses `PaymentRepo`, the profile feature uses `UserRepository`, and the search feature uses `SearchDataManager`. They all do the same thing — mediate data access — but every feature invented its own naming convention. Pick one pattern and enforce it everywhere. If it's `Repository`, it's always `Repository`, never `Repo`, never `DataManager`, never `Store` (unless you're genuinely using a different pattern).

**Abbreviations and acronyms.** `PmtProcUC` is not a UseCase name. Write it out: `ProcessPaymentUseCase`. The few characters you save aren't worth the confusion. The only abbreviations I use are widely understood ones like `DTO`, `UI`, `API`, and `ID`. Everything else gets spelled out.

**Naming boolean variables poorly.** A variable called `payment` that holds a Boolean makes no sense. Use `isPaymentComplete`, `hasPaymentFailed`, `shouldRetryPayment`. The prefix tells you it's a boolean and what state it represents, all without reading a single line of implementation.

Thank You!










