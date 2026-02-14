---
title: "Design Patterns in Android"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 5
sequence: 37
description: "Design pattern questions show up in almost every architecture round."
---

## Design Patterns in Android

Design patterns come up in almost every architecture round. You need to know the patterns behind the code you write daily.

#### What is the Observer pattern and how does Android use it?

Observer pattern sets up a one-to-many relationship. One object holds state, and when it changes, all registered observers get notified. In Android, `LiveData` and `Flow` are both observer implementations. LiveData is lifecycle-aware and only notifies active observers. Flow uses a collector-based model. `BroadcastReceiver` is another example — the system broadcasts events and registered receivers pick them up.

#### What is the Singleton pattern and how is it used in Android?

Singleton ensures only one instance of a class exists in the app. In Kotlin, the `object` keyword gives you a thread-safe singleton at the language level.

```kotlin
object AnalyticsTracker {
    fun trackEvent(name: String, params: Map<String, String>) {
        // Single instance handles all tracking
    }
}
```

Android uses singletons for the `Application` class, Room database instances, and Retrofit clients (to reuse the connection pool). The downside is testability — you can't easily swap a singleton without dependency injection.

#### What is the Builder pattern and where do you see it in Android?

Builder constructs complex objects step by step. You configure the object through method calls and then call `build()`. Android uses it everywhere — `AlertDialog.Builder`, `Notification.Builder`, `OkHttpClient.Builder`, `Room.databaseBuilder()`.

```kotlin
class ImageRequest private constructor(
    val url: String,
    val width: Int,
    val height: Int,
    val placeholder: Int?
) {
    class Builder(private val url: String) {
        private var width: Int = 0
        private var height: Int = 0
        private var placeholder: Int? = null

        fun size(w: Int, h: Int) = apply { width = w; height = h }
        fun placeholder(resId: Int) = apply { placeholder = resId }
        fun build() = ImageRequest(url, width, height, placeholder)
    }
}
```

In Kotlin, you can often replace Builder with default parameters and named arguments. But Builder still makes sense when you have many optional parameters or need validation during construction.

#### What is the Factory pattern?

Factory creates objects without exposing the creation logic. Instead of calling constructors directly, you call a factory method that decides which class to instantiate.

```kotlin
sealed class NotificationHandler {
    class EmailHandler(val address: String) : NotificationHandler()
    class PushHandler(val token: String) : NotificationHandler()
    class SmsHandler(val phone: String) : NotificationHandler()

    companion object {
        fun create(type: String, target: String): NotificationHandler {
            return when (type) {
                "email" -> EmailHandler(target)
                "push" -> PushHandler(target)
                "sms" -> SmsHandler(target)
                else -> throw IllegalArgumentException("Unknown type: $type")
            }
        }
    }
}
```

In Android, `LayoutInflater.from(context)` and `ViewModelProvider.Factory` use this pattern. It keeps client code decoupled from concrete classes.

#### What is the Repository pattern and why is it central to Android architecture?

Repository abstracts data access behind a clean interface. It decides whether to fetch from network, cache, or local database. The ViewModel doesn't care about those details.

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao
) {
    fun getArticles(): Flow<List<Article>> {
        return dao.observeAll().onStart {
            try {
                val remote = api.fetchArticles()
                dao.insertAll(remote.map { it.toEntity() })
            } catch (e: IOException) {
                // Use cached data on network failure
            }
        }
    }
}
```

I define the repository as an interface in the domain layer and implement it in the data layer. This follows the dependency rule — the domain layer doesn't depend on Retrofit or Room. If I swap Retrofit for Ktor, only the repository implementation changes.

#### What is the Strategy pattern?

Strategy defines a family of algorithms, puts each in a separate class, and makes them interchangeable. The client picks which one to use at runtime.

```kotlin
interface CompressionStrategy {
    fun compress(data: ByteArray): ByteArray
}

class GzipCompression : CompressionStrategy {
    override fun compress(data: ByteArray): ByteArray {
        // Gzip compression logic
    }
}

class ZipCompression : CompressionStrategy {
    override fun compress(data: ByteArray): ByteArray {
        // Zip compression logic
    }
}

