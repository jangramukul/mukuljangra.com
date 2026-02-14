---
title: Logging And Observability Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Performance
---

Last year I got pulled into a production incident at 11 PM. Users were reporting that checkout was silently failing — they'd tap "Place Order," the button spinner would appear, and then... nothing. No error message, no confirmation, just a dead screen.

Here's the worst part. The crash reporting dashboard showed zero crashes. The analytics showed users reaching the checkout screen but never completing. We knew *something* was wrong, but we had zero visibility into *what*.

It took us three hours to find the root cause. A payment gateway was returning a 503 with a body our parser didn't expect, and the exception was being swallowed in a `try-catch` that logged nothing. No Timber call, no breadcrumb, no custom key in Crashlytics. The code just caught the exception and returned `null`, which the ViewModel interpreted as "no result yet" and stayed in the loading state forever.

Three hours. For what would have been a 30-second fix if we'd had one `Timber.e()` call in the right place.

That incident changed how I think about logging and observability. Think of it like a security camera system for your app. You don't install cameras *after* someone breaks in — you set them up beforehand so that when something goes wrong, you can rewind the tape and see exactly what happened. Good observability is the difference between a 30-minute incident and a 3-hour one, and it's something you build *before* you need it.

## Why Timber Over android.util.Log

Imagine you have a megaphone that broadcasts everything you say to anyone within earshot. That's basically `android.util.Log` in production. Every `Log.d()` call you leave in the codebase prints to logcat in production — a performance concern (string concatenation happens even when the log is never read) and a security concern (anything logged is visible to anyone with USB debugging access). There's no built-in way to disable it for release builds. You're just... yelling into the void and hoping nobody's listening.

Timber fixes this by giving you something more like a switchboard. You "plant" different logging trees for debug and release builds, and each tree decides independently what to do with a log call. The real power? You can plant multiple trees simultaneously — a debug tree for logcat, a crash reporting tree for Crashlytics, and an analytics tree for your event pipeline, all receiving the same `Timber.d()` call.

One log statement, three different destinations. That's the magic.

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            Timber.plant(CrashReportingTree())
            Timber.plant(AnalyticsTree())
        }
    }
}

class CrashReportingTree : Timber.Tree() {
    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        if (priority < Log.WARN) return
        FirebaseCrashlytics.getInstance().log("[$tag] $message")
        t?.let { FirebaseCrashlytics.getInstance().recordException(it) }
    }
}
```

The `DebugTree` automatically generates the tag from the calling class name — no more manually typing `TAG` constants everywhere. In production, the `CrashReportingTree` filters out debug and info logs entirely, forwarding only warnings and errors to Crashlytics. Switching from raw `Log` calls to Timber typically reduces logcat noise by 80% and eliminates security audit findings around logged data.

> **💡 The "aha" moment:** Timber isn't just a prettier `Log` wrapper. It's a routing layer. You write one log call, and your tree configuration decides where it goes — logcat in debug, Crashlytics in production, analytics pipeline for business events. The caller never needs to know.

## The PII Rule Is Non-Negotiable

This is the one rule I enforce with zero tolerance. Never log user emails, passwords, authentication tokens, payment details, phone numbers, or any personally identifiable information.

"But it's just debug!" "We'll remove it before release!"

I know. I've heard it. And it always slips through. When it does, you're violating GDPR, CCPA, and potentially exposing user data to anyone who connects a USB cable. Think of your logs like a postcard — anyone handling it along the way can read what's written on it. Would you write someone's credit card number on a postcard?

```kotlin
// Dangerous — auth tokens in logs
fun onLoginSuccess(token: AuthToken) {
    Timber.d("Login successful, token: $token")  // NEVER do this
    Timber.d("Login successful for user: ${user.email}")  // NEVER do this
}

