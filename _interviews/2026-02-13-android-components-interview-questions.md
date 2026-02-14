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

Activities get all the attention, but Services, Broadcast Receivers, and Content Providers are the other three pillars holding your app together. Think of them like the plumbing, wiring, and foundation of a house -- you don't see them, but nothing works without them.

#### What are the four core Android components?

Think of an Android app like a restaurant. You've got four key roles:

- **Activity** -- the dining room. It's what the customer (user) sees and interacts with.
- **Service** -- the kitchen. Work happens back there whether the customer is looking or not.
- **Broadcast Receiver** -- the fire alarm. It sits quietly until something happens system-wide, then it reacts.
- **Content Provider** -- the supply chain. It's how the restaurant shares ingredients (data) with other restaurants (apps).

All four must be declared in `AndroidManifest.xml` or the system won't know they exist.

#### What is the Service lifecycle?

The lifecycle depends on *how* you start the service -- and yeah, this trips people up all the time.

For a **started service** (via `startService()`): `onCreate()` -> `onStartCommand()` -> service runs -> `onDestroy()`. It's like starting a dishwasher -- it keeps running until it finishes or you explicitly stop it with `stopSelf()` or `stopService()`.

For a **bound service** (via `bindService()`): `onCreate()` -> `onBind()` -> clients interact -> `onUnbind()` -> `onDestroy()`. This one is more like a phone call -- it stays alive only while someone is connected. The moment all clients unbind, it gets destroyed.

Here's a detail that catches people: `onCreate()` is called only once no matter how many times `startService()` is called. But `onStartCommand()` fires every single time.

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

- **Foreground Service** -- the one with a badge. It must show a persistent notification so the user knows it's running. Music playback, location tracking, that sort of thing.
- **Background Service** -- the quiet worker. No notification, no user awareness. Think data syncing over a WebSocket.
- **Bound Service** -- the on-demand helper. A component binds to it via `bindService()` and gets a client-server interface. Common for IPC.

And here's a fun twist: a service can be both started *and* bound at the same time.

#### What is the difference between `startService()` and `bindService()`?

Picture two ways of hiring help. `startService()` is like hiring a freelancer -- they work independently, keep going even after you walk away, and you have to explicitly fire them. `bindService()` is like calling tech support -- the connection stays alive while you're on the line, and they hang up the moment you do.

The `BIND_AUTO_CREATE` flag creates the service if it doesn't already exist. Without it, `bindService()` only connects to a service that's already running. If a service is both started and bound, it won't be destroyed until it's stopped *and* all clients have unbound. Both conditions have to be met.

> **🧠 Think about it:** If you call `startService()` and then `bindService()` on the same service, what do you need to do to fully destroy it?

#### Services run on the main thread — what does that mean?

This is one of the biggest misconceptions in Android. The word "background" in "background service" does *not* mean it runs on a background thread. A Service runs on the main (UI) thread by default. If you do a network call or heavy computation in `onStartCommand()`, you're blocking the UI thread and heading straight for an ANR.

You need to manage threading yourself -- coroutines, executors, or dedicated threads. `IntentService` used to handle this for you, but it's deprecated now. Use `WorkManager` with coroutines instead.

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

The return value is basically your service's last will and testament -- it tells the system what to do if the service gets killed while running:

- **`START_STICKY`** -- "Bring me back, but I don't need the old instructions." The system restarts the service with a null intent. Good for music players that should keep running.
- **`START_NOT_STICKY`** -- "If I die, let me stay dead." The system doesn't restart it. Good for one-time work like a quick sync.
- **`START_REDELIVER_INTENT`** -- "Bring me back *with* the original instructions." The system restarts the service and redelivers the last intent. Good for file uploads where you need the original parameters to resume.

#### When should you use Service vs WorkManager?

- **Service** -- for work that must happen *right now* and continuously. WebSocket connections, live location tracking, media playback. It's the "I need this done immediately" option.
- **WorkManager** -- for deferrable work that must eventually complete, even if the app is killed or the device restarts. Uploading photos, syncing data, periodic cleanup. It's the "get to it when you can, but definitely get to it" option.

Here's the real-world problem: background services get killed aggressively by the system, especially on OEM Android like Samsung and Xiaomi. WorkManager survives because it uses JobScheduler on API 23+ and AlarmManager on older versions. Use foreground service for real-time work and WorkManager for everything else.

#### What are the Foreground Service requirements on modern Android?

Google has been tightening the screws on services with every release.

From Android 8.0 (API 26), you can't start a background service when the app is in the background -- the system throws `IllegalStateException`. You must use `startForegroundService()` and call `startForeground()` with a notification within 5 seconds. Miss that window and your app crashes.

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

