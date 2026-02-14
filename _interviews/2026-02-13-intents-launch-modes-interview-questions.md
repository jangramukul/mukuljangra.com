---
title: "Intents, Intent Filters & Launch Modes"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 7
sequence: 7
description: "Intents, intent filters, and launch modes are core concepts that define how Android components communicate and how the system manages tasks and back..."
---

## Intents, Intent Filters & Launch Modes

Think of Android components as people in different rooms. They can't just walk up to each other and talk. They need a messaging system -- something to carry a request from one room to another. That's what Intents, intent filters, and launch modes are all about: how components find each other, how they communicate, and how the system decides whether to open a new room or reuse one that's already occupied.

#### What is an Intent in Android?

An Intent is basically a message in an envelope. You write what you want done (the action), attach some data (a URI, extras as key-value pairs), slap on some flags that tell the system how to handle delivery, and drop it in the mailbox. The system reads the envelope and figures out who should open it -- whether that's an Activity, a Service, or a BroadcastReceiver.

#### What's the difference between explicit and implicit intents?

Think of it like ordering food. An explicit intent is calling a specific restaurant by name -- "I want pizza from Mario's." An implicit intent is saying "I want pizza" and letting the system figure out which restaurant nearby can serve it.

- **Explicit Intent** -- You specify the exact component by class name. Used for communication within your own app.
- **Implicit Intent** -- You declare a general action, and the system finds matching components across all installed apps.

```kotlin
// Explicit — target component is specified
val intent = Intent(this, PaymentActivity::class.java)
intent.putExtra("orderId", "ORD-98234")
startActivity(intent)
```

```kotlin
// Implicit — system resolves matching components
val shareIntent = Intent(Intent.ACTION_SEND).apply {
    type = "text/plain"
    putExtra(Intent.EXTRA_TEXT, "Check out this article!")
}
startActivity(Intent.createChooser(shareIntent, "Share via"))
```

Explicit intents bypass intent filter matching entirely and deliver straight to the named component. Implicit intents trigger the full resolution process -- action test, category test, and data test -- against every declared intent filter on the device.

#### What are the four launch modes?

Launch modes control how new instances of an Activity are created and placed in tasks. Set via `android:launchMode` in the manifest. Picture your back stack like a stack of plates.

- **standard** (default) -- Every launch adds a new plate, even if an identical one already exists. Stack A-B-C, launch C again: A-B-C-C.
- **singleTop** -- If the same plate is already on top, don't add another. Instead, `onNewIntent()` is called on the existing one. But if it's buried deeper in the stack, a new instance is created normally. Stack A-B-C, launch C: A-B-C (onNewIntent). Stack A-B-C, launch B: A-B-C-B.
- **singleTask** -- Only one instance can exist in a task. If it already exists, the system yanks it to the foreground, calls `onNewIntent()`, and destroys everything above it. Stack A-B-C, launch A: A (B and C are finished). It's like saying "I only want one of these, and I'll clear the mess to get to it."
- **singleInstance** -- Same as singleTask, but this activity gets its own private task. No other activity can be launched into that task. Any activity started from it opens in a separate task. It's a loner.

#### What is an Intent Filter and how does the system match them?

An intent filter is like a sign on your shop door: "We accept these kinds of orders." It's declared in the manifest to specify which implicit intents a component can handle. The system runs three tests against every declared filter:

- **Action test** -- The intent's action must match at least one `<action>` in the filter.
- **Category test** -- Every category in the intent must exist in the filter. Here's the catch: the system automatically adds `CATEGORY_DEFAULT` to all implicit intents from `startActivity()`, so you must declare it in your filter or you'll never get a match.
- **Data test** -- The intent's URI and MIME type are checked against `<data>` elements -- scheme, host, port, path, and MIME type.

```xml
<activity
    android:name=".ShareActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>
</activity>
```

