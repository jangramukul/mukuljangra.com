---
title: Kotlin's Rich Error Handling — Beyond Exceptions
layout: post
categories: post
tags:
  - Kotlin
  - Best Practices
---

A few months back, I was reviewing a pull request where every repository function was wrapped in `try-catch(e: Exception)` with a generic error message. The developer's reasoning was simple — "this catches everything, so nothing crashes." And they were right. Nothing crashed. But nothing worked correctly either. A `CancellationException` from a coroutine scope teardown was being swallowed, which meant navigating away from a screen didn't actually cancel the in-flight network request. The app kept running stale work in the background, burning battery and occasionally overwriting fresh data with stale responses.

That experience crystallized something I'd been thinking about for a while: exceptions in Kotlin are fundamentally the wrong tool for most error handling. They were designed for truly exceptional conditions — running out of memory, a corrupted file system, a null pointer dereference. But somewhere along the way, we started using them for completely expected outcomes like network timeouts, validation failures, and "user not found" scenarios. The result is code where the error contract is invisible, the performance cost is hidden, and structured concurrency breaks silently.

## The Real Cost of Exceptions

Here's something most developers don't think about: throwing an exception in Kotlin (and on the JVM generally) is expensive. Not "a few nanoseconds" expensive — "capture the entire stack trace" expensive. When you throw an `IOException`, the JVM walks the call stack frame by frame, records every method name, file name, and line number, and stores it all in the exception object. In a typical Android app with deep call stacks (Activity → Fragment → ViewModel → UseCase → Repository → DataSource → Retrofit interceptor chain), that's easily 30-40 stack frames being captured per exception.

For a single network failure, this is negligible. But in a real production scenario — a user on a flaky connection retrying requests, a search-as-you-type feature where validation failures happen on every keystroke, a batch sync operation processing hundreds of items — those exception allocations add up. I measured this once on a sync service that processed ~500 items: switching from exception-based error reporting to sealed class results cut the GC pressure by roughly 15% during the sync window. The stack trace captures were the dominant allocation.

The bigger problem isn't performance though — it's visibility. In Kotlin, nothing in a function's signature tells you what exceptions it might throw. Unlike Java's checked exceptions (which had their own problems), Kotlin functions just... throw. The caller has to read the implementation, check the documentation (if it exists), or discover the exception in production. This is the fundamental contract problem: exceptions make error paths invisible at the call site.

## Sealed Class Error Hierarchies

The alternative is to make errors visible in the type system. Instead of throwing an exception and hoping the caller catches it, you return a type that explicitly represents all possible outcomes. Sealed classes (or sealed interfaces) are perfect for this because the compiler can verify exhaustive handling.

```kotlin
sealed interface AuthResult {
    data class Authenticated(val session: UserSession) : AuthResult
    data class InvalidCredentials(val attemptsRemaining: Int) : AuthResult
    data object AccountLocked : AuthResult
    data class NetworkFailure(val cause: IOException) : AuthResult
}

fun handleAuth(result: AuthResult) {
    when (result) {
        is AuthResult.Authenticated -> navigateToHome(result.session)
        is AuthResult.InvalidCredentials -> showError(
            "Invalid credentials. ${result.attemptsRemaining} attempts remaining."
        )
        AuthResult.AccountLocked -> showAccountLockedScreen()
        is AuthResult.NetworkFailure -> showRetryOption()
    }
    // No else branch needed — compiler ensures exhaustive handling
}
```

The reframe here is subtle but important: **errors aren't things that interrupt your program flow — they're data your program needs to process.** A failed login attempt isn't an exception to the normal flow. It IS the normal flow for roughly 10-20% of login attempts in any production app. Modeling it as a type forces every caller to make a conscious decision about each error variant, and the compiler catches you if you forget one.

I prefer sealed interfaces over sealed classes for error hierarchies for one practical reason — a class can implement multiple sealed interfaces but can only extend one sealed class. If you have an error type that belongs to two different hierarchies (say, both a `NetworkError` and a `RetryableError`), sealed interfaces let you express that relationship.

## kotlin.Result — Strengths, Limitations, and the runCatching Trap

