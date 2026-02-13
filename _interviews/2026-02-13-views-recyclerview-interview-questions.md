---
title: "Views, RecyclerView & UI Fundamentals — Top Interview Questions"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 4
---

## Views, RecyclerView & UI Fundamentals — What Interviewers Really Ask

Almost every Android interview has at least one or two questions on how views render, how RecyclerView recycles, or why the UI stutters. This is the bread and butter of Android development — and interviewers use it to gauge whether you actually understand the framework or just copy-paste layouts from StackOverflow.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the three phases of the View rendering pipeline?

Every View in Android goes through three phases: **measure**, **layout**, and **draw**. In the measure phase, the system walks down the view tree and asks each view how big it wants to be — this is `onMeasure()`. In the layout phase, the parent tells each child where it should be positioned — this is `onLayout()`. Finally, in the draw phase, each view renders itself onto a Canvas — this is `onDraw()`. The system traverses the entire view tree for each phase, and this full pass needs to complete within 16ms to maintain 60 FPS. Interviewers ask this to check if you understand why deeply nested layouts are expensive — every extra level multiplies the work in each phase.

#### Q2: What does `onMeasure()` do, and what are the three MeasureSpec modes?

`onMeasure()` is where a view calculates how big it wants to be. The parent passes down width and height constraints as `MeasureSpec` values — these are packed integers containing both a mode and a size.

The three modes are:
- **EXACTLY** — the parent has decided the exact size. This happens when you set `layout_width="200dp"` or `match_parent`
- **AT_MOST** — the view can be as large as it wants, up to the specified limit. This happens with `wrap_content`
- **UNSPECIFIED** — no constraint at all. The view can be whatever size it wants. This is rare and typically happens inside a ScrollView

You must call `setMeasuredDimension()` at the end of `onMeasure()`. If you forget, the framework throws an `IllegalStateException`. This is a gotcha that catches people off guard when writing custom views.

#### Q3: What is the difference between `invalidate()` and `requestLayout()`?

This is one of the most frequently asked View questions. `invalidate()` triggers only the draw phase — it calls `onDraw()` again. Use it when the visual appearance changes but the size and position stay the same, like changing a color, updating text content, or toggling visibility of drawn elements. `requestLayout()` triggers the full pipeline — measure, layout, and draw. Use it when the view's size or position needs to change, like when text length changes or you modify padding programmatically.

The common mistake is calling `requestLayout()` for every small visual change. That forces the entire view tree to re-measure and re-layout, which is far more expensive than just redrawing. In a deep view hierarchy, a single unnecessary `requestLayout()` can easily blow past the 16ms frame budget.

#### Q4: What is the ViewHolder pattern, and why is it mandatory in RecyclerView?

The ViewHolder pattern caches references to child views inside each list item, so you avoid calling `findViewById()` every time a row needs to bind data. In the old `ListView`, this pattern was optional — you could skip it and call `findViewById()` in `getView()`, which was slow but functional. RecyclerView made ViewHolder mandatory by baking it into the API.

```kotlin
class ArticleViewHolder(view: View) : RecyclerView.ViewHolder(view) {
    val titleText: TextView = view.findViewById(R.id.articleTitle)
    val authorText: TextView = view.findViewById(R.id.articleAuthor)
    val bookmarkIcon: ImageView = view.findViewById(R.id.bookmarkIcon)
}
```

The `ViewHolder` is created once in `onCreateViewHolder()` and reused many times through `onBindViewHolder()`. In a list of 1000 items, RecyclerView might create only 10-15 ViewHolders and recycle them as the user scrolls. This is the core performance advantage over creating new views for every item.

#### Q5: Walk through the three key methods of `RecyclerView.Adapter`.

- **`onCreateViewHolder(parent, viewType)`** — inflates the item layout and wraps it in a ViewHolder. Called only when RecyclerView needs a new ViewHolder (not when it can recycle an existing one)
- **`onBindViewHolder(holder, position)`** — binds data from your dataset to the ViewHolder's views. Called every time RecyclerView reuses a ViewHolder for a different position
- **`getItemCount()`** — returns the total number of items in your dataset

