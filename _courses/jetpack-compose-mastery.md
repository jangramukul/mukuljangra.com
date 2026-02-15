---
title: "Jetpack Compose Mastery"
layout: course
description: "Build modern Android UIs from scratch — declarative thinking, state management, side effects, custom layouts, animations, performance, and testing."
icon: "🎨"
color: "#60a5fa"
difficulty: "Beginner to Expert"
modules: 12
lessons: 61
duration: "12 weeks"
order: 3
tags:
  - Jetpack Compose
  - UI
  - Android
what_you_learn:
  - "Think declaratively and build UIs with composable functions"
  - "Manage state with remember, State, and ViewModel integration"
  - "Handle side effects with LaunchedEffect, DisposableEffect, and rememberUpdatedState"
  - "Build custom layouts, modifiers, and advanced theming systems"
  - "Create smooth animations with animate*AsState, AnimatedVisibility, and transitions"
  - "Optimize Compose performance — recomposition, stability, and lazy layouts"
  - "Understand Compose internals — Snapshot system, slot table, compiler transforms"
  - "Master the rendering pipeline — composition, layout, drawing phases"
  - "Build custom graphics with Canvas, Path, Brush, and BlendMode"
  - "Test Compose UIs with ComposeTestRule and semantic matchers"
prerequisites:
  - "Kotlin fundamentals"
  - "Basic Android development"
  - "XML layouts experience (helpful, not required)"
---

## Module 1: Thinking in Compose

Compose isn't just a new UI toolkit — it's a fundamentally different mental model. Before writing any code, you need to shift from imperative to declarative thinking. This module lays the foundation for everything that follows.

### Lesson 1.1: Imperative vs Declarative UI

In the View system, you tell the framework **how** to update the UI step by step. You hold references to views, call setter methods, toggle visibility flags, and manually keep the screen in sync with your data. In Compose, you describe **what** the UI should look like for a given state, and the framework figures out how to get there. This inversion is what makes Compose fundamentally different — you stop managing view state and start describing it.

The imperative approach requires you to track every possible state transition manually. If a user object has 5 fields and each can change independently, you need 5 update paths. With 10 fields, you need 10. In Compose, you write one function that handles all of it. This distinction becomes exponentially more painful as your screen grows in complexity. Consider a screen with a loading state, an error state, an empty state, and a success state — each with different data fields. In the View system, you would need separate update methods for each transition, and you would need to ensure that every view is correctly reset when moving between states. You would toggle visibility on containers, clear text fields, reset adapters, and manually handle all edge cases. In Compose, you write a single `when` block that describes each state, and the framework handles every transition.

```kotlin
// Imperative (View system) — step by step mutations
fun updateUser(user: User) {
    nameTextView.text = user.name
    emailTextView.text = user.email
    avatarView.setImageUrl(user.avatarUrl)
    if (user.isPremium) {
        premiumBadge.visibility = View.VISIBLE
    } else {
        premiumBadge.visibility = View.GONE
    }
}

// Declarative (Compose) — describe the final state
@Composable
fun UserCard(user: User) {
    Row {
        Avatar(url = user.avatarUrl)
        Column {
            Text(user.name)
            Text(user.email)
            if (user.isPremium) {
                PremiumBadge()
            }
        }
    }
}
```

The difference becomes even clearer when you consider state transitions in the View system. Suppose you need to handle a loading → success → error flow. In the View system, each transition requires explicit cleanup of the previous state and setup of the new state. You need to track what's currently visible and carefully tear it down before building the new UI.

```kotlin
// Imperative — handling multiple states is error-prone
fun updateScreenState(state: ScreenState) {
    loadingView.visibility = View.GONE
    contentView.visibility = View.GONE
    errorView.visibility = View.GONE
    emptyView.visibility = View.GONE

    when (state) {
        is ScreenState.Loading -> {
            loadingView.visibility = View.VISIBLE
        }
        is ScreenState.Success -> {
            contentView.visibility = View.VISIBLE
            recyclerAdapter.submitList(state.items)
            titleTextView.text = state.title
        }
        is ScreenState.Error -> {
            errorView.visibility = View.VISIBLE
            errorMessageTextView.text = state.message
            retryButton.setOnClickListener { retry() }
        }
        is ScreenState.Empty -> {
            emptyView.visibility = View.VISIBLE
        }
    }
}

// Declarative — each state is self-contained
@Composable
fun Screen(state: ScreenState) {
    when (state) {
        is ScreenState.Loading -> LoadingSpinner()
        is ScreenState.Success -> {
            Column {
                Text(state.title)
                LazyColumn {
                    items(state.items) { ItemCard(it) }
                }
            }
        }
        is ScreenState.Error -> ErrorMessage(
            message = state.message,
            onRetry = { retry() }
        )
        is ScreenState.Empty -> EmptyState()
    }
}
```

**The key insight** — In Compose, `if (user.isPremium)` doesn't show/hide a badge. It controls whether the badge **exists** in the composition. When `isPremium` changes from true to false, the badge is removed from the tree entirely, not hidden. This is conditional composition, and it's fundamentally different from toggling `View.VISIBLE` and `View.GONE`. In the View system, a hidden view still occupies memory, still holds state, and still participates in layout traversals. In Compose, a composable that doesn't execute simply doesn't exist.

This distinction has profound implications for how you think about UI architecture. In the imperative world, you design your layout XML with all possible views pre-inflated, and your code selectively shows and hides them. In the declarative world, you describe what should exist right now, and composition handles the rest. This means your composable functions are pure descriptions of a UI snapshot at a given moment in time — there is no concept of "updating" or "modifying" the UI. You simply describe it again with the new state.

This shift also means you don't hold references to UI elements. There's no `findViewById`, no view binding, no synthetic accessors. The composable function IS the UI. When data changes, the function re-executes, and the framework diffs the output against the previous composition to determine the minimal set of actual UI updates.

The mental model shift can be summarized as: in imperative UI, you are a construction worker who places and moves bricks. In declarative UI, you are an architect who draws blueprints — someone else (the Compose runtime) handles the construction, renovation, and demolition. Your only responsibility is ensuring the blueprint accurately reflects the desired state.

```kotlin
// The declarative mental model extends to lists and dynamic content
@Composable
fun TagList(tags: List<String>, onRemove: (String) -> Unit) {
    // No adapter, no ViewHolder, no notifyDataSetChanged
    // Just describe what should be on screen right now
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        tags.forEach { tag ->
            FilterChip(
                selected = true,
                onClick = { onRemove(tag) },
                label = { Text(tag) },
                trailingIcon = {
                    Icon(Icons.Default.Close, contentDescription = "Remove $tag")
                }
            )
        }
    }
}
```

In production, the declarative model eliminates entire categories of bugs. You never have a stale view showing old data because you forgot to update it. You never have a visibility flag set incorrectly because of a missed code path. You never have a click listener attached to a recycled view from a previous item. The framework guarantees that the UI matches your description of the current state — always.

**Common Pitfalls:**

One common mistake when transitioning from imperative to declarative thinking is trying to "update" composables imperatively. Developers new to Compose often try to hold references to composables or call methods on them. This doesn't work — composables are functions, not objects. Another pitfall is thinking about visibility. There is no `visible` or `gone` concept in Compose. If you don't want something on screen, simply don't call the composable. Wrapping a composable in an `if` statement is the correct approach, and it is fundamentally different from hiding a view.

**Key takeaway:** Compose functions describe UI as a function of state. When state changes, the function re-executes (recomposes), and Compose updates only what changed.

### Lesson 1.2: Composable Functions and the Compiler

A `@Composable` function looks like a regular Kotlin function, but the `@Composable` annotation fundamentally changes what the compiler does with it. The Compose compiler plugin transforms every composable function by injecting a `Composer` parameter — an object that manages the composition's internal state. This transformation means composable functions can only be called from other composable functions, because only composable contexts have a `Composer` to pass down. The `@Composable` annotation is not merely a marker — it changes the function's calling convention at the bytecode level.

The Compose compiler plugin runs as a Kotlin compiler plugin during the IR (Intermediate Representation) phase of compilation. It scans for functions annotated with `@Composable` and transforms them by adding synthetic parameters. This is why you cannot call a composable function from a regular function — the regular function doesn't have the synthetic `Composer` parameter to pass. The compiler enforces this at compile time, preventing accidental misuse.

```kotlin
@Composable
fun Greeting(name: String) {
    Text(text = "Hello, $name!")
}

// What the compiler actually generates (simplified):
fun Greeting(name: String, $composer: Composer, $changed: Int) {
    $composer.startRestartGroup(...)
    if ($changed and 0b0001 != 0 || !$composer.skipping) {
        Text("Hello, $name!", $composer, ...)
    } else {
        $composer.skipToGroupEnd()
    }
    $composer.endRestartGroup()?.updateScope { ... }
}
```

The compiler also injects a `$changed` bitmask parameter that tracks which parameters have changed since the last composition. Each parameter gets a few bits in this mask — enough to represent "unchanged," "changed," "uncertain," and "static." When the runtime calls a composable, it checks these bits before executing the body. If all parameters are unchanged and stable, the entire function body is skipped. This is the mechanism behind intelligent recomposition — it's not runtime magic, it's compiler-generated code.

To understand the bitmask in detail, each parameter is allocated 2-3 bits in the `$changed` integer. The possible states for each parameter slot are: `Same` (0b00 — the parameter has not changed), `Different` (0b01 — the parameter has changed), `Uncertain` (0b10 — the runtime doesn't know yet and needs to check), and `Static` (0b11 — the parameter is a compile-time constant that never changes). When a composable is called, the caller sets these bits based on what it knows. If a literal string `"Hello"` is passed, the compiler marks it as `Static`. If a variable is passed, the compiler marks it as `Uncertain` and the runtime resolves it by comparing with the previous value using `equals()` for stable types.

```kotlin
// Multiple parameters get different bits in the bitmask
@Composable
fun UserInfo(name: String, age: Int, isOnline: Boolean) {
    // Compiler generates: UserInfo(name, age, isOnline, $composer, $changed)
    // $changed has bits for each parameter:
    // bits 0-1: name status
    // bits 2-3: age status
    // bits 4-5: isOnline status
    Text("$name, $age years old")
    if (isOnline) StatusDot()
}

// When called with a constant and variables:
UserInfo(
    name = "Mukul",     // Static — compiler knows this never changes
    age = currentAge,   // Uncertain — runtime must compare
    isOnline = true     // Static — compiler knows this never changes
)
```

The `startRestartGroup` and `endRestartGroup` calls create a **restart scope** — a boundary that the recomposer can re-invoke independently when the composable's dependencies change. The `updateScope` lambda at the end captures the composable's parameters so it can be called again later without re-running the parent. This is how Compose achieves granular recomposition — each restartable composable is independently re-executable. The key ID passed to `startRestartGroup` is a compiler-generated integer unique to each call site in the source code, used by the slot table to identify groups.

Not all composable functions get restart scopes. The compiler applies an optimization: **inline composable functions** don't get their own restart scopes because their bodies are inlined into the caller. Composable functions that **return a value** (like `remember`) also don't get restart scopes because they can't be re-invoked independently — their return value feeds into the caller's logic. Only composable functions that return `Unit` and are not inline are typically restartable.

```kotlin
// Restartable — returns Unit, not inline
@Composable
fun StatusBadge(isActive: Boolean) {
    // Gets its own restart scope
    Box(modifier = Modifier
        .size(12.dp)
        .background(if (isActive) Color.Green else Color.Gray, CircleShape)
    )
}

// NOT restartable — returns a value
@Composable
fun rememberFormatter(pattern: String): DateFormat {
    // No restart scope — return value is used by caller
    return remember(pattern) { SimpleDateFormat(pattern, Locale.getDefault()) }
}

// NOT restartable — inline
@Composable
inline fun ConditionalWrapper(
    condition: Boolean,
    wrapper: @Composable (content: @Composable () -> Unit) -> Unit,
    content: @Composable () -> Unit
) {
    if (condition) wrapper(content) else content()
}
```

Composable functions have important constraints. They should be **idempotent** — calling them with the same parameters should produce the same UI output. They should be **free of side effects** — no network calls, database writes, or analytics events directly in the composition body. And they should be **fast** — composition happens on the UI thread, and slow composables cause dropped frames. These constraints arise directly from how the compiler transforms the code: if a composable has side effects, those effects might execute unpredictably because the runtime can skip, reorder, or re-run composables.

The compiler also generates **group markers** that are stored in the slot table. Every composable call, every `remember`, every conditional branch, and every loop iteration gets a group. Groups define the tree structure in the flat slot table. When the runtime encounters a group during recomposition, it compares the group key against the slot table to determine if the composable at that position is the same as before. If the keys match, it proceeds with comparing parameters. If they don't match, it knows the composition structure has changed and needs to handle insertions or deletions.

```kotlin
// The compiler generates groups for control flow
@Composable
fun ConditionalContent(showExtra: Boolean) {
    // Group 1: Text
    Text("Always shown")

    // Group 2: conditional group
    if (showExtra) {
        // Group 3: Text (inside conditional)
        Text("Extra content")
        // Group 4: Icon (inside conditional)
        Icon(Icons.Default.Star, contentDescription = null)
    }

    // Group 5: Button (position depends on whether showExtra is true)
    Button(onClick = {}) { Text("Action") }
}
```

**Common Pitfalls:**

A common mistake is calling composable functions inside non-composable contexts — like inside a `forEach` lambda on a regular collection, or inside a coroutine body. The compiler will catch most of these, but some patterns can confuse developers. Another pitfall is assuming that composable functions execute top-to-bottom in a predictable single pass. During recomposition, the runtime may skip portions of the tree, and the order of execution within a composable is an implementation detail, not a guarantee.

**Key takeaway:** `@Composable` functions are transformed by the compiler into restartable, skippable units. The `Composer` parameter, `$changed` bitmask, and restart scopes are the machinery that makes intelligent recomposition possible.

### Lesson 1.3: Recomposition — When and How

Recomposition is the process of re-executing composable functions when state changes. Understanding exactly when it happens, what scope it covers, and what guarantees it does and doesn't provide is essential for writing correct and performant Compose code. Recomposition is the core mechanism that keeps your UI synchronized with your data — it is the beating heart of the Compose runtime.

Compose tracks which composable functions read which state objects through the snapshot system. When a `MutableState` value changes, Compose doesn't recompose the entire tree — it identifies the specific restart scopes that read that state and schedules only those for re-execution. This is **intelligent recomposition**. The tracking happens automatically through the snapshot system's read observers — when your composable body reads `counter.value`, the snapshot system records that the current restart scope depends on that state object. Later, when `counter.value` changes, the system looks up all dependent scopes and marks them as invalid.

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }

    Column {
        Text("Count: $count")  // Recomposes when count changes
        Button(onClick = { count++ }) {
            Text("Increment")  // Does NOT recompose (no state dependency)
        }
    }
}
```

When `count` changes, Compose doesn't re-run the entire `Counter` function from scratch. It re-runs the `Counter` restart scope, but the `Button`'s content lambda — `Text("Increment")` — has no dependency on `count`, so it gets skipped. The `Text("Count: $count")` reads `count`, so it recomposes. The precision of this tracking is what makes Compose performant by default.

The recomposition scope is determined by the nearest enclosing restartable composable. The runtime does not recompose individual expressions or lines — it recomposes entire restart scopes. This means if you read state in a large composable, the entire composable body re-executes. This is why extracting composables into smaller functions is a performance technique — it creates smaller, more targeted recomposition boundaries.

```kotlin
// Large composable — entire body recomposes when ANY state changes
@Composable
fun DashboardScreen() {
    val userName by viewModel.userName.collectAsStateWithLifecycle()
    val notificationCount by viewModel.notifications.collectAsStateWithLifecycle()
    val isOnline by viewModel.onlineStatus.collectAsStateWithLifecycle()

    Column {
        // When userName changes, ALL of these re-execute
        Text("Hello, $userName")
        Text("$notificationCount notifications")
        StatusDot(isOnline)
        // ... 20 more composables
    }
}

// Better — extracted composables create isolated recomposition scopes
@Composable
fun DashboardScreen() {
    Column {
        UserGreeting()       // Only recomposes when userName changes
        NotificationBadge()  // Only recomposes when count changes
        OnlineStatus()       // Only recomposes when status changes
    }
}
```

However, recomposition comes with important guarantees and non-guarantees. Compose guarantees that the UI will eventually reflect the current state. It does **not** guarantee that recomposition happens immediately, that it happens exactly once per state change, or that composables recompose in any particular order. Multiple state changes between frames are batched into a single recomposition. The runtime may skip recomposition entirely if a composable's parameters haven't changed. And recomposition can be abandoned mid-execution if newer state arrives.

The "abandoned recomposition" behavior deserves special attention. If the runtime is partway through recomposing a tree and a new state change arrives that invalidates the current work, Compose can throw away the in-progress recomposition and start over with the latest state. This ensures the UI always reflects the most recent state, but it also means any side effects that ran during the abandoned recomposition are lost. This is the fundamental reason why side effects must be managed through effect handlers, not placed directly in the composition body.

```kotlin
// Demonstrating non-guarantee: recomposition count
@Composable
fun RecompositionDemo() {
    var count by remember { mutableStateOf(0) }
    var recompCount by remember { mutableIntStateOf(0) }

    // ❌ This DOES NOT accurately track recompositions
    // because recomposition itself can be skipped, batched, or abandoned
    recompCount++

    Column {
        Text("Count: $count")
        Text("Recompositions: $recompCount") // Unreliable number
        Button(onClick = { count++ }) { Text("Increment") }
    }
}

// If you need to track recompositions for debugging, use SideEffect
@Composable
fun DebugRecomposition(tag: String) {
    SideEffect {
        Log.d("Recomposition", "$tag recomposed")
    }
}
```

This has practical implications. Never put side effects directly in the composition body — they might run zero times (if skipped), once, twice, or any number of times depending on recomposition behavior. Never rely on the order of composable execution for correctness. And never assume a composable runs on every frame — it only runs when its dependencies change.

Recomposition order is also non-deterministic. The runtime processes invalidated scopes in an order that it determines is most efficient, not necessarily top-to-bottom or parent-before-child. In practice, the runtime tends to process parent scopes before child scopes, but this is an implementation detail, not a contract. Your composable logic must be correct regardless of the order in which sibling composables recompose.

```kotlin
@Composable
fun BadExample() {
    var count by remember { mutableStateOf(0) }

    // ❌ Side effect in composition — runs unpredictably
    println("Recomposition #$count")
    analytics.logScreenView("counter_screen")

    // ✅ Side effect in a proper effect handler
    LaunchedEffect(Unit) {
        analytics.logScreenView("counter_screen")
    }

    Text("Count: $count")
}
```

Another important concept is **recomposition skipping**. When a parent recomposes, it calls its child composables with potentially the same parameters. If the child composable is skippable (all parameters are stable) and the parameters haven't changed (structural equality), the child's body is skipped entirely — it doesn't execute at all. This is the most important performance optimization in Compose, and it happens automatically for well-structured code with stable types.

```kotlin
// Skipping in action
@Composable
fun ParentWithTwoChildren() {
    var activeTab by remember { mutableStateOf(0) }

    Column {
        // TabBar reads activeTab — recomposes when tab changes
        TabBar(activeTab = activeTab, onTabSelected = { activeTab = it })

        // ContentArea does NOT read activeTab — skipped on tab change
        // (assuming its parameters are stable and unchanged)
        ContentArea(items = stableItemList)
    }
}

@Composable
fun ContentArea(items: ImmutableList<Item>) {
    // This entire function is SKIPPED when parent recomposes
    // because ImmutableList is stable and the reference hasn't changed
    LazyColumn {
        items(items, key = { it.id }) { item ->
            ItemCard(item)
        }
    }
}
```

In production, understanding recomposition behavior is critical for debugging performance issues. The Layout Inspector in Android Studio shows recomposition counts for each composable. A composable with a high recomposition count and zero skip count is a red flag — it means the composable is being re-executed on every parent recomposition and can never be skipped. This typically indicates unstable parameters.

**Common Pitfalls:**

The most common recomposition pitfall is reading state in a scope that's too wide. If you read a rapidly-changing state (like scroll position) at the top of a large composable, the entire tree below that point recomposes on every frame. The fix is to either extract the state-reading portion into a smaller composable or defer the read to a later phase using lambda-based modifiers. Another pitfall is creating new object instances during composition that get passed to child composables — this defeats skipping because the child sees a "new" parameter every time, even if the data is identical.

**Key takeaway:** Recomposition can happen at any time, in any order, and can be skipped. Never put side effects directly in composable functions — that code might run more often or less often than you expect.

### Lesson 1.4: Composition, Layout, Drawing — The Three Phases

Compose renders UI in three sequential phases, and understanding them is the single most important performance concept in the entire framework. Each phase does fundamentally different work, reads different state, and has different performance characteristics. When a frame drops, most developers blame recomposition, but layout and drawing phase issues are equally common. Mastering the three phases is what separates developers who write smooth UIs from those who fight jank.

**Composition** is where your `@Composable` functions execute. It builds and updates the UI tree by evaluating conditionals, loops, and `remember` calls. The output is a set of layout nodes stored in the slot table. **Layout** measures and positions each node — this is where `Modifier.size()`, `Modifier.padding()`, and constraint propagation happen. Each child is measured exactly once (a critical guarantee that prevents O(n²) measurement cascades). **Drawing** paints pixels to a Canvas — `Modifier.background()`, `drawBehind`, `graphicsLayer`, and `Canvas` composable execute here.

The three phases execute in order: Composition → Layout → Drawing. But the critical optimization is that **not all phases need to run on every frame**. If a state change only affects how something is drawn (like its alpha or color), Compose can skip Composition and Layout entirely and only run the Drawing phase. If state only affects position, Compose can skip Composition. This is the performance lever that makes or breaks scroll performance.

```kotlin
// Phase awareness — which phase reads the state determines cost
@Composable
fun PhaseDemo(scrollOffset: Float) {
    // Reading in COMPOSITION phase (most expensive)
    // All 3 phases run: Composition → Layout → Drawing
    val alpha = (1f - scrollOffset / 500f).coerceIn(0f, 1f)
    Box(modifier = Modifier.alpha(alpha)) {
        Text("Content")
    }
}

@Composable
fun PhaseDemoOptimized(scrollOffset: () -> Float) {
    // Reading in LAYOUT phase (medium cost)
    // 2 phases run: Layout → Drawing (Composition skipped)
    Box(modifier = Modifier.offset {
        IntOffset(0, (scrollOffset() * 0.5f).toInt())
    }) {
        Text("Content")
    }
}

@Composable
fun PhaseDemoBest(scrollOffset: () -> Float) {
    // Reading in DRAWING phase (cheapest)
    // 1 phase runs: Drawing only (Composition + Layout skipped)
    Box(modifier = Modifier.graphicsLayer {
        alpha = (1f - scrollOffset() / 500f).coerceIn(0f, 1f)
        translationY = scrollOffset() * 0.5f
    }) {
        Text("Content")
    }
}
```

The key insight is that **each phase can be triggered independently**. If a state change is only read during the Drawing phase, Compose skips Composition and Layout entirely. If state is only read during Layout, Composition is skipped. The way you structure your state reads determines which phases execute on each frame.

To understand why this matters so much, consider what each phase costs. Composition is the most expensive because it executes Kotlin code, allocates objects, traverses the slot table, and potentially triggers child composables to re-execute. Layout is medium cost — it propagates constraints through the tree and positions nodes. Drawing is cheapest — it issues GPU draw commands through RenderNodes. During a 60fps scroll, you have 16.67ms per frame. If you can skip Composition and Layout, you might use only 2-3ms for Drawing instead of 10-12ms for all three phases.

```kotlin
@Composable
fun AnimatedCard(scrollOffset: Float) {
    // ❌ Bad — reads scrollOffset during Composition, triggers all 3 phases
    val alpha = (1f - scrollOffset / 500f).coerceIn(0f, 1f)
    Card(modifier = Modifier.alpha(alpha)) {
        Text("Content")
    }
}

@Composable
fun AnimatedCardOptimized(scrollOffset: () -> Float) {
    // ✅ Good — lambda defers reading to Drawing phase, skips Composition + Layout
    Card(
        modifier = Modifier.graphicsLayer {
            alpha = (1f - scrollOffset() / 500f).coerceIn(0f, 1f)
        }
    ) {
        Text("Content")
    }
}
```

The difference between passing `Float` and `() -> Float` is the difference between triggering all three phases on every scroll pixel versus triggering only the Drawing phase. In a list with 20 visible cards, that's the difference between smooth scrolling and visible jank. The `graphicsLayer` modifier reads state in the draw phase because it operates at the RenderNode level — it doesn't need to re-measure or re-position anything, just repaint with new parameters.

Understanding which modifiers read in which phase is essential. Here's the breakdown: `Modifier.padding()`, `Modifier.size()`, `Modifier.fillMaxWidth()`, and `Modifier.offset(x, y)` (value-based) read during **Layout**. `Modifier.background()`, `Modifier.border()`, `Modifier.drawBehind {}`, and `Modifier.drawWithContent {}` read during **Drawing**. `Modifier.graphicsLayer {}`, `Modifier.alpha {}`, and `Modifier.offset {}` (lambda-based) also read during **Drawing**. Conditional composition (`if/else`, `when`), `remember`, and direct parameter reads happen during **Composition**.

```kotlin
// Practical example: collapsing toolbar
@Composable
fun CollapsingToolbar(
    title: String,
    scrollState: LazyListState
) {
    // ❌ BAD: reads scroll state in Composition — all 3 phases on every scroll
    val toolbarHeight = (200 - scrollState.firstVisibleItemScrollOffset)
        .coerceAtLeast(56)
    val titleAlpha = ((toolbarHeight - 56f) / 144f).coerceIn(0f, 1f)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(toolbarHeight.dp)
            .background(MaterialTheme.colorScheme.primary)
    ) {
        Text(title, modifier = Modifier.alpha(titleAlpha))
    }
}

@Composable
fun CollapsingToolbarOptimized(
    title: String,
    scrollState: LazyListState
) {
    // ✅ GOOD: fixed size, visual changes in graphicsLayer (Drawing phase)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .graphicsLayer {
                val scrollOffset = scrollState.firstVisibleItemScrollOffset.toFloat()
                val maxScroll = 144f
                val progress = (scrollOffset / maxScroll).coerceIn(0f, 1f)
                alpha = 1f - progress * 0.3f
                scaleY = 1f - progress * 0.5f
                translationY = -scrollOffset * 0.5f
            }
            .background(MaterialTheme.colorScheme.primary)
    ) {
        Text(title)
    }
}
```

In the optimized version, the toolbar has a fixed size (no Layout recalculation needed), and visual changes happen entirely in `graphicsLayer` (Drawing phase only). The scroll-dependent calculations for alpha, scale, and translation all happen in the draw lambda, so Compose skips Composition and Layout entirely on each scroll frame. This pattern is the foundation of performant scroll-linked animations in Compose.

**Common Pitfalls:**

The most common mistake is using value-based modifiers instead of lambda-based modifiers for animated or scroll-linked values. `Modifier.offset(x = offsetDp, y = 0.dp)` reads during Composition/Layout, while `Modifier.offset { IntOffset(offsetPx, 0) }` reads during Layout only. `Modifier.alpha(alphaFloat)` reads during Composition, while `Modifier.graphicsLayer { alpha = alphaFloat }` reads during Drawing. Another pitfall is not realizing that `Modifier.background()` with a computed color reads during Composition (the color is computed in composition), even though the background itself draws in the Drawing phase. To defer the color computation, use `Modifier.drawBehind { drawRect(computeColor()) }`.

**Key takeaway:** Push state reads to the latest possible phase. Reading state in Drawing is cheaper than Layout, which is cheaper than Composition. Use lambda-based modifiers (`graphicsLayer {}`, `offset {}`, `drawBehind {}`) to defer reads.

### Lesson 1.5: The Slot Table — Where Composition Lives

The slot table is Compose's internal data structure that stores everything about a composition — the UI tree, remembered values, state objects, group markers, and metadata for diffing. Understanding the slot table explains why `remember` is positional, why `key` matters, and why composable call order can't change between recompositions. The slot table is the physical manifestation of your composition — it is where your entire UI state lives in memory.

Compose doesn't build a traditional tree of objects like the View system's `ViewGroup` hierarchy. Instead, it uses a flat array where composable calls are stored linearly as they execute, with group markers defining the tree structure. This linear layout means Compose can walk the table sequentially during recomposition, comparing new outputs against the previous frame using **gap buffers** — a technique borrowed from text editors.

A gap buffer is a contiguous array with a movable "gap" (unused space) that allows O(1) insertions and deletions at any position. When you add a composable to the tree (new conditional branch becomes true), the gap moves to that position and the new entries are inserted. When a composable is removed, its entries are deleted and the gap absorbs the space. This fits compositions well because they're predominantly linear — you walk the composable tree top to bottom, left to right. Gap buffers are the same data structure used by Emacs and many other text editors for efficient insertion — the "cursor position" in the gap buffer corresponds to the current position in the composition traversal.

The slot table stores several types of entries. **Group entries** define the tree structure — each composable call creates a group with a key, and groups can be nested. **Data entries** store values — `remember` values, state objects, and composable parameters are stored as data within their enclosing group. **Node entries** represent actual layout nodes that will participate in measurement and drawing. Understanding this structure explains many Compose behaviors.

```kotlin
@Composable
fun SlotTableDemo() {
    // Slot position 0: remember group for 'count'
    var count by remember { mutableStateOf(0) }

    // Slot position 1: Column group
    Column {
        // Slot position 2: Text group — "Count: $count"
        Text("Count: $count")

        // Slot position 3: conditional group
        if (count > 5) {
            // Slot position 4: Text group — "High count!"
            Text("High count!")
        }

        // Slot position 5 (or 4 if condition is false): Button group
        Button(onClick = { count++ }) {
            Text("Increment")
        }
    }
}
```

When `count` goes from 5 to 6, the conditional becomes true and `Text("High count!")` needs to be inserted. The gap buffer moves to position 4, the new group entries are inserted, and the Button group shifts to position 5. When `count` goes from 6 back to 5, the Text group at position 4 is removed and the gap absorbs it. This insertion and deletion is efficient because the gap is already near the modification point.

To visualize the slot table more concretely, think of it as a serialized representation of your composition tree:

```kotlin
// Conceptual slot table contents for SlotTableDemo when count = 7:
// [GROUP: remember] [DATA: MutableState(7)]
// [GROUP: Column]
//   [GROUP: Text] [DATA: "Count: 7"]
//   [GROUP: if(true)]
//     [GROUP: Text] [DATA: "High count!"]
//   [GROUP: Button]
//     [GROUP: Text] [DATA: "Increment"]

