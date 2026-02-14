---
title: "Sorting, Searching & Binary Search"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 8
sequence: 20
description: "Sorting and binary search are foundational topics in coding interviews."
---

## Sorting, Searching & Binary Search

Sorting and binary search are foundational topics in coding interviews. Most companies expect you to implement merge sort or quick sort from scratch and apply binary search to non-obvious problems beyond simple array lookup.

### Core Questions (Beginner → Intermediate)

#### Q1: What is the time and space complexity of the most common sorting algorithms?

- **Merge Sort** — O(n log n) time always, O(n) extra space. Stable.
- **Quick Sort** — O(n log n) average, O(n^2) worst case (bad pivot). O(log n) space for the call stack. Not stable.
- **Heap Sort** — O(n log n) time always, O(1) extra space. Not stable.
- **Counting Sort** — O(n + k) time and space, where k is the range of values. Stable. Only works for integers in a known range.
- **Radix Sort** — O(d * (n + k)) time, where d is the number of digits and k is the base. Stable. Works for integers or fixed-length strings.

Merge sort is preferred when stability matters or you need guaranteed O(n log n). Quick sort is usually faster in practice because of better cache locality and lower constant factors.

#### Q2: Implement merge sort.

Merge sort divides the array in half recursively, sorts each half, and merges the two sorted halves. The merge step does the real work — it walks through both halves with two pointers and picks the smaller element at each step.

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

Time: O(n log n). Space: O(n) for the temporary array.

#### Q3: Implement quick sort and explain the partition step.

Quick sort picks a pivot element, partitions the array so everything less than the pivot goes left and everything greater goes right, then recursively sorts each side. The partition step is what makes it work — it rearranges elements in-place around the pivot.

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

Time: O(n log n) average, O(n^2) worst case. Space: O(log n) for the recursion stack. Worst case happens when the pivot is always the smallest or largest element — using random pivot selection or median-of-three avoids this in practice.

#### Q4: What is heap sort and how does it work?

Heap sort builds a max-heap from the array, then repeatedly extracts the maximum and places it at the end. Building the heap takes O(n) using the bottom-up approach (sift-down from the last non-leaf node). Each extraction takes O(log n) because you sift-down the new root.

```kotlin
fun heapSort(arr: IntArray) {
    val n = arr.size
    // Build max-heap
    for (i in n / 2 - 1 downTo 0) siftDown(arr, i, n)
    // Extract elements
    for (i in n - 1 downTo 1) {
        arr[0] = arr[i].also { arr[i] = arr[0] }
        siftDown(arr, 0, i)
    }
}

fun siftDown(arr: IntArray, start: Int, size: Int) {
    var i = start
    while (2 * i + 1 < size) {
        var child = 2 * i + 1
        if (child + 1 < size && arr[child + 1] > arr[child]) child++
        if (arr[i] >= arr[child]) break
        arr[i] = arr[child].also { arr[child] = arr[i] }
        i = child
    }
}
```

Time: O(n log n). Space: O(1). Heap sort is useful when you need guaranteed O(n log n) with no extra space, but it has poor cache locality compared to quick sort.

#### Q5: What is counting sort and when would you use it?

Counting sort counts the occurrences of each value, then uses those counts to place elements in their correct position. It works only when the range of values (k) is small relative to n. If you have a million integers all between 0 and 100, counting sort runs in O(n + 100) which beats any comparison-based sort.

```kotlin
fun countingSort(arr: IntArray, maxVal: Int): IntArray {
    val count = IntArray(maxVal + 1)
    for (num in arr) count[num]++
    for (i in 1..maxVal) count[i] += count[i - 1]
    val output = IntArray(arr.size)
    for (i in arr.indices.reversed()) {
        output[count[arr[i]] - 1] = arr[i]
        count[arr[i]]--
    }
    return output
}
```

Time: O(n + k). Space: O(n + k). It's a non-comparison sort, so it breaks the O(n log n) lower bound that applies to comparison-based algorithms.

#### Q6: How does radix sort work?

Radix sort sorts numbers digit by digit, starting from the least significant digit to the most significant. Each digit is sorted using a stable sort like counting sort. After processing all d digits, the array is fully sorted.

Time: O(d * (n + k)), where d is the number of digits and k is the base (10 for decimal). Space: O(n + k). It's efficient when d is small — for 32-bit integers, d is at most 10 digits in base 10, making it practically O(n).

#### Q7: Explain standard binary search and its common pitfalls.

Binary search finds a target in a sorted array by repeatedly halving the search space. Compare the middle element with the target — if it's smaller, search the right half; if it's larger, search the left half.

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

Time: O(log n). Space: O(1). Common pitfalls: using `(left + right) / 2` instead of `left + (right - left) / 2` (integer overflow), getting the loop condition wrong (`<=` vs `<`), and off-by-one errors with `mid + 1` and `mid - 1`.

#### Q8: What is lower bound and upper bound in binary search?

Lower bound finds the first index where `arr[index] >= target`. Upper bound finds the first index where `arr[index] > target`. These are useful for range queries — the count of elements equal to target is `upperBound - lowerBound`.

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

Time: O(log n). Space: O(1). Note that `right` starts at `arr.size` (not `arr.size - 1`) and the loop condition is `<` (not `<=`) because the answer can be past the last element.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How do you search in a rotated sorted array?

A rotated sorted array has two sorted halves. At each step of binary search, determine which half is sorted by comparing `arr[left]` with `arr[mid]`. If the left half is sorted and the target falls in that range, search left. Otherwise, search right.

