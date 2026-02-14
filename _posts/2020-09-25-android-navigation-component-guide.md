---
title: Android Navigation Component Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
  - Jetpack Compose
---

Before the Navigation component, handling navigation in Android was a choose-your-own-adventure of FragmentTransactions, intent flags, and manual back stack management. I once spent an entire afternoon debugging why pressing back from screen C went to screen A instead of screen B. The cause was a `replace` that should have been an `add`, combined with a `popBackStack` call that popped one entry too many. Every developer on the team had their own mental model of how the back stack worked, and none of them matched.

The Navigation component doesn't eliminate complexity — navigation in mobile apps is inherently complex. But it moves the complexity from imperative code scattered across Activities and Fragments into a declarative navigation graph that you can reason about as a single source of truth. Instead of calling `fragmentManager.beginTransaction().replace().addToBackStack().commit()` and hoping you got the flags right, you define destinations and actions in one place, and the NavController handles the rest.

## NavHost and NavController — The Core Pair

The Navigation component has two central pieces. The **NavHost** is a container that swaps destinations in and out. The **NavController** is the object that drives navigation — it knows the graph, tracks the back stack, and handles destination transitions.

In Compose, the setup is clean:

```kotlin
@Composable
fun AppNavGraph(navController: NavHostController = rememberNavController()) {
    NavHost(
        navController = navController,
        startDestination = "orders"
    ) {
        composable("orders") {
            OrderListScreen(
                onOrderClick = { orderId ->
                    navController.navigate("order_detail/$orderId")
                }
            )
        }

        composable(
            route = "order_detail/{orderId}",
            arguments = listOf(
                navArgument("orderId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: return@composable
            OrderDetailScreen(
                orderId = orderId,
                onBackClick = { navController.popBackStack() }
            )
        }

        composable("settings") {
            SettingsScreen()
        }
    }
}
```

The route strings work like URL paths — `"order_detail/{orderId}"` defines a destination that takes an `orderId` argument. When you call `navController.navigate("order_detail/abc-123")`, the NavController matches the route, extracts the argument, and navigates to the destination. This URL-like pattern might feel odd for mobile developers, but it maps directly to deep linking, which I'll cover later.

The `rememberNavController()` call is important. It creates a NavController that survives recomposition and is tied to the Compose lifecycle. If you create a NavController outside of Compose (in an Activity, for example), you need to be more careful about its lifecycle.

## Safe Args — Type Safety for Navigation Arguments

String-based routes work but they're error-prone. Typo in a route string? Runtime crash. Wrong argument type? Runtime crash. Safe Args was the original solution for Fragment-based navigation, generating type-safe classes from the navigation graph XML.

In Compose, the community has largely moved toward defining route objects manually, since Compose Navigation doesn't use XML graphs. Here's a pattern I use that gives you type safety without a code generation step:

```kotlin
sealed interface AppRoute {
    data object OrderList : AppRoute {
        const val route = "orders"
    }

    data class OrderDetail(val orderId: String) : AppRoute {
        companion object {
            const val route = "order_detail/{orderId}"
            const val argOrderId = "orderId"
        }
    }

    data object Settings : AppRoute {
        const val route = "settings"
    }
}

// Extension for type-safe navigation
fun NavController.navigateToOrderDetail(orderId: String) {
    navigate("order_detail/$orderId")
}

// Usage in NavHost
composable(
    route = AppRoute.OrderDetail.route,
    arguments = listOf(
        navArgument(AppRoute.OrderDetail.argOrderId) {
            type = NavType.StringType
        }
    )
) { backStackEntry ->
    val orderId = backStackEntry.arguments
        ?.getString(AppRoute.OrderDetail.argOrderId) ?: return@composable
    OrderDetailScreen(orderId = orderId)
}
```

This isn't as clean as Safe Args was for Fragments, and I think that's a genuine gap in the Compose Navigation API. The typed route support that was added in later versions of Navigation Compose helps, but the string-based routing is still the most common pattern I see in production codebases. The tradeoff is flexibility vs safety — strings let you do almost anything, but they move errors from compile time to runtime.

## Deep Links — Connecting the Outside World

