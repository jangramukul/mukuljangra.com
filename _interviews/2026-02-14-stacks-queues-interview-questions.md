---
title: "Stacks & Queues"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 3
sequence: 18
description: "Stacks and queues are among the most frequently tested data structures in coding interviews."
---

## Stacks & Queues

Stacks and queues are among the most frequently tested data structures in coding interviews. They show up in parentheses matching, expression evaluation, monotonic patterns, and sliding window problems.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a stack and what are its core operations?

A stack is a Last-In-First-Out (LIFO) data structure. The element added last is the first one removed. Core operations are `push` (add to top), `pop` (remove from top), and `peek` (view top without removing). All three run in O(1) time. In Kotlin, you can use `ArrayDeque` as a stack — it provides `addLast`, `removeLast`, and `last()`.

#### Q2: What is a queue and how does it differ from a stack?

A queue is a First-In-First-Out (FIFO) data structure. The element added first is the first one removed — like a real-world queue. Core operations are `enqueue` (add to back), `dequeue` (remove from front), and `peek` (view front). In Kotlin, `ArrayDeque` works as a queue using `addLast` and `removeFirst`. The key difference is ordering — a stack reverses the insertion order, a queue preserves it.

#### Q3: How do you check if a string of parentheses is valid?

Push every opening bracket onto the stack. When you see a closing bracket, check if the top of the stack is the matching opening bracket. If yes, pop it. If no, return false. At the end, the stack should be empty.

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

Time: O(n), Space: O(n).

#### Q4: How do you design a Min Stack that supports push, pop, top, and getMin in O(1)?

Use two stacks — one for actual values and one for tracking the current minimum. Every time you push a value, also push the minimum of the new value and the current min onto the min stack. When you pop, pop from both stacks.

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

Time: O(1) for all operations. Space: O(n) for the extra min stack.

#### Q5: How do you evaluate a Reverse Polish Notation (RPN) expression?

Walk through the tokens. If the token is a number, push it onto the stack. If it's an operator, pop two operands, apply the operator, and push the result back. The final value left on the stack is the answer.

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

Time: O(n), Space: O(n). Note that `a` is the first operand (pushed earlier) and `b` is the second — order matters for subtraction and division.

#### Q6: What is a deque and when would you use one?

A deque (double-ended queue) supports insertion and removal from both ends in O(1) time. It combines the capabilities of a stack and a queue. Kotlin's `ArrayDeque` is a deque backed by a resizable circular array. You'd use a deque when you need efficient operations on both ends — like the sliding window maximum problem, BFS with 0-1 weighted edges, or implementing both a stack and a queue from a single data structure.

#### Q7: How do you implement a stack using two queues?

Use two queues. On `push`, add the element to the empty queue, then move all elements from the other queue into this one. This way, the most recently added element is always at the front.

```kotlin
class StackUsingQueues {
    private var primary = ArrayDeque<Int>()
    private var secondary = ArrayDeque<Int>()

    fun push(value: Int) {
        secondary.addLast(value)
        while (primary.isNotEmpty()) {
            secondary.addLast(primary.removeFirst())
        }
        val temp = primary
        primary = secondary
        secondary = temp
    }

    fun pop(): Int = primary.removeFirst()
    fun top(): Int = primary.first()
}
```

Time: O(n) for push, O(1) for pop and top. Space: O(n). You can also make push O(1) and pop O(n) by deferring the rearrangement to the pop operation instead.

#### Q8: How do you implement a queue using two stacks?

Use an input stack and an output stack. Push onto the input stack. When you need to dequeue, if the output stack is empty, pop everything from the input stack onto the output stack — this reverses the order, giving FIFO behavior. Then pop from the output stack.

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

Time: Amortized O(1) for both enqueue and dequeue. Each element is moved between stacks at most once. Space: O(n).

### Deep Dive Questions (Advanced → Expert)

#### Q9: What is a monotonic stack and how does it solve the "next greater element" problem?

A monotonic stack maintains elements in sorted order (either increasing or decreasing) from bottom to top. For next greater element, iterate from right to left. Before pushing the current element, pop all elements from the stack that are smaller than or equal to it — they can't be the "next greater" for any earlier element. The top of the stack is the next greater element for the current index.

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

Time: O(n) — each element is pushed and popped at most once. Space: O(n).

#### Q10: How do you solve the Daily Temperatures problem using a monotonic stack?

For each day, find how many days until a warmer temperature. Use a monotonic decreasing stack that stores indices. Iterate through temperatures — when the current temperature is higher than the temperature at the top index, pop and record the distance.

