---
title: Error Handling Best Practices Guide
layout: post
categories: post
tags:
  - Kotlin
  - Best Practices
  - Architecture
---

Early in my Android career, my error handling strategy was simple: wrap everything in `try-catch`, log it, and move on. The app "worked" — until a payment silently failed because I swallowed a critical exception, or a user saw "java.net.SocketTimeoutException: timeout" as an error message. It took a production incident where user payments were being charged but the success screen never appeared (because I caught and discarded the result) before I fundamentally rethought how I handle errors.

The shift that changed everything for me was treating errors not as interruptions to handle, but as data to model. Once I started thinking about error states with the same rigor I applied to success states, my apps became dramatically more robust. Network calls fail. Servers return unexpected responses. Users have bad connectivity. These aren't edge cases — they're core scenarios that happen thousands of times a day in any production app.

## Sealed Classes Over Exceptions

Exceptions are for exceptional situations — out of memory, null pointer dereference, stack overflow. A network timeout, an invalid user input, a payment decline — these aren't exceptional. They're expected outcomes your code needs to handle. Using exceptions for control flow is like using a fire alarm as a doorbell.

Sealed classes give you a closed set of possible outcomes that the compiler can verify. When you use a `when` expression on a sealed class, the compiler tells you if you missed a case. With exceptions, you're guessing which ones might be thrown and hoping your catch block covers them all.

```kotlin
sealed interface PaymentResult {
    data class Success(val transactionId: String) : PaymentResult
    data class Declined(val reason: String) : PaymentResult
    data class NetworkError(val cause: Throwable) : PaymentResult
    data object InsufficientFunds : PaymentResult
}

// Caller is forced to handle every case
fun handlePayment(result: PaymentResult) {
    when (result) {
        is PaymentResult.Success -> showReceipt(result.transactionId)
        is PaymentResult.Declined -> showDeclineMessage(result.reason)
        is PaymentResult.NetworkError -> showRetryOption()
        PaymentResult.InsufficientFunds -> showTopUpPrompt()
    }
}
```

The reframe here is that error handling isn't about catching things that go wrong — it's about modeling all the things that can happen. When you shift from "happy path plus exceptions" to "a type that represents all outcomes," your code becomes self-documenting and your error handling becomes exhaustive by design.

## Never Catch Generic Exceptions

I've seen this pattern too many times: `catch (e: Exception) { log(e) }` wrapped around a function body like a safety blanket. It catches everything — including `CancellationException` in coroutines, which silently breaks structured concurrency. It catches `OutOfMemoryError` subtypes. It catches the `IllegalStateException` that would have told you about a real bug in development.

The rule is simple: catch the most specific exception you can. If you're making a network call, catch `IOException`. If you're parsing JSON, catch `JsonSyntaxException`. The only place where catching generic `Exception` is acceptable is at the top-level boundary — your `CoroutineExceptionHandler`, your `Thread.setDefaultUncaughtExceptionHandler`, or the outermost layer of your UI framework.

```kotlin
// Dangerous — swallows everything including bugs
suspend fun loadProfile(): UserProfile? {
    return try {
        api.fetchProfile()
    } catch (e: Exception) {
        null // CancellationException? Swallowed. NPE? Hidden.
    }
}

// Deliberate — catches what you expect, lets bugs crash
suspend fun loadProfile(): UserProfile? {
    return try {
        api.fetchProfile()
    } catch (e: IOException) {
        null // Network failed, return cached or null
    } catch (e: HttpException) {
        if (e.code() == 401) throw UnauthorizedException()
        null
    }
}
```

The honest tradeoff is that specific catch blocks are more verbose. You'll write more catch clauses, and occasionally a new exception type will slip through uncaught during development. But that's a feature, not a bug — an uncaught exception in development is a bug you find early rather than silently swallowing in production.

## Domain-Specific Error Types

