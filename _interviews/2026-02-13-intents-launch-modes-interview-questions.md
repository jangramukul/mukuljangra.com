---
title: "Intents, Intent Filters & Launch Modes — Top Interview Questions"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 3
---

## Intents, Intent Filters & Launch Modes — What Interviewers Really Ask

Intents and launch modes come up in almost every Android technical round. Interviewers use them to gauge whether you actually understand how Android components communicate, how the system manages tasks, and whether you've dealt with real navigation bugs in production.

### Core Questions (Beginner → Intermediate)

#### Q1: What is an Intent in Android?

An Intent is a messaging object that Android uses to request an action from another component. You can think of it as the communication bridge between Activities, Services, and BroadcastReceivers. It carries an action to perform, optional data (as a URI), extras (key-value pairs), and flags that control behavior. Every time you start an Activity, bind a Service, or send a broadcast, you're using an Intent under the hood.

#### Q2: What's the difference between explicit and implicit intents?

An explicit intent specifies the exact component by class name. You use it for communication within your own app — starting a specific Activity or Service where you know the target.

```kotlin
val intent = Intent(this, PaymentActivity::class.java)
intent.putExtra("orderId", "ORD-98234")
startActivity(intent)
```

An implicit intent declares a general action without naming a target component. The system finds all components across installed apps whose intent filters match, and either launches the single match or shows a chooser dialog.

```kotlin
val shareIntent = Intent(Intent.ACTION_SEND).apply {
    type = "text/plain"
    putExtra(Intent.EXTRA_TEXT, "Check out this article!")
}
startActivity(Intent.createChooser(shareIntent, "Share via"))
```

The key distinction interviewers look for: explicit intents bypass intent filter matching entirely. The system delivers them directly to the named component. Implicit intents trigger the full resolution process — action test, category test, and data test — against every declared intent filter on the device. One common mistake candidates make is saying "implicit intents are for other apps and explicit intents are for your app." That's the common pattern, but it's not a rule. You can use an explicit intent to start a component in another app if you know the package and class name.

#### Q3: What are intent extras, and how do you pass data between Activities?

Extras are key-value pairs bundled inside the Intent. You use `putExtra()` to attach data and `getStringExtra()`, `getIntExtra()`, etc., to retrieve it on the receiving end. Under the hood, extras are stored in a `Bundle`, which is essentially a mapping of string keys to typed values.

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

For complex objects, you need either `Parcelable` or `Serializable`. This is a natural follow-up interviewers love to chain into.

#### Q4: Parcelable vs Serializable — when do you use which?

Both convert objects to byte streams so they can travel through Intents and Bundles. The difference is how they do it and what it costs.

**Parcelable** is Android-specific. It writes data directly to a `Parcel` — a high-performance container optimized for IPC (inter-process communication). It's faster, produces smaller payloads, and is thread-safe. The tradeoff is you have to implement the marshalling logic yourself (or use `@Parcelize` from the Kotlin plugin, which generates it at compile time).

```kotlin
@Parcelize
data class OrderItem(
    val productId: String,
    val name: String,
    val price: Double
) : Parcelable
```

**Serializable** is a Java standard interface. It uses reflection to serialize the object, which creates temporary objects during the process and puts pressure on the garbage collector. It's slower, produces larger payloads, and is not thread-safe. The only advantage is zero boilerplate — just implement the marker interface.

In interviews, the answer is straightforward: always use `Parcelable` on Android. Use `@Parcelize` to eliminate the boilerplate argument. The only situation where `Serializable` makes sense is if you're sharing model classes with a pure Java/Kotlin backend module that has no Android dependency.

#### Q5: What's the difference between `setData()` and `putExtra()`?

`setData()` sets the Intent's data as a URI. The system uses this URI during intent filter matching — it's checked against the `<data>` elements in the filter. You typically use it with `ACTION_VIEW` to point to a resource: a web URL, a content URI, a custom scheme.

`putExtra()` attaches additional key-value data that the receiving component reads manually. Extras are never used in intent filter matching — the system ignores them entirely during resolution.

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

