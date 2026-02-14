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

Here's the thing — this is probably the single most important linked list pattern you'll ever learn. Think of it like flipping a chain of paper clips. You grab each clip, unhook it from the one in front, and hook it to the one behind. Three pointers do the job: `prev`, `current`, and `next`. Time O(n), space O(1).

```kotlin
fun reverseList(head: ListNode?): ListNode? {
    var prev: ListNode? = null
    var current = head
    while (current != null) {
        val next = current.next   // save what's ahead
        current.next = prev       // flip the link
        prev = current            // move prev forward
        current = next            // move current forward
    }
    return prev
}
```

You'll see this come back as a building block in at least half the harder linked list problems. Get this one in your muscle memory.

#### How do you detect a cycle in a linked list?

This uses Floyd's cycle detection — and I love the analogy here. Imagine two runners on a circular track. One runs twice as fast as the other. If the track has a loop, the fast runner will eventually lap the slow runner and they'll meet. If there's no loop (the track has an end), the fast runner just finishes first. That's exactly what we do with two pointers. Time O(n), space O(1).

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

You compare the heads of both lists and always pick the smaller one — like merging two sorted stacks of exam papers by peeking at the top grade of each stack. A dummy node at the start saves you from writing special-case logic for the first element. Time O(n + m), space O(1).

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

Same slow/fast pointer trick. Move slow one step, fast two steps. When fast hits the end, slow is standing right at the middle. It's like having two friends walk the same path — one at double speed. When the fast one finishes, the slow one is exactly halfway. Time O(n), space O(1).

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

> **🧠 Think about it:** If the list has an even number of nodes, does the slow pointer land on the first middle node or the second? Try tracing it with a 4-node list.

#### What is a linked list and how does it differ from an array?

A linked list is a chain of nodes where each node holds a value and a pointer to the next one. Insertions and deletions at known positions are O(1) — you just rewire pointers, no shifting needed. The tradeoff? No random access. Getting to the i-th element means walking there node by node, which is O(n). Arrays are the opposite — O(1) index access, but O(n) to insert in the middle because everything has to shift over.

#### How do you remove the nth node from the end of a linked list?

The trick is creating a gap. You advance one pointer n steps ahead, then walk both pointers together until the leader reaches the end. At that point, the trailing pointer sits right before the node you want to remove. One pass, O(n) time, O(1) space. The dummy node handles the edge case where you're removing the head.

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

This is where Floyd's algorithm gets really clever. First, detect the cycle the usual way — slow and fast pointers until they meet. Now here's the part that feels like magic: reset one pointer to the head and keep the other at the meeting point. Move both one step at a time. They meet at the exact node where the cycle begins. The math behind it works out because of how the distances relate, but the implementation is beautifully simple. Time O(n), space O(1).

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

This one combines two patterns you already know. Find the middle with slow/fast pointers, reverse the second half in-place, then walk both halves comparing values. If every pair matches, it's a palindrome. Time O(n), space O(1). The key insight is that you don't need extra memory — reversing half the list gives you a way to compare from both ends simultaneously.

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

> **🧠 Think about it:** After checking, the second half of the list is still reversed. In a real interview, would you restore it? What are the tradeoffs of leaving it reversed vs. reversing it back?

#### How do you add two numbers represented as linked lists?

Each list stores digits in reverse order — so `2 -> 4 -> 3` represents 342. You walk both lists together, adding digits plus a carry, just like you'd do long addition by hand on paper. Build the result as a new linked list. Time O(max(n, m)), space O(max(n, m)).

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

Plot twist — the elegant solution here doesn't require calculating lengths at all. Walk pointer A through list A and then through list B. Walk pointer B through list B and then through list A. Both pointers travel the same total distance, so they arrive at the intersection node at the exact same time. If there's no intersection, they both reach null together. Time O(n + m), space O(1).

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

A singly linked list has one pointer per node — `next` — so you can only go forward. A doubly linked list adds a `prev` pointer, letting you traverse in both directions. That extra pointer makes deletion simpler (you don't need a reference to the previous node separately) but costs more memory per node. In practice, doubly linked lists are the backbone of structures like LRU Cache, where you need to quickly move and remove nodes from any position.

#### Explain how an LRU Cache works using a doubly linked list and HashMap.

Think of it like a VIP line at a club. The HashMap is the bouncer who knows exactly where everyone is standing. The doubly linked list is the line itself — most recently used person at the front, least recently used at the back. When someone shows up (`get`), you pull them to the front. When someone new arrives (`put`) and the line is full, the person at the very back gets kicked out. All operations are O(1) because the HashMap gives instant lookup and the doubly linked list gives instant reordering.

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

This one looks scary but the approach is straightforward once you see it. First pass — walk through the original list and create a clone of every node, storing the mapping (old node to new node) in a HashMap. Second pass — walk through again and wire up the `next` and `random` pointers using the map to find each clone. Time O(n), space O(n) for the map.

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

You reverse every k consecutive nodes, but if fewer than k remain at the end, you leave them alone. First, check whether k nodes actually exist from the current position. If they do, reverse that chunk and recursively handle the rest. The recursive call connects the groups together.

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

> **🧠 Think about it:** This recursive solution uses O(n/k) stack space. How would you do it iteratively to get O(1) space? What would you need to track between groups?

#### How do you sort a linked list in O(n log n) time?

Merge sort is the natural fit here. With arrays you'd usually reach for quicksort, but linked lists don't have random access — so quicksort's partitioning gets awkward. Merge sort, on the other hand, works beautifully because splitting at the midpoint (slow/fast pointers) and merging two sorted lists are both things linked lists do well. Time O(n log n), space O(log n) for the recursion stack.

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
