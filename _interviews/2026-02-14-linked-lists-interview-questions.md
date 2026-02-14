---
title: "Linked Lists"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 2
sequence: 17
---

## Linked Lists

Linked list problems are a staple in DSA interviews because they test pointer manipulation, edge case handling, and in-place operations. Most solutions rely on a small set of patterns — fast/slow pointers, dummy nodes, and reversing links.

### Core Questions

#### Q1: What is a linked list and how does it differ from an array?

A linked list is a sequence of nodes where each node holds a value and a pointer to the next node. Unlike arrays, linked lists don't need contiguous memory — insertions and deletions at known positions are O(1) because you just rewire pointers. The tradeoff is no random access — reaching the i-th element requires O(n) traversal. Arrays give you O(1) index access but O(n) insertions in the middle because elements need shifting.

#### Q2: What's the difference between singly and doubly linked lists?

A singly linked list has one pointer per node (`next`). You can only traverse forward. Deletion requires access to the previous node, which means you often need to track it separately.

A doubly linked list has two pointers (`next` and `prev`). You can traverse in both directions, and deletion is simpler because each node already knows its predecessor. The cost is extra memory per node for the second pointer. Doubly linked lists are the backbone of structures like LRU Cache where you need fast removal from the middle.

```kotlin
class ListNode(var value: Int, var next: ListNode? = null)

class DoublyListNode(
    var value: Int,
    var prev: DoublyListNode? = null,
    var next: DoublyListNode? = null
)
```

#### Q3: How do you traverse a linked list and find its length?

Start at the head and follow `next` pointers until you hit null. Count nodes as you go. Time O(n), space O(1).

```kotlin
fun length(head: ListNode?): Int {
    var count = 0
    var current = head
    while (current != null) {
        count++
        current = current.next
    }
    return count
}
```

#### Q4: How do you find the middle element of a linked list?

Use the slow and fast pointer technique. Move slow one step and fast two steps at a time. When fast reaches the end, slow is at the middle. Time O(n), space O(1). This avoids needing to know the length upfront.

```kotlin
fun middleNode(head: ListNode?): ListNode? {
    var slow = head
    var fast = head
    while (fast?.next != null) {
        slow = slow?.next
        fast = fast.next?.next
    }
    return slow
}
```

For even-length lists, this returns the second middle node. If you need the first middle, change the condition to `fast?.next?.next != null`.

#### Q5: How do you reverse a singly linked list?

Iterate through the list, reversing each node's `next` pointer to point to the previous node. You need three pointers: `prev`, `current`, and `next` (to save the reference before overwriting). Time O(n), space O(1).

```kotlin
fun reverseList(head: ListNode?): ListNode? {
    var prev: ListNode? = null
    var current = head
    while (current != null) {
        val next = current.next
        current.next = prev
        prev = current
        current = next
    }
    return prev
}
```

This is one of the most important linked list patterns. Many harder problems (reverse k-group, palindrome linked list, reorder list) use this as a building block.

#### Q6: How do you reverse a linked list recursively?

The recursive approach reverses the rest of the list first, then fixes the current node's pointer. The base case is when you reach the last node — that becomes the new head. Time O(n), space O(n) due to the call stack.

```kotlin
fun reverseListRecursive(head: ListNode?): ListNode? {
    if (head?.next == null) return head
    val newHead = reverseListRecursive(head.next)
    head.next!!.next = head
    head.next = null
    return newHead
}
```

The iterative approach is preferred in interviews because it's O(1) space, but know both.

#### Q7: How do you detect a cycle in a linked list?

Use Floyd's cycle detection — move a slow pointer one step and a fast pointer two steps. If there's a cycle, fast will eventually catch up to slow. If fast reaches null, there's no cycle. Time O(n), space O(1).

The alternative is a HashSet of visited nodes, which works but uses O(n) space. Interviewers expect Floyd's.

```kotlin
fun hasCycle(head: ListNode?): Boolean {
    var slow = head
    var fast = head
    while (fast?.next != null) {
        slow = slow?.next
        fast = fast.next?.next
        if (slow == fast) return true
    }
    return false
}
```

#### Q8: How do you merge two sorted linked lists?

Compare heads of both lists and pick the smaller one. Advance the pointer of the list you took from. Use a dummy node to simplify building the result — it avoids special-casing the first node. Time O(n + m), space O(1).

```kotlin
fun mergeTwoLists(l1: ListNode?, l2: ListNode?): ListNode? {
    val dummy = ListNode(0)
    var tail = dummy
    var a = l1
    var b = l2
    while (a != null && b != null) {
        if (a.value <= b.value) {
            tail.next = a
            a = a.next
        } else {
            tail.next = b
            b = b.next
        }
        tail = tail.next!!
    }
    tail.next = a ?: b
    return dummy.next
}
```

The dummy node pattern shows up everywhere in linked list problems. It eliminates edge cases with empty lists and simplifies the code.

