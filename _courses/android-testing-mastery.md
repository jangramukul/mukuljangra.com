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

The common mistake is writing Compose UI tests for logic that should be unit tested. Testing a discount calculation doesn't require rendering UI — it's a pure function. Test it at the unit level where it runs in milliseconds, not at the UI level where it takes seconds and depends on rendering infrastructure.

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

Every well-structured test has three distinct phases. **Given** (also called Arrange) sets up the preconditions — create fakes, configure state, prepare input data. **When** (Act) performs the single action under test — call the method, trigger the event, invoke the use case. **Then** (Assert) verifies the expected outcome — check return values, inspect state changes, assert on emissions.

This structure isn't just a naming convention. It forces you to think about test design. If your Given section is 30 lines long, your class probably has too many dependencies. If your When section performs multiple actions, you're testing two behaviors in one test — split it. If your Then section has 10 assertions, you're either testing too much or your output is too complex.

The three-phase structure also makes tests scannable. When a test fails in CI, you can glance at the Given section to understand the setup, the When section to see what was triggered, and the Then section to see what was expected vs. what actually happened. No detective work required.

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

### Lesson 1.3: Test Naming and Organization

Test names are documentation. When a test fails at 2 AM in your CI pipeline, the name is the first (and sometimes only) thing you see. A name like `test1()` tells you nothing. A name like `login with expired token redirects to sign in screen` tells you exactly what broke, which feature is affected, and what the expected behavior was.

Kotlin's backtick syntax lets you write test names as natural English sentences. Use the pattern `action + condition + expected result`. For example: `calculateTip with zero percent returns zero`, `search with empty query returns empty list`, `loadProfile on network error shows cached data`. Each name reads like a specification of what the system should do.

Organize test files to mirror your production code structure. If your production code lives in `com.app.feature.login.LoginViewModel`, your test lives in `com.app.feature.login.LoginViewModelTest`. This makes it trivial to navigate between production code and its tests. Within a test class, group related tests logically — all happy-path tests first, then error cases, then edge cases.

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

**Key takeaway:** Test names are specifications. Use backtick syntax to write natural English names that describe the behavior, not the implementation. When a test fails, the name alone should tell you what's broken.

### Lesson 1.4: JUnit Setup and Assertions

JUnit 4 is the standard test runner on Android. Every test class is a plain Kotlin class with methods annotated `@Test`. JUnit provides lifecycle hooks — `@Before` runs before each test (set up shared state), `@After` runs after each test (clean up resources), and `@Rule` attaches reusable behaviors like dispatchers or Compose test rules.

For assertions, you have multiple options. JUnit's built-in `assertEquals`, `assertTrue`, `assertFalse`, and `assertThrows` cover the basics. Google's Truth library provides more readable assertions with better failure messages — `assertThat(result).isEqualTo(expected)` tells you both the actual and expected values without digging through stack traces. Kotlin's own `kotlin.test` package gives you `assertEquals`, `assertIs<Type>`, and `assertFailsWith<Exception>` with Kotlin-idiomatic syntax.

The most common mistake beginners make is using `assertTrue` for everything. `assertTrue(result == expected)` gives you "Expected true but was false" on failure — useless. `assertEquals(expected, result)` gives you "Expected 42 but was 37" — immediately actionable. Always use the most specific assertion available.

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

**Key takeaway:** Use the most specific assertion available — `assertEquals` over `assertTrue`, `assertIs<Type>` over manual type checks. Better assertions give better failure messages, which means faster debugging.

### Lesson 1.5: Common Testing Mistakes

The first mistake is **testing implementation instead of behavior**. If your test breaks because you renamed a private method or reordered internal steps, it's testing how the code works, not what it does. Tests should assert on observable outcomes — return values, state changes, emitted events — not on internal wiring.

The second mistake is **flaky tests**. A flaky test passes sometimes and fails sometimes with the same code. Common causes: depending on real time (`System.currentTimeMillis()`), depending on execution order between tests, using shared mutable state, or testing concurrent code without proper synchronization. Every flaky test erodes trust in your suite. When developers learn to ignore red CI, you might as well have no tests at all.

The third mistake is **testing the framework**. You don't need to test that Room inserts data — Google tested that. You need to test that your DAO query returns the right results with your specific schema. You don't need to test that `StateFlow` emits values — JetBrains tested that. You need to test that your ViewModel emits the right sequence of states for your business logic. Focus your testing effort on your code, not on the libraries you depend on.

The fourth mistake is **too many assertions per test**. A test with 15 assertions is testing 15 things. When it fails, which assertion broke? You have to read the stack trace, find the line number, and reverse-engineer what went wrong. One behavior per test, one or two assertions per test. If you need to verify multiple aspects of a result, it's fine to have a few assertions on the same return value — but never on unrelated behaviors.

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

**Key takeaway:** Constructor injection makes dependencies explicit and swappable. If you can't easily construct a class in a test without real infrastructure, the class has a design problem, not a testing problem.

### Lesson 2.2: Interface Abstraction

Using interfaces to abstract dependencies is one of the basic requirements for testable code. When your ViewModel depends on a `LoginRepository` interface instead of `LoginRepositoryImpl`, you can swap in any implementation during tests. The interface acts as a contract — your test double just needs to fulfill that contract.

But don't go overboard — creating interfaces for absolutely everything, even classes that will only ever have one implementation, just adds noise. Follow a simple rule: create an interface when the class has external side effects (network, database, shared preferences, file system) or when you genuinely need polymorphism. Pure logic classes that just transform data? Skip the interface. You can test them directly.

The exception is when you're working in a large team with modular architecture. In that case, interfaces at module boundaries make sense even for single implementations, because they define API contracts between modules. But for classes internal to a module, be pragmatic about it.

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

**Key takeaway:** Create interfaces for classes with external side effects (network, database, file system). Skip interfaces for pure logic classes — they're already testable without abstraction.

### Lesson 2.3: Pure Functions

A pure function takes inputs, returns an output, and does nothing else. No network calls, no database writes, no mutating shared state. Pure functions are the easiest thing in the world to test because they're completely deterministic — same input, same output, every single time.

The real skill is extracting pure logic from impure contexts. Most business logic is actually pure — it's just trapped inside classes that also do I/O. When you look at a ViewModel or repository method that's hard to test, try to split it into a pure computation part and an impure I/O part. The pure part can be tested with simple unit tests that run in milliseconds. The impure part is just plumbing that wires the pure logic to real data sources.

This pattern pays compounding dividends. Every line of business logic you extract into a pure function is a line you can test without fakes, mocks, coroutines, or dispatchers. The tests are instant, deterministic, and never flaky. Over time, your pure function test base becomes the most reliable part of your entire suite.

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

**Key takeaway:** Extract business logic into pure functions that take inputs and return outputs with no side effects. They're deterministic, instant to test, and never flaky — the gold standard of testable code.

### Lesson 2.4: Separating I/O from Logic

The most testable architecture is one where I/O lives at the edges and logic lives in the center. Your ViewModel orchestrates — it calls a repository to get data, passes that data to pure functions for processing, and then updates the UI state with the result. Each piece is independently testable.

When you see a method that does both I/O and logic, that's a red flag. Split it. Let the repository handle the I/O (fetching, caching, persisting), let pure functions handle the logic (calculating, formatting, validating), and let the ViewModel coordinate the two. This isn't just about testability — it's about clarity. Each class has one job, and that job is obvious from its interface.

The practical effect is dramatic. Your repository tests verify I/O behavior (caching, error handling, retry) using fakes. Your pure function tests verify logic using direct calls. Your ViewModel tests verify orchestration using fakes for the repository and direct assertions on state. No layer needs to know about the others' implementation details.

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

**Key takeaway:** Keep I/O at the edges and logic in the center. Repositories handle I/O, pure functions handle logic, ViewModels orchestrate. Each layer is independently testable without knowing about the others.

### Lesson 2.5: Avoiding Hidden Dependencies

Hidden dependencies are testability killers. They're the static method calls, the singleton references, the hardcoded `System.currentTimeMillis()` calls buried inside your business logic. Every hidden dependency is something you can't control in a test — and if you can't control it, you can't test edge cases around it.

The most common hidden dependency in Android is time. If your code calls `System.currentTimeMillis()` directly, you can't test what happens when a token expires, when a cache becomes stale, or when a countdown timer reaches zero. The fix is simple: inject a `Clock` interface. In production, you provide the real system clock. In tests, you provide a fake clock you can set to any time.

The same principle applies to random number generation, UUID creation, locale, timezone, and any other environmental factor. If your code depends on it, inject it. If you can't inject it, wrap it behind an interface that you can inject.

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

## Module 3: Unit Testing ViewModels, Use Cases, and Repositories

This module dives deep into unit testing the three core layers of a clean Android architecture. You'll learn to test ViewModels that expose StateFlow, use cases that orchestrate business logic, and repositories that coordinate between network and cache. Every test uses fakes — no mocking frameworks, no Android dependencies, just fast JVM tests.

### Lesson 3.1: Testing ViewModels with StateFlow

ViewModel testing is where most Android developers start, and where most get tripped up. The ViewModel exposes a `StateFlow` that the UI observes, and your test needs to verify the sequence of state transitions: Initial → Loading → Success (or Error). Turbine is the standard library for this — its `test {}` DSL lets you consume emissions one by one with `awaitItem()`.

The critical setup piece is `MainDispatcherRule`. In production, ViewModels use `viewModelScope`, which dispatches on `Dispatchers.Main`. Since there's no Android main looper in unit tests, you need to replace `Dispatchers.Main` with a test dispatcher. Without this rule, your tests deadlock immediately.

For testing state transitions, you generally want `UnconfinedTestDispatcher` in your `MainDispatcherRule`. This makes the ViewModel's coroutines execute eagerly, so each `StateFlow.value` assignment is visible to Turbine's collector before the next line of ViewModel code runs. This prevents StateFlow's conflation from eating intermediate states.

