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

Here's the thing — sorting and binary search show up in almost every coding interview, and not just as standalone questions. You'll need merge sort to count inversions, quick sort's partition logic to find the kth largest, and binary search in places where the array isn't even sorted. Companies expect you to write these from scratch and, more importantly, know when to reach for which tool.

#### Explain standard binary search and its common pitfalls.

Binary search is like looking up a word in a dictionary — you don't start at page one and flip through every page. You open to the middle, check if you're too early or too late, and cut the search space in half each time.

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

Time O(log n). Now here's where people trip up: using `(left + right) / 2` causes integer overflow on large arrays, the loop condition `<=` vs `<` changes whether you check the last element, and getting `mid + 1` vs `mid - 1` wrong gives you off-by-one bugs or infinite loops.

#### How do you search in a rotated sorted array?

Picture a sorted deck of cards — now take the bottom chunk and put it on top. The array is still "sorted" in two halves, just rotated. At each step, compare `arr[left]` with `arr[mid]` to figure out which half is properly sorted, then check if your target falls in that sorted range.

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

Time O(log n). Plot twist — if the array has duplicates, you can't always tell which half is sorted, so the worst case degrades to O(n).

#### Implement merge sort.

Merge sort follows a simple idea: keep splitting the array in half until you have single elements, then merge them back in sorted order. The splitting is trivial — the merge step is where the actual sorting happens.

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

Time O(n log n) always, space O(n). That guaranteed O(n log n) is its biggest selling point — no worst-case surprises.

> **🧠 Think about it:** Why does merge sort need O(n) extra space while quick sort doesn't? Think about what happens during the merge step — can you merge two halves in-place without a temp array?

#### Implement quick sort and explain the partition step.

Quick sort picks a pivot element and rearranges the array so everything smaller goes to the left and everything larger goes to the right. Then it recurses on each side. Think of it like organizing a messy closet — pick one shirt as a reference, throw everything shorter to the left, taller to the right, and repeat.

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

Average O(n log n), worst O(n^2). The worst case hits when you keep picking the smallest or largest element as pivot — random pivot selection avoids this in practice.

#### What is the time complexity of common sorting algorithms?

- **Merge Sort** — O(n log n) always, O(n) space. Stable
- **Quick Sort** — O(n log n) average, O(n^2) worst. O(log n) space. Not stable
- **Heap Sort** — O(n log n) always, O(1) space. Not stable
- **Counting Sort** — O(n + k) time/space, where k is the range. Stable. Integers only
- **Radix Sort** — O(d * (n + k)), d = digits. Stable

When you need stability or guaranteed performance, go with merge sort. But quick sort usually wins in practice because of better cache locality — it accesses memory sequentially instead of jumping around.

#### How do you find the peak element in an array?

Here's a neat one — binary search works even though the array isn't sorted. If `arr[mid] < arr[mid + 1]`, the values are still climbing, so a peak must exist somewhere on the right. If `arr[mid] >= arr[mid + 1]`, a peak is on the left (or mid itself).

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

Time O(log n). The array doesn't need to be sorted — you just need a monotonic decision at each step.

#### What is the Quickselect algorithm for finding the kth largest?

Quickselect is quick sort's lazy cousin. It uses the same partition logic, but instead of sorting both halves, it only recurses into the side that contains the kth element. Why do the work of sorting everything when you only care about one position?

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

Average O(n), worst O(n^2). That average O(n) is a big deal — way better than sorting the whole array just to grab one element.

#### How do you solve the merge intervals problem?

Sort all intervals by their start time first, then walk through them one by one. If the current interval overlaps with the last merged one, extend it. Otherwise, start a new group. It's like merging overlapping time blocks on a calendar.

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

Time O(n log n) — dominated by the sort.

> **🧠 Think about it:** What if the problem asked you to insert a new interval into an already sorted, non-overlapping list? Would you still need to sort, or can you do better?

#### What is lower bound and upper bound in binary search?

Lower bound gives you the first index where `arr[index] >= target`. Upper bound gives the first index where `arr[index] > target`. The difference between them tells you how many times the target appears — `upperBound - lowerBound`.

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

Notice `right` starts at `arr.size` (not `arr.size - 1`) and the loop condition is `<` (not `<=`). That's because the answer can be past the last element — if every element is smaller than the target, the lower bound is the array length itself.

#### How do you find the minimum in a rotated sorted array?

The minimum is the rotation point — the one place where the sorted order breaks. If `arr[mid] > arr[right]`, the break must be somewhere in the right half, so the minimum is there. Otherwise, it's in the left half including mid.

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

This is where binary search gets really interesting. It works on any search space where there's a monotonic yes/no boundary — you don't need a sorted array at all.

- **Ship packages within D days** — binary search on capacity
- **Koko eating bananas** — binary search on eating speed
- **Split array largest sum** — binary search on the answer

The pattern is always the same: binary search on the answer, and use a helper function to check if that answer is feasible. If it is, try smaller. If not, try bigger.

#### What is the difference between comparison-based and non-comparison-based sorting?

Comparison-based sorts (merge, quick, heap) compare elements to decide order, and there's a proven lower bound — you can't do better than O(n log n). Non-comparison sorts (counting, radix, bucket) skip comparisons entirely and can hit O(n), but they only work under specific constraints like integers in a bounded range or fixed-length strings.

#### Explain stability in sorting and why it matters.

A stable sort keeps equal elements in their original relative order. Merge sort, counting sort, and radix sort are stable. Quick sort and heap sort are not. This matters when you're sorting by multiple keys — say you sort employees by name first, then by department. A stable sort on department preserves the alphabetical name order within each department. Kotlin's `sortedBy` uses TimSort, which is stable, so chained sorts work correctly.

> **🧠 Think about it:** If you sorted a list of transactions first by amount, then by date using a stable sort — what would the final order look like? What if the sort wasn't stable?

#### How do you solve Meeting Rooms II?

Sort meetings by start time, then use a min-heap to track when each room becomes free (its current meeting's end time). When a new meeting starts, peek at the heap — if the earliest ending meeting finishes before this one starts, reuse that room. Otherwise, you need a new room.

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

The heap size at the end is your answer — it represents the maximum number of overlapping meetings at any point.

#### When should you implement sorting from scratch vs using built-in sort?

Implement from scratch when the problem explicitly asks for it, or when you need a modified version of the algorithm — like counting inversions with merge sort or finding the kth element with quickselect. For everything else, just use `sortedBy` and move on to the actual problem. You should still be ready to explain the time complexity of whatever you're using.

### Common Follow-ups

- How do you count inversions using merge sort?
- What is TimSort and why do standard libraries use it?
- How do you sort a nearly sorted array where each element is at most k positions away?
- Can you implement binary search recursively? Tradeoffs vs iterative?
- How do you handle duplicates in rotated sorted array search?
- What is the median of two sorted arrays problem?
- How would you sort a linked list?
- What is the Dutch National Flag problem?
