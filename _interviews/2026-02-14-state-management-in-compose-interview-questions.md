---
title: "State Management in Compose"
date: 2026-02-14
layout: interview
tags: [Jetpack Compose Round]
order: 2
level: junior
sequence: 14
---

## State Management in Compose

State management is the core of how Compose works. Almost every Compose interview will test whether you understand how state drives recomposition and how to structure state across composables and ViewModels.

### Core Questions (Beginner → Intermediate)

#### Q1: What is state in Jetpack Compose?

State is any value that can change over time and affects what the UI shows. It could be a text field value, a loading flag, a list of items from an API, or a scroll position. In Compose, when state changes, the composable functions that read that state are re-executed to reflect the new state on screen. This is the core mechanism — UI is a function of state.

#### Q2: How do you retain data in composable functions?

There are two ways to retain data/values in composable functions. You can use ViewModel (Jetpack library) or the `remember` API (part of Jetpack Compose) so that these values/data can survive the recomposition phase. `remember` stores values in the Composition's slot table, while ViewModel stores values outside of Composition entirely. Use `remember` for UI-local state like animation values or toggle states, and ViewModel for business logic state like API results or user data.

#### Q3: What is mutableStateOf and how does it work?

`mutableStateOf` creates an observable `MutableState<T>` holder that is integrated with the Compose runtime. When you write to its `value` property, Compose automatically schedules recomposition for any composable that reads it. It uses the snapshot system internally — every read is tracked, and every write triggers invalidation of readers.

There are three ways to declare it in a composable:

- `val state = remember { mutableStateOf(0) }` — access via `state.value`
- `var state by remember { mutableStateOf(0) }` — property delegate, use directly
- `val (value, setValue) = remember { mutableStateOf(0) }` — destructuring

The `by` delegate is the most common because it reads cleanly. It requires importing `getValue` and `setValue` from `androidx.compose.runtime`.

#### Q4: What is the difference between remember and rememberSaveable?

`remember` stores a value across recompositions but loses it on configuration changes (rotation) and process death. `rememberSaveable` stores values across recompositions, configuration changes, *and* process death by using the saved instance state mechanism under the hood — the same `Bundle` mechanism that `onSaveInstanceState` uses.

Use `remember` for transient UI state that's fine to lose (animation state, temporary calculations). Use `rememberSaveable` for state the user expects to survive rotation — search queries, scroll positions, selected tabs.

```kotlin
@Composable
fun SearchBar() {
    // Lost on rotation — bad for user-typed text
    // var query by remember { mutableStateOf("") }

    // Survives rotation and process death
    var query by rememberSaveable { mutableStateOf("") }

    OutlinedTextField(
        value = query,
        onValueChange = { query = it },
        label = { Text("Search") }
    )
}
```

#### Q5: How do you save custom objects with rememberSaveable?

By default, `rememberSaveable` can only save types that go into a `Bundle` — primitives, strings, parcelables. For custom objects, you have three options:

- **@Parcelize** — Annotate your data class with `@Parcelize` and implement `Parcelable`. Simplest approach.
- **mapSaver** — Convert your object to a `Map<String, Any>` for saving and reconstruct it on restore.
- **listSaver** — Similar to mapSaver but uses a list of values. Useful when your object has a small, fixed number of fields.

```kotlin
data class FilterState(val category: String, val minPrice: Int)

val filterSaver = mapSaver(
    save = { mapOf("category" to it.category, "price" to it.minPrice) },
    restore = { FilterState(it["category"] as String, it["price"] as Int) }
)

@Composable
fun FilterScreen() {
    var filter by rememberSaveable(stateSaver = filterSaver) {
        mutableStateOf(FilterState("Electronics", 0))
    }
}
```

#### Q6: What is state hoisting in Compose?

State hoisting is the pattern of moving state from a composable to its caller, making the composable stateless. You replace the internal state with two parameters — the current value and a callback to request changes. The composable that owns the state becomes the single source of truth.

