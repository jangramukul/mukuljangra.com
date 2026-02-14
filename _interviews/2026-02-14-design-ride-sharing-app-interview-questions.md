---
title: "Design a Ride-Sharing App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 7
level: senior
sequence: 66
---

## Design a Ride-Sharing App (Uber/Lyft)

Ride-sharing apps are a favorite in mobile system design interviews because they combine real-time location, maps, background services, and push-driven state machines into a single user flow. Interviewers focus on the client-side architecture — how you track location, render maps efficiently, and keep the UI in sync with a rapidly changing ride state.

### Core Questions (Beginner to Intermediate)

#### Q1: How would you approach designing a ride-sharing app from the client side? What are the key components?

Start by clarifying the scope — rider app, driver app, or both. Most interviews focus on the rider side. The main client components are a map layer for rendering the user's location and nearby drivers, a ride request flow (pickup/drop-off selection, fare estimate, confirmation), a real-time ride tracking screen, and a push notification system for ride status updates. Underneath, you need a location service for GPS updates, a networking layer for API calls and WebSocket connections, a local state machine to track ride state transitions, and a background service to keep location flowing when the app is backgrounded.

#### Q2: How does the Fused Location Provider work, and why would you use it over raw GPS?

The Fused Location Provider is part of Google Play Services. It combines GPS, Wi-Fi, cell towers, and device sensors to determine location. The main advantage is that it picks the best source automatically based on your accuracy and power requirements. Raw GPS gives high accuracy outdoors but drains battery, takes time to get a fix, and fails indoors. The Fused Location Provider handles all of this — it can return a cached last-known location almost instantly and switch between sources transparently. For a ride-sharing app, you would use `PRIORITY_HIGH_ACCURACY` during an active ride and `PRIORITY_BALANCED_POWER_ACCURACY` when the rider is just browsing the map.

#### Q3: How would you handle real-time location updates for the driver during an active ride?

The server pushes driver location updates to the rider's device. The most common approach is a WebSocket connection that receives location payloads every 2-5 seconds. On the client, you receive each update and animate the driver marker smoothly between the old and new positions using `ValueAnimator` or Compose animation APIs. You don't want the marker to jump — linear interpolation between coordinates makes the movement look natural. If the WebSocket drops, fall back to polling the server every 5-10 seconds via REST until the socket reconnects.

```kotlin
fun animateMarkerToPosition(marker: Marker, targetPosition: LatLng) {
    val startPosition = marker.position
    val animator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 2000
        interpolator = LinearInterpolator()
        addUpdateListener { animation ->
            val fraction = animation.animatedFraction
            val lat = startPosition.latitude +
                (targetPosition.latitude - startPosition.latitude) * fraction
            val lng = startPosition.longitude +
                (targetPosition.longitude - startPosition.longitude) * fraction
            marker.position = LatLng(lat, lng)
        }
    }
    animator.start()
}
```

#### Q4: How would you design the ride state machine on the client?

A ride goes through well-defined states: `IDLE` (no ride), `REQUESTING` (waiting for driver match), `DRIVER_ASSIGNED` (driver accepted, en route to pickup), `ARRIVED` (driver at pickup), `IN_RIDE` (trip in progress), `COMPLETED`, and `CANCELLED`. Model this as a sealed class and drive the UI from it. Each state maps to a different screen or UI configuration — `IDLE` shows the pickup selector, `DRIVER_ASSIGNED` shows the driver card and ETA, `IN_RIDE` shows the route and live tracking.

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

State transitions come from the server via WebSocket events or push notifications. The client never transitions itself — it reacts to server-pushed state changes to avoid inconsistency.

#### Q5: How would you render a route on the map between pickup and drop-off?

After the server returns a route (typically from a directions API), you receive an encoded polyline string. Decode it into a list of `LatLng` points and draw it on the map using a `Polyline` object. Google Maps SDK provides `PolyUtil.decode()` through the Maps Utility library.

```kotlin
val decodedPath = PolyUtil.decode(encodedPolyline)
val polylineOptions = PolylineOptions()
    .addAll(decodedPath)
    .width(12f)
    .color(Color.BLUE)
    .geodesic(true)
map.addPolyline(polylineOptions)

val bounds = LatLngBounds.builder().apply {
    decodedPath.forEach { include(it) }
}.build()
map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds, 100))
```

Adjust the camera bounds to fit the entire route with padding. As the ride progresses, you can trim the polyline from the driver's current position to show only the remaining route.

#### Q6: How would you calculate and display ETA?

