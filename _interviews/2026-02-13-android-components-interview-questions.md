---
title: "Android Components"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 6
sequence: 6
description: "Services, Broadcast Receivers, and Content Providers are three of the four core Android components."
---

## Android Components

Services, Broadcast Receivers, and Content Providers are three of the four core Android components. These questions cover how they work and how they interact.

#### What are the four core Android components?

Android has four core components:

- **Activity** — a single screen with a user interface.
- **Service** — runs in the background for long-running operations.
- **Broadcast Receiver** — responds to system-wide broadcast announcements.
- **Content Provider** — shares data between applications.

All four must be declared in `AndroidManifest.xml`.

#### What is the Service lifecycle?

The lifecycle depends on how the service is started.

For a **started service** (via `startService()`): `onCreate()` → `onStartCommand()` → service runs → `onDestroy()`. It keeps running until it calls `stopSelf()` or someone calls `stopService()`.

For a **bound service** (via `bindService()`): `onCreate()` → `onBind()` → clients interact → `onUnbind()` → `onDestroy()`. It gets destroyed when all clients unbind.

`onCreate()` is called only once no matter how many times `startService()` is called. But `onStartCommand()` is called every time.

```kotlin
class SyncService : Service() {

    override fun onCreate() {
        super.onCreate()
        // Called once when the service is first created
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Called every time startService() is invoked
        // Runs on MAIN THREAD by default
        return START_STICKY
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

#### What are the three types of Services in Android?

- **Foreground Service** — visible to the user. Must show a persistent notification. Used for things like music playback or location tracking.
- **Background Service** — not visible to the user. Used for things like syncing data over a WebSocket.
- **Bound Service** — bound to a component via `bindService()`. Provides a client-server interface. Commonly used for IPC.

A service can be both started and bound at the same time.

#### What is the difference between `startService()` and `bindService()`?

- `startService()` starts a service that runs independently. It keeps running even if the starting component is destroyed. You must explicitly stop it.
- `bindService()` creates a bound service with a client-server interface. When all clients unbind, the service is destroyed.

The `BIND_AUTO_CREATE` flag creates the service if it doesn't already exist. Without it, `bindService()` only connects to an already running service. If a service is both started and bound, it won't be destroyed until it's stopped and all clients have unbound.

#### Services run on the main thread — what does that mean?

A Service does not run on a background thread automatically. It runs on the main (UI) thread. If you do network calls or heavy computation in `onStartCommand()`, you block the main thread and trigger ANRs.

You need to manage threading yourself — coroutines, executors, or dedicated threads. `IntentService` used to handle this internally but it's deprecated now. Use `WorkManager` with coroutines instead.

```kotlin
class UploadService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val filePath = intent?.getStringExtra("file_path") ?: return START_NOT_STICKY
        serviceScope.launch {
            uploadFile(filePath)
            stopSelf(startId)
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

#### What does `onStartCommand()` return and what do the return values mean?

The return value tells the system what to do if the service gets killed:

- **`START_STICKY`** — restarts the service but does not redeliver the last intent. You get a null intent on restart. Good for music players.
- **`START_NOT_STICKY`** — does not restart the service. Good for one-time work like a sync.
- **`START_REDELIVER_INTENT`** — restarts the service and redelivers the original intent. Good for file uploads where you need the original parameters.

#### When should you use Service vs WorkManager?

- **Service** — for work that must happen right now and continuously. WebSocket connections, live location tracking, media playback.
- **WorkManager** — for deferrable work that must eventually complete, even if the app is killed or the device restarts. Uploading photos, syncing data, periodic cleanup.

Background services get killed aggressively by the system, especially on OEM Android like Samsung and Xiaomi. WorkManager survives because it uses JobScheduler on API 23+ and AlarmManager on older versions. Use foreground service for real-time work and WorkManager for everything else.

#### What are the Foreground Service requirements on modern Android?

From Android 8.0 (API 26), you can't start a background service when the app is in the background — the system throws `IllegalStateException`. You must use `startForegroundService()` and call `startForeground()` with a notification within 5 seconds.

From **Android 14 (API 34)**, you must also declare a foreground service type in the manifest using `android:foregroundServiceType`. Valid types include `mediaPlayback`, `location`, `camera`, `microphone`, `dataSync`. You also need the matching permission like `FOREGROUND_SERVICE_LOCATION`.

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
        return START_STICKY
    }

    override fun onBind(intent: Intent): IBinder? = null
}
```

#### What is the `AndroidManifest.xml` and what must be declared in it?

The manifest is the blueprint of your app. The system reads it before any of your code runs. It declares:

- All four components (Activities, Services, Broadcast Receivers, Content Providers)
- Permissions your app needs
- Hardware and software features required
- Min and target SDK versions
- Intent filters for each component

Every component must be declared here. If you create a Service class but don't declare it in the manifest, the system won't find it. From Android 12 (API 31), you must explicitly set `android:exported` on every component that has an intent filter or the build fails.

#### What is a Broadcast Receiver and how do you register one?

A Broadcast Receiver responds to system-wide or app-specific events. Two ways to register:

- **Static** — declared in `AndroidManifest.xml` with an intent filter. Can respond to broadcasts even when the app is not running.
- **Dynamic** — registered via `registerReceiver()` in code. Lives only as long as the registering component.

Always call `unregisterReceiver()` in `onStop()` or `onDestroy()` to prevent leaks.

```kotlin
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
        unregisterReceiver(connectivityReceiver)
    }
}
```

#### What changed with implicit broadcast restrictions in Android 8.0+?

From Android 8.0 (API 26), most implicit broadcasts can't be received by manifest-registered (static) receivers. If you register a receiver in the manifest for something like `CONNECTIVITY_CHANGE`, it won't be delivered. You must use dynamic registration instead.

A few exceptions still work with static registration — `ACTION_BOOT_COMPLETED`, `ACTION_LOCALE_CHANGED`, and `ACTION_USB_DEVICE_ATTACHED` among them.

#### What is a Content Provider and when would you use one?

A Content Provider manages access to structured data. It's the standard way to share data between apps — like reading contacts from the device. You can also use it within a single app to abstract different data sources behind a URI-based interface.

The URI pattern is `content://authority/path/id`. The authority identifies the provider (usually your package name), the path specifies the data type, and the optional id targets a specific record. You interact with Content Providers through a **ContentResolver**, never directly.

