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

Think about it — every time you scroll Instagram, dozens of images load seamlessly. No jank, no blank screens, no crashes. That's not magic. That's a well-designed image loading library doing a ridiculous amount of work behind the scenes. Designing one from scratch tests caching, memory management, threading, and lifecycle awareness — basically all the hard parts of Android crammed into one problem.

#### What are the core responsibilities of an image loading library?

Here's the thing. At its heart, an image loader does three jobs: fetch an image (from network, disk, or memory), decode it into a bitmap, and slap it on an ImageView or Composable. But that's like saying a restaurant just "makes food." The real work is everything else — multi-level caching so you're not re-downloading the same profile picture 50 times, lifecycle management so you're not loading images for a dead Activity, threading so your main thread stays buttery smooth, and placeholder/error states so the user isn't staring at a blank rectangle.

#### What does the overall loading pipeline look like?

Picture a series of checkpoints, like airport security but useful:

**Request -> Memory Cache -> Disk Cache -> Network -> Decode -> Transform -> Cache -> Display**

A request comes in and hits the memory cache first — that's an instant bitmap return, zero work. Miss? Check the disk cache — still way cheaper than a network call. Miss again? Fine, go fetch it from the network, decode the raw bytes into a bitmap, apply any transformations (circle crop, rounded corners, whatever), write to both caches, and display. Each checkpoint short-circuits the pipeline if it has what you need. Most of the time, you never even hit the network.

#### How does the memory cache work?

Memory cache stores decoded bitmaps in RAM for instant access. It uses an LRU eviction policy — like a bookshelf with limited space. When it's full and a new book arrives, the one you haven't picked up in the longest time gets tossed.

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

Set the cache size to about 1/8th of available app memory. Android's `LruCache` is thread-safe and handles eviction automatically. The key is a combo of URL, target dimensions, and transformations — so a circle-cropped version of the same image gets its own cache entry.

#### How does the disk cache work?

Disk cache stores encoded image files (JPEG, PNG, WebP) on disk, so you don't re-download everything after the memory cache gets cleared on process death. `DiskLruCache` is the standard implementation — a bounded directory with LRU eviction.

Here's the key insight: you store the raw network response bytes, not the decoded bitmap. Why? A 1920x1080 JPEG might be 200 KB encoded but 8 MB as an ARGB_8888 bitmap (1920 x 1080 x 4 bytes). That's a 40x difference. Reading a small encoded file from disk is fast, and decoding is way cheaper than a network round trip. The decoded bitmap then goes into the memory cache for instant access.

A typical disk cache size is 50-250 MB. Coil defaults to 2% of total storage, capped at 250 MB. Glide uses 250 MB by default.

> **🧠 Think about it:** Why does the disk cache key use just the URL hash, while the memory cache key includes dimensions and transformations?

#### How would you design the public API?

Keep it dead simple for the common case, extensible for the power users. A builder or DSL pattern nails this.

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

Internally, the library converts this into an `ImageRequest` data class that captures the source URL, target view, placeholder and error drawables, transformations, cache policy, and callbacks. That request object is what flows through the entire pipeline. Think of it like a shipping label — it tells every step in the pipeline exactly what to do with this particular load.

#### What platforms and use cases should the library support?

At minimum, support loading from network URLs, local files, and content URIs into `ImageView` targets. For Compose, provide an `AsyncImage` composable. Support cache control (skip memory cache, skip disk cache, force refresh), request cancellation, and image transformations. If you're designing for an interview, start with the network-to-ImageView case and expand from there — don't try to boil the ocean upfront.

#### How do you generate cache keys?

Yeah, this trips up everyone. A URL alone isn't enough — the same URL at different sizes or with different transformations produces completely different bitmaps.

For the **memory cache**, the key includes URL + target width + target height + transformation list. A 100x100 circle-cropped version and a 200x200 original are different entries. For the **disk cache**, the key is just the URL hash, since disk stores the raw encoded response. Transformations happen after decoding, so the disk cache serves the same file regardless.

```kotlin
fun createMemoryCacheKey(request: ImageRequest): String {
    return buildString {
        append(request.url)
        append("_${request.width}x${request.height}")
        request.transformations.forEach { append("_${it.key}") }
    }
}
```

#### How do you handle lifecycle awareness?

Imagine a user rage-scrolling through a RecyclerView. Dozens of image loads fire off. Without lifecycle awareness, completed loads try to set bitmaps on recycled views — and now you've got someone else's profile picture on your message. Worse, if the Activity is destroyed mid-load, the bitmap has nowhere to go. You just burned CPU, memory, and battery for nothing.

The fix: tie image loads to the lifecycle of the host. When the view is detached or the Activity is destroyed, cancel in-flight loads.

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

In Compose, this is simpler because `rememberCoroutineScope()` is already scoped to the composable's lifecycle. When the composable leaves the composition, the scope is cancelled and all loads stop automatically.

#### What is bitmap pooling and why is it important?

