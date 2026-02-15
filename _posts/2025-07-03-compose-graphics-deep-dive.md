---
title: Compose Graphics Deep Dive — Custom Drawing and Shape Detection
layout: post
sequence: 50
categories: post
tags:
  - Android
  - Jetpack Compose
  - Performance
---

A few months ago I was building a feature that needed tap detection on irregularly-shaped UI elements — country outlines on a map, product images with transparent backgrounds where only taps on the visible portion should register. In the old View system, this was a mess. You'd approximate the tap region as a small rectangle, intersect it with the target `Path`, and hope it was close enough. It was slow and sometimes just wrong.

That problem pulled me into Compose's entire graphics stack — `Canvas`, `DrawScope`, `Path`, `Brush`, `BlendMode`, `graphicsLayer`, and eventually `PathHitTester` for pixel-perfect shape detection. What I found changed how I think about custom drawing on Android. Compose doesn't just wrap the old `android.graphics.Canvas` with a new API. It builds a layered system where drawing, clipping, compositing, and hit testing are all designed to work together. Once you understand these layers, building things like custom charts, progress indicators, and interactive shapes becomes surprisingly natural.

## Canvas and DrawScope

The `Canvas` composable is the entry point for custom drawing in Compose. It's actually a thin wrapper around `Modifier.drawBehind` — it gives you a `DrawScope` where you issue drawing commands. The coordinate system starts at `[0, 0]` in the top-left corner, with `x` increasing rightward and `y` increasing downward. The `size` property on `DrawScope` tells you the available drawing area.

```kotlin
Canvas(modifier = Modifier.fillMaxSize()) {
    val canvasWidth = size.width
    val canvasHeight = size.height

    drawRect(
        color = Color.LightGray,
        topLeft = Offset.Zero,
        size = Size(canvasWidth / 2, canvasHeight / 2),
    )

    drawCircle(
        color = Color.Blue,
        radius = 80f,
        center = center,
    )

    drawLine(
        color = Color.Red,
        start = Offset(0f, canvasHeight),
        end = Offset(canvasWidth, 0f),
        strokeWidth = 4f,
    )
}
```

`DrawScope` provides high-level methods — `drawRect`, `drawCircle`, `drawLine`, `drawArc`, `drawImage`, `drawPath`, `drawPoints`, `drawOval`, `drawRoundRect`. Each one handles color, stroke, blend mode, and alpha. For anything `DrawScope` doesn't expose directly, you can drop down to the underlying canvas via `drawIntoCanvas` — which gives you access to `nativeCanvas` for operations like drawing text with `android.graphics.Paint`. But I'd say 90% of custom drawing stays comfortably within `DrawScope`.

The `DrawScope` also provides transformation functions — `translate`, `rotate`, `scale`, `withTransform` — that scope transformations to a lambda. This is cleaner than manually managing matrix state. `withTransform` is particularly useful because it combines multiple transforms into a single operation, which is more efficient than nesting individual ones.

## Path: Building Custom Shapes

`Path` is where things get interesting for shapes beyond circles and rectangles. You create a `Path()` and build it up with drawing commands: `moveTo` positions the pen, `lineTo` draws a straight line, `cubicTo` draws a cubic Bézier curve, `quadraticTo` draws a quadratic one. You call `close()` to connect back to the starting point.

```kotlin
Canvas(modifier = Modifier.size(300.dp)) {
    val heartPath = Path().apply {
        val w = size.width
        val h = size.height
        moveTo(w / 2, h * 0.35f)
        cubicTo(w * 0.15f, h * 0.0f, 0f, h * 0.45f, w / 2, h * 0.85f)
        moveTo(w / 2, h * 0.35f)
        cubicTo(w * 0.85f, h * 0.0f, w, h * 0.45f, w / 2, h * 0.85f)
    }
    drawPath(heartPath, color = Color.Red)
}
```

For geometric shapes, `Path` has convenience methods — `addRect`, `addOval`, `addRoundRect`, `addArc` — so you don't have to manually compute every vertex. You can also combine paths using `op()` for union, intersection, and difference operations. I use `addOval` frequently for clip masks and `addRoundRect` for custom card shapes that need more control than `RoundedCornerShape` provides.

The real power of `Path` shows up when you pair it with `drawWithCache`. Creating a complex path on every frame is wasteful — `drawWithCache` lets you build the path once and reuse it until the size changes.

## Brush: Beyond Solid Colors

Every draw function in `DrawScope` accepts either a `Color` or a `Brush`. A `Brush` defines how an area gets painted, and Compose ships with several built-in options. `SolidColor` wraps a single color (this is what you get when you pass a `Color` directly). `Brush.linearGradient` spreads colors along a line between two points. `Brush.radialGradient` radiates colors outward from a center point. `Brush.sweepGradient` rotates colors around a center like a clock hand.

