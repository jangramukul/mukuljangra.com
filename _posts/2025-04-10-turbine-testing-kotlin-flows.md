---
title: Turbine — The Right Way to Test Kotlin Flows
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Testing
---

The first time I tried testing a `StateFlow` in a ViewModel, I wrote something that looked reasonable — launch a coroutine, collect the flow into a list, assert on the list. The test passed. Then I changed the order of two emissions, and the test still passed. Then I introduced a bug that skipped an intermediate state entirely, and the test still passed. My "test" was collecting the final state after everything settled, completely missing the intermediate emissions that my UI depended on.

This is the fundamental problem with testing Flows without a purpose-built tool. Flows are asynchronous, time-dependent streams. Collecting them in tests requires coroutine management, careful timeout handling, and dealing with race conditions between emission and assertion. You end up writing more test infrastructure than actual test logic. And the test infrastructure you write is almost always subtly broken — it either misses emissions, doesn't fail when it should, or is flaky because of timing.

Cash App's [Turbine](https://github.com/cashapp/turbine) library solves this cleanly. It gives you a DSL that consumes flow emissions one at a time, with built-in timeouts, strict consumption requirements, and clear failure messages. Once I switched to Turbine, my flow tests went from "probably correct" to "definitely correct," and they became significantly more readable in the process.

## The Problem Without Turbine

To understand why Turbine exists, look at what testing a StateFlow looks like without it. Say you have a `SearchViewModel` that exposes a `StateFlow<SearchUiState>`:

```kotlin
// Without Turbine — fragile and incomplete
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
    assertEquals(SearchUiState.Loading, states[1])
    assertTrue(states[2] is SearchUiState.Results)

    job.cancel()
}
```

This works, but there are three problems. First, you're manually managing a collection coroutine and remembering to cancel it. Forget that `job.cancel()` and the test hangs. Second, the index-based assertions are brittle — if `StateFlow` conflates two rapid emissions (which it does by default, because `StateFlow` only keeps the latest value and deduplicates with `equals()`), your indices shift and the test fails for the wrong reason. Third, there's no enforcement that you've consumed all emissions. If the ViewModel emits an unexpected error state after your assertions, the test still passes, silently ignoring a bug.

## Turbine's Test DSL

Turbine replaces all that ceremony with a single `test {}` extension function. Inside the block, you consume emissions one at a time with `awaitItem()`, check for completion with `awaitComplete()`, and handle errors with `awaitError()`. Turbine handles the coroutine management, timeouts, and cleanup automatically.

```kotlin
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

This is not just shorter — it's semantically different. Each `awaitItem()` call blocks until the next emission arrives (with a configurable timeout, default 3 seconds). If no emission comes, the test fails with a clear message: "No value produced in 3s." If an unexpected emission arrives that you don't consume, Turbine fails the test when the block exits: "Unconsumed events found." This strictness is the whole point. Turbine forces you to account for every emission, which means your test actually verifies the full sequence of state transitions, not just the final state.

## Hot Flows vs Cold Flows

Testing hot flows (`StateFlow`, `SharedFlow`) and cold flows (regular `flow { }` builders) requires different patterns, and getting this wrong is one of the most common Turbine mistakes.

**StateFlow** always has a current value. When you call `.test {}` on a StateFlow, the first `awaitItem()` returns the initial value immediately — before you've done anything. If you forget to consume this initial emission, Turbine will report an unconsumed event and fail your test.

```kotlin
@Test
fun `state flow emits initial value`() = runTest {
    val viewModel = ProfileViewModel(FakeProfileRepository())

    viewModel.state.test {
        // First awaitItem() is the initial state — don't skip it
        assertEquals(ProfileUiState.Loading, awaitItem())

        // Now wait for the actual loaded state
        val loaded = awaitItem()
        assertIs<ProfileUiState.Loaded>(loaded)
        assertEquals("Mukul", loaded.profile.name)

        cancelAndIgnoreRemainingEvents()
    }
}
```

**Cold flows** don't emit until collected, and they complete naturally when the producer finishes. With cold flows, you can assert on `awaitComplete()` to verify the flow finished:

```kotlin
@Test
fun `cold flow emits and completes`() = runTest {
    val items = flowOf("alpha", "beta", "gamma")

    items.test {
        assertEquals("alpha", awaitItem())
        assertEquals("beta", awaitItem())
        assertEquals("gamma", awaitItem())
        awaitComplete() // Verify the flow actually completed
    }
}
```

**SharedFlow** is the trickiest. Unlike StateFlow, a SharedFlow with `replay = 0` has no initial value, so calling `awaitItem()` immediately will block until something is emitted. And because SharedFlow doesn't conflate by default (unlike StateFlow), you'll receive every emission — which can be a lot in a rapid-fire scenario.

## Testing ViewModel State Transitions

The most common Turbine use case is verifying that a ViewModel emits the right sequence of states. Here's a pattern I use for login testing that validates the full loading → success/error flow:

```kotlin
@Test
fun `login success flow`() = runTest {
    val repository = FakeLoginRepository(shouldSucceed = true)
    val viewModel = LoginViewModel(repository)

    viewModel.state.test {
        assertEquals(LoginUiState.Idle, awaitItem())

        viewModel.onLoginClicked("user@test.com", "password123")

        assertEquals(LoginUiState.Loading, awaitItem())

        val success = awaitItem()
        assertIs<LoginUiState.Success>(success)
        assertEquals("user@test.com", success.session.email)

        cancelAndIgnoreRemainingEvents()
    }
}

