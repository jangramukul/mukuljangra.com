---
title: Testing Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Testing
---

A year ago, I inherited a codebase with over 400 tests. Sounds impressive until you actually run them. Half the suite was flaky — tests that passed locally but failed in CI, tests that broke every time someone refactored a ViewModel even though the external behavior hadn't changed, and Espresso tests that took 12 minutes and timed out on slower CI runners. The team had stopped trusting the test suite entirely. When every PR shows 3-4 random failures, developers learn to ignore the red and merge anyway. At that point, you might as well have zero tests.

I spent a few weeks ripping apart the suite and rebuilding it with a handful of principles I now apply to every project. The core insight was that most problems weren't about testing frameworks or tools — they were about **what** we chose to test and how we structured the assertions. A well-structured suite with 150 focused tests is worth infinitely more than 400 brittle ones nobody trusts.

Here's the thing — testing in Android is genuinely harder than testing on the backend. You're dealing with lifecycle callbacks, UI rendering, coroutine dispatchers, and platform dependencies that don't exist in a Spring service. But the principles that make tests reliable are the same everywhere. They just require more discipline on Android.

## The Test Pyramid

The test pyramid for Android is different from backend services, and I think a lot of teams get this wrong because they apply backend testing advice directly. The pyramid shape matters: **60-70% unit tests** at the base (ViewModel logic, use cases, mappers, validators), **20-30% integration tests** in the middle (Room database, repository wiring, serialization), and **5-10% UI tests** at the top for critical user journeys.

The shape exists for a reason. Unit tests run in 5ms on the JVM — no emulator, no Robolectric, pure speed. Integration tests need a bit more setup (an in-memory database, a real serializer) but still run fast. UI tests need either an emulator or an instrumented environment, and they're inherently slower and flakier. When your pyramid is inverted — many UI tests, few unit tests — your CI takes 20 minutes and flakes constantly. The mistake I see most often is teams writing Compose UI tests for logic that should be unit tested. Testing a discount calculation doesn't require rendering UI — it's a pure function. Test it at the unit level where it runs in milliseconds, not at the UI level where it takes seconds.

## Unit Tests — JUnit, Truth, and Pure Functions

The base of the pyramid is JUnit tests running on the JVM. I use Google's Truth library for assertions because the failure messages are readable — `assertThat(result).isEqualTo(expected)` tells you both the actual and expected value without digging through a stack trace. The best unit tests target **pure functions** — code with no side effects, no Android dependencies, just input in and output out.

```kotlin
@Test
fun `discount calculator applies bulk discount above 10 items`() {
    val calculator = DiscountCalculator()

    val result = calculator.calculate(items = 15, unitPrice = 10.0)

    assertThat(result.discount).isEqualTo(15.0)
    assertThat(result.total).isEqualTo(135.0)
}

@Test
fun `price formatter handles zero and negative amounts`() {
    val formatter = PriceFormatter(locale = Locale.US)

    assertThat(formatter.format(0.0)).isEqualTo("$0.00")
    assertThat(formatter.format(-5.99)).isEqualTo("-$5.99")
}
```

The beauty of pure function tests is that they're completely deterministic. No mocking, no setup, no teardown. If your architecture pushes business logic into plain Kotlin classes (mappers, validators, calculators, formatters), you get a massive base of fast, reliable tests for free. This is where [writing testable code](https://mukuljangra.com/2025/09/24/how-to-write-testable-code.html) pays off — the more logic lives outside Android framework classes, the easier it is to test.

## Test Doubles — Fakes and Mocks

Fakes are hand-written implementations of your interfaces that execute real logic. Mocks (MockK, Mockito) are framework-generated stubs that record interactions. I reach for fakes first and mocks only when a fake would be unreasonably complex — like mocking a third-party SDK you can't control, or verifying that a specific analytics event was fired.

```kotlin
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    var shouldFail = false
    var failureException: Exception = IOException("Network error")

    override suspend fun getUser(id: String): Result<User> {
        if (shouldFail) return Result.failure(failureException)
        val user = users[id] ?: return Result.failure(UserNotFoundException(id))
        return Result.success(user)
    }

    override suspend fun saveUser(user: User): Result<Unit> {
        if (shouldFail) return Result.failure(failureException)
        users[user.id] = user
        return Result.success(Unit)
    }

    fun addUser(user: User) { users[user.id] = user }
}
```

