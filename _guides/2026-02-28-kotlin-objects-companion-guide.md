---
title: Kotlin Object Declarations and Companion Objects Guide
layout: post
sequence: 94
categories: post
tags:
  - Kotlin
  - Android
---

The `object` keyword is one of those Kotlin features that does three distinct things, and understanding which one you're using matters more than most people realize. It creates singletons via object declarations. It creates companion objects that give you a place for factory methods and constants. And it creates anonymous objects that replace Java's anonymous inner classes. Each of these maps to fundamentally different bytecode on the JVM, and each has specific tradeoffs that affect how you design Android applications. I see a lot of developers treat these three uses interchangeably — writing companion objects when they want singletons, or using object declarations when anonymous objects would be cleaner — and it creates code that's harder to test, harder to reason about, and occasionally leaks memory.

What makes the `object` keyword interesting to me isn't the syntax — it's the design philosophy behind it. Kotlin's designers looked at three patterns that Java developers implemented manually (singletons with double-checked locking, static factory methods, anonymous inner classes) and said: "These patterns are so common that they should be language features." The result is three uses of a single keyword that each compile to different JVM constructs, with different initialization semantics, different access patterns, and different gotchas. Once you understand what the compiler generates for each one, you stop guessing and start making deliberate choices.

## Object Declarations — Singletons

An object declaration is Kotlin's built-in singleton pattern. You declare it with the `object` keyword instead of `class`, and Kotlin guarantees exactly one instance exists for the lifetime of your process. No constructor calls, no getInstance() methods, no double-checked locking boilerplate.

```kotlin
object Analytics {
    private val events = mutableListOf<AnalyticsEvent>()

    fun track(name: String, properties: Map<String, Any> = emptyMap()) {
        val event = AnalyticsEvent(
            name = name,
            properties = properties,
            timestamp = System.currentTimeMillis()
        )
        events.add(event)
        flush(event)
    }

    fun getEventCount(): Int = events.size

    private fun flush(event: AnalyticsEvent) {
        // Send to analytics backend
    }
}

// Usage — no instantiation, just call directly
Analytics.track("screen_view", mapOf("screen" to "home"))
Analytics.track("button_click", mapOf("id" to "checkout"))
```

Here's the thing most developers don't look into — what this actually compiles to on the JVM. The Kotlin compiler generates a final class with a private constructor and a `public static final` field named `INSTANCE`. The initialization happens in a static initializer block, which the JVM class loader guarantees will execute exactly once, in a thread-safe manner, when the class is first accessed. This is important because it means object declarations get thread-safe lazy initialization for free — no `synchronized` blocks, no volatile fields, no `AtomicReference` wrappers. The JVM specification (§5.5) guarantees that class initialization is performed safely in multithreaded environments. You'd need roughly 15 lines of boilerplate in Java to achieve the same guarantee (and I've seen plenty of Java singletons that get it wrong).

The decompiled Java equivalent looks roughly like this: a private constructor that prevents external instantiation, a static `INSTANCE` field initialized in a static block, and all your declared members compiled as regular instance methods called on `INSTANCE`. When you write `Analytics.track(...)` in Kotlin, the compiler generates `Analytics.INSTANCE.track(...)` in bytecode. It's a regular virtual method dispatch on a singleton reference — nothing exotic.

Object declarations are lazily initialized. The instance doesn't exist until something first references the class. This means if you declare an `object NetworkMonitor` but no code ever touches it during a particular run, the JVM never loads that class or creates the instance. In Android, this is a nice property because it means your singletons don't all initialize at Application.onCreate() time — they spread out based on actual usage, which helps startup performance.

## Companion Objects

A companion object is an object declaration nested inside a class, marked with the `companion` keyword. It gives you a place to put factory methods, constants, and utility functions that are associated with a class but don't need an instance. You can name companion objects or leave them unnamed — most codebases use unnamed companions, but names become useful when a class needs to implement interfaces on its companion.

The factory pattern is where companion objects really shine. Instead of exposing a public constructor and hoping callers pass the right arguments, you make the constructor private and provide named factory methods that express intent:

