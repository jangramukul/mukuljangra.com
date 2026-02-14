---
title: Compose Rendering Performance Deep Dive
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Performance
---

I used to think Compose performance was all about avoiding unnecessary recompositions. You know the drill — slap `@Stable` on your data classes, use `derivedStateOf` where needed, pass lambdas carefully. The standard advice. And it's not wrong, but it's incomplete. The real understanding came when I stopped looking at recomposition in isolation and started asking: what does Compose actually *do* during a single frame?

Turns out, recomposition is just one of three phases. And it's not always the most expensive one.

Think of it like a restaurant. When you change your order (state changes), three things could happen: the kitchen rewrites the order ticket (composition), the chef re-plans how to plate the dish (layout), and the line cook re-paints the garnish (drawing). Sometimes you only changed the garnish color — you don't need a new ticket or a new plating plan. But if you're not careful, Compose will redo all three steps even when only the garnish changed. Understanding when to trigger which phase changed how I diagnose and fix performance problems entirely.

## The Three-Phase Rendering Pipeline

When Compose renders a frame, it runs three phases in sequence. **Composition** is where your `@Composable` functions execute — it evaluates your code, figures out what UI nodes exist, and produces a tree of layout nodes stored in a structure called the slot table. **Layout** is where each node gets measured and positioned via `measure` and `place` calls. **Drawing** is where the measured, placed nodes actually render pixels to a Canvas.

Here's the thing that makes this powerful: each phase can be triggered independently.

If a `mutableStateOf` value changes and it's only read during drawing (like a color or alpha), Compose skips composition and layout entirely and only re-executes the drawing phase. If a state is only read during layout, Compose skips composition and re-runs layout and drawing. Only states read during composition trigger the full three-phase pipeline. This phase-skipping is one of Compose's most powerful performance features, and most developers don't use it intentionally.

Going back to the restaurant analogy — if you only changed the garnish color, a smart kitchen wouldn't rewrite the entire order ticket and re-plan the plating. It would just tell the line cook: "use green instead of red." That's exactly what Compose does when you read state in the right phase.

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

See the difference? Passing `Float` versus `() -> Float`. That one change is the difference between triggering all three phases on every scroll pixel versus triggering only the drawing phase. In a list with 20 visible cards, that's the difference between smooth scrolling and visible jank. The `graphicsLayer` modifier reads state in the draw phase because it operates at the RenderNode level — it doesn't need to re-measure or re-position anything, just repaint with new parameters.

> **💡 The "aha" moment:** The biggest performance win in most Compose apps isn't avoiding recomposition — it's making sure state reads happen in the *latest possible phase*. If a value only affects how something looks (not what exists or where it sits), read it in the drawing phase.

## Inside the Slot Table and How `remember` Works

The slot table is Compose's internal data structure that stores composition state — the UI tree, remembered values, and the metadata Compose needs to know what changed. But here's where Compose differs from what you might expect: it doesn't build a traditional tree of objects like the View system. Instead, it uses a flat array where composable calls are stored linearly as they execute, with group markers defining the tree structure.

Sounds weird, right? Imagine a notebook where you write down every function call in order, left to right, with little bookmarks saying "this group starts here, this group ends here." That linear layout means Compose can walk the table sequentially during recomposition, comparing new outputs against the previous frame using gap buffers — a technique borrowed from text editors. Yes, text editors. The same data structure your IDE uses to efficiently insert characters in the middle of a document is what Compose uses to efficiently update your UI tree.

Now, here's the thing most developers miss: `remember` is not magic. It's a slot table operation. When you call `remember { expensiveCalculation() }`, Compose stores the result at a specific position in the slot table corresponding to that call site. On the next recomposition, it reads the stored value from that same position instead of re-executing the lambda. The key insight is that `remember` is positional — two `remember` calls in the same composable occupy different slots, and moving a `remember` call changes which slot it reads from.

This is where `remember(key)` becomes critical. Without a key, `remember` keeps the cached value forever (until the composable leaves the composition). With a key, Compose invalidates the cached value when the key changes. If you're computing a filtered list based on a search query, you need `remember(query) { items.filter { it.contains(query) } }` — otherwise the filter result goes stale when the query changes. I've seen this exact bug in production: a search screen that showed results for the first query and never updated because the `remember` had no key. The user would type a new query and... nothing. Stale results, no errors, no warnings. Just a confused QA engineer filing a bug.

`rememberSaveable` extends this further — it survives configuration changes and process death by writing to a `SavedStateHandle`. But it comes with a constraint: the value must be saveable (primitives, `Parcelable`, or a custom `Saver`). Use `remember` for expensive computations that can be recalculated, `rememberSaveable` for user input state that would be frustrating to lose. And the most common mistake I see? `remember { mutableStateOf(value) }` where `value` is a parameter — when the parameter changes, the state doesn't update because `remember` has no key on that parameter. The state is stuck holding the original value forever, like a sticky note you forgot to update.

## derivedStateOf — Coalescing Rapid Changes