The FakeRepository pattern — an in-memory map with a `shouldFail` toggle — covers 90% of cases. Google's Now In Android sample uses fakes extensively. The tradeoff is that fakes need maintenance when the interface evolves, but that cost is spread across every test that reuses them. MockK shines for edge cases: verifying an analytics call was triggered with specific parameters, or stubbing a sealed third-party interface you can't implement. The rule I follow is simple — **fakes for behavior testing, mocks for interaction verification**. If you find yourself writing `verify(mock).someMethod()` in most tests, you're probably testing implementation details.

## Integration Tests — Room, Repositories, and Serialization

Integration tests verify that your data layer components work together correctly. The most common ones are Room database tests (does the DAO actually persist and query data?), repository tests (does the repository correctly coordinate between network and cache?), and serialization tests (does your Kotlin Serialization or Moshi config handle edge cases?).

```kotlin
@RunWith(AndroidJUnit4::class)
class OrderDaoTest {
    private lateinit var db: AppDatabase

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java
        ).build()
    }

    @After
    fun teardown() { db.close() }

    @Test
    fun `insert and query orders by status`() = runTest {
        val dao = db.orderDao()
        dao.insert(Order(id = "1", status = "pending", total = 50.0))
        dao.insert(Order(id = "2", status = "completed", total = 30.0))

        val pending = dao.getByStatus("pending")

        assertThat(pending).hasSize(1)
        assertThat(pending[0].id).isEqualTo("1")
    }
}
```

Serialization tests are the ones developers skip most often, and they bite hard in production. A single missing `@SerialName` annotation or a non-nullable field that the server sends as null can crash your app. I test every API response model with a real JSON string to catch these mismatches before they reach users.

## Testing Coroutines — runTest, Dispatchers, and MainDispatcherRule

Coroutine-heavy code needs special testing infrastructure. `runTest` from `kotlinx-coroutines-test` uses a virtual time scheduler that skips `delay()` calls automatically, so a test with a 5-second retry delay runs in milliseconds. The critical piece is the **TestDispatcher** — you need your code under test to share the same virtual clock as `runTest`.

`StandardTestDispatcher` queues coroutines and only runs them when you call `advanceUntilIdle()` or `advanceTimeBy()` — good for testing timing and ordering. `UnconfinedTestDispatcher` runs coroutines eagerly, which is simpler for straightforward sequential tests but hides timing bugs. I prefer `StandardTestDispatcher` for anything involving concurrent coroutines.

```kotlin
@Test
fun `payment retry waits before second attempt`() = runTest {
    val repository = PaymentRepository(
        api = FakePaymentApi(failFirstAttempt = true),
        ioDispatcher = StandardTestDispatcher(testScheduler)
    )

    val result = repository.processWithRetry(amount = 50.0)

    assertThat(result).isEqualTo(PaymentResult.Success)
}
```

The key insight is passing `StandardTestDispatcher(testScheduler)` to the class under test. This ensures it uses the same virtual clock as `runTest`, so `advanceTimeBy()` actually affects the coroutines inside your class. If you create a separate `StandardTestDispatcher()` without sharing the scheduler, your time controls won't work and you'll get confusing failures.

Most ViewModel tests also need `Dispatchers.Main` replaced, since `viewModelScope` uses it internally. A `MainDispatcherRule` handles this cleanly:

```kotlin
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

class ProfileViewModelTest {
    @get:Rule val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `profile loads user on init`() = runTest {
        val fakeRepo = FakeUserRepository()
        fakeRepo.addUser(User(id = "1", name = "Mukul"))

        val viewModel = ProfileViewModel(fakeRepo, SavedStateHandle(mapOf("userId" to "1")))

        assertThat(viewModel.uiState.value.name).isEqualTo("Mukul")
    }
}
```

Without `Dispatchers.setMain`, any `viewModelScope.launch` call throws because `Dispatchers.Main` isn't available in JVM unit tests. The rule swaps it with a test dispatcher before each test and resets it after. This is such a common need that I include `MainDispatcherRule` in every project as a shared test utility.

## Testing Flows With Turbine

Testing `StateFlow` and `SharedFlow` without Turbine is painful. You end up with `delay()` calls hoping the coroutine has completed, or flaky `advanceUntilIdle()` calls that work sometimes. Turbine gives you a structured way to collect and assert on Flow emissions with proper timeouts and clear error messages.

