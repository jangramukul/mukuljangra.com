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

**The attached scrap list** holds ViewHolders that are still on screen but being repositioned — like during a layout pass triggered by `notifyItemMoved`. Views in the scrap are reused without rebinding because their data hasn't changed. This is the cheapest "recycle."

**The cached views list** (default size: 2) holds recently detached ViewHolders by position. When a view scrolls off the top and a new position near the top is needed, RecyclerView checks if the cached view was for that exact position. If it matches, the view is reattached without calling `onBindViewHolder`. This is why scrolling back to a recently-viewed position is faster than scrolling to a new one — the ViewHolder might still be in the cache with its data intact.

**The RecycledViewPool** holds ViewHolders organized by view type. When a view scrolls off-screen and the cache is full, the ViewHolder goes to the pool. When a new view is needed and the cache doesn't have a match, the pool provides a ViewHolder of the correct type. But this ViewHolder needs rebinding — `onBindViewHolder` will be called. The pool's default size is 5 per view type.

**The ViewCacheExtension** is a hook for custom caching — most apps don't use it.

The performance implications are clear. **Inflation is the most expensive operation** — creating a new ViewHolder from XML costs 1-5ms depending on layout complexity. Pool recycling is cheaper because the view already exists but still requires binding (0.5-2ms). Cache hits are almost free because neither inflation nor binding is needed. The goal is to maximize cache hits and pool recycling while minimizing inflation.

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
        // Avoid heavy computation, image decoding, or IO here
        val product = getItem(position)
        holder.binding.productName.text = product.name
        holder.binding.productPrice.text = product.formattedPrice
        // Let image loading library handle async loading
        imageLoader.load(product.imageUrl).into(holder.binding.productImage)
    }
}
```

## DiffUtil Deep Dive

DiffUtil is what makes RecyclerView updates efficient — instead of calling `notifyDataSetChanged()` (which throws away all ViewHolders and recreates everything), DiffUtil calculates the minimum set of insertions, removals, and moves needed to transform the old list into the new list. It uses Eugene Myers' difference algorithm, which runs in O(N + D²) time where N is the total number of items and D is the number of differences.

The critical part is implementing `DiffUtil.ItemCallback` correctly. There are two methods and they serve different purposes:

```kotlin
class ProductDiffCallback : DiffUtil.ItemCallback<Product>() {
    override fun areItemsTheSame(oldItem: Product, newItem: Product): Boolean {
        // Identity check: is this the same logical item?
        // MUST use a stable identifier, NOT object equality
        return oldItem.id == newItem.id
    }

    override fun areContentsTheSame(oldItem: Product, newItem: Product): Boolean {
        // Content check: has anything visible changed?
        // Only called if areItemsTheSame returns true
        return oldItem == newItem
    }
}
```

`areItemsTheSame` determines whether two items represent the same entity — it should compare a stable, unique ID. `areContentsTheSame` determines whether the item's visible content has changed — it typically uses `equals()` on the full data class. The algorithm calls `areItemsTheSame` first, and only if it returns true, calls `areContentsTheSame`. If content is the same, the ViewHolder is moved without rebinding. If content changed, `onBindViewHolder` is called with the change payload.

Here's the mistake I see constantly: using `hashCode()` or object reference equality for `areItemsTheSame`. Both are wrong. `hashCode()` can collide between different items, causing DiffUtil to think two different items are the same — which produces bizarre visual glitches. Object reference equality (`===`) almost always returns false because your repository is creating new instances, which means DiffUtil treats every item as new and you lose all the animation and recycling benefits.

**Payloads** are the optimization most teams skip. When `areContentsTheSame` returns false, you can implement `getChangePayload` to tell DiffUtil exactly what changed. Then in `onBindViewHolder`, you only update the changed fields instead of rebinding the entire ViewHolder.

```kotlin
override fun getChangePayload(oldItem: Product, newItem: Product): Any? {
    return buildList {
        if (oldItem.price != newItem.price) add("price")
        if (oldItem.inStock != newItem.inStock) add("stock")
    }.ifEmpty { null }
}

