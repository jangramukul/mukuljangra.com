---
title: Kotlin Flows With Operators Guide
layout: post
categories: post
tags:
  - Android
  - Kotlin Coroutines
---

When I moved from RxJava to Kotlin Flow, the first thing I noticed was how much simpler the mental model was. RxJava had `Observable`, `Flowable`, `Single`, `Maybe`, `Completable` — five types for different cardinalities. Kotlin Flow has `Flow`. Cold stream, suspend-based, built on coroutines. The operator set is smaller but covers 95% of what you need. The 5% you're missing can usually be built from the primitives. After two years of using Flow in production, I think it's the right level of abstraction for Android — powerful enough for complex async patterns, simple enough that new team members pick it up in a day.

## Flow Builders — Creating Streams

Every Flow starts with a builder. There are three main ones, and which you choose depends on your data source.

**`flow { }`** is the general-purpose builder. It gives you a `FlowCollector` inside a coroutine, and you call `emit()` to send values downstream. This is a cold flow — nothing happens until someone collects it. It's the right builder when your data source is imperative (a database query, a network call, a computation).

```kotlin
class OrderRepository(
    private val orderApi: OrderApi
) {
    fun fetchOrders(): Flow<List<Order>> = flow {
        emit(emptyList())  // immediate empty state
        val orders = orderApi.getOrders()
        emit(orders)  // real data
    }
}
```

**`flowOf()`** creates a Flow from fixed values. Useful for testing and for default states.

```kotlin
val defaultSettings = flowOf(
    AppSettings(theme = Theme.SYSTEM, language = "en")
)
```

**`asFlow()`** converts existing collections, sequences, and ranges into Flows. Handy for transforming in-memory data through Flow operators.

```kotlin
val numbers = (1..100).asFlow()
val items = listOf("apple", "banana", "cherry").asFlow()
```

## Hot vs Cold — StateFlow and SharedFlow

Cold Flows don't emit until collected, and each collector gets its own independent stream. Hot flows emit regardless of collectors and can have multiple subscribers.

**StateFlow** is a hot flow that always holds a value. It replays the latest value to new collectors. It's the replacement for `LiveData` in a coroutine-based architecture. You create it with `MutableStateFlow(initialValue)` and expose it as `StateFlow` (read-only).

```kotlin
class SearchViewModel(
    private val repository: SearchRepository
) : ViewModel() {

    private val _searchResults = MutableStateFlow<SearchState>(SearchState.Idle)
    val searchResults: StateFlow<SearchState> = _searchResults.asStateFlow()

    fun search(query: String) {
        viewModelScope.launch {
            _searchResults.value = SearchState.Loading
            try {
                val results = repository.search(query)
                _searchResults.value = SearchState.Success(results)
            } catch (e: Exception) {
                _searchResults.value = SearchState.Error(e.message ?: "Search failed")
            }
        }
    }
}
```

StateFlow has `value` property for synchronous reads, replays the latest value to new collectors, and uses `distinctUntilChanged` internally — setting the same value twice doesn't emit twice.

**SharedFlow** is a hot flow without a current value. It doesn't replay by default (configurable via `replay` parameter), making it suitable for one-time events like navigation, snackbar messages, or error events that shouldn't re-trigger when the screen rotates.

```kotlin
private val _events = MutableSharedFlow<UiEvent>()
val events: SharedFlow<UiEvent> = _events.asSharedFlow()

suspend fun triggerNavigation() {
    _events.emit(UiEvent.NavigateToDetail("order-123"))
}
```

You can convert any cold flow into a hot flow using `stateIn()` or `shareIn()`, which is the standard way to share a single upstream flow across multiple collectors in a ViewModel.

## Transformation Operators

### map

The most basic operator. Transforms each emitted value.

```kotlin
val orderTotals: Flow<List<String>> = orderDao.observeOrders()
    .map { orders ->
        orders.map { "$${String.format("%.2f", it.total)}" }
    }
```

