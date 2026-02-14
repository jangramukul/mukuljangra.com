---
title: "Layouts, Modifiers & Custom Drawing"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 20
sequence: 20
description: "Layout and drawing questions test whether you actually understand how Compose renders UI under the hood."
---

## Layouts, Modifiers & Custom Drawing

Layout and drawing questions test whether you actually understand how Compose renders UI under the hood. Interviewers use these to separate candidates who just use `Column` and `Row` from those who can build custom UI components from scratch.

#### What is the difference between Row, Column, and Box?

`Row` places children horizontally, one after another. `Column` places children vertically. `Box` stacks children on top of each other, with the last child drawn on top. These are the three fundamental layout composables, and they're all built on top of the `Layout` composable internally.

`Row` and `Column` support arrangement and alignment — `horizontalArrangement` and `verticalAlignment` in `Row`, and the reverse in `Column`. `Box` uses `contentAlignment` to position children within the available space. You pick the one that matches how you want children arranged.

#### How does the weight modifier work in Row and Column?

`Modifier.weight` distributes remaining space among children proportionally. A child with `weight(1f)` gets an equal share. If one child has `weight(2f)` and another has `weight(1f)`, the first gets twice as much space.

```kotlin
Row(modifier = Modifier.fillMaxWidth()) {
    Text("Left", modifier = Modifier.weight(1f))
    Text("Right", modifier = Modifier.weight(2f))
}
```

`weight` is a scoped modifier — it's only available inside `RowScope` or `ColumnScope`. It measures weighted children last, after non-weighted children have been measured, and distributes whatever space remains. If `fill` is `true` (the default), the child is forced to occupy its full allocated space. If `false`, the child can be smaller.

#### Why does modifier order matter in Compose?

Modifiers are applied in the order you chain them. Each modifier wraps the result of the previous one. If you apply `padding` before `background`, the padding is outside the background. If you apply `background` before `padding`, the background extends behind the padding area.

```kotlin
// Background does NOT cover the padding area
Modifier
    .padding(16.dp)
    .background(Color.Blue)

// Background covers the padding area
Modifier
    .background(Color.Blue)
    .padding(16.dp)
```

The same applies to `clickable`. If `clickable` comes before `padding`, the padding area is also clickable. If `padding` comes first, only the inner content responds to taps. This is one of the most common sources of bugs in Compose UI code.

#### What happens when you apply size modifiers in different positions in the chain?

The first size modifier in the chain wins because it sets constraints that inner modifiers must respect. If you write `Modifier.size(100.dp).size(200.dp)`, the outer `size(100.dp)` constrains the inner one, so the composable ends up at 100dp. The exception is `requiredSize`, which ignores incoming constraints and forces the exact size.

```kotlin
// Composable is 100.dp — outer size wins
Modifier.size(100.dp).size(200.dp)

// Composable is 200.dp — requiredSize ignores constraints
Modifier.size(100.dp).requiredSize(200.dp)
```

This is why composables should accept a `modifier` parameter and apply it as the outermost modifier — so callers can control sizing.

#### What is the difference between offset and padding?

`padding` changes the measured size of the composable. It adds space and the parent accounts for it. `offset` shifts the composable visually without changing its measured size or affecting sibling positions. A composable with `offset` can overlap others because the layout system still thinks it's at its original position.

Use `padding` for structural spacing and `offset` for visual displacement. The lambda overload `offset { IntOffset(x, y) }` defers the read to the layout phase, which avoids unnecessary recompositions when animating position.

#### What are the three phases of Compose rendering?

Compose renders UI in three phases, in this order:

- **Composition** — runs composable functions and builds the UI tree. Determines what elements exist.
- **Layout** — measures each node and determines its position. Each node measures children, decides its own size, and places children. Single top-down pass.
- **Drawing** — renders nodes to the screen using canvas draw commands.

These phases can be skipped independently. If only a `graphicsLayer` property changes (like alpha or rotation), Compose skips composition and layout entirely and only re-draws. Understanding which phase your change affects is how you write performant Compose UI.

#### How does clip work in Compose?

`Modifier.clip` restricts drawing to a specific shape. Content outside the shape boundary is not rendered. Common shapes include `RoundedCornerShape`, `CircleShape`, and `CutCornerShape`.

```kotlin
Image(
    painter = painterResource(R.drawable.avatar),
    contentDescription = "Avatar",
    modifier = Modifier
        .size(80.dp)
        .clip(CircleShape)
)
```

