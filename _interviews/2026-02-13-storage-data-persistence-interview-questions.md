---
title: "Storage & Data Persistence"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 5
---

## Storage & Data Persistence

Every real Android app needs to persist data. This section covers the right tool for each job and the gotchas that come from production experience.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the main options for persisting data on Android, and when would you use each?

Android gives you several persistence mechanisms, each suited for different data shapes and sizes. SharedPreferences and DataStore handle simple key-value pairs like user settings or feature flags. Room (which sits on top of SQLite) is the right choice for structured, relational data — think user profiles, transaction histories, cached API responses. For large binary blobs like images, audio, or downloaded files, you use the file system directly through internal or external storage. Content Providers exist specifically for sharing structured data between apps, like the system contacts or media store. If your data has relationships or you need to query it, that's a database problem, not a key-value problem.

#### Q2: What is SharedPreferences and how does it work internally?

SharedPreferences is the simplest persistence API on Android. It stores key-value pairs of primitive types (String, Int, Float, Long, Boolean, and Set<String>) in an XML file inside your app's internal storage at `/data/data/<package>/shared_prefs/`. When you first access a SharedPreferences file, the entire XML is parsed and loaded into an in-memory HashMap. Every read after that comes from memory, which is fast. But writes go through an Editor, and here's where the important distinction comes in — `commit()` writes synchronously to disk and returns a boolean indicating success, while `apply()` writes to the in-memory map immediately but schedules the disk write asynchronously in the background.

```kotlin
val prefs = context.getSharedPreferences("user_settings", Context.MODE_PRIVATE)

// Reading — comes from in-memory map after first load
val isDarkMode = prefs.getBoolean("dark_mode", false)
val username = prefs.getString("username", "")

// Writing with apply() — async disk write, no return value
prefs.edit()
    .putBoolean("dark_mode", true)
    .putString("username", "mukul_jangra")
    .apply()

// Writing with commit() — synchronous, blocks calling thread
val success: Boolean = prefs.edit()
    .putInt("login_count", 5)
    .commit()
```

One important gotcha: calling `commit()` on the main thread blocks the UI. In practice, always use `apply()` unless you absolutely need confirmation that the write succeeded. Also, SharedPreferences loads the entire file into memory — if the file grows large (hundreds of key-value pairs), that initial load can cause a noticeable delay on app startup.

#### Q3: What are the problems with SharedPreferences that led to DataStore?

SharedPreferences has several well-known issues that Google addressed with DataStore. First, `commit()` is synchronous — calling it on the main thread risks an ANR if the disk write is slow. Second, `apply()` can also cause ANRs in edge cases because the Android framework calls `QueuedWork.waitToFinish()` in `Activity.onPause()` and `Service.onStartCommand()`, which blocks the main thread until all pending `apply()` writes complete. Third, SharedPreferences has no mechanism for signaling errors — `apply()` silently swallows failures, and you have no way to know if the write actually persisted. Fourth, it's not type-safe — you can write a String with a key and accidentally read it as an Int. Fifth, it's not safe for multi-process access. The `MODE_MULTI_PROCESS` flag was deprecated because it never reliably worked. These aren't theoretical problems. The ANR from `apply()` during `onPause()` is one of the most common ANR causes in production Android apps.

#### Q4: What is Jetpack DataStore and how does it differ from SharedPreferences?

DataStore is the Jetpack replacement for SharedPreferences, and it comes in two flavors. Preferences DataStore stores key-value pairs (like SharedPreferences) but exposes data through Kotlin Flow, so reads are reactive and asynchronous. Proto DataStore stores typed objects defined with Protocol Buffers, giving you full type safety with a schema. Both variants are built on Kotlin coroutines and Flow, which means all I/O happens off the main thread by default. There's no risk of ANR from blocking the UI thread. DataStore also handles errors properly through Flow's exception handling instead of silently failing. It even provides a migration path from SharedPreferences through `SharedPreferencesMigration`.

