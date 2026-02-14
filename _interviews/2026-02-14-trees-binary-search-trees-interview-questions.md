---
title: "Trees & Binary Search Trees"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 4
sequence: 44
description: "Trees are one of the most asked topics in coding interviews."
---

## Trees & Binary Search Trees

Trees show up constantly in interviews. If you're prepping for any FAANG-level round, expect at least one tree problem — traversals, BST validation, LCA, you name it. The good news is that most tree problems boil down to recursion, and once you get comfortable with DFS and BFS on trees, the patterns start to repeat themselves.

#### What is the maximum depth of a binary tree and how do you find it?

Think of it like measuring the tallest branch of a real tree — you're counting nodes along the longest path from root to leaf. The recursive approach is beautifully simple: the depth of any node is 1 plus the max of its left and right subtree depths. A null node has depth 0, and that's your base case.

```kotlin
fun maxDepth(root: TreeNode?): Int {
    if (root == null) return 0
    return 1 + maxOf(maxDepth(root.left), maxDepth(root.right))
}
```

Time O(n), space O(h) where h is the height.

#### How do you invert a binary tree?

Here's the thing — this one is famously simple but trips people up because they overthink it. Just swap the left and right children of every node, recursively. That's it.

```kotlin
fun invertTree(root: TreeNode?): TreeNode? {
    if (root == null) return null
    val temp = root.left
    root.left = root.right
    root.right = temp
    invertTree(root.left)
    invertTree(root.right)
    return root
}
```

#### How do you validate whether a binary tree is a valid BST?

This is where people get caught. The naive approach — just check if each node is bigger than its left child and smaller than its right — is wrong. A node deep in the right subtree must still be greater than the root, not just its immediate parent. So you pass a valid range down recursively, narrowing it at each step.

```kotlin
fun isValidBST(root: TreeNode?): Boolean {
    return validate(root, Long.MIN_VALUE, Long.MAX_VALUE)
}

fun validate(node: TreeNode?, min: Long, max: Long): Boolean {
    if (node == null) return true
    if (node.value <= min || node.value >= max) return false
    return validate(node.left, min, node.value.toLong()) &&
           validate(node.right, node.value.toLong(), max)
}
```

Using `Long` avoids edge cases with `Int.MIN_VALUE` or `Int.MAX_VALUE` node values.

> **🧠 Think about it:** If you did an in-order traversal of a valid BST, what property would the output have? How could you use that for validation instead?

#### How do you find the lowest common ancestor (LCA) of two nodes in a binary tree?

Picture a family tree. The LCA of two people is the closest ancestor they both share. In code, if the current node matches either target, return it. Otherwise, recurse on both subtrees. If both sides return non-null, the current node is exactly where the two targets split — that's your LCA.

```kotlin
fun lowestCommonAncestor(
    root: TreeNode?, p: TreeNode, q: TreeNode
): TreeNode? {
    if (root == null || root == p || root == q) return root
    val left = lowestCommonAncestor(root.left, p, q)
    val right = lowestCommonAncestor(root.right, p, q)
    if (left != null && right != null) return root
    return left ?: right
}
```

Time O(n), space O(h). For a BST, you can do it in O(h) by comparing values.

#### How do you perform a level-order traversal (BFS) of a binary tree?

This is like reading a book — left to right, top to bottom, one level at a time. Use a queue. Process all nodes at the current level, then add their children for the next level.

```kotlin
fun levelOrder(root: TreeNode?): List<List<Int>> {
    if (root == null) return emptyList()
    val result = mutableListOf<List<Int>>()
    val queue = ArrayDeque<TreeNode>()
    queue.addLast(root)
    while (queue.isNotEmpty()) {
        val level = mutableListOf<Int>()
        repeat(queue.size) {
            val node = queue.removeFirst()
            level.add(node.value)
            node.left?.let { queue.addLast(it) }
            node.right?.let { queue.addLast(it) }
        }
        result.add(level)
    }
    return result
}
```

