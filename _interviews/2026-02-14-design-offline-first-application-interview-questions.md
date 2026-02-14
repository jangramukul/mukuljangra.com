---
title: "Design an Offline-First Application"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 5
sequence: 64
---

## Design an Offline-First Application

Offline-first is a core mobile system design topic. Users expect apps to work in subways, elevators, and areas with flaky connectivity. The interviewer wants to see how you think about local-first data, sync strategies, conflict resolution, and graceful degradation.

### Core Questions (Beginner → Intermediate)

#### Q1: What does "offline-first" mean, and how is it different from "offline-capable"?

Offline-capable means the app can handle being offline gracefully — it shows cached data and queues actions. Offline-first means the app is designed to work without a network connection as the primary mode. The local database is the source of truth, not the server. Every read comes from the local DB, every write goes to the local DB first, and sync with the server happens in the background when a connection is available.

The architecture difference is fundamental. In an online-first app, the network call is the primary path and the cache is a fallback. In an offline-first app, the local database is the primary path and the network is a sync mechanism.

#### Q2: Why would you use the local database as the single source of truth instead of the server?

Three reasons. First, it makes the UI responsive — reads from Room take microseconds, network calls take hundreds of milliseconds. Second, it makes the app work without a connection — the user can browse, create, and edit data regardless of network state. Third, it simplifies the data flow — the UI observes one source (Room via Flow), and the repository handles syncing Room with the server separately. This eliminates the complexity of merging local and remote data at the UI layer.

#### Q3: What is optimistic UI and why does it matter for offline-first apps?

Optimistic UI means applying changes to the UI immediately without waiting for server confirmation. When the user creates a note, edits a task, or marks something as complete, the local database is updated right away and the UI reflects the change instantly. The sync with the server happens in the background.

If the server rejects the change (validation error, conflict), you revert the local state and notify the user. The vast majority of writes succeed, so the user gets a fast, responsive experience. The alternative — showing a loading spinner on every action until the server responds — feels sluggish, especially on slow connections.

#### Q4: How do you detect network state on Android?

Use `ConnectivityManager` with a `NetworkCallback` to observe network availability reactively. Register the callback and get notified when the network becomes available or is lost.

```kotlin
class NetworkMonitor(context: Context) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    val isOnline: StateFlow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(true) }
            override fun onLost(network: Network) { trySend(false) }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)

        val active = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(active)
        trySend(capabilities?.hasCapability(
            NetworkCapabilities.NET_CAPABILITY_INTERNET
        ) == true)

        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.stateIn(CoroutineScope(Dispatchers.Default), SharingStarted.Eagerly, false)
}
```

An important gotcha: `NET_CAPABILITY_INTERNET` means the network has internet connectivity, but it doesn't guarantee the server is reachable. You can be connected to Wi-Fi where the router has no upstream connection. A robust offline-first app should also handle failed network requests gracefully, not just rely on the connectivity state.

#### Q5: What are the main sync strategies for offline-first apps?

There are three approaches.

- **Pull-based sync** — the client periodically fetches the latest data from the server. Simple to implement. The client requests everything newer than its last sync timestamp. Works well for read-heavy apps.
- **Push-based sync** — the server notifies the client when data changes using push notifications, WebSocket, or SSE. The client then fetches the changed data. Lower latency, but requires server infrastructure for change tracking.
- **Bidirectional sync** — both client and server can create and modify data independently. Changes from both sides are merged during sync. This is the most complex because you need conflict resolution.

Most offline-first apps use bidirectional sync because users create and modify data locally while the server also receives changes from other devices or users.

#### Q6: How do you queue offline actions for later sync?

Create a pending operations table in Room. When the user performs an action while offline (or even online — for consistency), insert a record describing the operation — the type (create, update, delete), the entity ID, the payload, and a timestamp. When the network is available, process the queue in order.

