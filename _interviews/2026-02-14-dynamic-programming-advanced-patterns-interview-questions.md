---
title: "Dynamic Programming — Advanced Patterns"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 10
sequence: 50
description: "Advanced DP problems show up in harder FAANG rounds and distinguish strong candidates."
---

## Dynamic Programming — Advanced Patterns

Advanced DP problems show up in harder FAANG rounds and distinguish strong candidates. These patterns — state machines, interval DP, bitmask DP, and DP on strings — build on the fundamentals but require more careful state design.

#### How do you solve Best Time to Buy and Sell Stock (one transaction)?

Track the minimum price seen so far and the maximum profit.

```kotlin
fun maxProfit(prices: IntArray): Int {
    var minPrice = Int.MAX_VALUE
    var maxProfit = 0
    for (price in prices) {
        minPrice = minOf(minPrice, price)
        maxProfit = maxOf(maxProfit, price - minPrice)
    }
    return maxProfit
}
```

Time O(n), space O(1).

#### How do you solve Buy and Sell Stock with unlimited transactions?

Two states — `hold` and `cash`. At each day, decide to sell or buy.

```kotlin
fun maxProfit(prices: IntArray): Int {
    var cash = 0
    var hold = Int.MIN_VALUE
    for (price in prices) {
        cash = maxOf(cash, hold + price)
        hold = maxOf(hold, cash - price)
    }
    return cash
}
```

#### What is state machine DP?

State machine DP models problems where you transition between a fixed number of states. Each state tracks a different condition, and transitions follow rules. Classic example: stock trading — at each day you're either holding or not holding.

#### How do you solve Buy and Sell Stock with cooldown?

Add a third state — `cooldown`. After selling, wait one day before buying again.

```kotlin
fun maxProfit(prices: IntArray): Int {
    var cash = 0
    var hold = Int.MIN_VALUE
    var cooldown = 0
    for (price in prices) {
        val prevCash = cash
        cash = maxOf(cash, cooldown)
        cooldown = hold + price
        hold = maxOf(hold, prevCash - price)
    }
    return maxOf(cash, cooldown)
}
```

#### How do you solve Buy and Sell Stock with at most k transactions?

2D state — `buy[t]` (holding after at most t transactions) and `sell[t]` (not holding).

```kotlin
fun maxProfit(k: Int, prices: IntArray): Int {
    if (prices.isEmpty()) return 0
    val buy = IntArray(k + 1) { Int.MIN_VALUE }
    val sell = IntArray(k + 1) { 0 }
    for (price in prices) {
        for (t in 1..k) {
            buy[t] = maxOf(buy[t], sell[t - 1] - price)
            sell[t] = maxOf(sell[t], buy[t] + price)
        }
    }
    return sell[k]
}
```

Time O(n*k), space O(k). When k >= n/2, fall back to unlimited transactions.

#### How do you solve the Longest Palindromic Subsequence?

`dp[i][j]` is the longest palindromic subsequence in `s[i..j]`. If `s[i] == s[j]`, extend: `dp[i][j] = dp[i+1][j-1] + 2`. Otherwise, take max of skipping either end.

```kotlin
fun longestPalinSubseq(s: String): Int {
    val n = s.length
    val dp = Array(n) { IntArray(n) }
    for (i in 0 until n) dp[i][i] = 1
    for (len in 2..n) {
        for (i in 0..n - len) {
            val j = i + len - 1
            dp[i][j] = if (s[i] == s[j]) {
                dp[i + 1][j - 1] + 2
            } else {
                maxOf(dp[i + 1][j], dp[i][j - 1])
            }
        }
    }
    return dp[0][n - 1]
}
```

Time O(n^2), space O(n^2).

#### What is interval DP?

Interval DP solves problems defined on contiguous ranges. State is usually `dp[i][j]` for the subarray from i to j. Try every split point k, combining `dp[i][k]` and `dp[k+1][j]`. Fill by increasing interval length.

#### How do you solve Burst Balloons?

Think in reverse — which balloon to burst last in each interval. If k is the last balloon burst in range (i, j), coins are `nums[i] * nums[k] * nums[j] + dp[i][k] + dp[k][j]`.

```kotlin
fun maxCoins(nums: IntArray): Int {
    val balloons = intArrayOf(1) + nums + intArrayOf(1)
    val n = balloons.size
    val dp = Array(n) { IntArray(n) }
    for (len in 2 until n) {
        for (i in 0 until n - len) {
            val j = i + len
            for (k in i + 1 until j) {
                dp[i][j] = maxOf(dp[i][j],
                    dp[i][k] + dp[k][j] +
                    balloons[i] * balloons[k] * balloons[j])
            }
        }
    }
    return dp[0][n - 1]
}
```

