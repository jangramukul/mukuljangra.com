---
title: Follow Right Architecture Patterns Naming
layout: post
categories: post
tags:
  - Android
  - Architecture
---

I once joined a project where the codebase had a class called `DataManager`. Sounds reasonable, right? Well, it was 2,400 lines long. It handled API calls, caching, database writes, and — wait for it — UI formatting. There was also a `DataHelper`, a `DataProvider`, and a `DataUtils`, each doing overlapping things with zero consistency. Nobody on the team could explain which one to use for what.

It was like walking into a kitchen where every drawer is labeled "stuff." Forks? In the stuff drawer. Knives? Also stuff drawer. Batteries? Yep, stuff drawer. You end up opening every drawer every time because the labels are useless.

That experience taught me something I now believe deeply: **naming is architecture**. Your class names aren't just labels — they're the blueprint of your app. If your names are inconsistent or vague, your architecture is inconsistent and vague, no matter how many clean architecture diagrams you draw on a whiteboard. Good naming makes the codebase self-documenting. Bad naming makes even well-structured code feel like a maze.

So how do you get naming right? You build a system. A consistent, predictable system that works across every layer of your Android app. And that's exactly what we're going to walk through.

## Layer-by-Layer Naming Conventions

Think of your app's architecture like a building with clearly labeled floors. Ground floor is Presentation, second floor is Domain, top floor is Data. If someone hands you a class name, you should be able to tell which floor it lives on without opening the file. That's the whole point of layer-based naming — the name *is* the map.

### Presentation Layer

The presentation layer is where your UI lives, and the naming should make that obvious. **ViewModels** get the screen or feature name followed by `ViewModel` — `PaymentViewModel`, `ProfileViewModel`, `SearchViewModel`. The associated screen composable follows the same prefix — `PaymentScreen`, `ProfileScreen`. State classes that hold the UI state use the `UiState` suffix — `PaymentUiState`, `ProfileUiState`.

See the pattern? Everything in the payment feature's presentation layer starts with `Payment`. It's like a family name — you can immediately tell who belongs together.

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

The domain layer is all about business logic, and the naming should make actions and contracts crystal clear. **UseCases** follow the verb-noun pattern — `ProcessPaymentUseCase`, `GetUserProfileUseCase`, `ObserveCartItemsUseCase`. Repository interfaces live here too, named after the entity they manage — `PaymentRepository`, `UserRepository`.

Here's the key thing: the domain layer defines the *contract* (the interface), not the implementation. It says "someone will give me payment data" without caring whether that data comes from a server, a database, or a sticky note on your monitor. I always keep UseCase names as specific actions, never vague ones like `HandleDataUseCase`. Handle *what* data *how*? That name tells me nothing.

### Data Layer

The data layer is where things get concrete — where your app actually talks to the real world. **Repository implementations** use the `Impl` suffix or a source-specific prefix — `PaymentRepositoryImpl` or `OfflineFirstPaymentRepository` if the distinction matters. **DataSources** describe where the data comes from — `PaymentRemoteDataSource`, `PaymentLocalDataSource`. **Mappers** convert between layers — `PaymentDtoMapper`, `PaymentEntityMapper`. **DTOs** (Data Transfer Objects) represent API responses — `PaymentDto`, `UserDto`. **Entities** represent database models — `PaymentEntity`, `UserEntity`. The domain models themselves are just plain names — `Payment`, `User`, `CartItem`.

Notice how every suffix tells you exactly what the class does and where it sits. You'll never confuse a `PaymentDto` with a `PaymentEntity` because the suffix *is* the documentation.

## Package Structure

I've seen teams argue endlessly about package structure. Honestly, both major approaches have merit. But here's what I've settled on after working on apps of different sizes.

**Layer-based** packaging groups by technical layer — `data/`, `domain/`, `presentation/`. This works fine for small apps with 10-15 screens. You always know which folder to look in based on the type of class you need. But it falls apart in larger codebases because a single feature's code gets scattered across three different package trees. Making a change to the payment flow means jumping between `data/repository/`, `domain/usecase/`, and `presentation/viewmodel/`.

It's like organizing your closet by color. Looks neat. But when you need a complete outfit? You're running between five sections.

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

> **💡 The "aha" moment:** Organizing by feature instead of by layer means that when you touch a feature, everything you need is in one folder. And when it's time to extract a feature into its own module, the package boundary is already drawn for you.

## Class Naming Patterns

### Repository vs DataSource

This one trips up a lot of developers, so let me give you an analogy. Think of a **Repository** as a travel agent. You tell the travel agent "I need a flight to Tokyo." The agent checks multiple airlines, compares cached prices, maybe looks at a loyalty program — and hands you a ticket. You don't care where it came from. A **DataSource**, on the other hand, is a single airline's booking system. It only knows about its own flights. It doesn't compare, it doesn't cache, it just does one thing.

In code terms, the Repository might call `PaymentRemoteDataSource` to fetch from the API and `PaymentLocalDataSource` to cache the result. The DataSource never knows about other sources; it just does its one job.

IMO, when you see a class that directly calls Retrofit or Room, it should be a DataSource. When you see a class that combines results from multiple DataSources or applies caching logic, that's a Repository. If you mix the two up, you end up with DataSources that secretly know about caching and Repositories that directly hit the network — and then nobody can tell what's responsible for what.

### UseCase Naming

UseCases should always be verb-noun: `ProcessPaymentUseCase`, `ValidateEmailUseCase`, `SyncOrdersUseCase`. The verb tells you the action, the noun tells you the domain entity.

