---
title: "Testing Strategy & Testable Code"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 6
sequence: 40
description: "Testing questions come up in architecture rounds because writing testable code forces good architecture."
---

## Testing Strategy & Testable Code

Testing questions come up in architecture rounds because writing testable code forces good architecture. Interviewers want to see that you understand the test pyramid, know the right tools, and can structure code so it's easy to verify.

### Core Questions

#### Q1: What is the test pyramid and why does it matter?

The test pyramid has three layers:

- **Unit tests** (base, largest) — test individual classes and functions in isolation. Fast, no Android dependencies. Run on JVM.
- **Integration tests** (middle) — test how multiple classes work together. May use Robolectric or in-memory databases.
- **UI tests** (top, smallest) — test the full app or screen from the user's perspective. Run on a device or emulator with Espresso or Compose test rules.

You want many unit tests, fewer integration tests, and even fewer UI tests. Unit tests are fast and cheap to run. UI tests are slow and flaky. If your test suite is mostly UI tests, builds take forever and tests break on CI for no real reason.

#### Q2: What are the different types of test doubles?

- **Mock** — a fake object that records interactions. You verify that specific methods were called with specific arguments. MockK and Mockito create these.
- **Fake** — a working implementation with simplified logic. A `FakeUserRepository` that returns data from an in-memory list instead of hitting the network.
- **Stub** — returns hardcoded responses. Doesn't record interactions, just provides canned data.
- **Spy** — wraps a real object and records calls while still executing the real code. Useful when you want to verify interactions on an actual implementation.

Fakes are generally better than mocks for repositories and data sources. They behave like the real thing, so your tests catch more bugs. Mocks are better for verifying interactions — like checking that a logger was called when an error happened.

#### Q3: What makes code testable?

Testable code has three properties:

- **Dependencies are injected, not created internally.** If a class creates its own dependencies with `new` or direct constructor calls, you can't swap them for test doubles.
- **Pure functions where possible.** A function that takes input and returns output without side effects is the easiest thing to test. No mocking needed.
- **Single responsibility.** A class that does one thing is easier to test than a class that does five things. Fewer dependencies, fewer test cases, clearer assertions.

```kotlin
// Hard to test — creates its own dependency
class OrderProcessor {
    private val api = RetrofitClient.create(OrderApi::class.java)
    suspend fun process(order: Order) = api.submit(order)
}

// Easy to test — dependency is injected
class OrderProcessor(private val api: OrderApi) {
    suspend fun process(order: Order) = api.submit(order)
}
```

The second version lets you pass a `FakeOrderApi` in tests. The first version forces you to deal with real network calls.

#### Q4: How do you write unit tests with JUnit and MockK?

JUnit provides the test framework — `@Test`, `@Before`, assertions. MockK is a Kotlin-first mocking library that handles coroutines, extension functions, and top-level functions.

```kotlin
class LoginViewModelTest {

    private val authRepository: AuthRepository = mockk()
    private lateinit var viewModel: LoginViewModel

    @Before
    fun setup() {
        viewModel = LoginViewModel(authRepository)
    }

    @Test
    fun `login success updates state`() = runTest {
        coEvery { authRepository.login("user", "pass") } returns Result.success(User("user"))

        viewModel.login("user", "pass")

        assertEquals(LoginState.Success, viewModel.state.value)
        coVerify { authRepository.login("user", "pass") }
    }
}
```

`coEvery` stubs suspend functions. `coVerify` verifies they were called. Use `every` and `verify` for non-suspend functions.

#### Q5: What is the difference between Mockito and MockK?

Mockito is Java-first and works with Kotlin through `mockito-kotlin` extensions. MockK is built for Kotlin from the ground up. MockK handles `suspend` functions natively with `coEvery`/`coVerify`, can mock `object` singletons, extension functions, and top-level functions. Mockito needs extra setup for coroutines and can't mock final classes without the `mockito-inline` artifact.

For Kotlin codebases, MockK is the better choice. Its API feels natural in Kotlin — lambda-based stubbing, named arguments, and coroutine support without workarounds.

#### Q6: How do you test coroutines with TestDispatcher?

The `kotlinx-coroutines-test` library provides `TestDispatcher` for controlling coroutine execution in tests. `runTest` replaces `runBlocking` in test code — it uses `StandardTestDispatcher` by default and auto-advances virtual time.

