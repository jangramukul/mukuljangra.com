---
title: "Jetpack Compose Mastery"
layout: course
description: "Build modern Android UIs from scratch — declarative thinking, state management, side effects, custom layouts, animations, performance, and testing."
icon: "🎨"
color: "#60a5fa"
difficulty: "Beginner to Expert"
modules: 10
lessons: 52
duration: "8 weeks"
order: 3
tags:
  - Jetpack Compose
  - UI
  - Android
what_you_learn:
  - "Think declaratively and build UIs with composable functions"
  - "Manage state with remember, State, and ViewModel integration"
  - "Handle side effects with LaunchedEffect, DisposableEffect, and rememberUpdatedState"
  - "Build custom layouts, modifiers, and advanced theming systems"
  - "Create smooth animations with animate*AsState, AnimatedVisibility, and transitions"
  - "Optimize Compose performance — recomposition, stability, and lazy layouts"
  - "Test Compose UIs with ComposeTestRule"
prerequisites:
  - "Kotlin fundamentals"
  - "Basic Android development"
  - "XML layouts experience (helpful, not required)"
---

## Module 1: Thinking in Compose

Compose isn't just a new UI toolkit — it's a fundamentally different mental model. Before writing any code, you need to shift from imperative to declarative thinking.

### Lesson 1.1: Imperative vs Declarative UI

In the View system, you tell the framework **how** to update the UI step by step. In Compose, you describe **what** the UI should look like for a given state, and the framework figures out how to get there.

```kotlin
// Imperative (View system) — step by step mutations
fun updateUser(user: User) {
    nameTextView.text = user.name
    emailTextView.text = user.email
    avatarView.setImageUrl(user.avatarUrl)
    if (user.isPremium) {
        premiumBadge.visibility = View.VISIBLE
    } else {
        premiumBadge.visibility = View.GONE
    }
}

// Declarative (Compose) — describe the final state
@Composable
fun UserCard(user: User) {
    Row {
        Avatar(url = user.avatarUrl)
        Column {
            Text(user.name)
            Text(user.email)
            if (user.isPremium) {
                PremiumBadge()
            }
        }
    }
}
```

**The key insight** — In Compose, `if (user.isPremium)` doesn't show/hide a badge. It controls whether the badge **exists** in the composition. When `isPremium` changes from true to false, the badge is removed from the tree entirely, not hidden.

**Key takeaway:** Compose functions describe UI as a function of state. When state changes, the function re-executes (recomposes), and Compose updates only what changed.

### Lesson 1.2: Composable Functions

```kotlin
@Composable
fun Greeting(name: String) {
    Text(text = "Hello, $name!")
}

// Composable functions:
// ✅ Can call other @Composable functions
// ✅ Can have parameters (data flows down)
// ✅ Can have local state with remember
// ❌ Cannot return values (they emit UI)
// ❌ Must not have side effects in composition
```

**@Composable changes the function signature** — Under the hood, the Compose compiler adds a `Composer` parameter and generates code for the slot table. A `@Composable` function isn't a regular function — it participates in the composition tree.

**Key takeaway:** `@Composable` functions are the building blocks. They should be pure functions of their parameters — same input, same UI output.

### Lesson 1.3: Recomposition

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }

    Column {
        Text("Count: $count")  // Recomposes when count changes
        Button(onClick = { count++ }) {
            Text("Increment")  // Does NOT recompose (no state dependency)
        }
    }
}
```

**Recomposition is smart** — Compose tracks which composable functions read which state. When `count` changes, only `Text("Count: $count")` recomposes — not the entire `Column` or the `Button`. This is called **intelligent recomposition**.

**Key takeaway:** Recomposition can happen at any time, in any order, and can be skipped. Never put side effects directly in composable functions — that code might run more often or less often than you expect.

### Lesson 1.4: Composition vs Layout vs Drawing

Compose renders UI in three phases, and understanding them prevents performance issues.

- **Composition** — Runs your `@Composable` functions to build the UI tree. This is where `remember`, `if/else`, and `for` loops execute.
- **Layout** — Measures and positions each element. Runs `Modifier.size()`, `Modifier.padding()`, etc.
- **Drawing** — Paints pixels. Runs `Modifier.background()`, `Canvas`, `drawBehind`.

```kotlin
@Composable
fun AnimatedBox(progress: Float) {
    // ❌ Bad — reads progress during Composition, triggers full recomposition
    Box(
        modifier = Modifier
            .size((100 * progress).dp)
            .background(Color.Blue)
    )

    // ✅ Good — reads progress only during Drawing, skips Composition
    Box(
        modifier = Modifier
            .size(100.dp)
            .drawBehind {
                drawRect(color = Color.Blue, size = size * progress)
            }
    )
}
```

**Key takeaway:** Push state reads to the latest possible phase. Reading state in Drawing is cheaper than Layout, which is cheaper than Composition.

### Quiz: Thinking in Compose

#### In Compose, what happens when a boolean condition controlling a composable changes from true to false?

- ❌ The composable's visibility is set to GONE
- ❌ The composable is hidden but remains in the tree
- ✅ The composable is removed from the composition tree entirely
- ❌ The composable is recycled into a pool for reuse

> **Explanation:** Unlike the View system where you toggle visibility, Compose controls whether a composable **exists** in the tree. When the condition is false, the composable is removed entirely from the composition — it's not hidden, it's gone.

#### Which of the following is true about recomposition in Compose?

- ❌ It always recomposes the entire composable tree
- ❌ It runs in a fixed, predictable order every time
- ✅ It only recomposes functions that read the changed state
- ❌ It guarantees exactly one execution per state change

> **Explanation:** Compose uses intelligent recomposition — it tracks which composable functions read which state and only re-executes those functions. Recomposition can happen in any order, can be skipped, and should never be relied upon for side effects.

#### Why should you push state reads to later rendering phases (Layout/Drawing) when possible?

- ❌ It makes the code more readable
- ❌ It reduces APK size
- ✅ It avoids triggering full recomposition, improving performance
- ❌ It is required by the Compose compiler

> **Explanation:** Reading state during the Drawing phase skips both Composition and Layout phases. Reading during Layout skips Composition. By deferring reads to the latest possible phase, you minimize the work Compose needs to do when state changes.

### Coding Challenge: Declarative Profile Card

Build a `ProfileCard` composable that displays a user's name, role, and an "Online" status indicator. The status indicator should be a green circle when online and a gray circle when offline. Include a toggle button that switches the online/offline state. The card should demonstrate declarative UI — the indicator should exist only when the user is online using conditional composition, not visibility toggling.

#### Solution

```kotlin
@Composable
fun ProfileCard(name: String, role: String) {
    var isOnline by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(name, style = MaterialTheme.typography.headlineSmall)
                    Text(role, color = Color.Gray)
                }
                if (isOnline) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .background(Color.Green, CircleShape)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Online", color = Color.Green, fontSize = 12.sp)
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { isOnline = !isOnline }) {
                Text(if (isOnline) "Go Offline" else "Go Online")
            }
        }
    }
}
```

This solution uses conditional composition (`if (isOnline)`) so the green indicator and "Online" text are added to or removed from the tree entirely — not hidden. The `remember { mutableStateOf(false) }` pattern stores the toggle state across recompositions, and only the composables that read `isOnline` recompose when it changes.

---

## Module 2: State Management

State is the core of Compose. Get it right, and your UI is predictable. Get it wrong, and you'll fight recomposition bugs.

### Lesson 2.1: remember and mutableStateOf

```kotlin
@Composable
fun LoginForm() {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isPasswordVisible by remember { mutableStateOf(false) }

    OutlinedTextField(
        value = email,
        onValueChange = { email = it },
        label = { Text("Email") }
    )

    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text("Password") },
        visualTransformation = if (isPasswordVisible)
            VisualTransformation.None
        else
            PasswordVisualTransformation()
    )
}
```

**`remember` survives recomposition** but not configuration changes (rotation). For that, use `rememberSaveable`.

**Key takeaway:** `remember` keeps a value across recompositions. `mutableStateOf` makes it observable — changes trigger recomposition.

### Lesson 2.2: State Hoisting

```kotlin
// ❌ State inside — not reusable, not testable
@Composable
fun SearchBar() {
    var query by remember { mutableStateOf("") }
    TextField(value = query, onValueChange = { query = it })
}

