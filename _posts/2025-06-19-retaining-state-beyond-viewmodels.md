---
title: Retaining State Beyond ViewModels with Circuit
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Jetpack Compose
---

A few months back I was debugging a production issue where users kept losing their filter selections after switching to another app and coming back. The ViewModel was fine — it survived configuration changes like a champ. But Android had killed the process in the background, and everything in the ViewModel's memory was gone. The filters, the search query, the scroll position on a list they'd scrolled through 200 items on. All wiped.

That experience forced me to rethink what "retaining state" actually means on Android. And here's what I realized: most of us treat ViewModel like a safety deposit box — throw your state in there, and it's safe forever. But it's more like a hotel room safe. It protects your valuables while you're a guest, but once the hotel kicks you out (process death), everything inside is gone.

ViewModel solves one problem — surviving configuration changes. But the full picture includes process death, navigation state, and different categories of data that each need different survival strategies. The standard tools — `SavedStateHandle`, `rememberSaveable`, custom `Saver` objects — cover these gaps, and if you're using Circuit, its retention system offers a cleaner architecture on top of the same underlying mechanisms.

Here's the thing: **the real skill isn't knowing these APIs exist — it's knowing which state belongs in which survival tier.** Get that wrong, and you either lose user data or you over-persist and hit the ~1MB `Bundle` size limit that crashes your app with a `TransactionTooLargeException`.

## What ViewModel Actually Retains (And What It Doesn't)

Think of your app's state like belongings in your house. ViewModel is like a fireproof safe — it protects your stuff from small disasters (configuration changes like rotation, dark mode toggles, language switches). Android's `ViewModelStore` keeps the ViewModel in memory while the Activity is destroyed and recreated. But if the entire house gets demolished? That safe is gone too.

That's process death. When Android kills your process to reclaim memory, every ViewModel instance and its in-memory state vanishes. The Activity and Fragment are later recreated from the saved instance state bundle, but anything you stored only in the ViewModel is gone.

So what do you do? You need an off-site backup. That's `SavedStateHandle`.

`SavedStateHandle` is a key-value map that ViewModel receives through its constructor, and the values stored in it are serialized into the saved instance state `Bundle`. That means they survive process death. The API is straightforward — `set()` and `get()` with string keys, plus reactive accessors via `getStateFlow()` and even experimental Compose state integration through `saveable`.

```kotlin
class SearchViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val searchRepository: SearchRepository,
) : ViewModel() {

    // Survives process death — restored from saved instance state
    val query: StateFlow<String> =
        savedStateHandle.getStateFlow("query", "")

    val results: StateFlow<List<SearchResult>> =
        query.flatMapLatest { searchRepository.search(it) }
            .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    fun onQueryChanged(newQuery: String) {
        savedStateHandle["query"] = newQuery
    }
}
```

The supported types mirror what `Bundle` supports — primitives, `String`, `Parcelable`, `Serializable`, and their array variants. For anything more complex, you use `setSavedStateProvider()` to provide custom serialization logic via a `SavedStateRegistry.SavedStateProvider`. But here's the constraint most developers miss: the **entire** saved instance state bundle for a transaction — across all Activities, Fragments, and ViewModels — shares a roughly 1MB limit. Exceed it and your app crashes. So `SavedStateHandle` is for small, critical data: IDs, queries, selected indices. Not for cached API responses.

> **🔥 Real talk:** I've seen a production crash caused by a team serializing a full list of search results into `SavedStateHandle`. It worked fine in development with 20 results. In production, users with 500+ results triggered `TransactionTooLargeException` and the app crashed on every background/foreground cycle. The fix took 10 minutes — stop saving the results, re-fetch them. The debugging took two days.

## rememberSaveable in Compose

In Compose, the equivalent mechanism is `rememberSaveable`. It behaves like `remember` — stores a value in the composition and returns it on recomposition — but it also serializes the value to the saved instance state bundle. That means it survives configuration changes, process death, and activity recreation.

The simplest case is storing a primitive or a `Parcelable`:

```kotlin
@Composable
fun CheckoutScreen() {
    // Survives process death — String goes into Bundle automatically
    var promoCode by rememberSaveable { mutableStateOf("") }

    // Parcelable types work directly with @Parcelize
    var shippingAddress by rememberSaveable {
        mutableStateOf(ShippingAddress.EMPTY)
    }

    // remember does NOT survive process death — only recompositions
    var isPromoFieldExpanded by remember { mutableStateOf(false) }
}
```

The difference from `remember` is critical. Think of `remember` as writing notes on a whiteboard — they're there as long as nobody erases the board. But `rememberSaveable` is like writing notes in a notebook that you tuck into your pocket. Even if someone erases the whiteboard (configuration change) or tears down the whole room (process death), your pocket notebook survives.

`remember` stores values in the composition's memory — they survive recompositions but are lost on any configuration change or process death. `rememberSaveable` persists through everything except user-initiated dismissal (swiping away from recents, force stopping). For user-generated input — text fields, selected filters, toggle states, form progress — `rememberSaveable` is the right choice. Losing a user's typed text because they briefly switched to answer a call is a real bug, and `rememberSaveable` prevents it.