Your repository shouldn't expose Retrofit's `HttpException` to your ViewModel. Your ViewModel shouldn't know that the database threw `SQLiteConstraintException`. Each layer should speak its own error language, and the boundaries between layers should translate errors into domain terms.

This isn't just clean architecture pedantry. When your ViewModel handles `HttpException`, it's coupled to your network library. If you swap Retrofit for Ktor, every ViewModel that catches `HttpException` breaks. When errors are domain-specific, the ViewModel handles `OrderError.OutOfStock` regardless of whether that came from HTTP, gRPC, or a local cache.

```kotlin
// Domain errors — no framework dependencies
sealed interface OrderError {
    data object OutOfStock : OrderError
    data object PaymentFailed : OrderError
    data class ValidationFailed(val field: String, val message: String) : OrderError
    data class Unknown(val cause: Throwable) : OrderError
}

// Repository maps framework exceptions to domain errors
class OrderRepository(private val api: OrderApi) {
    suspend fun placeOrder(order: Order): Result<OrderConfirmation, OrderError> {
        return try {
            val confirmation = api.submit(order)
            Result.success(confirmation)
        } catch (e: HttpException) {
            when (e.code()) {
                409 -> Result.failure(OrderError.OutOfStock)
                402 -> Result.failure(OrderError.PaymentFailed)
                else -> Result.failure(OrderError.Unknown(e))
            }
        } catch (e: IOException) {
            Result.failure(OrderError.Unknown(e))
        }
    }
}
```

The mapping code looks like boilerplate, and it is. But it's boilerplate that saves you when you refactor your data layer. I've migrated a codebase from Retrofit to Ktor and the only changes were in the repository layer — every ViewModel, use case, and UI component continued working without a single modification because they only knew about domain errors.

## Mapping Errors at Layer Boundaries

If every function in your codebase wraps its calls in try-catch and maps errors, you end up with error transformation code scattered everywhere. The pattern I've found most maintainable is to map errors exactly once — at the boundary between architectural layers.

Your data source catches framework exceptions and returns domain results. Your repository aggregates data sources and passes domain results through. Your use case might combine results and add business-level error logic. Your ViewModel transforms domain errors into UI-displayable state. Each layer does one transformation, and the chain is predictable.

```kotlin
// Data source: framework errors → domain result
class PaymentDataSource(private val api: PaymentApi) {
    suspend fun charge(request: ChargeRequest): Result<Receipt, PaymentError> {
        return try {
            Result.success(api.charge(request))
        } catch (e: IOException) {
            Result.failure(PaymentError.NetworkUnavailable)
        }
    }
}

// ViewModel: domain result → UI state
class CheckoutViewModel(private val paymentUseCase: ProcessPaymentUseCase) : ViewModel() {
    fun onCheckout(cart: Cart) {
        viewModelScope.launch {
            _state.value = CheckoutState.Processing
            when (val result = paymentUseCase(cart)) {
                is Result.Success -> _state.value = CheckoutState.Complete(result.value)
                is Result.Failure -> _state.value = when (result.error) {
                    PaymentError.NetworkUnavailable -> CheckoutState.Error("Check your connection")
                    PaymentError.CardDeclined -> CheckoutState.Error("Card was declined")
                    is PaymentError.Unknown -> CheckoutState.Error("Something went wrong")
                }
            }
        }
    }
}
```

The tradeoff is that errors pass through intermediate layers unchanged, which means your use case might feel like a pass-through for simple cases. That's fine. A thin use case that adds no error transformation is better than a use case that redundantly re-maps the same errors into identical types.

## Error State in Your UI State Sealed Class

Too many codebases separate their success state and error state into different LiveData or StateFlow objects. Then the UI has to observe both, coordinate them, and figure out which one is "current." This creates race conditions and impossible states — like showing a loading spinner and an error message simultaneously.

The better approach is a single sealed class that represents every possible state, including errors. The UI observes one stream and renders based on the current state. It's impossible to be loading and showing an error at the same time because they're different cases of the same type.

