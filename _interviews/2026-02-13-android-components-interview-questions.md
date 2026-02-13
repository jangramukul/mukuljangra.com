---
title: "Android Components"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 2
---

## Android Components — What Interviewers Really Ask

Services, Broadcast Receivers, and Content Providers make up three of the four fundamental Android components. Interviewers use these topics to gauge whether you actually understand how Android works under the hood or just know how to call APIs.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the four core Android components?

Every Android application is built on four fundamental components, each serving a distinct purpose. **Activity** represents a single screen with a user interface and is the entry point for user interaction. **Service** runs operations in the background without a user interface — think music playback or WebSocket connections. **Broadcast Receiver** responds to system-wide or app-wide broadcast messages, like connectivity changes or battery events. **Content Provider** manages shared app data and provides a structured interface for other applications to query, insert, update, or delete data. All four must be declared in the `AndroidManifest.xml`, and the system uses this manifest to know which components your app exposes.

#### Q2: What are the three types of Services in Android?

This is one of the most commonly asked questions, and interviewers want to see that you understand the practical difference, not just the names. **Background Service** performs work the user isn't directly aware of. A WebSocket connection that keeps a chat app synced is a classic example — the user doesn't see it running, but it's doing critical work. **Foreground Service** performs work the user is actively aware of, like music playback or GPS tracking. It must display a persistent notification so the user knows the service is running. **Bound Service** is tied to a component (Activity, Fragment, or even another Service) via `bindService()`. It provides a client-server interface and is commonly used for IPC. The key insight here: a service can be both started and bound at the same time — these are not mutually exclusive states.

#### Q3: What is the Service lifecycle?

The lifecycle depends on how the service is started. For a **started service** (via `startService()` or `startForegroundService()`), the lifecycle is: `onCreate()` → `onStartCommand()` → service runs → `onDestroy()`. The service keeps running until it calls `stopSelf()` or another component calls `stopService()`. For a **bound service** (via `bindService()`), the lifecycle is: `onCreate()` → `onBind()` → clients interact → `onUnbind()` → `onDestroy()`. The service is destroyed when all clients unbind. A common mistake candidates make is forgetting that `onCreate()` is called only once regardless of how many times `startService()` is called, but `onStartCommand()` is called every time.

```kotlin
class SyncService : Service() {

    override fun onCreate() {
        super.onCreate()
        // Called once when the service is first created
        // Initialize resources here (database, network client)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Called every time startService() is invoked
        // Handle the work here — runs on MAIN THREAD by default
        return START_STICKY // Service restarts if killed by system
    }

    override fun onBind(intent: Intent): IBinder? {
        return null // Return null for a started (non-bound) service
    }

    override fun onDestroy() {
        super.onDestroy()
        // Clean up resources
    }
}
```

#### Q4: What does `onStartCommand()` return, and what do the return values mean?

The return value tells the system what to do if the service gets killed while running. **`START_STICKY`** restarts the service but does not redeliver the last intent — you get a null intent on restart. Use this for services that manage their own state, like a music player that can resume on its own. **`START_NOT_STICKY`** does not restart the service at all. Use this for work that can safely wait, like a one-time sync. **`START_REDELIVER_INTENT`** restarts the service and redelivers the original intent. Use this when the work must complete, like a file upload where you need the original parameters. Interviewers ask this to test whether you've actually implemented a service or just read about it. The wrong return value can cause silent data loss or unnecessary battery drain.

#### Q5: Services run on the main thread — what's the implication?

This catches many candidates off guard. Unlike what the name "background service" implies, **a Service does not automatically run on a background thread**. It runs on the main (UI) thread of your app's process. If you do network calls, database operations, or heavy computation directly in `onStartCommand()`, you will block the main thread and trigger ANRs (Application Not Responding). You must manage threading yourself using coroutines, executors, or dedicated threads. This is exactly why `IntentService` was created — it handled threading internally. But `IntentService` is now deprecated in favor of `WorkManager` combined with coroutines.

```kotlin
class UploadService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val filePath = intent?.getStringExtra("file_path") ?: return START_NOT_STICKY
        serviceScope.launch {
            uploadFile(filePath)
            stopSelf(startId) // Stop after work completes
        }
        return START_REDELIVER_INTENT
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent): IBinder? = null
}
```

#### Q6: What are the Foreground Service requirements on modern Android?

