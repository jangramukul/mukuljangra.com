---
title: State Hoisting and derivedStateOf Guide
layout: post
sequence: 127
categories: post
tags:
  - Jetpack Compose
  - Android
---

State hoisting is the most important pattern in Compose. I'd go further — if you don't understand state hoisting, you don't really understand Compose. It's the mechanism that makes composables reusable, testable, and predictable. And once you get state hoisting right, `derivedStateOf` becomes the natural next step: computing values from state without triggering recomposition on every tiny change.

I spent the first few months with Compose putting `remember { mutableStateOf(...) }` inside every composable that needed state. Everything worked fine until I tried to test those composables, or reuse them in a different screen with different behavior. The state was trapped inside. The composable was a black box that owned its own data and made its own decisions. That's the opposite of what Compose is designed for. The moment I started hoisting state out, everything clicked — composables became like pure functions with state as input and events as output.

## State Hoisting Pattern

The core idea is simple: move state up, pass events down. A composable that manages its own state is a **stateful** composable. A composable that receives state as a parameter and emits events through callbacks is **stateless**. Stateless composables are reusable and testable. Stateful composables are convenient but inflexible.

Here's a stateful `TextField` — the kind you'd write when prototyping:

```kotlin
@Composable
fun SearchField() {
    var query by remember { mutableStateOf("") }
    TextField(
        value = query,
        onValueChange = { query = it },
        label = { Text("Search") }
    )
}
```

This works, but you can't observe the query from outside. You can't pre-fill it. You can't clear it from a parent composable. The state is locked inside. Now hoist the state out:

```kotlin
@Composable
fun SearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        label = { Text("Search") },
        modifier = modifier
    )
}
```

The composable no longer knows where the state lives. It takes a `String` and a callback. The caller decides whether the state comes from a `remember`, a ViewModel, or a test harness. This is the unidirectional data flow pattern that Compose is built around: state flows down, events flow up.

Here's the thing about this pattern — it's not just a Compose convention. It mirrors how React hooks work, how SwiftUI bindings work, and how every modern declarative UI framework separates state ownership from UI rendering. Compose just makes it explicit through function parameters instead of hiding it behind framework magic.

## How Far to Hoist

The rule from the official docs is straightforward: hoist to the **lowest common ancestor** that needs the state. Not higher. This is where most developers go wrong in both directions.

Hoisting too high is the more common mistake. I've seen codebases where every piece of state — selected tab index, text field values, dialog visibility — lives in the ViewModel. The ViewModel becomes a dumping ground for UI element state that has nothing to do with business logic. A `showDialog` boolean doesn't need to survive process death. A selected tab index doesn't need to go through a repository. These are UI concerns, and they belong in the Composition.

The way I think about it: **screen UI state** and **UI element state** are different things. Screen UI state is the data your screen needs to render — user profiles, article lists, loading indicators. That comes from a ViewModel because it involves business logic, survives configuration changes, and connects to your data layer. UI element state is intrinsic to how a UI element behaves — whether a bottom sheet is expanded, which tab is selected, the current scroll position. That state can live in a composable or a plain state holder class.

Consider a search screen. The search results come from the ViewModel — they involve a network call, caching, maybe pagination. But the text in the search field? That can stay in the screen composable. The ViewModel only needs to know about the query when the user submits it:

```kotlin
@Composable
fun SearchScreen(viewModel: SearchViewModel) {
    var query by rememberSaveable { mutableStateOf("") }
    val results by viewModel.results.collectAsStateWithLifecycle()

    Column {
        SearchField(
            query = query,
            onQueryChange = { query = it }
        )
        Button(onClick = { viewModel.search(query) }) {
            Text("Search")
        }
        SearchResults(results)
    }
}
```

The query state is hoisted just one level — from `SearchField` to `SearchScreen`. Not into the ViewModel. The ViewModel doesn't care about every keystroke. It cares about the submitted query. This keeps the ViewModel focused on business logic and the composable focused on UI behavior.

