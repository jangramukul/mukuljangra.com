---
title: "Recursion, Backtracking & Greedy"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 11
sequence: 44
---

## Recursion, Backtracking & Greedy

Recursion is the foundation for trees, graphs, and DP. Backtracking extends recursion to explore all possibilities and prune invalid paths. Greedy is the opposite philosophy — make the locally optimal choice at each step. Knowing when each approach works is what interviewers test.

### Core Questions

#### Q1: What is recursion and what are its two essential parts?

Recursion is when a function calls itself to solve smaller instances of the same problem. Every recursive function needs two things — a base case that stops the recursion, and a recursive case that breaks the problem into a smaller version. Without a base case, you get infinite recursion and a stack overflow.

#### Q2: How does the call stack work during recursion?

Each recursive call creates a new stack frame with its own local variables and parameters. These frames stack up until a base case is reached, then unwind as each call returns its result to the caller. If you recurse too deeply (typically 10,000+ levels), you hit a StackOverflowError. The space complexity of recursion is O(depth) because of these stacked frames.

#### Q3: How do you generate all subsets of an array?

At each element, you have two choices — include it or skip it. Recurse with both options and collect results when you've processed all elements.

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

Time: O(2^n * n) — 2^n subsets, each takes O(n) to copy. Space: O(n) for the recursion depth. This is the simplest backtracking pattern — binary choice at each step.

#### Q4: What is backtracking and how does it differ from brute force?

Backtracking is a refined brute force that builds solutions incrementally and abandons a path as soon as it violates constraints. The key difference is pruning — you don't explore paths that can't possibly lead to a valid solution. The template is: make a choice, recurse, undo the choice (backtrack). It's systematic exploration with early termination.

#### Q5: How do you generate all permutations of an array?

For each position, try every unused element. Track which elements are used with a boolean array or by swapping. When the permutation is complete (length equals input size), add it to the result.

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

Time: O(n! * n), Space: O(n). There are n! permutations and copying each takes O(n). The swap-based approach avoids the `used` array by swapping elements into position and recursing on the remaining portion.

#### Q6: How do you generate all combinations of k elements from n?

Similar to subsets but with a size constraint. Only recurse forward (start from the current index + 1) to avoid duplicates. When the combination reaches size k, add it to results.

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

Time: O(C(n,k) * k), Space: O(k). You can prune further — if the remaining elements aren't enough to fill the combination, stop early with `i <= n - (k - current.size) + 1`.

#### Q7: What is the general backtracking template?

Most backtracking problems follow this structure: define a recursive function that takes the current state, check if the state is a complete solution (base case), iterate over possible choices at the current step, for each valid choice — make it, recurse, undo it. The "undo" step is what makes it backtracking.

The three variables in every backtracking problem are: what are the choices at each step, what constraints determine if a choice is valid, and what defines a complete solution.

#### Q8: What is a greedy algorithm?

A greedy algorithm makes the locally optimal choice at each step, hoping to reach a globally optimal solution. It never reconsiders past choices. Greedy works when the problem has the greedy-choice property — a locally optimal choice leads to a globally optimal solution — and optimal substructure.

#### Q9: How do you solve the Jump Game problem (can you reach the last index)?

Track the farthest index you can reach. Iterate through the array — at each position, update the farthest reachable index. If you ever land on a position beyond the farthest reach, you're stuck.

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

Time: O(n), Space: O(1). This is greedy because at each step you greedily extend your reach as far as possible. You never need to reconsider — if a position is reachable and extends the frontier, it's always worth considering.

### Deep Dive Questions

#### Q10: How do you solve the N-Queens problem?

Place n queens on an n x n board so no two queens attack each other. Place queens row by row. For each row, try every column. Check if the column and both diagonals are free. Use sets to track occupied columns and diagonals.

