---
title: "Sorting, Searching & Binary Search"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 8
sequence: 48
description: "Sorting and binary search are foundational topics in coding interviews."
---

## Sorting, Searching & Binary Search

Sorting and binary search are foundational topics in coding interviews. Most companies expect you to implement merge sort or quick sort from scratch and apply binary search to non-obvious problems beyond simple array lookup.

#### Explain standard binary search and its common pitfalls.

Binary search finds a target in a sorted array by halving the search space each step.

```kotlin
fun binarySearch(arr: IntArray, target: Int): Int {
    var left = 0
    var right = arr.size - 1
    while (left <= right) {
        val mid = left + (right - left) / 2
        when {
            arr[mid] == target -> return mid
            arr[mid] < target -> left = mid + 1
            else -> right = mid - 1
        }
    }
    return -1
}
```

Time O(log n). Common pitfalls: using `(left + right) / 2` (integer overflow), wrong loop condition (`<=` vs `<`), and off-by-one with `mid + 1` and `mid - 1`.

#### How do you search in a rotated sorted array?

At each step, determine which half is sorted by comparing `arr[left]` with `arr[mid]`. If the target falls in the sorted range, search there. Otherwise search the other half.

```kotlin
fun searchRotated(arr: IntArray, target: Int): Int {
    var left = 0; var right = arr.size - 1
    while (left <= right) {
        val mid = left + (right - left) / 2
        if (arr[mid] == target) return mid
        if (arr[left] <= arr[mid]) {
            if (target >= arr[left] && target < arr[mid]) right = mid - 1
            else left = mid + 1
        } else {
            if (target > arr[mid] && target <= arr[right]) left = mid + 1
            else right = mid - 1
        }
    }
    return -1
}
```

Time O(log n). With duplicates, worst case degrades to O(n).

#### Implement merge sort.

Divide the array in half recursively, sort each half, merge. The merge step does the real work.

```kotlin
fun mergeSort(arr: IntArray, left: Int, right: Int) {
    if (left >= right) return
    val mid = left + (right - left) / 2
    mergeSort(arr, left, mid)
    mergeSort(arr, mid + 1, right)
    merge(arr, left, mid, right)
}

fun merge(arr: IntArray, left: Int, mid: Int, right: Int) {
    val temp = IntArray(right - left + 1)
    var i = left; var j = mid + 1; var k = 0
    while (i <= mid && j <= right) {
        if (arr[i] <= arr[j]) temp[k++] = arr[i++]
        else temp[k++] = arr[j++]
    }
    while (i <= mid) temp[k++] = arr[i++]
    while (j <= right) temp[k++] = arr[j++]
    temp.copyInto(arr, left)
}
```

Time O(n log n) always, space O(n).

#### Implement quick sort and explain the partition step.

Pick a pivot, partition so everything less goes left, greater goes right. Recurse on each side.

```kotlin
fun quickSort(arr: IntArray, low: Int, high: Int) {
    if (low >= high) return
    val pivotIndex = partition(arr, low, high)
    quickSort(arr, low, pivotIndex - 1)
    quickSort(arr, pivotIndex + 1, high)
}

fun partition(arr: IntArray, low: Int, high: Int): Int {
    val pivot = arr[high]
    var i = low
    for (j in low until high) {
        if (arr[j] < pivot) {
            arr[i] = arr[j].also { arr[j] = arr[i] }
            i++
        }
    }
    arr[i] = arr[high].also { arr[high] = arr[i] }
    return i
}
```

Average O(n log n), worst O(n^2). Random pivot selection avoids worst case in practice.

#### What is the time complexity of common sorting algorithms?

- **Merge Sort** — O(n log n) always, O(n) space. Stable
- **Quick Sort** — O(n log n) average, O(n^2) worst. O(log n) space. Not stable
- **Heap Sort** — O(n log n) always, O(1) space. Not stable
- **Counting Sort** — O(n + k) time/space, where k is the range. Stable. Integers only
- **Radix Sort** — O(d * (n + k)), d = digits. Stable

Merge sort for stability or guaranteed performance. Quick sort usually faster in practice due to cache locality.

#### How do you find the peak element in an array?

Binary search works because if `arr[mid] < arr[mid + 1]`, a peak exists on the right. If `arr[mid] >= arr[mid + 1]`, a peak exists on the left (including mid).

