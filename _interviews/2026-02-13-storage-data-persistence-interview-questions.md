---
title: "Storage & Data Persistence"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 9
sequence: 9
description: "Every real Android app needs to persist data. These questions cover the right tool for each storage need and the common pitfalls."
---

## Storage & Data Persistence

Every real Android app needs to persist data. These questions cover the right tool for each storage need and the common pitfalls.

#### What are the main options for persisting data on Android?

Android gives you several options depending on the type of data:

- **SharedPreferences / DataStore** — simple key-value pairs like user settings or feature flags
- **Room (SQLite)** — structured, relational data like user profiles, transactions, or cached API responses
- **File storage** — large binary files like images, audio, or downloads
- **Content Provider** — sharing structured data between apps like contacts or media

If your data has relationships or you need to query it, use a database. If it's a few flags or settings, key-value storage is fine.

#### What is SharedPreferences and how does it work internally?

SharedPreferences stores key-value pairs in an XML file at `/data/data/<package>/shared_prefs/`. It supports primitive types — String, Int, Float, Long, Boolean, and Set<String>. On first access, the entire XML file is parsed into an in-memory HashMap. Every read after that comes from memory.

Writes go through an Editor. `commit()` writes synchronously to disk and returns a boolean. `apply()` writes to memory immediately and schedules the disk write in the background.

```kotlin
val prefs = context.getSharedPreferences("user_settings", Context.MODE_PRIVATE)

val isDarkMode = prefs.getBoolean("dark_mode", false)

prefs.edit()
    .putBoolean("dark_mode", true)
    .putString("username", "mukul_jangra")
    .apply()
```

Always use `apply()` unless you need confirmation that the write succeeded. The entire file loads into memory, so a large file can slow down app startup.

#### What is the difference between commit() and apply() in SharedPreferences?

`commit()` writes to disk synchronously on the calling thread and returns a boolean. `apply()` writes to the in-memory map immediately but schedules the disk write asynchronously.

The gotcha with `apply()`: the framework calls `QueuedWork.waitToFinish()` in `Activity.onPause()`, `Activity.onStop()`, `BroadcastReceiver.onReceive()`, and `Service.onStartCommand()`. This blocks the main thread until all pending `apply()` writes finish. If you call `apply()` many times or write large data, the queued writes pile up and cause an ANR when the Activity pauses. This is one of the main reasons Google created DataStore.

#### What are the problems with SharedPreferences that led to DataStore?

SharedPreferences has several known issues:

- `commit()` on the main thread can cause ANR
- `apply()` can also cause ANRs because the framework blocks on pending writes during lifecycle transitions
- No error signaling — `apply()` silently swallows failures
- Not type-safe — you can write a String and accidentally read it as an Int
- Not safe for multi-process access — `MODE_MULTI_PROCESS` was deprecated because it never worked reliably

The ANR from `apply()` during `onPause()` is one of the most common ANR causes in production apps.

#### What is Jetpack DataStore and how does it differ from SharedPreferences?

DataStore is the Jetpack replacement for SharedPreferences. It comes in two flavors. Preferences DataStore stores key-value pairs but exposes data through Kotlin Flow, so reads are reactive and asynchronous. Proto DataStore stores typed objects defined with Protocol Buffers for full type safety. Both use coroutines, so all I/O happens off the main thread by default.

```kotlin
val Context.settingsDataStore by preferencesDataStore(name = "settings")

val DARK_MODE_KEY = booleanPreferencesKey("dark_mode")

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

suspend fun setDarkMode(enabled: Boolean) {
    context.settingsDataStore.edit { preferences ->
        preferences[DARK_MODE_KEY] = enabled
    }
}
```

DataStore is fully asynchronous, handles errors explicitly through Flow, guarantees atomic reads and writes within `edit()`, and provides a migration path from SharedPreferences via `SharedPreferencesMigration`.

#### What is the difference between Preferences DataStore and Proto DataStore?

Preferences DataStore is a drop-in replacement for SharedPreferences. It stores key-value pairs with typed keys and exposes data through Flow. Proto DataStore uses Protocol Buffers to define a schema, giving you compile-time type safety, default values, and structured objects.

