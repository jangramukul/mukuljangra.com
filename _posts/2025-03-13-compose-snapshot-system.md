---
title: Compose Snapshot System Under the Hood
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
---

The first time I really looked at how Compose tracks state changes, I expected to find something like LiveData's observer pattern — register a listener, get notified on changes, update the UI. What I found instead was something far more interesting: a full transactional state system that works more like a database than an observer pattern. Compose doesn't just track "this value changed." It takes snapshots of mutable state, isolates concurrent modifications, detects conflicts, and decides what to recompose. The snapshot system is the foundation that makes everything else in Compose work — recomposition, `derivedStateOf`, `snapshotFlow`, and even the Compose compiler's ability to skip unchanged composables.

Zack Klipp's deep dives into this system were what finally made it click for me. What follows is my understanding of how the pieces fit together and why it matters for writing efficient Compose code.

## Snapshots Are Database Transactions for State

The core mental model is this: **a snapshot is an isolated view of all mutable state at a point in time**, similar to a database transaction's isolation level. When you call `Snapshot.withMutableSnapshot { }`, the runtime creates a copy-on-write view where you can read and modify state objects. Other threads see the old values until you commit. If you commit successfully, your changes become visible globally. If there's a conflict — another snapshot modified the same state — the commit can fail or invoke a merge policy.

```kotlin
val counter = mutableStateOf(0)

// Thread A
Snapshot.withMutableSnapshot {
    // Inside this block, changes are isolated
    counter.value = counter.value + 1
    // Other threads still see counter.value == 0
}
// After the block completes (commit), everyone sees counter.value == 1

// Thread B (running concurrently with Thread A's snapshot)
println(counter.value)  // Might print 0 if Thread A hasn't committed yet
```

This isolation is what makes Compose thread-safe without requiring `synchronized` blocks or explicit locking on state objects. The recomposer runs compositions inside snapshots. When a composition reads state, it's reading from its snapshot's view. When a state value changes in the global snapshot, the recomposer knows which compositions read that state and schedules them for recomposition. The key insight is that state reads during composition are tracked, but state reads inside callbacks (onClick, LaunchedEffect) are not — because callbacks execute outside the composition snapshot.

## GlobalSnapshot and the Notification Pipeline

In practice, most of your app's state changes happen in the `GlobalSnapshot`. When you write `counter.value = 5` outside of any explicit snapshot, you're writing to the global snapshot. But how does Compose know something changed?

Every `MutableState` object is a `StateObject` — an interface that hooks into the snapshot system. When you write to a `MutableState`, the snapshot system records the write. The `GlobalSnapshot` is periodically "applied" (committed), which triggers notifications to anyone who registered to observe snapshot changes. The Compose runtime registers a `Snapshot.registerGlobalWriteObserver` callback that captures which state objects were modified. When the global snapshot applies, the runtime checks which compositions read those state objects and marks them as invalid — needing recomposition.

The notification flow looks like this: you write to a `MutableState` → the snapshot system records the write in the current snapshot → the snapshot is applied → the global write observer fires → the recomposer identifies compositions that read the modified state → those compositions are scheduled for recomposition on the next frame.

```kotlin
class CartPresenter {
    // This MutableState is a StateObject tracked by the snapshot system
    var itemCount by mutableStateOf(0)
        private set

    fun addItem() {
        // This write is recorded in the current (global) snapshot
        itemCount++
        // The snapshot system notifies the recomposer
        // Any composable that read itemCount will be scheduled for recomposition
    }
}

@Composable
fun CartBadge(presenter: CartPresenter) {
    // This read is tracked because it happens during composition
    val count = presenter.itemCount
    // The snapshot system records: "this composition reads presenter.itemCount"

    if (count > 0) {
        Badge { Text("$count") }
    }
}
```

This is fundamentally different from LiveData or StateFlow, where you explicitly subscribe to changes. In Compose, reads are tracked implicitly during composition. You never call `observe()` or `collect()`. The snapshot system sees every state read during composition and automatically builds the dependency graph.

## derivedStateOf — Smarter Than You Think

