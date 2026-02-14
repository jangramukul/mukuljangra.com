---
title: RecyclerView and LazyColumn Performance Guide
layout: post
categories: post
tags:
  - Android
  - Performance
  - Jetpack Compose
---

Picture this: you've just shipped a beautiful product feed. RecyclerView with 8 different view types, nested horizontal carousels, DiffUtil — the works. On your Pixel, it scrolls like butter. You feel great. Then the QA team pulls out a Samsung A12. Every fling stutters. Frame times spike to 40-50ms. Your stomach drops.

That was me. And the fix wasn't one dramatic code change — it was a series of small ones, each shaving off a few milliseconds. That experience made me obsessive about list performance, and now I bring the same rigor to LazyColumn in Compose.

Here's why lists are such a performance minefield: they combine three expensive operations — creating views or composables, binding data, and measuring/laying them out — all crammed into a 16ms frame budget. Think of it like a restaurant kitchen trying to prepare, plate, and serve dishes while the conveyor belt never stops. Both RecyclerView and LazyColumn have clever internal tricks to keep up, but they make very different tradeoffs. Understanding those tricks is what separates a silky 60fps list from one that visibly hitches every time a new item scrolls in.

## How RecyclerView Recycling Actually Works

RecyclerView's big idea is simple: why build a brand new view every time when you can recycle one that just scrolled off-screen? Think of it like a sushi restaurant with a conveyor belt. The plates (views) keep going around, and when a plate comes back to the kitchen, the chef doesn't smash it and craft a new one — they just put fresh sushi on it and send it back out.

But the recycling machinery is more layered than most people realize. There are actually multiple caches, and which cache your view comes from determines how expensive the operation is.

**The attached scrap list** holds ViewHolders that are still on screen but being repositioned — like during a layout pass triggered by `notifyItemMoved`. Views in the scrap are reused without rebinding because their data hasn't changed. **The cached views list** (default size: 2) holds recently detached ViewHolders by position. When a view scrolls off and a new position near the top is needed, RecyclerView checks if the cached view was for that exact position. If it matches, the view is reattached without calling `onBindViewHolder` — this is why scrolling back to a recently-viewed position feels faster.

**The RecycledViewPool** holds ViewHolders organized by view type. When a view scrolls off-screen and the cache is full, the ViewHolder goes to the pool. Retrieving from the pool requires rebinding via `onBindViewHolder`, but it's still way cheaper than inflation. The pool's default size is 5 per view type.

So here's the mental model: **inflation is the most expensive operation** (1-5ms depending on layout complexity) — that's building a brand new plate from clay. Pool recycling is moderate (0.5-2ms for binding) — that's putting fresh sushi on an existing plate. And cache hits are practically free because neither inflation nor binding is needed — that's the plate coming back with the same sushi the customer wanted.

```kotlin
class ProductAdapter : ListAdapter<Product, ProductViewHolder>(ProductDiffCallback()) {
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ProductViewHolder {
        // This is expensive — layout inflation + view allocation
        // Happens only when the pool is empty for this viewType
        val binding = ItemProductBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ProductViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ProductViewHolder, position: Int) {
        // This should be fast — just data binding, no layout inflation
        val product = getItem(position)
        holder.binding.productName.text = product.name
        holder.binding.productPrice.text = product.formattedPrice
        imageLoader.load(product.imageUrl).into(holder.binding.productImage)
    }
}
```

## DiffUtil and AsyncListDiffer

DiffUtil is the algorithm that figures out the minimum number of moves to get from your old list to your new list. It uses Eugene Myers' difference algorithm at O(N + D²) time — the same kind of algorithm powering `git diff`. But the algorithm is only as smart as the callbacks you give it.

The critical part is implementing `DiffUtil.ItemCallback` correctly. `areItemsTheSame` answers "is this the same entity?" — it compares stable IDs. `areContentsTheSame` answers "has anything visible changed?" Only when `areItemsTheSame` returns true does the algorithm bother calling `areContentsTheSame`. Think of it like a hotel check-in: first you confirm the guest is the same person (ID check), then you check if they need a different room (content check).

