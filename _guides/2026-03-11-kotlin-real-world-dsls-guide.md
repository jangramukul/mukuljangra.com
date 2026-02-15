---
title: Kotlin Real-World DSLs Guide
layout: post
sequence: 105
categories: post
tags:
  - Kotlin
  - Android
---

Every Android developer uses DSLs daily without thinking about it. You open a `build.gradle.kts` file and write `dependencies { implementation("...") }`. You compose a screen with `Column { Text("Hello") }`. You define API routes with `routing { get("/users") { } }`. These feel like custom languages embedded inside Kotlin, but they're not. They're plain Kotlin code leveraging a handful of language features — primarily lambdas with receivers, extension functions, and infix notation. The "magic" is just clever API design.

I spent a long time treating these DSLs as black boxes. Gradle does Gradle things, Compose does Compose things, Ktor does Ktor things. But once I started reading the source code behind these APIs, I realized they all use the same small set of Kotlin patterns. Understanding those patterns changed how I read framework code, how I debug build issues, and how I design my own APIs. The moment you see that `dependencies { }` is just a lambda with `DependencyHandler` as the receiver, Gradle stops being a mysterious build system and starts being Kotlin code you can reason about.

This post dissects how Gradle, Compose, Ktor, and testing frameworks build their DSLs, then covers how to build your own. The goal isn't to turn you into a DSL framework author — it's to make you fluent in reading and debugging the DSLs you already use every day.

## Gradle's Build DSL

Gradle's Kotlin DSL is probably the first DSL most Android developers encounter, and it's also the one most people treat as pure configuration rather than real code. But every line in `build.gradle.kts` is executable Kotlin. The file itself is compiled by the Kotlin compiler and runs on the JVM. When you write `dependencies { }`, you're calling a function. When you write `implementation("...")` inside that block, you're calling a method on an object.

Here's how it actually works. The `dependencies` function takes a lambda with `DependencyHandler` as the receiver — its signature is essentially `fun dependencies(config: DependencyHandler.() -> Unit)`. Inside that lambda, `this` is a `DependencyHandler` instance, which means you can call `implementation()`, `api()`, `testImplementation()`, and `kapt()` directly because they're all methods on `DependencyHandler`.

```kotlin
// What you write
dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    testImplementation("junit:junit:4.13.2")
}

// What the compiler sees (roughly)
project.dependencies.configure { handler: DependencyHandler ->
    handler.implementation("androidx.core:core-ktx:1.12.0")
    handler.testImplementation("junit:junit:4.13.2")
}
```

The `plugins { }` block works the same way but with a different receiver. Its receiver is `PluginDependenciesSpec`, and functions like `id()` and `kotlin()` are methods on that spec. The `android { }` block's receiver is `BaseExtension` (or more specifically, `ApplicationExtension` or `LibraryExtension` depending on the plugin). Each nested block introduces a new receiver, and each receiver exposes the methods available at that scope.

The key insight is this: when you get a "unresolved reference" error in a Gradle file, it means you're trying to call a method that doesn't exist on the current receiver. Once you know the receiver type, you can look up its API in the Gradle documentation and see exactly what's available. The Kotlin DSL is just Kotlin. You can use `if` statements, `for` loops, variables, and functions inside build scripts because they're compiled Kotlin code. This is the fundamental advantage over Groovy-based Gradle files, where the boundary between configuration and code was always blurry.

## Jetpack Compose as a DSL

Compose takes a different approach to DSL construction than Gradle. Where Gradle uses lambdas with receivers on builder objects, Compose uses `@Composable` annotated functions that accept `@Composable` lambdas as their `content` parameter. `Column`, `Row`, and `Box` aren't classes you instantiate — they're functions that take a composable lambda and emit UI nodes into the composition tree.

```kotlin
// Column is a function, not a class
@Composable
fun Column(
    modifier: Modifier = Modifier,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    horizontalAlignment: Alignment.Horizontal = Alignment.Start,
    content: @Composable ColumnScope.() -> Unit
) { ... }
```

Notice that `content` is `@Composable ColumnScope.() -> Unit` — a lambda with `ColumnScope` as the receiver. This is why you can call `ColumnScope`-specific functions like `weight()` inside a `Column` block. The DSL pattern is still lambda-with-receiver under the hood, just like Gradle. But Compose layers something additional on top: the `@Composable` annotation.

