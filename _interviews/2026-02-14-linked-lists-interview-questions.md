---
title: "Linked Lists"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 2
sequence: 42
description: "Linked list problems are a staple in DSA interviews because they test pointer manipulation, edge case handling, and in-place operations."
---

## Linked Lists

Linked list problems are a staple in DSA interviews because they test pointer manipulation, edge case handling, and in-place operations. Most solutions rely on a small set of patterns — fast/slow pointers, dummy nodes, and reversing links.

#### How do you reverse a singly linked list?

Iterate through the list, reversing each node's `next` pointer to point to the previous node. Three pointers: `prev`, `current`, and `next`. Time O(n), space O(1).

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

This is the most important linked list pattern. Many harder problems use it as a building block.

#### How do you detect a cycle in a linked list?

Use Floyd's cycle detection — slow pointer moves one step, fast pointer moves two steps. If there's a cycle, fast catches slow. If fast reaches null, no cycle. Time O(n), space O(1).

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

#### How do you merge two sorted linked lists?

Compare heads of both lists and pick the smaller one. Use a dummy node to simplify building the result. Time O(n + m), space O(1).

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

#### How do you find the middle element of a linked list?

Slow and fast pointer technique. Move slow one step and fast two steps. When fast reaches the end, slow is at the middle. Time O(n), space O(1).

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

#### What is a linked list and how does it differ from an array?

A linked list is a sequence of nodes where each node holds a value and a pointer to the next node. Insertions and deletions at known positions are O(1) because you just rewire pointers. The tradeoff is no random access — reaching the i-th element requires O(n) traversal. Arrays give O(1) index access but O(n) insertions in the middle.

#### How do you remove the nth node from the end of a linked list?

Use two pointers with a gap of n. Advance the first pointer n steps ahead, then move both together until the first reaches the end. The second pointer is right before the node to remove. Time O(n), space O(1), single pass.

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

#### How do you find the starting node of a cycle in a linked list?

First detect the cycle using Floyd's algorithm. Once slow and fast meet, reset one pointer to head and keep the other at the meeting point. Move both one step at a time — they meet at the cycle start. Time O(n), space O(1).

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

#### How do you check if a linked list is a palindrome?

Find the middle using slow/fast pointers, reverse the second half, then compare both halves node by node. Time O(n), space O(1).

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

#### How do you add two numbers represented as linked lists?

Each list represents a number in reverse order. Traverse both, adding corresponding digits plus a carry. Time O(max(n, m)), space O(max(n, m)).

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

#### How do you find the intersection point of two linked lists?

Walk pointer A through list A then list B, and pointer B through list B then list A. Both travel the same total distance and arrive at the intersection at the same time. Time O(n + m), space O(1).

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

#### What's the difference between singly and doubly linked lists?

A singly linked list has one pointer per node (`next`). You can only traverse forward. A doubly linked list has two pointers (`next` and `prev`), enabling traversal in both directions and simpler deletion. The cost is extra memory per node. Doubly linked lists are the backbone of structures like LRU Cache.

#### Explain how an LRU Cache works using a doubly linked list and HashMap.

HashMap gives O(1) key lookup. Doubly linked list maintains access order — most recently used at head, least recently used at tail. On `get`, move node to head. On `put`, insert at head, remove tail if over capacity. All operations are O(1).

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

#### How do you deep copy a linked list with random pointers?

First pass — create all new nodes and map old to new in a HashMap. Second pass — set `next` and `random` pointers using the map. Time O(n), space O(n).

```kotlin
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

#### How do you reverse nodes in k-group?

Reverse every k nodes. If fewer than k remain, leave them as-is. Check if k nodes exist, then reverse them and connect groups.

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

#### How do you sort a linked list in O(n log n) time?

Merge sort. Split at the midpoint using slow/fast pointers, recursively sort both halves, merge them. Time O(n log n), space O(log n) for the recursion stack.

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

### Common Follow-ups

- How would you reverse a linked list between positions m and n?
- How would you merge k sorted linked lists efficiently?
- What's the time complexity of LRU Cache operations?
- How do you remove all duplicates from a sorted linked list?
- How do you rotate a linked list by k places to the right?
- Can you implement a stack or queue using a linked list?
- What's the difference between using a dummy node and handling head separately?
- How do you flatten a multilevel doubly linked list?
