---
title: Haze — Building Blur Effects in Compose
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Libraries
---

I spent an embarrassing amount of time trying to build a frosted glass toolbar in Compose before I accepted that Android just doesn't make this easy. The platform has `Modifier.blur`, but that blurs the content *of* the composable — if you apply it to a `Text`, you get blurred text, not a frosted overlay showing blurred content behind it. The actual problem — capturing rendered content from one part of the tree, blurring it, and rendering it somewhere else — is fundamentally different from just slapping a Gaussian filter on a single element. `RenderScript` used to handle blur on the platform level, but it's deprecated since Android 12. The replacement, `RenderEffect`, is hardware-accelerated but only works on API 31+ and is a View-system API that doesn't integrate cleanly with Compose's rendering pipeline.

Chris Banes built [Haze](https://github.com/chrisbanes/haze) to solve this problem properly. Haze is a Compose and Compose Multiplatform library (2.1k+ GitHub stars) that handles background blur effects with a clean two-modifier API. It uses `RenderEffect` when available, falls back gracefully on older APIs, and works across Android, iOS, Desktop, Wasm, and JS/Canvas — all from the same code. Having used it in a project, I think it's the most practical blur solution for Compose today.

## Getting Started

Haze is published on Maven Central. Add the dependency to your module-level `build.gradle.kts`:

```kotlin
repositories {
    mavenCentral()
}

dependencies {
    // Core library
    implementation("dev.chrisbanes.haze:haze:1.7.1")

    // Optional: pre-built material styles
    implementation("dev.chrisbanes.haze:haze-materials:1.7.1")
}
```

The core `haze` artifact gives you the two-modifier API — `hazeSource` and `hazeEffect`. The optional `haze-materials` artifact provides pre-built `HazeStyle` implementations that mimic iOS, Windows, and Material-like frosted effects out of the box. If you just need basic blur with custom styling, the core library is all you need.

## HazeState — The Communication Bridge

The core concept behind Haze's design is `HazeState`. It acts as the communication channel between the composable whose content you want to blur (the source) and the composable that displays the blur effect. You create it with `rememberHazeState()` and pass it to both modifiers.

Here's the thing — this isn't just a flag or a simple observable. Under the hood, `HazeState` tracks the source's rendered content via Compose's `GraphicsLayer` APIs (which wrap platform-specific primitives like `RenderNode` on Android). When the source content changes — the user scrolls, an image loads, an animation runs — the state updates the captured content, and the effect modifier picks up the change. It's continuous, not snapshot-based.

For deep UI hierarchies where passing `HazeState` through multiple composable parameters gets messy, you can use a `CompositionLocal`:

```kotlin
val LocalHazeState = compositionLocalOf { HazeState() }

@Composable
fun MusicApp() {
    val hazeState = rememberHazeState()
    CompositionLocalProvider(LocalHazeState provides hazeState) {
        AlbumBackground(modifier = Modifier.fillMaxSize())
        PlayerOverlay(modifier = Modifier.fillMaxSize())
    }
}
```

This pattern is especially useful in apps with shared design systems where the blur source (a full-screen background) and the blur effect (a floating player bar) live in completely different parts of the component tree.

## The Two-Modifier API

Haze's API comes down to two modifiers: `hazeSource` and `hazeEffect`. The source goes on the composable whose content should be blurred — typically your main scrollable content, a background image, or a full-screen layout. The effect goes on the overlay — a top app bar, bottom sheet, or navigation bar.

```kotlin
val hazeState = rememberHazeState()

Scaffold(
    topBar = {
        TopAppBar(
            title = { Text("Library") },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Color.Transparent,
            ),
            modifier = Modifier
                .hazeEffect(state = hazeState) {
                    blurRadius = 20.dp
                }
                .fillMaxWidth(),
        )
    },
) { padding ->
    LazyColumn(
        modifier = Modifier
            .hazeSource(state = hazeState)
            .fillMaxSize(),
        contentPadding = padding,
    ) {
        items(albums) { album ->
            AlbumCard(album)
        }
    }
}
```

The elegance is in the separation. The source doesn't know where or how the blur is rendered. The effect doesn't reference the source composable directly. They communicate solely through `HazeState`. The effect modifier calculates the positional relationship between itself and the source — figuring out which region of the source content is directly behind it — and only blurs and renders that region. You can have multiple `hazeEffect` modifiers pointing at the same source (a toolbar *and* a bottom bar blurring the same scrollable list), and each one independently clips and processes its own portion.

The naming has evolved over Haze's lifetime. In versions before 1.0, the modifiers were called `haze` (for source) and `hazeChild` (for effect). The rename to `hazeSource`/`hazeEffect` in 1.0 made the roles much clearer. If you're reading older blog posts or Stack Overflow answers that reference `hazeChild`, it's the same thing as `hazeEffect`.

## Styling the Blur

Haze provides three core styling properties in the `hazeEffect` lambda block:

```kotlin
Modifier.hazeEffect(state = hazeState) {
    blurRadius = 24.dp
    noiseFactor = 0.15f
    tints += HazeTint(
        color = Color.White.copy(alpha = 0.7f),
    )
}
```

**`blurRadius`** controls blur intensity. The default is `20.dp`, and typical values range from 12dp to 30dp. Going above 40dp rarely adds visible difference but costs more GPU time. For text-heavy overlays, a higher radius (24-30dp) keeps the background indistinct enough that foreground text stays readable.

**`noiseFactor`** adds a subtle grain texture. If you look closely at iOS frosted glass effects, there's a fine noise pattern that makes the blur look physical rather than digital. Haze defaults to `0.15f` (15% strength). Setting it between 0.05 and 0.2 produces subtle frosted results. Setting it to `0f` gives a clean, purely digital blur.

**Tints** are color overlays applied on top of the blurred content. This is how you control the "color" of the frosted glass. A semi-transparent white gives the classic iOS look. A semi-transparent version of your Material surface color integrates naturally with your theme. You can stack multiple tints for layered effects. The visual result depends on what's scrolling behind the overlay, so test with actual content, not just a placeholder.

Styling resolves through a precedence chain: values set directly in the `HazeEffectScope` lambda override values from the `style` parameter, which override the `LocalHazeStyle` composition local. This means you can set app-wide defaults via `LocalHazeStyle` and override per-composable where needed.

## Frosted Glass and Materials

Achieving the iOS-style frosted glass look — what designers call glassmorphism — is what Haze was specifically designed for. The combination of blur, tint, and noise produces that translucent, slightly grainy overlay that Apple has used since iOS 7.

The `haze-materials` add-on library provides pre-built styles so you don't have to hand-tune blur values:

```kotlin
Modifier.hazeEffect(
    state = hazeState,
    style = HazeMaterials.ultraThin(),
)
```

`HazeMaterials` offers levels like `ultraThin()`, `thin()`, `regular()`, and `thick()` — inspired by SwiftUI's material APIs but not trying to match iOS pixel-for-pixel. For apps that need closer visual parity with native iOS, there's `CupertinoMaterials`, built from Apple's iOS 18 Figma file, and `FluentMaterials` for Windows-style effects. Using these pre-built materials is IMO the faster path for most apps — figuring out the right blur radius, tint opacity, and noise combination for a polished frosted look takes more iteration than you'd expect.

## Progressive Blur

Progressive blur is where the blur intensity varies across the effect area — fully blurred at one edge, fading to clear at the other. This is the effect you see in Instagram Stories and Spotify's player view, where content gradually emerges from behind a blurred overlay.

```kotlin
Modifier.hazeEffect(state = hazeState) {
    progressive = HazeProgressive.verticalGradient(
        startIntensity = 1f,
        endIntensity = 0f,
        easing = EaseIn,
    )
}
```

Haze supports linear gradients (vertical and horizontal), radial gradients, and custom `Brush`-based progressive effects. The `easing` parameter is a nice touch — linear gradients tend to look harsh at the transition boundary, and applying an `EaseIn` curve makes the fade look more natural. Chris Banes borrowed the idea from using easing curves for scrims, where the same perceptual problem exists.

Here's the reframe moment for this entire library, actually. Progressive blur isn't just "blur with a gradient mask." The blur *radius itself* changes spatially — different parts of the image are blurred by different amounts. On Android SDK 33+ and all Skia-backed platforms (iOS, Desktop), Haze implements this with a custom runtime shader. On SDK 32, it falls back to drawing multiple `GraphicsLayer` instances at different blur radii stacked on top of each other. On SDK 31 and below, it uses a simpler scrim-based approximation. The performance difference is real: runtime shader adds roughly 25% overhead, while the multi-layer fallback on SDK 32 costs about 2x. If progressive blur is too expensive for your target devices, Haze offers a `mask` property that uses a `Brush` as an alpha mask — visually similar but with negligible performance cost since it only fades opacity, not the blur radius.

## Real-World Blur Patterns

In practice, I've found Haze works best for a handful of specific UI patterns.

### Top App Bar Blur

The classic use case. A transparent toolbar sits above scrolling content, showing a blurred version of whatever is beneath it. The `Scaffold` example above demonstrates this. The key detail: set `containerColor = Color.Transparent` on the app bar so the blur effect is actually visible. You can also dynamically control the effect's `alpha` based on scroll position — fully transparent when the list is at the top, fully blurred once the user scrolls past the first item.

### Bottom Sheet Overlay

Media apps frequently use blurred overlays behind bottom sheets. The album art or video continues behind the sheet, but blurred. With Haze, the content area is your `hazeSource`, and the bottom sheet composable gets `hazeEffect`. Using `CupertinoMaterials.thin()` here gives a convincing platform-native feel on iOS targets in Compose Multiplatform apps.

### Navigation Bar

A bottom navigation bar with progressive blur creates a smooth transition between content and controls. Apply `HazeProgressive.verticalGradient(startIntensity = 0f, endIntensity = 1f)` — note the reversed direction compared to the top bar — so the blur intensifies toward the bottom of the screen.

### Overlapping Blurred Elements

A pattern I didn't expect Haze to handle is overlapping blur layers — think stacked credit cards where each card shows a blurred version of whatever is behind it, including other cards. Haze supports this through a `zIndex` parameter on `hazeSource`:

```kotlin
// Rear card
CreditCard(
    modifier = Modifier
        .hazeSource(hazeState, zIndex = 1f)
        .hazeEffect(hazeState)
)
// Front card
CreditCard(
    modifier = Modifier
        .hazeSource(hazeState, zIndex = 2f)
        .hazeEffect(hazeState)
)
```

Each effect automatically draws only the layers with a lower `zIndex` than its sibling source. The API is surprisingly clean for what is a genuinely complex rendering problem.

## Performance

Real-time blur is expensive. This is the honest tradeoff with Haze, and it's worth understanding the numbers.

On Android, Haze uses two completely different rendering paths. On API 31+ (Android 12), it uses `RenderEffect.createBlurEffect()` — a hardware-accelerated GPU operation. Below API 31, it falls back to a software path that renders to a `Bitmap` and applies blur on the CPU. Your code doesn't change between the two paths, but the performance characteristics are dramatically different.

Chris Banes publishes Macrobenchmark results for every major release. For Haze 1.x on a Pixel 6, the P90 frame duration numbers tell the story. In a typical Scaffold scenario (app bar and bottom nav blurred over a scrolling list), frame times go from 7.5ms without Haze to 9.7ms with it — a 29% increase. An images list with per-item blur sources adds about 45% overhead. These numbers are for the hardware-accelerated path on API 33+. On devices running the software fallback, the gap widens significantly. I'd recommend always testing on your lowest supported API level, not just your development device.

Three practical tips for keeping blur performant. First, use `HazeInputScale` — setting `inputScale = HazeInputScale.Auto` (or a manual value like `0.66f`) scales down the content before blurring, reducing pixel count by up to 55% with minimal visible difference. Chris Banes' benchmarks show a 5-20% reduction in Haze's rendering cost with `inputScale = 0.5`. Second, if progressive blur is too expensive, use `mask` with a gradient `Brush` instead — it's about 5x cheaper in relative terms. Third, keep the number of simultaneous `hazeEffect` modifiers reasonable. Two or three on screen is fine on modern hardware. More than that, and you're stacking rendering passes.

## Compose Multiplatform Support

Haze supports Android, iOS, Desktop (JVM), Wasm, and JS/Canvas from a single API. Since the 1.0 rewrite, the library uses Compose's `GraphicsLayer` APIs as the common abstraction layer. On Android, this wraps `RenderNode`. On iOS and Desktop, it uses Skia's `ImageFilter` directly. The Skia implementation was originally influenced by Kirill Grouchnikov's work on [shader-based render effects in Compose Desktop](https://www.pushing-pixels.org/2022/04/09/shader-based-render-effects-in-compose-desktop-with-skia.html), while the Android implementation built on techniques from Chet Haase and Nader Jawad's [RenderNode for Bigger, Better Blurs](https://medium.com/androiddevelopers/rendernode-for-bigger-better-blurs-ced9f108c7e2) work.

The visual output isn't pixel-identical across platforms — different blur algorithms produce slightly different results — but the API is the same and the aesthetic is consistent. For teams building with Compose Multiplatform, this means one blur implementation instead of three platform-specific ones. The `CupertinoMaterials` styles are particularly useful here: when mixing Compose Multiplatform content alongside SwiftUI on iOS, they provide visual consistency with the native platform.

Haze is production-ready and actively maintained. It's the library I'd reach for first in any Compose app that needs background blur — the alternative of building your own cross-API, cross-platform blur pipeline is a significant engineering effort for what Haze handles in two modifier calls.

Thank You!
