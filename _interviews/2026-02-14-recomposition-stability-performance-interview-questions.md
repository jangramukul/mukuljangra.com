---
title: "Recomposition, Stability & Performance"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 18
sequence: 18
description: "Recomposition is the core mechanism that makes Compose reactive."
---

## Recomposition, Stability & Performance

Recomposition is the core mechanism that makes Compose reactive. Understanding what triggers it, how the stability system decides what to skip, and how to diagnose performance problems separates candidates who use Compose from those who actually understand it.

#### What is recomposition?

Recomposition is when the Compose runtime re-runs your composable functions because their input state changed. Think of it like a spreadsheet — you change one cell, and only the cells that reference it recalculate. Compose tracks which state values each composable reads, and when a state changes, only those composables get re-invoked. I describe the UI as a function of state, and the framework handles the rest.

#### What triggers recomposition?

A `State` object that a composable reads during composition has to change its value. This includes `mutableStateOf`, `mutableStateListOf`, `mutableStateMapOf`, and derived state like `derivedStateOf`. The moment you read `.value` of a state object, you're creating a subscription — the runtime now knows exactly which composables to invalidate when that state changes.

Here's the thing — if I change a regular variable (not wrapped in `State`), Compose has zero idea about it and won't recompose. It's invisible to the runtime.

#### What is smart recomposition?

Compose doesn't blindly re-execute everything when something changes. If a parent recomposes but passes the same parameters to a child, the child gets skipped entirely. The runtime compares new arguments with previous ones and says "nothing changed here, moving on."

This is why parameter types matter so much. If all parameters are stable and unchanged, Compose skips the function. But if even one parameter is unstable, Compose can't guarantee equality and has to recompose — just to be safe.

#### What is the stability system in Compose?

The Compose compiler looks at every type used as a composable parameter and classifies it as stable or unstable. A type is stable if:

- It's a primitive (`Int`, `String`, `Float`, `Boolean`)
- It's a functional type (lambdas)
- It's annotated with `@Stable` or `@Immutable`
- It's a class where all public properties are `val` and are themselves stable types

Unstable types can't be reliably compared between recompositions. So Compose takes the cautious route — it always recomposes when an unstable parameter is passed, even if the actual values haven't changed. It's like a bouncer who can't read IDs — if they're not sure, nobody gets in.

> **🧠 Think about it:** If you have a data class with all `val` properties but one of them is a `List<String>`, is the class stable or unstable? Why?

#### What is the difference between @Stable and @Immutable?

`@Immutable` is the strong promise — all public properties will never change after construction. Once created, the object is frozen solid. `@Stable` is the weaker handshake — properties might change, but when they do, Compose will be notified through the snapshot system (like `MutableState`).

```kotlin
@Immutable
data class UserProfile(
    val name: String,
    val avatarUrl: String,
    val isVerified: Boolean
)

@Stable
class CartState(
    items: List<CartItem>
) {
    var items by mutableStateOf(items)
        private set
}
```

Use `@Immutable` for data classes and models that don't change after creation. Use `@Stable` for state holders where properties can change but those changes go through Compose's state system.

#### Why are collections like List<> considered unstable by default?

Here's the thing — Kotlin's `List` interface doesn't guarantee immutability. A `MutableList` can be cast to `List`, so the compiler can't trust that the contents won't change behind its back. Even if you pass a `listOf(...)`, the declared type is still `kotlin.collections.List`, which the compiler marks as unstable.

The fix is to use Kotlinx Immutable Collections (`ImmutableList`, `PersistentList`) or wrap the list inside a stable holder:

```kotlin
// Unstable — Compose can't skip
@Composable
fun TagList(tags: List<String>) { ... }

// Stable — Compose can skip when content hasn't changed
@Composable
fun TagList(tags: ImmutableList<String>) { ... }

// Also stable — wrapper approach
@Immutable
data class TagListState(val tags: List<String>)

@Composable
fun TagList(state: TagListState) { ... }
```

The wrapper approach is often the simplest because it doesn't need an external dependency.

#### How does Compose handle interfaces for stability?

