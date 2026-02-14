---
title: "Tries & Advanced Trees"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 5
sequence: 42
---

## Tries & Advanced Trees — What Interviewers Really Ask

Tries show up in string-heavy problems like autocomplete, spell check, and word search. Segment trees and Fenwick trees appear in range query problems. These aren't as common as arrays or graphs, but when they come up, you either know them or you don't.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a Trie and why use it over a HashMap for prefix-based lookups?

A Trie (prefix tree) is a tree where each node represents a character, and paths from root to nodes form prefixes of stored words. Each node has up to 26 children (for lowercase English) and a flag marking whether it's the end of a word.

A HashMap can check if a word exists in O(1), but finding all words with a given prefix requires scanning every key. A Trie finds all words starting with a prefix in O(p + k) where p is the prefix length and k is the number of matching results — because you just walk down to the prefix node and collect everything below it.

#### Q2: How do you implement insert and search in a Trie?

Walk through each character of the word. If the child node for that character doesn't exist, create it. At the end of the word, mark the node as a word endpoint. Search works the same way — walk character by character, and return false if any child is missing.

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

Time: O(m) for both insert and search where m is the word length. Space: O(n * m) where n is the number of words.

#### Q3: How does startsWith differ from search in a Trie?

`startsWith` checks whether any word in the Trie begins with the given prefix. It's almost identical to `search`, but you don't check `isEnd` — if you reach the end of the prefix without hitting a null child, the prefix exists.

```kotlin
fun startsWith(prefix: String): Boolean {
    var node = root
    for (ch in prefix) {
        node = node.children[ch - 'a'] ?: return false
    }
    return true
}
```

Time: O(p) where p is the prefix length.

#### Q4: How would you implement autocomplete using a Trie?

Walk to the node representing the prefix, then do a DFS from that node to collect all words. Each path from the prefix node to an `isEnd` node is a valid suggestion.

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

Time: O(p + k) where p is the prefix length and k is the total characters in all matching words.

#### Q5: How do you solve the Word Search II problem (finding multiple words in a grid)?

Build a Trie from the list of words, then run DFS from every cell in the grid. At each cell, follow the Trie — if the current character matches a Trie child, move to that child and explore adjacent cells. When you hit an `isEnd` node, you've found a word.

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

Time: O(m * n * 4^L) where m*n is the grid size and L is the max word length. The Trie prunes branches early, which makes the practical runtime much better than brute-force.

#### Q6: How do you delete a word from a Trie?

Walk to the end of the word and unmark `isEnd`. If the node has no children, remove it and backtrack upward, removing any parent nodes that also have no other children and aren't end-of-word markers themselves.

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

Time: O(m) where m is the word length.

#### Q7: What is the space optimization for Tries when the alphabet is large?

The array-based Trie allocates 26 slots per node even if most are null. For large alphabets (Unicode), this wastes a lot of memory. You can replace the fixed array with a HashMap per node — `HashMap<Char, TrieNode>`. This reduces space from O(26 * N) to O(total characters stored) at the cost of slightly slower lookups due to hashing.

Another option is a compressed Trie (radix tree), where chains of single-child nodes are merged into one node storing a substring instead of a single character. This reduces node count significantly for datasets with long common prefixes.

### Deep Dive Questions (Advanced → Expert)

#### Q8: What is a Segment Tree and what problem does it solve?

A Segment Tree is a binary tree built over an array that answers range queries (sum, min, max) in O(log n) and supports point updates in O(log n). A naive approach needs O(n) for range queries or O(n) for updates — you can optimize one but not both without a specialized structure.

The tree has 2n-1 nodes. Each leaf stores an array element, and each internal node stores the aggregate (sum, min, etc.) of its children's range. Querying a range [l, r] decomposes it into O(log n) precomputed segments.

#### Q9: How do you implement a Segment Tree for range sum queries?

Store the tree in a flat array of size 4n. Build recursively by splitting ranges in half. Query and update both follow the same recursive pattern — go left, go right, or both depending on overlap with the target range.

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

Time: O(n) to build, O(log n) for query and update. Space: O(n).

#### Q10: What is a Fenwick Tree (Binary Indexed Tree) and how does it compare to a Segment Tree?

A Fenwick Tree (BIT) supports prefix sum queries and point updates both in O(log n), using only a flat array of size n+1. It's simpler to implement and uses less memory than a Segment Tree, but it only works for operations that have an inverse — like addition (subtract to get a range from prefix sums). Segment Trees are more general and handle min/max queries where Fenwick Trees can't.

