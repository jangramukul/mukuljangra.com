---
title: Kotlin Infix Functions and Operator Overloading Guide
layout: post
sequence: 90
categories: post
tags:
  - Kotlin
  - Android
---

Most Kotlin features I've adopted over the years fall into one of two buckets: things that save typing, and things that change how I express ideas. Infix functions and operator overloading sit firmly in the second bucket. They let you define how operators and function calls read in your codebase — turning `vector1.plus(vector2)` into `vector1 + vector2`, or `map.put("key", "value")` into `"key" to "value"`. The shift isn't just cosmetic. When your code reads closer to the domain it models, bugs become more visible because violations of intent stick out syntactically.

But here's the thing — these features are a double-edged sword. Used well, they create expressive, almost self-documenting APIs. Used carelessly, they produce clever-looking code that nobody can debug six months later. I've seen codebases where operator overloading turned simple data transformations into hieroglyphics. The key isn't knowing the syntax (that's the easy part). It's developing judgment about when custom operators and infix functions genuinely improve readability versus when they just satisfy a developer's urge to be clever.

## Infix Functions

An infix function lets you call a function using the `a func b` syntax — dropping the dot and parentheses. Kotlin has three strict requirements for a function to qualify as infix: it must be a member function or an extension function, it must have exactly one parameter, and that parameter cannot use `vararg` or have a default value. These constraints exist for a reason. The `a func b` syntax always needs exactly two operands — the receiver and the argument — so the compiler needs guarantees about parameter count.

You've already used infix functions without thinking about it. The `to` function that creates a `Pair` is infix: `"name" to "Mukul"` is actually `"name".to("Mukul")`. The `in` keyword for containment checks like `element in list` calls `list.contains(element)`. And `downTo`, `until`, and `step` from ranges are all infix functions. The standard library uses them extensively because they make common patterns read like natural language rather than method chains.

```kotlin
// Standard library infix functions you use daily
val headers = mapOf(
    "Content-Type" to "application/json",
    "Authorization" to "Bearer $token"
)

// 'to' is just an infix extension function on Any
// public infix fun <A, B> A.to(that: B): Pair<A, B> = Pair(this, that)
```

Where infix really shines is in testing DSLs and domain-specific APIs. When I write assertions in tests, I want them to read like specifications. `result shouldEqual expected` communicates intent far more clearly than `assertEquals(expected, result)`, where I always have to double-check which argument is "expected" and which is "actual."

```kotlin
infix fun <T> T.shouldEqual(expected: T) {
    if (this != expected) {
        throw AssertionError("Expected <$expected> but was <$this>")
    }
}

infix fun <T> T.shouldBeIn(collection: Collection<T>) {
    if (this !in collection) {
        throw AssertionError("Expected <$this> to be in $collection")
    }
}

// Usage reads like English
val loginResult = authService.login("user@test.com", "password123")
loginResult.status shouldEqual AuthStatus.SUCCESS
loginResult.userId shouldBeIn activeUserIds
```

The judgment call with infix is about natural reading order. `data shouldBe valid` reads well — subject, verb, object. `config add feature` is less clear because `add` doesn't read naturally between two nouns without more context. My rule of thumb: if you have to pause to parse the expression, use normal dot-call syntax instead. Infix is a readability tool, and if it doesn't improve readability, it's the wrong tool. One more practical note: infix functions have lower precedence than arithmetic operators but higher precedence than boolean operators like `&&` and `||`. This means `1 shl 2 + 3` parses as `1 shl (2 + 3)`, which catches people off guard. When mixing infix calls with other operators, use explicit parentheses to make the evaluation order obvious.

## Operator Overloading

Kotlin doesn't let you invent new operators — you can only overload existing ones. Every operator maps to a specific function name. When you write `a + b`, the compiler translates it to `a.plus(b)`. When you write `a[i]`, it becomes `a.get(i)`. When you write `a in b`, it becomes `b.contains(a)`. This is a deliberate design choice that keeps the operator set bounded and predictable while letting you define what those operators mean for your types.

