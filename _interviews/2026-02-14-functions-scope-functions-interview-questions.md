---
title: "Functions & Scope Functions"
date: 2026-02-14
layout: interview
tags: [Kotlin Round]
order: 2
sequence: 10
---

## Functions & Scope Functions

Functions are a core part of Kotlin interviews. Scope functions, higher-order functions, and inline functions are asked frequently because they show how well you understand Kotlin's functional side.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a higher-order function?

Higher-order function is a function that takes one or more functions as arguments, or returns a function as its result. Most Kotlin standard library functions like `map`, `filter`, `forEach` are higher-order functions. They let you pass behavior as a parameter instead of hardcoding it.

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

#### Q2: What is a lambda expression? What does `it` mean?

Lambda is an anonymous function — a block of code you can pass around as a value. The syntax is `{ parameters -> body }`. When a lambda has exactly one parameter, you can skip declaring it and use `it` as the implicit name.

```kotlin
val names = listOf("Alice", "Bob", "Charlie")

// Explicit parameter
names.filter { name -> name.length > 3 }

// Using 'it' — same thing
names.filter { it.length > 3 }

// Destructuring in lambda
val users = mapOf("u1" to "Alice", "u2" to "Bob")
users.forEach { (key, value) -> println("$key: $value") }
```

If the lambda is the last argument of a function, you can move it outside the parentheses. If it's the only argument, you can drop the parentheses entirely.

#### Q3: What are the five scope functions and what makes each one different?

Scope functions are functions that change the scope of operations on an object — `let`, `run`, `with`, `apply`, `also`. They differ in two ways: how they reference the object and what they return.

- **let** — Object as `it`, returns lambda result. Common for null checks and transformations.
- **run** — Object as `this`, returns lambda result. Good for computing a result using the object's methods.
- **with** — Object as `this`, returns lambda result. Same as `run` but called as `with(object)` instead of `object.run`.
- **apply** — Object as `this`, returns the object itself. Used for configuring an object after creation.
- **also** — Object as `it`, returns the object itself. Used for side effects like logging without modifying the chain.

```kotlin
// let — null check + transform
val displayName = user?.let { "${it.firstName} ${it.lastName}" }

// apply — configure an object
val intent = Intent(this, PaymentActivity::class.java).apply {
    putExtra("AMOUNT", 29.99)
    putExtra("CURRENCY", "USD")
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

// also — side effect in a chain
val result = repository.fetchOrders()
    .also { orders -> logger.debug("Fetched ${orders.size} orders") }
    .filter { it.status == Status.PENDING }
```

The key rule: `apply` and `also` return the object (useful for chaining), while `let`, `run`, and `with` return the lambda result (useful for transformations).

#### Q4: What is an extension function?

Extension function is a function added to an existing class without modifying the class itself. The class you're extending becomes the receiver type, and inside the function you can access the receiver's public members using `this`.

```kotlin
fun String.isValidEmail(): Boolean {
    return this.contains("@") && this.contains(".")
}

val email = "user@example.com"
println(email.isValidEmail()) // true
```

Extension functions are resolved statically at compile time based on the declared type of the variable, not the runtime type. This means they don't support polymorphism — if a `Dog` class extends `Animal`, calling an extension on an `Animal` reference always calls the `Animal` extension even if the actual object is a `Dog`.

#### Q5: What is an infix function?

Infix function is a function that can be called without the dot operator and parentheses. It must be a member function or extension function with exactly one parameter.

```kotlin
infix fun Int.percentOf(total: Int): Double {
    return (this.toDouble() / total) * 100
}

val percentage = 25 percentOf 200 // 12.5
```

Common infix functions in the standard library include `to` (creates a `Pair`), `and`, `or`, `xor` (bitwise operations), and `until`, `downTo`, `step` (ranges). Infix notation improves readability for binary operations but should not be overused — it only makes sense when the function reads naturally as an operation between two values.

#### Q6: When should you use let vs apply vs also?

Use `let` when you want to transform the object into something else or perform a null check. Use `apply` when you're configuring the object itself — setting properties, calling setup methods. Use `also` when you want to do something with the object as a side effect without changing it.

```kotlin
// let — transform or null check
val length = userName?.let { it.trim().length }

// apply — configure an object
val textView = TextView(context).apply {
    text = "Hello"
    textSize = 16f
    setTextColor(Color.BLACK)
}

// also — logging, validation, side effects
fun createUser(name: String): User {
    return User(name).also { logger.info("Created user: ${it.name}") }
}
```

If you find yourself nesting multiple scope functions, that's a sign the code is getting harder to read. One level is fine, two is the maximum.