```kotlin
@Entity(tableName = "pending_operations")
data class PendingOperation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val operationType: String, // "CREATE", "UPDATE", "DELETE"
    val entityType: String,    // "note", "task"
    val entityId: String,
    val payload: String,       // JSON of the changed data
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0
)

@Dao
interface PendingOperationDao {
    @Query("SELECT * FROM pending_operations ORDER BY createdAt ASC")
    suspend fun getPendingOperations(): List<PendingOperation>

    @Insert
    suspend fun insert(operation: PendingOperation)

    @Delete
    suspend fun delete(operation: PendingOperation)
}
```

Process operations in FIFO order to maintain causality — a create must sync before an update to the same entity. If an operation fails, increment the retry count and apply exponential backoff.

#### Q7: How do you use WorkManager for background sync?

WorkManager is the right tool for deferred, guaranteed background work. Schedule a sync worker that runs when the network is available. WorkManager respects Doze mode, app standby, and battery optimization, and it guarantees execution even if the app is killed.

```kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val syncEngine: SyncEngine
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            syncEngine.syncPendingOperations()
            syncEngine.pullLatestChanges()
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry()
            else Result.failure()
        }
    }
}

// Schedule sync when network is available
fun scheduleSyncWork(workManager: WorkManager) {
    val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
    workManager.enqueueUniqueWork("sync", ExistingWorkPolicy.REPLACE, syncRequest)
}
```

Enqueue sync work whenever the user makes a local change. `ExistingWorkPolicy.REPLACE` ensures only one sync worker runs at a time. WorkManager chains the retries with exponential backoff automatically when you return `Result.retry()`.

### Deep Dive Questions (Advanced → Expert)

#### Q8: What are the main conflict resolution strategies, and when would you use each?

Conflicts happen when the same data is modified on both the client and server (or on two different clients) before a sync. The three main strategies are:

- **Last-write-wins (LWW)** — the change with the latest timestamp wins. Simple and deterministic, but can silently discard a user's work. Works well for low-conflict data like user settings or status updates.
- **Merge** — combine both changes automatically. If the client changed the title and the server changed the description, merge both. This requires field-level tracking of changes, not just record-level. Works well for structured data with independent fields.
- **Manual resolution** — show both versions to the user and let them decide. This is the safest but interrupts the user experience. Use it for high-value data where silent data loss is unacceptable — like document editing or financial records.

In practice, most apps use LWW for most entities and merge or manual resolution for a few critical ones.

#### Q9: How do you implement last-write-wins conflict resolution?

Every record gets an `updatedAt` timestamp. When syncing, the client sends its local changes with timestamps. The server compares timestamps — if the server's version is newer, the client's change is rejected (or the server version overwrites it). If the client's version is newer, the server accepts it.

```kotlin
class SyncEngine(
    private val api: SyncApi,
    private val noteDao: NoteDao
) {
    suspend fun syncNote(localNote: NoteEntity) {
        val serverNote = api.getNote(localNote.id)

        if (serverNote == null) {
            // New local note — push to server
            api.createNote(localNote.toRequest())
        } else if (localNote.updatedAt > serverNote.updatedAt) {
            // Local is newer — push to server
            api.updateNote(localNote.id, localNote.toRequest())
        } else if (serverNote.updatedAt > localNote.updatedAt) {
            // Server is newer — update local
            noteDao.update(serverNote.toEntity())
        }
        // Equal timestamps — already in sync
    }
}
```

The main weakness of LWW is clock skew. Device clocks can be wrong, and comparing timestamps across different devices is unreliable. Using server-assigned timestamps (where the server stamps the `updatedAt` on every write) is more reliable than client timestamps. Some systems use logical clocks or version vectors instead.

#### Q10: How do you handle data versioning for sync?

Instead of relying on timestamps alone, assign a monotonically increasing version number to each record. Every time a record is modified (locally or on the server), the version increments. During sync, compare versions — if the server's version is higher, accept the server's data. If the local version is higher, push to the server. If both are higher than the last known sync point, there's a conflict.

