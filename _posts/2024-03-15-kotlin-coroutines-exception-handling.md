---
title: Kotlin Coroutines Exception Handling
layout: post
categories: post
tags:
  - Kotlin Coroutines
  - Android
  - Architecture
---

I once spent two days tracking down a crash that should have been obvious. A coroutine in a ViewModel was fetching data from two endpoints in parallel using `async`. One of them threw an `IOException`. I had a `try/catch` around the `await()` call, so I figured the exception would be caught right there. Problem solved, right?

Nope. The app crashed immediately. The exception propagated to the parent scope, cancelled all sibling coroutines, and brought down the entire ViewModel scope before my `catch` block ever ran.

Two days. For that.

The problem was that I fundamentally misunderstood how exceptions propagate in coroutines. They don't behave like regular Kotlin exceptions. They follow structured concurrency rules — and those rules change depending on whether you're using `launch`, `async`, a `SupervisorJob`, or a `CoroutineExceptionHandler`. Getting this wrong doesn't just cause bugs. It causes the kind of bugs where a failure in one feature silently kills an unrelated feature because they shared a parent scope. Yeah, that's a fun one to debug on a Friday evening.

## The Basic Rule — Exceptions Propagate Up

Think of structured concurrency like a family tree. Every coroutine has a parent. And here's the rule that trips everyone up: when a child coroutine throws an unhandled exception, it doesn't just fail quietly in its corner. It cancels its parent, and the parent cancels all the other children.

Sounds aggressive? It's actually by design. The idea is that if one part of a concurrent operation fails, the whole operation should fail rather than producing partial, inconsistent results. It's like a relay race — if one runner drops the baton, you don't keep running the remaining legs and pretend you finished.

```kotlin
class DashboardViewModel(
    private val userRepository: UserRepository,
    private val orderRepository: OrderRepository
) : ViewModel() {

    fun loadDashboard() {
        // viewModelScope uses SupervisorJob internally (more on this later)
        viewModelScope.launch {
            try {
                // Both run in the same coroutine — sequential
                val user = userRepository.getCurrentUser()
                val orders = orderRepository.getRecentOrders(user.id)
                _uiState.value = DashboardState.Success(user, orders)
            } catch (e: Exception) {
                // This catches exceptions from either call
                _uiState.value = DashboardState.Error(e.message ?: "Unknown error")
            }
        }
    }
}
```

For sequential code in a single coroutine, `try/catch` works exactly as you'd expect. The exception is thrown at the call site, your `catch` block handles it, nothing else is affected. Life is good.

The complexity starts when you introduce concurrency. And that's where your intuition from regular Kotlin exception handling will betray you.

## The async Trap — Where try/catch Breaks

Here's where most developers get burned — myself included.

`async` creates a *deferred* result. When the async block throws, the exception is stored in the `Deferred` object. You might think calling `await()` is where you catch it — and it is, partially. The exception is re-thrown at the `await()` call. But here's the part nobody warns you about: the exception *also* propagates up to the parent scope immediately when it's thrown, not when you call `await()`.

Wait, what? Read that again. The exception reaches the parent *before* you even get to call `await()`.

```kotlin
class SearchViewModel(
    private val productSearch: ProductSearchService,
    private val storeSearch: StoreSearchService
) : ViewModel() {

    fun searchEverything(query: String) {
        viewModelScope.launch {
            // DANGER: If productSearch throws, it cancels the parent
            // before storeResults.await() ever runs
            val productResults = async { productSearch.search(query) }
            val storeResults = async { storeSearch.search(query) }

            try {
                val products = productResults.await()
                val stores = storeResults.await()
                _uiState.value = SearchState.Success(products, stores)
            } catch (e: Exception) {
                // This catch might not even execute — the parent
                // might already be cancelled
                _uiState.value = SearchState.Error(e.message ?: "Search failed")
            }
        }
    }
}
```

