---
title: "Threading & Background Work"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 7
---

## Threading & Background Work — What Interviewers Really Ask

Threading is where Android gets complicated, and interviewers love it. This topic separates people who've read the docs from people who've actually debugged an ANR in production. You'll be asked about everything from the basics of the main thread to WorkManager constraints and Doze mode restrictions. The evolution of background work on Android is a story of increasingly strict restrictions, and understanding why those restrictions exist is just as important as knowing how to work within them.

### Core Questions (Beginner → Intermediate)

#### Q1: What is the main thread in Android, and why is it special?

The main thread (also called the UI thread) is created when your application process starts. It runs the `Looper` that processes all UI events — touch handling, view drawing, layout, animation frames. Android's UI toolkit is not thread-safe, which means you can only update views from the main thread. If you block this thread for more than about 5 seconds, the system shows an Application Not Responding (ANR) dialog. The 16ms frame budget (for 60fps) is the practical limit — any work on the main thread that exceeds 16ms causes dropped frames visible as jank. This is why all network calls, database queries, and heavy computation must happen off the main thread.

#### Q2: What are Handler, Looper, and MessageQueue? How do they work together?

These three form Android's message-passing infrastructure. Every thread that wants to process messages needs a `Looper`. The `Looper` manages a `MessageQueue` — a priority queue of `Message` objects sorted by timestamp. The `Looper` sits in an infinite loop calling `MessageQueue.next()`, which blocks until a message is ready, then dispatches it to the appropriate `Handler`. A `Handler` is attached to a specific `Looper` and can both post messages to the queue and handle them when they're dispatched. The main thread has its `Looper` set up automatically by `ActivityThread.main()` — that's the very first thing that happens when your app starts.

```kotlin
// This is essentially what the main thread does
class ActivityThread {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            Looper.prepareMainLooper()
            // ... create the Application and first Activity
            Looper.loop() // blocks forever, processing messages
        }
    }
}

// Posting work to the main thread from a background thread
val mainHandler = Handler(Looper.getMainLooper())
mainHandler.post {
    textView.text = "Updated from background thread"
}
```

The key insight here is that everything on the main thread — `onCreate()`, `onDraw()`, click listeners, even coroutine continuations on `Dispatchers.Main` — runs as messages dispatched through this same `Looper`. When you call `Handler.postDelayed(runnable, 500)`, it inserts a `Message` into the queue with a timestamp 500ms in the future. The `Looper` won't dispatch it until that time arrives.

#### Q3: What is HandlerThread, and when would you use it?

`HandlerThread` is a thread that comes with its own `Looper` already set up. A regular Java `Thread` has no `Looper`, so you can't post messages to it. `HandlerThread` calls `Looper.prepare()` and `Looper.loop()` for you. You'd use it when you need a dedicated background thread that processes tasks sequentially — like a logging thread, a serial database writer, or a camera preview processing thread.

```kotlin
val backgroundThread = HandlerThread("DatabaseWriter").apply { start() }
val dbHandler = Handler(backgroundThread.looper)

// Tasks are executed sequentially on the background thread
dbHandler.post { database.insertLog(logEntry1) }
dbHandler.post { database.insertLog(logEntry2) }

// Don't forget to quit when done
backgroundThread.quitSafely()
```

The advantage over a thread pool is ordering — messages are processed one at a time in order. The disadvantage is throughput — you only have one thread, so tasks queue up. In modern Android, coroutines with a single-threaded dispatcher (`Dispatchers.Default.limitedParallelism(1)`) achieve the same thing more naturally.

#### Q4: What is WorkManager and why is it the recommended solution for background work?

WorkManager is the Jetpack library for scheduling deferrable, guaranteed background work. "Guaranteed" means the work will eventually execute even if the app exits or the device restarts — WorkManager persists work requests in a Room database internally. "Deferrable" means the work doesn't need to run at an exact moment. WorkManager delegates to the right underlying mechanism depending on the API level — `JobScheduler` on API 23+, or a combination of `AlarmManager` and `BroadcastReceiver` on older versions. Google recommends WorkManager for tasks like uploading logs, syncing data, processing images, or any background work that must complete eventually but doesn't need to run right now.

