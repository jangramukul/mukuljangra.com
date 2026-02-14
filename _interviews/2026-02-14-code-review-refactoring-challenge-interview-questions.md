---
title: "Code Review & Refactoring Challenge"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 5
sequence: 72
description: "Some companies hand you an existing codebase and ask you to review it, identify problems, and refactor."
---

## Code Review & Refactoring Challenge

Some companies hand you an existing codebase and ask you to review it, identify problems, and refactor. This tests your ability to read unfamiliar code, spot design issues, and improve code quality without breaking existing behavior.

### Core Questions (Beginner → Intermediate)

#### Q1: What are code smells and how do you spot them?

Code smells are patterns in code that suggest deeper design problems. They're not bugs — the code works — but they make the code harder to maintain, test, and extend. Common ones in Android codeballs:

- **God class** — a ViewModel or Activity that does everything: API calls, data mapping, navigation, UI logic. If a class is over 300-400 lines, it's probably doing too much.
- **Long method** — a function that handles multiple responsibilities. If you need to scroll to see the whole function, it should be split.
- **Feature envy** — a class that uses more methods from another class than its own. The logic probably belongs in the other class.
- **Primitive obsession** — passing raw strings and ints everywhere instead of creating meaningful types like `UserId`, `Email`, or `Temperature`.

#### Q2: How do you refactor a God Activity or God ViewModel?

Extract responsibilities into separate classes. A ViewModel should only hold UI state and delegate work to other layers. If it's making API calls directly, create a repository. If it's mapping data, create mapper functions. If it's handling navigation, use events or a navigator class.

```kotlin
// Before: God ViewModel
class ProfileViewModel : ViewModel() {
    fun loadProfile() {
        val client = OkHttpClient()
        val request = Request.Builder().url("https://api.example.com/profile").build()
        // Makes network call directly
        // Parses JSON manually
        // Maps to UI model
        // Updates 5 different state fields
    }
}

// After: Clean ViewModel
class ProfileViewModel(
    private val getProfileUseCase: GetProfileUseCase
) : ViewModel() {
    val uiState: StateFlow<ProfileUiState> = getProfileUseCase()
        .map { it.toUiState() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ProfileUiState.Loading)
}
```

The refactored ViewModel is testable because you can swap `GetProfileUseCase` with a fake. The original one is impossible to test without mocking OkHttp.

#### Q3: What does it mean to refactor toward SOLID principles?

SOLID gives you five guidelines for structuring code. In a refactoring challenge, the most relevant ones are:

- **Single Responsibility** — each class handles one concern. A `WeatherRepository` fetches weather data. A `WeatherFormatter` formats it for display. A `WeatherViewModel` holds UI state. They don't mix.
- **Open/Closed** — use interfaces and abstractions so you can add new behavior without modifying existing code. If adding a new data source requires changing the repository, the abstraction is wrong.
- **Dependency Inversion** — depend on abstractions, not concrete classes. The ViewModel depends on a `Repository` interface, not `WeatherRepositoryImpl`. This makes testing and swapping implementations easy.

In practice, Single Responsibility and Dependency Inversion solve 80% of refactoring problems in Android code.

#### Q4: How do you extract use cases from a bloated ViewModel?

Look for distinct operations the ViewModel performs — loading data, submitting a form, toggling a favorite, refreshing a list. Each becomes a use case class with a single `invoke()` operator function.

```kotlin
class GetWeatherUseCase(
    private val repository: WeatherRepository,
    private val locationProvider: LocationProvider
) {
    operator fun invoke(): Flow<Resource<Weather>> {
        return locationProvider.currentCity
            .flatMapLatest { city -> repository.observeWeather(city) }
    }
}

class ToggleFavoriteUseCase(
    private val repository: FavoriteRepository
) {
    suspend operator fun invoke(cityId: String) {
        val isFavorite = repository.isFavorite(cityId)
        if (isFavorite) repository.removeFavorite(cityId)
        else repository.addFavorite(cityId)
    }
}
```

Use cases are optional in small apps, but they're valuable when multiple ViewModels need the same operation, or when the operation combines data from multiple repositories. Don't create use cases that are just pass-through wrappers around a single repository method — that adds indirection without value.

#### Q5: How do you replace callbacks with coroutines or Flow?

Callbacks create nested, hard-to-follow code. Wrap callback-based APIs with `suspendCancellableCoroutine` for one-shot results and `callbackFlow` for streams.

