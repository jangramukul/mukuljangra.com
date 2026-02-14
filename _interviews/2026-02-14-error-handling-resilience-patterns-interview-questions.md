---
title: "Error Handling & Resilience Patterns"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 7
sequence: 56
description: "Error handling questions test whether you think beyond the happy path."
---

## Error Handling & Resilience Patterns

Error handling questions test whether you think beyond the happy path. Interviewers want to see that you can model errors cleanly, handle failures in coroutines properly, and build apps that degrade gracefully instead of crashing.

### Core Questions

#### Q1: What is the difference between exceptions and errors in Kotlin?

In Kotlin, all exceptions are unchecked — there's no `throws` clause like Java. `Exception` represents recoverable conditions like network failures or invalid input. `Error` represents unrecoverable problems like `OutOfMemoryError` or `StackOverflowError` that you generally shouldn't catch.

The Kotlin philosophy is that exceptions should be used for logical errors (bugs), not for expected conditions. If a network call can fail, don't throw an exception and catch it — return a `Result` or sealed class that models success and failure as regular values. As a rule of thumb, handle exceptions at the top level of your codebase, not in low-level APIs.

#### Q2: How do you model errors using sealed classes?

Sealed classes let you define a closed set of error types. The compiler enforces exhaustive `when` expressions, so you can't forget to handle an error case.

```kotlin
sealed class NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>()
    data class Error(val code: Int, val message: String) : NetworkResult<Nothing>()
    data object Loading : NetworkResult<Nothing>()
}

fun handleResult(result: NetworkResult<User>) {
    when (result) {
        is NetworkResult.Success -> showUser(result.data)
        is NetworkResult.Error -> showError(result.message)
        is NetworkResult.Loading -> showLoading()
    }
}
```

This is better than throwing exceptions because the return type makes errors explicit. The caller is forced to handle all cases. With exceptions, nothing in the function signature tells you what can go wrong.

#### Q3: What is Kotlin's built-in Result type?

`Result<T>` is a value class that wraps either a successful value or a `Throwable`. It provides functions like `getOrNull()`, `getOrDefault()`, `getOrElse()`, `map()`, `fold()`, and `onSuccess()`/`onFailure()`.

```kotlin
suspend fun fetchUser(id: String): Result<User> {
    return runCatching {
        api.getUser(id)
    }
}

// Usage
fetchUser("123")
    .onSuccess { user -> showProfile(user) }
    .onFailure { error -> showError(error.message) }
```

`runCatching` wraps any code block and catches exceptions into a `Result`. The limitation is that `Result` only carries a `Throwable`, so you can't model typed errors like "not found" vs "unauthorized" without inspecting the exception class. For richer error modeling, sealed classes are more expressive.

#### Q4: How does try-catch work with coroutines?

In coroutines, `try-catch` works normally inside a `suspend` function. You wrap the suspending call and catch exceptions. But there's a subtlety — `CancellationException` should never be caught and swallowed. If you catch `Exception` broadly, rethrow `CancellationException` to keep structured concurrency working.

```kotlin
suspend fun loadData(): Result<Data> {
    return try {
        val data = repository.fetchData()
        Result.success(data)
    } catch (e: CancellationException) {
        throw e // Never swallow cancellation
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

Alternatively, use `runCatching` which internally handles this. But be careful — `runCatching` does catch `CancellationException`. In coroutine-heavy code, some teams write a custom `runSuspendCatching` that rethrows `CancellationException`.

#### Q5: What is CoroutineExceptionHandler?

`CoroutineExceptionHandler` is a last-resort handler for uncaught exceptions in coroutines. It only works on root coroutines launched with `launch` (not `async`). It catches exceptions that would otherwise crash the app.

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    logger.error("Unhandled: ${exception.message}")
    crashReporter.report(exception)
}

viewModelScope.launch(handler) {
    repository.syncData() // If this throws, handler catches it
}
```

It's similar to `Thread.UncaughtExceptionHandler`. It doesn't recover the coroutine — the coroutine is already failed. Use it for logging and crash reporting at the top level. Don't use it as a replacement for proper error handling inside your business logic.

#### Q6: What is the difference between coroutineScope and supervisorScope?

`coroutineScope` cancels all children if any child fails. If one child throws, every sibling is cancelled and the parent scope rethrows the exception. This is structured concurrency — fail together.

`supervisorScope` lets children fail independently. If one child throws, the other children keep running. The failed child's exception doesn't propagate to siblings.

```kotlin
// If fetchProfile fails, fetchSettings is also cancelled
coroutineScope {
    val profile = async { fetchProfile() }
    val settings = async { fetchSettings() }
}

// If fetchProfile fails, fetchSettings continues
supervisorScope {
    val profile = async { fetchProfile() }
    val settings = async { fetchSettings() }
}
```

Use `supervisorScope` when the child operations are independent — like loading different sections of a dashboard where one failure shouldn't block the others. Use `coroutineScope` when the children are related and partial results are useless.

#### Q7: What is exponential backoff and when do you use it?

