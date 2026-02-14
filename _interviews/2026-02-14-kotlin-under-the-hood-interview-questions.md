---
title: "Kotlin Under the Hood"
date: 2026-02-14
layout: interview
tags: [Kotlin Round]
order: 8
sequence: 33
---

## Kotlin Under the Hood

Understanding how Kotlin compiles to bytecode is a common advanced interview topic. It shows whether you actually know what your Kotlin code does at runtime — not just what it looks like in the editor. This comes up frequently in senior-level interviews at companies like Google and Meta.

### Core Questions

#### Q1: How does Kotlin compile to JVM bytecode?

Kotlin and Java share a fundamental compilation process that allows them to work seamlessly together. Kotlin source code is written in `.kt` files, compiled by the Kotlin compiler (`kotlinc`), and produces Java bytecode (`.class` files) that runs on the Java Virtual Machine. These `.class` files are identical in format to what `javac` produces from `.java` files. This is why Kotlin and Java can interop freely — at the bytecode level, the JVM doesn't know or care which language produced the class file.

#### Q2: What happens to a data class at the bytecode level?

The Kotlin compiler generates several methods automatically for a data class. For a `data class User(val name: String, val age: Int)`, the compiler generates:
- `equals()` — compares all properties declared in the primary constructor
- `hashCode()` — computes hash from all primary constructor properties
- `toString()` — returns `"User(name=..., age=...)"`
- `copy()` — creates a new instance with optionally modified properties
- `componentN()` functions — `component1()` returns `name`, `component2()` returns `age`, used for destructuring

These are generated only for properties in the primary constructor. Properties declared in the body are excluded from all generated methods. In bytecode, a data class is a regular class with these methods added — there is no special JVM concept for "data class."

#### Q3: How does a companion object compile to bytecode?

A companion object compiles to a static inner class. For a class like `class UserRepository { companion object { fun create(): UserRepository = UserRepository() } }`, the compiler generates a nested class called `UserRepository$Companion` with the `create()` method as an instance method on that class. The outer class gets a `static final` field called `Companion` that holds the singleton instance.

From Java, you'd call it as `UserRepository.Companion.create()`. If you add `@JvmStatic` to the `create()` function, the compiler also generates a static method directly on `UserRepository` that delegates to the companion, so Java code can call `UserRepository.create()` without the `Companion` reference.

#### Q4: What does @JvmStatic actually do?

`@JvmStatic` instructs the Kotlin compiler to generate an additional static method on the enclosing class that delegates to the companion object or named object method. Without it, the method only exists on the companion's inner class. The generated static method simply calls `Companion.methodName()` internally. It doesn't move the method — it creates a bridge. This is purely a Java interop convenience and has no effect on how the code works from Kotlin.

#### Q5: What does @JvmField do and why would you use it?

Kotlin properties compile to a private field with getter and setter methods. `@JvmField` tells the compiler to expose the field directly without generating the getter and setter. This is useful for Java interop — instead of calling `user.getName()`, Java code can access `user.name` directly. It is also commonly used for constants in companion objects to avoid the `Companion` access pattern. Without `@JvmField`, a `val` in a companion object is accessed from Java as `MyClass.Companion.getMyValue()`. With `@JvmField`, it becomes `MyClass.myValue`.

#### Q6: What is @JvmOverloads and when is it needed?

Kotlin supports default parameter values, but Java doesn't. `@JvmOverloads` instructs the Kotlin compiler to generate multiple overloaded versions of the function — one for each combination of default parameters. For a function with 3 parameters where the last 2 have defaults, it generates 3 Java methods: one with all 3 parameters, one with 2, and one with 1. This is commonly used for custom View constructors that need to work with XML inflation, and for builder-style APIs exposed to Java callers.

```kotlin
class CustomCard @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr)
```

#### Q7: How does a sealed class compile to bytecode?

A sealed class compiles to an abstract class with a private constructor. Each subclass becomes a separate class that extends the sealed class. The compiler doesn't add any special JVM annotation or marker — the sealed restriction is enforced entirely at compile time by the Kotlin compiler, not at the JVM level. When you use a `when` expression on a sealed class, the compiler can check exhaustiveness at compile time because it knows all subclasses. In the bytecode, the `when` compiles to a series of `instanceof` checks.

#### Q8: What is the difference between a sealed class and a sealed interface at the bytecode level?

A sealed class compiles to an abstract class. A sealed interface compiles to a regular Java interface. The key practical difference is that a class can implement multiple sealed interfaces but can only extend one sealed class. At the JVM level, there is no concept of "sealed" — both rely on compile-time enforcement by `kotlinc`. Sealed interfaces were introduced in Kotlin 1.5 and are useful when you need a class to participate in multiple restricted hierarchies.

### Deep Dive Questions

#### Q9: How does the suspend function CPS transformation work under the hood?

