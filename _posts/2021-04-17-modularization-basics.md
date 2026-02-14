---
title: Modularization Basics Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
---

Imagine you're living in a studio apartment. One room, everything in it — your bed, your kitchen, your desk, your gym equipment. It works fine when you're alone. But now add three roommates, all trying to cook, work out, and sleep at the same time in the same room. Chaos, right?

That's what happened to our app at work. Clean builds took over four minutes. Adding a new feature meant reading through thousands of lines to understand what depended on what. Merge conflicts in the `app` module happened on every PR because everyone was editing the same files. The codebase was well-structured within files — we had ViewModels, repositories, good separation of concerns — but everything lived in one Gradle module. One giant room with three roommates tripping over each other.

So what's the fix? You move into a house with separate rooms. Each room has a door, a clear purpose, and walls that keep things contained.

That's modularization. You split your codebase into separate Gradle modules, each with a clear purpose and well-defined boundaries. And here's the thing — it's not just about build speed (though that's a significant benefit). It's about enforcing architectural boundaries at the build system level. In a single-module app, nothing stops a ViewModel from importing a Room DAO directly. Your architecture rules are just suggestions — polite signs that say "please don't walk on the grass." In a modularized app, the feature module literally can't access the database layer because it doesn't have that dependency. The Gradle module system becomes your architecture's enforcer. Not a suggestion. A locked door.

## Types of Modules

There's no single right way to modularize, but the patterns that work well in practice tend to fall into a few categories. Think of it like organizing a company — you've got the CEO's office, the product teams, and the shared services.

**The app module** is the CEO's office. It's the entry point — it contains the `Application` class, the main Activity, the top-level navigation graph, and the Hilt/Dagger app component. It depends on all feature modules and wires everything together. The app module should have as little code as possible — it's a coordinator, not a feature. The CEO doesn't write code. The CEO connects teams.

**Feature modules** are your product teams. Each one contains everything for a single user-facing feature. `:feature:orders` has the order list screen, the order detail screen, the ViewModels, the UI models, and the navigation routes for orders. Feature modules depend on core modules but never on other feature modules. This independence is the whole point — changing the orders feature can't break the profile feature. The orders team doesn't touch the profile team's code. They can't even see it.

**Core modules** are the shared services — HR, IT, legal. They contain shared infrastructure that feature modules need. `:core:data` has repositories and data sources. `:core:network` has the Retrofit setup, interceptors, and API interfaces. `:core:database` has Room database, DAOs, and entities. `:core:domain` has domain models and use case interfaces. `:core:ui` has shared Compose components, themes, and design tokens. `:core:common` has shared utilities like date formatters and extension functions.

**The dependency flow** is a one-way street: `app` → `feature:*` → `core:*`. Feature modules depend on core modules. The app module depends on everything. Core modules can depend on each other (`:core:data` depends on `:core:network` and `:core:database`), but feature modules are independent of each other.

```kotlin
// settings.gradle.kts — the full module graph
include(":app")

// Feature modules
include(":feature:orders")
include(":feature:profile")
include(":feature:settings")

// Core modules
include(":core:data")
include(":core:domain")
include(":core:network")
include(":core:database")
include(":core:ui")
include(":core:common")
```

```kotlin
// feature/orders/build.gradle.kts
plugins {
    id("myapp.android.feature")
}

dependencies {
    implementation(project(":core:domain"))
    implementation(project(":core:ui"))
    // Note: NO dependency on :feature:profile or :feature:settings
}
```

## Module Communication — How Features Talk Without Coupling

OK, here's where people get stuck. The biggest question in modularization is: how do feature modules communicate if they can't depend on each other? The orders screen needs to navigate to the profile screen, but `:feature:orders` can't import anything from `:feature:profile`.

Sounds like a dead end, right?

The most common solution is **navigation through the app module**. Think of it like this — two departments in a company can't directly call each other's internal lines, but they can both talk to the receptionist at the front desk. The app module is that receptionist. Each feature module exposes its navigation routes as an interface or a set of route constants. The app module, which depends on all feature modules, wires the navigation graph. The feature module says "I need to navigate to a profile screen with this userId" through a lambda or a navigation event, and the app module knows which destination handles it.

```kotlin
// feature/orders — defines what navigation it needs, not how
@Composable
fun OrderListScreen(
    onNavigateToProfile: (userId: String) -> Unit,
    onNavigateToOrderDetail: (orderId: String) -> Unit,
    viewModel: OrderListViewModel = hiltViewModel()
) {
    // When user clicks an order's customer name
    OrderItem(
        order = order,
        onCustomerClick = { onNavigateToProfile(order.customerId) },
        onOrderClick = { onNavigateToOrderDetail(order.id) }
    )
}

// app module — wires all feature navigations together
@Composable
fun AppNavGraph(navController: NavHostController) {
    NavHost(navController = navController, startDestination = "orders") {
        composable("orders") {
            OrderListScreen(
                onNavigateToProfile = { userId ->
                    navController.navigate("profile/$userId")
                },
                onNavigateToOrderDetail = { orderId ->
                    navController.navigate("order_detail/$orderId")
                }
            )
        }
        composable("profile/{userId}") { /* from :feature:profile */ }
    }
}
```

