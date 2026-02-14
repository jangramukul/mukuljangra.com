---
title: Defusing the Compose BOM
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Gradle
---

When I set up a new Compose project a few months ago, I did what every Android tutorial tells you to do — I added the Compose BOM, set a single version, and moved on. It felt clean. One version to manage instead of fifteen. Like hiring a personal assistant who handles all your grocery shopping. "Just get me the usual." Nice and simple.

But then I needed a bug fix in `foundation-layout` that had shipped in a newer release, and things started to unravel. The BOM hadn't been updated to include it yet. So I overrode the version manually, which meant the BOM was no longer the source of truth, and I was left wondering what exactly it was doing for me anymore. It was like having a personal assistant who buys your groceries, except now you're going to the store yourself for half the items. Why are you paying this person again?

Turns out, it wasn't doing much. Jake Wharton wrote about this in December 2025, and after spending time digging into how Gradle actually resolves Compose dependencies, I came to the same conclusion. The Compose BOM is a convenience artifact built for a problem that Gradle already solves. And in some cases, it actively works against you. Here's why I stopped using it, and why you probably should too.

## What a BOM Actually Is

Before getting into the Compose-specific problems, it's worth understanding what a BOM is at the build system level. **BOM stands for Bill of Materials**, and it's a concept that originated in Maven. Think of it like a restaurant's prix fixe menu — it doesn't cook any food itself, it just says "if you order from us, here are the versions of each dish you'll get." A BOM is a special POM file that doesn't contain any code — it just declares a list of dependencies with their versions. When you import a BOM into your build, you're telling the build system "use these versions for any of these artifacts that I happen to depend on." The BOM itself contributes zero classes to your classpath.

In Gradle, you consume a BOM using `platform()`. When you write `implementation(platform("androidx.compose:compose-bom:2025.10.01"))`, Gradle fetches the BOM's POM file, reads the `<dependencyManagement>` section, and registers all those version declarations as **dependency constraints** in your build. Now here's where it gets interesting — these constraints are not hard requirements. They're recommendations. If nothing else in your dependency graph requests a higher version, the BOM's version wins. But if a direct or transitive dependency brings in a higher version, Gradle picks the higher one.

The BOM doesn't lock anything — it sets a floor, not a ceiling.

## How Gradle Resolves Versions

To really understand why the BOM is redundant for Compose, you need to know how Gradle resolves dependency versions. Gradle uses a **"highest version wins"** strategy by default. When multiple sources declare different versions of the same artifact — your direct dependency says `1.8.0`, a transitive dependency says `1.9.0`, and a BOM says `1.8.5` — Gradle picks `1.9.0`. Always. No exceptions.

It's like a bidding war at an auction. Three people shout out prices. The auctioneer doesn't care who said what — the highest number wins. That's Gradle's version resolution in a nutshell.

There are three levels of version influence in Gradle, and they're not created equal. A **direct dependency** with a version (like `implementation("foo:bar:1.5.0")`) is a hard requirement — you're telling Gradle "I want this." A **dependency constraint** (which is what a BOM injects) is a recommendation that only applies if the artifact is already in the graph — it's a suggestion, not a demand. And then there's **`strictly`**, which forces a version and fails the build if anything conflicts — the nuclear option. The BOM operates at the constraint level, the weakest of the three.

This matters in practice. If the BOM says `foundation:1.9.0` but you also declare `implementation("androidx.compose.foundation:foundation:1.10.0")`, Gradle uses `1.10.0`. The direct version wins. This is exactly what happens when you start overriding BOM versions, and it's why the BOM becomes a half-truth about your actual dependency versions.

## What the BOM Promises

The pitch is simple. Compose consists of roughly 15 individual libraries — `foundation`, `ui`, `material3`, `animation`, `runtime`, and so on. These libraries are developed together and need to be compatible with each other. If your project pulls in `foundation:1.8.0` directly but a transitive dependency brings in `foundation-layout:1.9.0`, you could end up with a mismatch. The BOM solves this by declaring all the versions in one place, so you add `platform(composeBom)` and omit versions from individual dependencies.

That sounds reasonable. But it assumes that without the BOM, Gradle has no mechanism to keep sibling artifacts aligned.

And that assumption is wrong.

## Gradle Module Metadata Already Handles This

Here's where things got really interesting for me. Every AndroidX library ships with Gradle module metadata — a `.module` file published alongside the artifact — that contains dependency constraints for its sibling artifacts. These constraints tell Gradle that all artifacts within the same library group must resolve to the same version. This mechanism is called **atomic groups**, and it works automatically without any BOM.

