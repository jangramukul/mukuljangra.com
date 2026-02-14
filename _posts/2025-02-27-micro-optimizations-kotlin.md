---
title: Micro-Optimizations in Kotlin — What Actually Matters
layout: post
categories: post
tags:
  - Kotlin
  - Performance
---

I used to think micro-optimizations were a waste of time. Profile first, optimize the hot path, don't prematurely optimize — that's the standard advice, and it's mostly right. For business logic that runs once when a button is tapped, shaving a few nanoseconds off an operation is meaningless. Nobody's user experience improved because you replaced `forEach` with a manual `for` loop in your login flow.

But then I started paying closer attention to how Romain Guy — who works on the Android graphics team at Google — approaches performance in Jetpack Compose. He's been publishing a series of micro-optimization posts that changed how I think about this. His key insight is this: when you're writing library code that gets invoked many times per frame, even micro-optimizations can make a meaningful difference. The effects compound. And some of the techniques he demonstrates are genuinely surprising — like getting a 1.7x speedup from changing a single character in your code.

The lesson isn't "micro-optimize everything." The lesson is knowing which micro-optimizations matter, where they matter, and when the readability cost isn't worth it.

## Array Bounds Check Elimination

Here's something most Kotlin developers never think about: every time you access an array by index, the Android Runtime (ART) generates extra machine instructions to verify the index is within bounds. If the index is invalid, it throws `ArrayIndexOutOfBoundsException`. This is a great safety feature — but it comes at a cost, and that cost multiplies in tight loops.

Romain Guy demonstrated this with Compose's `Matrix` class, which wraps a `FloatArray` of 16 elements. A simple `isIdentity()` function that checks all 16 values generates 136 ARM64 instructions because each array access includes bounds checking code plus an epilogue with 16 separate `pThrowArrayBounds` calls. The compiler can't prove the array is always size 16, so it generates checks for every single access.

The fix? Add a single bounds check at the top of the function:

```kotlin
fun Matrix.isIdentity(): Boolean {
    val v = values
    if (v.size < 16) return false
    return v[0] == 1f &&
        v[1] == 0f &&
        v[2] == 0f &&
        v[3] == 0f &&
        v[4] == 0f &&
        v[5] == 1f &&
        v[6] == 0f &&
        v[7] == 0f &&
        v[8] == 0f &&
        v[9] == 0f &&
        v[10] == 1f &&
        v[11] == 0f &&
        v[12] == 0f &&
        v[13] == 0f &&
        v[14] == 0f &&
        v[15] == 1f
}
```

That one `if (v.size < 16) return false` line — which will never actually trigger because the array is always 16 elements — gives the compiler enough information to eliminate all 16 individual bounds checks. The function drops from 136 instructions to 60. Same exact behavior, 55% fewer instructions, because we helped the compiler reason about the code.

This matters in Compose because matrix operations run many times per frame during layout and drawing. A function like `isIdentity()` might get called hundreds of times in a single frame when the framework is deciding which components need to be redrawn. At that frequency, halving the instruction count is real performance.

For your app's business logic? This doesn't matter. Don't add bounds check hints to your repository classes. But if you're writing a custom `LazyColumn` item animator or a canvas-based drawing component that operates on arrays in a per-frame loop, it's worth knowing about.

## The Branchless Trick: && vs Bitwise And

This one genuinely surprised me. Romain Guy showed that in certain performance-critical conditions, replacing the logical `&&` operator with a bitwise `and` can eliminate branch misprediction penalties. The idea is simple: `&&` short-circuits — if the left side is false, the right side never executes. This requires a branch instruction. A bitwise `and` evaluates both sides unconditionally, which is branchless.

Consider a pixel classification function in an image processing pipeline:

```kotlin
// Branching version
fun isPixelInRange(r: Int, g: Int, b: Int): Boolean {
    return r > 100 && r < 200 && g > 50 && g < 150 && b > 30 && b < 120
}

// Branchless version
fun isPixelInRange(r: Int, g: Int, b: Int): Boolean {
    return (r > 100) and (r < 200) and (g > 50) and (g < 150) and (b > 30) and (b < 120)
}
```

The difference is one character per condition — `&&` becomes `and`. But on a modern CPU processing millions of pixels, the branchless version can deliver meaningful speedups because it avoids branch prediction failures. Branch predictors work by guessing which path the code will take; when the data is unpredictable (like pixel values in a natural image), those guesses are often wrong, and the pipeline stall penalty adds up.

I want to be clear about when this matters: hot inner loops processing large datasets where the branch condition is unpredictable. Bitmap processing, particle systems, audio sample processing, Compose's rendering pipeline. For a `when` expression deciding which screen to navigate to, this optimization is pure noise. The readability cost of `and` over `&&` isn't huge, but it's unnecessary unless you've profiled and identified the branch as a bottleneck.

## Intermediate Collection Avoidance

