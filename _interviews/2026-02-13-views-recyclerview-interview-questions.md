---
title: "Views, RecyclerView & UI Fundamentals"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 8
sequence: 8
description: "Views, RecyclerView and UI rendering are core topics in Android interviews. This post covers the most important questions."
---

## Views, RecyclerView & UI Fundamentals

RecyclerView is one of those things you think you understand until you really dig in. You've used it a hundred times, but when someone asks "how does the recycling actually work internally?" — suddenly it's not so simple. Same goes for the View rendering pipeline. We all write `onDraw()`, but how many of us can explain what happens between the XML and the pixels on screen?

Let's walk through the questions that actually come up.

#### What is the ViewHolder pattern, and why is it mandatory in RecyclerView?

Think of a ViewHolder like a reusable name tag at a conference. Instead of printing a brand-new badge every time someone walks up, you just erase the old name and write a new one. The badge (ViewHolder) is the same physical object — only the data on it changes.

ViewHolder caches references to child views inside each list item, so you don't call `findViewById()` every time a row needs new data. In the old `ListView` days, this was a best practice but optional — plenty of people skipped it and paid the performance tax. RecyclerView said "nope, you're doing this whether you like it or not" and made it mandatory.

```kotlin
class ArticleViewHolder(view: View) : RecyclerView.ViewHolder(view) {
    val titleText: TextView = view.findViewById(R.id.articleTitle)
    val authorText: TextView = view.findViewById(R.id.articleAuthor)
    val bookmarkIcon: ImageView = view.findViewById(R.id.bookmarkIcon)
}
```

The ViewHolder is created once in `onCreateViewHolder()` and reused many times through `onBindViewHolder()`. In a list of 1000 items, RecyclerView might create only 10-15 ViewHolders and recycle them as the user scrolls. That's the whole trick — inflate once, rebind cheaply forever.

#### Walk through the three key methods of `RecyclerView.Adapter`.

Three methods, three jobs. Think of it like a restaurant:

- **`onCreateViewHolder(parent, viewType)`** — this is the kitchen building a new plate. It inflates the item layout and wraps it in a ViewHolder. Only called when RecyclerView actually needs a brand-new ViewHolder
- **`onBindViewHolder(holder, position)`** — this is putting food on the plate. It takes an existing ViewHolder and fills it with data for a specific position. Called every time RecyclerView reuses a ViewHolder for a different item
- **`getItemCount()`** — just tells RecyclerView how many items are on the menu

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

Here's the gotcha that trips people up: since ViewHolders are recycled, you must reset every view property in `onBindViewHolder()`. If you set a bookmark icon to visible for item 3, that same ViewHolder might show up for item 15 with the icon still visible. The plate still has yesterday's garnish on it.

#### What are the three phases of the View rendering pipeline?

Picture an assembly line with three stations. Every View passes through all three — **measure**, **layout**, and **draw** — in that exact order.

In measure, the system walks down the view tree and asks each view "how big do you want to be?" via `onMeasure()`. In layout, the parent says "okay, you go here" and positions each child via `onLayout()`. In draw, each view actually paints itself onto a Canvas via `onDraw()`.

This entire assembly line needs to finish within 16ms to hit 60 FPS. Deeply nested layouts are expensive because every extra level multiplies the work at each station — it's like adding more stops to the assembly line.

> **🧠 Think about it:** If a `RelativeLayout` measures its children twice, and you nest three of them inside each other, how many measure passes does the deepest child go through?

#### What is the difference between `invalidate()` and `requestLayout()`?

This is like the difference between repainting your living room wall versus knocking down a wall and rebuilding it.

`invalidate()` triggers only the draw phase. Use it when the visual appearance changes but size and position stay the same — like changing a color or updating text content. Quick and cheap.

`requestLayout()` triggers the full pipeline — measure, layout, and draw. Use it when the view's size or position actually needs to change. It forces the entire view tree to re-measure and re-layout, which is significantly more expensive. Calling `requestLayout()` for every small visual change is like demolishing and rebuilding a wall just because you wanted a different paint color.

#### What is `DiffUtil` and why should you use it instead of `notifyDataSetChanged()`?

Imagine you have a whiteboard with 20 sticky notes. One note changed. `notifyDataSetChanged()` is like ripping all 20 notes off and rewriting them from scratch. `DiffUtil` is like spotting the one note that changed and only updating that one.

`DiffUtil` calculates the minimal set of changes between two lists — which items were added, removed, moved, or changed — and dispatches only those specific update operations. That means smooth animations and way less work for RecyclerView.

