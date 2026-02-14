---
title: "Design an Image Loading Library"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 2
sequence: 56
description: "Designing an image loading library like Coil or Glide is one of the most common mobile system design questions."
---

## Design an Image Loading Library

Designing an image loading library like Coil or Glide tests caching, memory management, threading, and lifecycle awareness — all core Android concerns packed into one problem.

### Requirements & Scope

#### Q1: What are the core responsibilities of an image loading library?

Fetch an image from a source (network, disk, or memory), decode it into a bitmap, and display it in an ImageView or Composable. Beyond that, it manages caching at multiple levels, handles lifecycle (cancelling loads when the view is destroyed), manages threading, and provides placeholder/error states.

#### Q2: How would you design the public API?

Keep it simple for the common case and extensible for advanced use. A builder or DSL pattern works well.

```kotlin
// Simple usage
imageLoader.load("https://example.com/photo.jpg", imageView)

// Advanced usage with DSL
imageLoader.load(imageView) {
    url("https://example.com/photo.jpg")
    placeholder(R.drawable.placeholder)
    error(R.drawable.error)
    transformations(CircleCropTransformation())
    crossfade(300)
}
```

Internally, the library converts this into an `ImageRequest` data class that captures the source URL, target view, placeholder and error drawables, transformations, cache policy, and success/failure callbacks. That request object is what flows through the pipeline.

#### Q3: What platforms and use cases should the library support?

At minimum, support loading from network URLs, local files, and content URIs into `ImageView` targets. For Compose, provide an `AsyncImage` composable. Support cache control (skip memory cache, skip disk cache, force refresh), request cancellation, and image transformations. If you're designing for a real interview, start with the network-to-ImageView case and expand from there.

### High-Level Design

#### Q4: What does the overall loading pipeline look like?

**Request -> Memory Cache -> Disk Cache -> Network -> Decode -> Transform -> Cache -> Display**. When a request comes in, check the memory cache first — that's an instant bitmap return. On a miss, check the disk cache — that avoids a network round trip. On a disk miss, fetch from the network, decode the bytes into a bitmap, apply any transformations, write to both caches, and display. Each step short-circuits the pipeline if it produces a result.

#### Q5: How does the memory cache work?

Memory cache stores decoded bitmaps in RAM for instant access. It uses an LRU eviction policy — when the cache is full, the least recently accessed entry is removed.

```kotlin
class MemoryCache(maxSizeBytes: Int) {
    private val cache = object : LruCache<String, Bitmap>(maxSizeBytes) {
        override fun sizeOf(key: String, bitmap: Bitmap): Int {
            return bitmap.allocationByteCount
        }
    }

    fun get(key: String): Bitmap? = cache.get(key)

    fun put(key: String, bitmap: Bitmap) {
        cache.put(key, bitmap)
    }
}
```

Set the cache size to about 1/8th of the available app memory. Android's `LruCache` is thread-safe and handles eviction automatically. The key is a combination of the URL, target dimensions, and any transformations — so a circle-cropped version of the same image gets its own cache entry.

#### Q6: How does the disk cache work?

Disk cache stores encoded image files (JPEG, PNG, WebP) on disk, avoiding re-downloads after the memory cache is cleared on process death or memory pressure. `DiskLruCache` is the standard implementation — it uses a bounded directory with LRU eviction.

The disk cache key is typically a hash of the URL (SHA-256 or MD5). You store the raw network response bytes, not the decoded bitmap, because a 1920x1080 JPEG might be 200 KB encoded but 8 MB as an ARGB_8888 bitmap (1920 x 1080 x 4 bytes). Reading a small encoded file from disk is fast, and decoding is much cheaper than a network round trip. The decoded bitmap then goes into the memory cache for instant access.

A typical disk cache size is 50-250 MB. Coil defaults to 2% of total storage, capped at 250 MB. Glide uses 250 MB by default.

#### Q7: How do you generate cache keys?

Cache keys must uniquely identify the exact bitmap needed. A URL alone isn't enough — the same URL at different sizes or with different transformations produces different bitmaps.

