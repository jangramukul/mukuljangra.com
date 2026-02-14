---
title: "Design an E-Commerce App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 8
sequence: 67
description: "E-commerce app design comes up frequently because it covers the full spectrum of mobile challenges — catalog browsing with heavy image loading,..."
---

## Design an E-Commerce App (Amazon)

E-commerce app design comes up frequently because it covers the full spectrum of mobile challenges — catalog browsing with heavy image loading, local-remote cart sync, complex checkout flows, and deep linking. Interviewers want to see how you handle data-heavy UIs, offline behavior, and transactional flows on the client.

### Core Questions (Beginner to Intermediate)

#### Q1: What are the major client-side components of an e-commerce app?

The core components are a product catalog (search, browse, filters), a product detail screen (images, description, reviews), a shopping cart, a checkout flow (address, payment, order confirmation), order history and tracking, push notifications (order updates, promotions), and a user profile/settings section. Architecturally, you need a data layer with local caching (Room) and remote APIs (Retrofit), an image loading library (Coil), a search system with debounced queries, and a state management approach for the cart that syncs between local storage and the server.

#### Q2: How would you design the product catalog screen with search, filters, and pagination?

The catalog screen is a paginated list with server-driven data. Use cursor-based pagination — the server returns a page of products plus a cursor to fetch the next page. Load the first page on screen entry, then fetch more as the user scrolls near the bottom. For search, debounce the user's input by 300-500ms before making the API call to avoid hitting the server on every keystroke. Filters (category, price range, rating) are sent as query parameters alongside the search query.

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

Cache the first page of results locally so the user sees content immediately on next app open. Use Paging 3's `RemoteMediator` if you want to back the paging with a local Room database for offline support.

#### Q3: How would you handle product image loading in a catalog grid?

Use Coil (or Glide) with aggressive caching. Set a memory cache for recently viewed images and a disk cache for previously loaded ones. In a grid or list, key the image request to the product ID so cached images survive list item recycling. Resize images to the view size to avoid loading full-resolution images into small thumbnails — Coil does this automatically with `size()`. Show a placeholder color or shimmer while loading. For the product detail screen, preload the high-resolution image when the user is on the catalog screen and the product is visible. Use `crossfade(true)` for smooth transitions from placeholder to loaded image.

#### Q4: How would you design the product detail screen's image gallery?

Use a `ViewPager2` or Compose `HorizontalPager` to let the user swipe through product images. Load the first image immediately and prefetch the next 1-2 images in the background. Add a page indicator (dots or a thumbnail strip) showing the current position. Support pinch-to-zoom on each image — in Compose, use `transformable` modifier with scale and offset state. Cache all gallery images aggressively since the user is likely to swipe back and forth. If the product has 10+ images, consider lazy loading and only keeping 3-5 in memory at a time.

```kotlin
@Composable
fun ProductImageGallery(images: List<String>) {
    val pagerState = rememberPagerState { images.size }
    Column {
        HorizontalPager(state = pagerState) { page ->
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(images[page])
                    .crossfade(true)
                    .build(),
                contentDescription = "Product image ${page + 1}",
                modifier = Modifier.fillMaxWidth().aspectRatio(1f)
            )
        }
        PageIndicator(
            pageCount = images.size,
            currentPage = pagerState.currentPage
        )
    }
}
```

#### Q5: How would you design the shopping cart to work both locally and remotely?

The cart needs to work offline and sync with the server for cross-device consistency. Store the cart locally in Room as the source of truth for the UI. When the user adds or removes an item, update the local database immediately (optimistic update) and then sync with the server in the background. If the server rejects the change (item out of stock, price changed), roll back the local state and notify the user.

For a logged-out user, the cart lives entirely in local storage. On login, merge the local cart with the server-side cart — this merge needs conflict resolution (if the same item exists in both, take the higher quantity, or prompt the user). On logout, decide whether to keep the local cart or clear it.

#### Q6: What is optimistic UI, and how would you apply it to the cart and wishlist?

Optimistic UI means updating the local state immediately on user action without waiting for the server response, then reconciling if the server call fails. When the user taps "Add to Cart," the item appears in the cart instantly. The API call fires in the background. If it succeeds, nothing changes. If it fails, you remove the item and show an error. This makes the app feel responsive even on slow networks. Apply it to add-to-cart, remove-from-cart, wishlist toggling, and quantity updates. The risk is showing stale data briefly if the server rejects the change, but that is a better experience than a loading spinner on every button tap.

#### Q7: How would you implement deep linking to a product page?