```kotlin
class ArticleAdapter(
    private val articles: List<Article>,
    private val onBookmark: (Article) -> Unit
) : RecyclerView.Adapter<ArticleViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ArticleViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_article, parent, false)
        return ArticleViewHolder(view)
    }

    override fun onBindViewHolder(holder: ArticleViewHolder, position: Int) {
        val article = articles[position]
        holder.titleText.text = article.title
        holder.authorText.text = article.author
        holder.bookmarkIcon.setOnClickListener { onBookmark(article) }
    }

    override fun getItemCount(): Int = articles.size
}
```

A common mistake in `onBindViewHolder()` is forgetting to reset state. Since ViewHolders are recycled, if you set an icon to visible for item 3, that same ViewHolder might show up for item 15 with the icon still visible. Always reset every view property in `onBindViewHolder()`.

#### Q6: What are the three built-in LayoutManagers, and when would you use each?

- **LinearLayoutManager** — arranges items in a single vertical or horizontal list. This is the default and most common. Use it for chat lists, settings screens, feeds
- **GridLayoutManager** — arranges items in a uniform grid with a configurable span count. Use it for photo grids, product catalogs, or emoji pickers. You can also set per-item span sizes using `SpanSizeLookup` for headers that stretch the full width
- **StaggeredGridLayoutManager** — arranges items in a grid where rows or columns can have different heights. Use it for Pinterest-style layouts where images have varying aspect ratios

The key insight here is that RecyclerView completely delegates item positioning to the LayoutManager. The RecyclerView itself has no concept of "list" or "grid" — all of that logic lives in the LayoutManager. This is the Strategy pattern applied to layout.

#### Q7: What is `DiffUtil` and why should you use it instead of `notifyDataSetChanged()`?

`DiffUtil` calculates the minimal set of changes between two lists — which items were added, removed, moved, or changed — and dispatches only those specific update operations to the adapter. `notifyDataSetChanged()`, on the other hand, tells RecyclerView to throw away everything and rebind all visible items from scratch. That kills all animations and is far more expensive.

Under the hood, `DiffUtil` uses Eugene Myers' diff algorithm (the same one behind `git diff`). You provide a `DiffUtil.Callback` with four methods: `getOldListSize()`, `getNewListSize()`, `areItemsTheSame()` (checks identity, usually by ID), and `areContentsTheSame()` (checks if the content has changed). The result is a `DiffResult` that you dispatch to the adapter.

For large lists, you should run `DiffUtil.calculateDiff()` on a background thread because it's O(N) space and can take a few milliseconds for lists with thousands of items.

#### Q8: What is the difference between `DiffUtil`, `AsyncListDiffer`, and `ListAdapter`?

These three are layers of abstraction built on top of each other:

- **DiffUtil** is the core algorithm. You call `calculateDiff()` yourself, manage threading yourself, and dispatch results yourself
- **AsyncListDiffer** wraps DiffUtil and handles the background thread for you. You call `submitList()` and it does the diff calculation off the main thread automatically
- **ListAdapter** wraps AsyncListDiffer and builds it directly into the adapter class. You extend `ListAdapter<T, VH>` instead of `RecyclerView.Adapter<VH>`, and just call `submitList()` whenever your data changes

```kotlin
class ArticleAdapter : ListAdapter<Article, ArticleViewHolder>(ArticleDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ArticleViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_article, parent, false)
        return ArticleViewHolder(view)
    }

    override fun onBindViewHolder(holder: ArticleViewHolder, position: Int) {
        val article = getItem(position)
        holder.titleText.text = article.title
    }
}

class ArticleDiffCallback : DiffUtil.ItemCallback<Article>() {
    override fun areItemsTheSame(oldItem: Article, newItem: Article) =
        oldItem.id == newItem.id

    override fun areContentsTheSame(oldItem: Article, newItem: Article) =
        oldItem == newItem
}
```

In practice, `ListAdapter` is what you should use in most cases. There's no good reason to manage DiffUtil manually anymore unless you have very specific requirements around how updates are dispatched.

#### Q9: What is `ItemDecoration` and how does it work?

`ItemDecoration` lets you add visual decorations around or between items — dividers, spacing, badges, section headers drawn directly on the Canvas. You override `getItemOffsets()` to add spacing and `onDraw()` or `onDrawOver()` to draw custom graphics.

