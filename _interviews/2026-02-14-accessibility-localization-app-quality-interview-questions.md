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

This is one of those areas that separates good apps from great ones. Anyone can build an app that works on their own phone with their own settings. Building one that works for a user who's blind, reads right-to-left, or has their font size cranked to max? That takes real craft. Expect questions on TalkBack, content descriptions, RTL layouts, string resources, Android vitals, and crash reporting.

#### What is accessibility in Android and why does it matter?

Think of accessibility like building ramps alongside stairs. The stairs work fine for most people, but without ramps, you've locked out everyone in a wheelchair. In Android, accessibility means making your app usable for people with visual, motor, hearing, or cognitive disabilities. Android provides services like TalkBack (screen reader), Switch Access (for motor impairments), and BrailleBack. My job is to provide enough semantic information in the UI so these services can describe and navigate the app for the user.

#### What is contentDescription and when should I use it?

`contentDescription` is basically your view whispering its identity to TalkBack. It's a string attribute on views like `ImageView` and `ImageButton` that tells screen readers what the element represents. I set it on all meaningful visual elements. For decorative elements -- like that pretty gradient background image -- I set `contentDescription` to `null` or mark them with `importantForAccessibility="no"` so TalkBack skips them entirely.

```kotlin
// Meaningful icon
binding.settingsIcon.contentDescription = getString(R.string.settings)

// Decorative image — skip it
binding.headerImage.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
```

#### What are content description best practices?

- Don't include the element type. TalkBack already announces "button" or "image". So use "Settings" not "Settings button" -- otherwise the user hears "Settings button, button." Redundant and annoying.
- Keep descriptions short and meaningful.
- Each description should be unique within its context.
- Use `null` or `importantForAccessibility="no"` for purely decorative elements.
- For toggle elements, include the current state or use `stateDescription`.

#### What is TalkBack and how does it work?

TalkBack is Android's built-in screen reader -- think of it as a narrator that reads your UI out loud while the user navigates by swiping left and right. It reads the content descriptions, text, and roles of UI elements. Under the hood, TalkBack uses the accessibility tree that Android builds from the view hierarchy and the semantic information I provide. When it focuses on a button, it announces the content description, element type, and any state like "disabled". Users double-tap to click.

> **🧠 Think about it:** If TalkBack builds its understanding from the view hierarchy, what happens to custom-drawn views that don't use standard Android widgets?

#### What is the minimum touch target size recommended by Android?

48dp x 48dp. That's the magic number for all interactive elements -- buttons, checkboxes, icons, anything tappable. Here's the trick: the element can look smaller visually, but I pad it out to 48dp so the actual touch area is big enough. It's like a bullseye -- the dot in the center can be small as long as the target around it is large enough to hit. The Accessibility Scanner tool flags elements that don't meet this minimum.

#### What is the difference between importantForAccessibility and contentDescription = null?

This trips people up because both sound like "TalkBack, ignore this." But they work differently. Setting `contentDescription = null` removes the description but doesn't remove the element from the accessibility tree -- TalkBack may still focus on it and announce the view type. It's like removing someone's name tag but leaving them in the room.

Setting `importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO` removes the element from the accessibility tree entirely. TalkBack won't focus on it at all -- the element is invisible to accessibility services. I use `importantForAccessibility="no"` for decorative elements and `contentDescription = null` only when I want TalkBack to skip the description but still recognize the view exists.

#### What is color contrast ratio and how does it affect accessibility?

Color contrast ratio measures the brightness difference between foreground text and its background. WCAG defines minimum ratios that Android follows: for normal text (under 18pt or under 14pt bold), the minimum is 4.5:1. For large text, it's 3:1. Think of it this way -- if you squint and the text disappears into the background, the contrast is too low. Low contrast makes text hard to read for users with low vision or color blindness. The Accessibility Scanner checks this automatically, and Material3's `ColorScheme` is designed to meet contrast requirements out of the box.

#### How do I handle localization using string resources?

All user-facing strings go in `res/values/strings.xml`, never hardcoded. For other languages, I create locale-specific folders like `res/values-fr/strings.xml` for French or `res/values-ja/strings.xml` for Japanese. Android picks the right file based on the device locale -- it's like having a filing cabinet with a drawer per language, and Android knows which drawer to open.

One thing that'll burn you: I always keep a complete default `strings.xml` because if a string is missing from both the locale-specific and default file, the app crashes. No graceful fallback -- just a crash.

```kotlin
// Always reference strings from resources
val welcomeMessage = getString(R.string.welcome_message)

// Never hardcode user-facing text
// val welcomeMessage = "Welcome"
```

#### What is RTL support and how do I implement it?

