---
title: "Arrays, Strings & Hash Maps"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 1
level: junior
sequence: 16
---

## Arrays, Strings & Hash Maps

Arrays and strings are the foundation of almost every DSA interview. Most companies open with 1-2 array/string problems to warm up, and the techniques here — two pointers, sliding window, hash maps — show up in harder problems too.

### Core Questions

#### Q1: How do you reverse a string in-place?

Swap characters from both ends moving inward. Use two pointers — one at the start, one at the end — and swap until they meet in the middle. Time O(n), space O(1).

```kotlin
fun reverseString(s: CharArray) {
    var left = 0
    var right = s.size - 1
    while (left < right) {
        val temp = s[left]
        s[left] = s[right]
        s[right] = temp
        left++
        right--
    }
}
```

#### Q2: How do you check if a string is a palindrome?

Use two pointers from both ends and compare characters moving inward. If every pair matches, it's a palindrome. For interview variants that say "ignore non-alphanumeric characters and case," filter as you go instead of preprocessing. Time O(n), space O(1).

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

#### Q3: What is the two-pointer technique and when do you use it?

Two pointers is a pattern where you maintain two indices that move through the data based on some condition. It works when the input is sorted or when you're searching for pairs/subarrays. Classic examples are Two Sum on a sorted array, removing duplicates in-place, and container with most water. The key insight is that by moving pointers intelligently, you reduce O(n^2) brute force to O(n).

#### Q4: Given a sorted array, find two numbers that add up to a target.

Place one pointer at the start and one at the end. If the sum is too small, move the left pointer right. If too large, move the right pointer left. Because the array is sorted, adjusting pointers narrows the search correctly. Time O(n), space O(1).

```kotlin
fun twoSumSorted(nums: IntArray, target: Int): IntArray {
    var left = 0
    var right = nums.size - 1
    while (left < right) {
        val sum = nums[left] + nums[right]
        when {
            sum == target -> return intArrayOf(left, right)
            sum < target -> left++
            else -> right--
        }
    }
    return intArrayOf(-1, -1)
}
```

#### Q5: How do you solve Two Sum on an unsorted array?

Use a HashMap to store each number's index as you iterate. For each element, check if `target - current` exists in the map. If it does, you've found your pair. If not, add the current element to the map. Time O(n), space O(n). This is the classic HashMap lookup pattern — trade space for time.

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

#### Q6: How do you check if two strings are anagrams?

Count the frequency of each character in both strings and compare. You can use a single frequency array of size 26 — increment for the first string, decrement for the second. If every count is zero at the end, they're anagrams. Time O(n), space O(1) since the character set is fixed.

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

#### Q7: How do you find the first non-repeating character in a string?

Build a frequency map in one pass, then iterate the string again and return the first character with count 1. Two passes but still O(n) time. Using a `LinkedHashMap` preserves insertion order, but you don't even need that — just scan the string a second time and check counts.

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

#### Q8: What is the sliding window technique?

Sliding window maintains a window (subarray or substring) that expands or contracts as you move through the data. There are two variants:

- **Fixed-size window** — The window size is given. Slide it across the array, adding the new element and removing the old one. Used for problems like "max sum subarray of size k."
- **Variable-size window** — Expand the right end until a condition breaks, then shrink from the left until it's valid again. Used for problems like "longest substring without repeating characters" or "minimum window substring."

The pattern turns O(n*k) or O(n^2) solutions into O(n) because each element enters and leaves the window at most once.

#### Q9: Find the maximum sum subarray of size k (fixed-size sliding window).

Compute the sum of the first k elements. Then slide the window by adding the next element and removing the leftmost. Track the maximum sum as you go. Time O(n), space O(1).

```kotlin
fun maxSumSubarray(nums: IntArray, k: Int): Int {
    var windowSum = 0
    for (i in 0 until k) windowSum += nums[i]
    var maxSum = windowSum
    for (i in k until nums.size) {
        windowSum += nums[i] - nums[i - k]
        maxSum = maxOf(maxSum, windowSum)
    }
    return maxSum
}
```

#### Q10: Find the longest substring without repeating characters (variable-size sliding window).

Use a HashSet to track characters in the current window. Expand the right pointer. If a duplicate is found, shrink from the left until the duplicate is removed. Track the maximum window size. Time O(n) because each character is added and removed at most once. Space O(min(n, alphabet size)).

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

#### Q11: What is a prefix sum and when is it useful?

A prefix sum array stores cumulative sums where `prefix[i]` is the sum of elements from index 0 to i. Once built in O(n), you can answer any range sum query `sum(l, r)` in O(1) using `prefix[r] - prefix[l - 1]`. It's useful when you have multiple range sum queries on a static array, or in problems like "subarray sum equals k" where you combine it with a HashMap.

### Deep Dive Questions

