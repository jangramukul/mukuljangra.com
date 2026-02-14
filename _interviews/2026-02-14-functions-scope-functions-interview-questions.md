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

Functions are a core part of Kotlin interviews. Scope functions, higher-order functions, and inline functions are asked frequently because they show how well you understand Kotlin's functional side.

#### What is a higher-order function?

A higher-order function takes one or more functions as arguments, or returns a function as its result. Most Kotlin standard library functions like `map`, `filter`, `forEach` are higher-order functions. They let you pass behavior as a parameter instead of hardcoding it.

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

A lambda is an anonymous function — a block of code you can pass around as a value. The syntax is `{ parameters -> body }`. When a lambda has exactly one parameter, you can skip declaring it and use `it` as the implicit name.

```kotlin
val names = listOf("Alice", "Bob", "Charlie")

names.filter { name -> name.length > 3 }

names.filter { it.length > 3 }

val users = mapOf("u1" to "Alice", "u2" to "Bob")
users.forEach { (key, value) -> println("$key: $value") }
```

If the lambda is the last argument of a function, you can move it outside the parentheses. If it's the only argument, you can drop the parentheses entirely.

#### What is the difference between a lambda and an anonymous function?

A lambda's `return` is a non-local return (exits the enclosing function) when used inside an inline function. To return from just the lambda itself, you use a labeled return: `return@functionName`.

An anonymous function's `return` always returns from the anonymous function itself, never the enclosing function.

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

In practice, lambdas are used far more often. Anonymous functions are useful when you specifically want `return` to exit only the function body without using labeled returns.

#### What are the five scope functions and how do they differ?

Scope functions change the scope of operations on an object — `let`, `run`, `with`, `apply`, `also`. They differ in how they reference the object and what they return.

- **let** — Object as `it`, returns lambda result. Common for null checks and transformations.
- **run** — Object as `this`, returns lambda result. Good for computing a result using the object's methods.
- **with** — Object as `this`, returns lambda result. Same as `run` but called as `with(object)`.
- **apply** — Object as `this`, returns the object itself. Used for configuring an object after creation.
- **also** — Object as `it`, returns the object itself. Used for side effects like logging.

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

The key rule: `apply` and `also` return the object (useful for chaining), while `let`, `run`, and `with` return the lambda result.

#### When should you use let vs apply vs also?

Use `let` when you want to transform the object or perform a null check. Use `apply` when you're configuring the object — setting properties, calling setup methods. Use `also` when you want to do something with the object as a side effect without changing it.

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

If you find yourself nesting multiple scope functions, the code is getting harder to read. One level is fine, two is the maximum.

#### What is the difference between run and with?

Both use `this` as the context object and return the lambda result. The only difference is calling syntax — `run` is called on the object as an extension function, `with` takes the object as an argument.

`run` has an advantage over `with` because it can be used with nullable types using `?.run { }`. With `with`, you'd need a null check before calling it. In practice, `run` is more common.

#### What is an extension function?

An extension function is added to an existing class without modifying the class itself. The class you're extending becomes the receiver type, and inside the function you can access the receiver's public members using `this`.

```kotlin
fun String.isValidEmail(): Boolean {
    return this.contains("@") && this.contains(".")
}

val email = "user@example.com"
println(email.isValidEmail()) // true
```

Extension functions are resolved statically at compile time based on the declared type, not the runtime type. If a member function and an extension function have the same signature, the member function always wins.

#### How are extension functions resolved — statically or dynamically?

Extension functions are resolved statically based on the declared type of the variable at compile time. They do not participate in virtual dispatch.

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

Even though the runtime type is `Circle`, the extension on `Shape` is called because the parameter type is declared as `Shape`. This is fundamentally different from member functions which are dispatched based on runtime type.

#### Can you write an extension function on a nullable type?

Yes. You can define an extension function on a nullable receiver type, and `this` inside the function can be `null`.

```kotlin
fun String?.orDefault(default: String = "N/A"): String {
    return this ?: default
}

val name: String? = null
println(name.orDefault()) // "N/A"
```

This is how `toString()` works in Kotlin's standard library — there's an extension on `Any?` that handles null. Nullable extensions are useful for utility functions where you want to avoid `?.let` chains at the call site.

#### What is an infix function?

An infix function can be called without the dot operator and parentheses. It must be a member function or extension function with exactly one parameter.

```kotlin
infix fun Int.percentOf(total: Int): Double {
    return (this.toDouble() / total) * 100
}

val percentage = 25 percentOf 200 // 12.5
```

Common infix functions in the standard library include `to` (creates a `Pair`), `and`, `or`, `xor` (bitwise operations), and `until`, `downTo`, `step` (ranges).

#### What is an inline function and why does it matter for performance?

The `inline` modifier tells the compiler to copy the function's bytecode directly into the call site instead of creating a function object. This eliminates the overhead of creating a lambda object and an additional method call.

Without `inline`, every lambda creates an anonymous class instance at runtime. With `inline`, the lambda body is pasted directly at the call site — no object, no extra call.

```kotlin
inline fun measureTime(block: () -> Unit): Long {
    val start = System.nanoTime()
    block()
    return System.nanoTime() - start
}
```

