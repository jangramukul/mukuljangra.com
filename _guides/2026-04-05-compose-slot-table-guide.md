---
title: Compose Slot Table Internals Guide
layout: post
sequence: 130
categories: post
tags:
  - Jetpack Compose
  - Android
---

The first time I hit a confusing recomposition bug — a `remember` block returning stale data after I reordered items in a list — I realized I didn't actually understand how Compose stores anything. I knew the basics: composables run, state is remembered, recomposition happens when state changes. But I had no mental model for *where* all that information lives.

The answer is the slot table. It's the data structure at the heart of the Compose runtime — not the snapshot system (which handles change notification), and not the compiler plugin (which generates the code). The slot table is where the composition itself is stored: every composable invocation, every remembered value, every node position in the tree. Understanding it explains why `remember` is position-dependent, why structural changes cost more than property changes, and why keys matter in lists.

## What the Slot Table Stores

Every time you call a composable function, the Compose runtime records information about that call in the slot table. This includes group markers identifying the composable invocation, data associated with UI nodes, stored values from `remember` calls, and composition metadata like keys and source positions.

Here's the thing that surprised me when I first read the source: the slot table is not a tree. Even though composition is conceptually a tree of composables, the slot table stores everything in a flat array. The tree structure is encoded implicitly through group start and end markers. Each group knows its size — how many slots it occupies — so the runtime can skip over entire subtrees by jumping ahead in the array rather than traversing child pointers.

```kotlin
// Conceptual layout of slot table entries for:
// Column {
//   Text("Hello")
//   Text("World")
// }

// Slot Table (flat array, simplified):
// [GroupStart: Column, key=0x..., slots=8]
//   [GroupStart: Text, key=0x..., slots=2]
//     [Data: "Hello"]
//   [GroupEnd]
//   [GroupStart: Text, key=0x..., slots=2]
//     [Data: "World"]
//   [GroupEnd]
// [GroupEnd]
```

This flat representation is a deliberate design choice. Tree traversal involves pointer chasing and cache misses. A flat array gives you data locality — the CPU's cache prefetcher can load the next entries before you need them. For a framework that recomposes potentially every frame during animations, that memory access pattern matters more than you'd think.

## Gap Buffer

The slot table uses a gap buffer as its underlying data structure. If you've ever wondered why text editors can handle insertions and deletions efficiently even in documents with millions of characters, the answer is usually a gap buffer. Compose uses the same idea for its composition data.

A gap buffer is an array with a "gap" — a block of empty space — somewhere in the middle. Insertions at the gap position are O(1): just write into the empty space and shrink the gap. Inserting elsewhere requires moving the gap first by shifting data, which costs O(n) where n is the distance moved. The key insight is that most operations are *local* — during recomposition, the Composer walks the slot table linearly, and insertions happen near the current position.

Think about recomposition. The Composer walks through the slot table from top to bottom, comparing the current composition with the new one. If a composable's inputs haven't changed, it skips the entire group by advancing past it. If something changed, it writes new data at the current position. In the common case — stable UI with a few state changes — the Composer is doing mostly sequential reads and occasional writes near its cursor. A gap buffer is ideal for this access pattern.

```kotlin
// Gap buffer visualization during recomposition:
// [Column | Text("Hello") | ___GAP___ | Text("World")]
//                            ^ cursor
//
// Inserting a new Text("!") at cursor is O(1):
// [Column | Text("Hello") | Text("!") | _GAP_ | Text("World")]
//
// But inserting at the beginning requires moving the gap:
// [_GAP_ | Column | Text("Hello") | Text("!") | Text("World")]
// ^ gap moved here first (O(n) shift)
```

This is why conditional composables have a cost. When `if (showError) { ErrorBanner() }` flips from false to true, Compose inserts a new group into the slot table. Flipping back removes it. Both operations may require moving the gap. The cost isn't catastrophic — microseconds for typical UIs — but it's measurably more expensive than updating a value in an existing slot, which is what happens when you change the text of a `Text` composable without altering the tree structure.

