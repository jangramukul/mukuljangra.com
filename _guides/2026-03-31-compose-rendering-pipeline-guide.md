---
title: Compose Rendering Pipeline — Composition, Layout, Drawing
layout: post
sequence: 125
categories: post
tags:
  - Jetpack Compose
  - Android
---

Every Compose frame goes through three phases: Composition, Layout, and Drawing. I didn't fully appreciate this until I spent a week chasing a scroll jank issue that had nothing to do with recomposition. Layout Inspector confirmed zero unnecessary recompositions. The problem was a `Modifier.offset` reading scroll state in composition, triggering all three phases on every scroll pixel. Swapping to the lambda variant reduced the work to layout and drawing only, and the jank disappeared.

Most performance bugs come from triggering the wrong phase at the wrong time. You don't need to avoid recomposition at all costs — you need to understand which phase your state read triggers and whether that's the minimum necessary work. Once this mental model clicks, every optimization technique in Compose — `graphicsLayer`, `derivedStateOf`, lambda-based modifiers — makes intuitive sense instead of feeling like arbitrary rules.

## Phase 1: Composition

Composition is where your `@Composable` functions actually execute. The runtime calls your composable code, evaluates conditionals, executes `remember` blocks, reads state values, and produces a tree of UI nodes stored in the slot table — a flat, gap-buffered array that tracks every composable invocation and remembered value.

The critical thing: any `mutableStateOf` value you read here creates a subscription. When that state changes, the runtime schedules the enclosing restart scope for recomposition. The snapshot system records what you read during composition and automatically knows what to re-run.

```kotlin
@Composable
fun OrderStatus(viewModel: OrderViewModel) {
    // State read happens in composition phase
    val status by viewModel.orderStatus.collectAsStateWithLifecycle()

    // This entire composable is the restart scope.
    // When orderStatus changes, Compose re-executes this function.
    Column {
        Text("Order: ${status.orderId}")
        Text("Status: ${status.displayName}")
        if (status.isDelivered) {
            DeliveryConfirmation(status.deliveredAt)
        }
    }
}
```

Composition determines **what** UI nodes exist. If `isDelivered` flips from `false` to `true`, composition adds the `DeliveryConfirmation` node. If it flips back, the node is removed entirely — it doesn't exist in the tree, zero cost during layout and drawing. This is fundamentally different from `visibility = GONE` in the View system.

Here's the thing most developers miss: modifier chains are also constructed during composition. When you write `Modifier.padding(16.dp).background(Color.White)`, those modifier objects are created in this phase. If the composable recomposes, the entire chain is rebuilt. This is why reading fast-changing state in modifier parameters (not lambda-based modifiers) is expensive — it forces composition, which rebuilds every modifier in the chain.

## Phase 2: Layout

After composition produces the tree, layout measures and positions every node in two steps: **measure**, then **place**. Compose enforces a strict rule — each node is measured exactly once per layout pass. No double measurement. In the View system, a `RelativeLayout` inside a `LinearLayout` with `layout_weight` could measure children multiple times, producing exponential measurement passes in deeply nested layouts. Compose eliminated this entirely.

During measure, a parent receives constraints, measures its children, and reports its own size. During place, it positions each child. The entire tree is walked top-down in a single pass, so layout scales linearly with node count.

Now, the distinction that matters for performance — `Modifier.offset` versus the lambda variant:

```kotlin
@Composable
fun ParallaxHeader(scrollProvider: () -> Int) {
    // **Wrong**: reads state in composition, triggers all 3 phases
    val scroll = scrollProvider()
    Image(
        painter = painterResource(R.drawable.header_bg),
        contentDescription = "Header",
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .offset(y = with(LocalDensity.current) { (scroll / 2).toDp() })
    )

    // **Correct**: lambda defers read to layout phase, skips composition
    Image(
        painter = painterResource(R.drawable.header_bg),
        contentDescription = "Header",
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .offset { IntOffset(x = 0, y = scrollProvider() / 2) }
    )
}
```

The first version reads `scroll` in the composition body, so the state subscription lives in the composition phase. Every scroll pixel triggers recomposition, modifier chain rebuild, layout, and drawing — all three phases for a simple position change. The lambda version defers the read to the placement step of layout, skipping composition entirely.

On a screen with a parallax header and a `LazyColumn`, the first approach means the content area recomposes on every scroll frame. The second approach just repositions the header during layout. I measured this on a mid-range device — 14ms per frame versus 3ms.

## Phase 3: Drawing

Drawing is the final phase — rendering pixels to the screen. Each node draws itself onto a Canvas. Drawing modifiers like `Modifier.drawBehind`, `Modifier.drawWithContent`, and `Canvas` composable execute here. State reads in this phase only trigger redrawing — no recomposition, no re-layout.

The star of this phase is `Modifier.graphicsLayer`. It operates at the RenderNode level, meaning it can change alpha, scale, rotation, translation, and shadow elevation without affecting layout or composition. State read inside a `graphicsLayer` lambda is tracked only in the drawing phase.

```kotlin
@Composable
fun FadingCard(alphaProvider: () -> Float) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer {
                // State read in drawing phase only
                alpha = alphaProvider()
            }
    ) {
        // This content is NOT recomposed or re-laid-out
        // when alpha changes
        Text("Product details")
        PriceBreakdown()
        AddToCartButton()
    }
}
```

This is where the phase model pays off. If `PriceBreakdown` and `AddToCartButton` are expensive composables, changing the card's alpha through `graphicsLayer` doesn't touch any of them. Compose paints the same pixels with a different alpha at the RenderNode level. On a 16ms frame budget, this is the difference between a 1ms draw update and an 8ms full recomposition.