// In adapter
override fun onBindViewHolder(holder: ProductViewHolder, position: Int, payloads: List<Any>) {
    if (payloads.isEmpty()) {
        onBindViewHolder(holder, position) // Full bind
        return
    }

    @Suppress("UNCHECKED_CAST")
    val changes = payloads.flatMap { it as List<String> }.toSet()
    val product = getItem(position)
    if ("price" in changes) holder.binding.productPrice.text = product.formattedPrice
    if ("stock" in changes) holder.binding.stockBadge.isVisible = product.inStock
}
```

In our product list, implementing payloads for price updates (which change frequently during flash sales) reduced the average bind time from 1.8ms to 0.3ms for those updates because we avoided rebinding the image and other expensive views.

## LazyColumn Stable Keys

LazyColumn is Compose's answer to RecyclerView, and it has a fundamentally different architecture. Instead of recycling View objects, LazyColumn manages composition state — it composes items as they become visible and disposes of them as they scroll off. The "recycling" equivalent is that disposed items' compositions can be partially reused if the same content type appears later.

The most important performance lever in LazyColumn is the `key` parameter. Without stable keys, LazyColumn identifies items by their index position. When you insert an item at position 0, every other item shifts down by one index. From LazyColumn's perspective, every single item changed because every index now maps to a different item. This means every visible item gets recomposed — the equivalent of `notifyDataSetChanged`.

```kotlin
// BAD: no keys — insertion at index 0 recomposes everything
LazyColumn {
    items(products) { product ->
        ProductCard(product)
    }
}

// GOOD: stable keys — insertion at index 0 only composes the new item
LazyColumn {
    items(
        items = products,
        key = { product -> product.id },
    ) { product ->
        ProductCard(product)
    }
}
```

With stable keys, LazyColumn tracks each item by its key. When the list changes, it knows which items are new, which moved, and which are unchanged — similar to what DiffUtil does for RecyclerView. The recomposition scope is limited to items that actually changed. In a list with 50 items where you add one new item at the top, the difference is between recomposing 1 item (with keys) versus recomposing all visible items (without keys). That's easily the difference between a 4ms frame and a 30ms frame.

## Content Types in LazyColumn

LazyColumn has a feature that maps directly to RecyclerView's view types: `contentType`. When you specify content types, LazyColumn can reuse compositions more efficiently across items of the same type.

```kotlin
LazyColumn {
    items(
        items = feedItems,
        key = { it.id },
        contentType = { item ->
            when (item) {
                is FeedItem.ProductCard -> "product"
                is FeedItem.BannerAd -> "banner"
                is FeedItem.CategoryHeader -> "header"
                is FeedItem.ReviewSection -> "review"
            }
        },
    ) { item ->
        when (item) {
            is FeedItem.ProductCard -> ProductCard(item)
            is FeedItem.BannerAd -> BannerAdCard(item)
            is FeedItem.CategoryHeader -> CategoryHeader(item)
            is FeedItem.ReviewSection -> ReviewSection(item)
        }
    }
}
```

Without `contentType`, LazyColumn treats all items as the same type. When a product card scrolls off and a banner ad needs to appear, the composition from the product card is disposed and a completely new composition starts for the banner ad. With `contentType`, LazyColumn knows these are different types and won't try to reuse a product composition for a banner, avoiding the overhead of diffing incompatible composable trees. More importantly, when another product card appears, it can reuse the disposed product composition's slot table, which is significantly faster than composing from scratch.

I measured this on a feed with 4 content types. Without `contentType`, scrolling through a mixed feed showed P95 frame times of 22ms. With `contentType` specified, P95 dropped to 14ms — a 36% reduction. The improvement comes entirely from better composition reuse.

## Prefetch Strategies

Both RecyclerView and LazyColumn prefetch items ahead of the scroll direction to avoid creating views/compositions during the frame when they become visible. The mechanics are different, but the goal is the same: do the expensive work before the user scrolls far enough to see the empty space.

RecyclerView's `GapWorker` prefetches during idle time between frames. When the system finishes a frame early (in less than 16ms), the GapWorker uses the remaining time to inflate and bind the next items. You can control this through `LayoutManager.setItemPrefetchEnabled()` and by overriding `collectAdjacentPrefetchPositions()`. For most apps, the default prefetching works well.

LazyColumn's prefetch is built into `LazyListPrefetchStrategy`. The default strategy prefetches items that are about to become visible based on scroll velocity. Starting with Compose 1.7, the prefetch system was rearchitected to be more configurable — you can now create custom strategies for complex scrolling patterns.

But here's the trap with both systems: **prefetch only helps if the creation/binding work is fast enough to complete in the idle time between frames.** If your item takes 8ms to create, the prefetch needs at least one full idle frame to complete. If your frames are already tight (12-14ms), there isn't enough idle time, and the prefetch either doesn't complete or competes with the next frame's rendering work. This is why optimizing individual item performance is still critical even with prefetching — prefetch is a scheduling optimization, not a performance optimization.

## The Nested Scrolling Trap

The single most common performance mistake I see in list-heavy apps is nested scrolling containers — a LazyColumn inside a scrollable Column, or a horizontal RecyclerView inside a vertical RecyclerView. These seem convenient but create severe performance problems.

When you put a LazyColumn inside a vertically scrollable container (like a `Column` with `verticalScroll`), the outer container needs to know the LazyColumn's total height to calculate its own scroll bounds. This forces the LazyColumn to measure **all** its items at once, completely defeating lazy composition. Instead of composing only visible items, every single item gets composed and measured in one frame. For a list of 500 items, this can take hundreds of milliseconds and cause visible freezing.

```kotlin
// BAD: LazyColumn inside scrollable Column — all items composed at once
Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
    Text("Header")
    LazyColumn(modifier = Modifier.height(400.dp)) {
        items(500) { index ->
            ListItem(index) // All 500 composed immediately
        }
    }
    Text("Footer")
}