```kotlin
class ProductDiffCallback : DiffUtil.ItemCallback<Product>() {
    override fun areItemsTheSame(oldItem: Product, newItem: Product): Boolean {
        // Identity check — MUST use a stable identifier
        return oldItem.id == newItem.id
    }

    override fun areContentsTheSame(oldItem: Product, newItem: Product): Boolean {
        // Content check — only called if areItemsTheSame returns true
        return oldItem == newItem
    }

    override fun getChangePayload(oldItem: Product, newItem: Product): Any? {
        return buildList {
            if (oldItem.price != newItem.price) add("price")
            if (oldItem.inStock != newItem.inStock) add("stock")
        }.ifEmpty { null }
    }
}
```

Now here's the mistake I see constantly: using `hashCode()` for `areItemsTheSame`. Hash codes collide between different items, causing DiffUtil to think two completely different products are the same person checking into the hotel — which produces bizarre visual glitches where items flicker or show the wrong data. Object reference equality (`===`) is equally broken because your repository creates new instances on every fetch, so DiffUtil treats every item as brand new and you lose all animation and recycling benefits. Use stable IDs. Always.

**Payloads** are the optimization most teams skip, and honestly, I get it — they feel like extra work. But they're worth it. When `areContentsTheSame` returns false, `getChangePayload` tells DiffUtil exactly what changed. Then in `onBindViewHolder`, you only update those specific fields instead of rebinding the entire ViewHolder. It's like telling the hotel "this guest just needs fresh towels" instead of "redo the entire room." In our product list, implementing payloads for price updates during flash sales reduced the average bind time from 1.8ms to 0.3ms because we avoided rebinding the image and other expensive views.

Here's the thing most developers miss about DiffUtil: it runs on the **main thread** by default when you call `DiffUtil.calculateDiff()` manually. For a list of 1000 items, that diff calculation can take 10-20ms and drop frames. You're essentially asking the main thread to do a bunch of math while users are trying to scroll.

This is exactly why `ListAdapter` exists — it wraps `AsyncListDiffer` internally, which moves the diff calculation to a background thread. When you call `submitList()`, the diff is computed off the main thread, and only the resulting update operations (insert, remove, move) are dispatched back on the main thread. For most apps, `ListAdapter` is the right choice. You get background diffing for free, you get `getItem()` and `getItemCount()` handled automatically, and your adapter code stays minimal.

> **🔥 Real talk:** The one gotcha with `submitList()` that has burned almost everyone at least once: if you submit the same list instance with modified contents, nothing happens. `AsyncListDiffer` does a reference equality check first — if the new list `===` the old list, it short-circuits and skips diffing entirely. This is the number one source of "my list won't update" bugs. Always submit a new list instance, which is natural if you're using immutable data classes and `copy()`.

## Sharing RecycledViewPools

Imagine you're building an app store feed — vertical scrolling with horizontal carousels of apps in each category. Every nested horizontal RecyclerView creates its own pool by default. So if you have 10 horizontal lists on screen, each showing product cards, that's 10 separate pools. When the user scrolls vertically and a new horizontal list appears, its pool is completely empty, so every single item gets inflated from scratch.

That's like opening 10 separate kitchens in your restaurant, each with its own set of plates. A plate that gets cleared from kitchen #1 just sits there while kitchen #3 is frantically making new plates from scratch. On a mid-range device, inflating 5-6 product cards simultaneously easily blows your frame budget.

The fix is `setRecycledViewPool()`. You create a single shared pool — one big kitchen — and assign it to every nested RecyclerView that uses the same view types. Now when a horizontal list scrolls off-screen, its ViewHolders go into the shared pool. When a new horizontal list appears below, it pulls already-inflated ViewHolders from that same shared pool instead of inflating new ones.