```kotlin
sealed interface ProfileUiState {
    data object Loading : ProfileUiState
    data class Loaded(val profile: UserProfile) : ProfileUiState
    data class Error(
        val message: String,
        val retryAction: (() -> Unit)? = null
    ) : ProfileUiState
    data object Empty : ProfileUiState
}

class ProfileViewModel(private val repository: ProfileRepository) : ViewModel() {
    private val _state = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    fun loadProfile(userId: String) {
        viewModelScope.launch {
            _state.value = ProfileUiState.Loading
            when (val result = repository.getProfile(userId)) {
                is Result.Success -> _state.value = ProfileUiState.Loaded(result.value)
                is Result.Failure -> _state.value = ProfileUiState.Error(
                    message = result.error.toUserMessage(),
                    retryAction = { loadProfile(userId) }
                )
            }
        }
    }
}
```

Notice the `retryAction` lambda embedded in the Error state. This makes the retry button in the UI trivial — it just calls the lambda. No need for the UI to know which function to call or what parameters to pass. The error state carries everything the UI needs to recover from it.

## Retry Strategies With Exponential Backoff

Retrying a failed network call immediately is almost always wrong. If the server returned a 503, hammering it again in the next millisecond won't help. Exponential backoff gives the server time to recover and prevents your app from contributing to the load that caused the failure.

But blind retry is equally bad. You should only retry transient errors — network timeouts, 5xx server errors, rate limits with `Retry-After` headers. Retrying a 404 or a 401 is pointless. Retrying a 400 validation error is worse than pointless — it will fail the same way every time.

```kotlin
suspend fun <T> retryWithBackoff(
    maxAttempts: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 10000,
    shouldRetry: (Throwable) -> Boolean = { it is IOException },
    block: suspend () -> T
): T {
    var currentDelay = initialDelayMs
    repeat(maxAttempts - 1) { attempt ->
        try {
            return block()
        } catch (e: Throwable) {
            if (!shouldRetry(e)) throw e
            delay(currentDelay)
            currentDelay = (currentDelay * 2).coerceAtMost(maxDelayMs)
        }
    }
    return block() // Last attempt — let it throw if it fails
}

// Usage
val profile = retryWithBackoff(
    maxAttempts = 3,
    shouldRetry = { it is IOException || (it is HttpException && it.code() in 500..599) }
) {
    api.fetchProfile(userId)
}
```

The last attempt runs without a catch so the exception propagates to the caller if all retries are exhausted. This is intentional — the caller should know that the operation ultimately failed, not get a silent null. One thing I learned the hard way: always add a maximum delay cap. Without `coerceAtMost`, exponential backoff can produce absurd delays — attempt 10 would wait over 17 minutes with a 1-second base.

## Logging Errors With Context

A stack trace tells you where the error happened. It doesn't tell you why. When you're debugging a crash report at 2 AM, the difference between "NullPointerException at UserRepository.kt:47" and "NullPointerException at UserRepository.kt:47 — userId=abc123, endpoint=/api/v2/profile, cached=false" is the difference between fixing it in 5 minutes and staring at the code for an hour.

Every error log should include the operation being performed, the input parameters (sanitized — never log tokens or passwords), and any relevant state that helps reproduce the issue. Structured logging makes this searchable and filterable in your crash reporting tool.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val logger: ErrorLogger
) {
    suspend fun updateProfile(userId: String, updates: ProfileUpdates): Result<Unit, ProfileError> {
        return try {
            api.updateProfile(userId, updates)
            Result.success(Unit)
        } catch (e: IOException) {
            logger.logError(
                tag = "UserRepository",
                operation = "updateProfile",
                error = e,
                context = mapOf(
                    "userId" to userId,
                    "updatedFields" to updates.changedFields.joinToString(),
                    "networkType" to networkMonitor.currentType
                )
            )
            Result.failure(ProfileError.NetworkUnavailable)
        }
    }
}
```

The tradeoff is that contextual logging adds code to every error path. It's tempting to skip it for "obvious" errors. But in production, no error is obvious — you don't have a debugger attached, you can't reproduce the user's exact state, and the stack trace alone rarely tells the full story. Invest in logging context once, and it pays for itself every time something breaks.

## Result Types That Carry the Error

Kotlin's built-in `Result<T>` type wraps a value or an exception. But it only tells you "something went wrong" — not what specifically went wrong in domain terms. For a robust error handling strategy, you want a Result type that carries your sealed error type, so the compiler can enforce exhaustive handling.

```kotlin
sealed interface Result<out T, out E> {
    data class Success<T>(val value: T) : Result<T, Nothing>
    data class Failure<E>(val error: E) : Result<Nothing, E>
}

