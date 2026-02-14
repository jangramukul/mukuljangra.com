---
title: "Design a News Feed / Social Media Feed"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 4
sequence: 63
description: "Feed-based screens are one of the most common system design questions in mobile interviews."
---

## Design a News Feed / Social Media Feed

Feed-based screens are one of the most common system design questions in mobile interviews. Every social app — Instagram, Twitter, LinkedIn — has a feed, and the interviewer wants to see how you think about pagination, caching, offline behavior, and performance at scale.

### Core Questions (Beginner → Intermediate)

#### Q1: How would you approach designing a social media feed from a mobile perspective? What's the high-level architecture?

Start by clarifying requirements — is this a chronological feed or ranked? How many posts does the user see per session? Is offline access needed? Then lay out the layers: a UI layer (RecyclerView or LazyColumn) that observes a ViewModel, a repository that coordinates between a local database (Room) and a remote API (Retrofit/OkHttp), and a caching layer that sits in between. The local database acts as the single source of truth — the UI always reads from Room, and the repository syncs Room with the server in the background.

#### Q2: What is the difference between offset-based and cursor-based pagination?

Offset-based pagination uses a page number or offset (`?page=2&limit=20`). It's simple but breaks when items are inserted or deleted — you can skip posts or see duplicates because the offset shifts. Cursor-based pagination uses an opaque cursor (usually the ID or timestamp of the last fetched item) to request the next batch (`?after=abc123&limit=20`). The cursor points to a stable position in the dataset, so insertions and deletions don't cause skipped or duplicated items.

For a social media feed, cursor-based pagination is the standard approach because feed content changes frequently.

#### Q3: What is keyset pagination and how is it different from cursor pagination?

Keyset pagination is a specific type of cursor pagination where the cursor is a combination of sort columns. Instead of an opaque token, you pass the last item's sort values — like `?created_before=2024-01-15T10:30:00Z&id_lt=5432`. The server uses a `WHERE created_at < ? OR (created_at = ? AND id < ?)` query, which is indexed and fast.

The advantage over opaque cursors is that keyset pagination is stateless on the server — there's no need to store cursor state. The tradeoff is that it only works for deterministic sort orders. If your feed is ranked by a changing algorithm, opaque cursors that encode the feed state work better.

#### Q4: How do you implement infinite scroll on Android?

Attach a scroll listener to RecyclerView or use LazyColumn's scroll state. When the user scrolls near the bottom (typically within 5-10 items of the end), trigger a load of the next page. The ViewModel manages pagination state — current cursor, whether more pages exist, and loading state.

```kotlin
@Composable
fun FeedScreen(viewModel: FeedViewModel) {
    val feedState by viewModel.feedState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    LaunchedEffect(listState) {
        snapshotFlow {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = listState.layoutInfo.totalItemsCount
            lastVisible >= totalItems - 5
        }
        .distinctUntilChanged()
        .filter { it }
        .collect { viewModel.loadNextPage() }
    }

    LazyColumn(state = listState) {
        items(feedState.posts) { post -> FeedPostItem(post) }
        if (feedState.isLoadingMore) {
            item { LoadingIndicator() }
        }
    }
}
```

The key detail is `distinctUntilChanged()` and the threshold of 5 items — it prevents repeated triggers and gives the network call time to complete before the user reaches the actual end.

#### Q5: How do you implement pull-to-refresh?

Pull-to-refresh reloads the feed from the top. On the client, it fetches page 1 again (or uses a "newer than" cursor) and replaces the cached data. In Compose, use `PullToRefreshBox`. In the View system, use `SwipeRefreshLayout`.

The important detail is what happens to the scroll position. If the user pulled to refresh, they expect to see new content at the top. Clear the existing list and insert new items, or prepend new items and scroll to position 0. If you're using Room as the source of truth, the approach is to delete stale data and insert the fresh page, and the Flow from Room automatically updates the UI.

