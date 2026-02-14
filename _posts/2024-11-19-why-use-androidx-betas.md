---
title: Why You Should Use AndroidX Betas in Production
layout: post
categories: post
tags:
  - Android
  - Best Practices
---

Picture this. You're debugging a Compose Foundation layout issue — the kind of flicker-on-recomposition bug that makes you question your own sanity for an hour before you finally find the open issue on the Android issue tracker. The fix is already merged. You can see the commit right there. But it only shipped in `foundation:1.9.0-beta02`. The latest stable? `1.8.0`. And the next stable release? Months away.

I stared at my screen, genuinely stuck. We had a blanket rule on the team: stable versions only. No alphas, no betas, no exceptions. It felt responsible, like wearing a seatbelt. But sitting there with a known bug and a known fix that I couldn't use because of an arbitrary version suffix — I started to wonder. Was our "stable only" policy actually a seatbelt? Or was it more like refusing to cross a bridge because someone hadn't finished painting the guardrails?

That's when I read Jake Wharton's post on using AndroidX betas, and it completely reframed how I think about AndroidX versioning. The short version: **AndroidX beta01 is not what you think it is.** It's not an unstable prerelease. It's the API-stable release, and it's been running in Google's own apps for weeks before you ever see it.

## The AndroidX Release Lifecycle, Stage by Stage

Here's something that trips up a lot of Android developers. Most libraries follow standard semver — `1.2.0` is stable, `1.2.1` is a patch, `1.3.0` adds APIs. Simple. AndroidX does something fundamentally different, and until you understand each stage, the version numbers will mislead you.

Think of it like a restaurant kitchen. Your meal goes through stages — prep, cooking, plating, quality check — before it reaches your table. AndroidX versions work the same way, but the naming makes you think the food isn't ready when it's actually been cooked and tasted by the chef already.

**Alpha** is active development — the prep stage. APIs can be added, renamed, or removed entirely between alpha releases. Zero compatibility guarantees. `alpha01` to `alpha05` might look completely different. You're explicitly signing up for churn. The one guarantee is that the library compiles and passes Google's internal test suites, which is more than most open-source alphas offer.

**Beta** is the API freeze — the dish is cooked and plated. At `beta01`, the API surface is locked. Google has automated tooling — metalava and the AndroidX API tracking infrastructure — that enforces this at the source level. Any commit that changes a public API after the beta cut gets rejected by the build system. Subsequent betas (`beta02`, `beta03`) are purely bug fix releases. They can fix behavior and patch edge cases, but method signatures, class names, and the public surface cannot change.

Wait, read that again. After `beta01`, the API *cannot* change. Not "shouldn't" — *cannot*. The build system physically rejects it.

**RC** (Release Candidate) adds one promise on top: the team believes no more bugs need fixing. `rc01` is typically identical to the last beta. It exists as a "hold and observe" period — if no critical issues surface, that exact bytecode becomes stable. In practice, the stable `.aar` is often byte-for-byte identical to the RC.

**Stable** is the final stamp. But here's the thing — it's the *oldest* code in the pipeline. By the time `1.2.0` is stamped stable, `1.3.0-alpha01` has been in development for weeks. This is documented in Google's own [AndroidX versioning guidelines](https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/docs/versioning.md#prerelease).

> **💡 The "aha" moment:** The word "beta" creates a psychological barrier that makes teams treat `beta01` as experimental — when it's actually the production-ready API freeze. Stable is just beta that waited longer. Same code, different calendar date.

## Google's Own Apps Ship Against HEAD

If you're worried about AndroidX betas being undertested, I want you to think about something for a second. What apps does Google make? Gmail. Maps. YouTube. Google Pay. Apps used by *billions* of people.

Now, what version of AndroidX do you think those apps ship with?

Not stable. Not even beta.

All of Google's first-party apps ship against the code in AndroidX HEAD. They build and deploy with alpha versions and individual commits. By the time a library reaches `beta01`, it has been running in production across Google's entire app portfolio for weeks.

Think of it this way: AndroidX is to Google's apps what your internal `util-` and `core-` modules are to your `app` module — shared code that lives in their monorepo. The idea that `beta01` is risky when Google has been shipping that exact code in apps used by billions of people? Yeah, that doesn't hold up.

## How to Evaluate Whether a Beta Is Safe

Now, I'm not saying you should blindly upgrade everything to the latest beta and call it a day. That would be reckless. Not all betas are equal. Here's how I evaluate whether a specific beta is worth adopting.

