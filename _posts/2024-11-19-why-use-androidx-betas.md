---
title: Why You Should Use AndroidX Betas in Production
layout: post
categories: post
tags:
  - Android
  - Best Practices
---

A while back, I hit a bug in the Compose Foundation library that was causing a layout issue on one of our screens. The usual flicker-on-recomposition kind of thing that makes you question reality for an hour before you find the open issue on the Android issue tracker. The fix was already merged — I could see the commit — but it had only shipped in `foundation:1.9.0-beta02`. The latest stable was `1.8.0`. And the next stable release? Months away.

I remember hesitating. We had a blanket rule on the team: stable versions only. No alphas, no betas, no exceptions. It felt responsible. But sitting there with a known bug and a known fix that I couldn't use because of an arbitrary version suffix, I started wondering whether our "stable only" policy was actually protecting us or just making us wait longer for the same code.

That's when I read Jake Wharton's post on using AndroidX betas, and it reframed how I think about AndroidX versioning entirely. The short version: **AndroidX beta01 is not what you think it is.** It's not an unstable prerelease. It's the API-stable release, and it's been running in Google's own apps for weeks before you ever see it.

## AndroidX Versioning Is Not Normal Semantic Versioning

Most libraries follow a straightforward pattern. Features get added, bugs get fixed, and you get a stable release — say `1.2.0`. If bugs are found, a patch comes out as `1.2.1`. New APIs mean `1.3.0`. That's standard semantic versioning, and the "stable" label means "this is ready for production."

AndroidX does something different. When a library has its features finalized and known bugs fixed, they promote it to `beta01` — not stable. At `beta01`, the API surface is locked. You literally cannot add new APIs or break existing ones past this point. Google has automated tooling that enforces this constraint at the source level. So `beta01` is the moment the library says "the API contract is final." The subsequent betas (`beta02`, `beta03`) are purely bug fix releases. The `rc01` is a release candidate that, if no bugs are found, becomes the final stable release — typically identical bytecode.

Here's how the versioning maps between a normal library and AndroidX:

**Normal library versioning** — `1.2.0` is the stable release where APIs are finalized. `1.2.1` and `1.2.2` are bug fix patches.