```kotlin
fun findPeakElement(arr: IntArray): Int {
    var left = 0; var right = arr.size - 1
    while (left < right) {
        val mid = left + (right - left) / 2
        if (arr[mid] < arr[mid + 1]) left = mid + 1
        else right = mid
    }
    return left
}
```

Time O(log n). The array doesn't need to be sorted.

#### What is the Quickselect algorithm for finding the kth largest?

Uses partition from quick sort but only recurses into the side containing the kth element. Average O(n), worst O(n^2).

```kotlin
fun findKthLargest(nums: IntArray, k: Int): Int {
    val targetIndex = nums.size - k
    return quickSelect(nums, 0, nums.size - 1, targetIndex)
}

fun quickSelect(arr: IntArray, low: Int, high: Int, k: Int): Int {
    val pivotIndex = partition(arr, low, high)
    return when {
        pivotIndex == k -> arr[pivotIndex]
        pivotIndex < k -> quickSelect(arr, pivotIndex + 1, high, k)
        else -> quickSelect(arr, low, pivotIndex - 1, k)
    }
}
```

#### How do you solve the merge intervals problem?

Sort by start time, then iterate and merge overlapping intervals.

```kotlin
fun mergeIntervals(intervals: Array<IntArray>): List<IntArray> {
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

#### What is lower bound and upper bound in binary search?

Lower bound: first index where `arr[index] >= target`. Upper bound: first index where `arr[index] > target`. Count of elements equal to target is `upperBound - lowerBound`.

```kotlin
fun lowerBound(arr: IntArray, target: Int): Int {
    var left = 0; var right = arr.size
    while (left < right) {
        val mid = left + (right - left) / 2
        if (arr[mid] < target) left = mid + 1
        else right = mid
    }
    return left
}

fun upperBound(arr: IntArray, target: Int): Int {
    var left = 0; var right = arr.size
    while (left < right) {
        val mid = left + (right - left) / 2
        if (arr[mid] <= target) left = mid + 1
        else right = mid
    }
    return left
}
```

Note: `right` starts at `arr.size` and loop condition is `<` because the answer can be past the last element.

#### How do you find the minimum in a rotated sorted array?

If `arr[mid] > arr[right]`, minimum is in the right half. Otherwise it's in the left half (including mid).

```kotlin
fun findMin(arr: IntArray): Int {
    var left = 0; var right = arr.size - 1
    while (left < right) {
        val mid = left + (right - left) / 2
        if (arr[mid] > arr[right]) left = mid + 1
        else right = mid
    }
    return arr[left]
}
```

#### How does binary search apply beyond sorted arrays?

Binary search works on any search space with a monotonic property. Examples:
- **Ship packages within D days** — binary search on capacity
- **Koko eating bananas** — binary search on eating speed
- **Split array largest sum** — binary search on the answer

The pattern: binary search on the answer, check feasibility with a helper function.

#### What is the difference between comparison-based and non-comparison-based sorting?

Comparison-based sorts (merge, quick, heap) have a lower bound of O(n log n). Non-comparison sorts (counting, radix, bucket) can achieve O(n) but only under specific constraints — integers in a bounded range, fixed-length strings.

#### Explain stability in sorting and why it matters.

A stable sort preserves relative order of equal elements. Merge sort, counting sort, and radix sort are stable. Quick sort and heap sort are not. Stability matters when sorting by multiple criteria — Kotlin's `sortedBy` uses TimSort (stable), so chained sorts work correctly.

#### How do you solve Meeting Rooms II?

Sort by start time, use a min-heap tracking end times. If a meeting starts before the earliest ending meeting, you need another room.

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

#### When should you implement sorting from scratch vs using built-in sort?

Implement from scratch when explicitly asked or when the problem needs a modified sort (counting inversions with merge sort, kth element with quickselect). For everything else, use `sortedBy`. Interviewers care about problem-solving, but you should explain time complexity.

### Common Follow-ups

- How do you count inversions using merge sort?
- What is TimSort and why do standard libraries use it?
- How do you sort a nearly sorted array where each element is at most k positions away?
- Can you implement binary search recursively? Tradeoffs vs iterative?
- How do you handle duplicates in rotated sorted array search?
- What is the median of two sorted arrays problem?
- How would you sort a linked list?
- What is the Dutch National Flag problem?
