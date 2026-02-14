---
title: RecyclerView and LazyColumn Performance Guide
layout: post
categories: post
tags:
  - Android
  - Performance
  - Jetpack Compose
---

The worst performance issue I ever shipped was a RecyclerView with 8 different view types, nested horizontal RecyclerViews, and a DiffUtil implementation that compared items by their hashCode instead of stable IDs. On a Pixel device, it scrolled fine. On a Samsung A12, every fling showed visible stutter — frame times spiking to 40-50ms. The fix wasn't a single change but a series of small ones, each shaving off a few milliseconds. That experience made me obsessive about list performance, and now I apply the same rigor to LazyColumn in Compose.

Lists are the most common source of scroll jank in Android apps because they combine three expensive operations in a tight loop: creating views or composables, binding data to them, and measuring/laying out the results — all within a 16ms frame budget. Both RecyclerView and LazyColumn have sophisticated internal machinery to make this work, but they make different tradeoffs. Understanding those internals is the difference between a list that scrolls at 60fps and one that stutters every time a new item appears.

## How RecyclerView Recycling Actually Works

RecyclerView's core insight is that off-screen views can be reused for new items instead of being inflated from scratch. But the recycling mechanism is more nuanced than "old view goes out, new view comes in." There are multiple caches, and understanding which cache your view comes from explains why some scroll operations are smooth and others aren't.

**The attached scrap list** holds ViewHolders that are still on screen but being repositioned — like during a layout pass triggered by `notifyItemMoved`. Views in the scrap are reused without rebinding because their data hasn't changed. **The cached views list** (default size: 2) holds recently detached ViewHolders by position. When a view scrolls off and a new position near the top is needed, RecyclerView checks if the cached view was for that exact position. If it matches, the view is reattached without calling `onBindViewHolder` — this is why scrolling back to a recently-viewed position feels faster.

**The RecycledViewPool** holds ViewHolders organized by view type. When a view scrolls off-screen and the cache is full, the ViewHolder goes to the pool. Retrieving from the pool requires rebinding via `onBindViewHolder`, but it's still cheaper than inflation. The pool's default size is 5 per view type. The performance implications are clear: **inflation is the most expensive operation** (1-5ms depending on layout complexity), pool recycling is moderate (0.5-2ms for binding), and cache hits are almost free because neither inflation nor binding is needed.

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

DiffUtil calculates the minimum set of insertions, removals, and moves needed to transform one list into another, using Eugene Myers' difference algorithm at O(N + D²) time. The critical part is implementing `DiffUtil.ItemCallback` correctly — `areItemsTheSame` compares stable IDs (not `hashCode()`, not `===`), and `areContentsTheSame` checks whether visible content changed. Only when `areItemsTheSame` returns true does the algorithm call `areContentsTheSame`.

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

The mistake I see constantly: using `hashCode()` for `areItemsTheSame`. Hash codes collide between different items, causing DiffUtil to think two items are the same — which produces bizarre visual glitches. Object reference equality (`===`) almost always returns false because your repository creates new instances, so DiffUtil treats every item as new and you lose all animation and recycling benefits.

**Payloads** are the optimization most teams skip. When `areContentsTheSame` returns false, `getChangePayload` tells DiffUtil exactly what changed. Then in `onBindViewHolder`, you only update those fields instead of rebinding the entire ViewHolder. In our product list, implementing payloads for price updates during flash sales reduced the average bind time from 1.8ms to 0.3ms because we avoided rebinding the image and other expensive views.

Here's the thing most developers miss about DiffUtil: it runs on the **main thread** by default when you call `DiffUtil.calculateDiff()` manually. For a list of 1000 items, that diff calculation can take 10-20ms and drop frames. This is exactly why `ListAdapter` exists — it wraps `AsyncListDiffer` internally, which moves the diff calculation to a background thread. When you call `submitList()`, the diff is computed off the main thread, and only the resulting update operations (insert, remove, move) are dispatched back on the main thread. For most apps, `ListAdapter` is the right choice. You get background diffing for free, you get `getItem()` and `getItemCount()` handled automatically, and your adapter code stays minimal.

The one gotcha with `submitList()`: if you submit the same list instance with modified contents, nothing happens. `AsyncListDiffer` does a reference equality check first — if the new list `===` the old list, it short-circuits and skips diffing entirely. This is a common source of "my list won't update" bugs. Always submit a new list instance, which is natural if you're using immutable data classes and `copy()`.

