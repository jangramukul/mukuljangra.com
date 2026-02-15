---
title: Should You Use Kotlin Sequences? The Benchmark Says No
layout: post
sequence: 60
categories: post
tags:
  - Kotlin
  - Performance
---

I've been suggesting `asSequence()` in code reviews for years. It was one of those automatic comments — see a `filter` followed by a `map` on a list, drop the suggestion: "Hey, use a sequence here to avoid intermediate collections." I was so confident in this advice that I never actually measured it. I just took the theory at face value: sequences process elements lazily one at a time, no intermediate lists, therefore faster. IntelliJ even nudges you toward it with a little inspection hint. It made perfect logical sense.

Then Chris Banes published his benchmark results. And I owe my team an apology. But the story doesn't end at "sequences are slow" — it turns out sequences are a genuinely powerful tool, just not for the reason most of us reach for them.

## How Iterables and Sequences Actually Work

Before we get to the numbers, it's worth understanding what happens under the hood when you chain operations on a `List` versus a `Sequence`. They look identical in code but execute in fundamentally different ways.

When you call `filter` on an `Iterable` (which `List` implements), Kotlin's standard library runs a tight loop over the backing array, checks the predicate for every element, and dumps matching elements into a brand new `ArrayList`. Then `map` takes that new list, iterates over it again, and produces yet another `ArrayList` with the transformed results. Each operation runs to completion before the next one starts. This is **batch processing** — the entire collection flows through one operation, producing an intermediate result, then the entire intermediate result flows through the next.

```kotlin
// What Iterable.filter actually does under the hood
public inline fun <T> Iterable<T>.filter(
    predicate: (T) -> Boolean
): List<T> {
    return filterTo(ArrayList<T>(), predicate)
}
// A new ArrayList is allocated and filled for every chained operation
```

Sequences flip this model. When you call `filter` on a `Sequence`, nothing happens immediately. Instead, it returns a `FilteringSequence` — a wrapper that stores a reference to the upstream sequence and the predicate. Call `map` on that, and you get a `TransformingSequence` wrapping the `FilteringSequence`. These wrappers form a chain, and no element is actually processed until you invoke a **terminal operation** like `toList()`, `first()`, or `count()`. At that point, elements are pulled through the chain one at a time — each element passes through filter, then map, then the next element. This is **pipeline processing**.

```kotlin
// What asSequence().filter().map() actually builds:
// TransformingSequence(
//     FilteringSequence(
//         Sequence { originalList.iterator() },
//         predicate = { it.status == Status.COMPLETED }
//     ),
//     transform = { it.toSummary() }
// )
// Nothing executes until a terminal operation pulls elements through
```

This wrapper chain architecture is important. Each intermediate operation creates a lightweight `Sequence` object — `FilteringSequence`, `TransformingSequence`, `TakeSequence`, `DropSequence` — and they all implement `Sequence.iterator()` by delegating to the upstream sequence's iterator. Processing a single element means calling `hasNext()` and `next()` through every layer of the chain. For a three-operation chain, that's at minimum six virtual method calls per element.

## What the Benchmark Actually Shows

Chris Banes used `kotlinx-benchmark` to test exactly the kind of chain we all write daily — `filter` + `map` on a list of 100 items, the classic database-to-UI-model transformation. He compared `List`, `Sequence`, `Flow`, and `ImmutableArray` from the Pods4k library.

For simple chains (`filter` + `map`) on 100 items, sequences were **9% slower** than plain list operations. Not faster. Slower. He then pushed it further with an extreme chain — four rounds of `filter` + `map`, creating 7 intermediate collections with the list approach. Surely sequences would pull ahead with that many avoided allocations? No. Sequences came in at roughly **45% slower** than the list equivalent. This isn't a marginal difference. This is "your optimization is actively hurting performance" territory.

```kotlin
// Plain List approach — Chris's benchmark pattern
fun processOrders(orders: List<Order>): List<OrderSummary> {
    return orders
        .filter { it.status == Status.COMPLETED }
        .map { it.toSummary() }
}

// Sequence approach — commonly suggested as "faster"
fun processOrdersSequence(orders: List<Order>): List<OrderSummary> {
    return orders.asSequence()
        .filter { it.status == Status.COMPLETED }
        .map { it.toSummary() }
        .toList()
}
```

