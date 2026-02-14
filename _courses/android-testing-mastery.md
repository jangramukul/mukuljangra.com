---
title: "Android Testing Mastery"
layout: course
description: "Write tests that catch bugs — unit testing, Compose UI testing, integration tests, TDD patterns, test architecture, and mocking strategies."
icon: "🧪"
color: "#818cf8"
difficulty: "Beginner to Advanced"
modules: 7
lessons: 34
duration: "5 weeks"
order: 8
tags:
  - Testing
  - Android
  - TDD
what_you_learn:
  - "Write unit tests for ViewModels, Use Cases, and Repositories"
  - "Build reusable fakes instead of fragile mocks"
  - "Test Compose UIs with ComposeTestRule and semantics"
  - "Write integration tests with Room and MockWebServer"
  - "Organize test architecture with shared test fixtures"
  - "Apply TDD (Red-Green-Refactor) for business logic"
prerequisites:
  - "Kotlin fundamentals"
  - "Android development experience"
  - "Basic understanding of MVVM/architecture patterns"
---

## Module 1: Testing Fundamentals

Tests are the safety net that lets you refactor with confidence. Without them, every change is a gamble.

### Lesson 1.1: The Testing Pyramid

- **Unit tests (70%)** — Fast, test individual classes/functions. No Android framework
- **Integration tests (20%)** — Test interactions between components. May use Robolectric
- **UI/E2E tests (10%)** — Test complete user flows. Run on device/emulator

```kotlin
// Unit test — fast, no Android dependencies
@Test
fun `calculateTotal returns correct sum`() {
    val cart = ShoppingCart()
    cart.addItem(Item("Widget", 9.99))
    cart.addItem(Item("Gadget", 24.99))

    assertEquals(34.98, cart.calculateTotal(), 0.01)
}
```

**Key takeaway:** Most of your tests should be unit tests. They're fast, reliable, and catch bugs early. UI tests are expensive and flaky — use them sparingly for critical paths.

### Lesson 1.2: Test Structure (Given-When-Then)

```kotlin
@Test
fun `login with valid credentials returns success`() {
    // Given
    val repository = FakeAuthRepository(validCredentials = listOf("mukul@test.com"))
    val viewModel = LoginViewModel(repository)

    // When
    viewModel.login("mukul@test.com", "password123")

    // Then
    assertEquals(LoginState.Success, viewModel.state.value)
}
```

**Key takeaway:** Every test has three parts: setup (Given), action (When), and assertion (Then). Name tests descriptively — a failing test name should tell you what's broken without reading the code.

### Quiz: Testing Fundamentals

#### According to the testing pyramid, what percentage of your tests should be unit tests?

- ❌ 10% — unit tests are the least important layer
- ❌ 50% — split evenly between unit and UI tests
- ✅ 70% — unit tests form the broad base of the pyramid
- ❌ 100% — only unit tests matter

> **Explanation:** The testing pyramid recommends ~70% unit tests, ~20% integration tests, and ~10% UI/E2E tests. Unit tests are fast, reliable, and cheap to run, so they should form the foundation of your test suite.

#### What are the three parts of the Given-When-Then test structure?

- ❌ Initialize, Execute, Verify
- ✅ Setup (Given), Action (When), Assertion (Then)
- ❌ Build, Run, Check
- ❌ Arrange, Process, Return

> **Explanation:** Given-When-Then (also called Arrange-Act-Assert) divides a test into three clear phases: setting up preconditions (Given), performing the action under test (When), and verifying the expected outcome (Then).

#### Why should test names be descriptive?

- ❌ To make the test file longer and more detailed
- ❌ To satisfy code review requirements
- ✅ A failing test name should tell you what's broken without reading the code
- ❌ Descriptive names make tests run faster

> **Explanation:** When a test fails in CI, the test name is the first thing you see. A descriptive name like `login with valid credentials returns success` immediately tells you what behavior broke, saving debugging time.

### Coding Challenge: Write Your First Unit Test

Create a `TipCalculator` class with a `calculateTip(billAmount: Double, tipPercent: Int): Double` method, then write tests covering a normal tip, a zero tip, and rounding behavior.

#### Solution

