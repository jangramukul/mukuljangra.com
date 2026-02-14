---
title: Kotlin Delegation Pattern Guide
layout: post
categories: post
tags:
  - Kotlin
  - Design Patterns
---

I used to write a lot of wrapper classes. A `LoggingRepository` that wraps a `RealRepository`, forwarding every method call and adding a log statement before each one. A `CachingDataSource` that wraps a `NetworkDataSource`, checking cache first and delegating to the network if the cache misses. The pattern was always the same — implement the same interface, hold a reference to the delegate, and manually forward every single method. Ten methods on the interface meant ten one-line forwarding functions. And every time the interface changed, I had to update every wrapper too.

Kotlin's `by` keyword eliminates all of that boilerplate. Class delegation, property delegation — they're both built on the same idea: let someone else handle the work, and the compiler generates the forwarding code for you. But what makes delegation genuinely powerful in Kotlin is that it goes beyond a simple language shortcut. Property delegates like `lazy`, `observable`, and custom delegates let you extract cross-cutting behavior into reusable components that compose cleanly. Once I started thinking in terms of delegation, my classes got smaller and my boilerplate dropped dramatically.

## Class Delegation With `by`

Class delegation lets you implement an interface by forwarding all calls to another object. The compiler generates the forwarding methods at compile time, so there's zero runtime overhead compared to writing them by hand.

```kotlin
interface AnalyticsTracker {
    fun trackEvent(name: String, properties: Map<String, Any>)
    fun trackScreen(screenName: String)
    fun setUserId(userId: String)
    fun reset()
}

class LoggingAnalyticsTracker(
    private val delegate: AnalyticsTracker
) : AnalyticsTracker by delegate {

    override fun trackEvent(name: String, properties: Map<String, Any>) {
        Log.d("Analytics", "Event: $name, props: $properties")
        delegate.trackEvent(name, properties)
    }

    // trackScreen, setUserId, reset — all auto-forwarded to delegate
}
```

The `by delegate` clause tells the compiler to generate forwarding implementations for every method in `AnalyticsTracker`. You only override the ones you want to customize. If `AnalyticsTracker` has 15 methods and you only care about intercepting `trackEvent`, you write one override instead of fifteen forwarding functions. When someone adds a new method to the interface, the compiler automatically forwards it — no code change needed in your wrapper.

One thing to be aware of: the compiler generates the forwarding code based on the **compile-time type** of the delegate. If the delegate's implementation changes at runtime (say, it's swapped out behind a proxy), the forwarded calls still go to the original object reference. Also, if the delegate calls its own methods internally, those calls don't go through your overrides — they go directly to the delegate's implementation. This trips people up when they expect the decorator pattern's full behavior. It's delegation, not inheritance.

## Property Delegates — The Built-in Ones

Kotlin ships with several property delegates in the standard library. They all implement the `ReadOnlyProperty` or `ReadWriteProperty` interface under the hood, but you use them through the `by` keyword.

### `by lazy` — Deferred Initialization

`lazy` delays the initialization of a property until its first access. The lambda runs exactly once, and the result is cached for all subsequent reads.

```kotlin
class SettingsViewModel(
    private val prefsRepository: PreferencesRepository,
    private val featureFlagService: FeatureFlagService
) : ViewModel() {

    val themeConfig by lazy {
        prefsRepository.loadThemeConfig()
    }

    val experimentFlags by lazy {
        featureFlagService.fetchFlags()
    }
}
```

What most developers don't realize is that `lazy` has three thread-safety modes. The default, `LazyThreadSafetyMode.SYNCHRONIZED`, uses a lock to guarantee the initializer runs exactly once across threads. `PUBLICATION` allows multiple threads to run the initializer concurrently but only stores the first result. `NONE` skips synchronization entirely. On Android's main thread, where most property access happens on a single thread, `NONE` avoids the synchronization overhead. I use `lazy(LazyThreadSafetyMode.NONE)` in ViewModels and Activities where I know the property is only accessed from the main thread — it's a small optimization, but it removes unnecessary lock acquisition on every first access.

### `by Delegates.observable` and `by Delegates.vetoable`

`observable` fires a callback after every value change. `vetoable` fires a callback before the change and can reject it by returning `false`.