Kotlin ships with `kotlin.Result<T>`, and it's tempting to reach for it everywhere. But to really use it well, you need to understand what it's actually designed for and where it breaks down. `Result` wraps either a success value of type `T` or a `Throwable` — not a typed domain error, just a raw `Throwable`. That means the compiler can't enforce exhaustive handling of specific failure modes. The caller is back to `instanceof` checks and guessing.

Where `Result` genuinely shines is at **API boundaries** — places where you're converting between the throwing world and the value world. Standard library functions like `runCatching` produce `Result` values, and the extension functions on `Result` give you a complete toolkit for transforming them. `getOrElse` provides a fallback value when the result is a failure, `getOrDefault` does the same but without access to the exception, `getOrThrow` unwraps the success or rethrows the exception, and `fold` lets you handle both cases in a single expression.

```kotlin
suspend fun loadUserProfile(userId: String): UserProfile {
    val cachedResult = runCatching { cache.getProfile(userId) }

    // fold: handle both success and failure in one expression
    return cachedResult.fold(
        onSuccess = { profile -> profile },
        onFailure = { error ->
            logger.warn("Cache miss for $userId: ${error.message}")
            api.fetchProfile(userId)
        }
    )
}

// getOrElse: provide a computed fallback
val displayName = runCatching { parseDisplayName(rawInput) }
    .getOrElse { error -> "Unknown User" }

// getOrDefault: simpler fallback without access to the error
val retryCount = runCatching { config.getInt("max_retries") }
    .getOrDefault(3)

// getOrThrow: unwrap or rethrow (useful at top-level boundaries)
val session = loginResult.getOrThrow()
```

There are also **`recover`** and **`recoverCatching`** — two extension functions that let you attempt recovery from a failure. `recover` transforms a failed `Result` into a successful one by providing an alternative value. `recoverCatching` does the same but wraps the recovery logic in its own try-catch, so if your recovery also fails, you get a new failed `Result` instead of a crash. I use `recoverCatching` a lot in caching layers — try the network, and if that fails, try the local cache, and if *that* fails, propagate the final error.

```kotlin
suspend fun fetchArticle(articleId: String): Result<Article> {
    return runCatching { api.getArticle(articleId) }
        .recoverCatching { networkError ->
            // Network failed, try local cache as recovery
            localDb.getArticle(articleId)
                ?: throw ArticleNotFoundException(articleId)
        }
        .recover { finalError ->
            // Both network and cache failed, return a placeholder
            Article.placeholder(articleId)
        }
}
```

### The runCatching and CancellationException Gotcha

Here's the thing that bites almost everyone: **`runCatching` catches everything, including `CancellationException`.** This is a serious problem in coroutine code. When a coroutine is cancelled — say, the user navigated away and the `viewModelScope` was cleared — the coroutines machinery throws `CancellationException` to unwind the call stack. If `runCatching` swallows that exception, the coroutine doesn't actually cancel. It keeps running, doing work that nobody wants anymore.

```kotlin
// DANGEROUS: swallows CancellationException
suspend fun fetchUser(id: String): Result<User> {
    return runCatching { api.getUser(id) } // Coroutine cancellation is silently eaten
}

// SAFE: rethrow CancellationException manually
suspend fun fetchUser(id: String): Result<User> {
    return try {
        Result.success(api.getUser(id))
    } catch (e: CancellationException) {
        throw e // Never swallow cancellation
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

IMO, this is the single biggest footgun in Kotlin's standard library for coroutine-heavy codebases. The safe alternative is to either write the explicit try-catch pattern above, use a helper extension like `suspendRunCatching` that rethrows `CancellationException`, or avoid `runCatching` in suspend functions entirely and use sealed types instead. Some teams I've worked with have a lint rule that flags `runCatching` inside suspend functions — it's that common of a mistake.

## Error Propagation Across Layers

In a real Android app, errors don't just get handled in one place. They flow through layers — from the data layer where they originate, through the domain layer where business rules apply, up to the presentation layer where the user sees something. Each layer has its own language for what "went wrong," and translating between those languages is one of the most underrated parts of error handling architecture.

The data layer speaks in technical errors: `IOException`, `HttpException`, `SQLiteConstraintException`. The domain layer speaks in business errors: "user not found," "insufficient balance," "subscription expired." The presentation layer speaks in user-facing messages: "Check your internet connection," "You don't have enough credits." Passing a raw `IOException` from your Retrofit call all the way up to a Toast message is like passing a SQL query result directly to a TextView — technically it works, but it couples everything together and makes the code impossible to reason about.

Here's the pattern I use. Define separate sealed hierarchies for each layer, and map between them at the boundaries.

```kotlin
// Data layer errors — technical, close to the framework
sealed interface DataError {
    data class Network(val cause: IOException) : DataError
    data class Http(val code: Int, val body: String?) : DataError
    data class Database(val cause: Exception) : DataError
}

