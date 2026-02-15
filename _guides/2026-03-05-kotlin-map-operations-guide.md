---
title: Kotlin Map Operations Guide
layout: post
sequence: 99
categories: post
tags:
  - Kotlin
  - Android
---

If you've worked on any non-trivial Android app, you've used maps more than you probably realize. Caching parsed JSON responses, storing feature flags, building request headers, mapping user IDs to profile data, holding configuration values that change per build variant — maps are everywhere. I'd estimate that in most of the codebases I've worked on, maps account for more data access patterns than lists do once you move past the UI layer. Yet most Android developers I've worked with stick to the same three or four operations: create it, put stuff in, get stuff out, maybe iterate. They treat Kotlin's Map the same way they treated Java's `HashMap`, which means they're leaving a lot of useful API surface on the table.

Kotlin's standard library treats maps as first-class citizens with a rich set of operations that Java never offered. Filtering, transforming, merging, lazy defaults, compute-if-absent — these aren't just convenience methods. They eliminate entire categories of bugs: the null checks you forget, the "check then put" race conditions, the verbose iteration boilerplate that obscures what the code actually does. Once you internalize these operations, you start writing map code that reads like a description of what you want, not a manual recipe for how to get it.

## Creating Maps

The most basic factory is `mapOf()` for read-only maps and `mutableMapOf()` for mutable ones. The `to` infix function creates `Pair` instances that serve as key-value entries, and it reads almost like a DSL.

```kotlin
val featureFlags = mapOf(
    "dark_mode" to true,
    "new_checkout" to false,
    "analytics_v2" to true
)

val headers = mutableMapOf(
    "Content-Type" to "application/json",
    "Accept" to "application/json"
)
headers["Authorization"] = "Bearer $token"
```

For more complex construction, `buildMap` is the function I reach for most often. It gives you a mutable map inside the lambda but returns an immutable one — you get the flexibility of mutation during construction without exposing mutability to the rest of your code.

```kotlin
val config = buildMap {
    put("base_url", BuildConfig.API_URL)
    put("timeout", "30")
    if (BuildConfig.DEBUG) {
        put("log_level", "VERBOSE")
        put("mock_enabled", "true")
    }
}
```

When you need a specific implementation rather than the default `LinkedHashMap`, Kotlin provides `hashMapOf()`, `linkedMapOf()`, and `sortedMapOf()`. In practice, I rarely reach for `hashMapOf()` because Kotlin's `mutableMapOf()` already returns a `LinkedHashMap`, which preserves insertion order and has essentially the same performance characteristics. But `sortedMapOf()` is genuinely useful when you need keys in natural order — alphabetical config dumps, sorted cache keys for debugging, or ordered time-series data.

## Accessing Values

This is where most codebases have the most bugs. The square bracket syntax `map[key]` calls `get()` under the hood and returns `null` if the key doesn't exist. That's fine when you expect keys to be missing. But when a missing key means something is broken — a required config value, a mandatory response field — returning null just delays the crash and makes it harder to debug.

`getValue()` is the answer for those cases. It throws `NoSuchElementException` immediately if the key is missing, which is exactly what you want when absence is a programming error. I use it for configuration maps where every key should be present, because a clear exception at the access site is infinitely better than a `NullPointerException` three method calls later.

```kotlin
val apiConfig = mapOf("base_url" to "https://api.example.com", "version" to "v2")

// Safe when key might not exist
val debugUrl: String? = apiConfig["debug_url"]

// Throws immediately if missing — use for required values
val baseUrl: String = apiConfig.getValue("base_url")
```

For cases where you want a fallback without null handling, `getOrDefault()` and `getOrElse()` serve different purposes. `getOrDefault()` takes a pre-computed default value. `getOrElse()` takes a lambda that only executes if the key is missing — important when computing the default is expensive.

```kotlin
val retryCount = settings.getOrDefault("max_retries", 3)

// Lambda only runs if "session_id" is missing
val sessionId = settings.getOrElse("session_id") {
    UUID.randomUUID().toString()
}
```

Then there's `getOrPut()`, which I think is the most underappreciated function in Kotlin's map API. It checks if a key exists, returns the value if it does, and if not, executes the lambda, stores the result in the map, and returns it. This is the compute-if-absent pattern that eliminates an entire class of "check, compute, put" boilerplate. It only works on mutable maps, and the lambda never runs if the key already has a value.

```kotlin
val userCache = mutableMapOf<String, UserProfile>()

fun getUser(userId: String): UserProfile {
    return userCache.getOrPut(userId) {
        // This only executes on cache miss
        userRepository.fetchProfile(userId)
    }
}
```

## Filtering and Transforming Maps

