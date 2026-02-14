---
title: The Conflation Problem of Testing StateFlows
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Testing
---

A few months ago, I was writing a test for a ViewModel that managed a loading screen. The logic was simple — set loading to true, fetch data, set loading to false, update the list. Three state changes. My test collected the StateFlow and asserted the sequence: loading, loaded with data, done. It failed. Not sometimes — consistently. The test only ever saw the final state.

I spent a good hour debugging before I realized the problem wasn't my test, my ViewModel, or my coroutine setup. The problem was StateFlow itself. StateFlow conflates values by design. If you emit three values before a collector resumes, it only sees the last one. And that behavior, which is totally correct for UI rendering, completely breaks a certain style of testing. ZSMB wrote about this specific problem and it resonated with me because I had hit the exact same wall. Once I understood what conflation actually means at the implementation level, it changed how I think about StateFlow, SharedFlow, and which one to reach for.

## What Conflation Actually Means

Conflation is a fancy word for "dropping intermediate values." When you set `StateFlow.value` three times in rapid succession, the internal implementation doesn't queue those values. It overwrites. StateFlow has a single backing field — `_state` — and every `.value =` assignment is an atomic write to that field. There's no buffer, no queue, no history. Just the latest value.

Here's the thing — this is intentional. StateFlow is modeled as a **state holder**, not an event stream. The Kotlin documentation is explicit about this: "StateFlow is a state-holder observable flow that emits the current and new state updates to its collectors." The keyword is "current." It represents what the state **is right now**, not the history of what it was. For UI rendering, this is exactly right. Your screen doesn't need to render every intermediate loading state — it just needs the latest one. If the state went from `Loading` to `Success` in 2 milliseconds, the user never saw loading anyway.

But tests are different. Tests often want to verify the **sequence** of state transitions, not just the final state. And that's where the conflict appears.

## The Test That Always Fails

Let me show you the exact problem. Here's a typical ViewModel that fetches a user profile:

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

Now you write a naive test:

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

This test fails because `states` only contains `[Idle, Loaded(user)]`. The `Loading` state was set and then immediately overwritten by `Loaded` before the collector's coroutine got a chance to resume and process it. The collector was suspended at `collect`, and by the time `advanceUntilIdle()` dispatches everything, the StateFlow's value has already moved past Loading.

## Why This Happens Under the Hood

To understand why, you need to know how StateFlow's emission and collection work internally. When you set `StateFlow.value`, it atomically updates the backing field and then tries to resume any suspended collectors. But "tries to resume" doesn't mean "immediately runs the collector's code." In a coroutine test with `StandardTestDispatcher` (the default for `runTest`), dispatching is controlled — coroutines don't run until you call `advanceUntilIdle()` or `advanceTimeBy()`.

So the sequence is: `_uiState.value = Loading` writes the value and schedules the collector to resume. But before the test dispatcher processes that resumption, the next line executes — `userRepository.getUser()` returns (because your fake is synchronous), and `_uiState.value = Loaded(user)` overwrites Loading with Loaded. Now when the collector finally resumes, it reads the current value, which is already Loaded. Loading was set and overwritten within a single dispatch frame. The collector never saw it.

This is the same reason your UI works fine — Compose reads `StateFlow.value` on each recomposition, so it always sees the latest state. But a `collect` call that expects to observe every intermediate emission gets burned by conflation.

## The Turbine Solution

Turbine, built by Cash App, is the standard library for testing Flows in Kotlin. Its `test {}` DSL gives you fine-grained control over emissions with `awaitItem()`, `awaitError()`, and `expectNoEvents()`. But even Turbine can't magically observe values that StateFlow conflated away — because they were never emitted to any collector. What Turbine does is make the timing explicit so you can structure your test correctly.

Here's the same test with Turbine:

```kotlin
@Test
fun `loading profile shows loading then loaded`() = runTest {
    val viewModel = ProfileViewModel(FakeUserRepository())

    viewModel.uiState.test {
        assertEquals(ProfileState.Idle, awaitItem())

        viewModel.loadProfile("user-123")

        assertEquals(ProfileState.Loading, awaitItem())
        assertEquals(ProfileState.Loaded(fakeUser), awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

The critical difference is that Turbine's `test {}` starts collecting **before** the action, and `awaitItem()` suspends until the next emission arrives. But this alone doesn't fix the conflation issue — you still need the collector to actually be dispatched between the Loading and Loaded emissions.

The real fix is using `UnconfinedTestDispatcher` for the ViewModel's scope. With `UnconfinedTestDispatcher`, coroutines execute eagerly — so when `_uiState.value = Loading` is set, the collector runs immediately (before the next line of the ViewModel executes). This means the collector sees Loading before the ViewModel has a chance to overwrite it with Loaded.

```kotlin
@Test
fun `loading profile shows loading then loaded`() = runTest(UnconfinedTestDispatcher()) {
    val viewModel = ProfileViewModel(FakeUserRepository())

    viewModel.uiState.test {
        assertEquals(ProfileState.Idle, awaitItem())

        viewModel.loadProfile("user-123")

        assertEquals(ProfileState.Loading, awaitItem())
        assertEquals(ProfileState.Loaded(fakeUser), awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

With `UnconfinedTestDispatcher`, each `StateFlow.value` assignment triggers the collector inline — no scheduling delay, no conflation window. The collector processes Loading before Loaded is ever set.

## The Deeper Insight — StateFlow Is Not an Event Stream

Here's the reframe that changed how I approach this: **StateFlow was never designed to deliver every value.** It's a state holder. If you need every emission to be observed, you're using the wrong tool. This isn't a bug — it's a design decision that reflects a real distinction between state and events.

Think about it this way. Your screen has a state — it's either loading, showing data, or showing an error. At any given moment, there's exactly one correct state. You don't need the history of states — you need the current one. That's StateFlow. But a "show toast" command, a navigation event, or a snackbar trigger is different. If you fire two toast events in quick succession, the user expects to see both. Conflating those away would be a bug.

This distinction maps directly to the three Kotlin primitives. **StateFlow** is for state — latest value matters, conflation is correct. The `value` property gives you the current state synchronously, and new collectors immediately get the current value. **SharedFlow** is for events where every emission matters — it has a configurable buffer and replay cache, and it doesn't conflate. If you emit A, B, C to a SharedFlow, every active collector sees all three. **Channel** is for one-time events where exactly one consumer should process each event — like navigation commands or one-shot error dialogs.

I've seen codebases that use StateFlow for everything — state, events, navigation commands. It works until it doesn't. The tests start flaking because events get conflated. Users report missing toast messages. Navigation sometimes doesn't trigger. The root cause is always the same: treating a state holder as an event stream.

## When to Use Which

**Use StateFlow when** the consumer only cares about the latest value. UI state is the obvious case — loading indicators, form data, list contents. If the state changes from A to B to C while the UI is in the background, it should only render C when it comes back. StateFlow handles this naturally with `collectAsStateWithLifecycle()`.

**Use SharedFlow when** every emission carries meaning and dropping one would be a bug. Analytics events, log streams, or any case where you're modeling a sequence of occurrences rather than a current state. Configure `replay` and `extraBufferCapacity` based on how many emissions you can afford to buffer before a slow collector catches up.

**Use Channel when** you need single-delivery semantics — one consumer processes each event exactly once. Navigation commands, one-shot error dialogs, or any "fire and forget" side effect where multiple consumers would cause duplicate behavior. Channels with `Channel.BUFFERED` or `Channel.UNLIMITED` prevent lost events when the consumer is briefly suspended.

## Testing Strategy Going Forward

After hitting the conflation wall enough times, I settled on a testing approach that avoids the problem entirely. For ViewModel state tests, I use `UnconfinedTestDispatcher` plus Turbine. This ensures the collector runs eagerly and sees every state transition. For event-style emissions, I use SharedFlow or Channel in the ViewModel and test them with Turbine's `awaitItem()` without needing the unconfined dispatcher trick — because SharedFlow doesn't conflate.

The broader lesson is that your test infrastructure should match your data flow semantics. If you're testing state, test the latest value and maybe one or two transitions. If you're testing events, test every emission. Don't fight StateFlow's conflation — understand it, and pick the right tool for the right job.

IMO, the Kotlin coroutines team made the right call with conflation. A state holder should represent current state, not maintain a changelog. The confusion only arises because the word "Flow" in StateFlow makes people think of it as a stream. It's not. It's a reactive variable that happens to support collection.

Thank You!