Starting from Android 8.0 (API 26), you cannot start a background service when the app is in the background — the system throws an `IllegalStateException`. You must use `startForegroundService()` and call `startForeground()` with a notification within 5 seconds, or the system kills the service and throws a crash. On **Android 14 (API 34)**, the requirements got stricter: you must declare the foreground service type in the manifest using the `android:foregroundServiceType` attribute. Valid types include `mediaPlayback`, `location`, `camera`, `microphone`, `dataSync`, and several others. You also need to declare the corresponding permission like `FOREGROUND_SERVICE_LOCATION`. Interviewers ask this to check if you stay current with platform restrictions — many apps broke during these transitions because developers didn't update their manifests.

```kotlin
// In AndroidManifest.xml
// <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
// <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
// <service
//     android:name=".MusicPlaybackService"
//     android:foregroundServiceType="mediaPlayback"
//     android:exported="false" />

class MusicPlaybackService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildPlaybackNotification()
        startForeground(NOTIFICATION_ID, notification)
        // Start playback...
        return START_STICKY
    }

    override fun onBind(intent: Intent): IBinder? = null
}
```

#### Q7: What is a Broadcast Receiver and how is it registered?

A Broadcast Receiver responds to system-wide or app-specific broadcast events. There are two ways to register one. **Static registration** (manifest-registered) means declaring the receiver in `AndroidManifest.xml` with an intent filter. The receiver can respond to broadcasts even when the app is not running — the system instantiates it. **Dynamic registration** (context-registered) means calling `registerReceiver()` in your Activity or Service code. This receiver lives only as long as the registering component and must be unregistered to prevent leaks. A critical mistake candidates make: forgetting to call `unregisterReceiver()` in `onStop()` or `onDestroy()`, leading to leaked receivers and crashes.

```kotlin
// Dynamic registration
class ConnectivityActivity : AppCompatActivity() {

    private val connectivityReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val isConnected = checkNetworkState(context)
            updateConnectionUI(isConnected)
        }
    }

    override fun onStart() {
        super.onStart()
        val filter = IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION)
        registerReceiver(connectivityReceiver, filter)
    }

    override fun onStop() {
        super.onStop()
        unregisterReceiver(connectivityReceiver) // Must unregister
    }
}
```

#### Q8: What changed with implicit broadcast restrictions in Android 8.0+?

Starting with Android 8.0 (API 26), most implicit broadcasts can no longer be received by manifest-registered (static) receivers. This was a major performance and battery optimization — previously, a single system broadcast like `CONNECTIVITY_CHANGE` could wake up dozens of apps, even if they didn't need to respond. Now, if you register a receiver in the manifest for an implicit broadcast like `android.net.conn.CONNECTIVITY_CHANGE`, it simply won't be delivered. You must use dynamic registration instead. There are a few exceptions that still work with static registration, including `ACTION_BOOT_COMPLETED`, `ACTION_LOCALE_CHANGED`, and `ACTION_USB_DEVICE_ATTACHED`. The full list is in the official documentation. Interviewers ask this because it's a real-world pain point that many apps had to deal with during the Android 8 migration.

#### Q9: What is a Content Provider and when would you use one?

A Content Provider manages access to a structured set of data. It's the standard mechanism for sharing data between applications — when your app reads contacts, media files, or calendar events, it's going through a Content Provider. But Content Providers are not just for cross-app sharing. You can also use them within a single app to abstract over different data sources (database, file system, network cache) behind a consistent URI-based interface. The URI structure follows a pattern: `content://authority/path/id`. The scheme is always `content://`, the authority uniquely identifies the provider (usually your package name), the path specifies the data type, and the optional id targets a specific record. You interact with Content Providers through a **ContentResolver**, never directly.

```kotlin
// Querying contacts through ContentResolver
val cursor = contentResolver.query(
    ContactsContract.Contacts.CONTENT_URI,  // URI
    arrayOf(                                 // Projection (columns)
        ContactsContract.Contacts._ID,
        ContactsContract.Contacts.DISPLAY_NAME
    ),
    "${ContactsContract.Contacts.HAS_PHONE_NUMBER} = ?", // Selection
    arrayOf("1"),                            // Selection args
    ContactsContract.Contacts.DISPLAY_NAME   // Sort order
)

cursor?.use {
    while (it.moveToNext()) {
        val name = it.getString(
            it.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME)
        )
        Log.d("Contacts", "Name: $name")
    }
}
```

