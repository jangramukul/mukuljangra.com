---
title: "Design a News Feed / Social Media Feed"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 4
sequence: 58
description: "Feed-based screens are one of the most common system design questions in mobile interviews."
---

## Design a News Feed / Social Media Feed

Open Instagram, Twitter, LinkedIn — they all have a feed. It looks simple on the surface, but underneath it's one of the most layered mobile system design problems you'll face. This walks through how to build one from the mobile side, piece by piece.

#### What are the core features of a social media feed?

Think of the feed as a never-ending newspaper that writes itself. You scroll, more content appears, you react to it, and it keeps going. The core features are infinite scroll with pagination, liking and commenting on posts, support for mixed media types (text, images, video, polls), and pull-to-refresh to get the latest stuff. Most feeds also have stories at the top — ephemeral content that vanishes after 24 hours.

Here's the thing. A single feed isn't just one type of content repeating. It's text posts, image carousels, videos, polls, and shared links — all rendering differently but scrolling together in one unified stream. That mix is what makes feed design interesting.

#### What are the non-functional requirements?

Three things matter. Performance on low-end devices — the feed must scroll at 60fps even on budget phones with limited RAM. Offline support — the user should see cached posts with no network, and actions like likes should queue for later sync. Fast initial load — show content within 1-2 seconds of opening the app, which means serving cached data instantly while refreshing in the background.

Real-time updates matter, but not at the cost of battery. A persistent WebSocket draining the battery is like leaving every faucet running just in case you want water. A combination of pull-to-refresh and lightweight push notifications handles it way better.

#### What's in scope and what's out of scope for this design?

