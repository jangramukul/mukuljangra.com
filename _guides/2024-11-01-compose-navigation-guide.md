---
title: Compose Navigation Guide
layout: post
sequence: 37
categories: post
tags:
  - Android
  - Jetpack Compose
  - Architecture
---

Navigation in Compose has been my single biggest source of frustration in the Jetpack ecosystem. Not because the API is bad — `NavHost` and `NavController` work fine for simple apps — but because the moment you need type-safe arguments, deep links, nested graphs, and conditional navigation, you hit friction that the View-based Navigation component never had. I spent a full day once debugging why a `Long` argument was silently being truncated to zero. The issue: I'd used `NavType.IntType` instead of `NavType.LongType` in my argument definition. The compiler didn't catch it because route arguments are strings. The app didn't crash — it just silently loaded the wrong data.

That experience crystallized why type-safe navigation matters so much, and why the Navigation team eventually introduced type-safe APIs with Kotlin Serialization support. But even with the latest improvements, Compose navigation has patterns and gotchas that aren't obvious from the documentation. Here's what I've learned from using it across multiple production apps — from the basics through back stack management, bottom nav integration, dialog destinations, result passing, and conditional flows.

## NavHost and NavController — Going Deeper

`NavHost` is the container that swaps composables based on the current route. `NavController` manages the back stack and provides the API for navigating between destinations. The basic setup looks straightforward, but there's more happening under the surface than most people realize.

```kotlin
@Composable
fun ShopApp() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = "home"
    ) {
        composable("home") {
            HomeScreen(
                onProductClick = { productId ->
                    navController.navigate("product/$productId")
                },
                onCartClick = {
                    navController.navigate("cart")
                }
            )
        }

        composable(
            route = "product/{productId}",
            arguments = listOf(
                navArgument("productId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val productId = backStackEntry.arguments?.getString("productId") ?: return@composable
            ProductDetailScreen(productId = productId)
        }

        composable("cart") {
            CartScreen(onCheckout = { navController.navigate("checkout") })
        }
    }
}
```

Two things I want to highlight. First, the screens receive navigation callbacks instead of the `NavController` directly. This keeps screens independent of the navigation framework — they can be previewed, tested, and reused without knowing how navigation works. The `NavController` stays at the `NavHost` level where it belongs.

Second, `startDestination` determines what gets composed when the `NavHost` first appears, and it also defines the root of the back stack. Here's the thing most people miss: the `NavHost` recomposes whenever the back stack changes. If you create the `NavController` inside a composable that itself recomposes frequently, you can accidentally reset the entire navigation state. That's why `rememberNavController()` exists — it survives recomposition. But if you're using multiple `NavHosts` (say, one per tab in a bottom nav), each needs its own `NavController`. Sharing a single controller across multiple hosts leads to unpredictable back stack behavior.

### Navigate Options That Matter

The `navigate()` function accepts a builder lambda that controls back stack behavior. These options are where most navigation bugs live:

```kotlin
navController.navigate("product/$productId") {
    launchSingleTop = true
    popUpTo("home") {
        saveState = true
        inclusive = false
    }
    restoreState = true
}
```

**launchSingleTop** prevents duplicate destinations on the back stack. Without it, tapping a button rapidly creates multiple copies of the same screen. **popUpTo** pops everything up to (and optionally including) a destination. The **inclusive** flag controls whether the target destination itself gets removed. **saveState** and **restoreState** work together — they save the state of popped destinations and restore it when navigating back, which is essential for bottom navigation tabs.

One gotcha: `navigateUp()` and `popBackStack()` look similar but behave differently. `navigateUp()` respects the parent graph structure — if the user arrived via deep link and there's no back stack, it navigates to the parent activity. `popBackStack()` strictly pops the back stack and returns `false` if it's empty. In most cases, use `navigateUp()` for toolbar back buttons and `popBackStack()` for programmatic navigation.

## Type-Safe Navigation With Kotlin Serialization

The Navigation library (starting from version 2.8.0) supports type-safe routes using Kotlin Serialization. Instead of string routes with manual argument parsing, you define routes as serializable data classes:

```kotlin
@Serializable data object Home
@Serializable data class ProductDetail(val productId: String)
@Serializable data class OrderConfirmation(val orderId: String, val total: Double)
@Serializable data object Cart

@Composable
fun TypeSafeShopApp() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Home) {
        composable<Home> {
            HomeScreen(
                onProductClick = { id -> navController.navigate(ProductDetail(id)) }
            )
        }
        composable<ProductDetail> { backStackEntry ->
            val args = backStackEntry.toRoute<ProductDetail>()
            ProductDetailScreen(productId = args.productId)
        }
        composable<OrderConfirmation> { backStackEntry ->
            val args = backStackEntry.toRoute<OrderConfirmation>()
            OrderConfirmationScreen(orderId = args.orderId, total = args.total)
        }
    }
}
```

This is a significant improvement. Routes are Kotlin types, not strings. Arguments have real types that the compiler enforces. The `toRoute<T>()` extension deserializes the back stack entry's arguments into the data class, eliminating the `arguments?.getString("key")` pattern entirely.

### Custom Types and Enum Arguments

For enums and custom types, you need a custom `NavType`. The serialization approach handles primitives automatically, but anything beyond that requires you to tell the library how to serialize it. For enums in the string-based approach, you'd write a custom `NavType`:

```kotlin
enum class ProductCategory { ELECTRONICS, CLOTHING, BOOKS }

val ProductCategoryNavType = object : NavType<ProductCategory>(isNullableAllowed = false) {
    override fun get(bundle: Bundle, key: String): ProductCategory =
        bundle.getString(key)?.let { ProductCategory.valueOf(it) } ?: ProductCategory.ELECTRONICS
    override fun parseValue(value: String): ProductCategory =
        ProductCategory.valueOf(value)
    override fun put(bundle: Bundle, key: String, value: ProductCategory) =
        bundle.putString(key, value.name)
    override fun serializeAsValue(value: ProductCategory): String = value.name
}
```

With the Kotlin Serialization approach, enums just work if they're `@Serializable`. For Parcelable arguments, you'd similarly create a custom `NavType` that uses `Bundle.putParcelable()` and `Bundle.getParcelable()`. IMO, the serialization route is almost always cleaner — it handles optional arguments naturally too. Just make the property nullable or give it a default value in the data class, and skip the `navArgument { nullable = true }` ceremony.

## Bottom Navigation With NavHost

This is where navigation gets real. Integrating bottom navigation with `NavHost` requires careful state management so each tab preserves its own back stack. Here's the pattern I use in production:

```kotlin
@Composable
fun MainScreenWithBottomNav() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = currentRoute == "home",
                    onClick = {
                        navController.navigate("home") {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") }
                )
                NavigationBarItem(
                    selected = currentRoute == "search",
                    onClick = {
                        navController.navigate("search") {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                    label = { Text("Search") }
                )
            }
        }
    ) { innerPadding ->
        NavHost(navController, startDestination = "home", Modifier.padding(innerPadding)) {
            composable("home") { HomeScreen() }
            composable("search") { SearchScreen() }
            composable("profile") { ProfileScreen() }
        }
    }
}
```

The magic trio here is `popUpTo` + `saveState` + `restoreState`. When switching tabs, `popUpTo` clears the back stack to the start destination, `saveState = true` saves the state of the tab being left, and `restoreState = true` restores the state of the tab being entered. Without this combination, every tab switch resets the tab's scroll position, form inputs, and nested navigation state. `currentBackStackEntryAsState()` gives you a reactive way to track which destination is active, so the bottom bar highlights the correct tab.

## Dialog Destinations

Most people handle dialogs with `if (showDialog)` boolean state, but Navigation supports `dialog()` destinations that live on the back stack. The advantage: dialogs survive configuration changes automatically, they integrate with deep links, and pressing back dismisses them naturally.

```kotlin
@Serializable data class ConfirmDelete(val itemId: String)

NavHost(navController = navController, startDestination = Home) {
    composable<Home> {
        HomeScreen(
            onDeleteItem = { itemId ->
                navController.navigate(ConfirmDelete(itemId))
            }
        )
    }
    dialog<ConfirmDelete> { backStackEntry ->
        val args = backStackEntry.toRoute<ConfirmDelete>()
        ConfirmDeleteDialog(
            itemId = args.itemId,
            onConfirm = {
                // perform deletion
                navController.popBackStack()
            },
            onDismiss = { navController.popBackStack() }
        )
    }
}
```

