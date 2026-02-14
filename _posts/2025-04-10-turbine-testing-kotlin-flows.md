---
title: Turbine — The Right Way to Test Kotlin Flows
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Testing
---

The first time I tried testing a `StateFlow` in a ViewModel, I launched a coroutine, collected emissions into a list, and asserted on the list. The test passed. Then I deliberately introduced a bug — skipping an intermediate `Loading` state — and the test still passed.

Hold on. A test that passes *with* a bug?

My collector was grabbing the final state after everything settled, completely blind to the state transitions my UI actually depended on. I had a test that could never fail, which is worse than having no test at all. It's like having a smoke detector that only checks for fire when you press a button — technically it "works," but it won't save your house.

This is what happens when you try to test Flows with raw coroutine machinery. You end up managing collection jobs, handling cancellation, wiring timeouts, and fighting race conditions between emissions and assertions. The test infrastructure grows until it dwarfs the actual assertions, and the infrastructure itself is almost always subtly broken. Cash App's [Turbine](https://github.com/cashapp/turbine) library exists specifically to fix this. It gives you a DSL that consumes emissions sequentially, enforces that every event is accounted for, and fails loudly when something unexpected happens. Once I switched to Turbine, my flow tests went from "probably correct" to actually trustworthy.

## The Problem Without Turbine

To appreciate what Turbine does, you need to feel the pain of life without it. Here's the ceremony required to test a `StateFlow` the manual way:

```kotlin
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

Three problems here, and they're all sneaky. First, you're managing a collection coroutine manually and must remember `job.cancel()` — forget it and the test hangs indefinitely. It's like opening a file handle and relying on yourself to close it every single time. Eventually, you won't.

Second, the index-based assertions are brittle. StateFlow conflates rapid emissions (it only keeps the latest value and deduplicates via `equals()`), so if `Loading` gets overwritten before the collector resumes, your indices shift and the test fails for the wrong reason. You're debugging a test infrastructure problem, not a business logic problem.

Third — and this is the really dangerous one — there's zero enforcement that you've consumed everything. If the ViewModel emits an unexpected error state after your assertions, the test passes silently, hiding a real bug. Your test is essentially saying "I don't care what else happens." That's not testing. That's hoping.

## Turbine's Core API

Turbine replaces all that ceremony with one extension function: `test {}`. Inside the block, you pull emissions one at a time using a handful of focused methods. Think of it like a ticket counter at a deli — you take a number, wait for your turn, and get served in order. No cutting in line, no skipping numbers. Here's the complete API surface you'll actually use:

**`awaitItem()`** suspends until the next emission arrives and returns it. If nothing comes within the timeout (3 seconds by default), Turbine throws with "No value produced in 3s." This is your primary assertion tool — every state you expect, you pull with `awaitItem()`.

**`awaitComplete()`** suspends until the Flow completes normally. Use this for cold flows that have a finite number of emissions. If the flow emits another item instead of completing, Turbine fails with "Expected complete but found Item(...)".

**`awaitError()`** suspends until the Flow terminates with an exception and returns the `Throwable`. This is how you verify that error flows propagate correctly — the exception doesn't crash your test, it becomes an event you assert on.

**`expectNoEvents()`** asserts that no emissions, completions, or errors occurred. This is critical for testing debounce logic or verifying that a flow stays quiet when it should.

**`skipItems(n)`** consumes and discards `n` items. Useful for skipping a known initial state when you only care about what happens after a specific action.

**`expectMostRecentItem()`** skips all pending emissions and returns only the latest one. Handy for scenarios where intermediate states are irrelevant — but use it sparingly, because skipping states means you're not testing the full transition sequence.

**`cancelAndIgnoreRemainingEvents()`** cancels collection and suppresses the "Unconsumed events" error. You need this for hot flows like `StateFlow` that never complete on their own.

Now here's what the same search test looks like with Turbine:

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

This isn't just shorter — it's semantically different. Each `awaitItem()` suspends until the next emission arrives, so assertions are sequential and deterministic. No index math. No collection job to manage. No `job.cancel()` to forget.

But here's where Turbine really earns its keep: if an unexpected emission arrives that you don't consume, Turbine fails with "Unconsumed events found" when the block exits. That strictness is the whole point — Turbine forces you to account for every emission, which means your test actually verifies the full state sequence, not just the final snapshot. Remember that smoke detector analogy? Turbine is the kind that's always on and screams the moment something's wrong.

## Testing Cold Flows

Cold flows are the simplest to test because they have a defined lifecycle — they start when collected and complete when the producer finishes. The `flow {}` builder and `flowOf()` both create cold flows.

```kotlin
@Test
fun `repository returns mapped results`() = runTest {
    val repository = UserRepository(FakeApiClient())

    repository.getActiveUsers().test {
        val first = awaitItem()
        assertEquals("Mukul", first.name)
        assertTrue(first.isActive)

        val second = awaitItem()
        assertEquals("Priya", second.name)

        awaitComplete()
    }
}
```

The `awaitComplete()` call is important here. It verifies the flow actually terminated — if the producer accidentally emits extra items or throws an exception instead of completing, the test catches it. For `flowOf()`, completion is guaranteed, but for custom `flow {}` builders where the producer might have conditional logic or loops, verifying completion confirms the producer behaved as expected. You don't need `cancelAndIgnoreRemainingEvents()` for cold flows that complete — Turbine's automatic `ensureAllEventsConsumed()` check handles cleanup.

> **🧠 Think about it:** Why does `awaitComplete()` matter for cold flows but `cancelAndIgnoreRemainingEvents()` is needed for StateFlow? What's fundamentally different about their lifecycles?

## Testing StateFlow — Initial Values and Conflation

StateFlow always has a current value. When Turbine calls `collect` on a StateFlow, the first emission is that initial value — delivered immediately, before you've triggered any action. If you forget to consume it, Turbine reports "Unconsumed events" and fails your test.

This catches people off guard because the initial value feels like it shouldn't "count." But it does — Turbine treats it like any other emission. Every `StateFlow` emission must be consumed or explicitly skipped. Think of it like a movie in a theater: you sit down and the studio logo plays before the film starts. You can't fast-forward past it (unless you use `skipItems(1)`), but you have to acknowledge it happened.

```kotlin
@Test
fun `profile loads user data`() = runTest {
    val viewModel = ProfileViewModel(FakeProfileRepository())

    viewModel.uiState.test {
        // First awaitItem() is always the initial state
        assertEquals(ProfileUiState.Idle, awaitItem())

        viewModel.loadProfile("user-42")

        assertEquals(ProfileUiState.Loading, awaitItem())

        val loaded = awaitItem()
        assertIs<ProfileUiState.Loaded>(loaded)
        assertEquals("Mukul", loaded.profile.name)

        cancelAndIgnoreRemainingEvents()
    }
}
```

The other StateFlow gotcha is conflation. I wrote about this in detail in my [conflation post](https://mukuljangra.com/2025/03/27/conflation-testing-stateflows.html), but the short version is: if your ViewModel sets `Loading` and then immediately sets `Success` before the collector resumes, the collector only sees `Success`. The `Loading` state gets overwritten atomically. To observe every transition, you need `UnconfinedTestDispatcher`, which executes coroutines eagerly so the collector runs inline after each `value` assignment.

```kotlin
@Test
fun `all state transitions are observable`() = runTest(UnconfinedTestDispatcher()) {
    val viewModel = ProfileViewModel(FakeProfileRepository())

    viewModel.uiState.test {
        assertEquals(ProfileUiState.Idle, awaitItem())

        viewModel.loadProfile("user-42")

        // With UnconfinedTestDispatcher, Loading is observed
        // before the ViewModel has a chance to overwrite it
        assertEquals(ProfileUiState.Loading, awaitItem())
        assertIs<ProfileUiState.Loaded>(awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

## Testing SharedFlow — Every Emission Matters

SharedFlow is fundamentally different from StateFlow in two ways that change how you test it. First, a SharedFlow with `replay = 0` has no initial value — calling `awaitItem()` immediately will suspend until something is emitted. There's nothing to skip. No studio logo before the movie.

Second — and this is the big one — SharedFlow doesn't conflate. If you emit A, B, C rapidly, every active collector sees all three. This makes SharedFlow ideal for event streams where dropping emissions would be a bug — navigation events, analytics, toasts.

```kotlin
@Test
fun `analytics events are all captured`() = runTest {
    val tracker = AnalyticsTracker()

    tracker.events.test {
        tracker.track(AnalyticsEvent.ScreenView("home"))
        tracker.track(AnalyticsEvent.ButtonClick("search"))
        tracker.track(AnalyticsEvent.ScreenView("results"))

        // Every emission arrives — no conflation
        assertEquals("home", (awaitItem() as AnalyticsEvent.ScreenView).screen)
        assertEquals("search", (awaitItem() as AnalyticsEvent.ButtonClick).id)
        assertEquals("results", (awaitItem() as AnalyticsEvent.ScreenView).screen)

        cancelAndIgnoreRemainingEvents()
    }
}
```

One thing to watch: if your SharedFlow has `replay > 0`, Turbine's `test {}` starts collecting and immediately receives the replayed emissions. This is the same behavior as a new subscriber joining a SharedFlow in production — you get the replay cache upfront. If your test emits values *before* calling `test {}` on a `replay = 0` SharedFlow, those emissions are lost because no collector was active yet. Turbine's `test {}` guarantees collection starts before the lambda body runs, so emit inside the block, not before it.

> **💡 The "aha" moment:** StateFlow = "What's the score right now?" (always has a value, conflates updates). SharedFlow = "What just happened?" (no initial value, delivers every event). Pick the wrong one and your tests will lie to you.

## Timeout Configuration

Turbine's default timeout is 3 seconds of wall clock time — not virtual time. This means `awaitItem()` waits up to 3 real seconds for an emission regardless of what `runTest`'s virtual clock is doing. For most unit tests, 3 seconds is generous. But there are cases where you need to adjust it.

If your test involves real I/O, network calls in integration tests, or platform-specific delays that don't play well with virtual time, you might need a longer timeout. If you're writing fast unit tests and want failures to surface quickly, a shorter timeout tightens the feedback loop. You can set it per `test` call, per `testIn` call, or globally for a block:

```kotlin
// Per-flow timeout
viewModel.state.test(timeout = 5.seconds) {
    // All awaitItem() calls inside use 5s timeout
}

// Global override for a block
withTurbineTimeout(500.milliseconds) {
    fastFlow.test {
        assertEquals("instant", awaitItem())
        awaitComplete()
    }
}
```

Here's the reframe on timeouts that changed how I think about them: **a Turbine timeout failure is almost never a timeout problem — it's an emission problem.** When `awaitItem()` throws "No value produced in 3s," the instinct is to bump the timeout. Don't do that. 99% of the time, the flow genuinely didn't emit. Maybe your ViewModel's coroutine is stuck on `StandardTestDispatcher` and needs an `advanceUntilIdle()` call. Maybe the `Dispatchers.Main` replacement isn't set up. Maybe the fake repository isn't returning data. The timeout is surfacing a real bug — don't silence it by making the timeout longer.

> **🔥 Real talk:** I've watched teammates bump Turbine timeouts to 10 seconds to "fix" flaky tests. Every single time, the real problem was a missing `advanceUntilIdle()` or a broken fake. The timeout was doing its job — they just didn't want to hear the message.

## Testing Multiple Flows With turbineScope

Real ViewModels often expose more than one flow — a `StateFlow` for UI state and a `SharedFlow` for one-shot events like navigation or error dialogs. You can't nest `test {}` blocks because they're sequential — each one collects a single flow and blocks until you're done with it.

Turbine's `turbineScope` with `testIn()` solves this by creating independent turbines that collect concurrently. Think of it like having two TVs side by side — you're watching both channels at the same time, checking each one as events come in:

```kotlin
@Test
fun `login success triggers navigation`() = runTest {
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

`testIn(backgroundScope)` creates a `ReceiveTurbine` that collects in the given scope. Using `runTest`'s `backgroundScope` ensures the collection coroutine gets cleaned up automatically when the test ends. The `turbineScope` block enforces that all turbines are properly consumed or cancelled before exit — if you forget to handle one, it fails. You can also name turbines with `testIn(backgroundScope, name = "states")` for clearer error messages when debugging multi-flow tests.

## Real-World Patterns

### MainDispatcherRule

If your ViewModel uses `viewModelScope.launch`, the coroutine dispatches to `Dispatchers.Main`. On the JVM (where your tests run), there's no `Main` dispatcher — the test deadlocks. You need a `TestRule` that swaps `Dispatchers.Main` for a test dispatcher before every test:

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

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `login emits loading then success`() = runTest {
        val viewModel = LoginViewModel(FakeLoginRepository(shouldSucceed = true))
        viewModel.uiState.test {
            assertEquals(LoginUiState.Idle, awaitItem())
            viewModel.onLoginClicked("user@test.com", "pass123")
            assertEquals(LoginUiState.Loading, awaitItem())
            assertIs<LoginUiState.Success>(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

I use `UnconfinedTestDispatcher` here because it executes coroutines eagerly — emissions happen synchronously at the call site, so Turbine's collector sees every state transition without conflation. `StandardTestDispatcher` queues coroutines and requires explicit `advanceUntilIdle()` calls, which adds verbosity and opens the door to conflation bugs. For ViewModel tests where you want to verify state sequences, unconfined is almost always the right choice.

### Testing Debounce Logic

Debounce testing is where `expectNoEvents()` and `advanceTimeBy()` work together. You need to verify that rapid inputs don't trigger multiple operations, and that the debounced action fires after the delay:

```kotlin
@Test
fun `search debounces rapid input`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())

    viewModel.state.test {
        skipItems(1) // Skip initial Idle

        viewModel.onQueryChanged("k")
        viewModel.onQueryChanged("ko")
        viewModel.onQueryChanged("kot")

        expectNoEvents() // Nothing yet — debounce is 300ms

        advanceTimeBy(300)

        assertEquals(SearchUiState.Loading, awaitItem())
        val results = awaitItem()
        assertIs<SearchUiState.Results>(results)
        // Only "kot" was searched, not "k" or "ko"
        assertEquals("kot", results.query)

        cancelAndIgnoreRemainingEvents()
    }
}
```

`expectNoEvents()` verifies silence — no items, no completion, no errors. Without it, you'd have no way to assert that the debounce actually delayed the search. This is one of those Turbine methods that seems niche until you need it, and then it's indispensable.

### Error Flow Testing

Flows that terminate with exceptions need `awaitError()`. The exception doesn't crash your test — Turbine captures it as an event:

```kotlin
@Test
fun `network failure produces error event`() = runTest {
    val brokenFlow = flow<String> {
        emit("connecting")
        throw IOException("Connection refused")
    }

    brokenFlow.test {
        assertEquals("connecting", awaitItem())
        val error = awaitError()
        assertIs<IOException>(error)
        assertEquals("Connection refused", error.message)
    }
}
```

If you don't consume the error with `awaitError()`, Turbine fails with "Unconsumed events found" and attaches the original exception as the cause — so you get the full stack trace in the test output. This is a much better experience than having the exception silently swallowed or thrown in an unrelated coroutine.

> **⚡ Quick check:** What happens if you call `awaitItem()` instead of `awaitError()` when a flow throws an exception? Does Turbine give you the exception as an item, or does it fail differently?

## Why Turbine Is Table Stakes

Turbine has around 3,000 GitHub stars, a single dependency (no transitive dependencies beyond `kotlinx-coroutines-test`), and has been production-tested at Cash App since 2020. It's used in Google's Now In Android reference app and most major Android open-source projects that test flows. The library became the standard not because it's clever, but because it makes the right thing easy and the wrong thing hard.

Without Turbine, you *can* test flows. But you'll write fragile tests that don't verify emission ordering, don't catch unconsumed events, and don't timeout properly. Turbine makes all three of these default behaviors. The strictness that initially feels annoying — "why is it failing because I didn't consume one event?" — is exactly what prevents the class of bugs where your tests pass but your UI shows the wrong state to the user.

For any project that uses Kotlin Flows, Turbine isn't optional tooling — it's the baseline for flow tests you can actually trust.

Thanks for reading!
