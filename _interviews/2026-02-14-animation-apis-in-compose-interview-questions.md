---
title: "Animation APIs in Compose"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 7
sequence: 53
---

## Animation APIs in Compose

Animation questions come up regularly in Compose interviews because they test whether you understand not just the APIs, but how Compose's declarative model drives motion through state changes rather than imperative commands.

### Core Questions

#### Q1: What is animate*AsState and when do you use it?

`animate*AsState` is the simplest animation API in Compose. You give it a target value and it animates from the current value to the target whenever the target changes. It returns a `State<T>` that recomposes the composable with each animation frame.

```kotlin
@Composable
fun ExpandableCard(isExpanded: Boolean) {
    val height by animateDpAsState(
        targetValue = if (isExpanded) 300.dp else 100.dp,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "cardHeight"
    )
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .background(Color.Blue, RoundedCornerShape(12.dp))
    )
}
```

There are variants for common types — `animateDpAsState`, `animateFloatAsState`, `animateColorAsState`, `animateIntOffsetAsState`, and others. If your type isn't covered, you can use `animateValueAsState` with a custom `TwoWayConverter`.

#### Q2: How does AnimatedVisibility work?

`AnimatedVisibility` wraps a composable and animates its appearance and disappearance. When `visible` changes from false to true, it runs the `enter` transition. When it goes back to false, it runs the `exit` transition, then removes the content from the composition entirely.

```kotlin
@Composable
fun NotificationBanner(showBanner: Boolean) {
    AnimatedVisibility(
        visible = showBanner,
        enter = slideInVertically() + fadeIn(),
        exit = slideOutVertically() + fadeOut()
    ) {
        Text(
            text = "New message received",
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.Green)
                .padding(16.dp)
        )
    }
}
```

This is different from just animating alpha. Animating alpha keeps the composable in the composition and it still takes up space and remains visible to accessibility services. `AnimatedVisibility` actually removes the content from the tree after the exit animation finishes.

#### Q3: What is the difference between AnimatedContent and Crossfade?

Both animate between different composables, but they work differently. `Crossfade` only does a simple fade — it fades out the old content and fades in the new content. `AnimatedContent` is more flexible. It supports custom `ContentTransform` with enter/exit transitions, and it can animate size changes through `SizeTransform`.

```kotlin
@Composable
fun ScreenSwitcher(state: UiState) {
    AnimatedContent(
        targetState = state,
        transitionSpec = {
            fadeIn(tween(300)) + slideInVertically { it } togetherWith
                fadeOut(tween(300)) + slideOutVertically { -it }
        },
        label = "screenSwitch"
    ) { targetState ->
        when (targetState) {
            UiState.Loading -> LoadingIndicator()
            UiState.Success -> ContentScreen()
            UiState.Error -> ErrorScreen()
        }
    }
}
```

Use `Crossfade` when a simple fade is enough. Use `AnimatedContent` when you need slides, size transforms, or different enter/exit animations based on direction.

#### Q4: What does animateContentSize do?

`Modifier.animateContentSize()` automatically animates any change in a composable's size. Instead of snapping to a new size, it smoothly transitions. It only affects the size, not the content inside.

```kotlin
@Composable
fun ExpandableDescription(text: String) {
    var expanded by remember { mutableStateOf(false) }
    Text(
        text = text,
        maxLines = if (expanded) Int.MAX_VALUE else 2,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .animateContentSize(
                animationSpec = spring(stiffness = Spring.StiffnessLow)
            )
            .clickable { expanded = !expanded }
    )
}
```

One thing to watch: `animateContentSize` should come before any size modifiers like `height()` or `width()` in the modifier chain. If you put a fixed size modifier before it, the size is already fixed and there's nothing to animate.

#### Q5: What is rememberInfiniteTransition and when do you use it?

`rememberInfiniteTransition` creates an animation that runs indefinitely without stopping. It's for continuous animations like pulsing indicators, shimmer effects, or rotating loaders. The animation survives recomposition because the transition is remembered.

```kotlin
@Composable
fun PulsingDot() {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )
    Box(
        modifier = Modifier
            .size(20.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .background(Color.Red, CircleShape)
    )
}
```

