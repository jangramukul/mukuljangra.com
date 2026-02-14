---
title: "Code Review & Refactoring Challenge"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 5
sequence: 73
description: "Some companies hand you an existing codebase and ask you to review it, identify problems, and refactor."
---

## Code Review & Refactoring Challenge

Some companies give you an existing codebase and ask you to review it, find problems, and refactor. This is about reading unfamiliar code, spotting design issues, and improving quality without breaking things.

#### What are code smells and how do you spot them?

Code smells are patterns that hint at deeper design problems. The code works, but it's hard to maintain and extend. Common ones I look for in Android:

- **God class** — a ViewModel or Activity doing everything: API calls, data mapping, navigation, UI logic. If a class is over 300 lines, it's probably doing too much.
- **Long method** — a function handling multiple responsibilities. If I need to scroll to see the whole thing, it should be split.
- **Feature envy** — a class that calls more methods on another class than on itself. The logic probably belongs in the other class.
- **Primitive obsession** — passing raw strings and ints everywhere instead of creating types like `UserId`, `Email`, or `Temperature`.

#### How do you improve naming conventions in a codebase?

Good naming makes code self-documenting. I look for:

- Vague names: `data`, `info`, `temp`, `result` — rename to what the thing actually is: `weatherResponse`, `userProfile`, `cachedArticle`
- Abbreviated names: `usr`, `mgr`, `btn` — spell them out unless universally understood (like `id` or `url`)
- Booleans that don't read as questions: `loading` should be `isLoading`, `enable` should be `isEnabled`
- Functions that don't describe what they do: `process()`, `handle()`, `doWork()` — be specific: `parseWeatherResponse()`, `submitPayment()`

In Kotlin, follow the standard conventions: `camelCase` for functions and properties, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.

#### How do you reduce coupling between classes?

Coupling means one class depends directly on another's implementation. High coupling means changing one class forces changes in many others. I reduce it by:

- Depending on interfaces instead of concrete classes
- Passing dependencies through constructors instead of creating them internally
- Using events or callbacks for communication between unrelated classes
- Keeping public API surfaces small

```kotlin
// High coupling — ViewModel creates its own dependencies
class OrderViewModel : ViewModel() {
    private val api = RetrofitClient.create(OrderApi::class.java)
    private val db = AppDatabase.getInstance(app).orderDao()
}

// Low coupling — dependencies injected
class OrderViewModel(
    private val repository: OrderRepository
) : ViewModel()
```

The first ViewModel is impossible to test without a real API and database. The second works with any `OrderRepository` implementation.

#### How do you refactor a God Activity or God ViewModel?

I extract responsibilities into separate classes. A ViewModel should hold UI state and delegate work. If it's making API calls, I create a repository. If it's mapping data, I create mapper functions. If it's handling navigation, I use events or a navigator class.

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

The refactored ViewModel is testable because I can swap `GetProfileUseCase` with a fake. The original is impossible to test without mocking OkHttp.

#### What does it mean to refactor toward SOLID principles?

SOLID gives five guidelines for structuring code. In a refactoring challenge, the most relevant ones are:

- **Single Responsibility** — each class handles one concern. A `WeatherRepository` fetches data. A `WeatherFormatter` formats it. A `WeatherViewModel` holds UI state.
- **Open/Closed** — use interfaces so you can add new behavior without modifying existing code. If adding a new data source requires changing the repository, the abstraction is wrong.
- **Dependency Inversion** — depend on abstractions, not concrete classes. The ViewModel depends on a `Repository` interface, not `WeatherRepositoryImpl`.

In practice, Single Responsibility and Dependency Inversion solve 80% of refactoring problems in Android code.

#### How do you spot and remove code duplication?

Duplication isn't always identical code. Sometimes it's similar logic with slight variations. I look for repeated patterns: multiple ViewModels with the same loading/error/success state handling, multiple API calls with identical error handling, or similar mapping logic across features.

I extract shared behavior into reusable functions, base classes, or utility extensions. But I'm careful about premature abstraction — if two pieces of code look similar but serve different purposes, they might evolve independently. The rule of three is useful: don't extract until you see the same pattern three times.

#### How do you extract use cases from a bloated ViewModel?

I look for distinct operations the ViewModel performs — loading data, submitting a form, toggling a favorite, refreshing a list. Each becomes a use case class with a single `invoke()` operator function.

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

Use cases are optional in small apps, but valuable when multiple ViewModels need the same operation or when the operation combines data from multiple repositories. Don't create use cases that just wrap a single repository method — that's indirection without value.

