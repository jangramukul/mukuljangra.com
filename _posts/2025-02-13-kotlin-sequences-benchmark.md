---
title: Should You Use Kotlin Sequences? The Benchmark Says No
layout: post
categories: post
tags:
  - Kotlin
  - Performance
---

I've been suggesting `asSequence()` in code reviews for years. It was one of those automatic comments — see a `filter` followed by a `map` on a list, drop the suggestion: "Hey, use a sequence here to avoid intermediate collections." I was so confident in this advice that I never actually measured it. I just took the theory at face value: sequences process elements lazily one at a time, no intermediate lists, therefore faster. It made perfect logical sense.

Then Chris Banes published his benchmark results. And I owe my team an apology.

## The Common Belief

The pitch for Kotlin sequences goes something like this. When you chain operations on a regular `List` — say `filter`, then `map`, then `take` — each operation creates a new intermediate list. For a list of 1,000 items, `filter` creates a new list, `map` creates another new list, and `take` creates yet another. Three allocations, three full iterations. Sequences, on the other hand, process elements lazily. Instead of completing each operation for all elements before moving to the next, a sequence processes each element through the entire chain before touching the next element. No intermediate collections. Less memory pressure. Faster.

That's the theory. I believed it. Most Kotlin guides repeat it. The official documentation even hints at it by recommending sequences for "large collections with multiple processing steps." But theory without measurement is just a story you tell yourself.

## What the Benchmark Actually Shows

Chris Banes used `kotlinx-benchmark` — the standard JVM microbenchmarking framework — to test common collection chains. The setup was straightforward: take a list of items, run `filter` + `map` chains, and compare `List`, `Sequence`, `Flow`, and `ImmutableArray` (from the Pods4k library). The results were surprising across the board.

For simple chains (`filter` + `map`) on 100 items, sequences were **9% slower** than plain list operations. Not faster. Slower. For more complex chains with multiple intermediate steps, the gap widened — sequences came in at roughly **45% slower** than the list equivalent. This isn't a marginal difference. This is "your optimization is actively hurting performance" territory.

Here's a simplified version of the kind of chain being tested:

```kotlin
// Plain List approach
fun processOrders(orders: List<Order>): List<OrderSummary> {
    return orders
        .filter { it.status == Status.COMPLETED }
        .map { it.toSummary() }
        .sortedBy { it.totalAmount }
}

// Sequence approach — commonly suggested as "faster"
fun processOrdersSequence(orders: List<Order>): List<OrderSummary> {
    return orders.asSequence()
        .filter { it.status == Status.COMPLETED }
        .map { it.toSummary() }
        .sortedBy { it.totalAmount }
        .toList()  // terminal operation forces evaluation
}
```

The list version won. Not by a hair — by a measurable, reproducible margin.

## Why Sequences Lose

The explanation makes sense once you think about it at the CPU level rather than the allocation level. The performance story for sequences vs lists comes down to two competing costs: **allocation overhead** (favors sequences) versus **function call overhead** (favors lists).

List operations work in batches. When you call `filter` on a list, the JVM runs a tight loop over the backing array, checking the predicate for each element and adding matches to a new `ArrayList`. This is cache-friendly. The CPU prefetcher loves sequential array access. The JIT compiler can inline the predicate and even vectorize parts of the loop. Each operation is one clean pass over contiguous memory.

Sequences work per-element. For each element, the sequence has to call through multiple layers of `Sequence` wrappers — each `filter` and `map` creates a new `Sequence` object that wraps the previous one. Processing a single element means calling through a chain of `hasNext()`/`next()` on nested iterators. That's virtual method dispatch on every element at every stage. The JIT can sometimes devirtualize these calls, but with deep chains, it often can't.

```kotlin
// What asSequence().filter().map() actually creates:
// TransformingSequence(
//     FilteringSequence(
//         Sequence(originalList.iterator()),
//         predicate = { ... }
//     ),
//     transform = { ... }
// )
// Each element traverses this entire wrapper chain
```

For small to medium collections — which is what most Android code deals with — the function call overhead per element dwarfs the savings from avoiding intermediate allocations. The intermediate `ArrayList` that `filter` creates is cheap. It's backed by an array, it grows amortically, and the GC handles short-lived small objects efficiently. You're trading cheap array allocations for expensive per-element virtual dispatch chains.

## The Pods4k Surprise