Under the hood, it uses Eugene Myers' diff algorithm. You provide a callback with four methods: `getOldListSize()`, `getNewListSize()`, `areItemsTheSame()` (checks identity, usually by ID), and `areContentsTheSame()` (checks if the actual content changed).

For large lists, run `DiffUtil.calculateDiff()` on a background thread because it's O(N) space and can take a few milliseconds for thousands of items.

#### What is the difference between `DiffUtil`, `AsyncListDiffer`, and `ListAdapter`?

These three are like Russian nesting dolls — each one wraps the previous one and does more work for you:

- **DiffUtil** is the raw algorithm. You call `calculateDiff()` yourself, manage threading yourself, and dispatch results yourself. Full control, full responsibility
- **AsyncListDiffer** wraps DiffUtil and handles the background thread for you. You call `submitList()` and it runs the diff off the main thread. Less boilerplate, same result
- **ListAdapter** wraps AsyncListDiffer and bakes it right into the adapter class. You extend `ListAdapter<T, VH>` instead of `RecyclerView.Adapter<VH>`, and just call `submitList()` whenever data changes

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

In practice, `ListAdapter` is what you should reach for unless you have very specific requirements around how updates are dispatched. Why do the plumbing yourself when the framework already did it?

#### Explain how RecyclerView's view recycling mechanism works internally.

When a ViewHolder scrolls off-screen, RecyclerView doesn't destroy it. That would be wasteful, like throwing away a perfectly good moving box after one use. Instead, it drops the ViewHolder into a multi-level caching system called the **Recycler**. Think of it like a lost-and-found with four shelves, each progressively further from the door:

1. **Scrap** — ViewHolders still attached to RecyclerView but marked for removal or reuse during a layout pass. These are right at the door — they don't need rebinding at all
2. **Cache (mCachedViews)** — recently detached ViewHolders, stored by position. Default capacity is 2. If the user scrolls down then quickly scrolls back up, these get reattached without calling `onBindViewHolder()`. Still fresh, no work needed
3. **ViewCacheExtension** — an optional custom cache layer. Almost nobody uses this in practice
4. **RecycledViewPool** — the bottom shelf. ViewHolders here are stripped of their data and sorted by `viewType`. RecyclerView pulls from here and calls `onBindViewHolder()` to rebind them with new data

The key insight: `onCreateViewHolder()` is the expensive call because it involves layout inflation. `onBindViewHolder()` is the cheap call — just setting text, images, click listeners. The entire recycling system exists to minimize inflation calls. In a well-tuned RecyclerView, you might inflate 12 ViewHolders total and recycle them through a list of 10,000 items.

#### How do you handle multiple view types in RecyclerView?

Override `getItemViewType(position)` to return different integer constants based on the item at that position. RecyclerView uses this value like a label on a bin — it only recycles a ViewHolder into a position with the same view type. A header ViewHolder never accidentally gets reused for an article row.

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

One thing to watch out for: the view type should represent a category of layout, not individual items. If you return unique types per position, RecyclerView can never recycle anything — you've defeated the entire purpose.

#### What's the difference between RecyclerView and the old ListView?

ListView was a bicycle. RecyclerView is a car you assemble from parts. More effort to set up, but way more capable:

- **ViewHolder** — mandatory in RecyclerView, optional in ListView
- **LayoutManager** — RecyclerView delegates layout to a pluggable LayoutManager (list, grid, staggered). ListView only does vertical lists
- **ItemDecoration** — RecyclerView has a clean API for dividers and spacing. ListView had `divider` and `dividerHeight` XML attributes with limited control
- **ItemAnimator** — RecyclerView supports item animations out of the box. ListView had nothing built-in
- **DiffUtil** — RecyclerView integrates with DiffUtil for efficient partial updates. ListView relied on `notifyDataSetChanged()` for everything
- **Click handling** — ListView had `setOnItemClickListener()`. RecyclerView has no built-in click listener — you set click listeners in the ViewHolder, which is more flexible

There's no reason to use ListView in new code. RecyclerView won that race a long time ago.

#### What are the three built-in LayoutManagers, and when would you use each?

- **LinearLayoutManager** — arranges items in a single vertical or horizontal line. Your go-to for chat lists, settings screens, feeds
- **GridLayoutManager** — arranges items in a uniform grid with configurable span count. Great for photo grids and product catalogs. You can use `SpanSizeLookup` to let certain items (like section headers) stretch full width
- **StaggeredGridLayoutManager** — a grid where rows or columns can have different heights. This is your Pinterest-style layout

