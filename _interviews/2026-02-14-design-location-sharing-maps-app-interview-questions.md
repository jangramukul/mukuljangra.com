---
title: "Design a Location Sharing / Maps App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 13
sequence: 75
description: "Designing a location sharing or maps app tests your understanding of real-time communication, battery-efficient location strategies, map rendering, and privacy."
---

## Design a Location Sharing / Maps App

Location sharing and maps apps come up in system design interviews because they involve real-time data, battery management, map rendering, and privacy — all areas where Android has unique constraints. Interviewers want to see how you balance accuracy with battery life and handle real-time updates efficiently.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the core components of a location sharing app?

A location sharing app needs: a location provider to get the device's GPS coordinates, a real-time communication layer (WebSocket or SSE) to share location with others, a map view to render locations, local storage for offline support, and a permission system for foreground and background location access.

The data flow is: **Get location → Send to server → Server broadcasts to connected users → Recipients render on map**. Each step has design decisions around accuracy, frequency, battery, and privacy.

#### Q2: How does FusedLocationProvider work and why use it?

`FusedLocationProviderClient` is Google's recommended way to get location on Android. It combines GPS, Wi-Fi, cellular, and sensor data to provide the best location with minimal battery impact. It's "fused" because it intelligently switches between sources — using GPS outdoors for accuracy and Wi-Fi/cell indoors where GPS is weak.

```kotlin
class LocationTracker(context: Context) {
    private val fusedClient = LocationServices.getFusedLocationProviderClient(context)

    fun startTracking(intervalMs: Long = 5000L) {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateDistanceMeters(10f)
            .setWaitForAccurateLocation(true)
            .build()

        fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            onNewLocation(location.latitude, location.longitude, location.accuracy)
        }
    }
}
```

The `Priority` parameter controls the tradeoff between accuracy and battery. `PRIORITY_HIGH_ACCURACY` uses GPS and drains battery faster. `PRIORITY_BALANCED_POWER_ACCURACY` uses Wi-Fi and cell (accurate to about 100m). `PRIORITY_LOW_POWER` uses cell only (accurate to about 1-10 km). Choose based on your use case — a navigation app needs high accuracy, a weather app needs low power.

#### Q3: How would you send location updates in real-time?

Use WebSockets for bidirectional real-time communication. The client opens a persistent connection to the server and sends location updates. The server broadcasts these updates to all users who are subscribed to that person's location.

```kotlin
class LocationSharingClient(private val webSocket: WebSocket) {

    fun sendLocation(lat: Double, lng: Double, accuracy: Float) {
        val payload = """{"lat":$lat,"lng":$lng,"accuracy":$accuracy,"ts":${System.currentTimeMillis()}}"""
        webSocket.send(payload)
    }

    fun subscribeToUser(userId: String) {
        webSocket.send("""{"action":"subscribe","userId":"$userId"}""")
    }
}
```

WebSocket is preferred over polling because it sends data only when there's a change, and the connection stays open so there's no repeated handshake overhead. For apps where updates are less frequent (every 30 seconds+), Server-Sent Events (SSE) work too — they're simpler (HTTP-based, one-directional) but only support server-to-client messages.

#### Q4: What location permissions does Android require?

Android has three levels of location permission:

- **ACCESS_COARSE_LOCATION** — Approximate location (Wi-Fi/cell, ~100m accuracy). Good enough for weather, local news
- **ACCESS_FINE_LOCATION** — Precise GPS location. Required for navigation, ride-sharing, location sharing
- **ACCESS_BACKGROUND_LOCATION** — Allows location access when the app is not visible. Requires separate permission request on Android 10+

```kotlin
// Request foreground location
val permissions = arrayOf(
    Manifest.permission.ACCESS_FINE_LOCATION,
    Manifest.permission.ACCESS_COARSE_LOCATION
)
requestPermissionLauncher.launch(permissions)

// Background location must be requested separately AFTER foreground is granted
// Android 11+ requires directing user to Settings for background location
if (shouldRequestBackground) {
    requestPermissionLauncher.launch(
        arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    )
}
```

On Android 12+, the user can grant "approximate" instead of "precise" location even when you request fine location. Your app must handle both cases. Background location requires justification during Play Store review — Google rejects apps that request it without a clear user-facing reason.

#### Q5: How would you render user locations on a map?

