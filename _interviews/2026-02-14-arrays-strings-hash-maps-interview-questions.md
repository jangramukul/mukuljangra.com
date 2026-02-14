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

Arrays and strings are the foundation of almost every DSA interview. Most companies open with 1-2 array/string problems to warm up, and the techniques here -- two pointers, sliding window, hash maps -- keep showing up in harder problems too. Get these down cold and you've got a toolkit that covers half the problems you'll see.

#### Given an unsorted array, find two numbers that add up to a target (Two Sum).

A HashMap is like a coat check -- you hand over your coat (value) and get a numbered ticket (key). Getting your coat back is O(1) because you go straight to the right hook. Same idea here. As you walk through the array, stash each number's index in a HashMap. For each element, ask: "Hey, is `target - current` already in the map?" If yes, you found the pair. One pass, done. Time O(n), space O(n).

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

Think of two people searching a bookshelf for a specific pair of books -- one starts from the left, one from the right, and they walk toward each other. That's two pointers. You maintain two indices that move through the data based on some condition. It works beautifully when the input is sorted or when you're hunting for pairs and subarrays. Classic examples: Two Sum on a sorted array, removing duplicates in-place, container with most water. The magic is that by moving pointers intelligently, you kill the O(n^2) brute force and get O(n).

#### Find the longest substring without repeating characters.

Use a sliding window with a HashSet tracking characters inside. Expand the right side of the window. The moment you hit a duplicate, shrink from the left until that duplicate is gone. Keep track of the maximum window size you've seen. Time O(n) because each character enters and leaves the window at most once -- no wasted work.

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

This is one of those problems that looks hard until you see the trick. Imagine you're walking down a street collecting coins and debts. At every step you ask yourself one question: "Am I better off continuing my current streak, or starting fresh from here?" That's literally it. Keep a running sum and reset it whenever it drops below the current element: `max(nums[i], currentSum + nums[i])`. Track the global max along the way. Time O(n), space O(1).

Here's where it gets clever -- a negative running sum can never help a future subarray. You're carrying dead weight. Drop it and start over.

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

> **🧠 Think about it:** What would happen if every number in the array is negative? Does Kadane's still work, or does it need a special case?

#### How do you check if two strings are anagrams?

Count character frequencies and compare. But here's a neat trick -- use a single frequency array of size 26. Increment for the first string, decrement for the second. If every slot lands back at zero, they're anagrams. It's like a balance scale -- if both sides weigh the same, you're good. Time O(n), space O(1).

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

The "no division" constraint is the whole challenge here. The idea: for each position, the answer is "everything to my left" times "everything to my right." So you make two passes. Forward pass builds up left products. Backward pass multiplies in right products using a running variable. Time O(n), space O(1) excluding the output.

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

Picture a window on a train -- the scenery changes but the frame stays the same size. That's the fixed-size version. Now imagine the window can stretch and shrink. That's the variable-size version.

- **Fixed-size window** -- Slide across the array, adding the new element and dropping the old one. Used for things like "max sum subarray of size k."
- **Variable-size window** -- Expand the right end until a condition breaks, then shrink from the left until it's valid again. Used for "longest substring without repeating characters" or "minimum window substring."

Each element enters and leaves the window at most once, so most sliding window solutions run in O(n).

#### How do you group anagrams from a list of strings?

Sort each string's characters to create a canonical key, then group by that key in a HashMap. "eat", "tea", and "ate" all sort to "aet" -- same key, same bucket. Time O(n * m log m) where n is the number of strings and m is the max string length.

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

Two-pass approach, and it's simpler than it sounds. First pass: count every character's frequency. Second pass: walk the string again and return the first character with a count of 1. Still O(n) time -- the two passes don't hurt you.

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

> **🧠 Think about it:** You've got "product except self" using two passes, "first unique character" using two passes, and Two Sum using one pass with a HashMap. What's the common pattern that lets you avoid brute force nested loops?

#### How do you check if a string is a palindrome?