Time O(n^3), space O(n^2).

#### What is bitmask DP and when do you use it?

Bitmask DP uses an integer where each bit represents whether an element is included. Used when tracking subsets and n is small (typically n <= 20). Common applications: traveling salesman, task assignment, partition problems.

#### How do you solve Regular Expression Matching?

Match string against pattern with '.' (any char) and '*' (zero or more of preceding). The '*' case: match zero occurrences (`dp[i][j-2]`) or one more if current characters match.

```kotlin
fun isMatch(s: String, p: String): Boolean {
    val m = s.length
    val n = p.length
    val dp = Array(m + 1) { BooleanArray(n + 1) }
    dp[0][0] = true
    for (j in 2..n) {
        if (p[j - 1] == '*') dp[0][j] = dp[0][j - 2]
    }
    for (i in 1..m) {
        for (j in 1..n) {
            when {
                p[j - 1] == '.' || p[j - 1] == s[i - 1] ->
                    dp[i][j] = dp[i - 1][j - 1]
                p[j - 1] == '*' -> {
                    dp[i][j] = dp[i][j - 2]
                    if (p[j - 2] == '.' || p[j - 2] == s[i - 1]) {
                        dp[i][j] = dp[i][j] || dp[i - 1][j]
                    }
                }
            }
        }
    }
    return dp[m][n]
}
```

Time O(m*n), space O(m*n).

#### How do you solve Matrix Chain Multiplication?

Find minimum scalar multiplications for a chain of matrices. For each interval, try splitting at every k.

```kotlin
fun matrixChainOrder(dims: IntArray): Int {
    val n = dims.size - 1
    val dp = Array(n) { IntArray(n) }
    for (len in 2..n) {
        for (i in 0..n - len) {
            val j = i + len - 1
            dp[i][j] = Int.MAX_VALUE
            for (k in i until j) {
                val cost = dp[i][k] + dp[k + 1][j] +
                    dims[i] * dims[k + 1] * dims[j + 1]
                dp[i][j] = minOf(dp[i][j], cost)
            }
        }
    }
    return dp[0][n - 1]
}
```

Time O(n^3), space O(n^2).

#### How do you solve Palindrome Partitioning II (minimum cuts)?

Precompute which substrings are palindromes. Then `dp[i]` is the minimum cuts for first i characters.

```kotlin
fun minCut(s: String): Int {
    val n = s.length
    val isPalin = Array(n) { BooleanArray(n) }
    for (end in 0 until n) {
        for (start in 0..end) {
            if (s[start] == s[end] &&
                (end - start <= 2 || isPalin[start + 1][end - 1])) {
                isPalin[start][end] = true
            }
        }
    }
    val dp = IntArray(n + 1) { it - 1 }
    for (i in 1..n) {
        for (j in 0 until i) {
            if (isPalin[j][i - 1]) {
                dp[i] = minOf(dp[i], dp[j] + 1)
            }
        }
    }
    return dp[n]
}
```

#### What is tree DP?

Tree DP applies DP on tree structures. Root the tree and compute values bottom-up from leaves. Common problems: maximum independent set, tree diameter, tree coloring. General pattern is post-order DFS.

#### How do you solve Interleaving String?

`dp[i][j]` is true if first i chars of s1 and first j chars of s2 can form first i+j chars of s3.

```kotlin
fun isInterleave(s1: String, s2: String, s3: String): Boolean {
    if (s1.length + s2.length != s3.length) return false
    val m = s1.length
    val n = s2.length
    val dp = BooleanArray(n + 1)
    for (j in 0..n) {
        dp[j] = if (j == 0) true
                else dp[j - 1] && s2[j - 1] == s3[j - 1]
    }
    for (i in 1..m) {
        dp[0] = dp[0] && s1[i - 1] == s3[i - 1]
        for (j in 1..n) {
            dp[j] = (dp[j] && s1[i - 1] == s3[i + j - 1]) ||
                    (dp[j - 1] && s2[j - 1] == s3[i + j - 1])
        }
    }
    return dp[n]
}
```

#### How do you approach DP on strings?

Most use a 2D table comparing positions in two strings (LCS, edit distance) or representing a substring range (palindrome partitioning). The recurrence checks character equality and branches accordingly. Once you see this pattern, many problems become template variations.

### Common Follow-ups

- How do you handle stock trading with a transaction fee?
- Can you solve Burst Balloons with memoization?
- What's the maximum n for bitmask DP, and why?
- How do you reconstruct the actual palindrome partitioning?
- What's the difference between Wildcard Matching and Regex Matching?
- How do you extend tree DP to handle rerooting?
- Can you solve Longest Palindromic Subsequence in O(n) space?
- How do you determine loop iteration order for a given DP problem?