#### Q6: What caching strategy would you use for a feed?

A two-layer cache works well — an in-memory cache for instant access and a disk cache (Room database) for persistence across app restarts. The in-memory cache is the ViewModel or a repository-scoped map that holds the current feed state. The disk cache is Room, where each feed item is stored with its cursor position and timestamp.

On app launch, show cached data from Room immediately (so the user sees something fast), then fetch fresh data from the server in the background. When fresh data arrives, update Room, and the UI updates automatically through Flow observation. This is the stale-while-revalidate pattern.

#### Q7: What is stale-while-revalidate, and how do you implement it on mobile?

Stale-while-revalidate means showing cached (potentially stale) data immediately while fetching fresh data in the background. The user sees content instantly instead of staring at a loading spinner. When the fresh data arrives, the UI updates seamlessly.

```kotlin
class FeedRepository(
    private val feedApi: FeedApi,
    private val feedDao: FeedDao
) {
    fun getFeed(): Flow<List<FeedPost>> {
        return feedDao.observeFeed() // Emit cached data immediately
            .onStart { refreshFeed() } // Trigger network refresh
    }

    private suspend fun refreshFeed() {
        try {
            val freshPosts = feedApi.getFeed(limit = 20)
            feedDao.clearAndInsert(freshPosts.toEntities())
        } catch (e: IOException) {
            // Silently fail — cached data is already showing
        }
    }
}
```

The tradeoff is that the user might see outdated content for a moment. For time-sensitive feeds (breaking news), you might show a subtle banner — "New posts available" — instead of silently swapping content.

#### Q8: How would you handle image loading in a feed?

Use a library like Coil or Glide. These handle memory caching, disk caching, request deduplication, lifecycle awareness, and image transformations. For a feed specifically, a few things matter. Preload images for the next few items before they scroll into view. Use appropriately sized images — request thumbnails for the list, full-size only on detail screens. Set fixed dimensions on image views to avoid layout jumps when images load.

In Compose with Coil, `AsyncImage` handles most of this. For prefetching, enqueue image requests for items that are about to become visible based on the scroll position.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How would you implement optimistic updates for a like button?

Optimistic updates mean updating the UI immediately without waiting for the server response. When the user taps like, flip the state in the local database and update the UI right away. Send the API request in the background. If the request fails, revert the local state.

```kotlin
class LikeRepository(
    private val feedApi: FeedApi,
    private val feedDao: FeedDao
) {
    suspend fun toggleLike(postId: String, currentlyLiked: Boolean) {
        val newLiked = !currentlyLiked
        // Update locally first — UI reflects this immediately
        feedDao.updateLikeStatus(postId, newLiked)

        try {
            if (newLiked) feedApi.likePost(postId)
            else feedApi.unlikePost(postId)
        } catch (e: Exception) {
            // Revert on failure
            feedDao.updateLikeStatus(postId, currentlyLiked)
        }
    }
}
```

This pattern creates a responsive experience — the like button responds in under 16ms instead of waiting 200-500ms for a network round trip. The revert case is rare on a stable connection, so the occasional flicker on failure is an acceptable tradeoff for the perceived speed.

#### Q10: How would you design the feed to work offline?

Make Room the single source of truth. The UI only observes Room, never directly consumes API responses. On launch, Room emits the cached feed instantly. When the network is available, the repository fetches fresh data and upserts it into Room. When offline, the user sees the last cached feed and can still interact with cached content.

For actions like likes or comments made offline, queue them in a pending actions table. When the network comes back, replay those actions using WorkManager. The pending state is reflected in the UI — show the like as applied locally but mark it as pending sync. `ConnectivityManager.NetworkCallback` detects network changes to trigger the sync.

#### Q11: How do you handle data freshness in a feed? When do you consider cached data too stale?

