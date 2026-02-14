---
title: "Recomposition, Stability & Performance"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 3
sequence: 34
description: "Recomposition is the core mechanism that makes Compose reactive."
---

## Recomposition, Stability & Performance

Recomposition is the core mechanism that makes Compose reactive. Understanding what triggers it, how the stability system decides what to skip, and how to diagnose performance problems separates candidates who use Compose from those who actually understand it.

### Core Questions (Beginner → Intermediate)

#### Q1: What is recomposition?

Recomposition is a phase in Jetpack Compose where the runtime re-executes composable functions when their input state changes so the UI can render the new state. Compose tracks which state values each composable reads, and when a state changes, only the composables that read that state are re-invoked. This is what makes Compose declarative — you describe the UI as a function of state, and the framework handles updating it.

#### Q2: What triggers recomposition?

Recomposition is triggered when a `State` object that a composable reads during composition changes its value. This includes `mutableStateOf`, `mutableStateListOf`, `mutableStateMapOf`, and any state derived from these like `derivedStateOf`. Reading the `.value` of a state object creates a subscription — the runtime knows exactly which composables to invalidate when that state changes.

If you change a regular variable (not wrapped in `State`), Compose has no way to know about it and won't recompose.

#### Q3: What is smart recomposition?

Smart recomposition means Compose doesn't blindly re-execute everything — it only recomposes the composables whose inputs have actually changed. If a parent composable recomposes but passes the same parameters to a child, the child can be skipped entirely. The runtime compares the new arguments with the previous ones and skips the function if they're all equal.

This is why parameter types matter. If all parameters are stable and haven't changed, Compose skips the function. If even one parameter is unstable, Compose can't guarantee equality and must recompose.

#### Q4: What is the stability system in Compose?

The Compose compiler analyzes every type used as a composable parameter and classifies it as either stable or unstable. A type is considered stable if:

- It's a primitive type (`Int`, `String`, `Float`, `Boolean`)
- It's a functional type (lambdas)
- It's annotated with `@Stable` or `@Immutable`
- It's a class where all public properties are `val` and are themselves stable types

Unstable types can't be reliably compared between recompositions, so Compose always recomposes when an unstable parameter is passed — even if the actual values haven't changed.

#### Q5: What is the difference between @Stable and @Immutable?

`@Immutable` tells the compiler that all public properties of this type will never change after construction. Once created, the object is frozen. `@Stable` is a weaker contract — it says the type's public properties might change, but when they do, Compose will be notified through the snapshot system (like `MutableState`).

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

Use `@Immutable` for data classes and model classes that don't change after creation. Use `@Stable` for state holders where properties can change but changes go through Compose's state system.

#### Q6: Why are collections like List<> considered unstable by default?

Kotlin's `List` interface doesn't guarantee immutability — a `MutableList` can be cast to `List`, so the compiler can't trust that the contents won't change. Even if you pass a `listOf(...)`, the declared type is still `kotlin.collections.List`, which the compiler marks as unstable.

The fix is to use Kotlinx Immutable Collections (`ImmutableList`, `PersistentList`) or wrap the list inside a state holder marked with `@Immutable` or `@Stable`:

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

The wrapper approach is often the simplest because you don't need an external dependency.

#### Q7: Why should you use `viewModel::onClick` instead of `{ viewModel.onClick() }` in composables?

When you write `{ viewModel.onClick() }`, a new lambda instance is created on every recomposition. The new instance is not equal to the previous one, so Compose treats the parameter as changed and recomposes the child composable.

Using a method reference like `viewModel::onClick` produces a stable reference that remains the same across recompositions. Compose sees the same function reference and can skip the child composable if nothing else changed. This matters most in lists or frequently recomposing UI where many lambda allocations add up.

#### Q8: What is positional memoization?

Positional memoization is how Compose identifies composable calls — by their position in the source code, not by any key or name. The compiler assigns a unique key to each call site based on its position in the code, and the runtime uses that key to match composable calls between compositions.

This is why calling composables inside `if/else` or loops needs care. If a composable moves to a different position in the call tree (like items reordering in a loop), Compose treats it as a new composable and throws away the old state. The `key()` composable exists to override positional identity when ordering can change.