// ✅ State hoisted — parent controls the state
@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier
    )
}

// Parent owns the state
@Composable
fun SearchScreen(viewModel: SearchViewModel = viewModel()) {
    val query by viewModel.query.collectAsStateWithLifecycle()

    SearchBar(
        query = query,
        onQueryChange = viewModel::onQueryChange
    )
}
```

**The pattern** — State flows down (parameters), events flow up (callbacks). This makes composables reusable, testable, and predictable.

**Key takeaway:** Hoist state to the lowest common ancestor that needs it. UI components should be stateless — they receive data and emit events.

### Lesson 2.3: rememberSaveable and State Restoration

```kotlin
@Composable
fun NoteEditor() {
    // Survives configuration changes AND process death
    var title by rememberSaveable { mutableStateOf("") }
    var body by rememberSaveable { mutableStateOf("") }

    // For complex objects, use a custom Saver
    var selectedTab by rememberSaveable(stateSaver = TabSaver) {
        mutableStateOf(Tab.EDIT)
    }
}

// Custom Saver for non-primitive types
val TabSaver = Saver<Tab, String>(
    save = { it.name },
    restore = { Tab.valueOf(it) }
)
```

**Key takeaway:** Use `rememberSaveable` for state that should survive configuration changes. Use custom `Saver` for non-primitive types. For complex state, use a ViewModel.

### Lesson 2.4: derivedStateOf

```kotlin
@Composable
fun ItemList(items: List<Item>) {
    val sortedItems by remember(items) {
        derivedStateOf {
            items.sortedBy { it.name }
        }
    }

    // Only recomputes when the sorted result actually changes
    LazyColumn {
        items(sortedItems) { item ->
            ItemRow(item)
        }
    }
}

// Practical example — form validation
@Composable
fun RegistrationForm() {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    val isFormValid by remember {
        derivedStateOf {
            email.contains("@") && password.length >= 8
        }
    }

    Button(
        onClick = { submit() },
        enabled = isFormValid  // Only recomposes when validity changes
    )
}
```

**Key takeaway:** `derivedStateOf` is for expensive computations that depend on other state. It only triggers recomposition when the derived value actually changes, not when the input state changes.

### Quiz: State Management

#### What is the difference between `remember` and `rememberSaveable`?

- ❌ `remember` is for primitives, `rememberSaveable` is for objects
- ❌ They are identical in behavior
- ✅ `remember` survives recomposition only, while `rememberSaveable` also survives configuration changes and process death
- ❌ `rememberSaveable` is faster than `remember`

> **Explanation:** `remember` stores a value across recompositions but loses it on configuration changes (like screen rotation). `rememberSaveable` persists through configuration changes and process death by saving to the `Bundle`, making it suitable for user-entered data like form fields.

#### What is the state hoisting pattern in Compose?

- ❌ Moving state into a global singleton
- ✅ Moving state up to the caller and passing it down as parameters with events flowing up as callbacks
- ❌ Storing all state in a database
- ❌ Using only ViewModel for all state management

> **Explanation:** State hoisting means the composable itself becomes stateless — it receives state via parameters (data flows down) and communicates changes via callbacks (events flow up). This makes composables reusable, testable, and predictable.

#### When should you use `derivedStateOf`?

- ❌ For every state variable in your composable
- ❌ Only inside ViewModels
- ✅ When you have a computed value that should only trigger recomposition when the derived result changes, not when the input changes
- ❌ As a replacement for `remember` in all cases

> **Explanation:** `derivedStateOf` is ideal for expensive computations like filtering or sorting that depend on other state. It prevents unnecessary recomposition by only notifying observers when the derived value actually changes — for example, a form validity boolean that only changes at specific thresholds.

### Coding Challenge: Smart Form Validator

Build a `RegistrationForm` composable with three fields: email, password, and confirm password. Use `derivedStateOf` to compute form validity (email must contain "@", password must be at least 8 characters, and both password fields must match). Display real-time validation messages below each field and a submit button that is only enabled when all validations pass. Hoist the state properly.

#### Solution

```kotlin
@Composable
fun RegistrationForm() {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }

    val emailError by remember {
        derivedStateOf {
            if (email.isNotEmpty() && !email.contains("@")) "Invalid email" else null
        }
    }
    val passwordError by remember {
        derivedStateOf {
            if (password.isNotEmpty() && password.length < 8) "At least 8 characters" else null
        }
    }
    val confirmError by remember {
        derivedStateOf {
            if (confirmPassword.isNotEmpty() && confirmPassword != password) "Passwords don't match" else null
        }
    }
    val isFormValid by remember {
        derivedStateOf {
            email.contains("@") && password.length >= 8 && password == confirmPassword
        }
    }

    Column(modifier = Modifier.padding(16.dp)) {
        ValidatedField(value = email, onValueChange = { email = it }, label = "Email", error = emailError)
        Spacer(modifier = Modifier.height(8.dp))
        ValidatedField(value = password, onValueChange = { password = it }, label = "Password", error = passwordError)
        Spacer(modifier = Modifier.height(8.dp))
        ValidatedField(value = confirmPassword, onValueChange = { confirmPassword = it }, label = "Confirm Password", error = confirmError)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { /* submit */ }, enabled = isFormValid) {
            Text("Register")
        }
    }
}

@Composable
fun ValidatedField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    error: String?
) {
    Column {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            isError = error != null,
            modifier = Modifier.fillMaxWidth()
        )
        if (error != null) {
            Text(error, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
        }
    }
}
```

This solution uses `rememberSaveable` for user input (survives rotation), `derivedStateOf` for computed validations (only recomposes when the validation result changes, not on every keystroke), and a stateless `ValidatedField` component with hoisted state for reusability.

---

## Module 3: Layouts

Compose provides flexible layout primitives that replace LinearLayout, FrameLayout, and ConstraintLayout.

### Lesson 3.1: Row, Column, and Box

```kotlin
@Composable
fun ProfileHeader(user: User) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Avatar(url = user.avatarUrl, size = 48.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(user.name, fontWeight = FontWeight.Bold)
            Text(user.email, color = Color.Gray, fontSize = 14.sp)
        }
        IconButton(onClick = { /* settings */ }) {
            Icon(Icons.Default.Settings, contentDescription = "Settings")
        }
    }
}

