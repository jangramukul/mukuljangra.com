---
title: "Navigation, Theming & Architecture Patterns"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 21
sequence: 21
description: "Navigation and theming questions test whether you understand how to structure a real Compose application."
---

## Navigation, Theming & Architecture Patterns

Navigation and theming questions test whether you understand how to structure a real Compose application. Interviewers want to see that you can wire up navigation, build a theming system, and use patterns like CompositionLocal correctly.

#### What are the core components of Navigation Compose?

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

Each `NavBackStackEntry` has its own lifecycle and `ViewModelStoreOwner`, so ViewModels scoped to a destination are created when it enters the back stack and cleared when it's removed.

#### How does type-safe navigation work in Navigation Compose?

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

#### How do you pass arguments between navigation destinations?

With type-safe navigation, arguments are just properties on your `@Serializable` route class. Primitive types like `String`, `Int`, `Boolean`, `Float`, and `Long` are supported directly. You can also use enums and nullable types.

```kotlin
@Serializable
data class ProductDetail(val productId: String, val source: String = "home")

// Navigate with arguments
navController.navigate(ProductDetail(productId = "abc123", source = "search"))

// Read arguments in the destination
composable<ProductDetail> { backStackEntry ->
    val route = backStackEntry.toRoute<ProductDetail>()
    ProductDetailScreen(productId = route.productId)
}
```

Don't pass complex objects as navigation arguments. Pass an ID and load the object from the data layer in the destination. Complex objects risk exceeding the transaction size limit and can cause data loss during config changes.

#### What is popUpTo and how does back stack management work?

`popUpTo` removes destinations from the back stack up to a specified destination before navigating. It's how you prevent the back stack from growing endlessly, especially in flows like login or bottom navigation.

```kotlin
navController.navigate(Home) {
    popUpTo(Login) { inclusive = true }
}
```

This navigates to Home and pops everything up to and including Login. The `inclusive = true` flag removes the Login destination itself. Without it, Login stays on the stack.

For bottom navigation, you typically combine `popUpTo` with `saveState` and `restoreState` to avoid building deep stacks while preserving each tab's state:

```kotlin
navController.navigate(tab) {
    popUpTo(navController.graph.findStartDestination().id) {
        saveState = true
    }
    launchSingleTop = true
    restoreState = true
}
```

#### What is Material3 theming in Compose?

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

#### How do you handle dark theme and light theme switching?

Use `isSystemInDarkTheme()` to detect the system setting, then pass the appropriate `ColorScheme` to `MaterialTheme`. Define separate light and dark color schemes and switch between them.

```kotlin
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(colorScheme = colorScheme, content = content)
}
```

If you want to let the user override the system setting, store their preference in DataStore and read it as state. Pass that value instead of `isSystemInDarkTheme()`. The entire UI recomposes with the new color scheme because `MaterialTheme` provides it through `CompositionLocal`.

#### How does dynamic color work in Material3?

Dynamic color is part of Material You and is available on Android 12+. The system extracts colors from the user's wallpaper and generates a color scheme that apps can use.

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

#### What is CompositionLocal and when should you use it?

`CompositionLocal` is a way to pass data implicitly down the composition tree without threading it through every composable's parameters. It's how `MaterialTheme` provides colors, typography, and shapes to all composables without each one needing a theme parameter.

There are two ways to create one:

- `compositionLocalOf` — tracks reads and only recomposes composables that actually read the value when it changes.
- `staticCompositionLocalOf` — doesn't track reads. When the value changes, the entire `content` lambda provided to `CompositionLocalProvider` recomposes. Use this when the value rarely or never changes.

Use `CompositionLocal` for truly cross-cutting concerns like theming, spacing, or platform context. Don't use it for screen-specific state or to pass a ViewModel down the tree — that makes dependencies implicit and harder to trace.

#### What is the difference between compositionLocalOf and staticCompositionLocalOf?

`compositionLocalOf` tracks which composables read the value. When the value changes, only those composables recompose. This is fine for values that change occasionally, like a color scheme that the user can toggle.