### Custom Savers for Non-Parcelable Types

Not everything is `Parcelable`, and sometimes you don't want to add `@Parcelize` to a domain model just for UI state. Compose provides `Saver`, `mapSaver`, and `listSaver` for custom serialization.

`mapSaver` converts your object to a `Map<String, Any?>` that the bundle system can handle:

```kotlin
data class FilterSelection(
    val category: String,
    val minPrice: Int,
    val maxPrice: Int,
    val sortBy: SortOrder,
)

val FilterSelectionSaver = mapSaver(
    save = { filter ->
        mapOf(
            "category" to filter.category,
            "minPrice" to filter.minPrice,
            "maxPrice" to filter.maxPrice,
            "sortBy" to filter.sortBy.name,
        )
    },
    restore = { map ->
        FilterSelection(
            category = map["category"] as String,
            minPrice = map["minPrice"] as Int,
            maxPrice = map["maxPrice"] as Int,
            sortBy = SortOrder.valueOf(map["sortBy"] as String),
        )
    },
)

@Composable
fun ProductListScreen() {
    var filters by rememberSaveable(stateSaver = FilterSelectionSaver) {
        mutableStateOf(FilterSelection("All", 0, 1000, SortOrder.RELEVANCE))
    }
}
```

`listSaver` is more concise when you don't need named keys — it uses list indices instead:

```kotlin
val FilterSelectionSaver = listSaver<FilterSelection, Any>(
    save = { listOf(it.category, it.minPrice, it.maxPrice, it.sortBy.name) },
    restore = {
        FilterSelection(it[0] as String, it[1] as Int, it[2] as Int, SortOrder.valueOf(it[3] as String))
    },
)
```

I prefer `mapSaver` for anything with more than two fields because the named keys make the restore logic self-documenting. `listSaver` is fine for simple two-field types where index positions are obvious. With four fields in a `listSaver`, you're one refactor away from a bug where `it[2]` suddenly means something different than it used to.

## Process Death — The Bug You Aren't Testing For

Process death is the gap between what developers test and what users experience. Most developers test rotation and navigation. Almost nobody tests the scenario where Android kills the app process while it's in the background, and the user returns 20 minutes later expecting everything to be where they left it.

Here's what actually happens on process death: every `ViewModel` instance is destroyed, every `remember` value is gone, every in-memory cache is wiped. What survives is the saved instance state bundle — which means only values stored in `SavedStateHandle`, `rememberSaveable`, or `onSaveInstanceState()`. When the user returns, Android recreates the Activity and restores the bundle. Your ViewModels are re-created from scratch, and `SavedStateHandle` is populated from the restored bundle.

> **🧠 Think about it:** Your user fills out a 4-step form, gets a phone call on step 3, chats for 20 minutes, then comes back to your app. What does your app show them? If you haven't tested for process death, the answer might be an empty step 1. That's not a minor annoyance — that's a user who deletes your app.

You can test this in Android Studio: run your app, navigate to the screen you want to test, press Home to background the app, then in the terminal run `adb shell am kill <your.package.name>`. Reopen the app from recents. If your text fields are empty and your filters are reset, you have a process death bug. The **Logcat** filter `ActivityManager` will show `Killing` entries when the system does this naturally.

The practical rule I follow: **if a user typed it, selected it, or scrolled to it, it must survive process death.** API responses and computed data can be re-fetched — users understand a brief loading state after 20 minutes. But losing their form input or filter selections feels like a broken app.

## Navigation and Saved State

Jetpack Navigation has its own saved state story that integrates with ViewModel scoping. Each `NavBackStackEntry` is a `ViewModelStoreOwner` and a `SavedStateRegistryOwner`. When you scope a ViewModel to a `NavBackStackEntry` using `hiltViewModel()` or `viewModel()`, the ViewModel survives as long as that entry is on the back stack. Pop the destination, and the ViewModel is cleared.

The saved state works per-destination too. If a user navigates from Screen A to Screen B, Screen A's `rememberSaveable` values are persisted. Navigate back, and they're restored. On process death, the entire back stack is serialized — destination routes and their saved state bundles — so the full navigation history comes back with each screen's saved state intact.

This means scroll positions, form inputs, and selected tabs are automatically preserved per destination without any extra work — as long as you used `rememberSaveable` for them. If you stored them only in `remember` or in a ViewModel without `SavedStateHandle`, they'll be lost on process death even though the navigation stack itself is restored. The navigation framework did its job — it rebuilt the back stack. But you didn't do yours — the state inside each screen was only in memory.

## When ViewModel Isn't Enough

ViewModel with `SavedStateHandle` covers the most common cases, but there are real scenarios where it falls short or creates unnecessary friction.

**Multi-step forms** are a classic example. A form with 4 steps where each step has 5-8 fields creates a lot of state. Storing all of it in a single ViewModel's `SavedStateHandle` means managing dozens of string keys. Using `rememberSaveable` in each step's composable keeps the state co-located with the UI that produces it — cleaner separation, less key management.

