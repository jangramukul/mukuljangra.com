---
title: "Testing & Accessibility in Compose"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 23
sequence: 23
description: "Testing and accessibility questions appear in senior-level Compose interviews because they reveal whether you've actually shipped production Compose..."
---

## Testing & Accessibility in Compose

Here's the thing — anyone can write a composable. But knowing how to test it and make it accessible? That's what tells an interviewer you've actually shipped Compose in production. These questions come up a lot in senior rounds, and they're where you separate "I followed a tutorial" from "I built real apps."

#### What is ComposeTestRule and how do you set up a Compose UI test?

`ComposeTestRule` is your entry point into the Compose test world. Think of it like a test stage — it sets up a Compose environment, lets you place composables on it, and then you can poke at them. You create it with `createComposeRule()` for standalone tests, or `createAndroidComposeRule<YourActivity>()` when your composable needs an Activity.

```kotlin
class LoginScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun loginButton_disabledWhenFieldsEmpty() {
        composeTestRule.setContent {
            LoginScreen(onLogin = {})
        }

        composeTestRule
            .onNodeWithText("Login")
            .assertIsNotEnabled()
    }
}
```

`createComposeRule()` spins up a blank Compose host without a full Activity — it's faster and the go-to choice for testing individual composables. Only reach for `createAndroidComposeRule` when your composable actually needs Activity-level stuff like themes or permissions.

#### What is the difference between createComposeRule and createAndroidComposeRule?

`createComposeRule()` launches a minimal `ComponentActivity` under the hood. It's lightweight, fast, and enough for testing composables in isolation. You call `setContent {}` directly on the rule.

`createAndroidComposeRule<YourActivity>()` launches a specific Activity. Use it when your composable depends on something the Activity provides — a specific theme, injected dependencies, permissions, or `CompositionLocal` values that the Activity sets up. It gives you access to the Activity instance via `composeTestRule.activity`.

The tradeoff is speed. `createAndroidComposeRule` has more startup overhead because it launches a full Activity. For most composable tests, `createComposeRule` is the right choice.

#### How do node finders work in Compose tests?

Node finders are like CSS selectors but for the semantic tree. They query the tree to locate composable nodes. `onNode` takes a raw `SemanticsMatcher` and is the most flexible. `onNodeWithText`, `onNodeWithContentDescription`, and `onNodeWithTag` are convenience wrappers with pre-built matchers.

```kotlin
// These are equivalent
composeTestRule.onNode(hasText("Submit"))
composeTestRule.onNodeWithText("Submit")

// Find by test tag
composeTestRule.onNodeWithTag("submit_button")

// Find by content description
composeTestRule.onNodeWithContentDescription("Close dialog")

// Find multiple nodes
composeTestRule.onAllNodesWithText("Item")
    .assertCountEquals(5)
```

`onNode` returns a `SemanticsNodeInteraction` which you chain with assertions or actions. If no node matches, the assertion fails with a clear error showing the current semantic tree — which is actually super helpful for debugging.

#### What are the most common assertions and actions in Compose tests?

Assertions verify node properties. Actions simulate user input.

Common assertions:
- `assertIsDisplayed()` — node exists and is visible on screen
- `assertIsNotDisplayed()` — node exists but isn't visible
- `assertExists()` — node is in the tree, may or may not be visible
- `assertDoesNotExist()` — node is not in the tree at all
- `assertIsEnabled()` / `assertIsNotEnabled()`
- `assertTextEquals("expected text")`
- `assertHasClickAction()`

Common actions:
- `performClick()`
- `performTextInput("text")`
- `performTextClearance()`
- `performScrollTo()` — scrolls until node is visible
- `performTouchInput { swipeLeft() }`

Now here's where it gets interesting — `assertIsDisplayed` vs `assertExists`. A node inside a `LazyColumn` scrolled off screen still exists in the semantic tree but isn't displayed. An `AnimatedVisibility` with `visible = false` removes the node entirely after the exit animation, so `assertDoesNotExist()` is the right check there. Mixing these up is a classic source of flaky tests.

> **🧠 Think about it:** If you have a `LazyColumn` with 100 items and you check `onNodeWithText("Item 99").assertIsDisplayed()` without scrolling first — what happens? Does it fail because the node isn't visible, or because the node doesn't exist yet?

#### What is the semantic tree and why does it matter for testing?

The semantic tree is a parallel tree that Compose builds alongside the UI tree. It describes what each composable *means* rather than how it *looks*. Every composable with semantic properties — text, click actions, content descriptions, roles — creates a node in this tree.