// When count changes from 7 to 4:
// [GROUP: remember] [DATA: MutableState(4)]
// [GROUP: Column]
//   [GROUP: Text] [DATA: "Count: 4"]
//   [GROUP: if(false)]
//     ← gap absorbs the removed Text group →
//   [GROUP: Button]
//     [GROUP: Text] [DATA: "Increment"]
```

The practical implication is that `remember` is **positional**. Two `remember` calls in the same composable occupy different slots, and moving a `remember` call changes which slot it reads from. This is also why you can't call composable functions conditionally without `key` — if the condition changes, slot positions shift and Compose reads the wrong cached values.

Consider this dangerous pattern:

```kotlin
@Composable
fun BrokenPositionalIdentity(showGreeting: Boolean) {
    // ❌ DANGEROUS: remember positions shift when showGreeting changes
    if (showGreeting) {
        val greeting = remember { mutableStateOf("Hello") }  // Slot 0 when true
        Text(greeting.value)
    }
    val counter = remember { mutableStateOf(0) }  // Slot 1 when true, Slot 0 when false
    Text("Counter: ${counter.value}")
    // When showGreeting changes from true to false, the counter's remember
    // might read from the slot that previously held the greeting!
}

// ✅ SAFE: key() provides stable identity regardless of position
@Composable
fun SafePositionalIdentity(showGreeting: Boolean) {
    if (showGreeting) {
        key("greeting") {
            val greeting = remember { mutableStateOf("Hello") }
            Text(greeting.value)
        }
    }
    key("counter") {
        val counter = remember { mutableStateOf(0) }
        Text("Counter: ${counter.value}")
    }
}
```

The `key` composable provides an explicit identity to a group in the slot table, independent of its position. When the runtime encounters a `key` group during recomposition, it matches by the key value rather than by position. This means groups can move, appear, or disappear without corrupting the identity of neighboring groups.

This positional identity system is also why `LazyColumn` requires `key` for items. Without explicit keys, items use their position (index) as identity. When items are reordered, the state stored in slot position 3 stays at position 3 — but the data at position 3 might now be a different item. With `key = { it.id }`, each item's slot table entries are tracked by its unique ID, so reordering preserves state correctly.

```kotlin
// Without key: state follows position, not identity
LazyColumn {
    items(sortedItems) { item ->
        // If items are reordered, expanded state stays at the position
        // not with the item — item 3's state shows on the new item 3
        var expanded by remember { mutableStateOf(false) }
        ItemCard(item, expanded, onExpand = { expanded = !expanded })
    }
}

// With key: state follows identity
LazyColumn {
    items(sortedItems, key = { it.id }) { item ->
        // Expanded state follows the item even after reordering
        var expanded by remember { mutableStateOf(false) }
        ItemCard(item, expanded, onExpand = { expanded = !expanded })
    }
}
```

The slot table also has performance implications for composition size. Every `remember`, every conditional branch, every `key`, and every composable call adds entries to the slot table. For screens with very deep composable hierarchies or many remembered values, the slot table itself can become a memory concern. In practice, this is rarely an issue for normal screens, but it's worth knowing when building extremely large or complex compositions like spreadsheets or code editors.

**Common Pitfalls:**

The most common pitfall is changing the number or order of composable calls between recompositions without using `key`. If you conditionally call a composable before other composables, the positions of everything after it shift. The compiler handles many cases with implicit groups for conditionals, but complex control flow can still cause identity mismatches. Another pitfall is using non-unique keys — duplicate keys in a `LazyColumn` cause undefined behavior because the runtime can't distinguish between items.

**Key takeaway:** The slot table stores composition state in a flat, gap-buffered array. `remember` is positional, composable identity is order-dependent, and `key` helps Compose match entries correctly across recompositions.

### Lesson 1.6: Restartable vs Skippable — What the Compiler Decides

The Compose compiler analyzes every `@Composable` function and classifies it along two dimensions: **restartable** and **skippable**. Understanding these classifications explains why some composables recompose unnecessarily and others don't. These compiler decisions are the foundation of Compose performance — they determine whether your composable participates in intelligent recomposition or always re-executes.

A composable is **restartable** if the compiler can generate a restart scope for it — meaning it can be re-invoked independently when its dependencies change. Most composables are restartable. Inline composables and composables that return values are not restartable because they don't have independent restart scopes. Restartability is about whether the runtime can selectively re-execute this particular composable without re-executing its parent. If a composable is not restartable, changes to its state dependencies require the parent to recompose.

A composable is **skippable** if the compiler can generate comparison code to check whether all parameters have changed. A composable is skippable only when **all** its parameters are stable types. If even one parameter is unstable, the composable becomes non-skippable — it recomposes every time its parent recomposes, regardless of whether its data actually changed. Skippability is the key to efficient recomposition in large trees — without it, every parent recomposition cascades to all children.

```kotlin
// Restartable AND skippable — all params are stable
@Composable
fun UserBadge(name: String, isOnline: Boolean) { // String, Boolean = stable
    Row {
        Text(name)
        if (isOnline) StatusDot()
    }
}

// Restartable but NOT skippable — List is unstable
@Composable
fun TagList(tags: List<String>) { // List = unstable
    Column {
        tags.forEach { tag -> Text(tag) }
    }
}

// Fix: use ImmutableList
@Composable
fun TagList(tags: ImmutableList<String>) { // ImmutableList = stable
    Column {
        tags.forEach { tag -> Text(tag) }
    }
}
```

The stability rules are precise. A type is considered **stable** if: (1) it is a primitive type (`Int`, `Float`, `Boolean`, etc.), (2) it is `String`, (3) it is a function type (lambdas), (4) it is annotated with `@Stable` or `@Immutable`, (5) it is an enum type, (6) it is a data class where all properties are stable types, or (7) it is `MutableState<T>` (the state holder itself is stable — changes are tracked through the snapshot system). Everything else is unstable by default, including `List`, `Map`, `Set`, and classes from external modules that the Compose compiler can't analyze.

```kotlin
// Stability examples
@Composable
fun StabilityDemo(
    name: String,             // ✅ Stable — primitive wrapper
    count: Int,               // ✅ Stable — primitive
    isEnabled: Boolean,       // ✅ Stable — primitive
    onClick: () -> Unit,      // ✅ Stable — function type
    items: List<String>,      // ❌ Unstable — List interface
    metadata: Map<String, Any>, // ❌ Unstable — Map interface
    config: ThirdPartyConfig, // ❌ Unstable — external module class
    state: MutableState<Int>, // ✅ Stable — MutableState
) {
    // This composable is NOT skippable because of items, metadata, and config
}

// Fix with annotations
@Immutable
data class StableProduct(
    val id: String,
    val name: String,
    val price: Double,
    val imageUrl: String
)

@Composable
fun ProductCard(product: StableProduct) { // ✅ All stable — skippable
    Card {
        Column {
            Text(product.name)
            Text("$${product.price}")
        }
    }
}
```

The distinction between `@Immutable` and `@Stable` is important. `@Immutable` is a strong contract: you promise the compiler that once an instance is created, none of its public properties will ever change. This is appropriate for data classes, value objects, and truly immutable types. `@Stable` is a weaker contract: you promise that mutations will be observable through the Compose snapshot system. This is appropriate for classes with `mutableStateOf` properties — the properties can change, but Compose will know about it.

```kotlin
// @Immutable — nothing changes after construction
@Immutable
data class ArticleUiModel(
    val id: String,
    val title: String,
    val summary: String,
    val imageUrl: String,
    val publishedAt: Long
)

// @Stable — properties can change, but changes are observable
@Stable
class FormFieldState(initialValue: String = "") {
    var text by mutableStateOf(initialValue)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun updateText(newText: String) {
        text = newText
        error = validate(newText)
    }

    private fun validate(text: String): String? {
        return if (text.isBlank()) "Required" else null
    }
}
```

You can check which composables are skippable using the Compose compiler reports. Add `-P plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=/path/to/reports` to your Kotlin compiler arguments. The generated report shows every composable with its restartable/skippable status and lists which parameters are stable or unstable. This is the fastest way to find performance issues — a composable that shows "restartable but not skippable" is one that recomposes unnecessarily.

```kotlin
// Example compiler report output:
// restartable skippable scheme("[androidx.compose.ui.UiComposable]")
// fun UserBadge(name: String, isOnline: Boolean)
//   stable name: String
//   stable isOnline: Boolean

// restartable scheme("[androidx.compose.ui.UiComposable]")
// fun TagList(tags: List<String>)
//   unstable tags: List<String>  ← This is the problem

// To enable reports in build.gradle.kts:
// kotlinOptions {
//     freeCompilerArgs += listOf(
//         "-P", "plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=" +
//             "${project.buildDir.absolutePath}/compose_metrics"
//     )
// }
```

In a real production codebase, auditing the compiler reports is one of the highest-impact performance activities you can do. A common pattern is that a ViewModel exposes a `StateFlow<UiState>` with a data class containing a `List<Item>`. Since `List` is unstable, the entire screen composable becomes non-skippable. Every unrelated state change causes the entire screen to recompose. The fix is straightforward: use `ImmutableList` from `kotlinx-collections-immutable`, or wrap the list in an `@Immutable` data class, or use `@Stable` annotation on the UiState class itself.

The performance implications are significant. In a `LazyColumn` with 100 items, each item card that is non-skippable will recompose every time ANY state in the parent changes — even if the item's data hasn't changed. With stable types, only items whose data actually changed recompose. The difference can be 1 recomposition vs 100 recompositions per state change.

**Common Pitfalls:**

Breaking the `@Immutable` contract is the most dangerous pitfall. If you annotate a data class as `@Immutable` but then mutate the list it contains externally, Compose will skip recomposition because it trusts your annotation — resulting in stale UI with no error or warning. Another pitfall is forgetting that classes from external libraries (Retrofit models, Room entities) are typically unstable because the Compose compiler can't analyze their source. You need to map them to `@Immutable` UI models at the boundary. Finally, a common mistake is trying to make everything `@Immutable` — only annotate types that you can genuinely guarantee won't be mutated.

**Key takeaway:** Skippability is determined at compile time based on parameter stability. Use Compose compiler reports to identify non-skippable composables, then fix them with `@Immutable`, `@Stable`, or immutable collection types.

### Quiz: Thinking in Compose

#### In Compose, what happens when a boolean condition controlling a composable changes from true to false?

- ❌ The composable's visibility is set to GONE
- ❌ The composable is hidden but remains in the tree
- ✅ The composable is removed from the composition tree entirely
- ❌ The composable is recycled into a pool for reuse

> **Explanation:** Unlike the View system where you toggle visibility, Compose controls whether a composable **exists** in the tree. When the condition is false, the composable is removed entirely from the composition — it's not hidden, it's gone. Its slot table entries are removed and any `remember`ed state is discarded.

#### Which of the following is true about recomposition?

- ❌ It always recomposes the entire composable tree
- ❌ It runs in a fixed, predictable order every time
- ✅ It only recomposes functions that read the changed state, and can be skipped, batched, or abandoned
- ❌ It guarantees exactly one execution per state change

> **Explanation:** Compose uses intelligent recomposition — it tracks which composable functions read which state and only re-executes those functions. Multiple state changes between frames are batched. Recomposition can be abandoned mid-execution if newer state arrives. Never rely on recomposition count or order for correctness.

#### What does the Compose compiler inject into every @Composable function?

- ❌ A ViewModel parameter
- ❌ A Context parameter
- ✅ A Composer parameter and a $changed bitmask for tracking parameter changes
- ❌ A coroutine scope

> **Explanation:** The Compose compiler transforms every `@Composable` function by adding a `Composer` parameter (which manages the slot table and composition state) and a `$changed` bitmask (which tracks which parameters changed since the last composition). This is the machinery that enables intelligent recomposition and skipping.

### Coding Challenge: Declarative Profile Card

Build a `ProfileCard` composable that displays a user's name, role, and an "Online" status indicator. The status indicator should be a green circle when online and disappear entirely when offline — use conditional composition, not visibility toggling. Include a toggle button that switches the online/offline state. The card should also display a recomposition counter (using `SideEffect`) to demonstrate that only state-dependent parts recompose.

#### Solution

```kotlin
@Composable
fun ProfileCard(name: String, role: String) {
    var isOnline by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(name, style = MaterialTheme.typography.headlineSmall)
                    Text(role, color = Color.Gray)
                }
                if (isOnline) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .background(Color.Green, CircleShape)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Online", color = Color.Green, fontSize = 12.sp)
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { isOnline = !isOnline }) {
                Text(if (isOnline) "Go Offline" else "Go Online")
            }
        }
    }
}
```

This solution uses conditional composition (`if (isOnline)`) so the green indicator and "Online" text are added to or removed from the tree entirely — not hidden. The `remember { mutableStateOf(false) }` pattern stores the toggle state across recompositions, and only the composables that read `isOnline` recompose when it changes.

---

## Module 2: State Management

State is the core of Compose. Get it right, and your UI is predictable. Get it wrong, and you'll fight recomposition bugs, stale data, and state loss across configuration changes.

### Lesson 2.1: remember and mutableStateOf

The `remember` API stores a value in the slot table so it survives recomposition. Without `remember`, a variable declared in a composable function would be re-initialized on every recomposition — losing its value. `mutableStateOf` creates a `MutableState` object that's observable by the snapshot system — when its value changes, any composable that reads it is scheduled for recomposition. Together, these two APIs form the foundation of local state management in Compose.

These two APIs are almost always used together, but they serve different purposes. `remember` provides **persistence** across recompositions. `mutableStateOf` provides **observability** for triggering recompositions. You can `remember` non-state values (formatters, parsers, computed results), and you can use `mutableStateOf` outside of `remember` (though it would be recreated on every recomposition, which is usually a bug). Understanding this separation is critical: `remember` without `mutableStateOf` stores a value but doesn't trigger recomposition when it changes. `mutableStateOf` without `remember` triggers recomposition but loses its value on every recomposition, creating an infinite loop.

Under the hood, `remember` stores its value at a specific position in the slot table. The first time the composable executes, `remember` evaluates its lambda, stores the result in the slot table, and returns it. On subsequent recompositions, `remember` reads the stored value from the slot table and returns it without re-evaluating the lambda. The key (if provided) controls whether the stored value is invalidated — when the key changes, the lambda re-evaluates and the new value replaces the old one.

```kotlin
@Composable
fun LoginForm() {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isPasswordVisible by remember { mutableStateOf(false) }

    OutlinedTextField(
        value = email,
        onValueChange = { email = it },
        label = { Text("Email") }
    )

    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text("Password") },
        visualTransformation = if (isPasswordVisible)
            VisualTransformation.None
        else
            PasswordVisualTransformation()
    )
}
```

The `by` keyword uses Kotlin property delegation. `mutableStateOf` returns a `MutableState<T>`, which implements `getValue` and `setValue` operators. Using `by` delegation, you can read and write the state like a regular property — `email` instead of `email.value`. This is syntactic sugar, but it significantly improves readability in composables with many state variables.

There are three ways to declare state, and each has implications:

```kotlin
@Composable
fun StateDeclarationStyles() {
    // Style 1: Direct MutableState — need .value for reads/writes
    val count1 = remember { mutableStateOf(0) }
    Text("Count: ${count1.value}")

    // Style 2: Property delegation with 'by' — clean reads/writes
    var count2 by remember { mutableStateOf(0) }
    Text("Count: $count2")

    // Style 3: Destructured — separate getter and setter
    val (count3, setCount3) = remember { mutableStateOf(0) }
    Text("Count: $count3")
    Button(onClick = { setCount3(count3 + 1) }) { Text("+") }
}
```

Style 2 (property delegation) is the most common and recommended for local state. Style 1 is useful when you need to pass the `MutableState` object itself to another function. Style 3 (destructuring) is useful in patterns where you want to pass the setter as a callback.

For non-state remembered values, `remember` caches expensive computations across recompositions:

```kotlin
@Composable
fun FormattedPrice(priceInCents: Long) {
    // Cached across recompositions — NumberFormat creation is expensive
    val formatter = remember {
        NumberFormat.getCurrencyInstance(Locale.US)
    }

    // Recalculated when priceInCents changes
    val formatted = remember(priceInCents) {
        formatter.format(priceInCents / 100.0)
    }

    Text(formatted)
}

@Composable
fun RegexValidator(pattern: String, input: String) {
    // Regex compiled once per pattern, not on every recomposition
    val regex = remember(pattern) { Regex(pattern) }
    val isValid = remember(input, regex) { regex.matches(input) }

    Text(
        text = if (isValid) "Valid" else "Invalid",
        color = if (isValid) Color.Green else Color.Red
    )
}
```

A common mistake is `remember { mutableStateOf(parameter) }` where `parameter` is a composable parameter. When the parameter changes, the state doesn't update because `remember` has no key. The fix is `remember(parameter) { mutableStateOf(parameter) }` — but be careful, this resets the state every time the parameter changes. If you want the initial value from a parameter but allow the user to modify it, you need to carefully design the key strategy.

```kotlin
// ❌ BUG: remember has no key — state never updates when initialText changes
@Composable
fun EditableField(initialText: String) {
    var text by remember { mutableStateOf(initialText) }
    TextField(value = text, onValueChange = { text = it })
}

// ⚠️ WORKS but resets user edits when initialText changes
@Composable
fun EditableField(initialText: String) {
    var text by remember(initialText) { mutableStateOf(initialText) }
    TextField(value = text, onValueChange = { text = it })
}

// ✅ BEST: separate initial value from user edits
@Composable
fun EditableField(
    value: String,
    onValueChange: (String) -> Unit
) {
    TextField(value = value, onValueChange = onValueChange)
}
```

For specialized state types, Compose provides optimized variants: `mutableIntStateOf`, `mutableLongStateOf`, `mutableFloatStateOf`, and `mutableDoubleStateOf`. These avoid autoboxing overhead when storing primitive numeric types. In performance-critical code like animation or scroll tracking, using `mutableIntStateOf` instead of `mutableStateOf(0)` avoids creating `Integer` wrapper objects on every read.

```kotlin
@Composable
fun OptimizedCounter() {
    // ✅ Uses primitive int — no autoboxing
    var count by remember { mutableIntStateOf(0) }

    // ❌ Uses boxed Integer — slight overhead
    var countBoxed by remember { mutableStateOf(0) }

    Text("Count: $count")
    Button(onClick = { count++ }) { Text("Increment") }
}
```

**Common Pitfalls:**

Using `mutableStateOf` without `remember` is the number one beginner mistake. The state is recreated on every recomposition, resetting to its initial value. Another pitfall is using `remember` with a stale key — if the key doesn't change when it should, the cached value becomes stale. The opposite pitfall is using too many keys, causing unnecessary recomputation. Each `remember(key)` call checks the key on every recomposition; adding expensive-to-compare keys wastes cycles. Finally, mutating remembered objects directly without `mutableStateOf` doesn't trigger recomposition — `remember { mutableListOf<String>() }` stores a list, but adding items to it is invisible to Compose.

**Key takeaway:** `remember` keeps a value across recompositions. `mutableStateOf` makes it observable — changes trigger recomposition. Always use them together for UI state, and always consider your key strategy.

### Lesson 2.2: State Hoisting

State hoisting is the pattern of moving state up to the caller and passing it down as parameters with events flowing up as callbacks. This makes composables stateless, reusable, and testable. It's the Compose equivalent of the "dumb view" pattern in MVP/MVVM. State hoisting is not just a best practice — it is the architectural pattern that Compose is designed around. Every Material component follows this pattern: `TextField` takes `value` and `onValueChange`, `Checkbox` takes `checked` and `onCheckedChange`.

The pattern creates a clear separation: the **state owner** (parent or ViewModel) holds the state, the **stateless composable** receives data and emits events. State flows down through parameters, events flow up through callbacks. This unidirectional data flow makes the UI predictable — for any given set of parameters, the composable always produces the same output. This is the declarative promise in action: the composable is a pure function of its parameters.

```kotlin
// ❌ State inside — not reusable, not testable
@Composable
fun SearchBar() {
    var query by remember { mutableStateOf("") }
    TextField(value = query, onValueChange = { query = it })
}

// ✅ State hoisted — parent controls the state
@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier
    )
}

// Parent owns the state
@Composable
fun SearchScreen(viewModel: SearchViewModel = viewModel()) {
    val query by viewModel.query.collectAsStateWithLifecycle()

    SearchBar(
        query = query,
        onQueryChange = viewModel::onQueryChange
    )
}
```

The testability benefit cannot be overstated. A stateless composable can be tested by setting content with known parameters and verifying the output. No ViewModel mocking, no dependency injection, no Hilt modules. You pass state in, check the UI, simulate user actions, and verify the emitted events.

```kotlin
// Testing a hoisted composable is trivial
@Test
fun searchBar_displays_query_and_emits_changes() {
    var capturedQuery = ""
    composeTestRule.setContent {
        SearchBar(
            query = "initial",
            onQueryChange = { capturedQuery = it }
        )
    }

    // Verify initial state
    composeTestRule.onNodeWithText("initial").assertIsDisplayed()

    // Simulate user typing
    composeTestRule.onNode(hasText("initial")).performTextInput(" text")

    // Verify event was emitted
    assert(capturedQuery == "initial text")
}
```

The question of **where** to hoist state has a clear answer: hoist to the **lowest common ancestor** that needs it. If only one composable reads a piece of state, keep it local with `remember`. If siblings need to share state, hoist to their parent. If the state needs to survive configuration changes or be shared across screens, hoist to a ViewModel. This creates a hierarchy of state ownership that mirrors the composable hierarchy.

```kotlin
// Decision tree for state placement:
// Q: Does only this composable use the state?
//   → Yes: keep local with remember
// Q: Do sibling composables need this state?
//   → Yes: hoist to parent
// Q: Does the state need to survive config changes?
//   → Yes: hoist to ViewModel
// Q: Does the state need to survive process death?
//   → Yes: use rememberSaveable or SavedStateHandle

// Local state — only this composable uses it
@Composable
fun ExpandableCard(title: String, content: String) {
    var expanded by remember { mutableStateOf(false) }
    Card(modifier = Modifier.clickable { expanded = !expanded }) {
        Text(title)
        AnimatedVisibility(visible = expanded) {
            Text(content)
        }
    }
}

// Shared state — siblings need it, hoist to parent
@Composable
fun TabbedContent() {
    var selectedTab by remember { mutableStateOf(0) }
    Column {
        TabRow(selectedTab) // reads selectedTab
        TabContent(selectedTab) // also reads selectedTab
    }
}
```

There's also the concept of a **plain class state holder** — for UI logic that's too complex for a single composable but doesn't belong in a ViewModel. Navigation drawer state, scroll state coordination, or complex form logic can live in a plain Kotlin class created with `remember`. The ViewModel handles business logic and data flow; the plain state holder manages UI-specific logic.

```kotlin
// Plain class for UI state management
class DrawerState(
    initialOpen: Boolean = false
) {
    var isOpen by mutableStateOf(initialOpen)
        private set

    fun open() { isOpen = true }
    fun close() { isOpen = false }
    fun toggle() { isOpen = !isOpen }
}

@Composable
fun rememberDrawerState(initialOpen: Boolean = false): DrawerState {
    return remember { DrawerState(initialOpen) }
}
```

In production, the state hoisting pattern extends beyond individual composables to entire screen architectures. A well-structured screen has a thin screen-level composable that connects to the ViewModel and a thick content-level composable that is entirely stateless. This pattern is covered in detail in Module 12, but the foundation is state hoisting.

**Common Pitfalls:**

Over-hoisting is a common mistake — hoisting state higher than necessary creates unnecessary coupling and causes wider recomposition scopes. If a state value is only used by one composable, keeping it local with `remember` is correct. Another pitfall is hoisting state that doesn't need to be shared. Not every piece of state needs to be in a ViewModel. Scroll position, expansion state, and text field focus are often better managed locally. A third pitfall is forgetting to pass the `Modifier` parameter — every public composable should accept a `modifier: Modifier = Modifier` parameter for flexibility. This is part of the hoisting contract: the caller controls the composable's external behavior through modifiers.

**Key takeaway:** Hoist state to the lowest common ancestor that needs it. UI components should be stateless — they receive data and emit events. Use plain classes for complex UI logic, ViewModels for business logic.

### Lesson 2.3: rememberSaveable and State Restoration

`remember` survives recomposition but loses its value on configuration changes (rotation, locale change) and process death. `rememberSaveable` extends persistence by saving the value to the `SavedStateHandle` / `Bundle`, which survives both configuration changes and system-initiated process death.

For primitive types (`String`, `Int`, `Boolean`, `Float`, etc.) and `Parcelable` objects, `rememberSaveable` works out of the box. For custom types that aren't parcelable, you need a `Saver` — a pair of functions that serialize the value to a bundle-compatible format and deserialize it back.

```kotlin
@Composable
fun NoteEditor() {
    // Survives configuration changes AND process death
    var title by rememberSaveable { mutableStateOf("") }
    var body by rememberSaveable { mutableStateOf("") }

    // For complex objects, use a custom Saver
    var selectedTab by rememberSaveable(stateSaver = TabSaver) {
        mutableStateOf(Tab.EDIT)
    }
}

// Custom Saver for enum types
val TabSaver = Saver<Tab, String>(
    save = { it.name },
    restore = { Tab.valueOf(it) }
)

// Saver for a data class with multiple fields
data class FilterState(
    val query: String,
    val category: String,
    val sortAscending: Boolean
)

