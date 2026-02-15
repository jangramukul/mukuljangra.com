---
title: Kotlin String Templates and Raw Strings Guide
layout: post
sequence: 86
categories: post
tags:
  - Kotlin
  - Android
---

If you've ever written Java, you know the pain of building strings. `String.format()` with its numbered `%s` placeholders that you have to count and match to arguments — get one wrong and you get a runtime crash, not a compile error. Or the concatenation approach: `"Hello, " + name + "! You have " + count + " items."` which turns into an unreadable mess the moment you need more than two variables. I spent years writing code like this, and looking back, it's remarkable how much mental energy went into something as basic as assembling a string.

Kotlin's string templates changed how I think about string construction entirely. Instead of treating strings as things you build by gluing pieces together, you write the string as it should read and drop variables directly into it. The compiler handles the optimization. It sounds like a small thing — and syntactically, it is — but it removes an entire class of bugs (wrong argument order, missing concatenation operators, type mismatches) and makes code dramatically more readable. Once you internalize templates and raw strings, you'll wonder how you ever tolerated the old way.

## String Templates

The basic syntax is straightforward: prefix a variable name with `$` to interpolate it, or use `${}` for expressions. But what matters more than the syntax is understanding what the compiler actually does with it.

```kotlin
class OrderConfirmation(
    private val customerName: String,
    private val orderId: Long,
    private val items: List<OrderItem>
) {

    fun buildMessage(): String {
        val total = items.sumOf { it.price * it.quantity }
        val itemCount = items.size

        return "Hi $customerName, your order #$orderId is confirmed. " +
            "You ordered $itemCount ${if (itemCount == 1) "item" else "items"} " +
            "for a total of $${"%.2f".format(total)}."
    }
}
```

That `${if (itemCount == 1) "item" else "items"}` is a full expression inside a template. You can put function calls, `when` expressions, method chains — anything that returns a value. The compiler converts each template into a `StringBuilder` chain, so there's zero performance penalty compared to writing the `StringBuilder` yourself. You're getting readability for free.

Here's the thing though — just because you *can* put complex expressions in templates doesn't mean you should. I follow a simple rule: if the expression inside `${}` is longer than about 20-30 characters, extract it to a local variable. The template should read like a sentence, not like a code puzzle.

```kotlin
fun formatUserStatus(user: User): String {
    // Bad — the template is doing too much
    val bad = "User ${user.name.split(" ").first()} (${if (user.isActive) "active" else "inactive"}) last seen ${user.lastLogin?.format(DateTimeFormatter.ISO_DATE) ?: "never"}"

    // Good — extract complex expressions to variables
    val firstName = user.name.split(" ").first()
    val status = if (user.isActive) "active" else "inactive"
    val lastSeen = user.lastLogin?.format(DateTimeFormatter.ISO_DATE) ?: "never"

    return "User $firstName ($status) last seen $lastSeen"
}
```

Both produce the same bytecode. But the second version is something a teammate can actually read during code review without squinting. Templates are a readability feature — don't undermine them by stuffing logic into them.

## Raw Strings and trimMargin

Regular strings handle simple interpolation well, but the moment you need multi-line content — SQL queries, JSON payloads, regex patterns, HTML fragments — escaped strings become a nightmare. Every newline needs `\n`, every quote needs `\"`, and the indentation in your code bears no resemblance to the actual output.

Triple-quoted raw strings fix this completely. They preserve whitespace exactly as written and don't process escape characters. Combined with `trimMargin()`, they let you write multi-line content that's both readable in your source code and correct in the output.

```kotlin
class ReportRepository(private val db: Database) {

    fun fetchMonthlySales(month: Int, year: Int): List<SalesRecord> {
        val query = """
            |SELECT customer_name, product, quantity, price
            |FROM sales
            |WHERE MONTH(sale_date) = $month
            |  AND YEAR(sale_date) = $year
            |  AND status != 'CANCELLED'
            |ORDER BY sale_date DESC
        """.trimMargin()

        return db.query(query)
    }
}
```

`trimMargin()` strips everything from the start of each line up to and including the margin character (`|` by default), plus the leading newline and trailing newline of the whole string. The result is a clean SQL query with proper indentation in the output, while your source code stays properly indented within the function. You can use a custom margin character if `|` conflicts with your content — just pass it as an argument: `trimMargin(">")`.

There's also `trimIndent()`, which works differently. Instead of looking for a margin character, it finds the smallest common leading whitespace across all lines and removes that amount from every line. I tend to prefer `trimMargin()` because it's explicit — you see exactly where the content starts on each line. `trimIndent()` is convenient for quick multi-line strings where you don't want to bother with margin characters.

