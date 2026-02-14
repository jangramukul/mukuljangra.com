---
title: Navigation 3 — Compose-Native Navigation Rebuilt from Scratch
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Architecture
---

I've spent more hours fighting Navigation 2 than I'd like to admit. Type-safe arguments with Safe Args that still needed string-based route patterns. A `NavGraph` that existed alongside Compose code for no good reason. A back stack managed internally with no way to inspect or manipulate it directly. The navigation library always felt like it was designed for the Fragment world and awkwardly ported to Compose. Because that's exactly what it was — the original Jetpack Navigation was announced in 2018, before Compose even existed.

Navigation 3 is not Navigation 2 with a new API surface. It's a complete rethink, built from scratch specifically for Compose. The core idea is almost too obvious: **the back stack is just a list.** You own it. You push items, you pop items, you inspect it, you modify it however you want. The library observes your list and renders whatever's on top. No `NavGraph`, no route registration, no destination declarations upfront. Just a mutable list of keys and a composable that maps each key to content. When Google announced this at I/O 2025, my first reaction was — this is how Compose navigation should have worked from day one. Navigation 3 hit stable 1.0 in November 2025, and the current stable release is 1.0.1, with 1.1.0 in alpha adding features like type-safe metadata DSL and shared element transitions.

## Type-Safe Keys Instead of String Routes

One of the worst parts of Navigation 2 was the string-based routing system. You'd define routes like `"profile/{userId}"` and then parse arguments out of a `NavBackStackEntry` with string keys. Safe Args helped, but it was a code-gen layer on top of a fundamentally string-based system. Misspell a route? Runtime crash. Wrong argument type? Runtime crash. Forget an argument? Runtime crash.

Navigation 3 eliminates this entire problem category. Your navigation keys are regular Kotlin types — data classes, data objects, sealed classes, whatever fits your domain. They're annotated with `@Serializable` for state restoration across process death, but they're not strings or URL-like path patterns. `ProfileKey(userId = "abc")` is just a data class with a typed property. The compiler enforces everything at build time.

```kotlin
@Serializable
data object HomeKey

@Serializable
data object SettingsKey

@Serializable
data class ProfileKey(val userId: String)
```

No argument bundles, no type converters, no `/{userId}` path patterns, no `NavType<T>` implementations. If you've ever written a custom `NavType` for a complex argument in Navigation 2, you know how much ceremony that requires. In Navigation 3, your key is the argument. It's a Kotlin object with Kotlin types. That's it.

## The Back Stack Is Your List

In Navigation 2, the back stack is an internal implementation detail of `NavController`. You can observe it through `currentBackStackEntryAsState()`, but you can't manipulate it freely. Want to clear the stack and navigate to a new root? You need to chain `popUpTo` with `inclusive = true` and hope the route IDs match. Want to reorder entries or inspect the full stack in tests? Not really supported.

Navigation 3 flips this completely. The back stack is a `SnapshotStateList<Any>` that you create and own. The library expects it to be backed by Compose snapshot state so it can observe changes and re-render. You create it with `mutableStateListOf`, add keys to navigate forward, remove keys to go back, and `NavDisplay` reflects whatever state the list is in.

```kotlin
@Composable
fun AppNavigation() {
    val backStack = remember { mutableStateListOf<Any>(HomeKey) }

    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
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
```

Navigation forward is `backStack.add(SettingsKey)`. Going back is `backStack.removeLastOrNull()`. The `onBack` lambda on `NavDisplay` is called when the user triggers a system back event — you decide what happens. Want to show a confirmation dialog before popping? Do it in `onBack`. Want to clear the entire stack and go home? Replace the list contents. The back stack is yours, and every standard Kotlin list operation works on it. You can log it, assert on it in tests, serialize it, filter it, reorder it — operations that were either impossible or required workarounds in Navigation 2.

## NavEntry and the Entry Provider DSL

`NavDisplay` is the composable that reads your back stack and renders content. It takes two core inputs: your `backStack` list and an `entryProvider` that maps each key type to a `NavEntry` — Navigation 3's unit of content. Each `NavEntry` wraps a key and a composable that renders the screen for that key.