The important distinction: `onDraw()` draws **behind** the items (below in the Z-order), while `onDrawOver()` draws **on top** of them. This matters when you want overlapping decorations like a sticky header that draws over the item below it.

The common mistake is adding spacing by setting margins on item views. That works visually, but it's less flexible and harder to control than `ItemDecoration`. Spacing should always go through `getItemOffsets()`.

#### Q10: What is `ViewStub` and when would you use it?

`ViewStub` is a zero-sized, invisible view that lazily inflates a layout only when you make it visible or call `inflate()`. Until that point, it takes no space and costs almost nothing. Once inflated, the `ViewStub` replaces itself with the actual view in the view hierarchy — it's gone.

Use it for views that are rarely shown — error states, empty states, onboarding tooltips, or permission rationale layouts. If a view is only needed in 10% of cases, there's no reason to inflate it every time the screen loads.

```kotlin
// In layout XML: <ViewStub android:id="@+id/errorStub" android:layout="@layout/error_view" />

val errorStub = findViewById<ViewStub>(R.id.errorStub)
// When error occurs:
errorStub.visibility = View.VISIBLE  // inflates the layout
// OR
val inflatedView = errorStub.inflate()  // inflates and returns the view
```

One gotcha: you can only inflate a `ViewStub` once. After inflation, it's removed from the hierarchy. If you try to call `inflate()` again, you get an `IllegalStateException`.

### Deep Dive Questions (Advanced → Expert)

#### Q11: Explain how RecyclerView's view recycling mechanism works internally.

When a ViewHolder scrolls off-screen, RecyclerView doesn't destroy it. Instead, it goes through a multi-level caching system called the **Recycler**. The caching has four levels:

1. **Scrap** — ViewHolders that are still attached to the RecyclerView but marked for removal or reuse during a layout pass. These don't need rebinding
2. **Cache (mCachedViews)** — recently detached ViewHolders, stored by position. Default capacity is 2. If a user scrolls down then scrolls back up, these ViewHolders are reattached without calling `onBindViewHolder()` — they still hold the correct data
3. **ViewCacheExtension** — an optional custom cache layer. Almost never used in practice
4. **RecycledViewPool** — the final level. ViewHolders here are stripped of their data and sorted by `viewType`. When RecyclerView needs a new ViewHolder and the pool has one of the matching type, it pulls from here and calls `onBindViewHolder()` to rebind

The key insight is that `onCreateViewHolder()` is the expensive call (layout inflation), and `onBindViewHolder()` is the cheap call (setting text, images). The recycling system minimizes inflation calls. In a well-tuned RecyclerView, you might inflate 12 ViewHolders total and recycle them through a list of 10,000 items.

#### Q12: How do you handle multiple view types in RecyclerView?

Override `getItemViewType(position)` to return different integer constants based on the item at that position. RecyclerView uses this value to match ViewHolders — it will only recycle a ViewHolder into a position with the same view type.

```kotlin
class FeedAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        const val TYPE_HEADER = 0
        const val TYPE_ARTICLE = 1
        const val TYPE_AD = 2
    }

    override fun getItemViewType(position: Int): Int = when (items[position]) {
        is FeedItem.Header -> TYPE_HEADER
        is FeedItem.Article -> TYPE_ARTICLE
        is FeedItem.Ad -> TYPE_AD
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = when (viewType) {
        TYPE_HEADER -> HeaderViewHolder(inflate(R.layout.item_header, parent))
        TYPE_ARTICLE -> ArticleViewHolder(inflate(R.layout.item_article, parent))
        TYPE_AD -> AdViewHolder(inflate(R.layout.item_ad, parent))
        else -> throw IllegalArgumentException("Unknown view type: $viewType")
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (holder) {
            is HeaderViewHolder -> holder.bind(items[position] as FeedItem.Header)
            is ArticleViewHolder -> holder.bind(items[position] as FeedItem.Article)
            is AdViewHolder -> holder.bind(items[position] as FeedItem.Ad)
        }
    }
}
```

A common mistake is using the position as the view type. The view type should represent a category of layout, not individual items. If you return unique types per position, RecyclerView can never recycle anything — you've defeated the entire purpose.

#### Q13: What is `RecycledViewPool` and how can you share it between nested RecyclerViews?

