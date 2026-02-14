---
title: "Design an E-Commerce App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 8
sequence: 62
description: "E-commerce app design comes up frequently because it covers the full spectrum of mobile challenges — catalog browsing with heavy image loading,..."
---

## Design an E-Commerce App

E-commerce apps are like the boss fight of mobile system design. They throw every challenge at you — image-heavy catalogs, cart sync that can't lose data, checkout flows where a single bug means someone gets charged twice, and deep linking that has to work even on a cold start. If you can design one of these well, you can design pretty much anything.

#### What are the core functional requirements for an e-commerce app?

Think of it like building a physical store, but digital. You need a catalog to browse (search, filters, categories), product detail pages with images and reviews, a shopping cart, a multi-step checkout (address, payment, confirmation), and order tracking. On top of that — push notifications for order updates and deals, deep linking to products, and auth with session management.

First thing you should do is ask the interviewer: are we designing the buyer side, the seller side, or both? Almost always, it's the buyer experience.

#### What are the key non-functional requirements?

Here's the thing — an e-commerce app lives or dies by how fast it *feels*. The catalog is image-heavy, so image loading has to be fast. Product grids need to scroll at 60fps even on mid-range devices. The app should let users browse recently viewed products offline. Payments must be secure — no raw card data touches the device, ever. PCI-DSS compliance through tokenization, period. Search needs to feel instant with debounced queries and cached results. And the cart has to work offline and sync reliably when connectivity comes back.

#### What is out of scope for a typical interview?

Seller-side features (inventory management, listing creation), the recommendation engine backend, payment gateway internals, and server-side search indexing. Your focus is the client — how the app fetches, caches, and displays products, how the cart stays in sync, and how checkout handles failures gracefully. Call these boundaries out early so the conversation stays focused.

#### How would you structure the client architecture?

Picture a building with four floors. The top floor is the UI — screens for catalog, product detail, cart, checkout, and orders, all observing state from ViewModels. One floor down is the domain layer with use cases like `SearchProductsUseCase`, `AddToCartUseCase`, and `PlaceOrderUseCase`. Below that is the data layer — repository pattern with separate remote (Retrofit) and local (Room) data sources. And the basement is the sync layer, quietly handling cart synchronization and order state updates in the background.

Bottom navigation hosts the top-level destinations: Home, Search, Cart, Orders, and Profile. Each tab maintains its own back stack. The cart badge observes item count from a shared `CartRepository` backed by Room, so it updates from anywhere in the app — add something from the product detail screen, and the badge ticks up immediately.

#### What API endpoints does the client need?

Break it down by domain. For catalog: `GET /products?query=&category=&sort=&cursor=` for paginated search, `GET /products/{id}` for product detail. For cart: `GET /cart`, `POST /cart/items`, `PUT /cart/items/{id}`, `DELETE /cart/items/{id}`. For checkout: `POST /checkout/validate` to verify the cart before payment, `POST /checkout/pay` with the payment token and idempotency key, `GET /orders` and `GET /orders/{id}` for order history and tracking.

Use cursor-based pagination for the catalog. The server returns a page of products plus a `nextCursor` string. Think of it like a bookmark — it tells you exactly where to pick up next. This is way more stable than offset-based pagination when products get added or removed between page loads.

> **🧠 Think about it:** If you're using offset-based pagination and a new product gets inserted at position 5, what happens to the user who just loaded page 1 and is about to load page 2?

#### What are the core data models?

Three central models: `Product`, `CartItem`, and `Order`. Keep Room entities and API DTOs separate — they evolve independently. Your API might add a field tomorrow that your local database doesn't care about, and vice versa.

```kotlin
data class Product(
    val id: String,
    val title: String,
    val price: Double,
    val imageUrls: List<String>,
    val category: String,
    val rating: Float,
    val reviewCount: Int,
    val inStock: Boolean
)

data class CartItem(
    val productId: String,
    val title: String,
    val price: Double,
    val quantity: Int,
    val imageUrl: String
)

data class Order(
    val id: String,
    val items: List<CartItem>,
    val total: Double,
    val status: OrderStatus,
    val placedAt: Long,
    val trackingNumber: String?
)

enum class OrderStatus {
    PLACED, CONFIRMED, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED
}
```