The `entryProvider` DSL uses the `entry<T>` function to define type-safe mappings. When the back stack changes, `NavDisplay` passes the top key to the entry provider, gets back a `NavEntry`, and renders its content. What's important is what `NavDisplay` is **not** — it's not a navigation controller, it doesn't maintain internal state about where you've been, and it doesn't enforce any graph constraints. It's purely a rendering component. Your back stack is state, and the UI is a function of that state. This is Compose's declarative model applied to navigation.

Each `NavEntry` can also carry **metadata** — a `Map<String, Any>` that communicates information to the parent layout. Scene strategies (more on those below) read this metadata to decide how to lay out entries. You can also use metadata for scaffold-level concerns like toolbar titles or transition overrides:

```kotlin
entry<ProfileKey>(
    metadata = mapOf(
        "title" to "Profile",
        "showTopBar" to true
    )
) { key ->
    ProfileScreen(userId = key.userId)
}
```

The parent composable wrapping `NavDisplay` can read this metadata and configure the surrounding scaffold accordingly. This solves a problem that was genuinely painful in Navigation 2 — child destinations controlling parent scaffold behavior usually meant hoisting state through callbacks or using shared ViewModels as communication buses. With metadata, the entry declares what it needs, and the layout reads it. Clean separation, no coupling.

## Adaptive Layouts With Scene Strategies

Here's where Navigation 3 gets genuinely interesting for real-world apps. On a phone, you want single-pane navigation — one destination visible at a time. On a tablet or foldable, you might want a list-detail layout with two destinations visible simultaneously. In Navigation 2, adaptive layouts were a completely separate concern. You'd use `SlidingPaneLayout` or build your own wrapper, then try to synchronize it with the navigation back stack. It never felt integrated.

Navigation 3 introduces **scene strategies** — a system where a `SceneStrategy` determines how back stack entries are laid out on screen. A `Scene` is the visual unit that can display one or more `NavEntry` objects. The default strategy is `SinglePaneSceneStrategy`, which renders one entry at a time. But you can use `ListDetailSceneStrategy` from the Material 3 adaptive library to show list and detail entries side by side when the window is wide enough:

```kotlin
@Composable
fun AdaptiveMailApp() {
    val backStack = remember { mutableStateListOf<Any>(InboxKey) }
    val listDetailStrategy = rememberListDetailSceneStrategy<Any>()

    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        sceneStrategy = listDetailStrategy,
        entryProvider = entryProvider {
            entry<InboxKey>(
                metadata = ListDetailSceneStrategy.listPane()
            ) { key ->
                InboxList(
                    onEmailClick = { emailId -> backStack.add(EmailDetailKey(emailId)) }
                )
            }
            entry<EmailDetailKey>(
                metadata = ListDetailSceneStrategy.detailPane()
            ) { key ->
                EmailDetail(emailId = key.emailId)
            }
        }
    )
}
```

The `listPane()` and `detailPane()` helper functions add metadata markers that tell the strategy which pane each entry belongs to. On a compact screen, it falls back to single-pane. On a wide screen, it renders both panes in a 40/60 split. The navigation logic — your back stack — doesn't change at all. Only the visual layout adapts based on screen size. You can even chain strategies with `then` to create fallback chains: try list-detail first, fall back to single-pane if the screen is too narrow.

IMO, this is the most significant improvement over Navigation 2 for production apps. Every app I've worked on that needed tablet support ended up with a custom adaptive navigation wrapper that was fragile and hard to test. Having it built into the navigation library, driven by the same back stack, is a huge win.

## Composable Transitions

Navigation 3 gives you direct control over transition animations through Compose's animation APIs. `NavDisplay` uses `AnimatedContent` internally, so you get built-in enter and exit transitions, including support for predictive back gestures. The 1.1.0 alpha releases added a type-safe metadata DSL for specifying per-entry transitions, so individual destinations can override the default animation behavior.

What matters is that transitions are composable in the Compose sense — they're part of the scene strategy and the content, not separate `enterTransition` / `exitTransition` lambdas bolted onto a `composable()` call. The `Scene` interface has a `content` composable where you control exactly how entries appear and disappear. If you need shared element transitions across scenes, the 1.1.0 alpha supports passing a `SharedTransitionScope` into `NavDisplay`.

## How It Differs From Navigation 2

The philosophical difference is control versus convention. Navigation 2 manages things for you — the back stack, the transitions, the argument passing, the state restoration. You describe what you want through a `NavGraph` and the library figures out how. Navigation 3 gives you the primitives and lets you compose them yourself.