// Box — stack children on top of each other
@Composable
fun ImageWithBadge(imageUrl: String, count: Int) {
    Box {
        AsyncImage(model = imageUrl, contentDescription = null)
        if (count > 0) {
            Badge(modifier = Modifier.align(Alignment.TopEnd)) {
                Text("$count")
            }
        }
    }
}
```

**Key takeaway:** `Row` = horizontal, `Column` = vertical, `Box` = stacked. Use `Modifier.weight()` for proportional sizing. These replace 90% of XML layout needs.

### Lesson 3.2: Modifier Chain

```kotlin
@Composable
fun StyledCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)  // Outer padding
            .clip(RoundedCornerShape(12.dp))
            .clickable { /* handle click */ }
            .padding(16.dp)  // Inner padding (after clip)
    ) {
        Text("Content")
    }
}
```

**Modifier order matters** — Modifiers are applied outside-in. `padding` before `background` adds space outside the background. `padding` after `background` adds space inside. Think of it as wrapping layers.

**Key takeaway:** Read the modifier chain top-to-bottom as "wrap this composable in these layers." Order determines behavior — especially for padding, background, clickable, and clip.

### Lesson 3.3: LazyColumn and LazyRow

```kotlin
@Composable
fun MessageList(messages: List<Message>) {
    val listState = rememberLazyListState()

    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        items(
            items = messages,
            key = { it.id }  // Stable keys for efficient recomposition
        ) { message ->
            MessageCard(message)
        }

        // Header
        item { SectionHeader("Messages") }

        // Sticky headers
        stickyHeader { DateHeader("Today") }
    }

    // Scroll to top
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(0)
        }
    }
}
```

**Always provide stable keys** — Without `key`, Compose uses position-based identity. If items are reordered, deleted, or inserted, this causes incorrect recomposition. `key = { it.id }` tells Compose to track items by their unique ID.

**Key takeaway:** `LazyColumn` only composes visible items — it's the RecyclerView replacement. Always use `key` for stable item identity.

### Lesson 3.4: Custom Layouts

```kotlin
// Custom layout that places children in a flow/wrap pattern
@Composable
fun FlowRow(
    modifier: Modifier = Modifier,
    spacing: Dp = 8.dp,
    content: @Composable () -> Unit
) {
    Layout(
        content = content,
        modifier = modifier
    ) { measurables, constraints ->
        val spacingPx = spacing.roundToPx()
        val placeables = measurables.map { it.measure(constraints) }

        var xPos = 0
        var yPos = 0
        var rowHeight = 0

        val positions = placeables.map { placeable ->
            if (xPos + placeable.width > constraints.maxWidth) {
                xPos = 0
                yPos += rowHeight + spacingPx
                rowHeight = 0
            }
            val position = IntOffset(xPos, yPos)
            xPos += placeable.width + spacingPx
            rowHeight = maxOf(rowHeight, placeable.height)
            position
        }

        val height = yPos + rowHeight
        layout(constraints.maxWidth, height) {
            placeables.forEachIndexed { index, placeable ->
                placeable.placeRelative(positions[index])
            }
        }
    }
}
```

**Key takeaway:** The `Layout` composable gives you full control over measurement and placement. Measure children with constraints, then place them in the `layout` block.

### Quiz: Layouts

#### Why is it important to provide a `key` parameter in `LazyColumn` items?

- ❌ It improves compile time
- ❌ It is required by the Compose compiler
- ✅ It enables Compose to track item identity across reorderings, deletions, and insertions for efficient recomposition
- ❌ It adds accessibility labels to each item

> **Explanation:** Without a stable `key`, Compose uses position-based identity. If items are reordered or deleted, Compose may incorrectly recompose the wrong items. Providing `key = { it.id }` lets Compose track each item uniquely, enabling correct and efficient diffing.

#### What does `Modifier.weight(1f)` do inside a `Row`?

- ❌ Sets the item's opacity to 100%
- ✅ Makes the item fill the remaining space proportionally after other items are measured
- ❌ Sets the font weight to bold
- ❌ Adds padding equal to the parent width

> **Explanation:** `weight` in a `Row` (or `Column`) makes the child fill remaining horizontal (or vertical) space after all non-weighted children are measured. Multiple weighted children share the remaining space proportionally to their weight values.

#### Why does modifier order matter in Compose?

- ❌ It doesn't — Compose sorts modifiers automatically
- ❌ Alphabetical ordering is required for compilation
- ✅ Modifiers are applied outside-in as wrapping layers, so order changes behavior — e.g., padding before vs after background
- ❌ Only the first modifier in the chain is applied

> **Explanation:** Modifiers wrap the composable in layers from top to bottom. `padding` before `background` adds space outside the colored area; `padding` after `background` adds space inside it. Similarly, `clickable` before `clip` vs after `clip` changes the click region shape.

### Coding Challenge: Tag Chips Layout

Build a `TagChipGroup` composable that takes a list of tag strings and displays them as chips in a horizontal scrollable `LazyRow`. Each chip should show the tag text with a background color, rounded corners, and a delete icon. When the delete icon is tapped, the tag is removed from the list. Use `key` for stable identity and `Arrangement.spacedBy` for spacing.

#### Solution

```kotlin
@Composable
fun TagChipGroup(initialTags: List<String>) {
    var tags by remember { mutableStateOf(initialTags) }

    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(items = tags, key = { it }) { tag ->
            TagChip(
                label = tag,
                onDelete = { tags = tags - tag }
            )
        }
    }
}

@Composable
fun TagChip(label: String, onDelete: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
            fontSize = 14.sp
        )
        Icon(
            imageVector = Icons.Default.Close,
            contentDescription = "Remove $label",
            modifier = Modifier
                .size(16.dp)
                .clickable { onDelete() },
            tint = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}
```

This solution uses `LazyRow` for horizontal scrolling, `key = { it }` for stable identity so removals are animated correctly, and a stateless `TagChip` component. The modifier chain on the chip demonstrates correct ordering — `clip` before `background` ensures the background respects the rounded shape.

---

## Module 4: Side Effects

Side effects are operations that escape the scope of a composable function — network calls, analytics, listeners. Compose provides effect handlers to manage them safely.

### Lesson 4.1: LaunchedEffect

```kotlin
@Composable
fun ProfileScreen(userId: String) {
    val viewModel: ProfileViewModel = viewModel()

    // Runs when userId changes, cancels previous effect
    LaunchedEffect(userId) {
        viewModel.loadProfile(userId)
    }

    // Runs once when entering composition
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is UiEvent.Navigate -> navigator.navigate(event.route)
                is UiEvent.ShowSnackbar -> snackbarState.showSnackbar(event.message)
            }
        }
    }
}
```

**Key takeaway:** `LaunchedEffect` launches a coroutine scoped to the composition. When the key changes, the previous coroutine is cancelled and a new one starts. When the composable leaves the tree, the coroutine is cancelled.

### Lesson 4.2: DisposableEffect

```kotlin
@Composable
fun LifecycleObserver(onResume: () -> Unit, onPause: () -> Unit) {
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> onResume()
                Lifecycle.Event.ON_PAUSE -> onPause()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
}
```

**Key takeaway:** `DisposableEffect` is for effects that need cleanup — listeners, callbacks, subscriptions. The `onDispose` block runs when the key changes or when leaving composition.

### Lesson 4.3: SideEffect and rememberUpdatedState

```kotlin
// SideEffect — runs after every successful recomposition
@Composable
fun AnalyticsScreen(screenName: String) {
    SideEffect {
        analytics.logScreenView(screenName)
    }
}