#### Q10: What is the difference between `startService()` and `bindService()`?

`startService()` creates a started service that runs independently of the component that launched it. It keeps running even if the starting component is destroyed — you must explicitly stop it. `bindService()` creates a bound service that provides a client-server interface. It's tied to the lifecycle of the binding component: when all clients unbind, the service is destroyed. The `BIND_AUTO_CREATE` flag passed to `bindService()` tells the system to create the service if it doesn't already exist. Without this flag, `bindService()` only connects to an already running service. A subtle but important point: if a service is both started and bound, it won't be destroyed until it's both stopped and all clients have unbound. This dual lifecycle is a common source of service leaks.

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is the Binder mechanism and how does IPC work in Android?

This is where interviewers separate senior candidates from everyone else. Every Android app runs in its own sandboxed process — one app cannot directly access another app's memory. **Binder** is Android's custom IPC (Inter-Process Communication) kernel driver that enables cross-process communication. When you call a method on a bound service in a different process, the Binder framework serializes your method call and arguments into a Parcel, sends it through the Binder kernel driver to the target process, deserializes it, executes the method, and returns the result the same way. There are three levels of IPC abstraction in Android. **AIDL (Android Interface Definition Language)** is the most powerful — it generates the proxy and stub code for multi-threaded, complex cross-process communication. **Messenger** wraps a Handler and provides simpler, single-threaded IPC when you don't need concurrent access. **Content Provider** itself is an IPC mechanism — when you query contacts from another app, that query goes through Binder under the hood. Even Intents use Binder for cross-process delivery. Understanding Binder is what makes the difference between "I use Android" and "I understand Android."

#### Q12: When should you use Service vs WorkManager?

This question tests your judgment, not just knowledge. **Service** is for continuous, real-time work that must happen right now and maintain an active connection. WebSocket connections, live location tracking, media playback, VoIP calls — these need a persistent process and can't be deferred. **WorkManager** is for deferrable work that must be guaranteed to execute eventually, even if the app is killed or the device restarts. Uploading photos, syncing data, periodic log cleanup — these can wait a few minutes and don't need a live connection. The common mistake is using a Service for work that should be in WorkManager. A background service doing periodic syncs gets killed by the system aggressively (especially on OEM-modified Android like Samsung, Xiaomi), but WorkManager survives because it uses platform-appropriate scheduling (JobScheduler on API 23+, AlarmManager + BroadcastReceiver on older). Use WorkManager unless you have a strong reason not to. For continuous foreground work, use a foreground service. For everything else, WorkManager is the right choice.

#### Q13: What is AIDL and when would you use it over Messenger?

AIDL (Android Interface Definition Language) generates the boilerplate code for Binder-based IPC. You define an interface in a `.aidl` file, and the build system generates a `Stub` class (for the server) and a `Proxy` class (for the client). AIDL supports concurrent access — multiple clients can call the service simultaneously, and calls are dispatched on threads from the Binder thread pool. **Messenger**, on the other hand, queues all requests into a single thread via a Handler. Use AIDL when you need multi-threaded access and complex method signatures with custom Parcelable objects. Use Messenger when your IPC is simple and single-threaded — it's easier to implement and avoids concurrency bugs. The tradeoff is clear: AIDL gives you power at the cost of complexity (you must handle thread safety yourself), while Messenger gives you simplicity at the cost of throughput. In most real-world apps, you won't write AIDL directly. But knowing how it works shows you understand the layer beneath libraries that use it.

```kotlin
// Example AIDL interface (IPaymentService.aidl)
// interface IPaymentService {
//     PaymentResult processPayment(in PaymentRequest request);
//     boolean cancelPayment(String transactionId);
// }

// Client binding to the AIDL service
class PaymentActivity : AppCompatActivity() {

    private var paymentService: IPaymentService? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            paymentService = IPaymentService.Stub.asInterface(binder)
        }
        override fun onServiceDisconnected(name: ComponentName) {
            paymentService = null
        }
    }

    override fun onStart() {
        super.onStart()
        val intent = Intent("com.payment.PROCESS")
        intent.setPackage("com.payment.app")
        bindService(intent, connection, BIND_AUTO_CREATE)
    }
}
```

#### Q14: Explain Application Context vs Activity Context — when to use which?

