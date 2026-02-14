---
title: "Intents, Intent Filters & Launch Modes"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 3
level: junior
sequence: 3
---

## Intents, Intent Filters & Launch Modes

Intents, intent filters, and launch modes are core concepts that define how Android components communicate and how the system manages tasks and back stack.

### Core Questions (Beginner → Intermediate)

#### Q1: What is an Intent in Android?

Intent is a message with data which is used for starting an activity and service, used in broadcast receivers etc. It acts like a communication bridge between Android components. It carries an action to perform, optional data as a URI, extras as key-value pairs, and flags that control behavior.

#### Q2: What's the difference between explicit and implicit intents?

- **Explicit Intent** — Used for making the communication within the app like starting a specific activity or service. You specify the exact component by class name.
- **Implicit Intent** — Used for making the communication between apps on the Android device. You declare a general action, and the system finds matching components across installed apps.

```kotlin
val intent = Intent(this, PaymentActivity::class.java)
intent.putExtra("orderId", "ORD-98234")
startActivity(intent)
```

```kotlin
val shareIntent = Intent(Intent.ACTION_SEND).apply {
    type = "text/plain"
    putExtra(Intent.EXTRA_TEXT, "Check out this article!")
}
startActivity(Intent.createChooser(shareIntent, "Share via"))
```

Explicit intents bypass intent filter matching entirely and deliver directly to the named component. Implicit intents trigger the full resolution process — action test, category test, and data test — against every declared intent filter on the device. You can also use an explicit intent to start a component in another app if you know the package and class name.

#### Q3: What are intent extras, and how do you pass data between Activities?

Extras are key-value pairs bundled inside the Intent. You use `putExtra()` to attach data and `getStringExtra()`, `getIntExtra()`, etc., to retrieve it on the receiving end. Under the hood, extras are stored in a `Bundle` which is a mapping of string keys to typed values.

```kotlin
// Sender
val intent = Intent(this, OrderDetailActivity::class.java).apply {
    putExtra("orderId", "ORD-98234")
    putExtra("totalAmount", 149.99)
    putExtra("isPremiumUser", true)
}
startActivity(intent)

// Receiver - in OrderDetailActivity
val orderId = intent.getStringExtra("orderId")
val total = intent.getDoubleExtra("totalAmount", 0.0)
val isPremium = intent.getBooleanExtra("isPremiumUser", false)
```

For complex objects, you need either `Parcelable` or `Serializable`.

#### Q4: Parcelable vs Serializable — when do you use which?

Parcelable and Serializable are both used for converting objects into byte streams so they can travel through Intents and Bundles.

**Parcelable** is an Android-specific interface. It writes data directly to a `Parcel` — a high-performance container optimized for IPC. It's faster, produces smaller payloads, and supports thread-safety. You can use `@Parcelize` from the Kotlin plugin to generate the marshalling logic at compile time.

```kotlin
@Parcelize
data class OrderItem(
    val productId: String,
    val name: String,
    val price: Double
) : Parcelable
```

**Serializable** is a Java standard interface. It uses reflection to serialize the object, which creates temporary objects and puts pressure on the garbage collector. It's slower, produces larger payloads, and doesn't support thread-safety. The only advantage is zero boilerplate.

Always use `Parcelable` on Android. `Serializable` only makes sense if you're sharing model classes with a pure Java/Kotlin backend module that has no Android dependency.

#### Q5: What's the difference between `setData()` and `putExtra()`?

`setData()` sets the Intent's data as a URI. The system uses this URI during intent filter matching — it's checked against the `<data>` elements in the filter. You typically use it with `ACTION_VIEW` to point to a resource like a web URL or content URI.

`putExtra()` attaches additional key-value data that the receiving component reads manually. Extras are never used in intent filter matching.

```kotlin
// setData — used for intent resolution
val viewIntent = Intent(Intent.ACTION_VIEW).apply {
    data = Uri.parse("https://example.com/products/42")
}

// putExtra — carried along but not matched
val detailIntent = Intent(this, ProductActivity::class.java).apply {
    putExtra("productId", 42)
    putExtra("source", "deep_link")
}
```

Calling `setData()` and `setType()` separately clears the other. If you need both a URI and a MIME type, use `setDataAndType()`.

#### Q6: What is an Intent Filter? How does the system match them?

Intent filter is declared in the manifest to specify the type of implicit intents a component can handle. When the system receives an implicit intent, it runs three tests against every declared filter:

- **Action test** — The intent's action must match at least one `<action>` listed in the filter.
- **Category test** — Every category in the intent must exist in the filter. The system automatically adds `CATEGORY_DEFAULT` to all implicit intents sent via `startActivity()`, so you must declare it in the filter.
- **Data test** — The intent's URI and MIME type are checked against `<data>` elements, involving scheme, host, port, path, and MIME type matching.

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

A component can have multiple intent filters. Only one filter needs to match for the component to receive the intent. Without `CATEGORY_DEFAULT`, your Activity will never receive implicit intents from `startActivity()`.

#### Q7: What is a PendingIntent?

Pending Intent is used for making a communication in future time. It wraps an Intent and grants another application or system component the ability to execute that Intent on your behalf, with your app's identity and permissions.

You create one using static factory methods based on the target component type:

```kotlin
// For launching an Activity
val activityPending = PendingIntent.getActivity(
    context, requestCode, intent,
    PendingIntent.FLAG_IMMUTABLE
)

// For starting a Service
val servicePending = PendingIntent.getService(
    context, requestCode, intent,
    PendingIntent.FLAG_IMMUTABLE
)

// For sending a Broadcast
val broadcastPending = PendingIntent.getBroadcast(
    context, requestCode, intent,
    PendingIntent.FLAG_IMMUTABLE
)
```

Generally, pending intents are used with notifications (system executes the intent when user taps it), AlarmManager (system fires the intent at a scheduled time), and AppWidgets (launcher process executes it on widget interaction). The execution is delegated to another process like NotificationManager or AlarmManager, and that process acts with your app's permissions.

#### Q8: What are FLAG_IMMUTABLE and FLAG_MUTABLE, and when do you use each?

Starting with Android 12 (API 31), every PendingIntent must explicitly declare whether it's mutable or immutable. Without specifying one, the system throws an `IllegalArgumentException`.

- **FLAG_IMMUTABLE** — The wrapped Intent cannot be modified by the receiving app or system component. Use this for almost everything — notifications, alarms, widgets.
- **FLAG_MUTABLE** — Allows the receiving component to fill in or modify extras on the Intent before execution. You need this for inline reply actions in notifications, Android Auto integration, and bubble conversations.

A mutable PendingIntent handed to another app means that app can modify the intent's data before it fires, which is a potential privilege escalation risk. Outside the specific cases listed above, always use `FLAG_IMMUTABLE`.

#### Q9: What is a Sticky Intent? Is it still relevant?

Sticky Intent is a type of broadcast that remains active even after broadcasting. Other components can retrieve the last broadcast data at any time without needing to be registered when the broadcast was originally sent. It is typically used for system-level broadcast events like battery status or network changes.

`sendStickyBroadcast()` is deprecated since API 21. It offered no security — any app could access or modify the sticky data, no protection against spoofing, and no way to know who sent it. Modern alternatives are `LiveData`, `StateFlow`, or checking system services directly like `BatteryManager`.

#### Q10: What are the four launch modes? Explain each.

Launch modes control how new instances of an Activity are created and associated with tasks. They're set via `android:launchMode` in the manifest.

- **standard** (default) — A new instance is created every time, regardless of whether one already exists. Stack A-B-C, launch C again → A-B-C-C.
- **singleTop** — If the activity is already at the top of the back stack, no new instance is created. Instead, `onNewIntent()` is called on the existing instance. If it's not at the top, a new instance is created normally. Stack A-B-C, launch C → A-B-C (existing C gets `onNewIntent`). Stack A-B-C, launch B → A-B-C-B.
- **singleTask** — Only one instance of this activity can exist in a task. If it exists, the system brings its task to the foreground, calls `onNewIntent()`, and all activities above it get destroyed. Stack A-B-C, launch A → A (B and C are finished).
- **singleInstance** — Same as singleTask, but the activity is the sole member of its task. No other activity can ever be launched into that task. Any activity started from it opens in a separate task.

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is singleInstancePerTask and how does it differ from singleInstance?

Introduced in Android 12 (API 31), `singleInstancePerTask` acts as the root activity of a task and allows only one instance per task. The key difference from singleInstance is that it can have multiple instances, each in a different task. With singleInstance, there's exactly one instance system-wide.

If you use `FLAG_ACTIVITY_MULTIPLE_TASK` or `FLAG_ACTIVITY_NEW_DOCUMENT`, the system can create additional instances in new tasks. This was added for multi-window scenarios like split screen and freeform windows on tablets and Chromebooks, where singleInstance was too restrictive. Like singleTask, it also destroys all activities above the starting activity when the existing instance receives a new intent.