```kotlin
// Before: Callback-based location
locationClient.getLastLocation()
    .addOnSuccessListener { location ->
        if (location != null) {
            weatherApi.getWeather(location.latitude, location.longitude,
                object : Callback<Weather> {
                    override fun onSuccess(weather: Weather) {
                        updateUi(weather)
                    }
                    override fun onFailure(error: Exception) {
                        showError(error)
                    }
                })
        }
    }

// After: Coroutine-based
suspend fun getWeatherForCurrentLocation(): Weather {
    val location = locationClient.getLastLocation().await()
        ?: throw LocationNotFoundException()
    return weatherApi.getWeather(location.latitude, location.longitude)
}
```

The coroutine version reads top-to-bottom. Error handling uses try-catch instead of separate callbacks. Cancellation works automatically — if the coroutine scope is cancelled, the location request and API call are both cancelled.

#### Q6: How do you improve naming conventions in a codebase?

Good naming makes code self-documenting. In a code review, look for:

- Vague names: `data`, `info`, `temp`, `result`, `item` — rename to what the thing actually is: `weatherResponse`, `userProfile`, `cachedArticle`
- Abbreviated names: `usr`, `mgr`, `btn`, `ctx` — spell them out unless the abbreviation is universally understood (like `id` or `url`)
- Boolean names that don't read as questions: `loading` should be `isLoading`, `enable` should be `isEnabled`
- Function names that don't describe what they do: `process()`, `handle()`, `doWork()` — be specific: `parseWeatherResponse()`, `submitPayment()`, `syncOfflineChanges()`

In Kotlin, follow the standard conventions: `camelCase` for functions and properties, `PascalCase` for classes and interfaces, `UPPER_SNAKE_CASE` for constants.

#### Q7: How do you reduce coupling between classes?

Coupling is when one class depends directly on another class's implementation. High coupling means changing one class forces changes in many others. To reduce it:

- Depend on interfaces instead of concrete classes
- Pass dependencies through constructors (dependency injection) instead of creating them internally
- Use events or callbacks for communication instead of direct method calls between unrelated classes
- Keep public API surfaces small — expose only what other classes need

```kotlin
// High coupling — ViewModel creates its own dependencies
class OrderViewModel : ViewModel() {
    private val api = RetrofitClient.create(OrderApi::class.java)
    private val db = AppDatabase.getInstance(app).orderDao()
}

// Low coupling — dependencies injected through constructor
class OrderViewModel(
    private val repository: OrderRepository
) : ViewModel()
```

The first ViewModel is impossible to test without a real API and database. The second works with any `OrderRepository` implementation — real, fake, or mock.

#### Q8: How do you spot and remove code duplication?

Duplication isn't always identical code — sometimes it's similar logic with slight variations. Look for repeated patterns: multiple ViewModels with the same loading/error/success state handling, multiple API calls with identical error handling, or similar data mapping logic across features.

Extract shared behavior into reusable functions, base classes, or utility extensions. But be careful about premature abstraction — if two pieces of code look similar but serve different purposes, they might need to evolve independently. The "rule of three" is useful: don't extract until you see the same pattern in three places.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How do you improve testability of existing code?

The main barriers to testability are hardcoded dependencies, static method calls, and direct framework access. Fix them by:

- Extracting interfaces for dependencies and injecting them
- Wrapping static calls (like `System.currentTimeMillis()`) behind an injectable interface
- Moving business logic out of Activity/Fragment and into ViewModel or use cases
- Making functions pure where possible — same input always gives same output

```kotlin
// Untestable — depends on system clock
class TokenValidator {
    fun isExpired(token: Token): Boolean {
        return System.currentTimeMillis() > token.expiresAt
    }
}

// Testable — clock is injectable
class TokenValidator(private val clock: Clock = Clock.systemUTC()) {
    fun isExpired(token: Token): Boolean {
        return clock.millis() > token.expiresAt
    }
}
```

With the injectable `Clock`, you can pass a fixed-time clock in tests and verify expiration behavior without dealing with timing issues. This pattern applies to any external dependency — network availability, feature flags, shared preferences.

#### Q10: How do you approach a refactoring challenge without breaking existing behavior?

Write tests for the existing behavior before you change anything. Even if the code is messy, it works — and the tests document what "works" means. Then refactor in small steps, running tests after each change.

The workflow is:

