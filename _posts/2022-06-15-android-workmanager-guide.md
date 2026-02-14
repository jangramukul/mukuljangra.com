---
title: Android WorkManager Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Performance
---

The first time I needed to sync data reliably in the background — not just "fire and forget" but actually guaranteed delivery — I went through an embarrassing number of approaches. `AlarmManager` with a `BroadcastReceiver`? Works until Doze mode kills it. `JobScheduler`? Only available on API 21+, and the API is verbose. Firebase `JobDispatcher`? Google deprecated it almost as fast as they shipped it. The Android team kept building background execution primitives, and the OS kept getting more aggressive about killing them to save battery.

WorkManager was Google's answer to this fragmentation. It's a single API that picks the right underlying mechanism — `JobScheduler` on API 23+, `AlarmManager` + `BroadcastReceiver` on older versions — and gives you guarantees that the other approaches couldn't. Your work will execute even if the app is killed, the device reboots, or the user force-stops the app (with some caveats). For any work that needs to be *reliably* completed — syncing data to a server, uploading logs, processing images — WorkManager is the right tool.

## Defining a Worker

The basic `Worker` class has a synchronous `doWork()` that runs on a background thread from WorkManager's `Executor`. `CoroutineWorker` is the modern choice — its `doWork()` is a suspend function, so you can call other suspend functions directly. `RxWorker` provides an RxJava `Single` for teams still on reactive streams. For new code, `CoroutineWorker` is what you want.

Under the hood, `CoroutineWorker` runs `doWork()` on `Dispatchers.Default`, which means it's already off the main thread. If you need a different dispatcher (like `Dispatchers.IO` for network calls), you can switch inside `doWork()` with `withContext`.

```kotlin
class OrderSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val orderId = inputData.getString("order_id")
            ?: return Result.failure()

        return try {
            val repository = OrderRepository.getInstance(applicationContext)
            val localOrder = repository.getLocalOrder(orderId)
                ?: return Result.failure()

            repository.syncToServer(localOrder)
            Result.success()
        } catch (e: IOException) {
            // Network error — retry with exponential backoff
            Result.retry()
        } catch (e: Exception) {
            // Non-recoverable error — don't retry
            Result.failure(workDataOf("error" to e.message))
        }
    }
}
```

`CoroutineWorker` is the modern choice over the basic `Worker` class. The difference is that `doWork()` is a suspend function, so you can call other suspend functions directly without managing your own coroutine scope. Under the hood, `CoroutineWorker` runs `doWork()` on `Dispatchers.Default`, which means it's already off the main thread.

The three return values — `Result.success()`, `Result.failure()`, and `Result.retry()` — control what happens next. `success()` marks the work as complete. `failure()` marks it as permanently failed — WorkManager won't retry it. `retry()` tells WorkManager to reschedule the work according to the retry policy. Getting the distinction between `failure()` and `retry()` right is crucial. A 404 from the server means the resource doesn't exist — that's a `failure()`. A timeout or connection error means the server might be temporarily down — that's a `retry()`.

## Constraints — Running at the Right Time

One of WorkManager's best features is constraints. Instead of running immediately and hoping conditions are favorable, you declare what conditions are needed, and WorkManager waits until they're met.

```kotlin
class PhotoUploadScheduler(
    private val context: Context
) {

    fun scheduleUpload(photoId: String) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)  // WiFi only
            .setRequiresBatteryNotLow(true)
            .setRequiresStorageNotLow(true)
            .build()

        val uploadRequest = OneTimeWorkRequestBuilder<PhotoUploadWorker>()
            .setConstraints(constraints)
            .setInputData(workDataOf("photo_id" to photoId))
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .addTag("photo_upload")
            .build()

        WorkManager.getInstance(context)
            .enqueueUniqueWork(
                "upload_$photoId",
                ExistingWorkPolicy.KEEP,  // Don't duplicate if already queued
                uploadRequest
            )
    }
}
```

`setRequiredNetworkType(NetworkType.UNMETERED)` means the work waits for WiFi. `setRequiresBatteryNotLow(true)` means it won't run when the battery is low. These constraints are checked before execution and re-checked if the work is interrupted. If a user leaves WiFi mid-upload, WorkManager pauses the work and reschedules it for when WiFi is available again.

The `enqueueUniqueWork` call with `ExistingWorkPolicy.KEEP` is important for preventing duplicate work. Without it, calling `scheduleUpload("photo-123")` three times would queue three separate uploads for the same photo. With `KEEP`, the second and third calls are ignored because work with that unique name already exists. `REPLACE` would cancel the existing work and start fresh. `APPEND` would chain the new work after the existing work completes.

## Chaining Work — Sequential and Parallel

