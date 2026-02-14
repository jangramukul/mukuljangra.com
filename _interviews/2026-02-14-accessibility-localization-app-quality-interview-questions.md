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

#### What is accessibility in Android and why does it matter?

Accessibility means making your app usable for people with visual, motor, hearing, or cognitive disabilities. Android provides services like TalkBack (screen reader), Switch Access (for motor impairments), and BrailleBack. My job as a developer is to provide enough semantic information in the UI so these services can describe and navigate the app for the user.

#### What is contentDescription and when should I use it?

`contentDescription` is a string attribute on views like `ImageView` and `ImageButton` that tells screen readers what the element represents. I set it on all meaningful visual elements. For decorative elements, I set `contentDescription` to `null` or mark them with `importantForAccessibility="no"` so TalkBack skips them.

```kotlin
// Meaningful icon
binding.settingsIcon.contentDescription = getString(R.string.settings)

// Decorative image — skip it
binding.headerImage.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
```

#### What are content description best practices?

- Don't include the element type. TalkBack already announces "button" or "image". So use "Settings" not "Settings button".
- Keep descriptions short and meaningful.
- Each description should be unique within its context.
- Use `null` or `importantForAccessibility="no"` for purely decorative elements.
- For toggle elements, include the current state or use `stateDescription`.

#### What is TalkBack and how does it work?

TalkBack is Android's built-in screen reader. It reads aloud the content descriptions, text, and roles of UI elements as the user swipes left or right. TalkBack uses the accessibility tree that Android builds from the view hierarchy and the semantic information I provide. When it focuses on a button, it announces the content description, element type, and any state like "disabled". Users double-tap to click.

#### What is the minimum touch target size recommended by Android?

48dp x 48dp for all interactive elements. This applies to buttons, checkboxes, icons, and any tappable area. I can achieve this even with visually smaller elements by adding padding. The Accessibility Scanner tool flags elements that don't meet this minimum.

#### What is the difference between importantForAccessibility and contentDescription = null?

Setting `contentDescription = null` removes the description but doesn't remove the element from the accessibility tree. TalkBack may still focus on it and announce the view type. Setting `importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO` removes the element from the accessibility tree entirely. TalkBack won't focus on it at all. I use `importantForAccessibility="no"` for decorative elements and `contentDescription = null` only when I want TalkBack to skip the description but still recognize the view exists.

#### What is color contrast ratio and how does it affect accessibility?

Color contrast ratio measures the brightness difference between foreground text and its background. WCAG defines minimum ratios that Android follows. For normal text (under 18pt or under 14pt bold), the minimum is 4.5:1. For large text, it's 3:1. Low contrast makes text hard to read for users with low vision or color blindness. The Accessibility Scanner checks this automatically. Material3's `ColorScheme` is designed to meet contrast requirements out of the box.

#### How do I handle localization using string resources?

All user-facing strings go in `res/values/strings.xml`, never hardcoded. For other languages, I create locale-specific folders like `res/values-fr/strings.xml` for French or `res/values-ja/strings.xml` for Japanese. Android picks the right file based on the device locale. I always keep a complete default `strings.xml` because if a string is missing from both the locale-specific and default file, the app crashes.

```kotlin
// Always reference strings from resources
val welcomeMessage = getString(R.string.welcome_message)

// Never hardcode user-facing text
// val welcomeMessage = "Welcome"
```

#### What is RTL support and how do I implement it?

RTL support is for languages like Arabic, Hebrew, and Persian that read right to left. I enable it by setting `android:supportsRtl="true"` in the manifest. Then I replace `Left/Right` attributes with `Start/End` — `marginStart` instead of `marginLeft`, `paddingEnd` instead of `paddingRight`. Android mirrors the layout automatically based on locale. I test RTL by enabling "Force RTL layout direction" in Developer Options.

#### How do I handle plurals in string resources?

Android provides the `<plurals>` resource for quantity-dependent strings. Different languages have different plural rules. English has two forms (one, other), but Arabic has six.

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

The `quantity` values are `zero`, `one`, `two`, `few`, `many`, and `other`. I always include `other` as a fallback since it's required.