Exponential backoff increases the delay between retry attempts exponentially. First retry after 1 second, second after 2 seconds, third after 4 seconds, and so on. This prevents overwhelming a server that's already struggling.

```kotlin
suspend fun <T> retryWithBackoff(
    maxRetries: Int = 3,
    initialDelay: Long = 1000,
    factor: Double = 2.0,
    block: suspend () -> T
): T {
    var currentDelay = initialDelay
    repeat(maxRetries - 1) {
        try {
            return block()
        } catch (e: IOException) {
            delay(currentDelay)
            currentDelay = (currentDelay * factor).toLong()
        }
    }
    return block() // Last attempt, let it throw
}
```

Add jitter (random variation) to the delay so multiple clients don't retry at the same instant. Use exponential backoff for network retries, WorkManager retry policies, and any operation against a shared resource that can be temporarily unavailable.

### Deep Dive Questions

#### Q8: What is the circuit breaker pattern?

Circuit breaker prevents your app from repeatedly calling a service that's down. It has three states:

- **Closed** — requests pass through normally. Failures are counted.
- **Open** — after a threshold of failures, the circuit opens and all requests immediately fail without attempting the call.
- **Half-Open** — after a timeout, one request is allowed through to test if the service recovered. If it succeeds, the circuit closes. If it fails, it opens again.

```kotlin
class CircuitBreaker(
    private val failureThreshold: Int = 5,
    private val resetTimeout: Long = 30_000
) {
    private var failureCount = 0
    private var lastFailureTime = 0L
    private var state = State.CLOSED

    suspend fun <T> execute(block: suspend () -> T): T {
        return when (state) {
            State.OPEN -> {
                if (System.currentTimeMillis() - lastFailureTime > resetTimeout) {
                    state = State.HALF_OPEN
                    tryCall(block)
                } else throw CircuitOpenException()
            }
            else -> tryCall(block)
        }
    }

    private suspend fun <T> tryCall(block: suspend () -> T): T {
        return try {
            val result = block()
            reset()
            result
        } catch (e: Exception) {
            recordFailure()
            throw e
        }
    }
}
```

This saves battery and network resources on mobile. Instead of retrying a dead server every few seconds, the circuit breaker fails fast and tries again later. Combine it with local caching to serve stale data while the circuit is open.

#### Q9: How do you implement graceful degradation in an Android app?

Graceful degradation means the app still works when parts of the system fail. Instead of showing an error screen, you show what you can with what you have.

Practical strategies:

- **Offline cache** — when the network fails, serve data from Room or DataStore. The user sees stale data with a "last updated" indicator instead of an empty screen.
- **Feature fallback** — if a recommendation engine is down, show a default list instead of nothing. If image loading fails, show a placeholder.
- **Partial loading** — if one API in a dashboard fails, show the sections that succeeded and a retry button for the failed one. Use `supervisorScope` to load sections independently.
- **Progressive enhancement** — design the core experience to work offline. Network-dependent features are additions, not requirements.

The key is deciding what's critical and what's optional. A chat app must show existing messages offline. It can defer sending new messages until connectivity returns.

#### Q10: How do you map network errors to user-facing messages?

Don't show raw exceptions to users. Map technical errors to meaningful messages at the presentation layer.

```kotlin
sealed class AppError(val userMessage: String) {
    data object NoInternet : AppError("No internet connection. Check your network settings.")
    data object ServerDown : AppError("Something went wrong. Please try again later.")
    data object Unauthorized : AppError("Your session has expired. Please log in again.")
    data object NotFound : AppError("The content you're looking for is no longer available.")
    data class Unknown(val cause: Throwable) : AppError("An unexpected error occurred.")
}

fun Throwable.toAppError(): AppError {
    return when (this) {
        is UnknownHostException, is ConnectException -> AppError.NoInternet
        is HttpException -> when (code()) {
            401 -> AppError.Unauthorized
            404 -> AppError.NotFound
            in 500..599 -> AppError.ServerDown
            else -> AppError.Unknown(this)
        }
        else -> AppError.Unknown(this)
    }
}
```

Do the mapping in the repository or use case layer, not in the ViewModel. The ViewModel should receive domain-level errors, not raw HTTP exceptions. This also makes the ViewModel testable without knowing about Retrofit or OkHttp.

#### Q11: How do you handle global error handling and crash reporting?

Set up a `Thread.UncaughtExceptionHandler` to catch crashes that escape all other handlers. Integrate with a crash reporting tool like Firebase Crashlytics, Sentry, or Bugsnag.

```kotlin
class CrashHandler(
    private val defaultHandler: Thread.UncaughtExceptionHandler?
) : Thread.UncaughtExceptionHandler {

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        // Log to crash reporting service
        CrashReporter.log(throwable)
        // Delegate to default handler (shows crash dialog)
        defaultHandler?.uncaughtException(thread, throwable)
    }
}

// In Application.onCreate()
Thread.setDefaultUncaughtExceptionHandler(
    CrashHandler(Thread.getDefaultUncaughtExceptionHandler())
)
```

