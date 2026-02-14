---
title: Room Database Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Kotlin
---

I still remember the days of writing raw SQLite queries in Android. You'd wrestle with `Cursor` objects, manually track column indices by counting on your fingers, and inevitably forget to close the database helper somewhere. It was like doing your taxes by hand every single time you wanted to save a piece of data. Every app needed local persistence, but the boilerplate was so brutal that developers either avoided databases entirely or wrapped everything in fragile homegrown abstractions that crumbled the moment the schema changed.

Room was Google's answer to all of that, and to me it's one of the most well-designed Jetpack libraries out there. Think of it this way: SQLite is the rock-solid engine under the hood — fast, reliable, battle-tested. Room is the nice dashboard and steering wheel that lets you actually drive the thing without hot-wiring it every time.

Here's where it gets interesting under the hood. Room is built on top of `SupportSQLiteDatabase` (an abstraction over Android's SQLite), and it generates the actual DAO implementation code at compile time using annotation processing. When you write a `@Query`, Room parses the SQL, validates it against your entity schema, generates all that tedious cursor-handling code, and wraps it in the proper threading semantics. All the misery of raw SQLite? Handled by the annotation processor at build time, not by you at runtime. You write the intent, Room writes the plumbing.

## Entities — Defining Your Schema

Imagine you're describing a spreadsheet to someone. "This sheet is called Orders. It has columns for order ID, customer name, total amount..." That's basically what an entity is. It's a Kotlin data class annotated with `@Entity` that maps to a database table. Each property becomes a column. Room is opinionated about primary keys — every entity needs one — and it supports composite keys, auto-generation, and column-level customization.

```kotlin
@Entity(tableName = "orders")
data class OrderEntity(
    @PrimaryKey
    val orderId: String,

    @ColumnInfo(name = "customer_name")
    val customerName: String,

    val totalAmount: Double,

    val status: OrderStatus,

    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
)

enum class OrderStatus {
    PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED
}
```

One thing worth knowing: Room stores each entity field as a column with a SQLite affinity. Kotlin `String` maps to TEXT, `Int` and `Long` map to INTEGER, `Double` maps to REAL. For types that SQLite doesn't understand natively — like `Date`, `Enum`, or custom objects — you need type converters, which I'll cover in a moment.

I tend to suffix my entity classes with `Entity` — `OrderEntity`, `UserEntity` — to keep them separate from domain models. Think of it like keeping your passport separate from your business card. Your entity is a database concern. Your domain model is a business concern. They often look similar, but keeping them separate means a schema change doesn't ripple through your business logic. This is a small architectural discipline that pays off enormously in larger projects.

## DAOs — Where Queries Live

The DAO (Data Access Object) is where you define your database operations. It's an interface annotated with `@Dao`, and Room generates the implementation at compile time. Here's the part that still feels a bit magical to me: Room parses your SQL at compile time and tells you about syntax errors, missing columns, and type mismatches before you even run the app. Imagine having a spell-checker, but for SQL queries, built right into your build process.

```kotlin
@Dao
interface OrderDao {

    @Query("SELECT * FROM orders WHERE orderId = :orderId")
    suspend fun getOrderById(orderId: String): OrderEntity?

    @Query("SELECT * FROM orders WHERE status = :status ORDER BY created_at DESC")
    fun getOrdersByStatus(status: OrderStatus): Flow<List<OrderEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrder(order: OrderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrders(orders: List<OrderEntity>)

    @Update
    suspend fun updateOrder(order: OrderEntity)

    @Delete
    suspend fun deleteOrder(order: OrderEntity)

    @Query("UPDATE orders SET status = :newStatus, updated_at = :updatedAt WHERE orderId = :orderId")
    suspend fun updateOrderStatus(
        orderId: String,
        newStatus: OrderStatus,
        updatedAt: Long = System.currentTimeMillis()
    )

    @Query("DELETE FROM orders WHERE status = :status")
    suspend fun deleteOrdersByStatus(status: OrderStatus)

    @Transaction
    @Query("SELECT * FROM orders WHERE orderId = :orderId")
    suspend fun getOrderWithItems(orderId: String): OrderWithItems?
}
```

