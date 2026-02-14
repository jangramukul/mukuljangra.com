---
title: "Views, RecyclerView & UI Fundamentals"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 4
sequence: 4
description: "Views, RecyclerView and UI rendering are core topics in Android interviews. This post covers the most important questions."
---

## Views, RecyclerView & UI Fundamentals

Views, RecyclerView and UI rendering are core topics in Android interviews. This post covers the most important questions.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the three phases of the View rendering pipeline?

Every View goes through three phases — **measure**, **layout**, and **draw**. In measure phase, system walks down the view tree and asks each view how big it wants to be via `onMeasure()`. In layout phase, parent tells each child where to position via `onLayout()`. In draw phase, each view renders itself onto a Canvas via `onDraw()`. This full pass needs to complete within 16ms to maintain 60 FPS. Deeply nested layouts are expensive because every extra level multiplies the work in each phase.

#### Q2: What does `onMeasure()` do, and what are the three MeasureSpec modes?

`onMeasure()` is where a view calculates how big it wants to be. The parent passes down width and height constraints as `MeasureSpec` values containing both a mode and a size.

The three modes are:
- **EXACTLY** — parent has decided the exact size. Happens with `layout_width="200dp"` or `match_parent`
- **AT_MOST** — view can be as large as it wants, up to the specified limit. Happens with `wrap_content`
- **UNSPECIFIED** — no constraint at all. Rare, typically happens inside a ScrollView

You must call `setMeasuredDimension()` at the end of `onMeasure()`. If you forget, the framework throws an `IllegalStateException`.

#### Q3: What is the difference between `invalidate()` and `requestLayout()`?

`invalidate()` triggers only the draw phase — it calls `onDraw()` again. Use it when visual appearance changes but size and position stay the same, like changing a color or updating text content. `requestLayout()` triggers the full pipeline — measure, layout, and draw. Use it when the view's size or position needs to change, like when text length changes or you modify padding programmatically.

Calling `requestLayout()` for every small visual change forces the entire view tree to re-measure and re-layout, which is far more expensive than just redrawing.

#### Q4: What is the ViewHolder pattern, and why is it mandatory in RecyclerView?

ViewHolder caches references to child views inside each list item, so you avoid calling `findViewById()` every time a row needs to bind data. In the old `ListView`, this pattern was optional. RecyclerView made it mandatory by baking it into the API.

```kotlin
class ArticleViewHolder(view: View) : RecyclerView.ViewHolder(view) {
    val titleText: TextView = view.findViewById(R.id.articleTitle)
    val authorText: TextView = view.findViewById(R.id.articleAuthor)
    val bookmarkIcon: ImageView = view.findViewById(R.id.bookmarkIcon)
}
```

ViewHolder is created once in `onCreateViewHolder()` and reused many times through `onBindViewHolder()`. In a list of 1000 items, RecyclerView might create only 10-15 ViewHolders and recycle them as the user scrolls.

#### Q5: Walk through the three key methods of `RecyclerView.Adapter`.

- **`onCreateViewHolder(parent, viewType)`** — inflates the item layout and wraps it in a ViewHolder. Called only when RecyclerView needs a new ViewHolder
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

Since ViewHolders are recycled, always reset every view property in `onBindViewHolder()`. If you set an icon to visible for item 3, that same ViewHolder might show up for item 15 with the icon still visible.

#### Q6: What are the three built-in LayoutManagers, and when would you use each?

- **LinearLayoutManager** — arranges items in a single vertical or horizontal list. Use it for chat lists, settings screens, feeds
- **GridLayoutManager** — arranges items in a uniform grid with configurable span count. Use it for photo grids, product catalogs. You can set per-item span sizes using `SpanSizeLookup` for headers that stretch full width
- **StaggeredGridLayoutManager** — arranges items in a grid where rows or columns can have different heights. Use it for Pinterest-style layouts

RecyclerView completely delegates item positioning to the LayoutManager. RecyclerView itself has no concept of "list" or "grid" — all of that logic lives in the LayoutManager.

#### Q7: What is `DiffUtil` and why should you use it instead of `notifyDataSetChanged()`?

`DiffUtil` calculates the minimal set of changes between two lists — which items were added, removed, moved, or changed — and dispatches only those specific update operations to the adapter. `notifyDataSetChanged()` tells RecyclerView to throw away everything and rebind all visible items from scratch, which kills all animations and is far more expensive.