```kotlin
@Test
fun `search updates results as user types`() = runTest {
    val fakeRepo = FakeSearchRepository()
    fakeRepo.setResults("kotlin", listOf(
        SearchResult("Kotlin Coroutines"),
        SearchResult("Kotlin Flows")
    ))
    val viewModel = SearchViewModel(fakeRepo, SavedStateHandle())

    viewModel.uiState.test {
        assertThat(awaitItem().results).isEmpty()

        viewModel.updateQuery("kotlin")
        val result = awaitItem()
        assertThat(result.results).hasSize(2)
        assertThat(result.results[0].title).isEqualTo("Kotlin Coroutines")

        cancelAndIgnoreRemainingEvents()
    }
}
```

The `test` extension creates a `FlowTurbine` that collects emissions synchronously. `awaitItem()` blocks until the next emission with a configurable timeout (default 3 seconds). One thing to watch: Turbine requires every emission to be explicitly consumed. If your flow emits Loading → Success but your test only checks Success, Turbine fails because Loading was unconsumed. This forces you to be explicit about every state transition — which I actually think is a feature, not a limitation. It catches cases where your UI briefly flashes a loading spinner that users shouldn't see.

## UI Tests — Compose, Espresso, and Paparazzi

For Compose, `ComposeTestRule` lets you find nodes by text, test tags, or semantics. The principle that took me a while to internalize: **act like a user, not like a robot.** A user sees text and buttons — your tests should find elements the same way.

```kotlin
@get:Rule val composeTestRule = createComposeRule()

@Test
fun `login form validates email before submission`() {
    composeTestRule.setContent {
        LoginScreen(viewModel = FakeLoginViewModel())
    }

    composeTestRule.onNodeWithText("Email").performTextInput("not-an-email")
    composeTestRule.onNodeWithText("Sign In").performClick()
    composeTestRule.onNodeWithText("Invalid email address").assertIsDisplayed()
}
```

I prefer `onNodeWithText` over `onNodeWithTag` wherever possible because it mirrors user interaction. Test tags are a fallback for elements without meaningful text. For the View system, Espresso follows the same user-centric philosophy — `onView(withText("Submit")).perform(click())` — though I write fewer Espresso tests now that most new UI is Compose.

For visual regressions, **Paparazzi** from Cash App runs screenshot tests on the JVM without an emulator. It generates PNG snapshots you commit to version control, then compares new renders against the baseline. I remember a theme update that changed the background color on dark mode across half our screens. No behavioral test caught it because the behavior was identical — it shipped to production and users noticed before we did. Paparazzi would have caught it instantly. The cost is larger git history from image files, but that's manageable with Git LFS.

## Real-World Testing Patterns

**Test behavior, not implementation.** The fastest way to create a fragile suite is testing *how* a class does something instead of *what* it does. A test verifying "when valid credentials are submitted, the UI shows home" survives a complete rewrite of the login logic. A test verifying `mockRepository.signIn()` was called with specific parameters breaks when you add caching. This distinction alone eliminated about 60% of the flaky tests in that inherited codebase.

**Arrange-Act-Assert.** Every test should have three clearly separated phases: set up preconditions (Arrange), perform the action (Act), verify the outcome (Assert). When a test fails, you look at Assert to understand what was expected, Arrange for context, and Act for what triggered the failure. I treat this as a requirement, not a suggestion — tests that interleave these phases get refactored during code review.

**Name tests like specifications.** When a test fails in CI, the name is the first thing you see. `given network error when loading profile then shows retry button — FAILED` tells you exactly what broke. `testViewModel — FAILED` tells you nothing. The naming convention also acts as a forcing function — a name like "given X when Y then Z" naturally leads to one setup, one action, and one assertion.

**Test error paths.** Most suites cover the happy path extensively and barely touch error handling. But in production, networks fail, servers return unexpected responses, and users do things you didn't anticipate. For every critical operation, I test at least: network failure, non-retryable server error, and the retry-after-error flow. I've caught bugs where the error state persisted after a successful retry, leaving users seeing both a success message and an error banner simultaneously.

**Keep tests independent.** Every test must pass or fail regardless of which other tests ran before it. Shared mutable state between tests is the number one cause of flaky suites. The single biggest problem in that inherited codebase was a `companion object` repository instance shared across tests — results depended on execution order. Each test should create its own state from scratch.

Thanks for reading!
