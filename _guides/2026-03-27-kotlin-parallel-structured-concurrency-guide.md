---
title: Kotlin Parallel Structured Concurrency Guide
layout: post
sequence: 121
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Sequential suspend calls are the default behavior in coroutines, and most of the time that's exactly what you want. Call `getUser()`, wait for the result, then call `getPosts(user.id)` — clean, readable, no surprises. But I've seen too many Android screens where the loading spinner hangs for 3-4 seconds because three independent API calls run one after the other, each waiting for the previous to complete before starting. The user profile takes a second. The posts feed takes a second. The notification count takes a second. Three seconds of sequential work that could finish in one.

Parallel decomposition is the fix, and Kotlin gives you excellent tools for it — `async`, `coroutineScope`, `supervisorScope`, and `Semaphore`. But parallel work in coroutines isn't just "use `async` everywhere." The structured concurrency model changes how you think about failure, cancellation, and scope. Getting the parallelism right means understanding which scope builder to use, what happens when one of your parallel tasks blows up, and how to limit concurrency when you're processing a list of 500 items.

## Sequential vs Parallel

By default, suspend functions run sequentially. This is a feature, not a limitation. When you write two suspend calls one after the other, the second doesn't start until the first completes. The code reads like synchronous code, which is the entire point of coroutines.

```kotlin
// Sequential — takes ~2 seconds
suspend fun loadProfile(userId: String): ProfileScreen {
    val user = userRepository.getUser(userId)         // ~1 second
    val posts = postRepository.getRecentPosts(userId)  // ~1 second
    return ProfileScreen(user, posts)
}
```

If `getUser` and `getRecentPosts` are independent — neither needs the other's result — you're burning a full second of wall-clock time for nothing. The fix is `async`, which launches each call as a concurrent coroutine and returns a `Deferred` you can `await` later.

```kotlin
// Parallel — takes ~1 second
suspend fun loadProfile(userId: String): ProfileScreen =
    coroutineScope {
        val userDeferred = async { userRepository.getUser(userId) }
        val postsDeferred = async { postRepository.getRecentPosts(userId) }
        ProfileScreen(userDeferred.await(), postsDeferred.await())
    }
```

The time savings are real and measurable. On a profile screen I worked on, switching from sequential to parallel dropped the load time from 2.4 seconds to 1.1 seconds. That's the difference between a user perceiving the screen as slow versus instant. But I only made the change after confirming the two calls had zero data dependencies. If `getRecentPosts` needed the user's account type to determine which posts to fetch, the sequential version would be the correct one, and the parallel version would be a race condition.

One subtle point: the `await()` calls at the bottom don't need to be in any particular order. Both `async` blocks start immediately when they're declared. The `await` calls just retrieve the results — if the result is already available, `await` returns instantly. If not, it suspends until the result arrives. The parallelism comes from the `async` launch, not from the `await` call.

## coroutineScope for Structured Parallel Work

The `coroutineScope` function is the backbone of structured parallel decomposition. It creates a child scope that doesn't complete until every coroutine inside it finishes. More importantly, if any child fails, `coroutineScope` cancels all other children and rethrows the exception. This is the "all-or-nothing" guarantee — either every parallel task succeeds, or the whole operation fails cleanly.

```kotlin
class CheckoutRepository(
    private val inventoryApi: InventoryApi,
    private val pricingApi: PricingApi,
    private val shippingApi: ShippingApi,
    private val dispatchers: DispatcherProvider
) {
    suspend fun prepareCheckout(
        cartItems: List<CartItem>,
        address: Address
    ): CheckoutSummary = withContext(dispatchers.io) {
        coroutineScope {
            val inventory = async {
                inventoryApi.checkAvailability(cartItems)
            }
            val pricing = async {
                pricingApi.calculateTotal(cartItems)
            }
            val shipping = async {
                shippingApi.estimateDelivery(cartItems, address)
            }
            CheckoutSummary(
                availability = inventory.await(),
                total = pricing.await(),
                delivery = shipping.await()
            )
        }
    }
}
```

If the pricing API throws an exception, `coroutineScope` cancels the inventory and shipping calls that are still in-flight. The caller gets a single exception, not a mix of partial results and errors. This is exactly what you want for a checkout flow — you don't want to show the user a delivery estimate if you couldn't confirm the items are in stock.

Here's the insight that took me a while to internalize: `coroutineScope` doesn't create a new coroutine. It creates a new scope within the current coroutine. The current coroutine suspends at the `coroutineScope` boundary until everything inside completes. This means it inherits the parent's context (including the dispatcher), so the `async` blocks inside run on whatever dispatcher the parent is using. If you need a specific dispatcher for the parallel work, wrap `coroutineScope` with `withContext` like in the example above.

