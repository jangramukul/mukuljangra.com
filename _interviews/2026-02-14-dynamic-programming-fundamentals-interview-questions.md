---
title: "Dynamic Programming — Fundamentals"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 9
sequence: 49
description: "DP is one of the most tested topics in FAANG interviews. If a problem has overlapping subproblems and optimal substructure, it's likely a DP problem."
---

## Dynamic Programming — Fundamentals

DP is one of the most tested topics in FAANG interviews. If a problem has overlapping subproblems and optimal substructure, it's likely a DP problem. Most candidates struggle here, so being comfortable with the core patterns gives you a strong edge.

#### How do you solve the Climbing Stairs problem?

To reach step n, you came from step n-1 or n-2. So `dp[n] = dp[n-1] + dp[n-2]`. This is essentially Fibonacci. Since each state only depends on the previous two, optimize space to O(1).

```kotlin
fun climbStairs(n: Int): Int {
    if (n <= 2) return n
    var prev2 = 1
    var prev1 = 2
    for (i in 3..n) {
        val current = prev1 + prev2
        prev2 = prev1
        prev1 = current
    }
    return prev1
}
```

#### How do you solve the Coin Change problem?

Find the minimum coins to make a given amount. For each amount, try every coin and take the minimum. `dp[amount] = min(dp[amount], dp[amount - coin] + 1)`.

```kotlin
fun coinChange(coins: IntArray, amount: Int): Int {
    val dp = IntArray(amount + 1) { amount + 1 }
    dp[0] = 0
    for (i in 1..amount) {
        for (coin in coins) {
            if (coin <= i) {
                dp[i] = minOf(dp[i], dp[i - coin] + 1)
            }
        }
    }
    return if (dp[amount] > amount) -1 else dp[amount]
}
```

Time O(amount * coins), space O(amount). This is an unbounded knapsack variant.

#### What is dynamic programming and when do you use it?

DP is an optimization technique where you break a problem into smaller subproblems, solve each once, and store results. Use it when a problem has overlapping subproblems (same subproblem solved multiple times) and optimal substructure (optimal solution builds from optimal subproblems).

#### What is the difference between memoization and tabulation?

Memoization is top-down — recursive with caching. Tabulation is bottom-up — iteratively fill a table from smallest subproblems. Memoization is easier to write. Tabulation avoids recursion overhead and stack limits, and often allows space optimization to keep only the previous row.

#### How do you solve the House Robber problem?

Can't rob adjacent houses. At each house: rob this one plus best from two back, or skip and take best from one back. `dp[i] = max(dp[i-1], dp[i-2] + nums[i])`.

```kotlin
fun rob(nums: IntArray): Int {
    if (nums.size == 1) return nums[0]
    var prev2 = 0
    var prev1 = 0
    for (num in nums) {
        val current = maxOf(prev1, prev2 + num)
        prev2 = prev1
        prev1 = current
    }
    return prev1
}
```

#### How do you find the Longest Increasing Subsequence (LIS)?

For each element, look at all previous elements. If a previous element is smaller, extend its subsequence. `dp[i] = max(dp[j] + 1)` for all j < i where `nums[j] < nums[i]`.

```kotlin
fun lengthOfLIS(nums: IntArray): Int {
    val dp = IntArray(nums.size) { 1 }
    for (i in 1 until nums.size) {
        for (j in 0 until i) {
            if (nums[j] < nums[i]) {
                dp[i] = maxOf(dp[i], dp[j] + 1)
            }
        }
    }
    return dp.max()
}
```

Time O(n^2). There's an O(n log n) approach using binary search with patience sorting.

#### How do you solve the 0/1 Knapsack problem?

Items with weights and values, knapsack with capacity. Each item used at most once. Iterate capacity in reverse for the 1D optimization — going forward would reuse items.

```kotlin
fun knapsack(weights: IntArray, values: IntArray, capacity: Int): Int {
    val n = weights.size
    val dp = IntArray(capacity + 1)
    for (i in 0 until n) {
        for (w in capacity downTo weights[i]) {
            dp[w] = maxOf(dp[w], dp[w - weights[i]] + values[i])
        }
    }
    return dp[capacity]
}
```

Time O(n * capacity), space O(capacity).

#### How do you solve Edit Distance?

Minimum operations (insert, delete, replace) to convert one string to another. If characters match, `dp[i][j] = dp[i-1][j-1]`. Otherwise, take min of insert, delete, replace plus 1.

```kotlin
fun minDistance(word1: String, word2: String): Int {
    val m = word1.length
    val n = word2.length
    val dp = Array(m + 1) { IntArray(n + 1) }
    for (i in 0..m) dp[i][0] = i
    for (j in 0..n) dp[0][j] = j
    for (i in 1..m) {
        for (j in 1..n) {
            dp[i][j] = if (word1[i - 1] == word2[j - 1]) {
                dp[i - 1][j - 1]
            } else {
                1 + minOf(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
            }
        }
    }
    return dp[m][n]
}
```