By default, the compiler treats interfaces as unstable because it can't verify what the concrete implementation will be at runtime. Even if every implementation is immutable, the interface itself doesn't carry that guarantee. It's like trusting a contract without reading the fine print.

Mark the interface with `@Immutable` to tell the compiler all implementations will be immutable:

```kotlin
@Immutable
interface UiEvent

@Immutable
data class NavigateEvent(val route: String) : UiEvent

@Immutable
data class ShowSnackbar(val message: String) : UiEvent
```

You can also mark interfaces with `@Stable` when implementations will use Compose's state system for mutations. Without these annotations, any composable that takes an interface parameter will never be skipped.

#### Why should I use viewModel::onClick instead of { viewModel.onClick() } in composables?

When you write `{ viewModel.onClick() }`, a new lambda instance is created on every recomposition. The new instance isn't equal to the previous one, so Compose treats the parameter as changed and recomposes the child.

Plot twist — using a method reference like `viewModel::onClick` produces a stable reference that stays the same across recompositions. Compose sees the same function reference and can skip the child composable if nothing else changed. This matters most in lists or frequently recomposing UI where many lambda allocations pile up.

#### How does Compose compare parameters to decide whether to skip recomposition?

For stable types, Compose uses `equals()` to compare old and new parameter values. If all parameters are stable and `equals()` returns true for all of them, the composable is skipped entirely.

For unstable types, Compose doesn't even attempt a comparison — it always recomposes. This is exactly why marking data classes with `@Immutable` matters. Without it, a data class that has a `List` parameter is unstable, and every parent recomposition forces the child to recompose too, even when the data is identical.

For lambdas, it depends on whether they capture values. A non-capturing lambda is a singleton — always equal to itself. A capturing lambda gets wrapped in a `remember` block by the compiler if strong skipping mode is enabled. Otherwise, each recomposition creates a brand new instance.

#### What is positional memoization?

Compose identifies composable calls by their position in the source code, not by any key or name. The compiler assigns a unique key to each call site based on where it sits in the code, and the runtime uses that key to match calls between compositions.

This is why composables inside `if/else` or loops need extra care. If a composable moves to a different position in the call tree — like items reordering in a loop — Compose treats it as a completely new composable and throws away the old state. The `key()` composable exists specifically to override positional identity when ordering can change.

#### What is donut-hole skipping?

Donut-hole skipping means Compose can skip recomposing a parent while still recomposing the content lambda inside it. Picture a donut — the outer ring is the parent composable, and the hole in the middle is the content lambda. They recompose independently.

```kotlin
@Composable
fun Card(content: @Composable () -> Unit) {
    Surface(modifier = Modifier.padding(16.dp)) {
        content() // this lambda can recompose on its own
    }
}

@Composable
fun Screen() {
    val count by viewModel.count.collectAsStateWithLifecycle()
    Card {
        Text("Count: $count") // only this recomposes when count changes
    }
}
```

`Card` itself doesn't recompose because its parameters haven't changed. But the content lambda captures `count`, so when `count` changes, only the lambda body re-executes. This is a natural result of how Compose tracks state reads — it scopes invalidation to the smallest composable that actually reads the changed state.

#### What is strong skipping mode?

Strong skipping mode is a compiler feature enabled by default since Compose Compiler 2.0, and it changes the game for how Compose handles unstable parameters and lambdas. Without strong skipping, a composable with any unstable parameter is never skipped — game over. With strong skipping, Compose uses instance equality (`===`) for unstable parameters instead of just giving up.

The other big change is lambda memoization. Without strong skipping, capturing lambdas create a new instance on every recomposition. With it, the compiler wraps them in `remember` automatically, so the lambda instance is reused as long as its captured values haven't changed.

```kotlin
// Without strong skipping: this lambda recreates every recomposition
Button(onClick = { viewModel.submit(formData) })

// With strong skipping: compiler generates something like
Button(onClick = remember(formData) { { viewModel.submit(formData) } })
```

But here's the nuance — strong skipping doesn't eliminate the need for `@Immutable` and `@Stable`. Structural equality (`equals()`) is still better than instance equality (`===`) for data classes, because `===` only catches the exact same object reference.