Use Google Maps SDK or Mapbox to render a map view. Add markers for each user's location and update them as new location data arrives. For smooth UX, animate marker movement instead of jumping.

```kotlin
class MapLocationRenderer(private val googleMap: GoogleMap) {
    private val markers = mutableMapOf<String, Marker>()

    fun updateUserLocation(userId: String, lat: Double, lng: Double) {
        val position = LatLng(lat, lng)
        val marker = markers[userId]

        if (marker != null) {
            animateMarker(marker, position)
        } else {
            markers[userId] = googleMap.addMarker(
                MarkerOptions()
                    .position(position)
                    .title(userId)
                    .icon(BitmapDescriptorFactory.fromResource(R.drawable.ic_user_pin))
            )!!
        }
    }

    private fun animateMarker(marker: Marker, target: LatLng) {
        val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1000
            val start = marker.position
            addUpdateListener {
                val fraction = it.animatedFraction
                val lat = start.latitude + (target.latitude - start.latitude) * fraction
                val lng = start.longitude + (target.longitude - start.longitude) * fraction
                marker.position = LatLng(lat, lng)
            }
        }
        animator.start()
    }
}
```

Animating markers between old and new positions gives a smooth tracking feel. Without animation, markers teleport every few seconds which looks jarring. For the current user's location, use the built-in blue dot (`googleMap.isMyLocationEnabled = true`) instead of a custom marker.

#### Q6: What is marker clustering and when do you need it?

When you have hundreds or thousands of markers close together (like showing all users in a city), rendering each one individually destroys performance and makes the map unreadable. Marker clustering groups nearby markers into a single cluster marker that shows the count.

The Google Maps Utils library provides `ClusterManager` that handles this. As the user zooms in, clusters break apart into individual markers. As they zoom out, markers merge into clusters. The clustering algorithm (typically grid-based or distance-based) runs on every camera change.

The key decision is the cluster distance threshold — how close markers need to be to cluster together. Too aggressive and you lose detail, too conservative and the map is still cluttered. A common approach is using a grid of fixed pixel size (e.g., 100x100 dp) and grouping all markers within the same grid cell.

#### Q7: How would you draw routes between locations?

Use the Directions API to get the route between two points, then draw it as a polyline on the map. The API returns a list of coordinates (encoded polyline) that follows the road network.

```kotlin
class RouteRenderer(private val googleMap: GoogleMap) {
    private var routePolyline: Polyline? = null

    fun drawRoute(points: List<LatLng>) {
        routePolyline?.remove()
        routePolyline = googleMap.addPolyline(
            PolylineOptions()
                .addAll(points)
                .width(12f)
                .color(Color.BLUE)
                .geodesic(true)
                .jointType(JointType.ROUND)
                .startCap(RoundCap())
                .endCap(RoundCap())
        )
    }

    fun decodePolyline(encoded: String): List<LatLng> {
        val points = mutableListOf<LatLng>()
        var index = 0
        var lat = 0; var lng = 0
        while (index < encoded.length) {
            // Google's polyline encoding algorithm
            var result = 0; var shift = 0; var b: Int
            do { b = encoded[index++].code - 63; result = result or ((b and 0x1F) shl shift); shift += 5 } while (b >= 0x20)
            lat += if (result and 1 != 0) (result shr 1).inv() else result shr 1
            result = 0; shift = 0
            do { b = encoded[index++].code - 63; result = result or ((b and 0x1F) shl shift); shift += 5 } while (b >= 0x20)
            lng += if (result and 1 != 0) (result shr 1).inv() else result shr 1
            points.add(LatLng(lat / 1E5, lng / 1E5))
        }
        return points
    }
}
```

For live navigation, update the polyline as the user moves — remove the portion of the route they've already traveled. Use `geodesic(true)` for long-distance routes so the line follows the earth's curvature.

#### Q8: What is geofencing and how would you implement it?

Geofencing lets you define virtual boundaries around geographic areas and trigger actions when the user enters or exits them. Android's GeofencingClient handles this with minimal battery impact because it uses low-power location sources.

```kotlin
class GeofenceManager(private val context: Context) {
    private val geofencingClient = LocationServices.getGeofencingClient(context)

    fun addGeofence(id: String, lat: Double, lng: Double, radiusMeters: Float) {
        val geofence = Geofence.Builder()
            .setRequestId(id)
            .setCircularRegion(lat, lng, radiusMeters)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .build()

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(geofence)
            .build()

        geofencingClient.addGeofences(request, geofencePendingIntent)
    }
}
```