Use `rememberInfiniteTransition` when the animation has no end condition. For animations that should run a fixed number of times, use `Animatable` with `repeatable` instead of `infiniteRepeatable`.

#### Q6: Explain the difference between spring, tween, and keyframes animation specs.

These are the three main `AnimationSpec` types that control how values interpolate over time.

- **spring** — Physics-based. Defined by `dampingRatio` and `stiffness`, not duration. The animation ends when the spring settles, so the duration is dynamic. This is Compose's default and it looks the most natural because it never abruptly stops.
- **tween** — Duration-based. Animates from start to end over a fixed duration using an easing curve (`LinearEasing`, `FastOutSlowInEasing`, etc.). Predictable timing but can feel mechanical.
- **keyframes** — Duration-based with control points. You define specific values at specific timestamps within the overall duration. Good for multi-stage animations where you need the value to pass through certain milestones.

```kotlin
// Spring — no fixed duration, settles naturally
animationSpec = spring(
    dampingRatio = Spring.DampingRatioMediumBouncy,
    stiffness = Spring.StiffnessLow
)

// Tween — fixed 400ms with ease-in-out
animationSpec = tween(
    durationMillis = 400,
    easing = FastOutSlowInEasing
)

// Keyframes — value hits specific points at specific times
animationSpec = keyframes {
    durationMillis = 500
    0f at 0 using LinearEasing
    0.5f at 150
    1f at 500 using FastOutSlowInEasing
}
```

Spring is the default for a reason — it handles interrupted animations gracefully. If the target changes mid-animation, a spring adjusts naturally. A tween would restart from scratch, which looks janky.

#### Q7: How do you use updateTransition for coordinated animations?

`updateTransition` manages multiple animations that share the same state. When the state changes, all child animations defined through `animate*` extension functions transition together in a coordinated way.

```kotlin
@Composable
fun SelectableChip(selected: Boolean) {
    val transition = updateTransition(
        targetState = selected,
        label = "chipTransition"
    )
    val backgroundColor by transition.animateColor(label = "bgColor") { isSelected ->
        if (isSelected) Color.Blue else Color.LightGray
    }
    val borderWidth by transition.animateDp(label = "border") { isSelected ->
        if (isSelected) 0.dp else 1.dp
    }
    val textColor by transition.animateColor(label = "textColor") { isSelected ->
        if (isSelected) Color.White else Color.DarkGray
    }

    Surface(
        color = backgroundColor,
        border = BorderStroke(borderWidth, Color.Gray),
        shape = RoundedCornerShape(16.dp)
    ) {
        Text("Filter", color = textColor, modifier = Modifier.padding(12.dp, 6.dp))
    }
}
```

The advantage over using multiple `animate*AsState` calls is that all animations are tied to the same transition and can have their timing coordinated. You can also use `transitionSpec` on each animation to customize the spec based on which state you're going to and from.

### Deep Dive Questions

#### Q8: What is Animatable and how is it different from animate*AsState?

`Animatable` is the low-level coroutine-based animation API. Unlike `animate*AsState`, which is declarative and driven by state changes, `Animatable` is imperative — you call `animateTo()` or `snapTo()` inside a coroutine. This gives you full control over sequencing, chaining, and handling animation lifecycle.

```kotlin
@Composable
fun FadeInCard() {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        alpha.animateTo(
            targetValue = 1f,
            animationSpec = tween(800)
        )
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer { this.alpha = alpha.value }
    ) {
        Text("Welcome back", modifier = Modifier.padding(16.dp))
    }
}
```

`Animatable` also has bounds checking via `updateBounds()` and respects velocity continuity when interrupted. If you call `animateTo()` while an animation is running, it cancels the previous one but preserves the current velocity so the motion stays smooth. Use `animate*AsState` for simple target-driven animations and `Animatable` when you need sequential animations, fling-based motion, or programmatic control.

#### Q9: How do you create sequential and concurrent animations?

With `Animatable`, sequential animations are just suspend calls in order. Each `animateTo()` suspends until it completes, so the next one starts after the previous finishes. For concurrent animations, use multiple `launch` blocks inside `LaunchedEffect`.