// rememberUpdatedState — capture latest value in long-lived effects
@Composable
fun TimerEffect(onTick: () -> Unit) {
    val currentOnTick by rememberUpdatedState(onTick)

    LaunchedEffect(Unit) {  // Never restarts
        while (true) {
            delay(1000)
            currentOnTick()  // Always calls the latest callback
        }
    }
}
```

**Key takeaway:** `rememberUpdatedState` keeps a reference to the latest value without restarting the effect. Use it when a long-lived effect needs access to changing parameters.

### Lesson 4.4: snapshotFlow

```kotlin
@Composable
fun InfiniteScrollList(
    items: List<Item>,
    onLoadMore: () -> Unit
) {
    val listState = rememberLazyListState()

    // Convert Compose state to Flow
    LaunchedEffect(listState) {
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
        }
        .distinctUntilChanged()
        .filter { lastVisibleIndex ->
            lastVisibleIndex >= items.size - 5
        }
        .collect {
            onLoadMore()
        }
    }

    LazyColumn(state = listState) {
        items(items) { item -> ItemRow(item) }
    }
}
```

**Key takeaway:** `snapshotFlow` converts Compose snapshot state into a Flow. It's the bridge between the Compose world and the coroutine world.

### Quiz: Side Effects

#### What happens to a `LaunchedEffect` coroutine when its key changes?

- ❌ It continues running with the new key
- ❌ A second coroutine starts alongside the first
- ✅ The previous coroutine is cancelled and a new one starts
- ❌ The effect is ignored until the composable recomposes

> **Explanation:** When the key of a `LaunchedEffect` changes, Compose cancels the currently running coroutine and launches a new one with the new key value. This ensures the effect always corresponds to the current state — for example, loading data for the current user ID.

#### When should you use `DisposableEffect` instead of `LaunchedEffect`?

- ❌ When you need to launch a coroutine
- ✅ When your effect requires explicit cleanup, like removing listeners or observers
- ❌ When the effect should run on every recomposition
- ❌ When you need to access a ViewModel

> **Explanation:** `DisposableEffect` is specifically designed for effects that need cleanup via `onDispose`. Use it for registering/unregistering observers, adding/removing listeners, or any setup/teardown pattern. `LaunchedEffect` handles cleanup through coroutine cancellation.

#### What does `rememberUpdatedState` solve?

- ❌ It makes state survive process death
- ❌ It replaces `rememberSaveable`
- ✅ It captures the latest value of a parameter inside a long-lived effect without restarting the effect
- ❌ It caches network responses

> **Explanation:** When a `LaunchedEffect` uses `Unit` as its key (runs once), it captures the initial callback value. If the callback changes, the effect still uses the stale reference. `rememberUpdatedState` keeps a ref to the latest value so the long-lived effect always calls the current callback without needing to restart.

### Coding Challenge: Auto-Dismiss Snackbar

Build a `TimedMessage` composable that displays a message card and automatically dismisses it after 3 seconds. Use `LaunchedEffect` to start the timer, and ensure that if the message changes while the timer is running, the old timer is cancelled and a new 3-second timer starts. Include a manual "Dismiss" button. Use `rememberUpdatedState` to ensure the dismiss callback is always current.

#### Solution

```kotlin
@Composable
fun TimedMessage(
    message: String?,
    onDismiss: () -> Unit
) {
    if (message == null) return

    val currentOnDismiss by rememberUpdatedState(onDismiss)

    LaunchedEffect(message) {
        delay(3000)
        currentOnDismiss()
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = message,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium
            )
            TextButton(onClick = { currentOnDismiss() }) {
                Text("Dismiss")
            }
        }
    }
}

// Usage
@Composable
fun NotificationHost() {
    var currentMessage by remember { mutableStateOf<String?>(null) }

    TimedMessage(
        message = currentMessage,
        onDismiss = { currentMessage = null }
    )

    Button(onClick = { currentMessage = "New notification at ${System.currentTimeMillis()}" }) {
        Text("Show Message")
    }
}
```

The `LaunchedEffect` key is `message`, so when the message changes, the previous timer is cancelled and a new 3-second countdown begins. `rememberUpdatedState` ensures the `onDismiss` callback is always the latest reference, even though the `LaunchedEffect` doesn't restart when `onDismiss` changes.

---

## Module 5: Theming and Styling

### Lesson 5.1: Material 3 Theming

```kotlin
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) darkColorScheme(
        primary = Color(0xFF60A5FA),
        secondary = Color(0xFFA78BFA),
        background = Color(0xFF111827)
    ) else lightColorScheme()

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(
            headlineLarge = TextStyle(
                fontFamily = FontFamily(Font(R.font.inter_bold)),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold
            )
        ),
        content = content
    )
}

// Access theme values
@Composable
fun ThemedCard() {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Text(
            "Styled",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
```

**Key takeaway:** Use `MaterialTheme` for consistent styling across the app. Access colors via `MaterialTheme.colorScheme` and typography via `MaterialTheme.typography`.

### Lesson 5.2: CompositionLocal

```kotlin
// Define a CompositionLocal
val LocalSpacing = compositionLocalOf { Spacing() }

data class Spacing(
    val small: Dp = 4.dp,
    val medium: Dp = 8.dp,
    val large: Dp = 16.dp,
    val extraLarge: Dp = 24.dp
)

// Provide values
@Composable
fun AppTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalSpacing provides Spacing()
    ) {
        MaterialTheme(content = content)
    }
}

// Consume anywhere in the tree
@Composable
fun CardContent() {
    val spacing = LocalSpacing.current
    Column(modifier = Modifier.padding(spacing.large)) {
        Text("Title", modifier = Modifier.padding(bottom = spacing.medium))
        Text("Body")
    }
}
```

**Key takeaway:** `CompositionLocal` passes data implicitly through the tree without threading it through every composable's parameters. Use sparingly — explicit parameters are usually better.

### Quiz: Theming and Styling

#### How do you access the current theme colors inside a composable?

- ❌ `Theme.colors.primary`
- ❌ `R.color.primary`
- ✅ `MaterialTheme.colorScheme.primary`
- ❌ `Color.Primary`

> **Explanation:** In Material 3 Compose, theme values are accessed through the `MaterialTheme` object. Colors use `MaterialTheme.colorScheme`, typography uses `MaterialTheme.typography`, and shapes use `MaterialTheme.shapes`. This replaces the XML resource-based theming approach.

#### What is `CompositionLocal` used for?

- ❌ Storing data in SharedPreferences
- ❌ Defining compile-time constants
- ✅ Passing data implicitly through the composition tree without explicit parameters
- ❌ Creating local database tables

> **Explanation:** `CompositionLocal` allows you to provide values at a higher level in the tree and consume them anywhere below without threading them through every composable's parameters. `MaterialTheme` itself uses `CompositionLocal` under the hood to provide colors, typography, and shapes.

### Coding Challenge: Custom Design System

Create a custom design system with a `CompositionLocal` for app-specific dimensions (`AppDimensions` data class with `cardElevation`, `iconSize`, `borderRadius`) and a custom theme wrapper that provides both Material theming and your custom dimensions. Build a `DesignSystemCard` composable that uses values from both `MaterialTheme` and your custom `CompositionLocal`.

#### Solution

```kotlin
data class AppDimensions(
    val cardElevation: Dp = 4.dp,
    val iconSize: Dp = 24.dp,
    val borderRadius: Dp = 12.dp
)

