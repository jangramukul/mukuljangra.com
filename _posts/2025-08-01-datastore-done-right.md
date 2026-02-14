---
title: DataStore Done Right — Replacing SharedPreferences
layout: post
categories: post
tags:
  - Android
  - Architecture
---

I once spent a full afternoon debugging an ANR that only happened on low-end devices during cold starts. The stack trace pointed to `SharedPreferences.getString()` — a call I assumed was instantaneous. Turns out, the first access to a SharedPreferences file blocks the calling thread until the entire XML file is parsed from disk. On a device with slow flash storage and a 2MB preferences file accumulated over years of feature flags and cached values, that blocking read took over 800ms on the main thread. Three different components all hit SharedPreferences during `onCreate()`, and the 5-second ANR threshold fired.

Sound familiar? Yeah, SharedPreferences looks harmless until it isn't.

SharedPreferences has been Android's default key-value storage since API level 1. Simple, synchronous, familiar — and fundamentally broken for modern development. The synchronous reads block whatever thread calls them. The `apply()` method everyone uses to avoid blocking writes can still cause ANRs: it schedules a write and registers a completion callback with `ActivityThread`, and if the Activity finishes before that write completes, the framework blocks `onPause()` waiting for it. There's no type safety beyond basic primitives. And there's no way to observe changes as a reactive stream without polling or using the deprecated `OnSharedPreferenceChangeListener`, which leaks if you forget to unregister.

Think of SharedPreferences like a notebook that only one person can read or write at a time, and reading it requires flipping through every single page first. That was fine when the notebook had three pages. Now it has two hundred, and there's a line of people waiting to flip through it — on the main thread.

Jetpack DataStore fixes all of this — coroutines for non-blocking reads, Flow for reactive observation, transactional writes. But I've seen teams introduce bugs by treating it like a drop-in SharedPreferences replacement without understanding its rules. Here's the thing: DataStore isn't just SharedPreferences with coroutines. It's a fundamentally different storage model that happens to solve the same problem.

## Preferences DataStore vs Proto DataStore

DataStore comes in two variants, and choosing the wrong one creates unnecessary complexity.

**Preferences DataStore** is the direct SharedPreferences replacement — a key-value store with typed keys, non-blocking access, and Flow-based observation. If your stored data is simple (user settings, feature flags, small cached values), this is what you want. No schema, no code generation, minimal setup. Think of it like a typed dictionary — you put things in with a key, you get things out with a key, but unlike SharedPreferences, the keys know their own types.

**Proto DataStore** stores structured, typed data. Instead of string keys and primitives, you define your data as a class and DataStore serializes the entire object atomically. This gives you compile-time type safety for complex structures — nested objects, enums, collections — that Preferences DataStore can't express cleanly. The tradeoff is setup overhead: you need a serializer (Protocol Buffers or kotlinx.serialization) and a schema definition. Think of it like storing a complete form rather than individual fields — everything stays together, typed, and consistent.

The rule of thumb I use: if your data fits in 5-10 key-value pairs with primitive types, use Preferences DataStore. If you're storing a structured object with multiple fields that change together (like an `AppSettings` data class with theme, notification preferences, and display config), use Proto DataStore. If you're storing large datasets or anything that needs querying — use Room, not DataStore. DataStore reads and writes the entire file on every operation. It doesn't scale for large data.

## Setup

Gradle dependencies differ based on which variant you pick. For Preferences DataStore:

```kotlin
dependencies {
    implementation("androidx.datastore:datastore-preferences:1.2.0")
}
```

For Proto DataStore (typed DataStore with a custom serializer):

```kotlin
dependencies {
    implementation("androidx.datastore:datastore:1.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
}
```

Proto DataStore also needs the kotlinx.serialization Gradle plugin, or the protobuf plugin if you're going the Protocol Buffers route. I'll cover the kotlinx.serialization approach later — it's simpler and sufficient for most apps.

Creating the DataStore instance uses a property delegate at the top level of a Kotlin file. For Preferences DataStore, it's `preferencesDataStore`. For Proto DataStore, it's `dataStore` with a serializer:

```kotlin
// Preferences DataStore
private val Context.settingsDataStore by preferencesDataStore(name = "settings")

// Proto DataStore (typed)
private val Context.appSettingsDataStore by dataStore(
    fileName = "app_settings.json",
    serializer = AppSettingsSerializer
)
```

Both delegates must live at the top level of a file, not inside a class. This matters — I'll explain why in the singleton section.

## The Singleton Rule

This is the single most important DataStore rule, and I've seen it violated in nearly every codebase that adopts DataStore without reading the docs: **never create more than one DataStore instance for the same file.** Two instances pointing to the same file throws an `IllegalStateException` at runtime.

Can you guess why this crashes? Think about it — if two DataStore instances both cache the file contents in memory and both try to write updates independently, they'd overwrite each other's changes. DataStore doesn't try to handle this conflict. It just refuses to start.

```kotlin
// WRONG — creates a new DataStore every time the function is called
fun getPreferences(context: Context): DataStore<Preferences> {
    return PreferencesDataStoreFactory.create {
        context.preferencesDataStoreFile("settings")
    }
}

// WRONG — new instance in every ViewModel
class SettingsViewModel(context: Context) : ViewModel() {
    private val dataStore = PreferencesDataStoreFactory.create {
        context.preferencesDataStoreFile("settings")
    }
}
```

Both of these crash. The `preferencesDataStore` property delegate at the top level of a file is the correct pattern because Kotlin property delegates are lazy singletons — created once, reused everywhere:

```kotlin
private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "settings"
)

class SettingsRepository(private val context: Context) {
    private val dataStore = context.settingsDataStore

    val theme: Flow<String> = dataStore.data.map { prefs ->
        prefs[THEME_KEY] ?: "system"
    }
}
```

The delegate uses `Context` as the receiver to ensure there's exactly one instance per file name across the app. If you're using dependency injection, create the singleton in your DI module and inject it — just guarantee only one instance per file exists.

> **🔥 Real talk:** I've seen this singleton violation in three different production codebases. Every time, the crash only showed up in specific user flows where two screens accessed the same DataStore file simultaneously. It passed all unit tests because tests create fresh instances. Lesson: if you see `IllegalStateException` mentioning "multiple active DataStore instances," the fix is always to make it a singleton.

## Reading and Writing

Reads return a `Flow<Preferences>` — non-blocking and reactive. Every time a value changes, downstream collectors receive the updated preferences. You define typed `Preferences.Key` instances to access values, which eliminates the string-key-plus-wrong-type bugs that plague SharedPreferences.