Here's the part that makes RecyclerView's design really elegant: RecyclerView itself has zero concept of "list" or "grid." All of that logic lives entirely in the LayoutManager. RecyclerView just manages ViewHolders and recycling — it delegates all positioning to whatever LayoutManager you plug in.

#### What does `onMeasure()` do, and what are the three MeasureSpec modes?

`onMeasure()` is where a view answers the question "how big do you want to be?" The parent passes down width and height constraints as `MeasureSpec` values — each one packs both a mode and a size into a single integer.

Think of it like a parent giving their kid lunch money with different instructions:

- **EXACTLY** — "Here's exactly $5, spend all of it." The parent has decided the exact size. Happens with `layout_width="200dp"` or `match_parent`
- **AT_MOST** — "Here's $5, but you can spend less." The view can be as large as it wants, up to the specified limit. Happens with `wrap_content`
- **UNSPECIFIED** — "Buy whatever you want, no limit." No constraint at all. Rare — typically happens inside a ScrollView where height is unbounded

You must call `setMeasuredDimension()` at the end of `onMeasure()`. Forget that call and the framework throws an `IllegalStateException`.

> **🧠 Think about it:** Why would a ScrollView pass UNSPECIFIED to its child? What would go wrong if it passed AT_MOST instead?

#### Explain the touch event dispatch mechanism — `dispatchTouchEvent`, `onInterceptTouchEvent`, and `onTouchEvent`.

Touch events flow through the view tree like a package being delivered through a chain of managers. Each manager can either pass it down, intercept it, or ignore it.

1. **`dispatchTouchEvent()`** — called first on the Activity, then on each ViewGroup down the tree. Think of it as the mail room — its job is just to route the event to the right place
2. **`onInterceptTouchEvent()`** — called on ViewGroups only (not plain Views). This is where a parent can "steal" the event. If it returns `true`, the child receives `ACTION_CANCEL` and all subsequent events go to the parent's `onTouchEvent()`. It's like a manager saying "actually, I'll handle this one myself"
3. **`onTouchEvent()`** — called on the target view. If it returns `true`, the view consumes the event. If `false`, the event bubbles back up to the parent

The full chain for `Activity -> ViewGroup -> ChildView`:
- `Activity.dispatchTouchEvent()` -> `ViewGroup.dispatchTouchEvent()` -> `ViewGroup.onInterceptTouchEvent()` (returns false) -> `ChildView.dispatchTouchEvent()` -> `ChildView.onTouchEvent()`

Here's a critical detail: a view that returns `false` for `ACTION_DOWN` will never receive subsequent events (`ACTION_MOVE`, `ACTION_UP`) for that gesture. The system takes that first "no" as "I'm not interested in this entire gesture, don't bother me again."

#### What's the 16ms frame budget, and what happens when you exceed it?

Android targets 60 frames per second, which gives each frame approximately 16.67ms to do everything — handle input, run animations, measure/layout/draw the view tree, and finish GPU rendering. If any frame takes longer than 16ms, it gets dropped. The user sees the same frame twice, which shows up as jank — that stuttery, sluggish feeling when scrolling.

Common culprits: heavy computation on the main thread, complex view hierarchies requiring multiple measure passes, excessive GC pauses from object churn, and overdraw forcing the GPU to paint pixels multiple times.

You can spot frame drops using the GPU Profiling bar in Developer Options. Each bar represents a frame — bars that poke above the green line are frames that missed the 16ms deadline. For deeper analysis, Systrace and the CPU Profiler in Android Studio show exactly which methods are eating up time.

#### What is overdraw, and how do you detect and reduce it?

Overdraw is when the GPU paints the same pixel more than once in a single frame. It's like painting a wall white, then taping a poster over it, then sticking a note on the poster — three layers of paint for pixels the user only sees one of.

Drawing a white background, then a card on top, then text on the card — that's 3x overdraw for those pixels. Multiply that across the whole screen and you're burning GPU budget for nothing.

To detect it, enable "Debug GPU Overdraw" in Developer Options. The screen gets color-coded: blue means 1x overdraw, green is 2x, pink is 3x, and red is 4x+.

To reduce it:
- Remove unnecessary backgrounds. If your Activity has a window background and the root layout also sets a background, that's already 2x overdraw before you've drawn a single widget. Call `window.setBackgroundDrawable(null)` if your content covers the full screen
- Use `clipRect()` in custom views to tell the Canvas not to draw outside visible areas
- Flatten your view hierarchy — fewer nested ViewGroups means fewer stacked backgrounds

