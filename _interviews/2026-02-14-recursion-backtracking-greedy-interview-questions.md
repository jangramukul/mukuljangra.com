---
title: "Recursion, Backtracking & Greedy"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 11
sequence: 51
description: "Recursion is the foundation for trees, graphs, and DP. Backtracking extends recursion to explore all possibilities and prune invalid paths."
---

## Recursion, Backtracking & Greedy

Recursion is the foundation for trees, graphs, and DP. Backtracking extends recursion to explore all possibilities and prune invalid paths. Greedy is the opposite philosophy — make the locally optimal choice at each step. Knowing when each approach works is what interviewers test.

#### How do you generate all permutations of an array?

For each position, try every unused element. Track used elements with a boolean array. When the permutation is complete, add it to results.

```kotlin
fun permute(nums: IntArray): List<List<Int>> {
    val result = mutableListOf<List<Int>>()
    val used = BooleanArray(nums.size)
    fun backtrack(current: MutableList<Int>) {
        if (current.size == nums.size) {
            result.add(current.toList())
            return
        }
        for (i in nums.indices) {
            if (used[i]) continue
            used[i] = true
            current.add(nums[i])
            backtrack(current)
            current.removeAt(current.lastIndex)
            used[i] = false
        }
    }
    backtrack(mutableListOf())
    return result
}
```

Time O(n! * n), space O(n).

#### How do you generate all subsets of an array?

At each element, two choices — include it or skip it. Collect results when all elements are processed.

```kotlin
fun subsets(nums: IntArray): List<List<Int>> {
    val result = mutableListOf<List<Int>>()
    fun backtrack(index: Int, current: MutableList<Int>) {
        if (index == nums.size) {
            result.add(current.toList())
            return
        }
        current.add(nums[index])
        backtrack(index + 1, current)
        current.removeAt(current.lastIndex)
        backtrack(index + 1, current)
    }
    backtrack(0, mutableListOf())
    return result
}
```

Time O(2^n * n), space O(n).

#### What is backtracking and how does it differ from brute force?

Backtracking builds solutions incrementally and abandons a path as soon as it violates constraints. The key is pruning — don't explore paths that can't lead to valid solutions. Template: make a choice, recurse, undo the choice.

#### How do you solve the N-Queens problem?

Place queens row by row. For each row, try every column. Check if the column and both diagonals are free using sets.

```kotlin
fun solveNQueens(n: Int): List<List<String>> {
    val result = mutableListOf<List<String>>()
    val cols = HashSet<Int>()
    val diag1 = HashSet<Int>()
    val diag2 = HashSet<Int>()
    val board = Array(n) { CharArray(n) { '.' } }

    fun backtrack(row: Int) {
        if (row == n) {
            result.add(board.map { String(it) })
            return
        }
        for (col in 0 until n) {
            if (col in cols || row - col in diag1 ||
                row + col in diag2) continue
            board[row][col] = 'Q'
            cols.add(col); diag1.add(row - col); diag2.add(row + col)
            backtrack(row + 1)
            board[row][col] = '.'
            cols.remove(col); diag1.remove(row - col); diag2.remove(row + col)
        }
    }
    backtrack(0)
    return result
}
```