Every time you decode an image, Android allocates memory for the bitmap. When it's no longer needed, the GC reclaims it. Now picture scrolling a feed with 100 images — that's 100 allocations and 100 garbage collections. It's like hiring and firing employees every hour instead of just reassigning them. That allocation churn causes GC pressure, which causes jank.

A bitmap pool keeps references to "released" bitmaps grouped by their config (width, height, color format). When a new decode comes in, the pool checks if it has a bitmap of the right size and reuses it with `BitmapFactory.Options.inBitmap`.

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

Glide's bitmap pool is one of its biggest advantages over simpler libraries — it significantly reduces GC pauses during fast scrolling. Plot twist: only mutable bitmaps can be reused with `inBitmap`.

#### How would you downsample images to avoid OutOfMemoryError?

Loading a full-resolution image into memory when the target view is tiny is like shipping a grand piano through your front door when you only need a music box. A 4000x3000 photo consumes 48 MB as ARGB_8888, but a 400x300 ImageView only needs 480 KB. Downsampling decodes the image at a lower resolution using `inSampleSize`.

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

`inSampleSize` must be a power of 2 for efficient decoding. A value of 4 means the decoder reads every 4th pixel in each dimension — 1/16th the original resolution. The two-pass approach (bounds check first, then decode) avoids allocating the full bitmap just to read its dimensions.

> **🧠 Think about it:** If you skip the `inJustDecodeBounds = true` pass and just decode directly, what happens to your memory when someone loads a 20 MP camera photo?

#### What's the threading strategy?

Image loading involves three types of work, and mixing them up is a recipe for ANRs or crashes:

- **Network fetch** — `Dispatchers.IO`. HTTP calls are I/O-bound and should never touch the main thread
- **Decode and transform** — `Dispatchers.Default`. Bitmap decoding is CPU-bound. Transformations like blur, circle crop, and rounded corners are also CPU work
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

#### How do you handle placeholder and error images?

Show the placeholder drawable immediately when a load starts — don't leave the user staring at nothing. If the load fails (network error, decode error, 404), swap in the error drawable.

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

#### What is request deduplication and how would you implement it?

If the same user avatar appears 5 times in a comment list, you shouldn't fire 5 separate network requests. That's like 5 people separately ordering the same pizza instead of sharing one order. Track in-flight requests by URL and attach new callers to the existing request.

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

#### How do you handle image transformations?

Transformations modify the decoded bitmap before displaying — circle crop, rounded corners, blur, grayscale, color filters. Design them as composable operations that take a bitmap in and return a new one out.

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

Include transformations in the memory cache key so a circle-cropped bitmap and an unmodified one from the same URL are cached separately. Apply transformations after decoding but before writing to the memory cache — that way the cached version is ready to display without re-transforming.

#### How do you respond to memory pressure?

Android sends memory pressure signals through `ComponentCallbacks2.onTrimMemory()`. Your library needs to listen and respond — think of it like the system tapping your shoulder progressively harder.

- **TRIM_MEMORY_UI_HIDDEN** — App moved to background. Reduce memory cache by 50%
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

#### How do you handle disk cache eviction?

Disk cache has a fixed size limit (e.g., 250 MB). `DiskLruCache` handles LRU eviction automatically — each read marks the entry as recently used, and the least recently used entries get deleted when the cache exceeds its max size.

Beyond automatic eviction, handle these cases:

- **Manual clear** — Provide an API to clear the cache on logout or data corruption
- **Device storage pressure** — When Android sends `TRIM_MEMORY_RUNNING_LOW`, consider reducing the disk cache
- **Stale entries** — Optionally tag entries with a TTL and treat expired entries as misses

One thing to watch — disk eviction must not happen on the main thread. `DiskLruCache` operations involve file I/O and should always run on `Dispatchers.IO`.

> **🧠 Think about it:** What would happen if your disk cache eviction runs synchronously on the main thread while the user is scrolling through a feed?

#### How would you implement a priority system for image loads?

Not all loads are created equal. A hero image on a detail screen should load before tiny profile avatars tucked below the fold.

- **HIGH** — Currently visible, large images. The image the user tapped to see in detail
- **NORMAL** — Currently visible list items. The default priority
- **LOW** — Prefetched images, thumbnails for off-screen items

Use a `PriorityBlockingQueue` or a custom coroutine dispatcher that respects priority. But here's the thing — in practice, Coil handles this more elegantly by simply cancelling loads when the ImageView is recycled in a RecyclerView. The new item gets a fresh load, and the old item's network request is cancelled if it hasn't completed. This cancel-and-reload approach is more practical than a complex priority queue for most apps.

#### How do Coil and Glide differ in their architecture?

Glide was built in the Java/callback era. It uses generated API code, custom resource pools, and its own lifecycle integration through hidden Fragments (yeah, hidden Fragments — it headlessly attaches them to track lifecycle). It manages a bitmap pool, memory cache, and disk cache with byte-level control over memory. Glide pre-dates coroutines and uses its own thread pool.

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
