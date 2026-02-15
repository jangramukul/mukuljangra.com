---
title: Kotlin Coroutines Testing Guide
layout: post
sequence: 122
categories: post
tags:
  - Kotlin Coroutines
  - Android
  - Testing
---

The first coroutine test I ever wrote passed on my machine and failed on CI. Then it passed on CI and failed locally. Then it passed both places but only on Tuesdays. I'm exaggerating, but not by much. The test was launching coroutines on `Dispatchers.IO`, asserting state immediately, and praying that the background thread finished in time. Sometimes it did, sometimes it didn't. The test wasn't testing my ViewModel — it was testing thread scheduling luck.

Coroutine testing is fundamentally different from testing regular synchronous code. You're dealing with virtual time, dispatcher switching, concurrent state mutations, and the fact that `delay(5000)` shouldn't actually make your test suite wait five seconds. The `kotlinx-coroutines-test` library provides the primitives to control all of this — `runTest`, `TestDispatcher`, virtual time advancement — but the primitives alone don't tell you how to structure tests that are actually reliable. I spent months getting bitten by subtle issues before I internalized the patterns that make coroutine tests deterministic. This guide covers those patterns.

## runTest

Every coroutine test starts with `runTest`. It creates a `TestScope` backed by a `TestCoroutineScheduler` that controls virtual time. Delays are skipped by default — a `delay(10_000)` inside `runTest` completes instantly. The test body itself runs as a coroutine, so you can call suspend functions directly.

```kotlin
class PaymentViewModel(
    private val paymentRepository: PaymentRepository
) : ViewModel() {

    private val _state = MutableStateFlow<PaymentState>(PaymentState.Idle)
    val state: StateFlow<PaymentState> = _state.asStateFlow()

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            _state.value = PaymentState.Processing
            val result = paymentRepository.charge(amount)
            _state.value = when {
                result.isSuccess -> PaymentState.Completed(result.getOrThrow())
                else -> PaymentState.Failed(result.exceptionOrNull()?.message ?: "Unknown error")
            }
        }
    }
}
```

A basic test for this ViewModel looks straightforward — but there's a catch. `runTest` uses a `StandardTestDispatcher` by default, which means child coroutines launched inside it don't execute immediately. You need to explicitly advance the scheduler.

```kotlin
@Test
fun `payment processes successfully`() = runTest {
    val fakeRepo = FakePaymentRepository(Result.success(Receipt("TXN-001")))
    val viewModel = PaymentViewModel(fakeRepo)

    viewModel.processPayment(49.99)
    advanceUntilIdle() // Execute all pending coroutines

    assertEquals(PaymentState.Completed(Receipt("TXN-001")), viewModel.state.value)
}
```

Without `advanceUntilIdle()`, the assertion runs before the `viewModelScope.launch` block has executed. The state would still be `Idle`. This is the first mistake everyone makes — `runTest` doesn't eagerly run child coroutines the way `runBlocking` does. It queues them and waits for you to decide when they should execute. That level of control is the whole point.

The `runTest` block also has a 60-second timeout by default. If your test hangs because a coroutine is waiting for something that never arrives — a `CompletableDeferred` that's never completed, a `Channel` that's never sent to — it won't hang forever. You'll get a timeout exception, which is far better than a CI pipeline stuck for hours.

## TestDispatcher

There are two `TestDispatcher` implementations, and choosing the wrong one leads to either flaky tests or tests that pass but hide real bugs.

**`StandardTestDispatcher`** queues coroutines for execution without running them immediately. You control exactly when they run by calling `advanceUntilIdle()`, `advanceTimeBy()`, or `runCurrent()`. This is the default dispatcher in `runTest`, and I think it's the right default. It forces you to be explicit about execution order, which maps closer to how dispatchers actually behave in production — coroutines don't execute instantly on `Dispatchers.IO` either. They get scheduled.

**`UnconfinedTestDispatcher`** starts coroutines eagerly on the current thread, similar to `Dispatchers.Unconfined`. The coroutine runs immediately until its first suspension point. This means you often don't need `advanceUntilIdle()` at all, which makes tests shorter. But it hides timing bugs. If your production code depends on two coroutines running concurrently and the order mattering, `UnconfinedTestDispatcher` will serialize them deterministically and your test will pass. Ship it to production where `Dispatchers.Default` has actual parallelism, and you'll see the race condition your test never caught.

I use `StandardTestDispatcher` for almost everything. The extra `advanceUntilIdle()` call is a small price for tests that actually model real dispatcher behavior. The only time I reach for `UnconfinedTestDispatcher` is when I'm testing a simple suspend function with no concurrency concerns and I just want the test to be compact.

## Injecting Dispatchers

