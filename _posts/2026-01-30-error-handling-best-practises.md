---
title: Error Handling Best Practices Guide
layout: post
categories: post
tags:
  - Kotlin
  - Best Practices
  - Architecture
---

Early in my Android career, my error handling strategy was basically this: wrap everything in `try-catch`, log it, and pretend nothing happened. The app "worked" — until a payment silently failed because I swallowed a critical exception, or a user saw "java.net.SocketTimeoutException: timeout" as an error message. Yeah, that actually happened.

But the real wake-up call? A production incident where user payments were being charged but the success screen never appeared. Why? Because I caught the result and discarded it. Money left the user's account, no confirmation screen, support tickets flooding in. That incident fundamentally changed how I think about errors.

Here's the shift that changed everything: I stopped treating errors as interruptions and started treating them as data. Think about it — once you model your error states with the same rigor you apply to success states, your apps become dramatically more robust. Network calls fail. Servers return unexpected responses. Users have bad connectivity. These aren't edge cases — they're core scenarios that happen thousands of times a day in any production app.

## Sealed Classes Over Exceptions

Imagine you're a mail carrier. You have a bag of letters, and each letter is clearly labeled — "delivered," "wrong address," "recipient moved," "mailbox full." You know exactly what happened with every single letter, and you can report each one accurately.

Now imagine instead, every time something goes wrong, the letter just explodes in your hand. No label, no explanation — just boom. That's what using exceptions for expected outcomes feels like.

Exceptions are for genuinely exceptional situations — out of memory, null pointer dereference, stack overflow. A network timeout, an invalid user input, a payment decline — these aren't exceptional. They're expected outcomes your code needs to handle. Using exceptions for control flow is like using a fire alarm as a doorbell.

Sealed classes give you a closed set of possible outcomes that the compiler can verify. When you use a `when` expression on a sealed class, the compiler tells you if you missed a case. With exceptions? You're guessing which ones might be thrown and hoping your catch block covers them all.

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

See what happened there? The caller can't ignore any case. Try removing one of those branches — the compiler will yell at you. That's the whole point.

> **💡 The "aha" moment:** Error handling isn't about catching things that go wrong — it's about modeling all the things that can happen. When you shift from "happy path plus exceptions" to "a type that represents all outcomes," your code becomes self-documenting and your error handling becomes exhaustive by design.

## Never Catch Generic Exceptions

I've seen this pattern way too many times: `catch (e: Exception) { log(e) }` wrapped around a function body like a security blanket. It feels safe. It feels responsible. It is neither.

Here's what that innocent-looking catch block actually swallows: `CancellationException` in coroutines (which silently breaks structured concurrency), `OutOfMemoryError` subtypes, and the `IllegalStateException` that would have told you about a real bug during development. Your safety blanket is actually smothering your code.

The rule is simple: catch the most specific exception you can. Making a network call? Catch `IOException`. Parsing JSON? Catch `JsonSyntaxException`. The only place where catching generic `Exception` is acceptable is at the top-level boundary — your `CoroutineExceptionHandler`, your `Thread.setDefaultUncaughtExceptionHandler`, or the outermost layer of your UI framework.

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

The honest tradeoff? Specific catch blocks are more verbose. You'll write more catch clauses, and occasionally a new exception type will slip through uncaught during development. But that's a feature, not a bug — an uncaught exception in development is a bug you find early rather than silently swallowing in production.

## Domain-Specific Error Types

Your repository shouldn't expose Retrofit's `HttpException` to your ViewModel. Your ViewModel shouldn't know that the database threw `SQLiteConstraintException`. Each layer should speak its own error language, and the boundaries between layers should translate errors into domain terms.

Think of it like international shipping. A package crosses borders, and at each border crossing, the paperwork gets translated into the local language. The customs officer in France doesn't need to read Japanese — they need the information in French. Same idea. Your ViewModel doesn't need to read Retrofit — it needs the information in domain language.

