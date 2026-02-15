---
title: Compose Side Effects Guide
layout: post
sequence: 35
categories: post
tags:
  - Jetpack Compose
  - Android
  - Kotlin Coroutines
---

The first time I used `LaunchedEffect` in a real project, I misunderstood the key parameter and created an infinite loop that crashed the app. The composable was recomposing, which restarted the effect, which updated state, which triggered recomposition, which restarted the effect. It took me an embarrassing amount of time to realize that I was using `Unit` as the key — meaning the effect never restarted intentionally — but the effect itself was triggering recomposition by updating a state that the composable read. The effect wasn't the problem. My understanding of when effects run and restart was the problem.

Compose side effects are one of those topics where surface-level understanding leads directly to bugs. The core idea is simple: Composable functions can recompose at any time, so anything that shouldn't repeat on every recomposition — network calls, analytics events, subscriptions, one-time navigation — needs to be wrapped in a side effect API. But choosing the right API for the right situation, and understanding the lifecycle semantics of each one, requires going a layer deeper than most tutorials cover.

## LaunchedEffect — The Workhorse

`LaunchedEffect` launches a coroutine that's tied to the composition lifecycle. When the composable enters the composition, the coroutine starts. When the composable leaves the composition, the coroutine is cancelled. If the key changes, the current coroutine is cancelled and a new one starts.

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

The key parameter is the most important thing to get right. `LaunchedEffect(Unit)` runs once when the composable enters composition and never restarts — good for one-time initialization. `LaunchedEffect(someId)` restarts when `someId` changes — good for loading data based on an argument. `LaunchedEffect(someState)` restarts every time `someState` changes — useful but easy to overuse.

Here's the reframe that helped me: **the key isn't "when should this run." It's "what input does this effect depend on."** If your effect depends on `orderId`, the key is `orderId`. If it depends on nothing (it's a one-time setup), the key is `Unit` or `true`. If you're not sure what the key should be, you probably don't fully understand what triggers your effect, and that's the real problem to solve first.

## DisposableEffect — Setup and Teardown

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

The rule is straightforward: if you register something, you need to unregister it. If you acquire a resource, you need to release it. If you add a listener, you need to remove it. Any of those patterns means `DisposableEffect`, not `LaunchedEffect`. If you use `LaunchedEffect` for a listener, the listener is never removed — it'll keep firing even after the composable is gone from the screen, causing memory leaks and phantom updates.

One subtle point: `DisposableEffect` does not provide a coroutine scope. The body runs synchronously on the main thread. If you need to do async setup followed by cleanup, you might need both — `LaunchedEffect` for the async work and `DisposableEffect` for the cleanup. But in practice, most cleanup scenarios are synchronous (removing a callback, closing a stream), so `DisposableEffect` alone is usually sufficient.

## SideEffect — Synchronizing With Non-Compose Code

`SideEffect` runs after every successful recomposition. It has no key, no coroutine scope, and no cleanup. It's for synchronizing Compose state with non-Compose code — analytics, logging, or updating external systems that need to stay in sync with the UI.

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

`SideEffect` is the least-used of the three, and for good reason — most side effects need either a coroutine (`LaunchedEffect`) or cleanup (`DisposableEffect`). The niche for `SideEffect` is narrow: fire-and-forget synchronization that should happen on every recomposition, with no async work and no cleanup needed. Analytics screen tracking and logging are the most common uses I've seen.

The important thing to understand is that `SideEffect` runs after recomposition, not during. If you update state inside `SideEffect`, it triggers another recomposition — which triggers another `SideEffect`. This is the same infinite loop potential that bit me with `LaunchedEffect`, and it's even easier to trigger with `SideEffect` because it runs on every recomposition by default.

## rememberCoroutineScope — Launching From Callbacks

`LaunchedEffect` ties a coroutine to the composition lifecycle. But sometimes you need to launch a coroutine from a callback — a button click, a gesture, a user action. You can't use `LaunchedEffect` for this because the coroutine should start on the user's action, not when the composable enters composition. That's where `rememberCoroutineScope` comes in.

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

