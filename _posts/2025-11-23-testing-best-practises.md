---
title: Testing Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Testing
---

1. **Test Behavior, Not Implementation**
The fastest way to create a fragile test suite is to test how a class does something instead of what it does. When you verify that a specific private method was called, or that state transitions happened in a particular internal order, your tests break every time you refactor — even if the external behavior is identical. A test that verifies "when the user submits valid credentials, the UI shows the home screen" survives a complete rewrite of the login logic. A test that verifies "loginRepository.signIn() was called exactly once with these parameters" breaks when you add caching or change the method signature.

```kotlin
// Brittle — testing implementation
@Test
fun `login calls repository then navigates`() {
    viewModel.login("user@test.com", "password123")

    verify(mockRepository).signIn("user@test.com", "password123")  // breaks if you add hashing
    verify(mockNavigator).navigateTo(HomeScreen)  // breaks if navigation changes
}

// Better — testing behavior
@Test
fun `successful login shows home screen`() {
    fakeRepository.setLoginResult(Result.success(User(id = "123")))

    viewModel.login("user@test.com", "password123")

    val state = viewModel.uiState.value
    assertThat(state).isInstanceOf(LoginUiState.Success::class.java)
    assertThat((state as LoginUiState.Success).userId).isEqualTo("123")
}
```

The behavioral test doesn't care whether the ViewModel calls the repository directly, uses a use case, or has an internal cache. It cares about one thing: given valid credentials, the state becomes Success with the right user. I think of it as testing the contract — the observable outputs for given inputs — rather than the wiring.


2. **Use Fakes Over Mocks**
Mocks (Mockito, MockK) are convenient, but they create a hidden problem: your tests encode assumptions about internal interactions rather than actual behavior. When you `verify(mockRepository).fetchUser(userId)`, you're asserting that a specific method was called, not that the right user was returned. Fakes — hand-written implementations of your interfaces — test actual behavior because they execute real logic.

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

    // Test helper
    fun addUser(user: User) { users[user.id] = user }
}

@Test
fun `profile screen shows user name`() {
    val fakeRepo = FakeUserRepository()
    fakeRepo.addUser(User(id = "1", name = "Mukul", email = "m@test.com"))

    val viewModel = ProfileViewModel(fakeRepo, SavedStateHandle(mapOf("userId" to "1")))

    assertThat(viewModel.uiState.value.name).isEqualTo("Mukul")
}
```

Fakes take more upfront effort — you write one implementation per interface. But that implementation is reused across every test that depends on that interface. Google's own Now In Android sample uses fakes extensively. The tradeoff is that fakes need maintenance when the interface evolves, and complex fakes can become their own source of bugs. Keep fakes simple — an in-memory map is usually all you need.


3. **Test Coroutines with Turbine**
Testing `StateFlow` and `SharedFlow` without a proper tool is painful. You end up with `delay()` calls in tests hoping the coroutine has completed, `advanceUntilIdle()` calls that work sometimes, and flaky tests that pass locally but fail in CI. Turbine gives you a structured way to collect and assert on Flow emissions with proper timeouts and error messages.

```kotlin
@Test
fun `search updates results as user types`() = runTest {
    val fakeSearchRepo = FakeSearchRepository()
    fakeSearchRepo.setResults("kotlin", listOf(
        SearchResult("Kotlin Coroutines"),
        SearchResult("Kotlin Flows")
    ))

    val viewModel = SearchViewModel(fakeSearchRepo, SavedStateHandle())

    viewModel.uiState.test {
        // Initial state
        assertThat(awaitItem().results).isEmpty()

        viewModel.updateQuery("kotlin")
        // Skip loading state if needed
        val result = awaitItem()
        assertThat(result.results).hasSize(2)
        assertThat(result.results[0].title).isEqualTo("Kotlin Coroutines")

        cancelAndIgnoreRemainingEvents()
    }
}
```

The `test` extension function on `Flow` creates a `FlowTurbine` that collects emissions synchronously. `awaitItem()` blocks until the next emission, with a configurable timeout (default 3 seconds). If no emission arrives, the test fails with a clear message instead of hanging forever. This is massively better than `advanceTimeBy()` and `advanceUntilIdle()` for testing flows with debounce, `flatMapLatest`, or other time-dependent operators.

One thing to watch for: Turbine requires every emission to be explicitly consumed. If your flow emits Loading → Success but your test only checks Success, Turbine fails because the Loading emission was unconsumed. This forces you to be explicit about every state transition your UI sees.


4. **Write Compose UI Tests That Act Like Users**
Compose testing APIs let you find composables by test tags, text content, or semantics. The key principle: act like a user, not like a robot. A user sees text, buttons, and input fields — your tests should find elements the same way.

```kotlin
@get:Rule
val composeTestRule = createComposeRule()