The manifest is like the blueprint of a building that the city inspector (the Android system) reads before letting anyone move in. The system reads it *before* any of your code runs. It declares:

- All four components (Activities, Services, Broadcast Receivers, Content Providers)
- Permissions your app needs
- Hardware and software features required
- Min and target SDK versions
- Intent filters for each component

Every component must be declared here. Create a Service class but forget to declare it in the manifest? The system won't find it -- no crash, no warning, just silent failure. From Android 12 (API 31), you must explicitly set `android:exported` on every component that has an intent filter or the build fails.

#### What is a Broadcast Receiver and how do you register one?

A Broadcast Receiver is like a police scanner -- it sits quietly and listens for specific events, then springs into action when it hears one. Two ways to set it up:

- **Static** -- declared in `AndroidManifest.xml` with an intent filter. Can respond to broadcasts even when the app is not running.
- **Dynamic** -- registered via `registerReceiver()` in code. Lives only as long as the registering component.

Always call `unregisterReceiver()` in `onStop()` or `onDestroy()` to prevent leaks. Forget this and you'll have a receiver hanging around after the Activity is gone.

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

From Android 8.0 (API 26), Google basically said "too many apps are waking up for broadcasts they don't really need." So now most implicit broadcasts can't be received by manifest-registered (static) receivers. Register a receiver in the manifest for something like `CONNECTIVITY_CHANGE`? It won't be delivered. You must use dynamic registration instead.

A few exceptions still work with static registration -- `ACTION_BOOT_COMPLETED`, `ACTION_LOCALE_CHANGED`, and `ACTION_USB_DEVICE_ATTACHED` among them. These are the ones where it genuinely makes sense to wake up an app that isn't running.

#### What is a Content Provider and when would you use one?

A Content Provider is like a data vending machine with a standardized interface. It manages access to structured data, and it's the official way to share data between apps -- like reading contacts from the device. You can also use it within a single app to abstract different data sources behind a URI-based interface.

The URI pattern is `content://authority/path/id`. The authority identifies the provider (usually your package name), the path specifies the data type, and the optional id targets a specific record. You interact with Content Providers through a **ContentResolver**, never directly -- the resolver is your intermediary that routes requests to the right provider.

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

This is your component's front door lock. `android:exported` controls whether other apps can interact with your component:

- **`true`** -- any app can start your Activity, bind to your Service, or query your Content Provider. Door wide open.
- **`false`** -- only your own app can access it. Locked tight.

Before Android 12, if a component had intent filters, `exported` defaulted to `true`. That's like leaving your front door unlocked just because you put a doorbell on it -- it caused accidental security holes everywhere. Since Android 12, you must explicitly set it on every component with an intent filter. General rule: set `android:exported="false"` unless you have a specific reason to expose the component.

> **🧠 Think about it:** Why would having an intent filter default to `exported="true"` be a security problem?

#### Explain Application Context vs Activity Context.

Both extend `Context` but they have very different lifespans, and mixing them up is one of the most common sources of memory leaks in Android.

- **Application Context** -- tied to the app lifecycle. It lives as long as the entire app process. Use it for singletons, DI, database init, anything that outlives an Activity.
- **Activity Context** -- tied to the Activity lifecycle. It dies when the Activity dies. Use it for UI work like inflating layouts, showing dialogs, starting activities.

Here's where it gets dangerous: pass an Activity context to a singleton, and now that singleton holds a reference to the Activity. The Activity can't be garbage collected even after the user navigates away. Classic memory leak. If the object outlives the Activity, use Application context. But `Dialog` and `Toast` need Activity context on some Android versions because they attach to a window.

#### What is the Binder mechanism and how does IPC work?

Every Android app runs in its own sandboxed process -- like apartments in a building where you can't walk through someone else's walls. One app can't directly access another's memory. **Binder** is Android's IPC kernel driver that acts as a secure mailroom between these apartments.

When you call a method on a bound service in another process, here's what actually happens: Binder serializes the call into a Parcel, sends it through the kernel driver, deserializes it in the target process, runs the method, and returns the result the same way. It's like writing a letter, sending it through the post office, and getting a response -- except it happens in milliseconds.

Three levels of IPC, from most to least powerful:

- **AIDL** -- generates proxy and stub code for multi-threaded cross-process communication. The full power tool.
- **Messenger** -- wraps a Handler for simpler, single-threaded IPC. The convenience wrapper.
- **Content Provider** -- also uses Binder under the hood. Even Intents use Binder for cross-process delivery.