```kotlin
class ProfileEditorViewModel : ViewModel() {

    var displayName: String by Delegates.observable("") { _, old, new ->
        Log.d("Profile", "Name changed: '$old' -> '$new'")
        validateForm()
    }

    var email: String by Delegates.vetoable("") { _, _, new ->
        new.contains("@") || new.isEmpty() // reject invalid emails mid-edit
    }
}
```

`vetoable` is underused IMO. It's perfect for cases where you want to enforce invariants at the property level rather than scattering validation logic across setters and state update functions. The callback receives the proposed new value and returns whether to accept it. If it returns `false`, the property retains its current value silently. This is cleaner than the alternative of setting the value and then immediately reverting it if invalid.

### `by map` — Map-Backed Properties

You can delegate properties to a `Map`, where each property reads its value from the map using the property name as the key. This is surprisingly useful for parsing configuration objects or JSON-like structures.

```kotlin
class ServerConfig(properties: Map<String, Any?>) {
    val host: String by properties
    val port: Int by properties
    val maxRetries: Int by properties
    val timeoutMs: Long by properties
}

// Usage
val config = ServerConfig(mapOf(
    "host" to "api.example.com",
    "port" to 443,
    "maxRetries" to 3,
    "timeoutMs" to 5000L
))
```

The property name must match the map key exactly. If the key is missing, it throws a `NoSuchElementException` at access time, not at construction time — which can be a gotcha if you're not careful. For `MutableMap`, you get read-write delegation, so setting the property updates the map entry.

## Writing Custom Delegates

The real power of property delegation shows up when you write your own delegates. Any class that provides `getValue` (and optionally `setValue`) operator functions can be used as a delegate.

Here's a practical example — a delegate that persists a property to `SharedPreferences` automatically:

```kotlin
class PreferenceDelegate<T>(
    private val prefs: SharedPreferences,
    private val key: String,
    private val defaultValue: T,
    private val getter: SharedPreferences.(String, T) -> T,
    private val setter: SharedPreferences.Editor.(String, T) -> SharedPreferences.Editor
) : ReadWriteProperty<Any?, T> {

    override fun getValue(thisRef: Any?, property: KProperty<*>): T {
        return prefs.getter(key, defaultValue)
    }

    override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
        prefs.edit { setter(key, value) }
    }
}

fun SharedPreferences.string(key: String, default: String = "") =
    PreferenceDelegate(this, key, default, SharedPreferences::getString, SharedPreferences.Editor::putString)

fun SharedPreferences.boolean(key: String, default: Boolean = false) =
    PreferenceDelegate(this, key, default, SharedPreferences::getBoolean, SharedPreferences.Editor::putBoolean)

// Usage in a settings class
class UserPreferences(prefs: SharedPreferences) {
    var darkMode by prefs.boolean("dark_mode", default = false)
    var username by prefs.string("username")
    var onboardingComplete by prefs.boolean("onboarding_done")
}
```

Reading `userPreferences.darkMode` hits `SharedPreferences`. Writing to it commits the change. The calling code doesn't know or care that persistence is happening — it just reads and writes a property. This is delegation at its best: the behavior is encapsulated in the delegate, and the consuming code stays clean.

## The Reframe: Delegation Is Composition Made Ergonomic

Here's what changed my thinking about Kotlin delegation: **it's the compiler making composition as easy as inheritance.** The "favor composition over inheritance" mantra has been around forever, but before language-level delegation support, composition meant writing tedious forwarding code. Kotlin's `by` keyword removes that friction entirely. You get composition's flexibility — swap implementations, combine behaviors, test with fakes — with inheritance's brevity. Class delegation composes interface implementations. Property delegation composes cross-cutting property behavior. Both let you build small, focused pieces that snap together without boilerplate.

The tradeoff is discoverability. When a class uses `by delegate`, the forwarded methods don't appear in the source code. A developer reading `LoggingAnalyticsTracker` might not immediately realize it implements `reset()` and `setUserId()` without looking at the interface. IDE support helps here — IntelliJ shows the generated methods — but in code review, it requires the reviewer to know what `by` does. For teams new to Kotlin, I'd recommend adding a brief comment explaining which methods are delegated until the pattern becomes familiar.

Thank You!