ETA comes from the server, not the client. The server calls a directions API (Google Directions, Mapbox, or OSRM) with current traffic data and returns the estimated time in the ride state update. On the client, you display the ETA and update it as new estimates arrive. A good UX approach is to show the ETA as a countdown that ticks down locally between server updates, then snaps to the new server value when an update arrives. Don't try to calculate ETA on the client using distance and speed — traffic conditions, road closures, and routing algorithms make server-side calculation far more accurate.

#### Q7: How do push notifications fit into the ride-sharing architecture?

Push notifications (via FCM) serve as the fallback communication channel when the WebSocket is disconnected or the app is in the background. Key events that trigger push notifications include driver assignment, driver arrival at pickup, ride start, ride completion, and cancellation. On Android, FCM data messages are used instead of notification messages because you need to process the payload and update the ride state even when the app is in the background. The push handler parses the event, updates the local ride state, and shows a notification to bring the user back to the app. FCM is not used as the primary real-time channel because its latency (seconds) is too high for live location tracking — that is what the WebSocket is for.

#### Q8: How would you handle the case where the user backgrounds the app during an active ride?

You need a foreground service with `foregroundServiceType="location"` to keep receiving location updates. The foreground service shows a persistent notification with ride status (driver name, ETA). When the user backgrounds the app, the service continues tracking and updates the notification. If a significant ride event happens (driver arrived, ride completed), send a high-priority notification to bring the user back. On the driver side, the foreground service is even more critical — it continuously sends the driver's location to the server. Without the foreground service, Android kills location updates within minutes of the app going to the background.

### Deep Dive Questions (Advanced to Expert)

#### Q9: How would you optimize map rendering performance for a ride-sharing app?

Map rendering is expensive. A few key optimizations: limit the number of markers on screen — instead of showing every nearby driver individually, cluster them when zoomed out using the Maps Utility clustering library. Use custom `BitmapDescriptor` for markers and cache them instead of creating new ones on every update. Reduce map tile loads by setting a reasonable min/max zoom level. During an active ride, lock the camera to follow the driver and disable idle map interactions to avoid unnecessary tile fetching. For the route polyline, simplify the path using Douglas-Peucker algorithm when zoomed out and use the full resolution only when zoomed in. On lower-end devices, consider using `GoogleMap.setMapType(MAP_TYPE_NONE)` in testing to isolate your overlay performance from tile rendering.

#### Q10: How would you design the client-side architecture for handling both rider and driver modes?

Keep them as separate feature modules that share a common core. The core module contains the map abstraction, networking layer (WebSocket client, REST APIs), ride state models, and location service. The rider module handles pickup selection, fare estimation, ride tracking from the passenger perspective, and payment. The driver module handles availability toggling, ride request acceptance, navigation to pickup, and trip completion. Both modules observe the same ride state sealed class but render different UIs. Use a shared `RideRepository` that manages WebSocket connections and emits ride state as a `StateFlow`, with rider and driver ViewModels consuming it. This keeps the codebase DRY while letting each mode evolve independently.

#### Q11: How would you handle offline or poor connectivity during an active ride?

The rider side is more forgiving — you can show the last known driver position and a "Reconnecting..." indicator until the WebSocket comes back. Cache the route polyline locally so the map still shows the route even without network. Queue any user actions (cancellation requests, rating submissions) locally and replay them when connectivity returns. The driver side is more critical — the server needs continuous location updates. Buffer location points locally when offline and batch-upload them when the connection restores. Use exponential backoff for WebSocket reconnection (1s, 2s, 4s, 8s, capped at 30s). Store the current ride state in DataStore so that if the app is killed and restarted, it can recover the ride context without a fresh API call.

#### Q12: How would you handle battery optimization for continuous location tracking?

Battery is the biggest constraint for ride-sharing apps. Use `PRIORITY_HIGH_ACCURACY` only during active rides and `PRIORITY_BALANCED_POWER_ACCURACY` otherwise. Set the location update interval based on ride state — every 3-5 seconds during an active ride, every 30-60 seconds when idle. On the driver side, batch location updates using `setMaxWaitTime()` on the location request — this lets the system batch-deliver locations at intervals, which is more battery-efficient than receiving each update individually. Use `setSmallestDisplacement()` to avoid processing updates when the driver hasn't moved. The foreground service notification is required anyway, so there is no additional battery cost there. Monitor battery level and degrade gracefully — switch to lower accuracy if battery drops below 15%.

```kotlin
val locationRequest = LocationRequest.Builder(
    Priority.PRIORITY_HIGH_ACCURACY, 3000L
).apply {
    setMinUpdateIntervalMillis(1000)
    setMaxUpdateDelayMillis(5000) // batch delivery
    setMinUpdateDistanceMeters(5f) // ignore tiny movements
}.build()
```