Notice what's happening here. The orders screen doesn't know the profile screen exists. It just knows "when someone clicks a customer, call this lambda with the userId." The app module is the one that connects the dots. The feature stays blissfully unaware of the rest of the app.

For data sharing between features — when the orders feature needs user data from the profile feature — the shared data lives in a core module. Both features depend on `:core:domain` for the `User` model and `:core:data` for the `UserRepository`. They share data through the repository, not through direct references to each other.

> **🧠 Think about it:** If two feature modules both need the same data, where should that data live? Not in either feature module — that would create a dependency between them. It lives in a core module that both features can access independently.

## Build Time Impact

The build time improvement from modularization is real and measurable. And honestly, this is the argument that gets most teams to actually do it, because everyone feels the pain of slow builds.

Picture this: in a single-module app, changing one file recompiles the entire module. You tweak a string in your settings screen, and Gradle recompiles your entire app — every screen, every ViewModel, every repository. In a modularized app, changing a file in `:feature:orders` only recompiles that module and any module that depends on it (typically just `:app`). The other feature modules are untouched. You fixed one room in the house, so you don't need to repaint the entire building.

On our project, modularizing into 12 modules reduced incremental build times from 45 seconds to about 12 seconds. Clean builds didn't improve much (Gradle still needs to compile everything), but incremental builds — which is what you trigger 50+ times a day — were dramatically faster. That's the difference between "I'll check Twitter while this builds" and "oh, it's already done."

Gradle also parallelizes module compilation. If `:feature:orders` and `:feature:profile` don't depend on each other, Gradle compiles them simultaneously on separate CPU cores. This parallelization is invisible in a single-module app because there's only one compilation unit.

> **🔥 Real talk:** The tradeoff is that the configuration phase gets slightly slower with more modules (Gradle evaluates every module's `build.gradle.kts`), and the first build after a clean requires compiling all modules. But the incremental build improvements more than compensate. You take a small hit once a day on the clean build to save seconds on the 50+ incremental builds you actually run.

## When to Modularize

Not every app needs modularization, and doing it too early adds overhead without benefit. It's like buying a house when you only need a studio apartment — you're paying for rooms you don't use.

**You should modularize when**: build times are becoming a bottleneck (typically over 30-45 seconds for incremental builds), the team has more than 2-3 developers working on different features simultaneously, you need to enforce architectural boundaries (preventing features from accessing each other's internals), or the app has 20+ screens with clearly separable features.

**You should NOT modularize when**: the app is small (under 10 screens), you're the only developer, or the architecture isn't stable yet — modularizing a codebase where the boundaries aren't clear means you'll spend more time moving code between modules than building features. You can't put up walls in a house if you haven't figured out where the rooms go yet.

**How to start**: don't try to modularize everything at once. That's the equivalent of renovating every room in your house simultaneously while still living in it. Start by extracting one core module (`:core:network` or `:core:domain`), then extract one feature module. Validate that the build works, the dependency graph is correct, and the team understands the pattern. Then extract more modules incrementally. Google's "Now In Android" sample app is an excellent reference for module structure — it uses convention plugins to keep module configuration DRY and follows the feature/core split pattern.

> **⚡ Quick check:** If your app has 8 screens, one developer, and 15-second incremental builds — should you modularize? No. You'd be adding complexity for zero benefit. Wait until the pain is real.

## The Reframe — Modules Are Architecture You Can't Cheat On

Here's why I think modularization matters more than most developers realize: **it makes your architecture enforceable, not just aspirational.**

In a single module, "the presentation layer shouldn't import Room entities" is a convention. It's a Post-it note on the wall that says "please follow the rules." Someone will violate it, and it'll pass code review because the app still compiles. We've all seen it — a tight deadline, a quick import, a TODO comment that never gets addressed.

In a modularized app, if `:feature:orders` doesn't have a dependency on `:core:database`, it literally cannot import a Room entity. The build fails. The architecture is enforced by the build system, not by team discipline. It's not a Post-it note anymore — it's a locked door. You don't need willpower when the option doesn't exist.

The cost is real — more modules mean more `build.gradle.kts` files, more dependency management, and more decisions about where code belongs. But the benefit is a codebase where the dependency graph is explicit, boundaries are enforced, build times scale with the change scope rather than the total codebase size, and onboarding a new developer means understanding one feature module rather than the entire app. They walk into one room, learn how it works, and start contributing. They don't need the blueprint to the entire house.

Thank You!