#### How do you flatten a view hierarchy and why does it matter?

A deep view hierarchy is like a game of telephone — each level adds latency. The measure and layout phases walk the tree recursively, and some layouts like `RelativeLayout` measure their children twice. Nest three of them and your deepest child gets measured eight times. That cost adds up fast.

`ConstraintLayout` solves this by letting you express complex layouts in a single flat level. A layout that required 4 levels of nesting with `LinearLayout` can often be a single `ConstraintLayout`. It measures children in one pass using a constraint solver — no recursion penalty.

The `<merge>` tag is another tool for this. It eliminates redundant root ViewGroups when using `<include>`. If your included layout has a `LinearLayout` root and the parent is also a `LinearLayout`, `<merge>` lets you skip the inner root entirely.

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

Without `<merge>`, the included layout would add an extra ViewGroup level. With `<merge>`, the children are directly added to the parent — one less layer in the telephone game.

#### What is `RecycledViewPool` and how can you share it between nested RecyclerViews?

`RecycledViewPool` is the last level of RecyclerView's caching system — the bottom shelf we talked about earlier. It stores detached ViewHolders grouped by view type, with a default limit of 5 ViewHolders per type.

Now here's where it gets interesting. When you have nested RecyclerViews — like a vertical list of horizontal carousels — each inner RecyclerView creates its own pool. If you have 10 horizontal carousels all showing the same kind of item, they each inflate their own ViewHolders independently. That's like 10 different kitchens each making the same dish from scratch when they could share one kitchen.

Sharing a single pool fixes this:

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

> **🧠 Think about it:** If the default pool size is 5 per view type and you have 10 carousels sharing a pool, would you want to increase that default? What would happen if the pool is too small for the demand?

#### How do you resolve touch conflicts between a parent ScrollView and a child RecyclerView?

This is the classic "two scrollable things fighting over who gets to scroll" problem. The parent might intercept scroll gestures meant for the child, leaving the child unable to scroll at all.

The brute-force fix: the child calls `parent.requestDisallowInterceptTouchEvent(true)` to tell the parent "back off, this gesture is mine."

But for RecyclerView specifically, there's a cleaner approach. The `NestedScrollingChild` and `NestedScrollingParent` interfaces create a negotiation system. The child offers its scroll delta to the parent first, the parent consumes what it wants, and the child takes the rest. This is exactly how `CoordinatorLayout` with `AppBarLayout` works — the RecyclerView scrolls, but the toolbar collapses first before the list starts moving.

#### What is `ItemDecoration` and how does it work?

`ItemDecoration` lets you add visual decorations around or between items — dividers, spacing, badges, section headers painted directly on the Canvas. You override `getItemOffsets()` to reserve space around items and `onDraw()` or `onDrawOver()` to draw custom graphics into that space.

The difference between `onDraw()` and `onDrawOver()` matters: `onDraw()` paints behind the items (below in Z-order), while `onDrawOver()` paints on top of them. Sticky headers that overlap the item scrolling beneath? That's `onDrawOver()`.

One practical note: spacing between items should always go through `getItemOffsets()` rather than setting margins on item views directly. Margins are part of the item's layout, but offsets are managed by RecyclerView — cleaner separation.

#### How does `ItemAnimator` work in RecyclerView?

`ItemAnimator` handles the animations you see when items appear, disappear, move, or change. The default `DefaultItemAnimator` provides fade-in for additions, fade-out for removals, and smooth translate animations for moves. It's what makes list updates feel alive instead of jarring.

But here's the thing — these animations only trigger from specific notify methods: `notifyItemInserted()`, `notifyItemRemoved()`, `notifyItemMoved()`, and `notifyItemChanged()`. This is exactly why `DiffUtil` matters — it dispatches these granular notifications automatically. Call `notifyDataSetChanged()` instead and you get zero animations. Everything just pops into place.

To disable animations entirely, set `recyclerView.itemAnimator = null`. For custom animations, extend `SimpleItemAnimator` or `DefaultItemAnimator` and override methods like `animateAdd()` and `animateRemove()`.

#### When would you create a custom View, and what's the difference between extending `View` vs `ViewGroup`?

I reach for a custom View when the built-in widgets can't do what I need — a speedometer gauge, a circular progress indicator, a custom chart. Basically, anytime I need to draw something that doesn't exist in the toolkit, or I want a reusable UI component across multiple screens.

The choice between `View` and `ViewGroup` comes down to a simple question: are you drawing, or are you arranging?

