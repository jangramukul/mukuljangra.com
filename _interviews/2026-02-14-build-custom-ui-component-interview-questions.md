---
title: "Build a Custom UI Component"
date: 2026-02-14
layout: interview
tags: [Coding Test]
order: 4
---

## Build a Custom UI Component

Some coding tests ask you to build a custom UI component from scratch — a circular progress indicator, a rating bar, a custom chart, or a gesture-driven control. This tests your understanding of the rendering pipeline, touch handling, and API design.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the three phases of custom View rendering in the traditional View system?

Every custom View goes through three phases: measure, layout, and draw. `onMeasure()` determines the View's width and height based on parent constraints and its own content. `onLayout()` positions child views within the measured bounds (only relevant for ViewGroups). `onDraw()` renders the actual visual content onto a `Canvas`.

These phases run top-down through the View hierarchy. The parent measures itself, measures its children, positions them, then draws. Skipping or misunderstanding any phase leads to invisible views, wrong sizing, or incorrect positioning.

#### Q2: How do you implement onMeasure in a custom View?

`onMeasure()` receives width and height `MeasureSpec` values from the parent. Each spec has a mode (`EXACTLY`, `AT_MOST`, or `UNSPECIFIED`) and a size. You calculate your desired size and call `setMeasuredDimension()`.

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

`resolveSize()` is a helper that respects the parent's constraints — it returns the desired size if the mode is `UNSPECIFIED`, the spec size if `EXACTLY`, and the smaller of the two if `AT_MOST`. For circular components, take the minimum of width and height to keep the aspect ratio square.

#### Q3: How do you draw on a Canvas in a custom View?

Override `onDraw()` and use the `Canvas` API. Canvas provides methods for drawing shapes (`drawCircle`, `drawRect`, `drawArc`), paths, text, and bitmaps. You control appearance with `Paint` objects.

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

Create `Paint` objects in the constructor or as properties — never inside `onDraw()`. `onDraw()` gets called on every frame during animations, and allocating objects there causes garbage collection jank.

#### Q4: What is the difference between invalidate() and requestLayout()?

`invalidate()` triggers a redraw — it calls `onDraw()` again. Use it when the visual appearance changes but the size stays the same (like updating progress, changing a color, or animating a property).

`requestLayout()` triggers the full measure-layout-draw cycle. Use it when the size of the view needs to change (like adding text that makes the view taller, or changing a dimension property). Calling `requestLayout()` when you only need a redraw is wasteful because measuring is expensive.

#### Q5: How do you create a custom layout in Jetpack Compose?

Use the `Layout` composable and provide a `MeasurePolicy`. You receive the measurables (child composables) and constraints from the parent, measure each child, and place them at specific positions.

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

This creates a flow layout that wraps children to the next row when they exceed the available width. The key difference from the View system is that Compose enforces a single-pass measurement — you can't measure a child twice with different constraints unless you use `SubcomposeLayout`.

#### Q6: How do you do custom drawing in Compose?

Use the `Canvas` composable or `Modifier.drawBehind` / `Modifier.drawWithContent`. The `DrawScope` provides drawing functions similar to Android's Canvas API.

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

Unlike the View system, `DrawScope` handles density automatically — you can use `Dp.toPx()` directly inside the scope. No need to manually manage `Paint` object allocation either, since Compose handles that internally.

#### Q7: How do you handle touch events in a custom View?

Override `onTouchEvent()` and handle `ACTION_DOWN`, `ACTION_MOVE`, and `ACTION_UP`. Return `true` from `ACTION_DOWN` to tell the parent that you want to receive the full gesture.

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

For multi-touch or complex gestures (pinch, fling), use `GestureDetector` or `ScaleGestureDetector` instead of manually tracking multiple pointers.

#### Q8: How do you handle gestures in Compose?

Use `pointerInput` modifier with `detectDragGestures`, `detectTapGestures`, or `detectTransformGestures` for built-in gesture types.

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

`pointerInput(Unit)` takes a key — the block restarts when the key changes. Use `Unit` for gestures that don't depend on external state. If the gesture behavior depends on a changing value, pass that value as the key so the gesture handler gets the latest value.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How do you animate a custom drawn component?