@Test
fun `login failure shows error`() = runTest {
    val repository = FakeLoginRepository(shouldSucceed = false)
    val viewModel = LoginViewModel(repository)

    viewModel.state.test {
        assertEquals(LoginUiState.Idle, awaitItem())

        viewModel.onLoginClicked("user@test.com", "wrong")

        assertEquals(LoginUiState.Loading, awaitItem())

        val error = awaitItem()
        assertIs<LoginUiState.Error>(error)
        assertTrue(error.message.contains("Invalid credentials"))
        assertTrue(error.canRetry)

        cancelAndIgnoreRemainingEvents()
    }
}
```

Notice the pattern: consume the initial state, trigger an action, then consume each subsequent state in order. The test reads like a script of the user interaction, which makes it easy to understand what's being verified. If the ViewModel skips the `Loading` state or emits states in the wrong order, the test fails immediately at the exact point where the sequence diverged.

## The expectMostRecentItem Trap and Fix

StateFlow conflates rapid emissions. If your ViewModel goes from `Loading` to `Success` faster than the test consumes, you might miss the `Loading` state entirely. Turbine provides `expectMostRecentItem()` for this scenario — it skips intermediate emissions and returns the latest one:

```kotlin
@Test
fun `quick operation skips to result`() = runTest {
    val viewModel = SearchViewModel(FastRepository())

    viewModel.state.test {
        skipItems(1) // Skip initial Idle state

        viewModel.onQueryChanged("kotlin")

        // Don't care about Loading — just want the final state
        val result = expectMostRecentItem()
        assertIs<SearchUiState.Results>(result)
    }
}
```

But here's the thing — I'd argue that using `expectMostRecentItem()` in most tests is a code smell. If you're skipping states, you're not testing the full transition sequence. Your UI observes every state change, and if the Loading state matters for showing a spinner, it should be tested. Use `expectMostRecentItem()` only when the intermediate states genuinely don't matter for the behavior you're verifying — like testing the final result of a debounced search, where you only care about the settled state.

`skipItems(n)` is the counterpart: it consumes and discards `n` items. Useful for skipping a known initial state when you only care about what happens after a specific action.

## Testing Multiple Flows With turbineScope

Sometimes you need to test two flows simultaneously — a state flow and an events flow, or two ViewModels that interact. Turbine's `turbineScope` lets you create multiple test turbines in the same test:

```kotlin
@Test
fun `navigation event emitted on login success`() = runTest {
    val viewModel = LoginViewModel(FakeLoginRepository(shouldSucceed = true))

    turbineScope {
        val states = viewModel.state.testIn(backgroundScope)
        val events = viewModel.navigationEvents.testIn(backgroundScope)

        assertEquals(LoginUiState.Idle, states.awaitItem())

        viewModel.onLoginClicked("user@test.com", "password123")

        assertEquals(LoginUiState.Loading, states.awaitItem())
        assertEquals(LoginUiState.Success::class, states.awaitItem()::class)

        // Verify navigation event was emitted
        assertEquals(NavigationEvent.GoToHome, events.awaitItem())

        states.cancelAndIgnoreRemainingEvents()
        events.cancelAndIgnoreRemainingEvents()
    }
}
```

`testIn(backgroundScope)` creates a `ReceiveTurbine` that collects in the given scope. This is Turbine's answer to concurrent flow testing — instead of nesting `test {}` blocks (which doesn't work because they're sequential), you create independent turbines that collect in parallel. The `turbineScope` block enforces that all turbines are properly consumed or cancelled before the test exits.

## Common Mistakes That Will Bite You

After writing hundreds of Turbine tests, here are the patterns that cause the most debugging pain:

**Not consuming the initial StateFlow emission.** StateFlow always has a value. If you forget the first `awaitItem()`, Turbine reports "Unconsumed events" at the end of the test. This is especially confusing when the initial value is the "empty" or "default" state that you think shouldn't count as an emission. It does. Always consume it or use `skipItems(1)`.

**Forgetting `cancelAndIgnoreRemainingEvents()`.** For hot flows like StateFlow that never complete, your `test {}` block will timeout waiting for completion unless you explicitly cancel. This is one of those things that's obvious once you know it but produces confusing "No value produced in 3s" errors until you do.

**Using `runTest` without `UnconfinedTestDispatcher` for ViewModel tests.** If your ViewModel uses `viewModelScope.launch`, the coroutine is dispatched to `Dispatchers.Main`. In tests, you need to replace `Main` with a test dispatcher. The standard setup is:

```kotlin
@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    // ...
}

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