#### Q12: How do Intent flags interact with manifest launch modes? Which takes priority?

Intent flags override manifest attributes when there's a conflict. If Activity A launches Activity B with a flag, and B has a different launch mode declared in its manifest, the flag from A's intent is honored.

The three critical flags:

- **FLAG_ACTIVITY_NEW_TASK** — Equivalent to `singleTask`. Starts the activity in a new task, or brings an existing task with the same affinity to the foreground. Required when launching an Activity from a non-Activity context like a Service or BroadcastReceiver.
- **FLAG_ACTIVITY_SINGLE_TOP** — Equivalent to `singleTop`. Prevents a new instance if the activity is already on top.
- **FLAG_ACTIVITY_CLEAR_TOP** — No manifest equivalent. If the activity already exists in the current task, all activities above it are destroyed. Combined with `FLAG_ACTIVITY_SINGLE_TOP`, the existing instance receives `onNewIntent()`. Without it, the activity itself is also destroyed and recreated.

```kotlin
// Common pattern: return to a root activity, clearing everything above
val intent = Intent(this, HomeActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
}
startActivity(intent)
```

#### Q13: What is task affinity and how does it affect launch behavior?

Task affinity is a string attribute (`android:taskAffinity`) that determines which task an activity prefers to belong to. By default, all activities in the same app share the app's package name as their affinity.

Task affinity is relevant in two situations:

- When you launch an activity with `FLAG_ACTIVITY_NEW_TASK`, the system checks if a task with the same affinity already exists. If yes, the activity is placed there. If not, a new task is created.
- When an activity has `allowTaskReparenting="true"`, it can move from one task to another. If Activity A with affinity for App X was started by App Y, and App X comes to the foreground, Activity A moves from App Y's task to App X's task.

Task affinity is only meaningful alongside `FLAG_ACTIVITY_NEW_TASK` or `allowTaskReparenting`. On its own, changing the affinity string does nothing visible.

#### Q14: Walk through the back stack behavior for each launch mode with a concrete example.

Start with a task stack: `HomeActivity → SearchActivity → ProductActivity`.

- **standard** — Launch `ProductActivity` again. Stack: Home → Search → Product → Product. Two instances exist. Back button pops them one at a time.
- **singleTop** — Launch `ProductActivity` (already on top). Stack stays: Home → Search → Product. Existing instance receives `onNewIntent()`. But launching `SearchActivity` instead: Home → Search → Product → Search (new instance, Search was not on top).
- **singleTask** — Launch `HomeActivity`. Stack: Home. SearchActivity and ProductActivity are destroyed. HomeActivity receives `onNewIntent()`.
- **singleInstance** — If ProductActivity is singleInstance, it lives in its own task. Launching `SettingsActivity` from it opens Settings in a different task. Pressing back from Settings goes to the previous activity in that other task, not back to Product.

#### Q15: How do you handle deep links vs App Links? What's the real-world difference?

Both use intent filters to route URIs to your app, but they differ in verification and user experience.

**Deep links** use custom URI schemes (like `myapp://product/42`) or standard HTTP/HTTPS URLs without verification. The system shows a disambiguation dialog asking the user which app should handle it. Any app can register to handle any scheme.

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

**App Links** (Android 6.0+) use verified HTTPS domains. You host an `assetlinks.json` file on your server that contains your app's signing certificate fingerprint. The system verifies this at install time, and once verified, HTTPS links to your domain open directly in your app without a disambiguation dialog.

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

The `android:autoVerify="true"` attribute triggers the verification process. Without it, even HTTPS links behave like regular deep links with the disambiguation dialog.

#### Q16: What happens inside onNewIntent()? What do you need to be careful about?