```kotlin
class TipCalculator {
    fun calculateTip(billAmount: Double, tipPercent: Int): Double {
        require(billAmount >= 0) { "Bill amount cannot be negative" }
        require(tipPercent >= 0) { "Tip percent cannot be negative" }
        return Math.round(billAmount * tipPercent / 100.0 * 100.0) / 100.0
    }
}

class TipCalculatorTest {
    private val calculator = TipCalculator()

    @Test
    fun `15 percent tip on 50 dollar bill`() {
        // Given a $50 bill
        // When calculating a 15% tip
        val tip = calculator.calculateTip(50.0, 15)
        // Then tip should be $7.50
        assertEquals(7.50, tip, 0.01)
    }

    @Test
    fun `zero percent tip returns zero`() {
        assertEquals(0.0, calculator.calculateTip(100.0, 0), 0.01)
    }

    @Test
    fun `tip rounds to two decimal places`() {
        // 33.33 * 15% = 4.9995 → should round to 5.00
        assertEquals(5.00, calculator.calculateTip(33.33, 15), 0.01)
    }
}
```

This exercise practices the Given-When-Then structure from Lesson 1.2. Each test is focused on a single behavior and uses a descriptive name that explains what should happen.

---

## Module 2: Unit Testing

### Lesson 2.1: Testing ViewModels

```kotlin
class ProfileViewModelTest {
    // Use Turbine for Flow testing
    @Test
    fun `loadProfile transitions through loading to success`() = runTest {
        val fakeRepo = FakeUserRepository().apply {
            setUser(User("1", "Mukul", "mukul@test.com"))
        }
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.state.test {
            assertEquals(ProfileState.Initial, awaitItem())

            viewModel.loadProfile("1")
            assertEquals(ProfileState.Loading, awaitItem())
            assertEquals(
                ProfileState.Success(User("1", "Mukul", "mukul@test.com")),
                awaitItem()
            )
        }
    }

    @Test
    fun `loadProfile shows error on failure`() = runTest {
        val fakeRepo = FakeUserRepository().apply { setShouldFail(true) }
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Initial
            viewModel.loadProfile("1")
            awaitItem() // Loading

            val errorState = awaitItem()
            assertTrue(errorState is ProfileState.Error)
        }
    }
}
```

### Lesson 2.2: Testing Use Cases

```kotlin
class GetDashboardDataUseCaseTest {
    private val userRepo = FakeUserRepository()
    private val ordersRepo = FakeOrdersRepository()
    private val useCase = GetDashboardDataUseCase(userRepo, ordersRepo)

    @Test
    fun `returns combined data from both repos`() = runTest {
        userRepo.setUser(testUser)
        ordersRepo.setOrders(listOf(testOrder1, testOrder2))

        val result = useCase("user-1").first()

        assertEquals(testUser, result.user)
        assertEquals(2, result.orders.size)
    }
}
```

### Lesson 2.3: Testing Repository Layer

```kotlin
class UserRepositoryTest {
    private val fakeApi = FakeUserApi()
    private val fakeDao = FakeUserDao()
    private val repository = UserRepositoryImpl(fakeApi, fakeDao)

    @Test
    fun `observeUser emits cached data then refreshes`() = runTest {
        fakeDao.insertUser(cachedUser)
        fakeApi.setUser(freshUser)

        repository.observeUser("1").test {
            // First emission — cached data
            assertEquals(cachedUser, awaitItem())

            // Second emission — fresh data after network refresh
            assertEquals(freshUser, awaitItem())
        }
    }

    @Test
    fun `observeUser falls back to cache on network error`() = runTest {
        fakeDao.insertUser(cachedUser)
        fakeApi.setShouldFail(true)

        repository.observeUser("1").test {
            assertEquals(cachedUser, awaitItem())
            // No error emission — cache serves as fallback
            expectNoEvents()
        }
    }
}
```

**Key takeaway:** Test repositories with fakes for both API and DAO. Verify the offline-first behavior — cache should work when network fails.

### Quiz: Unit Testing

#### When testing a ViewModel that exposes a StateFlow, which library is recommended for collecting and asserting emissions?

- ❌ Mockito — it mocks the Flow entirely
- ✅ Turbine — it provides `test {}` to collect and assert Flow emissions
- ❌ Espresso — it handles UI state assertions
- ❌ Robolectric — it simulates the Android framework

> **Explanation:** Turbine is a testing library for Kotlin Flows. Its `test {}` extension lets you use `awaitItem()` to collect emissions one by one and assert on each state transition (Initial → Loading → Success/Error).

#### What is the primary benefit of testing the repository layer with fakes for both API and DAO?

- ❌ It eliminates the need for integration tests
- ❌ It tests the production database directly
- ✅ It verifies offline-first behavior — cache works when network fails
- ❌ It makes the tests run on a real device

> **Explanation:** By providing fakes for both the API (network) and DAO (cache), you can simulate scenarios like network failure and verify the repository correctly falls back to cached data, which is the core of offline-first architecture.

