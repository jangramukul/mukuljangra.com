---
title: Kotlin Functional Interfaces Guide
layout: post
sequence: 101
categories: post
tags:
  - Kotlin
  - Android
---

I remember the first time I saw SAM conversion in Kotlin. I was migrating a Java codebase and noticed that `button.setOnClickListener { doSomething() }` just worked — no anonymous inner class, no `object : View.OnClickListener`, no ceremony. It felt like magic. But when I tried the same trick with a Kotlin interface I had just written — a single-method `Validator` interface — the compiler refused. The lambda syntax didn't work. I had to write the full `object :` boilerplate. For months I assumed this was a Kotlin limitation, something they'd fix eventually. Turns out, it was a deliberate design decision, and understanding why changed how I think about API design.

Functional interfaces, or SAM (Single Abstract Method) interfaces, let you create interface instances with a lambda expression instead of verbose anonymous objects. In Java, this happens automatically for any interface with one abstract method. In Kotlin, you have to opt in with the `fun` keyword. That single keyword unlocks a different way of writing callback-style APIs, dependency injection boundaries, and use case patterns. The distinction between "can be a lambda" and "must be an anonymous object" isn't just syntactic convenience — it signals intent about how an interface is meant to be used.

## fun interface Basics

Declaring a functional interface requires the `fun` modifier before `interface`. The interface must have exactly one abstract method, though it can have any number of non-abstract members — default methods, properties with backing fields, companion objects. The `fun` keyword tells the compiler: "This interface represents a single operation, and consumers should be able to provide it as a lambda."

```kotlin
fun interface IntPredicate {
    fun test(value: Int): Boolean

    // Non-abstract members are fine
    fun negate(): IntPredicate = IntPredicate { !test(it) }
}
```

Without `fun`, creating an instance requires the full anonymous object syntax — five lines of boilerplate for what is conceptually a single function.

```kotlin
// Without fun keyword — verbose anonymous object
val isPositive = object : IntPredicate {
    override fun test(value: Int): Boolean = value > 0
}

// With fun keyword — SAM conversion kicks in
val isPositive = IntPredicate { it > 0 }
```

The SAM-converted version isn't just shorter. It communicates that this interface represents a single operation. When I see `IntPredicate { it > 0 }`, I immediately know the entire behavior. With the anonymous object, I have to scan past the `object :` declaration, find the `override`, and read the method body. In a codebase with dozens of these, the cognitive savings compound fast.

## Kotlin SAM vs Java SAM

Here's the thing that tripped me up early on. Kotlin automatically supports SAM conversion for Java interfaces — `Runnable`, `Comparator`, `View.OnClickListener`, `Callable`. You can pass a lambda anywhere a Java SAM interface is expected, no questions asked. This is why `setOnClickListener { }` works out of the box in Android — `OnClickListener` is a Java interface.

```kotlin
// Java SAM — works automatically, no fun keyword needed
val executor = Executors.newSingleThreadExecutor()
executor.execute { loadDataFromNetwork() }

// Comparator is a Java interface — SAM conversion just works
val sortedUsers = users.sortedWith(Comparator { a, b ->
    a.lastName.compareTo(b.lastName)
})
```

But for Kotlin-defined interfaces, SAM conversion is strictly opt-in. If you define a regular Kotlin interface with one abstract method, you cannot use lambda syntax to instantiate it. This was a deliberate choice by the Kotlin team. In Java, every single-method interface is implicitly a functional interface, which means adding a second method to an interface silently breaks every lambda-based call site. The Kotlin team decided that making SAM conversion explicit via `fun` prevents this class of accidental breakage. You're declaring a contract: "This interface is designed to be used as a lambda, and I won't add a second abstract method." I think this is the right call. Implicit behavior that silently changes when you modify an interface is exactly the kind of subtle bug that costs hours to track down.

## Practical Patterns

The real power of `fun interface` shows up in domain-level abstractions. The Clean Architecture `UseCase` pattern is a perfect fit — each use case does exactly one thing, and SAM conversion makes wiring them up trivial.

