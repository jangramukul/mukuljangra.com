---
title: Compose Animation APIs Guide
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
---

I used to over-complicate animations. In the View system, animation meant choosing between `ObjectAnimator`, `ValueAnimator`, `ViewPropertyAnimator`, `TransitionManager`, `MotionLayout`, or raw `Canvas.drawFrame` loops. Each API had its own lifecycle, its own cancellation model, its own way of handling interruptions. Moving to Compose simplified this dramatically — not because Compose has fewer animation APIs, but because they all share the same underlying model: **an animation is a value that changes over time, and Compose recomposes the UI whenever that value changes.**

That mental model is the key to understanding the entire Compose animation surface. Every API — from the simple `animateColorAsState` to the complex `Animatable` — is fundamentally about producing a changing value and letting recomposition do the rendering. The difference between them is how much control you get over timing, coordination, and state management. Once I understood that, choosing the right API for each situation became straightforward.

## `animate*AsState` — The Simplest Entry Point

`animate*AsState` functions are fire-and-forget animations. You give them a target value, and they animate from the current value to the target whenever the target changes. They return a `State<T>` that Compose reads during recomposition, so the UI updates automatically.

```kotlin
@Composable
fun ExpandableCard(isExpanded: Boolean, title: String, content: String) {
    val elevation by animateDpAsState(
        targetValue = if (isExpanded) 8.dp else 2.dp,
        animationSpec = tween(durationMillis = 300),
        label = "cardElevation"
    )
    val backgroundColor by animateColorAsState(
        targetValue = if (isExpanded) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
        animationSpec = tween(durationMillis = 300),
        label = "cardBackground"
    )
    val cornerRadius by animateDpAsState(
        targetValue = if (isExpanded) 16.dp else 8.dp,
        label = "cardCorner"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(elevation, RoundedCornerShape(cornerRadius)),
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        shape = RoundedCornerShape(cornerRadius)
    ) {
        Text(text = title, style = MaterialTheme.typography.titleMedium)
        if (isExpanded) {
            Text(text = content, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
```

Three animations running simultaneously — elevation, background color, corner radius — all driven by the same `isExpanded` boolean. You don't manage animation lifecycle, handle cancellation, or worry about interruptions. If `isExpanded` flips mid-animation, the animation reverses from its current position. This interruption handling is built into the framework and works correctly by default, which is a massive improvement over the View system where interrupting an `ObjectAnimator` required manual bookkeeping.

The `label` parameter is worth mentioning — it's used by the Animation Preview tool in Android Studio and by Layout Inspector to identify animations. It's technically optional, but I always include it because debugging unnamed animations in the inspector is a pain.

## `AnimatedVisibility` — Enter and Exit Transitions

`AnimatedVisibility` wraps a composable and animates its appearance and disappearance. Instead of toggling a boolean and handling the transition yourself, you describe what the enter and exit transitions should look like.

```kotlin
@Composable
fun NotificationBanner(
    message: String,
    isVisible: Boolean,
    onDismiss: () -> Unit
) {
    AnimatedVisibility(
        visible = isVisible,
        enter = slideInVertically(
            initialOffsetY = { -it }, // slide in from top
            animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy)
        ) + fadeIn(animationSpec = tween(300)),
        exit = slideOutVertically(
            targetOffsetY = { -it },
            animationSpec = tween(200)
        ) + fadeOut(animationSpec = tween(200))
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.tertiaryContainer
            )
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = message, modifier = Modifier.weight(1f))
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Dismiss")
                }
            }
        }
    }
}
```

Enter and exit transitions compose with the `+` operator. `slideInVertically + fadeIn` means the element both slides and fades simultaneously. You can combine `slideIn`, `fadeIn`, `expandIn`, `scaleIn` and their exit counterparts in any combination. Each transition can have its own `animationSpec`, so the slide can use a spring while the fade uses a linear tween.

The important detail: `AnimatedVisibility` keeps the composable in the composition during the exit animation. The content isn't removed until the exit animation completes. This means the composable's state is preserved during the exit — if it has a ViewModel or remembered state, it stays alive until the animation finishes. This is usually what you want, but it can cause issues if you're navigating away and expect cleanup to happen immediately.

## `AnimatedContent` — Transitioning Between States

`AnimatedContent` is the generalized version of `AnimatedVisibility`. Instead of toggling between visible and invisible, it transitions between different content based on a state value.

```kotlin
@Composable
fun OrderStatusBadge(status: OrderStatus) {
    AnimatedContent(
        targetState = status,
        transitionSpec = {
            if (targetState.ordinal > initialState.ordinal) {
                // Moving forward: slide up + fade
                slideInVertically { it } + fadeIn() togetherWith
                    slideOutVertically { -it } + fadeOut()
            } else {
                // Moving backward: slide down + fade
                slideInVertically { -it } + fadeIn() togetherWith
                    slideOutVertically { it } + fadeOut()
            }.using(SizeTransform(clip = false))
        },
        label = "orderStatus"
    ) { currentStatus ->
        StatusChip(
            text = currentStatus.displayName,
            color = currentStatus.color
        )
    }
}
```

The `transitionSpec` lambda receives the initial and target states, so you can customize the animation based on the transition direction. In this example, moving forward in the order flow (Placed → Processing → Shipped) slides up, while going backward slides down. The `togetherWith` infix function pairs the enter transition of the new content with the exit transition of the old content.

