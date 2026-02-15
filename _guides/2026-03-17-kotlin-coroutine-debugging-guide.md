---
title: Kotlin Coroutine Debugging Guide
layout: post
sequence: 111
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Debugging coroutines is genuinely harder than debugging regular code. I spent an embarrassing amount of time early on setting breakpoints in suspend functions only to have them fire on random worker threads, staring at stack traces that showed nothing but `invokeSuspend` and `DispatchedTask.run`, and watching exceptions surface in places that had nothing to do with where the actual bug lived. The normal debugging instincts — set a breakpoint, read the stack trace, follow the call chain — don't work the same way once your execution hops between threads and gets sliced into state machine continuations.

The good news is that the Kotlin team built several tools specifically for this problem. Debug mode, coroutine names, stack trace recovery, the IntelliJ coroutine debugger, and structured logging with coroutine context. None of them are silver bullets, but together they make coroutine debugging manageable instead of maddening. This guide covers each one, when to use it, and how to combine them in a real project.

## CoroutineName

The simplest debugging improvement you can make is naming your coroutines. By default, every coroutine gets an auto-generated label like `coroutine#14`, which is useless when you have thirty coroutines running concurrently and your logs are an interleaved mess. `CoroutineName` is a coroutine context element that attaches a meaningful, human-readable label to a coroutine. When debug mode is active, that name shows up in the thread name, which means it appears in every log line, every stack trace, and every debugger view.

```kotlin
class OrderViewModel(
    private val orderRepository: OrderRepository
) : ViewModel() {

    fun loadOrder(orderId: String) {
        viewModelScope.launch(CoroutineName("loadOrder-$orderId")) {
            val details = orderRepository.fetchOrderDetails(orderId)
            _uiState.value = OrderUiState.Success(details)
        }
    }

    fun refreshOrders() {
        viewModelScope.launch(CoroutineName("refreshOrders")) {
            val orders = orderRepository.fetchAll()
            _ordersState.value = orders
        }
    }
}
```

With debug mode on, your logcat changes from `DefaultDispatcher-worker-3` to `DefaultDispatcher-worker-3 @loadOrder-ORD-4521`. You immediately know which user action triggered this coroutine and which entity it was processing. I follow the pattern `functionName-identifier` — the function that launched the coroutine plus whatever business key matters for tracing. For repository-level coroutines that run on behalf of multiple callers, this naming convention has saved me hours of root-cause investigation.

The name isn't just for logs. You can access it programmatically from the coroutine context via `coroutineContext[CoroutineName]?.name`, which means you can include it in structured logs, Crashlytics custom keys, or analytics events. I think `CoroutineName` is one of the most underused coroutine APIs — zero overhead in production, enormous debugging value.

## Debug Mode

Debug mode is the foundation that makes `CoroutineName` and several other debugging features actually visible. You enable it with the JVM system property `-Dkotlinx.coroutines.debug` or by setting the `KOTLINX_COROUTINES_DEBUG` environment variable. On Android, the cleanest approach is setting it in your `Application.onCreate()` for debug builds:

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            System.setProperty("kotlinx.coroutines.debug", "")
        }
    }
}
```

When debug mode is active, every coroutine gets a unique sequential ID appended to the thread name. Instead of seeing `DefaultDispatcher-worker-3` in logcat, you see `DefaultDispatcher-worker-3 @coroutine#7` — or `@refreshOrders#7` if you used `CoroutineName`. This ID is unique per coroutine, so you can grep your logs for `@coroutine#7` and see every line that ran inside that specific coroutine, even if it hopped between IO and Main dispatchers.

Debug mode also enables stack trace recovery (covered in the next section), which stitches together the async call chain that the JVM normally loses. These two features combined — named threads and recovered stack traces — transform coroutine debugging from guesswork into something approaching the clarity of synchronous code.

The tradeoff is performance. Debug mode instruments every coroutine creation and suspension point to track metadata that's normally discarded. In my experience the overhead is small enough to be invisible in development, but I treat it like `StrictMode` — always on in debug builds, never in production. One important note for release builds: if you're using R8 1.6.0 or later, both debug mode and stack trace recovery are permanently stripped from optimized builds regardless of system property settings. This is a good thing — it means you don't need to worry about accidentally shipping debug instrumentation.

## Coroutine Debugger in IntelliJ/Android Studio