The `@Composable` annotation restricts where composable functions can be called. You can only call a `@Composable` function from within another `@Composable` context. Try calling `Text("hello")` from a regular function and the compiler rejects it. This is similar in spirit to `@DslMarker`, which prevents accidentally calling methods from an outer DSL scope. Both are compile-time restrictions that enforce "this operation only makes sense in the right context." Compose enforces it through a compiler plugin that transforms composable functions at compile time, while `@DslMarker` works through Kotlin's scoping rules — different mechanisms, same design philosophy.

Modifier chaining is a separate pattern from the DSL blocks. `Modifier.padding(16.dp).fillMaxWidth().clickable { }` is method chaining — each call returns a new `Modifier` that wraps the previous one. This is the Builder pattern, not a DSL block pattern. Compose combines both: DSL blocks for tree structure (`Column { Row { Text() } }`) and method chaining for configuration (`Modifier.padding().background()`). Recognizing which pattern is in play at any given moment helps you understand why certain APIs look the way they do. You nest composables because you're building a tree. You chain modifiers because you're configuring a single node.

## Ktor Routing DSL

Ktor's routing DSL is one of the cleanest examples of nested lambdas with receivers building a tree structure. When you write `routing { get("/users") { call.respondText("...") } }`, each nesting level adds a path segment to the routing tree, and each block has a different receiver that provides the methods available at that level.

```kotlin
fun Application.configureRouting() {
    routing {
        route("/api") {
            route("/users") {
                get {
                    val users = userRepository.findAll()
                    call.respond(users)
                }
                post {
                    val request = call.receive<CreateUserRequest>()
                    val user = userRepository.create(request)
                    call.respond(HttpStatusCode.Created, user)
                }
                route("/{id}") {
                    get {
                        val id = call.parameters["id"]
                        val user = userRepository.findById(id!!)
                        call.respond(user)
                    }
                }
            }
        }
    }
}
```

The `routing` function's receiver is `Routing`, which extends `Route`. The `route("/api")` function's receiver is also `Route`. And `get`, `post`, `put`, `delete` are extension functions on `Route` that create leaf nodes in the routing tree. Each call to `route()` creates a child `Route` node with the specified path segment, and the lambda you pass configures that child. The tree that gets built mirrors the nesting of your code — `/api/users/{id}` is three levels of `route()` calls deep.

Inside the leaf handlers (the lambdas passed to `get`, `post`, etc.), the receiver is `PipelineContext<Unit, ApplicationCall>`, which gives you access to `call` — the object you use to read the request and write the response. This is a pattern worth studying because it shows how receivers change at each nesting level to expose exactly the right API for that context. At the routing level, you get path-building methods. At the handler level, you get request/response methods. The DSL guides you toward writing correct code by only making relevant operations available.

The broader pattern here is a route builder. Ktor isn't the only framework that uses it — Spring's Kotlin DSL (`router { }`) works almost identically. The DSL compiles to a tree of route objects with handlers attached to the leaves. When a request comes in, the framework walks the tree to find a matching route and executes its handler.

## Testing DSLs

Testing frameworks are where Kotlin DSLs arguably shine brightest, because the goal of a testing DSL is readability — tests should read like specifications. Kotest and MockK both leverage infix functions and lambdas with receivers to achieve this.

Kotest's assertion DSL turns assertions into infix expressions. `result shouldBe 42` reads like English. Underneath, `shouldBe` is an infix extension function on `Any?` that throws an `AssertionError` if the values don't match. The entire assertion library is built from these infix functions: `shouldContain`, `shouldHaveSize`, `shouldBeGreaterThan`, `shouldBeNull`, `shouldThrow`. Each one is a small extension function, but together they form a vocabulary for expressing test expectations.

```kotlin
// JUnit style — which argument is expected vs actual?
assertEquals(42, calculator.add(20, 22))
assertTrue(result.isNotEmpty())
assertNotNull(user.profile)

// Kotest style — reads left to right, no ambiguity
calculator.add(20, 22) shouldBe 42
result.shouldNotBeEmpty()
user.profile.shouldNotBeNull()
```

The JUnit style forces you to remember argument order — is it `assertEquals(expected, actual)` or `assertEquals(actual, expected)`? I've seen this mistake cause false-passing tests in production codebases. The infix style eliminates this ambiguity because the subject is always on the left and the expected value is always on the right.