You can also track the "last synced version" — the version of each record at the time of the last successful sync. If the local version is ahead of the last synced version, the record has local changes. If the server version is ahead of the last synced version, the record has remote changes. If both are ahead, conflict.

#### Q11: How would you implement field-level merge for conflict resolution?

Track which fields changed since the last sync, not just whether the record changed. Store a `changedFields` set or use a per-field dirty flag. During sync, if the client changed the title and the server changed the description, merge both changes — no conflict. If both changed the same field, fall back to LWW or manual resolution for that specific field.

```kotlin
data class NoteSync(
    val id: String,
    val title: String,
    val body: String,
    val titleDirty: Boolean = false,
    val bodyDirty: Boolean = false,
    val version: Int
)

fun mergeNote(local: NoteSync, server: NoteSync): NoteSync {
    return NoteSync(
        id = local.id,
        title = if (local.titleDirty && !server.titleDirty) local.title
                else server.title,
        body = if (local.bodyDirty && !server.bodyDirty) local.body
               else server.body,
        version = maxOf(local.version, server.version) + 1
    )
}
```

Field-level merge significantly reduces visible conflicts. In a note-taking app, it's common for one device to change the title and another to change the body — without field-level tracking, this is a false conflict.

#### Q12: How do you handle the "create then delete" edge case during sync?

The user creates an item offline, then deletes it before the sync happens. The pending operations queue has both a CREATE and a DELETE for the same entity. If you process them in order, you create the item on the server and immediately delete it — a wasted round trip.

The solution is to compact the pending operations queue before syncing. Scan for operations on the same entity and collapse them. CREATE + DELETE cancels out (remove both). CREATE + UPDATE becomes a single CREATE with the latest data. UPDATE + DELETE becomes just DELETE. This optimization reduces sync traffic and avoids unnecessary server-side churn.

#### Q13: How do you implement exponential backoff with jitter for sync retries?

When a sync fails, don't retry immediately — the server might be overloaded. Exponential backoff increases the delay between retries: 1s, 2s, 4s, 8s, up to a max. Jitter adds randomness to prevent all clients from retrying at the same moment (thundering herd problem).

```kotlin
fun calculateBackoffDelay(attempt: Int, maxDelay: Long = 60_000L): Long {
    val exponentialDelay = (1000L * (1 shl attempt.coerceAtMost(6)))
        .coerceAtMost(maxDelay)
    val jitter = (0..exponentialDelay / 2).random()
    return exponentialDelay + jitter
}

suspend fun syncWithRetry(maxAttempts: Int = 5, syncAction: suspend () -> Unit) {
    var attempt = 0
    while (attempt < maxAttempts) {
        try {
            syncAction()
            return
        } catch (e: IOException) {
            attempt++
            if (attempt < maxAttempts) {
                delay(calculateBackoffDelay(attempt))
            }
        }
    }
}
```

WorkManager handles backoff automatically when you return `Result.retry()` with `setBackoffCriteria()`. But for in-app sync operations (not WorkManager), implement backoff manually.

#### Q14: How do you handle schema changes in an offline-first app?

Schema changes are harder in offline-first apps because the user might have unsynced data in the old schema when the app updates. Room migrations handle the local database schema change, but you also need to handle the API contract change. If the server adds a new required field, old clients that sync without that field will fail.

The approach is API versioning. The client sends its API version with every sync request. The server accepts the old format and applies defaults for missing fields. For breaking changes, support both old and new formats for a transition period. On the client side, the Room migration transforms existing data to the new schema, and the sync engine includes the new fields going forward.

#### Q15: How do you indicate sync status to the user?

Show sync state at the item level — each item can be in one of these states: synced (checkmark or no indicator), pending sync (subtle icon or muted color), syncing (progress indicator), or sync failed (error icon with retry option). Don't show a global sync spinner — it's too vague.

