---
title: "Kotlin Basics & Type System"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 1
sequence: 9
description: "Kotlin basics and type system questions come up in almost every Android interview."
---

## Kotlin Basics & Type System

Kotlin basics and type system questions come up in almost every Android interview. Companies use these to quickly check if you actually write Kotlin daily or just know it surface-level.

### Core Questions (Beginner → Intermediate)

#### Q1: What is the difference between val and var?

`val` is read-only — once assigned, you cannot reassign it. `var` is mutable and can be reassigned. Note that `val` does not mean immutable — if you have a `val list = mutableListOf<String>()`, the reference can't change but the list contents can. Under the hood, `val` generates only a getter while `var` generates both getter and setter.

#### Q2: How does null safety work in Kotlin? Explain ?. and !! and let.

Kotlin's type system distinguishes between nullable (`String?`) and non-nullable (`String`) types at compile time. The safe call operator `?.` calls a method only if the object is not null and returns null otherwise. The `!!` operator asserts that a value is not null and throws a `NullPointerException` if it is — use it only when you are certain the value exists. `let` is a scope function often used with `?.` to execute a block only when the value is non-null:

```kotlin
val userName: String? = getUserName()

// Safe call — returns null if userName is null
val length = userName?.length

// let — runs the block only if userName is not null
userName?.let { name ->
    showGreeting(name)
}

// !! — crashes if userName is null
val forcedLength = userName!!.length
```

Prefer `?.let` over `!!` in almost every case. The `!!` operator is a code smell unless you can guarantee non-nullness through control flow.

#### Q3: What are smart casts in Kotlin?

Smart cast means the compiler automatically casts a type after a type check, so you don't need to cast it manually. After an `is` check inside an `if` or `when`, the compiler knows the type and lets you use it directly:

```kotlin
fun processInput(input: Any) {
    when (input) {
        is String -> println(input.length) // smart cast to String
        is Int -> println(input * 2)       // smart cast to Int
        is UserProfile -> println(input.displayName)
    }
}
```

Smart casts only work when the compiler can guarantee the variable hasn't changed between the check and the usage. They don't work on `var` properties or open properties because another thread or subclass could change the value. For those cases, use an explicit cast with `as` or a local `val`.

#### Q4: Explain Kotlin's type hierarchy — Any, Unit, and Nothing.

- **Any** — Root of the Kotlin class hierarchy. Every class implicitly inherits from `Any`. It provides `equals()`, `hashCode()`, and `toString()`. Similar to `Object` in Java, but `Any` is non-nullable by default.
- **Unit** — Equivalent of Java's `void`. A function with no meaningful return value returns `Unit`. Unlike `void`, `Unit` is an actual object with a single instance, which is why you can use it as a generic type parameter.
- **Nothing** — Represents a value that never exists. A function returning `Nothing` never returns normally — it always throws an exception or runs forever. `Nothing` is a subtype of every type, which is why `throw` can be used in any expression.

```kotlin
// Unit — returns nothing meaningful
fun logEvent(event: String): Unit {
    analytics.track(event)
}

// Nothing — never returns
fun throwError(message: String): Nothing {
    throw IllegalStateException(message)
}

// Nothing as a subtype of every type
val result: String = userInput ?: throwError("Input required")
```

#### Q5: What is a data class? What methods does it generate?

Data class is a special type of class used to hold data. The compiler automatically generates `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions based on the properties declared in the primary constructor. Properties declared in the class body are excluded from these generated methods.

```kotlin
data class PaymentInfo(
    val amount: Double,
    val currency: String,
    val timestamp: Long
) {
    var isProcessed: Boolean = false // not included in equals/hashCode/copy
}

val payment = PaymentInfo(29.99, "USD", System.currentTimeMillis())
val refund = payment.copy(amount = -29.99)

// Destructuring using componentN functions
val (amount, currency, _) = payment
```

A data class must have at least one primary constructor parameter, cannot be abstract, open, sealed, or inner. The `copy()` function creates a shallow copy — if a property is a mutable list, both the original and copy point to the same list instance.

#### Q6: What is the difference between sealed class and enum class?

Enum class is used for defining constants where each value is a single instance. Sealed class has the same concept as enum but allows each subclass to hold different data and have multiple instances.

- **Enum** — Each entry is a singleton. All entries share the same structure. You can't have an enum entry with extra properties that others don't have.
- **Sealed class** — Each subclass can have its own properties, constructors, and multiple instances. Useful for representing states or results with varying data.

```kotlin
// Enum — fixed constants, no varying data
enum class PaymentMethod { CARD, CASH, UPI }

// Sealed class — each subclass has different data
sealed class PaymentResult {
    data class Success(val transactionId: String) : PaymentResult()
    data class Failure(val error: Throwable, val code: Int) : PaymentResult()
    data object Loading : PaymentResult()
}
```

The compiler knows all subclasses of a sealed class at compile time, so `when` expressions are exhaustive without needing an `else` branch. Sealed interfaces work the same way but allow a class to implement multiple sealed hierarchies.

#### Q7: What is a value class and when would you use it?

Value class is a lightweight wrapper around a single value that avoids runtime object allocation. The compiler inlines the wrapped value wherever possible, so there's no extra heap allocation. Useful when you want type safety without the performance cost of creating wrapper objects.

```kotlin
@JvmInline
value class UserId(val id: String)