val FilterStateSaver = listSaver<FilterState, Any>(
    save = { listOf(it.query, it.category, it.sortAscending) },
    restore = {
        FilterState(
            query = it[0] as String,
            category = it[1] as String,
            sortAscending = it[2] as Boolean
        )
    }
)
```

The decision tree is straightforward. Use `remember` for computed values that can be recalculated (formatted strings, parsed data, layout calculations). Use `rememberSaveable` for user-entered data that would be frustrating to lose (form fields, scroll position, selected tabs). Use a ViewModel for data that comes from a repository or needs to survive navigation.

A common mistake is using `rememberSaveable` for everything. The `Bundle` has a size limit (~1MB total for the entire Activity), so storing large objects or lists in `rememberSaveable` can crash your app with `TransactionTooLargeException`. Only save the minimal state needed to restore the UI — store IDs and let the ViewModel re-fetch the full data.

**Key takeaway:** Use `rememberSaveable` for state that should survive configuration changes. Use custom `Saver` for non-primitive types. Keep saved state minimal — IDs and flags, not full data objects.

### Lesson 2.4: ViewModel Integration and StateFlow

For state that survives configuration changes, comes from a data layer, or needs to be shared across composables, the ViewModel is the right state holder. In Compose, ViewModels expose state as `StateFlow` (or `Flow`) and composables collect it with `collectAsStateWithLifecycle()`. This integration pattern is the backbone of production Compose apps — understanding it deeply prevents a class of subtle lifecycle bugs.

The `collectAsStateWithLifecycle` extension is lifecycle-aware — it starts collecting when the composable is at least `STARTED` and stops when it drops below `STARTED`. This prevents processing emissions when the UI isn't visible, saving resources and avoiding crashes from updates to an invisible UI. This is a critical distinction from `collectAsState()`, which collects regardless of lifecycle state. In production, always prefer `collectAsStateWithLifecycle()` — it is the correct choice for any flow that originates from a repository or data source.

The lifecycle awareness solves a subtle problem. When the user presses Home and the Activity goes to `STOPPED`, `collectAsState()` continues collecting emissions. If the flow emits a navigation event while the app is backgrounded, the composable tries to navigate — potentially crashing. `collectAsStateWithLifecycle()` stops collecting when the lifecycle drops below `STARTED`, preventing this class of bugs entirely. It also prevents wasted work — if your flow triggers network requests or database queries, stopping collection when the UI isn't visible avoids unnecessary battery and data usage.

```kotlin
class ProfileViewModel(
    private val userRepository: UserRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            userRepository.getUser()
                .onSuccess { user ->
                    _uiState.update { it.copy(user = user, isLoading = false) }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(error = error.message, isLoading = false) }
                }
        }
    }

    fun onEvent(event: ProfileEvent) {
        when (event) {
            is ProfileEvent.EditName -> updateName(event.name)
            is ProfileEvent.ToggleNotifications -> toggleNotifications()
        }
    }
}

@Composable
fun ProfileScreen(viewModel: ProfileViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    ProfileContent(
        state = uiState,
        onEvent = viewModel::onEvent
    )
}
```

There are multiple approaches to managing state in a ViewModel. The simplest is a single `MutableStateFlow` with a data class. This works well for most screens and provides atomic state updates — the UI never sees a partially-updated state. The tradeoff is that every state update creates a new data class instance, which triggers recomposition of the entire screen composable (though skippable children with unchanged parameters will be skipped).

For more complex screens, you can use multiple individual state flows and combine them using the `combine` operator. The `combine` approach is more flexible — each piece of state can be updated independently, and you can mix flows from the repository with local UI state. The tradeoff is more boilerplate and the need to handle the initial empty state before all flows have emitted.

```kotlin
class DashboardViewModel(
    private val analyticsRepo: AnalyticsRepository,
    private val settingsRepo: SettingsRepository
) : ViewModel() {
    private val _searchQuery = MutableStateFlow("")
    private val _selectedTab = MutableStateFlow(Tab.OVERVIEW)

    val uiState: StateFlow<DashboardState> = combine(
        _searchQuery,
        _selectedTab,
        analyticsRepo.getMetrics(),
        settingsRepo.getUserPreferences()
    ) { query, tab, metrics, prefs ->
        DashboardState(
            searchQuery = query,
            selectedTab = tab,
            metrics = metrics,
            preferences = prefs
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = DashboardState()
    )
}
```

The `SharingStarted.WhileSubscribed(5_000)` parameter deserves explanation. It tells the `stateIn` operator to keep the upstream flows active for 5 seconds after the last subscriber disconnects. This handles a common scenario: during a configuration change (screen rotation), the old composable is destroyed and the new one starts collecting. There's a brief gap where no subscribers exist. Without the 5-second grace period, the upstream flows would stop and restart, potentially re-fetching data from the network. The 5-second window bridges this gap, keeping the data flow alive during configuration changes.

An alternative approach is exposing multiple individual `State` objects from the ViewModel, each with its own `collectAsStateWithLifecycle()` in the composable. This creates finer-grained recomposition boundaries — only the composables that read the specific state that changed will recompose.

```kotlin
class FineGrainedViewModel : ViewModel() {
    val userName: StateFlow<String> = userRepo.userName
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")

    val notifications: StateFlow<Int> = notifRepo.unreadCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val isOnline: StateFlow<Boolean> = connectivityRepo.isOnline
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
}

@Composable
fun FineGrainedScreen(viewModel: FineGrainedViewModel = viewModel()) {
    Column {
        // Only recomposes when userName changes
        val name by viewModel.userName.collectAsStateWithLifecycle()
        Text("Hello, $name")

        // Only recomposes when notification count changes
        val count by viewModel.notifications.collectAsStateWithLifecycle()
        Badge { Text("$count") }

        // Only recomposes when online status changes
        val online by viewModel.isOnline.collectAsStateWithLifecycle()
        StatusDot(online)
    }
}
```

**Common Pitfalls:**

Using `collectAsState()` instead of `collectAsStateWithLifecycle()` is the most common mistake — it leads to wasted work and potential crashes when the app is backgrounded. Another pitfall is using `SharingStarted.Lazily` or `SharingStarted.Eagerly` when `WhileSubscribed` is the correct default. `Eagerly` starts collection immediately and never stops, wasting resources. `Lazily` starts on first subscriber but never stops. `WhileSubscribed(5_000)` starts and stops appropriately. A third pitfall is updating `MutableStateFlow` from background threads without proper synchronization — use `_state.update { }` instead of `_state.value = _state.value.copy(...)` because `update` is atomic.

**Key takeaway:** Use `collectAsStateWithLifecycle()` to bridge ViewModel StateFlows into Compose state. Choose between single-state and combine-based patterns based on complexity. Use `SharingStarted.WhileSubscribed(5_000)` to keep upstream flows alive during configuration changes.

### Lesson 2.5: derivedStateOf — Output-Based Invalidation

`derivedStateOf` creates a derived state that only triggers recomposition when its **result** actually changes, not when the **inputs** change. This distinction matters enormously for high-frequency state sources like scroll position, text input, or animation progress.

Most developers know `derivedStateOf` as "computed properties for Compose." But the internal mechanism is more sophisticated than simple computation. `derivedStateOf` tracks its dependencies through the snapshot system — it knows which state objects the derivation lambda reads because those reads happen inside a tracked context. When any input changes, it re-runs the lambda. But it **compares the new result to the previous one**. If they're structurally equal, it does not report itself as modified. Downstream composables are not recomposed.

```kotlin
@Composable
fun CollapsibleHeader(listState: LazyListState) {
    // ❌ BAD: recomposes on every scroll pixel
    val showHeader = listState.firstVisibleItemScrollOffset < 200

    // ✅ GOOD: only recomposes when the boolean actually flips
    val showHeader by remember {
        derivedStateOf { listState.firstVisibleItemScrollOffset < 200 }
    }

    AnimatedVisibility(visible = showHeader) {
        TopAppBar(title = { Text("Products") })
    }
}
```

Consider a header that should show or hide based on scroll offset. The scroll offset changes on every single frame during a fling — potentially 60+ times per second. But the header visibility is a boolean: visible or not. Without `derivedStateOf`, every scroll pixel triggers recomposition of the header. With it, recomposition only happens on the two transitions: visible-to-hidden and hidden-to-visible. That's going from 60 recompositions per second to maybe 2 during the entire scroll gesture.

But `derivedStateOf` isn't free. It adds overhead — it creates a snapshot observer and tracks dependencies. If your derived value changes just as often as the source (like mapping a number to a slightly different number), `derivedStateOf` adds cost with no benefit. It's specifically for **many-to-few mappings**: many input changes producing few output changes.

```kotlin
// ✅ Good use — form validity changes rarely relative to keystrokes
val isFormValid by remember {
    derivedStateOf {
        email.contains("@") && password.length >= 8
    }
}

// ❌ Bad use — output changes on every input change
val uppercased by remember {
    derivedStateOf { query.uppercase() }
}
// Just use remember(query) { query.uppercase() } instead
```

**Key takeaway:** `derivedStateOf` is for expensive computations where the output changes less frequently than the input. It invalidates based on output equality, not input changes. Don't use it when the output changes on every input change.

### Lesson 2.6: produceState — Converting Non-Compose State

`produceState` bridges non-Compose reactive sources (callbacks, listeners, raw coroutine flows) into Compose `State`. It creates a `MutableState`, gives you a producer scope to update it, and returns the state as a read-only `State` value. The producer coroutine is scoped to the composition — it starts when the composable enters the tree and cancels when it leaves.

```kotlin
@Composable
fun NetworkStatus(): State<ConnectionState> {
    return produceState(initialValue = ConnectionState.Unknown) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                value = ConnectionState.Connected
            }
            override fun onLost(network: Network) {
                value = ConnectionState.Disconnected
            }
        }
        val manager = context.getSystemService<ConnectivityManager>()
        manager?.registerDefaultNetworkCallback(callback)

        awaitDispose {
            manager?.unregisterNetworkCallback(callback)
        }
    }
}

@Composable
fun BatteryLevel(context: Context): State<Int> {
    return produceState(initialValue = 0) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, 0)
                value = level
            }
        }
        context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

        awaitDispose {
            context.unregisterReceiver(receiver)
        }
    }
}
```

`produceState` is essentially a combination of `remember { mutableStateOf(initialValue) }` and `LaunchedEffect` with cleanup support through `awaitDispose`. It's syntactic sugar, but it clarifies intent — you're producing a `State` from a non-Compose source. Use it whenever you need to wrap a callback-based API, a broadcast receiver, or a platform listener into Compose-compatible state.

**Key takeaway:** `produceState` converts callback-based APIs and non-Compose reactive sources into Compose `State`. It handles lifecycle scoping and cleanup automatically through its coroutine scope and `awaitDispose`.

### Quiz: State Management

#### What is the difference between `remember` and `rememberSaveable`?

- ❌ `remember` is for primitives, `rememberSaveable` is for objects
- ❌ They are identical in behavior
- ✅ `remember` survives recomposition only, while `rememberSaveable` also survives configuration changes and process death
- ❌ `rememberSaveable` is faster than `remember`

> **Explanation:** `remember` stores a value across recompositions but loses it on configuration changes (like screen rotation). `rememberSaveable` persists through configuration changes and process death by saving to the `Bundle`, making it suitable for user-entered data like form fields.

#### When should you use `derivedStateOf` vs `remember(key) { }`?

- ❌ `derivedStateOf` is always faster
- ❌ They are interchangeable
- ✅ Use `derivedStateOf` when the output changes less frequently than the input (many-to-few mapping); use `remember(key)` when the output changes on every input change
- ❌ `remember(key)` is deprecated in favor of `derivedStateOf`

> **Explanation:** `derivedStateOf` compares the derived result and only triggers recomposition when it actually changes. This is ideal for scroll-to-boolean conversions or form validation. But if the output changes on every input change (like uppercasing a string), `derivedStateOf` adds overhead with no benefit — use `remember(key)` instead.

#### What does `collectAsStateWithLifecycle()` do that `collectAsState()` doesn't?

- ❌ It provides a default value
- ❌ It handles errors automatically
- ✅ It starts and stops collection based on the lifecycle, preventing emissions when the UI is not visible
- ❌ It converts the flow to a hot stream

> **Explanation:** `collectAsStateWithLifecycle()` is lifecycle-aware — it starts collecting when the composable reaches `STARTED` and stops when it drops below. This prevents wasted work processing emissions for an invisible UI and avoids potential crashes from updating state when the Activity is in the background.

### Coding Challenge: Smart Form Validator

Build a `RegistrationForm` composable with three fields: email, password, and confirm password. Use `derivedStateOf` to compute form validity (email must contain "@", password must be at least 8 characters, both passwords must match). Use `rememberSaveable` for inputs. Display real-time validation messages below each field. Hoist the validation display into a reusable `ValidatedField` component. Include a submit button enabled only when all validations pass.

#### Solution

```kotlin
@Composable
fun RegistrationForm() {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }

    val emailError by remember {
        derivedStateOf {
            if (email.isNotEmpty() && !email.contains("@")) "Invalid email" else null
        }
    }
    val passwordError by remember {
        derivedStateOf {
            if (password.isNotEmpty() && password.length < 8) "At least 8 characters" else null
        }
    }
    val confirmError by remember {
        derivedStateOf {
            if (confirmPassword.isNotEmpty() && confirmPassword != password)
                "Passwords don't match" else null
        }
    }
    val isFormValid by remember {
        derivedStateOf {
            email.contains("@") && password.length >= 8 && password == confirmPassword
        }
    }

    Column(modifier = Modifier.padding(16.dp)) {
        ValidatedField(value = email, onValueChange = { email = it },
            label = "Email", error = emailError)
        Spacer(modifier = Modifier.height(8.dp))
        ValidatedField(value = password, onValueChange = { password = it },
            label = "Password", error = passwordError)
        Spacer(modifier = Modifier.height(8.dp))
        ValidatedField(value = confirmPassword, onValueChange = { confirmPassword = it },
            label = "Confirm Password", error = confirmError)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { /* submit */ }, enabled = isFormValid) {
            Text("Register")
        }
    }
}

@Composable
fun ValidatedField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    error: String?
) {
    Column {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            isError = error != null,
            modifier = Modifier.fillMaxWidth()
        )
        if (error != null) {
            Text(error, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
        }
    }
}
```

This solution uses `rememberSaveable` for user input (survives rotation), `derivedStateOf` for computed validations (only recomposes when the validation result changes, not on every keystroke), and a stateless `ValidatedField` component with hoisted state for reusability.

---

## Module 3: Side Effects

Side effects are operations that escape the scope of a composable function — network calls, analytics, listeners, navigation, logging. Compose provides effect handlers to manage them safely, ensuring they run at the right time and clean up properly.

### Lesson 3.1: LaunchedEffect — The Workhorse

`LaunchedEffect` launches a coroutine that's tied to the composition lifecycle. When the composable enters the composition, the coroutine starts. When the composable leaves the composition, the coroutine is cancelled. If the key changes, the current coroutine is cancelled and a new one starts. This is the most commonly used effect handler in Compose, and understanding its lifecycle is essential for correct side effect management.

The key parameter is the most important thing to get right. Think of it not as "when should this run" but as "what input does this effect depend on." If your effect depends on a `userId`, the key is `userId`. If it depends on nothing (one-time initialization), the key is `Unit`. If you're not sure what the key should be, you probably don't fully understand your effect's dependencies. The key is the contract between you and the runtime: "restart this effect whenever this value changes."

Internally, `LaunchedEffect` stores its coroutine job in the slot table. When the key changes, the stored job is cancelled via cooperative cancellation (the standard Kotlin coroutine cancellation mechanism), and a new job is launched. The coroutine scope provided to the lambda is a `CoroutineScope` that uses `Dispatchers.Main.immediate` by default, meaning the coroutine starts executing synchronously on the UI thread until it hits a suspension point. This is important for understanding timing — code before the first `delay` or `suspend` call runs immediately after composition.

```kotlin
@Composable
fun ProfileScreen(userId: String) {
    val viewModel: ProfileViewModel = viewModel()

    // Runs when userId changes, cancels previous effect
    LaunchedEffect(userId) {
        viewModel.loadProfile(userId)
    }

    // Runs once when entering composition — collects events
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is UiEvent.Navigate -> navigator.navigate(event.route)
                is UiEvent.ShowSnackbar -> snackbarState.showSnackbar(event.message)
            }
        }
    }
}
```

The `LaunchedEffect(Unit)` pattern deserves special attention. Using `Unit` as the key means "this effect runs exactly once when the composable enters the composition and is cancelled when it leaves." This is the correct pattern for one-time setup, event collection, and indefinite operations like timers. Because the key never changes (it's always `Unit`), the effect never restarts during recompositions.

Multiple keys are supported — `LaunchedEffect(key1, key2)` restarts when either key changes. The runtime checks all keys for equality and restarts if any one has changed. Use multiple keys when your effect depends on multiple inputs.

```kotlin
@Composable
fun FilteredList(
    category: String,
    sortOrder: SortOrder,
    viewModel: ListViewModel
) {
    // Restarts when either category OR sortOrder changes
    LaunchedEffect(category, sortOrder) {
        viewModel.loadItems(category, sortOrder)
    }

    // ❌ BAD: separate effects for related keys
    // If both change simultaneously, you get two loads
    LaunchedEffect(category) { viewModel.loadItems(category, sortOrder) }
    LaunchedEffect(sortOrder) { viewModel.loadItems(category, sortOrder) }
}
```

A common mistake is using `LaunchedEffect` with a state value as the key when you actually want it to run once. For example, `LaunchedEffect(uiState)` restarts on every state change — if the effect updates state, you get an infinite loop. The fix is to use `LaunchedEffect(Unit)` for one-time effects and handle state changes through flow collection or event channels.

Another common pattern is using `LaunchedEffect` for one-time navigation events. But be careful: if the composable recomposes between the event emission and the `LaunchedEffect` collecting it, the event might be missed. Use a `Channel` or `SharedFlow(replay = 0)` in the ViewModel to ensure events are consumed exactly once.

```kotlin
// ViewModel
class OrderViewModel : ViewModel() {
    private val _events = Channel<OrderEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun submitOrder() {
        viewModelScope.launch {
            repository.createOrder()
            _events.send(OrderEvent.NavigateToConfirmation)
        }
    }
}
```

A production pattern you'll use frequently is launching parallel operations with structured concurrency inside `LaunchedEffect`:

```kotlin
@Composable
fun DashboardScreen(viewModel: DashboardViewModel) {
    LaunchedEffect(Unit) {
        // Launch parallel data loads using structured concurrency
        coroutineScope {
            launch { viewModel.loadUserProfile() }
            launch { viewModel.loadNotifications() }
            launch { viewModel.loadRecentActivity() }
        }
        // All three complete before this line executes
        viewModel.markDataReady()
    }

    // Another common pattern: periodic refresh
    LaunchedEffect(Unit) {
        while (isActive) {
            viewModel.refreshData()
            delay(30_000) // Refresh every 30 seconds
        }
    }
}
```

**Common Pitfalls:**

The most dangerous pitfall is capturing a changing value in a `LaunchedEffect(Unit)` without `rememberUpdatedState`. Since the effect never restarts, it captures the initial value of its closures. If a callback parameter changes, the effect still holds the original reference. Use `rememberUpdatedState` (covered in Lesson 3.3) to solve this. Another pitfall is blocking the UI thread with expensive synchronous operations before the first suspension point — remember that `LaunchedEffect` starts on `Dispatchers.Main.immediate`. Switch to `Dispatchers.IO` for blocking operations using `withContext(Dispatchers.IO) { ... }`.

**Key takeaway:** `LaunchedEffect` launches a coroutine scoped to the composition. When the key changes, the previous coroutine is cancelled and a new one starts. Use `Unit` for one-time effects, specific values for effects that depend on parameters.

### Lesson 3.2: DisposableEffect — Setup and Teardown

`DisposableEffect` is for effects that need explicit cleanup — registering/unregistering listeners, adding/removing observers, connecting/disconnecting from services. It provides an `onDispose` block that runs when the composable leaves the composition or when the key changes (before the effect restarts). This is the Compose equivalent of `onResume`/`onPause` or `addListener`/`removeListener` patterns. Any time you have a setup/teardown pair, `DisposableEffect` is the right tool.

The critical difference between `DisposableEffect` and `LaunchedEffect` is the cleanup mechanism. `LaunchedEffect` cleans up by cancelling its coroutine — any suspending operation is automatically cancelled through Kotlin's cooperative cancellation. `DisposableEffect` cleans up by running an explicit `onDispose` block — this is necessary when the resource doesn't support coroutine cancellation. Platform listeners, broadcast receivers, sensor registrations, and callback-based APIs all need explicit cleanup through `onDispose`.

The execution lifecycle of `DisposableEffect` follows a precise sequence. On first composition, the setup block runs and registrations are established. When the key changes, `onDispose` runs first to clean up the old registrations, then the setup block runs again with the new key. When the composable leaves the composition entirely, `onDispose` runs one final time. This ordering guarantees that there is never a gap or overlap in resource management — the old resource is always released before the new one is acquired.

```kotlin
@Composable
fun LifecycleObserver(onResume: () -> Unit, onPause: () -> Unit) {
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> onResume()
                Lifecycle.Event.ON_PAUSE -> onPause()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
}

@Composable
fun SensorTracker(sensorManager: SensorManager) {
    val accelerometer = remember {
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    }
    var acceleration by remember { mutableStateOf(FloatArray(3)) }

    DisposableEffect(sensorManager) {
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                acceleration = event.values.clone()
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        sensorManager.registerListener(
            listener, accelerometer, SensorManager.SENSOR_DELAY_UI
        )

        onDispose {
            sensorManager.unregisterListener(listener)
        }
    }
}
```

The key parameter for `DisposableEffect` follows the same rules as `LaunchedEffect`. When the key changes, `onDispose` runs first to clean up the old effect, then the setup block runs again with the new key value. This ensures resources are always properly released before re-acquisition.

A production pattern that appears frequently is wrapping platform callback APIs into Compose-friendly state. The combination of `DisposableEffect` for lifecycle management and `mutableStateOf` for Compose state creates a bridge between the imperative Android platform and the declarative Compose world:

```kotlin
@Composable
fun rememberWindowInsets(): WindowInsetsCompat {
    var insets by remember { mutableStateOf(WindowInsetsCompat.CONSUMED) }
    val view = LocalView.current

    DisposableEffect(view) {
        val listener = OnApplyWindowInsetsListener { _, windowInsets ->
            insets = windowInsets
            windowInsets
        }
        ViewCompat.setOnApplyWindowInsetsListener(view, listener)

        onDispose {
            ViewCompat.setOnApplyWindowInsetsListener(view, null)
        }
    }

    return insets
}

// Using a map listener with cleanup
@Composable
fun MapCameraTracker(mapView: MapView, onCameraMove: (LatLng) -> Unit) {
    val currentOnCameraMove by rememberUpdatedState(onCameraMove)

    DisposableEffect(mapView) {
        val listener = GoogleMap.OnCameraMoveListener {
            mapView.getMapAsync { map ->
                currentOnCameraMove(map.cameraPosition.target)
            }
        }
        mapView.getMapAsync { map ->
            map.setOnCameraMoveListener(listener)
        }

        onDispose {
            mapView.getMapAsync { map ->
                map.setOnCameraMoveListener(null)
            }
        }
    }
}
```

**Common Pitfalls:**

Forgetting to include `onDispose` is a compiler error — `DisposableEffect` requires it. But a common runtime pitfall is doing incomplete cleanup. If your setup block registers two listeners, your `onDispose` must unregister both. Another pitfall is referencing stale values inside the setup or `onDispose` blocks. If a callback parameter changes but the key doesn't, the `DisposableEffect` continues using the old callback. Use `rememberUpdatedState` (covered in Lesson 3.3) to solve this. Finally, avoid doing heavy work inside `onDispose` — it runs synchronously on the UI thread during composition disposal.

**Key takeaway:** `DisposableEffect` is for effects that need cleanup — listeners, callbacks, subscriptions. The `onDispose` block runs when the key changes or when leaving composition. Always pair setup with teardown.

### Lesson 3.3: SideEffect and rememberUpdatedState

`SideEffect` runs after every successful recomposition. It's the simplest effect handler — no keys, no cleanup, no coroutines. Use it for fire-and-forget operations that need to happen on every recomposition, like logging analytics events or updating external imperative systems.

`rememberUpdatedState` solves a specific problem: keeping a reference to the latest value of a parameter inside a long-lived effect without restarting that effect. When you have a `LaunchedEffect(Unit)` that runs indefinitely (like a timer or event collector), it captures the initial values of its parameters. If those parameters change during recomposition, the effect still uses the stale values. `rememberUpdatedState` creates a state holder that always reflects the latest value.

```kotlin
// SideEffect — runs after every successful recomposition
@Composable
fun AnalyticsScreen(screenName: String) {
    SideEffect {
        analytics.logScreenView(screenName)
    }
}

// rememberUpdatedState — capture latest value in long-lived effects
@Composable
fun TimerEffect(onTick: () -> Unit) {
    val currentOnTick by rememberUpdatedState(onTick)

    LaunchedEffect(Unit) {  // Never restarts
        while (true) {
            delay(1000)
            currentOnTick()  // Always calls the latest callback
        }
    }
}

// Without rememberUpdatedState, this would call the original
// onTick callback even after the parent passes a new one
@Composable
fun CountdownBanner(
    message: String,
    durationMs: Long = 5000,
    onDismiss: () -> Unit
) {
    val currentOnDismiss by rememberUpdatedState(onDismiss)

    LaunchedEffect(message) {
        delay(durationMs)
        currentOnDismiss()
    }

    Card(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Text(message, modifier = Modifier.padding(16.dp))
    }
}
```

**Key takeaway:** `SideEffect` is for non-suspending, fire-and-forget operations after recomposition. `rememberUpdatedState` keeps a reference to the latest value without restarting the effect. Use it when a long-lived effect needs access to changing parameters.

### Lesson 3.4: snapshotFlow — Bridging Compose and Flow

`snapshotFlow` converts Compose snapshot state into a Kotlin `Flow`. It takes a lambda that reads snapshot state, runs it inside a snapshot, and emits a new value whenever the state objects read by the lambda change. This is the bridge from the Compose world to the coroutine/Flow world.

The key advantage of `snapshotFlow` over reading state directly is that you get all of Flow's operators — `filter`, `distinctUntilChanged`, `debounce`, `map`, `combine`. This enables sophisticated reactive logic that would be cumbersome to express with just Compose state.

```kotlin
@Composable
fun InfiniteScrollList(
    items: List<Item>,
    onLoadMore: () -> Unit
) {
    val listState = rememberLazyListState()

    // Convert Compose state to Flow for reactive logic
    LaunchedEffect(listState) {
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
        }
        .distinctUntilChanged()
        .filter { lastVisibleIndex ->
            lastVisibleIndex >= items.size - 5
        }
        .collect {
            onLoadMore()
        }
    }

    LazyColumn(state = listState) {
        items(items) { item -> ItemRow(item) }
    }
}