#### Explain the four standard tree traversals.

- **In-order (Left, Root, Right)** — Visits nodes in ascending order for a BST
- **Pre-order (Root, Left, Right)** — Root first. Used for serialization and copying
- **Post-order (Left, Right, Root)** — Children before root. Used for deletion and subtree calculations
- **Level-order (BFS)** — Level by level using a queue

All are O(n) time. DFS traversals use O(h) space for the call stack.

#### How do you find the diameter of a binary tree?

The diameter is the longest path between any two nodes — and here's the key insight — that path doesn't have to go through the root. At each node, the longest path through it is left height + right height. You compute heights recursively and track the maximum diameter as a side effect.

```kotlin
fun diameterOfBinaryTree(root: TreeNode?): Int {
    var diameter = 0
    fun height(node: TreeNode?): Int {
        if (node == null) return 0
        val left = height(node.left)
        val right = height(node.right)
        diameter = maxOf(diameter, left + right)
        return 1 + maxOf(left, right)
    }
    height(root)
    return diameter
}
```

#### How do you serialize and deserialize a binary tree?

Plot twist — you can flatten any tree into a string and rebuild it perfectly. Use pre-order traversal, writing each value comma-separated with "null" for null children. Deserialize by reading values in the same order. The pre-order structure preserves exactly where every node goes.

```kotlin
fun serialize(root: TreeNode?): String {
    val result = StringBuilder()
    fun build(node: TreeNode?) {
        if (node == null) { result.append("null,"); return }
        result.append("${node.value},")
        build(node.left)
        build(node.right)
    }
    build(root)
    return result.toString()
}

fun deserialize(data: String): TreeNode? {
    val values = data.split(",").iterator()
    fun build(): TreeNode? {
        val value = values.next()
        if (value == "null") return null
        val node = TreeNode(value.toInt())
        node.left = build()
        node.right = build()
        return node
    }
    return build()
}
```

#### What is a binary tree and how is it represented?

A binary tree is a data structure where each node has at most two children — left and right. Think of it like a decision flowchart where every step has at most two possible paths. You represent it with a node class holding a value and child pointers.

```kotlin
class TreeNode(
    var value: Int,
    var left: TreeNode? = null,
    var right: TreeNode? = null
)
```

A BST adds one rule on top: everything in the left subtree is smaller, everything in the right subtree is larger. That single constraint gives you O(log n) search.

#### How do you delete a node from a BST?

This one has three cases, and the last one is where it gets interesting. No children? Just remove it. One child? Replace the node with that child. But two children — now you need to find the in-order successor (smallest value in the right subtree), copy its value into the node you're deleting, and then delete the successor instead.

```kotlin
fun deleteNode(root: TreeNode?, key: Int): TreeNode? {
    if (root == null) return null
    when {
        key < root.value -> root.left = deleteNode(root.left, key)
        key > root.value -> root.right = deleteNode(root.right, key)
        else -> {
            if (root.left == null) return root.right
            if (root.right == null) return root.left
            var successor = root.right!!
            while (successor.left != null) successor = successor.left!!
            root.value = successor.value
            root.right = deleteNode(root.right, successor.value)
        }
    }
    return root
}
```

> **🧠 Think about it:** Why does the in-order successor always have at most one child? What does that mean for the recursive delete call?

#### How do you find the LCA in a BST specifically?

Now here's where it gets nice — in a BST, you don't need to search the whole tree. You can use the ordering property like a compass. If both values are less than the current node, go left. Both greater? Go right. The moment they split — one goes left, one goes right — you've found the LCA.

```kotlin
fun lcaBST(root: TreeNode?, p: Int, q: Int): TreeNode? {
    var node = root
    while (node != null) {
        when {
            p < node.value && q < node.value -> node = node.left
            p > node.value && q > node.value -> node = node.right
            else -> return node
        }
    }
    return null
}
```

Time O(h), space O(1) iteratively.