Here's a practical example. Vectors are a classic case where operator overloading makes code dramatically clearer, because vector arithmetic maps directly to mathematical operators:

```kotlin
data class Vector(val x: Double, val y: Double) {

    operator fun plus(other: Vector) = Vector(x + other.x, y + other.y)

    operator fun minus(other: Vector) = Vector(x - other.x, y - other.y)

    operator fun times(scalar: Double) = Vector(x * scalar, y * scalar)

    operator fun unaryMinus() = Vector(-x, -y)

    operator fun get(index: Int): Double = when (index) {
        0 -> x
        1 -> y
        else -> throw IndexOutOfBoundsException("Vector has only 2 components")
    }
}

// Usage reads like math, not like Java
val velocity = Vector(3.0, 4.0)
val acceleration = Vector(0.0, -9.8)
val deltaTime = 0.016

val newVelocity = velocity + acceleration * deltaTime
val reversed = -velocity
val xComponent = velocity[0]
```

The major operator conventions in Kotlin break down into several categories. **Arithmetic operators** cover `plus`, `minus`, `times`, `div`, and `rem` — these map to `+`, `-`, `*`, `/`, and `%` respectively. Each also has a compound assignment variant (`plusAssign`, `minusAssign`, etc.) for `+=`, `-=`, and so on. **Unary operators** include `unaryPlus`, `unaryMinus`, `not`, `inc`, and `dec` — mapping to `+a`, `-a`, `!a`, `a++`, and `a--`.

**Comparison operators** work through a single function: `compareTo`. If your class implements `compareTo` returning an `Int`, you automatically get `<`, `>`, `<=`, and `>=`. Equality (`==`) routes through `equals`, which every class inherits from `Any`. **Index access** uses `get` and `set` — so `map[key]` calls `map.get(key)` and `map[key] = value` calls `map.set(key, value)`.

The **`contains`** operator powers the `in` keyword. When you write `element in collection`, the compiler calls `collection.contains(element)`. The **`iterator`** operator enables for-loop support — any object with an `operator fun iterator()` that returns something with `hasNext()` and `next()` can be used in a `for` loop. And then there's **`invoke`**, which deserves its own section because it fundamentally changes how you think about callable objects.

## The invoke Operator

The `invoke` operator lets an object be called like a function. Define `operator fun invoke()` (with whatever parameters you need), and you can use parentheses directly on instances of that class. This sounds like a gimmick until you see it applied to validators, handlers, and use-case classes — places where an object's entire purpose is to perform one action.

```kotlin
class InputValidator(private val rules: List<(String) -> String?>) {

    operator fun invoke(input: String): ValidationResult {
        val errors = rules.mapNotNull { rule -> rule(input) }
        return if (errors.isEmpty()) {
            ValidationResult.Valid
        } else {
            ValidationResult.Invalid(errors)
        }
    }
}

sealed class ValidationResult {
    data object Valid : ValidationResult()
    data class Invalid(val errors: List<String>) : ValidationResult()
}

// Build a validator with rules
val validateEmail = InputValidator(listOf(
    { if (it.isBlank()) "Email cannot be empty" else null },
    { if ("@" !in it) "Email must contain @" else null },
    { if (it.length > 254) "Email too long" else null }
))

// Call it like a function
val result = validateEmail("user@example.com")
```

This pattern is especially common in Clean Architecture, where use-case classes represent single operations. Instead of calling `getUserProfile.execute(userId)`, you call `getUserProfile(userId)`. The `invoke` operator makes use cases feel like first-class functions while keeping the dependency injection and testability benefits of a full class.

```kotlin
class GetUserProfile(
    private val userRepository: UserRepository,
    private val imageLoader: ImageLoader
) {

    operator fun invoke(userId: String): Flow<UserProfile> {
        return userRepository.observeUser(userId)
            .map { user ->
                UserProfile(
                    name = user.displayName,
                    avatarUrl = imageLoader.resolveUrl(user.avatarPath),
                    memberSince = user.createdAt
                )
            }
    }
}

// In ViewModel — reads cleanly
class ProfileViewModel(
    private val getUserProfile: GetUserProfile
) : ViewModel() {

    fun loadProfile(userId: String) {
        getUserProfile(userId)
            .onEach { profile -> _state.value = profile }
            .launchIn(viewModelScope)
    }
}
```

