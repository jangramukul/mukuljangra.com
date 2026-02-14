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

This is one of those Android topics that keeps evolving. Every couple of years, Google tightens the screws on what your app can do in the background, and the rules shift under your feet. This covers the main thread, Handler/Looper, WorkManager, foreground services, Doze mode, and how Android restricts background execution.

#### What is the main thread in Android and why can't you block it?

Think of the main thread as the single cashier at a busy store. Every customer (touch event, screen draw, animation frame) has to go through that one cashier. If someone walks up and asks a complicated question that takes five minutes, the entire line freezes. That's exactly what happens when you block the main thread.

It's created when the app process starts and runs a `Looper` that handles all UI events -- touch, drawing, layout, animations. Android's UI toolkit is not thread-safe, so views can only be updated from this thread. Block it for more than 5 seconds and the system shows an ANR dialog. At 60fps, each frame gets about 16ms. Network calls, database queries, heavy computation -- all of that goes on background threads, no exceptions.

#### What is an ANR and how do you diagnose it?

ANR stands for Application Not Responding. It's Android's way of saying "your main thread fell asleep at the wheel." The system triggers it when the main thread is blocked too long:

- 5 seconds for input events (touch or key press)
- 5 seconds for `BroadcastReceiver.onReceive()` (10 seconds for foreground broadcasts)
- 20 seconds for `Service.onStartCommand()` or `Service.onCreate()`

When an ANR happens, the system writes a stack trace to `/data/anr/traces.txt`. In production, ANR data shows up in Google Play Console's Android Vitals. The usual suspects? Synchronous disk I/O on the main thread (`SharedPreferences.commit()`, database queries), blocking on a lock held by another thread, and -- here's a sneaky one -- `SharedPreferences.apply()` pending writes blocking `Activity.onPause()` through `QueuedWork.waitToFinish()`.

#### What are Handler, Looper, and MessageQueue?

These three are like a post office system for a thread. The `Looper` is the mail carrier who runs an infinite route, pulling letters from the `MessageQueue` -- which is really a priority queue of `Message` objects sorted by timestamp. The `Handler` is the mailbox: it's tied to a specific `Looper`, drops messages into the queue, and processes them when they arrive. The main thread gets its `Looper` set up automatically by `ActivityThread.main()`.

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

Here's what trips people up: everything on the main thread -- `onCreate()`, `onDraw()`, click listeners, coroutine continuations on `Dispatchers.Main` -- all of it runs as messages through this `Looper`. There's no magic separate channel for lifecycle callbacks. It's all the same queue.

#### What is WorkManager and when should you use it?

WorkManager is the "I don't care when, just make sure it gets done" tool. It's a Jetpack library for scheduling deferrable, guaranteed background work. "Guaranteed" means the work will execute even if the app exits or the device restarts -- WorkManager persists requests in a Room database internally. "Deferrable" means it doesn't need to run at an exact moment.

Think of it like dropping a letter at the post office vs. hand-delivering it yourself. You don't control exactly when it arrives, but it will get there. Under the hood, it delegates to `JobScheduler` on API 23+ or `AlarmManager` with `BroadcastReceiver` on older versions. I use it for uploading logs, syncing data, processing images -- anything that must complete eventually but doesn't need to happen right now.

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

They solve completely different problems, and mixing them up is a common mistake:

- **WorkManager** -- deferrable guaranteed work. Respects battery optimization and Doze mode. Best for syncing, uploads, cleanup tasks. Think "do it sometime, but definitely do it."
- **AlarmManager** -- exact or near-exact timing. Alarm clocks, scheduled reminders, calendar notifications. Think "wake me up at exactly 7 AM." From Android 12, exact alarms need the `SCHEDULE_EXACT_ALARM` permission.
- **Foreground services** -- ongoing user-visible work like music playback, navigation, or downloads with a progress notification. They show a persistent notification and are harder for the system to kill. Think "I'm actively doing something the user can see."

If work can be deferred, WorkManager is almost always the right choice.

#### What are the different types of work requests in WorkManager?

Two types:

- `OneTimeWorkRequest` -- runs once. Uploading a file, syncing data, processing an image.
- `PeriodicWorkRequest` -- runs repeatedly at intervals. Periodic sync, cache cleanup, analytics batches. Minimum interval is 15 minutes.