The system limits you to 100 active geofences per app. For apps that need more (like a nearby-places app with thousands of locations), register geofences only for the nearest locations and update them as the user moves. Geofence accuracy is about 100-200 meters — don't rely on it for precise triggers like entering a room.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How would you design battery-efficient location strategies?

Battery is the biggest constraint in location apps. A GPS fix every second drains a full battery in 4-6 hours. The strategy is to use the least accurate source that meets your needs and reduce update frequency when possible.

- **Active navigation** — High accuracy, 1-2 second interval. User expects battery drain
- **Location sharing (active)** — Balanced power, 5-10 second interval. Good enough for showing movement on a map
- **Location sharing (background)** — Low power, 30-60 second interval. Save battery when the user isn't looking at the app
- **Geofencing** — Passive. The system handles location monitoring with minimal drain

```kotlin
fun getLocationRequest(mode: TrackingMode): LocationRequest {
    return when (mode) {
        TrackingMode.NAVIGATION -> LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, 1000
        ).setMinUpdateDistanceMeters(5f).build()

        TrackingMode.SHARING_ACTIVE -> LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY, 5000
        ).setMinUpdateDistanceMeters(10f).build()

        TrackingMode.SHARING_BACKGROUND -> LocationRequest.Builder(
            Priority.PRIORITY_LOW_POWER, 30000
        ).setMinUpdateDistanceMeters(50f).build()
    }
}
```

Use `setMinUpdateDistanceMeters()` to skip updates when the user hasn't moved. If the user is stationary for 5 minutes, switch to passive mode and only wake up on significant location changes. Batch location updates with `setMaxUpdateDelayMillis()` to let the system batch multiple updates and wake the CPU less frequently.

#### Q10: How would you implement location sharing with expiry?

Allow users to share their location for a limited time (30 minutes, 1 hour, 8 hours). After the expiry, stop sending location updates and remove the shared session.

```kotlin
data class SharingSession(
    val id: String,
    val userId: String,
    val sharedWith: List<String>,
    val startTime: Long,
    val durationMs: Long
) {
    val expiresAt: Long get() = startTime + durationMs
    val isExpired: Boolean get() = System.currentTimeMillis() > expiresAt
}

class LocationSharingManager {
    private val activeSessions = ConcurrentHashMap<String, SharingSession>()

    fun startSharing(sharedWith: List<String>, durationMs: Long): String {
        val session = SharingSession(
            id = UUID.randomUUID().toString(),
            userId = currentUserId,
            sharedWith = sharedWith,
            startTime = System.currentTimeMillis(),
            durationMs = durationMs
        )
        activeSessions[session.id] = session
        scheduleExpiry(session)
        return session.id
    }

    private fun scheduleExpiry(session: SharingSession) {
        scope.launch {
            delay(session.durationMs)
            stopSharing(session.id)
        }
    }
}
```

Persist the session on the server so it expires even if the app is killed. The server should stop broadcasting a user's location after expiry regardless of whether the client sends a stop signal. For the UI, show a countdown timer so the sharer knows when sharing ends.

#### Q11: How would you handle group location tracking?

Group tracking (like "Find My Friends") means multiple users sharing locations with each other simultaneously. Each user subscribes to a group channel and both sends and receives location updates.

Use a pub/sub model. Each group has a channel on the server. When a user joins a group, they subscribe to that channel and start publishing their location. The server broadcasts each update to all other group members.

On the client side, maintain a map of `userId → Location` and update markers as updates arrive. Handle stale data — if a user's location hasn't updated in 5 minutes, show their marker as gray or faded to indicate it might be outdated. When a user goes offline, notify the group so others know the location is no longer live.

The main scaling concern is fan-out. A group of 10 users where each sends updates every 5 seconds means 10 incoming messages and 9 outgoing broadcasts per update — 90 messages every 5 seconds per group. For large groups, increase the update interval or send updates only when the user has moved significantly.

#### Q12: How would you handle offline maps?

Offline maps require pre-downloading map tiles for a specific area. Map tiles are 256x256 pixel images organized by zoom level, column, and row. A city-sized area at zoom levels 10-16 can be 50-200 MB of tiles.

The download flow:
- User selects a region on the map (bounding box)
- Calculate which tiles cover that region at each zoom level
- Download all tiles and store them in a local database (SQLite is common for tile storage)
- When rendering offline, the map SDK checks the local tile store before fetching from the network

