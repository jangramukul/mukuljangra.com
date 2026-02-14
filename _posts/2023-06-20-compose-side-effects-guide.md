---
title: Compose Side Effects Guide
layout: post
categories: post
tags:
  - Jetpack Compose
  - Android
  - Kotlin Coroutines
---

The first time I used `LaunchedEffect` in a real project, I created an infinite loop that crashed the app. The composable was recomposing, which restarted the effect, which updated state, which triggered recomposition, which restarted the effect. Around and around it went, like a dog chasing its own tail — except the dog was my app, and the tail was an OOM crash.

It took me an embarrassing amount of time to figure out what happened. I was using `Unit` as the key, which meant the effect never restarted intentionally. But the effect itself was updating a state that the composable was reading. The effect wasn't the problem. My understanding of *when* effects run and restart was the problem.

Here's the thing about Compose side effects — surface-level understanding leads directly to bugs. The core idea sounds simple enough: composable functions can recompose at any time, so anything that shouldn't repeat on every recomposition — network calls, analytics events, subscriptions, one-time navigation — needs to be wrapped in a side effect API. But picking the *right* API for the *right* situation? That requires going deeper than most tutorials bother to go.

Think of it like kitchen appliances. You've got a blender, a food processor, a mixer, and a juicer. They all "process food," but if you try to make bread dough in a juicer, you're going to have a bad time. Compose gives you seven side effect tools, and each one has a very specific job. Use the wrong one and your app won't explode immediately — it'll just leak memory, fire phantom callbacks, or loop infinitely at 2 AM before a release.

## LaunchedEffect — The Workhorse

`LaunchedEffect` is the side effect you'll reach for most often. It launches a coroutine that's tied to the composition lifecycle. When the composable enters the composition, the coroutine starts. When the composable leaves, the coroutine is cancelled. If the key changes, the current coroutine is cancelled and a new one starts.

Think of it like a dedicated assistant who works only while you're in the office. You walk in, they start working. You leave, they stop. If you change what project you're working on (the key changes), they drop the old project and start the new one.

```kotlin
@Composable
fun OrderDetailScreen(
    orderId: String,
    viewModel: OrderDetailViewModel = hiltViewModel()
) {
    // Key = orderId. Effect restarts only when orderId changes.
    // If orderId stays the same across recompositions, the effect
    // keeps running — it does NOT restart.
    LaunchedEffect(orderId) {
        viewModel.loadOrder(orderId)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    // Show one-time error as snackbar
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState) {
        if (uiState is OrderState.Error) {
            snackbarHostState.showSnackbar(
                message = (uiState as OrderState.Error).message,
                duration = SnackbarDuration.Short
            )
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        when (val state = uiState) {
            is OrderState.Loading -> CircularProgressIndicator()
            is OrderState.Success -> OrderContent(state.order, Modifier.padding(padding))
            is OrderState.Error -> ErrorView(state.message)
        }
    }
}
```

Now, the key parameter is the most important thing to get right, and it's where most people trip up. `LaunchedEffect(Unit)` runs once when the composable enters composition and never restarts — good for one-time initialization. `LaunchedEffect(someId)` restarts when `someId` changes — good for loading data based on an argument. `LaunchedEffect(someState)` restarts every time `someState` changes — useful but easy to overuse.

Here's the reframe that finally made it click for me: **the key isn't "when should this run." It's "what input does this effect depend on."** If your effect depends on `orderId`, the key is `orderId`. If it depends on nothing (it's a one-time setup), the key is `Unit` or `true`. If you're not sure what the key should be, you probably don't fully understand what triggers your effect — and that's the real problem to solve first.

> **💡 The "aha" moment:** Stop thinking of the key as "when to run." Start thinking of it as "what does this effect care about." The key answers the question: if *this* value changes, should the effect restart from scratch?

## DisposableEffect — Setup and Teardown

Imagine you're staying at a hotel. You check in, you use the room, and when you check out, housekeeping comes in to clean up after you. That's `DisposableEffect` — it's the check-in *and* the checkout.

`DisposableEffect` is for effects that need cleanup. It provides an `onDispose` block that runs when the composable leaves the composition or when the key changes (before the effect restarts). This is the Compose equivalent of `onResume`/`onPause` or `addListener`/`removeListener`.