Here's the pattern that makes coroutine code testable: never hardcode a dispatcher. Every class that switches contexts should accept its dispatcher through the constructor.

The wrong way looks like this — and I've seen it in almost every codebase I've worked on:

```kotlin
// Don't do this
class OrderRepository(private val api: OrderApi) {
    suspend fun fetchOrders(): List<Order> = withContext(Dispatchers.IO) {
        api.getOrders().map { it.toDomain() }
    }
}
```

That `Dispatchers.IO` is a hardcoded dependency. In tests, this coroutine will run on the IO thread pool, outside the `TestCoroutineScheduler`'s control. Delays won't be skipped. Virtual time won't advance. The test might be flaky because you're racing against real threads.

The fix is injection:

```kotlin
class OrderRepository(
    private val api: OrderApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    suspend fun fetchOrders(): List<Order> = withContext(ioDispatcher) {
        api.getOrders().map { it.toDomain() }
    }
}
```

Now in tests, you pass a `StandardTestDispatcher` that shares the same scheduler as your `runTest` scope:

```kotlin
@Test
fun `fetches and maps orders`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val fakeApi = FakeOrderApi(listOf(OrderDto("ORD-1", "Pending")))
    val repository = OrderRepository(fakeApi, testDispatcher)

    val orders = repository.fetchOrders()

    assertEquals(1, orders.size)
    assertEquals("ORD-1", orders.first().id)
}
```

The key detail is `StandardTestDispatcher(testScheduler)`. By passing `testScheduler`, the new dispatcher shares the same virtual clock as the `runTest` scope. If you create a `StandardTestDispatcher()` without passing the scheduler, it gets its own independent scheduler, and `advanceUntilIdle()` in the test won't advance coroutines on that dispatcher. Everything silently breaks.

For ViewModels that use `viewModelScope` (which dispatches on `Dispatchers.Main`), you need to swap `Dispatchers.Main` itself using `Dispatchers.setMain()`:

```kotlin
@Before
fun setup() {
    Dispatchers.setMain(StandardTestDispatcher())
}

@After
fun tearDown() {
    Dispatchers.resetMain()
}
```

When `Dispatchers.Main` is set to a `TestDispatcher`, `runTest` automatically picks up its scheduler. You don't need to pass it manually. This is a design choice in the library — if `Main` is a `TestDispatcher`, new `TestScope` instances created without an explicit scheduler will reuse the one from `Main`. Forget the `setMain` call, and your ViewModel tests will crash with "Module with the Main dispatcher had failed to initialize" because there's no Android main looper in a JVM test environment.

## Testing Delays and Timing

Virtual time is where `runTest` really earns its keep. You can test code that uses `delay()` without actually waiting, and you can precisely control when delays expire using `advanceTimeBy()`.