I've used this pattern on every Android project for the past three years. The `invoke` operator eliminates the need to bikeshed over method names (`execute`, `run`, `perform`, `call`) and makes use-case classes compose naturally with higher-order functions since they look and behave like lambdas from the call site.

## Destructuring and componentN()

Destructuring declarations use a convention you might not realize is operator overloading. When you write `val (name, age) = user`, the compiler generates calls to `user.component1()` and `user.component2()`. These are operator functions — they need the `operator` modifier, and the compiler resolves them by position, not by name.

Data classes generate `componentN()` functions automatically for every property declared in the primary constructor. That's why destructuring "just works" with them. But for non-data classes, you need to define these functions yourself. This is useful when you want to expose a destructuring API without making a class a data class (which forces `equals`, `hashCode`, and `copy` generation that you might not want).

```kotlin
class Color(val hex: String) {

    val red: Int get() = hex.substring(1, 3).toInt(16)
    val green: Int get() = hex.substring(3, 5).toInt(16)
    val blue: Int get() = hex.substring(5, 7).toInt(16)

    operator fun component1() = red
    operator fun component2() = green
    operator fun component3() = blue
}

// Destructure computed properties
val brandColor = Color("#FF5733")
val (r, g, b) = brandColor
println("RGB: $r, $g, $b")  // RGB: 255, 87, 51

// Works in lambdas too
val palette = listOf(Color("#FF5733"), Color("#33FF57"), Color("#3357FF"))
palette.forEach { (red, green, blue) ->
    applyColorFilter(red, green, blue)
}
```

The important thing to understand is that destructuring is positional, not named. `val (name, age) = user` assigns `component1()` to `name` and `component2()` to `age`. If someone reorders the properties in the data class, your destructuring silently breaks — the variables still compile but now hold the wrong values. This is why I'm cautious about destructuring data classes with more than three or four properties, or where the properties have similar types that wouldn't produce a type error if swapped.

## When NOT to Use Operator Overloading

The biggest mistake I see with operator overloading is overloading operators where the semantics don't match the symbol. `+` should mean combining, adding, or appending — something additive. If you define `user + permission`, what does that mean? Does it return a new user with the permission added? Does it modify the user? Does it create some kind of association object? The operator obscures the intent rather than clarifying it. Just write `user.grantPermission(permission)` — it's longer, but everyone instantly knows what it does.

Operators should behave as mathematically or logically expected. If you define `plus`, it should be commutative if the domain concept is commutative. If you define `compareTo`, the ordering should be total and consistent. If you define `get` and `set`, they should behave like indexed access, not like arbitrary method calls dressed up in bracket syntax. The moment an operator surprises a reader, it's become a net negative for your codebase.

The same principle applies to infix functions. `data shouldBe valid` reads naturally because `shouldBe` acts as a verb connecting subject and predicate. `user perform action` is cryptic — is `perform` a verb? Is `user` doing the performing? The function name has to work as a natural-language connector between the two operands, or the infix notation is worse than a regular method call. I keep a mental test: read the expression aloud. If it sounds like something you'd say to a colleague explaining the code, infix is appropriate. If it sounds stilted or ambiguous, use dot syntax.

## Under the Hood

Neither infix functions nor operator overloading introduce any runtime mechanism. They're purely compile-time syntactic transformations. `v1 + v2` becomes `v1.plus(v2)` in bytecode. `2 pow 10` (if you defined an infix `pow`) becomes `2.pow(10)` — or more precisely, since `Int` is a primitive, the compiler might box it depending on how the extension is defined. The point is that there's no special dispatch, no reflection, no operator lookup table. It's a regular method call with a nicer syntax at the source level.

