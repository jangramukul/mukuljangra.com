---
title: "Side Effects & Lifecycle in Compose"
date: 2026-02-14
layout: interview
tags: [Jetpack Compose Round]
order: 4
---

## Side Effects & Lifecycle in Compose

Side effects and lifecycle are fundamental to real-world Compose development. Every company using Compose will ask about `LaunchedEffect`, `DisposableEffect`, and how Compose's lifecycle maps to the Activity lifecycle. Getting these wrong causes resource leaks, crashes, and subtle bugs.

### Core Questions (Beginner → Intermediate)

#### Q1: What is a side effect in Compose?

A side effect is any operation that escapes the scope of the composable function — something that affects the world outside of composition. Network calls, logging, writing to a database, showing a toast, or starting a coroutine are all side effects. Composable functions should ideally be pure — given the same inputs, they produce the same UI — but real apps need side effects to actually do anything useful.

Compose provides effect handlers (`LaunchedEffect`, `DisposableEffect`, `SideEffect`) to run side effects safely within the composition lifecycle. Running side effects directly in a composable body is dangerous because the function can be re-executed at any time during recomposition.

#### Q2: What is LaunchedEffect and when do you use it?

`LaunchedEffect` launches a coroutine that is scoped to the composition. It enters the composition, starts the coroutine, and when it leaves the composition or the key changes, the coroutine is cancelled. You use it whenever you need to launch a coroutine inside a composable — one-time data loading, animations, snackbar events, or anything async.

```kotlin
@Composable
fun UserProfileScreen(userId: String, viewModel: ProfileViewModel) {
    LaunchedEffect(userId) {
        viewModel.loadProfile(userId)
    }

    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ProfileContent(state)
}
```

The key (`userId`) controls when the effect restarts. When `userId` changes, the current coroutine is cancelled and a new one starts with the new value. If you pass `Unit` as the key, the effect runs once when the composable enters composition and never restarts.

#### Q3: What is DisposableEffect and how is it different from LaunchedEffect?

`DisposableEffect` is for side effects that need cleanup when the composable leaves the composition or the key changes. It provides an `onDispose` block that runs when the effect is being disposed. Use it when you need to register and unregister listeners, callbacks, or observers.

```kotlin
@Composable
fun LocationTracker(lifecycleOwner: LifecycleOwner = LocalLifecycleOwner.current) {
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                startLocationUpdates()
            } else if (event == Lifecycle.Event.ON_PAUSE) {
                stopLocationUpdates()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
}
```

The key difference from `LaunchedEffect` is that `DisposableEffect` doesn't launch a coroutine — it runs a synchronous block and provides cleanup. `LaunchedEffect` is for async work, `DisposableEffect` is for registering and unregistering resources.

#### Q4: What is SideEffect and when would you use it?

`SideEffect` runs after every successful composition — both the initial composition and every recomposition. It has no key and no cleanup mechanism. It's used to publish Compose state to non-Compose code that doesn't use snapshot state.

```kotlin
@Composable
fun AnalyticsTracker(screenName: String) {
    SideEffect {
        analytics.setCurrentScreen(screenName)
    }
}
```

Since `SideEffect` runs on every recomposition, it should only contain lightweight operations. It's guaranteed to execute only after the composition succeeds — if composition is cancelled or fails, the effect doesn't run. This makes it safe for syncing state but not for anything expensive.

#### Q5: What is rememberCoroutineScope and how is it different from LaunchedEffect?

`rememberCoroutineScope` gives you a `CoroutineScope` tied to the composable's lifecycle. The scope is cancelled when the composable leaves composition. The difference from `LaunchedEffect` is that you control when the coroutine launches — typically in response to user events like button clicks.

```kotlin
@Composable
fun SubmitButton(viewModel: FormViewModel) {
    val scope = rememberCoroutineScope()

    Button(onClick = {
        scope.launch {
            viewModel.submitForm()
        }
    }) {
        Text("Submit")
    }
}
```

