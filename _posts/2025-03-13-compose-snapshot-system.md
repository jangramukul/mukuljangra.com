---
title: Compose Snapshot System Under the Hood
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
---

The first time I really looked at how Compose tracks state changes, I expected to find something like LiveData's observer pattern — register a listener, get notified on changes, update the UI. What I found instead was something far more interesting: a full transactional state system built on multiversion concurrency control (MVCC), the same concept that powers database isolation levels.

Wait, what? A *database concept* running your UI?

Yep. Compose doesn't just track "this value changed." It takes snapshots of mutable state, isolates concurrent modifications, detects conflicts, and decides what to recompose. The snapshot system is the foundation that makes everything else in Compose work — recomposition, `derivedStateOf`, `snapshotFlow`, and even the compiler's ability to skip unchanged composables.

Zack Klipp's deep dives into this system were what finally made it click for me. What follows is my understanding of how the pieces fit together, starting from the `Snapshot` class itself and working up to how the recomposer uses all of it.

## The Snapshot Class

A `Snapshot` is an isolated, read-only view of all snapshot state values at the point it was created. Think of it like a save point in a video game — it captures the state of every `MutableState`, `SnapshotStateList`, `SnapshotStateMap`, and `derivedStateOf` in your entire program at that moment. You create one with `Snapshot.takeSnapshot()`, and you "restore" it by calling `enter {}` — inside that lambda, every state object returns the value it had when the snapshot was taken, regardless of what changed since.

```kotlin
val userName = mutableStateOf("Spot")

userName.value = "Spot"
val snapshot = Snapshot.takeSnapshot()
userName.value = "Fido"

println(userName.value)              // Fido
snapshot.enter { println(userName.value) }  // Spot
println(userName.value)              // Fido

snapshot.dispose()
```

Look at that carefully. Outside the snapshot, the name is "Fido" — that's the current value. But *inside* `snapshot.enter {}`, we're back in the save point. The name is still "Spot." The real world moved on, but our snapshot is frozen in time.

The current snapshot for any thread is accessible via `Snapshot.current`. All code runs inside some snapshot — even if you never explicitly create one. The reads inside `enter {}` are isolated: no matter how deep the call stack goes, every state access sees the snapshotted value. But this snapshot is read-only. Trying to write to a `MutableState` inside a read-only snapshot's `enter` block throws `IllegalStateException: Cannot modify a state object in a read-only snapshot`. For writes, you need a mutable snapshot.

## MutableSnapshot — Isolation and Commit

`Snapshot.takeMutableSnapshot()` returns a `MutableSnapshot`, which adds write capability and a critical feature: **isolation**. Inside a mutable snapshot's `enter {}` block, you can read and write state freely. Those changes are invisible to all other threads and snapshots until you explicitly call `apply()`. If you never apply, the changes are discarded when you call `dispose()`.

Here's the analogy that made this click for me: a mutable snapshot is like a Google Docs suggestion. You make your edits, but nobody sees them until you (or someone) accepts the suggestion. And if you delete the suggestion? The original document is untouched.

```kotlin
val balance = mutableStateOf(100)

val snapshot = Snapshot.takeMutableSnapshot()
snapshot.enter {
    balance.value = balance.value - 30
    println(balance.value)  // 70
}
println(balance.value)      // 100 — changes not applied yet

snapshot.apply()
println(balance.value)      // 70 — now visible globally
snapshot.dispose()
```

Inside the snapshot, we see 70. Outside, the rest of the world still sees 100. Only after `apply()` does the change go live.

This isolation is what makes Compose thread-safe without `synchronized` blocks. The recomposer runs each composition inside a mutable snapshot. If two compositions run concurrently on different threads, each one sees a consistent view of state. If both modify the same state object, the snapshot system detects the conflict at apply time — `apply()` returns `SnapshotApplyResult.Failure` unless a `SnapshotMutationPolicy` with a custom `merge` function resolves it.

Snapshots also nest. If you call `takeMutableSnapshot()` inside another snapshot's `enter` block, applying the inner snapshot only pushes changes to the outer snapshot, not globally. The outer snapshot must also be applied for changes to become visible at the top level. This nesting is how the Compose runtime layers composition snapshots on top of the global snapshot.