A few things to note here. Those `suspend` functions tell Room to run the query on the calling coroutine's dispatcher — which should be `Dispatchers.IO` or a custom dispatcher, not `Dispatchers.Main`. Room will throw an exception if you try to run a suspend DAO function on the main thread. And honestly, that's exactly the behavior you want. It's like a guardrail on a mountain road — annoying until the day it saves you.

Now here's where it gets interesting. Returning `Flow<List<OrderEntity>>` makes the query reactive. Room will re-emit the entire list whenever the `orders` table changes — any insert, update, or delete triggers a new emission. Super convenient, but there's a tradeoff you should know about: Room doesn't do fine-grained change detection. If you update one order out of a thousand, every Flow observing the orders table gets re-emitted with the full list. For most apps this is fine, but if you have a table with frequent writes and multiple active observers, those re-emissions can add up.

## Type Converters — Bridging Kotlin and SQLite

SQLite only speaks a handful of languages natively: TEXT, INTEGER, REAL, BLOB, and NULL. That's it. It's like a vending machine that only accepts exact change. Anything else — dates, enums, lists, custom objects — needs a converter that tells Room how to translate back and forth between your Kotlin types and something SQLite can actually store.

```kotlin
class DatabaseConverters {

    @TypeConverter
    fun fromOrderStatus(status: OrderStatus): String {
        return status.name
    }

    @TypeConverter
    fun toOrderStatus(value: String): OrderStatus {
        return OrderStatus.valueOf(value)
    }

    @TypeConverter
    fun fromTimestamp(value: Long?): Date? {
        return value?.let { Date(it) }
    }

    @TypeConverter
    fun dateToTimestamp(date: Date?): Long? {
        return date?.time
    }

    @TypeConverter
    fun fromStringList(value: List<String>): String {
        return value.joinToString(",")
    }

    @TypeConverter
    fun toStringList(value: String): List<String> {
        return if (value.isEmpty()) emptyList()
        else value.split(",")
    }
}
```

Here's an opinion that might be unpopular: I store enums as strings, not ordinals. Storing by ordinal (`PENDING = 0, PROCESSING = 1`) is more compact, sure. But what happens if someone reorders the enum or inserts a new value in the middle? Every row in your database silently points to the wrong status. No crash, no warning — just quietly corrupted data. String storage is slightly larger but survives refactoring. On a production app with millions of rows and real users, data integrity matters more than a few bytes per row.

> **🔥 Real talk:** I've seen a production bug where an enum got reordered during a refactor and thousands of orders silently changed status. Nobody noticed for two days. Store enums as strings.

For lists and complex objects, I prefer flattening into separate tables with foreign keys rather than serializing into a single column. Serializing a `List<String>` into a comma-separated string works for simple cases, but it breaks querying — you can't do `WHERE tag = 'important'` on a serialized list. If you need to query by the nested data, normalize it into its own table.

## Relations — Modeling Connected Data

Room supports relationships between entities through `@Relation` annotations and embedding. The key abstraction is the "relation POJO" — a plain class that bundles a parent entity with its children. Think of it like a folder that holds a document (the parent) along with all its attachments (the children).

### One-to-Many With @Relation

```kotlin
@Entity(tableName = "order_items")
data class OrderItemEntity(
    @PrimaryKey(autoGenerate = true)
    val itemId: Long = 0,

    @ColumnInfo(name = "order_id")
    val orderId: String,

    val productName: String,
    val quantity: Int,
    val pricePerUnit: Double
)

data class OrderWithItems(
    @Embedded
    val order: OrderEntity,

    @Relation(
        parentColumn = "orderId",
        entityColumn = "order_id"
    )
    val items: List<OrderItemEntity>
)
```

`@Embedded` flattens the entity's columns into the parent. This is also useful on its own — if you have an `Address` data class that you want to store as columns inside a `Customer` table rather than as a separate table, `@Embedded` does that without needing a relation or a foreign key. It's like packing a smaller suitcase inside a bigger one instead of checking two bags.

