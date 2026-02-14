---
title: How To Cache In Android?
layout: post
categories: post
tags:
  - Android
  - Performance
---

The first time I really understood caching was when I profiled an app that was making the same API call every time the user switched tabs. Three tabs, two switches per session — that's six identical network requests in under a minute. The response was 200KB of JSON that hadn't changed in hours. The fix was a one-line cache header, and it cut the average session's network usage by 70%.

Think about that for a second. The user was literally waiting for data they already had five seconds ago. It's like calling your friend to ask for their address every time you want to visit, even though you already wrote it down. That's what your app does without caching — it forgets everything the moment it looks away.

Caching isn't just an optimization. It's the difference between an app that feels instant and one that makes users stare at spinners for information that's already sitting right there.

Android offers caching at multiple levels — memory, disk, and HTTP — and choosing the right layer depends on what you're caching, how often it changes, and how expensive it is to re-fetch. But here's the thing: the tricky part isn't implementing the cache. It's knowing when to throw it away. As the old joke goes, there are only two hard things in computer science: cache invalidation and naming things. And I've seen both ruin a perfectly good afternoon.

## Memory Cache With LruCache

Imagine you're a barista at a busy coffee shop. You can only remember the last handful of orders — when a new one comes in and your brain is full, the oldest order you haven't thought about drops out of your memory. That's essentially what Android's `LruCache` does. LRU stands for Least Recently Used, and it holds objects in a `LinkedHashMap`. When the cache is full, it kicks out whatever you haven't touched in the longest time. Hot data stays, cold data goes.

This is exactly the behavior you want for most caches — keep the stuff people actually use, and let everything else fall away naturally.

Now, the critical design decision is the cache size. Too small, and entries get evicted before they're reused — like a barista who can only remember one order at a time. Too large, and you risk `OutOfMemoryError` — like a barista trying to memorize every order from the last six months and passing out from the effort. Android's guidance is to use a fraction of the available heap, typically 1/8th of the memory class.

```kotlin
class ImageMemoryCache(context: Context) {

    private val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
    private val cacheSize = maxMemory / 8  // 1/8th of available memory

    private val cache = object : LruCache<String, Bitmap>(cacheSize) {
        override fun sizeOf(key: String, bitmap: Bitmap): Int {
            return bitmap.byteCount / 1024  // size in KB
        }
    }

    fun get(url: String): Bitmap? = cache.get(url)

    fun put(url: String, bitmap: Bitmap) {
        cache.put(url, bitmap)
    }

    fun evict(url: String) {
        cache.remove(url)
    }

    fun clear() {
        cache.evictAll()
    }
}
```

See that `sizeOf` override? That's not optional — it's essential. Without it, `LruCache` counts entries by quantity (default size is 1 per entry), which means a 10KB thumbnail and a 5MB full-resolution image would count the same. That's like saying a Post-it note and a whiteboard take up the same amount of desk space. By overriding `sizeOf` to return the bitmap's byte count, the cache manages its memory correctly — a few large images fill the cache faster than many small ones.

> **🧠 Think about it:** What would happen if you forgot the `sizeOf` override and cached a dozen full-resolution camera photos? Each one could be 10-20MB. The cache thinks it has room for hundreds of entries, but your heap would blow up long before that.

Real-world use case: caching decoded Bitmaps for a RecyclerView image gallery. The user scrolls through a list, and previously viewed images are instantly available from the memory cache on scroll-back. No network call, no disk read, no decoding — just grab it from memory and slap it on screen. Libraries like Coil and Glide implement this pattern internally with multiple cache tiers, but understanding `LruCache` helps when you need to cache non-image data — parsed configuration, computed layout metrics, or expensive object graphs.

One important detail: `LruCache` is thread-safe. `get` and `put` are synchronized internally, so you can safely access it from multiple threads without external locking. This matters when background threads are loading images while the main thread is reading them for display.

## Disk Cache

Here's the problem with memory cache: it's fast, but it has amnesia. The moment your app process dies or the system reclaims memory, everything in the memory cache vanishes. Gone. It's like writing your notes on a whiteboard that someone erases every night. For data that should survive app restarts, you need something more permanent — a disk cache.

