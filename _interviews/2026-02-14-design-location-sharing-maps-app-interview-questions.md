---
title: "Design a Location Sharing / Maps App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 13
sequence: 67
description: "Designing a location sharing or maps app tests your understanding of real-time communication, battery-efficient location strategies, map rendering, and privacy."
---

## Design a Location Sharing / Maps App

This one's a beast. You're juggling real-time communication, battery-constrained location tracking, map rendering, and privacy — all in one system. Think of it like designing a restaurant that needs to serve food fast, keep the kitchen energy-efficient, make the dining room look beautiful, and also never accidentally reveal where your customers live.

#### What are the core functional requirements for a location sharing app?

Start with what the user actually does:

- Share live location with friends for a set duration
- View friends' locations on a map in real-time
- Search for places and get directions
- Set up geofences to get notified when a friend arrives or leaves a location

Here's the thing — a 45-minute interview can't cover all of this. Tell the interviewer you'll focus on real-time location sharing and map rendering, and treat navigation and geofencing as extensions. Scoping well is half the battle.

#### What are the non-functional requirements?

Three things matter most:

- **Battery efficiency** — Location tracking can drain a full battery in 4-6 hours if you use GPS every second. The app must adapt accuracy and frequency based on context
- **Accuracy** — Navigation needs precise GPS. Showing a friend's general area needs much less. It's like using a magnifying glass to read a billboard — overkill, and it costs you battery for nothing
- **Privacy** — Location is sensitive data. Users need full control over who sees their location, for how long, and at what precision. The system must enforce expiry server-side, not just client-side

Other considerations: offline support (cached map tiles, last-known locations), low-latency updates (sub-second for navigation, a few seconds for sharing), and handling Android's background restrictions.

#### How would you scope the design for a 45-minute interview?

Focus on client-side architecture. Tell the interviewer you'll cover:

- How the client gets and sends location updates efficiently
- Real-time sharing using WebSocket or push
- Map rendering with markers and clustering
- Battery strategy across different modes (foreground, background, navigation)

Explicitly defer backend scaling, multi-platform sync, and social features like groups. If the interviewer wants to go deeper on any area, they'll tell you.

#### What does the client architecture look like?

Standard layered architecture with location-specific components:

- **UI layer** — Map view (Google Maps SDK or Mapbox), friend markers, search bar, sharing controls. Observes state from ViewModels
- **Domain layer** — Use cases for starting/stopping sharing sessions, managing friends list, computing ETAs
- **Data layer** — LocationRepository wraps FusedLocationProvider. SharingRepository manages WebSocket connections. PlacesRepository handles search and caching
- **Location service** — A foreground service that keeps location tracking alive when the app is in the background

Data flows in one direction. Think of it like a river — the location provider pushes updates to the repository, the repository sends them to the server via WebSocket, and incoming friend updates flow through the repository to the ViewModel to the map. No backflow, no surprises.

> **🧠 Think about it:** Why is one-directional data flow especially important in a location app where updates arrive every few seconds from multiple sources?

#### How does real-time location sharing work?

WebSockets. The client opens a persistent connection — like keeping a phone call open — and sends its own location updates through it. The server broadcasts those updates to everyone subscribed to that user's location.

```kotlin
class LocationSharingClient(private val webSocket: WebSocket) {

    fun sendLocation(lat: Double, lng: Double, accuracy: Float) {
        val payload = """{"lat":$lat,"lng":$lng,"acc":$accuracy,"ts":${System.currentTimeMillis()}}"""
        webSocket.send(payload)
    }

    fun subscribeToFriend(friendId: String) {
        webSocket.send("""{"action":"subscribe","userId":"$friendId"}""")
    }
}
```

Why not polling? Polling is like repeatedly calling your friend asking "Where are you now? Where are you now?" WebSocket keeps the line open and only talks when there's something new. No repeated handshakes, no wasted requests. For background updates when the WebSocket drops, fall back to FCM push messages — slight delay, but works reliably even when the app is killed.

#### What APIs does the client need?

Three main groups:

- **Location updates** — `POST /location` to send the user's current position. `GET /location/{userId}` for on-demand fetch. Real-time updates go through WebSocket, not REST
- **Friends and sharing** — `POST /sharing/start` with a friend list and duration to begin a session. `DELETE /sharing/{sessionId}` to stop. `GET /friends` to list friends and their sharing status
- **Places** — `GET /places/search?q=coffee&lat=X&lng=Y` for nearby search. `GET /directions?origin=X,Y&destination=A,B` for routing

Keep the location update payload minimal — latitude, longitude, accuracy, and timestamp. These updates fire frequently, so every extra byte adds up. Consider Protocol Buffers instead of JSON if update frequency is very high.

#### What are the key data models?

```kotlin
data class Location(
    val userId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val timestamp: Long,
    val source: LocationSource // GPS, NETWORK, FUSED
)

data class SharedSession(
    val id: String,
    val ownerId: String,
    val sharedWith: List<String>,
    val startTime: Long,
    val durationMs: Long,
    val isActive: Boolean
) {
    val expiresAt: Long get() = startTime + durationMs
}

data class Place(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val category: String
)
```

`SharedSession` is the star of the show. It tracks who is sharing with whom and when it expires. Plot twist: the server must enforce expiry independently. If the client crashes or the user throws their phone into a lake, the session still stops on time.

#### How do you integrate a map SDK?

Use Google Maps SDK or Mapbox. Add markers for each friend's location and animate them as updates arrive. Without animation, markers teleport every few seconds — it looks like your friends are glitching through the Matrix.

```kotlin
class FriendMapRenderer(private val map: GoogleMap) {
    private val markers = mutableMapOf<String, Marker>()

    fun updateFriend(userId: String, lat: Double, lng: Double) {
        val target = LatLng(lat, lng)
        val existing = markers[userId]
        if (existing != null) {
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 800
                val start = existing.position
                addUpdateListener { anim ->
                    val f = anim.animatedFraction
                    existing.position = LatLng(
                        start.latitude + (target.latitude - start.latitude) * f,
                        start.longitude + (target.longitude - start.longitude) * f
                    )
                }
            }.start()
        } else {
            markers[userId] = map.addMarker(
                MarkerOptions().position(target).title(userId)
            )!!
        }
    }
}
```

For the current user's location, use the built-in blue dot (`map.isMyLocationEnabled = true`) instead of a custom marker. It handles bearing, accuracy circle, and smooth movement out of the box. Don't reinvent that wheel.

#### How does the location provider strategy work?

`FusedLocationProviderClient` is like a smart assistant that picks the best location source for you. It combines GPS, Wi-Fi, cellular, and sensors — GPS outdoors, Wi-Fi/cell indoors — and you control the tradeoff through the `Priority` parameter.

```kotlin
class LocationProvider(context: Context) {
    private val client = LocationServices.getFusedLocationProviderClient(context)

    fun startUpdates(priority: Int, intervalMs: Long) {
        val request = LocationRequest.Builder(priority, intervalMs)
            .setMinUpdateDistanceMeters(10f)
            .build()
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { onLocationUpdate(it) }
        }
    }
}
```

`PRIORITY_HIGH_ACCURACY` fires up GPS — accurate to 1-3 meters but drains battery fast. `PRIORITY_BALANCED_POWER_ACCURACY` uses Wi-Fi and cell — about 100 meters accuracy with much less drain. `PRIORITY_LOW_POWER` uses cell only — 1-10 km accuracy but almost no battery impact. Your app should switch between these based on what the user is actually doing.

#### How do you track location without killing the battery?

Yeah, this trips up everyone. It's the single most important design decision in a location app. The strategy is deceptively simple: use the lowest accuracy that works for each situation, and update as infrequently as possible.

```kotlin
fun buildLocationRequest(mode: TrackingMode): LocationRequest {
    return when (mode) {
        TrackingMode.NAVIGATION -> LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, 1000
        ).setMinUpdateDistanceMeters(5f).build()

        TrackingMode.ACTIVE_SHARING -> LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY, 5000
        ).setMinUpdateDistanceMeters(10f).build()

        TrackingMode.BACKGROUND_SHARING -> LocationRequest.Builder(
            Priority.PRIORITY_LOW_POWER, 30000
        ).setMinUpdateDistanceMeters(50f)
        .setMaxUpdateDelayMillis(120000).build()
    }
}
```

