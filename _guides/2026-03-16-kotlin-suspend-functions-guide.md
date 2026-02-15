---
title: Kotlin Suspend Functions Guide
layout: post
sequence: 110
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

The `suspend` keyword is the single most important keyword in Kotlin coroutines. Not `launch`, not `async`, not `Flow`. Those are all built on top of what `suspend` makes possible. A suspend function is a function that can pause its execution without blocking a thread and resume later, picking up exactly where it left off. That one capability — pause and resume — is what replaced `AsyncTask`, callback pyramids, and the entire RxJava operator chain for most Android async work.

When I first started using coroutines, I treated `suspend` as syntactic sugar. Just add the keyword, call it from a coroutine, and things work. But the more production code I wrote, the more I realized there are real design decisions behind every suspend function — where it suspends, what thread it runs on, whether it handles cancellation, and how it composes with other suspend functions. Writing a suspend function is easy. Writing a *good* suspend function takes understanding what the keyword actually means and what responsibilities come with it.

This guide covers the mechanics, the patterns, and the decisions around suspend functions. Not the coroutine framework as a whole — just the suspend function itself, because getting that right is the foundation everything else depends on.

## What suspend Actually Means

A suspend function can only be called from a coroutine or from another suspend function. The compiler enforces this. If you try to call a suspend function from regular code, you get a compilation error. But what's actually happening under the hood is more interesting than a simple access restriction.

When the Kotlin compiler sees the `suspend` keyword, it does two things. First, it adds a hidden parameter to the function — a `Continuation` object. This is the callback mechanism that allows the function to pause and later resume. Second, it changes the return type to `Any?` so the function can return either its actual result or a special sentinel value `COROUTINE_SUSPENDED` to signal that it has paused. Here's a conceptual view of what the compiler does:

```kotlin
// What you write
suspend fun fetchUser(userId: String): User {
    val response = apiService.getUser(userId)
    return response.toUser()
}

// What the compiler generates (conceptual)
fun fetchUser(userId: String, continuation: Continuation<User>): Any? {
    val response = apiService.getUser(userId, continuation)
    if (response == COROUTINE_SUSPENDED) return COROUTINE_SUSPENDED
    return (response as Response).toUser()
}
```

The `Continuation` interface is simple — it holds a `CoroutineContext` and a `resumeWith(result: Result<T>)` function. When the suspended operation completes, the framework calls `resumeWith` to deliver the result back to the coroutine, which then continues executing from the suspension point. This is Continuation Passing Style, an idea borrowed from functional programming languages like Scheme.

Here's the key insight that changed how I think about suspend functions: **the `suspend` keyword doesn't make a function asynchronous. It makes a function *suspendable*.** The function might suspend — meaning it returns `COROUTINE_SUSPENDED` and resumes later — or it might complete immediately without suspending at all. A suspend function that does no I/O and calls no other suspend functions will execute synchronously, just like a regular function. The `suspend` modifier just tells the compiler "this function is allowed to suspend" and gives it the machinery to do so.

## Writing Suspend Functions

The most common mistake I see with suspend functions is making the *caller* responsible for choosing the right dispatcher. I've reviewed codebases where every repository function was a regular function returning a value, and every ViewModel call site was wrapped in `withContext(Dispatchers.IO)`. That's backwards. The suspend function itself should handle its own threading, so the caller doesn't need to know or care.

This principle is called "main-safety." A well-written suspend function is safe to call from the main thread. It internally switches to the appropriate dispatcher for its work and returns the result. The caller just calls it like any sequential function.

```kotlin
class UserRepository(
    private val apiService: ApiService,
    private val userDao: UserDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    // Good — caller doesn't need to know about threading
    suspend fun getUser(userId: String): User = withContext(ioDispatcher) {
        val cached = userDao.findById(userId)
        if (cached != null) return@withContext cached

        val remote = apiService.fetchUser(userId)
        val user = remote.toEntity()
        userDao.insert(user)
        user
    }
}

class UserViewModel(
    private val userRepository: UserRepository
) : ViewModel() {
    fun loadUser(userId: String) {
        viewModelScope.launch {
            // No withContext needed — the repository handles it
            val user = userRepository.getUser(userId)
            _userState.value = UserUiState.Success(user)
        }
    }
}
```