`RecycledViewPool` is the last level of RecyclerView's caching system. It stores detached ViewHolders grouped by view type. By default, each RecyclerView has its own pool with a limit of 5 ViewHolders per view type.

When you have nested RecyclerViews — like a vertical list of horizontal carousels — each inner RecyclerView creates and maintains its own pool. This means if you have 10 horizontal carousels, each with the same item layout, they'll each inflate their own ViewHolders independently. That's wasteful.

The fix is sharing a single `RecycledViewPool` across all the inner RecyclerViews:

```kotlin
class CarouselAdapter(
    private val sections: List<Section>,
    private val sharedPool: RecyclerView.RecycledViewPool
) : RecyclerView.Adapter<CarouselViewHolder>() {

    override fun onBindViewHolder(holder: CarouselViewHolder, position: Int) {
        holder.innerRecyclerView.setRecycledViewPool(sharedPool)
        holder.innerRecyclerView.adapter = SectionItemAdapter(sections[position].items)
    }
}
```

This is a real production optimization. In a feed with many horizontal carousels (like Netflix or Spotify), sharing the pool can reduce total ViewHolder inflation by 60-70% and noticeably improve scroll smoothness.

#### Q14: Explain the touch event dispatch mechanism — `dispatchTouchEvent`, `onInterceptTouchEvent`, and `onTouchEvent`.

Touch events flow top-down through the view tree in a specific order:

1. **`dispatchTouchEvent()`** is called first on the Activity, then on each ViewGroup down the tree. Its job is to route the event
2. **`onInterceptTouchEvent()`** is called on ViewGroups only (not plain Views). If it returns `true`, the parent "steals" the event and the child receives `ACTION_CANCEL`. All subsequent events in this gesture go directly to the parent's `onTouchEvent()`
3. **`onTouchEvent()`** is called on the target view. If it returns `true`, the view consumes the event. If it returns `false`, the event bubbles back up to the parent

The full chain for a touch starting at `Activity → ViewGroup → ChildView`:
- `Activity.dispatchTouchEvent()` → `ViewGroup.dispatchTouchEvent()` → `ViewGroup.onInterceptTouchEvent()` (returns false) → `ChildView.dispatchTouchEvent()` → `ChildView.onTouchEvent()`

The critical rule: a view that returns `false` for `ACTION_DOWN` will never receive subsequent events (`ACTION_MOVE`, `ACTION_UP`) for that gesture. The system assumes the view isn't interested. This catches many developers off guard — if your custom view only handles `ACTION_UP` but returns `false` for `ACTION_DOWN`, it will never see the UP event.

#### Q15: How do you resolve touch conflicts between a parent ScrollView and a child RecyclerView (or other scrollable view)?

This is one of the most practical touch-handling questions. When you nest scrollable views, the parent might intercept scroll gestures that were meant for the child.

The child can call `parent.requestDisallowInterceptTouchEvent(true)` to tell the parent to stop intercepting for the current gesture. The parent's `onInterceptTouchEvent()` won't be called until the next `ACTION_DOWN`.

For RecyclerView specifically, `NestedScrollingChild` and `NestedScrollingParent` interfaces (which RecyclerView implements) handle this more elegantly. The child and parent negotiate scrolling — the child offers its scroll delta to the parent first, the parent consumes what it wants, and the child takes the rest. This is how `CoordinatorLayout` with `AppBarLayout` works — the RecyclerView scrolls, but the toolbar collapses first.

The touch slop value from `ViewConfiguration.get(context).scaledTouchSlop` is also important here. This is the minimum distance a finger must move before the system considers it a scroll gesture rather than a tap. It prevents accidental scrolls when the user is trying to tap.

#### Q16: What is hardware acceleration and what are its limitations?

Hardware acceleration means rendering is performed by the GPU instead of the CPU. It's been enabled by default since Android 3.0 (API 11). When hardware-accelerated, views are rendered into a GPU-backed Canvas using OpenGL (and later Vulkan on newer devices). This makes most drawing operations significantly faster — especially alpha blending, gradients, and transformations.

But not all Canvas operations are supported on the hardware-accelerated path. Some that are unsupported or partially supported include `drawBitmapMesh()` with colors, certain `PathEffect` types, and `drawPicture()`. If your custom view uses an unsupported operation, you can disable hardware acceleration at the view level:

