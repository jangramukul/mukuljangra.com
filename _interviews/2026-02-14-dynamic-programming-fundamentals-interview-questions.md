---
title: "Dynamic Programming — Fundamentals"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 9
sequence: 43
description: "DP is one of the most tested topics in FAANG interviews. If a problem has overlapping subproblems and optimal substructure, it's likely a DP problem."
---

## Dynamic Programming — Fundamentals

DP is one of the most tested topics in FAANG interviews. If a problem has overlapping subproblems and optimal substructure, it's likely a DP problem. Most candidates struggle here, so being comfortable with the core patterns gives you a strong edge.

### Core Questions

#### Q1: What is dynamic programming and when do you use it?

Dynamic programming is an optimization technique where you break a problem into smaller subproblems, solve each one once, and store the results to avoid redundant computation. You use it when a problem has two properties — overlapping subproblems (the same subproblem is solved multiple times) and optimal substructure (the optimal solution to the problem can be built from optimal solutions to its subproblems).

#### Q2: What is the difference between memoization and tabulation?

Memoization is top-down — you write a recursive solution and cache results as you go. Tabulation is bottom-up — you fill a table iteratively starting from the smallest subproblems. Memoization is easier to write because it follows the natural recursive thinking, but it has recursion overhead and can hit stack limits on deep inputs. Tabulation avoids recursion entirely and is usually more space-efficient because you can often optimize to only keep the previous row or state.

#### Q3: How do you solve the Climbing Stairs problem?

To reach step n, you either came from step n-1 or step n-2. So `dp[n] = dp[n-1] + dp[n-2]`. Base cases are `dp[1] = 1` and `dp[2] = 2`. This is essentially the Fibonacci sequence. Since each state only depends on the previous two, you can optimize space to O(1).

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

Time: O(n), Space: O(1).

#### Q4: How do you solve the House Robber problem?

You can't rob two adjacent houses. At each house, you decide — rob this house plus the best from two houses back, or skip this house and take the best from one house back. The recurrence is `dp[i] = max(dp[i-1], dp[i-2] + nums[i])`. Since you only look back two steps, you can use two variables instead of an array.

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

Time: O(n), Space: O(1).

#### Q5: How do you solve the Coin Change problem?

Find the minimum number of coins to make a given amount. For each amount from 1 to target, try every coin denomination and take the minimum. `dp[amount] = min(dp[amount], dp[amount - coin] + 1)` for each coin. Initialize `dp[0] = 0` and everything else to a large value.

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

Time: O(amount * coins), Space: O(amount). This is an unbounded knapsack variant because you can use each coin unlimited times.

#### Q6: How do you find the Longest Increasing Subsequence (LIS)?

The classic DP approach: for each element, look at all previous elements. If a previous element is smaller, you can extend its subsequence. `dp[i]` stores the length of the longest increasing subsequence ending at index i. For each i, `dp[i] = max(dp[j] + 1)` for all j < i where `nums[j] < nums[i]`.

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

Time: O(n^2), Space: O(n). There's an O(n log n) approach using binary search with a patience sorting technique — maintain a list of the smallest tail elements for subsequences of each length and use binary search to place each new element.

#### Q7: How do you solve Unique Paths on a grid?

Count the number of ways to go from top-left to bottom-right, moving only right or down. Each cell can be reached from the cell above or the cell to the left, so `dp[i][j] = dp[i-1][j] + dp[i][j-1]`. First row and first column are all 1s because there's only one way to reach them.

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

Time: O(m*n), Space: O(n). The space optimization works because each row only depends on the current and previous row. By updating left to right, `dp[j]` holds the value from the row above (not yet updated), and `dp[j-1]` holds the current row's value (just updated).

### Deep Dive Questions

#### Q8: How do you solve the Minimum Path Sum problem?

Find the path from top-left to bottom-right with the smallest sum. At each cell, you can only move right or down. The recurrence is `dp[i][j] = grid[i][j] + min(dp[i-1][j], dp[i][j-1])`. Handle the first row and column separately since they only have one direction to come from.

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

Time: O(m*n), Space: O(n).

#### Q9: How do you solve the Edit Distance (Levenshtein Distance) problem?

Find the minimum number of operations (insert, delete, replace) to convert one string into another. Build a 2D table where `dp[i][j]` is the edit distance between the first i characters of word1 and the first j characters of word2. If characters match, `dp[i][j] = dp[i-1][j-1]`. Otherwise, take the minimum of insert (`dp[i][j-1]`), delete (`dp[i-1][j]`), and replace (`dp[i-1][j-1]`), plus 1.

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

Time: O(m*n), Space: O(m*n). Can be optimized to O(n) space since each row only depends on the previous row. Edit distance is used in spell checkers, DNA sequence alignment, and diff tools.

#### Q10: How do you find the Longest Common Subsequence (LCS)?

Compare two strings character by character. If characters match, extend the LCS by 1 from the diagonal. If they don't, take the max of skipping one character from either string. `dp[i][j]` represents the LCS length for the first i characters of text1 and first j characters of text2.

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