In scope: the feed screen itself — rendering posts, pagination, caching, offline behavior, like/comment interactions, and media loading. Out of scope: the backend ranking algorithm (assume the server returns a ranked feed), the post creation flow, user profile screens, and the stories feature (it's a separate component sitting above the feed).

Keep the scope tight. Depth on the feed screen beats a shallow pass over the entire app.

#### What does the client architecture look like?

The architecture is layered, like a well-organized kitchen. The UI layer (LazyColumn or RecyclerView) observes a ViewModel. The ViewModel holds feed state and delegates data operations to a repository. The repository coordinates between a remote API (Retrofit) and a local database (Room). Room is the single source of truth — the UI always reads from Room, never directly from the API.

Data flows one way. The UI triggers an action (load more, refresh, like), the ViewModel calls the repository, the repository updates Room, and Room emits the updated data through a Flow the UI observes. It's like a one-way conveyor belt — things only move forward, which makes the whole system predictable and testable.

> **🧠 Think about it:** Why is Room the source of truth instead of just caching API responses in memory? What happens when the process dies mid-scroll?

#### How do you design the API for feed pagination?

Cursor-based pagination. The server returns a page of posts along with a cursor pointing to the next page. The client sends that cursor back to get the next batch.

```kotlin
// Request: GET /feed?cursor=abc123&limit=20
// Response:
data class FeedResponse(
    val posts: List<FeedPostDto>,
    val nextCursor: String?,
    val hasMore: Boolean
)
```

Yeah, this trips up everyone. Why not offset-based (`?page=2&limit=20`)? Because offset pagination is like numbering seats in a movie theater where people keep getting up and sitting down. If items are inserted or deleted between requests, the offset shifts — you get duplicates or skip posts entirely. Cursor-based pagination points to a stable position in the dataset, so it handles feed mutations gracefully. The cursor is typically an opaque token encoding the last item's timestamp and ID.

#### How do you model a feed item that supports multiple content types?

Sealed classes are your friend here. Every post shares common fields — id, author, timestamp, like count — but the content varies by type.

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
    data class Image(val body: String, val urls: List<String>) : FeedContent()
    data class Video(val body: String, val videoUrl: String, val thumbnail: String) : FeedContent()
    data class Poll(val question: String, val options: List<PollOption>) : FeedContent()
}
```

For Room storage, the simplest approach is a single table with a `type` discriminator column and a JSON column for type-specific data (using a TypeConverter). No joins, queries stay simple. The polymorphic table approach (base table + type-specific tables) is cleaner relationally but adds query complexity that's rarely worth it for a feed.

#### What caching strategy works best for a feed?

Room acts as the source of truth. On app launch, Room emits cached posts immediately through a Flow — the user sees content within milliseconds. Meanwhile, the repository fetches fresh data from the API in the background. When fresh data arrives, it's upserted into Room, and the Flow automatically pushes the update to the UI.

This is the stale-while-revalidate pattern. Think of it like a restaurant that serves you bread immediately while your actual meal is being cooked.

```kotlin
class FeedRepository(
    private val api: FeedApi,
    private val dao: FeedDao
) {
    fun observeFeed(): Flow<List<FeedPost>> {
        return dao.observeAll()
            .onStart { refreshFromNetwork() }
    }

    private suspend fun refreshFromNetwork() {
        try {
            val response = api.getFeed(limit = 20)
            dao.clearAndInsert(response.posts.toEntities())
        } catch (e: IOException) {
            // Cached data is already showing — fail silently
        }
    }
}
```

The tradeoff is the user might see slightly outdated content for a moment. For most social feeds, that's perfectly fine. For time-sensitive content, show a "New posts available" banner instead of silently swapping items under the user's eyes.

#### How do you handle image loading in the feed?

Use Coil or Glide. They handle memory caching, disk caching, request deduplication, and lifecycle-aware cancellation out of the box. For a feed, three details matter:

- Request thumbnail-sized images for the list — don't download full-resolution photos
- Set fixed dimensions on image containers so the layout doesn't jump when images load
- Prefetch images for the next few off-screen items based on scroll position using `ImageLoader.enqueue()`

In Compose, `AsyncImage` with a `placeholder` and `crossfade` handles the common case. The real optimization is on the server side — serving multiple resolutions and letting the client pick the right size based on the view's dimensions and the device's screen density.

#### How do you handle pull-to-refresh and real-time updates?

Pull-to-refresh fetches the first page again and replaces the cached feed. In Compose, wrap the list with `PullToRefreshBox`. The repository clears stale data, inserts the fresh page into Room, and the Flow updates the UI. Scroll to position 0 after refresh completes — the user expects new content at the top.

Plot twist: for real-time updates, you don't want a live connection pushing posts into the feed while someone's reading. That shifts the content they're looking at and feels disorienting. Instead, use FCM push notifications to detect new content, then show a "New posts" banner at the top. When the user taps it, fetch and prepend the new posts. Instagram and Twitter both use this banner pattern.

> **🧠 Think about it:** What would happen if you auto-inserted new posts while the user is mid-scroll? How would that affect the scroll position and reading experience?

#### How do you optimize RecyclerView or LazyColumn performance for a feed?

For RecyclerView, the big wins are:

- Stable IDs (`setHasStableIds(true)`)
- `DiffUtil` for efficient updates
- View holder recycling across multiple view types
- Flattening complex nested layouts
- `RecycledViewPool` for nested RecyclerViews (like a horizontal image carousel inside a feed item)

For LazyColumn, use stable keys on every item so Compose can skip recomposition for unchanged posts. Mark your data classes as `@Immutable` or `@Stable`. Avoid passing unstable lambdas — extract click handlers to the ViewModel level.

```kotlin
LazyColumn(state = listState) {
    items(
        items = posts,
        key = { it.id }
    ) { post ->
        FeedPostCard(
            post = post,
            onLikeClick = { viewModel.toggleLike(post.id) }
        )
    }
}
```

Here's the thing. Profile with the Compose compiler metrics to find composables that aren't skippable. A single non-skippable item in a list of 100 posts means 100 unnecessary recompositions on every state change. That's like repainting every room in the house because you changed one lightbulb.

#### How does prefetching work for both data and images?

Data prefetching triggers the next page load before the user reaches the end. Monitor the scroll position and fire the request when the user is within 5-10 items of the bottom. The ViewModel tracks the current cursor and whether a request is already in flight to avoid duplicate calls.

```kotlin
LaunchedEffect(listState) {
    snapshotFlow {
        val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
        val total = listState.layoutInfo.totalItemsCount
        lastVisible >= total - 5
    }
    .distinctUntilChanged()
    .filter { it }
    .collect { viewModel.loadNextPage() }
}
```

For image prefetching, enqueue Coil requests for items just beyond the visible area. A more advanced approach adjusts the prefetch distance based on scroll velocity — fast flings get a larger window, slow browsing gets a smaller one. It's like a waiter who brings more napkins when they see you eating ribs versus a salad. On metered connections, reduce or disable image prefetching to save the user's data.

#### How do you implement optimistic UI for the like button?

Update Room immediately when the user taps like. The Flow emits the updated state and the UI reflects it in under 16ms. Then fire the API request in the background. If it fails, revert the local state.

```kotlin
class LikeRepository(
    private val api: FeedApi,
    private val dao: FeedDao
) {
    suspend fun toggleLike(postId: String, currentlyLiked: Boolean) {
        val newState = !currentlyLiked
        dao.updateLikeStatus(postId, newState)
        try {
            if (newState) api.likePost(postId) else api.unlikePost(postId)
        } catch (e: Exception) {
            dao.updateLikeStatus(postId, currentlyLiked)
        }
    }
}
```

The revert case is rare on a stable connection, so the occasional flicker on failure is an acceptable tradeoff for perceived responsiveness. Apply the same pattern to bookmark, follow, and other toggle actions. For comments, optimistic UI is trickier because the server assigns the comment ID — show the comment locally with a temporary ID and replace it when the server responds.

#### How would you handle video autoplay in the feed?

Track which item is most visible on screen using the scroll state. When a video post becomes more than 50% visible, start playback. When it scrolls out, pause it. Only one video plays at a time.

Use ExoPlayer with a shared player instance. Creating a new ExoPlayer per video item is like hiring a new chef for every order — way too expensive. The feed maintains a single player reference and binds it to whichever video item is currently in the viewport. When the user scrolls to a new video, detach the player from the old item and attach it to the new one.

Mute by default — autoplay with sound is hostile UX. Preload the first few seconds of upcoming videos so playback starts instantly when they scroll into view. On cellular networks, consider lowering the video resolution or disabling autoplay entirely and showing a tap-to-play overlay instead.

#### How do you handle multiple view types in a feed?

Each content type gets its own composable (or view holder in RecyclerView). In Compose, use a `when` block to pick the right composable based on the sealed class type. In RecyclerView, override `getItemViewType()` and create the corresponding view holder in `onCreateViewHolder()`.

```kotlin
@Composable
fun FeedItem(post: FeedPost) {
    Column {
        AuthorHeader(post.author, post.createdAt)
        when (val content = post.content) {
            is FeedContent.Text -> TextPostBody(content)
            is FeedContent.Image -> ImageCarousel(content)
            is FeedContent.Video -> VideoPlayer(content)
            is FeedContent.Poll -> PollCard(content)
        }
        ActionBar(post.likeCount, post.isLiked)
    }
}
```

The shared parts — author header, action bar — stay the same across all types. Only the content body swaps out. It's like a sandwich where the bread is always the same, but the filling changes. This keeps the code manageable and avoids duplicating common layout logic across every post type.

#### How do you handle offline caching with TTL?

Store a `cachedAt` timestamp with every feed item in Room. On app launch, check the age of the cached data. If it's within the TTL (5-10 minutes for a social feed), show it and refresh in the background. If it's beyond the TTL, still show it — stale content is better than a blank screen — but also show a loading indicator to signal that fresh data is coming.

For cache cleanup, run a periodic trim. Keep the latest 200-300 posts and delete anything older. This prevents the database from growing unbounded as the user scrolls through hundreds of pages across sessions.

```kotlin
@Query("""
    DELETE FROM feed_posts WHERE id NOT IN (
        SELECT id FROM feed_posts ORDER BY cached_at DESC LIMIT :maxSize
    )
""")
suspend fun trimOldPosts(maxSize: Int)
```

The TTL should vary by context. A "Following" feed can have a longer TTL because it changes less often. A "Trending" feed needs a shorter one because the content is time-sensitive.

> **🧠 Think about it:** Why show stale content instead of a loading spinner? What does that tell you about the tradeoff between data freshness and perceived performance?

#### How do you track analytics events in a feed?

Two categories: impressions and interactions. An impression fires when a post is visible for at least 1 second (filters out fast scrolls). An interaction fires on like, comment, share, or tap to expand.

For impressions, use the scroll state to determine which items are on screen and start a timer. If the item is still visible after the threshold, log it. Batch events locally and flush them every 30 seconds or on app background to reduce network calls. Store unsent events in Room so they survive process death.

Each event carries the post ID, position in feed, content type, timestamp, and session ID. This data feeds the backend ranking algorithm — posts with higher engagement get surfaced more. On the client side, keep the analytics layer decoupled from the feed logic. An `AnalyticsTracker` interface injected into the ViewModel keeps the feed code clean and testable.

#### How do you deep link to a specific post in the feed?

A deep link like `myapp://feed/post/abc123` opens the post detail screen directly. Parse the URI in your navigation graph, extract the post ID, and navigate to the detail screen. The detail screen fetches the post by ID — first from Room (instant if cached), then from the API if needed.