Extend **View** when you need to draw something custom on a Canvas — shapes, paths, bitmaps. You'll override `onMeasure()`, `onDraw()`, and possibly `onTouchEvent()`. Extend **ViewGroup** when you need to arrange child views in a custom layout pattern — a circular layout, a flow layout. You'll override `onMeasure()` and `onLayout()` to position children.

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
        typedArray.recycle()
    }
}
```

#### What is `ViewStub` and when would you use it?

`ViewStub` is like a reserved parking spot with a sign that says "we'll build the garage when someone actually parks here." It's a zero-sized, invisible view that lazily inflates a layout only when you make it visible or call `inflate()`. Until then, it takes up no space and costs almost nothing.

Once inflated, the `ViewStub` replaces itself with the actual view in the hierarchy — it's a one-time deal. Use it for views that are rarely shown: error states, empty states, onboarding tooltips. If a view is only needed in 10% of sessions, there's no reason to inflate it on every screen load.

```kotlin
// In layout XML: <ViewStub android:id="@+id/errorStub" android:layout="@layout/error_view" />

val errorStub = findViewById<ViewStub>(R.id.errorStub)
// When error occurs:
errorStub.visibility = View.VISIBLE  // inflates the layout
// OR
val inflatedView = errorStub.inflate()  // inflates and returns the view
```

You can only inflate a `ViewStub` once. After inflation, it's gone from the hierarchy — replaced by the real view. Call `inflate()` again and you'll get an `IllegalStateException`.

#### What is `SnapHelper` in RecyclerView and how does it work?

Ever notice how some horizontal lists "snap" items to the center after you flick through them? That's `SnapHelper`. It automatically aligns items to a defined position after the user finishes scrolling. Android gives you two built-in flavors:

- `LinearSnapHelper` — snaps the closest item to the center of the RecyclerView
- `PagerSnapHelper` — snaps one item at a time, mimicking ViewPager behavior

```kotlin
val snapHelper = PagerSnapHelper()
snapHelper.attachToRecyclerView(recyclerView)
```

Under the hood, `SnapHelper` attaches an `OnFlingListener` to the RecyclerView. When a fling ends, it calculates the distance to the nearest snap point and triggers a smooth scroll to land the item in exactly the right spot.

#### What is hardware acceleration and what are its limitations?

Hardware acceleration means rendering is handled by the GPU instead of the CPU. It's like offloading your heavy math homework to a friend who's really good at math — same work, way faster. It's been enabled by default since Android 3.0, and it makes most drawing operations significantly faster by rendering Views into a GPU-backed Canvas.

But not every Canvas operation works on the hardware-accelerated path. Some unsupported operations include `drawBitmapMesh()` with colors, certain `PathEffect` types, and `drawPicture()`. When you hit one of these, you can fall back to software rendering at the view level:

```kotlin
myCustomView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
```

Software rendering is slower but supports all Canvas operations. In practice, you almost never need to disable hardware acceleration — it's rare enough that most developers never encounter the limitation.

### Common Follow-ups

- What happens if you call `notifyDataSetChanged()` on a RecyclerView with thousands of items? (Answer: all visible items are rebound, animations are skipped, it's expensive — use DiffUtil instead)
- Can you use RecyclerView inside a ScrollView? What problems arise? (Answer: nested scrolling conflicts, the inner RecyclerView gets measured with UNSPECIFIED height and inflates all items at once, defeating recycling. Use `NestedScrollView` with `isNestedScrollingEnabled` or redesign the layout)
- How does `setHasFixedSize(true)` improve performance? (Answer: tells RecyclerView that adapter content changes won't affect its own size, so it can skip calling `requestLayout()` on itself when items change)
- What's the difference between `onDraw()` and `onDrawOver()` in ItemDecoration? (Answer: `onDraw()` draws behind items, `onDrawOver()` draws on top — useful for sticky headers)
- Why should you avoid creating objects inside `onDraw()`? (Answer: `onDraw()` is called every frame during animations. Creating `Paint` or `Rect` objects there generates garbage, triggering GC pauses that cause jank)
- How does `ConstraintLayout` measure children differently from nested `LinearLayout`? (Answer: it uses a constraint solver to calculate all positions in a single pass, while nested layouts require recursive passes through each level)
- What is `setRecycledViewPoolSize(viewType, max)` and when would you increase it? (Answer: default is 5 per view type. If you have a view type that's created and recycled rapidly — like items in a fast-scrolling grid — increasing the pool size prevents unnecessary inflation)