Two pointers from both ends, marching inward. Compare characters as they meet. For the "ignore non-alphanumeric characters and case" variant, just skip over junk characters as you go. Time O(n), space O(1). Straightforward.

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

Two pointers at both ends again. The area between two lines is `min(height[left], height[right]) * (right - left)`. Now here's the key insight -- you always move the shorter pointer inward. Why? Moving the taller one can only make things worse. The width shrinks no matter what, so your only hope of finding more water is to find a taller wall. Time O(n), space O(1).

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

Expand around each center. Every palindrome mirrors around a center point -- either a single character (odd length like "aba") or the gap between two characters (even length like "abba"). For each of the 2n-1 possible centers, expand outward while characters match. It's like dropping a pebble in a pond and watching the ripples go outward until they hit something that doesn't match. Time O(n^2), space O(1).

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

This one's a beautiful use of prefix sums combined with a HashMap. You want to count subarrays that sum to k. As you walk through the array computing a running prefix sum, you ask: "Has the value `currentSum - k` appeared before as a prefix sum?" If it has, that means there's a subarray between then and now that sums to exactly k. Store prefix sum frequencies in a HashMap. Time O(n), space O(n).

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

That `prefixCount[0] = 1` at the start is easy to forget -- it handles the case where a subarray starting from index 0 sums to k.

#### How do you merge two sorted arrays into one sorted array?

Two pointers, one per array, compare and place the smaller element. But here's where it gets clever for the in-place variant (merging into `nums1` with extra space at the end) -- fill from the back. If you fill from the front, you overwrite elements you haven't compared yet. Starting from the end means you're always writing into empty space. Time O(n + m), space O(1).

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

#### How do you rotate an array by k positions to the right?

Three reverses. Sounds weird, but it works. Reverse the entire array, then reverse the first k elements, then reverse the rest. It's like flipping a pancake stack -- flip everything, then flip the top portion and bottom portion separately, and everything lands where you want it. Handle `k > n` by taking `k % n` first. Time O(n), space O(1).

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

This is the boss fight of sliding window problems. Maintain a frequency map of target characters. Expand the right pointer to pull in characters. Once you've covered all target characters, start shrinking from the left to find the smallest valid window. Track the minimum. Time O(n + m), space O(m).

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

Sort the array first. Then fix one element and use two pointers on the remaining part -- essentially turning it into a bunch of Two Sum problems on sorted input. The tricky part is skipping duplicates so you don't produce duplicate triplets. Time O(n^2), space O(1) excluding output.

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

> **🧠 Think about it:** 3Sum reduces to multiple Two Sum calls. What other problems can you break down by "fixing one element and solving a simpler version on the rest"?

#### What's the difference between HashMap and HashSet, and when do you use each?

A `HashSet` is like a guest list -- you only care about who's on it, not what seat they're in. O(1) add, remove, lookup. Use it when you care about presence: detecting duplicates, tracking visited nodes.

A `HashMap` is like a phone book -- you look up a name (key) and get a number (value). O(1) access by key. Use it when you need to associate data: frequency counting, index tracking (Two Sum), grouping (group anagrams). A HashSet is really just a HashMap where you threw away the values.

#### What is a prefix sum and when is it useful?

A prefix sum array stores cumulative sums where `prefix[i]` is the sum of everything from index 0 to i. Once built in O(n), you can answer any range sum query in O(1) with `prefix[r] - prefix[l - 1]`. It's like keeping a running bank balance -- if you want to know how much you spent between Tuesday and Friday, just subtract Tuesday's balance from Friday's. Useful for multiple range sum queries on static arrays, or combined with a HashMap for problems like "subarray sum equals k."

#### How do you find all anagrams of a pattern in a string?

Fixed-size sliding window -- the window is exactly the length of the pattern. Maintain frequency counts for both the window and the pattern, and compare them as the window slides. When they match, you've found an anagram starting at that position. Time O(n), space O(1).

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
