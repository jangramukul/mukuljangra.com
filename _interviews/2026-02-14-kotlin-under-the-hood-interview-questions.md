---
title: "Kotlin Under the Hood"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 27
sequence: 27
description: "Understanding how Kotlin compiles to bytecode is a common advanced interview topic."
---

## Kotlin Under the Hood

Understanding how Kotlin compiles to bytecode is a common advanced interview topic. It shows whether you actually know what your Kotlin code does at runtime. This comes up frequently in senior-level interviews.

#### How does Kotlin compile to JVM bytecode?

Kotlin source code is written in `.kt` files, compiled by the Kotlin compiler (`kotlinc`), and produces Java bytecode (`.class` files) that runs on the JVM. These `.class` files are identical in format to what `javac` produces from `.java` files. This is why Kotlin and Java interop freely — at the bytecode level, the JVM doesn't know which language produced the class file.

#### What happens to a data class at the bytecode level?

The compiler generates `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions. These are generated only for properties in the primary constructor. In bytecode, a data class is a regular class with these methods added — there is no special JVM concept for "data class."

#### How does a companion object compile?

A companion object compiles to a static inner class. For `class UserRepository { companion object { fun create() = UserRepository() } }`, the compiler generates `UserRepository$Companion` with the method as an instance method. The outer class gets a `static final Companion` field.

From Java, you'd call `UserRepository.Companion.create()`. Adding `@JvmStatic` generates a static method on `UserRepository` that delegates to the companion, so Java can call `UserRepository.create()`.

#### What does @JvmStatic actually do?

`@JvmStatic` generates an additional static method on the enclosing class that delegates to the companion object method. It doesn't move the method — it creates a bridge. This is purely a Java interop convenience.

#### What does @JvmField do?

Kotlin properties compile to a private field with getter and setter. `@JvmField` exposes the field directly without generating accessors. Useful for Java interop — instead of `user.getName()`, Java code accesses `user.name` directly. Also used for constants in companion objects to avoid the `Companion` access pattern.

#### What is @JvmOverloads and when is it needed?

Kotlin supports default parameter values but Java doesn't. `@JvmOverloads` generates multiple overloaded methods — one for each combination of default parameters. Commonly used for custom View constructors.

```kotlin
class CustomCard @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr)
```

#### How does Kotlin's null safety work at the bytecode level?

Kotlin inserts parameter checks at the beginning of public functions. For `fun process(name: String)`, the compiler adds `Intrinsics.checkNotNullParameter(name, "name")` as the first instruction. This throws if Java code passes `null`. For private functions, the compiler may skip these checks. Nullable types generate no checks.

#### How does a sealed class compile?

A sealed class compiles to an abstract class with a private constructor. Each subclass becomes a separate class. The sealed restriction is enforced at compile time by the Kotlin compiler, not by the JVM. `when` on a sealed class compiles to `instanceof` checks.

#### What is the difference between sealed class and sealed interface at the bytecode level?

A sealed class compiles to an abstract class. A sealed interface compiles to a regular Java interface. A class can implement multiple sealed interfaces but only extend one sealed class. There is no JVM concept of "sealed" — it's compile-time enforcement.

#### How does the suspend function CPS transformation work?

The compiler adds a `Continuation<T>` parameter and changes the return type to `Any?`. The function returns `COROUTINE_SUSPENDED` when it suspends, and the actual value when it completes.

```kotlin
// What you write
suspend fun fetchUser(id: String): User

// What the compiler generates
fun fetchUser(id: String, continuation: Continuation<User>): Any?
```

#### How does the compiler turn a suspend function into a state machine?

Each suspension point becomes a state. The compiler creates a class implementing `Continuation` with a `label` field tracking the current state. Local variables that survive across suspension points are stored as fields.

```kotlin
// Original: two suspension points
suspend fun loadProfile(id: String): Profile {
    val user = fetchUser(id)      // suspension point 1
    val avatar = fetchAvatar(user) // suspension point 2
    return Profile(user, avatar)
}

