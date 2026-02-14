---
title: Android Deep Links and App Links Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
---

Deep links are one of those features that sound simple — "tap a URL, open the app" — until you actually implement them. There are three different mechanisms (URI schemes, web links, Android App Links), each with different verification models, different security implications, and different behavior when multiple apps claim the same link. I spent a frustrating week debugging why our deep links worked perfectly during development but failed silently in production. The cause: our Digital Asset Links file had a typo in the SHA-256 fingerprint, which meant Android's link verification failed, and the OS fell back to showing a disambiguation dialog that most users dismissed without reading.

That experience taught me that deep linking isn't just about intent filters. It's about understanding how Android resolves intents, how the `PackageManager` ranks competing handlers, and how to make sure your app wins that decision reliably across every Android version your users are on.

## URI Scheme Deep Links

Custom URI schemes are the oldest form of deep linking on Android. You define a custom protocol like `myapp://` and register an intent filter for it. The structure follows the standard URI format: `scheme://host/path?query`. So `shopify://product/shoes?id=12345` breaks down to scheme `shopify`, host `product`, path `/shoes`, and query parameter `id=12345`.

The `<data>` element in your intent filter is where the real matching logic lives, and the difference between `path`, `pathPrefix`, and `pathPattern` matters more than most people realize. **path** is an exact match — `android:path="/product/details"` only matches that exact path. **pathPrefix** matches anything that starts with the given prefix — `android:pathPrefix="/product"` matches `/product`, `/product/123`, `/product/shoes/red`. **pathPattern** supports wildcards using `.*` — `android:pathPattern="/product/.*/details"` matches `/product/123/details` or `/product/shoes/details`. I default to `pathPrefix` for most cases because it's the most flexible without the regex escaping headaches that `pathPattern` brings (remember, you need to double-escape backslashes in XML).

```kotlin
// AndroidManifest.xml intent filter
// <intent-filter>
//     <action android:name="android.intent.action.VIEW" />
//     <category android:name="android.intent.category.DEFAULT" />
//     <category android:name="android.intent.category.BROWSABLE" />
//     <data android:scheme="shopify"
//           android:host="product"
//           android:pathPrefix="/details" />
// </intent-filter>

class ProductActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent) {
        val uri = intent.data ?: return
        val productId = uri.lastPathSegment ?: return
        val referrer = uri.getQueryParameter("ref")
        loadProduct(productId, referrer)
    }
}
```

Custom URI schemes have a fundamental problem: **any app can claim any custom scheme.** There's no verification, no ownership proof. If another app registers the same `shopify://` scheme, Android shows a disambiguation dialog. Worse, a malicious app could register your scheme and intercept OAuth callbacks — that's the classic attack vector.

When should you actually use custom schemes? Push notification payloads that need to work offline, QR codes for internal tools, and app-to-app communication within your own suite of apps. For anything user-facing on the web, App Links are strictly better.

## Intent Filter Configuration

Here's the thing about intent filters that trips people up — Android uses a combinatorial approach when you have multiple `<data>` elements inside a single `<intent-filter>`. If you declare two hosts and two paths in the same filter, Android matches **any combination** of those hosts and paths, not just the pairs you intended. This is a subtle but important distinction.

Both categories — `DEFAULT` and `BROWSABLE` — are required for deep links to work from the browser. `DEFAULT` is needed because `startActivity()` adds `CATEGORY_DEFAULT` implicitly. `BROWSABLE` is what allows the link to be triggered from a web browser. Drop either one and your deep link silently fails with no crash, no log, nothing. I've seen this cost teams hours of debugging because the link just... doesn't open the app, and there's no obvious error.

