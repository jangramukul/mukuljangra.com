---
title: "Dynamic Programming — Advanced Patterns"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 10
sequence: 59
description: "Advanced DP problems show up in harder FAANG rounds and distinguish strong candidates."
---

## Dynamic Programming — Advanced Patterns

Advanced DP problems show up in harder FAANG rounds and distinguish strong candidates. These patterns — state machines, interval DP, bitmask DP, and DP on strings — build on the fundamentals but require more careful state design.

### Core Questions

#### Q1: What is state machine DP?

State machine DP models problems where you transition between a fixed number of states. Each state tracks a different condition, and transitions follow specific rules. The classic example is the stock trading problem — at each day, you're either holding a stock or not. You define a DP value for each state at each step and compute transitions.

#### Q2: How do you solve Best Time to Buy and Sell Stock with at most one transaction?

Track the minimum price seen so far and the maximum profit. At each day, update the minimum price, then check if selling today gives a better profit than what you've seen.

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

Time: O(n), Space: O(1). This isn't really DP — it's a greedy one-pass. But it sets up the state machine thinking for harder variants.

#### Q3: How do you solve Best Time to Buy and Sell Stock with unlimited transactions?

Use two states — `hold` (holding a stock) and `cash` (not holding). At each day, `cash = max(cash, hold + price)` (sell) and `hold = max(hold, cash - price)` (buy). You can buy and sell on the same day because you update cash first.

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

Time: O(n), Space: O(1). The state machine has two states with transitions: cash can become hold (buy), hold can become cash (sell), or either can stay the same (do nothing).

#### Q4: How do you solve Best Time to Buy and Sell Stock with cooldown?

Add a third state — `cooldown`. After selling, you must wait one day before buying again. The transitions are: `cash = max(cash, cooldown)`, `hold = max(hold, cash - price)`, `cooldown = hold + price`. Cooldown captures the profit from selling yesterday.

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

Time: O(n), Space: O(1). The key is saving `prevCash` before updating it, so `hold` uses the cash value from before this day's transition.

#### Q5: How do you solve Best Time to Buy and Sell Stock with at most k transactions?

Use a 2D state — `dp[t][0]` (not holding after at most t transactions) and `dp[t][1]` (holding after at most t transactions). For each day, update all k transaction levels.

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

Time: O(n*k), Space: O(k). When k >= n/2, you can do unlimited transactions and fall back to the simpler O(n) solution.

#### Q6: What is interval DP?

Interval DP solves problems defined on contiguous ranges. The state is usually `dp[i][j]` representing the optimal answer for the subarray from index i to j. You try every possible split point k between i and j, combining the results of `dp[i][k]` and `dp[k+1][j]`. You fill the table by increasing interval length — smallest intervals first.

#### Q7: How do you solve Matrix Chain Multiplication?

Find the minimum number of scalar multiplications to multiply a chain of matrices. The order of multiplication matters because matrix multiplication is associative but not commutative in cost. For each interval `[i, j]`, try splitting at every k and take the minimum.

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

Time: O(n^3), Space: O(n^2). The `dims` array has n+1 elements where matrix i has dimensions `dims[i] x dims[i+1]`.

### Deep Dive Questions

#### Q8: How do you solve Burst Balloons?

You have n balloons with numbers on them. Bursting balloon i gives you `nums[i-1] * nums[i] * nums[i+1]` coins. Find the order of bursting that maximizes coins. The trick is to think in reverse — instead of which balloon to burst first, think about which balloon to burst last in each interval.

`dp[i][j]` is the maximum coins from bursting all balloons between i and j (exclusive). For each k in (i, j), if k is the last balloon burst in this range, the coins are `nums[i] * nums[k] * nums[j] + dp[i][k] + dp[k][j]`.

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

Time: O(n^3), Space: O(n^2). Adding 1s at both ends handles boundary cases. Thinking about the last balloon burst in a range is the core insight — it makes the left and right subproblems independent.

#### Q9: What is bitmask DP and when do you use it?

Bitmask DP uses a bitmask integer to represent which elements from a set have been used or visited. Each bit position corresponds to an element — 1 means included, 0 means not. It's used when you need to track subsets and the total number of elements is small (typically n <= 20, since 2^20 is about 1 million states).

Common applications include the Traveling Salesman Problem, assigning tasks to workers, and partition problems where you need to try all subsets.

#### Q10: How would you solve the Traveling Salesman Problem with bitmask DP?

Visit all n cities exactly once and return to the start with minimum cost. `dp[mask][i]` is the minimum cost to reach city i having visited the cities in the bitmask. Start with `dp[1][0] = 0` (at city 0, only city 0 visited). For each state, try extending to an unvisited city.

