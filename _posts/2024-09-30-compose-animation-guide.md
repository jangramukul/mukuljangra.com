---
title: Compose Animation APIs Guide
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
---

I used to think animations were hard. And honestly? In the View system, they kind of were. You had `ObjectAnimator`, `ValueAnimator`, `ViewPropertyAnimator`, `TransitionManager`, `MotionLayout`, raw `Canvas.drawFrame` loops — each with its own lifecycle, its own cancellation model, its own way of handling interruptions. It was like having six different TV remotes for one television, and none of them worked the same way.

Moving to Compose simplified this dramatically. Not because Compose has fewer animation APIs — it actually has quite a few — but because they all share the same underlying model. And here it is, the one sentence that makes everything click:

**An animation is a value that changes over time, and Compose recomposes the UI whenever that value changes.**

That's it. That's the whole thing. Every API — from the simple `animateColorAsState` to the complex `Animatable` — is fundamentally about producing a changing value and letting recomposition do the rendering. Think of it like a speedometer in your car. The needle (the UI) doesn't know anything about the engine or the transmission. It just reads a number and points to it. Compose animations work the same way — they produce a number (or a color, or a size), and the UI just reads it during recomposition. The difference between the various APIs is how much control you get over timing, coordination, and state management. Once I understood that, choosing the right API for each situation became straightforward.

## `animate*AsState` — The Simplest Entry Point

`animate*AsState` functions are the "set it and forget it" of Compose animations. You give them a target value, and they animate from the current value to the target whenever the target changes. They return a `State<T>` that Compose reads during recomposition, so the UI updates automatically. It's like a thermostat — you set the desired temperature, and it figures out how to get there. You don't manage the heating and cooling cycle yourself.

The family is bigger than most people realize — there's `animateFloatAsState`, `animateDpAsState`, `animateColorAsState`, `animateIntAsState`, `animateOffsetAsState`, `animateSizeAsState`, `animateIntOffsetAsState`, `animateIntSizeAsState`, and `animateRectAsState`. Basically, any common type you'd want to animate has a dedicated variant, and if you need something custom, `animateValueAsState` with a `TwoWayConverter` handles arbitrary types.

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

Look at that. Three animations running simultaneously — elevation, background color, corner radius — all driven by the same `isExpanded` boolean. You don't manage animation lifecycle, handle cancellation, or worry about interruptions. If `isExpanded` flips mid-animation, the animation reverses from its current position. Just like that.

This interruption handling is built into the framework and works correctly by default, which is a massive improvement over the View system where interrupting an `ObjectAnimator` required manual bookkeeping. Remember those days? Tracking `isAnimating` flags, calling `cancel()` at the right moment, hoping you didn't leave the view in a weird halfway state? Yeah, none of that here.

The `label` parameter is worth mentioning — it's used by the **Animation Preview** tool in Android Studio and by **Layout Inspector** to identify animations. It's technically optional, but I always include it because debugging unnamed animations in the inspector is a pain.

## `AnimatedVisibility` — Enter and Exit Transitions

Imagine you're building a notification system. A banner needs to slide down from the top, hang around for a bit, then slide back up and vanish. In the View system, you'd wire up an `ObjectAnimator` for the entrance, track whether the view is visible, set up another animator for the exit, and make sure you actually remove the view from the hierarchy when the exit finishes. That's a lot of ceremony for "show a thing, then hide a thing."

`AnimatedVisibility` makes this ridiculously simple. You wrap a composable and describe what the enter and exit transitions should look like. That's it. I use this for notification banners, FAB visibility on scroll, empty state messages, and snackbar-style popups — basically anywhere content needs to appear or vanish with polish.

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
            initialOffsetY = { -it },
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