```kotlin
class FeedAdapter : ListAdapter<FeedSection, FeedViewHolder>(FeedDiffCallback()) {
    // One shared pool for all nested horizontal RecyclerViews
    private val sharedProductPool = RecyclerView.RecycledViewPool().apply {
        setMaxRecycledViews(VIEW_TYPE_PRODUCT, 15)
    }

    override fun onBindViewHolder(holder: FeedViewHolder, position: Int) {
        val section = getItem(position)
        holder.horizontalRecyclerView.apply {
            setRecycledViewPool(sharedProductPool)
            adapter = ProductRowAdapter().also { it.submitList(section.products) }
        }
    }
}
```

In a feed with 8 horizontal carousels, sharing the pool cut the total number of inflations from around 60 to 15 during the first full scroll — the rest were pool hits that only needed rebinding. On a Samsung A13, that dropped the P95 frame time from 35ms to 18ms. The key detail: call `setMaxRecycledViews()` to increase the pool size beyond the default 5, because with multiple nested lists competing for the same pool, 5 ViewHolders drains instantly.

## LazyColumn Stable Keys and Content Types

LazyColumn flips the whole model. Instead of recycling View objects, it manages composition state — it composes items as they become visible and disposes of them as they scroll off. Different mechanism, but the same fundamental question: how does the framework know which items are which?

That's where the `key` parameter comes in, and it's the single most important performance lever you have. Without stable keys, LazyColumn identifies items by index position. Now think about what happens when you insert an item at position 0: every other item shifts down by one. From LazyColumn's perspective, position 0 has new data, position 1 has new data, position 2 has new data... every visible item "changed" and needs recomposition. That's the Compose equivalent of calling `notifyDataSetChanged()`.

```kotlin
// BAD: no keys — insertion at index 0 recomposes everything
LazyColumn {
    items(products) { product ->
        ProductCard(product)
    }
}

// GOOD: stable keys — only the new item composes
LazyColumn {
    items(
        items = products,
        key = { product -> product.id },
        contentType = { "product" },
    ) { product ->
        ProductCard(product)
    }
}
```

With stable keys, LazyColumn tracks each item by its key and limits recomposition to items that actually changed. In a list with 50 items where you add one at the top, the difference is between recomposing 1 item versus all visible items — easily the difference between a 4ms frame and a 30ms frame.

> **🧠 Think about it:** `contentType` maps directly to RecyclerView's view types. Can you guess why that matters? If you don't tell LazyColumn what "type" each item is, it might try to reuse a product card's composition slot for a banner ad — and waste time diffing two completely incompatible composable trees.

When you specify content types, LazyColumn can reuse compositions efficiently — a disposed product card's composition slot table gets reused when another product card appears, which is significantly faster than composing from scratch. I measured this on a feed with 4 content types: adding `contentType` dropped P95 frame times from 22ms to 14ms — a 36% improvement entirely from better composition reuse.

## LazyColumn Item Animations

If you've ever tried to customize `ItemAnimator` in RecyclerView, you know the pain. You either use `DefaultItemAnimator` and accept whatever it gives you, or you spend an entire day subclassing it. Compose 1.7 introduced `animateItem()`, and honestly, it feels like cheating by comparison. One modifier. All three animation types — fade in, fade out, placement. Done.

```kotlin
LazyColumn {
    items(
        items = products,
        key = { it.id },
        contentType = { "product" },
    ) { product ->
        ProductCard(
            product = product,
            modifier = Modifier.animateItem(
                fadeInSpec = tween(durationMillis = 250),
                fadeOutSpec = tween(durationMillis = 100),
                placementSpec = spring(
                    stiffness = Spring.StiffnessLow,
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                ),
            ),
        )
    }
}
```

The important detail: `animateItem()` requires stable keys to work. Without keys, Compose can't track which item moved where, so the animations either don't trigger or look wrong. This is another reason why keys aren't optional — they're the foundation that both diffing and animations depend on.