> **🧠 Think about it:** If strong skipping uses `===` for unstable types, what happens when you create a new data class instance with the same values as the previous one? Would it skip or recompose?

#### What are the common performance mistakes with recomposition?

The ones I see most often:

- **Passing unstable types to composables** — Use `@Immutable` or `@Stable` on data classes and state holders. Don't pass raw `List` — use `ImmutableList` or a stable wrapper.
- **Reading state too high in the tree** — If only one child needs a state value, don't read it in the parent and pass it down. Let the child read it directly so recomposition stays scoped to the child.
- **Creating lambdas inline in frequently recomposing composables** — Use method references (`viewModel::onClick`) or hoist the lambda to a `remember` block. Strong skipping helps, but method references are still cleaner.
- **Using LazyColumn without stable keys** — Without keys, item reordering destroys and recreates item state. Always provide unique keys via `key = { item.id }`.
- **Reading state during composition when it's only needed for layout or drawing** — Use `Modifier.graphicsLayer { alpha = animatedAlpha.value }` instead of reading the animated value during composition. Lambda-based modifiers defer the state read to a later phase.

#### How does the Compose runtime handle recomposition scheduling?

The runtime doesn't recompose the instant a state changes. It invalidates the affected scope and schedules recomposition for the next frame using `Choreographer.postFrameCallback`. Multiple state changes within the same frame get batched into a single recomposition pass. It's like a waiter who collects the whole table's order before walking to the kitchen, instead of making a trip for each person.

The recomposition process runs on the main thread during the composition phase. The runtime walks the slot table, re-executes invalidated composables, and records differences. Then the layout phase measures and positions nodes, and finally the drawing phase renders pixels. These are Compose's three phases: Composition, Layout, and Drawing.

If state changes only affect the drawing phase — like a color or alpha change via `Modifier.graphicsLayer` — Compose can skip composition and layout entirely and just redraw. This is why reading state inside `graphicsLayer` or `drawBehind` lambdas is way more efficient for animations.

#### How do I use graphicsLayer for performance?

`Modifier.graphicsLayer` creates a separate render layer for the composable. Changes inside the lambda only trigger the draw phase — they skip composition and layout entirely. This makes it the go-to for animations.

```kotlin
val alpha by animateFloatAsState(targetValue = if (visible) 1f else 0f)

// Bad — reads alpha during composition, triggers full recomposition
Box(modifier = Modifier.alpha(alpha))

// Good — reads alpha only in draw phase, skips composition and layout
Box(modifier = Modifier.graphicsLayer { this.alpha = alpha })
```

The key difference is between the lambda version `Modifier.graphicsLayer { }` and the direct parameter version `Modifier.graphicsLayer(alpha = 0.5f)`. The lambda version defers the state read to the draw phase. The direct version reads during composition, which triggers recomposition when the value changes. Always use the lambda version when the value is animated or changes frequently.

#### What is the slot table and how does Compose use it?

The slot table is Compose's internal data structure — a flat array using a gap buffer design that stores the entire composable tree. During composition, every composable call writes its state, parameters, and child information into the slot table. The runtime walks this table during recomposition to compare old values with new ones and decide what to skip.

The gap buffer is clever — it allows efficient insertions and deletions at the current position without reallocating the entire array. When a composable is added or removed, the runtime moves the gap to that position and inserts or removes slots. The Applier then maps changes from the slot table to the actual UI tree (the `LayoutNode` tree for Compose UI).

#### How do I use the Compose compiler reports to diagnose stability issues?

The Compose compiler can generate stability reports showing exactly how each class is classified and which composables are restartable and skippable. Enable it in the build config:

```kotlin
// build.gradle.kts
composeCompiler {
    reportsDestination = layout.buildDirectory.dir("compose_reports")
    metricsDestination = layout.buildDirectory.dir("compose_metrics")
}
```

The report generates three files per module. The `*-classes.txt` file shows each class with its stability — `stable`, `unstable`, or `runtime` — and flags which fields are causing instability. The `*-composables.txt` shows each composable function with whether it's `restartable`, `skippable`, and which parameters are stable or unstable.