See that `+` operator? Enter and exit transitions compose with it. `slideInVertically + fadeIn` means the element both slides and fades simultaneously — like how a real-world notification on your phone slides and fades in one smooth motion. Here's the full set of transitions you can combine — **enter**: `fadeIn`, `slideIn`, `slideInHorizontally`, `slideInVertically`, `expandIn`, `expandHorizontally`, `expandVertically`, `scaleIn`. **Exit**: `fadeOut`, `slideOut`, `slideOutHorizontally`, `slideOutVertically`, `shrinkOut`, `shrinkHorizontally`, `shrinkVertically`, `scaleOut`. Each transition can have its own `animationSpec`, so the slide can use a spring while the fade uses a linear tween. I use `expandVertically` + `fadeIn` for accordion-style list items, and `scaleIn` + `fadeIn` for dialog or popup entrances where you want that zoom-in feel.

Now here's where it gets interesting. `AnimatedVisibility` keeps the composable in the composition during the exit animation. The content isn't removed until the exit animation completes. This means the composable's state is preserved during the exit — if it has a ViewModel or remembered state, it stays alive until the animation finishes. This is usually what you want, but it can cause issues if you're navigating away and expect cleanup to happen immediately.

## `AnimatedContent` — Transitioning Between States

`AnimatedContent` is the generalized version of `AnimatedVisibility`. Instead of toggling between visible and invisible, it transitions between different content based on a state value. Think of it like a magic box on stage — you put something in, close the curtain, open it again, and something completely different is inside. Except here, the curtain is a smooth crossfade, slide, or whatever transition you want.

It's perfect for tab content switching, order status badges, multi-step forms, or any screen where a sealed class drives the UI state.

```kotlin
sealed class CheckoutStep {
    data object Cart : CheckoutStep()
    data class Shipping(val items: List<CartItem>) : CheckoutStep()
    data class Payment(val address: Address) : CheckoutStep()
    data class Confirmation(val orderId: String) : CheckoutStep()
}

@Composable
fun CheckoutFlow(currentStep: CheckoutStep) {
    AnimatedContent(
        targetState = currentStep,
        transitionSpec = {
            val forward = when {
                initialState is CheckoutStep.Cart -> true
                initialState is CheckoutStep.Shipping
                    && targetState !is CheckoutStep.Cart -> true
                initialState is CheckoutStep.Payment
                    && targetState is CheckoutStep.Confirmation -> true
                else -> false
            }
            if (forward) {
                slideInHorizontally { it } + fadeIn() togetherWith
                    slideOutHorizontally { -it } + fadeOut()
            } else {
                slideInHorizontally { -it } + fadeIn() togetherWith
                    slideOutHorizontally { it } + fadeOut()
            }.using(
                SizeTransform(clip = false)
            )
        },
        contentAlignment = Alignment.TopCenter,
        label = "checkoutStep"
    ) { step ->
        when (step) {
            is CheckoutStep.Cart -> CartScreen()
            is CheckoutStep.Shipping -> ShippingScreen(step.items)
            is CheckoutStep.Payment -> PaymentScreen(step.address)
            is CheckoutStep.Confirmation -> ConfirmationScreen(step.orderId)
        }
    }
}
```

The `transitionSpec` lambda receives the initial and target states, so you can customize the animation based on the transition direction. Going forward in the checkout? Slide left. Going back? Slide right. The user intuitively understands the navigation direction just from the animation. The `togetherWith` infix function pairs the enter transition of the new content with the exit transition of the old content.

**`SizeTransform`** controls how the container size animates when the content changes size — without it, the container jumps to the new size immediately, which looks jarring. With `clip = false`, the animating content can draw outside the container bounds during the transition, which looks smoother for slide animations. The **`contentAlignment`** parameter controls where smaller content is positioned within the animated container, which matters when transitioning between content of different sizes.

Here's the thing about using `AnimatedContent` with sealed classes — the `targetState` lambda gives you exhaustive `when` matching, so the compiler enforces that you handle every state. This is much safer than switching on strings or enums where you might forget a case. IMO, sealed class + `AnimatedContent` is the cleanest pattern for multi-state UI in Compose.

