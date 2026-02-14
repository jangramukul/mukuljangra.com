---
title: "Android Components"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 2
sequence: 2
description: "Services, Broadcast Receivers, and Content Providers are three of the four core Android components."
---

## Android Components

Services, Broadcast Receivers, and Content Providers are three of the four core Android components. These questions cover how they work and how they interact.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the four core Android components?

Android has four core components:

- **Activity** — represents a single screen with a user interface.
- **Service** — runs in the background to perform long-running operations.
- **Broadcast Receiver** — responds to system-wide broadcast announcements.
- **Content Provider** — used to share data between multiple applications.

All four must be declared in `AndroidManifest.xml`.

#### Q2: What are the three types of Services in Android?

There are three types:

- **Background Service** — a service that is not known to users, like a WebSocket service keeping a chat app synced.
- **Foreground Service** — a service that is known to users, like a media playing service. It must display a persistent notification.
- **Bound Service** — a service that is bound to a component (Activity, Fragment, or another Service) via `bindService()`. It provides a client-server interface and is commonly used for IPC.

A service can be both started and bound at the same time — these are not mutually exclusive states.

#### Q3: What is the Service lifecycle?

The lifecycle depends on how the service is started.

For a **started service** (via `startService()` or `startForegroundService()`): `onCreate()` → `onStartCommand()` → service runs → `onDestroy()`. The service keeps running until it calls `stopSelf()` or another component calls `stopService()`.

For a **bound service** (via `bindService()`): `onCreate()` → `onBind()` → clients interact → `onUnbind()` → `onDestroy()`. The service is destroyed when all clients unbind.

`onCreate()` is called only once regardless of how many times `startService()` is called, but `onStartCommand()` is called every time.

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

The return value tells the system what to do if the service gets killed while running:

- **`START_STICKY`** — restarts the service but does not redeliver the last intent. You get a null intent on restart. Use for services that manage their own state, like a music player.
- **`START_NOT_STICKY`** — does not restart the service. Use for work that can safely wait, like a one-time sync.
- **`START_REDELIVER_INTENT`** — restarts the service and redelivers the original intent. Use when the work must complete, like a file upload where you need the original parameters.

The wrong return value can cause silent data loss or unnecessary battery drain.

#### Q5: Services run on the main thread — what's the implication?

A Service does not automatically run on a background thread. It runs on the main (UI) thread of your app's process. If you do network calls, database operations, or heavy computation directly in `onStartCommand()`, you will block the main thread and trigger ANRs.

You must manage threading yourself using coroutines, executors, or dedicated threads. `IntentService` used to handle threading internally, but it is now deprecated in favor of `WorkManager` combined with coroutines.

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

Starting from Android 8.0 (API 26), you cannot start a background service when the app is in the background — the system throws an `IllegalStateException`. You must use `startForegroundService()` and call `startForeground()` with a notification within 5 seconds, or the system kills the service.

On **Android 14 (API 34)**, you must also declare the foreground service type in the manifest using `android:foregroundServiceType`. Valid types include `mediaPlayback`, `location`, `camera`, `microphone`, `dataSync`, and others. You also need the corresponding permission like `FOREGROUND_SERVICE_LOCATION`.

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

A Broadcast Receiver responds to system-wide or app-specific broadcast events. There are two ways to register one:

- **Static registration** — declared in `AndroidManifest.xml` with an intent filter. The receiver can respond to broadcasts even when the app is not running.
- **Dynamic registration** — registered by calling `registerReceiver()` in your Activity or Service code. This receiver lives only as long as the registering component.

Always call `unregisterReceiver()` in `onStop()` or `onDestroy()` to prevent leaked receivers and crashes.

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

Starting with Android 8.0 (API 26), most implicit broadcasts can no longer be received by manifest-registered (static) receivers. If you register a receiver in the manifest for an implicit broadcast like `android.net.conn.CONNECTIVITY_CHANGE`, it won't be delivered. You must use dynamic registration instead.

A few exceptions still work with static registration, including `ACTION_BOOT_COMPLETED`, `ACTION_LOCALE_CHANGED`, and `ACTION_USB_DEVICE_ATTACHED`. The full list is in the official documentation.

#### Q9: What is a Content Provider and when would you use one?