// Another common use: save scroll position to a ViewModel
@Composable
fun PersistentList(viewModel: ListViewModel) {
    val listState = rememberLazyListState()

    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset }
            .debounce(300)
            .collect { (index, offset) ->
                viewModel.saveScrollPosition(index, offset)
            }
    }
}
```

**Key takeaway:** `snapshotFlow` converts Compose snapshot state into a Flow. It's the bridge between the Compose world and the coroutine world. Use it with Flow operators for reactive logic on Compose state.

### Lesson 3.5: Effect Ordering and Lifecycle

Understanding the order in which effects execute relative to composition and recomposition prevents subtle timing bugs. The lifecycle of effects follows a specific sequence that matches the composition lifecycle.

When a composable enters the composition for the first time: (1) The composition body executes, (2) `SideEffect` blocks run, (3) `LaunchedEffect` coroutines start, (4) `DisposableEffect` setup blocks run. When a composable recomposes: (1) The composition body re-executes, (2) `SideEffect` blocks run again, (3) `LaunchedEffect` — if the key changed, the old coroutine is cancelled and a new one starts, (4) `DisposableEffect` — if the key changed, `onDispose` runs on the old effect, then the new setup runs. When a composable leaves the composition: (1) `LaunchedEffect` coroutines are cancelled, (2) `DisposableEffect` `onDispose` blocks run.

```kotlin
@Composable
fun EffectLifecycleDemo(userId: String) {
    // 1. Runs during composition
    val user = remember(userId) { fetchUserSync(userId) }

    // 2. Runs after every successful recomposition
    SideEffect {
        analytics.setUserId(userId)
    }

    // 3. Setup runs after composition; onDispose runs on leave or key change
    DisposableEffect(userId) {
        val subscription = messageService.subscribe(userId)
        onDispose {
            subscription.cancel()
        }
    }

    // 4. Coroutine starts after composition; cancelled on leave or key change
    LaunchedEffect(userId) {
        notificationService.registerForPush(userId)
    }

    Text("User: ${user.name}")
}
```

**Key takeaway:** Effects run after composition, not during it. `SideEffect` runs on every recomposition, `LaunchedEffect` and `DisposableEffect` respect their keys. Cleanup (coroutine cancellation, `onDispose`) happens before re-setup when keys change, and on composition exit.

### Quiz: Side Effects

#### What happens to a `LaunchedEffect` coroutine when its key changes?

- ❌ It continues running with the new key
- ❌ A second coroutine starts alongside the first
- ✅ The previous coroutine is cancelled and a new one starts
- ❌ The effect is ignored until the composable recomposes

> **Explanation:** When the key of a `LaunchedEffect` changes, Compose cancels the currently running coroutine and launches a new one with the new key value. This ensures the effect always corresponds to the current state — for example, loading data for the current user ID.

#### When should you use `rememberUpdatedState`?

- ❌ To make state survive process death
- ❌ As a replacement for `rememberSaveable`
- ✅ To capture the latest value of a changing parameter inside a long-lived effect that doesn't restart
- ❌ To cache network responses

> **Explanation:** When a `LaunchedEffect` uses `Unit` as its key (runs once), it captures the initial callback value. If the callback changes, the effect still uses the stale reference. `rememberUpdatedState` keeps a ref to the latest value so the long-lived effect always calls the current callback.

#### What is `snapshotFlow` used for?

- ❌ Taking screenshots of the UI
- ❌ Creating snapshot tests
- ✅ Converting Compose snapshot state into a Kotlin Flow for use with Flow operators
- ❌ Saving state to disk

> **Explanation:** `snapshotFlow` reads Compose state inside a snapshot and emits new values whenever those state objects change. This bridges the Compose world and the coroutine/Flow world, enabling you to use `filter`, `debounce`, `distinctUntilChanged` and other Flow operators on Compose state.

### Coding Challenge: Auto-Dismiss Snackbar

Build a `TimedMessage` composable that displays a message card and automatically dismisses it after 3 seconds. Use `LaunchedEffect` with the message as key so changing the message resets the timer. Include a manual "Dismiss" button. Use `rememberUpdatedState` for the dismiss callback. Add a `DisposableEffect` that logs when the message appears and disappears for analytics.

#### Solution

```kotlin
@Composable
fun TimedMessage(
    message: String?,
    onDismiss: () -> Unit
) {
    if (message == null) return

    val currentOnDismiss by rememberUpdatedState(onDismiss)

    // Auto-dismiss after 3 seconds, resets when message changes
    LaunchedEffect(message) {
        delay(3000)
        currentOnDismiss()
    }

    // Analytics logging with cleanup
    DisposableEffect(message) {
        analytics.logEvent("message_shown", mapOf("text" to message))
        onDispose {
            analytics.logEvent("message_dismissed", mapOf("text" to message))
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = message,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium
            )
            TextButton(onClick = { currentOnDismiss() }) {
                Text("Dismiss")
            }
        }
    }
}
```

The `LaunchedEffect` key is `message`, so when the message changes, the previous timer is cancelled and a new 3-second countdown begins. `rememberUpdatedState` ensures the `onDismiss` callback is always the latest reference. The `DisposableEffect` provides analytics lifecycle tracking.

---
## Module 4: Layouts and Modifiers

Compose provides flexible layout primitives and a modifier system that replaces XML layouts entirely. Understanding how constraints propagate, how modifier order affects behavior, and how to build custom layouts gives you complete control over UI structure.

### Lesson 4.1: Row, Column, and Box

The three foundational layout composables cover 90% of UI layout needs. `Row` arranges children horizontally, `Column` arranges them vertically, and `Box` stacks children on top of each other. Each accepts alignment and arrangement parameters that control how children are positioned within the available space.

`Arrangement` controls spacing along the main axis — how children are distributed. `Alignment` controls positioning along the cross axis — where children sit within the remaining space. For `Row`, the main axis is horizontal and the cross axis is vertical. For `Column`, it's reversed.

```kotlin
@Composable
fun ProfileHeader(user: User) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Avatar(url = user.avatarUrl, size = 48.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(user.name, fontWeight = FontWeight.Bold)
            Text(user.email, color = Color.Gray, fontSize = 14.sp)
        }
        IconButton(onClick = { /* settings */ }) {
            Icon(Icons.Default.Settings, contentDescription = "Settings")
        }
    }
}
```

`Modifier.weight(1f)` is available only inside `Row` and `Column` scopes (via `RowScope` and `ColumnScope`). It tells the child to fill the remaining space after all non-weighted children are measured. Multiple weighted children share the remaining space proportionally. This replaces `LinearLayout` weights from XML.

`Box` stacks children and provides `Alignment` for positioning each child within the box's bounds. The last child draws on top. Use `Modifier.align()` inside `BoxScope` to position individual children independently.

```kotlin
@Composable
fun ImageWithBadge(imageUrl: String, count: Int) {
    Box(contentAlignment = Alignment.Center) {
        AsyncImage(model = imageUrl, contentDescription = null,
            modifier = Modifier.size(80.dp).clip(CircleShape))
        if (count > 0) {
            Badge(
                modifier = Modifier.align(Alignment.TopEnd)
            ) {
                Text("$count")
            }
        }
    }
}
```

**Key takeaway:** `Row` = horizontal, `Column` = vertical, `Box` = stacked. Use `Modifier.weight()` for proportional sizing. `Arrangement` controls main-axis spacing, `Alignment` controls cross-axis positioning.

### Lesson 4.2: Modifier Chain — Order Is Everything

A modifier chain is processed outside-in. Each modifier wraps the next one, creating a chain of layout nodes. When Compose measures a composable, it starts from the outermost modifier and works inward. This means modifiers that appear first in the chain affect the constraints that inner modifiers receive. In XML, attribute order doesn't matter. In Compose, it changes the result.

The mental model that makes this click: **think of each modifier as a wrapper box.** `Modifier.padding(16.dp).background(Color.Blue)` means "create a padding box (transparent), and inside it, create a background box (blue), and inside that, put the content." You see transparent edges with a blue interior. Reverse the order — `Modifier.background(Color.Blue).padding(16.dp)` — and the blue box wraps the padding box, which wraps the content. Blue extends to the edges.

```kotlin
@Composable
fun ModifierOrderDemo() {
    Column {
        // Background covers the full area, padding is inside
        Text(
            text = "Blue extends to edges",
            modifier = Modifier
                .background(Color.Blue)
                .padding(16.dp)
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Padding first — background only fills the inner space
        Text(
            text = "Blue only behind text",
            modifier = Modifier
                .padding(16.dp)
                .background(Color.Blue)
        )
    }
}
```

The same logic applies to `clickable`, `clip`, and `border`. If you want a rounded blue card with a click ripple that respects the shape, the order is: `clip → background → border → padding → clickable`. `clickable` before `padding` makes the entire area tappable including padding. `clickable` after `padding` only makes the inner content area tappable.

```kotlin
// The canonical modifier order for interactive cards
Modifier
    .clip(RoundedCornerShape(12.dp))    // 1. Define the shape
    .background(Color.White)             // 2. Fill with color (clipped)
    .border(1.dp, Color.Gray,            // 3. Draw border (clipped)
        RoundedCornerShape(12.dp))
    .clickable { onClick() }             // 4. Click target = full shaped area
    .padding(16.dp)                      // 5. Inner content padding
```

**Key takeaway:** Read the modifier chain top-to-bottom as wrapping layers. Order determines behavior for padding, background, clickable, clip, and border. Memorize the canonical order: clip → background → border → clickable → padding.

### Lesson 4.3: Size Modifiers and Constraint Propagation

Compose layouts work on a **constraint system**. Parents pass minimum and maximum width/height constraints to children, and children choose a size within those constraints. Size modifiers work by modifying these constraints before passing them inward. Understanding constraint propagation explains why some size combinations behave unexpectedly.

`Modifier.size(100.dp)` sets both min and max constraints to 100dp, creating a fixed-size box. `Modifier.fillMaxWidth()` sets the minimum width to the maximum available width. `Modifier.wrapContentSize()` resets the minimum constraint to 0, allowing the child to be smaller than the parent's minimum.

```kotlin
@Composable
fun ConstraintDemo() {
    // size(100.dp) fixes constraints — fillMaxSize has no effect
    Box(
        modifier = Modifier
            .size(100.dp)       // min=100, max=100
            .fillMaxSize()      // tries to expand, but max is already 100
            .background(Color.Blue)
    )

    // fillMaxSize first — size(100.dp) can't shrink below min
    Box(
        modifier = Modifier
            .fillMaxSize()      // min=maxAvailable, max=maxAvailable
            .size(100.dp)       // tries to set max=100, but min > 100
            .background(Color.Red)
    )

    // requiredSize ignores parent constraints entirely
    Box(
        modifier = Modifier
            .size(50.dp)
            .requiredSize(200.dp)  // forces 200dp, may overflow
            .background(Color.Green)
    )
}
```

`Modifier.requiredSize()` differs from `Modifier.size()` in a critical way: `size()` respects incoming constraints and clamps to them, while `requiredSize()` ignores incoming constraints and forces the specified size. This means `requiredSize` can cause overflow — the child may be larger than its parent allows. Use it only when you need a specific size regardless of the parent's constraints.

**Key takeaway:** Size modifiers work by transforming constraints passed down the modifier chain. `fillMaxWidth/Height` sets minimums high, `size` sets both min and max, and `requiredSize` ignores parent constraints. Put `fillMaxWidth` early in the chain.

### Lesson 4.4: LazyColumn and LazyRow

`LazyColumn` and `LazyRow` are the Compose equivalents of `RecyclerView`. They only compose and lay out visible items, reusing composition slots as items scroll off-screen. This makes them efficient for lists of any size — from 10 items to 10,000. Understanding how they work internally — and the performance pitfalls that come with misuse — is essential for any production Compose app.

The internal mechanism of `LazyColumn` is fundamentally different from `RecyclerView`. `RecyclerView` recycles View objects — it creates a pool of ViewHolders and rebinds them with new data as items scroll. `LazyColumn` recycles composition slots — as items scroll off the visible area, their composition is disposed (state is discarded), and when new items scroll into view, they are composed from scratch. There is no "view pool" or "rebinding" — each item is a fresh composition. This means `remember` state in lazy items is lost when items scroll off-screen, which is both a feature (no stale state) and a gotcha (state you want preserved must be hoisted).

Always provide stable `key` parameters. Without `key`, Compose uses position-based identity. If items are reordered, deleted, or inserted, position-based identity causes incorrect state preservation — item 3's state ends up on item 4. `key = { it.id }` tells Compose to track items by their unique ID, enabling correct state preservation and efficient diffing.

```kotlin
@Composable
fun MessageList(messages: List<Message>) {
    val listState = rememberLazyListState()

    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Stable keys for efficient recomposition
        items(
            items = messages,
            key = { it.id }
        ) { message ->
            MessageCard(message)
        }

        // Mixed content types
        item { SectionHeader("Messages") }

        stickyHeader { DateHeader("Today") }
    }

    // Scroll to top when new messages arrive
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(0)
        }
    }
}
```

The `contentType` parameter is a performance optimization that most developers overlook. When a `LazyColumn` has multiple item types (posts, ads, headers), `contentType` tells Compose which compositions are structurally similar. Items with the same content type can potentially have their composition slots reused more efficiently, reducing composition overhead during scrolling. Without `contentType`, Compose treats all items as potentially different, which means more composition work when items scroll in and out.

```kotlin
LazyColumn {
    items(
        items = feedItems,
        key = { it.id },
        contentType = { item ->
            when (item) {
                is FeedItem.Post -> "post"
                is FeedItem.Ad -> "ad"
                is FeedItem.Story -> "story"
            }
        }
    ) { item ->
        when (item) {
            is FeedItem.Post -> PostCard(item)
            is FeedItem.Ad -> AdBanner(item)
            is FeedItem.Story -> StoryCard(item)
        }
    }
}
```

Performance considerations for lazy lists are numerous and critical for production apps. First, avoid passing unstable types as item content parameters — use `@Immutable` data classes. Each item composable should be skippable so that when the list recomposes (e.g., a new item is added), existing items that haven't changed are skipped. Second, use `contentType` when your list has multiple item types. Third, avoid nesting scrollable containers in the same direction — a `LazyColumn` inside a `Column(modifier = Modifier.verticalScroll())` is undefined behavior. Fourth, never use `Modifier.fillMaxHeight()` or `Modifier.height(IntrinsicSize.Min)` on items — it forces measurement of all items, defeating the lazy loading purpose.

```kotlin
// ❌ BAD: nesting scrollable containers in the same direction
Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
    // This LazyColumn inside a scrollable Column has undefined behavior
    LazyColumn(modifier = Modifier.height(500.dp)) {
        items(items) { ItemCard(it) }
    }
}

// ✅ GOOD: use a single LazyColumn with mixed content
LazyColumn {
    item { HeaderContent() }
    items(items, key = { it.id }) { ItemCard(it) }
    item { FooterContent() }
}

// ❌ BAD: expensive operations in the item lambda
LazyColumn {
    items(items, key = { it.id }) { item ->
        // This runs during composition on the UI thread
        val bitmap = BitmapFactory.decodeResource(resources, item.imageRes) // ❌
        ImageCard(bitmap)
    }
}

// ✅ GOOD: defer expensive operations
LazyColumn {
    items(items, key = { it.id }) { item ->
        // AsyncImage loads off the main thread
        AsyncImageCard(imageUrl = item.imageUrl)
    }
}
```

For advanced use cases, `LazyListState` provides programmatic control over scroll position. You can read `firstVisibleItemIndex` and `firstVisibleItemScrollOffset` for scroll-linked animations, call `animateScrollToItem` for smooth scrolling, and observe `layoutInfo` for precise information about visible items. All of these are snapshot state, meaning they integrate naturally with Compose's reactivity system.

```kotlin
@Composable
fun SmartList(
    items: ImmutableList<Item>,
    viewModel: ListViewModel
) {
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = viewModel.savedScrollIndex,
        initialFirstVisibleItemScrollOffset = viewModel.savedScrollOffset
    )

    // Save scroll position when it changes
    LaunchedEffect(listState) {
        snapshotFlow {
            listState.firstVisibleItemIndex to
                listState.firstVisibleItemScrollOffset
        }.debounce(300)
         .collect { (index, offset) ->
            viewModel.saveScrollPosition(index, offset)
        }
    }

    // Detect end of list for pagination
    val reachedEnd by remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()
            lastVisibleItem != null && lastVisibleItem.index >= items.size - 5
        }
    }

    LaunchedEffect(reachedEnd) {
        if (reachedEnd) viewModel.loadMore()
    }

    LazyColumn(state = listState) {
        items(items, key = { it.id }) { item ->
            ItemCard(item)
        }
    }
}
```

**Common Pitfalls:**

The biggest performance pitfall is not providing `key`. Without keys, item animations break, swipe-to-dismiss targets the wrong item, and `remember` state drifts when items are reordered. Another common mistake is using `Modifier.animateItem()` (for item animations) without `key` — the animation has nothing to track and produces jarring results. A subtler pitfall is creating new lambda instances for each item's callback without using method references or `remember`. In a list of 100 items, 100 new lambda objects are created on every recomposition, preventing child items from being skipped.

**Key takeaway:** `LazyColumn` only composes visible items. Always use `key` for stable item identity, `contentType` for heterogeneous lists, and stable data types for item parameters.

### Lesson 4.5: Custom Layouts with MeasurePolicy

When `Row`, `Column`, and `Box` aren't enough, the `Layout` composable gives you full control over measurement and placement. But here's the key insight — `Row`, `Column`, and `Box` are themselves just `Layout` calls with different `MeasurePolicy` implementations. The `Layout` composable is the primitive that everything else is built on.

Compose enforces a critical rule: **each child can only be measured once.** This eliminates the O(n²) measurement cascades that plague the View system with nested `LinearLayout` weights. If you need to measure a child, use the constraints you're given, and place the resulting `Placeable`.

```kotlin
@Composable
fun OverlapLayout(
    overlapOffset: Dp = 24.dp,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Layout(
        content = content,
        modifier = modifier
    ) { measurables, constraints ->
        val offsetPx = overlapOffset.roundToPx()
        val placeables = measurables.map { it.measure(constraints) }

        val width = if (placeables.isEmpty()) 0
            else placeables.first().width +
                (placeables.size - 1) * (placeables.first().width - offsetPx)
        val height = placeables.maxOfOrNull { it.height } ?: 0

        layout(width, height) {
            var xPos = 0
            placeables.forEach { placeable ->
                placeable.placeRelative(xPos, 0)
                xPos += placeable.width - offsetPx
            }
        }
    }
}
```

For more complex layouts that need to measure children with different constraints, use `SubcomposeLayout`. It measures children in stages — you can measure the first child, use its size to compute constraints for the second child, and so on. This is how `Scaffold`, `LazyColumn`, and `BoxWithConstraints` work internally.

```kotlin
@Composable
fun HeaderDetailLayout(
    header: @Composable () -> Unit,
    detail: @Composable (headerHeight: Dp) -> Unit,
    modifier: Modifier = Modifier
) {
    SubcomposeLayout(modifier = modifier) { constraints ->
        val headerPlaceables = subcompose("header") { header() }
            .map { it.measure(constraints) }
        val headerHeight = headerPlaceables.maxOfOrNull { it.height } ?: 0

        val detailConstraints = constraints.copy(
            maxHeight = constraints.maxHeight - headerHeight
        )
        val detailPlaceables = subcompose("detail") {
            detail(with(density) { headerHeight.toDp() })
        }.map { it.measure(detailConstraints) }

        layout(constraints.maxWidth, constraints.maxHeight) {
            headerPlaceables.forEach { it.placeRelative(0, 0) }
            detailPlaceables.forEach { it.placeRelative(0, headerHeight) }
        }
    }
}
```

**Key takeaway:** The `Layout` composable gives you full control over measurement and placement. Each child can only be measured once. Use `SubcomposeLayout` when you need to measure children in stages where later measurements depend on earlier results.

### Lesson 4.6: Intrinsic Measurements

Compose's single-measurement rule means a parent can't measure a child, check its size, and then measure it again with different constraints. But sometimes you need to know a child's preferred size before deciding on layout. That's where intrinsic measurements come in.

Intrinsic measurements provide **estimates** of a composable's preferred size without actually measuring it. `IntrinsicSize.Min` asks "what's the minimum width/height you need to display your content?" `IntrinsicSize.Max` asks "what's the maximum width/height you'd use if given unlimited space?" These estimates don't count as actual measurements, so they don't violate the single-measurement rule.

```kotlin
@Composable
fun MatchHeightRow() {
    // Without IntrinsicSize.Min, the divider wouldn't know
    // how tall to be — it needs to match its siblings
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min) // Row height = tallest child's min
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Short text")
        }
        Divider(
            modifier = Modifier
                .fillMaxHeight() // Now works — knows the Row's height
                .width(1.dp),
            color = Color.Gray
        )
        Column(modifier = Modifier.weight(1f)) {
            Text("This is a much longer text that will wrap across multiple lines and make this column taller")
        }
    }
}
```

Intrinsic measurements have a performance cost — they add an extra measurement pass to the layout tree. Use them when you genuinely need cross-child size coordination, but avoid them in frequently-recomposed layouts or deeply nested hierarchies.

**Key takeaway:** Intrinsic measurements let children coordinate sizes without violating the single-measurement rule. Use `IntrinsicSize.Min` to make a parent match its tallest/widest child, but be mindful of the extra measurement pass cost.

### Quiz: Layouts and Modifiers

#### Why does modifier order matter in Compose?

- ❌ It doesn't — Compose sorts modifiers automatically
- ❌ Alphabetical ordering is required for compilation
- ✅ Modifiers are applied outside-in as wrapping layers, so order changes behavior — e.g., padding before vs after background
- ❌ Only the first modifier in the chain is applied

> **Explanation:** Modifiers wrap the composable in layers from top to bottom. `padding` before `background` adds space outside the colored area; `padding` after `background` adds space inside it. Similarly, `clickable` before `clip` vs after `clip` changes the click region shape.

#### Why is it important to provide a `key` parameter in `LazyColumn` items?

- ❌ It improves compile time
- ❌ It is required by the Compose compiler
- ✅ It enables Compose to track item identity across reorderings, deletions, and insertions for efficient recomposition and correct state preservation
- ❌ It adds accessibility labels to each item

> **Explanation:** Without a stable `key`, Compose uses position-based identity. If items are reordered or deleted, Compose may reuse the wrong state for the wrong item. Providing `key = { it.id }` lets Compose track each item uniquely.

#### Why can each child only be measured once in a Compose Layout?

- ❌ It's a limitation that will be removed in future versions
- ❌ Memory constraints prevent multiple measurements
- ✅ It eliminates O(n²) measurement cascades that cause jank in deeply nested layouts
- ❌ The Kotlin language doesn't support multiple measurements

> **Explanation:** In the View system, nested `LinearLayout` weights cause each child to be measured twice, leading to exponential measurement passes. Compose prevents this entirely with the single-measurement rule. If you need size information before measuring, use intrinsic measurements instead.

### Coding Challenge: Flow Layout

Build a `FlowRow` composable that places children in a horizontal flow pattern, wrapping to the next line when children would exceed the available width. Include configurable horizontal and vertical spacing. Test it with a set of tag chips of varying widths.

#### Solution

```kotlin
@Composable
fun FlowRow(
    modifier: Modifier = Modifier,
    horizontalSpacing: Dp = 8.dp,
    verticalSpacing: Dp = 8.dp,
    content: @Composable () -> Unit
) {
    Layout(
        content = content,
        modifier = modifier
    ) { measurables, constraints ->
        val hSpacingPx = horizontalSpacing.roundToPx()
        val vSpacingPx = verticalSpacing.roundToPx()
        val placeables = measurables.map {
            it.measure(constraints.copy(minWidth = 0))
        }

        var xPos = 0
        var yPos = 0
        var rowHeight = 0

        val positions = placeables.map { placeable ->
            if (xPos + placeable.width > constraints.maxWidth && xPos > 0) {
                xPos = 0
                yPos += rowHeight + vSpacingPx
                rowHeight = 0
            }
            val position = IntOffset(xPos, yPos)
            xPos += placeable.width + hSpacingPx
            rowHeight = maxOf(rowHeight, placeable.height)
            position
        }

        val totalHeight = yPos + rowHeight
        layout(constraints.maxWidth, totalHeight) {
            placeables.forEachIndexed { index, placeable ->
                placeable.placeRelative(positions[index])
            }
        }
    }
}

// Usage
@Composable
fun TagDemo() {
    val tags = listOf("Kotlin", "Compose", "Android", "Jetpack",
        "Material 3", "Performance", "Testing", "Architecture")
    FlowRow(horizontalSpacing = 8.dp, verticalSpacing = 8.dp) {
        tags.forEach { tag ->
            Text(
                text = tag,
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}
```

This solution demonstrates a custom `Layout` with constraint handling, position tracking, and line wrapping. Children are measured with relaxed constraints (`minWidth = 0`) to allow them to be their natural size, then placed in a flow pattern with configurable spacing.

---

## Module 5: Theming, Styling, and CompositionLocal

### Lesson 5.1: Material 3 Theming

Material 3 theming in Compose uses `MaterialTheme` to provide colors, typography, and shapes throughout the composition tree. Unlike XML themes that use style resources, Compose themes are Kotlin code — fully type-safe and composable. The theming system is built on `CompositionLocal` (covered in Lesson 5.2), which means theme values are implicitly available to every composable in the tree without explicit parameter passing. This is the declarative equivalent of XML's theme attribute system, but with compile-time safety and full Kotlin expressiveness.

The `MaterialTheme` composable uses `CompositionLocal` under the hood to provide theme values. Any composable in the tree can access them via `MaterialTheme.colorScheme`, `MaterialTheme.typography`, and `MaterialTheme.shapes`. This replaces the XML-based `R.style` and `R.color` approach entirely. The key advantage is that theme values are resolved at composition time, not at inflation time — meaning you can dynamically switch themes without recreating the Activity. Dark mode, dynamic color, and user-selectable themes all become trivial.

The Material 3 color system is built on the concept of **tonal palettes** — a set of colors generated from a seed color using the HCT (Hue, Chroma, Tone) color space. Each seed color generates a palette of 13 tones (0-100), and these tones are mapped to semantic roles like `primary`, `onPrimary`, `primaryContainer`, and `onPrimaryContainer`. The "on" prefix indicates a color suitable for text and icons placed on top of the corresponding surface color. The "container" suffix indicates a less prominent variant used for backgrounds of interactive elements.

On Android 12+, dynamic color theming extracts the seed color from the user's wallpaper. This creates a deeply personalized experience where your app's color scheme harmonizes with the user's device. Compose makes this trivial with `dynamicLightColorScheme()` and `dynamicDarkColorScheme()`.

```kotlin
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        // Dynamic color on Android 12+
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> darkColorScheme(
            primary = Color(0xFF60A5FA),
            secondary = Color(0xFFA78BFA),
            background = Color(0xFF111827),
            surface = Color(0xFF1F2937),
            onPrimary = Color.White,
            onBackground = Color(0xFFF9FAFB)
        )
        else -> lightColorScheme(
            primary = Color(0xFF3B82F6),
            secondary = Color(0xFF8B5CF6),
            background = Color(0xFFF9FAFB),
            surface = Color.White
        )
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(
            headlineLarge = TextStyle(
                fontFamily = FontFamily(Font(R.font.inter_bold)),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold
            ),
            bodyLarge = TextStyle(
                fontFamily = FontFamily(Font(R.font.inter_regular)),
                fontSize = 16.sp,
                lineHeight = 24.sp
            )
        ),
        content = content
    )
}

// Access theme values anywhere in the tree
@Composable
fun ThemedCard(title: String) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        shape = MaterialTheme.shapes.medium
    ) {
        Text(
            title,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(16.dp)
        )
    }
}
```

The Material 3 color system uses **color roles** rather than specific colors. `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer` — each role has a semantic meaning. The system automatically generates tonal palettes from a seed color. When designing a custom theme, define the seed colors and let the system generate the full palette, or override individual roles for precise control.

Typography in Material 3 uses a simplified scale compared to Material 2. The five categories are: Display (3 sizes), Headline (3 sizes), Title (3 sizes), Body (3 sizes), and Label (3 sizes) — 15 text styles total. Each style specifies font family, size, weight, letter spacing, and line height. In production, you'll typically customize a subset of these styles and let the rest use Material defaults.

```kotlin
// Creating a complete custom typography scale
val AppTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = InterFamily,
        fontSize = 57.sp,
        lineHeight = 64.sp,
        letterSpacing = (-0.25).sp
    ),
    headlineMedium = TextStyle(
        fontFamily = InterFamily,
        fontSize = 28.sp,
        lineHeight = 36.sp
    ),
    titleLarge = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 28.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = InterFamily,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp
    ),
    labelSmall = TextStyle(
        fontFamily = InterFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
)
```

**Common Pitfalls:**

The most common theming pitfall is hardcoding colors instead of using `MaterialTheme.colorScheme`. Hardcoded colors don't adapt to dark mode, dynamic color, or theme changes. Another pitfall is ignoring the "on" color roles — using `Color.White` for text on a `primary` background instead of `MaterialTheme.colorScheme.onPrimary`. The "on" colors are calculated for sufficient contrast ratio. A third pitfall is not testing with dark theme, large font sizes (accessibility), and different device sizes. Use `@Preview` annotations with `uiMode = UI_MODE_NIGHT_YES` and `fontScale = 2f` to catch visual regressions early.

**Key takeaway:** Use `MaterialTheme` for consistent styling. Access colors via `MaterialTheme.colorScheme`, typography via `MaterialTheme.typography`. The color system uses semantic roles, not arbitrary color names.

### Lesson 5.2: CompositionLocal

`CompositionLocal` passes data implicitly through the composition tree without threading it through every composable's parameters. It's the mechanism that powers `MaterialTheme`, `LocalContext`, `LocalLifecycleOwner`, and other framework-provided values. You can create your own for app-specific cross-cutting concerns.

There are two ways to create a `CompositionLocal`: `compositionLocalOf` and `staticCompositionLocalOf`. The difference is in how they handle changes. `compositionLocalOf` tracks reads and only recomposes composables that read the value when it changes. `staticCompositionLocalOf` recomposes the entire subtree when the value changes — cheaper if the value rarely changes but expensive if it changes often.

```kotlin
// Define a CompositionLocal
val LocalSpacing = compositionLocalOf { Spacing() }
val LocalAnalytics = staticCompositionLocalOf<Analytics> {
    error("No Analytics provided")
}

data class Spacing(
    val small: Dp = 4.dp,
    val medium: Dp = 8.dp,
    val large: Dp = 16.dp,
    val extraLarge: Dp = 24.dp
)

// Provide values at the top of the tree
@Composable
fun AppTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalSpacing provides Spacing(),
        LocalAnalytics provides AnalyticsImpl()
    ) {
        MaterialTheme(content = content)
    }
}

