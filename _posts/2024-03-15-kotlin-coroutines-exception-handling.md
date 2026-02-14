---
title: Kotlin Coroutines Exception Handling
layout: post
categories: post
tags:
  - Kotlin Coroutines
  - Android
  - Architecture
---

I once spent two days tracking down a crash that should have been obvious. A coroutine in a ViewModel was fetching data from two endpoints in parallel using `async`. One of them threw an `IOException`. I had a `try/catch` around the `await()` call, so I expected the exception to be caught there. Instead, the app crashed immediately — the exception propagated to the parent scope, cancelled all sibling coroutines, and brought down the entire ViewModel scope before my `catch` block ever ran.

The problem was that I fundamentally misunderstood how exceptions propagate in coroutines. They don't behave like regular Kotlin exceptions. They follow structured concurrency rules — and those rules have different behavior depending on whether you're using `launch`, `async`, a `SupervisorJob`, or a `CoroutineExceptionHandler`. Getting this wrong doesn't just cause bugs. It causes the kind of bugs where a failure in one feature silently kills an unrelated feature because they shared a parent scope.

## The Basic Rule — Exceptions Propagate Up

In structured concurrency, every coroutine has a parent. When a child coroutine throws an unhandled exception, it doesn't just fail — it cancels its parent, which cancels all other children. This is by design. The idea is that if one part of a concurrent operation fails, the whole operation should fail rather than producing partial, inconsistent results.

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

For sequential code in a single coroutine, `try/catch` works exactly as you'd expect. The exception is thrown at the call site, your `catch` block handles it, and nothing else is affected. The complexity starts when you introduce concurrency.

## The async Trap — Where try/catch Breaks

Here's where most developers get burned. `async` creates a *deferred* result. When the async block throws, the exception is stored in the `Deferred` object. You might think calling `await()` is where you catch it — and it is, partially. The exception is re-thrown at the `await()` call. But the exception *also* propagates up to the parent scope immediately when it's thrown, not when you call `await()`.

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

## SupervisorJob — Containing the Blast Radius

`SupervisorJob` changes the propagation rule: child failures don't cancel the parent or siblings. Each child's failure is isolated. This is what you want when parallel operations are independent — if the product search fails, the store search should still complete.

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

Here's what I think is the key insight: **`viewModelScope` already uses `SupervisorJob`**. That's why multiple `launch` calls in `viewModelScope` don't cancel each other. But when you use `async` *inside* a `launch`, the `launch` creates a regular `Job` — and that's where child-to-parent propagation applies. You need `supervisorScope` inside the `launch` to get isolation between the `async` children.

The mental model I use: `SupervisorJob` is for independent parallel work. Regular `Job` is for work that should fail as a unit. If you're loading user profile data and the user's name and email come from the same API, a regular `Job` is fine — if one fails, the whole thing is broken anyway. If you're loading a dashboard with independent sections from different services, `SupervisorJob` lets each section fail independently.

## CoroutineExceptionHandler — The Last Resort

`CoroutineExceptionHandler` is a context element that catches unhandled exceptions in `launch` coroutines. It's a safety net, not a replacement for proper error handling. It catches exceptions that escaped all `try/catch` blocks and reached the root of the coroutine hierarchy.

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

There are critical limitations to understand. `CoroutineExceptionHandler` only works with `launch`, not `async`. For `async`, the exception is delivered through the `Deferred.await()` call — the handler never sees it. And the handler only works when installed on the root coroutine or the scope. Installing it on a child coroutine has no effect because the exception propagates to the parent before the child's handler can catch it.

I use `CoroutineExceptionHandler` as a crash reporting hook — a place to log unexpected exceptions that slipped through my error handling. I don't use it as my primary error handling strategy. If I'm relying on the handler to catch exceptions, it means my `try/catch` placement is wrong, and I should fix that first.

## Cancellation — The Exception That Isn't