```kotlin
myCustomView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
```

The tradeoff is that software rendering is slower but supports all Canvas operations. In practice, you almost never need to disable hardware acceleration — the unsupported operations are edge cases. But if your custom view renders incorrectly on certain devices and looks fine on others, hardware acceleration compatibility is the first thing to check.

#### Q17: What is overdraw, and how do you detect and reduce it?

Overdraw happens when the GPU draws the same pixel multiple times in a single frame. Drawing a white background, then a card on top, then text on the card — that's 3x overdraw for those pixels. Excessive overdraw wastes GPU cycles and can push you past the 16ms frame budget.

To detect it, enable "Debug GPU Overdraw" in Developer Options. The screen gets color-coded: blue means 1x overdraw, green is 2x, pink is 3x, and red is 4x+. You want most of your screen to be true color (no overdraw) or blue.

To reduce overdraw:
- Remove unnecessary backgrounds. If your Activity has a window background and your root layout also sets a background, that's already 2x overdraw on every pixel. Call `window.setBackgroundDrawable(null)` or set `android:windowBackground` to `@null` if your content covers the full screen
- Use `clipRect()` in custom views to tell the Canvas not to draw outside visible areas
- Flatten your view hierarchy — fewer nested ViewGroups means fewer stacked backgrounds

#### Q18: How do you flatten a view hierarchy and why does it matter?

A deep view hierarchy is expensive because the measure and layout phases walk the tree recursively. If you nest `LinearLayout` inside `RelativeLayout` inside another `LinearLayout`, each level adds another pass. Some layouts like `RelativeLayout` actually measure their children twice, so nesting them doubles the cost exponentially.

`ConstraintLayout` solves this by expressing complex layouts with a single flat level. A layout that required 4 levels of nesting with `LinearLayout` can often be expressed as a single `ConstraintLayout` with constraints between views. It measures children in a single pass (in most cases) using a constraint solver.

The `<merge>` tag eliminates redundant root ViewGroups when using `<include>`. If your included layout has a `LinearLayout` root, and the parent where you include it is also a `LinearLayout`, the `<merge>` tag lets you skip the inner root. The `<include>` tag itself is just for layout reuse — it doesn't affect hierarchy depth on its own.

```xml
<!-- reusable_toolbar.xml -->
<merge xmlns:android="http://schemas.android.com/apk/res/android">
    <ImageView android:id="@+id/backButton" ... />
    <TextView android:id="@+id/titleText" ... />
</merge>

<!-- main_layout.xml -->
<LinearLayout ...>
    <include layout="@layout/reusable_toolbar" />
    <!-- Other views -->
</LinearLayout>
```

Without `<merge>`, the included layout would add an extra ViewGroup level. With `<merge>`, the children are directly added to the parent.

#### Q19: When would you create a custom View, and what's the difference between extending `View` vs `ViewGroup`?

You create a custom view when you need specialized drawing (a chart, a gauge, a custom progress indicator), when no existing widget matches your requirements, or when you need a reusable UI component across multiple screens.

Extend **View** when you need to draw something custom on a Canvas — shapes, paths, bitmaps, text with special effects. You'll override `onMeasure()`, `onDraw()`, and possibly `onTouchEvent()`. Extend **ViewGroup** when you need to arrange and manage child views in a custom layout pattern — a circular layout, a flow layout, a custom constraint system. You'll override `onMeasure()` and `onLayout()` to position children.

For custom attributes, define them in `res/values/attrs.xml`:

```xml
<declare-styleable name="GaugeView">
    <attr name="gaugeMaxValue" format="integer" />
    <attr name="gaugeColor" format="color" />
    <attr name="gaugeThickness" format="dimension" />
</declare-styleable>
```

Then read them in the constructor:

```kotlin
class GaugeView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var maxValue: Int
    private var gaugeColor: Int

    init {
        val typedArray = context.obtainStyledAttributes(attrs, R.styleable.GaugeView)
        maxValue = typedArray.getInt(R.styleable.GaugeView_gaugeMaxValue, 100)
        gaugeColor = typedArray.getColor(R.styleable.GaugeView_gaugeColor, Color.BLUE)
        typedArray.recycle() // Always recycle to avoid memory leaks
    }
}
```