Under the hood, `DiffUtil` uses Eugene Myers' diff algorithm. You provide a `DiffUtil.Callback` with four methods: `getOldListSize()`, `getNewListSize()`, `areItemsTheSame()` (checks identity, usually by ID), and `areContentsTheSame()` (checks if content has changed).

For large lists, run `DiffUtil.calculateDiff()` on a background thread because it's O(N) space and can take a few milliseconds for thousands of items.

#### Q8: What is the difference between `DiffUtil`, `AsyncListDiffer`, and `ListAdapter`?

These three are layers of abstraction built on top of each other:

- **DiffUtil** is the core algorithm. You call `calculateDiff()` yourself, manage threading yourself, and dispatch results yourself
- **AsyncListDiffer** wraps DiffUtil and handles the background thread for you. You call `submitList()` and it does the diff off the main thread
- **ListAdapter** wraps AsyncListDiffer and builds it directly into the adapter class. You extend `ListAdapter<T, VH>` instead of `RecyclerView.Adapter<VH>`, and just call `submitList()` whenever data changes

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

In practice, `ListAdapter` is what you should use in most cases unless you have very specific requirements around how updates are dispatched.

#### Q9: What is `ItemDecoration` and how does it work?

`ItemDecoration` lets you add visual decorations around or between items — dividers, spacing, badges, section headers drawn on the Canvas. You override `getItemOffsets()` to add spacing and `onDraw()` or `onDrawOver()` to draw custom graphics.

`onDraw()` draws **behind** the items (below in Z-order), while `onDrawOver()` draws **on top** of them. This matters for things like sticky headers that draw over the item below.

Spacing should go through `getItemOffsets()` rather than setting margins on item views directly.

#### Q10: What is `ViewStub` and when would you use it?

`ViewStub` is a zero-sized, invisible view that lazily inflates a layout only when you make it visible or call `inflate()`. Until then, it takes no space and costs almost nothing. Once inflated, the `ViewStub` replaces itself with the actual view in the hierarchy.

Use it for views that are rarely shown — error states, empty states, onboarding tooltips. If a view is only needed in 10% of cases, there's no reason to inflate it every time the screen loads.

```kotlin
// In layout XML: <ViewStub android:id="@+id/errorStub" android:layout="@layout/error_view" />

val errorStub = findViewById<ViewStub>(R.id.errorStub)
// When error occurs:
errorStub.visibility = View.VISIBLE  // inflates the layout
// OR
val inflatedView = errorStub.inflate()  // inflates and returns the view
```

You can only inflate a `ViewStub` once. After inflation, it's removed from the hierarchy. Calling `inflate()` again throws an `IllegalStateException`.

### Deep Dive Questions (Advanced → Expert)

#### Q11: Explain how RecyclerView's view recycling mechanism works internally.

When a ViewHolder scrolls off-screen, RecyclerView doesn't destroy it. It goes through a multi-level caching system called the **Recycler** with four levels:

1. **Scrap** — ViewHolders still attached to RecyclerView but marked for removal or reuse during a layout pass. These don't need rebinding
2. **Cache (mCachedViews)** — recently detached ViewHolders, stored by position. Default capacity is 2. If user scrolls down then back up, these are reattached without calling `onBindViewHolder()`
3. **ViewCacheExtension** — optional custom cache layer, almost never used in practice
4. **RecycledViewPool** — the final level. ViewHolders here are stripped of their data and sorted by `viewType`. RecyclerView pulls from here and calls `onBindViewHolder()` to rebind

`onCreateViewHolder()` is the expensive call (layout inflation), and `onBindViewHolder()` is the cheap call (setting text, images). The recycling system minimizes inflation calls. In a well-tuned RecyclerView, you might inflate 12 ViewHolders total and recycle them through a list of 10,000 items.

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

The view type should represent a category of layout, not individual items. If you return unique types per position, RecyclerView can never recycle anything.

#### Q13: What is `RecycledViewPool` and how can you share it between nested RecyclerViews?

`RecycledViewPool` is the last level of RecyclerView's caching system. It stores detached ViewHolders grouped by view type. Default limit is 5 ViewHolders per view type.