// Domain layer errors — business-meaningful
sealed interface TransferError {
    data object InsufficientBalance : TransferError
    data object RecipientNotFound : TransferError
    data object DailyLimitExceeded : TransferError
    data class Unavailable(val retryAfterMs: Long?) : TransferError
}

// Presentation layer — what the user sees
sealed interface TransferUiError {
    data class Message(val text: String, val canRetry: Boolean) : TransferUiError
}
```

### Mapping Errors Between Layers

The mapping happens at each boundary. The repository maps `DataError` into `TransferError`, and the ViewModel maps `TransferError` into `TransferUiError`. Each translation adds context and strips away implementation details that the next layer shouldn't know about.

```kotlin
class TransferRepository(private val api: PaymentApi) {

    suspend fun transfer(
        from: AccountId,
        to: AccountId,
        amount: Money
    ): Either<TransferError, TransferConfirmation> {
        return when (val result = api.executeTransfer(from, to, amount)) {
            is DataResult.Success -> Either.Right(result.data)
            is DataResult.Failure -> Either.Left(result.error.toDomainError())
        }
    }

    private fun DataError.toDomainError(): TransferError = when (this) {
        is DataError.Network -> TransferError.Unavailable(retryAfterMs = null)
        is DataError.Http -> when (code) {
            402 -> TransferError.InsufficientBalance
            404 -> TransferError.RecipientNotFound
            429 -> TransferError.DailyLimitExceeded
            else -> TransferError.Unavailable(retryAfterMs = 5000L)
        }
        is DataError.Database -> TransferError.Unavailable(retryAfterMs = null)
    }
}
```

This translation pattern is where sealed types really pay off. The `when` expression is exhaustive at every boundary — if you add a new `DataError` variant, the compiler forces you to decide what `TransferError` it maps to. If you add a new `TransferError` variant, the ViewModel's `when` expression breaks until you handle it. The error contract is enforced all the way up the stack, not just at one level.

## Building a Custom Result Type

At some point, `kotlin.Result` feels too loose and Arrow's `Either` feels too heavy. That's when I build a custom `Result<T, E>` that sits right in the middle. The idea is simple: a sealed class parameterized on both the success type and the error type, so the compiler knows exactly what kind of error each function can produce.

```kotlin
sealed class AppResult<out T, out E> {
    data class Success<T>(val value: T) : AppResult<T, Nothing>()
    data class Failure<E>(val error: E) : AppResult<Nothing, E>()

    fun <R> map(transform: (T) -> R): AppResult<R, E> = when (this) {
        is Success -> Success(transform(value))
        is Failure -> Failure(error)
    }

    fun <R> mapError(transform: (E) -> R): AppResult<T, R> = when (this) {
        is Success -> Success(value)
        is Failure -> Failure(transform(error))
    }