The key trick is using the lowest set bit of the index to determine the range each position covers. `i & (-i)` gives you the lowest set bit.

#### Q11: How do you implement a Fenwick Tree for prefix sums?

```kotlin
class FenwickTree(private val n: Int) {
    private val tree = IntArray(n + 1)

    fun update(i: Int, delta: Int) {
        var idx = i + 1 // 1-indexed
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

Time: O(log n) for both update and query. Space: O(n). Fenwick Trees use roughly half the memory of a Segment Tree and have smaller constant factors, making them the preferred choice when prefix sums are sufficient.

#### Q12: What is an N-ary tree and how does traversal differ from a binary tree?

An N-ary tree is a tree where each node can have any number of children instead of just two. Traversal logic is the same conceptually — BFS uses a queue, DFS uses recursion or a stack — but instead of checking left and right children, you iterate over a list of children.

```kotlin
class NaryNode(val value: Int, val children: List<NaryNode> = emptyList())

fun levelOrder(root: NaryNode?): List<List<Int>> {
    if (root == null) return emptyList()
    val result = mutableListOf<List<Int>>()
    val queue: Queue<NaryNode> = LinkedList()
    queue.add(root)
    while (queue.isNotEmpty()) {
        val level = mutableListOf<Int>()
        repeat(queue.size) {
            val node = queue.poll()
            level.add(node.value)
            queue.addAll(node.children)
        }
        result.add(level)
    }
    return result
}
```

Time: O(n) for traversal. The serialization of N-ary trees is trickier — you need a way to indicate "end of children" for each node, unlike binary trees where null markers work cleanly.

#### Q13: How do you flatten a binary tree to a doubly linked list (in-order)?

Do an in-order traversal and rewire pointers as you go. Use a variable to track the previously visited node. For each node, set `prev.right = current` and `current.left = prev`.

```kotlin
class TreeNode(var value: Int) {
    var left: TreeNode? = null
    var right: TreeNode? = null
}

fun treeToDoublyList(root: TreeNode?): TreeNode? {
    if (root == null) return null
    var first: TreeNode? = null
    var prev: TreeNode? = null

    fun inorder(node: TreeNode?) {
        if (node == null) return
        inorder(node.left)
        if (prev == null) first = node
        else { prev!!.right = node; node.left = prev }
        prev = node
        inorder(node.right)
    }

    inorder(root)
    // Make it circular
    first!!.left = prev
    prev!!.right = first
    return first
}
```

Time: O(n). Space: O(h) for the recursion stack where h is the tree height. The circular variant connects the last node back to the first — interviewers often ask for this specifically.

#### Q14: What is lazy propagation in a Segment Tree and when do you need it?

Standard Segment Trees handle point updates in O(log n). But if you need to update an entire range (add 5 to all elements from index 2 to 7), a point-by-point approach becomes O(n log n). Lazy propagation defers updates — instead of updating every leaf immediately, you store a pending update at the segment node and push it down only when a query or update touches that segment.

Each node gets a `lazy` value. During a range update, if a node's range is fully inside the target range, you update the node's value and store the pending delta in `lazy`. When you later query or update that node's children, you push the lazy value down first.

Time: O(log n) for both range updates and queries. The tradeoff is more complex code — you need to handle the push-down in both query and update functions.

#### Q15: How would you count the number of distinct words stored in a Trie?

Walk the entire Trie with DFS and count every node where `isEnd` is true. Alternatively, maintain a count variable that increments on insert (when `isEnd` goes from false to true) and decrements on delete. The traversal approach is O(total nodes), while the counter approach gives O(1) lookup.

For counting words with a specific prefix, walk to the prefix node and then count all `isEnd` nodes in the subtree below it.

### Common Follow-ups

- How would you implement a Trie that supports wildcard search (`.` matches any character)?
- What is the time complexity of finding the longest common prefix of all words using a Trie?
- How do you handle case-insensitive search in a Trie?
- Can you implement a Segment Tree with lazy propagation for range max queries?
- What are the differences between a Segment Tree and a Sparse Table? When would you prefer one over the other?
- How would you modify a Fenwick Tree to support range updates (not just point updates)?
- How do you serialize and deserialize an N-ary tree?
- What is a persistent Segment Tree and when would you use it?