```kotlin
// Preferences DataStore — key-value storage with Flow
val Context.settingsDataStore by preferencesDataStore(name = "settings")

// Define typed keys
val DARK_MODE_KEY = booleanPreferencesKey("dark_mode")
val USERNAME_KEY = stringPreferencesKey("username")

// Reading — returns Flow, fully async
val darkModeFlow: Flow<Boolean> = context.settingsDataStore.data
    .catch { exception ->
        if (exception is IOException) {
            emit(emptyPreferences())
        } else {
            throw exception
        }
    }
    .map { preferences ->
        preferences[DARK_MODE_KEY] ?: false
    }

// Writing — suspend function, no UI thread blocking
suspend fun setDarkMode(enabled: Boolean) {
    context.settingsDataStore.edit { preferences ->
        preferences[DARK_MODE_KEY] = enabled
    }
}
```

The key differences to remember: DataStore is fully asynchronous (Flow-based), handles errors explicitly, guarantees atomic reads and writes within `edit()`, and the Proto variant gives you compile-time type safety. SharedPreferences gives you none of these guarantees.

#### Q5: What are the three main components of Room, and how do they work together?

Room has three core components. `@Entity` defines a database table — each field becomes a column. `@Dao` (Data Access Object) defines the operations you can perform on that table — queries, inserts, updates, deletes. `@Database` is the holder class that extends `RoomDatabase`, ties everything together, and serves as the main access point. Room validates all SQL queries at compile time, which means you catch typos and schema mismatches before the app ever runs. That compile-time verification is one of the biggest advantages over raw SQLite.

```kotlin
@Entity(tableName = "articles")
data class ArticleEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "title") val title: String,
    @ColumnInfo(name = "author") val author: String,
    @ColumnInfo(name = "published_at") val publishedAt: Long
)

@Dao
interface ArticleDao {
    @Query("SELECT * FROM articles ORDER BY published_at DESC")
    fun getArticles(): Flow<List<ArticleEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertArticle(article: ArticleEntity)

    @Delete
    suspend fun deleteArticle(article: ArticleEntity)

    @Query("SELECT * FROM articles WHERE author = :authorName")
    suspend fun getArticlesByAuthor(authorName: String): List<ArticleEntity>
}

@Database(entities = [ArticleEntity::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun articleDao(): ArticleDao
}
```

Notice that `getArticles()` returns `Flow<List<ArticleEntity>>` — Room automatically re-emits whenever the `articles` table changes, giving you reactive queries. The `suspend` functions for insert and delete ensure they run off the main thread. Room actually enforces this — if you try to run a database operation on the main thread, it throws an `IllegalStateException` by default.

#### Q6: What is the difference between internal storage and external storage on Android?

Internal storage is private to your app. Files saved here are stored in `/data/data/<package>/files/` and no other app can access them (unless the device is rooted). You don't need any permissions to read or write here, and these files are automatically deleted when the user uninstalls your app. Use `context.filesDir` or `context.getFilesDir()` to get the path. External storage historically meant the SD card, but on modern devices it refers to shared storage that other apps might access. You access app-specific external storage with `context.getExternalFilesDir()`, which also requires no permissions and gets cleaned up on uninstall. The shared external storage (photos, downloads, documents visible to other apps) is where scoped storage rules come in.

#### Q7: What is scoped storage, and why did Google introduce it?

Before Android 10, any app with the `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` permissions could read and write any file on shared external storage. This was a massive privacy and security concern — a flashlight app could read your photos, documents, and downloaded files. Scoped storage, introduced in Android 10 and enforced from Android 11, restricts this. Each app gets its own sandboxed directory on external storage that requires no permissions. To access shared media (photos, videos, audio), you use the `MediaStore` API. To let users pick files, you use the Storage Access Framework (SAF) with `Intent.ACTION_OPEN_DOCUMENT`. You can no longer just `File("/sdcard/...")` your way into someone else's files. This is a fundamental security architecture change, especially relevant if you've worked on apps that handle file management or media.

#### Q8: How do you share files securely between apps?