```kotlin
@Composable
fun LocationTrackingScreen(
    locationClient: FusedLocationProviderClient
) {
    val context = LocalContext.current
    var currentLocation by remember { mutableStateOf<Location?>(null) }

    DisposableEffect(locationClient) {
        val locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                currentLocation = result.lastLocation
            }
        }

        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            10_000L  // 10 second interval
        ).build()

        if (ActivityCompat.checkSelfPermission(
                context, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            locationClient.requestLocationUpdates(
                request, locationCallback, Looper.getMainLooper()
            )
        }

        // This block runs when the composable leaves composition
        // or when locationClient changes
        onDispose {
            locationClient.removeLocationUpdates(locationCallback)
        }
    }

    currentLocation?.let { location ->
        Text("Lat: ${location.latitude}, Lng: ${location.longitude}")
    }
}
```

The rule is straightforward: if you register something, you need to unregister it. If you acquire a resource, you need to release it. If you add a listener, you need to remove it. Any of those patterns means `DisposableEffect`, not `LaunchedEffect`.

What happens if you use `LaunchedEffect` for a listener instead? The listener is never removed. It keeps firing even after the composable is gone from the screen, causing memory leaks and phantom updates. Your user navigated away three screens ago, but the location callback is still happily updating a state object that nobody reads anymore. Not great.

One subtle point worth calling out: `DisposableEffect` does not provide a coroutine scope. The body runs synchronously on the main thread. If you need to do async setup followed by cleanup, you might need both — `LaunchedEffect` for the async work and `DisposableEffect` for the cleanup. But in practice, most cleanup scenarios are synchronous (removing a callback, closing a stream), so `DisposableEffect` alone is usually sufficient.

## SideEffect — Synchronizing With Non-Compose Code

`SideEffect` is the oddball of the family. It runs after every successful recomposition. No key. No coroutine scope. No cleanup. It's the "fire and forget" option — for synchronizing Compose state with non-Compose code like analytics, logging, or updating external systems that need to stay in sync with the UI.

```kotlin
@Composable
fun ProductDetailScreen(
    product: Product,
    analyticsTracker: AnalyticsTracker
) {
    // SideEffect runs after every successful recomposition
    // If recomposition fails (exception), it doesn't run
    SideEffect {
        analyticsTracker.setCurrentScreen("product_detail")
        analyticsTracker.setProductContext(product.id)
    }

    Column {
        Text(product.name, style = MaterialTheme.typography.headlineMedium)
        Text(product.description)
        Text("$${product.price}")
    }
}
```

`SideEffect` is the least-used of the three core effect APIs, and for good reason — most side effects need either a coroutine (`LaunchedEffect`) or cleanup (`DisposableEffect`). The niche for `SideEffect` is narrow: fire-and-forget synchronization that should happen on every recomposition, with no async work and no cleanup needed. Analytics screen tracking and logging are the most common real-world uses I've seen.

But here's where it gets dangerous. `SideEffect` runs *after* recomposition, not during. So what happens if you update state inside `SideEffect`? That state change triggers another recomposition — which triggers another `SideEffect` — which updates state again. You guessed it: infinite loop. This is the exact same trap that bit me with `LaunchedEffect`, and it's even easier to fall into with `SideEffect` because it runs on every recomposition by default.

> **🧠 Think about it:** If `SideEffect` runs after *every* successful recomposition, what would happen if you called `mutableState.value = newValue` inside one? Walk through the chain of events in your head before moving on.

## rememberCoroutineScope — Launching From Callbacks

`LaunchedEffect` ties a coroutine to the composition lifecycle — it starts automatically when the composable appears. But what about coroutines that should start when the *user* does something? A button click, a swipe, a long press?

You can't use `LaunchedEffect` for this because you don't want the coroutine to launch when the composable enters composition. You want it to launch when the user taps "Pay Now." That's where `rememberCoroutineScope` comes in.

Think of it this way: `LaunchedEffect` is an automatic sprinkler system — it turns on by itself on a schedule. `rememberCoroutineScope` is a garden hose — you pick it up and turn it on when you want to water something specific.

```kotlin
@Composable
fun CheckoutScreen(
    viewModel: CheckoutViewModel = hiltViewModel()
) {
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var isProcessing by remember { mutableStateOf(false) }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            // ... checkout form fields

            Button(
                onClick = {
                    scope.launch {
                        isProcessing = true
                        try {
                            viewModel.processPayment()
                            snackbarHostState.showSnackbar("Payment successful!")
                        } catch (e: Exception) {
                            snackbarHostState.showSnackbar("Payment failed: ${e.message}")
                        } finally {
                            isProcessing = false
                        }
                    }
                },
                enabled = !isProcessing
            ) {
                Text(if (isProcessing) "Processing..." else "Pay Now")
            }
        }
    }
}
```