`staticCompositionLocalOf` doesn't track reads. When the value changes, the entire subtree inside `CompositionLocalProvider` recomposes. This sounds worse, but it's actually more efficient when the value never changes because it skips the overhead of tracking readers. Use it for things like a `Context`, `LayoutDirection`, or app configuration that are set once at startup.

If you're unsure, `staticCompositionLocalOf` is the safer default for values that don't change. Use `compositionLocalOf` only when you expect the value to change and want fine-grained recomposition.

#### How do you create and provide a custom CompositionLocal?

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

Don't overuse `CompositionLocal`. It makes dependencies implicit and harder to trace. Reserve it for cross-cutting concerns like theming, spacing, or platform context.

#### How do you handle navigation events and avoid duplicate navigation?

A common bug is navigating twice when the user double-taps a button. The simplest fix is `launchSingleTop = true`, which prevents creating a new instance if the destination is already at the top of the back stack.

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

Navigation events should be one-shot. Don't store navigation destinations in `StateFlow` — use `Channel` or handle them directly in event callbacks. Storing them as state means they'll trigger navigation again on recomposition.

#### How do you implement bottom navigation with Navigation Compose?

Each bottom tab maps to a top-level destination. You use a `NavigationBar` with `NavigationBarItem` and navigate using `popUpTo` to keep the back stack clean.

```kotlin
@Composable
fun MainScreen(navController: NavHostController) {
    Scaffold(
        bottomBar = {
            NavigationBar {
                val currentDestination = navController
                    .currentBackStackEntryAsState().value?.destination

                bottomTabs.forEach { tab ->
                    NavigationBarItem(
                        selected = currentDestination?.route == tab.route,
                        onClick = {
                            navController.navigate(tab.destination) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(navController, startDestination = Home, Modifier.padding(padding)) {
            composable<Home> { HomeScreen() }
            composable<Search> { SearchScreen() }
            composable<Profile> { ProfileScreen() }
        }
    }
}
```

The `saveState`/`restoreState` combination preserves each tab's scroll position and nested back stack when switching tabs. Without it, every tab switch resets the tab's state.

#### How do you handle deep links in Navigation Compose?

You define deep links in the `composable` function's `deepLinks` parameter using `navDeepLink`. Each deep link associates a URI pattern with a destination.

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

#### How does nested navigation work and when should you use it?

Nested navigation groups related destinations into a sub-graph. This is useful for flows like onboarding or checkout that have their own internal navigation but should be treated as a single unit from the parent graph's perspective.

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

#### How does NavBackStackEntry manage lifecycle and ViewModel scoping?

Each `NavBackStackEntry` implements `LifecycleOwner`, `ViewModelStoreOwner`, and `SavedStateRegistryOwner`. When you navigate to a destination, a new `NavBackStackEntry` is created with its lifecycle starting at `CREATED`. When it becomes visible, it moves to `RESUMED`. When another destination is pushed on top, it goes back to `STARTED`.

ViewModels obtained within a destination are scoped to that `NavBackStackEntry`. They survive configuration changes because the `NavBackStackEntry`'s `ViewModelStore` is retained. When the destination is popped from the back stack, the lifecycle moves to `DESTROYED` and all its ViewModels are cleared. Never hold references to a `NavBackStackEntry` beyond its lifecycle.

#### How do you scope a ViewModel to a navigation graph instead of a single destination?

Sometimes you need to share a ViewModel across multiple destinations — like a checkout flow where the cart, shipping, and payment screens share state. You scope a ViewModel to a parent navigation graph by using the parent's `NavBackStackEntry` as the `ViewModelStoreOwner`.

```kotlin
composable<PaymentScreen> { backStackEntry ->
    val checkoutEntry = remember(backStackEntry) {
        navController.getBackStackEntry<CheckoutGraph>()
    }
    val checkoutViewModel: CheckoutViewModel = viewModel(checkoutEntry)
    PaymentScreen(viewModel = checkoutViewModel)
}
```