IntelliJ IDEA and Android Studio include a built-in coroutine debugger that goes beyond what log-based debugging can provide. When you hit a breakpoint inside a coroutine, open the Debug tool window and look for the **Coroutines** tab alongside the usual Frames and Variables tabs. This panel shows every coroutine in your application — running, suspended, or created but not yet started — along with its state, its dispatcher, and its current stack trace.

This is genuinely useful in ways that regular breakpoint debugging is not. With synchronous code, when you hit a breakpoint you see the current thread's state and that's enough. With coroutines, the interesting question is usually "what are the *other* coroutines doing right now?" — and the Coroutines tab answers that. You can see that coroutine #3 is suspended at a `delay()` call, coroutine #5 is waiting for a network response, and coroutine #8 is about to write to the database. If you're debugging a race condition or a deadlock, this overview is invaluable.

Step-through debugging works with coroutines, but there's a catch. When you step over a `suspend` call that actually suspends, the debugger jumps to wherever the coroutine resumes — which might be on a completely different thread. This is correct behavior, but it's disorienting the first few times. The debugger follows the coroutine, not the thread. If you need to follow what a specific thread is doing instead, use the Frames tab and select the thread explicitly.

One practical annoyance: when debugging suspend functions, you'll sometimes see variables marked as "was optimized out" in the Variables panel. This happens because the Kotlin compiler's CPS transformation can shorten variable lifetimes — a local variable might be consumed by the state machine before the debugger expects to read it. The fix is adding `-Xdebug` to your Kotlin compiler options in `build.gradle.kts`:

```kotlin
tasks.withType<KotlinCompile> {
    compilerOptions {
        freeCompilerArgs.add("-Xdebug")
    }
}
```

This disables certain compiler optimizations that break debugger visibility. Don't ship it in release builds — it's strictly a development convenience.

## Stack Trace Recovery

By default, coroutine stack traces are nearly useless for debugging. When a coroutine suspends and resumes on a different thread, the JVM's stack trace mechanism captures only the frames from the resume point — the original call chain that launched the coroutine is gone. You see `invokeSuspend`, `BaseContinuationImpl.resumeWith`, `DispatchedTask.run`, and a handful of thread pool internals. No ViewModel, no Fragment, no user action — nothing useful.

Stack trace recovery is the kotlinx.coroutines feature that fixes this. It's enabled automatically when debug mode is active, or you can control it independently with the `kotlinx.coroutines.stacktrace.recovery` system property. When an exception crosses a coroutine boundary — through `withContext`, `Deferred.await`, or `coroutineScope` — the recovery machinery creates a copy of the exception and stitches the async frames together.

Without recovery, a crash inside a repository call looks like this:

```
retrofit2.HttpException: HTTP 500
    at OrderRepository$fetchOrder$2.invokeSuspend(OrderRepository.kt:14)
    at BaseContinuationImpl.resumeWith(ContinuationImpl.kt:33)
    at DispatchedTask.run(DispatchedTask.kt:106)
    at ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1167)
    at Thread.run(Thread.java:920)
```

With stack trace recovery enabled, that same crash produces:

```
retrofit2.HttpException: HTTP 500
    at OrderRepository$fetchOrder$2.invokeSuspend(OrderRepository.kt:14)
Caused by: retrofit2.HttpException: HTTP 500
    at OrderRepository$fetchOrder$2.invokeSuspend(OrderRepository.kt:14)
    (Coroutine boundary)
    at OrderViewModel$loadOrder$1.invokeSuspend(OrderViewModel.kt:22)
```

Now you can see that `OrderViewModel.loadOrder` at line 22 was the call site. The `(Coroutine boundary)` marker shows where the async hop happened. This is the difference between a fifteen-minute debugging session and a three-second glance.