MockK uses a different DSL pattern. `every { userRepository.findById(any()) } returns mockUser` combines a lambda (to capture the call being mocked) with an infix function (`returns`) to specify the behavior. The `every` block uses internal bytecode tricks to record which method you're calling, and `returns` configures the mock's response. It's an unusual DSL because the lambda body isn't executed normally — MockK intercepts the call inside the lambda to figure out what to mock.

```kotlin
val userRepository = mockk<UserRepository>()

every { userRepository.findById("user-123") } returns User(
    id = "user-123",
    name = "Mukul",
    email = "mukul@example.com"
)

every { userRepository.findById(any()) } throws NotFoundException("User not found")

verify(exactly = 1) { userRepository.findById("user-123") }
```

This is a good example of a DSL that pushes the boundaries of what's readable. `every { ... } returns value` reads naturally. `verify(exactly = 1) { ... }` uses named parameters for clarity. MockK's API designers made conscious choices about where to use infix functions versus normal function calls, and the result is a DSL that looks nothing like the underlying proxy-based mock machinery.

## Building Your Own DSL

The most practical advice I can give for building DSLs: start with the desired call-site syntax, then work backwards to the implementation. Write out how you want the API to look when someone uses it, pin that down, and then figure out what combination of receivers, extensions, and infix functions makes it work. Too many DSLs start with the implementation ("I have a builder class, let me expose it") and end up with awkward syntax because the API was shaped by internals rather than usage.

```kotlin
// Step 1: Write the desired syntax first
val config = serverConfig {
    host = "0.0.0.0"
    port = 8080

    database {
        url = "jdbc:postgresql://localhost/mydb"
        maxConnections = 10
    }

    logging {
        level = LogLevel.INFO
        format = "json"
    }
}

// Step 2: Work backwards to the builders
class ServerConfig {
    var host: String = "localhost"
    var port: Int = 8080
    var db: DatabaseConfig = DatabaseConfig()
    var log: LoggingConfig = LoggingConfig()

    fun database(block: DatabaseConfig.() -> Unit) {
        db = DatabaseConfig().apply(block)
    }

    fun logging(block: LoggingConfig.() -> Unit) {
        log = LoggingConfig().apply(block)
    }
}

class DatabaseConfig {
    var url: String = ""
    var maxConnections: Int = 5
}

class LoggingConfig {
    var level: LogLevel = LogLevel.WARN
    var format: String = "text"
}

fun serverConfig(block: ServerConfig.() -> Unit): ServerConfig {
    return ServerConfig().apply(block)
}
```

For nested DSLs with multiple builder types, use `@DslMarker` to prevent scope leakage. Without it, inside a `database { }` block you could accidentally call `logging { }` from the outer `ServerConfig` receiver. `@DslMarker` restricts implicit access to the nearest receiver only.

```kotlin
@DslMarker
annotation class ConfigDsl

@ConfigDsl
class ServerConfig { ... }

@ConfigDsl
class DatabaseConfig { ... }
```

Now inside `database { }`, trying to call `host = "..."` (from `ServerConfig`) gives a compiler error. You'd have to write `this@serverConfig.host = "..."` to be explicit. This is exactly the same principle as `@Composable` restrictions — the annotation prevents you from doing something that's technically possible but almost certainly a mistake.

When is a DSL overkill? When the underlying API is already clean. If your configuration class has five properties and no nesting, a data class with named parameters is simpler and more discoverable than a DSL builder. DSLs earn their complexity when you have nested structures, optional blocks, or when the API is called frequently enough that the syntactic improvement compounds. A DSL for a one-time setup call is ceremony. A DSL for something used on every screen in your app is an investment.

## DSL Techniques Checklist

**Lambdas with receivers** are the foundation of every DSL in this post. `Type.() -> Unit` makes the lambda's body execute with `Type` as `this`, giving you implicit access to all of `Type`'s members. This is what powers `dependencies { }`, `Column { }`, `routing { }`, and every builder pattern.

**Infix functions** create natural-language-style binary expressions. `result shouldBe 42`, `"name" to "value"`, `element in collection`. They work best when the function name acts as a verb or connector between two operands. Use them for assertions, pair creation, and domain operations where the syntax reads like a sentence.

