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

## `const val` vs `val`

This is one of the simplest optimizations in Kotlin and one that many developers miss. A `val` at the top level or inside a companion object is a runtime constant — the Kotlin compiler generates a backing field, a getter method, and initializes the value when the class loads. A `const val` is a compile-time constant — the compiler inlines the value directly at every call site during compilation. No field, no getter, no class loading dependency.

```kotlin
class AnimationConfig {
    companion object {
        val DURATION_MS = 300L          // runtime: getter + field access
        const val FRAME_BUDGET_MS = 16L // compile-time: inlined as literal 16L
    }
}
```

In the bytecode, every reference to `DURATION_MS` compiles to `AnimationConfig.Companion.getDURATION_MS()` — a static method call that reads a field. Every reference to `FRAME_BUDGET_MS` compiles to the literal `16L` at the call site, as if you'd typed the number directly. The difference is a method call plus a field read versus a constant embedded in the instruction stream. For a single access this is trivial, but inside a rendering loop that checks `FRAME_BUDGET_MS` every frame, eliminating the method call and field read is free performance.

The restriction is that `const val` only works with primitives and `String`. You can't use it for computed values or object references. But for numeric thresholds, string keys, capacity hints, and configuration constants — use `const val`. There's zero downside and the compiler does less work at runtime.

## Inline Functions and Lambda Allocation

Every time you pass a lambda to a higher-order function in Kotlin, the compiler generates an anonymous class for that lambda. If the function is called in a loop or a hot path, you're allocating a new object on every invocation. The `inline` keyword eliminates this entirely — the compiler copies the function body and the lambda body directly into the call site.

```kotlin
// Without inline: allocates a Function1 object per call
fun <T> measureTime(block: () -> T): T {
    val start = System.nanoTime()
    val result = block()
    println("Took ${System.nanoTime() - start}ns")
    return result
}

// With inline: zero allocation, code is pasted at the call site
inline fun <T> measureTimeInline(block: () -> T): T {
    val start = System.nanoTime()
    val result = block()
    println("Took ${System.nanoTime() - start}ns")
    return result
}
```

The standard library uses this aggressively — `let`, `run`, `apply`, `also`, `with`, `forEach`, `filter`, `map` are all inline. That's why chaining `list.filter { }.map { }` doesn't allocate two lambda objects. The lambda bodies get inlined directly into the calling function's bytecode.

But `inline` has constraints. If you need to store the lambda in a field or pass it to a non-inline function, you mark that parameter `noinline` — it opts that specific parameter out of inlining so it can be treated as a regular object. And `crossinline` exists for lambdas passed into a different execution context (like a `Runnable`), where non-local returns from the lambda would be unsafe. In practice, I use `inline` on any small higher-order function that's called frequently, and I reach for `noinline`/`crossinline` only when the compiler tells me to.

## Primitive Arrays and Autoboxing

Kotlin does a great job hiding the distinction between primitive types and their boxed wrappers. You write `Int` and the compiler decides whether it becomes a JVM `int` or a `java.lang.Integer`. Most of the time, this is fine. But with arrays and collections, the distinction matters more than you'd think.

`IntArray` compiles to a JVM `int[]` — a contiguous block of raw 32-bit integers in memory. `Array<Int>` compiles to `Integer[]` — an array of object references, each pointing to a boxed `Integer` on the heap. The difference in memory is significant: an `IntArray` of 1,000 elements uses roughly 4 KB (4 bytes per int). An `Array<Int>` of 1,000 elements uses roughly 20 KB — each `Integer` object has a 16-byte header plus 4 bytes of payload, and the array stores 8-byte references to each one.

```kotlin
// 4 KB, contiguous memory, cache-friendly
val pixelValues = IntArray(1000)

// ~20 KB, scattered heap objects, cache-unfriendly
val pixelValuesBoxed = Array<Int>(1000) { 0 }
```

The same applies to `FloatArray` vs `List<Float>`, `LongArray` vs `List<Long>`, and so on. `List<Int>` internally stores boxed `Integer` objects because JVM generics require reference types. Every time you add an `Int` to a `MutableList<Int>`, the runtime boxes it into an `Integer`. Every time you read one out, it unboxes. In a tight loop processing thousands of values — pixel buffers, audio samples, sensor data — this boxing overhead is measurable.

