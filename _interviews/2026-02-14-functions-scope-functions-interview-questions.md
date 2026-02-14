---
title: "Functions & Scope Functions"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 2
sequence: 2
description: "Functions are a core part of Kotlin interviews. Scope functions, higher-order functions, and inline functions are asked frequently because they show how well you understand Kotlin's functional side."
---

## Functions & Scope Functions

If there's one thing that separates Kotlin from "Java with nicer syntax," it's how Kotlin treats functions as first-class citizens. Interviewers love this topic because higher-order functions, scope functions, and inline magic reveal whether you actually think in Kotlin or just write Java with `val` instead of `final`. Let's get into it.

#### What is a higher-order function?

A higher-order function is a function that takes other functions as parameters, or returns a function as its result. Think of it like a restaurant order system -- you don't hardcode what the chef makes, you pass in the recipe. Most Kotlin standard library functions like `map`, `filter`, `forEach` are higher-order functions. They let you pass behavior as a parameter instead of baking it in.

```kotlin
fun performOperation(
    amount: Double,
    operation: (Double) -> Double
): Double {
    return operation(amount)
}

val taxed = performOperation(100.0) { it * 1.18 }
val discounted = performOperation(100.0) { it * 0.9 }
```

#### What is a lambda expression? What does `it` mean?

A lambda is basically a function without a name -- a block of code you can toss around like a value. The syntax is `{ parameters -> body }`. But here's the nice part: when a lambda has exactly one parameter, you don't have to name it. Kotlin gives you `it` for free.

```kotlin
val names = listOf("Alice", "Bob", "Charlie")

names.filter { name -> name.length > 3 }

names.filter { it.length > 3 }

val users = mapOf("u1" to "Alice", "u2" to "Bob")
users.forEach { (key, value) -> println("$key: $value") }
```

If the lambda is the last argument of a function, you can move it outside the parentheses. If it's the only argument, you can drop the parentheses entirely. This is called trailing lambda syntax, and it's why Kotlin DSLs look so clean.

#### What is the difference between a lambda and an anonymous function?

Here's the thing -- the big difference is about `return`. A lambda's `return` inside an inline function is a non-local return, meaning it exits the entire enclosing function. Want to return from just the lambda? You need a labeled return: `return@functionName`.

An anonymous function plays by simpler rules. Its `return` always returns from itself, never the enclosing function. It's like the difference between yelling "I quit!" in a meeting (non-local return) vs quietly stepping out of the room (local return).

```kotlin
fun findFirstAdmin(users: List<User>): User? {
    users.forEach { user ->
        if (user.role == "admin") return user // exits findFirstAdmin
    }

    users.forEach(fun(user) {
        if (user.role == "admin") return // exits only this function
    })

    return null
}
```

In practice, lambdas are used far more often. Anonymous functions are really just there for when you want `return` to exit only the function body without fussing with labeled returns.

> **🧠 Think about it:** If `forEach` wasn't an inline function, would that non-local `return` inside the lambda still work? Why or why not?

#### What are the five scope functions and how do they differ?

Kotlin gives you five scope functions -- `let`, `run`, `with`, `apply`, `also` -- and they all do roughly the same thing: run a block of code in the context of an object. But wait, there are two axes you need to remember: how you refer to the object (`this` or `it`), and what gets returned (the lambda result or the object itself).

- **let** -- Object as `it`, returns lambda result. Your go-to for null checks and transformations.
- **run** -- Object as `this`, returns lambda result. Great for computing something using the object's methods.
- **with** -- Object as `this`, returns lambda result. Same as `run` but called as `with(object)` instead.
- **apply** -- Object as `this`, returns the object itself. Perfect for configuring an object after creation.
- **also** -- Object as `it`, returns the object itself. Your side-effect buddy -- logging, debugging, validation.