Once you understand `remember`, `derivedStateOf` is the natural next step. It creates a derived state that only triggers recomposition when its *result* actually changes, not when the inputs change. This distinction matters enormously for high-frequency state sources like scroll position.

Imagine a water pipe with a sensor at the end. Water pressure (your scroll offset) changes constantly — every frame during a fling, potentially 60+ times per second. But the sensor only cares about one thing: is the pressure above the threshold or not? A boolean. Without `derivedStateOf`, every tiny pressure fluctuation triggers an alarm (recomposition). With it, the alarm only goes off on the two transitions: above-to-below and below-to-above. That's going from 60 recompositions per second to maybe 2 during the entire scroll gesture.

Here's what that looks like in practice with a collapsible header:

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

But `derivedStateOf` isn't free, and I've seen people overuse it. It adds overhead — it creates a snapshot observer and tracks dependencies. If your derived value changes just as often as the source (like mapping a number to a slightly different number), `derivedStateOf` adds cost with no benefit. It's specifically designed for many-to-few mappings: many input changes producing few output changes. If the output changes every time the input changes, you're paying extra overhead for zero gain.

## Lambda Optimization and the Compose Compiler

The Compose compiler does a surprising amount of work with lambdas behind the scenes. When you write `onClick = { viewModel.doThing() }`, the compiler sees that this lambda captures `viewModel`, checks if `viewModel` is stable, and if so, wraps the lambda so it can be compared across recompositions. If the captures haven't changed, Compose reuses the existing lambda instance instead of creating a new one. This means the child composable receiving `onClick` can be skipped — the lambda parameter is "equal" to the previous one.

But this breaks down when the lambda captures unstable or changing values. `onClick = { doThing(mutableVar) }` captures `mutableVar`, and if it's a local variable that changes on every recomposition, the compiler can't prove the lambda is the same. A new lambda instance gets created each time, the child composable sees a different function reference, and it recomposes even if nothing visible changed.

This is one of the sneakiest performance issues in Compose because the code looks completely innocent. You're staring at it thinking "why is this recomposing?" and the answer is hiding inside a lambda capture you didn't think about.

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

The fix is subtle but important: instead of capturing the entire `products` list (unstable) to call `indexOf`, capture only `product.id` (stable) and let the ViewModel handle the lookup. The lambda captures are now stable, Compose can compare them across recompositions, and the child `ProductCard` can actually be skipped.

With strong skipping mode enabled, lambdas are automatically remembered, which eliminates most of these issues. But if you're not on strong skipping yet, audit your lambda captures carefully. The Compose compiler metrics report (`-Xcompose-metrics`) will show you which composables are restartable but not skippable, and unstable lambda captures are often the reason.

## Why Recomposition Is Actually Expensive

When people say "avoid unnecessary recompositions," you might think the concern is running the Kotlin function itself. But no — running a Kotlin function is cheap. The real expense comes from three consequences that pile up.

First, **allocation pressure.** Every recomposition potentially creates new lambda objects, modifier chains, and data class instances. Think of it like a factory floor — the compiler optimizes many allocations away, but unstable parameters force re-execution of entire subtrees even when the output is identical. You're running the whole assembly line to produce the exact same product.

Second, **layout invalidation cascading.** When a recomposition produces a different layout node (different size, different children), the layout phase re-measures not just that node but potentially its parent and siblings. In deeply nested layouts, a single leaf recomposition can trigger measurement of dozens of ancestors. This is the old "requestLayout cascade" problem from the View system, and Compose's intrinsic measurements can make it worse by adding extra measurement passes.

Third, **the recomposition scope problem.** Compose doesn't recompose individual lines — it recomposes entire scopes, roughly one restartable composable function. If a state change occurs inside a large composable, the entire function re-executes, and all children get diffed against the slot table, even the ones that didn't change. It's like renovating one room in your house but having the inspector re-examine every room because they're all on the same permit. This is why extracting composables into smaller functions creates tighter recomposition boundaries that limit the blast radius of state changes.

> **🧠 Think about it:** If you have a 200-line composable function that reads a fast-changing state value, how much of that function re-executes on each state change? All of it. Every single line. What if you extracted just the state-reading part into a 10-line child composable?

## The Stability System

Compose's stability system determines whether the runtime can skip recomposing a composable when its parent recomposes. A composable is skippable only if **all** its parameters are stable and **equal** to the previous composition's values. A type is stable if it has consistent equality, observable mutations, and all public properties are also stable types.

Primitive types, `String`, function types, and `MutableState` are stable by default. Data classes are stable if all properties are stable. But here's where production code hits problems: **collections are unstable.** `List<T>`, `Map<K, V>`, and `Set<T>` are Kotlin interfaces that could be backed by mutable implementations, so Compose marks them unstable.

Wait, what? Your `List<Product>` that you never mutate, that comes straight from a Room query, that you'd swear on your life is immutable — Compose still treats it as unstable. Because `List` is a Kotlin *interface*, and someone, somewhere, could hand Compose a `MutableList` disguised as a `List`. Compose can't take that chance, so it assumes the worst.

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

