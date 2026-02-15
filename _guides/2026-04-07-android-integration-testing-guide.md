---
title: Android Integration Testing Guide
layout: post
sequence: 132
categories: post
tags:
  - Testing
  - Android
---

Unit tests verify components in isolation. You mock the repository, stub the database, fake the network, and test that your ViewModel emits the right state. That's valuable — but it only proves that each piece works alone. Integration tests verify that components work together. They catch the bugs that slip through the cracks between layers: the serialization mismatch where your Moshi adapter silently drops a field, the Room query that compiles but returns wrong results because of a JOIN condition, the repository that calls the API correctly but forgets to update the cache.

I've lost count of how many production bugs I've seen that had passing unit tests. Every single one happened at a boundary — network response deserialized into the wrong type, database migration that ran without errors but silently corrupted a column, a ViewModel that worked perfectly with mocked data but broke when the real repository returned results in a different order. Unit tests didn't catch them because they never exercised the real integration between layers.

Here's the thing — integration tests are not end-to-end tests. They don't launch the full app, don't touch real servers, and don't require an emulator for most cases. They test the seams between two or three real components while still controlling the boundaries. That distinction matters, because it means they can be fast, reliable, and part of your regular CI pipeline.

## What Integration Tests Cover

The best way to think about integration tests is to look at the boundaries in your architecture where data crosses layers. These are the seams where bugs hide.

**Database + Repository.** Your DAO compiles SQL at build time, but that doesn't mean the query returns what you expect. A `@Transaction` that coordinates multiple inserts, a `@Relation` that uses an unexpected column for matching, a `REPLACE` conflict strategy that deletes cascade children you didn't intend — none of these show up in unit tests with a mocked DAO. Integration tests run real queries against an in-memory Room database.

**Network + Caching Layer.** Your repository fetches from the network, stores in the database, and returns cached data when offline. Unit testing this with a mocked API client and a mocked DAO proves nothing about the actual data flow. Does the JSON response deserialize into the right entity? Does the entity persist correctly? Does the cache invalidation logic work with real timestamps? These questions require real serialization and a real database.

**ViewModel + Repository + Database.** When you unit test a ViewModel with a fake repository, you're testing state management logic — which is good. But you're not testing whether the ViewModel correctly handles the actual data shapes that come from the repository. An integration test with a real repository backed by an in-memory database catches the disconnect.

**Navigation Flows.** Testing that clicking "Submit" navigates to the confirmation screen requires multiple components working together: the ViewModel processing the form, the navigation controller responding to the event, and the destination screen rendering the passed arguments.

What integration tests are NOT: they're not full UI tests that launch activities and tap buttons. They're not end-to-end tests that hit real servers. They sit in the middle of the test pyramid — fewer than unit tests, more than UI tests, and they catch an entirely different category of bugs.

## Room Database Testing

Room compiles your queries at build time, which catches SQL syntax errors. But it doesn't catch logical errors — a WHERE clause that filters wrong, a JOIN that duplicates rows, or a migration that changes a column type incompatibly. The only way to catch these is to run real queries against a real database.

The key tool is `Room.inMemoryDatabaseBuilder()`. It creates a database that exists only in memory, runs fast, and gets destroyed when the test finishes. No cleanup, no leftover state between tests, no file system dependencies.

```kotlin
@RunWith(AndroidJUnit4::class)
class TransactionDaoTest {
    private lateinit var db: AppDatabase
    private lateinit var dao: TransactionDao

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        dao = db.transactionDao()
    }

    @After
    fun teardown() { db.close() }

    @Test
    fun `getByDateRange returns only transactions within range`() = runTest {
        dao.insertAll(
            TransactionEntity(id = "1", amount = 100.0, date = 1700000000L),
            TransactionEntity(id = "2", amount = 200.0, date = 1700100000L),
            TransactionEntity(id = "3", amount = 50.0, date = 1700500000L)
        )

        val results = dao.getByDateRange(
            start = 1700000000L,
            end = 1700200000L
        )

        assertThat(results).hasSize(2)
        assertThat(results.map { it.id }).containsExactly("1", "2")
    }
}
```

Notice `allowMainThreadQueries()` — this is only for tests. In production, Room throws if you run queries on the main thread. In tests, there's no main thread concern, and adding dispatcher complexity just for tests is unnecessary overhead.

Testing migrations is where in-memory databases fall short. Migrations modify an existing schema, so you need a real database file. The `MigrationTestHelper` handles this — it creates a database at one version, runs your migration, and verifies the schema and data survive.

