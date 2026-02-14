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

When Compose renders a frame, it processes three phases sequentially. **Composition** is where your composable functions run — it evaluates the `@Composable` code, determines what UI nodes exist, and produces a tree of layout nodes stored in a structure called the slot table. **Layout** is where each node gets measured and positioned via `measure` and `place` calls. **Drawing** is where the measured, placed nodes actually render to a Canvas. Each phase can be triggered independently, and this is key to Compose's performance model.

If a `mutableStateOf` value changes and it's only read during drawing (like a color or alpha), Compose skips composition and layout entirely and only re-executes the drawing phase. If a state is only read during layout, Compose skips composition and re-runs layout and drawing. Only states read during composition trigger full recomposition. This phase-skipping is one of Compose's most powerful performance features, and most developers don't use it intentionally.

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

The difference between passing `Float` and `() -> Float` is the difference between triggering all three phases on every scroll pixel versus triggering only the drawing phase. In a list with 20 visible cards, that's the difference between smooth scrolling and visible jank. The `graphicsLayer` modifier reads state in the draw phase because it operates at the RenderNode level — it doesn't need to re-measure or re-position anything, just repaint with new parameters.

## Inside the Slot Table and How `remember` Works

The slot table is Compose's internal data structure that stores composition state — the UI tree, remembered values, and the metadata Compose needs to know what changed. Compose doesn't build a traditional tree of objects like the View system. Instead, it uses a flat array where composable calls are stored linearly as they execute, with group markers defining the tree structure. This linear layout means Compose can walk the table sequentially during recomposition, comparing new outputs against the previous frame using gap buffers — a technique borrowed from text editors.

Here's the thing most developers miss: `remember` is not magic. It's a slot table operation. When you call `remember { expensiveCalculation() }`, Compose stores the result at a specific position in the slot table corresponding to that call site. On the next recomposition, it reads the stored value from that same position instead of re-executing the lambda. The key insight is that `remember` is positional — two `remember` calls in the same composable occupy different slots, and moving a `remember` call changes which slot it reads from.

This is where `remember(key)` becomes critical. Without a key, `remember` keeps the cached value forever (until the composable leaves the composition). With a key, Compose invalidates the cached value when the key changes. If you're computing a filtered list based on a search query, you need `remember(query) { items.filter { it.contains(query) } }` — otherwise the filter result goes stale when the query changes. I've seen this exact bug in production: a search screen that showed results for the first query and never updated because the `remember` had no key.

`rememberSaveable` extends this further — it survives configuration changes and process death by writing to a `SavedStateHandle`. But it comes with a constraint: the value must be saveable (primitives, `Parcelable`, or a custom `Saver`). Use `remember` for expensive computations that can be recalculated, `rememberSaveable` for user input state that would be frustrating to lose. And the most common mistake I see is `remember { mutableStateOf(value) }` where `value` is a parameter — when the parameter changes, the state doesn't update because `remember` has no key on that parameter.

## derivedStateOf — Coalescing Rapid Changes

Once you understand `remember`, `derivedStateOf` is the natural next step. It creates a derived state that only triggers recomposition when its result actually changes, not when the inputs change. This distinction matters enormously for high-frequency state sources like scroll position.

Consider a header that should show or hide based on scroll offset. The scroll offset changes on every single frame during a fling — potentially 60+ times per second. But the header visibility is a boolean: visible or not. Without `derivedStateOf`, every scroll pixel triggers recomposition of the header. With it, recomposition only happens on the two transitions: visible-to-hidden and hidden-to-visible. That's going from 60 recompositions per second to maybe 2 during the entire scroll gesture.

```kotlin
@Composable
fun CollapsibleHeader(listState: LazyListState) {
    // BAD: recomposes on every scroll pixel
    val showHeader = listState.firstVisibleItemScrollOffset < 200

    // GOOD: only recomposes when the boolean actually flips
    val showHeader by remember {
        derivedStateOf { listState.firstVisibleItemScrollOffset < 200 }
    }

    AnimatedVisibility(visible = showHeader) {
        TopAppBar(title = { Text("Products") })
    }
}
```