Marking the wrapper with `@Immutable` is a promise to the compiler: "I guarantee this data won't change without Compose knowing about it." If you break that promise by mutating the list after passing it, you'll get stale UI with no error or warning. No crash. No lint warning. Just a silent lie and confused users seeing old data.

`@Stable` is a weaker promise — mutations will be observable through Compose's snapshot system. Use `@Immutable` for truly immutable state, `@Stable` for objects with observable mutable properties.

## Strong Skipping Mode

Starting with Compose compiler 2.0, **strong skipping mode** changes the stability rules significantly. Composables can be skipped even if some parameters are unstable — the runtime falls back to instance equality (`===`) instead of structural equality. If the same object reference is passed, the composable is skipped.

This means a composable receiving `List<Product>` can now be skipped if the same list instance is passed — no `@Immutable` wrapper needed. Lambdas are also automatically remembered, eliminating the common problem of un-remembered lambdas causing child recompositions.

But strong skipping changes failure modes, and this is worth understanding. If you create a new list instance with the same contents on every recomposition, the composable won't be skipped because the *reference* changed. Same data, different object, no skip. The fix is either `remember` the list or mark the type as stable. You've traded "always recomposes" for "recomposes when reference changes" — better in most cases, but still surprising if you're creating new instances in the composition body.

> **⚡ Quick check:** You have strong skipping enabled and a composable that takes `List<String>`. You pass `listOf("a", "b", "c")` on every recomposition. Will the composable skip? No — `listOf()` creates a new instance each time, and strong skipping uses `===` for unstable types.

## Measuring With Layout Inspector and Benchmarks

Knowing the theory is useless without measurement. You can have the most beautiful mental model of Compose's three-phase pipeline, but if you're not measuring, you're just guessing. For frame timing, you need Macrobenchmark with `FrameTimingMetric`, but for finding *which composables* are the problem, Layout Inspector is the tool I reach for first.

In Android Studio, open Layout Inspector while your debug app is running. Under the "Attribute" panel, you'll see two critical columns: **recomposition count** and **skip count** for each composable in the tree. Now interact with your UI — scroll a list, type in a search field, toggle a switch — and watch the counts update in real time. A composable with a high recomposition count and zero skips is your smoking gun. It means that composable is re-executing on every state change and Compose can't skip it, usually because of unstable parameters or unstable lambda captures. I've found more performance bugs in 5 minutes with Layout Inspector than in an hour of reading code.

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

> **🔥 Real talk:** In one of our screens, `FrameTimingMetric` showed P50 at 8ms but P95 at 34ms. Layout Inspector revealed the cause — a header composable recomposing on every scroll pixel because it read scroll state directly in composition. After wrapping the read in a `derivedStateOf` for the visibility boolean and deferring the parallax offset to `graphicsLayer`, P95 dropped to 12ms. That combination — `derivedStateOf` to coalesce the boolean, `graphicsLayer` to defer the visual — is the pattern I use everywhere now.

## Practical Optimization Checklist

After debugging performance in several Compose projects, here's what I check in order. This isn't a list of tips — it's a diagnostic sequence. Follow it top to bottom, and you'll catch the vast majority of Compose performance issues before they reach production.

**Start with measurement.** Run `FrameTimingMetric` benchmarks on your most complex screens. If P95 is under 16ms, you probably don't have a problem. Don't optimize based on intuition — measure first, optimize second.

**Check recomposition counts.** Open Layout Inspector and interact with the screen. High-frequency recompositions in parent composables are the biggest red flag — they cascade through the entire subtree like dominoes.

**Defer state reads to the latest possible phase.** Any state that affects only visual properties (alpha, scale, offset, color) should be read in `graphicsLayer` or `drawBehind` lambdas, not in the composition body. This is the single highest-impact optimization in most Compose apps. Remember the restaurant analogy — don't rewrite the whole order ticket when only the garnish color changed.

**Use derivedStateOf for many-to-few mappings.** If a high-frequency state source (scroll position, text input) drives a low-frequency output (visibility boolean, category label), wrap it in `derivedStateOf` to avoid recomposing on every input change.

**Audit remember and lambda captures.** Check that `remember` calls have appropriate keys for values that change. Check that lambdas passed to child composables don't capture unstable or rapidly-changing values. Use Compose compiler metrics (`-Xcompose-metrics`) to find composables that are never skippable.

**Stabilize your data types.** If you can't enable strong skipping mode yet, audit composable parameters for unstable types. Collections, third-party types, and classes from other modules are the usual suspects.

**Extract recomposition boundaries.** If a large composable reads fast-changing state, extract the state-reading portion into a separate composable. This limits the recomposition scope and prevents siblings from being re-diffed unnecessarily.

The reframe I want to leave you with: **Compose performance is not about avoiding recomposition. It's about controlling which of the three phases run, and limiting how far state changes propagate through the tree.** A recomposition that triggers only drawing is nearly free. A recomposition that cascades through 50 composables because of one unstable parameter is expensive. The phase model is the mental model — once you have it, every optimization technique makes intuitive sense.

Thanks for reading!
