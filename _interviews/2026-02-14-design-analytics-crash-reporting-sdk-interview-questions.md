---
title: "Design an Analytics / Crash Reporting SDK"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 10
sequence: 64
description: "SDK design questions test a different angle of system design — you are building a library that other developers integrate into their apps, not an..."
---

## Design an Analytics / Crash Reporting SDK

SDK design is a different flavor of system design. You are building a library that lives inside someone else's app, so everything you do has to be invisible to the end user and easy for the developer to integrate.

#### What are the core functional requirements for an analytics and crash reporting SDK?

The SDK needs to do four things. First, event tracking — let the host app log named events with key-value properties. Second, crash capture — automatically catch uncaught exceptions and ANRs, collect stack traces and device info, and persist them before the process dies. Third, session management — track when a user starts using the app, when they stop, and group all events within that window into a session. Fourth, reliable delivery — persist everything locally and upload it to the backend in batches, even if the network was unavailable when the event happened.

#### What are the key non-functional requirements?

Minimal performance impact is the most important one. The SDK runs inside the host app, so it cannot cause jank, increase startup time noticeably, or drain battery. All heavy work (disk I/O, network, compression) must happen off the main thread. Battery efficiency means batching network calls instead of sending events one by one. Reliable delivery means no data loss on crashes, process death, or network failures — events must survive in local storage until uploaded. The SDK should also be small in binary size and method count.

#### Where does the SDK's responsibility end and the host app's begin?

The SDK owns event collection, local persistence, batching, uploading, crash capture, and session tracking. It does not own what events to track — that is the host app's decision. The SDK provides `track()` and the host app decides when to call it. The SDK should never read contacts, location, or any sensitive data on its own. Consent and opt-in/opt-out decisions are driven by the host app through the SDK's API. The backend and dashboard are separate systems — the SDK just sends data to an ingestion endpoint.

#### What does the overall SDK architecture look like?

The SDK has four layers. The public API layer is what the host app interacts with — `initialize()`, `track()`, `identify()`, `flush()`. Behind that sits the event pipeline, which enriches raw events with session ID, timestamp, and device metadata, then writes them to local storage. The storage layer uses SQLite (or Room) to persist events as rows. The uploader layer reads pending events from storage, batches them, compresses the payload, and sends them to the backend. A scheduler coordinates when uploads happen based on thresholds, timers, and lifecycle events.

#### How would you design the public API?

Keep it minimal. A singleton with a handful of methods is the right shape. Take `Context` once during `initialize()` and store the application context. Never hold an Activity reference. The SDK should be safe to call from any thread.

```kotlin
object AnalyticsSDK {

    fun initialize(context: Context, config: AnalyticsConfig) {
        // set up storage, session manager, uploader
    }

    fun track(event: String, properties: Map<String, Any> = emptyMap()) {
        val enriched = Event(
            name = event,
            properties = properties,
            timestamp = System.currentTimeMillis(),
            sessionId = sessionManager.currentSessionId
        )
        eventStore.save(enriched)
    }

    fun identify(userId: String) {
        userStore.setUserId(userId)
    }

    fun flush() {
        uploadScheduler.uploadNow()
    }
}
```

The `track()` call should return instantly. It pushes the event to an in-memory queue that gets flushed to disk asynchronously.

#### What does the backend ingestion endpoint look like?

The SDK sends a POST request to something like `/v1/events` with a JSON body. The body has two parts: a `context` object with device metadata (model, OS version, app version, locale, SDK version, device ID) sent once per batch, and an `events` array with the individual events. Each event has a name, properties map, timestamp, and session ID. Sending device metadata once per batch instead of per event reduces payload size significantly.

#### What do the data models look like?

Three core models. An `Event` holds the event name, properties map, timestamp, and session ID. A `CrashReport` holds the timestamp, thread name, full stack trace string, and device info snapshot. A `Session` holds a generated session ID, start timestamp, and last activity timestamp. Events and crash reports are stored locally until uploaded. Sessions are tracked in memory with the start time persisted in SharedPreferences so they survive process death.

#### How does the batching strategy work?

