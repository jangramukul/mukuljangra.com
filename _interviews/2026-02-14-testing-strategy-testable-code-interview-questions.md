---
title: "Testing Strategy & Testable Code"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 6
sequence: 38
description: "Testing questions come up in architecture rounds because writing testable code forces good architecture."
---

## Testing Strategy & Testable Code

Testing comes up in architecture rounds because testable code and good architecture go hand in hand.

#### What is the test pyramid and why does it matter?

The test pyramid has three layers:

- **Unit tests** at the base. Test individual classes and functions in isolation. Fast, run on JVM, no Android dependencies.
- **Integration tests** in the middle. Test how multiple classes work together. May use Robolectric or in-memory databases.
- **UI tests** at the top. Test the full screen from the user's perspective. Run on a device or emulator with Espresso or Compose test rules.

I want many unit tests, fewer integration tests, and even fewer UI tests. Unit tests are fast and cheap. UI tests are slow and flaky. If your test suite is mostly UI tests, builds take forever and tests break on CI for no good reason.

#### What makes code testable?

Three things:

- **Dependencies are injected, not created internally.** If a class creates its own dependencies, I can't swap them for test doubles.
- **Pure functions where possible.** A function that takes input and returns output without side effects is the easiest thing to test.
- **Single responsibility.** A class that does one thing has fewer dependencies, fewer test cases, and clearer assertions.

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

The second version lets me pass a `FakeOrderApi` in tests. The first one forces me to deal with real network calls.

#### What are the different types of test doubles?

- **Mock** — records interactions. I verify that specific methods were called with specific arguments. MockK and Mockito create these.
- **Fake** — a working implementation with simplified logic. A `FakeUserRepository` that returns data from an in-memory list instead of hitting the network.
- **Stub** — returns hardcoded responses. No interaction recording, just canned data.
- **Spy** — wraps a real object and records calls while still executing real code. Useful when I want to verify interactions on an actual implementation.

Fakes are generally better than mocks for repositories and data sources. They behave like the real thing, so tests catch more bugs. Mocks are better for verifying interactions — like checking that a logger was called when an error happened.

#### How do you write unit tests with JUnit and MockK?

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

`coEvery` stubs suspend functions. `coVerify` verifies they were called. For non-suspend functions, I use `every` and `verify`.

#### What is the difference between Mockito and MockK?

Mockito is Java-first and works with Kotlin through `mockito-kotlin` extensions. MockK is built for Kotlin from the ground up. It handles `suspend` functions natively with `coEvery`/`coVerify`, can mock `object` singletons, extension functions, and top-level functions. Mockito needs extra setup for coroutines and can't mock final classes without `mockito-inline`.

For Kotlin codebases, I prefer MockK. The API feels natural — lambda-based stubbing, named arguments, and coroutine support without workarounds.

#### What is the role of dependency injection in writing testable code?

DI separates object creation from object usage. When a class receives its dependencies through the constructor, I can pass real implementations in production and test doubles in tests. Without DI, classes create their own dependencies internally, and I can't substitute them.

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

In the DI version, I inject `FakePaymentGateway` and `FakeLogger` in tests. I verify behavior without hitting Stripe's API or Firebase. Hilt handles this in production. For tests, `@TestInstallIn` swaps modules with test versions.

#### How do you test coroutines with TestDispatcher?

The `kotlinx-coroutines-test` library provides `TestDispatcher` for controlling coroutine execution in tests. `runTest` replaces `runBlocking` — it uses `StandardTestDispatcher` by default and auto-advances virtual time.

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

`advanceTimeBy` moves virtual time forward without actually waiting. `advanceUntilIdle` runs all pending coroutines. I always inject dispatchers into my classes so I can replace `Dispatchers.IO` with a `TestDispatcher` in tests.

#### How do you test a ViewModel that uses SavedStateHandle?

`SavedStateHandle` is injected by the framework. In tests, I create one manually with initial values.

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

Hilt and the Navigation library populate `SavedStateHandle` from arguments, so I pass the expected key-value pairs in the constructor. If my ViewModel writes back to `SavedStateHandle` for process death survival, I read the values back from the same handle to verify they were saved.

#### How do you test Flows?

For testing Flow emissions, I use Turbine. It provides a `test {}` extension that collects items and lets me assert them one by one.

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

`awaitItem()` suspends until the next emission. `awaitError()` catches errors. `expectNoEvents()` asserts nothing was emitted. Turbine makes testing `StateFlow` and `SharedFlow` much easier because manually collecting flows in tests is error-prone and timing-dependent.

#### How do you test Compose UI?

Compose has a built-in test framework through `ComposeTestRule`. I use semantic matchers to find nodes and perform assertions or actions.

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