    fun <R> flatMap(transform: (T) -> AppResult<R, E>): AppResult<R, E> =
        when (this) {
            is Success -> transform(value)
            is Failure -> Failure(error)
        }
}
```

The `Nothing` type as a bound is the key trick here — `Success<T>` extends `AppResult<T, Nothing>`, meaning a success value is compatible with any error type. This makes the type inference work smoothly when you chain operations. `map` transforms the success value, `mapError` transforms the error (perfect for layer translations), and `flatMap` lets you chain operations that each return their own `AppResult`.

When should you build this vs just use sealed interfaces? I reach for a custom `Result<T, E>` when I have many different functions that all follow the same success-or-typed-error pattern but with different error types. The generic gives you reusable `map`/`flatMap`/`mapError` operations instead of writing boilerplate `when` blocks everywhere. But if you only have 2-3 functions with unique error hierarchies, a plain sealed interface per use case is simpler and more readable.

## Arrow's Either and the Railway Pattern

If you want a more structured approach without building everything from scratch, Arrow's `Either<E, A>` type is worth understanding. `Either` is a sealed type with two variants: `Left` (conventionally the error) and `Right` (the success). What makes it powerful is the set of extension functions that let you chain operations without manually unwrapping at every step.

```kotlin
import arrow.core.Either
import arrow.core.raise.either

sealed interface OrderError {
    data class ValidationFailed(val field: String) : OrderError
    data object ItemOutOfStock : OrderError
    data class PaymentDeclined(val reason: String) : OrderError
}

suspend fun processOrder(
    request: OrderRequest
): Either<OrderError, OrderConfirmation> = either {
    val validatedOrder = validateOrder(request).bind()
    val inventory = checkInventory(validatedOrder).bind()
    val payment = chargePayment(inventory).bind()
    confirmOrder(payment).bind()
}
```

The `either { }` block with `.bind()` calls is what's called the **railway-oriented programming** pattern. Think of it like a train track that splits into two rails — the success rail and the error rail. Each `.bind()` call is a checkpoint: if the result is `Right` (success), execution continues down the success rail. If it's `Left` (error), execution immediately short-circuits to the error rail and the entire block returns the `Left` value.

This eliminates the nested `when` expressions you'd write with manual sealed class handling. Without this pattern, `processOrder` would be a pyramid of `when` checks — validate, then if success check inventory, then if success charge payment. With `either` + `bind`, it reads like straight-line imperative code, and any failure at any step produces the final result directly.

The honest tradeoff: Arrow is a substantial dependency. It brings functional programming concepts — `Raise`, `Effect`, `NonEmptyList`, monadic comprehensions — that your team needs to learn. For a small team or a codebase where most developers aren't familiar with FP, the learning curve might outweigh the ergonomic benefits. I'd recommend starting with the custom `AppResult<T, E>` approach above and only reaching for Arrow when your error handling chains get complex enough to justify it.

## Error Handling in Coroutines

Coroutine error handling has its own rules that trip up even experienced developers. The core issue is that `launch` and `async` handle exceptions differently, and `SupervisorJob` changes the propagation behavior.

With `launch`, an uncaught exception propagates up the Job hierarchy and cancels the parent scope (and all sibling coroutines). With `async`, the exception is deferred — it's stored in the `Deferred` object and only thrown when you call `.await()`. This means a `try-catch` around `launch` does nothing useful, while a `try-catch` around `.await()` catches the actual exception.

```kotlin
class SyncViewModel(
    private val userRepo: UserRepository,
    private val settingsRepo: SettingsRepository
) : ViewModel() {

    fun syncAll() {
        // BAD: One failure cancels the other
        viewModelScope.launch {
            launch { userRepo.sync() }   // If this throws...
            launch { settingsRepo.sync() } // ...this gets cancelled too
        }

        // BETTER: SupervisorJob isolates failures
        viewModelScope.launch {
            supervisorScope {
                val userJob = launch {
                    try { userRepo.sync() }
                    catch (e: IOException) { /* handle independently */ }
                }
                val settingsJob = launch {
                    try { settingsRepo.sync() }
                    catch (e: IOException) { /* handle independently */ }
                }
            }
        }
    }
}
```

`supervisorScope` (which uses a `SupervisorJob` internally) breaks the default propagation — a child failure doesn't cancel siblings or the parent. This is why `viewModelScope` itself uses `SupervisorJob + Dispatchers.Main.immediate`: you don't want one failing network call to cancel every other coroutine in the ViewModel.

`CoroutineExceptionHandler` is the top-level catch-all for uncaught exceptions in coroutines launched with `launch`. But here's the critical detail most people miss: it only works on the root coroutine scope. If you set a `CoroutineExceptionHandler` on a child coroutine, it's ignored — the exception still propagates to the parent. It's a last-resort logging mechanism, not a replacement for proper error handling in your business logic.

## The Practical Boundary

After working with all these approaches, here's the rule I follow: **use exceptions for conditions you can't predict or recover from, and use sealed types for outcomes you can enumerate.**

Exceptions should be reserved for truly unexpected situations — a `StackOverflowError`, an `OutOfMemoryError`, a `SecurityException` because the app doesn't have the right permissions. These are things your business logic can't meaningfully handle at the call site. They should propagate up to a top-level handler that logs them and shows a generic error screen.

Sealed types are for everything else — validation failures, "not found" responses, payment declines, rate limiting, feature flags that disable functionality. These are expected outcomes that your code needs to handle differently depending on the variant. Making them types instead of exceptions gives you compiler-enforced exhaustive handling, zero stack trace overhead, and self-documenting function signatures.

```kotlin
// Repository: translates framework exceptions into domain results
class LoginRepository(private val api: AuthApi, private val tokenStore: TokenStore) {

