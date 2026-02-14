---
title: "Navigation, Theming & Architecture Patterns"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 6
sequence: 52
---

## Navigation, Theming & Architecture Patterns

Navigation and theming questions test whether you understand how to structure a real Compose application. Interviewers use architecture pattern questions to see if you've thought beyond ViewModel and explored patterns like Presenters that are gaining traction in the Compose ecosystem.

### Core Questions

#### Q1: What are the core components of Navigation Compose?

Navigation Compose has three core pieces:

- **NavController** — manages the back stack and handles navigation between destinations. Created using `rememberNavController()`.
- **NavHost** — a composable container that displays the current destination based on the NavController's back stack.
- **NavBackStackEntry** — represents a single entry on the back stack. It holds the destination, arguments, lifecycle, and ViewModel store for that screen.

```kotlin
val navController = rememberNavController()

NavHost(navController = navController, startDestination = Home) {
    composable<Home> {
        HomeScreen(onNavigateToProfile = { userId ->
            navController.navigate(Profile(id = userId))
        })
    }
    composable<Profile> { backStackEntry ->
        val profile = backStackEntry.toRoute<Profile>()
        ProfileScreen(userId = profile.id)
    }
}
```

Each `NavBackStackEntry` has its own lifecycle and `ViewModelStoreOwner`, which means ViewModels scoped to a destination are created when the destination enters the back stack and cleared when it's removed.

#### Q2: How does type-safe navigation work in Navigation Compose?

Since Navigation 2.8, you define destinations using Kotlin serializable classes or objects instead of string routes. Each destination is a `@Serializable` class where properties become the navigation arguments.

```kotlin
@Serializable
object Home

@Serializable
data class Profile(val id: String)

@Serializable
data class Settings(val darkMode: Boolean = false)
```

You navigate using the class directly: `navController.navigate(Profile(id = "user123"))`. On the receiving end, you extract arguments with `backStackEntry.toRoute<Profile>()`. This eliminates string-based route matching and gives you compile-time type safety for arguments. It also works with `SavedStateHandle.toRoute<T>()` in ViewModels.

#### Q3: What is Material3 theming in Compose?

Material3 theming is built around three subsystems: `ColorScheme`, `Typography`, and `Shapes`. The `MaterialTheme` composable provides these to the entire composition tree using `CompositionLocal` internally.

```kotlin
MaterialTheme(
    colorScheme = lightColorScheme(
        primary = Color(0xFF1A73E8),
        onPrimary = Color.White,
        primaryContainer = Color(0xFFD2E3FC)
    ),
    typography = Typography(
        headlineLarge = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Bold,
            fontSize = 32.sp
        )
    ),
    shapes = Shapes(
        medium = RoundedCornerShape(12.dp)
    )
) {
    // App content
}
```

You access theme values anywhere in the tree via `MaterialTheme.colorScheme`, `MaterialTheme.typography`, and `MaterialTheme.shapes`. Under the hood, these are three `CompositionLocal` instances: `LocalColorScheme`, `LocalTypography`, and `LocalShapes`.

#### Q4: How does dynamic color work in Material3?

Dynamic color is part of Material You and is available on Android 12+. The system extracts colors from the user's wallpaper and generates a color scheme that apps can use. In Compose, you create a dynamic `ColorScheme` with `dynamicLightColorScheme(context)` or `dynamicDarkColorScheme(context)`.

```kotlin
val colorScheme = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && darkTheme ->
        dynamicDarkColorScheme(LocalContext.current)
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !darkTheme ->
        dynamicLightColorScheme(LocalContext.current)
    darkTheme -> DarkColorScheme
    else -> LightColorScheme
}

MaterialTheme(colorScheme = colorScheme) {
    // App content adapts to wallpaper colors on Android 12+
}
```

Always provide a fallback `ColorScheme` for devices running below Android 12 where dynamic color isn't available.

#### Q5: What is CompositionLocal and when should you use it?

`CompositionLocal` is a mechanism for passing data implicitly down the composition tree without explicitly threading it through every composable's parameters. It's how `MaterialTheme` provides colors, typography, and shapes to all composables without each one needing a theme parameter.

There are two ways to create one:

- `compositionLocalOf` — tracks reads and only recomposes composables that actually read the value when it changes.
- `staticCompositionLocalOf` — doesn't track reads. When the value changes, the entire `content` lambda provided to `CompositionLocalProvider` recomposes. Use this when the value rarely or never changes, like a system context.