> **💡 The "aha" moment:** Every Compose animation API — `animate*AsState`, `AnimatedVisibility`, `AnimatedContent` — is doing the same fundamental thing: producing a changing value and letting recomposition render it. The only difference is the level of abstraction. Once you see that, the entire animation surface area stops being intimidating and starts being a toolkit where you just pick the right wrench for the job.

## `updateTransition` — Coordinated Multi-Property Animations

Here's a scenario. You're building a selectable list item. When the user taps it, three things need to happen at once: the background color changes, a checkmark icon scales in, and a border appears. You could use three separate `animate*AsState` calls, and honestly, it would work. But there's a better way.

`updateTransition` groups multiple animations under a single `Transition` object. Think of it like a conductor leading an orchestra — individual musicians (animations) can play different notes at different tempos, but the conductor keeps everyone synchronized around the same piece of music (state change).

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

All three animations — background color, icon scale, and border width — are tied to the same `isSelected` transition. They start and end together, and the transition knows its overall state (running, finished). You can even use different `transitionSpec` values per property — the icon uses a bouncy spring on selection but a linear tween on deselection, while the background and border use defaults. Different instruments, same conductor.

The advantage over independent `animate*AsState` calls is semantic grouping and inspection. In the **Animation Preview** tool, `updateTransition` shows as a single coordinated transition with all its child animations, making it easier to tweak timing relationships. I use this heavily for bottom navigation tab transitions, where the icon, label color, and indicator bar all need to move in sync.

## `InfiniteTransition` — Animations That Never Stop

Some animations don't have a destination. They just... keep going. Loading spinners, pulsing indicators, shimmer effects, rotating sync icons — these are animations that run forever, or at least until the composable leaves the composition. That's where `rememberInfiniteTransition` comes in.

Think of it like a hamster on a wheel. There's no "done" state — it just keeps spinning until you take the hamster out (remove the composable from the composition).

```kotlin
@Composable
fun ShimmerLoadingPlaceholder(modifier: Modifier = Modifier) {
    val infiniteTransition = rememberInfiniteTransition(label = "shimmer")

    val shimmerOffset by infiniteTransition.animateFloat(
        initialValue = -300f,
        targetValue = 300f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmerOffset"
    )

    val pulsingAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 800),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulsingAlpha"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(80.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color.LightGray.copy(alpha = pulsingAlpha),
                        Color.White.copy(alpha = 0.8f),
                        Color.LightGray.copy(alpha = pulsingAlpha)
                    ),
                    start = Offset(shimmerOffset, 0f),
                    end = Offset(shimmerOffset + 200f, 0f)
                )
            )
    )
}
```

The `infiniteRepeatable` animation spec wraps any regular `AnimationSpec` and makes it repeat. **`RepeatMode.Reverse`** bounces back and forth (great for pulsing — the alpha goes up, then back down, then up again), while **`RepeatMode.Restart`** snaps back to the initial value and repeats (better for shimmer and rotation where you want the motion to always flow in one direction). You can combine multiple animated values from the same `InfiniteTransition` — in the example above, both the shimmer offset and the pulsing alpha are coordinated under one transition.

A common real-world use: rotating a sync icon while a background refresh runs. You wrap the icon in `AnimatedVisibility` controlled by `isSyncing`, and inside it, use `rememberInfiniteTransition` to rotate. When `isSyncing` flips to false, `AnimatedVisibility` exits and the infinite transition gets disposed automatically. No manual cleanup needed. The hamster leaves the wheel on its own.

## `Animatable` — Imperative Control

OK, so all the APIs we've seen so far are declarative — you describe what you want, and Compose figures out how to get there. But what happens when the user's finger is on the screen, dragging something around? You can't declare a target value because the target is wherever the finger is right now, and it's changing 60 times per second.