RTL support is for languages like Arabic, Hebrew, and Persian that read right to left. I enable it by setting `android:supportsRtl="true"` in the manifest. Then here's the key mental shift: I replace `Left/Right` attributes with `Start/End`. So `marginStart` instead of `marginLeft`, `paddingEnd` instead of `paddingRight`. "Start" means "where reading begins" -- left in English, right in Arabic. Android mirrors the layout automatically based on locale. I test RTL by enabling "Force RTL layout direction" in Developer Options.

#### How do I handle plurals in string resources?

Here's a fun one. You might think plurals are just "1 message" vs "2 messages." English has two forms, sure. But Arabic has six. Polish has four. Android provides the `<plurals>` resource to handle this properly.

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

The `quantity` values are `zero`, `one`, `two`, `few`, `many`, and `other`. I always include `other` as a fallback since it's required. Android handles mapping the actual count to the right grammatical category for each language -- so I don't need to know Polish plural rules, I just need to provide the strings.

#### How do I handle formatting differences across locales?

This is the "assumption trap." You assume the decimal separator is a period? In Germany it's a comma. Dates are month/day/year? In most of Europe it's day/month/year. I always use locale-aware formatting classes instead of manual string concatenation: `NumberFormat.getInstance(locale)` for numbers, `DateTimeFormatter` with locale for dates, `Currency.getInstance(locale)` for currencies.

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

> **🧠 Think about it:** If you hardcode `"$" + price` for displaying currency, what breaks when a Japanese user opens your app?

#### What is the difference between a crash and an ANR, and how do I debug each?

A crash is like a car hitting a wall -- unhandled exception, app dies immediately. An ANR is like a car stuck in traffic -- the app is still running but the main thread is blocked and nothing responds. Specifically, ANR triggers after 5 seconds for input events, 10 seconds for BroadcastReceiver, or 20 seconds for a foreground service that doesn't call `startForeground()`. The system shows a dialog asking the user to wait or force-close.

For crashes, I use Firebase Crashlytics to capture stack traces, device info, and breadcrumbs. For ANRs, the system writes a `traces.txt` file to `/data/anr/`. The trace shows what the main thread was blocked on. Common ANR causes are database queries on the main thread, synchronous network calls, long `SharedPreferences.commit()` calls, and deadlocks.

#### What are Android vitals?

Android vitals is Google Play Console's way of keeping score on your app's quality. It tracks stability, performance, and battery usage from real devices in the wild. The core vitals are user-perceived crash rate, user-perceived ANR rate, and excessive partial wake locks.

Here's why it matters: if my app exceeds the thresholds -- crash rate above 1.09%, ANR rate above 0.47% -- Google Play reduces visibility and shows warnings on the store listing. It uses a 28-day rolling window, so even after I fix the issue, it takes weeks for the numbers to recover. It's like a credit score -- quick to damage, slow to repair.

#### What is StrictMode and how does it help with app quality?

StrictMode is like having a strict code reviewer that watches your app at runtime and yells every time you do something questionable on the main thread. It detects accidental disk or network access where it shouldn't be. It has two policies -- `ThreadPolicy` for thread-level violations (disk reads, disk writes, network on UI thread) and `VmPolicy` for process-level violations (leaked SQLite cursors, leaked closeable objects, Activity leaks). I enable it in `Application.onCreate()` during development only.

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

Only enable it in debug builds. It won't catch everything, but it catches the most common main-thread violations before your users do.

#### How do I test accessibility on Android?

There are several layers, and each catches things the others miss. First, I enable TalkBack on a physical device and navigate using only swipe gestures. This is the most humbling test -- you'll find issues no automated tool catches. Second, I use the Accessibility Scanner app, which flags missing content descriptions, small touch targets, and low contrast.

Third, in instrumented tests, I use Espresso's `AccessibilityChecks.enable()` to run accessibility validation during UI tests. In Compose, I use `composeTestRule.onNodeWithContentDescription()` and similar matchers to assert the right semantics are attached. The combination of manual testing and automated checks gives the best coverage.

#### How do semantics work in Jetpack Compose for accessibility?

Semantics in Compose is like putting invisible labels on everything so TalkBack knows what it's looking at. Every composable can have properties like `contentDescription`, `role`, `stateDescription`, and `heading`. The nice thing is that Material components come with built-in semantics -- `Switch` already has `Role.Switch`, toggleable state, and click action automatically. For custom composables, I use `Modifier.semantics`.

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

The `heading()` semantic lets TalkBack users jump between headings instead of swiping through every element -- like skipping chapters in a book instead of reading every page. For toggleable custom components, I use `stateDescription` to override the default "On/Off" labels with something meaningful like "Subscribed/Not subscribed".

#### How do I merge and clear semantics in Compose?

Compose creates a separate accessibility node for every composable with semantics by default. That means a card with a title, author, and date becomes three separate TalkBack stops. That's annoying. To group them into one accessible element, I use `Modifier.semantics(mergeDescendants = true)` on the parent.

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

