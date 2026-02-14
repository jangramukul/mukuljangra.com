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

This is deep system-level stuff, but once you get it, everything else clicks. Understanding how Android boots your app, manages processes, and handles memory is what separates senior engineers from everyone else. Let's get into it.

#### What is ART and how does it differ from Dalvik?

ART (Android Runtime) replaced Dalvik starting from Android 5.0, and the core difference comes down to *when* your code gets compiled to native machine code.

- **Dalvik** used JIT (just-in-time) compilation — it converted DEX bytecode to native code at runtime, every time the app ran. Think of it like translating a book page by page as you read it. Fast to start reading, but you're doing translation work on every page turn.
- **ART** originally used AOT (ahead-of-time) compilation — it converted DEX bytecode to native code at install time. Now the whole book is translated before you open it. Slower install, but reading is smooth.

From Android 7.0, ART got smart about this. It uses a hybrid approach — on first install, the app runs with JIT. Over time, ART profiles which methods are frequently called and compiles those ahead of time during idle/charging time. It's like having a translator who notices which chapters you reread most and pre-translates just those. Fast installs *and* optimized runtime performance.

#### What is the difference between cold start, warm start, and hot start?

Think of it like arriving at a restaurant:

- **Cold start** — the restaurant is closed. Someone has to unlock the doors, turn on the lights, fire up the kitchen, and cook your food from scratch. The app's process doesn't exist, so the system forks from Zygote, creates `Application`, creates the Activity, and draws the first frame. Slowest launch type.
- **Warm start** — the restaurant is open and the kitchen is running, but your table was cleared. The process exists but the Activity was destroyed. The system recreates the Activity and draws again. Skips process creation and `Application.onCreate()`.
- **Hot start** — your table is set, food is still warm. The process and Activity are both in memory. The system just brings it to the foreground. Fastest.

Android Vitals flags cold start above 5 seconds as excessive. A well-optimized cold start should be under 1-2 seconds.

#### What is the app startup sequence from tap to first frame?

When a user taps an app icon, here's the chain reaction:

- The system sends the launch intent to `ActivityManagerService` (AMS) via Binder IPC.
- AMS checks if the app's process exists. If not, it asks Zygote to fork a new process.
- Zygote forks. The new process calls `ActivityThread.main()`, which sets up the main `Looper` and creates the `Application` object.
- `Application.onCreate()` runs.
- AMS tells the new process to create the target Activity.
- The Activity goes through `onCreate()` → `onStart()` → `onResume()`.
- The first frame is drawn after `onResume()` when the View hierarchy completes its first measure, layout, and draw pass.

Here's the thing — everything in `Application.onCreate()` and `Activity.onCreate()` directly adds to launch time. Every SDK you initialize, every database you open, every analytics call you make in those methods is time the user spends staring at a blank screen.

#### What is an ANR and what are the thresholds?

ANR (Application Not Responding) is Android's way of saying "your main thread has been blocked so long that the user thinks the app is frozen." The system has specific patience thresholds:

- **5 seconds** for input events (key press or screen touch).
- **5 seconds** for `BroadcastReceiver.onReceive()` (foreground broadcasts).
- **10 seconds** for `BroadcastReceiver.onReceive()` (background broadcasts).
- A **few seconds** for `Service.onCreate()` and `Service.onStartCommand()`.
- **5 seconds** for calling `startForeground()` after `startForegroundService()`.

When an ANR happens, the system writes a stack trace to `/data/anr/traces.txt`. In production, ANR data shows up in Google Play Console's Android Vitals. That traces file is your crime scene report — it tells you exactly which thread was stuck and what it was waiting on.

#### What are the most common causes of ANRs?

- Synchronous disk I/O on the main thread — `SharedPreferences.commit()`, database queries, file reads on slow storage.
- Main thread blocked on a synchronized lock held by a background thread.
- Synchronous Binder call to another process that is slow to respond.
- `SharedPreferences.apply()` pending writes blocking `Activity.onPause()` via `QueuedWork.waitToFinish()`. This one is sneaky — `apply()` *looks* async but the system forces a flush during activity transitions. It's like telling someone "I'll do it later" and then being forced to do it right now anyway.
- Deadlock between the main thread and another thread.

