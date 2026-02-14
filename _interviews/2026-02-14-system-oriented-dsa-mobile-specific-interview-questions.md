---
title: "System-Oriented DSA (Mobile-Specific)"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 13
---

## System-Oriented DSA (Mobile-Specific)

These questions bridge the gap between pure DSA and real mobile engineering. Interviewers at companies like Google and Meta use them to test whether you can implement the data structures behind caching, rate limiting, and offline support — not just use libraries that wrap them.

### Core Questions

#### Q1: How do you implement an LRU Cache from scratch?

An LRU (Least Recently Used) Cache evicts the oldest accessed item when full. Use a HashMap for O(1) key lookup and a doubly linked list for O(1) order management. Most recently used items go to the head, the tail holds the eviction candidate.

On `get`, move the accessed node to the head. On `put`, insert at the head and remove the tail if over capacity. Both operations are O(1).

```kotlin
class LRUCache(private val capacity: Int) {
    private data class Node(
        val key: Int, var value: Int,
        var prev: Node? = null, var next: Node? = null
    )
    private val map = HashMap<Int, Node>()
    private val head = Node(0, 0)
    private val tail = Node(0, 0)
    init { head.next = tail; tail.prev = head }

    fun get(key: Int): Int {
        val node = map[key] ?: return -1
        remove(node); addToHead(node)
        return node.value
    }

    fun put(key: Int, value: Int) {
        if (map.containsKey(key)) {
            val node = map[key]!!
            node.value = value
            remove(node); addToHead(node)
        } else {
            val node = Node(key, value)
            map[key] = node; addToHead(node)
            if (map.size > capacity) {
                val lru = tail.prev!!
                remove(lru); map.remove(lru.key)
            }
        }
    }

    private fun addToHead(node: Node) {
        node.next = head.next; node.prev = head
        head.next?.prev = node; head.next = node
    }

    private fun remove(node: Node) {
        node.prev?.next = node.next
        node.next?.prev = node.prev
    }
}
```

Sentinel head and tail nodes eliminate null checks entirely. This is the most frequently asked design-meets-DSA problem.

#### Q2: What makes LFU Cache different from LRU, and how do you implement it?

LFU (Least Frequently Used) evicts the item with the lowest access count. If there's a tie, evict the least recently used among them. You need three structures: a HashMap for key-to-node lookup, a HashMap mapping frequency to a linked list of nodes at that frequency, and a `minFreq` counter.

On `get`, increment the node's frequency and move it from the old frequency list to the new one. On `put`, insert with frequency 1 and set `minFreq = 1`. Evict from the `minFreq` list when over capacity. All operations stay O(1).

```kotlin
class LFUCache(private val capacity: Int) {
    private data class Node(
        val key: Int, var value: Int, var freq: Int = 1
    )
    private val keyMap = HashMap<Int, Node>()
    private val freqMap = HashMap<Int, LinkedHashSet<Int>>()
    private var minFreq = 0

    fun get(key: Int): Int {
        val node = keyMap[key] ?: return -1
        updateFreq(key, node)
        return node.value
    }

    fun put(key: Int, value: Int) {
        if (capacity == 0) return
        if (keyMap.containsKey(key)) {
            val node = keyMap[key]!!
            node.value = value
            updateFreq(key, node)
        } else {
            if (keyMap.size >= capacity) evict()
            val node = Node(key, value)
            keyMap[key] = node
            freqMap.getOrPut(1) { LinkedHashSet() }.add(key)
            minFreq = 1
        }
    }

    private fun updateFreq(key: Int, node: Node) {
        val oldFreq = node.freq
        freqMap[oldFreq]?.remove(key)
        if (freqMap[oldFreq]?.isEmpty() == true) {
            freqMap.remove(oldFreq)
            if (minFreq == oldFreq) minFreq++
        }
        node.freq++
        freqMap.getOrPut(node.freq) { LinkedHashSet() }.add(key)
    }

    private fun evict() {
        val keys = freqMap[minFreq] ?: return
        val evictKey = keys.first()
        keys.remove(evictKey)
        if (keys.isEmpty()) freqMap.remove(minFreq)
        keyMap.remove(evictKey)
    }
}
```

