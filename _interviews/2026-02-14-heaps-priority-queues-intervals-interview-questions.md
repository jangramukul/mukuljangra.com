---
title: "Heaps, Priority Queues & Intervals"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 14
sequence: 80
description: "Heaps and interval problems show up in almost every DSA round and test your ability to efficiently process sorted or prioritized data."
---

## Heaps, Priority Queues & Intervals

Heaps and interval problems show up in almost every DSA round. They test whether you can efficiently process prioritized data, merge sorted sources, and handle overlapping ranges — patterns that come up constantly in scheduling, streaming, and resource allocation problems.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a binary heap and how is it stored in an array?

A binary heap is a complete binary tree where every parent is smaller (min heap) or larger (max heap) than its children. It's stored in a flat array — for a node at index `i`, the left child is at `2i + 1`, right child at `2i + 2`, and parent at `(i - 1) / 2`. No pointers needed because the tree is always complete, so there are no gaps in the array.

#### Q2: What is the difference between a min heap and a max heap?

In a min heap, the smallest element is at the root. Every parent is smaller than or equal to its children. In a max heap, the largest element is at the root and every parent is greater than or equal to its children. The heap property only applies between parent and child — siblings have no ordering relationship. Kotlin's `PriorityQueue` is a min heap by default.

#### Q3: How does PriorityQueue work in Kotlin/Java?

`PriorityQueue` is a min heap backed by a resizable array. Elements come out in natural order (smallest first) or by a custom comparator. `add` and `poll` are O(log n), `peek` is O(1). It does not guarantee iteration order — only `poll` gives elements in sorted order.

```kotlin
// Min heap (default) — smallest first
val minHeap = PriorityQueue<Int>()

// Max heap — largest first
val maxHeap = PriorityQueue<Int>(compareByDescending { it })

// Custom ordering — sort by frequency
val freqHeap = PriorityQueue<Pair<Int, Int>>(compareBy { it.second })
```

#### Q4: How do you find the Kth largest element in an array?

Use a min heap of size K. Walk through the array — add each element, and if the heap exceeds size K, remove the smallest. After processing all elements, the root of the heap is the Kth largest. Time O(n log k), which is better than sorting O(n log n) when k is small.

```kotlin
fun findKthLargest(nums: IntArray, k: Int): Int {
    val minHeap = PriorityQueue<Int>()
    for (num in nums) {
        minHeap.add(num)
        if (minHeap.size > k) minHeap.poll()
    }
    return minHeap.peek()
}
```

The key insight — a min heap of size K naturally evicts everything smaller than the Kth largest element. What remains at the root is exactly the answer.

#### Q5: How do you find the top K most frequent elements?

Count frequencies with a HashMap, then use a min heap of size K keyed by frequency. Walk through the frequency map, push each element, and evict the least frequent when the heap exceeds K. The heap retains the K most frequent elements.

```kotlin
fun topKFrequent(nums: IntArray, k: Int): IntArray {
    val freq = HashMap<Int, Int>()
    for (num in nums) freq[num] = freq.getOrDefault(num, 0) + 1

    val minHeap = PriorityQueue<Int>(compareBy { freq[it] })
    for (key in freq.keys) {
        minHeap.add(key)
        if (minHeap.size > k) minHeap.poll()
    }
    return minHeap.toIntArray()
}
```

An alternative is bucket sort — create an array of size `n + 1` where index `i` holds elements with frequency `i`. Walk from the end to collect the top K. That runs in O(n) but uses O(n) space.

#### Q6: How do you find the K closest points to the origin?

Distance from origin is `x^2 + y^2`. Use a max heap of size K — keep the K smallest distances by evicting the largest whenever the heap exceeds K. No need to take the square root since comparison order doesn't change.

```kotlin
fun kClosest(points: Array<IntArray>, k: Int): Array<IntArray> {
    val maxHeap = PriorityQueue<IntArray>(
        compareByDescending { it[0] * it[0] + it[1] * it[1] }
    )
    for (point in points) {
        maxHeap.add(point)
        if (maxHeap.size > k) maxHeap.poll()
    }
    return maxHeap.toTypedArray()
}
```

#### Q7: How do you merge K sorted lists?

Push the head of each list into a min heap. Pop the smallest, add it to the result, and push that node's next pointer into the heap. Repeat until the heap is empty. Time O(n log k) where n is total nodes and k is the number of lists.