The old approach of sharing a `file://` URI stopped working from Android 7.0 (API 24) — it throws a `FileUriExposedException`. The correct approach is to use `FileProvider`, which generates a `content://` URI that grants temporary access to the receiving app. You declare the FileProvider in your manifest, specify which directories you want to share in an XML resource file, and use `FileProvider.getUriForFile()` to generate the URI.

```kotlin
// In AndroidManifest.xml — declare the provider
// <provider
//     android:name="androidx.core.content.FileProvider"
//     android:authorities="${applicationId}.fileprovider"
//     android:exported="false"
//     android:grantUriPermissions="true">
//     <meta-data
//         android:name="android.support.FILE_PROVIDER_PATHS"
//         android:resource="@xml/file_paths" />
// </provider>

// Generate content:// URI for a file
val photoFile = File(context.filesDir, "profile_photo.jpg")
val photoUri: Uri = FileProvider.getUriForFile(
    context,
    "${context.packageName}.fileprovider",
    photoFile
)

// Share with another app
val shareIntent = Intent(Intent.ACTION_SEND).apply {
    type = "image/jpeg"
    putExtra(Intent.EXTRA_STREAM, photoUri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
context.startActivity(Intent.createChooser(shareIntent, "Share photo"))
```

The key detail is `FLAG_GRANT_READ_URI_PERMISSION` — without it, the receiving app can't read the file. This is temporary access that gets revoked automatically.

#### Q9: What is a Content Provider and when would you use one?

A Content Provider manages access to a structured set of data using a URI-based pattern (`content://authority/path`). The system's Contacts, MediaStore, and Calendar all expose data through Content Providers. You interact with them through `ContentResolver` using standard CRUD operations — `query()`, `insert()`, `update()`, `delete()`. Each Content Provider has a unique authority (like a namespace), and the URI path identifies the specific data set. You can also create your own Content Provider to share data with other apps, though this is less common now that most inter-app communication happens through explicit intents and FileProvider. One valid use case for a custom Content Provider within the same app is abstracting data access for widgets or search integration — both of which access data through Content Providers by design.

### Deep Dive Questions (Advanced → Expert)

#### Q10: How do Room database migrations work, and what happens if you get them wrong?

When you change your database schema (add a column, rename a table, change a type), you must increment the version number in `@Database` and provide a `Migration` object that tells Room exactly how to transform the old schema into the new one. Each Migration specifies a start version and end version, and Room chains them together if there are gaps. If you go from version 1 to 3, Room will run Migration(1,2) followed by Migration(2,3) if both exist, or Migration(1,3) directly if that's defined.

```kotlin
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE articles ADD COLUMN category TEXT DEFAULT ''")
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("CREATE INDEX index_articles_category ON articles(category)")
    }
}

val database = Room.databaseBuilder(context, AppDatabase::class.java, "app_db")
    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
    .build()
```

If you forget a migration, Room crashes with an `IllegalStateException` on the first database access. During development, you can use `fallbackToDestructiveMigration()` which drops all tables and recreates them — but never ship this in production because users lose all their data. Room does not handle schema changes automatically. You write the SQL migrations yourself, and Room validates that the resulting schema matches your entity definitions. Another gotcha: SQLite's `ALTER TABLE` is limited — you can add columns, but you can't drop or rename columns (before SQLite 3.35.0 / API 34). For those operations, you have to create a new table, copy data, drop the old table, and rename.

#### Q11: How do you handle custom types in Room with @TypeConverter?

Room only supports primitive types and a few built-in types by default. If your entity has a field like `Date`, `List<String>`, or a custom enum, you need a `@TypeConverter` to tell Room how to convert it to and from a type SQLite understands. You define converter functions, annotate them with `@TypeConverter`, and register the converter class in your `@Database` annotation.

```kotlin
class Converters {
    @TypeConverter
    fun fromTimestamp(value: Long?): Date? {
        return value?.let { Date(it) }
    }

    @TypeConverter
    fun dateToTimestamp(date: Date?): Long? {
        return date?.time
    }

    @TypeConverter
    fun fromStringList(value: String?): List<String> {
        return value?.split(",") ?: emptyList()
    }

    @TypeConverter
    fun stringListToString(list: List<String>): String {
        return list.joinToString(",")
    }
}

@Database(
    entities = [ArticleEntity::class],
    version = 1
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun articleDao(): ArticleDao
}
```