@Test
fun `login form validates email before submission`() {
    val fakeViewModel = FakeLoginViewModel()

    composeTestRule.setContent {
        LoginScreen(viewModel = fakeViewModel)
    }

    // Type an invalid email
    composeTestRule.onNodeWithText("Email").performTextInput("not-an-email")
    composeTestRule.onNodeWithText("Password").performTextInput("password123")
    composeTestRule.onNodeWithText("Sign In").performClick()

    // Error should be visible
    composeTestRule.onNodeWithText("Invalid email address").assertIsDisplayed()
}

@Test
fun `successful login navigates to home`() {
    val fakeViewModel = FakeLoginViewModel()
    fakeViewModel.setLoginResult(Result.success(Unit))

    composeTestRule.setContent {
        LoginScreen(viewModel = fakeViewModel)
    }

    composeTestRule.onNodeWithText("Email").performTextInput("user@test.com")
    composeTestRule.onNodeWithText("Password").performTextInput("password123")
    composeTestRule.onNodeWithText("Sign In").performClick()

    composeTestRule.onNodeWithText("Welcome").assertIsDisplayed()
}
```

I prefer `onNodeWithText` over `onNodeWithTag` wherever possible because it mirrors how users interact. Test tags are a fallback for elements without meaningful text. The tradeoff is that text-based matchers break when you change copy, but that's a feature — it keeps tests aligned with the user experience.


5. **Use Screenshot Testing with Paparazzi**
Unit tests verify behavior. Screenshot tests verify appearance. They catch visual regressions that assertions can't — wrong padding, incorrect colors, truncated text. Paparazzi from Cash App runs on the JVM without an emulator, making screenshot tests as fast as unit tests.

```kotlin
class LoginScreenSnapshotTest {
    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6,
        theme = "android:Theme.Material3.Light"
    )

    @Test
    fun `login screen default state`() {
        paparazzi.snapshot {
            LoginScreen(
                uiState = LoginUiState(),
                onLoginClick = {},
                onEmailChanged = {},
                onPasswordChanged = {}
            )
        }
    }

    @Test
    fun `login screen with validation errors`() {
        paparazzi.snapshot {
            LoginScreen(
                uiState = LoginUiState(
                    emailError = "Invalid email address",
                    passwordError = "Password too short"
                ),
                onLoginClick = {},
                onEmailChanged = {},
                onPasswordChanged = {}
            )
        }
    }

    @Test
    fun `login screen loading state`() {
        paparazzi.snapshot {
            LoginScreen(
                uiState = LoginUiState(isLoading = true),
                onLoginClick = {},
                onEmailChanged = {},
                onPasswordChanged = {}
            )
        }
    }
}
```

Paparazzi generates PNG snapshots that you commit to version control. On subsequent runs, it compares new renders against the committed images and fails if any pixel differs beyond a configurable threshold. In a project with 40+ screens, Paparazzi caught a theme regression (wrong background color on dark mode) that would have shipped to production because no one manually checked every screen after a theme update. The cost is larger git history due to image files, but that's manageable with Git LFS.


6. **Follow Test Naming Conventions That Describe Behavior**
Test names should read like specifications. When a test fails in CI, the name is the first thing you see — it should tell you what broke without opening the file. The pattern I use is `given_when_then` or backtick-quoted sentences that describe the expected behavior.

```kotlin
// Bad — describes implementation, not behavior
@Test fun testLogin() { ... }
@Test fun viewModelTest() { ... }
@Test fun `test repository`() { ... }

