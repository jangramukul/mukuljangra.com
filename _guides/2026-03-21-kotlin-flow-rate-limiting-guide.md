---
title: Kotlin Flow Rate Limiting Guide
layout: post
sequence: 115
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Search-as-you-type, accelerometer data streaming at 100Hz, a user mashing a "Submit Order" button six times in two seconds. These are all the same problem: the upstream produces faster than the downstream can handle, and if you don't control the rate, you're burning through API calls, allocating objects you'll never use, or processing duplicate actions. I've hit all three in production.

Kotlin Flow gives you `debounce` and `sample` out of the box. It doesn't ship `throttleFirst` or `throttleLatest` like RxJava did, but building them takes about ten lines. The key is understanding which operator matches your problem — they look similar but behave very differently.

## debounce

`debounce` waits for a pause in emissions. When a value arrives, it starts a timer. If another value arrives before the timer expires, the previous value is dropped and the timer resets. Only when the upstream goes quiet for the specified duration does the latest value pass through. This is exactly what you want for search-as-you-type: you don't want to fire an API call on every keystroke, you want to wait until the user stops typing.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val searchResults: StateFlow<List<SearchResult>> = _query
        .debounce(300)
        .filter { it.length >= 2 }
        .mapLatest { query ->
            searchRepository.search(query)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    fun onQueryChanged(text: String) {
        _query.value = text
    }
}
```

Why 300ms? It's not arbitrary. The average gap between keystrokes during active typing is 100-200ms. Setting debounce to 300ms means you're waiting for a pause longer than the inter-keystroke gap — the user has likely finished a word. Go lower (100ms) and you fire on almost every keystroke. Go higher (800ms) and the UI feels sluggish. I've tested 250-400ms across several apps and 300ms consistently feels responsive without being wasteful.

Internally, `debounce` uses a coroutine `delay()`. When a new value arrives, it cancels the previous delay and starts a new one. The implementation creates a new coroutine for each emission, cancels the previous one, and only lets the value through if the delay completes. This plays nicely with structured concurrency — when the collecting scope is cancelled, internal delays are cancelled too.

One thing worth noting: `debounce` with `StateFlow` has a subtle interaction. `StateFlow` is conflated by default — it drops intermediate values when the collector is slow. If your debounce timeout is very short and the collector is doing heavy work, you might see fewer emissions than expected. For search this is usually fine because you only care about the latest query.

## sample

`sample` takes a completely different approach. Instead of waiting for silence, it checks the upstream at fixed intervals and emits whatever the most recent value was. Values that arrive between samples are quietly dropped. This is the right tool when you have a continuous, high-frequency data source and you want to downsample to a manageable rate.

```kotlin
class LocationTracker(
    private val locationProvider: FusedLocationProviderClient
) {
    fun locationUpdates(): Flow<Location> = callbackFlow {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, 500
        ).build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { trySend(it) }
            }
        }

        locationProvider.requestLocationUpdates(
            request, callback, Looper.getMainLooper()
        )
        awaitClose { locationProvider.removeLocationUpdates(callback) }
    }
}

class MapViewModel(private val tracker: LocationTracker) : ViewModel() {

