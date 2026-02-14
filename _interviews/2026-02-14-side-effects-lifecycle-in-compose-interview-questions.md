---
title: "Side Effects & Lifecycle in Compose"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 19
sequence: 19
description: "Side effects and lifecycle are fundamental to real-world Compose development."
---

## Side Effects & Lifecycle in Compose

Here's the thing about side effects in Compose — they're where the "real world" meets your pure, declarative UI code. Think of it like this: your composable functions are a recipe, but side effects are the actual cooking. Every team using Compose will grill you on `LaunchedEffect`, `DisposableEffect`, and how Compose's lifecycle maps to the Activity lifecycle, because getting these wrong leads to resource leaks, crashes, and the kind of subtle bugs that only show up in production.

#### What is a side effect in Compose?

A side effect is anything that escapes the composable function's own little world. Network calls, logging, writing to a database, showing a toast, launching a coroutine — all side effects. Your composable functions are supposed to be pure — give them the same input, get the same UI — but real apps need to talk to the outside world.

That's why Compose gives you dedicated effect handlers like `LaunchedEffect`, `DisposableEffect`, and `SideEffect`. Running side effects directly in the composable body is a trap, because that function re-executes on every single recomposition.

#### What is the Compose lifecycle?

A composable has three lifecycle events — and honestly, it's refreshingly simple compared to the Activity lifecycle:

- **Enter composition** — The composable is called for the first time. `remember` values are initialized, effects start running, and the UI node is created.
- **Recompose** — The composable is re-invoked because input state changed. `remember` values survive, but the function body re-executes. Effects with changed keys restart.
- **Leave composition** — The composable is removed from the UI tree. `remember` values are forgotten, `DisposableEffect` cleanup runs, and `LaunchedEffect` coroutines are cancelled.

No "paused" or "stopped" state here. A composable is either in the composition or it's not. That's it.

#### What is LaunchedEffect and when do you use it?

Think of `LaunchedEffect` as a coroutine with an automatic leash. When the composable enters composition, the coroutine starts. When it leaves or the key changes, the coroutine gets cancelled — no cleanup code needed. I reach for it whenever I need async work inside a composable: data loading, animations, collecting events.

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

The key (`userId`) is the interesting part. When `userId` changes, the current coroutine is cancelled and a new one starts. Pass `Unit` as the key, and the effect runs once and never restarts.

#### What is DisposableEffect and how is it different from LaunchedEffect?

`DisposableEffect` is for the "subscribe now, unsubscribe later" pattern. It provides an `onDispose` block that runs when the composable leaves composition or the key changes. Think of it like checking into a hotel — you register on arrival, and you check out when you leave.

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

Here's the key difference: `DisposableEffect` doesn't launch a coroutine. It runs a synchronous block and gives you cleanup. `LaunchedEffect` is for async work, `DisposableEffect` is for registering and unregistering resources.

> **🧠 Think about it:** If you used `LaunchedEffect` to register a lifecycle observer but forgot cleanup, what would happen when the composable leaves the tree?

#### What is SideEffect and when do you use it?

`SideEffect` is the simplest of the bunch — it runs after every successful composition, both initial and every recomposition. No key, no cleanup. I use it to sync Compose state to non-Compose code.

```kotlin
@Composable
fun AnalyticsTracker(screenName: String) {
    SideEffect {
        analytics.setCurrentScreen(screenName)
    }
}
```

It only runs after composition succeeds — if composition gets cancelled halfway through, the effect doesn't fire. Keep it lightweight since it runs on every recomposition.

#### What is the difference between rememberCoroutineScope and LaunchedEffect?

`rememberCoroutineScope` gives you a `CoroutineScope` tied to the composable's lifecycle — the scope gets cancelled when the composable leaves composition. But here's the difference: *you* decide when the coroutine launches, typically in response to user events like button clicks.

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

Use `LaunchedEffect` when the coroutine should start automatically based on state. Use `rememberCoroutineScope` when the coroutine should start in response to a callback. And you can't call `LaunchedEffect` inside a click handler anyway — it's a composable function, not a regular function.

#### What is rememberUpdatedState and why is it needed?

This one's subtle. When a `LaunchedEffect` uses `Unit` as its key, it captures the initial values of its closure and never restarts. If those values change during recomposition, the effect is still holding onto the old ones — like taking a photo of a phone number instead of saving the contact.

`rememberUpdatedState` fixes this by keeping a mutable state reference that always points to the latest value.

```kotlin
@Composable
fun SplashScreen(onTimeout: () -> Unit) {
    val currentOnTimeout by rememberUpdatedState(onTimeout)

    LaunchedEffect(Unit) {
        delay(3000)
        currentOnTimeout()
    }
}
```

