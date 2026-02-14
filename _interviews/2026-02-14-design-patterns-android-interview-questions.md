---
title: "Design Patterns in Android"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 5
sequence: 39
description: "Design pattern questions show up in almost every architecture round."
---

## Design Patterns in Android

Design pattern questions show up in almost every architecture round. Interviewers want to see that you understand the patterns behind the code you write daily, not just the library APIs sitting on top of them.

### Core Questions

#### Q1: What is the Singleton pattern and how is it used in Android?

Singleton ensures only one instance of a class exists throughout the app. In Kotlin, the `object` keyword creates a thread-safe singleton at the language level. The Kotlin compiler generates a class with a private constructor and a static `INSTANCE` field.

```kotlin
object AnalyticsTracker {
    fun trackEvent(name: String, params: Map<String, String>) {
        // Single instance handles all tracking
    }
}
```

Android uses singletons extensively — `Application`, `Room.databaseBuilder()` with a singleton holder, and Retrofit instances are typically kept as singletons to reuse the connection pool. The downside is that singletons make testing harder because you can't easily swap them out without dependency injection.

#### Q2: What is the Factory pattern?

Factory pattern creates objects without exposing the creation logic. Instead of calling constructors directly, you call a factory method that decides which class to instantiate. In Kotlin, companion object functions serve as factory methods.

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

Android SDK uses this pattern with `LayoutInflater.from(context)` and `Fragment.instantiate()`. It keeps client code decoupled from concrete classes.

#### Q3: What is the Builder pattern and where do you see it in Android?

Builder pattern constructs complex objects step by step. It separates the construction from the representation, so the same building process can create different configurations. In Android, you see it with `AlertDialog.Builder`, `Notification.Builder`, `OkHttpClient.Builder`, and `Room.databaseBuilder()`.

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

In Kotlin, you can often replace the Builder pattern with default parameters and named arguments. But the Builder pattern still makes sense when you have many optional parameters or when the object needs validation during construction.

#### Q4: What is the Observer pattern and how does Android use it?

Observer pattern defines a one-to-many relationship where one object (the subject) notifies all its dependents (observers) when its state changes. In Android, `LiveData` and `Flow` are both implementations of the Observer pattern.

LiveData is lifecycle-aware — it only notifies active observers. Flow uses a collector-based model where each collector subscribes to emissions. Under the hood, `StateFlow` maintains a list of collectors and notifies them on value changes. `BroadcastReceiver` is another example — the system broadcasts events and registered receivers get notified.

#### Q5: What is the Strategy pattern?

Strategy pattern defines a family of algorithms, puts each one in a separate class, and makes them interchangeable. The client picks which strategy to use at runtime. This is useful when you have multiple ways to do the same thing and want to switch between them.

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

You inject the strategy through the constructor, which makes it easy to swap and test. Android uses this pattern with `RecyclerView.LayoutManager` — you plug in `LinearLayoutManager`, `GridLayoutManager`, or a custom one, and the RecyclerView doesn't care about the layout details.

#### Q6: What is the Adapter pattern?

Adapter pattern converts the interface of one class into another interface that a client expects. It lets classes work together that otherwise couldn't because of incompatible interfaces. The classic Android example is `RecyclerView.Adapter`, which adapts your data list into views that RecyclerView can display.

```kotlin
// API returns this format
data class ApiUser(val fullName: String, val emailAddress: String)

// Your domain expects this
data class User(val name: String, val email: String)

class UserAdapter {
    fun adapt(apiUser: ApiUser): User {
        return User(name = apiUser.fullName, email = apiUser.emailAddress)
    }
}
```

Mapper classes in Clean Architecture are essentially adapters — they convert DTOs to domain models and domain models to entities. The pattern keeps your layers decoupled so changes in the API response don't ripple through your entire codebase.

#### Q7: What is the Decorator pattern?

Decorator pattern wraps an object to add new behavior without modifying the original class. Each decorator implements the same interface and delegates to the wrapped object, adding its own logic before or after. OkHttp interceptors are a perfect example — each interceptor wraps the chain and can modify the request or response.

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

#### Q8: What is the Facade pattern?

Facade pattern provides a simplified interface to a complex subsystem. Instead of the client dealing with multiple classes and their interactions, the facade wraps everything behind a single, clean API.

In Android, `MediaPlayer` is a facade over the complex audio/video decoding pipeline. A repository in Clean Architecture is also a facade — it hides the complexity of network calls, caching logic, and database operations behind simple methods like `getUser(id)`. The client doesn't need to know whether the data came from Room, Retrofit, or an in-memory cache.

### Deep Dive Questions

#### Q9: What is the Repository pattern and why is it central to Android architecture?

Repository pattern abstracts data access behind a clean interface. The repository decides whether to fetch from network, cache, or local database, and the ViewModel doesn't care about those details. It sits between the data sources and the domain/presentation layer.

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

The repository is defined as an interface in the domain layer and implemented in the data layer. This follows the dependency rule in Clean Architecture — the domain layer doesn't depend on Retrofit or Room. If you swap your API client from Retrofit to Ktor, only the repository implementation changes. Nothing else in the app is affected.

#### Q10: What is the Command pattern and where does Android use it?

Command pattern encapsulates a request as an object, letting you parameterize clients with different requests, queue them, or log them. Each command object contains all the information needed to perform an action.