```kotlin
// Stateful — manages its own state
@Composable
fun ExpandableCard() {
    var expanded by remember { mutableStateOf(false) }
    Card(onClick = { expanded = !expanded }) {
        Text(if (expanded) "Collapse" else "Expand")
    }
}

// Stateless — state is hoisted to caller
@Composable
fun ExpandableCard(expanded: Boolean, onExpandChange: (Boolean) -> Unit) {
    Card(onClick = { onExpandChange(!expanded) }) {
        Text(if (expanded) "Collapse" else "Expand")
    }
}
```

Hoisting makes composables reusable, testable, and shareable. Always put the modifier and state at the level of function params so that the composable function will be flexible enough to meet the changes.

#### Q7: What is unidirectional data flow (UDF) in Compose?

UDF means state flows down and events flow up. The ViewModel holds the state and exposes it as an observable (StateFlow or Compose State). Composables read the state and render UI. When the user interacts with the UI, events flow back up through callbacks to the ViewModel, which updates the state. The updated state flows back down and triggers recomposition.

This creates a single direction loop: ViewModel → State → UI → Event → ViewModel. The benefit is predictability — there's one source of truth for each piece of state, and you can always trace where a state change came from.

#### Q8: What are mutableStateListOf and mutableStateMapOf?

These are observable collection types integrated with Compose's snapshot system. A regular `MutableList` wrapped in `mutableStateOf` only triggers recomposition when you assign a new list, not when you add or remove items from the existing list. `mutableStateListOf` triggers recomposition on every structural modification — `add`, `remove`, `set`, `clear`.

```kotlin
@Composable
fun TaskList() {
    val tasks = remember { mutableStateListOf("Buy groceries", "Clean room") }

    Column {
        tasks.forEach { task -> Text(task) }
        Button(onClick = { tasks.add("New task ${tasks.size + 1}") }) {
            Text("Add Task")
        }
    }
}
```

`mutableStateMapOf` works the same way for maps. Use these when you need granular reactivity on collection mutations rather than replacing the entire collection.

#### Q9: What is derivedStateOf?

Use `derivedStateOf` if you want to convert multiple states into a single state or convert data to a boolean after doing some calculation. It creates a state that only triggers recomposition when its *computed result* changes, not when the source states change. This is important for preventing unnecessary recompositions.

```kotlin
@Composable
fun OrderSummary(items: List<CartItem>) {
    val totalPrice = remember {
        derivedStateOf { items.sumOf { it.price * it.quantity } }
    }

    val hasExpensiveItems = remember {
        derivedStateOf { items.any { it.price > 1000 } }
    }

    Text("Total: $${totalPrice.value}")
    if (hasExpensiveItems.value) {
        Text("Includes premium items")
    }
}
```

A common use case is with `LazyListState` — you might derive a "show scroll to top button" boolean from the scroll position. The button composable only recomposes when the boolean flips, not on every scroll pixel.

### Deep Dive Questions (Advanced → Expert)

#### Q10: What is snapshotFlow and when do you use it?

`snapshotFlow` converts Compose state reads into a Kotlin Flow. Inside the `snapshotFlow` block, you read Compose state values, and the block is re-evaluated whenever those values change. Each new result is emitted to the flow. This bridges the gap between Compose's snapshot system and the coroutines/Flow world.

```kotlin
@Composable
fun TrackScrollPosition(listState: LazyListState) {
    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index ->
                analyticsTracker.logScrollPosition(index)
            }
    }
}
```

Use `snapshotFlow` when you need to react to Compose state changes with Flow operators like `debounce`, `filter`, or `distinctUntilChanged`. It's the inverse of `collectAsStateWithLifecycle` — that converts Flow to State, `snapshotFlow` converts State to Flow.

#### Q11: How does collectAsStateWithLifecycle work and why is it preferred over collectAsState?

`collectAsStateWithLifecycle` collects a Flow and converts it into Compose `State`, but it's lifecycle-aware. It starts collecting when the lifecycle reaches a minimum active state (default `STARTED`) and stops collecting when the lifecycle drops below it. This means when the app goes to the background, collection stops and no unnecessary work happens.