#### How do you construct a binary tree from in-order and pre-order traversals?

Here's the trick: the first element in pre-order is always the root. Find that value in in-order — everything to its left is the left subtree, everything to its right is the right subtree. Then recurse. A hash map on the in-order array makes the lookups O(1) instead of scanning every time.

```kotlin
fun buildTree(preorder: IntArray, inorder: IntArray): TreeNode? {
    val inorderMap = HashMap<Int, Int>()
    for (i in inorder.indices) inorderMap[inorder[i]] = i
    var preIndex = 0

    fun build(inLeft: Int, inRight: Int): TreeNode? {
        if (inLeft > inRight) return null
        val rootVal = preorder[preIndex++]
        val node = TreeNode(rootVal)
        val inIndex = inorderMap[rootVal]!!
        node.left = build(inLeft, inIndex - 1)
        node.right = build(inIndex + 1, inRight)
        return node
    }

    return build(0, inorder.size - 1)
}
```

#### How do you check if a binary tree is symmetric?

A symmetric tree is its own mirror image — the left subtree is a mirror of the right subtree. So you compare them in tandem: left's left with right's right, and left's right with right's left. If every pair matches, it's symmetric.

```kotlin
fun isSymmetric(root: TreeNode?): Boolean {
    fun isMirror(left: TreeNode?, right: TreeNode?): Boolean {
        if (left == null && right == null) return true
        if (left == null || right == null) return false
        return left.value == right.value &&
               isMirror(left.left, right.right) &&
               isMirror(left.right, right.left)
    }
    return isMirror(root?.left, root?.right)
}
```

#### How do you check if a binary tree has a path with a given sum?

Walk down each root-to-leaf path, subtracting as you go. At each node, subtract its value from the target. When you hit a leaf, check if the remaining sum is zero. If any path works, you're done.

```kotlin
fun hasPathSum(root: TreeNode?, targetSum: Int): Boolean {
    if (root == null) return false
    val remaining = targetSum - root.value
    if (root.left == null && root.right == null) {
        return remaining == 0
    }
    return hasPathSum(root.left, remaining) ||
           hasPathSum(root.right, remaining)
}
```

#### What is a balanced binary tree and how do AVL trees maintain balance?

A balanced tree keeps the height difference between left and right subtrees of every node to at most 1 — and that guarantee is what gives you O(log n) operations instead of O(n) on a skewed tree. AVL trees enforce this by checking the balance factor after every insertion and deletion, then performing rotations to fix any imbalance. There are four rotation cases: left-left, right-right, left-right, and right-left. In practice, you need to understand the concept and when rotations happen, but most interviewers won't ask you to implement them from scratch.

> **🧠 Think about it:** What happens to BST operations when you insert sorted data without any balancing? What shape does the tree take?

#### How do you find all root-to-leaf paths?

DFS with backtracking — it's like exploring a maze. Walk down each path, recording nodes as you go. When you hit a leaf, save that path. When you backtrack, remove the last node so you can try the next branch.

```kotlin
fun binaryTreePaths(root: TreeNode?): List<String> {
    val result = mutableListOf<String>()
    fun dfs(node: TreeNode?, path: MutableList<Int>) {
        if (node == null) return
        path.add(node.value)
        if (node.left == null && node.right == null) {
            result.add(path.joinToString("->"))
        } else {
            dfs(node.left, path)
            dfs(node.right, path)
        }
        path.removeAt(path.lastIndex)
    }
    dfs(root, mutableListOf())
    return result
}
```

### Common Follow-ups

- How do you convert a sorted array into a balanced BST?
- What is the difference between complete, full, and perfect binary trees?
- How do you find the Kth smallest element in a BST?
- Can you do in-order traversal iteratively without recursion?
- How do you find the right-side view of a binary tree?
- What is Morris traversal and how does it achieve O(1) space?
- How do you flatten a binary tree to a linked list in-place?
- What is the time complexity of operations on a skewed BST?
