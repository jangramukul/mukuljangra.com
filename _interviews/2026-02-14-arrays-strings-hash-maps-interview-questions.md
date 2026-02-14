---
title: "Arrays, Strings & Hash Maps"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 1
sequence: 41
description: "Arrays and strings are the foundation of almost every DSA interview."
---

## Arrays, Strings & Hash Maps

Arrays and strings are the foundation of almost every DSA interview. Most companies open with 1-2 array/string problems to warm up, and the techniques here — two pointers, sliding window, hash maps — show up in harder problems too.

#### Given an unsorted array, find two numbers that add up to a target (Two Sum).

Use a HashMap to store each number's index as you iterate. For each element, check if `target - current` exists in the map. If it does, you found the pair. Time O(n), space O(n).

```kotlin
fun twoSum(nums: IntArray, target: Int): IntArray {
    val map = HashMap<Int, Int>()
    for (i in nums.indices) {
        val complement = target - nums[i]
        if (map.containsKey(complement)) {
            return intArrayOf(map[complement]!!, i)
        }
        map[nums[i]] = i
    }
    return intArrayOf(-1, -1)
}
```

#### What is the two-pointer technique and when do you use it?

Two pointers is a pattern where you maintain two indices that move through the data based on some condition. It works when the input is sorted or when you're searching for pairs/subarrays. Classic examples are Two Sum on a sorted array, removing duplicates in-place, and container with most water. By moving pointers intelligently, you reduce O(n^2) brute force to O(n).

#### Find the longest substring without repeating characters.

Use a HashSet to track characters in the current window. Expand the right pointer. If a duplicate is found, shrink from the left until the duplicate is removed. Track the maximum window size. Time O(n) because each character is added and removed at most once.

```kotlin
fun lengthOfLongestSubstring(s: String): Int {
    val seen = HashSet<Char>()
    var left = 0
    var maxLen = 0
    for (right in s.indices) {
        while (s[right] in seen) {
            seen.remove(s[left])
            left++
        }
        seen.add(s[right])
        maxLen = maxOf(maxLen, right - left + 1)
    }
    return maxLen
}
```

#### Explain Kadane's algorithm for maximum subarray sum.

Kadane's algorithm keeps a running sum and resets whenever it drops below zero. At each index, decide: extend the current subarray or start fresh. `max(nums[i], currentSum + nums[i])`. Track the global maximum. Time O(n), space O(1).

The insight is that a negative running sum can never help a future subarray — you're better off starting over.

```kotlin
fun maxSubArray(nums: IntArray): Int {
    var currentSum = nums[0]
    var maxSum = nums[0]
    for (i in 1 until nums.size) {
        currentSum = maxOf(nums[i], currentSum + nums[i])
        maxSum = maxOf(maxSum, currentSum)
    }
    return maxSum
}
```

#### How do you check if two strings are anagrams?

Count the frequency of each character in both strings and compare. Use a single frequency array of size 26 — increment for the first string, decrement for the second. If every count is zero at the end, they're anagrams. Time O(n), space O(1).

```kotlin
fun isAnagram(s: String, t: String): Boolean {
    if (s.length != t.length) return false
    val count = IntArray(26)
    for (i in s.indices) {
        count[s[i] - 'a']++
        count[t[i] - 'a']--
    }
    return count.all { it == 0 }
}
```

#### How do you compute product of array except self without using division?

Build left products in a forward pass, then multiply in right products in a backward pass using a running variable. Time O(n), space O(1) excluding the output.

```kotlin
fun productExceptSelf(nums: IntArray): IntArray {
    val n = nums.size
    val result = IntArray(n)
    result[0] = 1
    for (i in 1 until n) {
        result[i] = result[i - 1] * nums[i - 1]
    }
    var rightProduct = 1
    for (i in n - 1 downTo 0) {
        result[i] *= rightProduct
        rightProduct *= nums[i]
    }
    return result
}
```

#### What is the sliding window technique?

Sliding window maintains a window (subarray or substring) that expands or contracts as you move through the data.

- **Fixed-size window** — Slide across the array, adding the new element and removing the old one. Used for "max sum subarray of size k."
- **Variable-size window** — Expand the right end until a condition breaks, then shrink from the left until valid again. Used for "longest substring without repeating characters" or "minimum window substring."

Each element enters and leaves the window at most once, so most sliding window solutions run in O(n).

#### How do you group anagrams from a list of strings?