Deep links are where the URL-based routing model pays off. Because your routes already look like URLs, adding deep link support is straightforward. When the user taps a link like `https://myapp.com/orders/abc-123`, the system can launch your app and navigate directly to the order detail screen.

```kotlin
composable(
    route = "order_detail/{orderId}",
    arguments = listOf(
        navArgument("orderId") { type = NavType.StringType }
    ),
    deepLinks = listOf(
        navDeepLink {
            uriPattern = "https://myapp.com/orders/{orderId}"
        },
        navDeepLink {
            uriPattern = "myapp://orders/{orderId}"
        }
    )
) { backStackEntry ->
    val orderId = backStackEntry.arguments?.getString("orderId") ?: return@composable
    OrderDetailScreen(orderId = orderId)
}
```

Deep links work with both HTTP URLs and custom schemes. The NavController handles parsing the URI, extracting arguments, and building the back stack so that pressing back from a deep-linked destination goes to the right place. It even handles implicit deep links through the `<nav-graph>` in your manifest, so the system knows your app can handle certain URLs without you writing intent filters manually.

The one gotcha I've hit is with deep links and back stack behavior. When a user opens a deep link, the NavController creates a synthetic back stack — it builds the stack as if the user navigated there manually. This means pressing back from `order_detail` goes to `orders` (the start destination), not to the browser or app that launched the deep link. This is usually what you want, but it can surprise users who expect back to return to the launching app. You can control this with `NavDeepLinkBuilder` and the `PendingIntent` you build for notifications.

## Single Activity Architecture