`SizeTransform` controls how the container size animates when the content changes size. Without it, the container jumps to the new size immediately, which can look jarring. With `clip = false`, the animating content can draw outside the container bounds during the transition, which looks smoother for slide animations.

## `updateTransition` — Coordinated Multi-Property Animations

When multiple animations need to be coordinated around the same state change, `updateTransition` groups them under a single `Transition` object. This is more expressive than using multiple independent `animate*AsState` calls because the transition object manages the overall state and all animations share the same lifecycle.

```kotlin
@Composable
fun SelectableListItem(
    title: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val transition = updateTransition(
        targetState = isSelected,
        label = "selectionTransition"
    )

    val backgroundColor by transition.animateColor(label = "bgColor") { selected ->
        if (selected) MaterialTheme.colorScheme.primaryContainer
        else MaterialTheme.colorScheme.surface
    }

    val iconScale by transition.animateFloat(
        label = "iconScale",
        transitionSpec = {
            if (targetState) spring(dampingRatio = Spring.DampingRatioMediumBouncy)
            else tween(durationMillis = 200)
        }
    ) { selected -> if (selected) 1f else 0f }

    val borderWidth by transition.animateDp(label = "border") { selected ->
        if (selected) 2.dp else 0.dp
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(backgroundColor, RoundedCornerShape(12.dp))
            .border(borderWidth, MaterialTheme.colorScheme.primary, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(16.dp)
    ) {
        Text(text = title, modifier = Modifier.weight(1f))
        Icon(
            Icons.Default.Check,
            contentDescription = null,
            modifier = Modifier.scale(iconScale)
        )
    }
}
```

All three animations — background color, icon scale, and border width — are tied to the same `isSelected` transition. They start and end together, and the transition knows its overall state (running, finished). You can even use different `transitionSpec` values per property — the icon uses a bouncy spring on selection but a linear tween on deselection, while the background and border use defaults.

The advantage over independent `animate*AsState` calls is semantic grouping and inspection. In the Animation Preview tool, `updateTransition` shows as a single coordinated transition with all its child animations, making it easier to tweak timing relationships.

## `Animatable` — Imperative Control

`Animatable` is the lowest-level animation API in Compose. Unlike the declarative APIs above, `Animatable` gives you imperative control — you explicitly call `animateTo`, `snapTo`, and `stop`. This is what you reach for when you need gesture-driven animations, physics-based interactions, or animations that depend on runtime calculations.

```kotlin
@Composable
fun SwipeToDismissItem(
    content: @Composable () -> Unit,
    onDismissed: () -> Unit
) {
    val offsetX = remember { Animatable(0f) }
    val dismissThreshold = 300f

    Box(
        modifier = Modifier
            .offset { IntOffset(offsetX.value.roundToInt(), 0) }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        if (abs(offsetX.value) > dismissThreshold) {
                            // Fling past threshold — animate out and dismiss
                            val target = if (offsetX.value > 0) size.width.toFloat()
                                else -size.width.toFloat()
                            launch {
                                offsetX.animateTo(target, tween(200))
                                onDismissed()
                            }
                        } else {
                            // Snap back
                            launch {
                                offsetX.animateTo(0f, spring())
                            }
                        }
                    },
                    onHorizontalDrag = { _, dragAmount ->
                        launch { offsetX.snapTo(offsetX.value + dragAmount) }
                    }
                )
            }
    ) {
        content()
    }
}
```

`Animatable` handles interruption automatically. If the user starts a new drag while the snap-back animation is running, calling `snapTo` cancels the running animation and sets the value immediately. This is the same interruption model that `animate*AsState` uses internally — `Animatable` is the primitive that the higher-level APIs are built on.

The key difference from `animate*AsState`: `Animatable` is a coroutine-based API. `animateTo` is a suspend function that runs in a coroutine scope. This means you can sequence animations (`animateTo(x); animateTo(y)`), run them in parallel (`launch { a.animateTo(...) }; launch { b.animateTo(...) }`), and coordinate them with other suspend functions.

## Spring Specs — Why Physics Feels Right

The default animation spec in Compose is a spring, not a duration-based easing curve. This is a deliberate design choice. Springs handle interruption naturally — if you change the target mid-animation, the spring adjusts smoothly from the current velocity. Duration-based animations have to restart or do awkward velocity matching.

The two spring parameters that matter most are `dampingRatio` and `stiffness`. A damping ratio of 1.0 means no bounce (critically damped). Below 1.0 adds bounce — lower values mean more oscillation. Stiffness controls how fast the spring settles — higher stiffness means snappier animation. I find `Spring.DampingRatioMediumBouncy` (0.5f) with default stiffness works well for selection animations, while `Spring.DampingRatioNoBouncy` (1.0f) with `Spring.StiffnessMediumLow` works for layout transitions where bounce would feel wrong.

The tradeoff with springs is unpredictable duration. A spring animation doesn't have a fixed duration — it runs until the value settles within a threshold. This means you can't guarantee that two spring animations finish at exactly the same time, which can be a problem for tightly coordinated transitions. In those cases, use `tween` or `keyframes` where you need deterministic timing, and springs where you want natural-feeling motion.

IMO, Compose's animation system is the best animation API I've used on any platform. The layered approach — `animate*AsState` for simple cases, `AnimatedVisibility`/`AnimatedContent` for presence, `updateTransition` for coordination, `Animatable` for full control — means you almost always find the right abstraction level for what you need. You're never forced into a low-level API for a simple fade, and you're never stuck in a high-level API that can't handle a gesture-driven interaction.

Thanks for reading!
