---
title: Android 17 Beta 1 — What's New and What You Need to Prepare
layout: post
categories: post
tags:
  - Android
---

When Android 16 shipped its resizability requirements last year, I remember thinking — okay, this is the direction, but most apps will get a grace period before it really matters. With Android 17 Beta 1, that grace period is effectively over. Google is doubling down on the vision that every app should work on any screen, in any orientation, at any size. If your app still locks to portrait or breaks when resized, Android 17 is where that starts actively hurting you.

I went through this transition with our app earlier this year. We had orientation locks scattered across 30+ Activities, hardcoded layout assumptions in our custom views, and configuration change handlers that basically destroyed and recreated everything. Making our app genuinely adaptive was a bigger project than I expected — but the result was worth it. Our app now works on tablets, foldables, desktop mode, and the freeform windows that Android 17 pushes further. Here's what's coming, what changed, and what you need to do now.

## The Resizability Shift Continues

Android 16 introduced the idea that apps should be resizable by default — no more `android:resizeableActivity="false"` as a free escape hatch. Android 17 takes this further. Starting with apps targeting Android 17, the system can resize your app's windows in more scenarios: split-screen, freeform windowing on large screens, and desktop-mode environments. The key behavioral change is that the system treats your app as fully resizable unless you meet very specific compatibility criteria.

Here's the thing — this isn't just about tablets anymore. Samsung DeX, Chromebooks, foldables with different postures, and the rumored desktop mode in Pixel devices all create scenarios where your app window can be any arbitrary size. The days of designing for two fixed sizes (phone portrait and maybe tablet landscape) are gone. Your app needs to handle a continuous range of widths and heights.

What makes Android 17 different from 16 is the enforcement. Android 16 gave developers a heads-up. Android 17 starts applying stricter defaults. If your `targetSdkVersion` is set to Android 17, the system will override orientation locks in certain contexts — particularly on large screen devices. Your `android:screenOrientation="portrait"` in the manifest might simply be ignored when your app is running in a freeform window or in split-screen on a tablet.

## Configuration Changes Done Right

This is where most apps break. When the window resizes, Android triggers a configuration change — specifically `screenSize`, `smallestScreenSize`, and `orientation` changes. If your Activity doesn't handle these, it gets destroyed and recreated. That's fine if your state management is solid. But in a lot of codebases, it's not.

The most common issue I saw in our migration was Activities that stored transient state in member variables instead of in ViewModel or `SavedStateHandle`. A user would be halfway through a form, the device would fold, the Activity would recreate, and everything was lost. The fix isn't complicated — move transient state to ViewModel, use `rememberSaveable` in Compose, or handle config changes explicitly — but finding every instance across a mature codebase takes time.

For Compose apps, the story is actually better. Composable functions naturally handle recomposition on configuration changes. If you're using `remember` and `rememberSaveable` correctly, your state survives Activity recreation. The problem shows up more in hybrid apps that still mix XML layouts with Compose, or apps that use `onConfigurationChanged` overrides to do manual layout swapping. Android 17 makes a clear case for going fully Compose — the framework handles adaptive layout much more naturally.

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

The `WindowSizeClass` API from the Jetpack library is the right abstraction here. Don't hardcode breakpoints in dp values — use Compact, Medium, and Expanded as your three layout categories. This gives you enough flexibility for phones, foldables, and tablets without trying to design for every possible pixel width.

## New APIs and Behavior Changes

Beyond resizability, Android 17 Beta 1 introduces several behavior changes worth knowing about. The notification permission model continues to tighten — apps targeting Android 17 face stricter rules around notification channels and the timing of permission prompts. The recommendation is to ask for notification permission at a contextually relevant moment, not on first launch.

Background work restrictions also evolve. Foreground service types introduced in Android 14 are now more strictly enforced. If your foreground service doesn't declare the right type, expect it to be killed more aggressively on Android 17 devices. This is part of Google's long-running campaign to reduce battery drain from misbehaving background work.