Both are subclasses of `Context`, but their lifecycles and capabilities differ significantly. **Application Context** is tied to the application lifecycle — it lives as long as the app process. Use it for singletons, dependency injection (Hilt modules), database initialization, and anything that outlives a single Activity. **Activity Context** is tied to the Activity lifecycle — it's destroyed when the Activity is destroyed. Use it for UI operations: inflating layouts, showing dialogs, starting other activities, and anything that needs a reference to the window or theme. The classic bug: passing Activity context to a singleton or a long-lived object creates a memory leak because the singleton holds a reference to the Activity, preventing garbage collection even after the Activity is destroyed. The rule of thumb is simple — if the object outlives the Activity, use Application context. If it's UI work, use Activity context. One edge case to know: `Dialog` and `Toast` require an Activity context on some Android versions because they need to attach to a window.

#### Q15: What is FileProvider and why is it needed?

Starting from Android 7.0 (API 24), passing a `file://` URI to another app via an Intent throws a `FileUriExposedException`. The system blocks this because exposing raw file paths is a security risk — the receiving app gets direct filesystem access. **FileProvider** is a special subclass of `ContentProvider` that generates `content://` URIs instead. These URIs grant temporary, controlled access through Android's permission system. You declare the FileProvider in your manifest with a specific authority and configure which directories to share using an XML file. When you need to share a file — say a captured photo with a crop app — you generate a `content://` URI via `FileProvider.getUriForFile()` and grant temporary read/write permission with `Intent.FLAG_GRANT_READ_URI_PERMISSION`. The receiving app accesses the file through ContentResolver, never through direct file paths.

```kotlin
// Sharing a file securely using FileProvider
val photoFile = File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "profile.jpg")
val photoUri = FileProvider.getUriForFile(
    this,
    "${applicationContext.packageName}.fileprovider",
    photoFile
)

val shareIntent = Intent(Intent.ACTION_SEND).apply {
    type = "image/jpeg"
    putExtra(Intent.EXTRA_STREAM, photoUri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
startActivity(Intent.createChooser(shareIntent, "Share photo"))
```

#### Q16: What is the `AndroidManifest.xml` and what must be declared in it?

The AndroidManifest is the blueprint of your application. The system reads it before any of your code runs. It declares all four components (Activities, Services, Broadcast Receivers, Content Providers), the permissions your app requires and grants, hardware and software features the app needs, the minimum and target SDK versions, and intent filters that describe what each component can respond to. Every component must be registered here — if you create a Service class but don't declare it in the manifest, the system won't find it and your app crashes. For security, the `android:exported` attribute controls whether a component is accessible from outside your app. Starting from Android 12 (API 31), you must explicitly set `android:exported` on every component that has an intent filter. Forgetting this causes a build failure. Interviewers use this question to confirm you understand the entry point of an Android application — it's not `onCreate()`, it's the manifest.

#### Q17: What are ordered broadcasts vs normal broadcasts?

Normal broadcasts (sent via `sendBroadcast()`) are delivered to all registered receivers simultaneously with no guaranteed order. **Ordered broadcasts** (sent via `sendOrderedBroadcast()`) are delivered to receivers one at a time, in priority order. Each receiver can process the broadcast, modify the result data, and optionally abort the broadcast so that lower-priority receivers never see it. You set priority using `android:priority` in the intent filter or `IntentFilter.setPriority()` for dynamic registration. This mechanism is how the SMS system used to work — a high-priority receiver could intercept and abort an incoming SMS before the default messaging app saw it. In practice, ordered broadcasts are rare in modern app development because most use cases have been replaced by more predictable APIs, but knowing the mechanism shows deep platform understanding.

#### Q18: What is `android:exported` and why does it matter for security?

The `android:exported` attribute on a component declaration in the manifest controls whether other apps can interact with that component. When set to `true`, any app on the device can start your Activity, bind to your Service, or query your Content Provider. When set to `false`, only your own app (or apps with the same user ID via `sharedUserId`) can access it. Before Android 12, the default value depended on whether the component had intent filters — if it did, `exported` defaulted to `true`. This led to security vulnerabilities where developers accidentally exposed internal components. Since Android 12, you must explicitly declare `exported` on every component with an intent filter. For Content Providers, you should also declare custom permissions using `android:readPermission` and `android:writePermission` to control which apps can read or modify your data. The general rule: set `android:exported="false"` unless you have a specific reason to expose the component.

