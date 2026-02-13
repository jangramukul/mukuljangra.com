---
layout: newsletter
title: "Weekly #1 — Compose December Release, Kotlin 2.3, Navigation 3 & More"
date: 2026-02-13
tags: [Android, Jetpack Compose, Kotlin, Navigation]
---

## 📚 Articles & References

**RemoteCompose: Another Paradigm for Server-Driven UI in Jetpack Compose:** Explore what RemoteCompose is, understand its core architecture, and discover the benefits it brings to dynamic screen design with Jetpack Compose.

**Finger Shadows in Compose:** Romain Guy used the GPU shader API on Android to build a "finger shadows" effect — treating the user's finger as a 3-D capsule and computing soft shadows based on a fixed light source. The implementation lets developers customize shadow size, orientation, light-source position and softness.

**Pragmatic Modularization — The Case for Wiring Modules:** This article argues for using a "wiring-module" pattern when modularizing Android apps, introducing a thin, intermediate module between the app module and feature implementation modules.

**Android 16 QPR2 is Released:** Android 16 QPR2 brings enhancements to user experience, developer productivity, and media capabilities. It marks a significant milestone as the first release to utilize a minor SDK version.

**What's new in the Jetpack Compose December '25 release:** The December '25 release is stable — version 1.10 of the core Compose modules and version 1.4 of Material 3, adding new features and major performance improvements.

**Let's defuse the Compose BOM:** The Jetpack Compose Bill of Materials (BOM) is largely redundant for typical Gradle-based Android projects, because Compose's own module metadata already enforces consistent version alignment across related libraries.

---

## 🎤 Conferences & Videos

**What's new in Android Studio's AI Agent:** Discover how the AI agent in Android Studio can dramatically improve your efficiency and app quality — intelligent code transformation, automatic version upgrades, and new UI-specific tools.

**Navigation 3 API overview:** Learn Jetpack Navigation 3, Google's new library for building navigation in Android apps. Discover how to use keys to represent navigable content, manage your back stack, and create NavEntrys.

**Structured Concurrency — The Paradigm Shift:** Concurrent tasks should have a clear beginning, end, and scope, just like any other code block. This session cuts through the hype to reveal the core principle behind structured concurrency.

---

## 🛠️ Releases & Open-Source

**Kotlin 2.3.0-RC2:** The Kotlin 2.3.0-RC2 release is out! The Kotlin plugins that support 2.3.0-RC2 are bundled in the latest versions of IntelliJ IDEA and Android Studio. Just change the Kotlin version to 2.3.0-RC2 in your build scripts.

**Jetpack Release — December 3, 2025:** Includes Compose 1.10.0, SwipeRefreshLayout 1.2.0, and bug fixes in Activity 1.12.1, NavigationEvent 1.0.1, ExifInterface 1.4.2, and Wear Compose 1.5.6.

- Compose 1.10.0 is stable with performance improvements, retain APIs, plus new animation features.
- SwipeRefreshLayout 1.2.0 is out as part of a push to get long-running alphas to stable.
- Also: Ink 1.0.0-rc01, Compose 1.11.0-alpha01 (new visible modifier!), Navigation3 1.1.0-alpha01 (entries as shared elements!), and XR library updates.

---

## 🔎 AOSP Spotlight

**Move gap-buffer slot table into its own package:** A refactoring that moves the SlotTable and associated classes into its own package — a step toward allowing a new composer implementation, based on a link buffer instead of a gap buffer, to land behind a flag.

---

*That's a wrap for this week! See you in the next issue. 🐝*
