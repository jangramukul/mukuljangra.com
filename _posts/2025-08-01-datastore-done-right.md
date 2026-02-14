---
title: DataStore Done Right — Replacing SharedPreferences
layout: post
categories: post
tags:
  - Android
  - Architecture
---

I once spent a full afternoon debugging an ANR that only happened on low-end devices during cold starts. The stack trace pointed to `SharedPreferences.getString()` — a call I assumed was instantaneous. It turns out, the first access to a SharedPreferences file on a cold start blocks the calling thread until the entire XML file is parsed from disk. On a device with slow flash storage and a 2MB preferences file (accumulated over years of feature flags and cached values), that blocking read took over 800ms on the main thread. The 5-second ANR threshold was triggered because three different components all hit SharedPreferences during `onCreate()`.

SharedPreferences has been the default key-value storage on Android since API level 1. It's simple, synchronous, and familiar. It's also fundamentally broken for modern Android development. The synchronous reads block whatever thread calls them. The `apply()` method, which everyone uses to avoid blocking writes, can still cause ANRs — it schedules a write to disk and registers a completion callback with `ActivityThread`, and if the Activity finishes before that write completes, the framework blocks on `onPause()` waiting for it. There's no type safety beyond the basic primitives. And there's no way to observe changes as a reactive stream without polling or using the deprecated `OnSharedPreferenceChangeListener` (which leaks if you forget to unregister and doesn't tell you what the previous value was).

Jetpack DataStore was built to fix all of this. It uses Kotlin coroutines for non-blocking reads, Flow for reactive observation, and guarantees transactional writes. But it has its own set of rules, and I've seen teams introduce bugs by treating it like a drop-in SharedPreferences replacement without understanding those rules.

## Two Flavors of DataStore

DataStore comes in two variants, and choosing the wrong one adds unnecessary complexity.

**Preferences DataStore** is the direct SharedPreferences replacement. It's a key-value store with typed keys, non-blocking access, and Flow-based observation. If your stored data is simple — user settings, feature flags, small cached values — this is what you want. No schema definition, no code generation, minimal setup.

**Proto DataStore** is for structured, typed data. Instead of string keys and primitive values, you define your data as a class and DataStore serializes/deserializes the entire object atomically. This gives you compile-time type safety for complex structures — nested objects, enums, collections — that Preferences DataStore can't express cleanly. The tradeoff is setup overhead: you need a serializer (Protocol Buffers or kotlinx.serialization) and a schema definition.

The rule of thumb I use: if your data fits in 5-10 key-value pairs with primitive types, use Preferences DataStore. If you're storing a structured object with multiple fields that change together, use Proto DataStore. If you're storing large datasets, collections of items, or anything that needs querying — use Room, not DataStore. DataStore reads and writes the entire file on every operation, so it doesn't scale for large data.

## Migrating from SharedPreferences

The migration path is straightforward. DataStore provides a `SharedPreferencesMigration` class that reads your existing SharedPreferences file and writes the values into DataStore on first access. After migration, it deletes the SharedPreferences file to avoid dual-source-of-truth issues.

```kotlin
private val Context.userPrefsDataStore by preferencesDataStore(
    name = "user_preferences",
    produceMigrations = { context ->
        listOf(
            SharedPreferencesMigration(
                context,
                "user_prefs" // Name of the old SharedPreferences file
            )
        )
    }
)
```

The migration runs exactly once, on the first access to the DataStore. It's atomic — either all values migrate successfully, or none do. If the migration fails (disk full, corrupted SharedPreferences file), DataStore throws an exception and the old SharedPreferences file is preserved untouched. You can catch this and retry on the next app launch.

One thing that catches people off guard: the `produceMigrations` lambda is called every time the DataStore is accessed, but the migration itself only executes if it hasn't been completed before. DataStore tracks migration completion internally, so the lambda doesn't need to check whether migration has already happened.

## The Singleton Rule — Get This Wrong and Your App Crashes

This is the single most important DataStore rule, and I've seen it violated in almost every codebase that adopts DataStore without reading the docs carefully: **you must never create more than one DataStore instance for the same file.** If two DataStore instances point to the same underlying file, you get an `IllegalStateException` at runtime.

```kotlin
// WRONG — creates a new DataStore every time the function is called
fun getPreferences(context: Context): DataStore<Preferences> {
    return PreferencesDataStoreFactory.create {
        context.preferencesDataStoreFile("settings")
    }
}

// WRONG — creates a new instance in every ViewModel
class SettingsViewModel(context: Context) : ViewModel() {
    private val dataStore = PreferencesDataStoreFactory.create {
        context.preferencesDataStoreFile("settings")
    }
}
```

Both of these will crash. The `preferencesDataStore` property delegate at the top level of a file is the correct pattern because Kotlin property delegates are lazy singletons — the DataStore is created once and reused:

```kotlin
// CORRECT — singleton via property delegate at file top level
private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "settings"
)

// Usage anywhere with a Context
class SettingsRepository(private val context: Context) {
    private val dataStore = context.settingsDataStore

    val theme: Flow<String> = dataStore.data.map { prefs ->
        prefs[THEME_KEY] ?: "system"
    }
}
```

The delegate must be declared at the top level of a Kotlin file (not inside a class), and it uses the `Context` as the receiver to ensure there's exactly one instance per file name across the entire app. If you're using dependency injection, you can also create the singleton in your DI module and inject it — just make sure only one instance is ever created per file.

## Reading and Writing With Preferences DataStore

Reads in DataStore return a `Flow<Preferences>`, which means they're non-blocking and reactive. Every time a value changes, downstream collectors receive the updated preferences object. You use typed `Preferences.Key` instances to access values:

```kotlin
object PreferenceKeys {
    val DARK_MODE = booleanPreferencesKey("dark_mode")
    val FONT_SIZE = intPreferencesKey("font_size")
    val USERNAME = stringPreferencesKey("username")
    val ONBOARDING_COMPLETE = booleanPreferencesKey("onboarding_complete")
}

class UserPreferencesRepository(private val dataStore: DataStore<Preferences>) {

    val userPreferences: Flow<UserPreferences> = dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { prefs ->
            UserPreferences(
                darkMode = prefs[PreferenceKeys.DARK_MODE] ?: false,
                fontSize = prefs[PreferenceKeys.FONT_SIZE] ?: 14,
                username = prefs[PreferenceKeys.USERNAME] ?: "",
                onboardingComplete = prefs[PreferenceKeys.ONBOARDING_COMPLETE] ?: false
            )
        }

    suspend fun updateDarkMode(enabled: Boolean) {
        dataStore.edit { prefs ->
            prefs[PreferenceKeys.DARK_MODE] = enabled
        }
    }

    suspend fun updateFontSize(size: Int) {
        dataStore.edit { prefs ->
            prefs[PreferenceKeys.FONT_SIZE] = size
        }
    }
}
```

The `.catch` block on the data flow handles the case where the DataStore file is corrupted. Without it, a corrupted file throws an `IOException` every time you try to read, effectively bricking that preference file. Emitting `emptyPreferences()` resets to defaults, which is usually the right behavior — losing user preferences is annoying but not catastrophic. The alternative is showing an error screen because the app can't read whether dark mode is enabled, which is worse.

Writes use the `edit` suspend function, which is transactional. The lambda receives a `MutablePreferences` object, and all changes within the lambda are applied atomically. If the lambda throws, no changes are written. This is a significant improvement over SharedPreferences' `edit().putString().apply()` pattern, where a crash between two `put` calls could leave the file in an inconsistent state.

## Proto DataStore With kotlinx.serialization

For structured data, Proto DataStore gives you type safety that Preferences DataStore can't match. The traditional approach uses Protocol Buffers (`.proto` files, code generation, the protobuf Gradle plugin), which is powerful but adds build complexity. A simpler alternative is using `kotlinx.serialization` with JSON:

```kotlin
@Serializable
data class AppSettings(
    val theme: Theme = Theme.SYSTEM,
    val notificationsEnabled: Boolean = true,
    val lastSyncTimestamp: Long = 0L,
    val recentSearches: List<String> = emptyList(),
    val displayConfig: DisplayConfig = DisplayConfig()
)

@Serializable
data class DisplayConfig(
    val fontSize: Int = 14,
    val compactMode: Boolean = false
)

@Serializable
enum class Theme { LIGHT, DARK, SYSTEM }
```

The serializer bridges DataStore and your data class:

```kotlin
object AppSettingsSerializer : Serializer<AppSettings> {
    override val defaultValue: AppSettings = AppSettings()

    override suspend fun readFrom(input: InputStream): AppSettings {
        return try {
            Json.decodeFromString(
                AppSettings.serializer(),
                input.readBytes().decodeToString()
            )
        } catch (e: SerializationException) {
            defaultValue // Corrupted file — reset to defaults
        }
    }

    override suspend fun writeTo(t: AppSettings, output: OutputStream) {
        output.write(
            Json.encodeToString(AppSettings.serializer(), t).toByteArray()
        )
    }
}

// Create the DataStore
private val Context.appSettingsDataStore by dataStore(
    fileName = "app_settings.json",
    serializer = AppSettingsSerializer
)
```

Here's the critical rule that's easy to miss: **the generic type parameter for Proto DataStore must be immutable.** DataStore compares old and new values to determine whether to notify observers, and mutable types break this comparison. Using `data class` with `val` properties (which Kotlin data classes enforce by convention) satisfies this requirement. If you accidentally use a `MutableList` as a property, DataStore won't detect changes correctly.

The kotlinx.serialization approach trades some performance for simplicity. Protocol Buffers produce smaller, faster serialized output, but require `.proto` schema files, the protobuf Gradle plugin, and generated Java classes that don't always play nicely with Kotlin data classes. For most apps where the settings object is small (under a few KB), JSON serialization is fast enough and the setup is significantly simpler — just add the `kotlinx-serialization` plugin and write regular Kotlin data classes.

## Performance Characteristics

DataStore's performance model is fundamentally different from SharedPreferences, and understanding it explains when to use each.

**Reads are non-blocking.** DataStore reads the file once on first access, caches the result in memory, and serves subsequent reads from cache. The Flow you get from `dataStore.data` emits the cached value immediately and then emits again whenever the data changes. This means the first read has disk I/O latency (similar to SharedPreferences), but all subsequent reads are memory-only. SharedPreferences also caches after first read, but that first read blocks the calling thread. DataStore's first read happens on a coroutine dispatcher — it never blocks the main thread.

**Writes are transactional and sequential.** Every `edit` call writes to a temporary file first, then atomically renames it to the actual DataStore file. This prevents partial writes from corrupting data. Writes are also serialized — if two coroutines call `edit` simultaneously, the second one waits for the first to complete. This guarantees consistency but means writes are inherently sequential, which is fine for preference-style data but would be a bottleneck for high-frequency writes (use Room for that).

**The entire file is read and written on every operation.** This is the key scalability limitation. DataStore doesn't do partial reads or delta writes. If your data file grows to 100KB (which is large for preferences but possible with accumulated data), every read parses 100KB and every write serializes 100KB. Google's documentation recommends keeping DataStore files under 1MB and warns about performance degradation beyond that. For reference, 1MB of JSON is a LOT of preferences — you'd need thousands of key-value pairs to hit that limit. But if you're storing a list that grows over time (search history, cached items), cap its size or move it to Room.

## MultiProcessDataStore for Multi-Process Apps

Most apps run in a single process, but if your app has services or content providers in separate processes (declared with `android:process` in the manifest), standard DataStore is not safe. Two processes accessing the same DataStore file will corrupt it.

`MultiProcessDataStore` solves this by using file locking and cross-process coordination. The API is identical — you just use a different factory method with the same serializer and corruption handler patterns. The tradeoff is real: multi-process DataStore has higher overhead due to file locking, and writes are slower because of the cross-process synchronization. If your app doesn't use multiple processes (and most don't), stick with standard DataStore. The multi-process variant exists for apps like browsers (with a separate renderer process) or messaging apps (with a background sync service in a separate process).