Notice the dispatcher is injected through the constructor. This matters for testing — you can pass a `StandardTestDispatcher` in tests and control execution precisely, rather than fighting real thread pools in your unit tests. I've seen teams skip this and then spend hours debugging flaky tests caused by real `Dispatchers.IO` executing on unpredictable threads.

The other important rule: keep the suspension *inside* the function. Don't return a `Deferred` from a suspend function — that leaks concurrency details to the caller. Don't require the caller to wrap your function in `withContext`. A suspend function should be a clean, sequential call that hides its async internals. If a function needs to launch concurrent work, it should take a `CoroutineScope` as a parameter or be an extension on `CoroutineScope`, not be a suspend function that secretly launches jobs.

## suspendCoroutine and suspendCancellableCoroutine

Android has decades of callback-based APIs. `LocationManager`, `SensorManager`, the old `OkHttp` `Call.enqueue`, Firebase operations — all callbacks. Converting these to suspend functions is one of the most practical skills in coroutine programming, and `suspendCancellableCoroutine` is the tool for the job.

The basic idea: you call `suspendCancellableCoroutine`, which suspends the coroutine and gives you a `CancellableContinuation` object. You use that continuation to `resume` with a value when the callback fires, or `resumeWithException` if it fails. The coroutine stays suspended until one of those is called.

```kotlin
suspend fun OkHttpClient.await(request: Request): Response =
    suspendCancellableCoroutine { continuation ->
        val call = newCall(request)

        continuation.invokeOnCancellation {
            call.cancel()
        }

        call.enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                continuation.resume(response)
            }

            override fun onFailure(call: Call, e: IOException) {
                continuation.resumeWithException(e)
            }
        })
    }
```

There are a few things happening here that matter. First, `invokeOnCancellation` — this registers a cleanup handler that runs if the coroutine is cancelled while waiting for the callback. Without it, the HTTP call would keep running even after the coroutine was cancelled, wasting bandwidth and battery. Always clean up your resources in `invokeOnCancellation`.

Second, I used `suspendCancellableCoroutine`, not `suspendCoroutine`. There's a plain `suspendCoroutine` in the standard library, but you should almost never use it. The cancellable variant provides the `invokeOnCancellation` hook and respects structured concurrency. If the parent coroutine is cancelled, `suspendCancellableCoroutine` throws a `CancellationException` immediately. With plain `suspendCoroutine`, the coroutine just sits there, suspended, waiting for a callback that no one cares about anymore. In a ViewModel that's been cleared, that's a memory leak waiting to happen.

One critical rule: never call `resume` or `resumeWithException` more than once on the same continuation. It crashes. If your callback API can fire multiple times, you need `callbackFlow`, not `suspendCancellableCoroutine`. The suspend function pattern is strictly for single-shot operations — one request, one response.

## Suspend Functions vs Regular Functions

Not every function called from a coroutine needs to be `suspend`. I think this is one of the most over-applied patterns I see — developers marking functions `suspend` just because they're called inside a `launch` block, even though the function does nothing suspending.

Here's the rule: **mark a function `suspend` only if it actually calls another suspend function or uses a suspend primitive.** If a function does pure computation, string formatting, data mapping, or synchronous work, it should be a regular function. Adding `suspend` to it doesn't make it faster, doesn't make it async, and doesn't do anything useful. It just restricts where the function can be called.

```kotlin
// Wrong — this function does nothing suspending
suspend fun formatUserName(first: String, last: String): String {
    return "$first $last".trim()
}

// Correct — regular function, callable from anywhere
fun formatUserName(first: String, last: String): String {
    return "$first $last".trim()
}
```

**Wrong**: adding `suspend` to a function just because it's called from a coroutine.

**Correct**: only adding `suspend` when the function actually suspends — it calls `delay()`, `withContext()`, another suspend function, or uses `suspendCancellableCoroutine`.

There's a real cost to unnecessary `suspend` modifiers. The compiler generates a state machine for every suspend function, even if it never actually suspends. That's extra bytecode, an extra class, and an extra object allocation for the continuation. For a function called in a tight loop — like a mapper applied to every item in a list — that overhead adds up. More importantly, making a function `suspend` when it doesn't need to be restricts its usability. You can call a regular function from anywhere — a suspend function, a regular function, a property initializer, a `lazy` block. A suspend function can only be called from a coroutine or another suspend function. Don't artificially limit your API surface.