Inline functions should only be used with higher-order functions. Inlining a function without lambda parameters just increases bytecode size without eliminating any object allocation.

#### What is a reified type parameter and why does it require inline?

`reified` allows you to access the actual type of a generic parameter at runtime. Normally, generic types are erased on the JVM. When a function is `inline`, its body is copied to the call site where the actual type is known, so the compiler can replace `T` with the real type.

```kotlin
inline fun <reified T> parseJson(json: String): T {
    return Gson().fromJson(json, T::class.java)
}

val user = parseJson<UserProfile>(jsonString)
```

Without `reified`, you'd need to pass the class explicitly: `parseJson(jsonString, UserProfile::class.java)`.

#### What is non-local return in inline functions?

In a normal lambda (non-inline), `return` only exits the lambda. In an inline function's lambda, `return` exits the enclosing function because the lambda body is directly inlined into it.

```kotlin
fun findAdmin(users: List<User>): User? {
    users.forEach { user ->
        if (user.role == "admin") return user // returns from findAdmin
    }
    return null
}
```

Non-local returns are only possible with inline functions because the lambda is part of the enclosing function's bytecode after inlining.

#### What are crossinline and noinline?

These control inlining behavior for lambda parameters:

- **crossinline** — The lambda is still inlined, but non-local returns are prohibited. Used when the lambda is called from a different execution context, like inside another lambda or an object expression.
- **noinline** — The lambda is not inlined at all. Used when you need to store the lambda in a variable or pass it to a non-inline function.

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

`crossinline` is needed because if the lambda runs on a different thread, a non-local return would try to return from a function that already finished executing.

#### What is the tailrec modifier?

`tailrec` tells the compiler to optimize a recursive function into a loop, avoiding stack overflow for deep recursion. The function must call itself as the very last operation.

```kotlin
tailrec fun factorial(n: Long, accumulator: Long = 1): Long {
    if (n <= 1) return accumulator
    return factorial(n - 1, n * accumulator)
}
```

Without `tailrec`, each recursive call adds a frame to the call stack. With `tailrec`, the compiler converts it into a `while` loop. The compiler warns if the function isn't actually tail-recursive.

#### What is a function reference and when is it better than a lambda?

A function reference (`::functionName`) refers to an existing function by name. It's useful when you want to pass a function directly instead of wrapping it in a lambda.

```kotlin
fun isAdult(user: User): Boolean = user.age >= 18

// Lambda
val adults = users.filter { user -> isAdult(user) }

// Function reference — cleaner
val adults = users.filter(::isAdult)
```

Function references work with top-level functions, member functions (`user::getName`), and constructors (`::User`). They produce the same bytecode as the equivalent lambda but read cleaner when the function already exists.

#### What is the difference between T.() -> Unit and (T) -> Unit as a function type?

`T.() -> Unit` is a function type with receiver — inside the lambda, `this` refers to `T` and you can call `T`'s members directly. `(T) -> Unit` is a regular function type — `T` is passed as a parameter and you access it as `it`.

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

`T.() -> Unit` is the foundation of DSLs and scope functions like `apply`.

#### How do scope functions behave with nullable receivers?

`let`, `run`, `apply`, and `also` can all be called on nullable types using `?.`. The lambda only executes if the object is non-null.

`with` is different — it takes the object as an argument, so you can pass a nullable value and `this` inside the block will be nullable:

```kotlin
val user: User? = findUser(id)

user?.let { println(it.name) }
user?.apply { name = name.uppercase() }

with(user) {
    this?.name  // need null checks inside
}
```

The `?.let` pattern is the most common for null handling. Avoid nesting `?.let` inside another `?.let` — use an `if` check with smart cast instead.

#### When should you NOT use inline functions?

Avoid inline when:
- The function doesn't take lambda parameters — there's no object allocation to eliminate
- The function body is large — the bytecode duplication outweighs the performance gain
- The function is part of a public API and might change — inlined code is baked into the caller
- The function has multiple lambda parameters you don't need to inline — mark those `noinline`

The Kotlin compiler emits a warning if you use `inline` on a function with no inlineable parameters.

#### What happens under the hood when you pass a lambda to a non-inline higher-order function?

The compiler generates an anonymous class that implements a `FunctionN` interface (`Function0`, `Function1`, etc.) and creates an instance at the call site. If the lambda captures variables from the enclosing scope, the generated class holds references to those captured variables.

For a lambda that doesn't capture anything, the compiler may create a singleton instance. But for a lambda that captures local variables, a new object is created every time. This is why `inline` matters for performance-critical paths — in a loop calling a higher-order function, each iteration allocates a new lambda object unless the function is `inline`.

### Common Follow-ups

- What is the difference between `forEach` with a lambda vs a `for` loop in performance?
- Can you use `return` inside a `let` block called on a nullable type?
- How would you write a custom scope function?
- Can extension functions access private members of the class they extend?
- What happens if an extension function has the same signature as a member function?
- How do you create a function type that can receive or return `null`?
- What is a functional interface (`fun interface`) and how does SAM conversion work?