**AndroidX versioning** — `1.2.0-beta01` is where APIs are finalized (equivalent to a normal library's `1.2.0`). `1.2.0-beta02` through `1.2.0-rc01` are bug fix patches. `1.2.0` is just the final seal of approval — same bits as the last RC.

This is documented in Google's own [AndroidX versioning guidelines](https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/docs/versioning.md#prerelease). It's not a secret. But the naming creates a psychological barrier that makes teams treat `beta01` as experimental when it's actually the production-ready API freeze.

## Google's Own Apps Ship Against HEAD

If you're worried about AndroidX betas being undertested, consider this: all of Google's first-party apps — Gmail, Maps, YouTube, Google Pay — ship against the code in AndroidX HEAD. Not against stable releases. Not even against betas. They build, test, and deploy with the alpha versions and individual commits in between. By the time a library reaches `beta01`, it has already been running in production across Google's entire app portfolio.

AndroidX is to Google's apps what your `util-`, `common-`, and `core-` modules are to your `app` module — shared code that lives in their monorepo and ships as part of their build. The idea that `beta01` is risky when Google has been shipping the code for weeks in apps used by billions of people doesn't hold up. The prerelease labels reflect AndroidX's internal quality gates, not the code's production readiness.

## Real Bugs, Real Fixes, Real Waiting

Let me give you some concrete examples of why this matters. Jake Wharton shared these from Cash App's experience, and I've hit similar situations on my own projects.

**Compose UI recomposition bugs.** Various issues in the Compose runtime, foundation, and UI libraries around retained state, layout behavior, and recomposition edge cases. These get fixed in betas, but if you're waiting for stable, you're waiting months with a known broken behavior in your app. Your options are: live with the bug, implement a fragile workaround, or bump to the beta where it's already fixed.

**The ScatterMap bug in collection.** The `collection` library's primitive specializations of `ScatterMap` had a bug that caused deleted values to be returned during insertion. That's not a cosmetic issue — it's a data corruption bug. It was fixed in a beta. If you were on stable only, you had a silently broken map implementation in your app.

**Graphics shape library breaking bottom sheets.** A bug in the stable version of the `graphics-shape` library was breaking rounded corners on bottom sheet decorations. The fix shipped in the next version's beta. Meanwhile, the stable release with that fix was months away.

In all these cases, the pattern is the same: a real bug exists in stable, the fix is available in beta, and waiting for the next stable means living with the bug for an extended period. The irony is that the "safe" choice — sticking to stable — is the one that leaves you running broken code longer.

## The Cost of Waiting for Stable

Here's the tradeoff that AndroidX's versioning scheme creates. By stretching the prerelease period and aiming for extremely stable final releases, Google pushes the bug-fix window further out. If you're on Compose UI 1.8 stable and find a bug when testing against 1.9, you're stuck. You can't get the fix in a 1.8.1 patch because AndroidX doesn't typically do point releases on older stable versions. Your only path forward is 1.9 stable, which might be months away.

But if you were already on the 1.9 betas, you'd have found that bug earlier, reported it, and gotten the fix in `1.9.0-beta03` within weeks. You'd be on the fixed code months before teams waiting for stable. The "risk" of running betas is actually lower than the risk of being stuck on a stable release with no path to a bug fix.

This is the reframe: **stable doesn't mean "safest." It means "oldest code that passed all the quality gates."** The betas and RCs contain the same fixes plus additional ones. They've been through the same test suites. They just haven't waited long enough for the calendar to declare them stable.

## How to Adopt Betas Gradually

I'm not suggesting you flip every AndroidX dependency to beta across your entire project overnight. That would be reckless, and the honest downside of using betas is that you might occasionally hit a newly introduced bug that hasn't been caught yet. It's rare given Google's testing infrastructure, but it's possible. Gradual adoption is the right approach.

**Start with mature, stable-core libraries.** Libraries like `collection`, `core`, `activity`, and `annotation` don't change much between versions. The risk of new bugs is minimal because the delta between releases is small. These are easy wins — you get any accumulated fixes with almost zero risk.

**Move to load-bearing Compose libraries.** Compose `runtime`, `foundation`, and `ui` are the ones where bugs actually hurt. They're also the ones where fixes matter most. Running betas for these means you find issues before they hit your production users on stable, and you get fixes weeks instead of months after they land. Yes, this is a bigger commitment, but it's where the biggest return is.

**Keep experimental libraries on stable.** Newer AndroidX libraries that are still finding their API shape — things in early alpha cycles — should probably stay on stable or at least be evaluated more carefully. The beta guarantee only applies once the library has reached `beta01`, and alphas can still have API changes.

The key enabler is testing infrastructure. If you have comprehensive unit tests, screenshot tests, and integration tests, you can adopt betas with confidence. The tests catch regressions. If they don't, that's a testing problem, not a versioning problem.

## Your Responsibility to Report Bugs

Here's something I think is underappreciated. As AndroidX library users, we have a shared responsibility to report bugs upstream. If you find a bug in a beta, file it. Don't assume someone else will. Cash App runs a large codebase with complex usage patterns, and they find real bugs that wouldn't surface in simpler setups. Your app probably exercises these libraries in ways that Google's internal testing doesn't cover either.

Reporting bugs in betas is actually more valuable than reporting them against stable, because the fix can ship in a subsequent beta within weeks. By the time stable rolls around, the bug you found is already fixed — not just for you, but for every other AndroidX user. This is the virtuous cycle that makes the beta adoption strategy work at ecosystem scale.

IMO, the biggest practical benefit I've seen from running betas is the shift in mindset. Instead of passively consuming stable releases and hoping they don't have bugs, you become an active participant in the library's quality. You catch issues earlier, you have a direct path to fixes, and you're never stuck waiting months with a known problem.

The "stable only" policy feels safe, but it's a false safety. AndroidX `beta01` is production-ready code that has already been tested more thoroughly than most libraries' stable releases. Give it a try with one or two mature libraries and see for yourself.

Thanks for reading!
