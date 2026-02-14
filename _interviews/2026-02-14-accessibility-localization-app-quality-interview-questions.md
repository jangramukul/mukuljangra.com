---
title: "Accessibility, Localization & App Quality"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 30
sequence: 30
description: "These topics come up in interviews when companies want to know if you build apps that work for everyone, not just the default case."
---

## Accessibility, Localization & App Quality

These topics come up in interviews when companies want to know if you build apps that work for everyone, not just the default case. Expect questions on TalkBack, content descriptions, RTL layouts, string resources, Android vitals, and crash reporting.

### Core Questions (Beginner → Intermediate)

#### Q1: What is accessibility in Android and why does it matter?

Accessibility means making your app usable for people with visual, motor, hearing, or cognitive disabilities. Android provides accessibility services like TalkBack (screen reader), Switch Access (for users with motor impairments), and BrailleBack. As a developer, your job is to provide enough information in the UI so these services can describe and navigate the app for the user.

#### Q2: What is contentDescription and when should you use it?

`contentDescription` is a string attribute on views like `ImageView` and `ImageButton` that tells screen readers what the element represents. TalkBack reads this aloud when the user focuses on the element. You should set it on all meaningful visual elements. For decorative elements that don't convey information, set `contentDescription` to `null` or mark them with `importantForAccessibility="no"` so TalkBack skips them.

```kotlin
// Meaningful icon — needs a description
binding.settingsIcon.contentDescription = getString(R.string.settings)

// Decorative background image — should be skipped
binding.headerImage.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
```

#### Q3: What is TalkBack and how does it work?

TalkBack is Android's built-in screen reader. It reads aloud the content descriptions, text, and roles of UI elements as the user navigates by swiping left or right. TalkBack uses the accessibility tree, which Android builds from the view hierarchy and the semantic information you provide. When TalkBack focuses on a button, it announces the content description, the element type (like "button"), and any state (like "disabled"). Users interact by double-tapping to click or using swipe gestures.

#### Q4: What is the minimum touch target size recommended by Android?

Android recommends a minimum touch target of 48dp x 48dp for all interactive elements. This applies to buttons, checkboxes, icons, and any tappable area. You can achieve this even with visually smaller elements by adding padding. The Accessibility Scanner tool flags elements that don't meet this minimum.

#### Q5: What are content descriptions best practices?

- Don't include the element type in the description. TalkBack already announces "button" or "image" automatically. So use "Settings" not "Settings button".
- Keep descriptions short and meaningful.
- Each description should be unique within its context. If you have a list of items, each item's description should reflect its unique content.
- Use `null` or `importantForAccessibility="no"` for purely decorative elements.
- For toggle elements, include the current state in the description or use `stateDescription`.

#### Q6: How do you handle localization using string resources?

All user-facing strings should be in `res/values/strings.xml`, not hardcoded in code. For other languages, you create locale-specific resource folders like `res/values-fr/strings.xml` for French or `res/values-ja/strings.xml` for Japanese. Android automatically picks the right file based on the device locale. You must always have a complete default `strings.xml` because if a string is missing from both the locale-specific and default file, the app crashes.

```kotlin
// Always reference strings from resources
val welcomeMessage = getString(R.string.welcome_message)

// Never hardcode user-facing text
// val welcomeMessage = "Welcome" // Don't do this
```

#### Q7: How do you handle plurals in string resources?

Android provides the `<plurals>` resource for quantity-dependent strings. Different languages have different plural rules. English has two forms (one, other), but some languages like Arabic have six forms.

```xml
<plurals name="unread_messages">
    <item quantity="one">%d unread message</item>
    <item quantity="other">%d unread messages</item>
</plurals>
```

```kotlin
val count = 5
val message = resources.getQuantityString(R.plurals.unread_messages, count, count)
```

The `quantity` values are `zero`, `one`, `two`, `few`, `many`, and `other`. You should always include `other` as a fallback since it is required. Not every language uses all quantity types, but Android handles the selection based on the device locale.

#### Q8: What is RTL (Right-to-Left) support and how do you implement it?

RTL support is for languages like Arabic, Hebrew, and Persian that are read from right to left. Enable it by setting `android:supportsRtl="true"` in the manifest. Then replace `Left/Right` attributes with `Start/End` — use `marginStart` instead of `marginLeft`, `paddingEnd` instead of `paddingRight`, and `layout_alignParentStart` instead of `layout_alignParentLeft`. Android mirrors the layout automatically based on the device locale. You can test RTL by enabling "Force RTL layout direction" in Developer Options.

#### Q9: What is StrictMode and how does it help with app quality?

