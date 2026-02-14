---
title: "Design an Analytics / Crash Reporting SDK"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 10
level: senior
sequence: 69
---

## Design an Analytics / Crash Reporting SDK

SDK design questions test a different angle of system design — you are building a library that other developers integrate into their apps, not an end-user product. Interviewers care about how you collect events efficiently without impacting the host app's performance, how you handle persistence and upload reliability, and how you deal with privacy constraints.

### Core Questions (Beginner to Intermediate)

#### Q1: What are the core responsibilities of an analytics SDK?

An analytics SDK does four things: collect events, persist them locally, upload them to the server in batches, and manage user sessions. Event collection means providing a simple API for the host app to log events with key-value properties (`sdk.track("add_to_cart", mapOf("product_id" to "123", "price" to 29.99))`). Local persistence ensures events are not lost if the app crashes or the network is unavailable. Batch uploading minimizes network calls by grouping events and sending them together. Session management tracks when the user starts and stops using the app, so the backend can group events into sessions.

#### Q2: How would you design the public API surface of the SDK?

Keep it minimal. The host app should interact with the SDK through a few methods: `initialize()`, `track(eventName, properties)`, `identify(userId)`, `setUserProperties()`, and `flush()`. Use a singleton pattern with lazy initialization. The SDK should be safe to call from any thread.

```kotlin
object AnalyticsSDK {

    fun initialize(context: Context, config: AnalyticsConfig) {
        // Initialize persistence, session manager, upload scheduler
    }

    fun track(event: String, properties: Map<String, Any> = emptyMap()) {
        val enrichedEvent = Event(
            name = event,
            properties = properties,
            timestamp = System.currentTimeMillis(),
            sessionId = sessionManager.currentSessionId
        )
        eventStore.save(enrichedEvent)
    }

    fun identify(userId: String) {
        userStore.setUserId(userId)
    }

    fun flush() {
        uploadScheduler.uploadNow()
    }
}
```

Avoid requiring the host app to pass `Context` on every call — take it once during `initialize()` and store the application context internally. Never hold a reference to an Activity context.

#### Q3: How would you persist events locally?

Use Room (or raw SQLite for minimal dependency footprint) to store events as rows in a database. Each event has an auto-generated ID, event name, serialized properties (JSON string), timestamp, session ID, and an `uploaded` flag.

```kotlin
@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val properties: String, // JSON-serialized
    val timestamp: Long,
    val sessionId: String,
    val uploaded: Boolean = false
)

@Dao
interface EventDao {
    @Insert
    suspend fun insert(event: EventEntity)

    @Query("SELECT * FROM events WHERE uploaded = 0 ORDER BY timestamp LIMIT :batchSize")
    suspend fun getPendingEvents(batchSize: Int = 100): List<EventEntity>

    @Query("UPDATE events SET uploaded = 1 WHERE id IN (:ids)")
    suspend fun markUploaded(ids: List<Long>)

    @Query("DELETE FROM events WHERE uploaded = 1")
    suspend fun deleteUploaded()
}
```

SQLite is preferred over SharedPreferences or file-based storage because it handles concurrent writes safely and supports efficient querying. Room adds type safety with minimal overhead. Some SDKs use raw SQLite to avoid the Room dependency — the tradeoff is more boilerplate but a smaller library size.

#### Q4: How does event batching work, and why is it important?

Instead of sending each event individually (which would mean hundreds of network calls per session), batch events together and send them in a single request. The SDK accumulates events in the local database and triggers an upload when one of these conditions is met: the batch reaches a size threshold (e.g., 50 events), a time interval passes (e.g., every 30 seconds), the app goes to background, or the host app calls `flush()` manually.

Batching reduces network overhead (fewer TCP connections, fewer TLS handshakes), saves battery, and is more reliable — one request with 50 events is easier to retry than 50 individual requests. The upload payload is a JSON array of events, often gzip-compressed to reduce bandwidth.

#### Q5: How would you handle the upload cycle?

Run a coroutine-based upload loop on `Dispatchers.IO`. On each cycle, query the database for pending events (limit to batch size), serialize them to JSON, compress with gzip, and POST to the server. On success, mark the events as uploaded and delete them. On failure, leave them in the database and retry on the next cycle.

