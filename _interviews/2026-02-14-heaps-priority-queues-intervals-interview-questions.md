---
title: "Heaps, Priority Queues & Intervals"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 14
sequence: 54
description: "Heaps power efficient selection and scheduling problems. Interval problems test your ability to think about overlapping ranges."
---

## Heaps, Priority Queues & Intervals

Heaps power efficient selection and scheduling problems. Interval problems test your ability to think about overlapping ranges. Together, they cover a wide slice of real interview questions — top K elements, merge intervals, meeting rooms.

#### How does a binary heap work?

A binary heap is a complete binary tree stored in an array. In a min-heap, every parent is smaller than its children. Insert: add at end, bubble up. Remove min: replace root with last element, bubble down. Both O(log n). Peek is O(1).

Array representation: parent at `i`, children at `2i+1` and `2i+2`. Parent of `i` is `(i-1)/2`.

#### How do you find the Kth largest element using a heap?

Maintain a min-heap of size K. For each element, add it and remove the smallest if heap exceeds K. The root is always the Kth largest.

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

Time O(n log k), space O(k).

#### How do you merge K sorted lists?

Put each list's head into a min-heap. Poll the smallest, add to result, push that node's next into the heap.

```kotlin
fun mergeKLists(lists: List<ListNode?>): ListNode? {
    val heap = PriorityQueue<ListNode>(compareBy { it.value })
    for (list in lists) list?.let { heap.add(it) }
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

Time O(n log k) where n is total nodes and k is number of lists.

#### How do you merge overlapping intervals?

Sort by start time, then iterate and merge overlapping intervals.

```kotlin
fun merge(intervals: Array<IntArray>): List<IntArray> {
    if (intervals.isEmpty()) return emptyList()
    intervals.sortBy { it[0] }
    val result = mutableListOf(intervals[0])
    for (i in 1 until intervals.size) {
        val last = result.last()
        if (intervals[i][0] <= last[1]) {
            last[1] = maxOf(last[1], intervals[i][1])
        } else {
            result.add(intervals[i])
        }
    }
    return result
}
```

Time O(n log n).

#### How do you solve Meeting Rooms II (minimum rooms needed)?

Sort by start time. Use a min-heap tracking end times. If a meeting starts after the earliest ending meeting, reuse that room (poll). Otherwise add a new room.

```kotlin
fun minMeetingRooms(intervals: Array<IntArray>): Int {
    if (intervals.isEmpty()) return 0
    intervals.sortBy { it[0] }
    val endTimes = PriorityQueue<Int>()
    endTimes.add(intervals[0][1])
    for (i in 1 until intervals.size) {
        if (intervals[i][0] >= endTimes.peek()) endTimes.poll()
        endTimes.add(intervals[i][1])
    }
    return endTimes.size
}
```

Time O(n log n).

#### How do you find the median from a data stream?

Two heaps: max-heap for the lower half, min-heap for the upper half. Keep them balanced. Median is from the top of one or both.

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

O(log n) per insertion, O(1) for median.

#### How do you insert a new interval into a sorted non-overlapping list?

Walk through the list. Add intervals that end before the new one starts. Merge all overlapping ones. Add remaining.

```kotlin
fun insert(intervals: Array<IntArray>, newInterval: IntArray): List<IntArray> {
    val result = mutableListOf<IntArray>()
    var i = 0
    val n = intervals.size
    while (i < n && intervals[i][1] < newInterval[0]) {
        result.add(intervals[i++])
    }
    var merged = newInterval.copyOf()
    while (i < n && intervals[i][0] <= merged[1]) {
        merged[0] = minOf(merged[0], intervals[i][0])
        merged[1] = maxOf(merged[1], intervals[i][1])
        i++
    }
    result.add(merged)
    while (i < n) result.add(intervals[i++])
    return result
}
```

Time O(n).

#### What is the difference between a min-heap and a max-heap?

In a min-heap, the root is the smallest element. In a max-heap, the root is the largest. Kotlin's `PriorityQueue` is a min-heap by default. For max-heap, use `PriorityQueue(compareByDescending { it })`.

#### How do you build a heap from an array and why is it O(n)?

Bottom-up heapify — start from the last non-leaf node and bubble down. Leaf nodes (half the array) need no work. Each level does work proportional to its distance from the bottom. The sum converges to O(n), not O(n log n).

#### How do you solve Top K Frequent Elements?

Count frequencies with a HashMap. Use a min-heap of size K to keep the top K.

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

#### How do you remove covered intervals?

Sort by start ascending, then by end descending. Walk through and track the max end seen. An interval is covered if its end is <= max end.

```kotlin
fun removeCoveredIntervals(intervals: Array<IntArray>): Int {
    intervals.sortWith(compareBy<IntArray> { it[0] }.thenByDescending { it[1] })
    var count = 0
    var maxEnd = 0
    for (interval in intervals) {
        if (interval[1] > maxEnd) {
            count++
            maxEnd = interval[1]
        }
    }
    return count
}
```

#### What is a non-overlapping interval count problem?

Given intervals, find the minimum number to remove so the rest don't overlap. Same as activity selection — sort by end time, greedily keep non-overlapping intervals.

```kotlin
fun eraseOverlapIntervals(intervals: Array<IntArray>): Int {
    intervals.sortBy { it[1] }
    var count = 0
    var prevEnd = Int.MIN_VALUE
    for (interval in intervals) {
        if (interval[0] >= prevEnd) {
            prevEnd = interval[1]
        } else {
            count++
        }
    }
    return count
}
```

#### How do you check if a person can attend all meetings?

Sort by start time. If any meeting starts before the previous one ends, there's a conflict.

```kotlin
fun canAttendMeetings(intervals: Array<IntArray>): Boolean {
    intervals.sortBy { it[0] }
    for (i in 1 until intervals.size) {
        if (intervals[i][0] < intervals[i - 1][1]) return false
    }
    return true
}
```

#### How do you find the Kth smallest element in a sorted matrix?

Use a min-heap. Start with the first element of each row. Poll smallest, push the next element from the same row.

```kotlin
fun kthSmallest(matrix: Array<IntArray>, k: Int): Int {
    val n = matrix.size
    val heap = PriorityQueue<Triple<Int, Int, Int>>(compareBy { it.first })
    for (i in 0 until minOf(n, k)) {
        heap.add(Triple(matrix[i][0], i, 0))
    }
    var count = 0
    while (heap.isNotEmpty()) {
        val (value, row, col) = heap.poll()
        if (++count == k) return value
        if (col + 1 < n) {
            heap.add(Triple(matrix[row][col + 1], row, col + 1))
        }
    }
    return -1
}
```

Time O(k log n).

#### What is a heap sort and how does it work?

Build a max-heap from the array. Repeatedly extract the max (swap with end), shrink heap, heapify root. Time O(n log n), space O(1). Not stable but in-place.

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

### Common Follow-ups

- How do you implement a heap with decrease-key for Dijkstra's?
- What's the difference between a binary heap and a Fibonacci heap?
- How do you find the K closest points to the origin?
- How would you merge intervals if they arrive in a stream?
- How do you find free time slots from multiple employee schedules?
- What is the skyline problem and how does it relate to heaps?
- How do you solve "sliding window median" using two heaps?
- Why is building a heap O(n) but inserting n elements one by one O(n log n)?