// GOOD: single LazyColumn with different item types
LazyColumn {
    item { Text("Header") }
    items(500) { index ->
        ListItem(index) // Only visible items composed
    }
    item { Text("Footer") }
}
```

For nested horizontal lists inside a vertical list (a common pattern for app stores or media apps), each horizontal list should have its own state that survives scrolling. In RecyclerView, this means saving and restoring the horizontal scroll position in the ViewHolder. In LazyColumn, use `rememberSaveable` with the item's key to preserve the horizontal scroll state.

```kotlin
LazyColumn {
    items(
        items = categories,
        key = { it.id },
    ) { category ->
        Text(
            text = category.name,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(16.dp),
        )

        val listState = rememberLazyListState()
        LazyRow(state = listState) {
            items(
                items = category.products,
                key = { it.id },
            ) { product ->
                ProductThumbnail(product)
            }
        }
    }
}
```

The tradeoff with nested lazy lists is memory — each horizontal LazyRow maintains its own composition state. In a vertical list with 20 horizontal lists of 30 items each, that's potentially 600 items being tracked. This is usually fine because only visible items are composed, but the metadata overhead adds up. If you're seeing memory pressure, consider limiting the maximum items in each horizontal list or using a single flat grid with `LazyVerticalGrid` if the UI allows it.

## Measuring Frame Timing for Lists

The definitive way to measure list performance is `FrameTimingMetric` from the Macrobenchmark library. I run this test for every list-heavy screen before release:

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

        repeat(3) {
            feed.fling(Direction.DOWN)
            device.waitForIdle()
        }

        repeat(3) {
            feed.fling(Direction.UP)
            device.waitForIdle()
        }
    }
}
```

I test both directions because scrolling back up exercises different code paths — cache hits in RecyclerView, composition reuse in LazyColumn. The P95 metric is what I care about. P50 is almost always fine; the jank happens in the tail. My targets are P50 under 8ms and P95 under 16ms. If P95 exceeds 16ms, I trace with Perfetto to identify which phase (composition, layout, or draw in Compose; inflate, bind, or layout in RecyclerView) is consuming the frame budget.

The mistake I made early on was measuring only on fast devices. Our Pixel 7 showed P95 of 9ms. The Samsung A13 showed P95 of 28ms for the same list. The mid-range device exposed the problem; the flagship hid it. Always benchmark on the device tier your P50 user actually owns, not the device in your pocket.

And here we are done!
Thanks for reading!