## Sharing RecycledViewPools

For feeds with nested horizontal RecyclerViews — think app stores, media apps, or social feeds with carousels — every nested RecyclerView creates its own pool by default. If you have 10 horizontal lists on screen, each showing product cards, that's 10 separate pools. When the user scrolls vertically and a new horizontal list appears, its pool is empty, so every single item gets inflated from scratch. On a mid-range device, inflating 5-6 product cards at once easily blows your frame budget.

The fix is `setRecycledViewPool()`. You create a single shared pool and assign it to every nested RecyclerView that uses the same view types. Now when a horizontal list scrolls off-screen, its ViewHolders go into the shared pool. When a new horizontal list appears below, it pulls already-inflated ViewHolders from that same pool instead of inflating new ones.

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

LazyColumn manages composition state instead of recycling View objects — it composes items as they become visible and disposes of them as they scroll off. The most important performance lever is the `key` parameter. Without stable keys, LazyColumn identifies items by index position. Insert an item at position 0 and every other item shifts — from LazyColumn's perspective, every visible item changed and needs recomposition. That's the equivalent of `notifyDataSetChanged`.

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

`contentType` maps directly to RecyclerView's view types. When you specify content types, LazyColumn can reuse compositions more efficiently — a disposed product card's composition slot table can be reused when another product card appears, which is significantly faster than composing from scratch. Without it, LazyColumn tries to reuse a product card composition for a banner ad, wasting time diffing incompatible composable trees. I measured this on a feed with 4 content types: adding `contentType` dropped P95 frame times from 22ms to 14ms — a 36% improvement entirely from better composition reuse.

## LazyColumn Item Animations

RecyclerView has `ItemAnimator` for animating insertions, removals, and moves — and customizing it has always been painful. You either use `DefaultItemAnimator` or spend a day subclassing it. Compose 1.7 introduced `animateItem()`, which makes list animations trivially simple and covers all three animation types (fade in, fade out, placement) with a single modifier.

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

The important detail: `animateItem()` requires stable keys to work. Without keys, Compose can't track which item moved where, so the animations either don't trigger or look wrong. This is another reason why keys aren't optional — they're the foundation that both diffing and animations depend on. Performance-wise, `animateItem()` is lightweight because it operates on already-composed content. It's not recomposing anything; it's animating the placement and alpha of existing layout nodes. I haven't seen it add more than 1-2ms to frame times even with 10+ items animating simultaneously, which is a significant improvement over `ItemAnimator` implementations that often trigger extra layout passes.

## Prefetch and Nested Scrolling

Both RecyclerView and LazyColumn prefetch items ahead of the scroll direction. RecyclerView's `GapWorker` uses idle time between frames to inflate and bind the next items. LazyColumn's `LazyListPrefetchStrategy` prefetches based on scroll velocity, and starting with Compose 1.7, the system is configurable for complex scrolling patterns. But here's the trap: **prefetch only helps if the creation work completes within idle time.** If your item takes 8ms to create and your frames are already at 12-14ms, there's no idle time left. Prefetch is a scheduling optimization, not a performance optimization.

The single most common performance mistake in list-heavy apps is nested scrolling containers. A LazyColumn inside a scrollable `Column` forces the LazyColumn to measure **all** items at once to report its total height, completely defeating lazy composition. For a list of 500 items, that means hundreds of milliseconds in a single frame.

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

For nested horizontal lists inside a vertical list, each LazyRow maintains its own composition state. The tradeoff is memory — in a vertical list with 20 horizontal lists of 30 items each, that's potentially 600 items tracked. If you're seeing memory pressure, consider limiting items per horizontal list or flattening to a `LazyVerticalGrid`.

## Measuring What Matters

The definitive way to measure list performance is `FrameTimingMetric` from the Macrobenchmark library. I test both scroll directions because scrolling back up exercises different code paths — cache hits in RecyclerView, composition reuse in LazyColumn.

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

My targets are P50 under 8ms and P95 under 16ms. If P95 exceeds 16ms, I trace with Perfetto to identify which phase — composition, layout, or draw in Compose; inflate, bind, or layout in RecyclerView — is consuming the frame budget. The mistake I made early on was measuring only on fast devices. Our Pixel 7 showed P95 of 9ms. The Samsung A13 showed P95 of 28ms for the same list. Always benchmark on the device tier your P50 user actually owns, not the device in your pocket.

And here we are done!
Thanks for reading!