Sort each string's characters to create a canonical key, then group by that key using a HashMap. All anagrams produce the same sorted key. Time O(n * m log m) where n is the number of strings and m is the max string length.

```kotlin
fun groupAnagrams(strs: Array<String>): List<List<String>> {
    val map = HashMap<String, MutableList<String>>()
    for (s in strs) {
        val key = String(s.toCharArray().apply { sort() })
        map.getOrPut(key) { mutableListOf() }.add(s)
    }
    return map.values.toList()
}
```

#### How do you find the first non-repeating character in a string?

Build a frequency map in one pass, then iterate the string again and return the first character with count 1. Two passes but still O(n) time.

```kotlin
fun firstUniqChar(s: String): Int {
    val freq = IntArray(26)
    for (c in s) freq[c - 'a']++
    for (i in s.indices) {
        if (freq[s[i] - 'a'] == 1) return i
    }
    return -1
}
```

#### How do you check if a string is a palindrome?

Use two pointers from both ends and compare characters moving inward. For variants that say "ignore non-alphanumeric characters and case," filter as you go. Time O(n), space O(1).

```kotlin
fun isPalindrome(s: String): Boolean {
    var left = 0
    var right = s.length - 1
    while (left < right) {
        while (left < right && !s[left].isLetterOrDigit()) left++
        while (left < right && !s[right].isLetterOrDigit()) right--
        if (s[left].lowercaseChar() != s[right].lowercaseChar()) return false
        left++
        right--
    }
    return true
}
```

#### How do you find the container with most water?

Use two pointers at both ends. The area is `min(height[left], height[right]) * (right - left)`. Move the pointer pointing to the shorter line inward, because moving the taller one can never increase the area. Time O(n), space O(1).

```kotlin
fun maxArea(height: IntArray): Int {
    var left = 0
    var right = height.size - 1
    var maxWater = 0
    while (left < right) {
        val area = minOf(height[left], height[right]) * (right - left)
        maxWater = maxOf(maxWater, area)
        if (height[left] < height[right]) left++ else right--
    }
    return maxWater
}
```

#### How do you find the longest palindromic substring?

Expand around each center. Every palindrome has a center — either a single character (odd length) or between two characters (even length). For each of the 2n-1 possible centers, expand outward while characters match. Time O(n^2), space O(1).

```kotlin
fun longestPalindrome(s: String): String {
    var start = 0; var maxLen = 0
    fun expand(left: Int, right: Int) {
        var l = left; var r = right
        while (l >= 0 && r < s.length && s[l] == s[r]) {
            if (r - l + 1 > maxLen) {
                start = l; maxLen = r - l + 1
            }
            l--; r++
        }
    }
    for (i in s.indices) {
        expand(i, i)
        expand(i, i + 1)
    }
    return s.substring(start, start + maxLen)
}
```

#### Explain the "subarray sum equals k" problem.

Count subarrays whose elements sum to k. As you compute the running prefix sum, check if `currentSum - k` has appeared before using a HashMap that stores prefix sum frequencies. Time O(n), space O(n).

```kotlin
fun subarraySum(nums: IntArray, k: Int): Int {
    val prefixCount = HashMap<Int, Int>()
    prefixCount[0] = 1
    var currentSum = 0
    var count = 0
    for (num in nums) {
        currentSum += num
        count += prefixCount.getOrDefault(currentSum - k, 0)
        prefixCount[currentSum] = prefixCount.getOrDefault(currentSum, 0) + 1
    }
    return count
}
```

The `prefixCount[0] = 1` initialization handles the case where a subarray starting from index 0 sums to k.

#### How do you merge two sorted arrays into one sorted array?

Use two pointers, one for each array. Compare and place the smaller element. For the in-place variant (merging into `nums1` with extra space at the end), fill from the back to avoid overwriting.

```kotlin
fun merge(nums1: IntArray, m: Int, nums2: IntArray, n: Int) {
    var i = m - 1
    var j = n - 1
    var k = m + n - 1
    while (i >= 0 && j >= 0) {
        if (nums1[i] > nums2[j]) {
            nums1[k--] = nums1[i--]
        } else {
            nums1[k--] = nums2[j--]
        }
    }
    while (j >= 0) nums1[k--] = nums2[j--]
}
```

Time O(n + m), space O(1).

#### How do you rotate an array by k positions to the right?

Three reverses. Reverse the entire array, then reverse the first k elements, then reverse the rest. Handle `k > n` by taking `k % n` first. Time O(n), space O(1).

