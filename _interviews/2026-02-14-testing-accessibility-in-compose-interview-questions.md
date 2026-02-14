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

Testing and accessibility questions appear in senior-level Compose interviews because they reveal whether you've actually shipped production Compose code. Writing UI is one thing — verifying it works and making it usable for everyone is what separates strong candidates.

### Core Questions

#### Q1: What is ComposeTestRule and how do you set up a Compose UI test?

`ComposeTestRule` is the test rule that manages the Compose test environment. It gives you access to the semantic tree, lets you set content, find nodes, make assertions, and perform actions. You create it with `createComposeRule()` for standalone Compose tests, or `createAndroidComposeRule<YourActivity>()` when you need access to an Activity.

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

`createComposeRule()` creates a blank Compose host without an Activity, which is faster and preferred for testing individual composables. Use `createAndroidComposeRule` only when your composable depends on Activity-level resources like themes or permissions.

#### Q2: How do node finders work? What is the difference between onNode and onNodeWithText?

Node finders query the semantic tree to find composable nodes. `onNode` takes a raw `SemanticsMatcher` and is the most flexible. `onNodeWithText`, `onNodeWithContentDescription`, and `onNodeWithTag` are convenience wrappers around `onNode` with pre-built matchers.

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

`onNode` returns a `SemanticsNodeInteraction` which you chain with assertions or actions. If no node matches, the assertion fails with a clear error showing the current semantic tree, which makes debugging straightforward.

#### Q3: What are the most common assertions and actions in Compose tests?

Assertions verify node properties. Actions simulate user input.

Common assertions:
- `assertIsDisplayed()` — node exists and is visible on screen
- `assertIsNotDisplayed()` — node exists but isn't visible
- `assertExists()` — node is in the tree (may or may not be visible)
- `assertDoesNotExist()` — node is not in the tree at all
- `assertIsEnabled()` / `assertIsNotEnabled()`
- `assertTextEquals("expected text")`
- `assertHasClickAction()`

Common actions:
- `performClick()`
- `performTextInput("text")`
- `performTextClearance()`
- `performScrollTo()` — scrolls until the node is visible
- `performTouchInput { swipeLeft() }`

The difference between `assertIsDisplayed` and `assertExists` matters. A node inside a `LazyColumn` that's scrolled off screen exists in the semantic tree but isn't displayed. An `AnimatedVisibility` with `visible = false` removes the node entirely after the exit animation, so `assertDoesNotExist()` is the right check there.

#### Q4: What is the semantic tree and why does it matter for testing?

The semantic tree is a parallel tree structure that Compose builds alongside the UI tree. It describes what each composable means rather than how it looks. Every composable that has semantic properties (text, click actions, content descriptions, roles) creates a node in this tree.

Compose tests don't interact with pixels or layout coordinates — they query the semantic tree. This is why you need `Modifier.testTag("myTag")` or `Modifier.semantics { contentDescription = "close" }` to make composables findable in tests. A plain `Box` with no semantics is invisible to the test framework.

You can print the tree for debugging:

```kotlin
composeTestRule.onRoot().printToLog("SEMANTIC_TREE")
```

There are actually two versions of the tree — merged and unmerged. By default, tests use the merged tree where parent nodes absorb child semantics. A `Button` with two `Text` children appears as one node with combined text. If you need to match individual children, pass `useUnmergedTree = true` to the finder.

#### Q5: What is Modifier.testTag and when should you use it?

`Modifier.testTag("tag")` adds a test tag to a composable's semantics, making it findable via `onNodeWithTag("tag")` in tests. Use it when a composable doesn't have natural semantic identifiers like text or content descriptions.

```kotlin
// In production code
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

Don't over-use test tags. If a composable already has text or a content description, prefer `onNodeWithText` or `onNodeWithContentDescription` because those also verify that the content is correct. Test tags should be a fallback for elements like containers, dividers, or icons that don't have text.

#### Q6: How do you handle asynchronous operations in Compose tests?

Compose tests auto-synchronize with the Compose frame clock — they wait for pending recompositions and animations to finish before executing the next action or assertion. But they don't automatically wait for coroutines, network calls, or other async work outside the Compose framework.

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

#### Q7: What are semantics in Compose and how do they support accessibility?

Semantics are metadata attached to composables that describe their meaning and behavior. They serve two purposes: powering the test framework (finders and assertions query semantics) and powering accessibility services like TalkBack.

When you set `contentDescription`, `role`, `stateDescription`, or other semantic properties, you're telling both the test framework and accessibility services what a composable represents. A custom toggle button without semantics is invisible to TalkBack — a sighted user can interact with it, but a visually impaired user cannot.

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
            contentDescription = null // parent handles it
        )
    }
}
```

Setting `contentDescription = null` on the `Icon` is intentional here. The parent `IconButton` already provides a descriptive label through its semantics. If both had content descriptions, TalkBack would announce them both, which is confusing.