## Groups and Keys

Every composable invocation creates a **group** in the slot table. A group has a key (usually derived from the call site), a type marker, and a range of slots holding the group's data. The Compose compiler generates a unique integer key for each call site based on its source position, and this key is what the runtime uses to match invocations across recompositions.

When the Composer walks the slot table during recomposition, it compares the expected key with the stored key. If they match, it's the same composable invocation as last time, and the runtime can compare inputs to decide whether to skip or recompose. If they don't match, something structural changed.

This positional identity works well for static layouts. But it falls apart in loops. Consider a `LazyColumn` rendering messages. Without explicit keys, each item is identified by its loop position. Insert a new message at the top, and every existing item shifts down. The runtime sees mismatched data at every position and recomposes all of them.

```kotlin
// Without keys — identity based on position
LazyColumn {
    items(messages) { message ->
        MessageCard(message) // Position 0 = first message, always
    }
}

// With keys — identity based on message ID
LazyColumn {
    items(messages, key = { it.id }) { message ->
        MessageCard(message) // Identity survives reordering
    }
}
```

The `key { }` composable does the same for non-lazy contexts. It tells the runtime "use this value as identity" instead of relying on call-site position. Without it, moving a composable call loses all `remember` values and restarts side effects. With it, the runtime matches the old group to the new one regardless of position.

I think of keys as the slot table's version of `RecyclerView`'s stable IDs. Same concept, same consequences when you forget them.

## How remember Works

Understanding the slot table makes `remember` almost obvious. When you call `remember { expensiveCalculation() }`, the runtime writes the result into the slot table at the current cursor position during initial composition. On recomposition, when the Composer reaches that position, it reads the stored value instead of re-executing the lambda. No magic, no hidden caches — just a read from a flat array at a known index.

This is why `remember` is position-dependent. The stored value lives at a specific index in the slot table, determined by when the `remember` call is encountered during composition. Move a composable to a different place in your code, and the `remember` inside it occupies a different position — reading a different stored value or triggering re-initialization.

```kotlin
@Composable
fun ChatScreen(messages: List<Message>) {
    // This remember occupies slot position N
    val scrollState = rememberLazyListState()

    // If you conditionally add something BEFORE this:
    if (showBanner) {
        PromoBanner() // This shifts everything after it in the slot table
    }

    // scrollState is now at position N+K (shifted)
    // Without keys, the runtime may read the wrong stored value
    LazyColumn(state = scrollState) {
        items(messages, key = { it.id }) { msg ->
            MessageBubble(msg)
        }
    }
}
```

In practice, the Compose compiler and runtime handle this more gracefully than "reading the wrong value" — group keys help the runtime detect structural changes and reinitialize `remember` blocks when their enclosing group is new. But the fundamental point stands: `remember` is a positional read/write operation on the slot table.

`rememberSaveable` adds another layer on top. Beyond slot table storage, it registers the value with a `SaveableStateRegistry` for process death survival. But the slot table is still the primary mechanism for surviving recomposition.

## Implications for Performance

Once you understand the slot table, several Compose performance characteristics make sense.

**Memory consumption scales with composition depth.** Every composable invocation, every `remember` call, every group marker takes space in the slot table. A deeply nested composition tree creates a large slot table. This is why flattening your composable hierarchy — using `Layout` instead of nested `Column`/`Row` where it makes sense — reduces memory. A typical screen has somewhere between 200 and 500 groups. Complex screens with nested lazy layouts can push past 1,000.

**Skipping is cheap.** When the Composer encounters a composable whose inputs haven't changed, it reads the group's size from the slot table and jumps past all the slots that group occupies. This is a pointer advance, not a traversal — the flat layout means skipping an entire subtree takes constant time. This is why stability annotations matter: they determine whether Compose can compare inputs and skip, or must pessimistically recompose.