```kotlin
fun rotate(nums: IntArray, k: Int) {
    val n = nums.size
    val shift = k % n
    reverse(nums, 0, n - 1)
    reverse(nums, 0, shift - 1)
    reverse(nums, shift, n - 1)
}

fun reverse(nums: IntArray, start: Int, end: Int) {
    var l = start; var r = end
    while (l < r) {
        val temp = nums[l]
        nums[l] = nums[r]
        nums[r] = temp
        l++; r--
    }
}
```

#### How do you find the minimum window substring containing all characters of a target?

Maintain a frequency map of target characters. Expand the right pointer to include characters, shrinking from the left whenever all target characters are covered. Track the minimum valid window. Time O(n + m), space O(m).

```kotlin
fun minWindow(s: String, t: String): String {
    val need = HashMap<Char, Int>()
    for (c in t) need[c] = need.getOrDefault(c, 0) + 1
    val window = HashMap<Char, Int>()
    var formed = 0
    var left = 0
    var minLen = Int.MAX_VALUE
    var result = ""
    for (right in s.indices) {
        val c = s[right]
        window[c] = window.getOrDefault(c, 0) + 1
        if (need.containsKey(c) && window[c] == need[c]) formed++
        while (formed == need.size) {
            if (right - left + 1 < minLen) {
                minLen = right - left + 1
                result = s.substring(left, right + 1)
            }
            val leftChar = s[left]
            window[leftChar] = window[leftChar]!! - 1
            if (need.containsKey(leftChar) && window[leftChar]!! < need[leftChar]!!) formed--
            left++
        }
    }
    return result
}
```

#### How do you solve the 3Sum problem?

Sort the array. Fix one element and use two pointers on the remaining part. Skip duplicates to avoid duplicate triplets. Time O(n^2), space O(1) excluding output.

```kotlin
fun threeSum(nums: IntArray): List<List<Int>> {
    nums.sort()
    val result = mutableListOf<List<Int>>()
    for (i in 0 until nums.size - 2) {
        if (i > 0 && nums[i] == nums[i - 1]) continue
        var left = i + 1
        var right = nums.size - 1
        while (left < right) {
            val sum = nums[i] + nums[left] + nums[right]
            when {
                sum == 0 -> {
                    result.add(listOf(nums[i], nums[left], nums[right]))
                    while (left < right && nums[left] == nums[left + 1]) left++
                    while (left < right && nums[right] == nums[right - 1]) right--
                    left++; right--
                }
                sum < 0 -> left++
                else -> right--
            }
        }
    }
    return result
}
```

#### What's the difference between HashMap and HashSet, and when do you use each?

A `HashSet` stores unique values with O(1) add, remove, and lookup. Use it when you only care about presence — detecting duplicates, tracking visited nodes.

A `HashMap` stores key-value pairs with O(1) access by key. Use it when you need to associate data — frequency counting, index tracking (Two Sum), grouping (group anagrams). A HashSet is essentially a HashMap where you only use the keys.

#### What is a prefix sum and when is it useful?

A prefix sum array stores cumulative sums where `prefix[i]` is the sum of elements from index 0 to i. Once built in O(n), you can answer any range sum query in O(1) using `prefix[r] - prefix[l - 1]`. Useful for multiple range sum queries on static arrays, or combined with a HashMap for problems like "subarray sum equals k."

#### How do you find all anagrams of a pattern in a string?

Use a fixed-size sliding window of length equal to the pattern. Maintain frequency counts and compare. Time O(n), space O(1).

```kotlin
fun findAnagrams(s: String, p: String): List<Int> {
    if (s.length < p.length) return emptyList()
    val result = mutableListOf<Int>()
    val pCount = IntArray(26)
    val sCount = IntArray(26)
    for (c in p) pCount[c - 'a']++
    for (i in s.indices) {
        sCount[s[i] - 'a']++
        if (i >= p.length) sCount[s[i - p.length] - 'a']--
        if (sCount.contentEquals(pCount)) result.add(i - p.length + 1)
    }
    return result
}
```

### Common Follow-ups

- How would you modify Two Sum to return all pairs, not just one?
- Can Kadane's algorithm handle the case where all numbers are negative?
- How do you find the longest substring with at most k distinct characters?
- How would you solve "product except self" if the array contains zeros?
- How does prefix sum extend to 2D arrays (prefix sum matrix)?
- What happens to HashMap performance when there are many hash collisions?
- How do you solve the trapping rain water problem?
- Can you solve 3Sum with a HashSet approach instead of two pointers?