Kotlin gives you three filtering functions that cover different use cases. `filter` takes the full entry (key and value), `filterKeys` operates only on keys, and `filterValues` operates only on values. All three return new maps — they don't mutate the original.

```kotlin
val cache = mapOf(
    "user_1" to CacheEntry(data = profileData, expiresAt = now - 60_000),
    "user_2" to CacheEntry(data = profileData2, expiresAt = now + 60_000),
    "config" to CacheEntry(data = configData, expiresAt = now + 300_000)
)

// Remove expired entries
val validCache = cache.filterValues { it.expiresAt > System.currentTimeMillis() }

// Only user-related cache entries
val userEntries = cache.filterKeys { it.startsWith("user_") }

// Full entry access when you need both key and value
val largeUserEntries = cache.filter { (key, entry) ->
    key.startsWith("user_") && entry.data.sizeBytes > 1024
}
```

For transformations, `mapKeys` and `mapValues` let you transform one side of the map while preserving the other. This is something that was surprisingly verbose in Java — you'd iterate, build a new map, put entries in one by one. In Kotlin it's a single expression.

```kotlin
val response = mapOf("user_name" to "mukul", "user_email" to "m@test.com")

// Strip the "user_" prefix from all keys
val cleaned = response.mapKeys { (key, _) -> key.removePrefix("user_") }
// Result: {name=mukul, email=m@test.com}

// Transform values to uppercase
val normalized = response.mapValues { (_, value) -> value.uppercase() }
```

One thing to watch out for with `mapKeys`: if your transformation produces duplicate keys, later entries silently overwrite earlier ones. The function doesn't warn you. I've seen bugs where developers mapped keys to their first character and lost half their data because multiple keys started with the same letter.

## Merging and Combining

The `+` operator merges two maps, with the second map's values winning on key conflicts. It's clean and readable for simple merges.

```kotlin
val defaults = mapOf("timeout" to 30, "retries" to 3, "cache_ttl" to 300)
val overrides = mapOf("timeout" to 10, "retries" to 5)

val finalConfig = defaults + overrides
// Result: {timeout=10, retries=5, cache_ttl=300}
```

When you need custom conflict resolution — summing values, keeping the larger one, merging lists — `buildMap` with explicit logic gives you full control.

```kotlin
val localCounts = mapOf("login" to 5, "purchase" to 2, "search" to 10)
val remoteCounts = mapOf("login" to 3, "purchase" to 8, "share" to 1)

val merged = buildMap {
    putAll(localCounts)
    remoteCounts.forEach { (key, value) ->
        put(key, getOrDefault(key, 0) + value)
    }
}
// Result: {login=8, purchase=10, search=10, share=1}
```

`groupBy` is technically a collection operation, but it produces a map, and it's one of the most useful tools for restructuring data. It takes a list and groups elements by a key function, producing a `Map<K, List<V>>`.

```kotlin
data class Transaction(val userId: String, val amount: Double, val type: String)

val transactions = listOf(
    Transaction("user_1", 50.0, "purchase"),
    Transaction("user_2", 30.0, "refund"),
    Transaction("user_1", 20.0, "purchase"),
    Transaction("user_2", 15.0, "purchase")
)

val byUser = transactions.groupBy { it.userId }
// {user_1=[Transaction(...), Transaction(...)], user_2=[...]}

val byType = transactions.groupBy(
    keySelector = { it.type },
    valueTransform = { it.amount }
)
// {purchase=[50.0, 20.0, 15.0], refund=[30.0]}
```

## Map Iteration Patterns

Kotlin's `forEach` with destructuring is the cleanest way to iterate. You get `key` and `value` as named parameters instead of dealing with `Map.Entry` objects.

```kotlin
val analytics = mapOf("screen_view" to 142, "button_click" to 89, "scroll" to 301)

analytics.forEach { (event, count) ->
    Log.d("Analytics", "$event: $count occurrences")
}
```

The `entries`, `keys`, and `values` properties give you different views of the same map. These aren't copies — they're live views backed by the map, which means changes to a mutable map reflect in these views immediately. This is a detail that trips people up: iterating over `entries` while modifying the map will throw `ConcurrentModificationException`.

When you need ordered iteration over a map that wasn't created with sorted keys, `toSortedMap()` creates a new `TreeMap` from the existing entries. I use this primarily for debugging and logging — when you dump a config map to logcat, alphabetical order makes it much easier to find what you're looking for.

```kotlin
val unordered = mapOf("zebra" to 1, "alpha" to 2, "mango" to 3)
unordered.toSortedMap().forEach { (key, value) ->
    println("$key -> $value")
}
// alpha -> 2, mango -> 3, zebra -> 1
```

## Performance Considerations

