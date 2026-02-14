---
title: "Build a Custom UI Component"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 4
sequence: 72
description: "Some coding tests ask you to build a custom UI component from scratch — a circular progress indicator, a rating bar, a custom chart, or a..."
---

## Build a Custom UI Component

Coding tests sometimes ask you to build a custom UI component from scratch. This covers the rendering pipeline, touch handling, and API design for both the View system and Compose.

#### What is the difference between invalidate() and requestLayout()?

`invalidate()` triggers a redraw by calling `onDraw()` again. I use it when the visual appearance changes but the size stays the same — updating progress, changing a color, animating a property.

`requestLayout()` triggers the full measure-layout-draw cycle. I use it when the view's size needs to change. Calling `requestLayout()` when I only need a redraw is wasteful because measuring is expensive.

#### What are the three phases of custom View rendering?

Every custom View goes through measure, layout, and draw. `onMeasure()` determines width and height based on parent constraints. `onLayout()` positions child views within those bounds — only relevant for ViewGroups. `onDraw()` renders the actual content onto a `Canvas`.

These phases run top-down through the View hierarchy. The parent measures itself, measures its children, positions them, then draws.

#### How do you implement onMeasure in a custom View?

`onMeasure()` receives width and height `MeasureSpec` values from the parent. Each spec has a mode (`EXACTLY`, `AT_MOST`, or `UNSPECIFIED`) and a size. I calculate the desired size and call `setMeasuredDimension()`.

```kotlin
class CircularProgressView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredSize = 200.dp.toPixels(context)
        val width = resolveSize(desiredSize, widthMeasureSpec)
        val height = resolveSize(desiredSize, heightMeasureSpec)
        val size = minOf(width, height) // Keep it square
        setMeasuredDimension(size, size)
    }
}
```

`resolveSize()` respects the parent's constraints — it returns the desired size if the mode is `UNSPECIFIED`, the spec size if `EXACTLY`, and the smaller of the two if `AT_MOST`. For circular components, I take the minimum of width and height to keep the aspect ratio square.

#### How do you draw on a Canvas in a custom View?

I override `onDraw()` and use the `Canvas` API. It provides methods for shapes (`drawCircle`, `drawRect`, `drawArc`), paths, text, and bitmaps. Appearance is controlled with `Paint` objects.

```kotlin
class CircularProgressView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    var progress: Float = 0.75f
        set(value) { field = value.coerceIn(0f, 1f); invalidate() }

    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.LTGRAY
        style = Paint.Style.STROKE
        strokeWidth = 12f
    }

    private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLUE
        style = Paint.Style.STROKE
        strokeWidth = 12f
        strokeCap = Paint.Cap.ROUND
    }

    private val arcRect = RectF()

    override fun onDraw(canvas: Canvas) {
        val padding = progressPaint.strokeWidth / 2
        arcRect.set(padding, padding, width - padding, height - padding)

        canvas.drawArc(arcRect, 0f, 360f, false, backgroundPaint)
        canvas.drawArc(arcRect, -90f, 360f * progress, false, progressPaint)
    }
}
```

I create `Paint` objects as properties, never inside `onDraw()`. That method gets called on every frame during animations, and allocating objects there causes GC jank.

#### How do you handle touch events in a custom View?

I override `onTouchEvent()` and handle `ACTION_DOWN`, `ACTION_MOVE`, and `ACTION_UP`. Returning `true` from `ACTION_DOWN` tells the parent I want the full gesture.

```kotlin
class SliderView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    var value: Float = 0.5f
        private set

    var onValueChanged: ((Float) -> Unit)? = null

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                value = (event.x / width).coerceIn(0f, 1f)
                onValueChanged?.invoke(value)
                invalidate()
                return true
            }
        }
        return super.onTouchEvent(event)
    }
}
```

For multi-touch or complex gestures like pinch and fling, I use `GestureDetector` or `ScaleGestureDetector` instead of manually tracking multiple pointers.