    suspend fun login(credentials: Credentials): AuthResult {
        return try {
            val response = api.authenticate(credentials)
            tokenStore.save(response.token)
            AuthResult.Authenticated(UserSession(response.userId, response.token))
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> AuthResult.InvalidCredentials(attemptsRemaining = 3)
                423 -> AuthResult.AccountLocked
                else -> throw e // Unexpected HTTP error — let it propagate
            }
        } catch (e: IOException) {
            AuthResult.NetworkFailure(e)
        }
        // Note: CancellationException is NOT caught — it propagates correctly
    }
}
```

Notice the `else -> throw e` for unexpected HTTP codes. This is intentional. A 500 server error during login is genuinely exceptional — your code can't handle it meaningfully at this level, so let it propagate to the CoroutineExceptionHandler or the crash reporter. The sealed type covers the cases you can handle; exceptions cover everything else.

## A Real ViewModel With Proper Error Handling

Putting it all together, here's what a production ViewModel looks like when you combine sealed error types with coroutine error handling and layered error mapping:

```kotlin
class LoginViewModel(
    private val loginRepository: LoginRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    private val _state = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onLoginClicked(email: String, password: String) {
        viewModelScope.launch {
            _state.value = LoginUiState.Loading

            val result = loginRepository.login(Credentials(email, password))

            _state.value = when (result) {
                is AuthResult.Authenticated -> {
                    analyticsTracker.logLogin(success = true)
                    LoginUiState.Success(result.session)
                }
                is AuthResult.InvalidCredentials -> {
                    analyticsTracker.logLogin(success = false)
                    LoginUiState.Error(
                        message = "Wrong email or password. " +
                            "${result.attemptsRemaining} attempts remaining.",
                        canRetry = true
                    )
                }
                AuthResult.AccountLocked -> LoginUiState.Error(
                    message = "Account locked. Contact support.",
                    canRetry = false
                )
                is AuthResult.NetworkFailure -> LoginUiState.Error(
                    message = "No internet connection. Try again.",
                    canRetry = true
                )
            }
        }
    }
}
```

There's no try-catch in the ViewModel. The repository already translated framework exceptions into domain results. The ViewModel just maps results to UI state — a clean, linear transformation with no exception handling ceremony. Every error variant produces a specific, actionable message. The `canRetry` flag tells the UI whether to show a retry button. And because `AuthResult` is a sealed interface, adding a new error variant (say, `AuthResult.TwoFactorRequired`) produces a compiler warning in every `when` expression that doesn't handle it.

The fundamental shift is treating errors as data, not as interruptions. When your function signature tells the caller exactly what can go wrong, when the compiler enforces that every error is handled, and when exceptions are reserved for genuinely exceptional circumstances — your code becomes more honest about the world it operates in. Mobile apps run on unreliable networks, with users who type unexpected inputs, against servers that occasionally fail. Your error handling should reflect that reality, not pretend it doesn't exist.

Thank You!
