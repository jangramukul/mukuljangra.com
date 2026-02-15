---
title: stateIn vs shareIn — When to Use Which and Why
layout: post
sequence: 31
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
---

I spent an entire afternoon debugging why my search screen was dropping results. The ViewModel looked correct — a `combine` of search query and filter flows, piped through the repository, converted with `shareIn`. Clean, reactive, textbook. Except every time a new collector subscribed (say, after a configuration change), it got nothing. No loading indicator, no cached results, no initial value at all. Just a blank screen until the user typed again.

The problem was one word: `shareIn` instead of `stateIn`. They look nearly identical in the API — both convert a cold `Flow` into a hot shared flow, both take a scope and a `SharingStarted` strategy. But their semantics are fundamentally different, and choosing the wrong one creates bugs that are maddening to track down because the code looks perfectly fine.

## StateFlow vs SharedFlow — The Fundamental Divide

Before getting into `stateIn` and `shareIn` themselves, it's worth understanding what they produce, because the distinction between `StateFlow` and `SharedFlow` is the entire reason both operators exist.

**StateFlow is a value holder.** It always has a current value — you can read `stateFlow.value` at any time, synchronously, and you'll get something back. It replays exactly one value (the current one) to new subscribers. And it uses **equality-based conflation** — if you emit a value that's `equals()` to the current one, nothing happens. No emission, no notification, no recomposition. Internally, it's a single atomic slot. Every write overwrites, every read gets the latest. The Kotlin docs describe it as equivalent to a `SharedFlow` with `replay = 1`, `onBufferOverflow = DROP_OLDEST`, plus `distinctUntilChanged`. That's the precise mental model.

**SharedFlow is a broadcast channel.** It does not necessarily hold a current value — that depends on the `replay` parameter. With `replay = 0` (the default), it carries no history at all. It doesn't conflate, so duplicate emissions are delivered normally. And it supports configurable buffering, which means you can control how it handles backpressure when subscribers can't keep up. Internally, it maintains a replay cache and an optional buffer, and it distributes every emission to every active subscriber.

The way I think about it: `StateFlow` models **what something is right now** — the current search results, the current user profile, the loading state. `SharedFlow` models **what happened** — an analytics event fired, a payment was processed, a notification arrived. This maps directly to the state-vs-event distinction that comes up constantly in Android architecture.

## What stateIn Actually Does

`stateIn` converts a cold `Flow` into a `StateFlow`. The key consequence of this is that the result **always has a current value**, which you provide via the `initialValue` parameter.

```kotlin
class SearchViewModel(
    private val repository: SearchRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val searchQuery = savedStateHandle.getStateFlow("query", "")
    private val selectedFilter = savedStateHandle.getStateFlow("filter", Filter.ALL)

    val searchResults: StateFlow<UiState<List<SearchResult>>> =
        combine(searchQuery, selectedFilter) { query, filter ->
            query to filter
        }
        .debounce(300)
        .flatMapLatest { (query, filter) ->
            repository.search(query, filter)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = UiState.Loading
        )
}
```

New collectors immediately receive the current value — either `initialValue` if the upstream hasn't emitted yet, or the most recent upstream emission. There's no "waiting for the first emission" state. This is what makes `stateIn` perfect for UI state — your composable can call `collectAsStateWithLifecycle()` and always has something to render.

The other critical behavior is **conflation**. `StateFlow` only cares about the latest value. If the upstream emits values faster than the collector processes them, intermediate values are dropped. Under the hood, `StateFlow` is backed by a single atomic slot — every emission overwrites the previous value, and every collection reads from that slot. This is why equality-based conflation exists too — if you emit the same value twice, the second emission is ignored because `StateFlow` compares with `equals()` and skips duplicates. In Compose, this means `StateFlow` won't trigger recomposition if the state object hasn't actually changed, provided your data classes have correct `equals()` implementations.

### Why initialValue Matters

The `initialValue` parameter isn't just a formality. It's the value your UI renders before the upstream flow has a chance to emit anything. Get it wrong and you get visual glitches. Set it to an empty list and the user sees a blank screen flash before the real data loads. Set it to `null` and you push null-handling into every composable that reads this state.

