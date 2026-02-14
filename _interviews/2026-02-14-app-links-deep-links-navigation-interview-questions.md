---
title: "App Links, Deep Links & Navigation"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 31
sequence: 31
description: "Deep links and App Links are commonly asked in Android interviews because they test your understanding of the intent system, manifest configuration,..."
---

## App Links, Deep Links & Navigation

If there's one topic that sounds simple but has a surprising number of "wait, what?" moments, it's deep linking. You'd think it's just "tap a link, open the app." But between disambiguation dialogs, domain verification, Android 12 behavior changes, and multi-module navigation graphs, there's a lot going on under the hood.

#### What is a deep link in Android?

A deep link is just a URI that drops the user straight into a specific screen in your app instead of the home screen. Think of it like a street address versus just the city name — `myapp://product/42` takes you to product 42, not the front door. Your app declares an intent filter in the manifest that matches a URI pattern, and when someone taps a matching link, the system routes the intent your way.

#### What are the three types of deep links on Android?

- **Custom deep links** — Use a custom URI scheme like `myapp://products/123`. Here's the catch: any app can register for any custom scheme. There's no bouncer at the door, so the system may show a disambiguation dialog asking the user which app should handle it.
- **Web links** — Use standard `http` or `https` schemes. On Android 12+, unverified web links just open in the browser. No dialog, no choice, straight to Chrome.
- **App Links** — The VIP pass. These are verified web links (Android 6.0+) where you prove you actually own the domain by hosting a Digital Asset Links file on your server. Once verified, your links open directly in your app — no dialog, no browser, no questions asked.

#### What is the difference between a deep link and an App Link?

Think of App Links like a VIP pass — deep links are general admission where anyone can claim they belong, but App Links prove you own the venue.

A regular deep link uses intent filters to handle URIs, but there's zero ownership verification. Any app can claim any scheme or domain, so the system shows a disambiguation dialog. An App Link is a verified deep link that uses HTTPS and proves domain ownership through Digital Asset Links. You host an `assetlinks.json` file with your package name and signing certificate fingerprint, the system verifies it at install time, and your app opens directly without any dialog. App Links require Android 6.0+ and `android:autoVerify="true"` on the intent filter.

#### How do you set up a basic deep link intent filter?

You declare an intent filter in the manifest with `ACTION_VIEW`, `CATEGORY_DEFAULT`, `CATEGORY_BROWSABLE`, and a `<data>` element specifying the URI pattern.

```xml
<activity
    android:name=".ProductActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="https"
            android:host="www.mystore.com"
            android:pathPrefix="/product" />
    </intent-filter>
</activity>
```

`CATEGORY_BROWSABLE` lets the link be triggered from a browser. `CATEGORY_DEFAULT` is needed because the system adds it automatically to all implicit intents sent via `startActivity()`. Miss either one and your filter silently won't match — yeah, that's a fun one to debug.

#### How do you read data from an incoming deep link?

Call `intent.data` in `onCreate()` to get the URI, then parse whatever you need from it.

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val uri = intent?.data ?: return
    val productId = uri.lastPathSegment // "42" from /product/42
    val source = uri.getQueryParameter("ref")
    loadProduct(productId)
}
```

Here's the thing — if the Activity is already running with `singleTop` or `singleTask` launch mode, the new URI arrives through `onNewIntent()` instead. You need to call `setIntent(intent)` and then read the data. Forgetting this is one of those bugs where "it works sometimes" and you lose an afternoon.

> **🧠 Think about it:** What would happen if you read `intent.data` in `onResume()` without calling `setIntent()` in `onNewIntent()`? Would you get the old URI or the new one?

#### What is the Digital Asset Links file and where does it go?

It's a JSON file named `assetlinks.json` hosted at `https://yourdomain.com/.well-known/assetlinks.json`. Think of it as your app's ID badge for the domain — it contains your package name and the SHA-256 fingerprint of your signing certificate.

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.mystore.app",
    "sha256_cert_fingerprints": [
      "AB:CD:EF:12:34:..."
    ]
  }
}]
```

It must be served over HTTPS, with `Content-Type: application/json`, and accessible without any redirects. If the system can't fetch it during install — no network, server error, redirect — verification fails and your links fall back to the disambiguation dialog. No second chances until re-verification.

#### How do you configure an App Link in the manifest?

Add `android:autoVerify="true"` to the intent filter. That one attribute kicks off the entire verification process at install time.

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="www.mystore.com"
        android:pathPrefix="/product" />
</intent-filter>
```