// Good — describes the behavior being verified
@Test
fun `given valid credentials when login then shows home screen`() { ... }

@Test
fun `given network error when loading profile then shows retry button`() { ... }

@Test
fun `given empty cart when checkout clicked then shows empty cart message`() { ... }
```

When this test fails in CI, the message reads: "given network error when loading profile then shows retry button — FAILED." You immediately know what's broken. Compare that to "testViewModel — FAILED" which tells you nothing. The naming convention also acts as a forcing function — a test named "given X when Y then Z" naturally leads to one clear setup, one action, and one assertion.


7. **Use Arrange-Act-Assert Consistently**
Every test should have three clearly separated sections: set up the preconditions (Arrange), perform the action under test (Act), and verify the outcome (Assert). When tests mix these phases — asserting mid-action, or arranging after the first act — they become hard to read and harder to debug when they fail.

```kotlin
@Test
fun `expired session triggers re-authentication`() {
    // Arrange
    val fakeAuthRepo = FakeAuthRepository()
    fakeAuthRepo.setSessionState(SessionState.Expired)
    val fakeNavigator = FakeNavigator()
    val viewModel = SettingsViewModel(fakeAuthRepo, fakeNavigator)

    // Act
    viewModel.onResumed()

    // Assert
    assertThat(fakeNavigator.lastDestination).isEqualTo(Destination.Login)
    assertThat(viewModel.uiState.value.isAuthenticated).isFalse()
}
```

The structure is rigid on purpose. When a test fails, you look at Assert to understand what was expected, Arrange for preconditions, and Act for what triggered the failure. If these phases are interleaved, debugging takes much longer. Tests with multiple steps in a flow naturally have multiple Act-Assert cycles — that's fine, but if a test has more than 3, consider splitting it.


8. **Build the Right Test Pyramid**
The test pyramid for Android is different from backend services. In Android, it looks like: ViewModel and domain layer unit tests at the base, repository and database integration tests in the middle, and critical user journey UI tests at the top. If your pyramid is inverted (many UI tests, few unit tests), your test suite is slow, flaky, and expensive to maintain.

The distribution I aim for: about 60-70% JVM unit tests (ViewModel tests, use case tests, mappers, validators), 20-30% integration tests (Room database, repository wiring, serialization), and 5-10% UI tests for critical user journeys. The shape matters because the bottom of the pyramid is fast and deterministic, while the top is slow and flaky.

```kotlin
// Unit test (60-70%) — fast, deterministic, JVM-only
@Test
fun `discount calculator applies bulk discount above 10 items`() {
    val calculator = DiscountCalculator()
    val result = calculator.calculate(items = 15, unitPrice = 10.0)
    assertThat(result.discount).isEqualTo(15.0) // 10% of 150
    assertThat(result.total).isEqualTo(135.0)
}