This is the exact bug I described in the opening. The `async` block throws, the exception propagates to the `launch` coroutine, the `launch` coroutine is cancelled, and the `catch` block may or may not run depending on timing. The behavior is confusing because `try/catch` around `await()` *does* catch the exception from `await()` — but by that point, the damage is already done. The parent scope saw the exception first.

It's like locking your front door after the burglar is already inside. Technically you locked the door. Technically it didn't help.

> **🧠 Think about it:** If `async` throws immediately but `await()` is where you catch it — and the parent sees the exception before `await()` runs — where should you actually put your error handling?

## SupervisorJob — Containing the Blast Radius

`SupervisorJob` changes the propagation rule: child failures don't cancel the parent or siblings. Each child's failure is isolated. This is what you want when parallel operations are independent — if the product search fails, the store search should still complete.

Think of it like apartment buildings versus open-plan offices. In an open-plan office (regular `Job`), if someone starts a small fire at their desk, the whole floor gets evacuated. In an apartment building (`SupervisorJob`), a fire in one unit doesn't force everyone else out — it's contained.

```kotlin
class SearchViewModel(
    private val productSearch: ProductSearchService,
    private val storeSearch: StoreSearchService
) : ViewModel() {

    fun searchEverything(query: String) {
        viewModelScope.launch {
            // supervisorScope prevents child failures from cancelling siblings
            supervisorScope {
                val productResults = async {
                    try {
                        productSearch.search(query)
                    } catch (e: Exception) {
                        emptyList()  // Graceful degradation
                    }
                }

                val storeResults = async {
                    try {
                        storeSearch.search(query)
                    } catch (e: Exception) {
                        emptyList()
                    }
                }

                val products = productResults.await()
                val stores = storeResults.await()
                _uiState.value = SearchState.Success(products, stores)
            }
        }
    }
}
```

`supervisorScope` creates a scope with a `SupervisorJob`. Inside it, each `async` block handles its own exceptions independently. If `productSearch` throws, the `catch` inside its `async` block handles it, and `storeSearch` keeps running. The `await()` calls get the results (or the fallback values), and the UI shows whatever succeeded.

Now here's where it gets interesting. **`viewModelScope` already uses `SupervisorJob`**. That's why multiple `launch` calls in `viewModelScope` don't cancel each other. But when you use `async` *inside* a `launch`, the `launch` creates a regular `Job` — and that's where child-to-parent propagation applies. You need `supervisorScope` inside the `launch` to get isolation between the `async` children.

I know, I know. It's a subtle distinction. But once you see it, you can't unsee it.

The mental model I use: `SupervisorJob` is for independent parallel work. Regular `Job` is for work that should fail as a unit. If you're loading user profile data and the user's name and email come from the same API, a regular `Job` is fine — if one fails, the whole thing is broken anyway. If you're loading a dashboard with independent sections from different services, `SupervisorJob` lets each section fail independently.

> **💡 The "aha" moment:** The choice between `Job` and `SupervisorJob` isn't a technical detail — it's you telling the system "these things are one unit" versus "these things are independent." Pick the wrong one, and failures either cascade too far or don't cascade far enough.

## CoroutineExceptionHandler — The Last Resort

`CoroutineExceptionHandler` is a context element that catches unhandled exceptions in `launch` coroutines. Think of it like the catch-all `except` at the very top of a Python program, or the global `UncaughtExceptionHandler` in the JVM. It's a safety net, not a replacement for proper error handling. It catches exceptions that escaped all `try/catch` blocks and reached the root of the coroutine hierarchy.

```kotlin
class AppCoroutineSetup {

    val globalExceptionHandler = CoroutineExceptionHandler { context, throwable ->
        // Log to crash reporting (Crashlytics, Sentry, etc.)
        CrashReporter.logException(throwable)

        // DO NOT try to update UI here — you don't know which
        // scope or screen this exception came from
        Log.e("CoroutineError", "Unhandled exception", throwable)
    }
}

class SyncService(
    private val repository: DataRepository,
    private val exceptionHandler: CoroutineExceptionHandler
) {

    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.IO + exceptionHandler
    )

    fun syncData() {
        // If this launch throws and nothing catches it,
        // the exceptionHandler logs it instead of crashing
        scope.launch {
            repository.syncAllData()
        }
    }

    fun destroy() {
        scope.cancel()
    }
}
```

