---
title: Compose Navigation Guide
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Architecture
---

Navigation in Compose has been my single biggest source of frustration in the Jetpack ecosystem. Not because the API is bad — `NavHost` and `NavController` work fine for simple apps — but because the moment you need type-safe arguments, deep links, nested graphs, and conditional navigation, you hit friction that the View-based Navigation component never had. I spent a full day once debugging why a `Long` argument was silently being truncated to zero. The issue: I'd used `NavType.IntType` instead of `NavType.LongType` in my argument definition. The compiler didn't catch it because route arguments are strings. The app didn't crash — it just silently loaded the wrong data.

That experience crystallized why type-safe navigation matters so much, and why the Navigation team eventually introduced type-safe APIs with Kotlin Serialization support. But even with the latest improvements, Compose navigation has patterns and gotchas that aren't obvious from the documentation. Here's what I've learned from using it in production.

## NavHost and NavController — The Foundation

`NavHost` is the container that swaps composables based on the current route. `NavController` manages the back stack and provides the API for navigating between destinations. The basic setup is straightforward:

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
            CartScreen(
                onCheckout = { navController.navigate("checkout") }
            )
        }
    }
}
```

There are two things I want to highlight here. First, the screens receive navigation callbacks (`onProductClick`, `onCartClick`) instead of receiving the `NavController` directly. This keeps screens independent of the navigation framework — they can be previewed, tested, and reused without knowing how navigation works. The `NavController` stays at the `NavHost` level where it belongs.

Second, notice how arguments are encoded in the route string: `"product/$productId"`. This is the string-based approach that every Compose navigation tutorial shows, and it's the source of most navigation bugs. The route is a plain string with no compile-time validation — if you type `"product/${productId}"` but the argument is defined as `"productId"` (no camelCase), or if you use `NavType.IntType` for a `String` parameter, the compiler won't help you. You'll find out at runtime.

## Type-Safe Navigation With Kotlin Serialization

The Navigation library (starting from version 2.8.0) supports type-safe routes using Kotlin Serialization. Instead of string routes with manual argument parsing, you define routes as serializable data classes and the library handles encoding/decoding automatically.

```kotlin
@Serializable
data object Home

@Serializable
data class ProductDetail(val productId: String)

@Serializable
data class OrderConfirmation(val orderId: String, val total: Double)

@Serializable
data object Cart

@Composable
fun TypeSafeShopApp() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Home
    ) {
        composable<Home> {
            HomeScreen(
                onProductClick = { productId ->
                    navController.navigate(ProductDetail(productId))
                }
            )
        }

        composable<ProductDetail> { backStackEntry ->
            val args = backStackEntry.toRoute<ProductDetail>()
            ProductDetailScreen(productId = args.productId)
        }

        composable<Cart> {
            CartScreen(
                onCheckout = { orderId, total ->
                    navController.navigate(OrderConfirmation(orderId, total))
                }
            )
        }

        composable<OrderConfirmation> { backStackEntry ->
            val args = backStackEntry.toRoute<OrderConfirmation>()
            OrderConfirmationScreen(
                orderId = args.orderId,
                total = args.total
            )
        }
    }
}
```

This is a significant improvement. Routes are Kotlin types, not strings. Arguments have actual types — `String`, `Double`, `Int` — that the compiler enforces. If you try to navigate to `ProductDetail(productId = 42)` when `productId` is a `String`, it's a compile error. The `toRoute<T>()` extension function deserializes the back stack entry's arguments into the data class, eliminating the manual `arguments?.getString("key")` pattern.

The serialization approach also handles optional arguments naturally. Just make the property nullable or give it a default value in the data class:

```kotlin
@Serializable
data class SearchResults(
    val query: String,
    val category: String? = null,
    val sortBy: String = "relevance"
)
```

No more fiddling with `navArgument { nullable = true; defaultValue = null }`. The Kotlin type system does the work.

## Nested Navigation Graphs

For apps with distinct feature areas — authentication flow, main content, settings — nested navigation graphs group related destinations together and encapsulate their internal navigation.

```kotlin
@Serializable
data object AuthGraph

@Serializable
data object Login

@Serializable
data object Register

@Serializable
data object ForgotPassword

@Serializable
data object MainGraph