```kotlin
fun tsp(dist: Array<IntArray>): Int {
    val n = dist.size
    val full = (1 shl n) - 1
    val dp = Array(1 shl n) { IntArray(n) { Int.MAX_VALUE } }
    dp[1][0] = 0
    for (mask in 1..full) {
        for (u in 0 until n) {
            if (dp[mask][u] == Int.MAX_VALUE) continue
            if (mask and (1 shl u) == 0) continue
            for (v in 0 until n) {
                if (mask and (1 shl v) != 0) continue
                val next = mask or (1 shl v)
                dp[next][v] = minOf(dp[next][v], dp[mask][u] + dist[u][v])
            }
        }
    }
    return (0 until n).minOf { dp[full][it] + dist[it][0] }
}
```

Time: O(2^n * n^2), Space: O(2^n * n). This is exponential, but it's much better than the brute-force O(n!) permutation approach. Practical for n up to about 20.

#### Q11: What is tree DP?

Tree DP applies dynamic programming on tree structures. You root the tree and compute DP values bottom-up from leaves to root. Each node's value depends on its children's values. Common problems include maximum independent set on a tree, tree diameter, and tree coloring.

The general pattern is a post-order DFS — process children first, then compute the current node's DP value from its children's results.

#### Q12: How do you solve Palindrome Partitioning II (minimum cuts)?

Find the minimum cuts to partition a string into palindromic substrings. First, precompute a 2D boolean array `isPalin[i][j]` for whether substring i..j is a palindrome. Then use 1D DP — `dp[i]` is the minimum cuts for the first i characters. For each position i, check all j < i where `s[j..i-1]` is a palindrome and take `min(dp[j] + 1)`.

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

Time: O(n^2), Space: O(n^2). The palindrome precomputation itself is O(n^2). `dp[0] = -1` so that when the entire prefix is a palindrome, the result is 0 cuts.

#### Q13: How do you solve Regular Expression Matching?

Match a string against a pattern with '.' (any single character) and '*' (zero or more of the preceding element). `dp[i][j]` is true if the first i characters of the string match the first j characters of the pattern. The '*' case is the tricky part — it can match zero occurrences (`dp[i][j-2]`) or one more occurrence if the current characters match.

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
                    dp[i][j] = dp[i][j - 2] // zero occurrences
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

Time: O(m*n), Space: O(m*n). The `dp[i-1][j]` transition for '*' is what allows matching one or more characters — it says "match this character and stay on the same pattern position to potentially match more."

#### Q14: How do you solve Interleaving String?

Given strings s1, s2, and s3, determine if s3 is formed by interleaving s1 and s2 while maintaining their relative order. `dp[i][j]` is true if the first i characters of s1 and the first j characters of s2 can form the first i+j characters of s3.

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

Time: O(m*n), Space: O(n). The check is straightforward — each character of s3 must come from either s1 or s2, and we track which combination of positions is reachable.

#### Q15: What is digit DP?

Digit DP counts numbers in a range [0, N] that satisfy some property, processing one digit at a time. The state typically includes the current digit position, a `tight` flag (whether we're still bounded by N's digits), and problem-specific state like digit sum or whether a certain digit has appeared.

It's used for problems like "count numbers from 1 to N with digit sum equal to k" or "count numbers without consecutive repeated digits." The idea is to iterate over possible digits at each position, respecting the upper bound when tight is true.

#### Q16: How do you approach DP on strings?

Most string DP problems use a 2D table where `dp[i][j]` compares positions in two strings (LCS, edit distance, interleaving), or `dp[i][j]` represents a substring from i to j in one string (palindrome partitioning, longest palindromic subsequence). The recurrence usually checks whether characters at the current positions match and branches accordingly.

The pattern for two-string problems is almost always the same structure — iterate over lengths of both strings, check character equality, and combine subproblem solutions. Once you see this pattern, many problems become variations of the same template.

#### Q17: How do you solve Longest Palindromic Subsequence?

This is LCS applied to a string and its reverse. `dp[i][j]` is the longest palindromic subsequence in `s[i..j]`. If `s[i] == s[j]`, extend from the inner substring: `dp[i][j] = dp[i+1][j-1] + 2`. Otherwise, take the max of skipping either end: `max(dp[i+1][j], dp[i][j-1])`.

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

Time: O(n^2), Space: O(n^2). You could also solve this by reversing the string and finding LCS, but the interval DP approach is more direct and doesn't require the extra string.

### Common Follow-ups

- How do you handle the stock problem with a transaction fee added to each sell?
- Can you solve Burst Balloons with memoization instead of tabulation?
- What's the maximum n for which bitmask DP is practical, and why?
- How do you reconstruct the actual palindrome partitioning, not just the minimum cuts?
- What's the difference between Wildcard Matching and Regular Expression Matching in terms of DP transitions?
- How do you extend tree DP to handle rerooting — computing the answer for every node as root efficiently?
- Can you solve Longest Palindromic Subsequence in O(n) space?
- How do you determine the loop iteration order (forward vs reverse, by length vs by index) for a given DP problem?
