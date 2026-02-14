---
title: "Kotlin Basics & Type System"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 1
sequence: 1
description: "Kotlin basics and type system questions come up in almost every Android interview."
---

## Kotlin Basics & Type System

Kotlin basics and type system questions come up in almost every Android interview. Companies use these to quickly check if you actually write Kotlin daily or just know it surface-level.

#### What is the difference between val and var?

`val` is read-only — once assigned, you cannot reassign it. `var` is mutable and can be reassigned. Note that `val` does not mean immutable — if you have a `val list = mutableListOf<String>()`, the reference can't change but the list contents can. Under the hood, `val` generates only a getter while `var` generates both getter and setter.

#### How does null safety work in Kotlin?

Kotlin's type system distinguishes between nullable (`String?`) and non-nullable (`String`) types at compile time. The safe call operator `?.` calls a method only if the object is not null and returns null otherwise. The `!!` operator asserts that a value is not null and throws a `NullPointerException` if it is. `let` is a scope function often used with `?.` to execute a block only when the value is non-null:

```kotlin
val userName: String? = getUserName()

val length = userName?.length

userName?.let { name ->
    showGreeting(name)
}

val forcedLength = userName!!.length
```

Prefer `?.let` over `!!` in almost every case. The `!!` operator is a code smell unless you can guarantee non-nullness through control flow.

#### What is the difference between == and === in Kotlin?

`==` checks structural equality — it calls `equals()` under the hood. `===` checks referential equality — whether two references point to the exact same object in memory.

For data classes, `==` compares the property values because `equals()` is auto-generated. For regular classes, `==` uses the default `Any.equals()` which is referential equality unless you override it. The JVM caches small `Int` values (-128 to 127), so boxing the same small integer twice may give `===` as true, but larger values will be different objects.

#### What are smart casts in Kotlin?

Smart cast means the compiler automatically casts a type after a type check, so you don't need to cast manually. After an `is` check inside an `if` or `when`, the compiler knows the type and lets you use it directly:

```kotlin
fun processInput(input: Any) {
    when (input) {
        is String -> println(input.length)
        is Int -> println(input * 2)
        is UserProfile -> println(input.displayName)
    }
}
```

Smart casts only work when the compiler can guarantee the variable hasn't changed between the check and the usage. They don't work on `var` properties or open properties because another thread or subclass could change the value.

#### What is the difference between as and as? for casting?

`as` is an unsafe cast — it throws a `ClassCastException` if the cast fails. `as?` is a safe cast — it returns `null` if the cast fails instead of throwing.

```kotlin
val input: Any = "Hello"

val str: String = input as String     // works
val num: Int = input as Int           // ClassCastException

val safeNum: Int? = input as? Int     // null, no crash
```

Use `as?` when you're not sure about the type. Use `as` only after an `is` check or when you're certain the type is correct.

#### Explain Kotlin's type hierarchy — Any, Unit, and Nothing.

- **Any** — Root of the class hierarchy. Every class inherits from `Any`. It provides `equals()`, `hashCode()`, and `toString()`. Similar to Java's `Object`, but `Any` is non-nullable by default.
- **Unit** — Equivalent of Java's `void`. A function with no meaningful return value returns `Unit`. Unlike `void`, `Unit` is an actual object, which is why you can use it as a generic type parameter.
- **Nothing** — Represents a value that never exists. A function returning `Nothing` never returns normally — it always throws an exception or runs forever. `Nothing` is a subtype of every type, which is why `throw` can be used in any expression.

```kotlin
fun logEvent(event: String): Unit {
    analytics.track(event)
}

fun throwError(message: String): Nothing {
    throw IllegalStateException(message)
}

val result: String = userInput ?: throwError("Input required")
```

#### What is the difference between Any and Any? in the type hierarchy?

`Any` is the root of the non-nullable type hierarchy. `Any?` is the root of the entire type hierarchy, including nullable types. Every type in Kotlin is a subtype of `Any?`, but only non-nullable types are subtypes of `Any`.

`Nothing` sits at the bottom — it's a subtype of every type. `Nothing?` has exactly one value: `null`. This is why `null` can be assigned to any nullable type. When Kotlin code is compiled to JVM bytecode, `Any` maps to `java.lang.Object`.

#### What is a data class and what methods does it generate?