StrictMode is a developer tool that detects accidental disk or network access on the main thread. It has two policies — `ThreadPolicy` for thread-level violations (disk reads, disk writes, network calls on UI thread) and `VmPolicy` for process-level violations (leaked SQLite cursors, leaked closeable objects, Activity leaks). You enable it in `Application.onCreate()` during development and it logs violations or crashes the app so you catch issues early.

```kotlin
class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectDiskReads()
                    .detectDiskWrites()
                    .detectNetwork()
                    .penaltyLog()
                    .build()
            )
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder()
                    .detectLeakedSqlLiteObjects()
                    .detectLeakedClosableObjects()
                    .detectActivityLeaks()
                    .penaltyLog()
                    .build()
            )
        }
    }
}
```

StrictMode should only be enabled in debug builds. It is not a security mechanism and is not guaranteed to catch everything, but it catches the most common accidental main-thread violations.

#### Q10: What are Android vitals?

Android vitals is a quality monitoring system in Google Play Console. It tracks app stability, performance, and battery usage from real user devices. The core vitals are user-perceived crash rate, user-perceived ANR rate, and excessive partial wake locks. If your app exceeds bad behavior thresholds (crash rate above 1.09%, ANR rate above 0.47%), Google Play may reduce your app's visibility and show warnings on your store listing. Android vitals uses a 28-day rolling window, so improvements take time to reflect.

### Deep Dive Questions (Advanced → Expert)

#### Q11: How do semantics work in Jetpack Compose for accessibility?

In Compose, semantics is how you provide meaning and context to composables for accessibility services. Every composable can have semantic properties like `contentDescription`, `role`, `stateDescription`, and `heading`. Material components come with built-in semantics — a `Switch` automatically has a `Role.Switch`, toggleable state, and click action. For custom composables, you add semantics using the `Modifier.semantics` block.

```kotlin
@Composable
fun ProfileImage(userName: String) {
    Image(
        painter = painterResource(R.drawable.profile),
        contentDescription = "$userName profile photo",
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
    )
}

@Composable
fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.headlineSmall,
        modifier = Modifier.semantics { heading() }
    )
}
```

The `heading()` semantic is useful for long scrollable screens. TalkBack lets users jump between headings, which is much faster than swiping through every element. For toggleable custom components, use `stateDescription` to override the default "On/Off" labels with context-specific descriptions like "Subscribed/Not subscribed".

#### Q12: How do you merge and clear semantics in Compose?

By default, Compose creates a separate accessibility node for every composable that has semantics. But sometimes you want to group related composables into a single accessible element. Use `Modifier.semantics(mergeDescendants = true)` on the parent to merge all children's semantics into one node. TalkBack will read the combined content as a single item.

```kotlin
@Composable
fun ArticleCard(title: String, author: String, date: String) {
    Row(
        modifier = Modifier
            .semantics(mergeDescendants = true) { }
            .clickable { openArticle() }
    ) {
        Column {
            Text(text = title)
            Text(text = "by $author")
            Text(text = date)
        }
    }
}
```

Without merging, TalkBack would focus on each `Text` separately, requiring three swipes. With merging, it reads all three as one item. To exclude a decorative child from the merged result, use `Modifier.clearAndSetSemantics { }` on that child.

#### Q13: What are live regions and custom accessibility actions in Compose?

Live regions tell accessibility services to announce content changes automatically without the user navigating to the element. Use `LiveRegionMode.Polite` for non-urgent updates like a new message badge, and `LiveRegionMode.Assertive` for critical alerts. Use assertive mode sparingly because it interrupts whatever TalkBack is currently reading.

Custom accessibility actions replace complex gestures that some users can't perform. If you have a swipe-to-dismiss list item, the swipe gesture is impossible for Switch Access users. You add a custom action so the same operation is available through the accessibility menu.

```kotlin
SwipeToDismissBox(
    modifier = Modifier.semantics {
        customActions = listOf(
            CustomAccessibilityAction(
                label = "Remove notification",
                action = {
                    dismissNotification()
                    true
                }
            )
        )
    },
    state = rememberSwipeToDismissBoxState(),
    backgroundContent = {}
) {
    NotificationItem()
}
```

#### Q14: How does locale handling work at runtime, and how do you handle per-app language preferences?

Before Android 13, changing the app language at runtime required manually overriding the `Configuration` in `attachBaseContext()`, which was fragile and didn't survive process death well. Android 13 (API 33) introduced per-app language preferences through `LocaleManager`. You declare supported languages in `res/xml/locales_config.xml`, reference it in the manifest with `android:localeConfig`, and the system handles language switching through Settings without any custom code.

```xml
<!-- res/xml/locales_config.xml -->
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
    <locale android:name="en" />
    <locale android:name="fr" />
    <locale android:name="ja" />
    <locale android:name="ar" />
</locale-config>
```

For apps that need to support language switching on pre-API 33 devices, the AndroidX AppCompat library backports this feature through `AppCompatDelegate.setApplicationLocales()`. This handles Activity recreation, persistence, and process death automatically.