## Testing DataStore

DataStore is straightforward to test because you can create an instance that uses a temporary file. No mocking needed — you create a real DataStore pointed at a test directory and interact with it just like production code:

```kotlin
@OptIn(ExperimentalCoroutinesApi::class)
class UserPreferencesRepositoryTest {

    @get:Rule
    val tmpFolder: TemporaryFolder = TemporaryFolder.builder().assureDeletion().build()

    private lateinit var dataStore: DataStore<Preferences>
    private lateinit var repository: UserPreferencesRepository

    @Before
    fun setup() {
        dataStore = PreferencesDataStoreFactory.create(
            scope = TestScope(UnconfinedTestDispatcher()),
            produceFile = { tmpFolder.newFile("test_prefs.preferences_pb") }
        )
        repository = UserPreferencesRepository(dataStore)
    }

    @Test
    fun `dark mode defaults to false`() = runTest {
        val prefs = repository.userPreferences.first()
        assertFalse(prefs.darkMode)
    }

    @Test
    fun `updating dark mode emits new value`() = runTest {
        repository.updateDarkMode(true)
        val prefs = repository.userPreferences.first()
        assertTrue(prefs.darkMode)
    }
}
```

The `TemporaryFolder` JUnit rule creates and cleans up temporary files automatically. Each test gets a fresh DataStore with no leftover state from previous tests. The `TestScope` with `UnconfinedTestDispatcher` ensures DataStore operations execute immediately in tests rather than being dispatched asynchronously. This is important — without the test dispatcher, your `first()` call might return before the `edit()` has been flushed to disk.