The `typedArray.recycle()` call is a common gotcha. Forgetting it causes a memory leak because `TypedArray` objects are pooled and reused by the system.

#### Q20: What's the 16ms frame budget, and what happens when you exceed it?

Android's display system targets 60 frames per second, which gives each frame a budget of approximately 16.67ms. Within that window, the system needs to run input handling, animations, measure/layout/draw, and GPU rendering. If any frame takes longer than 16ms, that frame gets dropped — the user sees the same frame twice, which registers as a stutter or "jank."

The work that must complete within 16ms includes:
- Processing input events (touch, keyboard)
- Running animations and Choreographer callbacks
- Traversing the view tree (measure → layout → draw)
- GPU rendering of the draw commands

Common causes of dropped frames: heavy computation on the main thread (JSON parsing, sorting large lists), complex view hierarchies requiring multiple measure passes, excessive garbage collection causing stop-the-world pauses, and overdraw forcing the GPU to redraw pixels multiple times.

You can detect frame drops using the GPU Profiling bar in Developer Options. Each bar represents a frame — green bars are within budget, and bars that exceed the green line indicate jank. For deeper analysis, Systrace and the CPU Profiler in Android Studio show exactly which methods are consuming time in each frame.

#### Q21: How do you optimize bitmap loading for a list of images?

Loading full-resolution bitmaps into a RecyclerView is one of the fastest ways to run out of memory. A 4000x3000 photo at ARGB_8888 consumes 48MB of RAM. If you load a few of those simultaneously, you'll hit an `OutOfMemoryError`.

The first optimization is **downsampling with `inSampleSize`**. Before loading the full bitmap, decode only the dimensions using `BitmapFactory.Options` with `inJustDecodeBounds = true`, then calculate an appropriate `inSampleSize` to load a scaled-down version:

```kotlin
fun decodeSampledBitmap(resources: Resources, resId: Int, reqWidth: Int, reqHeight: Int): Bitmap {
    val options = BitmapFactory.Options().apply {
        inJustDecodeBounds = true
    }
    BitmapFactory.decodeResource(resources, resId, options)

    options.inSampleSize = calculateInSampleSize(options, reqWidth, reqHeight)
    options.inJustDecodeBounds = false

    return BitmapFactory.decodeResource(resources, resId, options)
}

fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int, reqHeight: Int): Int {
    val (height, width) = options.outHeight to options.outWidth
    var inSampleSize = 1
    if (height > reqHeight || width > reqWidth) {
        val halfHeight = height / 2
        val halfWidth = width / 2
        while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
            inSampleSize *= 2
        }
    }
    return inSampleSize
}
```

The second optimization is **LruCache** for in-memory caching. Set a cache size (typically 1/8 of available memory) and store decoded bitmaps keyed by a unique identifier. Before loading from disk or network, check the cache first.

The third consideration is choosing the right format. Use **VectorDrawable** (SVG) for icons and simple graphics — they scale without quality loss, have a smaller APK footprint, and don't consume bitmap memory. Reserve PNG/WebP for photos and complex images where vectors wouldn't work.

In production, you'd use a library like Coil or Glide that handles all of this — downsampling, caching (memory + disk), lifecycle awareness, and request deduplication. But interviewers want to know you understand the underlying problems these libraries solve.

#### Q22: How does `ItemAnimator` work in RecyclerView?

`ItemAnimator` animates structural changes in the list — when items are added, removed, moved, or their content changes. The default `DefaultItemAnimator` provides fade-in for additions, fade-out for removals, and translate animations for moves.

The animations are triggered by the specific notify methods: `notifyItemInserted()`, `notifyItemRemoved()`, `notifyItemMoved()`, and `notifyItemChanged()`. This is exactly why `DiffUtil` is important — it dispatches these granular notifications instead of `notifyDataSetChanged()`, which skips all animations entirely.

If you want to disable animations (for performance or UX reasons), set `recyclerView.itemAnimator = null`. If you need custom animations, extend `SimpleItemAnimator` or `DefaultItemAnimator` and override methods like `animateAdd()`, `animateRemove()`, etc.

#### Q23: What's the difference between RecyclerView and the old ListView?

This question tests whether you understand why RecyclerView was created. The key differences:

- **ViewHolder** — mandatory in RecyclerView, optional in ListView. This alone made many ListView implementations slow because developers skipped the pattern
- **LayoutManager** — RecyclerView delegates layout to a pluggable LayoutManager (list, grid, staggered). ListView only supports vertical lists
- **ItemDecoration** — RecyclerView has a clean API for dividers and spacing. ListView used `divider` and `dividerHeight` XML attributes with limited control
- **ItemAnimator** — RecyclerView supports item animations out of the box. ListView had no built-in animation support for list changes
- **DiffUtil** — RecyclerView integrates with DiffUtil for efficient partial updates. ListView relied on `notifyDataSetChanged()` for everything
- **Click handling** — ListView had `setOnItemClickListener()`. RecyclerView has no built-in click listener — you set click listeners in the ViewHolder. This is actually more flexible because different parts of an item can have different click behaviors

RecyclerView is more complex to set up but infinitely more flexible. There's no practical reason to use ListView in new code.

### Common Follow-ups

- What happens if you call `notifyDataSetChanged()` on a RecyclerView with thousands of items? (Answer: all visible items are rebound, animations are skipped, it's expensive — use DiffUtil instead)
- Can you use RecyclerView inside a ScrollView? What problems arise? (Answer: nested scrolling conflicts, the inner RecyclerView gets measured with UNSPECIFIED height and inflates all items at once, defeating recycling. Use `NestedScrollView` with `isNestedScrollingEnabled` or redesign the layout)
- How does `setHasFixedSize(true)` improve performance? (Answer: tells RecyclerView that adapter content changes won't affect its own size, so it can skip calling `requestLayout()` on itself when items change)
- What's the difference between `onDraw()` and `onDrawOver()` in ItemDecoration? (Answer: `onDraw()` draws behind items, `onDrawOver()` draws on top — useful for sticky headers)
- Why should you avoid creating objects inside `onDraw()`? (Answer: `onDraw()` is called every frame during animations. Creating `Paint` or `Rect` objects there generates garbage, triggering GC pauses that cause jank)
- How does `ConstraintLayout` measure children differently from nested `LinearLayout`? (Answer: it uses a constraint solver to calculate all positions in a single pass, while nested layouts require recursive passes through each level)
- What is the `setRecycledViewPoolSize(viewType, max)` and when would you increase it? (Answer: default is 5 per view type. If you have a view type that's created and recycled rapidly — like items in a fast-scrolling grid — increasing the pool size prevents unnecessary inflation)

### Tips for the Interview

1. **Draw the rendering pipeline on the whiteboard** — Interviewers love when you sketch the measure → layout → draw flow. It shows you understand the system, not just the API. Add the arrow from `invalidate()` to `onDraw()` and from `requestLayout()` back to `onMeasure()`.

2. **Know the RecyclerView caching levels by name** — Scrap, Cache, ViewCacheExtension, RecycledViewPool. Most candidates only know "it recycles views." Naming the actual caching layers demonstrates deep understanding and separates you from the crowd.

3. **Always mention DiffUtil when discussing list updates** — If the interviewer asks about updating a RecyclerView, never say `notifyDataSetChanged()` first. Lead with `ListAdapter` and DiffUtil. Then mention `notifyDataSetChanged()` as the fallback for rare cases where the entire dataset changes.

4. **Connect performance to the 16ms budget** — Don't just say "it's slow." Say "a nested RelativeLayout triggers two measure passes per level, and with 5 levels of nesting that's 32 measure calls, easily blowing past the 16ms frame budget." Quantify the impact.

5. **Know when to use `invalidate()` vs `requestLayout()`** — This is a favorite follow-up when custom views come up. The wrong call wastes either CPU (unnecessary measure/layout) or shows stale visuals (not redrawing when needed). Be ready with concrete examples: "Changing a paint color? `invalidate()`. Changing text that might wrap to a new line? `requestLayout()`."

6. **Mention production experience** — If you've optimized a RecyclerView, debugged overdraw, or fixed a janky scroll, mention the specific metrics. "We reduced frame drops from 15% to under 2% by sharing a RecycledViewPool across 8 carousels" is far more impressive than textbook knowledge.

---

*The View system is one of the oldest parts of Android, but understanding it deeply is still one of the fastest ways to stand out in an interview. Master the fundamentals — they never go out of style.*