    val displayLocation: StateFlow<Location?> = tracker
        .locationUpdates()
        .sample(1000) // update map pin once per second
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
}
```

The key difference from `debounce`: `sample` emits on a fixed schedule regardless of how fast or slow the upstream is. If the upstream emits 100 values per second and you sample every 1000ms, you get 1 value per second — the most recent one at each tick. If the upstream emits nothing during a sample window, `sample` emits nothing for that window. It never repeats old values.

Where people get this wrong is using `sample` for user input. A search bar with `sample(300)` would fire a search for "kot" at the 300ms mark and another for "kotlin" at 600ms — two API calls instead of one. With `debounce`, you fire one call for "kotlin" after the user stops. For search, `debounce` is correct. For continuous data streams, `sample` is correct.

## throttleFirst and throttleLatest

Kotlin's `kotlinx.coroutines` library doesn't include `throttleFirst` or `throttleLatest`. RxJava had both, and they're useful enough to build for specific scenarios.

**throttleFirst** emits the first value it receives, then ignores everything for a specified duration. After the window expires, the next value that arrives starts a new window. This is perfect for button clicks — you want to process the first tap immediately, then ignore rapid re-taps for a short period.

```kotlin
fun <T> Flow<T>.throttleFirst(windowMs: Long): Flow<T> = flow {
    var lastEmissionTime = 0L
    collect { value ->
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastEmissionTime >= windowMs) {
            lastEmissionTime = currentTime
            emit(value)
        }
    }
}
```

**throttleLatest** works differently. When a value arrives, it starts a timer. When the timer expires, it emits the most recent value received during that window. It's like a combination of `debounce` and `sample` — it gives you the latest value at regular intervals, but only when there's actually data flowing.

```kotlin
fun <T> Flow<T>.throttleLatest(windowMs: Long): Flow<T> = flow {
    coroutineScope {
        var latest: T? = null
        var hasValue = false
        var timerJob: Job? = null

        collect { value ->
            latest = value
            hasValue = true

            if (timerJob?.isActive != true) {
                timerJob = launch {
                    delay(windowMs)
                    if (hasValue) {
                        this@flow.emit(latest as T)
                        hasValue = false
                    }
                }
            }
        }
    }
}
```

Here's where I'd use each. For a "Place Order" button, `throttleFirst` — the user taps, you process immediately, and ignore the next 500ms of taps. For a real-time dashboard receiving price updates at varying rates, `throttleLatest` — you want the most current price at a controlled rate.

```kotlin
class CheckoutViewModel(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _orderClicks = MutableSharedFlow<Unit>()

    val orderState: StateFlow<OrderState> = _orderClicks
        .throttleFirst(1000)
        .mapLatest { orderRepository.placeOrder() }
        .map { result -> OrderState.Success(result) }
        .catch { emit(OrderState.Error(it.message ?: "Order failed")) }
        .stateIn(viewModelScope, SharingStarted.Lazily, OrderState.Idle)

    fun onPlaceOrderClicked() {
        viewModelScope.launch { _orderClicks.emit(Unit) }
    }
}
```

I want to be honest about the tradeoff: building your own operators means you own the maintenance. The built-in operators are tested against edge cases around cancellation and thread safety. For the simple `throttleFirst` above, `System.currentTimeMillis()` works because Flow collection is sequential. But for complex operators, test thoroughly with Turbine.

## distinctUntilChanged

`distinctUntilChanged` filters out consecutive duplicate emissions. If the upstream emits the same value twice in a row, the second one is dropped. On its own, that's useful for any `StateFlow`-like behavior where you don't want to re-process identical state. But paired with `debounce`, it becomes essential for search.

Consider this: the user types "kotlin", pauses (debounce fires, API called), adds a space by accident and immediately deletes it. The text is "kotlin" again. Without `distinctUntilChanged`, your debounce fires a second API call for the exact same query — a wasted request and unnecessary loading state flicker.

```kotlin
val searchResults: StateFlow<List<SearchResult>> = queryFlow
    .debounce(300)
    .distinctUntilChanged() // skip if query text hasn't actually changed
    .filter { it.length >= 2 }
    .mapLatest { query ->
        searchRepository.search(query)
    }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
```

The order matters. `distinctUntilChanged` comes after `debounce` because you want to deduplicate the debounced values, not the raw keystrokes. If you put it before `debounce`, you'd miss the case where the user types "kotlin" → "kotlinx" → "kotlin" — the second "kotlin" isn't consecutive relative to the raw stream.

`distinctUntilChanged` also accepts a custom comparator for when your emissions are objects and you only care about certain fields:

```kotlin
locationUpdates()
    .sample(1000)
    .distinctUntilChanged { old, new ->
        // Ignore updates within ~10 meters
        old.distanceTo(new) < 10f
    }
    .collect { location ->
        updateMapPin(location)
    }
