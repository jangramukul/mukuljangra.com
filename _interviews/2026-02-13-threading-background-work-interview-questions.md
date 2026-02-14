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

Threading and background work come up in almost every Android interview. This covers the main thread, Handler/Looper, WorkManager, foreground services, Doze mode, and how Android restricts background execution.

#### What is the main thread in Android and why can't you block it?

The main thread is the UI thread. It is created when the app process starts and runs a `Looper` that handles all UI events — touch, drawing, layout, animations. Android's UI toolkit is not thread-safe, so views can only be updated from this thread. If you block it for more than 5 seconds, the system shows an ANR dialog. At 60fps, each frame has about 16ms. Any work that takes longer causes dropped frames. Network calls, database queries, and heavy computation must run on background threads.

#### What is an ANR and how do you diagnose it?

ANR stands for Application Not Responding. The system triggers it when the main thread is blocked too long:
- 5 seconds for input events (touch or key press)
- 5 seconds for `BroadcastReceiver.onReceive()` (10 seconds for foreground broadcasts)
- 20 seconds for `Service.onStartCommand()` or `Service.onCreate()`

When an ANR happens, the system writes a stack trace to `/data/anr/traces.txt`. In production, ANR data shows up in Google Play Console's Android Vitals. Common causes include synchronous disk I/O on the main thread (`SharedPreferences.commit()`, database queries), blocking on a lock held by another thread, and `SharedPreferences.apply()` pending writes blocking `Activity.onPause()` through `QueuedWork.waitToFinish()`.

#### What are Handler, Looper, and MessageQueue?

These three form Android's message-passing mechanism. A `Looper` runs an infinite loop on a thread, pulling messages from its `MessageQueue`. The `MessageQueue` is a priority queue of `Message` objects sorted by timestamp. A `Handler` is tied to a specific `Looper` — it posts messages to the queue and handles them when dispatched. The main thread gets its `Looper` set up automatically by `ActivityThread.main()`.

```kotlin
// Simplified version of what the main thread does
class ActivityThread {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            Looper.prepareMainLooper()
            Looper.loop() // blocks forever, processing messages
        }
    }
}

// Posting work to the main thread from a background thread
val mainHandler = Handler(Looper.getMainLooper())
mainHandler.post {
    textView.text = "Updated from background"
}
```

Everything on the main thread — `onCreate()`, `onDraw()`, click listeners, coroutine continuations on `Dispatchers.Main` — runs as messages through this `Looper`.

#### What is WorkManager and when should you use it?

WorkManager is a Jetpack library for scheduling deferrable, guaranteed background work. "Guaranteed" means the work will execute even if the app exits or the device restarts — WorkManager persists requests in a Room database internally. "Deferrable" means it doesn't need to run at an exact moment. It delegates to `JobScheduler` on API 23+ or `AlarmManager` with `BroadcastReceiver` on older versions. I use it for tasks like uploading logs, syncing data, processing images — anything that must complete eventually but doesn't need to happen right now.

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

#### What is the difference between WorkManager, AlarmManager, and foreground services?

They solve different problems:
- **WorkManager** — deferrable guaranteed work. Respects battery optimization and Doze mode. Best for syncing, uploads, cleanup tasks.
- **AlarmManager** — exact or near-exact timing. Alarm clocks, scheduled reminders, calendar notifications. From Android 12, exact alarms need the `SCHEDULE_EXACT_ALARM` permission.
- **Foreground services** — ongoing user-visible work like music playback, navigation, or downloads with a progress notification. They show a persistent notification and are harder for the system to kill.

If work can be deferred, WorkManager is almost always the right choice.

#### What are the different types of work requests in WorkManager?

Two types:
- `OneTimeWorkRequest` — runs once. Uploading a file, syncing data, processing an image.
- `PeriodicWorkRequest` — runs repeatedly at intervals. Periodic sync, cache cleanup, analytics batches. Minimum interval is 15 minutes.

You can chain requests using `beginWith()` and `then()`. WorkManager runs them in order and passes output data between workers. If any worker in a chain fails, dependent workers don't execute.

#### What is the difference between Worker, CoroutineWorker, and ListenableWorker?

- **`Worker`** — synchronous `doWork()` on a background thread from WorkManager's executor. Simplest option. Return `Result.success()`, `Result.failure()`, or `Result.retry()`.
- **`CoroutineWorker`** — `suspend fun doWork()` that runs on `Dispatchers.Default`. The standard choice for Kotlin. You can call suspend functions and switch dispatchers naturally.
- **`ListenableWorker`** — base class. Returns `ListenableFuture<Result>` from `startWork()`. You manage threading yourself. Used for callback-based APIs or Java libraries.