```kotlin
fun searchRotated(arr: IntArray, target: Int): Int {
    var left = 0; var right = arr.size - 1
    while (left <= right) {
        val mid = left + (right - left) / 2
        if (arr[mid] == target) return mid
        if (arr[left] <= arr[mid]) {
            // Left half is sorted
            if (target >= arr[left] && target < arr[mid]) right = mid - 1
            else left = mid + 1
        } else {
            // Right half is sorted
            if (target > arr[mid] && target <= arr[right]) left = mid + 1
            else right = mid - 1
        }
    }
    return -1
}
```

Time: O(log n). Space: O(1). If duplicates are allowed, the worst case degrades to O(n) because you can't determine which half is sorted when `arr[left] == arr[mid] == arr[right]`.

#### Q10: How do you find the peak element in an array?

A peak element is greater than its neighbors. Binary search works here because if `arr[mid] < arr[mid + 1]`, a peak must exist on the right side (the values are increasing). If `arr[mid] >= arr[mid + 1]`, a peak exists on the left side (including mid).

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

Time: O(log n). Space: O(1). This works because the problem guarantees `arr[-1] = arr[n] = -infinity`, so there's always at least one peak. You don't need the array to be sorted.

#### Q11: What is the Quickselect algorithm for finding the kth largest element?

Quickselect uses the same partition logic as quick sort but only recurses into the side that contains the kth element. After partitioning, if the pivot lands at index k, you're done. If the pivot index is less than k, recurse right. Otherwise, recurse left.

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

Time: O(n) average, O(n^2) worst case. Space: O(1) iterative, O(n) worst case recursive. Using random pivot selection makes the worst case extremely unlikely. An alternative is using a min-heap of size k which gives O(n log k).

#### Q12: How do you solve the merge intervals problem?

Sort intervals by start time, then iterate and merge overlapping ones. Two intervals overlap if the current interval's start is less than or equal to the previous interval's end.

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

Time: O(n log n) for sorting. Space: O(n) for the result. This pattern shows up in calendar problems, meeting rooms, and scheduling.

#### Q13: How do you solve the Meeting Rooms problem? What about Meeting Rooms II?

**Meeting Rooms I** — can a person attend all meetings? Sort by start time and check if any meeting starts before the previous one ends.

```kotlin
fun canAttendAll(intervals: Array<IntArray>): Boolean {
    intervals.sortBy { it[0] }
    for (i in 1 until intervals.size) {
        if (intervals[i][0] < intervals[i - 1][1]) return false
    }
    return true
}
```

**Meeting Rooms II** — find the minimum number of rooms needed. Sort start and end times separately. Walk through start times — if a meeting starts before the earliest ending meeting finishes, you need another room. A min-heap tracking end times works well.

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

Time: O(n log n). Space: O(n). The heap size at any point equals the number of rooms in use.

#### Q14: How does binary search apply to problems beyond sorted arrays?

Binary search works on any search space with a monotonic property — a condition that is false up to some point and true after it (or vice versa). Examples:
- **Minimum capacity to ship packages within D days** — binary search on the capacity value. For each candidate, check if it's feasible.
- **Koko eating bananas** — binary search on eating speed.
- **Split array largest sum** — binary search on the answer (the maximum subarray sum).

The pattern is: binary search on the answer, write a helper function that checks if a candidate answer is feasible, and narrow the range based on feasibility.

#### Q15: Explain the stability of sorting algorithms and why it matters.

A stable sort preserves the relative order of elements with equal keys. Merge sort, counting sort, and radix sort are stable. Quick sort and heap sort are not stable.

Stability matters when sorting by multiple criteria. If you sort employees by name (stable sort), then sort by department, employees within the same department stay in alphabetical order. With an unstable sort, the name ordering within each department would be scrambled. In practice, Kotlin's `sortedBy` uses TimSort (a merge sort variant) which is stable, so chained sorts work correctly.

#### Q16: What is the difference between comparison-based and non-comparison-based sorting?

Comparison-based sorts (merge sort, quick sort, heap sort) compare pairs of elements to determine order. They have a provable lower bound of O(n log n) — you can't do better in the worst case because the decision tree has n! leaves and needs log(n!) = O(n log n) comparisons to distinguish all permutations.

Non-comparison sorts (counting sort, radix sort, bucket sort) avoid comparisons by using the element values directly. They can achieve O(n) but only work under specific constraints — integers in a bounded range, fixed-length strings, or elements that can be mapped to array indices. They're not general-purpose replacements.

#### Q17: How would you find the minimum in a rotated sorted array?

Binary search. If `arr[mid] > arr[right]`, the minimum is in the right half. If `arr[mid] <= arr[right]`, the minimum is in the left half (including mid).

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

Time: O(log n). Space: O(1). This works because the rotation creates exactly one point where the sorted order breaks. With duplicates, worst case is O(n) — when `arr[mid] == arr[right]`, you can only shrink the window by one (`right--`).

#### Q18: When would you use a sorting algorithm during an interview vs using a built-in sort?

Implement from scratch when the interviewer explicitly asks you to (merge sort, quick sort implementations) or when the problem needs a modified sort (like counting inversions using merge sort, or kth element using quickselect). For everything else — merge intervals, meeting rooms, frequency-based problems — use `sortedBy` or `sortWith`. Interviewers care about problem-solving, not whether you can write heap sort from memory. But you should be able to explain the time complexity and why you chose that approach.

### Common Follow-ups

- How would you count the number of inversions in an array using merge sort?
- What is TimSort and why do most standard libraries use it?
- How would you sort a nearly sorted array where each element is at most k positions away from its sorted position?
- Can you implement binary search recursively? What are the tradeoffs vs iterative?
- How do you handle duplicates in search in rotated sorted array?
- What is the median of two sorted arrays problem and why is it hard?
- How would you sort a linked list? Which sorting algorithm works best?
- What is the Dutch National Flag problem and how does it relate to quick sort?