```kotlin
Canvas(modifier = Modifier.size(200.dp)) {
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(Color(0xFFFF6B6B), Color(0xFF4ECDC4)),
            center = center,
            radius = size.minDimension / 2,
        ),
    )
    drawRect(
        brush = Brush.linearGradient(
            colors = listOf(Color(0xFF667EEA), Color(0xFF764BA2)),
            start = Offset.Zero,
            end = Offset(size.width, size.height),
        ),
        size = Size(size.width / 3, size.height),
    )
}
```

For cases where the built-in brushes aren't enough, `ShaderBrush` lets you plug in a custom shader. On API 33+, you can use `RuntimeShader` with AGSL (Android Graphics Shading Language) for GPU-computed effects — procedural patterns, animated gradients, image-based brushes. Romain Guy's finger shadow demo uses exactly this: a `RuntimeShader` wrapped in a `ShaderBrush` that computes soft shadows per-pixel on the GPU. Most apps won't need custom shaders, but knowing the escape hatch exists means you're never stuck.

## BlendMode: Compositing and Masking

Here's something I wish I'd understood earlier: **`BlendMode` controls how newly drawn pixels combine with existing pixels.** The default is `BlendMode.SrcOver` — new content draws on top, respecting alpha. But the other modes unlock powerful compositing effects.

`BlendMode.SrcIn` keeps only the intersection of source and destination — the new content is visible only where existing content already exists. `BlendMode.DstIn` is the inverse — it keeps existing content only where the new content overlaps. `BlendMode.Clear` erases everything it touches, punching a transparent hole.

The catch is that blend modes interact with **everything** already drawn on the surface. If you use `BlendMode.Clear` without isolation, it'll cut through your composable all the way to the window background, which usually appears as a black hole. This is where `CompositingStrategy.Offscreen` becomes essential — it creates an isolated buffer so blend modes only affect content within that layer.

```kotlin
Image(
    painter = painterResource(id = R.drawable.profile_photo),
    contentDescription = "Profile",
    modifier = Modifier
        .size(120.dp)
        .graphicsLayer {
            compositingStrategy = CompositingStrategy.Offscreen
        }
        .drawWithContent {
            drawContent()
            drawCircle(
                color = Color.Black,
                radius = size.width / 8f,
                center = Offset(size.width * 0.85f, size.height * 0.85f),
                blendMode = BlendMode.Clear,
            )
            drawCircle(
                color = Color.Green,
                radius = size.width / 10f,
                center = Offset(size.width * 0.85f, size.height * 0.85f),
            )
        },
)
```

This creates a circular cutout in the bottom-right corner of a profile image and draws a green status indicator inside it. Without `CompositingStrategy.Offscreen`, the `Clear` blend mode would punch through to the window buffer. I've seen this bug in production code more than once — a mysterious black circle where the cutout should be transparent. The fix is always the same: wrap it in an offscreen compositing layer.

## graphicsLayer: Draw-Phase Transformations

`Modifier.graphicsLayer` modifies rendering properties — scale, rotation, translation, alpha, clip shape, shadow elevation — **without triggering recomposition or layout.** This is the critical distinction. Compose has three phases: composition, layout, and draw. `graphicsLayer` only touches the draw phase, which means you can animate `rotationZ` or `translationX` at 60 fps with minimal cost. If you animated the same thing with `Modifier.offset` or a state that triggers recomposition, you'd be re-running composition and layout every frame.

```kotlin
Card(
    modifier = Modifier
        .graphicsLayer {
            rotationZ = animatedRotation
            scaleX = animatedScale
            scaleY = animatedScale
            alpha = animatedAlpha
            shadowElevation = 8.dp.toPx()
            shape = RoundedCornerShape(16.dp)
            clip = true
        },
) {
    // Card content
}
```

The `CompositingStrategy` inside `graphicsLayer` controls buffering. `Auto` (default) only creates an offscreen buffer when alpha is below 1.0 or a `RenderEffect` is applied. `Offscreen` always buffers — necessary for `BlendMode` effects as I described above. `ModulateAlpha` applies alpha to each draw instruction individually without buffering, which avoids the offscreen allocation but produces different results for overlapping content.

## Clip, Shadow, and Shape

Clipping and shadows are closely tied to `graphicsLayer`. Setting `clip = true` with a `shape` clips the composable's content to that shape — content outside the shape boundary is simply not rendered. `Modifier.clip(shape)` is a convenient wrapper that does the same thing.

