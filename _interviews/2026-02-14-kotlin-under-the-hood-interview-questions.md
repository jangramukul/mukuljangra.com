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

You write `.kt` files, the Kotlin compiler (`kotlinc`) chews through them, and out come `.class` files — the exact same format `javac` produces from Java. The JVM has absolutely no idea which language produced the class file. That's the whole reason Kotlin and Java interop so freely — at the bytecode level, they're identical twins.

#### What happens to a data class at the bytecode level?

Here's the thing — there's no special JVM concept for "data class." The compiler just generates `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions for you, but only for properties declared in the primary constructor. In bytecode, it's a regular class with those methods added. Think of it like ordering a burger combo — you wrote one line, but the compiler handed you five methods.

#### How does a companion object compile?

A companion object compiles to a static inner class. So for `class UserRepository { companion object { fun create() = UserRepository() } }`, the compiler generates a `UserRepository$Companion` class with `create()` as an instance method on it. The outer class gets a `static final Companion` field pointing to it.

From Java, you'd call `UserRepository.Companion.create()`. Adding `@JvmStatic` generates a static method on `UserRepository` that delegates to the companion, so Java can just call `UserRepository.create()` directly.

#### What does @JvmStatic actually do?

It generates an additional static method on the enclosing class that delegates to the companion object method. It doesn't move the method — it creates a bridge. Think of it like putting up a shortcut sign so Java callers don't have to walk through the companion's front door. It's purely a Java interop convenience.

#### What does @JvmField do?

Normally, Kotlin properties compile to a private field with a getter and setter. `@JvmField` tells the compiler to skip generating those accessors and expose the field directly. So instead of Java calling `user.getName()`, it just accesses `user.name`. Also handy for constants in companion objects to avoid the `Companion` access pattern.

> **🧠 Think about it:** If Kotlin already generates getters and setters, why would you ever want to bypass them with `@JvmField`? What scenarios make direct field access more appropriate than accessor methods?

#### What is @JvmOverloads and when is it needed?

Kotlin supports default parameter values but Java doesn't. `@JvmOverloads` bridges that gap by generating multiple overloaded methods — one for each combination of default parameters. You'll see this most often with custom View constructors.

```kotlin
class CustomCard @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr)
```

#### How does Kotlin's null safety work at the bytecode level?

Kotlin inserts parameter checks at the beginning of public functions. For `fun process(name: String)`, the compiler adds `Intrinsics.checkNotNullParameter(name, "name")` as the very first instruction. If Java code passes `null`, it throws immediately. For private functions, the compiler may skip these checks since only your Kotlin code calls them. Nullable types generate no checks at all — you already told the compiler you'll handle it.

#### How does a sealed class compile?

A sealed class compiles to an abstract class with a private constructor. Each subclass becomes its own separate class. Here's what trips people up — the "sealed" restriction is enforced entirely at compile time by the Kotlin compiler, not by the JVM. The JVM has no concept of "sealed." When you use `when` on a sealed class, it compiles to a chain of `instanceof` checks.

#### What is the difference between sealed class and sealed interface at the bytecode level?

A sealed class compiles to an abstract class. A sealed interface compiles to a regular Java interface. The practical difference? A class can implement multiple sealed interfaces but only extend one sealed class. There's no JVM concept of "sealed" for either — it's all compile-time enforcement.

#### How does the suspend function CPS transformation work?

Plot twist — your suspend function doesn't actually look anything like what you wrote once the compiler is done with it. The compiler adds a `Continuation<T>` parameter and changes the return type to `Any?`. The function returns `COROUTINE_SUSPENDED` when it suspends, and the actual value when it completes.

```kotlin
// What you write
suspend fun fetchUser(id: String): User

// What the compiler generates
fun fetchUser(id: String, continuation: Continuation<User>): Any?
```

#### How does the compiler turn a suspend function into a state machine?

Each suspension point becomes a state. The compiler creates a class implementing `Continuation` with a `label` field that tracks the current state — like a bookmark telling you which page to resume from. Local variables that need to survive across suspension points are stored as fields in that class.

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

> **🧠 Think about it:** If the compiler turns each suspend function into a state machine with labels, what do you think happens to the bytecode size as you add more suspension points to a single function?

#### How do inline functions work at the bytecode level?

The compiler literally copies the function body and the lambda body directly into the call site. No `FunctionN` object is allocated, no method call overhead. `repeat(3) { println(it) }` compiles to the same bytecode as writing the loop by hand. Non-local returns are only possible with inline lambdas because the lambda code is physically inside the calling function.

#### How does a lambda compile to bytecode?

A non-inline lambda compiles to an anonymous inner class implementing `FunctionN` (`Function0`, `Function1`, etc.). The lambda body goes into `invoke()`. If the lambda captures variables, those become fields on the class. Lambdas capturing mutable variables (`var`) get wrapped in `Ref.ObjectRef` — that's the cost of mutability.

```kotlin
val greet = { name: String -> "Hello, $name" }