A common pitfall: storing a `List<String>` as a comma-separated string works for simple cases, but falls apart if the strings themselves contain commas. For complex types, serialize to JSON using kotlinx.serialization or Moshi. But even better — if you need to query by individual list items, that's a signal you should model it as a separate table with a one-to-many relationship instead of stuffing a list into a single column.

#### Q12: How do you model relationships in Room (one-to-many, many-to-many)?

Room doesn't use traditional ORM-style lazy loading. Instead, it uses `@Embedded` and `@Relation` annotations to define how entities relate to each other. For a one-to-many relationship (one author has many articles), you create a data class that combines the parent entity with a list of child entities.

```kotlin
data class AuthorWithArticles(
    @Embedded val author: AuthorEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "author_id"
    )
    val articles: List<ArticleEntity>
)

// In your DAO — must be @Transaction to ensure consistency
@Transaction
@Query("SELECT * FROM authors WHERE id = :authorId")
suspend fun getAuthorWithArticles(authorId: Long): AuthorWithArticles
```

For many-to-many (articles can have multiple tags, tags can belong to multiple articles), you need a junction table. You define a cross-reference entity and use `@Junction` in the `@Relation` annotation. The `@Transaction` annotation is critical here — without it, Room might return the parent entity with a stale or incomplete list of children if another write happens between the two queries Room executes internally. Room runs one query for the parent and a second query for the children, so `@Transaction` ensures both run atomically.

#### Q13: What are database indexes in Room, and when should you use them?

An index on a column creates a separate data structure (typically a B-tree in SQLite) that speeds up queries filtering or sorting on that column. Without an index, SQLite does a full table scan — it reads every row. With an index, it can jump directly to the matching rows. In Room, you define indexes on your entity using the `@Index` annotation.

```kotlin
@Entity(
    tableName = "articles",
    indices = [
        Index(value = ["author"]),
        Index(value = ["title", "author"], unique = true)
    ]
)
data class ArticleEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val author: String,
    val publishedAt: Long
)
```

The tradeoff is that indexes speed up reads but slow down writes — every insert, update, or delete also has to update the index. For a table that's mostly read (like a cached API response), indexes are almost always worth it. For a table with heavy write throughput (like an analytics event log), be selective. Also, composite indexes (multiple columns) only help queries that filter on those columns in the same order — an index on `[title, author]` helps `WHERE title = ? AND author = ?` but doesn't help `WHERE author = ?` alone. Column order in the index matters.

#### Q14: How does EncryptedSharedPreferences work, and when should you use it?

`EncryptedSharedPreferences` is part of the AndroidX Security library. It wraps the standard SharedPreferences API but encrypts both the keys and the values before writing them to disk. Keys are encrypted with AES256-SIV (which is deterministic, so the same key always produces the same ciphertext — necessary for lookup). Values are encrypted with AES256-GCM (which includes authentication, so tampering is detected). The encryption keys themselves are managed through Android's Keystore system using a `MasterKey`.

```kotlin
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val encryptedPrefs = EncryptedSharedPreferences.create(
    context,
    "secure_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

// Usage is identical to regular SharedPreferences
encryptedPrefs.edit()
    .putString("auth_token", "eyJhbGciOiJIUzI1NiJ9...")
    .apply()

val token = encryptedPrefs.getString("auth_token", null)
```

Use it for sensitive data that must be stored locally — auth tokens, session keys, API credentials. Don't use it for everything — encryption adds overhead to every read and write. The same file-loading problem from regular SharedPreferences still applies (the entire file is loaded into memory on first access), and now it also has to decrypt everything. For truly sensitive data like cryptographic keys, use the Android Keystore directly rather than EncryptedSharedPreferences.

#### Q15: What is the @Transaction annotation in Room, and why does it matter?