The scope returned by `rememberCoroutineScope` is cancelled when the composable leaves the composition — so any coroutines launched from it are automatically cleaned up. This matters more than you might think. If you used `GlobalScope.launch` instead, that coroutine would keep running even after the user navigated away, potentially updating state on a composable that no longer exists. That's a recipe for crashes and ghost state updates.

## rememberUpdatedState — Capturing Latest Values in Long-Lived Effects

Here's a tricky scenario. Imagine you have a `LaunchedEffect(Unit)` — it runs once and never restarts. Inside it, you reference a lambda that was passed in as a parameter. Three seconds later, the parent recomposes and passes a *different* lambda. But your effect already captured the old one. It's like taking a photo of someone's phone number — if they change their number later, your photo is outdated.

`rememberUpdatedState` solves this by holding a reference that always points to the latest value, even inside a non-restarting effect. Instead of a photo, it's more like a contact card that auto-updates.

```kotlin
@Composable
fun SplashScreen(onTimeout: () -> Unit) {
    // If the parent recomposes with a different onTimeout lambda,
    // the LaunchedEffect below still calls the OLD one without this
    val currentOnTimeout by rememberUpdatedState(onTimeout)

    LaunchedEffect(Unit) {
        delay(3000L)
        currentOnTimeout()  // Always calls the latest lambda
    }

    // Splash UI...
}
```

Real-world use case: timer-based effects where the callback might change, long-running animations where the completion handler is updated, or any `LaunchedEffect(Unit)` that references composable parameters. Anytime you have a long-lived effect that touches values from the outside world, ask yourself: could this value change while my effect is still running? If yes, `rememberUpdatedState` is your friend.

## produceState — Converting Non-Compose Sources to State

`produceState` creates a Compose `State` from a non-Compose data source. It launches a coroutine that updates the state, and it's lifecycle-aware — the coroutine is cancelled when the composable leaves composition.

Think of it as a translator sitting between two people who speak different languages. The callback-based API speaks "callback," Compose speaks "state," and `produceState` translates between them in real time.

```kotlin
@Composable
fun ConnectivityBanner(connectivityManager: ConnectivityManager) {
    val isConnected by produceState(initialValue = true) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { value = true }
            override fun onLost(network: Network) { value = false }
        }
        connectivityManager.registerDefaultNetworkCallback(callback)
        awaitDispose {
            connectivityManager.unregisterNetworkCallback(callback)
        }
    }

    AnimatedVisibility(visible = !isConnected) {
        Text(
            "No internet connection",
            modifier = Modifier.fillMaxWidth().background(Color.Red).padding(8.dp),
            color = Color.White
        )
    }
}
```

`produceState` is essentially a `LaunchedEffect` that produces a `State<T>`. The `awaitDispose` block inside it handles cleanup when the composable leaves composition — similar to `DisposableEffect`'s `onDispose`. Use it when you need to convert a callback-based API into Compose state. If you find yourself writing a `LaunchedEffect` that just updates a `mutableStateOf`, that's a sign you probably want `produceState` instead — it bundles that whole pattern into one clean call.

## snapshotFlow — Converting Compose State to Flow

Now we go the other direction. If `produceState` converts callback-world into Compose-state-world, `snapshotFlow` converts Compose-state-world into Flow-world. It reads Compose state and emits it as a Flow. Every time the state value changes, the flow emits the new value.

Why would you want this? Because Flows give you operators. You can `distinctUntilChanged()`, `debounce()`, `filter()`, and `map()` your Compose state changes before reacting to them. That's powerful.

```kotlin
@Composable
fun OrderListScreen(lazyListState: LazyListState = rememberLazyListState()) {
    // Convert scroll state to a Flow for pagination logic
    LaunchedEffect(lazyListState) {
        snapshotFlow {
            val layoutInfo = lazyListState.layoutInfo
            val lastVisibleIndex = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = layoutInfo.totalItemsCount
            lastVisibleIndex >= totalItems - 5  // within 5 items of the end
        }
            .distinctUntilChanged()
            .filter { it }  // only when we're near the end
            .collect { viewModel.loadNextPage() }
    }

    LazyColumn(state = lazyListState) {
        // ... items
    }
}
```

Real-world use case: triggering pagination based on scroll position (like the example above), logging analytics when a user scrolls past a certain point, or saving scroll position to persistence when the user stops scrolling. Anytime you want to *react* to Compose state changes with Flow operators instead of raw recomposition, reach for `snapshotFlow`.

## derivedStateOf — Computed State Without Recomposition

`derivedStateOf` is a performance tool that solves a specific problem. It creates a state value that only changes when the *computation result* actually changes, not when the inputs change. Sounds like the same thing? It's not.

