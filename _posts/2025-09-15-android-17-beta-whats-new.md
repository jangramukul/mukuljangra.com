---
title: Android 17 Beta 1 — What's New and What You Need to Prepare
layout: post
categories: post
tags:
  - Android
---

When Android 16 shipped the resizability requirements last year, I figured most teams would get a comfortable grace period before enforcement got serious. We did. And most teams used that grace period to do absolutely nothing. With Android 17 Beta 1, that window is closed. Google has removed the opt-out that Android 16 offered for orientation, resizability, and aspect ratio restrictions on large screens. If your app still hardcodes portrait mode or breaks when resized, Android 17 is where that stops being a minor inconvenience and starts being a real problem.

I went through this transition with our app earlier this year. We had `screenOrientation="portrait"` scattered across 30+ Activities, hardcoded layout assumptions in custom views, and configuration change handlers that basically destroyed and recreated everything without preserving state. Making the app genuinely adaptive took three sprints instead of one. But the result was worth it — our app now works on tablets, foldables, desktop mode, and freeform windows without any special handling. Here's what Android 17 changes, what it adds, and what you need to prepare for.

## The Resizability Opt-Out Is Gone

Android 16 introduced the idea that apps targeting API 36 should be resizable by default on large screens (sw >= 600dp). It ignored `screenOrientation`, `resizeableActivity`, `minAspectRatio`, and `maxAspectRatio` on those devices — but it gave developers a temporary opt-out to buy migration time. Android 17 removes that opt-out entirely. If your app targets Android 17, those manifest attributes are simply ignored on any display with a smallest width of 600dp or more. No exceptions, no escape hatch.

Here's the thing — this isn't just about tablets anymore. Samsung DeX, Chromebooks, foldables in different postures, and desktop windowing environments all create scenarios where your app window is an arbitrary size. The manifest values that get ignored include `portrait`, `reversePortrait`, `sensorPortrait`, `landscape`, `reverseLandscape`, and their variants — both as `screenOrientation` attributes and via `setRequestedOrientation()` at runtime. Even `getRequestedOrientation()` is affected. The system treats your app as fully resizable unless you're a game (declared via `android:appCategory="game"`) or the screen's smallest width is under 600dp.

The reframe moment for me was realizing this isn't Google punishing lazy developers. It's the logical consequence of where Android is going. When your app might be running in a freeform window, split-screen, desktop windowing, or on a connected display, the concept of "my app only works in portrait" doesn't make sense anymore. The app doesn't own its window geometry. The system does. Once I started thinking of window size as a runtime input — like network connectivity or locale — the architecture decisions became much clearer.

## Configuration Changes and State Survival

This is where most apps break during the migration. When the window resizes, Android triggers configuration changes — `screenSize`, `smallestScreenSize`, `orientation`. If your Activity doesn't handle these properly, it gets destroyed and recreated. That's fine if your state management is solid. In a lot of codebases, it's not.

