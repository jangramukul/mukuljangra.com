---
title: "Threading & Background Work"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 11
sequence: 11
description: "Threading and background work are important topics in Android."
---

## Threading & Background Work

Threading and background work are important topics in Android. This covers everything from the main thread basics to WorkManager, Doze mode, and foreground service restrictions.

### Core Questions (Beginner → Intermediate)

#### Q1: What is the main thread in Android, and why is it special?

The main thread (also called UI thread) is created when the application process starts. It runs the `Looper` that processes all UI events like touch handling, view drawing, layout and animations. Android's UI toolkit is not thread-safe, so you can only update views from the main thread. If you block this thread for more than 5 seconds, the system shows an ANR (Application Not Responding) dialog. The 16ms frame budget (for 60fps) is the practical limit — any work exceeding 16ms causes dropped frames. This is why network calls, database queries, and heavy computation must happen off the main thread.

#### Q2: What are Handler, Looper, and MessageQueue? How do they work together?

These three form Android's message-passing system. Every thread that wants to process messages needs a `Looper`. The `Looper` manages a `MessageQueue` which is a priority queue of `Message` objects sorted by timestamp. The `Looper` sits in an infinite loop calling `MessageQueue.next()`, which blocks until a message is ready, then dispatches it to the appropriate `Handler`. A `Handler` is attached to a specific `Looper` and can post messages to the queue and handle them when dispatched. The main thread gets its `Looper` set up automatically by `ActivityThread.main()`.

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

Everything on the main thread — `onCreate()`, `onDraw()`, click listeners, coroutine continuations on `Dispatchers.Main` — runs as messages dispatched through this same `Looper`. When you call `Handler.postDelayed(runnable, 500)`, it inserts a `Message` with a timestamp 500ms in the future. The `Looper` won't dispatch it until that time arrives.

#### Q3: What is HandlerThread, and when would you use it?

`HandlerThread` is a thread that comes with its own `Looper` already set up. A regular Java `Thread` has no `Looper`, so you can't post messages to it. `HandlerThread` calls `Looper.prepare()` and `Looper.loop()` for you. It is used when you need a dedicated background thread that processes tasks sequentially, like a logging thread, a serial database writer, or a camera preview processor.

```kotlin
val backgroundThread = HandlerThread("DatabaseWriter").apply { start() }
val dbHandler = Handler(backgroundThread.looper)

// Tasks are executed sequentially on the background thread
dbHandler.post { database.insertLog(logEntry1) }
dbHandler.post { database.insertLog(logEntry2) }

// Don't forget to quit when done
backgroundThread.quitSafely()
```

The advantage over a thread pool is ordering — messages are processed one at a time in order. The disadvantage is throughput — only one thread, so tasks queue up. In modern Android, coroutines with a single-threaded dispatcher (`Dispatchers.Default.limitedParallelism(1)`) achieve the same thing.

#### Q4: What is WorkManager and why is it the recommended solution for background work?

WorkManager is a part of Jetpack libraries that is used for scheduling deferrable, guaranteed background work. "Guaranteed" means the work will eventually execute even if the app exits or the device restarts because WorkManager persists work requests in a Room database internally. "Deferrable" means the work doesn't need to run at an exact moment. WorkManager delegates to the right mechanism depending on API level — `JobScheduler` on API 23+, or `AlarmManager` with `BroadcastReceiver` on older versions. Generally, WorkManager is used for tasks like uploading logs, syncing data, processing images, or any background work that must complete eventually.

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

WorkManager has two request types:
- `OneTimeWorkRequest` — runs once. Used for tasks like uploading a file, syncing data, or processing an image.
- `PeriodicWorkRequest` — runs repeatedly at intervals. Used for tasks like periodic data sync, cache cleanup, or sending analytics batches. The minimum interval is 15 minutes.

You can chain work requests using `beginWith()` and `then()`. WorkManager ensures tasks run in the correct order and passes output data from one worker to the next. If any worker in the chain fails, dependent workers don't execute.