Use `LaunchedEffect` when the coroutine should start automatically based on state. Use `rememberCoroutineScope` when the coroutine should start in response to a callback or event that happens outside of composition, like a button click.

#### Q6: What is rememberUpdatedState and why is it needed?

`rememberUpdatedState` captures the latest value of a parameter inside a long-running effect without restarting the effect. This solves a specific problem — when a `LaunchedEffect` uses `Unit` as its key (runs once), it captures the initial values of its closure. If those values change, the effect still uses the old ones.

```kotlin
@Composable
fun SplashScreen(onTimeout: () -> Unit) {
    val currentOnTimeout by rememberUpdatedState(onTimeout)

    LaunchedEffect(Unit) {
        delay(3000)
        currentOnTimeout() // Uses the latest callback, not the one from initial composition
    }
}
```

Without `rememberUpdatedState`, if the parent recomposes and passes a different `onTimeout` lambda, the `LaunchedEffect` would still call the original one because it captured the value at launch time. `rememberUpdatedState` keeps a mutable state reference that always points to the latest value.

#### Q7: What is produceState and when would you use it?

`produceState` converts a non-Compose data source into Compose state. It launches a coroutine that can set the state value over time, and the state is remembered across recompositions. It combines `remember`, `mutableStateOf`, and `LaunchedEffect` into a single API.

```kotlin
@Composable
fun NetworkImage(url: String): State<ImageResult> {
    return produceState<ImageResult>(initialValue = ImageResult.Loading, url) {
        val image = loadImage(url)
        value = if (image != null) {
            ImageResult.Success(image)
        } else {
            ImageResult.Error
        }
    }
}
```

The coroutine restarts when the key (`url`) changes, just like `LaunchedEffect`. Use it when you have a suspend function or callback-based API that produces state over time — it's cleaner than manually combining `remember` with `LaunchedEffect`.

#### Q8: What is snapshotFlow and how does it bridge Compose state to Flow?

`snapshotFlow` converts Compose `State` reads into a Kotlin `Flow`. It creates a flow that emits whenever any state object read inside its block changes. This is the inverse of `collectAsState` — instead of converting a Flow to Compose state, it converts Compose state to a Flow.

```kotlin
@Composable
fun SearchScreen(listState: LazyListState) {
    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .filter { it > 5 }
            .collect {
                analytics.logScrollDepth(it)
            }
    }
}
```

`snapshotFlow` is useful when you need Flow operators (debounce, filter, distinctUntilChanged) on Compose state. It only emits when the value actually changes, and it runs inside a coroutine so you can use suspend operators.

#### Q9: What is the Compose lifecycle? How does a composable enter and leave composition?

A composable has three lifecycle events:

- **Enter Composition** — The composable is called for the first time. All `remember` values are initialized, effects start running, and the UI node is created.
- **Recompose** — The composable is re-invoked because its input state changed. `remember` values survive, but the function body re-executes. Effects with changed keys restart.
- **Leave Composition** — The composable is no longer part of the UI tree (e.g., an `if` condition became false). All `remember` values are forgotten, `DisposableEffect` cleanup runs, and `LaunchedEffect` coroutines are cancelled.

This is simpler than the Activity lifecycle. There's no "paused" or "stopped" — a composable is either in the composition or not.

### Deep Dive Questions (Advanced → Expert)

#### Q10: How does the Compose lifecycle relate to the Activity lifecycle?

The Compose UI tree lives inside a `ComposeView` which is part of the Activity's view hierarchy. When the Activity is created and `setContent` is called, the initial composition happens. When the Activity is destroyed, the composition is disposed.

Configuration changes work differently in Compose than with Views. If the Activity recreates (rotation), the composition is disposed and recreated. `remember` values are lost, but `rememberSaveable` values survive because they're persisted to the `savedInstanceState` Bundle. `ViewModel` state also survives because the `ViewModelStore` is retained.

