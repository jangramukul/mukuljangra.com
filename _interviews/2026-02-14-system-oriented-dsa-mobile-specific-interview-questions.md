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

Here's the thing about system-oriented DSA — these aren't your typical "reverse a linked list" problems. These questions ask you to combine multiple data structures together to build something that actually works under real performance constraints. You'll be mixing hash maps with heaps, linked lists with arrays, and figuring out how to hit O(1) on operations that seem like they shouldn't be O(1). LRU Cache is the king of this category — it shows up everywhere.

#### How do you implement an LRU Cache with O(1) get and put?

Think of it like a VIP line at a club. The bouncer (HashMap) knows exactly where everyone is standing — O(1) lookup. The line itself (doubly linked list) lets people cut to the front or get kicked from the back instantly — O(1) insertion and removal. Most recently used goes to the head, least recently used sits at the tail. On get, move to head. On put, add to head and evict the tail if you're over capacity.

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

LRU kicks out whoever hasn't been touched the longest. LFU kicks out whoever's been touched the fewest times — it cares about popularity, not recency. That means LFU needs three maps: key-to-value, key-to-frequency, and frequency-to-list-of-keys. When there's a tie in frequency, it falls back to LRU behavior among those tied items.

#### How do you design a HashMap from scratch?

It's basically an array of buckets with a hash function deciding which bucket each key goes into. When two keys land in the same bucket (collision), you chain them together with a linked list — or use open addressing to probe for the next empty slot. The load factor is your trigger for resizing: once it crosses 0.75, double the array and rehash everything.

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

> **🧠 Think about it:** Why does the load factor threshold matter? What happens to lookup performance if you let the buckets get too crowded before resizing?

#### How do you find the median from a data stream?

Picture sorting a never-ending stream of numbers. You can't sort the whole thing every time a new number arrives — that's way too slow. Instead, split the stream into two halves using two heaps: a max-heap holds the lower half, a min-heap holds the upper half. Keep them balanced so they differ in size by at most 1. The median is either the top of the bigger heap, or the average of both tops.

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

All operations O(log n). This one comes up a lot.

#### How do you implement a Trie-based autocomplete system?

A Trie stores words character by character, so walking the tree as the user types gives you a natural prefix match. Each node can track the top-k results or frequency counts for that prefix. On each keystroke, you walk one level deeper and return suggestions from the current node's subtree. Discussed in detail in the Tries post.

#### How do you design a Twitter/News Feed system using DSA?

This is really a k-way merge problem in disguise. Each user's tweets live in a HashMap as a list sorted by timestamp. Follow relationships are stored as a HashMap of sets. To build a feed, grab the recent tweets from every user you follow and merge them using a max-heap of size k — always pulling the most recent tweet next.

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

Two stacks working together — one for values, one for tracking minimums. Every time you push, you also push the current minimum onto the min stack. Covered in detail in the Stacks post.

#### How do you design a data structure for insert, remove, and getRandom in O(1)?

Plot twist: you need both an ArrayList and a HashMap working together. The ArrayList stores the actual elements and gives you O(1) random access. The HashMap maps each element to its index in the list. Insert just appends and records the index. The clever part is remove — you swap the target with the last element, update the map, and remove from the end. That keeps everything O(1).

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

> **🧠 Think about it:** Why can't you just use a HashSet here? What operation would break if you didn't have the ArrayList?

#### How would you implement a time-based key-value store?

Think of it like version control for values — every key can have multiple values at different points in time. You store them in a HashMap where each key maps to a list of (timestamp, value) pairs, naturally sorted by timestamp since sets always come in order. For get, you binary search for the largest timestamp that's less than or equal to the query.

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

It's like a sliding window — you keep a queue of request timestamps. When a new request comes in, you toss out everything that's expired (older than the window), then check if you still have room. If the queue size is under the limit, allow it and add the timestamp. Otherwise, reject it.

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

Two steps. First, count every element's frequency with a HashMap. Then use a min-heap of size K — as you add elements, the heap automatically kicks out the least frequent ones, leaving you with the top K.

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

Start by putting the first element of each array into a min-heap, along with which array it came from and its position. Poll the smallest, add it to the result, then push the next element from that same array. Keep going until the heap is empty. Time O(n log k).

> **🧠 Think about it:** Why is this O(n log k) and not O(n log n)? What's the difference between sorting everything at once versus using a heap of size k?

#### How do you solve the task scheduler problem?

Here's the thing — the most frequent task dictates everything. You build a schedule where the most frequent tasks create "slots" separated by the cooling interval, and less frequent tasks fill in the gaps. Count frequencies, find the max, and calculate the minimum time as `(maxFreq - 1) * (n + 1) + maxCount`. If the total number of tasks exceeds that, you don't need any idle time at all.

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