// Extension functions to make it ergonomic
inline fun <T, E> Result<T, E>.onSuccess(action: (T) -> Unit): Result<T, E> {
    if (this is Result.Success) action(value)
    return this
}

inline fun <T, E> Result<T, E>.onFailure(action: (E) -> Unit): Result<T, E> {
    if (this is Result.Failure) action(error)
    return this
}

inline fun <T, E, R> Result<T, E>.map(transform: (T) -> R): Result<R, E> {
    return when (this) {
        is Result.Success -> Result.Success(transform(value))
        is Result.Failure -> this
    }
}
```

This is about 30 lines to set up, and it replaces scattered try-catch blocks across your entire codebase with typed, composable error handling. The `map` function lets you transform success values through a chain without unwrapping and re-wrapping at every step. Some teams use libraries like Arrow for this, which gives you a full functional error handling toolkit. I think a simple custom Result type is enough for most Android projects — Arrow is comprehensive but adds a learning curve that not every team member will be comfortable with.

## Never Show Raw Error Messages to Users

This sounds obvious, but I've seen apps display "java.net.SocketTimeoutException: timeout" to the user. Or worse, display the server's raw error JSON. Every error that reaches the UI should go through a mapping function that converts technical errors into human-readable, actionable messages.

The mapping should be centralized — one function that takes your domain error type and returns a user-facing string. This makes it easy to update copy, support localization, and ensure consistency. Don't scatter string resources across your ViewModels.

```kotlin
fun PaymentError.toUserMessage(): String {
    return when (this) {
        PaymentError.NetworkUnavailable ->
            "Unable to connect. Please check your internet and try again."
        PaymentError.CardDeclined ->
            "Your card was declined. Please try a different payment method."
        PaymentError.InsufficientFunds ->
            "Insufficient funds. Please add funds or use a different card."
        is PaymentError.ServerError ->
            "We're experiencing issues. Please try again in a few minutes."
        is PaymentError.Unknown ->
            "Something went wrong. Please try again."
    }
}
```

Notice the messages are actionable — they tell the user what to do, not just what happened. "Something went wrong" is a last resort for truly unknown errors. For every expected error type, the message should guide the user toward a resolution. The tradeoff is maintenance — every new error type requires a new user-facing message, and these messages need review from your UX/copy team, not just developers.

## Treating Errors as Data

This is the reframe that ties everything together. Most developers think of errors as interruptions to the normal flow — something that "shouldn't happen" that you need to catch and handle. But in a production app, errors are just another type of data flowing through your system.

Network calls fail. Servers return unexpected responses. Users have bad connectivity. Payments get declined. These aren't edge cases — they're core scenarios that happen thousands of times a day. When you design your architecture to treat errors as first-class data — with proper types, proper state representation, and proper user communication — your app becomes resilient by design rather than resilient by accident.

The shift from "exceptions as control flow" to "errors as data" changes how you think about every layer. Your repositories return Result types instead of throwing. Your ViewModels map results to states instead of catching exceptions. Your UI renders error states instead of showing toast messages. And your users get a consistent, informative experience when things go wrong — which, in a mobile app running on unpredictable networks, is most of the time.

Thanks for reading!