#### Q19: What happened to `LocalBroadcastManager` and what replaced it?

`LocalBroadcastManager` was introduced to send broadcasts within a single app without the overhead and security concerns of system-wide broadcasts. It was faster (no IPC, no Binder), more secure (broadcasts never left your process), and simpler. But it was deprecated because it became an app-level event bus that promoted architectural patterns the Android team wanted to move away from — tightly coupled components communicating through untyped Intent extras. The recommended replacements are **LiveData** for UI-layer observation, **Kotlin `SharedFlow`** or **`StateFlow`** for reactive streams in ViewModels or repositories, and observable patterns from your architecture layer. If you need process-wide event delivery without the broadcast overhead, `SharedFlow` with a `replay = 0` configuration is the closest direct replacement. The deprecation of `LocalBroadcastManager` is part of Android's broader push toward lifecycle-aware, type-safe communication.

#### Q20: Explain the file descriptor limit and its impact on Android apps.

Every I/O operation in Android — database connections, network sockets, open files, pipes, Looper message queues — opens a **FileDescriptor**. Android enforces a limit of **1024 file descriptors per process** (some OEM devices cap at 512). When your app exceeds this limit, you get cryptic errors like `CursorWindowAllocationException`, `OutOfMemoryError: pthread_create failed`, or `SQLiteException: unable to open database file`. These errors don't mention file descriptors at all, which makes debugging hard. The common causes are unclosed database cursors, leaked OkHttp connections, unclosed input/output streams, and excessive parallel coroutines each opening their own connections. The fix is disciplined resource management: use Kotlin's `use {}` extension for `Closeable` resources, set connection pool limits on HTTP clients, and always close cursors in `finally` blocks. This question tests whether you've dealt with production-scale issues or only worked on small projects.

### Common Follow-ups

- What happens if you call `startService()` multiple times on the same service? (`onCreate()` runs once, but `onStartCommand()` runs each time)
- Can a service start an Activity? (Yes, but from Android 10+ background activity launches are restricted — you need to show a notification with a PendingIntent instead)
- What is a sticky broadcast? (Deprecated — a broadcast whose Intent sticks around so late-registered receivers can still read it. Replaced by observable data holders)
- How does the system decide which app's Content Provider to use when multiple providers share the same authority? (It can't — authority must be unique across the device. This is why you use your package name as the authority)
- What is `ContentObserver` and when would you use it? (Registers for change notifications on a Content Provider URI — used when you need to react to data changes without polling)
- How do you handle configuration changes in a service? (Services aren't affected by configuration changes — they don't have a UI. But bound Activities will rebind after recreation)
- What is the difference between `Context.BIND_AUTO_CREATE` and binding without it? (`BIND_AUTO_CREATE` starts the service if it doesn't exist. Without it, you can only connect to an already-running service)
- Can you run a Service in a separate process? (Yes, using `android:process=":remote"` in the manifest. But then communication requires IPC — you can't share memory directly)

### Tips for the Interview

1. **Draw the lifecycle** — When asked about Service or Broadcast Receiver lifecycle, sketch it out. Visuals demonstrate clarity of thought and give you a framework to talk through edge cases.

2. **Know the Android version cutoffs** — Android 8.0 (implicit broadcast restrictions, background service limits), Android 10 (background activity launch restrictions), Android 12 (explicit `exported` requirement), Android 14 (foreground service type in manifest). Citing specific API levels shows you've actually dealt with migration issues.

3. **Lead with the "why"** — Don't just say "use WorkManager instead of Service." Explain that Services get killed aggressively by OEMs, that WorkManager delegates to JobScheduler or AlarmManager internally, and that guaranteed execution is the key differentiator.

4. **Mention security proactively** — When discussing Content Providers or Services, bring up `android:exported="false"`, custom permissions, and FileProvider without being asked. It signals production mindset.

5. **Connect the dots** — When you explain Binder, mention that Content Providers, bound Services, and even Intents all use Binder underneath. Showing how components connect demonstrates systems-level thinking.

6. **Admit what's deprecated** — Mentioning that `IntentService`, `LocalBroadcastManager`, and sticky broadcasts are deprecated (and knowing what replaced them) shows you keep up with the platform.

---

*These components are the building blocks of every Android app. Master them, and every follow-up question becomes easier to answer.*
