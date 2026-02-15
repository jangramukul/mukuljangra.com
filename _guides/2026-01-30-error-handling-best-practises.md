---
title: Error Handling Best Practices Guide
layout: post
sequence: 75
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

## Kotlin's Built-in Result vs Custom Result Types

Kotlin ships with `Result<T>` and `runCatching` in the standard library. They're convenient for wrapping a try-catch into a functional chain — `runCatching { api.fetchProfile() }.map { it.toUiModel() }.getOrNull()`. The `fold`, `map`, `recover`, and `onFailure` extensions make it genuinely ergonomic for simple cases where you just need "it worked" or "it threw."

But here's the thing. `Result<T>` carries a `Throwable` on failure — not a typed domain error. You can check `result.exceptionOrNull()` and do an `is` cast, but you're back to the same guessing game as catch blocks. There's no compiler enforcement that you've handled every error type. The other limitation is that `Result` can't be used as a direct return type for Kotlin functions (the compiler forbids it to prevent confusion with coroutine internals), though this restriction doesn't apply when it's wrapped in another type or used as a property.

For anything beyond a quick one-off call, I use a custom two-type-parameter sealed interface that carries domain errors the compiler can verify.

```kotlin
sealed interface Result<out T, out E> {
    data class Success<T>(val value: T) : Result<T, Nothing>
    data class Failure<E>(val error: E) : Result<Nothing, E>
}

inline fun <T, E, R> Result<T, E>.map(transform: (T) -> R): Result<R, E> {
    return when (this) {
        is Result.Success -> Result.Success(transform(value))
        is Result.Failure -> this
    }
}

inline fun <T, E> Result<T, E>.onSuccess(action: (T) -> Unit): Result<T, E> {
    if (this is Result.Success) action(value)
    return this
}

inline fun <T, E> Result<T, E>.onFailure(action: (E) -> Unit): Result<T, E> {
    if (this is Result.Failure) action(error)
    return this
}
```

This is about 20 lines to set up, and it replaces scattered try-catch blocks across your entire codebase with typed, composable error handling. The `map` function lets you transform success values through a chain without unwrapping and re-wrapping at every step. Some teams use Arrow's `Either` for this, which gives you a full functional toolkit. I think a simple custom Result type is enough for most Android projects — Arrow is comprehensive but adds a learning curve that not every team member will be comfortable with. Use `runCatching` for quick utility calls, use your custom `Result<T, E>` for anything that crosses an architectural boundary.

## Error Propagation Through Layers

Knowing about domain errors and Result types is one thing. Seeing how an error actually flows from a network call all the way to the user's screen is where it clicks. The chain is: data source catches framework exceptions and produces a domain Result, the repository passes it through (or aggregates multiple sources), the use case applies business logic, the ViewModel maps to UI state, and the UI renders it. Each layer does exactly one transformation.

Here's a concrete end-to-end example for placing an order. The data source catches the raw `HttpException` and `IOException`. The repository adds nothing here — it delegates. The use case validates business rules before even calling the repository. The ViewModel maps the domain error to a user-facing string and a UI state. The key insight is that `HttpException` never leaks past the data source.

```kotlin
// Data source — catches framework exceptions
class OrderRemoteDataSource(private val api: OrderApi) {
    suspend fun submitOrder(order: Order): Result<OrderConfirmation, OrderError> {
        return try {
            Result.Success(api.submit(order))
        } catch (e: HttpException) {
            when (e.code()) {
                409 -> Result.Failure(OrderError.OutOfStock)
                402 -> Result.Failure(OrderError.PaymentDeclined)
                else -> Result.Failure(OrderError.Unknown(e))
            }
        } catch (e: IOException) {
            Result.Failure(OrderError.NetworkUnavailable)
        }
    }
}

// Use case — adds business validation before calling repository
class PlaceOrderUseCase(private val repository: OrderRepository) {
    suspend operator fun invoke(cart: Cart): Result<OrderConfirmation, OrderError> {
        if (cart.items.isEmpty()) {
            return Result.Failure(OrderError.EmptyCart)
        }
        return repository.placeOrder(cart.toOrder())
    }
}

// ViewModel — maps domain result to UI state
class CheckoutViewModel(private val placeOrder: PlaceOrderUseCase) : ViewModel() {
    private val _state = MutableStateFlow<CheckoutUiState>(CheckoutUiState.Idle)
    val state: StateFlow<CheckoutUiState> = _state.asStateFlow()

    fun onCheckout(cart: Cart) {
        viewModelScope.launch {
            _state.value = CheckoutUiState.Processing
            when (val result = placeOrder(cart)) {
                is Result.Success -> _state.value =
                    CheckoutUiState.Complete(result.value.orderId)
                is Result.Failure -> _state.value =
                    CheckoutUiState.Error(result.error.toUserMessage())
            }
        }
    }
}
```

