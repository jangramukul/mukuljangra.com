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

Here's the thing about error handling questions in interviews — they separate the engineers who only think about the happy path from the ones who've actually been woken up at 3 AM by a crash. These questions cover modeling errors cleanly, handling failures in coroutines, and building apps that keep working even when the world is on fire.

#### How do you model errors using sealed classes?

Think of sealed classes like a menu at a restaurant — the kitchen can only serve what's on the menu, and the waiter has to know how to handle every item. I use sealed classes to define a closed set of error types, and the compiler enforces exhaustive `when` expressions, so I literally can't forget to handle a case.

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

But wait — why not just throw exceptions? Because with exceptions, nothing in the function signature tells you what can go wrong. Sealed classes make errors explicit in the return type, so the caller is forced to deal with every case. No surprises.

#### What is the difference between exceptions and errors in Kotlin?

In Kotlin, all exceptions are unchecked — there's no `throws` clause like Java. `Exception` is for recoverable stuff like network failures or bad input. `Error` is for catastrophic problems like `OutOfMemoryError` or `StackOverflowError` that you generally shouldn't even try to catch.

Here's the Kotlin philosophy: exceptions should be for actual bugs, not for things you expect to happen. A network call failing isn't exceptional — it's Tuesday. So instead of throwing and catching, I return a `Result` or sealed class that models success and failure as regular values.

#### What is Kotlin's built-in Result type?

`Result<T>` is a value class that wraps either a successful value or a `Throwable`. It gives you `getOrNull()`, `getOrDefault()`, `getOrElse()`, `map()`, `fold()`, and `onSuccess()`/`onFailure()`.

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

`runCatching` wraps any code block and catches exceptions into a `Result`. The limitation? `Result` only carries a `Throwable`, so I can't model typed errors like "not found" vs "unauthorized" without inspecting the exception class. For richer error modeling, sealed classes are the way to go.

> **🧠 Think about it:** If `runCatching` catches all exceptions, what happens when a coroutine gets cancelled inside it? Is that a problem?

#### How does try-catch work with coroutines?

`try-catch` works normally inside a `suspend` function — wrap the call, catch exceptions, done. But here's the critical thing that trips people up: `CancellationException` should never be caught and swallowed. It's like intercepting a fire alarm and saying "nah, we're fine." If I catch `Exception` broadly, I always rethrow `CancellationException` to keep structured concurrency working.

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

And yes, `runCatching` does catch `CancellationException`, which is a real problem. In coroutine-heavy code, some teams write a custom `runSuspendCatching` that rethrows it.

#### What is the difference between coroutineScope and supervisorScope?

Think of it like a road trip with friends. `coroutineScope` is like saying "if one person's car breaks down, everyone pulls over and the trip is cancelled." `supervisorScope` is "if one person's car breaks down, the rest keep driving."

`coroutineScope` cancels all children if any child fails. `supervisorScope` lets children fail independently.

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

`CoroutineExceptionHandler` is basically the safety net under the trapeze — it's the last-resort handler for uncaught exceptions in coroutines. It only works on root coroutines launched with `launch` (not `async`).

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    logger.error("Unhandled: ${exception.message}")
    crashReporter.report(exception)
}