`collectAsState` doesn't have lifecycle awareness — it collects continuously regardless of whether the UI is visible. On Android, this wastes resources because you're processing Flow emissions even when the user can't see the results.

```kotlin
@Composable
fun ProfileScreen(viewModel: ProfileViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    when (uiState) {
        is Loading -> CircularProgressIndicator()
        is Success -> ProfileContent(uiState.data)
        is Error -> ErrorMessage(uiState.message)
    }
}
```

You can pass a custom `minActiveState` parameter if you need collection in a different lifecycle state, like `RESUMED` for camera-related flows.

#### Q12: When should you use a ViewModel vs a state holder class?

ViewModel is for business logic state — it talks to repositories, handles data fetching, and survives configuration changes. A plain state holder class is for UI logic — things like drawer state, scroll behavior, or animation coordination that are specific to how the UI behaves.

You can use ViewModel for dealing with business logic that produces the screen UI state. In the same manner, you can consider using a plain class to deal with UI logic. The state holder is a regular class that takes Compose state dependencies as constructor parameters:

```kotlin
class SearchBarState(
    initialQuery: String,
    private val suggestions: List<String>
) {
    var query by mutableStateOf(initialQuery)
        private set
    var expanded by mutableStateOf(false)
        private set

    val filteredSuggestions: List<String>
        get() = suggestions.filter { it.contains(query, ignoreCase = true) }

    fun onQueryChange(newQuery: String) {
        query = newQuery
        expanded = newQuery.isNotEmpty()
    }
}

@Composable
fun rememberSearchBarState(suggestions: List<String>) = remember(suggestions) {
    SearchBarState("", suggestions)
}
```

State holders are composable-scoped and don't survive configuration changes. If the state needs to survive rotation, hoist it into a ViewModel. If it's pure UI logic tied to a specific composable's behavior, a state holder is cleaner.

#### Q13: How does the snapshot system work under the hood?

The snapshot system is the core of Compose's state observation. Every `mutableStateOf` creates a `SnapshotMutableState` that participates in the snapshot system. When a composable function reads a state value, the read is recorded against the current snapshot. When a state value is written, all recorded readers are invalidated and scheduled for recomposition.

Snapshots work like database transactions — Compose can take a snapshot of the current state, do work, and commit or discard changes. This is how optimistic recomposition works. Compose takes a snapshot, runs recomposition against it, and if a state changes mid-recomposition, it can discard the work and restart. The snapshot system also enables `snapshotFlow` — it creates a new snapshot for each evaluation and compares the results.

The key insight is that Compose doesn't use `LiveData` or `Flow` internally for its reactivity. It has its own reactive system built on snapshots that works at a lower level than Kotlin coroutines.

#### Q14: How should you structure state in a ViewModel for Compose?

There are multiple ways to manage state in a ViewModel. The simplest approach is a single `MutableStateFlow` holding a data class with all UI state fields. The ViewModel mutates individual fields and the UI observes the single flow:

```kotlin
data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

class LoginViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChanged(email: String) {
        _uiState.update { it.copy(email = email) }
    }

    fun onLoginClick() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            authRepository.login(_uiState.value.email, _uiState.value.password)
                .onSuccess { _uiState.update { it.copy(isLoading = false) } }
                .onFailure { e -> _uiState.update { it.copy(isLoading = false, error = e.message) } }
        }
    }
}
```

Another approach is using multiple individual `StateFlow` fields and combining them with `combine`. This gives you more granular state management — you can have multiple `combine` calls in a single ViewModel for different screen sections. It's better to use Flows returned from repositories and combine them with other single-field states.

#### Q15: What is the difference between using State in a ViewModel vs StateFlow?

You can use `mutableStateOf` directly in a ViewModel instead of `MutableStateFlow`. The advantage is simpler syntax — no need for `collectAsStateWithLifecycle` in the composable, the state is read directly. The disadvantage is that it ties your ViewModel to the Compose runtime dependency.

`StateFlow` keeps the ViewModel layer framework-agnostic. It can be collected by Compose, by a traditional Fragment, or by tests without Compose dependencies. For most teams, `StateFlow` with `collectAsStateWithLifecycle` is the standard approach because it keeps the ViewModel as a pure Kotlin class with no Compose imports.

