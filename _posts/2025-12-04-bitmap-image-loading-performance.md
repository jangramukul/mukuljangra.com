---
title: Bitmap and Image Loading Performance
layout: post
categories: post
tags:
  - Android
  - Performance
---

A few months ago, I was debugging a news feed app that kept crashing on mid-range devices. The crash logs all pointed to `OutOfMemoryError` in `BitmapFactory.decodeStream`. The feed loaded high-resolution editorial images, and the code was decoding them at full size into `ImageView`s that were 360dp wide. On a 1080p device, that's 1080 pixels — but the source images were 4000+ pixels. Every image was decoded at its original resolution, and the app burned through the heap in seconds during a fast scroll.

The root cause wasn't a missing library — it was a fundamental misunderstanding of how much memory a bitmap consumes. Images are the single largest memory consumer in most Android apps. A single uncompressed 4K photo (3840×2160) at ARGB_8888 takes **31.6 MB** of RAM. Three of those in a RecyclerView, and you've consumed nearly 100 MB on a device that might only have 256 MB allocated to your app. Most OOM crashes I've investigated trace back to images.

## The Memory Math

Before looking at any API, it's worth understanding the raw numbers. A bitmap in memory is a flat array of pixels, and each pixel takes a fixed number of bytes depending on the color format: **width × height × bytes-per-pixel**. For `ARGB_8888`, each pixel uses 4 bytes. For `RGB_565`, each pixel uses 2 bytes.

So a 4000×3000 photo at ARGB_8888 costs about **45.7 MB**. That same image at RGB_565 costs about **22.8 MB**. The JPEG on disk might be 3 MB, but the decoded bitmap is 15× larger because JPEG compression doesn't apply in memory — every pixel needs its full color representation for the GPU to render. I've seen apps where fixing image loading alone reduced peak memory usage by 200 MB.

## BitmapFactory.Options — The Decoding Pipeline

`BitmapFactory` is the low-level entry point for image decoding on Android. Decoding happens in **two distinct passes** when you use `BitmapFactory.Options` properly. The first is the **bounds-only pass** — set `inJustDecodeBounds = true`, and BitmapFactory reads just enough of the file to extract the width, height, and MIME type without allocating any pixel memory. On a 12 MP JPEG, this takes under 1 ms.

```kotlin
fun getImageDimensions(context: Context, uri: Uri): Pair<Int, Int> {
    val options = BitmapFactory.Options().apply {
        inJustDecodeBounds = true
    }
    context.contentResolver.openInputStream(uri)?.use { stream ->
        BitmapFactory.decodeStream(stream, null, options)
    }
    // No pixels allocated — just metadata
    return options.outWidth to options.outHeight
}
```

The second pass is the **pixel pass** where memory gets allocated and pixels get written. You should always do the bounds pass first, calculate the sample size, then do the pixel pass. Skipping it means you're guessing, and guessing about memory is how apps crash.

```kotlin
fun decodeSampledBitmap(
    context: Context,
    uri: Uri,
    targetWidth: Int,
    targetHeight: Int
): Bitmap? {
    val options = BitmapFactory.Options()

    // Pass 1: read dimensions only
    options.inJustDecodeBounds = true
    context.contentResolver.openInputStream(uri)?.use { stream ->
        BitmapFactory.decodeStream(stream, null, options)
    }

    // Calculate sample size based on target dimensions
    options.inSampleSize = calculateInSampleSize(
        options.outWidth, options.outHeight,
        targetWidth, targetHeight
    )
    options.inJustDecodeBounds = false

    // Pass 2: decode with downsampling
    return context.contentResolver.openInputStream(uri)?.use { stream ->
        BitmapFactory.decodeStream(stream, null, options)
    }
}
```

Notice that you need to open the stream twice. The first stream is consumed by the bounds pass and can't be reused. This is a detail that catches people when working with `ContentResolver` URIs — you can't just `reset()` the stream in most cases.

## inSampleSize — Powers of 2 and Why

`inSampleSize` tells the decoder to load every Nth pixel in each dimension. An `inSampleSize` of 4 means the resulting bitmap is 1/4 the width and 1/4 the height — 1/16 the memory. But **`inSampleSize` only works efficiently with powers of 2** (1, 2, 4, 8, 16...). If you pass 3, the decoder rounds down to 2.

