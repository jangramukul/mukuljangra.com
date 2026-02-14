---
title: Bitmap and Image Loading Performance
layout: post
categories: post
tags:
  - Android
  - Performance
---

A few months ago, I was debugging a news feed app that kept crashing on mid-range devices. The crash logs all pointed to the same thing — `OutOfMemoryError` in `BitmapFactory.decodeStream`. The feed loaded high-resolution editorial images, and the code was decoding them at full size into `ImageView`s that were 360dp wide. On a 1080p device, that's 1080 pixels wide — but the source images were 4000+ pixels. Every single image was being decoded at its original resolution, held in memory, and the app was burning through the heap in seconds during a fast scroll.

The fix took about 20 minutes once I understood the problem. But the root cause wasn't a missing library or a bad API call — it was a fundamental misunderstanding of how much memory a bitmap actually consumes. Most Android developers treat images as "files you load and display." But here's the thing — images are the single largest consumer of memory in most Android apps. A single uncompressed 4K photo (3840×2160) at ARGB_8888 takes **33,177,600 bytes — roughly 31.6 MB** of RAM. Three of those in a RecyclerView, and you've consumed nearly 100 MB of heap on a device that might only have 256 MB allocated to your app. Most OOM crashes I've investigated trace back to images.

## The Memory Math

Before looking at any API, it's worth understanding the raw numbers. A bitmap in memory is a flat array of pixels. Each pixel takes a fixed number of bytes depending on the color format. The formula is straightforward: **width × height × bytes-per-pixel**. For `ARGB_8888`, each pixel uses 4 bytes (one byte each for alpha, red, green, blue). For `RGB_565`, each pixel uses 2 bytes (5 bits red, 6 bits green, 5 bits blue — no alpha).

So a 4000×3000 photo at ARGB_8888 costs 4000 × 3000 × 4 = 48,000,000 bytes — about **45.7 MB**. That same image at RGB_565 costs 4000 × 3000 × 2 = 24,000,000 bytes — about **22.8 MB**. Still enormous. The JPEG on disk might be 3 MB, but the decoded bitmap is 15× larger because JPEG compression doesn't apply in memory — every pixel needs its full color representation available for the GPU to render.

This is why image sizing matters more than almost any other optimization in an Android app. You could spend weeks optimizing your coroutine dispatching or reducing your startup time by 50 ms, and a single improperly sized image will dwarf all those gains. I've seen apps where fixing image loading alone reduced peak memory usage by 200 MB.

## BitmapFactory.Options — The Decoding Pipeline

`BitmapFactory` is the low-level entry point for image decoding on Android. What most developers don't realize is that decoding happens in **two distinct passes** when you use `BitmapFactory.Options` properly.

The first pass is the **bounds-only pass**. You set `inJustDecodeBounds = true`, and BitmapFactory reads just enough of the file to extract the width, height, and MIME type — without allocating any pixel memory. This is cheap. On a 12 MP JPEG, the bounds pass takes under 1 ms because it only reads the file header.

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

The second pass is the **pixel pass** — the actual decode where memory gets allocated and pixels get written. This is where `inSampleSize`, `inPreferredConfig`, and other options control how much memory that allocation costs. The key insight is that you should always do the bounds pass first, calculate the appropriate sample size, then do the pixel pass. Skipping the bounds pass means you're guessing, and guessing about memory is how apps crash.

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

`inSampleSize` tells the decoder to load every Nth pixel in each dimension. An `inSampleSize` of 4 means the resulting bitmap is 1/4 the width and 1/4 the height — so 1/16 the total pixels and 1/16 the memory. But here's the part the documentation glosses over: **`inSampleSize` only works efficiently with powers of 2** (1, 2, 4, 8, 16...). If you pass 3, the decoder rounds it down to 2. If you pass 5, it rounds down to 4.

