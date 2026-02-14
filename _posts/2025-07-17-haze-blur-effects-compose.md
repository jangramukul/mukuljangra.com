---
title: Haze — Building Blur Effects in Compose
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Libraries
---

Blur effects look simple. A frosted glass toolbar over scrolling content, a blurred background behind a bottom sheet, an overlay on a media player — these are standard UI patterns that iOS apps have used for years. But if you've ever tried to implement background blur in Android, you know it's anything but simple. The platform has fragmented blur support across API levels, the deprecated `RenderScript` blur was never designed for real-time UI effects, and `Modifier.blur` in Compose only blurs the content of the composable itself — not the content behind it. Background blurring, where one composable shows a blurred version of whatever is underneath it, requires capturing, processing, and rendering content from a different part of the composition tree. That's a fundamentally harder problem.

Chris Banes built Haze to solve exactly this. After years of working on Android UI libraries (he's the original author of several well-known Android libraries), he built Haze as a Compose and Compose Multiplatform library that handles background blur effects with a clean two-modifier API. Having used it in a side project, I think it's the most practical blur solution available for Compose today — though it comes with tradeoffs that are worth understanding.

## The Two-Modifier Design

Haze's API is built around a simple idea: you mark the content that should be blurred (the source), and you mark the composable that should show the blur effect (the effect). Two modifiers, two concerns.

The source modifier goes on the composable whose content you want to blur. Typically this is your main scrollable content — a `LazyColumn`, an image, or a full-screen background. The effect modifier goes on the composable that overlays the source — a top app bar, a bottom navigation bar, a bottom sheet.

```kotlin
val hazeState = remember { HazeState() }

Scaffold(
    topBar = {
        TopAppBar(
            title = { Text("Library") },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Color.Transparent,
            ),
            modifier = Modifier
                .hazeEffect(state = hazeState) {
                    backgroundColor = MaterialTheme.colorScheme.surface
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

The `HazeState` object connects the source and effect modifiers. It's how Haze knows which content to capture and where to render the blurred version. You create it with `remember`, pass it to both modifiers, and Haze handles the plumbing. The `backgroundColor` in the effect style isn't the blur color — it's the fallback color that determines the tint applied over the blur. Setting it to your surface color with some transparency gives you the frosted glass look.

This two-modifier approach is elegant because it separates the concerns cleanly. The source doesn't know anything about where or how the blur is rendered. The effect doesn't need to reference the source composable directly. They communicate through the shared `HazeState`, which tracks the source's rendered content and position.

## How It Works Under the Hood

The interesting engineering problem Haze solves is capturing content from one part of the composition tree and rendering a processed version somewhere else. Here's what actually happens when those two modifiers are active.

The `hazeSource` modifier captures the rendered content of its composable subtree into a graphics layer. On Android API 31+ (Android 12), this uses `RenderEffect` — specifically `RenderEffect.createBlurEffect()` — which is a hardware-accelerated blur operation that runs on the GPU. The capture is continuous: as the content scrolls or changes, the source updates the captured content.

The `hazeEffect` modifier takes the captured content, applies the blur, clips it to the effect composable's shape and bounds, and renders it as the background of the effect composable. It calculates the positional relationship between the source and the effect — figuring out which portion of the source content is directly behind the effect area — and only blurs and renders that region.

On API levels below 31, Haze uses a software fallback. It renders the source content to a `Bitmap`, applies a blur algorithm, and draws the blurred bitmap behind the effect composable. This works but is significantly more expensive than the hardware-accelerated path. The blur calculation runs on the CPU, the bitmap allocations create GC pressure, and the redraw frequency can cause frame drops on lower-end devices. Haze handles the platform detection internally, so your code doesn't change — but the performance characteristics are very different depending on the API level.

## Style Customization

Haze provides several style properties that let you control the visual appearance of the blur effect. These go in the lambda block of `hazeEffect`:

```kotlin
Modifier.hazeEffect(state = hazeState) {
    // How far the blur extends
    blurRadius = 24.dp

    // Tint applied over the blurred content
    backgroundColor = Color.White.copy(alpha = 0.7f)

    // Noise texture overlay for a frosted look
    noiseFactor = 0.15f
}
```

**`blurRadius`** controls the intensity of the blur. Higher values produce more diffused, heavily blurred content. Typical values range from 12dp to 30dp depending on how frosted you want the effect. Going above 40dp rarely adds visible difference but increases GPU workload.

**`backgroundColor`** is the tint overlaid on the blurred content. This is how you control the "color" of the frosted glass. A semi-transparent white gives you the classic iOS frosted look. A semi-transparent version of your theme's surface color integrates with Material Design. This color blends with the blurred content underneath, so the actual visual result depends on what's scrolling behind it.

**`noiseFactor`** adds a subtle grain texture over the blur. Apple's frosted glass effects use this — if you look closely at an iOS blur, there's a fine noise pattern that makes it look more like real frosted glass and less like a digital Gaussian blur. Setting this between 0.05 and 0.2 produces subtle results. Setting it to 0 gives a clean digital blur.

## Progressive Blur

One of the more impressive features in Haze is progressive blur — where the blur intensity varies across the effect area. Instead of a uniform blur, the effect fades from fully blurred to fully clear. This creates a much more natural transition effect, similar to what you see in Instagram Stories or Spotify's player view.

```kotlin
Modifier.hazeEffect(
    state = hazeState,
    style = HazeDefaults.style(
        backgroundColor = MaterialTheme.colorScheme.surface,
        blurRadius = 20.dp,
    ),
) {
    progressive = HazeProgressive.verticalGradient(
        startIntensity = 1f,
        endIntensity = 0f,
    )
}
```

Progressive blur isn't just a visual nicety — it's harder to implement than uniform blur because the blur radius needs to change spatially. Haze handles this by applying the blur in bands with varying radii, which is more GPU-intensive than a single-pass uniform blur but produces much nicer results. On API 31+, this leverages the hardware blur pipeline effectively. On older APIs, the fallback implementation may struggle with progressive blur at high frame rates.

## Comparing with Alternatives

Before Haze, your options for blur in Android Compose were limited and each had significant drawbacks.

**`Modifier.blur`** is built into Compose, but it blurs the content of the composable it's applied to — not the content behind it. If you apply `Modifier.blur(10.dp)` to a `Text`, you get blurred text. That's useful for specific effects but doesn't solve the frosted glass use case where you want to blur a background through an overlay.

**`RenderScript`** was the traditional Android blur solution, and it's deprecated as of Android 12. Google recommends migrating to the AGSL-based `RenderEffect` API, but `RenderEffect` only works on API 31+. If you're targeting API 24+, you're stuck either bundling a `RenderScript` fallback or using a third-party blur implementation. And neither approach integrates cleanly with Compose's rendering pipeline.

**`RenderEffect`** on API 31+ is hardware-accelerated and capable, but it's a View-system API. Using it in Compose requires `AndroidView` interop or working with `GraphicsLayer` directly. You'd need to manually handle the content capture, positioning, and clipping that Haze does automatically. For a one-off blur effect, this might be acceptable. For multiple blur effects across an app with different shapes and styles, you'd essentially be building Haze yourself.

Haze's value proposition is that it wraps all of this behind a clean Compose-native API. It uses `RenderEffect` when available, falls back gracefully on older APIs, handles the coordinate math between source and effect, and provides style customization. The tradeoff is the dependency — you're adding a library for a visual effect. IMO, the alternative of building and maintaining your own cross-API blur pipeline is worse.

## Compose Multiplatform Support

One of Haze's strongest selling points is that it works across Compose Multiplatform targets. The same `hazeSource`/`hazeEffect` API works on Android, iOS, and Desktop. On iOS, Haze uses the platform's native `UIVisualEffectView` blur capabilities, which are highly optimized. On Desktop (JVM), it uses Skia's blur filters through Compose Desktop's rendering backend.

This matters because blur effects are a common design element in cross-platform apps, and each platform has its own blur API with its own quirks. Writing platform-specific blur code for three targets and keeping them visually consistent is tedious work. Haze abstracts the platform differences so you get consistent behavior from a single API. The visual output isn't pixel-identical across platforms — iOS blur looks slightly different from Android blur because they use different algorithms — but the API and the general aesthetic are consistent.

## Real Use Cases and Performance Considerations

In practice, I've found Haze works best for a few specific patterns. Top app bars that blur the content scrolling beneath them are the classic use case — it gives your app that polished look without obscuring the status bar area. Bottom sheets with blurred backgrounds work well, especially for media apps where the sheet overlays album art or video. Navigation bars that sit over scrolling content benefit from the progressive blur feature for a smooth transition.

Where I've seen issues is with multiple simultaneous blur effects or with blur on frequently changing content. Each `hazeEffect` modifier adds rendering work — capturing the source region, applying the blur, compositing the result. Two or three effects on screen simultaneously are fine on modern devices with API 31+. On older devices with the software fallback, even a single blur can cause noticeable frame drops during fast scrolling. My recommendation is to always test blur effects on your lowest-supported API level, not just your development device. The performance gap between the hardware and software paths is dramatic — I've measured frame times going from 4ms on a Pixel 7 (API 33) to 18ms on an older device running API 28 for the same blur configuration.

The other consideration is that blur effects inherently add visual weight to your UI. A frosted glass toolbar over a busy background can make text harder to read. Haze's `backgroundColor` tint helps with this — a semi-transparent surface color behind the blur increases text contrast. But you should be testing with accessibility tools and ensuring sufficient contrast ratios, especially for text over blurred content.

Haze 1.0 is production-ready and well-maintained. For any Compose app that needs background blur effects, it's the library I'd reach for first. The alternative — building your own cross-API blur pipeline with proper Compose integration — is a significant engineering effort for something that Haze handles in two modifier calls.

Thank You!