Clip is implemented using `graphicsLayer` under the hood — it sets the `clip` property to `true` and applies the shape. One important detail: `clip` affects both drawing and hit testing. If you clip to a circle, taps outside the circle won't register. If you need a shadow outside the clipped area, apply `shadow` before `clip` in the modifier chain.

#### How do you create a custom shape for clipping?

You create a custom `Shape` by implementing the `createOutline` function, which returns an `Outline` based on the available size and layout direction. The outline can be a rectangle, rounded rectangle, or an arbitrary `Path`.

```kotlin
class DiagonalShape : Shape {
    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density
    ): Outline {
        val path = Path().apply {
            moveTo(0f, 0f)
            lineTo(size.width, 0f)
            lineTo(size.width, size.height * 0.8f)
            lineTo(0f, size.height)
            close()
        }
        return Outline.Generic(path)
    }
}

Image(
    painter = painterResource(R.drawable.banner),
    contentDescription = "Banner",
    modifier = Modifier
        .fillMaxWidth()
        .height(200.dp)
        .clip(DiagonalShape())
)
```

#### What is graphicsLayer and when would you use it?

`Modifier.graphicsLayer` draws the composable's content into a separate render layer, similar to a `RenderNode` on Android. It supports `scaleX`, `scaleY`, `rotationX`, `rotationY`, `rotationZ`, `translationX`, `translationY`, and `alpha` — all without triggering recomposition or re-measurement. It only affects the draw phase.

```kotlin
Image(
    painter = painterResource(R.drawable.profile),
    contentDescription = "Profile",
    modifier = Modifier.graphicsLayer {
        scaleX = 1.2f
        scaleY = 1.2f
        rotationZ = 15f
        alpha = 0.8f
    }
)
```

Because `graphicsLayer` doesn't change measured size or placement, the composable can overlap siblings if the transformation makes it larger. This is intentional — it lets you animate visual properties cheaply without causing layout recalculations.

#### What are the three main drawing modifiers in Compose?

- `Modifier.drawBehind` — draws behind the composable content. The `Canvas` composable is actually just a wrapper around `drawBehind`.
- `Modifier.drawWithContent` — gives you control over drawing order. You call `drawContent()` to render the composable, and you can draw before or after it.
- `Modifier.drawWithCache` — same as the others but caches objects like `Brush`, `Path`, and `Shader` so they're not reallocated on every draw call. The cache stays valid as long as the drawing area size stays the same and state objects haven't changed.

All three give you a `DrawScope` with the `size`, coordinate system, and draw functions like `drawRect`, `drawCircle`, `drawLine`, and `drawPath`.

#### What is Canvas in Compose and how is it different from Android's Canvas?

The Compose `Canvas` composable is a wrapper around `Modifier.drawBehind`. It gives you a `DrawScope` where you can issue draw commands. Unlike Android's `Canvas` class which you get in `onDraw()` of a custom View, Compose's `DrawScope` provides a higher-level API with built-in support for transformations like `rotate`, `scale`, `translate`, and `withTransform`.

```kotlin
Canvas(modifier = Modifier.fillMaxSize()) {
    drawCircle(
        color = Color.Blue,
        radius = 100.dp.toPx(),
        center = Offset(size.width / 2, size.height / 2)
    )
}
```

You can still access the underlying Android `Canvas` through `drawIntoCanvas { canvas -> ... }` if you need platform-specific APIs like `drawText` with `TextPaint`.

#### What is Brush in Compose?

`Brush` defines how colors fill a shape or path. The most common types are:

- `Brush.linearGradient` — colors spread in a straight line from start to end.
- `Brush.radialGradient` — colors spread outward from a center point.
- `Brush.sweepGradient` — colors sweep around a center point in a circle.

```kotlin
Canvas(modifier = Modifier.fillMaxSize()) {
    drawRect(
        brush = Brush.linearGradient(
            colors = listOf(Color.Blue, Color.Cyan, Color.Green),
            start = Offset.Zero,
            end = Offset(size.width, size.height)
        )
    )
}
```

You can also use `Brush.verticalGradient` and `Brush.horizontalGradient` as shortcuts. Brushes are often used with `drawWithCache` to avoid reallocating them on every frame.

#### How does the modifier chain work internally?

Internally, a modifier chain is a linked list of `Modifier.Element` nodes folded together using `then`. When you write `Modifier.padding(8.dp).background(Color.Red)`, you're creating a chain where `padding` wraps `background`, which wraps the actual content. Each modifier element creates a corresponding node in the layout tree.