Imagine a family pact: "If one of us moves to a new city, we all move." That's what atomic groups do for Compose libraries. If `foundation-layout` gets bumped to 1.10.0 by a transitive dependency, `foundation` and `foundation-lint` automatically come along for the ride. Nobody gets left behind.

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

So if any transitive dependency bumps `foundation-layout` to a newer version, Gradle will automatically align `foundation` and `foundation-lint` to that same version. No BOM required. The constraint mechanism is baked into the artifact metadata itself. Every time you pull in one library from the group, the others get pulled along. This is not some experimental Gradle feature either — it's been shipping with every AndroidX artifact for years now.

> **💡 The "aha" moment:** The BOM's main selling point — keeping Compose sibling libraries aligned — is already handled by Gradle module metadata's atomic groups. The BOM is solving a problem that was already solved before you added it.

## When You Override BOM Versions (And What Breaks)

Here's where things get messy in real projects. Sooner or later, you'll need a version that the BOM doesn't include yet. Maybe `material3` shipped a fix for a crash in bottom sheets, or you need a `runtime` beta for a new API. The override is straightforward — you add an explicit version, and Gradle's "highest version wins" rule takes care of the rest.

But the consequences are subtle. When you override `material3` to a version higher than the BOM declares, that artifact is decoupled from the BOM's version set. The atomic group constraints from Gradle module metadata will still keep `material3` and `material3-window-size-class` aligned with each other, but there's no guarantee that the overridden version was tested against the `ui` and `runtime` versions the BOM is still pinning. You've created a version combination nobody at Google explicitly validated. In practice, this almost always works because Compose libraries maintain backward compatibility within a major version — but you're in "works by convention, not by contract" territory.

And here's the real problem — it's not the override itself. It's that after the override, the BOM is lying to you. Running `./gradlew dependencies` will show resolved versions that don't match what the BOM declares. I had a project where three of five Compose dependencies were overridden past the BOM. At that point, the BOM was contributing exactly two version constraints to a graph that Gradle module metadata was already handling.

Two constraints. That's it. That's what the BOM was "doing" for me.

## The BOM Masks Real Versions

Here's the thing about the BOM that bothered me most once I understood the metadata story: it hides the versions you're actually using. The BOM has its own version number — something like `2025.10.01` — which is a date-based identifier that tells you nothing about the underlying library versions. If you hit a bug and someone tells you it was fixed in Foundation 1.9.4, you now have to go find a mapping table on the Android developer site to figure out whether your BOM version includes that fix or not.

It's like asking someone "what engine is in your car?" and they answer "I bought it on a Tuesday." Cool, but that tells me nothing.

Despite covering about 15 libraries, the Compose BOM actually only defines four or five distinct version groups. Compose UI and Material share a version. The runtime has its own. Foundation has its own. That's it. Four numbers. You could write those four numbers in a version catalog and have complete clarity about exactly what you're shipping. Instead, the BOM gives you a single opaque number that you need to cross-reference against a website to decode.

> **🧠 Think about it:** Would you accept a `build.gradle` that listed all your dependencies as version "October 2025" instead of actual version numbers? That's essentially what the BOM does — it trades transparency for a false sense of simplicity.

## The BOM Releases Inconsistently

Unlike individual AndroidX libraries that follow a predictable alpha, beta, RC, stable cadence, the Compose BOM releases on its own schedule — roughly once or twice a month, sometimes skipping months entirely. Sometimes a new BOM release contains no actual version changes. Other times it bumps everything, but individual libraries had releases between BOMs that you're missing.

This means the BOM can hold you back. If `foundation` ships a critical bug fix in 1.9.4 but the latest BOM still pins 1.9.3, you're stuck waiting. Meanwhile, the fix is right there on Maven Central. You can see it. You can use it in any other project. But your BOM-managed project? Nope, you wait.

The BOM turns a simple version bump into a waiting game.

## Version Catalogs Are the Better Tool

Gradle version catalogs solve the "single place to manage versions" problem that the BOM was trying to address, but without the indirection and opacity. Here's what a Compose setup looks like in a `libs.versions.toml` file:

```toml
[versions]
compose-runtime = "1.10.0"
compose-foundation = "1.10.0"
compose-ui = "1.10.0"
compose-material3 = "1.4.0"

[libraries]
compose-runtime = {
  module = "androidx.compose.runtime:runtime",
  version.ref = "compose-runtime"
}
compose-foundation = {
  module = "androidx.compose.foundation:foundation",
  version.ref = "compose-foundation"
}
compose-ui = {
  module = "androidx.compose.ui:ui",
  version.ref = "compose-ui"
}
compose-material3 = {
  module = "androidx.compose.material3:material3",
  version.ref = "compose-material3"
}
```