Plot twist: when `autoVerify` is present in at least one intent filter, the system checks *all* hosts declared across *all* intent filters in your app — not just the ones with `autoVerify`. If any single host fails verification, none of them are automatically verified. This trips up everyone who has test or staging domains declared alongside production.

#### What changed with deep link behavior on Android 12?

This one broke a lot of apps. Before Android 12, unverified web links (HTTP/HTTPS without App Link verification) could show a disambiguation dialog letting the user choose your app. Starting with Android 12, unverified web links go straight to the default browser. No dialog, no choice. If you were relying on HTTP/HTTPS deep links without proper App Link verification, they just stopped working on Android 12+ devices. You either implement full App Link verification or fall back to a custom URI scheme.

#### How does Android verify App Links at install time?

When an app with `android:autoVerify="true"` is installed, the system inspects all intent filters with `ACTION_VIEW`, `CATEGORY_BROWSABLE`, `CATEGORY_DEFAULT`, and an `http` or `https` scheme. For each unique hostname, it fetches `https://{host}/.well-known/assetlinks.json` and checks if the file contains a matching package name and signing certificate fingerprint. The whole thing is asynchronous. On Android 12+, you can manually trigger re-verification using `adb shell pm verify-app-links --re-verify PACKAGE_NAME` and check the result with `adb shell pm get-app-links PACKAGE_NAME`.

#### What happens when App Link verification fails?

Your link loses its VIP status and behaves like a regular unverified deep link. On Android 11 and below, the user sees a disambiguation dialog. On Android 12+, it opens in the browser by default.

Common reasons for failure:

- The `assetlinks.json` file is unreachable
- The server returns a redirect instead of a direct response
- The certificate fingerprint doesn't match (debug vs release signing keys — yeah, this one gets everyone)
- A non-HTTPS domain is declared in the intent filters

You can check the state using `adb shell pm get-app-links PACKAGE_NAME` — it shows `verified`, `none`, or an error code.

> **🧠 Think about it:** If your `assetlinks.json` is served correctly but behind a 301 redirect from `http://` to `https://`, will verification pass or fail?

#### What happens when multiple `<data>` elements are in the same intent filter?

Here's where things get weird. Multiple `<data>` elements inside a single intent filter get *merged* together. The system matches all combinations of their attributes, not just the pairs you intended. So if you have `scheme="https" host="www.example.com"` and `scheme="app" host="open.my.app"` in the same filter, it also matches `app://www.example.com` and `https://open.my.app`. It's like a combinatorial explosion of URIs you never asked for. Always use separate intent filters for distinct URI patterns.

#### What is the difference between `pathPrefix`, `path`, and `pathPattern`?

- `path` — Exact match only. `/product/shoes` matches that exact path and nothing else.
- `pathPrefix` — Matches anything that starts with the prefix. `/product` matches `/product/42`, `/product/shoes/red`, you name it.
- `pathPattern` — Supports wildcards. `.*` matches any character sequence, `.` matches a single character. Useful for patterns like `/product/.*/details`.

Most apps use `pathPrefix` because it's the most flexible. `pathPattern` can be tricky because it uses its own wildcard syntax, not regex — so don't go in expecting full regex power.

#### What is a custom URI scheme and what are its limitations?

A custom URI scheme is something like `myapp://` — your own invented protocol. You declare it in an intent filter with `android:scheme="myapp"`. The upside is simplicity: no server setup, no domain verification, just works.

