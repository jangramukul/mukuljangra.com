---
title: Custom Layouts in Compose Guide
layout: post
sequence: 128
categories: post
tags:
  - Jetpack Compose
  - Android
---

`Row`, `Column`, and `Box` cover about 90% of the layouts I build. They handle stacking, linear arrangement, and overlap well enough that most screens never need anything else. But every few months I hit something — a flow layout that wraps tags to the next line, a circular menu, a component where one child's measurement should determine another child's constraints — where the built-in composables just don't cut it. For the other 10%, Compose provides the `Layout` composable and `SubcomposeLayout` for building custom layout logic from scratch.

I avoided custom layouts for a long time because the View system taught me to fear them. Custom `ViewGroup` subclasses meant overriding `onMeasure` and `onLayout`, managing `MeasureSpec` modes, dealing with multiple measure passes, and debugging layout issues that manifested as invisible children or wrong sizes with no useful error. Compose's layout system is fundamentally different. Once you understand the measurement contract — measure each child exactly once, get back placeables, position them — custom layouts are surprisingly straightforward. The constraint system handles the complexity that `MeasureSpec` used to make painful, and the single-pass rule that feels restrictive at first actually prevents the performance traps that plagued the View system.

## The Layout Composable

The `Layout` composable is the primitive that every layout in Compose is built on. `Row`, `Column`, `Box`, `LazyColumn` — they all delegate to `Layout` internally. When you write a custom layout, you're working at the same level as the framework's own layouts.

The signature is straightforward: `Layout(content, modifier) { measurables, constraints -> }`. The `measurables` list represents each child composable. The `constraints` object tells you the minimum and maximum width and height your layout can occupy. Inside the lambda, you measure children, decide how big your layout should be, and place children at specific positions.

Here's a flow layout — the kind of thing you'd use for tag chips or filter buttons that wrap to the next row when the line is full:

```kotlin
@Composable
fun FlowLayout(
    modifier: Modifier = Modifier,
    horizontalSpacing: Dp = 8.dp,
    verticalSpacing: Dp = 8.dp,
    content: @Composable () -> Unit
) {
    Layout(
        content = content,
        modifier = modifier
    ) { measurables, constraints ->
        val hSpacing = horizontalSpacing.roundToPx()
        val vSpacing = verticalSpacing.roundToPx()

        val placeables = measurables.map { it.measure(constraints) }

        var currentX = 0
        var currentY = 0
        var rowHeight = 0

        val positions = placeables.map { placeable ->
            if (currentX + placeable.width > constraints.maxWidth && currentX > 0) {
                currentX = 0
                currentY += rowHeight + vSpacing
                rowHeight = 0
            }
            val position = IntOffset(currentX, currentY)
            currentX += placeable.width + hSpacing
            rowHeight = maxOf(rowHeight, placeable.height)
            position
        }

        val totalHeight = currentY + rowHeight
        layout(constraints.maxWidth, totalHeight) {
            placeables.forEachIndexed { index, placeable ->
                placeable.placeRelative(positions[index].x, positions[index].y)
            }
        }
    }
}
```

The pattern is always the same: measure children, calculate positions, call `layout(width, height) { }` to declare your size, then place each child inside that block. The `layout()` function returns a `MeasureResult` — it's how you tell Compose "I am this wide, this tall, and here's where my children go." If you forget to call `placeable.placeRelative()` on a child, that child simply won't render. No crash, no error — it's just invisible. I've lost time to that silent failure more than once.

## Measurement Constraints

Constraints are four integers: `minWidth`, `maxWidth`, `minHeight`, `maxHeight`. Every child must produce a size within these bounds. When `minWidth == maxWidth`, the child has exactly one choice for width — this is how `fillMaxWidth()` works under the hood. It sets both min and max to the parent's max width, forcing the child to occupy the full space.

The single-pass measurement rule is the most important constraint to internalize. In Compose, you cannot measure a child twice. If you call `measurable.measure(constraints)` and then try to call it again with different constraints, you get a runtime exception. This is intentional. The View system allowed multiple measure passes — a parent could measure a child with `UNSPECIFIED` to find its preferred size, then measure again with `EXACTLY` to force a specific size. This led to exponential measurement complexity in deeply nested layouts. A `LinearLayout` with `layout_weight` inside another weighted `LinearLayout` inside a `ScrollView` could measure the same leaf view 8+ times in a single frame. Compose eliminates this entirely.