#### Q9: What is donut-hole skipping?

Donut-hole skipping means Compose can skip recomposing a parent composable while still recomposing the content lambda inside it. The "donut" is the parent and the "hole" is the content.

```kotlin
@Composable
fun Card(content: @Composable () -> Unit) {
    Surface(modifier = Modifier.padding(16.dp)) {
        content() // This lambda can recompose independently
    }
}

@Composable
fun Screen() {
    val count by viewModel.count.collectAsStateWithLifecycle()
    Card {
        Text("Count: $count") // Only this recomposes when count changes
    }
}
```

`Card` itself doesn't recompose because its parameters haven't changed. But the content lambda captures `count`, so when `count` changes, only the lambda body re-executes. This is a natural result of how Compose tracks state reads — it scopes invalidation to the smallest composable that reads the changed state.

### Deep Dive Questions (Advanced → Expert)

#### Q10: What is the slot table and how does Compose use it internally?

The slot table is Compose's internal data structure — essentially a flat array (gap buffer) that stores the composable tree. During composition, every composable call writes its state, parameters, and child information into the slot table. The runtime walks this table during recomposition to compare old values with new ones and decide what to skip.

The gap buffer design is important — it allows efficient insertions and deletions at the current position without reallocating the entire array. When a composable is added or removed, the runtime moves the gap to that position and inserts or removes slots. The Applier then maps changes from the slot table to the actual UI tree (the `LayoutNode` tree for Compose UI).

#### Q11: How does Compose compare parameters to decide whether to skip recomposition?

For stable types, Compose uses `equals()` to compare old and new parameter values. If all parameters are stable and `equals()` returns true for all of them, the composable is skipped entirely.

For unstable types, Compose doesn't attempt comparison — it always recomposes. This is why marking your data classes with `@Immutable` matters. Without it, a data class that uses a `List` parameter is unstable, and every recomposition of the parent forces the child to recompose too, even if the actual data hasn't changed.

For lambda parameters, the comparison depends on whether the lambda captures any values. A non-capturing lambda is a singleton and always equal to itself. A capturing lambda is wrapped in a `remember` block by the compiler if strong skipping mode is enabled — otherwise each recomposition creates a new instance.

#### Q12: What is strong skipping mode and how does it change recomposition behavior?

Strong skipping mode is a compiler feature (enabled by default since Compose Compiler 2.0) that changes how Compose handles unstable parameters and lambdas. Without strong skipping, a composable with any unstable parameter is never skipped. With strong skipping, Compose uses instance equality (`===`) for unstable parameters instead of giving up entirely.

The other major change is lambda memoization. Without strong skipping, capturing lambdas create a new instance on every recomposition. With strong skipping, the compiler wraps them in `remember` automatically, so the lambda instance is reused as long as its captured values haven't changed.

```kotlin
// Without strong skipping: this lambda recreates every recomposition
Button(onClick = { viewModel.submit(formData) })

// With strong skipping: compiler generates something like
Button(onClick = remember(formData) { { viewModel.submit(formData) } })
```

Strong skipping makes most manual optimizations around lambda stability unnecessary. But it doesn't eliminate the need for `@Immutable` and `@Stable` — structural equality (`equals()`) is still better than instance equality (`===`) for data classes.

#### Q13: How do you use the Compose compiler reports to diagnose stability issues?

The Compose compiler can generate stability reports that show you exactly how each class is classified and which composables are restartable and skippable. You enable it in your build config:

```kotlin
// build.gradle.kts
composeCompiler {
    reportsDestination = layout.buildDirectory.dir("compose_reports")
    metricsDestination = layout.buildDirectory.dir("compose_metrics")
}
```

The report generates three files per module. The `*-classes.txt` file shows each class with its stability — `stable`, `unstable`, or `runtime` — and flags which fields are causing instability. The `*-composables.txt` shows each composable function with whether it's `restartable`, `skippable`, and which parameters are stable or unstable.

Look for composables marked as `restartable` but not `skippable` — those are the ones that recompose even when their inputs haven't changed. Trace the unstable parameter back to the field causing it and fix it with `@Immutable`, `@Stable`, or by switching to immutable collections.