This is exactly why Compose's internal `Matrix` class uses `FloatArray` for its 16 elements rather than `List<Float>`. And why bitmap processing code should always work with `IntArray` for pixel data. The memory layout matters for CPU cache performance — sequential access over a contiguous `int[]` is dramatically faster than chasing pointers to scattered `Integer` objects on the heap.

For your typical `List<User>` or `List<Order>` in app-level code? Stick with `List`. The objects are already on the heap regardless. But any time you're working with large collections of numbers, prefer the primitive array variants.

## StringBuilder and String Concatenation

Kotlin string templates are fantastic for readability, and for most code they're perfectly fine. The compiler is smart enough to optimize simple concatenations. But there's a specific pattern where string handling becomes expensive: building strings inside loops.

```kotlin
// Allocates a new String on every iteration
fun buildReport(transactions: List<Transaction>): String {
    var report = ""
    for (t in transactions) {
        report += "${t.date}: ${t.description} — $${t.amount}\n"
    }
    return report
}
```

Each `+=` allocates a new `String` object, copies all the existing characters into it, then appends the new content. For 100 transactions, you're allocating 100 strings of increasing size. The total work is proportional to the square of the number of items — O(n²) in memory copies. For 1,000 transactions, this starts showing up in profiling.

The fix is `StringBuilder`, and Kotlin provides a clean `buildString` function for it:

```kotlin
fun buildReport(transactions: List<Transaction>): String = buildString {
    for (t in transactions) {
        append(t.date).append(": ").append(t.description)
        append(" — $").append(t.amount).appendLine()
    }
}
```

`buildString` creates a `StringBuilder` internally, passes it to the lambda, and calls `toString()` at the end. One allocation for the underlying buffer, amortized growth, no intermediate strings. For the 1,000-transaction case, this is the difference between allocating 1,000 increasingly large strings and allocating one buffer that grows a few times.

Outside of loops, though, string templates are fine. `"User ${user.name} logged in at ${timestamp}"` compiles to efficient concatenation. The compiler handles a few concatenations well. It's the loop pattern — repeated `+=` — that kills you.

## Array Bounds Check Elimination

Here's something most Kotlin developers never think about: every time you access an array by index, ART generates extra machine instructions to verify the index is within bounds. If the index is invalid, it throws `ArrayIndexOutOfBoundsException`. This is a safety feature — but it comes at a cost, and that cost multiplies in tight loops.

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

That one `if (v.size < 16) return false` line — which will never actually trigger because the array is always 16 elements — gives the compiler enough information to eliminate all 16 individual bounds checks. The function drops from 136 instructions to 60. Same exact behavior, 55% fewer instructions, because we helped the compiler reason about the code. This matters in Compose because matrix operations run many times per frame during layout and drawing. A function like `isIdentity()` might get called hundreds of times in a single frame when the framework is deciding which components need to be redrawn.

For your app's business logic? This doesn't matter. But if you're writing a custom `LazyColumn` item animator or a canvas-based drawing component that operates on arrays in a per-frame loop, it's worth knowing about.

## The Branchless Trick

This one genuinely surprised me. Romain Guy showed that in certain performance-critical conditions, replacing the logical `&&` operator with a bitwise `and` can eliminate branch misprediction penalties. The idea is simple: `&&` short-circuits — if the left side is false, the right side never executes. This requires a branch instruction. A bitwise `and` evaluates both sides unconditionally, which is branchless.

```kotlin
// Branching version — each && is a potential branch misprediction
fun isPixelInRange(r: Int, g: Int, b: Int): Boolean {
    return r > 100 && r < 200 && g > 50 && g < 150 && b > 30 && b < 120
}

// Branchless version — one character change per condition
fun isPixelInRange(r: Int, g: Int, b: Int): Boolean {
    return (r > 100) and (r < 200) and (g > 50) and (g < 150) and (b > 30) and (b < 120)
}
```

The difference is one character per condition — `&&` becomes `and`. But on a modern CPU processing millions of pixels, the branchless version can deliver meaningful speedups because it avoids branch prediction failures. Branch predictors work by guessing which path the code will take; when the data is unpredictable (like pixel values in a natural image), those guesses are often wrong, and the pipeline stall penalty adds up.