If you want to pass data down to composables implicitly, you should consider using `CompositionLocalProvider`. This is useful for providing dimensions or spacing values to composable UI elements without passing them through every function parameter.

#### Q6: How do you create and provide a custom CompositionLocal?

Define a `CompositionLocal` with a default value, then provide it using `CompositionLocalProvider` with the `provides` infix function.

```kotlin
data class AppSpacing(
    val small: Dp = 4.dp,
    val medium: Dp = 8.dp,
    val large: Dp = 16.dp
)

val LocalSpacing = compositionLocalOf { AppSpacing() }

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalSpacing provides AppSpacing(
            small = 4.dp,
            medium = 12.dp,
            large = 24.dp
        )
    ) {
        MaterialTheme(content = content)
    }
}

// Access anywhere in the tree
@Composable
fun ProfileCard() {
    val spacing = LocalSpacing.current
    Column(modifier = Modifier.padding(spacing.large)) {
        Text("Username", modifier = Modifier.padding(bottom = spacing.small))
    }
}
```

Don't overuse `CompositionLocal` — it makes dependencies implicit and harder to trace. Use it for truly cross-cutting concerns like theming, spacing, or platform context. Don't use it to pass a ViewModel or screen-specific state down the tree.

#### Q7: How do you handle deep links in Navigation Compose?

You define deep links in the `composable` function's `deepLinks` parameter using `navDeepLink`. Each deep link associates a URI pattern, action, or MIME type with a destination.

```kotlin
@Serializable
data class Profile(val id: String)

composable<Profile>(
    deepLinks = listOf(
        navDeepLink<Profile>(basePath = "https://myapp.com/profile")
    )
) { backStackEntry ->
    val profile = backStackEntry.toRoute<Profile>()
    ProfileScreen(userId = profile.id)
}
```

For external apps to trigger these deep links, you must also declare an `<intent-filter>` in `AndroidManifest.xml` with the matching scheme and host. Deep links can also be used internally to build a `PendingIntent` for notifications that open a specific destination.

#### Q8: What is the difference between ViewModel and the Presenter pattern in Compose?

ViewModel is lifecycle-aware and survives configuration changes. It holds business logic and exposes state via `StateFlow` or Compose state. The Presenter pattern (used by libraries like Circuit and Molecule) takes a different approach — the presenter is a composable function itself that uses the Compose runtime to manage state.

With ViewModel, state flows from the ViewModel to the UI through observation. With Molecule, the presenter runs composable code in a coroutine and produces a `StateFlow` that the UI collects. With Circuit, the presenter is a `@Composable` function that directly returns the UI state.

The key difference is that presenters written with the Compose runtime can use `remember`, `LaunchedEffect`, and other Compose primitives for state management. This makes the code cleaner because the state management logic reads like a linear flow instead of being spread across callback handlers and flow operators.

### Deep Dive Questions

#### Q9: How does NavBackStackEntry manage lifecycle and ViewModel scoping?

Each `NavBackStackEntry` implements `LifecycleOwner`, `ViewModelStoreOwner`, and `SavedStateRegistryOwner`. When you navigate to a destination, a new `NavBackStackEntry` is created with its own lifecycle that starts at `CREATED`. When it becomes the visible destination, it moves to `RESUMED`. When another destination is pushed on top, it goes back to `STARTED` (still in the back stack but not visible).

ViewModels obtained within a destination are scoped to that `NavBackStackEntry`. They survive configuration changes because the `NavBackStackEntry`'s `ViewModelStore` is retained. When the destination is popped from the back stack, the `NavBackStackEntry`'s lifecycle moves to `DESTROYED` and all its ViewModels are cleared. This is why you should never hold references to a `NavBackStackEntry` beyond its lifecycle.

#### Q10: What is Navigation 3 and how is it different from Navigation Compose?

Navigation 3 is a new navigation library built from the ground up for Compose. The fundamental difference is that you own the back stack. Instead of the library managing the back stack internally, you create a list of keys and manage it yourself. You push items onto the list to navigate forward and remove them to go back.

The library provides `NavDisplay`, which observes your back stack list and renders the appropriate content with transitions. Each key maps to content through a resolution function you provide. Navigation 3 also supports adaptive layouts natively — it can read multiple destinations from the back stack at the same time, which is essential for list-detail layouts on tablets and foldables.