`LinkedHashSet` preserves insertion order within each frequency bucket, giving LRU behavior for tie-breaking.

#### Q3: How does a token bucket rate limiter work?

A token bucket starts full and refills at a fixed rate. Each request consumes one token. If the bucket is empty, the request is rejected. This allows short bursts (up to the bucket capacity) while enforcing a long-term average rate.

Track the token count and the last refill timestamp. On each request, compute how many tokens should have been added since the last check, cap at the bucket capacity, and try to consume one.

```kotlin
class TokenBucketRateLimiter(
    private val maxTokens: Int,
    private val refillRate: Double
) {
    private var tokens = maxTokens.toDouble()
    private var lastRefill = System.nanoTime()

    fun allowRequest(): Boolean {
        refill()
        return if (tokens >= 1.0) {
            tokens -= 1.0
            true
        } else false
    }

    private fun refill() {
        val now = System.nanoTime()
        val elapsed = (now - lastRefill) / 1_000_000_000.0
        tokens = minOf(maxTokens.toDouble(), tokens + elapsed * refillRate)
        lastRefill = now
    }
}
```

#### Q4: How does a sliding window rate limiter differ from token bucket?

A sliding window tracks the exact timestamps of recent requests within a time window. When a new request arrives, remove expired timestamps and check if the count is under the limit. It's more precise than token bucket — no burst allowance — but uses more memory because you store every timestamp.

```kotlin
class SlidingWindowRateLimiter(
    private val maxRequests: Int,
    private val windowMillis: Long
) {
    private val timestamps = ArrayDeque<Long>()

    fun allowRequest(): Boolean {
        val now = System.currentTimeMillis()
        while (timestamps.isNotEmpty() &&
            now - timestamps.first() > windowMillis) {
            timestamps.removeFirst()
        }
        return if (timestamps.size < maxRequests) {
            timestamps.addLast(now)
            true
        } else false
    }
}
```

Token bucket is better for APIs that want to allow controlled bursts. Sliding window is stricter and gives a hard cap within any window period. In mobile apps, rate limiters protect against accidental rapid-fire API calls from retry loops or gesture handlers.

#### Q5: How do you implement debounce and throttle?

Debounce delays execution until input stops for a specified duration. Throttle ensures execution happens at most once per interval. Both are critical in mobile for search-as-you-type, scroll listeners, and button click protection.

```kotlin
class Debouncer(private val delayMillis: Long) {
    private var job: Job? = null

    fun debounce(
        scope: CoroutineScope,
        action: suspend () -> Unit
    ) {
        job?.cancel()
        job = scope.launch {
            delay(delayMillis)
            action()
        }
    }
}

class Throttler(private val intervalMillis: Long) {
    private var lastExecution = 0L

    fun throttle(action: () -> Unit) {
        val now = System.currentTimeMillis()
        if (now - lastExecution >= intervalMillis) {
            lastExecution = now
            action()
        }
    }
}
```

Debounce cancels the previous pending call on each new input, so only the last one fires. Throttle ignores calls that happen too soon after the last execution.

#### Q6: How do you implement cursor-based pagination?

Cursor-based pagination uses the last item's identifier as a reference point instead of an offset. The client sends the cursor (usually the last item's ID or timestamp), and the server returns items after that cursor. It's more stable than offset-based pagination because inserting or deleting items doesn't shift pages.