Without this, `viewModelScope.launch` deadlocks in tests because there's no `Dispatchers.Main` on the JVM. The `UnconfinedTestDispatcher` executes coroutines eagerly (immediately at the call site), while `StandardTestDispatcher` requires explicit `advanceUntilIdle()` calls. For most ViewModel tests, `UnconfinedTestDispatcher` is simpler because emissions happen synchronously.

**Testing emissions that never arrive.** If you call `awaitItem()` and no emission comes within the timeout (3 seconds by default), Turbine throws. This is correct behavior — it means your code didn't emit when you expected it to. But the timeout can mask issues: if your test is slow because of `StandardTestDispatcher`, you might need `advanceUntilIdle()` before the `awaitItem()` to flush pending coroutines.

## Integration With kotlinx-coroutines-test

Turbine works seamlessly with `kotlinx-coroutines-test`, but there's one subtle interaction worth knowing. When you use `runTest` (which uses `StandardTestDispatcher` by default), coroutines are not executed eagerly — they're queued and run when you call `advanceUntilIdle()` or `advanceTimeBy()`.

Inside a Turbine `test {}` block, `awaitItem()` automatically advances the test dispatcher's virtual time. So you usually don't need explicit `advanceUntilIdle()` calls. But if your code uses `delay()` — say, a debounce in a search ViewModel — you might need to advance time manually:

```kotlin
@Test
fun `search debounces input`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())

    viewModel.state.test {
        skipItems(1) // Skip initial state

        viewModel.onQueryChanged("k")
        viewModel.onQueryChanged("ko")
        viewModel.onQueryChanged("kot")

        // No emission yet — debounce is 300ms
        expectNoEvents()

        advanceTimeBy(300)

        // Now the debounced search fires
        assertEquals(SearchUiState.Loading, awaitItem())

        val results = awaitItem()
        assertIs<SearchUiState.Results>(results)

        cancelAndIgnoreRemainingEvents()
    }
}
```

`expectNoEvents()` asserts that nothing was emitted within the default timeout window. This is Turbine's way of verifying that your debounce logic actually delays, rather than firing immediately.

## Why Turbine Became the Standard

Turbine has about 3,000 GitHub stars and is used by Google's Now In Android reference app, Square's projects, and most major Android open-source projects that test flows. It's become the de facto standard not because it does something magical, but because it makes the right thing easy and the wrong thing hard.

Without Turbine, you can test flows — but you'll write fragile tests that don't verify emission ordering, don't catch unconsumed events, and don't timeout properly. Turbine makes all of these default behaviors. The strictness that initially feels annoying — "why is it failing because I didn't consume one event?" — is exactly what prevents the class of bugs where your tests pass but your UI shows the wrong state sequence to the user.

The library is small (single dependency, no transitive dependencies beyond `kotlinx-coroutines-test`), stable (it's been production-tested at Cash App since 2020), and its API surface is focused — you really only need `test {}`, `awaitItem()`, `cancelAndIgnoreRemainingEvents()`, and occasionally `turbineScope` with `testIn()`. For any project that uses Kotlin Flows, Turbine isn't optional tooling — it's table stakes for having flow tests you can actually trust.

Thanks for reading!
