---
title: Compose Graphics Deep Dive — Custom Drawing and Shape Detection
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Performance
---

A few months ago, I was building a feature that required tap detection on irregularly-shaped UI elements — think country outlines on a map, or product images with transparent backgrounds where you only want taps on the visible portion to register. In the old View system, this was painful. You'd represent the tap as a small rectangle, compute the intersection with the target shape's `Path`, and hope the approximation was close enough. It was inefficient and sometimes just wrong.

Then I stumbled across Romain Guy's post on arbitrary shape tap detection in Compose, and it introduced me to an API I didn't know existed: `PathHitTester`. It solves the problem with pixel-perfect accuracy and performs well enough for real-time drag events. That discovery sent me down a rabbit hole into Compose's graphics capabilities — custom drawing, graphics layers, the relationship between `DrawScope` and `Canvas`, and some genuinely impressive techniques like finger shadow simulation. Compose's graphics layer is more capable than I realized, and understanding it changed how I approach custom UI.

## PathHitTester: Pixel-Perfect Tap Detection

The fundamental problem with shape detection is that `Path` — both in the old Android graphics stack and in Compose — doesn't offer a built-in `contains(point)` method. A `Path` is a sequence of drawing commands (move to, line to, cubic to, close), not a filled region. Determining whether a 2D point is "inside" a path requires either rasterization or spatial algorithms, neither of which the `Path` class provides.

Compose's `PathHitTester` solves this properly. It takes a `Path`, performs internal preprocessing to build a spatial data structure, and then exposes a `contains()` method for fast point-in-path queries. The spatial structure means it only tests against the minimal number of path segments needed for complex paths, rather than checking every segment every time.

```kotlin
@Composable
fun InteractiveShapeCanvas(
    shapePath: Path,
    modifier: Modifier = Modifier,
) {
    var isHighlighted by remember { mutableStateOf(false) }
    val hitTester = remember { PathHitTester(shapePath) }

    Canvas(
        modifier = modifier
            .pointerInput(Unit) {
                detectTapGestures { tapOffset ->
                    isHighlighted = tapOffset in hitTester
                }
            }
    ) {
        drawPath(
            path = shapePath,
            color = if (isHighlighted) Color.Yellow else Color.Gray,
        )
    }
}
```

The `in` operator calls `contains()` on the hit tester. The critical detail that Romain Guy's post emphasizes: **the tap coordinates and the path must be in the same coordinate system.** If you've applied any translation, rotation, or scaling to render the path, you need to apply the inverse transform to the tap position before testing. This is the most common mistake I've seen — people create a hit tester with a path centered at the origin but test against screen-space tap coordinates, and wonder why nothing registers.

```kotlin
Canvas(
    modifier = modifier
        .pointerInput(Unit) {
            detectTapGestures { tapOffset ->
                // Undo the rendering translation
                val localTap = tapOffset - shapeRenderOffset
                isHighlighted = localTap in hitTester
            }
        }
) {
    translate(left = shapeRenderOffset.x, top = shapeRenderOffset.y) {
        drawPath(path = shapePath, color = shapeColor)
    }
}
```

`PathHitTester` is provided as a separate API from `Path` for two performance reasons. First, it avoids allocations — creating a spatial data structure once and reusing it is far cheaper than building one per query. Second, the spatial data structure enables sub-linear query time for complex paths. A country outline might have hundreds of path segments; testing a point against all of them every tap would be wasteful. The hit tester's internal structure narrows the search to only the relevant segments.

## Reuse and Update Patterns

Because `PathHitTester` builds internal state from the path, you need to handle path mutations explicitly. If you modify the path after creating the hit tester, queries will still run against the original path data. The `update()` method lets you swap the path without reallocating the hit tester:

```kotlin
@Composable
fun AnimatedShapeDetection(
    shapePath: Path,
    modifier: Modifier = Modifier,
) {
    val hitTester = remember { PathHitTester(shapePath) }
    var currentScale by remember { mutableFloatStateOf(1f) }
    val scaledPath = remember { Path() }

    LaunchedEffect(currentScale) {
        scaledPath.rewind()
        scaledPath.addPath(shapePath, Matrix().apply { scale(currentScale, currentScale) })
        hitTester.update(scaledPath)
    }

    // hitTester now tests against the scaled path
}
```

