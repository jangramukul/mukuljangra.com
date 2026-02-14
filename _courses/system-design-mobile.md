---
title: "System Design for Mobile"
layout: course
description: "Design scalable Android apps — offline-first architecture, caching strategies, pagination, data sync, modularization, and real-world system design patterns."
icon: "🏗️"
color: "#fbbf24"
difficulty: "Intermediate to Expert"
modules: 8
lessons: 38
duration: "5 weeks"
order: 10
tags:
  - System Design
  - Architecture
  - Android
what_you_learn:
  - "Design offline-first architectures with single source of truth"
  - "Implement multi-layer caching — memory, disk, and network"
  - "Build scalable pagination with Paging 3 and RemoteMediator"
  - "Handle data sync, conflict resolution, and write queues"
  - "Modularize Android projects by feature and layer"
  - "Design real-world systems — chat apps, feeds, e-commerce"
prerequisites:
  - "Kotlin and coroutines proficiency"
  - "Android architecture experience (MVVM, Repository)"
  - "Room and Retrofit familiarity"
---

## Module 1: Thinking in Systems

### Lesson 1.1: Mobile vs Backend System Design

Mobile system design differs from backend design in fundamental ways:
- **Unreliable network** — You must design for offline, slow, and intermittent connections
- **Resource constraints** — Limited memory, battery, and storage
- **User experience** — Users expect instant responses, not loading spinners
- **State management** — Multiple sources of truth (local DB, remote API, in-memory cache)

The best mobile architectures embrace these constraints instead of fighting them.

### Lesson 1.2: The Architecture Decision Framework

Before building any feature, answer these questions:
1. **Data flow** — Where does data come from? Where does it go? How often does it change?
2. **Offline behavior** — What happens with no network? Partial network?
3. **Consistency** — How stale can data be? Does it need real-time sync?
4. **Scale** — How many items? How much data? How many concurrent operations?
5. **Error handling** — What can fail? How do you recover? What does the user see?

**Key takeaway:** System design is about making intentional tradeoffs. Every decision has a cost. The goal is to pick the right tradeoffs for your specific app and users.

### Quiz: Thinking in Systems

#### In mobile system design, why is the local database preferred as the single source of truth over the remote API?

- ❌ The local database always has the most up-to-date data
- ❌ Remote APIs are slower to implement than local databases
- ✅ The local database is available offline and provides instant reads, while the API may be unavailable
- ❌ Local databases use less storage than remote servers

> **Explanation:** The local database is preferred because it's always accessible regardless of network state and provides instant reads. The remote API supplements it by pushing fresh data into the database when available.

#### Which of the following is NOT a key difference between mobile and backend system design?

- ❌ Unreliable network connectivity
- ❌ Limited device resources like memory and battery
- ✅ The need to use relational databases instead of NoSQL
- ❌ Managing multiple sources of truth (local DB, remote API, in-memory cache)

> **Explanation:** The choice between relational and NoSQL databases is not a distinguishing factor between mobile and backend design. The real differences are unreliable networks, resource constraints, and managing multiple data sources.

#### When designing a new feature, what should you consider FIRST according to the Architecture Decision Framework?

- ✅ Where does data come from, where does it go, and how often does it change
- ❌ Which UI framework to use for the screens
- ❌ How to structure the CI/CD pipeline
- ❌ Which third-party analytics SDK to integrate

> **Explanation:** Data flow is the first question in the Architecture Decision Framework because every architectural decision flows from understanding your data — its source, destination, and change frequency.

### Coding Challenge: Architecture Decision Document

Write a Kotlin sealed class hierarchy that models the different states a screen can be in when loading data from a repository that supports offline-first architecture. The states should cover loading, success with data, error with optional cached data, and offline with stale data.

#### Solution

```kotlin
sealed class ScreenState<out T> {
    object Loading : ScreenState<Nothing>()

    data class Success<T>(
        val data: T,
        val isFromCache: Boolean = false,
    ) : ScreenState<T>()

    data class Error(
        val exception: Throwable,
        val cachedData: Any? = null,
    ) : ScreenState<Nothing>()

    data class Offline<T>(
        val staleData: T,
        val lastUpdated: Long,
    ) : ScreenState<T>()
}
```

This sealed class covers all the states a screen needs in an offline-first architecture: initial loading, success (distinguishing fresh vs cached), error (with optional fallback data), and offline mode showing stale data with a timestamp so the UI can inform the user.

---

## Module 2: Offline-First Architecture