I've seen teams use `PaymentUseCase` or `PaymentInteractor` — both are way too vague. What does it *do* with the payment? Process it? Cancel it? Refund it? That's like naming a function `doStuff()`. Be specific. Each UseCase should represent exactly one business action. If your UseCase has multiple public methods, it's doing too much — split it up.

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

> **⚡ Quick check:** You see a class called `OrderInteractor` with methods for placing orders, cancelling orders, and fetching order history. What's wrong with it, and how would you rename the pieces?

### DTO, Entity, and Model Distinctions

Here's the thing — these three words mean completely different things, and mixing them up causes real architectural problems.

Think of it like this. You order a package online. The **DTO** is the shipping box — it's the raw shape the data arrives in from the outside world, usually matching the API response JSON. The **Entity** is how you store the item in your warehouse — annotated with Room's `@Entity`, shaped for your database. The **Model** is the actual product you use — your clean domain object with no serialization annotations, no database annotations, just pure business data.

Mappers are the workers who unbox and repackage: `PaymentDtoMapper` converts DTO to domain model, `PaymentEntityMapper` converts entity to domain model and back. Three different representations of the same concept, each optimized for its own layer. When someone puts serialization annotations on a domain model, they're taping the shipping label directly onto the product. It works... until it doesn't.

## Method Naming Patterns

Method names should tell you about the execution behavior, not just what data you get back. I follow a simple convention: **`get`** prefix for one-shot `suspend` functions that return a single value. **`observe`** prefix for functions returning a `Flow` that emits over time.

Why does this matter so much? Because the prefix tells the caller *how* to use the function without reading the implementation. `getPaymentById` — call it, get a result, done. `observePaymentStatus` — collect it, keep listening, values will keep coming. That's a huge difference, and the method name communicates it instantly.

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

For boolean-returning methods, use `is` or `has` prefixes — `isPaymentValid()`, `hasActiveSubscription()`. For actions that trigger side effects, use strong verbs — `sync`, `refresh`, `invalidate`, `clear`. Avoid vague names like `update` or `handle` when a more specific verb exists. `refreshPaymentCache()` is infinitely more descriptive than `updatePayments()`. One tells you exactly what happens. The other? Could be anything.

## ViewModel State, Events, and Effects

I name my ViewModel communication types with clear suffixes that tell you their role. Think of it as a postal system. **UiState** is the current contents of your mailbox — what's showing on screen right now, `PaymentUiState`. **UiEvent** is a letter you send *to* the post office — a user action coming into the ViewModel, `PaymentUiEvent`. **UiEffect** is a one-time delivery notification — it pops up once and it's done, `PaymentUiEffect`. These are navigation events, snackbar messages, or toast triggers that should only be consumed once.

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

The naming consistency matters here. When every feature follows this pattern, any developer can jump into any feature and immediately know where to find the state definition, how user actions flow in, and where one-time effects are emitted. It reduces cognitive load across the entire codebase. No more guessing, no more digging through code to understand the communication flow.

> **🧠 Think about it:** If a new developer joins your team tomorrow and opens any feature folder, can they figure out the data flow just from the class names? If yes, your naming is doing its job. If they need to read the actual code to understand what talks to what — your names are failing you.

## Common Naming Mistakes

**God classes with vague names.** If you have a `PaymentManager` that's 1,000+ lines, it's not a manager — it's a monolith hiding behind a generic suffix. I call these "trench coat classes" — three smaller classes standing on each other's shoulders pretending to be one. Break it into specific classes: `PaymentProcessor`, `PaymentValidator`, `PaymentCacheCoordinator`. Each name should describe a focused responsibility.

**Overusing Helper and Utils.** `PaymentHelper` tells you nothing. What does it help with? Validation? Formatting? Calculation? It "helps" the same way a coworker "helps" by saying "just figure it out." Name it `PaymentAmountFormatter` or `PaymentValidationRules`. The only acceptable `Utils` class is one with truly generic, stateless utility functions that don't belong to any specific domain — like `StringUtils` or `DateUtils`. Even then, Kotlin extension functions are usually a better choice.

**Inconsistent patterns across features.** I've seen codebases where the payment feature uses `PaymentRepo`, the profile feature uses `UserRepository`, and the search feature uses `SearchDataManager`. They all do the same thing — mediate data access — but every feature invented its own naming convention. Pick one pattern and enforce it everywhere. If it's `Repository`, it's always `Repository`, never `Repo`, never `DataManager`, never `Store` (unless you're genuinely using a different pattern).

> **🔥 Real talk:** Inconsistent naming across features is one of the most common things I see in production codebases. It usually happens because each feature was built by a different developer (or the same developer six months apart). The fix isn't glamorous — it's a boring rename refactor. But it pays off every single day after that.

**Abbreviations and acronyms.** `PmtProcUC` is not a UseCase name. Write it out: `ProcessPaymentUseCase`. The few characters you save aren't worth the confusion. The only abbreviations I use are widely understood ones like `DTO`, `UI`, `API`, and `ID`. Everything else gets spelled out. Your IDE has autocomplete — use it.

**Naming boolean variables poorly.** A variable called `payment` that holds a Boolean makes no sense. Is it... a payment? Does payment exist? Is payment angry? Use `isPaymentComplete`, `hasPaymentFailed`, `shouldRetryPayment`. The prefix tells you it's a boolean and what state it represents, all without reading a single line of implementation.

Thank You!