Use `StrictMode` during development to catch main-thread I/O. Monitor ANR rates in Android Vitals in production.

#### What is the Zygote process?

Zygote is like a master template that Android creates at boot time. It preloads all the Android framework classes and common resources into memory, then sits there waiting. When you launch an app, the system tells Zygote to `fork()` itself. The child process inherits all those preloaded classes and resources instantly — that's why app startup is fast.

Without Zygote, every single app launch would need to reload the entire Android framework from scratch. Imagine if every time you opened an app, it had to re-read thousands of framework classes from disk. Zygote is the reason that doesn't happen.

> **🧠 Think about it:** If Zygote preloads everything into memory and then forks, wouldn't that mean every app has its own copy of the framework, wasting a ton of RAM? (Hint: look up copy-on-write — it's covered later in this post.)

#### What is the Application class and when is it initialized?

The `Application` class is the base class for global app state. It's the very first component created when the process starts — before any Activity, Service, or Receiver even exists. `onCreate()` is called once and is typically used for initializing analytics, crash reporting, or dependency injection.

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

Here's the thing — heavy work in `Application.onCreate()` directly delays startup because it runs on the main thread before any UI is shown. Every millisecond you spend here is a millisecond the user stares at nothing.

#### What is the process importance hierarchy?

Android assigns each process an importance level to decide what to kill when memory gets tight. Think of it like a lifeboat on a sinking ship — the system decides who stays based on how important they are right now. From highest to lowest priority:

- **Foreground process** — hosting an Activity the user is interacting with, a foreground Service, or a BroadcastReceiver running `onReceive()`. Almost never killed.
- **Visible process** — hosting a visible but not foreground Activity (e.g., behind a dialog). Killed only in extreme situations.
- **Service process** — running a started service that isn't foreground. Killed if memory is needed for foreground or visible processes.
- **Cached (background) process** — holding a non-visible Activity. Killed in LRU order.
- **Empty process** — no active components. First to go.

The system evaluates all components in a process and assigns the highest importance level among them. So if your process has both a cached Activity and a foreground Service, the whole process gets the foreground Service's priority.

#### How does Android handle process death and restoration?

When the system kills a background process, it doesn't send your app a polite goodbye — the process is just gone. But AMS retains information about the Activity stack. When the user navigates back, the system restarts the process, recreates the Activity, and delivers the saved `Bundle` from `onSaveInstanceState()` to `onCreate()` and `onRestoreInstanceState()`.

This is why saving UI state properly is critical. Without it, the user comes back to a blank screen or loses everything they typed. And here's a gotcha that catches people — ViewModels don't survive process death. They survive configuration changes, sure, but process death wipes them out. You need `SavedStateHandle` or `onSaveInstanceState()` for that.

#### What is Binder IPC?

Binder is Android's inter-process communication mechanism. Think of each app as living in its own apartment with no shared walls — they can't just reach into each other's memory. Binder is the postal service between apartments. It's a kernel driver that handles cross-process method calls by serializing arguments into a `Parcel`, sending data through the kernel to the target process, deserializing it, executing the method, and returning the result the same way.

Almost everything in Android uses Binder — starting Activities, binding to Services, querying Content Providers, and system service calls like `getSystemService()`. It's the glue holding the entire system together.

#### What is a DEX file?

DEX (Dalvik Executable) is the file format containing compiled bytecode for the Android runtime. The compiler produces `.class` files from Kotlin or Java code, then the `d8` tool converts those into `.dex` files that ART executes. A single DEX file has a 64K method reference limit (65,536) — which sounds like a lot until you add a few libraries and blow right past it.

#### What is Multidex and why is it needed?

A single DEX file can reference at most 64K methods. Most non-trivial apps exceed this pretty quickly. Multidex lets the build system generate multiple DEX files. On Android 5.0+ (API 21+), ART natively loads multiple DEX files, so it works automatically with `minSdk` 21 or higher. Older API levels needed the `multidex` support library, but at this point, if your `minSdk` is below 21, you have bigger problems.

#### How does `ContentProvider` initialization affect app startup?

Here's a fun one — ContentProviders declared in the manifest are initialized *before* `Application.onCreate()`. The system calls `ContentProvider.onCreate()` for every declared provider before the Application even runs. And here's the kicker: many libraries (Firebase, WorkManager, old AppCompat) use this trick to auto-initialize themselves. They register a provider in their manifest that gets merged into yours, and suddenly you've got five ContentProviders all running code before your app even gets a chance to start.

