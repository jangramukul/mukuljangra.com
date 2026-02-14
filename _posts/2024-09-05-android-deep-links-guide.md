---
title: Android Deep Links and App Links Guide
layout: post
categories: post
tags:
  - Android
  - Architecture
---

Deep links are one of those features that sound simple — "tap a URL, open the app" — until you actually implement them. There are three different mechanisms (URI schemes, web links, Android App Links), each with different verification models, different security implications, and different behavior when multiple apps claim the same link. I spent a frustrating week debugging why our deep links worked perfectly during development but failed silently in production. The cause: our Digital Asset Links file had a typo in the SHA-256 fingerprint, which meant Android's link verification failed, and the OS fell back to showing a disambiguation dialog that most users dismissed without reading.

That experience taught me that deep linking isn't just about intent filters. It's about understanding how Android decides which app handles a URL, and making sure your app wins that decision reliably.

## URI Schemes — The Simple (and Insecure) Approach

Custom URI schemes are the oldest form of deep linking on Android. You define a custom protocol like `myapp://` and register an intent filter for it.

```kotlin
// AndroidManifest.xml intent filter (shown as comment for reference)
// <intent-filter>
//     <action android:name="android.intent.action.VIEW" />
//     <category android:name="android.intent.category.DEFAULT" />
//     <category android:name="android.intent.category.BROWSABLE" />
//     <data android:scheme="shopify" android:host="product" />
// </intent-filter>

// Handling in Activity
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
        val productId = uri.getQueryParameter("id") ?: return
        loadProduct(productId)
    }
}
```

The URI `shopify://product?id=12345` would open this activity. It works, but custom URI schemes have a fundamental problem: **any app can claim any custom scheme.** There's no verification, no ownership proof. If another app registers the same `shopify://` scheme, Android shows a disambiguation dialog, and the user has to choose which app to open. Worse, a malicious app could register your scheme and intercept sensitive deep links — OAuth callbacks are the classic attack vector here.

Custom URI schemes still have legitimate uses — they're the only way to deep link from certain contexts (push notification payloads that need to work offline, QR codes for internal tools). But for web-to-app linking, Android App Links are strictly better.

## Android App Links — Verified Ownership

App Links use standard `https://` URLs and add a verification step that proves your app owns the domain. When Android verifies an App Link, it fetches a Digital Asset Links JSON file from your domain and checks that the file lists your app's package name and signing certificate. If verification succeeds, your app opens immediately — no disambiguation dialog, no chance for another app to intercept.

```kotlin
// AndroidManifest.xml (shown as comment)
// <intent-filter android:autoVerify="true">
//     <action android:name="android.intent.action.VIEW" />
//     <category android:name="android.intent.category.DEFAULT" />
//     <category android:name="android.intent.category.BROWSABLE" />
//     <data android:scheme="https"
//           android:host="www.myshop.com"
//           android:pathPrefix="/product" />
// </intent-filter>

// Digital Asset Links file at:
// https://www.myshop.com/.well-known/assetlinks.json
// [
//   {
//     "relation": ["delegate_permission/common.handle_all_urls"],
//     "target": {
//       "namespace": "android_app",
//       "package_name": "com.myshop.android",
//       "sha256_cert_fingerprints": [
//         "AB:CD:EF:12:34:..."
//       ]
//     }
//   }
// ]
```

The `android:autoVerify="true"` attribute triggers the verification process at install time. Android sends an HTTPS request to `https://www.myshop.com/.well-known/assetlinks.json` and checks the response. If the JSON file exists, is served over HTTPS, and contains the correct package name and SHA-256 fingerprint, the app becomes the verified handler for all URLs matching the intent filter.

The SHA-256 fingerprint is where most people trip up. You need the fingerprint of your **signing** key, not your debug key. And if you use Google Play App Signing (which you should), you need the fingerprint of the upload key AND the app signing key that Google manages. You can find both in the Play Console under Setup → App signing. I've seen teams deploy assetlinks.json with their debug key fingerprint, wonder why verification works on their device but fails for users, and waste days before realizing the signing key difference.

You can verify your setup with:

```kotlin
// Test from command line:
// adb shell pm get-app-links --user cur com.myshop.android
//
// Expected output:
// com.myshop.android:
//   ID: ...
//   Signatures: [AB:CD:EF:...]
//   Domain verification state:
//     www.myshop.com: verified
```

If it shows `none` instead of `verified`, your assetlinks.json is wrong, unreachable, or has a fingerprint mismatch. On Android 12+, you can also use `adb shell pm verify-app-links --re-verify com.myshop.android` to trigger re-verification without reinstalling.

## Deep Links With Jetpack Navigation

Jetpack Navigation supports deep links natively. You define deep links in your nav graph, and Navigation handles the intent routing for you — no manual `intent.data` parsing needed.

```kotlin
// NavGraph setup with deep links
@Composable
fun AppNavGraph(navController: NavHostController) {
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
            val productId = backStackEntry.arguments?.getString("productId") ?: return@composable
            ProductScreen(productId = productId)
        }
    }
}

// In your Activity, pass the intent to Navigation
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val navController = rememberNavController()
            AppNavGraph(navController = navController)
        }
    }
}
```

Navigation extracts the `{productId}` path segment automatically and makes it available through `backStackEntry.arguments`. This removes the manual URI parsing code and keeps deep link routing centralized in the nav graph rather than scattered across activities.

One thing to watch out for: Navigation deep links create a synthetic back stack by default. If the user opens `product/123` via a deep link, pressing back takes them to the `startDestination` (home), not to the app launcher. This is usually the right behavior, but if your deep link targets a screen deep in a nested navigation graph, the synthetic back stack might not include intermediate screens. Test your deep link back navigation thoroughly — it's one of the most common sources of user confusion.

## Testing Deep Links

Deep link testing is often an afterthought, but broken deep links directly impact user experience and marketing attribution. I test at three levels.

**ADB testing** is the quickest way to verify during development. The command-line approach avoids the browser's own link interception behavior:

```kotlin
// Test from terminal:
// adb shell am start -a android.intent.action.VIEW \
//     -d "https://www.myshop.com/product/12345" \
//     com.myshop.android

// For custom URI schemes:
// adb shell am start -a android.intent.action.VIEW \
//     -d "shopify://product?id=12345"
```

**Unit testing** with Robolectric lets you verify intent filter matching without a device. **Integration testing** with the Digital Asset Links API tester at `https://developers.google.com/digital-asset-links/tools/generator` verifies your assetlinks.json is correctly served and parseable.

The honest tradeoff with App Links is operational complexity. You need a web server that reliably serves the assetlinks.json file. If that server goes down during a user's app install, verification fails, and the user gets disambiguation dialogs until they reinstall. The file must be served at the exact path `/.well-known/assetlinks.json`, over HTTPS, with a valid certificate, and with the correct MIME type (`application/json`). CDN caching can also bite you — if you update the fingerprint and your CDN serves stale content, new installs fail verification. I recommend setting a short cache TTL (1 hour) on this specific file.

IMO, the setup pain is worth it. Verified App Links give you a seamless user experience — tap a link, land in the app, no dialog, no friction. For any app with significant web traffic, the conversion improvement from eliminating the disambiguation dialog is measurable and meaningful.

Thanks for reading!