// Compiles to roughly:
// class MainKt$main$greet$1 : Function1<String, String> {
//     override fun invoke(name: String): String = "Hello, $name"
// }
```

#### What is SAM conversion and how does it work?

SAM conversion lets you pass a lambda where a Java interface with a single abstract method is expected. For Java interfaces, Kotlin uses `invokedynamic` on newer JVM targets. For Kotlin's own `fun interface`, the compiler generates an adapter class instead.

```kotlin
fun interface Validator {
    fun validate(input: String): Boolean
}

val emailValidator = Validator { it.contains("@") }
```

One important detail — Kotlin's SAM conversion only works on `fun interface` declarations, not regular Kotlin interfaces.

#### How does the when expression compile?

This one's pretty clever. `when` on an `Int` or enum ordinal uses `tableswitch` (O(1) lookup) for dense values or `lookupswitch` (O(log n) binary search) for sparse values. `when` on a `String` switches on `hashCode()` first, then confirms with `equals()`. And `when` with `is` checks just generates `instanceof` instructions.

#### How does the delegation pattern compile?

With `by` class delegation, the compiler generates forwarding methods for every single method in the delegated interface. It's like hiring an assistant who takes every call and forwards it to the person who actually does the work. The delegate is stored as a field, and each forwarding method just calls the delegate's method. Zero runtime overhead compared to writing all that forwarding code yourself.

```kotlin
class LoggingList<T>(
    private val inner: MutableList<T>
) : MutableList<T> by inner
// Compiler generates: add() → inner.add(), get() → inner.get(), etc.
```

#### How do inline value classes work at the bytecode level?

The compiler replaces `@JvmInline value class UserId(val id: String)` with just `String` at most call sites — the wrapper disappears entirely. But boxing kicks in when the value class is used as nullable, generic, or through an interface. Functions accepting value classes also get their names mangled to avoid signature clashes with functions that take the unwrapped type.

#### How does property delegation compile?

Property delegation compiles to a delegate field plus a getter/setter that calls the delegate's `getValue()`/`setValue()`. For `lazy`, the compiler stores a `Lazy<T>` instance and the getter just calls `lazy.value`.

```kotlin
val config: Config by lazy { loadConfig() }

// Generates:
// private val config$delegate: Lazy<Config> = lazy { loadConfig() }
// val config: Config get() = config$delegate.value
```

`by lazy` defaults to `SYNCHRONIZED` mode with double-checked locking.

#### What is @JvmName and when would you use it?

`@JvmName` lets you assign a custom name to a declaration in bytecode. You'd use it when Kotlin's default naming causes conflicts — like when you have two functions with the same name but different generic types that erase to the same JVM signature. It also lets you provide cleaner names for Java callers.

> **🧠 Think about it:** If you have `fun List<String>.filterValid()` and `fun List<Int>.filterValid()`, both erase to `filterValid(List)` on the JVM. How would `@JvmName` help you here?

#### How does a coroutine suspension point differ from a regular function call in bytecode?

A regular call compiles to `invokevirtual` or `invokestatic` — standard stuff. A suspension point does way more work: it saves all live local variables into the continuation's fields, sets the label, and returns `COROUTINE_SUSPENDED`. On resume, it restores those fields and jumps to the correct label. A suspend function with 5 suspension points generates roughly 5x the bytecode of a regular function with 5 method calls.

### Common Follow-ups

- How do extension functions compile to bytecode?
- What is the difference between `object` and `companion object` in bytecode?
- How does `const val` differ from `val` in a companion object?
- What overhead does a capturing lambda add compared to a non-capturing one?
- Why can't non-inline functions have reified type parameters?
- What happens at bytecode level with destructuring declarations?
- What is the performance difference between `when` on enum vs sealed class?