The pattern I use almost everywhere is a sealed class with an explicit `Loading` state as the initial value. This lets the UI show a shimmer or skeleton immediately, without any blank-screen flicker. If you need something more specific — say, a cached value from DataStore — you can use the suspending overload of `stateIn` (no `initialValue`, no `started`). It suspends until the first upstream emission and uses that as the initial value. But it suspends the calling coroutine, so it's only useful in specific initialization patterns, not in property declarations.

## What shareIn Actually Does

`shareIn` converts a cold `Flow` into a `SharedFlow`. The critical difference: **a SharedFlow does not necessarily have a current value**. Its behavior depends entirely on the `replay` parameter.

With `replay = 0` (the default), new subscribers get nothing from the past. They only see emissions that happen after they start collecting. With `replay = 1`, it caches the last emission and replays it — more like `StateFlow`, but without `initialValue` or equality-based conflation. If nothing has been emitted yet, a subscriber with `replay = 1` still gets nothing.

```kotlin
class AnalyticsViewModel(
    private val tracker: AnalyticsTracker
) : ViewModel() {

    val analyticsEvents: SharedFlow<AnalyticsEvent> =
        tracker.events()
            .shareIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                replay = 0
            )
}
```

`SharedFlow` does not conflate by default. If the upstream emits three values rapidly, all three are delivered to subscribers (assuming they can keep up). This makes `SharedFlow` appropriate for event streams where every emission matters — analytics events, log entries, or notifications where dropping an intermediate value would mean losing data.

### Replay and Buffer Configuration

`SharedFlow` gives you fine-grained control over buffering through three parameters when created with `MutableSharedFlow()`, and `shareIn` maps to these under the hood.

**`replay`** controls how many past values new subscribers receive when they first start collecting. `replay = 0` means no history. `replay = 3` means every new subscriber immediately gets the last 3 emissions. The replay cache also serves as part of the buffer — emissions stored in replay don't count toward backpressure.

**`extraBufferCapacity`** adds buffer space beyond the replay cache. This is where backpressure management lives. If you have `replay = 1` and `extraBufferCapacity = 10`, your SharedFlow can hold 11 values before it needs to make a decision about what to do with a slow subscriber. When using `shareIn`, you configure this through the `buffer()` operator before the `shareIn` call — `buffer(10).shareIn(scope, started, 1)` creates a SharedFlow with `replay = 1` and `extraBufferCapacity = 10`.

**`onBufferOverflow`** decides what happens when the total buffer (replay + extra) is full and a subscriber is too slow. There are three strategies:

- **`BufferOverflow.SUSPEND`** (default) — the emitter suspends until buffer space opens up. Safe but can slow down the producer if any subscriber is lagging.
- **`BufferOverflow.DROP_OLDEST`** — the oldest buffered value is dropped to make room. This is what `conflate()` does — slow subscribers always get the latest value, but skip intermediate ones. Good for sensor data or position updates.
- **`BufferOverflow.DROP_LATEST`** — the newest value is dropped when the buffer is full. Preserves historical order but discards new data. Rarely used in practice, but useful when the first N values in a burst matter more than the most recent.

One important detail from the Kotlin docs: buffer overflow only triggers when at least one subscriber exists and can't keep up. With no subscribers, only the replay cache is maintained and emissions beyond it are silently dropped regardless of the overflow strategy.

## The SharingStarted Strategies

Both `stateIn` and `shareIn` accept a `SharingStarted` parameter that controls when the upstream collection starts and stops. There are three built-in strategies, and each one fits a specific lifecycle pattern.

### SharingStarted.Eagerly

Starts collecting from the upstream immediately when `stateIn`/`shareIn` executes, and never stops until the scope is cancelled. The upstream flow stays active even if nobody is observing the result.

```kotlin
val userPreferences: StateFlow<UserPreferences> =
    preferencesRepository.observe()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = UserPreferences.DEFAULT
        )
```

Use this for state that must be up-to-date at all times — user preferences, authentication status, feature flags, or anything that other parts of your ViewModel depend on immediately. The tradeoff is resource usage — if the upstream involves a database observer or network connection, it runs for the entire lifetime of the scope whether anyone is watching or not.

One thing to be aware of with `Eagerly` and `shareIn`: any values emitted before the first subscriber appears are lost (except those stored in the replay cache). With `stateIn` this isn't an issue because the StateFlow always holds the latest value. But with `shareIn(replay = 0)`, early emissions go nowhere.

### SharingStarted.Lazily