```kotlin
class User private constructor(
    val name: String,
    val email: String,
    val role: Role
) {
    enum class Role { ADMIN, MEMBER, GUEST }

    companion object {
        fun admin(name: String): User {
            return User(
                name = name,
                email = "$name@company.com",
                role = Role.ADMIN
            )
        }

        fun guest(): User {
            return User(
                name = "Guest",
                email = "guest@placeholder.com",
                role = Role.GUEST
            )
        }

        fun fromEmail(email: String): User {
            val name = email.substringBefore("@")
            return User(name = name, email = email, role = Role.MEMBER)
        }

        const val MAX_NAME_LENGTH = 50
    }
}

// Usage reads like named constructors
val admin = User.admin("Mukul")
val guest = User.guest()
val member = User.fromEmail("alice@example.com")
```

The readability difference is significant. `User.admin("Mukul")` tells you exactly what kind of user you're creating. Compare that to `User("Mukul", "mukul@company.com", Role.ADMIN)` where the caller has to know the email format convention and remember the parameter order. Factory methods encode domain knowledge — the email pattern for admins, the placeholder values for guests — so callers don't have to.

Under the hood, the Kotlin compiler generates a static inner class named `Companion` inside your class. The companion object's members become instance methods on that inner class, and the outer class gets a `public static final` field pointing to the companion instance. This is why Java code has to write `User.Companion.admin("Mukul")` to call companion methods — it's accessing the companion instance field and calling a regular method on it. The `Companion` name isn't just a convention; it's the actual generated class name. If you give your companion a name (`companion object Factory`), the generated class uses that name instead, so Java would call `User.Factory.admin("Mukul")`.

## @JvmStatic

If your Kotlin code is called from Java — and in most Android projects with mixed codebases, it is — `@JvmStatic` is essential. Without it, every companion object member requires the awkward `User.Companion.method()` syntax in Java. With `@JvmStatic`, the compiler generates an additional static method on the outer class that delegates to the companion, so Java can call `User.admin("Mukul")` directly.

```kotlin
class ApiConfig private constructor(val baseUrl: String, val timeout: Long) {

    companion object {
        @JvmStatic
        fun production(): ApiConfig {
            return ApiConfig("https://api.production.com", 30_000)
        }

        @JvmStatic
        fun staging(): ApiConfig {
            return ApiConfig("https://api.staging.com", 60_000)
        }

        @JvmStatic
        val DEFAULT_TIMEOUT = 30_000L
    }
}

// Kotlin: ApiConfig.production() — works with or without @JvmStatic
// Java without @JvmStatic: ApiConfig.Companion.production()
// Java with @JvmStatic: ApiConfig.production()
```

The `@JvmStatic` annotation doesn't change how the code behaves — it changes what the compiler generates. Without it, the companion has the method and the outer class doesn't. With it, the compiler generates a static forwarding method on the outer class that delegates to the companion's implementation. You get both access paths: `ApiConfig.production()` and `ApiConfig.Companion.production()` both work from Java.

My rule is simple: if the class is part of a public API, a shared module, or a codebase that still has Java files, add `@JvmStatic` to every companion object member. The cost is zero — it just generates an extra method — and it saves every Java caller from writing `Companion` in their code. For `@JvmField` on companion properties, the same logic applies. A `const val` in a companion already compiles to a static field, but a non-const `val` doesn't — `@JvmField` forces it to be a direct static field instead of requiring a getter call through the companion.

## Companion Objects Implementing Interfaces

This is where companion objects diverge from Java's static methods in a meaningful way. Since a companion object is a real object — an actual instance of a generated class — it can implement interfaces. Static methods in Java can't do this. You can define a contract that a companion must fulfill, and use that contract polymorphically.