Performance-wise, `animateItem()` is lightweight because it operates on already-composed content. It's not recomposing anything; it's animating the placement and alpha of existing layout nodes. I haven't seen it add more than 1-2ms to frame times even with 10+ items animating simultaneously, which is a significant improvement over `ItemAnimator` implementations that often trigger extra layout passes.

## Prefetch and Nested Scrolling

Both RecyclerView and LazyColumn try to be clever about prefetching items ahead of the scroll direction. RecyclerView's `GapWorker` uses idle time between frames to inflate and bind the next items before you need them. LazyColumn's `LazyListPrefetchStrategy` prefetches based on scroll velocity, and starting with Compose 1.7, the system is configurable for complex scrolling patterns.

But here's the trap: **prefetch only helps if the creation work completes within idle time.** If your item takes 8ms to create and your frames are already at 12-14ms, there's no idle time left. It's like trying to prep tomorrow's lunch during your break, but you don't get a break because today's lunch is already running behind. Prefetch is a scheduling optimization, not a performance optimization.

> **💡 The "aha" moment:** The single most common performance catastrophe in list-heavy apps is nesting a LazyColumn inside a scrollable `Column`. This forces the LazyColumn to measure **all** items at once to report its total height, completely defeating lazy composition. It's like going to a buffet and being told you have to eat everything before they let you sit down.

For a list of 500 items, that means hundreds of milliseconds in a single frame. Your app freezes on launch and you're left wondering why.

```kotlin
// BAD: LazyColumn inside scrollable Column — all items composed at once
Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
    Text("Header")
    LazyColumn(modifier = Modifier.height(400.dp)) {
        items(500) { index -> ListItem(index) }
    }
    Text("Footer")
}

// GOOD: single LazyColumn with different item types
LazyColumn {
    item { Text("Header") }
    items(500) { index -> ListItem(index) }
    item { Text("Footer") }
}
```

The fix is always the same: use a single LazyColumn and put your header and footer as separate `item` blocks. Everything stays lazy, everything stays fast.

For nested horizontal lists inside a vertical list, each LazyRow maintains its own composition state. The tradeoff is memory — in a vertical list with 20 horizontal lists of 30 items each, that's potentially 600 items tracked. If you're seeing memory pressure, consider limiting items per horizontal list or flattening to a `LazyVerticalGrid`.

## Measuring What Matters

You can't fix what you can't measure. The definitive way to measure list performance is `FrameTimingMetric` from the Macrobenchmark library. I test both scroll directions because scrolling back up exercises different code paths — cache hits in RecyclerView, composition reuse in LazyColumn.

```kotlin
@Test
fun scrollFeedPerformance() {
    benchmarkRule.measureRepeated(
        packageName = "com.example.shopapp",
        metrics = listOf(FrameTimingMetric()),
        iterations = 5,
        compilationMode = CompilationMode.Partial(
            baselineProfile = BaselineProfileMode.Require
        ),
    ) {
        startActivityAndWait()
        val feed = device.findObject(By.res("main_feed"))
        feed.setGestureMargin(device.displayWidth / 5)
        repeat(3) { feed.fling(Direction.DOWN); device.waitForIdle() }
        repeat(3) { feed.fling(Direction.UP); device.waitForIdle() }
    }
}
```

My targets are P50 under 8ms and P95 under 16ms. If P95 exceeds 16ms, I trace with Perfetto to identify which phase — composition, layout, or draw in Compose; inflate, bind, or layout in RecyclerView — is consuming the frame budget.

> **⚡ Quick check:** What device are you benchmarking on? If you said "my Pixel 7," we need to talk. The mistake I made early on was measuring only on fast devices. Our Pixel 7 showed P95 of 9ms. The Samsung A13 showed P95 of 28ms for the exact same list. Always benchmark on the device tier your P50 user actually owns, not the device in your pocket. The numbers that matter are the ones your real users experience.

And here we are done!
Thanks for reading!