```kotlin
data class Page<T>(val items: List<T>, val nextCursor: String?)

fun <T> paginate(
    allItems: List<T>,
    cursor: String?,
    pageSize: Int,
    getId: (T) -> String
): Page<T> {
    val startIndex = if (cursor == null) 0
        else allItems.indexOfFirst { getId(it) == cursor } + 1
    val items = allItems.subList(
        startIndex,
        minOf(startIndex + pageSize, allItems.size)
    )
    val nextCursor = if (items.size == pageSize)
        getId(items.last()) else null
    return Page(items, nextCursor)
}
```

In mobile, cursor pagination works well with `LazyColumn`/`RecyclerView` because you load the next page when the user scrolls near the bottom. Offset-based pagination breaks when items are added or removed between page loads.

### Deep Dive Questions

#### Q7: How do you design a two-level image cache (memory + disk)?

Use an LRU cache in memory for fast access and a disk cache for persistence across app restarts. Check memory first, then disk, then network. Write to both caches on a successful network fetch. This is how Coil, Glide, and Picasso work internally.

The memory cache should be sized relative to available heap — typically 1/8 of max memory. The disk cache needs a fixed size limit with LRU eviction. Keys are usually URL hashes.

```kotlin
class ImageCache(
    memoryMaxSize: Int,
    private val diskCacheDir: File,
    private val diskMaxSize: Long
) {
    private val memoryCache = object : LruCache<String, Bitmap>(memoryMaxSize) {
        override fun sizeOf(key: String, value: Bitmap): Int {
            return value.byteCount
        }
    }

    fun get(url: String): Bitmap? {
        val key = url.hashCode().toString()
        memoryCache.get(key)?.let { return it }
        val file = File(diskCacheDir, key)
        if (file.exists()) {
            val bitmap = BitmapFactory.decodeFile(file.path)
            bitmap?.let { memoryCache.put(key, it) }
            return bitmap
        }
        return null
    }

    fun put(url: String, bitmap: Bitmap) {
        val key = url.hashCode().toString()
        memoryCache.put(key, bitmap)
        val file = File(diskCacheDir, key)
        file.outputStream().use {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }
}
```

Memory eviction happens automatically via `LruCache`. Disk eviction needs a separate pass that deletes oldest files when total size exceeds the limit.

#### Q8: How do you implement an offline queue with retry and exponential backoff?

Queue failed requests locally and retry them when connectivity returns. Each retry doubles the delay (exponential backoff) with a cap and optional jitter to prevent thundering herd when many clients reconnect simultaneously.

```kotlin
data class QueuedRequest(
    val id: String,
    val payload: String,
    var retryCount: Int = 0,
    val maxRetries: Int = 5
)

class OfflineQueue {
    private val queue = ArrayDeque<QueuedRequest>()

    fun enqueue(request: QueuedRequest) {
        queue.addLast(request)
    }

    suspend fun processQueue(sendRequest: suspend (String) -> Boolean) {
        while (queue.isNotEmpty()) {
            val request = queue.first()
            val delay = computeBackoff(request.retryCount)
            delay(delay)
            val success = sendRequest(request.payload)
            if (success) {
                queue.removeFirst()
            } else if (request.retryCount < request.maxRetries) {
                request.retryCount++
            } else {
                queue.removeFirst() // drop after max retries
            }
        }
    }

    private fun computeBackoff(retryCount: Int): Long {
        val base = 1000L
        val maxDelay = 30_000L
        val delay = base * (1L shl minOf(retryCount, 5))
        val jitter = (Math.random() * delay * 0.1).toLong()
        return minOf(delay + jitter, maxDelay)
    }
}
```

The jitter prevents all clients from retrying at the exact same time after a server outage. In Android, you'd typically persist this queue with Room and trigger processing via WorkManager when connectivity is restored.

#### Q9: How do you deduplicate events in a stream?

Use a seen set with expiration. For each incoming event, check if its ID exists in the set. If yes, drop it. If no, process it and add the ID. To prevent the set from growing forever, use a time-based eviction — events older than a TTL get removed.