The gray area is functions that *might* do suspending work in some implementations but not others. If you're writing an interface, mark the function `suspend` if any implementation could reasonably need to suspend. A `UserRepository` interface should probably have `suspend fun getUser()` even if your in-memory fake returns immediately, because the real implementation hits the network. But a `UserMapper` interface that transforms one data class into another should not have suspend functions.

## Composing Suspend Functions

Suspend functions are sequential by default. When you call two suspend functions one after another, the second one doesn't start until the first one finishes. This is by design — it's what makes coroutine code readable like synchronous code. But it's also a performance trap if you don't think about it.

```kotlin
// Sequential — takes ~2 seconds total
suspend fun loadDashboard(userId: String): Dashboard {
    val profile = userRepository.getProfile(userId)       // ~1 second
    val transactions = paymentRepository.getRecent(userId) // ~1 second
    return Dashboard(profile, transactions)
}
```

If `getProfile` and `getRecent` are independent — neither needs the other's result — you're wasting a full second of wall-clock time by running them sequentially. The fix is `async`, which launches each call in a concurrent coroutine and lets you await both results:

```kotlin
// Parallel — takes ~1 second total
suspend fun loadDashboard(userId: String): Dashboard =
    coroutineScope {
        val profile = async { userRepository.getProfile(userId) }
        val transactions = async { paymentRepository.getRecent(userId) }
        Dashboard(profile.await(), transactions.await())
    }
```

I'm using `coroutineScope` here, not `GlobalScope` or an externally passed scope. This is important. `coroutineScope` creates a child scope that respects structured concurrency — if either `async` block fails, the other one is cancelled automatically, and the exception propagates to the caller. If I used `GlobalScope.async` instead, a failure in one call would leave the other one running as an orphan, and the exception would be lost.

The performance difference is real. In a dashboard screen I worked on, switching three sequential API calls (user profile, recent orders, notification count) to parallel `async` calls dropped the load time from around 3.2 seconds to 1.1 seconds. That's the difference between a user seeing a loading spinner and the screen appearing instantly. But I only made them parallel after confirming there were no data dependencies between the three calls. If the notification count depended on the user profile (maybe different notification settings per account type), the sequential version would be correct and the parallel version would be a bug.

One thing worth noting: don't reach for `async` everywhere. If calls are genuinely dependent — the second uses the first's result — sequential is correct and simpler. Using `async` and immediately calling `.await()` on the same line gives you zero parallelism and adds unnecessary complexity. The default sequential behavior is a feature, not a limitation.

## Quiz

**Question 1.** What happens if you add `suspend` to a function that does only pure computation (no I/O, no calls to other suspend functions)?

**Wrong**: The function becomes asynchronous and runs on a background thread.

**Correct**: Nothing useful happens. The compiler generates a state machine with extra bytecode, but the function never actually suspends. It executes synchronously just like a regular function, except now it can only be called from a coroutine or another suspend function. You've added overhead and restricted the call site for no benefit.

**Question 2.** Why should you use `suspendCancellableCoroutine` instead of `suspendCoroutine` when converting callback APIs?

**Wrong**: `suspendCancellableCoroutine` is faster because it uses optimized internal dispatching.

**Correct**: `suspendCancellableCoroutine` provides an `invokeOnCancellation` hook for resource cleanup and respects structured concurrency — if the parent coroutine is cancelled, the suspended coroutine is immediately cancelled with a `CancellationException`. With plain `suspendCoroutine`, the coroutine stays suspended indefinitely even if its parent is cancelled, which can cause memory leaks and wasted resources.

## Coding Challenge

Build a `WeatherDashboardRepository` with two suspend functions: `getWeatherForecast(city: String)` and `getAirQuality(city: String)`. Each simulates network delay using `delay(1000)`. Then write a `loadDashboardData` suspend function that calls both in parallel using `coroutineScope` and `async`, returning a combined `DashboardData` object. Verify that the total execution time is approximately 1 second, not 2. As a bonus, convert a hypothetical callback-based `GeocodingService.resolveCity(name: String, callback: GeocodingCallback)` to a suspend function using `suspendCancellableCoroutine`, including proper cancellation handling.

Thanks for reading!
