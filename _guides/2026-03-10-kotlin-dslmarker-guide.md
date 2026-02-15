---
title: Kotlin @DslMarker Guide
layout: post
sequence: 104
categories: post
tags:
  - Kotlin
  - Android
---

If you've ever built a DSL in Kotlin -- or even just used one like Jetpack Compose, Ktor routing, or Gradle's build script -- you've probably hit a bug that doesn't look like a bug. You nest a few lambdas, call a function that feels right, and the code compiles without complaint. But the result is wrong. The function you called belongs to an outer scope, not the one you're currently inside. Kotlin's lambdas with receivers are powerful precisely because they give you implicit access to the receiver's members. But when you nest multiple receivers, that same power becomes a trap. Every enclosing receiver's methods are visible inside every inner lambda, and the compiler won't tell you that calling `title()` from inside `body { }` is semantically nonsense -- it just routes the call to the outer `HTML` receiver where `title()` doesn't even make sense.

This is the problem `@DslMarker` was designed to solve. It's a meta-annotation that tells the compiler to restrict implicit receiver access in nested lambdas. Once you annotate your DSL builder classes with a marker, inner scopes can only access methods from the nearest receiver. If you genuinely need to reach an outer receiver, you have to say so explicitly with `this@label`. It turns accidental scope leaking from a silent runtime bug into a compile-time error, and that distinction matters a lot when your DSL is used by other developers on your team who don't have your mental model of the builder hierarchy.

## The Problem: Implicit Receiver Leaking

Kotlin's lambdas with receivers are the foundation of every DSL. When you write `html { }`, the lambda runs with an `HTML` instance as its receiver, so you can call `head()` and `body()` directly. When you then write `body { }`, a new lambda runs with a `Body` receiver. But here's the thing -- the outer `HTML` receiver doesn't disappear. It's still sitting there in the enclosing scope, and all its methods are still callable. The compiler resolves function calls by walking outward through receivers until it finds a match, which means any method on any enclosing receiver is fair game.

Consider this HTML builder without `@DslMarker`. The `HTML` class has `head()` and `body()` methods. The `Head` class has a `title()` method. Now look at what happens inside `body { }`:

```kotlin
class HTML {
    fun head(init: Head.() -> Unit) { /* ... */ }
    fun body(init: Body.() -> Unit) { /* ... */ }
}

class Head {
    fun title(text: String) { /* sets the page title */ }
}

class Body {
    fun div(init: Div.() -> Unit) { /* ... */ }
    fun p(text: String) { /* adds a paragraph */ }
}

fun html(init: HTML.() -> Unit): HTML { /* ... */ }

// This compiles without any warning
val page = html {
    body {
        title("Oops") // Resolves to HTML.head? No -- but the compiler finds
                       // Head.title() through the outer receiver chain
        p("Some content")
    }
}
```

The call to `title("Oops")` inside `body { }` compiles because Kotlin walks up the receiver chain and finds it on an enclosing scope. In a real HTML builder, this might call a `title()` method on the wrong builder class, producing malformed output. The developer intended to set content inside `<body>`, but they accidentally invoked a method that belongs to `<head>` semantics. No compiler warning, no runtime exception -- just wrong output that you discover when you inspect the generated HTML and wonder why there's a title element in the wrong place.

This gets worse as your DSL grows deeper. If you have three or four levels of nesting -- `html > body > div > span` -- every inner lambda can see methods from all four receivers. The surface area for accidental misuse grows with every nesting level, and there's no way for the DSL author to prevent it through normal Kotlin mechanisms.

## How @DslMarker Works

The fix is elegant. You create a custom annotation and annotate it with `@DslMarker`. Then you apply that custom annotation to all the receiver classes in your DSL. Once you do this, the Kotlin compiler changes its resolution rules: inside a lambda, only the closest (innermost) receiver's members are directly accessible. Methods from outer receivers are still available, but you have to qualify them explicitly with `this@label`.

Under the hood, the compiler treats all classes annotated with the same DSL marker as belonging to the same "scope group." When it encounters a function call inside a nested lambda, it checks if the function belongs to the nearest receiver in that scope group. If it does, the call goes through. If it belongs to a more distant receiver in the same scope group, the compiler flags it as an error and requires explicit qualification. This is different from shadowing -- the outer methods aren't hidden because a closer method has the same name. They're restricted because the compiler knows they belong to the same DSL and assumes that cross-scope calls are probably mistakes.

