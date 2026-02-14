---
title: "System-Oriented DSA"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 13
sequence: 53
description: "System-oriented DSA questions bridge the gap between algorithms and real-world systems."
---

## System-Oriented DSA

System-oriented DSA questions bridge the gap between algorithms and real-world systems. These problems require combining multiple data structures — hash maps, heaps, linked lists — to meet specific performance constraints. LRU Cache is by far the most commonly asked.

#### How do you implement an LRU Cache with O(1) get and put?

HashMap for O(1) key lookup. Doubly linked list for O(1) insertion and removal. Most recently used goes to head, least recently used lives at tail. On get, move to head. On put, add to head, evict tail if over capacity.

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

#### How does an LFU Cache differ from LRU?

LRU evicts the least recently used item. LFU evicts the least frequently used — the item accessed the fewest times. LFU needs three maps: key-to-value, key-to-frequency, and frequency-to-list-of-keys. On a tie in frequency, evict the least recently used among those.

#### How do you design a HashMap from scratch?

Array of buckets. Hash function maps keys to indices. Handle collisions with chaining (linked list per bucket) or open addressing. Load factor controls resizing — when it exceeds 0.75, double the array and rehash all entries.

```kotlin
class MyHashMap(private var capacity: Int = 16) {
    private data class Entry(val key: Int, var value: Int, var next: Entry? = null)
    private var buckets = arrayOfNulls<Entry>(capacity)
    private var size = 0

    fun put(key: Int, value: Int) {
        if (size.toFloat() / capacity > 0.75) resize()
        val idx = key.hashCode() and (capacity - 1)
        var entry = buckets[idx]
        while (entry != null) {
            if (entry.key == key) { entry.value = value; return }
            entry = entry.next
        }
        val newEntry = Entry(key, value, buckets[idx])
        buckets[idx] = newEntry
        size++
    }

    fun get(key: Int): Int {
        val idx = key.hashCode() and (capacity - 1)
        var entry = buckets[idx]
        while (entry != null) {
            if (entry.key == key) return entry.value
            entry = entry.next
        }
        return -1
    }

    private fun resize() {
        capacity *= 2
        val newBuckets = arrayOfNulls<Entry>(capacity)
        for (bucket in buckets) {
            var entry = bucket
            while (entry != null) {
                val next = entry.next
                val idx = entry.key.hashCode() and (capacity - 1)
                entry.next = newBuckets[idx]
                newBuckets[idx] = entry
                entry = next
            }
        }
        buckets = newBuckets
    }
}
```

#### How do you find the median from a data stream?

Use two heaps — a max-heap for the lower half and a min-heap for the upper half. Keep them balanced (sizes differ by at most 1). Median is the top of the larger heap or the average of both tops.

```kotlin
class MedianFinder {
    private val low = PriorityQueue<Int>(compareByDescending { it })
    private val high = PriorityQueue<Int>()

    fun addNum(num: Int) {
        low.add(num)
        high.add(low.poll())
        if (high.size > low.size) low.add(high.poll())
    }

    fun findMedian(): Double {
        return if (low.size > high.size) low.peek().toDouble()
               else (low.peek() + high.peek()) / 2.0
    }
}
```

All operations O(log n). This is a very common interview question.

#### How do you implement a Trie-based autocomplete system?

Trie stores words. Each node tracks top-k results or frequency. On each character typed, walk the Trie and return suggestions from the current node's subtree. Discussed in detail in the Tries post.

#### How do you design a Twitter/News Feed system using DSA?

HashMap maps each user to their tweets (a list sorted by timestamp). Follow relationships stored as a HashMap of sets. To generate feed, merge recent tweets from all followed users using a min-heap of size k. Basically a k-way merge problem.

```kotlin
class Twitter {
    private var timestamp = 0
    private val tweets = HashMap<Int, MutableList<Pair<Int, Int>>>() // userId -> (time, tweetId)
    private val follows = HashMap<Int, MutableSet<Int>>()

    fun postTweet(userId: Int, tweetId: Int) {
        tweets.getOrPut(userId) { mutableListOf() }
            .add(timestamp++ to tweetId)
    }

    fun getNewsFeed(userId: Int): List<Int> {
        val pq = PriorityQueue<Triple<Int, Int, Int>>(compareByDescending { it.first })
        val users = follows.getOrDefault(userId, mutableSetOf()) + userId
        for (u in users) {
            val userTweets = tweets[u] ?: continue
            for ((time, id) in userTweets.takeLast(10)) {
                pq.add(Triple(time, id, u))
            }
        }
        val result = mutableListOf<Int>()
        while (pq.isNotEmpty() && result.size < 10) {
            result.add(pq.poll().second)
        }
        return result
    }

    fun follow(followerId: Int, followeeId: Int) {
        follows.getOrPut(followerId) { mutableSetOf() }.add(followeeId)
    }

    fun unfollow(followerId: Int, followeeId: Int) {
        follows[followerId]?.remove(followeeId)
    }
}
```

