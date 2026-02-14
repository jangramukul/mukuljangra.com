---
title: Kotlin Flows With Operators Guide
layout: post
categories: post
tags:
  - Android
  - Kotlin Coroutines
---

When I moved from RxJava to Kotlin Flow, you know what hit me first? How much stuff I could just... forget. RxJava had `Observable`, `Flowable`, `Single`, `Maybe`, `Completable` — five types, each with its own quirks, each demanding you pick the "right" one for the situation. It was like ordering coffee at a place with 47 drink sizes. You just want coffee.

Kotlin Flow gives you `Flow`. One type. Cold stream, suspend-based, built on coroutines. The operator set is smaller but covers 95% of what you need. The 5% you're missing? You can usually build it from the primitives. After two years of using Flow in production, I think it's the right level of abstraction for Android — powerful enough for complex async patterns, simple enough that new team members pick it up in a day.

Think of Flow operators like LEGO bricks. Each brick does one specific thing. Alone, a single brick isn't impressive. But snap a few together — `debounce` + `distinctUntilChanged` + `flatMapLatest` + `catch` — and suddenly you've built a production-grade search feature. That's the mental model I want you to walk away with.

## Flow Builders — Creating Streams

Every Flow starts with a builder. There are three main ones, and which you choose depends on where your data is coming from.

**`flow { }`** is the general-purpose builder — the one you'll reach for most often. It gives you a `FlowCollector` inside a coroutine, and you call `emit()` to send values downstream. Think of it like a kitchen pass window at a restaurant. The chef (your coroutine) prepares dishes and places them on the pass (calls `emit()`), and the waiter (your collector) picks them up when ready. Nothing gets cooked until a waiter shows up — that's what makes it a cold flow. It's the right builder when your data source is imperative: a database query, a network call, a computation.

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

**`flowOf()`** creates a Flow from fixed values. Useful for testing and for default states. You already know what the values are, you just need them wrapped in a Flow.

```kotlin
val defaultSettings = flowOf(
    AppSettings(theme = Theme.SYSTEM, language = "en")
)
```

**`asFlow()`** converts existing collections, sequences, and ranges into Flows. It's the adapter — you have data in one shape and need it in another. Handy for transforming in-memory data through Flow operators.

```kotlin
val numbers = (1..100).asFlow()
val items = listOf("apple", "banana", "cherry").asFlow()
```

## Hot vs Cold — StateFlow and SharedFlow

Here's where things get interesting. Cold Flows don't emit until collected, and each collector gets its own independent stream. It's like a vending machine — nothing happens until you press the button, and your snack is just for you. Hot flows are more like a radio station — they broadcast regardless of whether anyone is tuned in, and everyone listening hears the same thing.

**StateFlow** is a hot flow that always holds a value. It replays the latest value to new collectors. If you've used `LiveData`, this is its coroutine-era replacement — same idea, better API. You create it with `MutableStateFlow(initialValue)` and expose it as `StateFlow` (read-only).

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

StateFlow has a `value` property for synchronous reads, replays the latest value to new collectors, and uses `distinctUntilChanged` internally — setting the same value twice doesn't emit twice. That last part catches people off guard. If you set `_state.value = SearchState.Loading` and it's already `Loading`, nothing happens downstream. No emission. No recomposition. Silent.

**SharedFlow** is a hot flow without a current value. It doesn't replay by default (configurable via the `replay` parameter), which makes it the right choice for one-time events — navigation commands, snackbar messages, error events that shouldn't re-trigger when the screen rotates. You know that bug where a snackbar shows again after rotation? SharedFlow solves it.

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

The workhorse. The bread and butter. `map` transforms each emitted value — what goes in as type A comes out as type B. If you've used `map` on a list, this is the same concept, just applied to a stream over time.

```kotlin
val orderTotals: Flow<List<String>> = orderDao.observeOrders()
    .map { orders ->
        orders.map { "$${String.format("%.2f", it.total)}" }
    }
```