```kotlin
class SearchViewModelTest {

    @Test
    fun `debounced search emits results`() = runTest {
        val repository = FakeSearchRepository()
        val viewModel = SearchViewModel(repository)

        viewModel.onQueryChanged("kotlin")
        advanceTimeBy(500) // Skip past debounce delay

        assertEquals(listOf("Kotlin Coroutines", "Kotlin Flow"), viewModel.results.value)
    }
}
```

`advanceTimeBy` moves virtual time forward without actually waiting. `advanceUntilIdle` runs all pending coroutines. Always inject dispatchers into your classes so you can replace `Dispatchers.IO` with a `TestDispatcher` in tests.

#### Q7: How do you test Flows with Turbine?

Turbine is a library for testing Flow emissions. It provides `test {}` extension that collects flow items and lets you assert them one by one.

```kotlin
@Test
fun `counter increments on each click`() = runTest {
    val viewModel = CounterViewModel()

    viewModel.count.test {
        assertEquals(0, awaitItem()) // Initial value
        viewModel.increment()
        assertEquals(1, awaitItem())
        viewModel.increment()
        assertEquals(2, awaitItem())
        cancelAndConsumeRemainingEvents()
    }
}
```

`awaitItem()` suspends until the next emission. `awaitError()` catches errors. `expectNoEvents()` asserts nothing was emitted. Turbine is essential for testing `StateFlow` and `SharedFlow` because manually collecting flows in tests is error-prone and timing-dependent.

### Deep Dive Questions

#### Q8: How do you test a ViewModel that uses SavedStateHandle?

`SavedStateHandle` is injected by the framework, so in tests you create one manually with initial values. Since Hilt and the Navigation library populate `SavedStateHandle` from arguments, you pass the expected key-value pairs in the constructor.

```kotlin
@Test
fun `loads user from saved state`() = runTest {
    val savedState = SavedStateHandle(mapOf("userId" to "user123"))
    val viewModel = ProfileViewModel(savedState, FakeUserRepository())

    viewModel.uiState.test {
        val state = awaitItem()
        assertEquals("user123", state.userId)
    }
}
```

If your ViewModel writes back to `SavedStateHandle` for process death survival, you can read the values back from the same handle in tests to verify they were saved correctly.

#### Q9: How does Robolectric work and when should you use it?

Robolectric runs Android framework code on the JVM by replacing the Android SDK classes with shadow implementations. This means you can test code that uses `Context`, `SharedPreferences`, `Resources`, and other framework APIs without a device or emulator.

Use Robolectric for integration tests that need Android framework classes but don't need full UI rendering. Testing a `BroadcastReceiver`, verifying `Intent` construction, or testing a `ContentProvider` are good use cases. Don't use it for pixel-perfect UI testing — Espresso or Compose test rules are better for that.

The tradeoff is speed vs fidelity. Robolectric tests are faster than instrumented tests but the shadow implementations don't always match real device behavior exactly. Some edge cases around configuration changes, multi-process, and certain system services behave differently.

#### Q10: How do you test Compose UI?

Compose has a built-in test framework through `ComposeTestRule`. You use semantic matchers to find nodes and perform assertions or actions.

```kotlin
@get:Rule
val composeRule = createComposeRule()

@Test
fun `login button disabled when fields are empty`() {
    composeRule.setContent {
        LoginScreen(viewModel = FakeLoginViewModel())
    }

    composeRule.onNodeWithText("Login").assertIsNotEnabled()

    composeRule.onNodeWithTag("email_field").performTextInput("user@test.com")
    composeRule.onNodeWithTag("password_field").performTextInput("password")

    composeRule.onNodeWithText("Login").assertIsEnabled()
}
```

Compose testing works through the semantic tree, not the visual tree. `onNodeWithText`, `onNodeWithTag`, and `onNodeWithContentDescription` are the main finders. For custom semantics, add `Modifier.testTag("tag")` or `Modifier.semantics { }` to your composables. The test framework also supports `waitUntil {}` for asynchronous operations.

#### Q11: What is the role of dependency injection in writing testable code?

Dependency injection separates object creation from object usage. When a class receives its dependencies through the constructor, you can pass real implementations in production and test doubles in tests. Without DI, classes create their own dependencies internally, making it impossible to substitute them.

```kotlin
// Without DI — untestable
class PaymentProcessor {
    private val gateway = StripeGateway()
    private val logger = FirebaseLogger()
    fun process(payment: Payment) { /* uses gateway and logger */ }
}

// With DI — testable
class PaymentProcessor(
    private val gateway: PaymentGateway,
    private val logger: Logger
) {
    fun process(payment: Payment) { /* uses gateway and logger */ }
}
```