```kotlin
val displayName = user?.let { "${it.firstName} ${it.lastName}" }

val intent = Intent(this, PaymentActivity::class.java).apply {
    putExtra("AMOUNT", 29.99)
    putExtra("CURRENCY", "USD")
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

val result = repository.fetchOrders()
    .also { orders -> logger.debug("Fetched ${orders.size} orders") }
    .filter { it.status == Status.PENDING }
```

Here's the mental shortcut: `apply` and `also` return the object (useful for chaining), while `let`, `run`, and `with` return whatever the lambda computes.

#### When should you use let vs apply vs also?

Think of it like a toolbox. `let` is your transformer -- you hand it an object and get something different back (or do a null check). `apply` is your configurator -- like filling out a form, you're setting up an object's properties. `also` is your observer -- it peeks at the object, does something on the side, and passes it along untouched.

```kotlin
val length = userName?.let { it.trim().length }

val textView = TextView(context).apply {
    text = "Hello"
    textSize = 16f
    setTextColor(Color.BLACK)
}

fun createUser(name: String): User {
    return User(name).also { logger.info("Created user: ${it.name}") }
}
```

One word of caution: if you find yourself nesting scope functions inside each other, stop. One level is fine, two is the maximum. Beyond that, you're making code harder to read, not easier.

#### What is the difference between run and with?

They're almost twins. Both use `this` as the context object and return the lambda result. The only real difference is how you call them -- `run` is an extension function called on the object, `with` takes the object as an argument.

But `run` has a superpower that `with` doesn't: it works with nullable types using `?.run { }`. With `with`, you'd have to wrap everything in a null check first. That's why `run` shows up more often in real codebases.

#### What is an extension function?

An extension function lets you bolt new functionality onto an existing class without touching its source code. It's like adding a custom attachment to a power tool -- the tool doesn't change, but now it can do something new. The class you extend becomes the receiver type, and inside the function you access its public members with `this`.

```kotlin
fun String.isValidEmail(): Boolean {
    return this.contains("@") && this.contains(".")
}

val email = "user@example.com"
println(email.isValidEmail()) // true
```

But here's a gotcha worth knowing: extension functions are resolved statically at compile time based on the declared type, not the runtime type. And if a member function and an extension function have the same signature, the member function always wins.

> **🧠 Think about it:** If extension functions are resolved statically, what would happen if you called an extension function on a variable typed as a parent class, but the actual object is a subclass? Would the subclass's extension get called?

#### How are extension functions resolved — statically or dynamically?

Statically. Always statically. The compiler looks at the declared type of the variable, not what the object actually is at runtime. Extension functions do not participate in virtual dispatch.

```kotlin
open class Shape
class Circle : Shape()

fun Shape.name() = "Shape"
fun Circle.name() = "Circle"

fun printName(shape: Shape) {
    println(shape.name()) // Always prints "Shape"
}

printName(Circle()) // Prints "Shape", not "Circle"
```

Even though the runtime type is `Circle`, the extension on `Shape` is called because the parameter type is declared as `Shape`. This is fundamentally different from member functions, which use virtual dispatch based on the actual runtime type. It's like calling a phone number that's listed under a company name -- you always reach the main office, never a specific department, regardless of who you're actually trying to reach.

#### Can you write an extension function on a nullable type?

Yes, and this is actually pretty powerful. You define the extension on a nullable receiver type, and `this` inside the function can be `null`. You handle it however you want.

```kotlin
fun String?.orDefault(default: String = "N/A"): String {
    return this ?: default
}

val name: String? = null
println(name.orDefault()) // "N/A"
```

This is exactly how `toString()` works in Kotlin's standard library -- there's an extension on `Any?` that handles null. Nullable extensions are great for utility functions where you want to avoid `?.let` chains at the call site.

#### What is an infix function?

An infix function lets you call a function without the dot and parentheses, making it read more like natural language. It must be a member function or extension function with exactly one parameter.

```kotlin
infix fun Int.percentOf(total: Int): Double {
    return (this.toDouble() / total) * 100
}

val percentage = 25 percentOf 200 // 12.5
```