#### What caching strategy would you use?

Here's where it gets interesting — different parts of the app need completely different caching strategies. It's like a restaurant: the menu (products) can be slightly stale, the bill (cart) has to be exact, and the reservation status (orders) should always be fresh.

- **Products** use stale-while-revalidate — show cached data immediately, refresh in the background
- **Cart** uses local-first with background sync — update Room instantly, push to the server asynchronously
- **Orders** use network-first with local fallback — always try the server first, show cached orders if offline

```kotlin
class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao
) {
    fun getProduct(id: String): Flow<Product> = flow {
        val cached = dao.getProduct(id)
        if (cached != null) emit(cached.toDomain())

        val remote = api.getProduct(id).toDomain()
        dao.upsert(remote.toEntity())
        emit(remote)
    }
}
```

For product images, use Coil's two-level cache — memory for recently viewed images and disk for previously loaded ones. Disk cache persists across app restarts, so products you browsed yesterday load instantly today.

#### How would you handle image loading in a product grid?

Use Coil with size-aware loading. In a product grid, thumbnails get resized to the view dimensions — Coil does this automatically with `size()`. Key the image request to the product ID so cached images survive list item recycling in a `LazyVerticalGrid`. Show a shimmer placeholder while loading. Use `crossfade(true)` for smooth transitions.

For the product detail screen, use a `HorizontalPager` for the image gallery. Load the first image immediately and prefetch the next 1-2 in the background. If the product has 10+ images, keep only 3-5 in memory at a time and lazy-load the rest. Plot twist: you can preload the high-res detail image while the product is still visible in the catalog grid. This makes the transition to the detail screen feel instant — the user thinks the app is lightning fast, but you just started early.

#### How would you design search with filters and sorting?

Debounce the search input by 300ms before hitting the API. Show recent search history from DataStore and server-returned suggestions as the user types. Cache results for recent queries so pressing back and retyping the same query skips the network entirely.

```kotlin
class CatalogViewModel(
    private val productRepository: ProductRepository
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val products: Flow<PagingData<Product>> = _query
        .debounce(300)
        .flatMapLatest { query ->
            productRepository.getProducts(query, activeFilters)
        }
        .cachedIn(viewModelScope)

    fun onSearchQueryChanged(query: String) {
        _query.value = query
    }
}
```

The server returns available filter options (categories, brands, price ranges) along with result counts for each option. This lets the UI show how many results each filter produces without additional API calls. Send filters as query parameters and re-fetch. Keep filter state in the ViewModel so it survives configuration changes.

#### How would you optimize product listing performance?

Use Paging 3 with cursor-based pagination. Load the first page on screen entry, fetch more as the user scrolls near the bottom. Back the paging with Room through a `RemoteMediator` — this gives you offline support and instant loads on return visits.

For the grid itself, use `LazyVerticalGrid` with stable keys per product ID. This lets Compose skip recomposition for items that haven't changed. Avoid heavy operations in the composable — format prices and compute display strings in the ViewModel, not during composition. Use `contentType` on list items so Compose reuses the correct composable type during scroll, reducing layout overhead.

Image optimization matters most here. Serve thumbnails at the exact grid cell size from a CDN with resize parameters (e.g., `?w=200&h=200`). Downloading a full-resolution image for an 80x80 grid cell is like renting a moving truck to deliver a letter. With Coil's memory cache hit rate above 90% for scrolled-back items, the grid stays at 60fps on most devices.

#### How would you design cart management — local vs server sync?

The cart lives locally in Room as the single source of truth for the UI. When the user adds or removes an item, update Room immediately and sync with the server in the background. This is optimistic UI — the user sees the change instantly without waiting for a network round-trip. It's like writing on a whiteboard and then emailing a photo of it later — the whiteboard is always current.