### Lesson 2.1: The Single Source of Truth Pattern

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao,
    private val ioDispatcher: CoroutineDispatcher,
) {
    // Database is the single source of truth
    fun observeUser(id: String): Flow<User> = dao.observeById(id)

    // Network refreshes update the database, which updates the UI
    suspend fun refreshUser(id: String) = withContext(ioDispatcher) {
        val networkUser = api.getUser(id)
        dao.upsert(networkUser.toEntity())
    }

    // Combined: emit cached data immediately, then refresh
    fun getUserStream(id: String): Flow<Resource<User>> = flow {
        emit(Resource.Loading)

        // Emit cached data if available
        val cached = dao.getById(id)
        if (cached != null) {
            emit(Resource.Success(cached.toDomain()))
        }

        // Refresh from network
        try {
            refreshUser(id)
        } catch (e: IOException) {
            if (cached == null) emit(Resource.Error(e))
            // If cached data exists, silently fail — user sees stale data
        }

        // Emit fresh data from database
        emitAll(dao.observeById(id).map { Resource.Success(it.toDomain()) })
    }
}
```

### Lesson 2.2: Offline Write Queue

```kotlin
class OfflineWriteQueue(
    private val writeDao: PendingWriteDao,
    private val api: UserApi,
    private val connectivityMonitor: ConnectivityMonitor,
) {
    // Queue a write operation for later sync
    suspend fun enqueue(operation: WriteOperation) {
        writeDao.insert(operation.toEntity())
    }

    // Process queue when network is available
    fun startProcessing(): Flow<SyncStatus> = connectivityMonitor.isConnected
        .filter { it }
        .flatMapLatest { processQueue() }

    private fun processQueue(): Flow<SyncStatus> = flow {
        val pendingWrites = writeDao.getAllPending()
        emit(SyncStatus.Syncing(pendingWrites.size))

        pendingWrites.forEach { write ->
            try {
                executeWrite(write)
                writeDao.markCompleted(write.id)
            } catch (e: Exception) {
                writeDao.markFailed(write.id, e.message)
                emit(SyncStatus.Error(write, e))
            }
        }
        emit(SyncStatus.Complete)
    }
}
```

**Key takeaway:** Local database is the source of truth. Writes go to a queue and sync when network is available. The UI always reflects the local state, with sync status shown separately.

### Quiz: Offline-First Architecture

#### What is the primary benefit of the Single Source of Truth pattern in mobile apps?

- ❌ It eliminates the need for a network layer entirely
- ✅ It prevents inconsistent UI states by having one authoritative data source
- ❌ It makes the app faster by avoiding database operations
- ❌ It removes the need for error handling in the repository

> **Explanation:** The Single Source of Truth pattern ensures the UI always reads from one place (the local database), preventing inconsistencies that arise when the UI reads from multiple sources (API, cache, database) that may have different data.

#### In the Offline Write Queue pattern, what happens when a write operation fails during sync?

- ❌ The local data is rolled back to its previous state
- ❌ The write is discarded and the user is notified
- ✅ The write is marked as failed in the queue and can be retried later
- ❌ The entire sync queue is cleared and restarted

> **Explanation:** Failed writes are marked as failed with an error message, not discarded. This preserves the user's intent and allows retry — either automatic or manual — when conditions improve.

#### Why does the `getUserStream` method emit cached data before attempting a network refresh?

- ❌ Because cached data is always more accurate than network data
- ✅ To show the user data instantly while fresher data loads in the background
- ❌ Because the network call might return the same data
- ❌ To reduce the number of database queries

> **Explanation:** Emitting cached data first provides instant UI response. The user sees something immediately rather than a loading spinner, and the data silently updates when the network response arrives — this is the core of offline-first UX.

### Coding Challenge: Retry-Aware Write Queue

Implement a `RetryableWriteQueue` that tracks retry attempts for each operation and gives up after a maximum number of retries, moving failed operations to a dead-letter list.

#### Solution

```kotlin
data class WriteOperation(
    val id: String = UUID.randomUUID().toString(),
    val payload: String,
    val retryCount: Int = 0,
    val maxRetries: Int = 3,
)

class RetryableWriteQueue {
    private val pending = mutableListOf<WriteOperation>()
    private val deadLetter = mutableListOf<WriteOperation>()

    fun enqueue(operation: WriteOperation) {
        pending.add(operation)
    }

    suspend fun processAll(execute: suspend (WriteOperation) -> Unit) {
        val snapshot = pending.toList()
        pending.clear()

        snapshot.forEach { op ->
            try {
                execute(op)
            } catch (e: Exception) {
                val updated = op.copy(retryCount = op.retryCount + 1)
                if (updated.retryCount >= updated.maxRetries) {
                    deadLetter.add(updated)
                } else {
                    pending.add(updated)
                }
            }
        }
    }

    fun getDeadLetterOperations(): List<WriteOperation> = deadLetter.toList()
    fun getPendingCount(): Int = pending.size
}
```

This queue tracks retry counts per operation and moves permanently failed operations to a dead-letter list after exceeding the max retry limit, preventing infinite retry loops while preserving failed operations for debugging or manual resolution.

---

## Module 3: Caching Strategies

### Lesson 3.1: Cache Layers

```
┌─────────────┐    ┌───────────────┐    ┌──────────────┐
│  In-Memory   │ ←→ │  Disk (Room)   │ ←→ │   Network    │
│   Cache      │    │   Database     │    │   (API)      │
│  (fastest)   │    │  (persistent)  │    │  (freshest)  │
└─────────────┘    └───────────────┘    └──────────────┘
```

```kotlin
class CachedUserRepository(
    private val api: UserApi,
    private val dao: UserDao,
) {
    // In-memory cache for hot data
    private val memoryCache = LruCache<String, User>(maxSize = 100)

    suspend fun getUser(id: String): User {
        // Layer 1: Memory cache (instant)
        memoryCache.get(id)?.let { return it }

        // Layer 2: Disk cache (fast)
        dao.getById(id)?.let { entity ->
            val user = entity.toDomain()
            memoryCache.put(id, user)
            return user
        }

        // Layer 3: Network (slow but fresh)
        val networkUser = api.getUser(id)
        dao.upsert(networkUser.toEntity())
        memoryCache.put(id, networkUser)
        return networkUser
    }
}
```

### Lesson 3.2: Cache Invalidation

```kotlin
class CachePolicy(
    private val maxAgeMs: Long = 5 * 60 * 1000, // 5 minutes
) {
    fun isExpired(lastFetchedAt: Long): Boolean {
        return System.currentTimeMillis() - lastFetchedAt > maxAgeMs
    }
}