Even at 100,000 items, the story didn't change in sequences' favor. Lists produced 623 ops/sec versus sequences at 245 ops/sec. The gap actually widened at scale, which breaks the common intuition that sequences "win for large collections."

The performance story comes down to two competing costs: **allocation overhead** (favors sequences) versus **per-element function call overhead** (favors lists). List operations run batch loops over contiguous arrays. The CPU prefetcher loves sequential array access. The JIT compiler can inline the predicate, and each operation is one clean pass over contiguous memory. Sequences pay virtual method dispatch on every element at every stage in the wrapper chain. For the vast majority of collection sizes and chain lengths we encounter in real Android code, the dispatch overhead dwarfs the allocation savings.

## The Pods4k Surprise

One of the most interesting results from Chris's benchmark was that `ImmutableArray` from the [Pods4k](https://github.com/daniel-rusu/pods4k) library outperformed everything — lists, sequences, and even Flow. On the extreme chain test, `ImmutableArray` hit 772,859 ops/sec versus List at 641,356 and Sequence at 344,254.

Pods4k's `ImmutableArray` is backed by a regular JVM array with inline extension functions for `filter`, `map`, and friends. No boxing, no `ArrayList` overhead, no iterator protocol. Because the operations are inline and the backing store is a primitive array, the JIT compiler has maximum room to optimize — straight loops over arrays with zero virtual dispatch.

Here's the reframe I keep coming back to: **the bottleneck in collection processing is rarely memory allocation — it's the abstraction overhead in how you iterate.** I had a clear mental model — fewer allocations equals faster code — and it was wrong because I was thinking at the wrong level. I was thinking about heap allocations while the JVM was thinking about CPU cache lines, branch prediction, and method inlining. Short-lived small objects are nearly free in modern GCs. Working against that by adding layers of abstraction to "avoid allocations" can easily make things worse.

## generateSequence — Sequences That Create Data

Here's where sequences shift from "worse list replacement" to something genuinely useful. `generateSequence` produces elements by repeatedly applying a function to the previous element. The sequence is lazy and potentially infinite — it only computes elements as they're consumed, and it terminates when the generator function returns `null`.

This is powerful for modeling things that are naturally iterative. Pagination is the classic example — you keep fetching the next page until there's nothing left:

```kotlin
fun fetchAllUsers(api: UserApi): List<User> {
    return generateSequence(api.getFirstPage()) { currentPage ->
        if (currentPage.hasNext) api.getPage(currentPage.nextCursor)
        else null
    }.flatMap { it.users.asSequence() }
     .toList()
}
```

Tree traversal is another natural fit. Walking up a view hierarchy to find a parent of a specific type is something Android developers do regularly, and `generateSequence` makes it a one-liner:

```kotlin
fun View.findParent(predicate: (ViewParent) -> Boolean): ViewParent? {
    return generateSequence(parent) { it.parent }
        .firstOrNull(predicate)
}
```

No `while` loop, no mutable variable, no manual null checking. The sequence handles all of that. The Fibonacci sequence is the textbook example, but the real value is in these practical patterns where you're modeling a chain of dependent computations that terminates on some condition.

## The sequence { } Builder

The `sequence { }` builder with `yield` and `yieldAll` is even more expressive. It uses a restricted coroutine under the hood — the body of the lambda runs inside a `SequenceScope` that can suspend at each `yield` call. When you call `yield(value)`, the builder emits that value to the consumer and suspends execution until the next element is requested. It's not a full coroutine with dispatchers and structured concurrency — it's a simpler mechanism that the Kotlin compiler transforms into a state machine, similar to how `suspend` functions work but limited to sequence production.

```kotlin
fun processConfigFiles(directory: File): Sequence<ConfigEntry> = sequence {
    directory.listFiles()?.forEach { file ->
        if (file.extension == "json") {
            val entries = parseConfigFile(file)
            yieldAll(entries)
        } else if (file.isDirectory) {
            yieldAll(processConfigFiles(file)) // recursive traversal
        }
    }
}
```