Navigation 3 is designed to be simpler and more transparent than the original Navigation Compose. There's no hidden state in a `NavController` — everything is in your list. The tradeoff is that you're responsible for back stack management yourself, including handling system back.

#### Q11: How do you scope a ViewModel to a navigation graph instead of a single destination?

Sometimes you need to share a ViewModel across multiple destinations — like a checkout flow where the cart, shipping, and payment screens share state. You can scope a ViewModel to a parent navigation graph by using the parent's `NavBackStackEntry` as the `ViewModelStoreOwner`.

```kotlin
composable<PaymentScreen> { backStackEntry ->
    val checkoutEntry = remember(backStackEntry) {
        navController.getBackStackEntry<CheckoutGraph>()
    }
    val checkoutViewModel: CheckoutViewModel = viewModel(checkoutEntry)
    PaymentScreen(viewModel = checkoutViewModel)
}
```

The ViewModel lives as long as the navigation graph is on the back stack. When the user leaves the entire checkout flow, the graph's `NavBackStackEntry` is destroyed and the ViewModel is cleared. This avoids the anti-pattern of putting shared state in an Activity-scoped ViewModel.

#### Q12: Explain the Molecule library and how it uses the Compose runtime for presenters.

Molecule by Cash App runs the Compose runtime in a coroutine and produces a `StateFlow` of UI state. You write a `@Composable` function that returns your state model, and Molecule handles recomposition and emission.

```kotlin
@Composable
fun ProfilePresenter(
    userId: String,
    userRepository: UserRepository
): ProfileUiState {
    var user by remember { mutableStateOf<User?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(userId) {
        isLoading = true
        user = userRepository.getUser(userId)
        isLoading = false
    }

    return when {
        isLoading -> ProfileUiState.Loading
        user != null -> ProfileUiState.Success(user!!)
        else -> ProfileUiState.Error
    }
}
```

The Compose runtime handles `remember`, `LaunchedEffect`, and state changes exactly like it does in UI composables, but without any UI rendering. The presenter simply computes state. Molecule bridges this to the ViewModel world by emitting each recomposition result as a `StateFlow` value. Testing is straightforward with Turbine because you're just testing flow emissions.

#### Q13: What is the Circuit architecture pattern?

Circuit by Slack combines the Presenter pattern with a rendering system. A Circuit screen consists of three pieces: a `Screen` key that identifies the destination, a `Presenter` composable that produces UI state, and a `Ui` composable that renders it. The `Presenter` is a composable function that returns a state model, and the `Ui` receives that state.

Circuit handles navigation through its own `Navigator` and `Screen` system. The presenter produces state, the UI renders it, and user events flow back to the presenter. The entire pattern enforces unidirectional data flow and makes screens independently testable — you can test the presenter by checking state outputs and the UI by providing fake state inputs.

The main advantage over ViewModel is that Circuit presenters are composable functions, so they naturally compose together. You can call one presenter from another without the DI gymnastics that ViewModels require.

#### Q14: How does MaterialTheme work internally with CompositionLocal?

`MaterialTheme` is a composable that wraps `CompositionLocalProvider` to provide three `CompositionLocal` instances: `LocalColorScheme`, `LocalTypography`, and `LocalShapes`. When you call `MaterialTheme.colorScheme.primary`, it's reading `LocalColorScheme.current.primary`.

Because `LocalColorScheme` is created with `compositionLocalOf` (not `staticCompositionLocalOf`), only composables that actually read a specific color value recompose when that value changes. If you change just the `primary` color, composables that only read `secondary` won't recompose. This is possible because the snapshot system tracks exactly which state is read by each composable.

You can nest `MaterialTheme` calls to override theme values for a subtree. The inner theme's values take precedence because `CompositionLocalProvider` sets new values that shadow the outer ones for all descendants.

#### Q15: How would you implement a custom theming system beyond MaterialTheme?

Create your own theme composable with custom `CompositionLocal` values for any design tokens your app needs. This is the pattern used by apps that have design systems beyond what Material provides.

```kotlin
data class AppColors(
    val brandPrimary: Color,
    val brandSecondary: Color,
    val surfaceHighlight: Color
)

val LocalAppColors = staticCompositionLocalOf {
    AppColors(
        brandPrimary = Color.Blue,
        brandSecondary = Color.Gray,
        surfaceHighlight = Color.Yellow
    )
}

object AppTheme {
    val colors: AppColors
        @Composable get() = LocalAppColors.current
}

@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) darkAppColors else lightAppColors
    CompositionLocalProvider(LocalAppColors provides colors) {
        MaterialTheme(content = content)
    }
}
```