When you have nested RecyclerViews — like a vertical list of horizontal carousels — each inner RecyclerView creates its own pool. If you have 10 horizontal carousels with the same item layout, they each inflate their own ViewHolders independently. Sharing a single pool across all inner RecyclerViews avoids this:

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

In a feed with many horizontal carousels (like Netflix or Spotify), sharing the pool can reduce total ViewHolder inflation by 60-70% and noticeably improve scroll smoothness.

#### Q14: Explain the touch event dispatch mechanism — `dispatchTouchEvent`, `onInterceptTouchEvent`, and `onTouchEvent`.

Touch events flow top-down through the view tree:

1. **`dispatchTouchEvent()`** — called first on the Activity, then on each ViewGroup down the tree. Its job is to route the event
2. **`onInterceptTouchEvent()`** — called on ViewGroups only (not plain Views). If it returns `true`, the parent "steals" the event and the child receives `ACTION_CANCEL`. All subsequent events go to the parent's `onTouchEvent()`
3. **`onTouchEvent()`** — called on the target view. If it returns `true`, the view consumes the event. If `false`, the event bubbles back up to the parent

The full chain for `Activity → ViewGroup → ChildView`:
- `Activity.dispatchTouchEvent()` → `ViewGroup.dispatchTouchEvent()` → `ViewGroup.onInterceptTouchEvent()` (returns false) → `ChildView.dispatchTouchEvent()` → `ChildView.onTouchEvent()`

A view that returns `false` for `ACTION_DOWN` will never receive subsequent events (`ACTION_MOVE`, `ACTION_UP`) for that gesture. The system assumes the view isn't interested.

#### Q15: How do you resolve touch conflicts between a parent ScrollView and a child RecyclerView (or other scrollable view)?

When you nest scrollable views, the parent might intercept scroll gestures meant for the child. The child can call `parent.requestDisallowInterceptTouchEvent(true)` to tell the parent to stop intercepting for the current gesture.

For RecyclerView specifically, `NestedScrollingChild` and `NestedScrollingParent` interfaces handle this more elegantly. The child offers its scroll delta to the parent first, the parent consumes what it wants, and the child takes the rest. This is how `CoordinatorLayout` with `AppBarLayout` works — the RecyclerView scrolls, but the toolbar collapses first.

The touch slop value from `ViewConfiguration.get(context).scaledTouchSlop` is the minimum distance a finger must move before the system considers it a scroll gesture rather than a tap.

#### Q16: What is hardware acceleration and what are its limitations?

Hardware acceleration means rendering is performed by the GPU instead of the CPU. It's been enabled by default since Android 3.0. Views are rendered into a GPU-backed Canvas using OpenGL (and later Vulkan on newer devices), making most drawing operations significantly faster.

Not all Canvas operations are supported on the hardware-accelerated path. Some unsupported operations include `drawBitmapMesh()` with colors, certain `PathEffect` types, and `drawPicture()`. You can disable hardware acceleration at the view level:

```kotlin
myCustomView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
```

Software rendering is slower but supports all Canvas operations. In practice, you almost never need to disable hardware acceleration.

#### Q17: What is overdraw, and how do you detect and reduce it?

Overdraw happens when the GPU draws the same pixel multiple times in a single frame. Drawing a white background, then a card on top, then text on the card — that's 3x overdraw for those pixels. Excessive overdraw wastes GPU cycles and can push past the 16ms frame budget.

To detect it, enable "Debug GPU Overdraw" in Developer Options. The screen gets color-coded: blue means 1x overdraw, green is 2x, pink is 3x, and red is 4x+.

To reduce overdraw:
- Remove unnecessary backgrounds. If your Activity has a window background and root layout also sets a background, that's already 2x overdraw. Call `window.setBackgroundDrawable(null)` if your content covers the full screen
- Use `clipRect()` in custom views to tell the Canvas not to draw outside visible areas
- Flatten your view hierarchy — fewer nested ViewGroups means fewer stacked backgrounds

#### Q18: How do you flatten a view hierarchy and why does it matter?

A deep view hierarchy is expensive because measure and layout phases walk the tree recursively. Some layouts like `RelativeLayout` measure their children twice, so nesting them doubles the cost exponentially.

`ConstraintLayout` solves this by expressing complex layouts with a single flat level. A layout that required 4 levels of nesting with `LinearLayout` can often be a single `ConstraintLayout` with constraints between views. It measures children in a single pass using a constraint solver.