// Consume anywhere below the provider
@Composable
fun CardContent() {
    val spacing = LocalSpacing.current
    val analytics = LocalAnalytics.current

    Column(modifier = Modifier.padding(spacing.large)) {
        Text("Title", modifier = Modifier.padding(bottom = spacing.medium))
        Text("Body")
    }
}
```

Use `CompositionLocal` sparingly. It creates implicit dependencies that make composables harder to understand and test. Explicit parameters are almost always better. Good candidates for `CompositionLocal` are truly cross-cutting concerns: spacing/dimensions, analytics, feature flags, locale, theme extensions.

**Key takeaway:** `CompositionLocal` passes data implicitly through the tree. Use `compositionLocalOf` when the value changes frequently, `staticCompositionLocalOf` when it rarely changes. Prefer explicit parameters for most data passing.

### Lesson 5.3: Custom Design Systems

For production apps, the Material theme alone isn't enough. You need a custom design system that extends Material with app-specific tokens — custom spacing scales, elevation styles, animation durations, and component styles. The pattern is to create custom `CompositionLocal` values alongside `MaterialTheme`.

```kotlin
data class AppDimensions(
    val cardElevation: Dp = 4.dp,
    val iconSize: Dp = 24.dp,
    val borderRadius: Dp = 12.dp,
    val listItemHeight: Dp = 56.dp,
    val toolbarHeight: Dp = 64.dp
)

data class AppAnimations(
    val short: Int = 150,
    val medium: Int = 300,
    val long: Int = 500,
    val stiffness: Float = Spring.StiffnessMedium
)

val LocalAppDimensions = compositionLocalOf { AppDimensions() }
val LocalAppAnimations = compositionLocalOf { AppAnimations() }

object AppTheme {
    val dimensions: AppDimensions
        @Composable get() = LocalAppDimensions.current
    val animations: AppAnimations
        @Composable get() = LocalAppAnimations.current
    val colors: ColorScheme
        @Composable get() = MaterialTheme.colorScheme
    val typography: Typography
        @Composable get() = MaterialTheme.typography
}

@Composable
fun AppThemeWrapper(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    CompositionLocalProvider(
        LocalAppDimensions provides AppDimensions(),
        LocalAppAnimations provides AppAnimations()
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme(),
            content = content
        )
    }
}

// Usage — clean, consistent access
@Composable
fun DesignSystemCard(title: String) {
    Card(
        elevation = CardDefaults.cardElevation(
            defaultElevation = AppTheme.dimensions.cardElevation
        ),
        shape = RoundedCornerShape(AppTheme.dimensions.borderRadius)
    ) {
        Text(title, style = AppTheme.typography.titleMedium,
            modifier = Modifier.padding(AppTheme.dimensions.cardElevation))
    }
}
```

**Key takeaway:** Extend Material theming with custom `CompositionLocal` values for app-specific design tokens. Create an `AppTheme` object with computed properties for clean access. Keep tokens centralized so design changes propagate automatically.

### Quiz: Theming and Styling

#### What is the difference between `compositionLocalOf` and `staticCompositionLocalOf`?

- ❌ `compositionLocalOf` is for primitives, `staticCompositionLocalOf` is for objects
- ❌ They are identical in behavior
- ✅ `compositionLocalOf` only recomposes readers when the value changes, while `staticCompositionLocalOf` recomposes the entire subtree
- ❌ `staticCompositionLocalOf` is thread-safe, `compositionLocalOf` is not

> **Explanation:** `compositionLocalOf` tracks which composables read the value and only recomposes those when it changes. `staticCompositionLocalOf` doesn't track reads — it recomposes the entire subtree below the provider. Use `staticCompositionLocalOf` for values that rarely change (analytics, feature flags) and `compositionLocalOf` for values that change more frequently (theme, spacing).

#### How does `MaterialTheme` provide colors to the entire composition tree?

- ❌ Through global variables
- ❌ Through Android resources
- ✅ Through `CompositionLocal` — it provides `ColorScheme`, `Typography`, and `Shapes` implicitly through the tree
- ❌ Through dependency injection

> **Explanation:** `MaterialTheme` uses `CompositionLocalProvider` internally to make `colorScheme`, `typography`, and `shapes` available throughout the composition tree. Any composable can access them via `MaterialTheme.colorScheme`, `MaterialTheme.typography`, etc., without explicit parameter passing.

### Coding Challenge: Multi-Variant Theme

Create a theme system that supports three visual variants: "Default," "Compact" (smaller spacing, denser layout), and "Comfortable" (larger spacing, more breathing room). Each variant should adjust dimensions (padding, icon sizes, card elevation) through a custom `CompositionLocal`. Build a `ThemeSwitcher` composable that lets the user cycle through variants and a `SampleCard` that adapts to the current variant.

#### Solution

```kotlin
enum class ThemeVariant { DEFAULT, COMPACT, COMFORTABLE }

data class VariantDimensions(
    val padding: Dp,
    val iconSize: Dp,
    val cardElevation: Dp,
    val spacing: Dp
)

val LocalVariantDimensions = compositionLocalOf { defaultDimensions }

private val defaultDimensions = VariantDimensions(16.dp, 24.dp, 4.dp, 12.dp)
private val compactDimensions = VariantDimensions(8.dp, 20.dp, 2.dp, 6.dp)
private val comfortableDimensions = VariantDimensions(24.dp, 32.dp, 8.dp, 20.dp)

@Composable
fun VariantTheme(
    variant: ThemeVariant,
    content: @Composable () -> Unit
) {
    val dimensions = when (variant) {
        ThemeVariant.DEFAULT -> defaultDimensions
        ThemeVariant.COMPACT -> compactDimensions
        ThemeVariant.COMFORTABLE -> comfortableDimensions
    }
    CompositionLocalProvider(LocalVariantDimensions provides dimensions) {
        MaterialTheme(content = content)
    }
}

@Composable
fun ThemeSwitcher() {
    var variant by remember { mutableStateOf(ThemeVariant.DEFAULT) }

    VariantTheme(variant = variant) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ThemeVariant.entries.forEach { v ->
                    FilterChip(
                        selected = variant == v,
                        onClick = { variant = v },
                        label = { Text(v.name) }
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            SampleCard(title = "Adaptive Card", subtitle = "Responds to theme variant")
        }
    }
}

@Composable
fun SampleCard(title: String, subtitle: String) {
    val dims = LocalVariantDimensions.current
    Card(
        elevation = CardDefaults.cardElevation(dims.cardElevation),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(dims.padding),
            horizontalArrangement = Arrangement.spacedBy(dims.spacing),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Star, contentDescription = null,
                modifier = Modifier.size(dims.iconSize))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
```

This solution uses a custom `CompositionLocal` to propagate variant-specific dimensions. The `SampleCard` adapts automatically to the current variant without any conditional logic — it reads dimensions from the `CompositionLocal` and the theme system handles the rest.

---

## Module 6: Navigation

### Lesson 6.1: Compose Navigation Basics

Compose Navigation manages screen transitions with a `NavController` and `NavHost`. The `NavHost` composable acts as a container that swaps composable destinations based on the current route. Each destination is defined by a route string and a composable lambda. Navigation in Compose follows the same fundamental principles as Fragment-based navigation but uses composable functions instead of Fragments as destinations.

The key architectural principle is that **screens should not hold a reference to NavController**. Instead, screens receive navigation callbacks as parameters and the navigation logic stays in the `NavHost` setup. This keeps screens testable and decoupled from the navigation framework. If a screen composable takes a `NavController` parameter, it becomes impossible to test without mocking the entire navigation stack. By passing callbacks, you can test the screen with `setContent { ProfileScreen(state, onNavigate = { captured = it }) }`.

Internally, `NavHost` uses `SubcomposeLayout` and `AnimatedContent` to swap between destinations. Each destination's composable content is composed when navigated to and disposed when navigated away from (unless `saveState` is used). The `NavController` manages the back stack as a list of `NavBackStackEntry` objects, each holding the route, arguments, and lifecycle state for that destination.

```kotlin
@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(
                onNavigateToProfile = { userId ->
                    navController.navigate("profile/$userId")
                },
                onNavigateToSettings = {
                    navController.navigate("settings")
                }
            )
        }
        composable(
            route = "profile/{userId}",
            arguments = listOf(navArgument("userId") {
                type = NavType.StringType
            })
        ) { backStackEntry ->
            val userId = backStackEntry.arguments?.getString("userId")
                ?: return@composable
            ProfileScreen(
                userId = userId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
```

Arguments can be required (path parameters) or optional (query parameters). Path parameters like `profile/{userId}` are embedded in the route string. Optional parameters use query-style syntax: `search?query={query}&filter={filter}`. Default values can be specified in the `navArgument` builder. This mirrors REST URL patterns and is intuitive for web developers.

```kotlin
composable(
    route = "search?query={query}&category={category}",
    arguments = listOf(
        navArgument("query") {
            type = NavType.StringType
            defaultValue = ""
        },
        navArgument("category") {
            type = NavType.StringType
            defaultValue = "all"
            nullable = true
        }
    )
) { backStackEntry ->
    val query = backStackEntry.arguments?.getString("query") ?: ""
    val category = backStackEntry.arguments?.getString("category") ?: "all"
    SearchScreen(initialQuery = query, initialCategory = category)
}

// Navigating with optional arguments
navController.navigate("search?query=kotlin&category=tutorials")
navController.navigate("search") // uses defaults
```

Each `NavBackStackEntry` has its own `LifecycleOwner`, `ViewModelStoreOwner`, and `SavedStateRegistryOwner`. This means ViewModels created with `viewModel()` inside a composable destination are scoped to that destination's back stack entry. When the user navigates back (pops the entry), the ViewModel is cleared. This scoping is automatic and is one of the key benefits of the Navigation library — you don't need to manually manage ViewModel lifecycle.

```kotlin
composable("profile/{userId}") { backStackEntry ->
    // This ViewModel is scoped to this back stack entry
    // It's created when navigating to this destination
    // and cleared when navigating back
    val viewModel: ProfileViewModel = viewModel()

    // For shared ViewModels between destinations, scope to the nav graph
    val sharedViewModel: SharedViewModel = viewModel(
        viewModelStoreOwner = backStackEntry.rememberParentEntry(navController)
    )

    ProfileScreen(viewModel = viewModel)
}
```

**Common Pitfalls:**

The most common navigation pitfall is passing `NavController` to screen composables, creating tight coupling. Another pitfall is navigating multiple times from rapid clicks — tapping a button twice can create duplicate destinations. Use `launchSingleTop = true` or debounce clicks to prevent this. A third pitfall is encoding complex objects in route strings. Routes should contain IDs, not full objects. Pass an ID, then let the ViewModel fetch the full object. Serializing large objects in route strings can crash with `TransactionTooLargeException`. Finally, forgetting that `popBackStack()` returns a `Boolean` indicating success — if the stack is empty, it returns false and does nothing, which can confuse developers who expect it to close the Activity.

**Key takeaway:** Use `NavHost` as the navigation container, define routes with `composable`, and pass navigation actions as callbacks to keep screens decoupled from `NavController`.

### Lesson 6.2: Type-Safe Navigation

String-based routes like `"profile/$userId"` are error-prone — typos, missing arguments, and type mismatches only crash at runtime. Type-safe navigation uses Kotlin Serialization and sealed types to catch errors at compile time.

```kotlin
@Serializable
sealed class Route {
    @Serializable
    data object Home : Route()

    @Serializable
    data class Profile(val userId: String) : Route()

    @Serializable
    data class Settings(val section: String = "general") : Route()
}

@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Route.Home) {
        composable<Route.Home> {
            HomeScreen(
                onNavigateToProfile = { userId ->
                    navController.navigate(Route.Profile(userId))
                }
            )
        }
        composable<Route.Profile> { backStackEntry ->
            val route = backStackEntry.toRoute<Route.Profile>()
            ProfileScreen(userId = route.userId)
        }
    }
}
```

Type-safe navigation eliminates entire categories of bugs. The compiler enforces that all required arguments are provided, types are correct, and routes are exhaustive. Default values in data class parameters create optional arguments automatically. This is especially valuable as the number of screens and arguments grows.

**Key takeaway:** Use type-safe navigation with Kotlin Serialization to catch route and argument errors at compile time. Each route becomes a data class with typed, validated parameters.

### Lesson 6.3: Navigation State and Back Stack

The navigation back stack is a stack of destinations that the user has visited. Understanding how `navigate`, `popBackStack`, and `launchSingleTop` interact prevents common navigation bugs like duplicate screens and broken back button behavior.

```kotlin
// Common navigation patterns
navController.navigate(Route.Profile(userId)) {
    // Pop up to home, removing everything in between
    popUpTo(Route.Home) { inclusive = false }

    // Avoid duplicate destinations on the back stack
    launchSingleTop = true

    // Restore state when re-navigating to a destination
    restoreState = true
}

// Bottom navigation pattern — save and restore state per tab
navController.navigate(tab.route) {
    popUpTo(navController.graph.findStartDestination().id) {
        saveState = true
    }
    launchSingleTop = true
    restoreState = true
}
```

**Key takeaway:** Use `popUpTo` to control back stack cleanup, `launchSingleTop` to prevent duplicates, and `saveState`/`restoreState` for tab-based navigation. Keep navigation logic in the NavHost setup, not in individual screens.

### Quiz: Navigation

#### What is the main advantage of type-safe navigation over string-based routes?

- ❌ It runs faster at runtime
- ❌ It uses less memory
- ✅ It catches route and argument errors at compile time instead of runtime
- ❌ It is required by the Compose Navigation library

> **Explanation:** String-based routes like `"profile/$userId"` can have typos, missing arguments, or type mismatches that only crash at runtime. Type-safe navigation uses sealed classes and data classes, so the compiler catches errors during compilation.

#### What does `launchSingleTop = true` do in a navigation call?

- ❌ It opens the destination in a new window
- ❌ It always creates a new instance of the destination
- ✅ It prevents creating a duplicate of the destination if it's already on top of the back stack
- ❌ It clears the entire back stack

> **Explanation:** `launchSingleTop = true` checks if the destination is already at the top of the back stack. If it is, instead of adding another copy, it reuses the existing one. This prevents the common bug of tapping a navigation button multiple times and getting duplicate screens.

### Coding Challenge: Tab Navigation

Build a three-tab navigation setup (Home, Search, Profile) with a bottom navigation bar. Each tab should maintain its own back stack state when switching between tabs. Use type-safe routes with sealed classes.

#### Solution

```kotlin
@Serializable
sealed class TabRoute {
    @Serializable data object Home : TabRoute()
    @Serializable data object Search : TabRoute()
    @Serializable data object Profile : TabRoute()
}

@Composable
fun TabApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            NavigationBar {
                val tabs = listOf(
                    TabRoute.Home to Icons.Default.Home,
                    TabRoute.Search to Icons.Default.Search,
                    TabRoute.Profile to Icons.Default.Person
                )
                tabs.forEach { (route, icon) ->
                    NavigationBarItem(
                        selected = currentRoute == route::class.qualifiedName,
                        onClick = {
                            navController.navigate(route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(icon, contentDescription = null) },
                        label = { Text(route::class.simpleName ?: "") }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(navController, startDestination = TabRoute.Home,
            modifier = Modifier.padding(padding)) {
            composable<TabRoute.Home> { Text("Home", modifier = Modifier.padding(16.dp)) }
            composable<TabRoute.Search> { Text("Search", modifier = Modifier.padding(16.dp)) }
            composable<TabRoute.Profile> { Text("Profile", modifier = Modifier.padding(16.dp)) }
        }
    }
}
```

This solution demonstrates tab navigation with state preservation. Each tab maintains its own back stack through `saveState` and `restoreState`. `launchSingleTop` prevents duplicate tab instances.

---

## Module 7: Animations

Compose's animation system is built on a single concept: **an animation is a value that changes over time, and Compose recomposes the UI whenever that value changes.** Every API — from simple `animateColorAsState` to complex `Animatable` — produces a changing value and lets recomposition handle the rendering.

### Lesson 7.1: animate*AsState — Fire and Forget

`animate*AsState` functions are the simplest animation API. You give them a target value, and they animate from the current value to the target whenever the target changes. They return a `State<T>` that Compose reads during recomposition. Interruptions are handled automatically — if the target changes mid-animation, the animation reverses from its current position. This "fire and forget" nature makes them the default choice for most UI animations.

The family includes `animateFloatAsState`, `animateDpAsState`, `animateColorAsState`, `animateIntAsState`, `animateOffsetAsState`, `animateSizeAsState`, and more. For custom types, `animateValueAsState` with a `TwoWayConverter` handles arbitrary types. Each function follows the same pattern: provide a target value, optionally specify an `animationSpec`, and receive a `State` that smoothly transitions.

Internally, `animate*AsState` creates an `Animatable` (Lesson 7.5), remembers it, and launches a coroutine in a `LaunchedEffect` keyed to the target value. When the target changes, the `LaunchedEffect` cancels the previous animation and starts a new one toward the new target. This is why interruptions work seamlessly — the `Animatable` preserves its current velocity when redirected, creating physically plausible motion.

```kotlin
@Composable
fun ExpandableCard(isExpanded: Boolean, title: String, content: String) {
    val elevation by animateDpAsState(
        targetValue = if (isExpanded) 8.dp else 2.dp,
        animationSpec = tween(durationMillis = 300),
        label = "cardElevation"
    )
    val backgroundColor by animateColorAsState(
        targetValue = if (isExpanded) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
        animationSpec = tween(durationMillis = 300),
        label = "cardBackground"
    )

    Card(
        modifier = Modifier.fillMaxWidth().shadow(elevation, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = backgroundColor)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            AnimatedVisibility(visible = isExpanded) {
                Text(content, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}
```

The `label` parameter is used by Animation Preview in Android Studio and Layout Inspector to identify animations. Always include it — debugging unnamed animations in the inspector is painful. Labels should be descriptive enough to identify the animation in a list of many: "cardElevation" is better than "dp" or "animation1".

For performance, consider where the animated value is consumed. If an animated float is read directly in the composition body, every animation frame triggers recomposition. If it's read inside `graphicsLayer {}`, only the drawing phase runs. This is the same phase-optimization from Lesson 1.4, applied to animations:

```kotlin
// ❌ Animated value read in Composition — all 3 phases on every frame
@Composable
fun PulsingDot(isActive: Boolean) {
    val scale by animateFloatAsState(
        targetValue = if (isActive) 1.2f else 1f,
        label = "scale"
    )
    Box(
        modifier = Modifier
            .size((12 * scale).dp) // Read in Composition → triggers Layout
            .background(Color.Green, CircleShape)
    )
}

// ✅ Animated value read in Drawing — only draw phase
@Composable
fun PulsingDotOptimized(isActive: Boolean) {
    val scale by animateFloatAsState(
        targetValue = if (isActive) 1.2f else 1f,
        label = "scale"
    )
    Box(
        modifier = Modifier
            .size(12.dp)
            .graphicsLayer {
                scaleX = scale // Read in Drawing phase
                scaleY = scale
            }
            .background(Color.Green, CircleShape)
    )
}
```

For animating custom types that don't have a built-in `animate*AsState` variant, use `animateValueAsState` with a `TwoWayConverter`. The converter defines how to convert your type to and from an `AnimationVector` — the internal representation that the animation system uses for interpolation.

```kotlin
// Custom type animation
data class PolarCoordinate(val radius: Float, val angle: Float)

val PolarConverter = TwoWayConverter<PolarCoordinate, AnimationVector2D>(
    convertToVector = { AnimationVector2D(it.radius, it.angle) },
    convertFromVector = { PolarCoordinate(it.v1, it.v2) }
)

@Composable
fun AnimatedPolarDot(target: PolarCoordinate) {
    val current by animateValueAsState(
        targetValue = target,
        typeConverter = PolarConverter,
        label = "polarPosition"
    )

    Canvas(modifier = Modifier.size(200.dp)) {
        val x = center.x + current.radius * cos(current.angle)
        val y = center.y + current.radius * sin(current.angle)
        drawCircle(Color.Blue, radius = 8f, center = Offset(x, y))
    }
}
```

**Common Pitfalls:**

The most common mistake is animating values that trigger expensive recomposition. If your animated float is used to compute the content of a composable (like selecting different items based on a float threshold), every animation frame triggers full recomposition. Another pitfall is creating multiple independent `animate*AsState` calls for properties that should be coordinated — use `updateTransition` (Lesson 7.4) instead to keep them synchronized. Finally, forgetting the `label` parameter makes debugging animations nearly impossible in the Layout Inspector.

**Key takeaway:** `animate*AsState` is the simplest animation API. Provide a target value and an optional `animationSpec`. Interruptions are handled automatically. Always include a `label` for debugging.

### Lesson 7.2: AnimatedVisibility — Enter and Exit Transitions

`AnimatedVisibility` wraps a composable and animates its appearance and disappearance. Enter and exit transitions compose with the `+` operator, and each transition can have its own `animationSpec`.

```kotlin
@Composable
fun NotificationBanner(
    message: String,
    isVisible: Boolean,
    onDismiss: () -> Unit
) {
    AnimatedVisibility(
        visible = isVisible,
        enter = slideInVertically(
            initialOffsetY = { -it },
            animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy)
        ) + fadeIn(animationSpec = tween(300)),
        exit = slideOutVertically(
            targetOffsetY = { -it },
            animationSpec = tween(200)
        ) + fadeOut(animationSpec = tween(200))
    ) {
        Card(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.tertiaryContainer
            )
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(message, modifier = Modifier.weight(1f))
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Dismiss")
                }
            }
        }
    }
}
```

The full set of transitions: **Enter** — `fadeIn`, `slideIn`, `slideInHorizontally`, `slideInVertically`, `expandIn`, `expandHorizontally`, `expandVertically`, `scaleIn`. **Exit** — `fadeOut`, `slideOut`, `slideOutHorizontally`, `slideOutVertically`, `shrinkOut`, `shrinkHorizontally`, `shrinkVertically`, `scaleOut`. Each can have its own animation spec — the slide can use a spring while the fade uses a tween.

**Key takeaway:** `AnimatedVisibility` animates composable entry and exit. Combine transitions with `+`. Each transition can have an independent `animationSpec` for fine-grained control.

### Lesson 7.3: AnimatedContent and Crossfade

`AnimatedContent` is like `AnimatedVisibility` but for content that changes — it animates the transition between different content states. `Crossfade` is a simpler variant that only fades between content.

```kotlin
@Composable
fun StateSwitcher(state: UiState) {
    AnimatedContent(
        targetState = state,
        transitionSpec = {
            if (targetState is UiState.Success) {
                slideInVertically { it } + fadeIn() togetherWith
                    slideOutVertically { -it } + fadeOut()
            } else {
                fadeIn(tween(300)) togetherWith fadeOut(tween(300))
            }
        },
        label = "stateTransition"
    ) { targetState ->
        when (targetState) {
            UiState.Loading -> LoadingView()
            is UiState.Success -> ContentView(targetState.data)
            is UiState.Error -> ErrorView(targetState.message)
        }
    }
}

// Crossfade — simpler, only fades
@Composable
fun TabContent(selectedTab: Tab) {
    Crossfade(
        targetState = selectedTab,
        animationSpec = tween(300),
        label = "tabCrossfade"
    ) { tab ->
        when (tab) {
            Tab.HOME -> HomeContent()
            Tab.SEARCH -> SearchContent()
            Tab.PROFILE -> ProfileContent()
        }
    }
}
```

**Key takeaway:** `AnimatedContent` provides full control over how content transitions between states. `Crossfade` is a simpler alternative that only fades. Use `AnimatedContent` when you need directional transitions (slide in from bottom, slide out to top).

### Lesson 7.4: Transition API — Coordinated Animations

`updateTransition` coordinates multiple animated properties that share the same state trigger. Instead of independent `animate*AsState` calls that might drift out of sync, a transition groups related animations into a single coordinated unit.

```kotlin
@Composable
fun PulsingStatusDot(isActive: Boolean) {
    val transition = updateTransition(targetState = isActive, label = "status")

    val scale by transition.animateFloat(label = "scale") { active ->
        if (active) 1.2f else 1f
    }
    val alpha by transition.animateFloat(label = "alpha") { active ->
        if (active) 1f else 0.5f
    }
    val color by transition.animateColor(label = "color") { active ->
        if (active) Color.Green else Color.Gray
    }

    Box(
        modifier = Modifier
            .size(12.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            }
            .background(color, CircleShape)
    )
}
```

For staggered animations, use different `transitionSpec` for each animated property with `delayMillis`.

```kotlin
@Composable
fun ExpandableFab(expanded: Boolean) {
    val transition = updateTransition(targetState = expanded, label = "fab")

    val rotation by transition.animateFloat(label = "rotation") { isExpanded ->
        if (isExpanded) 45f else 0f
    }

    val actions = listOf("Edit", "Share", "Delete")
    Column(horizontalAlignment = Alignment.End) {
        actions.forEachIndexed { index, label ->
            val scale by transition.animateFloat(
                label = "scale_$index",
                transitionSpec = {
                    if (targetState) tween(200, delayMillis = index * 60)
                    else tween(150)
                }
            ) { isExpanded -> if (isExpanded) 1f else 0f }

            if (scale > 0f) {
                Text(label, modifier = Modifier.scale(scale).alpha(scale))
            }
        }

        FloatingActionButton(onClick = { }) {
            Icon(Icons.Default.Add, "Expand",
                modifier = Modifier.rotate(rotation))
        }
    }
}
```

**Key takeaway:** `updateTransition` coordinates multiple animations with the same state trigger. Use per-property `transitionSpec` with `delayMillis` for staggered animations. Prefer `graphicsLayer` for scale and alpha to keep animations in the draw phase.

### Lesson 7.5: Animatable — Full Control

`Animatable` gives you programmatic control over animations — you can animate to values, snap to values, check bounds, and respond to velocity. It's used inside `LaunchedEffect` for gesture-driven animations and complex sequences.

```kotlin
@Composable
fun SwipeToDismiss(
    onDismissed: () -> Unit,
    content: @Composable () -> Unit
) {
    val offsetX = remember { Animatable(0f) }
    val dismissThreshold = 300f

    Box(
        modifier = Modifier
            .offset { IntOffset(offsetX.value.roundToInt(), 0) }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        if (abs(offsetX.value) > dismissThreshold) {
                            // Fling off screen
                            val target = if (offsetX.value > 0) size.width.toFloat()
                                else -size.width.toFloat()
                            // animateTo in a launched effect
                        } else {
                            // Snap back
                        }
                    },
                    onHorizontalDrag = { _, dragAmount ->
                        // Update offset during drag
                    }
                )
            }
            .graphicsLayer {
                alpha = 1f - (abs(offsetX.value) / (dismissThreshold * 2))
                    .coerceIn(0f, 1f)
            }
    ) {
        content()
    }

    LaunchedEffect(Unit) {
        // Handle animation after gesture ends
        snapshotFlow { offsetX.value }
            .collect { offset ->
                if (abs(offset) > dismissThreshold * 2) {
                    onDismissed()
                }
            }
    }
}
```

`Animatable` respects bounds — you can set `lowerBound` and `upperBound` to prevent overscroll. It also tracks velocity, which is essential for fling gestures. When you call `animateDecay`, it uses the current velocity to compute a natural deceleration. This is how `SwipeToDismiss`, `Pager`, and `BottomSheet` implementations work internally.

**Key takeaway:** `Animatable` provides programmatic animation control — animate to values, snap, respect bounds, and track velocity. Use it inside `LaunchedEffect` for gesture-driven and sequenced animations.

### Lesson 7.6: Animation Specs Deep Dive

Animation specs control the timing and easing of animations. Choosing the right spec for the right situation makes the difference between animations that feel natural and ones that feel mechanical.

`tween` creates a duration-based animation with easing. The default easing is `FastOutSlowInEasing` (Material standard). `spring` creates a physics-based animation with configurable damping and stiffness — it has no fixed duration and naturally settles. `keyframes` defines specific values at specific time points. `repeatable` and `infiniteRepeatable` loop animations.

```kotlin
// Spring — natural feel, automatic duration
animationSpec = spring(
    dampingRatio = Spring.DampingRatioMediumBouncy,  // 0.5 = bouncy
    stiffness = Spring.StiffnessMedium               // 1500 = medium
)

// Tween — precise duration, eased
animationSpec = tween(
    durationMillis = 300,
    delayMillis = 0,
    easing = FastOutSlowInEasing
)

// Keyframes — specific values at specific times
animationSpec = keyframes {
    durationMillis = 1000
    0f at 0 using LinearEasing
    0.5f at 300 using FastOutSlowInEasing
    1f at 700
    0.8f at 1000  // slight overshoot settle
}