Define a staleness threshold based on the feed type. For a social media feed, data older than 5-10 minutes might be considered stale. Store a `lastFetchedAt` timestamp alongside the cached data. On app launch, if the cache is within the threshold, show it and refresh in the background. If it's beyond the threshold, show it but also show a loading indicator that fresh data is coming.

For feeds where recency is critical (news, stock prices), reduce the threshold or skip the cache entirely. For feeds that don't change often (saved posts, bookmarks), the threshold can be hours or even days. The staleness threshold should also factor in whether the feed screen was backgrounded or cold-started — a backgrounded feed might only need a delta refresh.

#### Q12: How would you implement feed prefetching?

Prefetching loads the next page of data before the user scrolls to the end. When the user is within N items of the bottom (where N is your prefetch distance, typically 5-10), trigger the next page load. You can also prefetch images for upcoming items using Coil's `ImageLoader.enqueue()`.

A more advanced approach prefetches based on scroll velocity. If the user is scrolling fast, increase the prefetch distance. If they're slowly reading, reduce it to save bandwidth. The tradeoff is battery and data consumption — aggressive prefetching on cellular networks wastes the user's data plan. Check `ConnectivityManager` for network type and adjust prefetch behavior accordingly.

#### Q13: How would you handle feed ranking or sorting on the client side?

Client-side ranking is limited because the server has signals the client doesn't — social graph data, engagement metrics across all users, content quality scores. But the client can do lightweight reranking. For example, boosting posts from users the current user interacts with frequently (based on local interaction history), or deprioritizing posts the user has already seen.

Store interaction signals locally — which users' posts the user taps on, how long they dwell on each post. Use these signals to adjust the order of items within a page. The server still controls the primary ranking, but the client applies a local adjustment layer. Keep this simple — a weighted score based on 2-3 signals. Complex ML models belong on the server.

#### Q14: How do you handle feed consistency when the user switches between tabs or navigates back?

The ViewModel survives configuration changes and tab switches, so the in-memory feed state persists. When the user navigates back to the feed, check the staleness threshold. If the data is still fresh, show it immediately with no loading state. If it's stale, show the cached data and refresh in the background.

The harder problem is positional consistency. When the user leaves and comes back, they should return to the same scroll position. In Compose, `LazyListState` handles this if the list key is stable. In RecyclerView, save the `LayoutManager` state in `onSaveInstanceState()`. If fresh data arrives while the user is away and items shift, use `DiffUtil` or Compose's key-based diffing to update content without resetting the scroll position.

#### Q15: How do you prevent the feed from growing unbounded in the local database?

Without cleanup, the feed table grows as the user scrolls through hundreds of pages. Set a maximum cache size — for example, keep only the latest 200 posts in Room. When inserting new posts, delete anything beyond the limit. You can also use an LRU strategy — keep posts that were recently viewed and evict the oldest unseen ones.

```kotlin
@Dao
interface FeedDao {
    @Transaction
    suspend fun insertAndTrim(posts: List<FeedPostEntity>, maxSize: Int = 200) {
        insertAll(posts)
        trimOldPosts(maxSize)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(posts: List<FeedPostEntity>)

    @Query("""
        DELETE FROM feed_posts WHERE id NOT IN (
            SELECT id FROM feed_posts ORDER BY cached_at DESC LIMIT :maxSize
        )
    """)
    suspend fun trimOldPosts(maxSize: Int)
}
```

The trim operation runs inside a transaction with the insert so the database stays consistent. Choose the max size based on typical user behavior — 200 posts covers most sessions without using excessive disk space.

#### Q16: How would you handle multiple feed types (home, trending, following) in the same app?

Each feed type gets its own cursor, its own pagination state, and its own cache key in Room. Add a `feedType` column to the feed table so all feeds can share the same table structure but be queried independently. Each tab's ViewModel manages its own `FeedPaginator` instance with an independent cursor.