Real-world use case: mapping database entities to domain models, formatting raw values for display, converting API response DTOs.

### filter

Keeps only values that match a predicate.

```kotlin
val activeOrders: Flow<List<Order>> = orderDao.observeOrders()
    .map { entities -> entities.map { it.toDomain() } }
    .filter { orders -> orders.isNotEmpty() }
```

### transform

More powerful than `map` — you can emit zero, one, or multiple values for each input. It gives you a `FlowCollector`, so you call `emit()` explicitly.

```kotlin
val enrichedOrders: Flow<Order> = orderIds.asFlow()
    .transform { id ->
        emit(Order.placeholder(id))  // emit placeholder immediately
        val real = repository.fetchOrder(id)
        emit(real)  // emit real data when available
    }
```

Real-world use case: emitting loading placeholders before the real data arrives, splitting one event into multiple events, or conditionally emitting based on business logic.

## Combining Operators

### combine

Combines the latest values from multiple flows. Every time any flow emits, the combine function runs with the latest value from each flow. This is the operator you use most often in ViewModels to merge multiple data sources into a single UI state.

```kotlin
class DashboardViewModel(
    private val userRepo: UserRepository,
    private val orderRepo: OrderRepository
) : ViewModel() {

    val uiState: StateFlow<DashboardState> = combine(
        userRepo.observeCurrentUser(),
        orderRepo.observePendingOrders(),
        orderRepo.observeCompletedOrderCount()
    ) { user, pendingOrders, completedCount ->
        DashboardState(
            userName = user.name,
            pendingOrders = pendingOrders,
            completedOrderCount = completedCount
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        DashboardState()
    )
}
```

Real-world use case: combining user preferences with data to determine what to show, merging search query with results and loading state, combining filter selections with a data stream.

### zip

Pairs values from two flows by position — first with first, second with second. Unlike `combine`, `zip` waits for both flows to emit before producing a value. The resulting flow completes when the shorter flow completes.

```kotlin
val paired: Flow<Pair<User, UserStats>> =
    userFlow.zip(statsFlow) { user, stats ->
        Pair(user, stats)
    }
```

Real-world use case: pairing request-response patterns, combining two data sources that emit in lockstep, or correlating events by index.

### merge

Merges multiple flows into a single flow. Values are emitted as they arrive from any source, maintaining their original timing. Unlike `combine`, there's no waiting or pairing — each flow contributes independently.

```kotlin
val allNotifications: Flow<Notification> = merge(
    pushNotifications,
    localReminders,
    systemAlerts
)
```

Real-world use case: merging events from multiple sources into a single event stream, combining updates from different sensors or data feeds.

## FlatMap Operators

### flatMapConcat

For each value in the source flow, creates a new flow and concatenates them sequentially. The next inner flow doesn't start until the previous one completes.

```kotlin
val orderDetails: Flow<OrderDetail> = orderIds.asFlow()
    .flatMapConcat { id ->
        flow {
            emit(OrderDetail.loading(id))
            val detail = repository.getOrderDetail(id)
            emit(detail)
        }
    }
```

Real-world use case: processing items one at a time in order — sequential API calls, ordered database operations.

### flatMapMerge

Like `flatMapConcat`, but inner flows run concurrently. The `concurrency` parameter (default 16) controls how many inner flows run simultaneously.

```kotlin
val allResults: Flow<SearchResult> = searchQueries.asFlow()
    .flatMapMerge(concurrency = 4) { query ->
        flow { emit(searchService.search(query)) }
    }
```

Real-world use case: parallel API calls for multiple items, concurrent image downloads, batch processing with controlled parallelism.

### flatMapLatest

Cancels the previous inner flow when a new value arrives. Only the latest inner flow's emissions make it downstream.

