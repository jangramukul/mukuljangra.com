---
title: "Animation APIs in Compose"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 22
sequence: 22
description: "Animation questions come up regularly in Compose interviews because they test whether you understand not just the APIs, but how Compose's declarative..."
---

## Animation APIs in Compose

Compose animations are genuinely fun once you get the mental model. The core idea is simple -- you don't tell things *how* to move, you tell them *where* to be, and Compose figures out the motion. That declarative twist is what makes these questions interesting in interviews.

#### What is animate*AsState and when do you use it?

Think of `animate*AsState` as a GPS for values. You set the destination, and it drives there smoothly on its own. You give it a target value, and whenever that target changes, it animates from the current value to the new one. It returns a `State<T>`, so your composable recomposes with each animation frame automatically.

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

There are variants for common types -- `animateDpAsState`, `animateFloatAsState`, `animateColorAsState`, `animateIntOffsetAsState`, and others. If your type isn't covered, you can use `animateValueAsState` with a custom `TwoWayConverter`. It's the simplest animation API in Compose, and honestly the one you'll reach for 80% of the time.

#### How does AnimatedVisibility work?

`AnimatedVisibility` wraps a composable and animates it in and out of existence. When `visible` flips to true, it runs the `enter` transition. When it flips back to false, it runs the `exit` transition and then -- and this is the important part -- *removes the content from the composition entirely*.

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

This is not the same as animating alpha to zero. Animating alpha is like putting an invisible cloak on someone -- they're still standing there, taking up space, and accessibility services can still see them. `AnimatedVisibility` actually escorts them out of the room. The composable is gone from the tree after the exit animation finishes.

#### What is the difference between AnimatedContent and Crossfade?

Both animate between different composables, but `Crossfade` is the one-trick pony -- it only does a fade. Old content fades out, new content fades in, done. `AnimatedContent` is the full toolkit. It supports custom `ContentTransform` with enter/exit transitions, and it can animate size changes through `SizeTransform`.

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

#### What does animateContentSize do?

`Modifier.animateContentSize()` is like a rubber band around your composable. When the content inside changes size, instead of snapping to the new dimensions, it stretches or contracts smoothly. It only affects the size -- the content inside just appears or disappears normally.

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

Here's a gotcha that bites people: `animateContentSize` should come *before* any size modifiers like `height()` or `width()` in the modifier chain. If you slap a fixed size modifier before it, the size is already locked in and there's nothing left to animate.

> **🧠 Think about it:** If `spring` animations don't have a fixed duration, how does Compose know when they're done?

#### What is the difference between spring, tween, and keyframes animation specs?

These are the three main `AnimationSpec` types, and they each have a different philosophy about how to get from A to B.

- **spring** -- Physics-based, like an actual spring. Defined by `dampingRatio` and `stiffness`, not duration. It ends when the spring settles, so the duration is dynamic. This is Compose's default because it looks the most natural -- it never abruptly stops, it decelerates like things do in real life.
- **tween** -- Think of it like a train on a schedule. Fixed duration, fixed easing curve (`LinearEasing`, `FastOutSlowInEasing`, etc.). Predictable timing but can feel mechanical.
- **keyframes** -- Like giving a delivery driver waypoints. You define specific values at specific timestamps within the overall duration. Great for multi-stage animations where the value needs to pass through certain milestones.

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

Spring is the default for a reason -- it handles interrupted animations gracefully. If the target changes mid-animation, a spring adjusts naturally, like a ball on a rubber band finding a new resting point. A tween would restart from scratch, which looks janky.

#### What is rememberInfiniteTransition and when do you use it?

`rememberInfiniteTransition` creates an animation that runs forever -- no target, no end condition, just keeps going. It's for things like pulsing indicators, shimmer effects, or rotating loaders. The kind of motion that says "hey, something's happening" without ever stopping.

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

The transition survives recomposition because it's remembered. For animations that should run a fixed number of times, use `Animatable` with `repeatable` instead of `infiniteRepeatable`.

#### How do you use updateTransition for coordinated animations?

`updateTransition` is like a conductor in an orchestra -- one baton wave, and all the instruments move together. It manages multiple animations that share the same state. When the state changes, every child animation defined through `animate*` extension functions transitions in sync.

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

The advantage over using multiple `animate*AsState` calls is that all animations are tied to the same transition and can have their timing coordinated. You can also use `transitionSpec` on each animation to customize the spec based on which state you're transitioning to and from.

#### What is Animatable and how is it different from animate*AsState?

If `animate*AsState` is the GPS that drives itself, `Animatable` is a manual transmission -- you're in full control. It's the low-level coroutine-based animation API. You call `animateTo()` or `snapTo()` inside a coroutine yourself. This gives you full control over sequencing, chaining, and animation lifecycle.

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