This isn't just clean architecture pedantry. When your ViewModel handles `HttpException`, it's coupled to your network library. Swap Retrofit for Ktor, and every ViewModel that catches `HttpException` breaks. When errors are domain-specific, the ViewModel handles `OrderError.OutOfStock` regardless of whether that came from HTTP, gRPC, or a local cache.

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

Yeah, the mapping code looks like boilerplate. Because it is. But it's boilerplate that saves you when you refactor your data layer. I've migrated a codebase from Retrofit to Ktor and the only changes were in the repository layer — every ViewModel, use case, and UI component continued working without a single modification because they only knew about domain errors. That migration would have been a nightmare without this boundary.

## Kotlin's Built-in Result vs Custom Result Types

Kotlin ships with `Result<T>` and `runCatching` in the standard library. They're convenient for wrapping a try-catch into a functional chain — `runCatching { api.fetchProfile() }.map { it.toUiModel() }.getOrNull()`. The `fold`, `map`, `recover`, and `onFailure` extensions make it genuinely ergonomic for simple cases where you just need "it worked" or "it threw."

But here's the thing. `Result<T>` carries a `Throwable` on failure — not a typed domain error. You can check `result.exceptionOrNull()` and do an `is` cast, but you're back to the same guessing game as catch blocks. There's no compiler enforcement that you've handled every error type. The other limitation is that `Result` can't be used as a direct return type for Kotlin functions (the compiler forbids it to prevent confusion with coroutine internals), though this restriction doesn't apply when it's wrapped in another type or used as a property.

So what do we do? For anything beyond a quick one-off call, I use a custom two-type-parameter sealed interface that carries domain errors the compiler can verify.

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

About 20 lines. That's it. And it replaces scattered try-catch blocks across your entire codebase with typed, composable error handling. The `map` function lets you transform success values through a chain without unwrapping and re-wrapping at every step.

Some teams use Arrow's `Either` for this, which gives you a full functional toolkit. I think a simple custom Result type is enough for most Android projects — Arrow is comprehensive but adds a learning curve that not every team member will be comfortable with. Use `runCatching` for quick utility calls, use your custom `Result<T, E>` for anything that crosses an architectural boundary.

## Error Propagation Through Layers

Knowing about domain errors and Result types is one thing. Seeing how an error actually flows from a network call all the way to the user's screen — that's where it clicks.

Imagine a relay race. The baton starts at the data source, gets passed to the repository, then to the use case, then to the ViewModel, and finally to the UI. Each runner doesn't change the baton itself — they just carry it forward and maybe add their own contribution along the way. The chain is: data source catches framework exceptions and produces a domain Result, the repository passes it through (or aggregates multiple sources), the use case applies business logic, the ViewModel maps to UI state, and the UI renders it. Each layer does exactly one transformation.

Here's a concrete end-to-end example for placing an order. Watch how `HttpException` enters at the data source and never leaks past it. The use case validates business rules before even calling the repository. The ViewModel maps the domain error to a user-facing string and a UI state.

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

Now, you might look at this and think, "But the repository and use case are basically pass-throughs for simple cases." And you'd be right. That's fine. A thin layer that adds no error transformation is better than a layer that redundantly re-maps the same errors into identical types. The moment the use case needs to combine two data sources or add a validation check, the structure pays for itself.

## Error State in Your UI State Sealed Class

Here's a pattern I see in way too many codebases: separate `LiveData` or `StateFlow` objects for success state and error state. The UI observes both, coordinates them, and tries to figure out which one is "current."

What could go wrong? Everything. You end up with race conditions and impossible states — like showing a loading spinner and an error message at the same time. Your UI is playing whack-a-mole with two streams that don't know about each other.

The fix is a single sealed class that represents every possible state, including errors. The UI observes one stream and renders based on the current state. It's physically impossible to be loading and showing an error at the same time because they're different cases of the same type.

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

Notice the `retryAction` lambda embedded in the Error state. This makes the retry button in the UI trivial — it just calls the lambda. No need for the UI to know which function to call or what parameters to pass. The error state carries everything the UI needs to recover from it. The state is self-contained.