class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao,
    private val cachePolicy: CachePolicy,
) {
    suspend fun getProducts(forceRefresh: Boolean = false): List<Product> {
        val cached = dao.getAll()
        val lastFetched = dao.getLastFetchTimestamp()

        // Return cache if fresh and not forced
        if (!forceRefresh && cached.isNotEmpty() && !cachePolicy.isExpired(lastFetched)) {
            return cached.map { it.toDomain() }
        }

        // Refresh from network
        return try {
            val fresh = api.getProducts()
            dao.replaceAll(fresh.map { it.toEntity() })
            dao.updateFetchTimestamp(System.currentTimeMillis())
            fresh
        } catch (e: IOException) {
            if (cached.isNotEmpty()) cached.map { it.toDomain() }
            else throw e
        }
    }
}
```

**Key takeaway:** Cache invalidation is one of the two hard problems in computer science. Use time-based expiry for simplicity. Offer pull-to-refresh for user-triggered invalidation. Never show stale data without indicating it might be outdated.

### Quiz: Caching Strategies

#### In a multi-layer cache architecture (memory → disk → network), what happens when data is found in the disk cache?

- ❌ The network is still called to verify freshness
- ✅ The data is returned from disk and also promoted to the memory cache
- ❌ The memory cache is cleared to save resources
- ❌ The disk cache entry is deleted after reading

> **Explanation:** When data is found in the disk layer, it's returned immediately and also placed into the memory cache (cache promotion). This ensures subsequent reads for the same data hit the fastest layer.

#### What is the main risk of using time-based cache expiry?

- ❌ It uses too much memory to store timestamps
- ❌ It requires server-side changes to implement
- ✅ Data might be stale within the TTL window or unnecessarily refetched when unchanged
- ❌ It prevents users from seeing any data while offline

> **Explanation:** Time-based expiry is a tradeoff — within the TTL window, the app may show outdated data, and after expiry it refetches even if the data hasn't changed. More sophisticated strategies like ETags can help but add complexity.

#### In the `getProducts` method, why does the code return cached data when a network call throws an IOException?

- ❌ Because IOExceptions indicate the data hasn't changed on the server
- ❌ Because the cached data is always accurate enough
- ✅ Because showing stale data is a better user experience than showing an error
- ❌ Because IOExceptions are not real errors

> **Explanation:** When the network fails and cached data exists, returning stale data provides a graceful degradation. The user can still use the app with slightly outdated data rather than seeing an error screen — this is a core offline-first principle.

### Coding Challenge: LRU Cache with TTL

Implement a generic in-memory LRU cache that supports time-based expiry. Each entry should expire after a configurable TTL, and the cache should evict the least recently used entry when full.

#### Solution

```kotlin
class LruCacheWithTtl<K, V>(
    private val maxSize: Int,
    private val ttlMs: Long,
) {
    private data class CacheEntry<V>(
        val value: V,
        val insertedAt: Long = System.currentTimeMillis(),
    )

    // LinkedHashMap with accessOrder=true gives LRU behavior
    private val map = object : LinkedHashMap<K, CacheEntry<V>>(maxSize, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<K, CacheEntry<V>>): Boolean {
            return size > maxSize
        }
    }

    @Synchronized
    fun get(key: K): V? {
        val entry = map[key] ?: return null
        if (System.currentTimeMillis() - entry.insertedAt > ttlMs) {
            map.remove(key)
            return null
        }
        return entry.value
    }

    @Synchronized
    fun put(key: K, value: V) {
        map[key] = CacheEntry(value)
    }

    @Synchronized
    fun evictExpired() {
        val now = System.currentTimeMillis()
        map.entries.removeAll { now - it.value.insertedAt > ttlMs }
    }

    @Synchronized
    fun clear() = map.clear()
}
```

This combines LRU eviction (via `LinkedHashMap` with `accessOrder=true`) with TTL-based expiry. Entries are automatically evicted when the cache exceeds `maxSize`, and stale entries are detected on read and removed. The `evictExpired` method can be called periodically to proactively clean up.

---

## Module 4: Pagination

### Lesson 4.1: Paging 3 Architecture

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
) {
    fun getArticles(): Flow<PagingData<Article>> = Pager(
        config = PagingConfig(
            pageSize = 20,
            prefetchDistance = 5,
            enablePlaceholders = false,
        ),
        remoteMediator = ArticleRemoteMediator(api, dao),
        pagingSourceFactory = { dao.pagingSource() }
    ).flow
}
```

### Lesson 4.2: RemoteMediator for Offline Pagination