This isn't arbitrary. JPEG decompression works with 8×8 pixel blocks (DCT blocks), and the IDCT (Inverse Discrete Cosine Transform) algorithm can skip coefficients at power-of-2 boundaries efficiently. Decoding at 1/2, 1/4, or 1/8 scale means the decoder can skip entire frequency components during decompression — it literally does less math per block. A non-power-of-2 sample size would require the decoder to fully decompress and then downsample, which defeats the purpose.

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

## ARGB_8888, RGB_565, and Hardware Bitmaps

Android supports several pixel formats, and the choice directly impacts memory and visual quality. The three that matter in practice are `ARGB_8888`, `RGB_565`, and hardware bitmaps.

**ARGB_8888** is the default and the safest choice. Four bytes per pixel, full alpha channel, 8 bits per color channel — 16.7 million colors. Every Canvas operation, every shader, every blend mode works correctly with this format. The cost is memory: it's the most expensive format per pixel.

**RGB_565** cuts memory usage exactly in half — 2 bytes per pixel instead of 4. But you lose the alpha channel entirely (no transparency) and color precision drops significantly. Red gets 5 bits (32 levels), green gets 6 bits (64 levels), blue gets 5 bits (32 levels). That's 65,536 total colors instead of 16.7 million. For photographic content in opaque containers, RGB_565 can look acceptable. But for gradients, subtle color transitions, or anything overlapping other content, you'll see banding artifacts. I used RGB_565 aggressively in one project to reduce memory pressure, and the QA team flagged visible banding on gradient backgrounds within a week. It's a valid optimization for thumbnails and preview images, but not for primary content display.

**Hardware bitmaps** (`Bitmap.Config.HARDWARE`) are the most interesting option and the least understood. A hardware bitmap stores its pixel data in **GPU memory** (specifically in a `GraphicBuffer` or `AHardwareBuffer` on newer API levels), not on the Java heap. This means a hardware bitmap doesn't count against your app's heap limit. For a memory-constrained app, this is a massive win — you can have dozens of large images loaded with zero heap pressure.

But hardware bitmaps come with hard restrictions. You cannot call `getPixels()`, `setPixels()`, or draw to a hardware bitmap with `Canvas`. Any operation that needs CPU-side pixel access will throw an `IllegalStateException`. You can't use them as input for `RenderScript` or `Palette`. If you need to mutate a bitmap — draw text on it, apply a color filter programmatically, composite multiple images — you must use a software bitmap. Glide and Coil both default to hardware bitmaps when they detect the image will only be displayed (not mutated), which is the right default for most use cases.

## How Coil and Glide Approach Sizing

Both Coil and Glide solve the same core problem — decode the image at the right size for its display container — but they approach it differently, and the difference matters for performance.

**Glide measures the ImageView before requesting.** When you call `Glide.with(context).load(url).into(imageView)`, Glide attaches a `ViewTreeObserver.OnPreDrawListener` to the ImageView. It waits until the View has been laid out and has a measured width and height, then uses those pixel dimensions as the target size for decoding. This means Glide always knows the exact pixel size of the destination before it starts the network request or disk decode. The downside is that it adds a frame of latency — the image request doesn't fire until after the first layout pass. For RecyclerView items that are laid out off-screen, this is usually fine. But for hero images that need to appear instantly, that extra frame can feel sluggish.

**Coil in Compose uses the composable's constraints.** When you use `AsyncImage` or `rememberAsyncImagePainter`, Coil reads the `Constraints` from the composable's layout — specifically the `maxWidth` and `maxHeight` from the parent's measurement. In Compose, this happens during composition and layout, which means the size is available earlier than in the View system. But there's a subtlety: if the parent doesn't provide bounded constraints (like a `LazyColumn` with unbounded height), Coil may not know the target size and will fall back to using the original image dimensions or the screen size. This can cause oversized decodes in scrolling lists where the container constraints aren't well-defined.

