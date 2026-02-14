---
title: "Storage & Data Persistence"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 5
sequence: 5
---

## Storage & Data Persistence

Every real Android app needs to persist data. These questions cover the right tool for each storage need and the common pitfalls.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the main options for persisting data on Android, and when would you use each?

Android has several persistence options:
- **SharedPreferences / DataStore** — for simple key-value pairs like user settings or feature flags.
- **Room (SQLite)** — for structured, relational data like user profiles, transactions, or cached API responses.
- **File storage** — for large binary files like images, audio, or downloads using internal or external storage.
- **Content Provider** — for sharing structured data between apps like contacts or media store.

If your data has relationships or you need to query it, use a database, not key-value storage.

#### Q2: What is SharedPreferences and how does it work internally?

SharedPreferences stores key-value pairs of primitive types (String, Int, Float, Long, Boolean, Set<String>) in an XML file at `/data/data/<package>/shared_prefs/`. On first access, the entire XML file is parsed and loaded into an in-memory HashMap. Every read after that comes from memory. Writes go through an Editor — `commit()` writes synchronously to disk and returns a boolean, while `apply()` writes to memory immediately and schedules the disk write in the background.

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

Always use `apply()` unless you need confirmation that the write succeeded. Calling `commit()` on the main thread blocks the UI. Also, SharedPreferences loads the entire file into memory, so a large file can cause delay on app startup.

#### Q3: What are the problems with SharedPreferences that led to DataStore?

SharedPreferences has several known issues:
- `commit()` is synchronous — calling it on the main thread can cause ANR.
- `apply()` can also cause ANRs because the framework calls `QueuedWork.waitToFinish()` in `Activity.onPause()` and `Service.onStartCommand()`, blocking the main thread until all pending writes complete.
- No error signaling — `apply()` silently swallows failures.
- Not type-safe — you can write a String and accidentally read it as an Int.
- Not safe for multi-process access — `MODE_MULTI_PROCESS` was deprecated because it never worked reliably.

The ANR from `apply()` during `onPause()` is one of the most common ANR causes in production apps.

#### Q4: What is Jetpack DataStore and how does it differ from SharedPreferences?

DataStore is the Jetpack replacement for SharedPreferences and comes in two flavors. Preferences DataStore stores key-value pairs but exposes data through Kotlin Flow, so reads are reactive and asynchronous. Proto DataStore stores typed objects defined with Protocol Buffers for full type safety. Both are built on coroutines and Flow, so all I/O happens off the main thread by default. DataStore handles errors through Flow's exception handling and provides a migration path from SharedPreferences via `SharedPreferencesMigration`.

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

Key differences: DataStore is fully asynchronous (Flow-based), handles errors explicitly, guarantees atomic reads and writes within `edit()`, and the Proto variant gives compile-time type safety.

#### Q5: What are the three main components of Room, and how do they work together?

Room has three core components:
- **@Entity** — defines a database table where each field becomes a column.
- **@Dao** (Data Access Object) — defines operations like queries, inserts, updates, and deletes.
- **@Database** — the holder class that extends `RoomDatabase`, ties everything together, and serves as the main access point.

Room validates all SQL queries at compile time, so you catch typos and schema mismatches before the app runs.

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

`getArticles()` returns `Flow<List<ArticleEntity>>` — Room automatically re-emits whenever the table changes. The `suspend` functions ensure operations run off the main thread. Room enforces this — running a database operation on the main thread throws an `IllegalStateException` by default.

#### Q6: What is the difference between internal storage and external storage on Android?

Internal storage is private to your app. Files are stored at `/data/data/<package>/files/`, no other app can access them, no permissions needed, and files are deleted on uninstall. Access it with `context.filesDir`.

External storage historically meant the SD card, but on modern devices it refers to shared storage. App-specific external storage (`context.getExternalFilesDir()`) also requires no permissions and gets cleaned up on uninstall. Shared external storage (photos, downloads, documents visible to other apps) is where scoped storage rules apply.

#### Q7: What is scoped storage, and why did Google introduce it?