Compose testing works through the semantic tree, not the visual tree. `onNodeWithText`, `onNodeWithTag`, and `onNodeWithContentDescription` are the main finders. For custom semantics, I add `Modifier.testTag("tag")` or `Modifier.semantics { }` to composables.

#### How does Robolectric work and when should you use it?

Robolectric runs Android framework code on the JVM by replacing Android SDK classes with shadow implementations. I can test code that uses `Context`, `SharedPreferences`, `Resources`, and other framework APIs without a device or emulator.

I use Robolectric for integration tests that need Android framework classes but don't need full UI rendering. Testing a `BroadcastReceiver`, verifying `Intent` construction, or testing a `ContentProvider` are good use cases. For pixel-perfect UI testing, Espresso or Compose test rules are better.

The tradeoff is speed vs fidelity. Robolectric tests are faster than instrumented tests, but the shadow implementations don't always match real device behavior exactly. Some edge cases around configuration changes and certain system services behave differently.

#### What is Espresso and how does it differ from Compose testing?

Espresso is the testing framework for View-based UI. It uses `ViewMatchers` to find views, `ViewActions` to interact with them, and `ViewAssertions` to verify state. It synchronizes with the UI thread automatically.

Compose testing uses `ComposeTestRule` with semantic node matchers instead of view matchers. Espresso tests the View hierarchy. Compose tests the semantic tree. Compose tests don't need `IdlingResource` because the test framework waits for pending recompositions and animations on its own.

For apps mixing Views and Compose, I can use both in the same test. `createAndroidComposeRule<Activity>()` gives access to the Compose test API and the Activity for Espresso interactions.

#### How do you structure tests for a Clean Architecture app?

Each layer has its own test strategy:

- **Domain layer** (use cases) — pure unit tests. Use cases take a repository interface and return results. I inject fakes and assert outputs. No Android dependencies needed.
- **Data layer** (repositories, data sources) — integration tests. For Room, I use `Room.inMemoryDatabaseBuilder()`. For network, MockWebServer serves fake JSON responses. I test that the repository correctly maps API responses to domain models.
- **Presentation layer** (ViewModels) — unit tests with `runTest`. I inject fake repositories and assert state changes.
- **UI layer** (Compose/Fragments) — UI tests with ComposeTestRule or Espresso. I use fake ViewModels that emit known states and assert the UI renders correctly.

The domain layer should have the highest coverage because it contains business rules. If the domain logic is wrong, nothing else matters.

#### How do you handle flaky tests?

Flaky tests usually come from timing issues, shared state, or external dependencies. I fix them at the source instead of retrying:

- **Timing** — use `advanceUntilIdle()` in coroutine tests, `waitUntil {}` in Compose tests, and `IdlingResource` in Espresso. Never use `Thread.sleep()`.
- **Shared state** — each test should create its own test doubles and state. If tests share a singleton or database, they interfere with each other. I use `@Before` to set up fresh state.
- **External dependencies** — mock or fake everything external. MockWebServer instead of real APIs. In-memory Room databases instead of persistent ones.
- **Test ordering** — tests should pass in any order. If a test only passes when another test runs first, there's a shared state problem.

#### What is code coverage and how much should you aim for?

Code coverage measures what percentage of code is executed during tests. Line coverage, branch coverage, and method coverage are the common metrics. JaCoCo is the standard tool for Android projects.

I don't aim for 100% — it leads to testing getters, setters, and trivial code that adds no value. I aim for high coverage on business logic (use cases, ViewModels, repositories) and lower coverage on UI and framework glue code. 70-80% on domain and presentation layers is a good target. The metric that matters more than the percentage is whether tests catch real bugs when code changes.

### Common Follow-ups

- What is TDD and when is it practical in Android? (Write the test first, then the code to make it pass. Works well for use cases and data transformations. Less practical for UI code where you're iterating on design)
- How do you test code that uses `Dispatchers.Main`? (Set `Dispatchers.setMain(testDispatcher)` in `@Before` and `Dispatchers.resetMain()` in `@After`. Without this, tests crash because `Dispatchers.Main` needs Android's Looper)
- What is MockWebServer and when do you use it? (OkHttp's test server that runs locally. Enqueue fake responses with `enqueue(MockResponse())`. Use it to test your Retrofit/OkHttp client against controlled responses)
- How do you test Room database operations? (Use `Room.inMemoryDatabaseBuilder()` to create a database that lives in memory and is destroyed after each test. Test DAO queries with real SQL execution)
- What is screenshot testing with Paparazzi? (Paparazzi renders Compose or View layouts on the JVM and compares screenshots against a baseline. Catches visual regressions without running on a device)
- How do you test error states in a ViewModel? (Stub the repository to throw an exception or return a failure result. Assert that the ViewModel's state moves to the error state with the correct message)