Remember SharedPreferences' classic trap? You store a value with `putInt("count", 42)`, then later someone reads it with `getString("count", "0")`. No compiler error. Just a runtime `ClassCastException`. DataStore makes this impossible — each key carries its type.

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
}
```

The `.catch` block handles file corruption. Without it, a corrupted file throws an `IOException` on every read, effectively bricking that preference file. Emitting `emptyPreferences()` resets to defaults — losing user preferences is annoying but not catastrophic. The alternative is the app crashing because it can't read whether dark mode is enabled, which is objectively worse.

### Transactional Writes With `edit`

Writes use the `edit` suspend function, which is transactional. The lambda receives a `MutablePreferences` object, and all changes within the lambda are applied atomically. If the lambda throws an exception, nothing is written to disk. This is a real improvement over SharedPreferences' `edit().putString().apply()` pattern, where a crash between two `put` calls could leave the file in an inconsistent state.

```kotlin
suspend fun completeOnboarding(username: String) {
    dataStore.edit { prefs ->
        prefs[PreferenceKeys.ONBOARDING_COMPLETE] = true
        prefs[PreferenceKeys.USERNAME] = username
        // Both values are written atomically — either both persist, or neither does
    }
}
```

Under the hood, `edit` writes to a temporary file first, then atomically renames it to the actual DataStore file. This prevents partial writes from corrupting data. It's the same trick databases use — write the new version alongside the old one, then swap the filename in a single filesystem operation. Writes are also serialized — if two coroutines call `edit` simultaneously, the second waits for the first to complete.

## Flow Integration

This is where DataStore genuinely shines over SharedPreferences. Because reads are `Flow`-based, you can combine preferences with other reactive streams using standard Flow operators. No more polling, no more listeners that leak:

```kotlin
class SettingsViewModel(
    private val prefsRepository: UserPreferencesRepository,
    private val featureFlagRepository: FeatureFlagRepository
) : ViewModel() {

    val uiState: StateFlow<SettingsUiState> = prefsRepository.userPreferences
        .combine(featureFlagRepository.flags) { prefs, flags ->
            SettingsUiState(
                darkMode = prefs.darkMode,
                fontSize = prefs.fontSize,
                showExperimentalSettings = flags.experimentalUiEnabled
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsUiState())
}
```

The preferences flow emits every time any value in the DataStore changes. Combined with `stateIn`, you get a reactive pipeline that automatically updates the UI when preferences change — from any screen, any coroutine, anywhere in the app. This replaces the entire pattern of `OnSharedPreferenceChangeListener` registrations, manual unregistrations, and the memory leaks that come when you forget.

> **💡 The "aha" moment:** With SharedPreferences, you had to manually wire up observation — register a listener, remember to unregister it, and pray you didn't leak. With DataStore, observation is the default. You don't *add* reactivity. You get it for free because the API is Flow-first. The moment you read a value, you're subscribed to its changes.

## Migration From SharedPreferences

DataStore provides `SharedPreferencesMigration` — it reads your existing SharedPreferences file and writes the values into DataStore on first access. After migration succeeds, it deletes the old file to avoid dual-source-of-truth issues:

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

The migration runs exactly once, on the first access to the DataStore. It's atomic — all values migrate successfully, or none do. If migration fails (disk full, corrupted file), DataStore throws an exception and the old SharedPreferences file is preserved. One thing that catches people off guard: the `produceMigrations` lambda is called every time the DataStore is accessed, but the migration itself only executes if it hasn't completed before. DataStore tracks this internally.

**Migration is a one-way door.** Once you migrate and delete the SharedPreferences file, there's no rollback. Test your migration on devices with real user data before rolling it out, especially if you have custom SharedPreferences logic like encrypted preferences.

## Proto DataStore With kotlinx.serialization

When your preferences grow beyond 10-15 keys, or when values logically belong together (theme + font size + compact mode = display settings), Proto DataStore with kotlinx.serialization removes the key-mapping ceremony entirely. You define a data class, write a serializer, and DataStore handles the rest:

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

object AppSettingsSerializer : Serializer<AppSettings> {
    override val defaultValue: AppSettings = AppSettings()

    override suspend fun readFrom(input: InputStream): AppSettings {
        return try {
            Json.decodeFromString(
                AppSettings.serializer(),
                input.readBytes().decodeToString()
            )
        } catch (e: SerializationException) {
            defaultValue
        }
    }

    override suspend fun writeTo(t: AppSettings, output: OutputStream) {
        output.write(
            Json.encodeToString(AppSettings.serializer(), t).toByteArray()
        )
    }
}
```

Now reads and writes are fully typed — no string keys, no wrong-type bugs, no manual mapping:

```kotlin
// Read
val themeFlow: Flow<Theme> = context.appSettingsDataStore.data.map { it.theme }

// Write
suspend fun updateTheme(theme: Theme) {
    context.appSettingsDataStore.updateData { settings ->
        settings.copy(theme = theme)
    }
}
```

Here's the critical rule: **the generic type for Proto DataStore must be immutable.** DataStore compares old and new values to decide whether to notify observers. Mutable types break this comparison. Using `data class` with `val` properties satisfies this. If you accidentally use a `MutableList` as a property, DataStore won't detect changes correctly.

> **⚡ Quick check:** What would happen if your Proto DataStore data class used `var` properties and someone mutated them directly instead of calling `updateData`? DataStore compares references to decide if data changed — if you mutate the existing object, the old and new references are the same, so DataStore thinks nothing changed and skips notifying observers. Always use `copy()` to create new instances.

Protocol Buffers produce smaller, faster serialized output, but require `.proto` schema files, the protobuf Gradle plugin, and generated Java classes that don't always play nicely with Kotlin. For most apps where the settings object is under a few KB, JSON serialization is fast enough and the setup is significantly simpler.

## Real-World Patterns

Here's how I think about DataStore in practice. Most apps need a handful of these patterns:

**User preferences** — theme, font size, language, notification toggles. This is the bread-and-butter use case. A single `UserPreferencesRepository` with typed keys handles it. I keep preference keys and the repository in the same file so the keys stay private.

**Feature flags** — remote config values cached locally so the app has values before the network responds. Store them in a separate DataStore file from user preferences. Feature flags change on every app update or config fetch; user preferences change when the user explicitly changes them. Mixing them in one file means every config refresh triggers a re-emission for user preference observers too.

**Onboarding state** — whether the user has completed onboarding, which screens they've seen, whether they've granted permissions. A single boolean key works for simple cases. For multi-step onboarding, a Proto DataStore with an enum tracking the last completed step is cleaner than five separate boolean keys.

**Theme settings** — light/dark/system, dynamic color toggle, accent color. If you're using Compose, the theme `Flow` from DataStore pipes directly into your `MaterialTheme` wrapper. The reactive update means the theme switch is instant — no Activity recreation needed.

## Testing DataStore

DataStore is straightforward to test. You create a real instance pointed at a temporary file — no mocking, no faking:

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

`TemporaryFolder` creates and cleans up files automatically, so each test gets a fresh DataStore with no leftover state. The `TestScope` with `UnconfinedTestDispatcher` is important — it ensures DataStore operations execute immediately rather than being dispatched asynchronously. Without it, your `first()` call might return before the `edit()` flushes to disk.

## Performance and MultiProcessDataStore

DataStore's performance model is fundamentally different from SharedPreferences. It reads the file once on first access, caches the result in memory, and serves subsequent reads from cache. The `Flow` from `dataStore.data` emits the cached value immediately and then re-emits whenever data changes. SharedPreferences also caches after first read, but that first read blocks the calling thread. DataStore's first read runs on a coroutine dispatcher — it never blocks the main thread.

Here's the reframe: **DataStore isn't slower than SharedPreferences. It just moves the latency to a place where it can't cause ANRs.** The total I/O work is comparable, but DataStore guarantees it happens off the main thread. That's the entire point. Same work, different thread, zero ANRs.

Every `edit` call writes to a temporary file, then atomically renames it. Writes are serialized — two simultaneous `edit` calls execute sequentially. The entire file is read and written on every operation, which is the key scalability limitation. Google recommends keeping DataStore files under 1MB. For reference, 1MB of JSON is thousands of key-value pairs — you'd have to try hard to hit that. But if you're storing a list that grows over time (search history, cached items), cap its size or move it to Room.

For multi-process apps (services or content providers with `android:process` in the manifest), standard DataStore is not safe — two processes accessing the same file will corrupt it. `MultiProcessDataStore` handles this with file locking and cross-process coordination. Same API, just a different factory method. The overhead is real though: file locking slows writes, and most apps don't need it. Stick with standard DataStore unless you explicitly run components in separate processes.

## The Honest Tradeoffs

DataStore is strictly better than SharedPreferences for the problems it solves. But the API is more verbose — reading a single preference in SharedPreferences is one line (`prefs.getString("key", "default")`), while DataStore requires a Flow, a map, and an IOException catch block. For "read a boolean flag," this feels like overkill.

But I think that verbosity is the right trade. The ceremony exists because DataStore forces you to handle things SharedPreferences silently ignored — file corruption, thread safety, reactive updates. SharedPreferences let you write `prefs.getString()` on the main thread and pretended everything was fine, until it wasn't. DataStore makes the complexity explicit. The extra code isn't boilerplate — it's error handling that SharedPreferences should have required all along.

Use DataStore as a preferences store, keep the data small, respect the singleton rule, and reach for Room when your data outgrows what DataStore was designed for.

Thanks for reading!