```kotlin
class EventUploader(
    private val eventDao: EventDao,
    private val api: AnalyticsApi
) {
    suspend fun uploadBatch(): Boolean {
        val events = eventDao.getPendingEvents(batchSize = 100)
        if (events.isEmpty()) return true

        val payload = events.map { it.toUploadModel() }
        return try {
            api.uploadEvents(payload)
            eventDao.markUploaded(events.map { it.id })
            eventDao.deleteUploaded()
            true
        } catch (e: IOException) {
            false // will retry on next cycle
        }
    }
}
```

Use exponential backoff on consecutive failures — wait 30s after the first failure, 1 minute after the second, 2 minutes after the third, capped at 5 minutes. Reset the backoff after a successful upload.

#### Q6: How would you manage user sessions?

A session represents a continuous period of user activity. Start a new session when the app comes to the foreground and no session is active or the previous session timed out. End the session after a period of inactivity (typically 30 minutes with no events). Track session start and end as special events.

Use `ProcessLifecycleOwner` to detect app foreground/background transitions. When the app comes to the foreground, check if the time since the last event exceeds the session timeout. If yes, start a new session. If no, continue the existing session. Store the current session ID and last activity timestamp in memory and persist the session start time in SharedPreferences so it survives process death.

#### Q7: How would you capture uncaught exceptions for crash reporting?

Set a custom `Thread.UncaughtExceptionHandler` that captures the exception, serializes the stack trace, and saves it to disk before the process terminates. You must write the crash data synchronously and quickly — the process is about to die, so async operations might not complete.

```kotlin
class CrashHandler(
    private val defaultHandler: Thread.UncaughtExceptionHandler?
) : Thread.UncaughtExceptionHandler {

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        val crashReport = CrashReport(
            timestamp = System.currentTimeMillis(),
            threadName = thread.name,
            stackTrace = throwable.stackTraceToString(),
            deviceInfo = collectDeviceInfo()
        )
        // Write synchronously — no coroutines, no Room
        writeCrashToFile(crashReport)

        // Forward to the original handler (shows the crash dialog)
        defaultHandler?.uncaughtException(thread, throwable)
    }
}
```

Write crash data to a plain file (not Room — the database might be locked or corrupted). On the next app launch, check for crash files, upload them, and delete the files. Chain the original `UncaughtExceptionHandler` so the system's default behavior (crash dialog, process termination) still works.

#### Q8: What device and app context should the SDK collect automatically?

Collect metadata that helps the backend group and analyze events: device model, OS version, app version, screen resolution, locale, timezone, network type (Wi-Fi/cellular), and a device identifier. For the device identifier, use a randomly generated UUID stored in SharedPreferences — do not use hardware identifiers (IMEI, MAC address) as they violate privacy policies. Include the SDK version itself so the backend knows which version generated the data. Attach this metadata to every upload batch as a common header, not to every individual event, to reduce payload size.

### Deep Dive Questions (Advanced to Expert)

#### Q9: How would you detect ANRs (Application Not Responding)?

ANRs happen when the main thread is blocked for more than 5 seconds. The SDK can detect this by running a watchdog on a background thread. The watchdog posts a no-op `Runnable` to the main thread's `Handler` and waits. If the runnable does not execute within a threshold (e.g., 4 seconds), the main thread is likely blocked. At that point, capture the main thread's stack trace using `Thread.getStackTrace()` on the main `Looper` thread.

```kotlin
class AnrWatchdog(private val threshold: Long = 4000L) : Thread("AnrWatchdog") {

    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var responded = false

    override fun run() {
        while (!isInterrupted) {
            responded = false
            mainHandler.post { responded = true }
            sleep(threshold)
            if (!responded) {
                val mainThread = Looper.getMainLooper().thread
                val stackTrace = mainThread.stackTrace
                reportAnr(stackTrace)
            }
        }
    }
}
```

This is not 100% accurate — it can report false positives if the system is under heavy load. But it catches real ANRs reliably enough for production use. Firebase Crashlytics and Bugsnag use similar approaches.