```kotlin
Box(
    modifier = Modifier
        .size(200.dp)
        .graphicsLayer {
            clip = true
            shape = RoundedCornerShape(24.dp)
            shadowElevation = 12.dp.toPx()
        }
        .background(Color.White),
) {
    // Content clipped to rounded rectangle with shadow
}
```

Here's a subtlety that caught me off guard: `graphicsLayer` doesn't change the measured size or layout position of your composable. If you apply `translationY` to push content downward, the composable still occupies its original layout bounds — it just draws outside them. This means translated content can overlap siblings without the layout system knowing about it. Adding `Modifier.clip(RectangleShape)` at the start of the modifier chain clips the drawing back to the original bounds if you need to prevent overflow.

## Drawing Modifiers: Choosing the Right One

Compose provides three drawing modifiers, and picking the right one matters.

**`Modifier.drawBehind`** draws behind the composable's content. Simple and focused — use it for custom backgrounds, decorations, or underlay effects. **`Modifier.drawWithContent`** gives you full control over drawing order. You decide when to call `drawContent()`, so you can draw both behind and in front of the composable, or skip content rendering entirely. **`Modifier.drawWithCache`** adds caching — objects created in its block (`Path`, `Brush`, `Paint`) persist across recompositions and are only recreated when size changes or tracked state objects change.

I reach for `drawWithCache` most often in production code. Any time you're building a `Path` or creating a gradient `Brush`, doing it on every draw call is wasteful. `drawWithCache` gives you the caching that `remember` provides for composition, but scoped specifically to the draw phase.

## Real-World Use Cases

The APIs above aren't just for demos. Here's where they show up in real apps.

**Custom progress indicators** — A circular progress bar is a `drawArc` call with a sweep angle driven by an animated state value. Add a gradient `Brush` and a rounded `StrokeCap`, and you have a polished progress ring without pulling in a third-party library. I've used this pattern in a fitness app where the design called for a gradient arc with a rounded endpoint — something that standard `CircularProgressIndicator` doesn't support.

**Charts** — Line charts are a series of `Path.lineTo` calls (or `cubicTo` for smooth curves) drawn with `drawPath`. Bar charts are `drawRect` or `drawRoundRect` calls positioned at computed offsets. The coordinate math isn't trivial, but once you map your data range to `DrawScope` pixel coordinates, the drawing itself is straightforward. `drawWithCache` keeps the path creation out of the hot path.

**Custom shapes and badges** — Notification badges, status indicators, irregular card shapes — all built with `Path` and drawn with `drawPath`. Combine with `PathHitTester` for accurate tap detection on non-rectangular targets.

## PathHitTester: Pixel-Perfect Shape Detection

The one API that Compose provides with no View system equivalent is `PathHitTester`. A `Path` is a sequence of drawing commands, not a filled region — it has no built-in `contains(point)` method. `PathHitTester` takes a `Path`, preprocesses it into a spatial data structure, and exposes fast point-in-path queries via the `in` operator.

```kotlin
@Composable
fun InteractiveShapeCanvas(shapePath: Path, modifier: Modifier = Modifier) {
    var isHighlighted by remember { mutableStateOf(false) }
    val hitTester = remember { PathHitTester(shapePath) }

    Canvas(
        modifier = modifier.pointerInput(Unit) {
            detectTapGestures { tapOffset ->
                isHighlighted = tapOffset in hitTester
            }
        },
    ) {
        drawPath(
            path = shapePath,
            color = if (isHighlighted) Color.Yellow else Color.Gray,
        )
    }
}
```

The critical rule: **tap coordinates and path coordinates must be in the same coordinate system.** If you've applied any transform to render the path, you need to apply the inverse transform to the tap position before testing. This is the most common bug — creating a hit tester with a path centered at the origin but testing against screen-space tap coordinates.

`PathHitTester` also supports high-frequency queries. During a drag gesture, you might call `contains()` dozens of times per second. The spatial data structure keeps this efficient — even paths with hundreds of segments handle drag-frequency queries without dropping frames, as long as you reuse the hit tester via `update()` rather than recreating it.

The reframe for me was realizing that Compose's graphics system isn't just a modernized drawing API. It's a **coherent system** where input handling (`pointerInput`), drawing (`DrawScope`), compositing (`graphicsLayer`), and hit testing (`PathHitTester`) all live in the same composable scope. In the View world, these were separate systems that you had to wire together manually — `onDraw` in one callback, `onTouchEvent` in another, coordinate transforms maintained by hand. Compose puts them all in the same function body with the same coordinate system. That's what makes building interactive custom graphics genuinely easier, not just syntactically different.

Thanks for reading!
