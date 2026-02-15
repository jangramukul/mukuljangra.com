---
title: Kotlin Java Interop Guide
layout: post
sequence: 106
categories: post
tags:
  - Kotlin
  - Android
---

When Google announced first-class Kotlin support for Android at Google I/O 2017, the single most important promise was "100% Java interoperability." That promise is what made adoption possible. Teams didn't have to rewrite their entire codebase — they could add a single Kotlin file next to their existing Java code and everything would compile. I started migrating an Android project that had roughly 200 Java files, and the first few Kotlin files dropped in without friction. It felt seamless. But seamless and frictionless are different things.

"100% interop" means every Java API is callable from Kotlin and every Kotlin API is callable from Java. It does not mean the two languages see each other perfectly. Kotlin's null safety, default parameters, extension functions, companion objects, and internal visibility all have JVM representations that don't map cleanly to what Java expects. On the other side, Java's lack of nullability information creates platform types that silently undermine Kotlin's type system. Over two years of gradual migration, I learned that understanding these seams — the points where the two languages don't quite line up — is what separates a smooth migration from one littered with subtle runtime crashes and awkward API surfaces. This guide covers every interop friction point I've encountered, with real code to demonstrate each one.

## Calling Java from Kotlin

The most dangerous interop concept is platform types. When Kotlin calls a Java method that returns `String`, and that Java method has no `@NonNull` or `@Nullable` annotation, Kotlin doesn't know whether the value can be null. Instead of forcing you to treat it as nullable (which would make every Java call annoying), Kotlin creates a "platform type" — shown as `String!` in error messages. The compiler allows you to treat it as either `String` or `String?`. If you guess wrong and the Java method returns null while you're treating the result as non-null, you get a runtime NPE. No compiler warning, no safety net.

The danger is especially bad with method chaining. Consider calling a Java API that returns a user object, then immediately accessing a property on it:

```kotlin
// Java class — no nullability annotations
// public class LegacyUserDao {
//     public User findById(String id) { ... }
// }

// DANGEROUS — chaining on platform types
val userName = legacyDao.findById(userId).name  // NPE if findById returns null

// SAFE — assign to explicitly typed val first
val user: User? = legacyDao.findById(userId)
val userName = user?.name ?: "Unknown"
```

The fix is straightforward: always assign platform type returns to an explicitly typed local variable immediately. If you declare `val user: User?`, Kotlin inserts a null check at the assignment point. If you declare `val user: User`, Kotlin inserts an assertion — you'll still get an exception, but at the exact line where the assignment happens, not somewhere deep in a method chain three calls later. I prefer the nullable approach when calling legacy Java code, because it gives you full control over the null handling path.

The other major pattern when calling Java from Kotlin is SAM conversion. Kotlin lambdas work automatically with any Java interface that has a single abstract method — `Runnable`, `View.OnClickListener`, `Comparator`, `Callable`. This is why `button.setOnClickListener { doSomething() }` works out of the box in Android. The Kotlin compiler sees that `OnClickListener` is a Java interface with one abstract method and automatically converts the trailing lambda into an anonymous implementation. No `object :` syntax needed.

```kotlin
// SAM conversion — Kotlin lambda to Java interface
executor.execute { loadDataFromNetwork() }

binding.submitButton.setOnClickListener { viewModel.submit() }

val sorted = users.sortedWith(Comparator { a, b ->
    a.lastName.compareTo(b.lastName)
})
```

One thing to watch: SAM conversion only works automatically for Java interfaces. If you define a single-method interface in Kotlin and want the same lambda syntax, you need the `fun interface` keyword. This is a deliberate design choice by the Kotlin team — making SAM conversion explicit for Kotlin interfaces prevents the breakage that happens when someone adds a second method to what was previously a single-method interface.

## Calling Kotlin from Java

This is where most interop friction lives. Kotlin compiles to bytecode that Java can call, but without annotations, the resulting Java API is often awkward or unusable. Five annotations cover 90% of the problems.

**@JvmStatic** makes companion object functions accessible as static methods from Java. Without it, Java must go through the `Companion` instance, which looks bizarre in Java code.