The most common issue I saw was Activities storing transient state in member variables instead of ViewModel or `SavedStateHandle`. A user halfway through a checkout form, the device folds or rotates, the Activity recreates, and the form is blank. The official docs for [saving UI states](https://developer.android.com/topic/libraries/architecture/saving-states) cover this well, but the gap between knowing the theory and finding every instance in a mature codebase is significant. We found state bugs in screens that hadn't been touched in two years.

For Compose apps, the situation is better. Composable functions naturally handle recomposition on configuration changes. If you're using `remember` and `rememberSaveable` correctly, your state survives Activity recreation. The pain shows up more in hybrid apps that mix XML layouts with Compose, or apps that override `onConfigurationChanged` to do manual layout swapping — a pattern that Android 17 makes increasingly fragile.

```kotlin
class OrderFormActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val windowSizeClass = calculateWindowSizeClass(this)
            OrderFormScreen(windowSizeClass = windowSizeClass)
        }
    }
}

@Composable
fun OrderFormScreen(windowSizeClass: WindowSizeClass) {
    val viewModel: OrderFormViewModel = viewModel()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    when (windowSizeClass.widthSizeClass) {
        WindowWidthSizeClass.Compact -> CompactOrderForm(uiState, viewModel::onEvent)
        WindowWidthSizeClass.Medium -> MediumOrderForm(uiState, viewModel::onEvent)
        WindowWidthSizeClass.Expanded -> ExpandedOrderForm(uiState, viewModel::onEvent)
    }
}
```

The `WindowSizeClass` API from the Jetpack library is the right abstraction here. Don't hardcode breakpoints in dp values — use Compact, Medium, and Expanded as your three layout categories. This covers phones, foldables, and tablets without trying to design for every possible pixel width. The window size class recalculates automatically when the window resizes, so your Composable naturally adapts without any manual configuration change handling.

## The Lock-Free MessageQueue

This one flew under the radar for a lot of developers, but it's potentially the most impactful internal change in Android 17. Since the very first Android release, `MessageQueue` — the backbone of the `Looper`/`Handler` system that drives every Android app's main thread — used a single lock to manage its task queue. Background threads posting to the main thread had to acquire that lock, and if the main thread was holding it while processing messages, the background thread would block. This lock contention was a real source of dropped frames and UI jank.

Android 17 replaces this with a completely new lock-free implementation. The performance improvement should be measurable — fewer missed frames, less contention. But there's a catch. If your app or any of your dependencies use reflection to access `MessageQueue` internals (like the private `mMessages` field), that code will break. The `mMessages` field still exists for binary compatibility, but it's always `null` in the new implementation.

The practical impact hits testing libraries hardest. Espresso relied on reflection to determine when the main thread was idle. You need Espresso 3.7.0 or newer for Android 17 compatibility. Robolectric users with `@LooperMode(LEGACY)` need to migrate to `@LooperMode(PAUSED)` and update to Robolectric 4.17+. If you don't update these dependencies before targeting Android 17, your test suite will break in confusing ways — tests that pass on Android 16 will fail or hang on 17.

## Background Audio Hardening

Android 17 enforces new restrictions on background audio interactions. If your app tries to play audio, request audio focus, or change volume while it's not in a valid lifecycle state, those calls fail silently. No exception, no error message — just silence. The audio focus API returns `AUDIOFOCUS_REQUEST_FAILED`, but playback and volume APIs simply do nothing.

The fix is straightforward but strict: if your app needs to play audio without a visible Activity, it must have a foreground service with while-in-use (WIU) capabilities. That means the foreground service was started while the app was in the foreground, or in response to an explicit user action like a media key press or notification interaction. A foreground service started in response to `BOOT_COMPLETE` won't have WIU capabilities, so audio from it will be suppressed.

If you're using the Media3 library's `MediaSessionService`, you're probably fine — the library handles the lifecycle management correctly. If you're managing foreground services manually for audio playback, audit your implementation. The silent failure is what makes this change dangerous — your app won't crash, it'll just stop making sound, and tracking down why requires understanding the WIU model.

## Security and Privacy Changes

Android 17 continues the platform's push toward secure-by-default. A few changes stand out.

### Localhost Protections

Cross-app communication over the loopback interface (`127.0.0.1`, `::1`) now requires a new install-time permission: `USE_LOOPBACK_INTERFACE`. Both the sending and receiving app must declare it. If your app targets Android 17 and communicates with other apps via localhost sockets, you'll get `EPERM` errors without this permission. Intra-app loopback traffic is unaffected. Apps targeting API 36 or lower get this permission auto-granted if they hold `INTERNET`, but if the receiving app updates to target Android 17 without requesting the permission, incoming connections from other apps get rejected.

### Certificate Transparency by Default

Certificate transparency (CT) is now enabled by default for apps targeting Android 17. Android 16 made it available but opt-in. This is a good security improvement that verifies TLS certificates are publicly logged, but it could break apps that use private or self-signed certificates in production. If that's you, configure your network security config to handle it.

### Safer Native Dynamic Code Loading

The DCL protections from Android 14 now extend to native libraries. Any native file loaded via `System.load()` must be read-only. If it's writable, you get an `UnsatisfiedLinkError`. This mostly affects apps that download and load native libraries dynamically — which Google has been discouraging for years.

## Activity Security and BAL Hardening

Android 17 refines Background Activity Launch (BAL) restrictions by extending protections to `IntentSender`. The legacy `MODE_BACKGROUND_ACTIVITY_START_ALLOWED` constant is being phased out. You should migrate to `MODE_BACKGROUND_ACTIVITY_START_ALLOW_IF_VISIBLE`, which restricts activity starts to scenarios where the calling app is visible. This is part of a broader effort to prevent phishing and interaction hijacking through background activity launches.

## Predictive Back and Per-App Language

Android 17 continues iterating on predictive back gesture support and per-app language preferences — both features that have been evolving since Android 13 and 14 respectively. The predictive back system keeps getting more polished as more apps adopt it and the system animations mature. Per-app language preferences now have broader ecosystem support through the Jetpack AppCompat library, which backports the feature to older API levels. Neither area has headline-grabbing API changes in this beta, but if you haven't adopted predictive back yet (by setting `android:enableOnBackInvokedCallback="true"` in your manifest and migrating from `onBackPressed()` to `OnBackPressedCallback`), Android 17 is another reminder that the old back navigation model is being phased out. Similarly, if your app supports multiple languages, using `AppCompatDelegate.setApplicationLocales()` for per-app language control is the standard approach going forward.

## IME Visibility After Rotation

A subtle but important UX change: starting with Android 17, when a configuration change happens that your app doesn't handle (like rotation), the system no longer automatically restores the previous keyboard visibility. If the keyboard was open before the rotation, it won't reappear after. If your app relies on the keyboard being visible after a configuration change, you need to explicitly request it — either by setting `android:windowSoftInputMode="stateAlwaysVisible"` or programmatically requesting the keyboard in `onCreate()` or `onConfigurationChanged()`. This catches apps that use text input fields as their primary interaction model, like search-heavy or messaging apps.

## Handoff — Cross-Device Continuity

One of the genuinely exciting new features in Android 17 is Handoff — the ability for users to start an activity on one Android device and continue it on another. You implement it per-activity by calling `setHandoffEnabled()` and implementing `onHandoffActivityRequested()` to return a `HandoffActivityData` object that specifies how the activity should be recreated on the receiving device. The framework handles discovery of nearby devices and surfaces available activities through the launcher and taskbar.

This is still Beta 1, so the API surface might change, but the intent is clear — Android is building its answer to Apple's Continuity features. For apps with natural handoff scenarios (documents, media playback, navigation), this is worth experimenting with early. The deep-link based approach means you don't need complex state synchronization — you pass enough data for the receiving device to reconstruct the relevant screen.

## The Migration Playbook

If you're preparing your app for Android 17, here's the practical sequence I'd recommend based on what worked for us.

**Start with a manifest audit.** Search your entire project for `screenOrientation`, `resizeableActivity`, `setRequestedOrientation`, `minAspectRatio`, and `maxAspectRatio`. Remove orientation locks wherever possible. If you absolutely must lock orientation for a specific screen (camera viewfinder is the common case), use `android:appCategory="game"` if it applies, and document the justification. Be prepared for those locks to be overridden on large screen devices regardless.

**Update your testing dependencies.** Before even targeting Android 17, update Espresso to 3.7.0+ and Robolectric to 4.17+. The MessageQueue change will break older versions. Run your test suite on these updated libraries against your current target SDK first — fix any test failures before adding the Android 17 variable.

**Test on the Android 17 emulator.** Create an emulator image with the Beta 1 system image and run your critical user flows. Pay special attention to rotation, split-screen entry, and window resizing. Any crash or state loss is a bug. The most useful test we found was rapidly resizing the freeform window during a network request — that caught several state management issues.

**Review your lifecycle handling.** Every Activity needs to survive destruction and recreation without losing user-visible state. ViewModel, `SavedStateHandle`, and `rememberSaveable` are the tools. Check that deep links and navigation arguments survive Activity recreation. If you're using Navigation Component, test that `popBackStack` works correctly after a configuration change mid-flow.

**Audit background audio.** If your app plays audio in any background scenario, verify it uses a properly started foreground service with WIU capabilities. Test by sending the app to the background and confirming audio continues. If it stops silently on Android 17, your FGS isn't meeting the new requirements.

## The Broader Picture

Android is clearly moving toward a world where apps don't dictate their window geometry. This has been the direction since multi-window in Android 7, but it's accelerating. Foldables made it real, tablets made it important, desktop windowing is making it mandatory. The removal of the opt-out in Android 17 is the clearest signal yet that adaptive layouts aren't optional anymore.

IMO, this is a good thing. The apps that invested early in adaptive layouts work on phones, tablets, foldables, Chromebooks, car displays, and whatever comes next. The apps that treated `screenOrientation="portrait"` as a permanent solution are facing a significant rewrite. Each SDK version makes the non-adaptive path harder to maintain. If you haven't started the migration, Android 17 Beta 1 is the signal. The window — both literal and figurative — is closing on hardcoded layouts.

The investment compounds beyond Android too. If you move toward Kotlin Multiplatform with Compose, having adaptive layouts means your UI logic already handles desktop and web window sizes. And the architectural discipline of treating window size as a runtime input makes your whole codebase more resilient to whatever platform changes come next.

Thanks for reading!
