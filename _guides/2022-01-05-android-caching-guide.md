---
title: How To Cache In Android?
layout: post
sequence: 58
categories: post
tags:
  - Android
  - Performance
---

The first time I really understood caching was when I profiled an app that was making the same API call every time the user switched tabs. Three tabs, two switches per session — that's six identical network requests in under a minute. The response was 200KB of JSON that hadn't changed in hours. The fix was a one-line cache header, and it cut the average session's network usage by 70%. Caching isn't just an optimization — it's the difference between an app that feels fast and one that makes the user wait for data they already had five seconds ago.

Android offers caching at multiple levels — memory, disk, and HTTP — and choosing the right layer depends on what you're caching, how often it changes, and how expensive it is to re-fetch. The tricky part isn't implementing the cache. It's invalidating it correctly. As the old joke goes, there are only two hard things in computer science: cache invalidation and naming things.

## Memory Cache With LruCache

Android's `LruCache` (Least Recently Used Cache) is the standard tool for in-memory caching. It holds objects in a `LinkedHashMap`, and when the cache exceeds its size limit, it evicts the least recently accessed entry. This is exactly the behavior you want for most caches — keep hot data available and let cold data fall out.

The critical design decision is the cache size. Too small, and entries get evicted before they're reused. Too large, and you risk `OutOfMemoryError`. Android's guidance is to use a fraction of the available heap — typically 1/8th of the memory class.

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

The `sizeOf` override is essential. Without it, `LruCache` counts entries by quantity (default size is 1 per entry), which means a 10KB thumbnail and a 5MB full-resolution image count the same. By overriding `sizeOf` to return the bitmap's byte count, the cache manages its memory correctly — a few large images fill the cache faster than many small ones.

Real-world use case: caching decoded Bitmaps for a RecyclerView image gallery. The user scrolls through a list, and previously viewed images are instantly available from the memory cache on scroll-back. Libraries like Coil and Glide implement this pattern internally with multiple cache tiers, but understanding `LruCache` helps when you need to cache non-image data — parsed configuration, computed layout metrics, or expensive object graphs.

One important detail: `LruCache` is thread-safe. `get` and `put` are synchronized internally, so you can safely access it from multiple threads without external locking. This matters when background threads are loading images while the main thread is reading them for display.

## Disk Cache

Memory cache is fast but volatile — it's cleared when the app process dies or when the system reclaims memory. For data that should survive app restarts, you need disk cache.

The simplest disk cache is a file in the app's cache directory. Android provides `context.cacheDir` for internal cache and `context.externalCacheDir` for external cache. The system can clear the cache directory when the device is low on storage, so don't store anything critical there — it's truly a cache, not persistent storage.

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

I MD5 the cache key to create safe filenames — API URLs contain characters that aren't valid in filenames (`/`, `?`, `&`). The `maxAgeMs` parameter implements time-based expiration. If the cached file is older than the max age, it's treated as a miss and deleted.

For structured data that needs querying, Room (or DataStore for key-value pairs) is a better disk cache than raw files. Room gives you indexes, queries, and reactive observation. Raw files are simpler for "store this blob, give it back later" patterns.

## HTTP Caching

The most efficient cache is one you don't have to build yourself. HTTP caching, built into OkHttp, uses standard HTTP headers to determine when a response can be reused, when it needs validation, and when it must be fetched fresh. This works at the network layer, below your application code.

```kotlin
val cacheDir = File(context.cacheDir, "http_cache")
val cacheSize = 50L * 1024 * 1024  // 50 MB

val okHttpClient = OkHttpClient.Builder()
    .cache(Cache(cacheDir, cacheSize))
    .build()
```

That's it for the client side. The server controls the behavior through response headers:

**`Cache-Control: max-age=3600`** — The response is fresh for 3600 seconds. OkHttp serves it from disk cache without hitting the network. This is what you want for data that changes infrequently — user profile images, configuration endpoints, static content.

**`ETag`** and **`If-None-Match`** — The server sends an `ETag` (a hash of the response content) with the first response. On subsequent requests, OkHttp sends `If-None-Match: <etag>`. If the content hasn't changed, the server responds with `304 Not Modified` (no body), and OkHttp uses the cached version. This saves bandwidth — the response body isn't transmitted — but still requires a network round-trip.

**`Cache-Control: no-cache`** — Forces revalidation with the server on every request. The cache is used as a fallback, but OkHttp always checks with the server first. Use this for data that changes frequently but where you still want offline support.

For APIs you don't control (where the server doesn't send cache headers), you can add them via an OkHttp interceptor:

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

This forces a 10-minute cache on responses that don't set their own cache headers. It's a blunt tool — you're overriding the server's intent — but it's useful for third-party APIs that don't implement proper HTTP caching.

## Repository Caching Pattern

In a Clean Architecture app, the repository is the natural place to implement caching logic. It coordinates between memory cache, disk cache, and the network, deciding where to read from and when to refresh.

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

The three-tier pattern (memory → disk → network) is what image loading libraries like Coil and Glide use internally. The first tier is the fastest and cheapest, and each successive tier is slower but more persistent. The memory cache evicts on process death, the disk cache evicts on storage pressure, and the network is the ultimate source of truth.

## Cache Invalidation Strategies

The hardest part of caching is knowing when the cache is stale. There are several strategies, and choosing the right one depends on your data's update frequency and the cost of showing stale data.

**Time-based expiration** — The simplest strategy. Cache entries expire after a fixed duration. Good for data that changes on a known schedule (exchange rates updated hourly, weather forecasts updated every 30 minutes). Bad for data that changes unpredictably (chat messages, real-time inventory).

**Event-based invalidation** — Clear the cache when a specific event happens. User places an order? Invalidate the order list cache. User updates their profile? Invalidate the profile cache. This is more precise than time-based but requires you to know all the events that can invalidate the data.

**Write-through** — When the app writes data, update both the cache and the backend simultaneously. This ensures the cache is always consistent with the latest known state. Room's `Flow` observation does this automatically — insert into the database, and all `Flow` collectors get the updated data.

**Stale-while-revalidate** — Show cached data immediately, then fetch fresh data in the background and update the UI when it arrives. This gives the user instant content while ensuring eventual freshness. It's the pattern behind "pull to refresh" — the user sees cached data, swipes, and the UI updates with fresh data when the network request completes.

IMO, the biggest caching mistake is caching too aggressively. Showing the user data from three days ago because the cache hasn't expired is worse than showing a loading spinner for 500ms while you fetch fresh data. Cache for performance, but validate for correctness. When in doubt, shorter cache durations with background refresh are safer than long cache durations with stale data.

Thanks for reading!
