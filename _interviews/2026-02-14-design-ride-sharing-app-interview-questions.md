---
title: "Design a Ride-Sharing App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 7
sequence: 66
description: "Ride-sharing apps are a favorite in mobile system design interviews because they combine real-time location, maps, background services, and..."
---

## Design a Ride-Sharing App (Uber/Lyft)

Ride-sharing apps combine real-time location, maps, background services, and state machines into one flow. This walkthrough designs one step by step, the way you would in an interview.

### Requirements & Scope

#### Q1: What are the core features a ride-sharing app needs?

From the rider side: request a ride by selecting pickup and drop-off, see a fare estimate before confirming, track the driver in real-time on a map, and pay automatically when the ride ends. From the driver side: go online/offline, accept or decline ride requests, navigate to the rider, and complete the trip.

The ride lifecycle is the backbone — everything else (payments, ratings, support) hangs off it. In an interview, start with the rider flow since it covers more design decisions, and mention the driver side where it diverges.

#### Q2: What are the non-functional requirements?

Real-time location updates with low latency (under 3 seconds for driver position to show on the rider's map). Battery efficiency — both rider and driver apps run for hours, so aggressive GPS polling is not an option. Offline resilience during an active ride — a tunnel or dead zone should not break the experience. Smooth map rendering even on mid-range devices.

The tricky part is that these requirements conflict. High-accuracy location drains battery. Frequent updates strain the network. The whole design is about finding the right tradeoffs for each ride state.

#### Q3: Should the rider and driver be the same app or separate apps?

Most companies ship them as separate apps because the user flows, permissions, and background behavior are very different. But internally they share a lot — the ride state model, networking layer, map abstraction, and location service are all common. In an interview, design them as separate feature modules sharing a core library.

The rider module handles pickup selection, fare estimation, ride tracking, and payment. The driver module handles availability toggling, ride acceptance, navigation, and trip completion. Both observe the same ride state but render different UIs.

### High-Level Design

#### Q4: What does the client architecture look like?

The core components are: a map layer for rendering locations and routes, a ride state machine that drives the entire UI, a real-time communication layer (WebSocket + FCM), a location service for GPS updates, and a networking layer for REST APIs.

```kotlin
// Core modules shared by rider and driver
class RideRepository(
    private val webSocket: RideWebSocket,
    private val rideApi: RideApi,
    private val locationTracker: LocationTracker
) {
    private val _rideState = MutableStateFlow<RideState>(RideState.Idle)
    val rideState: StateFlow<RideState> = _rideState.asStateFlow()

    fun observeRideEvents() {
        webSocket.events.onEach { event ->
            _rideState.value = event.toRideState()
        }.launchIn(scope)
    }
}
```

The `RideRepository` is the single source of truth. Rider and driver ViewModels consume its `StateFlow` and map it to their own UI state. This keeps ride logic in one place.

#### Q5: How does real-time communication work?

Two channels, each for a different purpose. WebSocket handles live location updates — driver position every 2-5 seconds during an active ride. FCM handles ride state changes — driver assigned, driver arrived, ride completed. WebSocket is low-latency but requires an active connection. FCM works even when the app is backgrounded or the socket drops.

On the rider side, the WebSocket receives driver location payloads and updates the map marker. On the driver side, the WebSocket sends the driver's own location to the server. If the WebSocket disconnects, the client falls back to polling via REST every 5-10 seconds and uses exponential backoff to reconnect (1s, 2s, 4s, 8s, capped at 30s).

FCM data messages are used instead of notification messages because you need to process the payload and update ride state even when the app is in the background.

#### Q6: What API endpoints does the ride lifecycle need?

The main endpoints follow the ride lifecycle:

- `POST /rides/estimate` — Takes pickup and drop-off coordinates, returns fare estimates for each vehicle type
- `POST /rides/request` — Creates a ride request, server starts driver matching
- `GET /rides/{id}` — Returns current ride state, used for recovery after app restart
- `POST /rides/{id}/cancel` — Cancels a ride from either side
- `POST /rides/{id}/complete` — Driver marks the ride as completed
- `GET /rides/{id}/route` — Returns the encoded polyline for the route

The WebSocket connection at `wss://api.example.com/rides/{id}/live` pushes real-time driver location and state change events. REST is the fallback and the recovery mechanism. WebSocket is the primary channel during active rides.

#### Q7: What data models does the client need?

The core models are `Ride`, `Driver`, `Location`, and `RideState`. Keep them simple and flat — nested objects make state updates harder to diff.

```kotlin
data class Ride(
    val id: String,
    val pickup: LatLng,
    val dropOff: LatLng,
    val fareEstimate: FareEstimate,
    val driver: DriverInfo?,
    val route: List<LatLng>
)

data class DriverInfo(
    val id: String,
    val name: String,
    val vehiclePlate: String,
    val rating: Float,
    val photoUrl: String
)

data class LocationUpdate(
    val lat: Double,
    val lng: Double,
    val bearing: Float,
    val timestamp: Long
)
```

`FareEstimate` holds the price range and surge multiplier. `LocationUpdate` includes bearing so the driver marker can rotate on the map to face the direction of travel. Timestamps help detect stale updates.

#### Q8: How does map integration work?

Use Google Maps SDK for rendering. The map shows different things depending on ride state — nearby drivers when idle, the route polyline during a ride, the driver marker moving along the route. After the server returns a route, decode the encoded polyline and draw it.

```kotlin
fun drawRoute(map: GoogleMap, encodedPolyline: String) {
    val path = PolyUtil.decode(encodedPolyline)
    map.addPolyline(
        PolylineOptions()
            .addAll(path)
            .width(12f)
            .color(Color.BLUE)
            .geodesic(true)
    )
    val bounds = LatLngBounds.builder().apply {
        path.forEach { include(it) }
    }.build()
    map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds, 100))
}
```

Adjust camera bounds to fit the entire route with padding. As the ride progresses, trim the polyline from the driver's current position to show only the remaining route.

#### Q9: How does the ride state machine work?

A ride moves through well-defined states: `Idle` → `Requesting` → `DriverAssigned` → `Arrived` → `InRide` → `Completed`. There is also `Cancelled` which can be reached from most states. Model this as a sealed class and drive the entire UI from it.

```kotlin
sealed class RideState {
    object Idle : RideState()
    data class Requesting(val pickup: LatLng, val dropOff: LatLng) : RideState()
    data class DriverAssigned(val driver: DriverInfo, val eta: Int) : RideState()
    data class Arrived(val driver: DriverInfo) : RideState()
    data class InRide(val route: List<LatLng>, val eta: Int) : RideState()
    data class Completed(val fare: Double, val tripId: String) : RideState()
    object Cancelled : RideState()
}
```

Each state maps to a different UI: `Idle` shows the pickup selector, `Requesting` shows a pulsing animation, `DriverAssigned` shows the driver card and ETA, `InRide` shows live tracking with the route. State transitions come from the server via WebSocket or FCM. The client never transitions itself — it reacts to server-pushed changes to avoid inconsistency.

### Low-Level Design & Deep Dives

#### Q10: How does location tracking work under the hood?

Use `FusedLocationProviderClient` from Google Play Services. It combines GPS, Wi-Fi, cell towers, and sensors to pick the best source automatically. Raw GPS gives high accuracy outdoors but drains battery and fails indoors. The fused provider handles source switching transparently.

```kotlin
fun createLocationRequest(isActiveRide: Boolean): LocationRequest {
    val priority = if (isActiveRide) Priority.PRIORITY_HIGH_ACCURACY
                   else Priority.PRIORITY_BALANCED_POWER_ACCURACY
    val interval = if (isActiveRide) 3000L else 30000L

    return LocationRequest.Builder(priority, interval)
        .setMinUpdateIntervalMillis(1000)
        .setMaxUpdateDelayMillis(if (isActiveRide) 5000 else 60000)
        .setMinUpdateDistanceMeters(5f)
        .build()
}
```

`setMaxUpdateDelayMillis` enables batching — the system collects location updates and delivers them together, which is more battery-efficient than individual callbacks. `setMinUpdateDistanceMeters` filters out updates when the device has not moved. During an active ride, use high accuracy with 3-second intervals. When idle, use balanced power with 30-second intervals.

#### Q11: How do you animate the driver marker smoothly on the map?

You receive driver location every 2-5 seconds. If you just set the marker position directly, it jumps. Instead, interpolate between the old and new position over the update interval using `ValueAnimator`.

```kotlin
fun animateMarker(marker: Marker, target: LatLng) {
    val start = marker.position
    ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 2000
        interpolator = LinearInterpolator()
        addUpdateListener { anim ->
            val f = anim.animatedFraction
            val lat = start.latitude + (target.latitude - start.latitude) * f
            val lng = start.longitude + (target.longitude - start.longitude) * f
            marker.position = LatLng(lat, lng)
        }
        start()
    }
}
```

Linear interpolation makes the movement look natural. Also update the marker rotation to match the bearing from the `LocationUpdate` so the car icon faces the direction of travel.

#### Q12: How do you optimize map rendering performance?

Map rendering is expensive. Key optimizations: cluster nearby driver markers when zoomed out using the Maps Utility clustering library instead of rendering each one individually. Cache custom `BitmapDescriptor` objects for markers — creating new ones on every update causes GC pressure. Set a reasonable min/max zoom level to limit tile loads.

During an active ride, lock the camera to follow the driver and disable idle map gestures to prevent unnecessary tile fetching. For the route polyline, simplify the path with the Douglas-Peucker algorithm when zoomed out and use full resolution when zoomed in. On lower-end devices, reducing the polyline point count from 500 to 50 can drop frame times noticeably.

#### Q13: How does ETA calculation work?

ETA comes from the server, not the client. The server calls a directions API (Google Directions, Mapbox, or OSRM) with current traffic data and returns the estimated time in the ride state update. On the client, display the ETA and update it as new estimates arrive.

A good UX approach is to tick down a local countdown between server updates, then snap to the new server value when it arrives. This prevents the ETA from looking frozen between updates. Don't calculate ETA on the client using distance and speed — traffic conditions, road closures, and routing algorithms make server-side calculation far more accurate.

#### Q14: How do you handle offline or poor connectivity during an active ride?

The rider side is more forgiving. Show the last known driver position with a "Reconnecting..." indicator. Cache the route polyline locally so the map still renders. Queue user actions (cancellation requests, rating submissions) and replay them when connectivity returns.

The driver side is more critical — the server needs continuous location updates. Buffer location points locally when offline and batch-upload them on reconnect. Store the current ride state in DataStore so if the app is killed and restarted, it can call `GET /rides/{id}` to recover context instead of starting from scratch. Use exponential backoff for WebSocket reconnection (1s, 2s, 4s, 8s, capped at 30s).

#### Q15: How do you display surge pricing to the rider?

Surge pricing is calculated server-side based on the ratio of demand to available drivers in an area. The server sends a surge multiplier (1.5x, 2.0x) along with the fare estimate. On the client, clearly show the multiplier, explain why the fare is higher, and require explicit confirmation before proceeding.

The key design decision is whether to refresh surge in real time or snapshot it at estimate time. Uber snapshots it — the multiplier you see at estimate time is what you pay, even if demand changes before a driver accepts. This avoids confusion and billing disputes. Some apps also show a heat map overlay on the map to indicate high-demand zones.

#### Q16: What does the fare estimation flow look like?

The client collects pickup and drop-off coordinates, sends them to `POST /rides/estimate`, and displays the returned fare estimates. The server calculates based on distance, estimated duration, surge multiplier, and vehicle type.

On the client, show a loading shimmer while fetching. Display fare ranges (e.g., "$12-15") for all vehicle types simultaneously so the user can compare without extra API calls. Cache recent estimates so going back to a previous route doesn't trigger another request. When the user moves the drop-off pin, debounce the estimate request — wait 500ms after they stop dragging before making the call.

#### Q17: How does background location work during a ride?

You need a foreground service with `foregroundServiceType="location"` declared in the manifest. The service shows a persistent notification with ride status (driver name, ETA). When the user backgrounds the app, the service keeps receiving location updates and updating the notification.

Without a foreground service, Android kills location updates within minutes of the app going to the background. On the driver side this is even more critical — the foreground service continuously sends the driver's location to the server for the entire shift, not just during rides. If a significant event happens while backgrounded (driver arrived, ride completed), post a high-priority notification to bring the user back.

#### Q18: How does driver matching look from the client side?

The client does not do matching. It sends a ride request and waits. The flow: user selects pickup and drop-off, confirms the fare estimate, the app calls `POST /rides/request`, and the UI moves to `Requesting` state with a pulsing animation expanding from the pickup point.

The server handles matching based on driver proximity, rating, acceptance rate, and ETA to pickup. The client receives the result via WebSocket — either driver assigned or no drivers available. Set a client-side timeout of 30-60 seconds, after which you show a "No drivers available, try again" message. When a driver accepts, you immediately get their profile, vehicle info, and live location.

#### Q19: How would you abstract the map SDK so you could swap Google Maps for Mapbox?

Define a `MapProvider` interface with methods like `moveCamera()`, `addMarker()`, `drawPolyline()`, and `animateToLocation()`. Create concrete implementations for Google Maps and Mapbox. All ride feature modules depend on the interface, not the SDK.

```kotlin
interface MapProvider {
    fun moveCamera(target: LatLng, zoom: Float)
    fun addMarker(id: String, position: LatLng, icon: Bitmap): MapMarker
    fun drawPolyline(points: List<LatLng>, color: Int, width: Float)
    fun animateToLocation(target: LatLng, duration: Long)
    fun clearAll()
}
```

This also helps with testing — create a fake `MapProvider` that records calls without rendering anything. The tricky part is marker animation and custom info windows, which have different APIs across SDKs. Keep the abstraction at a high enough level that both can fulfill the contract, and handle SDK-specific details inside the implementation.

### Common Follow-ups

- How would you handle multiple stops in a single ride?
- How would you implement ride pooling where multiple riders share a vehicle?
- What happens if the driver's app crashes mid-ride — how does the client recover?
- How would you implement turn-by-turn navigation for the driver?
- How would you design the payment flow after ride completion?
- What metrics would you track to monitor real-time location system health?
- How would you handle cancellation from either side and the associated state cleanup?
- How would you test the ride state machine with all possible transitions?
