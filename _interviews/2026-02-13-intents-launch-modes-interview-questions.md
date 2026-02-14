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

Intents, intent filters, and launch modes define how Android components communicate and how the system manages tasks and the back stack.

#### What is an Intent in Android?

Intent is a message with data which is used for starting an activity and service, used in broadcast receivers etc. It carries an action, optional data as a URI, extras as key-value pairs, and flags that control behavior.

#### What's the difference between explicit and implicit intents?

- **Explicit Intent** — Used for communication within the app. You specify the exact component by class name.
- **Implicit Intent** — Used for communication between apps. You declare a general action, and the system finds matching components across installed apps.

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

Explicit intents bypass intent filter matching and deliver directly to the named component. Implicit intents trigger the full resolution process — action test, category test, and data test — against every declared intent filter on the device.

#### What are the four launch modes?

Launch modes control how new instances of an Activity are created and placed in tasks. Set via `android:launchMode` in the manifest.

- **standard** (default) — A new instance is created every time. Stack A-B-C, launch C again → A-B-C-C.
- **singleTop** — If the activity is already at the top of the stack, no new instance is created. Instead, `onNewIntent()` is called. If it's not at the top, a new instance is created normally. Stack A-B-C, launch C → A-B-C (onNewIntent). Stack A-B-C, launch B → A-B-C-B.
- **singleTask** — Only one instance can exist in a task. If it already exists, the system brings it to the foreground, calls `onNewIntent()`, and destroys all activities above it. Stack A-B-C, launch A → A (B and C are finished).
- **singleInstance** — Same as singleTask, but the activity is the sole member of its task. No other activity can be launched into that task. Any activity started from it opens in a separate task.

#### What is an Intent Filter and how does the system match them?

An intent filter is declared in the manifest to specify the type of implicit intents a component can handle. The system runs three tests against every declared filter:

- **Action test** — The intent's action must match at least one `<action>` in the filter.
- **Category test** — Every category in the intent must exist in the filter. The system adds `CATEGORY_DEFAULT` to all implicit intents from `startActivity()`, so you must declare it.
- **Data test** — The intent's URI and MIME type are checked against `<data>` elements — scheme, host, port, path, and MIME type.

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

A component can have multiple intent filters. Only one needs to match. Without `CATEGORY_DEFAULT`, your Activity will never receive implicit intents from `startActivity()`.

#### How do you pass data between Activities using intents?

Extras are key-value pairs bundled inside the Intent. Use `putExtra()` to attach data and `getStringExtra()`, `getIntExtra()`, etc., to read it on the receiving end. Extras are stored in a `Bundle` internally.

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

Both convert objects into byte streams so they can travel through Intents and Bundles.

**Parcelable** is Android-specific. It writes data directly to a `Parcel`, which is optimized for IPC. It's faster and produces smaller payloads. Use `@Parcelize` to generate the boilerplate at compile time.

```kotlin
@Parcelize
data class OrderItem(
    val productId: String,
    val name: String,
    val price: Double
) : Parcelable
```

**Serializable** is a Java standard interface. It uses reflection, creates temporary objects, and puts pressure on GC. Slower, larger payloads. The only advantage is zero boilerplate.

Always use `Parcelable` on Android. `Serializable` only makes sense for sharing model classes with a pure Java/Kotlin backend module that has no Android dependency.

#### What is a PendingIntent?

PendingIntent is used for making a communication in future time. It wraps an Intent and grants another app or system component the ability to execute it on your behalf, with your app's identity and permissions.

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

Generally used with notifications (system executes the intent when user taps), AlarmManager (fires intent at a scheduled time), and AppWidgets (launcher executes on widget interaction). The execution is delegated to another process, and that process acts with your app's permissions.

#### How do Intent flags interact with manifest launch modes?

Intent flags override manifest launch modes when there's a conflict. If Activity A launches Activity B with a flag, and B has a different launch mode in its manifest, the flag wins.

The three critical flags:

- **FLAG_ACTIVITY_NEW_TASK** — Equivalent to `singleTask`. Starts the activity in a new task or brings an existing task with the same affinity to the foreground. Required when launching from a non-Activity context like a Service.
- **FLAG_ACTIVITY_SINGLE_TOP** — Equivalent to `singleTop`. Prevents a new instance if the activity is already on top.
- **FLAG_ACTIVITY_CLEAR_TOP** — No manifest equivalent. If the activity exists in the task, all activities above it are destroyed. Combined with `FLAG_ACTIVITY_SINGLE_TOP`, the existing instance receives `onNewIntent()`. Without it, the target is also destroyed and recreated.