#### Q14: How do you debug recomposition issues in a running app?

Layout Inspector in Android Studio shows recomposition counts directly on the composable tree. Enable "Show Recomposition Counts" in the Layout Inspector toolbar and interact with your app — composables that recompose frequently show high counts and are highlighted.

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

`SideEffect` runs after every successful composition, so the log tells you exactly when and how often a composable recomposes. For production performance monitoring, use the `Modifier.composed` or custom `CompositionLocal` to track recomposition without shipping debug logs. High recomposition counts in scrolling lists or animations are the first place to look for jank.

#### Q15: How does the Compose runtime handle recomposition scheduling?

The runtime doesn't recompose immediately when a state changes. It invalidates the affected scope and schedules recomposition for the next frame using `Choreographer.postFrameCallback`. Multiple state changes within the same frame are batched into a single recomposition pass.

The recomposition process runs on the main thread during the composition phase. The runtime walks the slot table, re-executes invalidated composables, and records the differences. Then the layout phase measures and positions nodes, and finally the drawing phase renders pixels. These are the three phases of Compose: Composition, Layout, and Drawing.

If state changes only affect the drawing phase (like a color or alpha change via `Modifier.graphicsLayer`), Compose can skip composition and layout entirely and just redraw. This is why reading state inside `graphicsLayer` or `drawBehind` lambdas is more efficient for animations — it avoids triggering the full composition pipeline.

#### Q16: What are the common performance mistakes with recomposition?

The most common ones:

- **Passing unstable types to composables** — Use `@Immutable` or `@Stable` annotations on your data classes and state holders. Don't pass raw `List` — use `ImmutableList` or a stable wrapper.
- **Reading state too high in the tree** — If only one child needs a state value, don't read it in the parent and pass it down. Let the child read it directly so recomposition is scoped to the child.
- **Creating lambdas inline in frequently recomposing composables** — Use method references (`viewModel::onClick`) or hoist the lambda to a `remember` block. Strong skipping mode helps here, but method references are still cleaner.
- **Using `LazyColumn` without stable keys** — Without keys, item reordering causes Compose to destroy and recreate item state. Always provide unique keys via `key = { item.id }`.
- **Reading state during composition when it's only needed for layout or drawing** — Use `Modifier.graphicsLayer { alpha = animatedAlpha.value }` instead of reading the animated value during composition. Lambda-based modifiers defer the state read to a later phase.

#### Q17: How does Compose handle interfaces for stability?

By default, the Compose compiler treats interfaces as unstable because it can't verify what the concrete implementation will be at runtime. Even if all implementations are immutable, the interface itself doesn't carry that guarantee.

Mark the interface with `@Immutable` to tell the compiler that all implementations of this interface will be immutable:

```kotlin
@Immutable
interface UiEvent

@Immutable
data class NavigateEvent(val route: String) : UiEvent

@Immutable
data class ShowSnackbar(val message: String) : UiEvent
```

Similarly, mark interfaces with `@Stable` when implementations will use Compose's state system for mutations. Without these annotations, any composable that takes an interface parameter will never be skipped.

#### Q18: What is movableContentOf and how does it relate to recomposition performance?

`movableContentOf` wraps a composable so its content can be moved to a different position in the composition tree without losing its state or triggering disposal and re-creation. Normally, if a composable moves from one branch of an `if/else` to another, Compose treats it as a new composable — all its `remember` state is lost and effects are restarted.

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

### Common Follow-ups

- How does `derivedStateOf` help reduce unnecessary recompositions?
- What's the difference between `Modifier.graphicsLayer { }` (lambda version) and `Modifier.graphicsLayer(alpha = 0.5f)` (direct version) in terms of recomposition?
- How does `LazyColumn` handle recomposition differently from `Column` with a `forEach`?
- Can you explain how `Snapshot` system works and how it enables recomposition tracking?
- What is the role of the Applier in the Compose runtime?
- How would you optimize a composable that displays a large list of items with complex item layouts?
- What's the difference between `remember` and `rememberSaveable` in terms of recomposition?
- How does Compose Multiplatform handle recomposition — is the mechanism the same across platforms?