#### Q6: What is the difference between WorkManager, AlarmManager, and foreground services?

These solve different problems:
- **WorkManager** — for deferrable guaranteed work. It respects battery optimization and Doze mode.
- **AlarmManager** — for exact or near-exact timing like alarm clocks, scheduled reminders, or calendar notifications. From Android 12 (API 31), exact alarms require the `SCHEDULE_EXACT_ALARM` permission. From Android 13, users can revoke it.
- **Foreground services** — for ongoing work the user is aware of like music playback, navigation, or file downloads with a progress notification. They show a persistent notification and are less likely to be killed.

If the work can be deferred, WorkManager is almost always the right choice. Foreground services have gotten increasingly restricted — Android 12 restricted starting them from the background, and Android 14 requires declaring the foreground service type in the manifest.

#### Q7: What happens to your scheduled WorkManager tasks when the device reboots?

WorkManager persists work requests in a Room database. After a reboot, a `BootCompletedBroadcastReceiver` (registered by WorkManager internally) re-schedules all pending work automatically. The re-scheduling respects the original constraints. If a work request was constrained to Wi-Fi and the device reboots without Wi-Fi, the work waits until Wi-Fi is available. This is different from a raw `Thread` or coroutine — those are gone when the process dies.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How does the MessageQueue's native layer work? What happens when there are no messages?

`MessageQueue.next()` blocks when the queue is empty but it doesn't spin-wait. It uses Linux's `epoll` mechanism through native code. When there are no messages to process, the native layer calls `nativePollOnce()`, which calls `epoll_wait()` on a pipe file descriptor. This puts the thread to sleep at the kernel level, consuming zero CPU. When a new message is posted via `enqueueMessage()`, it calls `nativeWake()`, which writes a byte to the pipe, causing `epoll_wait()` to return and the `Looper` to wake up. The main thread is either processing a message or sleeping with zero CPU cost.

#### Q9: What is Doze mode and how does it affect background work?

Doze mode is Android's power-saving feature introduced in Android 6.0. The system enters Doze mode when the device is stationary, unplugged, and the screen is off for a period of time (roughly 30 minutes, varies by OEM). In Doze mode, the system applies these restrictions:
- Defers network access
- Ignores wake locks
- Defers AlarmManager alarms (except `setAlarmClock()` and `setAndAllowWhileIdle()`)
- Stops Wi-Fi scans, sync adapters, and `JobScheduler` jobs

The system exits Doze periodically during "maintenance windows" where pending work can execute. These windows become less frequent the longer the device stays idle.

WorkManager respects Doze mode — work requests wait until a maintenance window. FCM high-priority messages can temporarily lift Doze restrictions for messaging apps.

App Standby is the per-app version of Doze. If an app hasn't been used for a while (roughly 24 hours), the system restricts its network access and defers its jobs. The system assigns apps to standby buckets (Active, Working Set, Frequent, Rare, Restricted) based on usage patterns, and each bucket gets different restriction levels.

#### Q10: Explain the foreground service type requirements in Android 14+.

Android 14 requires declaring the specific type of foreground service in the manifest using `android:foregroundServiceType`. The available types include `camera`, `connectedDevice`, `dataSync`, `health`, `location`, `mediaPlayback`, `mediaProjection`, `microphone`, `phoneCall`, `remoteMessaging`, `shortService`, `specialUse`, and `systemExempted`. When starting the service, you must pass the matching type to `startForeground()`.

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

Each type requires specific permissions. The `location` type requires `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`. The `camera` type requires `CAMERA` permission. If the required permission is missing at runtime, the system throws a `SecurityException`. The `dataSync` type will be deprecated in a future Android version, pushing developers toward WorkManager for data sync.

#### Q11: What was the evolution of background work restrictions on Android?