**No NavGraph.** In Navigation 2, you define all destinations upfront in a `NavHost` with `composable("route")` calls. Navigation 3 has no graph — you define how to render each key type in the `entryProvider`, and any key can be pushed onto the back stack at any time. This makes navigation open and extensible, which matters for modular apps where different feature modules define their own keys without registering them centrally.

**No string routes.** Navigation 2 uses string-based routes like `"profile/{userId}"`. Navigation 3 uses typed Kotlin objects. An entire class of runtime errors — misspelled routes, wrong argument types, missing arguments — is eliminated. The compiler catches everything.

**Transparent back stack.** In Navigation 2, the back stack is an implementation detail of `NavController`. In Navigation 3, it's your `SnapshotStateList<Any>`. You can log it, assert on it in tests, serialize it, modify it arbitrarily.

**Composable transitions.** No `enterTransition` / `exitTransition` lambdas on `composable()` calls. You control animation through the scene strategy or per-entry metadata, using Compose's animation APIs directly.

The trade-off is ecosystem maturity. Deep linking support is more manual — you handle the incoming intent and translate it into back stack state yourself. There's no built-in equivalent to Navigation 2's `hiltViewModel()` scoping per destination, though Navigation 3 does support ViewModel scoping through a dedicated Jetpack lifecycle library (`navigation3-lifecycle-viewmodel`). Most existing tutorials and documentation still reference Navigation 2. But the foundation is stable and the API surface is deliberately small.

## Comparing With Circuit's Navigation

It's worth noting that Slack's Circuit framework, which predates Navigation 3, follows a similar philosophy. Circuit defines screens as sealed types, manages the back stack explicitly through a `Navigator` with push/pop/resetRoot operations, and renders the top screen. Circuit goes further in separating presentation from UI — each screen has a Presenter and a Ui that communicate through a typed state contract, enforced at compile time with `@ComposableTarget("presenter")`.

Navigation 3 and Circuit share the belief that Compose navigation should be declarative and state-driven. The difference is scope. Circuit is a full architecture framework — it owns your presenters, your state management, and your dependency injection wiring through its `Screen` and `Presenter` abstractions. Navigation 3 is just navigation — it manages the back stack and rendering, but your state management approach (ViewModel, MVI, Circuit, Molecule) is your choice. If you're already using Circuit, Navigation 3 is redundant — Circuit's `Navigator` covers the same ground and more. If you want Compose-native navigation without buying into a full architectural framework, Navigation 3 is the right fit.

The reframe moment for me was realizing that **navigation is just state management.** Your current screen is a function of your back stack state. The back stack is a list. Composables render based on state. This is exactly how everything else works in Compose — and Navigation 3 finally makes navigation work the same way. Navigation 2 tried to bring the Fragment navigation mental model into Compose. Navigation 3 starts from Compose's own principles — state observation, declarative rendering, composition — and builds navigation on top of them. That's why it feels fundamentally different.

## Real-World Patterns

In modular apps, Navigation 3 works naturally because there's no central graph registration. Each feature module defines its own key types and provides its entry mappings. The app module composes them together in a single `entryProvider` or chains multiple providers. No shared route constants file, no single NavGraph that every module depends on.

For deep linking, you handle the incoming `Intent` in your activity, parse the URI, and translate it into back stack state — push the appropriate keys onto your `mutableStateListOf`. It's more manual than Navigation 2's `<deepLink>` declarations, but it's also more transparent. You see exactly what the back stack looks like after a deep link, and you can customize the intermediate screens that should appear when the user presses back.

For adaptive layouts, the `SceneStrategy` system means your navigation code doesn't fork between phone and tablet. You write one back stack, one entry provider, and let the scene strategy handle layout. If you need a three-pane layout (list + detail + extra), the Material adaptive library's `ListDetailSceneStrategy` supports an `extraPane()` metadata marker for exactly this. Your navigation logic stays the same — only the scene strategy changes.

Compose keeps reshaping Android's fundamental building blocks. We got Compose for UI, then Compose for state management with Molecule and Circuit, and now Compose for navigation. Each piece that gets rebuilt on Compose's declarative foundation ends up simpler and more transparent than what it replaced. Navigation 3 is another step in that direction, and I think it's the right one.

Thanks for reading!