// Safe — log identifiers, not data
fun onLoginSuccess(token: AuthToken) {
    Timber.d("Login successful, userId: ${user.id}")
    Timber.d("Token refreshed, expiresIn: ${token.expiresInSeconds}s")
}
```

Beyond individual discipline, create a custom lint rule that flags logging calls containing parameter names like `password`, `token`, `email`, or `creditCard`. Static analysis catches the patterns that human reviewers miss during busy weeks. The one exception is hashed or anonymized identifiers — logging a SHA-256 hash of a user ID for debugging correlation is fine, as long as the hashing happens before the log call.

## Structured Logging Changes Everything

Here's the thing about unstructured logs like `Timber.d("User clicked button")` — they're nearly useless when debugging production issues. Imagine you're a detective investigating a crime scene, and the only evidence you have is a note that says "something happened here." Not super helpful, right?

What you actually need is context: which screen, which user action, what state was the app in, what were the relevant parameters. Structured logging means attaching key-value metadata to every log entry so you can filter and search effectively in your observability platform. This was the biggest change we made after that checkout incident, and honestly, it felt like going from squinting at a blurry photo to watching HD security footage.

```kotlin
object StructuredLogger {
    fun event(
        action: String,
        screen: String,
        params: Map<String, Any> = emptyMap()
    ) {
        val context = mapOf(
            "action" to action,
            "screen" to screen,
            "timestamp" to System.currentTimeMillis(),
            "session_id" to SessionManager.currentSessionId
        ) + params

        Timber.d("Event: $context")

        // In production, send to observability backend
        ObservabilityClient.logEvent(context)
    }
}

// Usage
StructuredLogger.event(
    action = "checkout_started",
    screen = "CartScreen",
    params = mapOf(
        "item_count" to cartItems.size,
        "total_amount" to total,
        "payment_method" to selectedMethod.type
    )
)
```

Structured logs serve two audiences. During development, they help you understand what happened. In production, they let your observability platform (Datadog, New Relic, Firebase) index and query logs at scale. With structured key-value pairs, you can query: "show me all checkout_started events where item_count > 50 and payment_method = 'credit_card'" and get your answer in seconds instead of grepping through millions of freeform strings.

That's the difference between a filing cabinet with labeled folders and a pile of loose papers on the floor. Same information, wildly different retrieval time.

## Firebase Crashlytics — Beyond Basic Setup

Default crash reporting gives you a stack trace and maybe a device model. I can't count the number of times I've stared at a `NullPointerException at PaymentValidator.kt:42` with zero context about how the user got there. It's like getting a police report that says "car crashed" with no mention of road conditions, speed, or what the driver was doing. Technically accurate, practically useless.

The difference between a useful crash report and a useless one comes down to two things: **custom keys** that describe the device and session state, and **breadcrumbs** that record the sequence of events leading up to the crash.

The `FirebaseCrashlytics.getInstance()` API lets you attach custom keys that persist across the session and show up in every crash report. I set these as early as possible — right after login and at every significant state change. The `setCustomKey()` calls are cheap (they write to a local buffer that gets uploaded with the crash), so there's no reason to be stingy with them. The `log()` method adds breadcrumb strings that Crashlytics stores in a rolling buffer of the most recent 64KB.

```kotlin
class AppCrashReporter(
    private val crashlytics: FirebaseCrashlytics
) {
    fun initialize(userId: String, tier: String) {
        crashlytics.setUserId(userId.sha256())
        crashlytics.setCustomKey("user_tier", tier)
        crashlytics.setCustomKey("app_version", BuildConfig.VERSION_NAME)
        crashlytics.setCustomKey("device_ram_mb", getDeviceRamMb())
        crashlytics.setCustomKey("device_storage_free_mb", getFreeStorageMb())
    }

    fun updateSessionContext(screen: String, networkState: String) {
        crashlytics.setCustomKey("current_screen", screen)
        crashlytics.setCustomKey("network_state", networkState)
    }

    fun addBreadcrumb(event: String, data: Map<String, String> = emptyMap()) {
        val breadcrumb = buildString {
            append(event)
            if (data.isNotEmpty()) {
                append(" | ")
                append(data.entries.joinToString(", ") { "${it.key}=${it.value}" })
            }
        }
        crashlytics.log(breadcrumb)
    }

    fun recordNonFatal(throwable: Throwable, context: Map<String, String> = emptyMap()) {
        context.forEach { (key, value) -> crashlytics.setCustomKey(key, value) }
        crashlytics.recordException(throwable)
    }
}
```

In production, I add breadcrumbs at screen transitions, network calls, and critical user interactions. When a crash report comes in, I can see: "user opened cart → added item → started checkout → crash in payment validation" alongside custom keys showing they were on WiFi with 200MB free storage. Now that `NullPointerException at PaymentValidator.kt:42` has a whole story behind it.

The custom keys for device RAM and free storage are particularly useful — a surprising number of crashes correlate with low-memory devices, and without that key you'd never notice the pattern.

> **🧠 Think about it:** If a crash only happens on devices with less than 2GB of RAM, but your crash report doesn't include RAM info — how would you ever figure that out? You'd be debugging the code for days when the problem is actually the environment.

## Custom Timber Trees for Analytics

One of Timber's underrated features is that you can plant multiple trees and each one independently decides what to do with every log call. I use this to build an analytics-routing tree that intercepts specific tagged log calls and forwards them to the analytics pipeline. The developer just writes `Timber.tag("ANALYTICS").i(...)` and the tree handles the routing — no analytics SDK dependency needed in feature modules.

What does this buy you? Picture a large modularized app. Your `:feature:search` module shouldn't need to know about your analytics SDK. It shouldn't even know analytics *exists*. But it still needs to track events. The tree acts as a middleman — feature modules talk to Timber (which they already depend on), and the tree routes analytics-tagged logs to the right place.

```kotlin
class AnalyticsTree(
    private val analyticsClient: AnalyticsClient
) : Timber.Tree() {
    override fun isLoggable(tag: String?, priority: Int): Boolean {
        return tag == "ANALYTICS" && priority >= Log.INFO
    }

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        val parts = message.split("|", limit = 2)
        val eventName = parts[0].trim()
        val properties = if (parts.size > 1) {
            parts[1].trim().split(",").associate { param ->
                val (key, value) = param.trim().split("=", limit = 2)
                key.trim() to value.trim()
            }
        } else {
            emptyMap()
        }
        analyticsClient.track(eventName, properties)
    }
}