A component can have multiple intent filters, and only one needs to match. But forget `CATEGORY_DEFAULT` and your Activity will silently never receive implicit intents from `startActivity()`. That one trips people up constantly.

#### How do you pass data between Activities using intents?

Extras are key-value pairs you stuff inside the Intent, like tucking notes into the envelope. Use `putExtra()` to attach data and `getStringExtra()`, `getIntExtra()`, etc., to read it on the other side. Under the hood, extras are stored in a `Bundle`.

```kotlin
// Sender
val intent = Intent(this, OrderDetailActivity::class.java).apply {
    putExtra("orderId", "ORD-98234")
    putExtra("totalAmount", 149.99)
    putExtra("isPremiumUser", true)
}
startActivity(intent)

// Receiver
val orderId = intent.getStringExtra("orderId")
val total = intent.getDoubleExtra("totalAmount", 0.0)
val isPremium = intent.getBooleanExtra("isPremiumUser", false)
```

For complex objects, use `Parcelable` or `Serializable`.

#### Parcelable vs Serializable — when do you use which?

Both convert objects into byte streams so they can travel through Intents and Bundles. But they go about it very differently.

**Parcelable** is Android-specific. It writes data directly to a `Parcel`, which is optimized for IPC. It's fast and produces small payloads. With `@Parcelize`, the compiler generates all the boilerplate for you -- zero effort.

```kotlin
@Parcelize
data class OrderItem(
    val productId: String,
    val name: String,
    val price: Double
) : Parcelable
```

**Serializable** is the Java standard interface. It uses reflection under the hood, creates temporary objects, and puts pressure on GC. Slower, bigger payloads. Its only selling point is zero boilerplate -- but `@Parcelize` already killed that advantage.

Always use `Parcelable` on Android. `Serializable` only makes sense when you're sharing model classes with a pure Java/Kotlin backend module that has no Android dependency.

> **🧠 Think about it:** If `Serializable` requires zero boilerplate and `@Parcelize` also requires zero boilerplate, why would you ever pick `Serializable` on Android?

#### What is a PendingIntent?

Think of a PendingIntent as a signed permission slip. You're saying to another app or system component: "Here's an Intent. I'm giving you permission to execute it later, on my behalf, with my identity and my permissions." You hand over the slip now, and the other party cashes it in whenever they're ready.

```kotlin
val activityPending = PendingIntent.getActivity(
    context, requestCode, intent,
    PendingIntent.FLAG_IMMUTABLE
)

val broadcastPending = PendingIntent.getBroadcast(
    context, requestCode, intent,
    PendingIntent.FLAG_IMMUTABLE
)
```

The classic use cases: notifications (system executes the intent when the user taps), AlarmManager (fires the intent at a scheduled time), and AppWidgets (launcher executes on widget interaction). The execution is delegated to another process, and that process acts with your app's permissions.

#### How do Intent flags interact with manifest launch modes?

Here's the rule: when there's a conflict, the flag wins. If Activity A launches Activity B with a flag, and B has a different launch mode in its manifest, the flag takes priority. Think of manifest launch modes as default preferences, and flags as overrides at the point of use.

The three critical flags:

- **FLAG_ACTIVITY_NEW_TASK** -- Equivalent to `singleTask`. Starts the activity in a new task or brings an existing task with the same affinity to the foreground. Required when launching from a non-Activity context like a Service.
- **FLAG_ACTIVITY_SINGLE_TOP** -- Equivalent to `singleTop`. Prevents a new instance if the activity is already on top.
- **FLAG_ACTIVITY_CLEAR_TOP** -- No manifest equivalent. If the activity exists in the task, all activities above it are destroyed. Combined with `FLAG_ACTIVITY_SINGLE_TOP`, the existing instance receives `onNewIntent()`. Without it, the target is also destroyed and recreated.

```kotlin
val intent = Intent(this, HomeActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
}
startActivity(intent)
```

#### What happens inside onNewIntent()?