```kotlin
class EventDeduplicator(private val ttlMillis: Long) {
    private val seen = LinkedHashMap<String, Long>(
        16, 0.75f, true
    )

    fun isDuplicate(eventId: String): Boolean {
        evictExpired()
        val now = System.currentTimeMillis()
        return if (seen.containsKey(eventId)) {
            true
        } else {
            seen[eventId] = now
            false
        }
    }

    private fun evictExpired() {
        val now = System.currentTimeMillis()
        val iterator = seen.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (now - entry.value > ttlMillis) iterator.remove()
            else break
        }
    }
}
```

`LinkedHashMap` with access order keeps the oldest entries at the front, so eviction scans from the beginning and stops early. This pattern is common in analytics SDKs and push notification handlers where duplicate events can cause double counting or duplicate UI updates.

#### Q10: How do you find the top-K elements from a stream of data?

Use a min-heap of size K. For each incoming element, if the heap has fewer than K items, add it. Otherwise, compare with the heap's minimum — if the new element is larger, remove the min and insert the new one. The heap always contains the K largest elements seen so far. Time O(n log k) for n elements.

```kotlin
fun topKFrequent(nums: IntArray, k: Int): IntArray {
    val freqMap = HashMap<Int, Int>()
    for (num in nums) {
        freqMap[num] = freqMap.getOrDefault(num, 0) + 1
    }
    val minHeap = PriorityQueue<Int>(compareBy { freqMap[it] })
    for (key in freqMap.keys) {
        minHeap.add(key)
        if (minHeap.size > k) minHeap.poll()
    }
    return minHeap.toIntArray()
}
```

For a true streaming scenario where you don't have all the data upfront, maintain a frequency map that updates with each new element and adjust the heap accordingly. This is how analytics dashboards show "top queries" or "most viewed items" in real time.

#### Q11: How do you design a HashMap from scratch?

Use an array of buckets where each bucket is a linked list (separate chaining). Hash the key to find the bucket index, then search the chain for the key. When the load factor (entries / buckets) exceeds a threshold (typically 0.75), double the array size and rehash all entries.

```kotlin
class MyHashMap<K, V>(initialCapacity: Int = 16) {
    private data class Entry<K, V>(
        val key: K, var value: V, var next: Entry<K, V>? = null
    )
    private var buckets = arrayOfNulls<Entry<K, V>>(initialCapacity)
    private var size = 0

    fun put(key: K, value: V) {
        if (size.toFloat() / buckets.size > 0.75f) resize()
        val index = index(key)
        var entry = buckets[index]
        while (entry != null) {
            if (entry.key == key) { entry.value = value; return }
            entry = entry.next
        }
        val newEntry = Entry(key, value, buckets[index])
        buckets[index] = newEntry
        size++
    }

    fun get(key: K): V? {
        var entry = buckets[index(key)]
        while (entry != null) {
            if (entry.key == key) return entry.value
            entry = entry.next
        }
        return null
    }

    private fun index(key: K): Int = (key.hashCode() and 0x7fffffff) % buckets.size

    private fun resize() {
        val newBuckets = arrayOfNulls<Entry<K, V>>(buckets.size * 2)
        for (bucket in buckets) {
            var entry = bucket
            while (entry != null) {
                val next = entry.next
                val idx = (entry.key.hashCode() and 0x7fffffff) % newBuckets.size
                entry.next = newBuckets[idx]
                newBuckets[idx] = entry
                entry = next
            }
        }
        buckets = newBuckets
    }
}
```

The `and 0x7fffffff` masks off the sign bit to ensure a non-negative index. Real implementations like Java's `HashMap` also use tree bins (red-black trees) when chains get too long (8+ entries) to keep worst-case lookup at O(log n) instead of O(n).

#### Q12: How does exponential backoff prevent thundering herd problems?