```kotlin
@OptIn(ExperimentalPagingApi::class)
class ArticleRemoteMediator(
    private val api: ArticleApi,
    private val dao: ArticleDao,
) : RemoteMediator<Int, ArticleEntity>() {

    override suspend fun load(
        loadType: LoadType,
        state: PagingState<Int, ArticleEntity>,
    ): MediatorResult {
        val page = when (loadType) {
            LoadType.REFRESH -> 1
            LoadType.PREPEND -> return MediatorResult.Success(endOfPaginationReached = true)
            LoadType.APPEND -> {
                val lastItem = state.lastItemOrNull()
                    ?: return MediatorResult.Success(endOfPaginationReached = true)
                lastItem.nextPage ?: return MediatorResult.Success(endOfPaginationReached = true)
            }
        }

        return try {
            val response = api.getArticles(page = page, size = state.config.pageSize)

            dao.withTransaction {
                if (loadType == LoadType.REFRESH) dao.clearAll()
                dao.insertAll(response.articles.map { it.toEntity(nextPage = response.nextPage) })
            }

            MediatorResult.Success(endOfPaginationReached = response.nextPage == null)
        } catch (e: IOException) {
            MediatorResult.Error(e)
        }
    }
}
```

### Lesson 4.3: Consuming PagingData in Compose

```kotlin
@Composable
fun ArticleListScreen(viewModel: ArticleViewModel = hiltViewModel()) {
    val articles = viewModel.articles.collectAsLazyPagingItems()

    LazyColumn {
        items(
            count = articles.itemCount,
            key = articles.itemKey { it.id },
        ) { index ->
            val article = articles[index]
            if (article != null) {
                ArticleCard(article)
            }
        }

        // Loading indicator at the bottom
        when (articles.loadState.append) {
            is LoadState.Loading -> item { LoadingIndicator() }
            is LoadState.Error -> item {
                RetryButton(onClick = { articles.retry() })
            }
            else -> {}
        }
    }
}
```

**Key takeaway:** Paging 3 with RemoteMediator gives you offline-capable pagination. The database is the source of truth for pages. The RemoteMediator fills the database from the network as the user scrolls.

### Quiz: Pagination

#### Why does the RemoteMediator return `MediatorResult.Success(endOfPaginationReached = true)` for `LoadType.PREPEND`?

- ❌ Because prepending data is not supported by Paging 3
- ✅ Because in a top-down feed, there is no need to load items before the first page
- ❌ Because prepend operations would cause data duplication
- ❌ Because the API doesn't support reverse pagination

> **Explanation:** In a typical feed or list that loads from the top, prepending (loading items before the first item) is unnecessary since a refresh already fetches the newest items. Returning `endOfPaginationReached = true` tells Paging 3 to stop trying to prepend.

#### What is the role of `prefetchDistance` in `PagingConfig`?

- ❌ It controls how many items are kept in memory at once
- ❌ It sets the maximum number of pages to cache on disk
- ✅ It determines how many items before the end of the loaded list trigger loading the next page
- ❌ It defines the delay in milliseconds between page loads

> **Explanation:** `prefetchDistance` tells Paging 3 to start loading the next page when the user is within that many items of the end of the currently loaded data. A value of 5 means the next page starts loading when there are 5 items left to scroll through.

#### Why does the RemoteMediator call `dao.clearAll()` only on `LoadType.REFRESH` and not on `APPEND`?

- ❌ Because `APPEND` operations don't modify the database
- ✅ Because `REFRESH` replaces all data with fresh results, while `APPEND` adds the next page to existing data
- ❌ Because clearing on `APPEND` would improve performance
- ❌ Because the database has a maximum row limit

> **Explanation:** On refresh, you want a clean slate with entirely fresh data from the server. On append, you're loading the next page of results that should be added to the existing data, not replace it.

### Coding Challenge: Cursor-Based Pagination

Implement a cursor-based `PagingSource` that uses a string cursor (instead of page numbers) for more stable pagination results. The cursor should be the ID of the last item on each page.

#### Solution

```kotlin
class CursorPagingSource(
    private val api: ArticleApi,
) : PagingSource<String, Article>() {

    override suspend fun load(params: LoadParams<String>): LoadResult<String, Article> {
        return try {
            val cursor = params.key // null for first page
            val response = api.getArticles(
                after = cursor,
                limit = params.loadSize,
            )

            LoadResult.Page(
                data = response.articles,
                prevKey = null, // No backward pagination
                nextKey = if (response.articles.isEmpty()) null
                          else response.articles.last().id,
            )
        } catch (e: IOException) {
            LoadResult.Error(e)
        } catch (e: HttpException) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<String, Article>): String? {
        // On refresh, start from the beginning
        return null
    }
}
```

Cursor-based pagination uses the last item's ID as the cursor for the next page, which is more stable than page-number pagination. If items are inserted or deleted between requests, page-number pagination can skip or duplicate items, while cursor-based pagination always picks up right where it left off.

---

## Module 5: Data Sync Strategies

### Lesson 5.1: Pull-Based Sync

```kotlin
class PullSyncManager(
    private val api: SyncApi,
    private val dao: SyncDao,
) {
    // Sync using server timestamps
    suspend fun sync() {
        val lastSyncTimestamp = dao.getLastSyncTimestamp() ?: 0L

        val changes = api.getChanges(since = lastSyncTimestamp)

        dao.withTransaction {
            changes.created.forEach { dao.insert(it.toEntity()) }
            changes.updated.forEach { dao.update(it.toEntity()) }
            changes.deleted.forEach { dao.deleteById(it.id) }
            dao.setLastSyncTimestamp(changes.serverTimestamp)
        }
    }

    // Schedule periodic sync
    fun schedulePeriodic(workManager: WorkManager) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(
            repeatInterval = 15,
            repeatIntervalTimeUnit = TimeUnit.MINUTES,
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "sync",
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}
```