**Structural changes cost more than property changes.** Changing the text in a `Text` composable updates a value in an existing slot — a write to a known position. Adding or removing a composable requires inserting or deleting groups, which may involve moving the gap buffer. The gap move is an `arraycopy` — fast, but proportional to the number of slots being shifted.

**`LazyColumn` exists because of the slot table.** Rendering 10,000 items in a regular `Column` means every item occupies groups in the slot table simultaneously. `LazyColumn` composes items on demand in subcompositions that can be disposed — visible items might occupy 50-80 groups while the full list would need 10,000+. The real win of lazy layouts isn't just avoiding layout costs, it's avoiding slot table bloat.

## Debugging the Slot Table

You can't inspect the slot table directly from app code — it's an internal implementation detail. But you can observe its effects through the tools Compose provides.

The **Compose compiler metrics** report is the most useful tool. Adding the compiler report flags to your build gives you a breakdown of how the compiler sees your composables — which functions are restartable, skippable, and which parameters are stable or unstable. This directly tells you how the slot table will behave during recomposition.

```kotlin
// In build.gradle.kts
kotlinOptions {
    freeCompilerArgs += listOf(
        "-P", "plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=" +
            project.layout.buildDirectory.get().asFile.absolutePath + "/compose_reports"
    )
}

// Generated report shows:
// restartable skippable scheme("[androidx.compose.ui.UiComposable]")
// fun MessageCard(stable message: Message, stable onDelete: Function0<Unit>)
//
// restartable scheme("[androidx.compose.ui.UiComposable]")
// fun UserAvatar(unstable user: User)
// ^ Not skippable because User is unstable — forces recomposition every time
```

The **Layout Inspector** in Android Studio shows the composition tree — a visualization of what the slot table contains. You can see recomposition counts per composable. High counts mean either inputs are changing frequently or stability issues are preventing skipping.

For deeper debugging, `currentCompositeKeyHash` inside a composable reads the key hash the runtime generates for the current position. Log it to verify that groups maintain the same identity across recompositions — if the hash changes unexpectedly, something structural shifted.

## Quiz

**Question 1:** You have a `Column` with three `Text` composables. You add a conditional `if (showAd) { AdBanner() }` before the first `Text`. When `showAd` becomes true, what happens to the `remember` values inside the three `Text` composables?

**Wrong**: Nothing — `remember` values are preserved because the `Text` composables haven't changed.

**Correct**: The group keys help the runtime detect that these are the same composable invocations (they have unique call-site keys from the compiler), so `remember` values are preserved. The gap buffer shifts to accommodate the new `AdBanner` group, but identity is maintained by keys. However, if these were inside a loop without explicit keys, the position shift would cause identity mismatches.

**Question 2:** A `LazyColumn` displays 500 items without explicit `key` parameters. You insert a new item at position 0. How many items does Compose recompose?

**Wrong**: Only 1 — Compose is smart enough to detect the insertion and only compose the new item.

**Correct**: All visible items get recomposed. Without keys, identity is based on position. Inserting at position 0 shifts every existing item's position by one, causing the runtime to see mismatched data at every position in the slot table. Items outside the visible window aren't affected because they don't exist in the slot table (lazy composition).

## Coding Challenge

Build a composable that demonstrates the difference between keyed and unkeyed lists. Create a `CounterList` that displays a list of items, each with its own counter managed by `remember { mutableIntStateOf(0) }`. Add buttons to insert an item at the top and remove an item from the middle. Without keys, inserting at the top causes all counters to appear to shift down (because `remember` values are positionally bound). With keys, counters stay attached to their original items. Use a `var items by remember { mutableStateOf(listOf("A", "B", "C", "D")) }` and toggle between `key(item) { ... }` and no key to observe the difference. This exercise makes the slot table's positional identity concrete and visible.

Thanks for reading!