This isn't arbitrary. JPEG decompression works with 8×8 DCT blocks, and the IDCT algorithm can skip coefficients at power-of-2 boundaries efficiently. Decoding at 1/2 or 1/4 scale means the decoder literally does less math per block. A non-power-of-2 sample size would require full decompression followed by downsampling, defeating the purpose.

```kotlin
fun calculateInSampleSize(
    rawWidth: Int,
    rawHeight: Int,
    targetWidth: Int,
    targetHeight: Int
): Int {
    var inSampleSize = 1

    if (rawWidth > targetWidth || rawHeight > targetHeight) {
        val halfWidth = rawWidth / 2
        val halfHeight = rawHeight / 2

        // Find the largest power-of-2 sample size that keeps both
        // dimensions larger than the target
        while (halfWidth / inSampleSize >= targetWidth &&
               halfHeight / inSampleSize >= targetHeight) {
            inSampleSize *= 2
        }
    }
    return inSampleSize
}
```

The tradeoff is precision. Because you can only downsample by powers of 2, you often end up with a bitmap that's still larger than your target. A 4000px image targeted at 360px would get `inSampleSize = 8`, producing a 500px bitmap — not 360px. Libraries like Glide and Coil handle the remaining resize in a second step using `Bitmap.createScaledBitmap` or a `Matrix` transform. But that second step operates on the already-downsampled bitmap, so it's cheap.

### Downsampling Beyond inSampleSize

Here's where the image loading libraries diverge from raw `BitmapFactory`. `inSampleSize` is coarse — powers of 2 only — so both Glide and Coil implement their own downsampling strategies on top of it. Glide's `Downsampler` supports several strategies through `DownsampleStrategy`: `AT_LEAST` decodes to at least the target dimensions (useful when you plan to crop), `AT_MOST` guarantees the bitmap won't exceed the target on either axis, and `FIT_CENTER` scales to fit within the target bounds while preserving aspect ratio. Under the hood, Glide picks the best `inSampleSize` for a coarse decode, then applies a `Matrix` scale to hit the exact target.

Coil takes a similar two-step approach but integrates more tightly with Compose. It reads the composable's `Constraints` to compute the decode size, and respects the `Scale` parameter on `ImageRequest` — `Scale.FILL` behaves like center-crop, while `Scale.FIT` behaves like fit-center. If you don't set a scale explicitly, Coil infers it from the `ContentScale` on your `AsyncImage`, which keeps the sizing consistent with what Compose renders.

## inBitmap — Reusing Bitmap Memory

Every time `BitmapFactory` decodes an image, it allocates a new chunk of memory. In a scrolling list, that means dozens of allocations per second, each creating GC pressure. I've seen 4-6 ms GC pauses show up in Perfetto traces during a fling — enough to blow past the 16.6 ms frame budget.

`BitmapFactory.Options.inBitmap` solves this by telling the decoder to write pixels into an existing bitmap instead of allocating fresh memory. On API 19+, the `inBitmap` target just needs to be **the same size or larger** than the decoded output. Before API 19, it had to be exact same dimensions, which made it nearly useless.

```kotlin
class BitmapDecoder(private val reusableBitmap: Bitmap) {

    fun decodeWithReuse(
        context: Context,
        uri: Uri,
        targetWidth: Int,
        targetHeight: Int
    ): Bitmap? {
        val options = BitmapFactory.Options()

        options.inJustDecodeBounds = true
        context.contentResolver.openInputStream(uri)?.use { stream ->
            BitmapFactory.decodeStream(stream, null, options)
        }

        options.inSampleSize = calculateInSampleSize(
            options.outWidth, options.outHeight,
            targetWidth, targetHeight
        )
        options.inJustDecodeBounds = false
        // Reuse existing bitmap memory instead of allocating new
        options.inMutable = true
        options.inBitmap = reusableBitmap

        return context.contentResolver.openInputStream(uri)?.use { stream ->
            BitmapFactory.decodeStream(stream, null, options)
        }
    }
}
```

The key constraint is that `inBitmap` requires `inMutable = true` — hardware bitmaps can't be reused this way. If the reusable bitmap is too small, you'll get an `IllegalArgumentException`. In a custom image pipeline where you control decode sizes, `inBitmap` is one of the most effective ways to eliminate GC jank.

## Bitmap Pooling — What Glide Does Under the Hood