```kotlin
class ImageUploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val imageUri = inputData.getString("image_uri")
            ?: return Result.failure()
        return try {
            uploadImage(imageUri)
            Result.success()
        } catch (e: IOException) {
            Result.retry()
        }
    }
}

// Enqueue with constraints
val uploadRequest = OneTimeWorkRequestBuilder<ImageUploadWorker>()
    .setInputData(workDataOf("image_uri" to uri.toString()))
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
    )
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
    .build()

WorkManager.getInstance(context).enqueue(uploadRequest)
```

#### Q5: What are the different types of WorkManager requests?

WorkManager has two request types. `OneTimeWorkRequest` runs once — use it for tasks like uploading a file, syncing data after a user action, or processing an image. `PeriodicWorkRequest` runs repeatedly at intervals — use it for tasks like periodically syncing data, cleaning up stale cache, or sending analytics batches. The minimum interval for periodic work is 15 minutes, which matches `JobScheduler`'s limitation.

You can also chain work requests using `beginWith()` and `then()`. This creates a directed acyclic graph of work — WorkManager ensures tasks run in the correct order and passes output data from one worker to the next. If any worker in the chain fails, dependent workers don't execute.

#### Q6: What is the difference between WorkManager, AlarmManager, and foreground services?

These solve different problems. WorkManager is for deferrable guaranteed work — "do this eventually, when conditions are right." It respects battery optimization and Doze mode, which makes it battery-friendly. AlarmManager is for exact or near-exact timing — "wake up and do this at 3:00 AM." It's the right tool for alarm clocks, scheduled reminders, or calendar notifications. From Android 12 (API 31), exact alarms require the `SCHEDULE_EXACT_ALARM` permission, and from Android 13, users can revoke it from settings. Foreground services are for ongoing work the user is aware of — music playback, navigation, file downloads showing a progress notification. They show a persistent notification and are much less likely to be killed by the system.

The mistake candidates make is using foreground services for everything. If the work can be deferred and doesn't need the user to be aware of it, WorkManager is almost always the right choice. Foreground services have gotten increasingly restricted — Android 12 added restrictions on starting them from the background, and Android 14 requires declaring the foreground service type in the manifest.

#### Q7: What happens to your scheduled WorkManager tasks when the device reboots?

WorkManager persists its work requests in a Room database. After a reboot, a `BootCompletedBroadcastReceiver` (registered by WorkManager internally) kicks off and re-schedules all pending work. This happens automatically — you don't need to handle reboots yourself. That's the "guaranteed" part. However, the re-scheduling respects the original constraints. If you had a work request constrained to Wi-Fi and the device reboots without Wi-Fi, the work waits until Wi-Fi is available. This is fundamentally different from a raw `Thread` or coroutine — those are gone when your process dies.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How does the MessageQueue's native layer work? What happens when there are no messages?