#### In the ViewModel test, why do we call `awaitItem()` for the Initial state before asserting Loading and Success?

- ❌ It's optional and can be skipped
- ✅ Turbine requires consuming every emission in order — skipping Initial would cause the test to fail
- ❌ It resets the ViewModel state
- ❌ It triggers the network call

> **Explanation:** Turbine's `test {}` block collects all emissions sequentially. The StateFlow emits its initial value immediately, so you must consume it with `awaitItem()` before you can assert on subsequent emissions like Loading and Success.

### Coding Challenge: Test a Search ViewModel

Build a `SearchViewModel` that takes a `ProductRepository` and exposes a `results: StateFlow<List<Product>>`. When `search(query)` is called, it should emit Loading then the filtered results. Write the `FakeProductRepository` and two tests: one for a successful search returning results, and one for an empty query returning an empty list.

#### Solution

```kotlin
data class Product(val id: String, val name: String)

interface ProductRepository {
    suspend fun search(query: String): List<Product>
}

class FakeProductRepository : ProductRepository {
    private val products = mutableListOf<Product>()

    fun setProducts(list: List<Product>) {
        products.clear()
        products.addAll(list)
    }

    override suspend fun search(query: String): List<Product> {
        if (query.isBlank()) return emptyList()
        return products.filter { it.name.contains(query, ignoreCase = true) }
    }
}

sealed class SearchState {
    object Idle : SearchState()
    object Loading : SearchState()
    data class Results(val products: List<Product>) : SearchState()
}

class SearchViewModelTest {
    private val fakeRepo = FakeProductRepository()
    private val viewModel = SearchViewModel(fakeRepo)

    @Test
    fun `search returns matching products`() = runTest {
        fakeRepo.setProducts(listOf(
            Product("1", "Kotlin Book"),
            Product("2", "Java Guide"),
            Product("3", "Kotlin Coroutines")
        ))

        viewModel.state.test {
            assertEquals(SearchState.Idle, awaitItem())

            viewModel.search("Kotlin")
            assertEquals(SearchState.Loading, awaitItem())

            val result = awaitItem() as SearchState.Results
            assertEquals(2, result.products.size)
        }
    }

    @Test
    fun `empty query returns empty results`() = runTest {
        viewModel.state.test {
            awaitItem() // Idle

            viewModel.search("")
            assertEquals(SearchState.Loading, awaitItem())

            val result = awaitItem() as SearchState.Results
            assertTrue(result.products.isEmpty())
        }
    }
}
```

This challenge applies the patterns from Lessons 2.1–2.3: building a fake repository, testing ViewModel state transitions with Turbine, and verifying edge cases like empty input.

---

## Module 3: Fakes and Test Doubles

### Lesson 3.1: Building Good Fakes

```kotlin
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    private val usersFlow = MutableSharedFlow<User>(replay = 1)
    private var shouldFail = false
    private var networkDelay = 0L

    // Test configuration
    fun setUser(user: User) {
        users[user.id] = user
        usersFlow.tryEmit(user)
    }

    fun setShouldFail(fail: Boolean) { shouldFail = fail }
    fun setNetworkDelay(delayMs: Long) { networkDelay = delayMs }

    // Interface implementation
    override fun observeUser(id: String): Flow<User> {
        if (shouldFail) return flow { throw IOException("Fake network error") }
        return usersFlow.filter { it.id == id }
    }

    override suspend fun refreshUser(id: String) {
        if (networkDelay > 0) delay(networkDelay)
        if (shouldFail) throw IOException("Fake network error")
        // Simulate network refresh — data already in users map
    }
}
```

### Lesson 3.2: Fake vs Mock vs Stub

- **Fake** — Working implementation with in-memory data. Reusable, catches interface changes
- **Mock** — Records interactions. Verify that specific methods were called
- **Stub** — Returns canned responses. Minimal implementation

```kotlin
// Fake — preferred approach
class FakeAnalytics : Analytics {
    val trackedEvents = mutableListOf<String>()
    override fun track(event: String) { trackedEvents.add(event) }
}

// Then assert on the fake
assertEquals(listOf("login_clicked", "login_success"), fakeAnalytics.trackedEvents)
```

**Key takeaway:** Prefer fakes over mocks. They're more maintainable, catch interface changes at compile time, and test behavior instead of implementation details.

### Quiz: Fakes and Test Doubles

#### What is the key difference between a Fake and a Mock?

- ❌ Fakes are slower than mocks
- ✅ A Fake is a working implementation with in-memory data; a Mock records interactions to verify method calls
- ❌ Mocks are reusable across tests; fakes are not
- ❌ There is no difference — they are interchangeable terms