Use `dialog()` instead of `composable()` when the destination should overlay the previous screen rather than replace it. I reach for dialog destinations when the dialog needs arguments from the navigation graph or when it should be deep-linkable. For simple confirmation dialogs that don't need any of that, a local boolean state is still simpler.

## Conditional Navigation — Auth and Onboarding Flows

Real apps don't just navigate linearly. You need to gate certain screens behind authentication, show onboarding only on first launch, or redirect deep links through a login screen. The pattern I've found most reliable is checking conditions at the NavHost level and navigating in a `LaunchedEffect`:

```kotlin
@Composable
fun AppNavigation(authState: AuthState, hasCompletedOnboarding: Boolean) {
    val navController = rememberNavController()

    val startDestination = when {
        !hasCompletedOnboarding -> Onboarding
        authState is AuthState.Unauthenticated -> Login
        else -> Home
    }

    LaunchedEffect(authState) {
        if (authState is AuthState.Unauthenticated) {
            navController.navigate(Login) {
                popUpTo(Home) { inclusive = true }
            }
        }
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable<Onboarding> {
            OnboardingScreen(onComplete = {
                navController.navigate(Home) {
                    popUpTo(Onboarding) { inclusive = true }
                }
            })
        }
        composable<Login> { LoginScreen() }
        composable<Home> { HomeScreen() }
    }
}
```

The `LaunchedEffect` on `authState` handles reactive auth changes — if the user's session expires while they're deep in the app, it navigates them back to login and clears the back stack. For deep link + conditional nav, the approach is similar: let the deep link land on the destination, but check auth state in that destination's composable and redirect if needed.

## Result Passing Between Screens

Passing results back from one screen to another is one of the clunkier parts of Compose navigation, but `SavedStateHandle` makes it workable. The pattern uses the **previous** back stack entry's `SavedStateHandle` as a communication channel:

```kotlin
// Screen B sets the result before popping back
composable<AddressSelection> {
    AddressSelectionScreen(
        onAddressSelected = { address ->
            navController.previousBackStackEntry
                ?.savedStateHandle
                ?.set("selected_address", address)
            navController.popBackStack()
        }
    )
}

// Screen A observes the result
composable<Checkout> {
    val savedStateHandle = navController.currentBackStackEntry?.savedStateHandle
    val selectedAddress by savedStateHandle
        ?.getStateFlow<String>("selected_address", "")
        ?.collectAsState() ?: remember { mutableStateOf("") }

    CheckoutScreen(selectedAddress = selectedAddress)
}
```

The key insight is that `previousBackStackEntry` refers to the entry that will become active after `popBackStack()`. So Screen B writes to Screen A's `SavedStateHandle`, then pops itself. Screen A reads the result reactively via `getStateFlow()`. It's not the most elegant API — I wish it felt more like `startActivityForResult` did — but it works reliably and survives process death since `SavedStateHandle` is backed by the saved state registry.

## Back Stack Management Patterns

Understanding `popUpTo` deeply is the difference between navigation that works and navigation that has weird edge cases. Here's the mental model: `popUpTo` removes entries from the back stack from the top down, stopping at (but not removing, unless `inclusive = true`) the specified destination. The most common patterns:

- **Clear back stack after login**: `popUpTo(AuthGraph) { inclusive = true }` — removes the entire auth flow so back doesn't return to login
- **Single-instance tab switching**: `popUpTo(graph.findStartDestination().id) { saveState = true }` + `restoreState = true` — the bottom nav pattern above
- **Reset to root**: `popUpTo(Home) { inclusive = true }` then navigate to `Home` — fully resets the app state

One mistake I see often: using `popUpTo(0)` or `popUpTo(navController.graph.id)` to "clear everything." This works but it's fragile. If your graph structure changes, the behavior changes silently. Be explicit about which destination you're popping to.

## Nested Graphs and Shared ViewModels

For apps with distinct feature areas — authentication, main content, settings — nested navigation graphs group related destinations and encapsulate their internal navigation. But their real power is ViewModel scoping:

```kotlin
navigation<MainGraph>(startDestination = Home) {
    composable<Home> { HomeScreen() }
    composable<ProductDetail> { backStackEntry ->
        val parentEntry = remember(backStackEntry) {
            navController.getBackStackEntry(MainGraph)
        }
        val sharedViewModel: SharedCartViewModel = viewModel(parentEntry)
        ProductDetailScreen(sharedViewModel = sharedViewModel)
    }
    composable<Cart> { backStackEntry ->
        val parentEntry = remember(backStackEntry) {
            navController.getBackStackEntry(MainGraph)
        }
        val sharedViewModel: SharedCartViewModel = viewModel(parentEntry)
        CartScreen(sharedViewModel = sharedViewModel)
    }
}
```

This creates a ViewModel scoped to the `MainGraph` navigation entry, which survives as long as any destination in that graph is on the back stack. Both `ProductDetail` and `Cart` share the same `SharedCartViewModel` instance. It's a clean way to share state between related screens without lifting the ViewModel to the Activity level. When the entire graph gets popped, the ViewModel gets cleared — exactly the lifecycle you want.

## Real-World Navigation Patterns

### Modular Navigation

In multi-module projects, each feature module defines its own navigation graph extension function. The app module composes them together:

```kotlin
// :feature:product module
fun NavGraphBuilder.productNavGraph(navController: NavController) {
    composable<ProductList> { ProductListScreen(navController) }
    composable<ProductDetail> { ProductDetailScreen(navController) }
}

// :feature:cart module
fun NavGraphBuilder.cartNavGraph(navController: NavController) {
    composable<Cart> { CartScreen(navController) }
    composable<Checkout> { CheckoutScreen(navController) }
}

// :app module
NavHost(navController = navController, startDestination = Home) {
    composable<Home> { HomeScreen(navController) }
    productNavGraph(navController)
    cartNavGraph(navController)
}
```

Each module owns its route definitions and screens. The app module doesn't need to know the internal structure of any feature — it just calls the extension function. This scales well. I've worked on apps with 15+ feature modules and this pattern kept navigation manageable.

### Testing Navigation

For testing, create the `NavController` with `TestNavHostController` and assert on the back stack state:

```kotlin
@Test
fun navigateToProductDetail_addsToBackStack() {
    val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
    composeTestRule.setContent {
        navController.navigatorProvider.addNavigator(ComposeNavigator())
        NavHost(navController = navController, startDestination = Home) {
            composable<Home> { HomeScreen(navController) }
            composable<ProductDetail> { ProductDetailScreen() }
        }
    }
    navController.navigate(ProductDetail(productId = "abc-123"))
    val currentRoute = navController.currentBackStackEntry?.toRoute<ProductDetail>()
    assertEquals("abc-123", currentRoute?.productId)
}
```

The key point: test the **navigation behavior** (what route is active, what arguments were passed), not the NavController internals. Your screens should receive callbacks, so test them independently from navigation.

## Navigation Is State Management

Here's the insight that improved how I structure navigation: **navigation is just state management with a specific shape.** The back stack is a stack of states. Navigating forward pushes a state. Navigating back pops one. Arguments are state parameters. The `NavController` is a state holder. Once I stopped thinking of navigation as a separate concern and started thinking of it as "the state of which screen the user is on," everything simplified.

This is why the type-safe route approach works so well — routes ARE the state. `ProductDetail(productId = "123")` isn't just a navigation instruction; it's the complete description of what the screen needs. It's serializable, testable, and type-checked. And it's why Navigation 3's direction of exposing the back stack as a plain list makes sense — it aligns navigation with how Compose handles every other kind of state. Navigation 3, announced at I/O 2025, gives you direct control over the back stack as a `MutableList` of route objects. It's still alpha and not production-ready, but the type-safe route objects you define today will carry over directly.

The honest tradeoff with Compose navigation today is ecosystem maturity. IDE tooling for nav graph visualization doesn't exist yet for Compose like it did for XML nav graphs, and some patterns like result passing still feel clunkier than what Fragments offered. But the fundamentals are sound. Use type-safe routes, keep `NavController` out of your screens, manage back stack state explicitly, and scope ViewModels to navigation graphs — you'll have a navigation architecture that's clean, testable, and ready for whatever comes next.

Thanks for reading!