This pattern is important for drag events. Romain Guy specifically notes that `PathHitTester` can be used for high-frequency queries — during a drag gesture, you might query `contains()` dozens of times per second as the user's finger moves. The spatial data structure makes this efficient enough that you won't drop frames, as long as you're reusing the hit tester rather than recreating it per event. In my experience, even paths with 200+ segments handle drag-frequency queries without measurable frame impact on modern devices.

## Custom Drawing in Compose

Compose's drawing system is layered, and understanding those layers helps you pick the right tool. The `Canvas` composable gives you a `DrawScope` with high-level drawing methods — `drawRect`, `drawCircle`, `drawPath`, `drawImage`. These methods handle things like color, stroke, blend mode, and coordinate transformations. Under the hood, `DrawScope` delegates to the underlying `Canvas` object, which you can access via `drawIntoCanvas` for lower-level operations.

```kotlin
Canvas(modifier = Modifier.size(300.dp)) {
    // High-level DrawScope API
    drawCircle(
        color = Color.Blue,
        radius = 100f,
        center = center,
    )

    // Low-level Canvas access for things DrawScope doesn't expose
    drawIntoCanvas { canvas ->
        canvas.nativeCanvas.drawText(
            "Custom",
            center.x,
            center.y,
            android.graphics.Paint().apply {
                textSize = 48f
                color = android.graphics.Color.WHITE
                textAlign = android.graphics.Paint.Align.CENTER
            }
        )
    }
}
```

`Path` operations in Compose work similarly to the old Android `Path` API but with Compose-specific wrappers. You create a `Path()`, add shapes and curves, and draw it with `drawPath()`. The path operations — `moveTo`, `lineTo`, `cubicTo`, `quadraticTo`, `addRect`, `addOval`, `close` — are all there. Combined with `PathHitTester`, you can build interactive custom shapes with precise input handling.

## Graphics Modifiers: The Three Layers

Compose offers three drawing modifiers that intercept different phases of the rendering pipeline. Understanding which one to use is the difference between a clean implementation and fighting the framework.

**`Modifier.drawBehind`** draws content behind the composable. Whatever you draw executes before the composable's own content renders. This is useful for custom backgrounds, decorations, or shadow effects:

```kotlin
Box(
    modifier = Modifier
        .size(200.dp)
        .drawBehind {
            drawRoundRect(
                color = Color.LightGray,
                cornerRadius = CornerRadius(16.dp.toPx()),
            )
        }
) {
    Text("Content on top of custom background")
}
```

**`Modifier.drawWithContent`** gives you control over the drawing order. You decide when to call `drawContent()`, which renders the composable's own content. This lets you draw both behind and in front, or conditionally skip the content entirely:

```kotlin
Box(
    modifier = Modifier
        .size(200.dp)
        .drawWithContent {
            // Draw the custom underlay
            drawCircle(color = Color.Red.copy(alpha = 0.3f))
            // Draw the composable's own content
            drawContent()
            // Draw an overlay on top
            drawRect(
                color = Color.Black.copy(alpha = 0.1f),
                size = Size(size.width / 2, size.height / 2),
            )
        }
)
```

**`Modifier.drawWithCache`** is the performance-conscious option. It lets you create objects — `Paint`, `Path`, `ImageBitmap` — that persist across recompositions and only get recreated when the cache key changes. Without this, creating a complex `Path` on every draw call would be wasteful:

```kotlin
Box(
    modifier = Modifier
        .size(200.dp)
        .drawWithCache {
            val path = Path().apply {
                moveTo(0f, size.height)
                lineTo(size.width / 2, 0f)
                lineTo(size.width, size.height)
                close()
            }
            onDrawBehind {
                drawPath(path, color = Color.Magenta)
            }
        }
)
```

The `path` is created once and reused across frames. It's only recreated if `size` changes, because `drawWithCache` tracks the dependencies used during the cache block. This is the modifier you want for any custom drawing that involves expensive object creation.

## GraphicsLayer for Advanced Effects