One of the more interesting results from Chris's benchmark was that `ImmutableArray` from the Pods4k library outperformed everything — lists, sequences, and even Flow. Pods4k's `ImmutableArray` is backed by a regular JVM array (no boxing, no `ArrayList` overhead) with inline extension functions for `filter`, `map`, and friends. Because the operations are inline and the backing store is a primitive array, the JIT compiler has maximum room to optimize. No virtual dispatch, no iterator protocol, just straight loops over arrays.

This is a useful lesson beyond just "use this library." It tells you that the bottleneck in collection processing is rarely memory allocation — it's the abstraction overhead in how you iterate. The closer you stay to raw array loops, the faster you go.

## When Sequences Actually Win

I'm not saying sequences are useless. There are specific scenarios where they genuinely make sense, and the distinction matters.

**Very large datasets.** If you're processing 100K+ items and your filter is very selective (e.g., keeping only 1% of elements), the intermediate allocation savings become significant. A `filter` on 100K items that produces a 1K-item result avoids allocating a 100K-item intermediate list. At this scale, the allocation cost starts to outweigh the function call overhead. But even here, Chris's benchmarks showed the gap narrowing — lists are surprisingly competitive even at scale because of how well the JVM handles array operations.

**I/O-bound operations where laziness matters.** If you're reading lines from a file and processing them, sequences let you avoid loading the entire file into memory. The canonical example is `File.useLines { }`, which returns a sequence. Each line is read, processed, and discarded before the next one is read. No intermediate collection could give you this behavior because you genuinely don't want all the data in memory at once. This is the use case sequences were designed for — not "make my list chain 10% faster" but "process data that doesn't fit in memory."

**Short-circuit operations.** If your chain includes `first()`, `take()`, or `any()`, sequences avoid processing elements you don't need. Finding the first matching element in a sequence stops the entire chain once a match is found. With a list, `filter` processes every element before `first()` picks one from the result. For small collections this rarely matters, but for large ones with expensive predicates, the difference is real.

```kotlin
// Sequence genuinely wins here — stops after finding the first match
val firstHighValue = transactions.asSequence()
    .filter { it.amount > 10_000 }
    .map { it.toAuditEntry() }  // expensive transformation
    .first()

// List version: filters ALL transactions, maps ALL matches, then takes first
val firstHighValueList = transactions
    .filter { it.amount > 10_000 }
    .map { it.toAuditEntry() }
    .first()
```

## Flow Was Surprisingly Fast

Another unexpected result: `kotlinx.coroutines.flow.Flow` performed surprisingly well in the extreme-case benchmarks. For very large datasets with complex chains, Flow's performance was competitive with — and sometimes better than — sequences. This seems counterintuitive because Flow has coroutine suspension overhead. But Flow's implementation benefits from the same lazy evaluation as sequences while being more aggressively optimized by the Kotlin coroutines team for throughput scenarios.

I wouldn't recommend using Flow for synchronous collection processing in production code — that's not what it's for, and the API ergonomics are wrong for it. But it's a fascinating data point that shows how much implementation detail matters compared to theoretical algorithmic analysis.

## The Real Lesson

Here's the reframe that I keep coming back to: **intuition about performance is almost always wrong.** I had a clear mental model — fewer allocations equals faster code — and it was wrong because I was thinking at the wrong level of abstraction. I was thinking about heap allocations while the JVM was thinking about CPU cache lines, branch prediction, and method inlining.

This applies far beyond sequences vs lists. Every time I've been sure that a certain approach is "obviously faster," measuring has either confirmed it by a smaller margin than I expected or outright disproven it. The JVM is aggressively optimized for common patterns. Short-lived small objects are nearly free in modern GCs. Tight loops over arrays are heavily optimized by the JIT. Working against these strengths — by adding layers of abstraction to "avoid allocations" — can easily make things worse.

If you're going to optimize collection processing in your Android app, here's my honest take on priority order: first, reduce the number of items you're processing (filter early). Second, avoid unnecessary transformations (don't `map` if you can just read the field). Third, profile before switching to sequences. And fourth, if you're processing truly large datasets synchronously on Android, you probably have a bigger architectural problem than list vs sequence performance.

I've stopped leaving automatic `asSequence()` comments in code reviews. Now I only suggest it when I see a genuine laziness need — I/O processing, short-circuit operations, or datasets that are genuinely too large for intermediate collections. For the typical `filter` + `map` chain on a few hundred items? Just use the list. It's simpler, it's faster, and you don't have to explain to your team why you're adding complexity for negative performance gains.

Thanks for reading!
