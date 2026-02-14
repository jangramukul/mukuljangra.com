---
title: Defusing the Compose BOM
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Gradle
---

When I set up a new Compose project a few months ago, I did what every Android tutorial tells you to do — I added the Compose BOM, set a single version, and moved on. It felt clean. One version to manage instead of fifteen. But then I needed a bug fix in `foundation-layout` that had shipped in a newer release, and things started to unravel. The BOM hadn't been updated to include it yet. So I overrode the version manually, which meant the BOM was no longer the source of truth, and I was left wondering what exactly it was doing for me anymore.

Turns out, it wasn't doing much. Jake Wharton wrote about this in December 2025, and after spending time digging into how Gradle actually resolves Compose dependencies, I came to the same conclusion. The Compose BOM is a convenience artifact built for a problem that Gradle already solves. And in some cases, it actively works against you. Here's why I stopped using it, and why you probably should too.

## What the BOM Promises

The pitch is simple. Compose consists of roughly 15 individual libraries — `foundation`, `ui`, `material3`, `animation`, `runtime`, and so on. These libraries are developed together and need to be compatible with each other. If your project pulls in `foundation:1.8.0` directly but a transitive dependency brings in `foundation-layout:1.9.0`, you could end up with a mismatch. The BOM solves this by declaring all the versions in one place, so you add `platform(composeBom)` and omit versions from individual dependencies.

That sounds reasonable. But it assumes that without the BOM, Gradle has no mechanism to keep sibling artifacts aligned. And that assumption is wrong.

## Gradle Module Metadata Already Handles This

Every AndroidX library ships with Gradle module metadata — a `.module` file published alongside the artifact — that contains dependency constraints for its sibling artifacts. These constraints tell Gradle that all artifacts within the same library group must resolve to the same version. This mechanism is called **atomic groups**, and it works automatically without any BOM.

Here's what the actual metadata looks like for `foundation-layout` version 1.10.0:

```kotlin
// Fragment from foundation-layout-android-1.10.0.module
// (JSON, shown as comment for clarity)

// "dependencyConstraints": [
//   {
//     "group": "androidx.compose.foundation",
//     "module": "foundation",
//     "version": { "requires": "1.10.0" },
//     "reason": "foundation-layout is in atomic group
//                androidx.compose.foundation"
//   },
//   {
//     "group": "androidx.compose.foundation",
//     "module": "foundation-lint",
//     "version": { "requires": "1.10.0" },
//     "reason": "foundation-layout is in atomic group
//                androidx.compose.foundation"
//   }
// ]
```

What this means in practice is that if any transitive dependency bumps `foundation-layout` to a newer version, Gradle will automatically align `foundation` and `foundation-lint` to that same version. No BOM required. The constraint mechanism is baked into the artifact metadata itself. Every time you pull in one library from the group, the others get pulled along. This is not some experimental Gradle feature either — it's been shipping with every AndroidX artifact for years now.

## The BOM Masks Real Versions

Here's the thing about the BOM that bothered me most once I understood the metadata story: it hides the versions you're actually using. The BOM has its own version number — something like `2025.10.01` — which is a date-based identifier that tells you nothing about the underlying library versions. If you hit a bug and someone tells you it was fixed in Foundation 1.9.4, you now have to go find a mapping table on the Android developer site to figure out whether your BOM version includes that fix or not.

Despite covering about 15 libraries, the Compose BOM actually only defines four or five distinct version groups. Compose UI and Material share a version. The runtime has its own. Foundation has its own. That's it. Four numbers. You could write those four numbers in a version catalog and have complete clarity about exactly what you're shipping. Instead, the BOM gives you a single opaque number that you need to cross-reference against a website to decode.

This gets worse when you start overriding individual versions — which you will, eventually. Maybe you need a bug fix in `ui` that shipped after the latest BOM. Maybe you're adopting AndroidX betas for specific libraries (which you should — but that's another post). The moment you override even one version, the BOM is no longer the full picture. Now you have a partially-overridden BOM plus explicit versions, and the actual resolved versions are determined by Gradle's dependency resolution rules, which may or may not match what you think you declared.

## The BOM Releases Inconsistently

