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

## Kotlin's Built-in Result vs Custom Types

Kotlin ships with `kotlin.Result<T>`, and it's tempting to reach for it everywhere. But it has a significant limitation: it wraps a value or a `Throwable`. Not a domain error type — a `Throwable`. So you're back to the same problem: the error type is opaque, the caller has to cast or check instance types, and the compiler can't enforce exhaustive handling.

```kotlin
// Built-in Result — you lose error type information
suspend fun fetchUser(id: String): Result<User> {
    return runCatching { api.getUser(id) }
}

// Caller has no idea what errors to expect
fetchUser("123").onFailure { throwable ->
    // Is this IOException? HttpException? Something else?
    // You're guessing again.
}
```

Kotlin's `Result` is fine for cases where you genuinely don't care about the error type — fire-and-forget operations, logging wrappers, or interop boundaries where you just need to know "did it work?" For anything where the caller needs to make decisions based on the error, a custom sealed type is better because it carries domain-specific information that `Throwable` doesn't.

There's also a historical quirk: Kotlin originally restricted using `Result` as a direct return type due to concerns about boxing and ABI compatibility. That restriction was lifted in Kotlin 1.5, but the design philosophy remains — `Result` is a general-purpose wrapper, not a domain modeling tool.

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

The honest tradeoff: Arrow is a substantial dependency. It brings functional programming concepts — `Raise`, `Effect`, `NonEmptyList`, monadic comprehensions — that your team needs to learn. For a small team or a codebase where most developers aren't familiar with FP, the learning curve might outweigh the ergonomic benefits. I'd recommend starting with a simple custom `Result<T, E>` sealed class and only reaching for Arrow when your error handling chains get complex enough to justify it.

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

Putting it all together, here's what a production ViewModel looks like when you combine sealed error types with coroutine error handling properly:

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

## Looking Ahead: Kotlin Union Types

One more thing worth watching: Kotlin 2.x has been exploring union types as a language feature. If they ship, a function could declare its return type as `User | NotFound | Unauthorized` directly in the signature — no wrapper sealed class needed. This would make error-as-types even more natural:

```kotlin
// Hypothetical future Kotlin syntax
fun findUser(id: String): User | NotFound | Unauthorized
```

This would eliminate the boilerplate of defining sealed class hierarchies for simple two-or-three-variant results. But union types also introduce complexity around exhaustive checking, type inference, and interop with Java. Whether they land, and in what form, is still an open question. For now, sealed classes and sealed interfaces are the right tool. They're stable, well-understood, and give you everything you need for production-grade error handling.

The fundamental shift is treating errors as data, not as interruptions. When your function signature tells the caller exactly what can go wrong, when the compiler enforces that every error is handled, and when exceptions are reserved for genuinely exceptional circumstances — your code becomes more honest about the world it operates in. Mobile apps run on unreliable networks, with users who type unexpected inputs, against servers that occasionally fail. Your error handling should reflect that reality, not pretend it doesn't exist.

Thank You!