Data class is a special type of class used to hold data. The compiler automatically generates `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions based on the properties declared in the primary constructor. Properties declared in the class body are excluded from these generated methods.

```kotlin
data class PaymentInfo(
    val amount: Double,
    val currency: String,
    val timestamp: Long
) {
    var isProcessed: Boolean = false // not in equals/hashCode/copy
}

val payment = PaymentInfo(29.99, "USD", System.currentTimeMillis())
val refund = payment.copy(amount = -29.99)

val (amount, currency, _) = payment
```

A data class must have at least one primary constructor parameter and cannot be abstract, open, sealed, or inner. The `copy()` function creates a shallow copy — if a property is a mutable list, both the original and copy point to the same list instance.

#### How do copy() and componentN() work in data classes?

`copy()` creates a new instance with the same property values, letting you override specific ones. It's a shallow copy — reference-type properties still point to the same object. The `componentN()` functions return properties in declaration order and enable destructuring.

```kotlin
data class UserSession(val userId: String, val roles: MutableList<String>)

val session = UserSession("u1", mutableListOf("admin"))
val copied = session.copy()
copied.roles.add("editor")

// session.roles is also ["admin", "editor"] — shallow copy
```

Only properties in the primary constructor participate in `copy()`, `equals()`, `hashCode()`, and `componentN()`. Properties in the class body are completely ignored by these generated methods.

#### What is the difference between sealed class and enum class?

Enum class is used for defining constants where each value is a single instance. Sealed class has the same concept but allows each subclass to hold different data and have multiple instances.

- **Enum** — Each entry is a singleton. All entries share the same structure.
- **Sealed class** — Each subclass can have its own properties, constructors, and multiple instances.

```kotlin
enum class PaymentMethod { CARD, CASH, UPI }

sealed class PaymentResult {
    data class Success(val transactionId: String) : PaymentResult()
    data class Failure(val error: Throwable, val code: Int) : PaymentResult()
    data object Loading : PaymentResult()
}
```

The compiler knows all subclasses of a sealed class at compile time, so `when` expressions are exhaustive without needing an `else` branch. Sealed interfaces work the same way but allow a class to implement multiple sealed hierarchies.

#### What is the difference between sealed class and sealed interface?

Sealed class restricts inheritance to the same package and module, and subclasses must extend the sealed class directly. Since Kotlin only allows single inheritance, a class can only extend one sealed class.

Sealed interface removes the single-inheritance restriction. A class can implement multiple sealed interfaces.

```kotlin
sealed interface NetworkError
sealed interface DatabaseError

data class TimeoutError(val duration: Long) : NetworkError, DatabaseError
data class AuthError(val reason: String) : NetworkError
```

Use sealed class when you need shared state or behavior through a common constructor. Use sealed interface when you only need the exhaustive `when` check without shared state, or when a subclass needs to belong to multiple sealed hierarchies.

#### What is a value class and when would you use it?

Value class is a lightweight wrapper around a single value that avoids runtime object allocation. The compiler inlines the wrapped value wherever possible, so there's no extra heap allocation.

```kotlin
@JvmInline
value class UserId(val id: String)

@JvmInline
value class OrderId(val id: String)

fun fetchOrder(userId: UserId, orderId: OrderId) {
    // Can't accidentally swap userId and orderId
}
```

A value class must have exactly one property in the primary constructor and is marked with `@JvmInline`. At runtime, the wrapper is removed and only the underlying value remains. Boxing happens when the value class is used as a nullable type, generic type parameter, or through an interface.

#### Explain the object keyword — singleton, companion object, and anonymous object.

The `object` keyword has three uses:

- **Object declaration (singleton)** — Creates a single instance, lazily initialized on first access. Thread-safe because the JVM guarantees class loading is synchronized.
- **Companion object** — A singleton tied to a class. Members can be accessed through the class name like static methods in Java, but it's actually an object instance.
- **Anonymous object** — Creates an unnamed instance of a class or interface, similar to Java's anonymous inner class.

```kotlin
object NetworkClient {
    fun makeRequest(url: String) { /* ... */ }
}

class PaymentProcessor {
    companion object {
        const val MAX_RETRY = 3
        fun create(): PaymentProcessor = PaymentProcessor()
    }
}

