---
layout: post
title: "Caching in Android: Memory and Disk Cache Implementation"
categories: post
tags:
  - Android
  - Cache
---
When building Android applications that load images from URLs, implementing an efficient caching strategy is crucial for performance and user experience. Without proper caching, your app might repeatedly download the same images, leading to poor performance and potential Out of Memory (OOM) exceptions. Caching is a technique to store frequently accessed data for quick retrieval. In Android, we have two main types of caching:

**Memory Cache** which stores data in the application's memory (cleared when app is destroyed) and **Disk Cache** which stores data in device storage (persists after app destruction)

## Implementation

In simple Cache implementation using memory cache manager:

```kotlin
class CacheManager<T> {
    private val cache = HashMap<String, T>()
    
    fun put(key: String, value: T) {
        cache[key] = value
    }

    fun get(key: String): T? {
        return cache[key]
    }
}

// Usage
val manager = CacheManager<User>()
manager.put("key_1", User(id = 1))
val user = manager.get("key_1")
```

In LruCache (Least Recently Used Cache) is Android's recommended way to implement memory caching. It automatically manages cache size and removes least recently used items when the cache is full.

```kotlin
// Create LruCache with size limit
val lruCache = LruCache<String, User>(1000) // maxSize = 1000

// Store and retrieve data
lruCache.put("key_1", User(id = 1))
val user = lruCache.get("key_1")
```

To avoid OOM exceptions, calculate cache size based on available memory:

```kotlin
val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
val sizeInBytes = activityManager.memoryClass * 1024 * 1024
// Use 1/8th of available memory for cache
val cache = LruCache<String, User>(sizeInBytes / 8)
```

For persistent storage, disk caching is essential. Here's how to implement it using Okio:

```kotlin
// Create cache file
val file = File("${externalCacheDir}/cache12.txt")
if(!file.exists()) {
   file.createNewFile()
}

// Write to cache
val sink = file.sink()
val bufferSink = sink.buffer()
bufferSink.writeUtf8("hi, i'm cache")
bufferSink.close()

// Read from cache
val source = file.source()
val bufferSource = source.buffer()
val content = bufferSource.readUtf8()
bufferSource.close()
```

**Memory Cache**:
- Use LruCache for memory-efficient caching
- Calculate appropriate cache size based on available memory
- Clear cache when memory is low

**Disk Cache**:
- Use external storage for large files
- Implement proper file management
- Consider using Room database for structured data
- Use Okio for efficient file operations

**General Tips**:
- Implement both memory and disk caching for optimal performance
- Clear old cache entries periodically
- Handle cache misses gracefully
- Monitor cache size and memory usage

In Conclusion, Implementing proper caching strategies is essential for building performant Android applications. By using both memory and disk caching appropriately, you can significantly improve your app's performance and user experience while preventing common issues like OOM exceptions.

Remember to choose the right caching strategy based on your specific use case and data requirements. Whether you're caching images, API responses, or other data, a well-implemented caching system will make your app more efficient and responsive. 