```kotlin
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

Use `CoroutineWorker` for almost everything in Kotlin projects.

#### What happens to WorkManager tasks when the device reboots?

WorkManager persists work requests in a Room database. After reboot, a `BootCompletedBroadcastReceiver` registered internally by WorkManager re-schedules all pending work. The original constraints are preserved. If a request needed Wi-Fi and there's no Wi-Fi after reboot, the work waits. This is what makes WorkManager different from raw threads or coroutines — those are gone when the process dies.

#### What is Doze mode and how does it affect background work?

Doze mode is a power-saving feature introduced in Android 6.0. The system enters Doze when the device is stationary, unplugged, and screen-off for a period of time. In Doze mode:
- Network access is deferred
- Wake locks are ignored
- `AlarmManager` alarms are deferred (except `setAlarmClock()` and `setAndAllowWhileIdle()`)
- Wi-Fi scans, sync adapters, and `JobScheduler` jobs are stopped

The system exits Doze periodically during maintenance windows where pending work can run. These windows get less frequent the longer the device stays idle. WorkManager respects Doze — work requests wait until a maintenance window. FCM high-priority messages can temporarily lift Doze restrictions.

App Standby Buckets are the per-app version. Apps are sorted into buckets (Active, Working Set, Frequent, Rare, Restricted) based on usage. Each bucket has different throttling levels for jobs and alarms.

#### How did background work restrictions evolve across Android versions?

Before Android 6.0, background services were unrestricted. Here's the timeline:
- **Android 6.0 (API 23)** — Doze mode and App Standby
- **Android 7.0 (API 24)** — Doze on the go (activates even when device is moving)
- **Android 8.0 (API 26)** — background service limits. `startService()` throws `IllegalStateException` if app is in background. Must use `startForegroundService()` and call `startForeground()` within 5 seconds
- **Android 10 (API 29)** — restricted launching activities from background
- **Android 12 (API 31)** — restricted foreground service starts from background. Required `SCHEDULE_EXACT_ALARM` for exact alarms
- **Android 14 (API 34)** — foreground service type requirements

Each version tightened restrictions for better battery life.

#### What are the foreground service type requirements in Android 14?

Android 14 requires declaring the specific type in the manifest using `android:foregroundServiceType`. Types include `camera`, `connectedDevice`, `dataSync`, `health`, `location`, `mediaPlayback`, `mediaProjection`, `microphone`, `phoneCall`, `remoteMessaging`, `shortService`, `specialUse`, and `systemExempted`. When starting the service, you pass the matching type to `startForeground()`.

```kotlin
// Manifest: android:foregroundServiceType="location"
class LocationTrackingService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification()
        startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        )
        return START_STICKY
    }
}
```

Each type requires specific permissions. The `location` type needs `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`. Missing the permission at runtime throws a `SecurityException`. The `dataSync` type is being deprecated in favor of WorkManager.

#### What is HandlerThread and when would you use it?

`HandlerThread` is a thread with its own `Looper` already set up. A regular `Thread` has no `Looper`, so you can't post messages to it. `HandlerThread` calls `Looper.prepare()` and `Looper.loop()` for you. I'd use it for a dedicated background thread that processes tasks sequentially — logging, serial database writes, camera preview processing.

```kotlin
val backgroundThread = HandlerThread("DatabaseWriter").apply { start() }
val dbHandler = Handler(backgroundThread.looper)

dbHandler.post { database.insertLog(logEntry1) }
dbHandler.post { database.insertLog(logEntry2) }

backgroundThread.quitSafely()
```

The advantage over a thread pool is ordering — one task at a time, in order. The disadvantage is throughput. In modern Android, `Dispatchers.Default.limitedParallelism(1)` achieves the same thing with coroutines.

#### What is Expedited Work in WorkManager?

Expedited Work was added in WorkManager 2.7.0 for tasks that should start as soon as possible. It uses a quota system — the OS gives each app execution time, and expedited work runs immediately as long as quota is available. When quota runs out, the `OutOfQuotaPolicy` decides what happens.

```kotlin
val urgentSync = OneTimeWorkRequestBuilder<SyncWorker>()
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .build()

WorkManager.getInstance(context).enqueue(urgentSync)
```

On API 31+, it maps to `JobScheduler` expedited jobs. On older APIs, it falls back to a foreground service. `RUN_AS_NON_EXPEDITED_WORK_REQUEST` downgrades to regular scheduling when quota runs out. `DROP_WORK_REQUEST` cancels the work entirely. Use cases include payment processing, time-sensitive messages, or user-initiated exports.

#### How would you handle a long-running upload that survives process death?

Use WorkManager with a `CoroutineWorker` that calls `setForeground()`. This promotes the work to a foreground service internally and shows a progress notification.

```kotlin
class FileUploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val fileUri = inputData.getString("file_uri")
            ?: return Result.failure()

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

If the process is killed mid-upload, WorkManager restarts the worker. The upload should support resuming — use HTTP range requests or chunked uploads so it doesn't start from zero.

#### How does WorkManager decide which scheduling mechanism to use?

WorkManager uses a `Scheduler` abstraction internally:
- API 23+: `SystemJobScheduler` delegates to `JobScheduler`
- API 14-22: `SystemAlarmScheduler` combines `AlarmManager` with `BroadcastReceiver`
- A `GreedyScheduler` runs work immediately if all constraints are already met

