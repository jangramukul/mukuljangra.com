---
title: Kotlin callbackFlow Guide
layout: post
sequence: 119
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Android is full of callback-based APIs. LocationManager, SensorManager, Firebase listeners, BroadcastReceiver, ConnectivityManager — the list goes on. These APIs were designed years before coroutines existed, and they all follow the same pattern: register a callback, receive updates, unregister when done. The problem is that modern Android code runs on Kotlin coroutines and Flow. Your ViewModel collects a Flow. Your repository exposes a Flow. But the underlying platform API hands you a callback interface and says "good luck."

I ran into this friction early on when wrapping `LocationManager` updates in a coroutine-based architecture. The naive approach — creating a `MutableSharedFlow` and emitting from a callback — technically works but leaks the listener if the collector cancels. You end up managing lifecycle manually, which is exactly what Flow was supposed to eliminate. `callbackFlow` solves this by giving you a structured, cancellation-aware bridge from any callback API to a cold Flow. It handles the registration, the emission, and the cleanup in one place.

This guide covers how `callbackFlow` works internally, the critical distinction between `trySend` and `send`, why `awaitClose` is mandatory, and production-ready examples you can drop into real projects.

## The Problem: Callbacks in a Coroutine World

You can't call `collect` on a callback API. Callbacks are push-based — the system calls your code when something happens. Flows are pull-based — the collector pulls values from a producer. These two models don't naturally compose.

The first instinct most developers have is to bridge the gap with a `MutableSharedFlow` or `MutableStateFlow`:

```kotlin
class LocationTracker(
    private val locationManager: LocationManager
) {
    private val _locations = MutableSharedFlow<Location>()
    val locations: Flow<Location> = _locations

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            // Problem: what scope do we use to emit?
            // Problem: who unregisters this listener?
            runBlocking { _locations.emit(location) }
        }
    }

    fun startTracking() {
        locationManager.requestLocationUpdates(
            LocationManager.GPS_PROVIDER,
            1000L,
            10f,
            listener
        )
    }

    fun stopTracking() {
        locationManager.removeUpdates(listener)
    }
}
```

This has multiple problems. The `SharedFlow` lives outside the collection scope, so it keeps emitting even after the collector cancels. `runBlocking` inside a callback blocks the calling thread — which might be the main thread. And the lifecycle management is manual: the caller has to remember to call `stopTracking()`, and if they forget, the listener leaks.

`callbackFlow` fixes all of these because it ties the callback's lifecycle to the Flow's collection. When the collector cancels, the callback gets unregistered automatically. No manual lifecycle management.

## callbackFlow Anatomy

`callbackFlow` creates a cold Flow backed by a channel. Inside the builder, you get a `ProducerScope` — which is both a `CoroutineScope` and a `SendChannel`. You register your callback, emit values into the channel, and use `awaitClose` to clean up when collection ends.

Here's the complete pattern with `LocationManager`:

```kotlin
fun LocationManager.locationFlow(
    provider: String = LocationManager.GPS_PROVIDER,
    minTimeMs: Long = 1000L,
    minDistanceM: Float = 10f
): Flow<Location> = callbackFlow {

    val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            trySend(location)
        }
    }

    requestLocationUpdates(provider, minTimeMs, minDistanceM, listener)

    awaitClose {
        removeUpdates(listener)
    }
}
```

That's the entire implementation — 12 lines. The `callbackFlow` block runs when a collector starts collecting. Inside, you register the callback and call `trySend` to push values into the channel. `awaitClose` suspends indefinitely, keeping the Flow alive until the collector cancels. When cancellation happens — whether from `viewModelScope` being cleared, a `take(1)` operator, or explicit cancellation — the lambda inside `awaitClose` runs and unregisters the listener.

The key insight here is that `callbackFlow` is a cold Flow. Every new collector gets its own `ProducerScope`, its own channel, and its own callback registration. If two ViewModels collect the same `locationFlow()`, two listeners get registered. If you want shared collection, combine `callbackFlow` with `shareIn` on a `CoroutineScope`.

One layer below the surface, `callbackFlow` is essentially `channelFlow` with an extra safety check. Both create a `ProducerScope` backed by a buffered channel (default capacity of 64 elements). The difference is that `callbackFlow` enforces that you call `awaitClose` — if the block completes without `awaitClose`, it throws an `IllegalStateException`. This enforcement exists because forgetting `awaitClose` in a callback scenario almost always means a leaked listener.

## trySend vs send

This distinction trips people up, but it matters for correctness.