This is where `Animatable` comes in. It's the lowest-level animation API in Compose, and it gives you imperative control — you explicitly call `animateTo`, `snapTo`, and `stop`. If the declarative APIs are like an autopilot, `Animatable` is like grabbing the steering wheel yourself.

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
                            val target = if (offsetX.value > 0) size.width.toFloat()
                                else -size.width.toFloat()
                            launch {
                                offsetX.animateTo(target, tween(200))
                                onDismissed()
                            }
                        } else {
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

`Animatable` handles interruption automatically. If the user starts a new drag while the snap-back animation is running, calling `snapTo` cancels the running animation and sets the value immediately. No weird state, no race conditions. This is the same interruption model that `animate*AsState` uses internally — **`Animatable` is the primitive that the higher-level APIs are built on.** All those nice declarative APIs you used earlier? Under the hood, they're all running an `Animatable`.

> **🧠 Think about it:** If `Animatable` is the foundation everything else is built on, why wouldn't you just use it for everything? What do the higher-level APIs actually give you that `Animatable` doesn't?

The answer: convenience and safety. `animate*AsState` handles the `remember`, ties into recomposition automatically, and manages the coroutine scope for you. `Animatable` is a coroutine-based API — `animateTo` is a suspend function, so you can sequence animations (`animateTo(x); animateTo(y)`), run them in parallel with `launch`, and coordinate them with other suspend functions. That power is great when you need it, but it's unnecessary ceremony for a simple color fade.

In real apps, I use `Animatable` for pull-to-refresh indicators, bottom sheet drag-to-dismiss, and any animation where the user's finger position directly drives the value. If you're not responding to gestures or sequencing multiple animations, you probably don't need `Animatable` — reach for `animate*AsState` instead.

## `AnimationSpec` — Spring vs Tween vs Keyframes

Here's something that surprises a lot of people: the default animation spec in Compose is `spring`, not a duration-based easing curve.

Sounds weird, right? We've been trained by CSS and the View system to think in terms of "300ms ease-in-out." But springs are the default for a really good reason. Springs handle interruption naturally — if you change the target mid-animation, the spring adjusts smoothly from the current velocity, like a ball on a rubber band that you suddenly yank in a different direction. It doesn't stop and restart. It just changes course. Duration-based animations have to restart or do awkward velocity matching, which looks janky.

### Spring

The two spring parameters that matter most are **`dampingRatio`** and **`stiffness`**. Think of it like a door closer. The damping ratio controls how much the door bounces when it hits the frame — a ratio of 1.0 means no bounce at all (critically damped), like a heavy fire door. Below 1.0 adds bounce — lower values mean more oscillation, like a screen door on a windy day. Stiffness controls how fast the spring settles — higher stiffness means snappier animation, like a tightly wound spring vs. a loose slinky.

I find `Spring.DampingRatioMediumBouncy` (0.5f) with default stiffness works well for selection animations, while `Spring.DampingRatioNoBouncy` (1.0f) with `Spring.StiffnessMediumLow` works for layout transitions where bounce would feel wrong. The tradeoff with springs is unpredictable duration — a spring runs until the value settles within a threshold, so you can't guarantee that two spring animations finish at exactly the same time.

### Tween

`tween` is duration-based with easing curves — `LinearEasing`, `FastOutSlowInEasing`, `FastOutLinearInEasing`, `LinearOutSlowInEasing`. You get deterministic timing, which is critical when you need two animations to end at the same frame (like coordinating a content crossfade with a background color change). The downside is that interruptions feel jarring — the animation has to restart or do abrupt velocity changes when the target moves mid-flight.

### Keyframes

`keyframes` gives you frame-level control over the animation curve. You define the value at specific timestamps, and the animation interpolates between them. This is the go-to for complex, choreographed motion like bounce-settle effects or multi-stage transitions that don't map to simple easing curves. Think of keyframes like choreographing a dance move — at beat 1 you're here, at beat 3 you're there, at beat 5 you're back.

```kotlin
@Composable
fun BounceOnClick(onClick: () -> Unit, content: @Composable () -> Unit) {
    var isPressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 1f else 1f,
        animationSpec = keyframes {
            durationMillis = 400
            1f at 0 using LinearEasing
            0.85f at 100 using FastOutSlowInEasing
            1.1f at 250 using FastOutSlowInEasing
            1f at 400
        },
        label = "bounceScale"
    )

    Box(
        modifier = Modifier
            .scale(scale)
            .clickable {
                isPressed = !isPressed
                onClick()
            }
    ) {
        content()
    }
}
```

Here's my rule of thumb: **use springs for interactive UI** (selection, toggles, gestures) because they handle interruption gracefully. **Use tween for coordinated transitions** (crossfades, page transitions) where timing predictability matters. **Use keyframes for choreographed effects** (onboarding animations, celebration confetti, complex button feedback) where you need specific values at specific moments.

> **⚡ Quick check:** You're building a toggle switch that the user can flick back and forth rapidly. Should you use a spring or a tween? And why does the answer matter for how the animation feels when interrupted?

## Shared Element Transitions

Starting with Compose 1.7, shared element transitions are officially supported through `SharedTransitionLayout` and `SharedTransitionScope`. This was one of the most requested features — and for good reason. You know that satisfying effect in Google Photos where you tap a thumbnail and it smoothly expands into the full-screen detail view? The image doesn't disappear and reappear — it *travels* from one screen to the other. That's a shared element transition, and building one used to be a nightmare of `FragmentTransaction` flags and `TransitionName` matching. Not anymore.

```kotlin
@Composable
fun ProductListToDetail(
    products: List<Product>,
    selectedProduct: Product?,
    onProductClick: (Product) -> Unit,
    onBack: () -> Unit
) {
    SharedTransitionLayout {
        AnimatedContent(
            targetState = selectedProduct,
            label = "productTransition"
        ) { product ->
            if (product == null) {
                LazyColumn {
                    items(products) { item ->
                        Row(
                            modifier = Modifier
                                .clickable { onProductClick(item) }
                                .padding(16.dp)
                        ) {
                            Image(
                                painter = rememberAsyncImagePainter(item.imageUrl),
                                contentDescription = null,
                                modifier = Modifier
                                    .size(64.dp)
                                    .sharedElement(
                                        state = rememberSharedContentState(
                                            key = "image-${item.id}"
                                        ),
                                        animatedVisibilityScope = this@AnimatedContent
                                    )
                            )
                            Text(
                                text = item.name,
                                modifier = Modifier
                                    .sharedBounds(
                                        sharedContentState = rememberSharedContentState(
                                            key = "title-${item.id}"
                                        ),
                                        animatedVisibilityScope = this@AnimatedContent
                                    )
                            )
                        }
                    }
                }
            } else {
                Column(modifier = Modifier.clickable { onBack() }) {
                    Image(
                        painter = rememberAsyncImagePainter(product.imageUrl),
                        contentDescription = null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp)
                            .sharedElement(
                                state = rememberSharedContentState(
                                    key = "image-${product.id}"
                                ),
                                animatedVisibilityScope = this@AnimatedContent
                            )
                    )
                    Text(
                        text = product.name,
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier
                            .sharedBounds(
                                sharedContentState = rememberSharedContentState(
                                    key = "title-${product.id}"
                                ),
                                animatedVisibilityScope = this@AnimatedContent
                            )
                    )
                }
            }
        }
    }
}
```

The distinction between **`Modifier.sharedElement`** and **`Modifier.sharedBounds`** tripped me up at first. Here's how I think about it: `sharedElement` is for content that looks the same on both screens — an image, an icon. The framework animates the size and position, and the exact same content renders throughout the transition. It's like physically picking up a photo and moving it to a new spot on your desk.

`sharedBounds` is for content that changes appearance — like a title that's small in the list but large in the detail view. The framework animates the bounds (position and size) while crossfading between the two different renderings of the content. It's more like a shape-shifting container — the box moves and resizes, and what's inside morphs from one version to another.

Both modifiers require a matching key via `rememberSharedContentState` and an `animatedVisibilityScope` (typically from `AnimatedContent` or `AnimatedVisibility`). The key has to be identical on both the source and target elements. If you use navigation-compose, the `NavHost` provides the `AnimatedVisibilityScope` automatically, which makes integrating shared element transitions with navigation pretty seamless.

## Real-World Animation Patterns

### Shimmer Loading

The `InfiniteTransition` shimmer example above is one pattern, but in production, I typically create a reusable `Modifier.shimmer()` extension that applies the gradient brush to any composable. Wrap your placeholder content in a `Column` of shimmer boxes matching your real layout's dimensions — this looks far better than a generic spinner because the user can see the shape of the content that's about to load. It's like seeing the outline of furniture under a sheet vs. staring at a blank room wondering what's coming.

### Tab and Page Transitions

For bottom navigation tabs, combine `AnimatedContent` with `slideInHorizontally`/`slideOutHorizontally` to create directional transitions. Track the previous tab index and compare it with the new one to determine slide direction — left-to-right for forward, right-to-left for back. Pair this with `updateTransition` on the bottom bar itself to animate the icon tint, label alpha, and selection indicator position in sync.

### Gesture-Driven Bottom Sheets

`Animatable` is the right tool here. Track vertical drag with `detectVerticalDragGestures`, `snapTo` during the drag for instant feedback, then `animateTo` with a spring on release — either snapping to expanded, half-expanded, or collapsed based on velocity and position thresholds. The Material3 `BottomSheetScaffold` does this internally, but building your own teaches you a lot about how `Animatable` velocity decay works.

### Pull-to-Refresh

Same pattern as bottom sheets but vertical-only. Use `Animatable` for the offset, add `animateDecay` with `exponentialDecay()` for the fling behavior after release, and `animateTo(0f)` to spring back after the refresh triggers. The key gotcha: make sure your `animateTo` uses a spring spec, not a tween — you want the snap-back to feel physical, not robotic.

> **🔥 Real talk:** I've seen codebases where every animation uses `tween(300)` because someone copy-pasted it everywhere. Everything moves at the same speed, with the same easing. It looks mechanical and lifeless. Springs for interactive stuff, tweens for coordinated transitions, and keyframes for choreographed effects — that mental model alone will make your app's animations feel 10x more natural.

## Animation Debugging

You built your animation, it looks... not quite right. The timing feels off, or maybe something is recomposing that shouldn't be. What do you do? Don't just keep tweaking values and redeploying — Compose has solid animation debugging tools, and I'd recommend using them early.

**Animation Preview** in Android Studio lets you scrub through animations interactively in the `@Preview` pane. You can pause, step frame-by-frame, slow down to 0.1x speed, and inspect the animated values at any point in the timeline. It works with `updateTransition` and `AnimatedVisibility` out of the box — just annotate your composable with `@Preview` and the animation controls appear in the preview toolbar. This is honestly the fastest way to tune spring parameters and tween durations without deploying to a device.

**Layout Inspector** shows running animations in a live app. You can see which composables are recomposing due to animation, check if you're accidentally recomposing more of the tree than intended, and verify that your `label` strings show up correctly. If an animation feels janky, Layout Inspector will show you whether you're dropping frames because of expensive recomposition in the animation path. IMO, adding `label` to every animation call and checking Layout Inspector once before shipping is the minimum debugging workflow you should have.

IMO, Compose's animation system is the best animation API I've used on any platform. The layered approach — `animate*AsState` for simple cases, `AnimatedVisibility`/`AnimatedContent` for presence, `updateTransition` for coordination, `InfiniteTransition` for looping, `Animatable` for full control, and shared element transitions for navigation — means you almost always find the right abstraction level for what you need. You're never forced into a low-level API for a simple fade, and you're never stuck in a high-level API that can't handle a gesture-driven interaction.

Thanks for reading!
