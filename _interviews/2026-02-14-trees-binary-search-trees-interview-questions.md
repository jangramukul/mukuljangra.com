---
title: "Trees & Binary Search Trees"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 4
level: junior
sequence: 19
---

## Trees & Binary Search Trees

Trees are one of the most asked topics in coding interviews. Almost every FAANG-level interview includes at least one tree problem — traversals, BST validation, or LCA. Understanding recursion and how DFS/BFS work on trees is essential.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a binary tree and how is it typically represented?

A binary tree is a data structure where each node has at most two children — left and right. It's usually represented with a node class that holds a value and pointers to its children.

```kotlin
class TreeNode(
    var value: Int,
    var left: TreeNode? = null,
    var right: TreeNode? = null
)
```

A binary tree is not necessarily sorted. A binary search tree (BST) is a special case where for every node, all values in the left subtree are smaller and all values in the right subtree are larger.

#### Q2: What is the maximum depth of a binary tree and how do you find it?

The maximum depth is the number of nodes along the longest path from the root to a leaf. Use recursion — the depth of a node is 1 plus the maximum of its left and right subtree depths. The base case is a null node with depth 0.

```kotlin
fun maxDepth(root: TreeNode?): Int {
    if (root == null) return 0
    return 1 + maxOf(maxDepth(root.left), maxDepth(root.right))
}
```

Time: O(n), Space: O(h) where h is the height. In the worst case (skewed tree), h = n so space is O(n). In a balanced tree, h = log n.

#### Q3: How do you invert a binary tree?

Swap the left and right children of every node, recursively. For each node, swap its children, then recurse on the left and right subtrees.

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

Time: O(n), Space: O(h). This is one of the most common easy-level tree questions.

#### Q4: Explain the four standard tree traversals — in-order, pre-order, post-order, and level-order.

- **In-order (Left, Root, Right)** — Visits nodes in ascending order for a BST. Used for sorted output
- **Pre-order (Root, Left, Right)** — Visits the root before its subtrees. Used for tree serialization and copying
- **Post-order (Left, Right, Root)** — Visits children before the root. Used for deletion and calculating subtree values
- **Level-order (BFS)** — Visits nodes level by level using a queue. Used for finding shortest paths and printing levels

```kotlin
fun inorder(node: TreeNode?) {
    if (node == null) return
    inorder(node.left)
    print("${node.value} ")
    inorder(node.right)
}

fun preorder(node: TreeNode?) {
    if (node == null) return
    print("${node.value} ")
    preorder(node.left)
    preorder(node.right)
}

fun postorder(node: TreeNode?) {
    if (node == null) return
    postorder(node.left)
    postorder(node.right)
    print("${node.value} ")
}
```

Time: O(n) for all traversals. Space: O(h) for recursive DFS, O(w) for level-order BFS where w is the maximum width.

#### Q5: How do you perform a level-order traversal (BFS) of a binary tree?

Use a queue. Start with the root. For each level, process all nodes currently in the queue and add their children. Track levels by processing exactly `queue.size` elements per iteration.

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

Time: O(n), Space: O(w) where w is the maximum number of nodes at any level. In a complete binary tree, the last level can have up to n/2 nodes.

#### Q6: How do you search for a value in a BST?

Compare the target with the current node. If it's smaller, go left. If it's larger, go right. If it matches, you found it. The sorted property of a BST lets you eliminate half the tree at each step.

```kotlin
fun searchBST(root: TreeNode?, target: Int): TreeNode? {
    if (root == null || root.value == target) return root
    return if (target < root.value) searchBST(root.left, target)
           else searchBST(root.right, target)
}
```

Time: O(h) where h is the height. For a balanced BST, h = log n. For a skewed BST, h = n. Space: O(h) for the recursive call stack — you can do it iteratively in O(1) space.

#### Q7: How do you insert a node into a BST?

Walk down the tree comparing the value to insert. When you hit a null position, that's where the new node goes. Recursively find the correct spot and attach the node.

```kotlin
fun insertBST(root: TreeNode?, value: Int): TreeNode {
    if (root == null) return TreeNode(value)
    if (value < root.value) root.left = insertBST(root.left, value)
    else root.right = insertBST(root.right, value)
    return root
}
```

Time: O(h), Space: O(h). Insertion always happens at a leaf position. The shape of the tree depends on the insertion order — inserting sorted data produces a skewed tree with O(n) operations.

#### Q8: How do you check if a binary tree has a root-to-leaf path with a given sum?

At each node, subtract the node's value from the target sum. When you reach a leaf, check if the remaining sum equals zero. Both the left and right child must be null for it to be a leaf.

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

Time: O(n), Space: O(h). A common mistake is checking `remaining == 0` at a non-leaf node — internal nodes with the right sum but with children below them should not count.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How do you validate whether a binary tree is a valid BST?

