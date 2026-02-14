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

Coding tests sometimes ask you to build a custom UI component from scratch. That means you need to understand the rendering pipeline, touch handling, and API design for both the View system and Compose. Here's the thing -- this is where your understanding of how Android actually draws pixels gets tested.

#### What is the difference between invalidate() and requestLayout()?

Think of `invalidate()` like telling the painter "repaint this wall" versus `requestLayout()` which is like telling the architect "redesign the floor plan."

`invalidate()` triggers a redraw by calling `onDraw()` again. I use it when the visual appearance changes but the size stays the same -- updating progress, changing a color, animating a property. The view keeps its current dimensions and just redraws itself.

`requestLayout()` triggers the full measure-layout-draw cycle. I use it when the view's size actually needs to change. Calling `requestLayout()` when you only need a redraw is like tearing down the whole house because you wanted to repaint the living room. Measuring is expensive -- don't do it unless the dimensions are changing.

#### What are the three phases of custom View rendering?

Every custom View goes through three phases: measure, layout, and draw. Think of it like building a house -- first, the architect decides the dimensions (measure), then the contractor positions everything on the plot (layout), then the painter makes it look good (draw).

`onMeasure()` determines width and height based on parent constraints. `onLayout()` positions child views within those bounds -- only relevant for ViewGroups. `onDraw()` renders the actual content onto a `Canvas`.

These phases run top-down through the View hierarchy. The parent measures itself, measures its children, positions them, then draws. Every. Single. Frame.

#### How do you implement onMeasure in a custom View?

`onMeasure()` receives width and height `MeasureSpec` values from the parent. Each spec has a mode (`EXACTLY`, `AT_MOST`, or `UNSPECIFIED`) and a size. Think of it like a negotiation -- the parent says "here's how much space I'm willing to give you" and the child says "cool, here's how much I actually need."

I calculate the desired size and call `setMeasuredDimension()`.

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

`resolveSize()` respects the parent's constraints -- it returns the desired size if the mode is `UNSPECIFIED`, the spec size if `EXACTLY`, and the smaller of the two if `AT_MOST`. For circular components, I take the minimum of width and height to keep the aspect ratio square.

#### How do you draw on a Canvas in a custom View?

I override `onDraw()` and use the `Canvas` API. It provides methods for shapes (`drawCircle`, `drawRect`, `drawArc`), paths, text, and bitmaps. Appearance is controlled with `Paint` objects -- think of `Paint` as the brush and `Canvas` as the, well, canvas.

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

Notice how I create `Paint` objects as properties, never inside `onDraw()`. That method gets called on every single frame during animations. Creating objects in there is like buying a new set of paintbrushes every time you need to touch up a wall -- the garbage collector will make you pay for it with jank.

> **🧠 Think about it:** If `onDraw()` runs 60 times per second during an animation, and you allocate a new `Paint` object each time, how many garbage-collectable objects are you creating in just one second?

#### How do you handle touch events in a custom View?

I override `onTouchEvent()` and handle `ACTION_DOWN`, `ACTION_MOVE`, and `ACTION_UP`. Here's the key detail that trips people up -- returning `true` from `ACTION_DOWN` tells the parent "I'm claiming this gesture, send me the rest of the events." Return `false` and you'll never see the `ACTION_MOVE` or `ACTION_UP`.

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

For multi-touch or complex gestures like pinch and fling, I use `GestureDetector` or `ScaleGestureDetector` instead of manually tracking multiple pointers. Tracking multiple touch pointers by hand is like trying to juggle while riding a unicycle -- technically possible, but why?

#### How do you do custom drawing in Compose?

I use the `Canvas` composable or `Modifier.drawBehind` / `Modifier.drawWithContent`. `DrawScope` provides drawing functions similar to Android's Canvas API, but with some nice quality-of-life improvements.

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

Unlike the View system, `DrawScope` handles density automatically -- I can use `Dp.toPx()` directly inside the scope. No need to manage `Paint` allocation either, since Compose handles that internally. It's like upgrading from a manual transmission to an automatic -- same destination, less footwork.

#### How do you create a custom layout in Jetpack Compose?

I use the `Layout` composable with a `MeasurePolicy`. Think of it like being the foreman on a construction site -- I receive the building materials (measurables) and the lot boundaries (constraints), measure each piece, and place them exactly where I want.

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

This creates a flow layout that wraps children to the next row when they exceed the available width. But wait -- Compose enforces single-pass measurement. I can't measure a child, look at the result, and re-measure with different constraints. That's cheating. If I need that flexibility, I reach for `SubcomposeLayout`.

#### How do you handle gestures in Compose?

I use the `pointerInput` modifier with `detectDragGestures`, `detectTapGestures`, or `detectTransformGestures`. It's a completely different model from the View system's `onTouchEvent` -- instead of a big `when` block, I get purpose-built gesture detectors.

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

`pointerInput(Unit)` takes a key -- the block restarts when the key changes. I use `Unit` for gestures that don't depend on external state. If the gesture behavior depends on a changing value, I pass that value as the key so the handler picks up the latest value. Forget to update the key, and your gesture handler will be stuck reading stale state forever.