Events go into a local queue. The SDK flushes the queue to the backend when any of these conditions is met: the queue reaches a size threshold (e.g., 50 events), a timer fires (e.g., every 30 seconds), the app goes to background, or the host app calls `flush()`. Batching reduces network overhead — fewer TCP connections, fewer TLS handshakes — and saves battery. One request carrying 50 events is also easier to retry than 50 individual requests. The upload payload is typically gzip-compressed JSON.

#### How should initialization and configuration work?

Support both eager and lazy initialization. Lazy means the host app calls `initialize()` explicitly — this is preferred because it gives control over when the cost is paid. Eager means using a `ContentProvider` in the SDK manifest that auto-runs before `Application.onCreate()`, like Firebase does.

```kotlin
val config = AnalyticsConfig.Builder()
    .setApiKey("your-api-key")
    .setUploadInterval(30_000L)
    .setBatchSize(50)
    .setMaxStoredEvents(10_000)
    .setSessionTimeout(30 * 60 * 1000L)
    .setEndpoint("https://analytics.example.com/v1/events")
    .build()

AnalyticsSDK.initialize(context, config)
```

Validate configuration at init time. If the API key is empty or the endpoint is not a valid URL, throw in debug builds and fall back to defaults in release.

#### How would you capture crashes?

Set a custom `Thread.UncaughtExceptionHandler`. When an uncaught exception hits, serialize the stack trace and device info, and write it to a plain file synchronously. You cannot use coroutines or Room here — the process is about to die, so only synchronous file I/O is safe. Chain the previous handler so the system's default crash behavior (dialog, process termination) still works.

```kotlin
class CrashHandler(
    private val previous: Thread.UncaughtExceptionHandler?
) : Thread.UncaughtExceptionHandler {

    override fun uncaughtException(thread: Thread, error: Throwable) {
        val report = CrashReport(
            timestamp = System.currentTimeMillis(),
            threadName = thread.name,
            stackTrace = error.stackTraceToString(),
            deviceInfo = collectDeviceInfo()
        )
        writeCrashToFile(report) // synchronous write
        previous?.uncaughtException(thread, error)
    }
}
```

On the next app launch, check for crash files in the directory, upload them, and delete after confirmation. For ANR detection, run a watchdog thread that posts a no-op `Runnable` to the main thread's `Handler`. If it does not execute within 4 seconds, the main thread is blocked. Capture the main thread's stack trace at that point.

#### How does the ANR watchdog work internally?

The watchdog runs on its own background thread in a loop. It posts a small runnable to the main thread handler, sleeps for the threshold (4 seconds), then checks if the runnable executed. If it did not, the main thread is likely blocked, so the watchdog grabs the main thread's stack trace and reports it as an ANR.

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
                val trace = Looper.getMainLooper().thread.stackTrace
                reportAnr(trace)
            }
        }
    }
}
```

This approach is not perfect — it can report false positives under heavy system load. But it works well enough for production. Firebase Crashlytics and Bugsnag use similar techniques.

#### How would you implement the event batching and flush logic?

The `track()` call pushes events into a `ConcurrentLinkedQueue`. A background coroutine drains the queue and writes events to SQLite in small batches. A separate upload coroutine checks flush conditions on a timer. When triggered, it reads pending events from the database, serializes them to JSON, compresses with gzip, and POSTs to the backend. On success, it deletes those rows. On failure, it leaves them for the next cycle.

The key is keeping `track()` non-blocking. It should finish in under 1ms — it only touches an in-memory queue. The database write and network upload happen entirely on background dispatchers.

#### How would you design local storage for pending events?

Use Room or raw SQLite. Each event is a row with an auto-generated ID, event name, JSON-serialized properties, timestamp, session ID, and a status flag. SQLite handles concurrent writes safely and supports efficient queries like "get the oldest 100 pending events."

```kotlin
@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val properties: String,
    val timestamp: Long,
    val sessionId: String,
    val status: Int = STATUS_PENDING
)

@Dao
interface EventDao {
    @Insert
    suspend fun insert(event: EventEntity)

    @Query("SELECT * FROM events WHERE status = 0 ORDER BY timestamp LIMIT :limit")
    suspend fun getPending(limit: Int): List<EventEntity>