## Snapshot.withMutableSnapshot — The Practical API

The pattern of take-enter-apply-dispose is common enough that there's a helper: `Snapshot.withMutableSnapshot {}`. It takes a mutable snapshot, runs your block inside it, applies on success, and disposes automatically. This is the API you'd actually use in application code.

```kotlin
val cartTotal = mutableStateOf(0)
val cartItems = mutableStateListOf<String>()

// Atomic update — both changes apply together or not at all
Snapshot.withMutableSnapshot {
    cartItems.add("Keyboard")
    cartTotal.value = cartItems.size
}
```

The main use case is **atomic state updates from background threads**. Imagine a coroutine on `Dispatchers.IO` that just fetched new data from your API. You need to update the item list *and* the item count. Without a snapshot boundary, another thread could read the state right between those two writes — it would see the new items but the old count. Your UI briefly shows "5 items" with 6 items actually listed. Wrapping those writes in `withMutableSnapshot` ensures they become visible together as one atomic unit. It's also thread-safe by design: the snapshot provides isolation, so you don't need mutexes or other locking around state mutations.

## StateObject and StateRecord — How Reads and Writes Work

Now we're going a layer deeper. Every snapshot-aware state object implements the `StateObject` interface. This includes `MutableState`, `SnapshotStateList`, `SnapshotStateMap`, and `DerivedSnapshotState`. The `StateObject` interface is the hook that connects your state to the snapshot machinery.

Internally, each `StateObject` maintains a linked list of `StateRecord` instances. Think of it like a version history for a single file — each `StateRecord` is a version, stamped with the snapshot ID it was written in. When you read a `MutableState`, the snapshot system walks this linked list to find the record that's valid for the current snapshot — the most recent record whose snapshot ID is visible from where you're reading. When you write, a new `StateRecord` is created (or an old one is reused) and linked to the current snapshot's ID. This is the copy-on-write mechanism that makes isolation work without actually copying all state on every snapshot creation.

The read and write operations also notify observers. When code inside a snapshot reads a state object, the snapshot's read observer (if one was registered) is called with that `StateObject`. When a write happens, the write observer fires. These observers receive the raw `StateObject` instance — you can track which objects were read or written, but the observer itself doesn't know the values. This is the mechanism that powers both `SnapshotStateObserver` (used by the Compose runtime to track composition dependencies) and `snapshotFlow` (which takes a read-only snapshot, tracks reads, and re-runs the block when those state objects change).

> **🧠 Think about it:** If every `StateObject` keeps a linked list of versioned records, and snapshots just look up the right version by ID — what happens to old records that no snapshot will ever read again? The snapshot system garbage collects them. When all snapshots that could reference a record have been disposed, the record can be reused.

## Snapshot Observers — The Notification System

The snapshot system exposes two global observer registration points that the Compose runtime relies on.

**`Snapshot.registerGlobalWriteObserver`** installs a callback that fires immediately whenever a state object is written to in the global snapshot. The Compose runtime uses this to know that something changed and a recomposition might be needed. The callback receives the `StateObject` that was modified. Importantly, this fires synchronously on the thread that performed the write — it's a signal to schedule work, not to do the recomposition itself.

**`Snapshot.registerApplyObserver`** installs a callback that fires when a snapshot is applied (or when the global snapshot is advanced). It receives the set of all state objects that changed and the snapshot they were applied from. This is how Compose determines *which* composables to invalidate: it cross-references the changed state objects against the set of objects each composition read during its last execution.

```kotlin
// Debugging observer — see which state objects change
val handle = Snapshot.registerApplyObserver { changedObjects, _ ->
    changedObjects.forEach { stateObject ->
        println("State changed: $stateObject")
    }
}

// Later, when done observing
handle.dispose()
```

The notification flow in practice: you write to a `MutableState` → the global write observer fires → the Compose runtime schedules a `sendApplyNotifications()` call before the next frame → `sendApplyNotifications()` advances the global snapshot → the apply observer fires with the set of changed objects → the recomposer identifies which restart scopes read those objects → those scopes are scheduled for recomposition.

