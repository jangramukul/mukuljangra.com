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

---

Thank You for completing the System Design for Mobile course! System design is the skill that separates senior engineers from everyone else. Think in systems, design for failure, and always consider the user's experience first. 🏗️
