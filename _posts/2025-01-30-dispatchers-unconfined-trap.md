---
title: Dispatchers.Unconfined Is a Trap — Use EmptyCoroutineContext
layout: post
categories: post
tags:
  - Kotlin
  - Kotlin Coroutines
  - Testing
---

I've been injecting `Dispatchers.IO` and `Dispatchers.Main` into my classes for years. It's one of the first things you learn when someone tells you to write testable coroutine code — don't hardcode dispatchers, inject them so you can swap them out in tests. Good advice. But nobody told me what to swap them *with*, and for the longest time I defaulted to `Dispatchers.Unconfined` in tests because it sounded right. Unconfined means "don't confine to any thread," which in a test environment translates to "just run everything synchronously on the test thread." Simple and fast.

Except it has a subtle, devastating bug that will crash your app at the worst possible time. And the fix isn't a different dispatcher — it's a completely different type.

Colin White from Cash App wrote about this in January 2025, and it changed how I think about dispatchers, `CoroutineContext`, and the difference between "don't dispatch" and "don't override the dispatcher." These sound like the same thing. They are not.

## How Dispatchers.Unconfined Actually Works

To understand the bug, you need to understand what `Dispatchers.Unconfined` actually does under the hood. The implementation is surprisingly simple:

```kotlin
object Unconfined : CoroutineDispatcher() {
    override fun isDispatchNeeded(
        context: CoroutineContext
    ) = false

    override fun dispatch(
        context: CoroutineContext,
        block: Runnable,
    ) {
        throw UnsupportedOperationException(
            "Unconfined dispatcher should never dispatch"
        )
    }
}
```

Two things stand out. First, `isDispatchNeeded` always returns `false`. This tells the coroutine machinery "don't bother dispatching — just run the code on whatever thread we're currently on." Second, the `dispatch` method throws an exception because it should never be called. `Dispatchers.Unconfined` has one job: never change threads when entering its context.

This is fundamentally different from `Dispatchers.Main` or `Dispatchers.Default`. Those dispatchers have backing thread pools, and when you enter their context, they check whether you're already on one of their threads. If not, they dispatch you to the right thread. If yes, they skip the dispatch. The important part is: they also dispatch you *back* to the right thread after a suspension point.

`Dispatchers.Unconfined` doesn't do this. It opts out of the dispatch mechanism entirely. And that's where the trap is.

## The Crash Scenario

Consider a typical pattern where you read data on an IO thread and update the UI on the main thread:

```kotlin
class TransactionPresenter @Inject constructor(
    private val repository: TransactionRepository,
    private val ioDispatcher: CoroutineDispatcher,
    private val mainDispatcher: CoroutineDispatcher,
) {
    suspend fun loadTransactions(textView: TextView) {
        withContext(ioDispatcher) {
            val recent = repository.fetchRecent()
            val pending = repository.fetchPending()

            withContext(mainDispatcher) {
                textView.text = recent.summary()
                delay(300) // debounce or animation
                textView.text = pending.summary()
            }
        }
    }
}
```

In production, `ioDispatcher` is `Dispatchers.IO` and `mainDispatcher` is `Dispatchers.Main`. Everything works fine. The IO work runs on the IO pool, the UI updates run on the main thread, and after `delay()` the coroutine dispatches back to the main thread before touching the `textView`.

Now you write a test. You inject `Dispatchers.Unconfined` for both dispatchers because you want everything to run synchronously:

```kotlin
@Test
fun testLoadTransactions() = runTest {
    val presenter = TransactionPresenter(
        repository = fakeRepository,
        ioDispatcher = Dispatchers.Unconfined,
        mainDispatcher = Dispatchers.Unconfined,
    )
    presenter.loadTransactions(testTextView)

    // CalledFromWrongThreadException!
}
```

