---
title: "Stacks & Queues"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 3
sequence: 43
description: "Stacks and queues are among the most frequently tested data structures in coding interviews."
---

## Stacks & Queues

If there's one pair of data structures you're guaranteed to see in a coding interview, it's stacks and queues. They're everywhere — parentheses matching, expression evaluation, monotonic patterns, sliding window problems. They seem simple on the surface, but the patterns they unlock are surprisingly powerful.

#### What is a stack and what are its core operations?

Think of a stack like a stack of plates — you can only add or remove from the top. That's Last-In-First-Out (LIFO). The core operations are `push` (add to top), `pop` (remove from top), and `peek` (look at the top without removing). All O(1). In Kotlin, `ArrayDeque` works great as a stack — use `addLast`, `removeLast`, and `last()`.

#### What is a queue and how does it differ from a stack?

A queue is like a line at a coffee shop — first person in line gets served first. That's First-In-First-Out (FIFO). The key difference: a stack reverses insertion order, a queue preserves it. In Kotlin, `ArrayDeque` doubles as a queue using `addLast` and `removeFirst`.

#### How do you check if a string of parentheses is valid?

Here's the thing — this is the classic stack problem, and the approach is beautifully simple. Push every opening bracket onto the stack. When you hit a closing bracket, check if the top of the stack is the matching opener. If yes, pop it off. If no, the string is invalid. At the end, the stack should be empty.

```kotlin
fun isValid(s: String): Boolean {
    val stack = ArrayDeque<Char>()
    val pairs = mapOf(')' to '(', '}' to '{', ']' to '[')
    for (ch in s) {
        if (ch in pairs.values) {
            stack.addLast(ch)
        } else {
            if (stack.isEmpty() || stack.last() != pairs[ch]) return false
            stack.removeLast()
        }
    }
    return stack.isEmpty()
}
```

#### How do you design a Min Stack that supports getMin in O(1)?

The trick is to use two stacks — one for your actual values, and a shadow stack that tracks the current minimum at every level. Every time you push a value, you also push the minimum of that value and the current min onto the min stack. That way, `getMin` is just peeking at the top of the shadow stack.

```kotlin
class MinStack {
    private val stack = ArrayDeque<Int>()
    private val minStack = ArrayDeque<Int>()

    fun push(value: Int) {
        stack.addLast(value)
        val currentMin = if (minStack.isEmpty()) value
                         else minOf(value, minStack.last())
        minStack.addLast(currentMin)
    }

    fun pop() { stack.removeLast(); minStack.removeLast() }
    fun top(): Int = stack.last()
    fun getMin(): Int = minStack.last()
}
```

All operations O(1). Space O(n) for the extra stack.

> **🧠 Think about it:** Could you do this with just one stack instead of two? What would you store in each entry?

#### How do you evaluate a Reverse Polish Notation expression?

RPN is actually how calculators work internally — operators come after their operands. Walk through the tokens left to right. If it's a number, push it onto the stack. If it's an operator, pop two operands, compute the result, and push it back. The stack does all the heavy lifting of tracking what's ready to be computed.

```kotlin
fun evalRPN(tokens: Array<String>): Int {
    val stack = ArrayDeque<Int>()
    for (token in tokens) {
        when (token) {
            "+", "-", "*", "/" -> {
                val b = stack.removeLast()
                val a = stack.removeLast()
                val result = when (token) {
                    "+" -> a + b; "-" -> a - b
                    "*" -> a * b; "/" -> a / b
                    else -> 0
                }
                stack.addLast(result)
            }
            else -> stack.addLast(token.toInt())
        }
    }
    return stack.last()
}
```

#### How do you implement a queue using two stacks?

This one's clever. You use an input stack and an output stack. Pushing is straightforward — just push onto the input stack. But when you need to dequeue, if the output stack is empty, you pour everything from input onto output. That reversal is exactly what flips LIFO into FIFO. It's like flipping a stack of papers upside down — suddenly the bottom one is on top.

```kotlin
class QueueUsingStacks {
    private val input = ArrayDeque<Int>()
    private val output = ArrayDeque<Int>()

    fun enqueue(value: Int) { input.addLast(value) }

    fun dequeue(): Int {
        if (output.isEmpty()) {
            while (input.isNotEmpty()) output.addLast(input.removeLast())
        }
        return output.removeLast()
    }

    fun peek(): Int {
        if (output.isEmpty()) {
            while (input.isNotEmpty()) output.addLast(input.removeLast())
        }
        return output.last()
    }
}
```

Amortized O(1) for both operations.

#### What is a monotonic stack and how does it solve "next greater element"?

A monotonic stack keeps its elements in sorted order — either always increasing or always decreasing. For the "next greater element" problem, you iterate from right to left. At each position, pop off anything smaller than or equal to the current element. Whatever's left on top? That's your next greater element. Each element gets pushed and popped at most once, so it's O(n) overall.

```kotlin
fun nextGreaterElement(nums: IntArray): IntArray {
    val result = IntArray(nums.size) { -1 }
    val stack = ArrayDeque<Int>()
    for (i in nums.indices.reversed()) {
        while (stack.isNotEmpty() && stack.last() <= nums[i]) {
            stack.removeLast()
        }
        if (stack.isNotEmpty()) result[i] = stack.last()
        stack.addLast(nums[i])
    }
    return result
}
```

Time O(n) — each element is pushed and popped at most once.

#### How do you solve Daily Temperatures using a monotonic stack?

Same family of problems as "next greater element," just with a twist. For each day, you want to know how many days until a warmer temperature. Use a monotonic decreasing stack storing indices (not values). When the current temperature is higher than the temperature at the index on top, pop it and the distance is `i - prevIndex`.