#### Q10: How would you handle the retry strategy for failed uploads?

Use exponential backoff with jitter. After the first failure, wait a random time between 15-30 seconds. Double the base interval on each subsequent failure: 30s, 60s, 120s, capped at 5 minutes. Add random jitter (0-25% of the interval) to prevent all devices from retrying at the same time after a server outage.

Track the retry count per batch and give up after a maximum number of attempts (e.g., 10). If a batch fails permanently, log a warning and discard the events — holding onto them indefinitely consumes storage. For network-related failures (no connectivity, timeout), use WorkManager with network constraints to schedule the retry. For server errors (500), use the backoff strategy. For client errors (400, 413 payload too large), split the batch in half and retry each half separately.

#### Q11: How would you minimize the SDK's impact on the host app's performance?

The SDK must be invisible to the user. All disk I/O and network operations run on background threads. Use a dedicated single-thread dispatcher for database writes to avoid contention with the host app's IO dispatcher. Limit memory usage — don't buffer more than a few hundred events in memory. Use lazy initialization for heavy components (database, network client) so the SDK does not slow down app startup.

Measure the SDK's own performance. Track how long `track()` calls take — they should complete in under 1ms since they just write to an in-memory queue that is flushed to disk asynchronously. Track upload latency and payload sizes. Avoid running the upload scheduler on exact intervals — add jitter to spread load. Never run the SDK's work on the main thread. Use `StrictMode` during development to catch any accidental main thread disk or network access.

#### Q12: How would you handle privacy compliance (GDPR, CCPA)?

Provide explicit opt-in/opt-out controls. The host app calls `AnalyticsSDK.setOptedOut(true)` when the user declines tracking. When opted out, the SDK stops collecting events, stops uploading, and deletes all locally stored event data. Provide a `deleteUserData()` method that the host app can call when the user requests data deletion — this clears local storage and sends a deletion request to the backend.

Never collect personally identifiable information (PII) automatically. The SDK should not read contacts, location, or installed apps without explicit consent. For user identification, use anonymous IDs by default and only associate with a real user ID when the host app explicitly calls `identify()`. Document clearly what data the SDK collects (device model, OS version, app events) so the host app developer can include it in their privacy policy. Support data residency — let the host app configure which server region to send data to.

#### Q13: How would you design app performance monitoring (frame rate, startup time)?

For startup time, hook into `Application.onCreate()` and `Activity.reportFullyDrawn()`. Measure the time between process start (available via `Process.getStartElapsedRealtime()` on API 24+) and the first frame drawn. Categorize startup as cold, warm, or hot based on whether the process and activity existed before.

For frame rate monitoring, use `FrameMetricsAggregator` or the `Window.OnFrameMetricsAvailableListener` API. These report per-frame rendering times — any frame exceeding 16ms (or 8ms for 120Hz displays) is a dropped frame. Aggregate the data (P50, P95, P99 frame times) and upload it with the next event batch. Don't report every frame individually — that would generate too much data. Sample or aggregate over 30-second windows.

For network performance, use an OkHttp `EventListener` that tracks DNS resolution time, connection time, TLS handshake time, and response time for every request. Aggregate and upload these metrics periodically.

#### Q14: How would you handle database growth and cleanup?

Without cleanup, the events database grows indefinitely on devices with poor connectivity. Set a maximum database size (e.g., 10 MB or 10,000 events). When the limit is reached, delete the oldest events first — they are the least valuable for analytics. Run the cleanup check after every batch insert.

```kotlin
suspend fun enforceStorageLimit() {
    val eventCount = eventDao.getCount()
    if (eventCount > MAX_EVENTS) {
        val excessCount = eventCount - MAX_EVENTS
        eventDao.deleteOldest(excessCount)
    }
}
```

For crash reports, keep a maximum of 10 unsent crash files. If the app keeps crashing and cannot upload, delete the oldest crash files to prevent filling up storage. Log a metric for how many events are dropped due to storage limits so the backend knows about data loss.

#### Q15: How would you compress upload payloads efficiently?

Gzip compression typically reduces JSON payloads by 70-85%. Apply gzip compression to the request body before uploading. OkHttp does not gzip request bodies automatically (it only handles response decompression), so you need to add a custom interceptor.