viewModelScope.launch(handler) {
    repository.syncData()
}
```

Here's the thing though — it doesn't recover the coroutine. The coroutine is already dead. I use it for logging and crash reporting at the top level. It's not a replacement for proper error handling inside business logic.

> **🧠 Think about it:** Why does `CoroutineExceptionHandler` work with `launch` but not `async`? What does `async` do differently with its exceptions?

#### How do you handle errors in Flow chains?

I use the `catch` operator. It catches exceptions from all operators above it in the chain but not from downstream collectors. Think of it like a filter in a water pipe — it catches debris flowing down from above, but anything below it is on its own.

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

In unidirectional data flow, error is just another state — not some special side channel. I model the UI state as a sealed class with loading, success, and error variants. The UI doesn't need to know what went wrong technically, it just needs to know what to show.

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

The UI observes one state flow and renders based on the current variant. I include a `canRetry` flag so the UI can show or hide a retry button. Now, transient errors like "failed to like a post" are different — those go through a `Channel` or `SharedFlow` as one-shot events instead of persistent state.

#### How do you map network errors to user-facing messages?

Nobody wants to see `java.net.UnknownHostException` on their screen. I map technical errors to human-readable messages at the repository or use case layer.

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

The ViewModel should receive domain-level errors, not raw HTTP exceptions. This also makes the ViewModel testable without knowing anything about Retrofit or OkHttp.

#### How do you handle timeout in coroutines?

I use `withTimeout` or `withTimeoutOrNull`. `withTimeout` throws `TimeoutCancellationException`. `withTimeoutOrNull` returns null instead — like knocking on a door and walking away if nobody answers versus knocking and throwing a rock through the window.

```kotlin
suspend fun fetchWithTimeout(id: String): User? {
    return withTimeoutOrNull(5_000) {
        api.getUser(id)
    }
}
```

`withTimeoutOrNull` is safer because it doesn't throw. But here's something people miss — for network calls, I also set timeouts on the HTTP client itself with OkHttp's `connectTimeout`, `readTimeout`, and `writeTimeout`. The coroutine timeout covers the overall operation including retries and mapping. The HTTP timeout covers a single network call. Two different layers, two different jobs.

#### What is the difference between Result type and sealed class error modeling?

`Result<T>` wraps a value or a `Throwable`. It's like a yes/no answer — did it work or didn't it?

Sealed classes give typed errors with custom data — more like a detailed incident report:

```kotlin
sealed class FetchError {
    data class HttpError(val code: Int, val body: String) : FetchError()
    data object NetworkError : FetchError()
    data class ParseError(val field: String) : FetchError()
}
```

I use `Result` when I just need "did it work or not" and the exception message is enough. I use sealed classes when different error types require different handling — like retrying on network errors but showing a login screen on auth errors. Sealed classes also give you exhaustive `when` checking, so the compiler reminds you when you add a new error type and forget to handle it.

#### What is exponential backoff and when do you use it?

Imagine a coffee shop is packed and you can't get a seat. You could check back every 30 seconds and annoy everyone, or you could wait 1 minute, then 2 minutes, then 4 minutes. That's exponential backoff — increasing the delay between retry attempts so you don't hammer a struggling service.

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

I also add jitter (random variation) to the delay so multiple clients don't all retry at the exact same instant and dogpile the server. I use exponential backoff for network retries, WorkManager retry policies, and any operation against a shared resource that can be temporarily unavailable.

> **🧠 Think about it:** If 10,000 clients all lose connection at the same time and retry with the same exponential backoff schedule, what happens? Why does jitter matter?

#### What is the circuit breaker pattern?

Circuit breaker is like an electrical circuit breaker in your house. When too many appliances are drawing power and things overheat, the breaker trips and cuts off electricity. You flip it back on later to test if things are okay. Same idea — it prevents your app from repeatedly calling a service that's clearly down.

It has three states:

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

Graceful degradation means the app still works when parts of the system fail. Instead of showing an error screen, I show what I can with what I have. It's like a restaurant that runs out of one ingredient — they adjust the menu instead of closing the kitchen.

- **Offline cache** — when the network fails, I serve data from Room or DataStore. The user sees stale data with a "last updated" indicator instead of an empty screen.
- **Feature fallback** — if a recommendation engine is down, I show a default list. If image loading fails, I show a placeholder.
- **Partial loading** — if one API in a dashboard fails, I show the sections that succeeded and a retry button for the failed one. `supervisorScope` lets me load sections independently.
- **Progressive enhancement** — I design the core experience to work offline. Network-dependent features are additions, not requirements.

The key is deciding what's critical and what's optional. A chat app must show existing messages offline. It can defer sending new messages until connectivity returns.

#### How do you handle global error handling and crash reporting?

I set up a `Thread.UncaughtExceptionHandler` to catch crashes that escape all other handlers — it's the last line of defense before the app just dies. I integrate with a crash reporting tool like Firebase Crashlytics or Sentry.

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

For coroutines, I set a global `CoroutineExceptionHandler` on top-level scopes. For Flow, I use the `catch` operator. The goal is simple — no exception should crash the app silently. Every crash gets reported with enough context to actually debug it.

### Common Follow-ups

- How do you handle `CancellationException` properly in coroutines? (Never catch and swallow it. Always rethrow. Catching it breaks structured concurrency and prevents the parent scope from knowing the child was cancelled)
- What is the difference between `launch` and `async` for error propagation? (`launch` propagates exceptions to the parent scope immediately. `async` stores the exception in the `Deferred` and throws it when you call `await()`)
- How do you retry a failed WorkManager task? (Return `Result.retry()` from `doWork()`. WorkManager applies the `BackoffPolicy` you set — linear or exponential — with configurable initial delay)
- What is the difference between `catch` and `onCompletion` in Flow? (`catch` handles upstream errors and can emit fallback values. `onCompletion` runs when the flow completes, whether normally or with an error, but can't emit new values)
- How do you handle errors in parallel coroutines? (Use `supervisorScope` to let independent operations fail independently. Wrap each `async` call in its own try-catch and collect partial results)
- How do you test error handling code? (Stub repositories to return failure results or throw exceptions. Assert that the ViewModel state transitions to the error state with the correct message)