#### How do I handle formatting differences across locales?

Different locales format numbers, dates, and currencies differently. I always use locale-aware formatting classes instead of manual string concatenation. `NumberFormat.getInstance(locale)` for numbers, `DateTimeFormatter` with locale for dates, `Currency.getInstance(locale)` for currencies. Never assume the decimal separator is a period or that dates are month/day/year.

```kotlin
val price = 1299.99
val formatted = NumberFormat.getCurrencyInstance(Locale.JAPAN).format(price)
// Output: ¥1,300

val date = LocalDate.now()
val dateStr = date.format(
    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.GERMANY)
)
// Output: 14.02.2026
```

#### What is the difference between a crash and an ANR, and how do I debug each?

A crash is an unhandled exception that kills the app immediately. An ANR (Application Not Responding) happens when the main thread is blocked too long — 5 seconds for input events, 10 seconds for BroadcastReceiver, 20 seconds for a foreground service that doesn't call `startForeground()`. The system shows a dialog asking the user to wait or force-close.

For crashes, I use Firebase Crashlytics to capture stack traces, device info, and breadcrumbs. For ANRs, the system writes a `traces.txt` file to `/data/anr/`. The trace shows what the main thread was blocked on. Common ANR causes are database queries on the main thread, synchronous network calls, long `SharedPreferences.commit()` calls, and deadlocks.

#### What are Android vitals?

Android vitals is a quality monitoring system in Google Play Console. It tracks stability, performance, and battery usage from real devices. The core vitals are user-perceived crash rate, user-perceived ANR rate, and excessive partial wake locks. If my app exceeds the thresholds (crash rate above 1.09%, ANR rate above 0.47%), Google Play reduces visibility and shows warnings on the store listing. It uses a 28-day rolling window, so improvements take time to reflect.

#### What is StrictMode and how does it help with app quality?

StrictMode detects accidental disk or network access on the main thread. It has two policies — `ThreadPolicy` for thread-level violations (disk reads, disk writes, network on UI thread) and `VmPolicy` for process-level violations (leaked SQLite cursors, leaked closeable objects, Activity leaks). I enable it in `Application.onCreate()` during development only.

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

Only enable it in debug builds. It won't catch everything, but it catches the most common main-thread violations.

#### How do I test accessibility on Android?

There are several layers. First, I enable TalkBack on a physical device and navigate using only swipe gestures. This catches issues no automated tool finds. Second, I use the Accessibility Scanner app — it flags missing content descriptions, small touch targets, and low contrast. Third, in instrumented tests, I use Espresso's `AccessibilityChecks.enable()` to run accessibility validation during UI tests. In Compose, I use `composeTestRule.onNodeWithContentDescription()` and similar matchers to assert the right semantics are attached.

#### How do semantics work in Jetpack Compose for accessibility?

Semantics is how I provide meaning to composables for accessibility services. Every composable can have properties like `contentDescription`, `role`, `stateDescription`, and `heading`. Material components come with built-in semantics — `Switch` has `Role.Switch`, toggleable state, and click action automatically. For custom composables, I use `Modifier.semantics`.

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

The `heading()` semantic lets TalkBack users jump between headings instead of swiping through every element. For toggleable custom components, I use `stateDescription` to override the default "On/Off" labels with something meaningful like "Subscribed/Not subscribed".

#### How do I merge and clear semantics in Compose?

Compose creates a separate accessibility node for every composable with semantics by default. To group related composables into one accessible element, I use `Modifier.semantics(mergeDescendants = true)` on the parent. TalkBack reads the combined content as a single item.

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

Without merging, TalkBack focuses on each `Text` separately — three swipes. With merging, it reads all three as one item. To exclude a decorative child from the merged result, I use `Modifier.clearAndSetSemantics { }`.

#### What are live regions and custom accessibility actions?

Live regions tell accessibility services to announce content changes automatically without the user navigating to the element. `LiveRegionMode.Polite` is for non-urgent updates like a new badge. `LiveRegionMode.Assertive` is for critical alerts. I use assertive sparingly because it interrupts whatever TalkBack is currently reading.