> **🧠 Think about it:** What happens if you pass a state value as the `pointerInput` key but that state changes rapidly during a drag? The gesture detection restarts every time the key changes, which would interrupt the drag mid-motion.

#### How do you animate a custom drawn component?

In the View system, I use `ValueAnimator` or `ObjectAnimator` to animate a property and call `invalidate()` on each update -- it's a manual crank. In Compose, I use `animate*AsState` or `Animatable` and read the value inside `DrawScope`, and the framework handles the rest.

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

Now here's where it gets interesting. Reading `animatedProgress` inside `Canvas` means the state change only triggers a draw phase -- composition and layout are skipped entirely. The framework sees that the only thing reading this state is the draw scope, so it takes the shortcut. This is why drawing-phase animations in Compose are so efficient.

#### How do you design a reusable API for a custom component?

This is less about code and more about empathy for the developer who'll use your component. I expose the minimum configuration needed through composable parameters, use sensible defaults so it works out of the box, and follow platform conventions -- in Compose, that means taking a `modifier` parameter and using `MaterialTheme` colors as defaults.

Think of it like designing a TV remote. The user should be able to turn it on and change channels without reading a manual. But the advanced settings are still there if they need them.

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

Making `onRatingChanged` nullable gives me a clean pattern -- when null, the component is display-only. When provided, it becomes interactive. One parameter controls the entire interaction model. This is a common pattern in well-designed Compose components and interviewers notice when you reach for it naturally.

#### How do you make a custom component accessible?

In the View system, I override `onInitializeAccessibilityNodeInfo()` to provide semantic information -- content descriptions, roles, and state values so TalkBack can announce the component properly.

In Compose, I use the `semantics` modifier. It's like adding a label to a button on an elevator -- a sighted person can see the floor number, but someone using a screen reader needs that label to know what they're pressing.

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

`ProgressBarRangeInfo` tells accessibility services that this is a progress indicator and gives it the current value and range. Without it, TalkBack just announces a generic element and the user has no idea what the progress is. Skipping accessibility in a coding test is a missed opportunity to stand out.

#### How do you handle intrinsic measurements in a custom Compose layout?

Here's the problem: Compose's single-pass measurement rule means I can't measure a child, check its height, and re-measure it with a fixed height. That would be two passes. Not allowed.

So how do I make all children in a row the same height? Intrinsic measurements. They let a composable report its preferred size before the actual measurement pass -- like asking "how tall would you be if I gave you this much width?" without actually committing to that measurement.

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

`maxIntrinsicHeight` gives me the height the child would want at a given width without actually measuring it. I ask everyone "how tall would you be?", take the tallest answer, and then do the real measurement pass with that height locked in. One pass. Rules followed.

#### How do you handle pinch-to-zoom in Compose?

I use `detectTransformGestures` inside `pointerInput`. It provides zoom, rotation, pan, and centroid for each frame of the gesture -- all the multitouch data I need in one callback.

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

Using `graphicsLayer` for the visual transformation is critical here. It applies the transform at the drawing phase without triggering recomposition or relayout. If I applied scale through `Modifier.size()` instead, every single zoom frame would trigger a full composition-layout-draw cycle. That's like rebuilding the entire house every time you open a window.

> **🧠 Think about it:** Why does `graphicsLayer` skip recomposition? Because it modifies the RenderNode directly -- the composable's size and position in the layout tree don't change, only how the GPU renders it. The composition and layout phases have nothing new to do.

#### What are common performance pitfalls with custom drawn components?

The biggest pitfall is allocating objects inside draw calls. In the View system, creating `Paint`, `Path`, `RectF`, or `Matrix` objects inside `onDraw()` causes GC pauses. In Compose, `DrawScope` handles most allocations internally, but creating `Path` objects or complex `Brush` instances inside the draw lambda still has overhead.

Other pitfalls:
- Drawing more than needed -- use `clipRect()` to skip offscreen content
- Avoiding `Canvas.saveLayer()` when possible, since it creates an offscreen buffer
- Overdraw -- drawing multiple opaque layers on top of each other wastes GPU time
- Invalidating too often -- batch state changes and use `Animatable` or `ValueAnimator` instead of manually posting invalidation

For animated components, I target 16ms per frame (60fps). If `onDraw()` or the `DrawScope` block takes longer, the animation will stutter. That 16ms budget is real -- the GPU doesn't negotiate deadlines.

#### How would you build a custom chart component for a coding test?

I start with the simplest version that works -- a bar chart with hardcoded data -- then make it configurable. I focus on clean API design over visual polish. In a coding test, nobody is judging your gradient game.

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

In a coding test, the evaluator cares more about the architecture around the chart -- how data flows from API to chart, is it testable, does it handle empty data -- than about pixel-perfect rendering. I add accessibility with a `semantics` block that describes the chart data, and handle the empty state gracefully. Get the engineering right first, make it pretty later.

### Common Follow-ups

- How would you add touch feedback (ripple, scale) to a custom component?
- What is the difference between `Modifier.drawBehind` and `Modifier.drawWithContent`?
- How do you test a custom composable that uses Canvas drawing?
- How would you handle RTL layout in a custom View?
- What's the difference between hardware-accelerated and software Canvas in the View system?
- How do you handle multitouch in a custom gesture handler?
- How would you make a custom component support dark mode automatically?
