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

SDK design flips the usual system design question on its head. You're not building an app — you're building a library that lives *inside someone else's app*. Think of it like being a guest in someone's house. You can't rearrange the furniture, you can't hog the bathroom, and you definitely can't burn down the kitchen. Everything you do has to be invisible to the end user and dead simple for the developer to integrate.

#### What are the core functional requirements for an analytics and crash reporting SDK?

Four things, and they all need to work without the host app developer thinking about them too much:

- **Event tracking** — let the host app log named events with key-value properties
- **Crash capture** — automatically catch uncaught exceptions and ANRs, grab stack traces and device info, and persist them *before the process dies*
- **Session management** — track when a user starts and stops using the app, and group all events within that window into a session
- **Reliable delivery** — persist everything locally and upload it in batches, even if the network was down when the event happened

Here's the thing — "reliable delivery" is where most of the complexity hides. The network is unreliable, processes get killed, and your SDK still has to get that data to the backend eventually.

#### What are the key non-functional requirements?

Minimal performance impact is king. The SDK is a tenant in someone else's app, so it cannot cause jank, inflate startup time, or drain battery. All heavy work — disk I/O, network, compression — must happen off the main thread. Battery efficiency means batching network calls instead of firing one request per event. Reliable delivery means no data loss on crashes, process death, or network failures — events survive in local storage until uploaded. The SDK should also be small in binary size and method count.

> **🧠 Think about it:** If your SDK adds 200ms to app startup, and the host app has 10 million users, how many collective hours of waiting have you just created?

#### Where does the SDK's responsibility end and the host app's begin?

Think of the SDK like a postal service. It picks up the mail, stores it safely, and delivers it to the destination. But it doesn't decide *what* to write in the letter — that's the host app's job. The SDK provides `track()` and the host app decides when to call it. The SDK should never read contacts, location, or any sensitive data on its own. Consent and opt-in/opt-out decisions are driven by the host app through the SDK's API. The backend and dashboard are entirely separate systems — the SDK just sends data to an ingestion endpoint.

#### What does the overall SDK architecture look like?

Four layers, each with a clear job:

- **Public API layer** — what the host app touches: `initialize()`, `track()`, `identify()`, `flush()`
- **Event pipeline** — enriches raw events with session ID, timestamp, and device metadata, then writes them to local storage
- **Storage layer** — uses SQLite (or Room) to persist events as rows
- **Uploader layer** — reads pending events from storage, batches them, compresses the payload, and ships them to the backend

A scheduler sits on top, coordinating when uploads happen based on thresholds, timers, and lifecycle events. It's like a factory assembly line — events come in one end, get processed, stored, and shipped out the other.

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

The `track()` call should return instantly. It pushes the event to an in-memory queue that gets flushed to disk asynchronously. If `track()` blocks the main thread even for a few milliseconds, you've already failed.

#### What does the backend ingestion endpoint look like?

The SDK sends a POST to something like `/v1/events` with a JSON body. The body has two parts: a `context` object with device metadata (model, OS version, app version, locale, SDK version, device ID) sent once per batch, and an `events` array with the individual events. Each event carries a name, properties map, timestamp, and session ID. Sending device metadata once per batch instead of per event reduces payload size significantly — it's like writing the return address once on a package instead of on every item inside it.

#### What do the data models look like?

Three core models. An `Event` holds the event name, properties map, timestamp, and session ID. A `CrashReport` holds the timestamp, thread name, full stack trace string, and device info snapshot. A `Session` holds a generated session ID, start timestamp, and last activity timestamp. Events and crash reports live in local storage until uploaded. Sessions are tracked in memory with the start time persisted in SharedPreferences so they survive process death.

#### How does the batching strategy work?

Events go into a local queue. The SDK flushes when any of these triggers fire:

- Queue hits a size threshold (e.g., 50 events)
- A timer fires (e.g., every 30 seconds)
- The app goes to background
- The host app calls `flush()`

Batching reduces network overhead — fewer TCP connections, fewer TLS handshakes — and saves battery. It's like waiting until you have a full load of laundry instead of running the machine for every sock. One request carrying 50 events is also way easier to retry than 50 individual requests. The upload payload is typically gzip-compressed JSON.

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

Validate configuration at init time. If the API key is empty or the endpoint is not a valid URL, throw in debug builds and fall back to defaults in release. Fail loud in development, fail graceful in production.

#### How would you capture crashes?

Set a custom `Thread.UncaughtExceptionHandler`. When an uncaught exception hits, serialize the stack trace and device info, and write it to a plain file synchronously. Here's the thing — you cannot use coroutines or Room here. The process is about to die. You're writing your last words. Only synchronous file I/O is safe. Chain the previous handler so the system's default crash behavior (dialog, process termination) still works.

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