Four version numbers. Completely transparent. You know exactly what you're using, and if you need to bump one library independently — say to pick up a beta for a bug fix — you change the version directly. No cross-referencing against a BOM mapping table. Tools like Renovate and Dependabot can track the libraries in your catalog and open PRs when new versions are available, so you don't even need to check manually.

Put another way: the version catalog gives you the centralization benefit the BOM promised. Gradle module metadata's atomic group constraints give you the compatibility guarantee the BOM promised. Together, they make the BOM fully redundant for Gradle users. Two features that already exist in your build system, doing exactly what you thought you needed the BOM for.

## BOM-Free in Multi-Module Projects

The version catalog story gets even stronger in multi-module projects. In a single-module app, the BOM's convenience is marginal — you're replacing four version numbers with one. But in a project with 20 or 30 modules, the BOM's opacity becomes a real pain. Different modules might override different BOM versions, and now you're debugging why `:feature:search` resolved `material3:1.4.1` while `:feature:profile` got `material3:1.4.0`. Good luck figuring that one out by staring at a BOM version number that says "2025.10.01."

With a version catalog, every module reads from the same `libs.versions.toml`. There's one source of truth, it's a plain text file you can diff in code review, and on CI you can run `./gradlew dependencies --configuration releaseRuntimeClasspath` on any module and see exactly what shipped.

### Migrating Away from the BOM

If your project currently uses the BOM, migrating is straightforward. Run `./gradlew :app:dependencies --configuration releaseRuntimeClasspath | grep "androidx.compose"` to see what versions Gradle actually resolved. Write those versions into your `libs.versions.toml`. Remove the `platform(composeBom)` line and add explicit versions to each Compose dependency. Run the dependencies task again and confirm the resolved versions are identical. The build produces the same artifact, but now your declared versions match reality.

> **⚡ Quick check:** If you're using the BOM right now, can you tell me off the top of your head what version of `foundation` you're running? If you can't answer without checking a mapping table, that's the problem.

## Dependency Locking as a Safety Net

One concern I've heard about dropping the BOM is "what if a transitive dependency silently bumps a Compose version and I don't notice?" That's a valid worry, but Gradle has a built-in answer: **dependency locking**. When you enable locking, Gradle writes out a file listing every resolved dependency and its exact version. On subsequent builds, if any version changes, the build fails until you explicitly regenerate the lock file.

Think of it like a seal on a medicine bottle. Nobody gets in or out without you explicitly breaking the seal and re-sealing it.

```groovy
// build.gradle.kts
dependencyLocking {
    lockAllConfigurations()
}

// Generate lock files:
// ./gradlew dependencies --write-locks
//
// Creates gradle/dependency-locks/*.lockfile
// Commit these to version control.
// Any unexpected version change fails the build.
```

This is strictly more powerful than anything the BOM gives you. The BOM says "I recommend these versions." Dependency locking says "these are the exact versions that were resolved, and if anything changes, the build fails." Combined with a version catalog, you get full control and full visibility.

## Why the BOM Exists (And When It Makes Sense)

I want to be fair — the BOM isn't pointless. It exists for two legitimate reasons.

First, build systems that don't consume Gradle module metadata — primarily Maven — won't benefit from atomic group constraints. The BOM is a Maven concept, and it's the only mechanism those systems have for aligning sibling artifact versions. If you're using Maven to build Android apps (you brave soul), the BOM is your friend.

Second, the BOM predates version catalogs. Before catalogs existed, managing versions was ad-hoc — `ext` blocks or hardcoded strings scattered across modules. Now that catalogs are stable and widely adopted, that benefit is gone for most Gradle projects.

> **🔥 Real talk:** The tradeoff of dropping the BOM is managing four version numbers instead of one. But IMO, four explicit numbers you can read and reason about are strictly better than one opaque number that hides what you're actually using. I'll take "slightly more typing" over "I have no idea what versions I'm running" every single time.

## The Reframe

Here's the insight that changed how I think about this: **the Compose BOM is a Maven-era solution to a problem that Gradle has already solved at the metadata level.** Gradle module metadata with atomic group constraints ensures sibling artifacts stay aligned. Version catalogs give you a single place to declare and manage versions. Dependency locking catches version drift. Together, they cover everything the BOM does — with full transparency.

The BOM isn't harmful in the way a bad library is harmful. It won't break your build. But it adds an unnecessary layer of indirection that masks what versions you're running, can hold you back from bug fixes, and creates confusion when you override individual versions. For a modern Gradle project, it's just extra complexity with no payoff.

The next time you start a new project, skip the BOM and define your Compose versions in a version catalog. And if you're on an existing project, consider calling in the BOM squad to safely dispose of it.

Thank You!