```kotlin
fun dailyTemperatures(temperatures: IntArray): IntArray {
    val result = IntArray(temperatures.size)
    val stack = ArrayDeque<Int>() // stores indices
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

Time: O(n), Space: O(n). Storing indices instead of values lets you calculate the distance between days directly.

#### Q11: How do you find the largest rectangle in a histogram?

Use a monotonic increasing stack of indices. When you encounter a bar shorter than the stack's top, pop and calculate the area with the popped bar's height. The width extends from the current index back to the new stack top. After processing all bars, pop remaining entries.

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

Time: O(n), Space: O(n). The sentinel value of 0 at index `heights.size` forces all remaining bars to be popped and evaluated. This is one of the hardest stack problems — understanding that the width calculation uses the new stack top as the left boundary is the key insight.

#### Q12: What is a priority queue and how does it differ from a regular queue?

A priority queue removes elements based on priority rather than insertion order. The highest-priority element (smallest in a min-heap, largest in a max-heap) is dequeued first regardless of when it was added. It's typically implemented using a binary heap. In Kotlin, `PriorityQueue` is a min-heap by default — the smallest element is at the front.

```kotlin
// Min-heap: smallest element first
val minHeap = PriorityQueue<Int>()
minHeap.add(5); minHeap.add(1); minHeap.add(3)
println(minHeap.poll()) // 1

// Max-heap: largest element first
val maxHeap = PriorityQueue<Int>(compareByDescending { it })
maxHeap.add(5); maxHeap.add(1); maxHeap.add(3)
println(maxHeap.poll()) // 5
```

Insert and remove operations are O(log n) because the heap needs to maintain its ordering property. Peek is O(1). Priority queues are used in Dijkstra's algorithm, task scheduling, merge K sorted lists, and finding the Kth largest element.

#### Q13: How do you find the Kth largest element using a min-heap?

Maintain a min-heap of size K. Walk through the array — if the heap has fewer than K elements, add the current one. Otherwise, if the current element is larger than the heap's minimum, remove the minimum and add the current element. At the end, the heap's minimum is the Kth largest.

```kotlin
fun findKthLargest(nums: IntArray, k: Int): Int {
    val minHeap = PriorityQueue<Int>()
    for (num in nums) {
        minHeap.add(num)
        if (minHeap.size > k) {
            minHeap.poll()
        }
    }
    return minHeap.peek()
}
```

Time: O(n log k), Space: O(k). This is more efficient than sorting the entire array (O(n log n)) when k is much smaller than n. An alternative approach is Quickselect which gives O(n) average time but O(n^2) worst case.

#### Q14: How do you merge K sorted lists using a priority queue?

Put the head node of each list into a min-heap. Poll the smallest, add it to the result, and push that node's next element into the heap. Repeat until the heap is empty.

```kotlin
fun mergeKLists(lists: List<ListNode?>): ListNode? {
    val heap = PriorityQueue<ListNode>(compareBy { it.value })
    for (list in lists) {
        list?.let { heap.add(it) }
    }
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

Time: O(n log k) where n is total number of nodes and k is the number of lists. Space: O(k) for the heap. The heap always has at most k elements, so each insertion and removal is O(log k).

#### Q15: How do you solve the Sliding Window Maximum problem?

Use a deque that stores indices. Maintain a monotonic decreasing deque — when adding a new element, remove all indices from the back whose values are smaller than the current element. The front of the deque always has the index of the maximum in the current window. Remove the front if it's outside the window.

```kotlin
fun maxSlidingWindow(nums: IntArray, k: Int): IntArray {
    val deque = ArrayDeque<Int>()
    val result = IntArray(nums.size - k + 1)
    for (i in nums.indices) {
        // Remove indices outside the window
        if (deque.isNotEmpty() && deque.first() <= i - k) {
            deque.removeFirst()
        }
        // Remove smaller elements from the back
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

Time: O(n), Space: O(k). Each element is added and removed from the deque at most once. The brute force approach is O(nk) — comparing every element in every window. This deque approach reduces it to linear time by tracking only useful candidates for the maximum.

#### Q16: When would you choose a stack over a queue, and vice versa?

Use a stack when you need to process the most recent element first — undo operations, matching brackets, DFS traversal, backtracking, and expression evaluation. Use a queue when you need to process elements in the order they arrived — BFS traversal, task scheduling, message processing, and buffering. Use a priority queue when processing order depends on a value, not arrival time — Dijkstra's shortest path, event-driven simulation, or top-K problems. Use a deque when you need efficient operations on both ends — sliding window problems or palindrome checking.

### Common Follow-ups

- How would you implement a circular queue with a fixed-size array?
- Can you solve valid parentheses with more than three bracket types?
- How do you find the maximum element in a stack in O(1) time?
- What is the time complexity of building a heap from an unsorted array? Why is it O(n) and not O(n log n)?
- How would you implement a stack that supports push, pop, and getMedian?
- Can you use a monotonic stack to solve the trapping rain water problem?
- How does the largest rectangle in histogram problem relate to the maximal rectangle in a binary matrix?
- What happens if you need the Kth smallest instead of Kth largest — how does the heap approach change?