Time: O(m*n), Space: O(m*n). LCS is a building block for many string DP problems. The diff algorithm used by git is essentially LCS on lines of code.

#### Q11: How do you solve the 0/1 Knapsack problem?

You have items with weights and values, and a knapsack with a weight capacity. Each item can be included at most once. For each item, decide whether to include it or skip it. `dp[i][w] = max(dp[i-1][w], dp[i-1][w - weight[i]] + value[i])` if `weight[i] <= w`.

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

Time: O(n * capacity), Space: O(capacity). The key to the 1D optimization is iterating capacity in reverse — if you go forward, you might use the same item twice. That's the difference between 0/1 and unbounded knapsack.

#### Q12: How does unbounded knapsack differ from 0/1 knapsack?

In unbounded knapsack, you can use each item unlimited times. The only code change is iterating the capacity forward instead of backward. When you go forward, `dp[w - weight[i]]` might already include item i, which is exactly what you want for unlimited use.

```kotlin
fun unboundedKnapsack(weights: IntArray, values: IntArray, capacity: Int): Int {
    val dp = IntArray(capacity + 1)
    for (i in weights.indices) {
        for (w in weights[i]..capacity) {
            dp[w] = maxOf(dp[w], dp[w - weights[i]] + values[i])
        }
    }
    return dp[capacity]
}
```

Time: O(n * capacity), Space: O(capacity). Coin Change is an unbounded knapsack problem where all coins have "value" 1 and you minimize instead of maximize.

#### Q13: How do you solve the Word Break problem?

Given a string and a dictionary, determine if the string can be segmented into dictionary words. `dp[i]` is true if the substring `s[0..i-1]` can be broken into valid words. For each position i, check all positions j before it — if `dp[j]` is true and `s[j..i-1]` is in the dictionary, then `dp[i]` is true.

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

Time: O(n^2 * k) where k is the substring comparison cost, Space: O(n). An optimization is to only check substrings whose length matches a word in the dictionary, or limit j to `i - maxWordLength`.

#### Q14: How do you solve the Decode Ways problem?

A message encoded with 'A' = 1, 'B' = 2, ..., 'Z' = 26. Count how many ways you can decode a digit string. Each position can be decoded as a single digit (1-9) or as part of a two-digit number (10-26). `dp[i] = dp[i-1]` (if single digit is valid) + `dp[i-2]` (if two-digit number is valid).

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

Time: O(n), Space: O(1). The tricky part is handling '0' — it can't be decoded alone, so it must be part of 10 or 20. If a '0' can't pair with the previous digit, there's no valid decoding.

#### Q15: How do you identify whether a problem is a DP problem?

Look for these signals:

- **"Count the number of ways"** — almost always DP (climbing stairs, unique paths, decode ways)
- **"Find the minimum/maximum"** — often DP if brute force would try all combinations (coin change, edit distance, knapsack)
- **"Can you reach / is it possible"** — might be DP with boolean states (word break, jump game)
- **Overlapping subproblems** — if you draw the recursion tree and see the same call repeated, DP will help
- **Optimal substructure** — the best solution to the whole problem uses best solutions to subproblems

The first step is always to write the brute-force recursive solution. If it has overlapping subproblems, add memoization. Then convert to tabulation if you want to optimize space.

#### Q16: How do you convert a recursive solution to a bottom-up DP solution?

Start with the recursive solution and identify the states (function parameters that change). Create a DP array with dimensions matching those states. Determine the base cases (what the recursion returns without further calls). Fill the table in an order where every subproblem you depend on is already computed — this usually means smallest to largest.

For example, the recursive Fibonacci `fib(n) = fib(n-1) + fib(n-2)` has one state (n), base cases `fib(0) = 0, fib(1) = 1`, and fills from left to right. A 2D problem like edit distance has two states (i, j), base cases along the first row and column, and fills row by row.

#### Q17: How do you optimize the space complexity of a 2D DP solution?

If each cell only depends on the current row and the previous row, you can use two 1D arrays and alternate between them. If each cell only depends on the current row (left neighbor and the value directly above), you can use a single 1D array updated in the right order.

For problems like LCS or edit distance, the full 2D table is O(m*n) space. With the rolling array technique, it drops to O(min(m,n)). The trade-off is that you lose the ability to trace back the actual solution — you only get the optimal value. If you need to reconstruct the solution, you need the full table or a separate backtracking approach.

### Common Follow-ups

- How do you reconstruct the actual subsequence in LCS, not just its length?
- Can you solve Coin Change to also return which coins were used?
- What is the difference between the top-down and bottom-up approach in terms of which subproblems get computed?
- How do you handle negative numbers in the knapsack problem?
- How would you modify House Robber for a circular arrangement of houses (House Robber II)?
- Can you solve LIS in O(n log n) and explain why binary search works there?
- How do you extend Word Break to return all possible segmentations (Word Break II)?
- What is the relationship between LCS and edit distance?