```kotlin
@RunWith(AndroidJUnit4::class)
class MigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        AppDatabase::class.java
    )

    @Test
    fun `migration from 2 to 3 adds priority column`() {
        // Create database at version 2
        val db = helper.createDatabase(TEST_DB_NAME, 2).apply {
            execSQL("INSERT INTO tasks (id, title) VALUES ('1', 'Buy groceries')")
            close()
        }

        // Run migration and validate
        val migratedDb = helper.runMigrationsAndValidate(
            TEST_DB_NAME, 3, true, MIGRATION_2_3
        )

        val cursor = migratedDb.query("SELECT * FROM tasks WHERE id = '1'")
        cursor.moveToFirst()
        val priorityIndex = cursor.getColumnIndex("priority")
        assertThat(cursor.getInt(priorityIndex)).isEqualTo(0) // default value
        cursor.close()
    }

    companion object {
        private const val TEST_DB_NAME = "migration-test"
    }
}
```

Now, the real payoff comes when you test the repository with a real in-memory database instead of a mocked DAO. This catches the mismatch between what the repository expects and what the database actually returns.

```kotlin
@RunWith(AndroidJUnit4::class)
class TaskRepositoryIntegrationTest {
    private lateinit var db: AppDatabase
    private lateinit var repository: TaskRepository

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        repository = TaskRepositoryImpl(db.taskDao())
    }

    @After
    fun teardown() { db.close() }

    @Test
    fun `completing a task updates status and completedAt timestamp`() = runTest {
        repository.createTask(title = "Review PR", priority = Priority.HIGH)
        val tasks = repository.getAllTasks().first()
        val taskId = tasks[0].id

        repository.completeTask(taskId)

        val completed = repository.getTask(taskId)
        assertThat(completed.status).isEqualTo(TaskStatus.COMPLETED)
        assertThat(completed.completedAt).isNotNull()
    }
}
```

This test exercises the real SQL queries, the real entity mapping, and the real repository logic. If the DAO's `@Query` uses the wrong column name, or the repository forgets to set the timestamp, this test catches it. A unit test with a mocked DAO would miss both bugs.

## Network Layer Testing

MockWebServer from OkHttp is the standard tool for testing network layers without hitting real servers. It runs a local HTTP server in your test process, and you can queue exactly the responses you want — success, errors, timeouts, malformed JSON. Your Retrofit client connects to it instead of the real API.

The value proposition is straightforward: you're testing real HTTP requests, real OkHttp interceptors, real Retrofit deserialization, and real error handling. Mocking the API interface skips all of that.

```kotlin
class OrderApiIntegrationTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var api: OrderApi

    @Before
    fun setup() {
        mockWebServer = MockWebServer()
        mockWebServer.start()

        val retrofit = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()

        api = retrofit.create(OrderApi::class.java)
    }

    @After
    fun teardown() { mockWebServer.shutdown() }

    @Test
    fun `getOrders deserializes response correctly`() = runTest {
        val responseJson = """
            {
                "orders": [
                    {
                        "id": "ord_123",
                        "total": 49.99,
                        "status": "shipped",
                        "items": [{"name": "Keyboard", "qty": 1}]
                    }
                ]
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setBody(responseJson)
                .setResponseCode(200)
                .addHeader("Content-Type", "application/json")
        )

        val response = api.getOrders()

        assertThat(response.orders).hasSize(1)
        assertThat(response.orders[0].id).isEqualTo("ord_123")
        assertThat(response.orders[0].status).isEqualTo("shipped")
        assertThat(response.orders[0].items[0].name).isEqualTo("Keyboard")
    }

    @Test
    fun `getOrders handles server error`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(500))

        val result = runCatching { api.getOrders() }

        assertThat(result.isFailure).isTrue()
    }
}
```

I always test with real JSON strings rather than programmatically building response objects. The whole point is to verify that your Moshi adapters, `@Json` annotations, and data class structure actually match what the server sends. I've caught bugs where a field was named `order_id` in the JSON but `orderId` in the data class without a `@Json(name = "order_id")` annotation. A mocked API interface would never catch that.

Here's the repository integration test that ties the network layer to the caching layer — this is where things get interesting:

```kotlin
class OrderRepositoryIntegrationTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var db: AppDatabase
    private lateinit var repository: OrderRepository

    @Before
    fun setup() {
        mockWebServer = MockWebServer()
        mockWebServer.start()

        val api = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(OrderApi::class.java)

        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        repository = OrderRepositoryImpl(api, db.orderDao())
    }

    @After
    fun teardown() {
        mockWebServer.shutdown()
        db.close()
    }

    @Test
    fun `refresh fetches from network and caches in database`() = runTest {
        mockWebServer.enqueue(successResponse("""{"orders": [{"id": "1", "total": 29.99, "status": "pending"}]}"""))

        repository.refresh()

        val cached = db.orderDao().getAll()
        assertThat(cached).hasSize(1)
        assertThat(cached[0].id).isEqualTo("1")
    }
}
```

This test verifies the full data path: HTTP request → JSON deserialization → entity mapping → database insert. No mocks, no fakes, just the real components wired together with controlled inputs.

## ViewModel Integration Tests

Unit testing a ViewModel with fakes is the baseline. But sometimes you need to verify that the ViewModel works correctly with the real data pipeline — especially when the ViewModel does more than just forward data. State transitions, error handling, retry logic, and data transformation all benefit from integration tests that use real components.

The setup uses an in-memory Room database (or MockWebServer) behind a real repository, with only `Dispatchers.Main` replaced for testing:

```kotlin
@RunWith(AndroidJUnit4::class)
class CheckoutViewModelIntegrationTest {
    private lateinit var db: AppDatabase
    private lateinit var viewModel: CheckoutViewModel

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        val cartRepository = CartRepositoryImpl(db.cartDao())
        val pricingEngine = PricingEngine()
        viewModel = CheckoutViewModel(cartRepository, pricingEngine)
    }

    @After
    fun teardown() { db.close() }

    @Test
    fun `adding items recalculates total with tax`() = runTest {
        viewModel.addItem(CartItem(id = "1", name = "Headphones", price = 79.99))
        viewModel.addItem(CartItem(id = "2", name = "USB Cable", price = 12.99))

        val state = viewModel.uiState.value

        assertThat(state.items).hasSize(2)
        assertThat(state.subtotal).isEqualTo(92.98)
        assertThat(state.tax).isGreaterThan(0.0)
        assertThat(state.total).isGreaterThan(state.subtotal)
    }
}
```

When should you integration test a ViewModel versus unit test it? I use a simple heuristic. If the test is about **state management logic** — "when loading fails, show error state" — unit test with fakes. The logic is what matters, not the data source. If the test is about **data correctness through the pipeline** — "when the user adds items, the total calculation reflects real database state" — integration test with real components. The distinction is whether you're testing the ViewModel's decisions or the data flow through it. Integration tests are slower, so I reserve them for the 3-4 critical user journeys in the app: login, checkout, data sync, and whatever the core feature is.

## Hilt Testing

If your app uses Hilt for dependency injection, your integration tests need to work within Hilt's component structure. Hilt provides testing APIs that let you swap real modules with test modules — replacing the production API client with one backed by MockWebServer, or the production database with an in-memory instance.

The core annotations are `@HiltAndroidTest`, `@UninstallModules`, and `@TestInstallIn`. `@HiltAndroidTest` tells Hilt to generate a test component. `@UninstallModules` removes specific production modules so you can replace them. `@TestInstallIn` provides the replacement bindings.

First, create a test module that provides your test dependencies:

```kotlin
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [NetworkModule::class]
)
object TestNetworkModule {

    private val mockWebServer = MockWebServer()

    @Provides
    @Singleton
    fun provideMockWebServer(): MockWebServer = mockWebServer

    @Provides
    @Singleton
    fun provideRetrofit(mockWebServer: MockWebServer): Retrofit =
        Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()

    @Provides
    @Singleton
    fun provideOrderApi(retrofit: Retrofit): OrderApi =
        retrofit.create(OrderApi::class.java)
}
```

Then write the test:

```kotlin
@HiltAndroidTest
@UninstallModules(NetworkModule::class)
@RunWith(AndroidJUnit4::class)
class OrderFlowIntegrationTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val mainDispatcherRule = MainDispatcherRule()

    @Inject lateinit var mockWebServer: MockWebServer
    @Inject lateinit var orderRepository: OrderRepository

    @Before
    fun setup() {
        hiltRule.inject()
    }

    @After
    fun teardown() { mockWebServer.shutdown() }

    @Test
    fun `repository fetches and caches orders via Hilt wiring`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setBody("""{"orders": [{"id": "1", "total": 25.0, "status": "new"}]}""")
                .setResponseCode(200)
        )

        val orders = orderRepository.getOrders()

        assertThat(orders).hasSize(1)
        assertThat(orders[0].status).isEqualTo("new")
    }
}
```