WorkManager supports chaining work requests into workflows. You can run tasks sequentially, in parallel, or in a combination of both.

```kotlin
class DataSyncManager(private val context: Context) {

    fun performFullSync() {
        val fetchUsersWork = OneTimeWorkRequestBuilder<FetchUsersWorker>()
            .addTag("sync")
            .build()

        val fetchOrdersWork = OneTimeWorkRequestBuilder<FetchOrdersWorker>()
            .addTag("sync")
            .build()

        val mergeWork = OneTimeWorkRequestBuilder<MergeDataWorker>()
            .addTag("sync")
            .build()

        val notifyWork = OneTimeWorkRequestBuilder<SyncCompleteNotificationWorker>()
            .addTag("sync")
            .build()

        WorkManager.getInstance(context)
            // Fetch users and orders in parallel
            .beginWith(listOf(fetchUsersWork, fetchOrdersWork))
            // Then merge the results (waits for both to complete)
            .then(mergeWork)
            // Then send a notification
            .then(notifyWork)
            .enqueue()
    }

    fun cancelSync() {
        WorkManager.getInstance(context).cancelAllWorkByTag("sync")
    }
}
```

When you pass a list to `beginWith()`, those work items run in parallel. The `then()` calls create sequential dependencies — `mergeWork` won't start until both fetch workers succeed. If any worker in the chain fails (returns `Result.failure()`), the downstream workers are cancelled. If a worker retries, the chain pauses and waits.

Data flows through chains via `inputData` and output data. Each worker can return data with `Result.success(workDataOf("key" to "value"))`, and the next worker in the chain receives it as its `inputData`. When parallel workers merge into a single downstream worker, the inputs are combined — but be careful with key collisions, because the last writer wins.

## Periodic Work — Repeating Reliably

For work that needs to run on a schedule — syncing data every 15 minutes, cleaning up cache files daily — WorkManager offers `PeriodicWorkRequest`. The minimum interval is 15 minutes, which is a system-level restriction to prevent apps from draining the battery.

```kotlin
class SyncScheduler(private val context: Context) {

    fun schedulePeriodicSync() {
        val syncRequest = PeriodicWorkRequestBuilder<DataSyncWorker>(
            repeatInterval = 1,
            repeatIntervalTimeUnit = TimeUnit.HOURS,
            flexInterval = 15,
            flexTimeUnit = TimeUnit.MINUTES
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(
                "periodic_sync",
                ExistingPeriodicWorkPolicy.KEEP,
                syncRequest
            )
    }
}
```

The flex interval is a commonly misunderstood parameter. A `repeatInterval` of 1 hour with a `flexInterval` of 15 minutes means WorkManager will try to run the work during the last 15 minutes of each hour. This gives the system flexibility to batch your work with other apps' work, which is more battery-efficient. Without a flex interval, WorkManager tries to run at the exact repeat interval, but the OS may still delay it for battery optimization.

Here's an honest caveat: periodic work is not precise. Doze mode, app standby, and manufacturer-specific battery optimizations can delay periodic work significantly — sometimes by hours on aggressive OEMs like Xiaomi, Huawei, and Samsung. If you need time-critical periodic work, WorkManager might not be the right tool. For most sync scenarios where "roughly every hour" is acceptable, it works well.

## Expedited Work — When It Can't Wait

For work that needs to start immediately and shouldn't be deferred by the system, WorkManager 2.7+ added expedited work. This is for user-initiated actions that the user expects to happen right now — completing a purchase, sending a message, uploading a document they just selected.

```kotlin
val urgentSync = OneTimeWorkRequestBuilder<PaymentConfirmationWorker>()
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .setInputData(workDataOf("payment_id" to paymentId))
    .build()

WorkManager.getInstance(context).enqueue(urgentSync)
```

Expedited work runs as a foreground service on Android 11 and below, and uses the JobScheduler's expedited job API on Android 12+. The `OutOfQuotaPolicy` determines what happens when the system's expedited work quota is exhausted — `RUN_AS_NON_EXPEDITED_WORK_REQUEST` falls back to regular execution, which is usually the right choice.

On Android 12+, your expedited Worker needs to override `getForegroundInfo()` to provide a notification, because the system may need to promote it to a foreground service under certain conditions. If you don't override this method, your work will crash on API 31+ when the system tries to show the foreground notification. This is one of those "read the migration guide carefully" moments.

## Testing Workers

WorkManager provides solid testing support through `WorkManagerTestInitHelper` and `TestListenableWorkerBuilder`. You can test workers in isolation without needing the full WorkManager infrastructure.