This is exactly why the App Startup library exists. It replaces multiple ContentProviders with a single `InitializationProvider` that lazily initializes components, reducing startup overhead.

> **🧠 Think about it:** If ContentProviders run before `Application.onCreate()`, and libraries can sneak their own providers into your manifest via manifest merging, how would you even know which ones are slowing down your startup? (Hint: check your merged manifest.)

#### What is AIDL and how is it different from Messenger?

AIDL (Android Interface Definition Language) defines interfaces for Binder-based IPC. You write an interface in a `.aidl` file, and the build system generates a `Stub` (server side) and `Proxy` (client side). AIDL supports concurrent access — multiple clients can call the service simultaneously from the Binder thread pool.

Messenger is the simpler cousin. It wraps a `Handler` and queues all requests into a single thread, so there's no concurrency to deal with. It's like the difference between a restaurant with one waiter handling tables one at a time (Messenger) versus a full staff serving everyone simultaneously (AIDL). Use AIDL for multi-threaded access with complex method signatures. Use Messenger when IPC is simple and single-threaded.

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

The Low Memory Killer (LMK) is the system's bouncer. When the device runs low on memory, LMK decides who gets kicked out. It uses the `oom_adj_score` assigned to each process — lower score means higher importance. When free memory drops below thresholds, LMK kills processes starting from the highest score (least important).

From Android 10, Google replaced the in-kernel driver with `lmkd`, a userspace daemon that uses pressure stall information (PSI) for better memory pressure detection. The old kernel-based approach was blunt — the new one is smarter about when memory pressure is actually becoming a problem.

#### What is the `oom_adj_score` and how is it assigned?

It's a value assigned to each process that tells LMK how important the process is. Think of it as a target on your back — the bigger the number, the bigger the target. Range is -1000 (untouchable, system processes) to 1000 (first to go). `ActivityManagerService` recalculates it whenever a process's components change state. When an Activity moves to the foreground, the score drops. When it goes to the background, the score rises.

Approximate values:

- **Foreground Activity** — 0
- **Visible Activity** — 100
- **Service process** — 500
- **Cached/background** — 700-900
- **Empty process** — 999

These values vary across Android versions and OEMs.

#### What is ActivityThread and what role does it play?

Despite the name, `ActivityThread` manages *all* components in your app's process, not just Activities. When Zygote forks a new process, execution starts at `ActivityThread.main()`. This method sets up the main `Looper`, creates an `ActivityThread` instance, and calls `Looper.loop()` to start processing messages.

It contains an inner `Handler` subclass called `H` that receives messages from the system — `LAUNCH_ACTIVITY`, `PAUSE_ACTIVITY`, `BIND_SERVICE`, etc. The system sends these via Binder IPC through `ApplicationThread`, and they get dispatched on the main thread. So every lifecycle callback you've ever written? It started as a message dispatched through `ActivityThread.H`.

#### What happens internally when you call `startActivity()`?

What looks like a single method call is actually a cross-process relay race involving at least three processes.

`startActivity()` triggers a Binder IPC call to `ActivityManagerService` in `system_server`. AMS resolves the intent, checks permissions, and finds the target Activity. If the target app's process isn't running, AMS asks Zygote to fork via a Unix domain socket. The new process calls `ActivityThread.main()` and registers its `ApplicationThread` Binder with AMS. AMS sends a `scheduleLaunchActivity` transaction back, which gets dispatched on the main thread through `ActivityThread.H`. The Activity is instantiated via reflection, and lifecycle callbacks run.

The calling app, `system_server`, and the target app — three separate processes, all communicating through Binder, just to open a screen.

#### How does Zygote preloading work under the hood?

When Android boots, the `init` process starts Zygote. Zygote calls `ZygoteInit.main()`, which preloads the Android framework (classes from `BOOTCLASSPATH`, shared libraries, drawables, color resources) and then enters a socket loop waiting for fork requests. It preloads about 6000+ classes.

