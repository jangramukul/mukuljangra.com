---
title: "Mobile System Design Fundamentals"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 1
sequence: 55
description: "Mobile system design interviews focus on client-side architecture, not backend scaling."
---

## Mobile System Design Fundamentals

Mobile system design interviews focus on client-side architecture, not backend scaling. Every interview follows the same flow: gather requirements, sketch the high-level design, then go deep into specific areas. Learn the process here, then apply it to any specific design problem.

#### How do you structure the high-level architecture of a mobile app?

The standard layered architecture has three layers:

- **UI layer** — Activities, Fragments, or Composables. Observes state from ViewModels and renders it. No business logic here
- **Domain layer** (optional) — Use cases that contain business logic. Pure Kotlin, no Android dependencies
- **Data layer** — Repositories that coordinate between remote (API) and local (Room, DataStore) data sources

The data layer is where most of the interesting system design decisions live. Each repository owns a specific domain — `ArticleRepository`, `UserRepository` — and the ViewModel doesn't know or care whether data came from the network or the local database.

#### What is the single source of truth pattern and why does it matter?

Single source of truth means the local database is the only place the UI reads data from. The network layer writes to the database, and the UI observes the database through Flow. The UI never directly consumes API responses.

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

This gives you offline support for free — the database always has the last known data. It gives you UI consistency — all screens showing the same entity see the same version. And it simplifies state management because you're not manually merging network responses with cached data. Without this pattern, you get stale data bugs where one screen shows the old version and another shows the updated version.

#### How do you choose an architecture pattern (MVVM, MVI) and set up dependency injection?

MVVM with unidirectional data flow is the standard for Android. The ViewModel holds UI state as a `StateFlow`, the UI observes it, and user actions flow back to the ViewModel as events. MVI is a stricter version where all events are modeled as a sealed class and state transitions happen through a reducer — better for complex screens with many interacting states.

For dependency injection, Hilt is the standard for production apps. It generates code at compile time, so there's no runtime reflection cost. Define modules for your data layer (API clients, DAOs, repositories) and let Hilt inject them into ViewModels and use cases. In a system design interview, mentioning Hilt briefly is enough — the interviewer cares more about what you inject than how.

#### How do you design caching in detail?

Use a two-level cache — memory and disk. Memory cache (an `LruCache` or repository-scoped map) gives instant access but dies with the process. Disk cache (Room) survives restarts. The repository coordinates both: check memory first, then disk, then network. Write network results to both levels on the way back.

Cache invalidation is the hard part. Three strategies:

- **TTL** — Expire entries after a fixed duration. Simple but blunt — you might serve stale data or evict data that's still valid
- **Version-based** — Tag data with a version. When the server reports a newer version, invalidate the local copy
- **Event-based** — Invalidate specific entries when a relevant write happens. If the user posts a new article, invalidate the article list cache

Stale-while-revalidate combines caching with freshness. Show cached data immediately, fetch fresh data in the background, update the UI when it arrives. The user sees content within milliseconds instead of waiting for a network round trip.

#### How do you handle threading and concurrency?

All UI work happens on the main thread. Everything else runs on background threads using Kotlin coroutines.

- **Dispatchers.Main** — UI updates, state emission
- **Dispatchers.IO** — Network calls, database queries, file I/O. Pool of 64 threads
- **Dispatchers.Default** — CPU-heavy work like JSON parsing or sorting large lists. Pool sized to CPU cores

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

Use coroutine scopes tied to lifecycle — `viewModelScope` and `lifecycleScope` — so in-flight requests get cancelled automatically when the user navigates away. Avoid raw threads and `Executors`.

#### How do you design offline support?

There are three levels:

- **Read-only offline** — Cache previously fetched data in Room. The user can browse but can't create or modify anything. This is the minimum for most apps
- **Offline queue** — Let the user perform write operations while offline. Queue them locally with metadata (timestamp, operation type, entity ID) and replay when connectivity returns
- **Full offline-first** — The local database is the primary data store. A sync engine handles bidirectional sync with conflict resolution (last-write-wins, server-wins, or field-level merge)

For most interview problems, read-only offline with an offline queue for critical writes is the right answer. Full offline-first adds significant complexity around conflict resolution and is only worth it when the product demands it — apps like Notion or Google Docs.

#### How do you decide on client-server communication?

Most mobile apps use REST over HTTPS for standard CRUD operations. That's the default unless you have a reason to pick something else.