```kotlin
fun dailyTemperatures(temperatures: IntArray): IntArray {
    val result = IntArray(temperatures.size)
    val stack = ArrayDeque<Int>()
    for (i in temperatures.indices) {
        while (stack.isNotEmpty() &&
               temperatures[i] > temperatures[stack.last()]) {
            val prevIndex = stack.removeLast()
            result[prevIndex] = i - prevIndex
        }
        stack.addLast(i)
    }
    return result
}
```

#### How do you find the largest rectangle in a histogram?

This is one of the hardest stack problems, but the idea is elegant. Use a monotonic increasing stack of indices. When you encounter a bar that's shorter than the one on top, you know the taller bar can't extend any further right. So pop it, calculate the area using that bar's height, and the width stretches from the current index back to the new stack top. It's like figuring out how far each bar can stretch sideways without being blocked.

```kotlin
fun largestRectangleArea(heights: IntArray): Int {
    val stack = ArrayDeque<Int>()
    var maxArea = 0
    for (i in 0..heights.size) {
        val currentHeight = if (i == heights.size) 0 else heights[i]
        while (stack.isNotEmpty() && currentHeight < heights[stack.last()]) {
            val height = heights[stack.removeLast()]
            val width = if (stack.isEmpty()) i
                        else i - stack.last() - 1
            maxArea = maxOf(maxArea, height * width)
        }
        stack.addLast(i)
    }
    return maxArea
}
```

Time O(n), space O(n).

> **🧠 Think about it:** Why do we append a virtual bar of height 0 at the end? What would happen if we didn't?

#### What is a deque and when would you use one?

A deque (double-ended queue) lets you insert and remove from both ends in O(1). It's basically a stack and a queue combined into one structure. Reach for it when you need sliding window problems, BFS with 0-1 weighted edges, or palindrome checking.

#### How do you solve the Sliding Window Maximum problem?

This is where the deque really shines. You maintain a monotonic decreasing deque of indices. When a new element comes in, you kick out anything smaller from the back — those values can never be the window maximum anymore. The front of the deque always holds the current maximum. And if the front has fallen outside the window, remove it.

```kotlin
fun maxSlidingWindow(nums: IntArray, k: Int): IntArray {
    val deque = ArrayDeque<Int>()
    val result = IntArray(nums.size - k + 1)
    for (i in nums.indices) {
        if (deque.isNotEmpty() && deque.first() <= i - k) {
            deque.removeFirst()
        }
        while (deque.isNotEmpty() && nums[deque.last()] <= nums[i]) {
            deque.removeLast()
        }
        deque.addLast(i)
        if (i >= k - 1) {
            result[i - k + 1] = nums[deque.first()]
        }
    }
    return result
}
```

Time O(n), space O(k).

#### What is a priority queue and how does it differ from a regular queue?

Plot twist — a priority queue doesn't care about insertion order at all. It removes elements based on priority, backed by a binary heap under the hood. In Kotlin, `PriorityQueue` is a min-heap by default. Insert and remove are O(log n), peek is O(1). You'll see it in Dijkstra's algorithm, task scheduling, merging K sorted lists, and top-K problems.

#### How do you find the Kth largest element using a min-heap?

Here's the counterintuitive part — you use a *min*-heap to find the Kth *largest*. Keep a heap of size K. Walk through the array, add each element, and whenever the heap grows past K, evict the smallest. By the end, the smallest thing left in the heap is exactly the Kth largest overall.

```kotlin
fun findKthLargest(nums: IntArray, k: Int): Int {
    val minHeap = PriorityQueue<Int>()
    for (num in nums) {
        minHeap.add(num)
        if (minHeap.size > k) minHeap.poll()
    }
    return minHeap.peek()
}
```

Time O(n log k), space O(k).

> **🧠 Think about it:** Why does a min-heap of size K give us the Kth largest, and not a max-heap?

#### How do you merge K sorted lists using a priority queue?

Think of it like merging lanes of traffic — you always let the car closest to the intersection go first. Put the head of each list into a min-heap. Poll the smallest, add it to the result, then push that node's next into the heap. Repeat until the heap is empty.

```kotlin
fun mergeKLists(lists: List<ListNode?>): ListNode? {
    val heap = PriorityQueue<ListNode>(compareBy { it.value })
    for (list in lists) list?.let { heap.add(it) }
    val dummy = ListNode(0)
    var current = dummy
    while (heap.isNotEmpty()) {
        val smallest = heap.poll()
        current.next = smallest
        current = smallest
        smallest.next?.let { heap.add(it) }
    }
    return dummy.next
}
```

Time O(n log k) where n is total nodes and k is number of lists.

#### When would you choose a stack over a queue?

Reach for a stack when you need the most recent thing first — undo operations, matching brackets, DFS, expression evaluation. Use a queue when order of arrival matters — BFS, task scheduling. Use a priority queue when processing order depends on value — Dijkstra's, top-K. And use a deque when you need efficient operations on both ends — sliding window.

### Common Follow-ups

- How would you implement a circular queue with a fixed-size array?
- Can you solve valid parentheses with more than three bracket types?
- How do you find the maximum element in a stack in O(1) time?
- Why is building a heap O(n) and not O(n log n)?
- Can you use a monotonic stack to solve trapping rain water?
- How does the largest rectangle in histogram relate to maximal rectangle in a binary matrix?
- What happens if you need Kth smallest instead of Kth largest?
- How would you implement a stack that supports push, pop, and getMedian?