**Check the release notes and issue tracker.** Every AndroidX release has a changelog on [developer.android.com/jetpack/androidx/versions](https://developer.android.com/jetpack/androidx/versions). If the beta lists "Bug fixes" with specific issues resolved, that's low risk. I always read the full commit list for Compose betas — the delta between `beta01` and `beta02` is usually 5-15 commits, and scanning them takes two minutes. Then search [issuetracker.google.com](https://issuetracker.google.com) for the library — if there are open P0/P1 bugs filed against the beta, that's a red flag. A beta with zero critical issues after two weeks in the wild is safer than most third-party libraries' stable releases.

**Look at the API surface diff.** The AndroidX team publishes API diffs between releases. If you're on `1.8.0` stable and considering `1.9.0-beta02`, check what APIs were added. If none of your code touches the new APIs, the beta is effectively a bug-fix-only upgrade for you — **binary compatibility** is maintained, so your compiled code against `1.8.0` works against `1.9.0-beta02` without recompilation.

**Consider the library's maturity.** A `beta01` for `activity:1.10.0` is very different from a `beta01` for a brand-new library in its `1.0.0` cycle. Mature libraries like `core`, `activity`, and `lifecycle` have small deltas between versions — their betas are almost boring. Newer libraries carry more risk because the surface area of change is larger.

> **⚡ Quick check:** If someone told you a beta had been running in Gmail and YouTube for three weeks with zero P0 bugs — would you still call it risky?

## Real Bugs, Real Fixes, Real Waiting

Alright, theory is nice. But you want to know why this actually matters in the real world? Here are some concrete examples. Jake Wharton shared these from Cash App's experience, and I've hit similar situations on my own projects.

**Compose UI recomposition bugs.** Various issues in Compose runtime, foundation, and UI around retained state, layout behavior, and recomposition edge cases. These get fixed in betas, but if you're waiting for stable, you're waiting months with a known broken behavior. Your options: live with the bug, implement a fragile workaround, or bump to the beta where it's already fixed.

What would you do? Seriously. You have a bug, you can see the fix, and the only thing stopping you is a version suffix.

**The ScatterMap bug in collection.** The `collection` library's `ScatterMap` had a bug that caused deleted values to be returned during insertion. That's a *data corruption* bug, not a cosmetic issue. It was fixed in a beta. If you were on stable only, you had a silently broken map implementation. Silently. Your map was lying to you and you didn't even know it.

**Graphics shape library breaking bottom sheets.** A bug in stable `graphics-shape` was breaking rounded corners on bottom sheet decorations. The fix shipped in the next version's beta, but the stable release was months away.

**Navigation Compose deep link handling.** `navigation-compose` had edge cases around deep link argument parsing that silently dropped query parameters. The fix landed in a beta, but the next stable was two release cycles out. Teams on stable had to write manual URI parsing workarounds more fragile than the beta fix itself.

In all these cases, the pattern is the same: a real bug exists in stable, the fix is available in beta, and waiting for stable means living with the bug. The irony is painful — the "safe" choice leaves you running broken code longer.

## The Cost of Waiting for Stable

Here's the tradeoff that AndroidX's versioning creates, and it's a big one. By stretching the prerelease period, Google pushes the bug-fix window further out. If you're on Compose UI 1.8 stable and find a bug, you can't get the fix in a 1.8.1 patch — AndroidX doesn't typically do point releases on older stable versions. Your only path is 1.9 stable, which might be months away.

Imagine you're driving a car with a known brake issue. The manufacturer has the fix ready. But they tell you: "We'll install it when we do the next full service in four months." Meanwhile, the mechanic next door has the exact same part sitting on the shelf right now.

That's what waiting for stable feels like.

If you were on the 1.9 betas, you'd have found that bug earlier, reported it, and gotten the fix in `1.9.0-beta03` within weeks. The "risk" of running betas is actually *lower* than the risk of being stuck on stable with no path to a fix.

This is the reframe: **stable doesn't mean "safest." It means "oldest code that passed all the quality gates."** The betas contain the same fixes plus additional ones. They've been through the same test suites. They just haven't waited long enough for the calendar to declare them stable.

> **🔥 Real talk:** I've had more production issues from staying on outdated stable versions with known bugs than I've ever had from adopting a beta. The "safety" of stable-only is something teams *feel* but rarely measure.

## Managing Betas in Your Version Catalog

Once you start adopting betas, you need a system for tracking what's beta and what's stable. I use Gradle version catalogs, and the key is making the distinction visible.

```kotlin
// gradle/libs.versions.toml
[versions]
# Stable
activity = "1.9.3"
core-ktx = "1.15.0"
lifecycle = "2.8.7"

# Beta — review before each release
compose-bom = "2024.12.01"
compose-foundation = "1.8.0-beta02"
navigation-compose = "2.9.0-beta01"
```

See that `# Beta` comment? That's deliberate. Before every production release, I search `libs.versions.toml` for `beta` or `alpha`. If a stable version has shipped, we upgrade. This takes five minutes during release prep. You can also configure Renovate or Dependabot to flag when a stable version becomes available for a beta dependency.

One thing to watch out for: don't mix stable and beta versions of tightly coupled libraries. If you upgrade `compose-foundation` to a beta, make sure `compose-ui`, `compose-runtime`, and `compose-material3` are on compatible versions from the same Compose BOM. Mismatched Compose versions are a common source of cryptic `NoSuchMethodError` crashes at runtime. And trust me, debugging a `NoSuchMethodError` that only shows up on release builds is not how you want to spend your Friday afternoon.

## Testing Strategy for Beta Adoption

The key enabler for running betas is testing infrastructure. IMO, if you don't have a test suite you trust, you shouldn't be adopting betas — but here's the thing, you also shouldn't feel safe on stable either. A test suite you trust is the foundation. Beta or stable, you need it either way.

**Upgrade one library at a time.** I've seen teams bump 15 AndroidX dependencies in one PR and then wonder which one caused the failure. Sound familiar? Upgrade one library at a time, or at least one logical group (all Compose libraries via the BOM). Your CI should run unit tests, integration tests, and screenshot tests on every dependency change. A Compose beta once changed how `LazyColumn` measured items — technically correct but shifted our list layouts by a few pixels. Screenshot tests caught it immediately. Without them? We'd have shipped slightly broken layouts and never noticed until a designer filed a bug.

**Test the upgrade path, not just the destination.** When you move from `beta01` to `beta02`, run your tests. When stable finally ships, run them again. Occasionally a stable release bundles a last-minute fix that changes behavior slightly from the RC. It's rare, but a full test run on the stable upgrade is cheap insurance.

## How to Adopt Betas Gradually

I'm not suggesting you flip every AndroidX dependency to beta overnight. The honest downside is that you might occasionally hit a newly introduced bug. It's rare given Google's testing infrastructure, but it's possible. Gradual adoption is the right approach — think of it as wading into the pool, not cannonballing into the deep end.

**Start with mature, stable-core libraries.** Libraries like `collection`, `core`, `activity`, and `annotation` don't change much between versions. The delta between releases is small, so these are easy wins with almost zero risk. If beta adoption had a tutorial mode, this is it.

**Move to load-bearing Compose libraries.** Compose `runtime`, `foundation`, and `ui` are the ones where bugs actually hurt and fixes matter most. Running betas means you get fixes weeks instead of months after they land. Bigger commitment, but the biggest return.

**Keep experimental libraries on stable.** Newer libraries still finding their API shape should be evaluated more carefully. The beta API-freeze guarantee only applies once the library has reached `beta01` — alphas can still have breaking changes.

When migrating from beta to stable, the transition should be boring. If you were on `1.9.0-beta03` and `1.9.0` stable ships, you bump the version and run your tests. The API surface hasn't changed since `beta01` and the stable is identical to the RC, so there should be zero code changes on your side. If you had `@OptIn` annotations for experimental APIs that graduated to stable, you can remove them — but they won't break anything if you leave them.

> **🧠 Think about it:** If the API is frozen at beta01, the RC is identical to the last beta, and the stable is identical to the RC — what exactly changes between beta and stable besides the version label?

## Your Responsibility to Report Bugs

Here's something I think is underappreciated: we have a shared responsibility to report bugs upstream. If you find a bug in a beta, file it. Don't assume someone else will. Your app exercises these libraries in ways that Google's internal testing doesn't cover. Cash App runs a large codebase with complex usage patterns, and they find real bugs that wouldn't surface in simpler setups. Your app does the same — it's a unique combination of libraries, screen sizes, and user flows that no one else has tested.

Reporting bugs in betas is more valuable than reporting them against stable, because the fix can ship in a subsequent beta within weeks. By the time stable rolls around, the bug you found is already fixed — not just for you, but for every AndroidX user. This is the virtuous cycle that makes beta adoption work at ecosystem scale.

IMO, the biggest benefit of running betas is the mindset shift. Instead of passively consuming stable releases and hoping they don't have bugs, you become an active participant in the library's quality. You catch issues earlier, you have a direct path to fixes, and you're never stuck waiting months with a known problem.

The "stable only" policy feels safe, but it's a false safety. AndroidX `beta01` is production-ready code that has already been tested more thoroughly than most libraries' stable releases. Give it a try with one or two mature libraries and see for yourself.

Thanks for reading!