```kotlin
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

class ProfileViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

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

            cancelAndIgnoreRemainingEvents()
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
            assertIs<ProfileState.Error>(errorState)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

**Key takeaway:** Always set up `MainDispatcherRule` before testing ViewModels. Use `UnconfinedTestDispatcher` to prevent StateFlow conflation from swallowing intermediate states like Loading. Consume the initial StateFlow value with `awaitItem()` before triggering actions.

### Lesson 3.2: Testing Multiple ViewModel Actions

Real ViewModels handle multiple user actions — load, refresh, retry, filter, sort. Each action triggers a state transition, and your tests need to verify the full sequence. The key pattern is to keep the Turbine `test {}` block open across multiple actions, asserting on each emission as it arrives.

Error recovery tests are particularly important. You trigger an action that fails, assert the error state, then trigger a retry that succeeds. The full sequence — Idle → Loading → Error → Loading → Success — must be verified in a single test to prove the ViewModel correctly transitions out of error state.

For ViewModels that expose multiple flows (a `StateFlow` for UI state and a `SharedFlow` for one-shot events like navigation), use `turbineScope` with `testIn()`. This creates independent turbines that collect concurrently, letting you verify that a login action both updates the UI state and triggers a navigation event.

```kotlin
@Test
fun `retry after error shows loading then success`() = runTest {
    val fakeRepo = FakeUserRepository()
    val viewModel = ProfileViewModel(fakeRepo)

    viewModel.state.test {
        assertEquals(ProfileState.Initial, awaitItem())

        // First attempt fails
        fakeRepo.setShouldFail(true)
        viewModel.loadProfile("1")
        assertEquals(ProfileState.Loading, awaitItem())
        assertIs<ProfileState.Error>(awaitItem())

        // Retry succeeds
        fakeRepo.setShouldFail(false)
        fakeRepo.setUser(User("1", "Mukul", "mukul@test.com"))
        viewModel.loadProfile("1")
        assertEquals(ProfileState.Loading, awaitItem())
        assertIs<ProfileState.Success>(awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `login success triggers navigation event`() = runTest {
    val viewModel = LoginViewModel(FakeLoginRepository(shouldSucceed = true))

    turbineScope {
        val states = viewModel.uiState.testIn(backgroundScope)
        val events = viewModel.navigationEvents.testIn(backgroundScope)

        assertEquals(LoginUiState.Idle, states.awaitItem())

        viewModel.onLoginClicked("user@test.com", "password123")
        assertEquals(LoginUiState.Loading, states.awaitItem())
        assertIs<LoginUiState.Success>(states.awaitItem())

        assertEquals(NavigationEvent.GoToHome, events.awaitItem())

        states.cancelAndIgnoreRemainingEvents()
        events.cancelAndIgnoreRemainingEvents()
    }
}
```

**Key takeaway:** Test the complete state sequence across multiple actions, especially error recovery flows. Use `turbineScope` with `testIn()` when testing ViewModels that expose both state and events through separate flows.

### Lesson 3.3: Testing Use Cases

Use cases (or interactors) encapsulate a single piece of business logic that orchestrates one or more repositories. They're the easiest layer to test because they have a clear contract: given inputs, produce outputs. No UI concerns, no lifecycle, no dispatchers.

The pattern is straightforward — provide fakes for each repository the use case depends on, invoke the use case, and assert on the result. For use cases that return `Flow`, use Turbine to collect and assert emissions. For use cases that return `suspend` results, just call them inside `runTest` and assert directly.

The most common mistake is testing use cases that do nothing but delegate to a single repository. If your use case is just `fun invoke(id: String) = repository.getUser(id)`, it adds no value and doesn't need its own tests. Focus on use cases that combine data from multiple sources, apply business rules, or transform data in meaningful ways.

```kotlin
class GetDashboardDataUseCaseTest {
    private val userRepo = FakeUserRepository()
    private val ordersRepo = FakeOrdersRepository()
    private val useCase = GetDashboardDataUseCase(userRepo, ordersRepo)

    @Test
    fun `returns combined data from both repos`() = runTest {
        userRepo.setUser(User("user-1", "Mukul", "mukul@test.com"))
        ordersRepo.setOrders(listOf(
            Order("o1", "user-1", 50.0, OrderStatus.COMPLETED),
            Order("o2", "user-1", 30.0, OrderStatus.PENDING)
        ))

        val result = useCase("user-1")

        assertEquals("Mukul", result.user.name)
        assertEquals(2, result.orders.size)
        assertEquals(50.0, result.completedTotal, 0.01)
    }

    @Test
    fun `returns empty orders when user has none`() = runTest {
        userRepo.setUser(User("user-1", "Mukul", "mukul@test.com"))

        val result = useCase("user-1")

        assertEquals("Mukul", result.user.name)
        assertTrue(result.orders.isEmpty())
        assertEquals(0.0, result.completedTotal, 0.01)
    }

    @Test
    fun `propagates error when user repo fails`() = runTest {
        userRepo.setShouldFail(true)

        assertThrows<IOException> {
            useCase("user-1")
        }
    }
}
```

**Key takeaway:** Use cases are the easiest layer to test — clear inputs, clear outputs, no framework dependencies. Focus on use cases that combine data or apply business rules, not trivial delegates to a single repository.

### Lesson 3.4: Testing Repository Layer

Repository tests verify the data layer's coordination between remote sources (API) and local sources (DAO/cache). The key behavior to test is the offline-first pattern: does the repository serve cached data when the network fails? Does it refresh the cache when the network succeeds? Does it emit cached data first, then fresh data after a successful network call?

Provide fakes for both the API and the DAO. The API fake controls network responses — success, failure, delays. The DAO fake mimics an in-memory database with insert, query, and observe operations. These fakes let you simulate complex scenarios: stale cache with fresh network, network timeout with valid cache, empty cache with first-ever network fetch.

The offline-first pattern creates a specific emission sequence you can verify with Turbine. When the repository's `observeUser()` flow is collected, it should emit cached data immediately (if available), trigger a network refresh in the background, and then emit the fresh data once it arrives. If the network fails, the cached data should remain visible and no error should propagate to the UI.

```kotlin
class UserRepositoryTest {
    private val fakeApi = FakeUserApi()
    private val fakeDao = FakeUserDao()
    private val repository = UserRepositoryImpl(fakeApi, fakeDao)

    @Test
    fun `observeUser emits cached data then refreshes from network`() = runTest {
        fakeDao.insertUser(UserEntity("1", "Mukul (cached)", "mukul@test.com"))
        fakeApi.setUser(UserDto("1", "Mukul (fresh)", "mukul@test.com"))

        repository.observeUser("1").test {
            val cached = awaitItem()
            assertEquals("Mukul (cached)", cached.name)

            val fresh = awaitItem()
            assertEquals("Mukul (fresh)", fresh.name)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `observeUser falls back to cache on network error`() = runTest {
        fakeDao.insertUser(UserEntity("1", "Mukul", "mukul@test.com"))
        fakeApi.setShouldFail(true)

        repository.observeUser("1").test {
            assertEquals("Mukul", awaitItem().name)
            expectNoEvents()
        }
    }

    @Test
    fun `observeUser emits error when both cache and network fail`() = runTest {
        fakeApi.setShouldFail(true)
        // No cached data

        repository.observeUser("1").test {
            val error = awaitError()
            assertIs<IOException>(error)
        }
    }
}
```

**Key takeaway:** Test repositories with fakes for both API and DAO. Verify the offline-first behavior — cache should work when network fails. Test the full sequence: cached data first, then fresh data after network success.

### Lesson 3.5: Testing Mappers and Validators

Mappers convert data between layers (DTO → Domain, Domain → Entity, Domain → UI model). Validators check business rules (email format, password strength, form completeness). Both are pure functions — no dependencies, no side effects — making them the fastest and most reliable tests in your suite.

Test mappers exhaustively for edge cases: null fields, empty strings, unexpected enum values, boundary numbers, Unicode characters. A mapper that crashes on an unexpected API response can bring down your entire app. Test validators for every rule boundary: the exact character count that flips from invalid to valid, the specific pattern that matches, the combination of rules that interact.

These tests are so cheap to write and run that there's no excuse for skipping them. A mapper test takes 10 seconds to write and catches bugs that would take hours to diagnose in production. Write them for every mapper and validator in your codebase — the cumulative coverage is enormous.

```kotlin
class UserMapperTest {
    @Test
    fun `maps DTO to domain with all fields`() {
        val dto = UserDto(id = "1", name = "Mukul", email = "mukul@test.com")
        val user = dto.toDomain()
        assertEquals(User("1", "Mukul", "mukul@test.com"), user)
    }

    @Test
    fun `maps null email to empty string`() {
        val dto = UserDto(id = "1", name = "Mukul", email = null)
        val user = dto.toDomain()
        assertEquals("", user.email)
    }
}

class EmailValidatorTest {
    private val validator = EmailValidator()

    @Test fun `valid email passes`() { assertTrue(validator.isValid("user@example.com")) }
    @Test fun `email without at sign fails`() { assertFalse(validator.isValid("userexample.com")) }
    @Test fun `email without domain fails`() { assertFalse(validator.isValid("user@")) }
    @Test fun `empty email fails`() { assertFalse(validator.isValid("")) }
    @Test fun `email with spaces fails`() { assertFalse(validator.isValid("user @example.com")) }
}
```

**Key takeaway:** Mappers and validators are pure functions — test them exhaustively for edge cases. They're the fastest tests to write and run, and they catch bugs that would be painful to diagnose in production.

### Quiz: Unit Testing

#### When testing a ViewModel that exposes a StateFlow, which library is recommended for collecting and asserting emissions?

- ❌ Mockito — it mocks the Flow entirely
- ✅ Turbine — it provides `test {}` to collect and assert Flow emissions
- ❌ Espresso — it handles UI state assertions
- ❌ Robolectric — it simulates the Android framework

> **Explanation:** Turbine is a testing library for Kotlin Flows. Its `test {}` extension lets you use `awaitItem()` to collect emissions one by one and assert on each state transition (Initial → Loading → Success/Error).

#### In the ViewModel test, why do we call `awaitItem()` for the Initial state before asserting Loading and Success?

- ❌ It's optional and can be skipped
- ✅ Turbine requires consuming every emission in order — skipping Initial would cause the test to fail
- ❌ It resets the ViewModel state
- ❌ It triggers the network call

> **Explanation:** Turbine's `test {}` block collects all emissions sequentially. The StateFlow emits its initial value immediately, so you must consume it with `awaitItem()` before you can assert on subsequent emissions like Loading and Success.

#### What is the primary benefit of testing the repository layer with fakes for both API and DAO?

- ❌ It eliminates the need for integration tests
- ❌ It tests the production database directly
- ✅ It verifies offline-first behavior — cache works when network fails
- ❌ It makes the tests run on a real device

> **Explanation:** By providing fakes for both the API (network) and DAO (cache), you can simulate scenarios like network failure and verify the repository correctly falls back to cached data, which is the core of offline-first architecture.

### Coding Challenge: Test a Search ViewModel

Build a `SearchViewModel` that takes a `ProductRepository` and exposes a `results: StateFlow<SearchState>`. When `search(query)` is called, it should emit Loading then the filtered results. Write the `FakeProductRepository` and three tests: successful search, empty query returning empty list, and network error showing error state.

#### Solution

```kotlin
data class Product(val id: String, val name: String)

interface ProductRepository {
    suspend fun search(query: String): List<Product>
}

class FakeProductRepository : ProductRepository {
    private val products = mutableListOf<Product>()
    var shouldFail = false

    fun setProducts(list: List<Product>) {
        products.clear()
        products.addAll(list)
    }

    override suspend fun search(query: String): List<Product> {
        if (shouldFail) throw IOException("Network error")
        if (query.isBlank()) return emptyList()
        return products.filter { it.name.contains(query, ignoreCase = true) }
    }
}

sealed class SearchState {
    object Idle : SearchState()
    object Loading : SearchState()
    data class Results(val products: List<Product>) : SearchState()
    data class Error(val message: String) : SearchState()
}

class SearchViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

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

            cancelAndIgnoreRemainingEvents()
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
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `network error shows error state`() = runTest {
        fakeRepo.shouldFail = true

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.search("Kotlin")
            assertEquals(SearchState.Loading, awaitItem())
            assertIs<SearchState.Error>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

This challenge applies patterns from Lessons 3.1–3.4: MainDispatcherRule, fake repository with failure toggle, Turbine-based state transition verification, and testing both happy and error paths.

---

## Module 4: Fakes, Mocks, and Test Doubles

Choosing the right test double strategy is one of the most consequential decisions you'll make for your test suite's long-term health. This module covers when and how to use fakes, mocks, and stubs — and why fakes should be your default choice in almost every situation.

### Lesson 4.1: Building Production-Quality Fakes

A fake is a working implementation of your interface backed by in-memory data structures. Unlike mocks, fakes execute real logic — they store data, filter queries, and simulate behavior. A good fake mirrors the contract of the real implementation closely enough that tests using it are trustworthy, while being simple enough that the fake itself doesn't need tests.

The standard pattern is a `MutableMap` or `MutableList` for storage, a `shouldFail` flag for error simulation, and optional `delay` for timing-sensitive tests. Expose configuration methods that tests use to set up state, and implement the interface methods with real logic that operates on the in-memory data.

The most important quality of a good fake is that it fails at compile time when the interface changes. If `UserRepository` gains a new method, `FakeUserRepository` won't compile until you add that method. Mocks silently pass until runtime — you won't know about the missing method until a test crashes or, worse, passes incorrectly.

```kotlin
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    private val usersFlow = MutableSharedFlow<List<User>>(replay = 1)
    var shouldFail = false
    var failureException: Exception = IOException("Fake network error")
    private var networkDelay = 0L

    fun setUser(user: User) {
        users[user.id] = user
        usersFlow.tryEmit(users.values.toList())
    }

    fun setNetworkDelay(delayMs: Long) { networkDelay = delayMs }

    fun clear() {
        users.clear()
        usersFlow.tryEmit(emptyList())
    }

    override suspend fun getUser(id: String): User {
        if (networkDelay > 0) delay(networkDelay)
        if (shouldFail) throw failureException
        return users[id] ?: throw UserNotFoundException(id)
    }

    override suspend fun saveUser(user: User) {
        if (shouldFail) throw failureException
        users[user.id] = user
        usersFlow.tryEmit(users.values.toList())
    }

    override fun observeUsers(): Flow<List<User>> {
        if (shouldFail) return flow { throw failureException }
        return usersFlow
    }
}
```

**Key takeaway:** Fakes are working implementations backed by in-memory data. They catch interface changes at compile time, test behavior instead of implementation details, and are reusable across dozens of test classes.

### Lesson 4.2: Fakes vs Mocks vs Stubs

Understanding the differences between test doubles is essential for choosing the right tool for each testing scenario.

A **Fake** is a simplified but working implementation. It executes real logic with in-memory data — `FakeUserRepository` stores users in a `Map`, queries them by ID, and emits them through a `Flow`. Fakes are reusable, catch interface changes at compile time, and test behavior (what your code does) rather than implementation (how it calls dependencies).

A **Mock** is a framework-generated object (MockK, Mockito) that records interactions. You define expectations (`every { mock.getUser("1") } returns user`) and verify calls (`verify { mock.getUser("1") }`). Mocks test that specific methods were called with specific arguments — they're interaction-based, not behavior-based. Use mocks when you need to verify that a side effect happened (analytics event fired, notification sent) but can't observe the result directly.

A **Stub** returns canned responses with no logic. `val stub = object : UserRepository { override suspend fun getUser(id: String) = testUser }`. Stubs are quick to write but not reusable and don't simulate realistic behavior. Use them for one-off tests where you need a dependency that returns a fixed value.

The rule is simple: **fakes for behavior testing, mocks for interaction verification, stubs for quick one-offs**. If you find yourself writing `verify(mock).someMethod()` in most tests, you're testing implementation details. Refactor toward fakes.

```kotlin
// Fake — behavior testing (preferred)
class FakeAnalytics : Analytics {
    val trackedEvents = mutableListOf<AnalyticsEvent>()
    override fun track(event: AnalyticsEvent) { trackedEvents.add(event) }
}

// Assert on the fake's state
assertEquals(
    listOf(AnalyticsEvent("login_clicked"), AnalyticsEvent("login_success")),
    fakeAnalytics.trackedEvents
)

// Mock — interaction verification (use sparingly)
val mockAnalytics = mockk<Analytics>()
every { mockAnalytics.track(any()) } just runs

viewModel.login("user@test.com", "pass")

verify(exactly = 1) { mockAnalytics.track(AnalyticsEvent("login_success")) }

// Stub — quick one-off (use for simple cases)
val stubRepo = object : UserRepository {
    override suspend fun getUser(id: String) = User("1", "Test", "test@test.com")
    override suspend fun saveUser(user: User) {}
    override fun observeUsers() = flowOf(emptyList<User>())
}
```

**Key takeaway:** Prefer fakes over mocks. They're more maintainable, catch interface changes at compile time, and test behavior instead of implementation details. Use mocks only for interaction verification you can't observe through fakes.

### Lesson 4.3: When to Use MockK

MockK is Kotlin-first and handles coroutines, extension functions, and object declarations out of the box. While fakes should be your default, MockK shines in specific scenarios where fakes would be impractical or overly complex.

Use MockK when verifying interactions with third-party SDKs you can't implement (Firebase Analytics, Crashlytics). Use it when the interface is enormous and you only care about one method. Use it when you need to verify exact call counts or argument matchers. And use it for relaxed mocks in tests where you need a dependency to exist but don't care about its behavior.

The biggest trap with MockK is overuse. When every test is `every { ... } returns ...` and `verify { ... }`, your tests are tightly coupled to implementation. Rename a method, reorder calls, or refactor internals, and dozens of tests break — even though the external behavior hasn't changed. This is the brittleness problem that drives teams away from testing entirely.

```kotlin
// Good use of MockK — verifying a third-party SDK call
class PurchaseViewModelTest {
    private val mockFirebaseAnalytics = mockk<FirebaseAnalytics>(relaxed = true)

    @Test
    fun `purchase logs revenue event to Firebase`() {
        val viewModel = PurchaseViewModel(
            repository = FakeCartRepository(),
            analytics = mockFirebaseAnalytics
        )

        viewModel.completePurchase()

        verify {
            mockFirebaseAnalytics.logEvent("purchase", match {
                it.getDouble("value") == 49.99
            })
        }
    }
}

// Bad use of MockK — testing implementation details
@Test
fun `login calls repository authenticate then save token`() {
    val mockRepo = mockk<AuthRepository>()
    every { mockRepo.authenticate(any(), any()) } returns AuthResult.Success("token")
    every { mockRepo.saveToken(any()) } just runs

    viewModel.login("user@test.com", "pass")

    verifyOrder {
        mockRepo.authenticate("user@test.com", "pass")
        mockRepo.saveToken("token")
    }
    // This test breaks if you reorder internal calls, even if behavior is unchanged
}
```

**Key takeaway:** Use MockK for third-party SDK verification and scenarios where fakes would be impractical. Avoid using it as your default — mock-heavy test suites are brittle and break on refactoring even when behavior is preserved.

### Lesson 4.4: Shared Fakes and the Test Fixtures Pattern

When your app has multiple feature modules, each module's tests need the same fakes — `FakeUserRepository`, `FakeOrdersRepository`, `FakeAuthRepository`. Without a shared location, every module duplicates these fakes, leading to maintenance nightmares when interfaces change.

The solution is a `:core:testing` module (or `:shared:test-fixtures`) that contains all shared fakes, factory functions, and test utilities. Feature modules declare it as a `testImplementation` dependency. When an interface gains a new method, you update the fake in one place and every module picks up the change automatically.

Factory functions with default parameters are the other half of the test fixtures pattern. `createTestUser()` with sensible defaults lets every test specify only the fields it cares about. A test verifying premium discount only sets `isPremium = true` — the ID, name, and email use defaults. This keeps tests concise and focused on the behavior under test.

```kotlin
// :core:testing module
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
        price: Double = 9.99,
        category: String = "general"
    ) = Product(id, name, price, category)

    fun createOrder(
        id: String = "order-1",
        userId: String = "user-1",
        products: List<Product> = listOf(createProduct()),
        status: OrderStatus = OrderStatus.PENDING
    ) = Order(id, userId, products, status)
}

// Usage in any feature module's tests
class OrderSummaryUseCaseTest {
    @Test
    fun `summary calculates total from completed orders`() = runTest {
        val order = TestFixtures.createOrder(
            products = listOf(
                TestFixtures.createProduct(price = 10.00),
                TestFixtures.createProduct(id = "p2", price = 25.50)
            ),
            status = OrderStatus.COMPLETED
        )
        // Only the fields relevant to this test are specified
    }
}

// build.gradle.kts in feature module
dependencies {
    testImplementation(project(":core:testing"))
}
```

**Key takeaway:** Extract shared fakes and factory functions into a `:core:testing` module. This eliminates duplicate test code across feature modules and ensures interface changes propagate to fakes in one place.

### Lesson 4.5: Testing Error Scenarios with Fakes

Good fakes don't just simulate happy paths — they simulate every failure mode your production code handles. Network timeouts, server errors, parsing failures, authentication expiry, rate limiting. Each failure mode should be configurable on your fake so tests can verify error handling without touching real infrastructure.

The pattern is to expose configuration methods on the fake: `shouldFail`, `failureException`, `networkDelay`, `rateLimitRemaining`. Your production code catches and handles these exceptions identically whether they come from the real API or the fake. This means your error-handling tests are just as trustworthy as your happy-path tests.

The most valuable error tests verify recovery behavior. Can the user retry after a network error? Does the UI clear the error state when a retry succeeds? Does the cache still work after a network timeout? These are the tests that catch real production bugs — the ones where the app gets stuck in an error state with no way out.

```kotlin
class FakePaymentApi : PaymentApi {
    var shouldFail = false
    var failureType: FailureType = FailureType.NETWORK
    var remainingRateLimit = Int.MAX_VALUE

    enum class FailureType { NETWORK, SERVER, AUTH_EXPIRED, RATE_LIMITED }

    override suspend fun charge(amount: Double): PaymentResult {
        if (remainingRateLimit <= 0) throw RateLimitException("Too many requests")
        remainingRateLimit--
        if (shouldFail) throw when (failureType) {
            FailureType.NETWORK -> IOException("Network unreachable")
            FailureType.SERVER -> HttpException(Response.error<Any>(500, "".toResponseBody()))
            FailureType.AUTH_EXPIRED -> AuthExpiredException("Token expired")
            FailureType.RATE_LIMITED -> RateLimitException("Rate limited")
        }
        return PaymentResult.Success(transactionId = "txn-${amount.hashCode()}")
    }
}

class PaymentViewModelTest {
    private val fakeApi = FakePaymentApi()

    @Test
    fun `network error shows retry button`() = runTest {
        fakeApi.shouldFail = true
        fakeApi.failureType = FakePaymentApi.FailureType.NETWORK
        val viewModel = PaymentViewModel(fakeApi)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.charge(49.99)
            awaitItem() // Processing
            val error = awaitItem()
            assertIs<PaymentState.Error>(error)
            assertTrue(error.isRetryable)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `auth expired error navigates to login`() = runTest {
        fakeApi.shouldFail = true
        fakeApi.failureType = FakePaymentApi.FailureType.AUTH_EXPIRED
        val viewModel = PaymentViewModel(fakeApi)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.charge(49.99)
            awaitItem() // Processing
            val error = awaitItem()
            assertIs<PaymentState.Error>(error)
            assertFalse(error.isRetryable)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

**Key takeaway:** Configure fakes to simulate every failure mode your production code handles — network errors, server errors, auth expiry, rate limiting. The most valuable tests verify error recovery behavior, not just error display.

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

#### When is MockK the right choice over a fake?

- ❌ Always — MockK is superior to fakes in every scenario
- ❌ When testing pure functions without dependencies
- ✅ When verifying interactions with third-party SDKs you can't implement, or when the interface is too large for a fake
- ❌ When testing ViewModel state transitions

> **Explanation:** MockK is ideal for verifying calls to third-party SDKs (Firebase, Crashlytics) where you can't write a fake implementation. It's also useful when an interface has dozens of methods and you only care about one. For everything else, fakes are more maintainable and less brittle.

### Coding Challenge: Build a Configurable Fake

Create a `FakeNotificationService` implementing a `NotificationService` interface with `send(userId: String, message: String): Result<Unit>`, `getHistory(userId: String): List<Notification>`, and `clearAll(userId: String)`. The fake should support success, failure, network delay, and tracking of all sent notifications. Write tests for a `NotificationViewModel` that sends a notification and displays the result.

#### Solution

```kotlin
interface NotificationService {
    suspend fun send(userId: String, message: String): Result<Unit>
    suspend fun getHistory(userId: String): List<Notification>
    suspend fun clearAll(userId: String)
}

data class Notification(val userId: String, val message: String, val timestamp: Long)

class FakeNotificationService : NotificationService {
    private val notifications = mutableListOf<Notification>()
    var shouldFail = false
    var delayMs = 0L
    private var timestamp = 0L

    val sentNotifications: List<Notification> get() = notifications.toList()

    override suspend fun send(userId: String, message: String): Result<Unit> {
        if (delayMs > 0) delay(delayMs)
        if (shouldFail) return Result.failure(IOException("Send failed"))
        notifications.add(Notification(userId, message, timestamp++))
        return Result.success(Unit)
    }

    override suspend fun getHistory(userId: String): List<Notification> {
        if (shouldFail) throw IOException("Fetch failed")
        return notifications.filter { it.userId == userId }
    }

    override suspend fun clearAll(userId: String) {
        if (shouldFail) throw IOException("Clear failed")
        notifications.removeAll { it.userId == userId }
    }
}

class NotificationViewModelTest {
    @get:Rule val mainDispatcherRule = MainDispatcherRule()
    private val fakeService = FakeNotificationService()
    private val viewModel = NotificationViewModel(fakeService)

    @Test
    fun `send notification shows success`() = runTest {
        viewModel.state.test {
            awaitItem() // Idle
            viewModel.sendNotification("user-1", "Hello!")
            awaitItem() // Sending
            assertIs<NotificationState.Sent>(awaitItem())
            assertEquals(1, fakeService.sentNotifications.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `send failure shows error with retry`() = runTest {
        fakeService.shouldFail = true
        viewModel.state.test {
            awaitItem() // Idle
            viewModel.sendNotification("user-1", "Hello!")
            awaitItem() // Sending
            val error = awaitItem()
            assertIs<NotificationState.Error>(error)
            assertTrue(fakeService.sentNotifications.isEmpty())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

This exercise builds a production-quality fake with multiple configuration options and demonstrates testing both success and failure scenarios.

---

## Module 5: Testing Kotlin Flows with Turbine

Kotlin Flows are the backbone of reactive Android architecture, and testing them correctly requires understanding Turbine's API, StateFlow's conflation behavior, and the dispatcher asymmetry that makes intermediate states observable. This module covers cold flows, hot flows, SharedFlow, and the real-world patterns you'll use in every ViewModel test.

### Lesson 5.1: Why Turbine Exists

The first time you test a `StateFlow` without Turbine, you launch a coroutine, collect emissions into a list, and assert on the list. The test passes. Then you deliberately introduce a bug — skipping an intermediate `Loading` state — and the test still passes. Your collector grabbed the final state after everything settled, completely blind to the state transitions your UI depends on. A test that can never fail is worse than having no test at all.

Without Turbine, you're managing collection jobs manually, handling cancellation, wiring timeouts, and fighting race conditions between emissions and assertions. The test infrastructure grows until it dwarfs the actual assertions, and the infrastructure itself is almost always subtly broken. Turbine replaces all that ceremony with one extension function: `test {}`.

Inside the `test {}` block, you pull emissions one at a time using focused methods. Each `awaitItem()` suspends until the next emission arrives and returns it. If nothing comes within 3 seconds, Turbine throws. When the block exits, Turbine checks that every emission was consumed — if you forgot to handle an unexpected emission, the test fails loudly. This strictness is the whole point.

```kotlin
// Without Turbine — broken, can't detect missing Loading state
@Test
fun `search updates results`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())
    val states = mutableListOf<SearchUiState>()
    val job = launch(UnconfinedTestDispatcher()) {
        viewModel.state.collect { states.add(it) }
    }
    viewModel.onQueryChanged("kotlin")
    advanceUntilIdle()
    assertEquals(SearchUiState.Idle, states[0])
    assertEquals(SearchUiState.Loading, states[1])      // might fail due to conflation
    assertTrue(states[2] is SearchUiState.Results)
    job.cancel()
}

// With Turbine — correct, every emission verified
@Test
fun `search updates results`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())
    viewModel.state.test {
        assertEquals(SearchUiState.Idle, awaitItem())
        viewModel.onQueryChanged("kotlin")
        assertEquals(SearchUiState.Loading, awaitItem())
        val results = awaitItem()
        assertIs<SearchUiState.Results>(results)
        assertEquals(3, results.items.size)
        cancelAndIgnoreRemainingEvents()
    }
}
```

**Key takeaway:** Turbine replaces manual coroutine collection with a sequential DSL that forces you to account for every emission. Without it, your flow tests silently miss state transitions. With it, every missed or unexpected emission is a loud failure.

### Lesson 5.2: Turbine's Core API

Turbine's API surface is small and focused. **`awaitItem()`** is your primary tool — it suspends until the next emission arrives and returns it. If nothing comes within the timeout (3 seconds by default), Turbine throws "No value produced in 3s." This timeout failure is almost never a real timeout — it's the flow genuinely not emitting, usually because a dispatcher isn't set up or a fake isn't returning data.

**`awaitComplete()`** suspends until the Flow completes normally. Use this for cold flows that have a finite number of emissions. **`awaitError()`** suspends until the Flow terminates with an exception and returns the `Throwable`. This is how you verify error flows — the exception becomes an event you assert on instead of crashing your test.

**`expectNoEvents()`** asserts that nothing happened — no emissions, no completions, no errors. This is critical for testing debounce logic or verifying that a flow stays quiet when it should. **`skipItems(n)`** consumes and discards `n` items, useful for skipping known initial states. **`cancelAndIgnoreRemainingEvents()`** is required for hot flows like `StateFlow` that never complete on their own.

**`expectMostRecentItem()`** skips all pending emissions and returns only the latest one. Use it sparingly — skipping states means you're not testing the full transition sequence. It's useful when you genuinely only care about the final state after a series of actions.

```kotlin
// Cold flow — use awaitComplete()
@Test
fun `repository returns mapped results`() = runTest {
    val repository = UserRepository(FakeApiClient())
    repository.getActiveUsers().test {
        val first = awaitItem()
        assertEquals("Mukul", first.name)
        val second = awaitItem()
        assertEquals("Priya", second.name)
        awaitComplete() // Verifies the flow actually terminates
    }
}

// Error flow — use awaitError()
@Test
fun `error flow propagates exception`() = runTest {
    val repository = FakeUserRepository().apply { shouldFail = true }
    repository.observeUsers().test {
        val error = awaitError()
        assertIs<IOException>(error)
    }
}

// Debounce — use expectNoEvents()
@Test
fun `debounce blocks rapid emissions`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())
    viewModel.state.test {
        skipItems(1) // Skip initial Idle
        viewModel.onQueryChanged("k")
        viewModel.onQueryChanged("ko")
        viewModel.onQueryChanged("kot")
        expectNoEvents() // Nothing yet — debounce is 300ms
        advanceTimeBy(300)
        assertEquals(SearchUiState.Loading, awaitItem())
        assertIs<SearchUiState.Results>(awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

**Key takeaway:** Learn six Turbine methods and you can test any flow: `awaitItem()` for emissions, `awaitComplete()` for termination, `awaitError()` for failures, `expectNoEvents()` for silence, `skipItems()` for skipping, and `cancelAndIgnoreRemainingEvents()` for hot flows.

### Lesson 5.3: Testing StateFlow — Initial Values and Hot Flow Behavior

StateFlow always has a current value. When Turbine calls `collect` on a StateFlow, the first emission is that initial value — delivered immediately, before you've triggered any action. If you forget to consume it, Turbine reports "Unconsumed events" and fails your test. This catches people off guard because the initial value feels like it shouldn't "count," but it does.

StateFlow is a hot flow — it exists independently of collectors and never completes. This means you always need `cancelAndIgnoreRemainingEvents()` at the end of your Turbine `test {}` block, because there's no natural completion event to end the collection. Without it, Turbine hangs waiting for more emissions or fails with "Unconsumed events."

StateFlow also deduplicates via `equals()`. If you emit the same value twice (by structural equality), the second emission is silently dropped. If your state is a data class and you emit two instances with identical fields, the collector never sees the second one. This is correct behavior for state holders, but it can be confusing in tests where you expect to see every assignment.

```kotlin
@Test
fun `profile loads user data`() = runTest {
    val viewModel = ProfileViewModel(FakeProfileRepository())

    viewModel.uiState.test {
        // First awaitItem() is ALWAYS the initial state
        assertEquals(ProfileUiState.Idle, awaitItem())

        viewModel.loadProfile("user-42")

        assertEquals(ProfileUiState.Loading, awaitItem())

        val loaded = awaitItem()
        assertIs<ProfileUiState.Loaded>(loaded)
        assertEquals("Mukul", loaded.profile.name)

        // Required for StateFlow — it never completes
        cancelAndIgnoreRemainingEvents()
    }
}

// Gotcha: StateFlow deduplicates equal values
@Test
fun `refreshing with same data does not emit duplicate`() = runTest {
    val viewModel = ProfileViewModel(FakeProfileRepository())

    viewModel.uiState.test {
        awaitItem() // Idle
        viewModel.loadProfile("user-42")
        awaitItem() // Loading
        awaitItem() // Loaded with user data

        viewModel.refresh() // Fetches same user data
        awaitItem() // Loading
        // If the loaded data is structurally equal, no new emission here
        expectNoEvents()

        cancelAndIgnoreRemainingEvents()
    }
}
```

**Key takeaway:** Always consume the initial StateFlow value with `awaitItem()` before triggering actions. Always end with `cancelAndIgnoreRemainingEvents()`. Remember that StateFlow deduplicates equal values — structurally identical emissions are silently dropped.

### Lesson 5.4: Testing SharedFlow — Events and Navigation

SharedFlow is fundamentally different from StateFlow in ways that change how you test it. A SharedFlow with `replay = 0` has no initial value — calling `awaitItem()` immediately will suspend until something is emitted. SharedFlow doesn't conflate or deduplicate — if you emit A, B, C rapidly, every active collector sees all three. This makes SharedFlow ideal for event streams where dropping emissions would be a bug — navigation events, toasts, analytics.

When testing SharedFlow events alongside StateFlow state, use `turbineScope` with `testIn()`. This creates independent turbines that collect concurrently, letting you verify that a single user action both updates UI state and fires a navigation event. The order of assertions between the two turbines doesn't matter — each collects independently.

One thing to watch: if your SharedFlow has `replay > 0`, Turbine's `test {}` starts collecting and immediately receives the replayed emissions. If your SharedFlow has `replay = 0` and you emit values before calling `test {}`, those emissions are lost because no collector was active. Turbine guarantees collection starts before the lambda body runs, so always emit inside the `test {}` block, not before it.

```kotlin
@Test
fun `analytics events are all captured — no conflation`() = runTest {
    val tracker = AnalyticsTracker()

    tracker.events.test {
        tracker.track(AnalyticsEvent.ScreenView("home"))
        tracker.track(AnalyticsEvent.ButtonClick("search"))
        tracker.track(AnalyticsEvent.ScreenView("results"))

        assertEquals("home", (awaitItem() as AnalyticsEvent.ScreenView).screen)
        assertEquals("search", (awaitItem() as AnalyticsEvent.ButtonClick).id)
        assertEquals("results", (awaitItem() as AnalyticsEvent.ScreenView).screen)

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `login triggers both state update and navigation event`() = runTest {
    val viewModel = LoginViewModel(FakeLoginRepository(shouldSucceed = true))

    turbineScope {
        val states = viewModel.uiState.testIn(backgroundScope)
        val events = viewModel.navigationEvents.testIn(backgroundScope)

        assertEquals(LoginUiState.Idle, states.awaitItem())

        viewModel.onLoginClicked("user@test.com", "password123")

        assertEquals(LoginUiState.Loading, states.awaitItem())
        assertIs<LoginUiState.Success>(states.awaitItem())

        assertEquals(NavigationEvent.GoToHome, events.awaitItem())

        states.cancelAndIgnoreRemainingEvents()
        events.cancelAndIgnoreRemainingEvents()
    }
}
```

**Key takeaway:** SharedFlow doesn't conflate — every emission reaches every collector. Use it for events where dropping values is a bug. Use `turbineScope` with `testIn()` when testing multiple flows concurrently from the same ViewModel.

### Lesson 5.5: Turbine Timeout and Debugging

Turbine's default timeout is 3 seconds of wall clock time — not virtual time. When `awaitItem()` throws "No value produced in 3s," the instinct is to bump the timeout. But 99% of the time, the flow genuinely didn't emit. Maybe your ViewModel's coroutine is stuck on `StandardTestDispatcher` and needs an `advanceUntilIdle()` call. Maybe the `Dispatchers.Main` replacement isn't set up. Maybe the fake repository isn't returning data. The timeout is surfacing a real bug — don't silence it by making the timeout longer.

You can configure the timeout per `test` call for legitimate slow operations like integration tests with real I/O: `viewModel.state.test(timeout = 5.seconds) { ... }`. For fast unit tests, the default 3 seconds is generous. You can also set a global timeout for a block using `withTurbineTimeout(500.milliseconds) { ... }` to tighten the feedback loop.

When debugging Turbine failures, check these in order: (1) Is `MainDispatcherRule` set up? Without it, `viewModelScope.launch` deadlocks. (2) Is the fake returning data? Add a `println` in the fake to verify. (3) Are you using the right dispatcher? `StandardTestDispatcher` requires explicit `advanceUntilIdle()` calls. (4) Is StateFlow conflating your emission? Try `UnconfinedTestDispatcher` in the `MainDispatcherRule`. (5) Did you forget to consume the initial StateFlow value?

```kotlin
// Adjust timeout for slow integration tests
@Test
fun `integration test with real database`() = runTest {
    viewModel.state.test(timeout = 10.seconds) {
        awaitItem() // Initial
        viewModel.loadFromDatabase()
        awaitItem() // Loading
        awaitItem() // Loaded (may take longer with real I/O)
        cancelAndIgnoreRemainingEvents()
    }
}

// Tighten timeout for fast unit tests
@Test
fun `fast unit test with strict timeout`() = runTest {
    withTurbineTimeout(500.milliseconds) {
        flowOf("instant").test {
            assertEquals("instant", awaitItem())
            awaitComplete()
        }
    }
}
```

**Key takeaway:** A Turbine timeout failure is almost never a timeout problem — it's an emission problem. Check your dispatcher setup, fake configuration, and initial value consumption before increasing the timeout.

### Quiz: Flow Testing with Turbine

#### What happens if you forget to call `cancelAndIgnoreRemainingEvents()` in a StateFlow test?

- ❌ The test passes normally — it's optional for StateFlow
- ❌ The test runs slower but still passes
- ✅ The test hangs waiting for more emissions or fails with "Unconsumed events"
- ❌ Turbine automatically cancels after the last `awaitItem()`

> **Explanation:** StateFlow never completes — it's a hot flow. Without `cancelAndIgnoreRemainingEvents()`, Turbine either hangs waiting for the completion event that never comes, or detects that the flow is still active with unconsumed events and fails the test.

#### What does `expectNoEvents()` verify?

- ❌ That the flow has completed
- ❌ That the flow has emitted at least one item
- ✅ That no emissions, completions, or errors occurred — the flow is silent
- ❌ That the next emission will be null

> **Explanation:** `expectNoEvents()` asserts absolute silence — nothing happened. It's essential for testing debounce logic (verifying nothing fires during the delay window) and for confirming that a flow doesn't emit after a certain action.

#### Why is Turbine's timeout failure usually NOT a timeout problem?

- ❌ Turbine doesn't have a real timeout mechanism
- ❌ The timeout is always set too short by default
- ✅ The flow genuinely didn't emit — usually due to missing dispatcher setup, misconfigured fake, or forgotten initial value consumption
- ❌ Turbine timeouts only occur in integration tests

> **Explanation:** When Turbine says "No value produced in 3s," the flow really didn't emit. Common causes: `MainDispatcherRule` not set up (deadlocking `viewModelScope`), fake not returning data, or StateFlow's initial value not consumed. Increasing the timeout just delays the inevitable failure.

### Coding Challenge: Test a Paginated Feed

Write Turbine tests for a `FeedViewModel` that loads paginated content. Test three scenarios: initial load showing the first page, loading the next page appending to existing items, and reaching the end of content (no more pages). Use `expectNoEvents()` to verify no additional loads happen after the last page.

#### Solution

```kotlin
class FakePostRepository : PostRepository {
    private val pages = mutableMapOf<Int, List<Post>>()

    fun setPage(page: Int, posts: List<Post>) { pages[page] = posts }

    override suspend fun getPosts(page: Int): PagedResult<Post> {
        val posts = pages[page] ?: emptyList()
        return PagedResult(posts, hasNextPage = pages.containsKey(page + 1))
    }
}

class FeedViewModelTest {
    @get:Rule val mainDispatcherRule = MainDispatcherRule()
    private val fakeRepo = FakePostRepository()

    @Test
    fun `initial load shows first page`() = runTest {
        fakeRepo.setPage(0, listOf(Post("1", "First"), Post("2", "Second")))
        val viewModel = FeedViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.loadInitial()
            awaitItem() // Loading
            val loaded = awaitItem()
            assertIs<FeedState.Loaded>(loaded)
            assertEquals(2, loaded.posts.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `load next page appends to existing items`() = runTest {
        fakeRepo.setPage(0, listOf(Post("1", "First")))
        fakeRepo.setPage(1, listOf(Post("2", "Second")))
        val viewModel = FeedViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.loadInitial()
            awaitItem() // Loading
            awaitItem() // Page 0 loaded

            viewModel.loadNextPage()
            awaitItem() // LoadingMore
            val loaded = awaitItem()
            assertIs<FeedState.Loaded>(loaded)
            assertEquals(2, loaded.posts.size)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `no more pages stops loading`() = runTest {
        fakeRepo.setPage(0, listOf(Post("1", "Only")))
        val viewModel = FeedViewModel(fakeRepo)

        viewModel.state.test {
            awaitItem() // Idle
            viewModel.loadInitial()
            awaitItem() // Loading
            val loaded = awaitItem()
            assertIs<FeedState.Loaded>(loaded)
            assertFalse(loaded.hasMore)

            viewModel.loadNextPage() // Should be no-op
            expectNoEvents()

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

This exercise uses `expectNoEvents()` to verify pagination stops correctly and tests the full load-append-finish sequence.

---

## Module 6: The StateFlow Conflation Problem

StateFlow conflation is the single most confusing aspect of testing Android ViewModels. It causes tests that look correct to silently miss state transitions, and the fix requires understanding dispatcher scheduling at a level most developers never encounter. This module explains exactly what conflation is, why it happens, and the dispatcher asymmetry pattern that defeats it.

### Lesson 6.1: What Conflation Actually Means

Conflation is dropping intermediate values. When you set `StateFlow.value` three times in rapid succession, the internal implementation doesn't queue those values. It overwrites. StateFlow has a single backing field — `_state` — and every `.value =` assignment is an atomic write to that field. There's no buffer, no queue, no history. Just the latest value.

This is intentional. StateFlow is modeled as a state holder, not an event stream. The Kotlin documentation is explicit: "Updates to the value are always conflated. So a slow collector skips fast updates, but always collects the most recently emitted value." It represents what the state is right now, not the history of what it was. For UI rendering, this is exactly right — your screen doesn't need to render every intermediate loading state. If the state went from `Loading` to `Success` in 2 milliseconds, the user never saw loading anyway.

StateFlow also uses strong equality-based conflation. When you assign a new value, it compares the incoming value with the current one using `Any.equals()`. If they're equal, the assignment is a no-op — no collector gets notified. This is `distinctUntilChanged` baked into StateFlow at the implementation level. If your `equals()` implementation is broken — say it always returns true — your StateFlow will never notify collectors of any change.

```kotlin
// Conflation in action — intermediate values lost
val stateFlow = MutableStateFlow(0)

launch {
    stateFlow.collect { println("Collected: $it") }
}

stateFlow.value = 1  // might be overwritten before collector runs
stateFlow.value = 2  // might be overwritten before collector runs
stateFlow.value = 3  // collector sees this

// Output might only be: Collected: 0, Collected: 3
// Values 1 and 2 were conflated — they existed momentarily then disappeared
```

**Key takeaway:** StateFlow conflates by design — it overwrites intermediate values and deduplicates via `equals()`. This is correct for UI rendering but breaks tests that need to observe every state transition. Understanding conflation is prerequisite to testing ViewModels correctly.

### Lesson 6.2: The Test That Always Fails

Here's the exact problem you'll hit. Your ViewModel fetches a user profile — it sets `Loading`, awaits the network call, then sets `Loaded`. You write a test that collects the StateFlow and asserts the sequence: Idle → Loading → Loaded. It fails consistently. The test only ever sees Idle and Loaded. The Loading state was set and then immediately overwritten before the collector ever ran.

The reason comes down to how `StandardTestDispatcher` works — it's the default dispatcher for `runTest`. When you set `StateFlow.value = Loading`, it atomically updates the backing field and schedules the collector to resume. But `StandardTestDispatcher` queues all tasks and only executes them when you call `advanceUntilIdle()`. Before the scheduler processes the collector's resumption, the next line of ViewModel code executes — the fake repository returns synchronously, and `StateFlow.value = Loaded` overwrites Loading. When the collector finally runs, it reads the current value, which is already Loaded. Loading existed for a moment, then vanished.

This is the same reason your UI works fine — Compose reads `StateFlow.value` on each recomposition, so it always sees the latest state. But a test that expects to observe every intermediate emission gets burned by conflation.

```kotlin
// This test fails — Loading is conflated away
@Test
fun `loading profile shows loading then loaded`() = runTest {
    val viewModel = ProfileViewModel(FakeUserRepository())
    val states = mutableListOf<ProfileState>()

    val job = launch {
        viewModel.uiState.collect { states.add(it) }
    }

    viewModel.loadProfile("user-123")
    advanceUntilIdle()
    job.cancel()

    assertEquals(ProfileState.Idle, states[0])
    assertEquals(ProfileState.Loading, states[1])     // FAILS — states[1] is Loaded
    assertEquals(ProfileState.Loaded(fakeUser), states[2]) // never reached
}

// states only contains [Idle, Loaded] — Loading was overwritten
```

**Key takeaway:** `StandardTestDispatcher` queues tasks lazily, creating a window where StateFlow values are overwritten before any collector runs. This is why naive StateFlow tests miss intermediate states like Loading — they get conflated before the collector ever sees them.

### Lesson 6.3: StandardTestDispatcher vs UnconfinedTestDispatcher

Understanding these two dispatchers is the key to controlling conflation in tests. Both are `TestDispatcher` implementations that skip `delay()`, but they have fundamentally different scheduling behavior.

**`StandardTestDispatcher`** is lazy. When a coroutine is launched on it, the coroutine body doesn't execute immediately. It's queued on the test scheduler and only runs when you call `advanceUntilIdle()` or `runCurrent()`. This gives you precise control over execution order, but it means rapidly emitted StateFlow values pile up and conflate before any collector runs.

**`UnconfinedTestDispatcher`** is eager. Coroutines launched on it enter their body immediately — the `launch` call doesn't return until the coroutine hits its first suspension point. When StateFlow resumes a collector on `UnconfinedTestDispatcher`, the collector processes the value inline, right there, before the next line of producing code executes.

The critical insight: **the collector must be on `UnconfinedTestDispatcher` while the producer stays on `StandardTestDispatcher`**. If both are unconfined, the producer's value assignments happen without yielding, and you're back to conflation. The collector can only be "faster" than the producer if there's a dispatch boundary in the producer's execution path. `StandardTestDispatcher` provides that boundary.

```kotlin
// Both unconfined — conflation still happens
@Test
fun conflationReturnsWhenBothUnconfined() = runTest {
    val stateFlow = MutableStateFlow(0)

    launch(UnconfinedTestDispatcher(testScheduler)) {
        val values = stateFlow.take(2).toList()
        assertEquals(listOf(0, 3), values) // conflation happened — 1 and 2 lost
    }

    launch(UnconfinedTestDispatcher(testScheduler)) {
        stateFlow.value = 1
        stateFlow.value = 2
        stateFlow.value = 3
    }
}

// Asymmetry works — unconfined collector, standard producer
// Turbine uses UnconfinedTestDispatcher internally
// MainDispatcherRule with UnconfinedTestDispatcher makes ViewModel coroutines eager
// The result: Turbine sees every emission
```

**Key takeaway:** Use `UnconfinedTestDispatcher` in `MainDispatcherRule` to make ViewModel coroutines dispatch eagerly. Turbine's internal `UnconfinedTestDispatcher` collector then intercepts every value assignment before the next line of ViewModel code executes. This dispatcher asymmetry defeats conflation.

### Lesson 6.4: The MainDispatcherRule Pattern

The `MainDispatcherRule` is a JUnit `TestWatcher` that replaces `Dispatchers.Main` with a test dispatcher before each test and resets it after. Every ViewModel test class should include this rule. The dispatcher choice in the rule determines whether you can observe intermediate StateFlow emissions.

With `UnconfinedTestDispatcher` (the common default), ViewModel coroutines execute eagerly. Combined with Turbine, which collects eagerly, you get the asymmetry needed to observe every state transition. This is the setup used by Google's Now In Android sample and most modern Android projects.

With `StandardTestDispatcher`, ViewModel coroutines are lazy and require `advanceUntilIdle()` calls. This gives you more control but opens the door to conflation. Use this when you need precise control over execution order — like testing debounce timing or verifying that a long-running operation doesn't block the UI.

```kotlin
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

// With UnconfinedTestDispatcher — sees all transitions
class ProfileViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule() // defaults to Unconfined

    @Test
    fun `loading profile shows loading then loaded`() = runTest {
        val viewModel = ProfileViewModel(FakeUserRepository())

        viewModel.uiState.test {
            assertEquals(ProfileState.Idle, awaitItem())
            viewModel.loadProfile("user-123")
            assertEquals(ProfileState.Loading, awaitItem())     // now visible
            assertIs<ProfileState.Loaded>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

**Key takeaway:** `MainDispatcherRule` with `UnconfinedTestDispatcher` is the standard setup for ViewModel testing. It replaces `Dispatchers.Main`, makes `viewModelScope` coroutines eager, and combined with Turbine, defeats StateFlow conflation so you can observe every state transition.

### Lesson 6.5: When Conflation Is Acceptable

Not every test needs to observe intermediate states. Sometimes you genuinely only care about the final result — did the ViewModel end up in the right state after the action completed? In those cases, conflation is fine and you can assert directly on `StateFlow.value` without Turbine.

Reading `StateFlow.value` directly is the simplest approach: call the action, let everything settle, then check the value. No dispatcher tricks, no Turbine, no collection. This works for integration-style tests where you're verifying the final outcome, not the journey. It's also faster to write and read.

The rule of thumb: test state transitions when the intermediate states have user-visible effects (loading indicators, progress bars, disabled buttons). Test final state when the transitions are implementation details that the user never sees. A payment flow that shows "Processing..." to the user — test the full transition. A background sync that updates a badge count — just check the final count.

```kotlin
// When you only care about the final state
@Test
fun `loadProfile ends in loaded state`() = runTest {
    val viewModel = ProfileViewModel(FakeUserRepository())
    viewModel.loadProfile("user-123")
    advanceUntilIdle()
    val state = viewModel.uiState.value
    assertIs<ProfileState.Loaded>(state)
    assertEquals("Mukul", state.profile.name)
}

// When transitions matter — loading spinner is user-visible
@Test
fun `loadProfile shows loading spinner then content`() = runTest {
    val viewModel = ProfileViewModel(FakeUserRepository())
    viewModel.uiState.test {
        awaitItem() // Idle
        viewModel.loadProfile("user-123")
        assertEquals(ProfileState.Loading, awaitItem())  // spinner shown
        assertIs<ProfileState.Loaded>(awaitItem())       // content shown
        cancelAndIgnoreRemainingEvents()
    }
}
```

**Key takeaway:** Not every test needs to defeat conflation. Test state transitions when intermediate states are user-visible. Test final state when you only care about the outcome. Use `StateFlow.value` directly for simple final-state assertions.

### Lesson 6.6: Testing Debounced Search with Virtual Time

Debounced search combines StateFlow conflation challenges with virtual time control. The ViewModel delays search execution by 300ms to avoid hitting the API on every keystroke. In tests, `TestDispatcher` skips real `delay()` calls, but you use `advanceTimeBy()` to simulate the debounce window precisely.

The pattern is: type multiple queries rapidly, assert `expectNoEvents()` (nothing should happen during the debounce window), advance virtual time past the debounce threshold, then assert the search executes with only the final query. The intermediate queries ("k", "ko") never trigger a search because each new keystroke resets the debounce timer.

This is one case where `StandardTestDispatcher` in the `MainDispatcherRule` actually works in your favor. Because it gives you explicit control over time progression, you can advance time to exactly 299ms and verify nothing happened, then advance to 300ms and verify the search triggers. `UnconfinedTestDispatcher` would execute everything eagerly, making the debounce window collapse.

```kotlin
class SearchViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

    @Test
    fun `debounced search waits before executing`() = runTest {
        val viewModel = SearchViewModel(FakeSearchRepository())

        viewModel.uiState.test {
            assertEquals(SearchState.Idle, awaitItem())

            viewModel.onQueryChanged("kot")
            viewModel.onQueryChanged("kotl")
            viewModel.onQueryChanged("kotlin")

            advanceTimeBy(299)
            runCurrent()
            expectNoEvents() // debounce hasn't elapsed

            advanceTimeBy(1) // now at 300ms
            runCurrent()

            assertEquals(SearchState.Loading, awaitItem())
            val results = awaitItem()
            assertIs<SearchState.Results>(results)
            assertEquals("kotlin", results.query) // only final query searched

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

**Key takeaway:** Use `StandardTestDispatcher` with `advanceTimeBy()` for debounce testing. Verify silence during the debounce window with `expectNoEvents()`, then advance past the threshold and assert the search triggers with only the final query.

### Quiz: StateFlow Conflation

#### Why does StateFlow drop intermediate values when set rapidly?

- ❌ It's a bug in Kotlin coroutines that hasn't been fixed
- ❌ StateFlow has a buffer size of 1 that overflows
- ✅ StateFlow is a state holder with a single backing field — each assignment atomically overwrites the previous value
- ❌ StateFlow uses `distinctUntilChanged` which filters duplicates

> **Explanation:** StateFlow has one backing field. Each `.value =` assignment atomically overwrites it. There's no buffer or queue — just the latest value. Intermediate values exist momentarily then vanish. This is intentional — a state holder represents current state, not a changelog.

#### What dispatcher combination defeats StateFlow conflation in tests?

- ❌ Both producer and collector on `StandardTestDispatcher`
- ❌ Both producer and collector on `UnconfinedTestDispatcher`
- ✅ Producer on `StandardTestDispatcher` (lazy), collector on `UnconfinedTestDispatcher` (eager)
- ❌ Using `Dispatchers.Default` for both producer and collector

> **Explanation:** The collector must be eager (Unconfined) to intercept each value assignment immediately. The producer must have dispatch boundaries (Standard) so each value write yields control to the collector before the next write. Turbine provides the eager collector automatically.

#### When is it acceptable to ignore conflation and just check `StateFlow.value`?

- ❌ Never — every test must verify all state transitions
- ❌ Only in integration tests, never in unit tests
- ✅ When intermediate states are not user-visible and you only care about the final outcome
- ❌ When using Turbine — it handles conflation automatically

> **Explanation:** If intermediate states like Loading are implementation details with no user-visible effect, checking the final `StateFlow.value` is simpler and sufficient. Reserve transition testing for cases where the user sees loading indicators, progress bars, or temporary states.

### Coding Challenge: Debug a Conflation Problem

The following test fails because the `Loading` state is conflated away. Fix it using the correct dispatcher setup without changing the ViewModel code. Then write a second test that intentionally skips the loading state and only verifies the final result.

```kotlin
// Broken test — Loading is conflated
class OrderViewModelTest {
    @Test
    fun `placing order shows processing then confirmed`() = runTest {
        val viewModel = OrderViewModel(FakeOrderRepository())
        val states = mutableListOf<OrderState>()
        val job = launch { viewModel.state.collect { states.add(it) } }
        viewModel.placeOrder(OrderRequest("widget", 2))
        advanceUntilIdle()
        job.cancel()
        assertEquals(OrderState.Idle, states[0])
        assertEquals(OrderState.Processing, states[1])  // FAILS
        assertIs<OrderState.Confirmed>(states[2])
    }
}
```

#### Solution

```kotlin
class OrderViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule() // UnconfinedTestDispatcher

    // Fix 1: Use Turbine with proper dispatcher setup
    @Test
    fun `placing order shows processing then confirmed`() = runTest {
        val viewModel = OrderViewModel(FakeOrderRepository())

        viewModel.state.test {
            assertEquals(OrderState.Idle, awaitItem())
            viewModel.placeOrder(OrderRequest("widget", 2))
            assertEquals(OrderState.Processing, awaitItem())  // now visible
            assertIs<OrderState.Confirmed>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // Fix 2: Skip transitions, check final state only
    @Test
    fun `placing order ends in confirmed state`() = runTest {
        val viewModel = OrderViewModel(FakeOrderRepository())
        viewModel.placeOrder(OrderRequest("widget", 2))
        // No Turbine, no dispatcher tricks — just check the value
        val state = viewModel.state.value
        assertIs<OrderState.Confirmed>(state)
    }
}
```

The fix combines `MainDispatcherRule` (replacing `Dispatchers.Main` with `UnconfinedTestDispatcher`) with Turbine's eager collection. The second test demonstrates the simpler approach when you only need the final state.

---

## Module 7: Compose UI Testing

Compose tests are fundamentally different from the old Espresso/View-based tests. They run on the JVM using Robolectric, they interact with a semantic tree instead of view IDs, and they're fast and reliable. This module covers everything from basic composable tests to complex interaction patterns, accessibility testing, and screenshot testing.

### Lesson 7.1: Setting Up Compose Tests

Every Compose test class needs a `ComposeTestRule` — either `createComposeRule()` for testing standalone composables or `createAndroidComposeRule<Activity>()` for testing composables within an Activity. The test rule manages the Compose runtime, provides `setContent {}` to render your composable, and exposes the assertion and interaction API.

The test lifecycle is straightforward: set content with your composable, find nodes using matchers (`onNodeWithText`, `onNodeWithTag`, `onNodeWithContentDescription`), perform actions (`performClick`, `performTextInput`, `performScrollTo`), and assert state (`assertIsDisplayed`, `assertIsEnabled`, `assertTextEquals`). Compose waits for idle automatically between actions and assertions — no explicit `waitForIdle()` needed in most cases.

The key difference from View-based testing: you interact with the semantic tree, not the view hierarchy. Compose doesn't create `View` objects — it creates semantic nodes with properties like text, role, enabled state, and custom semantics. This makes tests resilient to layout changes. Moving a button from a `Column` to a `Row` doesn't break the test as long as the button's text or tag remains the same.

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

**Key takeaway:** Compose tests interact with the semantic tree, not the view hierarchy. Use `createComposeRule()`, find nodes with matchers, perform actions, and assert state. Tests are resilient to layout changes — only semantic properties matter.

### Lesson 7.2: Test Tags and Node Selection

`onNodeWithText()` works for simple cases, but it's fragile — rename a button label, translate to another language, and every test breaks. `testTag` provides a stable identifier that's independent of displayed text. Add `Modifier.testTag("login_button")` to your composable and use `onNodeWithTag("login_button")` in tests.

Use `testTag` for interactive elements (buttons, inputs, lists) and structural elements (containers, cards) that you need to find in tests. Don't tag every composable — only the ones your tests interact with. The tag is a testing affordance, not a production feature.

For complex UIs with multiple similar elements, combine matchers with `onAllNodes`. Use `onAllNodesWithTag("order_item")` to get all matching nodes, then assert on count or access individual nodes by index. For nested structures, use `onNodeWithTag("order_list").onChildren()` to navigate the semantic tree.

```kotlin
// In production code
@Composable
fun OrderItem(order: Order, modifier: Modifier = Modifier) {
    Card(modifier = modifier.testTag("order_item_${order.id}")) {
        Text(text = order.title, modifier = Modifier.testTag("order_title"))
        Text(text = "$${order.total}", modifier = Modifier.testTag("order_total"))
        Button(
            onClick = { /* ... */ },
            modifier = Modifier.testTag("reorder_button")
        ) {
            Text("Reorder")
        }
    }
}

// In tests
@Test
fun `order item shows title and total`() {
    composeTestRule.setContent {
        OrderItem(order = Order("1", "Widget Pack", 49.99))
    }

    composeTestRule.onNodeWithTag("order_title").assertTextEquals("Widget Pack")
    composeTestRule.onNodeWithTag("order_total").assertTextEquals("$49.99")
}

@Test
fun `order list shows correct number of items`() {
    composeTestRule.setContent {
        OrderList(orders = listOf(order1, order2, order3))
    }

    composeTestRule.onAllNodesWithTag("order_item", useUnmergedTree = true)
        .assertCountEquals(3)
}
```

**Key takeaway:** Use `testTag` for stable node selection independent of displayed text. Tag interactive and structural elements — not everything. Use `onAllNodes` and `onChildren()` for lists and repeated elements.

### Lesson 7.3: Testing Stateful Composables

Stateful composables manage their own state with `remember` and `mutableStateOf`. Tests for these composables verify that user interactions correctly update the visual state. Click a button — does the count increment? Type in a field — does the text appear? Toggle a switch — does the related content show or hide?

The pattern is simple: set content, verify initial state, perform an action, verify updated state. Compose's test rule automatically waits for recomposition between actions and assertions, so state changes are reflected immediately. No `waitForIdle()` or `advanceUntilIdle()` needed.

For composables that receive state from a ViewModel, you have two testing strategies. **Isolated testing** passes static state and callback lambdas — test the composable in isolation from the ViewModel. **Integration testing** renders the composable with a real ViewModel (using fakes) and verifies the full stack. Isolated tests are faster and more focused; integration tests catch wiring bugs.

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

// Isolated test — static state, callback lambdas
@Test
fun `profile screen shows user name and triggers edit on click`() {
    var editClicked = false

    composeTestRule.setContent {
        ProfileScreen(
            state = ProfileUiState.Loaded(User("1", "Mukul")),
            onEditClick = { editClicked = true }
        )
    }

    composeTestRule.onNodeWithText("Mukul").assertIsDisplayed()
    composeTestRule.onNodeWithTag("edit_button").performClick()
    assertTrue(editClicked)
}
```

**Key takeaway:** Test stateful composables by verifying state changes after user interactions. Use isolated tests (static state + callback lambdas) for focused composable testing, and integration tests (real ViewModel with fakes) for verifying the full stack.

### Lesson 7.4: Testing Lists, Scrolling, and Lazy Layouts

`LazyColumn` and `LazyRow` only compose items that are visible on screen. This means items outside the viewport don't exist in the semantic tree until you scroll to them. Use `performScrollToIndex()` or `performScrollToNode()` to bring items into view before asserting on them.

For testing list item counts, `onChildren().assertCountEquals()` only counts currently composed children. To verify the total list size, either render with a small enough list that all items fit, or scroll to the end and count. The pragmatic approach is to verify the data source size in a unit test and the rendering of individual items in a Compose test.

Interaction testing with lists follows the same pattern: scroll to the item, find the interactive element within it, perform the action, and assert the result. Use `onNodeWithTag` with unique tags per item (like `"order_item_${order.id}"`) to target specific items in the list.

```kotlin
@Test
fun `lazy list scrolls to show item at position 15`() {
    val items = (1..30).map { "Item $it" }

    composeTestRule.setContent {
        LazyColumn(modifier = Modifier.testTag("item_list")) {
            items(items) { item ->
                Text(text = item, modifier = Modifier.testTag("list_item_$item"))
            }
        }
    }

    // Item 15 is offscreen initially
    composeTestRule.onNodeWithTag("list_item_Item 15").assertDoesNotExist()

    // Scroll to it
    composeTestRule.onNodeWithTag("item_list").performScrollToIndex(14)

    // Now it's visible
    composeTestRule.onNodeWithTag("list_item_Item 15").assertIsDisplayed()
}

@Test
fun `clicking delete on list item removes it`() {
    composeTestRule.setContent {
        TodoScreen(initialItems = listOf("Task A", "Task B", "Task C"))
    }

    composeTestRule.onAllNodesWithTag("todo_item").assertCountEquals(3)

    composeTestRule.onNodeWithTag("delete_Task B").performClick()

    composeTestRule.onAllNodesWithTag("todo_item").assertCountEquals(2)
    composeTestRule.onNodeWithText("Task B").assertDoesNotExist()
}
```

**Key takeaway:** `LazyColumn` items only exist in the semantic tree when visible. Use `performScrollToIndex()` to bring items into view before asserting. Use unique `testTag` per list item for precise targeting.

### Lesson 7.5: Screenshot Testing with Compose

Screenshot testing captures a composable's rendered output and compares it against a saved "golden" image. If the rendering changes, the test fails and shows a visual diff. This catches unintended visual regressions — color changes, padding shifts, font mismatches — that functional tests miss entirely.

The setup requires a screenshot testing library (Paparazzi for JVM, Roborazzi for Robolectric, or Compose's built-in `captureToImage()`). The workflow is: run tests once to generate golden images, commit them to source control, then run tests on every PR to detect visual changes. When an intentional change occurs, update the golden images.

Screenshot tests are most valuable for design system components (buttons, cards, dialogs) that must look consistent across the app. They're less useful for screens with dynamic data, because you'd need to inject identical test data for every run. Use them strategically — a few dozen screenshot tests for core components catch more visual bugs than hundreds of functional assertions about colors and sizes.

```kotlin
@Test
fun `profile card renders correctly in light mode`() {
    composeTestRule.setContent {
        AppTheme(darkTheme = false) {
            ProfileCard(user = User("1", "Mukul", "Senior Android Engineer"))
        }
    }

    composeTestRule
        .onNodeWithTag("profile_card")
        .captureToImage()
        .assertAgainstGolden(goldenFile = "profile_card_light")
}

@Test
fun `profile card renders correctly in dark mode`() {
    composeTestRule.setContent {
        AppTheme(darkTheme = true) {
            ProfileCard(user = User("1", "Mukul", "Senior Android Engineer"))
        }
    }

    composeTestRule
        .onNodeWithTag("profile_card")
        .captureToImage()
        .assertAgainstGolden(goldenFile = "profile_card_dark")
}
```

**Key takeaway:** Screenshot tests catch visual regressions that functional tests miss. Use them for design system components that must be visually consistent. Generate golden images, commit them, and compare on every PR.

### Quiz: Compose UI Testing

#### What is the purpose of `testTag` in Compose testing?

- ❌ It adds a visible label to the UI component
- ❌ It enables screenshot testing for the composable
- ✅ It provides a stable identifier for precise node selection in tests, independent of displayed text
- ❌ It marks a composable for performance profiling

> **Explanation:** `testTag` attaches a semantic identifier to a composable that tests can use with `onNodeWithTag()`. Unlike `onNodeWithText()`, it doesn't depend on displayed text, making tests resilient to copy changes and localization.

#### Why do `LazyColumn` items need `performScrollToIndex()` before asserting?

- ❌ Lazy layouts load data asynchronously
- ✅ `LazyColumn` only composes items that are visible on screen — offscreen items don't exist in the semantic tree
- ❌ `performScrollToIndex()` triggers recomposition which is required for assertions
- ❌ It's a workaround for a Compose testing bug

> **Explanation:** `LazyColumn` is lazy — it only creates composable instances for items currently visible in the viewport. Items outside the viewport don't exist in the semantic tree, so `onNodeWithTag` can't find them. Scrolling brings them into view and into the tree.

#### What is the advantage of isolated composable tests over integration tests?

- ❌ Isolated tests cover more code paths
- ✅ Isolated tests are faster and more focused — they test the composable without ViewModel or data layer dependencies
- ❌ Isolated tests don't require a `ComposeTestRule`
- ❌ Isolated tests can run without the JVM

> **Explanation:** Isolated tests pass static state and callback lambdas, testing the composable in isolation. They're fast because there's no ViewModel, no fakes, no coroutines — just UI rendering and interaction. Integration tests catch wiring bugs but are slower and more complex.

### Coding Challenge: Test a Shopping Cart Screen

Write Compose tests for a `CartScreen` that shows a list of cart items (tag: `"cart_list"`), each with a quantity stepper (tags: `"increase_qty_{id}"`, `"decrease_qty_{id}"`), a remove button (tag: `"remove_{id}"`), and a total price display (tag: `"cart_total"`). Test: increasing quantity updates the total, removing an item removes it from the list, and an empty cart shows an empty state message.

#### Solution

```kotlin
class CartScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `increasing quantity updates total`() {
        composeTestRule.setContent {
            CartScreen(initialItems = listOf(CartItem("1", "Widget", 10.0, qty = 1)))
        }

        composeTestRule.onNodeWithTag("cart_total").assertTextContains("$10.00")

        composeTestRule.onNodeWithTag("increase_qty_1").performClick()

        composeTestRule.onNodeWithTag("cart_total").assertTextContains("$20.00")
    }

    @Test
    fun `removing item removes it from list`() {
        composeTestRule.setContent {
            CartScreen(initialItems = listOf(
                CartItem("1", "Widget", 10.0, qty = 1),
                CartItem("2", "Gadget", 20.0, qty = 1)
            ))
        }

        composeTestRule.onAllNodesWithTag("cart_item", useUnmergedTree = true)
            .assertCountEquals(2)

        composeTestRule.onNodeWithTag("remove_1").performClick()

        composeTestRule.onAllNodesWithTag("cart_item", useUnmergedTree = true)
            .assertCountEquals(1)
        composeTestRule.onNodeWithText("Widget").assertDoesNotExist()
    }

    @Test
    fun `empty cart shows empty state`() {
        composeTestRule.setContent {
            CartScreen(initialItems = emptyList())
        }

        composeTestRule.onNodeWithText("Your cart is empty").assertIsDisplayed()
        composeTestRule.onNodeWithTag("cart_list").assertDoesNotExist()
    }
}
```

This challenge combines list assertions, interaction testing with unique tags, computed total verification, and empty state handling.

---

## Module 8: Integration Testing — Room, MockWebServer, and End-to-End

Integration tests verify that components work together correctly — that your DAO persists and queries data with your actual schema, that your API client parses real JSON responses, and that your repository correctly coordinates between network and cache. These tests use real implementations, not fakes, making them slower but more trustworthy for catching wiring bugs.

### Lesson 8.1: Testing with Room

Room integration tests verify your SQL queries, database schema, and migration logic. Use `Room.inMemoryDatabaseBuilder()` to create a database that lives entirely in RAM — it's fast, doesn't write to disk, and is automatically cleaned up. Each test starts with a fresh database, preventing test pollution.

The test structure follows a clear pattern: create the in-memory database in `@Before`, close it in `@After`, and run queries in each test. Use `allowMainThreadQueries()` to simplify test code — Room normally prevents main-thread access to avoid ANRs, but tests run synchronously and don't need background threading.

For DAOs that return `Flow`, use Turbine to verify reactive behavior. Insert a record, verify the flow emits the updated list. Delete a record, verify the flow emits without it. This tests the reactive contract — that Room's `Flow` DAOs actually notify observers when the underlying data changes.

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
    fun teardown() { database.close() }

    @Test
    fun `insert and retrieve user by id`() = runTest {
        val user = UserEntity("1", "Mukul", "mukul@test.com")
        userDao.insert(user)

        val retrieved = userDao.getById("1")
        assertEquals(user, retrieved)
    }

    @Test
    fun `observe users emits on insert`() = runTest {
        userDao.observeAll().test {
            assertEquals(emptyList<UserEntity>(), awaitItem())

            userDao.insert(UserEntity("1", "Mukul", "mukul@test.com"))
            val users = awaitItem()
            assertEquals(1, users.size)
            assertEquals("Mukul", users[0].name)

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `delete user removes from database`() = runTest {
        userDao.insert(UserEntity("1", "Mukul", "mukul@test.com"))
        userDao.deleteById("1")

        val retrieved = userDao.getById("1")
        assertNull(retrieved)
    }

    @Test
    fun `query users by name pattern`() = runTest {
        userDao.insert(UserEntity("1", "Mukul Jangra", "mukul@test.com"))
        userDao.insert(UserEntity("2", "Priya Sharma", "priya@test.com"))
        userDao.insert(UserEntity("3", "Mukul Kumar", "kumar@test.com"))

        val results = userDao.searchByName("%Mukul%")
        assertEquals(2, results.size)
    }
}
```

**Key takeaway:** Use `Room.inMemoryDatabaseBuilder` for fast, isolated database tests. Test SQL queries with real data, verify reactive DAOs with Turbine, and always close the database in `@After` to prevent leaks.

### Lesson 8.2: Testing with MockWebServer

`MockWebServer` from OkHttp is a local HTTP server that runs in your test process. You enqueue predefined responses and your Retrofit client makes real HTTP requests to it. This tests the full HTTP stack — URL construction, header attachment, request body serialization, response parsing, error handling — without touching a real backend.

The setup pattern: start `MockWebServer` in `@Before`, create a Retrofit instance pointed at `mockWebServer.url("/")`, shut down in `@After`. Then enqueue responses with `MockResponse()` and invoke your API. You can verify the request the client sent using `mockWebServer.takeRequest()` to inspect the URL, headers, and body.

Test four scenarios for every API endpoint: successful response (200 with valid JSON), client error (4xx), server error (5xx), and network timeout. The timeout test uses `setBodyDelay()` to simulate a slow server and verifies your client's timeout configuration actually works. These four tests catch the most common API integration bugs.

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
            .client(OkHttpClient.Builder()
                .readTimeout(2, TimeUnit.SECONDS)
                .build())
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
        assertEquals("mukul@test.com", user.email)
    }

    @Test
    fun `getUser sends correct request path`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody("{}"))

        api.getUser("user-42")

        val request = mockWebServer.takeRequest()
        assertEquals("/users/user-42", request.path)
        assertEquals("GET", request.method)
    }

    @Test
    fun `getUser throws on 404`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(404))
        assertThrows<HttpException> { api.getUser("nonexistent") }
    }

    @Test
    fun `getUser throws on server error`() = runTest {
        mockWebServer.enqueue(MockResponse().setResponseCode(500))
        assertThrows<HttpException> { api.getUser("1") }
    }

    @Test
    fun `getUser throws on timeout`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setBodyDelay(5, TimeUnit.SECONDS)
                .setBody("""{"id":"1","name":"Mukul"}""")
        )
        assertThrows<SocketTimeoutException> { api.getUser("1") }
    }
}
```

**Key takeaway:** `MockWebServer` tests the full HTTP stack without a real backend. Test success, client errors, server errors, and timeouts for every endpoint. Use `takeRequest()` to verify request construction.

### Lesson 8.3: End-to-End Repository Tests

Repository integration tests wire together the real API client (pointed at MockWebServer), the real DAO (backed by an in-memory Room database), and the real repository implementation. This tests the complete data flow: API response → DTO parsing → domain mapping → database persistence → Flow emission.

These tests are slower than unit tests but catch bugs that unit tests with fakes miss entirely: DTO fields mapped to wrong entity columns, Flow emissions not triggered after database inserts, JSON parsing failures on edge-case responses, transaction boundaries not applied correctly.

Run these tests sparingly — for the most critical data paths. A repository that handles user authentication, payment processing, or core content delivery deserves end-to-end tests. A repository that fetches static configuration data probably doesn't.

```kotlin
@RunWith(AndroidJUnit4::class)
class UserRepositoryIntegrationTest {
    private val mockWebServer = MockWebServer()
    private lateinit var database: AppDatabase
    private lateinit var repository: UserRepositoryImpl

    @Before
    fun setup() {
        mockWebServer.start()
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        val api = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(UserApi::class.java)

        repository = UserRepositoryImpl(api, database.userDao())
    }

    @After
    fun teardown() {
        database.close()
        mockWebServer.shutdown()
    }

    @Test
    fun `refreshUser fetches from API and persists to database`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"id":"1","name":"Mukul","email":"mukul@test.com"}""")
        )

        repository.refreshUser("1")

        val cached = database.userDao().getById("1")
        assertNotNull(cached)
        assertEquals("Mukul", cached!!.name)
    }

    @Test
    fun `observeUser emits cached then fresh data`() = runTest {
        database.userDao().insert(UserEntity("1", "Mukul (cached)", "old@test.com"))

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"id":"1","name":"Mukul (fresh)","email":"new@test.com"}""")
        )

        repository.observeUser("1").test {
            assertEquals("Mukul (cached)", awaitItem().name)
            assertEquals("Mukul (fresh)", awaitItem().name)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

**Key takeaway:** End-to-end repository tests wire real components together — MockWebServer, in-memory Room, real repository. They catch wiring bugs that unit tests with fakes miss. Use them for critical data paths, not every repository.

### Lesson 8.4: Testing Serialization

Serialization tests verify that your JSON parsing configuration handles real-world API responses correctly. They catch the bugs that only surface when the backend returns unexpected data — null fields, empty arrays, unknown enum values, nested objects with missing keys.

Create test JSON fixtures that mirror real API responses, including edge cases you've encountered in production. Parse them with your actual Moshi or Kotlin Serialization configuration and verify the resulting objects. These tests run instantly on the JVM and prevent entire categories of production crashes.

The most valuable serialization tests cover: fields that the backend occasionally sends as null, enum values that might be added in the future (handle with a default or `@JsonClass` fallback), date/time formats that vary between endpoints, and nested objects that can be either an object or an array depending on the response.

```kotlin
class UserDtoSerializationTest {
    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()
    private val adapter = moshi.adapter(UserDto::class.java)

    @Test
    fun `parses complete user response`() {
        val json = """{"id":"1","name":"Mukul","email":"mukul@test.com","role":"admin"}"""
        val user = adapter.fromJson(json)!!
        assertEquals("1", user.id)
        assertEquals("Mukul", user.name)
        assertEquals("admin", user.role)
    }

    @Test
    fun `handles null email gracefully`() {
        val json = """{"id":"1","name":"Mukul","email":null,"role":"user"}"""
        val user = adapter.fromJson(json)!!
        assertNull(user.email)
    }

    @Test
    fun `handles unknown role with default`() {
        val json = """{"id":"1","name":"Mukul","email":"m@test.com","role":"superadmin"}"""
        val user = adapter.fromJson(json)!!
        assertEquals("unknown", user.role) // fallback for unrecognized roles
    }

    @Test
    fun `round-trips correctly`() {
        val original = UserDto("1", "Mukul", "mukul@test.com", "admin")
        val json = adapter.toJson(original)
        val parsed = adapter.fromJson(json)!!
        assertEquals(original, parsed)
    }
}
```

**Key takeaway:** Serialization tests prevent production crashes from unexpected API responses. Test null fields, unknown enums, and edge-case formats. These tests are instant and catch bugs that would crash your app in the field.

### Lesson 8.5: Testing Database Migrations

When you change your Room schema (add a column, rename a table, change a type), you need a migration to preserve existing data. Migration tests verify that the migration SQL runs correctly and that data survives the schema change. Without these tests, users who update your app can lose their local data or crash on launch.

Room provides `MigrationTestHelper` for this purpose. It creates a database at the old schema version, populates it with test data, runs the migration, and then verifies the data is accessible at the new schema version. The helper uses your actual migration objects, so it tests the real SQL you'll ship.

Test every migration path your users might encounter. If you're at version 5, test 4→5, but also 3→5 and 2→5 for users who skipped intermediate app updates. The most common migration bugs: typos in ALTER TABLE SQL, incorrect column defaults, and forgetting to handle NULL values in existing rows.

```kotlin
@RunWith(AndroidJUnit4::class)
class MigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        AppDatabase::class.java
    )

    @Test
    fun `migration from 1 to 2 adds email column`() {
        // Create database at version 1
        val db = helper.createDatabase(TEST_DB, 1).apply {
            execSQL("INSERT INTO users (id, name) VALUES ('1', 'Mukul')")
            close()
        }

        // Run migration to version 2
        val migratedDb = helper.runMigrationsAndValidate(TEST_DB, 2, true, MIGRATION_1_2)

        // Verify data survived with new column defaulting to empty string
        val cursor = migratedDb.query("SELECT * FROM users WHERE id = '1'")
        assertTrue(cursor.moveToFirst())
        assertEquals("Mukul", cursor.getString(cursor.getColumnIndex("name")))
        assertEquals("", cursor.getString(cursor.getColumnIndex("email")))
        cursor.close()
    }

    companion object {
        private const val TEST_DB = "migration-test"
    }
}
```

**Key takeaway:** Test every database migration to prevent data loss on app updates. Use `MigrationTestHelper` to create databases at old versions, run migrations, and verify data survives the schema change.

### Quiz: Integration Testing

#### Why should you use `Room.inMemoryDatabaseBuilder` instead of a regular database builder in tests?

- ❌ In-memory databases support more SQL features
- ✅ In-memory databases are fast and automatically destroyed after each test, ensuring test isolation
- ❌ In-memory databases can test migrations
- ❌ In-memory databases work on JVM without Android context

> **Explanation:** `inMemoryDatabaseBuilder` creates a database that lives entirely in RAM — it's fast to create, doesn't write to disk, and is automatically cleaned up. This ensures each test starts with a fresh database, preventing test pollution.

#### What does `MockWebServer.takeRequest()` return?

- ❌ The MockResponse that was enqueued
- ❌ The parsed response body as a Kotlin object
- ✅ The actual HTTP request sent by your client — including URL, method, headers, and body
- ❌ A boolean indicating whether the request was successful

> **Explanation:** `takeRequest()` returns the `RecordedRequest` object representing the HTTP request your client actually sent. You can inspect the URL path, HTTP method, headers, and request body to verify your client is constructing requests correctly.

#### What is the most common migration bug that tests catch?

- ❌ Using the wrong version number in the migration
- ✅ Typos in ALTER TABLE SQL, incorrect column defaults, and mishandled NULL values
- ❌ Forgetting to increment the database version
- ❌ Using inMemoryDatabaseBuilder instead of regular builder

> **Explanation:** Migration SQL runs directly on the database engine with no compile-time checking. Typos (`ALTER TABEL` instead of `ALTER TABLE`), wrong default values, and NULL handling bugs only surface at runtime. Migration tests catch these before they reach users.

### Coding Challenge: Full Integration Test

Write an integration test combining MockWebServer and in-memory Room to test a `WeatherRepository`. Verify three flows: successful API fetch persists to cache, subsequent reads come from cache when network is unavailable, and stale cache is refreshed when network returns.

#### Solution

```kotlin
@RunWith(AndroidJUnit4::class)
class WeatherRepositoryIntegrationTest {
    private val mockWebServer = MockWebServer()
    private lateinit var database: AppDatabase
    private lateinit var repository: WeatherRepositoryImpl

    @Before
    fun setup() {
        mockWebServer.start()
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).allowMainThreadQueries().build()

        val api = Retrofit.Builder()
            .baseUrl(mockWebServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(WeatherApi::class.java)

        repository = WeatherRepositoryImpl(api, database.weatherDao())
    }

    @After
    fun teardown() {
        database.close()
        mockWebServer.shutdown()
    }

    @Test
    fun `fetch persists to cache`() = runTest {
        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setBody("""{"city":"Delhi","tempC":35.0}""")
        )

        repository.refreshWeather("Delhi")

        val cached = database.weatherDao().getByCity("Delhi")
        assertNotNull(cached)
        assertEquals(35.0, cached!!.tempC, 0.1)
    }

    @Test
    fun `reads from cache when network unavailable`() = runTest {
        database.weatherDao().insert(WeatherEntity("Delhi", 35.0, System.currentTimeMillis()))
        mockWebServer.enqueue(MockResponse().setResponseCode(503))

        val weather = repository.getWeather("Delhi")

        assertEquals("Delhi", weather.city)
        assertEquals(35.0, weather.tempC, 0.1)
    }

    @Test
    fun `refreshes stale cache when network returns`() = runTest {
        database.weatherDao().insert(WeatherEntity("Delhi", 30.0, 0L))

        mockWebServer.enqueue(
            MockResponse().setResponseCode(200)
                .setBody("""{"city":"Delhi","tempC":42.0}""")
        )

        repository.refreshWeather("Delhi")

        val updated = database.weatherDao().getByCity("Delhi")
        assertEquals(42.0, updated!!.tempC, 0.1)
    }
}
```

This exercise wires real components together to verify the complete offline-first data flow.

---

## Module 9: Test-Driven Development (TDD)

TDD flips the traditional development workflow: write the test first, watch it fail, write the minimum code to pass, then refactor. It sounds counterintuitive — how do you test something that doesn't exist yet? But TDD is a design tool as much as a testing technique. Writing the test first forces you to think about the interface before the implementation, leading to cleaner APIs and more focused code.

### Lesson 9.1: The Red-Green-Refactor Cycle

The TDD cycle has exactly three steps. **Red**: write a test for behavior that doesn't exist yet. The test fails — that's the point. The failing test proves your test can actually detect a bug. If a new test passes immediately, either the behavior already exists or the test is broken. **Green**: write the minimum code to make the test pass. Don't optimize, don't handle edge cases, don't make it pretty. Just make it work. **Refactor**: now that the test is green, improve the code. Extract methods, rename variables, simplify logic. The test is your safety net — if it stays green, your refactoring is safe.

The discipline of "minimum code" in the Green step is crucial. It prevents over-engineering. Without TDD, you might write a generic, configurable, extensible solution for a problem that only needs a simple `if` statement. The test constrains you — it defines exactly what behavior is needed, nothing more.

Each cycle should take 5-15 minutes. If you're spending 30 minutes on a single Red-Green-Refactor iteration, the step is too big. Break it down into smaller behaviors. Instead of "the payment flow handles all error cases," start with "the payment flow rejects negative amounts." Build up the behavior one test at a time.

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

// Step 3: REFACTOR — add the next behavior
@Test
fun `password must contain at least one digit`() {
    val validator = PasswordValidator()
    assertFalse(validator.isValid("NoDigitsHere"))
    assertTrue(validator.isValid("HasDigit1"))
}

// GREEN again — extend the implementation
class PasswordValidator {
    fun isValid(password: String): Boolean {
        if (password.length < 8) return false
        if (!password.any { it.isDigit() }) return false
        return true
    }
}
```

**Key takeaway:** TDD is Red-Green-Refactor: write a failing test, make it pass with minimum code, then clean up. Each cycle should take 5-15 minutes. If it's taking longer, the step is too big — break it down.

### Lesson 9.2: When TDD Works Best

TDD shines for code with clear, well-defined rules: validators, calculators, parsers, state machines, reducers, mappers. You can express the expected behavior as a test before writing any implementation because the specification is precise. "An email must contain exactly one @ followed by a domain" translates directly into test cases.

TDD is less practical for exploratory work where you don't know what the interface should look like yet, for UI layout where the visual result matters more than function calls, and for third-party integrations where you don't control the API. In these cases, write the code first, then add tests to lock down the behavior.

The pragmatic approach: use TDD for domain logic and business rules (the center of your architecture), and write tests after implementation for UI, infrastructure, and integration code (the edges). The goal is well-tested code, not dogmatic adherence to a process. Some of the best engineers I know use TDD for 60% of their code and test-after for the rest.

```kotlin
// TDD is perfect for state machines
// Step 1: Define the expected behavior as a test
@Test
fun `idle order transitions to confirmed on confirm`() {
    val machine = OrderStateMachine(OrderState.IDLE)
    machine.handle(OrderEvent.CONFIRM)
    assertEquals(OrderState.CONFIRMED, machine.currentState)
}

@Test
fun `confirmed order transitions to shipped on ship`() {
    val machine = OrderStateMachine(OrderState.CONFIRMED)
    machine.handle(OrderEvent.SHIP)
    assertEquals(OrderState.SHIPPED, machine.currentState)
}

@Test
fun `idle order cannot be shipped directly`() {
    val machine = OrderStateMachine(OrderState.IDLE)
    assertThrows<IllegalStateException> {
        machine.handle(OrderEvent.SHIP)
    }
}

// Step 2: Implement the state machine to pass all tests
class OrderStateMachine(initialState: OrderState) {
    var currentState: OrderState = initialState
        private set

    fun handle(event: OrderEvent) {
        currentState = when (currentState to event) {
            OrderState.IDLE to OrderEvent.CONFIRM -> OrderState.CONFIRMED
            OrderState.CONFIRMED to OrderEvent.SHIP -> OrderState.SHIPPED
            OrderState.SHIPPED to OrderEvent.DELIVER -> OrderState.DELIVERED
            else -> throw IllegalStateException(
                "Cannot handle $event in state $currentState"
            )
        }
    }
}
```

**Key takeaway:** Use TDD for business logic with clear rules — validators, calculators, state machines, parsers. Write tests after implementation for UI, infrastructure, and exploratory code. The goal is well-tested code, not religious process adherence.

### Lesson 9.3: TDD for ViewModel Business Logic

TDD works well for ViewModel logic when you define the state transitions before implementing them. Write a test for each user action and its expected state change, then implement the ViewModel to satisfy the tests. This approach produces ViewModels with clean, predictable state management.

Start with the simplest case — the initial state. Then add actions one at a time: load data, handle error, retry, filter, sort. Each test defines one behavior, and the ViewModel grows to satisfy them all. By the time you're done, you have a ViewModel with 100% coverage and a test suite that serves as executable documentation.

The key discipline: don't look ahead. When writing the test for "load success," don't also implement error handling. Wait until you write the test for "load error" in the next cycle. This incremental approach catches design issues early — if the fifth test requires restructuring the state, you catch it at the fifth test, not after implementing 20 features.

```kotlin
// Cycle 1: Initial state
@Test
fun `initial state is idle`() = runTest {
    val viewModel = TodoViewModel(FakeTodoRepository())
    assertEquals(TodoState.Idle, viewModel.state.value)
}

// Cycle 2: Loading todos
@Test
fun `loadTodos transitions to loading then loaded`() = runTest {
    val repo = FakeTodoRepository()
    repo.setTodos(listOf(Todo("1", "Buy milk")))
    val viewModel = TodoViewModel(repo)

    viewModel.state.test {
        awaitItem() // Idle
        viewModel.loadTodos()
        awaitItem() // Loading
        val loaded = awaitItem()
        assertIs<TodoState.Loaded>(loaded)
        assertEquals(1, loaded.todos.size)
        cancelAndIgnoreRemainingEvents()
    }
}

// Cycle 3: Adding a todo
@Test
fun `addTodo appends to existing list`() = runTest {
    val repo = FakeTodoRepository()
    repo.setTodos(listOf(Todo("1", "Buy milk")))
    val viewModel = TodoViewModel(repo)

    viewModel.state.test {
        awaitItem() // Idle
        viewModel.loadTodos()
        awaitItem() // Loading
        awaitItem() // Loaded with 1 item

        viewModel.addTodo("Walk dog")
        val updated = awaitItem()
        assertIs<TodoState.Loaded>(updated)
        assertEquals(2, updated.todos.size)
        assertEquals("Walk dog", updated.todos.last().title)
        cancelAndIgnoreRemainingEvents()
    }
}

// Cycle 4: Error handling
@Test
fun `loadTodos shows error on failure`() = runTest {
    val repo = FakeTodoRepository().apply { shouldFail = true }
    val viewModel = TodoViewModel(repo)

    viewModel.state.test {
        awaitItem() // Idle
        viewModel.loadTodos()
        awaitItem() // Loading
        assertIs<TodoState.Error>(awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

**Key takeaway:** TDD for ViewModels means defining state transitions before implementing them. Write one test per behavior, implement to pass, then move to the next behavior. The result is a ViewModel with clean state management and comprehensive coverage.

### Lesson 9.4: TDD Anti-Patterns

The first anti-pattern is **writing all tests at once**. TDD is iterative — write one test, make it pass, refactor, repeat. Writing 15 tests upfront is spec-driven development, not TDD. You lose the feedback loop that makes TDD valuable.

The second anti-pattern is **testing private methods**. If you feel the need to test a private method, the class is probably doing too much. Extract the logic into a separate class with a public API and test that. Private methods are implementation details — testing them couples your tests to the implementation and makes refactoring painful.

The third anti-pattern is **testing the obvious**. Don't write a test that `assertEquals(1 + 1, 2)` or that a data class getter returns the value you set. TDD tests should define behavior that requires implementation — if the test would pass with an empty class body, it's not testing anything useful.

The fourth anti-pattern is **big steps**. If your test requires 50 lines of implementation to pass, the step is too big. Break it into smaller behaviors. "The checkout system calculates totals, applies discounts, validates inventory, and processes payment" is four separate TDD cycles, not one.

```kotlin
// Anti-pattern: Testing private methods
class UserService {
    private fun sanitizeEmail(email: String): String {
        return email.trim().lowercase()
    }
    // Don't test sanitizeEmail directly — test through the public API
}

// Better: Extract and test publicly
class EmailSanitizer {
    fun sanitize(email: String): String = email.trim().lowercase()
}

@Test
fun `sanitizer trims whitespace and lowercases`() {
    val sanitizer = EmailSanitizer()
    assertEquals("user@test.com", sanitizer.sanitize("  User@Test.COM  "))
}

// Anti-pattern: Testing the obvious
@Test
fun `user has name`() {
    val user = User("1", "Mukul")
    assertEquals("Mukul", user.name) // This tests Kotlin data classes, not your code
}
```

**Key takeaway:** Avoid TDD anti-patterns: don't write all tests at once, don't test private methods (extract them instead), don't test the obvious, and don't take steps that are too big. Each cycle should be small, focused, and incremental.

### Lesson 9.5: Outside-In TDD

Outside-in TDD (also called London-school TDD) starts from the outermost layer and works inward. For Android, you start with the ViewModel test, discover the repository interface it needs, then write the repository test and discover the API/DAO interfaces it needs. Each test drives the design of the layer below.

This approach is powerful for feature development. You write the ViewModel test first, defining the exact interface the ViewModel needs from its dependencies. That interface definition becomes the contract for the repository. You then write the repository test, defining the exact interface it needs from the API and DAO. By the time you implement the production code, every interface is already defined and tested.

The alternative — inside-out TDD (classic/Chicago school) — starts with the innermost layer (pure domain logic) and works outward. Both approaches work. Outside-in is better when you have clear UI requirements and need to discover the data layer interface. Inside-out is better when you have a well-defined domain model and need to build outward from it.

```kotlin
// Step 1: Start with the ViewModel test — discover repository interface
@Test
fun `loadOrders shows orders grouped by status`() = runTest {
    val repo = FakeOrderRepository() // this interface doesn't exist yet — define it
    repo.setOrders(listOf(
        Order("1", "Widget", OrderStatus.PENDING),
        Order("2", "Gadget", OrderStatus.SHIPPED)
    ))
    val viewModel = OrdersViewModel(repo)

    viewModel.state.test {
        awaitItem() // Idle
        viewModel.loadOrders()
        awaitItem() // Loading
        val loaded = awaitItem()
        assertIs<OrdersState.Loaded>(loaded)
        assertEquals(1, loaded.grouped[OrderStatus.PENDING]?.size)
        assertEquals(1, loaded.grouped[OrderStatus.SHIPPED]?.size)
        cancelAndIgnoreRemainingEvents()
    }
}

// This test told us we need:
// - interface OrderRepository { suspend fun getOrders(): List<Order> }
// - data class Order(val id: String, val name: String, val status: OrderStatus)
// - sealed class OrdersState { Idle, Loading, Loaded(grouped), Error }

// Step 2: Now write the repository test — discover API interface
@Test
fun `getOrders fetches from API and caches in DAO`() = runTest {
    val api = FakeOrderApi() // define this interface
    val dao = FakeOrderDao() // and this one
    val repo = OrderRepositoryImpl(api, dao)
    // ...test the repository implementation
}
```

**Key takeaway:** Outside-in TDD starts from the ViewModel and discovers interfaces layer by layer. Each test defines the contract for the layer below. By the time you implement production code, every interface is already designed and tested.

### Quiz: Test-Driven Development

#### What are the three steps of the TDD cycle, in order?

- ❌ Green, Red, Refactor — write code first, then test, then clean up
- ❌ Refactor, Red, Green — clean up, write a test, make it pass
- ✅ Red, Green, Refactor — write a failing test, make it pass, then clean up
- ❌ Red, Refactor, Green — write a failing test, clean up, then make it pass

> **Explanation:** TDD follows Red-Green-Refactor: first write a test that fails (Red), then write the minimum code to pass it (Green), then improve the code structure while keeping tests green (Refactor). This cycle ensures every piece of code is driven by a test.

#### Which type of code is TDD most practical for?

- ❌ UI layout code and animations
- ❌ Third-party library integrations
- ✅ Business logic with clear rules — validators, calculators, state machines, and parsers
- ❌ Exploratory prototyping and proof-of-concepts

> **Explanation:** TDD shines when the rules are well-defined — password validators, price calculators, state machines, data parsers. You can express the expected behavior as a test before writing the implementation. UI code and third-party integrations are better tested after implementation.

#### Why is testing private methods considered a TDD anti-pattern?

- ❌ Private methods can't be tested in Kotlin
- ❌ Private methods are always trivial and don't need tests
- ✅ If you need to test a private method, the class is probably doing too much — extract the logic into a separate class with a public API
- ❌ TDD only works with public methods because of JUnit limitations

> **Explanation:** The urge to test a private method signals that the class has multiple responsibilities. Extract the private logic into a separate class with a public API, then test that class directly. This improves both testability and design — single responsibility principle in action.

### Coding Challenge: TDD a Shopping Cart

Using Red-Green-Refactor, build a `ShoppingCart` with these behaviors: add items, remove items, calculate total, apply a percentage discount, and reject negative quantities. Write each test before its implementation, building up the cart behavior incrementally.

#### Solution

```kotlin
// Cycle 1: Add items
@Test
fun `adding item increases cart size`() {
    val cart = ShoppingCart()
    cart.add(CartItem("widget", 9.99, quantity = 1))
    assertEquals(1, cart.items.size)
}

// Cycle 2: Calculate total
@Test
fun `total sums all item prices times quantities`() {
    val cart = ShoppingCart()
    cart.add(CartItem("widget", 10.0, quantity = 2))
    cart.add(CartItem("gadget", 25.0, quantity = 1))
    assertEquals(45.0, cart.total, 0.01)
}

// Cycle 3: Remove items
@Test
fun `removing item decreases cart size`() {
    val cart = ShoppingCart()
    cart.add(CartItem("widget", 10.0, quantity = 1))
    cart.remove("widget")
    assertTrue(cart.items.isEmpty())
}

// Cycle 4: Apply discount
@Test
fun `discount reduces total by percentage`() {
    val cart = ShoppingCart()
    cart.add(CartItem("widget", 100.0, quantity = 1))
    cart.applyDiscount(10.0) // 10%
    assertEquals(90.0, cart.total, 0.01)
}

// Cycle 5: Reject negative quantities
@Test
fun `adding item with negative quantity throws`() {
    val cart = ShoppingCart()
    assertThrows<IllegalArgumentException> {
        cart.add(CartItem("widget", 10.0, quantity = -1))
    }
}

// Final implementation after all cycles
class ShoppingCart {
    private val _items = mutableListOf<CartItem>()
    val items: List<CartItem> get() = _items.toList()
    private var discountPercent = 0.0

    val total: Double
        get() {
            val subtotal = _items.sumOf { it.price * it.quantity }
            return subtotal * (1 - discountPercent / 100)
        }

    fun add(item: CartItem) {
        require(item.quantity > 0) { "Quantity must be positive" }
        _items.add(item)
    }

    fun remove(itemId: String) {
        _items.removeAll { it.id == itemId }
    }

    fun applyDiscount(percent: Double) {
        discountPercent = percent
    }
}
```

Each cycle adds one behavior. The implementation grows incrementally, driven by failing tests.

---

## Module 10: Test Architecture and CI

A test suite is only as good as its infrastructure. This module covers how to organize tests across modules, set up shared test fixtures, configure CI pipelines for automated test execution, manage test coverage, and detect flaky tests before they erode trust in your suite.

### Lesson 10.1: Test Organization in Multi-Module Projects

In a multi-module Android project, tests live in two places: `src/test/` for JVM unit tests and `src/androidTest/` for instrumented tests. Unit tests (ViewModels, use cases, mappers, validators) go in `src/test/` because they run on the JVM without Android framework dependencies — fast, no emulator needed. Instrumented tests (Room DAOs, Compose UI, end-to-end flows) go in `src/androidTest/` because they need Android components.

Mirror your production code structure in your test directory. If production code lives in `com.app.feature.login`, tests live in the same package under `src/test/`. This makes navigation trivial — Ctrl+Shift+T in Android Studio jumps between production and test files automatically.

Within a test class, organize tests by category: happy path first, error cases second, edge cases third. Use nested classes or clear naming to group related tests. For large ViewModels with many actions, consider splitting into multiple test classes: `ProfileViewModelLoadTest`, `ProfileViewModelEditTest`, `ProfileViewModelDeleteTest`.

```
app/
├── src/
│   ├── main/java/com/app/
│   │   ├── feature/
│   │   │   ├── login/
│   │   │   │   ├── LoginViewModel.kt
│   │   │   │   ├── LoginRepository.kt
│   │   │   │   └── LoginScreen.kt
│   │   │   └── profile/
│   │   │       ├── ProfileViewModel.kt
│   │   │       └── ProfileScreen.kt
│   │   └── core/
│   │       ├── data/UserRepository.kt
│   │       └── domain/User.kt
│   ├── test/java/com/app/          (Unit tests — JVM)
│   │   ├── feature/
│   │   │   ├── login/
│   │   │   │   ├── LoginViewModelTest.kt
│   │   │   │   └── LoginRepositoryTest.kt
│   │   │   └── profile/
│   │   │       └── ProfileViewModelTest.kt
│   │   └── core/
│   │       └── data/UserRepositoryTest.kt
│   └── androidTest/java/com/app/   (Instrumented tests)
│       ├── feature/login/LoginScreenTest.kt
│       └── core/data/UserDaoTest.kt
```

**Key takeaway:** Unit tests in `src/test/`, instrumented tests in `src/androidTest/`. Mirror production code structure. Group tests by category within each class. Split large test classes by action or feature.

### Lesson 10.2: The :core:testing Module

The `:core:testing` module is the central location for all shared test infrastructure: fakes, factory functions, test rules, custom assertions, and base test classes. Every feature module depends on it via `testImplementation(project(":core:testing"))`. When an interface changes, you update the fake in one place, and every module picks up the change.

Structure the testing module by category: `fakes/` for shared fake implementations, `fixtures/` for factory functions and test data, `rules/` for custom JUnit rules (like `MainDispatcherRule`), and `assertions/` for custom assertion utilities. Keep it lean — only include things that are genuinely shared across modules.

The testing module should not depend on feature modules. It depends on `:core:domain` (for domain interfaces to fake) and `:core:data` (for data layer interfaces). If a fake is specific to one feature and not reused, keep it in that feature module's test source set instead.

```kotlin
// :core:testing/src/main/java/com/app/testing/

// rules/MainDispatcherRule.kt
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) { Dispatchers.setMain(dispatcher) }
    override fun finished(description: Description) { Dispatchers.resetMain() }
}

// fakes/FakeUserRepository.kt
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    var shouldFail = false
    // ... full implementation
}

// fixtures/TestFixtures.kt
object TestFixtures {
    fun createUser(
        id: String = "user-1",
        name: String = "Test User",
        email: String = "test@example.com"
    ) = User(id, name, email)
}

// assertions/FlowAssertions.kt
suspend fun <T> Flow<T>.assertFirstEmission(expected: T) {
    val first = this.first()
    assertEquals(expected, first)
}
```

**Key takeaway:** Centralize shared test infrastructure in `:core:testing`. Structure by category: fakes, fixtures, rules, assertions. Feature modules depend on it via `testImplementation`. Update fakes in one place when interfaces change.

### Lesson 10.3: CI Pipeline Configuration

Your CI pipeline should run tests automatically on every PR and block merging if any test fails. The basic setup runs `./gradlew test` for unit tests and `./gradlew connectedAndroidTest` for instrumented tests. Unit tests run in seconds on any CI runner. Instrumented tests need an Android emulator or a cloud device farm.

For most teams, the practical setup is: run unit tests on every PR (fast, no infrastructure needed), run instrumented tests nightly or on merge to main (slower, needs emulator). If you use GitHub Actions, the `reactivecircus/android-emulator-runner` action provides a pre-configured emulator. If you use Firebase Test Lab, you can run instrumented tests on real devices in the cloud.

Test reports should be uploaded as CI artifacts so you can inspect failures without re-running locally. Gradle generates HTML and XML reports in `build/reports/tests/`. Upload these as GitHub Actions artifacts for easy access. When a test fails, the report shows the exact test name, the expected vs. actual values, and the stack trace — everything you need to diagnose the failure.

```yaml
# .github/workflows/test.yml
name: Tests
on: [pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Run unit tests
        run: ./gradlew test --no-daemon
      - name: Upload test reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: '**/build/reports/tests/'

  instrumented-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: ./gradlew connectedAndroidTest
```

**Key takeaway:** Run unit tests on every PR (fast). Run instrumented tests nightly or on merge to main (needs emulator). Upload test reports as CI artifacts. Block PR merging on test failures.

### Lesson 10.4: Test Coverage

Test coverage measures what percentage of your production code is exercised by tests. Jacoco is the standard coverage tool for Android — it instruments your bytecode and generates reports showing which lines, branches, and methods were executed during test runs. Configure it in Gradle, run `./gradlew testDebugUnitTestCoverage`, and inspect the HTML report.

Coverage numbers are useful as a trend metric, not an absolute target. 80% coverage doesn't mean 80% of your bugs are caught — it means 80% of your lines were executed, which says nothing about assertion quality. A test that calls a method without asserting the result contributes to coverage but catches zero bugs.

Focus on coverage for critical code paths: authentication, payment processing, data persistence, business rules. Aim for high coverage in domain and data layers (80%+), reasonable coverage in ViewModels (70%+), and don't obsess over UI layer coverage. Use coverage reports to find untested code, not as a KPI to gamify.

```kotlin
// build.gradle.kts
android {
    buildTypes {
        debug {
            enableUnitTestCoverage = true
            enableAndroidTestCoverage = true
        }
    }
}

// Run coverage
// ./gradlew testDebugUnitTestCoverage
// Report: build/reports/coverage/test/debug/index.html
```

**Key takeaway:** Use Jacoco for coverage reports. Track coverage as a trend metric, not an absolute target. Focus on critical paths (auth, payments, data). Coverage without quality assertions is just line counting.

### Lesson 10.5: Detecting and Fixing Flaky Tests

A flaky test passes sometimes and fails sometimes with the same code. Flaky tests destroy trust in your test suite. When developers see 3-4 random failures on every PR, they learn to ignore red CI and merge anyway. At that point, you might as well have no tests.

Common causes of flakiness: shared mutable state between tests (one test modifies a singleton that another test reads), real time dependencies (`System.currentTimeMillis()`, `Thread.sleep()`), order-dependent tests (test B only passes if test A runs first), non-deterministic concurrency (race conditions in coroutines), and slow CI runners causing timeouts.

The fix for each: use `@Before`/`@After` to reset state. Inject `Clock` and `TestDispatcher` instead of real time. Make each test self-contained with its own fakes. Use `runTest` with `TestDispatcher` instead of real threading. Set generous timeouts for CI-only slowness.

When you find a flaky test, don't just re-run it. Diagnose the root cause. Run it 100 times locally (`./gradlew test --tests "ClassName.testName" --rerun-tasks` in a loop). If it passes locally but fails in CI, the CI environment has something your local machine doesn't — usually slower I/O or a different timezone. Fix the underlying issue, don't paper over it.

```kotlin
// Flaky: depends on shared mutable state
object UserCache {
    var currentUser: User? = null // shared between tests!
}

class TestA {
    @Test fun `sets user in cache`() {
        UserCache.currentUser = User("1", "Mukul")
        // ...
    }
}

class TestB {
    @Test fun `cache is empty initially`() {
        assertNull(UserCache.currentUser) // FAILS if TestA runs first
    }
}

// Fix: reset state in @Before/@After
class TestB {
    @Before fun setup() { UserCache.currentUser = null }
    @Test fun `cache is empty initially`() {
        assertNull(UserCache.currentUser) // always passes
    }
}

// Better fix: don't use global mutable state — inject dependencies
class UserViewModel(private val cache: UserCache) {
    // ...
}

class UserViewModelTest {
    private val cache = FakeUserCache() // each test gets its own instance
    // ...
}
```

**Key takeaway:** Flaky tests destroy CI trust. Diagnose root causes: shared state, real time, execution order, concurrency. Fix the underlying issue — don't re-run and hope. Every flaky test you fix makes your entire suite more trustworthy.

### Lesson 10.6: Test Performance Optimization

Slow tests discourage developers from running them. If `./gradlew test` takes 5 minutes, developers run it once before committing instead of after every change. If it takes 30 seconds, they run it constantly and catch bugs earlier.

The biggest performance wins: run tests in parallel (`maxParallelForks = Runtime.getRuntime().availableProcessors() / 2`), use Gradle build cache to skip unchanged module tests, keep unit tests fast by avoiding real I/O, and isolate slow integration tests into their own source set so you can run them separately.

Profile your test suite to find the bottlenecks. Gradle's `--profile` flag generates a report showing how long each task takes. If one test class takes 30 seconds while the rest take 2 seconds, investigate — it probably has real I/O, excessive setup, or an emulator dependency that could be removed.

```kotlin
// build.gradle.kts — parallel test execution
tasks.withType<Test> {
    maxParallelForks = (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(1)
    reports.html.required.set(true)
    reports.junitXml.required.set(true)
}

// Run only unit tests (fast)
// ./gradlew test

// Run only integration tests (slower)
// ./gradlew connectedAndroidTest

// Profile test execution
// ./gradlew test --profile
// Report: build/reports/profile/
```

**Key takeaway:** Fast tests get run often. Parallelize with `maxParallelForks`, use Gradle build cache, profile bottlenecks, and isolate slow tests. Aim for `./gradlew test` under 60 seconds for unit tests.

### Quiz: Test Architecture and CI

#### What is the purpose of a `:core:testing` module?

- ❌ It contains production code shared across feature modules
- ❌ It runs all tests in the project from a single entry point
- ✅ It holds shared fakes, test utilities, and factory functions reusable across feature modules
- ❌ It configures CI/CD pipelines for test execution

> **Explanation:** A `:core:testing` module centralizes test infrastructure — shared fakes like `FakeUserRepository`, factory functions like `createTestUser()`, and test utilities like `MainDispatcherRule`. Feature modules declare it as a `testImplementation` dependency, eliminating duplicated test code.

#### Why is 100% test coverage not a useful goal?

- ❌ Jacoco can't measure 100% coverage
- ❌ Some code paths are impossible to reach
- ✅ Coverage measures lines executed, not assertion quality — a test that calls a method without asserting anything still counts as coverage
- ❌ 100% coverage is too expensive to achieve

> **Explanation:** A test that calls `repository.getUser("1")` without asserting on the result increases coverage but catches zero bugs. Coverage without meaningful assertions is just line counting. Focus on critical paths and assertion quality over numerical targets.

#### What is the most common cause of flaky tests?

- ❌ Using JUnit 4 instead of JUnit 5
- ✅ Shared mutable state between tests, real time dependencies, and non-deterministic concurrency
- ❌ Running tests on the JVM instead of a device
- ❌ Using fakes instead of mocks

> **Explanation:** Shared state (singletons modified by one test and read by another), real time (`System.currentTimeMillis()`), and concurrency race conditions are the top three causes of flakiness. Fix them by isolating state, injecting clocks, and using `TestDispatcher`.

### Coding Challenge: Set Up a Test Infrastructure

Design the directory structure and key files for a `:core:testing` module that supports a multi-module Android app. Include: `MainDispatcherRule`, a `FakeUserRepository`, a `TestFixtures` object with factory functions for `User` and `Order`, and a `build.gradle.kts` with the right dependencies. Then write a test in a hypothetical `:feature:orders` module that uses all of these shared utilities.

#### Solution

```kotlin
// :core:testing/build.gradle.kts
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

dependencies {
    implementation(project(":core:domain"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    implementation("app.cash.turbine:turbine:1.0.0")
    implementation("junit:junit:4.13.2")
}

// :core:testing/src/main/java/com/app/testing/rules/MainDispatcherRule.kt
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) { Dispatchers.setMain(dispatcher) }
    override fun finished(description: Description) { Dispatchers.resetMain() }
}

// :core:testing/src/main/java/com/app/testing/fakes/FakeUserRepository.kt
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    var shouldFail = false

    fun setUser(user: User) { users[user.id] = user }

    override suspend fun getUser(id: String): User {
        if (shouldFail) throw IOException("Network error")
        return users[id] ?: throw UserNotFoundException(id)
    }
}

// :core:testing/src/main/java/com/app/testing/fixtures/TestFixtures.kt
object TestFixtures {
    fun createUser(
        id: String = "user-1",
        name: String = "Test User",
        email: String = "test@example.com"
    ) = User(id, name, email)

    fun createOrder(
        id: String = "order-1",
        userId: String = "user-1",
        total: Double = 49.99,
        status: OrderStatus = OrderStatus.PENDING
    ) = Order(id, userId, total, status)
}

// :feature:orders/build.gradle.kts
dependencies {
    testImplementation(project(":core:testing"))
}

// :feature:orders/src/test/java/com/app/feature/orders/OrdersViewModelTest.kt
class OrdersViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val fakeUserRepo = FakeUserRepository()
    private val fakeOrderRepo = FakeOrdersRepository()

    @Test
    fun `loads orders for current user`() = runTest {
        fakeUserRepo.setUser(TestFixtures.createUser(id = "user-1", name = "Mukul"))
        fakeOrderRepo.setOrders(listOf(
            TestFixtures.createOrder(id = "o1", total = 25.00),
            TestFixtures.createOrder(id = "o2", total = 75.00)
        ))

        val viewModel = OrdersViewModel(fakeUserRepo, fakeOrderRepo)
        viewModel.state.test {
            awaitItem() // Idle
            viewModel.loadOrders("user-1")
            awaitItem() // Loading
            val loaded = awaitItem()
            assertIs<OrdersState.Loaded>(loaded)
            assertEquals(2, loaded.orders.size)
            assertEquals(100.00, loaded.totalAmount, 0.01)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

This exercise builds a complete test infrastructure module and demonstrates how feature modules consume shared fakes, fixtures, and rules for consistent, DRY testing.

---

Thank You for completing the Android Testing Mastery course! Tests aren't overhead — they're the foundation that lets you ship with confidence. A well-structured test suite catches bugs before production, documents behavior better than any wiki, and gives you the courage to refactor without fear. 🧪