The default map implementation in Kotlin is `LinkedHashMap`, which maintains insertion order and gives you O(1) amortized lookup, insertion, and deletion. This is different from Java's default `HashMap`, which doesn't guarantee order. The Kotlin team made this choice deliberately — predictable iteration order prevents an entire class of bugs where code accidentally depends on map ordering.

`HashMap` (via `hashMapOf()`) drops the insertion-order guarantee in exchange for slightly less memory overhead. The difference is one extra linked list pointer per entry. In practice, this only matters if you're storing millions of entries. For the typical Android use case — caching a few hundred items, storing a couple dozen config values — `LinkedHashMap` is the right default and you shouldn't think twice about it.

`TreeMap` (via `sortedMapOf()`) keeps keys sorted using their natural ordering or a custom `Comparator`. The tradeoff is that every operation becomes O(log n) instead of O(1). That sounds worse on paper, but sorted iteration is free — you don't pay the O(n log n) cost of sorting after the fact. If you need sorted keys more often than you need raw access speed, `TreeMap` wins.

For concurrent access, `ConcurrentHashMap` from `java.util.concurrent` is the only safe choice without external synchronization. A regular `HashMap` or `LinkedHashMap` accessed from multiple threads — say, a cache written from a coroutine on `Dispatchers.IO` and read from the main thread — will eventually corrupt data silently. No crash, no exception, just wrong values. I've debugged production issues caused by exactly this. `ConcurrentHashMap` uses lock striping internally, which means multiple threads can read and write simultaneously with minimal contention. The tradeoff is that compound operations like "check if key exists, then put" aren't atomic — you need `putIfAbsent()` or `computeIfAbsent()` for those.

Here's my rule of thumb: use the default `mutableMapOf()` (which gives you `LinkedHashMap`) for everything single-threaded. Use `ConcurrentHashMap` the moment more than one thread touches the map. Use `sortedMapOf()` when you iterate in key order more often than you do point lookups. And never use `hashMapOf()` unless you've profiled and the memory overhead of `LinkedHashMap` actually matters — which it almost never does.

## Quiz

#### What's the difference between `get()` and `getValue()` on a Kotlin Map?

- **Wrong** They're identical
- **Correct** `get()` returns null if the key is missing; `getValue()` throws NoSuchElementException
- **Wrong** `get()` is faster than `getValue()`
- **Wrong** `getValue()` returns a default value instead of throwing

> **Explanation:** `map[key]` (which calls `get()`) returns null for missing keys — safe but requires null handling. `getValue(key)` throws `NoSuchElementException` if the key isn't found — use it when missing keys indicate a programming error.

#### What does `getOrPut()` do?

- **Wrong** Returns the value or puts null for the key
- **Correct** Returns the existing value if present, otherwise computes the value from the lambda, stores it in the map, and returns it
- **Wrong** Throws if the key already exists
- **Wrong** Only works with mutable maps and always overwrites

> **Explanation:** `getOrPut("key") { computeValue() }` is a compute-if-absent pattern. If the key exists, it returns the existing value (lambda is never called). If missing, it calls the lambda, stores the result, and returns it. Perfect for caching.

## Coding Challenge

Build a `SimpleCache<K, V>` class backed by a LinkedHashMap that: supports get/put operations, has a `maxSize` with LRU eviction (oldest entries removed first), provides `getOrCompute(key, compute)` using getOrPut with eviction, and has `stats()` returning hit/miss counts. Use map operations throughout — no manual iteration.

#### Solution

```kotlin
class SimpleCache<K, V>(private val maxSize: Int) {
    private var hits = 0
    private var misses = 0

    // accessOrder = true makes LinkedHashMap order by last access (LRU)
    private val map = object : LinkedHashMap<K, V>(maxSize, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>?): Boolean {
            return size > maxSize
        }
    }

    fun get(key: K): V? {
        val value = map[key]
        if (value != null) hits++ else misses++
        return value
    }

    fun put(key: K, value: V) {
        map[key] = value
    }

    fun getOrCompute(key: K, compute: () -> V): V {
        val existed = map.containsKey(key)
        val value = map.getOrPut(key) { compute() }
        if (existed) hits++ else misses++
        return value
    }

    fun stats(): Map<String, Int> = mapOf(
        "hits" to hits,
        "misses" to misses,
        "size" to map.size,
        "hit_rate_pct" to if (hits + misses > 0) (hits * 100) / (hits + misses) else 0
    )
}

// Usage
val imageCache = SimpleCache<String, ByteArray>(maxSize = 100)
val avatar = imageCache.getOrCompute("user_42_avatar") {
    networkClient.downloadImage("https://cdn.example.com/avatars/42.png")
}
println(imageCache.stats()) // {hits=0, misses=1, size=1, hit_rate_pct=0}
```

Thanks for reading!