Without `rememberUpdatedState`, if the parent recomposes and passes a different `onTimeout` lambda, the `LaunchedEffect` would still call the original one. Plot twist: your navigation callback changed, but the splash screen didn't get the memo.

#### What is the difference between LaunchedEffect(Unit) and LaunchedEffect(true)?

Functionally, no difference. Both run once and never restart because the key never changes. The convention is `Unit` because it communicates intent more clearly — "this effect has no meaningful key."

The real distinction is between constant keys and meaningful keys. `LaunchedEffect(userId)` restarts when `userId` changes. `LaunchedEffect(Unit)` never restarts. Choosing the wrong key is a common source of bugs — using `Unit` when you should use a parameter means your effect captures stale values and never refreshes.

#### What is produceState?

`produceState` is a convenience wrapper that converts a non-Compose data source into Compose state. It's essentially `remember` + `mutableStateOf` + `LaunchedEffect` bundled into one API. It launches a coroutine that sets a state value over time.

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

The coroutine restarts when the key (`url`) changes, just like `LaunchedEffect`. I reach for it when I have a suspend function or callback-based API that produces state — it's cleaner than manually wiring up `remember` with `LaunchedEffect`.

#### What is snapshotFlow?

`snapshotFlow` does the reverse of `collectAsState`. Instead of converting a Flow into Compose state, it converts Compose state into a Flow. It creates a flow that emits whenever any state object read inside its block changes.

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

I use it when I need Flow operators like `debounce`, `filter`, or `distinctUntilChanged` on Compose state. It only emits when the value actually changes.

> **🧠 Think about it:** Why would you use `snapshotFlow` with `distinctUntilChanged` inside a `LaunchedEffect` instead of just reading the state directly in the composable body?

#### How does the Compose lifecycle relate to the Activity lifecycle?

The Compose UI tree lives inside a `ComposeView` in the Activity's view hierarchy. When the Activity is created and `setContent` is called, the initial composition happens. When the Activity is destroyed, the composition is disposed.

During configuration changes, the composition is disposed and recreated. `remember` values are lost, but `rememberSaveable` values survive because they're persisted to the `savedInstanceState` Bundle. ViewModel state also survives because the `ViewModelStore` is retained.

To observe the Activity lifecycle inside composables, I use `LocalLifecycleOwner.current` with a `DisposableEffect`:

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

#### How do you handle one-time events like navigation and snackbars?

One-time events are tricky because recomposition can cause effects to re-execute. The go-to pattern is a `Channel` in the ViewModel collected inside a `LaunchedEffect`:

```kotlin
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

`Channel` guarantees each event is consumed exactly once. Using `StateFlow` for one-time events is a mistake — it replays the last value on resubscription, which means the event fires again after a configuration change.

#### How does Compose handle effects during configuration changes?

When a configuration change hits and the Activity recreates, the entire composition is disposed and rebuilt from scratch. All `LaunchedEffect` coroutines are cancelled. All `DisposableEffect` cleanup runs. All `remember` values are gone.

On the new composition, everything starts fresh — `LaunchedEffect` launches new coroutines, `DisposableEffect` runs its setup block again. State from `rememberSaveable` is restored, and ViewModel state is still available.

Here's the thing: any in-flight network request inside a `LaunchedEffect` gets cancelled during rotation. If I need work to survive configuration changes, I launch it in the ViewModel's `viewModelScope` instead. `LaunchedEffect` is for UI-scoped work like animations and event collection. ViewModel scope is for business logic that should outlive the composable.

#### What is the key() composable and when do you need it?

`key()` overrides Compose's default positional identity. Normally, Compose identifies a composable by its position in the source code — like recognizing people by their seat number in a classroom. Inside loops or conditional blocks where composables can change order, that breaks down.

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

Without `key()`, removing the first user makes Compose think the second item became the first, the third became the second, and so on. All items recompose with wrong data and effects restart unnecessarily. With `key(user.id)`, Compose correctly matches each composable to its data even when the list changes. `LazyColumn` handles this through its `key` parameter in `items()`.

#### How do multiple LaunchedEffects work in the same composable?

Each `LaunchedEffect` is independent — separate coroutines, separate keys, separate lifecycles. They run concurrently and don't affect each other.

```kotlin
@Composable
fun DashboardScreen(userId: String) {
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

The first two restart when `userId` changes. The third runs once and collects events for the lifetime of the composable. If I need coroutines to run sequentially, I put them in a single `LaunchedEffect`.

#### What happens when you call effects conditionally?

Conditional effects work because Compose treats them like any other composable. When the condition is true, the effect enters composition and starts. When the condition becomes false, the effect leaves composition — coroutine cancelled, cleanup runs.

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

This is actually useful — the effect only exists while the condition holds. But nesting effects inside other effects is a code smell. If I need to launch a coroutine from inside a `LaunchedEffect`, I just use the coroutine scope directly since I'm already inside a suspend function.

#### How does process death affect Compose state?

Process death is the nuclear option — the entire process is gone. `remember` values, ViewModel data, all in-memory state — wiped out. Only data saved through `rememberSaveable` or `SavedStateHandle` survives because it's serialized to a Bundle stored outside the process.

```kotlin
@Composable
fun FilterScreen() {
    var searchQuery by rememberSaveable { mutableStateOf("") }

    var selectedFilter by rememberSaveable(stateSaver = FilterSaver) {
        mutableStateOf(Filter.Default)
    }
}

val FilterSaver = Saver<Filter, String>(
    save = { it.name },
    restore = { Filter.valueOf(it) }
)
```

I keep `rememberSaveable` for lightweight UI state the user expects to persist — scroll position, search queries, selected tabs. Heavy data lives in the ViewModel and gets re-fetched after process death.

> **🧠 Think about it:** If your ViewModel holds a list of items fetched from the network and the user rotates the device, what survives and what needs to be re-fetched? What about after process death?

#### What is movableContentOf and how does it interact with lifecycle?

`movableContentOf` lets you move a composable from one part of the tree to another without losing its identity. Normally, moving a composable to a different parent is like picking up a plant and replanting it — it leaves composition (state lost, effects disposed) and re-enters (fresh state, effects restart). `movableContentOf` is like moving the entire pot — everything stays intact.

```kotlin
@Composable
fun AdaptiveLayout(isWideScreen: Boolean) {
    val playerContent = remember {
        movableContentOf {
            VideoPlayer(url = videoUrl)
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

#### What is the difference between collectAsState and collectAsStateWithLifecycle?

`collectAsState` collects from a Flow regardless of the app's lifecycle state — even when the app is in the background, the collection keeps going. `collectAsStateWithLifecycle` is lifecycle-aware. It stops collecting when the lifecycle drops below a certain state (default is `STARTED`) and restarts when the lifecycle resumes.

```kotlin
@Composable
fun HomeScreen(viewModel: HomeViewModel) {
    // Keeps collecting in background — wastes resources
    val state1 by viewModel.uiState.collectAsState()

    // Stops collecting when app goes to background
    val state2 by viewModel.uiState.collectAsStateWithLifecycle()
}
```

I always use `collectAsStateWithLifecycle` for UI state. It prevents unnecessary work in the background and avoids potential crashes from updating UI when the app isn't visible. It requires the `androidx.lifecycle:lifecycle-runtime-compose` dependency.

#### What is the order of execution between SideEffect, LaunchedEffect, and DisposableEffect?

`DisposableEffect` runs its setup block synchronously during composition. `SideEffect` runs after composition completes successfully. `LaunchedEffect` launches its coroutine after composition, but the coroutine is dispatched — it doesn't run immediately.

So the order is: `DisposableEffect` setup first (during composition), then `SideEffect` (after composition succeeds), then `LaunchedEffect` coroutine starts executing (dispatched). On disposal, `DisposableEffect`'s `onDispose` block runs, and `LaunchedEffect`'s coroutine gets cancelled.

#### How do you handle back press events in Compose?

`BackHandler` is a composable that intercepts back presses. Under the hood, it uses a `DisposableEffect` to register an `OnBackPressedCallback` with the `OnBackPressedDispatcher`.

```kotlin
@Composable
fun SearchScreen(onClose: () -> Unit) {
    var showResults by remember { mutableStateOf(false) }

    BackHandler(enabled = showResults) {
        showResults = false
    }

    if (!showResults) {
        BackHandler {
            onClose()
        }
    }
}
```

Since `BackHandler` is a composable, it follows composition lifecycle. It can be conditional, and multiple `BackHandler` calls stack — the most recently composed enabled one handles the back press first. Much cleaner than the old Activity `onBackPressed` approach.

### Common Follow-ups

- How would you convert a callback-based API (like a sensor listener) into Compose state using `callbackFlow` and `produceState`?
- Can you call `rememberCoroutineScope().launch` inside a `LaunchedEffect`? What would happen?
- How does `derivedStateOf` avoid triggering unnecessary side effects?
- What happens if a `DisposableEffect` key changes — does `onDispose` run before the new setup?
- How would you observe a Flow from a ViewModel that should only collect when the app is in the foreground?
- What happens to effects inside a `Dialog` or `ModalBottomSheet` composable when the dialog is dismissed?
- How do you scope a `LaunchedEffect` to a `NavBackStackEntry` so it survives configuration changes but not navigation away?