```kotlin
class ApiClient {

    fun buildJsonPayload(user: User): String {
        return """
            {
                "name": "${user.name}",
                "email": "${user.email}",
                "role": "${user.role}",
                "active": ${user.isActive}
            }
        """.trimIndent()
    }

    fun buildHtmlEmail(recipientName: String, message: String): String {
        return """
            |<html>
            |<body>
            |  <h1>Hello, $recipientName</h1>
            |  <p>$message</p>
            |  <footer>Sent from our notification service</footer>
            |</body>
            |</html>
        """.trimMargin()
    }
}
```

Raw strings also work beautifully for test data, configuration templates, and anywhere you'd otherwise be tempted to load a resource file just to avoid escape character hell.

## Under the Hood — How Templates Compile

This is the part that convinced me to stop worrying about template "overhead." When you write `"Hello, $name"`, the Kotlin compiler doesn't do anything clever or magical. It generates exactly the `StringBuilder` code that a skilled Java developer would write by hand.

The template `"Hello, $name! You have $count items."` compiles to approximately this bytecode:

```kotlin
// What the compiler generates (simplified from bytecode)
new StringBuilder()
    .append("Hello, ")
    .append(name)
    .append("! You have ")
    .append(count)
    .append(" items.")
    .toString()
```

That's it. One `StringBuilder`, one allocation, a chain of `append` calls. The compiler handles string literal segments and variable segments in a single pass. For simple cases with one or two variables, the JIT may even optimize this further, but the point is — you're never paying a performance tax for using templates over manual `StringBuilder`. The generated code is identical.

This matters because I've seen codebases where developers avoid templates in "hot paths" and hand-write `StringBuilder` chains "for performance." They're doing extra work for zero benefit. The compiler already does this for you. Write the readable version and move on.

## buildString for Loop Construction

Here's where string performance actually matters — and where I've seen real bugs in production code. If you're building a string inside a loop using `+=`, you're creating a new `String` object on every single iteration.

```kotlin
// Bad — O(n²) allocations
fun formatItemList(items: List<OrderItem>): String {
    var result = ""
    for (item in items) {
        result += "${item.name}: ${item.quantity} x $${item.price}\n"
    }
    return result
}
```

Strings are immutable on the JVM. Every `+=` allocates a new `String`, copies all existing characters into it, then appends the new content. For a list of 1,000 items, that's roughly 1,000 allocations and about 500,000 character copies — O(n²) work. I've profiled Android apps where this exact pattern caused visible jank in list rendering because the garbage collector was busy cleaning up hundreds of throwaway `String` objects.

The fix is `buildString`, which wraps a single `StringBuilder` internally. Each `append` or `appendLine` call is amortized O(1) — the backing array grows by doubling, so you get O(n) total work instead of O(n²).

```kotlin
// Good — O(n) with single StringBuilder
fun formatItemList(items: List<OrderItem>): String = buildString {
    for (item in items) {
        appendLine("${item.name}: ${item.quantity} x $${item.price}")
    }
}
```

For the common case of joining collection elements with a separator, `joinToString` is even cleaner. It handles the separator logic so you don't end up with a trailing comma or newline.

```kotlin
fun formatItemList(items: List<OrderItem>): String =
    items.joinToString(separator = "\n") { item ->
        "${item.name}: ${item.quantity} x $${item.price}"
    }
```

Both `buildString` and `joinToString` use `StringBuilder` under the hood. Pick `buildString` when you need conditional logic, headers, footers, or complex formatting within the loop. Pick `joinToString` when you're mapping each element to a string with a uniform separator.

## Raw Strings for Regex

If you've written regex in Java, you remember the double-escaping nightmare. A literal dot needs `\\.` in a regular string because `\` itself needs to be escaped. A digit class `\d` becomes `\\d`. Phone number patterns turn into something nobody can read.

Raw strings eliminate this entirely because they don't process escape sequences. What you write is what the regex engine sees.

```kotlin
class PhoneValidator {

    // Regular string — double escaping makes this hard to read
    private val phoneRegexEscaped = Regex("^\\+?\\d{1,3}[-.\\s]?\\(?(\\d{1,4})\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}$")

    // Raw string — what you see is what the regex engine gets
    private val phoneRegex = Regex("""^\+?\d{1,3}[-.\s]?\(?(\d{1,4})\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$""")

    fun isValid(phone: String): Boolean = phoneRegex.matches(phone)
}
```

