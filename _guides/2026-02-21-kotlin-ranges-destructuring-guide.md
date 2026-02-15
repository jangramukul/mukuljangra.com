---
title: Kotlin Ranges, Progressions, and Destructuring Guide
layout: post
sequence: 87
categories: post
tags:
  - Kotlin
  - Android
---

Ranges and destructuring are two features I initially dismissed as syntactic sugar. When I first saw `for (i in 1..10)`, I thought it was just a shorter way to write a for loop — nice, but nothing that changes how I think about code. Same with destructuring. `val (name, age) = user` looked convenient but hardly revolutionary.

I was wrong about both. These aren't cosmetic improvements over Java equivalents. They change the vocabulary you use when expressing logic. Ranges turn containment checks, iterations, and boundary validations into declarative expressions that read like math. Destructuring eliminates the ceremony of pulling apart data structures, which is something you do dozens of times per day in real Android code. Together they make your intent visible in ways that `.get(0)`, `.get(1)` and manual index tracking never could.

## Ranges and Progressions

Kotlin's range operator `..` creates a closed (inclusive) range. `1..10` means 1 through 10, both endpoints included. For iterations where you don't want the last value — which is most index-based loops — you use `until` (or the newer `..<` operator) to create a half-open range. And for counting backwards, `downTo` gives you a descending range. These aren't special syntax hacks. They're actual infix functions that return typed range objects.

```kotlin
// Inclusive range: prints 1 through 10
for (i in 1..10) {
    print("$i ")
}

// Half-open range: iterates 0 through list.lastIndex
val tasks = listOf("Build", "Test", "Deploy", "Monitor")
for (i in 0 until tasks.size) {
    println("Step $i: ${tasks[i]}")
}

// Descending range with step
for (countdown in 10 downTo 1 step 2) {
    println("$countdown...")  // 10, 8, 6, 4, 2
}
```

But ranges aren't just for loops. They're backed by the `ClosedRange<T>` interface, which means they work with any `Comparable` type. `Char` ranges, `String` ranges, even `LocalDate` ranges. The `in` operator becomes a containment check — and this is where ranges start to feel genuinely powerful. Instead of writing `if (age >= 18 && age <= 65)`, you write `if (age in 18..65)`. Instead of checking a character against multiple conditions, you use `char in 'a'..'z'`.

```kotlin
fun validateUserInput(age: Int, initial: Char, joinDate: LocalDate): Boolean {
    val validAgeRange = 18..120
    val validLetters = 'A'..'Z'
    val activePeriod = LocalDate.of(2020, 1, 1)..LocalDate.now()

    return age in validAgeRange
        && initial in validLetters
        && joinDate in activePeriod
}
```

I use this pattern heavily in Android validation logic. The `in` check reads almost like a specification — "age must be in 18 to 120" — and the named range variables serve as documentation. You can glance at this code and immediately understand the business rules without parsing boolean algebra.

## Under the Hood — Zero-Cost Ranges

Here's the thing that surprised me when I first looked at the bytecode. When you write `for (i in 1..10)`, the Kotlin compiler doesn't actually create an `IntRange` object. It recognizes the pattern and compiles it to a simple `for (int i = 1; i <= 10; i++)` loop on the JVM. No allocation, no iterator, no virtual dispatch. The range expression is compiled away entirely. This is what the Kotlin team calls an "intrinsic" optimization — the compiler has special knowledge of range-based for loops and generates the most efficient bytecode possible.

This zero-cost property is why you should prefer `for (i in 0 until list.size)` over manually writing `var i = 0; while (i < list.size)`. They compile to identical bytecode, but the range version communicates intent more clearly. However — and this is important — the optimization only applies to for loops with literal or simple range expressions. If you store a range in a variable and then check containment against it, the compiler might allocate an `IntRange` object:

```kotlin
// Zero-cost: compiles to a simple counter loop
for (i in 1..1000) { /* no allocation */ }

// Zero-cost: compiler recognizes this pattern too
for (i in 0 until items.size) { /* no allocation */ }

// Potentially allocates: range stored in a variable
val range = computeRange()
if (x in range) { /* IntRange object exists here */ }
```

For most practical purposes, this distinction doesn't matter. An `IntRange` is tiny — two `Int` fields — and the JVM can often optimize it away through escape analysis. But if you're writing a hot loop in a performance-sensitive path like a custom `RecyclerView` layout manager or a bitmap processing pipeline, it's worth knowing. The standard library also gives you `list.indices` which returns an `IntRange` for the valid index range, and `forEachIndexed` for when you need both the index and the element. I tend to prefer `forEachIndexed` in most Android code because it's more expressive, though `for (i in list.indices)` is perfectly fine when you only need the index.