The Kotlin compiler transforms every suspend function using Continuation Passing Style (CPS). It adds an extra `Continuation<T>` parameter to the function signature and changes the return type to `Any?`. The return type becomes a union of the actual return value and `COROUTINE_SUSPENDED` — the function returns `COROUTINE_SUSPENDED` when it suspends, and returns the actual value when it completes immediately.

```kotlin
// What you write
suspend fun fetchUser(id: String): User

// What the compiler generates (simplified)
fun fetchUser(id: String, continuation: Continuation<User>): Any?
```

The `Continuation` interface has a `context` (the CoroutineContext) and a `resumeWith(Result<T>)` function. When the suspend function finishes its work on another thread, it calls `continuation.resumeWith(Result.success(user))` to resume the caller.

#### Q10: How does the compiler turn a suspend function with multiple suspension points into a state machine?

The compiler generates a state machine where each suspension point becomes a state. It creates a class that implements `Continuation` and uses a `label` field to track the current state. Each time the function suspends, the label increments. When the continuation is resumed, execution jumps to the correct state using a `when(label)` check.

```kotlin
// Original code with two suspension points
suspend fun loadProfile(id: String): Profile {
    val user = fetchUser(id)      // suspension point 1
    val avatar = fetchAvatar(user) // suspension point 2
    return Profile(user, avatar)
}

// Compiler generates roughly:
// label 0 → call fetchUser, store partial state, return COROUTINE_SUSPENDED
// label 1 → restore state, call fetchAvatar, return COROUTINE_SUSPENDED
// label 2 → restore state, create Profile, return result
```

All local variables that need to survive across suspension points are stored as fields in the generated continuation class. Variables that don't cross suspension points remain as regular stack locals. This is why suspend functions have some overhead — the compiler allocates a continuation object per call.

#### Q11: How do inline functions work at the bytecode level?

When a function is marked `inline`, the Kotlin compiler copies the function body directly into the call site instead of generating a method call. This eliminates the overhead of a method invocation and, more importantly, avoids allocating a `Function` object for lambda parameters. Without `inline`, a lambda argument compiles to an anonymous inner class that implements `FunctionN`. With `inline`, the lambda body is inlined directly alongside the function body.

The practical effect: `repeat(3) { println(it) }` with an inline `repeat` compiles to roughly the same bytecode as writing the loop manually. No `Function1` object is allocated. This is why collection operations like `map`, `filter`, and `forEach` on `Iterable` are inline — to avoid allocating a lambda object per call. Non-local returns (returning from the enclosing function inside a lambda) are only possible with inline lambdas.

#### Q12: How does a lambda expression compile to bytecode?

A non-inline lambda compiles to an anonymous inner class that implements one of the `FunctionN` interfaces (`Function0`, `Function1`, etc.). The lambda body goes into the `invoke()` method of that class. If the lambda captures variables from the enclosing scope, those are stored as fields in the generated class and passed through the constructor.

```kotlin
// What you write
val greet = { name: String -> "Hello, $name" }

// Compiler generates roughly:
// class MainKt$main$greet$1 : Function1<String, String> {
//     override fun invoke(name: String): String = "Hello, $name"
// }
```

Each lambda creates a new class in the bytecode. If a lambda doesn't capture anything and doesn't need a fresh instance each time, the compiler may optimize by creating a singleton instance. Lambdas that capture mutable variables (`var`) are wrapped in a `Ref.ObjectRef` to allow mutation from inside the lambda.

#### Q13: What is SAM conversion and how does it work in bytecode?

SAM (Single Abstract Method) conversion allows you to pass a lambda where a Java interface with a single abstract method is expected. The Kotlin compiler generates an anonymous class that implements the interface, with the lambda body as the method implementation. For Java SAM interfaces, Kotlin uses `invokedynamic` on newer JVM targets, which lets the JVM decide how to implement the lambda at runtime — often more efficient than generating a class file.

For Kotlin's `fun interface`, the same concept applies. The compiler generates an adapter class:

```kotlin
fun interface Validator {
    fun validate(input: String): Boolean
}

// SAM conversion
val emailValidator = Validator { it.contains("@") }
// Compiles to an anonymous class implementing Validator
```

The difference between a Kotlin `fun interface` and a regular Java interface is that Kotlin's SAM conversion only works automatically on interfaces declared with `fun interface`. Regular Kotlin interfaces don't support SAM conversion.

#### Q14: How does the when expression compile — tableswitch vs lookupswitch?

The Kotlin `when` expression on an `Int` (or `enum` ordinal) compiles to one of two JVM bytecode instructions depending on the values. `tableswitch` is used when the cases are dense (consecutive or nearly consecutive values). It creates a jump table indexed by the value — O(1) lookup. `lookupswitch` is used when values are sparse (like 1, 100, 5000). It performs a binary search through sorted key-value pairs — O(log n).