Jake Wharton wrote about this one, and it's probably the micro-optimization that affects the most real-world Android code. Every standard library collection operation — `map`, `filter`, `flatMap` — creates a new intermediate list. Chain three of them together and you've allocated three lists to get your final result:

```kotlin
// Three intermediate lists allocated
val activeUsernames = users
    .filter { it.isActive }          // List 1
    .map { it.username }             // List 2
    .filter { it.isNotBlank() }      // List 3
```

For a list of 50 users, nobody cares. For a list of 10,000 items being processed in a RecyclerView's `DiffUtil` callback, those allocations trigger GC pressure. The standard advice is "use Sequences" — they're lazy, they process one element at a time through the entire chain, and they allocate only one final collection:

```kotlin
// Single output list, lazy processing
val activeUsernames = users.asSequence()
    .filter { it.isActive }
    .map { it.username }
    .filter { it.isNotBlank() }
    .toList()
```

But here's where things get interesting — and where Chris Banes' benchmarking work throws a wrench into the simple narrative.

## Sequences Are Not Always Faster

Chris Banes published benchmarks comparing Sequence vs List performance for common collection operations, and the results were surprising. For many common operations, **Sequences were 9-45% slower than plain lists.** Not faster. Slower.

Why? Sequences add overhead per element. Each element goes through lambda invocations and iterator machinery. For small to medium collections (the majority of what we deal with in Android apps), this per-element overhead exceeds the cost of allocating intermediate lists. The JVM is extremely good at allocating and collecting short-lived objects — young generation garbage collection is fast and cheap. So the "allocation savings" of sequences often don't outweigh the per-element processing overhead.

This is the reframe moment: **the optimization that seems obviously correct based on theory (fewer allocations) can be wrong in practice (slower per-element processing).** You need to measure, not assume.

When do sequences actually win? When the collection is large (thousands of elements), the chain is long (3+ operations), or you can short-circuit with `first()` or `take()`. When the intermediate collections would be large enough that allocation and GC costs dominate. In those specific cases, sequences are measurably faster. But reaching for `.asSequence()` reflexively on every collection chain is cargo cult optimization — you're adding complexity without guaranteed benefit.

## Where Micro-Optimizations Do Matter

After studying Romain Guy's work on Compose and similar library-level code, I've developed a mental model for when to care about micro-optimizations. The deciding factor is **frequency × data size.**

**Hot loops in Compose's rendering pipeline.** Compose's layout and drawing phases run every frame. Code paths in measure, layout, and draw modifiers execute at 60-120 Hz. If your custom `Modifier.drawBehind` processes a large path or your custom layout measures 50 children, the per-operation cost matters because it multiplies by the frame rate. Romain Guy's bounds check elimination and branchless optimizations were applied specifically to Compose's internal code for this reason.

**Collection operations on large datasets.** If you're processing a list of 10,000+ items — perhaps in a search operation, a diff calculation, or a data transformation pipeline — then avoiding intermediate allocations and reducing per-element overhead is measurable. This is where manual `for` loops with pre-allocated result lists outperform functional chains.

**Bitmap and image processing.** Processing every pixel of a 1080p image means 2 million iterations. At that scale, a single extra branch per iteration adds up. This is the domain where branchless techniques, loop unrolling, and avoiding object allocations per pixel are standard practice.

## Where They Don't Matter

**Business logic.** Your `LoginRepository.authenticate()` runs once when the user taps a button. Whether it takes 2 microseconds or 20 microseconds is invisible — the network call it triggers takes 200 milliseconds. Optimize for readability here.

**One-time initialization.** App startup, dependency injection, configuration parsing — these run once. Even if you made them 10x faster, the user wouldn't notice. Focus on lazy initialization and deferring work instead.

**Infrequent UI updates.** A settings screen that updates when the user toggles a switch doesn't need branchless conditions or pre-allocated arrays. The update happens once, and the next one won't happen for seconds or minutes.

## The Readability Tradeoff

Every micro-optimization has a readability cost. Bounds check hints add seemingly dead code. Bitwise `and` instead of `&&` is unfamiliar to most Kotlin developers. Manual `for` loops with index tracking are more verbose than `filter`/`map` chains. Pre-allocated `IntArray` instead of `List<Int>` loses generic collection APIs.

Romain Guy himself acknowledges this. His posts include comments like "Does this matter? No idea, I have not benchmarked it. But it's neat." He's transparent about the line between educational exploration and practical recommendation. His micro-optimization series exists because he works on Compose — library code that gets invoked millions of times. The same techniques applied to app-level code would be premature optimization.

My rule is simple: if you can't demonstrate the performance difference with a profiler or benchmark, keep the readable version. If you can demonstrate it, document why you're using the less readable version with a comment. Future you — or your teammate — will thank you for explaining why there's a seemingly useless `if (array.size < 16) return false` at the top of a function.

The engineers who actually matter in performance work aren't the ones who memorize tricks. They're the ones who know where to look, when to care, and how to measure. Micro-optimizations are a tool in the toolbox, not a way of life.

Thanks for reading!