@Composable
fun AppWithNestedGraphs() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = AuthGraph
    ) {
        navigation<AuthGraph>(startDestination = Login) {
            composable<Login> {
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate(MainGraph) {
                            popUpTo(AuthGraph) { inclusive = true }
                        }
                    },
                    onRegisterClick = { navController.navigate(Register) },
                    onForgotPassword = { navController.navigate(ForgotPassword) }
                )
            }
            composable<Register> { RegisterScreen() }
            composable<ForgotPassword> { ForgotPasswordScreen() }
        }

        navigation<MainGraph>(startDestination = Home) {
            composable<Home> { HomeScreen() }
            composable<ProductDetail> { ProductDetailScreen() }
            composable<Cart> { CartScreen() }
        }
    }
}
```

The `popUpTo(AuthGraph) { inclusive = true }` call in the login success handler is critical. It removes the entire auth graph from the back stack, so pressing back from the home screen doesn't navigate back to the login screen. Without this, users who log in and press back would land on the login screen again — a confusing and common bug.

Nested graphs also serve as scoping boundaries for shared ViewModels. If two screens within the same navigation graph need to share state, you can scope a ViewModel to the graph:

```kotlin
composable<ProductDetail> { backStackEntry ->
    val parentEntry = remember(backStackEntry) {
        navController.getBackStackEntry(MainGraph)
    }
    val sharedViewModel: SharedCartViewModel = viewModel(parentEntry)
    ProductDetailScreen(sharedViewModel = sharedViewModel)
}
```

This creates a ViewModel scoped to the `MainGraph` navigation entry, which survives as long as any destination in that graph is on the back stack. It's a clean way to share state between related screens without lifting the ViewModel to the Activity level.

## Deep Links in Navigation

Navigation composables can declare deep links that map URLs to specific destinations. This integrates with the system's deep link handling — when the app receives an intent with a matching URL, Navigation routes to the correct composable automatically.

```kotlin
composable<ProductDetail>(
    deepLinks = listOf(
        navDeepLink<ProductDetail>(
            basePath = "https://www.myshop.com/product"
        )
    )
) { backStackEntry ->
    val args = backStackEntry.toRoute<ProductDetail>()
    ProductDetailScreen(productId = args.productId)
}
```

With type-safe routes, the deep link path segments map to the data class properties. The URL `https://www.myshop.com/product/shoes-123` would populate `ProductDetail(productId = "shoes-123")`. You still need the corresponding intent filter in your `AndroidManifest.xml` for the system to deliver the intent to your app.

## Navigation 3 Preview

It's worth mentioning that the Navigation team has been working on Navigation 3 — a ground-up rethinking of how navigation works in Compose. The key insight behind Navigation 3 is that the current Navigation library was designed for the Fragment-based world and adapted for Compose. Navigation 3 is Compose-native from the start.

The biggest conceptual change is that Navigation 3 gives you direct control over the back stack as a list. Instead of a `NavController` that manages the back stack internally and exposes it through callbacks, you hold a `MutableList` of route objects and render them yourself. The library provides a `NavDisplay` composable that takes your back stack list and renders the top entry, but the back stack itself is just a state list in your ViewModel or composable.

This approach is still in early development — it was announced at I/O 2025 and is available as an alpha artifact. I wouldn't adopt it in production yet. But the direction is clear: less framework magic, more explicit state management. If you're starting a new project today, use the stable Navigation library with type-safe routes. When Navigation 3 stabilizes, the migration path should be relatively straightforward because the type-safe route objects (your `@Serializable` data classes) carry over directly.

## The Reframe: Navigation Is State Management

Here's the insight that improved how I structure navigation: **navigation is just state management with a specific shape.** The back stack is a stack of states. Navigating forward pushes a state. Navigating back pops one. Arguments are state parameters. The `NavController` is a state holder. Once I stopped thinking of navigation as a separate concern and started thinking of it as "the state of which screen the user is on," everything simplified.

This is why the type-safe route approach works so well — routes ARE the state. `ProductDetail(productId = "123")` isn't just a navigation instruction; it's the complete description of what the screen needs. It's serializable, testable, and type-checked. And it's why Navigation 3's direction of exposing the back stack as a list makes sense — it aligns navigation with how Compose handles every other kind of state.

The honest tradeoff with Compose navigation today is ecosystem maturity. The type-safe APIs are relatively new, IDE tooling for nav graph visualization doesn't exist yet for Compose like it did for XML nav graphs, and some edge cases (like result passing between screens) still feel clunky compared to what Fragment-based Navigation offered. But the fundamentals are sound, and the direction is right. Use type-safe routes, keep `NavController` out of your screens, scope ViewModels to navigation graphs, and you'll have a navigation architecture that's clean, testable, and ready for whatever Navigation 3 brings.

Thanks for reading!