```kotlin
fun interface UseCase<in Input, out Output> {
    suspend operator fun invoke(input: Input): Output
}

// Full implementation for complex logic
class GetUserProfile(
    private val userRepo: UserRepository,
    private val imageLoader: ImageLoader
) : UseCase<UserId, UserProfile> {
    override suspend fun invoke(input: UserId): UserProfile {
        val user = userRepo.getById(input)
        val avatar = imageLoader.preload(user.avatarUrl)
        return UserProfile(user, avatar)
    }
}

// SAM conversion for simple cases — one line
val validateEmail = UseCase<String, Boolean> { it.contains("@") && it.length > 3 }
```

The `Validator<T>` pattern is another one I use constantly. Instead of creating a dozen small classes, each implementing a single `validate` method, SAM conversion lets you define validators inline where they're used.

```kotlin
fun interface Validator<T> {
    fun validate(value: T): Boolean
}

val nonEmpty = Validator<String> { it.isNotBlank() }
val minLength = { n: Int -> Validator<String> { it.length >= n } }
val emailFormat = Validator<String> { "@" in it && "." in it.substringAfter("@") }
```

In Android specifically, SAM conversion is what makes the View system's callback APIs bearable in Kotlin. `View.OnClickListener`, `TextWatcher`, `RecyclerView.OnScrollListener` — these are all Java interfaces, so SAM conversion applies automatically. But when you're building your own callback APIs in Kotlin, you need `fun interface` to get the same clean syntax.

```kotlin
fun interface EventHandler<T> {
    fun handle(event: T)
}

class AnalyticsTracker(private val handler: EventHandler<AnalyticsEvent>) {
    fun trackClick(viewId: String) {
        handler.handle(AnalyticsEvent.Click(viewId))
    }
}

// Clean SAM conversion at the call site
val tracker = AnalyticsTracker(EventHandler { event ->
    Log.d("Analytics", "Event: ${event.name}")
})
```

## fun interface vs Function Type

This is the question I get asked most: when should you use `fun interface Validator<T>` versus just `(T) -> Boolean`? Both work. Both accept lambdas. The answer depends on who's going to see the API.

Function types — `(Input) -> Output` — are more flexible in practice. They work with any lambda, method reference, or function. There's no wrapping or conversion. You can compose them with standard library operations. They're the right choice for internal APIs, private parameters, and anywhere the contract is obvious from context. When a ViewModel constructor takes `(String) -> Boolean` as a parameter named `isValidEmail`, the type and name together make the intent clear enough.

`fun interface` shines when you're building a public API or framework-level contract. Named interfaces show up in stack traces with meaningful names instead of anonymous `Function1` references, which makes debugging production crashes significantly easier. They can carry default methods — the `negate()` method on `IntPredicate` earlier is a good example. They can extend other interfaces, carry documentation, and serve as extension receiver types. In a library that other teams consume, `Validator<T>` communicates more intent than `(T) -> Boolean`. It says "this is a validation concept in our domain" rather than "this is some function that takes T and returns Boolean."

My rule of thumb is straightforward. For internal or private APIs where the context makes the purpose obvious, use function types — they're simpler and more flexible. For public APIs, framework contracts, or domain concepts that deserve a name, use `fun interface`. The naming and discoverability benefits outweigh the slight ceremony. I've found that in Android app development, most of my `fun interface` usage is in the domain layer — use cases, validators, mappers — while function types dominate in ViewModels and UI callbacks where brevity matters more than naming.

## Under the Hood

SAM conversion isn't free, though the cost is usually negligible. When you write `IntPredicate { it > 0 }`, the compiler generates a synthetic class that implements `IntPredicate` and delegates to the lambda. This is similar to how Java 8 handles lambda conversions for functional interfaces — a class is generated (either at compile time or via `invokedynamic` at runtime on JVM) that wraps the lambda body.

The real performance consideration is object allocation. Each SAM conversion creates a new instance of the synthetic implementing class. For a lambda that captures no variables from the outer scope, the compiler can cache a singleton instance — the same object gets reused across calls. But if the lambda captures local variables, a new object is allocated every time because the captured state differs. This matters in hot loops or RecyclerView bind calls where allocations add up. In those cases, hoisting the lambda to a property eliminates repeated allocation.