val LocalAppDimensions = compositionLocalOf { AppDimensions() }

@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dimensions: AppDimensions = AppDimensions(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()

    CompositionLocalProvider(
        LocalAppDimensions provides dimensions
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            content = content
        )
    }
}

@Composable
fun DesignSystemCard(title: String, icon: ImageVector) {
    val dimensions = LocalAppDimensions.current

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = dimensions.cardElevation),
        shape = RoundedCornerShape(dimensions.borderRadius),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(dimensions.iconSize),
                tint = MaterialTheme.colorScheme.primary
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}
```

This solution defines a custom `CompositionLocal` for app-specific dimensions alongside Material theming. The `AppTheme` wrapper provides both systems, and `DesignSystemCard` consumes values from both — `MaterialTheme` for colors/typography and `LocalAppDimensions` for layout dimensions.

---

## Module 6: Navigation

### Lesson 6.1: Compose Navigation Basics

```kotlin
@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(
                onNavigateToProfile = { userId ->
                    navController.navigate("profile/$userId")
                }
            )
        }
        composable(
            route = "profile/{userId}",
            arguments = listOf(navArgument("userId") { type = NavType.StringType })
        ) { backStackEntry ->
            val userId = backStackEntry.arguments?.getString("userId") ?: return@composable
            ProfileScreen(userId = userId)
        }
    }
}
```

### Lesson 6.2: Type-Safe Navigation

```kotlin
// Define routes as sealed types
@Serializable
sealed class Route {
    @Serializable
    data object Home : Route()

    @Serializable
    data class Profile(val userId: String) : Route()

    @Serializable
    data class Settings(val section: String = "general") : Route()
}
```

**Key takeaway:** Use type-safe navigation with Kotlin Serialization to avoid string-based route errors. Each route becomes a data class with typed parameters.

### Quiz: Navigation

#### What is the main advantage of type-safe navigation over string-based routes?

- ❌ It runs faster at runtime
- ❌ It uses less memory
- ✅ It catches route and argument errors at compile time instead of runtime
- ❌ It is required by the Compose Navigation library

> **Explanation:** String-based routes like `"profile/$userId"` can have typos, missing arguments, or type mismatches that only crash at runtime. Type-safe navigation uses sealed classes and data classes, so the compiler catches errors like missing parameters or wrong types during compilation.

#### What does `NavHost` do in Compose Navigation?

- ❌ It hosts the application server
- ✅ It acts as a container that manages navigation between composable destinations based on the current route
- ❌ It replaces the Activity lifecycle
- ❌ It caches all screens in memory

> **Explanation:** `NavHost` is the composable container that displays the current destination screen. It takes a `NavController` and a `startDestination`, and swaps the displayed composable as the user navigates. Each `composable` block inside `NavHost` defines a destination and its route.

### Coding Challenge: Multi-Screen Navigation

Build a two-screen navigation setup using Compose Navigation. Create a `BookListScreen` that displays a list of book titles, and a `BookDetailScreen` that shows the selected book's title and author. Pass the book ID as a navigation argument. Use type-safe routes with a sealed class.

#### Solution

```kotlin
@Serializable
sealed class BookRoute {
    @Serializable
    data object List : BookRoute()

    @Serializable
    data class Detail(val bookId: String) : BookRoute()
}

data class Book(val id: String, val title: String, val author: String)

val sampleBooks = listOf(
    Book("1", "Clean Code", "Robert C. Martin"),
    Book("2", "Effective Kotlin", "Marcin Moskala"),
    Book("3", "Kotlin in Action", "Dmitry Jemerov")
)

@Composable
fun BookApp() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "list") {
        composable("list") {
            BookListScreen(
                books = sampleBooks,
                onBookClick = { bookId ->
                    navController.navigate("detail/$bookId")
                }
            )
        }
        composable(
            route = "detail/{bookId}",
            arguments = listOf(navArgument("bookId") { type = NavType.StringType })
        ) { backStackEntry ->
            val bookId = backStackEntry.arguments?.getString("bookId") ?: return@composable
            val book = sampleBooks.first { it.id == bookId }
            BookDetailScreen(book = book, onBack = { navController.popBackStack() })
        }
    }
}