`Modifier.graphicsLayer` is where Compose's rendering gets powerful. It modifies the composable's rendering properties — scale, rotation, translation, alpha, clip shape — without triggering recomposition or re-layout. These changes happen entirely in the draw phase, which makes them ideal for animations.

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
        }
) {
    // Card content
}
```

The key insight here is **phase awareness.** Compose has three phases: composition, layout, and draw. `graphicsLayer` only affects the draw phase. This means you can animate properties like `translationX`, `rotationZ`, and `alpha` at 60 fps without triggering recomposition or layout — the two most expensive phases. If you're doing the same thing with state that triggers recomposition (like changing a `Modifier.offset`), you're paying a much higher cost per frame.

The `CompositingStrategy` inside `graphicsLayer` controls how content is composited. `CompositingStrategy.Auto` is the default — it applies alpha and blend modes directly. `CompositingStrategy.Offscreen` creates a separate buffer, applies transformations to it, and then composites the result. This is necessary for certain effects like masking — if you want to cut a circular hole in an image, you need offscreen compositing so the blend mode applies to the buffered content rather than to what's behind it.

## Finger Shadows: Pushing the Graphics Boundary

Romain Guy demonstrated a technique that shows how far Compose's graphics capabilities extend: simulating the shadow cast by the user's finger onto the screen. Using Android 13's `RuntimeShader` API combined with Compose's `Canvas`, he renders soft shadows that react to a virtual light source positioned above the screen.

The implementation models the finger as an oriented capsule in 3D space. A GPU shader computes the visibility of the light source from every point on screen by tracing a cone toward the light and intersecting it with the capsule. The result is a physically-based soft shadow with hardened contact shadows — the shadow gets harder and more defined closer to where the finger touches the surface.

In Compose, the shader is applied as a `ShaderBrush` drawn on a `Canvas`:

```kotlin
@Composable
fun ShadowPointer(
    fingerPosition: Float3,
    lightPosition: Float3,
    modifier: Modifier = Modifier,
) {
    val shader = remember { RuntimeShader(CapsuleSoftShadowShader) }
    val brush = remember { ShaderBrush(shader) }

    // Update shader uniforms with finger position, light position, etc.
    shader.setFloatUniform("fingerPosition", fingerPosition.x, fingerPosition.y, fingerPosition.z)

    Canvas(modifier) {
        shader.setFloatUniform("size", size.width, size.height)
        drawRect(brush, Offset.Zero, size)
    }
}
```

This is admittedly exotic — most apps don't need finger shadow simulation. But it demonstrates an important point about Compose's graphics architecture: the `Canvas` composable, combined with `RuntimeShader`, gives you GPU-level drawing capabilities within the declarative Compose framework. The same approach works for any custom shader effect — heat maps, blur effects, procedural backgrounds, custom gradients that respond to touch.

## Compose vs View System for Custom Graphics

Having worked with both systems for custom drawing, here's my honest assessment. The View system's `onDraw(Canvas)` gives you a raw Android `Canvas` with the full `android.graphics` API. It's mature, well-documented, and every drawing technique you find online targets it. Compose's `DrawScope` wraps a similar canvas but with a Compose-specific API layer on top.

For simple custom drawing — shapes, paths, gradients — Compose is cleaner. The modifier-based approach (`drawBehind`, `drawWithContent`) integrates naturally with the composable tree, and `drawWithCache` handles object reuse elegantly. You don't need to manage your own dirty-region tracking or call `invalidate()`.

For complex interactive graphics — game-like UIs, drawing apps, complex gesture-driven animations — the View system's `SurfaceView` with a dedicated rendering thread still has advantages. Compose's `Canvas` runs on the main thread within the composition, which means your drawing code competes with layout and recomposition for frame budget. `SurfaceView` gives you a completely separate surface and thread.

But here's where Compose pulls ahead for most cases: `PathHitTester` has no View system equivalent. The ability to do pixel-perfect hit testing on arbitrary paths, with a spatial data structure for performance, is a Compose-only feature. If you need interactive custom shapes, Compose gives you better tools. The graphics modifiers, `graphicsLayer`, and the integration between touch input (`pointerInput`) and drawing create a coherent system that the View world never achieved — where input handling, drawing, and state management all live in the same composable scope.

Thanks for reading!