```kotlin
fun mergeKLists(lists: Array<ListNode?>): ListNode? {
    val heap = PriorityQueue<ListNode>(compareBy { it.value })
    for (node in lists) node?.let { heap.add(it) }

    val dummy = ListNode(0)
    var current = dummy
    while (heap.isNotEmpty()) {
        val smallest = heap.poll()
        current.next = smallest
        current = smallest
        smallest.next?.let { heap.add(it) }
    }
    return dummy.next
}
```

The heap always has at most K elements, so each insertion is O(log k). This is much better than repeatedly merging two lists at a time, which would be O(nk).

#### Q8: How do you merge overlapping intervals?

Sort intervals by start time. Walk through them, and for each interval, check if it overlaps with the last merged interval (current start <= last end). If yes, extend the last interval's end. If no, add a new interval to the result.

```kotlin
fun merge(intervals: Array<IntArray>): Array<IntArray> {
    if (intervals.isEmpty()) return emptyArray()
    intervals.sortBy { it[0] }
    val merged = mutableListOf(intervals[0])
    for (i in 1 until intervals.size) {
        val last = merged.last()
        if (intervals[i][0] <= last[1]) {
            last[1] = maxOf(last[1], intervals[i][1])
        } else {
            merged.add(intervals[i])
        }
    }
    return merged.toTypedArray()
}
```

Time: O(n log n) for sorting. The merge pass itself is O(n).

#### Q9: How do you insert a new interval into a non-overlapping sorted list of intervals?

Walk through the existing intervals. Add all intervals that end before the new one starts. Then merge all intervals that overlap with the new one by extending its start and end. Finally add all intervals that start after the new one ends.

```kotlin
fun insert(
    intervals: Array<IntArray>,
    newInterval: IntArray
): Array<IntArray> {
    val result = mutableListOf<IntArray>()
    var i = 0
    val n = intervals.size
    while (i < n && intervals[i][1] < newInterval[0]) {
        result.add(intervals[i++])
    }
    val merged = newInterval.copyOf()
    while (i < n && intervals[i][0] <= merged[1]) {
        merged[0] = minOf(merged[0], intervals[i][0])
        merged[1] = maxOf(merged[1], intervals[i][1])
        i++
    }
    result.add(merged)
    while (i < n) result.add(intervals[i++])
    return result.toTypedArray()
}
```

No sorting needed because the input is already sorted. Time O(n).

#### Q10: What is the Meeting Rooms II problem and how do you solve it?

Given a list of meeting time intervals, find the minimum number of conference rooms needed so no two overlapping meetings share a room. Sort by start time, then use a min heap to track end times of active meetings. For each meeting, if the earliest ending meeting finishes before the current one starts, reuse that room (poll from heap). Otherwise allocate a new room. The heap size at any point is the number of rooms in use.

```kotlin
fun minMeetingRooms(intervals: Array<IntArray>): Int {
    intervals.sortBy { it[0] }
    val endTimes = PriorityQueue<Int>()
    for (interval in intervals) {
        if (endTimes.isNotEmpty() && endTimes.peek() <= interval[0]) {
            endTimes.poll()
        }
        endTimes.add(interval[1])
    }
    return endTimes.size
}
```

The heap acts as a pool of rooms sorted by when they become free. The max size of the heap during the iteration is the answer.

### Deep Dive Questions (Advanced → Expert)

#### Q11: How do you find the median from a data stream?

Maintain two heaps — a max heap for the lower half and a min heap for the upper half. The max heap's root is the largest of the smaller elements, and the min heap's root is the smallest of the larger elements. Balance them so their sizes differ by at most 1. The median is either the root of the larger heap or the average of both roots.

```kotlin
class MedianFinder {
    private val lower = PriorityQueue<Int>(compareByDescending { it })
    private val upper = PriorityQueue<Int>()

    fun addNum(num: Int) {
        lower.add(num)
        upper.add(lower.poll())
        if (upper.size > lower.size) {
            lower.add(upper.poll())
        }
    }

    fun findMedian(): Double {
        return if (lower.size > upper.size) lower.peek().toDouble()
        else (lower.peek() + upper.peek()) / 2.0
    }
}
```

Every number first goes to the lower heap, then the largest from lower moves to upper. If upper gets bigger, move its smallest back. This guarantees every element in lower is less than or equal to every element in upper. Both `addNum` and `findMedian` are O(log n) and O(1).

#### Q12: How does the task scheduler problem work?