Define an intent filter for your product URLs (e.g., `https://store.example.com/product/{id}`). When the system opens this URL, parse the product ID from the intent data and navigate to the product detail screen. With Navigation Component, define a deep link in your nav graph that maps the URL pattern to the product detail destination. Handle the case where the deep link arrives before the app finishes initializing — the product detail screen should be able to fetch the product independently without depending on prior navigation state.

```kotlin
// In nav graph
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

For deferred deep links (user clicks a link but the app isn't installed), Firebase Dynamic Links or branch.io handles the install-then-navigate flow.

#### Q8: How would push notifications work for order tracking and promotions?

Use FCM with data messages for order updates — data messages are processed by your code even when the app is in the background, letting you update the local order state and show a custom notification. For promotions, use notification messages that the system displays automatically. Segment notifications using FCM topics (e.g., `order_updates_<userId>`, `deals_electronics`). When the user taps the notification, include the order ID or product ID in the intent extras and deep link to the relevant screen. Handle notification permissions properly — on Android 13+, request `POST_NOTIFICATIONS` at an appropriate moment (after the user places their first order, not on first launch).

### Deep Dive Questions (Advanced to Expert)

#### Q9: How would you design the checkout flow to handle failures gracefully?

The checkout is a multi-step transaction: validate cart → confirm address → process payment → create order. Each step can fail independently. On the client, model the checkout as a state machine with states like `CART_VALIDATION`, `ADDRESS_SELECTION`, `PAYMENT_PROCESSING`, `ORDER_CONFIRMED`, and `FAILED`. If payment fails, don't lose the cart — keep everything in place and let the user retry. Use idempotency keys for the payment request so that retrying a failed network call doesn't charge the user twice. The server generates an idempotency key when the user enters checkout, and the client sends it with every payment attempt. Show clear error states at each step — "Payment declined" is more helpful than a generic error.

#### Q10: How would you handle payment integration on the client side?

The client never handles raw card data — that violates PCI-DSS. Use a payment SDK (Stripe, Braintree, or Google Pay). The flow is: the payment SDK collects card details in its own secure UI, tokenizes them on the payment provider's server, and returns a token to your app. Your app sends this token to your backend, which completes the charge server-side. For Google Pay, use the `PaymentsClient` API to show the Google Pay sheet, which returns a payment token.

```kotlin
val paymentRequest = PaymentDataRequest.fromJson(
    buildPaymentRequestJson(totalPrice = "29.99", currency = "USD")
)
val task = paymentsClient.loadPaymentData(paymentRequest)
task.addOnCompleteListener { completedTask ->
    if (completedTask.isSuccessful) {
        val paymentData = completedTask.result
        val token = paymentData.toJson() // send to your server
        viewModel.processPayment(token)
    } else {
        showPaymentError()
    }
}
```

Store saved payment methods as tokens on your server, never on the device. Let the user select from saved methods or add a new one at checkout.

#### Q11: How would you build an A/B testing framework for the app?

An A/B testing framework has three parts: experiment assignment, variant delivery, and event tracking. Use Firebase Remote Config or a custom solution. On app startup, fetch the experiment configuration (experiment name, variant, feature flags). Cache the config locally so the UI doesn't flash between variants. Assign the user to a variant on the server side based on user ID hash to ensure consistent assignment across sessions and devices.

On the client, wrap experimental features behind a feature flag check:

```kotlin
class ExperimentManager(private val remoteConfig: FirebaseRemoteConfig) {

    fun getVariant(experimentName: String): String {
        return remoteConfig.getString(experimentName)
    }

    fun isEnabled(featureFlag: String): Boolean {
        return remoteConfig.getBoolean(featureFlag)
    }
}