For observing the Activity lifecycle inside composables, use `LocalLifecycleOwner.current` with a `DisposableEffect`:

```kotlin
@Composable
fun CameraPreview() {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> openCamera()
                Lifecycle.Event.ON_STOP -> closeCamera()
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

#### Q11: What is the key() composable and when do you need it?

`key()` overrides Compose's default positional identity for composables. Normally, Compose identifies a composable by its position in the source code. Inside loops or conditional blocks where composables can change order, positional identity breaks — a composable at index 2 might be a completely different item after a list reorder.

```kotlin
@Composable
fun UserList(users: List<User>) {
    Column {
        for (user in users) {
            key(user.id) {
                UserRow(user)
            }
        }
    }
}
```

Without `key()`, if you remove the first user from the list, Compose thinks the second item became the first, the third became the second, and so on. All items recompose with wrong data and effects restart unnecessarily. With `key(user.id)`, Compose correctly matches each composable to its data even when the list order changes. `LazyColumn` handles this internally through its `key` parameter in `items()`.

#### Q12: How does process death work with Compose state?

Process death kills the entire process — `remember` values, ViewModel data, and all in-memory state are gone. Only data saved through `rememberSaveable` or `SavedStateHandle` survives because it's serialized to a Bundle that the system stores outside the process.

`rememberSaveable` uses either auto-generated savers for basic types or custom `Saver` implementations for complex types:

```kotlin
@Composable
fun FilterScreen() {
    // Primitives work automatically
    var searchQuery by rememberSaveable { mutableStateOf("") }

    // Custom types need a Saver
    var selectedFilter by rememberSaveable(stateSaver = FilterSaver) {
        mutableStateOf(Filter.Default)
    }
}

val FilterSaver = Saver<Filter, String>(
    save = { it.name },
    restore = { Filter.valueOf(it) }
)
```

Keep `rememberSaveable` for lightweight UI state the user expects to persist — scroll position, search queries, selected tabs. Heavy data should live in the ViewModel and be re-fetched after process death.

#### Q13: What is movableContentOf and how does it interact with the Compose lifecycle?

`movableContentOf` lets you move a composable from one part of the tree to another without it leaving and re-entering composition. Normally, moving a composable to a different parent causes it to leave composition (all state lost, effects disposed) and re-enter (fresh state, effects restart). `movableContentOf` preserves everything.

```kotlin
@Composable
fun AdaptiveLayout(isWideScreen: Boolean) {
    val playerContent = remember {
        movableContentOf {
            VideoPlayer(url = videoUrl) // State preserved across moves
        }
    }

    if (isWideScreen) {
        Row {
            PlaylistPanel()
            playerContent()
        }
    } else {
        Column {
            playerContent()
            PlaylistPanel()
        }
    }
}
```

The `VideoPlayer` keeps its playback position, buffered data, and internal state when switching between layouts. Without `movableContentOf`, the player would restart from scratch every time the layout changes.

#### Q14: What happens when you nest effects inside each other or call effects conditionally?

Effects must be called at the top level of a composable function — you cannot call `LaunchedEffect` inside another `LaunchedEffect`, and you shouldn't call effects conditionally (inside `if` blocks) unless you want the effect to only exist when that condition is true.

Conditional effects work because Compose treats them like any other composable — when the condition is true, the effect enters composition and starts. When the condition becomes false, the effect leaves composition, the coroutine is cancelled, and cleanup runs. This is actually useful in some cases:

```kotlin
@Composable
fun NotificationBanner(showBanner: Boolean) {
    if (showBanner) {
        LaunchedEffect(Unit) {
            delay(5000)
            dismissBanner()
        }
    }
}
```

But nested effects are a code smell. If you need to launch a coroutine from inside a `LaunchedEffect`, just use the coroutine scope directly — you're already inside a suspend function.

#### Q15: How do multiple LaunchedEffects interact in the same composable?

Each `LaunchedEffect` is independent — they have separate coroutines, separate keys, and separate lifecycles. They run concurrently and don't affect each other. If you have three `LaunchedEffect` calls in one composable, you get three coroutines.

```kotlin
@Composable
fun DashboardScreen(userId: String) {
    // These three run concurrently as independent coroutines
    LaunchedEffect(userId) {
        viewModel.loadProfile(userId)
    }

    LaunchedEffect(userId) {
        viewModel.loadNotifications(userId)
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            handleEvent(event)
        }
    }
}
```

The first two restart when `userId` changes. The third runs once and collects events for the lifetime of the composable. If you need coroutines to run sequentially, put them in a single `LaunchedEffect`.

#### Q16: How do you properly handle one-time events (navigation, snackbars) with side effects?

One-time events are tricky in Compose because recomposition can cause effects to re-execute. The common pattern is to use a `Channel` or `SharedFlow` in the ViewModel and collect it inside a `LaunchedEffect`:

```kotlin
// ViewModel
class OrderViewModel : ViewModel() {
    private val _events = Channel<OrderEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun submitOrder() {
        viewModelScope.launch {
            repository.submitOrder()
            _events.send(OrderEvent.ShowSuccess)
        }
    }
}