> **🧠 Think about it:** What happens in your current codebase if the loading state and error state are in separate StateFlows and both emit at the same time? Which one does the UI trust?

## Error Handling in Flows

Suspend functions and Flows handle errors very differently, and mixing them up will bite you.

With a suspend function, exceptions travel up the call stack, and you catch them with try-catch. Simple. Flows are a different animal — errors propagate downstream through the stream, and uncaught exceptions cancel the collecting coroutine. You can't just wrap a `flow.collect {}` in a try-catch and call it a day. Well, you can, but then your Flow stops collecting permanently after the first error. Gone. Done. No more updates.

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

Imagine a restaurant kitchen during rush hour. An order gets messed up. What do you do — immediately shout the same order again? No. You give the kitchen a moment to clear the backlog, then resubmit. Retrying a failed network call immediately is the same mistake. If the server returned a 503, hammering it again in the next millisecond won't help — you're just adding to the pile.

Exponential backoff gives the server time to recover and prevents your app from contributing to the load that caused the failure in the first place.

But blind retry is equally bad. You should only retry transient errors — network timeouts, 5xx server errors, rate limits with `Retry-After` headers. Retrying a 404 or a 401 is pointless. Retrying a 400 validation error? Worse than pointless — it will fail the same way every time, forever.

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

The last attempt runs without a catch so the exception propagates to the caller if all retries are exhausted. This is intentional — the caller should know that the operation ultimately failed, not get a silent null. One thing I learned the hard way: always add a maximum delay cap. Without `coerceAtMost`, exponential backoff can produce absurd delays — attempt 10 would wait over 17 minutes with a 1-second base. Your user is not going to wait 17 minutes.

> **🔥 Real talk:** I once shipped a retry mechanism without a max delay cap. A flaky endpoint caused the retry delay to grow so large that the coroutine was effectively suspended for the rest of the app session. The "retry" was technically happening — just on a timeline that would outlast the user's patience by about 16 minutes.

## Logging Errors With Context

Picture this: it's 2 AM, your phone buzzes with a crash alert, and you open the report. You see "NullPointerException at UserRepository.kt:47." Cool. Now what? You stare at line 47. You look at the function. You have no idea what input caused this, what state the app was in, or what the user was trying to do.

Now imagine the log says "NullPointerException at UserRepository.kt:47 — userId=abc123, endpoint=/api/v2/profile, cached=false." That's the difference between fixing it in 5 minutes and staring at the code for an hour.

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

This sounds obvious, but I've seen apps display "java.net.SocketTimeoutException: timeout" to the user. Or worse, display the server's raw error JSON. Imagine your mom using your app and seeing a stack trace. That's not an error message — that's a cry for help from your codebase.

Every error that reaches the UI should go through a mapping function that converts technical errors into human-readable, actionable messages. The mapping should be centralized — one function that takes your domain error type and returns a user-facing string. This makes it easy to update copy, support localization, and ensure consistency. Don't scatter string resources across your ViewModels.

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

> **⚡ Quick check:** Look at your current project. Is there any place where a raw exception message could leak through to the UI? Search for `.message` on a `Throwable` being passed directly to a UI component. You might be surprised.

## Treating Errors as Data

This is the reframe that ties everything together. Most developers think of errors as interruptions — something that "shouldn't happen" that you need to catch and handle. But in a production app, errors are just another type of data flowing through your system. Network calls fail. Payments get declined. Users have bad connectivity. These aren't edge cases — they're the Tuesday afternoon of your app's life.

When you design your architecture to treat errors as first-class data — with sealed types, proper state representation, typed Results, and centralized user messaging — your app becomes resilient by design rather than resilient by accident. Your data sources catch framework exceptions and produce domain Results. Your repositories pass those Results through. Your use cases add business-level validation. Your ViewModels map domain errors to UI states. Your Flows carry errors downstream instead of crashing the collector. And your users get a consistent, informative experience when things go wrong — which, in a mobile app running on unpredictable networks, is most of the time.

Thanks for reading!
