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

Think of it like organizing your house. Some stuff goes in a junk drawer (quick access, small items), some goes in a filing cabinet (organized, searchable), and some goes in the garage (big, bulky things).

- **SharedPreferences / DataStore** -- your junk drawer. Simple key-value pairs like user settings or feature flags
- **Room (SQLite)** -- the filing cabinet. Structured, relational data like user profiles, transactions, or cached API responses
- **File storage** -- the garage. Large binary files like images, audio, or downloads
- **Content Provider** -- the mailbox. Sharing structured data between apps like contacts or media

If your data has relationships or you need to query it, use a database. If it's a few flags or settings, key-value storage is fine. Picking the wrong tool here is like storing your tax documents in the junk drawer -- technically possible, but you'll regret it.

#### What is SharedPreferences and how does it work internally?

SharedPreferences is Android's original "quick and dirty" key-value store. Under the hood, it's literally an XML file sitting at `/data/data/<package>/shared_prefs/`. It supports primitive types -- String, Int, Float, Long, Boolean, and Set<String>. Here's the part most people don't realize: on first access, the entire XML file gets parsed into an in-memory HashMap. Every read after that comes straight from memory, which is why reads feel instant.

Writes go through an Editor. `commit()` writes synchronously to disk and returns a boolean. `apply()` writes to memory immediately and schedules the disk write in the background.

```kotlin
val prefs = context.getSharedPreferences("user_settings", Context.MODE_PRIVATE)

val isDarkMode = prefs.getBoolean("dark_mode", false)

prefs.edit()
    .putBoolean("dark_mode", true)
    .putString("username", "mukul_jangra")
    .apply()
```

Always use `apply()` unless you need confirmation that the write succeeded. And since the entire file loads into memory, a large file can slow down app startup -- imagine loading a dictionary when all you needed was one word.

#### What is the difference between commit() and apply() in SharedPreferences?

`commit()` writes to disk synchronously on the calling thread and returns a boolean -- like handing someone a letter and waiting until they confirm they've read it. `apply()` writes to the in-memory map immediately but schedules the disk write asynchronously -- like dropping the letter in a mailbox and walking away.

Now here's where it gets interesting. The gotcha with `apply()` is sneaky: the framework calls `QueuedWork.waitToFinish()` in `Activity.onPause()`, `Activity.onStop()`, `BroadcastReceiver.onReceive()`, and `Service.onStartCommand()`. This blocks the main thread until all pending `apply()` writes finish. So if you've been happily calling `apply()` a bunch of times, those queued writes pile up and cause an ANR when the Activity pauses. This one bites everyone at least once -- and it's one of the main reasons Google created DataStore.

#### What are the problems with SharedPreferences that led to DataStore?

SharedPreferences has been around since API 1, and it shows its age. Here's the rap sheet:

- `commit()` on the main thread can cause ANR
- `apply()` can *also* cause ANRs because the framework blocks on pending writes during lifecycle transitions
- No error signaling -- `apply()` silently swallows failures. Your write failed? Too bad, nobody knows
- Not type-safe -- you can write a String and accidentally read it as an Int
- Not safe for multi-process access -- `MODE_MULTI_PROCESS` was deprecated because it never worked reliably

The ANR from `apply()` during `onPause()` is one of the most common ANR causes in production apps. It's the kind of bug that doesn't show up in development but hammers you at scale.

#### What is Jetpack DataStore and how does it differ from SharedPreferences?

DataStore is basically Google saying "okay, we hear you, SharedPreferences has problems, here's a proper replacement." It comes in two flavors. Preferences DataStore stores key-value pairs but exposes data through Kotlin Flow, so reads are reactive and asynchronous. Proto DataStore stores typed objects defined with Protocol Buffers for full type safety. Both use coroutines, so all I/O happens off the main thread by default -- no more surprise ANRs.

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

DataStore is fully asynchronous, handles errors explicitly through Flow, guarantees atomic reads and writes within `edit()`, and provides a migration path from SharedPreferences via `SharedPreferencesMigration`. It's everything SharedPreferences should have been from the start.

> **🧠 Think about it:** If `apply()` is asynchronous and DataStore is also asynchronous, what's the actual difference that prevents ANRs? Hint: it's about *who* is doing the waiting.

#### What is the difference between Preferences DataStore and Proto DataStore?

Preferences DataStore is the "I just want my key-value pairs to work properly" option -- a drop-in replacement for SharedPreferences. It stores key-value pairs with typed keys and exposes data through Flow.