// Infinite repeat
animationSpec = infiniteRepeatable(
    animation = tween(1000, easing = LinearEasing),
    repeatMode = RepeatMode.Reverse
)
```

Rule of thumb: use **spring** for user-initiated interactions (taps, swipes) because springs handle interruptions naturally. Use **tween** for state-driven transitions (loading → success) where you want precise timing. Use **keyframes** for complex multi-step animations. Use **infiniteRepeatable** for loading indicators and attention-drawing effects.

**Key takeaway:** `spring` for interactive animations (natural interruption handling), `tween` for state transitions (precise timing), `keyframes` for multi-step sequences, `infiniteRepeatable` for continuous effects. Spring is the safest default.

### Quiz: Animations

#### What makes `updateTransition` different from multiple `animate*AsState` calls?

- ❌ It's faster at runtime
- ❌ It only works with boolean states
- ✅ It coordinates multiple animations under a single state trigger, ensuring they stay synchronized
- ❌ It replaces the need for `AnimatedVisibility`

> **Explanation:** `updateTransition` creates a single transition object that coordinates multiple animated properties — like scale, alpha, and color — all driven by the same target state. Individual `animate*AsState` calls are independent and could potentially drift during interruptions.

#### When should you use `spring` over `tween` for animations?

- ❌ When you need a fixed duration
- ✅ When the animation is user-initiated (taps, swipes) because springs handle interruptions naturally without fixed duration
- ❌ When animating colors
- ❌ When you need keyframe control

> **Explanation:** Springs have no fixed duration — they naturally settle based on physics. This means if a spring animation is interrupted mid-flight, it seamlessly transitions to the new target using its current velocity. Tweens, with their fixed duration, can feel abrupt when interrupted.

#### What does `animationSpec = tween(300)` specify?

- ❌ A delay of 300 milliseconds before the animation starts
- ✅ A duration-based animation that takes 300 milliseconds with default FastOutSlowIn easing
- ❌ A spring animation with 300 stiffness
- ❌ A repeating animation that loops 300 times

> **Explanation:** `tween` creates a duration-based animation spec. `tween(300)` means the animation takes 300ms with the default `FastOutSlowIn` easing curve. Other animation specs include `spring()` for physics-based animations and `keyframes` for multi-step sequences.

### Coding Challenge: Animated Bottom Sheet

Build an `AnimatedBottomSheet` composable that slides up from the bottom with a spring animation, dims the background with a fade, and can be dismissed by tapping the scrim or swiping down. Use `Animatable` for the sheet offset, `animateFloatAsState` for the scrim alpha, and handle velocity-based fling dismissal.

#### Solution

```kotlin
@Composable
fun AnimatedBottomSheet(
    isVisible: Boolean,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit
) {
    val sheetOffset = remember { Animatable(1f) } // 1f = fully hidden
    val scrimAlpha by animateFloatAsState(
        targetValue = if (isVisible) 0.5f else 0f,
        animationSpec = tween(300),
        label = "scrimAlpha"
    )

    LaunchedEffect(isVisible) {
        if (isVisible) {
            sheetOffset.animateTo(
                targetValue = 0f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioLowBouncy,
                    stiffness = Spring.StiffnessMediumLow
                )
            )
        } else {
            sheetOffset.animateTo(1f, animationSpec = tween(250))
        }
    }

    if (scrimAlpha > 0f || sheetOffset.value < 1f) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Scrim
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = scrimAlpha))
                    .clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() }
                    ) { onDismiss() }
            )
            // Sheet
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .fillMaxHeight(0.5f)
                    .graphicsLayer {
                        translationY = sheetOffset.value * size.height
                    }
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(24.dp)
            ) {
                content()
            }
        }
    }
}
```

This solution uses `Animatable` for the sheet offset (enabling future gesture integration with velocity tracking), `animateFloatAsState` for the scrim (simple target-based), and `graphicsLayer` for the translation (draw-phase only, no recomposition).

---
## Module 8: The Snapshot System

The snapshot system is the foundation that makes everything in Compose work — recomposition, `derivedStateOf`, `snapshotFlow`, and the compiler's ability to skip unchanged composables. It's not an observer pattern. It's a full transactional state system built on multiversion concurrency control (MVCC).

### Lesson 8.1: Snapshots and Isolation

A `Snapshot` is an isolated, read-only view of all snapshot state values at the point it was created. Think of it like a database transaction — it captures the state of every `MutableState`, `SnapshotStateList`, `SnapshotStateMap`, and `derivedStateOf` in your entire program at that moment. Inside a snapshot's `enter {}` block, every state object returns the value it had when the snapshot was taken, regardless of what changed since. This isolation mechanism is what makes Compose thread-safe and enables features like abandoned recomposition.

The snapshot system is built on **Multiversion Concurrency Control (MVCC)** — the same technique used by PostgreSQL, SQLite, and other databases for transaction isolation. Each state value maintains multiple versions (one per snapshot that modified it), and each snapshot sees a consistent view of the world based on when it was created. This means multiple threads can read and write state simultaneously without locks — each thread works in its own isolated snapshot, and conflicts are resolved at apply time.

To understand why this matters for Compose specifically: recomposition happens in a mutable snapshot. While the recomposer is re-executing your composable functions, it's working inside an isolated snapshot. This means any state changes that happen on other threads (from network callbacks, background coroutines, etc.) during recomposition are invisible to the recomposer. The recomposer sees a consistent view of state throughout the entire recomposition pass. If other threads change state during recomposition, those changes become visible only after the recomposition snapshot is applied.

```kotlin
val userName = mutableStateOf("Spot")

userName.value = "Spot"
val snapshot = Snapshot.takeSnapshot()
userName.value = "Fido"

println(userName.value)                    // Fido
snapshot.enter { println(userName.value) } // Spot
println(userName.value)                    // Fido

snapshot.dispose()
```

All code runs inside some snapshot — even if you never explicitly create one. The root of the snapshot tree is the **global snapshot**, a special mutable snapshot that's always open. When you write `counter.value = 5` in a click handler, that write happens in the global snapshot. The global snapshot is the "current reality" of your app — all UI code reads from it (unless inside an explicit snapshot), and all user-initiated mutations happen in it.

`MutableSnapshot` adds write capability and isolation. Inside a mutable snapshot's `enter {}` block, you can read and write state freely. Those changes are invisible to all other threads and snapshots until you explicitly call `apply()`. This isolation is what makes Compose thread-safe without `synchronized` blocks. No thread can see another thread's in-progress work until that work is explicitly committed.

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

Snapshots also nest. Applying an inner snapshot pushes changes to the outer snapshot, not globally. The outer snapshot must also be applied for changes to become visible at the top level. This nesting is how the Compose runtime layers composition snapshots on top of the global snapshot. When a recomposition completes, its snapshot is applied to the global snapshot, making all composition-generated state changes visible to the rest of the app atomically.

The conflict resolution mechanism is worth understanding. When two mutable snapshots modify the same state object, the first to apply succeeds. The second encounters a conflict and must either resolve it or fail. The Compose runtime handles this internally — if a recomposition conflict occurs (state was modified externally during recomposition), the runtime abandons the current recomposition and starts a new one with the updated state. This is the mechanism behind abandoned recomposition.

```kotlin
// Demonstrating snapshot conflict
val counter = mutableStateOf(0)

val snapshot1 = Snapshot.takeMutableSnapshot()
val snapshot2 = Snapshot.takeMutableSnapshot()

snapshot1.enter { counter.value = 1 }
snapshot2.enter { counter.value = 2 }

snapshot1.apply() // Succeeds — counter is now 1
// snapshot2.apply() would fail — conflict, counter was modified since snapshot2 was taken

snapshot1.dispose()
snapshot2.dispose()
```

**Common Pitfalls:**

The most common pitfall is forgetting to dispose snapshots. Each snapshot holds references to state records and read/write observers. Failing to dispose causes memory leaks. In practice, you rarely create explicit snapshots — the runtime manages them. But if you use `Snapshot.takeSnapshot()` for debugging or testing, always call `dispose()`. Another pitfall is assuming that snapshot isolation provides thread safety for non-snapshot operations. Only snapshot state objects (`MutableState`, `SnapshotStateList`, etc.) participate in the snapshot system. Regular Kotlin variables, `AtomicInteger`, or `ConcurrentHashMap` are not isolated by snapshots.

**Key takeaway:** Snapshots provide isolated, transactional views of state. The global snapshot is always active. Mutable snapshots provide write isolation that's invisible until applied. This is how Compose achieves thread safety without locks.

### Lesson 8.2: StateObject and StateRecord

Every snapshot-aware state object implements the `StateObject` interface — `MutableState`, `SnapshotStateList`, `SnapshotStateMap`, and `DerivedSnapshotState`. Internally, each `StateObject` maintains a linked list of `StateRecord` instances. Each record holds a value and the snapshot ID it was written in.

When you read a `MutableState`, the snapshot system walks this linked list to find the record that's valid for the current snapshot — the most recent record whose snapshot ID is visible from where you're reading. When you write, a new `StateRecord` is created (or an old one is reused) and linked to the current snapshot's ID. This is the **copy-on-write** mechanism that makes isolation work without copying all state on every snapshot creation.

The read and write operations also notify observers. When code inside a snapshot reads a state object, the snapshot's **read observer** is called with that `StateObject`. When a write happens, the **write observer** fires. These observers don't know the values — they only know which `StateObject` was accessed. This is the mechanism that powers `SnapshotStateObserver` (used by the runtime to track composition dependencies) and `snapshotFlow` (which tracks reads and re-runs when those state objects change).

```kotlin
// Simplified view of what happens during composition
// (The runtime does this automatically)

val readObjects = mutableSetOf<StateObject>()
val snapshot = Snapshot.takeMutableSnapshot(
    readObserver = { stateObject -> readObjects.add(stateObject) },
    writeObserver = { stateObject -> /* schedule recomposition */ }
)

snapshot.enter {
    // Every state read inside here is tracked
    val name = userName.value  // readObserver called with userName
    val count = itemCount.value // readObserver called with itemCount
}
```

**Key takeaway:** State objects use linked lists of records for multi-version tracking. Reads and writes notify observers that the runtime uses to build dependency graphs. You never see these internals directly, but they explain how Compose knows which composables to recompose.

### Lesson 8.3: The Global Snapshot and Recomposer Loop

The global snapshot doesn't have an `apply()` method like regular mutable snapshots. Instead, it gets **advanced**. Advancing creates a new global snapshot and fires observers with all changes since the last advance. The runtime schedules `Snapshot.sendApplyNotifications()` before each frame, ensuring all state changes between frames are batched.

The recomposer loop: (1) State changes happen in the global snapshot between frames. (2) Before the next frame, `sendApplyNotifications()` advances the global snapshot. (3) Apply observers fire with the set of changed state objects. (4) The recomposer identifies which compositions read those objects. (5) It takes a mutable snapshot, recomposes the invalidated composables inside it, and applies the result. (6) That application advances the global snapshot again, making composition-generated state changes visible.

This explains several Compose behaviors. State changes are batched — multiple writes between frames don't cause multiple recompositions. Writes during composition are isolated — they don't become visible until the composition snapshot is applied. And reads during composition create subscriptions — the snapshot tracks which state objects each restart scope reads.

```kotlin
// Debugging observer — see which state objects change and when
val handle = Snapshot.registerApplyObserver { changedObjects, _ ->
    changedObjects.forEach { stateObject ->
        println("State changed: $stateObject")
    }
}

// Use this to debug excessive recompositions —
// you'll see exactly which state objects are changing
// Later, when done observing:
handle.dispose()
```

**Key takeaway:** The global snapshot advances before each frame, batching all state changes. The recomposer uses snapshot observers to identify which composables need recomposition. This batching is why multiple rapid state changes don't cause multiple frames of recomposition.

### Lesson 8.4: withMutableSnapshot — Atomic Updates

`Snapshot.withMutableSnapshot {}` is the practical API for atomic state updates from background threads. It takes a mutable snapshot, runs your block inside it, applies on success, and disposes automatically. Use it when you need multiple state changes to become visible together.

```kotlin
val cartTotal = mutableStateOf(0)
val cartItems = mutableStateListOf<String>()

// Without atomic update — UI could briefly show wrong total
fun addItemUnsafe(name: String) {
    cartItems.add(name)
    // Between these two lines, the UI might render
    // the new item with the old total
    cartTotal.value = cartItems.size
}

// With atomic update — both changes are visible at once
fun addItemSafe(name: String) {
    Snapshot.withMutableSnapshot {
        cartItems.add(name)
        cartTotal.value = cartItems.size
    }
}
```

The main use case is background thread updates. When a coroutine on `Dispatchers.IO` fetches data and needs to update multiple state objects, wrapping writes in `withMutableSnapshot` ensures they become visible together. Without it, the UI could render a partially-updated state.

**Key takeaway:** `withMutableSnapshot` provides atomic state updates — multiple changes become visible together. Use it for background thread state updates where partial visibility would cause inconsistent UI.

### Lesson 8.5: Restartable Functions and Composition Tracking

When the Compose compiler processes a `@Composable` function, it transforms it into a restartable function — one that can be re-invoked later when its dependencies change, without re-invoking the entire parent tree. The compiler injects code that registers the composable's body with the recomposer as a **restart scope**.

During composition, when the composable reads a `MutableState` value, the snapshot system records that read and associates it with the current restart scope. Later, when that state value changes, the recomposer looks up which restart scopes depend on it and schedules them for re-execution.

The distinction between reads-during-composition and reads-in-callbacks is critical. During composition, the snapshot system actively tracks every state read to build the dependency graph. In a callback like `onClick` or `LaunchedEffect`, reads don't create recomposition subscriptions — they're invisible to the recomposer. Writes still trigger notifications. This is why passing `{ viewModel.scrollOffset }` as a lambda instead of reading it directly moves the read from the composition phase to the layout/draw phase.

```kotlin
@Composable
fun OrderSummary(order: Order) {
    // This read IS tracked — it creates a recomposition dependency
    Text("Items: ${order.itemCount}")

    Button(onClick = {
        // This read is NOT tracked — callbacks are outside
        // the composition snapshot
        order.addItem()
    }) {
        Text("Add Item")
    }
}
```

**Key takeaway:** Reads during composition create implicit subscriptions in the snapshot system. Reads in callbacks don't. This is why lambda-based modifiers (`graphicsLayer {}`, `offset {}`) are optimizations — they move state reads out of composition tracking.

### Quiz: The Snapshot System

#### How does Compose know which composables to recompose when state changes?

- ❌ It recomposes everything and diffs the output
- ❌ Developers must manually register observers
- ✅ The snapshot system tracks which state objects each composable reads during composition, and when those objects change, only the reading composables are invalidated
- ❌ It uses Android's standard LiveData observer pattern

> **Explanation:** During composition, every `MutableState` read is tracked by the snapshot system and associated with the current restart scope. When a state object is written to, the snapshot's apply observers fire, and the recomposer identifies which restart scopes depend on the changed objects. Only those scopes are re-executed.

#### What is the purpose of `Snapshot.withMutableSnapshot`?

- ❌ Creating read-only snapshots for testing
- ❌ Taking UI screenshots
- ✅ Making multiple state changes visible atomically — they all appear together or not at all
- ❌ Improving animation performance

> **Explanation:** `withMutableSnapshot` wraps state mutations in an isolated snapshot. All changes inside the block become visible to the rest of the app simultaneously when the snapshot is applied. This prevents the UI from rendering intermediate states where only some values have updated.

#### Why don't state reads inside onClick callbacks trigger recomposition?

- ❌ onClick runs on a different thread
- ❌ Callbacks are compiled differently
- ✅ Callbacks execute outside the composition snapshot, so reads aren't tracked by the recomposer's dependency system
- ❌ State objects are locked during callbacks

> **Explanation:** The snapshot system only tracks reads that happen during composition — inside the composition snapshot. Callbacks like `onClick` execute when the user interacts, outside any composition snapshot. Reads there don't create subscriptions. Writes still fire global write observers and schedule recomposition, but the reads themselves are invisible to the dependency tracker.

### Coding Challenge: Custom State Observer

Build a `StateChangeLogger` composable that accepts a label and any number of `MutableState` objects. It should use `Snapshot.registerApplyObserver` to log whenever any of the tracked states change, printing the label and a timestamp. Use `DisposableEffect` for proper cleanup. Then demonstrate it with a counter and a toggle.

#### Solution

```kotlin
@Composable
fun StateChangeLogger(
    label: String,
    vararg trackedStates: State<*>
) {
    val stateObjects = remember(trackedStates.size) {
        trackedStates.mapNotNull { it as? StateObject }.toSet()
    }

    DisposableEffect(label, stateObjects) {
        val handle = Snapshot.registerApplyObserver { changedObjects, _ ->
            val relevant = changedObjects.intersect(stateObjects)
            if (relevant.isNotEmpty()) {
                println("[$label] ${relevant.size} state(s) changed at ${System.currentTimeMillis()}")
            }
        }

        onDispose {
            handle.dispose()
        }
    }
}

// Usage
@Composable
fun DebugDemo() {
    var counter by remember { mutableStateOf(0) }
    var isEnabled by remember { mutableStateOf(true) }

    StateChangeLogger("DebugDemo", counter as State<*>, isEnabled as State<*>)

    Column(modifier = Modifier.padding(16.dp)) {
        Text("Counter: $counter")
        Button(onClick = { counter++ }) { Text("Increment") }
        Switch(checked = isEnabled, onCheckedChange = { isEnabled = it })
    }
}
```

This solution demonstrates direct interaction with the snapshot system — registering an apply observer that filters for specific state objects, and cleaning up with `DisposableEffect` to prevent memory leaks.

---

## Module 9: Performance Deep Dive

Understanding performance in Compose means understanding the three-phase rendering pipeline, the stability system, strong skipping mode, and how to measure before optimizing. This module covers the practical techniques that actually move the needle.

### Lesson 9.1: Stability and the Compose Compiler

Compose's stability system determines whether the runtime can skip recomposing a composable when its parent recomposes. A composable is skippable only if **all** its parameters are stable and **equal** to the previous composition's values. A type is stable if it has consistent equality, observable mutations, and all public properties are also stable types. Stability is the single most impactful performance characteristic in a Compose codebase — it determines whether your app recomposes 10 composables or 1,000 composables per state change.

Primitive types, `String`, function types, and `MutableState` are stable by default. Data classes are stable if all properties are stable. But collections are unstable — `List<T>`, `Map<K, V>`, and `Set<T>` are Kotlin interfaces that could be backed by mutable implementations, so Compose marks them unstable. This is because Kotlin's `List` is actually `java.util.List` at the JVM level, and `java.util.List` has mutable implementations like `ArrayList`. The Compose compiler cannot guarantee at compile time that the list won't be mutated between recompositions, so it marks it unstable as a safe default.

The stability inference rules are transitive. If a data class has a property of type `List<String>`, the entire data class becomes unstable — even if all other properties are primitives. This one unstable property poisons the entire class, making every composable that receives it non-skippable. This is the most common source of performance issues in production Compose apps.

```kotlin
// This composable can NEVER be skipped — List is unstable
@Composable
fun ProductGrid(
    products: List<Product>,
    onProductClick: (Product) -> Unit,
) {
    LazyVerticalGrid(columns = GridCells.Fixed(2)) {
        items(products, key = { it.id }) { product ->
            ProductCard(product, onProductClick)
        }
    }
}

// Fix 1: Use ImmutableList
@Composable
fun ProductGrid(
    products: ImmutableList<Product>,
    onProductClick: (Product) -> Unit,
) { /* same body */ }

// Fix 2: Wrap in an @Immutable holder
@Immutable
data class ProductListState(
    val products: List<Product>,
)

@Composable
fun ProductGrid(
    state: ProductListState,
    onProductClick: (Product) -> Unit,
) { /* same body */ }
```

`@Immutable` is a promise to the compiler: "I guarantee this data won't change without Compose knowing about it." If you break that promise by mutating the list after passing it, you'll get stale UI with no error. `@Stable` is a weaker promise — mutations will be observable through the snapshot system. Use `@Immutable` for truly immutable state, `@Stable` for objects with observable mutable properties.

Understanding how external module types interact with stability is critical for production apps. Classes defined in modules that don't have the Compose compiler plugin applied are always considered unstable. This includes Retrofit API models, Room entities, Protocol Buffer generated classes, and any data class from a non-Compose module. The fix is to create a mapping layer at your architecture boundary that converts these external types into `@Immutable` UI models.

```kotlin
// External module model — always unstable
// (from :data module without Compose compiler)
data class ApiProduct(
    val id: String,
    val name: String,
    val price: Double,
    val tags: List<String>
)

// UI model — marked @Immutable, used in composables
@Immutable
data class ProductUiModel(
    val id: String,
    val name: String,
    val formattedPrice: String,
    val tags: ImmutableList<String>
)

// Mapping function in the ViewModel
fun ApiProduct.toUiModel() = ProductUiModel(
    id = id,
    name = name,
    formattedPrice = formatPrice(price),
    tags = tags.toImmutableList()
)
```

The `@Stable` annotation is appropriate for classes that have mutable state but where that state is observable through the snapshot system. The canonical example is a state holder class with `mutableStateOf` properties:

```kotlin
@Stable
class TextFieldState(initialText: String = "") {
    var text by mutableStateOf(initialText)
        private set

    var error by mutableStateOf<String?>(null)
        private set

    val isValid: Boolean
        get() = error == null && text.isNotBlank()

    fun onTextChanged(newText: String) {
        text = newText
        error = validate(newText)
    }

    private fun validate(text: String): String? {
        return when {
            text.isBlank() -> "Required"
            text.length < 3 -> "Too short"
            else -> null
        }
    }
}
```

Enable Compose compiler reports to audit stability: `-P plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=/path/to/reports`. The report shows every composable with its restartable/skippable status and flags unstable parameters. This is the fastest way to find performance issues. Run the reports as part of your CI pipeline to catch stability regressions early — a single unstable parameter in a widely-used composable can cascade through your entire app.

In a production audit workflow, the steps are: (1) generate compiler reports, (2) grep for "restartable scheme" (composables that are restartable but NOT skippable), (3) identify the unstable parameters, (4) fix them with `@Immutable`, `@Stable`, `ImmutableList`, or by adding the Compose compiler plugin to the module that defines the type, (5) verify with Layout Inspector that recomposition counts dropped.

**Common Pitfalls:**

The most dangerous pitfall is using `@Immutable` on types that can actually be mutated. This causes silent correctness bugs — the UI shows stale data with no error. Another pitfall is assuming that `val` properties make a data class immutable. `val tags: List<String>` is a `val` reference to a mutable list — the reference can't change, but the list contents can. You need `ImmutableList<String>` for true immutability. A third pitfall is forgetting to mark interfaces with `@Stable` — if your composable takes an interface parameter, and the interface isn't annotated, the composable is non-skippable even if the concrete implementation is `@Stable`.

**Key takeaway:** Stability determines skippability. Use `@Immutable`, `@Stable`, or `ImmutableList`/`ImmutableMap` to make parameters stable. Enable compiler reports to audit your codebase.

### Lesson 9.2: Strong Skipping Mode

Starting with Compose compiler 2.0, **strong skipping mode** changes the stability rules significantly. With strong skipping enabled, composables can be skipped even if some parameters are unstable. The runtime falls back to **instance equality** (`===`) instead of structural equality for unstable types. If the same object reference is passed, the composable is skipped.

This means a composable receiving `List<Product>` can now be skipped if the same list instance is passed — no `@Immutable` wrapper needed. Lambdas are also **automatically remembered**, eliminating the common problem of un-remembered lambdas causing child recompositions.

```kotlin
// Without strong skipping: this composable always recomposes
// because List is unstable
@Composable
fun TagCloud(tags: List<String>) {
    FlowRow {
        tags.forEach { tag -> Chip(tag) }
    }
}

// With strong skipping: skipped if same List instance (===)
// No @Immutable needed — instance equality is checked

// But beware: creating a new list on every recomposition
// defeats strong skipping
@Composable
fun ParentScreen(viewModel: MyViewModel) {
    val items by viewModel.items.collectAsStateWithLifecycle()

    // ❌ New list instance on every call
    TagCloud(tags = items.map { it.name })

    // ✅ Remembered — same instance across recompositions
    val tagNames = remember(items) { items.map { it.name } }
    TagCloud(tags = tagNames)
}
```

Strong skipping changes failure modes. You've traded "always recomposes" for "recomposes when reference changes." If you create new instances in the composition body (like `listOf()`, `.map {}`, or `DataClass(...)` without `remember`), the composable won't be skipped because the reference changed. The fix is `remember` the computed value.

Strong skipping also auto-remembers lambdas. `onClick = { viewModel.doThing() }` is automatically wrapped in a `remember` if the captures are stable. This eliminates the most common source of unnecessary recomposition in Compose apps — un-remembered lambda allocations.

**Key takeaway:** Strong skipping mode (Compose compiler 2.0+) enables skipping even with unstable params via instance equality. Lambdas are auto-remembered. But you must still avoid creating new instances in composition — use `remember` for computed values.

### Lesson 9.3: Lambda Optimization and Callbacks

Lambda allocations are one of the sneakiest performance issues in Compose. Every time you pass a lambda to a composable, Kotlin allocates an object for it. The Compose compiler can wrap lambdas with `remember` automatically when it can prove the captures haven't changed, but there are cases where it can't — especially with unstable or changing captures.

```kotlin
@Composable
fun ProductList(viewModel: ProductViewModel) {
    val products by viewModel.products.collectAsStateWithLifecycle()

    // ❌ BAD: captures `products` (unstable List) — new lambda every recomposition
    LazyColumn {
        items(products, key = { it.id }) { product ->
            ProductCard(
                product = product,
                onDelete = { viewModel.delete(products.indexOf(product)) }
            )
        }
    }

    // ✅ GOOD: captures only stable values
    LazyColumn {
        items(products, key = { it.id }) { product ->
            ProductCard(
                product = product,
                onDelete = { viewModel.deleteById(product.id) }
            )
        }
    }
}
```

An alternative approach from modern Android development is to **put callbacks into the UiState** and mark it with `@Immutable`. This makes the entire state holder — including its callbacks — stable, enabling the composable to be skipped when neither data nor callbacks change.

```kotlin
@Immutable
data class ProductCardState(
    val id: String,
    val name: String,
    val price: String,
    val onDelete: () -> Unit,
    val onFavorite: () -> Unit
)

// ViewModel creates states with bound callbacks
class ProductViewModel : ViewModel() {
    val productCards: StateFlow<ImmutableList<ProductCardState>> = 
        products.map { productList ->
            productList.map { product ->
                ProductCardState(
                    id = product.id,
                    name = product.name,
                    price = formatPrice(product.price),
                    onDelete = { deleteProduct(product.id) },
                    onFavorite = { toggleFavorite(product.id) }
                )
            }.toImmutableList()
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), persistentListOf())
}
```

For simple cases, method references avoid allocations entirely: `onClick = viewModel::onClicked`. The method reference is a stable function reference that the compiler can prove hasn't changed across recompositions.

**Key takeaway:** Audit lambda captures — unstable captures prevent skipping. Use method references, `remember` for computed lambdas, or embed callbacks in `@Immutable` state holders. Strong skipping auto-remembers lambdas, but captures must still be stable.

### Lesson 9.4: Deferring State Reads to Later Phases

The single highest-impact optimization in most Compose apps is deferring state reads to the latest possible rendering phase. Any state that affects only visual properties — alpha, scale, offset, color — should be read in `graphicsLayer` or `drawBehind` lambdas, not in the composition body.

```kotlin
// ❌ Reads scroll offset in Composition — all 3 phases run
@Composable
fun ParallaxHeader(scrollOffset: Int) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .offset(y = (-scrollOffset / 2).dp)  // Read in composition
            .background(Color.Blue)
    )
}

// ✅ Reads scroll offset in Layout phase — skips composition
@Composable
fun ParallaxHeader(scrollOffset: () -> Int) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .offset { IntOffset(0, -scrollOffset() / 2) }  // Read in layout
            .background(Color.Blue)
    )
}

// ✅✅ Reads scroll offset in Draw phase — skips composition AND layout
@Composable
fun ParallaxHeader(scrollOffset: () -> Int) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .graphicsLayer {
                translationY = (-scrollOffset() / 2).toFloat()
            }
            .background(Color.Blue)
    )
}
```

The pattern: use `Modifier.graphicsLayer {}` for visual-only changes (alpha, scale, rotation, translation), `Modifier.offset {}` (lambda version) for position changes that need layout awareness, and direct parameters only when the value actually changes the composition structure (conditionals, content).

**Key takeaway:** Push state reads to the latest possible phase — Drawing is cheapest, Layout is next, Composition is most expensive. Use `graphicsLayer {}` for visual properties, `offset {}` for position. The lambda versions defer reads; the value versions read during composition.

### Lesson 9.5: Recomposition Scope Extraction

Compose recomposes entire restart scopes — roughly one restartable composable function. If a state change occurs inside a large composable, the entire function re-executes, and all children get diffed against the slot table, even the ones that didn't change. Extracting composables into smaller functions creates tighter recomposition boundaries.

```kotlin
// ❌ Large composable — entire function recomposes when scrollOffset changes
@Composable
fun ProductScreen(viewModel: ProductViewModel) {
    val scrollState = rememberScrollState()
    val products by viewModel.products.collectAsStateWithLifecycle()
    val headerAlpha = 1f - (scrollState.value / 500f).coerceIn(0f, 1f)

    Column(modifier = Modifier.verticalScroll(scrollState)) {
        // This recomposes on EVERY scroll pixel because headerAlpha changes
        Header(alpha = headerAlpha)
        // These also re-execute even though they don't read headerAlpha
        products.forEach { product ->
            ProductCard(product)  // Re-diffed unnecessarily
        }
    }
}