The Navigation component was designed with single-activity architecture in mind. Instead of multiple Activities (one per screen) with Intents connecting them, you have one Activity hosting a NavHost with multiple Composable destinations (or Fragments, if you're not on Compose yet).

The benefits are real. One Activity means one lifecycle to manage, one window configuration, one back stack model. You avoid the complexity of inter-Activity state passing, process death handling across Activities, and Activity transition animations that don't match your design language.

But the tradeoff is real too. A single Activity with 40 destinations means your navigation graph is large and potentially hard to maintain. Navigation Compose helps here with nested navigation graphs — you can group related destinations into sub-graphs that are defined in separate files.

```kotlin
// Main NavHost with nested graphs
NavHost(navController = navController, startDestination = "main") {
    navigation(startDestination = "orders", route = "main") {
        composable("orders") { OrderListScreen(navController) }
        composable("order_detail/{orderId}") { /* ... */ }
    }

    navigation(startDestination = "profile", route = "account") {
        composable("profile") { ProfileScreen(navController) }
        composable("edit_profile") { EditProfileScreen(navController) }
        composable("change_password") { ChangePasswordScreen(navController) }
    }

    navigation(startDestination = "settings_main", route = "settings") {
        composable("settings_main") { SettingsScreen(navController) }
        composable("notifications") { NotificationSettingsScreen(navController) }
        composable("privacy") { PrivacySettingsScreen(navController) }
    }
}
```

Nested graphs are scoped — they have their own start destination and can be navigated to as a unit. This is also how you scope ViewModels to a navigation graph. A ViewModel scoped to the `"account"` graph is shared across all destinations in that graph and cleared when the user navigates away from it.

## Conditional Navigation — Auth Flows and Onboarding

A common real-world pattern is navigation that depends on app state — showing a login screen before the main app, or an onboarding flow on first launch. The Navigation component handles this by letting you set the start destination dynamically or navigate conditionally.

```kotlin
@Composable
fun AppNavGraph(
    isLoggedIn: Boolean,
    hasCompletedOnboarding: Boolean,
    navController: NavHostController = rememberNavController()
) {
    val startDestination = when {
        !hasCompletedOnboarding -> "onboarding"
        !isLoggedIn -> "auth"
        else -> "main"
    }

    NavHost(navController = navController, startDestination = startDestination) {
        navigation(startDestination = "login", route = "auth") {
            composable("login") {
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate("main") {
                            popUpTo("auth") { inclusive = true }
                        }
                    }
                )
            }
            composable("register") { RegisterScreen(navController) }
        }

        navigation(startDestination = "welcome", route = "onboarding") {
            composable("welcome") { WelcomeScreen(navController) }
            composable("setup_profile") {
                SetupProfileScreen(
                    onComplete = {
                        navController.navigate("main") {
                            popUpTo("onboarding") { inclusive = true }
                        }
                    }
                )
            }
        }

        navigation(startDestination = "orders", route = "main") {
            composable("orders") { OrderListScreen(navController) }
            composable("order_detail/{orderId}") { /* ... */ }
        }
    }
}
```

The `popUpTo` with `inclusive = true` is critical here. After login succeeds, you don't want the user to press back and return to the login screen. `popUpTo("auth") { inclusive = true }` clears the entire auth graph from the back stack, so pressing back from the main screen exits the app.

## Navigation Testing

Testing navigation is something most teams skip, but it catches a category of bugs that unit tests and UI tests miss — incorrect back stack behavior, missing argument handling, and broken deep links.

```kotlin
@RunWith(AndroidJUnit4::class)
class NavigationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var navController: TestNavHostController

    @Before
    fun setup() {
        composeTestRule.setContent {
            navController = TestNavHostController(LocalContext.current).apply {
                navigatorProvider.addNavigator(ComposeNavigator())
            }
            AppNavGraph(navController = navController)
        }
    }

    @Test
    fun clickingOrder_navigatesToDetail() {
        composeTestRule.onNodeWithText("Order #123").performClick()

        val currentRoute = navController.currentBackStackEntry?.destination?.route
        assertEquals("order_detail/{orderId}", currentRoute)

        val orderId = navController.currentBackStackEntry
            ?.arguments?.getString("orderId")
        assertEquals("123", orderId)
    }

    @Test
    fun pressBack_fromDetail_returnsToList() {
        navController.navigate("order_detail/123")
        navController.popBackStack()

        assertEquals("orders", navController.currentDestination?.route)
    }
}
```

`TestNavHostController` gives you access to the navigation state without needing to drive the UI. You can verify the current destination, check arguments, and test back stack behavior programmatically. For deep link testing, you can simulate a deep link Intent and verify that the NavController resolved it to the correct destination.

## Multi-Module Navigation

In a multi-module project, you can't define all your routes in one place because feature modules shouldn't know about each other. The pattern I use is defining navigation extension functions in each feature module that register their destinations, and having the app module call all of them when building the NavHost. Each feature module exposes a `fun NavGraphBuilder.featureGraph(navController: NavController)` extension, and the app module composes them together. This keeps feature modules independent while letting the app module own the overall navigation structure.

## Common Navigation Pitfalls

**Navigating from Composable callbacks without checking lifecycle state.** If a user double-taps a list item, both clicks might trigger `navigate()`. The second call tries to navigate from a destination that's no longer current, and you get a crash. The fix is simple — check `currentDestination` before navigating, or use the `launchSingleTop` flag:

```kotlin
fun NavController.navigateSafely(route: String) {
    val currentRoute = currentBackStackEntry?.destination?.route
    if (currentRoute != route) {
        navigate(route) {
            launchSingleTop = true
        }
    }
}
```

**Passing large objects as navigation arguments.** Navigation arguments go through a `Bundle`, which has size limits and serialization overhead. Pass IDs, not objects. Load the full data from your repository or ViewModel on the destination screen. I've seen developers try to pass entire data class instances as JSON-serialized strings in the route — it works until the JSON is too large and the navigation crashes.

**Forgetting `popUpTo` when switching bottom navigation tabs.** Without `popUpTo`, every tab switch adds to the back stack. After switching between three tabs ten times, the user has to press back thirty times to exit the app. Use `popUpTo(startDestinationId)` with `inclusive = false` and `saveState = true` to clear the stack while preserving each tab's state.

The Navigation component is opinionated, and some of its opinions — like synthetic back stacks for deep links and the route-based API — take time to get comfortable with. But the alternative is managing FragmentTransactions, intent flags, and back stack operations manually across your entire app. I'll take the opinionated framework every time. The bugs I used to ship around navigation are exactly the kind of bugs that a framework should prevent, and this one does a good job of it.

Thanks for reading!