Most developers know `derivedStateOf` as "like computed properties" — it derives one state from others. But the internal mechanism is more sophisticated than simple computation. `derivedStateOf` does two things that `remember(key) { compute() }` does not: it **deduplicates invalidations** and it **caches the derived value**.

Consider a search filter scenario:

```kotlin
@Composable
fun FilteredProductList(products: List<Product>) {
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf(Category.ALL) }

    // Without derivedStateOf — recomputes and invalidates on every keystroke
    val filtered = remember(query, category) {
        products.filter { it.matchesQuery(query) && it.matchesCategory(category) }
    }

    // With derivedStateOf — only invalidates when the RESULT changes
    val filteredDerived by remember {
        derivedStateOf {
            products.filter { it.matchesQuery(query) && it.matchesCategory(category) }
        }
    }
}
```

The `remember(query, category)` version recomputes on every change to `query` or `category`, and because it produces a new list instance every time, it triggers recomposition of everything downstream that reads `filtered`. Even if typing "ap" vs "app" produces the same filtered list (because no products match either), the downstream composables are still recomposed because the list reference changed.

`derivedStateOf` tracks the dependencies internally through the snapshot system — it knows it reads `query` and `category` because those reads happen inside the derivation lambda. When either input changes, `derivedStateOf` re-runs the lambda. But here's the key: **it compares the new derived value to the previous one**. If the result is structurally equal to the old value, it does not trigger invalidation. The composables reading `filteredDerived` are not recomposed because, from their perspective, the state didn't change.

This deduplication happens at the snapshot level. The `DerivedSnapshotState` object only reports itself as modified when the computation produces a different result. It's not just an optimization — it's a different invalidation semantic. `remember` with keys invalidates when inputs change. `derivedStateOf` invalidates when the output changes. For expensive computations with many input changes that produce the same output, this distinction eliminates unnecessary recompositions that `remember` cannot.

## Restartable Functions and State Tracking

When the Compose compiler processes a `@Composable` function, it transforms it into a "restartable" function. This means the function can be re-invoked at a later time when its read state changes, without re-invoking the entire parent composition tree. The compiler injects code that registers the composable's body with the recomposer as a restart scope.

During composition, when the composable reads a `MutableState` value, the snapshot system records that read and associates it with the current restart scope. Later, when that state value changes, the recomposer looks up which restart scopes are associated with it and schedules them for re-execution. This is the mechanism behind Compose's "only recompose what changed" behavior.

```kotlin
@Composable
fun OrderSummary(order: Order) {
    // The compiler makes this entire function a restart scope

    // Reading order.itemCount triggers a snapshot read
    Text("Items: ${order.itemCount}")

    // This onClick lambda executes OUTSIDE composition
    Button(onClick = {
        // State reads here are NOT tracked by the snapshot system
        // Modifying state here triggers writes, not tracked reads
        order.addItem()
    }) {
        Text("Add Item")
    }
}
```

The distinction between reads-during-composition and reads-in-callbacks is critical. During composition, the snapshot system is actively tracking every state read to build the dependency graph. In a callback like `onClick`, `LaunchedEffect`, or `rememberCoroutineScope`, the snapshot system is not tracking reads for recomposition purposes. Writes still trigger notifications (because writes are always tracked), but reads in callbacks don't create recomposition subscriptions.

This is why moving state reads into lambdas can be an optimization technique. If you pass `{ viewModel.scrollOffset }` as a lambda instead of reading `viewModel.scrollOffset` directly in the composable body, the read happens during the lambda's execution (in the layout or draw phase) rather than during composition. The composable doesn't register a dependency on `scrollOffset`, so changes to it don't trigger recomposition — they trigger a re-layout or re-draw instead, which is cheaper.

## The Slot Table — Where State Lives

The slot table is Compose's internal data structure for storing the state of a composition. Every `remember` call, every `mutableStateOf`, every composable invocation — they all have entries in the slot table. It's essentially an array-backed tree that maps the composition's logical structure to stored values.