`send` is a suspending function. It suspends the current coroutine if the channel's buffer is full, waiting until there's space. `trySend` is non-suspending — it attempts to add the element immediately and returns a `ChannelResult` indicating success or failure.

In callback code, **always use `trySend`**. The reason is straightforward: callbacks aren't called from coroutines. `LocationListener.onLocationChanged` is called by the Android framework on whatever thread it chooses. There's no coroutine to suspend. If you try to call `send` from a regular callback, the compiler won't stop you because `ProducerScope` is a `CoroutineScope` — but you'd be suspending in the wrong context.

```kotlin
// **Wrong** — send is suspending, but the callback isn't a coroutine
val listener = object : LocationListener {
    override fun onLocationChanged(location: Location) {
        // This compiles because ProducerScope is a CoroutineScope,
        // but it's conceptually wrong in a callback context
        launch { send(location) }
    }
}

// **Correct** — trySend is non-suspending, safe from any thread
val listener = object : LocationListener {
    override fun onLocationChanged(location: Location) {
        trySend(location)
    }
}
```

`trySend` returns a `ChannelResult`. If the channel is full, the element is dropped — no suspension, no exception. You can check the result and handle failures:

```kotlin
override fun onLocationChanged(location: Location) {
    trySend(location)
        .onFailure { throwable ->
            // Channel is closed or full
            // Log it, but don't crash
            Log.w("LocationFlow", "Failed to send location", throwable)
        }
}
```

If dropping elements is unacceptable, increase the buffer on the resulting flow with `.buffer(Channel.UNLIMITED)` — though be careful with unbounded buffers in memory-constrained Android apps. For most callback-to-Flow bridges, the default buffer of 64 is plenty, and conflation (`.conflate()`) works well for "latest value" scenarios like sensor data or location updates.

There's also `trySendBlocking` from `kotlinx-coroutines-core`, which blocks the calling thread if the buffer is full instead of dropping. The official `callbackFlow` example in the Kotlin docs uses it. I generally avoid it on Android because blocking a callback thread — which might be the main thread — defeats the purpose of non-blocking architecture. `trySend` with a reasonable buffer or conflation is almost always the better choice.

## awaitClose

`awaitClose` is mandatory inside `callbackFlow`. Not "recommended" — mandatory. If you skip it, `callbackFlow` throws `IllegalStateException` at runtime. This is a deliberate design choice by the kotlinx.coroutines team.

Here's why. Without `awaitClose`, the `callbackFlow` block completes immediately after registering the callback. The channel closes. The Flow completes. But the callback is still registered with the system. It keeps receiving events, calling `trySend` on a closed channel, and leaking memory. The listener object holds a reference to your `ProducerScope`, which holds a reference to the coroutine, which might hold a reference to your ViewModel or Activity. Classic Android memory leak.

`awaitClose` suspends the block indefinitely, keeping the channel — and the Flow — alive. When the collector cancels, `awaitClose` resumes and runs the cleanup lambda.

```kotlin
fun SensorManager.sensorFlow(
    sensorType: Int,
    samplingPeriod: Int = SensorManager.SENSOR_DELAY_NORMAL
): Flow<SensorEvent> = callbackFlow {

    val listener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            trySend(event)
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    val sensor = getDefaultSensor(sensorType)
    registerListener(listener, sensor, samplingPeriod)

    awaitClose {
        unregisterListener(listener)
    }
}
```

Put all cleanup code inside the `awaitClose` lambda: unregister listeners, close connections, release resources. This lambda runs regardless of whether the Flow was cancelled normally or exceptionally. Think of it as the `finally` block for your callback registration.

A common mistake I've seen is putting cleanup outside `awaitClose`:

```kotlin
// **Wrong** — cleanup runs immediately, not on cancellation
callbackFlow {
    val listener = createListener()
    api.register(listener)
    awaitClose { }
    api.unregister(listener) // Never reached — awaitClose suspends
}

// **Correct** — cleanup inside the awaitClose lambda
callbackFlow {
    val listener = createListener()
    api.register(listener)
    awaitClose { api.unregister(listener) }
}
```

Since `awaitClose` suspends indefinitely, any code after it in the block never executes. The cleanup must go inside the lambda.

## Real-World Examples

Here are three production-ready implementations I've used in real projects.

### Firebase Firestore Snapshot Listener

Firestore's `addSnapshotListener` is the classic multi-shot callback. It fires whenever the document or query result changes — locally or remotely.