**Operator overloading** matters for mathematical or collection-like DSLs. `vector1 + vector2`, `matrix * scalar`, `config["key"]`. The operators are fixed (you can't invent new symbols), but you can define what existing operators mean for your types. Keep semantics predictable — `+` should be additive, `[]` should be access.

**Property delegates** handle configuration DSLs where properties need lazy initialization, validation, or observation. `var port by Delegates.observable(8080) { _, old, new -> ... }` lets you react to configuration changes. `by lazy { }` defers expensive initialization until first access.

**Extension functions** extend existing types with DSL-specific methods without modifying the original class. Ktor adds `get()`, `post()`, and `route()` to `Route` via extensions. Kotest adds `shouldBe` to `Any?` via extensions. This is how DSLs graft new vocabulary onto existing types without inheritance.

These five techniques cover almost every real-world DSL you'll encounter. Gradle, Compose, Ktor, Kotest, MockK, kotlinx.html, Exposed — they're all built from combinations of these same building blocks. Once you can spot which technique is being used where, reading unfamiliar DSL code stops being intimidating and starts being pattern recognition.

Thanks for reading!

## Quiz

#### How does Gradle's `dependencies { implementation("...") }` actually work?

- **Wrong** Gradle uses annotation processing to parse the DSL
- **Correct** `dependencies` takes a lambda with `DependencyHandler` as receiver — `implementation()` is a method on `DependencyHandler`
- **Wrong** Gradle compiles the DSL to XML behind the scenes
- **Wrong** It uses reflection to find and invoke matching methods

> **Explanation:** Gradle's Kotlin DSL is just Kotlin code. `dependencies { }` calls a function that takes `DependencyHandler.() -> Unit`. Inside that block, `this` is a `DependencyHandler`, so you can call its `implementation()`, `api()`, and `testImplementation()` methods directly.

#### What makes Compose's @Composable annotation similar in spirit to @DslMarker?

- **Wrong** They both improve performance
- **Correct** Both restrict where certain functions can be called — @Composable functions can only be called from @Composable contexts, preventing misuse
- **Wrong** They both generate code at compile time
- **Wrong** They're identical in implementation

> **Explanation:** @DslMarker prevents calling outer scope methods accidentally. @Composable prevents calling composable functions from non-composable contexts. Both use compile-time restrictions to prevent misuse — they enforce that certain operations only happen in the right context.

## Coding Challenge

Build a testing assertion DSL inspired by Kotest. Create: `infix fun <T> T.shouldBe(expected: T)`, `infix fun <T> T.shouldNotBe(expected: T)`, `infix fun String.shouldContain(substring: String)`, `infix fun <T> Collection<T>.shouldHaveSize(size: Int)`, and a `describe` block: `describe("Calculator") { it("should add") { (2 + 2) shouldBe 4 } }`. The describe/it blocks should collect and run test cases, reporting pass/fail results.

#### Solution

```kotlin
infix fun <T> T.shouldBe(expected: T) {
    if (this != expected) throw AssertionError("Expected <$expected> but was <$this>")
}

infix fun <T> T.shouldNotBe(expected: T) {
    if (this == expected) throw AssertionError("Expected value to not be <$expected>")
}

infix fun String.shouldContain(substring: String) {
    if (substring !in this) throw AssertionError("Expected \"$this\" to contain \"$substring\"")
}

infix fun <T> Collection<T>.shouldHaveSize(size: Int) {
    if (this.size != size) throw AssertionError("Expected size <$size> but was <${this.size}>")
}

class TestSuite(val name: String) {
    private val tests = mutableListOf<Pair<String, () -> Unit>>()

    fun it(description: String, test: () -> Unit) {
        tests.add(description to test)
    }

    fun run() {
        println("--- $name ---")
        var passed = 0
        var failed = 0
        for ((description, test) in tests) {
            try {
                test()
                println("  PASS: $description")
                passed++
            } catch (e: AssertionError) {
                println("  FAIL: $description — ${e.message}")
                failed++
            }
        }
        println("Results: $passed passed, $failed failed\n")
    }
}

fun describe(name: String, block: TestSuite.() -> Unit) {
    val suite = TestSuite(name)
    suite.block()
    suite.run()
}

fun main() {
    describe("Calculator") {
        it("should add two numbers") { (2 + 2) shouldBe 4 }
        it("should not confuse addition") { (2 + 2) shouldNotBe 5 }
    }
    describe("String utils") {
        it("should detect substrings") { "Kotlin DSL" shouldContain "DSL" }
        it("should check collection size") { listOf(1, 2, 3) shouldHaveSize 3 }
    }
}
```