> **Explanation:** A Fake provides a real, working implementation backed by in-memory data (like `FakeUserRepository` with a `MutableMap`). A Mock uses a framework to record and verify that specific methods were called with expected arguments. Fakes test behavior; mocks test implementation.

#### Why are fakes preferred over mocks in most Android tests?

- ❌ Fakes require less code to write
- ❌ Mocks are deprecated in modern Kotlin
- ✅ Fakes catch interface changes at compile time and test behavior instead of implementation details
- ❌ Mocks cannot be used with coroutines

> **Explanation:** When an interface changes (e.g., a method is added), fakes fail to compile — immediately telling you to update them. Mocks silently pass until runtime, hiding the mismatch. Fakes also verify *what* the code does, not *how* it calls dependencies.

### Coding Challenge: Build a Fake Analytics Tracker

Create a `FakeAnalyticsTracker` implementing an `AnalyticsTracker` interface with `trackEvent(name: String, properties: Map<String, String>)` and `setUserId(id: String)`. The fake should record all events and user IDs for assertion. Write tests verifying that a `CheckoutViewModel` tracks the correct events during a purchase flow.

#### Solution

```kotlin
interface AnalyticsTracker {
    fun trackEvent(name: String, properties: Map<String, String> = emptyMap())
    fun setUserId(id: String)
}

class FakeAnalyticsTracker : AnalyticsTracker {
    data class TrackedEvent(val name: String, val properties: Map<String, String>)

    val events = mutableListOf<TrackedEvent>()
    var currentUserId: String? = null

    override fun trackEvent(name: String, properties: Map<String, String>) {
        events.add(TrackedEvent(name, properties))
    }

    override fun setUserId(id: String) {
        currentUserId = id
    }

    fun eventNames(): List<String> = events.map { it.name }
}

class CheckoutViewModelTest {
    private val fakeAnalytics = FakeAnalyticsTracker()
    private val fakeCartRepo = FakeCartRepository()
    private val viewModel = CheckoutViewModel(fakeCartRepo, fakeAnalytics)

    @Test
    fun `purchase tracks checkout_started and purchase_completed events`() {
        fakeCartRepo.setItems(listOf(CartItem("widget", 9.99)))

        viewModel.completePurchase()

        assertEquals(
            listOf("checkout_started", "purchase_completed"),
            fakeAnalytics.eventNames()
        )
    }

    @Test
    fun `purchase event includes total amount`() {
        fakeCartRepo.setItems(listOf(CartItem("widget", 9.99)))

        viewModel.completePurchase()

        val purchaseEvent = fakeAnalytics.events.last()
        assertEquals("9.99", purchaseEvent.properties["total"])
    }
}
```

This exercise demonstrates why fakes are powerful — you can assert on both the sequence of events and their properties without any mocking framework, keeping tests readable and maintainable.

---

## Module 4: Compose UI Testing

### Lesson 4.1: Setting Up Compose Tests

```kotlin
class LoginScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `login button disabled when fields empty`() {
        composeTestRule.setContent {
            LoginScreen(onLogin = {})
        }

        composeTestRule
            .onNodeWithText("Log In")
            .assertIsNotEnabled()
    }

    @Test
    fun `shows error message on invalid email`() {
        composeTestRule.setContent {
            LoginScreen(onLogin = {})
        }

        composeTestRule
            .onNodeWithText("Email")
            .performTextInput("invalid-email")

        composeTestRule
            .onNodeWithText("Password")
            .performTextInput("password123")

        composeTestRule
            .onNodeWithText("Log In")
            .performClick()

        composeTestRule
            .onNodeWithText("Invalid email format")
            .assertIsDisplayed()
    }
}
```

### Lesson 4.2: Testing Stateful Composables

```kotlin
@Test
fun `counter increments on button click`() {
    composeTestRule.setContent {
        CounterScreen()
    }

    composeTestRule.onNodeWithText("Count: 0").assertIsDisplayed()

    composeTestRule.onNodeWithText("Increment").performClick()
    composeTestRule.onNodeWithText("Count: 1").assertIsDisplayed()

    composeTestRule.onNodeWithText("Increment").performClick()
    composeTestRule.onNodeWithText("Count: 2").assertIsDisplayed()
}

// Testing with testTag for precise node selection
@Test
fun `user list shows correct number of items`() {
    val users = listOf(User("1", "Alice"), User("2", "Bob"), User("3", "Charlie"))

    composeTestRule.setContent {
        UserList(users = users)
    }

    composeTestRule
        .onNodeWithTag("user_list")
        .onChildren()
        .assertCountEquals(3)
}
```