There are also updates to the privacy sandbox APIs, continued work on per-app language preferences, and refinements to predictive back gesture behavior. For most apps, the resizability changes are the headline — but it's worth reading the full behavior changes document to check if anything else affects your specific use case.

## What We Learned Migrating Our App

When we started making our app fully adaptive, we thought it would take a sprint. It took three. Here's what caught us off guard and what I'd recommend to anyone going through this.

**Orientation locks were everywhere.** We had `android:screenOrientation="portrait"` on Activities, `requestedOrientation` calls in Fragment lifecycle methods, and even some third-party SDKs that set orientation internally. The first step was a project-wide search for `screenOrientation` and `setRequestedOrientation`. We found over 40 instances. Removing them was the easy part — making the UI actually work in landscape was the hard part.

**Custom Views were the biggest pain point.** We had several custom Views that assumed a fixed aspect ratio or used absolute pixel positioning. These broke immediately in freeform windows. The fix was migrating them to use ConstraintLayout or Compose with adaptive modifiers. Any custom View that uses `onMeasure` with hardcoded dimensions needs to be reviewed.

**Testing was harder than expected.** Android Studio's resizable emulator helps, but it doesn't cover every scenario. We ended up testing on a physical foldable (Samsung Fold), a Chromebook, and the desktop mode emulator. The most useful test was rapidly resizing the freeform window while the app was performing a network request — that caught several state management bugs we wouldn't have found otherwise.

**The golden rule we settled on:** never assume a fixed window size at any layer of the app. Not in the Activity, not in the ViewModel, not in the navigation graph. The window size is a runtime input that can change at any moment. If your architecture treats it that way, you're ready for whatever Android throws at you next.

## Your Compatibility Testing Checklist

If you're preparing your app for Android 17, here's the practical checklist I'd recommend working through. This isn't exhaustive, but it covers the high-impact areas.

**Start with the manifest.** Search your entire project for `screenOrientation`, `resizeableActivity`, and `configChanges`. Remove orientation locks wherever possible. If you absolutely must lock orientation for a specific screen (like a camera viewfinder), document why and be prepared for it to be overridden on large screens.

**Test on the Android 17 emulator.** Create an emulator image with Android 17 Beta 1 and run your app through its critical flows. Pay special attention to what happens when you rotate the device, enter split-screen, and resize the window. Any crash or state loss here is a bug you need to fix before targeting the new SDK.

**Review your Activity lifecycle handling.** Make sure every Activity can survive destruction and recreation without losing user-visible state. ViewModel, `SavedStateHandle`, and `rememberSaveable` are your tools. If you're still saving state in `onSaveInstanceState` manually, it works but make sure you're covering every field.

**Check your navigation graph.** Deep links and navigation arguments should work correctly after Activity recreation. If you're using Navigation Component, test that `popBackStack` behaves correctly after a configuration change mid-navigation.

**Update your `targetSdkVersion` in a branch and run your test suite.** Some behavior changes only activate when you target the new SDK. Run your full test suite against the new target to catch regressions before they reach production.

## The Broader Trend

Android is clearly moving toward a world where the app doesn't get to dictate its window geometry. This has been the trend since multi-window support in Android 7, but it's accelerating. Foldables made it real, tablets made it important, and desktop mode will make it mandatory.

IMO, this is a good thing. The apps that invested early in adaptive layouts have a massive advantage now — they work on phones, tablets, foldables, Chromebooks, car displays, and whatever comes next. The apps that treated `screenOrientation="portrait"` as a permanent solution are now facing a significant rewrite. If you haven't started the migration, Android 17 Beta 1 is your signal. The window is closing on hardcoded layouts, and each SDK version makes the non-adaptive path harder to maintain.

The investment pays off beyond just Android. If you ever move toward Kotlin Multiplatform with Compose, having adaptive layouts means your UI logic is already prepared for desktop and web window sizes. It's the kind of architectural decision that compounds over time.

Thanks for reading!