Google Maps SDK supports offline areas through the `TileOverlay` and `TileProvider` APIs, or through the built-in offline download feature. Mapbox has a more flexible offline API that lets you define regions and style packs. The tradeoff is storage — high zoom levels produce many tiles. Limit the maximum zoom level for offline areas to keep download sizes reasonable.

#### Q13: How do you handle map tile rendering efficiently?

Maps render tiles on-demand as the user pans and zooms. Only the visible tiles are loaded — typically 12-20 tiles visible at once on a phone screen. As the user scrolls, new tiles are fetched and old tiles are evicted from memory.

Use a three-level cache: **memory (LRU)** → **disk** → **network**. Memory cache stores decoded bitmaps for instant rendering. Disk cache stores raw tile data to avoid re-downloading. Pre-fetch tiles at the edges of the visible area so they're ready when the user scrolls.

For vector maps (used by Google Maps and Mapbox), the server sends vector data instead of raster images. The client renders the vectors on-device using OpenGL. This uses less bandwidth (vector tiles are 5-10x smaller than raster tiles), supports smooth rotation and tilting, and allows dynamic styling. The tradeoff is higher CPU/GPU usage on the client.

#### Q14: What privacy considerations matter for a location sharing app?

Location is among the most sensitive data types. Privacy concerns include:

- **Minimum accuracy** — Don't share precise GPS coordinates when approximate location is sufficient. For a "share my city" feature, round to the nearest neighborhood
- **Data retention** — Don't store location history forever. Delete location data after it's no longer needed for the sharing session. Define a retention period (e.g., 24 hours after session ends)
- **Sharing visibility** — Users must see exactly who can see their location and have a one-tap way to stop sharing
- **Background tracking transparency** — If tracking in the background, show an ongoing notification. Android requires this for foreground services anyway
- **Server-side encryption** — Encrypt location data in transit (TLS) and at rest. Location history is a high-value target for attackers

On Android, the system shows a notification badge whenever an app accesses location in the background. Starting from Android 12, approximate vs precise location is a user choice — your app must handle both gracefully. Google Play rejects apps that collect background location without a clear, user-visible feature that requires it.

#### Q15: How would you handle real-time location updates with background restrictions?

Android aggressively restricts background work. On Android 8+, background location updates are throttled to a few per hour unless you use a foreground service. On Android 10+, background location needs a separate permission.

For continuous location sharing, use a foreground service with a persistent notification. This tells the system the user is aware of the location tracking.

```kotlin
class LocationForegroundService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification("Sharing your location")
        startForeground(NOTIFICATION_ID, notification)
        startLocationUpdates()
        return START_STICKY
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000
        ).build()

        fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }
}
```

`START_STICKY` tells the system to restart the service if it's killed due to memory pressure. On Android 14+, foreground services require a type declaration in the manifest — use `android:foregroundServiceType="location"`. Without the foreground service, the system throttles background location updates to roughly 4 per hour, which is useless for real-time sharing.

#### Q16: How would you design the server architecture for location sharing?

The server needs to handle high-frequency writes (location updates from many users) and real-time fan-out (broadcasting to subscribers). A typical architecture uses:

- **WebSocket gateway** — Maintains persistent connections with clients. Routes incoming location updates to the processing layer and outgoing updates to subscribers
- **Redis Pub/Sub** — For real-time fan-out. When a user sends a location update, publish it to a channel. All servers subscribed to that channel forward it to connected clients
- **Location storage** — Use a time-series database or Redis with TTL for current locations. No need to persist historical data unless the feature requires it
- **Geo-indexing** — If the app has a "people nearby" feature, use Redis GEO commands or PostGIS for spatial queries

The client sends a compact payload — just latitude, longitude, accuracy, and timestamp. Keep payloads small because location updates are frequent. Use binary protocols (Protocol Buffers) instead of JSON for further compression if update frequency is high.

### Common Follow-ups

- How would you implement "share my ETA" where others see your estimated arrival time?
- How would you handle spoofed/fake locations?
- How would you implement location history playback (replay a trip)?
- What happens when both GPS and network location are available — how do you choose?
- How would you implement a "notify me when they arrive" feature using geofencing?
- How would you handle map rendering in Jetpack Compose?
- How would you test location-dependent features without a real GPS signal?