```kotlin
// WRONG: Single filter creates unintended combinations
// <intent-filter>
//     <action android:name="android.intent.action.VIEW" />
//     <category android:name="android.intent.category.DEFAULT" />
//     <category android:name="android.intent.category.BROWSABLE" />
//     <data android:scheme="https" android:host="shop.example.com"
//           android:pathPrefix="/product" />
//     <data android:scheme="https" android:host="m.example.com"
//           android:pathPrefix="/cart" />
// </intent-filter>
// This matches shop.example.com/cart AND m.example.com/product too!

// RIGHT: Separate filters for independent URL patterns
// <intent-filter>
//     <action android:name="android.intent.action.VIEW" />
//     <category android:name="android.intent.category.DEFAULT" />
//     <category android:name="android.intent.category.BROWSABLE" />
//     <data android:scheme="https" android:host="shop.example.com"
//           android:pathPrefix="/product" />
// </intent-filter>
// <intent-filter>
//     <action android:name="android.intent.action.VIEW" />
//     <category android:name="android.intent.category.DEFAULT" />
//     <category android:name="android.intent.category.BROWSABLE" />
//     <data android:scheme="https" android:host="m.example.com"
//           android:pathPrefix="/cart" />
// </intent-filter>
```

When multiple apps match the same intent, Android uses specificity to rank them. A filter with a full `scheme + host + path` match beats one with just `scheme + host`. The `android:priority` attribute on intent filters can influence ordering within the same app, but the OS ignores it when comparing across different apps — that's by design to prevent apps from hijacking each other's links.

## App Links With Digital Asset Links

App Links use standard `https://` URLs and add a verification step that proves your app owns the domain. When Android verifies an App Link, it fetches a Digital Asset Links (DAL) JSON file from your domain and checks that the file lists your app's package name and signing certificate. If verification succeeds, your app opens immediately — no disambiguation dialog, no chance for another app to intercept.

The `android:autoVerify="true"` attribute triggers verification at install time (on Android 6.0+). On Android 12+, the behavior changed — verification happens through a centralized Google service instead of the device directly fetching your domain, which improved reliability but added a delay before verification completes.

The DAL file format is straightforward but unforgiving. It must be served at exactly `https://yourdomain.com/.well-known/assetlinks.json`, over HTTPS with a valid certificate, with `Content-Type: application/json`. Here's what a multi-domain setup looks like in practice — say your app handles links from both your main site and a mobile subdomain:

```kotlin
// assetlinks.json for both domains (each domain hosts its own copy)
// [
//   {
//     "relation": ["delegate_permission/common.handle_all_urls"],
//     "target": {
//       "namespace": "android_app",
//       "package_name": "com.myshop.android",
//       "sha256_cert_fingerprints": [
//         "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:...",
//         "A1:B2:C3:D4:E5:F6:07:08:09:0A:0B:0C:0D:0E:0F:10:..."
//       ]
//     }
//   }
// ]
```

Notice the **two** fingerprints in that array. This is critical if you use Google Play App Signing (which you should). You need the fingerprint of your upload key **and** the app signing key that Google manages. You can find both in the Play Console under Setup → App signing. I've seen teams deploy assetlinks.json with only their debug key fingerprint, wonder why verification works on their development device but fails for every real user, and waste days debugging.

For subdomains, each subdomain needs its own `assetlinks.json` file. `www.example.com` and `shop.example.com` are treated as separate domains. There's no wildcard subdomain support — Android won't check the parent domain's DAL file for subdomains. If you have a lot of subdomains, consider using the `include` directive in your DAL file to point to a centralized file, but each subdomain still needs to host its own `assetlinks.json` that includes the reference.

The honest tradeoff with App Links is operational complexity. If your server goes down during a user's app install, verification fails, and the user gets disambiguation dialogs until they reinstall (or until Android 12+'s background re-verification kicks in). CDN caching can also bite you — if you update the fingerprint and your CDN serves stale content, new installs fail verification. I set a 1-hour cache TTL on this specific file.

## Navigation Component Deep Links

Jetpack Navigation supports two flavors of deep links: **implicit** and **explicit**. Implicit deep links are what most people think of — URLs that map to destinations in your nav graph. Explicit deep links are created programmatically with `NavDeepLinkBuilder` and are perfect for notifications and widgets where you need to construct a `PendingIntent` that opens a specific screen.

Implicit deep links are declared in your nav graph, and Navigation handles the intent routing — no manual `intent.data` parsing needed:

```kotlin
@Composable
fun ShopNavGraph(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = "home"
    ) {
        composable(
            route = "product/{productId}",
            deepLinks = listOf(
                navDeepLink {
                    uriPattern = "https://www.myshop.com/product/{productId}"
                    action = Intent.ACTION_VIEW
                }
            ),
            arguments = listOf(
                navArgument("productId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val productId = backStackEntry.arguments
                ?.getString("productId") ?: return@composable
            ProductScreen(productId = productId)
        }
    }
}
```

Navigation extracts `{productId}` automatically and makes it available through `backStackEntry.arguments`. But the real power move is `NavDeepLinkBuilder` for explicit deep links — this is how you build notification intents that land the user on the right screen with a proper back stack:

```kotlin
fun buildOrderNotificationIntent(
    context: Context,
    orderId: String
): PendingIntent {
    return NavDeepLinkBuilder(context)
        .setGraph(R.navigation.shop_nav_graph)
        .setDestination(R.id.orderDetailFragment)
        .setArguments(bundleOf("orderId" to orderId))
        .createPendingIntent()
}
```

This creates a `PendingIntent` that opens `orderDetailFragment` with a synthetic back stack — pressing back takes the user to the graph's start destination, not to the launcher. One gotcha with nested nav graphs: if your destination lives inside a nested graph, you need to set the destination to the nested graph's ID, not the individual destination's ID. Otherwise `NavDeepLinkBuilder` throws an `IllegalArgumentException` because it can't find the destination in the top-level graph.

For Compose navigation specifically, you handle the incoming intent in your Activity and let the `NavController` route it. Make sure you also handle `onNewIntent` for when the app is already running — otherwise deep links only work on cold start:

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val navController = rememberNavController()
            LaunchedEffect(Unit) {
                // Handle deep link from initial intent
                navController.handleDeepLink(intent)
            }
            ShopNavGraph(navController = navController)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // navController needs to be accessible here
        // Store it in a variable or use a callback
    }
}
```

## Deferred Deep Links

A **deferred deep link** is a deep link that works even when the app isn't installed yet. The user taps a link, gets sent to the Play Store, installs the app, and on first launch the app opens the intended destination. The "deferred" part is the content survives the install process.

Firebase Dynamic Links was the go-to solution for this, but Google deprecated it in August 2025. The alternatives now are third-party attribution SDKs like **Branch**, **AppsFlyer**, or **Adjust**. These work by fingerprinting the device at click time (IP address, screen resolution, OS version) and matching it to the device that installs the app. It's not 100% reliable — shared WiFi networks or VPNs can cause mismatches — but in practice it works for 90%+ of cases.

The implementation pattern is similar across SDKs. On first launch, you query the attribution service for any pending deep link:

```kotlin
class SplashActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Check for deferred deep link on first install
        if (isFirstLaunch()) {
            BranchDeepLinkRouter.checkForDeferredLink { deepLinkUri ->
                if (deepLinkUri != null) {
                    navigateToDeepLink(deepLinkUri)
                } else {
                    navigateToHome()
                }
            }
        } else {
            handleStandardDeepLink(intent)
        }
    }

    private fun isFirstLaunch(): Boolean {
        val prefs = getSharedPreferences("app_prefs", MODE_PRIVATE)
        val isFirst = prefs.getBoolean("is_first_launch", true)
        if (isFirst) prefs.edit().putBoolean("is_first_launch", false).apply()
        return isFirst
    }
}
```

IMO, if your app has marketing campaigns or referral flows, deferred deep links are non-negotiable. Without them, every user who doesn't have your app installed hits a dead end at the Play Store and has to manually find the content after install. That's a huge drop-off in conversion.

## Deep Link Testing and Debugging

Deep link testing is often an afterthought, but broken deep links directly impact user experience and marketing attribution. I test at multiple levels, starting with `adb` and working up.

**ADB testing** is the quickest way to verify during development. The key is testing different scenarios — app not installed, app in background, app already on the target screen:

```kotlin
// Basic deep link test
// adb shell am start -a android.intent.action.VIEW \
//     -d "https://www.myshop.com/product/12345" \
//     com.myshop.android