That chain of events is what happens every time you write `counter.value++` in a button click. All of it. Invisibly.

## The Global Snapshot and the Recomposer Loop

All code runs inside a snapshot, even if you never create one explicitly. The root of the snapshot tree is the **global snapshot** — a special mutable snapshot that's always open. When you write `counter.value = 5` in a click handler or a coroutine, that write happens in the global snapshot.

Unlike regular mutable snapshots, the global snapshot doesn't have an `apply()` method. Instead, it gets **advanced**. Think of it like a rolling film reel — the global snapshot doesn't stop and restart, it smoothly advances to the next frame. Advancing it atomically commits the current state and immediately opens a new version. There are three ways it advances: when a mutable snapshot is applied to it, when `Snapshot.sendApplyNotifications()` is called, or when `Snapshot.notifyObjectsInitialized()` is called. The Compose runtime schedules `sendApplyNotifications()` before each frame, ensuring that all state changes since the last frame become visible and trigger the appropriate recompositions.

The recomposer's loop works like this: state changes happen in the global snapshot between frames. Before the next frame, `sendApplyNotifications()` advances the global snapshot and fires the apply observer with the changed state objects. The recomposer looks up which compositions read those objects. It takes a mutable snapshot, recomposes the invalidated composables inside that snapshot, and applies the result. That application advances the global snapshot again, making any state changes from recomposition visible to the rest of the app.

## Restartable Functions and Composition Tracking

When the Compose compiler processes a `@Composable` function, it transforms it into a restartable function — one that can be re-invoked later when its dependencies change, without re-invoking the entire parent tree. The compiler injects code that registers the composable's body with the recomposer as a **restart scope**.

During composition, when the composable reads a `MutableState` value, the snapshot system records that read and associates it with the current restart scope. Later, when that state value changes, the recomposer looks up which restart scopes depend on it and schedules them for re-execution. You never told the framework "watch this value for me." It figured it out because you *read* it.

```kotlin
@Composable
fun OrderSummary(order: Order) {
    // Reading order.itemCount triggers a snapshot read
    Text("Items: ${order.itemCount}")

    Button(onClick = {
        // This executes OUTSIDE composition — reads here
        // are NOT tracked for recomposition
        order.addItem()
    }) {
        Text("Add Item")
    }
}
```

The distinction between reads-during-composition and reads-in-callbacks is critical. During composition, the snapshot system actively tracks every state read to build the dependency graph. In a callback like `onClick` or `LaunchedEffect`, reads don't create recomposition subscriptions. Writes still trigger notifications — writes are always tracked — but reads in callbacks are invisible to the recomposer.

This is why passing `{ viewModel.scrollOffset }` as a lambda instead of reading it directly in the composable body is an optimization: the read moves from composition phase to layout/draw phase, avoiding recomposition entirely. Same data, same result on screen, but the *when* of the read completely changes which machinery kicks in.

> **💡 The "aha" moment:** Compose doesn't track state because you told it to. It tracks state because you *read* it during composition. The act of reading *is* the subscription. That's why there's no `addObserver()` or `removeObserver()` anywhere in your Compose code — the snapshot system handles it all automatically just by watching what you access.

## derivedStateOf — Output-Based Invalidation

Most developers know `derivedStateOf` as "computed properties for Compose." But the internal mechanism is more sophisticated than simple computation. `derivedStateOf` does two things that `remember(key) { compute() }` does not: it **deduplicates invalidations** and it **caches the derived value** at the snapshot level.

`derivedStateOf` tracks its dependencies through the snapshot system — it knows which state objects the derivation lambda reads because those reads happen inside a tracked context. When any input changes, it re-runs the lambda. But here's the key: **it compares the new result to the previous one**. If they're structurally equal, it does not report itself as modified. Downstream composables are not recomposed because, from their perspective, nothing changed.

Picture a speedometer in your car. The engine RPM is constantly changing — hundreds of times per second. But the speedometer needle only moves when the *speed* changes meaningfully. `derivedStateOf` is that speedometer. The inputs are noisy and high-frequency, but the output only fires when something actually different comes out.