#### Q15: What is the difference between a crash and an ANR, and how do you debug each?

A crash is an unhandled exception that terminates the app immediately. An ANR (Application Not Responding) happens when the main thread is blocked for too long — 5 seconds for input events, 10 seconds for BroadcastReceiver, 20 seconds for a foreground service that doesn't call `startForeground()`. The system shows a dialog asking the user to wait or force-close the app.

For crashes, use tools like Firebase Crashlytics to capture stack traces, device info, and breadcrumbs. For ANRs, the system writes a `traces.txt` file to `/data/anr/`. The trace shows which threads were running and what the main thread was blocked on. Common ANR causes are database queries on the main thread, synchronous network calls, long `SharedPreferences.commit()` calls, and deadlocks between threads.

#### Q16: How does crash reporting work under the hood on Android?

When an uncaught exception occurs, the JVM invokes the thread's `UncaughtExceptionHandler`. By default, Android sets a handler that logs the crash and terminates the process. Crash reporting SDKs like Firebase Crashlytics install their own handler via `Thread.setDefaultUncaughtExceptionHandler()`. They capture the exception, stack trace, device metadata, and any custom logs, write them to local storage, and then call the original handler to let the process terminate normally. On the next app launch, the SDK uploads the stored crash data to the server.

For native crashes (NDK code), the process receives a signal (like `SIGSEGV`). Crashlytics and Breakpad use signal handlers to capture the native stack trace. Native crash reporting is more complex because the process state may be corrupted, so the handler must be minimal and avoid allocating memory.

#### Q17: What are app quality guidelines and how do they differ from core vitals?

App quality guidelines are the broader set of best practices Google defines for apps on Google Play. They cover functional quality (the app doesn't crash, UI handles edge cases), performance (smooth scrolling, fast startup), battery usage (no unnecessary wake locks or background work), and security (proper permission usage, secure data storage). Core vitals is a subset — the specific metrics Google tracks and uses to affect your app's Play Store visibility.

Beyond vitals, quality guidelines include things like supporting different screen sizes, handling network errors gracefully, respecting system back navigation, and following Material Design patterns. Google publishes separate quality checklists for phone apps, tablet apps, Wear OS, and TV apps.

#### Q18: How do you test accessibility on Android?

There are several layers of testing. First, enable TalkBack on a physical device and navigate your app using only swipe gestures. This catches issues no automated tool finds. Second, use the Accessibility Scanner app from Google — it flags missing content descriptions, small touch targets, and low contrast. Third, in instrumented tests, use Espresso's `AccessibilityChecks.enable()` to automatically run accessibility validation during UI tests. In Compose, the semantic tree is available in tests via `composeTestRule.onNodeWithContentDescription()` and similar matchers, so you can assert that the right semantics are attached to your composables.

#### Q19: What is color contrast ratio and how does it affect accessibility?

Color contrast ratio measures the difference in perceived brightness between foreground text and its background. WCAG (Web Content Accessibility Guidelines) defines minimum ratios that Android follows. For normal text (smaller than 18pt or smaller than 14pt bold), the minimum ratio is 4.5:1. For large text, it is 3:1. Low contrast makes text difficult or impossible to read for users with low vision or color blindness. The Accessibility Scanner tool checks contrast ratios automatically. In Compose, you can use Material3's `ColorScheme` which is designed to meet contrast requirements out of the box.

#### Q20: How do you handle formatting differences across locales?

Different locales format numbers, dates, currencies, and even text direction differently. Always use locale-aware formatting classes instead of manual string concatenation. Use `NumberFormat.getInstance(locale)` for numbers, `DateTimeFormatter` with locale for dates, and `Currency.getInstance(locale)` for currencies. Never assume the decimal separator is a period or that dates are month/day/year. For Compose, `stringResource()` handles string formatting with locale-aware substitution.

```kotlin
// Locale-aware number formatting
val price = 1299.99
val formatted = NumberFormat.getCurrencyInstance(Locale.JAPAN).format(price)
// Output: ¥1,300

// Locale-aware date formatting
val date = LocalDate.now()
val dateStr = date.format(
    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.GERMANY)
)
// Output: 14.02.2026
```

### Common Follow-ups

- How do you handle accessibility for custom views that don't extend standard Android widgets?
- What happens if a locale-specific string file is missing a string that exists in the default file?
- How do you handle dynamic strings that contain both translatable and non-translatable parts?
- What is the difference between `importantForAccessibility` and `contentDescription = null`?
- How would you set up Crashlytics in a multi-module project?
- What is `AccessibilityDelegate` and when would you use it?
- How does TalkBack handle Compose `LazyColumn` differently from RecyclerView?
- How do you handle locale changes without restarting the Activity?
