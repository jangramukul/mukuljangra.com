---
title: Compose Rendering Performance Deep Dive
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Performance
---

I used to think Compose performance was about avoiding unnecessary recompositions. Slap `@Stable` on your data classes, use `derivedStateOf` where needed, pass lambdas carefully — the standard advice. And it's not wrong, but it's incomplete. The real understanding came when I started looking at what Compose actually does during a single frame and realized that recomposition is just one of three phases, and it's not always the most expensive one.

Compose renders your UI through a three-phase pipeline: composition, layout, and drawing. Each phase does fundamentally different work, reads different state, and has different performance characteristics. When a frame drops, most developers blame recomposition, but I've seen just as many jank issues caused by expensive layout passes or overdraw in the drawing phase. Understanding the full pipeline changed how I diagnose and fix performance problems.

## The Three-Phase Rendering Pipeline

When Compose renders a frame, it processes three phases sequentially. **Composition** is where your composable functions run. It evaluates the `@Composable` code, determines what UI nodes exist, and produces a tree of layout nodes stored internally in a structure called the slot table. **Layout** is where each node gets measured and positioned. Compose walks the node tree, calls `measure` and `place` on each node, and determines the exact pixel coordinates. **Drawing** is where the measured, placed nodes actually render to a Canvas. Each phase can be triggered independently, and this is key to Compose's performance model.

If a `mutableStateOf` value changes and it's only read during drawing (like a color or alpha), Compose skips composition and layout entirely and only re-executes the drawing phase. If a state is only read during layout (like an offset for positioning), Compose skips composition and only re-runs layout and drawing. Only states read during composition trigger a full recomposition. This phase-skipping is one of Compose's most powerful performance features, and most developers don't use it intentionally.

```kotlin
@Composable
fun AnimatedCard(scrollOffset: Float) {
    // BAD: reading scrollOffset in composition triggers all 3 phases
    val alpha = (1f - scrollOffset / 500f).coerceIn(0f, 1f)
    Card(modifier = Modifier.alpha(alpha)) {
        Text("Content")
    }
}

@Composable
fun AnimatedCardOptimized(scrollOffset: () -> Float) {
    // GOOD: lambda defers reading to drawing phase, skips composition + layout
    Card(
        modifier = Modifier.graphicsLayer {
            alpha = (1f - scrollOffset() / 500f).coerceIn(0f, 1f)
        }
    ) {
        Text("Content")
    }
}
```

The difference between passing `Float` and `() -> Float` is the difference between triggering all three phases on every scroll pixel versus triggering only the drawing phase. In a list with 20 visible cards, that's the difference between smooth scrolling and visible jank. The `graphicsLayer` modifier reads state in the draw phase specifically because it operates on the RenderNode level — it doesn't need to re-measure or re-position anything, just repaint with new parameters.

## Inside the Slot Table

The slot table is Compose's internal data structure that stores the composition state — the UI tree, remembered values, and the metadata Compose needs to know what changed. Understanding it at a high level explains several performance behaviors that otherwise seem arbitrary.

Compose doesn't build a traditional tree of objects like the View system does. Instead, it uses a flat array (the slot table) where composable calls are stored linearly as they execute. When `@Composable fun Screen()` calls `Column { Text("A"); Text("B") }`, the slot table stores entries for Screen, then Column, then Text("A"), then Text("B"), in a flat sequence with group markers that define the tree structure. This linear layout means Compose can walk the table sequentially during recomposition, comparing new outputs against the previous frame's data using gap buffers — a technique borrowed from text editors.

Why does this matter for performance? Because Compose's recomposition is fundamentally a **diff operation** against this flat array. When a composable is marked for recomposition, Compose re-executes it and compares the new outputs against the stored values in the slot table. If nothing changed, it skips the subtree. If something changed, it patches the slot table and marks the affected layout nodes dirty. The efficiency of this diff is what makes Compose competitive with the View system despite re-running Kotlin functions on every state change.