Consider a search ViewModel with debounce logic — the user types a query, and you wait 300ms of inactivity before hitting the network:

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val results: StateFlow<List<SearchResult>> = _query
        .debounce(300)
        .filter { it.isNotBlank() }
        .mapLatest { query ->
            withContext(ioDispatcher) {
                searchRepository.search(query)
            }
        }
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
}
```

Testing this with real time would mean your test literally waits 300ms per keystroke. With virtual time, you control every millisecond:

```kotlin
@Test
fun `debounces search queries`() = runTest {
    val fakeRepo = FakeSearchRepository()
    val viewModel = SearchViewModel(fakeRepo, StandardTestDispatcher(testScheduler))

    viewModel.results.test {
        assertEquals(emptyList(), awaitItem()) // initial state

        viewModel.onQueryChanged("kot")
        advanceTimeBy(100) // Only 100ms passed — debounce hasn't fired
        expectNoEvents()   // No search executed yet

        viewModel.onQueryChanged("kotlin")
        advanceTimeBy(350) // 350ms after "kotlin" — debounce fires

        val results = awaitItem()
        assertEquals("kotlin", fakeRepo.lastQuery)

        cancelAndIgnoreRemainingEvents()
    }
}
```

`advanceTimeBy(100)` moves the virtual clock forward by 100ms. Since the debounce is 300ms, nothing happens. `advanceTimeBy(350)` pushes past the threshold, and the search executes. The entire test runs in milliseconds of real time, even though it simulates 450ms of delay.

`runCurrent()` is useful when you need to execute tasks that are queued at the current virtual time without advancing the clock. I use it when I want to verify that something was scheduled but hasn't triggered yet — advance time, run current, check state.

## Testing StateFlow

StateFlow has unique testing challenges because of [conflation](https://mukuljangra.com/2025/03/27/conflation-testing-stateflows.html). If your ViewModel emits `Loading` and then immediately emits `Success`, a slow collector might only see `Success` — the `Loading` state gets overwritten before the collector resumes.

For reliable StateFlow testing, I use [Turbine](https://mukuljangra.com/2025/04/10/turbine-testing-kotlin-flows.html). It collects emissions sequentially, forcing you to account for every state transition:

```kotlin
@Test
fun `login shows loading then success`() = runTest {
    val viewModel = LoginViewModel(FakeAuthRepository(success = true))

    viewModel.uiState.test {
        assertEquals(LoginState.Idle, awaitItem())

        viewModel.login("user@test.com", "password123")

        assertEquals(LoginState.Loading, awaitItem())
        assertEquals(LoginState.Success, awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

Every `awaitItem()` call suspends until the next emission arrives. If `Loading` gets conflated away and Turbine only sees `Success`, the test fails because you're asserting `Loading` first. This is exactly the kind of strictness you want — your UI depends on seeing the loading state, so your test should too.

One gotcha: `StateFlow` always emits its current value immediately when you start collecting. That first `awaitItem()` is the initial state, not a state change you triggered. Forget to consume it and Turbine reports "Unconsumed events" at the end of the test block. I've lost count of how many times I've hit that error.

## Common Pitfalls

**Forgetting to advance time.** With `StandardTestDispatcher`, child coroutines don't run until you call `advanceUntilIdle()` or similar. Your assertions run against stale state. The test passes because `assertEquals(Idle, state.value)` is true — but only because the coroutine never executed. This is a false positive, and it's the most common coroutine testing bug.

**Missing `Dispatchers.setMain`.** If your ViewModel uses `viewModelScope`, it dispatches on `Dispatchers.Main`. On JVM tests, there is no main looper. Without `Dispatchers.setMain(testDispatcher)` in your `@Before` method, the test crashes immediately. Always pair it with `Dispatchers.resetMain()` in `@After` to avoid leaking the test dispatcher into other tests.

**Test hangs from unconsumed events.** Turbine enforces that every emission is consumed. If your Flow emits three items and you only `awaitItem()` twice, the test hangs waiting for you to consume the third. Then it times out. The fix is either consuming the remaining items or calling `cancelAndIgnoreRemainingEvents()`.

**Real delays leaking in.** If any code path hits a real dispatcher instead of a `TestDispatcher`, delays actually wait. A `delay(5000)` on `Dispatchers.IO` takes five real seconds. Your test suite slows to a crawl, and tests become order-dependent because they're sharing real threads. The fix is always the same — inject dispatchers and make sure every `TestDispatcher` shares the same `testScheduler`.

**Creating TestDispatchers with separate schedulers.** If you write `StandardTestDispatcher()` without passing `testScheduler`, the new dispatcher gets its own independent scheduler. Calling `advanceUntilIdle()` in your test won't affect coroutines running on that dispatcher. The test appears to work but silently skips the code you thought you were testing.

## Quiz

**Question 1:** What does the following test print?

```kotlin
@Test
fun example() = runTest {
    launch {
        delay(1000)
        println("Launched")
    }
    println("After launch")
}
```

- A) "Launched" then "After launch"
- B) "After launch" then "Launched"
- C) "After launch" only

**Wrong:** If you picked A. `runTest` uses `StandardTestDispatcher` by default — the `launch` block is queued, not executed eagerly. "After launch" prints first. Then `runTest` automatically calls `advanceUntilIdle()` before returning, which runs the launched coroutine. **Correct:** B.

**Question 2:** A test uses `StandardTestDispatcher(testScheduler)` for a repository but creates a ViewModel with `StandardTestDispatcher()` (no scheduler argument). What happens when you call `advanceUntilIdle()`?

- A) Both the repository and ViewModel coroutines execute
- B) Only the repository coroutines execute
- C) Neither executes

**Wrong:** If you picked A. The ViewModel's dispatcher has its own independent scheduler. `advanceUntilIdle()` only advances the `testScheduler` from the `runTest` scope, which the ViewModel's dispatcher knows nothing about. **Correct:** B. The ViewModel coroutines sit on a separate scheduler that nobody advances.

## Coding Challenge

Build a `NotificationViewModel` that fetches notifications from a repository, shows a `Loading` state, then either `Loaded(notifications)` or `Error(message)`. Add a `refresh()` method with a 2-second cooldown — if the user calls `refresh()` within 2 seconds of the last refresh, it should be ignored (no network call, no state change).

Write tests that verify: (1) the initial load sequence (`Idle` -> `Loading` -> `Loaded`), (2) error handling maps to `Error` state, (3) the 2-second cooldown actually blocks rapid refreshes using `advanceTimeBy`, and (4) a refresh after the cooldown period succeeds. Inject dispatchers so all tests use virtual time.

Thanks for reading!