`graphicsLayer` also enables hardware-accelerated transformations. Rotation, scale, and translation are GPU operations — they transform the cached render node without redrawing content.

## Deferring State Reads

The golden rule of Compose performance: **defer state reads to the latest possible phase**. If a state change only affects visual properties, read it in drawing. If it only affects position, read it in layout. Only read in composition if it changes what nodes exist.

This explains why many Compose APIs have both a value and a lambda variant. `Modifier.offset(x, y)` reads in composition. `Modifier.offset { IntOffset(x, y) }` reads in layout. `Modifier.alpha(value)` reads in composition. `Modifier.graphicsLayer { alpha = value }` reads in drawing.

Here's a scroll-linked fade effect done wrong versus right:

```kotlin
@Composable
fun ScrollFadeEffect(listState: LazyListState) {
    // **Wrong**: reading scroll offset in composition
    val scrollOffset = listState.firstVisibleItemScrollOffset
    val fadeAlpha = (1f - scrollOffset / 300f).coerceIn(0f, 1f)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .alpha(fadeAlpha) // composition-phase read
    ) {
        Text("Featured Section", style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
fun ScrollFadeEffectOptimized(listState: LazyListState) {
    // **Correct**: deferring scroll read to drawing phase
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .graphicsLayer {
                alpha = (1f - listState.firstVisibleItemScrollOffset / 300f)
                    .coerceIn(0f, 1f)
            }
    ) {
        Text("Featured Section", style = MaterialTheme.typography.titleLarge)
    }
}
```

In the wrong version, every scroll pixel triggers composition (rebuilds `Box` and modifiers), layout (re-measures), and drawing. In the correct version, only drawing runs — Compose reads the offset inside `graphicsLayer`, calculates alpha, and repaints the render node.

The difference compounds with complexity. A simple `Box` with `Text` might recompose in under 1ms. But put this inside a `LazyColumn` item with images, text fields, and nested layouts, and unnecessary recomposition per scroll pixel becomes visible jank.

## Phase-Aware Performance

Once you internalize the phase model, several optimization patterns fall into place.

**`derivedStateOf` batches composition updates.** When a high-frequency state source drives a low-frequency output, `derivedStateOf` prevents unnecessary compositions. Scroll offset changes 60 times per second during a fling, but whether the "scroll to top" button appears is a boolean that flips at most twice. Without `derivedStateOf`, 60 recompositions per second. With it, only when the boolean flips.

```kotlin
@Composable
fun ProductFeed(listState: LazyListState) {
    // derivedStateOf: composition only runs when the boolean flips
    val showScrollToTop by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 3 }
    }

    // graphicsLayer: alpha animation runs in drawing phase only
    AnimatedVisibility(
        visible = showScrollToTop,
        enter = fadeIn(),
        exit = fadeOut()
    ) {
        FloatingActionButton(
            onClick = { /* scroll to top */ },
            modifier = Modifier.graphicsLayer {
                scaleX = 0.9f + 0.1f * alpha
                scaleY = 0.9f + 0.1f * alpha
            }
        ) {
            Icon(Icons.Default.ArrowUpward, "Scroll to top")
        }
    }
}
```

**`Modifier.graphicsLayer` for animations.** Any animation that changes alpha, scale, rotation, or translation should run through `graphicsLayer`. I've seen teams animate `Modifier.size()` for a pulsing effect when `Modifier.graphicsLayer { scaleX = ...; scaleY = ... }` achieves the same visual without triggering layout every frame. The `size()` approach forces layout recalculation for the node and its siblings, while `graphicsLayer` just transforms the cached render node.

**`LazyListState.firstVisibleItemIndex` needs care.** This property changes on every visible item transition during scrolling. If you read it directly in composition for a visual effect, every change triggers recomposition. The fix depends on what you're doing: deriving a boolean (show/hide a button) — wrap in `derivedStateOf`. Using it for a visual offset or fade — defer to `graphicsLayer` or a lambda modifier. Changing what composables exist based on the index — reading in composition is correct.

The mistake is treating all state reads the same. Showing a FAB based on scroll position is a composition concern — the node appears or disappears. Calculating a parallax offset is a layout concern — no nodes change, just positions. Calculating opacity is a drawing concern — no nodes change, no positions change, just paint properties. Match the phase to the type of change.

## Quiz

**Q1:** You have a composable that reads a `MutableState<Color>` to set its `Modifier.background(color)`. The color changes rapidly during an animation. Which phases does Compose trigger on each color change?

**Wrong**: "Only the drawing phase, because it's just a color change."

**Correct**: All three phases — composition, layout, and drawing. `Modifier.background(color)` reads the color value in the composition phase (when the modifier chain is built). To limit it to the drawing phase, use `Modifier.drawBehind { drawRect(color) }` instead, which reads the color in draw code only.

**Q2:** You call `Modifier.offset(y = animatedDp)` where `animatedDp` is a state-backed animated value. What changes if you switch to `Modifier.offset { IntOffset(0, animatedPx) }`?

**Wrong**: "Nothing — both move the composable by the same amount."

**Correct**: The visual result is the same, but phases differ. The first reads the animated value during composition, triggering all three phases every frame. The lambda version defers the read to layout's placement step, skipping composition entirely. During a 300ms animation at 60fps, that's 18 unnecessary recompositions eliminated.

## Coding Challenge

Build a `LazyColumn` with a sticky header that fades out as the user scrolls and collapses in height. Read the scroll offset from `LazyListState` and apply it phase-correctly: use `graphicsLayer { alpha = ... }` for the fade (drawing phase only) and `Modifier.offset { ... }` for the collapse (layout phase only). Verify with Layout Inspector that the header's recomposition count stays at zero during scrolling. Then intentionally break it by reading scroll state in the composable body and compare the recomposition counts.

Thanks for reading!