Use Preferences DataStore when your data is flat key-value pairs. Use Proto DataStore when your settings have structure — nested objects, lists, or enums. Proto DataStore requires the protobuf Gradle plugin and `.proto` files, which adds build complexity. For most apps with a simple settings screen, Preferences DataStore is enough.

#### How would you choose between SharedPreferences, DataStore, Room, and file storage?

- **User preferences** (theme, language, notification settings) — DataStore. It's async and safe for simple key-value pairs
- **Structured, queryable data** (users, messages, transactions, cached responses) — Room. You need relationships, indexes, and query capabilities
- **Large files** (images, PDFs, audio, video) — file storage. Internal storage for private files, scoped storage APIs for shared media
- **Sensitive credentials** (tokens, API keys) — EncryptedSharedPreferences or Android Keystore
- **Typed configuration objects** — Proto DataStore with Protocol Buffers

If I'm storing three boolean flags, I don't need Room. If I'm storing 500 items with relationships, I don't want SharedPreferences.

#### What are the three main components of Room?

Room has three core components:

- **@Entity** — defines a database table. Each field becomes a column
- **@Dao** (Data Access Object) — defines operations like queries, inserts, updates, and deletes
- **@Database** — the holder class that extends `RoomDatabase` and serves as the main access point

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
}

@Database(entities = [ArticleEntity::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun articleDao(): ArticleDao
}
```

Returning `Flow` from a DAO method makes it reactive — Room re-emits whenever the table changes. The `suspend` functions run off the main thread automatically. Running a database operation on the main thread throws an `IllegalStateException` by default.

#### How does Room enforce main-thread safety?

Room throws an `IllegalStateException` if you run any database operation on the main thread. It checks `Looper.myLooper() == Looper.getMainLooper()` at runtime. You can bypass this with `allowMainThreadQueries()` on the builder, but you should never do this in production.

The proper approach is to use `suspend` functions in your DAO for one-shot operations and `Flow` for observable queries. Room dispatches suspend functions to a background thread using its own executor.

#### How do Room database migrations work?

When you change your database schema, you increment the version number in `@Database` and provide a `Migration` object. Each Migration specifies a start and end version. Room chains them — going from version 1 to 3, Room runs Migration(1,2) then Migration(2,3), or Migration(1,3) directly if defined.

```kotlin
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE articles ADD COLUMN category TEXT DEFAULT ''")
    }
}

val database = Room.databaseBuilder(context, AppDatabase::class.java, "app_db")
    .addMigrations(MIGRATION_1_2)
    .build()
```

If you forget a migration, Room crashes with an `IllegalStateException` on first database access. `fallbackToDestructiveMigration()` drops all tables and recreates them — fine for development, never for production. SQLite's `ALTER TABLE` is limited — you can add columns but can't drop or rename them before SQLite 3.35.0 (API 34). For those, you create a new table, copy data, drop the old one, and rename.

#### What is the @Transaction annotation in Room?

`@Transaction` ensures that all database operations within a method execute atomically. Either all succeed or all roll back. It's critical in two cases: multiple writes that must be consistent, and reads using `@Relation` where Room runs multiple queries internally.

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

Room wraps it in SQLite's `BEGIN TRANSACTION` and `END TRANSACTION`. If an exception is thrown, the entire transaction rolls back. Without this, a crash after `debitAccount()` but before `creditAccount()` would leave money debited but never credited.

#### How do you handle custom types in Room with TypeConverter?

Room only supports primitive types by default. For fields like `Date`, `List<String>`, or custom enums, you write a `@TypeConverter` that converts to and from a type SQLite understands.

```kotlin
class Converters {
    @TypeConverter
    fun fromTimestamp(value: Long?): Date? = value?.let { Date(it) }

    @TypeConverter
    fun dateToTimestamp(date: Date?): Long? = date?.time
}