Before Android 6.0, background services were unrestricted — apps could run them indefinitely. Here is the timeline of restrictions:
- **Android 6.0 (API 23)** — introduced Doze mode and App Standby.
- **Android 7.0 (API 24)** — added "Doze on the go" that activates even when the device is moving.
- **Android 8.0 (API 26)** — background service limitations. `startService()` throws `IllegalStateException` if app is in the background. Must use `startForegroundService()` and call `startForeground()` within 5 seconds.
- **Android 10 (API 29)** — restricted launching activities from the background.
- **Android 12 (API 31)** — restricted foreground service starts from the background. Required `SCHEDULE_EXACT_ALARM` for exact alarms.
- **Android 14 (API 34)** — added foreground service type requirements.

Each version tightened restrictions to improve battery life and user experience.

#### Q12: How does WorkManager decide which underlying mechanism to use for scheduling?

WorkManager uses a `Scheduler` abstraction:
- On API 23+, it uses `SystemJobScheduler` which delegates to `JobScheduler`.
- On API 14-22, it uses `SystemAlarmScheduler` which combines `AlarmManager` with `BroadcastReceiver`.
- A `GreedyScheduler` immediately runs work if all constraints are already met.
- On devices with Google Play Services, it may also use `GcmNetworkManager` on older API levels.

WorkManager picks the best scheduler automatically based on API level and constraints. Internally, it uses a Room database (`WorkDatabase`) to persist work specs, statuses, and output data. This is how it survives process death and reboots. `CoroutineWorker` is the modern choice for work execution — it gives you a `suspend fun doWork()` that runs on `Dispatchers.Default` by default.

#### Q13: What is an ANR and how do you diagnose one?

ANR (Application Not Responding) occurs when the main thread is blocked for too long. The thresholds are:
- 5 seconds for input events (key or touch)
- 5 seconds for `BroadcastReceiver.onReceive()` (10 seconds for foreground broadcasts)
- 20 seconds for `Service.onStartCommand()` or `Service.onCreate()`

When an ANR happens, the system dumps a stack trace to `/data/anr/traces.txt`. In production, ANR data is available in Google Play Console's Android Vitals.

Common causes:
- Synchronous disk I/O on main thread (SharedPreferences `commit()`, database queries)
- Blocking on a synchronized lock held by a background thread
- `StrictMode` disk reads on main thread (even `File.exists()` can cause ANRs on slow storage)
- `SharedPreferences.apply()` pending writes blocking `Activity.onPause()` via `QueuedWork.waitToFinish()`

The main thread's stack trace tells you exactly where it was blocked. Android Studio's CPU profiler and Perfetto traces help catch these before production.

#### Q14: What is Expedited Work in WorkManager and when would you use it?

Expedited Work was introduced in WorkManager 2.7.0 for tasks that should start as soon as possible. It runs immediately using a quota system — the OS allocates execution time to each app, and as long as your app has quota, expedited work starts right away. If the quota is exhausted, the work falls back to regular scheduling.

```kotlin
val urgentSync = OneTimeWorkRequestBuilder<SyncWorker>()
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .build()

WorkManager.getInstance(context).enqueue(urgentSync)
```

On API 31+, it maps to `JobScheduler` expedited jobs. On older APIs, it falls back to a foreground service. Use cases include processing a payment, sending a time-sensitive message, or handling a user-initiated data export. The `OutOfQuotaPolicy` defines what happens when quota runs out — `RUN_AS_NON_EXPEDITED_WORK_REQUEST` downgrades to regular scheduling, while `DROP_WORK_REQUEST` cancels the work.

#### Q15: How would you handle a long-running upload that needs to survive process death?

Use WorkManager with a foreground service type. Create a `CoroutineWorker` that calls `setForeground()` to show a progress notification. This promotes the work to a foreground service internally. Use `setProgress()` to report progress that the UI can observe.

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

WorkManager handles process death and device reboots. If the process is killed mid-upload, WorkManager restarts the worker when conditions allow. The upload should be designed to be resumable using HTTP range requests or chunked uploads so restarting doesn't mean starting from zero.

#### Q16: What are the exact alarm restrictions introduced in Android 12, and how do you handle them?