The downsides, though:

- No ownership verification — any app can register the same scheme, leading to conflicts and potential hijacking
- The disambiguation dialog appears when multiple apps handle the same scheme
- If the app isn't installed, the link goes nowhere (no browser fallback, just a dead end)
- They're not indexed by Google for search results

For anything user-facing, App Links with HTTPS are the way to go. Custom schemes are still handy for internal app-to-app communication where you control both sides.

#### How do you test deep links during development?

Use `adb` to fire deep links from the command line:

```bash
# Test a deep link
adb shell am start -W -a android.intent.action.VIEW \
    -d "https://www.mystore.com/product/42"

# Check App Link verification status
adb shell pm get-app-links com.mystore.app

# Re-verify App Links (Android 12+)
adb shell pm verify-app-links --re-verify com.mystore.app
```

You can also use the App Links Assistant in Android Studio to test links, generate `assetlinks.json`, and validate your intent filters. For Navigation component deep links, `TestNavHostController` lets you verify that a URI navigates to the expected destination with the right arguments.

#### How do deep links work with the Navigation component?

In a single-Activity app using Jetpack Navigation, deep links map to navigation destinations instead of separate Activities. You define them in the navigation graph using `<deepLink>` elements with URI patterns, and placeholders like `{productId}` are automatically matched to the destination's arguments.

```xml
<fragment
    android:id="@+id/productFragment"
    android:name="com.store.ui.ProductFragment"
    android:label="Product Details">
    <argument
        android:name="productId"
        app:argType="string" />
    <deepLink
        app:uri="https://www.mystore.com/product/{productId}" />
</fragment>
```

In the manifest, you add `<nav-graph android:value="@navigation/nav_graph" />` inside your Activity element. At build time, the Navigation component replaces this with generated intent filters for all deep links in the graph. The NavController handles URI matching and argument parsing automatically — you don't write any of that plumbing yourself.

#### What is the difference between explicit and implicit deep links in the Navigation component?

An explicit deep link uses `NavDeepLinkBuilder` to create a `PendingIntent` that navigates to a specific destination. It's what you use for notifications — you build the link programmatically. It also creates a synthetic back stack so pressing Back goes to the parent destination, not straight out of the app.

```kotlin
val pendingIntent = NavDeepLinkBuilder(context)
    .setGraph(R.navigation.main_graph)
    .setDestination(R.id.productFragment)
    .setArguments(bundleOf("productId" to "PRD-42"))
    .createPendingIntent()
```

An implicit deep link is a URI-based link declared in the nav graph using `<deepLink>`. When a user taps a URL that matches, the NavController routes to the right destination. Back stack behavior depends on whether the intent has `FLAG_ACTIVITY_NEW_TASK` — with the flag, the back stack is cleared and rebuilt; without it, the user stays in the previous app's task.

#### How does deep link handling differ in Compose navigation?

With Compose Navigation, deep links target composable destinations instead of Activities or Fragments. You pass the deep link pattern when defining the composable route, and the NavController handles argument extraction.

```kotlin
composable(
    route = "product/{productId}",
    deepLinks = listOf(
        navDeepLink {
            uriPattern = "https://www.mystore.com/product/{productId}"
        }
    ),
    arguments = listOf(
        navArgument("productId") { type = NavType.StringType }
    )
) { backStackEntry ->
    val productId = backStackEntry.arguments?.getString("productId")
    ProductScreen(productId = productId)
}
```

Here's the part that catches people off guard — you still need intent filters declared in the manifest for the host Activity. The Compose navigation layer only handles internal routing once the Activity already has the intent. It's not magic all the way down.

#### How do you handle deep links that require authentication?

This comes up all the time in real apps. User taps a deep link, but they're not logged in. Now what? You have two options:

- **Save and redirect** — Stash the target deep link URI, show the login screen, and after successful authentication navigate to the saved destination. This is the better UX by far.
- **Show gated content** — Navigate to the destination but slap a login prompt on top of it.