Before Android 10, any app with `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` permissions could read and write any file on shared external storage. This was a massive privacy concern — any app could access your photos and documents.

Scoped storage was introduced in Android 10 and enforced from Android 11. Each app gets its own sandboxed directory on external storage that requires no permissions. To access shared media, you use the `MediaStore` API. To let users pick files, you use the Storage Access Framework (SAF) with `Intent.ACTION_OPEN_DOCUMENT`. You can no longer directly access another app's files.

#### Q8: How do you share files securely between apps?

Sharing a `file://` URI throws a `FileUriExposedException` from Android 7.0 (API 24). The correct approach is to use `FileProvider`, which generates a `content://` URI that grants temporary access to the receiving app. You declare the FileProvider in your manifest, specify shareable directories in an XML resource, and use `FileProvider.getUriForFile()` to generate the URI.

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

`FLAG_GRANT_READ_URI_PERMISSION` is required — without it, the receiving app can't read the file. The access is temporary and gets revoked automatically.

#### Q9: What is a Content Provider and when would you use one?

Content Provider manages access to structured data using a URI-based pattern (`content://authority/path`). The system's Contacts, MediaStore, and Calendar all expose data through Content Providers. You interact with them through `ContentResolver` using standard CRUD operations — `query()`, `insert()`, `update()`, `delete()`.

You can also create your own Content Provider to share data with other apps. A valid use case within the same app is abstracting data access for widgets or search integration, which access data through Content Providers by design.

### Deep Dive Questions (Advanced → Expert)

#### Q10: How do Room database migrations work, and what happens if you get them wrong?

When you change your database schema, you must increment the version number in `@Database` and provide a `Migration` object that tells Room how to transform the old schema into the new one. Each Migration specifies a start and end version. Room chains them together — going from version 1 to 3, Room runs Migration(1,2) then Migration(2,3), or Migration(1,3) directly if defined.

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

If you forget a migration, Room crashes with an `IllegalStateException` on the first database access. You can use `fallbackToDestructiveMigration()` during development which drops all tables and recreates them, but never use this in production because users lose all their data. Room does not handle schema changes automatically — you write the SQL migrations yourself. Also, SQLite's `ALTER TABLE` is limited — you can add columns, but can't drop or rename columns (before SQLite 3.35.0 / API 34). For those operations, you create a new table, copy data, drop the old table, and rename.

#### Q11: How do you handle custom types in Room with @TypeConverter?

Room only supports primitive types and a few built-in types by default. For fields like `Date`, `List<String>`, or custom enums, you need a `@TypeConverter` to tell Room how to convert it to and from a type SQLite understands.

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

Storing a `List<String>` as a comma-separated string breaks if the strings contain commas. For complex types, serialize to JSON using kotlinx.serialization or Moshi. If you need to query by individual list items, model it as a separate table with a one-to-many relationship instead.

#### Q12: How do you model relationships in Room (one-to-many, many-to-many)?

Room uses `@Embedded` and `@Relation` annotations instead of traditional ORM-style lazy loading. For a one-to-many relationship, you create a data class that combines the parent entity with a list of child entities.

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

For many-to-many relationships, you need a junction table. Define a cross-reference entity and use `@Junction` in the `@Relation` annotation. The `@Transaction` annotation is critical — Room runs one query for the parent and a second for the children, so without `@Transaction`, the data could be inconsistent if a write happens between those two queries.

#### Q13: What are database indexes in Room, and when should you use them?

An index creates a separate data structure (typically a B-tree in SQLite) that speeds up queries filtering or sorting on that column. Without an index, SQLite does a full table scan. With an index, it jumps directly to matching rows.

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

Indexes speed up reads but slow down writes because every insert, update, or delete also has to update the index. For read-heavy tables like cached API responses, indexes are almost always worth it. For write-heavy tables like analytics logs, be selective. Composite indexes only help queries that filter on columns in the same order — an index on `[title, author]` helps `WHERE title = ? AND author = ?` but not `WHERE author = ?` alone.