```kotlin
class CartRepository(
    private val api: CartApi,
    private val dao: CartDao
) {
    suspend fun addItem(product: Product, quantity: Int) {
        val cartItem = CartItem(
            productId = product.id,
            title = product.title,
            price = product.price,
            quantity = quantity,
            imageUrl = product.imageUrls.first()
        )
        dao.insert(cartItem)

        try {
            api.addToCart(product.id, quantity)
        } catch (e: IOException) {
            // Item stays in local cart, retry later
        }
    }

    fun observeCart(): Flow<List<CartItem>> = dao.observeAll()
}
```

If the server rejects the change (item out of stock, price changed), roll back the local state and notify the user. For logged-out users, the cart lives entirely in local storage. On login, merge the local cart with the server cart — if the same item exists in both, take the higher quantity or prompt the user.

> **🧠 Think about it:** When a user logs out, should you keep the local cart or clear it? What if they log into a different account on the same device?

#### How would you design the checkout flow with payment integration?

Model checkout as a state machine with clear transitions: `CART_VALIDATION` → `ADDRESS_SELECTION` → `PAYMENT_PROCESSING` → `ORDER_CONFIRMED`, with `FAILED` reachable from any step. Each step can fail independently. If payment fails, keep the cart and address in place so the user can retry without re-entering everything. Nobody wants to type their address twice.

The client never handles raw card data — that violates PCI-DSS. Use a payment SDK (Stripe, Braintree, or Google Pay). The SDK collects card details in its own secure UI, tokenizes them on the provider's server, and returns a token. Your app only ever sees the token.

```kotlin
sealed class CheckoutState {
    object ValidatingCart : CheckoutState()
    object SelectingAddress : CheckoutState()
    object ProcessingPayment : CheckoutState()
    data class Confirmed(val orderId: String) : CheckoutState()
    data class Failed(val step: String, val message: String) : CheckoutState()
}
```

Validate fields locally before submitting — address completeness, email format, phone number. Show inline errors immediately instead of waiting for a server round-trip.

#### How do you handle idempotency in checkout?

Yeah, this trips up everyone. Idempotency prevents double-charging when the user retries a failed payment. The server generates an idempotency key when the user enters checkout. The client attaches this key to every payment request. Same key twice? Server returns the original response without processing the payment again.

Here's why it matters: the payment might succeed server-side but the response could fail to reach the client due to a network drop. Without an idempotency key, the user taps retry and gets charged twice. With the key, the retry is safe. Think of it like a stamped envelope — the post office won't deliver the same letter twice if it has the same tracking number. Store the key locally until checkout is complete so it survives app restarts.

#### How would you design order tracking with real-time updates?

Model order status as a sealed class where each status maps to a step in a visual progress indicator. Display a timeline view showing each status change with its timestamp.

```kotlin
sealed class OrderStatus(val label: String) {
    object Placed : OrderStatus("Order Placed")
    object Confirmed : OrderStatus("Order Confirmed")
    data class Shipped(val trackingNumber: String) : OrderStatus("Shipped")
    object OutForDelivery : OrderStatus("Out for Delivery")
    object Delivered : OrderStatus("Delivered")
    object Cancelled : OrderStatus("Cancelled")
}
```

The server pushes status updates via FCM data messages. But here's the thing — push notifications can be delayed. So when the user opens the order detail screen, also poll the server every 30 seconds for the latest status as a reliable fallback. For last-mile delivery tracking, open a WebSocket to receive the driver's location and show it on a map. Cache the order list locally so past orders are viewable offline.

#### How would you handle push notifications for deals and delivery updates?

Use FCM data messages for order updates — they get delivered to your `FirebaseMessagingService` even when the app is backgrounded, giving you full control over the notification UI. For promotional deals, notification messages work fine since the system displays them automatically.

Segment notifications using FCM topics: `order_updates_{userId}` for personal order events, `deals_electronics` or `deals_fashion` for category-specific promotions. When the user taps a notification, include the order ID or product ID in the intent extras and deep link to the relevant screen.

Handle notification permissions carefully. On Android 13+, request `POST_NOTIFICATIONS` at the right moment — after the user places their first order or opts into deal alerts, not on first app launch. Ask too early and you get a denial. And you can't easily ask again.

#### How would you implement deep linking to a product page?