`CancellationException` is special in coroutines. When a coroutine is cancelled — either explicitly via `job.cancel()` or implicitly because the scope was cancelled — a `CancellationException` is thrown internally. But unlike regular exceptions, it doesn't propagate failure upward. Cancellation is considered a normal outcome, not an error.

This creates a subtle trap with generic `catch` blocks:

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

If you catch `Exception` (which includes `CancellationException`) and don't rethrow `CancellationException`, you break cancellation. The coroutine thinks it handled the cancellation and keeps running, even though the parent scope wanted it to stop. This can cause memory leaks, phantom updates, and work continuing after the ViewModel is cleared.

The safest pattern is to catch specific exception types (`IOException`, `HttpException`) rather than broad `Exception`. If you must catch `Exception`, always check for `CancellationException` and rethrow it. Some teams add a lint rule for this because swallowing cancellation is such a common and hard-to-debug mistake.

## NonCancellable — When Cleanup Must Complete

Sometimes you need to run code that must complete even if the coroutine is being cancelled. Database writes that ensure consistency, cleanup operations that release resources, or logging that tracks what happened — these shouldn't be interrupted mid-execution.

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

Use `NonCancellable` sparingly. It exists for critical cleanup, not for circumventing cancellation. If you find yourself wrapping entire functions in `NonCancellable`, the design probably needs rethinking.

## Exception Handling in Flows

Flows have their own exception handling mechanisms that interact with coroutine exception handling.

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

`catch` in Flow is upstream-only — it catches exceptions from operators above it in the chain. It does NOT catch exceptions in the terminal `collect` operator. If you need to handle exceptions in `collect`, use try/catch around the `collect` call.

`retry` re-subscribes to the upstream flow when an exception occurs. Combined with `catch` as a final fallback, you get a resilient pipeline: try the operation, retry on transient failures, fall back to an error state if retries are exhausted.

## Real-World ViewModel Error Handling

Here's the pattern I've settled on for ViewModels after dealing with exception handling issues in production. The key insight is separating recoverable errors (show to user) from unrecoverable errors (log and move on).

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

## Structured Concurrency — The Bigger Picture

All of these exception handling mechanisms are part of Kotlin's structured concurrency model. The core principle is that coroutines form a hierarchy — parent scopes own child coroutines, and the lifetime of children is bounded by the lifetime of the parent. Exception propagation follows this hierarchy.

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

This example shows the nuance in practice. The payment must succeed before anything else happens — it's in the outer `coroutineScope`. Inventory reservation and notification sending are parallel and independent — they're in a `supervisorScope`. A notification failure shouldn't cancel inventory reservation. But an inventory failure might be worth surfacing — the `async` result propagates through `await()`.

## The Reframe — Exceptions Are Architecture Decisions

Here's what I didn't understand early on: **exception handling in coroutines isn't just about catching errors. It's about defining failure boundaries.** Every time you choose between `coroutineScope` and `supervisorScope`, you're making an architectural decision about how failures propagate through your system. Every time you choose between `try/catch` inside `async` versus on `await()`, you're deciding where the error is handled and what gets cancelled.

In imperative code, exception handling is mostly about "what do I do when this fails." In coroutine-based concurrent code, it's about "what else should fail when this fails." Should a failed profile photo load cancel the profile data load? Should a failed analytics event crash the feature? Should a timeout in one API call cancel all parallel calls?

These aren't technical questions — they're product decisions expressed in code. And the structured concurrency primitives in Kotlin — `Job`, `SupervisorJob`, `coroutineScope`, `supervisorScope`, `CoroutineExceptionHandler` — are the tools for expressing those decisions precisely. Once you stop thinking about them as error handling utilities and start thinking about them as failure boundary definitions, the mental model clicks into place.

The practical takeaway: every `launch` and `async` in your codebase should have a clear answer to "what happens when this fails, and what else is affected?" If you can't answer that, you don't fully understand your coroutine structure — and that's where the debugging nightmares live.

Thank You!