A common gotcha: calling `setData()` and `setType()` separately clears the other. If you need both a URI and a MIME type, use `setDataAndType()`.

#### Q6: What is an Intent Filter? How does the system match them?

An intent filter is declared in the manifest to advertise what kinds of implicit intents a component can handle. When the system receives an implicit intent, it runs three tests against every declared filter.

**Action test** — The intent's action must match at least one `<action>` listed in the filter. If the filter has no actions, nothing matches. If the intent has no action, it passes as long as the filter declares at least one action.

**Category test** — Every category in the intent must exist in the filter. But the filter can have extra categories the intent doesn't — that's fine. The system automatically adds `CATEGORY_DEFAULT` to all implicit intents sent via `startActivity()`, which is why you must declare it in the filter.

**Data test** — The intent's URI and MIME type are checked against `<data>` elements. This is the most complex test, involving scheme, host, port, path, and MIME type matching.

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

A component can have multiple intent filters. Only one filter needs to match for the component to receive the intent. A mistake candidates often make is forgetting `CATEGORY_DEFAULT` — without it, your Activity will never receive implicit intents from `startActivity()`.

#### Q7: What is a PendingIntent?

A PendingIntent is a wrapper around an Intent that grants another application or system component the ability to execute that Intent on your behalf, with your app's identity and permissions. It's essentially a token for future execution.

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

The three primary use cases are notifications (the system executes the intent when the user taps it), AlarmManager (the system fires the intent at a scheduled time), and AppWidgets (the launcher process executes it on widget interaction). The critical thing interviewers want to hear is that PendingIntent delegates execution to another process — the NotificationManager, AlarmManager, or a home screen launcher — and that process acts with your app's permissions.

#### Q8: What are FLAG_IMMUTABLE and FLAG_MUTABLE, and when do you use each?

Starting with Android 12 (API 31), every PendingIntent must explicitly declare whether it's mutable or immutable. If you don't specify one, the system throws an `IllegalArgumentException`.

**FLAG_IMMUTABLE** means the wrapped Intent cannot be modified by the receiving app or system component. This is the default you should use for almost everything — notifications, alarms, widgets. It's the more secure option.

**FLAG_MUTABLE** allows the receiving component to fill in or modify extras on the Intent before execution. You need this for specific cases: inline reply actions in notifications (the system needs to add the user's reply text), Android Auto integration, and bubble conversations. Outside these cases, always use `FLAG_IMMUTABLE`.

The security angle matters in interviews — a mutable PendingIntent handed to another app means that app can modify the intent's data before it fires. That's a potential privilege escalation vector.

#### Q9: What is a Sticky Intent? Is it still relevant?

A sticky intent is a broadcast that remains in the system after being sent. Other components can retrieve the last broadcast data at any time without needing to be registered when the broadcast was originally sent. The classic example is `ACTION_BATTERY_CHANGED` — you can get the current battery level even if you register your receiver after the system broadcast it.

The important detail for interviews: `sendStickyBroadcast()` is deprecated since API 21. It was never a great API — it offered no security (any app could access or modify the sticky data), no protection against spoofing, and no way to know who sent it. Modern alternatives are `LiveData`, `StateFlow`, or checking system services directly (like `BatteryManager`). If an interviewer asks about sticky intents, acknowledge what they were, then explain why they were deprecated and what replaced them. That shows you understand the evolution of the platform.

#### Q10: What are the four launch modes? Explain each.

Launch modes control how new instances of an Activity are created and associated with tasks. They're set via `android:launchMode` in the manifest.

**standard** (default) — A new instance is created every single time, regardless of whether one already exists. The new instance is pushed onto the current task's back stack. If your stack is A-B-C and you launch C again, you get A-B-C-C. Most activities should use this.

**singleTop** — If the activity is already at the top of the back stack, no new instance is created. Instead, the existing instance receives the intent through `onNewIntent()`. If it's not at the top, a new instance is created normally. Stack A-B-C, launch C: you get A-B-C (existing C gets `onNewIntent`). Stack A-B-C, launch B: you get A-B-C-B (new instance, because B wasn't on top). Common use case is a search results screen or a notification landing activity — you don't want duplicates stacking up.