You can modify constraints before passing them to children, and this is how you control child sizing. If you want children to ignore the parent's minimum width constraint, you create new constraints:

```kotlin
Layout(content = content, modifier = modifier) { measurables, constraints ->
    val childConstraints = constraints.copy(minWidth = 0, minHeight = 0)
    val placeables = measurables.map { it.measure(childConstraints) }

    val width = placeables.maxOf { it.width }.coerceIn(constraints.minWidth, constraints.maxWidth)
    val height = placeables.sumOf { it.height }.coerceIn(constraints.minHeight, constraints.maxHeight)

    layout(width, height) {
        var yOffset = 0
        placeables.forEach { placeable ->
            placeable.placeRelative(0, yOffset)
            yOffset += placeable.height
        }
    }
}
```

The `constraints.copy()` approach is clean, but watch out for one subtle trap. If you pass `Constraints(0, Constraints.Infinity, 0, Constraints.Infinity)` — unbounded constraints — to a child that uses `fillMaxSize()`, that child will try to fill infinite space and Compose will crash. Only pass unbounded constraints to children you know will wrap their content. I've seen this crash in production when someone put a `FlowLayout` inside a horizontally scrollable `Row` without clamping the max width.

## Custom Placement

Inside the `layout(width, height) { }` block, you have access to `PlacementScope`, which gives you two main placement functions. `placeRelative(x, y)` respects RTL layout direction — in a right-to-left locale, it mirrors the x coordinate automatically. `place(x, y)` is absolute positioning that ignores layout direction. For most layouts, `placeRelative` is what you want unless you're doing something explicitly directional like a drawing canvas.

`PlacementScope` also exposes `parentWidth` and `parentHeight`, which is useful for dynamic positioning. Here's a circular layout that positions children evenly around a circle:

```kotlin
@Composable
fun CircularLayout(
    modifier: Modifier = Modifier,
    radius: Dp = 100.dp,
    content: @Composable () -> Unit
) {
    Layout(
        content = content,
        modifier = modifier
    ) { measurables, constraints ->
        val placeables = measurables.map {
            it.measure(constraints.copy(minWidth = 0, minHeight = 0))
        }

        val radiusPx = radius.roundToPx()
        val layoutSize = (radiusPx * 2) + (placeables.maxOfOrNull { maxOf(it.width, it.height) } ?: 0)
        val centerX = layoutSize / 2
        val centerY = layoutSize / 2

        layout(layoutSize, layoutSize) {
            val angleStep = 360f / placeables.size
            placeables.forEachIndexed { index, placeable ->
                val angleDeg = angleStep * index - 90f
                val angleRad = Math.toRadians(angleDeg.toDouble())
                val x = centerX + (radiusPx * cos(angleRad)).toInt() - placeable.width / 2
                val y = centerY + (radiusPx * sin(angleRad)).toInt() - placeable.height / 2

                placeable.place(x, y)
            }
        }
    }
}
```

I use `place` instead of `placeRelative` here deliberately. The circular positioning is mathematical — mirroring the x-axis for RTL would distort the circle. This is one of the few cases where absolute placement makes sense. For anything that follows reading direction — rows, grids, flow layouts — always use `placeRelative`.

One thing the docs don't emphasize enough: placement happens in a separate phase from measurement. Compose can re-run placement without re-measuring if only position-related state changed. This is why `Modifier.offset { }` with a lambda is more efficient than `Modifier.offset(x, y)` with direct values — the lambda version defers the offset calculation to the placement phase, skipping composition and measurement entirely when the offset changes. The same principle applies inside custom layouts: if you can defer position calculations to the placement block and read state only there, you get free performance.

## SubcomposeLayout

`SubcomposeLayout` solves a problem that the single-pass measurement rule creates. Sometimes you need to measure one child first, then use that measurement to decide how to compose or constrain another child. The standard `Layout` composable can't do this because all children are composed before measurement begins. `SubcomposeLayout` breaks this by letting you compose children on-demand during the measurement phase.