## Destructuring Declarations

Destructuring lets you unpack an object into multiple variables in a single declaration. The mechanism is straightforward: the compiler looks for `component1()`, `component2()`, `component3()`, etc. on the object. Data classes generate these automatically — which is why destructuring "just works" with them — but any class can support destructuring by defining `componentN()` operator functions.

```kotlin
data class PaymentResult(
    val transactionId: String,
    val amount: Double,
    val status: PaymentStatus,
    val timestamp: Instant
)

fun processPayment(result: PaymentResult) {
    val (txId, amount, status, timestamp) = result

    when (status) {
        PaymentStatus.SUCCESS -> logSuccess(txId, amount, timestamp)
        PaymentStatus.DECLINED -> retryPayment(txId)
        PaymentStatus.PENDING -> scheduleCheck(txId, timestamp)
    }
}
```

The `Pair` and `Triple` types support destructuring too, which makes them useful for returning multiple values from a function without creating a dedicated data class. I use `Pair` occasionally for intermediate computations, though for anything that crosses API boundaries or gets used in more than one place, a named data class is always better. Named fields beat positional `first`/`second` every time.

Where destructuring gets really interesting is with `Regex` match results. When a regex has groups, you can destructure the `MatchResult.destructured` property directly into named variables:

```kotlin
fun parseLogEntry(line: String): Triple<String, String, String>? {
    val pattern = Regex("""(\d{4}-\d{2}-\d{2}) (\w+): (.+)""")
    return pattern.matchEntire(line)?.destructured?.let { (date, level, message) ->
        Triple(date, level, message)
    }
}
```

For classes that aren't data classes, you define `componentN()` as operator extensions. I've used this to make Android `Rect` destructurable in projects where I'm doing a lot of layout math:

```kotlin
operator fun Rect.component1() = left
operator fun Rect.component2() = top
operator fun Rect.component3() = right
operator fun Rect.component4() = bottom

fun calculateOverlap(a: Rect, b: Rect) {
    val (aLeft, aTop, aRight, aBottom) = a
    // Now work with named values instead of a.left, a.top everywhere
}
```

## Destructuring in Lambdas

Destructuring isn't limited to `val` declarations. You can destructure directly in lambda parameters, and this is where it becomes genuinely transformative for day-to-day Android code. The most common case is iterating over maps — instead of working with `Map.Entry` objects and calling `.key` and `.value`, you destructure right in the lambda signature.

```kotlin
fun renderSettings(settings: Map<String, SettingValue>) {
    settings.forEach { (key, value) ->
        when (value) {
            is SettingValue.Toggle -> renderSwitch(key, value.enabled)
            is SettingValue.Choice -> renderDropdown(key, value.options)
            is SettingValue.Text -> renderInput(key, value.content)
        }
    }
}
```

Another pattern I reach for constantly is `withIndex()`, which wraps each element in an `IndexedValue` that you can destructure into index and element. This replaces the old Java pattern of maintaining a separate counter variable:

```kotlin
fun buildLeaderboard(players: List<Player>) {
    players.sortedByDescending { it.score }
        .withIndex()
        .forEach { (rank, player) ->
            println("#${rank + 1}: ${player.name} — ${player.score} pts")
        }
}
```

The `_` placeholder deserves special mention. When you destructure but don't need every component, use `_` for the ones you're ignoring. This isn't just a convention — the compiler actually skips calling the corresponding `componentN()` function for underscored positions. More importantly, it tells the reader "I intentionally don't need this value." That's a meaningful signal in a code review. When I see `val (_, email) = user`, I immediately know the author thought about the first component and deliberately chose not to use it, rather than simply forgetting it.

```kotlin
// Skip components you don't need
val (_, _, status) = paymentResult  // only care about status

// Works in lambda destructuring too
accounts.forEach { (_, balance) ->
    if (balance < 0) flagOverdraft()
}
```

## Progressions

Ranges and progressions are related but distinct. A range represents a bounded interval — it answers the question "is this value between A and B?" A progression represents a sequence of values with a fixed step — it answers "what are all the values from A to B, stepping by N?" When you write `1..10 step 2`, the `1..10` creates an `IntRange`, and `step 2` converts it into an `IntProgression`. The progression stores three values: `first`, `last`, and `step`. Under the hood, `IntProgression`, `LongProgression`, and `CharProgression` are the three concrete progression types in the standard library.

```kotlin
val countdown = 10 downTo 1 step 3
println(countdown.first)  // 10
println(countdown.last)   // 1
println(countdown.step)   // -3
println(countdown.toList())  // [10, 7, 4, 1]
```