#### Q9: How do you remove the nth node from the end of a linked list?

Use two pointers with a gap of n between them. Advance the first pointer n steps ahead, then move both pointers together until the first reaches the end. The second pointer is now right before the node to remove. Time O(n), space O(1), single pass.

```kotlin
fun removeNthFromEnd(head: ListNode?, n: Int): ListNode? {
    val dummy = ListNode(0)
    dummy.next = head
    var fast: ListNode? = dummy
    var slow: ListNode? = dummy
    for (i in 0..n) fast = fast?.next
    while (fast != null) {
        fast = fast.next
        slow = slow?.next
    }
    slow?.next = slow?.next?.next
    return dummy.next
}
```

The dummy node handles the edge case where you need to remove the head itself (when n equals the list length).

### Deep Dive Questions

#### Q10: How do you find the starting node of a cycle in a linked list?

First detect the cycle using Floyd's algorithm. Once slow and fast meet inside the cycle, reset one pointer to the head and keep the other at the meeting point. Move both one step at a time — they'll meet at the cycle's starting node. Time O(n), space O(1).

The math behind it: if the distance from head to cycle start is `a`, and the distance from cycle start to meeting point is `b`, then `a = c` where `c` is the remaining distance in the cycle. So both pointers travel the same distance to reach the start.

```kotlin
fun detectCycle(head: ListNode?): ListNode? {
    var slow = head
    var fast = head
    while (fast?.next != null) {
        slow = slow?.next
        fast = fast.next?.next
        if (slow == fast) {
            var pointer = head
            while (pointer != slow) {
                pointer = pointer?.next
                slow = slow?.next
            }
            return pointer
        }
    }
    return null
}
```

#### Q11: How do you check if a linked list is a palindrome?

Find the middle using slow/fast pointers, reverse the second half, then compare both halves node by node. Restore the list afterward if needed. Time O(n), space O(1).

```kotlin
fun isPalindrome(head: ListNode?): Boolean {
    var slow = head
    var fast = head
    while (fast?.next != null) {
        slow = slow?.next
        fast = fast.next?.next
    }
    var reversed = reverseList(slow)
    var current = head
    while (reversed != null) {
        if (current?.value != reversed.value) return false
        current = current.next
        reversed = reversed.next
    }
    return true
}
```

This combines three patterns — find middle, reverse list, and two-pointer comparison. It's a great problem because it tests whether you can compose basic building blocks.

#### Q12: How do you add two numbers represented as linked lists?

Each list represents a number in reverse order (head is the least significant digit). Traverse both lists, adding corresponding digits plus a carry. Create new nodes for the result. Time O(max(n, m)), space O(max(n, m)).

```kotlin
fun addTwoNumbers(l1: ListNode?, l2: ListNode?): ListNode? {
    val dummy = ListNode(0)
    var current = dummy
    var a = l1
    var b = l2
    var carry = 0
    while (a != null || b != null || carry > 0) {
        val sum = (a?.value ?: 0) + (b?.value ?: 0) + carry
        carry = sum / 10
        current.next = ListNode(sum % 10)
        current = current.next!!
        a = a?.next
        b = b?.next
    }
    return dummy.next
}
```

The condition `carry > 0` in the while loop handles cases like 999 + 1 = 1000 where the result is longer than both inputs.

#### Q13: How do you find the intersection point of two linked lists?

If two lists converge into one, they share a common tail. The trick is to equalize the traversal distance. Walk pointer A through list A then list B, and pointer B through list B then list A. Both pointers travel the same total distance (lenA + lenB), so they arrive at the intersection point at the same time. If there's no intersection, both reach null simultaneously. Time O(n + m), space O(1).

```kotlin
fun getIntersectionNode(headA: ListNode?, headB: ListNode?): ListNode? {
    var a = headA
    var b = headB
    while (a != b) {
        a = if (a != null) a.next else headB
        b = if (b != null) b.next else headA
    }
    return a
}
```

#### Q14: Explain how an LRU Cache works using a doubly linked list and HashMap.

An LRU (Least Recently Used) Cache evicts the least recently accessed item when capacity is full. The HashMap gives O(1) key lookup. The doubly linked list maintains access order — most recently used at the head, least recently used at the tail.

On `get`: look up the key in the HashMap, move the node to the head (most recent), return the value.
On `put`: if the key exists, update and move to head. If new, insert at head. If over capacity, remove the tail node and delete its key from the HashMap.

All operations are O(1) because both HashMap access and linked list node movement (with direct references) are constant time.