// ✅ Extracted — only Header recomposes when scroll changes
@Composable
fun ProductScreen(viewModel: ProductViewModel) {
    val scrollState = rememberScrollState()
    val products by viewModel.products.collectAsStateWithLifecycle()

    Column(modifier = Modifier.verticalScroll(scrollState)) {
        ScrollAwareHeader(scrollState)  // Isolated recomposition scope
        ProductList(products)            // Separate scope, doesn't recompose
    }
}

@Composable
fun ScrollAwareHeader(scrollState: ScrollState) {
    // Only this composable recomposes when scrollState changes
    val alpha = 1f - (scrollState.value / 500f).coerceIn(0f, 1f)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .graphicsLayer { this.alpha = alpha }
            .background(MaterialTheme.colorScheme.primary)
    )
}
```

The rule of thumb: if a composable reads fast-changing state AND contains siblings that don't read that state, extract the state-reading portion into its own composable. This limits the recomposition blast radius.

**Key takeaway:** Extract state-reading code into separate composables to create tighter recomposition boundaries. This prevents siblings from being re-diffed when only one part of the UI depends on fast-changing state.

### Lesson 9.6: Measuring Performance — Layout Inspector and Benchmarks

Theory is useless without measurement. For finding which composables are the problem, Layout Inspector is the first tool. For quantitative measurement, Macrobenchmark with `FrameTimingMetric` gives hard numbers.

In Layout Inspector, look for two columns: **recomposition count** and **skip count**. A composable with high recomposition count and zero skips is your smoking gun — it's re-executing on every state change and Compose can't skip it. Fix: check for unstable parameters or unstable lambda captures.

For quantitative benchmarks, `FrameTimingMetric` gives P50, P90, P95, and P99 frame durations. For 60fps, every frame must complete in 16.67ms. For 90fps, the budget is 11.11ms.

```kotlin
@RunWith(AndroidJUnit4::class)
class ScrollPerformanceBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun scrollProductList() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.app",
            metrics = listOf(FrameTimingMetric()),
            iterations = 5,
            compilationMode = CompilationMode.Partial(
                baselineProfile = BaselineProfileMode.Require
            ),
        ) {
            startActivityAndWait()
            val list = device.findObject(By.res("product_list"))
            list.setGestureMargin(device.displayWidth / 5)
            list.fling(Direction.DOWN)
            device.waitForIdle()
        }
    }
}
```

The diagnostic sequence: (1) Measure with FrameTimingMetric — if P95 < 16ms, you probably don't have a problem. (2) Check recomposition counts in Layout Inspector. (3) Defer state reads to later phases. (4) Use `derivedStateOf` for many-to-few mappings. (5) Audit `remember` and lambda captures. (6) Stabilize data types. (7) Extract recomposition boundaries.

**Key takeaway:** Measure before optimizing. Use Layout Inspector for recomposition counts and Macrobenchmark for frame timing. The diagnostic sequence is: measure → defer reads → coalesce state → audit captures → stabilize types → extract boundaries.

### Quiz: Performance Deep Dive

#### Why is `List<Post>` considered unstable by the Compose compiler?

- ❌ Because `List` is an abstract type
- ❌ Because `Post` might be null
- ✅ Because `List` is a mutable interface — the compiler cannot guarantee the contents won't change between recompositions
- ❌ Because lists are always too large to compare

> **Explanation:** Kotlin's `List` interface is actually `java.util.List`, which has mutable implementations like `ArrayList`. The Compose compiler can't guarantee a `List` parameter won't be mutated externally, so it marks it as unstable and always recomposes. Using `ImmutableList` from kotlinx-collections-immutable solves this.

#### How does strong skipping mode change recomposition behavior?

- ❌ It disables recomposition entirely
- ❌ It makes all composables non-skippable
- ✅ It enables skipping even with unstable parameters by using instance equality (===) and auto-remembers lambdas
- ❌ It only works in debug builds

> **Explanation:** Strong skipping mode (Compose compiler 2.0+) falls back to instance equality for unstable parameters — if the same reference is passed, the composable is skipped. It also automatically wraps lambdas in `remember`, eliminating the most common source of un-skippable composables.

#### What is the most impactful single optimization in most Compose apps?

- ❌ Using `@Immutable` on every data class
- ❌ Extracting all composables into separate functions
- ✅ Deferring state reads to the latest possible rendering phase using lambda-based modifiers
- ❌ Replacing all LazyColumn items with regular Column

> **Explanation:** Using lambda-based modifiers like `graphicsLayer {}` and `offset {}` defers state reads from the Composition phase to Layout or Drawing. This skips the most expensive phase entirely. In scroll-heavy UIs, this single change can eliminate hundreds of unnecessary recompositions per second.

### Coding Challenge: Optimized Feed

Build an optimized social media feed with: (1) `@Immutable` data classes for posts, (2) `ImmutableList` for the post collection, (3) `derivedStateOf` for a "scroll to top" FAB that appears when scrolled past item 5, (4) `graphicsLayer` for a parallax header that uses scroll offset, (5) `key` for stable item identity, and (6) a method reference for the click handler. Verify with Layout Inspector that the header recomposes only in the draw phase and the FAB recomposes only when visibility toggles.

#### Solution

```kotlin
@Immutable
data class FeedPost(
    val id: String,
    val author: String,
    val content: String,
    val likes: Int
)

@Composable
fun OptimizedFeed(
    posts: ImmutableList<FeedPost>,
    onPostClick: (String) -> Unit
) {
    val listState = rememberLazyListState()

    // derivedStateOf — only recomposes when boolean flips
    val showScrollToTop by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 5 }
    }

    Scaffold(
        floatingActionButton = {
            AnimatedVisibility(visible = showScrollToTop) {
                FloatingActionButton(
                    onClick = { /* scroll to top */ }
                ) {
                    Icon(Icons.Default.ArrowUpward, "Scroll to top")
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            // Parallax header — draw phase only
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .graphicsLayer {
                        val scroll = listState.firstVisibleItemScrollOffset
                        translationY = (-scroll / 2).toFloat()
                        alpha = 1f - (scroll / 500f).coerceIn(0f, 1f)
                    }
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0xFF667EEA), Color(0xFF764BA2))
                        )
                    )
            )

            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(top = 200.dp)
            ) {
                items(
                    items = posts,
                    key = { it.id }
                ) { post ->
                    FeedPostCard(
                        post = post,
                        onClick = onPostClick // method reference, stable
                    )
                }
            }
        }
    }
}

@Composable
fun FeedPostCard(
    post: FeedPost,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable { onClick(post.id) }
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(post.author, fontWeight = FontWeight.Bold)
            Text(post.content)
            Text("${post.likes} likes", color = Color.Gray, fontSize = 12.sp)
        }
    }
}
```

This solution applies every major performance technique: `@Immutable` for stable data, `ImmutableList` for stable collections, `derivedStateOf` for scroll-to-boolean coalescing, `graphicsLayer` for draw-phase-only visual changes, stable `key` for efficient diffing, and a stable function reference for click handling.

---

## Module 10: Custom Graphics and Drawing

Compose's graphics system provides Canvas, DrawScope, Path, Brush, BlendMode, and graphicsLayer for building custom visual elements. This module covers the drawing APIs, compositing strategies, and hit testing.

### Lesson 10.1: Canvas and DrawScope

The `Canvas` composable is the entry point for custom drawing. It provides a `DrawScope` where you issue drawing commands. The coordinate system starts at `[0, 0]` in the top-left, with `x` increasing rightward and `y` increasing downward. Custom drawing is essential for charts, graphs, progress indicators, decorative elements, and any visual that can't be composed from existing components. Understanding `DrawScope` unlocks the full visual power of Compose.

`DrawScope` is a scoped interface that provides drawing primitives, size information, density, and layout direction. Every draw call happens within this scope, which ensures that all measurements are properly density-aware and positioned within the composable's bounds. The `size` property gives you the total available drawing area, and `center` gives you the center point — these are the two most frequently used properties.

The drawing pipeline in Compose mirrors the Android `Canvas` API but with a higher-level, more Kotlin-friendly interface. Under the hood, `DrawScope` delegates to an Android `Canvas` (or a similar platform canvas on other targets), but the API surface is designed for Compose's declarative paradigm. You don't hold references to `Paint` objects — instead, you pass color, brush, and style parameters directly to draw methods.

```kotlin
Canvas(modifier = Modifier.fillMaxSize()) {
    val canvasWidth = size.width
    val canvasHeight = size.height

    drawRect(
        color = Color.LightGray,
        topLeft = Offset.Zero,
        size = Size(canvasWidth / 2, canvasHeight / 2)
    )

    drawCircle(
        color = Color.Blue,
        radius = 80f,
        center = center
    )

    drawLine(
        color = Color.Red,
        start = Offset(0f, canvasHeight),
        end = Offset(canvasWidth, 0f),
        strokeWidth = 4f
    )

    drawArc(
        color = Color.Green,
        startAngle = 0f,
        sweepAngle = 270f,
        useCenter = false,
        topLeft = Offset(canvasWidth * 0.6f, canvasHeight * 0.6f),
        size = Size(200f, 200f),
        style = Stroke(width = 8f, cap = StrokeCap.Round)
    )
}
```

`DrawScope` provides high-level methods: `drawRect`, `drawCircle`, `drawLine`, `drawArc`, `drawImage`, `drawPath`, `drawPoints`, `drawOval`, `drawRoundRect`. For operations not exposed by `DrawScope`, use `drawIntoCanvas` to access the underlying `Canvas` and `nativeCanvas`. This is the escape hatch for platform-specific drawing operations like text drawing with `Paint.drawText`, `RenderEffect` application, or direct `NativeCanvas` operations.

```kotlin
Canvas(modifier = Modifier.size(200.dp)) {
    // High-level DrawScope API
    drawRoundRect(
        color = Color.Blue,
        cornerRadius = CornerRadius(16f, 16f),
        style = Stroke(width = 4f)
    )

    // Escape hatch for platform-specific operations
    drawIntoCanvas { canvas ->
        val paint = android.graphics.Paint().apply {
            color = android.graphics.Color.RED
            textSize = 48f
            isAntiAlias = true
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        canvas.nativeCanvas.drawText(
            "Custom Text",
            center.x - 100f,
            center.y,
            paint
        )
    }
}
```

`DrawScope` also provides transformation functions — `translate`, `rotate`, `scale`, `withTransform` — that scope transformations to a lambda. `withTransform` combines multiple transforms into a single operation, which is more efficient than nesting individual ones. Transformations only affect draw calls within their lambda scope, and the coordinate system is automatically restored afterward. This is different from the imperative `Canvas.save()`/`Canvas.restore()` pattern — Compose handles save/restore automatically through scoping.

```kotlin
Canvas(modifier = Modifier.size(300.dp)) {
    // Individual transforms (less efficient — two save/restore pairs)
    rotate(degrees = 45f) {
        translate(left = 50f, top = 50f) {
            drawRect(Color.Red, size = Size(100f, 100f))
        }
    }

    // Combined transform (more efficient — single save/restore pair)
    withTransform({
        rotate(degrees = 45f)
        translate(left = 50f, top = 50f)
    }) {
        drawRect(Color.Blue, size = Size(100f, 100f))
    }

    // Practical example: drawing a rotated star pattern
    val numPoints = 12
    val angleStep = 360f / numPoints
    repeat(numPoints) { i ->
        rotate(degrees = i * angleStep) {
            drawLine(
                color = Color.Yellow,
                start = center,
                end = Offset(center.x, center.y - size.minDimension / 2.5f),
                strokeWidth = 3f,
                cap = StrokeCap.Round
            )
        }
    }
}
```

For production use, the `Canvas` composable should be sized explicitly with `Modifier.size()` or `Modifier.fillMaxSize()`. An unsized `Canvas` has zero width and height, rendering nothing. Always verify that your `Canvas` has non-zero dimensions. For responsive drawing, use `size.width` and `size.height` to compute all positions relative to the available space, rather than hardcoding pixel values.

**Common Pitfalls:**

The biggest pitfall is creating objects (like `Path`, `Paint`, or `Brush`) inside the `Canvas` draw lambda. Since the draw lambda executes on every frame during animations, creating objects per-frame causes garbage collection pressure. Use `drawWithCache` (Lesson 10.5) instead, or `remember` the objects outside the draw scope. Another pitfall is forgetting that `Canvas` coordinates are in pixels, not dp. Use `Dp.toPx()` within `DrawScope` (which provides `Density`) to convert dp values. A third pitfall is overdrawing — drawing overlapping shapes without considering GPU fill rate. On low-end devices, heavy overdraw causes janky rendering.

**Key takeaway:** `Canvas` and `DrawScope` provide a comprehensive drawing API. Use the high-level `draw*` methods for common shapes. Use `drawIntoCanvas` for platform-specific operations. Transformations are scoped to lambdas for safety.

### Lesson 10.2: Path — Custom Shapes

`Path` lets you build complex shapes beyond circles and rectangles. You create a path with drawing commands: `moveTo`, `lineTo`, `cubicTo`, `quadraticTo`, and `close()`. The real power shows up when combined with `drawWithCache` to avoid recreating paths on every frame.

```kotlin
Canvas(modifier = Modifier.size(300.dp)) {
    val heartPath = Path().apply {
        val w = size.width
        val h = size.height
        moveTo(w / 2, h * 0.35f)
        cubicTo(w * 0.15f, h * 0.0f, 0f, h * 0.45f, w / 2, h * 0.85f)
        moveTo(w / 2, h * 0.35f)
        cubicTo(w * 0.85f, h * 0.0f, w, h * 0.45f, w / 2, h * 0.85f)
    }
    drawPath(heartPath, color = Color.Red)
}

// Better: cache the path with drawWithCache
Box(
    modifier = Modifier
        .size(300.dp)
        .drawWithCache {
            val heartPath = Path().apply {
                val w = size.width
                val h = size.height
                moveTo(w / 2, h * 0.35f)
                cubicTo(w * 0.15f, h * 0.0f, 0f, h * 0.45f, w / 2, h * 0.85f)
                moveTo(w / 2, h * 0.35f)
                cubicTo(w * 0.85f, h * 0.0f, w, h * 0.45f, w / 2, h * 0.85f)
            }
            onDrawBehind {
                drawPath(heartPath, color = Color.Red)
            }
        }
)
```

`Path` has convenience methods — `addRect`, `addOval`, `addRoundRect`, `addArc` — for geometric shapes. You can combine paths using `op()` for union, intersection, and difference operations. Use `drawWithCache` whenever you build complex paths — it avoids recreating the path object on every draw call, only rebuilding when the size changes.

**Key takeaway:** `Path` builds custom shapes with `moveTo`, `lineTo`, `cubicTo`. Use `drawWithCache` to cache path objects across draw calls. Combine paths with `op()` for boolean operations.

### Lesson 10.3: Brush and Gradients

Every draw function accepts either a `Color` or a `Brush`. A `Brush` defines how an area gets painted. Compose ships with `SolidColor`, `Brush.linearGradient`, `Brush.radialGradient`, `Brush.sweepGradient`, and `ShaderBrush` for custom shaders.

```kotlin
Canvas(modifier = Modifier.size(200.dp)) {
    // Radial gradient — colors spread from center
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(Color(0xFFFF6B6B), Color(0xFF4ECDC4)),
            center = center,
            radius = size.minDimension / 2
        )
    )

    // Linear gradient — colors spread in a line
    drawRect(
        brush = Brush.linearGradient(
            colors = listOf(Color(0xFF667EEA), Color(0xFF764BA2)),
            start = Offset.Zero,
            end = Offset(size.width, size.height)
        ),
        size = Size(size.width / 3, size.height)
    )

    // Sweep gradient — colors rotate around center
    drawCircle(
        brush = Brush.sweepGradient(
            colors = listOf(Color.Red, Color.Yellow, Color.Green,
                Color.Cyan, Color.Blue, Color.Magenta, Color.Red)
        ),
        radius = 50f,
        center = Offset(size.width * 0.8f, size.height * 0.8f)
    )
}
```

For cases where built-in brushes aren't enough, `ShaderBrush` lets you plug in a custom shader. On API 33+, `RuntimeShader` with AGSL (Android Graphics Shading Language) enables GPU-computed effects — procedural patterns, animated gradients, image-based brushes.

**Key takeaway:** `Brush` provides gradient fills for any draw operation. Use `linearGradient` for directional gradients, `radialGradient` for circular effects, `sweepGradient` for color wheels. Cache brushes with `drawWithCache` for performance.

### Lesson 10.4: BlendMode and CompositingStrategy

`BlendMode` controls how newly drawn pixels combine with existing pixels. The default `BlendMode.SrcOver` draws new content on top. `BlendMode.Clear` erases everything it touches. `BlendMode.SrcIn` keeps only the intersection of source and destination.

The critical catch: blend modes interact with everything already drawn on the surface. `BlendMode.Clear` without isolation cuts through to the window background, appearing as a black hole. `CompositingStrategy.Offscreen` fixes this by creating an isolated buffer.

```kotlin
Image(
    painter = painterResource(id = R.drawable.profile_photo),
    contentDescription = "Profile",
    modifier = Modifier
        .size(120.dp)
        .graphicsLayer {
            compositingStrategy = CompositingStrategy.Offscreen
        }
        .drawWithContent {
            drawContent()
            // Cut a circular hole for status indicator
            drawCircle(
                color = Color.Black,
                radius = size.width / 8f,
                center = Offset(size.width * 0.85f, size.height * 0.85f),
                blendMode = BlendMode.Clear
            )
            // Draw status indicator in the hole
            drawCircle(
                color = Color.Green,
                radius = size.width / 10f,
                center = Offset(size.width * 0.85f, size.height * 0.85f)
            )
        }
)
```

`CompositingStrategy.Auto` (default) only creates an offscreen buffer when alpha < 1.0 or a `RenderEffect` is applied. `CompositingStrategy.Offscreen` always buffers — necessary for blend mode effects. `CompositingStrategy.ModulateAlpha` applies alpha to each draw instruction individually without buffering.

**Key takeaway:** `BlendMode` controls pixel compositing. Always use `CompositingStrategy.Offscreen` with `BlendMode.Clear` to avoid punch-through artifacts. The three compositing strategies have different performance and correctness tradeoffs.

### Lesson 10.5: Drawing Modifiers — drawBehind, drawWithContent, drawWithCache

Compose provides three drawing modifiers with different use cases. `Modifier.drawBehind` draws behind the composable's content — use for backgrounds and decorations. `Modifier.drawWithContent` gives full control over drawing order — you decide when to call `drawContent()`. `Modifier.drawWithCache` adds caching — objects persist across recompositions and rebuild only when size or tracked state changes.

```kotlin
// drawBehind — simple custom background
Box(
    modifier = Modifier
        .size(200.dp)
        .drawBehind {
            drawRoundRect(
                color = Color.Blue,
                cornerRadius = CornerRadius(16f)
            )
        }
)

// drawWithContent — control draw order
Box(
    modifier = Modifier
        .size(200.dp)
        .drawWithContent {
            drawContent()  // Draw children first
            // Draw overlay on top
            drawRect(
                color = Color.Black.copy(alpha = 0.3f)
            )
        }
)

// drawWithCache — cache expensive objects
Box(
    modifier = Modifier
        .fillMaxWidth()
        .height(200.dp)
        .drawWithCache {
            val gradient = Brush.linearGradient(
                colors = listOf(Color(0xFF667EEA), Color(0xFF764BA2)),
                start = Offset.Zero,
                end = Offset(size.width, size.height)
            )
            val path = Path().apply {
                moveTo(0f, size.height * 0.7f)
                cubicTo(
                    size.width * 0.3f, size.height * 0.4f,
                    size.width * 0.7f, size.height * 0.9f,
                    size.width, size.height * 0.6f
                )
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
                close()
            }
            onDrawBehind {
                drawRect(gradient)
                drawPath(path, color = Color.White.copy(alpha = 0.2f))
            }
        }
)
```

Reach for `drawWithCache` most often in production. Any time you build a `Path` or create a gradient `Brush`, doing it on every draw call is wasteful. `drawWithCache` provides the caching that `remember` provides for composition, but scoped to the draw phase.

**Key takeaway:** Use `drawBehind` for simple backgrounds, `drawWithContent` for custom layering, and `drawWithCache` for expensive path/brush creation. `drawWithCache` is the most common choice for production graphics code.

### Quiz: Custom Graphics

#### Why must you use `CompositingStrategy.Offscreen` with `BlendMode.Clear`?

- ❌ It's required by the Android runtime
- ❌ It improves drawing performance
- ✅ Without it, `Clear` cuts through to the window background instead of just the composable's content, creating a black hole artifact
- ❌ It enables hardware acceleration

> **Explanation:** Blend modes interact with all existing pixels on the surface. Without an offscreen buffer, `BlendMode.Clear` erases pixels all the way through to the window's background, which usually appears as a black rectangle. `Offscreen` creates an isolated layer so `Clear` only affects content within that composable.

#### What is the advantage of `drawWithCache` over `drawBehind`?

- ❌ It draws faster on every frame
- ❌ It supports more drawing operations
- ✅ It caches expensive objects (Path, Brush, Paint) across draw calls, only rebuilding when size or tracked state changes
- ❌ It provides access to the native canvas

> **Explanation:** `drawWithCache` separates object creation from drawing. Objects created in the cache block persist across frames and are only rebuilt when the composable's size changes or when snapshot state read inside the block changes. This avoids allocating new `Path` and `Brush` objects on every draw call.

### Coding Challenge: Circular Progress Indicator

Build a custom `GradientProgressRing` composable that draws a circular arc with a gradient brush, rounded stroke caps, and a configurable progress (0f to 1f). Use `drawWithCache` to cache the gradient brush. Animate the progress with `animateFloatAsState`. Include a background track ring in gray.

#### Solution

```kotlin
@Composable
fun GradientProgressRing(
    progress: Float,
    modifier: Modifier = Modifier,
    strokeWidth: Dp = 12.dp,
    trackColor: Color = Color.Gray.copy(alpha = 0.2f)
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(800, easing = FastOutSlowInEasing),
        label = "progress"
    )

    Box(
        modifier = modifier
            .size(120.dp)
            .drawWithCache {
                val stroke = strokeWidth.toPx()
                val gradientBrush = Brush.sweepGradient(
                    colors = listOf(
                        Color(0xFF667EEA),
                        Color(0xFF764BA2),
                        Color(0xFFFF6B6B)
                    )
                )
                onDrawBehind {
                    // Background track
                    drawArc(
                        color = trackColor,
                        startAngle = -90f,
                        sweepAngle = 360f,
                        useCenter = false,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                        topLeft = Offset(stroke / 2, stroke / 2),
                        size = Size(size.width - stroke, size.height - stroke)
                    )
                    // Progress arc
                    drawArc(
                        brush = gradientBrush,
                        startAngle = -90f,
                        sweepAngle = animatedProgress * 360f,
                        useCenter = false,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                        topLeft = Offset(stroke / 2, stroke / 2),
                        size = Size(size.width - stroke, size.height - stroke)
                    )
                }
            },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "${(animatedProgress * 100).toInt()}%",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
    }
}
```

This solution uses `drawWithCache` to cache the gradient brush, `drawArc` with `StrokeCap.Round` for polished endpoints, and `animateFloatAsState` for smooth progress transitions. The percentage text uses `contentAlignment` within `Box` for automatic centering.

---
## Module 11: Testing Compose

Testing Compose UIs uses a semantic tree rather than view IDs. The testing framework provides finders, assertions, and actions that operate on the composition's semantic nodes.

### Lesson 11.1: ComposeTestRule and Basic Assertions

`createComposeRule()` sets up a test environment where you render composables and interact with the semantic tree. You find nodes with finders (`onNodeWithText`, `onNodeWithTag`, `onNodeWithContentDescription`), perform actions (`performClick`, `performTextInput`), and make assertions (`assertIsDisplayed`, `assertIsEnabled`, `assertTextEquals`). Compose testing is fundamentally different from View testing — instead of interacting with View objects directly, you interact with an abstract semantic tree that describes the meaning and structure of your UI.

The semantic tree is Compose's accessibility tree — the same tree that screen readers like TalkBack use. Testing against it means your tests verify both visual correctness and accessibility. If a test can't find a node, it might mean you're missing accessibility annotations, which is both a testing problem and an accessibility problem. This dual purpose is a powerful feature of Compose testing: writing good tests naturally improves your app's accessibility.

Under the hood, the test framework creates a virtual Compose environment with a controlled clock. This means animations run at controlled speed, recompositions happen deterministically, and you can advance time without waiting in real-time. The test rule manages the Compose runtime lifecycle: it creates a `Recomposer`, sets up the density and layout direction, and provides thread-safe access to the semantic tree for assertions.

There are two types of test rules. `createComposeRule()` creates a standalone Compose environment without an Activity — suitable for testing individual composables in isolation. `createAndroidComposeRule<MyActivity>()` launches a real Activity and provides access to both the Compose tree and the Activity instance — suitable for integration tests that need Android framework resources.

```kotlin
@get:Rule
val composeTestRule = createComposeRule()

@Test
fun loginButton_disabled_when_fields_empty() {
    composeTestRule.setContent {
        LoginScreen()
    }

    composeTestRule
        .onNodeWithText("Log In")
        .assertIsNotEnabled()
}

@Test
fun loginButton_enabled_after_input() {
    composeTestRule.setContent {
        LoginScreen()
    }

    composeTestRule
        .onNodeWithText("Email")
        .performTextInput("mukul@example.com")

    composeTestRule
        .onNodeWithText("Password")
        .performTextInput("password123")

    composeTestRule
        .onNodeWithText("Log In")
        .assertIsEnabled()
}
```

Finders are the entry point for all test interactions. The most common finders are `onNodeWithText` (finds by displayed text), `onNodeWithTag` (finds by `testTag`), and `onNodeWithContentDescription` (finds by accessibility description). For multiple matches, use `onAllNodesWithText` and filter with `[index]` or `filter()`. For complex queries, combine matchers with `hasText`, `hasTestTag`, `hasContentDescription`, `hasClickAction`, `isEnabled`, and boolean operators `and`/`or`.

```kotlin
@Test
fun multipleNodes_filteredByPredicate() {
    composeTestRule.setContent {
        Column {
            repeat(5) { i ->
                Card(
                    modifier = Modifier.testTag("card_$i")
                ) {
                    Text("Card $i")
                    if (i % 2 == 0) {
                        Button(onClick = {}) { Text("Action") }
                    }
                }
            }
        }
    }

    // Find all cards
    composeTestRule
        .onAllNodesWithTag("card", substring = true)
        .assertCountEquals(5)

    // Find specific card by combined matcher
    composeTestRule
        .onNode(hasTestTag("card_2") and hasAnyChild(hasText("Action")))
        .assertIsDisplayed()

    // Find all buttons and click the first one
    composeTestRule
        .onAllNodesWithText("Action")
        .onFirst()
        .performClick()
}
```

Assertions verify the state of found nodes. `assertIsDisplayed()` checks that the node is visible on screen. `assertExists()` checks that the node is in the tree (but may be off-screen). `assertDoesNotExist()` verifies the node is not in the tree at all. The distinction between `assertIsDisplayed` and `assertExists` matters for scrollable lists — an item may exist in the tree but be scrolled off-screen.

Actions simulate user interactions. `performClick()` taps the node. `performTextInput("text")` types into a text field. `performScrollTo()` scrolls a scrollable container to make the node visible. `performTouchInput { swipeUp() }` performs gesture-based interactions like swipes and flings. Actions are executed synchronously in tests, and the test framework waits for all resulting recompositions to complete before proceeding.

**Common Pitfalls:**

The most common pitfall is using `assertIsDisplayed()` when `assertExists()` is appropriate. In a `LazyColumn`, items that are composed but scrolled off-screen exist in the semantic tree but are not displayed. Another pitfall is not waiting for asynchronous operations — use `composeTestRule.waitForIdle()` after actions that trigger state changes or animations. A third pitfall is over-relying on `onNodeWithText` for dynamic text — if the text includes numbers or dates that change, the test becomes flaky. Use `testTag` for stable identification.

**Key takeaway:** Compose tests use the semantic tree. Find nodes with finders, interact with actions, verify with assertions. Tests that use `contentDescription` also validate accessibility.

### Lesson 11.2: Test Tags and Semantics

`Modifier.testTag("tag")` assigns a unique identifier for testing. Use it when text-based or content description-based finders are ambiguous. `testTag` is purely for testing — it doesn't affect production UI or accessibility.

```kotlin
@Composable
fun UserAvatar(user: User, modifier: Modifier = Modifier) {
    Image(
        painter = rememberAsyncImagePainter(user.avatarUrl),
        contentDescription = "${user.name}'s avatar",
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape)
            .testTag("avatar_${user.id}")
    )
}