```kotlin
class UserRepository private constructor(private val dao: UserDao) {

    companion object {
        @JvmStatic
        fun create(dao: UserDao): UserRepository = UserRepository(dao)

        // Without @JvmStatic, Java sees: UserRepository.Companion.getInstance()
        @JvmStatic
        fun getInstance(): UserRepository = instance ?: error("Not initialized")
    }
}

// Java usage:
// UserRepository.create(dao);       — clean, with @JvmStatic
// UserRepository.Companion.create(dao);  — ugly, without @JvmStatic
```

**@JvmField** exposes a Kotlin property as a direct field, skipping the generated getter and setter. This is essential for constants in companion objects and for framework fields that Java accesses by reflection.

```kotlin
class NetworkConfig {
    companion object {
        @JvmField
        val DEFAULT_TIMEOUT_MS = 30_000L

        const val BASE_URL = "https://api.example.com"  // const also works for primitives and String
    }
}

// Java usage:
// long timeout = NetworkConfig.DEFAULT_TIMEOUT_MS;  — direct field access
// String url = NetworkConfig.BASE_URL;              — compile-time constant
```

**@JvmOverloads** generates overloaded methods for functions with default parameter values. Java doesn't support default parameters, so without this annotation, Java callers must always pass every argument.

```kotlin
class NotificationBuilder {
    @JvmOverloads
    fun send(
        title: String,
        body: String,
        priority: Int = 0,
        channel: String = "default"
    ) {
        // Generates 4 Java overloads:
        // send(String, String, int, String)
        // send(String, String, int)
        // send(String, String)
    }
}
```

**@JvmName** renames the generated class for top-level functions or resolves signature clashes from type erasure. By default, top-level functions in a file named `NetworkUtils.kt` go into a class called `NetworkUtilsKt` — that `Kt` suffix looks wrong in Java code.

```kotlin
@file:JvmName("NetworkUtils")
package com.example.network

fun parseResponse(raw: String): Response { /* ... */ }

// Java: NetworkUtils.parseResponse(raw)  — instead of NetworkUtilsKt.parseResponse(raw)
```

**@Throws** declares checked exceptions for Java callers. Kotlin doesn't have checked exceptions, so by default Java can't catch specific exceptions from Kotlin functions in a try-catch block — the compiler complains that the exception is never thrown.

```kotlin
class FileManager {
    @Throws(IOException::class)
    fun readConfig(path: String): Config {
        val file = File(path)
        if (!file.exists()) throw IOException("Config not found: $path")
        return parseConfig(file.readText())
    }
}

// Java can now properly catch:
// try { fileManager.readConfig(path); }
// catch (IOException e) { /* handle */ }
```

## Nullability Annotations

The single most impactful thing you can do for Kotlin-Java interop is annotate your Java code with `@Nullable` and `@NonNull`. The Kotlin compiler reads these annotations and treats annotated Java types as proper nullable or non-null Kotlin types instead of platform types. This eliminates the entire category of platform type risks for annotated code.

Kotlin recognizes nullability annotations from multiple sources: JetBrains (`org.jetbrains.annotations`), AndroidX (`androidx.annotation`), JSR 305 (`javax.annotation`), FindBugs, Eclipse, Lombok, JSpecify, and RxJava 3. In Android development, `androidx.annotation.NonNull` and `@Nullable` are the standard choice because they're already a transitive dependency in most projects.

```kotlin
// Java code WITH annotations:
// @NonNull public String getName() { return name; }
// @Nullable public String getMiddleName() { return middleName; }

// Kotlin sees these as:
val name: String = user.name           // Non-null — compiler enforces
val middle: String? = user.middleName  // Nullable — compiler enforces

// Java code WITHOUT annotations:
// public String getNickname() { return nickname; }

// Kotlin sees this as:
val nickname: String! = user.nickname  // Platform type — no enforcement
```

The difference matters enormously at scale. In a project with 150 Java files being consumed by Kotlin, unannotated methods create hundreds of platform type landmines. I've seen production NPEs from platform types that sat dormant for months — the Java method always returned non-null until one edge case triggered a null return, and the Kotlin code had been treating it as non-null the entire time. Adding `@NonNull` annotations to your Java code before migrating to Kotlin is one of the highest-ROI preparation steps you can take. AndroidX libraries already do this extensively, which is why calling AndroidX APIs from Kotlin feels so natural.

## Collections Interop