Proto DataStore is the "I need real structure" option. It uses Protocol Buffers to define a schema, giving you compile-time type safety, default values, and structured objects. Think of it like the difference between tossing items into a bag vs packing them into labeled compartments.

Use Preferences DataStore when your data is flat key-value pairs. Use Proto DataStore when your settings have structure -- nested objects, lists, or enums. Proto DataStore requires the protobuf Gradle plugin and `.proto` files, which adds build complexity. For most apps with a simple settings screen, Preferences DataStore is enough.

#### How would you choose between SharedPreferences, DataStore, Room, and file storage?

This is really about matching the tool to the job:

- **User preferences** (theme, language, notification settings) -- DataStore. It's async and safe for simple key-value pairs
- **Structured, queryable data** (users, messages, transactions, cached responses) -- Room. You need relationships, indexes, and query capabilities
- **Large files** (images, PDFs, audio, video) -- file storage. Internal storage for private files, scoped storage APIs for shared media
- **Sensitive credentials** (tokens, API keys) -- EncryptedSharedPreferences or Android Keystore
- **Typed configuration objects** -- Proto DataStore with Protocol Buffers

If I'm storing three boolean flags, I don't need Room. If I'm storing 500 items with relationships, I don't want SharedPreferences. It's like choosing between a sticky note and a spreadsheet -- both store information, but you wouldn't track your company's finances on a sticky note.

#### What are the three main components of Room?

Room is like a well-organized restaurant. You've got three roles:

- **@Entity** -- the menu. It defines a database table, and each field becomes a column
- **@Dao** (Data Access Object) -- the waiter. It defines operations like queries, inserts, updates, and deletes
- **@Database** -- the restaurant itself. The holder class that extends `RoomDatabase` and serves as the main access point

Room validates all SQL queries at compile time, so you catch typos and schema mismatches before the app even runs. No more discovering at 2 AM that you misspelled a column name.

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

Returning `Flow` from a DAO method makes it reactive -- Room re-emits whenever the table changes. The `suspend` functions run off the main thread automatically. Running a database operation on the main thread throws an `IllegalStateException` by default.

#### How does Room enforce main-thread safety?

Room is like a bouncer at a club -- it checks `Looper.myLooper() == Looper.getMainLooper()` at runtime, and if you try to run any database operation on the main thread, it throws an `IllegalStateException`. You can bypass this with `allowMainThreadQueries()` on the builder, but that's like bribing the bouncer. You can do it, but you should never do this in production.

The proper approach is to use `suspend` functions in your DAO for one-shot operations and `Flow` for observable queries. Room dispatches suspend functions to a background thread using its own executor, so you don't even need to think about threading.

#### How do Room database migrations work?

When you change your database schema, you increment the version number in `@Database` and provide a `Migration` object. Each Migration specifies a start and end version, like upgrade steps. Room chains them -- going from version 1 to 3, Room runs Migration(1,2) then Migration(2,3), or Migration(1,3) directly if you defined a shortcut.

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

If you forget a migration, Room crashes with an `IllegalStateException` on first database access. No mercy. `fallbackToDestructiveMigration()` drops all tables and recreates them -- fine for development, never for production unless you enjoy angry user reviews. And watch out: SQLite's `ALTER TABLE` is limited -- you can add columns but can't drop or rename them before SQLite 3.35.0 (API 34). For those, you have to do the four-step dance: create a new table, copy data, drop the old one, and rename.

#### What is the @Transaction annotation in Room?

`@Transaction` is your "all or nothing" guarantee. It ensures that all database operations within a method execute atomically -- either all succeed or all roll back. It's critical in two cases: multiple writes that must be consistent, and reads using `@Relation` where Room runs multiple queries internally.

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

Room wraps it in SQLite's `BEGIN TRANSACTION` and `END TRANSACTION`. If an exception is thrown, the entire transaction rolls back. Think about what happens without this: a crash after `debitAccount()` but before `creditAccount()` would leave money debited but never credited. Your users would notice that real fast.

> **🧠 Think about it:** Why does Room require `@Transaction` on queries that use `@Relation`? What could go wrong between the two internal queries if another write sneaks in?

#### How do you handle custom types in Room with TypeConverter?

Room only speaks primitive types by default. So when you show up with a `Date`, a `List<String>`, or a custom enum, Room looks at you like "I don't know what that is." You need a translator -- that's what `@TypeConverter` does. It converts your fancy types to and from something SQLite understands.

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