Layout modifiers affect measurement, drawing modifiers affect rendering, and pointer input modifiers affect touch handling. They're processed from outer to inner during measurement (first modifier measures first) and inner to outer during drawing (content draws first, then outer modifiers draw on top).

Since Compose 1.5, modifiers use a node-based system instead of the old composed modifier approach. This reduces allocations and makes modifier application more efficient, especially during recomposition where unchanged modifier nodes can be reused.

#### How does the Layout composable work?

The `Layout` composable is the building block for custom layouts. Every built-in layout like `Column`, `Row`, and `Box` is built on top of it. It takes a `content` lambda and a `MeasurePolicy` that defines how to measure and place children.

```kotlin
@Composable
fun VerticalStack(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Layout(
        content = content,
        modifier = modifier
    ) { measurables, constraints ->
        val placeables = measurables.map { it.measure(constraints) }
        val height = placeables.sumOf { it.height }
        val width = placeables.maxOf { it.width }
        layout(width, height) {
            var y = 0
            placeables.forEach { placeable ->
                placeable.placeRelative(0, y)
                y += placeable.height
            }
        }
    }
}
```

The process has three steps: measure children, decide own size, place children. A key rule is that each child can only be measured once — measuring twice throws an `IllegalStateException`. This single-pass constraint is what makes Compose layouts performant.

#### What is the difference between the layout modifier and the Layout composable?

The `layout` modifier (lowercase) changes how a single composable is measured and placed. It receives one `measurable` and `constraints`. The `Layout` composable (uppercase) creates an entirely new layout that can measure and place multiple children — it receives a list of `measurables`.

Use the `layout` modifier when you want to adjust a single element's measurement, like adding baseline padding or shifting placement. Use the `Layout` composable when you need to arrange multiple children in a custom way, like a flow layout or a staggered grid.

#### What is the difference between Modifier.layout and Modifier.offset for positioning?

Both can move a composable, but they work differently. `Modifier.offset` shifts the composable visually without changing its reported size — the parent still sees the original bounds. `Modifier.layout` gives you full control over both measurement and placement, so you can change the reported size.

If you use `offset(x = 20.dp)`, the parent lays out siblings as if the composable didn't move. If you use `layout` and shift the placement, you can also adjust the reported width and height so siblings react to the new position. For most cases, `offset` is simpler. Use `layout` when you need to change the measurement itself, like the `paddingFromBaseline` modifier that adjusts height based on text baseline position.

#### What are intrinsic measurements and when are they needed?

Compose has a strict rule: you can only measure a child once. But sometimes a parent needs to know something about a child's size before measuring it. Intrinsic measurements solve this by letting you query a child's preferred size without actually measuring it.

There are four intrinsic queries: `IntrinsicSize.Min` and `IntrinsicSize.Max` for both width and height. A common use case is a `Row` with a `Divider` that should match the height of the tallest text.

```kotlin
Row(modifier = Modifier.height(IntrinsicSize.Min)) {
    Text("Left", modifier = Modifier.weight(1f))
    VerticalDivider(
        modifier = Modifier.fillMaxHeight().width(1.dp)
    )
    Text("Right", modifier = Modifier.weight(1f))
}
```

Without `Modifier.height(IntrinsicSize.Min)`, the divider either fills the max height or collapses to zero. With it, the `Row` queries each child's minimum intrinsic height and uses the maximum as its constraint. When creating custom layouts, you can override `minIntrinsicWidth`, `minIntrinsicHeight`, `maxIntrinsicWidth`, and `maxIntrinsicHeight` in your `MeasurePolicy` for accurate values.

#### What is SubcomposeLayout and how does LazyColumn use it?

`SubcomposeLayout` defers composition of children until the measurement phase. In a regular `Layout`, all children are composed before measurement. `SubcomposeLayout` lets you compose children on-demand based on information available only during measurement, like the available size.

`LazyColumn` uses `SubcomposeLayout` internally because it needs to know how much space is available before deciding which items to compose. It only composes items visible in the viewport plus a small prefetch buffer. Items that scroll out are disposed, new items are composed as they scroll in. This is what makes lazy lists efficient — they don't hold the entire list in the composition tree.

The tradeoff is that `SubcomposeLayout` doesn't support lookahead-based animations as smoothly and has more overhead because it runs composition during the measure pass. For most custom layouts, the regular `Layout` composable is preferred.

#### How do alignment lines work in custom layouts?

Alignment lines let composables communicate special positions to their parent layouts. Every `Text` composable provides `FirstBaseline` and `LastBaseline` alignment lines. Parent layouts like `Row` use these to align children by their baselines instead of their top edges.