Here's the thing — Compose tests don't interact with pixels or layout coordinates. They query the semantic tree. This is why you need `Modifier.testTag("myTag")` or `Modifier.semantics { contentDescription = "close" }` to make composables findable in tests. A plain `Box` with no semantics? Invisible to the test framework. It's like a ghost.

You can print the tree for debugging:

```kotlin
composeTestRule.onRoot().printToLog("SEMANTIC_TREE")
```

Plot twist: the semantic tree also powers accessibility services like TalkBack. When you write tests that assert on semantics, you're simultaneously verifying that your UI is accessible. Two birds, one tree.

#### What is Modifier.testTag and when should you use it?

`Modifier.testTag("tag")` adds a test tag to a composable's semantics, making it findable via `onNodeWithTag("tag")` in tests. Use it when a composable doesn't have natural semantic identifiers like text or content descriptions.

```kotlin
LazyColumn(modifier = Modifier.testTag("task_list")) {
    items(tasks) { task ->
        TaskRow(
            task = task,
            modifier = Modifier.testTag("task_${task.id}")
        )
    }
}

// In test
composeTestRule
    .onNodeWithTag("task_list")
    .assertIsDisplayed()

composeTestRule
    .onNodeWithTag("task_42")
    .performClick()
```

But don't go slapping test tags on everything. If a composable already has text or a content description, prefer `onNodeWithText` or `onNodeWithContentDescription` — those also verify that the content is correct. Test tags are a fallback for elements like containers, dividers, or icons without text.

#### How do you handle scrolling in Compose tests?

For regular scrollable columns, use `performScrollTo()` which scrolls until the target node is visible:

```kotlin
composeTestRule
    .onNodeWithText("Terms and Conditions")
    .performScrollTo()
    .assertIsDisplayed()
```

For `LazyColumn`, things get trickier. Items off-screen don't exist in the semantic tree until they're composed. You can't find a node that hasn't been created yet — it's like looking for a book that hasn't been printed. Use `performScrollToIndex` or `performScrollToKey`:

```kotlin
composeTestRule
    .onNodeWithTag("task_list")
    .performScrollToIndex(25)

composeTestRule
    .onNodeWithTag("task_list")
    .performScrollToKey("task_42")
```

`performScrollToKey` requires that you set `key` in your `LazyColumn`'s `items` block. Stable keys matter for testability, not just animation and performance.

#### How do you handle async operations in Compose tests?

Compose tests auto-synchronize with the Compose frame clock — they wait for pending recompositions and animations before executing the next assertion. But they don't wait for coroutines, network calls, or other async work outside the Compose framework.

For those cases, use `waitUntil`:

```kotlin
@Test
fun searchResults_appearAfterLoading() {
    composeTestRule.setContent {
        SearchScreen(viewModel = searchViewModel)
    }

    composeTestRule
        .onNodeWithTag("search_input")
        .performTextInput("kotlin")

    composeTestRule.waitUntil(timeoutMillis = 5000) {
        composeTestRule
            .onAllNodesWithTag("search_result")
            .fetchSemanticsNodes()
            .isNotEmpty()
    }

    composeTestRule
        .onAllNodesWithTag("search_result")
        .assertCountEquals(3)
}
```

`waitUntil` polls the condition repeatedly until it returns true or the timeout expires. There's also `waitForIdle()` which waits until Compose is idle (no pending recompositions), but it won't help if you're waiting for a ViewModel to emit new state from a coroutine.

#### How do you test composables that depend on a ViewModel?

The preferred approach is making composables take state and callbacks as parameters rather than a ViewModel directly. It's like ordering food from a menu instead of going into the kitchen — the composable just says what it needs, and you hand it in.

```kotlin
@Composable
fun TaskListScreen(
    tasks: List<Task>,
    onTaskClick: (Task) -> Unit,
    onDelete: (Task) -> Unit
) { /* ... */ }

@Test
fun taskList_displaysAllTasks() {
    val fakeTasks = listOf(
        Task(id = 1, title = "Write tests"),
        Task(id = 2, title = "Fix bug")
    )
    composeTestRule.setContent {
        TaskListScreen(
            tasks = fakeTasks,
            onTaskClick = {},
            onDelete = {}
        )
    }
    composeTestRule.onNodeWithText("Write tests").assertIsDisplayed()
    composeTestRule.onNodeWithText("Fix bug").assertIsDisplayed()
}
```

If you must test with a ViewModel, use a fake or provide fake dependencies through Hilt's `TestInstallIn`. But the more your composable depends on a ViewModel directly, the harder it is to test. State hoisting isn't just an architecture pattern — it's a testability pattern.

