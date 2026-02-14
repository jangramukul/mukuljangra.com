---
title: Kotlin Delegation Pattern Guide
layout: post
categories: post
tags:
  - Kotlin
  - Design Patterns
---

I want you to think about the last time you wrote a wrapper class. Maybe it was a `LoggingRepository` that wraps a `RealRepository` — forwarding every method call, adding a log statement before each one. Or a `CachingDataSource` that wraps a `NetworkDataSource`, checking cache first and delegating to the network on a miss. You know the drill. Implement the same interface, hold a reference to the delegate, manually forward every single method. Ten methods on the interface? Ten one-line forwarding functions. And every time the interface changed? You had to update every wrapper too.

I did this for years. It felt like busywork — and honestly, it was.

Think of it like hiring an assistant. You want them to handle your emails, but instead of just saying "handle my emails," you have to physically hand them each email one at a time, say "reply to this one," then hand them the next, say "reply to this one," and so on. Wouldn't it be nicer to just say "you're in charge of emails" and only step in when something needs your personal touch?

That's exactly what Kotlin's `by` keyword does. Class delegation, property delegation — they're both built on the same idea: let someone else handle the work, and the compiler generates the forwarding code for you. But what makes delegation genuinely powerful in Kotlin is that it goes beyond a simple language shortcut. Property delegates like `lazy`, `observable`, and custom delegates let you extract cross-cutting behavior into reusable components that compose cleanly. Once I started thinking in terms of delegation, my classes got smaller and my boilerplate dropped dramatically.

## Class Delegation With `by`

Imagine you run a customer support team. You've got a new hire, and their job is to handle all incoming tickets exactly the way the senior agent does — except for billing disputes, which need special handling. You wouldn't write out instructions for every single ticket type. You'd say: "Do whatever Sarah does, except for billing — I'll tell you how to handle those."

That's class delegation. You implement an interface by forwarding all calls to another object. The compiler generates the forwarding methods at compile time, so there's zero runtime overhead compared to writing them by hand.

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

The `by delegate` clause tells the compiler: "generate forwarding implementations for every method in `AnalyticsTracker`." You only override the ones you want to customize. If `AnalyticsTracker` has 15 methods and you only care about intercepting `trackEvent`, you write one override instead of fifteen forwarding functions. When someone adds a new method to the interface, the compiler automatically forwards it — no code change needed in your wrapper.

Now here's where it gets interesting — and where people get tripped up.

The compiler generates the forwarding code based on the **compile-time type** of the delegate. If the delegate's implementation changes at runtime (say, it's swapped out behind a proxy), the forwarded calls still go to the original object reference. Also, if the delegate calls its own methods internally, those calls don't go through your overrides — they go directly to the delegate's implementation. This trips people up when they expect the decorator pattern's full behavior. It's delegation, not inheritance. The delegate doesn't know your wrapper exists, and it never will.

> **🧠 Think about it:** If `LoggingAnalyticsTracker` overrides `trackEvent`, and the delegate's `reset()` method internally calls `trackEvent()` — does the log statement fire? (Spoiler: it doesn't. The delegate calls its own `trackEvent`, completely bypassing your override.)

## Property Delegates — The Built-in Ones

Kotlin ships with several property delegates in the standard library. They all implement the `ReadOnlyProperty` or `ReadWriteProperty` interface under the hood, but you use them through the `by` keyword. Same keyword, different game — instead of delegating an entire interface, you're delegating the get/set behavior of a single property.

### `by lazy` — Deferred Initialization

You know that friend who never does anything until the absolute last minute — but then does it perfectly? That's `lazy`. It delays the initialization of a property until its first access. The lambda runs exactly once, and the result is cached for all subsequent reads.

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

What most developers don't realize is that `lazy` has three thread-safety modes, and picking the wrong one means you're paying for synchronization you don't need. The default, `LazyThreadSafetyMode.SYNCHRONIZED`, uses a lock to guarantee the initializer runs exactly once across threads. `PUBLICATION` allows multiple threads to run the initializer concurrently but only stores the first result. `NONE` skips synchronization entirely.

Here's the thing — on Android's main thread, where most property access happens on a single thread, `NONE` avoids the synchronization overhead entirely. I use `lazy(LazyThreadSafetyMode.NONE)` in ViewModels and Activities where I know the property is only accessed from the main thread — it's a small optimization, but it removes unnecessary lock acquisition on every first access. Why pay for a lock on a door nobody else is trying to open?

### `by Delegates.observable` and `by Delegates.vetoable`

`observable` fires a callback after every value change. `vetoable` fires a callback before the change and can reject it by returning `false`. Think of `observable` as a security camera — it records everything that happens. And `vetoable`? That's the bouncer at the door, deciding who gets in.

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

`vetoable` is underused IMO. It's perfect for cases where you want to enforce invariants at the property level rather than scattering validation logic across setters and state update functions. The callback receives the proposed new value and returns whether to accept it. If it returns `false`, the property retains its current value silently — no exception, no error, just a quiet "nope." This is cleaner than the alternative of setting the value and then immediately reverting it if invalid.

### `by Delegates.notNull` — Late Init for Primitives