// Custom semantics for richer testing
@Composable
fun ProgressCard(label: String, progress: Float) {
    Card(
        modifier = Modifier
            .semantics {
                testTag = "progress_card"
                contentDescription = "$label: ${(progress * 100).toInt()}%"
                progressBarRangeInfo = ProgressBarRangeInfo(
                    current = progress,
                    range = 0f..1f
                )
            }
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(label)
            LinearProgressIndicator(progress = { progress })
        }
    }
}

// Test
@Test
fun avatar_displays_for_user() {
    composeTestRule.setContent {
        UserAvatar(user = testUser)
    }

    composeTestRule
        .onNodeWithTag("avatar_user-1")
        .assertIsDisplayed()

    composeTestRule
        .onNodeWithContentDescription("Mukul's avatar")
        .assertExists()
}
```

**Key takeaway:** Use `testTag` for precise node selection. Use `contentDescription` for both accessibility and testing. Custom `semantics` blocks enable richer assertions like progress values.

### Lesson 11.3: Testing State and Interactions

For stateful composables, test the behavior — not the implementation. Set up the composable, perform user actions, and assert the result. For composables connected to ViewModels, use the component-level (stateless) composable directly with fake state.

```kotlin
@Test
fun counter_increments_and_decrements() {
    composeTestRule.setContent { Counter() }

    // Initial state
    composeTestRule.onNodeWithTag("count_display").assertTextEquals("0")

    // Increment
    composeTestRule.onNodeWithTag("btn_increment").performClick()
    composeTestRule.onNodeWithTag("count_display").assertTextEquals("1")

    // Multiple increments
    composeTestRule.onNodeWithTag("btn_increment").performClick()
    composeTestRule.onNodeWithTag("count_display").assertTextEquals("2")

    // Decrement
    composeTestRule.onNodeWithTag("btn_decrement").performClick()
    composeTestRule.onNodeWithTag("count_display").assertTextEquals("1")
}

// Testing a stateless composable with fake state
@Test
fun noteContent_shows_notes_and_handles_events() {
    val capturedEvents = mutableListOf<NoteEvent>()
    val testState = NoteState(
        notes = persistentListOf(
            Note("1", "First note"),
            Note("2", "Second note")
        ),
        newNoteText = ""
    )

    composeTestRule.setContent {
        NoteContent(
            state = testState,
            onEvent = { capturedEvents.add(it) }
        )
    }

    // Verify notes are displayed
    composeTestRule.onNodeWithText("First note").assertIsDisplayed()
    composeTestRule.onNodeWithText("Second note").assertIsDisplayed()

    // Type new note text
    composeTestRule.onNodeWithText("New note").performTextInput("Test note")

    // Verify event was captured
    assert(capturedEvents.last() is NoteEvent.TextChanged)
}
```

**Key takeaway:** Test behavior, not implementation. Use the component-level (stateless) composable for testing — pass fake state and capture events. This eliminates ViewModel dependencies from tests.

### Lesson 11.4: Waiting for Async Operations

Compose tests run synchronously by default — the test rule controls the clock. For animations, use `mainClock.advanceTimeBy()`. For async operations in `LaunchedEffect`, use `waitForIdle()` or `advanceUntilIdle()`.

```kotlin
@Test
fun timedMessage_disappears_after_delay() {
    var dismissed = false
    composeTestRule.setContent {
        TimedMessage(
            message = "Test message",
            onDismiss = { dismissed = true }
        )
    }

    // Message is visible immediately
    composeTestRule.onNodeWithText("Test message").assertIsDisplayed()

    // Advance past the 3-second auto-dismiss
    composeTestRule.mainClock.advanceTimeBy(3100)

    // Verify dismiss was called
    assert(dismissed)
}

@Test
fun animatedVisibility_completes_transition() {
    var isVisible by mutableStateOf(true)
    composeTestRule.setContent {
        AnimatedVisibility(visible = isVisible) {
            Text("Content", modifier = Modifier.testTag("content"))
        }
    }

    composeTestRule.onNodeWithTag("content").assertIsDisplayed()

    isVisible = false
    composeTestRule.waitForIdle()

    // After animation completes, node should not exist
    composeTestRule.onNodeWithTag("content").assertDoesNotExist()
}
```

**Key takeaway:** Use `mainClock.advanceTimeBy()` to control time in tests. Use `waitForIdle()` to let pending compositions and animations complete. The test rule provides deterministic control over timing.

### Lesson 11.5: Screenshot Testing and Previews

Compose previews (`@Preview`) serve double duty — they're development tools AND the basis for screenshot tests. With Compose Preview Screenshot Testing, you generate golden images from previews and compare them in CI.

```kotlin
@Preview(name = "Light Mode")
@Preview(name = "Dark Mode", uiMode = UI_MODE_NIGHT_YES)
@Preview(name = "Large Font", fontScale = 2f)
@Composable
fun ProfileCardPreview() {
    AppTheme {
        ProfileCard(name = "Mukul Jangra", role = "Android Engineer")
    }
}

// Multi-device previews
@Preview(device = Devices.PIXEL_5)
@Preview(device = Devices.PIXEL_TABLET)
@Composable
fun ResponsiveLayoutPreview() {
    AppTheme {
        ResponsiveLayout()
    }
}
```

Previews with different configurations catch visual regressions across themes, font scales, screen sizes, and locales. Combined with screenshot comparison tools, they form an automated visual regression suite.

**Key takeaway:** Use `@Preview` with multiple configurations (dark mode, font scale, device size) to catch visual regressions. Previews serve as both development tools and screenshot test inputs.

### Quiz: Testing Compose

#### What is the advantage of testing stateless (component-level) composables?

- ❌ They run faster than stateful tests
- ❌ They don't require any test rules
- ✅ You can pass fake state and capture events directly, eliminating ViewModel and other dependencies from tests
- ❌ They automatically generate UI screenshots

> **Explanation:** Stateless composables receive state as parameters and emit events as callbacks. You can test them with `setContent { Component(fakeState, onEvent = { captured.add(it) }) }` — no ViewModel, no repository, no dependency injection needed.

#### How do you control timing in Compose tests?

- ❌ Using `Thread.sleep()`
- ❌ Using `delay()` from coroutines
- ✅ Using `mainClock.advanceTimeBy()` for precise time control and `waitForIdle()` for pending operations
- ❌ Timing cannot be controlled in Compose tests

> **Explanation:** The Compose test rule controls the clock. `mainClock.advanceTimeBy(3000)` fast-forwards 3 seconds worth of animations and effects. `waitForIdle()` processes all pending compositions, animations, and layout passes. Never use `Thread.sleep()` in Compose tests.

### Coding Challenge: Test Suite for a Todo List

Write a complete test suite for a `TodoContent` composable that has: a text field for new todos, an "Add" button, a list of todos with checkboxes, and a delete button per item. Test initial empty state, adding a todo, checking a todo, deleting a todo, and that the "Add" button is disabled when the text field is empty.

#### Solution

```kotlin
class TodoContentTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val capturedEvents = mutableListOf<TodoEvent>()

    private fun setContent(state: TodoState = TodoState()) {
        composeTestRule.setContent {
            TodoContent(state = state, onEvent = { capturedEvents.add(it) })
        }
    }

    @Before
    fun setup() { capturedEvents.clear() }

    @Test
    fun emptyState_showsEmptyList_addButtonDisabled() {
        setContent()
        composeTestRule.onNodeWithText("Add").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("todo_list").assertExists()
    }

    @Test
    fun typingText_enablesAddButton() {
        setContent()
        composeTestRule.onNodeWithTag("new_todo_field")
            .performTextInput("Buy groceries")
        assert(capturedEvents.any { it is TodoEvent.TextChanged })
    }

    @Test
    fun addingTodo_sendsAddEvent() {
        setContent(TodoState(newTodoText = "Buy groceries"))
        composeTestRule.onNodeWithText("Add").performClick()
        assert(capturedEvents.last() is TodoEvent.AddTodo)
    }

    @Test
    fun checkingTodo_sendsToggleEvent() {
        val state = TodoState(
            todos = persistentListOf(
                TodoItem("1", "Buy groceries", isComplete = false)
            )
        )
        setContent(state)
        composeTestRule.onNodeWithTag("checkbox_1").performClick()
        val event = capturedEvents.last()
        assert(event is TodoEvent.ToggleItem && event.id == "1")
    }

    @Test
    fun deletingTodo_sendsDeleteEvent() {
        val state = TodoState(
            todos = persistentListOf(
                TodoItem("1", "Buy groceries", isComplete = false)
            )
        )
        setContent(state)
        composeTestRule.onNodeWithTag("delete_1").performClick()
        val event = capturedEvents.last()
        assert(event is TodoEvent.DeleteItem && event.id == "1")
    }
}
```

This test suite demonstrates testing a stateless composable by passing fake state and capturing events. Each test is focused on a single behavior. No ViewModel, repository, or dependency injection is needed.

---

## Module 12: Architecture Patterns with Compose

### Lesson 12.1: Unidirectional Data Flow

Unidirectional Data Flow (UDF) is the architectural pattern that Compose is designed for. State flows down from ViewModel to UI as parameters. Events flow up from UI to ViewModel as callbacks. The ViewModel is the single source of truth.

```kotlin
// State
@Immutable
data class TodoState(
    val items: ImmutableList<TodoItem> = persistentListOf(),
    val filter: Filter = Filter.ALL,
    val newItemText: String = ""
)

// Events
sealed interface TodoEvent {
    data class AddItem(val text: String) : TodoEvent
    data class ToggleItem(val id: String) : TodoEvent
    data class DeleteItem(val id: String) : TodoEvent
    data class FilterChanged(val filter: Filter) : TodoEvent
    data class TextChanged(val text: String) : TodoEvent
}

// ViewModel
class TodoViewModel : ViewModel() {
    private val _state = MutableStateFlow(TodoState())
    val state = _state.asStateFlow()

    fun onEvent(event: TodoEvent) {
        when (event) {
            is TodoEvent.AddItem -> addItem(event.text)
            is TodoEvent.ToggleItem -> toggleItem(event.id)
            is TodoEvent.DeleteItem -> deleteItem(event.id)
            is TodoEvent.FilterChanged -> {
                _state.update { it.copy(filter = event.filter) }
            }
            is TodoEvent.TextChanged -> {
                _state.update { it.copy(newItemText = event.text) }
            }
        }
    }

    private fun addItem(text: String) {
        if (text.isBlank()) return
        _state.update { current ->
            val item = TodoItem(
                id = UUID.randomUUID().toString(),
                text = text
            )
            current.copy(
                items = (current.items + item).toImmutableList(),
                newItemText = ""
            )
        }
    }

    private fun toggleItem(id: String) {
        _state.update { current ->
            current.copy(
                items = current.items.map {
                    if (it.id == id) it.copy(isComplete = !it.isComplete) else it
                }.toImmutableList()
            )
        }
    }

    private fun deleteItem(id: String) {
        _state.update { current ->
            current.copy(
                items = current.items.filter { it.id != id }.toImmutableList()
            )
        }
    }
}

// Screen — thin wrapper, connects ViewModel to UI
@Composable
fun TodoScreen(viewModel: TodoViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    TodoContent(state = state, onEvent = viewModel::onEvent)
}
```

The sealed interface for events creates an exhaustive contract between UI and ViewModel. The compiler enforces that every event type is handled — if you add a new event, the `when` expression forces you to handle it.

**Key takeaway:** UDF creates a predictable cycle: Event → ViewModel → State → UI. The ViewModel is the single source of truth. Sealed interfaces make the event contract explicit and compiler-enforced.

### Lesson 12.2: Screen-Level vs Component-Level Split

Split every screen into two layers: a thin **screen-level** composable that connects to the ViewModel, and a thick **component-level** composable that is completely stateless. The component-level composable receives state as parameters and emits events as callbacks — it has no knowledge of ViewModels, repositories, or navigation.

This split is the foundation of testability. The component-level composable can be tested directly with `createComposeRule().setContent { ComponentLevel(fakeState, onEvent = {}) }` — no ViewModel mocking, no dependency injection, no Hilt modules.

```kotlin
// Screen-level — thin, ViewModel-connected
@Composable
fun ProfileScreen(viewModel: ProfileViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ProfileEvent.NavigateToSettings -> { /* navigate */ }
                is ProfileEvent.ShowError -> { /* show snackbar */ }
            }
        }
    }

    ProfileContent(state = state, onEvent = viewModel::onEvent)
}

// Component-level — thick, stateless, testable
@Composable
fun ProfileContent(
    state: ProfileState,
    onEvent: (ProfileEvent) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(16.dp)) {
        Avatar(url = state.avatarUrl, modifier = Modifier.size(80.dp))
        Spacer(modifier = Modifier.height(16.dp))
        Text(state.name, style = MaterialTheme.typography.headlineMedium)
        Text(state.email, color = Color.Gray)
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = { onEvent(ProfileEvent.EditProfile) }) {
            Text("Edit Profile")
        }
        OutlinedButton(onClick = { onEvent(ProfileEvent.Logout) }) {
            Text("Log Out")
        }
    }
}
```

**Key takeaway:** Split screens into thin screen-level (ViewModel-connected) and thick component-level (stateless, testable). Test the component directly without ViewModel dependencies.

### Lesson 12.3: Callbacks in UiState — The Modern Approach

A pattern gaining traction in modern Android development is embedding callbacks directly in the UiState data class and marking it with `@Immutable`. This eliminates the need for separate event sealed interfaces in simpler screens and makes the entire state holder — including its callbacks — stable.

```kotlin
@Immutable
data class SettingsUiState(
    val isDarkMode: Boolean = false,
    val notificationsEnabled: Boolean = true,
    val username: String = "",
    val onToggleDarkMode: () -> Unit = {},
    val onToggleNotifications: () -> Unit = {},
    val onUsernameChanged: (String) -> Unit = {},
    val onSave: () -> Unit = {}
)

class SettingsViewModel : ViewModel() {
    private val _isDarkMode = MutableStateFlow(false)
    private val _notificationsEnabled = MutableStateFlow(true)
    private val _username = MutableStateFlow("")

    val uiState: StateFlow<SettingsUiState> = combine(
        _isDarkMode,
        _notificationsEnabled,
        _username
    ) { dark, notif, name ->
        SettingsUiState(
            isDarkMode = dark,
            notificationsEnabled = notif,
            username = name,
            onToggleDarkMode = { _isDarkMode.value = !_isDarkMode.value },
            onToggleNotifications = { _notificationsEnabled.value = !_notificationsEnabled.value },
            onUsernameChanged = { _username.value = it },
            onSave = { saveSettings() }
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsUiState())
}

// Clean composable — no event sealed class needed
@Composable
fun SettingsContent(state: SettingsUiState) {
    Column(modifier = Modifier.padding(16.dp)) {
        SwitchRow("Dark Mode", state.isDarkMode, state.onToggleDarkMode)
        SwitchRow("Notifications", state.notificationsEnabled, state.onToggleNotifications)
        OutlinedTextField(
            value = state.username,
            onValueChange = state.onUsernameChanged,
            label = { Text("Username") }
        )
        Button(onClick = state.onSave) { Text("Save") }
    }
}
```

This approach works best for simpler screens where the event types are straightforward. For complex screens with many event types, conditional logic, and side effects, the sealed interface approach provides better structure and exhaustiveness checking.

**Key takeaway:** Embedding callbacks in `@Immutable` UiState simplifies simpler screens by eliminating separate event types. The `@Immutable` annotation makes the entire state stable for skipping. Use sealed interfaces for complex screens with many event types.

### Lesson 12.4: Optimistic Updates and UI Responsiveness

Production apps need to feel instant. When users tap a button, they expect immediate feedback — not a loading spinner followed by the result. Optimistic updates immediately reflect the user action in the UI and handle the actual operation (database, network) in the background. This pattern is the foundation of responsive, modern mobile UIs and is critical for features like bookmarking, liking, toggling settings, and adding items to carts.

The pattern: update UI state immediately on user action, perform the actual operation asynchronously, and revert the UI state if the operation fails. This eliminates perceived latency because the UI responds in the same frame as the tap. The user sees the result instantly, even if the actual database write takes 20ms or the network call takes 300ms. In production, the difference between a 0ms response (optimistic) and a 300ms response (wait-for-result) is the difference between an app that feels native and one that feels sluggish.

A real-world example: article bookmarking. Without optimistic updates, the user taps the bookmark icon, waits for the database operation (20ms), then waits for the observer that tracks saved article IDs to propagate the updated state to the UI (which can take 1-3 seconds due to query complexity). With optimistic updates, the bookmark icon toggles instantly — the UI updates in the same frame as the tap, and the database operation happens in the background. The worst-case response time drops from 3-4 seconds to under 300ms.

```kotlin
class BookmarkViewModel(
    private val repository: ArticleRepository
) : ViewModel() {
    private val _bookmarkedIds = MutableStateFlow<Set<String>>(emptySet())
    val bookmarkedIds = _bookmarkedIds.asStateFlow()

    fun toggleBookmark(articleId: String) {
        // 1. Optimistic update — instant UI feedback
        val wasBookmarked = articleId in _bookmarkedIds.value
        _bookmarkedIds.update { ids ->
            if (wasBookmarked) ids - articleId else ids + articleId
        }

        // 2. Actual operation in background
        viewModelScope.launch {
            val result = if (wasBookmarked) {
                repository.removeBookmark(articleId)
            } else {
                repository.addBookmark(articleId)
            }

            // 3. Revert on failure
            if (result.isFailure) {
                _bookmarkedIds.update { ids ->
                    if (wasBookmarked) ids + articleId else ids - articleId
                }
                _events.send(UiEvent.ShowError("Failed to update bookmark"))
            }
        }
    }
}
```

There are several alternative approaches to UI responsiveness, each with different tradeoffs. The first alternative is **showing a loading state** — display a loading indicator during the operation. This is honest but feels slow. The second is **optimistic updates with local-first persistence** — update the local database immediately, update the UI from the local database, and sync with the remote API asynchronously using `WorkManager`. This provides both instant responsiveness and data consistency.

```kotlin
// Alternative 1: Loading state (simplest but feels slow)
class LoadingStateViewModel(
    private val repository: ArticleRepository
) : ViewModel() {
    private val _isBookmarking = MutableStateFlow<Set<String>>(emptySet())
    val isBookmarking = _isBookmarking.asStateFlow()

    fun toggleBookmark(articleId: String) {
        viewModelScope.launch {
            _isBookmarking.update { it + articleId } // Show loading
            repository.toggleBookmark(articleId)
            _isBookmarking.update { it - articleId } // Hide loading
        }
    }
}

// Alternative 2: Local-first with background sync
class LocalFirstBookmarkViewModel(
    private val localDb: BookmarkDao,
    private val workManager: WorkManager
) : ViewModel() {
    // UI observes local database directly — always fast
    val bookmarkedIds = localDb.getAllBookmarkIds()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())

    fun toggleBookmark(articleId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            // 1. Update local database immediately (< 20ms)
            localDb.toggleBookmark(articleId)

            // 2. Schedule background sync with remote API
            val syncRequest = OneTimeWorkRequestBuilder<BookmarkSyncWorker>()
                .setInputData(workDataOf("articleId" to articleId))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            workManager.enqueueUniqueWork(
                "bookmark_sync_$articleId",
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        }
    }
}
```

For handling rapid repeated clicks (like a user spamming the bookmark button), you need debouncing or click coalescing. Without protection, each click enqueues a separate toggle operation, and the final state depends on the race between them. The simplest approach is to track the "in-progress" state and ignore clicks while an operation is pending:

```kotlin
class DebounceBookmarkViewModel(
    private val repository: ArticleRepository
) : ViewModel() {
    private val _state = MutableStateFlow(BookmarkUiState())
    val state = _state.asStateFlow()

    private val pendingOperations = MutableStateFlow<Set<String>>(emptySet())

    fun toggleBookmark(articleId: String) {
        // Ignore if operation already in progress for this article
        if (articleId in pendingOperations.value) return

        val wasBookmarked = articleId in _state.value.bookmarkedIds

        // Optimistic update
        _state.update { current ->
            current.copy(
                bookmarkedIds = if (wasBookmarked)
                    current.bookmarkedIds - articleId
                else
                    current.bookmarkedIds + articleId
            )
        }

        pendingOperations.update { it + articleId }

        viewModelScope.launch {
            try {
                repository.setBookmarked(articleId, !wasBookmarked)
            } catch (e: Exception) {
                // Revert on failure
                _state.update { current ->
                    current.copy(
                        bookmarkedIds = if (wasBookmarked)
                            current.bookmarkedIds + articleId
                        else
                            current.bookmarkedIds - articleId
                    )
                }
            } finally {
                pendingOperations.update { it - articleId }
            }
        }
    }
}
```

For more complex scenarios — like syncing with a remote API — combine optimistic updates with `WorkManager` for guaranteed delivery. Update the local database immediately, show the result to the user, and enqueue a `WorkManager` task to sync with the server. This is the foundation of offline-first architecture. The key insight is that the UI should never wait for the network — it should always reflect the user's intent immediately, and background sync ensures eventual consistency.

**Common Pitfalls:**

The most dangerous pitfall is not handling the revert case properly. If the optimistic update succeeds but the background operation fails, you must revert the UI to the pre-optimistic state, not just ignore the failure. Another pitfall is race conditions with rapid clicks — without debouncing, you can end up in an inconsistent state. A third pitfall is showing a success message before the operation actually succeeds — optimistic updates mean the UI shows success immediately, but if the operation fails, the user sees a brief success followed by a revert, which is confusing. Consider showing success feedback only after the operation confirms.

**Key takeaway:** Optimistic updates provide instant UI feedback by updating state immediately and performing the actual operation asynchronously. Revert on failure. Combine with WorkManager for offline-first reliability.

### Lesson 12.5: State Holder Classes for UI Logic

Not all state logic belongs in a ViewModel. UI-specific logic — scroll coordination, animation state, drag-and-drop, complex form interactions — is better managed in a plain Kotlin class created with `remember`. The ViewModel handles business logic; the state holder handles UI logic.

```kotlin
@Stable
class SearchBarState(
    initialQuery: String = "",
    private val onSearch: (String) -> Unit
) {
    var query by mutableStateOf(initialQuery)
        private set

    var isExpanded by mutableStateOf(false)
        private set

    var suggestions by mutableStateOf<List<String>>(emptyList())
        private set

    fun onQueryChanged(newQuery: String) {
        query = newQuery
        suggestions = if (newQuery.length >= 2) {
            generateSuggestions(newQuery)
        } else {
            emptyList()
        }
    }

    fun onSearch() {
        if (query.isNotBlank()) {
            onSearch(query)
            isExpanded = false
            suggestions = emptyList()
        }
    }

    fun expand() { isExpanded = true }
    fun collapse() {
        isExpanded = false
        suggestions = emptyList()
    }

    private fun generateSuggestions(query: String): List<String> {
        // Local suggestion logic
        return recentSearches.filter { it.contains(query, ignoreCase = true) }
    }
}

@Composable
fun rememberSearchBarState(
    initialQuery: String = "",
    onSearch: (String) -> Unit
): SearchBarState {
    val currentOnSearch by rememberUpdatedState(onSearch)
    return remember {
        SearchBarState(
            initialQuery = initialQuery,
            onSearch = { currentOnSearch(it) }
        )
    }
}
```

The `@Stable` annotation on the class tells the Compose compiler that this object's mutable properties are observable through the snapshot system (`mutableStateOf`). This enables composables that receive a `SearchBarState` to be skipped when the state hasn't changed.

**Key takeaway:** Use plain `@Stable` classes for UI logic that doesn't need ViewModel lifecycle. Create them with `remember` and a factory function. ViewModels handle business logic, state holders handle UI logic.

### Quiz: Architecture Patterns

#### What is the UDF pattern in Compose?

- ❌ Data flows from child composables up to the ViewModel
- ❌ State is shared bidirectionally between all composables
- ✅ State flows down from ViewModel to UI as parameters, and events flow up from UI to ViewModel as callbacks
- ❌ Each composable manages its own state independently

> **Explanation:** UDF means the ViewModel holds the single source of truth for state and exposes it downward. The UI is a pure function of that state. User interactions are sent upward as events, and only the ViewModel modifies state. This creates a predictable, testable cycle.

#### Why split composables into screen-level and component-level?

- ❌ It is required by the Compose compiler
- ❌ Screen-level composables are faster than component-level ones
- ✅ Screen-level composables handle ViewModel wiring, while component-level composables are stateless and directly testable without ViewModel dependencies
- ❌ Component-level composables cannot accept parameters

> **Explanation:** The thin screen-level composable connects to the ViewModel and passes state down. The thick component-level composable is a pure function of its parameters — it can be tested in isolation with `setContent { Component(fakeState, onEvent = {}) }`.

#### When should you use a plain state holder class instead of a ViewModel?

- ❌ For all state management
- ❌ Only for data persistence
- ✅ For UI-specific logic (scroll coordination, animation state, form interactions) that doesn't need to survive navigation or process death
- ❌ State holders are deprecated in favor of ViewModels

> **Explanation:** ViewModels survive configuration changes and are scoped to navigation destinations. Plain state holders created with `remember` are scoped to the composable's lifecycle. Use state holders for UI logic like search expansion, drag state, and animation coordination — things that can be recreated when the composable re-enters composition.

### Coding Challenge: Full UDF Architecture

Build a complete notes app screen using UDF architecture. Create `NoteState` (with list of notes and new note text), `NoteEvent` sealed interface (AddNote, DeleteNote, TextChanged), and `NoteViewModel`. Split the UI into screen-level `NoteScreen` (ViewModel-connected) and component-level `NoteContent` (stateless, testable). Use `@Immutable` for the Note data class, `ImmutableList` for the notes collection, and stable keys for the lazy list.

#### Solution

```kotlin
@Immutable
data class Note(val id: String, val text: String)

data class NoteState(
    val notes: ImmutableList<Note> = persistentListOf(),
    val newNoteText: String = ""
)

sealed interface NoteEvent {
    data class TextChanged(val text: String) : NoteEvent
    data object AddNote : NoteEvent
    data class DeleteNote(val id: String) : NoteEvent
}

class NoteViewModel : ViewModel() {
    private val _state = MutableStateFlow(NoteState())
    val state = _state.asStateFlow()

    fun onEvent(event: NoteEvent) {
        when (event) {
            is NoteEvent.TextChanged -> {
                _state.update { it.copy(newNoteText = event.text) }
            }
            is NoteEvent.AddNote -> {
                _state.update { current ->
                    if (current.newNoteText.isBlank()) return
                    val note = Note(
                        id = UUID.randomUUID().toString(),
                        text = current.newNoteText
                    )
                    current.copy(
                        notes = (current.notes + note).toImmutableList(),
                        newNoteText = ""
                    )
                }
            }
            is NoteEvent.DeleteNote -> {
                _state.update { current ->
                    current.copy(
                        notes = current.notes
                            .filter { it.id != event.id }
                            .toImmutableList()
                    )
                }
            }
        }
    }
}

// Screen-level — thin, ViewModel-connected
@Composable
fun NoteScreen(viewModel: NoteViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    NoteContent(state = state, onEvent = viewModel::onEvent)
}

// Component-level — thick, stateless, testable
@Composable
fun NoteContent(
    state: NoteState,
    onEvent: (NoteEvent) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(16.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = state.newNoteText,
                onValueChange = { onEvent(NoteEvent.TextChanged(it)) },
                label = { Text("New note") },
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = { onEvent(NoteEvent.AddNote) },
                enabled = state.newNoteText.isNotBlank()
            ) {
                Text("Add")
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items = state.notes, key = { it.id }) { note ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(note.text, modifier = Modifier.weight(1f))
                        IconButton(
                            onClick = { onEvent(NoteEvent.DeleteNote(note.id)) }
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete")
                        }
                    }
                }
            }
        }
    }
}
```

This solution demonstrates complete UDF architecture with `@Immutable` data classes, `ImmutableList` for stable collections, sealed interface events, screen/component split, and stable `key` for efficient lazy list diffing. The `NoteContent` can be tested directly without any ViewModel or dependency injection.

---

Thank You for completing the Jetpack Compose Mastery course! Compose changes how you think about UI — once you internalize the declarative model, you'll never want to go back to XML. 🎨