There are critical limitations to understand, and this is where people get confused.

First, `CoroutineExceptionHandler` only works with `launch`, not `async`. For `async`, the exception is delivered through the `Deferred.await()` call — the handler never sees it. Second, the handler only works when installed on the root coroutine or the scope. Installing it on a child coroutine has no effect because the exception propagates to the parent before the child's handler can catch it. So if you're scratching your head wondering why your handler isn't firing — check where you installed it.

I use `CoroutineExceptionHandler` as a crash reporting hook — a place to log unexpected exceptions that slipped through my error handling. I don't use it as my primary error handling strategy. If I'm relying on the handler to catch exceptions, it means my `try/catch` placement is wrong, and I should fix that first.

## Cancellation — The Exception That Isn't

`CancellationException` is the weird one. When a coroutine is cancelled — either explicitly via `job.cancel()` or implicitly because the scope was cancelled — a `CancellationException` is thrown internally. But unlike regular exceptions, it doesn't propagate failure upward. Cancellation is considered a normal outcome, not an error.

Sounds weird, right? Think of it this way: if a user navigates away from a screen and the ViewModel is cleared, all its coroutines get cancelled. That's not a failure — that's just the user doing normal user things. You wouldn't want that to trigger your error handling and show a "Something went wrong" dialog.

But this creates a subtle trap with generic `catch` blocks:

```kotlin
class DownloadViewModel(
    private val downloadService: DownloadService
) : ViewModel() {

    fun downloadFile(fileId: String) {
        viewModelScope.launch {
            try {
                _uiState.value = DownloadState.Downloading
                downloadService.download(fileId)
                _uiState.value = DownloadState.Complete
            } catch (e: CancellationException) {
                // IMPORTANT: Always rethrow CancellationException
                // Swallowing it breaks structured concurrency
                throw e
            } catch (e: Exception) {
                _uiState.value = DownloadState.Error(e.message ?: "Download failed")
            }
        }
    }

    // Better pattern — catch specific exceptions
    fun downloadFileSafely(fileId: String) {
        viewModelScope.launch {
            _uiState.value = DownloadState.Downloading
            _uiState.value = try {
                downloadService.download(fileId)
                DownloadState.Complete
            } catch (e: IOException) {
                DownloadState.Error("Network error: ${e.message}")
            } catch (e: HttpException) {
                DownloadState.Error("Server error: ${e.code()}")
            }
        }
    }
}
```

Can you see the problem? If you catch `Exception` (which includes `CancellationException`) and don't rethrow `CancellationException`, you break cancellation. The coroutine thinks it handled the cancellation and keeps running, even though the parent scope wanted it to stop. This can cause memory leaks, phantom updates, and work continuing after the ViewModel is cleared. Your user navigated away, but the coroutine is still chugging along like that one coworker who doesn't check Slack.

> **🔥 Real talk:** Some teams add a lint rule specifically for catching `CancellationException` because swallowing it is such a common and hard-to-debug mistake. If your team doesn't have one, consider adding it. Future-you will thank present-you.

The safest pattern is to catch specific exception types (`IOException`, `HttpException`) rather than broad `Exception`. If you must catch `Exception`, always check for `CancellationException` and rethrow it.

## NonCancellable — When Cleanup Must Complete

Sometimes you need to run code that must complete even if the coroutine is being cancelled. Database writes that ensure consistency, cleanup operations that release resources, or logging that tracks what happened — these shouldn't be interrupted mid-execution.

Imagine you're syncing an order to the server. Halfway through the sync, the coroutine gets cancelled. You still need to mark that order as "sync attempted" in your local database — otherwise, your retry logic might hammer that same order forever. The sync can stop, but the bookkeeping has to finish.