This crashes. The first `textView.text = recent.summary()` works fine because we're still on the test thread. But then `delay()` suspends the coroutine. Since `Dispatchers.Unconfined` doesn't implement the `Delay` interface, the coroutine machinery falls back to the `DefaultExecutor` — a separate daemon thread that handles timer scheduling. When the delay completes and the coroutine resumes, it needs to dispatch back to the main dispatcher. But the main dispatcher is `Dispatchers.Unconfined`, which says "don't dispatch, just run on whatever thread you're on." The coroutine resumes on the `DefaultExecutor` thread instead of the main thread. The next line touches `textView`, which throws `CalledFromWrongThreadException` because you're not on the main thread anymore.

Here's the key insight: **`Dispatchers.Unconfined` breaks one of coroutines' best features — making threading a local concern.** When you use `Dispatchers.Main`, you don't have to worry about what thread you're on after calling another `suspend fun`. The dispatcher handles the redispatch for you. `Dispatchers.Unconfined` removes that safety net entirely.

## The Fix: EmptyCoroutineContext

The solution is to stop thinking in terms of dispatchers and start thinking in terms of `CoroutineContext`. When you call `withContext(someDispatcher)`, you're updating the coroutine context's dispatcher key. `Dispatchers.Unconfined` overwrites that key with a dispatcher that never dispatches. But what if you just... didn't overwrite the key at all?

That's exactly what `EmptyCoroutineContext` does. It's an empty map. When you call `withContext(EmptyCoroutineContext)`, the coroutine context doesn't change. The existing dispatcher stays in place. The coroutine continues on whatever thread it was already on — no dispatch needed because the context hasn't changed — but crucially, if something like `delay()` moves the coroutine to a different thread, the original dispatcher can still dispatch it back.

```kotlin
@Test
fun testLoadTransactions() = runTest {
    val presenter = TransactionPresenter(
        repository = fakeRepository,
        ioDispatcher = EmptyCoroutineContext,
        mainDispatcher = EmptyCoroutineContext,
    )
    presenter.loadTransactions(testTextView)

    // No crash. Dispatches back correctly after delay().
}
```

The test runs synchronously on the test thread, `delay()` behaves correctly, and the coroutine resumes on the right thread. No crash. The behavior is what you *thought* `Dispatchers.Unconfined` was giving you.

There's a bonus here when using `runTest`. The `TestScope` that `runTest` creates uses a `StandardTestDispatcher` by default. This dispatcher implements the `Delay` interface, which means it handles `delay()` calls with virtual time — delays are skipped instantly instead of waiting. When you inject `EmptyCoroutineContext`, the `TestDispatcher` stays in place as the active dispatcher. This means your delay-skipping behavior is preserved. If you had injected `Dispatchers.Unconfined` instead, you'd be overwriting the `TestDispatcher`, losing virtual time, and `delay()` would fall back to the `DefaultExecutor` with a real wall-clock wait.

## What About UnconfinedTestDispatcher?

If you've used `kotlinx-coroutines-test`, you've probably seen `UnconfinedTestDispatcher`. The name might suggest it solves this problem, but it's solving a different one. `UnconfinedTestDispatcher` is a `TestDispatcher` that eagerly enters `launch` and `async` blocks instead of requiring you to call `advanceUntilIdle()` or `runCurrent()`. It shares the "unconfined" behavior of executing immediately on the current thread, but because it's a `TestDispatcher`, it integrates with `TestCoroutineScheduler` and supports virtual time. It still skips delays.

The key distinction is scope. `UnconfinedTestDispatcher` is designed to be the dispatcher for `runTest` itself — you pass it as `runTest(UnconfinedTestDispatcher())` to change how the test scope dispatches work. It's not meant to be injected into your production classes as a replacement for `Dispatchers.IO` or `Dispatchers.Main`. For that injection site, `EmptyCoroutineContext` is still the right answer.

## Change Your Injection Type to CoroutineContext

Here's where the insight compounds. If `EmptyCoroutineContext` is the right test replacement and it's not a `CoroutineDispatcher`, then maybe your injection sites shouldn't be typed as `CoroutineDispatcher` in the first place. Cash App injects all their dispatchers as `CoroutineContext`:

```kotlin
class PaymentPresenter @Inject constructor(
    private val paymentService: PaymentService,
    @IoDispatcher private val ioContext: CoroutineContext,
    @MainDispatcher private val mainContext: CoroutineContext,
) {
    suspend fun processPayment(amount: Long) {
        val result = withContext(ioContext) {
            paymentService.charge(amount)
        }
        withContext(mainContext) {
            updateUI(result)
        }
    }
}

// Production module
@Provides
@IoDispatcher
fun provideIoContext(): CoroutineContext = Dispatchers.IO

// Test module
@Provides
@IoDispatcher
fun provideTestIoContext(): CoroutineContext =
    EmptyCoroutineContext
```

This works because `CoroutineDispatcher` extends `CoroutineContext.Element`, which extends `CoroutineContext`. Every dispatcher is already a `CoroutineContext`. The `withContext()` function, `CoroutineScope()`, and `CoroutineContext.plus()` all accept `CoroutineContext`, not `CoroutineDispatcher`. You were using the narrower type for no reason.

Typing your injection as `CoroutineContext` instead of `CoroutineDispatcher` gives you more flexibility. You can inject `EmptyCoroutineContext` in tests. You can also inject a `CoroutineContext` that combines a dispatcher with a `CoroutineName` for debugging, or with an exception handler. The broader type accommodates all of these without changing the injection site.

Coil 3.0 adopted this approach in its public API, accepting `CoroutineContext` instead of `CoroutineDispatcher` for its decoder and fetch contexts. If a widely-used image loading library can make this change in a major version, it's a good signal that the pattern is sound.

## Why This Bug Is So Dangerous

The reason I call `Dispatchers.Unconfined` a trap and not just a bug is that it works perfectly in most test scenarios. If your code doesn't call `delay()`, or doesn't cross dispatcher boundaries in the middle of a suspend chain, or doesn't touch thread-sensitive APIs after a suspension point, you'll never see the crash. Your tests pass. Your code reviews look clean. Everything is fine.

Until someone adds a `delay()` for debouncing. Or you call a library function that internally uses `withContext(Dispatchers.Default)`. Or the Compose runtime suspends your coroutine and resumes it on a different thread. The crash appears in a test that was previously passing, in code that you didn't change, and the stack trace points to a line that looks completely innocent.

The tradeoff of switching to `EmptyCoroutineContext` is minimal. You lose the explicit declaration that your test is using an "unconfined" dispatcher, and some developers find `EmptyCoroutineContext` less self-documenting than `Dispatchers.Unconfined`. Fair point. But I'll take a slightly less descriptive type name over a latent `CalledFromWrongThreadException` any day.

There are still legitimate uses for `Dispatchers.Unconfined` — specifically in scenarios where you genuinely want to opt out of dispatching entirely and you understand that the coroutine may resume on arbitrary threads. Event-processing loops and certain reactive patterns sometimes use it intentionally. But in the common case of "I want my test to run synchronously," `EmptyCoroutineContext` is the correct tool.

## The Broader Lesson

The reframe here goes beyond just dispatchers. It's about precision in types. `CoroutineDispatcher` says "I will manage which thread this code runs on." `CoroutineContext` says "here's some context for this coroutine — maybe a dispatcher, maybe other things, maybe nothing." When you inject a `CoroutineDispatcher`, you're promising that you'll always have a dispatcher to provide. When you inject a `CoroutineContext`, you leave room for "no change needed" — which is exactly what tests want.

This pattern applies more broadly than just dispatchers. Anytime you find yourself injecting a narrow type and then struggling to provide a reasonable test double, ask whether the broader supertype would work. If your production code only uses the capabilities of the broader type, you're over-constraining yourself for no benefit.

Go audit your dispatcher injection sites. Replace `CoroutineDispatcher` with `CoroutineContext`. Replace `Dispatchers.Unconfined` with `EmptyCoroutineContext` in your test modules. It's a small change in your DI setup that eliminates an entire category of threading bugs in your test suite. And once you make the switch, you stop worrying about threads resuming in unexpected places — which is how coroutines were supposed to work in the first place.

Thank You!