The `<merge>` tag eliminates redundant root ViewGroups when using `<include>`. If your included layout has a `LinearLayout` root and the parent is also a `LinearLayout`, `<merge>` lets you skip the inner root.

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

You create a custom view when you need specialized drawing (a chart, a gauge, a custom progress indicator) or a reusable UI component across multiple screens.

Extend **View** when you need to draw something custom on a Canvas — shapes, paths, bitmaps. You'll override `onMeasure()`, `onDraw()`, and possibly `onTouchEvent()`. Extend **ViewGroup** when you need to arrange child views in a custom layout pattern — a circular layout, a flow layout. You'll override `onMeasure()` and `onLayout()` to position children.

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

#### Q20: What's the 16ms frame budget, and what happens when you exceed it?

Android targets 60 frames per second, giving each frame approximately 16.67ms. Within that window, the system needs to handle input, animations, measure/layout/draw, and GPU rendering. If any frame takes longer than 16ms, it gets dropped — the user sees the same frame twice, which appears as stutter or jank.

The work that must complete within 16ms:
- Processing input events (touch, keyboard)
- Running animations and Choreographer callbacks
- Traversing the view tree (measure → layout → draw)
- GPU rendering of the draw commands

Common causes of dropped frames: heavy computation on the main thread (JSON parsing, sorting large lists), complex view hierarchies requiring multiple measure passes, excessive GC causing stop-the-world pauses, and overdraw forcing the GPU to redraw pixels multiple times.

You can detect frame drops using GPU Profiling bar in Developer Options. Each bar represents a frame — bars exceeding the green line indicate jank. For deeper analysis, Systrace and the CPU Profiler in Android Studio show exactly which methods are consuming time.

#### Q21: How do you optimize bitmap loading for a list of images?

Loading full-resolution bitmaps into a RecyclerView is one of the fastest ways to run out of memory. A 4000x3000 photo at ARGB_8888 consumes 48MB of RAM.

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

The second optimization is **LruCache** for in-memory caching. Set a cache size (typically 1/8 of available memory) and store decoded bitmaps keyed by a unique identifier. Check the cache before loading from disk or network.

The third is choosing the right format. Use **VectorDrawable** for icons and simple graphics — they scale without quality loss and don't consume bitmap memory. Reserve PNG/WebP for photos and complex images.

In production, libraries like Coil or Glide handle all of this — downsampling, caching, lifecycle awareness, and request deduplication.

#### Q22: How does `ItemAnimator` work in RecyclerView?

`ItemAnimator` animates structural changes in the list — when items are added, removed, moved, or changed. The default `DefaultItemAnimator` provides fade-in for additions, fade-out for removals, and translate animations for moves.

Animations are triggered by specific notify methods: `notifyItemInserted()`, `notifyItemRemoved()`, `notifyItemMoved()`, and `notifyItemChanged()`. This is why `DiffUtil` matters — it dispatches these granular notifications instead of `notifyDataSetChanged()`, which skips all animations.

To disable animations, set `recyclerView.itemAnimator = null`. For custom animations, extend `SimpleItemAnimator` or `DefaultItemAnimator` and override methods like `animateAdd()`, `animateRemove()`.

#### Q23: What's the difference between RecyclerView and the old ListView?

Key differences:

- **ViewHolder** — mandatory in RecyclerView, optional in ListView
- **LayoutManager** — RecyclerView delegates layout to a pluggable LayoutManager (list, grid, staggered). ListView only supports vertical lists
- **ItemDecoration** — RecyclerView has a clean API for dividers and spacing. ListView used `divider` and `dividerHeight` XML attributes with limited control
- **ItemAnimator** — RecyclerView supports item animations out of the box. ListView had no built-in animation support
- **DiffUtil** — RecyclerView integrates with DiffUtil for efficient partial updates. ListView relied on `notifyDataSetChanged()` for everything
- **Click handling** — ListView had `setOnItemClickListener()`. RecyclerView has no built-in click listener — you set click listeners in the ViewHolder, which is more flexible

RecyclerView is more complex to set up but far more flexible. There's no reason to use ListView in new code.

#### Q24: How does pagination work in RecyclerView, and what does the Paging library provide?