#### What are common testing pitfalls in Compose?

A few patterns that trip people up:

- **Forgetting idle synchronization** — Compose tests auto-wait for recomposition, but not for coroutines or delay-based logic. If your composable launches a coroutine that updates state after a delay, the test will assert before the state changes. Use `waitUntil` or advance the test dispatcher.
- **Testing implementation instead of behavior** — Don't assert on the number of recompositions or internal state. Test what the user sees: "after clicking X, text Y is displayed." This keeps tests stable when you refactor.
- **Missing keys in LazyColumn** — Without stable keys, items might not be findable by test tag after the list recomposes because positions shifted.
- **Using Thread.sleep** — Never use `Thread.sleep` in Compose tests. Use `waitUntil`, `advanceTimeBy` on the test clock, or `TestDispatcher` for coroutine timing.

```kotlin
// Bad — flaky
Thread.sleep(2000)
composeTestRule.onNodeWithText("Loaded").assertIsDisplayed()

// Good — deterministic
composeTestRule.waitUntil(timeoutMillis = 5000) {
    composeTestRule
        .onAllNodesWithText("Loaded")
        .fetchSemanticsNodes()
        .isNotEmpty()
}
```

#### How do you test navigation in Compose?

You test Compose Navigation by creating a `TestNavHostController` and asserting on the current route after user actions. It's like checking which room someone walked into after you pointed them at a door.

```kotlin
class NavigationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var navController: TestNavHostController

    @Test
    fun clickingProfile_navigatesToProfileScreen() {
        composeTestRule.setContent {
            navController = TestNavHostController(LocalContext.current)
            navController.navigatorProvider.addNavigator(
                ComposeNavigator()
            )
            AppNavGraph(navController = navController)
        }

        composeTestRule
            .onNodeWithText("Profile")
            .performClick()

        val route = navController.currentBackStackEntry
            ?.destination?.route
        assertEquals("profile", route)
    }
}
```

The key is injecting the `TestNavHostController` so you can inspect the back stack. Test the navigation outcome (which screen am I on?) rather than implementation details. If you're testing deep links, call `navController.navigate("deep/link/path")` and assert the correct screen content appears.

#### How do you set up Compose testing with Hilt?

Hilt requires a custom test rule because it needs to inject dependencies before your composable renders. Use `createAndroidComposeRule` with a `HiltTestActivity` and annotate the test class with `@HiltAndroidTest`.

```kotlin
@HiltAndroidTest
class TaskScreenTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<HiltTestActivity>()

    @Test
    fun taskScreen_showsTasks() {
        composeTestRule.setContent {
            TaskScreen()
        }
        composeTestRule
            .onNodeWithText("My Tasks")
            .assertIsDisplayed()
    }
}
```

Rule ordering matters here — `HiltAndroidRule` must run before `ComposeTestRule` so dependencies are injected first. Get that order wrong and you'll get cryptic crashes. You also need to register `HiltTestActivity` in your test manifest. For swapping dependencies in tests, use `@TestInstallIn` to replace production modules with test modules that provide fakes.

#### What are semantics in Compose and how do they support accessibility?

Semantics are metadata attached to composables that describe their meaning and behavior. Think of them as name tags for your UI — they tell both the test framework and accessibility services like TalkBack what a composable actually represents.

When you set `contentDescription`, `role`, `stateDescription`, or other semantic properties, you're giving your composable an identity. A custom toggle without semantics is invisible to TalkBack — a sighted user can interact with it, but a visually impaired user cannot.

```kotlin
@Composable
fun FavoriteToggle(isFavorite: Boolean, onToggle: () -> Unit) {
    IconButton(
        onClick = onToggle,
        modifier = Modifier.semantics {
            contentDescription = if (isFavorite)
                "Remove from favorites" else "Add to favorites"
            role = Role.Switch
            stateDescription = if (isFavorite) "Active" else "Inactive"
        }
    ) {
        Icon(
            imageVector = if (isFavorite) Icons.Filled.Favorite
                else Icons.Outlined.FavoriteBorder,
            contentDescription = null
        )
    }
}
```

Setting `contentDescription = null` on the `Icon` is intentional. The parent `IconButton` already provides a label through its semantics. If both had content descriptions, TalkBack would announce them both, which is confusing.

#### How do you set contentDescription correctly in Compose?

`contentDescription` tells accessibility services what a visual element represents. For `Image` and `Icon`, it's a direct parameter. For other composables, use `Modifier.semantics`.