A valid BST requires every node's value to be within a range. The root can be anything. Its left child must be less than the root, and its right child must be greater. Pass the valid range down recursively, narrowing it at each step.

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

Time: O(n), Space: O(h). Using `Long` for bounds avoids edge cases where node values are `Int.MIN_VALUE` or `Int.MAX_VALUE`. A common mistake is only checking a node against its parent — a node in the right subtree of the root must be greater than the root, not just its direct parent.

#### Q10: How do you delete a node from a BST?

There are three cases. If the node has no children, remove it. If it has one child, replace it with that child. If it has two children, find the in-order successor (smallest node in the right subtree), copy its value to the current node, and delete the successor instead.

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

Time: O(h), Space: O(h). You could also use the in-order predecessor (largest node in the left subtree) instead of the successor — both approaches maintain BST ordering.

#### Q11: How do you find the lowest common ancestor (LCA) of two nodes in a binary tree?

If the current node matches either target, it's the LCA. Recurse on both subtrees. If both subtrees return non-null, the current node is the LCA (the targets are on different sides). If only one subtree returns non-null, that's where both targets are.

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

Time: O(n), Space: O(h). For a BST specifically, you can do it in O(h) by comparing values — if both nodes are smaller than root, go left; if both are larger, go right; otherwise the root is the LCA.

#### Q12: How do you find the LCA in a BST specifically?

In a BST, the structure gives you extra information. If both values are less than the current node, the LCA is in the left subtree. If both are greater, it's in the right. Otherwise, the current node is the split point — that's the LCA.

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

Time: O(h), Space: O(1) with the iterative approach. This is more efficient than the general binary tree LCA because you skip entire subtrees.

#### Q13: How do you find the diameter of a binary tree?

The diameter is the longest path between any two nodes. It doesn't have to pass through the root. At each node, the path through it is the sum of the left height and right height. Track the maximum across all nodes.

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

Time: O(n), Space: O(h). The diameter at each node is `left_height + right_height`. We compute the height recursively and update the global maximum as a side effect. The answer is in edges, not nodes.

#### Q14: How do you serialize and deserialize a binary tree?

Use pre-order traversal. Write each node's value separated by commas. Use a marker like "null" for null children. To deserialize, read values in the same order and rebuild the tree recursively.

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

Time: O(n), Space: O(n). Pre-order works because the root is always first, so the deserializer knows exactly where to start. Level-order serialization also works but requires more careful handling of null nodes at deeper levels.

#### Q15: How do you construct a binary tree from in-order and pre-order traversals?

The first element in pre-order is always the root. Find that value in the in-order array — everything to its left is the left subtree, everything to its right is the right subtree. Recurse with the corresponding segments.

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

Time: O(n), Space: O(n). The hash map gives O(1) lookup for each root position in the in-order array. Without the map, you'd do a linear scan each time, making it O(n^2). You need both traversals because pre-order alone can't determine the tree shape — in-order tells you which nodes go left vs right.

#### Q16: What is a balanced binary tree and how do AVL trees maintain balance?

A balanced tree has a height difference of at most 1 between the left and right subtrees of every node. This guarantees O(log n) operations. An AVL tree is a self-balancing BST that checks the balance factor (left height minus right height) after every insertion and deletion. If it becomes -2 or 2, it performs rotations to restore balance.

There are four rotation cases: left-left (single right rotation), right-right (single left rotation), left-right (double rotation: left then right), and right-left (double rotation: right then left). In practice, most interviewers don't ask you to implement AVL rotations — they want you to understand the concept and know that balanced BSTs give O(log n) guarantees.

#### Q17: How do you check if a binary tree is symmetric?

A tree is symmetric if its left subtree is a mirror of its right subtree. Compare the left child of the left subtree with the right child of the right subtree, and vice versa.

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

Time: O(n), Space: O(h). You can also solve this iteratively using a queue — enqueue pairs of nodes that should be mirrors and compare them.

#### Q18: How do you find all root-to-leaf paths in a binary tree?

Use DFS with backtracking. Build the path as you go down. When you reach a leaf, add the current path to the result. Remove the last element when returning from a recursive call.

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

Time: O(n), Space: O(h) for the recursion stack plus O(n) for storing all paths. The backtracking step (`removeAt(path.lastIndex)`) is what makes this work — without it, paths from different branches would contaminate each other.

### Common Follow-ups

- How do you convert a sorted array into a balanced BST?
- What is the difference between a complete binary tree, a full binary tree, and a perfect binary tree?
- How do you find the Kth smallest element in a BST?
- Can you do an in-order traversal iteratively without recursion?
- How do you find the right-side view of a binary tree?
- What is Morris traversal and how does it achieve O(1) space?
- How do you flatten a binary tree to a linked list in-place?
- What is the time complexity of operations on a skewed BST, and how does self-balancing fix it?