Starts collecting when the first subscriber appears, then never stops. This is a one-way activation — once started, it stays active for the lifetime of the scope regardless of whether subscribers come and go.

The key advantage over `Eagerly` is that the first subscriber is guaranteed to receive all emissions from the start of the upstream flow, not just whatever was captured in the replay cache. This makes `Lazily` a good fit when the upstream does one-time initialization work that shouldn't be repeated, or when you want to defer expensive setup until the data is actually needed.

### SharingStarted.WhileSubscribed

This is the one you'll use most in ViewModels. It starts when the first subscriber appears and stops after the last subscriber disappears — but with configurable delays.

**`stopTimeoutMillis`** (default: 0) — the delay between the last subscriber disappearing and the upstream being stopped. This is where the famous `5_000` comes from in Android.

**`replayExpirationMillis`** (default: `Long.MAX_VALUE`) — the delay between the upstream stopping and the replay cache being reset. For `stateIn`, "resetting" means the StateFlow's value goes back to `initialValue`. For `shareIn`, the replay cache is emptied.

```kotlin
val orderStatus: StateFlow<OrderStatus> =
    combine(
        orderRepository.observeOrder(orderId),
        paymentRepository.observePayment(orderId),
        shippingRepository.observeTracking(orderId)
    ) { order, payment, shipping ->
        OrderStatus(order, payment, shipping)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(
            stopTimeoutMillis = 5_000,
            replayExpirationMillis = Long.MAX_VALUE
        ),
        initialValue = OrderStatus.Loading
    )
```

The 5-second stop timeout isn't arbitrary. When a configuration change happens — screen rotation, dark mode toggle — the old Activity is destroyed and a new one is created. During this window, there are zero subscribers. This gap is typically under 1 second. Without the timeout, the upstream would stop and restart on every rotation, re-fetching data and losing in-memory state. The 5-second buffer covers the configuration change window. But when the user actually leaves — presses home, switches apps — the timeout expires and the upstream stops, releasing database observers, network connections, and flow collections.

I almost never change `replayExpirationMillis` from its default. If you set it to, say, 5 seconds, the StateFlow resets to `initialValue` shortly after the upstream stops. This causes a flash of loading state when the user returns to the screen, which is usually worse than showing slightly stale data.

## shareIn in the Repository Layer

One pattern that's underused is `shareIn` at the repository level, not just in ViewModels. When multiple ViewModels need the same upstream data — say, a real-time WebSocket connection to a payment service — sharing at the repository avoids duplicate connections.

```kotlin
class PaymentRepository(
    private val paymentApi: PaymentApi,
    private val scope: CoroutineScope
) {
    val paymentUpdates: SharedFlow<PaymentUpdate> =
        paymentApi.observePayments()
            .retry { e ->
                val shouldRetry = e is IOException
                if (shouldRetry) delay(2_000)
                shouldRetry
            }
            .shareIn(
                scope = scope,
                started = SharingStarted.WhileSubscribed(10_000),
                replay = 1
            )
}
```

Notice the scope here isn't `viewModelScope` — it's a broader application or feature scope. If you scoped this to a single ViewModel, the sharing dies when that ViewModel clears, killing the connection for every other consumer. The repository uses `replay = 1` so that any new ViewModel subscriber immediately gets the latest payment update without waiting for the next WebSocket message.

This pattern works for caching expensive API calls too. If you have a user profile endpoint that multiple screens reference, wrapping it in `stateIn` at the repository level with `Eagerly` or `Lazily` means the network call happens once, and every ViewModel gets the cached result instantly.

```kotlin
class UserRepository(
    private val userApi: UserApi,
    private val scope: CoroutineScope
) {
    val currentUser: StateFlow<User?> =
        userApi.observeCurrentUser()
            .stateIn(
                scope = scope,
                started = SharingStarted.Lazily,
                initialValue = null
            )
}
```

The tradeoff is lifecycle management. You're now responsible for cancelling `scope` when the feature or app no longer needs this data. In a ViewModel, `viewModelScope` handles this automatically. In a repository, you need to think about it explicitly — typically by tying the scope to a DI component's lifecycle.

## The Upstream/Downstream Mental Model

Here's the way I think about this that cleared up a lot of confusion for me. In a ViewModel, you have three layers:

**Upstream** is everything that produces data — repository calls, database observations, `combine()`, `map()`, `filter()`. This is the cold `Flow` pipeline that describes how to get data.