For coroutines, set a global `CoroutineExceptionHandler` on your top-level scopes. For Flow, use the `catch` operator to handle upstream errors. The goal is that no exception crashes the app silently — every crash should be reported with enough context (stack trace, device info, app state) to debug it.

#### Q12: How do you handle errors in Flow chains?

Use the `catch` operator to handle upstream errors in a Flow. It catches exceptions from all operators above it in the chain but not from downstream collectors.

```kotlin
fun observeMessages(): Flow<List<Message>> {
    return messageDao.observeAll()
        .map { entities -> entities.map { it.toDomain() } }
        .catch { e ->
            emit(emptyList()) // Fallback value
            logger.error("Failed to observe messages", e)
        }
}
```

For retry logic, use `retry` or `retryWhen`:

```kotlin
repository.fetchData()
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000 * (attempt + 1))
            true // retry
        } else {
            false // give up
        }
    }
    .catch { emit(cachedData) }
    .collect { data -> updateUi(data) }
```

`catch` transforms the error into an emission or an empty flow. `retry` re-executes the upstream flow from scratch. Place `catch` after `retry` to handle errors that exhaust all retries.

#### Q13: What is the difference between Result type and sealed class error modeling?

`Result<T>` wraps a value or a `Throwable`. It works well for simple success/failure scenarios where you don't need typed errors. The API provides `map`, `fold`, `getOrNull` for chaining.

Sealed classes give you typed errors with custom data:

```kotlin
sealed class FetchError {
    data class HttpError(val code: Int, val body: String) : FetchError()
    data object NetworkError : FetchError()
    data class ParseError(val field: String) : FetchError()
}

// With Arrow's Either or a custom type
typealias FetchResult<T> = Either<FetchError, T>
```

Use `Result` when you just need to know "did it work or not" and the exception message is enough. Use sealed classes when different error types require different handling — like retrying on network errors but showing a login screen on authentication errors. Sealed classes also make exhaustive `when` checking possible, so the compiler reminds you when you add a new error type.

#### Q14: How do you handle timeout in coroutines?

Use `withTimeout` or `withTimeoutOrNull` to cancel a coroutine that takes too long. `withTimeout` throws `TimeoutCancellationException`. `withTimeoutOrNull` returns null instead.

```kotlin
suspend fun fetchWithTimeout(id: String): User? {
    return withTimeoutOrNull(5_000) {
        api.getUser(id)
    }
}
```

`withTimeoutOrNull` is generally safer because it doesn't throw. You handle the null case explicitly. For network calls, also set timeouts on the HTTP client itself — OkHttp's `connectTimeout`, `readTimeout`, and `writeTimeout`. The coroutine timeout and the HTTP timeout serve different purposes. The coroutine timeout covers the overall operation including retries and mapping. The HTTP timeout covers a single network call.

#### Q15: How do you design error states in a ViewModel using UDF?

In unidirectional data flow, error is just another state. Model your UI state as a sealed class that includes loading, success, and error variants.

```kotlin
sealed class ProfileUiState {
    data object Loading : ProfileUiState()
    data class Success(val user: User) : ProfileUiState()
    data class Error(val message: String, val canRetry: Boolean) : ProfileUiState()
}

class ProfileViewModel(
    private val repository: UserRepository
) : ViewModel() {

    private val _state = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    fun loadProfile(id: String) {
        viewModelScope.launch {
            _state.value = ProfileUiState.Loading
            repository.getUser(id)
                .onSuccess { _state.value = ProfileUiState.Success(it) }
                .onFailure { _state.value = ProfileUiState.Error(it.toAppError().userMessage, canRetry = true) }
        }
    }
}
```

The UI observes one state flow and renders based on the current variant. Error state includes a `canRetry` flag so the UI can show or hide a retry button. Transient errors like "failed to like a post" can be modeled as one-shot events through a `Channel` or `SharedFlow` instead of persistent state.

### Common Follow-ups

- How do you handle `CancellationException` properly in coroutines? (Never catch and swallow it. Always rethrow. Catching it breaks structured concurrency and prevents parent scope from knowing the child was cancelled)
- What is the difference between `launch` and `async` for error propagation? (`launch` propagates exceptions to the parent scope immediately. `async` stores the exception in the `Deferred` and throws it when you call `await()`)
- How do you retry a failed WorkManager task? (Return `Result.retry()` from `doWork()`. WorkManager applies the `BackoffPolicy` you set — linear or exponential — with configurable initial delay)
- What is the difference between `catch` and `onCompletion` in Flow? (`catch` handles upstream errors and can emit fallback values. `onCompletion` runs when the flow completes, whether normally or with an error, but can't emit new values)
- How do you handle errors in parallel coroutines? (Use `supervisorScope` to let independent operations fail independently. Wrap each `async` call in its own try-catch and collect partial results)
- How do you test error handling code? (Stub repositories to return failure results or throw exceptions. Assert that the ViewModel state transitions to the error state with the correct message)