In a custom `Layout`, you read alignment lines from a `Placeable` using bracket syntax: `placeable[FirstBaseline]`. The value is `AlignmentLine.Unspecified` if the child doesn't provide that line. You can also define custom alignment lines for your own layouts — useful for aligning non-text elements with text baselines or creating specialized grid alignments.

#### What is CompositingStrategy in graphicsLayer?

`CompositingStrategy` controls how a layer's content is composited with what's underneath:

- **Auto** (default) — the system decides whether to use an offscreen buffer. Alpha and blend modes apply directly to drawn content.
- **Offscreen** — creates a separate offscreen buffer, applies transformations and blend modes, then composites the result. Required for mask effects where you use `BlendMode.Clear` to cut out shapes.
- **ModulateAlpha** — applies alpha directly to each draw instruction without an offscreen buffer. More efficient for simple alpha, but children's colors can blend with each other instead of fading uniformly.

```kotlin
Box(modifier = Modifier.graphicsLayer {
    alpha = 0.5f
    compositingStrategy = CompositingStrategy.Offscreen
}) {
    Text("Username")
    Icon(Icons.Default.Person, contentDescription = null)
}
```

The Offscreen strategy is essential for mask effects. Without it, `BlendMode.Clear` clears through to the window background instead of just the layer content.

#### What are Window Size Classes and how do you build adaptive layouts?

Window Size Classes categorize the app window into three width buckets: `Compact` (phone portrait), `Medium` (tablet portrait or foldable), and `Expanded` (tablet landscape or desktop). They replace hardcoded breakpoints with semantic categories.

```kotlin
val windowSizeClass = currentWindowAdaptiveInfo()
    .windowSizeClass

when (windowSizeClass.windowWidthSizeClass) {
    WindowWidthSizeClass.COMPACT -> PhoneLayout()
    WindowWidthSizeClass.MEDIUM -> TabletLayout()
    WindowWidthSizeClass.EXPANDED -> DesktopLayout()
}
```

The Material3 adaptive library provides `ListDetailPaneScaffold` and `SupportingPaneScaffold` for common patterns — showing a list-detail split on large screens and navigating between them on phones. The key principle is to design for the window, not the device. A phone in landscape or a resizable Chrome OS window should get the right layout based on available space.

#### How does ConstraintLayout work in Compose?

`ConstraintLayout` in Compose works similarly to the View version — you define constraints between elements using references. It's useful for complex flat layouts where nesting `Row` and `Column` would get messy or cause unnecessary measurement passes.

```kotlin
ConstraintLayout(modifier = Modifier.fillMaxWidth()) {
    val (image, title, subtitle) = createRefs()

    Image(
        painter = painterResource(R.drawable.avatar),
        contentDescription = null,
        modifier = Modifier.constrainAs(image) {
            start.linkTo(parent.start, 16.dp)
            top.linkTo(parent.top, 16.dp)
        }
    )
    Text(
        text = "Title",
        modifier = Modifier.constrainAs(title) {
            start.linkTo(image.end, 12.dp)
            top.linkTo(image.top)
        }
    )
}
```

You create references with `createRefs()` and position elements using `constrainAs`. It also supports guidelines, barriers, and chains. In most cases, `Row`, `Column`, and `Box` are simpler and sufficient. I reach for `ConstraintLayout` when I have many elements that need relative positioning that would require deeply nested standard layouts.

### Common Follow-ups

- How would you implement a flow layout (like FlowRow) using the Layout composable? (Measure children, track row width, wrap to next row when exceeding max width)
- What is the performance difference between animating with offset vs graphicsLayer? (graphicsLayer only triggers draw phase, offset triggers layout phase — graphicsLayer is cheaper for animations)
- How does drawWithCache know when to invalidate the cache? (It invalidates when the drawing area size changes or when any state object read inside the cache block changes)
- Can you nest graphicsLayer modifiers? (Yes, each creates its own render layer — useful for applying different transformations independently, but each layer has memory cost)
- What is the difference between placeRelative and place? (placeRelative mirrors x-coordinates in RTL layouts, place does not)
- What are scoped modifiers and why do they exist? (Modifiers like matchParentSize in BoxScope or weight in RowScope are only available within specific layout scopes, preventing misuse in layouts where they wouldn't work)
- How does Compose enforce the single-measurement rule? (If you call measure() on the same measurable twice, it throws an IllegalStateException at runtime)