### Lesson 5.2: Conflict Resolution

```kotlin
sealed class ConflictStrategy {
    object ServerWins : ConflictStrategy()
    object ClientWins : ConflictStrategy()
    object LastWriteWins : ConflictStrategy()
    object Manual : ConflictStrategy()
}

class ConflictResolver(private val strategy: ConflictStrategy) {
    fun resolve(local: SyncEntity, remote: SyncEntity): SyncEntity =
        when (strategy) {
            is ConflictStrategy.ServerWins -> remote
            is ConflictStrategy.ClientWins -> local
            is ConflictStrategy.LastWriteWins -> {
                if (local.modifiedAt > remote.modifiedAt) local else remote
            }
            is ConflictStrategy.Manual -> {
                // Flag for user resolution
                local.copy(hasConflict = true, conflictData = remote)
            }
        }
}
```

**Key takeaway:** Most apps can use "server wins" or "last write wins" conflict resolution. Manual conflict resolution (like Google Docs) is significantly more complex and rarely needed in mobile apps.

### Quiz: Data Sync Strategies

#### In pull-based sync, why is the server timestamp used instead of the client timestamp to track sync progress?

- ❌ Because client clocks are faster than server clocks
- ✅ Because client clocks can be inaccurate or manipulated, and the server is the authoritative time source
- ❌ Because server timestamps use a more efficient format
- ❌ Because client timestamps cannot be stored in databases

> **Explanation:** Client device clocks can be wrong, manually set, or in different time zones. Using the server timestamp as the sync anchor ensures consistency — every client agrees on "what changed since when" based on one authoritative clock.

#### Which conflict resolution strategy would you choose for a note-taking app where users edit on multiple devices?

- ❌ Server Wins — because server data is always correct
- ❌ Client Wins — because the user's latest device is always right
- ✅ Last Write Wins — because the most recent edit across all devices should prevail
- ❌ Manual — because every conflict needs user attention

> **Explanation:** Last Write Wins is the best pragmatic choice for a note-taking app. It preserves the most recent edit regardless of which device made it. Server Wins or Client Wins would arbitrarily discard valid edits. Manual resolution would annoy users with frequent conflict dialogs.

### Coding Challenge: Timestamp-Based Sync Tracker

Build a `SyncTracker` class that tracks the sync state for multiple entity types (e.g., users, products, orders), each with their own last-sync timestamp. It should support checking if a specific entity type needs syncing based on a configurable stale threshold.

#### Solution

```kotlin
class SyncTracker(
    private val staleThresholdMs: Long = 15 * 60 * 1000, // 15 minutes
) {
    private val syncTimestamps = mutableMapOf<String, Long>()

    fun recordSync(entityType: String, serverTimestamp: Long) {
        syncTimestamps[entityType] = serverTimestamp
    }

    fun needsSync(entityType: String): Boolean {
        val lastSync = syncTimestamps[entityType] ?: return true
        return System.currentTimeMillis() - lastSync > staleThresholdMs
    }

    fun getLastSyncTimestamp(entityType: String): Long? {
        return syncTimestamps[entityType]
    }

    fun getStaleEntities(): List<String> {
        return syncTimestamps.filter { (entityType, _) ->
            needsSync(entityType)
        }.keys.toList()
    }

    suspend fun syncIfNeeded(
        entityType: String,
        syncAction: suspend (lastTimestamp: Long?) -> Long,
    ) {
        if (needsSync(entityType)) {
            val lastTimestamp = syncTimestamps[entityType]
            val newTimestamp = syncAction(lastTimestamp)
            recordSync(entityType, newTimestamp)
        }
    }
}
```

This tracker manages sync state per entity type, making it easy to coordinate syncing across different data types. The `syncIfNeeded` method combines the check and sync into one call, passing the last timestamp to the sync action so it can request only changes since then.

---

## Module 6: Modularization

### Lesson 6.1: Module Types

```
:app                    → Application module (assembles everything)
:feature:home           → Home screen feature
:feature:profile        → Profile feature
:feature:search         → Search feature
:core:network           → Retrofit, OkHttp, API interfaces
:core:database          → Room, DAOs, entities
:core:domain            → Use cases, repository interfaces, domain models
:core:data              → Repository implementations
:core:ui                → Shared Compose components, theme
:core:common            → Utilities, extensions
:core:testing           → Shared test fakes, utilities
```

### Lesson 6.2: Dependency Rules

```kotlin
// ✅ Correct dependency direction
// :feature:profile depends on :core:domain (for interfaces)
// :core:data depends on :core:network + :core:database (for implementations)
// :app depends on everything (assembles the graph)

// ❌ Never allow
// :core:domain depends on :core:data (domain shouldn't know about data layer)
// :feature:home depends on :feature:profile (features shouldn't know each other)
```

```kotlin
// settings.gradle.kts
include(":app")
include(":feature:home")
include(":feature:profile")
include(":core:network")
include(":core:database")
include(":core:domain")
include(":core:data")
include(":core:ui")
include(":core:common")
```

### Lesson 6.3: Feature Module Structure

