---
title: "Android Testing Mastery"
layout: course
description: "Write tests that catch bugs — unit testing, Compose UI testing, integration tests, TDD patterns, test architecture, and mocking strategies."
icon: "🧪"
color: "#818cf8"
difficulty: "Beginner to Advanced"
modules: 10
lessons: 52
duration: "8 weeks"
order: 8
tags:
  - Testing
  - Android
  - TDD
what_you_learn:
  - "Write unit tests for ViewModels, Use Cases, and Repositories"
  - "Build reusable fakes instead of fragile mocks"
  - "Test Kotlin Flows with Turbine — cold flows, StateFlow, SharedFlow"
  - "Understand and defeat StateFlow conflation in tests"
  - "Test Compose UIs with ComposeTestRule and semantics"
  - "Write integration tests with Room and MockWebServer"
  - "Organize test architecture with shared test fixtures"
  - "Apply TDD (Red-Green-Refactor) for business logic"
  - "Write testable code using constructor injection and pure functions"
  - "Set up CI pipelines with test coverage and flake detection"
prerequisites:
  - "Kotlin fundamentals"
  - "Android development experience"
  - "Basic understanding of MVVM/architecture patterns"
  - "Familiarity with Kotlin coroutines and Flow"
---

## Module 1: Testing Fundamentals

Tests are the safety net that lets you refactor with confidence. Without them, every change is a gamble. A well-structured test suite catches regressions before they reach production, documents expected behavior better than any wiki, and gives you the courage to rewrite entire modules knowing you'll catch breakage immediately.

The goal of this module is to build a mental model for how testing works on Android — the pyramid that guides where to invest your effort, the structure every test should follow, the tools you'll use daily, and the naming conventions that turn cryptic failures into instant diagnosis.

### Lesson 1.1: The Testing Pyramid

The testing pyramid is a framework for distributing your test effort across three layers. At the base, **unit tests (60-70%)** are fast, isolated, and run on the JVM without any Android framework. They test individual classes and functions — ViewModels, use cases, mappers, validators. A unit test runs in 5ms and you can execute thousands of them in under a minute. They form the majority of your suite because they're cheap to write, cheap to run, and catch most logic bugs.

In the middle, **integration tests (20-30%)** verify that components work together correctly. Does your Room DAO actually persist and query data? Does your repository coordinate between the network and cache correctly? Does your Moshi adapter serialize edge-case JSON without crashing? Integration tests need more setup — an in-memory database, a MockWebServer, a real serializer — but they still run fast compared to UI tests. They catch wiring bugs that unit tests miss because unit tests replace dependencies with fakes.

At the top, **UI/E2E tests (5-10%)** validate complete user flows. They render real Compose screens, simulate taps and scrolls, and verify that the full stack from UI to data layer works end-to-end. They're expensive — slower to run, flakier, harder to debug — so you use them sparingly for critical paths like login, checkout, or onboarding. When your pyramid is inverted (many UI tests, few unit tests), CI takes 20 minutes and flakes constantly.

The common mistake is writing Compose UI tests for logic that should be unit tested. Testing a discount calculation doesn't require rendering UI — it's a pure function. Test it at the unit level where it runs in milliseconds, not at the UI level where it takes seconds and depends on rendering infrastructure. Every time you write a UI test, ask yourself: could this be a unit test? If the answer is yes, push it down the pyramid.

The testing pyramid is not a rigid rule — it's a guiding principle. Some teams skew toward more integration tests because their codebase has complex inter-component interactions. Others lean heavily on unit tests because their domain logic is the primary source of bugs. The key insight is that each layer has a different cost-benefit ratio. Unit tests are cheap to write and run but miss wiring bugs. Integration tests catch wiring bugs but are slower. UI tests catch end-to-end issues but are expensive and flaky. Distribute your effort accordingly.

Understanding the pyramid also helps with test planning. When you're about to write a test, ask: what layer should this live on? If you're testing that a ViewModel correctly maps a domain object to a UI state, that's a unit test. If you're testing that your Retrofit client correctly parses a JSON response and your Room DAO correctly persists the parsed entity, that's an integration test. If you're testing that a user can tap "Add to Cart," see the item count badge update, navigate to the cart screen, and complete checkout, that's an E2E test.

The pyramid also has implications for your CI pipeline. Unit tests should run on every PR — they're fast enough. Integration tests can run on every PR if they're quick, or nightly if they're slow. E2E tests should run nightly or on merge to main, never blocking individual PRs with flaky UI tests. This layered CI strategy keeps your feedback loop fast while still catching wiring and E2E bugs before they reach production.

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

```kotlin
// Integration test — real Room database, no UI
@RunWith(AndroidJUnit4::class)
class OrderDaoIntegrationTest {
    private lateinit var database: AppDatabase
    private lateinit var orderDao: OrderDao

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        orderDao = database.orderDao()
    }

    @After
    fun teardown() { database.close() }

    @Test
    fun `insert and query orders by status`() = runTest {
        orderDao.insert(OrderEntity("1", "Widget", "PENDING"))
        orderDao.insert(OrderEntity("2", "Gadget", "SHIPPED"))

        val pending = orderDao.getByStatus("PENDING")
        assertEquals(1, pending.size)
        assertEquals("Widget", pending[0].name)
    }
}
```

```kotlin
// UI/E2E test — renders real Compose screen
class CheckoutFlowTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun `user can complete checkout flow`() {
        composeTestRule.onNodeWithText("Add to Cart").performClick()
        composeTestRule.onNodeWithTag("cart_badge").assertTextEquals("1")
        composeTestRule.onNodeWithText("Checkout").performClick()
        composeTestRule.onNodeWithText("Order Confirmed").assertIsDisplayed()
    }
}
```

```kotlin
// Production code that the unit test above validates
class ShoppingCart {
    private val items = mutableListOf<Item>()

    fun addItem(item: Item) {
        items.add(item)
    }

    fun calculateTotal(): Double {
        return items.sumOf { it.price }
    }

    fun itemCount(): Int = items.size

    fun clear() { items.clear() }
}

data class Item(val name: String, val price: Double)
```

```kotlin
// More comprehensive unit test showing edge cases
class ShoppingCartTest {
    private lateinit var cart: ShoppingCart

    @Before
    fun setup() {
        cart = ShoppingCart()
    }

    @Test
    fun `empty cart has zero total`() {
        assertEquals(0.0, cart.calculateTotal(), 0.01)
    }

    @Test
    fun `single item total equals item price`() {
        cart.addItem(Item("Widget", 15.50))
        assertEquals(15.50, cart.calculateTotal(), 0.01)
    }

    @Test
    fun `multiple items sum correctly`() {
        cart.addItem(Item("Widget", 9.99))
        cart.addItem(Item("Gadget", 24.99))
        cart.addItem(Item("Gizmo", 5.00))
        assertEquals(39.98, cart.calculateTotal(), 0.01)
    }

    @Test
    fun `item count reflects added items`() {
        assertEquals(0, cart.itemCount())
        cart.addItem(Item("Widget", 9.99))
        assertEquals(1, cart.itemCount())
    }

    @Test
    fun `clear removes all items`() {
        cart.addItem(Item("Widget", 9.99))
        cart.clear()
        assertEquals(0, cart.itemCount())
        assertEquals(0.0, cart.calculateTotal(), 0.01)
    }
}
```

#### Common Mistakes

The most frequent pyramid anti-pattern is the **ice cream cone** — lots of manual testing, some E2E automation, very few unit tests. Teams end up here when testing is an afterthought. The code wasn't written to be testable, so unit tests are painful. The path of least resistance becomes "just write a UI test that clicks through the whole flow." This leads to slow CI, constant flakes, and developers who dread writing tests.

Another mistake is **testing at the wrong level**. If you're writing a Compose test to verify that `calculateDiscount(100.0, 10)` returns `90.0`, you're wasting time and infrastructure. That's a pure function — test it with a 5ms unit test, not a 2-second UI test that renders a screen, finds a text node, and parses the displayed price.

The third mistake is **no tests at all on the integration layer**. Teams with excellent unit tests and decent UI tests still ship bugs because they never test that their DAO query, their Retrofit endpoint, and their repository actually wire together correctly. The integration layer is where "it works on my machine" bugs live.

**Key takeaway:** Most of your tests should be unit tests. They're fast, reliable, and catch bugs early. UI tests are expensive and flaky — use them sparingly for critical paths.

### Lesson 1.2: Test Structure (Given-When-Then)

Every well-structured test has three distinct phases. **Given** (also called Arrange) sets up the preconditions — create fakes, configure state, prepare input data. **When** (Act) performs the single action under test — call the method, trigger the event, invoke the use case. **Then** (Assert) verifies the expected outcome — check return values, inspect state changes, assert on emissions.

This structure isn't just a naming convention. It forces you to think about test design. If your Given section is 30 lines long, your class probably has too many dependencies. If your When section performs multiple actions, you're testing two behaviors in one test — split it. If your Then section has 10 assertions, you're either testing too much or your output is too complex.

The three-phase structure also makes tests scannable. When a test fails in CI, you can glance at the Given section to understand the setup, the When section to see what was triggered, and the Then section to see what was expected vs. what actually happened. No detective work required.

Separating the three phases visually with blank lines or comments is a small practice that pays enormous dividends in readability. Some teams use explicit `// Given`, `// When`, `// Then` comments. Others just use blank lines between the phases. Either works — the point is that anyone reading the test can instantly identify each phase without tracing code logic.

The Given-When-Then pattern also exposes design smells. When your Given section requires constructing 8 different fakes and wiring them together, your class under test has too many dependencies. When your When section contains 3 method calls in sequence, you're testing a workflow, not a single behavior — split it into three tests. When your Then section asserts on 5 unrelated properties, you're testing too many concerns at once.

One subtle benefit of this structure is that it makes test duplication visible. If 10 tests have the same 15-line Given section, that's a signal to extract a shared setup method or use `@Before`. If 5 tests have different Given sections but identical When and Then sections, the tests are redundant — they test the same behavior with different inputs, which is better expressed as a parameterized test.

The Given-When-Then pattern also maps directly to how you describe behavior in plain English. "Given a user with a valid email, when they click login, then they should see the home screen." This mapping makes tests serve as executable specifications — each test is a statement about what the system should do under specific conditions.

For Android ViewModel tests, the pattern adapts slightly. The Given phase sets up fakes and creates the ViewModel. The When phase calls a ViewModel method (like `loadProfile("user-1")`). The Then phase uses Turbine to assert on the StateFlow emissions. The three-phase structure remains clear even with the asynchronous nature of Flow-based testing.

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

```kotlin
// Complete test class showing Given-When-Then across multiple tests
class PriceCalculatorTest {
    private lateinit var calculator: PriceCalculator

    // Shared Given — setup for all tests
    @Before
    fun setup() {
        calculator = PriceCalculator(taxRate = 0.08)
    }

    @Test
    fun `calculates price with tax for single item`() {
        // Given (additional setup specific to this test)
        val item = Item("Widget", price = 100.0)

        // When
        val result = calculator.calculateWithTax(item)

        // Then
        assertEquals(108.0, result, 0.01)
    }

    @Test
    fun `applies bulk discount for quantities over 10`() {
        // Given
        val items = List(15) { Item("Widget", price = 10.0) }

        // When
        val result = calculator.calculateBulkPrice(items)

        // Then — 15 items at $10 with 10% bulk discount = $135
        assertEquals(135.0, result, 0.01)
    }

    @Test
    fun `throws on negative price`() {
        // Given
        val item = Item("Widget", price = -5.0)

        // When & Then — exception is the expected outcome
        assertThrows<IllegalArgumentException> {
            calculator.calculateWithTax(item)
        }
    }
}
```

```kotlin
// Production code under test
class PriceCalculator(private val taxRate: Double) {
    fun calculateWithTax(item: Item): Double {
        require(item.price >= 0) { "Price cannot be negative" }
        return item.price * (1 + taxRate)
    }

    fun calculateBulkPrice(items: List<Item>): Double {
        val subtotal = items.sumOf { it.price }
        val discount = if (items.size > 10) subtotal * 0.10 else 0.0
        return subtotal - discount
    }
}
```

```kotlin
// Given-When-Then with Turbine for ViewModel testing
class SearchViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `search with valid query returns results`() = runTest {
        // Given
        val fakeRepo = FakeSearchRepository()
        fakeRepo.setResults("kotlin", listOf(
            SearchResult("1", "Kotlin Basics"),
            SearchResult("2", "Kotlin Coroutines")
        ))
        val viewModel = SearchViewModel(fakeRepo)

        // When & Then (interleaved due to Flow collection)
        viewModel.state.test {
            assertEquals(SearchState.Idle, awaitItem()) // Given: initial state

            viewModel.search("kotlin")                   // When: trigger action
            assertEquals(SearchState.Loading, awaitItem()) // Then: loading shown
            val results = awaitItem()                      // Then: results arrived
            assertIs<SearchState.Success>(results)
            assertEquals(2, (results as SearchState.Success).items.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Anti-pattern: test without clear structure
@Test
fun `messy test that does too much`() {
    val repo = FakeUserRepository()
    val user = User("1", "Mukul", "mukul@test.com")
    repo.setUser(user)
    val viewModel = ProfileViewModel(repo)
    viewModel.loadProfile("1")
    assertEquals(ProfileState.Loading, viewModel.state.value) // might be stale
    Thread.sleep(100) // hoping the async operation finishes
    val state = viewModel.state.value
    assertTrue(state is ProfileState.Success)
    assertEquals("Mukul", (state as ProfileState.Success).user.name)
    assertEquals("mukul@test.com", state.user.email)
    viewModel.updateEmail("new@test.com")
    // Now testing a second behavior in the same test...
}
```

#### Common Mistakes

**Mixing multiple When phases in one test.** Each test should have exactly one action being tested. If you're calling `viewModel.loadProfile()` and then `viewModel.updateEmail()` in the same test, you're testing two behaviors. Split it into `loadProfile shows user data` and `updateEmail updates displayed email`.

**Asserting on too many unrelated things.** A test for "login with valid credentials" should assert on the login result. It shouldn't also assert that the analytics event was tracked, the session was stored, and the welcome notification was scheduled. Each of those is a separate behavior with its own test.

**Using Thread.sleep() in the When phase.** If you need to sleep to wait for an async operation, your test setup is wrong. Use `runTest` with `advanceUntilIdle()` for coroutines, or Turbine's `awaitItem()` for Flow emissions. Real time should never appear in unit tests.

**Key takeaway:** Every test has three parts: setup (Given), action (When), and assertion (Then). Name tests descriptively — a failing test name should tell you what's broken without reading the code.

### Lesson 1.3: Test Naming and Organization

Test names are documentation. When a test fails at 2 AM in your CI pipeline, the name is the first (and sometimes only) thing you see. A name like `test1()` tells you nothing. A name like `login with expired token redirects to sign in screen` tells you exactly what broke, which feature is affected, and what the expected behavior was.

Kotlin's backtick syntax lets you write test names as natural English sentences. Use the pattern `action + condition + expected result`. For example: `calculateTip with zero percent returns zero`, `search with empty query returns empty list`, `loadProfile on network error shows cached data`. Each name reads like a specification of what the system should do.

Organize test files to mirror your production code structure. If your production code lives in `com.app.feature.login.LoginViewModel`, your test lives in `com.app.feature.login.LoginViewModelTest`. This makes it trivial to navigate between production code and its tests. Within a test class, group related tests logically — all happy-path tests first, then error cases, then edge cases.

Good test names eliminate the need to read test code during failure triage. In a CI report showing 200 passing tests and 1 failure, the failing test's name should tell the on-call engineer everything they need to know: what feature is affected, what scenario broke, and what the expected behavior was. `login with expired token redirects to sign in screen` immediately tells you: the login feature is broken, specifically the expired token handling, and the expected behavior is a redirect to the sign-in screen.

Avoid implementation-leaking names. `test_repository_calls_api_then_dao` tells you about internal wiring, not behavior. It will break when you refactor the repository even if the external behavior is unchanged. `repository returns cached data when network fails` describes observable behavior that survives refactoring.

For naming conventions, teams generally adopt one of three styles: `method under test + scenario + expected result` (e.g., `calculateTip_zeroPercent_returnsZero`), natural English in backticks (e.g., `calculate tip with zero percent returns zero`), or BDD-style (e.g., `given zero tip percent, when calculating, then returns zero`). Pick one style and be consistent across the entire codebase. Inconsistency is worse than any single style choice.

Test organization within a class matters more than most developers realize. When a test class has 40 tests in random order, finding the test for a specific scenario requires scanning the entire file. Group tests by category with clear comments or use nested classes. This turns the test file into a browsable specification document.

For large ViewModels with many actions and states, consider splitting into multiple test classes. `ProfileViewModelLoadTest` for load-related tests, `ProfileViewModelEditTest` for edit-related tests, `ProfileViewModelDeleteTest` for delete-related tests. Each test class has a focused purpose and is easier to navigate than a monolithic 500-line test file.

```kotlin
class LoginViewModelTest {
    // Happy path
    @Test fun `login with valid credentials returns success`() { /* ... */ }
    @Test fun `login with valid credentials sets user session`() { /* ... */ }

    // Error cases
    @Test fun `login with wrong password returns error`() { /* ... */ }
    @Test fun `login with network error shows offline message`() { /* ... */ }

    // Edge cases
    @Test fun `login with empty email shows validation error`() { /* ... */ }
    @Test fun `login trims whitespace from email`() { /* ... */ }
}
```

```kotlin
// Nested class organization for complex ViewModels
class OrdersViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeRepo = FakeOrdersRepository()
    private lateinit var viewModel: OrdersViewModel

    @Before
    fun setup() {
        viewModel = OrdersViewModel(fakeRepo)
    }

    // Group: Loading orders
    @Test fun `loadOrders shows loading then success`() = runTest { /* ... */ }
    @Test fun `loadOrders with empty result shows empty state`() = runTest { /* ... */ }
    @Test fun `loadOrders on network error shows error with retry`() = runTest { /* ... */ }

    // Group: Filtering
    @Test fun `filterByStatus shows only matching orders`() = runTest { /* ... */ }
    @Test fun `clearFilter shows all orders`() = runTest { /* ... */ }

    // Group: Order actions
    @Test fun `cancelOrder removes order from list`() = runTest { /* ... */ }
    @Test fun `reorder adds items to cart`() = runTest { /* ... */ }
}
```

```kotlin
// Bad naming examples vs good naming examples
class NamingExamplesTest {
    // BAD: tells you nothing about what broke
    @Test fun test1() { /* ... */ }
    @Test fun testLogin() { /* ... */ }
    @Test fun `test calculate`() { /* ... */ }

    // BAD: describes implementation, not behavior
    @Test fun `calls repository authenticate method`() { /* ... */ }
    @Test fun `verifies dao insert was called`() { /* ... */ }

    // GOOD: describes behavior clearly
    @Test fun `login with valid credentials navigates to home`() { /* ... */ }
    @Test fun `expired session redirects to login screen`() { /* ... */ }
    @Test fun `discount caps at 50 percent for non-premium users`() { /* ... */ }
    @Test fun `search with special characters returns empty results`() { /* ... */ }
}
```

```kotlin
// Parameterized tests for exhaustive edge case coverage
class EmailValidatorNamingTest {
    private val validator = EmailValidator()

    // Each test name clearly states the scenario
    @Test fun `valid standard email passes validation`() {
        assertTrue(validator.isValid("user@example.com"))
    }
    @Test fun `email with subdomain passes validation`() {
        assertTrue(validator.isValid("user@mail.example.com"))
    }
    @Test fun `email with plus tag passes validation`() {
        assertTrue(validator.isValid("user+tag@example.com"))
    }
    @Test fun `email without at symbol fails validation`() {
        assertFalse(validator.isValid("userexample.com"))
    }
    @Test fun `email with multiple at symbols fails validation`() {
        assertFalse(validator.isValid("user@@example.com"))
    }
    @Test fun `empty string fails validation`() {
        assertFalse(validator.isValid(""))
    }
    @Test fun `email with spaces fails validation`() {
        assertFalse(validator.isValid("user @example.com"))
    }
}
```

#### Common Mistakes

**Using `@Test fun testSomething()` without backticks.** Java-style camelCase test names like `testLoginWithValidCredentials` are harder to read than `login with valid credentials returns success`. Kotlin backtick syntax exists specifically for this — use it.

**Naming tests after the method being called instead of the behavior.** `calculateTotal returns 34.98` is fragile — it breaks when the test data changes. `calculateTotal sums all item prices` is stable — it describes the behavior regardless of specific numbers.

**Not grouping related tests.** A test file with 30 tests in random order is a nightmare to navigate. Group by feature/action and add section comments. Future you will thank present you.

**Key takeaway:** Test names are specifications. Use backtick syntax to write natural English names that describe the behavior, not the implementation. When a test fails, the name alone should tell you what's broken.

### Lesson 1.4: JUnit Setup and Assertions

JUnit 4 is the standard test runner on Android. Every test class is a plain Kotlin class with methods annotated `@Test`. JUnit provides lifecycle hooks — `@Before` runs before each test (set up shared state), `@After` runs after each test (clean up resources), and `@Rule` attaches reusable behaviors like dispatchers or Compose test rules.

For assertions, you have multiple options. JUnit's built-in `assertEquals`, `assertTrue`, `assertFalse`, and `assertThrows` cover the basics. Google's Truth library provides more readable assertions with better failure messages — `assertThat(result).isEqualTo(expected)` tells you both the actual and expected values without digging through stack traces. Kotlin's own `kotlin.test` package gives you `assertEquals`, `assertIs<Type>`, and `assertFailsWith<Exception>` with Kotlin-idiomatic syntax.

The most common mistake beginners make is using `assertTrue` for everything. `assertTrue(result == expected)` gives you "Expected true but was false" on failure — useless. `assertEquals(expected, result)` gives you "Expected 42 but was 37" — immediately actionable. Always use the most specific assertion available.

Understanding the JUnit lifecycle is critical for avoiding test pollution. Each `@Test` method runs on a fresh instance of the test class in JUnit 4. Properties initialized inline or in `@Before` are reset for each test. This means `private val users = mutableListOf<User>()` starts empty for every test — you don't need to clear it manually. But `@Before` is where you should initialize complex dependencies like ViewModels or fakes that need configuration.

The `@After` method is your cleanup hook. Use it to close databases, shut down mock servers, reset dispatchers, and release any resources your test acquired. Even though JUnit creates a fresh test class instance for each test, external resources (like an in-memory database or a running MockWebServer) persist across tests if they're shared. `@After` guarantees cleanup runs even when a test fails — unlike cleanup code at the end of a `@Test` method, which is skipped when an assertion throws.

JUnit `@Rule` is a powerful mechanism for reusable test infrastructure. Instead of repeating the same `@Before`/`@After` setup in every test class, encapsulate it in a `TestRule`. `MainDispatcherRule` replaces `Dispatchers.Main` for all ViewModel tests. `ComposeTestRule` manages the Compose runtime. You can compose multiple rules with `RuleChain` when you need ordering guarantees between them.

`assertThrows` deserves special attention because it's commonly misused. It takes a lambda and asserts that executing the lambda throws the specified exception type. The returned exception object can be further inspected for message content or cause chain. Never use `try-catch` blocks for exception testing — `assertThrows` is cleaner, more readable, and guarantees the test fails if no exception is thrown.

For floating-point assertions, always use `assertEquals(expected, actual, delta)` with a tolerance. `assertEquals(0.3, 0.1 + 0.2)` fails because floating-point arithmetic produces `0.30000000000000004`. `assertEquals(0.3, 0.1 + 0.2, 0.001)` passes because it allows a 0.001 tolerance. Without the delta parameter, you'll fight phantom failures.

```kotlin
class PriceFormatterTest {
    private lateinit var formatter: PriceFormatter

    @Before
    fun setup() {
        formatter = PriceFormatter(locale = Locale.US)
    }

    @Test
    fun `formats positive amounts with dollar sign`() {
        assertEquals("$9.99", formatter.format(9.99))
    }

    @Test
    fun `formats zero as zero dollars`() {
        assertEquals("$0.00", formatter.format(0.0))
    }

    @Test
    fun `formats negative amounts with minus sign`() {
        assertEquals("-$5.99", formatter.format(-5.99))
    }

    @Test
    fun `throws on NaN input`() {
        assertThrows<IllegalArgumentException> {
            formatter.format(Double.NaN)
        }
    }
}
```

```kotlin
// Production code
class PriceFormatter(private val locale: Locale) {
    private val format = NumberFormat.getCurrencyInstance(locale)

    fun format(amount: Double): String {
        require(!amount.isNaN()) { "Amount cannot be NaN" }
        return format.format(amount)
    }
}
```

```kotlin
// Comprehensive JUnit lifecycle demonstration
class UserServiceTest {
    private lateinit var service: UserService
    private lateinit var fakeRepo: FakeUserRepository
    private lateinit var fakeAnalytics: FakeAnalytics

    @Before
    fun setup() {
        fakeRepo = FakeUserRepository()
        fakeAnalytics = FakeAnalytics()
        service = UserService(fakeRepo, fakeAnalytics)
    }

    @After
    fun teardown() {
        fakeRepo.clear()
        fakeAnalytics.clear()
    }

    @Test
    fun `getUser returns user from repository`() = runTest {
        fakeRepo.setUser(User("1", "Mukul", "mukul@test.com"))

        val user = service.getUser("1")

        assertEquals("Mukul", user.name)
    }

    @Test
    fun `getUser tracks analytics event`() = runTest {
        fakeRepo.setUser(User("1", "Mukul", "mukul@test.com"))

        service.getUser("1")

        assertEquals(1, fakeAnalytics.trackedEvents.size)
        assertEquals("user_viewed", fakeAnalytics.trackedEvents[0].name)
    }

    @Test
    fun `getUser throws when user not found`() = runTest {
        assertThrows<UserNotFoundException> {
            service.getUser("nonexistent")
        }
    }
}
```

```kotlin
// Assertion styles comparison
class AssertionStylesTest {
    @Test
    fun `JUnit assertions`() {
        val result = Calculator().add(2, 3)
        assertEquals(5, result)                      // clear failure message
        assertNotEquals(0, result)                    // negation
        assertTrue(result > 0)                       // boolean check
        assertFalse(result < 0)                      // negated boolean
    }

    @Test
    fun `Kotlin test assertions`() {
        val result: Any = Calculator().add(2, 3)
        assertEquals(5, result)
        assertIs<Int>(result)                        // type assertion with smart cast
        assertFailsWith<ArithmeticException> {       // exception testing
            Calculator().divide(1, 0)
        }
    }

    @Test
    fun `assertThrows returns the exception for inspection`() {
        val exception = assertThrows<IllegalArgumentException> {
            PriceFormatter(Locale.US).format(Double.NaN)
        }
        assertTrue(exception.message!!.contains("NaN"))
    }
}
```

```kotlin
// Floating-point assertion gotchas
class FloatingPointTest {
    @Test
    fun `floating point requires delta tolerance`() {
        // This would FAIL without delta:
        // assertEquals(0.3, 0.1 + 0.2)  // 0.30000000000000004 != 0.3

        // Correct: use delta parameter
        assertEquals(0.3, 0.1 + 0.2, 0.001)
    }

    @Test
    fun `currency calculations need rounding`() {
        val tax = 19.99 * 0.08
        assertEquals(1.60, tax, 0.01) // allow 1 cent tolerance
    }
}
```

#### Common Mistakes

**Forgetting `@After` cleanup.** If your test opens a database or starts a server, always close/stop it in `@After`. Leaking resources causes cascading test failures that are painful to debug — test B fails because test A didn't clean up, but test B's failure message has nothing to do with the actual problem.

**Using `assertTrue(result == expected)` instead of `assertEquals(expected, result)`.** The failure message from `assertTrue` is useless: "Expected true but was false." `assertEquals` tells you "Expected 42 but got 37." This single change saves hours of debugging over a project's lifetime.

**Testing with `@Before` setup that's too broad.** If only 3 of your 20 tests need a premium user, don't create a premium user in `@Before`. Create a default user in `@Before` and let the 3 tests that need premium override the setup locally. Over-broad `@Before` makes tests harder to understand because the setup is disconnected from the test's assertions.

**Key takeaway:** Use the most specific assertion available — `assertEquals` over `assertTrue`, `assertIs<Type>` over manual type checks. Better assertions give better failure messages, which means faster debugging.

### Lesson 1.5: Common Testing Mistakes

The first mistake is **testing implementation instead of behavior**. If your test breaks because you renamed a private method or reordered internal steps, it's testing how the code works, not what it does. Tests should assert on observable outcomes — return values, state changes, emitted events — not on internal wiring.

The second mistake is **flaky tests**. A flaky test passes sometimes and fails sometimes with the same code. Common causes: depending on real time (`System.currentTimeMillis()`), depending on execution order between tests, using shared mutable state, or testing concurrent code without proper synchronization. Every flaky test erodes trust in your suite. When developers learn to ignore red CI, you might as well have no tests at all.

The third mistake is **testing the framework**. You don't need to test that Room inserts data — Google tested that. You need to test that your DAO query returns the right results with your specific schema. You don't need to test that `StateFlow` emits values — JetBrains tested that. You need to test that your ViewModel emits the right sequence of states for your business logic. Focus your testing effort on your code, not on the libraries you depend on.

The fourth mistake is **too many assertions per test**. A test with 15 assertions is testing 15 things. When it fails, which assertion broke? You have to read the stack trace, find the line number, and reverse-engineer what went wrong. One behavior per test, one or two assertions per test. If you need to verify multiple aspects of a result, it's fine to have a few assertions on the same return value — but never on unrelated behaviors.

The fifth mistake is **not testing edge cases**. Happy path tests are easy and feel productive. But production bugs almost never live on the happy path — they hide in edge cases. What happens when the input is null? When the list is empty? When the network returns a 0-byte response body? When the user enters a string with 10,000 characters? When the timestamp is exactly midnight UTC? Edge case tests are where the real value lives.

The sixth mistake is **writing tests that are too tightly coupled to the production code's structure**. If you refactor production code — extract a method, rename a variable, move logic to a helper class — and your tests break even though the behavior didn't change, your tests are coupled to structure, not behavior. This makes refactoring expensive because you have to update production code AND tests simultaneously.

The seventh mistake is **ignoring test maintenance cost**. Tests are code. They need maintenance. A test suite with 500 tests that nobody understands is a liability, not an asset. When someone changes production code and 50 tests break, they don't fix 50 tests — they delete them. Write tests that are easy to read, easy to maintain, and easy to update when requirements change.

The eighth mistake is **not running tests locally before pushing**. Running `./gradlew test` takes 30 seconds for most projects. Pushing to CI and waiting 5 minutes for the pipeline to report a simple assertion failure is wasteful. Run tests locally, catch obvious failures, and push only when your local suite is green.

```kotlin
// Bad — testing implementation details
@Test
fun `login calls repository then analytics then navigator`() {
    viewModel.login("user@test.com", "pass")
    verify(mockRepo).authenticate("user@test.com", "pass")  // implementation
    verify(mockAnalytics).track("login_success")             // implementation
    verify(mockNavigator).navigateTo(Screen.Home)            // implementation
}

// Good — testing observable behavior
@Test
fun `successful login navigates to home screen`() {
    viewModel.login("user@test.com", "pass")
    assertEquals(Screen.Home, viewModel.currentScreen.value)
}
```

```kotlin
// Bad — testing the framework (Room inserts data)
@Test
fun `room can insert and retrieve data`() {
    val entity = UserEntity("1", "Test")
    dao.insert(entity)
    val result = dao.getById("1")
    assertEquals(entity, result) // Tests Room, not your code
}

// Good — testing YOUR query logic with YOUR schema
@Test
fun `getActiveUsers excludes deactivated accounts`() {
    dao.insert(UserEntity("1", "Active User", isActive = true))
    dao.insert(UserEntity("2", "Deactivated User", isActive = false))

    val activeUsers = dao.getActiveUsers()

    assertEquals(1, activeUsers.size)
    assertEquals("Active User", activeUsers[0].name)
}
```

```kotlin
// Bad — too many assertions testing unrelated behaviors
@Test
fun `login test`() {
    viewModel.login("user@test.com", "pass")
    assertEquals(LoginState.Success, viewModel.state.value)
    assertTrue(fakeAnalytics.trackedEvents.contains("login"))
    assertNotNull(fakeSessionStore.currentSession)
    assertEquals("user@test.com", fakeSessionStore.currentSession?.email)
    assertTrue(viewModel.isLoggedIn)
    assertEquals(0, viewModel.loginAttempts)
    // ...15 more assertions
}

// Good — one behavior per test
@Test
fun `successful login updates state to success`() {
    viewModel.login("user@test.com", "pass")
    assertEquals(LoginState.Success, viewModel.state.value)
}

@Test
fun `successful login tracks analytics event`() {
    viewModel.login("user@test.com", "pass")
    assertTrue(fakeAnalytics.trackedEvents.contains("login"))
}

@Test
fun `successful login stores session`() {
    viewModel.login("user@test.com", "pass")
    assertNotNull(fakeSessionStore.currentSession)
}
```

```kotlin
// Edge case testing examples
class PasswordValidatorEdgeCaseTest {
    private val validator = PasswordValidator()

    @Test fun `empty password is invalid`() {
        assertFalse(validator.isValid(""))
    }

    @Test fun `password with only spaces is invalid`() {
        assertFalse(validator.isValid("        "))
    }

    @Test fun `password at exact minimum length is valid`() {
        assertTrue(validator.isValid("Abcdefg1"))  // exactly 8 chars
    }

    @Test fun `password one character below minimum is invalid`() {
        assertFalse(validator.isValid("Abcdef1"))  // 7 chars
    }

    @Test fun `password with unicode characters is valid`() {
        assertTrue(validator.isValid("Pässwörd1"))
    }

    @Test fun `extremely long password is valid`() {
        val longPassword = "A" + "a".repeat(998) + "1"
        assertTrue(validator.isValid(longPassword))
    }
}
```

```kotlin
// Production code with edge cases worth testing
class PasswordValidator {
    fun isValid(password: String): Boolean {
        if (password.isBlank()) return false
        if (password.length < 8) return false
        if (!password.any { it.isUpperCase() }) return false
        if (!password.any { it.isDigit() }) return false
        return true
    }
}
```

#### Common Mistakes

**Writing tests only for the happy path.** If every test in your suite starts with valid data and expects success, you have zero coverage for error scenarios. Production users will trigger every error path you didn't test — network failures, invalid inputs, expired tokens, race conditions. Write at least one error test for every happy path test.

**Sharing mutable state between tests via companion objects or singletons.** Test A modifies a shared map, test B reads from it. Tests pass when run together but fail when run individually, or vice versa. Each test should create its own instances of everything it needs.

**Using `Thread.sleep()` to wait for async operations.** This makes tests slow and flaky. Use `runTest` with `advanceUntilIdle()` for coroutine-based code. Use Turbine's `awaitItem()` for Flow-based code. Use ComposeTestRule's automatic idle waiting for Compose tests.

**Key takeaway:** Test what your code does, not how it does it. Avoid flaky tests, framework testing, and excessive assertions. Every test should verify one behavior and fail for exactly one reason.

### Quiz: Testing Fundamentals

#### According to the testing pyramid, what percentage of your tests should be unit tests?

- ❌ 10% — unit tests are the least important layer
- ❌ 50% — split evenly between unit and UI tests
- ✅ 60-70% — unit tests form the broad base of the pyramid
- ❌ 100% — only unit tests matter

> **Explanation:** The testing pyramid recommends 60-70% unit tests, 20-30% integration tests, and 5-10% UI/E2E tests. Unit tests are fast, reliable, and cheap to run, so they should form the foundation of your test suite.

#### What are the three parts of the Given-When-Then test structure?

- ❌ Initialize, Execute, Verify
- ✅ Setup (Given), Action (When), Assertion (Then)
- ❌ Build, Run, Check
- ❌ Arrange, Process, Return

> **Explanation:** Given-When-Then (also called Arrange-Act-Assert) divides a test into three clear phases: setting up preconditions (Given), performing the action under test (When), and verifying the expected outcome (Then).

#### Why is `assertEquals(expected, result)` preferred over `assertTrue(result == expected)`?

- ❌ `assertEquals` runs faster than `assertTrue`
- ❌ `assertTrue` is deprecated in JUnit 4
- ✅ `assertEquals` shows both expected and actual values on failure; `assertTrue` only says "expected true"
- ❌ `assertEquals` works with nullable types; `assertTrue` does not

> **Explanation:** When a test fails, `assertEquals` prints "Expected 42 but was 37" — immediately actionable. `assertTrue` prints "Expected true but was false" — useless for debugging. Always use the most specific assertion available.

### Coding Challenge: Write Your First Unit Test

Create a `TipCalculator` class with a `calculateTip(billAmount: Double, tipPercent: Int): Double` method, then write tests covering a normal tip, a zero tip, a negative bill (should throw), and rounding behavior.

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
        val tip = calculator.calculateTip(50.0, 15)
        assertEquals(7.50, tip, 0.01)
    }

    @Test
    fun `zero percent tip returns zero`() {
        assertEquals(0.0, calculator.calculateTip(100.0, 0), 0.01)
    }

    @Test
    fun `tip rounds to two decimal places`() {
        assertEquals(5.00, calculator.calculateTip(33.33, 15), 0.01)
    }

    @Test
    fun `negative bill amount throws`() {
        assertThrows<IllegalArgumentException> {
            calculator.calculateTip(-10.0, 15)
        }
    }
}
```

This exercise practices the Given-When-Then structure from Lesson 1.2. Each test is focused on a single behavior and uses a descriptive name that explains what should happen.

---

## Module 2: Writing Testable Code

The biggest obstacle to testing is never the testing framework — it's untestable code. When your ViewModel creates its own repository internally, when your business logic is tangled with Android framework calls, when side effects are scattered everywhere, no amount of testing expertise can save you. This module covers the architectural patterns that make code naturally testable.

### Lesson 2.1: Constructor Injection

Constructor injection is the single most impactful thing you can do for testability. The idea is dead simple — every dependency a class needs should be passed through its constructor. No reaching into singletons, no late-initialized fields, no invisible setup. When you look at a constructor, you should see the complete list of things that class depends on.

If all dependencies live in the constructor, you can swap any of them with a test double. There's no hidden state, no surprise initialization order, and no "oh, you also need to call `init()` first" nonsense. In production, Hilt or Koin provides the real implementations. In tests, you hand in whatever fakes you want. That separation is everything.

Field injection (using `@Inject lateinit var`) works in Android components like Activities and Fragments where you don't control the constructor. But for ViewModels, repositories, and use cases — always prefer constructor injection. It makes dependencies explicit and the class honest about what it needs.

Constructor injection also acts as a natural complexity limiter. When your constructor has 8 parameters, the design smell is immediately visible. You can see the class depends on too many things. Without constructor injection, those 8 dependencies would be scattered across field injections, singleton lookups, and hidden initializations — the same coupling exists, but it's invisible. Making it visible is the first step to fixing it.

The relationship between constructor injection and the Dependency Inversion Principle is direct. Your ViewModel constructor takes `UserRepository` (an interface), not `UserRepositoryImpl` (the concrete class). This means the ViewModel doesn't know or care whether it's talking to a real repository, a fake repository, or a mock. The contract is the interface. In production, Hilt binds the real implementation. In tests, you pass a fake. The ViewModel code doesn't change — only the injection site does.

For ViewModel testing, constructor injection eliminates the need for `@HiltAndroidTest`, `@Inject`, and the entire Hilt test infrastructure. You just call `ProfileViewModel(fakeRepo)`. No Hilt component, no test application, no annotation processing. This makes ViewModel tests pure JVM tests that run in milliseconds.

A common pushback against constructor injection is "but Hilt handles all that." Hilt is great for production wiring. But Hilt test infrastructure is slow, complex, and requires an Android test runner. Constructor injection gives you the best of both worlds — Hilt in production for automatic wiring, direct construction in tests for speed and simplicity.

When refactoring existing code toward constructor injection, follow a simple recipe. First, identify all the places a class creates or fetches its dependencies internally. Second, move those dependencies to constructor parameters. Third, update the DI module (Hilt, Koin) to provide those dependencies. Fourth, update tests to pass fakes through the constructor. Each step is small and safe, and each step makes the class more testable.

```kotlin
// Hard to test — hidden dependency
class PaymentViewModel : ViewModel() {
    private val repository = PaymentRepositoryImpl(
        api = RetrofitClient.paymentApi,
        cache = RoomDatabase.getInstance().paymentDao()
    )

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            repository.charge(amount)
        }
    }
}

// Easy to test — explicit constructor injection
class PaymentViewModel(
    private val repository: PaymentRepository
) : ViewModel() {

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            repository.charge(amount)
        }
    }
}
```

```kotlin
// Production wiring with Hilt
@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val repository: PaymentRepository
) : ViewModel() {
    // Same code as above — Hilt provides the real PaymentRepositoryImpl
    fun processPayment(amount: Double) {
        viewModelScope.launch {
            repository.charge(amount)
        }
    }
}

@Module
@InstallIn(ViewModelComponent::class)
abstract class PaymentModule {
    @Binds
    abstract fun bindPaymentRepository(
        impl: PaymentRepositoryImpl
    ): PaymentRepository
}
```

```kotlin
// Test wiring — no Hilt needed
class PaymentViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `processPayment transitions through processing to confirmed`() = runTest {
        val fakeRepo = FakePaymentRepository()
        val viewModel = PaymentViewModel(fakeRepo)

        viewModel.state.test {
            assertEquals(PaymentState.Idle, awaitItem())
            viewModel.processPayment(49.99)
            assertEquals(PaymentState.Processing, awaitItem())
            assertIs<PaymentState.Confirmed>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `processPayment with network error shows retry`() = runTest {
        val fakeRepo = FakePaymentRepository().apply { shouldFail = true }
        val viewModel = PaymentViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.processPayment(49.99)
            awaitItem() // Processing
            val error = awaitItem()
            assertIs<PaymentState.Error>(error)
            assertTrue(error.isRetryable)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// FakePaymentRepository — reusable test double
class FakePaymentRepository : PaymentRepository {
    var shouldFail = false
    var failureException: Exception = IOException("Network error")
    val chargedAmounts = mutableListOf<Double>()

    override suspend fun charge(amount: Double): PaymentResult {
        if (shouldFail) throw failureException
        chargedAmounts.add(amount)
        return PaymentResult.Success(transactionId = "txn-${amount.hashCode()}")
    }

    override suspend fun getHistory(): List<PaymentRecord> {
        if (shouldFail) throw failureException
        return chargedAmounts.mapIndexed { index, amount ->
            PaymentRecord("txn-$index", amount, System.currentTimeMillis())
        }
    }
}
```

```kotlin
// Multi-dependency constructor injection example
class CheckoutViewModel(
    private val cartRepository: CartRepository,
    private val paymentRepository: PaymentRepository,
    private val shippingCalculator: ShippingCalculator,
    private val discountEngine: DiscountEngine
) : ViewModel() {
    // Each dependency is visible, swappable, and testable
    // If this constructor feels too long, the class has too many responsibilities
}

// Test with all fakes
class CheckoutViewModelTest {
    private val fakeCart = FakeCartRepository()
    private val fakePayment = FakePaymentRepository()
    private val fakeShipping = FakeShippingCalculator()
    private val fakeDiscount = FakeDiscountEngine()

    private fun createViewModel() = CheckoutViewModel(
        fakeCart, fakePayment, fakeShipping, fakeDiscount
    )
}
```

#### Common Mistakes

**Mixing constructor injection with service locator patterns.** If your ViewModel takes some dependencies via the constructor and fetches others from `ServiceLocator.get<Analytics>()`, you have the worst of both worlds. The constructor-injected dependencies are testable; the service locator ones are hidden and untestable.

**Not injecting dispatchers.** If your ViewModel hardcodes `Dispatchers.IO` for background work, you can't control execution order in tests. Inject the dispatcher via the constructor: `class MyViewModel(private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO)`. In tests, pass `StandardTestDispatcher()`.

**Creating dependencies inside `init {}` blocks.** Moving dependency creation from the constructor body to an `init` block doesn't make it any more testable. The dependency is still hidden. If it's created internally, it can't be swapped in tests.

**Key takeaway:** Constructor injection makes dependencies explicit and swappable. If you can't easily construct a class in a test without real infrastructure, the class has a design problem, not a testing problem.

### Lesson 2.2: Interface Abstraction

Using interfaces to abstract dependencies is one of the basic requirements for testable code. When your ViewModel depends on a `LoginRepository` interface instead of `LoginRepositoryImpl`, you can swap in any implementation during tests. The interface acts as a contract — your test double just needs to fulfill that contract.

But don't go overboard — creating interfaces for absolutely everything, even classes that will only ever have one implementation, just adds noise. Follow a simple rule: create an interface when the class has external side effects (network, database, shared preferences, file system) or when you genuinely need polymorphism. Pure logic classes that just transform data? Skip the interface. You can test them directly.

The exception is when you're working in a large team with modular architecture. In that case, interfaces at module boundaries make sense even for single implementations, because they define API contracts between modules. But for classes internal to a module, be pragmatic about it.

Interface design for testability has a subtle but important principle: keep interfaces small and focused. An interface with 15 methods is harder to fake than three interfaces with 5 methods each. The Interface Segregation Principle (ISP) from SOLID applies directly to testability — a class should depend on the smallest interface it needs, not a bloated one with methods it never calls.

When designing an interface, think about what the consumer actually needs. Your ViewModel might only need `getUser(id: String): User` and `observeUser(id: String): Flow<User>` from the repository. If the full `UserRepository` interface also has `createUser`, `updateUser`, `deleteUser`, `searchUsers`, and `exportUsers`, your fake has to implement all of them even though the ViewModel never calls them. Split the interface or use a role interface pattern.

The relationship between interfaces and compile-time safety is why fakes are superior to mocks. When you add a method to `UserRepository`, `FakeUserRepository` fails to compile — you must implement the new method. With MockK, the mock silently ignores the new method. If your production code starts calling the new method, the mock returns null or a default value, and your test passes with incorrect behavior.

One anti-pattern to avoid is "interface pollution" — creating an interface for every class, including utility classes, data classes, and classes with no external dependencies. `interface StringUtils { fun capitalize(s: String): String }` adds no testability value because `StringUtils` can already be tested directly. It just creates an extra file and an extra layer of indirection.

Another consideration is when to use abstract classes vs. interfaces. In Kotlin, interfaces can have default method implementations, which makes them versatile. Use interfaces when multiple implementations are possible (real + fake). Use abstract classes when you want to share implementation logic across subclasses, which is rarely the case for test doubles.

```kotlin
interface LoginRepository {
    suspend fun signIn(email: String, password: String): AuthResult
}

class LoginRepositoryImpl(
    private val networkSource: LoginNetworkDataSource,
    private val tokenStore: TokenStore
) : LoginRepository {
    override suspend fun signIn(email: String, password: String): AuthResult {
        val response = networkSource.authenticate(email, password)
        if (response.isSuccessful) {
            tokenStore.save(response.token)
        }
        return response.toAuthResult()
    }
}

// No interface needed — pure logic, test directly
class DiscountCalculator {
    fun calculate(items: Int, unitPrice: Double): DiscountResult {
        val discount = if (items > 10) unitPrice * items * 0.10 else 0.0
        val total = unitPrice * items - discount
        return DiscountResult(discount = discount, total = total)
    }
}
```

```kotlin
// Interface Segregation — small, focused interfaces
interface UserReader {
    suspend fun getUser(id: String): User
    fun observeUser(id: String): Flow<User>
}

interface UserWriter {
    suspend fun createUser(user: User)
    suspend fun updateUser(user: User)
    suspend fun deleteUser(id: String)
}

// ViewModel only depends on what it needs
class ProfileViewModel(
    private val userReader: UserReader  // only reads, doesn't need write methods
) : ViewModel() {
    fun loadProfile(id: String) {
        viewModelScope.launch {
            val user = userReader.getUser(id)
            _state.value = ProfileState.Loaded(user)
        }
    }
}

// Fake is simpler because it only implements 2 methods
class FakeUserReader : UserReader {
    private val users = mutableMapOf<String, User>()
    fun setUser(user: User) { users[user.id] = user }

    override suspend fun getUser(id: String): User =
        users[id] ?: throw UserNotFoundException(id)
    override fun observeUser(id: String): Flow<User> =
        flowOf(users[id] ?: throw UserNotFoundException(id))
}
```

```kotlin
// Testing a class without an interface — direct instantiation
class DiscountCalculatorTest {
    private val calculator = DiscountCalculator()

    @Test
    fun `no discount for 10 or fewer items`() {
        val result = calculator.calculate(items = 10, unitPrice = 20.0)
        assertEquals(0.0, result.discount, 0.01)
        assertEquals(200.0, result.total, 0.01)
    }

    @Test
    fun `10 percent discount for more than 10 items`() {
        val result = calculator.calculate(items = 15, unitPrice = 10.0)
        assertEquals(15.0, result.discount, 0.01)
        assertEquals(135.0, result.total, 0.01)
    }

    @Test
    fun `discount calculation with fractional prices`() {
        val result = calculator.calculate(items = 20, unitPrice = 9.99)
        assertEquals(19.98, result.discount, 0.01)
        assertEquals(179.82, result.total, 0.01)
    }
}
```

```kotlin
// Real-world example: Repository with interface
interface ArticleRepository {
    suspend fun getArticle(id: String): Article
    suspend fun getArticles(page: Int, pageSize: Int): List<Article>
    fun observeBookmarkedArticles(): Flow<List<Article>>
    suspend fun toggleBookmark(articleId: String)
}

// Production implementation
class ArticleRepositoryImpl(
    private val api: ArticleApi,
    private val dao: ArticleDao
) : ArticleRepository {
    override suspend fun getArticle(id: String): Article {
        return try {
            val dto = api.getArticle(id)
            val entity = dto.toEntity()
            dao.insert(entity)
            entity.toDomain()
        } catch (e: IOException) {
            dao.getById(id)?.toDomain()
                ?: throw ArticleNotFoundException(id)
        }
    }
    // ... other implementations
}

// Test implementation — simple, in-memory
class FakeArticleRepository : ArticleRepository {
    private val articles = mutableMapOf<String, Article>()
    private val bookmarks = mutableSetOf<String>()
    var shouldFail = false

    fun addArticle(article: Article) { articles[article.id] = article }

    override suspend fun getArticle(id: String): Article {
        if (shouldFail) throw IOException("Network error")
        return articles[id] ?: throw ArticleNotFoundException(id)
    }
    override suspend fun getArticles(page: Int, pageSize: Int): List<Article> {
        if (shouldFail) throw IOException("Network error")
        return articles.values.toList()
            .drop(page * pageSize)
            .take(pageSize)
    }
    override fun observeBookmarkedArticles(): Flow<List<Article>> {
        return flowOf(articles.values.filter { it.id in bookmarks })
    }
    override suspend fun toggleBookmark(articleId: String) {
        if (bookmarks.contains(articleId)) bookmarks.remove(articleId)
        else bookmarks.add(articleId)
    }
}
```

#### Common Mistakes

**Creating interfaces for data classes.** `interface UserData { val id: String; val name: String }` implemented by `data class User(...)` adds complexity with zero testability benefit. Data classes are already testable — they're just containers.

**Leaking implementation details through the interface.** If your interface has `fun getRetrofitInstance(): Retrofit`, it's tightly coupled to Retrofit. Any implementation (including fakes) must deal with Retrofit. Keep interfaces expressed in domain terms, not framework terms.

**Not providing a factory method or test builder for fakes.** When your fake has 5 configuration properties, provide a builder or factory function: `FakeUserRepository.withUsers(user1, user2).withFailure(IOException("timeout"))`. This makes test setup expressive and concise.

**Key takeaway:** Create interfaces for classes with external side effects (network, database, file system). Skip interfaces for pure logic classes — they're already testable without abstraction.

### Lesson 2.3: Pure Functions

A pure function takes inputs, returns an output, and does nothing else. No network calls, no database writes, no mutating shared state. Pure functions are the easiest thing in the world to test because they're completely deterministic — same input, same output, every single time.

The real skill is extracting pure logic from impure contexts. Most business logic is actually pure — it's just trapped inside classes that also do I/O. When you look at a ViewModel or repository method that's hard to test, try to split it into a pure computation part and an impure I/O part. The pure part can be tested with simple unit tests that run in milliseconds. The impure part is just plumbing that wires the pure logic to real data sources.

This pattern pays compounding dividends. Every line of business logic you extract into a pure function is a line you can test without fakes, mocks, coroutines, or dispatchers. The tests are instant, deterministic, and never flaky. Over time, your pure function test base becomes the most reliable part of your entire suite.

Pure functions also compose beautifully. When `calculateSubtotal`, `applyDiscount`, and `calculateTax` are all pure functions, testing the full pipeline is just calling them in sequence with known inputs and asserting on the final output. No mocking framework, no coroutine test infrastructure, no Android dependencies. Just plain Kotlin function calls.

The opposite of a pure function is a function with side effects — it changes external state, reads from external sources, or behaves differently on different calls with the same input. Every side effect makes a function harder to test because you need to set up the external state before the call and verify it after. Pure functions have zero setup and zero teardown — they're self-contained units of logic.

Identifying impure code that can be made pure is a learnable skill. Look for functions that mix computation with I/O. A function that fetches a user from the database, calculates their loyalty tier based on order history, and saves the tier back to the database does three things. The middle part — calculating the loyalty tier — is pure. Extract it: `fun calculateLoyaltyTier(orders: List<Order>): LoyaltyTier`. Now you can test the tier calculation with 20 different order histories without touching a database.

Extension functions are a natural fit for pure transformations. `fun UserDto.toDomain(): User` is pure — it takes one input (the DTO) and returns one output (the domain model). `fun List<Order>.totalRevenue(): Double` is pure. These small pure functions are trivial to test and form the building blocks of your domain logic.

One subtle benefit of pure functions is that they make debugging easier. When a pure function returns the wrong result, the bug is entirely within that function. There's no global state to inspect, no database to query, no network call to replay. The inputs are right there in the test, the output is right there in the assertion, and the logic is right there in the function body. Self-contained debugging.

```kotlin
// Pure function — trivially testable
fun calculateOrderTotal(
    items: List<CartItem>,
    discountPercent: Double,
    taxRate: Double
): OrderSummary {
    val subtotal = items.sumOf { it.price * it.quantity }
    val discount = subtotal * (discountPercent / 100)
    val taxable = subtotal - discount
    val tax = taxable * taxRate
    return OrderSummary(
        subtotal = subtotal,
        discount = discount,
        tax = tax,
        total = taxable + tax
    )
}

@Test
fun `order total applies discount before tax`() {
    val items = listOf(
        CartItem("Widget", price = 10.0, quantity = 3),
        CartItem("Gadget", price = 25.0, quantity = 1)
    )

    val summary = calculateOrderTotal(items, discountPercent = 10.0, taxRate = 0.08)

    assertEquals(55.0, summary.subtotal, 0.01)
    assertEquals(5.5, summary.discount, 0.01)
    assertEquals(3.96, summary.tax, 0.01)
    assertEquals(53.46, summary.total, 0.01)
}
```

```kotlin
// Extracting pure functions from impure code
// BEFORE: mixed I/O and logic — hard to test
class OrderService(private val database: OrderDatabase) {
    suspend fun getMonthlyReport(userId: String): MonthlyReport {
        val orders = database.getOrdersForMonth(userId, currentMonth())
        val totalRevenue = orders.filter { it.status == OrderStatus.COMPLETED }
            .sumOf { it.total }
        val averageOrderValue = if (orders.isNotEmpty()) totalRevenue / orders.size else 0.0
        val topCategory = orders.groupBy { it.category }
            .maxByOrNull { it.value.size }?.key ?: "None"
        return MonthlyReport(totalRevenue, averageOrderValue, topCategory, orders.size)
    }
}

// AFTER: pure functions extracted — trivially testable
fun calculateRevenue(orders: List<Order>): Double {
    return orders.filter { it.status == OrderStatus.COMPLETED }.sumOf { it.total }
}

fun calculateAverageOrderValue(totalRevenue: Double, orderCount: Int): Double {
    return if (orderCount > 0) totalRevenue / orderCount else 0.0
}

fun findTopCategory(orders: List<Order>): String {
    return orders.groupBy { it.category }
        .maxByOrNull { it.value.size }?.key ?: "None"
}

fun buildMonthlyReport(orders: List<Order>): MonthlyReport {
    val revenue = calculateRevenue(orders)
    return MonthlyReport(
        totalRevenue = revenue,
        averageOrderValue = calculateAverageOrderValue(revenue, orders.size),
        topCategory = findTopCategory(orders),
        orderCount = orders.size
    )
}
```

```kotlin
// Testing the extracted pure functions
class MonthlyReportTest {
    @Test
    fun `revenue only counts completed orders`() {
        val orders = listOf(
            Order("1", total = 100.0, status = OrderStatus.COMPLETED, category = "Electronics"),
            Order("2", total = 50.0, status = OrderStatus.PENDING, category = "Books"),
            Order("3", total = 75.0, status = OrderStatus.COMPLETED, category = "Electronics")
        )
        assertEquals(175.0, calculateRevenue(orders), 0.01)
    }

    @Test
    fun `revenue is zero when no completed orders`() {
        val orders = listOf(
            Order("1", total = 100.0, status = OrderStatus.CANCELLED, category = "Electronics")
        )
        assertEquals(0.0, calculateRevenue(orders), 0.01)
    }

    @Test
    fun `average order value handles empty list`() {
        assertEquals(0.0, calculateAverageOrderValue(0.0, 0), 0.01)
    }

    @Test
    fun `top category returns most frequent`() {
        val orders = listOf(
            Order("1", total = 10.0, status = OrderStatus.COMPLETED, category = "Electronics"),
            Order("2", total = 20.0, status = OrderStatus.COMPLETED, category = "Books"),
            Order("3", total = 30.0, status = OrderStatus.COMPLETED, category = "Electronics")
        )
        assertEquals("Electronics", findTopCategory(orders))
    }

    @Test
    fun `top category returns None for empty list`() {
        assertEquals("None", findTopCategory(emptyList()))
    }
}
```

```kotlin
// Pure extension functions for data transformation
fun UserDto.toDomain(): User = User(
    id = this.id,
    name = this.name ?: "Unknown",
    email = this.email ?: "",
    isPremium = this.membershipLevel == "premium"
)

fun List<OrderDto>.toSummary(): OrderSummary {
    val completed = this.filter { it.status == "completed" }
    return OrderSummary(
        totalOrders = this.size,
        completedOrders = completed.size,
        totalRevenue = completed.sumOf { it.amount }
    )
}

// Tests for pure extension functions
class TransformationTest {
    @Test
    fun `null name maps to Unknown`() {
        val dto = UserDto(id = "1", name = null, email = "a@b.com", membershipLevel = "free")
        assertEquals("Unknown", dto.toDomain().name)
    }

    @Test
    fun `premium membership level maps to isPremium true`() {
        val dto = UserDto(id = "1", name = "Mukul", email = "a@b.com", membershipLevel = "premium")
        assertTrue(dto.toDomain().isPremium)
    }

    @Test
    fun `order summary counts completed orders separately`() {
        val orders = listOf(
            OrderDto("1", 100.0, "completed"),
            OrderDto("2", 50.0, "pending"),
            OrderDto("3", 75.0, "completed")
        )
        val summary = orders.toSummary()
        assertEquals(3, summary.totalOrders)
        assertEquals(2, summary.completedOrders)
        assertEquals(175.0, summary.totalRevenue, 0.01)
    }
}
```

#### Common Mistakes

**Hiding impure operations inside "pure-looking" functions.** A function that takes `List<Order>` and returns `Double` looks pure, but if it internally calls `Log.d()` or `analytics.track()`, it's not. Those side effects make the function non-deterministic in terms of external state, even if the return value is deterministic.

**Not extracting enough.** If your ViewModel method does 5 things — validate input, transform data, apply business rules, format output, and trigger a side effect — the first 4 are potentially pure. Extract them. Test them independently. The ViewModel test only needs to verify the orchestration.

**Testing pure functions through their impure callers.** If `calculateDiscount` is called inside `processOrder`, don't test discount logic through `processOrder`. Test `calculateDiscount` directly with pure unit tests. Test `processOrder` separately to verify it calls `calculateDiscount` and uses the result correctly.

**Key takeaway:** Extract business logic into pure functions that take inputs and return outputs with no side effects. They're deterministic, instant to test, and never flaky — the gold standard of testable code.

### Lesson 2.4: Separating I/O from Logic

The most testable architecture is one where I/O lives at the edges and logic lives in the center. Your ViewModel orchestrates — it calls a repository to get data, passes that data to pure functions for processing, and then updates the UI state with the result. Each piece is independently testable.

When you see a method that does both I/O and logic, that's a red flag. Split it. Let the repository handle the I/O (fetching, caching, persisting), let pure functions handle the logic (calculating, formatting, validating), and let the ViewModel coordinate the two. This isn't just about testability — it's about clarity. Each class has one job, and that job is obvious from its interface.

The practical effect is dramatic. Your repository tests verify I/O behavior (caching, error handling, retry) using fakes. Your pure function tests verify logic using direct calls. Your ViewModel tests verify orchestration using fakes for the repository and direct assertions on state. No layer needs to know about the others' implementation details.

This separation is often called the "ports and adapters" architecture, the "hexagonal architecture," or the "clean architecture." The names differ, but the core principle is identical: business logic in the center with no framework dependencies, I/O adapters at the edges. The business logic doesn't know whether data comes from a REST API, a local database, or a test fake. It just receives data, processes it, and returns results.

The benefit for testing is profound. Consider a feature that fetches a user's order history, calculates total spending across categories, identifies their top category, and determines if they qualify for a loyalty upgrade. Without separation, testing this requires a fake API, a fake database, and a complex ViewModel test that wires everything together. With separation, the calculation logic is pure (trivial to test), the repository is tested independently with its own fakes, and the ViewModel test just verifies orchestration.

In practice, this means your ViewModel should have very little logic of its own. It should be a thin orchestrator that calls use cases or repositories, passes results through pure transformations, and updates UI state. When someone looks at a ViewModel method, they should be able to understand the flow in 10 seconds: fetch data, transform it, update state. The complexity lives in the pure functions and the repository, where it's independently testable.

This pattern also makes your code more resilient to requirement changes. When the business rule for loyalty upgrades changes, you only modify the pure function `determineUpgradeEligibility()` and its tests. The ViewModel, repository, and UI are untouched. When the API endpoint changes, you only modify the repository. The pure logic and ViewModel are untouched. Each layer changes independently.

Edge cases become much easier to test with this separation. Testing "what happens when the user has zero orders" doesn't require simulating a network response that returns an empty list — you just call `buildCategorySummary(emptyList())` and assert the result. Testing "what happens when all orders are cancelled" doesn't require setting up a fake API — you just pass a list of cancelled orders to the pure function.

```kotlin
// I/O boundary — repository handles network and cache
class OrderRepository(
    private val api: OrderApi,
    private val dao: OrderDao
) {
    suspend fun getOrders(userId: String): List<Order> {
        return try {
            val orders = api.fetchOrders(userId)
            dao.insertAll(orders.map { it.toEntity() })
            orders
        } catch (e: IOException) {
            dao.getByUserId(userId).map { it.toOrder() }
        }
    }
}

// Pure logic — no I/O, trivially testable
fun groupOrdersByStatus(orders: List<Order>): Map<OrderStatus, List<Order>> {
    return orders.groupBy { it.status }
}

fun calculateTotalRevenue(orders: List<Order>): Double {
    return orders.filter { it.status == OrderStatus.COMPLETED }
        .sumOf { it.total }
}

// ViewModel — orchestrates I/O and logic
class OrdersViewModel(
    private val repository: OrderRepository
) : ViewModel() {
    fun loadOrders(userId: String) {
        viewModelScope.launch {
            val orders = repository.getOrders(userId)
            val grouped = groupOrdersByStatus(orders)
            val revenue = calculateTotalRevenue(orders)
            _state.value = OrdersState.Loaded(grouped, revenue)
        }
    }
}
```

```kotlin
// Testing each layer independently

// 1. Pure logic tests — no fakes needed, instant
class OrderLogicTest {
    @Test
    fun `groups orders by their status`() {
        val orders = listOf(
            Order("1", "Widget", OrderStatus.PENDING, 10.0),
            Order("2", "Gadget", OrderStatus.SHIPPED, 20.0),
            Order("3", "Gizmo", OrderStatus.PENDING, 30.0)
        )

        val grouped = groupOrdersByStatus(orders)

        assertEquals(2, grouped[OrderStatus.PENDING]?.size)
        assertEquals(1, grouped[OrderStatus.SHIPPED]?.size)
    }

    @Test
    fun `revenue only includes completed orders`() {
        val orders = listOf(
            Order("1", "Widget", OrderStatus.COMPLETED, 100.0),
            Order("2", "Gadget", OrderStatus.PENDING, 50.0),
            Order("3", "Gizmo", OrderStatus.COMPLETED, 75.0)
        )

        assertEquals(175.0, calculateTotalRevenue(orders), 0.01)
    }

    @Test
    fun `empty order list returns empty map`() {
        assertTrue(groupOrdersByStatus(emptyList()).isEmpty())
    }

    @Test
    fun `revenue of empty list is zero`() {
        assertEquals(0.0, calculateTotalRevenue(emptyList()), 0.01)
    }
}

// 2. Repository test — uses fakes for API and DAO
class OrderRepositoryTest {
    private val fakeApi = FakeOrderApi()
    private val fakeDao = FakeOrderDao()
    private val repo = OrderRepository(fakeApi, fakeDao)

    @Test
    fun `fetches from network and caches in DAO`() = runTest {
        fakeApi.setOrders(listOf(Order("1", "Widget", OrderStatus.PENDING, 10.0)))

        val orders = repo.getOrders("user-1")

        assertEquals(1, orders.size)
        assertEquals(1, fakeDao.insertedEntities.size)
    }

    @Test
    fun `falls back to DAO on network error`() = runTest {
        fakeApi.shouldFail = true
        fakeDao.setEntities(listOf(OrderEntity("1", "user-1", "Widget", "PENDING", 10.0)))

        val orders = repo.getOrders("user-1")

        assertEquals(1, orders.size)
        assertEquals("Widget", orders[0].name)
    }
}

// 3. ViewModel test — verifies orchestration with fakes
class OrdersViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `loadOrders shows grouped orders with revenue`() = runTest {
        val fakeRepo = FakeOrderRepository()
        fakeRepo.setOrders(listOf(
            Order("1", "Widget", OrderStatus.COMPLETED, 100.0),
            Order("2", "Gadget", OrderStatus.PENDING, 50.0)
        ))
        val viewModel = OrdersViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.loadOrders("user-1")
            awaitItem() // Loading
            val loaded = awaitItem()
            assertIs<OrdersState.Loaded>(loaded)
            assertEquals(100.0, loaded.revenue, 0.01)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Real-world example: user loyalty feature with clean separation
// Pure functions — all business logic
fun calculateSpendingByCategory(orders: List<Order>): Map<String, Double> {
    return orders.filter { it.status == OrderStatus.COMPLETED }
        .groupBy { it.category }
        .mapValues { (_, categoryOrders) -> categoryOrders.sumOf { it.total } }
}

fun determineUpgradeEligibility(
    totalSpending: Double,
    currentTier: LoyaltyTier,
    memberSinceMonths: Int
): UpgradeResult {
    if (currentTier == LoyaltyTier.PLATINUM) return UpgradeResult.AlreadyMaxTier
    val threshold = when (currentTier) {
        LoyaltyTier.BRONZE -> 500.0
        LoyaltyTier.SILVER -> 2000.0
        LoyaltyTier.GOLD -> 5000.0
        else -> Double.MAX_VALUE
    }
    return if (totalSpending >= threshold && memberSinceMonths >= 3) {
        UpgradeResult.Eligible(currentTier.next())
    } else {
        UpgradeResult.NotEligible(threshold - totalSpending)
    }
}

// Test the pure functions exhaustively
class LoyaltyUpgradeTest {
    @Test
    fun `bronze user with 500+ spending is eligible for silver`() {
        val result = determineUpgradeEligibility(
            totalSpending = 600.0,
            currentTier = LoyaltyTier.BRONZE,
            memberSinceMonths = 6
        )
        assertIs<UpgradeResult.Eligible>(result)
        assertEquals(LoyaltyTier.SILVER, result.newTier)
    }

    @Test
    fun `new member under 3 months is not eligible`() {
        val result = determineUpgradeEligibility(
            totalSpending = 1000.0,
            currentTier = LoyaltyTier.BRONZE,
            memberSinceMonths = 2
        )
        assertIs<UpgradeResult.NotEligible>(result)
    }

    @Test
    fun `platinum user returns already max tier`() {
        val result = determineUpgradeEligibility(
            totalSpending = 100000.0,
            currentTier = LoyaltyTier.PLATINUM,
            memberSinceMonths = 60
        )
        assertIs<UpgradeResult.AlreadyMaxTier>(result)
    }
}
```

#### Common Mistakes

**Putting business logic in the repository.** The repository should handle I/O coordination (fetch, cache, retry). It should not calculate discounts, determine eligibility, or format display strings. Those are pure logic concerns that belong in use cases or standalone functions.

**Putting I/O in the ViewModel directly.** If your ViewModel calls `Retrofit.create()` or `Room.databaseBuilder()` directly, the I/O is in the wrong layer. The ViewModel should only know about repository interfaces, never about HTTP clients or database builders.

**Not testing the orchestration.** Even though each layer is tested independently, you still need a ViewModel test that verifies the layers are wired together correctly. The pure function test verifies logic. The repository test verifies I/O. The ViewModel test verifies that calling `loadOrders()` actually fetches, processes, and updates state.

**Key takeaway:** Keep I/O at the edges and logic in the center. Repositories handle I/O, pure functions handle logic, ViewModels orchestrate. Each layer is independently testable without knowing about the others.

### Lesson 2.5: Avoiding Hidden Dependencies

Hidden dependencies are testability killers. They're the static method calls, the singleton references, the hardcoded `System.currentTimeMillis()` calls buried inside your business logic. Every hidden dependency is something you can't control in a test — and if you can't control it, you can't test edge cases around it.

The most common hidden dependency in Android is time. If your code calls `System.currentTimeMillis()` directly, you can't test what happens when a token expires, when a cache becomes stale, or when a countdown timer reaches zero. The fix is simple: inject a `Clock` interface. In production, you provide the real system clock. In tests, you provide a fake clock you can set to any time.

The same principle applies to random number generation, UUID creation, locale, timezone, and any other environmental factor. If your code depends on it, inject it. If you can't inject it, wrap it behind an interface that you can inject.

Hidden dependencies are insidious because they don't appear in the constructor signature. You can look at `class TokenManager(private val tokenStore: TokenStore)` and think it has one dependency. But if `isTokenValid()` calls `System.currentTimeMillis()` internally, there's a second dependency you can't see. This means you can't write a test for "token expires in 5 minutes" because you can't fast-forward time.

The fix pattern is always the same: identify the hidden dependency, create an interface for it, inject the interface through the constructor, and provide a fake in tests. For time, the interface is `Clock` with one method: `fun now(): Long`. For random numbers, it's `RandomGenerator` with `fun nextInt(bound: Int): Int`. For UUIDs, it's `IdGenerator` with `fun generate(): String`. Small interfaces, big testability wins.

Android's `Context` is a particularly troublesome hidden dependency. If your business logic class needs `Context` to read shared preferences, access resources, or check network connectivity, it's secretly dependent on the entire Android framework. The fix is to wrap the specific functionality you need behind an interface. Don't pass `Context` — pass `UserPreferences`, `StringProvider`, or `ConnectivityChecker`.

Static method calls are the hardest hidden dependencies to spot because they look like regular function calls. `TextUtils.isEmpty(email)` depends on the Android framework. `UUID.randomUUID()` depends on the JVM's random number generator. `LocalDate.now()` depends on the system clock. Each of these is a hidden dependency that makes your code non-deterministic and harder to test.

Logging is a subtle hidden dependency. If your business logic calls `Log.d(TAG, "Processing order")`, it depends on the Android logging framework, which isn't available in JVM unit tests. Either remove logging from business logic (preferred) or inject a `Logger` interface that you can no-op in tests.

```kotlin
// Hidden dependency — can't test expiration logic
class TokenManager {
    fun isTokenValid(token: Token): Boolean {
        return token.expiresAt > System.currentTimeMillis()
    }
}

// Explicit dependency — fully testable
interface Clock {
    fun now(): Long
}

class SystemClock : Clock {
    override fun now(): Long = System.currentTimeMillis()
}

class TokenManager(private val clock: Clock) {
    fun isTokenValid(token: Token): Boolean {
        return token.expiresAt > clock.now()
    }
}

// Test with a fake clock
class TokenManagerTest {
    @Test
    fun `expired token is invalid`() {
        val fakeClock = object : Clock {
            override fun now(): Long = 1_000_000L
        }
        val manager = TokenManager(fakeClock)
        val expiredToken = Token(expiresAt = 999_999L)

        assertFalse(manager.isTokenValid(expiredToken))
    }
}
```

```kotlin
// Comprehensive fake clock for time-dependent testing
class FakeClock(var currentTimeMillis: Long = 0L) : Clock {
    override fun now(): Long = currentTimeMillis

    fun advanceBy(millis: Long) { currentTimeMillis += millis }
    fun setTo(millis: Long) { currentTimeMillis = millis }
}

class TokenManagerTest {
    private val fakeClock = FakeClock(currentTimeMillis = 1_000_000L)
    private val manager = TokenManager(fakeClock)

    @Test
    fun `token valid before expiration`() {
        val token = Token(expiresAt = 2_000_000L)
        assertTrue(manager.isTokenValid(token))
    }

    @Test
    fun `token invalid after expiration`() {
        val token = Token(expiresAt = 500_000L)
        assertFalse(manager.isTokenValid(token))
    }

    @Test
    fun `token becomes invalid as time passes`() {
        val token = Token(expiresAt = 1_500_000L)
        assertTrue(manager.isTokenValid(token))

        fakeClock.advanceBy(600_000L) // advance 10 minutes
        assertFalse(manager.isTokenValid(token))
    }

    @Test
    fun `token at exact expiration time is invalid`() {
        val token = Token(expiresAt = 1_000_000L)
        assertFalse(manager.isTokenValid(token)) // expiresAt == now, not >
    }
}
```

```kotlin
// Hidden dependency: UUID generation
// BAD — can't predict the ID in tests
class OrderService {
    fun createOrder(items: List<Item>): Order {
        return Order(
            id = UUID.randomUUID().toString(), // hidden dependency
            items = items,
            createdAt = System.currentTimeMillis() // another hidden dependency
        )
    }
}

// GOOD — injectable ID generator and clock
interface IdGenerator {
    fun generate(): String
}

class UuidGenerator : IdGenerator {
    override fun generate(): String = UUID.randomUUID().toString()
}

class OrderService(
    private val idGenerator: IdGenerator,
    private val clock: Clock
) {
    fun createOrder(items: List<Item>): Order {
        return Order(
            id = idGenerator.generate(),
            items = items,
            createdAt = clock.now()
        )
    }
}

// Deterministic test
class OrderServiceTest {
    @Test
    fun `creates order with provided ID and timestamp`() {
        val fakeIdGen = object : IdGenerator {
            override fun generate(): String = "order-123"
        }
        val fakeClock = FakeClock(currentTimeMillis = 1_700_000_000_000L)
        val service = OrderService(fakeIdGen, fakeClock)

        val order = service.createOrder(listOf(Item("Widget", 9.99)))

        assertEquals("order-123", order.id)
        assertEquals(1_700_000_000_000L, order.createdAt)
        assertEquals(1, order.items.size)
    }
}
```

```kotlin
// Hidden dependency: Android Context
// BAD — depends on Android framework
class GreetingService {
    fun getGreeting(context: Context): String {
        val name = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)
            .getString("user_name", "Guest")
        return "Hello, $name!"
    }
}

// GOOD — inject what you actually need
interface UserPreferences {
    fun getUserName(): String
}

class SharedPrefsUserPreferences(private val prefs: SharedPreferences) : UserPreferences {
    override fun getUserName(): String = prefs.getString("user_name", "Guest") ?: "Guest"
}

class GreetingService(private val userPrefs: UserPreferences) {
    fun getGreeting(): String {
        return "Hello, ${userPrefs.getUserName()}!"
    }
}

// Simple test — no Context needed
class GreetingServiceTest {
    @Test
    fun `greets user by name`() {
        val fakePrefs = object : UserPreferences {
            override fun getUserName(): String = "Mukul"
        }
        val service = GreetingService(fakePrefs)
        assertEquals("Hello, Mukul!", service.getGreeting())
    }

    @Test
    fun `greets guest when no name set`() {
        val fakePrefs = object : UserPreferences {
            override fun getUserName(): String = "Guest"
        }
        val service = GreetingService(fakePrefs)
        assertEquals("Hello, Guest!", service.getGreeting())
    }
}
```

#### Common Mistakes

**Using `System.currentTimeMillis()` in business logic.** Always inject a `Clock`. This is the single most common hidden dependency in Android code, and it makes time-dependent behavior untestable.

**Calling static framework methods.** `TextUtils.isEmpty()`, `Base64.encode()`, `Uri.parse()` — all depend on the Android framework and crash in JVM tests. Use Kotlin's `String.isBlank()`, Java's `Base64.getEncoder()`, or inject wrappers.

**Depending on system locale.** If your number formatting uses `NumberFormat.getInstance()` without specifying a locale, tests pass on your machine (US locale) but fail on a colleague's machine (German locale) or CI (UTC locale). Always inject or explicitly specify locale.

**Key takeaway:** Every hidden dependency is something you can't control in a test. Wrap time, randomness, and environmental factors behind injectable interfaces. If your code depends on it, inject it.

### Quiz: Writing Testable Code

#### What is the most impactful pattern for making code testable?

- ❌ Using Mockito to mock all dependencies
- ✅ Constructor injection — passing all dependencies through the constructor
- ❌ Making all methods public for test access
- ❌ Writing integration tests instead of unit tests

> **Explanation:** Constructor injection makes every dependency explicit and swappable. You can see the full dependency list in the constructor and replace any of them with test doubles. It's the foundation of testable architecture.

#### When should you create an interface for a class?

- ❌ Always — every class should have an interface
- ❌ Never — interfaces add unnecessary complexity
- ✅ When the class has external side effects (network, database, file system) or you need polymorphism
- ❌ Only when you have three or more implementations

> **Explanation:** Interfaces enable test doubles for classes with I/O side effects. Pure logic classes that just transform data can be tested directly — an interface would just add noise without improving testability.

#### Why are pure functions considered the gold standard of testable code?

- ❌ Pure functions can only be tested with Mockito
- ❌ Pure functions run faster than impure functions
- ✅ They're completely deterministic — same input, same output, no side effects — so tests are instant and never flaky
- ❌ Pure functions don't need assertions in tests

> **Explanation:** Pure functions have no external dependencies, no hidden state, and no side effects. This makes them perfectly deterministic — every test runs identically every time. No fakes, no mocking framework, no setup, no teardown. Just input, output, and an assertion.

### Coding Challenge: Refactor for Testability

You have an untestable `UserProfileManager` that fetches from the network, formats dates using `SimpleDateFormat`, and uses `System.currentTimeMillis()` for cache expiration. Refactor it into testable components and write tests for the date formatting and cache logic.

#### Solution

```kotlin
// Step 1: Extract interfaces and inject dependencies
interface Clock {
    fun now(): Long
}

interface DateFormatter {
    fun format(timestamp: Long): String
}

interface UserApi {
    suspend fun getProfile(id: String): UserProfile
}

// Step 2: Pure function for cache check
fun isCacheExpired(lastFetchTime: Long, currentTime: Long, maxAgeMs: Long): Boolean {
    return currentTime - lastFetchTime > maxAgeMs
}

// Step 3: Testable manager with constructor injection
class UserProfileManager(
    private val api: UserApi,
    private val clock: Clock,
    private val dateFormatter: DateFormatter
) {
    private var cachedProfile: UserProfile? = null
    private var lastFetchTime: Long = 0

    suspend fun getProfile(id: String): UserProfile {
        if (cachedProfile != null && !isCacheExpired(lastFetchTime, clock.now(), CACHE_MAX_AGE)) {
            return cachedProfile!!
        }
        val profile = api.getProfile(id)
        cachedProfile = profile
        lastFetchTime = clock.now()
        return profile
    }
}

// Step 4: Test the pure cache logic directly
class CacheExpirationTest {
    @Test
    fun `cache is valid within max age`() {
        assertFalse(isCacheExpired(lastFetchTime = 1000, currentTime = 2000, maxAgeMs = 5000))
    }

    @Test
    fun `cache is expired after max age`() {
        assertTrue(isCacheExpired(lastFetchTime = 1000, currentTime = 7000, maxAgeMs = 5000))
    }
}
```

This refactoring demonstrates the core principles: constructor injection, interface abstraction for I/O, pure functions for logic, and injectable clock for time-dependent behavior.

---

## Module 3: Fakes and Test Doubles

Test doubles are stand-in objects that replace real dependencies during testing. They let you control the environment around the class under test so you can exercise specific scenarios — success, failure, empty data, slow responses, concurrent modifications — without relying on real infrastructure. Understanding the different types of test doubles and when to use each one is fundamental to writing fast, reliable, and maintainable tests.

This module covers fakes, stubs, spies, and mocks. You'll learn why fakes are the preferred test double for Android development, how to build reusable fakes that grow with your codebase, and why Mockito/MockK should be a last resort rather than your first tool.

### Lesson 3.1: Types of Test Doubles

Test doubles come in several flavors, each with a distinct purpose and trade-off. Understanding these distinctions matters because choosing the wrong type leads to brittle tests, false confidence, or slow test suites. The four primary types are fakes, stubs, spies, and mocks, and each occupies a different point on the spectrum from simple to complex, from behavior verification to state verification.

A **stub** is the simplest test double. It returns canned responses without any logic. When your test needs a `UserRepository` that always returns a specific user, a stub is the right tool. Stubs are disposable — you create them inline in the test, configure the return value, and throw them away. They're perfect for tests where the dependency's behavior is incidental to the test's purpose. The downside is that stubs don't verify anything about how they were called, so they can't catch bugs where the system under test calls the wrong method or passes the wrong arguments.

A **fake** is a working implementation with simplified logic. A `FakeUserRepository` stores users in a `MutableMap` instead of a real database, but it actually inserts, retrieves, and deletes. Fakes are the gold standard for Android testing because they behave like real implementations — they maintain state, enforce constraints, and return consistent results. When you add a user and then query for it, the fake returns it. When you delete a user and then query for it, the fake throws or returns null. This realistic behavior catches bugs that stubs miss.

A **spy** wraps a real or fake object and records how it was called. Spies are useful when you need to verify that a specific method was called with specific arguments — for example, confirming that `analytics.track("purchase_completed")` was called when a purchase succeeds. Spies are more intrusive than fakes because they add verification behavior on top of the wrapped object. Use them sparingly and only when you genuinely need call verification.

A **mock** is a pre-programmed object that expects specific calls in a specific order and fails the test if those expectations aren't met. Mocks are the most controversial test double. They're easy to create with MockK or Mockito, but they couple your tests tightly to implementation details. If you refactor the production code to call methods in a different order or with different intermediate values, mock-based tests break even though the behavior is correct. This makes refactoring expensive and tests fragile.

The fundamental difference between state verification and behavior verification explains why fakes are preferred over mocks. With a fake, you verify state: "after calling `addUser(user)`, does `getUser(user.id)` return the user?" With a mock, you verify behavior: "was `addUser` called with this specific user object?" State verification is resilient to refactoring because it tests what the system does. Behavior verification is fragile because it tests how the system does it.

In practice, most Android test suites should use fakes as the primary test double, with occasional spies for analytics or logging verification. Mocks should be reserved for legacy code that can't be refactored, or for verifying interactions with third-party libraries whose interfaces you don't control. If you find yourself reaching for MockK in every test, your architecture probably needs improvement — well-designed code with constructor injection and interface abstraction makes fakes easy to build and maintain.

The cost-benefit analysis is clear. Fakes require upfront investment — you have to write and maintain them. But they pay for themselves many times over because they're reusable across hundreds of tests, they catch real bugs, and they don't break when you refactor production code. Mocks require less upfront work — one line of `every { repo.getUser(any()) } returns user` — but they accumulate technical debt because every refactoring requires updating mock expectations across dozens of tests.

```kotlin
// Stub — returns canned data, no logic
class StubUserRepository : UserRepository {
    override suspend fun getUser(id: String): User {
        return User("stub-id", "Stub User", "stub@test.com")
    }
    override suspend fun saveUser(user: User) { /* no-op */ }
    override suspend fun deleteUser(id: String) { /* no-op */ }
    override fun observeUsers(): Flow<List<User>> = flowOf(emptyList())
}
```

```kotlin
// Fake — working implementation with in-memory storage
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    var shouldFail = false
    var failureException: Exception = IOException("Network error")

    fun addUser(user: User) { users[user.id] = user }
    fun clear() { users.clear() }

    override suspend fun getUser(id: String): User {
        if (shouldFail) throw failureException
        return users[id] ?: throw UserNotFoundException(id)
    }

    override suspend fun saveUser(user: User) {
        if (shouldFail) throw failureException
        users[user.id] = user
    }

    override suspend fun deleteUser(id: String) {
        if (shouldFail) throw failureException
        users.remove(id) ?: throw UserNotFoundException(id)
    }

    override fun observeUsers(): Flow<List<User>> {
        return flowOf(users.values.toList())
    }
}
```

```kotlin
// Spy — records calls for verification
class SpyAnalytics : Analytics {
    val trackedEvents = mutableListOf<AnalyticsEvent>()
    val trackedScreens = mutableListOf<String>()

    override fun trackEvent(event: AnalyticsEvent) {
        trackedEvents.add(event)
    }

    override fun trackScreen(screenName: String) {
        trackedScreens.add(screenName)
    }

    fun hasTrackedEvent(name: String): Boolean {
        return trackedEvents.any { it.name == name }
    }

    fun eventCount(name: String): Int {
        return trackedEvents.count { it.name == name }
    }
}
```

```kotlin
// Using fakes vs mocks — same test, different approaches
// Fake approach (preferred) — tests behavior through state
class UserViewModelFakeTest {
    private val fakeRepo = FakeUserRepository()
    private val viewModel = UserViewModel(fakeRepo)

    @Test
    fun `saving user persists data`() = runTest {
        val user = User("1", "Mukul", "mukul@test.com")

        viewModel.saveUser(user)

        // State verification: did the data persist?
        val saved = fakeRepo.getUser("1")
        assertEquals("Mukul", saved.name)
    }
}

// Mock approach (fragile) — tests implementation details
class UserViewModelMockTest {
    @Test
    fun `saving user calls repository save`() = runTest {
        val mockRepo = mockk<UserRepository>()
        coEvery { mockRepo.saveUser(any()) } just Runs
        val viewModel = UserViewModel(mockRepo)

        viewModel.saveUser(User("1", "Mukul", "mukul@test.com"))

        // Behavior verification: was the right method called?
        coVerify { mockRepo.saveUser(match { it.id == "1" }) }
    }
}
```

```kotlin
// Complete test class demonstrating fake usage patterns
class ProfileViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeUserRepo = FakeUserRepository()
    private val spyAnalytics = SpyAnalytics()
    private lateinit var viewModel: ProfileViewModel

    @Before
    fun setup() {
        viewModel = ProfileViewModel(fakeUserRepo, spyAnalytics)
    }

    @After
    fun teardown() {
        fakeUserRepo.clear()
        spyAnalytics.trackedEvents.clear()
    }

    @Test
    fun `load profile shows user data`() = runTest {
        fakeUserRepo.addUser(User("1", "Mukul", "mukul@test.com"))

        viewModel.state.test {
            awaitItem() // Initial
            viewModel.loadProfile("1")
            awaitItem() // Loading
            val loaded = awaitItem()
            assertIs<ProfileState.Loaded>(loaded)
            assertEquals("Mukul", loaded.user.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `load profile tracks analytics event`() = runTest {
        fakeUserRepo.addUser(User("1", "Mukul", "mukul@test.com"))

        viewModel.loadProfile("1")
        advanceUntilIdle()

        assertTrue(spyAnalytics.hasTrackedEvent("profile_viewed"))
    }

    @Test
    fun `load profile with missing user shows error`() = runTest {
        viewModel.state.test {
            awaitItem() // Initial
            viewModel.loadProfile("nonexistent")
            awaitItem() // Loading
            val error = awaitItem()
            assertIs<ProfileState.Error>(error)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `load profile on network error shows retry`() = runTest {
        fakeUserRepo.shouldFail = true

        viewModel.state.test {
            awaitItem() // Initial
            viewModel.loadProfile("1")
            awaitItem() // Loading
            val error = awaitItem()
            assertIs<ProfileState.Error>(error)
            assertTrue(error.isRetryable)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Using mocks as the default test double.** MockK and Mockito make it trivially easy to create mocks, which leads teams to mock everything. The result is a test suite that's tightly coupled to implementation details and breaks on every refactoring. Default to fakes. Reach for mocks only when fakes aren't practical.

**Creating a new stub for every test.** If you have 30 tests that each create an anonymous `object : UserRepository { ... }` with slightly different configurations, you're duplicating effort. Build a reusable `FakeUserRepository` with configurable behavior that all tests share.

**Not testing the fake itself.** If your fake has logic (and good fakes do), test the fake to make sure it behaves correctly. A broken fake produces false positives — tests that pass even though the production code is wrong.

**Key takeaway:** Prefer fakes over mocks. Fakes test behavior through state verification, survive refactoring, and catch real bugs. Mocks test implementation details, break on refactoring, and give false confidence.

### Lesson 3.2: Building Reusable Fakes

A well-designed fake is an investment that pays dividends across your entire test suite. Instead of creating throwaway stubs in every test, build fakes that model real behavior with simplified implementation. A `FakeUserRepository` that stores data in a `Map`, supports insert/query/delete, and can be configured to fail on demand is reusable across hundreds of tests.

The key principle for building good fakes is that they should behave like the real implementation for the scenarios your tests care about. When you call `saveUser(user)` followed by `getUser(user.id)`, the fake should return the same user — just like the real repository would. When you call `getUser` with an ID that doesn't exist, the fake should throw the same exception the real repository throws. This behavioral fidelity is what makes fakes catch real bugs.

Start by implementing the interface methods with the simplest possible logic. For a repository, use a `MutableMap` as the backing store. For a network client, use a predefined list of responses. For a preferences store, use a `MutableMap<String, Any>`. Then add configuration knobs: `shouldFail` for simulating errors, `delay` for simulating latency, `failureException` for controlling which error is thrown.

The most common pattern for configurable fakes is the "setup then act" approach. Before each test, configure the fake's state using helper methods: `fakeRepo.addUser(user)`, `fakeRepo.shouldFail = true`, `fakeRepo.setDelay(500)`. Then exercise the system under test and assert on the results. The fake's configuration makes the test's preconditions explicit and readable.

Fakes should be placed in a shared test module so that both unit tests and integration tests can use them. In a multi-module Android project, create a `testing` module that contains all your fakes, test fixtures, and test utilities. This prevents test code duplication and ensures consistency — every test that needs a `FakeUserRepository` uses the same one.

For Flow-based interfaces, fakes need to be more sophisticated. Instead of returning a static `flowOf(...)`, use a `MutableStateFlow` or `MutableSharedFlow` that tests can push values into. This lets you simulate real-time data changes: "first emit loading, then emit data, then emit an error." Without this capability, you can't test how your ViewModel handles Flow updates over time.

One advanced pattern is the "recording fake" that combines fake behavior with spy-like recording. The fake stores data in memory AND records every method call with its arguments. This lets you verify both state ("was the user saved?") and behavior ("was `saveUser` called before `notifyAdmin`?") without introducing a separate spy.

Error simulation is a critical fake capability. Your fake should support multiple failure modes: network errors, timeout errors, authentication errors, server errors, and validation errors. Use an enum or sealed class to configure which failure mode is active, and make the fake throw the appropriate exception. This lets you test error handling comprehensively without touching real infrastructure.

```kotlin
// Comprehensive reusable fake with all configuration knobs
class FakeArticleRepository : ArticleRepository {
    private val articles = mutableMapOf<String, Article>()
    private val bookmarks = mutableSetOf<String>()
    private val _articlesFlow = MutableStateFlow<List<Article>>(emptyList())

    var shouldFail = false
    var failureException: Exception = IOException("Network error")
    var artificialDelayMs: Long = 0

    // Setup helpers for tests
    fun addArticle(article: Article) {
        articles[article.id] = article
        _articlesFlow.value = articles.values.toList()
    }

    fun addArticles(vararg articleList: Article) {
        articleList.forEach { articles[it.id] = it }
        _articlesFlow.value = articles.values.toList()
    }

    fun clear() {
        articles.clear()
        bookmarks.clear()
        _articlesFlow.value = emptyList()
        shouldFail = false
        artificialDelayMs = 0
    }

    override suspend fun getArticle(id: String): Article {
        if (artificialDelayMs > 0) delay(artificialDelayMs)
        if (shouldFail) throw failureException
        return articles[id] ?: throw ArticleNotFoundException(id)
    }

    override suspend fun getArticles(page: Int, pageSize: Int): List<Article> {
        if (shouldFail) throw failureException
        return articles.values.toList()
            .drop(page * pageSize)
            .take(pageSize)
    }

    override fun observeArticles(): Flow<List<Article>> = _articlesFlow

    override fun observeBookmarkedArticles(): Flow<List<Article>> {
        return _articlesFlow.map { allArticles ->
            allArticles.filter { it.id in bookmarks }
        }
    }

    override suspend fun toggleBookmark(articleId: String) {
        if (shouldFail) throw failureException
        if (bookmarks.contains(articleId)) {
            bookmarks.remove(articleId)
        } else {
            bookmarks.add(articleId)
        }
        _articlesFlow.value = articles.values.toList()
    }

    // Inspection helpers for assertions
    fun isBookmarked(articleId: String): Boolean = articleId in bookmarks
    fun articleCount(): Int = articles.size
}
```

```kotlin
// Flow-based fake with MutableSharedFlow for dynamic emissions
class FakeNotificationRepository : NotificationRepository {
    private val _notifications = MutableSharedFlow<List<Notification>>(replay = 1)
    private val stored = mutableListOf<Notification>()

    fun emit(notifications: List<Notification>) {
        stored.clear()
        stored.addAll(notifications)
        _notifications.tryEmit(notifications)
    }

    fun emitError() {
        _notifications.tryEmit(emptyList())
    }

    override fun observeNotifications(): Flow<List<Notification>> = _notifications

    override suspend fun markAsRead(id: String) {
        val updated = stored.map {
            if (it.id == id) it.copy(isRead = true) else it
        }
        stored.clear()
        stored.addAll(updated)
        _notifications.tryEmit(updated)
    }

    override suspend fun getUnreadCount(): Int {
        return stored.count { !it.isRead }
    }
}
```

```kotlin
// Using the Flow-based fake in a ViewModel test
class NotificationViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeRepo = FakeNotificationRepository()

    @Test
    fun `displays notifications as they arrive`() = runTest {
        val viewModel = NotificationViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Initial empty state

            fakeRepo.emit(listOf(
                Notification("1", "New message", isRead = false),
                Notification("2", "Order shipped", isRead = false)
            ))

            val state = awaitItem()
            assertIs<NotificationState.Loaded>(state)
            assertEquals(2, state.notifications.size)
            assertEquals(2, state.unreadCount)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `marking notification as read updates unread count`() = runTest {
        val viewModel = NotificationViewModel(fakeRepo)
        fakeRepo.emit(listOf(
            Notification("1", "New message", isRead = false),
            Notification("2", "Order shipped", isRead = false)
        ))

        viewModel.state.test {
            skipItems(1) // Skip initial
            val initial = awaitItem()
            assertIs<NotificationState.Loaded>(initial)
            assertEquals(2, initial.unreadCount)

            viewModel.markAsRead("1")
            val updated = awaitItem()
            assertIs<NotificationState.Loaded>(updated)
            assertEquals(1, updated.unreadCount)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Error simulation with multiple failure modes
sealed class FakeFailureMode {
    object NetworkError : FakeFailureMode()
    object Timeout : FakeFailureMode()
    object Unauthorized : FakeFailureMode()
    object ServerError : FakeFailureMode()
    data class Custom(val exception: Exception) : FakeFailureMode()
}

class FakePaymentRepository : PaymentRepository {
    private val payments = mutableListOf<Payment>()
    var failureMode: FakeFailureMode? = null

    private fun checkFailure() {
        when (val mode = failureMode) {
            is FakeFailureMode.NetworkError -> throw IOException("Network unreachable")
            is FakeFailureMode.Timeout -> throw SocketTimeoutException("Connection timed out")
            is FakeFailureMode.Unauthorized -> throw UnauthorizedException("Token expired")
            is FakeFailureMode.ServerError -> throw ServerException(500, "Internal server error")
            is FakeFailureMode.Custom -> throw mode.exception
            null -> { /* no failure */ }
        }
    }

    override suspend fun processPayment(payment: Payment): PaymentResult {
        checkFailure()
        payments.add(payment)
        return PaymentResult.Success(transactionId = "txn-${payments.size}")
    }

    override suspend fun getPaymentHistory(): List<Payment> {
        checkFailure()
        return payments.toList()
    }
}

// Test different error scenarios
class PaymentViewModelErrorTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeRepo = FakePaymentRepository()

    @Test
    fun `network error shows offline message`() = runTest {
        fakeRepo.failureMode = FakeFailureMode.NetworkError
        val viewModel = PaymentViewModel(fakeRepo)

        viewModel.processPayment(100.0)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertIs<PaymentState.Error>(state)
        assertTrue(state.message.contains("network", ignoreCase = true))
    }

    @Test
    fun `unauthorized error redirects to login`() = runTest {
        fakeRepo.failureMode = FakeFailureMode.Unauthorized
        val viewModel = PaymentViewModel(fakeRepo)

        viewModel.processPayment(100.0)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertIs<PaymentState.Error>(state)
        assertTrue(state.requiresReauth)
    }

    @Test
    fun `timeout error shows retry option`() = runTest {
        fakeRepo.failureMode = FakeFailureMode.Timeout
        val viewModel = PaymentViewModel(fakeRepo)

        viewModel.processPayment(100.0)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertIs<PaymentState.Error>(state)
        assertTrue(state.isRetryable)
    }
}
```

#### Common Mistakes

**Making fakes too simple.** A fake that always returns the same hardcoded value regardless of input is a stub, not a fake. Good fakes maintain state and respond dynamically to the data they've been given. If `addUser` doesn't actually store the user for later retrieval by `getUser`, your fake won't catch bugs where the system under test forgets to save data.

**Not resetting fake state between tests.** If your fake accumulates data across tests (because you declared it as a class property shared across all tests), test B might see data from test A. Always reset or recreate fakes in `@Before` or `@After`.

**Making fakes too complex.** If your fake has 200 lines of logic with its own error handling, retry logic, and caching strategy, it's too complex. A fake should be simpler than the real implementation — that's the whole point. If the fake is as complex as the real thing, you need to test the fake, and then you need a fake for the fake.

**Key takeaway:** Build reusable fakes that model real behavior with simplified logic. Store data in memory, support configurable failures, and share fakes across your test suite via a common test module.

### Lesson 3.3: Fakes vs Mocks — When to Use Which

The fakes-vs-mocks debate isn't academic — it directly affects your test suite's maintainability, reliability, and refactoring cost. Understanding when each tool is appropriate prevents you from building a test suite that's a maintenance nightmare.

Fakes are better when the dependency has state. Repositories, data stores, caches, and session managers all maintain internal state that affects subsequent operations. A fake repository that stores users in a map naturally handles the "save then retrieve" pattern. A mock requires explicit `returns` setup for every possible call sequence, and it can't catch bugs where the production code calls methods in the wrong order or forgets to persist data.

Mocks are acceptable when you need to verify that a specific side effect occurred. If your ViewModel should track an analytics event when a button is tapped, a mock (or spy) analytics interface lets you verify `track("button_tapped")` was called. But even here, a spy (which is a real object that records calls) is often preferable to a full mock because it doesn't require specifying return values for methods that return data.

One critical problem with mocks is **over-specification**. When you write `every { repo.getUser("1") } returns user`, you've hardcoded the argument `"1"`. If the production code changes to pass the user ID from a different source (and it's now `"user-1"`), the mock returns the default value (null or throws) and the test fails — not because of a bug, but because of a refactoring. This kind of false failure erodes trust in the test suite.

Another problem with mocks is **test fragility during refactoring**. Suppose you refactor your ViewModel to batch API calls for efficiency. The behavior is identical — the same data appears on screen — but instead of calling `getUser("1")` and `getSettings("1")` separately, it calls `getUserWithSettings("1")`. Every mock-based test that specified `getUser` and `getSettings` expectations now fails. With fakes, the tests continue to pass because they verify the output (correct state on screen), not the internal implementation.

The "mock everything" anti-pattern often emerges from poor architecture. When classes have too many dependencies, mocking is the path of least resistance because building fakes for 8 interfaces feels overwhelming. The real fix is to reduce the number of dependencies through better design — use cases, aggregate repositories, or simpler abstractions. When a class has 2-3 dependencies, building fakes is trivial.

There's a legitimate use case for mocks: verifying interactions with third-party libraries whose behavior you can't easily replicate. If you're testing that your code correctly calls a payment SDK's `authorize` method with the right parameters, a mock makes sense because building a fake payment SDK is impractical. But for your own interfaces — repositories, use cases, services — fakes are almost always the better choice.

The maintenance cost difference becomes clear over time. A project with 500 mock-based tests requires updating mock expectations every time the production code changes. A project with 500 fake-based tests requires updating fakes only when the interface contract changes — which happens far less frequently than implementation changes. The cumulative time savings are substantial.

```kotlin
// Why fakes catch bugs that mocks miss
// Production code with a subtle bug
class CartViewModel(
    private val cartRepository: CartRepository
) : ViewModel() {
    fun addItem(item: Item) {
        viewModelScope.launch {
            cartRepository.addItem(item)
            // BUG: should reload cart after adding, but doesn't
            // _state.value = CartState.Updated(cartRepository.getCart())
        }
    }
}

// Mock test — passes despite the bug!
class CartViewModelMockTest {
    @Test
    fun `addItem calls repository`() = runTest {
        val mockRepo = mockk<CartRepository>()
        coEvery { mockRepo.addItem(any()) } just Runs
        val viewModel = CartViewModel(mockRepo)

        viewModel.addItem(Item("Widget", 9.99))
        advanceUntilIdle()

        coVerify { mockRepo.addItem(any()) } // passes — method was called
        // But the UI never updates! The mock can't detect this.
    }
}

// Fake test — catches the bug
class CartViewModelFakeTest {
    @Test
    fun `addItem updates cart state`() = runTest {
        val fakeRepo = FakeCartRepository()
        val viewModel = CartViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Empty cart
            viewModel.addItem(Item("Widget", 9.99))
            // This assertion catches the bug — state never updates
            val updated = awaitItem()
            assertIs<CartState.Updated>(updated)
            assertEquals(1, updated.items.size) // FAILS — revealing the bug
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Spy pattern for analytics verification
class SpyAnalyticsTracker : AnalyticsTracker {
    private val _events = mutableListOf<TrackedEvent>()
    val events: List<TrackedEvent> get() = _events.toList()

    override fun track(eventName: String, properties: Map<String, Any>) {
        _events.add(TrackedEvent(eventName, properties))
    }

    fun assertTracked(eventName: String) {
        assertTrue(
            events.any { it.name == eventName },
            "Expected event '$eventName' but tracked events were: ${events.map { it.name }}"
        )
    }

    fun assertTrackedWithProperty(eventName: String, key: String, value: Any) {
        val event = events.find { it.name == eventName }
        assertNotNull(event, "Event '$eventName' was not tracked")
        assertEquals(value, event.properties[key])
    }

    fun assertNotTracked(eventName: String) {
        assertFalse(
            events.any { it.name == eventName },
            "Event '$eventName' should not have been tracked"
        )
    }

    data class TrackedEvent(val name: String, val properties: Map<String, Any>)
}
```

```kotlin
// When mocks are acceptable — third-party SDK interaction
class PaymentProcessorTest {
    @Test
    fun `calls payment SDK with correct amount and currency`() = runTest {
        val mockSdk = mockk<PaymentSdk>()
        coEvery {
            mockSdk.authorize(any(), any(), any())
        } returns PaymentSdkResult.Authorized("auth-123")

        val processor = PaymentProcessor(mockSdk)
        processor.processPayment(49.99, Currency.USD)

        coVerify {
            mockSdk.authorize(
                amount = eq(4999L),     // SDK expects cents
                currency = eq("USD"),
                idempotencyKey = any()
            )
        }
    }
}
```

```kotlin
// Refactoring resilience comparison
// Original production code
class ProfileViewModel(private val repo: ProfileRepository) : ViewModel() {
    fun load(userId: String) {
        viewModelScope.launch {
            val user = repo.getUser(userId)
            val settings = repo.getSettings(userId)
            _state.value = ProfileState.Loaded(user, settings)
        }
    }
}

// After refactoring — combined method for efficiency
class ProfileViewModel(private val repo: ProfileRepository) : ViewModel() {
    fun load(userId: String) {
        viewModelScope.launch {
            val profile = repo.getUserWithSettings(userId) // new combined method
            _state.value = ProfileState.Loaded(profile.user, profile.settings)
        }
    }
}

// Mock test BREAKS after refactoring
// coVerify { repo.getUser("1") }    — no longer called
// coVerify { repo.getSettings("1") } — no longer called

// Fake test STILL PASSES after refactoring
// It verifies: is the state correct? Yes → pass
// It doesn't care which methods were called internally
```

#### Common Mistakes

**Using `verify` for every mock interaction.** If your test has 5 `verify` calls, you're testing 5 implementation details. One change to the production code breaks all 5 verifications. Instead, verify the observable outcome — the final state, the return value, the emitted event.

**Mocking data classes.** Data classes should never be mocked. They're just containers for data. Create real instances: `User("1", "Mukul", "mukul@test.com")`. Mocking a data class adds complexity without any benefit.

**Using `any()` matchers everywhere.** `every { repo.getUser(any()) } returns user` doesn't verify that the correct ID was passed. If the production code passes `null` or the wrong ID, the mock happily returns the user anyway. This gives false confidence. With a fake, passing the wrong ID returns null or throws — catching the bug.

**Key takeaway:** Use fakes for stateful dependencies (repositories, caches, stores). Use spies for side-effect verification (analytics, logging). Reserve mocks for third-party SDKs and legacy code you can't refactor.

### Lesson 3.4: Building Test Fixtures and Factories

Test fixtures are shared test data and configuration that make tests concise and readable. Instead of constructing complex objects inline in every test, create factory functions and builder patterns that produce test data with sensible defaults and easy overrides. Good fixtures eliminate boilerplate while keeping tests self-documenting.

The simplest fixture pattern is the factory function. Instead of writing `User(id = "1", name = "Mukul", email = "mukul@test.com", isPremium = false, createdAt = 1700000000000L, settings = UserSettings(...))` in every test, create `fun testUser(name: String = "Mukul", isPremium: Boolean = false): User`. Tests that care about the name override it; tests that don't care use the default. The result is test code that highlights what's relevant and hides what's incidental.

Kotlin's default parameter values make factory functions incredibly powerful. You can define a `testUser()` function with defaults for every field and override only the fields your test cares about. `testUser(isPremium = true)` immediately tells the reader: "this test is about premium user behavior." The other fields are irrelevant to this test and are hidden behind sensible defaults.

For complex object graphs — an `Order` with `List<LineItem>`, each containing a `Product` with a `Category` — factory functions compose naturally. `testOrder(items = listOf(testLineItem(product = testProduct(category = "Electronics"))))`. Each factory function handles its own defaults, and the composition reads like a specification of the test scenario.

Factory functions should live in a shared test source set, typically in a file like `TestFixtures.kt` or grouped by domain in files like `UserTestFixtures.kt` and `OrderTestFixtures.kt`. This prevents every test file from defining its own `createTestUser()` function with slightly different defaults. Consistency across the test suite makes tests predictable and reduces cognitive load.

Beyond simple factories, the builder pattern is useful when objects have many configuration options. A `TestUserBuilder` with fluent methods like `.withPremium()`, `.withExpiredSubscription()`, `.withEmptyCart()` reads like natural language and makes test setup self-documenting. This is especially valuable for complex domain objects where the relationship between fields matters — for example, a premium user must have a subscription end date in the future.

One advanced pattern is the "scenario builder" that creates an entire test scenario — multiple related objects that form a coherent state. `TestScenario.userWithPendingOrder()` might create a user, an order with status PENDING, and the associated line items. This eliminates the boilerplate of manually creating and wiring together related objects in every test.

Test fixtures also include shared fake configurations. Instead of configuring `fakeRepo.shouldFail = true; fakeRepo.failureException = IOException("timeout")` in every error test, create `fun setupNetworkError(fake: FakeUserRepository)` or use a builder: `FakeUserRepository.withNetworkError()`. These shared configurations make error testing consistent and reduce copy-paste mistakes.

```kotlin
// Factory functions with default parameters
fun testUser(
    id: String = "user-1",
    name: String = "Mukul",
    email: String = "mukul@test.com",
    isPremium: Boolean = false,
    createdAt: Long = 1_700_000_000_000L
): User = User(id, name, email, isPremium, createdAt)

fun testArticle(
    id: String = "article-1",
    title: String = "Test Article",
    author: String = "Mukul",
    content: String = "Test content",
    publishedAt: Long = 1_700_000_000_000L,
    isBookmarked: Boolean = false
): Article = Article(id, title, author, content, publishedAt, isBookmarked)

fun testOrder(
    id: String = "order-1",
    userId: String = "user-1",
    items: List<LineItem> = listOf(testLineItem()),
    status: OrderStatus = OrderStatus.PENDING,
    total: Double = items.sumOf { it.subtotal }
): Order = Order(id, userId, items, status, total)

fun testLineItem(
    productId: String = "product-1",
    productName: String = "Widget",
    quantity: Int = 1,
    unitPrice: Double = 9.99,
    subtotal: Double = quantity * unitPrice
): LineItem = LineItem(productId, productName, quantity, unitPrice, subtotal)
```

```kotlin
// Clean tests using factory functions
class OrderTotalTest {
    @Test
    fun `single item order total equals item price`() {
        val order = testOrder(
            items = listOf(testLineItem(unitPrice = 25.0))
        )
        assertEquals(25.0, order.total, 0.01)
    }

    @Test
    fun `multi-item order sums all line items`() {
        val order = testOrder(
            items = listOf(
                testLineItem(productName = "Widget", unitPrice = 10.0, quantity = 2),
                testLineItem(productName = "Gadget", unitPrice = 15.0, quantity = 1)
            )
        )
        assertEquals(35.0, order.total, 0.01)
    }

    @Test
    fun `premium user order applies member discount`() {
        val user = testUser(isPremium = true)
        val order = testOrder(
            userId = user.id,
            items = listOf(testLineItem(unitPrice = 100.0))
        )
        // Only the relevant data (isPremium, price) is visible
        // All other fields use sensible defaults
        val discounted = applyMemberDiscount(user, order)
        assertEquals(90.0, discounted.total, 0.01)
    }
}
```

```kotlin
// Builder pattern for complex test objects
class TestUserBuilder {
    private var id: String = "user-1"
    private var name: String = "Test User"
    private var email: String = "test@example.com"
    private var isPremium: Boolean = false
    private var subscriptionEnd: Long? = null
    private var orderHistory: List<Order> = emptyList()

    fun withId(id: String) = apply { this.id = id }
    fun withName(name: String) = apply { this.name = name }
    fun withEmail(email: String) = apply { this.email = email }
    fun asPremium(subscriptionEndMs: Long = Long.MAX_VALUE) = apply {
        isPremium = true
        subscriptionEnd = subscriptionEndMs
    }
    fun withOrders(vararg orders: Order) = apply {
        orderHistory = orders.toList()
    }

    fun build(): User = User(id, name, email, isPremium, subscriptionEnd, orderHistory)
}

fun testUserBuilder() = TestUserBuilder()

// Usage in tests
class PremiumFeatureTest {
    @Test
    fun `premium user sees exclusive content`() {
        val user = testUserBuilder()
            .asPremium()
            .build()

        val viewModel = ContentViewModel(FakeContentRepository())
        viewModel.loadContent(user)

        assertTrue(viewModel.state.value.showsExclusiveContent)
    }

    @Test
    fun `expired premium user loses exclusive access`() {
        val user = testUserBuilder()
            .asPremium(subscriptionEndMs = 1_000_000L) // expired
            .build()

        val viewModel = ContentViewModel(FakeContentRepository())
        viewModel.loadContent(user)

        assertFalse(viewModel.state.value.showsExclusiveContent)
    }
}
```

```kotlin
// Scenario builders for complex test setups
object TestScenarios {
    fun userWithPendingOrder(): Pair<User, Order> {
        val user = testUser(id = "user-1", name = "Mukul")
        val order = testOrder(
            userId = user.id,
            status = OrderStatus.PENDING,
            items = listOf(
                testLineItem(productName = "Widget", unitPrice = 29.99),
                testLineItem(productName = "Gadget", unitPrice = 49.99)
            )
        )
        return user to order
    }

    fun userWithCompletedOrders(count: Int): Pair<User, List<Order>> {
        val user = testUser()
        val orders = (1..count).map { i ->
            testOrder(
                id = "order-$i",
                userId = user.id,
                status = OrderStatus.COMPLETED,
                items = listOf(testLineItem(unitPrice = 10.0 * i))
            )
        }
        return user to orders
    }

    fun emptyCart(): CartState {
        return CartState(items = emptyList(), total = 0.0, itemCount = 0)
    }
}

// Using scenarios in tests
class OrderHistoryViewModelTest {
    @Test
    fun `displays completed orders with total spending`() = runTest {
        val (user, orders) = TestScenarios.userWithCompletedOrders(3)
        val fakeRepo = FakeOrderRepository().apply {
            orders.forEach { addOrder(it) }
        }
        val viewModel = OrderHistoryViewModel(fakeRepo)

        viewModel.loadHistory(user.id)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertIs<OrderHistoryState.Loaded>(state)
        assertEquals(3, state.orders.size)
    }
}
```

#### Common Mistakes

**Using random data in test fixtures.** `testUser(name = UUID.randomUUID().toString())` makes test failures non-reproducible. Use deterministic, readable values: `testUser(name = "Mukul")`. If you need unique IDs, use predictable patterns: `"user-1"`, `"user-2"`.

**Overriding too many defaults in factory calls.** If most tests override 5 of 6 fields in `testUser()`, the defaults aren't serving their purpose. Either adjust the defaults to match the common case, or create specialized factories: `testPremiumUser()`, `testGuestUser()`.

**Defining fixtures inline instead of in shared files.** If 10 test files each define their own `fun createUser()`, you have 10 slightly different user factories. When the `User` class gains a new required field, you fix it in 10 places. Centralize fixtures in a shared test module.

**Key takeaway:** Use factory functions with Kotlin default parameters to create test data that highlights what's relevant and hides what's not. Centralize fixtures in shared test modules to eliminate duplication and ensure consistency.

### Lesson 3.5: Testing the Test Doubles

This lesson might seem paradoxical — why test your test doubles? Because a broken fake produces false positives. If your `FakeUserRepository` has a bug in its `getUser` implementation, every test that relies on it might pass even though the production code is wrong. Testing fakes ensures they behave consistently with the real implementation.

The principle is simple: if your fake has logic, test that logic. A fake that just returns hardcoded values doesn't need tests — there's nothing that can break. But a fake that stores data in a map, applies filters, handles pagination, or throws on missing data has behavior that can be incorrect. A test for the fake verifies that the fake's simplified implementation matches the real implementation's contract.

The most effective way to test fakes is with **contract tests** — a single set of tests that run against both the fake and the real implementation. You write tests like `save then get returns same user`, `get nonexistent throws`, `delete then get throws`, and run them against `FakeUserRepository` and `RealUserRepository`. If both pass the same tests, you have confidence that the fake accurately models the real behavior.

Contract tests serve a dual purpose: they verify the fake is correct, and they serve as a specification for the interface. When someone adds a new implementation of `UserRepository`, they can run the contract tests to verify their implementation is correct. When someone modifies the fake, the contract tests catch any behavioral divergence from the real implementation.

For contract tests to work, the test setup needs to be parameterizable. You create an abstract test class with all the tests, and concrete subclasses that provide the specific implementation — one with the fake, one with the real implementation. The fake subclass runs instantly on the JVM. The real subclass might need an in-memory database or MockWebServer but runs the same tests.

Even without full contract tests, you should at least test critical fake behaviors. If your `FakeArticleRepository` has filtering logic (bookmarked articles, articles by category), test that the filtering works correctly. If your fake paginates results, test that pagination returns the right slices. These tests are cheap to write and prevent subtle bugs where the fake behaves differently from the real implementation.

When should you skip testing fakes? When they're trivially simple. A fake with a `shouldFail` flag and a map-backed store is hard to get wrong. But a fake that implements cursor-based pagination, full-text search, or complex query logic deserves its own tests. The complexity of the fake determines whether testing it is worthwhile.

A common failure mode is the "divergent fake" — a fake that was correct when first written but diverged from the real implementation over time. The real repository gained a new validation rule (e.g., email uniqueness), but the fake was never updated. Now tests pass with duplicate emails, but production rejects them. Contract tests prevent this divergence by running the same tests against both implementations.

```kotlin
// Contract tests for UserRepository implementations
abstract class UserRepositoryContract {
    abstract fun createRepository(): UserRepository

    private lateinit var repo: UserRepository

    @Before
    fun setUp() {
        repo = createRepository()
    }

    @Test
    fun `save and get returns same user`() = runTest {
        val user = testUser(id = "1", name = "Mukul")
        repo.saveUser(user)
        val retrieved = repo.getUser("1")
        assertEquals(user, retrieved)
    }

    @Test
    fun `get nonexistent user throws`() = runTest {
        assertThrows<UserNotFoundException> {
            repo.getUser("nonexistent")
        }
    }

    @Test
    fun `delete removes user`() = runTest {
        repo.saveUser(testUser(id = "1"))
        repo.deleteUser("1")
        assertThrows<UserNotFoundException> {
            repo.getUser("1")
        }
    }

    @Test
    fun `save overwrites existing user`() = runTest {
        repo.saveUser(testUser(id = "1", name = "Old Name"))
        repo.saveUser(testUser(id = "1", name = "New Name"))
        assertEquals("New Name", repo.getUser("1").name)
    }

    @Test
    fun `observeUsers emits current users`() = runTest {
        repo.saveUser(testUser(id = "1", name = "Mukul"))
        repo.saveUser(testUser(id = "2", name = "Ravi"))

        val users = repo.observeUsers().first()
        assertEquals(2, users.size)
    }
}

// Run against the fake
class FakeUserRepositoryTest : UserRepositoryContract() {
    override fun createRepository(): UserRepository = FakeUserRepository()
}

// Run against the real implementation (integration test)
@RunWith(AndroidJUnit4::class)
class RealUserRepositoryTest : UserRepositoryContract() {
    private lateinit var db: AppDatabase

    override fun createRepository(): UserRepository {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        return UserRepositoryImpl(db.userDao())
    }

    @After
    fun cleanup() { db.close() }
}
```

```kotlin
// Testing complex fake behavior independently
class FakeArticleRepositoryTest {
    private val fake = FakeArticleRepository()

    @Before
    fun setup() {
        fake.addArticles(
            testArticle(id = "1", title = "Kotlin Basics", isBookmarked = false),
            testArticle(id = "2", title = "Compose Guide", isBookmarked = false),
            testArticle(id = "3", title = "Testing Tips", isBookmarked = false)
        )
    }

    @After
    fun teardown() { fake.clear() }

    @Test
    fun `toggleBookmark adds to bookmarks`() = runTest {
        fake.toggleBookmark("1")
        assertTrue(fake.isBookmarked("1"))
    }

    @Test
    fun `toggleBookmark twice removes from bookmarks`() = runTest {
        fake.toggleBookmark("1")
        fake.toggleBookmark("1")
        assertFalse(fake.isBookmarked("1"))
    }

    @Test
    fun `observeBookmarkedArticles returns only bookmarked`() = runTest {
        fake.toggleBookmark("2")
        val bookmarked = fake.observeBookmarkedArticles().first()
        assertEquals(1, bookmarked.size)
        assertEquals("Compose Guide", bookmarked[0].title)
    }

    @Test
    fun `getArticles paginates correctly`() = runTest {
        val page0 = fake.getArticles(page = 0, pageSize = 2)
        val page1 = fake.getArticles(page = 1, pageSize = 2)
        assertEquals(2, page0.size)
        assertEquals(1, page1.size)
    }

    @Test
    fun `getArticle throws when shouldFail is true`() = runTest {
        fake.shouldFail = true
        assertThrows<IOException> {
            fake.getArticle("1")
        }
    }
}
```

```kotlin
// Testing fake Flow emissions
class FakeNotificationRepositoryTest {
    private val fake = FakeNotificationRepository()

    @Test
    fun `emitting notifications updates flow`() = runTest {
        fake.observeNotifications().test {
            fake.emit(listOf(
                Notification("1", "Hello", isRead = false)
            ))

            val notifications = awaitItem()
            assertEquals(1, notifications.size)
            assertEquals("Hello", notifications[0].title)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `markAsRead updates read status in subsequent emissions`() = runTest {
        fake.emit(listOf(
            Notification("1", "Hello", isRead = false),
            Notification("2", "World", isRead = false)
        ))

        fake.markAsRead("1")

        val notifications = fake.observeNotifications().first()
        assertTrue(notifications.find { it.id == "1" }!!.isRead)
        assertFalse(notifications.find { it.id == "2" }!!.isRead)
    }

    @Test
    fun `getUnreadCount reflects current state`() = runTest {
        fake.emit(listOf(
            Notification("1", "A", isRead = false),
            Notification("2", "B", isRead = true),
            Notification("3", "C", isRead = false)
        ))

        assertEquals(2, fake.getUnreadCount())

        fake.markAsRead("1")
        assertEquals(1, fake.getUnreadCount())
    }
}
```

#### Common Mistakes

**Never testing fakes.** If your fake has non-trivial logic and you never test it, you're building your entire test suite on an unverified foundation. One bug in the fake can cause hundreds of false-positive tests.

**Writing contract tests but only running the fake version.** The whole point of contract tests is to verify behavioral equivalence between the fake and the real implementation. If you only run the fake version, you're just testing the fake — you haven't verified that it matches the real behavior.

**Overcomplicating fakes to pass contract tests.** If your contract tests require the fake to implement complex query logic, full-text search, or transaction semantics, consider simplifying the interface or accepting that some behaviors can't be faked cheaply and should only be tested at the integration level.

**Key takeaway:** Test fakes that have logic. Use contract tests to verify behavioral equivalence between fakes and real implementations. A broken fake silently produces false-positive tests, so invest in fake correctness.

### Lesson 3.6: Shared Fakes Across Test Suites

As your test suite grows, fakes become shared infrastructure that multiple test files, modules, and test types rely on. Managing shared fakes effectively — versioning them alongside production interfaces, distributing them across modules, and maintaining behavioral consistency — is a critical skill for sustainable test architecture.

The primary challenge with shared fakes is keeping them in sync with production interfaces. When a production interface gains a new method, the fake must implement it. When a method's contract changes (e.g., `getUser` now throws `UserBannedException` in addition to `UserNotFoundException`), the fake must mirror that behavior. Compilation errors catch missing methods, but behavioral changes require deliberate fake updates.

The solution is to co-locate fakes with their interfaces or in a dedicated testing module. If `UserRepository` lives in `:core:data`, the `FakeUserRepository` should live in `:core:data-testing` or in `:testing:fakes`. This co-location ensures that whoever modifies `UserRepository` also sees and updates `FakeUserRepository` in the same code review.

For multi-module Android projects, create a `:testing` module that contains all shared fakes, fixtures, rules, and test utilities. Every feature module's test configuration depends on `:testing`. This prevents each module from creating its own incompatible version of `FakeUserRepository` and ensures consistent test behavior across the entire project.

Fake composition is a pattern where complex fakes are built from simpler ones. A `FakeAppEnvironment` might compose `FakeUserRepository`, `FakeOrderRepository`, `FakeAnalytics`, and `FakeClock` into a single object that provides the complete test environment. Tests create a `FakeAppEnvironment` and destructure it into the fakes they need.

Fake versioning becomes important when your project has multiple release branches. If the `main` branch has `FakeUserRepository` with a `getProfile` method but the release branch doesn't, switching branches breaks tests. Keep fakes on the same branch lifecycle as production code to avoid this.

Thread safety in fakes matters when tests run in parallel. If `FakeUserRepository` uses a non-thread-safe `HashMap` and two tests modify it concurrently, you get `ConcurrentModificationException`. Use `ConcurrentHashMap` or `Mutex` in fakes that might be accessed from multiple threads.

Documentation for shared fakes helps new team members understand what's available and how to use it. A `README.md` in the testing module listing all available fakes, their capabilities, and usage examples saves onboarding time. KDoc on fake classes explaining their behavior and configuration options is equally valuable.

```kotlin
// Fake composition pattern
class FakeAppEnvironment {
    val userRepository = FakeUserRepository()
    val orderRepository = FakeOrderRepository()
    val analytics = SpyAnalyticsTracker()
    val clock = FakeClock()
    val sessionManager = FakeSessionManager()

    fun reset() {
        userRepository.clear()
        orderRepository.clear()
        analytics.clear()
        clock.setTo(0)
        sessionManager.clear()
    }
}

// Usage in tests
class DashboardViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val env = FakeAppEnvironment()

    @Before
    fun setup() { env.reset() }

    @Test
    fun `loads user data with current time`() = runTest {
        env.userRepository.addUser(testUser(id = "1", name = "Mukul"))
        env.clock.setTo(1_700_000_000_000L)

        val viewModel = DashboardViewModel(
            env.userRepository,
            env.orderRepository,
            env.clock
        )

        viewModel.loadDashboard("1")

        val state = viewModel.state.value
        assertIs<DashboardState.Loaded>(state)
        assertEquals("Mukul", state.userName)
    }
}
```

```kotlin
// Thread-safe fake for parallel test execution
class ThreadSafeFakeUserRepository : UserRepository {
    private val users = ConcurrentHashMap<String, User>()
    private val _usersFlow = MutableStateFlow<List<User>>(emptyList())

    @Volatile var shouldFail = false
    @Volatile var failureException: Exception = IOException("Network error")

    fun addUser(user: User) {
        users[user.id] = user
        _usersFlow.value = users.values.toList()
    }

    fun clear() {
        users.clear()
        _usersFlow.value = emptyList()
        shouldFail = false
    }

    override suspend fun getUser(id: String): User {
        if (shouldFail) throw failureException
        return users[id] ?: throw UserNotFoundException(id)
    }

    override suspend fun saveUser(user: User) {
        if (shouldFail) throw failureException
        users[user.id] = user
        _usersFlow.value = users.values.toList()
    }

    override suspend fun deleteUser(id: String) {
        if (shouldFail) throw failureException
        users.remove(id)
        _usersFlow.value = users.values.toList()
    }

    override fun observeUsers(): Flow<List<User>> = _usersFlow
}
```

```kotlin
// Testing module structure for a multi-module project
// :testing/build.gradle.kts
/*
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:data"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    implementation("app.cash.turbine:turbine:1.0.0")
    implementation("junit:junit:4.13.2")
}
*/

// Feature module test dependency
// :feature:orders/build.gradle.kts
/*
dependencies {
    testImplementation(project(":testing"))
}
*/
```

#### Common Mistakes

**Duplicating fakes across modules.** If three feature modules each have their own `FakeUserRepository`, updating the `UserRepository` interface requires updating three fakes. Centralize in a shared testing module.

**Not making fakes thread-safe for parallel tests.** `HashMap` throws `ConcurrentModificationException` when accessed from multiple threads. Use `ConcurrentHashMap` for fakes that might be used in parallel test execution.

**Putting feature-specific test data in the shared module.** The shared module should contain generic fakes and fixtures. Feature-specific test scenarios (`userWithExpiredSubscriptionAndPendingOrder`) belong in the feature module's tests.

**Key takeaway:** Co-locate fakes with their production interfaces or centralize them in a shared testing module. Use fake composition for complex test environments. Make fakes thread-safe for parallel execution. Document shared fakes for team onboarding.

### Quiz: Fakes and Test Doubles

#### What is the primary advantage of fakes over mocks?

- ❌ Fakes are faster to create than mocks
- ✅ Fakes verify behavior through state, survive refactoring, and catch real bugs — mocks test implementation details and break on refactoring
- ❌ Fakes don't require interfaces
- ❌ Mocks are deprecated in modern testing

> **Explanation:** Fakes test what the system does (state verification), not how it does it (behavior verification). When you refactor production code, fakes continue to work because the observable outcome doesn't change. Mocks break because the internal method calls changed.

#### When is it acceptable to use a mock instead of a fake?

- ❌ Always — mocks are simpler than fakes
- ❌ When the dependency has state (repositories, caches)
- ✅ When verifying interactions with third-party SDKs or legacy code you can't refactor
- ❌ When you need to test error scenarios

> **Explanation:** Mocks are appropriate for third-party libraries whose interfaces you don't control and can't easily fake. For your own interfaces — repositories, use cases, services — fakes are almost always the better choice because they test behavior, not implementation.

#### What is a contract test?

- ❌ A test that verifies your app's Terms of Service
- ❌ A test that only runs in production
- ✅ A shared set of tests that run against both the fake and real implementation to verify behavioral equivalence
- ❌ A test that verifies interface method signatures

> **Explanation:** Contract tests are a single test suite that runs against both the fake and the real implementation. If both pass the same tests, the fake accurately models the real behavior. This prevents "divergent fakes" that silently differ from the real implementation.

### Coding Challenge: Build a Reusable Fake

Build a `FakeProductRepository` that implements `ProductRepository` with in-memory storage, configurable error modes, and Flow-based observation. Then write contract tests that verify both the fake and (theoretically) the real implementation share the same behavior.

#### Solution

```kotlin
interface ProductRepository {
    suspend fun getProduct(id: String): Product
    suspend fun searchProducts(query: String): List<Product>
    suspend fun saveProduct(product: Product)
    fun observeProducts(): Flow<List<Product>>
}

class FakeProductRepository : ProductRepository {
    private val products = mutableMapOf<String, Product>()
    private val _productsFlow = MutableStateFlow<List<Product>>(emptyList())
    var shouldFail = false
    var failureException: Exception = IOException("Network error")

    fun addProduct(product: Product) {
        products[product.id] = product
        _productsFlow.value = products.values.toList()
    }

    fun clear() {
        products.clear()
        _productsFlow.value = emptyList()
        shouldFail = false
    }

    override suspend fun getProduct(id: String): Product {
        if (shouldFail) throw failureException
        return products[id] ?: throw ProductNotFoundException(id)
    }

    override suspend fun searchProducts(query: String): List<Product> {
        if (shouldFail) throw failureException
        return products.values.filter {
            it.name.contains(query, ignoreCase = true)
        }
    }

    override suspend fun saveProduct(product: Product) {
        if (shouldFail) throw failureException
        products[product.id] = product
        _productsFlow.value = products.values.toList()
    }

    override fun observeProducts(): Flow<List<Product>> = _productsFlow
}

// Contract tests
abstract class ProductRepositoryContract {
    abstract fun createRepository(): ProductRepository

    private lateinit var repo: ProductRepository

    @Before
    fun setUp() { repo = createRepository() }

    @Test
    fun `save and retrieve product`() = runTest {
        val product = Product("1", "Widget", 9.99)
        repo.saveProduct(product)
        assertEquals(product, repo.getProduct("1"))
    }

    @Test
    fun `get nonexistent product throws`() = runTest {
        assertThrows<ProductNotFoundException> {
            repo.getProduct("nonexistent")
        }
    }

    @Test
    fun `search finds matching products`() = runTest {
        repo.saveProduct(Product("1", "Kotlin Book", 29.99))
        repo.saveProduct(Product("2", "Java Book", 24.99))
        repo.saveProduct(Product("3", "Widget", 9.99))

        val results = repo.searchProducts("Book")
        assertEquals(2, results.size)
    }

    @Test
    fun `search with no matches returns empty`() = runTest {
        repo.saveProduct(Product("1", "Widget", 9.99))
        assertTrue(repo.searchProducts("Nonexistent").isEmpty())
    }
}

class FakeProductRepositoryTest : ProductRepositoryContract() {
    override fun createRepository(): ProductRepository = FakeProductRepository()
}
```

This challenge practices building a production-quality fake with in-memory storage, configurable failures, Flow-based observation, and contract tests that verify behavioral correctness.

---


## Module 4: Testing ViewModels

ViewModels are the most important classes to test in an Android app. They contain the business logic orchestration, state management, and user interaction handling that drives your entire UI. A well-tested ViewModel gives you confidence that your app behaves correctly without ever rendering a screen. This module covers how to test ViewModels with StateFlow, handle async operations, manage dispatchers, and verify complex state transitions.

### Lesson 4.1: ViewModel Testing Setup

Every ViewModel test needs two things: a way to control coroutine dispatchers and a way to observe state emissions. The `MainDispatcherRule` replaces `Dispatchers.Main` with a test dispatcher so ViewModel coroutines execute predictably. Without it, any ViewModel that uses `viewModelScope.launch` (which uses `Dispatchers.Main`) throws an "no Main dispatcher" error in JVM tests.

The `MainDispatcherRule` is a JUnit `TestRule` that swaps `Dispatchers.Main` before each test and restores it after. This is essential because `viewModelScope` in Android uses `Dispatchers.Main.immediate` by default. In a JVM test environment, there's no Android main looper, so `Dispatchers.Main` is undefined. The rule provides a `TestDispatcher` that makes coroutine execution deterministic and controllable.

There are two types of test dispatchers: `UnconfinedTestDispatcher` and `StandardTestDispatcher`. `UnconfinedTestDispatcher` executes coroutines eagerly — as soon as they're launched, they run to completion. This is convenient for simple tests where you want everything to happen synchronously. `StandardTestDispatcher` requires explicit advancement — you call `advanceUntilIdle()` to run pending coroutines. This gives you fine-grained control over execution order, which is essential for testing loading states and intermediate emissions.

For most ViewModel tests, `UnconfinedTestDispatcher` is the right choice because it simplifies test code. You call a ViewModel method, and the result is immediately available. But when you need to test that a ViewModel shows a loading state before showing data, you need `StandardTestDispatcher` because `UnconfinedTestDispatcher` skips the loading state entirely — it runs the entire coroutine before returning control to the test.

The basic test structure follows a consistent pattern: create fakes, create the ViewModel with those fakes, call a method, and assert on the resulting state. The `@Before` method sets up the fakes and ViewModel. Each test configures the fakes for its specific scenario, calls the ViewModel method, and asserts on `viewModel.state.value` or uses Turbine to assert on Flow emissions.

ViewModel tests should be pure JVM tests — they run in the `test` source set, not `androidTest`. They don't need an Android emulator, a Hilt component, or an Application context. This is the payoff of constructor injection: you create `ProfileViewModel(fakeRepo)` directly, no framework required. Pure JVM tests run in milliseconds, making TDD practical.

One subtle aspect of ViewModel testing is lifecycle awareness. In production, a ViewModel survives configuration changes and is cleared when the associated lifecycle owner is destroyed. In tests, you create and discard ViewModels freely. But if your ViewModel starts background coroutines in `init {}`, those coroutines might still be running when the test ends. Use `advanceUntilIdle()` to let all coroutines complete, or structure your ViewModel to only start work when explicitly requested.

Test isolation is critical for ViewModel tests. Each test should create its own ViewModel instance (or at least reset shared state). If test A modifies the ViewModel's state and test B reads it, you have an ordering dependency. The safest approach is to create the ViewModel in the test method itself or in `@Before`, and to create fresh fakes for each test.

```kotlin
// MainDispatcherRule — essential for every ViewModel test
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}
```

```kotlin
// Basic ViewModel test setup
class ProfileViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var fakeRepo: FakeUserRepository
    private lateinit var viewModel: ProfileViewModel

    @Before
    fun setup() {
        fakeRepo = FakeUserRepository()
        viewModel = ProfileViewModel(fakeRepo)
    }

    @Test
    fun `initial state is idle`() {
        assertEquals(ProfileState.Idle, viewModel.state.value)
    }

    @Test
    fun `loadProfile with valid ID shows user data`() = runTest {
        fakeRepo.addUser(testUser(id = "1", name = "Mukul"))

        viewModel.loadProfile("1")

        val state = viewModel.state.value
        assertIs<ProfileState.Loaded>(state)
        assertEquals("Mukul", state.user.name)
    }

    @Test
    fun `loadProfile with invalid ID shows error`() = runTest {
        viewModel.loadProfile("nonexistent")

        val state = viewModel.state.value
        assertIs<ProfileState.Error>(state)
    }

    @Test
    fun `loadProfile on network error shows retry`() = runTest {
        fakeRepo.shouldFail = true

        viewModel.loadProfile("1")

        val state = viewModel.state.value
        assertIs<ProfileState.Error>(state)
        assertTrue(state.isRetryable)
    }
}
```

```kotlin
// Production ViewModel code
class ProfileViewModel(
    private val userRepository: UserRepository
) : ViewModel() {
    private val _state = MutableStateFlow<ProfileState>(ProfileState.Idle)
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    fun loadProfile(userId: String) {
        viewModelScope.launch {
            _state.value = ProfileState.Loading
            try {
                val user = userRepository.getUser(userId)
                _state.value = ProfileState.Loaded(user)
            } catch (e: UserNotFoundException) {
                _state.value = ProfileState.Error("User not found", isRetryable = false)
            } catch (e: IOException) {
                _state.value = ProfileState.Error("Network error", isRetryable = true)
            }
        }
    }
}

sealed class ProfileState {
    object Idle : ProfileState()
    object Loading : ProfileState()
    data class Loaded(val user: User) : ProfileState()
    data class Error(val message: String, val isRetryable: Boolean) : ProfileState()
}
```

```kotlin
// Testing with StandardTestDispatcher for loading state verification
class ProfileViewModelLoadingTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    @Test
    fun `loadProfile shows loading before data`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1"))
        val viewModel = ProfileViewModel(fakeRepo)

        assertEquals(ProfileState.Idle, viewModel.state.value)

        viewModel.loadProfile("1")
        // With StandardTestDispatcher, coroutine hasn't run yet
        assertEquals(ProfileState.Idle, viewModel.state.value)

        advanceUntilIdle() // Now run pending coroutines
        assertIs<ProfileState.Loaded>(viewModel.state.value)
    }
}
```

```kotlin
// Testing ViewModel with multiple dependencies
class CheckoutViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeCart = FakeCartRepository()
    private val fakePayment = FakePaymentRepository()
    private val spyAnalytics = SpyAnalyticsTracker()

    private fun createViewModel() = CheckoutViewModel(
        cartRepository = fakeCart,
        paymentRepository = fakePayment,
        analytics = spyAnalytics
    )

    @Test
    fun `checkout with valid cart processes payment`() = runTest {
        fakeCart.addItem(testLineItem(unitPrice = 29.99))
        val viewModel = createViewModel()

        viewModel.checkout()

        val state = viewModel.state.value
        assertIs<CheckoutState.Confirmed>(state)
    }

    @Test
    fun `checkout with empty cart shows error`() = runTest {
        val viewModel = createViewModel()

        viewModel.checkout()

        val state = viewModel.state.value
        assertIs<CheckoutState.Error>(state)
        assertEquals("Cart is empty", state.message)
    }

    @Test
    fun `successful checkout tracks analytics`() = runTest {
        fakeCart.addItem(testLineItem(unitPrice = 29.99))
        val viewModel = createViewModel()

        viewModel.checkout()

        spyAnalytics.assertTracked("checkout_completed")
        spyAnalytics.assertTrackedWithProperty("checkout_completed", "total", 29.99)
    }
}
```

#### Common Mistakes

**Forgetting the MainDispatcherRule.** Without it, any `viewModelScope.launch` call throws `IllegalStateException: Module with the Main dispatcher had failed to initialize`. This is the most common ViewModel testing error for beginners.

**Using `Thread.sleep()` instead of `advanceUntilIdle()`.** When you need to wait for async operations, use `runTest` with `advanceUntilIdle()` or Turbine's `awaitItem()`. `Thread.sleep` makes tests slow and flaky.

**Testing ViewModel internals instead of observable state.** Your test should assert on `viewModel.state.value` or Flow emissions, not on internal properties. If you need to access `viewModel._state` (private), your test is testing implementation, not behavior.

**Key takeaway:** Use `MainDispatcherRule` for every ViewModel test. Create ViewModels with fakes via constructor injection. Assert on observable state, not internal implementation. Keep tests as pure JVM tests for millisecond execution.

### Lesson 4.2: Testing State Transitions

Most ViewModel bugs aren't about wrong final states — they're about wrong intermediate states. The loading spinner that never appears, the error that shows for a split second before data loads, the stale data that flashes before the new data arrives. Testing state transitions catches these bugs by verifying the entire sequence of states, not just the final one.

Turbine is the essential tool for testing StateFlow emissions in sequence. Instead of checking `viewModel.state.value` (which only gives you the latest value, missing intermediate emissions), Turbine's `test {}` block lets you `awaitItem()` each emission in order. You can verify that the ViewModel emits `Loading`, then `Loaded(data)`, in that exact sequence.

The critical insight about StateFlow testing is **conflation**. StateFlow only keeps the latest value, and if a new value arrives before the collector processes the previous one, the previous value is dropped. This means that `Loading` might never be observed if the data arrives immediately. With `UnconfinedTestDispatcher`, the entire coroutine runs synchronously — `Loading` is set and immediately overwritten by `Loaded`. Turbine with `StandardTestDispatcher` avoids this problem because you control when each coroutine step executes.

For comprehensive state transition testing, verify three things: the initial state before any action, the intermediate states during async operations, and the final state after completion. Also verify that error states are recoverable — calling `retry()` should transition back to `Loading` and then either `Loaded` or `Error`.

State transition tests are particularly valuable for features with complex workflows. A multi-step checkout process might transition through `CartReview -> PaymentInput -> Processing -> Confirmation`. Each transition has preconditions (cart is non-empty, payment info is valid) and postconditions (order is created, confirmation number is generated). Testing the full transition chain catches bugs in the orchestration logic.

Error recovery is another critical transition to test. When a network error occurs during loading, the ViewModel should transition to an error state with a retry option. When the user taps retry, the ViewModel should transition back to loading and attempt the operation again. This retry loop should work repeatedly — the ViewModel shouldn't get stuck in a state where retry does nothing.

One subtle bug that state transition tests catch is "state leaking" — when state from a previous operation bleeds into a new operation. For example, if the user loads profile A (showing "Mukul"), then loads profile B (network error), the error state should not contain any data from profile A. If the ViewModel incorrectly preserves old data during the new load, a state transition test will catch it.

Another class of bugs is "missing state reset." When the user navigates away and comes back, or when the ViewModel is used for a new entity, the state should reset to its initial value. If the ViewModel shows stale data from the previous use, a state transition test that verifies the initial state after reset will catch it.

```kotlin
// Testing the full state transition sequence with Turbine
class OrdersViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    private val fakeRepo = FakeOrderRepository()

    @Test
    fun `loadOrders transitions through idle to loading to loaded`() = runTest {
        fakeRepo.addOrder(testOrder(id = "1", status = OrderStatus.PENDING))
        fakeRepo.addOrder(testOrder(id = "2", status = OrderStatus.COMPLETED))
        val viewModel = OrdersViewModel(fakeRepo)

        viewModel.state.test {
            // Initial state
            assertEquals(OrdersState.Idle, awaitItem())

            // Trigger load
            viewModel.loadOrders("user-1")

            // Loading state
            assertEquals(OrdersState.Loading, awaitItem())

            // Loaded state
            val loaded = awaitItem()
            assertIs<OrdersState.Loaded>(loaded)
            assertEquals(2, loaded.orders.size)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `loadOrders on error shows error then retry recovers`() = runTest {
        fakeRepo.shouldFail = true
        val viewModel = OrdersViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle

            viewModel.loadOrders("user-1")
            awaitItem() // Loading

            val error = awaitItem()
            assertIs<OrdersState.Error>(error)

            // Fix the error condition and retry
            fakeRepo.shouldFail = false
            fakeRepo.addOrder(testOrder(id = "1"))

            viewModel.retry()
            awaitItem() // Loading again

            val loaded = awaitItem()
            assertIs<OrdersState.Loaded>(loaded)
            assertEquals(1, loaded.orders.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Production code with full state transition support
class OrdersViewModel(
    private val repository: OrderRepository
) : ViewModel() {
    private val _state = MutableStateFlow<OrdersState>(OrdersState.Idle)
    val state: StateFlow<OrdersState> = _state.asStateFlow()

    private var lastUserId: String? = null

    fun loadOrders(userId: String) {
        lastUserId = userId
        viewModelScope.launch {
            _state.value = OrdersState.Loading
            try {
                val orders = repository.getOrders(userId)
                _state.value = OrdersState.Loaded(orders)
            } catch (e: Exception) {
                _state.value = OrdersState.Error(
                    message = e.message ?: "Unknown error",
                    isRetryable = e is IOException
                )
            }
        }
    }

    fun retry() {
        lastUserId?.let { loadOrders(it) }
    }
}

sealed class OrdersState {
    object Idle : OrdersState()
    object Loading : OrdersState()
    data class Loaded(val orders: List<Order>) : OrdersState()
    data class Error(val message: String, val isRetryable: Boolean) : OrdersState()
}
```

```kotlin
// Testing multi-step workflows
class CheckoutViewModelTransitionTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    private val fakeCart = FakeCartRepository()
    private val fakePayment = FakePaymentRepository()

    @Test
    fun `checkout transitions through review to processing to confirmed`() = runTest {
        fakeCart.addItem(testLineItem(unitPrice = 49.99))
        val viewModel = CheckoutViewModel(fakeCart, fakePayment)

        viewModel.state.test {
            assertEquals(CheckoutState.CartReview, awaitItem())

            viewModel.proceedToPayment()
            assertEquals(CheckoutState.PaymentInput, awaitItem())

            viewModel.submitPayment(testPaymentInfo())
            assertEquals(CheckoutState.Processing, awaitItem())

            val confirmed = awaitItem()
            assertIs<CheckoutState.Confirmed>(confirmed)
            assertNotNull(confirmed.confirmationNumber)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `payment failure transitions to error with retry`() = runTest {
        fakeCart.addItem(testLineItem(unitPrice = 49.99))
        fakePayment.failureMode = FakeFailureMode.NetworkError
        val viewModel = CheckoutViewModel(fakeCart, fakePayment)

        viewModel.state.test {
            awaitItem() // CartReview
            viewModel.proceedToPayment()
            awaitItem() // PaymentInput
            viewModel.submitPayment(testPaymentInfo())
            awaitItem() // Processing

            val error = awaitItem()
            assertIs<CheckoutState.PaymentError>(error)
            assertTrue(error.isRetryable)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing state reset and stale data prevention
class ProfileViewModelTransitionTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    @Test
    fun `loading new profile clears previous profile data`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1", name = "Mukul"))
        fakeRepo.addUser(testUser(id = "2", name = "Ravi"))
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle

            // Load first profile
            viewModel.loadProfile("1")
            awaitItem() // Loading
            val first = awaitItem()
            assertIs<ProfileState.Loaded>(first)
            assertEquals("Mukul", first.user.name)

            // Load second profile — should show Loading, NOT stale Mukul data
            viewModel.loadProfile("2")
            val loading = awaitItem()
            assertEquals(ProfileState.Loading, loading)

            val second = awaitItem()
            assertIs<ProfileState.Loaded>(second)
            assertEquals("Ravi", second.user.name)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `error after successful load does not show stale data`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1", name = "Mukul"))
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.loadProfile("1")
            awaitItem() // Loading
            awaitItem() // Loaded with Mukul

            // Now load non-existent profile
            viewModel.loadProfile("nonexistent")
            awaitItem() // Loading
            val error = awaitItem()
            assertIs<ProfileState.Error>(error)
            // Error state should NOT contain Mukul's data

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Only testing the final state.** Checking `viewModel.state.value` after `advanceUntilIdle()` tells you the end result but misses intermediate states. If the ViewModel never shows a loading spinner (skipping `Loading` state), you won't catch it. Use Turbine to verify the full sequence.

**Using `UnconfinedTestDispatcher` when testing transitions.** Unconfined dispatcher runs coroutines eagerly, so intermediate states like `Loading` are immediately overwritten. Use `StandardTestDispatcher` with Turbine to observe each state in sequence.

**Not testing error recovery.** Testing that errors are displayed is only half the story. Test that the user can recover — retry the operation, navigate back, or dismiss the error. The retry flow is where many ViewModel bugs hide.

**Key takeaway:** Test the full state transition sequence — initial state, loading, success/error, and recovery. Use Turbine with `StandardTestDispatcher` to observe each emission in order and catch intermediate state bugs.

### Lesson 4.3: Testing User Actions

User actions — button taps, form submissions, pull-to-refresh, search queries — are the inputs that drive ViewModel behavior. Testing user actions verifies that each input produces the correct state change, side effect, or navigation event. This is where you ensure your app responds correctly to every interaction a user can perform.

The testing pattern for user actions is straightforward: set up the preconditions (Given), trigger the action (When), and verify the resulting state (Then). The action is typically a ViewModel method call — `viewModel.onSearchQueryChanged("kotlin")`, `viewModel.onItemClicked(item)`, `viewModel.onRefresh()`. The result is a state change, a navigation event, or a side effect like an analytics tracking call.

For form validation, test both valid and invalid inputs. When the user enters a valid email and password and taps login, the ViewModel should transition to a loading state and then either success or error. When the user enters an invalid email, the ViewModel should immediately show a validation error without making any network calls. The validation logic should be testable independently as a pure function.

Debounced actions like search require special handling. When the user types "k", "ko", "kot", "kotl", "kotli", "kotlin", you don't want to fire 6 API calls. The ViewModel should debounce the input and only search after the user stops typing for a configurable delay (typically 300-500ms). Testing this requires `advanceTimeBy()` to simulate the passage of time without actually waiting.

One-time events like navigation and snackbar messages need special testing patterns. These are events that should be consumed exactly once — if the user rotates the screen, the navigation event shouldn't fire again. The most common pattern is a `Channel<Event>` exposed as a `Flow<Event>`. Tests use Turbine to verify the event is emitted and then verify no more events follow.

Multi-action coordination tests verify that actions interact correctly. For example, the user adds an item to the cart (action 1), applies a promo code (action 2), and taps checkout (action 3). Each action modifies the state, and the final checkout should reflect the cart contents AND the applied promo code. Testing these interactions catches bugs where one action overwrites another's state.

Edge cases around user actions include rapid tapping (does double-tapping "checkout" create two orders?), concurrent actions (what happens if the user edits their profile while a save is in progress?), and action cancellation (does navigating away cancel the in-progress operation?). These edge cases are where production bugs live, and they're straightforward to test with coroutine test infrastructure.

Error handling for user actions should be tested separately from success paths. When a save fails due to network error, does the ViewModel keep the user's input so they can retry without re-entering everything? When a delete fails, does the item reappear in the list? When a search fails, does the previous search result remain visible? These recovery behaviors are critical for good UX and should be verified by tests.

```kotlin
// Testing form validation and submission
class LoginViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeAuth = FakeAuthRepository()
    private lateinit var viewModel: LoginViewModel

    @Before
    fun setup() {
        viewModel = LoginViewModel(fakeAuth)
    }

    @Test
    fun `valid credentials show success`() = runTest {
        fakeAuth.addValidCredentials("mukul@test.com", "password123")

        viewModel.onEmailChanged("mukul@test.com")
        viewModel.onPasswordChanged("password123")
        viewModel.onLoginClicked()

        val state = viewModel.state.value
        assertIs<LoginState.Success>(state)
    }

    @Test
    fun `empty email shows validation error`() {
        viewModel.onEmailChanged("")
        viewModel.onLoginClicked()

        val state = viewModel.state.value
        assertIs<LoginState.ValidationError>(state)
        assertEquals("Email is required", state.emailError)
    }

    @Test
    fun `invalid email format shows validation error`() {
        viewModel.onEmailChanged("not-an-email")
        viewModel.onPasswordChanged("password123")
        viewModel.onLoginClicked()

        val state = viewModel.state.value
        assertIs<LoginState.ValidationError>(state)
        assertEquals("Invalid email format", state.emailError)
    }

    @Test
    fun `short password shows validation error`() {
        viewModel.onEmailChanged("mukul@test.com")
        viewModel.onPasswordChanged("abc")
        viewModel.onLoginClicked()

        val state = viewModel.state.value
        assertIs<LoginState.ValidationError>(state)
        assertEquals("Password must be at least 8 characters", state.passwordError)
    }

    @Test
    fun `wrong credentials show auth error`() = runTest {
        viewModel.onEmailChanged("mukul@test.com")
        viewModel.onPasswordChanged("wrongpassword")
        viewModel.onLoginClicked()

        val state = viewModel.state.value
        assertIs<LoginState.AuthError>(state)
        assertEquals("Invalid credentials", state.message)
    }
}
```

```kotlin
// Testing debounced search
class SearchViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    @Test
    fun `search debounces rapid input`() = runTest {
        val fakeRepo = FakeSearchRepository()
        fakeRepo.setResults("kotlin", listOf(
            SearchResult("1", "Kotlin Basics")
        ))
        val viewModel = SearchViewModel(fakeRepo, debounceMs = 300L)

        viewModel.state.test {
            awaitItem() // Idle

            // Rapid typing — should NOT trigger search for each character
            viewModel.onQueryChanged("k")
            viewModel.onQueryChanged("ko")
            viewModel.onQueryChanged("kot")
            viewModel.onQueryChanged("kotlin")

            // Wait for debounce period
            advanceTimeBy(350)

            // Only one search should have been triggered
            val state = awaitItem()
            assertIs<SearchState.Results>(state)
            assertEquals(1, fakeRepo.searchCallCount)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `clearing search query cancels pending search`() = runTest {
        val fakeRepo = FakeSearchRepository()
        val viewModel = SearchViewModel(fakeRepo, debounceMs = 300L)

        viewModel.onQueryChanged("kotlin")
        advanceTimeBy(100) // Before debounce completes
        viewModel.onQueryChanged("") // Clear

        advanceTimeBy(400) // Past debounce period
        assertEquals(0, fakeRepo.searchCallCount) // No search triggered
    }
}
```

```kotlin
// Production code: ViewModel with debounced search
class SearchViewModel(
    private val repository: SearchRepository,
    private val debounceMs: Long = 300L
) : ViewModel() {
    private val _state = MutableStateFlow<SearchState>(SearchState.Idle)
    val state: StateFlow<SearchState> = _state.asStateFlow()

    private val queryFlow = MutableStateFlow("")

    init {
        viewModelScope.launch {
            queryFlow
                .debounce(debounceMs)
                .filter { it.isNotBlank() }
                .collectLatest { query ->
                    _state.value = SearchState.Loading
                    try {
                        val results = repository.search(query)
                        _state.value = SearchState.Results(results)
                    } catch (e: Exception) {
                        _state.value = SearchState.Error(e.message ?: "Search failed")
                    }
                }
        }
    }

    fun onQueryChanged(query: String) {
        queryFlow.value = query
        if (query.isBlank()) {
            _state.value = SearchState.Idle
        }
    }
}
```

```kotlin
// Testing one-time navigation events
class ItemDetailViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `add to cart shows confirmation snackbar`() = runTest {
        val fakeCart = FakeCartRepository()
        val viewModel = ItemDetailViewModel(fakeCart)

        viewModel.events.test {
            viewModel.addToCart(testLineItem())

            val event = awaitItem()
            assertIs<ItemDetailEvent.ShowSnackbar>(event)
            assertEquals("Added to cart", event.message)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `buy now navigates to checkout`() = runTest {
        val fakeCart = FakeCartRepository()
        val viewModel = ItemDetailViewModel(fakeCart)

        viewModel.events.test {
            viewModel.buyNow(testLineItem())

            val event = awaitItem()
            assertIs<ItemDetailEvent.NavigateToCheckout>(event)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing double-tap protection
class OrderViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `double tapping checkout does not create duplicate orders`() = runTest {
        val fakeCart = FakeCartRepository()
        fakeCart.addItem(testLineItem())
        val fakePayment = FakePaymentRepository()
        val viewModel = OrderViewModel(fakeCart, fakePayment)

        // Simulate rapid double tap
        viewModel.onCheckoutClicked()
        viewModel.onCheckoutClicked()

        advanceUntilIdle()

        // Only one order should be created
        assertEquals(1, fakePayment.processedPayments.size)
    }

    @Test
    fun `checkout button is disabled during processing`() = runTest {
        val fakeCart = FakeCartRepository()
        fakeCart.addItem(testLineItem())
        val fakePayment = FakePaymentRepository()
        fakePayment.artificialDelayMs = 1000
        val viewModel = OrderViewModel(fakeCart, fakePayment)

        viewModel.onCheckoutClicked()
        // During processing, button should be disabled
        assertTrue(viewModel.state.value.isCheckoutDisabled)
    }
}
```

#### Common Mistakes

**Not testing validation independently.** If your ViewModel validates email format, test the validation logic as a pure function, not through the ViewModel. Then test that the ViewModel calls the validator and uses the result correctly. This separates validation logic testing from orchestration testing.

**Ignoring debounce behavior.** If your search ViewModel debounces input, test that rapid typing doesn't trigger multiple API calls. Use `advanceTimeBy()` to simulate the debounce delay and verify that only one search is executed.

**Not testing one-time events are consumed.** Navigation events and snackbar messages should be consumed exactly once. If you use `SharedFlow(replay = 0)` or `Channel`, verify that the event doesn't replay on configuration change. If you use `SharedFlow(replay = 1)`, verify you handle replay correctly.

**Key takeaway:** Test every user action your ViewModel handles — form submissions, search queries, button taps, and swipe-to-refresh. Verify both the state change and any side effects. Pay special attention to debouncing, double-tap protection, and one-time events.

### Lesson 4.4: Testing ViewModel with Multiple Data Sources

Real-world ViewModels rarely depend on a single data source. A dashboard ViewModel might combine user profile data from one repository, notification count from another, and feature flags from a third. Testing these composite ViewModels requires coordinating multiple fakes and verifying that the ViewModel correctly combines data from all sources.

The simplest pattern is sequential loading — the ViewModel fetches from source A, then source B, then combines the results. This is straightforward to test: configure both fakes, call the load method, and assert on the combined state. The test verifies that both data sources are consulted and their results are correctly merged.

Parallel loading is more interesting. When the ViewModel uses `async` to fetch from multiple sources concurrently, you need to verify that it handles partial failures correctly. If source A succeeds but source B fails, does the ViewModel show the data from A with an error indicator for B? Or does it show a full error? The answer depends on your UX requirements, and the test should verify the chosen behavior.

Combined Flow observation is another common pattern. The ViewModel observes `Flow<User>` from the user repository and `Flow<List<Notification>>` from the notification repository, combining them with `combine()`. When either source emits a new value, the combined state updates. Testing this requires pushing values into both fake flows and verifying the combined result.

Error isolation is a critical concern. When one data source fails, it shouldn't prevent the other sources from providing data. A well-designed ViewModel shows partial data with an error indicator, not a full-screen error that hides all the data that loaded successfully. Tests should verify this by failing one fake while keeping the others healthy.

Data freshness and staleness create additional testing scenarios. When the user pulls to refresh, all data sources should be refreshed. When one source returns stale data from cache, the ViewModel might show it with a "stale data" indicator while fetching fresh data in the background. These nuanced behaviors require careful test setup and assertion.

Dependency ordering matters when one data source depends on another's output. For example, the ViewModel first fetches the user (to get their preferences), then fetches content filtered by those preferences. The second fetch depends on the first's result. Testing this requires verifying the correct call sequence and data flow between sources.

When combining data from multiple sources, transformation logic should be extracted into pure functions. `fun combineProfileData(user: User, notifications: List<Notification>, featureFlags: FeatureFlags): DashboardState` is trivially testable. The ViewModel test only needs to verify that this function is called with the correct inputs from each source.

```kotlin
// ViewModel combining multiple data sources
class DashboardViewModel(
    private val userRepository: UserRepository,
    private val notificationRepository: NotificationRepository,
    private val featureFlagRepository: FeatureFlagRepository
) : ViewModel() {
    private val _state = MutableStateFlow<DashboardState>(DashboardState.Loading)
    val state: StateFlow<DashboardState> = _state.asStateFlow()

    fun loadDashboard(userId: String) {
        viewModelScope.launch {
            try {
                val user = userRepository.getUser(userId)
                val notifications = notificationRepository.getUnread(userId)
                val flags = featureFlagRepository.getFlags()
                _state.value = buildDashboardState(user, notifications, flags)
            } catch (e: Exception) {
                _state.value = DashboardState.Error(e.message ?: "Failed to load")
            }
        }
    }
}

// Pure function for combining data — tested independently
fun buildDashboardState(
    user: User,
    notifications: List<Notification>,
    flags: FeatureFlags
): DashboardState.Loaded {
    return DashboardState.Loaded(
        userName = user.name,
        unreadCount = notifications.size,
        showPremiumBanner = !user.isPremium && flags.showUpgradeBanner,
        notifications = notifications.take(5)
    )
}
```

```kotlin
// Testing the pure combination function
class DashboardStateBuilderTest {
    @Test
    fun `shows premium banner for free users when flag is enabled`() {
        val state = buildDashboardState(
            user = testUser(isPremium = false),
            notifications = emptyList(),
            flags = FeatureFlags(showUpgradeBanner = true)
        )
        assertTrue(state.showPremiumBanner)
    }

    @Test
    fun `hides premium banner for premium users`() {
        val state = buildDashboardState(
            user = testUser(isPremium = true),
            notifications = emptyList(),
            flags = FeatureFlags(showUpgradeBanner = true)
        )
        assertFalse(state.showPremiumBanner)
    }

    @Test
    fun `limits displayed notifications to 5`() {
        val notifications = (1..10).map {
            Notification("$it", "Title $it", isRead = false)
        }
        val state = buildDashboardState(
            user = testUser(),
            notifications = notifications,
            flags = FeatureFlags()
        )
        assertEquals(5, state.notifications.size)
    }
}
```

```kotlin
// Testing the ViewModel with all fakes
class DashboardViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeUserRepo = FakeUserRepository()
    private val fakeNotifRepo = FakeNotificationRepository()
    private val fakeFlags = FakeFeatureFlagRepository()

    private fun createViewModel() = DashboardViewModel(
        fakeUserRepo, fakeNotifRepo, fakeFlags
    )

    @Test
    fun `loads and combines data from all sources`() = runTest {
        fakeUserRepo.addUser(testUser(id = "1", name = "Mukul"))
        fakeNotifRepo.addNotifications(
            Notification("n1", "New message", isRead = false),
            Notification("n2", "Order shipped", isRead = false)
        )
        fakeFlags.setFlags(FeatureFlags(showUpgradeBanner = true))

        val viewModel = createViewModel()
        viewModel.loadDashboard("1")

        val state = viewModel.state.value
        assertIs<DashboardState.Loaded>(state)
        assertEquals("Mukul", state.userName)
        assertEquals(2, state.unreadCount)
    }

    @Test
    fun `user repo failure shows error`() = runTest {
        fakeUserRepo.shouldFail = true
        fakeNotifRepo.addNotifications(
            Notification("n1", "Message", isRead = false)
        )

        val viewModel = createViewModel()
        viewModel.loadDashboard("1")

        assertIs<DashboardState.Error>(viewModel.state.value)
    }
}
```

```kotlin
// Testing combined Flow observation
class ActivityFeedViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `combines user flow and activities flow`() = runTest {
        val fakeUserRepo = FakeUserRepository()
        val fakeActivityRepo = FakeActivityRepository()
        val viewModel = ActivityFeedViewModel(fakeUserRepo, fakeActivityRepo)

        viewModel.state.test {
            awaitItem() // Initial loading

            fakeUserRepo.emitUser(testUser(name = "Mukul"))
            fakeActivityRepo.emitActivities(listOf(
                Activity("1", "Liked a post"),
                Activity("2", "Commented on photo")
            ))

            val state = awaitItem()
            assertIs<ActivityFeedState.Loaded>(state)
            assertEquals("Mukul", state.userName)
            assertEquals(2, state.activities.size)

            // When activities update, state updates too
            fakeActivityRepo.emitActivities(listOf(
                Activity("1", "Liked a post"),
                Activity("2", "Commented on photo"),
                Activity("3", "Shared a story")
            ))

            val updated = awaitItem()
            assertIs<ActivityFeedState.Loaded>(updated)
            assertEquals(3, updated.activities.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Not testing partial failures.** When your ViewModel depends on 3 data sources and one fails, what happens? If you only test all-success and all-failure scenarios, you miss the partial failure cases that are most common in production.

**Putting combination logic in the ViewModel.** If your ViewModel has 30 lines of `if/else` logic to combine data from multiple sources, extract it into a pure function. Test the pure function with 20 different input combinations, and test the ViewModel only for orchestration.

**Not testing that all sources are actually consulted.** If your ViewModel is supposed to load user data AND notifications, test that both fakes received calls. A test that only asserts on user data might pass even if the ViewModel forgot to load notifications.

**Key takeaway:** When ViewModels combine data from multiple sources, extract the combination logic into pure functions. Test the pure function exhaustively for all input combinations. Test the ViewModel for orchestration — that it calls each source and combines the results correctly.

### Lesson 4.5: Testing Navigation and Side Effects

Navigation events and side effects are ViewModel outputs that go beyond state updates. When the user taps "Login" and authentication succeeds, the ViewModel should emit a navigation event to the home screen. When the user saves a form, the ViewModel should show a success snackbar. These outputs need their own testing patterns because they're consumed differently from StateFlow.

The recommended pattern for one-time events is a `Channel` exposed as a `Flow`. Unlike `StateFlow`, a `Channel` doesn't replay values — each event is consumed exactly once by exactly one collector. This prevents the navigation bug where rotating the screen re-triggers a navigation event. Tests use Turbine to collect and assert on these events.

Side effects like analytics tracking, logging, and notification scheduling should also be tested. These are actions that don't affect the ViewModel's state but are important for the app's behavior. Use spy objects that record calls, then assert on the spy's recorded data. `spyAnalytics.assertTracked("login_success")` is clear and specific.

Navigation testing requires verifying both the event type and the event payload. A navigation event to the product detail screen should include the product ID. A navigation event to the checkout screen should include the order summary. Test that the payload is correct, not just that the event was emitted.

For ViewModels that manage multiple types of side effects — navigation, snackbar, dialog — consider using a sealed class `Event` hierarchy. `Event.NavigateTo(screen)`, `Event.ShowSnackbar(message)`, `Event.ShowDialog(title, message)`. Each event type can be tested independently with its own assertions.

Cancellation of side effects is another important test scenario. When the user starts a long-running operation and navigates away before it completes, what happens? Does the ViewModel cancel the operation? Does it continue and discard the result? Does it continue and save the result for when the user returns? The correct behavior depends on your requirements, and the test should verify it.

Side effect ordering can be subtle. When the user completes a purchase, the ViewModel should (1) create the order, (2) track the analytics event, (3) clear the cart, and (4) navigate to the confirmation screen. If the order creation fails in step 1, steps 2-4 should not happen. Testing the correct ordering and error short-circuiting catches bugs where side effects leak even when the primary operation fails.

The relationship between state and events needs clear testing. After a successful operation, the ViewModel might update state (clear the form) AND emit an event (show success snackbar). Both should be tested, but in separate tests. One test verifies the state change, another verifies the event emission. This keeps tests focused and failure messages specific.

```kotlin
// ViewModel with navigation and side effects
class LoginViewModel(
    private val authRepository: AuthRepository,
    private val analytics: AnalyticsTracker,
    private val sessionManager: SessionManager
) : ViewModel() {
    private val _state = MutableStateFlow<LoginState>(LoginState.Idle)
    val state: StateFlow<LoginState> = _state.asStateFlow()

    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events: Flow<LoginEvent> = _events.receiveAsFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _state.value = LoginState.Loading
            try {
                val token = authRepository.authenticate(email, password)
                sessionManager.saveSession(token)
                analytics.track("login_success", mapOf("method" to "email"))
                _state.value = LoginState.Success
                _events.send(LoginEvent.NavigateToHome)
            } catch (e: InvalidCredentialsException) {
                analytics.track("login_failed", mapOf("reason" to "invalid_credentials"))
                _state.value = LoginState.Error("Invalid email or password")
            } catch (e: IOException) {
                _state.value = LoginState.Error("Network error. Please try again.")
            }
        }
    }
}

sealed class LoginEvent {
    object NavigateToHome : LoginEvent()
    data class ShowSnackbar(val message: String) : LoginEvent()
}
```

```kotlin
// Testing navigation events
class LoginViewModelNavigationTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeAuth = FakeAuthRepository()
    private val spyAnalytics = SpyAnalyticsTracker()
    private val fakeSession = FakeSessionManager()

    private fun createViewModel() = LoginViewModel(fakeAuth, spyAnalytics, fakeSession)

    @Test
    fun `successful login emits navigate to home event`() = runTest {
        fakeAuth.addValidCredentials("mukul@test.com", "password123")
        val viewModel = createViewModel()

        viewModel.events.test {
            viewModel.login("mukul@test.com", "password123")

            val event = awaitItem()
            assertIs<LoginEvent.NavigateToHome>(event)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `failed login does not emit navigation event`() = runTest {
        val viewModel = createViewModel()

        viewModel.events.test {
            viewModel.login("wrong@test.com", "wrongpass")

            // No event should be emitted
            expectNoEvents()

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `successful login saves session`() = runTest {
        fakeAuth.addValidCredentials("mukul@test.com", "pass123")
        val viewModel = createViewModel()

        viewModel.login("mukul@test.com", "pass123")

        assertNotNull(fakeSession.currentSession)
    }

    @Test
    fun `failed login does not save session`() = runTest {
        val viewModel = createViewModel()

        viewModel.login("wrong@test.com", "wrongpass")

        assertNull(fakeSession.currentSession)
    }
}
```

```kotlin
// Testing analytics side effects
class LoginViewModelAnalyticsTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeAuth = FakeAuthRepository()
    private val spyAnalytics = SpyAnalyticsTracker()
    private val fakeSession = FakeSessionManager()

    private fun createViewModel() = LoginViewModel(fakeAuth, spyAnalytics, fakeSession)

    @Test
    fun `successful login tracks success event`() = runTest {
        fakeAuth.addValidCredentials("mukul@test.com", "pass123")
        val viewModel = createViewModel()

        viewModel.login("mukul@test.com", "pass123")

        spyAnalytics.assertTracked("login_success")
        spyAnalytics.assertTrackedWithProperty("login_success", "method", "email")
    }

    @Test
    fun `failed login tracks failure event with reason`() = runTest {
        val viewModel = createViewModel()

        viewModel.login("wrong@test.com", "wrongpass")

        spyAnalytics.assertTracked("login_failed")
        spyAnalytics.assertTrackedWithProperty("login_failed", "reason", "invalid_credentials")
    }

    @Test
    fun `network error login does not track any event`() = runTest {
        fakeAuth.shouldFail = true
        fakeAuth.failureException = IOException("No network")
        val viewModel = createViewModel()

        viewModel.login("mukul@test.com", "pass123")

        spyAnalytics.assertNotTracked("login_success")
        spyAnalytics.assertNotTracked("login_failed")
    }
}
```

```kotlin
// Testing side effect ordering — effects don't leak on failure
class PurchaseViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `failed payment does not clear cart or navigate`() = runTest {
        val fakeCart = FakeCartRepository()
        fakeCart.addItem(testLineItem())
        val fakePayment = FakePaymentRepository()
        fakePayment.failureMode = FakeFailureMode.NetworkError
        val spyAnalytics = SpyAnalyticsTracker()

        val viewModel = PurchaseViewModel(fakeCart, fakePayment, spyAnalytics)

        viewModel.events.test {
            viewModel.completePurchase()

            // No navigation event should be emitted
            expectNoEvents()
        }

        // Cart should NOT be cleared
        assertFalse(fakeCart.isEmpty())

        // Success analytics should NOT be tracked
        spyAnalytics.assertNotTracked("purchase_completed")
    }
}
```

#### Common Mistakes

**Using `StateFlow` for one-time events.** `StateFlow` replays the latest value to new collectors. If you use it for navigation events, rotating the screen re-collects the flow and re-triggers navigation. Use `Channel` for one-time events.

**Not testing that side effects DON'T happen on failure.** It's easy to test that analytics is tracked on success. It's equally important to test that analytics is NOT tracked when the operation fails. Leaked side effects on failure are a common source of production bugs.

**Testing side effects through state changes.** If your ViewModel tracks analytics, don't check `viewModel.state.value` to verify tracking. Use a spy analytics object and assert on its recorded events. State and side effects are independent concerns.

**Key takeaway:** Use `Channel<Event>` for one-time navigation events. Use spy objects for analytics and logging verification. Test both that side effects happen on success AND that they don't leak on failure.

### Lesson 4.6: Testing ViewModel Lifecycle

ViewModel lifecycle awareness affects testing in subtle ways. In production, a ViewModel is scoped to an Activity or Fragment and is cleared when the lifecycle owner is destroyed. In tests, you create and discard ViewModels freely. But lifecycle-related bugs — coroutines that outlive the ViewModel, state that's not properly initialized, and resources that aren't cleaned up — can still affect test correctness.

The `viewModelScope` is automatically cancelled when the ViewModel is cleared via `onCleared()`. In tests, this means any coroutine launched in `viewModelScope` is cancelled when the test ends (because the MainDispatcherRule resets the dispatcher). But if your ViewModel stores references to coroutine jobs or manages external resources, `onCleared()` cleanup should be tested explicitly.

Testing `onCleared()` behavior requires calling the method directly in tests. Although `onCleared()` is protected, you can call it via reflection or by creating a test-specific subclass. Alternatively, test the observable effects of cleanup — after clearing, pending operations should be cancelled, subscriptions should be unsubscribed, and resources should be released.

Initialization logic in `init {}` blocks runs when the ViewModel is constructed. If your ViewModel starts loading data in `init`, the test must account for this — the first state emission after construction might be `Loading`, not `Idle`. Use Turbine to capture and assert on the initial emissions before calling any test methods.

SavedStateHandle testing verifies that your ViewModel correctly saves and restores state across process death. Create a `SavedStateHandle` with initial values and pass it to the ViewModel constructor. Verify that the ViewModel reads saved values on construction and writes updated values back to the handle when state changes.

Configuration change simulation tests verify that the ViewModel's state survives rotation. In production, the ViewModel is retained across configuration changes while the Activity is recreated. In tests, this translates to: create the ViewModel, change its state, verify the state is still correct (because the ViewModel instance persists).

Testing ViewModel with `Lifecycle` awareness requires a lifecycle owner. Some ViewModels observe lifecycle events (e.g., pause data loading when the app goes to background). Use `TestLifecycleOwner` from the `lifecycle-testing` library to control lifecycle state in tests.

```kotlin
// Testing ViewModel initialization
class ProfileViewModelInitTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    @Test
    fun `ViewModel loads profile on construction`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "default", name = "Mukul"))

        val viewModel = ProfileViewModel(fakeRepo, defaultUserId = "default")

        viewModel.state.test {
            assertEquals(ProfileState.Loading, awaitItem()) // init triggered load

            advanceUntilIdle()

            val loaded = awaitItem()
            assertIs<ProfileState.Loaded>(loaded)
            assertEquals("Mukul", loaded.user.name)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing SavedStateHandle integration
class SearchViewModelSavedStateTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `restores search query from saved state`() {
        val savedState = SavedStateHandle(mapOf("query" to "kotlin"))
        val viewModel = SearchViewModel(FakeSearchRepository(), savedState)

        assertEquals("kotlin", viewModel.currentQuery.value)
    }

    @Test
    fun `saves query to saved state on change`() {
        val savedState = SavedStateHandle()
        val viewModel = SearchViewModel(FakeSearchRepository(), savedState)

        viewModel.onQueryChanged("compose")

        assertEquals("compose", savedState.get<String>("query"))
    }

    @Test
    fun `empty saved state starts with empty query`() {
        val savedState = SavedStateHandle()
        val viewModel = SearchViewModel(FakeSearchRepository(), savedState)

        assertEquals("", viewModel.currentQuery.value)
    }
}
```

```kotlin
// Testing onCleared cleanup
class StreamingViewModelCleanupTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `onCleared cancels background polling`() = runTest {
        val fakeRepo = FakeNotificationRepository()
        val viewModel = NotificationViewModel(fakeRepo)

        // Start polling
        viewModel.startPolling()
        advanceTimeBy(5000) // Let some polls execute
        assertTrue(fakeRepo.pollCount > 0)

        val pollCountBefore = fakeRepo.pollCount

        // Simulate ViewModel destruction
        viewModel.onCleared()
        advanceTimeBy(10000) // Wait for more potential polls

        // No more polls after clearing
        assertEquals(pollCountBefore, fakeRepo.pollCount)
    }
}
```

```kotlin
// Testing lifecycle-aware ViewModel
class LocationViewModelLifecycleTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `stops location updates when lifecycle moves to background`() = runTest {
        val fakeLocation = FakeLocationProvider()
        val lifecycleOwner = TestLifecycleOwner()
        val viewModel = LocationViewModel(fakeLocation)

        viewModel.observeLifecycle(lifecycleOwner)

        // Active — receives updates
        lifecycleOwner.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
        fakeLocation.emitLocation(Location(37.7749, -122.4194))

        viewModel.state.test {
            val state = awaitItem()
            assertIs<LocationState.Active>(state)
            cancelAndIgnoreRemainingEvents()
        }

        // Background — stops updates
        lifecycleOwner.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
        assertFalse(fakeLocation.isCollecting)
    }
}
```

#### Common Mistakes

**Not testing `init {}` side effects.** If your ViewModel starts loading data in `init`, your tests must account for the initial emissions. Use Turbine to capture them instead of assuming the first state is `Idle`.

**Ignoring SavedStateHandle in tests.** If your ViewModel uses `SavedStateHandle` for state restoration, test both the save and restore paths. Process death is a real scenario that users encounter.

**Not testing cleanup.** If your ViewModel starts background jobs, subscriptions, or resource-intensive operations, test that `onCleared()` properly cancels and releases them. Leaked resources cause memory leaks and battery drain.

**Key takeaway:** Test ViewModel initialization, SavedStateHandle integration, and cleanup. Account for `init {}` side effects in tests. Verify that `onCleared()` cancels pending operations. Use `TestLifecycleOwner` for lifecycle-aware ViewModel testing.

### Quiz: Testing ViewModels

#### What is the purpose of MainDispatcherRule in ViewModel tests?

- ❌ It speeds up test execution by 10x
- ✅ It replaces Dispatchers.Main with a test dispatcher so viewModelScope.launch works in JVM tests
- ❌ It automatically creates fakes for all dependencies
- ❌ It records all state changes for later assertion

> **Explanation:** `viewModelScope` uses `Dispatchers.Main.immediate`, which is unavailable in JVM tests. `MainDispatcherRule` swaps in a `TestDispatcher` that makes coroutine execution deterministic and controllable.

#### Why use StandardTestDispatcher instead of UnconfinedTestDispatcher for state transition tests?

- ❌ StandardTestDispatcher is faster
- ❌ UnconfinedTestDispatcher doesn't work with Turbine
- ✅ StandardTestDispatcher lets you observe intermediate states (like Loading) that UnconfinedTestDispatcher skips
- ❌ StandardTestDispatcher is the default and requires no setup

> **Explanation:** `UnconfinedTestDispatcher` runs coroutines eagerly — the entire coroutine runs to completion before the test can observe intermediate states. `StandardTestDispatcher` requires explicit advancement, letting you observe and assert on each intermediate state.

#### What pattern should be used for one-time navigation events in ViewModels?

- ❌ StateFlow — it automatically handles one-time consumption
- ❌ LiveData with Event wrapper
- ✅ Channel exposed as Flow — each event is consumed exactly once
- ❌ Callback interface passed to the ViewModel

> **Explanation:** `Channel<Event>` ensures each event is consumed exactly once by exactly one collector. Unlike `StateFlow`, it doesn't replay values, preventing duplicate navigation on configuration changes.

### Coding Challenge: Test a Complete ViewModel

Write a `TaskListViewModel` that loads tasks from a repository, allows toggling task completion, and emits a snackbar event when all tasks are completed. Write tests covering loading, toggling, error handling, and the completion event.

#### Solution

```kotlin
class TaskListViewModel(
    private val repository: TaskRepository
) : ViewModel() {
    private val _state = MutableStateFlow<TaskListState>(TaskListState.Loading)
    val state: StateFlow<TaskListState> = _state.asStateFlow()

    private val _events = Channel<TaskListEvent>(Channel.BUFFERED)
    val events: Flow<TaskListEvent> = _events.receiveAsFlow()

    fun loadTasks() {
        viewModelScope.launch {
            _state.value = TaskListState.Loading
            try {
                val tasks = repository.getTasks()
                _state.value = TaskListState.Loaded(tasks)
            } catch (e: Exception) {
                _state.value = TaskListState.Error("Failed to load tasks")
            }
        }
    }

    fun toggleTask(taskId: String) {
        viewModelScope.launch {
            val current = _state.value
            if (current !is TaskListState.Loaded) return@launch
            try {
                repository.toggleTask(taskId)
                val updated = repository.getTasks()
                _state.value = TaskListState.Loaded(updated)
                if (updated.all { it.isCompleted }) {
                    _events.send(TaskListEvent.AllTasksCompleted)
                }
            } catch (e: Exception) {
                _events.send(TaskListEvent.ShowError("Failed to update task"))
            }
        }
    }
}

class TaskListViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeRepo = FakeTaskRepository()

    @Test
    fun `loadTasks shows task list`() = runTest {
        fakeRepo.addTask(Task("1", "Buy groceries", false))
        fakeRepo.addTask(Task("2", "Walk dog", true))
        val viewModel = TaskListViewModel(fakeRepo)

        viewModel.loadTasks()

        val state = viewModel.state.value
        assertIs<TaskListState.Loaded>(state)
        assertEquals(2, state.tasks.size)
    }

    @Test
    fun `toggleTask updates completion status`() = runTest {
        fakeRepo.addTask(Task("1", "Buy groceries", false))
        val viewModel = TaskListViewModel(fakeRepo)
        viewModel.loadTasks()

        viewModel.toggleTask("1")

        val state = viewModel.state.value
        assertIs<TaskListState.Loaded>(state)
        assertTrue(state.tasks[0].isCompleted)
    }

    @Test
    fun `completing all tasks emits celebration event`() = runTest {
        fakeRepo.addTask(Task("1", "Buy groceries", true))
        fakeRepo.addTask(Task("2", "Walk dog", false))
        val viewModel = TaskListViewModel(fakeRepo)
        viewModel.loadTasks()

        viewModel.events.test {
            viewModel.toggleTask("2") // completes the last task
            val event = awaitItem()
            assertIs<TaskListEvent.AllTasksCompleted>(event)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `toggle error shows error event without changing state`() = runTest {
        fakeRepo.addTask(Task("1", "Buy groceries", false))
        val viewModel = TaskListViewModel(fakeRepo)
        viewModel.loadTasks()
        fakeRepo.shouldFail = true

        viewModel.events.test {
            viewModel.toggleTask("1")
            val event = awaitItem()
            assertIs<TaskListEvent.ShowError>(event)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

---


## Module 5: Testing Kotlin Flows

Kotlin Flow is the backbone of reactive data in modern Android apps. Repositories expose data as Flows, ViewModels transform and combine them, and the UI collects them. Testing Flows requires understanding their asynchronous nature, the difference between cold and hot flows, and the tools that make Flow testing deterministic. This module covers Turbine (the essential Flow testing library), StateFlow conflation, SharedFlow behavior, and complex Flow transformation testing.

### Lesson 5.1: Turbine — The Flow Testing Library

Turbine is a small but essential library that makes Flow testing deterministic and readable. Without Turbine, testing Flows requires collecting into a list, adding delays, and hoping the timing works out. With Turbine, you call `flow.test { }` and use `awaitItem()` to receive each emission in order, with clear timeout-based failure when expected emissions don't arrive.

The core API is simple. `flow.test { }` starts collecting the flow in a coroutine. Inside the block, `awaitItem()` suspends until the next emission and returns it. `awaitComplete()` suspends until the flow completes. `awaitError()` suspends until the flow throws an error. `cancelAndIgnoreRemainingEvents()` cleans up when you're done asserting. `expectNoEvents()` asserts that nothing was emitted within a timeout period.

Turbine solves the fundamental problem of Flow testing: timing. Without Turbine, you'd collect a flow into a list and then assert on the list contents. But how long do you wait before checking the list? Too short and emissions haven't arrived yet — test fails. Too long and the test is slow. Turbine eliminates this problem by suspending until the emission arrives, with a configurable timeout (default 3 seconds) that fails the test if the emission never comes.

Each `awaitItem()` call is a synchronization point. You call `awaitItem()`, Turbine waits for the next emission, returns it, and your test continues. This creates a lock-step interaction between the test and the flow: emit, await, assert, repeat. The test reads like a sequential script even though the flow is asynchronous.

Error handling in Turbine is clean. If the flow throws an exception, `awaitError()` catches it and returns it for assertion. If you call `awaitItem()` and the flow throws instead of emitting, Turbine throws a clear failure message telling you that an error was received when an item was expected. This makes flow error testing explicit rather than relying on `try-catch` blocks.

Turbine also handles Flow completion. When a finite flow (like `flowOf(1, 2, 3)`) finishes, `awaitComplete()` verifies the completion signal. If you try to `awaitItem()` after completion, Turbine throws a clear error. This prevents tests from hanging when the flow completes earlier than expected.

For StateFlow testing, Turbine requires special attention. StateFlow always has an initial value, so the first `awaitItem()` returns the current value. If you're not interested in the initial value, use `skipItems(1)` to skip it. StateFlow also conflates emissions — if two values are set in rapid succession, only the latest might be received by `awaitItem()`. Understanding conflation is critical for reliable StateFlow tests.

One advanced Turbine feature is `turbineScope { }` which lets you test multiple flows simultaneously. Inside a `turbineScope`, you can call `flow1.testIn(this)` and `flow2.testIn(this)` and then alternate between `awaitItem()` calls on each turbine. This is essential for testing ViewModels that expose multiple flow properties.

```kotlin
// Basic Turbine usage with a cold Flow
class FlowBasicsTest {
    @Test
    fun `cold flow emits values in order`() = runTest {
        val flow = flowOf(1, 2, 3)

        flow.test {
            assertEquals(1, awaitItem())
            assertEquals(2, awaitItem())
            assertEquals(3, awaitItem())
            awaitComplete()
        }
    }

    @Test
    fun `mapped flow transforms values`() = runTest {
        val flow = flowOf("hello", "world")
            .map { it.uppercase() }

        flow.test {
            assertEquals("HELLO", awaitItem())
            assertEquals("WORLD", awaitItem())
            awaitComplete()
        }
    }

    @Test
    fun `filtered flow skips non-matching values`() = runTest {
        val flow = flowOf(1, 2, 3, 4, 5)
            .filter { it % 2 == 0 }

        flow.test {
            assertEquals(2, awaitItem())
            assertEquals(4, awaitItem())
            awaitComplete()
        }
    }
}
```

```kotlin
// Testing Flow error handling
class FlowErrorTest {
    @Test
    fun `flow that throws emits error`() = runTest {
        val flow = flow {
            emit(1)
            emit(2)
            throw IOException("Network failed")
        }

        flow.test {
            assertEquals(1, awaitItem())
            assertEquals(2, awaitItem())
            val error = awaitError()
            assertIs<IOException>(error)
            assertEquals("Network failed", error.message)
        }
    }

    @Test
    fun `catch operator recovers from errors`() = runTest {
        val flow = flow {
            emit(1)
            throw IOException("Failed")
        }.catch { emit(-1) }

        flow.test {
            assertEquals(1, awaitItem())
            assertEquals(-1, awaitItem())
            awaitComplete()
        }
    }
}
```

```kotlin
// Testing StateFlow with Turbine
class StateFlowTest {
    @Test
    fun `StateFlow emits initial value first`() = runTest {
        val stateFlow = MutableStateFlow("initial")

        stateFlow.test {
            assertEquals("initial", awaitItem()) // always get initial value

            stateFlow.value = "updated"
            assertEquals("updated", awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `skipping initial StateFlow value`() = runTest {
        val viewModel = ProfileViewModel(FakeUserRepository())

        viewModel.state.test {
            skipItems(1) // Skip the initial Idle state

            viewModel.loadProfile("1")
            // Now we only see states after the action
            val loading = awaitItem()
            assertEquals(ProfileState.Loading, loading)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Production code with Flow transformations
class NotificationRepository(
    private val dao: NotificationDao
) {
    fun observeUnreadNotifications(): Flow<List<Notification>> {
        return dao.observeAll()
            .map { entities -> entities.filter { !it.isRead } }
            .map { entities -> entities.map { it.toDomain() } }
            .distinctUntilChanged()
    }

    fun observeUnreadCount(): Flow<Int> {
        return observeUnreadNotifications()
            .map { it.size }
            .distinctUntilChanged()
    }
}

// Testing the Flow transformation chain
class NotificationRepositoryTest {
    private val fakeDao = FakeNotificationDao()
    private val repo = NotificationRepository(fakeDao)

    @Test
    fun `observeUnreadNotifications filters read notifications`() = runTest {
        repo.observeUnreadNotifications().test {
            fakeDao.emit(listOf(
                NotificationEntity("1", "Hello", isRead = false),
                NotificationEntity("2", "Read msg", isRead = true),
                NotificationEntity("3", "New msg", isRead = false)
            ))

            val unread = awaitItem()
            assertEquals(2, unread.size)
            assertTrue(unread.all { !it.isRead })

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeUnreadCount reflects unread notification count`() = runTest {
        repo.observeUnreadCount().test {
            fakeDao.emit(listOf(
                NotificationEntity("1", "Hello", isRead = false),
                NotificationEntity("2", "World", isRead = false)
            ))
            assertEquals(2, awaitItem())

            // Mark one as read
            fakeDao.emit(listOf(
                NotificationEntity("1", "Hello", isRead = true),
                NotificationEntity("2", "World", isRead = false)
            ))
            assertEquals(1, awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing multiple flows with turbineScope
class DashboardViewModelMultiFlowTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `state and events can be tested simultaneously`() = runTest {
        val fakeRepo = FakeTaskRepository()
        fakeRepo.addTask(Task("1", "Last task", false))
        val viewModel = TaskListViewModel(fakeRepo)

        turbineScope {
            val stateTurbine = viewModel.state.testIn(this)
            val eventsTurbine = viewModel.events.testIn(this)

            // Initial state
            stateTurbine.awaitItem() // Loading

            viewModel.loadTasks()
            val loaded = stateTurbine.awaitItem()
            assertIs<TaskListState.Loaded>(loaded)

            // Toggle the last task — should emit event
            viewModel.toggleTask("1")
            stateTurbine.awaitItem() // Updated state

            val event = eventsTurbine.awaitItem()
            assertIs<TaskListEvent.AllTasksCompleted>(event)

            stateTurbine.cancelAndIgnoreRemainingEvents()
            eventsTurbine.cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Forgetting to handle the initial StateFlow emission.** `StateFlow` always emits its current value to new collectors. If your first `awaitItem()` expects the result of an action but receives the initial value instead, the test fails confusingly. Always account for the initial emission with `awaitItem()` or `skipItems(1)`.

**Not calling `cancelAndIgnoreRemainingEvents()`.** If a test block ends without consuming all emissions or explicitly canceling, Turbine reports an error about unconsumed events. Always end your `test { }` block with `cancelAndIgnoreRemainingEvents()` unless you're testing flow completion with `awaitComplete()`.

**Using `runBlocking` instead of `runTest`.** `runBlocking` doesn't provide the test dispatcher, so time-based Flow operators (`debounce`, `delay`) run in real time, making tests slow. `runTest` provides a virtual time environment where `delay(1000)` completes instantly.

**Key takeaway:** Use Turbine's `flow.test { awaitItem() }` pattern for all Flow testing. Always account for StateFlow's initial emission. Use `cancelAndIgnoreRemainingEvents()` to clean up. Use `runTest` for virtual time control.

### Lesson 5.2: Testing StateFlow Conflation

StateFlow conflation is the single most confusing aspect of Flow testing for Android developers. StateFlow only keeps the latest value, and if a new value is emitted before the previous one is collected, the previous value is silently dropped. This means your test might miss intermediate states like `Loading` if they're overwritten too quickly.

Conflation happens because StateFlow uses `conflate()` semantics internally. When a coroutine sets `_state.value = Loading` and immediately sets `_state.value = Loaded(data)`, the collector might only see `Loaded(data)` because `Loading` was conflated away. This is actually desirable behavior in production — the UI should render the latest state, not every intermediate state. But in tests, missing intermediate states can lead to incorrect assertions.

The solution is dispatcher control. With `UnconfinedTestDispatcher`, coroutines run eagerly and the entire operation completes before the collector has a chance to process intermediate emissions. With `StandardTestDispatcher`, you control when coroutines advance, giving the collector time to process each emission before the next one arrives.

Understanding when conflation matters is important. If your test only cares about the final state (`viewModel.state.value`), conflation is irrelevant — you always get the latest value. If your test needs to verify the sequence of states (idle → loading → loaded), conflation matters because `loading` might be skipped. Use `StandardTestDispatcher` and advance execution carefully when testing sequences.

There are several strategies to work around conflation in tests. The first is to use `StandardTestDispatcher` and advance incrementally. Call `advanceUntilIdle()` between each expected emission to give the collector time to process. The second is to add `yield()` in the production code between state changes, which forces the coroutine to relinquish control and lets collectors process. The third is to accept that some intermediate states might be conflated and test the final state instead.

The `yield()` approach is controversial. Adding `yield()` to production code purely for testability changes production behavior — it forces a suspension point where none existed before. Some teams accept this trade-off; others consider it test pollution. A middle ground is to use `ensureActive()` checks at natural boundaries, which serve double duty as cancellation checks and suspension points.

In practice, most ViewModel tests should use one of two patterns: `UnconfinedTestDispatcher` with `.value` for simple state checks, or `StandardTestDispatcher` with Turbine for sequence verification. Don't mix the two approaches within a single test class — consistency makes tests predictable.

StateFlow's `distinctUntilChanged` behavior is another source of test confusion. If you set `_state.value = Loading` twice, the second emission is dropped because it's the same as the current value. This means `awaitItem()` only returns `Loading` once, even if the production code sets it multiple times. This is usually the correct behavior, but it can be surprising in tests.

```kotlin
// Demonstrating conflation behavior
class ConflationDemoTest {
    @Test
    fun `UnconfinedTestDispatcher causes conflation`() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))

        val stateFlow = MutableStateFlow("A")

        stateFlow.test {
            assertEquals("A", awaitItem()) // Initial value

            // These happen synchronously — "B" is conflated
            stateFlow.value = "B"
            stateFlow.value = "C"

            assertEquals("C", awaitItem()) // "B" was skipped!

            cancelAndIgnoreRemainingEvents()
        }

        Dispatchers.resetMain()
    }

    @Test
    fun `StandardTestDispatcher preserves emissions`() = runTest {
        val stateFlow = MutableStateFlow("A")

        stateFlow.test {
            assertEquals("A", awaitItem())

            stateFlow.value = "B"
            assertEquals("B", awaitItem()) // No conflation

            stateFlow.value = "C"
            assertEquals("C", awaitItem()) // Each value observed

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// ViewModel conflation in practice
class ConflationViewModelTest {
    @Test
    fun `with UnconfinedTestDispatcher loading state is conflated`() = runTest {
        val rule = MainDispatcherRule(UnconfinedTestDispatcher(testScheduler))
        rule.starting(Description.EMPTY)

        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1"))
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle

            viewModel.loadProfile("1")
            // Loading was set and immediately overwritten by Loaded
            val state = awaitItem()
            assertIs<ProfileState.Loaded>(state) // Loading was skipped!

            cancelAndIgnoreRemainingEvents()
        }

        rule.finished(Description.EMPTY)
    }

    @Test
    fun `with StandardTestDispatcher loading state is observable`() = runTest {
        val rule = MainDispatcherRule(StandardTestDispatcher(testScheduler))
        rule.starting(Description.EMPTY)

        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1"))
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle

            viewModel.loadProfile("1")
            advanceUntilIdle()

            assertEquals(ProfileState.Loading, awaitItem())
            assertIs<ProfileState.Loaded>(awaitItem())

            cancelAndIgnoreRemainingEvents()
        }

        rule.finished(Description.EMPTY)
    }
}
```

```kotlin
// Strategies to handle conflation
class ConflationStrategiesTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    // Strategy 1: Use advanceUntilIdle with Turbine
    @Test
    fun `advance and collect each state`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1"))
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.state.test {
            assertEquals(ProfileState.Idle, awaitItem())

            viewModel.loadProfile("1")
            advanceUntilIdle()

            assertEquals(ProfileState.Loading, awaitItem())
            assertIs<ProfileState.Loaded>(awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    // Strategy 2: Only test final state when sequence doesn't matter
    @Test
    fun `verify final state without caring about intermediates`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1", name = "Mukul"))
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.loadProfile("1")
        advanceUntilIdle()

        // Just check the final state — no conflation issues
        val state = viewModel.state.value
        assertIs<ProfileState.Loaded>(state)
        assertEquals("Mukul", state.user.name)
    }
}
```

```kotlin
// distinctUntilChanged behavior
class DistinctUntilChangedTest {
    @Test
    fun `same value emitted twice only produces one emission`() = runTest {
        val stateFlow = MutableStateFlow(0)

        stateFlow.test {
            assertEquals(0, awaitItem())

            stateFlow.value = 1
            assertEquals(1, awaitItem())

            stateFlow.value = 1 // Same value — dropped by distinctUntilChanged
            // awaitItem() would timeout here because no new emission

            stateFlow.value = 2
            assertEquals(2, awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Assuming all intermediate states are observable.** With `UnconfinedTestDispatcher`, intermediate states between setting `Loading` and `Loaded` are conflated. If your test relies on observing every intermediate state, use `StandardTestDispatcher`.

**Fighting conflation instead of understanding it.** Conflation is a feature, not a bug. In production, it prevents the UI from rendering intermediate states that would cause visual flicker. In tests, use the right dispatcher for your testing goal: `Unconfined` for final-state tests, `Standard` for sequence tests.

**Adding `yield()` everywhere to prevent conflation.** Adding suspension points to production code purely for testability is a code smell. Use `StandardTestDispatcher` in your tests instead of modifying production code.

**Key takeaway:** StateFlow conflation drops intermediate values when new values arrive before the previous ones are collected. Use `StandardTestDispatcher` with Turbine when you need to test state sequences. Use `UnconfinedTestDispatcher` with `.value` when you only care about the final state.

### Lesson 5.3: Testing SharedFlow

SharedFlow differs from StateFlow in important ways that affect testing. StateFlow has an initial value, conflates emissions, and exposes a `.value` property. SharedFlow has no initial value by default, can be configured with replay and buffer, and doesn't conflate unless explicitly configured to do so. Understanding these differences is critical for testing features like one-time events, broadcast messages, and multi-subscriber scenarios.

The most common use of SharedFlow in Android is for one-time events — navigation, snackbar messages, dialogs. A `MutableSharedFlow<Event>(replay = 0)` emits events that are consumed exactly once by the first collector. This is different from StateFlow, where new collectors always receive the latest value. Testing SharedFlow events requires that the collector is active before the event is emitted, or the event is lost.

SharedFlow with `replay > 0` caches recent emissions for new subscribers. `MutableSharedFlow<Event>(replay = 1)` means new collectors immediately receive the most recent event. This is useful for scenarios where late subscribers should catch up on the current state. Testing replay behavior requires verifying that new collectors receive the cached value without an explicit emit.

Buffer configuration affects emission behavior under backpressure. `MutableSharedFlow<Event>(replay = 0, extraBufferCapacity = 1)` allows one emission to be buffered when there are no collectors. Without a buffer, `emit()` suspends when there are no collectors (which can cause deadlocks in tests if not handled carefully). The `tryEmit()` function is a non-suspending alternative that returns `false` if the buffer is full.

Testing SharedFlow in ViewModels follows a specific pattern. You must start collecting the flow BEFORE triggering the action that emits the event. If you call `viewModel.login()` and then start collecting `viewModel.events`, the login event is already gone. Turbine's `test { }` block starts collection immediately, so putting the action inside the block after the first `awaitItem()` or after setup ensures the collector is active.

Multi-subscriber behavior is another area where SharedFlow testing matters. If two screens collect the same SharedFlow, both should receive the event. If the SharedFlow has `replay = 0`, only active subscribers receive the event. If it has `replay = 1`, the second subscriber receives the last event even if it subscribes late. These behaviors should be tested when they matter to your app's correctness.

For event buses or shared communication channels, SharedFlow is often the right tool. A `UserSessionManager` might expose `val sessionEvents: SharedFlow<SessionEvent>` that emits `SessionExpired`, `SessionRefreshed`, etc. Multiple screens observe this flow and react accordingly. Testing these scenarios requires creating multiple collectors and verifying they all receive the events.

Hot vs. cold flow behavior in tests is a critical distinction. Cold flows (created with `flow { }`, `flowOf()`) start producing values when collected and produce fresh values for each collector. Hot flows (StateFlow, SharedFlow) exist independently of collectors and share values across all collectors. Your test setup must match the flow's temperature — cold flows can be tested in isolation, hot flows need their producers to be active.

```kotlin
// Testing SharedFlow events
class EventFlowTest {
    @Test
    fun `SharedFlow with no replay delivers to active collectors only`() = runTest {
        val events = MutableSharedFlow<String>()

        events.test {
            events.emit("first")
            assertEquals("first", awaitItem())

            events.emit("second")
            assertEquals("second", awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `SharedFlow with replay delivers last value to new collectors`() = runTest {
        val events = MutableSharedFlow<String>(replay = 1)

        events.emit("cached") // Emitted before any collector

        events.test {
            assertEquals("cached", awaitItem()) // New collector gets replay
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing ViewModel events with SharedFlow
class SessionViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `expired session emits logout event`() = runTest {
        val fakeSession = FakeSessionManager()
        fakeSession.setSession(Session("token-123", expiresAt = 1000L))
        val fakeClock = FakeClock(currentTimeMillis = 2000L) // Past expiration
        val viewModel = SessionViewModel(fakeSession, fakeClock)

        viewModel.events.test {
            viewModel.checkSession()

            val event = awaitItem()
            assertIs<SessionEvent.SessionExpired>(event)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `valid session does not emit logout event`() = runTest {
        val fakeSession = FakeSessionManager()
        fakeSession.setSession(Session("token-123", expiresAt = 5000L))
        val fakeClock = FakeClock(currentTimeMillis = 1000L)
        val viewModel = SessionViewModel(fakeSession, fakeClock)

        viewModel.events.test {
            viewModel.checkSession()

            expectNoEvents()

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing tryEmit vs emit behavior
class SharedFlowBufferTest {
    @Test
    fun `tryEmit fails when buffer is full and no collectors`() = runTest {
        val flow = MutableSharedFlow<Int>(replay = 0, extraBufferCapacity = 0)

        // No collector active, no buffer — tryEmit returns false
        val result = flow.tryEmit(1)
        assertFalse(result)
    }

    @Test
    fun `tryEmit succeeds with buffer capacity`() = runTest {
        val flow = MutableSharedFlow<Int>(replay = 0, extraBufferCapacity = 1)

        val result = flow.tryEmit(1)
        assertTrue(result)

        // Collect the buffered value
        flow.test {
            // The buffered value is NOT available because replay = 0
            // It was consumed by the buffer but has no replay
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `replay captures emissions for late subscribers`() = runTest {
        val flow = MutableSharedFlow<Int>(replay = 2)

        flow.emit(1)
        flow.emit(2)
        flow.emit(3) // Only last 2 replayed

        flow.test {
            assertEquals(2, awaitItem())
            assertEquals(3, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Real-world: testing event ordering and consumption
class CheckoutEventTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `checkout emits events in correct order`() = runTest {
        val fakeCart = FakeCartRepository()
        fakeCart.addItem(testLineItem(unitPrice = 49.99))
        val fakePayment = FakePaymentRepository()
        val viewModel = CheckoutViewModel(fakeCart, fakePayment)

        viewModel.events.test {
            viewModel.completePurchase()

            // Events should arrive in order
            val progress = awaitItem()
            assertIs<CheckoutEvent.ShowProgress>(progress)

            val confirmation = awaitItem()
            assertIs<CheckoutEvent.ShowConfirmation>(confirmation)
            assertEquals("txn-1", confirmation.transactionId)

            val navigation = awaitItem()
            assertIs<CheckoutEvent.NavigateToReceipt>(navigation)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Starting collection after the emission.** SharedFlow with `replay = 0` drops events that have no active collector. If you emit the event before `test { }` starts collecting, the event is lost and `awaitItem()` times out. Always start collecting before triggering the action.

**Confusing SharedFlow replay with StateFlow behavior.** StateFlow always has a value and always replays it. SharedFlow with `replay = 0` has no initial value and doesn't replay. They're different tools for different purposes.

**Using `emit()` in production code without considering backpressure.** `emit()` suspends when the buffer is full. In ViewModel coroutines, this can cause subtle deadlocks. Use `tryEmit()` for fire-and-forget events, or configure adequate buffer capacity.

**Key takeaway:** SharedFlow is for events that should be consumed once, unlike StateFlow which always replays the latest value. Start collecting before emitting in tests. Configure replay and buffer based on your event consumption requirements.

### Lesson 5.4: Testing Flow Transformations

Flow transformations — `map`, `filter`, `combine`, `flatMapLatest`, `debounce`, `distinctUntilChanged` — are the building blocks of reactive data processing. Each operator has specific behavior that affects test design. Testing transformations ensures your data pipeline produces the correct output for every input scenario.

`map` is the simplest transformation — it applies a function to each emission. Testing a mapped flow verifies that the mapping function is applied correctly. If your flow maps `UserEntity` to `User`, test that each field is mapped correctly, that null values are handled, and that edge cases (empty strings, zero values) produce the expected output.

`filter` removes emissions that don't match a predicate. When testing filtered flows, verify both what passes and what's filtered out. A flow that filters inactive users should emit active users and NOT emit inactive ones. Use `expectNoEvents()` after emitting a value that should be filtered to verify it was dropped.

`combine` merges multiple flows into a single output whenever any source emits. When testing combined flows, verify that the combination logic is correct for all permutations of source values. Also test that the combined flow updates when each individual source updates — not just when all sources update simultaneously.

`flatMapLatest` cancels the previous inner flow when a new value arrives from the outer flow. This is commonly used for search — when the user types a new query, the previous search is cancelled. Testing `flatMapLatest` requires verifying that old results don't appear after a new query is issued.

`debounce` delays emissions by a specified duration, dropping intermediate values. Testing debounced flows requires virtual time control via `runTest` and `advanceTimeBy()`. Emit values in rapid succession, advance time past the debounce window, and verify that only the last value is received.

`distinctUntilChanged` drops consecutive duplicate emissions. Testing this operator requires emitting the same value twice and verifying that the second emission is dropped. Also test that non-consecutive duplicates ARE emitted — `1, 2, 1` should emit all three values because they're not consecutive duplicates.

Chained transformations require testing the complete pipeline, not just individual operators. A flow that maps, filters, and then distinctUntilChanged has composite behavior that might not be obvious from testing each operator in isolation. Write tests that push data through the entire chain and verify the final output.

Error propagation through transformations is another testing concern. When a mapping function throws an exception, the flow terminates with that error. When a `catch` operator handles the error and emits a fallback value, the flow continues. Test both scenarios to verify your error handling strategy works across the entire transformation chain.

```kotlin
// Testing map transformations
class FlowMapTest {
    @Test
    fun `maps entity to domain model`() = runTest {
        val entityFlow = flowOf(
            UserEntity("1", "Mukul", "mukul@test.com", "premium"),
            UserEntity("2", "Ravi", null, "free")
        )

        entityFlow.map { it.toDomain() }.test {
            val first = awaitItem()
            assertEquals("Mukul", first.name)
            assertEquals("mukul@test.com", first.email)
            assertTrue(first.isPremium)

            val second = awaitItem()
            assertEquals("Ravi", second.name)
            assertEquals("", second.email) // null mapped to empty string
            assertFalse(second.isPremium)

            awaitComplete()
        }
    }
}
```

```kotlin
// Testing filter behavior
class FlowFilterTest {
    @Test
    fun `filters inactive users`() = runTest {
        val usersFlow = flowOf(
            User("1", "Active", isActive = true),
            User("2", "Inactive", isActive = false),
            User("3", "Also Active", isActive = true)
        )

        usersFlow.filter { it.isActive }.test {
            assertEquals("Active", awaitItem().name)
            assertEquals("Also Active", awaitItem().name)
            awaitComplete()
            // "Inactive" user was filtered out
        }
    }
}
```

```kotlin
// Testing combine with multiple source flows
class FlowCombineTest {
    @Test
    fun `combines user and settings into profile state`() = runTest {
        val userFlow = MutableStateFlow<User?>(null)
        val settingsFlow = MutableStateFlow(UserSettings(darkMode = false))

        val combined = combine(userFlow, settingsFlow) { user, settings ->
            if (user != null) {
                ProfileState.Loaded(user, settings)
            } else {
                ProfileState.Loading
            }
        }

        combined.test {
            // Initial: user is null
            assertEquals(ProfileState.Loading, awaitItem())

            // User arrives
            userFlow.value = testUser(name = "Mukul")
            val loaded = awaitItem()
            assertIs<ProfileState.Loaded>(loaded)
            assertEquals("Mukul", loaded.user.name)
            assertFalse(loaded.settings.darkMode)

            // Settings update — combined flow re-emits
            settingsFlow.value = UserSettings(darkMode = true)
            val updated = awaitItem()
            assertIs<ProfileState.Loaded>(updated)
            assertTrue(updated.settings.darkMode)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing flatMapLatest — cancels previous inner flow
class FlowFlatMapLatestTest {
    @Test
    fun `flatMapLatest cancels previous search on new query`() = runTest {
        val queryFlow = MutableStateFlow("")
        val fakeSearchRepo = FakeSearchRepository()

        fakeSearchRepo.setResults("kotlin", listOf(
            SearchResult("1", "Kotlin Basics")
        ))
        fakeSearchRepo.setResults("compose", listOf(
            SearchResult("2", "Compose Guide"),
            SearchResult("3", "Compose Testing")
        ))

        val resultsFlow = queryFlow
            .filter { it.isNotBlank() }
            .flatMapLatest { query ->
                flow {
                    val results = fakeSearchRepo.search(query)
                    emit(results)
                }
            }

        resultsFlow.test {
            queryFlow.value = "kotlin"
            assertEquals(1, awaitItem().size)

            queryFlow.value = "compose"
            val composeResults = awaitItem()
            assertEquals(2, composeResults.size)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing debounce with virtual time
class FlowDebounceTest {
    @Test
    fun `debounce drops rapid emissions`() = runTest {
        val inputFlow = MutableSharedFlow<String>()

        val debouncedFlow = inputFlow.debounce(300)

        debouncedFlow.test {
            // Rapid emissions within debounce window
            inputFlow.emit("k")
            inputFlow.emit("ko")
            inputFlow.emit("kot")

            advanceTimeBy(100) // Only 100ms — still within debounce window
            expectNoEvents() // Nothing emitted yet

            advanceTimeBy(250) // Now 350ms total — past debounce window
            assertEquals("kot", awaitItem()) // Only last value emitted

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `debounce emits each value when spaced apart`() = runTest {
        val inputFlow = MutableSharedFlow<String>()

        val debouncedFlow = inputFlow.debounce(300)

        debouncedFlow.test {
            inputFlow.emit("first")
            advanceTimeBy(400) // Past debounce window
            assertEquals("first", awaitItem())

            inputFlow.emit("second")
            advanceTimeBy(400)
            assertEquals("second", awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Testing Flow operators in isolation instead of the complete pipeline.** Individual operator tests are useful for learning, but production code chains multiple operators. Test the complete chain to catch interaction bugs between operators.

**Not testing debounce with virtual time.** Using `Thread.sleep(500)` to test debounce makes tests slow and flaky. Use `runTest` with `advanceTimeBy()` for instant, deterministic debounce testing.

**Forgetting that `combine` requires all sources to emit before producing the first combined value.** If one source flow hasn't emitted yet, `combine` waits. This can cause `awaitItem()` to timeout in tests if you forget to set up all source flows.

**Key takeaway:** Test Flow transformations by pushing data through the complete pipeline and asserting on the output. Use virtual time for time-based operators. Verify both what passes through and what gets filtered out.

### Lesson 5.5: Advanced Flow Testing Patterns

Beyond basic emission testing, real-world Flow testing involves timeout handling, retry logic, flow completion, cancellation, and backpressure. These advanced patterns test the resilience of your data pipeline under adverse conditions — exactly the scenarios that cause production crashes.

Testing retry logic requires simulating a failure followed by a success. Your flow should emit an error, wait, retry the operation, and emit the result on success. The test should verify that the retry happens after the correct delay, that the retry count is limited, and that the flow eventually fails permanently if all retries are exhausted.

Testing flow cancellation verifies that resources are cleaned up when a collector stops collecting. If your flow opens a database cursor or a network connection, cancellation should close those resources. Use `cancel()` inside Turbine's `test { }` block and then verify that cleanup happened.

Testing hot flow lifecycle ensures that shared flows start and stop producing values appropriately. A SharedFlow backed by a network websocket should connect when the first collector subscribes and disconnect when the last collector unsubscribes. Testing this requires starting and stopping collectors and verifying the connection lifecycle.

Backpressure testing verifies that your flow handles slow collectors gracefully. If a producer emits values faster than the collector can process them, what happens? With `buffer()`, values are queued. With `conflate()`, intermediate values are dropped. With `collectLatest`, the collector cancels its current work and processes the latest value. Each strategy has different test requirements.

Testing flow with `stateIn` and `shareIn` requires understanding their lifecycle. `stateIn(scope, SharingStarted.WhileSubscribed(), initialValue)` creates a hot flow that starts when the first subscriber appears and stops when the last subscriber disappears (with an optional stop delay). Testing this behavior requires controlling the subscriber lifecycle and verifying that the upstream flow starts and stops correctly.

Exception handling in flows has nuanced behavior that needs testing. An uncaught exception in a flow terminates the flow. A `catch` operator handles the exception and can emit a fallback value. A `retry` operator catches the exception and restarts the flow. Each of these behaviors should be tested independently to verify your error handling strategy.

Testing flows that depend on external triggers — like network connectivity changes, GPS updates, or sensor data — requires fakes that can simulate these triggers. A `FakeConnectivityMonitor` that exposes a `MutableSharedFlow<ConnectionStatus>` lets you push connectivity changes into the flow at exactly the right moment in your test.

Flow sharing and replay interact in subtle ways. A `SharedFlow(replay = 1)` cached the last emission. A new subscriber receives the cached value immediately. But if the cached value is stale, the subscriber sees outdated data until a fresh emission arrives. Testing this requires subscribing after an emission and verifying the stale value, then emitting a fresh value and verifying the update.

```kotlin
// Testing retry logic
class FlowRetryTest {
    @Test
    fun `retries on failure and succeeds`() = runTest {
        var attempt = 0
        val flow = flow {
            attempt++
            if (attempt < 3) throw IOException("Attempt $attempt failed")
            emit("Success on attempt $attempt")
        }.retry(3) { it is IOException }

        flow.test {
            assertEquals("Success on attempt 3", awaitItem())
            awaitComplete()
        }
    }

    @Test
    fun `exhausts retries and propagates error`() = runTest {
        val flow = flow<String> {
            throw IOException("Always fails")
        }.retry(2) { it is IOException }

        flow.test {
            val error = awaitError()
            assertIs<IOException>(error)
        }
    }

    @Test
    fun `retryWhen with exponential backoff`() = runTest {
        var attempt = 0
        val flow = flow {
            attempt++
            if (attempt <= 2) throw IOException("Fail")
            emit("Success")
        }.retryWhen { cause, retryCount ->
            if (cause is IOException && retryCount < 3) {
                delay(100 * (retryCount + 1)) // 100ms, 200ms, 300ms
                true
            } else {
                false
            }
        }

        flow.test {
            advanceTimeBy(400) // Past all retry delays
            assertEquals("Success", awaitItem())
            awaitComplete()
        }
    }
}
```

```kotlin
// Testing flow cancellation and cleanup
class FlowCancellationTest {
    @Test
    fun `flow cleans up resources on cancellation`() = runTest {
        var resourceClosed = false
        val flow = flow {
            try {
                emit("value1")
                delay(Long.MAX_VALUE) // Simulate long-running operation
            } finally {
                resourceClosed = true // Cleanup on cancellation
            }
        }

        flow.test {
            assertEquals("value1", awaitItem())
            cancel() // Cancel the collection
        }

        assertTrue(resourceClosed)
    }
}
```

```kotlin
// Testing stateIn sharing behavior
class SharedFlowLifecycleTest {
    @Test
    fun `WhileSubscribed starts upstream on first subscriber`() = runTest {
        var upstreamStarted = false
        val upstream = flow {
            upstreamStarted = true
            emit("value")
            delay(Long.MAX_VALUE) // Keep alive
        }

        val shared = upstream.stateIn(
            scope = backgroundScope,
            started = SharingStarted.WhileSubscribed(),
            initialValue = "initial"
        )

        assertFalse(upstreamStarted)

        shared.test {
            assertEquals("initial", awaitItem())
            advanceUntilIdle()
            assertTrue(upstreamStarted)
            assertEquals("value", awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing connectivity-dependent flows
class ConnectivityAwareFlowTest {
    @Test
    fun `switches to cache when connectivity is lost`() = runTest {
        val fakeConnectivity = FakeConnectivityMonitor()
        val fakeApi = FakeNewsApi()
        val fakeCache = FakeNewsCache()

        fakeApi.setArticles(listOf(Article("1", "Online Article")))
        fakeCache.setArticles(listOf(Article("2", "Cached Article")))

        val repo = NewsRepository(fakeApi, fakeCache, fakeConnectivity)

        repo.observeArticles().test {
            // Initially online
            fakeConnectivity.emit(ConnectionStatus.Connected)
            val online = awaitItem()
            assertEquals("Online Article", online[0].title)

            // Go offline
            fakeConnectivity.emit(ConnectionStatus.Disconnected)
            val offline = awaitItem()
            assertEquals("Cached Article", offline[0].title)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing error recovery with catch and fallback
class FlowErrorRecoveryTest {
    @Test
    fun `catch emits fallback value on error`() = runTest {
        val flow = flow {
            emit("real data")
            throw IOException("Network failed")
        }.catch {
            emit("fallback data")
        }

        flow.test {
            assertEquals("real data", awaitItem())
            assertEquals("fallback data", awaitItem())
            awaitComplete()
        }
    }

    @Test
    fun `onEach with catch logs error and continues`() = runTest {
        val errors = mutableListOf<Throwable>()

        val flow = flow {
            emit(1)
            emit(2)
            throw ArithmeticException("Division by zero")
        }.catch { e ->
            errors.add(e)
            emit(-1) // Sentinel value
        }

        flow.test {
            assertEquals(1, awaitItem())
            assertEquals(2, awaitItem())
            assertEquals(-1, awaitItem())
            awaitComplete()
        }

        assertEquals(1, errors.size)
        assertIs<ArithmeticException>(errors[0])
    }
}
```

#### Common Mistakes

**Not testing retry exhaustion.** It's easy to test that retry works when it eventually succeeds. But what happens when all retries are exhausted? The flow should propagate the final error. Test both paths.

**Testing cancellation without verifying cleanup.** Cancelling a flow is only half the test. Verify that resources (database cursors, network connections, file handles) are actually released in the `finally` block.

**Ignoring the initial value of `stateIn`.** When using `stateIn(scope, started, initialValue)`, the initial value is emitted immediately. Tests that skip it with `skipItems(1)` might miss bugs where the initial value is wrong.

**Key takeaway:** Advanced Flow testing covers retry logic, cancellation cleanup, sharing lifecycle, and error recovery. Test that retries work AND that they eventually fail. Test that cancellation releases resources. Use virtual time for delay-based operators.

### Quiz: Testing Kotlin Flows

#### What does Turbine's `awaitItem()` do?

- ❌ It creates a new Flow emission
- ❌ It waits for 1 second and returns null
- ✅ It suspends until the next Flow emission arrives and returns it, with a configurable timeout
- ❌ It collects all emissions into a list

> **Explanation:** `awaitItem()` suspends the test coroutine until the Flow emits a value, then returns that value. If no emission arrives within the timeout (default 3 seconds), the test fails with a clear error message.

#### What causes StateFlow conflation in tests?

- ❌ Using Turbine instead of manual collection
- ✅ Setting a new value before the previous one is collected, causing the previous value to be silently dropped
- ❌ Using runTest instead of runBlocking
- ❌ Having multiple collectors on the same StateFlow

> **Explanation:** StateFlow only keeps the latest value. If `_state.value = Loading` is immediately followed by `_state.value = Loaded(data)`, the `Loading` value may never be observed by collectors. This is called conflation.

#### How do you test a debounced Flow?

- ❌ Use Thread.sleep() to wait for the debounce period
- ❌ Set the debounce duration to 0 in tests
- ✅ Use `runTest` with `advanceTimeBy()` to simulate time passage without real delays
- ❌ Debounced flows cannot be tested

> **Explanation:** `runTest` provides a virtual time environment where `delay()` and `debounce()` complete instantly when you call `advanceTimeBy()`. This makes debounce tests instant and deterministic, unlike `Thread.sleep()` which is slow and flaky.

### Coding Challenge: Test a Flow Pipeline

Create a `WeatherRepository` that exposes `observeWeather(): Flow<WeatherState>` which combines temperature data with a location flow, applies unit conversion, and emits updates. Write comprehensive tests for the pipeline including error handling and flow completion.

#### Solution

```kotlin
class WeatherRepository(
    private val temperatureSensor: TemperatureSensor,
    private val locationProvider: LocationProvider,
    private val unitPreference: UnitPreference
) {
    fun observeWeather(): Flow<WeatherState> {
        return combine(
            temperatureSensor.observeTemperature(),
            locationProvider.observeLocation(),
            unitPreference.observeUnit()
        ) { tempCelsius, location, unit ->
            val displayTemp = when (unit) {
                TemperatureUnit.CELSIUS -> tempCelsius
                TemperatureUnit.FAHRENHEIT -> tempCelsius * 9.0 / 5.0 + 32
            }
            WeatherState(displayTemp, unit, location)
        }.catch { e ->
            emit(WeatherState.error(e.message ?: "Unknown error"))
        }.distinctUntilChanged()
    }
}

class WeatherRepositoryTest {
    private val fakeTempSensor = FakeTemperatureSensor()
    private val fakeLocation = FakeLocationProvider()
    private val fakeUnit = FakeUnitPreference()
    private val repo = WeatherRepository(fakeTempSensor, fakeLocation, fakeUnit)

    @Test
    fun `combines temperature and location`() = runTest {
        repo.observeWeather().test {
            fakeTempSensor.emit(25.0)
            fakeLocation.emit(Location("New York"))
            fakeUnit.emit(TemperatureUnit.CELSIUS)

            val state = awaitItem()
            assertEquals(25.0, state.temperature, 0.01)
            assertEquals("New York", state.location.name)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `converts to Fahrenheit when preference changes`() = runTest {
        repo.observeWeather().test {
            fakeTempSensor.emit(0.0)
            fakeLocation.emit(Location("Denver"))
            fakeUnit.emit(TemperatureUnit.CELSIUS)

            val celsius = awaitItem()
            assertEquals(0.0, celsius.temperature, 0.01)

            fakeUnit.emit(TemperatureUnit.FAHRENHEIT)
            val fahrenheit = awaitItem()
            assertEquals(32.0, fahrenheit.temperature, 0.01)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `emits error state on sensor failure`() = runTest {
        repo.observeWeather().test {
            fakeTempSensor.emitError(IOException("Sensor disconnected"))

            val state = awaitItem()
            assertTrue(state.isError)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

---


## Module 6: Testing Coroutines

Coroutines are the async runtime that powers modern Android apps. Testing coroutine-based code requires understanding dispatchers, structured concurrency, exception handling, and cancellation. This module covers the coroutine test infrastructure — `runTest`, test dispatchers, `advanceUntilIdle`, and `advanceTimeBy` — and how to test suspend functions, concurrent operations, and error propagation in coroutine contexts.

### Lesson 6.1: runTest and Test Dispatchers

`runTest` is the foundation of all coroutine testing. It creates a `TestScope` with a `TestCoroutineScheduler` that provides virtual time control. Inside `runTest`, `delay(1000)` doesn't actually wait 1 second — it advances virtual time instantly. This means tests that involve delays, timeouts, and periodic operations run in milliseconds instead of seconds.

The `TestScope` created by `runTest` provides several important guarantees. First, it advances virtual time automatically for simple cases — any pending `delay` calls are fast-forwarded when there's no other work to do. Second, it fails the test if any coroutine in the scope throws an unhandled exception. Third, it detects leaked coroutines — if a coroutine is still running when `runTest` completes, the test fails with a "leaked coroutine" error.

`StandardTestDispatcher` is the default dispatcher used by `runTest`. It queues coroutine work and only executes it when explicitly advanced with `advanceUntilIdle()`, `advanceTimeBy()`, or `runCurrent()`. This gives you precise control over execution order: you can launch a coroutine, verify that it's pending, advance one step, verify the intermediate state, advance to completion, and verify the final state.

`UnconfinedTestDispatcher` executes coroutines eagerly — as soon as they're launched. This is convenient for tests where you don't care about execution order and just want the result. However, it can mask timing bugs and makes it impossible to test intermediate states. Use it for simple tests; switch to `StandardTestDispatcher` for anything that involves state transitions, loading indicators, or timing-sensitive behavior.

The relationship between `runTest` and `MainDispatcherRule` is important to understand. `runTest` provides a `TestScope` for your test function. `MainDispatcherRule` replaces `Dispatchers.Main` for the entire test class. When a ViewModel launches a coroutine on `Dispatchers.Main` (via `viewModelScope`), the `MainDispatcherRule` ensures it uses the test dispatcher. When your test function calls a suspend function directly, `runTest` provides the test scope.

`advanceUntilIdle()` runs all pending coroutines to completion. It's the most commonly used advancement function because it answers the simple question "run everything and let me see the final state." `advanceTimeBy(ms)` advances virtual time by the specified duration, executing only the work scheduled to run within that time window. `runCurrent()` executes only the work scheduled at the current virtual time, without advancing.

Virtual time is powerful for testing timeouts, periodic tasks, and retry delays. A retry function that waits 1 second between attempts would take 3 seconds to test with 3 retries in real time. With virtual time, `advanceTimeBy(3000)` runs the 3 retries instantly. A periodic polling function that runs every 5 minutes would take an hour to test 12 iterations in real time. With virtual time, `advanceTimeBy(60 * 60 * 1000)` tests them all instantly.

Understanding the `backgroundScope` in `runTest` is important for testing shared flows and long-lived coroutines. The main `TestScope` in `runTest` expects all coroutines to complete by the end of the test. But some coroutines (like `stateIn` or `shareIn` collectors) are designed to run indefinitely. Launch these in `backgroundScope`, which is automatically cancelled when `runTest` ends without failing the test.

```kotlin
// Basic runTest usage
class CoroutineBasicsTest {
    @Test
    fun `runTest executes suspend functions`() = runTest {
        val result = fetchData() // suspend function
        assertEquals("data", result)
    }

    @Test
    fun `delay is instant in runTest`() = runTest {
        val start = currentTime
        delay(10_000) // 10 seconds
        val elapsed = currentTime - start

        assertEquals(10_000, elapsed) // Virtual time advanced
        // But the test took ~0ms of real time
    }

    @Test
    fun `advanceTimeBy controls virtual time`() = runTest {
        var result = ""
        launch {
            delay(500)
            result = "after 500ms"
        }

        advanceTimeBy(400)
        assertEquals("", result) // Not yet

        advanceTimeBy(200)
        assertEquals("after 500ms", result) // Now
    }
}
```

```kotlin
// Testing with StandardTestDispatcher — explicit advancement
class StandardDispatcherTest {
    @Test
    fun `coroutines are queued until advanced`() = runTest {
        var executed = false
        launch {
            executed = true
        }

        assertFalse(executed) // Not yet — queued
        advanceUntilIdle()
        assertTrue(executed) // Now executed
    }

    @Test
    fun `multiple coroutines execute in order`() = runTest {
        val results = mutableListOf<String>()

        launch { results.add("first") }
        launch { results.add("second") }
        launch { results.add("third") }

        advanceUntilIdle()
        assertEquals(listOf("first", "second", "third"), results)
    }
}
```

```kotlin
// Testing with UnconfinedTestDispatcher — eager execution
class UnconfinedDispatcherTest {
    @Test
    fun `coroutines execute immediately`() = runTest(UnconfinedTestDispatcher()) {
        var executed = false
        launch {
            executed = true
        }
        assertTrue(executed) // Already executed — no advanceUntilIdle needed
    }
}
```

```kotlin
// Testing periodic operations with virtual time
class PeriodicTaskTest {
    @Test
    fun `polls every 5 seconds`() = runTest {
        val results = mutableListOf<Int>()
        var counter = 0

        val job = launch {
            while (isActive) {
                counter++
                results.add(counter)
                delay(5000) // 5 seconds
            }
        }

        advanceTimeBy(5001)
        assertEquals(2, results.size) // Initial + after 5s

        advanceTimeBy(5000)
        assertEquals(3, results.size) // After 10s

        advanceTimeBy(15000)
        assertEquals(6, results.size) // After 25s

        job.cancel()
    }
}
```

```kotlin
// backgroundScope for long-lived coroutines
class BackgroundScopeTest {
    @Test
    fun `stateIn requires backgroundScope`() = runTest {
        val upstream = flow {
            emit(1)
            delay(Long.MAX_VALUE)
        }

        val shared = upstream.stateIn(
            scope = backgroundScope, // Won't fail test when not completed
            started = SharingStarted.Eagerly,
            initialValue = 0
        )

        advanceUntilIdle()
        assertEquals(1, shared.value)
        // Test ends — backgroundScope is cancelled automatically
    }
}
```

#### Common Mistakes

**Using `runBlocking` instead of `runTest`.** `runBlocking` doesn't provide virtual time, so `delay(5000)` actually waits 5 seconds. `runTest` makes all delays instant via virtual time. Always use `runTest` for coroutine tests.

**Forgetting `advanceUntilIdle()` with `StandardTestDispatcher`.** If you launch a coroutine and immediately check the result without advancing, the coroutine hasn't run yet. Either call `advanceUntilIdle()` or use `UnconfinedTestDispatcher`.

**Leaked coroutines in `runTest`.** If a coroutine launched in the test scope is still running when `runTest` ends, the test fails. Cancel long-lived coroutines explicitly or use `backgroundScope` for flows that run indefinitely.

**Key takeaway:** Use `runTest` for all coroutine tests — it provides virtual time and leak detection. Use `advanceUntilIdle()` to run pending coroutines. Use `advanceTimeBy()` for time-dependent behavior. Use `backgroundScope` for long-lived coroutines.

### Lesson 6.2: Testing Suspend Functions

Suspend functions are the most common coroutine pattern in Android code. Repositories, use cases, and data sources expose suspend functions that perform async operations. Testing them is straightforward — call the function inside `runTest` and assert on the result — but edge cases around error handling, cancellation, and timeout require careful attention.

The basic pattern is simple: inside `runTest`, call the suspend function and use standard assertions on the result. `assertEquals(expected, repository.getUser("1"))` works exactly as you'd expect. The suspend function might internally use `withContext(Dispatchers.IO)`, `delay()`, or other coroutine primitives, but `runTest` handles all of them transparently.

Testing error propagation from suspend functions requires `assertThrows` or `assertFailsWith`. When a suspend function throws an exception (e.g., `IOException` from a network call), the test should verify that the correct exception type is thrown and that the exception contains useful information (message, cause, error code).

Cancellation testing verifies that your suspend function responds to cancellation correctly. When the calling coroutine is cancelled (e.g., because the user navigated away), the suspend function should stop its work and clean up any acquired resources. You can test this by launching the suspend function in a job, cancelling the job, and verifying that cleanup occurred.

Testing suspend functions that use `withContext` to switch dispatchers requires understanding how `runTest` handles dispatcher switching. By default, `runTest` uses `StandardTestDispatcher`, and any `withContext(Dispatchers.IO)` call in the tested code will execute on the IO dispatcher (real threading). To keep everything on the test dispatcher, inject the dispatcher via constructor and provide the test dispatcher in tests.

Timeout testing verifies that your suspend function fails gracefully when an operation takes too long. `withTimeout(5000) { ... }` throws `TimeoutCancellationException` if the operation doesn't complete within 5 seconds. In tests, use `advanceTimeBy(5001)` to simulate the timeout and verify the exception is handled correctly.

Suspend functions that perform multiple sequential operations need tests for each failure point. A function that calls `api.fetch()` then `dao.save()` should be tested for: successful fetch + save, failed fetch (no save attempt), successful fetch + failed save (data integrity), and both failing simultaneously.

For suspend functions that return nullable results, test both the non-null and null cases. A function that returns `User?` should be tested with valid input (returns user), invalid input (returns null or throws), and edge case input (empty string, very long string, special characters).

```kotlin
// Basic suspend function testing
class UserRepositoryTest {
    private val fakeApi = FakeUserApi()
    private val fakeDao = FakeUserDao()
    private val repo = UserRepository(fakeApi, fakeDao)

    @Test
    fun `getUser returns user from API`() = runTest {
        fakeApi.setUser(UserDto("1", "Mukul", "mukul@test.com"))

        val user = repo.getUser("1")

        assertEquals("Mukul", user.name)
        assertEquals("mukul@test.com", user.email)
    }

    @Test
    fun `getUser caches result in DAO`() = runTest {
        fakeApi.setUser(UserDto("1", "Mukul", "mukul@test.com"))

        repo.getUser("1")

        val cached = fakeDao.getById("1")
        assertNotNull(cached)
        assertEquals("Mukul", cached.name)
    }

    @Test
    fun `getUser throws on API error`() = runTest {
        fakeApi.shouldFail = true

        assertThrows<IOException> {
            repo.getUser("1")
        }
    }

    @Test
    fun `getUser falls back to cache on API error`() = runTest {
        fakeDao.insert(UserEntity("1", "Cached Mukul", "mukul@test.com"))
        fakeApi.shouldFail = true

        val user = repo.getUser("1")

        assertEquals("Cached Mukul", user.name)
    }
}
```

```kotlin
// Testing cancellation behavior
class CancellationTest {
    @Test
    fun `long operation is cancellable`() = runTest {
        val repo = FakeSlowRepository(delayMs = 5000)
        var result: String? = null

        val job = launch {
            result = repo.fetchData()
        }

        advanceTimeBy(1000) // Only 1 second elapsed
        job.cancel()
        advanceUntilIdle()

        assertNull(result) // Operation was cancelled before completing
    }

    @Test
    fun `cleanup runs on cancellation`() = runTest {
        var cleanedUp = false
        val job = launch {
            try {
                delay(Long.MAX_VALUE)
            } finally {
                cleanedUp = true
            }
        }

        job.cancel()
        advanceUntilIdle()
        assertTrue(cleanedUp)
    }
}
```

```kotlin
// Testing timeout behavior
class TimeoutTest {
    @Test
    fun `operation fails after timeout`() = runTest {
        val slowRepo = FakeSlowRepository(delayMs = 10_000)

        assertThrows<TimeoutCancellationException> {
            withTimeout(5000) {
                slowRepo.fetchData()
            }
        }
    }

    @Test
    fun `operation succeeds within timeout`() = runTest {
        val fastRepo = FakeSlowRepository(delayMs = 1000)

        val result = withTimeout(5000) {
            fastRepo.fetchData()
        }

        assertEquals("data", result)
    }
}
```

```kotlin
// Testing suspend functions with injected dispatchers
class DispatcherInjectionTest {
    @Test
    fun `uses injected dispatcher for background work`() = runTest {
        val testDispatcher = StandardTestDispatcher(testScheduler)
        val repo = FileRepository(
            ioDispatcher = testDispatcher // Inject test dispatcher
        )

        val content = repo.readFile("test.txt")
        assertEquals("file content", content)
    }
}

// Production code with injectable dispatcher
class FileRepository(
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun readFile(path: String): String {
        return withContext(ioDispatcher) {
            // File reading logic
            "file content"
        }
    }
}
```

```kotlin
// Testing sequential suspend operations with multiple failure points
class OrderProcessingTest {
    @Test
    fun `successful order creates payment and updates inventory`() = runTest {
        val fakePayment = FakePaymentService()
        val fakeInventory = FakeInventoryService()
        val processor = OrderProcessor(fakePayment, fakeInventory)

        val result = processor.processOrder(testOrder())

        assertIs<OrderResult.Success>(result)
        assertEquals(1, fakePayment.processedPayments.size)
        assertTrue(fakeInventory.reservedItems.isNotEmpty())
    }

    @Test
    fun `payment failure does not update inventory`() = runTest {
        val fakePayment = FakePaymentService().apply { shouldFail = true }
        val fakeInventory = FakeInventoryService()
        val processor = OrderProcessor(fakePayment, fakeInventory)

        val result = processor.processOrder(testOrder())

        assertIs<OrderResult.PaymentFailed>(result)
        assertTrue(fakeInventory.reservedItems.isEmpty())
    }

    @Test
    fun `inventory failure after payment triggers refund`() = runTest {
        val fakePayment = FakePaymentService()
        val fakeInventory = FakeInventoryService().apply { shouldFail = true }
        val processor = OrderProcessor(fakePayment, fakeInventory)

        val result = processor.processOrder(testOrder())

        assertIs<OrderResult.InventoryFailed>(result)
        assertEquals(1, fakePayment.refundedPayments.size)
    }
}
```

#### Common Mistakes

**Not injecting dispatchers.** If your production code uses `withContext(Dispatchers.IO)`, the work runs on the real IO thread pool, not on the test dispatcher. Inject the dispatcher so tests can control execution.

**Using `assertThrows` outside of `runTest` for suspend functions.** `assertThrows { suspendFunction() }` won't compile because `assertThrows` doesn't expect a suspend lambda. Use `assertThrows<Exception> { }` inside `runTest` or use `assertFailsWith<Exception> { }` from `kotlin.test`.

**Not testing the cancellation path.** Suspend functions should be cancellable — they should check `isActive` or use cancellable operations like `delay()` and `yield()`. If your function isn't cancellable, it can leak resources or block the coroutine scope indefinitely.

**Key takeaway:** Test suspend functions inside `runTest`. Test success, error, cancellation, and timeout paths. Inject dispatchers so tests control execution. Verify cleanup in `finally` blocks on cancellation.

### Lesson 6.3: Testing Concurrent Operations

Many real-world operations involve concurrent coroutines — parallel API calls, simultaneous database writes, race conditions between user actions and background updates. Testing concurrent code requires understanding structured concurrency, `async/await`, `supervisorScope`, and how test dispatchers handle concurrent work.

`async/await` is the primary pattern for parallel work in coroutines. When your code launches two async operations and awaits both results, you need to test that both operations complete, that their results are correctly combined, and that failure in one doesn't prevent the other from completing (if using `supervisorScope`).

Testing parallel operations requires verifying execution order — or rather, verifying that execution order doesn't matter. If your code fetches user data and notifications in parallel with `async`, the test should work regardless of which completes first. The test should assert on the combined result, not on the order of completion.

`supervisorScope` changes failure semantics. In a regular `coroutineScope`, if one child coroutine fails, all siblings are cancelled. In `supervisorScope`, siblings continue even when one fails. Testing this distinction is important for operations where partial failure is acceptable (e.g., load user data even if notifications fail).

Race conditions in production code are hard to reproduce but easy to test with coroutine test infrastructure. When two coroutines modify shared state, the result depends on execution order. With `StandardTestDispatcher`, you control the order: advance one coroutine, check the state, advance the other, check again. This deterministic control makes race condition tests reliable.

Testing mutex and semaphore patterns verifies that your concurrent code properly serializes access to shared resources. A repository that uses `Mutex` to prevent concurrent database writes should be tested with two simultaneous write attempts. The test should verify that writes are serialized (one completes before the other starts) rather than interleaved.

Parallel flow collection is another concurrent pattern that needs testing. When multiple flows are collected simultaneously in the same coroutine scope, each collection runs independently. Testing this requires pushing values into multiple fake flows and verifying that the combined output updates correctly regardless of which flow emits first.

```kotlin
// Testing parallel async operations
class ParallelOperationTest {
    @Test
    fun `loads user and settings in parallel`() = runTest {
        val fakeUserRepo = FakeUserRepository()
        val fakeSettingsRepo = FakeSettingsRepository()
        fakeUserRepo.addUser(testUser(id = "1", name = "Mukul"))
        fakeSettingsRepo.setSettings(Settings(darkMode = true, language = "en"))

        val service = ProfileService(fakeUserRepo, fakeSettingsRepo)
        val profile = service.loadFullProfile("1")

        assertEquals("Mukul", profile.user.name)
        assertTrue(profile.settings.darkMode)
    }

    @Test
    fun `partial failure with supervisorScope returns available data`() = runTest {
        val fakeUserRepo = FakeUserRepository()
        val fakeNotifRepo = FakeNotificationRepository()
        fakeUserRepo.addUser(testUser(id = "1", name = "Mukul"))
        fakeNotifRepo.shouldFail = true // Notifications will fail

        val service = DashboardService(fakeUserRepo, fakeNotifRepo)
        val dashboard = service.loadDashboard("1")

        // User data loaded despite notification failure
        assertEquals("Mukul", dashboard.userName)
        assertTrue(dashboard.notifications.isEmpty()) // Graceful degradation
        assertTrue(dashboard.hasNotificationError)
    }
}

// Production code
class DashboardService(
    private val userRepo: UserRepository,
    private val notifRepo: NotificationRepository
) {
    suspend fun loadDashboard(userId: String): Dashboard {
        return supervisorScope {
            val userDeferred = async { userRepo.getUser(userId) }
            val notifsDeferred = async {
                try {
                    notifRepo.getNotifications(userId)
                } catch (e: Exception) {
                    emptyList()
                }
            }

            val user = userDeferred.await()
            val notifs = notifsDeferred.await()

            Dashboard(
                userName = user.name,
                notifications = notifs,
                hasNotificationError = notifs.isEmpty()
            )
        }
    }
}
```

```kotlin
// Testing race condition protection with Mutex
class MutexProtectionTest {
    @Test
    fun `concurrent writes are serialized with mutex`() = runTest {
        val repo = ThreadSafeRepository()
        val results = mutableListOf<Int>()

        // Launch 100 concurrent increments
        val jobs = (1..100).map {
            launch {
                repo.increment()
            }
        }
        jobs.forEach { it.join() }

        assertEquals(100, repo.getCount()) // All increments applied
    }
}

class ThreadSafeRepository {
    private val mutex = Mutex()
    private var count = 0

    suspend fun increment() {
        mutex.withLock {
            val current = count
            delay(1) // Simulate work
            count = current + 1
        }
    }

    fun getCount(): Int = count
}
```

```kotlin
// Testing coroutineScope failure propagation
class ScopeFailureTest {
    @Test
    fun `coroutineScope cancels siblings on failure`() = runTest {
        var siblingCompleted = false

        assertThrows<IOException> {
            coroutineScope {
                launch {
                    delay(1000)
                    siblingCompleted = true
                }
                launch {
                    delay(100)
                    throw IOException("Failed")
                }
            }
        }

        assertFalse(siblingCompleted) // Sibling was cancelled
    }

    @Test
    fun `supervisorScope lets siblings continue`() = runTest {
        var siblingCompleted = false
        val errors = mutableListOf<Throwable>()

        supervisorScope {
            launch {
                delay(1000)
                siblingCompleted = true
            }
            launch {
                try {
                    delay(100)
                    throw IOException("Failed")
                } catch (e: IOException) {
                    errors.add(e)
                }
            }
        }

        assertTrue(siblingCompleted) // Sibling completed despite failure
        assertEquals(1, errors.size)
    }
}
```

```kotlin
// Testing debounced concurrent access
class ConcurrentAccessTest {
    @Test
    fun `only latest request is processed when requests overlap`() = runTest {
        val fakeApi = FakeSearchApi()
        val searcher = DebouncedSearcher(fakeApi, debounceMs = 300)

        // Launch overlapping searches
        launch { searcher.search("kotlin") }
        advanceTimeBy(100) // 100ms — first search pending
        launch { searcher.search("compose") } // Cancels first search
        advanceTimeBy(400) // Past debounce

        // Only "compose" search should have been executed
        assertEquals(1, fakeApi.searchCalls.size)
        assertEquals("compose", fakeApi.searchCalls[0])
    }
}
```

#### Common Mistakes

**Not testing partial failures in parallel operations.** If your code launches 3 parallel tasks and you only test all-success, you miss the case where task 2 fails while tasks 1 and 3 succeed. Use `supervisorScope` for graceful degradation and test each failure combination.

**Assuming execution order in parallel coroutines.** Two coroutines launched with `launch` execute concurrently — their relative order depends on the dispatcher. Don't write tests that assume one completes before the other unless you explicitly control advancement.

**Not using `Mutex` for shared mutable state.** If two coroutines modify the same variable without synchronization, the result is non-deterministic. Use `Mutex` and test that concurrent access produces correct results.

**Key takeaway:** Test parallel operations for all failure combinations — all succeed, one fails, all fail. Use `supervisorScope` when partial failure is acceptable. Use `Mutex` for shared state and test concurrent access. Control execution order with `StandardTestDispatcher` when testing race conditions.

### Lesson 6.4: Testing Exception Handling in Coroutines

Exception handling in coroutines follows different rules than regular Kotlin code. A `launch` coroutine propagates exceptions to its parent scope. An `async` coroutine stores the exception and rethrows it when `await()` is called. A `CoroutineExceptionHandler` catches uncaught exceptions at the top level. Testing each of these patterns ensures your app handles errors correctly instead of crashing.

The key distinction is between `launch` and `async`. A `launch` coroutine that throws propagates the exception up the scope hierarchy. If the exception isn't caught by a `try-catch` inside the coroutine, it reaches the `CoroutineExceptionHandler` or crashes the app. An `async` coroutine stores the exception — the coroutine completes "normally" from the scope's perspective, and the exception is only thrown when `await()` is called.

Testing `try-catch` in suspend functions is straightforward — call the function and assert on the result or the thrown exception. But testing exception handling in `viewModelScope.launch` is trickier because the exception propagates through the scope, not through the call stack. The ViewModel must catch exceptions inside the `launch` block to prevent scope cancellation.

`CoroutineExceptionHandler` is used for uncaught exceptions in root coroutines. In ViewModels, the `viewModelScope` has its own exception handling. In tests, `runTest` catches unhandled exceptions and fails the test. This is actually helpful — if your production code forgets to catch an exception, the test fails with a clear error.

Structured concurrency means that a child coroutine's exception cancels its parent and all siblings. This is intentional — it prevents partial operations from completing when part of the operation failed. But it means your error handling must be deliberate. If you want to handle one child's failure without cancelling siblings, use `supervisorScope` or catch exceptions inside the child.

Testing error recovery patterns — retry, fallback, circuit breaker — requires simulating repeated failures and verifying the recovery logic. A retry function should be tested with configurable failure counts to verify it retries the correct number of times and eventually either succeeds or gives up.

One subtle testing concern is the `CancellationException`. When a coroutine is cancelled (e.g., ViewModel is cleared), a `CancellationException` is thrown. Your error handling should NOT catch `CancellationException` — it should propagate so that structured concurrency works correctly. Testing this requires cancelling a coroutine and verifying that the cancellation propagates without being swallowed.

```kotlin
// Testing exception handling in ViewModel launch
class ViewModelExceptionTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `catches exception in launch and updates error state`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.shouldFail = true
        fakeRepo.failureException = IOException("Network error")
        val viewModel = ProfileViewModel(fakeRepo)

        viewModel.loadProfile("1")

        val state = viewModel.state.value
        assertIs<ProfileState.Error>(state)
        assertTrue(state.message.contains("Network"))
    }

    @Test
    fun `unhandled exception in launch cancels the scope`() = runTest {
        // This is what happens when you DON'T catch exceptions
        var scopeCancelled = false

        val scope = CoroutineScope(StandardTestDispatcher(testScheduler))
        scope.launch {
            throw RuntimeException("Oops")
        }
        scope.launch {
            try {
                delay(Long.MAX_VALUE)
            } catch (e: CancellationException) {
                scopeCancelled = true
                throw e
            }
        }

        advanceUntilIdle()
        assertTrue(scopeCancelled) // Second coroutine was cancelled
    }
}
```

```kotlin
// Testing async exception behavior
class AsyncExceptionTest {
    @Test
    fun `async stores exception until await`() = runTest {
        val deferred = async {
            throw IOException("Network error")
        }

        // At this point, no exception — it's stored in deferred
        advanceUntilIdle()

        // Exception is thrown when awaiting
        assertThrows<IOException> {
            deferred.await()
        }
    }

    @Test
    fun `multiple async with supervisorScope handles individual failures`() = runTest {
        supervisorScope {
            val result1 = async { "success" }
            val result2 = async<String> { throw IOException("Failed") }

            assertEquals("success", result1.await())
            assertThrows<IOException> { result2.await() }
        }
    }
}
```

```kotlin
// Testing retry pattern
class RetryPatternTest {
    @Test
    fun `retries on IOException up to max attempts`() = runTest {
        var attempts = 0
        val result = retry(maxAttempts = 3, delayMs = 100) {
            attempts++
            if (attempts < 3) throw IOException("Attempt $attempts failed")
            "success"
        }

        assertEquals("success", result)
        assertEquals(3, attempts)
    }

    @Test
    fun `throws after exhausting retries`() = runTest {
        assertThrows<IOException> {
            retry(maxAttempts = 3, delayMs = 100) {
                throw IOException("Always fails")
            }
        }
    }

    @Test
    fun `does not retry on non-retryable exceptions`() = runTest {
        var attempts = 0
        assertThrows<IllegalArgumentException> {
            retry(maxAttempts = 3, delayMs = 100) {
                attempts++
                throw IllegalArgumentException("Bad input")
            }
        }
        assertEquals(1, attempts) // Only one attempt — not retried
    }
}

// Production code
suspend fun <T> retry(
    maxAttempts: Int,
    delayMs: Long,
    retryOn: (Exception) -> Boolean = { it is IOException },
    block: suspend () -> T
): T {
    var lastException: Exception? = null
    repeat(maxAttempts) { attempt ->
        try {
            return block()
        } catch (e: Exception) {
            if (!retryOn(e)) throw e
            lastException = e
            if (attempt < maxAttempts - 1) delay(delayMs)
        }
    }
    throw lastException!!
}
```

```kotlin
// Testing CancellationException propagation
class CancellationExceptionTest {
    @Test
    fun `CancellationException is not caught by generic catch`() = runTest {
        var cleanedUp = false
        val job = launch {
            try {
                delay(Long.MAX_VALUE)
            } catch (e: CancellationException) {
                cleanedUp = true
                throw e // Must rethrow CancellationException
            }
        }

        advanceTimeBy(100)
        job.cancel()
        advanceUntilIdle()

        assertTrue(cleanedUp)
        assertTrue(job.isCancelled)
    }
}
```

#### Common Mistakes

**Catching `CancellationException` without rethrowing.** `catch (e: Exception)` catches `CancellationException`, which breaks structured concurrency. Always rethrow it: `catch (e: Exception) { if (e is CancellationException) throw e; handleError(e) }`.

**Not testing the "no exception" path.** If your code has a `try-catch` block, make sure there's a test where the operation succeeds without throwing. It's possible to accidentally catch exceptions that shouldn't be caught.

**Testing exceptions through state changes only.** If your ViewModel catches an exception and sets an error state, also test that the exception is actually thrown by the underlying code. A test that only checks the error state might pass even if the repository never throws (because the ViewModel defaults to an error state).

**Key takeaway:** Test all exception handling paths — caught exceptions, uncaught exceptions, retries, and cancellation. Never swallow `CancellationException`. Use `supervisorScope` when child failure shouldn't cancel siblings. Test retry logic with configurable failure counts.

### Lesson 6.5: Testing Dispatchers and Context Switching

Dispatcher injection is fundamental for testable coroutine code. Production code uses `Dispatchers.IO` for disk/network operations and `Dispatchers.Default` for CPU-intensive work. Tests need to replace these dispatchers with test dispatchers to maintain deterministic execution and virtual time control.

The standard pattern is constructor injection of dispatchers. Instead of hardcoding `withContext(Dispatchers.IO)`, inject the dispatcher: `class Repository(private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO)`. In tests, provide `StandardTestDispatcher()` or `UnconfinedTestDispatcher()`. This keeps tests fast and deterministic while production code uses real dispatchers.

When you don't inject dispatchers, `withContext(Dispatchers.IO)` in production code runs on the real IO thread pool during tests. This has two problems: the work executes on a real thread (not the test dispatcher), breaking virtual time control; and the test must wait for real async completion, introducing timing sensitivity.

Testing dispatcher switching verifies that your code runs the right work on the right dispatcher. CPU-intensive operations should use `Dispatchers.Default`. Disk and network operations should use `Dispatchers.IO`. Main-thread-only operations (like UI updates) should use `Dispatchers.Main`. While these distinctions don't affect test correctness (tests use test dispatchers), they matter for production performance.

The `MainDispatcherRule` pattern already handles `Dispatchers.Main`. For `Dispatchers.IO` and `Dispatchers.Default`, inject them through constructors. Some teams create a `DispatcherProvider` interface that provides all three dispatchers, making injection consistent across the codebase.

Testing `withContext` boundary behavior is important when your code transforms data across dispatcher boundaries. A function that fetches data on IO and processes it on Default should produce the same result regardless of threading. The test verifies the output is correct; the dispatcher injection ensures the test controls execution.

For integration-style tests that intentionally use real dispatchers, you might not inject test dispatchers. In this case, the test verifies real-world threading behavior, including thread pool contention, context switching overhead, and dispatcher starvation. These tests are slower but catch threading bugs that fully-mocked tests miss.

```kotlin
// DispatcherProvider pattern
interface DispatcherProvider {
    val main: CoroutineDispatcher
    val io: CoroutineDispatcher
    val default: CoroutineDispatcher
}

class DefaultDispatcherProvider : DispatcherProvider {
    override val main: CoroutineDispatcher = Dispatchers.Main
    override val io: CoroutineDispatcher = Dispatchers.IO
    override val default: CoroutineDispatcher = Dispatchers.Default
}

class TestDispatcherProvider(testDispatcher: TestDispatcher) : DispatcherProvider {
    override val main: CoroutineDispatcher = testDispatcher
    override val io: CoroutineDispatcher = testDispatcher
    override val default: CoroutineDispatcher = testDispatcher
}
```

```kotlin
// Production code with injectable dispatchers
class ImageProcessor(
    private val dispatchers: DispatcherProvider
) {
    suspend fun processImage(imageData: ByteArray): ProcessedImage {
        // Read from disk on IO
        val rawImage = withContext(dispatchers.io) {
            decodeImage(imageData)
        }
        // Heavy computation on Default
        val processed = withContext(dispatchers.default) {
            applyFilters(rawImage)
        }
        return processed
    }
}
```

```kotlin
// Testing with injected dispatchers
class ImageProcessorTest {
    @Test
    fun `processes image through decode and filter pipeline`() = runTest {
        val testDispatchers = TestDispatcherProvider(StandardTestDispatcher(testScheduler))
        val processor = ImageProcessor(testDispatchers)

        val result = processor.processImage(testImageData())

        assertNotNull(result)
        assertTrue(result.isFiltered)
    }
}
```

```kotlin
// Testing that dispatcher injection controls execution
class DispatcherControlTest {
    @Test
    fun `all work runs on test dispatcher when injected`() = runTest {
        val testDispatcher = StandardTestDispatcher(testScheduler)
        val threadNames = mutableListOf<String>()

        val repo = TrackingRepository(testDispatcher) { threadName ->
            threadNames.add(threadName)
        }

        repo.fetchData()

        // All operations ran on the test dispatcher thread
        assertTrue(threadNames.all { it.contains("Test") || it.contains("main") })
    }
}
```

#### Common Mistakes

**Hardcoding dispatchers in production code.** `withContext(Dispatchers.IO)` is untestable — you can't replace `Dispatchers.IO` in a test. Always inject dispatchers through constructors or use a `DispatcherProvider`.

**Creating multiple test dispatchers that don't share a scheduler.** If your `MainDispatcherRule` uses one `TestDispatcher` and your `runTest` uses another, virtual time is not synchronized between them. Always share the same `TestCoroutineScheduler` across all test dispatchers.

**Over-injecting dispatchers.** Not every function needs an injected dispatcher. Pure functions that don't switch contexts don't need dispatcher injection. Only inject dispatchers in classes that actually call `withContext`.

**Key takeaway:** Inject dispatchers through constructors so tests can control execution. Use a `DispatcherProvider` interface for consistency. Share the same `TestCoroutineScheduler` across all test dispatchers. Only inject dispatchers where `withContext` is actually used.

### Quiz: Testing Coroutines

#### What does `runTest` provide that `runBlocking` doesn't?

- ❌ runTest runs coroutines faster on real threads
- ✅ Virtual time control, leaked coroutine detection, and a TestScope
- ❌ runTest supports parallel execution; runBlocking is sequential
- ❌ runTest works with suspend functions; runBlocking doesn't

> **Explanation:** `runTest` provides virtual time (so `delay(5000)` is instant), detects leaked coroutines (failing the test if any coroutine is still running), and provides a `TestScope` with `advanceUntilIdle()` and `advanceTimeBy()` for precise execution control.

#### Why should you inject dispatchers instead of hardcoding them?

- ❌ Hardcoded dispatchers make the code slower
- ❌ Injected dispatchers are required by Hilt
- ✅ Injected dispatchers let tests control execution, maintain virtual time, and ensure deterministic behavior
- ❌ Hardcoded dispatchers cause memory leaks

> **Explanation:** When production code uses `withContext(Dispatchers.IO)`, the work runs on the real IO thread pool in tests, breaking virtual time control and making tests timing-dependent. Injecting a `TestDispatcher` keeps everything deterministic.

#### What happens when an unhandled exception occurs in a `launch` coroutine?

- ❌ The exception is silently swallowed
- ❌ Only the failing coroutine is cancelled
- ✅ The exception propagates to the parent scope, cancelling all sibling coroutines
- ❌ The exception is stored and thrown later

> **Explanation:** In structured concurrency, a `launch` coroutine's unhandled exception propagates to its parent scope, which cancels all other children. Use `supervisorScope` if you want siblings to continue despite one child's failure.

### Coding Challenge: Test a Retry Mechanism

Implement and test a `RetryingRepository` that wraps another repository, retries on `IOException` with exponential backoff, and gives up after `maxRetries`. Test the happy path, the retry-and-succeed path, the retry-exhaustion path, and verify that non-retryable exceptions are thrown immediately.

#### Solution

```kotlin
class RetryingRepository(
    private val delegate: UserRepository,
    private val maxRetries: Int = 3,
    private val initialDelayMs: Long = 100
) : UserRepository {
    override suspend fun getUser(id: String): User {
        var lastException: IOException? = null
        repeat(maxRetries + 1) { attempt ->
            try {
                return delegate.getUser(id)
            } catch (e: IOException) {
                lastException = e
                if (attempt < maxRetries) {
                    delay(initialDelayMs * (attempt + 1))
                }
            }
        }
        throw lastException!!
    }

    override suspend fun saveUser(user: User) = delegate.saveUser(user)
    override suspend fun deleteUser(id: String) = delegate.deleteUser(id)
    override fun observeUsers(): Flow<List<User>> = delegate.observeUsers()
}

class RetryingRepositoryTest {
    @Test
    fun `returns immediately on success`() = runTest {
        val fake = FakeUserRepository()
        fake.addUser(testUser(id = "1", name = "Mukul"))
        val retrying = RetryingRepository(fake)

        val user = retrying.getUser("1")
        assertEquals("Mukul", user.name)
    }

    @Test
    fun `retries on IOException and succeeds`() = runTest {
        var callCount = 0
        val failing = object : UserRepository {
            override suspend fun getUser(id: String): User {
                callCount++
                if (callCount < 3) throw IOException("Fail")
                return testUser(id = id, name = "Recovered")
            }
            override suspend fun saveUser(user: User) {}
            override suspend fun deleteUser(id: String) {}
            override fun observeUsers(): Flow<List<User>> = flowOf()
        }
        val retrying = RetryingRepository(failing, maxRetries = 3)

        val user = retrying.getUser("1")
        assertEquals("Recovered", user.name)
        assertEquals(3, callCount)
    }

    @Test
    fun `throws after exhausting retries`() = runTest {
        val alwaysFails = FakeUserRepository().apply { shouldFail = true }
        val retrying = RetryingRepository(alwaysFails, maxRetries = 2)

        assertThrows<IOException> {
            retrying.getUser("1")
        }
    }

    @Test
    fun `non-retryable exception is thrown immediately`() = runTest {
        val badInput = object : UserRepository {
            override suspend fun getUser(id: String): User =
                throw IllegalArgumentException("Invalid ID")
            override suspend fun saveUser(user: User) {}
            override suspend fun deleteUser(id: String) {}
            override fun observeUsers(): Flow<List<User>> = flowOf()
        }
        val retrying = RetryingRepository(badInput)

        assertThrows<IllegalArgumentException> {
            retrying.getUser("bad")
        }
    }
}
```

---


## Module 7: Compose UI Testing

Compose UI testing verifies that your screens render correctly, respond to user interactions, and display the right data for each state. Unlike unit tests that run on the JVM in milliseconds, Compose tests require the Android rendering infrastructure. But they're still fast — much faster than traditional Espresso tests — because Compose's declarative nature makes it easy to render individual composables in isolation without launching a full Activity.

### Lesson 7.1: ComposeTestRule Basics

`ComposeTestRule` is the entry point for all Compose UI tests. It manages the Compose runtime, provides a rendering surface, and exposes methods for finding UI elements, performing actions, and making assertions. Every Compose test starts by creating a `ComposeTestRule` and setting content with `setContent { }`.

There are two types of Compose test rules: `createComposeRule()` creates a standalone Compose rendering surface without an Activity — ideal for testing individual composables in isolation. `createAndroidComposeRule<Activity>()` creates a test with a real Activity — needed for tests that require navigation, system services, or full application context.

For most composable tests, `createComposeRule()` is sufficient and preferred. It's faster because it doesn't launch an Activity, simpler because it has fewer dependencies, and more focused because it tests the composable in isolation. Use `createAndroidComposeRule` only when your test needs features that require a real Activity, like navigation or Android resources.

The basic test pattern is: set content, find a node, assert or perform an action. `setContent { MyComposable() }` renders the composable. `onNodeWithText("Hello")` finds a node with the text "Hello". `.assertIsDisplayed()` verifies it's visible. `.performClick()` simulates a tap. This three-step pattern — render, find, verify — covers the vast majority of Compose UI tests.

Compose test semantics are the key to finding UI elements. Semantics are metadata attached to composable nodes — text content, content description, test tags, roles, and states. When you write `Text("Hello")`, Compose automatically adds a text semantic. When you write `Modifier.testTag("submit_button")`, you add a custom test tag. Tests use these semantics to find nodes without depending on visual layout, making tests resilient to visual changes.

The `onNodeWithText()`, `onNodeWithContentDescription()`, and `onNodeWithTag()` finders are the most commonly used. `onNodeWithText` finds by displayed text — ideal for buttons and labels. `onNodeWithContentDescription` finds by accessibility description — ideal for icons and images. `onNodeWithTag` finds by test tag — ideal when text and descriptions might change or aren't unique.

Compose test rules provide automatic idle synchronization. After each action (click, scroll, text input), the test rule waits for the Compose runtime to settle — all recompositions complete, all animations finish, and the UI is in a stable state. This eliminates the manual idle waiting that plagues Espresso tests and makes Compose tests more reliable.

One important consideration is test performance. Each `setContent` call creates a new Compose runtime, which takes time. If you have 50 tests that each call `setContent`, the setup overhead adds up. For test classes where all tests share the same composable setup, consider using the rule's `setContent` in a `@Before` method and testing different interactions in each test.

```kotlin
// Basic Compose test setup
class GreetingScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `displays greeting text`() {
        composeTestRule.setContent {
            GreetingScreen(name = "Mukul")
        }

        composeTestRule.onNodeWithText("Hello, Mukul!").assertIsDisplayed()
    }

    @Test
    fun `displays default greeting when name is empty`() {
        composeTestRule.setContent {
            GreetingScreen(name = "")
        }

        composeTestRule.onNodeWithText("Hello, Guest!").assertIsDisplayed()
    }
}

// Production composable
@Composable
fun GreetingScreen(name: String) {
    val displayName = name.ifBlank { "Guest" }
    Text(
        text = "Hello, $displayName!",
        style = MaterialTheme.typography.headlineMedium
    )
}
```

```kotlin
// Testing user interactions
class LoginScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `enter email and password then click login`() {
        var loginClicked = false
        var enteredEmail = ""
        var enteredPassword = ""

        composeTestRule.setContent {
            LoginScreen(
                onLogin = { email, password ->
                    loginClicked = true
                    enteredEmail = email
                    enteredPassword = password
                }
            )
        }

        composeTestRule.onNodeWithTag("email_field")
            .performTextInput("mukul@test.com")

        composeTestRule.onNodeWithTag("password_field")
            .performTextInput("password123")

        composeTestRule.onNodeWithText("Login")
            .performClick()

        assertTrue(loginClicked)
        assertEquals("mukul@test.com", enteredEmail)
        assertEquals("password123", enteredPassword)
    }

    @Test
    fun `login button is disabled when fields are empty`() {
        composeTestRule.setContent {
            LoginScreen(onLogin = { _, _ -> })
        }

        composeTestRule.onNodeWithText("Login")
            .assertIsNotEnabled()
    }
}
```

```kotlin
// Testing different states
class ProfileScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `shows loading indicator when state is loading`() {
        composeTestRule.setContent {
            ProfileScreen(state = ProfileState.Loading)
        }

        composeTestRule.onNodeWithTag("loading_indicator")
            .assertIsDisplayed()
    }

    @Test
    fun `shows user name when state is loaded`() {
        composeTestRule.setContent {
            ProfileScreen(
                state = ProfileState.Loaded(testUser(name = "Mukul"))
            )
        }

        composeTestRule.onNodeWithText("Mukul").assertIsDisplayed()
        composeTestRule.onNodeWithTag("loading_indicator")
            .assertDoesNotExist()
    }

    @Test
    fun `shows error message with retry button when state is error`() {
        composeTestRule.setContent {
            ProfileScreen(
                state = ProfileState.Error("Network error", isRetryable = true)
            )
        }

        composeTestRule.onNodeWithText("Network error").assertIsDisplayed()
        composeTestRule.onNodeWithText("Retry").assertIsDisplayed()
    }
}
```

```kotlin
// Using test tags for reliable node finding
@Composable
fun LoginScreen(onLogin: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column {
        TextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.testTag("email_field")
        )
        TextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.testTag("password_field")
        )
        Button(
            onClick = { onLogin(email, password) },
            enabled = email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.testTag("login_button")
        ) {
            Text("Login")
        }
    }
}
```

#### Common Mistakes

**Finding nodes by implementation details instead of semantics.** Don't search for specific Compose class names or view hierarchy positions. Use `onNodeWithText`, `onNodeWithContentDescription`, or `onNodeWithTag`. These are resilient to layout changes.

**Not using test tags for ambiguous elements.** If your screen has two "Submit" buttons, `onNodeWithText("Submit")` is ambiguous and the test fails. Add `Modifier.testTag("primary_submit")` to distinguish them.

**Testing Compose internals instead of visible behavior.** Don't assert on `remember` state, composition counts, or recomposition triggers. Assert on what the user sees — displayed text, enabled/disabled buttons, visible/invisible elements.

**Key takeaway:** Use `createComposeRule()` for isolated composable tests. Find nodes with `onNodeWithText`, `onNodeWithTag`, or `onNodeWithContentDescription`. Assert on visible behavior, not internal state. Let the test rule handle idle synchronization automatically.

### Lesson 7.2: Finders, Actions, and Assertions

The Compose testing API has three categories of operations: finders locate nodes in the semantic tree, actions simulate user interactions, and assertions verify node properties. Mastering these three categories lets you test any UI scenario.

Finders come in two flavors: `onNode(matcher)` for single nodes and `onAllNodes(matcher)` for multiple nodes. The most common matchers are `hasText("...")`, `hasTestTag("...")`, `hasContentDescription("...")`, `isToggleable()`, `isEnabled()`, and `isFocused()`. Matchers can be combined with `and` and `or`: `hasText("Submit") and isEnabled()` finds an enabled button with text "Submit".

Actions simulate user interactions. `performClick()` taps a node. `performTextInput("text")` types text into a text field. `performTextClearance()` clears a text field. `performScrollTo()` scrolls until the node is visible. `performTouchInput { swipeLeft() }` performs gesture-based interactions. Each action triggers recomposition and the test rule waits for idle before returning control.

Assertions verify node properties. `assertIsDisplayed()` checks visibility. `assertIsEnabled()` and `assertIsNotEnabled()` check enabled state. `assertTextEquals("text")` verifies exact text. `assertTextContains("partial")` verifies partial text. `assertDoesNotExist()` verifies the node isn't in the tree at all (not just hidden — completely absent).

The distinction between `assertIsNotDisplayed()` and `assertDoesNotExist()` is important. `assertIsNotDisplayed()` means the node exists in the semantic tree but isn't visible on screen (it might be scrolled off screen or have `alpha = 0`). `assertDoesNotExist()` means the node isn't in the semantic tree at all — it was never composed or was removed by a conditional (`if (showError) ErrorText()`).

For lists and scrollable content, you need to scroll to items before asserting on them. `onNodeWithText("Item 50").performScrollTo()` scrolls the list until item 50 is visible. For `LazyColumn`, you might need `onNodeWithTag("list").performScrollToIndex(50)` to scroll to a specific index.

Custom semantics let you attach domain-specific metadata to composables. `Modifier.semantics { testTag = "user_avatar"; contentDescription = "Profile photo for Mukul" }` attaches both a test tag and a content description. In tests, you can find and assert on these semantics. Custom semantic properties are also useful for accessibility testing.

Gesture testing covers complex interactions like long press, double tap, swipe, pinch, and drag. `performTouchInput { longClick() }` simulates a long press. `performTouchInput { swipeLeft() }` simulates a swipe. These gesture actions are composable — you can chain multiple gestures in a single `performTouchInput` block to simulate complex interaction patterns.

```kotlin
// Comprehensive finder examples
class FinderExamplesTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `find by text`() {
        composeTestRule.setContent {
            Text("Welcome to the app")
        }
        composeTestRule.onNodeWithText("Welcome to the app").assertIsDisplayed()
    }

    @Test
    fun `find by partial text`() {
        composeTestRule.setContent {
            Text("Welcome to the app")
        }
        composeTestRule.onNodeWithText("Welcome", substring = true).assertIsDisplayed()
    }

    @Test
    fun `find by test tag`() {
        composeTestRule.setContent {
            Icon(
                Icons.Default.Settings,
                contentDescription = "Settings",
                modifier = Modifier.testTag("settings_icon")
            )
        }
        composeTestRule.onNodeWithTag("settings_icon").assertIsDisplayed()
    }

    @Test
    fun `find by content description`() {
        composeTestRule.setContent {
            Icon(Icons.Default.Home, contentDescription = "Navigate to home")
        }
        composeTestRule.onNodeWithContentDescription("Navigate to home").assertIsDisplayed()
    }

    @Test
    fun `combine matchers with and`() {
        composeTestRule.setContent {
            Column {
                Button(onClick = {}, enabled = true) { Text("Submit") }
                Button(onClick = {}, enabled = false) { Text("Submit") }
            }
        }
        // Find the enabled Submit button
        composeTestRule.onNode(hasText("Submit") and isEnabled()).assertIsDisplayed()
    }
}
```

```kotlin
// Action examples
class ActionExamplesTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `text input and clearance`() {
        var text by mutableStateOf("")
        composeTestRule.setContent {
            TextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.testTag("input")
            )
        }

        composeTestRule.onNodeWithTag("input")
            .performTextInput("Hello")
        assertEquals("Hello", text)

        composeTestRule.onNodeWithTag("input")
            .performTextClearance()
        assertEquals("", text)
    }

    @Test
    fun `click and toggle`() {
        var isChecked by mutableStateOf(false)
        composeTestRule.setContent {
            Checkbox(
                checked = isChecked,
                onCheckedChange = { isChecked = it },
                modifier = Modifier.testTag("checkbox")
            )
        }

        composeTestRule.onNodeWithTag("checkbox").performClick()
        assertTrue(isChecked)

        composeTestRule.onNodeWithTag("checkbox").performClick()
        assertFalse(isChecked)
    }

    @Test
    fun `swipe to dismiss`() {
        var dismissed = false
        composeTestRule.setContent {
            SwipeToDismissItem(
                onDismiss = { dismissed = true },
                modifier = Modifier.testTag("swipeable")
            ) {
                Text("Swipe me")
            }
        }

        composeTestRule.onNodeWithTag("swipeable")
            .performTouchInput { swipeLeft() }

        assertTrue(dismissed)
    }
}
```

```kotlin
// Assertion examples
class AssertionExamplesTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `assertDoesNotExist vs assertIsNotDisplayed`() {
        composeTestRule.setContent {
            Column {
                Text("Always visible")
                // ErrorText is NOT composed at all
            }
        }

        composeTestRule.onNodeWithText("Always visible").assertIsDisplayed()
        composeTestRule.onNodeWithText("Error message").assertDoesNotExist()
    }

    @Test
    fun `assert on list items`() {
        val items = listOf("Apple", "Banana", "Cherry")
        composeTestRule.setContent {
            LazyColumn(modifier = Modifier.testTag("fruit_list")) {
                items(items) { fruit ->
                    Text(fruit, modifier = Modifier.testTag("fruit_$fruit"))
                }
            }
        }

        composeTestRule.onNodeWithTag("fruit_Apple").assertIsDisplayed()
        composeTestRule.onNodeWithTag("fruit_Banana").assertIsDisplayed()
        composeTestRule.onNodeWithTag("fruit_Cherry").assertIsDisplayed()
    }

    @Test
    fun `count nodes matching criteria`() {
        composeTestRule.setContent {
            Column {
                repeat(3) { Text("Item") }
            }
        }

        composeTestRule.onAllNodesWithText("Item")
            .assertCountEquals(3)
    }
}
```

```kotlin
// Testing scrollable content
class ScrollableContentTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `scrolls to off-screen item in LazyColumn`() {
        composeTestRule.setContent {
            LazyColumn(modifier = Modifier.testTag("item_list")) {
                items(100) { index ->
                    Text(
                        "Item $index",
                        modifier = Modifier
                            .testTag("item_$index")
                            .padding(16.dp)
                    )
                }
            }
        }

        // Item 50 is initially off screen
        composeTestRule.onNodeWithTag("item_50")
            .performScrollTo()
            .assertIsDisplayed()
    }
}
```

#### Common Mistakes

**Using `onNodeWithText` for text that changes with localization.** If your app is localized, hardcoded text strings break in other locales. Use `onNodeWithTag` or `onNodeWithContentDescription` with translatable resources for stable tests.

**Asserting on layout position instead of semantic properties.** Don't check that a button is "at position (100, 200)." Assert that it `isDisplayed()`, `isEnabled()`, and has the right text. Layout changes constantly; semantics remain stable.

**Not waiting for async state changes.** If your composable loads data asynchronously, `setContent` only renders the initial state. You need to wait for the state update to propagate to the composable before asserting on the loaded state.

**Key takeaway:** Master the three pillars: finders (locate nodes), actions (simulate user input), and assertions (verify properties). Use `onNodeWithTag` for reliable, locale-independent node finding. Understand the difference between `assertDoesNotExist` and `assertIsNotDisplayed`.

### Lesson 7.3: Testing Composable States

Composables render different UIs based on their state — loading spinners, error messages, empty states, data lists. Testing each state ensures your UI correctly represents every possible condition the user might see. This is where Compose testing shines: you can directly set the state and verify the rendered output without navigating through the app.

The pattern is straightforward: render the composable with a specific state and assert on the visible elements. For a screen that shows loading, data, empty, and error states, write four tests — one per state. Each test sets the state directly and asserts on what should be visible and what should be absent.

For stateful composables that manage their own `remember` state, you test through interactions. Set the initial content, perform an action that changes state (click, type, toggle), and assert on the new state's visual representation. You don't directly set `remember` values — you trigger state changes through the composable's public interaction surface.

For composables that receive state from a ViewModel, you skip the ViewModel entirely in UI tests. Instead of creating a real ViewModel with real dependencies, you pass the state directly: `ProfileScreen(state = ProfileState.Loaded(testUser()))`. This isolates the UI test from the business logic test. The ViewModel is tested separately with unit tests.

Testing state transitions in composables verifies that the UI updates correctly when state changes. Use a `mutableStateOf` variable as the state source, assert on the initial render, update the variable, and assert on the new render. The test rule automatically waits for recomposition after the state change.

Conditional rendering is a common source of UI bugs. When a composable uses `if (state is Error) ErrorView()`, the `ErrorView` should appear only in error state and disappear in other states. Test this by rendering the composable in error state (assert `ErrorView` exists), then changing to success state (assert `ErrorView` doesn't exist). This catches bugs where error views persist after the error is resolved.

List state testing covers empty lists, single items, and many items. An empty list should show an empty state message. A list with one item should show the item without dividers. A list with 100 items should be scrollable. Test each case to ensure the UI handles all list sizes correctly.

Animation state testing is typically done by advancing the clock. Compose test rules provide `mainClock.advanceTimeBy(millis)` to advance animation time. After advancing, you can assert on the composable's visual state at that point in the animation. This makes animation testing deterministic.

```kotlin
// Testing all states of a screen
class TaskListScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `loading state shows progress indicator`() {
        composeTestRule.setContent {
            TaskListScreen(state = TaskListState.Loading)
        }

        composeTestRule.onNodeWithTag("progress_indicator").assertIsDisplayed()
        composeTestRule.onNodeWithTag("task_list").assertDoesNotExist()
        composeTestRule.onNodeWithTag("empty_state").assertDoesNotExist()
    }

    @Test
    fun `loaded state shows task list`() {
        val tasks = listOf(
            Task("1", "Buy groceries", isCompleted = false),
            Task("2", "Walk dog", isCompleted = true)
        )
        composeTestRule.setContent {
            TaskListScreen(state = TaskListState.Loaded(tasks))
        }

        composeTestRule.onNodeWithText("Buy groceries").assertIsDisplayed()
        composeTestRule.onNodeWithText("Walk dog").assertIsDisplayed()
        composeTestRule.onNodeWithTag("progress_indicator").assertDoesNotExist()
    }

    @Test
    fun `empty state shows message`() {
        composeTestRule.setContent {
            TaskListScreen(state = TaskListState.Loaded(emptyList()))
        }

        composeTestRule.onNodeWithText("No tasks yet").assertIsDisplayed()
        composeTestRule.onNodeWithTag("task_list").assertDoesNotExist()
    }

    @Test
    fun `error state shows error message and retry button`() {
        composeTestRule.setContent {
            TaskListScreen(
                state = TaskListState.Error("Failed to load tasks")
            )
        }

        composeTestRule.onNodeWithText("Failed to load tasks").assertIsDisplayed()
        composeTestRule.onNodeWithText("Retry").assertIsDisplayed()
    }
}
```

```kotlin
// Testing state transitions via mutableStateOf
class StateTransitionTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `transitions from loading to loaded`() {
        val state = mutableStateOf<ProfileState>(ProfileState.Loading)

        composeTestRule.setContent {
            ProfileScreen(state = state.value)
        }

        // Initially loading
        composeTestRule.onNodeWithTag("loading_indicator").assertIsDisplayed()

        // Transition to loaded
        state.value = ProfileState.Loaded(testUser(name = "Mukul"))

        composeTestRule.onNodeWithText("Mukul").assertIsDisplayed()
        composeTestRule.onNodeWithTag("loading_indicator").assertDoesNotExist()
    }

    @Test
    fun `error view disappears when state changes to loaded`() {
        val state = mutableStateOf<ProfileState>(
            ProfileState.Error("Network error", isRetryable = true)
        )

        composeTestRule.setContent {
            ProfileScreen(state = state.value)
        }

        // Initially error
        composeTestRule.onNodeWithText("Network error").assertIsDisplayed()

        // Transition to loaded
        state.value = ProfileState.Loaded(testUser(name = "Mukul"))

        composeTestRule.onNodeWithText("Network error").assertDoesNotExist()
        composeTestRule.onNodeWithText("Mukul").assertIsDisplayed()
    }
}
```

```kotlin
// Testing stateful composables through interaction
class CounterTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `increment button increases count`() {
        composeTestRule.setContent {
            Counter()
        }

        composeTestRule.onNodeWithText("Count: 0").assertIsDisplayed()

        composeTestRule.onNodeWithText("Increment").performClick()
        composeTestRule.onNodeWithText("Count: 1").assertIsDisplayed()

        composeTestRule.onNodeWithText("Increment").performClick()
        composeTestRule.onNodeWithText("Count: 2").assertIsDisplayed()
    }

    @Test
    fun `decrement button decreases count`() {
        composeTestRule.setContent {
            Counter(initialCount = 5)
        }

        composeTestRule.onNodeWithText("Count: 5").assertIsDisplayed()

        composeTestRule.onNodeWithTag("decrement_button").performClick()
        composeTestRule.onNodeWithText("Count: 4").assertIsDisplayed()
    }

    @Test
    fun `count does not go below zero`() {
        composeTestRule.setContent {
            Counter(initialCount = 0)
        }

        composeTestRule.onNodeWithTag("decrement_button").performClick()
        composeTestRule.onNodeWithText("Count: 0").assertIsDisplayed()
    }
}
```

```kotlin
// Production composable
@Composable
fun Counter(initialCount: Int = 0) {
    var count by remember { mutableIntStateOf(initialCount) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(
            onClick = { if (count > 0) count-- },
            modifier = Modifier.testTag("decrement_button")
        ) {
            Icon(Icons.Default.Remove, contentDescription = "Decrement")
        }

        Text("Count: $count")

        Button(onClick = { count++ }) {
            Text("Increment")
        }
    }
}
```

#### Common Mistakes

**Testing ViewModel logic through Compose UI tests.** If you want to verify that a discount calculation is correct, write a unit test for the calculator function. Don't render a Compose screen, enter a price, apply a discount, and parse the displayed price. UI tests are for verifying the UI, not the business logic.

**Not testing the empty state.** The empty state (no tasks, no orders, no notifications) is one of the most common states users see, especially new users. If you don't test it, you might discover a crash or a confusing UI in production.

**Hardcoding state in the composable under test.** If your composable creates its own ViewModel internally, you can't control the state in tests. Pass state as a parameter so tests can set each state directly.

**Key takeaway:** Test every state a composable can be in — loading, loaded, empty, error. Use `mutableStateOf` to test state transitions. Pass state as parameters for testability. Test the UI layer separately from the business logic layer.

### Lesson 7.4: Testing User Interactions in Compose

Beyond basic clicks and text input, Compose testing supports complex user interactions — scrolling, swiping, long pressing, multi-step forms, tab switching, and dialog interactions. Testing these interactions verifies that your UI responds correctly to every gesture a user might perform.

Form testing is one of the most valuable interaction test patterns. A registration form with email, password, and confirm password fields has many interaction scenarios: filling all fields correctly, leaving fields empty, entering mismatched passwords, entering invalid email format, and submitting the form. Each scenario should be a separate test that simulates the user's exact interaction sequence.

Tab and navigation testing verifies that switching between tabs shows the correct content. Click the "Orders" tab, verify order content is displayed. Click the "Profile" tab, verify profile content is displayed. Click back to "Orders", verify the order content is still correct (not stale or reset).

Dialog and bottom sheet testing requires triggering the dialog to open, interacting with its contents, and then either confirming or dismissing. After confirmation, verify the action was taken. After dismissal, verify the action was NOT taken and the dialog is no longer visible.

Pull-to-refresh testing simulates the swipe-down gesture and verifies that a refresh is triggered. Use `performTouchInput { swipeDown() }` to simulate the gesture, then verify the loading indicator appears and the data refreshes.

Keyboard behavior testing verifies that the keyboard opens and closes correctly, that the IME action (Done, Next, Search) triggers the right behavior, and that the focus moves between fields as expected. `performImeAction()` simulates pressing the IME action button on the keyboard.

Testing accessibility interactions ensures your app works with screen readers, switch control, and other assistive technologies. Verify that all interactive elements have content descriptions, that focus order is logical, and that custom actions are accessible. This isn't just good practice — it's required for many enterprise apps.

Error display and dismissal is a critical interaction pattern. When an error toast or snackbar appears, does it disappear after a timeout? Can the user dismiss it? Does dismissing the error restore the previous state? Test the complete error lifecycle from appearance to dismissal.

```kotlin
// Testing a multi-field form
class RegistrationFormTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `valid form submission calls onRegister with correct data`() {
        var registeredEmail = ""
        var registeredPassword = ""

        composeTestRule.setContent {
            RegistrationForm(
                onRegister = { email, password ->
                    registeredEmail = email
                    registeredPassword = password
                }
            )
        }

        composeTestRule.onNodeWithTag("email_field")
            .performTextInput("mukul@test.com")

        composeTestRule.onNodeWithTag("password_field")
            .performTextInput("SecurePass123")

        composeTestRule.onNodeWithTag("confirm_password_field")
            .performTextInput("SecurePass123")

        composeTestRule.onNodeWithText("Register").performClick()

        assertEquals("mukul@test.com", registeredEmail)
        assertEquals("SecurePass123", registeredPassword)
    }

    @Test
    fun `mismatched passwords show error`() {
        composeTestRule.setContent {
            RegistrationForm(onRegister = { _, _ -> })
        }

        composeTestRule.onNodeWithTag("password_field")
            .performTextInput("Password1")

        composeTestRule.onNodeWithTag("confirm_password_field")
            .performTextInput("Password2")

        composeTestRule.onNodeWithText("Register").performClick()

        composeTestRule.onNodeWithText("Passwords do not match")
            .assertIsDisplayed()
    }

    @Test
    fun `empty email shows validation error`() {
        composeTestRule.setContent {
            RegistrationForm(onRegister = { _, _ -> })
        }

        composeTestRule.onNodeWithTag("password_field")
            .performTextInput("Password123")
        composeTestRule.onNodeWithTag("confirm_password_field")
            .performTextInput("Password123")

        composeTestRule.onNodeWithText("Register").performClick()

        composeTestRule.onNodeWithText("Email is required")
            .assertIsDisplayed()
    }
}
```

```kotlin
// Testing dialog interactions
class DeleteConfirmationTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `confirming delete dialog removes item`() {
        var deletedItemId: String? = null
        composeTestRule.setContent {
            ItemList(
                items = listOf(
                    Item("1", "Widget"),
                    Item("2", "Gadget")
                ),
                onDelete = { deletedItemId = it }
            )
        }

        // Long press to show delete option
        composeTestRule.onNodeWithText("Widget")
            .performTouchInput { longClick() }

        // Click delete in context menu
        composeTestRule.onNodeWithText("Delete").performClick()

        // Confirm in dialog
        composeTestRule.onNodeWithText("Are you sure?").assertIsDisplayed()
        composeTestRule.onNodeWithText("Confirm").performClick()

        assertEquals("1", deletedItemId)
    }

    @Test
    fun `dismissing delete dialog does not remove item`() {
        var deletedItemId: String? = null
        composeTestRule.setContent {
            ItemList(
                items = listOf(Item("1", "Widget")),
                onDelete = { deletedItemId = it }
            )
        }

        composeTestRule.onNodeWithText("Widget")
            .performTouchInput { longClick() }
        composeTestRule.onNodeWithText("Delete").performClick()
        composeTestRule.onNodeWithText("Cancel").performClick()

        assertNull(deletedItemId)
        composeTestRule.onNodeWithText("Are you sure?").assertDoesNotExist()
    }
}
```

```kotlin
// Testing tab navigation
class TabNavigationTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `switching tabs shows correct content`() {
        composeTestRule.setContent {
            HomeScreen(
                ordersState = OrdersState.Loaded(
                    listOf(testOrder(id = "1"))
                ),
                profileState = ProfileState.Loaded(testUser(name = "Mukul"))
            )
        }

        // Default tab shows orders
        composeTestRule.onNodeWithText("Order #1").assertIsDisplayed()

        // Switch to profile tab
        composeTestRule.onNodeWithText("Profile").performClick()
        composeTestRule.onNodeWithText("Mukul").assertIsDisplayed()
        composeTestRule.onNodeWithText("Order #1").assertDoesNotExist()

        // Switch back to orders
        composeTestRule.onNodeWithText("Orders").performClick()
        composeTestRule.onNodeWithText("Order #1").assertIsDisplayed()
    }
}
```

```kotlin
// Testing pull-to-refresh
class PullToRefreshTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `pull to refresh triggers reload`() {
        var refreshCount = 0
        val state = mutableStateOf(
            ArticleListState.Loaded(listOf(testArticle(title = "Old Article")))
        )

        composeTestRule.setContent {
            ArticleListScreen(
                state = state.value,
                onRefresh = {
                    refreshCount++
                    state.value = ArticleListState.Loaded(
                        listOf(testArticle(title = "New Article"))
                    )
                }
            )
        }

        composeTestRule.onNodeWithTag("article_list")
            .performTouchInput { swipeDown() }

        assertEquals(1, refreshCount)
        composeTestRule.onNodeWithText("New Article").assertIsDisplayed()
    }
}
```

#### Common Mistakes

**Not testing keyboard interactions.** If your form moves focus from email to password on "Next" press, test that behavior. `performImeAction()` simulates the keyboard action button.

**Forgetting to test dialog dismissal.** Dialogs can be dismissed by tapping outside, pressing back, or tapping "Cancel." Test all dismissal paths and verify the action was NOT taken.

**Testing only the happy path for form validation.** Forms have many error states: empty fields, invalid format, too short, too long, special characters, existing email. Test each validation rule independently.

**Key takeaway:** Test complex interactions — forms, dialogs, tabs, pull-to-refresh, gestures. Each interaction should have tests for success, failure, and cancellation paths. Simulate the exact sequence of user actions, not just the final state.

### Lesson 7.5: Screenshot and Snapshot Testing

Screenshot testing captures a visual snapshot of your composable and compares it against a baseline. When the visual output changes unexpectedly, the test fails, showing you exactly what changed. This catches subtle visual regressions — a button that shifted 2 pixels, a color that changed slightly, a font that became bold — that functional tests miss.

The most popular tool for Compose screenshot testing is Paparazzi by Cash App. Paparazzi renders composables on the JVM without an Android device, generating PNG images that are compared against baselines stored in your repository. This is faster than on-device screenshot testing and integrates seamlessly with your CI pipeline.

Setting up Paparazzi requires adding the Gradle plugin and creating a test class that extends `PaparazziTest`. Each test method calls `paparazzi.snapshot { YourComposable() }` to capture a screenshot. On the first run, it generates the baseline images. On subsequent runs, it compares the current output against the baselines and fails if they differ beyond a configurable threshold.

Screenshot tests are best suited for design system components — buttons, cards, text fields, chips, badges. These components have precise visual specifications, and any deviation is a bug. A button with the wrong corner radius, a card with the wrong shadow, or a chip with the wrong background color should be caught by screenshot tests, not by human review.

For screen-level screenshot testing, snapshot tests capture the entire screen in different states. Capture the loading state, the loaded state with sample data, the empty state, and the error state. Store all four baselines. When someone changes the loading indicator or the error layout, the screenshot test catches it immediately.

The tradeoff with screenshot tests is maintenance cost. When you intentionally change a visual element, you need to update the baseline images. If your design system changes frequently, you'll spend time updating baselines. The solution is to use screenshot tests strategically — for stable design system components and critical screens, not for every composable in the app.

One important consideration is determinism. Screenshot tests must produce identical output on every run. This means no random data, no timestamps, no user-specific content. Use fixed test data and mock any non-deterministic elements (like the current date or user avatar URL).

For teams without Paparazzi, Compose Preview screenshots offer a lighter-weight alternative. You define `@Preview` composables and capture their rendered output during CI. This leverages the previews you've already written for development, adding regression detection without extra test code.

```kotlin
// Paparazzi screenshot test setup
class ButtonScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5,
        theme = "Theme.Material3"
    )

    @Test
    fun `primary button default state`() {
        paparazzi.snapshot {
            PrimaryButton(text = "Submit", onClick = {})
        }
    }

    @Test
    fun `primary button disabled state`() {
        paparazzi.snapshot {
            PrimaryButton(text = "Submit", onClick = {}, enabled = false)
        }
    }

    @Test
    fun `primary button loading state`() {
        paparazzi.snapshot {
            PrimaryButton(text = "Submit", onClick = {}, isLoading = true)
        }
    }
}
```

```kotlin
// Screen-level screenshot testing with different states
class ProfileScreenScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5)

    @Test
    fun `loading state`() {
        paparazzi.snapshot {
            ProfileScreen(state = ProfileState.Loading)
        }
    }

    @Test
    fun `loaded state with user data`() {
        paparazzi.snapshot {
            ProfileScreen(
                state = ProfileState.Loaded(
                    testUser(name = "Mukul", email = "mukul@test.com")
                )
            )
        }
    }

    @Test
    fun `error state with retry`() {
        paparazzi.snapshot {
            ProfileScreen(
                state = ProfileState.Error("Network error", isRetryable = true)
            )
        }
    }
}
```

```kotlin
// Design system component screenshots
class DesignSystemScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5)

    @Test
    fun `badge with count`() {
        paparazzi.snapshot {
            NotificationBadge(count = 5)
        }
    }

    @Test
    fun `badge with high count shows 99+`() {
        paparazzi.snapshot {
            NotificationBadge(count = 150)
        }
    }

    @Test
    fun `user avatar with initials`() {
        paparazzi.snapshot {
            UserAvatar(name = "Mukul Jangra", imageUrl = null)
        }
    }

    @Test
    fun `status chip variants`() {
        paparazzi.snapshot {
            Column {
                StatusChip(status = OrderStatus.PENDING)
                StatusChip(status = OrderStatus.SHIPPED)
                StatusChip(status = OrderStatus.DELIVERED)
                StatusChip(status = OrderStatus.CANCELLED)
            }
        }
    }
}
```

#### Common Mistakes

**Using screenshot tests for logic verification.** Screenshot tests verify visual appearance, not behavior. Don't rely on screenshot tests to verify that clicking a button changes state — use functional Compose tests for that.

**Not controlling non-deterministic content.** Random avatars, timestamps, and locale-dependent formatting cause screenshot tests to fail inconsistently. Use fixed test data and mock system-level sources of non-determinism.

**Capturing too many screenshots.** Each screenshot adds to CI time and storage. Focus on design system components and critical screens. Don't screenshot every possible state of every composable.

**Key takeaway:** Use screenshot tests for design system components and critical screen states. They catch visual regressions that functional tests miss. Use Paparazzi for fast JVM-based rendering. Keep test data deterministic for reliable comparisons.

### Quiz: Compose UI Testing

#### What is the difference between `createComposeRule()` and `createAndroidComposeRule<Activity>()`?

- ❌ createComposeRule is for JUnit 4; createAndroidComposeRule is for JUnit 5
- ✅ createComposeRule creates a standalone Compose surface; createAndroidComposeRule launches a real Activity
- ❌ createComposeRule is faster but less accurate
- ❌ They are interchangeable — use either one

> **Explanation:** `createComposeRule()` creates an isolated Compose rendering surface without an Activity — faster and simpler for testing individual composables. `createAndroidComposeRule<Activity>()` launches a real Activity — needed for tests that require navigation, system services, or full application context.

#### What is the difference between `assertDoesNotExist()` and `assertIsNotDisplayed()`?

- ❌ They are the same — both verify the node is not visible
- ✅ `assertDoesNotExist` means the node is not in the semantic tree at all; `assertIsNotDisplayed` means it exists but is not visible
- ❌ `assertDoesNotExist` is for views; `assertIsNotDisplayed` is for composables
- ❌ `assertIsNotDisplayed` is deprecated in favor of `assertDoesNotExist`

> **Explanation:** `assertDoesNotExist()` verifies the node was never composed (e.g., inside an `if` block that evaluates to false). `assertIsNotDisplayed()` means the node exists in the tree but isn't visible (e.g., scrolled off screen or alpha = 0).

#### When should you use screenshot tests vs functional Compose tests?

- ❌ Always use screenshot tests — they catch everything
- ❌ Never use screenshot tests — they're too fragile
- ✅ Use screenshot tests for visual regression detection (design system, critical screens); use functional tests for behavior verification (clicks, state changes)
- ❌ Use screenshot tests only for accessibility verification

> **Explanation:** Screenshot tests and functional tests serve different purposes. Screenshot tests catch visual regressions (colors, spacing, fonts). Functional tests verify behavior (button clicks, state transitions, form validation). Use both strategically.

### Coding Challenge: Test a Complete Compose Screen

Build and test a `TodoScreen` composable that shows a list of todos, allows adding new todos via a text field, toggles completion on tap, and shows an empty state message. Write tests for all states and interactions.

#### Solution

```kotlin
@Composable
fun TodoScreen(
    state: TodoState,
    onAddTodo: (String) -> Unit,
    onToggleTodo: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        // Input section
        var newTodoText by remember { mutableStateOf("") }
        Row {
            TextField(
                value = newTodoText,
                onValueChange = { newTodoText = it },
                placeholder = { Text("Add a todo...") },
                modifier = Modifier.weight(1f).testTag("todo_input")
            )
            Button(
                onClick = {
                    if (newTodoText.isNotBlank()) {
                        onAddTodo(newTodoText)
                        newTodoText = ""
                    }
                },
                modifier = Modifier.testTag("add_button")
            ) { Text("Add") }
        }

        when (state) {
            is TodoState.Loading -> {
                CircularProgressIndicator(modifier = Modifier.testTag("loading"))
            }
            is TodoState.Loaded -> {
                if (state.todos.isEmpty()) {
                    Text("No todos yet!", modifier = Modifier.testTag("empty_state"))
                } else {
                    LazyColumn(modifier = Modifier.testTag("todo_list")) {
                        items(state.todos) { todo ->
                            TodoItem(todo = todo, onToggle = { onToggleTodo(todo.id) })
                        }
                    }
                }
            }
        }
    }
}

class TodoScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `shows empty state when no todos`() {
        composeTestRule.setContent {
            TodoScreen(
                state = TodoState.Loaded(emptyList()),
                onAddTodo = {},
                onToggleTodo = {}
            )
        }
        composeTestRule.onNodeWithTag("empty_state").assertIsDisplayed()
    }

    @Test
    fun `shows todo items`() {
        composeTestRule.setContent {
            TodoScreen(
                state = TodoState.Loaded(listOf(
                    Todo("1", "Buy milk", false),
                    Todo("2", "Walk dog", true)
                )),
                onAddTodo = {},
                onToggleTodo = {}
            )
        }
        composeTestRule.onNodeWithText("Buy milk").assertIsDisplayed()
        composeTestRule.onNodeWithText("Walk dog").assertIsDisplayed()
    }

    @Test
    fun `adding todo calls callback and clears input`() {
        var addedTodo = ""
        composeTestRule.setContent {
            TodoScreen(
                state = TodoState.Loaded(emptyList()),
                onAddTodo = { addedTodo = it },
                onToggleTodo = {}
            )
        }

        composeTestRule.onNodeWithTag("todo_input").performTextInput("New task")
        composeTestRule.onNodeWithTag("add_button").performClick()

        assertEquals("New task", addedTodo)
    }

    @Test
    fun `toggling todo calls callback`() {
        var toggledId = ""
        composeTestRule.setContent {
            TodoScreen(
                state = TodoState.Loaded(listOf(
                    Todo("1", "Buy milk", false)
                )),
                onAddTodo = {},
                onToggleTodo = { toggledId = it }
            )
        }

        composeTestRule.onNodeWithText("Buy milk").performClick()
        assertEquals("1", toggledId)
    }
}
```

---


## Module 8: Integration Testing

Integration tests verify that components work together correctly — that your Room DAO persists and queries data as expected, that your Retrofit client parses JSON responses correctly, that your repository coordinates between network and cache. They sit in the middle of the testing pyramid, catching wiring bugs that unit tests miss while remaining faster and more reliable than full UI tests.

### Lesson 8.1: Room Database Testing

Room is the standard persistence library for Android, and its DAOs contain SQL queries that need testing. Unit tests can verify the logic around database operations, but only integration tests can verify that your SQL queries actually return the correct results with your schema. Room provides an in-memory database builder specifically for testing — it creates a real SQLite database in memory that behaves identically to the production database but is discarded after each test.

The testing pattern is: create an in-memory database, get the DAO, insert test data, query, and assert on the results. The in-memory database is fast (no disk I/O), isolated (each test gets a fresh database), and accurate (real SQLite engine, real Room type converters, real query compilation).

Room queries are where bugs hide. A query like `SELECT * FROM users WHERE is_active = 1 AND created_at > :since ORDER BY name ASC` has multiple potential bugs: the filter condition might be wrong, the date comparison might use the wrong column, the ordering might be descending instead of ascending. Integration tests catch all of these by running the query against a real database with known data.

Type converters deserve their own tests. If you store an enum as an integer, a date as a Long, or a list as JSON, the converter must correctly convert in both directions. A test that inserts an entity with a specific type, retrieves it, and verifies the type is preserved catches converter bugs.

Migration testing is critical for apps that update their database schema between versions. Room's `MigrationTestHelper` creates a database at version N, applies the migration, and opens it at version N+1. Your test should insert data at version N, run the migration, query the data at version N+1, and verify nothing was lost or corrupted.

Transaction testing verifies that multi-operation transactions are atomic. If your DAO has a `@Transaction` method that deletes old data and inserts new data, the test should verify that either both operations succeed or neither does. Simulating a failure mid-transaction and verifying that the database is rolled back catches atomicity bugs.

Testing complex queries — joins, subqueries, window functions, full-text search — requires realistic test data. Create enough entities to exercise the query's logic: multiple users with different statuses, orders across different dates, products in various categories. Simple single-entity tests miss query bugs that only appear with diverse data.

Flow-based DAO queries are a powerful feature that needs testing. `@Query("SELECT * FROM users WHERE is_active = 1") fun observeActiveUsers(): Flow<List<UserEntity>>` emits a new list whenever the `users` table changes. Testing this requires inserting data, collecting the flow emission, modifying data, and collecting the next emission. The test verifies that the Flow reactivity works correctly.

```kotlin
// Basic Room DAO testing
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
    fun `insert and retrieve user by id`() = runTest {
        val entity = UserEntity("1", "Mukul", "mukul@test.com", true)
        userDao.insert(entity)

        val result = userDao.getById("1")

        assertNotNull(result)
        assertEquals("Mukul", result!!.name)
        assertEquals("mukul@test.com", result.email)
    }

    @Test
    fun `getActiveUsers excludes inactive users`() = runTest {
        userDao.insert(UserEntity("1", "Active User", "active@test.com", true))
        userDao.insert(UserEntity("2", "Inactive User", "inactive@test.com", false))
        userDao.insert(UserEntity("3", "Another Active", "active2@test.com", true))

        val activeUsers = userDao.getActiveUsers()

        assertEquals(2, activeUsers.size)
        assertTrue(activeUsers.all { it.isActive })
    }

    @Test
    fun `update user modifies existing record`() = runTest {
        userDao.insert(UserEntity("1", "Old Name", "old@test.com", true))

        userDao.update(UserEntity("1", "New Name", "new@test.com", true))

        val result = userDao.getById("1")
        assertEquals("New Name", result!!.name)
        assertEquals("new@test.com", result.email)
    }

    @Test
    fun `delete removes user from database`() = runTest {
        userDao.insert(UserEntity("1", "Mukul", "mukul@test.com", true))

        userDao.deleteById("1")

        assertNull(userDao.getById("1"))
    }

    @Test
    fun `getById returns null for nonexistent user`() = runTest {
        assertNull(userDao.getById("nonexistent"))
    }
}
```

```kotlin
// Testing complex queries
@RunWith(AndroidJUnit4::class)
class OrderDaoQueryTest {
    private lateinit var database: AppDatabase
    private lateinit var orderDao: OrderDao

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        orderDao = database.orderDao()
    }

    @After
    fun teardown() { database.close() }

    @Test
    fun `getOrdersByDateRange returns orders within range`() = runTest {
        orderDao.insert(OrderEntity("1", "user-1", 100.0, "2024-01-01", "COMPLETED"))
        orderDao.insert(OrderEntity("2", "user-1", 200.0, "2024-02-15", "COMPLETED"))
        orderDao.insert(OrderEntity("3", "user-1", 300.0, "2024-03-30", "COMPLETED"))

        val results = orderDao.getOrdersByDateRange("user-1", "2024-01-15", "2024-03-15")

        assertEquals(1, results.size)
        assertEquals("2", results[0].id)
    }

    @Test
    fun `getTotalSpending sums completed orders only`() = runTest {
        orderDao.insert(OrderEntity("1", "user-1", 100.0, "2024-01-01", "COMPLETED"))
        orderDao.insert(OrderEntity("2", "user-1", 200.0, "2024-01-15", "CANCELLED"))
        orderDao.insert(OrderEntity("3", "user-1", 150.0, "2024-02-01", "COMPLETED"))

        val total = orderDao.getTotalSpending("user-1")

        assertEquals(250.0, total, 0.01)
    }

    @Test
    fun `getOrdersWithItems joins orders and items tables`() = runTest {
        orderDao.insert(OrderEntity("1", "user-1", 100.0, "2024-01-01", "COMPLETED"))
        orderDao.insertItem(OrderItemEntity("item-1", "1", "Widget", 2, 30.0))
        orderDao.insertItem(OrderItemEntity("item-2", "1", "Gadget", 1, 40.0))

        val ordersWithItems = orderDao.getOrdersWithItems("user-1")

        assertEquals(1, ordersWithItems.size)
        assertEquals(2, ordersWithItems[0].items.size)
    }
}
```

```kotlin
// Testing Flow-based DAO queries
@RunWith(AndroidJUnit4::class)
class FlowDaoTest {
    private lateinit var database: AppDatabase
    private lateinit var taskDao: TaskDao

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        taskDao = database.taskDao()
    }

    @After
    fun teardown() { database.close() }

    @Test
    fun `observeTasks emits updates when data changes`() = runTest {
        taskDao.observeAll().test {
            // Initially empty
            assertEquals(emptyList<TaskEntity>(), awaitItem())

            // Insert a task
            taskDao.insert(TaskEntity("1", "Buy milk", false))
            val afterInsert = awaitItem()
            assertEquals(1, afterInsert.size)

            // Update the task
            taskDao.update(TaskEntity("1", "Buy milk", true))
            val afterUpdate = awaitItem()
            assertTrue(afterUpdate[0].isCompleted)

            // Delete the task
            taskDao.deleteById("1")
            assertEquals(emptyList<TaskEntity>(), awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

```kotlin
// Testing type converters
@RunWith(AndroidJUnit4::class)
class TypeConverterTest {
    private lateinit var database: AppDatabase
    private lateinit var eventDao: EventDao

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()
        eventDao = database.eventDao()
    }

    @After
    fun teardown() { database.close() }

    @Test
    fun `enum type converter preserves value`() = runTest {
        eventDao.insert(EventEntity("1", "Meeting", EventType.WORK, 1700000000000L))

        val result = eventDao.getById("1")

        assertEquals(EventType.WORK, result!!.type)
    }

    @Test
    fun `list type converter preserves collection`() = runTest {
        val tags = listOf("kotlin", "android", "testing")
        eventDao.insert(EventEntity("1", "Conference", EventType.WORK, 1700000000000L, tags))

        val result = eventDao.getById("1")

        assertEquals(tags, result!!.tags)
    }
}
```

#### Common Mistakes

**Not closing the database in `@After`.** Leaked in-memory databases consume memory and can cause cascading test failures. Always call `database.close()` in teardown.

**Using `allowMainThreadQueries()` in production.** This flag is for tests only — it lets you run queries synchronously on the main thread. In production, Room queries must run on a background thread.

**Not testing query edge cases.** Does your `getOrdersByDateRange` handle the case where `startDate == endDate`? Does `getTotalSpending` return 0.0 for a user with no orders? Test boundary conditions.

**Key takeaway:** Use Room's in-memory database builder for integration tests. Test complex queries with diverse test data. Test Flow-based DAO queries with Turbine to verify reactivity. Always close the database in teardown.

### Lesson 8.2: MockWebServer for Network Testing

MockWebServer is a local HTTP server that runs in your test process, intercepting network calls and returning predefined responses. It lets you test your Retrofit client, JSON parsing, error handling, and request formatting without hitting real APIs. This makes network tests fast, reliable, and deterministic.

The setup pattern is: create a `MockWebServer`, start it, configure your Retrofit client to use its URL, enqueue responses, make API calls through your real client code, and assert on both the response parsing and the recorded request. MockWebServer records every request it receives, letting you verify that your code sent the correct URL, headers, method, and body.

MockWebServer responses are fully configurable. `MockResponse()` lets you set the HTTP status code, response body, headers, and even simulate network delays. This lets you test success responses (200), client errors (400, 401, 404), server errors (500, 503), empty responses, malformed JSON, slow responses, and connection failures.

Testing error responses is critical because error handling is where most network bugs live. When the API returns a 401 Unauthorized, does your client correctly trigger a token refresh? When it returns a 429 Too Many Requests, does it respect the Retry-After header? When it returns a 500 with a JSON error body, does it parse the error message correctly?

Request verification lets you test that your code sends the correct data. `server.takeRequest()` returns the recorded request, and you can assert on its URL path, query parameters, HTTP method, headers, and body content. This is essential for POST/PUT requests where the request body contains user data that must be formatted correctly.

Simulating network conditions — slow responses, dropped connections, timeouts — tests your app's resilience. `MockResponse().setBodyDelay(5, TimeUnit.SECONDS)` simulates a slow server. `MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START)` simulates a connection failure. These tests verify that your timeout and retry logic works correctly.

MockWebServer supports multiple sequential responses. Enqueue a 401 response followed by a 200 response to test the token-refresh-and-retry flow. Enqueue a series of paginated responses to test pagination logic. The server returns responses in FIFO order, matching the order your code makes requests.

For tests that need the MockWebServer URL before creating the Retrofit client, create the server in `@Before` and build Retrofit with `server.url("/").toString()` as the base URL. This ensures all requests go to the local server instead of the real API.

```kotlin
// Basic MockWebServer testing
class UserApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: UserApi

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()

        val retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()

        api = retrofit.create(UserApi::class.java)
    }

    @After
    fun teardown() {
        server.shutdown()
    }

    @Test
    fun `getUser parses JSON response correctly`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""{"id": "1", "name": "Mukul", "email": "mukul@test.com"}""")
        )

        val user = api.getUser("1")

        assertEquals("1", user.id)
        assertEquals("Mukul", user.name)
        assertEquals("mukul@test.com", user.email)
    }

    @Test
    fun `getUser sends correct request path`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""{"id": "1", "name": "Mukul", "email": "mukul@test.com"}""")
        )

        api.getUser("1")

        val request = server.takeRequest()
        assertEquals("/users/1", request.path)
        assertEquals("GET", request.method)
    }

    @Test
    fun `getUser throws on 404`() = runTest {
        server.enqueue(MockResponse().setResponseCode(404))

        assertThrows<HttpException> {
            api.getUser("nonexistent")
        }
    }

    @Test
    fun `getUser throws on malformed JSON`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("not valid json")
        )

        assertThrows<JsonDataException> {
            api.getUser("1")
        }
    }
}
```

```kotlin
// Testing error responses and retry logic
class ApiErrorHandlingTest {
    private lateinit var server: MockWebServer
    private lateinit var api: UserApi

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()
        api = createApi(server.url("/").toString())
    }

    @After
    fun teardown() { server.shutdown() }

    @Test
    fun `401 response triggers token refresh and retry`() = runTest {
        // First request returns 401
        server.enqueue(MockResponse().setResponseCode(401))
        // After token refresh, retry returns 200
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""{"id": "1", "name": "Mukul", "email": "m@t.com"}""")
        )

        val client = AuthenticatedApiClient(api, FakeTokenRefresher())
        val user = client.getUser("1")

        assertEquals("Mukul", user.name)
        assertEquals(2, server.requestCount) // Original + retry
    }

    @Test
    fun `500 response throws ServerException`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(500)
            .setBody("""{"error": "Internal server error"}""")
        )

        assertThrows<ServerException> {
            api.getUser("1")
        }
    }

    @Test
    fun `timeout throws SocketTimeoutException`() = runTest {
        server.enqueue(MockResponse()
            .setBody("""{"id":"1","name":"Mukul","email":"m@t.com"}""")
            .setBodyDelay(10, TimeUnit.SECONDS) // Longer than client timeout
        )

        assertThrows<SocketTimeoutException> {
            api.getUser("1")
        }
    }
}
```

```kotlin
// Testing POST requests with request body verification
class CreateUserApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: UserApi

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()
        api = createApi(server.url("/").toString())
    }

    @After
    fun teardown() { server.shutdown() }

    @Test
    fun `createUser sends correct JSON body`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(201)
            .setBody("""{"id": "new-1", "name": "Mukul", "email": "m@t.com"}""")
        )

        api.createUser(CreateUserRequest("Mukul", "m@t.com"))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/users", request.path)

        val body = request.body.readUtf8()
        assertTrue(body.contains("\"name\":\"Mukul\""))
        assertTrue(body.contains("\"email\":\"m@t.com\""))
    }

    @Test
    fun `createUser includes auth header`() = runTest {
        server.enqueue(MockResponse().setResponseCode(201).setBody("{}"))

        api.createUser(CreateUserRequest("Mukul", "m@t.com"))

        val request = server.takeRequest()
        assertTrue(request.getHeader("Authorization")!!.startsWith("Bearer "))
    }
}
```

```kotlin
// Testing pagination with multiple responses
class PaginatedApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: ArticleApi

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()
        api = createApi(server.url("/").toString())
    }

    @After
    fun teardown() { server.shutdown() }

    @Test
    fun `fetches multiple pages of articles`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody(
            """{"articles": [{"id":"1","title":"First"}], "hasMore": true}"""
        ))
        server.enqueue(MockResponse().setResponseCode(200).setBody(
            """{"articles": [{"id":"2","title":"Second"}], "hasMore": false}"""
        ))

        val page1 = api.getArticles(page = 1)
        assertEquals(1, page1.articles.size)
        assertTrue(page1.hasMore)

        val page2 = api.getArticles(page = 2)
        assertEquals(1, page2.articles.size)
        assertFalse(page2.hasMore)

        // Verify request paths
        val req1 = server.takeRequest()
        assertTrue(req1.path!!.contains("page=1"))
        val req2 = server.takeRequest()
        assertTrue(req2.path!!.contains("page=2"))
    }
}
```

#### Common Mistakes

**Not shutting down the MockWebServer.** Forgetting `server.shutdown()` in `@After` leaks the server port and can cause "address already in use" errors in subsequent tests.

**Not verifying requests.** MockWebServer lets you verify that your code sent the correct request. Not checking `server.takeRequest()` means you're only testing the response parsing, not the request formatting.

**Using real API endpoints in integration tests.** Tests that hit real APIs are slow, flaky, rate-limited, and non-deterministic. MockWebServer provides the same HTTP behavior without any external dependencies.

**Key takeaway:** Use MockWebServer to test Retrofit clients, JSON parsing, error handling, and request formatting. Test success, error (401, 404, 500), timeout, and malformed response scenarios. Verify both the response parsing AND the request formatting.

### Lesson 8.3: Repository Integration Testing

Repository integration tests verify the coordination between network and cache layers. While unit tests verify each layer in isolation with fakes, integration tests use real implementations (Room DAO, MockWebServer) to catch wiring bugs — incorrect SQL, wrong JSON field names, missing type converters, broken entity mappings.

The typical test pattern creates a real Room database, a real MockWebServer, and a real repository that uses both. The test enqueues API responses, calls repository methods, and verifies that data flows correctly between the network layer (Retrofit), the mapping layer (DTOs to entities to domain models), and the persistence layer (Room).

The most valuable repository integration test is the "fetch and cache" flow. Call `repository.getUser("1")`, verify the API was called, verify the data was cached in Room, and call `getUser("1")` again — this time it should return the cached data without an API call. This test catches bugs in the caching logic that are invisible to unit tests with fakes.

Offline fallback testing is equally important. Set MockWebServer to return an error, verify the repository falls back to cached data, and verify the returned data is stale but not null. This catches bugs where the fallback logic is wired incorrectly — maybe the repository catches the wrong exception type, or the DAO query has a typo.

Repository integration tests are slower than unit tests (they need Room and MockWebServer setup) but much faster than UI tests. They typically run in 100-500ms each, compared to 5ms for unit tests and 2-5 seconds for UI tests. This makes them fast enough to run on every PR.

One practical consideration is test data consistency. The MockWebServer returns JSON DTOs, Room stores entities, and the repository returns domain models. Each layer transforms the data. Your test data must be consistent across all three representations — the JSON field `"user_name"` maps to entity field `name` maps to domain field `name`. Inconsistent test data hides mapping bugs.

Sync logic testing verifies that the repository correctly handles the sync between local and remote data. When local data is newer than remote data, does the repository upload? When remote data is newer, does it download? When both have changes, does it merge correctly? These scenarios require carefully crafted test data with timestamps.

```kotlin
// Repository integration test with real Room and MockWebServer
@RunWith(AndroidJUnit4::class)
class UserRepositoryIntegrationTest {
    private lateinit var database: AppDatabase
    private lateinit var server: MockWebServer
    private lateinit var repository: UserRepositoryImpl

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        server = MockWebServer()
        server.start()

        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(UserApi::class.java)

        repository = UserRepositoryImpl(api, database.userDao())
    }

    @After
    fun teardown() {
        database.close()
        server.shutdown()
    }

    @Test
    fun `getUser fetches from API and caches in Room`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""{"id":"1","name":"Mukul","email":"m@t.com"}""")
        )

        val user = repository.getUser("1")
        assertEquals("Mukul", user.name)

        // Verify cached in Room
        val cached = database.userDao().getById("1")
        assertNotNull(cached)
        assertEquals("Mukul", cached!!.name)
    }

    @Test
    fun `getUser falls back to cache on network error`() = runTest {
        // Pre-populate cache
        database.userDao().insert(UserEntity("1", "Cached Mukul", "m@t.com", true))

        // API returns error
        server.enqueue(MockResponse().setResponseCode(500))

        val user = repository.getUser("1")
        assertEquals("Cached Mukul", user.name)
    }

    @Test
    fun `getUser throws when API fails and no cache`() = runTest {
        server.enqueue(MockResponse().setResponseCode(500))

        assertThrows<Exception> {
            repository.getUser("1")
        }
    }
}
```

```kotlin
// Testing the full data transformation pipeline
@RunWith(AndroidJUnit4::class)
class ArticleRepositoryIntegrationTest {
    private lateinit var database: AppDatabase
    private lateinit var server: MockWebServer
    private lateinit var repository: ArticleRepositoryImpl

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        server = MockWebServer()
        server.start()

        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(ArticleApi::class.java)

        repository = ArticleRepositoryImpl(api, database.articleDao())
    }

    @After
    fun teardown() {
        database.close()
        server.shutdown()
    }

    @Test
    fun `JSON field names map correctly through DTO to entity to domain`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""
                {
                    "article_id": "a-1",
                    "article_title": "Testing on Android",
                    "author_name": "Mukul",
                    "published_at": "2024-01-15T10:00:00Z"
                }
            """)
        )

        val article = repository.getArticle("a-1")

        assertEquals("a-1", article.id)
        assertEquals("Testing on Android", article.title)
        assertEquals("Mukul", article.author)
        assertNotNull(article.publishedAt)
    }

    @Test
    fun `search articles queries API and returns mapped results`() = runTest {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""[
                {"article_id":"1","article_title":"Kotlin Testing","author_name":"Mukul","published_at":"2024-01-15T10:00:00Z"},
                {"article_id":"2","article_title":"Compose Testing","author_name":"Mukul","published_at":"2024-02-01T10:00:00Z"}
            ]""")
        )

        val results = repository.searchArticles("testing")

        assertEquals(2, results.size)
        assertEquals("Kotlin Testing", results[0].title)
        assertEquals("Compose Testing", results[1].title)

        // Verify request
        val request = server.takeRequest()
        assertTrue(request.path!!.contains("query=testing"))
    }
}
```

#### Common Mistakes

**Only testing the happy path.** The most valuable integration tests cover error scenarios — network failure with cache fallback, malformed JSON, missing fields, empty responses. These are the scenarios where unit tests with fakes can't catch bugs.

**Not testing the mapping layer.** If your JSON uses `snake_case` and your Kotlin uses `camelCase`, the mapping annotations (`@Json(name = "...")`) must be correct. Integration tests catch annotation typos that unit tests miss.

**Creating test data that's too simple.** A single entity doesn't exercise joins, pagination, or complex queries. Use diverse test data that exercises every code path in your queries and mappings.

**Key takeaway:** Repository integration tests verify the real wiring between API, mapping, and database layers. Test the fetch-and-cache flow, offline fallback, and data transformation pipeline. Use real Room + MockWebServer, not fakes.

### Lesson 8.4: End-to-End Feature Testing

End-to-end (E2E) feature tests verify a complete user flow from UI to database and back. Unlike unit tests that verify individual components or integration tests that verify component pairs, E2E tests verify the entire stack — the user taps a button, the ViewModel processes the action, the repository fetches data, Room persists it, and the UI updates to show the result.

E2E tests sit at the top of the testing pyramid and should be used sparingly — only for critical user flows like login, checkout, onboarding, and core feature interactions. They're slower to run (seconds per test), more complex to set up (need all layers configured), and more prone to flakiness (more moving parts). But they catch bugs that no other test type can: wiring bugs between layers, lifecycle issues, navigation bugs, and full-stack data flow problems.

The setup for an E2E test requires the full dependency graph — real ViewModels, real repositories, real Room database, MockWebServer for network calls. Hilt test infrastructure (`@HiltAndroidTest`) or manual dependency construction can provide this. The test renders a real screen with `createAndroidComposeRule`, interacts with it, and verifies the result on the UI.

E2E tests should follow real user scenarios. "The user opens the app, sees their order list, pulls to refresh, sees updated orders, taps an order to see details, and taps 'Reorder' to add items to their cart." Each step in this scenario exercises a different layer of the stack, and the test verifies the complete flow works end-to-end.

Flakiness management is critical for E2E tests. Use IdlingResources or Compose's automatic idle synchronization to wait for async operations. Avoid hardcoded delays. Retry flaky tests once (but fix the root cause). Run E2E tests separately from unit tests — they should run nightly or on merge, not on every PR.

Test isolation for E2E tests requires resetting all state between tests — clearing the Room database, resetting MockWebServer, clearing shared preferences, and resetting any singleton state. Without isolation, test A's data bleeds into test B, causing flaky failures.

For navigation-based E2E tests, use `createAndroidComposeRule<MainActivity>()` with `NavHost` to test the complete navigation graph. Verify that tapping a list item navigates to the detail screen, that pressing back returns to the list, and that deep links open the correct screen.

```kotlin
// End-to-end feature test
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class OrderFlowE2ETest {
    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Inject lateinit var database: AppDatabase
    @Inject lateinit var server: MockWebServer

    @Before
    fun setup() {
        hiltRule.inject()
        server.start()
    }

    @After
    fun teardown() {
        database.clearAllTables()
        server.shutdown()
    }

    @Test
    fun `user can view orders and navigate to detail`() {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""[{"id":"1","name":"Widget Order","total":49.99,"status":"SHIPPED"}]""")
        )

        // Orders list loads
        composeTestRule.onNodeWithText("Widget Order").assertIsDisplayed()
        composeTestRule.onNodeWithText("$49.99").assertIsDisplayed()

        // Tap to see detail
        composeTestRule.onNodeWithText("Widget Order").performClick()

        // Detail screen shows
        composeTestRule.onNodeWithText("Order Details").assertIsDisplayed()
        composeTestRule.onNodeWithText("SHIPPED").assertIsDisplayed()
    }
}
```

```kotlin
// E2E test for login flow
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class LoginFlowE2ETest {
    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Inject lateinit var server: MockWebServer

    @Before
    fun setup() {
        hiltRule.inject()
        server.start()
    }

    @After
    fun teardown() { server.shutdown() }

    @Test
    fun `successful login navigates to home screen`() {
        server.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""{"token":"abc123","user":{"id":"1","name":"Mukul"}}""")
        )

        composeTestRule.onNodeWithTag("email_field")
            .performTextInput("mukul@test.com")
        composeTestRule.onNodeWithTag("password_field")
            .performTextInput("password123")
        composeTestRule.onNodeWithText("Login").performClick()

        // Should navigate to home
        composeTestRule.onNodeWithText("Welcome, Mukul").assertIsDisplayed()
    }

    @Test
    fun `failed login shows error message`() {
        server.enqueue(MockResponse()
            .setResponseCode(401)
            .setBody("""{"error":"Invalid credentials"}""")
        )

        composeTestRule.onNodeWithTag("email_field")
            .performTextInput("mukul@test.com")
        composeTestRule.onNodeWithTag("password_field")
            .performTextInput("wrongpass")
        composeTestRule.onNodeWithText("Login").performClick()

        composeTestRule.onNodeWithText("Invalid credentials").assertIsDisplayed()
    }
}
```

#### Common Mistakes

**Writing too many E2E tests.** E2E tests are expensive — slow, complex, and flaky. Focus on critical user flows (login, checkout, core feature). Test everything else at the unit and integration level.

**Not isolating test state.** E2E tests that share database state, server state, or preferences are a recipe for flakiness. Clear everything in `@Before` and `@After`.

**Hardcoding delays instead of using synchronization.** `Thread.sleep(2000)` is slow and unreliable. Use Compose's automatic idle waiting, Espresso's IdlingResources, or explicit state assertions.

**Key takeaway:** E2E tests verify complete user flows through all layers. Use them sparingly for critical paths. Isolate test state aggressively. Use real Room + MockWebServer with real ViewModels. Run E2E tests nightly, not on every PR.

### Lesson 8.5: Testing SharedPreferences and DataStore

SharedPreferences and DataStore are the two most common local key-value storage mechanisms in Android apps. They store user settings, feature flags, onboarding state, and cached tokens. Testing these storage layers ensures that your app correctly persists and retrieves user preferences across app restarts and configuration changes.

SharedPreferences testing in instrumented tests uses the real Android SharedPreferences API with a dedicated test file. Create a SharedPreferences instance with a unique name per test to ensure isolation. After each test, clear the preferences to prevent state leakage. This approach tests the real persistence behavior without mocking.

For JVM unit tests, you can't use Android's SharedPreferences directly. Instead, wrap SharedPreferences behind an interface — `UserPreferences` with methods like `getTheme(): String`, `setLanguage(code: String)`, `isOnboardingComplete(): Boolean`. In production, `SharedPrefsUserPreferences` implements this interface using real SharedPreferences. In tests, `FakeUserPreferences` uses a `MutableMap`. This abstraction follows the same pattern used for repositories and other I/O dependencies.

DataStore is Google's modern replacement for SharedPreferences. It provides type-safe, coroutine-based access to stored data. Proto DataStore stores typed objects defined by protocol buffers. Preferences DataStore stores key-value pairs like SharedPreferences but with a coroutine-based API. Both are testable with in-memory implementations.

Testing DataStore requires understanding its Flow-based API. `dataStore.data` returns a `Flow<Preferences>` that emits the current value and all subsequent updates. Turbine is essential for testing DataStore flows — push a value, await the emission, assert on it. DataStore also supports transactions via `dataStore.edit { }`, which should be tested for atomicity.

For DataStore testing in instrumented tests, create a test DataStore with a unique file per test. For JVM unit tests, use an in-memory DataStore created with `PreferenceDataStoreFactory.create(produceFile = { File.createTempFile("test", ".preferences_pb") })`. This gives you a real DataStore implementation without needing an Android device.

Migration testing for DataStore is important when migrating from SharedPreferences. The `SharedPreferencesMigration` class migrates data from SharedPreferences to DataStore on first access. Test that the migration preserves all values, handles missing keys gracefully, and only runs once.

One key testing consideration is DataStore's single-writer principle. Only one DataStore instance should access a given file at a time. In tests, create a new DataStore instance for each test method or use a shared instance with proper cleanup. Violating the single-writer principle causes `CorruptionException` or lost writes.

```kotlin
// Testing with real SharedPreferences (instrumented test)
@RunWith(AndroidJUnit4::class)
class SharedPrefsTest {
    private lateinit var prefs: SharedPreferences

    @Before
    fun setup() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        prefs = context.getSharedPreferences("test_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
    }

    @After
    fun teardown() {
        prefs.edit().clear().commit()
    }

    @Test
    fun `saves and retrieves string value`() {
        prefs.edit().putString("theme", "dark").commit()

        assertEquals("dark", prefs.getString("theme", "light"))
    }

    @Test
    fun `returns default when key is missing`() {
        assertEquals("light", prefs.getString("theme", "light"))
    }

    @Test
    fun `remove key clears value`() {
        prefs.edit().putString("theme", "dark").commit()
        prefs.edit().remove("theme").commit()

        assertEquals("light", prefs.getString("theme", "light"))
    }
}
```

```kotlin
// Interface abstraction for JVM testing
interface UserPreferences {
    fun getTheme(): String
    fun setTheme(theme: String)
    fun isOnboardingComplete(): Boolean
    fun setOnboardingComplete(complete: Boolean)
    fun getLanguage(): String
    fun setLanguage(code: String)
}

class FakeUserPreferences : UserPreferences {
    private val store = mutableMapOf<String, Any>(
        "theme" to "system",
        "onboarding_complete" to false,
        "language" to "en"
    )

    override fun getTheme(): String = store["theme"] as String
    override fun setTheme(theme: String) { store["theme"] = theme }
    override fun isOnboardingComplete(): Boolean = store["onboarding_complete"] as Boolean
    override fun setOnboardingComplete(complete: Boolean) { store["onboarding_complete"] = complete }
    override fun getLanguage(): String = store["language"] as String
    override fun setLanguage(code: String) { store["language"] = code }
}
```

```kotlin
// Testing ViewModel that depends on preferences
class SettingsViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakePrefs = FakeUserPreferences()

    @Test
    fun `loads current theme from preferences`() {
        fakePrefs.setTheme("dark")
        val viewModel = SettingsViewModel(fakePrefs)

        viewModel.loadSettings()

        val state = viewModel.state.value
        assertIs<SettingsState.Loaded>(state)
        assertEquals("dark", state.theme)
    }

    @Test
    fun `changing theme updates preferences`() {
        val viewModel = SettingsViewModel(fakePrefs)
        viewModel.loadSettings()

        viewModel.setTheme("dark")

        assertEquals("dark", fakePrefs.getTheme())
    }

    @Test
    fun `completing onboarding persists flag`() {
        val viewModel = SettingsViewModel(fakePrefs)

        viewModel.completeOnboarding()

        assertTrue(fakePrefs.isOnboardingComplete())
    }
}
```

```kotlin
// Testing DataStore with Flow-based API
class UserPreferencesDataStoreTest {
    private lateinit var dataStore: DataStore<Preferences>

    @Before
    fun setup() {
        dataStore = PreferenceDataStoreFactory.create {
            File.createTempFile("test_prefs", ".preferences_pb")
        }
    }

    @Test
    fun `saves and reads preference value`() = runTest {
        val themeKey = stringPreferencesKey("theme")

        dataStore.edit { prefs ->
            prefs[themeKey] = "dark"
        }

        dataStore.data.test {
            val prefs = awaitItem()
            assertEquals("dark", prefs[themeKey])
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `flow emits updates when preferences change`() = runTest {
        val themeKey = stringPreferencesKey("theme")

        dataStore.data.map { it[themeKey] ?: "system" }.test {
            assertEquals("system", awaitItem()) // Default

            dataStore.edit { it[themeKey] = "dark" }
            assertEquals("dark", awaitItem())

            dataStore.edit { it[themeKey] = "light" }
            assertEquals("light", awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

#### Common Mistakes

**Using real SharedPreferences in JVM unit tests.** SharedPreferences requires the Android framework and doesn't work in `test/`. Wrap it behind an interface and use a `FakeUserPreferences` in unit tests.

**Not clearing preferences between tests.** Shared preference state persists between tests unless explicitly cleared. Always clear in `@Before` or `@After` to ensure test isolation.

**Testing DataStore without Turbine.** DataStore's Flow-based API requires proper Flow testing. Using `first()` only captures the initial value. Use Turbine to verify updates after `edit {}` calls.

**Key takeaway:** Wrap SharedPreferences and DataStore behind interfaces for JVM testability. Use fakes in unit tests, real implementations in instrumented tests. Always clear stored state between tests. Use Turbine for DataStore Flow testing.

### Quiz: Integration Testing

#### Why use an in-memory Room database for testing?

- ❌ In-memory databases are required for Room testing
- ✅ They're fast (no disk I/O), isolated (fresh per test), and accurate (real SQLite engine)
- ❌ In-memory databases use less RAM than on-disk databases
- ❌ Room doesn't support on-disk databases in test environments

> **Explanation:** In-memory databases provide the speed of mocks with the accuracy of real implementations. Each test gets a fresh database, queries run against real SQLite, and type converters are tested for real — but there's no disk I/O overhead.

#### What does MockWebServer allow you to test that unit tests with fakes cannot?

- ❌ Business logic correctness
- ❌ ViewModel state transitions
- ✅ Real HTTP behavior — JSON parsing, request formatting, error codes, timeouts, and retry logic
- ❌ Compose UI rendering

> **Explanation:** MockWebServer provides a real HTTP server that your Retrofit client talks to. This tests the actual JSON serialization/deserialization, HTTP header handling, status code interpretation, and network error handling — none of which can be tested with fakes.

#### When should you write E2E tests instead of unit/integration tests?

- ❌ Always — E2E tests catch the most bugs
- ❌ Never — they're too slow and flaky
- ✅ For critical user flows (login, checkout, onboarding) where you need to verify the full stack works together
- ❌ Only when unit tests are too hard to write

> **Explanation:** E2E tests sit at the top of the pyramid — expensive but valuable for critical paths. They catch wiring bugs, navigation issues, and full-stack data flow problems. Use them sparingly and supplement with comprehensive unit and integration tests.

### Coding Challenge: Build an Integration Test

Write an integration test for an `ArticleRepository` that fetches articles from MockWebServer, caches them in Room, and falls back to cache on network failure. Test the fetch-and-cache flow and the offline fallback.

#### Solution

```kotlin
@RunWith(AndroidJUnit4::class)
class ArticleRepositoryIntegrationTest {
    private lateinit var database: AppDatabase
    private lateinit var server: MockWebServer
    private lateinit var repository: ArticleRepository

    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        server = MockWebServer()
        server.start()

        val api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(ArticleApi::class.java)

        repository = ArticleRepositoryImpl(api, database.articleDao())
    }

    @After
    fun teardown() {
        database.close()
        server.shutdown()
    }

    @Test
    fun `fetches articles and caches them`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody(
            """[{"id":"1","title":"Testing Guide","author":"Mukul"}]"""
        ))

        val articles = repository.getArticles()

        assertEquals(1, articles.size)
        assertEquals("Testing Guide", articles[0].title)

        // Verify cached
        val cached = database.articleDao().getAll()
        assertEquals(1, cached.size)
    }

    @Test
    fun `returns cached articles on network failure`() = runTest {
        // First call succeeds and caches
        server.enqueue(MockResponse().setResponseCode(200).setBody(
            """[{"id":"1","title":"Cached Article","author":"Mukul"}]"""
        ))
        repository.getArticles()

        // Second call fails — should return cached data
        server.enqueue(MockResponse().setResponseCode(500))
        val articles = repository.getArticles()

        assertEquals(1, articles.size)
        assertEquals("Cached Article", articles[0].title)
    }

    @Test
    fun `throws when no cache and network fails`() = runTest {
        server.enqueue(MockResponse().setResponseCode(500))

        assertThrows<Exception> {
            repository.getArticles()
        }
    }
}
```

---


## Module 9: Test Architecture and Organization

A well-organized test suite is as important as a well-organized codebase. When your project has 500+ tests, the structure, naming, and shared infrastructure determine whether the test suite is an asset or a liability. This module covers test organization patterns, shared test fixtures, multi-module test architecture, and strategies for keeping your test suite maintainable as it grows.

### Lesson 9.1: Test Directory Structure

Your test files should mirror your production source structure. If production code lives in `com.app.feature.login.LoginViewModel`, the test should live in `com.app.feature.login.LoginViewModelTest`. This 1:1 mapping makes it trivial to navigate between production code and tests — every developer knows exactly where to find the test for any class.

Android projects have two test source sets: `test/` for JVM unit tests and `androidTest/` for instrumented tests. JVM tests run on your development machine without an Android device — they're fast (milliseconds), lightweight (no emulator), and ideal for ViewModels, use cases, repositories, mappers, and validators. Instrumented tests run on a device or emulator — they're slower but necessary for Room DAOs, Compose UI, and anything that needs the Android framework.

The general rule is: put everything possible in `test/` and only use `androidTest/` when you genuinely need the Android framework. ViewModels, use cases, and pure functions go in `test/`. Room DAO tests, Compose UI tests, and E2E tests go in `androidTest/`. This maximizes the fast, reliable tests and minimizes the slow, flaky ones.

Within each test source set, organize tests by feature, not by type. Don't create `test/unit/` and `test/integration/` — create `test/feature/login/`, `test/feature/orders/`, `test/feature/profile/`. This feature-based organization keeps related tests together and makes it easy to find all tests for a specific feature.

For shared test infrastructure — fakes, fixtures, rules, and utilities — create a `testFixtures` source set or a shared `testing` module. This prevents test code duplication and ensures all tests use the same fakes and fixtures. In a multi-module project, each module depends on the shared testing module.

Test file naming follows a simple convention: `{ClassUnderTest}Test`. `LoginViewModel` → `LoginViewModelTest`. `OrderRepository` → `OrderRepositoryTest`. `PriceFormatter` → `PriceFormatterTest`. For large classes with many tests, split into focused test classes: `LoginViewModelValidationTest`, `LoginViewModelNavigationTest`, `LoginViewModelAnalyticsTest`.

Gradle configuration for test dependencies should be consistent across modules. Create a shared `testing-dependencies.gradle` or use a convention plugin that applies all test dependencies (JUnit, Truth, Turbine, Coroutines Test, MockK) uniformly. This prevents "it works in module A but not module B" issues.

Test resources (JSON fixtures, test data files) go in `test/resources/` or `androidTest/assets/`. Organize them by feature, mirroring the test structure. A JSON response fixture for `UserApiTest` goes in `test/resources/fixtures/user_api_response.json`.

```kotlin
// Directory structure example
// src/
//   main/
//     com/app/feature/login/
//       LoginViewModel.kt
//       LoginRepository.kt
//       LoginScreen.kt
//   test/
//     com/app/feature/login/
//       LoginViewModelTest.kt
//       LoginRepositoryTest.kt
//     com/app/testing/
//       fakes/
//         FakeAuthRepository.kt
//         FakeSessionManager.kt
//       fixtures/
//         TestFixtures.kt
//       rules/
//         MainDispatcherRule.kt
//   androidTest/
//     com/app/feature/login/
//       LoginScreenTest.kt  // Compose UI test
//       LoginFlowE2ETest.kt // End-to-end test
```

```kotlin
// Shared test module structure
// :testing module
// com/app/testing/
//   fakes/
//     FakeUserRepository.kt
//     FakeAuthRepository.kt
//     FakeAnalytics.kt
//   fixtures/
//     UserFixtures.kt
//     OrderFixtures.kt
//   rules/
//     MainDispatcherRule.kt
//     MockWebServerRule.kt

// Any module can depend on :testing
// build.gradle.kts:
// testImplementation(project(":testing"))
```

```kotlin
// Convention plugin for test dependencies
// buildSrc/src/main/kotlin/testing-conventions.gradle.kts
dependencies {
    "testImplementation"("junit:junit:4.13.2")
    "testImplementation"("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    "testImplementation"("app.cash.turbine:turbine:1.0.0")
    "testImplementation"("org.jetbrains.kotlin:kotlin-test:1.9.0")
}
```

```kotlin
// Test resource loading for JSON fixtures
class ArticleApiTest {
    private fun loadJsonFixture(filename: String): String {
        return javaClass.classLoader!!
            .getResource("fixtures/$filename")!!
            .readText()
    }

    @Test
    fun `parses complex article response`() = runTest {
        val json = loadJsonFixture("article_response.json")
        server.enqueue(MockResponse().setResponseCode(200).setBody(json))

        val article = api.getArticle("1")
        assertEquals("Testing on Android", article.title)
    }
}
```

#### Common Mistakes

**Putting all tests in a single flat directory.** When you have 200 test files in one directory, finding anything requires search. Mirror the production package structure for instant navigation.

**Duplicating fakes across modules.** If three feature modules each define their own `FakeUserRepository`, you maintain three copies. Extract shared fakes into a `testing` module.

**Mixing JVM and instrumented tests.** ViewModel tests in `androidTest/` run 100x slower than in `test/`. Only use `androidTest/` when the Android framework is genuinely required (Room, Compose, system services).

**Key takeaway:** Mirror production structure in test directories. Use `test/` for JVM tests and `androidTest/` only when Android is required. Share fakes and fixtures through a common testing module. Name test files `{ClassUnderTest}Test`.

### Lesson 9.2: Shared Test Fixtures Module

A shared test fixtures module centralizes fakes, factory functions, test rules, and utilities that are used across multiple test files and modules. Instead of each test defining its own `FakeUserRepository`, everyone imports it from the shared module. This ensures consistency, reduces duplication, and makes maintaining test infrastructure efficient.

The shared module typically contains four categories of code: fakes (test doubles for common interfaces), fixtures (factory functions for test data), rules (JUnit rules like `MainDispatcherRule`), and utilities (assertion helpers, extension functions, test builders). Each category lives in its own package for easy discovery.

Fakes in the shared module implement the same interfaces your production code uses — `UserRepository`, `AnalyticsTracker`, `SessionManager`. They use in-memory storage, support configurable failure modes, and provide inspection methods for assertions. When a new developer joins the team, they find all available fakes in one place and don't need to build their own.

Fixtures provide factory functions for domain objects. `testUser()`, `testOrder()`, `testArticle()` all have sensible defaults that can be overridden per test. These functions use Kotlin default parameters for maximum flexibility: `testUser(name = "Mukul", isPremium = true)` creates a premium user with all other fields set to defaults.

Test rules encapsulate reusable test setup. `MainDispatcherRule` handles dispatcher swapping. `MockWebServerRule` manages server lifecycle. `TestDatabaseRule` creates and destroys in-memory databases. Rules compose well — a test class can use multiple rules to get all the infrastructure it needs without any manual setup.

The shared module should be versioned alongside the production code. When a production interface changes (new method, changed return type), the corresponding fake in the shared module must be updated simultaneously. CI should enforce that the shared module compiles with every PR.

For multi-module Android projects, the shared testing module is a leaf dependency — it depends on no feature modules but is depended on by all feature modules' test configurations. This prevents circular dependencies and keeps the testing module lightweight.

Code ownership of the shared testing module matters. One or two senior engineers should own the module, reviewing PRs that add or modify fakes and fixtures. This prevents the module from becoming a dumping ground for random test utilities and ensures consistent quality.

```kotlin
// Comprehensive shared fixtures file
// testing/src/main/kotlin/com/app/testing/fixtures/UserFixtures.kt
object UserFixtures {
    fun testUser(
        id: String = "user-1",
        name: String = "Test User",
        email: String = "test@example.com",
        isPremium: Boolean = false,
        createdAt: Long = 1_700_000_000_000L,
        avatarUrl: String? = null
    ): User = User(id, name, email, isPremium, createdAt, avatarUrl)

    fun premiumUser(
        id: String = "premium-1",
        name: String = "Premium User"
    ): User = testUser(id = id, name = name, isPremium = true)

    fun guestUser(): User = testUser(id = "guest", name = "Guest", email = "")
}
```

```kotlin
// Shared fake repository
// testing/src/main/kotlin/com/app/testing/fakes/FakeUserRepository.kt
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    private val _usersFlow = MutableStateFlow<List<User>>(emptyList())

    var shouldFail = false
    var failureException: Exception = IOException("Network error")

    // Setup helpers
    fun addUser(user: User) {
        users[user.id] = user
        _usersFlow.value = users.values.toList()
    }

    fun clear() {
        users.clear()
        _usersFlow.value = emptyList()
        shouldFail = false
    }

    // Interface implementation
    override suspend fun getUser(id: String): User {
        if (shouldFail) throw failureException
        return users[id] ?: throw UserNotFoundException(id)
    }

    override suspend fun saveUser(user: User) {
        if (shouldFail) throw failureException
        users[user.id] = user
        _usersFlow.value = users.values.toList()
    }

    override suspend fun deleteUser(id: String) {
        if (shouldFail) throw failureException
        users.remove(id)
        _usersFlow.value = users.values.toList()
    }

    override fun observeUsers(): Flow<List<User>> = _usersFlow
}
```

```kotlin
// Shared test rule for MainDispatcher
// testing/src/main/kotlin/com/app/testing/rules/MainDispatcherRule.kt
class MainDispatcherRule(
    val testDispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(testDispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}
```

```kotlin
// Shared assertion helpers
// testing/src/main/kotlin/com/app/testing/assertions/FlowAssertions.kt
suspend fun <T> Flow<T>.assertFirstEmission(expected: T) {
    val first = this.first()
    assertEquals(expected, first)
}

suspend fun <T> StateFlow<T>.assertValueEquals(expected: T) {
    assertEquals(expected, this.value)
}

fun SpyAnalytics.assertTracked(eventName: String) {
    assertTrue(
        trackedEvents.any { it.name == eventName },
        "Expected event '$eventName' to be tracked. Tracked events: ${trackedEvents.map { it.name }}"
    )
}

fun SpyAnalytics.assertNotTracked(eventName: String) {
    assertFalse(
        trackedEvents.any { it.name == eventName },
        "Event '$eventName' should not have been tracked"
    )
}
```

#### Common Mistakes

**Making the testing module too large.** If the testing module has 200 files, it's doing too much. Keep it focused on shared infrastructure. Feature-specific test utilities should live in the feature module's test sources.

**Not keeping fakes in sync with production interfaces.** When you add a method to `UserRepository`, the `FakeUserRepository` must be updated. CI should catch compilation errors, but code review should verify the fake's behavior is correct.

**Storing test data in the shared module that's feature-specific.** Test data for "order with 3 items and a promo code" belongs in the orders feature test, not in the shared module. The shared module should have generic fixtures; features have specific scenarios.

**Key takeaway:** Centralize fakes, fixtures, rules, and utilities in a shared testing module. Keep it focused on broadly-reused infrastructure. Ensure fakes stay in sync with production interfaces. Use Kotlin default parameters in fixture factory functions.

### Lesson 9.3: Test Naming Conventions and Documentation

Consistent test naming across your entire codebase turns your test suite into living documentation. When every test follows the same naming pattern, a CI failure report reads like a feature specification. When naming is inconsistent, failure triage requires reading test code to understand what each test actually verifies.

The recommended naming pattern for Android/Kotlin tests uses backtick syntax with natural English: `action + condition + expected result`. Examples: `login with valid credentials navigates to home`, `search with empty query returns empty list`, `loadProfile on network error shows cached data`. This pattern is readable, specific, and diagnostic — a failing test name tells you exactly what's broken.

Avoid naming tests after methods being called. `testGetUser()` tells you nothing. `getUser with valid ID returns user from cache` tells you everything — the method, the condition, and the expected behavior. When this test fails, you know the caching logic is broken without reading a single line of test code.

For test class documentation, add a class-level KDoc comment that describes what the class tests and any important setup details. `/** Tests for [LoginViewModel] focusing on credential validation and authentication flow. Uses [FakeAuthRepository] with configurable credentials and failure modes. */` This helps new team members understand the test's purpose and setup.

Group related tests within a class using comments or nested classes. A `LoginViewModelTest` might have groups for "Happy Path", "Validation Errors", "Network Errors", and "Analytics Events." Each group is a logical section that can be scanned quickly when looking for a specific test.

For test documentation, each test should be self-explanatory from its name alone. If you feel the need to add a comment explaining what a test does, the test name isn't descriptive enough. Rename the test instead of adding a comment.

When the test suite serves as documentation, product managers and QA engineers can read the test names to understand what the system does. `login with expired token shows re-authentication prompt` is a specification that both developers and non-developers can understand. This bridges the gap between code and requirements.

```kotlin
// Well-documented test class
/**
 * Tests for [LoginViewModel] credential validation and authentication flow.
 *
 * Uses [FakeAuthRepository] for authentication and [SpyAnalytics] for
 * event tracking verification. All tests use [MainDispatcherRule] for
 * coroutine control.
 */
class LoginViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeAuth = FakeAuthRepository()
    private val spyAnalytics = SpyAnalytics()

    private fun createViewModel() = LoginViewModel(fakeAuth, spyAnalytics)

    // --- Happy Path ---

    @Test
    fun `login with valid credentials transitions to success state`() = runTest {
        fakeAuth.addValidCredentials("mukul@test.com", "pass123")
        val viewModel = createViewModel()

        viewModel.login("mukul@test.com", "pass123")

        assertIs<LoginState.Success>(viewModel.state.value)
    }

    @Test
    fun `login with valid credentials tracks success analytics event`() = runTest {
        fakeAuth.addValidCredentials("mukul@test.com", "pass123")
        val viewModel = createViewModel()

        viewModel.login("mukul@test.com", "pass123")

        spyAnalytics.assertTracked("login_success")
    }

    // --- Validation Errors ---

    @Test
    fun `login with empty email shows email required error`() {
        val viewModel = createViewModel()

        viewModel.login("", "password")

        val state = viewModel.state.value
        assertIs<LoginState.ValidationError>(state)
        assertEquals("Email is required", state.emailError)
    }

    @Test
    fun `login with invalid email format shows format error`() {
        val viewModel = createViewModel()

        viewModel.login("not-an-email", "password")

        val state = viewModel.state.value
        assertIs<LoginState.ValidationError>(state)
        assertEquals("Invalid email format", state.emailError)
    }

    // --- Network Errors ---

    @Test
    fun `login on network error shows retry option`() = runTest {
        fakeAuth.shouldFail = true
        val viewModel = createViewModel()

        viewModel.login("mukul@test.com", "pass123")

        val state = viewModel.state.value
        assertIs<LoginState.Error>(state)
        assertTrue(state.isRetryable)
    }
}
```

```kotlin
// Bad naming vs good naming comparison
class NamingComparisonTest {
    // BAD — tells you nothing
    @Test fun test1() { /* ... */ }
    @Test fun testLogin() { /* ... */ }
    @Test fun `test get user`() { /* ... */ }

    // BAD — describes implementation
    @Test fun `calls repository authenticate`() { /* ... */ }
    @Test fun `sets state to loading then success`() { /* ... */ }

    // GOOD — describes behavior
    @Test fun `login with valid credentials navigates to home`() { /* ... */ }
    @Test fun `expired session redirects to login screen`() { /* ... */ }
    @Test fun `empty cart disables checkout button`() { /* ... */ }
    @Test fun `search with special characters returns empty results`() { /* ... */ }
    @Test fun `pull to refresh loads fresh data from API`() { /* ... */ }
}
```

#### Common Mistakes

**Inconsistent naming styles across the codebase.** If some tests use `camelCase`, others use `snake_case`, and others use backtick syntax, the test suite looks unprofessional and is harder to scan. Pick one style (backtick syntax recommended) and enforce it.

**Test names that describe the implementation, not the behavior.** `calls repository then sets state` breaks when you refactor. `login shows user profile` survives refactoring because the behavior didn't change.

**Not grouping related tests.** A test class with 40 randomly ordered tests is painful to navigate. Group by behavior category (happy path, errors, edge cases) with clear section comments.

**Key takeaway:** Use backtick syntax with the pattern `action + condition + expected result`. Tests should read like feature specifications. Group related tests with comments. A good test name makes reading the test code unnecessary for failure triage.

### Lesson 9.4: Test Coverage Strategy

Test coverage is not about reaching a magic number — it's about covering the code that matters. 80% line coverage means nothing if the critical business logic (pricing, permissions, data validation) is in the untested 20%. A strategic coverage approach focuses testing effort on high-risk code and accepts lower coverage on low-risk boilerplate.

The highest-value code to cover is business logic — the functions that make decisions. Pricing calculations, eligibility checks, discount rules, permission logic, and data validation are where production bugs live. These are typically pure functions that are trivially testable. Covering them with exhaustive tests catches the bugs that hurt users and cost money.

The second-highest-value code is ViewModel orchestration — the code that coordinates data loading, state management, and user interaction. ViewModel bugs affect the user experience directly: loading spinners that never disappear, error messages that don't show, stale data that isn't refreshed. ViewModel tests verify the complete user-facing flow.

The lowest-value code to cover is boilerplate — Hilt modules, Room entity definitions, navigation graph setup, theme definitions. These files have no logic, just configuration. Covering them adds to coverage percentage but catches zero bugs. Exclude them from coverage reports to keep the signal clean.

Branch coverage is more useful than line coverage. Line coverage tells you which lines were executed. Branch coverage tells you which decision paths were taken. A function with `if (condition) A else B` has 100% line coverage if you only test the `A` path — but you missed the `B` path entirely. Branch coverage would show 50%, correctly indicating incomplete testing.

Coverage thresholds should vary by code category. For business logic, target 90%+ branch coverage. For ViewModels, target 80%+ line coverage. For repositories, target 70%+ line coverage (integration tests cover the rest). For UI code, target 50%+ with Compose tests for critical screens. Don't apply a single threshold to the entire codebase.

Mutation testing is the gold standard for assessing test quality. It makes small changes to your production code (e.g., changing `>` to `>=`, removing a `return` statement) and runs your tests. If the tests still pass after the mutation, they're not catching the bug. Mutation testing reveals "weak tests" that have high coverage but low effectiveness.

Coverage reports should be part of your CI pipeline. Generate reports on every PR and track trends over time. A coverage drop on a PR means new code was added without tests. A coverage increase means someone added tests for previously uncovered code. Trend tracking is more valuable than absolute numbers.

```kotlin
// High-value code to cover: business logic
class PricingEngine {
    fun calculateFinalPrice(
        basePrice: Double,
        quantity: Int,
        memberTier: MemberTier,
        promoCode: PromoCode?
    ): PriceBreakdown {
        val subtotal = basePrice * quantity
        val memberDiscount = when (memberTier) {
            MemberTier.BRONZE -> 0.0
            MemberTier.SILVER -> subtotal * 0.05
            MemberTier.GOLD -> subtotal * 0.10
            MemberTier.PLATINUM -> subtotal * 0.15
        }
        val promoDiscount = promoCode?.let {
            when (it.type) {
                PromoType.PERCENTAGE -> (subtotal - memberDiscount) * it.value / 100
                PromoType.FIXED -> minOf(it.value, subtotal - memberDiscount)
            }
        } ?: 0.0
        val total = subtotal - memberDiscount - promoDiscount
        return PriceBreakdown(subtotal, memberDiscount, promoDiscount, total)
    }
}

// Exhaustive tests for all branches
class PricingEngineTest {
    private val engine = PricingEngine()

    @Test fun `bronze member gets no discount`() {
        val result = engine.calculateFinalPrice(100.0, 1, MemberTier.BRONZE, null)
        assertEquals(0.0, result.memberDiscount, 0.01)
        assertEquals(100.0, result.total, 0.01)
    }

    @Test fun `silver member gets 5 percent discount`() {
        val result = engine.calculateFinalPrice(100.0, 1, MemberTier.SILVER, null)
        assertEquals(5.0, result.memberDiscount, 0.01)
        assertEquals(95.0, result.total, 0.01)
    }

    @Test fun `gold member gets 10 percent discount`() {
        val result = engine.calculateFinalPrice(100.0, 1, MemberTier.GOLD, null)
        assertEquals(10.0, result.memberDiscount, 0.01)
    }

    @Test fun `platinum member gets 15 percent discount`() {
        val result = engine.calculateFinalPrice(100.0, 1, MemberTier.PLATINUM, null)
        assertEquals(15.0, result.memberDiscount, 0.01)
    }

    @Test fun `percentage promo code applies after member discount`() {
        val promo = PromoCode("SAVE10", PromoType.PERCENTAGE, 10.0)
        val result = engine.calculateFinalPrice(100.0, 1, MemberTier.SILVER, promo)
        assertEquals(5.0, result.memberDiscount, 0.01)
        assertEquals(9.5, result.promoDiscount, 0.01) // 10% of (100 - 5)
        assertEquals(85.5, result.total, 0.01)
    }

    @Test fun `fixed promo code caps at remaining amount`() {
        val promo = PromoCode("FLAT50", PromoType.FIXED, 50.0)
        val result = engine.calculateFinalPrice(30.0, 1, MemberTier.BRONZE, promo)
        assertEquals(30.0, result.promoDiscount, 0.01) // Capped at subtotal
        assertEquals(0.0, result.total, 0.01)
    }

    @Test fun `quantity multiplies base price`() {
        val result = engine.calculateFinalPrice(10.0, 5, MemberTier.BRONZE, null)
        assertEquals(50.0, result.subtotal, 0.01)
    }

    @Test fun `no promo code means zero promo discount`() {
        val result = engine.calculateFinalPrice(100.0, 1, MemberTier.GOLD, null)
        assertEquals(0.0, result.promoDiscount, 0.01)
    }
}
```

#### Common Mistakes

**Chasing a coverage number without testing important code.** 90% coverage with all business logic untested is worse than 60% coverage with all business logic thoroughly tested. Focus on value, not numbers.

**Measuring coverage but never looking at the report.** Coverage reports show which lines and branches are untested. Review them to find gaps in business logic coverage, then add targeted tests.

**Excluding too much from coverage.** Excluding generated code (Hilt, Room) from coverage is appropriate. Excluding entire packages because "they're too hard to test" is a design smell — refactor for testability instead.

**Key takeaway:** Cover business logic exhaustively (90%+ branch coverage). Cover ViewModels thoroughly (80%+). Exclude boilerplate from reports. Use branch coverage, not just line coverage. Track coverage trends in CI.

### Lesson 9.5: Managing Test Flakiness

Flaky tests — tests that pass sometimes and fail sometimes with the same code — are the most insidious problem in a test suite. A single flaky test can destroy an entire team's confidence in testing. When developers learn to "just re-run CI when it's red," the test suite becomes useless because nobody investigates real failures.

The most common cause of flakiness in Android tests is timing sensitivity. Tests that use `Thread.sleep()`, depend on real system clocks, or don't properly wait for async operations are inherently non-deterministic. The fix is deterministic timing: use `runTest` with virtual time, use Turbine's `awaitItem()` for Flow emissions, use Compose test rule's automatic idle synchronization.

The second most common cause is shared mutable state. When tests share a singleton, a companion object property, or a static variable, test execution order matters. Test A modifies the shared state, test B reads it. If they run in order A→B, tests pass. If they run in order B→A (or in parallel), tests fail. The fix is isolation: each test creates its own instances, and `@Before`/`@After` reset any shared state.

The third cause is environment dependency. Tests that depend on network connectivity, specific locale, timezone, device screen size, or API key availability fail when the environment changes. The fix is environment independence: mock all external dependencies, specify locale and timezone explicitly, and don't depend on anything outside the test process.

When a test becomes flaky, the first response should be investigation, not quarantine. Understand why it's flaky — is it timing, shared state, or environment? Fix the root cause. If the fix is complex, quarantine the test temporarily with a clear deadline for fixing it. Never just ignore flaky tests — they erode trust exponentially.

A flakiness tracking dashboard monitors test stability over time. Track which tests fail sporadically, how often they fail, and when the flakiness started. This data helps prioritize fixes — a test that fails 5% of the time is less urgent than one that fails 30% of the time.

Retry mechanisms in CI can mask flakiness by re-running failed tests. This is a pragmatic short-term fix for important CI pipelines, but it must be combined with tracking. Every retried test should be logged and prioritized for investigation. Without tracking, retries hide the problem until it gets worse.

Parallel test execution amplifies shared state bugs. When tests run sequentially, shared state bugs might not manifest. When tests run in parallel (for faster CI), every shared state becomes a race condition. Design tests for parallel execution from the start: no shared mutable state, no test ordering dependencies, no port conflicts.

```kotlin
// Flaky: depends on real time
class FlakyTimingTest {
    @Test
    fun `flaky — depends on Thread sleep`() = runTest {
        val viewModel = ProfileViewModel(FakeUserRepository())
        viewModel.loadProfile("1")
        Thread.sleep(100) // Might not be enough on slow CI
        assertIs<ProfileState.Loaded>(viewModel.state.value) // FLAKY
    }

    @Test
    fun `stable — uses advanceUntilIdle`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(testUser(id = "1"))
        val viewModel = ProfileViewModel(fakeRepo)
        viewModel.loadProfile("1")
        advanceUntilIdle() // Deterministic
        assertIs<ProfileState.Loaded>(viewModel.state.value) // STABLE
    }
}
```

```kotlin
// Flaky: shared mutable state
class FlakySharedStateTest {
    // BAD — shared across all tests in the class
    companion object {
        val sharedCounter = AtomicInteger(0) // Shared mutable state!
    }

    @Test fun `test A increments counter`() {
        sharedCounter.incrementAndGet()
        assertEquals(1, sharedCounter.get()) // Fails if test B runs first
    }

    @Test fun `test B reads counter`() {
        assertEquals(0, sharedCounter.get()) // Fails if test A runs first
    }
}

// FIXED — each test has its own state
class StableIsolatedTest {
    private var counter = 0 // Fresh for each test instance

    @Test fun `test A increments counter`() {
        counter++
        assertEquals(1, counter) // Always passes
    }

    @Test fun `test B reads counter`() {
        assertEquals(0, counter) // Always passes
    }
}
```

```kotlin
// Flaky: depends on system locale
class FlakyLocaleTest {
    @Test
    fun `flaky — depends on default locale`() {
        val formatter = NumberFormat.getCurrencyInstance()
        val result = formatter.format(9.99)
        assertEquals("$9.99", result) // Fails on non-US locale
    }

    @Test
    fun `stable — specifies locale explicitly`() {
        val formatter = NumberFormat.getCurrencyInstance(Locale.US)
        val result = formatter.format(9.99)
        assertEquals("$9.99", result) // Always passes
    }
}
```

#### Common Mistakes

**Ignoring flaky tests.** Every flaky test that goes unfixed teaches developers to ignore red CI. This is the beginning of the end for your test suite. Fix flaky tests immediately or quarantine them with a deadline.

**Using `Thread.sleep()` in tests.** Real time waits are inherently flaky because execution speed varies between machines. Use `runTest`, `advanceUntilIdle()`, Turbine's `awaitItem()`, and Compose's automatic idle synchronization.

**Retrying without tracking.** CI retry mechanisms mask flakiness. Without tracking which tests are retried and how often, you can't prioritize fixes. Always log retries.

**Key takeaway:** Flaky tests destroy trust in your test suite. Root causes are timing sensitivity, shared mutable state, and environment dependency. Fix root causes; don't just quarantine or retry. Use deterministic timing, test isolation, and explicit environment configuration.

### Quiz: Test Architecture and Organization

#### Where should ViewModel tests live — `test/` or `androidTest/`?

- ✅ `test/` — ViewModels are pure JVM classes that don't need the Android framework
- ❌ `androidTest/` — ViewModels use viewModelScope which requires Android
- ❌ Either one works — there's no practical difference
- ❌ ViewModels shouldn't be tested directly

> **Explanation:** With `MainDispatcherRule` replacing `Dispatchers.Main`, ViewModels can be tested as pure JVM tests in the `test/` source set. They run in milliseconds without an emulator, making TDD practical.

#### What is the primary benefit of a shared testing module?

- ❌ It speeds up test compilation by 50%
- ❌ It enables parallel test execution
- ✅ It centralizes fakes, fixtures, and rules to prevent duplication and ensure consistency
- ❌ It provides automatic test generation

> **Explanation:** A shared testing module prevents every feature module from defining its own `FakeUserRepository` with slightly different behavior. Consistency across fakes and fixtures makes the test suite predictable and maintainable.

#### What is the most common cause of test flakiness?

- ❌ Using the wrong assertion library
- ✅ Timing sensitivity — using `Thread.sleep()`, real clocks, or not waiting for async operations
- ❌ Having too many tests in one class
- ❌ Using Kotlin instead of Java for tests

> **Explanation:** Timing-sensitive tests depend on real time, which varies between machines and runs. The fix is deterministic timing: `runTest` with virtual time, Turbine's `awaitItem()`, and Compose's automatic idle synchronization.

### Coding Challenge: Organize a Test Suite

Given an unorganized test directory with 20+ test files in a flat structure, reorganize it to match production package structure, extract shared fakes into a testing module, and rename tests to follow the `action + condition + result` pattern.

#### Solution

```kotlin
// Before: flat, disorganized test directory
// test/
//   Tests.kt (500 lines, mixed concerns)
//   MoreTests.kt
//   HelperTests.kt

// After: organized by feature with shared module
// testing/src/main/kotlin/com/app/testing/
//   fakes/FakeUserRepository.kt
//   fakes/FakeOrderRepository.kt
//   fakes/SpyAnalytics.kt
//   fixtures/UserFixtures.kt
//   fixtures/OrderFixtures.kt
//   rules/MainDispatcherRule.kt

// test/com/app/feature/login/
//   LoginViewModelTest.kt
//   LoginValidatorTest.kt

// test/com/app/feature/orders/
//   OrderListViewModelTest.kt
//   OrderRepositoryTest.kt
//   OrderPricingTest.kt

// test/com/app/feature/profile/
//   ProfileViewModelTest.kt
//   ProfileFormatterTest.kt

// Before: bad test names
// @Test fun test1() { ... }
// @Test fun testLogin() { ... }
// @Test fun loginTest_success() { ... }

// After: descriptive behavior-based names
// @Test fun `login with valid credentials navigates to home`() { ... }
// @Test fun `login with empty email shows validation error`() { ... }
// @Test fun `login on network error shows retry option`() { ... }
```

This restructuring follows the principles from the lesson: mirror production structure, share fakes through a common module, and use descriptive test names that serve as documentation.

---


## Module 10: TDD and CI

Test-Driven Development (TDD) is the practice of writing tests before writing production code. Instead of coding first and testing later, you start with a failing test that describes the desired behavior, then write the minimum code to make it pass, then refactor. This inverted workflow produces better-designed, better-tested code by construction. This final module covers the TDD workflow, CI pipeline setup, test coverage enforcement, and the practices that sustain a healthy test culture over time.

### Lesson 10.1: The Red-Green-Refactor Cycle

TDD follows a strict three-phase cycle. **Red**: write a test for behavior that doesn't exist yet. Run it — it should fail. If it passes, either the behavior already exists or the test is wrong. **Green**: write the minimum amount of production code to make the test pass. Don't write more than necessary — no premature optimization, no anticipatory design, no "while I'm at it" additions. **Refactor**: clean up both the test and the production code. Extract methods, rename variables, simplify logic. The tests ensure you don't break anything during refactoring.

The "Red" phase is where design happens. When you write a test before the production code, you're designing the API from the consumer's perspective. What method name makes sense? What parameters should it take? What should it return? These design questions are answered by writing the test. If the test feels awkward to write, the API design is awkward — fix it before writing any production code.

The "Green" phase is about speed, not elegance. Write the simplest code that makes the test pass, even if it's ugly. Return a hardcoded value if one test requires it. Use an `if` statement instead of a strategy pattern. The goal is a passing test, not beautiful code. Beautiful code comes in the refactor phase, protected by the passing test.

The "Refactor" phase is where engineering craft matters. With green tests as a safety net, you can refactor aggressively — extract classes, rename methods, replace conditionals with polymorphism, simplify algorithms. After each refactoring step, run the tests. If they pass, the refactoring is safe. If they fail, undo the last change and try a different approach.

The cycle is fast — typically 2-5 minutes per iteration. Write a test (1 minute), make it pass (1-2 minutes), refactor (1 minute). Over an hour, you complete 15-20 cycles, each adding a small piece of functionality with full test coverage. The cumulative result is a well-tested, well-designed system built incrementally.

TDD is most effective for business logic — pure functions, use cases, validators, calculators, formatters. These are the pieces of code where the behavior is well-defined and the test-first approach naturally produces clean, focused implementations. TDD is less natural for UI code, framework integration, and exploratory programming where the requirements are unclear.

One common TDD mistake is writing tests that are too large. Instead of testing the entire `calculateOrderTotal` function at once, start with the simplest case: "empty cart has zero total." Then add: "single item total equals item price." Then: "multiple items sum correctly." Then: "discount is applied." Each test adds one behavior, and the production code grows incrementally to support each new test.

Another TDD benefit is courage. When you have comprehensive tests, you're not afraid to refactor. You're not afraid to change algorithms, rename classes, or restructure modules. Every change is verified by the test suite in seconds. This courage leads to better design over time because developers continuously improve the codebase instead of leaving technical debt untouched.

```kotlin
// TDD example: Building a PasswordStrengthChecker step by step

// RED — Step 1: Write the first failing test
class PasswordStrengthCheckerTest {
    private val checker = PasswordStrengthChecker()

    @Test
    fun `empty password is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check(""))
    }
}

// GREEN — Step 1: Minimum code to pass
class PasswordStrengthChecker {
    fun check(password: String): PasswordStrength {
        return PasswordStrength.WEAK
    }
}
// Test passes! (hardcoded, but that's OK for now)

// RED — Step 2: Add next failing test
@Test
fun `password with 8+ chars and uppercase and digit is strong`() {
    assertEquals(PasswordStrength.STRONG, checker.check("Abcdefg1"))
}

// GREEN — Step 2: Make it pass
class PasswordStrengthChecker {
    fun check(password: String): PasswordStrength {
        if (password.length >= 8
            && password.any { it.isUpperCase() }
            && password.any { it.isDigit() }) {
            return PasswordStrength.STRONG
        }
        return PasswordStrength.WEAK
    }
}

// RED — Step 3: Add medium strength test
@Test
fun `password with 6+ chars but missing digit is medium`() {
    assertEquals(PasswordStrength.MEDIUM, checker.check("Abcdef"))
}

// GREEN — Step 3: Handle medium case
class PasswordStrengthChecker {
    fun check(password: String): PasswordStrength {
        if (password.length < 6) return PasswordStrength.WEAK
        val hasUpper = password.any { it.isUpperCase() }
        val hasDigit = password.any { it.isDigit() }
        return when {
            password.length >= 8 && hasUpper && hasDigit -> PasswordStrength.STRONG
            hasUpper || hasDigit -> PasswordStrength.MEDIUM
            else -> PasswordStrength.WEAK
        }
    }
}

// REFACTOR — Extract helper function
class PasswordStrengthChecker {
    fun check(password: String): PasswordStrength {
        val criteria = countCriteria(password)
        return when {
            password.length < 6 -> PasswordStrength.WEAK
            criteria >= 3 -> PasswordStrength.STRONG
            criteria >= 1 -> PasswordStrength.MEDIUM
            else -> PasswordStrength.WEAK
        }
    }

    private fun countCriteria(password: String): Int {
        var count = 0
        if (password.length >= 8) count++
        if (password.any { it.isUpperCase() }) count++
        if (password.any { it.isDigit() }) count++
        if (password.any { !it.isLetterOrDigit() }) count++
        return count
    }
}
```

```kotlin
// Complete TDD test suite after all cycles
class PasswordStrengthCheckerTest {
    private val checker = PasswordStrengthChecker()

    // Weak passwords
    @Test fun `empty password is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check(""))
    }

    @Test fun `short password is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check("abc"))
    }

    @Test fun `5 char password is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check("abcde"))
    }

    // Medium passwords
    @Test fun `6 chars with uppercase is medium`() {
        assertEquals(PasswordStrength.MEDIUM, checker.check("Abcdef"))
    }

    @Test fun `6 chars with digit is medium`() {
        assertEquals(PasswordStrength.MEDIUM, checker.check("abcde1"))
    }

    // Strong passwords
    @Test fun `8+ chars with uppercase and digit is strong`() {
        assertEquals(PasswordStrength.STRONG, checker.check("Abcdefg1"))
    }

    @Test fun `8+ chars with uppercase digit and special char is strong`() {
        assertEquals(PasswordStrength.STRONG, checker.check("Abcde1@!"))
    }

    // Edge cases
    @Test fun `all spaces is weak`() {
        assertEquals(PasswordStrength.WEAK, checker.check("      "))
    }

    @Test fun `unicode characters count toward length`() {
        assertEquals(PasswordStrength.MEDIUM, checker.check("Ässwörd"))
    }
}
```

```kotlin
// TDD for a use case — building incrementally
// Cycle 1: Empty cart
class CalculateCartTotalUseCaseTest {
    private val useCase = CalculateCartTotalUseCase()

    @Test
    fun `empty cart has zero total`() {
        assertEquals(0.0, useCase(emptyList()), 0.01)
    }
}

// Cycle 2: Single item
@Test
fun `single item returns item price times quantity`() {
    val items = listOf(CartItem("Widget", 10.0, 2))
    assertEquals(20.0, useCase(items), 0.01)
}

// Cycle 3: Multiple items
@Test
fun `multiple items sums all subtotals`() {
    val items = listOf(
        CartItem("Widget", 10.0, 2),
        CartItem("Gadget", 5.0, 3)
    )
    assertEquals(35.0, useCase(items), 0.01)
}

// Final production code after TDD cycles
class CalculateCartTotalUseCase {
    operator fun invoke(items: List<CartItem>): Double {
        return items.sumOf { it.price * it.quantity }
    }
}
```

#### Common Mistakes

**Writing tests that are too large.** A test that verifies 10 behaviors at once leads to 10 implementation decisions at once. Start with the simplest case and add one behavior per cycle.

**Skipping the refactor phase.** Red-Green without Refactor produces working but messy code. The refactor phase is where design improves. Don't skip it — the tests give you the safety net to refactor fearlessly.

**Applying TDD to everything.** TDD is powerful for business logic and use cases. It's awkward for UI layout, database setup, and exploratory coding. Use TDD where it fits; use test-after where it doesn't.

**Key takeaway:** TDD follows Red-Green-Refactor: write a failing test, make it pass with minimum code, then refactor. Start with the simplest case and add one behavior per cycle. The tests drive the design, ensure coverage, and give you the courage to refactor continuously.

### Lesson 10.2: CI Pipeline for Android Testing

A CI (Continuous Integration) pipeline runs your tests automatically on every push, PR, and merge. It catches bugs before they reach production, enforces test coverage standards, and gives the team confidence that every change is verified. Setting up a robust CI pipeline for Android testing involves configuring test execution, parallelization, reporting, and failure handling.

The basic CI pipeline for Android has three stages: build, test, report. The build stage compiles the code and catches compilation errors. The test stage runs unit tests (`./gradlew test`) and instrumented tests (`./gradlew connectedAndroidTest`). The report stage publishes test results, coverage reports, and artifacts.

Unit tests should run on every PR. They're fast (seconds to minutes), reliable (no flakiness), and catch most logic bugs. Configure CI to run `./gradlew testDebugUnitTest` on every push. If any test fails, the PR is blocked from merging. This simple gate prevents the most common bugs from reaching the main branch.

Instrumented tests should run on a different schedule. They're slower (minutes), need an emulator, and are more prone to flakiness. Run them nightly or on merge to main, not on every PR. This keeps the PR feedback loop fast (unit tests in 2 minutes) while still catching integration and UI bugs before release.

Test parallelization speeds up CI by running tests concurrently. Gradle supports parallel test execution with `maxParallelForks`. For unit tests, `maxParallelForks = Runtime.getRuntime().availableProcessors()` uses all available CPU cores. For instrumented tests, use multiple emulator shards with tools like Flank or Marathon.

Coverage enforcement in CI prevents coverage regression. Add a Gradle task that fails the build if coverage drops below a threshold. For business logic modules, enforce 90% branch coverage. For feature modules, enforce 70% line coverage. The threshold should be realistic — start with the current coverage and ratchet up over time.

Test result reporting makes failures actionable. CI should publish JUnit XML reports, which most CI platforms (GitHub Actions, GitLab CI, Jenkins) can parse and display inline on PRs. When a test fails, the developer sees the failure message, the expected vs. actual values, and the stack trace directly in the PR review interface.

Caching test results between runs avoids re-running tests for unchanged code. Gradle's build cache and incremental testing only run tests for modules that changed. This dramatically speeds up CI for monorepo and multi-module projects where a typical PR only changes 1-2 modules out of 50.

Flake detection and quarantine should be part of your CI strategy. Track test stability over time, automatically quarantine tests that fail more than 5% of the time, and create tickets to fix them. This prevents flaky tests from blocking PRs while maintaining visibility into test health.

```kotlin
// GitHub Actions workflow for Android testing
// .github/workflows/test.yml
/*
name: Android Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '17'
      - name: Run unit tests
        run: ./gradlew testDebugUnitTest
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: '**/build/test-results/**/*.xml'

  instrumented-tests:
    runs-on: macos-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Run instrumented tests
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          script: ./gradlew connectedDebugAndroidTest
*/
```

```kotlin
// Gradle configuration for test optimization
// build.gradle.kts
tasks.withType<Test> {
    // Run tests in parallel
    maxParallelForks = Runtime.getRuntime().availableProcessors()

    // Fail fast — stop on first failure for faster feedback
    failFast = true

    // Report test results
    reports {
        junitXml.required.set(true)
        html.required.set(true)
    }
}
```

```kotlin
// Coverage enforcement with JaCoCo
// build.gradle.kts
plugins {
    jacoco
}

tasks.jacocoTestCoverageVerification {
    violationRules {
        rule {
            limit {
                minimum = "0.80".toBigDecimal() // 80% minimum coverage
            }
        }
        rule {
            element = "CLASS"
            includes = listOf("com.app.domain.*") // Business logic
            limit {
                counter = "BRANCH"
                minimum = "0.90".toBigDecimal() // 90% branch coverage
            }
        }
    }
}
```

#### Common Mistakes

**Running all tests on every PR.** Instrumented tests take 10-20 minutes and can be flaky. Run them nightly, not on every PR. Keep the PR feedback loop under 5 minutes with unit tests only.

**Not publishing test results.** If CI runs tests but doesn't show the results in the PR interface, developers have to dig through CI logs to find failures. Publish JUnit XML reports for inline display.

**Not caching between runs.** Without caching, CI re-compiles and re-tests everything on every push. Gradle build cache and incremental testing dramatically reduce CI time.

**Key takeaway:** Run unit tests on every PR (fast feedback). Run instrumented tests nightly or on merge (avoid blocking PRs with slow/flaky tests). Enforce coverage thresholds. Publish test results for easy triage. Cache aggressively for speed.

### Lesson 10.3: Writing Tests for Legacy Code

Legacy code — code without tests — is the most common starting point for teams adopting testing. You can't rewrite the entire codebase at once, so you need strategies for incrementally adding tests to existing code. The key insight is that you don't need to test everything at once. Start with the code that changes most frequently, has the most bugs, or carries the highest risk.

The "characterization test" approach starts by testing what the code currently does, not what it should do. Write a test, run it, see what the actual output is, and make the test assert on that output. Now you have a safety net — any future change that alters the behavior will break the test. You can refactor with confidence because the characterization test catches unintended behavioral changes.

The "seam" approach identifies points in the code where you can inject test doubles without refactoring. If a class creates its dependencies internally (`private val repo = UserRepositoryImpl()`), you can't inject a fake directly. But you can often extract the dependency creation to a method and override it in a test subclass. This is a temporary workaround until you can refactor to proper constructor injection.

The "strangler fig" approach gradually replaces legacy code with testable code. Instead of refactoring a 500-line ViewModel at once, extract one method, write tests for it, and replace the inline code with a call to the extracted method. Repeat for each method until the ViewModel is thin and all logic lives in tested, extracted classes.

When adding tests to legacy code, focus on the boundaries — the inputs and outputs of each class. Don't try to test internal state or private methods. Test the public API: "when I call this method with these inputs, what comes out?" This black-box approach is resilient to internal refactoring and focuses on the behavior that matters to callers.

Prioritize testing based on risk and change frequency. The code that changes most often (hot paths, active features) needs tests first because it's most likely to break. The code that handles money, permissions, or security needs tests first because bugs there are costly. The code that's stable and rarely changes can wait.

One pragmatic approach is the "test on change" rule: whenever you modify a file, add at least one test for the behavior you're changing. Over time, this naturally builds coverage where it matters most — in the code that's actively being developed. It avoids the overwhelming task of "we need to add tests to everything" and makes testing an incremental, sustainable practice.

```kotlin
// Characterization test — test what the code actually does
class LegacyPriceFormatterTest {
    private val formatter = LegacyPriceFormatter()

    @Test
    fun `characterize current behavior for positive amount`() {
        // Run the code, observe output, assert on it
        val result = formatter.format(49.99)
        // Discovered: it prepends $ and uses 2 decimal places
        assertEquals("$49.99", result)
    }

    @Test
    fun `characterize current behavior for zero`() {
        val result = formatter.format(0.0)
        assertEquals("$0.00", result)
    }

    @Test
    fun `characterize current behavior for negative`() {
        val result = formatter.format(-10.0)
        // Discovered: it shows parentheses for negative amounts
        assertEquals("($10.00)", result)
    }
}
```

```kotlin
// Strangler fig — extract and test incrementally
// BEFORE: everything in one giant ViewModel method
class LegacyOrderViewModel : ViewModel() {
    fun processOrder(cart: Cart) {
        viewModelScope.launch {
            // 50 lines of inline logic
            val subtotal = cart.items.sumOf { it.price * it.quantity }
            val discount = if (cart.items.size > 10) subtotal * 0.1 else 0.0
            val tax = (subtotal - discount) * 0.08
            val total = subtotal - discount + tax
            // ... more logic
        }
    }
}

// AFTER: extract pure functions, test them, delegate from ViewModel
fun calculateSubtotal(items: List<CartItem>): Double =
    items.sumOf { it.price * it.quantity }

fun calculateBulkDiscount(subtotal: Double, itemCount: Int): Double =
    if (itemCount > 10) subtotal * 0.1 else 0.0

fun calculateTax(amount: Double, taxRate: Double): Double =
    amount * taxRate

// Tests for extracted functions
class OrderCalculationsTest {
    @Test fun `subtotal sums price times quantity`() {
        val items = listOf(
            CartItem("A", 10.0, 2),
            CartItem("B", 5.0, 3)
        )
        assertEquals(35.0, calculateSubtotal(items), 0.01)
    }

    @Test fun `bulk discount applies for 11+ items`() {
        assertEquals(10.0, calculateBulkDiscount(100.0, 11), 0.01)
    }

    @Test fun `no discount for 10 or fewer items`() {
        assertEquals(0.0, calculateBulkDiscount(100.0, 10), 0.01)
    }

    @Test fun `tax calculated on amount`() {
        assertEquals(8.0, calculateTax(100.0, 0.08), 0.01)
    }
}
```

```kotlin
// Test on change rule — adding tests when modifying code
// Before: changing the discount threshold from 10 to 5
// Step 1: Write characterization test for current behavior
@Test
fun `current behavior - discount at 11 items`() {
    assertEquals(0.0, calculateBulkDiscount(100.0, 10), 0.01)
    assertEquals(10.0, calculateBulkDiscount(100.0, 11), 0.01)
}

// Step 2: Modify the test to reflect new requirement
@Test
fun `new behavior - discount at 6 items`() {
    assertEquals(0.0, calculateBulkDiscount(100.0, 5), 0.01)
    assertEquals(10.0, calculateBulkDiscount(100.0, 6), 0.01)
}

// Step 3: Change the production code to make the new test pass
fun calculateBulkDiscount(subtotal: Double, itemCount: Int): Double =
    if (itemCount > 5) subtotal * 0.1 else 0.0 // Changed from 10 to 5
```

#### Common Mistakes

**Trying to test everything at once.** Adding tests to a legacy codebase is a marathon, not a sprint. Test the highest-risk, most-changed code first. Accept that full coverage will take months, not days.

**Refactoring without characterization tests.** Before refactoring legacy code, write characterization tests that lock in the current behavior. Then refactor. The tests ensure you don't accidentally change behavior.

**Writing tests for code that will be deleted.** If you're planning to replace a module in 3 months, don't spend time writing tests for it. Focus testing effort on code that will live for years.

**Key takeaway:** Start testing legacy code with characterization tests that lock in current behavior. Use the strangler fig pattern to extract and test incrementally. Follow the "test on change" rule for sustainable coverage growth. Prioritize high-risk, frequently-changed code.

### Lesson 10.4: Test-Driven Refactoring

Refactoring without tests is gambling. Refactoring with tests is engineering. When you have a comprehensive test suite, you can restructure, extract, rename, and simplify with confidence. Every change is verified in seconds. Without tests, every refactoring is a potential regression — and the fear of breaking things leads to code that rots because nobody dares to improve it.

The refactoring workflow starts with green tests. Before changing any production code, run your test suite and verify everything passes. If tests are already failing, fix them first — you can't refactor safely when your safety net has holes.

Each refactoring step should be small and atomic. Don't extract a class, rename three methods, and change an algorithm in one commit. Do one thing at a time: extract, run tests (green?), rename, run tests (green?), simplify, run tests (green?). If a test fails, you know exactly which change caused it because you only changed one thing.

Common refactoring patterns that tests protect include: Extract Method (pull a block of code into a new method), Extract Class (split a large class into smaller ones), Rename (give a method or class a more accurate name), Replace Conditional with Polymorphism (turn if/else chains into strategy objects), and Inline (collapse unnecessary abstractions).

For ViewModel refactoring, the typical pattern is to extract business logic into use cases and pure functions, leaving the ViewModel as a thin orchestrator. Before refactoring, write tests for the ViewModel's observable behavior. Then extract logic, one method at a time, while keeping the tests green. After extraction, add unit tests for the new classes and simplify the ViewModel tests.

Repository refactoring often involves changing the caching strategy, the error handling approach, or the data source priority. Characterization tests lock in the current behavior, and you refactor the internals while keeping the tests green. The repository's external behavior (what it returns, when it throws) stays the same even as the internal implementation changes.

API contract refactoring — changing method signatures, splitting interfaces, combining parameters — requires updating both production code and test code. Change the interface, update the production implementation, update the fakes, and update the tests. Do this in one commit to keep the codebase consistent.

The fear of refactoring is the biggest cost of untested code. When developers are afraid to improve the codebase, technical debt accumulates. When they have tests, they refactor continuously, keeping the code clean and maintainable. Tests don't just catch bugs — they enable the continuous improvement that keeps a codebase healthy for years.

```kotlin
// Refactoring a ViewModel: before and after
// BEFORE: ViewModel does everything
class OrderViewModelBefore : ViewModel() {
    fun processCheckout(cart: Cart, paymentInfo: PaymentInfo) {
        viewModelScope.launch {
            _state.value = CheckoutState.Processing
            try {
                val subtotal = cart.items.sumOf { it.price * it.quantity }
                val discount = if (cart.promoCode != null) {
                    subtotal * cart.promoCode.discountPercent / 100
                } else 0.0
                val tax = (subtotal - discount) * 0.08
                val total = subtotal - discount + tax

                val paymentResult = paymentRepository.charge(total, paymentInfo)
                val order = orderRepository.create(cart.items, total)
                analytics.track("checkout_completed", mapOf("total" to total))

                _state.value = CheckoutState.Confirmed(order.id)
            } catch (e: Exception) {
                _state.value = CheckoutState.Error(e.message ?: "Checkout failed")
            }
        }
    }
}

// AFTER: Logic extracted into testable pure functions and use cases
fun calculateOrderTotal(
    items: List<CartItem>,
    promoCode: PromoCode?,
    taxRate: Double
): OrderTotals {
    val subtotal = items.sumOf { it.price * it.quantity }
    val discount = promoCode?.let { subtotal * it.discountPercent / 100 } ?: 0.0
    val tax = (subtotal - discount) * taxRate
    return OrderTotals(subtotal, discount, tax, subtotal - discount + tax)
}

class ProcessCheckoutUseCase(
    private val paymentRepository: PaymentRepository,
    private val orderRepository: OrderRepository
) {
    suspend operator fun invoke(
        items: List<CartItem>,
        total: Double,
        paymentInfo: PaymentInfo
    ): Order {
        paymentRepository.charge(total, paymentInfo)
        return orderRepository.create(items, total)
    }
}

class OrderViewModelAfter(
    private val processCheckout: ProcessCheckoutUseCase,
    private val analytics: Analytics
) : ViewModel() {
    fun processCheckout(cart: Cart, paymentInfo: PaymentInfo) {
        viewModelScope.launch {
            _state.value = CheckoutState.Processing
            try {
                val totals = calculateOrderTotal(cart.items, cart.promoCode, 0.08)
                val order = processCheckout(cart.items, totals.total, paymentInfo)
                analytics.track("checkout_completed", mapOf("total" to totals.total))
                _state.value = CheckoutState.Confirmed(order.id)
            } catch (e: Exception) {
                _state.value = CheckoutState.Error(e.message ?: "Checkout failed")
            }
        }
    }
}
```

```kotlin
// Tests that survive the refactoring
class OrderViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    // These tests pass for BOTH the before and after implementations
    // because they test observable behavior, not internal structure

    @Test
    fun `successful checkout shows confirmation`() = runTest {
        val viewModel = createViewModel()

        viewModel.processCheckout(testCart(), testPaymentInfo())

        assertIs<CheckoutState.Confirmed>(viewModel.state.value)
    }

    @Test
    fun `failed payment shows error`() = runTest {
        val fakePayment = FakePaymentRepository().apply { shouldFail = true }
        val viewModel = createViewModelWith(payment = fakePayment)

        viewModel.processCheckout(testCart(), testPaymentInfo())

        assertIs<CheckoutState.Error>(viewModel.state.value)
    }
}

// NEW tests for the extracted pure function
class OrderTotalsTest {
    @Test
    fun `calculates subtotal from items`() {
        val totals = calculateOrderTotal(
            items = listOf(CartItem("W", 10.0, 2), CartItem("G", 5.0, 3)),
            promoCode = null,
            taxRate = 0.08
        )
        assertEquals(35.0, totals.subtotal, 0.01)
    }

    @Test
    fun `applies promo code discount`() {
        val totals = calculateOrderTotal(
            items = listOf(CartItem("W", 100.0, 1)),
            promoCode = PromoCode("SAVE10", 10.0),
            taxRate = 0.08
        )
        assertEquals(10.0, totals.discount, 0.01)
        assertEquals(97.2, totals.total, 0.01) // 100 - 10 + 7.2 tax
    }
}
```

#### Common Mistakes

**Refactoring without running tests between steps.** Make one change, run tests. Make one change, run tests. If you batch 5 changes and tests fail, you don't know which change caused the failure.

**Changing tests and production code simultaneously.** If you change both at once and the test passes, you don't know if the test is correct. Change one at a time: first update the test (it should fail), then update the production code (it should pass).

**Refactoring test code without understanding it.** Before refactoring a test, understand what it verifies. A test that seems redundant might be catching a subtle edge case. Remove tests deliberately, not accidentally.

**Key takeaway:** Refactoring with tests is safe engineering. Refactoring without tests is gambling. Make small, atomic changes. Run tests between each step. Tests that verify behavior (not implementation) survive refactoring and make it possible.

### Lesson 10.5: Sustaining a Test Culture

Building a test suite is easy. Sustaining it is hard. Without deliberate cultural practices, test quality erodes over time — coverage drops, tests become flaky, developers start skipping tests on tight deadlines. A healthy test culture requires ongoing investment in practices, tools, and team norms that make testing a natural part of development, not an afterthought.

The most important cultural norm is "never merge without tests." Every PR that adds or modifies behavior should include tests for that behavior. Code review should enforce this — reviewers check for test coverage before approving. This single norm, consistently enforced, prevents coverage regression and ensures new features are tested from day one.

The second cultural norm is "fix flaky tests immediately." When a test becomes flaky, it gets priority attention — equal to a production bug. The team tracks flaky tests, assigns owners, and fixes them within a sprint. Ignoring flaky tests teaches developers to distrust the suite, leading to ignored failures and eventually an abandoned test suite.

Test quality reviews should be part of code review. Reviewers check not just that tests exist, but that they test the right things. A test that always passes (because it asserts on a tautology) is worse than no test because it gives false confidence. A test that's tightly coupled to implementation will break on refactoring. Reviewers should flag these issues just as they flag production code issues.

Developer education on testing is an ongoing investment. Monthly "testing tech talks" where team members present testing patterns, debug flaky tests, or demonstrate new tools keep testing skills sharp. Pair programming on test-heavy features helps junior developers learn testing patterns from experienced ones.

Test metrics should be visible to the team. A dashboard showing test count, coverage percentage, test execution time, and flakiness rate makes the test suite's health visible. When coverage drops, the team notices and corrects. When execution time grows, the team optimizes. Visibility drives accountability.

Investment in test infrastructure pays compounding returns. A shared testing module, good fakes, useful fixtures, and fast CI make writing tests easy. When writing a test is a 5-minute task (because the infrastructure already exists), developers write tests willingly. When it's a 30-minute task (because they need to build fakes from scratch), they skip it.

Celebrating testing achievements reinforces the culture. When a test catches a production bug before release, share the story. When coverage reaches a milestone, acknowledge it. When a team member writes an especially clever test, highlight it. Positive reinforcement sustains motivation better than mandates.

```kotlin
// Code review checklist for test quality
/*
Test Code Review Checklist:
1. Does the test verify behavior, not implementation?
2. Would the test survive a refactoring of the production code?
3. Is the test name descriptive enough for failure triage?
4. Does the test cover edge cases, not just the happy path?
5. Is the test isolated — no shared mutable state?
6. Does the test use deterministic data (no random, no timestamps)?
7. Is the test fast — no Thread.sleep, no real network calls?
8. Does the fake behave consistently with the real implementation?
*/
```

```kotlin
// Test quality anti-patterns to catch in code review

// ANTI-PATTERN 1: Tautological test (always passes)
@Test
fun `user is not null`() {
    val user = User("1", "Mukul", "m@t.com")
    assertNotNull(user) // Always passes — this test catches nothing
}

// ANTI-PATTERN 2: Test coupled to implementation
@Test
fun `calls repository then analytics then navigator`() {
    viewModel.login("m@t.com", "pass")
    verify(mockRepo).authenticate(any(), any()) // breaks on refactor
    verify(mockAnalytics).track(any())           // breaks on refactor
    verify(mockNav).navigateTo(any())            // breaks on refactor
}

// GOOD: Test that verifies behavior
@Test
fun `successful login navigates to home screen`() {
    fakeAuth.addValidCredentials("m@t.com", "pass")
    viewModel.login("m@t.com", "pass")
    assertEquals(Screen.Home, viewModel.currentScreen.value)
}
```

```kotlin
// Metrics tracking for test health
/*
Test Health Dashboard:
- Total tests: 847 (742 unit, 85 integration, 20 E2E)
- Coverage: 78% line, 72% branch
- Average execution time: 45s (unit), 3m (integration), 8m (E2E)
- Flaky tests: 3 (tracked, assigned, deadline: next sprint)
- Tests added this sprint: 34
- Tests removed this sprint: 2 (deleted feature)
- Coverage trend: ↑ 2% this quarter
*/
```

#### Common Mistakes

**Mandating coverage without providing infrastructure.** If developers need 30 minutes to set up fakes for each test, they'll game the coverage number with trivial tests. Invest in shared test infrastructure first, then raise coverage expectations.

**Treating tests as second-class code.** Tests are code. They need the same care, review, and refactoring as production code. A test suite full of copy-pasted, poorly named, unmaintained tests is a liability.

**Making testing someone else's job.** "The QA team will test it" is a cultural failure. Developers should write tests for their own code. QA does exploratory testing, integration testing, and user acceptance testing — not developer unit testing.

**Key takeaway:** A test culture is sustained through norms (no merge without tests, fix flaky tests immediately), infrastructure (shared fakes, fast CI), visibility (metrics dashboards), and positive reinforcement (celebrating wins). Testing is a team practice, not an individual mandate.

### Quiz: TDD and CI

#### What is the correct order of the TDD cycle?

- ❌ Green → Red → Refactor
- ❌ Refactor → Red → Green
- ✅ Red → Green → Refactor (write failing test, make it pass, clean up)
- ❌ Write all tests → Write all code → Refactor

> **Explanation:** TDD starts with Red (a failing test that defines the desired behavior), moves to Green (minimum code to pass the test), and finishes with Refactor (clean up both test and production code). The cycle repeats for each new behavior.

#### When should instrumented tests run in CI?

- ❌ On every commit
- ❌ On every PR push
- ✅ Nightly or on merge to main — they're too slow to run on every PR
- ❌ Only before releases

> **Explanation:** Instrumented tests require an emulator, take minutes to run, and can be flaky. Running them on every PR slows the feedback loop from 2 minutes to 15+ minutes. Run them nightly or on merge to catch integration bugs without blocking PR velocity.

#### What is a characterization test?

- ❌ A test that describes the desired future behavior
- ✅ A test that captures what legacy code currently does, serving as a safety net for refactoring
- ❌ A test that runs faster than 1 second
- ❌ A test that uses character-based matching for assertions

> **Explanation:** Characterization tests lock in the current behavior of legacy code. Even if the behavior has bugs, the test ensures that refactoring doesn't accidentally change it. Once the behavior is locked in, you can refactor the internals safely and fix bugs deliberately.

### Coding Challenge: TDD a Feature

Using TDD (Red-Green-Refactor), build a `PasswordStrengthMeter` that evaluates passwords and returns a strength score. Start with the simplest case and add one behavior per cycle. Show each Red-Green-Refactor step.

#### Solution

```kotlin
// Cycle 1: RED — empty password
@Test fun `empty password scores 0`() {
    assertEquals(0, PasswordStrengthMeter().score(""))
}
// GREEN — return 0
class PasswordStrengthMeter {
    fun score(password: String): Int = 0
}

// Cycle 2: RED — length contributes to score
@Test fun `8 char password scores 1`() {
    assertEquals(1, PasswordStrengthMeter().score("abcdefgh"))
}
// GREEN — check length
class PasswordStrengthMeter {
    fun score(password: String): Int {
        var score = 0
        if (password.length >= 8) score++
        return score
    }
}

// Cycle 3: RED — uppercase adds a point
@Test fun `password with uppercase scores 2`() {
    assertEquals(2, PasswordStrengthMeter().score("Abcdefgh"))
}
// GREEN — check uppercase
class PasswordStrengthMeter {
    fun score(password: String): Int {
        var score = 0
        if (password.length >= 8) score++
        if (password.any { it.isUpperCase() }) score++
        return score
    }
}

// Cycle 4: RED — digit adds a point
@Test fun `password with digit scores 3`() {
    assertEquals(3, PasswordStrengthMeter().score("Abcdefg1"))
}
// GREEN — check digit
class PasswordStrengthMeter {
    fun score(password: String): Int {
        var score = 0
        if (password.length >= 8) score++
        if (password.any { it.isUpperCase() }) score++
        if (password.any { it.isDigit() }) score++
        return score
    }
}

// Cycle 5: RED — special char adds a point
@Test fun `password with special char scores 4`() {
    assertEquals(4, PasswordStrengthMeter().score("Abcdef1!"))
}
// GREEN — check special char
class PasswordStrengthMeter {
    fun score(password: String): Int {
        var score = 0
        if (password.length >= 8) score++
        if (password.any { it.isUpperCase() }) score++
        if (password.any { it.isDigit() }) score++
        if (password.any { !it.isLetterOrDigit() }) score++
        return score
    }
}

// REFACTOR — extract criteria into a list
class PasswordStrengthMeter {
    private val criteria: List<(String) -> Boolean> = listOf(
        { it.length >= 8 },
        { pwd -> pwd.any { it.isUpperCase() } },
        { pwd -> pwd.any { it.isDigit() } },
        { pwd -> pwd.any { !it.isLetterOrDigit() } }
    )

    fun score(password: String): Int {
        return criteria.count { criterion -> criterion(password) }
    }
}

// All tests still pass after refactoring!
class PasswordStrengthMeterTest {
    private val meter = PasswordStrengthMeter()

    @Test fun `empty password scores 0`() = assertEquals(0, meter.score(""))
    @Test fun `short password scores 0`() = assertEquals(0, meter.score("abc"))
    @Test fun `8 char lowercase scores 1`() = assertEquals(1, meter.score("abcdefgh"))
    @Test fun `8 char with uppercase scores 2`() = assertEquals(2, meter.score("Abcdefgh"))
    @Test fun `8 char with upper and digit scores 3`() = assertEquals(3, meter.score("Abcdefg1"))
    @Test fun `8 char with upper digit and special scores 4`() = assertEquals(4, meter.score("Abcdef1!"))
    @Test fun `short with all criteria scores 3`() = assertEquals(3, meter.score("Ab1!"))
}
```

This TDD exercise demonstrates the full Red-Green-Refactor cycle, building a feature incrementally with each cycle adding exactly one behavior. The final refactoring step improved the design without changing any test or behavior.

---

