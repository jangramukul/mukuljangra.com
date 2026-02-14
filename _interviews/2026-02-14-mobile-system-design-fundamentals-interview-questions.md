---
title: "Mobile System Design Fundamentals"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 1
level: mid
sequence: 45
---

## Mobile System Design Fundamentals

Mobile system design interviews focus on client-side architecture, not backend scaling. Interviewers want to see how you think about constraints like battery, bandwidth, offline support, and low-end devices while designing a clean, maintainable mobile architecture.

### Core Questions (Beginner → Intermediate)

#### Q1: What is the general template for approaching a mobile system design interview?

Follow this structure:

- **Clarify requirements** — Ask about features, scale, platform, and non-functional requirements (offline, accessibility, low-end devices). Separate must-haves from nice-to-haves
- **High-level architecture** — Draw the major client-side components: UI layer, domain layer, data layer, and how they connect to the backend
- **Data model** — Define the entities, their relationships, and how they're stored locally vs fetched from the server
- **API design** — Define the endpoints your client needs, request/response shapes, pagination strategy, and error responses
- **Client architecture** — Break down the internal modules: ViewModels, repositories, local database, caching, sync logic
- **Deep dives** — Pick 2-3 areas the interviewer cares about and go deep: caching strategy, offline support, performance, threading

Spend about 5 minutes on requirements, then divide the remaining time across architecture and deep dives. Don't jump into deep dives before establishing the high-level picture.

#### Q2: What are the key differences between mobile system design and backend system design?

Backend system design focuses on horizontal scaling, load balancing, database sharding, and handling millions of requests per second. Mobile system design focuses on a single device with constrained resources.

The key concerns on mobile are:
- **Battery** — Background work drains battery. You batch network requests, use WorkManager for deferrable tasks, and avoid polling when push notifications work
- **Bandwidth** — Users may be on slow or metered networks. You compress payloads, use pagination, cache aggressively, and support offline access
- **Memory** — A phone has 2-8 GB of RAM shared across all apps. Your app gets killed if it uses too much
- **Storage** — Disk space is limited. You evict caches and let the user control download sizes
- **Lifecycle** — Activities and Fragments are destroyed and recreated constantly. Your architecture must survive configuration changes and process death

#### Q3: How do you gather and clarify requirements in a mobile system design interview?

Ask questions in two categories — functional and non-functional.

Functional requirements define what the app does:
- What are the core features? What can the user do?
- What data does the user see on each screen?
- Are there real-time updates or is polling acceptable?
- What user interactions need server communication?

Non-functional requirements define how the app behaves under constraints:
- Does it need to work offline? Fully or partially?
- What's the target audience? Global users on slow networks? Power users on flagship phones?
- Does it need accessibility support (TalkBack, font scaling)?
- What's the expected app size budget?
- Are there security requirements (encryption, certificate pinning)?

Always clarify scope — interviewers intentionally give vague requirements to see how you narrow them down.

#### Q4: How do you structure the high-level architecture of a mobile app?

The standard layered architecture has three layers:

- **UI layer** — Activities, Fragments, or Composables. Observes state from ViewModels and renders UI. No business logic here
- **Domain layer** (optional) — Use cases or interactors that contain business logic. This layer is pure Kotlin with no Android dependencies
- **Data layer** — Repositories that abstract data sources. Each repository coordinates between remote (API) and local (Room, DataStore) sources

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val networkMonitor: NetworkMonitor
) {
    fun getArticles(): Flow<List<Article>> {
        return dao.observeArticles().onStart {
            if (networkMonitor.isOnline.value) {
                val remote = api.fetchArticles()
                dao.insertAll(remote.map { it.toEntity() })
            }
        }
    }
}
```

The database is the single source of truth. The UI observes the database through Flow, and the repository updates the database when fresh data arrives from the network. This pattern naturally supports offline — the UI always has data to show.

#### Q5: How do you think about non-functional requirements like offline support?

Offline support means the app provides a useful experience without network connectivity. There are levels to it:

- **Read-only offline** — Cache previously fetched data in Room or DataStore. The user can browse but can't create or modify anything. This is the minimum for most apps
- **Offline queue** — Let the user perform write operations (post a comment, like a photo) while offline. Queue the operations locally and sync when the network returns
- **Full offline-first** — The local database is the primary data store. All reads and writes go through it. A sync engine handles bidirectional sync with the server, including conflict resolution

For most interview scenarios, read-only offline with an offline queue for critical write operations is the right answer. Full offline-first (like Notion or Google Docs) adds significant complexity around conflict resolution and is only worth it when the product requires it.

#### Q6: What is the single source of truth pattern and why does it matter?

Single source of truth means the local database is the only place the UI reads data from. The network layer writes to the database, and the UI observes the database. This gives you:

- Offline support for free — the database always has the last known data
- Consistent UI — all screens showing the same entity see the same version
- Simpler state management — no need to merge network responses with cached data manually

Without this pattern, you end up with stale data bugs where one screen shows the old version and another shows the updated version because they fetched at different times.

#### Q7: How do you handle bandwidth constraints on mobile?

Bandwidth is limited and often metered. Several strategies help:

- **Pagination** — Don't load everything at once. Use cursor-based pagination for feeds and lists
- **Compression** — Enable gzip on the HTTP client. Use compact serialization formats like Protocol Buffers instead of JSON for high-traffic endpoints
- **Image optimization** — Request images at the exact resolution the device needs, not full-size originals. Use WebP format
- **Delta sync** — Instead of fetching the full dataset every time, only fetch what changed since the last sync. Use timestamps or version numbers
- **Batch requests** — Combine multiple small requests into a single batched request to reduce HTTP overhead
- **Prefetching** — Load data the user is likely to need next while they're on Wi-Fi, but be conservative on cellular

#### Q8: How does battery consumption factor into mobile system design?

Every network request, GPS read, and background task costs battery. The system design should minimize unnecessary work.

- **Batch network requests** — Instead of sending analytics events one by one, batch them and send every 30 seconds or when the user backgrounds the app
- **Use push over poll** — FCM push notifications are far more battery-efficient than polling the server every 30 seconds
- **Respect Doze mode** — Starting from Android 6, the system defers background work when the device is idle. WorkManager handles this automatically
- **Avoid wake locks** — Keeping the CPU awake drains battery fast. Only hold wake locks for truly critical work
- **Location batching** — If you need location updates, use `FusedLocationProviderClient` with batched delivery instead of continuous GPS polling

The key principle is to defer non-urgent work and batch what you can. WorkManager with appropriate constraints (charging, Wi-Fi) is the standard tool for this.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How do you design the data model for a mobile system design problem?

Start with the entities visible on the screen and work backward.

- Identify the core entities (User, Message, Article, Order) and their relationships
- Decide what's stored locally vs fetched on demand. Frequently accessed data goes in Room. Large media files stay on the server until explicitly downloaded
- Design your Room entities with proper indices for query patterns. If you're querying messages by conversation ID, index that column
- Keep network DTOs separate from database entities. Map between them in the repository. This decouples your local schema from the API contract

```kotlin
// Network DTO
@Serializable
data class ArticleResponse(
    val id: String,
    val title: String,
    val authorName: String,
    val content: String,
    val createdAt: Long
)