> **🧠 Think about it:** How would you chain three animations in sequence -- fade in, then slide up, then scale -- without using `AnimatorSet`?

#### How do you create sequential and concurrent animations?

Here's where Compose's design really shines. With `Animatable`, sequential animations are just suspend calls in order. Each `animateTo()` suspends until it finishes, and then the next one runs. For concurrent animations, launch multiple coroutines. No special API needed -- Kotlin's structured concurrency handles it all.

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
        alpha.animateTo(1f)
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

Compare this to the old View world where you'd build an `AnimatorSet`, call `playTogether()` and `playSequentially()`, wire up listeners -- it was like assembling IKEA furniture with extra screws left over. Here, it's just coroutines doing what coroutines do.

#### How does Compose handle interrupted animations?

When you change the target value while an animation is in progress, Compose doesn't panic and restart from scratch. It picks up from the current value *and velocity* and animates toward the new target. It's like a car smoothly changing lanes instead of pulling over and making a U-turn.

For `spring` animations, this is seamless -- the physics model adjusts naturally. For `tween`, the animation restarts with the current value as the new start point, but the velocity isn't preserved. That's another reason spring is the default -- it handles interruptions without jarring jumps.

`Animatable` enforces mutual exclusion at the API level. If `animateTo()` is called while another animation is running, it cancels the previous coroutine and starts the new animation from the current value with the current velocity. This is handled automatically -- you don't need to manage cancellation yourself.

#### What happens to animations during recomposition? How do you prevent resets?

Animations backed by `remember` survive recomposition -- this includes `Animatable`, `rememberInfiniteTransition`, and `animate*AsState`. The animation state lives in the composition, so as long as the composable stays in the tree, your animation keeps running.

The classic mistake is forgetting `remember`. If you write `val anim = Animatable(0f)` without wrapping it in `remember`, every recomposition creates a brand new `Animatable` starting from zero. It's like resetting a stopwatch every time someone walks into the room. Same with `LaunchedEffect` -- if the key changes on every recomposition, the effect restarts and your animation loops from the beginning.

For `animate*AsState`, the animation is automatically remembered and only re-targets when the target value changes. But for `LaunchedEffect`-driven animations, be careful with keys. Use `Unit` as the key if you want it to run once, or a stable identifier if it should restart when specific data changes.

#### When should you use graphicsLayer for animations instead of regular modifiers?

This one comes down to understanding Compose's three phases -- Composition, Layout, Drawing. `Modifier.graphicsLayer` applies transformations (alpha, scale, rotation, translation) at the draw phase *only*, skipping layout and composition entirely. Regular modifiers like `offset()`, `size()`, or `alpha()` trigger layout recalculation.

For animations running every frame, that difference is huge. An `offset` modifier triggers a layout pass 60 times per second. A `graphicsLayer { translationX = value }` only redraws. It's like rearranging furniture in your house versus just moving a picture on the wall -- one requires measuring the whole room again, the other doesn't.

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

If you're animating visual properties continuously, use `graphicsLayer`. If you need the layout system to respond -- like other composables moving out of the way -- then you need layout-aware modifiers.

> **🧠 Think about it:** If `graphicsLayer` only affects the draw phase, what would happen if you tried to use it to make other composables reposition around an animated element?

#### How do you animate items in a LazyColumn?

Compose provides `Modifier.animateItem()` for animating item placement, appearance, and disappearance in lazy lists. It handles fade-in for new items, fade-out for removed items, and placement animation when items reorder.

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

The `key` parameter on `items` is absolutely critical here. Without stable keys, Compose can't track which item moved where, so the animations just won't work. It's like shuffling a deck of cards where every card is blank -- you can't tell what moved. Each item needs a unique, stable identifier.

#### What are shared element transitions in Compose?

Shared element transitions make it look like the same element is physically traveling from one screen to another. You know that satisfying animation where you tap a thumbnail and it expands into a full-screen image? That's this. Compose introduced `SharedTransitionLayout` and the `sharedElement` / `sharedBounds` modifiers for it.

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

`sharedElement` animates size and position of the exact same content between two layouts. `sharedBounds` is for when the content *differs* between the two states but should share the same animated bounds -- like a card expanding into a full-screen detail view where the layout changes but the container animates smoothly. Both require a `SharedTransitionLayout` as a common ancestor and work with `AnimatedVisibility` or `AnimatedContent` to know which elements are entering and exiting.

#### How do you build gesture-driven animations?

