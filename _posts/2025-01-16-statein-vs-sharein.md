---
title: stateIn vs shareIn — When to Use Which and Why
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
---

I spent an entire afternoon debugging why my search screen was dropping results. The ViewModel looked correct — a `combine` of search query and filter flows, piped through the repository, converted with `shareIn`. Clean, reactive, textbook. Except every time a new collector subscribed (say, after a configuration change), it got nothing. No loading indicator, no cached results, no initial value at all. Just a blank screen until the user typed again.

The problem was one word: `shareIn` instead of `stateIn`. They look nearly identical in the API — both convert a cold `Flow` into a hot shared flow, both take a scope and a `SharingStarted` strategy. But their semantics are fundamentally different, and choosing the wrong one creates bugs that are maddening to track down because the code looks perfectly fine.

## What stateIn Actually Does

`stateIn` converts a cold `Flow` into a `StateFlow`. The key properties of `StateFlow` that matter here are all consequences of one design decision: **a StateFlow always has a current value**.

When you call `stateIn`, you provide an `initialValue`. From that point forward, the resulting `StateFlow` holds exactly one value — the latest emission from the upstream flow, or the initial value if nothing has been emitted yet. New collectors immediately receive this current value. There's no "waiting for the first emission" — the value is already there.

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

The other critical behavior is **conflation**. `StateFlow` only cares about the latest value. If the upstream emits values faster than the collector processes them, intermediate values are dropped. This is exactly what you want for UI state — if the search results update three times in 16 milliseconds, the UI only needs to render the final result. The first two are irrelevant because they'd never be visible to the user anyway.

Under the hood, `StateFlow` is backed by a single atomic slot. Every emission overwrites the previous value. Every collection reads from that slot. This is why `StateFlow` also has equality-based conflation — if you emit the same value twice, the second emission is ignored entirely because `StateFlow` compares with `equals()` and skips duplicates. This is important to know because it means `StateFlow` won't trigger recomposition in Compose if the state object hasn't actually changed, provided your data classes have correct `equals()` implementations.

## What shareIn Actually Does

`shareIn` converts a cold `Flow` into a `SharedFlow`. The critical difference: **a SharedFlow does not necessarily have a current value**. Its behavior depends entirely on the `replay` parameter.

With `replay = 0` (the default), new subscribers get nothing from the past. They only see emissions that happen after they start collecting. With `replay = 1`, it behaves more like `StateFlow` — it caches the last emission and replays it. But there's no `initialValue` parameter. If nothing has been emitted yet, a subscriber with `replay = 1` still gets nothing.

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

`SharedFlow` does not conflate by default. If the upstream emits three values rapidly, all three are delivered to subscribers (assuming they can keep up, governed by `BufferOverflow` strategy). This makes `SharedFlow` appropriate for event streams where every emission matters — analytics events, log entries, or notifications where dropping an intermediate value would mean losing data.

The mental model I use: `StateFlow` is a "current value holder" — like a variable that notifies observers when it changes. `SharedFlow` is a "broadcast channel" — like an event bus that distributes emissions to all subscribers.

## The SharingStarted Strategies

Both `stateIn` and `shareIn` accept a `SharingStarted` parameter that controls when the upstream collection starts and stops. This is where most of the practical decision-making happens.

**`SharingStarted.Eagerly`** starts collecting from the upstream immediately when the `stateIn`/`shareIn` call executes, and never stops until the scope is cancelled. The upstream flow stays active even if nobody is observing the result. Use this for state that must be up-to-date at all times — like user preferences or authentication status that your app needs regardless of what screen is visible.

```kotlin
val userPreferences: StateFlow<UserPreferences> =
    preferencesRepository.observe()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = UserPreferences.DEFAULT
        )
```

**`SharingStarted.Lazily`** starts collecting from the upstream when the first subscriber appears, and then never stops. This is a one-way activation — once started, it stays active for the lifetime of the scope. Useful when you want to avoid doing work until someone actually needs the data, but once started, you want continuous updates.

**`SharingStarted.WhileSubscribed(stopTimeout, replayExpiration)`** is the one you'll use most in ViewModels. It starts when the first subscriber appears and stops after the last subscriber disappears — but with a delay. This is the strategy that makes Android lifecycle work smoothly.

## The 5-Second Timeout Pattern

You'll see `WhileSubscribed(5_000)` everywhere in Android codebases, and the number isn't arbitrary. Here's the reasoning.