```kotlin
fun solveNQueens(n: Int): List<List<String>> {
    val result = mutableListOf<List<String>>()
    val cols = HashSet<Int>()
    val diag1 = HashSet<Int>() // row - col
    val diag2 = HashSet<Int>() // row + col
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

Time: O(n!), Space: O(n^2). The diagonal trick is that all cells on the same diagonal share the same `row - col` value (for `\` diagonals) or `row + col` value (for `/` diagonals).

#### Q11: How do you solve the Sudoku Solver?

Fill empty cells one by one. For each empty cell, try digits 1-9. Check if the digit is valid in the current row, column, and 3x3 box. If valid, place it and recurse. If recursion fails, backtrack and try the next digit.

```kotlin
fun solveSudoku(board: Array<CharArray>) {
    fun isValid(row: Int, col: Int, c: Char): Boolean {
        for (i in 0 until 9) {
            if (board[row][i] == c) return false
            if (board[i][col] == c) return false
            val r = 3 * (row / 3) + i / 3
            val cl = 3 * (col / 3) + i % 3
            if (board[r][cl] == c) return false
        }
        return true
    }
    fun solve(): Boolean {
        for (i in 0 until 9) {
            for (j in 0 until 9) {
                if (board[i][j] != '.') continue
                for (c in '1'..'9') {
                    if (!isValid(i, j, c)) continue
                    board[i][j] = c
                    if (solve()) return true
                    board[i][j] = '.'
                }
                return false
            }
        }
        return true
    }
    solve()
}
```

Time: O(9^(empty cells)) in the worst case, but pruning makes it much faster in practice. The `return false` after trying all digits for a cell is the key backtracking moment — it tells the caller that no digit works here, so a previous choice was wrong.

#### Q12: How do you solve Word Search on a board?

Search for a word in a 2D grid by moving to adjacent cells (up, down, left, right). Each cell can be used only once per path. Start DFS from every cell that matches the first character.

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

Time: O(m * n * 4^L) where L is the word length. Space: O(L) for recursion depth. Marking visited cells by temporarily changing the value avoids using a separate visited array.

#### Q13: How does the Activity Selection problem demonstrate greedy?

Given activities with start and end times, find the maximum number of non-overlapping activities. Sort by end time. Always pick the activity that finishes earliest and doesn't overlap with the last selected one. This greedy choice works because finishing early leaves the most room for future activities.

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

Time: O(n log n) for sorting, Space: O(n). This is provably optimal — you can show by exchange argument that swapping any activity for an earlier-finishing one never reduces the count.

#### Q14: How do you solve the Task Scheduler problem?

Given tasks with a cooldown period n between same tasks, find the minimum time to execute all tasks. The greedy approach focuses on the most frequent task. The minimum time is determined by either the total number of tasks or the idle slots forced by the most frequent task. Calculate the number of idle slots as `(maxFreq - 1) * n`, then fill them with other tasks.

```kotlin
fun leastInterval(tasks: CharArray, n: Int): Int {
    val freq = IntArray(26)
    for (task in tasks) freq[task - 'A']++
    val maxFreq = freq.max()
    val maxCount = freq.count { it == maxFreq }
    val minTime = (maxFreq - 1) * (n + 1) + maxCount
    return maxOf(minTime, tasks.size)
}
```

Time: O(t) where t is the number of tasks, Space: O(1). The formula `(maxFreq - 1) * (n + 1) + maxCount` creates blocks of size n+1 with the most frequent task anchoring each block. If tasks fill all idle slots, the answer is just the total task count.

#### Q15: How do you solve the Gas Station problem?

There are n gas stations in a circle. At each station you gain `gas[i]` fuel and use `cost[i]` to reach the next station. Find the starting station to complete the circuit, or return -1.

If the total gas is less than total cost, no solution exists. Otherwise, iterate and track the running surplus. Whenever it goes negative, the start can't be any station up to this point — reset the start to the next station.

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

Time: O(n), Space: O(1). The greedy insight is that if you can't reach station j from station i, you also can't reach j from any station between i and j — so you can safely skip them all.

#### Q16: How do you solve Partition Labels?

Given a string, partition it into as many parts as possible so that each letter appears in at most one part. First, record the last occurrence of each character. Then iterate through the string, expanding the current partition's end to include the farthest last occurrence of any character seen so far. When the current index reaches the partition's end, cut.

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

Time: O(n), Space: O(1). The greedy choice is to close the partition as early as possible. Expanding `end` to cover the last occurrence of each character guarantees no letter spans two partitions.

#### Q17: When does greedy work and when does it fail?

Greedy works when making the locally optimal choice at each step leads to the global optimum. Classic examples: activity selection (pick earliest finish), Huffman coding, fractional knapsack, minimum spanning tree (Prim's, Kruskal's).

Greedy fails when local choices don't lead to global optimums. The 0/1 knapsack is the classic example — picking the item with the best value-to-weight ratio doesn't guarantee the best total value. Coin change also fails with greedy for arbitrary denominations — with coins [1, 3, 4], greedy gives 4+1+1=3 coins for amount 6, but 3+3=2 coins is optimal.

If you suspect greedy works, try to prove it with an exchange argument — show that swapping any other choice for the greedy choice doesn't improve the result. If you can't prove it, use DP instead.

#### Q18: How do you handle duplicates in subsets and combinations?

Sort the input first. Then during backtracking, skip an element if it's the same as the previous one at the same recursion level. This prevents generating duplicate subsets or combinations.

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

Time: O(2^n * n), Space: O(n). The condition `i > start` is important — it allows the first occurrence of a duplicate to be used but skips subsequent occurrences at the same branching level.

### Common Follow-ups

- How do you convert a recursive solution to an iterative one using an explicit stack?
- What is the time complexity of generating all permutations of a string with duplicate characters?
- How do you solve N-Queens to just count solutions instead of returning all boards?
- Can Jump Game II (minimum jumps to reach the end) be solved greedily?
- How do you prove a greedy algorithm is correct using the exchange argument?
- What's the difference between backtracking and branch-and-bound?
- How do you solve Combination Sum where candidates can be reused?
- How would you optimize Word Search for searching multiple words on the same board (hint: Trie + backtracking)?