### Lesson 4.3: Screenshot Testing

```kotlin
@Test
fun `profile card renders correctly`() {
    composeTestRule.setContent {
        ProfileCard(user = testUser)
    }

    composeTestRule
        .onNodeWithTag("profile_card")
        .captureToImage()
        .assertAgainstGolden(goldenFile = "profile_card_default")
}
```

**Key takeaway:** Compose tests are fast and reliable — they run on JVM without a device. Use `testTag` for precise node selection and `assertIsDisplayed()`, `assertIsEnabled()`, `performClick()` for interactions.

### Quiz: Compose UI Testing

#### What is the purpose of `testTag` in Compose testing?

- ❌ It adds a visible label to the UI component
- ❌ It enables screenshot testing for the composable
- ✅ It provides a stable identifier for precise node selection in tests, independent of displayed text
- ❌ It marks a composable for performance profiling

> **Explanation:** `testTag` attaches a semantic identifier to a composable that tests can use with `onNodeWithTag()`. Unlike `onNodeWithText()`, it doesn't depend on displayed text, making tests resilient to copy changes and localization.

#### Which assertion verifies that a button cannot be clicked?

- ❌ `assertDoesNotExist()`
- ❌ `assertIsNotDisplayed()`
- ✅ `assertIsNotEnabled()`
- ❌ `assertIsOff()`

> **Explanation:** `assertIsNotEnabled()` checks the enabled/disabled state of an interactive component. `assertDoesNotExist()` verifies the node isn't in the tree at all, and `assertIsNotDisplayed()` means it exists but isn't visible — both are different from being disabled.

#### Where do Compose UI tests run by default?

- ❌ On a physical Android device only
- ❌ In Android Studio's layout preview
- ✅ On the JVM without requiring a device or emulator
- ❌ In a cloud-based testing service

> **Explanation:** Compose test rules like `createComposeRule()` run on the JVM using Robolectric under the hood. This makes them fast and reliable compared to traditional instrumented UI tests that require a device or emulator.

### Coding Challenge: Test a Todo List Composable

Write Compose tests for a `TodoScreen` that has an input field (tag: `"todo_input"`), an "Add" button, and a list of todo items. Test three behaviors: adding a todo item appears in the list, the input field clears after adding, and the list shows the correct count after adding multiple items.

#### Solution

```kotlin
class TodoScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `adding a todo shows it in the list`() {
        composeTestRule.setContent { TodoScreen() }

        composeTestRule
            .onNodeWithTag("todo_input")
            .performTextInput("Buy groceries")

        composeTestRule
            .onNodeWithText("Add")
            .performClick()

        composeTestRule
            .onNodeWithText("Buy groceries")
            .assertIsDisplayed()
    }

    @Test
    fun `input field clears after adding todo`() {
        composeTestRule.setContent { TodoScreen() }

        composeTestRule
            .onNodeWithTag("todo_input")
            .performTextInput("Read a book")

        composeTestRule
            .onNodeWithText("Add")
            .performClick()

        composeTestRule
            .onNodeWithTag("todo_input")
            .assertTextEquals("")
    }

    @Test
    fun `list shows correct count after multiple additions`() {
        composeTestRule.setContent { TodoScreen() }

        listOf("Task 1", "Task 2", "Task 3").forEach { task ->
            composeTestRule
                .onNodeWithTag("todo_input")
                .performTextInput(task)
            composeTestRule
                .onNodeWithText("Add")
                .performClick()
        }

        composeTestRule
            .onNodeWithTag("todo_list")
            .onChildren()
            .assertCountEquals(3)
    }
}
```

This challenge combines `testTag`-based selection, `performTextInput()`, `performClick()`, and child counting — all core patterns from Module 4's lessons.

---

## Module 5: Integration Testing

### Lesson 5.1: Testing with Room

```kotlin
@RunWith(AndroidJUnit4::class)
class UserDaoTest {
    private lateinit var database: AppDatabase
    private lateinit var userDao: UserDao

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        userDao = database.userDao()
    }

    @After
    fun teardown() {
        database.close()
    }

    @Test
    fun insertAndRetrieveUser() = runTest {
        val user = UserEntity("1", "Mukul", "mukul@test.com")
        userDao.insert(user)

        val retrieved = userDao.getById("1")
        assertEquals(user, retrieved)
    }

    @Test
    fun observeUsers_emitsOnInsert() = runTest {
        userDao.observeAll().test {
            assertEquals(emptyList<UserEntity>(), awaitItem())

            userDao.insert(UserEntity("1", "Mukul", "mukul@test.com"))
            val users = awaitItem()
            assertEquals(1, users.size)
        }
    }
}
```