```kotlin
val intent = Intent(this, HomeActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
}
startActivity(intent)
```

#### What happens inside onNewIntent()?

When a launch mode or flag prevents a new instance from being created, the system calls `onNewIntent()` on the existing Activity with the new Intent. `getIntent()` still returns the original Intent that created the Activity. You must call `setIntent(newIntent)` if you want `getIntent()` to reflect the latest data.

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val updatedProductId = intent.getStringExtra("productId")
    loadProduct(updatedProductId)
}
```

`onNewIntent()` is called before `onResume()`. If the Activity was stopped, the sequence is `onNewIntent()` → `onRestart()` → `onStart()` → `onResume()`. If it was paused, it's `onNewIntent()` → `onResume()`.

#### What's the difference between `setData()` and `putExtra()`?

`setData()` sets the Intent's data as a URI. The system uses this URI during intent filter matching — it's checked against `<data>` elements in the filter. Typically used with `ACTION_VIEW` to point to a web URL or content URI.

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

Calling `setData()` and `setType()` separately clears the other. If you need both a URI and a MIME type, use `setDataAndType()`.

#### What are FLAG_IMMUTABLE and FLAG_MUTABLE?

Starting with Android 12 (API 31), every PendingIntent must declare mutability. Without it, the system throws an `IllegalArgumentException`.

- **FLAG_IMMUTABLE** — The wrapped Intent cannot be modified by the receiving component. Use this for almost everything — notifications, alarms, widgets.
- **FLAG_MUTABLE** — Allows the receiver to modify extras before execution. Needed for inline reply actions in notifications, Android Auto, and bubble conversations.

A mutable PendingIntent means the receiving app can modify the intent's data before it fires. This is a privilege escalation risk. Outside the specific cases above, always use `FLAG_IMMUTABLE`.

#### What is task affinity?

Task affinity is a string attribute (`android:taskAffinity`) that determines which task an activity prefers to belong to. By default, all activities in an app share the app's package name as their affinity.

It matters in two situations:

- When launching with `FLAG_ACTIVITY_NEW_TASK`, the system checks if a task with the same affinity exists. If yes, the activity goes there. If not, a new task is created.
- When `allowTaskReparenting="true"` is set, the activity can move between tasks. If Activity A with affinity for App X was started by App Y, and App X comes to foreground, Activity A moves to App X's task.

Task affinity does nothing on its own. It's only meaningful with `FLAG_ACTIVITY_NEW_TASK` or `allowTaskReparenting`.

#### What is a Sticky Intent? Is it still relevant?

Sticky Intent is a type of broadcast that remains active even after broadcasting. Other components can retrieve the last broadcast data at any time without being registered when the broadcast was sent. Typically used for system-level events like battery status or network changes.

`sendStickyBroadcast()` is deprecated since API 21. It had no security — any app could access or modify the sticky data, no protection against spoofing. Modern alternatives are `LiveData`, `StateFlow`, or checking system services directly like `BatteryManager`.

#### What is the difference between deep links and App Links?

Both use intent filters to route URIs to your app, but they differ in verification and user experience.

**Deep links** use custom schemes (like `myapp://product/42`) or HTTP/HTTPS URLs without verification. The system shows a disambiguation dialog. Any app can register any scheme.

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

**App Links** (Android 6.0+) use verified HTTPS domains. You host an `assetlinks.json` on your server with your app's signing certificate fingerprint. Once verified, HTTPS links open directly in your app — no disambiguation dialog.

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

#### Walk through the back stack behavior for each launch mode.

Start with a task stack: `Home → Search → Product`.