When a launch mode or flag prevents a new instance from being created, the system calls `onNewIntent()` on the existing Activity with the new Intent. But here's the gotcha: `getIntent()` still returns the original Intent that created the Activity. If you want `getIntent()` to reflect the latest data, you have to call `setIntent(newIntent)` yourself.

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val updatedProductId = intent.getStringExtra("productId")
    loadProduct(updatedProductId)
}
```

`onNewIntent()` is called before `onResume()`. If the Activity was stopped, the sequence is `onNewIntent()` -> `onRestart()` -> `onStart()` -> `onResume()`. If it was paused, it's `onNewIntent()` -> `onResume()`.

#### What's the difference between `setData()` and `putExtra()`?

These two look similar but play completely different roles. Think of `setData()` as the address on the envelope -- the system reads it to decide where the letter goes. `putExtra()` is the letter inside -- only the recipient reads it after delivery.

`setData()` sets the Intent's data as a URI. The system uses this URI during intent filter matching -- it's checked against `<data>` elements in the filter. Typically used with `ACTION_VIEW` to point to a web URL or content URI.

`putExtra()` attaches additional key-value data that the receiving component reads manually. Extras are never used in intent filter matching.

```kotlin
// setData — used for intent resolution
val viewIntent = Intent(Intent.ACTION_VIEW).apply {
    data = Uri.parse("https://example.com/products/42")
}

// putExtra — carried along but not matched
val detailIntent = Intent(this, ProductActivity::class.java).apply {
    putExtra("productId", 42)
}
```

One thing that bites people: calling `setData()` and `setType()` separately clears the other. If you need both a URI and a MIME type, use `setDataAndType()`.

#### What are FLAG_IMMUTABLE and FLAG_MUTABLE?

Starting with Android 12 (API 31), every PendingIntent must declare mutability. Skip it and the system throws an `IllegalArgumentException`. No ambiguity allowed.

- **FLAG_IMMUTABLE** -- The wrapped Intent cannot be modified by the receiving component. Use this for almost everything -- notifications, alarms, widgets.
- **FLAG_MUTABLE** -- Allows the receiver to modify extras before execution. Needed for inline reply actions in notifications, Android Auto, and bubble conversations.

A mutable PendingIntent means the receiving app can modify the intent's data before it fires. That's a privilege escalation risk, so outside those specific cases, always default to `FLAG_IMMUTABLE`.

#### What is task affinity?

Task affinity is like a team jersey. It's a string attribute (`android:taskAffinity`) that tells the system which task an activity "belongs" to. By default, all activities in an app wear the same jersey -- the app's package name.

It matters in two situations:

- When launching with `FLAG_ACTIVITY_NEW_TASK`, the system checks if a task with the same affinity already exists. If yes, the activity joins that task. If not, a new task is created.
- When `allowTaskReparenting="true"` is set, the activity can switch teams. If Activity A has affinity for App X but was started by App Y, and App X comes to the foreground, Activity A moves over to App X's task.

Here's the key thing: task affinity does nothing on its own. It's only meaningful with `FLAG_ACTIVITY_NEW_TASK` or `allowTaskReparenting`.

#### What is a Sticky Intent? Is it still relevant?

A Sticky Intent is a broadcast that sticks around after it's been sent -- like a Post-it note on a bulletin board. Other components can come by later and read the last broadcast data without having been registered when the broadcast was originally sent. This was typically used for system-level events like battery status or network changes.

But here's the thing: `sendStickyBroadcast()` has been deprecated since API 21. It had zero security -- any app could access or modify the sticky data, and there was no protection against spoofing. Modern alternatives are `LiveData`, `StateFlow`, or checking system services directly like `BatteryManager`.

#### What is the difference between deep links and App Links?

Both use intent filters to route URIs to your app, but they differ in trust and user experience.

**Deep links** use custom schemes (like `myapp://product/42`) or HTTP/HTTPS URLs without verification. The problem? Any app can register any scheme. So the system shows a disambiguation dialog asking the user to pick. It's like anyone being able to put up a sign claiming to be "Mario's Pizza."

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="myapp"
        android:host="product" />
