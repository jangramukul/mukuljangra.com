---
title: "Error Handling & Resilience Patterns"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 7
sequence: 39
description: "Error handling questions test whether you think beyond the happy path."
---

## Error Handling & Resilience Patterns

Error handling shows whether you think beyond the happy path. These questions cover modeling errors cleanly, handling failures in coroutines, and building apps that degrade gracefully.

#### How do you model errors using sealed classes?

I use sealed classes to define a closed set of error types. The compiler enforces exhaustive `when` expressions, so I can't forget to handle a case.

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

#### What is the difference between exceptions and errors in Kotlin?

In Kotlin, all exceptions are unchecked — there's no `throws` clause like Java. `Exception` represents recoverable conditions like network failures or invalid input. `Error` represents unrecoverable problems like `OutOfMemoryError` or `StackOverflowError` that I generally shouldn't catch.

The Kotlin philosophy is that exceptions should be used for logical errors (bugs), not for expected conditions. If a network call can fail, I return a `Result` or sealed class that models success and failure as regular values instead of throwing and catching.

#### What is Kotlin's built-in Result type?

`Result<T>` is a value class that wraps either a successful value or a `Throwable`. It provides `getOrNull()`, `getOrDefault()`, `getOrElse()`, `map()`, `fold()`, and `onSuccess()`/`onFailure()`.

```kotlin
suspend fun fetchUser(id: String): Result<User> {
    return runCatching {
        api.getUser(id)
    }
}

fetchUser("123")
    .onSuccess { user -> showProfile(user) }
    .onFailure { error -> showError(error.message) }
```

`runCatching` wraps any code block and catches exceptions into a `Result`. The limitation is that `Result` only carries a `Throwable`, so I can't model typed errors like "not found" vs "unauthorized" without inspecting the exception class. For richer error modeling, sealed classes are more expressive.

#### How does try-catch work with coroutines?

`try-catch` works normally inside a `suspend` function. I wrap the suspending call and catch exceptions. The key thing — `CancellationException` should never be caught and swallowed. If I catch `Exception` broadly, I rethrow `CancellationException` to keep structured concurrency working.

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

`runCatching` does catch `CancellationException`, which is a problem. In coroutine-heavy code, some teams write a custom `runSuspendCatching` that rethrows it.

#### What is the difference between coroutineScope and supervisorScope?

`coroutineScope` cancels all children if any child fails. If one child throws, every sibling is cancelled and the parent rethrows the exception.

`supervisorScope` lets children fail independently. If one child throws, the others keep running.

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

I use `supervisorScope` when child operations are independent — like loading different sections of a dashboard where one failure shouldn't block the others. I use `coroutineScope` when the children are related and partial results are useless.

#### What is CoroutineExceptionHandler?

`CoroutineExceptionHandler` is a last-resort handler for uncaught exceptions in coroutines. It only works on root coroutines launched with `launch` (not `async`).

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    logger.error("Unhandled: ${exception.message}")
    crashReporter.report(exception)
}

viewModelScope.launch(handler) {
    repository.syncData()
}
```

It doesn't recover the coroutine — the coroutine is already failed. I use it for logging and crash reporting at the top level. It's not a replacement for proper error handling inside business logic.

#### How do you handle errors in Flow chains?

I use the `catch` operator. It catches exceptions from all operators above it in the chain but not from downstream collectors.

```kotlin
fun observeMessages(): Flow<List<Message>> {
    return messageDao.observeAll()
        .map { entities -> entities.map { it.toDomain() } }
        .catch { e ->
            emit(emptyList())
            logger.error("Failed to observe messages", e)
        }
}
```

For retry logic, I use `retry` or `retryWhen`:

```kotlin
repository.fetchData()
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000 * (attempt + 1))
            true
        } else {
            false
        }
    }
    .catch { emit(cachedData) }
    .collect { data -> updateUi(data) }
```

`catch` transforms the error into an emission or an empty flow. `retry` re-executes the upstream flow from scratch. I place `catch` after `retry` to handle errors that exhaust all retries.

#### How do you design error states in a ViewModel using UDF?

In unidirectional data flow, error is just another state. I model the UI state as a sealed class with loading, success, and error variants.

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
                .onFailure {
                    _state.value = ProfileUiState.Error(
                        it.toAppError().userMessage, canRetry = true
                    )
                }
        }
    }
}
```

The UI observes one state flow and renders based on the current variant. I include a `canRetry` flag so the UI can show or hide a retry button. Transient errors like "failed to like a post" go through a `Channel` or `SharedFlow` as one-shot events instead of persistent state.

#### How do you map network errors to user-facing messages?

I don't show raw exceptions to users. I map technical errors to meaningful messages at the repository or use case layer.

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

The ViewModel should receive domain-level errors, not raw HTTP exceptions. This also makes the ViewModel testable without knowing about Retrofit or OkHttp.