The practical implication is that composable structure matters. Adding or removing composables conditionally (using `if/else` at the composition level) causes slot table restructuring, which is more expensive than updating existing composables. If you're toggling between two different UI states, prefer showing/hiding with `Modifier.alpha(0f)` or `AnimatedVisibility` over adding/removing composables with conditionals when the toggle happens frequently — like during animations.

## Why Recomposition Is Actually Expensive

When people say "avoid unnecessary recompositions," the real concern isn't the recomposition itself. Running a Kotlin function is cheap. The expense comes from three things that happen as a consequence of recomposition.

First, **allocation pressure.** Every recomposition creates new lambda objects, new modifier chains, and new instances of data classes if you're not careful. The Compose compiler plugin optimizes many of these away — it can detect when lambda captures haven't changed and reuse the existing instance — but it can't optimize everything. Unstable parameters cause the most allocation pressure because Compose can't skip them and must re-execute the entire composable subtree even if the output would be identical.

Second, **layout invalidation cascading.** When a composable recomposes and produces a different layout node (different size, different children), the layout phase has to re-measure not just that node but potentially its parent and siblings. In deeply nested layouts, a single recomposition at a leaf node can trigger measurement of dozens of ancestors as the layout system propagates constraints upward. This is similar to the "requestLayout cascade" problem in the View system, and Compose's intrinsic measurements can make it worse by adding extra measurement passes.

Third, **the recomposition scope problem.** Compose doesn't recompose individual lines of code — it recomposes entire scopes. A recomposition scope is roughly one restartable composable function. If a state change occurs inside a large composable with many children, the entire function re-executes, and all children have to be diffed against the slot table, even the ones that didn't change. This is why extracting composables into smaller functions isn't just good practice for readability — it creates tighter recomposition boundaries that limit the blast radius of state changes.

## The Stability System

Compose's stability system determines whether the runtime can skip recomposing a composable when its parent recomposes. A composable can only be skipped if **all** its parameters are stable and **equal** to the previous composition's values. If any parameter is unstable, Compose must always recompose that composable because it can't guarantee the value hasn't changed in a way `equals()` wouldn't detect.

A type is considered **stable** if it meets three criteria: the result of `equals()` for two instances will always be the same for the same two instances (consistent equality), when a public property changes, Compose is notified (observable mutations), and all public properties are also stable types.

Primitive types, `String`, function types (lambdas), and `MutableState` are stable by default. Data classes are stable if all their properties are stable types. But here's where production code hits problems: **collections are unstable.** `List<T>`, `Map<K, V>`, and `Set<T>` are Kotlin interfaces that could be backed by mutable implementations. Compose can't know at compile time whether your `List<String>` is actually a `MutableList<String>`, so it marks them unstable.

```kotlin
// This composable can NEVER be skipped because List is unstable
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

// Fix: wrap in an immutable holder
@Immutable
data class ProductListState(
    val products: List<Product>,
)

@Composable
fun ProductGrid(
    state: ProductListState,
    onProductClick: (Product) -> Unit,
) {
    LazyVerticalGrid(columns = GridCells.Fixed(2)) {
        items(state.products, key = { it.id }) { product ->
            ProductCard(product, onProductClick)
        }
    }
}
```

Marking the wrapper with `@Immutable` is a promise to the compiler: "I guarantee this data won't change without Compose knowing about it." If you break that promise by mutating the list after passing it, you'll get stale UI with no error or warning. The `@Stable` annotation is a weaker promise — it says mutations will be observable through Compose's snapshot system. Use `@Immutable` for truly immutable state objects, `@Stable` for objects with observable mutable properties.

## Strong Skipping Mode

Starting with Compose compiler 2.0, **strong skipping mode** changes the stability rules significantly. With strong skipping enabled, composables can be skipped even if some parameters are unstable. The runtime uses instance equality (`===`) as a fallback for unstable parameters instead of structural equality (`equals()`). If the same object reference is passed, the composable is skipped.