`@Transaction` ensures that all database operations within a method execute atomically — either all succeed or all are rolled back. This is critical in two scenarios. First, when you're doing multiple writes that must be consistent (transferring money between accounts — debit one, credit the other). Second, when you're reading related data using `@Relation`, because Room internally runs multiple queries, and without `@Transaction`, another thread could modify the data between those queries.

```kotlin
@Dao
interface TransferDao {
    @Transaction
    suspend fun transferFunds(fromId: Long, toId: Long, amount: Double) {
        debitAccount(fromId, amount)
        creditAccount(toId, amount)
    }

    @Query("UPDATE accounts SET balance = balance - :amount WHERE id = :accountId")
    suspend fun debitAccount(accountId: Long, amount: Double)

    @Query("UPDATE accounts SET balance = balance + :amount WHERE id = :accountId")
    suspend fun creditAccount(accountId: Long, amount: Double)
}
```

Room wraps `@Transaction` methods in SQLite's `BEGIN TRANSACTION` and `END TRANSACTION` under the hood. If an exception is thrown during execution, the entire transaction is rolled back. Without this annotation, a crash after `debitAccount()` but before `creditAccount()` would leave you with money that disappeared — debited from one account but never credited to the other.

#### Q16: How does Room enforce main-thread safety, and can you override it?

By default, Room throws an `IllegalStateException` if you run any database operation on the main thread. This is a deliberate design decision — database I/O can block the UI, cause dropped frames, and trigger ANRs. Room enforces this at runtime by checking `Looper.myLooper() == Looper.getMainLooper()`. You can bypass this with `allowMainThreadQueries()` on the builder, but you should never do this in production code. The proper approach is to use `suspend` functions in your DAO for one-shot operations and `Flow` for observable queries. Room automatically dispatches suspend functions to a background thread using its own executor. For Flow-based queries, the query runs on Room's query executor, and emissions happen on the collector's dispatcher.

#### Q17: How would you choose between SharedPreferences, DataStore, Room, and file storage for a given feature?

User preferences (theme, language, notification settings) — use DataStore (Preferences). It's async, safe, and handles the simple key-value pattern well. If you're on a legacy codebase, SharedPreferences with `apply()` works, but plan to migrate. Structured, queryable data (users, messages, transactions, cached API responses) — use Room. You need relationships, indexes, and query capabilities. Large files (images, PDFs, audio, video) — use file storage. Internal storage for private files, scoped storage APIs for shared media. Sensitive credentials (tokens, API keys) — use EncryptedSharedPreferences or EncryptedFile for small values, Android Keystore for cryptographic keys. Typed configuration objects with schema — Proto DataStore with Protocol Buffers. Don't overcomplicate it. If you're storing three boolean flags, you don't need Room. If you're storing a list of 500 items with relationships, you don't want SharedPreferences.

#### Q18: What happens under the hood when you call SharedPreferences.edit().apply()?

When you call `apply()`, SharedPreferences first writes the changes to the in-memory HashMap immediately (so any subsequent read in the same process sees the new values right away). Then it schedules an asynchronous disk write by posting a `Runnable` to a single background thread. The writes go to the XML file atomically — it writes to a temporary file first, then renames it to the actual file (an atomic operation on most file systems). Here's the important part: `apply()` adds the pending write to `QueuedWork`. When certain lifecycle methods run (`Activity.onStop()`, `Service.onStartCommand()`, `BroadcastReceiver.onReceive()`), the framework calls `QueuedWork.waitToFinish()`, which blocks the main thread until all pending `apply()` writes complete. If you've called `apply()` many times in quick succession, or if the disk is slow, this blocking wait can cause an ANR. This is one of the primary reasons Google built DataStore.

#### Q19: Explain the difference between Preferences DataStore and Proto DataStore. When would you choose each?