Given tasks with a cooldown period n (the same task can't run again within n intervals), find the minimum time to finish all tasks. Use a max heap to always pick the most frequent task first, and a cooldown queue to hold tasks until their cooldown expires.

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
            val remaining = maxHeap.poll() - 1
            if (remaining > 0) cooldown.addLast(remaining to time + n)
        }
        if (cooldown.isNotEmpty() && cooldown.first().second == time) {
            maxHeap.add(cooldown.removeFirst().first)
        }
    }
    return time
}
```

Greedy works here because executing the most frequent task first minimizes idle slots. If you don't pick the most frequent task, you'll create more idle time later when that task still needs to run but is blocked by cooldown.

#### Q13: How do you find the intersection of two interval lists?

Given two sorted lists of disjoint intervals, find their intersections. Use two pointers, one for each list. At each step, the intersection of two intervals is `[max(start1, start2), min(end1, end2)]` — if that range is valid (start <= end), it's an intersection. Advance the pointer for whichever interval ends first.

```kotlin
fun intervalIntersection(
    list1: Array<IntArray>,
    list2: Array<IntArray>
): Array<IntArray> {
    val result = mutableListOf<IntArray>()
    var i = 0; var j = 0
    while (i < list1.size && j < list2.size) {
        val start = maxOf(list1[i][0], list2[j][0])
        val end = minOf(list1[i][1], list2[j][1])
        if (start <= end) result.add(intArrayOf(start, end))
        if (list1[i][1] < list2[j][1]) i++ else j++
    }
    return result.toTypedArray()
}
```

Time O(m + n). No sorting needed because both lists are already sorted and disjoint.

#### Q14: How do you find the minimum number of intervals to remove to make the rest non-overlapping?

Sort by end time. Greedily keep intervals that don't overlap with the last kept interval. Count how many you remove. Sorting by end time is critical — it maximizes the number of non-overlapping intervals you can keep, same principle as the activity selection problem.

```kotlin
fun eraseOverlapIntervals(intervals: Array<IntArray>): Int {
    intervals.sortBy { it[1] }
    var kept = 0
    var lastEnd = Int.MIN_VALUE
    for (interval in intervals) {
        if (interval[0] >= lastEnd) {
            kept++
            lastEnd = interval[1]
        }
    }
    return intervals.size - kept
}
```

Sorting by start time and removing the interval with the later end time also works, but sorting by end time is cleaner. The answer is total intervals minus the maximum non-overlapping set.

#### Q15: How do you reorganize a string so no two adjacent characters are the same?

Use a max heap keyed by character frequency. Pop the most frequent character, append it to the result, then pop the second most frequent and append it too. Push both back (with decremented counts) and repeat. If at any point the heap is empty and you still have a character with remaining count, it's impossible.

```kotlin
fun reorganizeString(s: String): String {
    val freq = IntArray(26)
    for (ch in s) freq[ch - 'a']++

    val maxHeap = PriorityQueue<Pair<Char, Int>>(
        compareByDescending { it.second }
    )
    for (i in 0 until 26) {
        if (freq[i] > 0) maxHeap.add(('a' + i) to freq[i])
    }

    val result = StringBuilder()
    while (maxHeap.size >= 2) {
        val first = maxHeap.poll()
        val second = maxHeap.poll()
        result.append(first.first)
        result.append(second.first)
        if (first.second > 1) maxHeap.add(first.first to first.second - 1)
        if (second.second > 1) maxHeap.add(second.first to second.second - 1)
    }
    if (maxHeap.isNotEmpty()) {
        val last = maxHeap.poll()
        if (last.second > 1) return ""
        result.append(last.first)
    }
    return result.toString()
}
```

The condition for impossibility is when any character's frequency exceeds `(n + 1) / 2`. You can check this upfront before building the heap.

#### Q16: How do you compute the sliding window median?

Maintain two heaps (like the data stream median) and slide the window. For each new element entering the window, add it to the appropriate heap. For each element leaving, remove it. Rebalance after each add/remove. Lazy deletion handles removals efficiently — mark elements as removed and only actually delete them when they appear at the top of a heap.

The tricky part is removal. `PriorityQueue` doesn't support efficient removal by value (it's O(n)). Use a delayed deletion approach with a HashMap tracking counts of elements that should be removed. When you poll and the top element is in the "to delete" map, discard it and poll again.

This runs in O(n log k) where k is the window size. It's one of the harder heap problems because managing the balance between two heaps with lazy deletion requires careful bookkeeping.

#### Q17: How do you implement heap sort?

Build a max heap from the array in O(n) using bottom-up heapify. Then repeatedly swap the root (largest) with the last unsorted element and heapify the reduced heap. Time O(n log n), space O(1) — it sorts in place.

```kotlin
fun heapSort(arr: IntArray) {
    val n = arr.size
    for (i in n / 2 - 1 downTo 0) heapify(arr, n, i)
    for (i in n - 1 downTo 1) {
        arr[0] = arr[i].also { arr[i] = arr[0] }
        heapify(arr, i, 0)
    }
}