```kotlin
val cursor = contentResolver.query(
    ContactsContract.Contacts.CONTENT_URI,
    arrayOf(
        ContactsContract.Contacts._ID,
        ContactsContract.Contacts.DISPLAY_NAME
    ),
    "${ContactsContract.Contacts.HAS_PHONE_NUMBER} = ?",
    arrayOf("1"),
    ContactsContract.Contacts.DISPLAY_NAME
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

#### What is `android:exported` and why does it matter?

`android:exported` controls whether other apps can interact with your component:

- **`true`** — any app can start your Activity, bind to your Service, or query your Content Provider.
- **`false`** — only your own app can access it.

Before Android 12, if a component had intent filters, `exported` defaulted to `true`. This caused accidental security holes. Since Android 12, you must explicitly set it on every component with an intent filter. General rule: set `android:exported="false"` unless you have a specific reason to expose the component.

#### Explain Application Context vs Activity Context.

Both extend `Context` but have different lifecycles:

- **Application Context** — tied to the app lifecycle. Use for singletons, DI, database init, anything that outlives an Activity.
- **Activity Context** — tied to the Activity lifecycle. Use for UI work like inflating layouts, showing dialogs, starting activities.

Passing Activity context to a singleton creates a memory leak — the Activity can't be garbage collected. If the object outlives the Activity, use Application context. `Dialog` and `Toast` need Activity context on some Android versions because they attach to a window.

#### What is the Binder mechanism and how does IPC work?

Every Android app runs in its own sandboxed process. One app can't directly access another's memory. **Binder** is Android's IPC kernel driver that handles cross-process communication.

When you call a method on a bound service in another process, Binder serializes the call into a Parcel, sends it through the kernel driver, deserializes it in the target process, runs the method, and returns the result the same way.

Three levels of IPC:

- **AIDL** — generates proxy and stub code for multi-threaded cross-process communication.
- **Messenger** — wraps a Handler for simpler, single-threaded IPC.
- **Content Provider** — also uses Binder under the hood. Even Intents use Binder for cross-process delivery.

#### What is AIDL and when would you use it over Messenger?

AIDL (Android Interface Definition Language) generates Binder-based IPC code. You define an interface in a `.aidl` file. The build system generates a `Stub` (server side) and a `Proxy` (client side). AIDL supports concurrent access from multiple clients via the Binder thread pool.

**Messenger** queues all requests into a single thread via a Handler. Use AIDL when you need multi-threaded access or complex method signatures with Parcelable objects. Use Messenger for simple single-threaded IPC.

```kotlin
// IPaymentService.aidl
// interface IPaymentService {
//     PaymentResult processPayment(in PaymentRequest request);
//     boolean cancelPayment(String transactionId);
// }

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

