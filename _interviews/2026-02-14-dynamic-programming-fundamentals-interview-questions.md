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

Here's the thing about DP — it scares people, but it shouldn't. It's really just "don't solve the same problem twice." Think of it like a cook who preps all the ingredients before cooking instead of running to the store every time they need garlic. Once you see that pattern, DP clicks. And it comes up constantly in FAANG interviews, so getting comfortable with these core patterns gives you a serious edge.

#### How do you solve the Climbing Stairs problem?

To reach step n, you either came from step n-1 or n-2. So `dp[n] = dp[n-1] + dp[n-2]`. That's literally Fibonacci. It's like asking "how many ways can you walk up stairs taking 1 or 2 steps at a time?" Since each state only depends on the previous two, you can ditch the whole array and just keep two variables — O(1) space.

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

Imagine you're at a vending machine and you need to make exact change with the fewest coins possible. For each amount, you try every coin denomination and pick whichever gives you the minimum. `dp[amount] = min(dp[amount], dp[amount - coin] + 1)`.

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

Time O(amount * coins), space O(amount). This is an unbounded knapsack variant — you can reuse coins as many times as you want.

> **🧠 Think about it:** If you could only use each coin once, how would the iteration order change?

#### What is dynamic programming and when do you use it?

DP is really just smart recursion. You break a problem into smaller subproblems, solve each one once, and store the result so you never recompute it. Use it when you spot two things: overlapping subproblems (you keep solving the same thing over and over) and optimal substructure (the best answer to the big problem is built from best answers to smaller problems). It's like building with LEGO — the final structure is only as good as the individual pieces you snap together.

#### What is the difference between memoization and tabulation?

Memoization is top-down — you write recursion naturally and slap a cache on it. Tabulation is bottom-up — you fill a table iteratively starting from the smallest subproblems. Here's how I think about it: memoization is lazy (only computes what's needed), tabulation is eager (computes everything). Memoization is easier to write because it follows the recursive structure you already thought of. But tabulation avoids recursion overhead, won't blow your stack, and often lets you optimize space since you only need the previous row.

#### How do you solve the House Robber problem?

Picture this — you're a burglar on a street, but every house has an alarm that triggers if you rob two adjacent houses. At each house, you face a choice: rob this one plus whatever you got from two houses back, or skip it and keep what you had from one house back. `dp[i] = max(dp[i-1], dp[i-2] + nums[i])`. It's a classic "take or skip" pattern.

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

For each element, you look back at every previous element. If something earlier is smaller, you can extend its subsequence by one. `dp[i] = max(dp[j] + 1)` for all j < i where `nums[j] < nums[i]`. Think of it like building the tallest tower of blocks where each block must be bigger than the one below it — for each new block, you check all existing towers to see which one you can extend.

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

Time O(n^2). There's an O(n log n) approach using binary search with patience sorting — worth knowing for follow-ups.

> **🧠 Think about it:** Why does iterating the capacity in reverse matter for 0/1 Knapsack but not for Coin Change?

#### How do you solve the 0/1 Knapsack problem?

You've got items with weights and values, and a bag with limited capacity. Each item can only be used once. But wait — the sneaky part is the 1D optimization. You iterate capacity in reverse. Why? Because going forward would let you "pick up" the same item multiple times since `dp[w - weight]` would already be updated in the current round.

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

This one is like autocorrect figuring out how many key presses it takes to fix a typo. You have three operations — insert, delete, replace — and you want the minimum to transform one string into another. If the characters match, no operation needed: `dp[i][j] = dp[i-1][j-1]`. Otherwise, try all three operations and take the cheapest one plus 1.

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

Time O(m*n), space O(m*n). Can optimize to O(n) space since each row only depends on the current and previous row.

#### How do you find the Longest Common Subsequence (LCS)?

Compare two strings character by character. If they match, great — extend the subsequence from the diagonal (both strings contributed). If they don't match, take the better result from skipping a character in either string. It's like two friends comparing their Spotify playlists and finding the longest sequence of songs they both have in the same relative order.

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

Time O(m*n). LCS is a building block for many string DP problems. Fun fact — Git's diff algorithm is essentially LCS on lines.

#### How do you solve Unique Paths on a grid?

You're at the top-left of a grid and need to reach the bottom-right, moving only right or down. The number of ways to reach any cell is just the sum of ways to reach the cell above it and the cell to its left: `dp[i][j] = dp[i-1][j] + dp[i][j-1]`. Since you only ever look at the current and previous row, a single 1D array does the job.

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

Here's the idea: `dp[i]` is true if the substring `s[0..i-1]` can be split into valid dictionary words. For each position, look back at every earlier position — if that earlier spot was breakable and the substring between the two is a dictionary word, you're good. It's like checking if you can build a sentence entirely out of known words, one split at a time.

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

Each digit (1-9) maps to a letter, and two-digit combos (10-26) also map to letters. At each position, you can decode a single digit or a two-digit number. But here's the catch — '0' can't be decoded on its own, so you have to handle that carefully. This is another Fibonacci-shaped problem where each state depends on the previous two.

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

> **🧠 Think about it:** What happens to the decode count when you hit the string "30"? Why does that differ from "20"?

#### How do you solve the Minimum Path Sum problem?

Same grid setup as Unique Paths, but now each cell has a cost and you want the cheapest path from top-left to bottom-right. `dp[i][j] = grid[i][j] + min(dp[i-1][j], dp[i][j-1])`. You can only come from above or from the left, so you pick whichever neighbor was cheaper and add the current cell's cost.

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

Here's the thing — there are clear signals to watch for:
- **"Count the number of ways"** — climbing stairs, unique paths, decode ways
- **"Find the minimum/maximum"** — coin change, edit distance, knapsack
- **"Can you reach / is it possible"** — word break, jump game
- **Overlapping subproblems** — recursion tree shows repeated calls

The process is always the same: start with brute-force recursion. If you see overlapping subproblems in the recursion tree, add memoization. Then convert to tabulation if you want to optimize space.

#### How do you convert recursive to bottom-up DP?

First, identify the states — those are the parameters that change across recursive calls. Create a DP array with dimensions matching those states. Set your base cases (the leaves of your recursion tree). Then fill the table in an order where every dependency is already computed — usually smallest to largest. It's like building a house from the foundation up instead of from the roof down.

#### How do you optimize 2D DP space?

If each cell only depends on the current and previous row, you don't need the whole 2D grid. Use two 1D arrays (current row and previous row), or even a single array updated in the right direction. This drops space from O(m*n) to O(n). The tradeoff is real though — you lose the ability to trace back the actual solution, since you've thrown away the earlier rows.

### Common Follow-ups

- How do you reconstruct the actual subsequence in LCS?
- Can you solve Coin Change to also return which coins were used?
- How do you modify House Robber for circular houses (House Robber II)?
- Can you solve LIS in O(n log n)?
- How do you extend Word Break to return all segmentations (Word Break II)?
- What is the relationship between LCS and edit distance?
- How does unbounded knapsack differ from 0/1 knapsack in code?
- What is the difference between top-down and bottom-up in terms of which subproblems get computed?
