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

#### What is ART and how does it differ from Dalvik?

ART (Android Runtime) replaced Dalvik starting from Android 5.0. The key difference is the compilation strategy.

- **Dalvik** used JIT (just-in-time) compilation — it converted DEX bytecode to native code at runtime, every time the app ran. Fast installs, slower startup.
- **ART** originally used AOT (ahead-of-time) compilation — it converted DEX bytecode to native code at install time. Slower installs, better runtime performance.

From Android 7.0, ART uses a hybrid approach. On first install, the app runs with JIT. Over time, ART profiles which methods are frequently called and compiles those ahead of time during idle/charging time. This gives fast installs and optimized runtime performance.

#### What is the difference between cold start, warm start, and hot start?

- **Cold start** — the app's process doesn't exist. The system forks from Zygote, creates `Application`, creates the Activity, and draws the first frame. Slowest launch type.
- **Warm start** — the process exists but the Activity was destroyed. The system recreates the Activity and draws again. Skips process creation and `Application.onCreate()`.
- **Hot start** — the process and Activity are both in memory. The system brings it to the foreground. Fastest.

Android Vitals flags cold start above 5 seconds as excessive. A well-optimized cold start should be under 1-2 seconds.

#### What is the app startup sequence from tap to first frame?

When a user taps an app icon:

- The system sends the launch intent to `ActivityManagerService` (AMS) via Binder IPC.
- AMS checks if the app's process exists. If not, it asks Zygote to fork a new process.
- Zygote forks. The new process calls `ActivityThread.main()`, which sets up the main `Looper` and creates the `Application` object.
- `Application.onCreate()` runs.
- AMS tells the new process to create the target Activity.
- The Activity goes through `onCreate()` → `onStart()` → `onResume()`.
- The first frame is drawn after `onResume()` when the View hierarchy completes its first measure, layout, and draw pass.

Everything in `Application.onCreate()` and `Activity.onCreate()` directly adds to launch time.

#### What is an ANR and what are the thresholds?

ANR (Application Not Responding) is triggered when the main thread is blocked too long. The thresholds:

- **5 seconds** for input events (key press or screen touch).
- **5 seconds** for `BroadcastReceiver.onReceive()` (foreground broadcasts).
- **10 seconds** for `BroadcastReceiver.onReceive()` (background broadcasts).
- A **few seconds** for `Service.onCreate()` and `Service.onStartCommand()`.
- **5 seconds** for calling `startForeground()` after `startForegroundService()`.

When an ANR happens, the system writes a stack trace to `/data/anr/traces.txt`. In production, ANR data shows up in Google Play Console's Android Vitals.

#### What are the most common causes of ANRs?

- Synchronous disk I/O on the main thread — `SharedPreferences.commit()`, database queries, file reads on slow storage.
- Main thread blocked on a synchronized lock held by a background thread.
- Synchronous Binder call to another process that is slow to respond.
- `SharedPreferences.apply()` pending writes blocking `Activity.onPause()` via `QueuedWork.waitToFinish()`. This is tricky because `apply()` looks async but the system forces a flush during activity transitions.
- Deadlock between the main thread and another thread.

Use `StrictMode` during development to catch main-thread I/O. Monitor ANR rates in Android Vitals in production.

#### What is the Zygote process?

Zygote is a special process started during boot. It preloads Android framework classes and common resources into memory, then waits for fork requests. When I launch an app, the system tells Zygote to `fork()` itself. The child process inherits all preloaded classes and resources — that's why app startup is fast. Without Zygote, every app launch would need to reload the entire framework.

#### What is the Application class and when is it initialized?

The `Application` class is the base class for global app state. It's the first component created when the process starts — before any Activity, Service, or Receiver. `onCreate()` is called once and is typically used for initializing analytics, crash reporting, or dependency injection.

```kotlin
class PaymentApp : Application() {

    override fun onCreate() {
        super.onCreate()
        CrashReporter.init(this)
        AnalyticsTracker.init(this)
        DependencyGraph.init(this)
    }
}
```

Heavy work in `Application.onCreate()` directly delays startup because it runs on the main thread before any UI is shown.

#### What is the process importance hierarchy?

Android assigns each process an importance level to decide what to kill when memory is low. From highest to lowest:

- **Foreground process** — hosting an Activity the user is interacting with, a foreground Service, or a BroadcastReceiver running `onReceive()`. Almost never killed.
- **Visible process** — hosting a visible but not foreground Activity (e.g., behind a dialog). Killed only in extreme situations.
- **Service process** — running a started service that isn't foreground. Killed if memory is needed for foreground or visible processes.
- **Cached (background) process** — holding a non-visible Activity. Killed in LRU order.
- **Empty process** — no active components. Killed first.