The ViewModel lives as long as the navigation graph is on the back stack. When the user leaves the entire checkout flow, the graph's `NavBackStackEntry` is destroyed and the ViewModel is cleared. This avoids putting shared state in an Activity-scoped ViewModel where it would live forever.

#### How does MaterialTheme work internally with CompositionLocal?

`MaterialTheme` is a composable that wraps `CompositionLocalProvider` to provide three `CompositionLocal` instances: `LocalColorScheme`, `LocalTypography`, and `LocalShapes`. When you call `MaterialTheme.colorScheme.primary`, it's reading `LocalColorScheme.current.primary`.

Because `LocalColorScheme` is created with `compositionLocalOf`, only composables that actually read a specific color value recompose when that value changes. If you change just the `primary` color, composables that only read `secondary` won't recompose. The snapshot system tracks exactly which state is read by each composable.

You can nest `MaterialTheme` calls to override theme values for a subtree. The inner theme's values take precedence because `CompositionLocalProvider` sets new values that shadow the outer ones for all descendants.

#### How would you implement a custom theming system beyond MaterialTheme?

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

Use `staticCompositionLocalOf` for theme values because they rarely change after initialization. The `AppTheme.colors` accessor mirrors `MaterialTheme.colorScheme` so it feels familiar to anyone using the API.

#### What are the tradeoffs of ViewModel vs the Presenter pattern?

**ViewModel** is the standard choice for most Android apps. It survives configuration changes via `ViewModelStore`, works with `SavedStateHandle` for process death, and the entire ecosystem — Hilt, Navigation, lifecycle — is built around it. Every Android developer knows ViewModels.

**Presenters** take a different approach. Instead of a class with StateFlow, the presenter is a composable function that uses the Compose runtime to manage state. It can use `remember`, `LaunchedEffect`, and other Compose primitives directly. The state management code reads more linearly because it's not spread across callback handlers and flow operators. Presenters are also easier to test since they're closer to pure functions.

The tradeoff is ecosystem support. ViewModel works everywhere out of the box. Presenters require additional setup and your team needs to be comfortable using the Compose runtime beyond UI. For most production apps, ViewModel is the pragmatic choice.

#### What is Navigation 3 and how is it different from Navigation Compose?

Navigation 3 is a new navigation library built from the ground up for Compose. The core difference is that you own the back stack. Instead of the library managing it internally through `NavController`, you create a `SnapshotStateList` of keys and manage it yourself.

The library provides `NavDisplay`, which observes your list and renders the appropriate content with transitions. Each key maps to content through a resolution function you provide. Navigation 3 also supports adaptive layouts natively — it can read multiple destinations from the back stack at the same time, which is useful for list-detail layouts on tablets and foldables.

There's no hidden state in a `NavController` — everything is in your list. The tradeoff is that you're responsible for back stack management yourself, including handling system back.

### Common Follow-ups

- How do you pass complex objects between navigation destinations? (Don't — pass an ID and load the object from the data layer. Complex objects can exceed the transaction size limit and risk data loss during config changes)
- How do you handle the system back button in Navigation Compose? (NavController handles it automatically. For custom back behavior, use the `BackHandler` composable to intercept)
- Can you use CompositionLocal to provide a ViewModel? (You can, but you shouldn't. It makes testing harder and couples composables to specific ViewModels. Pass state and events explicitly instead)
- What happens to a destination's state when it's in the back stack but not visible? (Its lifecycle moves to STARTED, ViewModels stay alive, but the composable UI is disposed. State survives because it's in the ViewModel, not the composition)
- How do you test navigation logic? (Use `TestNavHostController` with `ComposeTestRule`. Navigate using UI interactions, then assert the current destination using `navController.currentBackStackEntry`)
- How do you animate transitions between navigation destinations? (Use the `enterTransition` and `exitTransition` parameters on `composable`. You can specify `fadeIn`, `slideIn`, `scaleIn` and their exit counterparts)
- What happens if you call navigate() during composition? (It causes a side effect during composition, which is not allowed. Navigate in response to user events via callbacks, or use `LaunchedEffect` if navigating based on state changes)