When this matters: hot inner loops processing large datasets where the branch condition is unpredictable. Bitmap processing, particle systems, audio sample processing, Compose's rendering pipeline. For a `when` expression deciding which screen to navigate to, this optimization is pure noise.

## Real-World Examples

These optimizations aren't academic exercises. They show up in real Android codebases where performance is measured per-frame.

### Compose's Rendering Pipeline

Compose's layout phase walks the entire UI tree every frame, measuring and placing nodes. Internally, the framework uses `IntArray`-backed structures for offset calculations, `FloatArray` for matrix transforms, and `inline` modifier functions to avoid lambda allocation during the measure-layout-draw cycle. Romain Guy's bounds check elimination was applied directly to Compose's `Matrix` and vector math code because these functions execute hundreds of times per frame. A 55% instruction reduction on a function called 300 times per frame at 120 Hz is real savings — that's roughly 36,000 fewer instructions per second.

### Bitmap Processing

Loading and transforming images on Android means working with pixel buffers. A 1080p image has roughly 2 million pixels. If you're applying a color filter, each pixel needs to be read, transformed, and written back. Using `IntArray` instead of `List<Int>` for the pixel buffer avoids 2 million boxing operations. Using branchless `and` instead of `&&` for range checks across RGB channels avoids 6 million potential branch mispredictions. These aren't theoretical — image loading libraries like Coil and Glide use primitive arrays and manual loops for exactly this reason.

### RecyclerView DiffUtil

`DiffUtil.calculateDiff()` compares old and new lists to produce the minimal set of insert/remove/move operations. For large lists — 5,000+ items — the algorithm runs O(n) comparisons. If your `areItemsTheSame` and `areContentsTheSame` callbacks allocate objects (boxing IDs from `Long` to `Long?`, creating intermediate strings for comparison), the GC pressure from thousands of short-lived allocations during a single diff can cause frame drops. Using primitive comparisons and avoiding unnecessary object creation in these callbacks is one of those cases where micro-optimization has visible impact on scroll performance.

## When It Matters vs Premature Optimization

Here's the reframe: **micro-optimization isn't about knowing tricks — it's about knowing when tricks are relevant.** The deciding factor is **frequency × data size.** If code runs once per user action on a handful of items, readability wins unconditionally. If code runs 120 times per second on thousands of elements, every allocation and branch counts.

I think about it in three tiers. The first tier is **hot-path library code** — Compose internals, image processing, audio rendering, custom layout algorithms. This is Romain Guy's context. Code here runs every frame, often on large data. Every optimization is worth considering, and the readability cost is acceptable because library code has different standards than app code.

The second tier is **performance-sensitive app code** — RecyclerView DiffUtil callbacks, search filtering on large lists, data transformation pipelines, animation calculations. Here, you profile first and optimize second. Use `IntArray` over `List<Int>` when you're processing thousands of items. Use `buildString` when concatenating in a loop. Use `const val` for constants referenced in hot paths. These are low-cost, high-clarity optimizations that don't hurt readability.

The third tier is **everything else** — your `LoginRepository`, your settings screen, your one-time initialization code. Optimize for readability. Use `List<Int>` because it has nicer APIs. Use string templates because they read well. Use `val` for constants that are only referenced during setup. The runtime cost is invisible compared to network calls, disk I/O, and the user's reaction time.

Romain Guy himself is transparent about this boundary. His posts include comments like "Does this matter? No idea, I have not benchmarked it. But it's neat." He works on Compose — library code invoked millions of times. The same techniques applied to app-level code would be premature optimization. Knowing the difference between his context and yours is the actual skill.

My rule is simple: if you can't demonstrate the performance difference with a profiler or benchmark, keep the readable version. If you can demonstrate it, document why you're using the less readable version with a comment. Future you — or your teammate — will thank you for explaining why there's a seemingly useless `if (array.size < 16) return false` at the top of a function.

The engineers who actually matter in performance work aren't the ones who memorize tricks. They're the ones who know where to look, when to care, and how to measure.

Thanks for reading!