// Composable
@Composable
fun OrderScreen(viewModel: OrderViewModel, onNavigateBack: () -> Unit) {
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                OrderEvent.ShowSuccess -> snackbarHostState.showSnackbar("Order placed")
                OrderEvent.NavigateBack -> onNavigateBack()
            }
        }
    }
}
```

`Channel` guarantees each event is consumed exactly once. Using `StateFlow` for one-time events is a mistake — it replays the last value on resubscription, which can trigger the event again after a configuration change.

#### Q17: What is the difference between LaunchedEffect(Unit) and LaunchedEffect(true)?

Functionally, there's no difference — both create a `LaunchedEffect` that runs once and never restarts. The convention is to use `Unit` because it communicates intent more clearly: "this effect has no meaningful key." Using `true` or any constant value works the same way since the key never changes, but `Unit` is the idiomatic choice.

The important distinction is between constant keys and meaningful keys. `LaunchedEffect(userId)` restarts when `userId` changes. `LaunchedEffect(Unit)` never restarts. Choosing the right key is critical — if you use `Unit` when you should use a parameter, the effect captures stale values and produces bugs.

#### Q18: How does Compose handle effects during configuration changes?

When a configuration change occurs and the Activity recreates, the entire composition is disposed and recreated from scratch. All `LaunchedEffect` coroutines are cancelled, all `DisposableEffect` cleanup runs, and all `remember` values are lost.

On the new composition, effects start fresh. `LaunchedEffect` launches new coroutines, `DisposableEffect` runs its setup block again. State from `rememberSaveable` is restored from the saved bundle, and ViewModel state is still available because the ViewModel survives the recreation.

This means any in-flight network request inside a `LaunchedEffect` gets cancelled during rotation. If you need work to survive configuration changes, launch it in the ViewModel's `viewModelScope` instead. Use `LaunchedEffect` for UI-scoped work (animations, event collection) and ViewModel for business logic that should outlive the composable.

### Common Follow-ups

- How would you convert a callback-based API (like a sensor listener) into Compose state using `callbackFlow` and `produceState`?
- What's the difference between `collectAsState` and `collectAsStateWithLifecycle`?
- Can you call `rememberCoroutineScope().launch` inside a `LaunchedEffect`? What would happen?
- How does `derivedStateOf` avoid triggering unnecessary side effects?
- What happens if a `DisposableEffect` key changes — does `onDispose` run before the new setup?
- How would you observe a Flow from a ViewModel that should only collect when the app is in the foreground?
- What is the order of execution between `SideEffect`, `LaunchedEffect`, and `DisposableEffect` in the same composable?
- How do you handle back press events in Compose using `BackHandler` and how does it relate to side effects?