A Content Provider manages access to a structured set of data. It is the standard mechanism for sharing data between applications — like getting the contacts from the device into your application. You can also use it within a single app to abstract over different data sources behind a consistent URI-based interface.

The URI structure follows this pattern: `content://authority/path/id`. The authority uniquely identifies the provider (usually your package name), the path specifies the data type, and the optional id targets a specific record. You interact with Content Providers through a **ContentResolver**, never directly.

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

- `startService()` creates a started service that runs independently. It keeps running even if the starting component is destroyed — you must explicitly stop it.
- `bindService()` creates a bound service that provides a client-server interface. When all clients unbind, the service is destroyed.

The `BIND_AUTO_CREATE` flag tells the system to create the service if it doesn't already exist. Without this flag, `bindService()` only connects to an already running service. If a service is both started and bound, it won't be destroyed until it's both stopped and all clients have unbound.

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is the Binder mechanism and how does IPC work in Android?

Every Android app runs in its own sandboxed process — one app cannot directly access another app's memory. **Binder** is Android's IPC (Inter-Process Communication) kernel driver that enables cross-process communication.

When you call a method on a bound service in a different process, the Binder framework serializes the method call and arguments into a Parcel, sends it through the kernel driver to the target process, deserializes it, executes the method, and returns the result the same way.

There are three levels of IPC abstraction:

- **AIDL** — generates proxy and stub code for multi-threaded, complex cross-process communication.
- **Messenger** — wraps a Handler for simpler, single-threaded IPC.
- **Content Provider** — also an IPC mechanism under the hood. Even Intents use Binder for cross-process delivery.

#### Q12: When should you use Service vs WorkManager?

- **Service** — for continuous, real-time work that must happen right now. WebSocket connections, live location tracking, media playback, VoIP calls.
- **WorkManager** — for deferrable work that must be guaranteed to execute eventually, even if the app is killed or the device restarts. Uploading photos, syncing data, periodic log cleanup.

A background service doing periodic syncs gets killed by the system aggressively (especially on OEM-modified Android like Samsung, Xiaomi). WorkManager survives because it uses platform-appropriate scheduling (JobScheduler on API 23+, AlarmManager + BroadcastReceiver on older). Use a foreground service for continuous foreground work and WorkManager for everything else.

#### Q13: What is AIDL and when would you use it over Messenger?

AIDL (Android Interface Definition Language) generates boilerplate code for Binder-based IPC. You define an interface in a `.aidl` file, and the build system generates a `Stub` class (server side) and a `Proxy` class (client side). AIDL supports concurrent access — multiple clients can call the service simultaneously from the Binder thread pool.

**Messenger** queues all requests into a single thread via a Handler. Use AIDL when you need multi-threaded access and complex method signatures with custom Parcelable objects. Use Messenger when your IPC is simple and single-threaded — it avoids concurrency bugs but limits throughput.

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

Both are subclasses of `Context`, but they have different lifecycles:

- **Application Context** — tied to the application lifecycle. Use for singletons, dependency injection, database initialization, and anything that outlives a single Activity.
- **Activity Context** — tied to the Activity lifecycle, destroyed when the Activity is destroyed. Use for UI operations like inflating layouts, showing dialogs, and starting other activities.

Passing Activity context to a singleton or long-lived object creates a memory leak because it prevents the Activity from being garbage collected. If the object outlives the Activity, use Application context. If it's UI work, use Activity context. Note that `Dialog` and `Toast` require an Activity context on some Android versions because they need to attach to a window.

#### Q15: What is FileProvider and why is it needed?

Starting from Android 7.0 (API 24), passing a `file://` URI to another app via an Intent throws a `FileUriExposedException`. Exposing raw file paths is a security risk because the receiving app gets direct filesystem access.

**FileProvider** is a special subclass of `ContentProvider` that generates `content://` URIs instead. These URIs grant temporary, controlled access through Android's permission system. You generate a URI via `FileProvider.getUriForFile()` and grant temporary read/write permission with `Intent.FLAG_GRANT_READ_URI_PERMISSION`. The receiving app accesses the file through ContentResolver, never through direct file paths.

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

The AndroidManifest is the blueprint of your application — the system reads it before any of your code runs. It declares:

- All four components (Activities, Services, Broadcast Receivers, Content Providers)
- Permissions your app requires and grants
- Hardware and software features the app needs
- Minimum and target SDK versions
- Intent filters that describe what each component can respond to

Every component must be registered here — if you create a Service class but don't declare it in the manifest, the system won't find it. The `android:exported` attribute controls whether a component is accessible from outside your app. Starting from Android 12 (API 31), you must explicitly set `android:exported` on every component that has an intent filter, or the build fails.

#### Q17: What are ordered broadcasts vs normal broadcasts?

- **Normal broadcasts** (sent via `sendBroadcast()`) — delivered to all registered receivers simultaneously with no guaranteed order.
- **Ordered broadcasts** (sent via `sendOrderedBroadcast()`) — delivered to receivers one at a time, in priority order. Each receiver can process the broadcast, modify the result data, and optionally abort it so lower-priority receivers never see it.

You set priority using `android:priority` in the intent filter or `IntentFilter.setPriority()` for dynamic registration. This mechanism is how the SMS system used to work — a high-priority receiver could intercept and abort an incoming SMS before the default messaging app saw it. Ordered broadcasts are rare in modern development since most use cases have been replaced by more predictable APIs.

#### Q18: What is `android:exported` and why does it matter for security?

`android:exported` controls whether other apps can interact with a component:

- **`true`** — any app on the device can start your Activity, bind to your Service, or query your Content Provider.
- **`false`** — only your own app (or apps with the same user ID via `sharedUserId`) can access it.

Before Android 12, the default depended on whether the component had intent filters — if it did, `exported` defaulted to `true`, which led to accidental security vulnerabilities. Since Android 12, you must explicitly declare `exported` on every component with an intent filter. For Content Providers, also use `android:readPermission` and `android:writePermission` to control data access. The general rule: set `android:exported="false"` unless you have a specific reason to expose the component.

#### Q19: What happened to `LocalBroadcastManager` and what replaced it?

`LocalBroadcastManager` sent broadcasts within a single app without IPC overhead or security concerns. It was deprecated because it promoted tightly coupled components communicating through untyped Intent extras.

The recommended replacements are:

- **LiveData** — for UI-layer observation.
- **Kotlin `SharedFlow` or `StateFlow`** — for reactive streams in ViewModels or repositories.
- **Observable patterns** from your architecture layer.

`SharedFlow` with `replay = 0` is the closest direct replacement for process-wide event delivery.

#### Q20: Explain the file descriptor limit and its impact on Android apps.

Every I/O operation in Android — database connections, network sockets, open files, pipes — opens a **FileDescriptor**. Android enforces a limit of **1024 file descriptors per process** (some OEM devices cap at 512).

When your app exceeds this limit, you get errors like `CursorWindowAllocationException`, `OutOfMemoryError: pthread_create failed`, or `SQLiteException: unable to open database file` — none of which mention file descriptors directly.

Common causes are unclosed database cursors, leaked OkHttp connections, unclosed input/output streams, and excessive parallel coroutines. The fix is disciplined resource management: use Kotlin's `use {}` extension for `Closeable` resources, set connection pool limits on HTTP clients, and always close cursors in `finally` blocks.

### Common Follow-ups

- What happens if you call `startService()` multiple times on the same service? (`onCreate()` runs once, but `onStartCommand()` runs each time)
- Can a service start an Activity? (Yes, but from Android 10+ background activity launches are restricted — you need to show a notification with a PendingIntent instead)
- What is a sticky broadcast? (Deprecated — a broadcast whose Intent sticks around so late-registered receivers can still read it. Replaced by observable data holders)
- How does the system decide which app's Content Provider to use when multiple providers share the same authority? (It can't — authority must be unique across the device. This is why you use your package name as the authority)
- What is `ContentObserver` and when would you use it? (Registers for change notifications on a Content Provider URI — used when you need to react to data changes without polling)
- How do you handle configuration changes in a service? (Services aren't affected by configuration changes — they don't have a UI. But bound Activities will rebind after recreation)
- What is the difference between `Context.BIND_AUTO_CREATE` and binding without it? (`BIND_AUTO_CREATE` starts the service if it doesn't exist. Without it, you can only connect to an already-running service)
- Can you run a Service in a separate process? (Yes, using `android:process=":remote"` in the manifest. But then communication requires IPC — you can't share memory directly)