Three techniques make a big difference. First, `setMinUpdateDistanceMeters()` skips updates when the user hasn't moved — no point sending the same coordinates over and over like a broken record. Second, `setMaxUpdateDelayMillis()` lets the system batch updates and wake the CPU once instead of many times. Third, use activity recognition to detect when the user is stationary and switch to passive mode automatically. If they haven't moved in 5 minutes, there's no reason to keep GPS active.

> **🧠 Think about it:** If your user is sitting at a coffee shop for an hour while sharing location, how many location updates *should* you actually send? What's the minimum that keeps the experience feeling "live"?

#### How do you implement geofencing?

Android's `GeofencingClient` monitors virtual boundaries — think of them like invisible trip wires on the map. It uses low-power location sources internally, so you don't pay the GPS cost.

```kotlin
class GeofenceManager(context: Context) {
    private val client = LocationServices.getGeofencingClient(context)

    fun addFence(id: String, lat: Double, lng: Double, radius: Float) {
        val fence = Geofence.Builder()
            .setRequestId(id)
            .setCircularRegion(lat, lng, radius)
            .setTransitionTypes(
                Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT
            )
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .build()

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(fence)
            .build()

        client.addGeofences(request, pendingIntent)
    }
}
```

The system caps you at 100 active geofences per app. If you need to monitor more locations (say a nearby-places feature with thousands of POIs), register only the closest ones and re-register as the user moves. Geofence accuracy is about 100-200 meters, so don't rely on it for precise triggers like entering a specific room.

#### How do you handle map rendering performance?

Maps load tiles on-demand as the user pans and zooms — typically 12-20 tiles visible at once. Think of it like a jigsaw puzzle where you only load the pieces the user is currently looking at. The key to smooth scrolling is a three-level cache: memory LRU for decoded bitmaps, disk cache for raw tile data, and network as the fallback. Pre-fetch tiles just outside the visible area so they're ready when the user scrolls.

When showing many friends or points of interest, use marker clustering. Without it, hundreds of overlapping markers destroy rendering performance and make the map unreadable. Google Maps Utils provides `ClusterManager` — it groups nearby markers into a single cluster icon showing the count. As the user zooms in, clusters break apart into individual markers.

Modern map SDKs use vector tiles instead of raster images. Vector tiles are 5-10x smaller, support smooth rotation and tilting, and allow dynamic styling (like dark mode). The tradeoff is higher GPU usage on the client for rendering.

#### How do you support offline maps?

Offline maps mean pre-downloading tiles for a specific area. The user selects a region, the app calculates which tiles cover it at each zoom level, downloads them, and stores them locally in SQLite. When offline, the map SDK checks the local store before hitting the network.

Here's the thing — a city-sized area at zoom levels 10-16 is roughly 50-200 MB. High zoom levels produce exponentially more tiles (each zoom level quadruples the tile count). Limit the maximum offline zoom level and let the user choose which areas to download. Mapbox has a built-in offline API for this. Google Maps SDK supports it through `TileOverlay` and `TileProvider`.

Cache last-known friend locations locally too. When the user opens the app offline, they see where friends were last reported instead of staring at an empty map.

#### How does background location work on modern Android?

Android aggressively restricts background location — and the rules keep getting tighter. On Android 8+, background updates are throttled to a few per hour unless you use a foreground service. On Android 10+, background location requires a separate permission (`ACCESS_BACKGROUND_LOCATION`). On Android 14+, you must declare `android:foregroundServiceType="location"` in the manifest.

```kotlin
class LocationSharingService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification("Sharing location"))
        startLocationUpdates()
        return START_STICKY
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000
        ).build()
        fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }
}
```

`START_STICKY` restarts the service if the system kills it for memory. The persistent notification is non-negotiable — Android requires it for foreground services, and honestly it's good UX because the user always knows tracking is active. Without a foreground service, the system throttles updates to roughly 4 per hour. That's one update every 15 minutes. Real-time sharing? Not so much.

#### How do you implement privacy controls for location sharing?

Users need full control over three things: who sees their location, for how long, and at what precision. It's like lending someone your car — you decide who gets the keys, for how long, and whether they can go anywhere or just around the block.