Imagine a shopping cart with 50 items. The user scrolls the list, quantities update, items get added and removed. Every change triggers recomposition. But your "Checkout" button only cares about one thing: is the cart non-empty and do all items have a quantity greater than zero? That answer is `true` probably 99% of the time across all those recompositions. Without `derivedStateOf`, the button recomposes every single time. With it, the button only recomposes when the answer flips between `true` and `false`.

```kotlin
@Composable
fun ShoppingCart(items: List<CartItem>) {
    // Without derivedStateOf, any scroll or item change recomputes
    // the button's enabled state on every recomposition
    val isCheckoutEnabled by remember {
        derivedStateOf { items.isNotEmpty() && items.all { it.quantity > 0 } }
    }

    val totalPrice by remember {
        derivedStateOf {
            items.sumOf { it.price * it.quantity }
        }
    }

    Column {
        LazyColumn {
            items(items) { item -> CartItemRow(item) }
        }
        Text("Total: $${String.format("%.2f", totalPrice)}")
        Button(
            onClick = { /* checkout */ },
            enabled = isCheckoutEnabled
        ) {
            Text("Checkout")
        }
    }
}
```

The key insight: `derivedStateOf` reads Compose state objects and only triggers recomposition of its readers when the computed value actually changes. If `items` has 50 elements and one of them changes its `quantity` but the total stays the same (unlikely but possible), the `Text` showing the total doesn't recompose. For the `isNotEmpty()` check that's `true` 99% of the time, this avoids a lot of wasted recomposition.

> **⚡ Quick check:** You have a `LazyColumn` with 200 items and a "scroll to top" FAB that should only appear when the user has scrolled past the first item. Would you use `derivedStateOf` here? Why or why not?

## Choosing the Right Effect

Alright, seven APIs. That can feel overwhelming. But the decision tree is actually simpler than it looks once you internalize it. Walk through these questions in order:

**Does the effect need to launch automatically when the composable appears?** Use `LaunchedEffect`. The key should be whatever input the effect depends on.

**Does the effect need cleanup when the composable disappears?** Use `DisposableEffect`. Put the cleanup in `onDispose`.

**Is the effect just synchronizing Compose state with external code, with no async work and no cleanup?** Use `SideEffect`.

**Does the effect need to launch in response to a user action (button click, gesture)?** Use `rememberCoroutineScope` and launch from the callback.

**Do you need to convert a callback-based API into Compose state?** Use `produceState`.

**Do you need to convert Compose state into a Flow?** Use `snapshotFlow` inside a `LaunchedEffect`.

**Do you need a computed value that avoids recomposition when the result doesn't change?** Use `derivedStateOf`.

**Does a long-running effect reference a lambda that might change?** Use `rememberUpdatedState` to always capture the latest value.

Here's a real example that puts two of these together in the same screen:

```kotlin
@Composable
fun LiveUpdatesScreen(
    viewModel: LiveUpdatesViewModel = hiltViewModel()
) {
    // LaunchedEffect for Flow collection — cancellation IS the cleanup
    LaunchedEffect(Unit) {
        viewModel.liveUpdates.collect { update ->
            // Handle update
        }
    }

    // DisposableEffect when you need explicit cleanup
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.startPolling()
            } else if (event == Lifecycle.Event.ON_PAUSE) {
                viewModel.stopPolling()
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
        }
    }
}
```

Notice how `LaunchedEffect` doesn't need an `onDispose` — coroutine cancellation *is* the cleanup. But the lifecycle observer can't rely on cancellation. It's a plain callback, so `DisposableEffect` with `onDispose` is the right fit.

> **🔥 Real talk:** IMO, the most common mistake I see in codebases is reaching for `rememberCoroutineScope` when `LaunchedEffect` is the right choice. If the work should start automatically and restart when inputs change, `LaunchedEffect` gives you that behavior for free. Wrapping `rememberCoroutineScope` with a `LaunchedEffect` to trigger it is like hiring a middleman to hand a letter to someone standing right next to you.

The second most common mistake is forgetting that `LaunchedEffect` cancels its coroutine when the key changes. If you're collecting a Flow in a `LaunchedEffect` keyed to some state, every time that state changes, the Flow collection restarts from scratch. For most ViewModels emitting StateFlow, this is fine — the collector immediately gets the current value. But for SharedFlow or cold Flows with expensive setup, it can cause unexpected behavior that's hard to debug.

Compose's effect system takes some time to internalize, but once you understand the lifecycle semantics — when each effect starts, restarts, and cleans up — they become predictable tools rather than mysterious APIs. The key is matching the effect to the lifecycle behavior you actually need, not reaching for the one you used last time.

Thanks for reading!
