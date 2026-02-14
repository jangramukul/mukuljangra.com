---
title: "Tries & Advanced Trees"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 5
sequence: 45
description: "Tries show up in string-heavy problems like autocomplete, spell check, and word search."
---

## Tries & Advanced Trees

Tries show up in string-heavy problems like autocomplete, spell check, and word search. Segment trees and Fenwick trees appear in range query problems. These aren't as common as arrays or graphs, but when they come up, you either know them or you don't.

#### What is a Trie and why use it over a HashMap for prefix-based lookups?

A Trie (prefix tree) is a tree where each node represents a character, and paths from root to nodes form prefixes. Each node has up to 26 children and a flag marking word endings.

A HashMap can check if a word exists in O(1), but finding all words with a given prefix requires scanning every key. A Trie finds all words starting with a prefix in O(p + k) where p is the prefix length and k is the number of matching results.

#### How do you implement insert and search in a Trie?

Walk through each character. Create child nodes as needed. Mark the end of words. Search follows the same path and returns false if any child is missing.

```kotlin
class TrieNode {
    val children = arrayOfNulls<TrieNode>(26)
    var isEnd = false
}

class Trie {
    private val root = TrieNode()

    fun insert(word: String) {
        var node = root
        for (ch in word) {
            val idx = ch - 'a'
            if (node.children[idx] == null) node.children[idx] = TrieNode()
            node = node.children[idx]!!
        }
        node.isEnd = true
    }

    fun search(word: String): Boolean {
        var node = root
        for (ch in word) {
            node = node.children[ch - 'a'] ?: return false
        }
        return node.isEnd
    }
}
```

Time O(m) for both insert and search where m is the word length.

#### How does startsWith differ from search in a Trie?

`startsWith` checks if any word begins with the given prefix. It's identical to search but you don't check `isEnd` — just reaching the end of the prefix without hitting null is enough.

```kotlin
fun startsWith(prefix: String): Boolean {
    var node = root
    for (ch in prefix) {
        node = node.children[ch - 'a'] ?: return false
    }
    return true
}
```

#### How do you solve Word Search II (finding multiple words in a grid)?

Build a Trie from the word list, then DFS from every cell. Follow the Trie as you explore — if the current character matches a child, continue. When you hit an `isEnd` node, you found a word.

```kotlin
fun findWords(board: Array<CharArray>, words: List<String>): List<String> {
    val trie = Trie()
    words.forEach { trie.insert(it) }
    val result = mutableSetOf<String>()
    val rows = board.size
    val cols = board[0].size

    fun dfs(r: Int, c: Int, node: TrieNode, path: StringBuilder) {
        if (r !in 0 until rows || c !in 0 until cols) return
        val ch = board[r][c]
        if (ch == '#') return
        val child = node.children[ch - 'a'] ?: return
        path.append(ch)
        if (child.isEnd) result.add(path.toString())
        board[r][c] = '#'
        for ((dr, dc) in listOf(0 to 1, 0 to -1, 1 to 0, -1 to 0)) {
            dfs(r + dr, c + dc, child, path)
        }
        board[r][c] = ch
        path.deleteCharAt(path.length - 1)
    }

    for (r in 0 until rows) for (c in 0 until cols) {
        dfs(r, c, root, StringBuilder())
    }
    return result.toList()
}
```

The Trie prunes branches early, making the practical runtime much better than brute force.

#### How would you implement autocomplete using a Trie?

Walk to the prefix node, then DFS from there collecting all words.

```kotlin
fun autocomplete(prefix: String): List<String> {
    var node = root
    for (ch in prefix) {
        node = node.children[ch - 'a'] ?: return emptyList()
    }
    val results = mutableListOf<String>()
    dfs(node, StringBuilder(prefix), results)
    return results
}

private fun dfs(node: TrieNode, path: StringBuilder, results: MutableList<String>) {
    if (node.isEnd) results.add(path.toString())
    for (i in 0 until 26) {
        val child = node.children[i] ?: continue
        path.append('a' + i)
        dfs(child, path, results)
        path.deleteCharAt(path.length - 1)
    }
}
```

#### How do you delete a word from a Trie?

Walk to the end and unmark `isEnd`. If the node has no children, remove it and backtrack upward removing empty parents.