The simplest disk cache is a file in the app's cache directory. Android provides `context.cacheDir` for internal cache and `context.externalCacheDir` for external cache. The system can clear the cache directory when the device is low on storage, so don't store anything critical there — it's truly a cache, not persistent storage. Think of it as a filing cabinet that the janitor is allowed to empty when the office runs out of space.

```kotlin
class JsonDiskCache(
    private val context: Context,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {

    private val cacheDir = File(context.cacheDir, "api_cache")

    init {
        cacheDir.mkdirs()
    }

    suspend fun <T> get(
        key: String,
        maxAgeMs: Long,
        deserializer: DeserializationStrategy<T>
    ): T? = withContext(Dispatchers.IO) {
        val file = File(cacheDir, key.toMD5())
        if (!file.exists()) return@withContext null

        val age = System.currentTimeMillis() - file.lastModified()
        if (age > maxAgeMs) {
            file.delete()
            return@withContext null
        }

        try {
            val content = file.readText()
            json.decodeFromString(deserializer, content)
        } catch (e: Exception) {
            file.delete()
            null
        }
    }

    suspend fun <T> put(
        key: String,
        value: T,
        serializer: SerializationStrategy<T>
    ) = withContext(Dispatchers.IO) {
        val file = File(cacheDir, key.toMD5())
        file.writeText(json.encodeToString(serializer, value))
    }

    private fun String.toMD5(): String {
        val digest = MessageDigest.getInstance("MD5")
        return digest.digest(toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}
```

You might be wondering — why MD5 the cache key? Because API URLs contain characters like `/`, `?`, and `&` that aren't valid in filenames. MD5 gives us a clean, fixed-length string that works as a filename on every file system. The `maxAgeMs` parameter implements time-based expiration — if the cached file is older than the max age, it's treated as a miss and deleted. Simple, predictable, and easy to reason about.

For structured data that needs querying, Room (or DataStore for key-value pairs) is a better disk cache than raw files. Room gives you indexes, queries, and reactive observation. Raw files are simpler for "store this blob, give it back later" patterns — when you just need a dumb container, don't reach for the database.

## HTTP Caching

The most efficient cache is one you don't have to build yourself. Sounds too good to be true, right?

HTTP caching, built into OkHttp, uses standard HTTP headers to determine when a response can be reused, when it needs validation, and when it must be fetched fresh. This works at the network layer, below your application code. You set it up once, and the protocol handles the rest.

```kotlin
val cacheDir = File(context.cacheDir, "http_cache")
val cacheSize = 50L * 1024 * 1024  // 50 MB

val okHttpClient = OkHttpClient.Builder()
    .cache(Cache(cacheDir, cacheSize))
    .build()
```

That's it for the client side. Seriously. Three lines.

The server controls the behavior through response headers, and each one tells OkHttp something different about how to handle the cached response:

**`Cache-Control: max-age=3600`** — The response is fresh for 3600 seconds. OkHttp serves it from disk cache without hitting the network at all. This is what you want for data that changes infrequently — user profile images, configuration endpoints, static content. It's like the server saying "this answer is good for the next hour, don't bother asking me again."

**`ETag`** and **`If-None-Match`** — This one's clever. The server sends an `ETag` (a hash of the response content) with the first response. On subsequent requests, OkHttp sends `If-None-Match: <etag>`. If the content hasn't changed, the server responds with `304 Not Modified` (no body), and OkHttp uses the cached version. This saves bandwidth — the response body isn't transmitted — but still requires a network round-trip. It's like calling ahead to ask "did the menu change?" instead of driving to the restaurant to read it again.

**`Cache-Control: no-cache`** — Forces revalidation with the server on every request. The cache is used as a fallback, but OkHttp always checks with the server first. Use this for data that changes frequently but where you still want offline support.

> **💡 The "aha" moment:** HTTP caching is a collaboration between client and server. The client says "I can cache things," and the server says "here's how long this is good for." When both sides play along, you get caching for free — no `LruCache`, no disk files, no expiration logic. The protocol does the work.

But what about APIs you don't control — where the server doesn't send cache headers? You can add them yourself via an OkHttp interceptor:

```kotlin
class CacheInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        val cacheControl = CacheControl.Builder()
            .maxAge(10, TimeUnit.MINUTES)
            .build()
        return response.newBuilder()
            .removeHeader("Pragma")
            .removeHeader("Cache-Control")
            .header("Cache-Control", cacheControl.toString())
            .build()
    }
}
```