val callback = object : View.OnClickListener {
    override fun onClick(v: View?) { handleClick() }
}
```

Companion object members look like static access (`PaymentProcessor.MAX_RETRY`), but in bytecode a companion object is a nested class with an instance. Use `@JvmStatic` to generate actual static methods for Java interop.

#### What is the difference between lateinit and lazy?

Both delay initialization, but they work differently:

- **lateinit** — Used with `var` properties. Tells the compiler the property will be initialized before first use. Works only with non-nullable, non-primitive types. Throws `UninitializedPropertyAccessException` if accessed before initialization.
- **lazy** — Used with `val` properties. Takes a lambda and initializes the value on first access. Thread-safe by default. The value is computed once and cached.

```kotlin
class LoginViewModel : ViewModel() {
    lateinit var authRepository: AuthRepository

    val analytics: AnalyticsTracker by lazy {
        AnalyticsTracker.getInstance()
    }
}
```

Use `lateinit` when the value will be set from outside (dependency injection, `onCreate`). Use `lazy` when the value can be computed from available state and you want to defer that computation.

#### How does lateinit work under the hood?

`lateinit` removes the null check that the compiler normally adds for non-nullable types. In bytecode, a `lateinit var` is stored as a nullable field initialized to `null`. Every access site has a generated null check — if the field is still `null`, it throws `UninitializedPropertyAccessException`.

It cannot be used with primitive types because primitives can't be `null` on the JVM, so there's no sentinel value to detect uninitialized state. The `::property.isInitialized` check works by inspecting whether the backing field is still `null`.

#### What is const val and how is it different from val?

`const val` is a compile-time constant. The value must be a primitive type or `String` and must be known at compile time. The compiler inlines the value at every usage site.

`val` is a runtime constant — the value is set when the code executes. It can hold any type and can be computed from function calls.

```kotlin
companion object {
    const val MAX_RETRIES = 3
    val DEFAULT_TIMEOUT = Duration.ofSeconds(30)
}
```

`const val` can only be used at the top level, inside an `object`, or inside a `companion object`.

#### What is the difference between companion object and top-level functions?

Top-level functions are true static functions in the bytecode — no enclosing class, no object instance. Companion object members are instance methods on a nested companion class, accessed through a static `Companion` reference (unless you use `@JvmStatic`).

Use top-level functions for utility operations that don't belong to any specific class. Use companion objects when the function is logically tied to the class, like factory methods or class-specific constants.

```kotlin
fun formatCurrency(amount: Double, code: String): String =
    NumberFormat.getCurrencyInstance().apply {
        currency = Currency.getInstance(code)
    }.format(amount)

class PaymentTransaction private constructor(val id: String) {
    companion object {
        fun create(merchantId: String): PaymentTransaction {
            return PaymentTransaction(generateId(merchantId))
        }
    }
}
```

#### What is a typealias and how is it different from a value class?

`typealias` creates an alternative name for an existing type. It doesn't create a new type — the compiler treats it as the original type. A value class creates an actual new type at compile time with zero runtime overhead.

```kotlin
typealias UserClickHandler = (User) -> Unit
// UserClickHandler and (User) -> Unit are the same type

@JvmInline
value class UserId(val id: String)
// UserId and String are different types at compile time
```

Use `typealias` when you want readability for complex function types or generic types. Use value classes when you need type safety — preventing accidental mixing of values that have the same underlying type.

#### What is the String Pool on the JVM and how does it affect Kotlin string comparisons?

The JVM maintains a pool of unique string literals. When you write `val a = "hello"` and `val b = "hello"`, both variables point to the same object in the pool.

```kotlin
val a = "hello"
val b = "hello"
println(a === b) // true — same object from pool

val c = String("hello".toCharArray())
println(a === c) // false — c is a new object
println(a == c)  // true — structural equality
```

Always use `==` for string comparison in Kotlin. The String Pool is a JVM optimization detail you should know for interview questions about memory and identity, but never rely on `===` for string comparison.

### Common Follow-ups

- What happens if you override `equals()` in a data class — does it replace the generated one?
- Can a sealed class have a constructor with parameters?
- How do you use `when` with sealed classes and what makes it exhaustive?
- Can you use `lateinit` with a property that has a custom getter?
- Can a companion object have its own extension functions?
- When does boxing happen with value classes?
- How does the object declaration work under the hood — is it truly thread-safe?
- What is the difference between `is` and `as` for type checking?