#### Q13: How would you implement offline map tiles for areas with poor connectivity?

Google Maps SDK does not expose an API for downloading map tiles for offline use. However, you can work around this by using the map's built-in tile caching — once tiles are loaded, they stay in the disk cache and are available offline for a limited time. For true offline maps, you would need to use a different mapping SDK like Mapbox, which provides explicit offline map packs. Mapbox lets you define a geographic region, zoom range, and style, and downloads all the tiles to local storage. The tradeoff is integration complexity and licensing costs. In practice, most ride-sharing apps rely on the network being available and handle the no-map case gracefully by showing a simplified view with street names and ETA text instead of a rendered map.

#### Q14: How would you design the fare estimation flow on the client?

The client collects pickup and drop-off coordinates, sends them to the server, and displays the returned fare estimate. The server calculates the fare based on distance, estimated duration, current demand (surge pricing), and vehicle type. On the client side, show a loading state while the estimate is being fetched, then display the fare range (e.g., "$12-15"). Cache recent fare estimates locally so the user can go back to a previous route without another API call. If the user changes the drop-off, debounce the fare estimate requests — wait 500ms after the user stops typing or moving the pin before making a new API call. Show all vehicle types (economy, premium, XL) with their fare estimates simultaneously so the user can compare without additional network calls.

#### Q15: How would you handle surge pricing indication on the client?

Surge pricing is calculated server-side based on the ratio of ride demand to available drivers in an area. The server sends a surge multiplier (1.5x, 2.0x) along with the fare estimate. On the client, you need to clearly communicate the surge — show the multiplier, explain why it is higher than usual, and require explicit confirmation before requesting the ride. Some apps show a heat map overlay on the map to indicate high-demand zones. The key design decision is whether to refresh surge pricing in real time or snapshot it at the time of fare estimate. Uber snapshots it — the multiplier you see at estimate time is what you pay, even if demand changes before the driver accepts. This avoids confusion and billing disputes.

#### Q16: How would you handle the transition between map SDKs (e.g., Google Maps to Mapbox)?

Abstract the map behind an interface. Define a `MapProvider` interface with methods like `moveCamera()`, `addMarker()`, `drawPolyline()`, `setOnCameraIdleListener()`, and `animateToLocation()`. Create implementations for Google Maps and Mapbox. The ride feature modules depend only on the abstraction, not the concrete SDK. This also helps with testing — you can create a fake `MapProvider` that records calls without rendering anything. The tricky part is marker animation and custom info windows, which have different APIs across SDKs. Keep the abstraction at a high enough level that both SDKs can fulfill the contract, and handle SDK-specific details inside the implementation.

#### Q17: How would you design real-time driver matching on the client side?

The client does not do matching — it sends a ride request and waits. The flow is: user selects pickup/drop-off, confirms fare estimate, app sends the request to the server, and the UI moves to `REQUESTING` state with a loading animation. The server handles matching based on driver proximity, rating, acceptance rate, and ETA to pickup. The client receives the result via WebSocket (driver assigned or no drivers available). The UX decision is what to show during the wait — a pulsing animation on the map expanding from the pickup point is common. Set a timeout on the client (30-60 seconds) after which you show a "No drivers available, try again" message. If a driver accepts, you immediately receive their profile, vehicle info, and live location.

#### Q18: How would you architect location updates to balance accuracy and power on the driver side?

The driver app has three states with different location strategies. When the driver is offline, no location tracking runs. When online but idle (waiting for rides), use `PRIORITY_BALANCED_POWER_ACCURACY` with 15-30 second intervals — the server only needs approximate position for matching. When on an active ride, switch to `PRIORITY_HIGH_ACCURACY` with 3-5 second intervals because the rider is watching the driver marker move. Implement this as a `LocationStrategy` interface with three implementations, and swap them when the driver state changes. The transition between strategies should be seamless — request a new `LocationRequest` with the updated parameters without stopping and restarting the entire location client.

### Common Follow-ups

- How would you handle multiple stops in a single ride?
- How would you implement a ride-sharing pool feature where multiple riders share a vehicle?
- What happens if the driver's app crashes during a ride — how does the client recover?
- How would you implement in-app navigation for the driver using turn-by-turn directions?
- How would you design the payment flow after ride completion?
- What metrics would you track to monitor the health of the real-time location system?
- How would you handle ride cancellation from either side and the associated state cleanup?
- How would you test the ride state machine with all possible transitions?