For the **memory cache**, the key includes URL + target width + target height + transformation list. A 100x100 circle-cropped version and a 200x200 original are different entries. For the **disk cache**, the key is just the URL hash, since disk stores the raw encoded response. Transformations are applied after decoding, so the disk cache serves the same file regardless of transformations.

```kotlin
fun createMemoryCacheKey(request: ImageRequest): String {
    return buildString {
        append(request.url)
        append("_${request.width}x${request.height}")
        request.transformations.forEach { append("_${it.key}") }
    }
}
```

#### Q8: How do you handle placeholder and error images?

Show the placeholder drawable immediately when a load request starts. If the load fails (network error, decode error, 404), replace it with the error drawable.

```kotlin
class ImageLoadTask(
    private val request: ImageRequest,
    private val target: ImageView
) {
    suspend fun execute() {
        withContext(Dispatchers.Main) {
            request.placeholder?.let { target.setImageResource(it) }
        }
        try {
            val bitmap = loadBitmap(request.url)
            withContext(Dispatchers.Main) {
                target.setImageBitmap(bitmap)
            }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) {
                request.errorDrawable?.let { target.setImageResource(it) }
            }
        }
    }
}
```

For a smooth UX, apply a crossfade transition when replacing the placeholder instead of an abrupt swap. Coil does this by default with a 100ms crossfade.

### Low-Level Design & Deep Dives

#### Q9: What is bitmap pooling and why is it important?

Every time you decode an image, Android allocates memory for the bitmap. When it's no longer needed, the GC reclaims it. If you're loading many images — like scrolling a feed — this creates allocation churn and GC pressure, causing jank.

A bitmap pool keeps references to "released" bitmaps grouped by their config (width, height, color format). When a new decode request comes in, the pool checks if it has a bitmap of the right size and reuses it with `BitmapFactory.Options.inBitmap`.

```kotlin
class BitmapPool {
    private val pool = HashMap<String, MutableList<Bitmap>>()

    fun get(width: Int, height: Int, config: Bitmap.Config): Bitmap? {
        val key = "${width}x${height}_${config}"
        return pool[key]?.removeLastOrNull()
    }

    fun put(bitmap: Bitmap) {
        if (bitmap.isMutable) {
            val key = "${bitmap.width}x${bitmap.height}_${bitmap.config}"
            pool.getOrPut(key) { mutableListOf() }.add(bitmap)
        }
    }
}
```

Glide's bitmap pool is one of its biggest advantages over simpler libraries. It significantly reduces GC pauses during fast scrolling. Only mutable bitmaps can be reused with `inBitmap`.

#### Q10: How do you handle lifecycle awareness?

If a user scrolls a RecyclerView quickly, dozens of image loads start. Without lifecycle awareness, completed loads try to set bitmaps on recycled views — causing wrong images to appear. Worse, if the Activity is destroyed, the load continues and the bitmap can't be delivered, wasting CPU, memory, and battery.

Tie image loads to the lifecycle of the host (Activity, Fragment, or View). When the view is detached or the Activity is destroyed, cancel in-flight loads.

```kotlin
class ImageLoader(private val context: Context) {

    fun load(url: String, imageView: ImageView) {
        cancelExistingLoad(imageView)

        val lifecycle = imageView.findViewTreeLifecycleOwner()?.lifecycle
        val job = scope.launch {
            val bitmap = fetchAndDecode(url)
            withContext(Dispatchers.Main) {
                imageView.setImageBitmap(bitmap)
            }
        }

        lifecycle?.addObserver(object : DefaultLifecycleObserver {
            override fun onDestroy(owner: LifecycleOwner) {
                job.cancel()
            }
        })

        imageView.tag = job
    }
}
```

In Compose, lifecycle management is simpler because `rememberCoroutineScope()` is already scoped to the composable's lifecycle. When the composable leaves the composition, the scope is cancelled and all loads stop.

#### Q11: What's the threading strategy?

Image loading involves three types of work, each on a different dispatcher:

- **Network fetch** — `Dispatchers.IO`. HTTP calls are I/O-bound and should never block the main thread
- **Decode and transform** — `Dispatchers.Default`. Bitmap decoding is CPU-bound. Transformations (blur, circle crop, rounded corners) are also CPU work
- **Display** — `Dispatchers.Main`. Setting a bitmap on an ImageView must happen on the main thread

```kotlin
suspend fun loadImage(url: String, width: Int, height: Int): Bitmap {
    val bytes = withContext(Dispatchers.IO) {
        httpClient.get(url).readBytes()
    }

    return withContext(Dispatchers.Default) {
        val options = BitmapFactory.Options().apply {
            inSampleSize = calculateInSampleSize(bytes, width, height)
        }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }
}
```

Limit concurrent network requests to avoid overwhelming the connection pool. Coil uses OkHttp's dispatcher which caps at 64 concurrent requests and 5 per host. `Dispatchers.Default` already limits parallelism to the number of CPU cores, so decode operations are naturally bounded.

#### Q12: What is request deduplication and how would you implement it?

If the same image URL appears 5 times on screen (like a user avatar in a comment list), you shouldn't fire 5 separate network requests. Track in-flight requests by URL and attach new callers to the existing request.

```kotlin
class ImageLoader {
    private val inFlightRequests = ConcurrentHashMap<String, Deferred<Bitmap>>()

    suspend fun load(url: String): Bitmap {
        inFlightRequests[url]?.let { return it.await() }

        val deferred = scope.async {
            try {
                fetchAndDecode(url)
            } finally {
                inFlightRequests.remove(url)
            }
        }
        inFlightRequests[url] = deferred
        return deferred.await()
    }
}
```

All five callers get the same bitmap from a single network request. There's a race condition between the check and the put in this simplified version — in production, use a `Mutex` or `putIfAbsent` to ensure only one deferred is created per key.

#### Q13: How do you handle image transformations?

Transformations modify the decoded bitmap before displaying it — circle crop, rounded corners, blur, grayscale, color filters. Design them as composable operations that take a bitmap and return a new one.

```kotlin
interface Transformation {
    val key: String
    fun transform(input: Bitmap): Bitmap
}

class CircleCropTransformation : Transformation {
    override val key = "circle_crop"

    override fun transform(input: Bitmap): Bitmap {
        val size = minOf(input.width, input.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val shader = BitmapShader(input, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        paint.shader = shader
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
        return output
    }
}
```

Include transformations in the memory cache key so a circle-cropped bitmap and an unmodified one from the same URL are cached separately. Apply transformations after decoding but before writing to the memory cache — the cached version is then ready to display without re-transforming.

#### Q14: How do you handle disk cache eviction?

Disk cache has a fixed size limit (e.g., 250 MB). `DiskLruCache` handles LRU eviction automatically — each read marks the entry as recently used, and the least recently used entries are deleted when the cache exceeds its max size.

Beyond automatic eviction, handle these cases:

- **Manual clear** — Provide an API to clear the cache on logout or data corruption
- **Device storage pressure** — When Android sends `TRIM_MEMORY_RUNNING_LOW`, consider reducing the disk cache
- **Stale entries** — Optionally tag entries with a TTL and treat expired entries as misses

One thing to watch — disk eviction must not happen on the main thread. `DiskLruCache` operations involve file I/O and should always run on `Dispatchers.IO`.

#### Q15: How do you respond to memory pressure?

Android sends memory pressure signals through `ComponentCallbacks2.onTrimMemory()`. Your library should listen and respond.

- **TRIM_MEMORY_UI_HIDDEN** — App moved to background. Reduce the memory cache by 50%
- **TRIM_MEMORY_RUNNING_LOW** — System is low on memory. Clear the memory cache entirely
- **TRIM_MEMORY_COMPLETE** — System is about to kill your process. Clear everything