```kotlin
class LRUCache(private val capacity: Int) {
    private data class Node(
        val key: Int, var value: Int,
        var prev: Node? = null, var next: Node? = null
    )
    private val map = HashMap<Int, Node>()
    private val head = Node(0, 0)
    private val tail = Node(0, 0)
    init { head.next = tail; tail.prev = head }

    fun get(key: Int): Int {
        val node = map[key] ?: return -1
        remove(node); addToHead(node)
        return node.value
    }

    fun put(key: Int, value: Int) {
        if (map.containsKey(key)) {
            val node = map[key]!!
            node.value = value
            remove(node); addToHead(node)
        } else {
            val node = Node(key, value)
            map[key] = node; addToHead(node)
            if (map.size > capacity) {
                val lru = tail.prev!!
                remove(lru); map.remove(lru.key)
            }
        }
    }

    private fun addToHead(node: Node) {
        node.next = head.next; node.prev = head
        head.next?.prev = node; head.next = node
    }

    private fun remove(node: Node) {
        node.prev?.next = node.next
        node.next?.prev = node.prev
    }
}
```

This is one of the most commonly asked design problems in interviews. The sentinel head and tail nodes eliminate null checks when adding or removing.

#### Q15: How do you deep copy a linked list with random pointers?

Each node has a `next` pointer and a `random` pointer that can point to any node in the list or null. The challenge is that when copying, the random pointer's target node may not have been created yet.

**HashMap approach**: First pass — create all new nodes and map old nodes to new nodes in a HashMap. Second pass — set `next` and `random` pointers using the map. Time O(n), space O(n).

**Interleave approach**: Weave copied nodes into the original list (A → A' → B → B' → ...), set random pointers using `original.random.next`, then separate the two lists. Time O(n), space O(1).

```kotlin
class NodeWithRandom(
    var value: Int,
    var next: NodeWithRandom? = null,
    var random: NodeWithRandom? = null
)

fun copyRandomList(head: NodeWithRandom?): NodeWithRandom? {
    if (head == null) return null
    val map = HashMap<NodeWithRandom, NodeWithRandom>()
    var current = head
    while (current != null) {
        map[current] = NodeWithRandom(current.value)
        current = current.next
    }
    current = head
    while (current != null) {
        map[current]!!.next = map[current.next]
        map[current]!!.random = map[current.random]
        current = current.next
    }
    return map[head]
}
```

#### Q16: How do you reverse nodes in k-group?

Reverse every k nodes in the list. If fewer than k nodes remain, leave them as-is. This is a harder variant of reverse linked list that requires counting ahead and managing connections between reversed groups.

Check if k nodes exist from the current position. If yes, reverse them and connect the previous group's tail to the new head. Time O(n), space O(1).

```kotlin
fun reverseKGroup(head: ListNode?, k: Int): ListNode? {
    var current = head
    var count = 0
    while (current != null && count < k) {
        current = current.next
        count++
    }
    if (count < k) return head
    var prev: ListNode? = reverseKGroup(current, k)
    current = head
    for (i in 0 until k) {
        val next = current?.next
        current?.next = prev
        prev = current
        current = next
    }
    return prev
}
```

The recursive approach is clean but uses O(n/k) stack space. An iterative version is possible with a dummy node and explicit group tracking.

#### Q17: How do you sort a linked list in O(n log n) time?

Merge sort is the natural fit for linked lists because it doesn't need random access. Split the list at the midpoint using slow/fast pointers, recursively sort both halves, and merge them. Time O(n log n), space O(log n) for the recursion stack.

Quick sort is possible but less practical because partitioning without random access degrades the constant factor. Bottom-up merge sort achieves O(1) auxiliary space by iteratively merging sublists of size 1, 2, 4, 8... without recursion.

```kotlin
fun sortList(head: ListNode?): ListNode? {
    if (head?.next == null) return head
    var slow = head
    var fast = head.next
    while (fast?.next != null) {
        slow = slow?.next
        fast = fast.next?.next
    }
    val mid = slow?.next
    slow?.next = null
    val left = sortList(head)
    val right = sortList(mid)
    return mergeTwoLists(left, right)
}
```

This reuses the `mergeTwoLists` function from Q8. Notice the fast pointer starts at `head.next` — this ensures the left half gets the smaller portion when the list has even length, preventing infinite recursion.

#### Q18: How do you flatten a multilevel doubly linked list?

Each node can have a `child` pointer to another doubly linked list. Flatten the structure so all nodes are in a single-level doubly linked list in depth-first order.

When you encounter a node with a child, splice the child list between the current node and its next. Find the tail of the child list, connect it to the current node's next, and clear the child pointer. Time O(n), space O(1).

The recursive approach processes children first, which naturally handles nested children. The iterative approach uses the same splice-and-advance logic.

### Common Follow-ups

- How would you reverse a linked list between positions m and n (reverse a sublist)?
- Can you detect a cycle using a HashSet? What are the tradeoffs vs. Floyd's?
- How would you merge k sorted linked lists? What data structure makes it efficient?
- What's the time complexity of LRU Cache operations, and why does a singly linked list not work as well?
- How do you remove all duplicates from a sorted linked list vs. an unsorted one?
- Can you implement a stack or queue using a linked list? What are the time complexities?
- How do you rotate a linked list by k places to the right?
- What's the difference between using a dummy node and handling head separately in linked list problems?
