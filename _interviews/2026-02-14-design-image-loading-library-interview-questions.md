---
title: "Design an Image Loading Library"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 2
level: mid
sequence: 46
---

## Design an Image Loading Library

Designing an image loading library like Coil or Glide is one of the most common mobile system design questions. It tests your understanding of caching, memory management, threading, and lifecycle awareness — all core Android concerns packed into one problem.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the core responsibilities of an image loading library?

An image loading library handles fetching an image from a source (network, disk, or memory), decoding it into a bitmap, and displaying it in an ImageView or Composable. Beyond that, it manages caching at multiple levels, handles lifecycle (cancelling loads when the view is destroyed), manages threading, and provides placeholder/error states.

The basic pipeline is: **Request → Memory cache check → Disk cache check → Network fetch → Decode → Transform → Cache → Display**.

#### Q2: How would you design the public API for an image loading library?

Keep the API simple for the common case and extensible for advanced use. A builder or DSL pattern works well.

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

The request object should capture: the source URL, the target view, placeholder and error drawables, transformations, cache policy, and a listener for success/failure callbacks. Internally, the library converts this into an `ImageRequest` data class and hands it to the pipeline.

#### Q3: How does the memory cache work?

The memory cache stores decoded bitmaps in RAM for instant access. It uses an LRU (Least Recently Used) eviction policy — when the cache is full, the least recently accessed entry is removed.

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

The cache size is typically set to 1/8th of the available app memory. The key is usually a combination of the URL and any transformations applied (so a circle-cropped version of the same image gets its own cache entry). Android's `LruCache` is thread-safe and handles eviction automatically.

#### Q4: How does the disk cache work?

The disk cache stores encoded image files (JPEG, PNG, WebP) on disk. This avoids re-downloading images after the memory cache is cleared (which happens on process death or memory pressure). `DiskLruCache` is the standard implementation — it uses a bounded directory with LRU eviction.

The disk cache key is typically a hash of the URL (SHA-256 or MD5). You store the raw network response bytes, not the decoded bitmap, because disk I/O is cheap but network fetching is expensive. Decoding happens after reading from disk.

A typical disk cache size is 50-250 MB depending on the app. Coil defaults to 2% of the device's total storage, capped at 250 MB. Glide uses 250 MB by default.

#### Q5: Why does the disk cache store encoded bytes instead of decoded bitmaps?

A decoded bitmap consumes significantly more memory than the encoded file. A 1920x1080 JPEG might be 200 KB on disk but 8 MB as a decoded ARGB_8888 bitmap (1920 × 1080 × 4 bytes). Storing encoded bytes on disk saves storage space and avoids reading huge files from disk.

When you need the image, you read the small encoded file from disk (fast) and decode it into a bitmap (CPU work, but much faster than a network round trip). The decoded bitmap then goes into the memory cache for instant access.

#### Q6: How do you handle placeholder and error images?

When a load request starts, immediately show the placeholder drawable in the target view. This gives the user visual feedback while the image loads. If the load fails (network error, decode error, 404), replace the placeholder with the error drawable.

```kotlin
class ImageLoadTask(
    private val request: ImageRequest,
    private val target: ImageView
) {
    suspend fun execute() {
        // Show placeholder immediately on main thread
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

For a smooth UX, apply a crossfade transition when replacing the placeholder with the loaded image instead of an abrupt swap. Coil does this by default with a 100ms crossfade.

#### Q7: How do you generate cache keys?

The cache key must uniquely identify the exact bitmap needed. A URL alone isn't enough — the same URL at different sizes or with different transformations produces different bitmaps.

For the **memory cache**, the key includes: URL + target width + target height + transformation list. This way, a 100x100 circle-cropped version and a 200x200 original are different entries.

For the **disk cache**, the key is typically just the URL hash, since the disk stores the raw encoded response. Transformations are applied after decoding, so the disk cache can serve the same file for different transformation requests.

```kotlin
fun createMemoryCacheKey(request: ImageRequest): String {
    return buildString {
        append(request.url)
        append("_${request.width}x${request.height}")
        request.transformations.forEach { append("_${it.key}") }
    }
}
```

### Deep Dive Questions (Advanced → Expert)

#### Q8: What is bitmap pooling and why is it important?

Bitmap pooling reuses bitmap allocations instead of creating new ones. Every time you decode an image, Android allocates a chunk of memory for the bitmap. When the bitmap is no longer needed, the garbage collector reclaims it. If you're loading many images (like scrolling a feed), this creates allocation churn and GC pressure, causing jank.

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

#### Q9: How do you handle lifecycle awareness? Why does it matter?

If a user scrolls a RecyclerView quickly, dozens of image loads start. Without lifecycle awareness, completed loads try to set bitmaps on recycled views, causing wrong images to appear. Worse, if the Activity is destroyed, the load continues and the bitmap can't be delivered — wasting CPU, memory, and battery.

Lifecycle awareness means tying image loads to the lifecycle of the host (Activity, Fragment, or View). When the view is detached or the Activity is destroyed, in-flight loads are cancelled.

```kotlin
class ImageLoader(private val context: Context) {

