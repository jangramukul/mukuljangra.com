---
title: Compose Side Effects Guide
layout: post
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

The distinction between `LaunchedEffect` and `rememberCoroutineScope` is worth repeating: `LaunchedEffect` launches automatically when the composable enters composition (or when the key changes). `rememberCoroutineScope` gives you a scope to launch from manually, in response to events. If the work should happen on entry, use `LaunchedEffect`. If the work should happen on user action, use `rememberCoroutineScope`.

## Choosing the Right Effect

The decision tree is simpler than it looks once you internalize it.

**Does the effect need to launch automatically when the composable appears?** Use `LaunchedEffect`. The key should be whatever input the effect depends on.

**Does the effect need cleanup when the composable disappears?** Use `DisposableEffect`. Put the cleanup in `onDispose`.

**Is the effect just synchronizing Compose state with external code, with no async work and no cleanup?** Use `SideEffect`.

**Does the effect need to launch in response to a user action (button click, gesture)?** Use `rememberCoroutineScope` and launch from the callback.

**Does the effect need both async work AND cleanup?** This is the tricky case. You can use `DisposableEffect` for setup/teardown and launch coroutines inside it using a remembered scope. Or you can use `LaunchedEffect` if the coroutine's cancellation serves as your cleanup (which it often does for Flow collection).

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
