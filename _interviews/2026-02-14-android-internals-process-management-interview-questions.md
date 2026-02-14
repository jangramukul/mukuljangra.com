---
title: "Android Internals & Process Management"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 29
sequence: 29
description: "Android internals and process management come up frequently in senior-level interviews."
---

## Android Internals & Process Management

Android internals and process management come up frequently in senior-level interviews. Expect questions on how the system boots apps, how processes communicate, and how the runtime executes your code.

### Core Questions (Beginner → Intermediate)

#### Q1: What is ART and how does it differ from Dalvik?

ART (Android Runtime) is the runtime responsible for executing application code. It replaced Dalvik starting from Android 5.0 (Lollipop). The key difference is the compilation strategy:

- **Dalvik** used JIT (just-in-time) compilation — it converted DEX bytecode to native machine code at runtime, every time the app ran. This made installs fast but app startup slower.
- **ART** originally used AOT (ahead-of-time) compilation — it converted the entire DEX bytecode to native code at install time. This made installs slower but runtime performance much better.

Starting from Android 7.0 (Nougat), ART uses a hybrid approach — it combines AOT, JIT, and profile-guided compilation. On first install, the app runs with JIT. Over time, ART profiles which methods are frequently used ("hot" methods) and compiles those ahead of time during idle/charging time. This gives the best of both worlds — fast installs and optimized runtime performance.

#### Q2: What is a DEX file?

DEX (Dalvik Executable) is the file format that contains compiled bytecode for the Android runtime. When you write Kotlin or Java code, the compiler first produces `.class` files, and then the `d8` tool converts those into `.dex` files that ART can execute. A single DEX file has a limit of 64K methods (65,536 method references). This includes methods from your code, libraries, and the Android framework.

#### Q3: What is Multidex and why is it needed?

A single DEX file has a limit of 64K method references. When your app exceeds this limit (which most non-trivial apps do), you need Multidex support. Multidex allows the build system to generate multiple DEX files from a single codebase. On Android 5.0+ (API 21+), ART natively supports loading multiple DEX files, so Multidex works automatically when you set `minSdk` to 21 or higher. For older API levels, you had to add the `multidex` support library and extend `MultiDexApplication`.

#### Q4: What is the Application class and when is it initialized?

The `Application` class is the base class for your app's global state. It is the first component created when your app's process starts — before any Activity, Service, or Receiver. `onCreate()` is called once and is commonly used for initializing libraries like analytics, crash reporting, or dependency injection frameworks.

```kotlin
class PaymentApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Runs once when the process starts, before any Activity
        CrashReporter.init(this)
        AnalyticsTracker.init(this)
        DependencyGraph.init(this)
    }
}
```

Heavy initialization in `Application.onCreate()` directly delays app startup because it runs on the main thread before any UI is shown. This is why libraries like App Startup exist — they let you defer and parallelize initialization.

#### Q5: What is the Zygote process?

Zygote is a special process that the Android system starts during boot. It preloads the Android framework classes and common resources into memory, then waits for requests to fork new app processes. When you launch an app, the system doesn't start a new process from scratch — it tells Zygote to `fork()` itself. The forked child process inherits all the preloaded classes and resources, which is why app startup is fast. Without Zygote, every app launch would need to reload the entire Android framework, and cold starts would take several seconds longer.

#### Q6: What is the app startup sequence from tap to first frame?

When a user taps an app icon, this is the sequence:

- The system sends the launch intent to `ActivityManagerService` (AMS) via Binder IPC.
- AMS checks if the app's process exists. If not, it requests Zygote to fork a new process.
- Zygote forks, and the new process calls `ActivityThread.main()`, which sets up the main `Looper` and creates the `Application` object.
- `Application.onCreate()` runs.
- AMS tells the new process to create the target Activity.
- The Activity goes through `onCreate()` → `onStart()` → `onResume()`.
- The first frame is drawn after `onResume()` when the View hierarchy completes its first measure, layout, and draw pass.