You can chain requests using `beginWith()` and `then()`, like an assembly line. WorkManager runs them in order and passes output data between workers. If any worker in a chain fails, dependent workers don't execute -- the whole pipeline stops.

#### What is the difference between Worker, CoroutineWorker, and ListenableWorker?

- **`Worker`** -- synchronous `doWork()` on a background thread from WorkManager's executor. The simplest option, like a basic blocking function. Return `Result.success()`, `Result.failure()`, or `Result.retry()`.
- **`CoroutineWorker`** -- `suspend fun doWork()` that runs on `Dispatchers.Default`. This is the standard choice for Kotlin. You can call suspend functions and switch dispatchers naturally. It's the one you'll reach for 90% of the time.
- **`ListenableWorker`** -- the base class. Returns `ListenableFuture<Result>` from `startWork()`. You manage threading yourself. Used for callback-based APIs or Java libraries where you need full control.

> **🧠 Think about it:** If `CoroutineWorker` runs on `Dispatchers.Default`, what do you need to do when performing network or disk I/O inside `doWork()`?

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

You switch to `Dispatchers.IO` since the default dispatcher is meant for CPU work, not blocking I/O. Use `CoroutineWorker` for almost everything in Kotlin projects.

#### What happens to WorkManager tasks when the device reboots?

This is where WorkManager really earns its "guaranteed" label. It persists work requests in a Room database. After reboot, a `BootCompletedBroadcastReceiver` registered internally by WorkManager re-schedules all pending work. The original constraints are preserved -- if a request needed Wi-Fi and there's no Wi-Fi after reboot, the work just waits patiently.

This is what makes WorkManager fundamentally different from raw threads or coroutines. Those are gone the moment the process dies. WorkManager's work survives because it's written to disk, not held in memory.

#### What is Doze mode and how does it affect background work?

Imagine your phone is a factory. Doze mode is the night shift manager who turns off the lights and locks the doors when nobody's working. It's a power-saving feature introduced in Android 6.0. The system enters Doze when the device is stationary, unplugged, and screen-off for a period of time. In Doze mode:

- Network access is deferred
- Wake locks are ignored
- `AlarmManager` alarms are deferred (except `setAlarmClock()` and `setAndAllowWhileIdle()`)
- Wi-Fi scans, sync adapters, and `JobScheduler` jobs are stopped

The system exits Doze periodically during maintenance windows where pending work can run. Here's the catch -- these windows get less frequent the longer the device stays idle. WorkManager respects Doze, so work requests wait until a maintenance window. FCM high-priority messages can temporarily lift Doze restrictions.

App Standby Buckets are the per-app version. Apps are sorted into buckets (Active, Working Set, Frequent, Rare, Restricted) based on usage. Each bucket has different throttling levels for jobs and alarms. An app you use daily gets more generous treatment than one you opened once last month.

#### How did background work restrictions evolve across Android versions?

Before Android 6.0, background services were unrestricted -- it was the wild west. Here's how Google gradually tightened things up:

- **Android 6.0 (API 23)** -- Doze mode and App Standby
- **Android 7.0 (API 24)** -- Doze on the go (activates even when device is moving)
- **Android 8.0 (API 26)** -- background service limits. `startService()` throws `IllegalStateException` if app is in background. Must use `startForegroundService()` and call `startForeground()` within 5 seconds
- **Android 10 (API 29)** -- restricted launching activities from background
- **Android 12 (API 31)** -- restricted foreground service starts from background. Required `SCHEDULE_EXACT_ALARM` for exact alarms
- **Android 14 (API 34)** -- foreground service type requirements

Each version tightened restrictions for better battery life. The trend is clear: if you're not doing something the user explicitly asked for, Android wants you to sit down and be quiet.

#### What are the foreground service type requirements in Android 14?

Android 14 requires you to declare exactly what your foreground service is doing -- no more vague "I'm a service, trust me." You declare the type in the manifest using `android:foregroundServiceType`. Types include `camera`, `connectedDevice`, `dataSync`, `health`, `location`, `mediaPlayback`, `mediaProjection`, `microphone`, `phoneCall`, `remoteMessaging`, `shortService`, `specialUse`, and `systemExempted`. When starting the service, you pass the matching type to `startForeground()`.

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