For `when` on a `String`, the compiler first switches on `hashCode()` and then uses `equals()` checks within each hash bucket. For `when` with `is` checks (type checks), it generates a sequence of `instanceof` instructions.

#### Q15: How does the delegation pattern compile at the bytecode level?

When you use `by` for class delegation, the Kotlin compiler generates forwarding methods for every method in the delegated interface. The delegate instance is stored as a field, and each forwarding method simply calls the corresponding method on the delegate.

```kotlin
class LoggingList<T>(
    private val inner: MutableList<T>
) : MutableList<T> by inner

// Compiler generates:
// - A field storing `inner`
// - add() → inner.add()
// - get() → inner.get()
// - size → inner.size
// ... for every method in MutableList
```

This means delegation has zero runtime overhead compared to writing the forwarding methods manually — the bytecode is identical. If you override a method in the delegating class, the compiler uses your implementation instead of the forwarding call.

#### Q16: How do inline (value) classes work at the bytecode level?

An inline value class wraps a single value and the compiler tries to use the wrapped value directly without allocating the wrapper object. A `@JvmInline value class UserId(val id: String)` compiles to just a `String` at most call sites. The compiler replaces `UserId` with `String` wherever possible — function parameters, local variables, and return types.

Boxing happens when the value class is used as a nullable type, a generic type parameter, or through an interface. In those cases, the compiler generates a wrapper class with a `box()` and `unbox()` method. The name mangling is important — functions that accept value classes get their names mangled in bytecode (e.g., `getUser-<hashcode>`) to avoid signature clashes when the wrapper is erased to its underlying type.

#### Q17: How does property delegation (by lazy, by observable) compile?

Property delegation compiles to a delegate field and a generated getter/setter that calls the delegate's `getValue()` and `setValue()` methods. For `lazy`, the compiler stores a `Lazy<T>` instance and the getter calls `lazy.value`.

```kotlin
// What you write
val config: Config by lazy { loadConfig() }

// What the compiler generates (simplified):
// private val config$delegate: Lazy<Config> = lazy { loadConfig() }
// val config: Config get() = config$delegate.value
```

`by lazy` defaults to `LazyThreadSafetyMode.SYNCHRONIZED`, which uses double-checked locking. If you're on the main thread only, `LazyThreadSafetyMode.NONE` avoids the synchronization overhead. For `Delegates.observable`, the compiler generates a setter that calls `onChange` after updating the value. Custom delegates work the same way — the compiler looks for `getValue` and `setValue` operator functions on the delegate object.

#### Q18: What is the @JvmName annotation and when would you use it?

`@JvmName` lets you assign a custom name to a Kotlin declaration in the generated bytecode. It is used when the Kotlin compiler's default naming would cause conflicts. A common case is having two functions with the same name but different generic types that erase to the same JVM signature — `fun List<String>.filterStrings()` and `fun List<Int>.filterInts()` could conflict. `@JvmName` also lets you provide a cleaner name for Java callers when the Kotlin name includes characters or patterns that don't map well to Java conventions.

#### Q19: How does Kotlin's null safety work at the bytecode level?

Kotlin's null safety is enforced through parameter checks injected at the beginning of public functions. For a function `fun process(name: String)`, the compiler inserts `Intrinsics.checkNotNullParameter(name, "name")` as the first instruction. This throws an `IllegalArgumentException` (or `NullPointerException` in newer Kotlin versions) if Java code passes `null`. For private functions and internal logic, the compiler may skip these checks for performance. Nullable types (`String?`) generate no checks — they compile to the same JVM type but without the guard.

#### Q20: How does a coroutine suspension point affect the generated bytecode differently from a regular function call?

A regular function call compiles to a simple `invokevirtual` or `invokestatic` instruction. A suspension point generates significantly more bytecode — it saves all live local variables into the continuation object's fields, sets the `label` to the next state, and returns `COROUTINE_SUSPENDED` to the caller. When resumed, the state machine restores those fields back into local variables and jumps to the correct label. This means a suspend function with 5 suspension points generates roughly 5x the bytecode of a regular function with 5 method calls, plus the continuation class allocation. This overhead is the tradeoff for structured concurrency — in practice, the JVM's JIT compiler optimizes much of it away.

### Common Follow-ups

- How do extension functions compile to bytecode?
- What is the difference between `object` and `companion object` at the bytecode level?
- How does Kotlin's `const val` differ from `val` in a companion object in bytecode?
- What overhead does a lambda that captures variables add compared to a non-capturing lambda?
- How does `reified` work with inline functions — why can't non-inline functions have reified type parameters?
- What happens at the bytecode level when you use destructuring declarations?
- How do coroutine dispatchers decide which thread to resume on after a suspension?
- What is the performance difference between `when` on an enum vs a sealed class?