The system evaluates all components in a process and assigns the highest importance level among them.

#### How does Android handle process death and restoration?

When the system kills a background process, it doesn't notify the app — the process is just gone. But AMS retains information about the Activity stack. When the user navigates back, the system restarts the process, recreates the Activity, and delivers the saved `Bundle` from `onSaveInstanceState()` to `onCreate()` and `onRestoreInstanceState()`.

This is why saving UI state properly is critical. Without it, the user sees a blank screen or loses input after process death. ViewModels don't survive process death — I need `SavedStateHandle` or `onSaveInstanceState()` for that.

#### What is Binder IPC?

Binder is Android's inter-process communication mechanism. Each app runs in its own sandboxed process with its own memory space. Binder is a kernel driver that handles cross-process method calls by serializing arguments into a `Parcel`, sending data through the kernel to the target process, deserializing it, executing the method, and returning the result the same way.

Almost everything in Android uses Binder — starting Activities, binding to Services, querying Content Providers, and system service calls like `getSystemService()`.

#### What is a DEX file?

DEX (Dalvik Executable) is the file format containing compiled bytecode for the Android runtime. The compiler produces `.class` files from Kotlin or Java code, then the `d8` tool converts those into `.dex` files that ART executes. A single DEX file has a 64K method reference limit (65,536).

#### What is Multidex and why is it needed?

A single DEX file can reference at most 64K methods. Most non-trivial apps exceed this. Multidex lets the build system generate multiple DEX files. On Android 5.0+ (API 21+), ART natively loads multiple DEX files, so it works automatically with `minSdk` 21 or higher. Older API levels needed the `multidex` support library.

#### How does `ContentProvider` initialization affect app startup?

ContentProviders declared in the manifest are initialized before `Application.onCreate()`. The system calls `ContentProvider.onCreate()` for every declared provider before the Application even runs. Many libraries (Firebase, WorkManager, old AppCompat) use this to auto-initialize — they register a provider in their manifest that gets merged into yours.

This is why App Startup library exists. It replaces multiple ContentProviders with a single `InitializationProvider` that lazily initializes components, reducing startup overhead.

#### What is AIDL and how is it different from Messenger?

AIDL (Android Interface Definition Language) defines interfaces for Binder-based IPC. I write an interface in a `.aidl` file, and the build system generates a `Stub` (server side) and `Proxy` (client side). AIDL supports concurrent access — multiple clients can call the service simultaneously from the Binder thread pool.

Messenger is simpler. It wraps a `Handler` and queues all requests into a single thread, so there's no concurrency to deal with. Use AIDL for multi-threaded access with complex method signatures. Use Messenger when IPC is simple and single-threaded.