```kotlin
class SharingManager {
    private val sessions = ConcurrentHashMap<String, SharedSession>()

    fun startSharing(friends: List<String>, durationMs: Long): String {
        val session = SharedSession(
            id = UUID.randomUUID().toString(),
            ownerId = currentUserId,
            sharedWith = friends,
            startTime = System.currentTimeMillis(),
            durationMs = durationMs,
            isActive = true
        )
        sessions[session.id] = session
        scheduleExpiry(session)
        return session.id
    }

    private fun scheduleExpiry(session: SharedSession) {
        scope.launch {
            delay(session.durationMs)
            stopSharing(session.id)
        }
    }
}
```

Expiry must be enforced server-side. If the client crashes or loses connectivity, the server stops broadcasting after the time limit regardless. For precision control, let users share approximate location (rounded to nearest neighborhood) instead of exact GPS coordinates.

On Android 12+, the user can grant approximate instead of precise location at the system level. Your app must handle both gracefully. Google Play also rejects apps that request background location without a clear user-facing reason, so document the justification during review.

#### How do you handle real-time updates at scale?

The server uses WebSocket connections with Redis Pub/Sub for fan-out. When user A sends a location update, the server publishes it to a Redis channel. All server instances subscribed to that channel forward the update to connected clients watching user A.

The scaling concern is fan-out, and the math gets spicy fast. A group of 10 users sharing with each other, each sending updates every 5 seconds, produces 90 outgoing messages every 5 seconds (10 updates, each broadcast to 9 others). For large groups, increase the update interval or use delta updates — only send a new position when the user has moved more than a threshold distance.

On the client side, maintain a map of `userId` to `Location` and update markers as updates arrive. If a friend's location hasn't updated in 5 minutes, fade their marker to signal stale data. When a friend goes offline, show their last-known position with a timestamp.

#### How do you filter noisy location data?

Raw GPS readings jump around, especially in cities where signals bounce off buildings. It's like trying to find someone by their echoes in a canyon — you get multiple conflicting answers. A Kalman filter smooths these jumps by combining the predicted position (based on speed and direction) with the measured GPS position, weighted by confidence.

The simpler approach: filter by accuracy. Drop any reading with accuracy worse than a threshold (50 meters for navigation, 200 meters for sharing). Also drop readings that imply impossible movement — if two consecutive readings 1 second apart are 500 meters away, one of them is lying. Calculate the implied speed and discard anything exceeding a reasonable maximum (like 200 km/h for driving).

For display, interpolate between accepted readings rather than showing raw points. This gives a smooth path on the map even when updates arrive at irregular intervals.

> **🧠 Think about it:** Your user is walking through downtown Manhattan between skyscrapers. GPS accuracy drops to 100+ meters. How would you keep their map dot from bouncing between city blocks?

#### How do you test location features?

Testing location on Android has three levels:

- **Unit tests** — Mock `FusedLocationProviderClient` and `LocationCallback`. Feed fake location data into your repository and verify the downstream behavior (correct updates emitted, battery mode switching, expiry logic)
- **Emulator testing** — Android Emulator lets you set mock locations through the extended controls panel. You can also feed a GPX or KML route file to simulate movement along a path
- **On-device mock** — Enable "Allow mock locations" in developer settings and use `setMockMode()` / `setMockLocation()` on the fused client to inject test locations from within the app

```kotlin
class FakeLocationSource : LocationCallback() {
    private val locations = mutableListOf<Location>()

    fun emitLocation(lat: Double, lng: Double, accuracy: Float) {
        val location = Location("test").apply {
            latitude = lat
            longitude = lng
            this.accuracy = accuracy
            time = System.currentTimeMillis()
        }
        locations.add(location)
        onLocationUpdate(location)
    }
}
```

Test the edge cases that are hard to reproduce naturally: GPS signal loss, switching between GPS and network, location permission revoked mid-session, and rapid location changes. Automate these with mock location providers in your integration tests.

### Common Follow-ups

- How would you implement "share my ETA" where others see your estimated arrival time?
- How would you detect and reject spoofed or fake locations?
- How would you implement location history playback to replay a trip on the map?
- How would you draw and update a navigation route as the user drives?
- How would you implement "notify me when they arrive" using geofencing?
- How would you handle map rendering in Jetpack Compose using AndroidView?
- How would you design the nearby-places search feature with caching?
