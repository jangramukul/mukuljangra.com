---
title: Retaining State Beyond ViewModels with Circuit
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Jetpack Compose
---

When I first started using Circuit's Presenter pattern, something immediately felt off about the lifecycle story. In a traditional ViewModel setup, you get state retention for free — the ViewModel survives configuration changes, scopes coroutines, and holds onto your cached API responses without any extra thought. Move to Circuit's presenters, and suddenly the presenter has the same lifecycle as the UI. Rotate the screen, and your presenter's composition is destroyed and recreated from scratch. All that state? Gone.

But here's the thing — that same lifecycle alignment is what makes Circuit's presenters so much simpler to write. You don't need `repeatOnLifecycle`, `collectAsStateWithLifecycle`, or any of the lifecycle ceremony that ViewModel demands. The presenter is a composable. When the UI is visible, the presenter is composed. When the UI goes away, the presenter leaves composition. No lifecycle owner, no lifecycle-aware collection, no `SharingStarted.WhileSubscribed(5_000)` incantation. The complexity just disappears.

So how do you get state retention back without reintroducing all the lifecycle machinery you just escaped? This is where Circuit's retention system gets interesting.

## The Three Tiers of State Retention

Circuit gives you three distinct retention mechanisms, and understanding the differences between them is essential to writing correct presenters. Each tier survives a different scope of destruction, and picking the wrong one leads to either lost state or wasted memory.

**`remember`** is the baseline — it's the same `remember` you use in Compose UI. State stored with `remember` survives recompositions but nothing else. Navigate away, rotate the device, or pop the screen from the back stack, and the remembered value is gone. This is fine for truly ephemeral UI state: whether a dropdown is expanded, the current scroll offset, animation progress.

**`rememberRetained`** is Circuit's answer to what ViewModel gives you. It stores state in memory across configuration changes and back-stack navigation. When the user rotates the screen, the presenter is destroyed and recreated, but `rememberRetained` values survive. When the user navigates forward to another screen and comes back, `rememberRetained` values are still there. But — and this is the critical caveat — `rememberRetained` does **not** survive process death. If Android kills your process in the background and the user returns, retained state is gone.

**`rememberSaveable`** survives everything, including process death. It works like `rememberSaveable` in standard Compose or `SavedStateHandle` in ViewModel — the state is serialized to the saved instance state bundle. The tradeoff is that the data must be serializable (Parcelable, or using a custom `Saver`), and the bundle has a size limit of roughly 1MB for the entire transaction.

```kotlin
@Composable
override fun present(): ProfileScreen.State {
    // Ephemeral — gone on rotation
    var isDropdownExpanded by remember { mutableStateOf(false) }

    // Retained — survives rotation and navigation, lost on process death
    var cachedProfile by rememberRetained { mutableStateOf<UserProfile?>(null) }

    // Saveable — survives everything including process death
    var selectedTabIndex by rememberSaveable { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        if (cachedProfile == null) {
            cachedProfile = profileRepository.fetchProfile()
        }
    }

    return ProfileScreen.State(
        profile = cachedProfile,
        selectedTab = selectedTabIndex,
        isDropdownExpanded = isDropdownExpanded,
    ) { event ->
        when (event) {
            is ProfileEvent.TabSelected -> selectedTabIndex = event.index
            is ProfileEvent.DropdownToggled -> isDropdownExpanded = !isDropdownExpanded
        }
    }
}
```

## Choosing the Right Tier

The decision of which retention mechanism to use isn't arbitrary — it maps directly to the nature of the data you're storing. I think about it in terms of three questions: Is it reconstructable? Is it serializable? Does the user expect it to persist?

**Use `rememberSaveable`** for user-generated input and navigation state. Text field values, selected filters, scroll positions, form progress — anything where losing the state would frustrate the user. These are small, serializable values. If the user typed three paragraphs into a compose field and Android killed the process, they'd better see those paragraphs when they come back. IDs and keys that let you reconstruct state also belong here: `selectedUserId`, `currentPage`, `searchQuery`.

**Use `rememberRetained`** for cached data that's expensive to re-fetch but cheap to re-fetch relative to the user's tolerance. API responses, computed transformations, flow emissions that took time to collect. If the user rotates their phone, they shouldn't see a loading spinner while the app re-fetches data that was on screen half a second ago. But if Android killed the process 20 minutes ago, re-fetching from the network is fine — the data is probably stale anyway.

**Use `remember`** for everything else — pure UI state that's trivially reconstructable. Animation states, hover states, whether a tooltip is visible. If this state disappears on configuration change, no one notices because the UI is being redrawn anyway.

The interesting edge case is state that's both expensive AND should survive process death. A partially completed multi-step form, for example. You'd use `rememberSaveable` for the form field values (small, serializable, user-generated) and `rememberRetained` for any validation results or API lookups that informed the form state. On process death, the form values survive and you re-run the validations — a reasonable tradeoff.

## collectAsRetainedState — Caching Flow Emissions

One of the patterns I use most in Circuit presenters is collecting flows with retention. In a traditional ViewModel, you'd use `stateIn` with `SharingStarted.WhileSubscribed(5_000)` to cache a flow's latest emission and share it across collectors. Circuit has its own equivalent: `collectAsRetainedState`.

```kotlin
@Composable
override fun present(): OrderListScreen.State {
    val orders by orderRepository.observeOrders()
        .collectAsRetainedState(initial = emptyList())

    val userPrefs by prefsRepository.observePreferences()
        .collectAsRetainedState(initial = UserPreferences.DEFAULT)

    return OrderListScreen.State(
        orders = orders,
        sortOrder = userPrefs.defaultSortOrder,
    ) { event ->
        // handle events
    }
}
```

