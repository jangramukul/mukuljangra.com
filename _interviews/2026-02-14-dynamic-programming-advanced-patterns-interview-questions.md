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

If you've got the basics of DP down, this is where things get really fun. These patterns -- state machines, interval DP, bitmask DP, and DP on strings -- come up in harder FAANG rounds. They're the kind of problems that separate "I know DP" from "I actually know DP." The core idea is the same as always -- break a problem into overlapping subproblems -- but the state design gets more creative.

#### How do you solve Best Time to Buy and Sell Stock (one transaction)?

Here's the thing -- you don't need DP for this one. Just walk through prices left to right, keeping track of the cheapest price you've seen so far. At each step, check if selling at today's price gives you a better profit. It's like shopping for a deal -- you remember the lowest price and keep checking if now is a good time to sell.

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

Now we enter state machine territory. At any point, you're in one of two states: holding a stock (`hold`) or sitting on cash (`cash`). Each day you pick the better option -- sell what you're holding, or buy with your cash. Think of it like a toggle switch you can flip every day.

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

State machine DP is when your problem naturally has a small number of "modes" you can be in, and you transition between them following specific rules. Think of a traffic light -- it can only be red, yellow, or green, and there's a fixed set of transitions. Stock trading is the classic example: each day you're either holding or not holding, and your options depend on which state you're in.

> **🧠 Think about it:** In the unlimited transactions problem above, why does updating `cash` before `hold` still give the correct answer? Wouldn't that let you buy and sell on the same day?

#### How do you solve Buy and Sell Stock with cooldown?

Same state machine idea, but now there's a twist -- after selling, you have to wait one day before buying again. So we add a third state: `cooldown`. It's like a store that makes you wait 24 hours after a return before you can buy again. You track all three states and update them each day.

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

This one bumps the state up to 2D. For each transaction count t, you track the best `buy[t]` (holding after at most t buys) and `sell[t]` (not holding). It's like having k coupons -- each transaction uses one, so you need to be strategic about when to use them.

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

Time O(n*k), space O(k). When k >= n/2, the transaction limit doesn't matter anymore, so fall back to the unlimited version.

#### How do you solve the Longest Palindromic Subsequence?

`dp[i][j]` stores the longest palindromic subsequence in `s[i..j]`. If the characters at both ends match, great -- extend by 2. If they don't, try dropping either end and take the better result. It's like peeling an onion from both sides -- matching layers extend your palindrome, mismatches mean you skip one side.

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

Interval DP is for problems where you're working on contiguous ranges and need to try every possible way to split them. Your state is `dp[i][j]` for the subarray from i to j, and you try every split point k in between, combining `dp[i][k]` and `dp[k+1][j]`. It's like figuring out the best way to cut a log into pieces -- you try every possible cut and pick the cheapest. You fill the table by increasing interval length so smaller ranges are ready when bigger ones need them.

> **🧠 Think about it:** Why does interval DP always iterate by increasing length? What would go wrong if you iterated left-to-right instead?

#### How do you solve Burst Balloons?

But wait -- this one has a trick. If you think about which balloon to burst first, the problem gets messy because bursting one changes the neighbors of everything else. So think in reverse: which balloon do you burst last in each interval? If k is the last balloon burst in range (i, j), the coins are `nums[i] * nums[k] * nums[j]` because i and j are still there as boundaries. It's like demolishing buildings on a street -- if you pick which one goes last, you know exactly what's standing next to it.

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

Bitmask DP uses an integer where each bit represents whether an element is included in the current subset. It's like a row of light switches -- each one is on or off, and the combination tells you exactly which elements you've picked. You use it when you need to track subsets and n is small (typically n <= 20, because 2^20 is already about a million states). Classic applications: traveling salesman, task assignment, partition problems.

#### How do you solve Regular Expression Matching?

Here's the thing about regex matching -- the `.` is easy (matches any character), but `*` makes it interesting. The `*` means "zero or more of the preceding character," so you have two choices: match zero occurrences (skip the pattern pair, check `dp[i][j-2]`) or match one more if the current characters are compatible. It's like a wildcard in a card game that can count as nothing or keep matching.

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

You have a chain of matrices to multiply, and the order of multiplication changes the total cost dramatically. For each interval of matrices, try splitting at every k -- multiply the left chunk, multiply the right chunk, then multiply the two results together. Pick the split that gives the minimum cost. It's like parenthesizing a math expression -- where you put the parentheses changes how much work you do, even though the final answer is the same.

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

Two-phase approach. First, precompute which substrings are palindromes -- you need this lookup to be fast. Then, `dp[i]` is the minimum number of cuts to partition the first i characters into palindromes. For each position, check every earlier position -- if the substring between them is a palindrome, you might have found a cheaper partition. It's like slicing a loaf of bread where each slice must be a palindrome -- you try every knife position and pick the one that gives the fewest cuts.

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

> **🧠 Think about it:** Why does the palindrome precomputation iterate with `end` as the outer loop instead of `start`? What dependency does that satisfy?

#### What is tree DP?

Tree DP is DP on tree structures -- you root the tree and compute values bottom-up from the leaves. It's like collecting votes in a company org chart: each leaf reports to their manager, managers aggregate and pass results up, and the CEO at the root gets the final answer. The general pattern is post-order DFS. Common problems include maximum independent set, tree diameter, and tree coloring.

#### How do you solve Interleaving String?

`dp[i][j]` tells you whether the first i characters of s1 and the first j characters of s2 can weave together to form the first i+j characters of s3. At each step, the next character in s3 must come from either s1 or s2 -- like shuffling two decks of cards where each deck's internal order stays the same. You check both options and take either if it works.

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

Most string DP problems follow one of two shapes. Either you're comparing two strings with a 2D table (like LCS or edit distance, where `dp[i][j]` compares positions in each string), or you're looking at a substring range within one string (like palindrome problems, where `dp[i][j]` represents the range from i to j). The recurrence almost always checks if the current characters match and branches from there. Once you recognize which shape you're dealing with, a lot of these problems feel like template variations with different recurrence rules.

### Common Follow-ups

- How do you handle stock trading with a transaction fee?
- Can you solve Burst Balloons with memoization?
- What's the maximum n for bitmask DP, and why?
- How do you reconstruct the actual palindrome partitioning?
- What's the difference between Wildcard Matching and Regex Matching?
- How do you extend tree DP to handle rerooting?
- Can you solve Longest Palindromic Subsequence in O(n) space?
- How do you determine loop iteration order for a given DP problem?