#### Q14: How does EncryptedSharedPreferences work, and when should you use it?

EncryptedSharedPreferences is part of the AndroidX Security library. It wraps the standard SharedPreferences API but encrypts both keys and values before writing to disk. Keys are encrypted with AES256-SIV (deterministic, needed for lookup). Values are encrypted with AES256-GCM (includes authentication to detect tampering). The encryption keys are managed through Android's Keystore system using a `MasterKey`.

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

Use it for sensitive data like auth tokens, session keys, or API credentials. Don't use it for everything — encryption adds overhead to every read and write. For cryptographic keys themselves, use the Android Keystore directly.

#### Q15: What is the @Transaction annotation in Room, and why does it matter?

`@Transaction` ensures that all database operations within a method execute atomically — either all succeed or all are rolled back. It's critical in two cases: when doing multiple writes that must be consistent (like transferring money between accounts), and when reading related data using `@Relation` because Room runs multiple queries internally.

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

Room wraps `@Transaction` methods in SQLite's `BEGIN TRANSACTION` and `END TRANSACTION`. If an exception is thrown, the entire transaction is rolled back. Without this, a crash after `debitAccount()` but before `creditAccount()` would leave money debited but never credited.

#### Q16: How does Room enforce main-thread safety, and can you override it?

Room throws an `IllegalStateException` if you run any database operation on the main thread. It checks `Looper.myLooper() == Looper.getMainLooper()` at runtime. You can bypass this with `allowMainThreadQueries()` on the builder, but you should never do this in production.

The proper approach is to use `suspend` functions in your DAO for one-shot operations and `Flow` for observable queries. Room automatically dispatches suspend functions to a background thread using its own executor.

#### Q17: How would you choose between SharedPreferences, DataStore, Room, and file storage for a given feature?

- **User preferences** (theme, language, notification settings) — use DataStore (Preferences). It's async and safe for simple key-value pairs.
- **Structured, queryable data** (users, messages, transactions, cached API responses) — use Room. You need relationships, indexes, and query capabilities.
- **Large files** (images, PDFs, audio, video) — use file storage. Internal storage for private files, scoped storage APIs for shared media.
- **Sensitive credentials** (tokens, API keys) — use EncryptedSharedPreferences or Android Keystore for cryptographic keys.
- **Typed configuration objects** — Proto DataStore with Protocol Buffers.

If you're storing three boolean flags, you don't need Room. If you're storing 500 items with relationships, you don't want SharedPreferences.

#### Q18: What happens under the hood when you call SharedPreferences.edit().apply()?

When you call `apply()`, SharedPreferences writes the changes to the in-memory HashMap immediately so any subsequent read sees the new values. Then it schedules an async disk write on a background thread. The write goes to a temporary file first, then renames it atomically.

The important part: `apply()` adds the pending write to `QueuedWork`. When lifecycle methods like `Activity.onStop()`, `Service.onStartCommand()`, or `BroadcastReceiver.onReceive()` run, the framework calls `QueuedWork.waitToFinish()`, which blocks the main thread until all pending writes complete. If you've called `apply()` many times or the disk is slow, this causes an ANR. This is one of the main reasons Google built DataStore.

#### Q19: Explain the difference between Preferences DataStore and Proto DataStore. When would you choose each?

Preferences DataStore is a drop-in replacement for SharedPreferences — stores key-value pairs with typed keys, exposes data through Flow, good for simple settings. Proto DataStore uses Protocol Buffers to define a schema, giving you full type safety, default values, and structured objects.

Choose Preferences DataStore when your data is flat key-value pairs and you want a quick migration from SharedPreferences. Choose Proto DataStore when your settings have structure (nested objects, lists, enums) or type safety is critical. Proto DataStore requires setting up the protobuf Gradle plugin and `.proto` files, which adds build complexity. For most apps with a simple settings screen, Preferences DataStore is enough.

#### Q20: How does Room's compile-time SQL verification work?

Room uses an annotation processor (KSP or KAPT) that runs during compilation. It parses the SQL strings in your `@Query` annotations, validates them against `@Entity` definitions, and checks that column names exist, types match, and the query is syntactically valid. It also verifies that the DAO method's return type matches the query result.