The beauty here is that the file system traversal and parsing happen lazily. If the consumer only needs the first 5 config entries, only the files necessary to produce those 5 entries are read. `yieldAll` is particularly useful — it yields every element from another sequence, iterable, or iterator, which makes recursive and composite patterns clean.

I think this is the most underappreciated part of Kotlin sequences. The builder pattern turns complex, stateful iteration logic into linear, readable code. You write it like imperative code with `yield` calls sprinkled in, and the compiler handles the suspension mechanics.

## When Sequences Genuinely Win

Given the benchmarks, the natural question is: when should you actually use sequences? I've landed on four clear criteria.

**Short-circuit operations.** If your chain ends with `first()`, `take()`, `any()`, or `none()`, sequences avoid processing elements you don't need. Finding the first match in a sequence stops the entire pipeline. With a list, `filter` processes every element before `first()` picks one.

```kotlin
// Sequence wins — stops after finding the first match
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

**I/O-bound processing.** Reading lines from a file, iterating over database cursors, consuming paginated API responses — anywhere you don't want the entire dataset in memory at once. `File.useLines { }` returns a sequence for exactly this reason. This is the use case sequences were designed for — not "make my list chain faster" but "process data that doesn't fit in memory."

**Data generation.** `generateSequence` and the `sequence { }` builder are built for modeling iterative computations, tree traversals, paginated fetches, and recursive structures. These aren't performance optimizations — they're expressiveness gains. You couldn't do these cleanly with eager list operations at all.

**Very large datasets with selective filters.** If you're processing 100K+ items and your filter keeps less than 1% of elements, the avoided intermediate allocations become meaningful. But even here, Chris's benchmarks showed lists holding up surprisingly well. IMO, if you're processing collections that large synchronously on Android, you probably have a bigger architectural problem than list vs sequence performance.

## Sequences in Android — Real Use Cases

On Android specifically, I've found sequences earn their place in a handful of scenarios. File I/O processing is the most common — scanning a directory for specific files, parsing logs, or reading large CSVs. The `sequence { }` builder combined with `yield` makes lazy file traversal natural.

Cursor iteration is another one. If you're working with raw `ContentProvider` queries (media store, contacts), wrapping a `Cursor` in a sequence lets you process rows lazily without loading everything into a list:

```kotlin
fun ContentResolver.queryContacts(): Sequence<Contact> = sequence {
    val cursor = query(
        ContactsContract.Contacts.CONTENT_URI,
        arrayOf(ContactsContract.Contacts.DISPLAY_NAME),
        null, null, null
    )
    cursor?.use {
        while (it.moveToNext()) {
            yield(Contact(name = it.getString(0)))
        }
    }
}
```

Lazy pagination is the third. When loading paginated data from a remote API, `generateSequence` lets you model the "fetch next page until done" pattern without callbacks or manual state management. The key insight in all these cases is that you're not using sequences to make list chains faster — you're using them because the data genuinely shouldn't all be in memory at once, or because the generation logic is naturally iterative.

## What I Actually Changed

I've stopped leaving automatic `asSequence()` comments in code reviews. That was cargo cult optimization — repeating advice I'd absorbed without measuring. Now I only suggest sequences when I see a genuine laziness need: I/O processing, short-circuit operations with expensive predicates, data generation patterns, or datasets that are genuinely too large for intermediate collections.

For the typical `filter` + `map` chain on a few hundred items — which is 90% of the collection processing in any Android app — just use the list. It's simpler, it's measurably faster, and you don't have to explain to your team why you're adding complexity for negative performance gains. If you're going to optimize collection processing, profile first, reduce the number of items you process (filter early), avoid unnecessary transformations, and if you want maximum throughput, look into something like Pods4k's `ImmutableArray` before reaching for sequences.

Sequences are a great tool. They're just not an optimization for list chains. Once I stopped treating them as one and started using them for what they're actually good at — lazy evaluation, data generation, I/O streaming — they became far more valuable in my code.

Thanks for reading!