#### Q8: How do you set contentDescription correctly in Compose?

`contentDescription` tells accessibility services what a visual element represents. For `Image` and `Icon` composables, it's a direct parameter. For other composables, use `Modifier.semantics`.

The rules are straightforward:
- Decorative elements that add no information get `contentDescription = null`. This tells TalkBack to skip them entirely.
- Interactive elements must have a description. A button with just an icon and no text needs a content description.
- Don't repeat information that's already available. If a card has a `Text("Settings")` and a gear icon, the icon's content description should be null because the text already conveys the meaning.
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

### Deep Dive Questions

#### Q9: Explain the merged and unmerged semantic trees. When do you need useUnmergedTree?

Compose maintains two views of the semantic tree. The merged tree combines semantics from parent and children into single nodes. A `Button` containing two `Text("Hello")` and `Text("World")` composables appears as one node with text `[Hello, World]` in the merged tree. This is what TalkBack sees and what tests query by default.

The unmerged tree preserves every individual node. The same `Button` shows as a parent node with `MergeDescendants = true` and two separate child text nodes.

```kotlin
// Merged tree (default) — finds the Button as a whole
composeTestRule
    .onNodeWithText("Hello")
    .assertIsDisplayed()

// Unmerged tree — finds the individual Text node inside the Button
composeTestRule
    .onNodeWithText("Hello", useUnmergedTree = true)
    .assertIsDisplayed()
```

You need `useUnmergedTree = true` when testing specific child elements inside a merged parent. For example, verifying that a list item's subtitle text is correct when the title and subtitle are merged into a single semantic node. Without it, you can only match against the combined text of the parent.

Merging is controlled by `Modifier.semantics(mergeDescendants = true)`. Clickable composables, Buttons, and other interactive elements merge by default because TalkBack should treat them as single interactive units.

#### Q10: What is screenshot testing and how does Paparazzi work for Compose?

Screenshot testing captures a visual snapshot of your UI and compares it against a saved reference image. If the pixels differ beyond a threshold, the test fails. This catches visual regressions that semantic-based tests miss — wrong colors, broken layouts, clipped text, misaligned elements.

Paparazzi (by Cash App) runs screenshot tests on the JVM without an emulator or device. It uses `layoutlib` — the same rendering engine Android Studio uses for layout previews — to render composables into bitmaps.

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

    @Test
    fun profileCard_longName() {
        paparazzi.snapshot {
            ProfileCard(
                name = "A Very Long Name That Might Cause Issues",
                role = "Engineer"
            )
        }
    }
}
```

The first run generates reference images. Subsequent runs compare against them. You commit reference images to version control. The major advantage of Paparazzi over on-device screenshot tests is speed — tests run in seconds as JVM unit tests, not minutes on an emulator. The tradeoff is that `layoutlib` rendering isn't pixel-perfect compared to a real device, so some device-specific rendering differences won't be caught.

#### Q11: How do you test composables that depend on a ViewModel?

There are two approaches: pass the ViewModel's state directly as parameters (preferred), or create a test ViewModel.

The preferred pattern is making composables take state and callbacks as parameters rather than a ViewModel directly. This makes them easy to test in isolation:

```kotlin
// Production code — stateless composable
@Composable
fun TaskListScreen(
    tasks: List<Task>,
    onTaskClick: (Task) -> Unit,
    onDelete: (Task) -> Unit
) { /* ... */ }

// Test — no ViewModel needed
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

#### Q12: How do you set up traversal order for accessibility in Compose?

Traversal order controls the sequence in which TalkBack navigates through elements. By default, Compose uses a top-to-bottom, start-to-end reading order based on the layout. But sometimes the visual order doesn't match the logical order, especially with overlapping elements or custom layouts.

Use `Modifier.semantics { traversalIndex = N }` to override the order. Lower values come first:

```kotlin
@Composable
fun HeaderWithAction() {
    Box {
        // Visually at the top-right, but should be read last
        IconButton(
            onClick = { /* settings */ },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .semantics { traversalIndex = 2f }
        ) {
            Icon(Icons.Default.Settings, contentDescription = "Settings")
        }

        // Should be read first
        Text(
            text = "Welcome back",
            modifier = Modifier
                .align(Alignment.TopStart)
                .semantics { traversalIndex = 0f }
        )

        // Read second
        Text(
            text = "Here are your tasks",
            modifier = Modifier
                .align(Alignment.CenterStart)
                .semantics { traversalIndex = 1f }
        )
    }
}
```

`isTraversalGroup = true` on a parent composable tells TalkBack to finish all children inside the group before moving to the next sibling group. This is important for layouts where elements from different groups are interleaved visually.

#### Q13: What are live regions in Compose accessibility?

Live regions tell accessibility services to announce content changes automatically, without the user navigating to the element. This is for dynamic content that updates in place — error messages, countdown timers, loading status, or toast-like notifications.

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
- **Polite** — waits for TalkBack to finish its current announcement before reading the update. Use this for non-urgent changes like form validation errors.
- **Assertive** — interrupts the current announcement immediately. Use this sparingly, only for critical alerts like connectivity loss or session expiration.