// Usage
if (experimentManager.getVariant("checkout_flow") == "single_page") {
    SinglePageCheckout()
} else {
    MultiStepCheckout()
}
```

Track which variant the user saw and the conversion events (purchase, add-to-cart) to measure impact. Make sure experiment assignment happens before the relevant UI renders to avoid flickering.

#### Q12: How would you design the product search architecture on the client?

The client sends search queries to the server, which runs them against a search engine (Elasticsearch, Algolia). On the client side, the key concerns are debouncing, search suggestions, and result caching. Debounce input by 300ms. Show recent search history (stored locally in DataStore) and server-returned suggestions as the user types. Cache search results for recent queries so that pressing back and retyping the same query does not trigger another API call.

For filters, the server returns available filter options (categories, brands, price ranges) along with result counts for each option. This lets you show how many results each filter produces without making additional calls. Apply filters as query parameters and re-fetch results. Maintain filter state in the ViewModel so it survives configuration changes.

#### Q13: How would you handle product catalog caching for offline browsing?

Use Room as a local cache with a `RemoteMediator` from Paging 3. On first load, fetch products from the API and store them in Room. On subsequent launches, show the cached data immediately while fetching fresh data in the background (stale-while-revalidate). The Room database serves as the single source of truth — the UI always observes Room, and the network layer writes into Room.

For the product detail screen, cache the full product object (including images URLs, description, reviews) when the user opens it. This way, if they go offline, they can still browse recently viewed products. Set a cache expiry — product data older than 24 hours should be refreshed on next network availability. Cache product images separately through Coil's disk cache, which persists across app restarts.

#### Q14: How would you design order tracking on the client?

Order tracking is a status-driven UI. The server pushes order status updates via push notifications and exposes a polling endpoint. Model order status as a sealed class: `PLACED`, `CONFIRMED`, `SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `RETURNED`. Each status maps to a step in a visual progress indicator. When the order is shipped, the server provides a tracking number and carrier info. Display a timeline view showing each status change with its timestamp.

For real-time tracking (like food delivery), open a WebSocket or poll every 30 seconds while the user is on the tracking screen. Show the delivery partner's location on a map, similar to the ride-sharing pattern. Cache the order list locally so the user can view past orders offline.

#### Q15: How would you handle product price and availability changes while the user is browsing?

Products can go out of stock or change price while the user has the app open. On the catalog screen, this is low-risk — the next page load or pull-to-refresh brings fresh data. On the product detail screen, re-validate the product when the user taps "Add to Cart" — make a lightweight API call that returns current price and stock status. If the price changed, show the updated price before adding. If it is out of stock, show a clear message and offer alternatives.

The most critical moment is checkout. Validate the entire cart server-side before processing payment. If any item changed, return the updated cart with the differences highlighted. Never let a user pay for a stale price — this creates billing disputes and refund overhead.

#### Q16: How would you design the app's navigation architecture for a complex e-commerce app?

Use a single-activity architecture with a bottom navigation bar hosting 4-5 top-level destinations (Home, Search, Cart, Orders, Profile). Each tab maintains its own back stack using Navigation Component's `saveState` and `restoreState`. Product detail screens, checkout flow, and settings live outside the bottom nav tabs as standalone destinations.

The tricky part is the cart. The cart icon in the bottom bar needs a badge showing item count, which means the cart state must be observable globally. Use a shared `CartRepository` backed by Room, and observe the item count as a `Flow` from the activity level to update the badge. Deep links should work regardless of which tab is active — the navigation graph should handle routing to the correct destination even if the app was cold-started.

#### Q17: How would you architect the data layer for an e-commerce app?

Follow the repository pattern with separate data sources. The remote data source wraps Retrofit APIs. The local data source wraps Room DAOs. Each repository decides the caching strategy for its domain — products use stale-while-revalidate, cart uses local-first with background sync, orders use network-first with local cache. DTOs from the API layer map to domain models via mapper functions — never expose API response objects to the UI layer.

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

Use separate Room entities and API DTOs — they evolve independently. The server might add fields that the local DB doesn't need, and the DB might store computed fields that the API doesn't return.

#### Q18: How would you handle user session and authentication in the app?

Store the auth token (JWT or session token) in `EncryptedSharedPreferences` for security. Use an OkHttp interceptor to attach the token to every API request. When the token expires, use a refresh token flow — the interceptor catches 401 responses, calls the refresh endpoint, updates the stored token, and retries the original request. Use `Authenticator` interface in OkHttp for this, not an interceptor, because `Authenticator` handles the retry automatically.

For guest users, assign a device-scoped session ID so the server can associate a cart with the device before login. On login, merge the guest session into the authenticated user's account. Handle token revocation on logout — clear all stored tokens, cancel any pending sync operations, and navigate to the login screen. Clear sensitive cached data (order history, payment methods) but keep non-sensitive data (product cache, search history).

### Common Follow-ups

- How would you handle multiple currencies and localization in the product catalog?
- How would you design a product review and rating system on the client side?
- How would you implement a "Recently Viewed" feature that works across sessions?
- What caching strategy would you use for product recommendations?
- How would you handle flash sales with countdown timers and high concurrency?
- How would you measure app performance and identify slow screens?
- How would you implement a barcode/QR scanner for product lookup?
- How would you design the app to support both phones and tablets with different layouts?