```kotlin
data class Address(
    val street: String,
    val city: String,
    val zipCode: String
)

@Entity(tableName = "customers")
data class CustomerEntity(
    @PrimaryKey
    val customerId: String,
    val name: String,
    @Embedded(prefix = "shipping_")
    val shippingAddress: Address,
    @Embedded(prefix = "billing_")
    val billingAddress: Address
)
```

The `prefix` parameter on `@Embedded` is essential when you embed the same type twice — without it, Room would see duplicate column names (`street`, `city`, `zipCode` appearing twice) and fail at compile time. The prefix gives each set of columns a unique identity.

### Many-to-Many With @Junction

Many-to-many relationships require a junction table. A `Product` can be in many `Category` entries, and a `Category` can contain many `Product` entries. Room handles this with `@Junction`.

Can you picture it? It's like a school schedule board — students appear in many classes, and classes have many students. The junction table is the schedule board itself, mapping who belongs where.

```kotlin
@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey val productId: String,
    val name: String,
    val price: Double
)

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey val categoryId: String,
    val name: String
)

@Entity(
    tableName = "product_category_cross_ref",
    primaryKeys = ["productId", "categoryId"]
)
data class ProductCategoryCrossRef(
    val productId: String,
    val categoryId: String
)

data class CategoryWithProducts(
    @Embedded val category: CategoryEntity,
    @Relation(
        parentColumn = "categoryId",
        entityColumn = "productId",
        associateBy = Junction(ProductCategoryCrossRef::class)
    )
    val products: List<ProductEntity>
)
```

### Multimap Return Types

Since Room 2.4, you can return `Map` types directly from DAO queries without creating a dedicated POJO class. This is cleaner for cases where you need to group data by a key.

```kotlin
@Dao
interface AnalyticsDao {

    @Query("""
        SELECT * FROM orders
        JOIN order_items ON orders.orderId = order_items.order_id
    """)
    fun getOrdersWithItems(): Flow<Map<OrderEntity, List<OrderItemEntity>>>

    @Query("""
        SELECT status, COUNT(*) as count FROM orders GROUP BY status
    """)
    fun getOrderCountByStatus(): Flow<Map<String, Int>>
}
```

Multimap queries reduce boilerplate — you don't need a `@Relation` POJO for every join. The tradeoff is that complex queries with multiple joins can return deeply nested maps that are harder to reason about than dedicated data classes.

The `@Transaction` annotation on the DAO query is essential when loading relations. Without it, Room executes two separate queries — one for the order, one for the items — and if another thread modifies the data between those two queries, you get an inconsistent result. `@Transaction` wraps both queries in a single SQLite transaction, guaranteeing consistency. It's like taking a snapshot of a moving scene instead of photographing each person separately and hoping nobody moved between shots.

> **🧠 Think about it:** If Room relations always load eagerly — fetching all children immediately with no lazy loading — what would happen if a parent had ten thousand children? That's right, all ten thousand get loaded into memory at once. For a one-to-many relationship with a handful of children, this is fine. For a parent with thousands, you'd want to query them separately with pagination instead.

## Full-Text Search (FTS)

For text-heavy apps — notes, messaging, content browsers — Room supports SQLite's FTS (Full-Text Search) engine. FTS tables are optimized for text search queries and are dramatically faster than `LIKE '%query%'` on large datasets. The difference is like searching for a word in a book by flipping through every page versus using the index at the back.

```kotlin
@Fts4(contentEntity = ArticleEntity::class)
@Entity(tableName = "articles_fts")
data class ArticleFts(
    val title: String,
    val body: String
)

@Dao
interface SearchDao {
    @Query("""
        SELECT articles.* FROM articles
        JOIN articles_fts ON articles.rowid = articles_fts.rowid
        WHERE articles_fts MATCH :query
    """)
    fun searchArticles(query: String): Flow<List<ArticleEntity>>
}
```

The `contentEntity` parameter links the FTS table to the real entity. Room keeps them in sync — when you insert into the content entity, the FTS table is updated automatically. FTS4 supports features like prefix queries (`"kotl*"`), phrase queries (`"\"sealed class\""`), and ranking by relevance. For apps with hundreds of thousands of text records, the performance difference between FTS and `LIKE` queries can be 100x or more. Not a typo — a hundred times faster.