Without merging, TalkBack focuses on each `Text` separately -- three swipes. With merging, it reads all three as one item. To exclude a decorative child from the merged result, I use `Modifier.clearAndSetSemantics { }`.

#### What are live regions and custom accessibility actions?

Live regions are like push notifications for TalkBack -- they tell accessibility services to announce content changes automatically without the user navigating to the element. `LiveRegionMode.Polite` is for non-urgent updates like a new badge count. `LiveRegionMode.Assertive` is for critical alerts that need immediate attention. I use assertive sparingly because it interrupts whatever TalkBack is currently reading -- imagine someone tapping you on the shoulder mid-sentence.

Custom accessibility actions solve a different problem: complex gestures that some users physically can't perform. A swipe-to-dismiss gesture is impossible for Switch Access users, so I add a custom action to make the same operation available through the accessibility menu.

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

Before Android 13, changing the app language at runtime meant manually overriding the `Configuration` in `attachBaseContext()`. It was fragile and didn't survive process death well -- like writing your settings on a napkin that gets thrown away.

Android 13 introduced per-app language preferences through `LocaleManager`. I declare supported languages in `res/xml/locales_config.xml`, reference it in the manifest with `android:localeConfig`, and the system handles switching through Settings.

```xml
<!-- res/xml/locales_config.xml -->
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
    <locale android:name="en" />
    <locale android:name="fr" />
    <locale android:name="ja" />
    <locale android:name="ar" />
</locale-config>
```

For pre-API 33 devices, AndroidX AppCompat backports this through `AppCompatDelegate.setApplicationLocales()`. It handles Activity recreation, persistence, and process death automatically. Finally, a proper solution.

#### How does crash reporting work under the hood?

When an uncaught exception occurs, the JVM calls the thread's `UncaughtExceptionHandler`. By default, Android logs the crash and kills the process. Crash reporting SDKs like Crashlytics are clever -- they install their own handler via `Thread.setDefaultUncaughtExceptionHandler()`. They capture the exception, stack trace, and device metadata, write it all to local storage, then call the original handler to let the process terminate normally. On the next launch, the SDK uploads the data. It's like a black box flight recorder -- captures everything right before impact, and someone retrieves it later.

> **🧠 Think about it:** If the crash reporting handler writes to local storage before the process dies, what happens during a native crash where the process state might be corrupted?

For native crashes (NDK code), the process receives a signal like `SIGSEGV`. Crashlytics and Breakpad use signal handlers to capture native stack traces. Native crash reporting is more complex because the process state may be corrupted, so the handler must be minimal and avoid memory allocation.

#### What are app quality guidelines and how do they differ from core vitals?

App quality guidelines are the broader best practices Google defines for Play Store apps -- think of them as the whole rulebook. They cover functional quality, performance, battery usage, and security. Core vitals is a subset -- just the specific metrics Google actively tracks that affect your store visibility and ranking.

Beyond vitals, quality guidelines include supporting different screen sizes, handling network errors gracefully, respecting system back navigation, and following Material Design patterns. Google publishes separate checklists for phone, tablet, Wear OS, and TV apps.

#### What is AccessibilityDelegate and when would I use it?

`AccessibilityDelegate` lets me customize accessibility behavior of existing views without subclassing them. It's the composition-over-inheritance approach to accessibility fixes. I override `onInitializeAccessibilityNodeInfo()` to add or modify the accessibility info for a view. This is useful for custom views or compound components where I need to expose state, actions, or roles that the default implementation doesn't provide.

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

I reach for this when I build custom controls that TalkBack doesn't understand out of the box. It's cleaner than creating a subclass just to fix accessibility.

#### How do I handle dynamic text sizing for accessibility?

Android has a system font size setting that users can adjust. The key rule: use `sp` for text sizes so they scale with the user's preference. If I use `dp` for text, it ignores the accessibility setting and stays fixed -- which defeats the whole purpose. Starting with Android 14, the system supports non-linear font scaling up to 200%, meaning large text doesn't grow as aggressively as small text. This prevents headlines from becoming comically huge.

I also test my layouts at the largest font size to make sure nothing overflows or gets clipped. If a `TextView` has a fixed height, large text will get cut off. I use `wrap_content` or constrain the minimum size rather than hardcoding dimensions. It's the kind of bug you'll never notice on your own device but will ruin the experience for someone who needs larger text.

### Common Follow-ups

- How do you handle accessibility for custom views that don't extend standard Android widgets?
- What happens if a locale-specific string file is missing a string that exists in the default file?
- How do you handle dynamic strings that contain both translatable and non-translatable parts?
- How would you set up Crashlytics in a multi-module project?
- How does TalkBack handle Compose `LazyColumn` differently from RecyclerView?
- How do you handle locale changes without restarting the Activity?
- What is the accessibility tree and how does Android build it?
- How do you make custom gestures accessible for Switch Access users?