Each type requires specific permissions. The `location` type needs `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`. Missing the permission at runtime throws a `SecurityException`. Worth noting: the `dataSync` type is being deprecated in favor of WorkManager.

#### What is HandlerThread and when would you use it?

`HandlerThread` is a thread that comes with its own `Looper` pre-installed. Think of a regular `Thread` like a blank room -- you can do work in it, but there's no mailbox for receiving messages. `HandlerThread` is the same room but with a mailbox (`Looper.prepare()`) and a mail carrier already running (`Looper.loop()`).

I'd use it for a dedicated background thread that processes tasks sequentially -- logging, serial database writes, camera preview processing. One task at a time, in the order they arrived.

```kotlin
val backgroundThread = HandlerThread("DatabaseWriter").apply { start() }
val dbHandler = Handler(backgroundThread.looper)

dbHandler.post { database.insertLog(logEntry1) }
dbHandler.post { database.insertLog(logEntry2) }

backgroundThread.quitSafely()
```

The advantage over a thread pool is ordering -- strict FIFO, guaranteed. The disadvantage is throughput since everything is single-threaded. In modern Android, `Dispatchers.Default.limitedParallelism(1)` achieves the same thing with coroutines.

#### What is Expedited Work in WorkManager?

Expedited Work was added in WorkManager 2.7.0 for tasks that should start as soon as possible. It's like a priority lane at the airport -- you skip the regular queue, but only as long as you have a boarding pass (quota). The OS gives each app execution time, and expedited work runs immediately as long as quota is available. When quota runs out, the `OutOfQuotaPolicy` decides what happens.

```kotlin
val urgentSync = OneTimeWorkRequestBuilder<SyncWorker>()
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .build()

WorkManager.getInstance(context).enqueue(urgentSync)
```

On API 31+, it maps to `JobScheduler` expedited jobs. On older APIs, it falls back to a foreground service. `RUN_AS_NON_EXPEDITED_WORK_REQUEST` downgrades to regular scheduling when quota runs out. `DROP_WORK_REQUEST` cancels the work entirely. Use cases include payment processing, time-sensitive messages, or user-initiated exports.

> **🧠 Think about it:** If expedited work falls back to a foreground service on older APIs, what does that mean your `CoroutineWorker` needs to provide?

It means you need to override `getForegroundInfo()` so WorkManager can show a notification. Without it, the fallback crashes on pre-API 31 devices.

#### How would you handle a long-running upload that survives process death?

Use WorkManager with a `CoroutineWorker` that calls `setForeground()`. This promotes the work to a foreground service internally and shows a progress notification. It's like telling the system "hey, the user is watching this, don't kill me."

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

If the process is killed mid-upload, WorkManager restarts the worker. But here's the important part: the upload should support resuming. Use HTTP range requests or chunked uploads so it doesn't start from zero. WorkManager handles the retry, but your server needs to handle partial uploads.

#### How does WorkManager decide which scheduling mechanism to use?

WorkManager uses a `Scheduler` abstraction internally, and it picks the right one so you don't have to think about API levels:

- API 23+: `SystemJobScheduler` delegates to `JobScheduler`
- API 14-22: `SystemAlarmScheduler` combines `AlarmManager` with `BroadcastReceiver`
- A `GreedyScheduler` runs work immediately if all constraints are already met

It stores work specs, statuses, and output data in a Room database (`WorkDatabase`). This is how it survives process death and reboots -- everything is persisted to SQLite, not held in memory.

#### How does MessageQueue work at the native level?

This is one of those "how deep does the rabbit hole go" questions. `MessageQueue.next()` blocks when the queue is empty, but it doesn't spin-wait -- that would be a CPU nightmare. Instead, it uses Linux's `epoll` through native code.

When there are no messages, `nativePollOnce()` calls `epoll_wait()` on a pipe file descriptor. This puts the thread to sleep at the kernel level -- zero CPU usage. When a new message is posted via `enqueueMessage()`, it calls `nativeWake()`, writing a byte to the pipe. This wakes up `epoll_wait()` and the `Looper` resumes. So the main thread is always doing one of two things: processing a message or sleeping efficiently. It's never wasting cycles waiting.