When you do need state shared between sibling composables, hoist to their parent. If `JumpToBottom` button and `MessagesList` both need `LazyListState`, hoist it to `ConversationScreen` — their lowest common ancestor. Don't create two separate `LazyListState` instances in two siblings and try to sync them. That's duplicate state, and it always leads to bugs.

## derivedStateOf

`derivedStateOf` solves a specific problem: when a state source changes frequently, but the UI only cares about a computed value that changes less frequently. Without it, the UI recomposes on every source change, even when the derived value hasn't actually changed.

The classic example is a "scroll to top" button. You want to show it when the user has scrolled past the first item in a `LazyColumn`. The `LazyListState` tracks `firstVisibleItemIndex`, which changes constantly as the user scrolls — 0, 1, 2, 3, and so on. But the button's visibility only has two states: visible or not visible. Without `derivedStateOf`, the composable reading `firstVisibleItemIndex > 0` recomposes on every index change. With `derivedStateOf`, it only recomposes when the boolean result actually flips:

```kotlin
@Composable
fun MessageList(messages: List<Message>) {
    Box {
        val listState = rememberLazyListState()

        LazyColumn(state = listState) {
            items(messages, key = { it.id }) { message ->
                MessageItem(message)
            }
        }

        val showScrollToTop by remember {
            derivedStateOf {
                listState.firstVisibleItemIndex > 0
            }
        }

        AnimatedVisibility(visible = showScrollToTop) {
            FloatingActionButton(
                onClick = { /* scroll to top */ }
            ) {
                Icon(Icons.Default.KeyboardArrowUp, "Scroll to top")
            }
        }
    }
}
```

Under the hood, `derivedStateOf` works with Compose's snapshot system. It tracks which state objects are read inside its lambda, and only invalidates the derived state when the computed result actually changes. Think of it like `distinctUntilChanged()` on a Flow — the downstream only sees new values when they're genuinely different from the previous one. This is possible because the snapshot system can intercept state reads at a granular level and know exactly which computations need re-evaluation.

Here's what catches people: `derivedStateOf` is **not** for every computation that combines two states. If you have `firstName` and `lastName` states and want a `fullName`, you don't need `derivedStateOf`. The full name changes every time either input changes, so there's no excess recomposition to avoid. Using `derivedStateOf` there is pure overhead — an extra state object being tracked for no benefit:

```kotlin
// Wrong — derivedStateOf adds overhead with no benefit
var firstName by remember { mutableStateOf("") }
var lastName by remember { mutableStateOf("") }
val fullName by remember { derivedStateOf { "$firstName $lastName" } }

// Correct — just compute it directly
val fullName = "$firstName $lastName"
```

The rule of thumb: use `derivedStateOf` when the source state changes more frequently than the derived value. Scroll position to boolean threshold, list size to "show empty state" flag, multiple filter states to a filtered count that only changes when items cross the filter boundary. If the derived value changes at the same rate as the source, skip it.

## produceState

`produceState` bridges non-Compose state sources into Compose's state system. It launches a coroutine scoped to the Composition and lets you push values into a returned `State<T>`. When the composable leaves the Composition, the coroutine is cancelled automatically.

This is useful when you need to convert a Flow, a callback-based API, or a suspend function result into a Compose state without going through a ViewModel. Not everything needs a ViewModel. Sometimes you have a composable that loads data directly:

```kotlin
@Composable
fun WeatherBanner(
    locationId: String,
    weatherRepository: WeatherRepository
): State<WeatherState> {
    return produceState<WeatherState>(
        initialValue = WeatherState.Loading,
        locationId
    ) {
        val forecast = weatherRepository.getForecast(locationId)
        value = if (forecast != null) {
            WeatherState.Ready(forecast)
        } else {
            WeatherState.Error("Failed to load forecast")
        }
    }
}
```

If `locationId` changes, the running coroutine is cancelled and a new one starts with the fresh key. The returned `State` conflates — setting the same value twice doesn't trigger recomposition.