#### Q12: Explain Kadane's algorithm for maximum subarray sum.

Kadane's algorithm keeps a running sum and resets it whenever it drops below zero. At each index, you decide: is it better to extend the current subarray or start fresh from this element? The answer is `max(nums[i], currentSum + nums[i])`. Track the global maximum across all positions. Time O(n), space O(1).

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

#### Q13: How do you rotate an array by k positions to the right?

The cleanest approach is three reverses. Reverse the entire array, then reverse the first k elements, then reverse the rest. This works because reversing the whole array puts the last k elements in front but in the wrong order — the two partial reverses fix that. Time O(n), space O(1).

Handle `k > n` by taking `k % n` first.

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

#### Q14: How do you merge two sorted arrays into one sorted array?

Use two pointers, one for each array. Compare elements at both pointers and place the smaller one into the result. Advance the pointer of the array you took from. When one array is exhausted, copy the remaining elements from the other. Time O(n + m), space O(n + m) for the result.

For the in-place variant (like merging into `nums1` with extra space at the end), fill from the back to avoid overwriting elements you haven't processed yet.

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

#### Q15: How do you compute product of array except self without using division?

Build two arrays — `leftProducts` where `leftProducts[i]` is the product of everything to the left of index i, and `rightProducts` for everything to the right. The answer at each index is `leftProducts[i] * rightProducts[i]`. Time O(n), space O(n).

To optimize space to O(1) (excluding the output), compute left products into the result array in a forward pass, then multiply in right products with a running variable in a backward pass.

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

#### Q16: Find all anagrams of a pattern in a string (sliding window + frequency counting).

Use a fixed-size sliding window of length equal to the pattern. Maintain a frequency count difference between the window and the pattern. When the difference becomes zero, you've found an anagram. Instead of comparing full frequency arrays each step, track a `matches` counter that counts how many of the 26 characters have equal frequency. Time O(n), space O(1).

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

#### Q17: How do you find the longest palindromic substring?

Expand around each center. Every palindrome has a center — either a single character (odd length) or between two characters (even length). For each of the 2n-1 possible centers, expand outward while characters match. Track the longest one found. Time O(n^2), space O(1).

Manacher's algorithm does it in O(n) but interviewers rarely expect it — they want to see the expand-around-center approach and confirm you know Manacher exists.

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
        expand(i, i)       // odd length
        expand(i, i + 1)   // even length
    }
    return s.substring(start, start + maxLen)
}
```

#### Q18: Explain the "subarray sum equals k" problem and how prefix sums + HashMap solve it.

You need to count subarrays whose elements sum to k. The brute force is O(n^2). The key insight: if `prefixSum[j] - prefixSum[i] == k`, then the subarray from i+1 to j sums to k. So as you compute the running prefix sum, check if `currentSum - k` has appeared before using a HashMap that stores prefix sum frequencies. Time O(n), space O(n).

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

#### Q19: How do you group anagrams from a list of strings?

Sort each string's characters to create a canonical key, then group by that key using a HashMap. All anagrams produce the same sorted key. Time O(n * m log m) where n is the number of strings and m is the max string length. Space O(n * m).

An alternative key is a character frequency string like "a2b1c3" which avoids sorting and runs in O(n * m), but the sorted key is simpler to implement and what interviewers expect first.

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

#### Q20: What's the difference between HashMap and HashSet, and when do you use each in DSA problems?

A `HashSet` stores unique values with O(1) add, remove, and lookup. Use it when you only care about presence — "have I seen this element before?" Problems like detecting duplicates, tracking visited nodes, or checking membership.

A `HashMap` stores key-value pairs with O(1) access by key. Use it when you need to associate data with each element — frequency counting, index tracking (Two Sum), or grouping (group anagrams). In terms of implementation, a HashSet is just a HashMap where you only use the keys.

#### Q21: How do you find the minimum window substring that contains all characters of a target string?

This is the hardest sliding window problem. Maintain a frequency map of the target characters. Expand the right pointer to include characters, shrinking the window from the left whenever all target characters are covered. Track the minimum valid window.

The trick is maintaining a `formed` counter — how many unique characters in the target have their required frequency met in the window. When `formed` equals the number of unique target characters, the window is valid. Time O(n + m), space O(m) where m is the target length.

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

### Common Follow-ups

- How would you modify Two Sum to return all pairs, not just one?
- Can Kadane's algorithm handle the case where all numbers are negative?
- How do you find the longest substring with at most k distinct characters?
- What's the time complexity of the sorted-key approach vs. the frequency-key approach for group anagrams?
- How would you solve "product except self" if the array contains zeros?
- Can you solve the minimum window substring problem with a single HashMap instead of two?
- How does prefix sum extend to 2D arrays (prefix sum matrix)?
- What happens to HashMap performance when there are many hash collisions, and how does that affect your DSA solution's worst case?