## The Honest Tradeoffs

DataStore is strictly better than SharedPreferences for the problems it solves — non-blocking reads, transactional writes, type safety, reactive observation. But it introduces complexity that SharedPreferences didn't have.

**The API is more verbose.** Reading a single preference in SharedPreferences is one line: `prefs.getString("key", "default")`. In DataStore, it's a Flow that you need to collect, map, and handle errors on. For simple use cases — "read a boolean flag" — this feels like overkill. The ceremony of defining keys, mapping preferences objects, and handling the IOException catch block adds real boilerplate.

**Proto DataStore setup is non-trivial.** Whether you use Protocol Buffers or kotlinx.serialization, there's a setup cost — Gradle plugins, serializers, schema definitions. For a simple key-value store, Preferences DataStore avoids this. But if you find yourself with 15+ typed keys and manual mapping logic, the upfront Proto DataStore setup pays for itself in reduced mapping errors.

**DataStore is not a database replacement.** I've seen teams try to use DataStore for storing lists of items, caches of API responses, or anything that grows unboundedly. DataStore reads and writes the entire file every time. For anything that needs indexing, querying, or partial updates, Room is the right tool. DataStore is for preferences-sized data — under 1MB, ideally under 100KB.

**Migration is a one-way door.** Once you migrate from SharedPreferences to DataStore and delete the SharedPreferences file, there's no going back. Test your migration thoroughly on devices with real user data before rolling it out, especially if you have custom SharedPreferences logic like encrypted preferences or custom serialization.

Despite these tradeoffs, the direction is clear. SharedPreferences was designed for single-threaded, synchronous Android development. Modern Android apps are coroutine-based, reactive, and multi-threaded. DataStore aligns with that reality. The ANR risk from `apply()` alone is enough reason to migrate — that's not a theoretical concern, it's a real crash that shows up in your Play Console vitals. The key is to adopt DataStore with the right expectations: use it as a preferences store, keep the data small, respect the singleton rule, and reach for Room when your data outgrows what DataStore was designed for.

Thanks for reading!