Gesture-driven animations connect the user's finger directly to animation values. You typically use `Animatable` with `pointerInput` or drag modifiers, snapping to a velocity-based fling when the gesture ends. The pattern is straightforward -- `snapTo()` during the drag (instant, no animation) and `animateTo()` on drag end (animated settlement).

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

`Animatable` preserves velocity across the snap-to-animate transition, which is the secret sauce. If you use `animateDecay` instead of `animateTo`, the element continues with the fling velocity and decelerates naturally -- like sliding a hockey puck across ice.

#### What is the difference between animateDecay and animateTo?

`animateTo` says "go to this exact spot." `animateDecay` says "I'm giving you a push -- coast until you stop." It takes an initial velocity and decelerates to zero using a decay animation spec. No target, just momentum.

```kotlin
// animateTo — moves to a fixed target
offsetX.animateTo(targetValue = 0f, animationSpec = spring())

// animateDecay — continues from current velocity and slows down
offsetX.animateDecay(
    initialVelocity = velocity,
    animationSpec = exponentialDecay()
)
```

`animateDecay` is the natural fit for fling gestures. When the user lifts their finger, you pass the fling velocity to `animateDecay` and the element coasts to a natural stop. You can also use `splineBasedDecay` which matches the Android platform's native fling behavior in scrollable containers.

#### How would you implement a shimmer loading effect?

A shimmer effect uses `rememberInfiniteTransition` to slide a gradient highlight across a composable in a loop. It's that shiny loading placeholder you see everywhere -- Instagram, Facebook, basically any app with content loading states.

```kotlin
@Composable
fun ShimmerBox(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateX by transition.animateFloat(
        initialValue = -300f,
        targetValue = 300f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmerOffset"
    )

    Box(
        modifier = modifier
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color.LightGray,
                        Color.White,
                        Color.LightGray
                    ),
                    start = Offset(translateX, 0f),
                    end = Offset(translateX + 200f, 0f)
                )
            )
    )
}
```

The gradient has three stops -- gray, white, gray -- and the offset shifts continuously to create the sweeping light effect. Using `graphicsLayer` or `drawBehind` for the gradient drawing can improve performance since it skips the layout phase.

#### How do you animate navigation transitions in Compose?

With Navigation Compose, you define transitions using `enterTransition`/`exitTransition` parameters on the `NavHost` or individual `composable()` destinations. Each destination can have its own entry and exit choreography.

```kotlin
NavHost(
    navController = navController,
    startDestination = "home",
    enterTransition = { fadeIn(tween(300)) + slideInHorizontally { it } },
    exitTransition = { fadeOut(tween(300)) + slideOutHorizontally { -it } },
    popEnterTransition = { fadeIn(tween(300)) + slideInHorizontally { -it } },
    popExitTransition = { fadeOut(tween(300)) + slideOutHorizontally { it } }
) {
    composable("home") { HomeScreen() }
    composable("detail") { DetailScreen() }
}
```

There are four transition parameters -- `enterTransition` and `exitTransition` for forward navigation, and `popEnterTransition` and `popExitTransition` for back navigation. You can override them per-destination if a specific screen needs a different animation. For shared element transitions across navigation, wrap the `NavHost` in a `SharedTransitionLayout`.

#### How does Compose's animation system compare to the View system?

The View system went through three generations -- the old `Animation` class (XML-based), `ObjectAnimator`/`AnimatorSet` (property animation), and the `Transition` framework. They're all imperative. You create an animator, set properties, call `start()`, and hope you remembered to clean up.

Compose flips it around. The animation system is declarative and state-driven. You describe the target state and Compose figures out the motion. Interrupted animations preserve velocity automatically, coordinating multiple animations doesn't require an `AnimatorSet`, and the animation lifecycle is tied to the composition tree -- so there are no leaked animators lurking around.

The biggest conceptual difference is that View animations mutate properties on existing objects, while Compose animations produce new state values that drive recomposition. There's no `view.animate().alpha(0f)` equivalent -- instead you change a state variable and let `animate*AsState` handle the interpolation. This makes animations composable (you can combine them), predictable (same state always produces same output), and testable (you can advance the clock programmatically).

### Common Follow-ups

- What's the difference between `sharedElement` and `sharedBounds` modifiers?
- How do you test animations in Compose? Can you control the animation clock?
- What happens to an infinite transition when the composable leaves the composition?
- How do you profile animation performance and detect dropped frames?
- How do you animate between different content in a LazyColumn item (like expanding a card)?
- What is `splineBasedDecay` and when would you use it over `exponentialDecay`?
- How do you animate layout changes when switching between different composables in the same slot?
- Can you combine multiple `AnimationSpec` types in a single transition?