This forces a 10-minute cache on responses that don't set their own cache headers. It's a blunt tool — you're overriding the server's intent — but it's useful for third-party APIs that don't implement proper HTTP caching. Just be aware that you're making assumptions about how often that data changes. If you guess wrong, your users see stale data.

## Repository Caching Pattern

So we've got memory cache, disk cache, and HTTP cache. They're all useful on their own. But in a real app with Clean Architecture, who coordinates all of these? Who decides "check memory first, then disk, then go to the network"?

The repository. It's the natural place to implement caching logic because it already sits between your domain layer and your data sources. Think of the repository as a smart librarian — when you ask for a book, they check the desk first (memory), then the shelf (disk), and only order it from another library (network) if they don't have it.

```kotlin
class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao,
    private val memoryCache: LruCache<String, Product>
) {

    suspend fun getProduct(productId: String): Product {
        // Level 1: Memory cache (fastest)
        memoryCache.get(productId)?.let { return it }

        // Level 2: Database (fast, survives process death)
        dao.getProduct(productId)?.let { entity ->
            val product = entity.toDomain()
            memoryCache.put(productId, product)
            return product
        }

        // Level 3: Network (slowest, authoritative)
        val dto = api.getProduct(productId)
        dao.insert(dto.toEntity())
        val product = dto.toDomain()
        memoryCache.put(productId, product)
        return product
    }

    fun observeProducts(): Flow<List<Product>> {
        return dao.observeAll().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    suspend fun refreshProducts() {
        val dtos = api.getAllProducts()
        dao.replaceAll(dtos.map { it.toEntity() })
        memoryCache.evictAll()  // Memory cache is stale after refresh
    }
}
```

This three-tier pattern (memory, then disk, then network) is the same thing image loading libraries like Coil and Glide use internally. The first tier is the fastest and cheapest. Each successive tier is slower but more persistent. The memory cache evicts on process death, the disk cache evicts on storage pressure, and the network is the ultimate source of truth.

Notice how `getProduct` also populates the faster caches as it falls through. When you fetch from the network, the result gets stored in both the database and the memory cache. Next time you ask for the same product, it comes straight from memory — no database query, no network call.

> **⚡ Quick check:** In the `refreshProducts` function, why do we call `memoryCache.evictAll()` after replacing the database entries? What would happen if we skipped that line?

## Cache Invalidation Strategies

Alright, here's where caching gets painful. Storing data is the easy part — knowing when to throw it away is the hard part. I mean genuinely hard. It's one of those problems that sounds simple until you're debugging why a user sees their old profile photo three days after they changed it.

There are several strategies, and choosing the right one depends on your data's update frequency and the cost of showing stale data.

**Time-based expiration** — The simplest strategy. Cache entries expire after a fixed duration. Good for data that changes on a known schedule (exchange rates updated hourly, weather forecasts updated every 30 minutes). Bad for data that changes unpredictably (chat messages, real-time inventory). It's the "set it and forget it" approach — easy to implement, but blunt.

**Event-based invalidation** — Clear the cache when a specific event happens. User places an order? Invalidate the order list cache. User updates their profile? Invalidate the profile cache. This is more precise than time-based but requires you to know all the events that can invalidate the data. Miss one event, and you've got a stale cache that nobody notices until a user files a bug report.

**Write-through** — When the app writes data, update both the cache and the backend simultaneously. This ensures the cache is always consistent with the latest known state. Room's `Flow` observation does this automatically — insert into the database, and all `Flow` collectors get the updated data. It's elegant because the cache never disagrees with the source of truth.

**Stale-while-revalidate** — Show cached data immediately, then fetch fresh data in the background and update the UI when it arrives. This gives the user instant content while ensuring eventual freshness. It's the pattern behind "pull to refresh" — the user sees cached data, swipes, and the UI updates with fresh data when the network request completes. The tradeoff? The user might briefly see outdated information before the refresh lands.

> **🔥 Real talk:** IMO, the biggest caching mistake is caching too aggressively. Showing the user data from three days ago because the cache hasn't expired is worse than showing a loading spinner for 500ms while you fetch fresh data. I've seen apps where the user changes their username, navigates back, and sees the old name staring right back at them. Cache for performance, but validate for correctness. When in doubt, shorter cache durations with background refresh are safer than long cache durations with stale data.

Thanks for reading!