@Database(entities = [ArticleEntity::class], version = 1)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun articleDao(): ArticleDao
}
```

Be careful with storing lists as comma-separated strings — it breaks if the strings themselves contain commas. For complex types, serialize to JSON. If you need to query by individual items in a list, model it as a separate table with a one-to-many relationship instead.

#### How do you model relationships in Room?

Room uses `@Embedded` and `@Relation` annotations. For a one-to-many relationship, you create a data class that combines the parent entity with a list of children.

```kotlin
data class AuthorWithArticles(
    @Embedded val author: AuthorEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "author_id"
    )
    val articles: List<ArticleEntity>
)

@Transaction
@Query("SELECT * FROM authors WHERE id = :authorId")
suspend fun getAuthorWithArticles(authorId: Long): AuthorWithArticles
```

For many-to-many, you need a junction table and the `@Junction` annotation. The `@Transaction` is critical here because Room runs one query for the parent and a second for the children. Without it, data could be inconsistent if a write happens between those two queries.

#### What is the difference between internal storage and external storage?

Internal storage is private to your app. Files go to `/data/data/<package>/files/`. No other app can access them, no permissions needed, and they're deleted on uninstall. Access it with `context.filesDir`.

External storage historically meant the SD card, but on modern devices it refers to shared storage. App-specific external storage (`context.getExternalFilesDir()`) also needs no permissions and gets cleaned up on uninstall. Shared external storage — photos, downloads, documents visible to other apps — is where scoped storage rules apply.

#### What is scoped storage?

Before Android 10, any app with `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` could read and write any file on shared external storage. This was a privacy problem — any app could access your photos and documents.

Scoped storage was introduced in Android 10 and enforced from Android 11. Each app gets its own sandboxed directory on external storage. No permissions needed for that directory. To access shared media, you use `MediaStore`. To let users pick files, you use the Storage Access Framework with `Intent.ACTION_OPEN_DOCUMENT`. You can no longer directly access another app's files.

#### How do you share files between apps?

Sharing a `file://` URI throws `FileUriExposedException` from Android 7.0. The correct approach is `FileProvider`, which generates a `content://` URI that grants temporary access to the receiving app.

```kotlin
val photoFile = File(context.filesDir, "profile_photo.jpg")
val photoUri: Uri = FileProvider.getUriForFile(
    context,
    "${context.packageName}.fileprovider",
    photoFile
)

val shareIntent = Intent(Intent.ACTION_SEND).apply {
    type = "image/jpeg"
    putExtra(Intent.EXTRA_STREAM, photoUri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
context.startActivity(Intent.createChooser(shareIntent, "Share photo"))
```

You declare FileProvider in your manifest, specify shareable directories in an XML resource, and use `FileProvider.getUriForFile()` to generate the URI. `FLAG_GRANT_READ_URI_PERMISSION` is required — without it, the receiving app can't read the file. The access is temporary and gets revoked automatically.

#### What is a Content Provider?

Content Provider manages access to structured data using a URI-based pattern (`content://authority/path`). The system's Contacts, MediaStore, and Calendar all use Content Providers. You interact with them through `ContentResolver` using CRUD operations — `query()`, `insert()`, `update()`, `delete()`.

You can also create your own Content Provider to share data with other apps. Within the same app, Content Providers are useful for widgets and search integration, which access data through Content Providers by design.

#### How does EncryptedSharedPreferences work?

EncryptedSharedPreferences wraps the standard SharedPreferences API but encrypts both keys and values before writing to disk. Keys are encrypted with AES256-SIV. Values are encrypted with AES256-GCM. The encryption keys are managed through Android Keystore using a `MasterKey`.

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

encryptedPrefs.edit()
    .putString("auth_token", "eyJhbGciOiJIUzI1NiJ9...")
    .apply()