class FileUploader(private val strategy: CompressionStrategy) {
    fun upload(data: ByteArray) {
        val compressed = strategy.compress(data)
        // Upload compressed data
    }
}
```

You inject the strategy through the constructor, which makes it easy to swap and test. Android uses this with `RecyclerView.LayoutManager` — you plug in `LinearLayoutManager`, `GridLayoutManager`, or a custom one, and RecyclerView doesn't care about the layout details.

#### What is the Adapter pattern?

Adapter converts one interface into another that a client expects. It lets incompatible classes work together. The classic Android example is `RecyclerView.Adapter`, which adapts your data list into views that RecyclerView can display.

```kotlin
data class ApiUser(val fullName: String, val emailAddress: String)
data class User(val name: String, val email: String)

class UserAdapter {
    fun adapt(apiUser: ApiUser): User {
        return User(name = apiUser.fullName, email = apiUser.emailAddress)
    }
}
```

Mapper classes in Clean Architecture are adapters — they convert DTOs to domain models. The pattern keeps layers decoupled so API response changes don't ripple through the codebase.

#### What is the Decorator pattern?

Decorator wraps an object to add behavior without modifying the original class. Each decorator implements the same interface and delegates to the wrapped object. OkHttp interceptors are the best Android example — each interceptor wraps the chain and can modify the request or response.

```kotlin
interface Logger {
    fun log(message: String)
}

class ConsoleLogger : Logger {
    override fun log(message: String) = println(message)
}

class TimestampLogger(private val wrapped: Logger) : Logger {
    override fun log(message: String) {
        wrapped.log("[${System.currentTimeMillis()}] $message")
    }
}

class TagLogger(private val tag: String, private val wrapped: Logger) : Logger {
    override fun log(message: String) {
        wrapped.log("[$tag] $message")
    }
}
```

You can stack decorators: `TagLogger("Network", TimestampLogger(ConsoleLogger()))`. Each one adds behavior without changing the others. OkHttp's interceptor chain works the same way — logging, auth, caching, and retry interceptors each wrap the next one.

#### What is the Facade pattern?

Facade provides a simplified interface to a complex subsystem. Instead of dealing with multiple classes, the client talks to one clean API.

In Android, `MediaPlayer` is a facade over the audio/video decoding pipeline. A repository is also a facade — it hides network calls, caching, and database operations behind simple methods like `getUser(id)`. The client doesn't need to know if the data came from Room, Retrofit, or an in-memory cache.

#### What is the Command pattern and where does Android use it?

Command encapsulates a request as an object. This lets you queue requests, log them, or undo them. Each command object has everything needed to perform its action.

In Android, `Handler.post(Runnable)` is a command — I wrap work in a `Runnable` and post it to a message queue. `WorkManager` requests are commands too — I define the work, constraints, and retry policy, and the system executes it later. Undo/redo systems also use this pattern, where each edit is a command that can be reversed.

#### How does the Observer pattern differ between LiveData and Flow?

LiveData holds a single value and notifies active observers synchronously on the main thread. It uses `Lifecycle.State` to decide when to deliver updates. Internally it keeps a version counter — when an observer becomes active, it checks if the observer's version is behind and delivers the latest value.

Flow is cold by default — nothing happens until someone collects. It supports backpressure, runs on any dispatcher, and has operators for transformation. `StateFlow` is the hot equivalent that holds the latest value, similar to LiveData but without built-in lifecycle awareness. I pair it with `collectAsStateWithLifecycle()` in Compose or `repeatOnLifecycle` in fragments.

The practical difference: LiveData is synchronous and main-thread-only. Flow is asynchronous, works on any dispatcher, and can model streams of events, not just state. For new code, I use StateFlow with lifecycle-aware collection.

#### How does the Android SDK use design patterns internally?

The Android SDK uses design patterns throughout:

- **Observer** — `LiveData`, `BroadcastReceiver`, `ContentObserver`, `OnClickListener`, and all listener callbacks.
- **Builder** — `AlertDialog.Builder`, `Notification.Builder`, `Uri.Builder`, `WorkRequest.Builder`.
- **Factory** — `LayoutInflater.from(context)`, `ViewModelProvider.Factory`, `Fragment.instantiate()`.
- **Adapter** — `RecyclerView.Adapter`, `ArrayAdapter`, `CursorAdapter` adapt data to views.
- **Strategy** — `RecyclerView.LayoutManager`, `Interpolator` for animations, `DiffUtil.ItemCallback`.
- **Facade** — `MediaPlayer`, `ConnectivityManager`, `PackageManager` hide complex subsystems.
- **Template Method** — `Activity.onCreate()`, `View.onDraw()` define the skeleton and subclasses fill in details.
- **Singleton** — `Application` class, Room database instances, system services via `getSystemService()`.

Knowing these patterns helps when reading Android source code and designing your own APIs.

#### When should you prefer composition over inheritance to apply design patterns?

Inheritance creates tight coupling. If the parent changes, all subclasses break. Composition is more flexible — you assemble behavior from small, focused components.

In Kotlin, interface delegation with `by` makes composition easy:

```kotlin
interface Cache {
    fun get(key: String): String?
    fun put(key: String, value: String)
}