`MessageQueue.next()` blocks when the queue is empty, but it doesn't spin-wait. Under the hood, it uses Linux's `epoll` mechanism through native code. When there are no messages to process (or the next message isn't due yet), the native layer calls `nativePollOnce()`, which calls `epoll_wait()` on a pipe file descriptor. This puts the thread to sleep at the kernel level, consuming zero CPU. When a new message is posted via `enqueueMessage()`, it calls `nativeWake()`, which writes a byte to the pipe, causing `epoll_wait()` to return and the `Looper` to wake up. This is the same mechanism used for handling input events from the window system. It's an elegant design — the main thread is either processing a message or sleeping with zero CPU cost.

#### Q9: What is Doze mode and how does it affect background work?

Doze mode is Android's aggressive power-saving feature introduced in Android 6.0. When the device is stationary, unplugged, and the screen is off for a period of time (roughly 30 minutes, but varies by OEM), the system enters Doze mode. In Doze mode, the system defers network access, ignores wake locks, defers AlarmManager alarms (except `setAlarmClock()` and `setAndAllowWhileIdle()`), stops Wi-Fi scans, stops sync adapters, and stops `JobScheduler` jobs. The system exits Doze periodically during "maintenance windows" where pending work can execute, but these windows become less frequent the longer the device stays idle.

WorkManager respects Doze mode — your work requests wait until a maintenance window. If you have work that absolutely must run during Doze (like a messaging app that needs to check for new messages), FCM high-priority messages can temporarily lift Doze restrictions. But abusing this will get your app flagged by the system.

App Standby is the per-app version of Doze. If a specific app hasn't been used for a while (roughly 24 hours), the system restricts its network access and defers its jobs. The system assigns apps to standby buckets (Active, Working Set, Frequent, Rare, Restricted) based on usage patterns, and each bucket gets different levels of restriction.

#### Q10: Explain the foreground service type requirements in Android 14+.

Before Android 14, you could start a foreground service with just a notification. Android 14 requires you to declare the specific type of foreground service in your manifest using `android:foregroundServiceType`. The available types include `camera`, `connectedDevice`, `dataSync`, `health`, `location`, `mediaPlayback`, `mediaProjection`, `microphone`, `phoneCall`, `remoteMessaging`, `shortService`, `specialUse`, and `systemExempted`. When you start the service, you must pass the matching type to `startForeground()`.

```kotlin
// In AndroidManifest.xml
// <service
//     android:name=".LocationTrackingService"
//     android:foregroundServiceType="location"
//     android:exported="false" />

class LocationTrackingService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification()
        // Must specify the type that matches manifest declaration
        startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        )
        return START_STICKY
    }
}
```

Each type requires specific permissions. The `location` type requires `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`. The `camera` type requires `CAMERA` permission. If you declare a type but don't have the required permission at runtime, the system throws a `SecurityException`. The `dataSync` type is special — Google has announced it will be deprecated in a future Android version, pushing developers toward WorkManager for data sync operations.

#### Q11: What was the evolution of background work restrictions on Android?

This is a history interviewers love because it shows you understand the "why" behind the current state. Before Android 6.0, background services were essentially unrestricted — apps could run background services indefinitely, draining battery. Android 6.0 (API 23) introduced Doze mode and App Standby. Android 7.0 (API 24) added a more aggressive "Doze on the go" that activates even when the device is moving. Android 8.0 (API 26) was the big one — background service limitations. Apps in the background can no longer start services freely. `startService()` throws an `IllegalStateException` if your app is in the background. You must use `startForegroundService()` and call `startForeground()` within 5 seconds. Android 10 (API 29) added restrictions on launching activities from the background. Android 12 (API 31) restricted foreground service starts from the background — you need specific exemptions. Android 12 also required `SCHEDULE_EXACT_ALARM` for exact alarms. Android 14 (API 34) added foreground service type requirements. Each version tightened the screws to improve battery life and user experience.

#### Q12: How does WorkManager decide which underlying mechanism to use for scheduling?

WorkManager uses a `Scheduler` abstraction. On API 23+, it uses `SystemJobScheduler`, which delegates to `JobScheduler`. On API 14-22, it uses `SystemAlarmScheduler`, which combines `AlarmManager` with `BroadcastReceiver`. There's also a `GreedyScheduler` that immediately runs work if all constraints are already met (like when you enqueue work with no constraints while the app is in the foreground). WorkManager picks the best scheduler automatically based on API level and constraints. On devices with Google Play Services, it may also use `GcmNetworkManager` as a scheduler on older API levels.

Internally, WorkManager uses a Room database (`WorkDatabase`) to persist work specs, statuses, and output data. This is how it survives process death and reboots. The work execution itself happens through `ListenableWorker`, `Worker`, or `CoroutineWorker`. `CoroutineWorker` is the modern choice — it gives you a `suspend fun doWork()` that runs on `Dispatchers.Default` by default.

#### Q13: What is an ANR and how do you diagnose one?

An ANR (Application Not Responding) occurs when the main thread is blocked for too long. The specific thresholds are: 5 seconds for input events (key or touch), 5 seconds for `BroadcastReceiver.onReceive()` (10 seconds for foreground broadcasts), and 20 seconds for `Service.onStartCommand()` or `Service.onCreate()`. When an ANR happens, the system dumps a stack trace to `/data/anr/traces.txt`. In production, you see ANR data in the Google Play Console's Android Vitals section.

Common causes in order of frequency: blocking the main thread with synchronous disk I/O (SharedPreferences `commit()`, database queries), blocking on a synchronized lock held by a background thread, `StrictMode` disk reads on main thread (even `File.exists()` can cause ANRs on slow storage), and the `QueuedWork.waitToFinish()` issue where `SharedPreferences.apply()` pending writes block `Activity.onPause()`. Diagnosing requires reading the ANR trace — the main thread's stack trace tells you exactly where it was blocked. Android Studio's CPU profiler and Perfetto traces help catch these before production.

#### Q14: What is Expedited Work in WorkManager and when would you use it?

Expedited Work, introduced in WorkManager 2.7.0, is for tasks that are important to the user and should start as soon as possible. Before this API, the options were either a foreground service (with its visible notification) or regular WorkManager (which might defer execution). Expedited Work runs immediately using a quota system — the OS allocates execution time to each app, and as long as your app has quota, expedited work starts right away. If the quota is exhausted, the work falls back to regular scheduling.

```kotlin
val urgentSync = OneTimeWorkRequestBuilder<SyncWorker>()
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .build()

WorkManager.getInstance(context).enqueue(urgentSync)
```

On API 31+, expedited work maps to `JobScheduler` expedited jobs. On older APIs, it falls back to a foreground service. Use cases include processing a payment after the user confirms, sending a time-sensitive message, or handling a user-initiated data export. The `OutOfQuotaPolicy` parameter defines what happens when quota runs out — `RUN_AS_NON_EXPEDITED_WORK_REQUEST` downgrades to regular scheduling, while `DROP_WORK_REQUEST` cancels the work.

#### Q15: How would you handle a long-running upload that needs to survive process death?

This is a classic production scenario. You need WorkManager with a foreground service type. Create a `CoroutineWorker` that calls `setForeground()` to show a progress notification. This promotes the work to a foreground service internally, making it much less likely to be killed. Use `setProgress()` to report progress that the UI can observe.

```kotlin
class FileUploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val fileUri = inputData.getString("file_uri")
            ?: return Result.failure()

        // Show foreground notification
        setForeground(createForegroundInfo(0))

        return try {
            uploadFileWithProgress(fileUri) { progress ->
                setProgress(workDataOf("progress" to progress))
                setForeground(createForegroundInfo(progress))
            }
            Result.success()
        } catch (e: IOException) {
            if (runAttemptCount < 3) Result.retry()
            else Result.failure()
        }
    }

    private fun createForegroundInfo(progress: Int): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setContentTitle("Uploading file")
            .setProgress(100, progress, false)
            .setSmallIcon(R.drawable.ic_upload)
            .setOngoing(true)
            .build()
        return ForegroundInfo(NOTIFICATION_ID, notification)
    }
}
```

The key detail: WorkManager handles process death and device reboots. If the process is killed mid-upload, WorkManager will restart the worker when conditions allow. You should design your upload to be resumable (using HTTP range requests or chunked uploads) so restarting doesn't mean starting from zero.

### Common Follow-ups

- What is the difference between `Dispatchers.IO` and `Dispatchers.Default` in coroutines?
- How does `Dispatchers.Main.immediate` differ from `Dispatchers.Main`?
- What happens if you don't call `startForeground()` within 5 seconds of `startForegroundService()`?
- How would you implement a periodic sync that respects battery optimization?
- What are the App Standby Buckets and how do they affect your background work?
- How does `WorkManager.enqueueUniqueWork()` prevent duplicate work?
- What's the difference between `Worker` and `CoroutineWorker`?
- How do you test WorkManager workers?

### Tips for the Interview

1. **Know the evolution** — The history of background restrictions (Doze, background service limits, foreground service types) shows you've been building Android apps through these transitions. Walk through the timeline confidently.

2. **Handler/Looper is foundational** — Even though we use coroutines now, understanding Handler, Looper, and MessageQueue shows you know what's actually happening when you post to `Dispatchers.Main`. Many interviewers consider this fundamental knowledge.

3. **WorkManager is the default answer** — For any "how would you do background work" question, start with WorkManager unless the scenario specifically requires real-time processing (foreground service) or exact timing (AlarmManager). Explain why WorkManager is the default and when the exceptions apply.

4. **Talk about ANRs from experience** — If you've debugged a real ANR (SharedPreferences `apply()` blocking `onPause()`, synchronous network call, lock contention), share it. This is one of the strongest signals of production experience.

5. **Understand the restrictions** — Don't just know what the restrictions are. Know why Google introduced them (battery life, user experience) and what alternatives they provide. This shows maturity in how you think about the platform.