The harder case is scrolling to a specific post within the feed. If the post is already loaded, use `LazyListState.animateScrollToItem()` with its index. If it's not loaded yet, you have two options — load the feed from that post's position using a cursor, or open the post in a standalone detail screen. The standalone screen is simpler and more reliable.

#### How do you make the feed accessible?

Every post needs a meaningful content description. Images need `contentDescription` that describes what's in the photo, not just "image." The like button should announce its state — "Like, double tap to like" or "Liked, double tap to unlike." Interactive elements need minimum touch targets of 48dp.

For screen readers, group related elements. The author name, timestamp, post body, and action buttons should form a logical reading order. In Compose, use `semantics` with `mergeDescendants` to group the author header, and keep action buttons as separate focusable elements. Support dynamic text sizing — the feed layout should handle font scale up to 200% without breaking.

### Common Follow-ups

- What happens when the same post appears in multiple feeds — do you deduplicate in the database?
- How would you implement a "save for later" feature that works offline?
- How do you handle feed pagination when posts are deleted between page loads?
- What metrics would you track to measure feed health (load time, scroll FPS, error rate)?
- How would you A/B test different feed ranking algorithms on the client?
- What's the difference between a fan-out-on-write and fan-out-on-read feed architecture?
- How do you handle feed consistency when the user switches between tabs or navigates back?