fun heapify(arr: IntArray, size: Int, root: Int) {
    var largest = root
    val left = 2 * root + 1
    val right = 2 * root + 2
    if (left < size && arr[left] > arr[largest]) largest = left
    if (right < size && arr[right] > arr[largest]) largest = right
    if (largest != root) {
        arr[root] = arr[largest].also { arr[largest] = arr[root] }
        heapify(arr, size, largest)
    }
}
```

Building the heap is O(n), not O(n log n), because most nodes are near the bottom and need very few swaps. Heap sort is rarely used in practice because it has poor cache locality compared to quicksort and isn't stable, but it guarantees O(n log n) worst-case with O(1) space.

#### Q18: When should you use a heap vs sorting vs quickselect?

- **Use a heap** when you need the top K elements from a stream or when data arrives incrementally. Time O(n log k). Also when you need to repeatedly extract the min/max (like merge K lists, task scheduling).
- **Use sorting** when you need all elements in order or when the problem requires sorted output. Time O(n log n). Simpler to implement and better cache performance than a heap.
- **Use quickselect** when you need only the Kth element and don't care about ordering the rest. Average O(n), worst O(n^2). Best for one-shot Kth element queries on in-memory data.

The decision comes down to what you need — all elements sorted (sort), top K elements (heap), or just one element at position K (quickselect). For streaming data where elements arrive one at a time, a heap is the only practical option because you can't sort what you haven't seen yet.

#### Q19: How does the heapify process work and why is building a heap O(n)?

Heapify (also called sift-down) takes a node and pushes it down the tree until the heap property is restored. Compare the node with its children, swap with the larger child (max heap) or smaller child (min heap), and repeat.

Building a heap calls heapify on each non-leaf node from bottom to top. The key insight for the O(n) complexity — most nodes are near the bottom of the tree and need very few swaps. Half the nodes are leaves (zero swaps), a quarter need at most one swap, an eighth need at most two, and so on. The total work sums to O(n), not O(n log n). The math works out to roughly 2n comparisons.

Sifting up (used in insertion) is O(log n) per element, so building a heap by inserting n elements one at a time is O(n log n). Bottom-up heapify avoids this by working from the leaves upward.

#### Q20: How do you solve the "Find Median from Two Sorted Arrays" problem using binary search, and how does this relate to heap-based median finding?

Binary search on the partition position in the smaller array. For each partition, check if the elements on the left side of both arrays are all smaller than elements on the right side. The correct partition gives the median directly.

```kotlin
fun findMedianSortedArrays(
    nums1: IntArray,
    nums2: IntArray
): Double {
    val a = if (nums1.size <= nums2.size) nums1 else nums2
    val b = if (nums1.size <= nums2.size) nums2 else nums1
    val total = a.size + b.size
    val half = total / 2

    var left = 0; var right = a.size
    while (left <= right) {
        val i = (left + right) / 2
        val j = half - i
        val aLeft = if (i > 0) a[i - 1] else Int.MIN_VALUE
        val aRight = if (i < a.size) a[i] else Int.MAX_VALUE
        val bLeft = if (j > 0) b[j - 1] else Int.MIN_VALUE
        val bRight = if (j < b.size) b[j] else Int.MAX_VALUE

        if (aLeft <= bRight && bLeft <= aRight) {
            return if (total % 2 == 1) minOf(aRight, bRight).toDouble()
            else (maxOf(aLeft, bLeft) + minOf(aRight, bRight)) / 2.0
        } else if (aLeft > bRight) right = i - 1
        else left = i + 1
    }
    return 0.0
}
```

This runs in O(log(min(m, n))). The two-heap approach for streaming data is O(log n) per insertion and O(1) for median. Binary search works here because both arrays are already sorted — you're finding where to split them so the left halves combine into the lower half of the merged result. The heap approach is better for dynamic data, binary search is better for static sorted input.

### Common Follow-ups

- How would you modify the two-heap median finder to support removing elements?
- What happens if you use a max heap instead of a min heap for the top-K problem?
- How do you handle duplicate intervals in the merge intervals problem?
- Can you solve Meeting Rooms II without a heap using a line sweep approach?
- What's the time complexity of removing an arbitrary element from a PriorityQueue in Java/Kotlin?
- How would you implement a decrease-key operation for Dijkstra's algorithm using a heap?
- When would you use a Fibonacci heap instead of a binary heap?
- How do you handle the edge case in reorganize string when one character dominates?