One thing that catches people off guard: the `last` property of a progression might not be the value you specified. If your step doesn't land exactly on the endpoint, Kotlin adjusts `last` to the actual last value produced. For example, `1..10 step 3` has `first = 1`, `step = 3`, but `last = 10`? No — `last` is actually `10` because the progression produces 1, 4, 7, 10. But `1..9 step 4` has `last = 9`? Actually `last` would be `9` only if 9 is reachable. The sequence is 1, 5, 9 — so `last` is 9. However, `1..10 step 4` produces 1, 5, 9 with `last = 9`, not 10. The progression silently drops unreachable endpoints. This is a subtle detail but it matters when you're using `last` in calculations.

Reversed progressions are also useful. You can call `.reversed()` on any progression to flip its direction. And since progressions implement `Iterable`, you can convert them to lists, filter them, or use them with any collection operation:

```kotlin
val workHours = (9..17).toList()  // [9, 10, 11, 12, 13, 14, 15, 16, 17]
val evenHours = (0..23 step 2).toList()  // [0, 2, 4, ..., 22]
val reversed = (1..5).reversed()  // 5, 4, 3, 2, 1

// Practical: generate time slots for a scheduling app
val availableSlots = (9..16).map { hour ->
    TimeSlot(hour, hour + 1)
}
```

I think of progressions as the "iterator" counterpart to ranges. Ranges define boundaries. Progressions define sequences. Both are lightweight, both integrate naturally with Kotlin's control flow, and both compile down to efficient loops when used in for statements. They're small features individually, but together they replace a surprising amount of manual index arithmetic and boundary checking with clean, declarative expressions.

Thanks for reading!

## Quiz

#### How does `for (i in 1..10)` compile on the JVM?

- **Wrong** It creates an IntRange object and iterates over it
- **Correct** It compiles to a simple `for (int i = 1; i <= 10; i++)` loop with no allocation
- **Wrong** It creates a List<Int> and iterates over it
- **Wrong** It uses an iterator pattern with hasNext()/next()

> **Explanation:** The Kotlin compiler recognizes range-based for loops and optimizes them to simple counter loops. No IntRange object is allocated. This means ranges in for loops have zero overhead compared to hand-written Java loops.

#### What does `_` mean in a destructuring declaration?

- **Wrong** It assigns the value to a variable named underscore
- **Correct** It's a placeholder for components you intentionally don't need
- **Wrong** It throws away the entire destructured object
- **Wrong** It assigns a default value

> **Explanation:** `val (_, email) = user` skips the first component. The `_` placeholder tells readers you intentionally don't need that value, improving code clarity. You can use multiple underscores for multiple unused components.

## Coding Challenge

Write a `ScheduleAnalyzer` class that takes a list of `TimeSlot(val day: DayOfWeek, val startHour: Int, val endHour: Int, val title: String)`. Implement: (1) a function that finds all overlapping time slots on the same day using ranges, (2) a function that groups time slots by day using destructuring in map operations, and (3) a function that finds available hours in a given range (e.g., 9..17) for a specific day. Use ranges, destructuring, and progressions throughout.

#### Solution

```kotlin
import java.time.DayOfWeek

data class TimeSlot(
    val day: DayOfWeek,
    val startHour: Int,
    val endHour: Int,
    val title: String
)

class ScheduleAnalyzer(private val slots: List<TimeSlot>) {

    fun findOverlapping(): List<Pair<TimeSlot, TimeSlot>> {
        val overlaps = mutableListOf<Pair<TimeSlot, TimeSlot>>()
        val byDay = slots.groupBy { it.day }

        byDay.forEach { (_, daySlots) ->
            for (i in 0 until daySlots.size) {
                for (j in (i + 1) until daySlots.size) {
                    val (_, startA, endA, _) = daySlots[i]
                    val (_, startB, endB, _) = daySlots[j]
                    if (startA in startB until endB || startB in startA until endA) {
                        overlaps.add(daySlots[i] to daySlots[j])
                    }
                }
            }
        }
        return overlaps
    }

    fun groupByDay(): Map<DayOfWeek, List<String>> {
        return slots.groupBy { it.day }
            .mapValues { (_, daySlots) ->
                daySlots.map { (_, start, end, title) ->
                    "$title ($start:00–$end:00)"
                }
            }
    }

    fun availableHours(day: DayOfWeek, workRange: IntRange = 9..17): List<Int> {
        val occupied = slots
            .filter { it.day == day }
            .flatMap { (_, start, end, _) -> start until end }
            .toSet()

        return (workRange).filter { it !in occupied }
    }
}
```