This means a composable receiving `List<Product>` can now be skipped if the same list instance is passed — no `@Immutable` wrapper needed. The practical impact is significant: many of the `@Stable` and `@Immutable` annotations that you previously needed become unnecessary. Lambdas are also automatically remembered in strong skipping mode, which eliminates the common problem of passing un-remembered lambdas causing child recompositions.

But strong skipping isn't a "turn it on and forget it" solution. It changes failure modes. With strong skipping, if you create a new list instance with the same contents on every recomposition, the composable won't be skipped because the reference changed, even though the contents are the same. The fix is either `remember` the list or use structural equality by marking the type as stable. So you've traded "always recomposes" for "recomposes when reference changes" — which is better in most cases but can still surprise you if you're creating new instances in the composition body.

```kotlin
@Composable
fun SearchScreen(viewModel: SearchViewModel) {
    val results by viewModel.results.collectAsStateWithLifecycle()

    // With strong skipping: this works IF viewModel emits the same List instance
    // when contents haven't changed (which StateFlow does with distinctUntilChanged)
    SearchResults(items = results)
}
```

## Measuring Frame Timing

Knowing the theory is useless without measurement. The most practical tool for Compose performance is the Layout Inspector's recomposition counts (available in Android Studio), but for frame timing specifically, you need Macrobenchmark with `FrameTimingMetric`.

```kotlin
@RunWith(AndroidJUnit4::class)
class ScrollPerformanceBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun scrollProductList() {
        benchmarkRule.measureRepeated(
            packageName = "com.example.shopapp",
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
            list.fling(Direction.DOWN)
            device.waitForIdle()
        }
    }
}
```

This gives you P50, P90, P95, and P99 frame durations in milliseconds. For 60fps rendering, every frame must complete within 16.67ms. For 90fps (common on modern devices), the budget drops to 11.11ms. I care most about P95 — occasional single-frame spikes are invisible to users, but the P95 tells you if there's consistent jank.

In one of our screens, the `FrameTimingMetric` showed P50 at 8ms (fine) but P95 at 34ms (terrible). The cause was a heavy composable recomposing on every scroll position change because it read the scroll state directly in composition instead of in a `graphicsLayer` lambda. After deferring the read to the draw phase, P95 dropped to 12ms. That single change — wrapping a state read in a lambda — was the difference between smooth and janky scrolling.

## Practical Optimization Checklist

After debugging performance in several Compose projects, here's what I check in order. This isn't a list of tips — it's a diagnostic sequence.

**Start with measurement.** Run `FrameTimingMetric` benchmarks on your most complex screens. If P95 is under 16ms, you probably don't have a problem. Don't optimize based on intuition.

**Check recomposition counts.** Use Layout Inspector to see which composables recompose on each interaction. High-frequency recompositions in parent composables are the biggest red flag — they cascade through the entire subtree.

**Defer state reads to the latest possible phase.** Any state that affects only visual properties (alpha, scale, offset, color) should be read in `graphicsLayer` or `drawBehind` lambdas, not in the composition body. This is the single highest-impact optimization in most Compose apps.

**Stabilize your data types.** If you can't enable strong skipping mode yet, audit your composable parameters for unstable types. Collections, third-party types, and classes from other modules are the usual suspects. Use the Compose compiler reports (`-Xcompose-metrics`) to find which composables are never skippable.

**Extract recomposition boundaries.** If a large composable reads fast-changing state, extract the state-reading portion into a separate composable function. This limits the recomposition scope and prevents siblings from being re-diffed.

The reframe I want to leave you with is this: **Compose performance is not about avoiding recomposition. It's about controlling which of the three phases run, and limiting how far state changes propagate through the tree.** A recomposition that triggers only drawing is nearly free. A recomposition that cascades through 50 composables because of one unstable parameter is expensive. The phase model is the mental model. Once you have it, every optimization technique makes intuitive sense.

Thanks for reading!