Use WebSocket or SSE when you need real-time updates pushed from the server — chat messages, live scores, collaborative editing. Use GraphQL when the client needs flexible queries across multiple entity types and you want to avoid over-fetching. Use gRPC with Protocol Buffers for high-frequency, low-latency communication where payload size matters.

For push notifications (new message alerts, background data sync triggers), FCM is the standard on Android. It's far more battery-efficient than polling the server every 30 seconds. Use push to notify the client that something changed, then let the client pull the actual data.

#### How do you design the API contract from the mobile client's perspective?

Think screen-first. Each screen should ideally be populated by one API call. If a screen needs data from multiple domain objects, the server should aggregate it rather than forcing the client into multiple round trips.

- **Pagination** — Use cursor-based pagination, not offset-based. Cursors are stable when new items are inserted or deleted. Return `nextCursor` and `hasMore` in every paginated response
- **Partial responses** — List endpoints return lightweight objects. Detail endpoints return the full entity. Don't send a 50-field object when the list only shows title and thumbnail
- **Error format** — Use structured error codes the client can act on. A 400 for "invalid email" and "duplicate username" need different UI messages

```kotlin
@Serializable
data class PaginatedResponse<T>(
    val items: List<T>,
    val nextCursor: String?,
    val hasMore: Boolean
)
```

If you don't control the backend, say so. Explain the ideal API and how you'd work around a suboptimal one with local aggregation and mapping.

#### How do you design the data model?

Start with the entities visible on the screen and work backward. Identify core entities (User, Article, Message, Order) and their relationships. Decide what gets stored locally vs fetched on demand — frequently accessed data goes in Room, large media stays on the server until explicitly requested.

Keep network DTOs separate from database entities. Map between them in the repository. This decouples your local schema from the API contract so either side can evolve independently.

```kotlin
@Serializable
data class ArticleResponse(
    val id: String,
    val title: String,
    val authorName: String,
    val content: String,
    val createdAt: Long
)

@Entity(tableName = "articles")
data class ArticleEntity(
    @PrimaryKey val id: String,
    val title: String,
    val authorName: String,
    val content: String,
    val createdAt: Long,
    val lastFetchedAt: Long
)
```

The `lastFetchedAt` field is local-only — it tracks cache freshness so you know when to refresh from the network.

#### How do you implement pagination on the client?

Use cursor-based pagination. The server returns a page of items plus a `nextCursor`. The client stores the cursor and passes it back when requesting the next page. Trigger the next page load when the user scrolls within 5-10 items of the end.

```kotlin
@Composable
fun FeedScreen(viewModel: FeedViewModel) {
    val state by viewModel.feedState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    LaunchedEffect(listState) {
        snapshotFlow {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= listState.layoutInfo.totalItemsCount - 5
        }
        .distinctUntilChanged()
        .filter { it }
        .collect { viewModel.loadNextPage() }
    }

    LazyColumn(state = listState) {
        items(state.posts, key = { it.id }) { post -> FeedPostItem(post) }
        if (state.isLoadingMore) { item { LoadingIndicator() } }
    }
}
```

The `distinctUntilChanged()` prevents repeated triggers. Using `key` in `items()` lets Compose skip recomposition for unchanged items and preserves scroll position across data updates.

#### What's the first thing you should do when given a mobile system design problem?

Ask questions. Don't start drawing architecture diagrams. Spend the first 5 minutes clarifying what you're actually building. The interviewer gives you a vague prompt on purpose — "design a photo sharing app" — and they want to see you narrow it down.

Split your questions into two buckets: functional requirements (what does the app do?) and non-functional requirements (how does it behave under constraints?). Write them down visibly so the interviewer can see your thought process.

#### How do you identify functional requirements for a mobile system design?

Functional requirements define the features. Ask about what the user can do on each screen, what data they see, and what actions trigger server communication. For a photo sharing app, functional requirements might be: browse a feed, post a photo with caption, like and comment, follow users, search.

Keep it to 3-5 core features. If the interviewer says "design Instagram," you're not building all of Instagram. Pick the features that matter for the discussion — usually a feed, content creation, and one social interaction. Explicitly list what's out of scope so the interviewer knows you're being deliberate about it.

#### How do you identify non-functional requirements?

Non-functional requirements are the constraints that shape your architecture. These are the questions that separate mobile system design from backend system design:

- Does the app need to work offline? Read-only or read-write?
- What's the target audience? Global users on 3G, or power users on flagship devices?
- Are there real-time requirements (live updates, typing indicators)?
- What's the expected app size budget?
- Does it need accessibility support?
- Are there security requirements like encryption at rest or certificate pinning?

These constraints drive every architecture decision that follows. Offline support means you need a local database. Low-end device support means you need to be careful about memory and image sizes. Real-time updates mean WebSockets or SSE instead of polling.

#### How do you define scope and resource constraints?

After listing requirements, draw a line between must-haves and nice-to-haves. The interviewer doesn't expect a complete production app in 45 minutes. Be explicit: "I'll focus on the feed and posting flow, and keep search and notifications out of scope."

For resources, clarify what backend support exists. Can you assume a REST API? Do you control the API contract or is it fixed? Is there a push notification service like FCM? Is there a CDN for images? These assumptions change your client-side design significantly. If you don't control the backend, you might need more local aggregation and caching to work around suboptimal APIs.

#### How do you address non-functional requirements in the high-level design?

After laying out the architecture, walk through each non-functional requirement and show how your design handles it.

- **Offline support** — The single source of truth pattern handles read-only offline. For write operations while offline, queue them in a pending actions table and replay with WorkManager when connectivity returns
- **Battery** — Batch network requests, use FCM push instead of polling, defer non-urgent work with WorkManager constraints (charging, Wi-Fi). Respect Doze mode
- **Bandwidth** — Cursor-based pagination, gzip compression on the HTTP client, request images at the device's actual resolution, delta sync using timestamps to fetch only changes
- **Low-end devices** — Downsample images, limit concurrent coroutines, disable heavy animations on low-RAM devices via `ActivityManager.isLowRamDevice()`

Don't go deep here — just show that your architecture accounts for these constraints. The deep dives come next.

#### How do you approach performance in a system design answer?

Call out specific performance concerns for the problem at hand. For a feed, it's scroll performance — every frame must render within 16ms for 60fps. For a chat app, it's message delivery latency. For a map app, it's location update frequency.

General strategies that apply to most designs:

- **Image optimization** — Request images at the device's resolution, not full-size originals. Use WebP. Prefetch images for items about to scroll into view
- **Lazy loading** — Don't initialize everything at startup. Load modules and heavy resources on demand
- **Memory management** — Downsample bitmaps, use view recycling, limit concurrent work on low-end devices
- **App size** — Use Android App Bundles for density/ABI/language splits. Enable R8 shrinking. Audit dependencies. Every 6 MB increase in app size reduces installs by roughly 1% in emerging markets

#### How do you handle accessibility and localization?

Accessibility should be part of every system design answer, not an afterthought.

- **Content descriptions** — Every meaningful image and icon needs a description for screen readers. Decorative elements get marked as not important for accessibility
- **Touch targets** — Minimum 48dp x 48dp for interactive elements
- **Font scaling** — Use `sp` for text. Layouts should reflow at large font sizes, not clip
- **Color contrast** — Minimum 4.5:1 contrast ratio. Don't rely on color alone to convey meaning

For localization, externalize all strings to `strings.xml` and support RTL layouts. If the app targets global users, plan for text expansion — German and French strings are typically 30% longer than English. Use ICU `MessageFormat` for plurals and gendered text instead of string concatenation.

#### How do you address security concerns?

Security comes up when your app handles sensitive data — auth tokens, payments, personal information.

- **Token storage** — Store auth tokens in `EncryptedSharedPreferences`, not plain SharedPreferences. Never put tokens in a database without encryption
- **Certificate pinning** — Pin your server's certificate in OkHttp to prevent MITM attacks on compromised networks. Use backup pins for certificate rotation
- **Network security** — Enforce HTTPS everywhere via Network Security Config. Disable cleartext traffic in production builds
- **Data at rest** — Encrypt sensitive Room databases using SQLCipher. Use Android Keystore for cryptographic key management

In a system design interview, you don't need to go deep on security. Mentioning token storage and certificate pinning takes 15 seconds and shows you think about it.

### Common Follow-ups

- How would you handle versioning of your API contract when the app has multiple versions in the wild?
- How do you decide between Room and DataStore for local storage?
- How would you monitor app health in production (crash rate, ANR rate, network errors)?
- How do you handle deep links into specific screens while maintaining proper back stack behavior?
- What's your approach to feature flags and A/B testing on mobile?
- How do you handle Room schema migrations when the data model changes?
- What is optimistic UI and when would you use it?