The time from tap to first frame is what users perceive as "launch time." Everything in `Application.onCreate()` and `Activity.onCreate()` directly adds to this time.

#### Q7: What is the process importance hierarchy?

Android assigns each running process an importance level to decide which processes to kill when memory is low. From highest to lowest importance:

- **Foreground process** — hosting an Activity the user is interacting with, a Service running `startForeground()`, or a BroadcastReceiver currently executing `onReceive()`. Almost never killed.
- **Visible process** — hosting an Activity that is visible but not in the foreground (e.g., behind a dialog). Killed only in extreme situations.
- **Service process** — running a started service that is not foreground. Killed if memory is needed for foreground or visible processes.
- **Cached (background) process** — holding an Activity that is not visible. The system maintains a list of these and kills them in LRU (least recently used) order.
- **Empty process** — no active components. Kept around for caching purposes but killed first when memory is needed.

The system evaluates all running components in a process and assigns it the highest importance level among them.

#### Q8: What is the Low Memory Killer (LMK)?

The Low Memory Killer is a kernel-level mechanism that kills processes when the system is running low on memory. It uses the `oom_adj_score` assigned to each process — a lower score means higher importance. When free memory drops below defined thresholds, LMK kills processes starting from the highest `oom_adj_score` (least important). Starting from Android 10, Google replaced the in-kernel LMK driver with `lmkd`, a userspace daemon that uses pressure stall information (PSI) from the kernel for more accurate memory pressure detection.

#### Q9: What is Binder IPC?

Binder is Android's inter-process communication mechanism. Every Android app runs in its own sandboxed process with its own memory space, so one app cannot directly access another app's memory. Binder is a kernel driver that handles cross-process method calls by serializing arguments into a `Parcel`, sending the data through the kernel to the target process, deserializing it, executing the method, and returning the result the same way. Almost everything in Android uses Binder — starting Activities, binding to Services, querying Content Providers, and even system service calls like `getSystemService()`.

#### Q10: What is AIDL and how is it different from Messenger?

AIDL (Android Interface Definition Language) is used for defining interfaces for Binder-based IPC. You write an interface in a `.aidl` file, and the build system generates a `Stub` class (server side) and a `Proxy` class (client side). AIDL supports concurrent access — multiple clients can call the service simultaneously from the Binder thread pool.

Messenger is a simpler IPC mechanism that wraps a `Handler`. All requests are queued into a single thread, so there are no concurrency issues. Use AIDL when you need multi-threaded access and complex method signatures with custom Parcelable objects. Use Messenger when your IPC is simple and single-threaded.