```kotlin
class GzipInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val body = originalRequest.body ?: return chain.proceed(originalRequest)

        val compressedRequest = originalRequest.newBuilder()
            .header("Content-Encoding", "gzip")
            .method(originalRequest.method, gzip(body))
            .build()
        return chain.proceed(compressedRequest)
    }

    private fun gzip(body: RequestBody): RequestBody {
        return object : RequestBody() {
            override fun contentType() = body.contentType()
            override fun writeTo(sink: BufferedSink) {
                val gzipSink = GzipSink(sink).buffer()
                body.writeTo(gzipSink)
                gzipSink.close()
            }
        }
    }
}
```

Beyond gzip, reduce payload size by using short key names in the JSON schema, omitting null values, and deduplicating repeated strings (device model, OS version) by sending them once per batch as headers rather than per event.

#### Q16: How would you ensure thread safety across the SDK?

The SDK can be called from any thread, so all shared mutable state must be thread-safe. Use a single-thread dispatcher (a `CoroutineDispatcher` backed by a single-threaded executor) for all database operations. This serializes writes without explicit locking. For in-memory state (current session ID, opted-out flag, user ID), use `AtomicReference` or `@Volatile` fields.

The event queue between `track()` calls and database writes should be a `Channel` or `ConcurrentLinkedQueue`. `track()` pushes to the queue and returns immediately. A background coroutine drains the queue and writes to the database in batches. This keeps `track()` non-blocking and avoids database contention. Avoid `synchronized` blocks on hot paths — they can cause lock contention that impacts the host app's performance.

#### Q17: How would you handle SDK initialization and configuration?

Support both eager and lazy initialization. Eager initialization uses `ContentProvider`-based auto-init (like Firebase) — define a `ContentProvider` in the SDK's manifest that runs `onCreate()` before `Application.onCreate()`. Lazy initialization requires the host app to call `AnalyticsSDK.initialize()` explicitly. Lazy is preferred because it gives the host app control over when the initialization cost is paid.

The configuration object should use a builder pattern with sensible defaults:

```kotlin
val config = AnalyticsConfig.Builder()
    .setApiKey("your-api-key")
    .setUploadInterval(30_000L) // 30 seconds
    .setBatchSize(50)
    .setMaxStoredEvents(10_000)
    .setSessionTimeout(30 * 60 * 1000L) // 30 minutes
    .setOptOut(false)
    .setEndpoint("https://analytics.example.com/v1/events")
    .build()

AnalyticsSDK.initialize(context, config)
```

Validate the configuration at initialization — check that the API key is not empty, the endpoint is a valid URL, and numeric values are within reasonable bounds. Fail loudly during development (throw an exception) and fail silently in release (log a warning and use defaults).

#### Q18: How would you test the SDK in isolation and as an integration?

Unit test the core components independently. Test the `EventUploader` with a fake `EventDao` and a mock API — verify that it queries pending events, uploads them, and marks them as uploaded. Test the `CrashHandler` by throwing exceptions in a controlled environment and checking that crash files are written. Test the `AnrWatchdog` by blocking the main thread in a test and verifying the detection callback fires. Test session management by simulating foreground/background transitions and time passage.

For integration tests, create a sample app that uses the SDK. Verify that calling `track()` results in events appearing in the local database. Verify that the upload cycle sends events to a mock server. Verify that crash reports are saved and uploaded on the next launch. Use `MockWebServer` from OkHttp to intercept network calls. Test edge cases: what happens when the database is full, when the server returns 500, when the device is offline for hours and then reconnects.

### Common Follow-ups

- How would you handle SDK version upgrades that change the local database schema?
- How would you implement event sampling to reduce data volume for high-traffic apps?
- How would you deduplicate events if the same batch is uploaded twice?
- What would you do if the host app uses ProGuard/R8 — how do you ensure stack traces are readable?
- How would you design a real-time event streaming mode for debugging?
- How would you handle the case where multiple analytics SDKs are installed in the same app?
- How would you measure and report the SDK's own overhead (CPU, memory, battery)?
- How would you support custom event schemas with type safety?