@Composable
fun BookListScreen(books: List<Book>, onBookClick: (String) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(books, key = { it.id }) { book ->
            Card(
                modifier = Modifier.fillMaxWidth().clickable { onBookClick(book.id) }
            ) {
                Text(book.title, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
fun BookDetailScreen(book: Book, onBack: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp)) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
        Text(book.title, style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(8.dp))
        Text("by ${book.author}", style = MaterialTheme.typography.bodyLarge, color = Color.Gray)
    }
}
```

This solution demonstrates Compose Navigation with argument passing. The `BookListScreen` is stateless and emits click events upward. The navigation logic stays in `BookApp`, keeping screens decoupled from the `NavController`.

---

## Module 7: Animations

### Lesson 7.1: Basic Animations

```kotlin
@Composable
fun ExpandableCard(title: String, content: String) {
    var expanded by remember { mutableStateOf(false) }

    // animateFloatAsState for smooth transitions
    val rotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(300)
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded }
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, modifier = Modifier.weight(1f))
                Icon(
                    Icons.Default.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier.rotate(rotation)
                )
            }

            AnimatedVisibility(visible = expanded) {
                Text(content, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}
```

### Lesson 7.2: AnimatedContent and Crossfade

```kotlin
@Composable
fun StateSwitcher(state: UiState) {
    AnimatedContent(
        targetState = state,
        transitionSpec = {
            fadeIn(tween(300)) togetherWith fadeOut(tween(300))
        }
    ) { targetState ->
        when (targetState) {
            UiState.Loading -> LoadingView()
            is UiState.Success -> ContentView(targetState.data)
            is UiState.Error -> ErrorView(targetState.message)
        }
    }
}
```

### Lesson 7.3: Transition API

```kotlin
@Composable
fun PulsingDot(isActive: Boolean) {
    val transition = updateTransition(targetState = isActive, label = "pulse")

    val scale by transition.animateFloat(label = "scale") { active ->
        if (active) 1.2f else 1f
    }

    val alpha by transition.animateFloat(label = "alpha") { active ->
        if (active) 1f else 0.5f
    }

    val color by transition.animateColor(label = "color") { active ->
        if (active) Color.Green else Color.Gray
    }

    Box(
        modifier = Modifier
            .size(12.dp)
            .scale(scale)
            .alpha(alpha)
            .background(color, CircleShape)
    )
}
```

**Key takeaway:** `updateTransition` coordinates multiple animations with the same state trigger. Use it when multiple properties need to animate together.

### Quiz: Animations

#### What is the purpose of `AnimatedVisibility` in Compose?

- ❌ It makes a composable invisible without removing it from the tree
- ✅ It animates the appearance and disappearance of a composable as it enters and exits the composition
- ❌ It toggles the alpha between 0 and 1 instantly
- ❌ It is required to use any animation in Compose

> **Explanation:** `AnimatedVisibility` wraps a composable and animates its enter and exit transitions. When `visible` changes from false to true, the content animates in (e.g., fade, slide). When it changes to false, the content animates out before being removed from composition.

#### When should you use `updateTransition` instead of individual `animate*AsState` calls?

- ❌ When animating a single property
- ❌ When you want animations to run at different speeds
- ✅ When multiple properties need to animate together in coordination based on the same state
- ❌ When you need infinite animations

> **Explanation:** `updateTransition` creates a single transition object that coordinates multiple animated properties — like scale, alpha, and color — all driven by the same target state. This ensures they stay synchronized, which is harder to guarantee with separate `animate*AsState` calls.

#### What does `animationSpec = tween(300)` specify?

- ❌ A delay of 300 milliseconds before the animation starts
- ✅ A duration-based animation that takes 300 milliseconds with default easing
- ❌ A spring animation with 300 stiffness
- ❌ A repeating animation that loops 300 times

> **Explanation:** `tween` creates a duration-based animation spec. `tween(300)` means the animation takes 300ms with the default `FastOutSlowIn` easing curve. Other animation specs include `spring()` for physics-based animations and `repeatable()` for looping.

### Coding Challenge: Animated FAB Menu

Build an `ExpandableFab` composable with a main floating action button that, when tapped, reveals 3 mini action buttons with a staggered animation. Use `updateTransition` to coordinate the rotation of the main FAB icon (0° to 45°) and the scale/alpha of each mini button. Each mini button should appear with a slight delay offset.

#### Solution

```kotlin
@Composable
fun ExpandableFab() {
    var expanded by remember { mutableStateOf(false) }
    val transition = updateTransition(targetState = expanded, label = "fab")

    val rotation by transition.animateFloat(label = "rotation") { isExpanded ->
        if (isExpanded) 45f else 0f
    }

    val actions = listOf(
        "Edit" to Icons.Default.Edit,
        "Share" to Icons.Default.Share,
        "Delete" to Icons.Default.Delete
    )

    Column(horizontalAlignment = Alignment.End) {
        actions.forEachIndexed { index, (label, icon) ->
            val scale by transition.animateFloat(
                label = "scale_$index",
                transitionSpec = {
                    if (targetState) tween(200, delayMillis = index * 60)
                    else tween(150)
                }
            ) { isExpanded -> if (isExpanded) 1f else 0f }

            val alpha by transition.animateFloat(
                label = "alpha_$index",
                transitionSpec = {
                    if (targetState) tween(200, delayMillis = index * 60)
                    else tween(150)
                }
            ) { isExpanded -> if (isExpanded) 1f else 0f }

            if (scale > 0f) {
                Row(
                    modifier = Modifier
                        .padding(bottom = 12.dp)
                        .scale(scale)
                        .alpha(alpha),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(label, style = MaterialTheme.typography.labelMedium)
                    SmallFloatingActionButton(onClick = { expanded = false }) {
                        Icon(icon, contentDescription = label)
                    }
                }
            }
        }

        FloatingActionButton(onClick = { expanded = !expanded }) {
            Icon(
                Icons.Default.Add,
                contentDescription = "Expand",
                modifier = Modifier.rotate(rotation)
            )
        }
    }
}
```

This solution uses a single `updateTransition` to coordinate all animations. The main FAB icon rotates 45° (making the "+" look like "×"). Each mini button has staggered `delayMillis` for a cascading reveal effect, and the scale/alpha are coordinated through the same transition state.

---

## Module 8: Performance

### Lesson 8.1: Stability and Skipping

```kotlin
// ✅ Stable — all properties are val with stable types
data class UserUiModel(
    val id: String,
    val name: String,
    val avatarUrl: String
)

// ❌ Unstable — List is mutable, Compose can't guarantee stability
data class FeedState(
    val posts: List<Post>,  // List is unstable
    val isLoading: Boolean
)

// ✅ Fix — use ImmutableList from kotlinx.collections.immutable
data class FeedState(
    val posts: ImmutableList<Post>,
    val isLoading: Boolean
)
```

**Why stability matters** — Compose can skip recomposing a composable if all its parameters are stable AND unchanged. If a parameter is unstable (like `List`), Compose always recomposes — even if the data is the same.

**Key takeaway:** Use `@Stable` or `@Immutable` annotations, or use `ImmutableList`/`ImmutableMap` from the kotlinx-collections-immutable library. Check stability with the Compose compiler reports.

### Lesson 8.2: Key Performance Rules

- **Always provide `key` in `LazyColumn` items** — enables efficient diffing
- **Avoid allocations in composition** — no `listOf()`, `mapOf()`, or lambdas that aren't remembered
- **Use `derivedStateOf` for computed values** — prevents unnecessary recomposition
- **Defer state reads** — use lambda-based modifiers (`Modifier.offset { }` instead of `Modifier.offset()`)
- **Profile with Layout Inspector** — check recomposition counts

```kotlin
// ❌ Bad — lambda allocation on every recomposition
LazyColumn {
    items(users) { user ->
        UserCard(
            user = user,
            onClick = { viewModel.selectUser(user.id) }  // New lambda each time
        )
    }
}

// ✅ Good — stable lambda reference
LazyColumn {
    items(users, key = { it.id }) { user ->
        UserCard(
            user = user,
            onClick = viewModel::onUserClicked
        )
    }
}
```

**Key takeaway:** Compose is fast by default, but you can make it slow with unstable parameters, unnecessary recompositions, and allocations during composition. Profile before optimizing.

### Quiz: Performance

#### Why is `List<Post>` considered unstable by the Compose compiler?

- ❌ Because `List` is an abstract type
- ❌ Because `Post` might be null
- ✅ Because `List` is a mutable interface — Compose cannot guarantee the contents won't change between recompositions
- ❌ Because lists are always too large to compare

> **Explanation:** Kotlin's `List` interface is actually `java.util.List`, which has mutable implementations like `ArrayList`. The Compose compiler can't guarantee a `List` parameter won't be mutated externally, so it marks it as unstable and always recomposes. Using `ImmutableList` from kotlinx-collections-immutable solves this.

#### What is wrong with creating a new lambda inside a `LazyColumn` items block?

- ❌ Lambdas are not allowed in Compose
- ✅ A new lambda object is allocated on every recomposition, preventing Compose from skipping the child composable
- ❌ It causes a memory leak
- ❌ It prevents the list from scrolling

> **Explanation:** When you write `onClick = { viewModel.selectUser(user.id) }` inside `items`, a new lambda instance is created for each item on every recomposition. Since the lambda reference changes, Compose cannot skip recomposing the child. Using a method reference like `viewModel::onUserClicked` provides a stable reference.

#### What does `Modifier.offset { IntOffset(x, 0) }` do differently from `Modifier.offset(x.dp, 0.dp)`?

- ❌ Nothing — they are identical
- ❌ The lambda version is slower
- ✅ The lambda version defers the state read to the Layout phase, skipping recomposition entirely
- ❌ The lambda version only works with integers

> **Explanation:** `Modifier.offset(x.dp)` reads the state during Composition, triggering recomposition when `x` changes. `Modifier.offset { IntOffset(x, 0) }` defers the read to the Layout phase, so only measurement and placement re-run — Composition is skipped entirely. This is critical for animations and scroll-dependent offsets.

### Coding Challenge: Optimized Contact List

Build an optimized `ContactList` composable that displays 1000+ contacts with profile images, names, and roles. Apply all performance best practices: use `ImmutableList`, provide stable `key`, use method references instead of lambda allocations, use `derivedStateOf` for a filtered search, and defer scroll-based offset reads to the Layout phase with a parallax header.

#### Solution

```kotlin
@Immutable
data class Contact(
    val id: String,
    val name: String,
    val role: String,
    val avatarUrl: String
)

@Composable
fun ContactList(
    contacts: ImmutableList<Contact>,
    onContactClick: (String) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    val filteredContacts by remember(contacts) {
        derivedStateOf {
            if (searchQuery.isBlank()) contacts
            else contacts.filter {
                it.name.contains(searchQuery, ignoreCase = true)
            }.toImmutableList()
        }
    }

    Column {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            label = { Text("Search") },
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        )

        Box {
            // Parallax header — offset deferred to Layout phase
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .offset {
                        val scroll = listState.firstVisibleItemScrollOffset
                        IntOffset(0, -scroll / 2)
                    }
                    .background(MaterialTheme.colorScheme.primaryContainer)
            )

            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(top = 200.dp)
            ) {
                items(
                    items = filteredContacts,
                    key = { it.id }
                ) { contact ->
                    ContactRow(
                        contact = contact,
                        onClick = onContactClick
                    )
                }
            }
        }
    }
}