In the View system, use `ValueAnimator` or `ObjectAnimator` to animate a property and call `invalidate()` on each update. In Compose, use `animate*AsState` or `Animatable` and read the value inside `DrawScope`.

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

Reading `animatedProgress` inside `Canvas` (which is a `Modifier.drawBehind` internally) means the state change only triggers a draw phase — composition and layout are skipped entirely. This is why drawing-phase animations in Compose are efficient.

#### Q10: How do you make a custom component accessible?

In the View system, override `onInitializeAccessibilityNodeInfo()` to provide semantic information. Set content descriptions, roles, and state values so TalkBack can announce the component properly.

In Compose, use the `semantics` modifier:

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

`ProgressBarRangeInfo` tells accessibility services that this is a progress indicator and provides the current value and range. Without it, TalkBack just announces a generic element and the user has no idea what the progress is.

#### Q11: How do you design a reusable API for a custom component?

Expose the minimum configuration needed through constructor parameters (View) or composable parameters (Compose). Use sensible defaults so the component works out of the box. Follow the conventions of the platform — in Compose, that means taking a `modifier` parameter and using `MaterialTheme` colors as defaults.

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

The `onRatingChanged` is nullable — when null, the component is display-only. When provided, it becomes interactive. This read-only vs interactive pattern is common in well-designed Compose components.

#### Q12: How do you handle intrinsic measurements in a custom Compose layout?

Intrinsic measurements let a composable report its preferred size before the actual measurement pass. This is useful when siblings need to match sizes — like making all children in a row the same height.

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

Compose's single-pass measurement rule means you can't measure a child, check its height, and then re-measure it with a fixed height. Intrinsics solve this — `maxIntrinsicHeight` gives you the height the child would want at a given width without actually measuring it.

#### Q13: How do you handle complex gestures like pinch-to-zoom in Compose?

Use `detectTransformGestures` inside `pointerInput`. It provides zoom, rotation, pan, and centroid for each frame of the gesture.

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

Using `graphicsLayer` for the visual transformation is important — it applies the transform at the drawing phase without triggering recomposition or relayout. If you applied scale through `Modifier.size()` instead, every zoom frame would trigger a full composition-layout-draw cycle.

#### Q14: What are common performance pitfalls with custom drawn components?

The biggest pitfall is allocating objects inside draw calls. In the View system, creating `Paint`, `Path`, `RectF`, or `Matrix` objects inside `onDraw()` causes garbage collection pauses. In Compose, `DrawScope` handles most allocations internally, but creating `Path` objects or complex `Brush` instances inside the draw lambda still has overhead.

Other pitfalls:
- Drawing more than needed — use `clipRect()` to skip drawing for offscreen content
- Not using hardware acceleration — avoid `Canvas.saveLayer()` when possible, as it creates an offscreen buffer
- Overdraw — drawing multiple opaque layers on top of each other wastes GPU time
- Invalidating too often — batch state changes and use `Animatable` or `ValueAnimator` instead of manually posting invalidation at arbitrary rates

For animated components, target 16ms per frame (60fps). If your `onDraw()` or `DrawScope` block takes longer, the animation will stutter.

#### Q15: How would you build a custom chart component for a coding test?

Start with the simplest version that works — a bar chart with hardcoded data — then make it configurable. Focus on clean API design over visual polish.

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

In a coding test, the evaluator cares more about the architecture around the chart (how data flows from API to chart, is it testable, does it handle empty data) than about pixel-perfect rendering. Add accessibility with a `semantics` block that describes the chart data, and handle the empty state gracefully.

### Common Follow-ups

- How would you add touch feedback (ripple, scale) to a custom component?
- What is the difference between `Modifier.drawBehind` and `Modifier.drawWithContent`?
- How do you test a custom composable that uses Canvas drawing?
- How would you handle RTL layout in a custom View?
- What's the difference between hardware-accelerated and software Canvas in the View system?
- How do you handle multitouch in a custom gesture handler?
- How would you make a custom component support dark mode automatically?