When you call `remember { mutableStateOf(0) }`, two things are stored in the slot table: the `remember` group entry and the `MutableState` object itself. On recomposition, Compose walks the slot table alongside the composable execution. When it encounters the `remember` call again, it looks up the existing slot entry and returns the previously stored `MutableState` instead of creating a new one. This is how state persists across recompositions — it's literally stored in the table and retrieved by position.

The slot table uses a **gap buffer** — the same data structure used in text editors. There's a contiguous array with a "gap" that can be moved to any position for efficient insertions and deletions. When composables are added or removed (e.g., items in a `LazyColumn`), the gap moves to that position, and the insertion or deletion is O(1). This is more efficient than a tree or map structure because compositions are predominantly linear — you walk through the composable tree top to bottom, left to right, and the slot table mirrors that access pattern.

The practical implication is that **the order of composable calls matters**. The slot table identifies entries by position. If you conditionally include composables — `if (condition) Text("A")` followed by `Text("B")` — and the condition changes, Compose needs to handle the shift. With keys (`key(id) { ... }`), you help Compose match slot table entries correctly across recompositions when the order changes. Without keys, Compose may reuse the wrong slot entry for the wrong composable, leading to state mixing bugs in lists.

## When to Use derivedStateOf vs remember with Keys

This is the practical question I get most, and the answer comes directly from understanding the snapshot mechanics.

**Use `remember(key1, key2) { compute() }`** when the computation is cheap and you want to rerun it whenever inputs change. The downstream composables will recompose every time the inputs change, even if the output is the same. For simple transformations like formatting a date, computing a display string, or mapping an enum to a color, this is perfectly fine. The recomposition is cheap and the code is simpler.

**Use `derivedStateOf`** when the computation is expensive OR when the inputs change more frequently than the output. The classic example is a list filter: the search query changes on every keystroke, but the filtered list might stay the same for several keystrokes. `derivedStateOf` prevents those unnecessary downstream recompositions. Another common case is `scrollState.firstVisibleItemIndex > 0` — the scroll offset changes on every frame during scrolling, but the boolean "is scrolled" only changes twice (at the top and away from the top).

```kotlin
@Composable
fun MessageList(messages: List<Message>) {
    val listState = rememberLazyListState()

    // GOOD: derivedStateOf — scrollState changes every frame,
    // but this boolean only changes at the boundary
    val showScrollToTop by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 5 }
    }

    // BAD: remember with keys — would recompose on every scroll frame
    // val showScrollToTop = remember(listState.firstVisibleItemIndex) {
    //     listState.firstVisibleItemIndex > 5
    // }

    Scaffold(
        floatingActionButton = {
            if (showScrollToTop) {
                FloatingActionButton(onClick = { /* scroll to top */ }) {
                    Icon(Icons.Default.ArrowUpward, "Scroll to top")
                }
            }
        },
    ) {
        LazyColumn(state = listState) {
            items(messages) { message -> MessageCard(message) }
        }
    }
}
```

The wrong choice here doesn't crash your app — it just causes unnecessary recompositions that waste CPU cycles and can cause jank in scroll-heavy UIs. For most state derivations, `remember` with keys is fine. Reserve `derivedStateOf` for the high-frequency-input, low-frequency-output pattern where the deduplication genuinely matters.

## The Reframe

The snapshot system is what separates Compose from a traditional reactive UI framework. Most reactive frameworks use an observer pattern: subscribe to a stream, get notified of changes, update the UI. Compose inverted this. Instead of you telling the framework what to watch, the framework watches what you read. The snapshot system turns every state access during composition into an implicit subscription, and every state write into an implicit notification. You never register observers. You never unregister them. You never worry about memory leaks from forgotten subscriptions.

This is why Compose code feels imperative even though it's reactive underneath. You write `if (isLoading) LoadingSpinner()` and it just works — `isLoading` is a snapshot-tracked state, the read is recorded, and when it changes, only the composable that reads it is re-executed. The snapshot system is the invisible layer that makes this possible, and understanding it explains most of Compose's otherwise-mysterious behavior — why state reads in lambdas don't trigger recomposition, why `derivedStateOf` is different from `remember`, and why the order of composable calls matters.

Thanks for reading through all of this :), Happy Coding!