Kotlin's collection system maps directly to Java's `java.util.List`, `java.util.Set`, and `java.util.Map` at the JVM level. Both `kotlin.collections.List` (read-only) and `kotlin.collections.MutableList` compile to the same `java.util.List` interface. This means Java code can modify a collection that Kotlin considers read-only — the immutability is a compile-time illusion, not a runtime guarantee.

```kotlin
// Kotlin — creating a read-only list
class UserCache {
    private val users = mutableListOf("Alice", "Bob")

    fun getUsers(): List<String> = users  // Returns read-only List from Kotlin's perspective
}

// Java — can mutate the "read-only" list
// UserCache cache = new UserCache();
// List<String> users = cache.getUsers();
// users.add("Charlie");  // Compiles and runs — mutates the backing list!
// users.clear();         // Also works — the read-only contract is not enforced at runtime
```

This is a real aliasing danger. The Java code doesn't know or care that Kotlin considers this list read-only. It sees `java.util.List`, which has `add()`, `remove()`, and `clear()`. Meanwhile, the Kotlin side assumes the list hasn't changed and might cache size calculations or skip null checks because it "knows" what's in the list.

The fix is defensive copying at API boundaries. If you're exposing a collection to Java callers, return a copy:

```kotlin
class UserCache {
    private val users = mutableListOf("Alice", "Bob")

    // Defensive copy — Java can't corrupt the internal state
    fun getUsers(): List<String> = users.toList()
}
```

The `toList()` call creates a new `ArrayList` under the hood, so mutations from Java affect only the copy. The cost is an allocation per call, which is negligible for most use cases. For hot paths where the allocation matters, `Collections.unmodifiableList()` wraps the original list and throws `UnsupportedOperationException` on mutation attempts — it doesn't copy, but it does enforce read-only at runtime.

## Kotlin Specifics Not Visible from Java

Several Kotlin features compile to JVM constructs that look different — or strange — from the Java side. Knowing what Java actually sees prevents surprises when your Kotlin code has Java callers.

**Extension functions become static methods.** A Kotlin extension `fun String.isEmail(): Boolean` compiles to a static method `public static boolean isEmail(String receiver)`. The receiver becomes the first parameter. From Java, it looks like a utility method, not a method on String.

**Default parameters are invisible without @JvmOverloads.** If a Kotlin function has three parameters with defaults, Java sees exactly one method signature with all three parameters required. There are no overloads unless you add the annotation.

**Companion object members need @JvmStatic.** Without it, Java accesses companion members through `ClassName.Companion.method()`. The `Companion` is a real nested class with a singleton `INSTANCE` field. Adding `@JvmStatic` generates a static method on the outer class that delegates to the companion, so Java can call `ClassName.method()` directly.

**Top-level functions go to a `FileNameKt` class.** Functions declared at the top level of `Extensions.kt` become static methods on `ExtensionsKt`. Use `@file:JvmName("Extensions")` to drop the `Kt` suffix.

**Data class `copy()` and `componentN()` are visible but unusual.** Java can call `user.copy(user.getName(), "newEmail")` and `user.component1()`, but nobody writes Java code this way. Destructuring and named copies are Kotlin idioms that don't translate to natural Java patterns. The `copy()` method is especially awkward because Java must pass all parameters positionally — no named arguments.

**Internal visibility becomes public with a mangled name.** Kotlin's `internal` modifier has no JVM equivalent. The compiler makes internal members public but mangles their names to include a hash of the module name, making them ugly and difficult to call from Java by accident. But they're not truly hidden — determined Java code can still call them. Don't rely on `internal` as a security boundary for Java callers.

## Migration Patterns

Gradual migration is the only sane approach. I've never seen a team successfully convert an entire Android codebase from Java to Kotlin in one pass, and I wouldn't recommend trying. The practical strategy is to convert file by file, starting from the leaves of your dependency graph and working inward. Utility classes, data models, and extension functions are the easiest starting points because they have few callers and clear interfaces.

The most important tool for understanding interop behavior is Kotlin's bytecode viewer. In Android Studio, open any Kotlin file and use **Tools > Kotlin > Show Kotlin Bytecode**, then click **Decompile**. This shows you the Java code that the Kotlin compiler actually generates. It's how I verified that `@JvmStatic` generates a static method on the outer class, that `internal` becomes public with name mangling, and that `@JvmOverloads` creates the expected overloads. Whenever you're unsure how Java will see your Kotlin code, decompile it. The decompiled output is the truth.