#### What is AIDL and when would you use it over Messenger?

AIDL (Android Interface Definition Language) generates Binder-based IPC code. You define an interface in a `.aidl` file, the build system generates a `Stub` (server side) and a `Proxy` (client side), and you're ready for cross-process calls. AIDL supports concurrent access from multiple clients via the Binder thread pool.

**Messenger** is simpler but limited -- it queues all requests into a single thread via a Handler. Think of it this way: AIDL is like a restaurant with multiple chefs handling orders simultaneously, while Messenger is a food truck with one cook taking orders one at a time. Use AIDL when you need multi-threaded access or complex method signatures with Parcelable objects. Use Messenger for simple single-threaded IPC.

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

From Android 7.0 (API 24), passing a `file://` URI to another app throws `FileUriExposedException`. It's like handing someone your house key instead of meeting them at the door -- raw file paths give too much access and are a security risk.

**FileProvider** is a `ContentProvider` subclass that generates `content://` URIs instead. These grant temporary, controlled access through Android's permission system -- more like a visitor pass that expires. You create a URI with `FileProvider.getUriForFile()` and grant access with `Intent.FLAG_GRANT_READ_URI_PERMISSION`.

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

`LocalBroadcastManager` sent broadcasts within a single app without IPC overhead. It was deprecated because, honestly, it was a messy pattern -- tightly coupled components communicating through untyped Intent extras. You'd stuff data into an Intent, broadcast it, and hope the right receiver picked it up with the right keys. Fragile and hard to debug.

Replacements are much cleaner:

- **LiveData** -- for UI-layer observation.
- **SharedFlow / StateFlow** -- for reactive streams in ViewModels or repositories.

`SharedFlow` with `replay = 0` is the closest replacement for process-wide event delivery.

#### What is an Intent and what are the types?

An Intent is like a note you pass to Android saying "hey, I need someone to do this." Two types:

- **Explicit Intent** -- you write the name of the exact person on the note. "Dear `LoginActivity`, please open." Used for starting components within your own app.
- **Implicit Intent** -- you write *what* you need done without naming who should do it. "Someone please open this URL." The system finds a matching component using intent filters declared in the manifest.

If multiple components match an implicit intent, the system shows a chooser dialog so the user can pick.

#### What are PendingIntents and when do you use them?

A `PendingIntent` is a wrapped-up Intent that you hand to another app, saying "here, you can execute this on my behalf whenever you need to." It runs with your app's identity and permissions even if your app is no longer running. It's like giving someone a signed check -- they can cash it later, and it comes out of your account.

Common uses:

- **Notifications** -- the system executes the PendingIntent when the user taps the notification.
- **AlarmManager** -- triggers an action at a scheduled time.
- **App Widgets** -- handles button clicks in remote views.

Use `FLAG_IMMUTABLE` (required from API 31) unless the PendingIntent needs to be modified by the receiver, in which case use `FLAG_MUTABLE`.

> **🧠 Think about it:** Why would an immutable PendingIntent be more secure than a mutable one?

#### What are ordered broadcasts vs normal broadcasts?

- **Normal broadcasts** (`sendBroadcast()`) -- delivered to all receivers simultaneously. No guaranteed order. It's like shouting in a room -- everyone hears it at once.
- **Ordered broadcasts** (`sendOrderedBroadcast()`) -- delivered one at a time in priority order. Each receiver can modify or abort the broadcast before the next one sees it. Like passing a note down a line where each person can edit or tear it up.

Priority is set via `android:priority` in the intent filter. Ordered broadcasts are rare in modern development -- most use cases have been replaced by more predictable APIs.

### Common Follow-ups

- What happens if you call `startService()` multiple times on the same service? (`onCreate()` runs once, but `onStartCommand()` runs each time)
- Can a service start an Activity? (Yes, but from Android 10+ background activity launches are restricted — show a notification with a PendingIntent instead)
- What is a sticky broadcast? (Deprecated — a broadcast whose Intent sticks around so late-registered receivers can still read it. Replaced by observable data holders)
- How does the system decide which Content Provider to use when multiple share the same authority? (It can't — authority must be unique across the device. Use your package name as the authority)
- What is `ContentObserver`? (Registers for change notifications on a Content Provider URI — react to data changes without polling)
- How do you handle configuration changes in a Service? (Services aren't affected — they don't have a UI. But bound Activities will rebind after recreation)
- Can you run a Service in a separate process? (Yes, using `android:process=":remote"` in the manifest. Communication then requires IPC)
- What is the file descriptor limit? (1024 per process on most devices. Unclosed cursors, streams, and connections can exhaust it and cause crashes)