#### How do you do custom drawing in Compose?

I use the `Canvas` composable or `Modifier.drawBehind` / `Modifier.drawWithContent`. `DrawScope` provides drawing functions similar to Android's Canvas API.

```kotlin
@Composable
fun CircularProgress(
    progress: Float,
    modifier: Modifier = Modifier,
    strokeWidth: Dp = 8.dp,
    trackColor: Color = Color.LightGray,
    progressColor: Color = MaterialTheme.colorScheme.primary
) {
    Canvas(modifier = modifier.size(100.dp)) {
        val stroke = strokeWidth.toPx()
        val arcSize = size.minDimension - stroke

        drawArc(
            color = trackColor,
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            style = Stroke(width = stroke),
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(arcSize, arcSize)
        )

        drawArc(
            color = progressColor,
            startAngle = -90f,
            sweepAngle = 360f * progress,
            useCenter = false,
            style = Stroke(width = stroke, cap = StrokeCap.Round),
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(arcSize, arcSize)
        )
    }
}
```

Unlike the View system, `DrawScope` handles density automatically — I can use `Dp.toPx()` directly inside the scope. No need to manage `Paint` allocation either, since Compose handles that internally.

#### How do you create a custom layout in Jetpack Compose?

I use the `Layout` composable with a `MeasurePolicy`. I receive the measurables and constraints from the parent, measure each child, and place them at specific positions.

```kotlin
@Composable
fun FlowLayout(
    modifier: Modifier = Modifier,
    spacing: Dp = 8.dp,
    content: @Composable () -> Unit
) {
    Layout(content = content, modifier = modifier) { measurables, constraints ->
        val spacingPx = spacing.roundToPx()
        val placeables = measurables.map { it.measure(constraints) }

        var xPosition = 0
        var yPosition = 0
        var rowHeight = 0

        val positions = placeables.map { placeable ->
            if (xPosition + placeable.width > constraints.maxWidth) {
                xPosition = 0
                yPosition += rowHeight + spacingPx
                rowHeight = 0
            }
            val position = IntOffset(xPosition, yPosition)
            xPosition += placeable.width + spacingPx
            rowHeight = maxOf(rowHeight, placeable.height)
            position
        }

        val totalHeight = yPosition + rowHeight
        layout(constraints.maxWidth, totalHeight) {
            placeables.forEachIndexed { index, placeable ->
                placeable.place(positions[index].x, positions[index].y)
            }
        }
    }
}
```

This creates a flow layout that wraps children to the next row when they exceed the available width. Compose enforces single-pass measurement — I can't measure a child twice with different constraints unless I use `SubcomposeLayout`.

#### How do you handle gestures in Compose?

I use the `pointerInput` modifier with `detectDragGestures`, `detectTapGestures`, or `detectTransformGestures`.

```kotlin
@Composable
fun DraggableCircle(modifier: Modifier = Modifier) {
    var offset by remember { mutableStateOf(Offset.Zero) }

    Canvas(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectDragGestures { change, dragAmount ->
                    change.consume()
                    offset += dragAmount
                }
            }
    ) {
        drawCircle(
            color = Color.Blue,
            radius = 40.dp.toPx(),
            center = center + offset
        )
    }
}
```

`pointerInput(Unit)` takes a key — the block restarts when the key changes. I use `Unit` for gestures that don't depend on external state. If the gesture behavior depends on a changing value, I pass that value as the key so the handler picks up the latest value.

#### How do you animate a custom drawn component?

In the View system, I use `ValueAnimator` or `ObjectAnimator` to animate a property and call `invalidate()` on each update. In Compose, I use `animate*AsState` or `Animatable` and read the value inside `DrawScope`.