```kotlin
fun delete(word: String): Boolean {
    return deleteHelper(root, word, 0)
}

private fun deleteHelper(node: TrieNode, word: String, depth: Int): Boolean {
    if (depth == word.length) {
        if (!node.isEnd) return false
        node.isEnd = false
        return node.children.all { it == null }
    }
    val idx = word[depth] - 'a'
    val child = node.children[idx] ?: return false
    val shouldDeleteChild = deleteHelper(child, word, depth + 1)
    if (shouldDeleteChild) {
        node.children[idx] = null
        return !node.isEnd && node.children.all { it == null }
    }
    return false
}
```

#### What is the space optimization for Tries when the alphabet is large?

Replace the fixed array with a `HashMap<Char, TrieNode>` per node. Reduces space from O(26 * N) to O(total characters stored) at the cost of slightly slower lookups. Another option is a compressed Trie (radix tree) where chains of single-child nodes merge into one node storing a substring.

#### What is a Segment Tree and what problem does it solve?

A Segment Tree answers range queries (sum, min, max) in O(log n) and supports point updates in O(log n). Each leaf stores an array element, each internal node stores the aggregate of its children's range.

#### How do you implement a Segment Tree for range sum queries?

```kotlin
class SegmentTree(private val data: IntArray) {
    private val n = data.size
    private val tree = IntArray(4 * n)

    init { build(1, 0, n - 1) }

    private fun build(node: Int, start: Int, end: Int) {
        if (start == end) { tree[node] = data[start]; return }
        val mid = (start + end) / 2
        build(2 * node, start, mid)
        build(2 * node + 1, mid + 1, end)
        tree[node] = tree[2 * node] + tree[2 * node + 1]
    }

    fun query(node: Int, start: Int, end: Int, l: Int, r: Int): Int {
        if (r < start || end < l) return 0
        if (l <= start && end <= r) return tree[node]
        val mid = (start + end) / 2
        return query(2 * node, start, mid, l, r) +
               query(2 * node + 1, mid + 1, end, l, r)
    }

    fun update(node: Int, start: Int, end: Int, idx: Int, value: Int) {
        if (start == end) { tree[node] = value; return }
        val mid = (start + end) / 2
        if (idx <= mid) update(2 * node, start, mid, idx, value)
        else update(2 * node + 1, mid + 1, end, idx, value)
        tree[node] = tree[2 * node] + tree[2 * node + 1]
    }
}
```

O(n) build, O(log n) query and update.

#### What is a Fenwick Tree and how does it compare to a Segment Tree?

A Fenwick Tree (BIT) supports prefix sum queries and point updates in O(log n) with only a flat array of size n+1. Simpler to implement and uses less memory than a Segment Tree, but only works for operations with an inverse (like addition). Segment Trees handle min/max queries too.

```kotlin
class FenwickTree(private val n: Int) {
    private val tree = IntArray(n + 1)

    fun update(i: Int, delta: Int) {
        var idx = i + 1
        while (idx <= n) {
            tree[idx] += delta
            idx += idx and (-idx)
        }
    }

    fun prefixSum(i: Int): Int {
        var idx = i + 1
        var sum = 0
        while (idx > 0) {
            sum += tree[idx]
            idx -= idx and (-idx)
        }
        return sum
    }

    fun rangeSum(l: Int, r: Int): Int {
        return prefixSum(r) - if (l > 0) prefixSum(l - 1) else 0
    }
}
```

#### What is an N-ary tree and how does traversal differ?

An N-ary tree allows any number of children per node. Traversal logic is the same — BFS uses a queue, DFS uses recursion — but you iterate over a list of children instead of left/right.

#### What is lazy propagation in a Segment Tree?

Standard Segment Trees handle point updates in O(log n). For range updates, lazy propagation defers updates — store a pending value at the segment node and push it down only when needed. Keeps both range updates and queries at O(log n).

#### How would you count the number of distinct words in a Trie?

DFS through the entire Trie counting nodes where `isEnd` is true. Or maintain a counter that increments on insert when `isEnd` goes from false to true.

### Common Follow-ups

- How would you implement a Trie that supports wildcard search (`.` matches any character)?
- What is the time complexity of finding the longest common prefix using a Trie?
- How do you handle case-insensitive search in a Trie?
- What are the differences between a Segment Tree and a Sparse Table?
- How would you modify a Fenwick Tree to support range updates?
- How do you serialize and deserialize an N-ary tree?
- What is a persistent Segment Tree and when would you use it?