```

Use it for sensitive data like auth tokens, session keys, or API credentials. Don't use it for everything — encryption adds overhead to every read and write. For cryptographic keys themselves, use the Android Keystore directly.

#### What are database indexes in Room?

An index is a data structure (B-tree in SQLite) that speeds up queries on a column. Without an index, SQLite scans the entire table. With one, it jumps directly to matching rows.

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

Indexes speed up reads but slow down writes because every insert, update, or delete also updates the index. For read-heavy tables like cached API responses, indexes are almost always worth it. Composite indexes only help queries that filter on columns in the same order — an index on `[title, author]` helps `WHERE title = ? AND author = ?` but not `WHERE author = ?` alone.

#### How does Room's compile-time SQL verification work?

Room uses an annotation processor (KSP or KAPT) that runs during compilation. It parses the SQL strings in `@Query` annotations, validates them against `@Entity` definitions, checks that column names exist and types match. It also verifies that the DAO method's return type matches the query result.

Room generates implementation classes like `ArticleDao_Impl` that contain the actual SQLite calls with prepared statements and cursor management. No runtime reflection — everything is generated code.

#### What is Write-Ahead Logging (WAL) in SQLite?

WAL is a journaling mode where SQLite writes changes to a separate WAL file instead of modifying the main database file directly. The main advantage is concurrency — readers and writers can operate at the same time. Without WAL, a write locks the entire database and blocks all reads.

Room enables WAL by default on API 16+. The WAL file gets periodically checkpointed back to the main database. You'll see `.db-wal` and `.db-shm` files alongside your database file. One downside is WAL uses more disk space because the WAL file grows until checkpoint. For most Android apps, which are read-heavy, WAL is a clear win.

#### How do you test Room databases?

Room provides an in-memory database builder for testing. It lives in RAM, runs fast, and gets destroyed when the test finishes.

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

`allowMainThreadQueries()` is fine in tests since there's no UI thread to block. For migration testing, Room provides `MigrationTestHelper` to create a database at version N, run the migration, and verify the schema at version N+1.

#### What is the Storage Access Framework (SAF)?

SAF provides a system file picker that lets users choose files from any document provider — local storage, Google Drive, Dropbox, etc. You launch an intent with `ACTION_OPEN_DOCUMENT` or `ACTION_CREATE_DOCUMENT`, the user picks a file, and you get back a `content://` URI.

```kotlin
val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
    addCategory(Intent.CATEGORY_OPENABLE)
    type = "application/pdf"
}
documentPickerLauncher.launch(intent)
```

You can persist the URI permission using `takePersistableUriPermission()` so your app retains access across reboots. Without it, the permission is temporary and expires when the user's task ends.

#### When should you normalize vs denormalize a database schema?

Normalization means splitting data into separate tables to avoid duplication. Denormalization means duplicating data across tables for faster reads — like storing a user's name directly in the `orders` table to avoid a JOIN.

On mobile, I lean toward denormalization more than on servers because:

- JOINs on SQLite are slower than on server databases
- Mobile apps are read-heavy — you display data far more often than you write it
- Simpler queries mean fewer bugs

But don't go fully denormalized. Normalize core entities (users, products, orders) and denormalize the display data you query frequently. The tradeoff is always read speed vs write complexity — every duplicated field needs to be updated in multiple places.

### Common Follow-ups

- **Two processes accessing the same SharedPreferences?** — It's unreliable. `MODE_MULTI_PROCESS` was deprecated because it doesn't guarantee consistency. Use DataStore or ContentProvider for multi-process access.
- **Migrating from SharedPreferences to DataStore?** — DataStore provides `SharedPreferencesMigration` that reads the old file, moves data to DataStore, and deletes the old file.
- **Maximum size of SharedPreferences?** — No hard limit, but the entire file loads into memory. Anything above a few hundred KB causes noticeable startup latency.
- **Room with pre-populated databases?** — Use `createFromAsset()` or `createFromFile()` on the database builder to ship a pre-built database with your APK.
- **How DataStore handles errors?** — Through Flow's `catch` operator. If a read or write fails, the exception propagates through the Flow.
- **`getFilesDir()` vs `getExternalFilesDir()`?** — `getFilesDir()` returns private internal storage. `getExternalFilesDir()` returns app-specific external storage. Both are private and cleaned up on uninstall, but external storage may be removable.
- **Observing database changes reactively in Room?** — Return `Flow<List<T>>` or `LiveData<List<T>>` from your DAO. Room uses InvalidationTracker to monitor table changes and re-execute the query.
- **`fallbackToDestructiveMigration()` in production?** — It drops all tables and recreates the database. Users lose all local data. Only acceptable during development.