```kotlin
@Composable
fun MessageList(messages: List<Message>) {
    val listState = rememberLazyListState()

    // scrollState changes every frame, but this boolean
    // only changes at the boundary
    val showScrollToTop by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 5 }
    }

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

This is a different invalidation semantic. `remember` with keys invalidates when inputs change. `derivedStateOf` invalidates when the output changes. For high-frequency inputs that produce low-frequency outputs — scroll position to a boolean, keystrokes to a filtered list — this distinction eliminates unnecessary recompositions. For cheap computations where the output changes on every input change, plain `remember` with keys is simpler and perfectly fine.

## The Slot Table — Where State Lives

The slot table is Compose's internal data structure for storing the state of a composition. Every `remember` call, every `mutableStateOf`, every composable invocation has entries in this array-backed tree. When you call `remember { mutableStateOf(0) }`, both the `remember` group entry and the `MutableState` object are stored in the slot table. On recomposition, Compose walks the table alongside the composable execution and returns the previously stored instance instead of creating a new one.

The slot table uses a **gap buffer** — the same data structure used in text editors. A contiguous array with a movable "gap" that allows O(1) insertions and deletions at any position. If you've ever used a text editor and noticed that typing in the middle of a document is just as fast as typing at the end — that's a gap buffer at work. It fits compositions well because they're predominantly linear: you walk the composable tree top to bottom, left to right, and the slot table mirrors that access pattern.

The practical implication is that **the order of composable calls matters**. The slot table identifies entries by position. If you conditionally include composables and the condition changes, Compose needs to handle the shift. With `key(id) { ... }`, you help Compose match slot table entries correctly across recompositions. Without keys, Compose may reuse the wrong slot entry for the wrong composable, leading to state mixing bugs in dynamic lists.

> **🔥 Real talk:** If you've ever had a bug where items in a `LazyColumn` randomly showed the wrong state after scrolling — wrong checkbox state, wrong text in an input field — it's almost certainly a slot table identity problem. Adding proper `key()` blocks is usually the fix. The slot table matched your composable to the wrong stored state because it identified entries by position, not by the data they represent.

## Real-World Use Cases

Understanding the snapshot system opens up some practical techniques beyond just writing composables.

**Custom snapshot observers for debugging.** If you're tracking down a state-related bug — say, a composable recomposing more often than expected — you can register a temporary `Snapshot.registerApplyObserver` to log which state objects are changing and when. This is more precise than Layout Inspector's recomposition counts because you see the actual state objects, not just the composable names.

**`withMutableSnapshot` for atomic background updates.** When a repository fetches data on `Dispatchers.IO` and needs to update multiple `MutableState` objects atomically, wrapping the writes in `Snapshot.withMutableSnapshot {}` ensures they become visible as one unit. Without it, the UI could briefly render an inconsistent intermediate state — new items with an old count, for example.

**Understanding why state reads in lambdas don't trigger recomposition.** This is the most common source of confusion I see. When you pass a state read inside a lambda — `Modifier.offset { IntOffset(0, scrollOffset.value) }` — the read happens during layout, not composition. The composition snapshot never records it, so changes to `scrollOffset` trigger re-layout instead of recomposition. Once you understand that the snapshot system only tracks reads for the snapshot that's currently active, this behavior becomes obvious instead of mysterious.

## The Reframe

Here's what changed how I think about Compose entirely: **the snapshot system is not an observer pattern. It's a database.** Most reactive frameworks work by subscribing: you register a listener, get notified of changes, update the UI. Compose inverted this. Instead of you telling the framework what to watch, the framework watches what you read. Every state access during composition becomes an implicit subscription. Every state write becomes an implicit notification. You never register observers. You never unregister them. You never worry about memory leaks from forgotten subscriptions.

This is why Compose code feels imperative even though it's reactive underneath. You write `if (isLoading) LoadingSpinner()` and it just works — `isLoading` is a snapshot-tracked state, the read is recorded, and when it changes, only the composable that reads it is re-executed. The `Snapshot` class, `StateObject`, `StateRecord`, the global snapshot, the apply observers — they're the invisible infrastructure that makes this possible. And understanding how they connect explains most of Compose's otherwise-mysterious behavior.

Thanks for reading through all of this :), Happy Coding!