// Compiler generates:
// label 0 → call fetchUser, save state, return COROUTINE_SUSPENDED
// label 1 → restore state, call fetchAvatar, return COROUTINE_SUSPENDED
// label 2 → create Profile, return result
```

#### How do inline functions work at the bytecode level?

The compiler copies the function body and lambda body directly into the call site. No `FunctionN` object is allocated. `repeat(3) { println(it) }` compiles to the same bytecode as writing the loop manually. Non-local returns are only possible with inline lambdas.

#### How does a lambda compile to bytecode?

A non-inline lambda compiles to an anonymous inner class implementing `FunctionN` (`Function0`, `Function1`, etc.). The lambda body goes into `invoke()`. If the lambda captures variables, those are stored as fields. Lambdas capturing mutable variables (`var`) are wrapped in `Ref.ObjectRef`.

```kotlin
val greet = { name: String -> "Hello, $name" }

// Compiles to roughly:
// class MainKt$main$greet$1 : Function1<String, String> {
//     override fun invoke(name: String): String = "Hello, $name"
// }
```

#### What is SAM conversion and how does it work?

SAM conversion lets you pass a lambda where a Java interface with a single abstract method is expected. For Java interfaces, Kotlin uses `invokedynamic` on newer JVM targets. For Kotlin's `fun interface`, the compiler generates an adapter class.

```kotlin
fun interface Validator {
    fun validate(input: String): Boolean
}

val emailValidator = Validator { it.contains("@") }
```

Kotlin's SAM conversion only works on `fun interface` declarations, not regular Kotlin interfaces.

#### How does the when expression compile?

`when` on an `Int` or enum ordinal uses `tableswitch` (O(1) lookup) for dense values or `lookupswitch` (O(log n) binary search) for sparse values. `when` on a `String` switches on `hashCode()` then uses `equals()`. `when` with `is` checks generates `instanceof` instructions.

#### How does the delegation pattern compile?

With `by` class delegation, the compiler generates forwarding methods for every method in the delegated interface. The delegate is stored as a field. Each forwarding method calls the delegate's method. Zero runtime overhead compared to manual forwarding.

```kotlin
class LoggingList<T>(
    private val inner: MutableList<T>
) : MutableList<T> by inner
// Compiler generates: add() → inner.add(), get() → inner.get(), etc.
```

#### How do inline value classes work at the bytecode level?

The compiler replaces `@JvmInline value class UserId(val id: String)` with just `String` at most call sites. Boxing happens when used as nullable, generic, or through an interface. Functions accepting value classes get their names mangled to avoid signature clashes.

#### How does property delegation compile?

Property delegation compiles to a delegate field and a getter/setter that calls the delegate's `getValue()`/`setValue()`. For `lazy`, the compiler stores a `Lazy<T>` instance and the getter calls `lazy.value`.

```kotlin
val config: Config by lazy { loadConfig() }

// Generates:
// private val config$delegate: Lazy<Config> = lazy { loadConfig() }
// val config: Config get() = config$delegate.value
```

`by lazy` defaults to `SYNCHRONIZED` with double-checked locking.

#### What is @JvmName and when would you use it?

`@JvmName` assigns a custom name to a declaration in bytecode. Used when Kotlin's default naming causes conflicts — like two functions with the same name but different generic types that erase to the same JVM signature. Also provides cleaner names for Java callers.

#### How does a coroutine suspension point differ from a regular function call in bytecode?

A regular call compiles to `invokevirtual` or `invokestatic`. A suspension point saves all live local variables into the continuation's fields, sets the label, and returns `COROUTINE_SUSPENDED`. On resume, it restores fields and jumps to the correct label. A suspend function with 5 suspension points generates roughly 5x the bytecode of a regular function with 5 method calls.

### Common Follow-ups

- How do extension functions compile to bytecode?
- What is the difference between `object` and `companion object` in bytecode?
- How does `const val` differ from `val` in a companion object?
- What overhead does a capturing lambda add compared to a non-capturing one?
- Why can't non-inline functions have reified type parameters?
- What happens at bytecode level with destructuring declarations?
- What is the performance difference between `when` on enum vs sealed class?