`lateinit` doesn't work with primitive types (`Int`, `Boolean`, `Double`). Yeah, that's annoying. `Delegates.notNull()` provides the same deferred initialization pattern for any type, including primitives. Accessing the property before assignment throws `IllegalStateException`.

```kotlin
class SensorTracker {
    var samplingRateHz: Int by Delegates.notNull()
    var isCalibrated: Boolean by Delegates.notNull()

    fun configure(rate: Int, calibrated: Boolean) {
        samplingRateHz = rate
        isCalibrated = calibrated
    }
}
```

I use `Delegates.notNull()` when a value must be set during initialization but can't be set in the constructor — for example, when it depends on a callback or a lifecycle event that happens after construction. It's basically `lateinit` for the types that `lateinit` forgot.

### `by map` — Map-Backed Properties

You can delegate properties to a `Map`, where each property reads its value from the map using the property name as the key. This is surprisingly useful for parsing configuration objects or JSON-like structures. Instead of writing `map["host"] as String` everywhere, you just declare a property and let the map do the heavy lifting.

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

The property name must match the map key exactly. If the key is missing, it throws a `NoSuchElementException` at access time, not at construction time — which can be a gotcha if you're not careful. You construct the object just fine, feel great about yourself, and then boom — runtime crash the first time you access a missing property. For `MutableMap`, you get read-write delegation, so setting the property updates the map entry.

## Writing Custom Delegates

Here's where the real fun begins.

The built-in delegates are useful, but the real power of property delegation shows up when you write your own. Any class that provides `getValue` (and optionally `setValue`) operator functions can be used as a delegate. You're essentially telling Kotlin: "whenever someone reads or writes this property, run my code instead."

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

Reading `userPreferences.darkMode` hits `SharedPreferences`. Writing to it commits the change. The calling code doesn't know or care that persistence is happening — it just reads and writes a property like any other. The behavior is completely hidden behind a normal-looking property assignment.

> **💡 The "aha" moment:** Custom delegates let you hide infrastructure behind plain property access. Persistence, validation, logging, caching — all of it disappears behind `var x by someDelegate()`. The consuming code stays clean because it doesn't even know the delegate exists.

### Intent Extras Delegate — Another Real-World Pattern

Here's another one I reach for constantly: reading Fragment or Activity arguments as properties. Instead of `arguments?.getString("key")` scattered throughout your Fragment — with all the null checks and type casting that comes with it — you define the argument as a delegated property.

```kotlin
class FragmentArgumentDelegate<T>(
    private val key: String,
    private val default: T
) : ReadOnlyProperty<Fragment, T> {

    @Suppress("UNCHECKED_CAST")
    override fun getValue(thisRef: Fragment, property: KProperty<*>): T {
        return thisRef.arguments?.get(key) as? T ?: default
    }
}

fun <T> Fragment.argument(key: String, default: T) =
    FragmentArgumentDelegate(key, default)

// Usage — clean, declarative argument access
class OrderDetailFragment : Fragment() {
    private val orderId: String by argument("order_id", "")
    private val showActions: Boolean by argument("show_actions", true)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel.loadOrder(orderId)
    }
}
```

The delegate encapsulates the Bundle access, null handling, and type casting. The Fragment declares its arguments as properties, and the intent is immediately clear without reading the implementation. No more `arguments?.getBoolean("show_actions") ?: true` sprinkled across five different methods.

> **🔥 Real talk:** Once you start writing custom delegates, you'll see opportunities everywhere. SharedPreferences, Bundle arguments, ViewBinding references, even feature flags — anything that follows a "get this value from somewhere with some default" pattern is a candidate. I've seen codebases where four or five well-placed custom delegates eliminated hundreds of lines of repetitive code.

## The Reframe: Delegation Is Composition Made Ergonomic

Here's what changed my thinking about Kotlin delegation: **it's the compiler making composition as easy as inheritance.**

The "favor composition over inheritance" mantra has been around forever, but before language-level delegation support, composition meant writing tedious forwarding code. It was the right thing to do architecturally, but it felt like punishment. Kotlin's `by` keyword removes that friction entirely. You get composition's flexibility — swap implementations, combine behaviors, test with fakes — with inheritance's brevity. Class delegation composes interface implementations. Property delegation composes cross-cutting property behavior. Both let you build small, focused pieces that snap together without boilerplate.

Put differently: inheritance says "I am a thing." Composition says "I have a thing that does the work." Delegation says "I have a thing that does the work, and the compiler writes the boring glue code so I don't have to." Same architectural benefits, zero busywork.

The tradeoff is discoverability. When a class uses `by delegate`, the forwarded methods don't appear in the source code. A developer reading `LoggingAnalyticsTracker` might not immediately realize it implements `reset()` and `setUserId()` without looking at the interface. IDE support helps here — IntelliJ shows the generated methods — but in code review, it requires the reviewer to know what `by` does. For teams new to Kotlin, I'd recommend adding a brief comment explaining which methods are delegated until the pattern becomes familiar.

> **⚡ Quick check:** Can you name three things in your current codebase that could be replaced with a custom property delegate? (Hint: look for patterns where multiple classes read values from the same source with the same boilerplate.)

Thank You!