For the overall app, a subtle status indicator in the toolbar or bottom bar works well — "All changes saved" or "Waiting for connection" or "Syncing 3 items." Keep it unobtrusive. The user shouldn't have to think about sync unless something fails. The key principle is that the app should feel like it works locally, with sync being an invisible background process.

#### Q16: How do you handle large data sets that can't all be stored locally?

Not everything needs to be offline. Define a "sync scope" — what data is critical for offline access. For a task app, sync all tasks assigned to the current user. For a document app, sync only recently accessed documents and let users manually pin specific ones for offline access.

Use a tiered approach. Full sync for essential data (user profile, active tasks, current project). On-demand caching for everything else — fetch it when requested, cache it in Room, evict it based on an LRU policy. Background sync for medium-priority data when on Wi-Fi and charging. The sync scope should be configurable based on device storage — a device with 16GB free syncs more aggressively than one with 500MB free.

#### Q17: How do you implement delta sync instead of full sync?

Full sync downloads everything on every sync cycle, which is wasteful. Delta sync only transfers what changed since the last sync. The server needs to support this — typically by accepting a `since` parameter (timestamp or sync token) and returning only records created, updated, or deleted after that point.

On the client, store the last sync token. On each sync, send the token and receive only the delta. Apply the delta to the local database — insert new records, update modified ones, and delete removed ones. The server returns a new sync token that the client stores for the next cycle. If the token is too old (server purged the change log), fall back to a full sync.

#### Q18: How would you handle sync for collaborative data where multiple users edit the same item?

Collaborative editing is the hardest sync problem. Each user has a local copy that can diverge. The simplest approach for non-real-time collaboration is optimistic locking — each record has a version number. When syncing, if the server's version is higher than your base version, your change conflicts with another user's change.

For real-time collaboration (like Google Docs), you need operational transformation (OT) or conflict-free replicated data types (CRDTs). These are complex and typically implemented by the backend, with the mobile client applying operations from a real-time stream. For most mobile apps, optimistic locking with LWW or manual conflict resolution is sufficient. True real-time collaboration is a specialized problem.

#### Q19: How do you test an offline-first app?

Test at multiple levels. Unit test the sync engine — mock the API and database, verify that conflicts are resolved correctly, queue compaction works, and retry logic behaves as expected. Integration test the full sync flow — use an in-memory Room database and a mock server (MockWebServer) to simulate sync scenarios like conflicts, network failures, and partial syncs.

For manual and automated E2E testing, simulate offline by toggling airplane mode or using network conditioning tools. Test these scenarios specifically: creating items offline then syncing, editing the same item on two devices, app killed during sync (verify data isn't corrupted), and the first sync after a long offline period. Flaky network conditions (high latency, packet loss) are as important to test as full offline.

#### Q20: How do you prevent data loss during sync failures?

Never delete local data before the server confirms it received the data. The sync flow should be: send local changes to server, wait for server acknowledgment, then mark local changes as synced. If the app crashes between sending and receiving acknowledgment, the next sync will try again — the server should handle duplicate operations idempotently.

For critical data (financial transactions, medical records), use idempotency keys. Generate a UUID for each operation on the client. The server checks if it's already processed that UUID and returns success without re-applying. This makes retries safe. Also, keep a local audit log of all sync operations for debugging — what was sent, what was received, when, and whether it succeeded.

### Common Follow-ups

- How would you migrate an existing online-first app to offline-first?
- What's the difference between CRDTs and operational transformation?
- How do you handle authentication token expiry during offline periods?
- How would you implement offline support for file attachments (images, documents)?
- What's the battery impact of background sync, and how do you minimize it?
- How do you handle soft deletes vs hard deletes in a synced database?
- How would you design the sync protocol for a multi-device app (phone, tablet, web)?
- What happens when the user's local database is corrupted — how do you recover?