@JvmInline
value class OrderId(val id: String)

fun fetchOrder(userId: UserId, orderId: OrderId) {
    // Can't accidentally swap userId and orderId
}
```

Without value classes, both parameters would just be `String` and you could mix them up. A value class must have exactly one property in the primary constructor and is marked with `@JvmInline`. At runtime, the wrapper is removed and only the underlying value remains — so `UserId("abc")` compiles to just the string `"abc"` in most cases. Boxing happens when the value class is used as a generic type or nullable type.

#### Q8: Explain the object keyword — singleton, companion object, and anonymous object.

The `object` keyword has three uses in Kotlin:

- **Object declaration (singleton)** — Creates a single instance that is lazily initialized on first access. Thread-safe by default because the JVM guarantees class loading is synchronized.
- **Companion object** — A singleton tied to a class. Members can be accessed through the class name like static methods in Java, but it's actually an object instance with the ability to implement interfaces.
- **Anonymous object** — Creates an unnamed instance of a class or interface, similar to Java's anonymous inner class.

```kotlin
// Singleton
object NetworkClient {
    fun makeRequest(url: String) { /* ... */ }
}

// Companion object
class PaymentProcessor {
    companion object {
        const val MAX_RETRY = 3
        fun create(): PaymentProcessor = PaymentProcessor()
    }
}

// Anonymous object
val callback = object : View.OnClickListener {
    override fun onClick(v: View?) {
        handleClick()
    }
}
```

Companion object members look like static access from the call site (`PaymentProcessor.MAX_RETRY`), but in bytecode a companion object is a nested class with an instance. Use `@JvmStatic` to generate actual static methods for Java interop.

#### Q9: What is the difference between lateinit and lazy?

Both delay initialization, but they work differently:

- **lateinit** — Used with `var` properties. Tells the compiler that the property will be initialized before first use. Works only with non-nullable, non-primitive types. If you access it before initialization, you get an `UninitializedPropertyAccessException`. You can check initialization with `::property.isInitialized`.
- **lazy** — Used with `val` properties. Takes a lambda and initializes the value on first access. Thread-safe by default (`LazyThreadSafetyMode.SYNCHRONIZED`). The value is computed once and cached.

```kotlin
class LoginViewModel : ViewModel() {
    // lateinit — initialized later by DI or setup
    lateinit var authRepository: AuthRepository

    // lazy — computed on first access, cached forever
    val analytics: AnalyticsTracker by lazy {
        AnalyticsTracker.getInstance()
    }
}
```

Use `lateinit` when the value will be set from outside (dependency injection, `onCreate`). Use `lazy` when the value can be computed from available state and you want to defer that computation.

#### Q10: What is const val and how is it different from val?

`const val` is a compile-time constant. The value must be a primitive type or `String` and must be known at compile time. The compiler inlines the value at every usage site, so there's no property access or getter call at runtime.

`val` is a runtime constant — the value is set when the code executes. It can hold any type and can be computed from function calls or other runtime values.

```kotlin
companion object {
    const val MAX_RETRIES = 3           // inlined at compile time
    val DEFAULT_TIMEOUT = Duration.ofSeconds(30)  // computed at runtime
}
```

`const val` can only be used at the top level, inside an `object`, or inside a `companion object`. It cannot be used inside a function or with a custom getter.

### Deep Dive Questions (Advanced → Expert)

#### Q11: What happens when you use == vs === in Kotlin?

`==` checks structural equality — it calls `equals()` under the hood. `===` checks referential equality — whether two references point to the exact same object in memory.

For data classes, `==` compares the property values because `equals()` is auto-generated. For regular classes, `==` uses the default `Any.equals()` which is referential equality unless you override it. The JVM caches small `Int` values (-128 to 127), so boxing the same small integer twice may give `===` as true, but larger values will be different objects.

#### Q12: How do copy() and componentN() functions actually work in data classes?

`copy()` creates a new instance with the same property values, letting you override specific ones. It's a shallow copy — reference-type properties still point to the same object. The `componentN()` functions (`component1()`, `component2()`, etc.) return properties in declaration order and enable destructuring.

```kotlin
data class UserSession(val userId: String, val roles: MutableList<String>)

val session = UserSession("u1", mutableListOf("admin"))
val copied = session.copy()
copied.roles.add("editor")

// session.roles is also ["admin", "editor"] — shallow copy
```

Only properties in the primary constructor get generated `componentN()` and are included in `copy()`, `equals()`, and `hashCode()`. Properties declared in the class body are completely ignored by these generated methods, which can cause subtle bugs if you expect them to participate in equality checks.

#### Q13: What is the difference between sealed class and sealed interface? When would you use one over the other?

Sealed class restricts inheritance to the same package and module, and subclasses must extend the sealed class directly. Since Kotlin only allows single inheritance, a class can only extend one sealed class.

Sealed interface removes the single-inheritance restriction. A class can implement multiple sealed interfaces, making it possible to model more complex hierarchies where a type belongs to multiple sealed groups.

```kotlin
sealed interface NetworkError
sealed interface DatabaseError