```kotlin
class ImageLoader(context: Context) : ComponentCallbacks2 {
    private val memoryCache = MemoryCache(calculateMaxSize(context))

    init {
        context.applicationContext.registerComponentCallbacks(this)
    }

    override fun onTrimMemory(level: Int) {
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> memoryCache.clear()
            level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> memoryCache.clear()
            level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN -> memoryCache.trimToSize(memoryCache.maxSize() / 2)
        }
    }
}
```

Both Coil and Glide do this. It's a critical piece that prevents your image cache from being the reason Android kills the app. The bitmap pool should also be trimmed alongside the memory cache.

#### Q16: How would you downsample images to avoid OutOfMemoryError?

Loading a full-resolution image into memory is wasteful when the target view is smaller. A 4000x3000 photo consumes 48 MB as ARGB_8888, but a 400x300 ImageView only needs 480 KB. Downsampling decodes the image at a lower resolution using `inSampleSize`.

```kotlin
fun decodeSampledBitmap(
    data: ByteArray, targetWidth: Int, targetHeight: Int
): Bitmap {
    val options = BitmapFactory.Options().apply {
        inJustDecodeBounds = true
    }
    BitmapFactory.decodeByteArray(data, 0, data.size, options)

    options.inSampleSize = calculateInSampleSize(
        options.outWidth, options.outHeight, targetWidth, targetHeight
    )
    options.inJustDecodeBounds = false
    return BitmapFactory.decodeByteArray(data, 0, data.size, options)
}

fun calculateInSampleSize(
    srcWidth: Int, srcHeight: Int,
    targetWidth: Int, targetHeight: Int
): Int {
    var sampleSize = 1
    while (srcWidth / (sampleSize * 2) >= targetWidth &&
           srcHeight / (sampleSize * 2) >= targetHeight) {
        sampleSize *= 2
    }
    return sampleSize
}
```

`inSampleSize` must be a power of 2 for efficient decoding. A value of 4 means the decoder reads every 4th pixel in each dimension, producing a bitmap at 1/16th the original resolution. The two-pass approach (bounds check first, then decode) avoids allocating the full bitmap just to read its dimensions.

#### Q17: How would you implement a priority system for image loads?

Not all loads are equally important. A hero image on a detail screen should load before tiny profile avatars below it.

- **HIGH** — Currently visible, large images. The image the user tapped to see in detail
- **NORMAL** — Currently visible list items. The default priority
- **LOW** — Prefetched images, thumbnails for off-screen items

Use a `PriorityBlockingQueue` or a custom coroutine dispatcher that respects priority. When the user scrolls, cancel loads for items that scrolled off-screen and prioritize newly visible items. Coil handles this by cancelling loads when the ImageView is recycled in a RecyclerView — the new item gets a fresh load, and the old item's network request is cancelled if it hasn't completed. This is more practical than a complex priority queue for most apps.

#### Q18: How do Coil and Glide differ in their architecture?

Glide was built in the Java/callback era. It uses generated API code, custom resource pools, and its own lifecycle integration through hidden Fragments. It manages a bitmap pool, memory cache, and disk cache with byte-level control over memory. Glide pre-dates coroutines and uses its own thread pool for network and decode operations.

Coil was built for Kotlin-first Android. It uses coroutines for all async work, OkHttp as its network layer, and Kotlin extension functions for a clean API. Coil is simpler — roughly 10x less code than Glide — and integrates naturally with Compose through `AsyncImage`.

The main tradeoff: Glide has more mature bitmap pooling and memory management, which matters for image-heavy apps doing rapid scrolling with many image sizes. Coil is lighter, more idiomatic in modern Kotlin projects, and easier to extend. For most new projects, Coil is the better choice unless you need Glide's bitmap pooling for heavy image workloads.

### Common Follow-ups

- How would you handle animated images (GIFs, animated WebP)?
- What happens if the server returns a redirect for an image URL? How would your library handle it?
- How would you add support for loading images from content URIs and local file paths?
- How would you handle cache warming — preloading images the user is likely to see next?
- What format would you choose for the disk cache — the original format or always convert to WebP?
- How would you test an image loading library? What would you mock?
- How does Compose's `AsyncImage` differ from loading into an `ImageView`?