```kotlin
interface EntityFactory<T> {
    fun fromMap(data: Map<String, Any>): T
    fun empty(): T
}

class Product private constructor(
    val id: String,
    val name: String,
    val price: Double
) {
    companion object : EntityFactory<Product> {
        override fun fromMap(data: Map<String, Any>): Product {
            return Product(
                id = data["id"] as String,
                name = data["name"] as String,
                price = data["price"] as Double
            )
        }

        override fun empty(): Product = Product("", "Unknown", 0.0)
    }
}

class Order private constructor(
    val orderId: String,
    val total: Double
) {
    companion object : EntityFactory<Order> {
        override fun fromMap(data: Map<String, Any>): Order {
            return Order(
                orderId = data["orderId"] as String,
                total = data["total"] as Double
            )
        }

        override fun empty(): Order = Order("", 0.0)
    }
}

// Now you can write generic code against the factory interface
fun <T> loadFromCache(
    cache: Map<String, Any>?,
    factory: EntityFactory<T>
): T {
    return if (cache != null) factory.fromMap(cache) else factory.empty()
}

// Usage — pass the companion object itself as the factory
val product = loadFromCache(cachedData, Product)
val order = loadFromCache(orderCache, Order)
```

This pattern is genuinely powerful for serialization frameworks, dependency injection containers, and any system where you need to create instances without knowing the concrete type at compile time. The companion object acts as a type-level function — you pass the class (via its companion), and the companion knows how to construct instances. Kotlinx.serialization uses a variation of this pattern internally, where the companion object (or a related object) holds the serializer for the class.

## Anonymous Objects

Anonymous objects replace Java's anonymous inner classes, but with a critical difference: they can access and modify mutable variables from the enclosing scope. In Java, anonymous inner classes can only access variables that are `final` or effectively final. Kotlin removes this restriction because the compiler captures mutable variables by wrapping them in a `Ref` object — essentially boxing the variable so the anonymous object and the enclosing scope share a reference to the same mutable wrapper.

```kotlin
fun createSortedUsers(users: List<User>): List<User> {
    var sortCount = 0

    val comparator = object : Comparator<User> {
        override fun compare(a: User, b: User): Int {
            sortCount++ // Modifying outer scope variable — can't do this in Java
            return a.name.compareTo(b.name)
        }
    }

    val sorted = users.sortedWith(comparator)
    println("Comparisons made: $sortCount")
    return sorted
}
```

Anonymous objects can also implement multiple interfaces simultaneously, which is useful for one-off implementations where creating a named class feels like overkill:

```kotlin
interface ClickListener {
    fun onClick(viewId: Int)
}

interface LongClickListener {
    fun onLongClick(viewId: Int): Boolean
}

fun setupInteractionHandler(): Any {
    return object : ClickListener, LongClickListener {
        override fun onClick(viewId: Int) {
            println("Clicked view: $viewId")
        }

        override fun onLongClick(viewId: Int): Boolean {
            println("Long-clicked view: $viewId")
            return true
        }
    }
}
```

One important note about anonymous object types. If you assign an anonymous object to a local variable, the compiler knows the full type (including all implemented interfaces), so you can access all members. But if you return an anonymous object from a public function, the return type is just the declared supertype — Kotlin won't expose anonymous object members beyond what the declared return type specifies. This is a deliberate design choice to prevent leaking implementation details through public APIs.

## Object vs Companion Object vs Class

Knowing the syntax of each is easy. Knowing when to pick which one is where the real skill is, and where I see the most confusion in code reviews.

**Object declarations** are for true singletons — things that genuinely should have exactly one instance for the lifetime of your process. Analytics trackers, logging wrappers, in-memory caches, feature flag managers, API endpoint registries. The key question is: does it make sense for this thing to exist exactly once? If you'd ever want two instances (maybe one for production and one for testing), an object declaration is the wrong tool. Use a class with dependency injection instead.

**Companion objects** are for class-associated functionality that doesn't need an instance — factory methods, constants, and utility functions that logically belong to a class. The mental model I use: if you'd put it in a `static` block in Java, it goes in the companion. But unlike Java statics, companion objects can implement interfaces and be passed around as values, which opens up the factory interface pattern I showed earlier.

**Anonymous objects** are for one-off implementations where you need a type but don't need a name. Comparators, listeners, callbacks, test doubles. If you're only using it once and the implementation is short (under 15-20 lines), an anonymous object is usually cleaner than a named class.