The raw string version is the actual regex pattern. You can copy it into a regex tester, share it with a teammate, or compare it against a spec document without mentally un-escaping everything. For complex patterns — and Android apps deal with plenty of input validation — this is a huge readability win.

## The Dollar Sign Escape

There's one quirk with string templates that trips people up: how do you include a literal `$` character? In regular strings, you can escape it with `\$`. But in raw strings, escape characters aren't processed. So you need `${'$'}` — a template expression that evaluates to the dollar sign character.

This comes up most often when generating shell scripts, currency formatting where you don't want interpolation, or any content that naturally contains `$`.

```kotlin
fun generateDeployScript(appName: String, version: String): String {
    return """
        |#!/bin/bash
        |set -e
        |
        |APP_NAME="$appName"
        |VERSION="$version"
        |
        |echo "Deploying ${'$'}APP_NAME version ${'$'}VERSION"
        |
        |if [ -z "${'$'}APP_NAME" ]; then
        |  echo "Error: APP_NAME is not set"
        |  exit 1
        |fi
        |
        |docker build -t ${'$'}APP_NAME:${'$'}VERSION .
        |docker push ${'$'}APP_NAME:${'$'}VERSION
    """.trimMargin()
}
```

Notice the difference: `$appName` and `$version` are Kotlin template interpolations that get replaced with the function arguments. `${'$'}APP_NAME` and `${'$'}VERSION` produce literal `$APP_NAME` and `$VERSION` in the output — shell variables that the bash script will resolve at runtime. It looks noisy in the source, but it's unambiguous, and the compiler catches any mistakes at compile time.

IMO, this is one area where Kotlin's syntax isn't great. But in practice, you don't write shell script generators every day. When you do, the `${'$'}` pattern is a minor cost for the benefit of keeping everything type-safe and template-resolved at compile time.

String templates and raw strings aren't flashy features. They don't get conference talks or blog posts with breathless titles. But they're the kind of thing that makes your daily code measurably better — fewer bugs from concatenation mistakes, better readability, and zero performance cost. Master `buildString` for loops, `trimMargin` for multi-line content, and raw strings for regex, and you've covered 90% of string handling in any Android codebase.

Thanks for reading!

## Quiz

#### How does the Kotlin compiler handle string templates like `"Hello, $name"`?

- **Wrong** It uses String.format() internally
- **Wrong** It creates multiple intermediate String objects and concatenates them
- **Correct** It generates a StringBuilder chain — equivalent to what a skilled Java developer would write by hand
- **Wrong** It uses a special template engine at runtime

> **Explanation:** `"Hello, $name"` compiles to `new StringBuilder().append("Hello, ").append(name).toString()`. The compiler generates optimal StringBuilder usage automatically.

#### Why is `+=` in a loop problematic for strings?

- **Wrong** It causes a compile error
- **Correct** It creates a new String object on every iteration — O(n²) allocations
- **Wrong** It's slower than String.format()
- **Wrong** It only works with var, not val

> **Explanation:** Strings are immutable in Kotlin/JVM. Each `+=` allocates a new String, copies all existing characters, then appends. For n iterations, that's O(n²) work. Use `buildString` or `joinToString` instead.

## Coding Challenge

Write a `ReportGenerator` class with a `generateReport` function that takes a list of `OrderItem(name: String, quantity: Int, price: Double)` and produces a formatted multi-line report using `buildString`. The report should include a header with the current date, numbered items with their details, a separator line, and a total. Use string templates, raw strings where appropriate, and avoid any `+=` concatenation.

#### Solution

```kotlin
data class OrderItem(
    val name: String,
    val quantity: Int,
    val price: Double
)

class ReportGenerator {

    fun generateReport(items: List<OrderItem>): String = buildString {
        val date = java.time.LocalDate.now()
        val total = items.sumOf { it.price * it.quantity }

        appendLine("""
            |========================================
            |  ORDER REPORT — $date
            |========================================
        """.trimMargin())

        items.forEachIndexed { index, item ->
            val lineTotal = item.price * item.quantity
            appendLine("${index + 1}. ${item.name}")
            appendLine("   Qty: ${item.quantity} x ${"%.2f".format(item.price)} = ${"%.2f".format(lineTotal)}")
        }

        appendLine("----------------------------------------")
        appendLine("TOTAL: ${"%.2f".format(total)}")
        appendLine("========================================")
    }
}

fun main() {
    val items = listOf(
        OrderItem("Wireless Mouse", 2, 29.99),
        OrderItem("USB-C Hub", 1, 49.95),
        OrderItem("Mechanical Keyboard", 1, 89.00)
    )
    println(ReportGenerator().generateReport(items))
}
```