```kotlin
@Composable
fun StaggeredEntry() {
    val alpha = remember { Animatable(0f) }
    val offsetY = remember { Animatable(50f) }
    val scale = remember { Animatable(0.8f) }

    LaunchedEffect(Unit) {
        // Concurrent: alpha and offset animate together
        launch { alpha.animateTo(1f, tween(400)) }
        launch { offsetY.animateTo(0f, tween(400)) }
        // Sequential: scale starts after both finish
        alpha.animateTo(1f) // waits if still running
        scale.animateTo(1f, spring(dampingRatio = 0.4f))
    }

    Box(
        modifier = Modifier.graphicsLayer {
            this.alpha = alpha.value
            translationY = offsetY.value
            scaleX = scale.value
            scaleY = scale.value
        }
    ) {
        Text("Hello")
    }
}
```

The coroutine model is what makes this natural. You don't need a special API for sequencing or coordination — Kotlin's structured concurrency handles it. This is one of the biggest design wins of Compose's animation system over the old View-based `AnimatorSet` approach.

#### Q10: How does Compose handle interrupted animations?

This is where Compose's animation system really shines compared to the View system. When you change the target value while an animation is in progress, Compose doesn't restart from scratch. It picks up from the current value and velocity and animates toward the new target.

For `spring` animations, this is seamless — the physics model adjusts naturally. For `tween`, the animation restarts with the current value as the new start point, but the velocity isn't preserved. That's why spring is the default: it handles interruptions without jarring jumps.

`Animatable` enforces mutual exclusion at the API level. If `animateTo()` is called while another animation is running, it cancels the previous coroutine and starts the new animation from the current value with the current velocity. This is handled automatically — you don't need to manage cancellation yourself.

#### Q11: What are shared element transitions in Compose and how do they work?

Shared element transitions animate a composable from one screen to another, making it look like the same element is moving between destinations. Compose introduced `SharedTransitionLayout` and the `sharedElement` / `sharedBounds` modifiers for this.

```kotlin
SharedTransitionLayout {
    AnimatedContent(targetState = showDetail) { isDetail ->
        if (isDetail) {
            DetailScreen(
                imageModifier = Modifier.sharedElement(
                    state = rememberSharedContentState(key = "image-$id"),
                    animatedVisibilityScope = this@AnimatedContent
                )
            )
        } else {
            ListScreen(
                imageModifier = Modifier.sharedElement(
                    state = rememberSharedContentState(key = "image-$id"),
                    animatedVisibilityScope = this@AnimatedContent
                )
            )
        }
    }
}
```

`sharedElement` animates size and position of the exact same content between two layouts. `sharedBounds` is for when the content differs between the two states but should share the same animated bounds — like a card expanding into a full-screen detail view where the layout changes but the container animates smoothly.

Both require a `SharedTransitionLayout` as a common ancestor and work with `AnimatedVisibility` or `AnimatedContent` to know which elements are entering and exiting.

#### Q12: How do you build gesture-driven animations?

Gesture-driven animations connect user input directly to animation values. You typically use `Animatable` with `pointerInput` or drag modifiers, snapping to a velocity-based fling when the gesture ends.

```kotlin
@Composable
fun SwipeToDismiss(onDismiss: () -> Unit) {
    val offsetX = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .offset { IntOffset(offsetX.value.roundToInt(), 0) }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        scope.launch {
                            if (abs(offsetX.value) > size.width / 3) {
                                val target = if (offsetX.value > 0)
                                    size.width.toFloat() else -size.width.toFloat()
                                offsetX.animateTo(target, tween(200))
                                onDismiss()
                            } else {
                                offsetX.animateTo(0f, spring())
                            }
                        }
                    },
                    onHorizontalDrag = { _, dragAmount ->
                        scope.launch { offsetX.snapTo(offsetX.value + dragAmount) }
                    }
                )
            }
            .fillMaxWidth()
            .height(80.dp)
            .background(Color.LightGray)
    ) {
        Text("Swipe to dismiss", modifier = Modifier.padding(16.dp))
    }
}
```

The key pattern is using `snapTo()` during the drag (instant, no animation) and `animateTo()` on drag end (animated settlement). `Animatable` preserves velocity across this transition, so if you use `animateDecay` instead of `animateTo`, the element continues with the fling velocity and decelerates naturally.