- Read the existing code and understand what it does
- Write characterization tests that capture the current behavior
- Identify the highest-impact refactoring (usually extracting a class or breaking a dependency)
- Make one change at a time
- Run tests after every change
- If tests pass, commit. If they fail, undo and try a smaller step

If there are no tests and the code is deeply entangled, start by extracting the purest logic (like data mapping or validation) into standalone functions with their own tests. Build outward from there.

#### Q11: How do you spot and fix memory leaks in a code review?

Common leak patterns in Android:

- Storing `Activity` or `Context` references in static fields, singletons, or companion objects
- Anonymous inner classes or lambdas that capture the outer Activity/Fragment
- Unregistered listeners, callbacks, or broadcast receivers
- Long-running coroutines that capture a View or Activity reference

```kotlin
// Leak: Activity reference held by static field
companion object {
    var lastActivity: Activity? = null // Never do this
}

// Leak: Inner class holds implicit reference to Activity
class MyActivity : AppCompatActivity() {
    inner class ApiCallback : Callback<Data> {
        override fun onSuccess(data: Data) {
            // 'this@MyActivity' is captured — if the callback
            // outlives the Activity, it leaks
        }
    }
}

// Fix: Use ViewModel scope and lifecycle-aware components
class MyViewModel(private val repository: Repository) : ViewModel() {
    val data = repository.observe().stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5000), null
    )
}
```

In a code review, flag any place where a long-lived object holds a reference to a short-lived one. Activities and Fragments are short-lived — singletons, companion objects, and background threads are long-lived.

#### Q12: How do you refactor nested callbacks into clean coroutine code?

Nested callbacks (callback hell) make code hard to read and error handling difficult. Convert each callback-based API call to a suspend function using `suspendCancellableCoroutine`, then call them sequentially in a coroutine.

```kotlin
// Before: Callback hell
fun processOrder(orderId: String) {
    getOrder(orderId, object : Callback<Order> {
        override fun onSuccess(order: Order) {
            validatePayment(order.paymentId, object : Callback<Payment> {
                override fun onSuccess(payment: Payment) {
                    submitOrder(order, payment, object : Callback<Confirmation> {
                        override fun onSuccess(confirmation: Confirmation) {
                            updateUi(confirmation)
                        }
                        override fun onFailure(e: Exception) { showError(e) }
                    })
                }
                override fun onFailure(e: Exception) { showError(e) }
            })
        }
        override fun onFailure(e: Exception) { showError(e) }
    })
}

// After: Sequential coroutines
suspend fun processOrder(orderId: String): Confirmation {
    val order = repository.getOrder(orderId)
    val payment = paymentService.validate(order.paymentId)
    return orderService.submit(order, payment)
}
```

Three levels of nesting become three lines. Error handling is a single try-catch in the calling code. Each function is independently testable. This is the kind of refactoring evaluators want to see — the code does the same thing but is dramatically easier to read and maintain.

#### Q13: How do you identify and fix performance issues in a code review?

Look for these patterns:

- **Unnecessary recomposition in Compose** — unstable parameters, lambdas created inline, reading state too high in the tree. Fix with `@Immutable`, method references, and state hoisting.
- **Lazy initialization missing** — heavy objects created at startup that aren't needed immediately. Use `by lazy` for expensive resources.
- **Main thread work** — network calls, database queries, or JSON parsing on the main thread. Move to `Dispatchers.IO`.
- **Redundant object allocation in loops** — creating objects inside `onDraw()`, `onBindViewHolder()`, or tight loops. Allocate once and reuse.

```kotlin
// Slow: Creates Formatter on every bind
override fun onBindViewHolder(holder: ViewHolder, position: Int) {
    val formatter = SimpleDateFormat("MMM dd, yyyy", Locale.getDefault())
    holder.date.text = formatter.format(items[position].date)
}

// Fast: Reuse Formatter
private val dateFormatter = SimpleDateFormat("MMM dd, yyyy", Locale.getDefault())

override fun onBindViewHolder(holder: ViewHolder, position: Int) {
    holder.date.text = dateFormatter.format(items[position].date)
}
```

In a code review, it's not enough to say "this is slow." Explain why it's slow and what the fix is.

#### Q14: How do you refactor error handling from try-catch everywhere to a structured approach?

Replace scattered try-catch blocks with a `Result` or sealed class that flows through the layers. The repository catches exceptions and returns a typed result. The ViewModel maps it to UI state. The UI never sees exceptions.