What you're hunting for are composables marked as `restartable` but not `skippable` — those are the ones recomposing even when their inputs haven't changed. Trace the unstable parameter back to the field causing it and fix it with `@Immutable`, `@Stable`, or by switching to immutable collections.

#### How do I debug recomposition issues in a running app?

Layout Inspector in Android Studio shows recomposition counts directly on the composable tree. Enable "Show Recomposition Counts" in the toolbar and interact with the app — composables that recompose frequently show high counts and get highlighted.

You can also add recomposition tracking in code during development:

```kotlin
@Composable
fun ProductCard(product: Product, onClick: () -> Unit) {
    SideEffect {
        Log.d("Recomposition", "ProductCard recomposed: ${product.id}")
    }
    // actual UI
}
```

`SideEffect` runs after every successful composition, so the log tells you exactly when and how often a composable recomposes. High recomposition counts in scrolling lists or animations are the first place to look for jank.

> **🧠 Think about it:** If your `LazyColumn` item composable is recomposing 50 times per scroll, what's the first thing you'd check — the item's parameter stability, the key function, or the state reads?

#### What is the stability configuration file?

The stability configuration file lets you declare classes as stable without modifying their source code. This is critical for external library classes — you can't add `@Stable` or `@Immutable` to classes you don't own, but you can list them in the config file.

Create a file like `compose_stability.conf`:

```
// Treat all classes in these packages as stable
java.time.*
kotlinx.datetime.*
com.google.android.gms.maps.model.LatLng
```

Then reference it in the build file:

```kotlin
composeCompiler {
    stabilityConfigurationFile =
        project.layout.projectDirectory.file("compose_stability.conf")
}
```

The compiler treats listed classes as stable during analysis, enabling skipping for composables that use them. Without this, any composable accepting a `LocalDateTime` parameter would always recompose because the compiler can't verify that `java.time` classes are truly immutable. The config file is especially valuable for apps using `java.time`, Google Maps models, or Protocol Buffer generated classes.

#### What is movableContentOf?

`movableContentOf` wraps a composable so it can move to a different position in the composition tree without losing its state. Normally, if a composable moves from one branch of an `if/else` to another, Compose treats it as a brand new composable — all `remember` state is lost and effects restart. It's like moving apartments and losing all your furniture in the process.

```kotlin
val content = remember {
    movableContentOf {
        ExpensiveChart(data = chartData)
    }
}

if (isFullScreen) {
    FullScreenContainer { content() }
} else {
    CompactContainer { content() }
}
```

Without `movableContentOf`, switching between full screen and compact would destroy the chart and recreate it from scratch. With it, the chart's state, animations, and internal remember values survive the move. This is useful for shared element transitions and adaptive layouts where content physically moves between containers.

#### How does derivedStateOf help reduce unnecessary recompositions?

`derivedStateOf` creates a state object that only updates when its computed result actually changes. If you have a state that changes frequently but only a derived value matters to the UI, `derivedStateOf` filters out the noise.

```kotlin
val searchQuery = mutableStateOf("")
val filteredItems = derivedStateOf {
    items.filter { it.name.contains(searchQuery.value, ignoreCase = true) }
}
```

Without `derivedStateOf`, any composable reading `searchQuery` would recompose on every single keystroke. With it, composables reading `filteredItems` only recompose when the filtered list actually changes. This is especially useful for search, filtering, and any case where the raw state changes way more often than the derived result.

### Common Follow-ups

- How does `LazyColumn` handle recomposition differently from `Column` with a `forEach`?
- Can you explain how the Snapshot system works and how it enables recomposition tracking?
- What is the role of the Applier in the Compose runtime?
- How would you optimize a composable that displays a large list of items with complex item layouts?
- What's the difference between `remember` and `rememberSaveable` in terms of recomposition?
- How does Compose Multiplatform handle recomposition — is the mechanism the same across platforms?
- What's the difference between `Modifier.graphicsLayer { }` (lambda version) and `Modifier.graphicsLayer(alpha = 0.5f)` (direct version) in terms of recomposition?