### Lesson 5.2: Testing with MockWebServer

```kotlin
class UserApiTest {
    private val mockWebServer = MockWebServer()
    private lateinit var api: UserApi

    @Before
    fun setup() {
        mockWebServer.start()
        api = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(UserApi::class.java)
    }

    @After
    fun teardown() { mockWebServer.shutdown() }

    @Test
    fun `getUser returns parsed response`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"id":"1","name":"Mukul","email":"mukul@test.com"}""")
        )

        val user = api.getUser("1")
        assertEquals("Mukul", user.name)
    }

    @Test
    fun `getUser throws on 404`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(404))

        assertThrows<HttpException> { api.getUser("nonexistent") }
    }
}
```

**Key takeaway:** Use `Room.inMemoryDatabaseBuilder` for database tests and `MockWebServer` for API tests. Both provide real implementations without external dependencies.

### Quiz: Integration Testing

#### Why should you use `Room.inMemoryDatabaseBuilder` instead of a regular database builder in tests?

- ❌ In-memory databases support more SQL features
- ✅ In-memory databases are fast and automatically destroyed after each test, ensuring test isolation
- ❌ In-memory databases can test migrations
- ❌ In-memory databases work on JVM without Android context

> **Explanation:** `inMemoryDatabaseBuilder` creates a database that lives entirely in RAM — it's fast to create, doesn't write to disk, and is automatically cleaned up. This ensures each test starts with a fresh database, preventing test pollution.

#### What does `MockWebServer.enqueue()` do?

- ❌ It sends a real HTTP request to a remote server
- ❌ It records outgoing network requests for later assertion
- ✅ It queues a predefined response that will be returned for the next HTTP request
- ❌ It validates the URL pattern of incoming requests

> **Explanation:** `enqueue()` adds a `MockResponse` to a FIFO queue. When your code makes an HTTP request to the MockWebServer, it dequeues and returns the next response. This lets you simulate success, error, and edge-case responses without a real backend.

#### In the Room test, why is `allowMainThreadQueries()` called?

- ❌ It improves database performance in production
- ✅ It allows synchronous database access on the main thread for simpler test code
- ❌ It enables WAL (Write-Ahead Logging) mode
- ❌ It is required for in-memory databases to function

> **Explanation:** Room normally prevents main-thread database access to avoid ANRs. In tests, we call `allowMainThreadQueries()` to simplify test setup — tests run synchronously and don't need background threading, making them easier to write and debug.

### Coding Challenge: Test an API Error Handler

Write an integration test using `MockWebServer` that verifies a `WeatherRepository` correctly handles three scenarios: a 200 response returning parsed weather data, a 500 response throwing a `ServerException`, and a network timeout throwing a `TimeoutException`. Configure the MockWebServer to simulate each case.

#### Solution

```kotlin
class WeatherRepositoryTest {
    private val mockWebServer = MockWebServer()
    private lateinit var api: WeatherApi
    private lateinit var repository: WeatherRepository

    @Before
    fun setup() {
        mockWebServer.start()
        api = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .client(OkHttpClient.Builder()
                .readTimeout(1, TimeUnit.SECONDS)
                .build())
            .build()
            .create(WeatherApi::class.java)
        repository = WeatherRepositoryImpl(api)
    }

    @After
    fun teardown() { mockWebServer.shutdown() }

    @Test
    fun `returns weather data on 200 response`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"city":"Delhi","tempC":35.0}""")
        )

        val weather = repository.getWeather("Delhi")
        assertEquals("Delhi", weather.city)
        assertEquals(35.0, weather.tempC, 0.1)
    }

    @Test
    fun `throws ServerException on 500 response`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(500))

        assertThrows<ServerException> {
            repository.getWeather("Delhi")
        }
    }

    @Test
    fun `throws TimeoutException on network timeout`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setBodyDelay(5, TimeUnit.SECONDS)
                .setBody("""{"city":"Delhi","tempC":35.0}""")
        )

        assertThrows<TimeoutException> {
            repository.getWeather("Delhi")
        }
    }
}
```

This exercise uses `MockResponse` features like `setResponseCode()` and `setBodyDelay()` to simulate real-world API failure scenarios — a critical skill for building robust apps.

---

## Module 6: Test Architecture

### Lesson 6.1: Test Organization

```
app/
├── src/
│   ├── main/            (Production code)
│   ├── test/            (Unit tests — JVM)
│   │   └── java/com/yourapp/
│   │       ├── viewmodel/
│   │       ├── repository/
│   │       ├── usecase/
│   │       └── fakes/   (Shared test fakes)
│   └── androidTest/     (Instrumented tests — device)
│       └── java/com/yourapp/
│           ├── ui/
│           └── db/
```