The rules are straightforward:
- Decorative elements get `contentDescription = null`. TalkBack skips them.
- Interactive elements must have a description. A button with just an icon needs one.
- Don't repeat information already available. If a card has `Text("Settings")` and a gear icon, the icon's content description should be null.
- Be concise and action-oriented for buttons: "Delete task" not "This is a button that deletes the current task."

```kotlin
// Decorative — skip
Icon(Icons.Filled.Star, contentDescription = null)

// Informational — describe
Image(
    painter = painterResource(R.drawable.profile),
    contentDescription = "Profile photo of ${user.name}"
)

// Interactive — action-oriented
IconButton(onClick = onDelete) {
    Icon(Icons.Filled.Delete, contentDescription = "Delete message")
}
```

> **🧠 Think about it:** You have a card with a title `Text("Settings")`, a subtitle `Text("Manage your preferences")`, and a gear `Icon`. Which of these three should have a `contentDescription`, and which should be `null`?

#### What are the merged and unmerged semantic trees?

Compose maintains two views of the semantic tree — and this is where things get interesting. The merged tree combines semantics from parent and children into single nodes. A `Button` containing `Text("Hello")` and `Text("World")` appears as one node with text `[Hello, World]` in the merged tree. This is what TalkBack sees and what tests query by default.

The unmerged tree preserves every individual node. The same `Button` shows as a parent with `MergeDescendants = true` and two separate child text nodes.

```kotlin
// Merged tree (default)
composeTestRule
    .onNodeWithText("Hello")
    .assertIsDisplayed()

// Unmerged tree — finds the individual Text node
composeTestRule
    .onNodeWithText("Hello", useUnmergedTree = true)
    .assertIsDisplayed()
```

You need `useUnmergedTree = true` when testing specific child elements inside a merged parent. For example, verifying a list item's subtitle when the title and subtitle are merged into one semantic node. Merging is controlled by `Modifier.semantics(mergeDescendants = true)`. Clickable composables and Buttons merge by default because TalkBack should treat them as single interactive units.

#### What are semantic roles and when do you set them?

Roles tell accessibility services what kind of component an element is — like a job title for your composable. TalkBack uses roles to decide the announcement: "double tap to toggle" for switches, "double tap to activate" for buttons. Standard Material composables like `Button`, `Checkbox`, and `Switch` set roles automatically. You set them manually for custom components.

Available roles: `Button`, `Checkbox`, `Switch`, `RadioButton`, `Tab`, `Image`, `DropdownList`, and `Range`.

```kotlin
@Composable
fun CustomSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Box(
        modifier = Modifier
            .toggleable(
                value = checked,
                onValueChange = onCheckedChange,
                role = Role.Switch
            )
            .semantics {
                contentDescription = "Dark mode"
                stateDescription = if (checked) "On" else "Off"
            }
            .size(52.dp, 28.dp)
            .background(
                if (checked) Color.Blue else Color.Gray,
                RoundedCornerShape(14.dp)
            )
    ) { /* thumb */ }
}
```

Pass `role` through the interaction modifier (`clickable`, `toggleable`, `selectable`) rather than setting it separately in `Modifier.semantics`. The interaction modifier merges it into the semantics correctly.

#### How do you control traversal order for accessibility?

Traversal order controls the sequence TalkBack uses to navigate through elements. By default, Compose follows a top-to-bottom, start-to-end reading order based on layout. But sometimes visual order doesn't match logical order — especially with overlapping elements or custom layouts.

Use `Modifier.semantics { traversalIndex = N }` to override. Lower values come first:

```kotlin
@Composable
fun HeaderWithAction() {
    Box {
        IconButton(
            onClick = { /* settings */ },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .semantics { traversalIndex = 2f }
        ) {
            Icon(Icons.Default.Settings, contentDescription = "Settings")
        }

        Text(
            text = "Welcome back",
            modifier = Modifier
                .align(Alignment.TopStart)
                .semantics { traversalIndex = 0f }
        )

        Text(
            text = "Here are your tasks",
            modifier = Modifier
                .align(Alignment.CenterStart)
                .semantics { traversalIndex = 1f }
        )
    }
}
```

`isTraversalGroup = true` on a parent tells TalkBack to finish all children inside the group before moving to the next sibling group. This is important when elements from different groups are visually interleaved.

#### What are live regions in Compose accessibility?

Live regions tell accessibility services to announce content changes automatically, without the user navigating to the element. Think of them like push notifications for TalkBack — instead of the user hunting for what changed, the change comes to them. Use them for error messages, countdown timers, loading status, or toast-like notifications.