WorkManager picks the right scheduler based on API level and constraints. It stores work specs, statuses, and output data in a Room database (`WorkDatabase`). This is how it survives process death and reboots.

#### How does MessageQueue work at the native level?

`MessageQueue.next()` blocks when the queue is empty, but it doesn't spin-wait. It uses Linux's `epoll` through native code. When there are no messages, `nativePollOnce()` calls `epoll_wait()` on a pipe file descriptor. This puts the thread to sleep at the kernel level — zero CPU usage. When a new message is posted via `enqueueMessage()`, it calls `nativeWake()`, writing a byte to the pipe. This wakes up `epoll_wait()` and the `Looper` resumes. The main thread is either processing a message or sleeping efficiently.

#### What is the difference between a Service and an IntentService?

A `Service` runs on the main thread by default. If you do heavy work in `onStartCommand()`, you'll block the UI. You have to manage your own background thread. An `IntentService` (now deprecated) created a worker thread automatically and processed intents sequentially in `onHandleIntent()`. It stopped itself when the queue was empty.

In modern Android, I'd use a `CoroutineWorker` with WorkManager instead of either. If I need a running service for user-visible work, I'd use a foreground service with a coroutine scope tied to the service lifecycle.

#### How do you prevent duplicate work in WorkManager?

Use `enqueueUniqueWork()` for one-time requests or `enqueueUniquePeriodicWork()` for periodic ones. You provide a unique name and a policy:
- `ExistingWorkPolicy.KEEP` — if work with this name is already enqueued or running, keep it and ignore the new request
- `ExistingWorkPolicy.REPLACE` — cancel the existing work and enqueue the new one
- `ExistingWorkPolicy.APPEND` — chain the new work after the existing one

```kotlin
WorkManager.getInstance(context).enqueueUniqueWork(
    "data_sync",
    ExistingWorkPolicy.KEEP,
    syncRequest
)
```

This is important for things like data sync where you don't want multiple sync workers running at the same time.

#### What are the exact alarm restrictions in Android 12+?

Before Android 12, any app could schedule exact alarms. The restrictions evolved:
- **Android 12 (API 31)** — `SCHEDULE_EXACT_ALARM` permission, auto-granted on install
- **Android 13 (API 33)** — users can revoke it from Settings
- **Android 14 (API 34)** — alarm clocks and calendars should use `USE_EXACT_ALARM` (auto-granted, not revocable). Everything else should use `setWindow()` for inexact alarms

```kotlin
val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
if (alarmManager.canScheduleExactAlarms()) {
    alarmManager.setExactAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP,
        triggerAtMillis,
        pendingIntent
    )
} else {
    alarmManager.setWindow(
        AlarmManager.RTC_WAKEUP,
        triggerAtMillis,
        windowLengthMillis,
        pendingIntent
    )
}
```

For syncing data, periodic checks, or background refreshes — use WorkManager, not exact alarms.

#### How do you observe WorkManager progress and status from the UI?

Use `WorkManager.getWorkInfoByIdLiveData()` or `getWorkInfoByIdFlow()` to observe a work request. The `WorkInfo` object gives you the state (`ENQUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `BLOCKED`, `CANCELLED`) and any progress data set by the worker.

```kotlin
WorkManager.getInstance(context)
    .getWorkInfoByIdFlow(uploadRequest.id)
    .collect { workInfo ->
        when (workInfo.state) {
            WorkInfo.State.RUNNING -> {
                val progress = workInfo.progress.getInt("progress", 0)
                updateProgressBar(progress)
            }
            WorkInfo.State.SUCCEEDED -> showUploadComplete()
            WorkInfo.State.FAILED -> showError()
            else -> { }
        }
    }
```

For unique work, use `getWorkInfosForUniqueWorkFlow()` with the unique work name.

#### How do you reduce battery drain from background work?

Battery drain from background work comes from a few sources:
- **Network** — batch requests instead of sending one by one. Use WorkManager with `NetworkType.UNMETERED` for bulk transfers. Compress payloads.
- **CPU** — limit background work frequency. Use WorkManager with appropriate intervals. Avoid tight loops in services.
- **Location** — use the fused location provider, not raw GPS. Request the coarsest accuracy your feature needs. Remove updates when the user navigates away.
- **Wake locks** — avoid if possible. If needed, use the shortest timeout and release in a `finally` block. WorkManager manages wake locks automatically.
- **Listeners** — register and unregister properly. A broadcast receiver that stays registered in the background keeps your process alive. Use lifecycle-aware components.

### Common Follow-ups

- What is the difference between `Dispatchers.IO` and `Dispatchers.Default`?
- How does `Dispatchers.Main.immediate` differ from `Dispatchers.Main`?
- What happens if you don't call `startForeground()` within 5 seconds of `startForegroundService()`?
- How would you implement a periodic sync that respects battery optimization?
- What are the App Standby Buckets and how do they affect background work?
- How do you test WorkManager workers?
- What is the difference between `startService()` and `bindService()`?
- How does `WorkManager.cancelUniqueWork()` behave if the worker is already running?