**Scroll positions and lazy list state** are another gap. `LazyListState` isn't a ViewModel concern — it's UI state. Using `rememberSaveable` with `LazyListState`'s built-in saver keeps the scroll position scoped to the composable, surviving both configuration changes and process death without polluting your ViewModel.

**Shared element transitions and expanded/collapsed states** are ephemeral but still annoying to lose on rotation. For these, `rememberSaveable` with a simple Boolean is lighter than routing through a ViewModel. Not everything needs to go through your state management layer.

## Real-World State Restoration Patterns

In practice, I split state into tiers based on what survival guarantees each piece needs.

**Form data** — every field value in `rememberSaveable`. The current step index in `rememberSaveable`. Validation errors in `remember` because they're re-derived from the field values on recomposition anyway. The ViewModel handles submission logic and API calls, but the form state itself lives in the composable tree.

**Search with filters** — the query string and active filter selections go in `SavedStateHandle` (or `rememberSaveable` if you're using presenters). The search results live in the ViewModel's memory as a `StateFlow` — they're re-fetched from the repository on process death, using the restored query and filters. The scroll position of the results list uses `rememberSaveable` through `LazyListState`.

**Multi-step onboarding** — each step's local state in `rememberSaveable`, the current step index in `SavedStateHandle`. Completed steps' data gets written to the repository (Room or DataStore) as the user progresses, so process death only replays the current step, not the entire flow. This avoids the bundle size problem — you're not serializing all accumulated data, just the current step's input.

> **💡 The "aha" moment:** These aren't competing tools — they're teammates. `SavedStateHandle` and `rememberSaveable` handle process death. ViewModel handles configuration changes and coroutine scoping. Your repository layer handles long-term persistence. Each tier has a job, and the pattern across all these real-world cases is the same: small, user-generated, serializable data goes in the saved instance state tier. Large, fetchable, derived data stays in memory and gets re-fetched.

## Circuit's Retention System — Making the Tiers Explicit

Circuit takes this tiered thinking and makes it a first-class API. In Circuit's Presenter pattern, you have three explicit retention levels: `remember` (recomposition only), `rememberRetained` (configuration changes and back-stack navigation), and `rememberSaveable` (everything including process death).

Here's a way to think about it. Imagine three shelves in your kitchen. The counter (visible, easy access, but gets wiped when you clean up) — that's `remember`. The cabinet (tucked away, survives the daily cleanup, but if you renovate the kitchen it's gone) — that's `rememberRetained`. The basement storage (survives everything short of selling the house) — that's `rememberSaveable`.

`rememberRetained` is Circuit's equivalent of what ViewModel gives you — state survives rotation and navigation but not process death. Under the hood on Android, it's backed by a hidden ViewModel scoped to the `ViewModelStoreOwner`. Circuit also provides `collectAsRetainedState` for caching flow emissions across configuration changes, similar to using `stateIn` with `SharingStarted.WhileSubscribed` in a traditional ViewModel.

```kotlin
@Composable
override fun present(): OrderScreen.State {
    // Re-fetchable data — retained across rotation, re-fetched on process death
    val orders by orderRepository.observeOrders()
        .collectAsRetainedState(initial = emptyList())

    // User selection — survives process death
    var selectedFilter by rememberSaveable { mutableStateOf("All") }

    // Ephemeral UI state — gone on rotation, that's fine
    var isFilterSheetVisible by remember { mutableStateOf(false) }

    return OrderScreen.State(
        orders = orders,
        selectedFilter = selectedFilter,
        isFilterSheetVisible = isFilterSheetVisible,
    ) { event ->
        when (event) {
            is OrderEvent.FilterChanged -> selectedFilter = event.filter
            is OrderEvent.FilterSheetToggled ->
                isFilterSheetVisible = !isFilterSheetVisible
        }
    }
}
```

Look at that code and notice how each piece of state declares its own survival strategy right where it's defined. No guessing. No hoping you remembered to add `SavedStateHandle` for the important stuff.

The honest tradeoff with Circuit's approach: you have to **consciously classify every piece of state** into the right tier. With ViewModel, you might default to putting everything in memory and adding `SavedStateHandle` where you remember to. Circuit forces the decision upfront. IMO, that's actually a strength — it makes you think about state survival as a design decision rather than an afterthought. But it's also a learning curve, and forgetting `rememberSaveable` for user input means users lose data on process death.

The elegant part is how retention scopes to back-stack entries. Each screen's retained state lives in its own registry, tied to its back-stack entry. Push a new screen, and the previous screen's retained state stays alive. Pop a screen, and its retained state is cleared. No `onCleared()`, no manual cleanup. This is the same lifecycle that `NavBackStackEntry`-scoped ViewModels provide, but expressed through composable retention instead of ViewModel lifecycle.

Whether you use ViewModel with `SavedStateHandle`, Compose's `rememberSaveable` with custom Savers, or Circuit's three-tier system — the underlying problem and solution are the same. Classify your state by what needs to survive what, use the smallest survival scope that satisfies the user's expectation, and test for process death before your users find the bugs for you.

Thanks for reading!