```kotlin
@RunWith(AndroidJUnit4::class)
class OrderSyncWorkerTest {

    @Test
    fun syncSucceeds_returnsSuccess() = runTest {
        val context = ApplicationProvider.getApplicationContext<Context>()

        val inputData = workDataOf("order_id" to "test-order-123")

        val worker = TestListenableWorkerBuilder<OrderSyncWorker>(context)
            .setInputData(inputData)
            .build()

        val result = worker.doWork()

        assertEquals(Result.success(), result)
    }

    @Test
    fun missingOrderId_returnsFailure() = runTest {
        val context = ApplicationProvider.getApplicationContext<Context>()

        val worker = TestListenableWorkerBuilder<OrderSyncWorker>(context)
            .setInputData(workDataOf())  // No order_id
            .build()

        val result = worker.doWork()

        assertEquals(Result.failure(), result)
    }
}
```

For testing chains, constraints, and scheduling behavior, use `WorkManagerTestInitHelper.initializeTestWorkManager(context)` in your test setup. This gives you a synchronous WorkManager that you can drive with `TestDriver`, executing work immediately and checking statuses without waiting for real constraints to be met.

## Doze Mode and Battery Optimization

Understanding how WorkManager interacts with Doze mode is essential for setting realistic expectations. When the device is idle, unplugged, and stationary, Android enters Doze mode and defers all alarms, network access, and jobs — including WorkManager tasks. The system periodically opens "maintenance windows" where deferred work can execute, but the timing is unpredictable.

This means your periodic sync that's supposed to run every hour might be delayed by several hours when the device is in Doze. On some OEMs (Xiaomi, Huawei, Samsung, Oppo), aggressive battery optimizations go even further — they can kill background work entirely unless the user explicitly exempts your app. This is a real problem with no clean solution. The best you can do is: use expedited work for user-initiated tasks, set realistic expectations for periodic work timing, and guide users through OEM-specific battery settings if your app relies on timely background execution.

WorkManager handles most of this gracefully — it persists work requests in a SQLite database and reschedules them across reboots and Doze cycles. But "guaranteed execution" means "it will eventually run," not "it will run on time." For time-critical work, consider using `AlarmManager` with `setExactAndAllowWhileIdle()` instead, accepting the tradeoff that it requires the `SCHEDULE_EXACT_ALARM` permission on Android 12+.

## Real-World Use Cases

**Data synchronization** — The most common use case. Sync local changes to the server when the device has connectivity. Use `OneTimeWorkRequest` with `NetworkType.CONNECTED` constraint for immediate syncs, and `PeriodicWorkRequest` for background polling. Tag synced items locally so you know what to retry if the sync fails mid-batch.

**Image/file upload** — Upload photos, documents, or attachments that the user selected. Use expedited work for user-initiated uploads (the user expects immediate progress), and regular work for background uploads (batch photo sync). Show a notification for long uploads using `setForeground()` in the worker.

**Cache cleanup** — Schedule periodic cleanup of expired cache files, old database entries, and temporary downloads. A `PeriodicWorkRequest` running daily with `RequiresCharging` constraint is ideal — it runs during overnight charging and keeps the app's storage footprint reasonable.

**Log and analytics upload** — Batch analytics events locally and upload them periodically. Use `PeriodicWorkRequest` with `NetworkType.CONNECTED`. This reduces network calls from one per event to one per batch, which is more battery-efficient and handles offline usage gracefully.

**Database maintenance** — Run `VACUUM` on large SQLite databases, prune old records, or rebuild FTS indexes. Schedule during charging with a periodic worker to avoid impacting the user's active session.

## The Reframe — WorkManager Is an OS Contract

Here's what I think most developers miss about WorkManager: **it's not just a task scheduler. It's a contract between your app and the operating system.** When you enqueue work, you're telling the OS "I need this done, here are my constraints, and I trust you to find the right time." The OS, in return, guarantees that the work will execute — but it reserves the right to decide when.

This contract model explains all of WorkManager's behavior. The 15-minute minimum for periodic work? That's the OS protecting battery life. Expedited work? That's your app saying "this one is user-visible, please prioritize it." Constraints? That's your app cooperating with the OS instead of fighting it. The apps that try to circumvent these guarantees — using `AlarmManager` with exact alarms, holding wake locks, disabling Doze — end up on battery optimization hit lists and get their background execution restricted even further.

WorkManager works with the OS instead of against it, and that's why it's the only background execution API that has survived multiple rounds of Android's background execution restrictions. Every other approach — `AlarmManager`, `JobScheduler`, Firebase `JobDispatcher`, `SyncAdapter` — has been either restricted, deprecated, or abandoned. WorkManager is designed to survive the next round too, because it's built on the principle of cooperation rather than circumvention.

Thank You!