```kotlin
// AIDL client binding
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

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is an ANR and what are the exact thresholds?

ANR (Application Not Responding) is triggered when the main thread is blocked for too long. The thresholds are:

- **5 seconds** for input events (key press or screen touch).
- **5 seconds** for `BroadcastReceiver.onReceive()` (foreground broadcasts).
- **10 seconds** for `BroadcastReceiver.onReceive()` (background broadcasts).
- A **few seconds** for `Service.onCreate()` and `Service.onStartCommand()`.
- **5 seconds** for calling `startForeground()` after `startForegroundService()`.

When an ANR happens, the system writes a stack trace to `/data/anr/traces.txt` (or `/data/anr/anr_*` on newer versions). In production, ANR data is available in Google Play Console's Android Vitals.

#### Q12: What are the most common causes of ANRs?

The main causes are:

- Synchronous disk I/O on the main thread — `SharedPreferences.commit()`, database queries, `File.exists()` on slow storage.
- Main thread blocked on a synchronized lock held by a background thread.
- Synchronous Binder call to another process that is slow to respond.
- `SharedPreferences.apply()` pending writes blocking `Activity.onPause()` via `QueuedWork.waitToFinish()`. This one is particularly tricky because `apply()` looks asynchronous but the system forces a flush during activity transitions.
- Deadlock between the main thread and another thread.

The best approach is to use `StrictMode` during development to catch accidental main-thread I/O, and monitor ANR rates in Android Vitals in production.

#### Q13: How does Zygote preloading actually work?

When Android boots, the `init` process starts Zygote. Zygote calls `ZygoteInit.main()`, which does two things: it preloads the Android framework (classes from `BOOTCLASSPATH`, shared libraries, drawables, color resources) and then enters a socket loop waiting for fork requests. The preloading step loads about 6000+ classes into memory. Because `fork()` uses copy-on-write semantics, the child process shares these preloaded pages with Zygote until either process modifies them. This means multiple apps share the same physical memory pages for framework classes, reducing total RAM usage across the system.

On 64-bit devices, there are actually two Zygote processes — `zygote64` and `zygote` (32-bit) — to support both ABIs.

#### Q14: What is ActivityThread and what role does it play?

`ActivityThread` is the class that manages the main thread of an app's process. When Zygote forks a new process, execution starts at `ActivityThread.main()`. This method sets up the main `Looper`, creates an `ActivityThread` instance, and calls `Looper.loop()` to start processing messages.

`ActivityThread` contains the inner class `H` (a Handler subclass) that receives messages from the system like `LAUNCH_ACTIVITY`, `PAUSE_ACTIVITY`, `BIND_SERVICE`, etc. The system sends these messages via Binder IPC through `ApplicationThread` (a Binder stub), and they get dispatched on the main thread through `H`. Despite the name, `ActivityThread` manages all components — Activities, Services, Broadcast Receivers, and Content Providers — not just Activities.

#### Q15: Explain the Binder thread pool. What happens when it's exhausted?

Each process has a Binder thread pool with a default maximum of 16 threads. When a cross-process Binder call arrives, the kernel wakes up one of these threads to handle the request. If all 16 threads are busy handling incoming calls, new Binder calls from other processes block until a thread becomes available. This can cause cascading ANRs — if the system_server makes a Binder call to your app and all Binder threads are blocked, the system_server itself can hang while waiting.

A common way to exhaust the pool is having Binder threads doing synchronous I/O or waiting on locks held by the main thread. The fix is to keep Binder call handling fast — offload heavy work to background threads and return quickly.

#### Q16: What is the difference between hot start, warm start, and cold start?

- **Cold start** — the app's process does not exist. The system forks from Zygote, creates `Application`, creates the Activity, and draws the first frame. This is the slowest launch type.
- **Warm start** — the process exists but the Activity was destroyed. The system recreates the Activity and draws again. Skips process creation and `Application.onCreate()`.
- **Hot start** — the process exists and the Activity is in memory (in the back stack). The system just brings it to the foreground. This is the fastest.

Google Play Android Vitals considers cold start time above 5 seconds as excessive. For most apps, a well-optimized cold start should be under 1-2 seconds.

#### Q17: How does `ContentProvider` initialization affect app startup?

ContentProviders declared in the manifest are initialized before `Application.onCreate()`. The system calls `ContentProvider.onCreate()` for every declared provider before your Application's `onCreate()` even runs. Many libraries (like Firebase, WorkManager, and the old AppCompat) use ContentProviders to auto-initialize themselves — they register a provider in their own manifest that gets merged into yours.

This is why App Startup library was created. It replaces multiple ContentProviders with a single one (`InitializationProvider`) that lazily initializes components, reducing the startup overhead.

#### Q18: What is profile-guided optimization in ART?

ART's profile-guided compilation (introduced in Android 7.0) works in stages. On first install, the app runs interpreted with JIT compilation. As the user interacts with the app, ART records which methods are "hot" (frequently called) into a profile file stored at `/data/misc/profiles/`. During idle time when the device is charging, a background `dex2oat` job reads these profiles and AOT-compiles only the hot methods. On subsequent launches, those methods run as native code while cold methods are still JIT-compiled or interpreted.

Baseline Profiles let developers ship a profile with the APK so that critical paths are AOT-compiled before the user even opens the app. This improves first-launch performance by about 30% according to Google's measurements.

#### Q19: What happens internally when you call `startActivity()`?

Calling `startActivity()` triggers a Binder IPC call to `ActivityManagerService` (AMS) in the `system_server` process. AMS resolves the intent, checks permissions, and determines the target Activity. If the target app's process isn't running, AMS sends a fork request to Zygote via a Unix domain socket. Zygote forks and the new process calls `ActivityThread.main()`. The new process then registers its `ApplicationThread` Binder with AMS. AMS sends a `scheduleLaunchActivity` transaction back to the app process, which gets dispatched on the main thread through `ActivityThread.H`. The Activity is instantiated via reflection, and its lifecycle callbacks run.

The entire flow involves at least three processes — the calling app, `system_server`, and the target app — communicating through Binder IPC.

#### Q20: What is the `oom_adj_score` and how does the system assign it?

The `oom_adj_score` is a value assigned to each process that tells the Low Memory Killer how important the process is. The range is from -1000 (never kill, reserved for system processes) to 1000 (kill first). `ActivityManagerService` recalculates this value whenever a process's components change state. For example, when an Activity moves to the foreground, AMS lowers the score (higher importance). When the Activity goes to the background, the score increases.

Approximate values:

- **Foreground Activity** — 0 (highest app importance)
- **Visible Activity** — 100
- **Service process** — 500
- **Cached/background** — 700-900
- **Empty process** — 999

These values are not fixed API and vary across Android versions and OEMs. The key point is that the system dynamically adjusts process importance based on what components are active.

#### Q21: How does Android handle process death and restoration?

When the system kills a background process to reclaim memory, it doesn't notify the app — the process is just gone. But the system retains information about the Activity stack in `ActivityManagerService`. When the user navigates back to the killed app, the system restarts the process, recreates the Activity, and delivers the saved `Bundle` from `onSaveInstanceState()` to `onCreate()` and `onRestoreInstanceState()`. This is why saving UI state properly is critical — without it, the user sees a blank screen or loses their input after process death. ViewModels don't survive process death; you need `SavedStateHandle` or `onSaveInstanceState()` for that.

#### Q22: How does the DEX file layout affect startup performance?

A DEX file organizes its data into sections — string IDs, type IDs, method IDs, class definitions, and code items. When ART loads a DEX file, it memory-maps it and accesses classes on demand. If the classes needed at startup are scattered across the DEX file, the system triggers many page faults as it loads different pages into memory. Startup Profiles optimize this by rewriting the DEX layout so that startup classes are grouped together in contiguous pages, reducing page faults during cold start. The `dexlayout` tool in ART performs this optimization based on profile data.

#### Q23: What is the 16 KB page size requirement and why does it matter?

Starting with Android 15, devices can use 16 KB memory pages instead of the traditional 4 KB pages. A memory page is the smallest unit of memory the OS manages. Larger pages mean fewer page table entries, faster TLB lookups, and better memory-mapped I/O performance — Google reports up to 5-10% improvement in app launch times.

The catch: native code (NDK libraries, `.so` files) must be aligned to 16 KB boundaries. If your app or any of its dependencies includes native libraries built with 4 KB alignment, they'll crash on 16 KB devices. You need to rebuild with `-Wl,-z,max-page-size=16384`.

For pure Kotlin/Java apps, the change is transparent — ART handles it. But if you use libraries with native code (like SQLCipher, Realm, FFmpeg, or ML libraries), you need to verify they ship 16 KB-aligned binaries. Android Studio's APK Analyzer shows the ELF alignment of `.so` files. This is a compatibility check that every app targeting Android 15 should perform.

### Common Follow-ups

- What is `android:process=":remote"` and what are the implications of running a component in a separate process?
- How does copy-on-write work with Zygote forking?
- What is `system_server` and what services does it host?
- How would you debug a slow cold start using systrace/Perfetto?
- What is the difference between `commit()` and `apply()` in SharedPreferences, and how does `apply()` cause ANRs?
- How does ART handle garbage collection differently from Dalvik?
- What is `ProcessLifecycleOwner` and how does it track app foreground/background state?
- How do Baseline Profiles get delivered to end users through Play Store?