The scope returned by `rememberCoroutineScope` is cancelled when the composable leaves the composition — so any coroutines launched from it are automatically cleaned up. This is important. If you used `GlobalScope.launch` instead, the coroutine would keep running even after the user navigated away, potentially updating state on a composable that no longer exists.

## rememberUpdatedState — Capturing Latest Values in Long-Lived Effects

Here's a subtle but important problem: you have a `LaunchedEffect` that runs for a long time (or runs once), but inside it you reference a lambda or value that might change. Since `LaunchedEffect(Unit)` never restarts, it captures the initial value and never sees updates.

`rememberUpdatedState` solves this by holding a reference that always points to the latest value, even inside a non-restarting effect.

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

Real-world use case: timer-based effects where the callback might change, long-running animations where the completion handler is updated, or any `LaunchedEffect(Unit)` that references composable parameters.

## produceState — Converting Non-Compose Sources to State

`produceState` creates a Compose `State` from a non-Compose data source. It launches a coroutine that updates the state, and it's lifecycle-aware — the coroutine is cancelled when the composable leaves composition.

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

`produceState` is essentially a `LaunchedEffect` that produces a `State<T>`. The `awaitDispose` block inside it handles cleanup when the composable leaves composition — similar to `DisposableEffect`'s `onDispose`. Use it when you need to convert a callback-based API into Compose state.

## snapshotFlow — Converting Compose State to Flow

The inverse of `produceState`. `snapshotFlow` reads Compose state and emits it as a Flow. Every time the state value changes, the flow emits the new value.

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

Real-world use case: triggering pagination based on scroll position, logging analytics when a user scrolls past a certain point, saving scroll position to persistence when the user stops scrolling.

## derivedStateOf — Computed State Without Recomposition

`derivedStateOf` creates a state value that only changes when the computation result actually changes, not when the inputs change. This is a performance tool — it prevents unnecessary recompositions when the derived value stays the same despite input changes.

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

The key insight: `derivedStateOf` reads Compose state objects and only triggers recomposition of its readers when the computed value actually changes. If `items` has 50 elements and one of them changes its `quantity` but the total stays the same (unlikely but possible), the `Text` showing the total doesn't recompose. For lists where the `isNotEmpty()` check is the same 99% of the time, this avoids a lot of wasted recomposition.

## Choosing the Right Effect

The decision tree is simpler than it looks once you internalize it.

**Does the effect need to launch automatically when the composable appears?** Use `LaunchedEffect`. The key should be whatever input the effect depends on.

**Does the effect need cleanup when the composable disappears?** Use `DisposableEffect`. Put the cleanup in `onDispose`.

**Is the effect just synchronizing Compose state with external code, with no async work and no cleanup?** Use `SideEffect`.

**Does the effect need to launch in response to a user action (button click, gesture)?** Use `rememberCoroutineScope` and launch from the callback.

**Do you need to convert a callback-based API into Compose state?** Use `produceState`.

**Do you need to convert Compose state into a Flow?** Use `snapshotFlow` inside a `LaunchedEffect`.

**Do you need a computed value that avoids recomposition when the result doesn't change?** Use `derivedStateOf`.

**Does a long-running effect reference a lambda that might change?** Use `rememberUpdatedState` to always capture the latest value.

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

IMO, the most common mistake I see is reaching for `rememberCoroutineScope` when `LaunchedEffect` is the right choice. If the work should start automatically and restart when inputs change, `LaunchedEffect` gives you that behavior for free. Using `rememberCoroutineScope` with a `LaunchedEffect` to trigger it is adding complexity for no benefit.

The second most common mistake is forgetting that `LaunchedEffect` cancels its coroutine when the key changes. If you're collecting a Flow in a `LaunchedEffect` keyed to some state, every time that state changes, the Flow collection restarts from scratch. For most ViewModels emitting StateFlow, this is fine — the collector immediately gets the current value. But for SharedFlow or cold Flows with expensive setup, it can cause unexpected behavior.

Compose's effect system takes some time to internalize, but once you understand the lifecycle semantics — when each effect starts, restarts, and cleans up — they become predictable tools rather than mysterious APIs. The key is matching the effect to the lifecycle behavior you actually need, not reaching for the one you used last time.

Thanks for reading!