    @Query("DELETE FROM events WHERE id IN (:ids)")
    suspend fun delete(ids: List<Long>)
}
```

Some SDKs use raw SQLite to avoid pulling in the Room dependency — the tradeoff is more boilerplate but smaller library size.

#### How would you handle reliable delivery with retries?

Use exponential backoff with jitter. After the first failure, wait 15-30 seconds (randomized). Double the base on each subsequent failure: 30s, 60s, 120s, capped at 5 minutes. Jitter prevents all devices from retrying at the same time after a server outage.

For network-related failures (no connectivity, timeouts), schedule the retry through WorkManager with a network connectivity constraint. The system will fire the worker when the network comes back. For server errors (5xx), use the backoff strategy. For client errors (400, 413 payload too large), split the batch in half and retry each half separately. Give up after 10 attempts per batch and discard the events — holding onto them indefinitely wastes storage.

#### How would you handle privacy and consent?

Provide explicit opt-in/opt-out through the API. When the host app calls `setOptedOut(true)`, the SDK stops collecting, stops uploading, and deletes all locally stored data. Provide a `deleteUserData()` method that clears local storage and sends a deletion request to the backend.

Never collect PII automatically. Use a randomly generated UUID stored in SharedPreferences as the device identifier — never hardware IDs like IMEI or MAC address. Only associate a real user ID when the host app explicitly calls `identify()`. Document exactly what data the SDK collects so the host app developer can include it in their privacy policy. For GDPR, support data residency by letting the host app configure which server region receives the data.

#### How would you minimize performance impact on the host app?

All disk and network work runs on background threads. Use a dedicated single-thread dispatcher for database writes so the SDK does not compete with the host app's IO dispatcher. Lazy-initialize heavy components like the database and HTTP client — do not pay the cost at app startup unless the host app triggers it.

For high-traffic apps, support event sampling. The SDK can be configured to only track a percentage of events (e.g., 10%) for non-critical analytics. Crash reports are always captured at 100%. Running the SDK in a separate process is another option — it isolates memory and CPU usage from the host app — but it adds complexity around IPC. Most production SDKs avoid the separate process approach and just keep things lightweight on background threads.

#### How does session tracking work?

Use `ProcessLifecycleOwner` to detect foreground and background transitions. When the app comes to the foreground, check how long it has been since the last event. If the gap exceeds the session timeout (typically 30 minutes), start a new session with a fresh UUID. Otherwise, continue the existing session. Log session start and session end as special events.

Store the current session ID and last activity timestamp in memory. Persist the session start time in SharedPreferences so it survives process death. When the app is killed and relaunched, compare the persisted timestamp against the current time to decide whether to resume or start fresh.

#### How would you handle disk and memory limits?

Without cleanup, the events database grows indefinitely on devices with poor connectivity. Set a cap — something like 10,000 events or 10 MB. When the limit is hit, delete the oldest events first. They are the least valuable for analytics. Run the cleanup check after every batch insert.

For crash reports, keep a maximum of 10 unsent files. If the app crashes repeatedly without uploading, the oldest crash files get dropped. Track how many events and crash reports are discarded so the backend can account for data loss. In memory, do not buffer more than a few hundred events in the queue — if the queue grows beyond that, start dropping or writing directly to disk.

#### How would you test an analytics SDK?

Unit test the core components in isolation. Test the uploader with a fake DAO and a mock API — verify it queries pending events, uploads them, and deletes them on success. Test the crash handler by throwing in a controlled environment and checking that crash files appear on disk. Test session management by simulating foreground/background transitions with fake timestamps.

For integration tests, build a sample app that uses the SDK. Call `track()` and verify events land in the local database. Trigger the upload cycle and verify events reach a `MockWebServer`. Kill the process, relaunch, and verify pending events are still there. Test edge cases: database full, server returning 500, device offline for hours then reconnecting. For the ANR watchdog, block the main thread in a test and verify the detection callback fires.

### Common Follow-ups

- How would you handle SDK version upgrades that change the local database schema?
- How would you deduplicate events if the same batch is uploaded twice?
- What happens if the host app uses ProGuard/R8 — how do you ensure stack traces are readable?
- How would you design a real-time event streaming mode for debugging?
- How would you handle multiple analytics SDKs installed in the same app competing for the uncaught exception handler?
- How would you measure and report the SDK's own overhead (CPU, memory, battery)?
- How would you compress upload payloads efficiently, and what compression ratio can you expect from gzip on JSON?
- How would you ensure thread safety across the SDK without lock contention on hot paths?