Now here's where it gets interesting. Because `fork()` uses copy-on-write, the child process shares these preloaded pages with Zygote until either side modifies them. It's like photocopying a textbook — but instead of actually copying it, everyone reads the same original until someone writes in the margins, and *only that page* gets a real copy. Multiple apps share the same physical memory pages for framework classes, reducing total RAM usage significantly. On 64-bit devices, there are two Zygote processes — `zygote64` and `zygote` (32-bit) — to support both ABIs.

#### What is the Binder thread pool and what happens when it's exhausted?

Each process has a Binder thread pool with a default max of 16 threads. When a cross-process call arrives, the kernel wakes one of these threads to handle it. If all 16 are busy, new Binder calls block until a thread frees up.

This can cause cascading failures. If `system_server` makes a Binder call to your app and all your Binder threads are blocked, `system_server` itself hangs waiting for a response — and now the whole system feels sluggish. It's like a highway on-ramp that's backed up so far it blocks the main highway.

A common way to exhaust the pool is having Binder threads do synchronous I/O or wait on locks held by the main thread. The fix is to keep Binder handling fast and offload heavy work to background threads.

> **🧠 Think about it:** If your app's Binder thread pool is exhausted and `system_server` is trying to deliver a broadcast to your app, what happens to the system? Now imagine that happening on multiple apps simultaneously.

#### What is profile-guided optimization in ART?

ART's profile-guided compilation (Android 7.0+) works in stages, and it's genuinely clever. On first install, the app runs with JIT — no compilation delay. As the user interacts, ART quietly records which methods are frequently called into a profile at `/data/misc/profiles/`. During idle charging time, a background `dex2oat` job AOT-compiles only those hot methods. On later launches, those run as native code while cold methods are still JIT-compiled.

It's like a highway department that watches which roads get the most traffic, then paves only those roads during off-hours. You get smooth driving where it matters most without paving every back alley.

Baseline Profiles let developers ship a profile with the APK so critical paths are AOT-compiled before the user even opens the app. Google reports about 30% improvement in first-launch performance.

#### What is `android:process` and what are the implications of using a separate process?

Adding `android:process=":remote"` to a component in the manifest makes it run in a separate process. This means it gets its own memory space, its own `Application` instance, and its own lifecycle. Static variables are not shared between processes — this trips people up constantly.

Communication between the two processes requires Binder IPC (AIDL, Messenger, or ContentProvider). Separate processes are useful for isolating crash-prone work (like WebView rendering) or keeping a foreground service alive independently from the UI process. But they add real complexity and memory overhead since each process loads its own copy of the app's classes. It's not free — you're essentially running two mini-apps.

#### How does the DEX file layout affect startup performance?

A DEX file organizes data into sections — string IDs, type IDs, method IDs, class definitions, and code items. ART memory-maps the file and loads classes on demand. If startup classes are scattered across the file, the system triggers many page faults loading different pages into memory. It's like reading a book where every other sentence is on a different page — you spend all your time flipping instead of reading.

Startup Profiles optimize this by rewriting the DEX layout so startup classes sit in contiguous pages, reducing page faults during cold start. ART's `dexlayout` tool performs this optimization using profile data.

#### What is the 16 KB page size change in Android 15?

Starting with Android 15, devices can use 16 KB memory pages instead of 4 KB. Larger pages mean fewer page table entries, faster TLB lookups, and better memory-mapped I/O — Google reports 5-10% improvement in app launch times.

But here's the catch: native code (`.so` files) must be aligned to 16 KB boundaries. Libraries built with 4 KB alignment will crash on 16 KB devices. You'd need to rebuild with `-Wl,-z,max-page-size=16384`. For pure Kotlin/Java apps, ART handles it transparently. But any app with native dependencies needs to verify 16 KB-aligned binaries. Android Studio's APK Analyzer shows the ELF alignment of `.so` files.

### Common Follow-ups

- How does copy-on-write work with Zygote forking?
- What is `system_server` and what services does it host?
- How would you debug a slow cold start using systrace or Perfetto?
- What is the difference between `commit()` and `apply()` in SharedPreferences, and how does `apply()` cause ANRs?
- How does ART handle garbage collection differently from Dalvik?
- What is `ProcessLifecycleOwner` and how does it track foreground/background state?
- How do Baseline Profiles get delivered to end users through the Play Store?
- How does `StrictMode` help catch performance issues during development?