## Migrations — Evolving Your Schema

Schema migrations are where database work gets real. Imagine you've shipped your app, thousands of users have data stored locally, and now you need to add a column. You can't just delete the database and start fresh — that's someone's data you'd be wiping out. You need to tell Room exactly how to transform the existing schema into the new one, row by row, without losing anything.

Room won't guess. If the schema version changes without a matching migration, it crashes the app on startup. Harsh? Maybe. But it's better than silently corrupting data.

```kotlin
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE orders ADD COLUMN notes TEXT DEFAULT ''")
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // SQLite doesn't support renaming columns directly (before version 3.25)
        // So we create a new table, copy data, drop old, rename new
        db.execSQL("""
            CREATE TABLE orders_new (
                orderId TEXT NOT NULL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                total_amount REAL NOT NULL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)
        db.execSQL("""
            INSERT INTO orders_new (orderId, customer_name, total_amount, status, notes, created_at, updated_at)
            SELECT orderId, customer_name, totalAmount, status, COALESCE(notes, ''), created_at, updated_at
            FROM orders
        """)
        db.execSQL("DROP TABLE orders")
        db.execSQL("ALTER TABLE orders_new RENAME TO orders")
    }
}

@Database(
    entities = [OrderEntity::class, OrderItemEntity::class],
    version = 3
)
@TypeConverters(DatabaseConverters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun orderDao(): OrderDao
}

// Building the database with migrations
val database = Room.databaseBuilder(
    context.applicationContext,
    AppDatabase::class.java,
    "app-database"
)
    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
    .build()
```

You might be wondering — what about `fallbackToDestructiveMigration()`? Yeah, that exists, and it does exactly what it sounds like — drops all tables and recreates them from scratch. During development, that's fine. In production, it means wiping all user data. I've seen apps ship with this flag accidentally left in, and the result was users opening the app after an update to find all their local data gone. Always write explicit migrations for production databases.

Room also offers `AutoMigration` since version 2.4, which handles simple schema changes like adding a column or table. It works well for straightforward additions, but for anything involving data transformation — renaming columns, splitting tables, changing types — you still need manual migrations. I use auto-migrations for simple additions and manual migrations for everything else.

## Testing Your Database

One of Room's biggest advantages over raw SQLite is testability. With raw SQLite, testing meant dealing with file-based databases, cleaning up state between tests, and praying nothing leaked. Room gives you an in-memory database builder that creates a fresh database for each test — no files to clean up, no state leaking between tests. It's like having a whiteboard you can wipe clean instantly instead of carving into stone.

```kotlin
@RunWith(AndroidJUnit4::class)
class OrderDaoTest {

    private lateinit var database: AppDatabase
    private lateinit var orderDao: OrderDao

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        )
            .allowMainThreadQueries()  // OK for tests, never in production
            .build()
        orderDao = database.orderDao()
    }

    @After
    fun teardown() {
        database.close()
    }

    @Test
    fun insertAndRetrieveOrder() = runTest {
        val order = OrderEntity(
            orderId = "order-123",
            customerName = "Alice",
            totalAmount = 99.99,
            status = OrderStatus.PENDING
        )

        orderDao.insertOrder(order)
        val retrieved = orderDao.getOrderById("order-123")

        assertNotNull(retrieved)
        assertEquals("Alice", retrieved?.customerName)
        assertEquals(OrderStatus.PENDING, retrieved?.status)
    }
}
```

`allowMainThreadQueries()` is fine in tests because you want synchronous, predictable behavior. Don't use it in production code — Room's main-thread blocking protection exists for a reason.

For testing migrations, Room provides `MigrationTestHelper`, which creates a database at an old version, runs your migration, and verifies the schema matches the expected new version. Testing migrations is tedious but essential — a broken migration means your users' data is corrupted or lost, and there's no undo button for that.

> **⚡ Quick check:** If you ship a migration that accidentally drops a column, what happens to the data already in that column for existing users? Gone. Forever. That's why you test every migration before it goes to production.

## Coroutines and Flow Integration

