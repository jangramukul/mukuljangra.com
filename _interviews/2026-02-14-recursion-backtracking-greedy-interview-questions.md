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

Think of it like arranging people in a line. For each position, you try every person who hasn't been placed yet. You track who's already in line with a boolean array, and once the line is full, you save that arrangement.

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

Time O(n! * n), space O(n). The `n!` is because there are that many permutations, and the extra `n` is for copying each one into the result.

#### How do you generate all subsets of an array?

At each element, you face a simple yes-or-no decision — include it or skip it. It's like standing at a buffet going down the line. For each dish, you either put it on your plate or you don't. Once you've passed every dish, whatever's on your plate is one subset.

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

Time O(2^n * n), space O(n). Two choices per element gives you 2^n subsets total.

#### What is backtracking and how does it differ from brute force?

Here's the thing — brute force tries every possible combination, even the ones that are obviously wrong halfway through. Backtracking is smarter. It builds solutions one step at a time and the moment something violates a constraint, it backs up and tries a different path. It's like navigating a maze: if you hit a dead end, you don't start over from the entrance, you just go back to the last fork and try a different direction.

The template is always the same: make a choice, recurse, undo the choice.

#### How do you solve the N-Queens problem?

You place queens row by row. For each row, you try every column and check if it's safe — meaning no other queen shares the column or either diagonal. We use sets to track which columns and diagonals are already taken.

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

Time O(n!), space O(n^2). The clever bit is the diagonal tracking: all cells on the same `\` diagonal share the value `row - col`, and all cells on the same `/` diagonal share `row + col`. Once you see that, the constraint check becomes a simple set lookup.

> **🧠 Think about it:** If you removed the pruning (the `continue` check) and just placed queens everywhere, how many boards would you generate for n=8? Compare that to how many N-Queens actually explores.

#### How do you solve the Jump Game problem?

This one is pure greedy. You walk through the array and keep track of the farthest index you can reach. If you ever land on an index that's beyond your farthest reach, you're stuck — return false. It's like crossing a river on stepping stones: at each stone, you check how far you can jump from here, and you keep extending your maximum reach.

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

Time O(n), space O(1). No recursion, no DP table — just one pass.

#### What is a greedy algorithm?

A greedy algorithm makes the best-looking choice at each step and never looks back. It's like always taking the shortest line at the grocery store without considering that the other line might move faster overall. It works when the problem has the greedy-choice property (local optimal leads to global optimal) and optimal substructure. Classic examples: activity selection, Huffman coding, fractional knapsack.

#### What is recursion and what are its essential parts?

Recursion is a function calling itself to solve a smaller version of the same problem. Every recursive function needs exactly two things: a base case that stops the recursion, and a recursive case that breaks the problem into something smaller. Without a base case, you just keep calling yourself forever until you get a StackOverflowError.

#### How does the call stack work during recursion?

Each recursive call pushes a new stack frame with its own local variables — like stacking plates. Frames keep piling up until you hit a base case, then they unwind one by one as each call returns. Space complexity is O(depth) because of these stacked frames. Go too deep (10,000+ levels) and you'll blow the stack.

#### How do you solve Word Search on a board?

You start a DFS from every cell that matches the first character of the word. From there, you explore all four neighbors looking for the next character. The trick to avoid revisiting cells is to temporarily overwrite the current cell with a sentinel value like `'#'`, then restore it on the way back.

```kotlin
fun exist(board: Array<CharArray>, word: String): Boolean {
    val m = board.size
    val n = board[0].size
    fun dfs(i: Int, j: Int, k: Int): Boolean {
        if (k == word.length) return true
        if (i !in 0 until m || j !in 0 until n) return false
        if (board[i][j] != word[k]) return false
        val temp = board[i][j]
        board[i][j] = '#' // mark visited
        val found = dfs(i + 1, j, k + 1) || dfs(i - 1, j, k + 1) ||
                    dfs(i, j + 1, k + 1) || dfs(i, j - 1, k + 1)
        board[i][j] = temp // restore on backtrack
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

This is textbook backtracking — we modify state going forward and undo it coming back.

#### How do you solve the Gas Station problem?

Here's the key insight: if the total gas across all stations is less than the total cost, there's no solution, period. But if a solution exists, it's guaranteed to be unique. You iterate through the stations tracking a running surplus. The moment your surplus goes negative, you know you can't have started from any station you've already passed — so you reset your starting point to the next station.

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

> **🧠 Think about it:** Why does resetting `start` to `i + 1` work? Why can't any station between the old start and `i` be the answer either?

#### How do you solve Partition Labels?

First, record the last occurrence of every character in the string. Then iterate through: as you see each character, expand the current partition's end to that character's last occurrence. When your current index reaches the partition's end, you've found a complete partition — cut it. It's like reading a book and deciding chapter breaks: you can't end a chapter until every character introduced in it has had their last appearance.

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

It's similar to subsets, but with a size constraint — you stop adding once you've picked k elements. The other important thing is you only recurse forward (starting from the next number), which naturally avoids duplicates like picking [1,2] and [2,1] as separate combinations.

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

Sort the input first — that's the move that makes everything else work. Then at each recursion level, if the current element is the same as the previous one at that level, skip it. You're essentially saying "I already explored all subsets that include this value at this position, so I'm not doing it again."

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

The condition `i > start` is the subtle part — it allows the first occurrence at each level but skips duplicates. If `i == start`, we haven't used this value at this level yet, so it's fine. If `i > start` and it matches the previous element, we've already been down that road.

#### When does greedy work and when does it fail?

Greedy works when making the locally best choice at every step actually leads to the globally best answer. Activity selection, minimum spanning tree, Huffman coding — these all have that property.

Plot twist: it fails more often than you'd think. Take coin change with denominations [1, 3, 4] and amount 6. Greedy picks 4 + 1 + 1 = three coins, but the optimal answer is 3 + 3 = two coins. The greedy choice looked good locally but missed the global optimum.

If you can't prove your greedy approach works (typically with an exchange argument showing you can swap any non-greedy choice for a greedy one without losing optimality), use DP instead.

> **🧠 Think about it:** Why does greedy work for US coin denominations (1, 5, 10, 25) but not for arbitrary denominations? What's special about the US system?

#### How does the Activity Selection problem demonstrate greedy?

Sort activities by end time, then always pick the one that finishes earliest and doesn't overlap with your last selection. Why earliest end time? Because finishing early leaves the maximum room for future activities. It's the "don't be greedy with time" approach to being greedy.

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