    fun load(url: String, imageView: ImageView) {
        // Cancel any existing load for this view
        cancelExistingLoad(imageView)

        val lifecycle = imageView.findViewTreeLifecycleOwner()?.lifecycle
        val job = scope.launch {
            val bitmap = fetchAndDecode(url)
            withContext(Dispatchers.Main) {
                imageView.setImageBitmap(bitmap)
            }
        }

        // Cancel when lifecycle is destroyed
        lifecycle?.addObserver(object : DefaultLifecycleObserver {
            override fun onDestroy(owner: LifecycleOwner) {
                job.cancel()
            }
        })

        // Tag the view with the current job for deduplication
        imageView.tag = job
    }
}
```

In Compose, lifecycle management is simpler because `rememberCoroutineScope()` is already scoped to the composable's lifecycle. When the composable leaves the composition, the scope is cancelled and all loads stop.

#### Q10: How do you handle the threading strategy?

Image loading involves three types of work, each on a different dispatcher:

- **Network fetch** — `Dispatchers.IO`. HTTP calls are I/O-bound and should never block the main thread
- **Decode and transform** — `Dispatchers.Default`. Decoding a bitmap from bytes is CPU-bound. Transformations (blur, circle crop, rounded corners) are also CPU work
- **Display** — `Dispatchers.Main`. Setting a bitmap on an ImageView must happen on the main thread

```kotlin
suspend fun loadImage(url: String, width: Int, height: Int): Bitmap {
    // Network fetch on IO
    val bytes = withContext(Dispatchers.IO) {
        httpClient.get(url).readBytes()
    }

    // Decode and transform on Default
    return withContext(Dispatchers.Default) {
        val options = BitmapFactory.Options().apply {
            inSampleSize = calculateInSampleSize(bytes, width, height)
        }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }
}
```

Limit concurrent network requests to avoid overwhelming the connection pool and the device. Coil uses OkHttp's dispatcher which limits to 64 concurrent requests and 5 per host by default. For decode operations, `Dispatchers.Default` already limits parallelism to the number of CPU cores.

#### Q11: What is request deduplication and how would you implement it?

If the same image URL appears 5 times on screen (like a user avatar in a comment list), you shouldn't fire 5 separate network requests. Request deduplication means tracking in-flight requests by URL and attaching new requests to the existing one.

```kotlin
class ImageLoader {
    private val inFlightRequests = ConcurrentHashMap<String, Deferred<Bitmap>>()