```kotlin
fun Query.snapshotFlow(): Flow<QuerySnapshot> = callbackFlow {
    val registration = addSnapshotListener { snapshot, error ->
        if (error != null) {
            close(error)
            return@addSnapshotListener
        }
        if (snapshot != null) {
            trySend(snapshot)
        }
    }

    awaitClose { registration.remove() }
}
```

Usage in a repository becomes clean:

```kotlin
class ChatRepository(private val firestore: FirebaseFirestore) {

    fun observeMessages(chatId: String): Flow<List<Message>> =
        firestore.collection("chats")
            .document(chatId)
            .collection("messages")
            .orderBy("timestamp", Query.Direction.ASCENDING)
            .snapshotFlow()
            .map { snapshot ->
                snapshot.documents.map { it.toObject<Message>()!! }
            }
}
```

Notice the `close(error)` call when Firestore reports an error. This closes the channel with an exception, which propagates to the collector as a thrown exception. The `awaitClose` lambda still runs, so the listener gets removed even on error.

### SharedPreferences Changes

`SharedPreferences.OnSharedPreferenceChangeListener` fires whenever any value in the preferences file changes. Wrapping it in a Flow lets you react to preference changes in a ViewModel without manual listener management.

```kotlin
fun SharedPreferences.observeKey(key: String): Flow<String?> = callbackFlow {
    val listener = SharedPreferences.OnSharedPreferenceChangeListener { prefs, changedKey ->
        if (changedKey == key) {
            trySend(prefs.getString(key, null))
        }
    }

    registerOnSharedPreferenceChangeListener(listener)
    // Emit current value immediately
    trySend(getString(key, null))

    awaitClose { unregisterOnSharedPreferenceChangeListener(listener) }
}
```

One gotcha here: `SharedPreferences` holds listeners in a `WeakReference` internally. If nothing else holds a strong reference to the listener object, it gets garbage collected and your Flow silently stops emitting. Inside `callbackFlow`, this isn't a problem because the `awaitClose` suspend point keeps the enclosing scope — and the listener reference — alive.

### ConnectivityManager Network State

Monitoring network connectivity is another callback that every app needs.

```kotlin
@RequiresPermission(Manifest.permission.ACCESS_NETWORK_STATE)
fun ConnectivityManager.observeNetworkState(): Flow<Boolean> = callbackFlow {
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            trySend(true)
        }
        override fun onLost(network: Network) {
            trySend(false)
        }
        override fun onUnavailable() {
            trySend(false)
        }
    }

    val request = NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()

    registerNetworkCallback(request, callback)

    // Emit current state
    val currentNetwork = activeNetwork
    val isConnected = getNetworkCapabilities(currentNetwork)
        ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    trySend(isConnected)

    awaitClose { unregisterNetworkCallback(callback) }
}.distinctUntilChanged()
```

The `.distinctUntilChanged()` at the end prevents duplicate emissions when the system fires multiple callbacks for the same network transition. This is a common pattern — apply Flow operators after the `callbackFlow` builder to shape the output.

## Quiz

**Question 1:** You write a `callbackFlow` but forget to call `awaitClose` at the end. What happens?

- A) The Flow emits nothing
- B) The Flow works normally but leaks the callback
- C) `callbackFlow` throws `IllegalStateException` at runtime
- D) The compiler catches the error

**Answer:** **C**. `callbackFlow` enforces the `awaitClose` contract. If the block completes without calling `awaitClose` while the channel is still open, it throws `IllegalStateException`. This is a runtime check, not a compile-time one.

**Question 2:** Inside a `callbackFlow`, a `LocationListener` callback calls `send(location)` instead of `trySend(location)`. What's the problem?

- A) `send` doesn't work inside `callbackFlow`
- B) `send` is a suspending function, but callbacks aren't called from coroutines — you'd need to wrap it in `launch`, adding unnecessary complexity
- C) `send` drops elements when the buffer is full
- D) No problem — both work identically

**Answer:** **B**. `send` is a suspending function. Callbacks from Android framework APIs aren't coroutine contexts. While you could wrap `send` in a `launch` block (since `ProducerScope` is a `CoroutineScope`), it adds overhead and complexity for no benefit. `trySend` is non-suspending and designed for exactly this use case.

## Coding Challenge

Build a `BroadcastReceiver` to Flow bridge. Write an extension function on `Context` that takes an `IntentFilter` and returns a `Flow<Intent>`. Register the receiver inside `callbackFlow`, emit received intents with `trySend`, and unregister in `awaitClose`. Then use it to observe `Intent.ACTION_BATTERY_CHANGED` in a ViewModel and map the battery level to a percentage. Add `.conflate()` so slow collectors always get the latest value.

Thanks for reading!