In the DI version, you inject `FakePaymentGateway` and `FakeLogger` in tests. You verify behavior without hitting Stripe's API or Firebase. Hilt handles this in production by wiring up the real implementations. For tests, `@TestInstallIn` swaps modules with test versions.

#### Q12: How do you structure tests for a Clean Architecture app?

Each layer has its own test strategy:

- **Domain layer** (use cases) — pure unit tests. Use cases take a repository interface and return results. Inject fakes, assert outputs. No Android dependencies, no mocking frameworks needed if you use fakes.
- **Data layer** (repositories, data sources) — integration tests. For Room, use `Room.inMemoryDatabaseBuilder()`. For network, use MockWebServer to serve fake JSON responses. Test that the repository correctly maps API responses to domain models.
- **Presentation layer** (ViewModels) — unit tests with `runTest`. Inject fake repositories, assert state changes. Use Turbine for Flow assertions.
- **UI layer** (Compose/Fragments) — UI tests with ComposeTestRule or Espresso. Use fake ViewModels that emit known states. Assert that the UI renders correctly for each state.

The domain layer should have the highest test coverage because it contains your business rules. If the domain logic is wrong, nothing else matters.

#### Q13: What is Espresso and how does it differ from Compose testing?

Espresso is the testing framework for View-based UI. It uses `ViewMatchers` to find views, `ViewActions` to interact with them, and `ViewAssertions` to verify state. It synchronizes with the UI thread and idle resources automatically.

Compose testing uses `ComposeTestRule` with semantic node matchers instead of view matchers. The key difference is what you're testing against — Espresso tests the View hierarchy, Compose tests the semantic tree. Compose tests don't need `IdlingResource` because the test framework automatically waits for pending recompositions and animations.

For apps mixing Views and Compose, you can use both in the same test. `createAndroidComposeRule<Activity>()` gives you access to both the Compose test API and the Activity for Espresso interactions.

#### Q14: How do you handle flaky tests?

Flaky tests usually come from timing issues, shared state, or external dependencies. Fix them at the source, don't just retry:

- **Timing** — use `advanceUntilIdle()` in coroutine tests, `waitUntil {}` in Compose tests, and `IdlingResource` in Espresso. Never use `Thread.sleep()`.
- **Shared state** — each test should create its own test doubles and state. If tests share a singleton or database, they interfere with each other. Use `@Before` to set up fresh state.
- **External dependencies** — mock or fake everything external. Use `MockWebServer` instead of real APIs. Use in-memory Room databases instead of persistent ones.
- **Test ordering** — tests should pass in any order. If a test only passes when another test runs first, there's a shared state problem.

#### Q15: What is code coverage and how much should you aim for?

Code coverage measures what percentage of your code is executed during tests. Line coverage, branch coverage, and method coverage are the common metrics. JaCoCo is the standard tool for measuring coverage in Android projects.

Don't aim for 100% — it leads to testing getters, setters, and trivial code that adds no value. Aim for high coverage on business logic (use cases, ViewModels, repositories) and lower coverage on UI and framework glue code. A codebase with 70-80% coverage on the domain and presentation layers is well-tested. The metric that matters more than coverage percentage is whether your tests catch real bugs when code changes.

### Common Follow-ups

- What is TDD and when is it practical in Android? (Write the test first, then the code to make it pass. Works well for use cases and data transformations. Less practical for UI code where you're iterating on design)
- How do you test code that uses `Dispatchers.Main`? (Set `Dispatchers.setMain(testDispatcher)` in `@Before` and `Dispatchers.resetMain()` in `@After`. Without this, tests crash because `Dispatchers.Main` needs Android's Looper)
- What is MockWebServer and when do you use it? (OkHttp's test server that runs locally. Enqueue fake responses with `enqueue(MockResponse())`. Use it to test your Retrofit/OkHttp client against controlled responses)
- How do you test Room database operations? (Use `Room.inMemoryDatabaseBuilder()` to create a database that lives in memory and is destroyed after each test. Test DAO queries with real SQL execution)
- What is screenshot testing with Paparazzi? (Paparazzi renders Compose or View layouts on the JVM and compares screenshots against a baseline. Catches visual regressions without running on a device)
- How do you test error states in a ViewModel? (Stub the repository to throw an exception or return a failure result. Assert that the ViewModel's state moves to the error state with the correct message)