The important detail is that `@DslMarker` only restricts implicit access. It doesn't remove the ability to call outer receivers at all. If you write `this@html.head { }` inside a `body { }` block, the compiler allows it. The marker forces you to be intentional about crossing scope boundaries. This is the right tradeoff -- it catches the 95% of cases where cross-scope access is accidental, while still allowing the 5% where it's genuinely needed.

## Implementing @DslMarker

Here's the step-by-step implementation. First, create the marker annotation:

```kotlin
@DslMarker
@Target(AnnotationTarget.CLASS)
annotation class HtmlDsl
```

Now annotate your builder classes. If they share a common superclass, you only need to annotate the superclass -- all subclasses inherit the marker automatically:

```kotlin
@HtmlDsl
abstract class Tag(val name: String) {
    val children = mutableListOf<String>()

    protected fun <T : Tag> initTag(tag: T, init: T.() -> Unit): T {
        tag.init()
        return tag
    }
}

class HtmlBuilder : Tag("html") {
    fun head(init: HeadBuilder.() -> Unit) = initTag(HeadBuilder(), init)
    fun body(init: BodyBuilder.() -> Unit) = initTag(BodyBuilder(), init)
}

class HeadBuilder : Tag("head") {
    fun title(text: String) { children.add("<title>$text</title>") }
    fun meta(name: String, content: String) { children.add("<meta name=\"$name\" content=\"$content\">") }
}

class BodyBuilder : Tag("body") {
    fun div(init: DivBuilder.() -> Unit) = initTag(DivBuilder(), init)
    fun p(text: String) { children.add("<p>$text</p>") }
    fun h1(text: String) { children.add("<h1>$text</h1>") }
}

class DivBuilder : Tag("div") {
    fun p(text: String) { children.add("<p>$text</p>") }
    fun span(text: String) { children.add("<span>$text</span>") }
}
```

Before `@HtmlDsl`, this code compiles silently:

```kotlin
val page = html {
    body {
        title("Oops") // No error -- leaks to HtmlBuilder/HeadBuilder scope
        p("Content")
    }
}
```

After adding `@HtmlDsl` to the base `Tag` class, that same code becomes a compile error:

```kotlin
val page = html {
    body {
        title("Oops") // ERROR: 'fun title(text: String)' can't be called
                       // in this context by implicit receiver. Use the
                       // explicit receiver this@html if needed.
        p("Content")
    }
}
```

If you genuinely need to set the title from inside the body block (unusual, but possible in some builder patterns), you qualify the receiver explicitly:

```kotlin
val page = html {
    body {
        this@html.head {
            title("Now it's intentional")
        }
        p("Content")
    }
}
```

The compiler error message is actually quite helpful. It tells you exactly which function is being blocked, why it's being blocked, and how to fix it if the cross-scope call is intentional. I wish more compiler errors were this clear.

## Real-World Examples

You've probably used `@DslMarker` without realizing it. Several major Kotlin frameworks rely on it to keep their DSLs safe.

Jetpack Compose uses `@Composable` as its scope control mechanism. While `@Composable` isn't technically `@DslMarker`, it serves a similar purpose -- it restricts what you can call inside composable functions and prevents certain scope-leaking patterns. The Compose compiler plugin enforces rules about where composable functions can be called, which is a more sophisticated version of the same idea.

Gradle's Kotlin DSL uses `@DslMarker` extensively. When you write a `build.gradle.kts` file and nest `dependencies { }` inside a subproject block, Gradle's markers prevent you from accidentally calling top-level project methods from inside a dependency configuration lambda. Without this, it would be trivially easy to configure the wrong project's dependencies in a multi-module build -- a bug that would be extremely hard to track down because it compiles, runs, and only manifests as mysterious runtime behavior.

Ktor's routing DSL is another good example. When you nest `route("/api") { get("/users") { } }`, the markers ensure that inside the `get` handler, you can't accidentally call routing-level functions like `route()` again without explicit qualification. This prevents malformed route trees where handlers accidentally register new routes as a side effect.

The pattern is the same in every case: any DSL with nested lambdas and receivers benefits from `@DslMarker`. The deeper the nesting, the more value you get, because the number of implicit methods from outer scopes grows with every level.

## When You Need @DslMarker