**singleTask** — Only one instance of this activity can exist across the system. If it exists anywhere, the system brings its task to the foreground and calls `onNewIntent()`. All activities above it in the stack get destroyed. Stack A-B-C, launch A with singleTask: you get A (B and C are finished). This is aggressive — use it when you need a single entry point like an email inbox.

**singleInstance** — Same as singleTask, but the activity is the sole member of its task. No other activity can ever be launched into that task. Any activity started from a singleInstance activity will open in a separate task. This is rare — the phone dialer is the classic example.

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is singleInstancePerTask and how does it differ from singleInstance?

Introduced in Android 12 (API 31), `singleInstancePerTask` acts as the root activity of a task and allows only one instance per task — similar to singleInstance. The key difference is that it can have multiple instances, each in a different task. With singleInstance, there's exactly one instance system-wide. With singleInstancePerTask, if you use `FLAG_ACTIVITY_MULTIPLE_TASK` or `FLAG_ACTIVITY_NEW_DOCUMENT`, the system can create additional instances in new tasks.

This was added because singleInstance was too restrictive for multi-window scenarios (split screen, freeform windows on tablets and Chromebooks). singleInstancePerTask gives you the "sole activity in its task" isolation without the global singleton constraint. Like singleTask, it also destroys all activities above the starting activity when the existing instance receives a new intent.

#### Q12: How do Intent flags interact with manifest launch modes? Which takes priority?

Intent flags override manifest attributes when there's a conflict. If Activity A launches Activity B with a flag, and B has a different launch mode declared in its manifest, the flag from A's intent is honored.

The three critical flags to know:

**FLAG_ACTIVITY_NEW_TASK** — Equivalent to `singleTask` in the manifest. Starts the activity in a new task, or brings an existing task with the same affinity to the foreground. If you launch an Activity from a non-Activity context (like a Service or BroadcastReceiver), you must include this flag because there's no existing task to place it in.

**FLAG_ACTIVITY_SINGLE_TOP** — Equivalent to `singleTop` in the manifest. Prevents a new instance if the activity is already on top.

**FLAG_ACTIVITY_CLEAR_TOP** — Has no manifest equivalent. If the activity already exists in the current task, all activities above it are destroyed. Combined with `FLAG_ACTIVITY_SINGLE_TOP`, the existing instance receives `onNewIntent()`. Without `FLAG_ACTIVITY_SINGLE_TOP`, the activity itself is also destroyed and recreated — because the default `standard` mode always creates a new instance.

```kotlin
// Common pattern: return to a root activity, clearing everything above
val intent = Intent(this, HomeActivity::class.java).apply {
    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
}
startActivity(intent)
```

A gotcha that trips up candidates: `FLAG_ACTIVITY_CLEAR_TOP` with a `standard` mode activity doesn't reuse the existing instance. It finishes the old one and creates a new one. You need to pair it with `FLAG_ACTIVITY_SINGLE_TOP` (or set `singleTop` in the manifest) to get the `onNewIntent()` behavior.

#### Q13: What is task affinity and how does it affect launch behavior?

Task affinity is a string attribute (`android:taskAffinity`) that determines which task an activity "prefers" to belong to. By default, all activities in the same app share the app's package name as their affinity. Two situations make affinity relevant.

First, when you launch an activity with `FLAG_ACTIVITY_NEW_TASK`, the system checks if a task with the same affinity already exists. If it does, the activity is placed in that existing task. If not, a new task is created. This is how the system decides which task to associate a new activity with.