#### How do you replace callbacks with coroutines or Flow?

Callbacks create nested, hard-to-follow code. I wrap callback-based APIs with `suspendCancellableCoroutine` for one-shot results and `callbackFlow` for streams.

```kotlin
// Before: Callback-based
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

The coroutine version reads top-to-bottom. Error handling uses try-catch instead of separate callbacks. Cancellation works automatically — if the scope is cancelled, both the location request and API call are cancelled.

#### How do you improve testability of existing code?

The main barriers to testability are hardcoded dependencies, static method calls, and direct framework access. I fix them by:

- Extracting interfaces for dependencies and injecting them
- Wrapping static calls (like `System.currentTimeMillis()`) behind an injectable interface
- Moving business logic out of Activity/Fragment into ViewModel or use cases
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

With the injectable `Clock`, I can pass a fixed-time clock in tests and verify expiration behavior without timing issues. This pattern applies to any external dependency — network availability, feature flags, shared preferences.

#### What do you look for first when reviewing unfamiliar code?

I start from the outside and work inward. I read the project structure first — how modules and packages are organized tells me about the architecture. Then I read the entry point (Application class or main Activity/NavHost) to understand the navigation flow. Then I pick one feature and trace it end-to-end: UI to ViewModel to Repository to API/Database.

I look for:
- Does the architecture separate concerns or is everything in Activities?
- Is there dependency injection or are classes creating their own dependencies?
- Are there tests? What's tested and what's not?
- Is error handling consistent or ad-hoc?
- Are there obvious memory leak patterns?

I focus on the highest-impact issues first. Naming and formatting matter least — architecture, correctness, and testability matter most.

#### How do you approach a refactoring challenge without breaking existing behavior?

I write tests for the existing behavior before I change anything. Even if the code is messy, it works — and the tests document what "works" means. Then I refactor in small steps, running tests after each change.

My workflow:

- Read the existing code and understand what it does
- Write characterization tests that capture the current behavior
- Identify the highest-impact refactoring (usually extracting a class or breaking a dependency)
- Make one change at a time
- Run tests after every change
- If tests pass, commit. If they fail, undo and try a smaller step

If there are no tests and the code is deeply entangled, I start by extracting the purest logic (like data mapping or validation) into standalone functions with their own tests. I build outward from there.

#### How do you spot and fix memory leaks in a code review?

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

I flag any place where a long-lived object holds a reference to a short-lived one. Activities and Fragments are short-lived. Singletons, companion objects, and background threads are long-lived.

#### How do you identify and fix performance issues in a code review?

I look for these patterns:

- **Unnecessary recomposition in Compose** — unstable parameters, inline lambdas, reading state too high in the tree. Fix with `@Immutable`, method references, and state hoisting.
- **Missing lazy initialization** — heavy objects created at startup that aren't needed immediately. Use `by lazy` for expensive resources.
- **Main thread work** — network calls, database queries, or JSON parsing on the main thread. Move to `Dispatchers.IO`.
- **Object allocation in loops** — creating objects inside `onDraw()`, `onBindViewHolder()`, or tight loops. Allocate once and reuse.

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

In a code review, it's not enough to say "this is slow." I explain why it's slow and what the fix is.

#### How do you refactor error handling from scattered try-catch to a structured approach?

I replace scattered try-catch blocks with a sealed class that flows through the layers. The repository catches exceptions and returns a typed result. The ViewModel maps it to UI state. The UI never sees exceptions.

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

This centralizes error handling in the data layer, where I have context for meaningful error messages. The ViewModel and UI just react to the result type.

#### How do you suggest architectural improvements without rewriting everything?

I propose incremental changes that improve the worst parts without a full rewrite. I prioritize by impact:

- Extract an interface for the biggest dependency (usually network or database) so it becomes testable
- Move business logic from Activities/Fragments to ViewModels
- Replace scattered error handling with a consistent `Resource` or `Result` type
- Add dependency injection for the most-used dependencies

Each change should be self-contained and work on its own. If the codebase has 50 problems, fixing the top 5 architectural issues has more impact than fixing 30 naming issues.

### Common Follow-ups

- How do you decide between refactoring incrementally vs rewriting a module from scratch?
- What's your approach to adding tests to legacy code that has no tests?
- How do you handle a code review where you disagree with the original architect's decisions?
- What tools do you use to detect code smells automatically (Detekt, Lint, SonarQube)?
- How do you refactor a ViewModel that uses LiveData to use StateFlow?
- What's the difference between extracting a utility function vs creating a new class?
- How do you measure whether a refactoring actually improved the codebase?