Custom accessibility actions replace complex gestures that some users can't perform. A swipe-to-dismiss gesture is impossible for Switch Access users, so I add a custom action to make the same operation available through the accessibility menu.

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

#### How does per-app language selection work?

Before Android 13, changing the app language at runtime meant manually overriding the `Configuration` in `attachBaseContext()`. It was fragile and didn't survive process death well. Android 13 introduced per-app language preferences through `LocaleManager`. I declare supported languages in `res/xml/locales_config.xml`, reference it in the manifest with `android:localeConfig`, and the system handles switching through Settings.

```xml
<!-- res/xml/locales_config.xml -->
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
    <locale android:name="en" />
    <locale android:name="fr" />
    <locale android:name="ja" />
    <locale android:name="ar" />
</locale-config>
```

For pre-API 33 devices, AndroidX AppCompat backports this through `AppCompatDelegate.setApplicationLocales()`. It handles Activity recreation, persistence, and process death automatically.

#### How does crash reporting work under the hood?

When an uncaught exception occurs, the JVM calls the thread's `UncaughtExceptionHandler`. By default, Android logs the crash and kills the process. Crash reporting SDKs like Crashlytics install their own handler via `Thread.setDefaultUncaughtExceptionHandler()`. They capture the exception, stack trace, and device metadata, write it to local storage, then call the original handler to let the process terminate. On the next launch, the SDK uploads the data.

For native crashes (NDK code), the process receives a signal like `SIGSEGV`. Crashlytics and Breakpad use signal handlers to capture native stack traces. Native crash reporting is more complex because the process state may be corrupted, so the handler must be minimal and avoid memory allocation.

#### What are app quality guidelines and how do they differ from core vitals?

App quality guidelines are the broader best practices Google defines for Play Store apps. They cover functional quality, performance, battery usage, and security. Core vitals is a subset — the specific metrics Google tracks that affect store visibility.

Beyond vitals, quality guidelines include supporting different screen sizes, handling network errors gracefully, respecting system back navigation, and following Material Design patterns. Google publishes separate checklists for phone, tablet, Wear OS, and TV apps.

#### What is AccessibilityDelegate and when would I use it?

`AccessibilityDelegate` lets me customize accessibility behavior of existing views without subclassing them. I override `onInitializeAccessibilityNodeInfo()` to add or modify the accessibility info for a view. This is useful for custom views or compound components where I need to expose state, actions, or roles that the default implementation doesn't provide.

```kotlin
ViewCompat.setAccessibilityDelegate(customView, object : AccessibilityDelegateCompat() {
    override fun onInitializeAccessibilityNodeInfo(
        host: View, info: AccessibilityNodeInfoCompat
    ) {
        super.onInitializeAccessibilityNodeInfo(host, info)
        info.roleDescription = "Rating slider"
        info.stateDescription = "3 out of 5 stars"
    }
})
```

I use it when I build custom controls that TalkBack doesn't understand out of the box. It's a cleaner approach than subclassing just to fix accessibility.

#### How do I handle dynamic text sizing for accessibility?

Android has a system font size setting that users can adjust. I use `sp` for text sizes so they scale with the user's preference. If I use `dp` for text, it ignores the accessibility setting and stays fixed. Starting with Android 14, the system supports non-linear font scaling up to 200%, so large text doesn't grow as aggressively as small text.

I also test my layouts at the largest font size to make sure nothing overflows or gets clipped. If a `TextView` has a fixed height, large text might get cut off. I use `wrap_content` or constrain the minimum size rather than hardcoding dimensions.

### Common Follow-ups

- How do you handle accessibility for custom views that don't extend standard Android widgets?
- What happens if a locale-specific string file is missing a string that exists in the default file?
- How do you handle dynamic strings that contain both translatable and non-translatable parts?
- How would you set up Crashlytics in a multi-module project?
- How does TalkBack handle Compose `LazyColumn` differently from RecyclerView?
- How do you handle locale changes without restarting the Activity?
- What is the accessibility tree and how does Android build it?
- How do you make custom gestures accessible for Switch Access users?