The classic use case is a "match parent width" pattern — one child defines the width, and you want other children to exactly match it without using `fillMaxWidth()`:

```kotlin
@Composable
fun MatchWidthLayout(
    modifier: Modifier = Modifier,
    header: @Composable () -> Unit,
    body: @Composable () -> Unit
) {
    SubcomposeLayout(modifier = modifier) { constraints ->
        val headerPlaceables = subcompose("header", header).map {
            it.measure(constraints)
        }

        val headerWidth = headerPlaceables.maxOfOrNull { it.width } ?: 0
        val headerHeight = headerPlaceables.sumOf { it.height }

        val bodyConstraints = constraints.copy(
            minWidth = headerWidth,
            maxWidth = headerWidth
        )
        val bodyPlaceables = subcompose("body", body).map {
            it.measure(bodyConstraints)
        }

        val bodyHeight = bodyPlaceables.sumOf { it.height }

        layout(headerWidth, headerHeight + bodyHeight) {
            var yOffset = 0
            headerPlaceables.forEach { placeable ->
                placeable.placeRelative(0, yOffset)
                yOffset += placeable.height
            }
            bodyPlaceables.forEach { placeable ->
                placeable.placeRelative(0, yOffset)
                yOffset += placeable.height
            }
        }
    }
}
```

The `subcompose(slotId, content)` function composes and returns measurables for the given content. The `slotId` is how Compose tracks which slot belongs to which sub-composition — use unique, stable keys. I typically use strings like `"header"`, `"body"`, or enum values. Using indices is fragile because adding a slot shifts all subsequent IDs and triggers full recomposition of those slots.

Here's the tradeoff most guides skip: `SubcomposeLayout` is slower than `Layout`. With a standard `Layout`, Compose composes all children during the composition phase and measures them during the layout phase — two separate, optimized passes. `SubcomposeLayout` composes children during the layout phase, which means composition and measurement are interleaved. This prevents Compose from batching composition work as efficiently. For a simple two-slot layout like the example above, the overhead is negligible. But I wouldn't use `SubcomposeLayout` for a list with hundreds of items unless I genuinely needed the dependent measurement behavior. `LazyColumn` uses `SubcomposeLayout` internally, and the Compose team has heavily optimized that path, but rolling your own lazy layout with `SubcomposeLayout` won't get those same optimizations for free.

## Layout Modifier

Not every custom measurement needs a full `Layout` composable. When you want to change how a single element is measured or placed — without creating a new container — `Modifier.layout { measurable, constraints -> }` is the lighter-weight option.

The classic example is a first-baseline-to-top padding modifier. Regular `padding` adds space from the top edge of the text composable. But in typography-aware design, you often want the padding measured from the text's first baseline — the line the characters sit on — not the bounding box edge. The difference can be 4-8dp depending on font metrics, and it's visible when you need pixel-perfect alignment with other elements.

```kotlin
fun Modifier.firstBaselineToTop(
    firstBaselineToTop: Dp
) = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)

    check(placeable[FirstBaseline] != AlignmentLine.Unspecified)
    val firstBaseline = placeable[FirstBaseline]

    val placeableY = firstBaselineToTop.roundToPx() - firstBaseline
    val height = placeable.height + placeableY

    layout(placeable.width, height) {
        placeable.placeRelative(0, placeableY)
    }
}
```

The `placeable[FirstBaseline]` syntax accesses alignment lines — metadata that composables expose about their internal structure. `Text` exposes `FirstBaseline` and `LastBaseline`. You can define custom alignment lines in your own layouts too, which is how `Row` aligns children by their baselines when you use `Modifier.alignByBaseline()`.

The modifier version processes a single `measurable` (not a list), and it wraps the existing element rather than creating a container for multiple children. Think of it as intercepting the measurement of one node in the layout tree. I use this for things like adding visual offsets without affecting hit testing, adjusting padding based on content metrics, or reporting custom alignment lines to parent layouts.

## Intrinsic Measurements