You can also use `produceState` with Flows. Inside the coroutine, call `collect` on a Flow and update `value` on each emission. But honestly, for most Flow-to-State conversions in Android, `collectAsStateWithLifecycle()` is a better fit because it's lifecycle-aware. I reach for `produceState` when the data source isn't a simple Flow — maybe it's a callback API, or I need to combine a suspend call with some transformation logic that doesn't fit cleanly into a Flow chain. For a raw suspend function that returns once and you want the result as state inside a composable, `produceState` is the right tool.

## Common Mistakes

**Hoisting everything into the ViewModel.** This is the most frequent mistake I see. Developers treat the ViewModel as a single state container for the entire screen. Dialog visibility, text field values, animation triggers — all of it goes into the ViewModel. The result is a ViewModel with 15 `MutableStateFlow` fields, half of which are pure UI concerns that don't survive configuration changes meaningfully anyway. Keep UI element state in the Composition. Use `rememberSaveable` if it needs to survive config changes. Reserve the ViewModel for business logic and screen-level state that comes from your data layer.

**Not hoisting enough.** The opposite problem. Two sibling composables both need the same state, so each creates its own copy with `remember`. Now you have two sources of truth that inevitably drift out of sync. A filter bar and a results list that each track the filter state independently. A header and a content area that each manage the selected tab. The fix is always the same: hoist to the parent, pass down.

**Using derivedStateOf for simple computations.** I've seen codebases wrap every computed value in `derivedStateOf` "just in case." But `derivedStateOf` creates an additional state object that the snapshot system has to track. If the derived value changes at the same rate as the source, you're adding overhead for zero benefit. Only use it when the source changes faster than the derived value — the scroll-position-to-boolean pattern, not the two-strings-to-concatenation pattern.

**Forgetting `remember` around `derivedStateOf`.** This is a subtle one. `derivedStateOf` creates a state object, but if you don't wrap it in `remember`, a new derived state object is created on every recomposition. The whole point of `derivedStateOf` is to maintain a stable identity across recompositions so it can track when the derived value actually changes. Without `remember`, it's recalculated from scratch every time:

```kotlin
// Wrong — new derivedStateOf on every recomposition
val showButton by derivedStateOf {
    listState.firstVisibleItemIndex > 0
}

// Correct — stable derived state across recompositions
val showButton by remember {
    derivedStateOf {
        listState.firstVisibleItemIndex > 0
    }
}
```

## Quiz

**Question 1.** You have a `Dialog` that shows when the user taps a button. Where should the `showDialog` boolean live?

**Wrong:** In the ViewModel as a `MutableStateFlow<Boolean>`. Dialog visibility is UI element state, not business logic. It doesn't need to go through a repository or survive process death in most cases.

**Correct:** In the composable using `remember { mutableStateOf(false) }` or `rememberSaveable` if it needs to survive configuration changes. The ViewModel shouldn't know or care about dialog visibility.

**Question 2.** You have `firstName` and `lastName` as `mutableStateOf` values and need a `fullName`. Should you use `derivedStateOf`?

**Wrong:** Yes, because you're deriving state from other state.

**Correct:** No. `fullName` changes every time either input changes — there's no frequency mismatch. Just compute it directly: `val fullName = "$firstName $lastName"`. Using `derivedStateOf` here adds snapshot tracking overhead with zero benefit.

## Coding Challenge

Build a `TaskListScreen` with these requirements:

- A `LazyColumn` displaying tasks from a `List<Task>` parameter
- A `TextField` for filtering tasks by name (state hoisted from `TextField` to `TaskListScreen`)
- A "scroll to top" FAB that only appears when the user has scrolled past the first item (use `derivedStateOf`)
- A task count badge showing the number of filtered tasks (direct computation, not `derivedStateOf` — the count changes at the same rate as the filtered list)
- The filter text state should live in the composable, not in a ViewModel

This exercise forces you to make the right hoisting decisions: filter state stays in the Composition, the filtered list is a direct computation, and only the scroll threshold uses `derivedStateOf`.

Thanks for reading!