Preferences DataStore is a drop-in replacement for SharedPreferences — it stores key-value pairs with typed keys (`stringPreferencesKey`, `intPreferencesKey`, etc.), exposes data through Flow, and is good for simple settings. Proto DataStore uses Protocol Buffers to define a schema, which gives you full type safety, default values, and structured objects. With Proto DataStore, you define a `.proto` file, the Protocol Buffers compiler generates Kotlin classes, and you read/write strongly-typed objects instead of individual keys. Choose Preferences DataStore when your data is flat key-value pairs and you want a quick migration from SharedPreferences. Choose Proto DataStore when your settings have structure (nested objects, lists, enums) or when type safety is critical. The tradeoff is that Proto DataStore requires setting up the protobuf Gradle plugin and defining `.proto` files, which adds build complexity. For most apps with a simple settings screen, Preferences DataStore is the right call.

#### Q20: How does Room's compile-time SQL verification work?

Room uses an annotation processor (KSP or KAPT) that runs during compilation. When it encounters your `@Dao` interfaces and `@Query` annotations, it parses the SQL strings, validates them against your `@Entity` definitions, and checks that column names exist, types match, and the query is syntactically valid. It also verifies that the return type of your DAO method matches the query result — if your query returns three columns but your return type expects four, the build fails. This catches entire categories of bugs that raw SQLite would only surface at runtime. Room generates the actual implementation classes for your DAOs and Database during compilation — if you look at the build output, you'll find classes like `ArticleDao_Impl` that contain the actual SQLite calls with prepared statements and cursor management. This is why Room has zero runtime reflection overhead. Everything is generated code.

#### Q21: What is the Storage Access Framework (SAF), and how do you use it?

SAF provides a system-level file picker UI that lets users choose files from any document provider — local storage, Google Drive, Dropbox, or any other app that implements a `DocumentsProvider`. You launch an intent with `ACTION_OPEN_DOCUMENT` or `ACTION_CREATE_DOCUMENT`, the user picks a file, and you get back a `content://` URI. This URI can be persisted using `takePersistableUriPermission()` so your app retains access across device reboots. SAF is the primary way to access files outside your app's sandbox under scoped storage.

```kotlin
// Launch the document picker
val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
    addCategory(Intent.CATEGORY_OPENABLE)
    type = "application/pdf"
}
documentPickerLauncher.launch(intent)

// Handle the result
val documentPickerLauncher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult()
) { result ->
    result.data?.data?.let { uri ->
        // Persist permission across reboots
        contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION
        )
        // Read the file
        contentResolver.openInputStream(uri)?.use { stream ->
            // Process the PDF
        }
    }
}
```

The key detail is `takePersistableUriPermission()`. Without it, the URI permission is temporary and expires when the user's task ends. With it, your app can reopen the file later without asking the user to pick it again.

#### Q22: How do you handle database testing with Room?

Room provides an in-memory database builder specifically for testing. This database lives entirely in RAM, runs fast, and is destroyed when the test finishes — no cleanup needed. You can test your DAOs and migrations independently, which is critical for catching regressions.

```kotlin
@RunWith(AndroidJUnit4::class)
class ArticleDaoTest {

    private lateinit var database: AppDatabase
    private lateinit var articleDao: ArticleDao

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        articleDao = database.articleDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun insertAndReadArticle() = runTest {
        val article = ArticleEntity(
            title = "Testing Room",
            author = "Mukul",
            publishedAt = System.currentTimeMillis()
        )
        articleDao.insertArticle(article)
        val articles = articleDao.getArticlesByAuthor("Mukul")
        assertEquals(1, articles.size)
        assertEquals("Testing Room", articles[0].title)
    }
}
```

Notice `allowMainThreadQueries()` is acceptable here because tests don't have a UI thread to block. For migration testing, Room provides `MigrationTestHelper` which lets you create a database at version N, run your migration, and verify the schema at version N+1. This is how you catch migration bugs before they reach users. Android Studio also includes the Database Inspector, which lets you inspect your Room database live on a running device or emulator — query tables, edit rows, and see changes in real time.

#### Q23: How do you encrypt a Room database, and when would you need to?