Under the hood, the recovery machinery works by copying the original exception (using reflection to invoke the exception's constructor) and rewriting the copy's stack trace with the coroutine-related frames stitched in. The original exception becomes the cause of the copy. There's one subtle downside: you lose referential transparency. The exception you catch is not the same object that was thrown — it's a copy. If your error-handling logic does identity checks on exceptions (using `===`), stack trace recovery can break it. In practice, I've never seen this matter in a real codebase, but it's worth knowing.

## Logging and Tracing

Tools like debug mode and stack trace recovery help during development, but in production you need a different approach. You can't attach a debugger to a user's phone. Instead, you need structured logging that captures enough coroutine context to reconstruct the execution path from logs alone.

The core idea is a logging interceptor that automatically includes coroutine information in every log line. The `CoroutineName`, the current dispatcher, and the operation being performed give you a trace that's almost as good as a stack trace — and it works in production without debug mode overhead.

```kotlin
suspend fun <T> tracedOperation(
    operationName: String,
    block: suspend () -> T
): T {
    val coroutineName = coroutineContext[CoroutineName]?.name ?: "unnamed"
    val dispatcher = coroutineContext[ContinuationInterceptor]
        ?.let { it::class.simpleName } ?: "unknown"
    
    Timber.d("[$coroutineName/$dispatcher] Starting $operationName")
    val startTime = System.currentTimeMillis()
    return try {
        block().also {
            val elapsed = System.currentTimeMillis() - startTime
            Timber.d("[$coroutineName/$dispatcher] $operationName completed in ${elapsed}ms")
        }
    } catch (e: Exception) {
        val elapsed = System.currentTimeMillis() - startTime
        Timber.e(e, "[$coroutineName/$dispatcher] $operationName failed after ${elapsed}ms")
        throw e
    }
}
```

For backend or multi-platform code, SLF4J's MDC (Mapped Diagnostic Context) integrates with coroutines through `kotlinx-coroutines-slf4j`. MDC stores key-value pairs per thread, but coroutines hop between threads — so the standard MDC loses context at every suspension point. The `MDCContext` element from the `kotlinx-coroutines-slf4j` module solves this by copying MDC values into the coroutine context and restoring them on each resumption:

```kotlin
import kotlinx.coroutines.slf4j.MDCContext
import org.slf4j.MDC

suspend fun processOrder(orderId: String) {
    MDC.put("orderId", orderId)
    MDC.put("operation", "processOrder")

    withContext(MDCContext()) {
        // MDC values are preserved across suspension points
        logger.info("Validating order")  // logs include orderId, operation
        val result = validateAndCharge(orderId)
        logger.info("Order processed: ${result.status}")
    }
}
```

Without `MDCContext`, the MDC values would vanish the moment the coroutine resumed on a different thread — your log lines after the first suspension point would be missing all context. With `MDCContext`, the values travel with the coroutine. This is essential for any server-side Kotlin application using structured logging frameworks like Logback or Log4j2.

On Android specifically, where SLF4J and MDC aren't common, I prefer the `tracedOperation` wrapper approach combined with Crashlytics custom keys. At the start of every significant coroutine — checkout flows, sync operations, background uploads — I set Crashlytics custom keys with the coroutine name, operation, and relevant business identifiers. When a crash report comes in, the keys tell me exactly what the user was doing, which coroutine was running, and what dispatcher it was on. That's usually enough context to reproduce the issue without needing the stack trace at all.

## Quiz

**Q1: What system property enables debug mode for Kotlin coroutines, and what does it add to thread names?**

**Wrong**: Setting `-Dkotlinx.coroutines.debug` enables verbose logging to stderr for all coroutine operations.

**Correct**: Setting `-Dkotlinx.coroutines.debug` (or the `KOTLINX_COROUTINES_DEBUG` environment variable) enables debug mode, which appends a unique coroutine ID and name to the thread name. Thread names change from `DefaultDispatcher-worker-3` to `DefaultDispatcher-worker-3 @coroutine#7` (or `@yourCoroutineName#7` if you used `CoroutineName`). This also enables stack trace recovery.

**Q2: Why does stack trace recovery create a *copy* of the exception rather than modifying the original?**

**Wrong**: The original exception is immutable and its stack trace cannot be changed once created.

**Correct**: The original exception's stack trace can technically be modified with `setStackTrace()`, but creating a copy preserves the original exception as the `cause` — so both the recovered trace (with coroutine boundary frames) and the original trace are available. The tradeoff is losing referential transparency: the caught exception is a different object than the thrown one, which can break identity checks using `===`.

## Coding Challenge

Build a `CoroutineTracer` class that acts as a logging interceptor for coroutine-heavy code. It should provide a `traced` function that wraps any suspend block, automatically captures `CoroutineName` and dispatcher from the coroutine context, logs start/complete/failure with elapsed time, and stores active operations in a thread-safe map for dumping on demand. Wire it into a `SearchViewModel` with `searchProducts(query)` and `loadFilters()` functions, each using `CoroutineName`. Add a `dumpActiveOperations()` method that prints all in-flight traced operations. Bonus: add MDC integration using `MDCContext` so that all logs within a traced block include the operation name and coroutine name as structured fields.

Thanks for reading!