```kotlin
@Composable
fun AnimatedCircularProgress(targetProgress: Float) {
    val animatedProgress by animateFloatAsState(
        targetValue = targetProgress,
        animationSpec = tween(durationMillis = 800, easing = FastOutSlowInEasing),
        label = "progress"
    )

    Canvas(modifier = Modifier.size(120.dp)) {
        val stroke = 10.dp.toPx()
        val arcSize = size.minDimension - stroke

        drawArc(
            color = Color.LightGray,
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            style = Stroke(width = stroke),
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(arcSize, arcSize)
        )

        drawArc(
            color = Color.Blue,
            startAngle = -90f,
            sweepAngle = 360f * animatedProgress,
            useCenter = false,
            style = Stroke(width = stroke, cap = StrokeCap.Round),
            topLeft = Offset(stroke / 2, stroke / 2),
            size = Size(arcSize, arcSize)
        )
    }
}
```

Reading `animatedProgress` inside `Canvas` means the state change only triggers a draw phase — composition and layout are skipped entirely. This is why drawing-phase animations in Compose are efficient.

#### How do you design a reusable API for a custom component?

I expose the minimum configuration needed through composable parameters, use sensible defaults so it works out of the box, and follow platform conventions — in Compose, that means taking a `modifier` parameter and using `MaterialTheme` colors as defaults.

```kotlin
@Composable
fun RatingBar(
    rating: Float,
    onRatingChanged: ((Float) -> Unit)? = null,
    modifier: Modifier = Modifier,
    maxRating: Int = 5,
    activeColor: Color = MaterialTheme.colorScheme.primary,
    inactiveColor: Color = MaterialTheme.colorScheme.outline
) {
    Row(
        modifier = modifier.semantics {
            contentDescription = "Rating: $rating out of $maxRating"
            if (onRatingChanged != null) {
                role = Role.Slider
            }
        }
    ) {
        repeat(maxRating) { index ->
            val filled = index < rating.toInt()
            Icon(
                imageVector = if (filled) Icons.Filled.Star else Icons.Outlined.Star,
                contentDescription = null,
                tint = if (filled) activeColor else inactiveColor,
                modifier = Modifier
                    .size(32.dp)
                    .then(
                        if (onRatingChanged != null) {
                            Modifier.clickable { onRatingChanged((index + 1).toFloat()) }
                        } else Modifier
                    )
            )
        }
    }
}
```

Making `onRatingChanged` nullable gives me a clean pattern — when null, the component is display-only. When provided, it becomes interactive. This is a common pattern in well-designed Compose components.

#### How do you make a custom component accessible?

In the View system, I override `onInitializeAccessibilityNodeInfo()` to provide semantic information — content descriptions, roles, and state values so TalkBack can announce the component properly.

In Compose, I use the `semantics` modifier:

```kotlin
@Composable
fun CircularProgress(progress: Float, label: String) {
    Canvas(
        modifier = Modifier
            .size(100.dp)
            .semantics {
                contentDescription = "$label: ${(progress * 100).toInt()} percent"
                progressBarRangeInfo = ProgressBarRangeInfo(
                    current = progress,
                    range = 0f..1f
                )
            }
    ) {
        // Drawing code
    }
}
```

`ProgressBarRangeInfo` tells accessibility services that this is a progress indicator and gives it the current value and range. Without it, TalkBack just announces a generic element and the user has no idea what the progress is.

#### How do you handle intrinsic measurements in a custom Compose layout?

Intrinsic measurements let a composable report its preferred size before the actual measurement pass. I use this when siblings need to match sizes — like making all children in a row the same height.

```kotlin
@Composable
fun EqualHeightRow(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Layout(content = content, modifier = modifier) { measurables, constraints ->
        val maxIntrinsicHeight = measurables.maxOf {
            it.maxIntrinsicHeight(constraints.maxWidth / measurables.size)
        }

        val childConstraints = constraints.copy(
            minHeight = maxIntrinsicHeight,
            maxHeight = maxIntrinsicHeight
        )

        val placeables = measurables.map { it.measure(childConstraints) }
        val totalWidth = placeables.sumOf { it.width }

        layout(totalWidth, maxIntrinsicHeight) {
            var xPosition = 0
            placeables.forEach { placeable ->
                placeable.place(xPosition, 0)
                xPosition += placeable.width
            }
        }
    }
}
```