data class TimeoutError(val duration: Long) : NetworkError, DatabaseError
data class AuthError(val reason: String) : NetworkError
```

Use sealed class when you need shared state or behavior through a common constructor or properties. Use sealed interface when you only need the exhaustive `when` check without shared state, or when a subclass needs to belong to multiple sealed hierarchies.

#### Q14: How does the object declaration work under the hood? Is it truly thread-safe?

An `object` declaration compiles to a Java class with a private constructor and a static `INSTANCE` field. The instance is created in a static initializer block (`<clinit>`), so the JVM guarantees it's initialized exactly once, even across multiple threads. This is the same mechanism as the Java enum singleton pattern.

The bytecode looks roughly like:

```kotlin
// Kotlin
object AppConfig {
    val apiUrl = "https://api.example.com"
}

// Equivalent Java bytecode structure
public final class AppConfig {
    public static final AppConfig INSTANCE;
    private final String apiUrl = "https://api.example.com";
    static { INSTANCE = new AppConfig(); }
    private AppConfig() {}
}
```

The initialization is thread-safe, but the methods and properties on the object are not synchronized. If multiple threads read and write a `var` property on the object, you still need proper synchronization.

#### Q15: Explain the difference between companion object and top-level functions. When should you use each?

Top-level functions are true static functions in the bytecode — no enclosing class, no object instance. Companion object members are instance methods on a nested companion class, accessed through a static `Companion` reference (unless you use `@JvmStatic`).

Use top-level functions for utility operations that don't belong to any specific class — extension functions, pure helper functions. Use companion objects when the function is logically tied to the class, like factory methods (`create()`, `fromJson()`), constants specific to that class, or when you need the companion to implement an interface.

```kotlin
// Top-level — utility, no class context
fun formatCurrency(amount: Double, code: String): String =
    NumberFormat.getCurrencyInstance().apply {
        currency = Currency.getInstance(code)
    }.format(amount)

// Companion — factory method tied to the class
class PaymentTransaction private constructor(val id: String) {
    companion object {
        fun create(merchantId: String): PaymentTransaction {
            return PaymentTransaction(generateId(merchantId))
        }
    }
}
```

#### Q16: How does lateinit work under the hood? What happens when you access it before initialization?

`lateinit` removes the null check that the Kotlin compiler normally adds for non-nullable types. In bytecode, a `lateinit var` is stored as a nullable field initialized to `null`. Every access site has a generated null check — if the field is still `null`, it throws `UninitializedPropertyAccessException` with a message naming the property.

This means `lateinit` does have a small runtime cost: a null check on every access. It also cannot be used with primitive types (`Int`, `Boolean`, etc.) because primitives can't be `null` on the JVM, so there's no sentinel value to detect uninitialized state.

The `::property.isInitialized` check works by inspecting whether the backing field is still `null`. It only works from inside the class that owns the property or from an extension within the same file.

#### Q17: When does boxing happen with value classes?

Value classes are inlined as the underlying type in most cases, but boxing (wrapping in the value class object) happens in these situations:

- When used as a nullable type (`UserId?`)
- When used as a generic type parameter (`List<UserId>`)
- When used as a type of `Any` or an interface the value class implements
- When used in equality checks with `===`

```kotlin
@JvmInline
value class UserId(val id: String)

fun processUser(userId: UserId) { }    // inlined — just a String
fun processNullable(userId: UserId?) { } // boxed — UserId object
fun processList(ids: List<UserId>) { }   // boxed — each element
```

The whole point of value classes is to get type safety at compile time with minimal runtime cost. But once the compiler can't prove the type at the call site, it has to box. In practice, boxing happens more often than you'd expect, especially in generic code.

#### Q18: What's the difference between Any and Any? in the type hierarchy?

`Any` is the root of the non-nullable type hierarchy. `Any?` is the root of the entire type hierarchy, including nullable types. Every type in Kotlin is a subtype of `Any?`, but only non-nullable types are subtypes of `Any`.

`Nothing` sits at the bottom — it's a subtype of every type. `Nothing?` has exactly one value: `null`. This is why `null` can be assigned to any nullable type — its type is `Nothing?`, which is a subtype of every nullable type.

This hierarchy means a function accepting `Any` rejects `null`, while `Any?` accepts everything. When Kotlin code is compiled to JVM bytecode, `Any` maps to `java.lang.Object` since the JVM doesn't have built-in null safety.

### Common Follow-ups

- What happens if you override `equals()` in a data class — does it replace the generated one?
- Can a sealed class have a constructor with parameters?
- What is the difference between `as` and `as?` for type casting?
- How do you use `when` with sealed classes and what makes it exhaustive?
- Can you use `lateinit` with a property that has a custom getter?
- What is a `typealias` and how is it different from a value class?
- How does Kotlin's `==` differ from Java's `==` for String comparison?
- Can a companion object have its own extension functions?