Unlike individual AndroidX libraries that follow a predictable alpha → beta → RC → stable cadence, the Compose BOM releases on its own schedule — roughly once or twice a month, sometimes skipping months entirely. Sometimes a new BOM release contains no actual version changes from the previous one. Other times it bumps all the Compose dependencies, but those libraries might have had individual releases between BOM releases that you're missing.

This inconsistency means the BOM can hold you back. If `foundation` ships a critical bug fix in 1.9.4 but the latest BOM still pins 1.9.3, you're stuck waiting for a BOM release that may or may not come on a predictable timeline. Meanwhile, the fix is right there on Maven Central, and you could just bump the version directly. The BOM turns a simple version bump into a waiting game.

I don't fully understand what process or policy drives Google's BOM release cadence. But the practical effect is that relying on it means you're not always on the latest stable versions of the Compose libraries you use, even when those versions are available.

## Version Catalogs Are the Better Tool

Gradle version catalogs solve the "single place to manage versions" problem that the BOM was trying to address, but without the indirection and opacity. Here's what a Compose setup looks like in a `libs.versions.toml` file:

```kotlin
// libs.versions.toml
// [versions]
// compose-runtime = "1.10.0"
// compose-foundation = "1.10.0"
// compose-ui = "1.10.0"
// compose-material3 = "1.4.0"
//
// [libraries]
// compose-runtime = {
//   module = "androidx.compose.runtime:runtime",
//   version.ref = "compose-runtime"
// }
// compose-foundation = {
//   module = "androidx.compose.foundation:foundation",
//   version.ref = "compose-foundation"
// }
// compose-ui = {
//   module = "androidx.compose.ui:ui",
//   version.ref = "compose-ui"
// }
// compose-material3 = {
//   module = "androidx.compose.material3:material3",
//   version.ref = "compose-material3"
// }
```

Four version numbers. Completely transparent. You know exactly what you're using, and if you need to bump one library independently — say to pick up a beta for a bug fix — you change the version directly. No cross-referencing against a BOM mapping table. Tools like Renovate and Dependabot can track the libraries in your catalog and open PRs when new versions are available, so you don't even need to check manually.

The version catalog approach gives you the centralization benefit the BOM promised, plus the atomic group constraints from Gradle module metadata give you the compatibility guarantee the BOM promised. Together, they make the BOM fully redundant for Gradle users.

## Why the BOM Exists (And When It Makes Sense)

I want to be fair about this — the BOM isn't pointless. It exists for two legitimate reasons.

First, build systems that don't consume Gradle module metadata — primarily Maven-based builds — won't benefit from atomic group constraints. The BOM is a Maven concept defined in `pom.xml`, and it's the only mechanism those systems have for aligning sibling artifact versions. If you're building with Maven or a non-Gradle build system, the BOM is genuinely useful.

Second, the BOM predates version catalogs. Before catalogs existed, managing versions in Gradle projects was ad-hoc — build script properties, `ext` blocks, or hardcoded strings scattered across modules. The BOM provided a single version to track. Now that catalogs are stable and widely adopted, that benefit is gone for most Gradle projects.

The tradeoff of dropping the BOM is that you're now managing four version numbers instead of one. That's the honest downside. But IMO, four explicit version numbers that you can read and reason about are strictly better than one opaque number that hides what you're actually using.

## The Reframe

Here's the insight that changed how I think about this: **the Compose BOM is a Maven-era solution to a problem that Gradle has already solved at the metadata level.** Gradle module metadata with atomic group constraints ensures sibling artifacts stay aligned. Version catalogs give you a single place to declare and manage versions. Together, they cover everything the BOM does — and they do it with full transparency.

The BOM isn't harmful in the way a bad library is harmful. It won't break your build. But it adds an unnecessary layer of indirection that masks what versions you're running, can hold you back from getting bug fixes, and creates confusion when you need to override individual versions. It's a tool that served its purpose in a pre-catalog, Maven-compatible world. For a modern Gradle project, it's just extra complexity.

The next time you start a new project, skip the BOM and define your Compose versions in a version catalog. And if you're on an existing project, consider calling in the BOM squad to safely dispose of it.

Thank You!