When a configuration change happens (screen rotation, dark mode toggle), the old Activity is destroyed and a new one is created. During this window, there are zero subscribers — the old composable stopped collecting and the new one hasn't started yet. This window is typically under 1 second. If you used `WhileSubscribed()` with no timeout (defaulting to 0), the upstream flow would stop and restart on every rotation. That means re-fetching data, losing in-memory state, and unnecessary network calls.

The 5-second timeout solves this. The upstream collection continues for 5 seconds after the last subscriber disappears. Configuration changes complete well within that window, so the new subscriber connects to an already-active upstream with the latest value ready. The data flow is seamless from the user's perspective.

But when the user actually leaves the screen — presses home, switches apps — the 5-second timeout expires and the upstream stops collecting. This is important for resource management. Without it, your ViewModel keeps active database observers, network connections, and flow collections running while the app sits in the background doing nothing useful. On older devices or memory-constrained situations, this matters.

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
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = OrderStatus.Loading
    )
```

The `replayExpiration` parameter (defaulting to `Long.MAX_VALUE`) controls how long the cached value is kept after the upstream stops. In practice, I almost never change this default. If you set it to, say, 5 seconds, then after the upstream stops AND 5 more seconds pass, the `StateFlow` resets to `initialValue`. This can cause a flash of loading state when the user returns to the screen, which is usually worse than showing slightly stale data.

## The Upstream/Downstream Mental Model

Here's the way I think about this that cleared up a lot of confusion for me. In a ViewModel, you have three layers:

**Upstream** is everything that produces data — repository calls, database observations, `combine()`, `map()`, `filter()`. This is the cold `Flow` pipeline that describes how to get data.

**The bridge** is `stateIn` or `shareIn`. This is the point where the cold upstream converts into a hot flow that can have multiple subscribers.

**Downstream** is everything that consumes the hot flow — `collectAsStateWithLifecycle()` in your composables, or any other collector.

The `SharingStarted` strategy controls the bridge. It decides when the upstream starts working and when it stops, based on what's happening downstream. `WhileSubscribed(5_000)` means: "keep the upstream alive as long as there's at least one downstream collector, plus 5 seconds of grace period."

This mental model helps with debugging. If your UI isn't getting updates, trace the path: is the upstream emitting? Is the bridge active (check `SharingStarted`)? Is the downstream collecting (check lifecycle)? Most bugs I've seen sit at the bridge level — wrong `SharingStarted` strategy, wrong operator (`shareIn` where `stateIn` was needed), or wrong scope.

## Common Mistakes and When Each Fits

**Using `stateIn` for events** is the mistake I see most often. Because `StateFlow` conflates, rapid events get dropped. If your ViewModel emits three navigation events in quick succession (which shouldn't happen, but bugs exist), only the last one arrives. Worse, `StateFlow`'s equality check means emitting the same event twice does nothing — the second emission is silently swallowed. For events, use `shareIn` with `replay = 0` or a `Channel`, not `stateIn`.

**Using `shareIn` without replay for state** is what caused my blank screen bug. Without `replay`, new subscribers don't get the current value. After a configuration change, the UI has nothing to render until the upstream emits again. For state that the UI needs to display, always use `stateIn` or at minimum `shareIn(replay = 1)` — but at that point, `stateIn` is clearer about your intent.

**Scoping to the wrong CoroutineScope** is subtler. If you use `GlobalScope` or a custom scope instead of `viewModelScope`, the shared flow outlives your ViewModel. Data keeps flowing, memory isn't released, and you've created a leak. Always scope to `viewModelScope` for ViewModel flows — it cancels when the ViewModel is cleared, which is when the data is no longer needed.

Here's my practical cheat sheet. For search results, form state, list data, or anything the UI renders persistently — use `stateIn` with `WhileSubscribed(5_000)`. For analytics events, logging streams, or one-shot notifications — use `shareIn` with `replay = 0`. For user preferences or auth state that must always be current — use `stateIn` with `Eagerly`. If you're unsure, start with `stateIn` and `WhileSubscribed(5_000)`. It's the right choice 80% of the time in Android ViewModels, and it's easy to change if you discover you need different semantics.

The reframe for me was realizing these aren't interchangeable convenience functions — they represent fundamentally different data flow models. `stateIn` says "there is always a current value, and I only care about the latest." `shareIn` says "every emission is significant, and I don't assume there's a default." Once that distinction clicked, choosing between them became obvious for every use case.

Thanks for reading!