For the repository, parameterize the feed type in every operation — `getFeed(type: FeedType)`, `refreshFeed(type: FeedType)`. Cache invalidation should also be per-feed — refreshing the "trending" feed shouldn't clear the "following" feed cache. The staleness thresholds might differ too — trending content changes rapidly, while a following feed is more stable.

#### Q17: How do you handle rate limiting and error states in a feed?

For rate limiting, respect HTTP 429 responses by backing off. Parse the `Retry-After` header if present. Implement exponential backoff — first retry after 1 second, then 2, then 4, with jitter to avoid thundering herd. Cap the max delay at 30-60 seconds.

For errors, distinguish between network errors (no connectivity — show cached data with an offline banner), server errors (5xx — show cached data with a retry button), and empty states (no posts — show a meaningful empty state, not a blank screen). The ViewModel should expose a sealed class that represents all possible states — `Loading`, `Success`, `Error(cachedData, errorType)` — so the UI can handle each case.

#### Q18: How do you design the data model for a feed post that supports multiple content types (text, image, video, poll, link preview)?

Use a sealed class or a type discriminator pattern. Each post has common fields (id, author, timestamp, like count) and type-specific fields. In Room, you can model this with a single table using nullable type-specific columns, or with a base table plus type-specific detail tables joined via a relationship.

```kotlin
data class FeedPost(
    val id: String,
    val author: UserSummary,
    val createdAt: Instant,
    val likeCount: Int,
    val isLiked: Boolean,
    val content: FeedContent
)

sealed class FeedContent {
    data class Text(val body: String) : FeedContent()
    data class Image(val body: String, val imageUrls: List<String>) : FeedContent()
    data class Video(val body: String, val videoUrl: String, val thumbnailUrl: String) : FeedContent()
    data class Poll(val question: String, val options: List<PollOption>) : FeedContent()
}
```

The single table approach with nullable columns is simpler and avoids joins. The polymorphic table approach is cleaner but adds query complexity. For most feed designs, the single table with a type discriminator column and a JSON blob for type-specific data works well.

#### Q19: How would you measure and optimize feed scroll performance?

Track frame rendering time using `FrameMetrics` API or Macrobenchmark. A smooth scroll means every frame renders within 16ms (60fps) or 8ms (120fps). Common bottlenecks in feed scroll performance are image decoding on the main thread (use async loading with Coil), complex view hierarchies (flatten layouts, use Compose), overdraw (use Layout Inspector to find overlapping backgrounds), and unnecessary recompositions in Compose (use stable keys, avoid unstable lambda captures).

For Compose specifically, mark data classes as `@Stable` or `@Immutable`, use `key` in `LazyColumn` items so Compose can skip unchanged items, and avoid passing lambdas that capture changing state. Profile with Compose compiler metrics to find functions that aren't skippable.

#### Q20: How would you design a real-time feed update system? Should new posts appear automatically?

There are two approaches — push and pull. Push uses a WebSocket or SSE connection to receive new post notifications in real time. Pull periodically polls the server for new posts (every 30-60 seconds). Push gives instant updates but requires a persistent connection that drains battery. Pull is simpler but has inherent latency.

For most social feeds, a hybrid works best. Use pull-to-refresh as the primary mechanism. Show a "New posts available" banner when new content is detected (via push notification or background poll) and let the user choose to load them. Auto-inserting posts while the user is reading is disorienting — it shifts the content they're looking at. Instagram and Twitter both use the banner approach for this reason.

### Common Follow-ups

- How would you handle deep linking to a specific post in the feed?
- What happens when the same post appears in multiple feeds — do you deduplicate in the database?
- How would you implement a "save for later" feature that works offline?
- How do you handle feed pagination when posts are deleted between page loads?
- What metrics would you track to measure feed health (load time, scroll FPS, error rate)?
- How would you A/B test different feed ranking algorithms on the client?
- How do you handle video autoplay in the feed without killing battery?
- What's the difference between a fan-out-on-write and fan-out-on-read feed architecture?