Internally, `coroutineScope` creates a new `Job` as a child of the current coroutine's Job. Every `async` inside it creates child Jobs of that scope Job. When one child fails, the scope Job cancels all siblings and rethrows. This tree-based cancellation is what makes structured concurrency "structured" — cleanup is automatic.

## supervisorScope for Independent Parallel Work

`coroutineScope` is great when all tasks must succeed together. But sometimes you have parallel work where one failure shouldn't cancel the others. A dashboard screen loading a user profile, a feed, and notifications — if the feed API is down, you still want to show the profile and notification count. This is where `supervisorScope` comes in.

```kotlin
class DashboardViewModel(
    private val userRepo: UserRepository,
    private val feedRepo: FeedRepository,
    private val statsRepo: StatsRepository
) : ViewModel() {

    fun loadDashboard() {
        viewModelScope.launch {
            supervisorScope {
                val profile = async {
                    runCatching { userRepo.getProfile() }
                }
                val feed = async {
                    runCatching { feedRepo.getLatestFeed() }
                }
                val stats = async {
                    runCatching { statsRepo.getWeeklyStats() }
                }

                _profileState.value = profile.await()
                    .getOrElse { ProfileState.Error(it) }
                _feedState.value = feed.await()
                    .getOrElse { FeedState.Error(it) }
                _statsState.value = stats.await()
                    .getOrElse { StatsState.Error(it) }
            }
        }
    }
}
```

With `supervisorScope`, if `feedRepo.getLatestFeed()` throws, the profile and stats coroutines keep running. Each widget loads independently. The user sees a profile section, an error message where the feed would be, and a stats section — much better UX than a blank screen with a generic error.

The tradeoff is that you must handle every child's failure individually. With `coroutineScope`, a single try-catch around the whole block handles everything. With `supervisorScope`, you need `runCatching` or individual try-catch blocks around each `await()`. More resilience, more error handling code. I use `supervisorScope` specifically for UI sections that are visually and logically independent. For backend transactions where partial success is dangerous, I stick with `coroutineScope`.

There's a common mistake I want to flag: don't use `SupervisorJob()` as a context element when you mean `supervisorScope`. I've seen code like `coroutineScope { launch(SupervisorJob()) { ... } }` — this actually breaks structured concurrency because `SupervisorJob()` creates a new root job that isn't a child of the scope's job. The coroutine won't be cancelled when the scope is cancelled, which defeats the purpose. If you need supervisor behavior, use `supervisorScope { }` — it creates the correct parent-child relationship while isolating failures.

## Parallel Collection Processing

Processing a list of items in parallel is one of the most common patterns, and the most common source of resource exhaustion bugs. The naive approach — `list.map { async { process(it) } }.awaitAll()` — launches every item concurrently. For a list of 10 items, that's fine. For 500 items hitting an API, you just DDoS'd your own backend.

```kotlin
// Dangerous for large lists — launches ALL items concurrently
suspend fun fetchAllArticles(ids: List<String>): List<Article> =
    coroutineScope {
        ids.map { id ->
            async { articleApi.fetchArticle(id) }
        }.awaitAll()
    }
```

For small lists with a known size, this pattern is perfectly fine and I use it regularly. But when the list size is dynamic or potentially large, you need to limit concurrency with a `Semaphore`.

```kotlin
suspend fun fetchAllArticles(
    ids: List<String>,
    maxConcurrency: Int = 5
): List<Article> = coroutineScope {
    val semaphore = Semaphore(maxConcurrency)
    ids.map { id ->
        async {
            semaphore.withPermit {
                articleApi.fetchArticle(id)
            }
        }
    }.awaitAll()
}
```

`Semaphore(5)` means at most 5 coroutines execute the API call at the same time. The other coroutines are launched but suspend at `semaphore.withPermit` until a permit becomes available. This gives you parallel processing with backpressure — you get the speed benefits without overwhelming the server or running out of connections.

I typically set `maxConcurrency` between 3 and 10 for network calls. For CPU-bound work on `Dispatchers.Default`, the dispatcher itself limits parallelism to the number of CPU cores, so a semaphore is less critical. But for IO-bound work on `Dispatchers.IO` — which defaults to a pool of 64 threads — a semaphore prevents you from opening 500 simultaneous HTTP connections.

One thing `awaitAll()` gives you that manual `await()` calls don't: if any single item fails, `awaitAll()` immediately throws, and because we're inside `coroutineScope`, all other in-flight items get cancelled. If you need partial results — some items succeed, some fail — combine `supervisorScope` with `runCatching` inside each `async`:

```kotlin
suspend fun fetchArticlesSafely(
    ids: List<String>,
    maxConcurrency: Int = 5
): List<Result<Article>> = supervisorScope {
    val semaphore = Semaphore(maxConcurrency)
    ids.map { id ->
        async {
            semaphore.withPermit {
                runCatching { articleApi.fetchArticle(id) }
            }
        }
    }.awaitAll()
}
```

