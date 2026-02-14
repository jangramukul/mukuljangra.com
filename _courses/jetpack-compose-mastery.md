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

---

Thank You for completing the Jetpack Compose Mastery course! Compose changes how you think about UI — once you internalize the declarative model, you'll never want to go back to XML. 🎨