Without `liveRegion`, TalkBack won't announce the error text unless the user navigates to it manually. The user fills in a form, makes a mistake, and hears nothing — that's a broken accessibility experience.

#### Q14: How do you define semantic roles and what roles are available?

Roles tell accessibility services what kind of component an element is. This affects how TalkBack announces the element and what gestures are available. For standard Material composables like `Button`, `Checkbox`, or `Switch`, roles are set automatically. You need to set them manually for custom components.

Available roles include `Button`, `Checkbox`, `Switch`, `RadioButton`, `Tab`, `Image`, `DropdownList`, and `Range`. Setting the right role ensures TalkBack says "double tap to toggle" for switches and "double tap to activate" for buttons.

```kotlin
@Composable
fun CustomSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Box(
        modifier = Modifier
            .semantics {
                role = Role.Switch
                contentDescription = "Dark mode"
                stateDescription = if (checked) "On" else "Off"
            }
            .toggleable(
                value = checked,
                onValueChange = onCheckedChange,
                role = Role.Switch
            )
            .size(52.dp, 28.dp)
            .background(
                if (checked) Color.Blue else Color.Gray,
                RoundedCornerShape(14.dp)
            )
    ) {
        // Custom thumb drawing
    }
}
```

If you pass `role` to both `Modifier.semantics` and `Modifier.toggleable`, the one in `toggleable` takes precedence since it merges into the semantics. Generally, pass it through the interaction modifier (`clickable`, `toggleable`, `selectable`) and let that handle it.

#### Q15: How do you test accessibility properties in Compose tests?

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

The pattern is: define semantics in your composable, then verify them in tests. This creates a contract — if someone removes the content description or changes the role, the test fails. Without these tests, accessibility regressions go unnoticed because developers don't manually test with TalkBack on every change.

#### Q16: How does Compose Preview testing work?

Compose Preview testing uses `@Preview` composables as test inputs. Instead of writing separate test setup code, you reuse the same previews you already have in your codebase. Tools like Paparazzi and the Compose Preview Screenshot Testing library can render previews and compare them.

```kotlin
// Preview defined in production code
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

Google's Compose Preview Screenshot Testing library (`compose-preview-screenshot-testing`) lets you annotate Preview composables and generate screenshot tests from them automatically. This means your previews serve triple duty — visual feedback during development, screenshot test inputs, and documentation.

The limitation is that previews only test visual output. They can't verify interactions, navigation, or state transitions. Use previews for visual regression testing and `ComposeTestRule` for behavioral testing.

#### Q17: What are some common testing pitfalls in Compose?

A few patterns that trip people up:

- **Forgetting idle synchronization** — Compose tests auto-wait for recomposition, but not for coroutines or delay-based logic. If your composable launches a coroutine that updates state after a delay, the test will assert before the state changes. Use `waitUntil` or advance the test dispatcher.
- **Testing implementation instead of behavior** — Don't assert on the number of recompositions or internal state. Test what the user sees: "after clicking X, text Y is displayed." This keeps tests stable when you refactor internals.
- **Missing keys in LazyColumn** — If you don't provide stable keys, items might not be findable by test tag after the list recomposes because their positions changed.
- **Over-relying on Thread.sleep** — Never use `Thread.sleep` in Compose tests. Use `waitUntil`, `advanceTimeBy` on the test clock, or `TestDispatcher` for coroutine timing.

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

#### Q18: How do you handle scrolling in Compose tests?

For regular scrollable columns, use `performScrollTo()` which scrolls until the target node is visible:

```kotlin
composeTestRule
    .onNodeWithText("Terms and Conditions")
    .performScrollTo()
    .assertIsDisplayed()
```

For `LazyColumn`, items that are off-screen don't exist in the semantic tree until they're composed. You can't find a node that hasn't been created yet. Use `performScrollToIndex` or `performScrollToKey`:

```kotlin
// Scroll to a specific index
composeTestRule
    .onNodeWithTag("task_list")
    .performScrollToIndex(25)

// Scroll to a specific key
composeTestRule
    .onNodeWithTag("task_list")
    .performScrollToKey("task_42")
```

`performScrollToKey` requires that you set `key` in your `LazyColumn`'s `items` block. This is another reason stable keys are important — not just for animation and performance, but for testability.

### Common Follow-ups

- How do you test navigation transitions in Compose?
- What's the difference between `assertIsDisplayed` and `assertExists` for off-screen LazyColumn items?
- How do you test composables that use `CompositionLocal` values?
- How would you set up Compose testing with Hilt dependency injection?
- What's the approach for testing dark mode and different screen sizes?
- How do you make custom drawing (Canvas) accessible?
- How do you test that a screen reader announces content in the correct order?
- What happens if you forget to set contentDescription on an interactive element?