Now each item returns a `Result<Article>`, and failures in individual items don't cancel the rest. The caller decides how to handle partial success — retry the failures, show what succeeded, or treat any failure as a total failure.

## Common Patterns

### Parallel With Timeout

Sometimes you want parallel work with an overall deadline. Wrapping `coroutineScope` with `withTimeout` gives you this — if the deadline passes, all children are cancelled.

```kotlin
suspend fun loadDashboardFast(userId: String): DashboardData =
    withTimeout(3_000L) {
        coroutineScope {
            val profile = async { userRepo.getProfile(userId) }
            val orders = async { orderRepo.getRecent(userId) }
            DashboardData(profile.await(), orders.await())
        }
    }
```

If either API call is slow and the combined time exceeds 3 seconds, both get cancelled. For a fallback approach, swap `withTimeout` for `withTimeoutOrNull` and provide cached data when the deadline passes.

### Racing Multiple Sources

When you have multiple ways to get the same data and want whichever responds first, use `select` with `async`:

```kotlin
suspend fun getConfig(): AppConfig = coroutineScope {
    val remote = async { configApi.fetchRemote() }
    val local = async { configDao.getCached() }

    select {
        remote.onAwait { it }
        local.onAwait { it }
    }.also {
        coroutineContext.cancelChildren()
    }
}
```

`select` suspends until one of the clauses completes, then returns that result. `cancelChildren()` cleans up the loser. This is useful for config loading where the local cache is fast but might be stale, and the remote source is authoritative but slow. Whichever arrives first wins.

### Parallel With Partial Results

For screens where you want to show data as it arrives rather than waiting for everything:

```kotlin
class SearchViewModel(
    private val webSearch: WebSearchRepository,
    private val localSearch: LocalSearchRepository,
    private val imageSearch: ImageSearchRepository
) : ViewModel() {

    fun search(query: String) {
        viewModelScope.launch {
            supervisorScope {
                launch {
                    val results = webSearch.search(query)
                    _webResults.value = results
                }
                launch {
                    val results = localSearch.search(query)
                    _localResults.value = results
                }
                launch {
                    val results = imageSearch.search(query)
                    _imageResults.value = results
                }
            }
        }
    }
}
```

Each `launch` updates its own state independently. The UI renders results as they arrive — local results might appear in 100ms, web results in 800ms, images in 1.5 seconds. Using `launch` instead of `async` because we don't need a combined return value — each coroutine pushes its result directly to a `StateFlow`.

## Quiz

**Question 1**: You have three independent API calls inside `coroutineScope` using `async`. The second call throws an exception after the first has already completed. What happens?

- **Wrong** Only the second call fails; the first and third results are returned normally
- **Wrong** The exception is swallowed because the first call already completed
- **Correct** The third call is cancelled, and the exception from the second call is rethrown to the caller. The first call's result is discarded
- **Wrong** All three calls automatically retry

> **Explanation:** `coroutineScope` enforces all-or-nothing semantics. When any child fails, it cancels all remaining children (the third call) and rethrows the exception. Even though the first call completed successfully, `coroutineScope` doesn't return partial results — the entire operation fails. Use `supervisorScope` if you need independent failure handling.

**Question 2**: What's wrong with this code?

```kotlin
val results = ids.map { id ->
    GlobalScope.async { api.fetch(id) }
}.awaitAll()
```

- **Wrong** `GlobalScope.async` is slower than regular `async`
- **Correct** It breaks structured concurrency. The async coroutines have no parent scope, so they won't be cancelled if the calling coroutine is cancelled. If the ViewModel is cleared mid-operation, all 500 network calls keep running
- **Wrong** `awaitAll()` doesn't work with `GlobalScope`
- **Wrong** `GlobalScope` runs on the wrong dispatcher

> **Explanation:** `GlobalScope` creates coroutines with no parent Job. They aren't cancelled when the calling scope is cancelled, which brings back the fire-and-forget leaks that structured concurrency was designed to prevent. Use `coroutineScope { ids.map { async { ... } }.awaitAll() }` to keep everything inside a structured scope.

## Coding Challenge

Build an `ImageProcessor` that takes a list of image URLs and processes them in parallel with a concurrency limit. Requirements:

1. Accept a `List<String>` of URLs and a `maxConcurrency` parameter (default 4)
2. Download and process each image in parallel, but never exceed `maxConcurrency` simultaneous operations
3. Use `supervisorScope` so that one failed download doesn't cancel the others
4. Return a `List<ProcessedResult>` where each result is either `Success(bitmap)` or `Failure(url, error)`
5. Support cancellation — if the caller's scope is cancelled, all in-flight downloads should stop
6. Include a timeout of 10 seconds per individual image

The solution should use `Semaphore` for concurrency limiting and `withTimeout` for per-item deadlines, all within a structured scope.

Thanks for reading!
