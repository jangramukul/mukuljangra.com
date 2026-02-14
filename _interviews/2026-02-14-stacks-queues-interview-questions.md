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

Stacks and queues are among the most frequently tested data structures in coding interviews. They show up in parentheses matching, expression evaluation, monotonic patterns, and sliding window problems.

#### How do you check if a string of parentheses is valid?

Push every opening bracket onto the stack. When you see a closing bracket, check if the top of the stack is the matching opener. If yes, pop. If no, return false. Stack should be empty at the end.

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

Use two stacks — one for values, one for tracking the current minimum. Push the minimum of the new value and current min onto the min stack with every push.

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

#### What is a monotonic stack and how does it solve "next greater element"?

A monotonic stack maintains elements in sorted order. For next greater element, iterate from right to left. Pop elements smaller than or equal to the current — the top of the stack is the next greater element.

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

#### How do you find the largest rectangle in a histogram?

Use a monotonic increasing stack of indices. When you encounter a shorter bar, pop and calculate the area with the popped bar's height. The width extends from the current index back to the new stack top.

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

Time O(n), space O(n). One of the hardest stack problems.

#### What is a stack and what are its core operations?

A stack is a Last-In-First-Out (LIFO) data structure. Core operations: `push` (add to top), `pop` (remove from top), `peek` (view top). All O(1). In Kotlin, use `ArrayDeque` as a stack with `addLast`, `removeLast`, and `last()`.

#### What is a queue and how does it differ from a stack?

A queue is a First-In-First-Out (FIFO) data structure. Elements come out in the order they went in. A stack reverses insertion order, a queue preserves it. In Kotlin, `ArrayDeque` works as a queue using `addLast` and `removeFirst`.

#### How do you solve Daily Temperatures using a monotonic stack?

For each day, find how many days until a warmer temperature. Use a monotonic decreasing stack storing indices. When the current temperature is higher than the top index's temperature, pop and record the distance.

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

#### How do you evaluate a Reverse Polish Notation expression?

Walk through tokens. Numbers go on the stack. Operators pop two operands, compute, and push the result back.

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

Use an input stack and an output stack. Push onto input. When dequeuing, if output is empty, pop everything from input onto output — this reverses the order for FIFO behavior.

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

#### How do you solve the Sliding Window Maximum problem?

Use a deque storing indices. Maintain a monotonic decreasing deque. When adding a new element, remove smaller values from the back. The front always has the maximum. Remove front if it's outside the window.

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

#### What is a deque and when would you use one?

A deque (double-ended queue) supports insertion and removal from both ends in O(1). It combines stack and queue capabilities. Use it for sliding window problems, BFS with 0-1 weighted edges, or palindrome checking.

#### What is a priority queue and how does it differ from a regular queue?

A priority queue removes elements based on priority, not insertion order. Implemented using a binary heap. In Kotlin, `PriorityQueue` is a min-heap by default. Insert and remove are O(log n), peek is O(1). Used in Dijkstra's, task scheduling, merge K lists, and top-K problems.

#### How do you find the Kth largest element using a min-heap?

Maintain a min-heap of size K. Walk through the array — add each element, remove the smallest when heap exceeds K. The root is the Kth largest.

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

#### How do you merge K sorted lists using a priority queue?

Put each list's head into a min-heap. Poll the smallest, add to result, push that node's next into the heap. Repeat until empty.

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

Use a stack when you need to process the most recent element first — undo operations, matching brackets, DFS, expression evaluation. Use a queue for processing in arrival order — BFS, task scheduling. Use a priority queue when order depends on value — Dijkstra's, top-K. Use a deque for efficient operations on both ends — sliding window.

### Common Follow-ups

- How would you implement a circular queue with a fixed-size array?
- Can you solve valid parentheses with more than three bracket types?
- How do you find the maximum element in a stack in O(1) time?
- Why is building a heap O(n) and not O(n log n)?
- Can you use a monotonic stack to solve trapping rain water?
- How does the largest rectangle in histogram relate to maximal rectangle in a binary matrix?
- What happens if you need Kth smallest instead of Kth largest?
- How would you implement a stack that supports push, pop, and getMedian?
