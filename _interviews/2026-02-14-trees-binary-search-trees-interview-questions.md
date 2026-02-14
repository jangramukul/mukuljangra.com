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

Trees are one of the most asked topics in coding interviews. Almost every FAANG-level interview includes at least one tree problem — traversals, BST validation, or LCA. Understanding recursion and how DFS/BFS work on trees is essential.

#### What is the maximum depth of a binary tree and how do you find it?

The maximum depth is the number of nodes along the longest path from root to leaf. Use recursion — depth of a node is 1 plus the max of left and right subtree depths. Base case: null node has depth 0.

```kotlin
fun maxDepth(root: TreeNode?): Int {
    if (root == null) return 0
    return 1 + maxOf(maxDepth(root.left), maxDepth(root.right))
}
```

Time O(n), space O(h) where h is the height.

#### How do you invert a binary tree?

Swap the left and right children of every node, recursively.

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

Pass a valid range down recursively, narrowing it at each step. Each node's value must fall within its range.

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

Using `Long` avoids edge cases with `Int.MIN_VALUE` or `Int.MAX_VALUE` node values. A common mistake is only checking a node against its parent — a node deep in the right subtree must still be greater than the root.

#### How do you find the lowest common ancestor (LCA) of two nodes in a binary tree?

If the current node matches either target, it's the LCA. Recurse on both subtrees. If both return non-null, the current node is where the targets split.

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

Use a queue. Process all nodes at the current level, add their children for the next level.

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

The diameter is the longest path between any two nodes. At each node, the path through it is left height + right height. Track the maximum.

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

Use pre-order traversal. Write each value comma-separated, use "null" for null children. Deserialize by reading values in the same order.

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

A binary tree is a data structure where each node has at most two children — left and right. Represented with a node class holding a value and child pointers.

```kotlin
class TreeNode(
    var value: Int,
    var left: TreeNode? = null,
    var right: TreeNode? = null
)
```

A BST is a special case where all left subtree values are smaller and all right subtree values are larger.

#### How do you delete a node from a BST?

Three cases. No children: remove it. One child: replace with that child. Two children: find the in-order successor (smallest in right subtree), copy its value, delete the successor.

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

#### How do you find the LCA in a BST specifically?

Use the BST property. If both values are less than current node, go left. If both are greater, go right. Otherwise, the current node is the split point.

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

First element in pre-order is the root. Find it in in-order — left side is left subtree, right side is right subtree. Recurse.

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

Compare left subtree with mirror of right subtree recursively.

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

Subtract the node's value from the target. At a leaf, check if remaining is zero.

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

A balanced tree has at most 1 height difference between left and right subtrees of every node, guaranteeing O(log n) operations. AVL trees check the balance factor after every insertion/deletion and perform rotations (left-left, right-right, left-right, right-left) to restore balance. Most interviewers want you to understand the concept rather than implement rotations.

#### How do you find all root-to-leaf paths?

DFS with backtracking. Build the path going down, add to results at leaves, remove last element when returning.

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
