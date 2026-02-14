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

---

Thank You for completing the Android Testing Mastery course! Tests aren't overhead — they're the foundation that lets you ship with confidence. 🧪
