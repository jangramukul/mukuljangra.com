---
title: Navigation 3 — Compose-Native Navigation Rebuilt from Scratch
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Architecture
---

I've spent more hours fighting Navigation 2 than I'd like to admit. Type-safe arguments with Safe Args that still needed string-based route patterns. NavGraph XML files that existed alongside Compose code for no good reason. A back stack that was managed internally with no way to inspect or manipulate it directly. The navigation library always felt like it was designed for the Fragment world and awkwardly adapted for Compose. Because that's exactly what it was.

Navigation 3 is different. It's not Navigation 2 with a new API surface — it's a complete rethink. The core idea is so simple it almost feels too obvious: **the back stack is just a list.** You manage it. You push items, you pop items, you inspect it, you modify it. The library renders whatever is on top. No NavGraph, no route registration, no destination declarations upfront. Just a mutable list of keys and a composable that maps each key to content. When I first saw this at the Android Dev Summit, my reaction was — this is how Compose navigation should have worked from the start.

## The Back Stack Is Your List

In Navigation 2, the back stack is an internal implementation detail. You tell the NavController to navigate to a route, and it manages the stack for you. You can observe it, sort of, through `currentBackStackEntryAsState()`, but you can't really manipulate it freely. Want to clear the stack and navigate to a new root? You need to chain `popUpTo` with `inclusive = true` and hope the route IDs match. Want to reorder entries? Not supported.

Navigation 3 flips this. The back stack is a `MutableList<Any>` that you own. You create it, you read it, you modify it. The library observes your list and renders the top entry. That's it.

```kotlin
@Composable
fun AppNavigation() {
    val backStack = rememberMutableStateListOf<Any>(HomeKey)

    NavDisplay(
        backStack = backStack,
        entryProvider = entryProvider {
            entry<HomeKey> { key ->
                HomeScreen(
                    onSettingsClick = { backStack.add(SettingsKey) },
                    onProfileClick = { userId -> backStack.add(ProfileKey(userId)) }
                )
            }
            entry<SettingsKey> { key ->
                SettingsScreen()
            }
            entry<ProfileKey> { key ->
                ProfileScreen(userId = key.userId)
            }
        }
    )
}

@Serializable
data object HomeKey

@Serializable
data object SettingsKey

@Serializable
data class ProfileKey(val userId: String)
```

A few things to notice. The keys are regular Kotlin types — data classes, data objects, whatever you want. They're serializable for state restoration, but they're not strings or route patterns. They're real, type-safe objects with real properties. `ProfileKey(userId)` is just a data class. No argument bundles, no type converters, no `/{userId}` path patterns.

Navigation happens by adding to the list: `backStack.add(SettingsKey)`. Going back happens by removing from the list: `backStack.removeLastOrNull()`. The system back button is handled automatically by `NavDisplay` — it pops the last entry for you. But you can also handle it yourself if you need custom back behavior.

## NavDisplay and Entry Providers

`NavDisplay` is the composable that reads your back stack and renders content. It takes a `backStack` and an `entryProvider` — a mapping from key types to composable content. The `entryProvider` DSL lets you define how each key should be rendered using the `entry<T>` function.

What's interesting is what NavDisplay is **not**. It's not a navigation controller. It doesn't maintain state about where you've been or enforce any navigation graph constraints. It's purely a rendering component — it looks at the current back stack, finds the matching entry for the top key, and renders it. If you change the list, it re-renders. This is Compose's declarative model applied to navigation: your back stack is state, and the UI is a function of that state.

The `entry` function also receives metadata that you can use to communicate with the parent layout. This is how Navigation 3 handles things like top bar titles, FAB visibility, and other scaffold-level concerns:

```kotlin
entry<ProfileKey>(
    metadata = NavEntryMetadata(
        title = "Profile",
        showTopBar = true,
        fabConfig = FabConfig.Hidden
    )
) { key ->
    ProfileScreen(userId = key.userId)
}
```

The parent `NavDisplay` (or your own wrapper around it) can read this metadata and configure the surrounding scaffold accordingly. This solves a problem that was genuinely painful in Navigation 2 — having child destinations control parent scaffold behavior usually meant hoisting state up through callbacks or using shared ViewModels as communication buses.

## Adaptive Layouts With Scene Strategies

Here's where Navigation 3 gets interesting. On a phone, you want single-pane navigation — one destination visible at a time. On a tablet or foldable, you might want a list-detail layout with two destinations visible simultaneously. In Navigation 2, this was a separate concern — you'd use `SlidingPaneLayout` or build your own adaptive wrapper, and then try to synchronize it with the navigation back stack. It never felt integrated.

Navigation 3 introduces **scene strategies** for this. A scene strategy defines how back stack entries are laid out on screen. The default is single-pane — one entry at a time. But you can use `ListDetailPaneScaffold` integration to show two entries side by side based on the window size:

```kotlin
@Composable
fun AdaptiveAppNavigation() {
    val backStack = rememberMutableStateListOf<Any>(InboxKey)

    NavDisplay(
        backStack = backStack,
        entryProvider = entryProvider {
            entry<InboxKey>(
                metadata = NavEntryMetadata(listDetailPane = ListDetailPane.List)
            ) { key ->
                InboxList(
                    onEmailClick = { emailId -> backStack.add(EmailDetailKey(emailId)) }
                )
            }
            entry<EmailDetailKey>(
                metadata = NavEntryMetadata(listDetailPane = ListDetailPane.Detail)
            ) { key ->
                EmailDetail(emailId = key.emailId)
            }
        },
        sceneStrategy = rememberListDetailSceneStrategy()
    )
}
```

The `sceneStrategy` tells `NavDisplay` to render entries in a list-detail layout when the screen is wide enough. On a compact screen, it falls back to single-pane navigation. The metadata on each entry tells the strategy which pane it belongs to. This is clean because the navigation logic (your back stack) doesn't change — only the visual layout changes based on screen size.

IMO, this is the most significant improvement over Navigation 2 for real-world apps. Every app I've worked on that needed to support tablets ended up with a custom adaptive navigation solution that was fragile and hard to test. Having it built into the navigation library, driven by the same back stack, is a huge win.

## How Navigation 3 Compares to Navigation 2

The philosophical difference is control. Navigation 2 manages things for you — the back stack, the transitions, the argument passing, the state restoration. You describe what you want to happen through a `NavGraph` and the library figures out how. Navigation 3 gives you the primitives and lets you compose them yourself.

**No NavGraph.** In Navigation 2, you define all your destinations upfront in a `NavHost` with `composable("route")` calls. In Navigation 3, there's no graph — you define how to render each key type in the `entryProvider`, and any key can be pushed onto the back stack at any time. This means your navigation structure is open and extensible, which is great for modular apps where different feature modules define their own keys.

**No string routes.** Navigation 2 uses string-based routes like `"profile/{userId}"`. Navigation 3 uses typed Kotlin objects. This eliminates an entire class of runtime errors — misspelled routes, wrong argument types, missing arguments. The compiler catches everything.

**Back stack is transparent.** You can log it, assert on it in tests, serialize it, modify it arbitrarily. In Navigation 2, the back stack is an implementation detail of `NavController`. In Navigation 3, it's your `MutableList<Any>`.

**Transitions are composable.** Navigation 3 lets you define transitions as part of the scene strategy or per-entry, using Compose animation APIs directly. No `enterTransition` / `exitTransition` lambdas on the `composable` call — you control the animation in your content or scene strategy.

The trade-off is maturity. Navigation 3 is still in alpha as of early 2026. The ecosystem hasn't caught up yet — deep linking support is more manual, there's no built-in equivalent to Navigation 2's `hiltViewModel()` scoping per destination, and most Android documentation and tutorials still reference Navigation 2. If you're starting a new project and can tolerate alpha APIs, Navigation 3 is the better foundation. If you have a mature app with deep Navigation 2 integration, I'd wait for stable before migrating.

## Comparing With Circuit's Navigation

It's worth noting that Circuit's navigation approach, which predates Navigation 3, follows a similar philosophy. In Circuit, screens are defined as sealed types, the back stack is managed explicitly through a `Navigator` that supports push/pop/reset operations, and the framework renders the top screen. Circuit goes further in separating presentation from UI — each screen has a Presenter and a Ui that communicate through a typed state contract.

Navigation 3 and Circuit share the belief that Compose navigation should be declarative and state-driven. The difference is scope. Circuit is a full architecture framework — it owns your presenters, your state management, and your dependency injection wiring. Navigation 3 is just navigation — it manages the back stack and rendering, but your state management and architecture are your choice. If you're already using Circuit, Navigation 3 is redundant. If you want Compose-native navigation without buying into a full architectural framework, Navigation 3 is the right fit.

The reframe moment for me was realizing that **navigation is just state management.** Your current screen is a function of your back stack state. The back stack is a list. Composables render based on state. This is exactly how everything else works in Compose — and Navigation 3 finally makes navigation work the same way. Navigation 2 tried to bring the Fragment navigation mental model into Compose. Navigation 3 starts from Compose's principles and builds navigation on top of them. That's why it feels fundamentally different, and IMO, fundamentally better.

## Should You Adopt It Now?

If you're starting a brand new Compose project with no legacy navigation code, I'd say yes — use Navigation 3 even in alpha. The API surface is small, the concepts are simple, and migrating between alpha versions is manageable when your codebase is young. You'll be building on the foundation that Google clearly intends to be the future of Android navigation.

If you have an existing app with Navigation 2, hold off on migrating but start understanding the concepts. Read the API, build a sample, get familiar with the back-stack-as-a-list mental model. When Navigation 3 hits stable, you'll want to migrate — and the migration will be significant because the mental model is so different. There's no incremental path from NavGraph-based navigation to list-based navigation. It's a rewrite of your navigation layer, but the rest of your app (ViewModels, repositories, use cases) stays the same.

The bigger takeaway is that Compose is still reshaping Android's fundamental building blocks. We got Compose for UI, then Compose for state management with Molecule and Circuit, and now Compose for navigation. Each piece that gets rebuilt on Compose's declarative foundation ends up simpler and more composable than what it replaced. Navigation 3 is another step in that direction, and it's a good one.

Thanks for reading!