When writing new Kotlin code in a mixed codebase, design your public APIs as if Java will call them. Add `@JvmStatic` to companion factories, `@JvmOverloads` to functions with defaults, `@JvmField` to constants, and `@Throws` to anything that can throw checked exceptions. This costs nothing — these annotations don't affect Kotlin callers at all — but it makes the Java side of the codebase dramatically more pleasant. Once the Java callers are migrated to Kotlin, you can remove the annotations during cleanup, though leaving them in is harmless.

For the Java code that Kotlin will call, add `@NonNull` and `@Nullable` annotations before you start the migration. Every annotated method is one fewer platform type risk. If you're using AndroidX (you should be), the annotation dependency is already there. This single step — annotating your Java APIs — eliminates more interop bugs than any other preparation work. I'd estimate it prevented at least a dozen production NPEs in our migration by making platform type risks visible at compile time instead of runtime.

One pattern I've found useful is writing "interop wrapper" classes during the transition period. When a Java class has an API that's particularly awkward from Kotlin (lots of null returns, checked exceptions everywhere, mutable collections in the interface), write a thin Kotlin wrapper that handles the null mapping, catches and converts exceptions, and defensive-copies collections. The wrapper becomes the public API for Kotlin callers, and you delete it when the underlying Java class gets migrated to Kotlin. It's a small amount of throwaway code that prevents interop bugs from spreading across the codebase.

## Quiz

#### What are platform types in Kotlin?

- **Wrong** Types that only work on specific platforms (Android, iOS)
- **Correct** Java types without nullability annotations — Kotlin allows them to be used as either nullable or non-null, but NPE is possible at runtime
- **Wrong** Types generated by Kotlin for cross-platform code
- **Wrong** Special types for interfacing with native code

> **Explanation:** When Java code doesn't have @Nullable/@NonNull annotations, Kotlin can't determine nullability. These become "platform types" (shown as T! in error messages). Kotlin won't force null checks, but if the Java method returns null and you treat it as non-null, you get an NPE.

#### Why should you add @JvmStatic to companion object members?

- **Wrong** It improves performance by avoiding object allocation
- **Correct** It makes them accessible as static methods from Java — without it, Java must use `ClassName.Companion.method()`
- **Wrong** It's required for all companion object members
- **Wrong** It makes them thread-safe

> **Explanation:** Without @JvmStatic, Java sees companion members through the Companion instance: `User.Companion.create()`. With @JvmStatic, Java can call `User.create()` directly. This matters for any public API consumed by Java code.

## Coding Challenge

Create a Kotlin `UserService` class designed for clean Java interop. It should have: a companion object with `@JvmStatic` factory methods, `@JvmOverloads` on a function with default parameters, `@JvmField` on a constant, proper `@Throws` annotation for a function that throws, and demonstrate handling platform types safely when calling a hypothetical Java `LegacyUserDao`. Show both the Kotlin code and how Java would call each method.

#### Solution

```kotlin
class UserService private constructor(private val dao: LegacyUserDao) {

    companion object {
        @JvmField
        val MAX_BATCH_SIZE = 100

        @JvmStatic
        fun create(dao: LegacyUserDao): UserService = UserService(dao)
    }

    @JvmOverloads
    fun findUsers(
        query: String,
        limit: Int = 20,
        includeInactive: Boolean = false
    ): List<User> {
        return dao.search(query, limit, includeInactive)
    }

    @Throws(UserNotFoundException::class)
    fun getUser(id: String): User {
        // Safe platform type handling — assign to nullable typed val
        val user: User? = dao.findById(id)
        return user ?: throw UserNotFoundException("No user with id: $id")
    }

    fun getUserNames(): List<String> {
        // Defensive copy — Java callers can't corrupt internal state
        val raw: List<String>? = dao.allNames
        return raw?.toList() ?: emptyList()
    }
}

// Java usage:
// int max = UserService.MAX_BATCH_SIZE;              — direct field access
// UserService svc = UserService.create(dao);         — static factory
// List<User> results = svc.findUsers("alice");       — uses defaults
// List<User> full = svc.findUsers("alice", 50, true); — all params
// try {
//     User user = svc.getUser("123");
// } catch (UserNotFoundException e) {
//     // properly declared checked exception
// }
// List<String> names = svc.getUserNames();           — safe defensive copy
```

Thanks for reading!