Time O(n!), space O(n^2). All cells on the same `\` diagonal share `row - col`, and `/` diagonal share `row + col`.

#### How do you solve the Jump Game problem?

Track the farthest index you can reach. If you land beyond the farthest reach, you're stuck.

```kotlin
fun canJump(nums: IntArray): Boolean {
    var farthest = 0
    for (i in nums.indices) {
        if (i > farthest) return false
        farthest = maxOf(farthest, i + nums[i])
    }
    return true
}
```

Time O(n), space O(1). Greedy — extend your reach as far as possible at each step.

#### What is a greedy algorithm?

A greedy algorithm makes the locally optimal choice at each step without reconsidering. It works when the problem has the greedy-choice property and optimal substructure. Classic examples: activity selection, Huffman coding, fractional knapsack.

#### What is recursion and what are its essential parts?

A function calling itself to solve smaller instances. Every recursive function needs a base case (stops recursion) and a recursive case (breaks into smaller version). Without a base case, you get stack overflow.

#### How does the call stack work during recursion?

Each recursive call creates a new stack frame with its own local variables. Frames stack up until a base case is reached, then unwind. Space complexity is O(depth). Too deep (10,000+ levels) causes StackOverflowError.

#### How do you solve Word Search on a board?

DFS from every cell matching the first character. At each cell, check adjacent cells. Mark visited by temporarily changing the value.

```kotlin
fun exist(board: Array<CharArray>, word: String): Boolean {
    val m = board.size
    val n = board[0].size
    fun dfs(i: Int, j: Int, k: Int): Boolean {
        if (k == word.length) return true
        if (i !in 0 until m || j !in 0 until n) return false
        if (board[i][j] != word[k]) return false
        val temp = board[i][j]
        board[i][j] = '#'
        val found = dfs(i + 1, j, k + 1) || dfs(i - 1, j, k + 1) ||
                    dfs(i, j + 1, k + 1) || dfs(i, j - 1, k + 1)
        board[i][j] = temp
        return found
    }
    for (i in 0 until m) {
        for (j in 0 until n) {
            if (dfs(i, j, 0)) return true
        }
    }
    return false
}
```

#### How do you solve the Gas Station problem?

If total gas < total cost, no solution. Otherwise, iterate and track running surplus. When it goes negative, reset start to the next station.

```kotlin
fun canCompleteCircuit(gas: IntArray, cost: IntArray): Int {
    var totalSurplus = 0
    var currentSurplus = 0
    var start = 0
    for (i in gas.indices) {
        val diff = gas[i] - cost[i]
        totalSurplus += diff
        currentSurplus += diff
        if (currentSurplus < 0) {
            start = i + 1
            currentSurplus = 0
        }
    }
    return if (totalSurplus >= 0) start else -1
}
```

#### How do you solve Partition Labels?

Record the last occurrence of each character. Iterate, expanding the partition's end to the farthest last occurrence. Cut when current index reaches the end.

```kotlin
fun partitionLabels(s: String): List<Int> {
    val lastIndex = IntArray(26)
    for (i in s.indices) lastIndex[s[i] - 'a'] = i
    val result = mutableListOf<Int>()
    var start = 0
    var end = 0
    for (i in s.indices) {
        end = maxOf(end, lastIndex[s[i] - 'a'])
        if (i == end) {
            result.add(end - start + 1)
            start = i + 1
        }
    }
    return result
}
```

#### How do you generate combinations of k elements from n?

Similar to subsets but with a size constraint. Only recurse forward to avoid duplicates.

```kotlin
fun combine(n: Int, k: Int): List<List<Int>> {
    val result = mutableListOf<List<Int>>()
    fun backtrack(start: Int, current: MutableList<Int>) {
        if (current.size == k) {
            result.add(current.toList())
            return
        }
        for (i in start..n) {
            current.add(i)
            backtrack(i + 1, current)
            current.removeAt(current.lastIndex)
        }
    }
    backtrack(1, mutableListOf())
    return result
}
```

#### How do you handle duplicates in subsets and combinations?

Sort input first. Skip an element if it's the same as the previous one at the same recursion level.

```kotlin
fun subsetsWithDup(nums: IntArray): List<List<Int>> {
    nums.sort()
    val result = mutableListOf<List<Int>>()
    fun backtrack(start: Int, current: MutableList<Int>) {
        result.add(current.toList())
        for (i in start until nums.size) {
            if (i > start && nums[i] == nums[i - 1]) continue
            current.add(nums[i])
            backtrack(i + 1, current)
            current.removeAt(current.lastIndex)
        }
    }
    backtrack(0, mutableListOf())
    return result
}
```

The condition `i > start` allows the first occurrence but skips duplicates at the same level.

#### When does greedy work and when does it fail?

Greedy works when local choices lead to global optimum: activity selection, MST, Huffman coding. It fails when they don't: 0/1 knapsack, coin change with arbitrary denominations (coins [1,3,4], amount 6 — greedy gives 3 coins, optimal is 2).

If you can't prove greedy with an exchange argument, use DP instead.

#### How does the Activity Selection problem demonstrate greedy?

Sort by end time. Always pick the activity that finishes earliest and doesn't overlap with the last selected one. Finishing early leaves the most room for future activities.

```kotlin
fun activitySelection(start: IntArray, end: IntArray): Int {
    val activities = start.zip(end).sortedBy { it.second }
    var count = 1
    var lastEnd = activities[0].second
    for (i in 1 until activities.size) {
        if (activities[i].first >= lastEnd) {
            count++
            lastEnd = activities[i].second
        }
    }
    return count
}
```

### Common Follow-ups

- How do you convert a recursive solution to iterative using an explicit stack?
- What is the time complexity of permutations with duplicate characters?
- Can Jump Game II (minimum jumps) be solved greedily?
- How do you prove greedy correctness using the exchange argument?
- What's the difference between backtracking and branch-and-bound?
- How do you solve Combination Sum where candidates can be reused?
- How would you optimize Word Search for multiple words (Trie + backtracking)?
- How do you solve the Sudoku Solver?