@Composable
fun ContactRow(
    contact: Contact,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick(contact.id) }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(MaterialTheme.colorScheme.primary, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(contact.name.first().toString(), color = Color.White)
        }
        Column {
            Text(contact.name, fontWeight = FontWeight.Bold)
            Text(contact.role, color = Color.Gray, fontSize = 14.sp)
        }
    }
}
```

This solution applies all key performance optimizations: `ImmutableList` for stable parameters enabling skipping, `key = { it.id }` for efficient diffing, `derivedStateOf` for filtered search (only recomposes when results change, not every keystroke), lambda-based `Modifier.offset {}` for the parallax header (defers to Layout phase), and a stable `ContactRow` composable with no lambda allocations.

---

## Module 9: Testing Compose

### Lesson 9.1: Basic Compose Tests

```kotlin
@get:Rule
val composeTestRule = createComposeRule()

@Test
fun loginButton_disabled_when_fields_empty() {
    composeTestRule.setContent {
        LoginScreen()
    }

    composeTestRule
        .onNodeWithText("Log In")
        .assertIsNotEnabled()
}

@Test
fun loginButton_enabled_after_input() {
    composeTestRule.setContent {
        LoginScreen()
    }

    composeTestRule
        .onNodeWithText("Email")
        .performTextInput("mukul@example.com")

    composeTestRule
        .onNodeWithText("Password")
        .performTextInput("password123")

    composeTestRule
        .onNodeWithText("Log In")
        .assertIsEnabled()
}
```

### Lesson 9.2: Semantics and Test Tags

```kotlin
@Composable
fun UserAvatar(user: User, modifier: Modifier = Modifier) {
    Image(
        painter = rememberAsyncImagePainter(user.avatarUrl),
        contentDescription = "${user.name}'s avatar",
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape)
            .testTag("avatar_${user.id}")
    )
}

// Test
@Test
fun avatar_displays_for_user() {
    composeTestRule.setContent {
        UserAvatar(user = testUser)
    }

    composeTestRule
        .onNodeWithTag("avatar_user-1")
        .assertIsDisplayed()

    composeTestRule
        .onNodeWithContentDescription("Mukul's avatar")
        .assertExists()
}
```

**Key takeaway:** Use `testTag` for precise node selection in tests. Use `contentDescription` for both accessibility and testing.

### Quiz: Testing Compose

#### What is the purpose of `createComposeRule()` in Compose tests?

- ❌ It creates a new Activity for each test
- ✅ It provides a test environment to set Compose content and interact with the UI tree using finders and assertions
- ❌ It generates UI screenshots for visual comparison
- ❌ It mocks all ViewModel dependencies automatically

> **Explanation:** `createComposeRule()` sets up a Compose testing environment where you can call `setContent` to render composables, then use finders like `onNodeWithText` and assertions like `assertIsDisplayed` to verify behavior — all without needing an Activity.

#### How do you find a composable by its test tag in a Compose test?

- ❌ `composeTestRule.findByTag("tag")`
- ❌ `composeTestRule.onNodeWithId("tag")`
- ✅ `composeTestRule.onNodeWithTag("tag")`
- ❌ `composeTestRule.querySelector("tag")`

> **Explanation:** You assign a tag in production code with `Modifier.testTag("tag")`, then find it in tests with `onNodeWithTag("tag")`. This is preferred for precise selection when text-based or content description-based finders are ambiguous.

#### Why is `contentDescription` useful in Compose testing?

- ❌ It only affects screen readers and has no testing use
- ❌ It replaces `testTag` entirely
- ✅ It serves double duty — providing accessibility information and enabling test selection with `onNodeWithContentDescription`
- ❌ It is required by the Compose compiler

> **Explanation:** `contentDescription` is primarily for accessibility (screen readers), but it also provides a natural way to find nodes in tests. Unlike `testTag` which is purely for testing, `contentDescription` improves your app's accessibility while making tests more readable.

### Coding Challenge: Test a Counter Component

Write a complete Compose test suite for a `Counter` composable that has an increment button, a decrement button, and a display showing the count. Test that: the initial count is 0, clicking increment increases the count, clicking decrement decreases it, and the count never goes below 0. Include proper test tags.

#### Solution

```kotlin
// Production code
@Composable
fun Counter(modifier: Modifier = Modifier) {
    var count by remember { mutableStateOf(0) }

    Row(
        modifier = modifier.testTag("counter_root"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        IconButton(
            onClick = { if (count > 0) count-- },
            modifier = Modifier.testTag("btn_decrement")
        ) {
            Icon(Icons.Default.Remove, contentDescription = "Decrement")
        }
        Text(
            text = "$count",
            modifier = Modifier.testTag("count_display"),
            style = MaterialTheme.typography.headlineMedium
        )
        IconButton(
            onClick = { count++ },
            modifier = Modifier.testTag("btn_increment")
        ) {
            Icon(Icons.Default.Add, contentDescription = "Increment")
        }
    }
}

// Tests
class CounterTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Before
    fun setup() {
        composeTestRule.setContent { Counter() }
    }

    @Test
    fun initialCount_isZero() {
        composeTestRule
            .onNodeWithTag("count_display")
            .assertTextEquals("0")
    }

    @Test
    fun increment_increasesCount() {
        composeTestRule.onNodeWithTag("btn_increment").performClick()
        composeTestRule.onNodeWithTag("count_display").assertTextEquals("1")

        composeTestRule.onNodeWithTag("btn_increment").performClick()
        composeTestRule.onNodeWithTag("count_display").assertTextEquals("2")
    }

    @Test
    fun decrement_decreasesCount() {
        repeat(3) {
            composeTestRule.onNodeWithTag("btn_increment").performClick()
        }
        composeTestRule.onNodeWithTag("count_display").assertTextEquals("3")

        composeTestRule.onNodeWithTag("btn_decrement").performClick()
        composeTestRule.onNodeWithTag("count_display").assertTextEquals("2")
    }

    @Test
    fun count_neverGoesBelowZero() {
        composeTestRule.onNodeWithTag("count_display").assertTextEquals("0")

        composeTestRule.onNodeWithTag("btn_decrement").performClick()
        composeTestRule.onNodeWithTag("count_display").assertTextEquals("0")
    }
}
```

This solution uses `testTag` modifiers for precise node selection and demonstrates the `@Before` pattern for shared setup. Each test is focused on a single behavior. The `contentDescription` on icons provides accessibility, while `testTag` provides unambiguous test selection.

---

## Module 10: Architecture Patterns with Compose

### Lesson 10.1: Unidirectional Data Flow

```kotlin
// State
data class TodoState(
    val items: ImmutableList<TodoItem> = persistentListOf(),
    val filter: Filter = Filter.ALL,
    val newItemText: String = ""
)