// Integration test (20-30%) — verifies data layer wiring
@Test
fun `order repository persists and retrieves orders`() = runTest {
    val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
    val repository = OrderRepositoryImpl(db.orderDao(), testDispatcher)

    repository.saveOrder(Order(id = "1", items = listOf("item_a"), total = 50.0))
    val retrieved = repository.getOrder("1")

    assertThat(retrieved?.total).isEqualTo(50.0)
    db.close()
}
```

The mistake I see most often is teams writing Espresso or Compose UI tests for logic that should be unit tested. Testing a discount calculation doesn't require rendering UI — it's a pure function. Test it at the unit level where it runs in 5ms, not at the UI level where it takes 3 seconds.


9. **Test Error Paths as Thoroughly as Success Paths**
In most codebases I've reviewed, the test suite covers the happy path extensively and barely touches error handling. But in production, errors happen constantly — networks fail, servers return unexpected responses, users do things you didn't anticipate. For every critical operation, I test at least: network failure (retryable), server error (non-retryable), and the retry-after-error flow.

```kotlin
@Test
fun `network error shows retry button and preserves form data`() = runTest {
    val fakeRepo = FakeOrderRepository()
    fakeRepo.shouldFail = true
    fakeRepo.failureException = IOException("Connection refused")

    val viewModel = CheckoutViewModel(fakeRepo, SavedStateHandle())
    viewModel.setFormData(CheckoutForm(address = "123 Main St", cardLastFour = "4242"))

    viewModel.submitOrder()

    val state = viewModel.uiState.value
    assertThat(state.error).isNotNull()
    assertThat(state.error?.retryable).isTrue()
    assertThat(state.formData.address).isEqualTo("123 Main St") // Form data preserved
}

@Test
fun `server error with non-retryable status shows contact support`() = runTest {
    val fakeRepo = FakeOrderRepository()
    fakeRepo.shouldFail = true
    fakeRepo.failureException = HttpException(Response.error<Unit>(422, "".toResponseBody()))

    val viewModel = CheckoutViewModel(fakeRepo, SavedStateHandle())
    viewModel.submitOrder()

    val state = viewModel.uiState.value
    assertThat(state.error?.retryable).isFalse()
    assertThat(state.error?.showContactSupport).isTrue()
}

@Test
fun `retry after error re-attempts submission`() = runTest {
    val fakeRepo = FakeOrderRepository()
    fakeRepo.shouldFail = true
    val viewModel = CheckoutViewModel(fakeRepo, SavedStateHandle())

    viewModel.submitOrder()
    assertThat(viewModel.uiState.value.error).isNotNull()

    // Fix the error and retry
    fakeRepo.shouldFail = false
    viewModel.retry()

    assertThat(viewModel.uiState.value.error).isNull()
    assertThat(viewModel.uiState.value.orderConfirmed).isTrue()
}
```

The retry test is especially important — I've caught bugs where the error state persisted after a successful retry, leaving users seeing both a success message and an error banner simultaneously.


10. **Keep Tests Independent and Fast**
Every test must be independent — it should pass or fail regardless of which other tests ran before it. Shared mutable state between tests is the number one cause of flaky test suites.

```kotlin
// Bad — tests share state through a companion object
class OrderViewModelTest {
    companion object {
        val sharedRepo = FakeOrderRepository()  // Shared across all tests
    }

    @Test fun `test add item`() {
        sharedRepo.addItem(Item("1"))  // Modifies shared state
        // ...
    }

    @Test fun `test empty cart`() {
        // Fails if test above runs first because cart isn't empty
        assertThat(sharedRepo.getItems()).isEmpty()
    }
}

// Good — each test creates its own state
class OrderViewModelTest {

    @Test fun `add item increases cart count`() {
        val fakeRepo = FakeOrderRepository()
        val viewModel = OrderViewModel(fakeRepo)

        viewModel.addItem(Item("1"))

        assertThat(viewModel.uiState.value.cartCount).isEqualTo(1)
    }

    @Test fun `empty cart shows empty state`() {
        val fakeRepo = FakeOrderRepository()
        val viewModel = OrderViewModel(fakeRepo)

        assertThat(viewModel.uiState.value.isEmpty).isTrue()
    }
}
```

Speed matters too. If your unit test suite takes more than 30 seconds, developers stop running it locally. The biggest speed killers are: Robolectric (adds 5-10 seconds startup), PowerMock (rewrites bytecode), and tests using `Thread.sleep()` instead of `advanceUntilIdle()`. In a project I worked on, removing Robolectric from ViewModel tests reduced the suite from 90 seconds to 8 seconds.

Thanks for reading!
