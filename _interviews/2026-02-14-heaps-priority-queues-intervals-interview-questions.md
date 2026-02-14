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

If you've ever been in a hospital emergency room, you know they don't serve patients first-come-first-served -- the person having a heart attack gets seen before someone with a paper cut. That's a priority queue in action. Heaps are the data structure that makes that efficient, and interval problems are all about figuring out when things overlap (like meetings that clash on your calendar). Together, these three topics show up constantly in interviews -- top K elements, merge intervals, meeting rooms -- and once you get the mental model, they're actually fun to solve.

#### How does a binary heap work?

Think of a binary heap like a company org chart where every manager earns less than their reports (in a min-heap) or more (in a max-heap). It's a complete binary tree, but here's the neat trick -- you store it in a flat array. Parent at index `i` has children at `2i+1` and `2i+2`, and the parent of `i` is at `(i-1)/2`.

When you insert, you drop the new element at the end and "bubble up" -- swap with its parent until the heap property is restored. When you remove the root, you replace it with the last element and "bubble down." Both operations are O(log n), and peeking at the top is O(1).

#### How do you find the Kth largest element using a heap?

Here's the thing -- you don't need to sort the entire array. Maintain a min-heap of size K. As you scan through elements, add each one and kick out the smallest whenever the heap grows past K. The smallest element left in the heap is your Kth largest. It's like keeping a VIP list of exactly K people -- anyone who walks in has to beat the weakest member to get a spot.

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

Imagine you have K conveyor belts, each already sorted. You need to merge them into one sorted stream. You put the front item from each belt into a min-heap, pull out the smallest, then push the next item from that same belt. The heap always gives you the global minimum across all K lists.

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

> **🧠 Think about it:** If you had to merge two sorted lists, you'd just use two pointers. So why do we need a heap when it's K lists? What breaks about the two-pointer approach?

#### How do you merge overlapping intervals?

Sort all intervals by start time first. Then walk through them one by one -- if the current interval overlaps with the last one in your result, extend it. Otherwise, just add it as a new interval. It's like looking at your calendar and combining back-to-back meetings that bleed into each other into one big block.

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

This one is like being a hotel manager figuring out the minimum number of rooms you need. Sort meetings by start time. Keep a min-heap of end times -- it tells you when the earliest room frees up. If a new meeting starts after (or when) the earliest one ends, you recycle that room. Otherwise, you need a fresh room. The heap size at the end is your answer.

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

But wait -- how do you find a median when numbers keep arriving? You can't sort everything each time. The trick is to split the stream into two halves using two heaps: a max-heap holding the smaller half and a min-heap holding the larger half. Keep them balanced (at most one element difference). The median is always sitting right at the top of one or both heaps. It's like having two sorted piles of cards where you always know the middle.

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

> **🧠 Think about it:** Why do we always add to `low` first and then rebalance, instead of deciding upfront which heap a number belongs in?

#### How do you insert a new interval into a sorted non-overlapping list?

Three-phase approach. First, add all intervals that end before the new one even starts -- they can't possibly overlap. Then, merge everything that does overlap with the new interval by expanding its boundaries. Finally, add whatever's left. Think of it like sliding a new appointment into an already organized calendar -- you skip past everything before it, merge any conflicts, and leave the rest untouched.

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

Pretty straightforward -- in a min-heap, the smallest element sits at the root. In a max-heap, the largest does. Kotlin's `PriorityQueue` is a min-heap by default. If you want a max-heap, pass a custom comparator: `PriorityQueue(compareByDescending { it })`.

#### How do you build a heap from an array and why is it O(n)?

Here's where it gets interesting. You start from the last non-leaf node and bubble down each one. Half the array is leaves -- they need zero work. The next quarter only needs one swap, the next eighth needs two, and so on. When you sum all that up mathematically, it converges to O(n), not O(n log n). It's like organizing a pyramid from the bottom -- most of the work is trivially small.

#### How do you solve Top K Frequent Elements?

Two steps. First, count how often each element appears using a HashMap. Then use a min-heap of size K -- feed in the elements, and whenever the heap exceeds K, kick out the least frequent one. What survives is your top K. It's like a talent show where you only have K seats -- the weakest performer gets eliminated every time a stronger one auditions.

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

Sort by start time ascending, but here's the twist -- break ties by end time descending. Then walk through and track the maximum end you've seen. If an interval's end is less than or equal to the max end, it's completely covered by a previous one and can be tossed. It's like stacking blankets -- a smaller blanket completely covered by a bigger one doesn't add any coverage.

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

> **🧠 Think about it:** Why do we sort by end time *descending* when starts are equal? What goes wrong if we sort both ascending?

#### What is a non-overlapping interval count problem?

Given a bunch of intervals, find the minimum number to remove so the rest don't overlap. This is actually the classic activity selection problem in disguise. Sort by end time and greedily keep every interval that doesn't clash with the last one you kept. The ones you skip are the removals. The greedy choice works because finishing early leaves the most room for future intervals.

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

Sort meetings by start time, then check if any meeting starts before the previous one ends. If it does -- conflict, can't attend all. If you make it through the whole list without a clash, you're good. That's it. One of the cleanest interval problems you'll see.

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

The matrix is sorted row-wise and column-wise, so you can treat each row like a sorted list. Drop the first element from each row into a min-heap. Poll the smallest, then push the next element from that same row. After K polls, you have your answer. It's the same pattern as merging K sorted lists -- you're just using matrix coordinates instead of linked list pointers.

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

Build a max-heap from the array -- that puts the largest element at the root. Swap it with the last element, shrink the heap by one, and heapify the root again. Repeat until the array is sorted. It's like repeatedly pulling the tallest person out of a crowd and lining them up at the back. Time O(n log n), space O(1). It's in-place, which is nice, but it's not stable -- equal elements might get rearranged.

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