The rule is simple: if your DSL has more than one level of nesting, you need `@DslMarker`. Without it, you're relying on developers to know which methods belong to which scope, and that's a losing bet. Even experienced developers make this mistake because the compiler offers no help -- the code just compiles and does the wrong thing.

I would argue that skipping `@DslMarker` is one of the most common mistakes in custom Kotlin DSL design. It's easy to build a DSL that works in the happy path, demo it to the team, and call it done. But the moment someone starts using it in a complex, deeply nested way, they'll start calling methods from the wrong scope. The bugs are subtle because the code looks correct, compiles without warnings, and often produces output that's almost right -- just wrong enough to cause issues in production.

The annotation costs you three lines of code: the `@DslMarker` annotation class, and then applying it to your base builder class. That's the cost. The benefit is that every developer who uses your DSL gets compile-time protection against an entire class of bugs that would otherwise be invisible until someone spots the wrong output. To me, there's no reason to ever skip it. If you're writing a DSL with nested receivers, `@DslMarker` is not optional -- it's part of the design.

One tradeoff to be honest about: `@DslMarker` can occasionally be annoying when you legitimately want cross-scope access frequently. If your DSL design requires inner lambdas to regularly call outer receiver methods, the `this@label` syntax gets verbose. In that case, the friction is telling you something -- your DSL's scope hierarchy might not match the actual semantics of what you're building. Consider flattening the nesting or providing helper methods that bridge scopes explicitly.

Thanks for reading!

## Quiz

#### What problem does @DslMarker solve?

- **Wrong** It improves the performance of DSL builders
- **Correct** It prevents accidentally calling methods from outer receiver scopes in nested DSL blocks
- **Wrong** It enables SAM conversion for DSL interfaces
- **Wrong** It makes DSL builders thread-safe

> **Explanation:** Without @DslMarker, nested lambdas with receivers can access methods from ALL enclosing scopes. This means you could call `head`'s `title()` from inside `body { }` -- it compiles but produces wrong results. @DslMarker restricts access to only the nearest receiver.

#### How do you access an outer receiver's method when @DslMarker is active?

- **Wrong** You can't -- outer methods are completely blocked
- **Correct** Use explicit `this@label` qualification -- e.g., `this@html.title("...")`
- **Wrong** Use the `outer` keyword
- **Wrong** Cast the receiver to the outer type

> **Explanation:** @DslMarker doesn't block access entirely -- it prevents implicit access. If you genuinely need to call an outer receiver's method, use `this@label` to explicitly qualify which receiver you're targeting. This makes cross-scope access intentional rather than accidental.

## Coding Challenge

Create a UI layout DSL with @DslMarker that builds a tree of components. Define `@LayoutDsl` annotation, `Column`, `Row`, and `Text` builders. The DSL should: prevent calling `text()` from inside a nested `column { }` without explicit qualification, support nesting `column` inside `row` and vice versa, and produce a string representation of the layout tree. Show both the compile error case and the explicit this@label workaround.

#### Solution

```kotlin
@DslMarker
annotation class LayoutDsl

@LayoutDsl
abstract class Component(val type: String) {
    val children = mutableListOf<Component>()

    fun render(indent: Int = 0): String = buildString {
        append("  ".repeat(indent) + type)
        if (children.isEmpty()) {
            append("\n")
        } else {
            append(" {\n")
            children.forEach { append(it.render(indent + 1)) }
            append("  ".repeat(indent) + "}\n")
        }
    }
}

class ColumnScope : Component("Column") {
    fun text(value: String) { children.add(TextComponent(value)) }
    fun row(init: RowScope.() -> Unit) {
        val r = RowScope().apply(init)
        children.add(r)
    }
}

class RowScope : Component("Row") {
    fun text(value: String) { children.add(TextComponent(value)) }
    fun column(init: ColumnScope.() -> Unit) {
        val c = ColumnScope().apply(init)
        children.add(c)
    }
}

class TextComponent(value: String) : Component("Text(\"$value\")")

fun column(init: ColumnScope.() -> Unit): ColumnScope =
    ColumnScope().apply(init)

// Usage
fun main() {
    val layout = column {
        text("Header")
        row {
            // text("X") -- compile error: 'text' can't be called here
            // by implicit receiver. Must use this@column.text("X")
            column {
                text("Nested text") // OK -- nearest ColumnScope
            }
        }
        // Explicit workaround for cross-scope access:
        row {
            this@column.text("Added to outer column intentionally")
        }
    }
    println(layout.render())
}
```