// Usage in feature code
Timber.tag("ANALYTICS").i("search_performed | query_length=${query.length}, result_count=$resultCount")
Timber.tag("ANALYTICS").i("filter_applied | filter_type=price, range=$selectedRange")
```

The tradeoff here is readability — the pipe-delimited format is a convention your team needs to agree on. But the alternative (injecting an analytics dependency into every feature module) creates coupling that makes modularization painful. The tree approach means feature modules only depend on Timber, and analytics routing is a single app-level configuration.

## Getting Log Levels Right

Most developers use `Timber.d()` for everything. I get it — when you're debugging, you just want the log to show up, and `d` for debug sounds right for everything. But log levels exist for a reason, and that reason is filtering.

Think of log levels like a severity rating system at a hospital. Not every patient gets the same urgency. A scraped knee (VERBOSE) is different from a broken arm (WARN) is different from a cardiac arrest (ERROR). If every patient was labeled "urgent," triage would be impossible. Same with your logs.

Here's the mental model I use:

**VERBOSE** is for tracing execution flow during active development — method entry/exit, loop iterations. Remove these before merging. **DEBUG** is for information useful during development — state values, computed results, branch decisions. Only in debug builds. **INFO** is for significant application events worth knowing about in any build — user logged in, sync completed, cache cleared. **WARN** is for recoverable problems — network retry, fallback to cache, deprecated API used. **ERROR** is for failures that affect the user — payment failed, data corruption, unhandled exception.

```kotlin
// Verbose — development tracing only
Timber.v("onBindViewHolder position=$position")

// Debug — development-time state inspection
Timber.d("Cache hit for key=$cacheKey, age=${cacheEntry.ageMs}ms")

// Info — significant app events
Timber.i("User session started, sessionId=$sessionId")

// Warn — recovered from a problem
Timber.w("Network timeout, falling back to cached data")

