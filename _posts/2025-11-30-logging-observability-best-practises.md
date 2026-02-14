---
title: Logging And Observability Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Performance
---

1. **Use Timber Over android.util.Log**
The raw `android.util.Log` API ships with your production APK and has no built-in way to disable logging in release builds. Every `Log.d()` call you leave in the codebase will print to logcat in production — which is both a performance concern (string concatenation happens even when the log is never read) and a security concern (anything logged is visible to anyone with USB debugging access). Timber solves this by letting you plant different logging trees for debug and release builds.

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            Timber.plant(CrashReportingTree())
        }
    }
}

class CrashReportingTree : Timber.Tree() {
    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        if (priority < Log.WARN) return
        // Only warnings and errors reach crash reporting in production
        CrashReporter.log(priority, tag, message)
        t?.let { CrashReporter.recordException(it) }
    }
}
```

The `DebugTree` automatically generates the tag from the calling class name. In production, the `CrashReportingTree` filters out debug and info logs entirely, forwarding only warnings and errors to your crash reporting service. Switching from raw `Log` calls to Timber typically reduces logcat noise by 80% and eliminates security audit findings around logged data.


2. **Never Log PII or Sensitive Data**
This is non-negotiable. Never log user emails, passwords, authentication tokens, payment details, phone numbers, or any personally identifiable information. It doesn't matter that "it's just debug" or "we'll remove it before release" — it always slips through, and when it does, you're violating GDPR, CCPA, and potentially exposing user data to anyone who connects a USB cable.

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


3. **Use Structured Logging for Debuggability**
Unstructured logs like `Timber.d("User clicked button")` are nearly useless when debugging production issues. You need context: which screen, which user action, what state was the app in, what were the relevant parameters. Structured logging means attaching key-value metadata to every log entry so you can filter and search effectively in your observability platform.

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

The key insight here is that structured logs serve two audiences. During development, they help you understand what happened. In production, they let your observability platform (Datadog, New Relic, Firebase) index and query logs at scale. If your production logs are just freeform strings, finding the root cause of an issue means grepping through millions of lines. With structured key-value pairs, you query: "show me all checkout_started events where item_count > 50 and payment_method = 'credit_card'" and get your answer in seconds.


4. **Set Up Custom Crash Reporting with Context**
Default crash reporting gives you a stack trace and maybe a device model. That's often not enough to understand why a crash happened. The difference between a useful crash report and a useless one is the breadcrumbs — the sequence of events that led to the crash. Most crash reporting SDKs support custom keys and breadcrumbs that give you this context.

```kotlin
class AppCrashReporter(
    private val crashlytics: FirebaseCrashlytics
) {
    fun setUserContext(userId: String, tier: String) {
        crashlytics.setUserId(userId.sha256())
        crashlytics.setCustomKey("user_tier", tier)
        crashlytics.setCustomKey("app_version", BuildConfig.VERSION_NAME)
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

In production, I add breadcrumbs at screen transitions, network calls, and critical user interactions. When a crash report comes in, I can see: "user opened cart → added item → started checkout → crash in payment validation." Without breadcrumbs, I'd just see `NullPointerException at PaymentValidator.kt:42` with no context.


5. **Implement Performance Monitoring with Custom Traces**
Firebase Performance Monitoring gives you automatic HTTP request timing, but automatic traces miss app-specific operations — how long does search take end-to-end? Custom traces fill this gap.

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

    suspend fun <T> suspendTrace(name: String, block: suspend () -> T): T {
        val trace = Firebase.performance.newTrace(name)
        trace.start()
        return try {
            val result = block()
            trace.putAttribute("status", "success")
            result
        } catch (e: Exception) {
            trace.putAttribute("status", "error")
            throw e
        } finally {
            trace.stop()
        }
    }
}

// Usage
val results = performanceTracer.suspendTrace("search_execution") {
    searchRepository.search(query)
}
```

I add custom traces for user-facing operations that take more than 100ms. The traces give me percentile distributions across real devices. The tradeoff is that excessive tracing adds overhead — keep traces to meaningful operations (10-20 per user session).


6. **Distinguish Analytics from Logging**
Analytics and logging serve fundamentally different purposes, and mixing them creates confusion. Logging is for engineers debugging issues — "what happened and why?" Analytics is for product decisions — "what are users doing and how often?" They have different audiences, different retention periods, different privacy requirements, and should be implemented as separate systems.

```kotlin
// Logging — for engineering debugging
Timber.d("Payment failed: gateway_timeout, retrying in 3s")

// Analytics — for product understanding
analyticsTracker.track(
    event = "payment_attempt",
    properties = mapOf(
        "method" to "credit_card",
        "amount_bucket" to amountToBucket(amount),
        "attempt_number" to retryCount
    )
)
```

Notice the differences. The log contains technical details (gateway timeout, retry delay) that help engineers debug. The analytics event contains business dimensions (payment method, amount bucket) that help product managers understand behavior. Keep them separate from the start — I've worked on codebases where mixing them led to analytics dashboards full of debug noise and missing product data when debug logs were stripped for release.


7. **Use Log Levels Correctly**
Most developers use `Timber.d()` for everything. But log levels exist for filtering, and using them correctly means your production tree can act intelligently.

Here's the mental model I use. **VERBOSE** is for tracing execution flow during active development — method entry/exit, loop iterations. Remove these before merging. **DEBUG** is for information useful during development — state values, computed results, branch decisions. Only in debug builds. **INFO** is for significant application events worth knowing about in any build — user logged in, sync completed, cache cleared. **WARN** is for recoverable problems — network retry, fallback to cache, deprecated API used. **ERROR** is for failures that affect the user — payment failed, data corruption, unhandled exception.

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

In my production `CrashReportingTree`, WARN goes to the observability dashboard as a breadcrumb, and ERROR goes to crash reporting as a non-fatal event. This means I can track warning trends over time (are network timeouts increasing?) without noise from debug logs. The discipline of choosing the right level forces you to think about the severity of what you're logging, which itself improves code quality.


8. **Handle Production vs Debug Logging Separately**
Beyond just enabling or disabling logs, production and debug environments need fundamentally different logging strategies. In debug builds, you want verbose, immediate, local logs for rapid development. In production, you want minimal, asynchronous, remote logs for monitoring and debugging user-reported issues.

```kotlin
interface AppLogger {
    fun debug(message: String, vararg args: Any)
    fun info(message: String, vararg args: Any)
    fun warn(message: String, throwable: Throwable? = null)
    fun error(message: String, throwable: Throwable? = null)
}

class DebugAppLogger : AppLogger {
    override fun debug(message: String, vararg args: Any) {
        Timber.d(message, *args)
    }
    override fun info(message: String, vararg args: Any) {
        Timber.i(message, *args)
    }
    override fun warn(message: String, throwable: Throwable?) {
        Timber.w(throwable, message)
    }
    override fun error(message: String, throwable: Throwable?) {
        Timber.e(throwable, message)
    }
}

class ProductionAppLogger(
    private val crashReporter: CrashReporter,
    private val remoteLogger: RemoteLogger
) : AppLogger {
    override fun debug(message: String, vararg args: Any) { /* no-op */ }
    override fun info(message: String, vararg args: Any) {
        remoteLogger.log(Level.INFO, message.format(*args))
    }
    override fun warn(message: String, throwable: Throwable?) {
        remoteLogger.log(Level.WARN, message)
        crashReporter.addBreadcrumb(message)
    }
    override fun error(message: String, throwable: Throwable?) {
        remoteLogger.log(Level.ERROR, message)
        throwable?.let { crashReporter.recordException(it) }
    }
}
```

This abstraction enforces the debug/production split at the architecture level and makes logging testable — inject a `FakeAppLogger` that captures log calls, and assert that your error handling logs the right things at the right levels.


9. **Include Coroutine Context in Logs**
Debugging coroutine-based code is harder than thread-based code because a single operation can hop between threads. Adding coroutine context to your logs helps trace execution flow across dispatcher switches.

```kotlin
class CoroutineLoggingInterceptor : Timber.Tree() {
    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        val coroutineName = kotlin.coroutines.coroutineContext[CoroutineName]?.name
        val threadName = Thread.currentThread().name
        val enrichedMessage = buildString {
            append("[${threadName}]")
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
        Timber.d("Fetching from network")  // [IO-worker-2][loadUserProfile] Fetching from network
        userRepository.getProfile()
    }
    Timber.d("Profile loaded: ${profile.id}")  // [Main][loadUserProfile] Profile loaded: usr_123
}
```

The `CoroutineName` element follows the coroutine across dispatcher switches, so you can trace a single operation from start to finish even when it runs on different threads. When two coroutines are modifying the same state and causing intermittent bugs, the coroutine name tells you exactly which operation ran out of order. I name every coroutine that performs a significant operation — it costs nothing and saves hours in debugging.


10. **Set Up Log Rotation and Retention Policies**
If your app writes logs to local files (for bug reports or offline diagnostics), you need rotation and retention policies. Without them, log files grow unbounded, consuming storage that users notice when their phone reports "storage full." I've seen apps accumulate 200MB+ of log files because no one set up rotation.

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

        // Delete oldest files beyond retention limit
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

Three files at 5MB each means a maximum of 15MB of log storage — reasonable for most apps. The `getLogFiles()` function lets users attach logs to bug reports, which is far more useful than asking them to describe what happened. The tradeoff is IO performance — writing to disk on every log call can slow things down if you're logging heavily. For high-frequency scenarios, buffer log entries in memory and flush to disk periodically or on a background thread using a `Channel`.

Thanks for reading through all of this :), Happy Coding!