Register an intent filter for product URLs like `https://store.example.com/product/{id}`. With Navigation Component, define a deep link in the nav graph that maps the URL pattern to the product detail destination.

```kotlin
composable(
    route = "product/{productId}",
    deepLinks = listOf(navDeepLink {
        uriPattern = "https://store.example.com/product/{productId}"
    })
) { backStackEntry ->
    val productId = backStackEntry.arguments?.getString("productId")
    ProductDetailScreen(productId = productId)
}
```

The product detail screen must be self-contained — it fetches the product by ID without depending on prior navigation state. This is critical because deep links can cold-start the app directly into a product page. There's no catalog screen on the back stack, no ViewModel already holding the product. The screen has to fend for itself. For deferred deep links (user clicks a link but the app isn't installed), Firebase Dynamic Links handles the install-then-navigate flow.

> **🧠 Think about it:** What happens if a user taps a deep link to a product that no longer exists or is out of stock? How should the product detail screen handle that?

#### How would you A/B test product layouts?

Use Firebase Remote Config for experiment assignment. On app startup, fetch the experiment configuration and cache it locally so the UI doesn't flash between variants. Assign users to variants server-side based on a user ID hash for consistent assignment across sessions and devices.

```kotlin
class ExperimentManager(private val remoteConfig: FirebaseRemoteConfig) {

    fun getVariant(experimentName: String): String {
        return remoteConfig.getString(experimentName)
    }
}

// Usage in catalog screen
val layoutVariant = experimentManager.getVariant("product_grid_layout")
if (layoutVariant == "two_column") {
    TwoColumnProductGrid(products)
} else {
    ThreeColumnProductGrid(products)
}
```

Track which variant the user saw alongside conversion events (add-to-cart, purchase) to measure impact. The experiment assignment must happen before the relevant UI renders — if the user sees variant A for a frame and then switches to variant B, the data is corrupted. Cache the variant locally after the first fetch so it never flickers.

#### How would you handle offline catalog browsing?

Use Room as a local cache backed by Paging 3's `RemoteMediator`. On first load, fetch products from the API and write them into Room. On subsequent launches, the UI observes Room directly and shows cached data immediately. The `RemoteMediator` fetches fresh data in the background and writes it into Room, which triggers a UI update through Flow.

For product detail, cache the full product object when the user opens it — recently viewed products are now browsable offline. Set a cache expiry so data older than 24 hours gets refreshed on next network availability. Product images are cached separately through Coil's disk cache, which persists across app restarts. Between Room and Coil, a user who browsed the app on Wi-Fi can keep browsing the same products on the subway without noticing the network change. That's the goal — the user should never think about connectivity.

#### How would you handle security — payment tokenization and certificate pinning?

Never store or transmit raw card data. Payment SDKs (Stripe, Google Pay) handle tokenization — the SDK collects card details in a secure UI, sends them directly to the payment provider, and returns a one-time token. Your app only ever sees the token, which is useless to an attacker without the payment provider's private key. It's like getting a coat check ticket — the ticket is worthless without the coat check counter.

For network security, pin your server's public key using OkHttp's `CertificatePinner`. This prevents man-in-the-middle attacks even if the device's certificate store is compromised.

```kotlin
val client = OkHttpClient.Builder()
    .certificatePinner(
        CertificatePinner.Builder()
            .add("api.store.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .build()
    )
    .build()
```

Store auth tokens in `EncryptedSharedPreferences`. Use OkHttp's `Authenticator` interface for token refresh — it catches 401 responses, calls the refresh endpoint, updates the stored token, and retries the original request automatically. On logout, clear all tokens, cancel pending syncs, and wipe sensitive cached data like order history and payment methods. Keep non-sensitive caches like product data and search history.

### Common Follow-ups

- How would you handle multiple currencies and localization in the product catalog?
- How would you design a product review and rating system on the client side?
- How would you implement a "Recently Viewed" feature that works across sessions?
- How would you handle flash sales with countdown timers and high traffic?
- How would you handle product price and availability changes while the user is browsing?
- How would you design the app to support both phones and tablets with different layouts?
- How would you measure app performance and identify slow screens?
- How would you handle user session management for guest vs authenticated users?