In Android, `Handler.post(Runnable)` is a command pattern — you wrap work in a `Runnable` and post it to a message queue for execution. `WorkManager` requests are commands too — you define the work, its constraints, and its retry policy, and the system executes it later. Undo/redo systems in text editors also use this pattern, where each edit is a command that can be reversed.

#### Q11: How does the Observer pattern differ between LiveData and Flow?

LiveData is a simple observer with lifecycle awareness. It holds a single value, notifies active observers synchronously on the main thread, and uses `Lifecycle.State` to decide when to deliver updates. It keeps a version counter internally — when an observer becomes active, it checks if the observer's version is behind and delivers the latest value.

Flow is a cold stream by default — nothing happens until someone collects. It supports backpressure, runs on any dispatcher, and has a rich set of operators for transformation. `StateFlow` is the hot equivalent that holds the latest value, similar to LiveData but without lifecycle awareness built in. You pair it with `collectAsStateWithLifecycle()` in Compose or `repeatOnLifecycle` in fragments to get lifecycle safety.

The key difference in practice: LiveData is synchronous and main-thread-only. Flow is asynchronous, supports multiple dispatchers, and can model streams of events, not just state. For new code, StateFlow with lifecycle-aware collection has replaced LiveData in most architectures.

#### Q12: How does the Android SDK itself use design patterns internally?

The Android SDK is built on design patterns throughout:

- **Observer** — `LiveData`, `BroadcastReceiver`, `ContentObserver`, `OnClickListener`, and all the listener callbacks follow the observer pattern.
- **Builder** — `AlertDialog.Builder`, `Notification.Builder`, `Uri.Builder`, `WorkRequest.Builder`.
- **Factory** — `LayoutInflater.from(context)`, `ViewModelProvider.Factory`, `Fragment.instantiate()`.
- **Adapter** — `RecyclerView.Adapter`, `ArrayAdapter`, `CursorAdapter` adapt data to views.
- **Strategy** — `RecyclerView.LayoutManager`, `Interpolator` for animations, `DiffUtil.ItemCallback`.
- **Facade** — `MediaPlayer`, `ConnectivityManager`, `PackageManager` hide complex subsystems.
- **Template Method** — `Activity.onCreate()`, `View.onDraw()`, `AsyncTask.doInBackground()` define the skeleton and subclasses fill in the details.
- **Singleton** — `Application` class, `Room` database instances, system services obtained via `getSystemService()`.

Understanding these patterns helps you read Android source code and design your own APIs following the same conventions.

#### Q13: When should you prefer composition over inheritance to apply design patterns?

Inheritance creates tight coupling — the subclass depends on the parent's implementation details. If the parent changes, all subclasses break. Composition is more flexible because you assemble behavior from small, focused components.

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

Prefer composition when you need to mix behaviors from multiple sources, when the behavior might change at runtime, or when you want to test pieces in isolation. Use inheritance when there's a genuine "is-a" relationship and the parent class is designed for extension (marked `open` in Kotlin).

#### Q14: How do you decide which design pattern to use in a real Android project?

Don't pick a pattern and force your code into it. Start with the problem:

- **Object creation is complex or varies by condition** — Factory or Builder.
- **Need exactly one instance** — Singleton (or scoped with DI).
- **Multiple objects need to react to state changes** — Observer (LiveData, Flow).
- **Multiple algorithms for the same task** — Strategy.
- **Need to add behavior without modifying existing code** — Decorator.
- **Complex subsystem needs a simpler API** — Facade.
- **Need to abstract data sources** — Repository.

Most Android apps use Repository, Observer, Factory, and Strategy daily without thinking about it. The goal isn't to use as many patterns as possible — it's to write code that's easy to change, test, and understand. If a pattern adds complexity without solving a real problem, skip it.

#### Q15: What is the difference between the Template Method pattern and Strategy pattern?

Template Method defines the skeleton of an algorithm in a base class and lets subclasses override specific steps. Strategy defines a family of interchangeable algorithms as separate objects. The difference is how you vary the behavior — inheritance vs composition.

Template Method is how Android's `Activity` works. The framework calls `onCreate()`, `onStart()`, `onResume()` in a fixed order, and you override the ones you need. You can't change the order. Strategy is how `RecyclerView.LayoutManager` works. You plug in any layout manager and the RecyclerView delegates layout logic to it.

Use Template Method when the overall algorithm is fixed and only certain steps vary. Use Strategy when the entire algorithm can be swapped. In modern Kotlin, Strategy is generally preferred because it uses composition and is easier to test — you can inject and mock a strategy object, but you can't easily mock a parent class method.

### Common Follow-ups

- What is the difference between Factory Method and Abstract Factory? (Factory Method creates a single product using a method. Abstract Factory creates families of related products using multiple factory methods)
- How does Kotlin's `by` keyword relate to the Delegation pattern? (It generates delegation code at compile time. The class delegates interface methods to another object without writing boilerplate forwarding methods)
- Can you explain the Proxy pattern with an Android example? (A proxy controls access to another object. `ContentProvider` acts as a proxy for database access, controlling permissions and URI routing)
- What is the State pattern and how does it differ from Strategy? (State changes behavior based on internal state transitions. Strategy is chosen by the client externally. State machines in MVI use the State pattern)
- How does the Iterator pattern appear in Kotlin and Android? (`Cursor` in databases is an iterator. Kotlin's `Sequence` and `Iterator` interfaces follow this pattern. `for` loops work through the iterator protocol)
- What is the Prototype pattern? (`data class.copy()` in Kotlin is a Prototype pattern. It creates a new object by cloning an existing one with modifications)