Loading the entire dataset at once wastes memory and network bandwidth. There are two approaches: manual pagination and the Jetpack Paging library.

**Manual pagination** means detecting when the user nears the end of the list using a `RecyclerView.OnScrollListener` that checks `findLastVisibleItemPosition()`, then triggering a load of the next page. You manage page tokens, append to your list, and call `notifyItemRangeInserted()`. But you have to handle loading states, errors, retries, and cache invalidation yourself.

**Paging 3** handles all of this. You define a `PagingSource` that knows how to load a page of data given a key, and Paging handles triggering loads as the user scrolls, caching loaded pages, and showing loading/error states via `RemoteMediator`.

```kotlin
class ArticlePagingSource(
    private val api: ArticleApi
) : PagingSource<Int, Article>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, Article> {
        val page = params.key ?: 1
        return try {
            val response = api.getArticles(page = page, size = params.loadSize)
            LoadResult.Page(
                data = response.articles,
                prevKey = if (page == 1) null else page - 1,
                nextKey = if (response.articles.isEmpty()) null else page + 1
            )
        } catch (e: IOException) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, Article>): Int? {
        return state.anchorPosition?.let { position ->
            state.closestPageToPosition(position)?.prevKey?.plus(1)
                ?: state.closestPageToPosition(position)?.nextKey?.minus(1)
        }
    }
}
```

Two common pagination strategies: **offset-based** (page 1, page 2, ...) is simple but results can shift when items are inserted or deleted between page fetches. **Cursor-based** uses the last item's ID or timestamp as the cursor — more stable and recommended for feeds and timelines.

#### Q25: What is `ViewStub` and when would you use it?

`ViewStub` is a zero-sized, invisible View that lazily inflates a layout resource at runtime. It takes zero space in the view hierarchy until you call `inflate()` or set its visibility to `VISIBLE`. Once inflated, the `ViewStub` is replaced by the inflated layout in the parent.

Use it for views that aren't always needed — error states, empty states, optional sections. Instead of including views set to `GONE` (which still inflates and measures them), `ViewStub` defers inflation entirely, saving both memory and layout time.

```xml
<!-- In your layout XML -->
<ViewStub
    android:id="@+id/error_stub"
    android:inflatedId="@+id/error_layout"
    android:layout="@layout/error_state"
    android:layout_width="match_parent"
    android:layout_height="wrap_content" />
```

```kotlin
// Inflate only when needed
val errorView = findViewById<ViewStub>(R.id.error_stub).inflate()
// After inflation, access by the inflatedId
val errorLayout = findViewById<View>(R.id.error_layout)
```

`ViewStub` can only be inflated once. After inflation, calling `inflate()` again throws an `IllegalStateException`. If you need to show/hide the inflated view repeatedly, toggle its visibility normally after the first inflation.

### Common Follow-ups

- What happens if you call `notifyDataSetChanged()` on a RecyclerView with thousands of items? (Answer: all visible items are rebound, animations are skipped, it's expensive — use DiffUtil instead)
- Can you use RecyclerView inside a ScrollView? What problems arise? (Answer: nested scrolling conflicts, the inner RecyclerView gets measured with UNSPECIFIED height and inflates all items at once, defeating recycling. Use `NestedScrollView` with `isNestedScrollingEnabled` or redesign the layout)
- How does `setHasFixedSize(true)` improve performance? (Answer: tells RecyclerView that adapter content changes won't affect its own size, so it can skip calling `requestLayout()` on itself when items change)
- What's the difference between `onDraw()` and `onDrawOver()` in ItemDecoration? (Answer: `onDraw()` draws behind items, `onDrawOver()` draws on top — useful for sticky headers)
- Why should you avoid creating objects inside `onDraw()`? (Answer: `onDraw()` is called every frame during animations. Creating `Paint` or `Rect` objects there generates garbage, triggering GC pauses that cause jank)
- How does `ConstraintLayout` measure children differently from nested `LinearLayout`? (Answer: it uses a constraint solver to calculate all positions in a single pass, while nested layouts require recursive passes through each level)
- What is the `setRecycledViewPoolSize(viewType, max)` and when would you increase it? (Answer: default is 5 per view type. If you have a view type that's created and recycled rapidly — like items in a fast-scrolling grid — increasing the pool size prevents unnecessary inflation)