Be careful with storing lists as comma-separated strings -- it breaks if the strings themselves contain commas. For complex types, serialize to JSON. And if you need to query by individual items in a list, that's a sign you should model it as a separate table with a one-to-many relationship instead.

#### How do you model relationships in Room?

Room uses `@Embedded` and `@Relation` annotations. For a one-to-many relationship, you create a data class that combines the parent entity with a list of children -- like a folder that contains documents.

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

For many-to-many, you need a junction table and the `@Junction` annotation. The `@Transaction` is critical here because Room runs one query for the parent and a second for the children. Without it, data could be inconsistent if a write happens between those two queries -- it's like reading a bank statement while someone is mid-transfer.

#### What is the difference between internal storage and external storage?

Internal storage is your app's private room -- nobody else gets in. Files go to `/data/data/<package>/files/`. No other app can access them, no permissions needed, and they're deleted on uninstall. Access it with `context.filesDir`.

External storage historically meant the SD card, but on modern devices it refers to shared storage. App-specific external storage (`context.getExternalFilesDir()`) also needs no permissions and gets cleaned up on uninstall. Shared external storage -- photos, downloads, documents visible to other apps -- is where scoped storage rules kick in. The naming is confusing, I know. Just remember: "external" doesn't mean "public" anymore.

#### What is scoped storage?

Here's the thing -- before Android 10, any app with `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` could read and write any file on shared external storage. That flashlight app? Yeah, it could read your photos and documents. Not great.

Scoped storage fixed this. Introduced in Android 10 and enforced from Android 11, each app now gets its own sandboxed directory on external storage. No permissions needed for that directory. To access shared media, you use `MediaStore`. To let users pick files, you use the Storage Access Framework with `Intent.ACTION_OPEN_DOCUMENT`. You can no longer directly access another app's files. It's like going from "everyone has keys to every apartment" to "you only get keys to yours."

#### How do you share files between apps?

Sharing a `file://` URI throws `FileUriExposedException` from Android 7.0 -- Google put a hard stop to that. The correct approach is `FileProvider`, which generates a `content://` URI that grants temporary access to the receiving app. It's like giving someone a visitor pass instead of a copy of your house key.

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

You declare FileProvider in your manifest, specify shareable directories in an XML resource, and use `FileProvider.getUriForFile()` to generate the URI. `FLAG_GRANT_READ_URI_PERMISSION` is required -- without it, the receiving app can't read the file. The access is temporary and gets revoked automatically.

#### What is a Content Provider?

Content Provider is Android's way of letting apps share structured data through a standard interface. It uses a URI-based pattern (`content://authority/path`), kind of like a REST API but for local data. The system's Contacts, MediaStore, and Calendar all use Content Providers. You interact with them through `ContentResolver` using CRUD operations -- `query()`, `insert()`, `update()`, `delete()`.

You can also create your own Content Provider to share data with other apps. Within the same app, Content Providers are useful for widgets and search integration, which access data through Content Providers by design.

#### How does EncryptedSharedPreferences work?

EncryptedSharedPreferences wraps the standard SharedPreferences API but encrypts both keys and values before writing to disk -- so even if someone gets the file, they see gibberish. Keys are encrypted with AES256-SIV. Values are encrypted with AES256-GCM. The encryption keys are managed through Android Keystore using a `MasterKey`, which means the actual keys live in hardware-backed secure storage.

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

Use it for sensitive data like auth tokens, session keys, or API credentials. Don't use it for everything -- encryption adds overhead to every read and write. It's like putting a padlock on every drawer in your house. Some drawers need it, most don't. For cryptographic keys themselves, use the Android Keystore directly.

#### What are database indexes in Room?

An index is like the index at the back of a textbook. Without it, SQLite has to read every single row to find what you're looking for (full table scan). With an index (a B-tree in SQLite), it jumps directly to matching rows.

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

But wait -- indexes speed up reads but slow down writes because every insert, update, or delete also has to update the index. It's the classic read/write tradeoff. For read-heavy tables like cached API responses, indexes are almost always worth it. One gotcha: composite indexes only help queries that filter on columns in the same order -- an index on `[title, author]` helps `WHERE title = ? AND author = ?` but not `WHERE author = ?` alone. Column order matters.

#### How does Room's compile-time SQL verification work?