```kotlin
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

#### What is the Low Memory Killer?

The Low Memory Killer (LMK) is a kernel-level mechanism that kills processes when the system runs low on memory. It uses the `oom_adj_score` assigned to each process — lower score means higher importance. When free memory drops below thresholds, LMK kills processes starting from the highest score (least important). From Android 10, Google replaced the in-kernel driver with `lmkd`, a userspace daemon that uses pressure stall information (PSI) for better memory pressure detection.

#### What is the `oom_adj_score` and how is it assigned?

It's a value assigned to each process that tells LMK how important the process is. Range is -1000 (never kill, system processes) to 1000 (kill first). `ActivityManagerService` recalculates it whenever a process's components change state. When an Activity moves to the foreground, the score drops. When it goes to the background, the score rises.

Approximate values:

- **Foreground Activity** — 0
- **Visible Activity** — 100
- **Service process** — 500
- **Cached/background** — 700-900
- **Empty process** — 999

These values vary across Android versions and OEMs.

#### What is ActivityThread and what role does it play?

`ActivityThread` manages the main thread of an app's process. When Zygote forks a new process, execution starts at `ActivityThread.main()`. This method sets up the main `Looper`, creates an `ActivityThread` instance, and calls `Looper.loop()` to start processing messages.

It contains an inner `Handler` subclass called `H` that receives messages from the system — `LAUNCH_ACTIVITY`, `PAUSE_ACTIVITY`, `BIND_SERVICE`, etc. The system sends these via Binder IPC through `ApplicationThread`, and they get dispatched on the main thread. Despite the name, `ActivityThread` manages all components, not just Activities.

#### What happens internally when you call `startActivity()`?

`startActivity()` triggers a Binder IPC call to `ActivityManagerService` in `system_server`. AMS resolves the intent, checks permissions, and finds the target Activity. If the target app's process isn't running, AMS asks Zygote to fork via a Unix domain socket. The new process calls `ActivityThread.main()` and registers its `ApplicationThread` Binder with AMS. AMS sends a `scheduleLaunchActivity` transaction back, which gets dispatched on the main thread through `ActivityThread.H`. The Activity is instantiated via reflection, and lifecycle callbacks run.

The flow involves at least three processes — the calling app, `system_server`, and the target app — all communicating through Binder.

#### How does Zygote preloading work under the hood?

When Android boots, the `init` process starts Zygote. Zygote calls `ZygoteInit.main()`, which preloads the Android framework (classes from `BOOTCLASSPATH`, shared libraries, drawables, color resources) and then enters a socket loop waiting for fork requests. It preloads about 6000+ classes.

Because `fork()` uses copy-on-write, the child process shares these preloaded pages with Zygote until either side modifies them. Multiple apps share the same physical memory pages for framework classes, reducing total RAM usage. On 64-bit devices, there are two Zygote processes — `zygote64` and `zygote` (32-bit) — to support both ABIs.

#### What is the Binder thread pool and what happens when it's exhausted?

Each process has a Binder thread pool with a default max of 16 threads. When a cross-process call arrives, the kernel wakes one of these threads. If all 16 are busy, new Binder calls block until a thread frees up. This can cause cascading ANRs — if `system_server` makes a Binder call to your app and all threads are blocked, `system_server` itself hangs.

A common way to exhaust the pool is having Binder threads do synchronous I/O or wait on locks held by the main thread. The fix is to keep Binder handling fast and offload heavy work to background threads.

#### What is profile-guided optimization in ART?

ART's profile-guided compilation (Android 7.0+) works in stages. On first install, the app runs with JIT. As the user interacts, ART records frequently called methods into a profile at `/data/misc/profiles/`. During idle charging time, a background `dex2oat` job AOT-compiles only those hot methods. On later launches, those run as native code while cold methods are still JIT-compiled.

Baseline Profiles let developers ship a profile with the APK so critical paths are AOT-compiled before the user opens the app. Google reports about 30% improvement in first-launch performance.

#### What is `android:process` and what are the implications of using a separate process?

Adding `android:process=":remote"` to a component in the manifest makes it run in a separate process. This means it gets its own memory space, its own `Application` instance, and its own lifecycle. Static variables are not shared between processes.

Communication between the two processes requires Binder IPC (AIDL, Messenger, or ContentProvider). Separate processes are useful for isolating crash-prone work (like WebView rendering) or keeping a foreground service alive independently from the UI process. But they add complexity and memory overhead since each process loads its own copy of the app's classes.

#### How does the DEX file layout affect startup performance?

A DEX file organizes data into sections — string IDs, type IDs, method IDs, class definitions, and code items. ART memory-maps the file and loads classes on demand. If startup classes are scattered across the file, the system triggers many page faults loading different pages into memory.

Startup Profiles optimize this by rewriting the DEX layout so startup classes sit in contiguous pages, reducing page faults during cold start. ART's `dexlayout` tool performs this optimization using profile data.

#### What is the 16 KB page size change in Android 15?

Starting with Android 15, devices can use 16 KB memory pages instead of 4 KB. Larger pages mean fewer page table entries, faster TLB lookups, and better memory-mapped I/O — Google reports 5-10% improvement in app launch times.

The catch: native code (`.so` files) must be aligned to 16 KB boundaries. Libraries built with 4 KB alignment will crash on 16 KB devices. I'd need to rebuild with `-Wl,-z,max-page-size=16384`. For pure Kotlin/Java apps, ART handles it transparently. But any app with native dependencies needs to verify 16 KB-aligned binaries. Android Studio's APK Analyzer shows the ELF alignment of `.so` files.

### Common Follow-ups

- How does copy-on-write work with Zygote forking?
- What is `system_server` and what services does it host?
- How would you debug a slow cold start using systrace or Perfetto?
- What is the difference between `commit()` and `apply()` in SharedPreferences, and how does `apply()` cause ANRs?
- How does ART handle garbage collection differently from Dalvik?
- What is `ProcessLifecycleOwner` and how does it track foreground/background state?
- How do Baseline Profiles get delivered to end users through the Play Store?
- How does `StrictMode` help catch performance issues during development?