Room uses SQLite under the hood, and SQLite databases are stored as plain files on disk. Anyone with root access or a device backup can read the contents. For apps handling sensitive data — health records, financial transactions, private messages — you need encryption at the database level. The standard solution is **SQLCipher**, an open-source extension that provides transparent 256-bit AES encryption for SQLite.

```kotlin
// build.gradle.kts
dependencies {
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")
    implementation("androidx.sqlite:sqlite-ktx:2.4.0")
}

// Create encrypted Room database
val passphrase = getOrCreatePassphrase() // from Android Keystore
val factory = SupportOpenHelperFactory(SQLiteDatabase.getBytes(passphrase))

val db = Room.databaseBuilder(
    context,
    AppDatabase::class.java,
    "encrypted_app.db"
)
    .openHelperFactory(factory)
    .build()
```

The passphrase should come from the Android Keystore — generate an AES key in the Keystore, use it to encrypt a random passphrase, and store the encrypted passphrase in SharedPreferences. When opening the database, decrypt the passphrase using the Keystore key. This way, the actual database passphrase never exists in plaintext outside of the secure hardware.

The tradeoff: SQLCipher adds roughly 5-15% overhead on database operations and increases APK size by about 3-4MB (for the native libraries). For most apps storing only preferences or cached API data, encryption is unnecessary. Reserve it for genuinely sensitive data.

#### Q24: What is the difference between `commit()` and `apply()` in SharedPreferences, and what's the hidden gotcha with `apply()`?

`commit()` writes to disk synchronously on the calling thread and returns a boolean indicating success or failure. `apply()` writes to the in-memory map immediately but schedules the disk write asynchronously on a background thread. `apply()` is faster from the caller's perspective because it returns immediately.

The hidden gotcha that causes real production ANRs: the Android framework calls `QueuedWork.waitToFinish()` in `Activity.onPause()`, `Activity.onStop()`, `BroadcastReceiver.onReceive()`, and `Service.onStartCommand()`. This method blocks the main thread until all pending `apply()` writes complete. If you call `apply()` many times in quick succession (or write large amounts of data), the queued writes pile up. When the Activity pauses, the system blocks the main thread waiting for all those writes to flush to disk. If the disk is slow (which happens more than you'd think on lower-end devices), this causes a 5+ second block and an ANR.

This is one of the main reasons Google created DataStore — it doesn't have this blocking behavior. It's also why you should use `apply()` only for small, infrequent writes. For anything more complex, migrate to DataStore.

### Common Follow-ups

- What happens if two processes try to access the same SharedPreferences file? (Answer: it's unreliable — MODE_MULTI_PROCESS was deprecated because it doesn't guarantee consistency. Use DataStore or a ContentProvider for multi-process access.)
- How do you migrate from SharedPreferences to DataStore? (Answer: DataStore provides `SharedPreferencesMigration` that reads the old SharedPreferences file, moves data to DataStore, and deletes the old file.)
- What's the maximum size of a SharedPreferences file? (Answer: there's no hard limit, but the entire file loads into memory. Anything above a few hundred kilobytes starts causing noticeable startup latency.)
- Can Room work with pre-populated databases? (Answer: yes, use `createFromAsset()` or `createFromFile()` on the database builder to ship a pre-built database with your APK.)
- How does DataStore handle errors? (Answer: through Flow's `catch` operator. If a read or write fails, the exception propagates through the Flow, and you handle it explicitly.)
- What's the difference between `getFilesDir()` and `getExternalFilesDir()`? (Answer: `getFilesDir()` returns the app's private internal storage. `getExternalFilesDir()` returns the app-specific directory on external storage. Both are private to the app and cleaned up on uninstall, but external storage may be removable or unavailable.)
- How do you observe database changes reactively in Room? (Answer: return `Flow<List<T>>` or `LiveData<List<T>>` from your DAO. Room uses InvalidationTracker internally to monitor table changes and re-execute the query.)
- What is `fallbackToDestructiveMigration()` and why should you never use it in production? (Answer: it drops all tables and recreates the database when a migration is missing. Users lose all local data. It's only acceptable during development.)


