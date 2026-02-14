---
title: Android Custom Views Guide
layout: post
categories: post
tags:
  - Android
  - Performance
---

Last year I needed a radial progress indicator that didn't exist in Material Design. The specs called for a segmented arc with rounded caps, gradient fills per segment, and a pulsing animation on the active segment. I tried layering existing views — `ProgressBar` with custom drawables, `Canvas` tricks inside an `ImageView`, stacking multiple views with clip paths. Every approach felt like I was fighting the framework instead of working with it. The moment I gave in and wrote a proper custom `View`, the whole thing came together in about 200 lines. The lesson was clear: when the existing widget catalog doesn't fit, fighting it costs more time than just learning how `View` actually works under the hood.

The thing is, most Android developers avoid custom views because the drawing system feels opaque. You override `onDraw`, you get a `Canvas`, and you're supposed to just know what to do. But once you understand the three-phase pipeline that every view goes through — measure, layout, draw — custom views stop being scary and start being the cleanest solution for non-trivial UI.

## The Measure-Layout-Draw Pipeline

Every `View` in Android goes through three phases before pixels appear on screen. Understanding this pipeline is the difference between a custom view that works correctly and one that collapses to zero size or draws in the wrong position.

**Measure** is where the view figures out how big it wants to be. The parent passes down `MeasureSpec` constraints — essentially saying "you have at most this much space" or "you must be exactly this size" — and the view responds by calling `setMeasuredDimension()`. The three spec modes are `EXACTLY` (parent dictates the size), `AT_MOST` (parent sets a ceiling), and `UNSPECIFIED` (parent doesn't care, measure yourself). Most developers get tripped up here because they forget that `onMeasure` can be called multiple times during a single layout pass. If your parent is a `LinearLayout` with weights, it measures children twice — once to get their preferred sizes, once to distribute remaining space.

**Layout** is where the parent assigns the final position. After measuring all children, the parent calls `layout(left, top, right, bottom)` on each child, which triggers `onLayout`. For a simple custom view with no children, you rarely override this. For a custom `ViewGroup`, this is where you do the actual positioning math.

**Draw** is where you render pixels. The system calls `onDraw(Canvas)`, and you use `Canvas` and `Paint` to draw shapes, text, bitmaps, and paths. This phase happens most frequently — every time something invalidates, `onDraw` runs again. Measure and layout only re-run when the view hierarchy's size or position changes.

## Writing onMeasure Correctly

The most common mistake in custom views is ignoring `MeasureSpec` and hardcoding dimensions. Here's a custom circular progress view that handles measurement properly:

```kotlin
class SegmentedProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val defaultSize = (120 * resources.displayMetrics.density).toInt()

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = resolveSize(defaultSize, widthMeasureSpec)
        val height = resolveSize(defaultSize, heightMeasureSpec)
        val size = minOf(width, height) // keep it square
        setMeasuredDimension(size, size)
    }
}
```

`resolveSize()` is a helper that most developers don't know about. It does the `MeasureSpec` mode switching for you — if the spec says `EXACTLY`, it returns the spec size. If `AT_MOST`, it returns the smaller of your desired size and the spec size. If `UNSPECIFIED`, it returns your desired size. Writing this logic manually is error-prone, and I've seen bugs in production apps where custom views measured incorrectly inside `ScrollView` (which passes `UNSPECIFIED` specs) because the developer only handled `EXACTLY`.

One layer deeper: `resolveSize` is actually just calling `resolveSizeAndState`, which also encodes measured state flags. These flags tell the parent whether the child was able to use the space it wanted. `LinearLayout` uses these flags internally to decide how to distribute remaining space during the second measure pass. It's a detail most developers never need, but it explains why simple custom views work correctly inside complex layout containers without any special handling.

## Canvas and Paint — The Drawing Primitives

`Canvas` is your drawing surface and `Paint` defines how things look. The critical performance rule: **never allocate `Paint` objects inside `onDraw`**. Every allocation inside `onDraw` creates garbage that the GC has to collect, and `onDraw` can run 60 times per second during animations. Allocate your paints in the constructor or `init` block.

```kotlin
class SegmentedProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var segmentCount = 4
    private var activeSegment = 0
    private var progress = 0.75f
    private val gapAngle = 8f

    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 12f.dp
        strokeCap = Paint.Cap.ROUND
        color = Color.parseColor("#E0E0E0")
    }

    private val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 12f.dp
        strokeCap = Paint.Cap.ROUND
        color = Color.parseColor("#1976D2")
    }

    private val arcRect = RectF()

    override fun onSizeChanged(w: Int, h: Int, oldW: Int, oldH: Int) {
        val inset = backgroundPaint.strokeWidth / 2f
        arcRect.set(inset, inset, w - inset, h - inset)
    }

    override fun onDraw(canvas: Canvas) {
        val sweepPerSegment = (360f - gapAngle * segmentCount) / segmentCount
        for (i in 0 until segmentCount) {
            val startAngle = -90f + i * (sweepPerSegment + gapAngle)
            canvas.drawArc(arcRect, startAngle, sweepPerSegment, false, backgroundPaint)
            if (i == activeSegment) {
                canvas.drawArc(arcRect, startAngle, sweepPerSegment * progress, false, progressPaint)
            }
        }
    }

    private val Float.dp: Float
        get() = this * resources.displayMetrics.density
}
```

Notice that `arcRect` is computed in `onSizeChanged`, not in `onDraw`. `onSizeChanged` only fires when the view's dimensions change, which is far less frequent than `onDraw`. This is a pattern I use for all geometry calculations — anything that depends on size but not on state goes in `onSizeChanged`. Anything that depends on state goes in `onDraw`. This separation keeps `onDraw` as lean as possible.

## Custom Attributes

Custom attributes let you configure your view from XML, which is essential if other developers on your team are going to use it. You define them in `res/values/attrs.xml` and read them in the constructor.

```kotlin
// In res/values/attrs.xml:
// <declare-styleable name="SegmentedProgressView">
//     <attr name="segmentCount" format="integer" />
//     <attr name="activeSegment" format="integer" />
//     <attr name="progressColor" format="color" />
//     <attr name="trackColor" format="color" />
//     <attr name="strokeWidth" format="dimension" />
// </declare-styleable>

class SegmentedProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    init {
        context.obtainStyledAttributes(attrs, R.styleable.SegmentedProgressView).use { ta ->
            segmentCount = ta.getInteger(R.styleable.SegmentedProgressView_segmentCount, 4)
            activeSegment = ta.getInteger(R.styleable.SegmentedProgressView_activeSegment, 0)
            progressPaint.color = ta.getColor(
                R.styleable.SegmentedProgressView_progressColor,
                Color.parseColor("#1976D2")
            )
            backgroundPaint.color = ta.getColor(
                R.styleable.SegmentedProgressView_trackColor,
                Color.parseColor("#E0E0E0")
            )
            val width = ta.getDimension(
                R.styleable.SegmentedProgressView_strokeWidth,
                12f * resources.displayMetrics.density
            )
            backgroundPaint.strokeWidth = width
            progressPaint.strokeWidth = width
        }
    }
}
```

The `.use { }` extension on `TypedArray` is important — it calls `recycle()` automatically. Forgetting to recycle a `TypedArray` leaks memory from the resource pool. Before Kotlin's `.use` extension, this was one of the most common custom view bugs. I've seen it in production codebases where `TypedArray.recycle()` was simply never called, leading to slow resource pool exhaustion over time.

## Invalidation and State Updates

When your view's data changes, you need to tell the framework to redraw. `invalidate()` triggers a redraw (runs `onDraw` again). `requestLayout()` triggers a full measure-layout-draw cycle. Using the wrong one is a common performance mistake.

If only the visual appearance changed (color, progress value, alpha), call `invalidate()`. If the size might have changed (text content changed, number of segments changed), call `requestLayout()` — which implicitly also invalidates. Calling `requestLayout()` when you only needed `invalidate()` forces the framework to re-measure the entire view subtree, which is significantly more expensive. I measured this once in a dashboard with 12 custom progress views updating simultaneously — switching from `requestLayout()` to `invalidate()` for progress updates dropped the frame time from ~14ms to ~5ms.

```kotlin
var progress: Float = 0f
    set(value) {
        field = value.coerceIn(0f, 1f)
        invalidate() // only visual change — no remeasure needed
    }

var segmentCount: Int = 4
    set(value) {
        field = value
        requestLayout() // size calculation depends on segment count
    }
```

## Hardware Acceleration Gotchas

Since Android 3.0, views are hardware-accelerated by default. This means `Canvas` operations are recorded into a display list and rendered by the GPU. Most drawing operations work fine, but a few don't. `Canvas.drawPicture()`, certain `PathEffect` types, and `Paint.setShadowLayer()` (on non-text draws) fall back to software rendering for that specific draw call. If your custom view uses any of these, you'll see either visual glitches or a performance cliff.

The practical way to handle this is to check `canvas.isHardwareAccelerated` and provide fallback paths, or force software rendering on the specific view with `setLayerType(LAYER_TYPE_SOFTWARE, null)`. But I'd argue the better approach is to avoid software-only operations entirely. `setShadowLayer` can be replaced with `elevation` and `OutlineProvider` for most shadow needs. Complex path effects can often be approximated with simpler draw calls that stay on the GPU path.

## The Reframe: Views Are Just Three Functions

Here's what I didn't understand early on: **a custom view is fundamentally just three functions — how big am I, where are my children, and what do I draw.** Everything else — attributes, invalidation, save/restore state, accessibility — is important infrastructure, but the core is those three functions. Once I started thinking of custom views this way, they stopped being intimidating. `onMeasure` answers a question. `onLayout` positions children. `onDraw` paints pixels. If you can write those three functions, you can build any UI that the widget catalog doesn't offer.

The honest tradeoff is maintenance cost. A custom view is code you own forever — you handle configuration changes, RTL layouts, accessibility labels, and animation state yourself. For simple customizations, a `Drawable`, a `Shape`, or even a Compose `Canvas` composable might be lighter-weight solutions that get you 80% of the way there. But for genuinely custom interactive UI — charts, editors, specialized progress indicators, custom gesture handlers — there's no substitute for understanding the measure-layout-draw pipeline and writing the view yourself.

I still reach for the View system when Compose's `Canvas` composable feels limiting (particularly for complex touch handling and incremental invalidation of sub-regions). But whether you're writing a traditional `View` or a Compose `DrawScope`, the mental model is the same: measure, position, draw. Learn it once, and it applies everywhere.

Thank You!