</intent-filter>
```

**App Links** (Android 6.0+) use verified HTTPS domains. You host an `assetlinks.json` on your server with your app's signing certificate fingerprint. Once verified, HTTPS links open directly in your app -- no disambiguation dialog. It's like getting a verified badge.

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

The `android:autoVerify="true"` attribute triggers verification. Without it, even HTTPS links show the disambiguation dialog.

> **🧠 Think about it:** If any app can register a custom scheme like `myapp://`, what stops a malicious app from intercepting your deep links?

#### Walk through the back stack behavior for each launch mode.

Let's play this out with a task stack: `Home -> Search -> Product`.

- **standard** -- Launch Product again. Stack: Home -> Search -> Product -> Product. Two instances of Product now exist. Back pops them one at a time. No shortcuts.
- **singleTop** -- Launch Product (already on top). Stack stays: Home -> Search -> Product. Existing instance gets `onNewIntent()`. But launch Search instead? Home -> Search -> Product -> Search. New instance, because Search wasn't on top.
- **singleTask** -- Launch Home. Stack: Home. Search and Product are destroyed. Home gets `onNewIntent()`. Everything between the top and Home is gone.
- **singleInstance** -- If Product is singleInstance, it lives in its own private task. Launching Settings from it opens Settings in a different task. Back from Settings goes to the previous task, not Product.

#### What happens when you use FLAG_ACTIVITY_CLEAR_TOP with standard launch mode?

This one's a classic gotcha. The system destroys all activities above the target, and then also destroys the target itself and creates a fresh instance. It does not call `onNewIntent()`.

Why? Because `standard` mode means "always create a new instance." `FLAG_ACTIVITY_CLEAR_TOP` clears the stack above, but it doesn't override the instantiation behavior.

To reuse the existing instance instead of recreating it, pair it with `FLAG_ACTIVITY_SINGLE_TOP`:

```kotlin
// Without SINGLE_TOP — target is destroyed and recreated
val intent = Intent(this, HomeActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP
}

// With SINGLE_TOP — target receives onNewIntent()
val intent = Intent(this, HomeActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
}
```

This matters because if you clear the stack expecting to return to an existing Home, but the system recreates it instead, that activity loses all its state.

#### What security concerns exist with implicit intents and PendingIntents?

Any app can declare an intent filter to intercept implicit intents. A malicious app could register a matching filter and capture sensitive data you thought was going somewhere safe. This is why I always use explicit intents for Services. Starting with Android 5.0, the system actually throws an exception if you try to bind a Service with an implicit intent.

For PendingIntents, the concern is delegation. The system component executes the wrapped intent with your app's identity and permissions. If that PendingIntent wraps an implicit intent, the receiving component could be spoofed. Always wrap explicit intents inside PendingIntents.

A mutable PendingIntent (`FLAG_MUTABLE`) lets the receiving app modify extras before execution -- that's potential privilege escalation. Android 12 added `StrictMode.detectUnsafeIntentLaunch()` to catch these unsafe patterns during development.

One more thing: intent filters in the manifest are not a security mechanism. Any app that knows the component name can send an explicit intent directly to it, bypassing the filter entirely. Use permissions or `android:exported="false"` to actually restrict access.

#### What is singleInstancePerTask?

Introduced in Android 12 (API 31), `singleInstancePerTask` acts as the root activity of a task and allows one instance per task. The key difference from `singleInstance`: multiple instances can exist, each in a different task. With `singleInstance`, there's exactly one instance system-wide -- period.

Using `FLAG_ACTIVITY_MULTIPLE_TASK` or `FLAG_ACTIVITY_NEW_DOCUMENT` lets the system create additional instances in new tasks. This was added for multi-window scenarios -- split screen and freeform windows on tablets and Chromebooks -- where `singleInstance` was too restrictive. It's basically `singleInstance` that learned to share.