`inBitmap` solves the allocation problem for a single bitmap, but managing a pool of reusable bitmaps at scale is harder. This is what Glide's `BitmapPool` handles — specifically `LruBitmapPool`, an LRU cache of bitmaps keyed by their size and config. When a bitmap is no longer displayed (a RecyclerView item scrolls off-screen), Glide puts it back into the pool instead of letting GC collect it. When a new image needs decoding, Glide pulls a compatible bitmap from the pool and passes it as `inBitmap`.

Without pooling, scrolling through 50 images means 50 allocations and 50 GC events. With pooling, after the first screenful, most decodes reuse existing memory. In my profiling, bitmap pooling reduced GC pause time during a fast fling by roughly 60-70%. The pool uses LRU eviction with a configurable max size, so it doesn't grow unbounded.

```kotlin
// Glide's pooling in action — simplified view of what happens internally
// When a view is recycled:
val oldBitmap: Bitmap = imageView.drawable.toBitmap()
bitmapPool.put(oldBitmap) // Return to pool instead of GC

// When a new image needs decoding:
val reusable: Bitmap? = bitmapPool.get(targetWidth, targetHeight, config)
val options = BitmapFactory.Options().apply {
    inMutable = true
    inBitmap = reusable  // Reuse pooled memory
    inSampleSize = sampleSize
}
val decoded = BitmapFactory.decodeStream(stream, null, options)
```

If you're building a custom image pipeline, implement something similar. Even a simple `HashMap<Int, MutableList<Bitmap>>` keyed by byte count gives you most of the benefit.

## ARGB_8888, RGB_565, and Hardware Bitmaps

Android supports several pixel formats, and the choice directly impacts memory and visual quality. The three that matter in practice are `ARGB_8888`, `RGB_565`, and hardware bitmaps.

**ARGB_8888** is the default — 4 bytes per pixel, full alpha, 16.7 million colors. Every Canvas operation works correctly with it, but it's the most expensive format per pixel.

**RGB_565** cuts memory in half — 2 bytes per pixel — but drops the alpha channel and reduces to 65,536 colors. For photographic content in opaque containers it can look acceptable, but gradients will show banding artifacts. I used RGB_565 aggressively in one project, and the QA team flagged visible banding on gradient backgrounds within a week. Valid for thumbnails, not for primary content.

**Hardware bitmaps** (`Bitmap.Config.HARDWARE`) store pixel data in **GPU memory**, not on the Java heap. This means they don't count against your heap limit — a massive win for memory-constrained apps. But you cannot call `getPixels()`, `setPixels()`, or draw to them with `Canvas`. Any CPU-side pixel access throws `IllegalStateException`. Glide and Coil default to hardware bitmaps when the image will only be displayed, which is the right call. Worth noting: hardware bitmaps can't participate in `inBitmap` pooling since their memory isn't CPU-writable — you gain zero heap pressure but lose bitmap recycling across decodes.

## Transformation Caching — Why Your Rounded Corners Aren't Free

Here's something I didn't appreciate until I looked at Glide's cache key implementation: **transformations are part of the cache identity**. When you apply a `CircleCrop` or `RoundedCorners` transform, both Glide and Coil cache the transformed result, not just the raw decoded image — and the cache key includes the transformation parameters.

In Glide, the memory cache key is a composite of the source URL, target dimensions, and every transformation in the chain. So `load(url).centerCrop().transform(RoundedCorners(16))` produces a different cache entry from `load(url).centerCrop()`. Coil's `MemoryCache.Key` works the same way — it includes the data source, size parameters, and transformation class names. Both libraries also support disk caching of transformed results through Glide's `DiskCacheStrategy.ALL` and Coil's disk cache, meaning a circle-cropped thumbnail doesn't need to be re-decoded and re-transformed after a process death.

The practical implication: if your design uses inconsistent corner radii — 8dp here, 12dp there, 16dp on that screen — you're multiplying your cache footprint for the same source images. I've seen apps where normalizing corner radii across the design system cut memory cache usage by 30% just because identical transforms started producing cache hits.

## How Coil and Glide Approach Sizing

Both Coil and Glide solve the same core problem — decode the image at the right size for its display container — but they approach it differently, and the difference matters for performance.

**Glide measures the ImageView before requesting.** When you call `Glide.with(context).load(url).into(imageView)`, Glide attaches a `ViewTreeObserver.OnPreDrawListener` and waits until the View has been laid out to get the pixel dimensions. It always knows the exact size before starting the decode. The downside is one frame of latency — the request doesn't fire until after the first layout pass.