The `order` parameter on the rules matters. `HiltAndroidRule` must run before other rules to ensure injection happens first. This is a subtle detail that causes confusing `UninitializedPropertyAccessException` crashes when the order is wrong.

One gotcha I've hit: `@TestInstallIn` applies globally to all `@HiltAndroidTest` classes in the module. If different tests need different fake configurations, use `@UninstallModules` on the specific test class and provide bindings locally with `@BindValue`. This gives per-test control without polluting the global test component.

The tradeoff with Hilt testing is setup complexity. You're writing test modules, managing component scopes, and dealing with Hilt's annotation processing in your test source set. For simple repository tests, plain integration tests without Hilt are faster to write. I use Hilt testing when the component I'm testing has deep dependency chains that would be painful to wire manually — an entire feature screen where the ViewModel depends on three repositories, each with their own data sources.

## When to Write Integration Tests

Integration tests are more expensive than unit tests — slower to run, more setup code, more dependencies to manage. So you need to be deliberate about where you invest.

**High-value paths first.** Login, checkout, data sync, onboarding — these are the flows where a bug has the highest user impact. If your login flow involves network authentication, token storage, and session management, an integration test that exercises all three layers together is worth more than a dozen unit tests that verify each one in isolation. I've seen a login flow pass all unit tests but fail in production because the token serializer used a different date format than the API returned.

**Complex data transformations.** When your repository maps API responses to domain models to database entities and back, there are multiple conversion steps where data can get lost or mangled. A `Double` that becomes a `Float`, a nullable field that becomes non-nullable, a date string that parses differently depending on the locale. Integration tests exercise the full transformation chain.

**After finding a bug that unit tests missed.** This is my strongest signal. If a bug made it to production and you had unit tests covering the individual components, that's exactly the seam where an integration test belongs. Write the integration test that would have caught it, verify it fails against the buggy code, then fix the bug. Now that test guards the boundary permanently.

**Skip integration tests for pure logic.** A discount calculator, a form validator, a data mapper with no external dependencies — these are pure functions. Unit tests cover them perfectly. Adding integration test infrastructure for code that has no integration points is wasted effort.

The cost-benefit math is straightforward. A typical Android project might have 500 unit tests and 50 integration tests. The unit tests run in 15 seconds on the JVM. The integration tests run in 90 seconds on an emulator or with Robolectric. That 90-second investment catches a category of bugs — serialization, SQL logic, component wiring — that the 500 unit tests physically cannot catch. IMO, the teams that skip integration tests aren't saving time. They're just discovering those bugs in production instead.

## Quiz

**Question 1:**

```kotlin
@Test
fun `repository returns cached data`() = runTest {
    val mockDao = mockk<OrderDao>()
    every { mockDao.getAll() } returns listOf(OrderEntity("1", 50.0))
    val repository = OrderRepositoryImpl(mockApi, mockDao)

    val orders = repository.getCachedOrders()

    assertThat(orders).hasSize(1)
}
```

**Wrong** or **Correct** for an integration test?

**Wrong.** This is a unit test masquerading as an integration test. It mocks the DAO, which means it never exercises the real SQL query. The actual database query could return wrong results, fail on a JOIN, or have a type mismatch — and this test would still pass. An integration test would use `Room.inMemoryDatabaseBuilder()` with real inserts and queries.

**Question 2:**

```kotlin
@Test
fun `api client handles 404 response`() = runTest {
    mockWebServer.enqueue(MockResponse().setResponseCode(404))

    val result = repository.fetchOrder("nonexistent_id")

    assertThat(result).isInstanceOf(Result.Failure::class.java)
}
```

**Wrong** or **Correct** for an integration test?

**Correct.** MockWebServer returns a real HTTP 404, Retrofit processes it through the real OkHttp pipeline, and the repository's error handling is exercised with a genuine HTTP failure. This catches bugs in error mapping that a mocked API interface would hide.

## Coding Challenge

Build an integration test suite for a `BookmarkRepository` that:

- Uses MockWebServer to simulate an API that returns a list of bookmarks as JSON
- Uses an in-memory Room database with a `BookmarkDao`
- Tests the full sync flow: fetch from network → deserialize → store in database → read back from database
- Includes a test for the offline scenario: when the network call fails, the repository returns previously cached bookmarks from the database
- Includes a test that verifies the sync correctly handles duplicate bookmarks (same ID from the API should update, not duplicate, the database entry)

This exercise forces you to wire MockWebServer and Room together in the same test class — which is exactly the setup you'll use for real repository integration tests in production code.

Thanks for reading!