### Lesson 6.2: Test Fixtures Module

```kotlin
// :core:testing module — shared test utilities
class FakeUserRepository : UserRepository { /* ... */ }
class FakeOrdersRepository : OrdersRepository { /* ... */ }

fun createTestUser(
    id: String = "test-1",
    name: String = "Test User",
    email: String = "test@test.com"
) = User(id, name, email)

// Usage in any module's tests
dependencies {
    testImplementation(project(":core:testing"))
}
```

**Key takeaway:** Extract shared fakes and test utilities into a `:core:testing` module. This prevents duplicating test code across feature modules.

### Quiz: Test Architecture

#### What is the purpose of a `:core:testing` module?

- ❌ It contains production code shared across feature modules
- ❌ It runs all tests in the project from a single entry point
- ✅ It holds shared fakes, test utilities, and factory functions reusable across feature modules
- ❌ It configures CI/CD pipelines for test execution

> **Explanation:** A `:core:testing` module centralizes test infrastructure — shared fakes like `FakeUserRepository`, factory functions like `createTestUser()`, and test utilities. Feature modules declare it as a `testImplementation` dependency, eliminating duplicated test code.

#### Where should unit tests (JVM tests) be placed in an Android project?

- ❌ `src/androidTest/` — alongside instrumented tests
- ✅ `src/test/` — they run on the JVM without Android framework
- ❌ `src/main/test/` — inside the production source set
- ❌ `test/` — at the project root level

> **Explanation:** `src/test/` is the standard directory for JVM-based unit tests that don't need the Android framework. `src/androidTest/` is for instrumented tests that run on a device or emulator, like UI tests and database tests using real Android components.

### Coding Challenge: Create a Test Fixtures Module

Design a `TestFixtures` object that provides factory functions for creating test data across your app. Include factories for `User`, `Order`, and `Product` with sensible defaults and optional parameter overrides. Then write a test that uses these fixtures to verify an `OrderSummaryUseCase`.

#### Solution

```kotlin
// In :core:testing module
object TestFixtures {
    fun createUser(
        id: String = "user-1",
        name: String = "Test User",
        email: String = "test@example.com",
        isPremium: Boolean = false
    ) = User(id, name, email, isPremium)

    fun createProduct(
        id: String = "product-1",
        name: String = "Test Product",
        price: Double = 9.99
    ) = Product(id, name, price)

    fun createOrder(
        id: String = "order-1",
        userId: String = "user-1",
        products: List<Product> = listOf(createProduct()),
        status: OrderStatus = OrderStatus.PENDING
    ) = Order(id, userId, products, status)
}

// In :feature:orders test
class OrderSummaryUseCaseTest {
    private val fakeOrderRepo = FakeOrdersRepository()
    private val useCase = OrderSummaryUseCase(fakeOrderRepo)

    @Test
    fun `summary calculates total from all order products`() = runTest {
        val order = TestFixtures.createOrder(
            products = listOf(
                TestFixtures.createProduct(price = 10.00),
                TestFixtures.createProduct(id = "p2", price = 25.50)
            )
        )
        fakeOrderRepo.setOrders(listOf(order))

        val summary = useCase("user-1")

        assertEquals(35.50, summary.totalAmount, 0.01)
        assertEquals(1, summary.orderCount)
    }

    @Test
    fun `premium user gets 10 percent discount`() = runTest {
        val order = TestFixtures.createOrder(
            products = listOf(TestFixtures.createProduct(price = 100.00))
        )
        fakeOrderRepo.setOrders(listOf(order))

        val summary = useCase("user-1", isPremium = true)

        assertEquals(90.00, summary.totalAmount, 0.01)
    }
}
```

Factory functions with default parameters make tests concise — you only specify the fields relevant to each test case, keeping test code readable and focused.

---

## Module 7: Test-Driven Development (TDD)

### Lesson 7.1: The Red-Green-Refactor Cycle

1. **Red** — Write a failing test for the behavior you want
2. **Green** — Write the minimum code to make the test pass
3. **Refactor** — Clean up the code while keeping tests green

```kotlin
// Step 1: RED — test fails (PasswordValidator doesn't exist yet)
@Test
fun `password must be at least 8 characters`() {
    val validator = PasswordValidator()
    assertFalse(validator.isValid("short"))
    assertTrue(validator.isValid("longenough"))
}

// Step 2: GREEN — minimum implementation
class PasswordValidator {
    fun isValid(password: String): Boolean = password.length >= 8
}

// Step 3: REFACTOR — add more rules
@Test
fun `password must contain uppercase letter`() {
    val validator = PasswordValidator()
    assertFalse(validator.isValid("nouppercase1"))
    assertTrue(validator.isValid("HasUppercase1"))
}
```