#### How do you handle timeout in coroutines?

I use `withTimeout` or `withTimeoutOrNull`. `withTimeout` throws `TimeoutCancellationException`. `withTimeoutOrNull` returns null instead.

```kotlin
suspend fun fetchWithTimeout(id: String): User? {
    return withTimeoutOrNull(5_000) {
        api.getUser(id)
    }
}
```

`withTimeoutOrNull` is safer because it doesn't throw. For network calls, I also set timeouts on the HTTP client — OkHttp's `connectTimeout`, `readTimeout`, and `writeTimeout`. The coroutine timeout covers the overall operation including retries and mapping. The HTTP timeout covers a single network call.

#### What is the difference between Result type and sealed class error modeling?

`Result<T>` wraps a value or a `Throwable`. It works well for simple success/failure scenarios where I don't need typed errors.

Sealed classes give typed errors with custom data:

```kotlin
sealed class FetchError {
    data class HttpError(val code: Int, val body: String) : FetchError()
    data object NetworkError : FetchError()
    data class ParseError(val field: String) : FetchError()
}
```

I use `Result` when I just need to know "did it work or not" and the exception message is enough. I use sealed classes when different error types require different handling — like retrying on network errors but showing a login screen on auth errors. Sealed classes also make exhaustive `when` checking possible, so the compiler reminds me when I add a new error type.

#### What is exponential backoff and when do you use it?

Exponential backoff increases the delay between retry attempts. First retry after 1 second, second after 2 seconds, third after 4 seconds.

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
    return block()
}
```

I add jitter (random variation) to the delay so multiple clients don't retry at the same instant. I use exponential backoff for network retries, WorkManager retry policies, and any operation against a shared resource that can be temporarily unavailable.

#### What is the circuit breaker pattern?

Circuit breaker prevents an app from repeatedly calling a service that's down. It has three states:

- **Closed** — requests pass through normally. Failures are counted.
- **Open** — after a threshold of failures, the circuit opens and all requests fail immediately without attempting the call.
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

This saves battery and network resources on mobile. Instead of retrying a dead server every few seconds, the circuit breaker fails fast and tries again later. I combine it with local caching to serve stale data while the circuit is open.

#### How do you implement graceful degradation in an Android app?

Graceful degradation means the app still works when parts of the system fail. Instead of showing an error screen, I show what I can with what I have.

- **Offline cache** — when the network fails, I serve data from Room or DataStore. The user sees stale data with a "last updated" indicator instead of an empty screen.
- **Feature fallback** — if a recommendation engine is down, I show a default list. If image loading fails, I show a placeholder.
- **Partial loading** — if one API in a dashboard fails, I show the sections that succeeded and a retry button for the failed one. `supervisorScope` lets me load sections independently.
- **Progressive enhancement** — I design the core experience to work offline. Network-dependent features are additions, not requirements.

The key is deciding what's critical and what's optional. A chat app must show existing messages offline. It can defer sending new messages until connectivity returns.

#### How do you handle global error handling and crash reporting?

I set up a `Thread.UncaughtExceptionHandler` to catch crashes that escape all other handlers. I integrate with a crash reporting tool like Firebase Crashlytics or Sentry.

```kotlin
class CrashHandler(
    private val defaultHandler: Thread.UncaughtExceptionHandler?
) : Thread.UncaughtExceptionHandler {

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        CrashReporter.log(throwable)
        defaultHandler?.uncaughtException(thread, throwable)
    }
}

// In Application.onCreate()
Thread.setDefaultUncaughtExceptionHandler(
    CrashHandler(Thread.getDefaultUncaughtExceptionHandler())
)
```

For coroutines, I set a global `CoroutineExceptionHandler` on top-level scopes. For Flow, I use the `catch` operator. The goal is that no exception crashes the app silently — every crash should be reported with enough context to debug it.

### Common Follow-ups

- How do you handle `CancellationException` properly in coroutines? (Never catch and swallow it. Always rethrow. Catching it breaks structured concurrency and prevents the parent scope from knowing the child was cancelled)
- What is the difference between `launch` and `async` for error propagation? (`launch` propagates exceptions to the parent scope immediately. `async` stores the exception in the `Deferred` and throws it when you call `await()`)
- How do you retry a failed WorkManager task? (Return `Result.retry()` from `doWork()`. WorkManager applies the `BackoffPolicy` you set — linear or exponential — with configurable initial delay)
- What is the difference between `catch` and `onCompletion` in Flow? (`catch` handles upstream errors and can emit fallback values. `onCompletion` runs when the flow completes, whether normally or with an error, but can't emit new values)
- How do you handle errors in parallel coroutines? (Use `supervisorScope` to let independent operations fail independently. Wrap each `async` call in its own try-catch and collect partial results)
- How do you test error handling code? (Stub repositories to return failure results or throw exceptions. Assert that the ViewModel state transitions to the error state with the correct message)