Coil's lazy sizing in Compose can also cause **recomposition flicker**. The `AsyncImage` composable first composes with a placeholder (or empty space), then recomposes when the image loads. If the image's intrinsic aspect ratio differs from the composable's constraints, you might see a layout shift. Glide's view-based approach doesn't have this problem because the ImageView's dimensions are fixed before the image loads. In Compose, you can mitigate this by specifying explicit sizes on your `AsyncImage` or by providing a placeholder with the correct aspect ratio using `ContentScale.Crop` or a `Modifier.aspectRatio`.

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

Here's something that doesn't come up in most image loading discussions but causes real jank in production: **the GPU upload cost of a software bitmap**. When a software bitmap (one stored in heap memory) needs to be drawn on screen, the pixel data has to be uploaded from CPU memory to GPU memory. This happens via `glTexImage2D` (or its Vulkan equivalent), and it's not free.

The upload cost scales linearly with bitmap size. In my measurements using Perfetto traces, a 1080×1920 ARGB_8888 bitmap (about 8 MB) takes roughly **2-4 ms** to upload to the GPU on a mid-range device. That's a significant chunk of your 16.6 ms frame budget. A 2160×3840 bitmap can take 6-8 ms. If you're scrolling through a list and every new item triggers a GPU upload for a freshly decoded bitmap, you'll see consistent frame drops.

Hardware bitmaps avoid this entirely because the pixel data already lives in GPU-accessible memory — there's no upload step. This is one of the strongest arguments for using hardware bitmaps as the default: not just the heap savings, but the elimination of GPU upload jank during scrolling. Glide enables hardware bitmaps by default on API 26+ for exactly this reason. Coil does the same.

If you can't use hardware bitmaps (because you need to mutate the bitmap or support API < 26), the mitigation is to upload bitmaps ahead of time rather than during the scroll. You can force an early upload by drawing the bitmap to an off-screen `RenderNode` or by using `prepareToDraw()` on API 31+:

```kotlin
// Force GPU upload before the bitmap enters the visible area
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    bitmap.prepareToDraw()
}
```

This doesn't eliminate the upload cost, but it shifts it out of the scroll path. Combined with RecyclerView prefetching, you can hide most of the upload latency.

## Sizing Strategy for Different Screen Densities

One mistake I see often is requesting the same image URL regardless of screen density. A 1440×2560 (QHD) phone needs very different image data than a 720×1280 (HD) phone. Loading a QHD-sized image on an HD device wastes bandwidth, memory, and decode time. Loading an HD image on a QHD device looks blurry.

The right approach is to calculate the target pixel size based on the view's actual pixel dimensions, not its dp dimensions. A 360dp-wide ImageView is 720 pixels on an xhdpi (2x) screen, 1080 pixels on an xxhdpi (3x) screen, and 1440 pixels on a xxxhdpi (4x) screen. Your image CDN should serve different resolutions, and your app should request the right one.

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

The cap at screen width is important. There's no point decoding a 4000px image on a 1080px screen — the extra pixels are invisible and just waste memory. I've seen apps that faithfully decoded full-resolution images because "the quality might matter someday." It doesn't. The screen is the bottleneck, and pixels beyond the screen resolution are pure waste.

For practical image request sizing, the pattern I've settled on is: compute the target pixel dimensions, round up to the nearest power-of-2-friendly size (so `inSampleSize` lands cleanly), and use that as both the CDN request size and the decode target. This way, the bytes over the network, the decode work, and the final bitmap size all align — no wasted bandwidth, no wasted memory, no unnecessary resize steps.

IMO, the biggest performance lever in most Android apps isn't some clever algorithm or architecture pattern — it's getting image sizes right. A properly sized image pipeline saves more memory, more CPU time, and more frame budget than almost any other single optimization. The difference between an app that loads 45 MB bitmaps and one that loads 300 KB bitmaps for the same visual result is the difference between an app that crashes and one that scrolls at 60 fps. Every Android developer should understand the memory math, the decode pipeline, and the tradeoffs between pixel formats. It's not glamorous work, but it's the work that keeps apps alive on real devices.

Thanks for reading through all of this :), Happy Coding!