Time O(m*n), space O(m*n). Can optimize to O(n) space.

#### How do you find the Longest Common Subsequence (LCS)?

Compare two strings character by character. If they match, extend from diagonal. If not, take max of skipping one character from either string.

```kotlin
fun longestCommonSubsequence(text1: String, text2: String): Int {
    val m = text1.length
    val n = text2.length
    val dp = Array(m + 1) { IntArray(n + 1) }
    for (i in 1..m) {
        for (j in 1..n) {
            dp[i][j] = if (text1[i - 1] == text2[j - 1]) {
                dp[i - 1][j - 1] + 1
            } else {
                maxOf(dp[i - 1][j], dp[i][j - 1])
            }
        }
    }
    return dp[m][n]
}
```

Time O(m*n). LCS is a building block for many string DP problems. Git's diff algorithm is essentially LCS on lines.

#### How do you solve Unique Paths on a grid?

Count ways from top-left to bottom-right, moving only right or down. `dp[i][j] = dp[i-1][j] + dp[i][j-1]`.

```kotlin
fun uniquePaths(m: Int, n: Int): Int {
    val dp = IntArray(n) { 1 }
    for (i in 1 until m) {
        for (j in 1 until n) {
            dp[j] += dp[j - 1]
        }
    }
    return dp[n - 1]
}
```

#### How do you solve the Word Break problem?

`dp[i]` is true if `s[0..i-1]` can be segmented into dictionary words. For each position, check all previous positions.

```kotlin
fun wordBreak(s: String, wordDict: List<String>): Boolean {
    val words = wordDict.toHashSet()
    val dp = BooleanArray(s.length + 1)
    dp[0] = true
    for (i in 1..s.length) {
        for (j in 0 until i) {
            if (dp[j] && s.substring(j, i) in words) {
                dp[i] = true
                break
            }
        }
    }
    return dp[s.length]
}
```

#### How do you solve the Decode Ways problem?

Each position can be decoded as single digit (1-9) or two-digit (10-26). Handle '0' carefully — it can't be decoded alone.

```kotlin
fun numDecodings(s: String): Int {
    if (s[0] == '0') return 0
    var prev2 = 1
    var prev1 = 1
    for (i in 1 until s.length) {
        var current = 0
        if (s[i] != '0') current += prev1
        val twoDigit = s.substring(i - 1, i + 1).toInt()
        if (twoDigit in 10..26) current += prev2
        prev2 = prev1
        prev1 = current
    }
    return prev1
}
```

#### How do you solve the Minimum Path Sum problem?

Path from top-left to bottom-right with smallest sum. `dp[i][j] = grid[i][j] + min(dp[i-1][j], dp[i][j-1])`.

```kotlin
fun minPathSum(grid: Array<IntArray>): Int {
    val m = grid.size
    val n = grid[0].size
    val dp = IntArray(n)
    dp[0] = grid[0][0]
    for (j in 1 until n) dp[j] = dp[j - 1] + grid[0][j]
    for (i in 1 until m) {
        dp[0] += grid[i][0]
        for (j in 1 until n) {
            dp[j] = grid[i][j] + minOf(dp[j], dp[j - 1])
        }
    }
    return dp[n - 1]
}
```

#### How do you identify whether a problem is a DP problem?

Look for these signals:
- **"Count the number of ways"** — climbing stairs, unique paths, decode ways
- **"Find the minimum/maximum"** — coin change, edit distance, knapsack
- **"Can you reach / is it possible"** — word break, jump game
- **Overlapping subproblems** — recursion tree shows repeated calls

Start with brute-force recursion. If it has overlapping subproblems, add memoization. Then convert to tabulation for space optimization.

#### How do you convert recursive to bottom-up DP?

Identify the states (parameters that change). Create a DP array matching those dimensions. Set base cases. Fill in order where every dependency is already computed — usually smallest to largest.

#### How do you optimize 2D DP space?

If each cell only depends on current and previous row, use two 1D arrays or a single array updated in the right order. Drops O(m*n) to O(n). The tradeoff: you lose the ability to trace back the solution.

### Common Follow-ups

- How do you reconstruct the actual subsequence in LCS?
- Can you solve Coin Change to also return which coins were used?
- How do you modify House Robber for circular houses (House Robber II)?
- Can you solve LIS in O(n log n)?
- How do you extend Word Break to return all segmentations (Word Break II)?
- What is the relationship between LCS and edit distance?
- How does unbounded knapsack differ from 0/1 knapsack in code?
- What is the difference between top-down and bottom-up in terms of which subproblems get computed?