```kotlin
sealed interface Resource<out T> {
    data class Success<T>(val data: T) : Resource<T>
    data class Error(val message: String, val cause: Exception? = null) : Resource<Nothing>
    data object Loading : Resource<Nothing>
}

// Repository catches exceptions once
class OrderRepository(private val api: OrderApi) {
    suspend fun getOrders(): Resource<List<Order>> {
        return try {
            val response = api.getOrders()
            Resource.Success(response.map { it.toDomain() })
        } catch (e: HttpException) {
            Resource.Error("Server error: ${e.code()}", e)
        } catch (e: IOException) {
            Resource.Error("No internet connection", e)
        }
    }
}

// ViewModel doesn't need try-catch
class OrderViewModel(private val repository: OrderRepository) : ViewModel() {
    val uiState = flow {
        emit(Resource.Loading)
        emit(repository.getOrders())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Resource.Loading)
}
```

This approach centralizes error handling in the data layer, where you have the context to provide meaningful error messages. The ViewModel and UI layers just react to the result type. No try-catch scattered across the codebase, no forgotten catch blocks.

#### Q15: How do you refactor a class to follow the Single Responsibility Principle?

Identify the different reasons the class might change. If a ViewModel changes when the API changes, when the UI layout changes, when the navigation logic changes, and when the analytics tracking changes — that's four responsibilities in one class.

```kotlin
// Before: Multiple responsibilities
class CheckoutViewModel : ViewModel() {
    fun loadCart() { /* API call + caching + mapping */ }
    fun applyDiscount(code: String) { /* validation + API call */ }
    fun processPayment(card: Card) { /* payment SDK + error handling */ }
    fun trackCheckoutStep(step: String) { /* analytics event */ }
    fun navigateToConfirmation() { /* navigation logic */ }
}

// After: Single responsibility per class
class CheckoutViewModel(
    private val cartRepository: CartRepository,
    private val discountService: DiscountService,
    private val paymentProcessor: PaymentProcessor,
    private val analytics: CheckoutAnalytics
) : ViewModel() {
    val cartState = cartRepository.observeCart()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), CartUiState.Loading)

    fun applyDiscount(code: String) {
        viewModelScope.launch {
            val result = discountService.apply(code)
            // Update state based on result
        }
    }

    fun processPayment(card: Card) {
        viewModelScope.launch {
            analytics.trackPaymentStarted()
            val result = paymentProcessor.process(card)
            // Handle result
        }
    }
}
```

The ViewModel still coordinates the workflow, but each piece of logic lives in its own class that can be tested and changed independently. If the payment SDK changes, you only modify `PaymentProcessor`. If analytics requirements change, you only modify `CheckoutAnalytics`.

#### Q16: What do you look for first when reviewing unfamiliar code?

Start from the outside and work inward. Read the project structure first — how modules and packages are organized tells you about the architecture. Then read the entry point (Application class or main Activity/NavHost) to understand the navigation flow. Then pick one feature and trace it end-to-end: UI → ViewModel → Repository → API/Database.

Look for:
- Does the architecture separate concerns or is everything in Activities?
- Is there dependency injection or are classes creating their own dependencies?
- Are there tests? If so, what's tested and what's not?
- How is error handling structured — is it consistent or ad-hoc?
- Are there any obvious memory leak patterns?

Focus your review on the highest-impact issues first. Naming and formatting are the least important — architecture, correctness, and testability matter most.

#### Q17: How do you suggest architectural improvements without rewriting everything?

Propose incremental changes that improve the worst parts without requiring a full rewrite. Prioritize by impact:

- Extract an interface for the biggest dependency (usually the network or database layer) so it becomes testable
- Move business logic from Activities/Fragments to ViewModels
- Replace scattered error handling with a consistent `Resource` or `Result` type
- Add dependency injection for the most-used dependencies

Each change should be a self-contained refactoring that works on its own. If the codebase has 50 problems, fixing the top 5 architectural issues has more impact than fixing 30 naming issues.

### Common Follow-ups

- How do you decide between refactoring incrementally vs rewriting a module from scratch?
- What's your approach to adding tests to legacy code that has no tests?
- How do you handle a code review where you disagree with the original architect's decisions?
- What tools do you use to detect code smells automatically (Detekt, Lint, SonarQube)?
- How do you refactor a ViewModel that uses LiveData to use StateFlow?
- What's the difference between extracting a utility function vs creating a new class?
- How do you measure whether a refactoring actually improved the codebase?