Here's a warning specifically for Android developers: object declarations hold state for the entire process lifetime, and Android processes can live longer than any single Activity or Fragment. If your singleton object holds a reference to a `Context`, an `Activity`, a `View`, or anything that references these, you have a memory leak. The singleton outlives the Activity, the Activity can't be garbage collected, and its entire view hierarchy stays in memory. I've seen production apps leaking 50+ MB because an object declaration cached a `Context` reference for "convenience." Always use `applicationContext` if a singleton genuinely needs a Context, and prefer passing Context as a method parameter rather than storing it as a field. Better yet, use dependency injection to scope your dependencies properly — a singleton managed by Dagger/Hilt with `@ApplicationContext` is safer than a raw `object` declaration holding a Context field.

The other tradeoff worth calling out: object declarations are notoriously hard to mock in tests. Because there's no constructor, you can't swap in a test double. If your `Analytics` is an object declaration, every test that touches code calling `Analytics.track()` hits the real implementation. For anything with side effects (network calls, database writes, analytics), I prefer defining an interface and using dependency injection. Reserve object declarations for things that are truly stateless or where the global state is intentional and safe.

Thanks for reading!

## Quiz

#### How does an `object` declaration compile on the JVM?

- **Wrong** As a regular class that's instantiated once at startup
- **Correct** As a class with a private constructor and a `public static final INSTANCE` field, initialized thread-safely by the class loader
- **Wrong** As a static utility class with only static methods
- **Wrong** As an enum with a single constant

> **Explanation:** Object declarations compile to a final class with a private constructor and an `INSTANCE` field. The JVM class loader guarantees thread-safe initialization — the instance is created exactly once when the class is first accessed.

#### Why should you add `@JvmStatic` to companion object members?

- **Wrong** It makes them thread-safe
- **Wrong** It improves performance by avoiding object allocation
- **Correct** It makes them accessible as regular static methods from Java, instead of requiring `User.Companion.method()` syntax
- **Wrong** It's required for all companion object members

> **Explanation:** Without `@JvmStatic`, Java code must use `User.Companion.create()`. With it, Java sees `User.create()` directly. This is important for public APIs consumed by Java code.

## Coding Challenge

Create a `Logger` singleton object with log levels (DEBUG, INFO, WARN, ERROR), a configurable minimum level, and a log() method that filters by level. Then create a `DatabaseConfig` class with a private constructor and companion object factory methods: `fromUrl(String)`, `inMemory()`, and `default()`. The companion should implement a `ConfigProvider` interface. Show @JvmStatic on the factory methods.

#### Solution

```kotlin
object Logger {
    enum class Level { DEBUG, INFO, WARN, ERROR }

    var minLevel: Level = Level.INFO

    fun log(level: Level, tag: String, message: String) {
        if (level.ordinal >= minLevel.ordinal) {
            val prefix = "[${level.name}][$tag]"
            println("$prefix $message")
        }
    }

    fun debug(tag: String, message: String) = log(Level.DEBUG, tag, message)
    fun info(tag: String, message: String) = log(Level.INFO, tag, message)
    fun warn(tag: String, message: String) = log(Level.WARN, tag, message)
    fun error(tag: String, message: String) = log(Level.ERROR, tag, message)
}

interface ConfigProvider<T> {
    fun default(): T
}

class DatabaseConfig private constructor(
    val url: String,
    val inMemory: Boolean
) {
    companion object : ConfigProvider<DatabaseConfig> {
        @JvmStatic
        fun fromUrl(url: String): DatabaseConfig {
            return DatabaseConfig(url = url, inMemory = false)
        }

        @JvmStatic
        fun inMemory(): DatabaseConfig {
            return DatabaseConfig(url = "jdbc:sqlite::memory:", inMemory = true)
        }

        @JvmStatic
        override fun default(): DatabaseConfig {
            return DatabaseConfig(url = "jdbc:sqlite:app.db", inMemory = false)
        }
    }

    override fun toString() = "DatabaseConfig(url=$url, inMemory=$inMemory)"
}

fun main() {
    Logger.minLevel = Logger.Level.DEBUG
    Logger.debug("DB", "Initializing database")
    Logger.info("DB", "Connected successfully")

    val prodDb = DatabaseConfig.fromUrl("jdbc:postgresql://prod:5432/myapp")
    val testDb = DatabaseConfig.inMemory()
    val defaultDb = DatabaseConfig.default()

    Logger.info("DB", "Config: $defaultDb")
}
```