Use `staticCompositionLocalOf` for theme values because they rarely change after initialization. The `AppTheme.colors` accessor object provides a clean API that mirrors `MaterialTheme.colorScheme`.

#### Q16: What are the tradeoffs of ViewModel vs Presenters in a Compose app?

**ViewModel advantages:**

- First-party AndroidX support with deep framework integration.
- Survives configuration changes automatically via `ViewModelStore`.
- Works with `SavedStateHandle` for process death restoration.
- The entire Android ecosystem (Hilt, Navigation) is built around it.

**Presenter advantages:**

- Uses Compose runtime primitives, making state management code more linear and readable.
- Easier to compose — one presenter can call another without DI complexity.
- More testable — pure functions that take inputs and return state, no framework dependencies.
- Better separation — no dependency on Android framework classes.

The tradeoff is ecosystem maturity. ViewModels work everywhere and every Android developer knows them. Presenters (Circuit/Molecule) require adopting additional libraries and patterns. For most production apps, ViewModel is still the pragmatic choice. Presenters are worth exploring if you're building a new app and your team is comfortable with the Compose runtime beyond UI.

#### Q17: How do you handle navigation events and avoid duplicate navigation?

A common bug is navigating twice when the user double-taps a button. In Navigation Compose, you can use `navController.currentBackStackEntry` to check the current destination before navigating. The `navigate` function also accepts `NavOptions` for controlling behavior:

```kotlin
fun NavController.navigateOnce(route: Any) {
    val currentRoute = currentBackStackEntry?.destination?.route
    if (currentRoute != route::class.qualifiedName) {
        navigate(route) {
            launchSingleTop = true
        }
    }
}
```

`launchSingleTop = true` prevents creating a new instance if the destination is already at the top of the back stack. For bottom navigation tabs, combine `launchSingleTop` with `popUpTo` and `saveState`/`restoreState` to avoid building up a deep stack while preserving each tab's state.

The key principle is that navigation events should be one-shot. Don't store navigation destinations in `StateFlow` — use `Channel` or handle them directly in event callbacks. Storing them as state means they'll trigger navigation again on recomposition.

#### Q18: How does nested navigation work and when should you use it?

Nested navigation groups related destinations into a sub-graph. This is useful for flows like onboarding or checkout that have their own internal navigation but should be treated as a single unit from the parent graph's perspective.

You define nested graphs using the `navigation` function inside `NavHost`:

```kotlin
NavHost(navController, startDestination = Home) {
    composable<Home> { HomeScreen() }
    navigation<CheckoutGraph>(startDestination = Cart) {
        composable<Cart> { CartScreen() }
        composable<Shipping> { ShippingScreen() }
        composable<Payment> { PaymentScreen() }
    }
}
```

ViewModels scoped to the nested graph are shared across all destinations within it. When the user navigates out of the entire nested graph, all its destinations are removed and scoped ViewModels are cleared. This is the clean way to share state across a multi-step flow without leaking it to the rest of the app.

### Common Follow-ups

- How do you pass complex objects between navigation destinations? (Don't — pass an ID and load the object from the data layer. Complex objects risk data loss during config changes and can exceed the transaction size limit)
- What is the `popUpTo` parameter in navigation and when would you use it? (Pops destinations off the back stack up to a specified destination. Used in bottom nav to avoid building deep stacks)
- How do you handle the system back button in Navigation Compose? (NavController handles it automatically. For custom back behavior, use `BackHandler` composable to intercept)
- Can you use CompositionLocal to provide a ViewModel? (You can, but you shouldn't. It makes testing harder and couples composables to specific ViewModels. Pass state and events explicitly instead)
- What happens to a destination's state when it's in the back stack but not visible? (Its lifecycle moves to STARTED, ViewModels stay alive, but composable UI is disposed. State survives because it's in the ViewModel, not the composition)
- How do you test navigation logic? (Use `TestNavHostController` with `ComposeTestRule`. Navigate using UI interactions, then assert the current destination using `navController.currentBackStackEntry`)
- What is the difference between compositionLocalOf and staticCompositionLocalOf? (compositionLocalOf tracks reads and recomposes only readers. staticCompositionLocalOf recomposes the entire content lambda — more efficient when the value never changes)