// Error — something broke
Timber.e(exception, "Payment processing failed for orderId=$orderId")
```

In my production `CrashReportingTree`, WARN goes to Crashlytics as a breadcrumb via `crashlytics.log()`, and ERROR goes as a non-fatal via `recordException()`. This means I can track warning trends (are network timeouts increasing?) without noise from debug logs. The discipline of choosing the right level forces you to think about severity, which itself improves code quality.

> **⚡ Quick check:** If your production Crashlytics dashboard is flooded with noise, check your `CrashReportingTree` — are you forwarding DEBUG-level logs? That's usually the culprit.

## Real-World Logging Patterns

Beyond the general architecture, there are a few specific patterns I've found invaluable in production apps. The first is an OkHttp logging interceptor that captures request and response details for debugging network issues without leaking sensitive headers or bodies in release builds.

Imagine your app makes 50 network calls during a typical session. When one of them fails silently, you want to know which one, how long it took, and what status code came back. This interceptor gives you that — a compact, readable trail of every HTTP request and response flowing through your app.

```kotlin
class NetworkLoggingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val startMs = System.currentTimeMillis()
        Timber.d("→ ${request.method} ${request.url.encodedPath}")

        return try {
            val response = chain.proceed(request)
            val durationMs = System.currentTimeMillis() - startMs
            Timber.d("← ${response.code} ${request.url.encodedPath} (${durationMs}ms)")

            if (response.code >= 400) {
                Timber.w("HTTP ${response.code} for ${request.url.encodedPath}, duration=${durationMs}ms")
            }
            response
        } catch (e: IOException) {
            val durationMs = System.currentTimeMillis() - startMs
            Timber.e(e, "✕ FAILED ${request.url.encodedPath} (${durationMs}ms)")
            throw e
        }
    }
}
```

The second pattern is lifecycle event logging. When debugging UI issues — fragments not appearing, screens showing stale data, ViewModels surviving when they shouldn't — having a log trail of lifecycle transitions saves enormous time. I add a single `ActivityLifecycleCallbacks` registration in `Application.onCreate()` that logs every activity transition.

When you're debugging a "the screen goes blank after rotation" report, seeing `onDestroy → onCreate → onStart` with timestamps tells you immediately whether the activity is being recreated properly. In debug builds, I also register `FragmentLifecycleCallbacks` on every activity's `FragmentManager`. The overhead is negligible, and the debugging value when something goes wrong with navigation is enormous.

## Coroutine Context in Logs

Debugging coroutine-based code is harder than thread-based code because a single operation can hop between threads. I've spent hours tracing a bug where two coroutines were modifying the same state — the logs showed operations on different threads, but I couldn't tell which coroutine was responsible for each log line. It was like reading a conversation transcript where everyone's name was redacted. You can see what was said, but you have no idea who said it.

Adding coroutine context to your logs solves this entirely.

```kotlin
class CoroutineLoggingTree : Timber.Tree() {
    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        val coroutineName = kotlin.coroutines.coroutineContext[CoroutineName]?.name
        val threadName = Thread.currentThread().name
        val enrichedMessage = buildString {
            append("[$threadName]")
            coroutineName?.let { append("[$it]") }
            append(" $message")
        }
        Log.println(priority, tag ?: "App", enrichedMessage)
    }
}