Real-world use case: mapping database entities to domain models, formatting raw values for display, converting API response DTOs.

### filter

Keeps only values that match a predicate. Everything else gets silently dropped. It's the bouncer at the door of your data pipeline.

```kotlin
val activeOrders: Flow<List<Order>> = orderDao.observeOrders()
    .map { entities -> entities.map { it.toDomain() } }
    .filter { orders -> orders.isNotEmpty() }
```

### transform

Now here's where it gets interesting. `transform` is more powerful than `map` — you can emit zero, one, or multiple values for each input. It gives you a `FlowCollector`, so you call `emit()` explicitly. With `map`, one value in means exactly one value out. With `transform`, one value in could mean two values out, or five, or none.

Why would you want that? Imagine you're loading order details. You want to show a placeholder immediately while the real data loads. That's two emissions for one input.

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

This is probably the operator I use the most in ViewModels. `combine` takes the latest values from multiple flows and merges them together. Every time any flow emits, the combine function runs with the latest value from each flow.

Think of it like a dashboard display in a car. Your speedometer, fuel gauge, and temperature gauge all update independently. But the dashboard always shows the latest reading from each one. That's `combine`.

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

`zip` pairs values from two flows by position — first with first, second with second. Unlike `combine`, `zip` waits for both flows to emit before producing a value. The resulting flow completes when the shorter flow completes.