When a launch mode or flag prevents a new instance from being created, the system calls `onNewIntent()` on the existing Activity with the new Intent. `getIntent()` still returns the original Intent that first created the Activity, not the new one. You must call `setIntent(newIntent)` explicitly if you want `getIntent()` to reflect the latest data.

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent) // Update the stored intent
    val updatedProductId = intent.getStringExtra("productId")
    loadProduct(updatedProductId)
}
```

`onNewIntent()` is called before `onResume()`. If the Activity was stopped, the sequence is `onNewIntent()` → `onRestart()` → `onStart()` → `onResume()`. If it was paused, it's `onNewIntent()` → `onResume()`. You can safely read the new intent data in `onResume()` if you call `setIntent()` inside `onNewIntent()`.

The user cannot press Back to return to the state before `onNewIntent()` was called — the previous intent data is gone.

#### Q17: How do you handle deep links in a single-Activity architecture with Navigation Component?

In a single-Activity app using Jetpack Navigation, deep links map to navigation destinations rather than Activities. You define them in the navigation graph using `<deepLink>` elements, and the NavController handles routing.

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

For creating deep links programmatically (useful for notifications), `NavDeepLinkBuilder` constructs the correct back stack:

```kotlin
val pendingIntent = NavDeepLinkBuilder(context)
    .setGraph(R.navigation.main_graph)
    .setDestination(R.id.productFragment)
    .setArguments(bundleOf("productId" to "PRD-42"))
    .createPendingIntent()
```

`NavDeepLinkBuilder` creates a synthetic back stack so if the user lands on the product screen via a notification and presses Back, they navigate to the parent destination like Home instead of exiting the app.

#### Q18: Explain deferred deep links. How do you handle a deep link when your app isn't installed?

A deferred deep link routes to specific content in your app, but the app isn't installed yet. The flow is: user clicks a link, gets redirected to the Play Store, installs the app, opens it, and then sees the intended content instead of just the home screen.

Android doesn't have a built-in deferred deep linking mechanism. The system can only match intent filters for installed apps. You typically use a third-party service like Branch.io or server-side redirect logic. These services store the link data server-side, detect whether the app is installed, redirect through the Play Store if needed, and deliver the stored link data on first app open.

The implementation pattern is: your server redirects to the Play Store with a referrer parameter, the Play Store passes that referrer to your app after installation via the Install Referrer API, and your app reads it on first launch to navigate to the intended content.

#### Q19: What security concerns exist with implicit intents and PendingIntents?

Implicit intents have a fundamental security gap — any app can declare an intent filter to intercept them. If you send sensitive data via an implicit intent, a malicious app could register a matching filter and capture it. This is why you should always use explicit intents for Services. Starting with Android 5.0, the system throws an exception if you try to bind a Service with an implicit intent.

For PendingIntents, the concern is delegation. When you hand a PendingIntent to the NotificationManager or AlarmManager, that system component executes the wrapped intent with your app's identity and permissions. If the PendingIntent wraps an implicit intent, the receiving component could be spoofed. Always wrap explicit intents inside PendingIntents.

A mutable PendingIntent (`FLAG_MUTABLE`) allows the receiving app to modify the intent's extras before execution, which could be exploited for privilege escalation. Android 12 introduced `StrictMode.detectUnsafeIntentLaunch()` to flag unsafe patterns during development.

Intent filters declared in the manifest are not a security mechanism. Any app that knows the component name can send an explicit intent directly to it, bypassing the filter entirely. If you need to restrict access, use permissions or set `android:exported="false"`.

#### Q20: If you have a standard-mode Activity and you use FLAG_ACTIVITY_CLEAR_TOP, what happens? Why does it matter?

With `standard` launch mode and `FLAG_ACTIVITY_CLEAR_TOP`, the system destroys all activities above the target in the stack, and then also destroys the target itself and creates a new instance. It does not call `onNewIntent()`.

This happens because `standard` mode means "always create a new instance for a new intent." `FLAG_ACTIVITY_CLEAR_TOP` clears the stack above but doesn't change the instantiation behavior of the launch mode.

To reuse the existing instance, pair the flag with `FLAG_ACTIVITY_SINGLE_TOP`:

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

This matters in practice because clearing the stack expecting to return to an existing Home screen but instead recreating it causes the activity to lose its state.

### Common Follow-ups

- How would you choose between using a launch mode in the manifest vs using intent flags?
- What happens if you launch a singleTask activity from a different app? Which task comes to the foreground?
- Can two activities in the same app have different task affinities? When would you want that?
- How do you test deep links during development? What tools does Android provide?
- What's the difference between `FLAG_ACTIVITY_NEW_TASK` and `FLAG_ACTIVITY_CLEAR_TASK`?
- How does the back button behave in multi-window mode with different launch modes?
- If your app targets Android 12+ and you forget to specify PendingIntent mutability, what happens?
- How do you verify that App Links are correctly configured? What can go wrong with the verification?
- What's the lifecycle sequence when an Activity receives `onNewIntent()` while stopped vs while paused?
- How does `CATEGORY_BROWSABLE` differ from `CATEGORY_DEFAULT` in intent filters?