```kotlin
@Composable
fun FormField(error: String?) {
    Column {
        TextField(value = input, onValueChange = { input = it })
        if (error != null) {
            Text(
                text = error,
                color = Color.Red,
                modifier = Modifier.semantics {
                    liveRegion = LiveRegionMode.Polite
                }
            )
        }
    }
}
```

There are two modes:
- **Polite** — waits for TalkBack to finish its current announcement before reading the update. Use for non-urgent changes like form validation errors.
- **Assertive** — interrupts the current announcement immediately. Use sparingly, only for critical alerts like connectivity loss.

Without `liveRegion`, TalkBack won't announce the error text unless the user navigates to it manually. That's a broken accessibility experience.

#### How do you test accessibility properties in Compose tests?

You test accessibility by asserting on semantic properties — the same properties that TalkBack uses. If your tests verify semantics, you're simultaneously verifying accessibility.

```kotlin
@Test
fun favoriteButton_hasCorrectAccessibility() {
    composeTestRule.setContent {
        FavoriteToggle(isFavorite = true, onToggle = {})
    }

    composeTestRule
        .onNodeWithContentDescription("Remove from favorites")
        .assertIsDisplayed()
        .assert(hasRole(Role.Switch))
        .assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription, "Active"
            )
        )
}

@Test
fun errorMessage_hasLiveRegion() {
    composeTestRule.setContent {
        FormField(error = "Email is required")
    }

    composeTestRule
        .onNodeWithText("Email is required")
        .assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.LiveRegion, LiveRegionMode.Polite
            )
        )
}
```

The pattern is: define semantics in your composable, then verify them in tests. This creates a contract — if someone removes the content description or changes the role, the test fails. Without these tests, accessibility regressions go unnoticed because nobody manually tests with TalkBack on every change.

#### What is screenshot testing and how does Paparazzi work for Compose?

Screenshot testing captures a visual snapshot of your UI and compares it against a saved reference image. If the pixels differ beyond a threshold, the test fails. This catches visual regressions that semantic-based tests miss — wrong colors, broken layouts, clipped text. It's like a "spot the difference" puzzle that your CI runs for you.

Paparazzi (by Cash App) runs screenshot tests on the JVM without an emulator. It uses `layoutlib` — the same rendering engine Android Studio uses for previews — to render composables into bitmaps.

```kotlin
class ProfileCardScreenshotTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6,
        theme = "Theme.Material3.DayNight"
    )

    @Test
    fun profileCard_default() {
        paparazzi.snapshot {
            ProfileCard(
                name = "Mukul Jangra",
                role = "Senior Android Engineer"
            )
        }
    }
}
```

The first run generates reference images. Subsequent runs compare against them. You commit reference images to version control. The big advantage over on-device screenshot tests is speed — tests run in seconds as JVM unit tests. The tradeoff is that `layoutlib` isn't pixel-perfect compared to a real device, so some device-specific rendering differences won't be caught.

> **🧠 Think about it:** Screenshot tests catch visual bugs that semantic tests miss, but semantic tests catch accessibility issues that screenshot tests can't see. What would a good testing strategy look like if you wanted to cover both?

#### How does Compose Preview testing work?

Compose Preview testing reuses `@Preview` composables as test inputs instead of writing separate test setup. Tools like Paparazzi and Google's Compose Preview Screenshot Testing library can render previews and compare them against reference images.

```kotlin
@Preview(showBackground = true)
@Preview(showBackground = true, uiMode = UI_MODE_NIGHT_YES)
@Composable
fun ProfileCard_Preview() {
    AppTheme {
        ProfileCard(
            name = "Mukul Jangra",
            role = "Senior Android Engineer"
        )
    }
}
```

Google's `compose-preview-screenshot-testing` library lets you annotate Preview composables and generate screenshot tests from them automatically. Your previews serve triple duty — visual feedback during development, screenshot test inputs, and documentation.

The limitation is that previews only test visual output. They can't verify interactions, navigation, or state changes. Use previews for visual regression testing and `ComposeTestRule` for behavioral testing.

### Common Follow-ups

- What's the difference between `assertIsDisplayed` and `assertExists` for off-screen LazyColumn items?
- How do you test composables that use `CompositionLocal` values?
- What's the approach for testing dark mode and different screen sizes?
- How do you make custom drawing (Canvas) accessible?
- How do you test that a screen reader announces content in the correct order?
- What happens if you forget to set contentDescription on an interactive element?
- How do you use `TestDispatcher` to control coroutine timing in Compose tests?
- How do you test animated transitions in Compose?