// Events
sealed interface TodoEvent {
    data class AddItem(val text: String) : TodoEvent
    data class ToggleItem(val id: String) : TodoEvent
    data class DeleteItem(val id: String) : TodoEvent
    data class FilterChanged(val filter: Filter) : TodoEvent
    data class TextChanged(val text: String) : TodoEvent
}

// ViewModel
class TodoViewModel : ViewModel() {
    private val _state = MutableStateFlow(TodoState())
    val state = _state.asStateFlow()

    fun onEvent(event: TodoEvent) {
        when (event) {
            is TodoEvent.AddItem -> addItem(event.text)
            is TodoEvent.ToggleItem -> toggleItem(event.id)
            is TodoEvent.DeleteItem -> deleteItem(event.id)
            is TodoEvent.FilterChanged -> _state.update { it.copy(filter = event.filter) }
            is TodoEvent.TextChanged -> _state.update { it.copy(newItemText = event.text) }
        }
    }
}

// Screen — pure function of state
@Composable
fun TodoScreen(viewModel: TodoViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    TodoContent(
        state = state,
        onEvent = viewModel::onEvent
    )
}
```

### Lesson 10.2: Screen-Level vs Component-Level Composables

```kotlin
// Screen-level — connected to ViewModel, has side effects
@Composable
fun ProfileScreen(viewModel: ProfileViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ProfileContent(state = state, onEvent = viewModel::onEvent)
}

// Component-level — stateless, reusable, testable
@Composable
fun ProfileContent(
    state: ProfileState,
    onEvent: (ProfileEvent) -> Unit,
    modifier: Modifier = Modifier
) {
    // Pure UI — no ViewModel, no side effects
    Column(modifier = modifier) {
        Avatar(url = state.avatarUrl)
        Text(state.name)
        Button(onClick = { onEvent(ProfileEvent.EditProfile) }) {
            Text("Edit")
        }
    }
}
```

**Key takeaway:** Split screens into a thin screen-level composable (ViewModel-connected) and a thick component-level composable (stateless, testable). Test the component directly without needing a ViewModel.

### Quiz: Architecture Patterns with Compose

#### What is the Unidirectional Data Flow (UDF) pattern in Compose?

- ❌ Data flows from child composables up to the ViewModel
- ❌ State is shared bidirectionally between all composables
- ✅ State flows down from ViewModel to UI as parameters, and events flow up from UI to ViewModel as callbacks
- ❌ Each composable manages its own state independently

> **Explanation:** UDF means the ViewModel holds the single source of truth for state and exposes it downward. The UI is a pure function of that state. User interactions are sent upward as events, and only the ViewModel modifies state. This creates a predictable, testable cycle: Event → ViewModel → State → UI.

#### Why should you split composables into screen-level and component-level?

- ❌ It is required by the Compose compiler
- ❌ Screen-level composables are faster than component-level ones
- ✅ Screen-level composables handle ViewModel wiring, while component-level composables are stateless and directly testable without ViewModel dependencies
- ❌ Component-level composables cannot accept parameters

> **Explanation:** The thin screen-level composable connects to the ViewModel and passes state down. The thick component-level composable is a pure function of its parameters — it can be tested in isolation with `createComposeRule().setContent { ComponentLevel(fakeState) }` without needing a real ViewModel.

#### What is the benefit of using sealed interfaces for UI events?

- ❌ They are faster than regular classes
- ❌ They automatically generate ViewModel code
- ✅ They provide an exhaustive, type-safe set of all possible user actions, ensuring every event is handled in the `when` expression
- ❌ They replace the need for callbacks in composables

> **Explanation:** Sealed interfaces make the compiler enforce exhaustive `when` expressions — if you add a new event type, the compiler forces you to handle it everywhere. This prevents forgotten event handlers and makes the contract between UI and ViewModel explicit and complete.

### Coding Challenge: Full UDF Architecture

Build a complete notes app screen using UDF architecture. Create a `NoteState` (with list of notes and a new note text field), a `NoteEvent` sealed interface (AddNote, DeleteNote, TextChanged), a `NoteViewModel` that processes events, and split the UI into a screen-level `NoteScreen` (ViewModel-connected) and a component-level `NoteContent` (stateless, testable). Include a text field, an add button, and a list of notes with delete functionality.

#### Solution

```kotlin
// State
@Immutable
data class Note(val id: String, val text: String)

data class NoteState(
    val notes: ImmutableList<Note> = persistentListOf(),
    val newNoteText: String = ""
)

// Events
sealed interface NoteEvent {
    data class TextChanged(val text: String) : NoteEvent
    data object AddNote : NoteEvent
    data class DeleteNote(val id: String) : NoteEvent
}

// ViewModel
class NoteViewModel : ViewModel() {
    private val _state = MutableStateFlow(NoteState())
    val state = _state.asStateFlow()

    fun onEvent(event: NoteEvent) {
        when (event) {
            is NoteEvent.TextChanged -> {
                _state.update { it.copy(newNoteText = event.text) }
            }
            is NoteEvent.AddNote -> {
                _state.update { current ->
                    if (current.newNoteText.isBlank()) return
                    val note = Note(id = UUID.randomUUID().toString(), text = current.newNoteText)
                    current.copy(
                        notes = (current.notes + note).toImmutableList(),
                        newNoteText = ""
                    )
                }
            }
            is NoteEvent.DeleteNote -> {
                _state.update { current ->
                    current.copy(notes = current.notes.filter { it.id != event.id }.toImmutableList())
                }
            }
        }
    }
}

// Screen-level — thin, ViewModel-connected
@Composable
fun NoteScreen(viewModel: NoteViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    NoteContent(state = state, onEvent = viewModel::onEvent)
}

// Component-level — thick, stateless, testable
@Composable
fun NoteContent(
    state: NoteState,
    onEvent: (NoteEvent) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(16.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = state.newNoteText,
                onValueChange = { onEvent(NoteEvent.TextChanged(it)) },
                label = { Text("New note") },
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = { onEvent(NoteEvent.AddNote) },
                enabled = state.newNoteText.isNotBlank()
            ) {
                Text("Add")
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items = state.notes, key = { it.id }) { note ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(note.text, modifier = Modifier.weight(1f))
                        IconButton(onClick = { onEvent(NoteEvent.DeleteNote(note.id)) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete note")
                        }
                    }
                }
            }
        }
    }
}
```

This solution demonstrates complete UDF architecture. `NoteScreen` is a thin wrapper that connects the ViewModel to the stateless `NoteContent`. All state lives in `NoteViewModel` and flows down as `NoteState`. User actions flow up as `NoteEvent` instances. `NoteContent` can be tested directly: `setContent { NoteContent(state = fakeState, onEvent = { captured.add(it) }) }` — no ViewModel needed.

---

Thank You for completing the Jetpack Compose Mastery course! Compose changes how you think about UI — once you internalize the declarative model, you'll never want to go back to XML. 🎨
