---
title: Advanced Compose Animation Patterns Guide
layout: post
sequence: 129
categories: post
tags:
  - Jetpack Compose
  - Android
---

The basic animation APIs — `animate*AsState`, `AnimatedVisibility`, `updateTransition` — are covered in the [Compose Animation APIs Guide](https://mukuljangra.com/2024/09/30/compose-animation-guide.html). Those APIs handle 80% of what you'll build, and they're the right default. But every now and then you hit a wall: you need an animation that responds to finger velocity, an element that morphs between screens, a spring that bounces with a specific physical feel, or frame-level control over when and how animations run. That's where the advanced APIs come in.

This guide covers the patterns I reach for when the high-level APIs aren't enough: `Animatable` for imperative control, spring physics for natural motion, gesture-driven animation for interactive UI, shared element transitions for navigation, `AnimatedContent` for state-driven transitions, and the performance traps that can make smooth animations drop frames. These aren't niche APIs — once you understand them, you'll use them in almost every production app. The difference between a good Compose app and a great one is often in these details.

## Animatable — Low-Level Animation Control

`Animatable` is the foundation the higher-level APIs are built on. When `animate*AsState` returns a `State<Float>`, there's an `Animatable` underneath doing the work. The reason you'd use `Animatable` directly is control: `animateTo()` is a suspend function, `snapTo()` sets the value instantly, and `animateDecay()` applies velocity-based deceleration. All three respect coroutine cancellation — if you launch a new animation on the same `Animatable`, the previous coroutine gets cancelled automatically. This is the interrupt-and-replace model, and it's what makes gesture-driven animation possible without manual bookkeeping.

Here's the mental model: `Animatable` holds a single value and exposes suspend functions to change it over time. Because they're suspend functions, you sequence them naturally with coroutines. No callbacks, no animation listeners, no `onAnimationEnd` that fires at the wrong time.

```kotlin
@Composable
fun DragToDismissCard(
    content: @Composable () -> Unit,
    onDismissed: () -> Unit
) {
    val offsetY = remember { Animatable(0f) }
    val dismissDistance = 600f

    Box(
        modifier = Modifier
            .offset { IntOffset(0, offsetY.value.roundToInt()) }
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragEnd = {
                        val velocity = offsetY.velocity
                        if (abs(offsetY.value) > dismissDistance ||
                            abs(velocity) > 2000f
                        ) {
                            val target = if (offsetY.value > 0)
                                size.height.toFloat()
                            else -size.height.toFloat()
                            launch {
                                offsetY.animateTo(target, tween(200))
                                onDismissed()
                            }
                        } else {
                            launch {
                                offsetY.animateTo(
                                    0f,
                                    spring(
                                        dampingRatio = Spring.DampingRatioMediumBouncy,
                                        stiffness = Spring.StiffnessMedium
                                    )
                                )
                            }
                        }
                    },
                    onVerticalDrag = { _, dragAmount ->
                        launch { offsetY.snapTo(offsetY.value + dragAmount) }
                    }
                )
            }
    ) {
        content()
    }
}
```

The key insight here is `offsetY.velocity`. After a drag ends, `Animatable` knows the current velocity of the value — how fast the user was moving their finger. This lets you make dismiss decisions based on both position *and* speed. A slow drag past the threshold dismisses. A fast fling that hasn't reached the threshold also dismisses. And `snapTo` during the drag means zero latency — the card moves with the finger, no animation delay. If a snap-back animation is running and the user grabs the card again, `snapTo` cancels the running animation immediately.

## Spring Physics Animation

Springs are the default animation spec in Compose, and there's a reason for that. A spring doesn't have a fixed duration — it runs until the value settles within a visibility threshold. This means if you change the target mid-animation, the spring adjusts from the current velocity instead of restarting from zero. Duration-based animations like `tween` have to restart or do awkward velocity matching. Springs just work.

The two parameters that control spring behavior are `dampingRatio` and `stiffness`. A damping ratio of `1.0f` is critically damped — the value reaches the target as fast as possible without overshooting. Below `1.0f`, you get bounce. The lower the ratio, the more oscillation. Stiffness controls how quickly the spring settles — higher stiffness means snappier movement.

Here's what I've found works in production. `Spring.DampingRatioMediumBouncy` (0.5f) is the sweet spot for playful interactions — selection toggles, like buttons, chip selections. It feels alive without being distracting. `Spring.StiffnessLow` (200f) is perfect for subtle layout shifts where you want the motion to feel gentle, like expanding a card or repositioning a FAB. `Spring.DampingRatioNoBouncy` with `StiffnessMediumLow` works for navigation transitions where bounce would feel wrong.

```kotlin
@Composable
fun BouncySelectionChip(
    label: String,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    val scale by animateFloatAsState(
        targetValue = if (isSelected) 1.0f else 0.9f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "chipScale"
    )
    val backgroundColor by animateColorAsState(
        targetValue = if (isSelected)
            MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.surfaceVariant,
        animationSpec = spring(stiffness = Spring.StiffnessLow),
        label = "chipColor"
    )

    Surface(
        modifier = Modifier
            .scale(scale)
            .clickable { onSelect() },
        shape = RoundedCornerShape(20.dp),
        color = backgroundColor,
        tonalElevation = if (isSelected) 4.dp else 0.dp
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            color = if (isSelected)
                MaterialTheme.colorScheme.onPrimary
            else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
```

Why do springs feel more natural than easing curves? Because physical objects don't follow cubic bezier curves. When you push a door, it doesn't move at `FastOutSlowInEasing` — it accelerates based on the force applied and decelerates based on friction and its own momentum. Springs simulate this. The tradeoff is unpredictable duration: you can't guarantee that two spring animations finish at the exact same frame. If you need synchronized timing across multiple properties, `tween` is the safer choice. But for single-property interactive animations, springs almost always feel better.

## Gesture-Driven Animation

The real power of `Animatable` shows up when you combine it with gesture input. The pattern is straightforward: track the pointer with `snapTo()` during the gesture, then animate with `animateTo()` or `animateDecay()` when the gesture ends. The framework handles interruption — if the user touches again mid-animation, `snapTo()` cancels the running animation and the value jumps to the finger position.

Here's a swipeable card with snap points. The card has three positions: collapsed, half-expanded, and full. Dragging snaps to the nearest position based on velocity and distance.

```kotlin
@Composable
fun SnappingSwipeCard(
    collapsedHeight: Dp = 80.dp,
    halfHeight: Dp = 300.dp,
    fullHeight: Dp = 600.dp
) {
    val density = LocalDensity.current
    val anchors = remember(density) {
        with(density) {
            listOf(
                collapsedHeight.toPx(),
                halfHeight.toPx(),
                fullHeight.toPx()
            )
        }
    }
    val height = remember { Animatable(anchors[0]) }

    fun findNearestAnchor(value: Float, velocity: Float): Float {
        val projected = value + velocity * 0.15f
        return anchors.minByOrNull { abs(it - projected) } ?: anchors[0]
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(with(density) { height.value.toDp() })
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragEnd = {
                        val target = findNearestAnchor(
                            height.value, height.velocity
                        )
                        launch {
                            height.animateTo(
                                target,
                                spring(
                                    dampingRatio = Spring.DampingRatioLowBouncy,
                                    stiffness = Spring.StiffnessMediumLow
                                )
                            )
                        }
                    },
                    onVerticalDrag = { _, dragAmount ->
                        val newValue = (height.value + dragAmount)
                            .coerceIn(anchors.first(), anchors.last())
                        launch { height.snapTo(newValue) }
                    }
                )
            },
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.TopCenter
        ) {
            // Drag handle indicator
            Box(
                modifier = Modifier
                    .padding(top = 8.dp)
                    .width(40.dp)
                    .height(4.dp)
                    .background(
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f),
                        RoundedCornerShape(2.dp)
                    )
            )
        }
    }
}
```

The `findNearestAnchor` function is the interesting part. It doesn't just find the nearest anchor by position — it projects the position forward using velocity. A fast fling upward from the collapsed state should snap to the full position, not the half position. Multiplying velocity by `0.15f` gives a reasonable projection distance. This is the same idea behind `animateDecay()` with `exponentialDecay()`, but here we're using snap points instead of free deceleration.

For `transformable` gestures (pinch-to-zoom, rotation), the pattern is similar. Use `Modifier.transformable` with `rememberTransformableState`, track the gesture values with `snapTo()`, and animate to final positions on gesture end. The `transformable` modifier gives you scale, offset, and rotation deltas, so you can build a full image viewer with pan, zoom, and rotation using a single `Animatable` per property.

## Shared Element Transitions

Shared element transitions animate an element from one screen to another during navigation. Starting with Compose 1.7, this is officially supported through `SharedTransitionLayout`, `Modifier.sharedElement()`, and `Modifier.sharedBounds()`. The existing animation guide covers the basic setup, so here I want to focus on the patterns that matter in production: using it with `NavHost`, handling the `sharedElement` vs `sharedBounds` distinction correctly, and the overlay/clipping pitfalls.

The key distinction: `sharedElement` is for content that looks identical on both screens — the same image, same icon. The framework animates size and position, and the same content renders throughout. `sharedBounds` is for content that changes appearance between screens — a title that's small in a list but large in the detail view. The framework animates the bounds while crossfading the two different renderings.

```kotlin
@Composable
fun ArticleListDetailTransition(
    articles: List<Article>,
    selectedArticle: Article?,
    onArticleClick: (Article) -> Unit,
    onBack: () -> Unit
) {
    SharedTransitionLayout {
        AnimatedContent(
            targetState = selectedArticle,
            label = "articleTransition"
        ) { article ->
            if (article == null) {
                LazyColumn {
                    items(articles, key = { it.id }) { item ->
                        Row(
                            modifier = Modifier
                                .clickable { onArticleClick(item) }
                                .padding(16.dp)
                        ) {
                            AsyncImage(
                                model = item.thumbnailUrl,
                                contentDescription = null,
                                modifier = Modifier
                                    .size(72.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .sharedElement(
                                        state = rememberSharedContentState(
                                            key = "image-${item.id}"
                                        ),
                                        animatedVisibilityScope =
                                            this@AnimatedContent
                                    )
                            )
                            Text(
                                text = item.title,
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier
                                    .padding(start = 12.dp)
                                    .sharedBounds(
                                        sharedContentState =
                                            rememberSharedContentState(
                                                key = "title-${item.id}"
                                            ),
                                        animatedVisibilityScope =
                                            this@AnimatedContent
                                    )
                            )
                        }
                    }
                }
            } else {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    AsyncImage(
                        model = article.thumbnailUrl,
                        contentDescription = null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(240.dp)
                            .sharedElement(
                                state = rememberSharedContentState(
                                    key = "image-${article.id}"
                                ),
                                animatedVisibilityScope = this@AnimatedContent
                            ),
                        contentScale = ContentScale.Crop
                    )
                    Text(
                        text = article.title,
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier
                            .padding(16.dp)
                            .sharedBounds(
                                sharedContentState =
                                    rememberSharedContentState(
                                        key = "title-${article.id}"
                                    ),
                                animatedVisibilityScope = this@AnimatedContent
                            )
                    )
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            }
        }
    }
}
```

The production gotcha with shared element transitions is clipping and overlay behavior. During the transition, shared elements are rendered in an overlay above the content, so they appear to float between the two layouts. If the source element is inside a scrollable container with `clip = true` (which `LazyColumn` sets by default), the element might get clipped during the first frames of the transition before it moves to the overlay. You can fix this with `Modifier.sharedElement(clipInOverlayDuringTransition = OverlayClip(RoundedCornerShape(8.dp)))` to control how the element is clipped while in the overlay layer. I've also seen issues where `zIndex` on surrounding composables causes shared elements to render behind content — setting `renderInSharedTransitionScopeOverlay = true` on nearby non-shared elements can fix the z-ordering.

## AnimatedContent — Beyond Simple Crossfades

`AnimatedContent` replaces `Crossfade` when you need more than a simple alpha transition. The existing animation guide covers the basics with `transitionSpec`. Here I want to focus on the pattern I use most: directional transitions with custom enter/exit specs per content type.

A counter that slides numbers up when incrementing and down when decrementing is a clean example. The trick is using `targetState` and comparing it with the initial state inside `transitionSpec` to determine direction.

```kotlin
@Composable
fun SlidingCounter(count: Int) {
    AnimatedContent(
        targetState = count,
        transitionSpec = {
            if (targetState > initialState) {
                slideInVertically { -it } + fadeIn() togetherWith
                    slideOutVertically { it } + fadeOut()
            } else {
                slideInVertically { it } + fadeIn() togetherWith
                    slideOutVertically { -it } + fadeOut()
            }.using(SizeTransform(clip = false))
        },
        label = "counter"
    ) { targetCount ->
        Text(
            text = "$targetCount",
            style = MaterialTheme.typography.displayLarge,
            fontWeight = FontWeight.Bold
        )
    }
}
```

When incrementing, the new number slides in from the top while the old number slides out downward. Decrementing reverses the direction. `SizeTransform(clip = false)` lets the animating content draw outside the container during the transition, which prevents the sliding text from getting cut off mid-frame.

Here's the thing about `AnimatedContent` that isn't obvious from the docs: every time `targetState` changes, the framework creates a new composition for the target content while keeping the old composition alive during the exit animation. If your content has side effects in `LaunchedEffect`, they'll start running in the new composition immediately — even while the old content is still visible on screen. For expensive composables, this means you're briefly running two instances simultaneously. I've seen this cause double API calls when transitioning between screens that fetch data on entry. The fix is to check `transition.isRunning` or delay your side effects with `SideEffect` until the transition completes.

## Performance Considerations

Animation performance in Compose comes down to understanding the three phases: composition, layout, and drawing. Every animation creates work in at least one of these phases, and the phase determines how expensive that work is.

The golden rule: **animate in the drawing phase whenever possible.** `Modifier.graphicsLayer` operates exclusively in the drawing phase. It doesn't trigger recomposition and doesn't trigger relayout. Transform properties like `alpha`, `scaleX`, `scaleY`, `translationX`, `translationY`, and `rotationZ` are all graphicsLayer properties. When you animate these, the framework just changes the rendering transform on the existing render node — no composable functions re-execute, no layout pass runs.

**Wrong** — animating with `Modifier.offset` (triggers layout):

```kotlin
val offsetX by animateFloatAsState(targetValue = if (moved) 200f else 0f)
Box(modifier = Modifier.offset(x = offsetX.dp, y = 0.dp))
```

**Correct** — animating with `graphicsLayer` (drawing phase only):

```kotlin
val offsetX by animateFloatAsState(targetValue = if (moved) 200f else 0f)
Box(modifier = Modifier.graphicsLayer { translationX = offsetX })
```

The first version triggers a layout pass every frame because `Modifier.offset(x, y)` with `Dp` values participates in the layout phase. The lambda version `Modifier.offset { IntOffset(x, y) }` is better — it reads the value during the placement phase, which avoids recomposition but still runs layout placement. `graphicsLayer` skips both entirely.

For color animations, `Modifier.drawBehind` is your friend. Instead of passing an animated color to `Modifier.background()` — which triggers recomposition every frame because the background modifier parameter changes — use `drawBehind` to draw the color in the drawing phase only.

**Wrong** — animated background triggers recomposition:

```kotlin
val bgColor by animateColorAsState(targetValue = if (active) Color.Red else Color.Blue)
Box(modifier = Modifier.background(bgColor))
```

**Correct** — `drawBehind` stays in drawing phase:

```kotlin
val bgColor by animateColorAsState(targetValue = if (active) Color.Red else Color.Blue)
Box(modifier = Modifier.drawBehind { drawRect(bgColor) })
```

In profiler traces, the difference is stark. The `background` version shows the composable function re-executing every frame during the animation — you'll see composition cost in the System Trace alongside drawing cost. The `drawBehind` version shows zero composition during the animation — only the draw phase runs. On a simple box this doesn't matter, but when the recomposing composable has children, the recomposition cascades down the tree. I've seen animation jank disappear entirely after moving a color animation from `background` to `drawBehind` in a list item that had 8 child composables.

One more thing: `derivedStateOf` paired with `snapshotFlow` can reduce animation-driven recompositions when you only care about threshold crossings. If you're animating a float from 0 to 1 but only changing UI at 0.5 (like showing/hiding a label), wrapping the threshold check in `derivedStateOf` prevents 59 unnecessary recompositions per second during a 60fps animation.

## Quiz

**Q1:** You're animating a card's position with `Animatable`. The user starts a new drag while the snap-back animation is running. What happens when you call `snapTo()`?

**Wrong**: The snap-back animation completes first, then the value jumps to the new position.
**Correct**: The snap-back animation is cancelled immediately, and the value jumps to the new position. `Animatable` respects coroutine cancellation — launching a new `snapTo` or `animateTo` cancels any in-flight animation on the same instance.

**Q2:** You're animating a background color and noticing frame drops. Your current code uses `Modifier.background(animatedColor)`. What's the better approach?

**Wrong**: Switch to `Modifier.graphicsLayer { }` and set the background color there.
**Correct**: Use `Modifier.drawBehind { drawRect(animatedColor) }`. `graphicsLayer` handles transforms (scale, translation, rotation, alpha), not arbitrary drawing like background colors. `drawBehind` keeps the color animation in the drawing phase, avoiding recomposition. `Modifier.background()` with a changing color triggers recomposition every frame because the modifier parameter changes.

## Coding Challenge

Build a photo viewer composable with the following behavior:

- Display an image that supports pinch-to-zoom (1x to 5x), pan, and double-tap to toggle between 1x and 2x zoom.
- Use `Animatable` for both scale and offset, so zoom and pan animate smoothly on gesture end.
- On double-tap, animate to the target zoom with `spring(dampingRatio = Spring.DampingRatioLowBouncy)`.
- Clamp the pan offset so the image can't be dragged outside its visible bounds at the current zoom level.
- Use `graphicsLayer` for all transform animations (no recomposition during zoom/pan).

This exercise combines `transformable` gestures, `Animatable` control, spring physics, and drawing-phase-only performance. If your implementation handles double-tap-while-zooming (interrupt the zoom animation and start a new one), you've got the interruption model down.

Thanks for reading!