The Compose runtime and ViewModel are separate libraries with separate lifecycles. Using `StateFlow` means your ViewModel doesn't need to know Compose exists, which is cleaner for multi-module architectures where the domain layer shouldn't depend on UI frameworks.

#### Q16: How does state restoration work across process death in Compose?

`rememberSaveable` uses the `SavedStateRegistry` under the hood, which writes values to a `Bundle` that the system preserves across process death. When the process is recreated, the `Bundle` is restored and `rememberSaveable` returns the saved value. For ViewModels, `SavedStateHandle` provides the same mechanism — it's backed by the same `SavedStateRegistry`.

The important detail is that both `rememberSaveable` and `SavedStateHandle` are limited by the `Bundle` size constraint (~1 MB across all saved state). Save only lightweight identifiers and re-fetch heavy data from the repository. If you save a large list of objects in `rememberSaveable`, you'll hit a `TransactionTooLargeException` and the app will crash.

#### Q17: What is the right way to expose events from ViewModel to Compose UI?

One-time events (show a snackbar, navigate to a screen) are tricky in Compose because the UI can recompose at any time. The wrong approach is putting events in the UI state data class — they'll be re-consumed on recomposition.

The recommended approaches are:

- **State with consumption** — Use a state field that the UI sets back to null after handling. This is the simplest pattern and works well for navigation events.
- **Channel** — Use a `Channel<Event>` in the ViewModel and collect it in a `LaunchedEffect`. Events are consumed exactly once but can be lost if the UI isn't active.
- **State reduction** — Model everything as state, including "transient" events like snackbar messages. Store the message in state and provide a callback to dismiss it.

Google's official guidance has moved toward modeling everything as state rather than using events, because state is always safe to re-read and doesn't get lost.

#### Q18: How does derivedStateOf differ from just computing a value in the composable body?

If you compute a value directly in the composable body, that computation runs on every recomposition, and the composables reading the result recompose every time — even if the computed value didn't change. `derivedStateOf` caches the result and only triggers downstream recomposition when the result actually changes.

The difference matters when the source state changes frequently but the derived value changes rarely. A scroll position updates on every frame, but "is scrolled past the header" only flips once. Without `derivedStateOf`, the button composable recomposes 60 times per second during scrolling. With `derivedStateOf`, it recomposes exactly once when the threshold is crossed.

Don't overuse `derivedStateOf` for simple one-to-one transformations where the derived value changes as often as the source. It adds overhead for the caching and comparison. Use it when many source changes produce few output changes.

#### Q19: How do you handle text field state efficiently in Compose?

Text input is one of the most performance-sensitive state operations in Compose because every keystroke triggers a state change and recomposition. The key is keeping the text state as close to the `TextField` as possible to minimize the recomposition scope.

If your text state lives in the ViewModel and every keystroke roundtrips through `StateFlow.update { copy(text = newText) }`, you're creating a new state object per keystroke. This works but can cause visible lag on lower-end devices. Hoisting the raw text state to a composable-level `remember` and only syncing to the ViewModel on debounce or submit is more efficient.

Since Compose 1.7, `TextFieldState` provides a more efficient API that handles the text buffer internally. It avoids the recomposition overhead of `mutableStateOf(String)` by managing the text mutation inside the `BasicTextField` component. This is the recommended approach for new code.

### Common Follow-ups

- What happens if you forget to wrap `mutableStateOf` with `remember`?
- How do you share state between two composables that aren't in a parent-child relationship?
- What is the difference between `MutableState` and `MutableStateFlow` in terms of threading?
- Can you use `derivedStateOf` with `snapshotFlow`? When would you?
- How does `rememberSaveable` handle a `LazyColumn` with hundreds of items — does each item save state?
- What happens to `remember` state when a composable leaves the composition and re-enters?
- How do you test composables that use `collectAsStateWithLifecycle`?
- When should you use `produceState` vs collecting a Flow directly?