#### Q7: What is the difference between run and with?

Both use `this` as the context object and return the lambda result. The only difference is the calling syntax — `run` is called on the object as an extension function, `with` takes the object as an argument.

```kotlin
// run — extension function syntax
val result = userService.run {
    fetchUser(userId)
}

// with — regular function syntax
val result = with(userService) {
    fetchUser(userId)
}
```

`run` has an advantage over `with` because it can be used with nullable types using `?.run { }`. With `with`, you'd need a null check before calling it. In practice, `run` is more common in Kotlin codebases because it chains naturally with other calls.

### Deep Dive Questions (Advanced → Expert)

#### Q8: What is an inline function and why does it matter for performance?

The `inline` modifier tells the Kotlin compiler to copy the function's bytecode directly into the call site instead of creating a function object. This eliminates the overhead of creating a lambda object and an additional method call on every invocation.

Without `inline`, every lambda you pass creates an anonymous class instance at runtime. For a function like `filter` called inside a loop, that's an object allocation per iteration. With `inline`, the lambda body is directly pasted into the call site — no object, no extra call.

```kotlin
inline fun measureTime(block: () -> Unit): Long {
    val start = System.nanoTime()
    block()
    return System.nanoTime() - start
}

// After inlining, this compiles to:
// val start = System.nanoTime()
// doSomething()   <-- block body pasted here
// val elapsed = System.nanoTime() - start
```

Inline functions should only be used with higher-order functions. Inlining a regular function without lambda parameters doesn't help — it just increases bytecode size without eliminating any object allocation.

#### Q9: What is a reified type parameter and why does it require inline?

`reified` allows you to access the actual type of a generic parameter at runtime. Normally, generic types are erased on the JVM — inside a function `<T>`, you can't do `T::class` because the type info is gone at runtime.

When a function is `inline`, its body is copied to the call site where the actual type is known. So the compiler can replace `T` with the real type. That's why `reified` only works with `inline` functions.

```kotlin
inline fun <reified T> parseJson(json: String): T {
    return Gson().fromJson(json, T::class.java)
}

// Usage — no need to pass Class<T> manually
val user = parseJson<UserProfile>(jsonString)
```

Without `reified`, you'd need to pass the class explicitly: `parseJson(jsonString, UserProfile::class.java)`. Reified cleans up the API by letting the compiler insert the class reference automatically.

#### Q10: What is non-local return in inline functions?

In a normal lambda (non-inline), `return` only exits the lambda, not the enclosing function. But in an inline function's lambda, `return` exits the enclosing function because the lambda body is directly inlined into it.

```kotlin
inline fun processUsers(users: List<User>, action: (User) -> Unit) {
    for (user in users) {
        action(user)
    }
}

fun findAdmin(users: List<User>): User? {
    processUsers(users) { user ->
        if (user.role == "admin") return user // returns from findAdmin
    }
    return null
}
```

This is called non-local return because `return` exits a function that is not the lambda's own scope. Non-local returns are only possible with inline functions because the lambda is part of the enclosing function's bytecode after inlining.

#### Q11: What are crossinline and noinline?

These are modifiers for lambda parameters in inline functions to control inlining behavior:

- **crossinline** — The lambda is still inlined, but non-local returns are prohibited. Use this when the lambda is called from a different execution context, like inside another lambda or an object expression.
- **noinline** — The lambda is not inlined at all. Use this when you need to store the lambda in a variable, pass it to a non-inline function, or return it.

```kotlin
inline fun runOnBackground(
    crossinline action: () -> Unit,
    noinline callback: () -> Unit
) {
    Thread {
        action()        // crossinline — can't use 'return' here
        callback()      // noinline — stored/passed as object
    }.start()
    storeCallback(callback)  // noinline can be passed around
}
```

`crossinline` is needed because if the lambda runs on a different thread, a non-local return would try to return from a function that already finished executing on the original thread. `noinline` is needed when the lambda must exist as an object — inlined code can't be stored in a variable.

#### Q12: How are extension functions resolved — statically or dynamically?

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

Even though the runtime type is `Circle`, the extension on `Shape` is called because the parameter type is declared as `Shape`. This is fundamentally different from regular member functions which are dispatched based on runtime type. If a member function and an extension function have the same signature, the member function always wins.

#### Q13: Can you write an extension function on a nullable type?

Yes. You can define an extension function on a nullable receiver type, and `this` inside the function can be `null`. You need to handle the null case yourself.

```kotlin
fun String?.orDefault(default: String = "N/A"): String {
    return this ?: default
}

val name: String? = null
println(name.orDefault()) // "N/A"
```