This means operator-overloaded code has exactly the same performance characteristics as the equivalent method-call code. The JVM sees identical bytecode. Inlining, escape analysis, JIT optimization — all apply the same way. You can verify this yourself by looking at the Kotlin bytecode viewer in IntelliJ (Tools → Kotlin → Show Kotlin Bytecode → Decompile). I check this whenever I'm unsure about a performance-sensitive path, and every time, the compiled output is exactly what I'd expect from a regular method call. Zero runtime overhead, zero magic.

One detail worth knowing: if your operator function is small (a few lines), marking it `inline` can eliminate the function call overhead entirely. The compiler will paste the function body at the call site. This matters mostly for hot paths — game loops, pixel processing, physics calculations — where even method call overhead adds up across thousands of iterations per frame. For typical business logic, the JVM's JIT compiler already inlines small methods automatically, so the explicit `inline` keyword is unnecessary.

Thanks for reading!

## Quiz

#### What are the requirements for an infix function in Kotlin?

- **Wrong** It must be a top-level function with no parameters
- **Correct** It must be a member or extension function with exactly one parameter (no vararg or default)
- **Wrong** It must return Unit
- **Wrong** It must be declared in a companion object

> **Explanation:** Infix functions must be member functions or extension functions, have exactly one parameter, and that parameter cannot be vararg or have a default value. These constraints ensure the `a func b` syntax always has exactly two operands.

#### What does `operator fun invoke()` allow you to do?

- **Wrong** It makes the class implement the Callable interface
- **Correct** It allows an object to be called like a function using parentheses syntax
- **Wrong** It overrides the default constructor
- **Wrong** It makes the class a functional interface

> **Explanation:** The `invoke` operator lets you call an object with function syntax: `validator("input")` instead of `validator.validate("input")`. This is particularly useful for use-case classes in Clean Architecture and callable configuration objects.

## Coding Challenge

Create a `Money` data class with amount (Double) and currency (String). Implement operator overloading for: plus (same currency only, throw if different), minus, times (by scalar), comparison, and unaryMinus. Also create an infix function `convertTo` that takes a currency string and a Map of exchange rates. Show usage with val total = Money(100.0, "USD") + Money(50.0, "USD") and money convertTo "EUR".

#### Solution

```kotlin
data class Money(val amount: Double, val currency: String) : Comparable<Money> {

    operator fun plus(other: Money): Money {
        require(currency == other.currency) {
            "Cannot add $currency and ${other.currency} — convert first"
        }
        return Money(amount + other.amount, currency)
    }

    operator fun minus(other: Money): Money {
        require(currency == other.currency) {
            "Cannot subtract $currency and ${other.currency} — convert first"
        }
        return Money(amount - other.amount, currency)
    }

    operator fun times(scalar: Double) = Money(amount * scalar, currency)

    operator fun unaryMinus() = Money(-amount, currency)

    override fun compareTo(other: Money): Int {
        require(currency == other.currency) {
            "Cannot compare $currency and ${other.currency}"
        }
        return amount.compareTo(other.amount)
    }

    infix fun convertTo(target: String): Money {
        if (currency == target) return this
        val rate = exchangeRates["${currency}_$target"]
            ?: throw IllegalArgumentException("No rate for $currency → $target")
        return Money(amount * rate, target)
    }

    companion object {
        var exchangeRates: Map<String, Double> = mapOf(
            "USD_EUR" to 0.92,
            "EUR_USD" to 1.09,
            "USD_GBP" to 0.79,
            "GBP_USD" to 1.27
        )
    }

    override fun toString() = "${"%.2f".format(amount)} $currency"
}

fun main() {
    val price = Money(100.0, "USD")
    val tax = Money(50.0, "USD")

    val total = price + tax
    println("Total: $total")                  // 150.00 USD

    val discounted = total * 0.9
    println("After discount: $discounted")    // 135.00 USD

    val refund = -price
    println("Refund: $refund")                // -100.00 USD

    val inEuros = total convertTo "EUR"
    println("In euros: $inEuros")             // 138.00 EUR

    println("Price > Tax? ${price > tax}")    // true
}
```