The difference is subtle but important. `combine` says "give me the latest from each." `zip` says "give me the next unused value from each." If flow A emits three times and flow B emits once, `combine` produces three results (reusing B's latest), but `zip` produces only one (pairing A's first with B's first, then stopping when B is done).

```kotlin
val paired: Flow<Pair<User, UserStats>> =
    userFlow.zip(statsFlow) { user, stats ->
        Pair(user, stats)
    }
```

Real-world use case: pairing request-response patterns, combining two data sources that emit in lockstep, or correlating events by index.

### merge

`merge` is the simplest combinator. It takes multiple flows and funnels them into a single flow. Values are emitted as they arrive from any source, maintaining their original timing. No waiting, no pairing — each flow contributes independently. It's like merging lanes on a highway. Cars from each lane just... join the main road.

```kotlin
val allNotifications: Flow<Notification> = merge(
    pushNotifications,
    localReminders,
    systemAlerts
)
```

Real-world use case: merging events from multiple sources into a single event stream, combining updates from different sensors or data feeds.

## FlatMap Operators

The flatMap family is where Flow starts feeling really powerful — and where most people start getting confused. The core idea: for each value in your source flow, you create a new flow. The question is, what do you do when multiple inner flows are in play?

### flatMapConcat

Sequential. Patient. One at a time. For each value in the source flow, `flatMapConcat` creates a new flow and waits for it to complete before starting the next one. It's like a single-lane drive-through — the next car doesn't order until the current one has their food and has driven off.

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

Like `flatMapConcat`, but the inner flows run concurrently. The `concurrency` parameter (default 16) controls how many inner flows run simultaneously. Now your drive-through has four windows open at the same time.

```kotlin
val allResults: Flow<SearchResult> = searchQueries.asFlow()
    .flatMapMerge(concurrency = 4) { query ->
        flow { emit(searchService.search(query)) }
    }
```

Real-world use case: parallel API calls for multiple items, concurrent image downloads, batch processing with controlled parallelism.

> **🧠 Think about it:** If `flatMapMerge` defaults to 16 concurrent inner flows, what happens if your source flow emits 100 items? Does it launch 100 coroutines? No — it processes them in batches of 16. The 17th item waits until one of the first 16 completes. That's built-in backpressure, and it's one of the reasons Flow is so well-designed.

### flatMapLatest

This one's my favorite. `flatMapLatest` cancels the previous inner flow when a new value arrives. Only the latest inner flow's emissions make it downstream. It's like a GPS recalculating your route — the moment you make a wrong turn, it throws away the old directions and starts fresh.

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

Imagine a user typing "kotlin coroutines" into a search box. That's 18 characters. Do you really want to fire 18 API calls? Obviously not. `debounce` waits for a specified time after the last emission before forwarding the value. If a new value arrives before the timeout, the timer resets. It's like an elevator that keeps the doors open as long as people keep walking in — it only closes (and moves) after nobody has entered for a few seconds.

```kotlin
val debouncedSearch: Flow<String> = searchQueryFlow
    .debounce(300L)  // wait 300ms after last keystroke
    .filter { it.length >= 2 }
    .distinctUntilChanged()
```

Real-world use case: search-as-you-type without hammering the API on every keystroke. The 300ms debounce means the search only fires after the user pauses typing.

### distinctUntilChanged

Filters out consecutive duplicate values. If the same value comes through twice in a row, the second one gets dropped. StateFlow does this internally, but for regular flows it's essential to prevent redundant processing.

```kotlin
val locationUpdates: Flow<City> = locationFlow
    .map { location -> geocoder.getCity(location) }
    .distinctUntilChanged()  // only emit when city actually changes
```

### buffer and conflate

**`buffer()`** creates a separate coroutine for the collector, so a slow collector doesn't back-pressure the emitter. The emitter can keep producing values while the collector processes at its own pace. Think of it as adding a conveyor belt between the kitchen and the waiter — the chef doesn't have to stop cooking just because the waiter is busy serving a table.

**`conflate()`** is like `buffer()` but only keeps the latest value. If the collector is slow, intermediate values are dropped. This is useful for UI updates where only the latest state matters. Imagine a stock ticker — you don't care about the price from 2 seconds ago, you care about the price right now.

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

Things go wrong. Networks time out, servers return 500s, parsing fails. `catch` grabs exceptions from upstream operators and emitters, and lets you handle them gracefully — emit a fallback value, log the error, show a message. It runs in the context of the collector, so it can emit values just like any other operator.

```kotlin
val orders: Flow<List<Order>> = orderRepository.observeOrders()
    .catch { exception ->
        emit(emptyList())  // fallback value on error
        analytics.logError("order_load_failed", exception)
    }
```

But wait — there's a gotcha that trips people up all the time. `catch` only catches exceptions from operators *above* it in the chain. It does not catch exceptions in the `collect` block. If your collector can throw, wrap the `collect` call in a try/catch. I've seen this bug in production more than once — someone adds a `catch` operator and assumes they're fully covered. They're not.

> **🔥 Real talk:** I once spent an hour debugging why a `catch` operator wasn't catching a crash, only to realize the exception was being thrown inside `collect`, not upstream. The fix was a one-line try/catch. The lesson was permanent.

### retry and retryWhen

Sometimes the right response to an error is just... try again. `retry` automatically restarts the flow when an exception occurs. Useful for transient network errors where the second attempt often succeeds.

```kotlin
val reliableOrders: Flow<List<Order>> = flow {
    emit(orderApi.fetchOrders())
}
    .retry(retries = 3) { cause ->
        cause is IOException  // only retry network errors
    }
    .catch { emit(emptyList()) }  // final fallback
```

`retryWhen` gives you the attempt count, so you can implement exponential backoff. This is important — if a server is struggling, hammering it with retries every 100ms makes things worse. Back off gradually to give it breathing room.

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

Once you see operators as composable building blocks rather than a list of APIs to memorize, everything clicks. You stop asking "which operator do I use?" and start asking "what behavior do I need?" — and the operator practically picks itself.

> **💡 The "aha" moment:** Flow operators aren't magic incantations to memorize. Each one solves exactly one problem — timing, concurrency, transformation, error recovery. Learn the problem each operator solves, and you'll never have to look up which one to use.

The biggest mistake I see is reaching for complex operators when simple sequential code would be clearer. If you're doing one API call and mapping the result, a `flow { }` builder with `map` is all you need. Don't use `flatMapMerge` because it sounds impressive — use it because you need concurrent processing with backpressure control. The best Flow code reads like a description of what you want, not how to achieve it.

Thanks for reading!