The tradeoff is that errors pass through intermediate layers unchanged, which means your repository and use case might feel like pass-throughs for simple cases. That's fine. A thin layer that adds no error transformation is better than a layer that redundantly re-maps the same errors into identical types. The moment the use case needs to combine two data sources or add a validation check, the structure pays for itself.

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

## Error Handling in Flows

Suspend functions throw exceptions up the call stack, and you catch them with try-catch. Flows are different — errors propagate downstream through the stream, and uncaught exceptions cancel the collecting coroutine. This distinction matters because you can't just wrap a `flow.collect {}` in a try-catch and call it a day. Well, you can, but then your Flow stops collecting permanently after the first error.

The `catch` operator intercepts upstream exceptions before they reach the collector. It only catches errors from operators above it in the chain — anything thrown inside `collect` still propagates normally. This is the Flow equivalent of mapping errors at layer boundaries: your repository emits domain Results through the catch operator, and the ViewModel never sees the raw exception.

```kotlin
// Repository exposes a Flow of domain Results
class OrderRepository(private val api: OrderApi) {
    fun observeOrders(userId: String): Flow<Result<List<Order>, OrderError>> {
        return flow {
            while (currentCoroutineContext().isActive) {
                emit(Result.Success(api.fetchOrders(userId)))
                delay(30_000) // Poll every 30 seconds
            }
        }.catch { e ->
            when (e) {
                is IOException -> emit(Result.Failure(OrderError.NetworkUnavailable))
                is HttpException -> emit(Result.Failure(OrderError.Unknown(e)))
                else -> throw e // Don't swallow CancellationException
            }
        }
    }
}
```

For transient failures in long-lived Flows, `retry` and `retryWhen` restart the upstream flow after a failure instead of terminating the whole stream. This is more natural than wrapping a suspend-based retry loop around a Flow collection — the retry lives inside the stream itself. Use `retryWhen` when you need conditional logic, like only retrying `IOException` with exponential backoff and giving up after a certain number of attempts.

```kotlin
fun observeInventory(productId: String): Flow<InventoryStatus> {
    return flow {
        emit(api.getInventory(productId))
    }.retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000L * (attempt + 1)) // Linear backoff
            true // retry
        } else {
            false // give up
        }
    }.onCompletion { cause ->
        if (cause != null) {
            logger.logError("InventoryFlow", "observeInventory", cause,
                mapOf("productId" to productId))
        }
    }
}
```

The `onCompletion` operator runs when the Flow completes — either normally or due to an exception — making it the right place for cleanup and final logging. I think of it as the `finally` block for Flows.

## Retry With Exponential Backoff

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

## Never Show Raw Error Messages to Users

This sounds obvious, but I've seen apps display "java.net.SocketTimeoutException: timeout" to the user. Or worse, display the server's raw error JSON. Every error that reaches the UI should go through a mapping function that converts technical errors into human-readable, actionable messages.

The mapping should be centralized — one function that takes your domain error type and returns a user-facing string. This makes it easy to update copy, support localization, and ensure consistency. Don't scatter string resources across your ViewModels.

```kotlin
fun OrderError.toUserMessage(): String {
    return when (this) {
        OrderError.NetworkUnavailable ->
            "Unable to connect. Please check your internet and try again."
        OrderError.PaymentDeclined ->
            "Your payment was declined. Please try a different method."
        OrderError.OutOfStock ->
            "This item is currently out of stock."
        OrderError.EmptyCart ->
            "Your cart is empty. Add items before checking out."
        is OrderError.Unknown ->
            "Something went wrong. Please try again."
    }
}
```

Notice the messages are actionable — they tell the user what to do, not just what happened. "Something went wrong" is a last resort for truly unknown errors. For every expected error type, the message should guide the user toward a resolution. The tradeoff is maintenance — every new error type requires a new user-facing message, and these messages need review from your UX/copy team, not just developers.

## Treating Errors as Data

This is the reframe that ties everything together. Most developers think of errors as interruptions — something that "shouldn't happen" that you need to catch and handle. But in a production app, errors are just another type of data flowing through your system. Network calls fail. Payments get declined. Users have bad connectivity. These aren't edge cases — they're core scenarios that happen thousands of times a day.

When you design your architecture to treat errors as first-class data — with sealed types, proper state representation, typed Results, and centralized user messaging — your app becomes resilient by design rather than resilient by accident. Your data sources catch framework exceptions and produce domain Results. Your repositories pass those Results through. Your use cases add business-level validation. Your ViewModels map domain errors to UI states. Your Flows carry errors downstream instead of crashing the collector. And your users get a consistent, informative experience when things go wrong — which, in a mobile app running on unpredictable networks, is most of the time.

Thanks for reading!