```
:feature:profile/
├── src/main/kotlin/com/yourapp/feature/profile/
│   ├── ProfileScreen.kt          (Compose UI)
│   ├── ProfileViewModel.kt       (ViewModel)
│   ├── ProfileNavigation.kt      (Navigation graph registration)
│   └── di/
│       └── ProfileModule.kt      (Feature-specific DI, if needed)
```

```kotlin
// ProfileNavigation.kt
fun NavGraphBuilder.profileScreen(
    onNavigateBack: () -> Unit,
) {
    composable("profile/{userId}") { backStackEntry ->
        val viewModel: ProfileViewModel = hiltViewModel()
        ProfileScreen(
            viewModel = viewModel,
            onNavigateBack = onNavigateBack,
        )
    }
}
```

**Key takeaway:** Features should be self-contained. They expose a navigation extension function and nothing else. This lets you add, remove, or refactor features without touching other modules.

### Quiz: Modularization

#### Why should `:feature:home` NOT depend on `:feature:profile`?

- ❌ Because Gradle doesn't allow feature-to-feature dependencies
- ✅ Because features should be independent so they can be developed, tested, and modified without affecting each other
- ❌ Because it would make the APK size too large
- ❌ Because feature modules can't contain navigation code

> **Explanation:** Feature-to-feature dependencies create tight coupling. If `:feature:home` depends on `:feature:profile`, changing profile might break home. Independent features allow parallel development by different teams and enable feature-level testing in isolation.

#### Why does `:core:domain` NOT depend on `:core:data`?

- ❌ Because domain and data modules use different languages
- ❌ Because it would create a Gradle build error
- ✅ Because the domain layer defines interfaces that the data layer implements — the dependency points inward
- ❌ Because the data layer is optional in Android projects

> **Explanation:** This follows the Dependency Inversion Principle. The domain layer defines repository interfaces and use cases using pure Kotlin. The data layer implements those interfaces with concrete details (Room, Retrofit). Dependencies always point inward toward the domain.

#### What is the primary benefit of exposing only a `NavGraphBuilder` extension function from a feature module?

- ❌ It makes the navigation animations smoother
- ✅ It minimizes the feature's public API surface, allowing internal changes without affecting other modules
- ❌ It eliminates the need for ViewModel in the feature
- ❌ It automatically generates deep links for the feature

> **Explanation:** By exposing only a navigation extension function, the feature hides all its internal details (screens, ViewModels, components). Other modules only know how to navigate to it, not how it works internally. This is encapsulation at the module level.

### Coding Challenge: Module Dependency Validator

Write a Kotlin function that validates module dependencies according to the rules: features can't depend on other features, domain can't depend on data, and no circular dependencies exist.

#### Solution

```kotlin
data class Module(
    val name: String,
    val type: ModuleType,
    val dependencies: Set<String>,
)

enum class ModuleType { APP, FEATURE, CORE_DOMAIN, CORE_DATA, CORE_OTHER }

class ModuleDependencyValidator {
    fun validate(modules: List<Module>): List<String> {
        val errors = mutableListOf<String>()
        val moduleMap = modules.associateBy { it.name }

        modules.forEach { module ->
            module.dependencies.forEach { dep ->
                val depModule = moduleMap[dep] ?: return@forEach

                // Rule 1: Features can't depend on other features
                if (module.type == ModuleType.FEATURE && depModule.type == ModuleType.FEATURE) {
                    errors.add("${module.name} → $dep: Feature cannot depend on another feature")
                }

                // Rule 2: Domain can't depend on data
                if (module.type == ModuleType.CORE_DOMAIN && depModule.type == ModuleType.CORE_DATA) {
                    errors.add("${module.name} → $dep: Domain cannot depend on data layer")
                }
            }

            // Rule 3: Check for circular dependencies
            if (hasCircularDependency(module.name, moduleMap, mutableSetOf())) {
                errors.add("${module.name}: Circular dependency detected")
            }
        }
        return errors
    }

    private fun hasCircularDependency(
        name: String,
        modules: Map<String, Module>,
        visited: MutableSet<String>,
    ): Boolean {
        if (name in visited) return true
        visited.add(name)
        val module = modules[name] ?: return false
        return module.dependencies.any { hasCircularDependency(it, modules, visited.toMutableSet()) }
    }
}
```

This validator enforces the three core modularization rules at build configuration time. It catches feature-to-feature dependencies, domain-to-data violations, and circular dependencies — all common mistakes that erode module boundaries over time.

---

## Module 7: Scalable Network Architecture

### Lesson 7.1: API Response Wrapper

```kotlin
sealed class NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>()
    data class Error(val code: Int, val message: String) : NetworkResult<Nothing>()
    data class Exception(val throwable: Throwable) : NetworkResult<Nothing>()
}

suspend fun <T> safeApiCall(apiCall: suspend () -> T): NetworkResult<T> =
    try {
        NetworkResult.Success(apiCall())
    } catch (e: HttpException) {
        NetworkResult.Error(e.code(), e.message())
    } catch (e: IOException) {
        NetworkResult.Exception(e)
    }
```

### Lesson 7.2: Retry and Backoff

```kotlin
suspend fun <T> retryWithBackoff(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 10000,
    factor: Double = 2.0,
    block: suspend () -> T,
): T {
    var currentDelay = initialDelayMs
    repeat(maxRetries) { attempt ->
        try {
            return block()
        } catch (e: IOException) {
            if (attempt == maxRetries - 1) throw e
            delay(currentDelay)
            currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelayMs)
        }
    }
    error("Unreachable") // Compiler needs this
}

// Usage
val user = retryWithBackoff { api.getUser(userId) }
```