// Room entity
@Entity(tableName = "articles")
data class ArticleEntity(
    @PrimaryKey val id: String,
    val title: String,
    val authorName: String,
    val content: String,
    val createdAt: Long,
    val lastFetchedAt: Long // local-only field for cache freshness
)
```

The `lastFetchedAt` field is a local-only timestamp that lets you decide when to refresh from the network. This is a common pattern for stale-while-revalidate caching.

#### Q10: How do you design the API contract between the mobile client and the server?

Think from the client's perspective — what data does each screen need, and how many round trips does that take?

- **Screen-driven endpoints** — Ideally, one API call populates one screen. If a screen needs data from multiple domain objects, the server should aggregate it rather than forcing the client to make multiple calls
- **Pagination** — Use cursor-based pagination (not offset-based) for feeds. Cursors are stable even when new items are inserted. Return `nextCursor` and `hasMore` in the response
- **Partial responses** — If an entity is large, support field selection so the list endpoint returns lightweight objects and the detail endpoint returns the full object
- **Error responses** — Define a consistent error format with error codes the client can act on, not just HTTP status codes. A 400 for "invalid email" and "duplicate username" need different UI messages

```kotlin
// Response wrapper
@Serializable
data class PaginatedResponse<T>(
    val items: List<T>,
    val nextCursor: String?,
    val hasMore: Boolean
)
```

If you don't control the backend, acknowledge that in the interview. Explain what the ideal API looks like and how you'd work around a suboptimal one (local aggregation, caching, extra mapping).

#### Q11: How do you handle threading and concurrency in mobile system design?

All UI work happens on the main thread. Network, database, and heavy computation run on background threads. Kotlin coroutines with structured concurrency is the standard approach.

- **Dispatchers.Main** — UI updates, state emission, light processing
- **Dispatchers.IO** — Network calls, database queries, file I/O. Backed by a pool of 64 threads
- **Dispatchers.Default** — CPU-intensive work like JSON parsing, image processing, sorting large lists. Backed by a pool sized to CPU cores

```kotlin
class SearchRepository(
    private val api: SearchApi,
    private val dao: SearchDao
) {
    suspend fun search(query: String): List<SearchResult> {
        return withContext(Dispatchers.IO) {
            val results = api.search(query)
            dao.cacheResults(query, results)
            results
        }
    }
}
```

Avoid creating raw threads or using `Executors` directly. Coroutine scopes tied to lifecycle (`viewModelScope`, `lifecycleScope`) handle cancellation automatically. If a user navigates away, in-flight requests get cancelled instead of leaking.

#### Q12: How do you approach designing for low-end devices?

Low-end devices have less RAM, slower CPUs, and often run older Android versions. Design decisions matter more here.

- **Reduce memory pressure** — Downsample images, use `RecyclerView` with view recycling, avoid loading entire datasets into memory
- **Limit concurrent work** — Use fewer coroutines running in parallel. A flagship phone handles 20 parallel image loads fine, but a low-end device chokes
- **Avoid heavy animations** — Reduce or disable animations on devices with low RAM. Check `ActivityManager.isLowRamDevice()`
- **Smaller payloads** — Request lower-resolution images and fewer items per page
- **Lazy initialization** — Don't initialize everything at app startup. Load modules on demand

The interviewer wants to see that you think about the full range of devices, not just the Pixel you develop on. Mention concrete techniques and when you'd apply them.

#### Q13: How do you approach app size optimization?

App size directly impacts install conversion rates. Every 6 MB increase in app size reduces installs by roughly 1% in emerging markets.

- **Android App Bundle** — Deliver only the resources for the user's device (density, ABI, language). This alone can reduce download size by 20-30%
- **R8/ProGuard** — Shrink unused code and resources. Enable `minifyEnabled` and `shrinkResources` in release builds
- **Vector drawables** — Replace PNG/JPEG icons with vector drawables. A vector icon is typically 200 bytes vs 5-20 KB for a bitmap at multiple densities
- **WebP format** — Use WebP instead of PNG for photos. WebP is 25-35% smaller with similar quality
- **Dynamic feature modules** — Ship rarely used features as on-demand modules that download only when needed
- **Dependency audit** — Review your dependency tree. A single unused library can add hundreds of KB. Use the APK Analyzer to find what's taking space

```kotlin
// build.gradle.kts
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    bundle {
        language { enableSplit = true }
        density { enableSplit = true }
        abi { enableSplit = true }
    }
}
```

#### Q14: What is stale-while-revalidate and how do you implement it on mobile?

Stale-while-revalidate means the app shows cached (potentially stale) data immediately while fetching fresh data in the background. Once the fresh data arrives, the UI updates. This gives the user instant perceived performance — no loading spinners for previously visited screens.

```kotlin
fun getArticles(): Flow<List<Article>> = flow {
    // Emit cached data immediately
    val cached = dao.getArticles()
    if (cached.isNotEmpty()) {
        emit(cached)
    }

    // Fetch fresh data in the background
    try {
        val fresh = api.fetchArticles()
        dao.replaceAll(fresh)
        emit(dao.getArticles())
    } catch (e: IOException) {
        // Network failed — cached data is still showing
        if (cached.isEmpty()) throw e
    }
}
```

The user sees content within milliseconds instead of waiting for a network round trip. The tradeoff is that users briefly see stale data. For most apps this is acceptable — a news article that's 2 minutes old is fine. For a stock trading app, it's not. Choose the freshness strategy based on how time-sensitive the data is.

#### Q15: How do you handle data synchronization between the client and server?

Sync strategies depend on whether data flows one way or both ways.

- **Pull-based sync** — The client periodically fetches updates from the server. Simple but not real-time. Use timestamps or version numbers to fetch only changes: `GET /articles?updatedAfter=2025-01-01T00:00:00Z`
- **Push-based sync** — The server notifies the client when data changes via push notifications or WebSocket. More efficient but requires server-side infrastructure
- **Bidirectional sync** — Both client and server can modify data independently. Requires conflict resolution

For write operations while offline, queue them locally with metadata (timestamp, operation type, entity ID) and replay them when connectivity returns. Handle conflicts with a strategy:
- **Last-write-wins** — Simplest. Whoever wrote last overwrites the other. Works when data isn't collaboratively edited
- **Server-wins** — The server's version always takes priority. Good for admin-controlled data
- **Merge** — Combine both changes field by field. Complex but necessary for collaborative editing

Most interview scenarios need pull-based sync with an offline write queue. Mention bidirectional sync to show depth, but don't over-engineer the solution.

#### Q16: How would you design the caching strategy for a mobile app?

Use a two-level cache — memory and disk.

- **Memory cache** — Fast access, lost on process death. Use `LruCache` or a simple `HashMap` with size limits. Good for data the user is actively viewing (current screen's data, recently loaded images)
- **Disk cache** — Survives process death and app restarts. Use Room for structured data and `DiskLruCache` for binary data like images. Good for anything the user has seen before

The repository coordinates both levels:
1. Check memory cache first — if hit, return immediately
2. Check disk cache (Room) — if hit, return and optionally refresh from network
3. Fetch from network — write to both disk and memory cache, then return

Cache invalidation is the hard part. Strategies include:
- **TTL (time-to-live)** — Expire entries after a fixed duration. Simple but can serve stale data or evict still-valid data
- **Version-based** — Tag cached data with a version number. When the server reports a newer version, invalidate
- **Event-based** — Invalidate specific entries when a relevant write operation happens (e.g., invalidate the article cache when the user posts a new article)

#### Q17: What is optimistic UI and when would you use it?

Optimistic UI means updating the UI immediately as if the operation succeeded, without waiting for the server response. If the server later rejects the operation, you roll back the UI to the previous state.

The classic example is a like button. Instead of showing a spinner while waiting for the server, you toggle the heart immediately and increment the count. In the background, you send the request. If it fails, you revert.

```kotlin
class LikeRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao
) {
    suspend fun toggleLike(articleId: String) {
        // Optimistic update — flip locally first
        dao.toggleLike(articleId)

        try {
            api.toggleLike(articleId)
        } catch (e: IOException) {
            // Revert on failure
            dao.toggleLike(articleId)
        }
    }
}
```

Optimistic UI works well for low-risk, easily reversible actions — likes, bookmarks, read status. It doesn't work for irreversible actions like payments or deleting data. The tradeoff is complexity: you need rollback logic, and the user might briefly see incorrect state if the server rejects the change.

#### Q18: How do you design for accessibility in a mobile system design?

Accessibility isn't a nice-to-have — it's a requirement for production apps and interviewers notice when you mention it.

- **Content descriptions** — Every meaningful image and icon needs a description for screen readers. Decorative elements should be marked as not important for accessibility
- **Touch targets** — Minimum 48dp x 48dp for interactive elements. Small buttons are unusable for users with motor impairments
- **Font scaling** — Use `sp` units for text and test with large font sizes enabled. Layouts should reflow instead of clipping
- **Color contrast** — Text must have at least 4.5:1 contrast ratio against its background. Don't rely on color alone to convey meaning
- **Focus order** — Screen reader traversal should follow a logical reading order, not the layout tree order

In Compose, use `semantics` modifiers to provide accessibility information. In the View system, set `contentDescription` and use `importantForAccessibility`.

Mentioning accessibility in a system design interview shows maturity. It takes 30 seconds to say "I'd ensure all interactive elements have content descriptions and meet the 48dp touch target minimum" and it makes a strong impression.

### Common Follow-ups

- How would you handle versioning of your API contract when the app has multiple versions in the wild?
- What's the difference between cursor-based and offset-based pagination? Why prefer cursors for mobile?
- How do you decide between Room and DataStore for local storage?
- How would you monitor the health of your app in production (crash rate, ANR rate, network errors)?
- How do you handle deep links into specific screens while maintaining proper back stack behavior?
- What's your approach to feature flags and A/B testing on mobile?
- How do you handle schema migrations in Room when your data model changes?