`NonCancellable` is a `Job` that is always active and can't be cancelled. Wrapping code in `withContext(NonCancellable)` ensures it runs to completion.

```kotlin
class OrderSyncWorker(
    private val orderDao: OrderDao,
    private val orderApi: OrderApi
) {

    suspend fun syncOrder(orderId: String) {
        try {
            val order = orderDao.getOrder(orderId)
            orderApi.uploadOrder(order)
        } finally {
            // Even if the coroutine is cancelled mid-sync,
            // mark the order as "sync attempted" so we don't retry endlessly
            withContext(NonCancellable) {
                orderDao.markSyncAttempted(orderId)
                analytics.logSyncAttempt(orderId)
            }
        }
    }
}
```

Use `NonCancellable` sparingly though. It exists for critical cleanup, not for circumventing cancellation. If you find yourself wrapping entire functions in `NonCancellable`, the design probably needs rethinking. It's like using `!!` everywhere in Kotlin — technically it works, but you're fighting the system instead of working with it.

## Exception Handling in Flows

Flows have their own exception handling mechanisms that interact with coroutine exception handling. And honestly, once you understand the coroutine side, the Flow side feels a lot more intuitive.

```kotlin
class OrderViewModel(
    private val repository: OrderRepository
) : ViewModel() {

    val orders: StateFlow<OrderUiState> = repository.observeOrders()
        .map<List<Order>, OrderUiState> { OrderUiState.Success(it) }
        .catch { e ->
            // catch handles upstream exceptions
            emit(OrderUiState.Error(e.message ?: "Failed to load orders"))
        }
        .retry(retries = 2) { cause ->
            cause is IOException
        }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            OrderUiState.Loading
        )
}
```

Here's the key thing to remember: `catch` in Flow is upstream-only — it catches exceptions from operators above it in the chain. It does NOT catch exceptions in the terminal `collect` operator. If you need to handle exceptions in `collect`, use try/catch around the `collect` call. This trips people up because they expect `catch` to work like a global safety net for the whole pipeline. It doesn't — it only looks upward.

`retry` re-subscribes to the upstream flow when an exception occurs. Combined with `catch` as a final fallback, you get a resilient pipeline: try the operation, retry on transient failures, fall back to an error state if retries are exhausted. It's like a recipe — try the dish, if it burns, try again twice, and if it still burns, order takeout.

## Real-World ViewModel Error Handling

Here's the pattern I've settled on for ViewModels after dealing with exception handling issues in production. The key insight is separating recoverable errors (show to user) from unrecoverable errors (log and move on). Not every error deserves a full-screen error state. Sometimes a snackbar is the right call.

```kotlin
@HiltViewModel
class OrderListViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    private val _uiState = MutableStateFlow<OrderListState>(OrderListState.Loading)
    val uiState: StateFlow<OrderListState> = _uiState.asStateFlow()

    init {
        loadOrders()
    }

    fun loadOrders() {
        viewModelScope.launch {
            _uiState.value = OrderListState.Loading
            _uiState.value = try {
                val orders = orderRepository.getOrders()
                if (orders.isEmpty()) OrderListState.Empty
                else OrderListState.Success(orders)
            } catch (e: IOException) {
                // Recoverable — network issue, show retry option
                OrderListState.Error(
                    message = "Check your internet connection",
                    canRetry = true
                )
            } catch (e: HttpException) {
                // Server error — may or may not be retryable
                val canRetry = e.code() in 500..599
                OrderListState.Error(
                    message = "Server error (${e.code()})",
                    canRetry = canRetry
                )
            }
        }
    }

    fun refreshWithFallback() {
        viewModelScope.launch {
            // Don't show loading for refresh — keep showing current data
            try {
                orderRepository.refreshOrders()
                // If using Flow from Room, the UI updates automatically
            } catch (e: IOException) {
                // Soft failure — show a snackbar, don't wipe the screen
                _events.emit(UiEvent.ShowSnackbar("Couldn't refresh. Showing cached data."))
            }
        }
    }
}
```