**The bridge** is `stateIn` or `shareIn`. This is the point where the cold upstream converts into a hot flow that can have multiple subscribers.

**Downstream** is everything that consumes the hot flow — `collectAsStateWithLifecycle()` in your composables, or any other collector.

The `SharingStarted` strategy controls the bridge. It decides when the upstream starts working and when it stops, based on what's happening downstream. `WhileSubscribed(5_000)` means: "keep the upstream alive as long as there's at least one downstream collector, plus 5 seconds of grace period."

This mental model helps with debugging. If your UI isn't getting updates, trace the path: is the upstream emitting? Is the bridge active (check `SharingStarted`)? Is the downstream collecting (check lifecycle)? Most bugs I've seen sit at the bridge level — wrong `SharingStarted` strategy, wrong operator (`shareIn` where `stateIn` was needed), or wrong scope.

## When to Use Which

The reframe for me was realizing these aren't interchangeable convenience functions — they represent fundamentally different data flow models. **`stateIn` says "there is always a current value, and I only care about the latest." `shareIn` says "every emission is significant, and I don't assume there's a default."** Once that distinction clicked, choosing between them became obvious for every use case.

**Use `stateIn` when the consumer only cares about the latest value.** Search results, form state, list data, loading indicators, user profiles — anything the UI renders as persistent state. The `initialValue` gives your composable something to show immediately, the equality-based conflation prevents unnecessary recompositions, and the `.value` property lets you read state synchronously from event handlers.

**Use `shareIn` when every emission carries independent meaning.** Analytics events, error notifications, payment confirmations, log streams — anything where dropping an intermediate value would be a bug, not an optimization. Configure `replay` based on whether late subscribers need history (`replay = 1` for latest-event-needed patterns, `replay = 0` for fire-and-forget broadcasts).

**Use `stateIn` with `Eagerly` for always-on state.** User preferences, feature flags, auth tokens — state that other flows or logic depend on and must never be stale. Accept the resource cost of keeping the upstream alive permanently.

**Use `shareIn` in repositories for shared upstreams.** WebSocket connections, polling intervals, database observers that multiple ViewModels consume. Share the connection at the data layer, not at the UI layer, to avoid duplicate work.

**Default to `stateIn` with `WhileSubscribed(5_000)` when unsure.** It's the right choice about 80% of the time in Android ViewModels. It handles configuration changes, releases resources when the user leaves, and gives the UI a guaranteed value to render. If you discover you need event semantics or custom buffering later, switch to `shareIn` — but that's a deliberate architectural decision, not a default.

## Common Mistakes

**Using `stateIn` for events.** Because `StateFlow` conflates, rapid events get dropped. If your ViewModel emits three navigation events quickly, only the last one arrives. Worse, `StateFlow`'s equality check means emitting the same event twice does nothing — the second emission is silently swallowed. For events, use `shareIn` with `replay = 0` or a `Channel`.

**Using `shareIn` without replay for state.** This is what caused my blank screen bug. Without replay, new subscribers don't get the current value. After a configuration change, the UI has nothing to render until the upstream emits again. For state the UI needs to display, always use `stateIn` or at minimum `shareIn(replay = 1)` — but at that point, `stateIn` is clearer about your intent and gives you the `initialValue` safety net.

**Scoping to the wrong CoroutineScope.** If you use `GlobalScope` or a custom scope instead of `viewModelScope`, the shared flow outlives your ViewModel. Data keeps flowing, memory isn't released, and you've created a leak. Always scope ViewModel flows to `viewModelScope`. For repository-level sharing, tie the scope to the DI component's lifecycle.

**Ignoring `BufferOverflow` with `shareIn`.** The default is `SUSPEND`, which means a single slow subscriber can stall every other subscriber's emissions. For event streams where you'd rather drop stale events than block the producer, use `conflate().shareIn(...)` or configure `buffer(capacity, BufferOverflow.DROP_OLDEST)` before `shareIn`.

The one thing I wish someone told me earlier: `stateIn` and `shareIn` are not utility functions. They're architectural decisions about how data flows through your app. `StateFlow` is a reactive variable. `SharedFlow` is a broadcast mechanism. Pick based on what your data semantically represents, and the right `SharingStarted` strategy and buffer configuration will follow naturally from there.

Thanks for reading!