This is one of Room's best features. Room uses an annotation processor (KSP or KAPT) that runs during compilation. It parses the SQL strings in `@Query` annotations, validates them against your `@Entity` definitions, checks that column names exist and types match. It also verifies that the DAO method's return type matches the query result. Misspell a column name? The build fails. Return the wrong type? Build fails.

Room generates implementation classes like `ArticleDao_Impl` that contain the actual SQLite calls with prepared statements and cursor management. No runtime reflection -- everything is generated code. You get the safety of an ORM with the performance of hand-written SQLite.

> **🧠 Think about it:** If Room validates SQL at compile time, what happens when you run a raw `SupportSQLiteDatabase.execSQL()` call in a migration? Does Room catch errors there too?

#### What is Write-Ahead Logging (WAL) in SQLite?

Without WAL, SQLite is like a single-lane bridge -- if someone is writing, everyone else has to wait. WAL changes that. Instead of modifying the main database file directly, SQLite writes changes to a separate WAL file. The main advantage is concurrency -- readers and writers can operate at the same time because readers see the database as it was, while the writer appends to the WAL file.

Room enables WAL by default on API 16+. The WAL file gets periodically checkpointed back to the main database. You'll see `.db-wal` and `.db-shm` files alongside your database file. One downside is WAL uses more disk space because the WAL file grows until checkpoint. For most Android apps, which are read-heavy, WAL is a clear win.

#### How do you test Room databases?

Room provides an in-memory database builder for testing. It lives in RAM, runs fast, and gets destroyed when the test finishes -- like a whiteboard you erase after each meeting.

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

SAF is like a universal file picker. Instead of your app digging through the file system directly, it presents a system UI that lets users choose files from any document provider -- local storage, Google Drive, Dropbox, you name it. You launch an intent with `ACTION_OPEN_DOCUMENT` or `ACTION_CREATE_DOCUMENT`, the user picks a file, and you get back a `content://` URI.

```kotlin
val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
    addCategory(Intent.CATEGORY_OPENABLE)
    type = "application/pdf"
}
documentPickerLauncher.launch(intent)
```

You can persist the URI permission using `takePersistableUriPermission()` so your app retains access across reboots. Without it, the permission is temporary and expires when the user's task ends. Forgetting this call is a common source of "it worked yesterday, why can't I open the file today?" bugs.

#### When should you normalize vs denormalize a database schema?

Normalization means splitting data into separate tables to avoid duplication -- like having one address book instead of writing your friend's phone number on every letter you send them. Denormalization means duplicating data across tables for faster reads -- like storing a user's name directly in the `orders` table to avoid a JOIN.

On mobile, I lean toward denormalization more than on servers because:

- JOINs on SQLite are slower than on server databases
- Mobile apps are read-heavy -- you display data far more often than you write it
- Simpler queries mean fewer bugs

But don't go fully denormalized. Normalize core entities (users, products, orders) and denormalize the display data you query frequently. The tradeoff is always read speed vs write complexity -- every duplicated field needs to be updated in multiple places. It's like copying a meeting time into five different calendars. Fast to read, painful to update.

### Common Follow-ups

- **Two processes accessing the same SharedPreferences?** — It's unreliable. `MODE_MULTI_PROCESS` was deprecated because it doesn't guarantee consistency. Use DataStore or ContentProvider for multi-process access.
- **Migrating from SharedPreferences to DataStore?** — DataStore provides `SharedPreferencesMigration` that reads the old file, moves data to DataStore, and deletes the old file.
- **Maximum size of SharedPreferences?** — No hard limit, but the entire file loads into memory. Anything above a few hundred KB causes noticeable startup latency.
- **Room with pre-populated databases?** — Use `createFromAsset()` or `createFromFile()` on the database builder to ship a pre-built database with your APK.
- **How DataStore handles errors?** — Through Flow's `catch` operator. If a read or write fails, the exception propagates through the Flow.
- **`getFilesDir()` vs `getExternalFilesDir()`?** — `getFilesDir()` returns private internal storage. `getExternalFilesDir()` returns app-specific external storage. Both are private and cleaned up on uninstall, but external storage may be removable.
- **Observing database changes reactively in Room?** — Return `Flow<List<T>>` or `LiveData<List<T>>` from your DAO. Room uses InvalidationTracker to monitor table changes and re-execute the query.
- **`fallbackToDestructiveMigration()` in production?** — It drops all tables and recreates the database. Users lose all local data. Only acceptable during development.