#### Q13: What happens to animations during recomposition? How do you prevent animation resets?

Animations backed by `remember` survive recomposition — this includes `Animatable`, `rememberInfiniteTransition`, and `animate*AsState`. The animation state is stored in the composition, so as long as the composable stays in the tree, the animation continues.

The common mistake is creating animation state without `remember`. If you write `val anim = Animatable(0f)` without wrapping it in `remember`, every recomposition creates a fresh `Animatable` starting from 0, and the animation resets. Same with `LaunchedEffect` — if the key changes on every recomposition, the effect restarts and your animation loops from the beginning.

For `animate*AsState`, the animation is automatically remembered and only re-targets when the target value changes. But for `LaunchedEffect`-driven animations, be careful with keys. Use `Unit` as the key if you want it to run once, or a stable identifier if it should restart when specific data changes.

#### Q14: How do you animate items in a LazyColumn?

Compose provides `Modifier.animateItem()` on `LazyListScope` for animating item placement, appearance, and disappearance in lazy lists.

```kotlin
@Composable
fun AnimatedTaskList(tasks: List<Task>) {
    LazyColumn {
        items(tasks, key = { it.id }) { task ->
            TaskRow(
                task = task,
                modifier = Modifier.animateItem(
                    fadeInSpec = tween(300),
                    placementSpec = spring(),
                    fadeOutSpec = tween(300)
                )
            )
        }
    }
}
```

The `key` parameter on `items` is critical. Without stable keys, Compose can't track which item moved where, so the animations won't work correctly. Each item needs a unique, stable identifier. The `animateItem` modifier handles fade-in for new items, fade-out for removed items, and placement animation when items reorder.

#### Q15: When should you use graphicsLayer for animations instead of regular modifiers?

`Modifier.graphicsLayer` applies transformations (alpha, scale, rotation, translation) at the draw phase only, skipping the layout and composition phases. Regular modifiers like `offset()`, `size()`, or `alpha()` trigger layout recalculation.

For animations that run every frame, this difference matters. An `offset` modifier triggers a layout pass per frame. A `graphicsLayer { translationX = value }` only redraws, which is significantly cheaper. The rule is: if you're animating visual properties continuously, use `graphicsLayer`. If you need the layout system to respond (like other composables moving out of the way), use layout-aware modifiers.

```kotlin
// Performant — draw phase only
Modifier.graphicsLayer {
    alpha = alphaValue
    scaleX = scaleValue
    rotationZ = rotationValue
    translationY = offsetValue
}

// Triggers layout — use only when layout must respond
Modifier
    .alpha(alphaValue)
    .offset(y = offsetDp)
```

This maps directly to how Compose's three phases work — Composition, Layout, Drawing. If your animation only needs to affect the Drawing phase, `graphicsLayer` is the right tool.

#### Q16: How does Compose's animation system compare to the View system's animation framework?

The View system has three generations of animation APIs — the old `Animation` class (XML-based), `ObjectAnimator`/`AnimatorSet` (property animation), and `Transition` framework. Each generation improved on the previous but they're all imperative — you create an animator, set properties, and call `start()`.

Compose's animation system is declarative and state-driven. You describe the target state and Compose figures out the animation. This has practical advantages: interrupted animations preserve velocity automatically, coordinating multiple animations doesn't require an `AnimatorSet`, and the animation lifecycle is tied to the composition tree so there are no leaked animators.

The biggest conceptual difference is that View animations mutate properties on existing objects, while Compose animations produce new state values that drive recomposition. There's no `view.animate().alpha(0f)` equivalent — instead you change a state variable and let `animate*AsState` handle the interpolation. This makes animations composable (you can combine them), predictable (same state always produces same output), and testable (you can advance the clock programmatically).

### Common Follow-ups

- How would you implement a shimmer loading effect in Compose?
- What's the difference between `sharedElement` and `sharedBounds` modifiers?
- How do you test animations in Compose? Can you control the animation clock?
- How would you animate navigation transitions with Navigation Compose?
- What happens to an infinite transition when the composable leaves the composition?
- How do you profile animation performance and detect dropped frames in Compose?
- When would you use `animateDecay` vs `animateTo`?
- How do you animate between different content in a LazyColumn item (like expanding a card)?