This is how `toString()` works in Kotlin's standard library — there's an extension on `Any?` that handles null. Nullable extensions are useful for utility functions where you want to avoid `?.let` chains at the call site, but use them sparingly because they hide the fact that the receiver might be null.

#### Q14: Explain the difference between lambda and anonymous function in terms of return behavior.

A lambda's `return` is a non-local return (exits the enclosing function) when used inside an inline function. To return from just the lambda itself, you use a labeled return: `return@functionName`.

An anonymous function's `return` always returns from the anonymous function itself, never the enclosing function. This is because the anonymous function has its own function boundary.

```kotlin
fun findFirstAdmin(users: List<User>): User? {
    // Lambda — 'return' exits findFirstAdmin
    users.forEach { user ->
        if (user.role == "admin") return user
    }

    // Anonymous function — 'return' exits only this function
    users.forEach(fun(user) {
        if (user.role == "admin") return // exits anonymous function only
    })

    return null
}
```

In practice, lambdas are used far more often. Anonymous functions are mainly useful when you specifically want `return` to exit only the function body without using labeled returns.

#### Q15: What is the tailrec modifier and when would you use it?

`tailrec` tells the compiler to optimize a recursive function into a loop, avoiding stack overflow for deep recursion. The function must call itself as the very last operation — no computation can happen after the recursive call.

```kotlin
tailrec fun factorial(n: Long, accumulator: Long = 1): Long {
    if (n <= 1) return accumulator
    return factorial(n - 1, n * accumulator) // tail position
}
```

Without `tailrec`, each recursive call adds a frame to the call stack. For large inputs, this causes `StackOverflowError`. With `tailrec`, the compiler converts the recursion into a `while` loop — constant stack space regardless of input size.

The compiler shows a warning if you use `tailrec` on a function that isn't actually tail-recursive. A function is not tail-recursive if the recursive call isn't the last operation — for example, `return n * factorial(n - 1)` does multiplication after the recursive call, so it can't be optimized.

#### Q16: How do scope functions behave with nullable receivers?

`let`, `run`, `apply`, and `also` can all be called on nullable types using the safe call operator `?.`. When called this way, the lambda only executes if the object is non-null.

`with` is different — it takes the object as an argument, so you can pass a nullable value and `this` inside the block will be nullable:

```kotlin
val user: User? = findUser(id)

// Safe call — block runs only if user is not null
user?.let { println(it.name) }
user?.apply { name = name.uppercase() }
user?.run { sendNotification(email) }
user?.also { logger.info("Found: ${it.name}") }

// with — 'this' is nullable inside the block
with(user) {
    this?.name  // need null checks inside
}
```

The `?.let` pattern is the most common for null handling. Avoid nesting `?.let` inside another `?.let` — use an `if` check with smart cast instead when you have multiple nullable values.

#### Q17: What happens under the hood when you pass a lambda to a non-inline higher-order function?

The compiler generates an anonymous class that implements a `FunctionN` interface (like `Function0`, `Function1`, etc.) and creates an instance of it at the call site. If the lambda captures variables from the enclosing scope, the generated class holds references to those captured variables.

For a lambda that doesn't capture anything, the compiler may optimize by creating a singleton instance and reusing it. But for a lambda that captures local variables, a new object is created every time that code executes.

This is why `inline` matters for performance-critical paths. In a loop calling a higher-order function, each iteration allocates a new lambda object unless the function is `inline`. For standard library functions like `map`, `filter`, and `forEach`, this overhead is already eliminated because they're all inline functions.

#### Q18: When should you NOT use inline functions?

Inline functions increase bytecode size because the function body is duplicated at every call site. If the function has a large body and is called from many places, the binary size grows significantly.

Avoid inline when:
- The function doesn't take lambda parameters — there's no object allocation to eliminate
- The function body is large — the bytecode duplication outweighs the performance gain
- The function is part of a public API and might change — inlined code is baked into the caller, so updating the library won't update already-compiled callers
- The function has multiple lambda parameters you don't need to inline — mark those `noinline` instead

The Kotlin compiler emits a warning if you use `inline` on a function with no inline-able parameters, because it's purely increasing bytecode size without any benefit.

### Common Follow-ups

- What is the difference between `forEach` with a lambda vs a `for` loop in terms of performance?
- Can you use `return` inside a `let` block that's called on a nullable type?
- How would you write a custom scope function?
- What is the difference between `T.() -> Unit` and `(T) -> Unit` as a function type?
- Can extension functions access private members of the class they extend?
- What is a function reference (`::functionName`) and when is it better than a lambda?
- How do you create a function type that can receive or return `null`?
- What happens if an extension function has the same signature as a member function?