**Coil in Compose uses the composable's constraints.** `AsyncImage` reads the `Constraints` from the parent's measurement, which is available earlier than in the View system. But if the parent doesn't provide bounded constraints (like a `LazyColumn` with unbounded height), Coil may fall back to the screen size, causing oversized decodes. Coil's lazy sizing can also cause **recomposition flicker** — the composable first renders with a placeholder, then recomposes when the image loads. You can mitigate this by specifying explicit sizes or using `Modifier.aspectRatio`.

### Overriding target size

Both libraries let you override the target size explicitly, and for performance-critical paths, I recommend doing so. When you know the exact display size upfront — a thumbnail grid at 120×120dp, a card image at 360dp wide — specify it:

```kotlin
// Coil in Compose — explicit size override
AsyncImage(
    model = ImageRequest.Builder(LocalContext.current)
        .data(imageUrl)
        .size(360.dp.roundToPx(), 240.dp.roundToPx())
        .crossfade(true)
        .build(),
    contentDescription = "Article header",
    modifier = Modifier
        .fillMaxWidth()
        .height(240.dp),
    contentScale = ContentScale.Crop
)
```

```kotlin
// Glide with explicit override — skips the measure-and-wait step
Glide.with(context)
    .load(imageUrl)
    .override(targetWidthPx, targetHeightPx)
    .centerCrop()
    .into(imageView)
```

Explicit sizing removes the measurement delay in Glide and the constraint ambiguity in Coil. It also makes your memory usage predictable — you know exactly how large each decoded bitmap will be.

## GPU Upload Costs — The Hidden Jank Source

Here's something that causes real jank in production: **the GPU upload cost of a software bitmap**. When a software bitmap needs to be drawn on screen, the pixel data has to be uploaded from CPU memory to GPU memory via `glTexImage2D` (or its Vulkan equivalent). In my measurements using Perfetto, a 1080×1920 ARGB_8888 bitmap takes roughly **2-4 ms** to upload on a mid-range device — a significant chunk of your 16.6 ms frame budget.

Hardware bitmaps avoid this entirely because the pixel data already lives in GPU-accessible memory. This is one of the strongest arguments for hardware bitmaps as the default: not just heap savings, but elimination of GPU upload jank during scrolling. Both Glide and Coil enable hardware bitmaps by default on API 26+ for exactly this reason.

If you can't use hardware bitmaps, the mitigation is to upload ahead of time using `prepareToDraw()` on API 31+:

```kotlin
// Force GPU upload before the bitmap enters the visible area
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    bitmap.prepareToDraw()
}
```

This doesn't eliminate the upload cost, but it shifts it out of the scroll path. Combined with RecyclerView prefetching, you can hide most of the upload latency.

## Sizing Strategy for Different Screen Densities

One mistake I see often is requesting the same image URL regardless of screen density. A 360dp-wide ImageView is 720 pixels on xhdpi (2x), 1080 on xxhdpi (3x), and 1440 on xxxhdpi (4x). Your image CDN should serve different resolutions, and your app should request the right one based on actual pixel dimensions, not dp.

```kotlin
fun calculateTargetImageWidth(
    context: Context,
    viewWidthDp: Int
): Int {
    val density = context.resources.displayMetrics.density
    val targetWidthPx = (viewWidthDp * density).toInt()

    // Don't request more than the screen width —
    // no visual benefit beyond that
    val screenWidthPx = context.resources.displayMetrics.widthPixels
    return minOf(targetWidthPx, screenWidthPx)
}
```

The cap at screen width is important — there's no point decoding a 4000px image on a 1080px screen. The extra pixels are invisible and just waste memory. For practical sizing, the pattern I've settled on is: compute the target pixel dimensions, round up to the nearest power-of-2-friendly size (so `inSampleSize` lands cleanly), and use that as both the CDN request size and the decode target.

IMO, the biggest performance lever in most Android apps isn't some clever algorithm or architecture pattern — it's getting image sizes right. A properly sized image pipeline — one that downsamples efficiently, pools bitmap memory, caches transformations, and picks the right pixel format — saves more memory, more CPU time, and more frame budget than almost any other single optimization. The difference between an app that loads 45 MB bitmaps and one that loads 300 KB bitmaps for the same visual result is the difference between an app that crashes and one that scrolls at 60 fps. Every Android developer should understand the memory math, the decode pipeline, and the machinery that Glide and Coil build on top of it. It's not glamorous work, but it's the work that keeps apps alive on real devices.

Thanks for reading through all of this :), Happy Coding!