    suspend fun load(url: String): Bitmap {
        // Check if this URL is already being fetched
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

All five callers get the same bitmap from a single network request. This is especially important for profile avatars and repeated thumbnails. There's a race condition between the `check` and the `put` in this simplified version — in production, you'd use a `Mutex` or `putIfAbsent` to ensure only one deferred is created per key.

#### Q12: How do you handle image transformations?

Transformations modify the decoded bitmap before displaying it. Common transformations include circle crop, rounded corners, blur, grayscale, and color filters. Design transformations as composable operations that take a bitmap and return a new one.

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

Transformations must be included in the memory cache key. A circle-cropped bitmap and an unmodified bitmap from the same URL should be cached separately. Apply transformations after decoding but before writing to the memory cache — this way the cached version is ready to display without re-transforming.

#### Q13: How do you handle disk cache eviction?

The disk cache has a fixed size limit (e.g., 250 MB). When it's full, the LRU entry is evicted to make room for new entries. `DiskLruCache` handles this automatically — each read marks the entry as recently used, and the least recently used entries are deleted when the cache exceeds its max size.

Beyond automatic LRU eviction, you should handle these cases:
- **Manual clear** — Provide an API to clear the cache when the user logs out or the app data is corrupted
- **Device storage pressure** — When Android sends a `ComponentCallbacks2.onTrimMemory(TRIM_MEMORY_RUNNING_LOW)` signal, consider reducing your disk cache
- **Stale entries** — Optionally tag disk cache entries with a TTL. If the entry is older than the TTL, treat it as a miss and re-fetch

One thing to watch out for — disk eviction should not happen on the main thread. `DiskLruCache` operations involve file I/O and should always run on `Dispatchers.IO`.

#### Q14: How do you handle memory pressure?

Android sends memory pressure signals through `ComponentCallbacks2.onTrimMemory()`. Your image library should listen to these and respond appropriately.

- **TRIM_MEMORY_UI_HIDDEN** — The app moved to the background. Clear the memory cache or reduce it by 50%. The user isn't looking at the images
- **TRIM_MEMORY_RUNNING_LOW** — The system is running low on memory. Clear the memory cache entirely
- **TRIM_MEMORY_COMPLETE** — The system is about to kill your process. Clear everything

```kotlin
class ImageLoader(context: Context) : ComponentCallbacks2 {
    private val memoryCache = MemoryCache(calculateMaxSize(context))

    init {
        context.applicationContext.registerComponentCallbacks(this)
    }

    override fun onTrimMemory(level: mid) {
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> memoryCache.clear()
            level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> memoryCache.clear()
            level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN -> memoryCache.trimToSize(memoryCache.maxSize() / 2)
        }
    }
}
```

Coil and Glide both do this. It's a critical piece that prevents your image cache from being the reason Android kills the app. The bitmap pool should also be trimmed alongside the memory cache.

#### Q15: How would you handle image downsampling to avoid OutOfMemoryError?

Loading a full-resolution image into memory is wasteful when the target view is much smaller. A 4000x3000 photo consumes 48 MB as ARGB_8888, but if you're showing it in a 400x300 ImageView, you only need 480 KB. Downsampling decodes the image at a lower resolution.

```kotlin
fun decodeSampledBitmap(
    data: ByteArray,
    targetWidth: Int,
    targetHeight: Int
): Bitmap {
    // First pass — read dimensions without decoding
    val options = BitmapFactory.Options().apply {
        inJustDecodeBounds = true
    }
    BitmapFactory.decodeByteArray(data, 0, data.size, options)

    // Calculate inSampleSize
    options.inSampleSize = calculateInSampleSize(
        options.outWidth, options.outHeight,
        targetWidth, targetHeight
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

`inSampleSize` must be a power of 2 for efficient decoding. An `inSampleSize` of 4 means the decoder reads every 4th pixel in each dimension, producing a bitmap that's 1/16th the original resolution. The two-pass approach (bounds check first, then decode) avoids allocating the full bitmap just to find out its dimensions.

#### Q16: How would you implement a priority system for image loads?

Not all image loads are equally important. The hero image on a detail screen should load before the tiny profile avatars below it. A priority system lets you queue requests and process higher-priority ones first.

- **HIGH** — Currently visible, large images. The image the user tapped to see in detail
- **NORMAL** — Currently visible list items. The default priority
- **LOW** — Prefetched images, thumbnails for off-screen items

Use a `PriorityBlockingQueue` or a custom coroutine dispatcher that respects priority. When the user scrolls, cancel loads for items that scrolled off-screen (or lower their priority) and prioritize newly visible items.

Coil handles this by cancelling loads when the ImageView is recycled in a RecyclerView. The new item gets a fresh load with normal priority, and the old item's network request is cancelled if it hasn't completed yet. This is more practical than a complex priority queue for most apps.

#### Q17: How do Coil and Glide differ in their architecture?

Glide was built in the Java/callback era. It uses generated API code, custom resource pools, and its own lifecycle integration through hidden Fragments. It manages a bitmap pool, memory cache, and disk cache with byte-level control over memory. Glide pre-dates coroutines and uses its own thread pool for network and decode operations.

Coil was built for Kotlin-first Android. It uses coroutines for all async operations, OkHttp as its network layer, and Kotlin extension functions for a clean API. Coil is simpler — roughly 10x less code than Glide — and integrates naturally with Compose through `AsyncImage`.

The main tradeoff: Glide has more mature bitmap pooling and memory management, which matters for image-heavy apps doing rapid scrolling with many image sizes. Coil is lighter, more idiomatic in modern Kotlin projects, and easier to extend. For most new projects, Coil is the better choice unless you need Glide's bitmap pooling for heavy image workloads.

### Common Follow-ups

- How would you handle animated images (GIFs, animated WebP)?
- What happens if the server returns a redirect for an image URL? How would your library handle it?
- How would you add support for loading images from content URIs and local file paths?
- How would you handle cache warming — preloading images the user is likely to see next?
- What format would you choose for the disk cache — the original format or always convert to WebP?
- How would you test an image loading library? What would you mock?
- How does Compose's `AsyncImage` differ from loading into an `ImageView`?