### Lesson 7.3: Request Deduplication

```kotlin
class RequestDeduplicator {
    private val inFlightRequests = ConcurrentHashMap<String, Deferred<Any>>()

    @Suppress("UNCHECKED_CAST")
    suspend fun <T> deduplicate(
        key: String,
        block: suspend () -> T,
    ): T = coroutineScope {
        val existing = inFlightRequests[key]
        if (existing != null && existing.isActive) {
            return@coroutineScope existing.await() as T
        }

        val deferred = async { block() }
        inFlightRequests[key] = deferred as Deferred<Any>

        try {
            deferred.await()
        } finally {
            inFlightRequests.remove(key)
        }
    }
}

// Usage — 10 calls to getUser("1") at the same time only make 1 API request
val user = deduplicator.deduplicate("user-1") { api.getUser("1") }
```

**Key takeaway:** Wrap API calls with retry logic and exponential backoff. Deduplicate concurrent identical requests. These patterns prevent thundering herd problems and improve perceived performance.

### Quiz: Scalable Network Architecture

#### In the `safeApiCall` wrapper, why are `HttpException` and `IOException` handled differently?

- ❌ Because `HttpException` is more severe than `IOException`
- ✅ Because `HttpException` represents a server response with an error code, while `IOException` means the request never completed
- ❌ Because `IOException` only happens on Android, not on backend
- ❌ Because `HttpException` can be retried but `IOException` cannot

> **Explanation:** `HttpException` means the server responded with an error (4xx, 5xx) — you have a status code and message. `IOException` means the network request itself failed (no internet, timeout, DNS failure) — you have no server response. They require different handling and recovery strategies.

#### What problem does the `RequestDeduplicator` solve?

- ❌ It prevents the same user from making too many API calls per day
- ❌ It caches API responses to avoid network usage
- ✅ It prevents multiple concurrent identical requests from each making separate API calls
- ❌ It ensures API calls are made in sequential order

> **Explanation:** When multiple parts of an app simultaneously request the same data (e.g., 10 UI components all requesting the same user), the deduplicator ensures only one network request is made. All callers await the same in-flight request, preventing the thundering herd problem.

#### In exponential backoff, why is `coerceAtMost(maxDelayMs)` used to cap the delay?

- ❌ Because the system clock cannot handle large delay values
- ❌ Because exponential growth would eventually cause an integer overflow
- ✅ Because unbounded exponential growth would cause excessively long waits between retries
- ❌ Because the server requires requests within a specific time window

> **Explanation:** Without a cap, exponential growth (1s → 2s → 4s → 8s → 16s → 32s...) could lead to unreasonably long delays. Capping at `maxDelayMs` ensures retries remain practical while still providing backoff to avoid overwhelming a struggling server.

### Coding Challenge: Circuit Breaker Pattern

Implement a circuit breaker that stops making API calls after a threshold of consecutive failures, waits a cooldown period, then allows a single test request to check if the service has recovered.

#### Solution

```kotlin
class CircuitBreaker(
    private val failureThreshold: Int = 5,
    private val cooldownMs: Long = 30_000,
) {
    enum class State { CLOSED, OPEN, HALF_OPEN }

    private var state = State.CLOSED
    private var failureCount = 0
    private var lastFailureTime = 0L

    suspend fun <T> execute(block: suspend () -> T): T {
        return when (state) {
            State.CLOSED -> tryExecute(block)
            State.OPEN -> {
                if (System.currentTimeMillis() - lastFailureTime > cooldownMs) {
                    state = State.HALF_OPEN
                    tryExecute(block)
                } else {
                    throw CircuitOpenException("Circuit is open, retry after cooldown")
                }
            }
            State.HALF_OPEN -> tryExecute(block)
        }
    }

    private suspend fun <T> tryExecute(block: suspend () -> T): T {
        return try {
            val result = block()
            onSuccess()
            result
        } catch (e: Exception) {
            onFailure()
            throw e
        }
    }

    private fun onSuccess() {
        failureCount = 0
        state = State.CLOSED
    }

    private fun onFailure() {
        failureCount++
        lastFailureTime = System.currentTimeMillis()
        if (failureCount >= failureThreshold) {
            state = State.OPEN
        }
    }
}

class CircuitOpenException(message: String) : Exception(message)
```

The circuit breaker has three states: CLOSED (normal operation), OPEN (blocking all calls after too many failures), and HALF_OPEN (allowing one test call after cooldown). This prevents cascading failures by failing fast when a service is down, giving it time to recover.

---

## Module 8: Real-World Design Exercises

### Lesson 8.1: Design a Chat App

Key decisions:
- **Real-time updates** — WebSocket for live messages, REST for history
- **Offline support** — Room stores all messages, sync queue for outgoing
- **Pagination** — Load older messages as user scrolls up
- **State** — Message status (sending → sent → delivered → read)