```

## Combining Rate Limiting Operators

The real power is in combining these operators into a pipeline. Each operator handles one concern, and together they form a rate-limiting strategy that's readable, testable, and efficient.

For search, the production pattern I use is `debounce` + `distinctUntilChanged` + `filter` + `mapLatest`. Each operator handles one concern. `debounce` waits for the user to stop typing. `distinctUntilChanged` prevents redundant calls for the same query. `filter` enforces minimum query length. `mapLatest` cancels in-flight searches when a new query arrives.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val _query = MutableStateFlow("")

    val searchResults: StateFlow<SearchUiState> = _query
        .debounce(300)
        .distinctUntilChanged()
        .map { it.trim() }
        .filter { it.length >= 2 }
        .mapLatest { query -> searchRepository.search(query) }
        .map { results -> SearchUiState.Results(results) }
        .catch { emit(SearchUiState.Error(it.message ?: "Search failed")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SearchUiState.Idle)
}
```

For a dashboard with multiple data streams, combine `sample` with `combine` to normalize update frequencies:

```kotlin
class DashboardViewModel(
    private val stockRepo: StockRepository,
    private val newsRepo: NewsRepository
) : ViewModel() {

    val dashboardState: StateFlow<DashboardState> = combine(
        stockRepo.priceUpdates()
            .sample(2000)
            .distinctUntilChanged(),
        newsRepo.liveHeadlines()
            .sample(30_000)
    ) { price, headlines ->
        DashboardState(currentPrice = price, headlines = headlines)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DashboardState.Empty)
}
```

One thing I want to emphasize: these operators compose because they're all just `Flow` transformations. There's no special type system (unlike RxJava where `Observable` vs `Flowable` backpressure semantics mattered). A `Flow<T>` goes in, a `Flow<T>` comes out.

The tradeoff of pipelining is debuggability. When something isn't emitting when you expect, you need to figure out which operator is swallowing the value. My approach is to add temporary `.onEach { log("after debounce: $it") }` taps between operators during development, then remove them before committing.

## Quiz

**Question 1.** A search bar uses `debounce(300)`. The user types "k", waits 200ms, types "o", waits 200ms, types "t", then stops. How many values pass through the debounce, and what are they?

**Wrong**: Three values pass through — "k", "ko", and "kot" — because the user paused 200ms between each keystroke.

**Correct**: One value — "kot". Each keystroke resets the 300ms timer. Since the gap between keystrokes is only 200ms, the timer never expires until after the final "t". Only then does 300ms pass without new input, and "kot" is emitted.

**Question 2.** You replace `debounce(300)` with `sample(300)` in a search bar. The user types "kotlin" evenly over 500ms. How does the behavior change compared to debounce?

**Wrong**: The behavior is the same — both wait 300ms and emit the latest value.

**Correct**: `sample` checks the flow at fixed 300ms intervals. At the 300ms mark, it emits whatever the latest value is (probably "kot"). At 600ms, it emits "kotlin". That's two API calls instead of one. With `debounce`, the timer resets on every keystroke, so you get a single "kotlin" emission 300ms after the last key. For user input, `debounce` is almost always right. `sample` is for continuous data streams.

## Coding Challenge

Build a `NotificationCenter` that receives events via a `MutableSharedFlow<NotificationEvent>`. Apply `throttleFirst(5000)` to prevent the same notification type from showing more than once every 5 seconds, `distinctUntilChanged` with a custom comparator to avoid duplicate messages, and `debounce(500)` on a separate "mark all as read" flow to prevent accidental double-processing. Write Turbine tests for each operator verifying that rapid duplicates are filtered correctly.

Thanks for reading!
