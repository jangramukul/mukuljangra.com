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

Tries, Segment Trees, and Fenwick Trees — these are the data structures that don't show up every interview, but when they do, they separate the candidates who really know their stuff. Tries dominate string-heavy problems like autocomplete, spell check, and word search. Segment Trees and Fenwick Trees own the range query world. You either know them or you're stuck at the whiteboard wishing you did.

#### What is a Trie and why use it over a HashMap for prefix-based lookups?

Think of a Trie like a phone book organized by letters. Each node is a single character, and walking from the root down a path spells out a prefix. Every node can have up to 26 children (one per letter) and a flag that says "hey, a complete word ends here."

Here's the thing — a HashMap can tell you if "apple" exists in O(1), sure. But what if you need all words starting with "app"? You'd have to scan every single key. A Trie just walks to the "app" node and grabs everything below it in O(p + k) where p is the prefix length and k is the number of matches.

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

Almost identical to search, with one key difference — you don't check `isEnd`. If you can walk through every character of the prefix without hitting a null, the prefix exists. That's it.

```kotlin
fun startsWith(prefix: String): Boolean {
    var node = root
    for (ch in prefix) {
        node = node.children[ch - 'a'] ?: return false
    }
    return true
}
```

> **🧠 Think about it:** If `search("apple")` returns true, will `startsWith("app")` always return true too? What about the other way around?

#### How do you solve Word Search II (finding multiple words in a grid)?

This one's a classic. Build a Trie from the word list, then DFS from every cell in the grid. The Trie acts like a GPS — as you explore neighbors, you follow the Trie path. If the current character matches a child node, keep going. Hit an `isEnd` node? You found a word.

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

The Trie prunes branches early — if no word starts with "xz", you bail immediately instead of exploring further. That's what makes the practical runtime way better than brute force.

#### How would you implement autocomplete using a Trie?

Walk to the prefix node, then DFS from there collecting every complete word below it. It's like navigating to a folder and listing all files inside — you find the right directory first, then explore everything underneath.

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

Walk to the end and flip `isEnd` to false. But wait — you're not done. If that node has no children, it's just dead weight. Remove it and backtrack upward, cleaning up any parent nodes that are now empty and aren't word endings themselves.

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

Replace the fixed 26-element array with a `HashMap<Char, TrieNode>` per node. This drops space from O(26 * N) to O(total characters stored) — you only allocate what you actually use. The tradeoff is slightly slower lookups since hash map access isn't as fast as array indexing. Another approach is a compressed Trie (radix tree) where chains of single-child nodes collapse into one node storing a whole substring.

> **🧠 Think about it:** If your Trie stores URLs instead of English words, why would a fixed 26-element array be a terrible idea?

#### What is a Segment Tree and what problem does it solve?

A Segment Tree is built for one thing — answering range queries fast. Need the sum of elements from index 3 to 7? Min value between index 0 and 100? A Segment Tree does it in O(log n) with O(log n) point updates. Each leaf holds an array element, and each internal node stores the aggregate (sum, min, max) of its children's range.

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

A Fenwick Tree (also called a Binary Indexed Tree) is the lightweight cousin of a Segment Tree. It gives you prefix sum queries and point updates in O(log n) with just a flat array of size n+1. Way simpler to implement, way less memory. Plot twist — it only works for operations that have an inverse, like addition (you can subtract to undo). For min/max queries where there's no inverse, you still need a Segment Tree.

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

An N-ary tree is just a tree where each node can have any number of children — not limited to left and right. Traversal logic stays the same — BFS with a queue, DFS with recursion — but instead of checking `node.left` and `node.right`, you iterate over a list of children.

#### What is lazy propagation in a Segment Tree?

Here's the problem — standard Segment Trees handle single-element updates in O(log n). But what if you need to update an entire range? Without lazy propagation, that's O(n log n). With it, you store a pending update at the segment node and only push it down to children when you actually need to query them. It's like writing "add 5 to everything" on a sticky note instead of updating every element individually. Keeps both range updates and queries at O(log n).

> **🧠 Think about it:** Why can't you just apply the update immediately to all affected leaf nodes? What makes the lazy approach faster?

#### How would you count the number of distinct words in a Trie?

Two ways. You can DFS through the entire Trie and count every node where `isEnd` is true. Or the smarter approach — maintain a running counter that increments on insert only when `isEnd` flips from false to true. That way you always know the count without traversing anything.

### Common Follow-ups

- How would you implement a Trie that supports wildcard search (`.` matches any character)?
- What is the time complexity of finding the longest common prefix using a Trie?
- How do you handle case-insensitive search in a Trie?
- What are the differences between a Segment Tree and a Sparse Table?
- How would you modify a Fenwick Tree to support range updates?
- How do you serialize and deserialize an N-ary tree?
- What is a persistent Segment Tree and when would you use it?