Second, when an activity has `allowTaskReparenting="true"`, it can move from one task to another. If Activity A (with affinity for App X's task) was started by App Y, and then App X comes to the foreground, Activity A silently moves from App Y's task to App X's task. The classic example from the docs is a travel app with a weather activity — it can be started from any app, but it re-parents to the travel app's task when the user switches to it.

In interviews, the key point is that task affinity is only meaningful alongside `FLAG_ACTIVITY_NEW_TASK` or `allowTaskReparenting`. On its own, changing the affinity string does nothing visible.

#### Q14: Walk through the back stack behavior for each launch mode with a concrete example.

Start with a task stack: `HomeActivity → SearchActivity → ProductActivity`.

**standard** — Launch `ProductActivity` again. Stack becomes: Home → Search → Product → Product. Two instances of ProductActivity exist. Back button pops them one at a time.

**singleTop** — Launch `ProductActivity` (which is on top). Stack stays: Home → Search → Product. The existing ProductActivity receives `onNewIntent()`. But if you launch `SearchActivity` instead: Home → Search → Product → Search. New instance created because Search was not on top.

**singleTask** — Launch `HomeActivity`. Stack becomes: Home. Both SearchActivity and ProductActivity are destroyed. HomeActivity receives `onNewIntent()`. The back button now exits the app because Home is the only activity in the stack.

**singleInstance** — If ProductActivity is singleInstance, it lives in its own task. If you launch `SettingsActivity` from it, Settings opens in a different task. The user pressing back from Settings doesn't go back to Product — it goes to the previous activity in that other task. This is the most confusing mode for users and developers alike.

#### Q15: How do you handle deep links vs App Links? What's the real-world difference?

Both use intent filters to route URIs to your app, but they differ in trust and user experience.

**Deep links** use custom URI schemes (like `myapp://product/42`) or standard HTTP/HTTPS URLs without verification. When the system encounters a matching URI, it shows a disambiguation dialog asking the user which app should handle it. Any app can register to handle any scheme — there's no ownership verification.

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

**App Links** (Android 6.0+) use verified HTTPS domains. You host a `assetlinks.json` file on your server at `https://yourdomain.com/.well-known/assetlinks.json` that contains your app's signing certificate fingerprint. The system verifies this association at install time. Once verified, HTTPS links to your domain open directly in your app — no disambiguation dialog. This is the approach you should use for any web domain you own.

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

The `android:autoVerify="true"` attribute triggers the verification process. Without it, even HTTPS links behave like regular deep links with the disambiguation dialog. A common interview mistake is conflating deep links and App Links — they're related but the verification mechanism is what separates them.

#### Q16: What happens inside onNewIntent()? What do you need to be careful about?

When a launch mode or flag prevents a new instance from being created, the system calls `onNewIntent()` on the existing Activity with the new Intent. The critical detail is that `getIntent()` still returns the original Intent that first created the Activity — not the new one. You must call `setIntent(newIntent)` explicitly if you want `getIntent()` to reflect the latest data.

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent) // Update the stored intent
    val updatedProductId = intent.getStringExtra("productId")
    loadProduct(updatedProductId)
}
```

The lifecycle implication is also important: `onNewIntent()` is called before `onResume()`. If your Activity was in the stopped state, the sequence is `onNewIntent()` → `onRestart()` → `onStart()` → `onResume()`. If it was paused (partially visible), it's `onNewIntent()` → `onResume()`. This means you can safely read the new intent data in `onResume()` if you call `setIntent()` inside `onNewIntent()`.

Another gotcha: the user cannot press Back to return to the state before `onNewIntent()` was called. The previous intent data is gone. If your activity behavior depends heavily on the incoming intent, make sure the user experience makes sense when the underlying data changes without a navigation transition.

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

The advantage here is that `NavDeepLinkBuilder` creates a synthetic back stack. If the user lands on the product screen via a notification and presses Back, they navigate to the parent destination (like Home) instead of exiting the app. Without this, deep links into the middle of your app leave users stranded with no logical back navigation.

#### Q18: Explain deferred deep links. How do you handle a deep link when your app isn't installed?

A deferred deep link is a link that should route to specific content in your app, but the app isn't installed yet. The standard flow is: user clicks a link, gets redirected to the Play Store, installs the app, opens it, and then sees the intended content — not just the home screen.

Android doesn't have a built-in deferred deep linking mechanism. The system can only match intent filters for installed apps. To support deferred deep links, you typically use a third-party service like Firebase Dynamic Links (now deprecated in favor of App Links with server-side redirect logic) or Branch.io. These services work by storing the link data server-side, detecting whether the app is installed, redirecting through the Play Store if needed, and then delivering the stored link data on first app open.

The implementation pattern is: your server redirects to the Play Store with a referrer parameter, the Play Store passes that referrer to your app after installation via the Install Referrer API, and your app reads it on first launch to navigate to the intended content. It's a multi-hop flow with no single clean API, which is exactly why interviewers ask about it — they want to see if you understand the real-world complexity beyond the happy path.

#### Q19: What security concerns exist with implicit intents and PendingIntents?

Implicit intents have a fundamental security gap: any app can declare an intent filter to intercept them. If you send sensitive data via an implicit intent, a malicious app could register a matching filter and capture it. This is why you should always use explicit intents for Services — starting with Android 5.0, the system actually throws an exception if you try to bind a Service with an implicit intent.

For PendingIntents, the security concern is delegation. When you hand a PendingIntent to the NotificationManager or AlarmManager, that system component executes the wrapped intent with your app's identity and permissions. If the PendingIntent wraps an implicit intent, the receiving component could be spoofed. Always wrap explicit intents inside PendingIntents.

The `FLAG_MUTABLE` concern is another layer — a mutable PendingIntent allows the receiving app to modify the intent's extras before execution, which could be exploited for privilege escalation. Android 12 introduced `StrictMode.detectUnsafeIntentLaunch()` to flag unsafe patterns during development.

Another subtle point: intent filters declared in the manifest are not a security mechanism. Even with `android:exported="true"` and intent filters, any app that knows the component name can send an explicit intent directly to it, bypassing the filter entirely. If you need to restrict access, use permissions or set `android:exported="false"`.

#### Q20: If you have a standard-mode Activity and you use FLAG_ACTIVITY_CLEAR_TOP, what happens? Why does it matter?

This is a trap that catches many candidates. With `standard` launch mode and `FLAG_ACTIVITY_CLEAR_TOP`, the system destroys all activities above the target activity in the stack, and then also destroys the target itself and creates a new instance. It does not call `onNewIntent()`.

Why? Because `standard` mode means "always create a new instance for a new intent." The system respects that. `FLAG_ACTIVITY_CLEAR_TOP` clears the stack above, but it doesn't change the instantiation behavior of the launch mode.

To get the reuse-existing-instance behavior you probably wanted, pair the flag with `FLAG_ACTIVITY_SINGLE_TOP`:

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

This is the kind of edge case that causes real bugs in production — a developer clears the stack expecting to return to an existing Home screen, but instead the Home activity is recreated, losing its state.

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

### Tips for the Interview

1. **Draw the back stack** — When explaining launch modes, sketch the stack state before and after. Interviewers love visual thinkers. Say "stack is A-B-C, intent for B arrives, now it's A-B" while drawing it. It eliminates ambiguity and shows you actually understand what happens.

2. **Know the gotchas, not just the definitions** — Every candidate can recite the four launch modes. What separates strong candidates is knowing that `FLAG_ACTIVITY_CLEAR_TOP` with standard mode destroys and recreates the target, or that `setData()` and `setType()` cancel each other. Lead with the non-obvious behavior.

3. **Connect intents to real features** — When asked about PendingIntent, don't just give the definition. Say "I used this for notification actions in our messaging app" or "We used FLAG_IMMUTABLE for all our AlarmManager intents after targeting Android 12." Concrete examples signal production experience.

4. **Explain the security angle** — Most candidates skip security entirely. Mentioning that implicit intents can be intercepted, that intent filters aren't security boundaries, and that mutable PendingIntents are a privilege escalation risk shows you think about Android from a systems perspective, not just a tutorial perspective.

5. **Know the modern alternatives** — If asked about sticky intents, explain what they were and why they're deprecated. If asked about deep links, distinguish between custom schemes and verified App Links. Showing awareness of platform evolution signals a senior mindset.

---

*You already know this material better than you think. The interview isn't testing whether you memorized definitions — it's testing whether you've actually built apps that navigate between screens, handle notifications, and deal with back stack bugs at 2 AM. Trust your experience, and explain the "why" behind every answer.*