#### What is the difference between a Service and an IntentService?

A `Service` runs on the main thread by default. Yeah, that surprises people. If you do heavy work in `onStartCommand()`, you'll block the UI. You have to manage your own background thread.

An `IntentService` (now deprecated) was the "just handle it for me" version. It created a worker thread automatically and processed intents sequentially in `onHandleIntent()`. When the queue was empty, it stopped itself. Think of it like a `Service` with a built-in `HandlerThread`.

In modern Android, I'd use a `CoroutineWorker` with WorkManager instead of either. If I need a running service for user-visible work, I'd use a foreground service with a coroutine scope tied to the service lifecycle.

#### How do you prevent duplicate work in WorkManager?

Use `enqueueUniqueWork()` for one-time requests or `enqueueUniquePeriodicWork()` for periodic ones. You provide a unique name and a policy:

- `ExistingWorkPolicy.KEEP` -- if work with this name is already enqueued or running, keep it and ignore the new request
- `ExistingWorkPolicy.REPLACE` -- cancel the existing work and enqueue the new one
- `ExistingWorkPolicy.APPEND` -- chain the new work after the existing one

```kotlin
WorkManager.getInstance(context).enqueueUniqueWork(
    "data_sync",
    ExistingWorkPolicy.KEEP,
    syncRequest
)
```

This is critical for things like data sync. Without unique work, every time the user opens the app, you'd queue another sync -- and suddenly you have five sync workers fighting over the same database.

> **🧠 Think about it:** If you use `APPEND` and the existing work has already failed, what happens to the appended work?

It gets cancelled too. A failed work chain stays failed. If you want the appended work to run regardless, use `APPEND_OR_REPLACE` instead.

#### What are the exact alarm restrictions in Android 12+?

Before Android 12, any app could schedule exact alarms. That was a battery drain free-for-all. The restrictions evolved:

- **Android 12 (API 31)** -- `SCHEDULE_EXACT_ALARM` permission, auto-granted on install
- **Android 13 (API 33)** -- users can revoke it from Settings
- **Android 14 (API 34)** -- alarm clocks and calendars should use `USE_EXACT_ALARM` (auto-granted, not revocable). Everything else should use `setWindow()` for inexact alarms

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

For syncing data, periodic checks, or background refreshes -- use WorkManager, not exact alarms. Exact alarms are for things the user explicitly expects at a specific time.

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

For unique work, use `getWorkInfosForUniqueWorkFlow()` with the unique work name. It's reactive -- your UI stays in sync with the worker's progress without polling.

#### How do you reduce battery drain from background work?

Battery drain from background work usually comes from one of these culprits:

- **Network** -- batch requests instead of sending one by one. Use WorkManager with `NetworkType.UNMETERED` for bulk transfers. Compress payloads. Every radio wake-up costs battery, so fewer larger requests beat many small ones.
- **CPU** -- limit background work frequency. Use WorkManager with appropriate intervals. Avoid tight loops in services.
- **Location** -- use the fused location provider, not raw GPS. Request the coarsest accuracy your feature needs. Remove updates when the user navigates away. GPS is one of the biggest battery hogs on any phone.
- **Wake locks** -- avoid if possible. If needed, use the shortest timeout and release in a `finally` block. WorkManager manages wake locks automatically, which is yet another reason to prefer it.
- **Listeners** -- register and unregister properly. A broadcast receiver that stays registered in the background keeps your process alive. Use lifecycle-aware components.

### Common Follow-ups

- What is the difference between `Dispatchers.IO` and `Dispatchers.Default`?
- How does `Dispatchers.Main.immediate` differ from `Dispatchers.Main`?
- What happens if you don't call `startForeground()` within 5 seconds of `startForegroundService()`?
- How would you implement a periodic sync that respects battery optimization?
- What are the App Standby Buckets and how do they affect background work?
- How do you test WorkManager workers?
- What is the difference between `startService()` and `bindService()`?
- How does `WorkManager.cancelUniqueWork()` behave if the worker is already running?