On the next app launch, check for crash files in the directory, upload them, and delete after confirmation. For ANR detection, run a watchdog thread that posts a no-op `Runnable` to the main thread's `Handler`. If it doesn't execute within 4 seconds, the main thread is blocked. Capture the main thread's stack trace at that point.

> **🧠 Think about it:** Why do we chain the previous `UncaughtExceptionHandler` instead of just replacing it? What happens if the host app or another SDK also set one?

#### How does the ANR watchdog work internally?

The watchdog runs on its own background thread in a loop. It posts a small runnable to the main thread handler, sleeps for the threshold (4 seconds), then checks if the runnable executed. If it didn't, the main thread is likely blocked, so the watchdog grabs the main thread's stack trace and reports it as an ANR. It's like sending someone a text and waiting — if they don't reply in 4 seconds, something's wrong.

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

Yeah, this trips up everyone — it can report false positives under heavy system load. But it works well enough for production. Firebase Crashlytics and Bugsnag use similar techniques.

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

Plot twist: some SDKs skip Room entirely and use raw SQLite to avoid pulling in the dependency. The tradeoff is more boilerplate but a smaller library size.

#### How would you handle reliable delivery with retries?

Use exponential backoff with jitter. After the first failure, wait 15-30 seconds (randomized). Double the base on each subsequent failure: 30s, 60s, 120s, capped at 5 minutes. Jitter prevents all devices from retrying at the same time after a server outage — imagine a million devices all hammering your endpoint the instant it comes back online.

- **Network failures** (no connectivity, timeouts) — schedule the retry through WorkManager with a network connectivity constraint. The system fires the worker when the network comes back
- **Server errors** (5xx) — use the backoff strategy
- **Client errors** (400, 413 payload too large) — split the batch in half and retry each half separately

Give up after 10 attempts per batch and discard the events. Holding onto them indefinitely wastes storage on a device you don't own.

#### How would you handle privacy and consent?

Provide explicit opt-in/opt-out through the API. When the host app calls `setOptedOut(true)`, the SDK stops collecting, stops uploading, and deletes all locally stored data. Provide a `deleteUserData()` method that clears local storage and sends a deletion request to the backend.

Never collect PII automatically. Use a randomly generated UUID stored in SharedPreferences as the device identifier — never hardware IDs like IMEI or MAC address. Only associate a real user ID when the host app explicitly calls `identify()`. Document exactly what data the SDK collects so the host app developer can include it in their privacy policy. For GDPR, support data residency by letting the host app configure which server region receives the data.

#### How would you minimize performance impact on the host app?

All disk and network work runs on background threads. Use a dedicated single-thread dispatcher for database writes so the SDK doesn't compete with the host app's IO dispatcher. Lazy-initialize heavy components like the database and HTTP client — don't pay the cost at app startup unless the host app triggers it.

For high-traffic apps, support event sampling. The SDK can be configured to only track a percentage of events (e.g., 10%) for non-critical analytics. Crash reports are always captured at 100%. Running the SDK in a separate process is another option — it isolates memory and CPU from the host app — but it adds complexity around IPC. Most production SDKs avoid the separate process approach and just keep things lightweight on background threads.

> **🧠 Think about it:** Your SDK uses `Dispatchers.IO` for database writes. The host app also uses `Dispatchers.IO` heavily. What happens under load, and how would you prevent your SDK from starving the host app's coroutines?

#### How does session tracking work?

Use `ProcessLifecycleOwner` to detect foreground and background transitions. When the app comes to the foreground, check how long it's been since the last event. If the gap exceeds the session timeout (typically 30 minutes), start a new session with a fresh UUID. Otherwise, continue the existing session. Log session start and session end as special events.

Store the current session ID and last activity timestamp in memory. Persist the session start time in SharedPreferences so it survives process death. When the app is killed and relaunched, compare the persisted timestamp against the current time to decide whether to resume or start fresh.

#### How would you handle disk and memory limits?

Without cleanup, the events database grows indefinitely on devices with poor connectivity. Set a cap — something like 10,000 events or 10 MB. When the limit is hit, delete the oldest events first. They're the least valuable for analytics. Run the cleanup check after every batch insert.

For crash reports, keep a maximum of 10 unsent files. If the app crashes repeatedly without uploading, the oldest crash files get dropped. Track how many events and crash reports are discarded so the backend can account for data loss. In memory, don't buffer more than a few hundred events in the queue — if the queue grows beyond that, start dropping or writing directly to disk.

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