```kotlin
val searchResults: Flow<List<Product>> = searchQueryFlow
    .flatMapLatest { query ->
        if (query.length < 2) flowOf(emptyList())
        else flow {
            val results = repository.search(query)
            emit(results)
        }
    }
```

Real-world use case: search-as-you-type — when the user types a new character, cancel the previous search and start a new one. Only the results for the latest query matter.

## Rate-Limiting Operators

### debounce

Waits for a specified time after the last emission before forwarding the value. If a new value arrives before the timeout, the timer resets. Perfect for search input.

```kotlin
val debouncedSearch: Flow<String> = searchQueryFlow
    .debounce(300L)  // wait 300ms after last keystroke
    .filter { it.length >= 2 }
    .distinctUntilChanged()
```

Real-world use case: search-as-you-type without hammering the API on every keystroke. The 300ms debounce means the search only fires after the user pauses typing.

### distinctUntilChanged

Filters out consecutive duplicate values. StateFlow does this internally, but for regular flows it's essential to prevent redundant processing.

```kotlin
val locationUpdates: Flow<City> = locationFlow
    .map { location -> geocoder.getCity(location) }
    .distinctUntilChanged()  // only emit when city actually changes
```

### buffer and conflate

**`buffer()`** creates a separate coroutine for the collector, so a slow collector doesn't back-pressure the emitter. The emitter can keep producing values while the collector processes at its own pace.

**`conflate()`** is like `buffer()` but only keeps the latest value. If the collector is slow, intermediate values are dropped. This is useful for UI updates where only the latest state matters.

```kotlin
// Sensor data comes fast — conflate to only process the latest reading
sensorFlow
    .conflate()
    .collect { reading ->
        updateUi(reading)  // may be slow, but always gets latest value
    }
```

Real-world use case: high-frequency sensor data, stock price updates, or any stream where the consumer is slower than the producer and only the latest value matters.

## Error Handling Operators

### catch

Catches exceptions from upstream operators and emitters. It runs in the context of the collector, so it can emit fallback values.

```kotlin
val orders: Flow<List<Order>> = orderRepository.observeOrders()
    .catch { exception ->
        emit(emptyList())  // fallback value on error
        analytics.logError("order_load_failed", exception)
    }
```

Important: `catch` only catches exceptions from operators *above* it in the chain. It does not catch exceptions in the `collect` block. If your collector can throw, wrap the `collect` call in a try/catch.

### retry and retryWhen

Automatically restart the flow when an exception occurs. Useful for transient network errors.

```kotlin
val reliableOrders: Flow<List<Order>> = flow {
    emit(orderApi.fetchOrders())
}
    .retry(retries = 3) { cause ->
        cause is IOException  // only retry network errors
    }
    .catch { emit(emptyList()) }  // final fallback
```

`retryWhen` gives you the attempt count, so you can implement exponential backoff:

```kotlin
flow { emit(api.fetchData()) }
    .retryWhen { cause, attempt ->
        if (cause is IOException && attempt < 3) {
            delay(1000L * (attempt + 1))  // 1s, 2s, 3s backoff
            true
        } else false
    }
```

Real-world use case: retrying API calls that failed due to transient network issues, with increasing delays to avoid overwhelming a struggling server.

## The Reframe — Operators Are Building Blocks for Data Pipelines

Here's what I think makes Flow operators worth learning deeply: **each operator solves a specific concurrency or data transformation problem, and combining them lets you build complex async behavior declaratively.** A search feature is `debounce + distinctUntilChanged + flatMapLatest + catch`. A dashboard is `combine` on multiple sources with `stateIn`. A sync pipeline is `flatMapMerge` with `retry` and `buffer`.

The biggest mistake I see is reaching for complex operators when simple sequential code would be clearer. If you're doing one API call and mapping the result, a `flow { }` builder with `map` is all you need. Don't use `flatMapMerge` because it sounds impressive — use it because you need concurrent processing with backpressure control. The best Flow code reads like a description of what you want, not how to achieve it.

Thanks for reading!
