---
title: Android Custom Views Guide
layout: post
categories: post
tags:
  - Android
  - Performance
---

Last year I needed a radial progress indicator that didn't exist in Material Design. The specs called for a segmented arc with rounded caps, gradient fills per segment, and a pulsing animation on the active segment. Think of it like a speedometer, but broken into chunks, and each chunk lights up independently. Cool design. Zero out-of-the-box support.

So I did what most Android developers do — I tried to hack it together with existing widgets. `ProgressBar` with custom drawables. `Canvas` tricks inside an `ImageView`. Stacking multiple views with clip paths. Every approach felt like trying to hang a painting using a spoon. Technically you could try, but why are you doing this to yourself?

The moment I gave in and wrote a proper custom `View`, the whole thing came together in about 200 lines. The lesson was clear: when the existing widget catalog doesn't fit, fighting it costs more time than just learning how `View` actually works under the hood.

Here's the thing though — most Android developers avoid custom views because the drawing system feels opaque. You override `onDraw`, you get a `Canvas`, and you're supposed to just... know what to do. But once you understand the three-phase pipeline that every view goes through — measure, layout, draw — custom views stop being scary and start being the cleanest solution for non-trivial UI.

## The Measure-Layout-Draw Pipeline

Think of a custom view like an artist setting up to paint. First, you figure out how big your canvas needs to be (measure). Then you decide where on the wall it goes (layout). Then you actually paint (draw). Every `View` in Android goes through these exact three phases before pixels appear on screen. Understanding this pipeline is the difference between a custom view that works correctly and one that collapses to zero size or draws in the wrong position.