The `collectAsRetainedState` function does two things. First, it collects the flow and converts emissions to a Compose `State` object — just like `collectAsState`. Second, it retains the latest value across configuration changes. When the presenter is destroyed and recreated on rotation, the retained state immediately provides the last emitted value. The flow starts collecting again (because the presenter is a new composition), but the UI shows the cached value instead of a loading state while it waits for the first emission.

This is subtly different from ViewModel's `stateIn` approach. With `stateIn`, the StateFlow itself outlives the collector — it keeps its value in the ViewModel's scope. With `collectAsRetainedState`, the value is retained but the flow collection restarts. For a Room database query that emits the current state on collection, there's no practical difference. For a network-backed flow, the re-collection might trigger a new network request. You'd want to handle that in your repository layer with caching, not at the presenter level.

## How Retention Integrates with Navigation

Here's where Circuit's retention story gets particularly elegant. Retained state is scoped to back-stack entries, not to a global store. When a screen is on the back stack, its retained state stays alive. When the screen is popped from the back stack, its retained state is cleared. You don't need to manually clean up, cancel coroutines, or clear caches.

This scoping works because Circuit's `SaveableBackStack` manages the lifecycle of retained state containers per entry. Each back-stack entry has its own `RetainedStateRegistry` that holds the `rememberRetained` values for that entry's presenter. Push a new screen, and the previous screen's retained state stays in its registry. Pop back, and the previous screen's presenter recomposes with its retained values intact. Pop a screen completely off the back stack, and its registry is cleared.

```kotlin
// Screen A -> Screen B -> Screen C
// A's retained state: alive (on back stack)
// B's retained state: alive (on back stack)
// C's retained state: alive (current screen)

// User presses back (C popped)
// A's retained state: alive
// B's retained state: alive (now current)
// C's retained state: CLEARED

// User presses back again (B popped)
// A's retained state: alive (now current)
// B's retained state: CLEARED
```

Chris Banes' Tivi app — one of the most complete open-source Circuit implementations — uses this pattern extensively. The show details screen retains API responses, cast lists, and season data. Navigate away to a related show and come back, everything is instantly available. Navigate back past the show details screen, and all that cached data is properly cleaned up. No `onCleared()` override, no manual cancellation.

## The ViewModel Underneath

There's an irony to Circuit's retention system that's worth understanding. On Android, `rememberRetained` is backed by a `ViewModel` under the hood. Circuit creates a hidden `ViewModel` scoped to the `ViewModelStoreOwner` (typically the Activity or NavBackStackEntry) and uses it to store the `RetainedStateRegistry`. When the Activity is destroyed for a configuration change, the ViewModel survives, and with it, all the retained values.

So when someone asks "can Circuit replace ViewModel?" — the answer is yes, architecturally. You no longer write `ViewModel` classes with StateFlow plumbing. But the mechanism that makes retention work on Android is still the ViewModel framework. Circuit abstracts it away so you never interact with it directly, but it's there. On other platforms (iOS via Compose Multiplatform, Desktop), `rememberRetained` uses different platform-specific retention mechanisms.

This isn't a criticism — it's good engineering. Circuit uses the right tool for each platform rather than reinventing platform-specific lifecycle handling. But it does mean that `rememberRetained` inherits some of ViewModel's constraints, like the requirement that the hosting Activity or Fragment implements `ViewModelStoreOwner`.

## The Honest Tradeoffs

Circuit's retention system is genuinely cleaner than ViewModel for most use cases, but there are real downsides I've encountered.

**Process death is the gap.** ViewModel with `SavedStateHandle` gives you a unified API that handles both configuration changes and process death. In Circuit, you have to consciously choose between `rememberRetained` (config changes only) and `rememberSaveable` (config changes + process death). If you forget to use `rememberSaveable` for user input, users will lose data on process death. In practice, most teams don't test for process death thoroughly, so this bug surfaces late. With ViewModel's `SavedStateHandle`, you might over-persist, but at least you don't lose critical state.

**Retained state is in-memory only.** Unlike `SavedStateHandle`, you can't inspect `rememberRetained` values in a debugger the way you can inspect a ViewModel's StateFlow. The retained values live in Circuit's internal registry, and there's no built-in tooling to see what's retained and how much memory it's consuming. For large retained objects — like cached API responses with embedded images or long lists — you need to be mindful of memory pressure.

**Testing retained state requires Circuit's test infrastructure.** You can't just instantiate a presenter and call `present()` — you need `Presenter.test()` with its Turbine-based API to properly simulate retention across configuration changes. This works well once you learn it, but it's a testing pattern your team has to adopt. ViewModel testing is more straightforward because you just interact with the ViewModel object directly.

IMO, the tradeoffs are worth it for new projects or new modules. The lifecycle simplification alone — not having to think about `repeatOnLifecycle`, `WhileSubscribed`, `collectAsStateWithLifecycle` — removes a category of bugs that I've seen in every production app I've worked on. The retention system requires more conscious decisions about which tier to use, but those decisions make you think about your state in a healthier way than ViewModel's one-size-fits-all approach.

The key insight is that Circuit doesn't remove the need for state retention — it makes the retention explicit and tiered instead of implicit and singular. You trade ViewModel's automatic retention for a system where you declare exactly what survives what, and that precision is both its strength and its learning curve.

Thanks for reading!