#### How do you handle deep links in a single-Activity architecture?

In a single-Activity app using Jetpack Navigation, deep links map to navigation destinations instead of Activities. You define them in the navigation graph using `<deepLink>` elements, and NavController handles routing. No need to juggle multiple Activity intent filters.

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

For creating deep links programmatically (useful for notifications), `NavDeepLinkBuilder` builds a synthetic back stack:

```kotlin
val pendingIntent = NavDeepLinkBuilder(context)
    .setGraph(R.navigation.main_graph)
    .setDestination(R.id.productFragment)
    .setArguments(bundleOf("productId" to "PRD-42"))
    .createPendingIntent()
```

The beauty of this: if the user lands on the product screen via a notification and presses Back, they go to the parent destination like Home instead of exiting the app. The synthetic back stack makes it feel natural.

#### What is a deferred deep link?

A deferred deep link routes to specific content in your app, but the app isn't installed yet. Picture this: user clicks a link, gets redirected to the Play Store, installs the app, opens it, and lands on the intended content instead of the home screen. The "deferred" part means the deep link waits patiently for the app to exist.

Android doesn't have built-in deferred deep linking. The system only matches intent filters for installed apps. You typically use server-side redirect logic or a third-party service. The pattern: your server redirects to the Play Store with a referrer parameter, the Play Store passes it to your app after installation via the Install Referrer API, and your app reads it on first launch to navigate to the right content.

#### How does `android:exported` affect intent delivery?

`android:exported` is the bouncer at the door. If `true`, any app can send an intent to your component. If `false`, only your app (or apps with the same user ID) can get in.

Starting with Android 12, you must explicitly set `android:exported` for any component that declares an intent filter. Forget it and the build fails -- no warnings, just a hard stop. Activities with `LAUNCHER` intent filters must be exported. Activities that only handle intents from within your own app should set `exported="false"`.

This is separate from intent filter matching. An exported component with an intent filter can receive both explicit and implicit intents from other apps. A non-exported component with an intent filter only receives intents from within your own app.

> **🧠 Think about it:** If your Activity has an intent filter but `android:exported="false"`, can another app still reach it with an explicit intent?

#### What's the difference between `FLAG_ACTIVITY_NEW_TASK` and `FLAG_ACTIVITY_CLEAR_TASK`?

`FLAG_ACTIVITY_NEW_TASK` starts the activity in a new task if one with the matching affinity doesn't exist, or brings the existing task to the foreground. The existing activities in the task are preserved -- nobody gets kicked out.

`FLAG_ACTIVITY_CLEAR_TASK` is the nuclear option. It clears the entire task before launching the activity. Every existing activity in the task is destroyed. This flag must be used together with `FLAG_ACTIVITY_NEW_TASK`.

```kotlin
// Common pattern: restart app from a fresh state (e.g., after logout)
val intent = Intent(this, LoginActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TASK
}
startActivity(intent)
```

I use `CLEAR_TASK` for scenarios like logout, where I want to wipe the entire back stack and start fresh from the login screen. No going back.

### Common Follow-ups

- How would you choose between setting a launch mode in the manifest vs using intent flags?
- What happens if you launch a singleTask activity from a different app? Which task comes to the foreground?
- Can two activities in the same app have different task affinities? When would you want that?
- How do you test deep links during development? What tools does Android provide?
- How does the back button behave in multi-window mode with different launch modes?
- If your app targets Android 12+ and you forget to specify PendingIntent mutability, what happens?
- How do you verify that App Links are correctly configured? What can go wrong with verification?
- What's the lifecycle sequence when an Activity receives `onNewIntent()` while stopped vs while paused?
- How does `CATEGORY_BROWSABLE` differ from `CATEGORY_DEFAULT` in intent filters?