You've probably already used infix functions without realizing it. `to` (creates a `Pair`), `and`, `or`, `xor` (bitwise operations), and `until`, `downTo`, `step` (ranges) are all infix functions in the standard library.

#### What is an inline function and why does it matter for performance?

Here's the thing about lambdas: every time you pass one to a non-inline function, the compiler creates an anonymous class instance behind the scenes. That's an object allocation. In a tight loop, that adds up fast.

The `inline` modifier fixes this by telling the compiler: "Don't create a function object. Just copy-paste the function's bytecode directly at the call site." No object, no extra method call. It's like the difference between mailing someone a letter (creating an object, sending it) vs just walking over and telling them directly (inlined).

```kotlin
inline fun measureTime(block: () -> Unit): Long {
    val start = System.nanoTime()
    block()
    return System.nanoTime() - start
}
```

But wait -- only use `inline` with higher-order functions. Inlining a function without lambda parameters just bloats your bytecode without eliminating any allocation.

#### What is a reified type parameter and why does it require inline?

Normally on the JVM, generic types are erased at runtime. You can't say `T::class.java` because `T` doesn't exist anymore after compilation. But when a function is `inline`, its body gets copy-pasted to the call site where the compiler knows the actual type. So `reified` tells the compiler: "Hey, since you're inlining this anyway, keep the real type around."

```kotlin
inline fun <reified T> parseJson(json: String): T {
    return Gson().fromJson(json, T::class.java)
}

val user = parseJson<UserProfile>(jsonString)
```

Without `reified`, you'd have to pass the class manually: `parseJson(jsonString, UserProfile::class.java)`. That's clunkier, and `reified` exists specifically to avoid it.

#### What is non-local return in inline functions?

In a normal (non-inline) lambda, `return` only exits the lambda itself. But in an inline function's lambda, `return` exits the entire enclosing function. Why? Because after inlining, the lambda body is literally part of the enclosing function's bytecode -- there's no separate function to "return from."

```kotlin
fun findAdmin(users: List<User>): User? {
    users.forEach { user ->
        if (user.role == "admin") return user // returns from findAdmin
    }
    return null
}
```

This only works with inline functions. If `forEach` weren't inline, that `return` would be a compile error.

> **🧠 Think about it:** What would happen if you tried to use a non-local `return` inside a lambda that gets passed to a different thread? Could the compiler even make that work safely?

#### What are crossinline and noinline?

These are your fine-tuning knobs for inline function parameters:

- **crossinline** -- The lambda still gets inlined, but non-local returns are blocked. You need this when the lambda runs in a different execution context, like inside another lambda or on a different thread. Think about it -- if the lambda runs on a background thread, a non-local return would try to exit a function that already finished. That's chaos.
- **noinline** -- The lambda doesn't get inlined at all. Use this when you need to store the lambda in a variable or pass it to another non-inline function. You can't store something that's been copy-pasted.

```kotlin
inline fun runOnBackground(
    crossinline action: () -> Unit,
    noinline callback: () -> Unit
) {
    Thread {
        action()        // can't use 'return' here
        callback()      // stored/passed as object
    }.start()
    storeCallback(callback)
}
```

#### What is the tailrec modifier?

`tailrec` tells the compiler to convert a recursive function into a loop under the hood, saving you from stack overflow on deep recursion. The catch: the recursive call must be the very last thing the function does.

```kotlin
tailrec fun factorial(n: Long, accumulator: Long = 1): Long {
    if (n <= 1) return accumulator
    return factorial(n - 1, n * accumulator)
}
```

It's like the difference between stacking plates one by one (regular recursion -- eventually the stack topples) vs just replacing the current plate each time (tail recursion -- constant stack space). The compiler even warns you if the function isn't actually tail-recursive, so you can't accidentally misuse it.

#### What is a function reference and when is it better than a lambda?