Room's coroutine integration is where it really shines for modern Android development. Suspend functions for one-shot queries, Flow for reactive queries, and proper dispatcher handling make Room feel native to a coroutine-based architecture. It's not bolted on — it feels like Room was designed with coroutines in mind from the ground up.

```kotlin
class OrderRepository(
    private val orderDao: OrderDao,
    private val orderApi: OrderApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {

    // Reactive stream — emits whenever the table changes
    val pendingOrders: Flow<List<OrderEntity>> =
        orderDao.getOrdersByStatus(OrderStatus.PENDING)

    suspend fun refreshOrders() {
        withContext(ioDispatcher) {
            val remoteOrders = orderApi.fetchOrders()
            val entities = remoteOrders.map { it.toEntity() }
            orderDao.insertOrders(entities)
            // Flow observers automatically get the new data
        }
    }

    suspend fun cancelOrder(orderId: String) {
        withContext(ioDispatcher) {
            orderDao.updateOrderStatus(orderId, OrderStatus.CANCELLED)
        }
    }
}
```

The beauty of returning `Flow` from DAO queries is that your repository doesn't need to do any manual invalidation. Insert new orders, and every collector of `pendingOrders` automatically gets the updated list. No callback wiring, no event buses, no "hey, I changed something, please refresh." Room is observing SQLite's invalidation tracker under the hood — it watches for write operations on the table and re-queries when changes happen.

The tradeoff is that Room re-queries the entire result set on every change. If your query returns 500 rows and you update one row, Room fetches all 500 again. For most apps, SQLite is fast enough that this doesn't matter. But if you're seeing performance issues with large datasets, consider using `@RawQuery` with manual invalidation, or breaking the data into smaller, more targeted queries.

## Paging Integration

For large datasets, loading everything into memory isn't practical. Imagine loading a user's entire order history — going back years — into a single list. Your app would choke. Room integrates with Paging 3 to load data in pages, which is essential for lists with thousands of items like order histories, message threads, or product catalogs.

```kotlin
@Dao
interface OrderDao {

    @Query("SELECT * FROM orders ORDER BY created_at DESC")
    fun getOrdersPaged(): PagingSource<Int, OrderEntity>
}

// In your ViewModel
class OrderListViewModel(
    private val orderDao: OrderDao
) : ViewModel() {

    val pagedOrders: Flow<PagingData<OrderEntity>> = Pager(
        config = PagingConfig(pageSize = 20, prefetchDistance = 5),
        pagingSourceFactory = { orderDao.getOrdersPaged() }
    ).flow.cachedIn(viewModelScope)
}
```

Room generates the `PagingSource` implementation for you. It handles loading pages, invalidating when data changes, and integrating with Room's invalidation tracker so new inserts trigger the PagingSource to refresh. The `cachedIn(viewModelScope)` call ensures the paging state survives configuration changes. Without it, rotating the screen would reload the entire list from page one — and your user would be scrolling right back to where they started.

## The Reframe — Room Is a Compiler, Not Just a Library

Here's what I think most developers miss about Room: **it's not just a database wrapper. It's a compiler for your data layer.** The annotation processor that runs at build time does more work than most developers realize — it parses SQL, validates it against your schema, generates type-safe code, handles cursor management, manages threading, and sets up the reactive invalidation system. All the code you'd write by hand with raw SQLite — and all the bugs you'd introduce doing it — is generated correctly by the processor every time.

When you think of Room as a compiler, you start using it differently. You lean into its compile-time checks instead of fighting them. You write complex queries knowing that Room will tell you if the SQL is wrong before you run the app. You use its generated code as a reference for understanding what's happening at the SQLite level. And you stop worrying about whether your cursor handling is correct, because the generated code handles it the same way every time.

> **💡 The "aha" moment:** Room's real value isn't in hiding SQLite from you — it's in generating the tedious, error-prone parts correctly every single time, so you can focus on what your data actually means instead of how to read it from a cursor.

SQLite is one of the most reliable pieces of software ever written — it powers more applications than any other database engine. Room makes it accessible for Android development without sacrificing that reliability. The key is understanding that Room's value isn't in abstracting away SQLite — it's in taking the grunt work off your plate and getting it right, automatically, at compile time.

Thank You!