#### What is FileProvider and why is it needed?

From Android 7.0 (API 24), passing a `file://` URI to another app throws `FileUriExposedException`. Raw file paths are a security risk.

**FileProvider** is a `ContentProvider` subclass that generates `content://` URIs instead. These grant temporary, controlled access through Android's permission system. You create a URI with `FileProvider.getUriForFile()` and grant access with `Intent.FLAG_GRANT_READ_URI_PERMISSION`.

```kotlin
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

#### What happened to `LocalBroadcastManager` and what replaced it?

`LocalBroadcastManager` sent broadcasts within a single app without IPC overhead. It was deprecated because it promoted tightly coupled components communicating through untyped Intent extras.

Replacements:

- **LiveData** — for UI-layer observation.
- **SharedFlow / StateFlow** — for reactive streams in ViewModels or repositories.

`SharedFlow` with `replay = 0` is the closest replacement for process-wide event delivery.

#### What is an Intent and what are the types?

An Intent is a messaging object used to request an action from another component. Two types:

- **Explicit Intent** — specifies the exact component to start by class name. Used for starting components within your own app.
- **Implicit Intent** — declares a general action and lets the system find a matching component. Used for things like opening a URL, sharing content, or picking a file.

Implicit intents use intent filters declared in the manifest to find matching components. If multiple components match, the system shows a chooser dialog.

#### What are PendingIntents and when do you use them?

A `PendingIntent` is a wrapper around an Intent that grants another app permission to execute it on your behalf. It runs with your app's identity and permissions even if your app is no longer running.

Common uses:

- **Notifications** — the system executes the PendingIntent when the user taps the notification.
- **AlarmManager** — triggers an action at a scheduled time.
- **App Widgets** — handles button clicks in remote views.

Use `FLAG_IMMUTABLE` (required from API 31) unless the PendingIntent needs to be modified by the receiver, in which case use `FLAG_MUTABLE`.

#### What are ordered broadcasts vs normal broadcasts?

- **Normal broadcasts** (`sendBroadcast()`) — delivered to all receivers simultaneously. No guaranteed order.
- **Ordered broadcasts** (`sendOrderedBroadcast()`) — delivered one at a time in priority order. Each receiver can modify or abort the broadcast before the next one sees it.

Priority is set via `android:priority` in the intent filter. Ordered broadcasts are rare in modern development — most use cases have been replaced by more predictable APIs.

### Common Follow-ups

- What happens if you call `startService()` multiple times on the same service? (`onCreate()` runs once, but `onStartCommand()` runs each time)
- Can a service start an Activity? (Yes, but from Android 10+ background activity launches are restricted — show a notification with a PendingIntent instead)
- What is a sticky broadcast? (Deprecated — a broadcast whose Intent sticks around so late-registered receivers can still read it. Replaced by observable data holders)
- How does the system decide which Content Provider to use when multiple share the same authority? (It can't — authority must be unique across the device. Use your package name as the authority)
- What is `ContentObserver`? (Registers for change notifications on a Content Provider URI — react to data changes without polling)
- How do you handle configuration changes in a Service? (Services aren't affected — they don't have a UI. But bound Activities will rebind after recreation)
- Can you run a Service in a separate process? (Yes, using `android:process=":remote"` in the manifest. Communication then requires IPC)
- What is the file descriptor limit? (1024 per process on most devices. Unclosed cursors, streams, and connections can exhaust it and cause crashes)