// Test without specifying package (tests disambiguation)
// adb shell am start -a android.intent.action.VIEW \
//     -d "https://www.myshop.com/product/12345"

// Test with app already running (tests onNewIntent)
// adb shell am start -a android.intent.action.VIEW \
//     -W -d "shopify://product?id=12345" com.myshop.android

// Dump intent filter resolution for debugging
// adb shell dumpsys package domain-preferred-apps

// Check App Links verification state
// adb shell pm get-app-links --user cur com.myshop.android

// Force re-verification on Android 12+
// adb shell pm verify-app-links --re-verify com.myshop.android
```

The `dumpsys` commands are underused but incredibly valuable. `dumpsys package domain-preferred-apps` shows you exactly which app Android considers the verified handler for each domain. If your app shows `none` instead of `verified`, your `assetlinks.json` is wrong, unreachable, or has a fingerprint mismatch. I always run this after deploying a new DAL file.

For edge case testing, try launching a deep link with the app force-stopped (`adb shell am force-stop com.myshop.android` first), then launch the link. This catches initialization crashes that only happen on deep link cold starts when your `Application.onCreate()` hasn't had time to set everything up. Also test with expired or invalid deep link parameters — if a product gets deleted, your deep link handler shouldn't crash. Show a graceful error or redirect to search.

## Real-World Deep Link Patterns

In production apps, I've found that a centralized deep link router is essential once you have more than 3-4 deep link destinations. Instead of spreading URI parsing logic across multiple activities or fragments, route everything through a single `DeepLinkRouter` that maps URIs to navigation actions:

```kotlin
class DeepLinkRouter(private val navController: NavController) {

    fun route(uri: Uri): Boolean {
        val pathSegments = uri.pathSegments
        return when {
            pathSegments.firstOrNull() == "product" -> {
                val productId = pathSegments.getOrNull(1) ?: return false
                navController.navigate("product/$productId")
                true
            }
            pathSegments.firstOrNull() == "order" -> {
                val orderId = pathSegments.getOrNull(1) ?: return false
                navController.navigate("order/$orderId")
                true
            }
            pathSegments.firstOrNull() == "promo" -> {
                val promoCode = uri.getQueryParameter("code") ?: return false
                navController.navigate("promo/$promoCode")
                true
            }
            else -> {
                // Log unknown deep link for analytics
                trackUnhandledDeepLink(uri)
                navController.navigate("home")
                false
            }
        }
    }

    private fun trackUnhandledDeepLink(uri: Uri) {
        AnalyticsTracker.logEvent("unhandled_deep_link",
            mapOf("uri" to uri.toString()))
    }
}
```

This pattern gives you a single place to add analytics, handle invalid or expired links, and manage fallback behavior. The `trackUnhandledDeepLink` call is important — in production, I've discovered entire categories of deep links that marketing was sending out but the app didn't handle, purely because we were logging unknown URIs.

For **deep link attribution**, always pass the full URI and referrer information to your analytics system before navigating. The `Intent.EXTRA_REFERRER` extra tells you where the link came from (Chrome, Gmail, a specific app), which is crucial for understanding which channels drive installs. Pair that with UTM parameters in your deep link URLs and you get full attribution without a third-party SDK.

Handling **expired or invalid deep links** gracefully is something most apps get wrong. If someone shares a product link and that product gets discontinued, don't show a blank screen or crash. Navigate to the closest relevant screen (the category page, search with the product name pre-filled) and show a brief snackbar explaining what happened. Users are surprisingly forgiving if you acknowledge the problem instead of silently failing.

IMO, deep linking is one of those Android topics where the 20% of effort gets you 80% of the way there, but that last 20% — deferred links, attribution, centralized routing, graceful error handling — is what separates a polished app from a frustrating one. The verification and testing overhead is real, but once you have a solid DAL file, a centralized router, and proper analytics, deep links become one of your most powerful user acquisition tools.

Thanks for reading!
