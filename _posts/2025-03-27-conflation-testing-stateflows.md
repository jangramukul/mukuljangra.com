---
title: The Conflation Problem of Testing StateFlows
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Testing
---

A few months ago, I was writing a test for a ViewModel that managed a loading screen. The logic was simple — set loading to true, fetch data, set loading to false, update the list. Three state changes. My test collected the StateFlow and asserted the sequence: loading, loaded with data, done.

It failed. Not sometimes — consistently. The test only ever saw the final state.

I spent a good hour debugging before I realized the problem wasn't my test, my ViewModel, or my coroutine setup. The problem was StateFlow itself. Think of StateFlow like a whiteboard in a meeting room. You write "Loading..." on it, then immediately erase it and write "Done!" — anyone who walks in only sees "Done!" The intermediate message is gone forever. That's conflation. StateFlow overwrites values by design. If you emit three values before a collector resumes, it only sees the last one. That behavior is totally correct for UI rendering, but it completely breaks a certain style of testing.

[ZSMB wrote about this specific problem](https://zsmb.co/conflating-stateflows/) and it resonated with me because I had hit the exact same wall. Once I understood what conflation actually means at the implementation level, it changed how I think about testing state transitions.

## What Conflation Actually Means

Conflation is a fancy word for "dropping intermediate values." When you set `StateFlow.value` three times in rapid succession, the internal implementation doesn't queue those values. It overwrites. StateFlow has a single backing field — `_state` — and every `.value =` assignment is an atomic write to that field. There's no buffer, no queue, no history. Just the latest value.

Here's the thing — this is intentional. StateFlow is modeled as a **state holder**, not an event stream. The [Kotlin documentation](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines.flow/-state-flow/) is explicit: "Updates to the value are always conflated. So a slow collector skips fast updates, but always collects the most recently emitted value." It represents what the state **is right now**, not the history of what it was. For UI rendering, this is exactly right. Your screen doesn't need to render every intermediate loading state — it just needs the latest one. If the state went from `Loading` to `Success` in 2 milliseconds, the user never saw loading anyway.

### How Equality-Based Conflation Works

StateFlow uses **strong equality-based conflation**. When you assign a new value, it compares the incoming value with the current one using `Any.equals()`. If they're equal, the assignment is effectively a no-op — no collector gets notified, nothing happens. This is the same behavior as the `distinctUntilChanged` operator, but baked into StateFlow at the implementation level. The official docs even describe StateFlow as equivalent to a `MutableSharedFlow` with `replay = 1`, `onBufferOverflow = DROP_OLDEST`, and `distinctUntilChanged` applied on top.

This has practical consequences that can trip you up. If your state is a data class and you emit two instances with identical fields, the second emission is silently dropped. If your `equals()` implementation is broken — say it always returns true — your StateFlow will never notify collectors of any change. The Kotlin docs explicitly state that "State flow behavior with classes that violate the contract for `Any.equals` is unspecified."

But there's a subtler point that matters for testing. Because there's only a single backing field with no buffer, setting the value three times in a tight loop means each write overwrites the previous one atomically. Even if the values are all different, a collector that isn't fast enough to run between those writes will only see the last one. The intermediate values existed for a moment, then disappeared — like a text message you type and delete before hitting send.

## The Test That Always Fails

Here's where it gets real. Imagine you're writing a ProfileViewModel — dead simple, the kind you've written a hundred times:

```kotlin
class ProfileViewModel(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProfileState>(ProfileState.Idle)
    val uiState: StateFlow<ProfileState> = _uiState.asStateFlow()

    fun loadProfile(userId: String) {
        viewModelScope.launch {
            _uiState.value = ProfileState.Loading
            val result = userRepository.getUser(userId)
            _uiState.value = when {
                result.isSuccess -> ProfileState.Loaded(result.getOrThrow())
                else -> ProfileState.Error("Failed to load profile")
            }
        }
    }
}
```

Now you write what feels like a perfectly reasonable test:

```kotlin
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
    assertEquals(ProfileState.Loading, states[1])     // fails
    assertEquals(ProfileState.Loaded(fakeUser), states[2]) // never reached
}
```

Red. Every single time.

This test fails because `states` only contains `[Idle, Loaded(user)]`. The `Loading` state was set and then immediately overwritten before the collector ever ran. The collector was suspended at `collect`, and by the time `advanceUntilIdle()` dispatches everything, the StateFlow's value has already moved past Loading.

### Why This Happens Under the Hood

The reason comes down to how `StandardTestDispatcher` works — and it's the default dispatcher for `runTest`. When you set `StateFlow.value`, it atomically updates the backing field and then tries to resume any suspended collectors. But "tries to resume" doesn't mean "immediately runs the collector's code." `StandardTestDispatcher` queues all tasks on the test scheduler and only executes them when you explicitly call `advanceUntilIdle()`, `runCurrent()`, or `advanceTimeBy()`. It never runs anything on its own.

So the sequence plays out like this: `_uiState.value = Loading` writes the value and schedules the collector to resume. But before the test scheduler processes that resumption, the next line of the ViewModel executes — `userRepository.getUser()` returns synchronously (because your fake is in-memory), and `_uiState.value = Loaded(user)` overwrites Loading with Loaded. Now when the collector finally gets its turn, it reads the current value, which is already Loaded. Loading was set and overwritten within a single dispatch frame. The collector never saw it.

Picture a lazy mailman (that's `StandardTestDispatcher`). You put a letter in the mailbox. Before the mailman picks it up, you replace it with a different letter. The mailman eventually comes by and delivers only the second letter. The first one? Gone.

This is the same reason your UI works fine — Compose reads `StateFlow.value` on each recomposition, so it always sees the latest state. But a `collect` call that expects to observe every intermediate emission gets burned by conflation.

> **🧠 Think about it:** If `StandardTestDispatcher` is the lazy mailman who only delivers when you tell it to, what kind of dispatcher would you need to catch every letter the moment it's dropped in the box?

## `UnconfinedTestDispatcher` vs `StandardTestDispatcher`

Understanding these two dispatchers is the key to controlling conflation in tests. They're both `TestDispatcher` implementations that skip delays, but they have fundamentally different scheduling behavior.

**`StandardTestDispatcher`** is the lazy one. When a coroutine is launched on it, the coroutine body doesn't execute immediately. Instead, it's queued on the test scheduler and only runs when you explicitly call `advanceUntilIdle()` or `runCurrent()`. This gives you precise control over execution order, but it means rapidly emitted StateFlow values can pile up and conflate before any collector runs.

**`UnconfinedTestDispatcher`** is the eager one. Coroutines launched on it enter their body immediately — the `launch` call doesn't return until the coroutine hits its first suspension point. This is similar to `Dispatchers.Unconfined` in production code. When StateFlow resumes a collector on `UnconfinedTestDispatcher`, the collector processes the value inline, right there, before the next line of the producing code executes.

The practical difference is this: with `StandardTestDispatcher`, the producing and collecting coroutines take turns at the scheduler's discretion. With `UnconfinedTestDispatcher` on the collector, the collector runs **immediately** when a new value is set — no scheduling delay, no window for conflation.

But here's the critical nuance that ZSMB highlighted and I think is worth repeating: **the collector must be on `UnconfinedTestDispatcher` while the producer stays on `StandardTestDispatcher`.** If both are unconfined, the producer's value assignments happen without yielding, and you're back to conflation. The collector can only be "faster" than the producer if there's a dispatch boundary in the producer's execution path. `StandardTestDispatcher` provides that boundary — each value write schedules a resumption, giving the unconfined collector a chance to intercept.

```kotlin
@Test
fun conflationReturnsWhenBothUnconfined() = runTest {
    val stateFlow = MutableStateFlow(0)

    launch(UnconfinedTestDispatcher(testScheduler)) {
        val values = stateFlow.take(2).toList()
        assertEquals(listOf(0, 3), values) // conflation happened
    }

    launch(UnconfinedTestDispatcher(testScheduler)) {
        stateFlow.value = 1
        stateFlow.value = 2
        stateFlow.value = 3
    }
}
```

When I first learned this, I assumed "just use `UnconfinedTestDispatcher` everywhere" was the answer. It's not. You need the asymmetry — an eager collector watching a lazy producer — to observe every intermediate state. Think of it like a speed camera and a car. The camera (collector) needs to be always-on and instant (unconfined) to catch the car (producer) at every point. But if the car is also instant (unconfined), it teleports past the camera and you only get one blurry photo at the end.

> **💡 The "aha" moment:** The trick to beating conflation isn't making everything fast — it's making the collector fast and the producer slow. You need asymmetry, not uniformity.

## The `MainDispatcherRule` Setup

In real Android code, ViewModels use `viewModelScope`, which dispatches on `Dispatchers.Main`. Since there's no Android main looper in unit tests, you need to replace `Dispatchers.Main` with a test dispatcher. The standard approach is a JUnit `TestWatcher` rule:

```kotlin
class MainDispatcherRule(
    private val testDispatcher: TestDispatcher = UnconfinedTestDispatcher(),
) : TestWatcher() {

    override fun starting(description: Description) {
        Dispatchers.setMain(testDispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}
```

By defaulting to `UnconfinedTestDispatcher`, this rule ensures that coroutines launched on `Dispatchers.Main` — including everything inside `viewModelScope` — execute eagerly. But here's where it gets interesting for conflation. If you use `UnconfinedTestDispatcher` as your Main dispatcher, the ViewModel's `viewModelScope.launch` block runs its body immediately and inline. The value writes happen without dispatch boundaries, meaning `Loading` and `Loaded` are set back-to-back without any chance for a collector to intercept.

Wait — so the default actually *causes* conflation?

Yep. IMO, the better pattern for testing state transitions is to use `StandardTestDispatcher` in the rule instead, which makes the ViewModel's coroutines lazy and creates the dispatch boundaries you need:

```kotlin
@get:Rule
val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())
```

With this setup, the ViewModel's `viewModelScope.launch` block is queued rather than executed immediately. Combined with Turbine (which collects on `UnconfinedTestDispatcher` internally), you get the asymmetry needed to observe every intermediate state. Lazy producer, eager collector — exactly the pattern we need.

## Testing With Turbine

Turbine, built by the Cash App team, is the standard library for testing Flows in Kotlin. Its `test {}` DSL gives you `awaitItem()`, `awaitError()`, and `expectNoEvents()` for fine-grained control over emissions. The important implementation detail is that **Turbine's `test` function uses `UnconfinedTestDispatcher` under the hood** when running inside `runTest`. This means Turbine's collector is already "fast" — it processes emissions eagerly without needing an explicit dispatch.

One thing that catches people off guard: the first `awaitItem()` call on a StateFlow always returns the **initial value**. You need to consume that initial emission before you trigger any action, or your assertion order will be off. It's like sitting down in a movie theater — you have to sit through the studio logo before the actual movie starts.

```kotlin
@Test
fun `loading profile shows loading then loaded`() = runTest {
    val viewModel = ProfileViewModel(FakeUserRepository())

    viewModel.uiState.test {
        assertEquals(ProfileState.Idle, awaitItem()) // initial value

        viewModel.loadProfile("user-123")

        assertEquals(ProfileState.Loading, awaitItem())
        assertEquals(ProfileState.Loaded(fakeUser), awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

`cancelAndIgnoreRemainingEvents()` is necessary because StateFlow never completes — without it, the test would hang waiting for more emissions or Turbine would fail complaining about unconsumed events.

This test works when the ViewModel's `viewModelScope` uses `StandardTestDispatcher` (the lazy one). Turbine's internal `UnconfinedTestDispatcher` collects eagerly, so each `.value =` assignment in the ViewModel immediately delivers the value to Turbine before the next line of ViewModel code executes. That's the asymmetry at work — the same pattern we've been building towards this entire post.

## Real-World Testing Patterns

### Testing Loading → Success

The loading-to-success flow is the most common case where conflation bites you. The pattern is straightforward once you have the right dispatcher setup:

```kotlin
@get:Rule
val mainDispatcherRule = MainDispatcherRule(StandardTestDispatcher())

@Test
fun `search returns results after loading`() = runTest {
    val repository = FakeSearchRepository(
        results = listOf(SearchResult("Kotlin Coroutines"))
    )
    val viewModel = SearchViewModel(repository)

    viewModel.uiState.test {
        assertEquals(SearchState.Idle, awaitItem())

        viewModel.search("coroutines")

        assertEquals(SearchState.Loading, awaitItem())
        assertEquals(
            SearchState.Results(listOf(SearchResult("Kotlin Coroutines"))),
            awaitItem()
        )
        cancelAndIgnoreRemainingEvents()
    }
}
```

### Testing Error Recovery

Error recovery tests verify that the state transitions correctly from error back to success. The key insight is that you might trigger `loadProfile` twice — once to fail, once to succeed — and you need to assert the full sequence across both attempts:

```kotlin
@Test
fun `retry after error shows loading then success`() = runTest {
    val repository = FakeUserRepository()
    val viewModel = ProfileViewModel(repository)

    viewModel.uiState.test {
        assertEquals(ProfileState.Idle, awaitItem())

        repository.shouldFail = true
        viewModel.loadProfile("user-123")

        assertEquals(ProfileState.Loading, awaitItem())
        assertEquals(ProfileState.Error("Failed to load profile"), awaitItem())

        repository.shouldFail = false
        viewModel.loadProfile("user-123")

        assertEquals(ProfileState.Loading, awaitItem())
        assertEquals(ProfileState.Loaded(fakeUser), awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

### Testing Debounced Search

Debounced search is trickier because it involves `delay()`. Since `TestDispatcher` skips delays, you use `advanceTimeBy()` to simulate the debounce window. Here the `StandardTestDispatcher` Main rule actually works in your favor — you can advance virtual time precisely:

```kotlin
@Test
fun `debounced search waits before executing`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())

    viewModel.uiState.test {
        assertEquals(SearchState.Idle, awaitItem())

        viewModel.onQueryChanged("kot")
        viewModel.onQueryChanged("kotl")
        viewModel.onQueryChanged("kotlin")

        advanceTimeBy(300) // debounce window
        runCurrent()

        // only the final query triggers a search
        assertEquals(SearchState.Loading, awaitItem())
        assertEquals(
            SearchState.Results(listOf(SearchResult("Kotlin"))),
            awaitItem()
        )
        cancelAndIgnoreRemainingEvents()
    }
}
```

The intermediate queries ("kot", "kotl") never trigger a search because each new keystroke resets the debounce timer. Only "kotlin" survives the 300ms window. It's like an elevator that keeps resetting its door-close timer every time someone walks up. It only actually closes when everyone stops arriving.

> **⚡ Quick check:** If you used `UnconfinedTestDispatcher` for both the Main dispatcher rule and Turbine's collector in the debounce test above, would the test still work? Why or why not?

## The Reframe — StateFlow Is a Reactive Variable, Not a Stream

Here's the insight that changed how I approach all of this: **StateFlow was never designed to deliver every value.** The word "Flow" in the name makes people think of it as a stream — like a river where every drop of water passes through. It's not. It's more like a scoreboard. A scoreboard shows the current score. Nobody cares that it briefly showed 2-1 before updating to 3-1. You glance at it and see the latest number. That's StateFlow.

The official docs even describe it as equivalent to a `SharedFlow` with `replay = 1` and `DROP_OLDEST` overflow — which is just a fancy way of saying "always holds exactly one value, the latest one."

Once I internalized this, the testing strategy became obvious. If I need to verify state transitions, I set up the right dispatcher asymmetry and use Turbine. If I just need to check the final state after an action, I read `StateFlow.value` directly — no collection, no conflation concern, no dispatcher tricks needed. And if I need every emission guaranteed, I reach for `SharedFlow` instead of fighting StateFlow's design.

> **🔥 Real talk:** I've seen codebases that use StateFlow for everything — state, events, navigation commands. It works until it doesn't. The tests start flaking because events get conflated. Users report missing toast messages. The root cause is always the same: treating a state holder as an event stream.

IMO, the Kotlin coroutines team made the right call with conflation. A state holder should represent current state, not maintain a changelog. The test tooling — Turbine, `UnconfinedTestDispatcher`, the dispatcher rule pattern — exists specifically because the team recognized that testing state transitions requires seeing intermediate values that production code doesn't need. The trick isn't fighting conflation. It's understanding when it matters and setting up your test infrastructure accordingly.

Thank You!