Room generates implementation classes during compilation — classes like `ArticleDao_Impl` that contain the actual SQLite calls with prepared statements and cursor management. This means zero runtime reflection overhead since everything is generated code.

#### Q21: What is the Storage Access Framework (SAF), and how do you use it?

SAF provides a system-level file picker UI that lets users choose files from any document provider — local storage, Google Drive, Dropbox, etc. You launch an intent with `ACTION_OPEN_DOCUMENT` or `ACTION_CREATE_DOCUMENT`, the user picks a file, and you get back a `content://` URI. This URI can be persisted using `takePersistableUriPermission()` so your app retains access across reboots.

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

Without `takePersistableUriPermission()`, the URI permission is temporary and expires when the user's task ends. With it, your app can reopen the file later without asking the user again.

#### Q22: How do you handle database testing with Room?

Room provides an in-memory database builder for testing. This database lives in RAM, runs fast, and is destroyed when the test finishes.

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

`allowMainThreadQueries()` is fine in tests since there's no UI thread to block. For migration testing, Room provides `MigrationTestHelper` which lets you create a database at version N, run your migration, and verify the schema at version N+1.

#### Q23: How do you encrypt a Room database, and when would you need to?

Room uses SQLite under the hood, and SQLite databases are stored as plain files on disk. Anyone with root access or a device backup can read them. For apps handling sensitive data like health records, financial transactions, or private messages, you need database-level encryption. The standard solution is **SQLCipher**, which provides transparent 256-bit AES encryption for SQLite.

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

The passphrase should come from Android Keystore — generate an AES key, use it to encrypt a random passphrase, and store the encrypted passphrase in SharedPreferences. When opening the database, decrypt the passphrase using the Keystore key. SQLCipher adds roughly 5-15% overhead on operations and about 3-4MB to APK size. Only use it for genuinely sensitive data.

#### Q24: What is the difference between `commit()` and `apply()` in SharedPreferences, and what's the hidden gotcha with `apply()`?

`commit()` writes to disk synchronously and returns a boolean indicating success. `apply()` writes to the in-memory map immediately but schedules the disk write asynchronously — it returns right away.

The hidden gotcha: the framework calls `QueuedWork.waitToFinish()` in `Activity.onPause()`, `Activity.onStop()`, `BroadcastReceiver.onReceive()`, and `Service.onStartCommand()`. This blocks the main thread until all pending `apply()` writes complete. If you call `apply()` many times or write large data, the queued writes pile up and cause an ANR when the Activity pauses. This is one of the main reasons Google created DataStore.

### Common Follow-ups

- **Two processes accessing the same SharedPreferences?** — It's unreliable. `MODE_MULTI_PROCESS` was deprecated because it doesn't guarantee consistency. Use DataStore or ContentProvider for multi-process access.
- **Migrating from SharedPreferences to DataStore?** — DataStore provides `SharedPreferencesMigration` that reads the old file, moves data to DataStore, and deletes the old file.
- **Maximum size of SharedPreferences?** — No hard limit, but the entire file loads into memory. Anything above a few hundred KB causes noticeable startup latency.
- **Room with pre-populated databases?** — Use `createFromAsset()` or `createFromFile()` on the database builder to ship a pre-built database with your APK.
- **How DataStore handles errors?** — Through Flow's `catch` operator. If a read or write fails, the exception propagates through the Flow.
- **`getFilesDir()` vs `getExternalFilesDir()`?** — `getFilesDir()` returns private internal storage. `getExternalFilesDir()` returns app-specific external storage. Both are private and cleaned up on uninstall, but external storage may be removable.
- **Observing database changes reactively in Room?** — Return `Flow<List<T>>` or `LiveData<List<T>>` from your DAO. Room uses InvalidationTracker to monitor table changes and re-execute the query.
- **`fallbackToDestructiveMigration()` in production?** — It drops all tables and recreates the database. Users lose all local data. Only acceptable during development.