```kotlin
class ChatRepository(
    private val webSocket: ChatWebSocket,
    private val dao: MessageDao,
    private val syncQueue: OfflineWriteQueue,
) {
    fun observeMessages(chatId: String): Flow<List<Message>> =
        dao.observeMessages(chatId)

    suspend fun sendMessage(chatId: String, text: String) {
        val message = Message(
            id = UUID.randomUUID().toString(),
            chatId = chatId,
            text = text,
            status = MessageStatus.SENDING,
            timestamp = System.currentTimeMillis(),
        )
        // Optimistic insert — shows immediately in UI
        dao.insert(message.toEntity())

        try {
            webSocket.send(message)
            dao.updateStatus(message.id, MessageStatus.SENT)
        } catch (e: Exception) {
            syncQueue.enqueue(WriteOperation.SendMessage(message))
        }
    }
}
```

### Lesson 8.2: Design a Feed/Timeline

Key decisions:
- **Pagination** — Cursor-based (not page-number) for stable results
- **Caching** — Cache first page aggressively, lazy-load rest
- **Real-time** — Pull-to-refresh or periodic polling (not WebSocket)
- **Media** — Lazy-load images with Coil, prefetch next page's images

### Lesson 8.3: Design an E-Commerce App

Key decisions:
- **Cart** — Local-first with sync. Cart works offline
- **Search** — Debounce input, cache recent searches, paginate results
- **Checkout** — Idempotency keys prevent double charges
- **Inventory** — Show "last updated" time, revalidate before checkout

```kotlin
// Idempotent checkout
class CheckoutRepository(private val api: CheckoutApi) {
    suspend fun placeOrder(cart: Cart): OrderResult {
        // Generate idempotency key per checkout attempt
        val idempotencyKey = UUID.randomUUID().toString()

        return retryWithBackoff {
            api.placeOrder(
                request = cart.toOrderRequest(),
                idempotencyKey = idempotencyKey, // Server ignores duplicate requests with same key
            )
        }
    }
}
```

**Key takeaway:** Real-world system design is about combining patterns — offline-first + pagination + caching + retry + conflict resolution. No single pattern solves everything. The art is knowing which patterns to combine for your specific use case.

### Quiz: Real-World Design Exercises

#### In the chat app design, why is the message inserted into the local database BEFORE attempting to send via WebSocket?

- ❌ Because the database is faster than the WebSocket
- ✅ Because optimistic insertion shows the message immediately in the UI, providing instant feedback
- ❌ Because WebSocket messages must be stored locally first due to protocol requirements
- ❌ Because the database generates the message ID that the WebSocket needs

> **Explanation:** Optimistic insertion means the user sees their message instantly in the chat UI with a "sending" status. If the WebSocket send succeeds, the status updates to "sent." If it fails, the message is queued for retry. The user never waits for the network to see their own message.

#### Why does the e-commerce checkout use an idempotency key?

- ❌ To encrypt the payment information during transmission
- ❌ To track which user placed the order
- ✅ To prevent duplicate orders when a retry sends the same checkout request multiple times
- ❌ To validate that the cart items are still in stock

> **Explanation:** With retry logic, the same checkout request might be sent multiple times (e.g., network timeout on first attempt, but server actually processed it). The idempotency key tells the server "if you've already processed a request with this key, return the previous result instead of creating a duplicate order."

#### For a feed/timeline, why is cursor-based pagination preferred over page-number pagination?

- ❌ Because cursors use less memory than page numbers
- ❌ Because servers process cursor requests faster
- ✅ Because cursor-based pagination provides stable results even when items are added or removed between requests
- ❌ Because page-number pagination doesn't work with REST APIs

> **Explanation:** If a new post is added to a feed while a user is scrolling, page-number pagination would shift all items — causing duplicates or skipped items. Cursor-based pagination says "give me items after this specific item," which is stable regardless of insertions or deletions.

### Coding Challenge: Optimistic UI with Rollback

Implement an `OptimisticExecutor` that immediately applies a local change for instant UI feedback, then attempts the network call. If the network call fails, it rolls back the local change.

#### Solution

```kotlin
class OptimisticExecutor<T>(
    private val localStore: LocalStore<T>,
) {
    interface LocalStore<T> {
        suspend fun get(id: String): T?
        suspend fun save(id: String, data: T)
    }

    suspend fun execute(
        id: String,
        optimisticUpdate: (T) -> T,
        networkCall: suspend (T) -> T,
    ): Result<T> {
        val original = localStore.get(id)
            ?: return Result.failure(IllegalStateException("Item $id not found"))

        // Step 1: Apply optimistic update locally
        val optimistic = optimisticUpdate(original)
        localStore.save(id, optimistic)

        // Step 2: Attempt network call
        return try {
            val serverResult = networkCall(optimistic)
            // Step 3a: Update with server-confirmed data
            localStore.save(id, serverResult)
            Result.success(serverResult)
        } catch (e: Exception) {
            // Step 3b: Rollback to original on failure
            localStore.save(id, original)
            Result.failure(e)
        }
    }
}

// Usage: Like button with optimistic UI
// executor.execute(
//     id = postId,
//     optimisticUpdate = { post -> post.copy(isLiked = true, likeCount = post.likeCount + 1) },
//     networkCall = { post -> api.likePost(post.id) },
// )
```

This pattern provides instant UI feedback by applying changes locally before the network roundtrip. If the server confirms, the local data is updated with the server response. If it fails, the original state is restored — the user sees a brief flicker back, clearly indicating the action didn't succeed.

---

Thank You for completing the System Design for Mobile course! System design is the skill that separates senior engineers from everyone else. Think in systems, design for failure, and always consider the user's experience first. 🏗️