When a server goes down and comes back, all waiting clients would retry simultaneously without backoff. Exponential backoff spreads retries over time by doubling the wait with each attempt — 1s, 2s, 4s, 8s, etc. Adding random jitter (small random addition to the delay) ensures clients don't all pick the same retry time even with the same backoff schedule.

The formula is typically `min(baseDelay * 2^attempt + random(0, jitterRange), maxDelay)`. Cap the max delay to prevent absurdly long waits. In mobile, this applies to API retries, push notification reconnection, WebSocket reconnection, and sync jobs.

#### Q13: How would you implement a time-based key-value store?

Store multiple values per key, each with a timestamp. On `get(key, timestamp)`, return the value with the largest timestamp that's less than or equal to the requested timestamp. Use a TreeMap (sorted map) per key for O(log n) lookups via `floorEntry`.

```kotlin
class TimeMap {
    private val map = HashMap<String, TreeMap<Int, String>>()

    fun set(key: String, value: String, timestamp: Int) {
        map.getOrPut(key) { TreeMap() }[timestamp] = value
    }

    fun get(key: String, timestamp: Int): String {
        val treeMap = map[key] ?: return ""
        val entry = treeMap.floorEntry(timestamp)
        return entry?.value ?: ""
    }
}
```

If timestamps are always increasing (which is common), you can use a list with binary search instead of a TreeMap for better cache performance. This data structure is useful in versioned configs, undo/redo systems, and feature flag rollouts.

#### Q14: How do you implement a moving average from a data stream?

Maintain a queue of the last N values. On each new value, add it to the queue and remove the oldest if the queue exceeds N. Keep a running sum to avoid recomputing the average from scratch each time. Time O(1) per operation.

```kotlin
class MovingAverage(private val windowSize: Int) {
    private val queue = ArrayDeque<Int>()
    private var sum = 0.0

    fun next(value: Int): Double {
        queue.addLast(value)
        sum += value
        if (queue.size > windowSize) {
            sum -= queue.removeFirst()
        }
        return sum / queue.size
    }
}
```

This comes up in mobile for smoothing sensor data (accelerometer, gyroscope), computing rolling frame rates, and averaging network latency for adaptive quality decisions.

#### Q15: How would you design a simple task scheduler with cooldown?

Given tasks with a cooldown period (the same task can't run again within n intervals), find the minimum time to complete all tasks. Use a max-heap to always pick the most frequent task first, and a cooldown queue to hold tasks that are waiting.

```kotlin
fun leastInterval(tasks: CharArray, n: Int): Int {
    val freq = IntArray(26)
    for (task in tasks) freq[task - 'A']++
    val maxHeap = PriorityQueue<Int>(compareByDescending { it })
    for (f in freq) if (f > 0) maxHeap.add(f)
    val cooldown = ArrayDeque<Pair<Int, Int>>()
    var time = 0
    while (maxHeap.isNotEmpty() || cooldown.isNotEmpty()) {
        time++
        if (maxHeap.isNotEmpty()) {
            val count = maxHeap.poll() - 1
            if (count > 0) cooldown.addLast(count to time + n)
        }
        if (cooldown.isNotEmpty() && cooldown.first().second == time) {
            maxHeap.add(cooldown.removeFirst().first)
        }
    }
    return time
}
```

The greedy approach works because executing the most frequent task first minimizes idle slots. This is the same principle behind CPU scheduling and job queuing in mobile background task systems.

### Common Follow-ups

- What's the difference between LRU and LFU in terms of cache hit rate for different access patterns?
- How would you handle concurrent access to the LRU Cache on Android (thread safety)?
- How does OkHttp implement its connection pool, and what eviction strategy does it use?
- How would you persist the offline queue across app restarts?
- What's the space complexity tradeoff between sliding window and fixed window rate limiting?
- How would you implement an LRU cache with a TTL (time-to-live) for each entry?
- How do real image loading libraries like Coil handle memory pressure callbacks from the system?
- What happens to your HashMap performance when the hash function produces many collisions?