- **standard** — Launch Product again. Stack: Home → Search → Product → Product. Two instances. Back pops them one at a time.
- **singleTop** — Launch Product (already on top). Stack stays: Home → Search → Product. Existing instance gets `onNewIntent()`. But launching Search: Home → Search → Product → Search (new instance, Search wasn't on top).
- **singleTask** — Launch Home. Stack: Home. Search and Product are destroyed. Home gets `onNewIntent()`.
- **singleInstance** — If Product is singleInstance, it lives in its own task. Launching Settings from it opens Settings in a different task. Back from Settings goes to the previous task, not Product.

#### What happens when you use FLAG_ACTIVITY_CLEAR_TOP with standard launch mode?

The system destroys all activities above the target, and then also destroys the target itself and creates a new instance. It does not call `onNewIntent()`.

This happens because `standard` mode means "always create a new instance." `FLAG_ACTIVITY_CLEAR_TOP` clears the stack above but doesn't change the instantiation behavior.

To reuse the existing instance, pair it with `FLAG_ACTIVITY_SINGLE_TOP`:

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

This matters because clearing the stack expecting to return to an existing Home but instead recreating it causes the activity to lose its state.

#### What security concerns exist with implicit intents and PendingIntents?

Any app can declare an intent filter to intercept implicit intents. A malicious app could register a matching filter and capture sensitive data. This is why I always use explicit intents for Services. Starting with Android 5.0, the system throws an exception if you bind a Service with an implicit intent.

For PendingIntents, the concern is delegation. The system component executes the wrapped intent with your app's identity and permissions. If it wraps an implicit intent, the receiving component could be spoofed. Always wrap explicit intents inside PendingIntents.

A mutable PendingIntent (`FLAG_MUTABLE`) lets the receiving app modify extras before execution — potential privilege escalation. Android 12 added `StrictMode.detectUnsafeIntentLaunch()` to catch unsafe patterns during development.

Intent filters in the manifest are not a security mechanism. Any app that knows the component name can send an explicit intent directly to it, bypassing the filter. Use permissions or `android:exported="false"` to restrict access.

#### What is singleInstancePerTask?

Introduced in Android 12 (API 31), `singleInstancePerTask` acts as the root activity of a task and allows one instance per task. The key difference from `singleInstance` is that multiple instances can exist, each in a different task. With `singleInstance`, there's exactly one instance system-wide.

Using `FLAG_ACTIVITY_MULTIPLE_TASK` or `FLAG_ACTIVITY_NEW_DOCUMENT` lets the system create additional instances in new tasks. This was added for multi-window scenarios — split screen and freeform windows on tablets and Chromebooks — where `singleInstance` was too restrictive.

#### How do you handle deep links in a single-Activity architecture?

In a single-Activity app using Jetpack Navigation, deep links map to navigation destinations instead of Activities. You define them in the navigation graph using `<deepLink>` elements, and NavController handles routing.

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

This way, if the user lands on the product screen via a notification and presses Back, they go to the parent destination like Home instead of exiting the app.

#### What is a deferred deep link?

A deferred deep link routes to specific content in your app, but the app isn't installed yet. The flow: user clicks a link, gets redirected to the Play Store, installs the app, opens it, and lands on the intended content instead of the home screen.

Android doesn't have built-in deferred deep linking. The system only matches intent filters for installed apps. You typically use server-side redirect logic or a third-party service. The pattern is: your server redirects to the Play Store with a referrer parameter, the Play Store passes it to your app after installation via the Install Referrer API, and your app reads it on first launch to navigate to the right content.

#### How does `android:exported` affect intent delivery?

`android:exported` controls whether other apps can start your component. If `true`, any app can send an intent to it. If `false`, only your app (or apps with the same user ID) can.

Starting with Android 12, you must explicitly set `android:exported` for any component that declares an intent filter. If you forget, the build fails. Activities with `LAUNCHER` intent filters must be exported. Activities that only handle intents from within your own app should set `exported="false"`.

This is separate from intent filter matching. An exported component with an intent filter can receive both explicit and implicit intents from other apps. A non-exported component with an intent filter only receives intents from within your own app.

#### What's the difference between `FLAG_ACTIVITY_NEW_TASK` and `FLAG_ACTIVITY_CLEAR_TASK`?

`FLAG_ACTIVITY_NEW_TASK` starts the activity in a new task if one with the matching affinity doesn't exist, or brings the existing task to the foreground. The existing activities in the task are preserved.

`FLAG_ACTIVITY_CLEAR_TASK` clears the entire task before launching the activity. Every existing activity in the task is destroyed. This flag must be used together with `FLAG_ACTIVITY_NEW_TASK`.

```kotlin
// Common pattern: restart app from a fresh state (e.g., after logout)
val intent = Intent(this, LoginActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TASK
}
startActivity(intent)
```

I use `CLEAR_TASK` for scenarios like logout, where I want to wipe the entire back stack and start fresh from the login screen.

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