Compose's single-pass measurement rule creates a problem: what if a parent needs to know something about a child's preferred size before deciding what constraints to pass? You can't measure the child to find out — that would use up its one measurement pass. Intrinsic measurements solve this by letting you query a child's preferred size without actually measuring it.

`IntrinsicSize.Min` asks: "What is the minimum size you need to display your content correctly?" `IntrinsicSize.Max` asks: "What is the maximum size you'd want if given unlimited space?" These are pre-measurement queries — they don't count as the actual measurement pass.

The most common use case is a divider that matches its sibling's height:

```kotlin
@Composable
fun TwoColumnWithDivider(
    modifier: Modifier = Modifier,
    leftContent: String,
    rightContent: String
) {
    Row(modifier = modifier.height(IntrinsicSize.Min)) {
        Text(
            text = leftContent,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp)
        )
        VerticalDivider(
            modifier = Modifier.fillMaxHeight().width(1.dp),
            color = Color.Gray
        )
        Text(
            text = rightContent,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp)
        )
    }
}
```

Without `height(IntrinsicSize.Min)`, the `Divider` would either collapse to zero height (if the `Row` doesn't have a fixed height) or stretch to fill the entire screen. With the modifier, `Row` queries its children's `minIntrinsicHeight` before measurement. `Text` reports the height it needs for its content. `Divider` reports 0 because it doesn't need any minimum height. `Row` takes the maximum — the taller `Text` height — and uses that as the height constraint for all children. Now the `Divider` fills exactly the height of the tallest text, which is what you want.

When building custom layouts, intrinsic measurements are calculated automatically by default, but the automatic calculation is based on heuristics that might not match your layout's actual behavior. For accurate intrinsics, override `minIntrinsicWidth`, `minIntrinsicHeight`, `maxIntrinsicWidth`, and `maxIntrinsicHeight` in your `MeasurePolicy`. I learned this the hard way — my custom flow layout was reporting wrong intrinsic heights because the default calculation assumed all children would be laid out in a single row. Overriding `minIntrinsicHeight` to account for wrapping fixed a layout glitch where a parent `Column` was allocating too little space for the flow layout's actual rendered height.

The tradeoff with intrinsics is performance. Every intrinsic query walks the subtree, asking each child about its preferred size. For simple layouts, this is negligible. For deeply nested layouts with many children, intrinsic queries can add up. I've profiled layouts where removing an unnecessary `IntrinsicSize.Min` modifier cut the layout phase time by 30%. Use intrinsics when you genuinely need pre-measurement information, not as a default.

---

## Quiz

**Question 1:** You have a custom `Layout` that measures a child with `measurable.measure(constraints)`, and then tries to measure the same child again with tighter constraints. What happens?

**Wrong**: The child is measured with the tighter constraints, overriding the first measurement.

**Correct**: Compose throws a runtime exception. Each child can only be measured once per layout pass — this is the single-pass measurement rule. If you need to measure a child with constraints that depend on another child's measurement, use `SubcomposeLayout` instead.

**Question 2:** You're building a custom layout and using `placeRelative(x, y)` to position children. A user switches their device to an RTL locale. What happens to your layout?

**Wrong**: Nothing changes — `placeRelative` positions children at absolute coordinates.

**Correct**: `placeRelative` automatically mirrors the x-coordinate for RTL locales. A child placed at `x = 16` in LTR will be placed at `parentWidth - 16 - childWidth` in RTL. If you need absolute positioning that ignores layout direction (like a circular layout), use `place(x, y)` instead.

---

## Coding Challenge

Build a `StaggeredGrid` layout that arranges children into a configurable number of columns, placing each child in the shortest column. This is essentially a Pinterest-style masonry layout.

Requirements:
- Accept a `columns: Int` parameter (default 2)
- Accept `horizontalSpacing: Dp` and `verticalSpacing: Dp` parameters
- Track the current height of each column
- For each child, find the column with the minimum height and place the child there
- The layout's total height should be the maximum column height
- The layout's width should be `constraints.maxWidth`, divided evenly among columns minus spacing

This exercise forces you to think about constraint modification (each child gets `maxWidth / columns` minus spacing), position tracking (accumulating heights per column), and the measure-then-place pattern that every custom layout follows.

Thanks for reading!