Notice the `refreshWithFallback` function. It doesn't wipe the screen and show a loading spinner — it keeps the current data visible and just shows a snackbar if the refresh fails. This is a small thing, but it's the difference between an app that feels solid and one that flickers every time the network hiccups.

> **⚡ Quick check:** If you have a `catch(e: Exception)` somewhere in your ViewModel right now, do you know whether it accidentally swallows `CancellationException`? Go check. I'll wait.

## Structured Concurrency — The Bigger Picture

All of these exception handling mechanisms are part of Kotlin's structured concurrency model. The core principle is that coroutines form a hierarchy — parent scopes own child coroutines, and the lifetime of children is bounded by the lifetime of the parent. Exception propagation follows this hierarchy.

Here's an example that ties everything together — an order processing flow where some steps must succeed, some are independent, and some are non-critical:

```kotlin
class OrderProcessingService(
    private val paymentGateway: PaymentGateway,
    private val inventoryService: InventoryService,
    private val notificationService: NotificationService
) {

    suspend fun processOrder(order: Order): OrderResult {
        return coroutineScope {
            // Step 1: Charge payment (must succeed)
            val paymentResult = paymentGateway.charge(order.total, order.paymentMethod)

            // Step 2: Reserve inventory and send notification in parallel
            // These are independent — use supervisorScope for isolation
            supervisorScope {
                val inventoryJob = async {
                    inventoryService.reserve(order.items)
                }

                val notificationJob = async {
                    try {
                        notificationService.sendOrderConfirmation(order)
                    } catch (e: Exception) {
                        // Notification failure is non-critical — log and continue
                        Log.w("OrderProcessing", "Notification failed", e)
                    }
                }

                val inventoryResult = inventoryJob.await()
                notificationJob.await()

                OrderResult(
                    paymentId = paymentResult.id,
                    inventoryReserved = inventoryResult.success
                )
            }
        }
    }
}
```

Look at how the scoping tells a story. The payment must succeed before anything else happens — it's in the outer `coroutineScope`, sequential, no isolation needed. If it fails, everything fails. That's correct — you don't want to reserve inventory for an order that wasn't paid for.

Inventory reservation and notification sending are parallel and independent — they're in a `supervisorScope`. A notification failure shouldn't cancel inventory reservation. But an inventory failure might be worth surfacing — the `async` result propagates through `await()`.

Each scope boundary is an architectural decision about what should fail together and what should fail independently. The code structure literally maps to the business logic.

## The Reframe — Exceptions Are Architecture Decisions

Here's what I didn't understand early on, and what I wish someone had told me: **exception handling in coroutines isn't just about catching errors. It's about defining failure boundaries.** Every time you choose between `coroutineScope` and `supervisorScope`, you're making an architectural decision about how failures propagate through your system. Every time you choose between `try/catch` inside `async` versus on `await()`, you're deciding where the error is handled and what gets cancelled.

In regular imperative code, exception handling is mostly about "what do I do when this fails." In coroutine-based concurrent code, the question shifts to "what else should fail when this fails." Should a failed profile photo load cancel the profile data load? Should a failed analytics event crash the feature? Should a timeout in one API call cancel all parallel calls?

These aren't technical questions — they're product decisions expressed in code.

And the structured concurrency primitives in Kotlin — `Job`, `SupervisorJob`, `coroutineScope`, `supervisorScope`, `CoroutineExceptionHandler` — are the tools for expressing those decisions precisely. Once you stop thinking about them as error handling utilities and start thinking about them as failure boundary definitions, the mental model clicks into place. That's the reframe. Exception handling is architecture.

The practical takeaway: every `launch` and `async` in your codebase should have a clear answer to "what happens when this fails, and what else is affected?" If you can't answer that, you don't fully understand your coroutine structure — and that's where the debugging nightmares live.

Thank You!