**Measure** is where the view figures out how big it wants to be. The parent passes down `MeasureSpec` constraints — essentially saying "you have at most this much space" or "you must be exactly this size" — and the view responds by calling `setMeasuredDimension()`. The three spec modes are `EXACTLY` (parent dictates the size), `AT_MOST` (parent sets a ceiling), and `UNSPECIFIED` (parent doesn't care, measure yourself).

Now here's where it gets interesting. Most developers get tripped up because they forget that `onMeasure` can be called multiple times during a single layout pass. Wait, multiple times? Yes. If your parent is a `LinearLayout` with weights, it measures children twice — once to get their preferred sizes, once to distribute remaining space. Your `onMeasure` needs to handle that gracefully.

**Layout** is where the parent assigns the final position. After measuring all children, the parent calls `layout(left, top, right, bottom)` on each child, which triggers `onLayout`. For a simple custom view with no children, you rarely override this. For a custom `ViewGroup`, this is where you do the actual positioning math.

**Draw** is where you render pixels. The system calls `onDraw(Canvas)`, and you use `Canvas` and `Paint` to draw shapes, text, bitmaps, and paths. This phase happens most frequently — every time something invalidates, `onDraw` runs again. Measure and layout only re-run when the view hierarchy's size or position changes.

So to recap in plain English: "How big am I?" then "Where do I sit?" then "What do I look like?" That's it. Every view on your screen went through this exact conversation with the framework.

## Writing onMeasure Correctly

The most common mistake in custom views is ignoring `MeasureSpec` and hardcoding dimensions. It's like telling someone "I'm 6 feet tall" when they asked "how tall are you *in this room with a 5-foot ceiling*?" You need to negotiate with your parent, not just declare a number.

Here's a custom circular progress view that handles measurement properly:

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

> **🔥 Real talk:** I once debugged a production app where a custom chart view worked perfectly in a `ConstraintLayout` but collapsed to zero height inside a `ScrollView`. The developer only handled `EXACTLY` and `AT_MOST` in `onMeasure`. `ScrollView` passes `UNSPECIFIED`, so the view had no idea what size to be and just... gave up. Always handle all three modes.

One layer deeper: `resolveSize` is actually just calling `resolveSizeAndState`, which also encodes measured state flags. These flags tell the parent whether the child was able to use the space it wanted. `LinearLayout` uses these flags internally to decide how to distribute remaining space during the second measure pass. It's a detail most developers never need, but it explains why simple custom views work correctly inside complex layout containers without any special handling.

## Canvas and Paint — The Drawing Primitives

If `Canvas` is your blank sheet of paper, then `Paint` is your brush — it defines color, thickness, style, everything about *how* things look. You draw shapes on the canvas, and the paint determines their appearance.

The critical performance rule: **never allocate `Paint` objects inside `onDraw`**. Every allocation inside `onDraw` creates garbage that the GC has to collect, and `onDraw` can run 60 times per second during animations. That's like buying a new paintbrush for every single brushstroke and tossing the old one on the floor. Allocate your paints in the constructor or `init` block, and reuse them.

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

Think of it this way: your room doesn't change shape every time you rearrange the furniture. So why recalculate the room's dimensions every time you move a chair?

## Custom Attributes

Imagine you built a beautiful custom view, and now a teammate wants to use it. They open the XML layout file, drop in your view, and... they have no way to configure it. They can't change the color, the segment count, nothing. They have to go into the Kotlin code and hardcode values. That's not a reusable component — that's a one-off hack.

Custom attributes fix this. You define them in `res/values/attrs.xml` and read them in the constructor. Now your view is configurable right from XML, just like any built-in widget.

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

See that `.use { }` extension on `TypedArray`? That's doing something important — it calls `recycle()` automatically when the block finishes. Forgetting to recycle a `TypedArray` leaks memory from the resource pool. Before Kotlin's `.use` extension, this was one of the most common custom view bugs. I've seen it in production codebases where `TypedArray.recycle()` was simply never called, leading to slow resource pool exhaustion over time. The kind of bug that doesn't crash your app — it just makes it a little worse every time the view inflates, until one day someone notices the app is eating 300 MB of RAM.

## Invalidation and State Updates

When your view's data changes, you need to tell the framework to redraw. But here's the question most developers get wrong: *how* do you tell it?

You have two options. `invalidate()` triggers a redraw (runs `onDraw` again). `requestLayout()` triggers a full measure-layout-draw cycle. Using the wrong one is a surprisingly common performance mistake.

The analogy I like: imagine you painted a room blue and now want it green. You just need to repaint — that's `invalidate()`. But if you want to knock down a wall and make the room bigger? Now the whole house needs to be re-measured and re-planned — that's `requestLayout()`.

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

> **⚡ Quick check:** Your custom view's background color changed. Do you call `invalidate()` or `requestLayout()`? If you said `invalidate()` — you've got it. The view's size didn't change, only its appearance.

## Saving and Restoring State

Imagine your circular progress view is sitting at 75%. The user rotates their phone. The Activity gets destroyed, recreated, and... your progress view resets to 0%. The user stares at the screen. "I swear it was almost done."

Custom views need to save and restore their state across configuration changes, just like Activities do. The framework handles this through `onSaveInstanceState()` and `onRestoreInstanceState()`.

```kotlin
class SegmentedProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    // ... other code

    override fun onSaveInstanceState(): Parcelable {
        val superState = super.onSaveInstanceState()
        return bundleOf(
            "super" to superState,
            "progress" to progress,
            "activeSegment" to activeSegment,
            "segmentCount" to segmentCount
        )
    }

    override fun onRestoreInstanceState(state: Parcelable?) {
        val bundle = state as? Bundle
        if (bundle != null) {
            super.onRestoreInstanceState(bundle.getParcelable("super"))
            progress = bundle.getFloat("progress", 0f)
            activeSegment = bundle.getInt("activeSegment", 0)
            segmentCount = bundle.getInt("segmentCount", 4)
        } else {
            super.onRestoreInstanceState(state)
        }
    }
}
```

Important: for `onSaveInstanceState` to be called, the view must have an `android:id` set in XML. Views without IDs are not saved by the framework. This is a classic "it works until rotation" bug — everything looks perfect during development because you never rotate, and then QA finds it in five minutes.

## Accessibility

Here's something I'll be honest about: making custom views accessible is the step most developers skip. "I'll add it later." Later never comes. But real users depend on TalkBack and other accessibility services, and your custom view is completely invisible to them unless you tell the framework what it represents.

At minimum, custom views should provide content descriptions and announce state changes.

```kotlin
override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.className = "ProgressBar"
    info.contentDescription = "Progress: ${(progress * 100).toInt()}%, " +
        "segment ${activeSegment + 1} of $segmentCount"
    info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD)
}

// Call when progress changes
private fun announceProgress() {
    announceForAccessibility(
        "Progress updated to ${(progress * 100).toInt()} percent"
    )
}
```

For interactive custom views, implement the accessibility actions that map to your touch interactions. If swiping advances to the next segment, implement `ACTION_SCROLL_FORWARD`. If tapping toggles a state, implement `ACTION_CLICK`. TalkBack users interact through these actions, not through touch gestures. Think of accessibility actions as the "keyboard shortcut" equivalent for screen reader users — they need an alternative path to do everything a sighted user can do with touch.

## Touch Events — Making Views Interactive

So your view looks great. But it just sits there. You want the user to swipe across it and control the progress. Now you need touch handling.

For custom views that respond to touch, you override `onTouchEvent()` or use `GestureDetector` for higher-level gesture recognition. I strongly recommend starting with `GestureDetector` — it saves you from a world of pain.

```kotlin
class SwipeableProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var progress = 0f
    var onProgressChanged: ((Float) -> Unit)? = null

    private val gestureDetector = GestureDetectorCompat(context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean = true

            override fun onScroll(
                e1: MotionEvent?,
                e2: MotionEvent,
                distanceX: Float,
                distanceY: Float
            ): Boolean {
                val newProgress = (e2.x / width).coerceIn(0f, 1f)
                progress = newProgress
                onProgressChanged?.invoke(newProgress)
                invalidate()
                return true
            }
        }
    )

    override fun onTouchEvent(event: MotionEvent): Boolean {
        return gestureDetector.onTouchEvent(event) || super.onTouchEvent(event)
    }
}
```

`GestureDetector` handles the complexity of distinguishing taps from scrolls from flings. Writing this logic manually with raw `MotionEvent` processing (tracking `ACTION_DOWN`, `ACTION_MOVE`, `ACTION_UP`, computing velocities) is like building your own regex engine when `Regex` already exists. I always reach for `GestureDetector` first and only drop down to raw `onTouchEvent` when I need gesture combinations it doesn't support.

> **🧠 Think about it:** What happens to your interactive custom view's measurement when it's placed inside a `ScrollView`? The parent passes `MeasureSpec.UNSPECIFIED` — meaning "measure yourself however you want." If your `onMeasure` only handles `EXACTLY` and `AT_MOST`, the view might measure to zero height. Always handle all three modes. This catches people off guard because the same view works fine in a `ConstraintLayout` but vanishes inside a `ScrollView`.

## Hardware Acceleration Gotchas

Since Android 3.0, views are hardware-accelerated by default. This means `Canvas` operations are recorded into a display list and rendered by the GPU. Most drawing operations work fine, but a few don't. `Canvas.drawPicture()`, certain `PathEffect` types, and `Paint.setShadowLayer()` (on non-text draws) fall back to software rendering for that specific draw call. If your custom view uses any of these, you'll see either visual glitches or a performance cliff.

The practical way to handle this is to check `canvas.isHardwareAccelerated` and provide fallback paths, or force software rendering on the specific view with `setLayerType(LAYER_TYPE_SOFTWARE, null)`. But I'd argue the better approach is to avoid software-only operations entirely. `setShadowLayer` can be replaced with `elevation` and `OutlineProvider` for most shadow needs. Complex path effects can often be approximated with simpler draw calls that stay on the GPU path.

It's like having a car with a turbo engine but putting regular fuel in it — technically it runs, but you're not getting what you paid for. Stay on the hardware-accelerated path whenever possible.

## The Reframe: Views Are Just Three Functions

Here's what I didn't understand early on, and once I got it, everything clicked: **a custom view is fundamentally just three functions — how big am I, where are my children, and what do I draw.**

That's it.

`onMeasure` answers a question. `onLayout` positions children. `onDraw` paints pixels. Everything else — attributes, invalidation, save/restore state, accessibility — is important infrastructure, but the core is those three functions. Once I started thinking of custom views this way, they stopped being intimidating. If you can write those three functions, you can build any UI that the widget catalog doesn't offer.

> **💡 The "aha" moment:** A custom view isn't some advanced black-magic Android API. It's three functions: "how big?", "where?", and "what do I look like?" Once you see it that way, you realize you've been overcomplicating it in your head this whole time.

The honest tradeoff is maintenance cost. A custom view is code you own forever — you handle configuration changes, RTL layouts, accessibility labels, and animation state yourself. For simple customizations, a `Drawable`, a `Shape`, or even a Compose `Canvas` composable might be lighter-weight solutions that get you 80% of the way there. But for genuinely custom interactive UI — charts, editors, specialized progress indicators, custom gesture handlers — there's no substitute for understanding the measure-layout-draw pipeline and writing the view yourself.

I still reach for the View system when Compose's `Canvas` composable feels limiting (particularly for complex touch handling and incremental invalidation of sub-regions). But whether you're writing a traditional `View` or a Compose `DrawScope`, the mental model is the same: measure, position, draw. Learn it once, and it applies everywhere.

Thank You!