Before Android 12, any app could schedule exact alarms. Here is the timeline of restrictions:
- **Android 12 (API 31)** — introduced `SCHEDULE_EXACT_ALARM` permission, auto-granted on install.
- **Android 13 (API 33)** — made it revocable by users from Settings.
- **Android 14 (API 34)** — apps that aren't alarm clocks, calendars, or timers should use `USE_EXACT_ALARM` (auto-granted, not revocable) only if exact timing is a core feature, or switch to `setWindow()` for inexact alarms.

```kotlin
// Check if your app can schedule exact alarms
val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
if (alarmManager.canScheduleExactAlarms()) {
    alarmManager.setExactAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP,
        triggerAtMillis,
        pendingIntent
    )
} else {
    // Fall back to inexact alarm or guide user to settings
    alarmManager.setWindow(
        AlarmManager.RTC_WAKEUP,
        triggerAtMillis,
        windowLengthMillis,
        pendingIntent
    )
}
```

If your app is an alarm clock or calendar, use `USE_EXACT_ALARM`. For everything else — syncing data, periodic checks, background refreshes — use WorkManager with constraints or inexact alarms.

#### Q17: How do you reduce battery usage from background work in an Android app?

Battery drain from background work comes from these sources:
- **Network** — batch network requests instead of sending them one by one. Use WorkManager with `NetworkType.UNMETERED` for bulk transfers. Use `Cache-Control` headers and compress payloads.
- **CPU** — limit background work frequency. Use WorkManager with appropriate intervals rather than `AlarmManager` for periodic tasks. Avoid tight loops in background services.
- **Location** — use the fused location provider, not raw GPS. Request the coarsest accuracy level your feature can tolerate (`PRIORITY_LOW_POWER` over `PRIORITY_HIGH_ACCURACY`). Remove location updates when the user navigates away.
- **Wake locks** — avoid them if possible. If needed, use the shortest timeout and release in a `finally` block. WorkManager manages wake locks automatically.
- **Callbacks** — register and unregister callbacks, listeners, and observers properly. A broadcast receiver that stays registered in the background keeps your app's process alive. Use lifecycle-aware components.

#### Q18: What is the difference between `Worker`, `CoroutineWorker`, and `ListenableWorker` in WorkManager?

- **`Worker`** — the simplest option. It provides a synchronous `doWork()` method that runs on a background thread from WorkManager's internal executor. You return `Result.success()`, `Result.failure()`, or `Result.retry()`.
- **`CoroutineWorker`** — provides a `suspend fun doWork()` that runs on `Dispatchers.Default` by default. This is the modern choice for Kotlin apps. You can call suspend functions and switch dispatchers naturally. It's built on top of `ListenableWorker`.
- **`ListenableWorker`** — the base class with full control. It provides `startWork()` which returns a `ListenableFuture<Result>`. You manage your own threading. Used when integrating with callback-based APIs or Java libraries.

```kotlin
// CoroutineWorker — the standard choice for Kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return withContext(Dispatchers.IO) {
            try {
                repository.syncData()
                Result.success()
            } catch (e: IOException) {
                if (runAttemptCount < 3) Result.retry()
                else Result.failure()
            }
        }
    }
}
```

Use `CoroutineWorker` for almost everything. Use `Worker` for pure Java codebases. Use `ListenableWorker` for advanced cases where you need full control over async execution.

### Common Follow-ups

- What is the difference between `Dispatchers.IO` and `Dispatchers.Default` in coroutines?
- How does `Dispatchers.Main.immediate` differ from `Dispatchers.Main`?
- What happens if you don't call `startForeground()` within 5 seconds of `startForegroundService()`?
- How would you implement a periodic sync that respects battery optimization?
- What are the App Standby Buckets and how do they affect your background work?
- How does `WorkManager.enqueueUniqueWork()` prevent duplicate work?
- What's the difference between `Worker` and `CoroutineWorker`?
- How do you test WorkManager workers?