```kotlin
// Allocation every bind call — lambda captures 'position'
fun onBind(position: Int) {
    val filter = IntPredicate { it > position }
    applyFilter(filter)
}

// Single allocation — no captures, compiler caches the instance
val isPositive = IntPredicate { it > 0 }
```

There's one more thing worth knowing. If you mark a higher-order function with `inline` and it takes a `fun interface` parameter, the lambda body gets inlined at the call site. No synthetic class, no allocation, no virtual dispatch. The lambda code is copied directly into the calling function's bytecode. This is why Kotlin's `filter`, `map`, and `forEach` have zero overhead despite accepting lambdas — they're all inline functions. For your own `fun interface` APIs, consider making the accepting function inline if it's called frequently, but remember that inline functions can't be stored in variables or passed around — they must be invoked immediately.

Thanks for reading!

## Quiz

#### What's the difference between a `fun interface` and a regular interface with one method?

- **Wrong** `fun interface` can have multiple methods
- **Wrong** `fun interface` is faster at runtime
- **Correct** `fun interface` enables SAM conversion — you can create instances using a lambda expression instead of an anonymous object
- **Wrong** `fun interface` generates less bytecode

> **Explanation:** The `fun` keyword enables SAM conversion: `val predicate = IntPredicate { it > 0 }` instead of `object : IntPredicate { override fun test(value: Int) = value > 0 }`. Regular Kotlin interfaces require the verbose anonymous object syntax.

#### When does Kotlin auto-support SAM conversion WITHOUT the `fun` keyword?

- **Wrong** For all Kotlin interfaces
- **Correct** For Java interfaces only — Kotlin interfaces must be explicitly marked with `fun`
- **Wrong** For interfaces with default methods
- **Wrong** Never — you always need the `fun` keyword

> **Explanation:** Kotlin automatically supports SAM conversion for Java interfaces (like Runnable, Comparator, OnClickListener) because Java doesn't have the `fun` keyword. For Kotlin-defined interfaces, the intent must be explicit via `fun interface`.

## Coding Challenge

Create a mini validation framework using `fun interface Validator<T>` with a `validate(value: T): ValidationResult` method. Define a sealed class `ValidationResult` with `Valid` and `Invalid(reason: String)`. Then create validators: `NonEmpty`, `MinLength(n)`, `EmailFormat`, and a `CompositeValidator` that combines multiple validators. Show SAM conversion for quick validator creation.

#### Solution

```kotlin
sealed class ValidationResult {
    data object Valid : ValidationResult()
    data class Invalid(val reason: String) : ValidationResult()
}

fun interface Validator<T> {
    fun validate(value: T): ValidationResult
}

// SAM conversion for quick validator creation
val nonEmpty = Validator<String> { value ->
    if (value.isNotBlank()) ValidationResult.Valid
    else ValidationResult.Invalid("Must not be empty")
}

fun minLength(n: Int) = Validator<String> { value ->
    if (value.length >= n) ValidationResult.Valid
    else ValidationResult.Invalid("Must be at least $n characters, got ${value.length}")
}

val emailFormat = Validator<String> { value ->
    if ("@" in value && "." in value.substringAfter("@")) ValidationResult.Valid
    else ValidationResult.Invalid("Invalid email format: $value")
}

class CompositeValidator<T>(
    private val validators: List<Validator<T>>
) : Validator<T> {
    override fun validate(value: T): ValidationResult {
        for (validator in validators) {
            val result = validator.validate(value)
            if (result is ValidationResult.Invalid) return result
        }
        return ValidationResult.Valid
    }
}

// Usage
fun main() {
    val emailValidator = CompositeValidator(listOf(nonEmpty, minLength(5), emailFormat))

    println(emailValidator.validate(""))              // Invalid(Must not be empty)
    println(emailValidator.validate("ab"))             // Invalid(Must be at least 5 characters, got 2)
    println(emailValidator.validate("hello"))          // Invalid(Invalid email format: hello)
    println(emailValidator.validate("dev@kotlin.org")) // Valid
}
```