#### How do you implement a stack that supports push, pop, and getMin in O(1)?

Two stacks — one for values, one for minimums. Push the current min with every element. Covered in detail in the Stacks post.

#### How do you design a data structure for insert, remove, and getRandom in O(1)?

ArrayList stores elements. HashMap maps element to its index. Insert: append to list and record index. Remove: swap with last element, update map, remove last. GetRandom: pick random index from list.

```kotlin
class RandomizedSet {
    private val list = ArrayList<Int>()
    private val map = HashMap<Int, Int>()

    fun insert(value: Int): Boolean {
        if (map.containsKey(value)) return false
        map[value] = list.size
        list.add(value)
        return true
    }

    fun remove(value: Int): Boolean {
        val idx = map[value] ?: return false
        val last = list.last()
        list[idx] = last
        map[last] = idx
        list.removeAt(list.lastIndex)
        map.remove(value)
        return true
    }

    fun getRandom(): Int = list[(Math.random() * list.size).toInt()]
}
```

#### How would you implement a time-based key-value store?

Store values with timestamps. Use a HashMap where each key maps to a list of (timestamp, value) pairs sorted by timestamp. For get, binary search for the largest timestamp <= query.

```kotlin
class TimeMap {
    private val store = HashMap<String, MutableList<Pair<Int, String>>>()

    fun set(key: String, value: String, timestamp: Int) {
        store.getOrPut(key) { mutableListOf() }.add(timestamp to value)
    }

    fun get(key: String, timestamp: Int): String {
        val list = store[key] ?: return ""
        var left = 0
        var right = list.size - 1
        var result = ""
        while (left <= right) {
            val mid = left + (right - left) / 2
            if (list[mid].first <= timestamp) {
                result = list[mid].second
                left = mid + 1
            } else {
                right = mid - 1
            }
        }
        return result
    }
}
```

#### How do you implement a basic rate limiter using a queue?

For sliding window rate limiting, store timestamps in a queue. On each request, remove expired entries, check if count exceeds limit.

```kotlin
class RateLimiter(private val maxRequests: Int, private val windowMs: Long) {
    private val requests = ArrayDeque<Long>()

    fun allowRequest(): Boolean {
        val now = System.currentTimeMillis()
        while (requests.isNotEmpty() && requests.first() <= now - windowMs) {
            requests.removeFirst()
        }
        if (requests.size >= maxRequests) return false
        requests.addLast(now)
        return true
    }
}
```

#### How do you solve Top K Frequent Elements?

Count frequencies with a HashMap. Use a min-heap of size K to find the top K.

```kotlin
fun topKFrequent(nums: IntArray, k: Int): IntArray {
    val freq = HashMap<Int, Int>()
    for (num in nums) freq[num] = freq.getOrDefault(num, 0) + 1
    val heap = PriorityQueue<Int>(compareBy { freq[it] })
    for (key in freq.keys) {
        heap.add(key)
        if (heap.size > k) heap.poll()
    }
    return heap.toIntArray()
}
```

Time O(n log k). Alternative: bucket sort for O(n).

#### How do you merge K sorted arrays?

Put the first element of each array into a min-heap with the array index and element index. Poll smallest, push next element from same array. Time O(n log k).

#### How do you solve the task scheduler problem?

Count task frequencies. The minimum time is determined by the most frequent task and the cooling interval. Greedy: schedule the most frequent tasks first with gaps.

```kotlin
fun leastInterval(tasks: CharArray, n: Int): Int {
    val freq = IntArray(26)
    for (t in tasks) freq[t - 'A']++
    freq.sort()
    val maxFreq = freq[25]
    val maxCount = freq.count { it == maxFreq }
    val minTime = (maxFreq - 1) * (n + 1) + maxCount
    return maxOf(minTime, tasks.size)
}
```

### Common Follow-ups

- How does LRU Cache differ from LFU Cache implementation-wise?
- What collision resolution strategies exist for HashMaps?
- How would you implement an LRU Cache that's thread-safe?
- How would you design a data structure for range frequency queries?
- What is consistent hashing and where is it used?
- How do you extend the RandomizedSet to support weighted random?
- How does a skip list work and where is it used in practice?