A function reference (`::functionName`) is a way to point to an existing function by name instead of wrapping it in a lambda. It's cleaner and more readable when the function already exists.

```kotlin
fun isAdult(user: User): Boolean = user.age >= 18

// Lambda
val adults = users.filter { user -> isAdult(user) }

// Function reference — cleaner
val adults = users.filter(::isAdult)
```

Function references work with top-level functions, member functions (`user::getName`), and constructors (`::User`). They produce the same bytecode as the equivalent lambda, so it's purely a readability win.

#### What is the difference between T.() -> Unit and (T) -> Unit as a function type?

`T.() -> Unit` is a function type with receiver -- inside the lambda, `this` refers to `T` and you call `T`'s members directly, as if you're inside the class. `(T) -> Unit` is a regular function type where `T` is just a parameter you access as `it`.

It's like the difference between being inside a house (you can just open doors, flip switches) vs standing outside and handing things through the window. With a receiver, you're "inside" the object.

```kotlin
// With receiver — 'this' is StringBuilder
fun buildString(action: StringBuilder.() -> Unit): String {
    return StringBuilder().apply(action).toString()
}

buildString {
    append("Hello ")  // 'this' is StringBuilder
    append("World")
}

// Without receiver — passed as parameter
fun processWith(item: String, action: (String) -> Unit) {
    action(item) // item passed as 'it'
}
```

`T.() -> Unit` is the foundation of Kotlin DSLs and scope functions like `apply`. If you've ever wondered how `apply` lets you call methods without a dot, this is the mechanism.

#### How do scope functions behave with nullable receivers?

`let`, `run`, `apply`, and `also` can all be called on nullable types using `?.`. The lambda only runs if the object is non-null -- the safe call operator handles the gating for you.

`with` is the odd one out. It takes the object as a regular argument, so you can totally pass a nullable value in. But then `this` inside the block is nullable, and you're back to null-checking manually:

```kotlin
val user: User? = findUser(id)

user?.let { println(it.name) }
user?.apply { name = name.uppercase() }

with(user) {
    this?.name  // need null checks inside
}
```

The `?.let` pattern is the most common for null handling. But don't nest `?.let` inside another `?.let` -- it gets messy fast. Use an `if` check with smart cast instead.

#### When should you NOT use inline functions?

Just because you can inline doesn't mean you should. Avoid it when:
- The function doesn't take lambda parameters -- there's no object allocation to eliminate, so you're just bloating bytecode for nothing
- The function body is large -- every call site gets a full copy, and your APK size pays for it
- The function is part of a public API that might change -- inlined code is baked into the caller's binary, so changes require recompilation
- The function has multiple lambda parameters you don't need to inline -- mark the unneeded ones `noinline`

The Kotlin compiler is actually helpful here -- it emits a warning if you slap `inline` on a function with no inlineable parameters.

#### What happens under the hood when you pass a lambda to a non-inline higher-order function?

The compiler generates an anonymous class that implements a `FunctionN` interface (`Function0`, `Function1`, etc.) and creates an instance of it at the call site. If the lambda captures variables from the enclosing scope, the generated class holds references to those captured variables.

Here's where it gets interesting: if the lambda doesn't capture anything, the compiler can be smart and reuse a singleton instance. But if it captures local variables, a brand new object is created every single time. This is exactly why `inline` matters on performance-critical paths -- imagine a loop calling a higher-order function thousands of times. Each iteration allocates a new lambda object unless the function is `inline`. That's a lot of unnecessary garbage for the GC to clean up.

### Common Follow-ups

- What is the difference between `forEach` with a lambda vs a `for` loop in performance?
- Can you use `return` inside a `let` block called on a nullable type?
- How would you write a custom scope function?
- Can extension functions access private members of the class they extend?
- What happens if an extension function has the same signature as a member function?
- How do you create a function type that can receive or return `null`?
- What is a functional interface (`fun interface`) and how does SAM conversion work?