But `derivedStateOf` isn't free, and I've seen people overuse it. It adds overhead — it creates a snapshot observer and tracks dependencies. If your derived value changes just as often as the source (like mapping a number to a slightly different number), `derivedStateOf` adds cost with no benefit. It's specifically for many-to-few mappings: many input changes producing few output changes.

## Lambda Optimization and the Compose Compiler

The Compose compiler does a surprising amount of work with lambdas behind the scenes. When you write `onClick = { viewModel.doThing() }`, the compiler sees that this lambda captures `viewModel`, checks if `viewModel` is stable, and if so, wraps the lambda so it can be compared across recompositions. If the captures haven't changed, Compose reuses the existing lambda instance instead of creating a new one. This means the child composable receiving `onClick` can be skipped — the lambda parameter is "equal" to the previous one.

But this breaks down when the lambda captures unstable or changing values. `onClick = { doThing(mutableVar) }` captures `mutableVar`, and if it's a local variable that changes on every recomposition, the compiler can't prove the lambda is the same. A new lambda instance gets created each time, the child composable sees a different function reference, and it recomposes even if nothing visible changed. This is one of the sneakiest performance issues in Compose because the code looks completely innocent.

```kotlin
@Composable
fun ProductList(viewModel: ProductViewModel) {
    val products by viewModel.products.collectAsStateWithLifecycle()

    // BAD: captures `products` (List, unstable) — new lambda every recomposition
    LazyColumn {
        items(products, key = { it.id }) { product ->
            ProductCard(
                product = product,
                onDelete = { viewModel.delete(products.indexOf(product)) }
            )
        }
    }

    // GOOD: captures only viewModel (stable) and product.id (stable)
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

With strong skipping mode enabled, lambdas are automatically remembered, which eliminates most of these issues. But if you're not on strong skipping yet, audit your lambda captures carefully. The Compose compiler metrics report (`-Xcompose-metrics`) will show you which composables are restartable but not skippable, and unstable lambda captures are often the reason.

## Why Recomposition Is Actually Expensive

When people say "avoid unnecessary recompositions," the real concern isn't the recomposition itself — running a Kotlin function is cheap. The expense comes from three consequences. First, **allocation pressure**: every recomposition potentially creates new lambda objects, modifier chains, and data class instances. The compiler optimizes many away, but unstable parameters force re-execution of entire subtrees even when the output is identical.

Second, **layout invalidation cascading.** When a recomposition produces a different layout node (different size, different children), the layout phase re-measures not just that node but potentially its parent and siblings. In deeply nested layouts, a single leaf recomposition can trigger measurement of dozens of ancestors. This is the old "requestLayout cascade" problem from the View system, and Compose's intrinsic measurements can make it worse by adding extra measurement passes.

Third, **the recomposition scope problem.** Compose doesn't recompose individual lines — it recomposes entire scopes, roughly one restartable composable function. If a state change occurs inside a large composable, the entire function re-executes, and all children get diffed against the slot table, even the ones that didn't change. This is why extracting composables into smaller functions creates tighter recomposition boundaries that limit the blast radius of state changes.

## The Stability System

Compose's stability system determines whether the runtime can skip recomposing a composable when its parent recomposes. A composable is skippable only if **all** its parameters are stable and **equal** to the previous composition's values. A type is stable if it has consistent equality, observable mutations, and all public properties are also stable types.

Primitive types, `String`, function types, and `MutableState` are stable by default. Data classes are stable if all properties are stable. But here's where production code hits problems: **collections are unstable.** `List<T>`, `Map<K, V>`, and `Set<T>` are Kotlin interfaces that could be backed by mutable implementations, so Compose marks them unstable.

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

Marking the wrapper with `@Immutable` is a promise to the compiler: "I guarantee this data won't change without Compose knowing about it." If you break that promise by mutating the list after passing it, you'll get stale UI with no error or warning. `@Stable` is a weaker promise — mutations will be observable through Compose's snapshot system. Use `@Immutable` for truly immutable state, `@Stable` for objects with observable mutable properties.

## Strong Skipping Mode

Starting with Compose compiler 2.0, **strong skipping mode** changes the stability rules significantly. Composables can be skipped even if some parameters are unstable — the runtime falls back to instance equality (`===`) instead of structural equality. If the same object reference is passed, the composable is skipped.

This means a composable receiving `List<Product>` can now be skipped if the same list instance is passed — no `@Immutable` wrapper needed. Lambdas are also automatically remembered, eliminating the common problem of un-remembered lambdas causing child recompositions. But strong skipping changes failure modes: if you create a new list instance with the same contents on every recomposition, the composable won't be skipped because the reference changed. The fix is either `remember` the list or mark the type as stable. You've traded "always recomposes" for "recomposes when reference changes" — better in most cases, but still surprising if you're creating new instances in the composition body.

## Measuring With Layout Inspector and Benchmarks

Knowing the theory is useless without measurement. For frame timing, you need Macrobenchmark with `FrameTimingMetric`, but for finding *which composables* are the problem, Layout Inspector is the tool I reach for first.

In Android Studio, open Layout Inspector while your debug app is running. Under the "Attribute" panel, you'll see two critical columns: **recomposition count** and **skip count** for each composable in the tree. Interact with your UI — scroll a list, type in a search field, toggle a switch — and watch the counts update in real time. A composable with a high recomposition count and zero skips is your smoking gun. It means that composable is re-executing on every state change and Compose can't skip it, usually because of unstable parameters or unstable lambda captures. I've found more performance bugs in 5 minutes with Layout Inspector than in an hour of reading code.

For quantitative measurement, `FrameTimingMetric` in Macrobenchmark gives you P50, P90, P95, and P99 frame durations. For 60fps, every frame must complete in 16.67ms. For 90fps devices, the budget drops to 11.11ms. I care most about P95 — occasional single-frame spikes are invisible to users, but P95 tells you if there's consistent jank.

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

In one of our screens, `FrameTimingMetric` showed P50 at 8ms but P95 at 34ms. Layout Inspector revealed the cause — a header composable recomposing on every scroll pixel because it read scroll state directly in composition. After wrapping the read in a `derivedStateOf` for the visibility boolean and deferring the parallax offset to `graphicsLayer`, P95 dropped to 12ms. That combination — `derivedStateOf` to coalesce the boolean, `graphicsLayer` to defer the visual — is the pattern I use everywhere now.

## Practical Optimization Checklist

After debugging performance in several Compose projects, here's what I check in order. This isn't a list of tips — it's a diagnostic sequence.

**Start with measurement.** Run `FrameTimingMetric` benchmarks on your most complex screens. If P95 is under 16ms, you probably don't have a problem. Don't optimize based on intuition.

**Check recomposition counts.** Open Layout Inspector and interact with the screen. High-frequency recompositions in parent composables are the biggest red flag — they cascade through the entire subtree.

**Defer state reads to the latest possible phase.** Any state that affects only visual properties (alpha, scale, offset, color) should be read in `graphicsLayer` or `drawBehind` lambdas, not in the composition body. This is the single highest-impact optimization in most Compose apps.

**Use derivedStateOf for many-to-few mappings.** If a high-frequency state source (scroll position, text input) drives a low-frequency output (visibility boolean, category label), wrap it in `derivedStateOf` to avoid recomposing on every input change.

**Audit remember and lambda captures.** Check that `remember` calls have appropriate keys for values that change. Check that lambdas passed to child composables don't capture unstable or rapidly-changing values. Use Compose compiler metrics (`-Xcompose-metrics`) to find composables that are never skippable.

**Stabilize your data types.** If you can't enable strong skipping mode yet, audit composable parameters for unstable types. Collections, third-party types, and classes from other modules are the usual suspects.

**Extract recomposition boundaries.** If a large composable reads fast-changing state, extract the state-reading portion into a separate composable. This limits the recomposition scope and prevents siblings from being re-diffed.

The reframe I want to leave you with: **Compose performance is not about avoiding recomposition. It's about controlling which of the three phases run, and limiting how far state changes propagate through the tree.** A recomposition that triggers only drawing is nearly free. A recomposition that cascades through 50 composables because of one unstable parameter is expensive. The phase model is the mental model — once you have it, every optimization technique makes intuitive sense.

Thanks for reading!