I prefer the first approach. Store the pending URI in a ViewModel or saved state, redirect to your login flow, and on success call `navController.navigate(savedUri)`. Just make sure you clear the saved URI after navigating so it doesn't trigger again on configuration change.

#### What are deferred deep links and how do they work?

A deferred deep link is like a rain check — it routes to specific content but works even when the app isn't installed yet. The flow goes: user clicks a link, gets redirected to the Play Store, installs the app, opens it, and lands on the intended content instead of the home screen.

Android doesn't have a built-in mechanism for this. The system can only match intent filters for installed apps. The typical approach: your server stores the link data, detects the app isn't installed, redirects to the Play Store with a referrer parameter. After installation, the app reads the referrer via the Install Referrer API on first launch and navigates to the intended content. Firebase Dynamic Links used to handle this but is now deprecated.

> **🧠 Think about it:** If deferred deep links require server-side coordination and the Install Referrer API, what happens if the user installs the app from the Play Store directly (not through your link) and then taps the deep link?

#### How do you handle deep links in multi-module navigation?

In a modular app, each feature module has its own navigation graph. Deep links in a feature module's graph are only reachable if that graph is included in the main navigation graph as a nested graph. The `<nav-graph>` element in the manifest generates intent filters from the root graph and all nested graphs combined.

The real challenge is that feature modules shouldn't know about each other. I typically define deep link URIs as constants in a shared module and use implicit deep links with `NavController.navigate(Uri.parse("https://..."))` to navigate across module boundaries. The sender doesn't need a compile-time dependency on the destination module — the NavController resolves the URI at runtime. It's like sending mail to an address without needing to know who lives there.

#### What is `DomainVerificationManager` and when would you use it?

`DomainVerificationManager` is an Android 12 API that lets you check the App Link verification state for your domains at runtime. It's your way of asking the system "hey, did verification actually work?"

```kotlin
val manager = getSystemService(DomainVerificationManager::class.java)
val userState = manager.getDomainVerificationUserState(packageName)
val hostStates = userState?.hostToStateMap ?: return

hostStates.forEach { (domain, state) ->
    when (state) {
        DOMAIN_STATE_VERIFIED -> { /* Verified via assetlinks.json */ }
        DOMAIN_STATE_SELECTED -> { /* User manually approved */ }
        DOMAIN_STATE_NONE -> { /* Not approved — prompt user */ }
    }
}
```

If a domain isn't verified, you can send the user to the system settings screen using `Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS` where they can manually approve your app for that domain. It's a nice fallback when automatic verification fails — you're not completely stuck.

#### How do you support deep links across product flavors with different package names?

Each flavor has a different package name, so the `assetlinks.json` on your server needs entries for each one. You'll need separate SHA-256 fingerprints for each flavor's signing key too — it's not a single file anymore, it's a list.

In the manifest, the intent filter stays the same across flavors — only the package name changes, and the build system handles that. The server-side file is where all the work happens. You add multiple target blocks in `assetlinks.json`, one per flavor.

For custom URI schemes, I usually include the flavor name in the scheme — `myapp-debug://`, `myapp-staging://` — so links don't accidentally resolve to the wrong build. You really don't want your staging deep links opening the production app.

### Common Follow-ups

- What happens if you have `autoVerify="true"` but your server's `assetlinks.json` is temporarily down during app install?
- How do you handle deep links that require authentication — should you show the login screen or the target content?
- Can you deep link to a Dialog or BottomSheet destination in the Navigation component?
- How do you handle the case where a deep link URI matches multiple destinations in the navigation graph?
- What is the lifecycle sequence when a deep link arrives via `onNewIntent()` while the Activity is stopped?
- How do you pass complex objects through deep link URIs?
- What replaced Firebase Dynamic Links for deferred deep linking?
- How do you prevent other apps from registering the same custom URI scheme and intercepting your deep links?