// Name your coroutines for debuggability
viewModelScope.launch(CoroutineName("loadUserProfile")) {
    Timber.d("Starting profile load")  // [Main][loadUserProfile] Starting profile load
    val profile = withContext(Dispatchers.IO) {
        Timber.d("Fetching from network")  // [IO-worker-2][loadUserProfile] Fetching
        userRepository.getProfile()
    }
    Timber.d("Profile loaded: ${profile.id}")  // [Main][loadUserProfile] Profile loaded
}
```

See what happens there? The `CoroutineName` element follows the coroutine across dispatcher switches, so you can trace a single operation from start to finish even when it runs on different threads. The log says `[Main][loadUserProfile]`, then `[IO-worker-2][loadUserProfile]`, then `[Main][loadUserProfile]` again. Same coroutine, three different threads, perfectly traceable.

I name every coroutine that performs a significant operation — it costs nothing and saves hours in debugging. Put another way: it's the difference between reading a conversation where everyone has a name tag and one where everyone is anonymous.

## Custom Performance Traces

Firebase Performance Monitoring gives you automatic HTTP request timing, but automatic traces miss app-specific operations. How long does search take end-to-end? What about the time between the user tapping "checkout" and seeing the confirmation? These are the metrics that actually matter to your users, and they require custom traces.

Think of automatic traces like having speed cameras on the highway — they catch one specific thing. But what if you want to know how long the entire road trip takes, including the stops? That's what custom traces are for.

```kotlin
class PerformanceTracer {
    fun <T> trace(name: String, block: () -> T): T {
        val trace = Firebase.performance.newTrace(name)
        trace.start()
        return try {
            val result = block()
            trace.putAttribute("status", "success")
            result
        } catch (e: Exception) {
            trace.putAttribute("status", "error")
            trace.putAttribute("error_type", e.javaClass.simpleName)
            throw e
        } finally {
            trace.stop()
        }
    }
}

// Usage — wrap any user-facing operation
val results = performanceTracer.trace("search_execution") {
    searchRepository.search(query)
}
```

I add custom traces for user-facing operations that take more than 100ms. The traces give me percentile distributions across real devices — not just average latency, but p95 and p99, which is where real performance problems hide. Your average might look great at 200ms, but if your p99 is 4 seconds, 1 in 100 users is having a terrible experience. For coroutine-based operations, you can write a `suspend` variant using the same pattern. The tradeoff is that excessive tracing adds overhead — keep traces to meaningful operations (10-20 per user session).

> **🔥 Real talk:** Average latency is a liar. I once had a search feature where the average response time was 300ms — looked great in the dashboard. But the p99 was 8 seconds because certain query patterns triggered a full table scan on low-end devices. Custom traces with percentile breakdowns are the only way you catch this before your users do.

## Log Rotation and Retention

If your app writes logs to local files (for bug reports or offline diagnostics), you need rotation and retention policies. Without them, log files grow unbounded, consuming storage that users notice when their phone reports "storage full." I've seen apps accumulate 200MB+ of log files because no one set up rotation. It's one of those things nobody thinks about until a user with a 32GB phone complains.

It's like never taking out the trash because you're too busy cooking. Eventually, the kitchen becomes unusable — and the trash isn't even the thing you were focused on.

```kotlin
class FileLogger(
    private val logDir: File,
    private val maxFileSize: Long = 5 * 1024 * 1024, // 5MB
    private val maxFiles: Int = 3
) : Timber.Tree() {

    private var currentFile: File = createLogFile()

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        if (priority < Log.INFO) return

        synchronized(this) {
            if (currentFile.length() > maxFileSize) {
                rotateFiles()
            }
            currentFile.appendText("${System.currentTimeMillis()} [$tag] $message\n")
            t?.let { currentFile.appendText(it.stackTraceToString() + "\n") }
        }
    }

    private fun rotateFiles() {
        val logs = logDir.listFiles { f -> f.name.startsWith("app_log_") }
            ?.sortedByDescending { it.lastModified() }
            ?: return
        logs.drop(maxFiles - 1).forEach { it.delete() }
        currentFile = createLogFile()
    }

    private fun createLogFile(): File {
        logDir.mkdirs()
        return File(logDir, "app_log_${System.currentTimeMillis()}.txt")
    }

    fun getLogFiles(): List<File> =
        logDir.listFiles { f -> f.name.startsWith("app_log_") }
            ?.sortedByDescending { it.lastModified() }
            ?: emptyList()
}
```

Three files at 5MB each means a maximum of 15MB of log storage — reasonable for most apps. The `getLogFiles()` function lets users attach logs to bug reports, which is far more useful than asking them to describe what happened. ("The screen went blue... no wait, green... and then it crashed." Sound familiar?) The tradeoff is IO performance — writing to disk on every log call can slow things down, so for high-frequency scenarios, buffer entries in memory and flush to disk periodically using a `Channel`.

Thanks for reading through all of this :), Happy Coding!