### Lesson 7.2: When to Use TDD

TDD works best for:
- Business logic with clear rules (validators, calculators, mappers)
- Use cases and domain logic
- State machines and reducers

TDD is less practical for:
- UI layout code (test after implementing)
- Third-party library integration (you don't control the API)
- Exploratory prototyping (test after design solidifies)

**Key takeaway:** TDD isn't all-or-nothing. Use it for business logic where the rules are clear. Write UI tests after implementing the UI. The goal is well-tested code, not dogmatic process.

### Quiz: Test-Driven Development (TDD)

#### What are the three steps of the TDD cycle, in order?

- ❌ Green, Red, Refactor — write code first, then test, then clean up
- ❌ Refactor, Red, Green — clean up, write a test, make it pass
- ✅ Red, Green, Refactor — write a failing test, make it pass, then clean up
- ❌ Red, Refactor, Green — write a failing test, clean up, then make it pass

> **Explanation:** TDD follows Red-Green-Refactor: first write a test that fails (Red), then write the minimum code to pass it (Green), then improve the code structure while keeping tests green (Refactor). This cycle ensures every piece of code is driven by a test.

#### Which type of code is TDD most practical for?

- ❌ UI layout code and animations
- ❌ Third-party library integrations
- ✅ Business logic with clear rules — validators, calculators, and mappers
- ❌ Exploratory prototyping and proof-of-concepts

> **Explanation:** TDD shines when the rules are well-defined — password validators, price calculators, data mappers. You can express the expected behavior as a test before writing the implementation. UI code and third-party integrations are better tested after implementation.

#### In the TDD example, why does Step 2 (Green) emphasize writing the "minimum code" to pass?

- ❌ To reduce the total lines of code in the project
- ❌ To avoid writing documentation
- ✅ To prevent over-engineering — only build what the tests require, then refactor
- ❌ To make the CI pipeline run faster

> **Explanation:** Writing the minimum code to pass forces you to only implement what's needed. Over-engineering before requirements are clear leads to wasted effort and unnecessary complexity. The Refactor step is where you improve the design, guided by passing tests.

### Coding Challenge: TDD a Password Strength Checker

Using the Red-Green-Refactor approach, build a `PasswordStrengthChecker` that returns `Weak`, `Medium`, or `Strong`. Rules: Weak = less than 8 chars, Medium = 8+ chars with letters and numbers, Strong = 8+ chars with letters, numbers, and special characters. Write the tests FIRST, then provide the implementation.

#### Solution

```kotlin
enum class PasswordStrength { WEAK, MEDIUM, STRONG }

// Step 1: RED — write all tests first
class PasswordStrengthCheckerTest {
    private val checker = PasswordStrengthChecker()

    @Test
    fun `short password is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check("abc"))
    }

    @Test
    fun `8 chars with only letters is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check("abcdefgh"))
    }

    @Test
    fun `8 chars with letters and numbers is medium`() {
        assertEquals(PasswordStrength.MEDIUM, checker.check("abcdef12"))
    }

    @Test
    fun `8 chars with letters numbers and special char is strong`() {
        assertEquals(PasswordStrength.STRONG, checker.check("abcde1@Z"))
    }

    @Test
    fun `empty password is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check(""))
    }
}

// Step 2: GREEN — minimum implementation to pass
class PasswordStrengthChecker {
    fun check(password: String): PasswordStrength {
        if (password.length < 8) return PasswordStrength.WEAK

        val hasLetters = password.any { it.isLetter() }
        val hasDigits = password.any { it.isDigit() }
        val hasSpecial = password.any { !it.isLetterOrDigit() }

        return when {
            hasLetters && hasDigits && hasSpecial -> PasswordStrength.STRONG
            hasLetters && hasDigits -> PasswordStrength.MEDIUM
            else -> PasswordStrength.WEAK
        }
    }
}

// Step 3: REFACTOR — the implementation is already clean,
// but you could extract the character checks into extension
// functions or a rules-based pattern if requirements grow.
```

This exercise embodies the TDD workflow: writing tests first forced you to think about edge cases (empty string, letters-only at 8+ chars) before writing any implementation code.

---

Thank You for completing the Android Testing Mastery course! Tests aren't overhead — they're the foundation that lets you ship with confidence. 🧪