class MemoryCache : Cache {
    private val map = mutableMapOf<String, String>()
    override fun get(key: String) = map[key]
    override fun put(key: String, value: String) { map[key] = value }
}

class LoggingCache(private val delegate: Cache) : Cache by delegate {
    override fun put(key: String, value: String) {
        println("Caching: $key")
        delegate.put(key, value)
    }
}
```

I prefer composition when I need to mix behaviors from multiple sources, when behavior might change at runtime, or when I want to test pieces in isolation. I use inheritance when there's a genuine "is-a" relationship and the parent is designed for extension (marked `open` in Kotlin).

#### How do you decide which design pattern to use in a real Android project?

I don't pick a pattern and force code into it. I start with the problem:

- **Object creation is complex or varies by condition** — Factory or Builder.
- **Need exactly one instance** — Singleton (or scoped with DI).
- **Multiple objects need to react to state changes** — Observer (LiveData, Flow).
- **Multiple algorithms for the same task** — Strategy.
- **Need to add behavior without modifying existing code** — Decorator.
- **Complex subsystem needs a simpler API** — Facade.
- **Need to abstract data sources** — Repository.

Most Android apps use Repository, Observer, Factory, and Strategy daily without thinking about it. The goal isn't to use as many patterns as possible — it's to write code that's easy to change, test, and understand.

#### What is the difference between the Template Method pattern and Strategy pattern?

Template Method defines the skeleton of an algorithm in a base class and lets subclasses override specific steps. Strategy defines interchangeable algorithms as separate objects. The difference is inheritance vs composition.

Template Method is how `Activity` works. The framework calls `onCreate()`, `onStart()`, `onResume()` in a fixed order. I override the ones I need but can't change the order. Strategy is how `RecyclerView.LayoutManager` works — I plug in any layout manager and RecyclerView delegates layout logic to it.

I use Template Method when the overall algorithm is fixed and only certain steps vary. I use Strategy when the entire algorithm can be swapped. In modern Kotlin, Strategy is generally preferred because it uses composition and is easier to test — I can inject and mock a strategy object, but I can't easily mock a parent class method.

### Common Follow-ups

- What is the difference between Factory Method and Abstract Factory? (Factory Method creates a single product using a method. Abstract Factory creates families of related products using multiple factory methods)
- How does Kotlin's `by` keyword relate to the Delegation pattern? (It generates delegation code at compile time. The class delegates interface methods to another object without writing boilerplate forwarding methods)
- Can you explain the Proxy pattern with an Android example? (A proxy controls access to another object. `ContentProvider` acts as a proxy for database access, controlling permissions and URI routing)
- What is the State pattern and how does it differ from Strategy? (State changes behavior based on internal state transitions. Strategy is chosen by the client externally. State machines in MVI use the State pattern)
- How does the Iterator pattern appear in Kotlin and Android? (`Cursor` in databases is an iterator. Kotlin's `Sequence` and `Iterator` interfaces follow this pattern. `for` loops work through the iterator protocol)
- What is the Prototype pattern? (`data class.copy()` in Kotlin is a Prototype pattern. It creates a new object by cloning an existing one with modifications)
