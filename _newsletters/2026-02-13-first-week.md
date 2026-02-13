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

**Composition Tracing:** Traces are often the best source of information when first looking into a performance issue. They allow you to form a hypothesis of what the issue is and where to start looking. There are two levels of tracing supported on Android: system tracing and method tracing.

---

## 🧪 Kotlin 2.3 — What's New

Kotlin 2.3 brings several exciting features. Here are the highlights worth exploring:

### Guard Conditions in `when`

You can now add guard conditions to `when` branches using `if`:

```kotlin
sealed interface Animal {
    data class Cat(val mouseHunter: Boolean) : Animal
    data class Dog(val breed: String) : Animal
}

fun feedAnimal(animal: Animal) {
    when (animal) {
        is Animal.Cat if animal.mouseHunter -> println("Feed the mouse-hunting cat less")
        is Animal.Cat -> println("Feed the cat")
        is Animal.Dog if animal.breed == "Husky" -> println("Extra food for the Husky!")
        is Animal.Dog -> println("Feed the dog")
    }
}
```

### Multi-Dollar String Interpolation

Useful when working with templates or regex — you can now control how many `$` signs trigger interpolation:

```kotlin
// $$ means only $$variable is interpolated, single $ is literal
val price = $$"""
    The item costs $10.
    Your discount: $$discount
"""
```

### Non-Local `break` and `continue`

You can now use `break` and `continue` inside inline lambdas:

```kotlin
fun processItems(items: List<String>) {
    items.forEach { item ->
        if (item == "SKIP") continue  // skips to next iteration
        if (item == "STOP") break     // exits the loop entirely
        println(item)
    }
}
```

### Context Parameters (Experimental)

A new way to pass implicit context without threading parameters everywhere:

```kotlin
context(logger: Logger)
fun processData(data: String) {
    logger.info("Processing: $data")
}
```

---

## 🎤 Conferences & Videos

**What's new in Android Studio's AI Agent:** Discover how the AI agent in Android Studio can dramatically improve your efficiency and app quality — intelligent code transformation, automatic version upgrades, and new UI-specific tools.

**Navigation 3 API overview:** Learn Jetpack Navigation 3, Google's new library for building navigation in Android apps. Discover how to use keys to represent navigable content, manage your back stack, and create NavEntrys. Here's a quick look at the new API:

```kotlin
// Navigation 3 uses a simple back stack of keys
val backStack = rememberMutableStateListOf<Any>(HomeScreen)

NavDisplay(
    backStack = backStack,
    entryProvider = { key ->
        when (key) {
            is HomeScreen -> NavEntry(key) {
                HomeContent(
                    onNavigate = { backStack.add(DetailScreen(it)) }
                )
            }
            is DetailScreen -> NavEntry(key) {
                DetailContent(id = key.id)
            }
        }
    }
)
```

**Structured Concurrency — The Paradigm Shift:** Concurrent tasks should have a clear beginning, end, and scope, just like any other code block. This session cuts through the hype to reveal the core principle behind structured concurrency.

**White-Labelling Your Compose and XML UI with Design Tokens:** Nutmeg's real-world journey in building a scalable, multi-themed design system that powers both the Nutmeg app and the Chase UK app from a single codebase.

**A Deep Dive on Lifecycle-Aware Coroutines APIs:** Collecting in a lifecycle-aware manner is essential for saving system resources. A deep look at `repeatOnLifecycle`, `flowWithLifecycle`, and Compose's `collectAsStateWithLifecycle`:

```kotlin
// The recommended way to collect flows in a lifecycle-aware manner
class MyFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    updateUI(state)
                }
            }
        }
    }
}

// In Compose — much simpler
@Composable
fun MyScreen(viewModel: MyViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    // Use uiState directly
}
```

---

## 🛠️ Releases & Open-Source

**Kotlin 2.3.0-RC2:** The Kotlin 2.3.0-RC2 release is out! The Kotlin plugins that support 2.3.0-RC2 are bundled in the latest versions of IntelliJ IDEA and Android Studio. Just change the Kotlin version to 2.3.0-RC2 in your build scripts.

**Jetpack Release — December 3, 2025:** Includes Compose 1.10.0, SwipeRefreshLayout 1.2.0, and bug fixes in Activity 1.12.1, NavigationEvent 1.0.1, ExifInterface 1.4.2, and Wear Compose 1.5.6.

- **Compose 1.10.0** is stable with performance improvements, retain APIs, plus new animation features.
- **SwipeRefreshLayout 1.2.0** is out as part of a push to get long-running alphas to stable.
- **Ink 1.0.0-rc01** — New library for stylus/ink input handling.
- **Compose 1.11.0-alpha01** — Introduces the new `visible` modifier!
- **Navigation3 1.1.0-alpha01** — Entries as shared elements for seamless transitions.
- XR library updates for spatial computing.

### Compose 1.10 Highlights

The `retain` API lets you keep expensive objects across recompositions without `remember` overhead:

```kotlin
@Composable
fun HeavyScreen() {
    val parser = retain { ExpensiveXmlParser() }
    val result = parser.parse(data)
    Text(result)
}
```

New `AnimatedVisibility` improvements — shared element transitions are now smoother:

```kotlin
AnimatedVisibility(
    visible = showDetails,
    enter = fadeIn() + expandVertically(),
    exit = fadeOut() + shrinkVertically()
) {
    DetailCard(item)
}
```

---

## 📱 Android API Spotlight

### Predictive Back Gesture (Android 14+)

Android 14 introduced the predictive back gesture system. If you haven't adopted it yet, here's how:

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Enable predictive back in manifest:
        // android:enableOnBackInvokedCallback="true"

        onBackPressedDispatcher.addCallback(this) {
            // Custom back handling
            if (viewModel.hasUnsavedChanges()) {
                showDiscardDialog()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }
    }
}
```

### Photo Picker Improvements

The photo picker now supports ordering and pre-selection:

```kotlin
val pickMedia = rememberLauncherForActivityResult(
    ActivityResultContracts.PickMultipleVisualMedia(maxItems = 5)
) { uris ->
    uris.forEach { uri ->
        // Handle selected media
    }
}

Button(onClick = { pickMedia.launch(PickVisualMediaRequest()) }) {
    Text("Select Photos")
}
```

---

## 🔎 AOSP Spotlight

**Move gap-buffer slot table into its own package:** A refactoring that moves the SlotTable and associated classes into its own package — a step toward allowing a new composer implementation, based on a link buffer instead of a gap buffer, to land behind a flag.

**Compose compiler optimization for stable lambdas:** A new optimization pass in the Compose compiler that detects lambdas which capture only stable values. These lambdas are now automatically memoized, reducing unnecessary recompositions without requiring explicit `remember` wrappers.

---

## 💡 Quick Tip of the Week

**Use `derivedStateOf` to avoid unnecessary recompositions:**

```kotlin
@Composable
fun FilteredList(items: List<Item>, query: String) {
    // ❌ Bad — recomposes on every items/query change, even if result is same
    val filtered = items.filter { it.name.contains(query) }

    // ✅ Good — only recomposes when the filtered result actually changes
    val filtered by remember(items, query) {
        derivedStateOf { items.filter { it.name.contains(query) } }
    }

    LazyColumn {
        items(filtered) { item -> ItemRow(item) }
    }
}
```

---

*That's a wrap for this week! See you in the next issue. 🐝*