Compose's single-pass measurement rule means I can't measure a child, check its height, and re-measure it with a fixed height. Intrinsics solve this — `maxIntrinsicHeight` gives me the height the child would want at a given width without actually measuring it.

#### How do you handle pinch-to-zoom in Compose?

I use `detectTransformGestures` inside `pointerInput`. It provides zoom, rotation, pan, and centroid for each frame of the gesture.

```kotlin
@Composable
fun ZoomableImage(painter: Painter, modifier: Modifier = Modifier) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    Image(
        painter = painter,
        contentDescription = null,
        modifier = modifier
            .pointerInput(Unit) {
                detectTransformGestures { centroid, pan, zoom, rotation ->
                    scale = (scale * zoom).coerceIn(0.5f, 4f)
                    offset += pan
                }
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offset.x
                translationY = offset.y
            }
    )
}
```

Using `graphicsLayer` for the visual transformation is important — it applies the transform at the drawing phase without triggering recomposition or relayout. If I applied scale through `Modifier.size()` instead, every zoom frame would trigger a full composition-layout-draw cycle.

#### What are common performance pitfalls with custom drawn components?

The biggest pitfall is allocating objects inside draw calls. In the View system, creating `Paint`, `Path`, `RectF`, or `Matrix` objects inside `onDraw()` causes GC pauses. In Compose, `DrawScope` handles most allocations internally, but creating `Path` objects or complex `Brush` instances inside the draw lambda still has overhead.

Other pitfalls:
- Drawing more than needed — use `clipRect()` to skip offscreen content
- Avoiding `Canvas.saveLayer()` when possible, since it creates an offscreen buffer
- Overdraw — drawing multiple opaque layers on top of each other wastes GPU time
- Invalidating too often — batch state changes and use `Animatable` or `ValueAnimator` instead of manually posting invalidation

For animated components, I target 16ms per frame (60fps). If `onDraw()` or the `DrawScope` block takes longer, the animation will stutter.

#### How would you build a custom chart component for a coding test?

I start with the simplest version that works — a bar chart with hardcoded data — then make it configurable. I focus on clean API design over visual polish.

```kotlin
@Composable
fun BarChart(
    data: List<Float>,
    labels: List<String>,
    modifier: Modifier = Modifier,
    barColor: Color = MaterialTheme.colorScheme.primary
) {
    val maxValue = data.maxOrNull() ?: 1f

    Canvas(modifier = modifier.fillMaxWidth().height(200.dp)) {
        val barWidth = size.width / (data.size * 2)
        val spacing = barWidth

        data.forEachIndexed { index, value ->
            val barHeight = (value / maxValue) * size.height
            val xOffset = index * (barWidth + spacing) + spacing / 2

            drawRect(
                color = barColor,
                topLeft = Offset(xOffset, size.height - barHeight),
                size = Size(barWidth, barHeight)
            )
        }
    }
}
```

In a coding test, the evaluator cares more about the architecture around the chart — how data flows from API to chart, is it testable, does it handle empty data — than about pixel-perfect rendering. I add accessibility with a `semantics` block that describes the chart data, and handle the empty state gracefully.

### Common Follow-ups

- How would you add touch feedback (ripple, scale) to a custom component?
- What is the difference between `Modifier.drawBehind` and `Modifier.drawWithContent`?
- How do you test a custom composable that uses Canvas drawing?
- How would you handle RTL layout in a custom View?
- What's the difference between hardware-accelerated and software Canvas in the View system?
- How do you handle multitouch in a custom gesture handler?
- How would you make a custom component support dark mode automatically?
