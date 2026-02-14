---
title: "Design an Offline-First Application"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 5
sequence: 64
description: "Offline-first is a core mobile system design topic. Users expect apps to work in subways, elevators, and areas with flaky connectivity."
---

## Design an Offline-First Application

Offline-first means the app works without a network as its default mode. This is one of the most practical system design topics because every mobile app deals with flaky connectivity.

### Requirements & Scope

#### Q1: What does "offline-first" actually mean? How is it different from just caching?

There are levels to offline support. A basic cache means you show stale data when the network is gone — read-only, no writes. Offline-capable means you handle disconnection gracefully, maybe queue a few actions. Offline-first means the local database is the source of truth. Every read hits the local DB. Every write goes to the local DB first. The network is just a sync mechanism that runs in the background.

The architecture is fundamentally different. In an online-first app, the network call is the primary path and the cache is a fallback. In an offline-first app, the local DB is the primary path and the server is where data eventually converges.

#### Q2: What are the functional requirements for an offline-first app?

The user should be able to perform full CRUD while offline — create, read, update, and delete data without any network connection. All changes are persisted locally and queued for sync. When the device reconnects, the app pushes pending local changes to the server and pulls remote changes. The user shouldn't need to trigger sync manually.

The app also needs to handle conflicts — what happens when the same record was modified both locally and on the server while offline.

#### Q3: What non-functional requirements matter most?

- **Data integrity** — local changes must never be silently lost. If a sync fails, the data stays in the queue until it succeeds.
- **Conflict resolution** — the system needs a defined strategy for handling diverged data. This can't be an afterthought.
- **Battery efficiency** — background sync should respect Doze mode and battery optimization. Aggressive polling kills battery.
- **Storage** — not everything can live on-device. The app needs a strategy for what to sync and what to evict.
- **Consistency** — the UI should always reflect the local DB state, and sync should be invisible unless something fails.

### High-Level Design

#### Q4: How would you architect an offline-first app at a high level?

The local database (Room) is the single source of truth. The UI layer observes the local DB via Flow. A sync engine sits between the local DB and the remote API. It has two jobs — push local changes to the server, and pull remote changes into the local DB. A pending operations queue stores all local writes. A WorkManager job triggers sync whenever the network is available.

The data flow is: UI writes to local DB, local DB notifies UI via Flow, sync engine pushes to server in the background. For reads, it's: UI reads from local DB, sync engine pulls remote changes into local DB, UI gets notified automatically.

#### Q5: Why use the local database as the source of truth instead of the server?

Reads from Room take microseconds. Network calls take hundreds of milliseconds at best. With the local DB as source of truth, the UI is always responsive regardless of network state. The user can browse, create, and edit data in a subway with zero connectivity.

It also simplifies the data flow. The UI observes one source — Room via Flow. The repository handles syncing Room with the server separately. You don't need to merge local and remote data at the UI layer.

#### Q6: How would you design the data model with sync metadata?

Every entity needs sync metadata alongside its business fields. Add a `version` or `updatedAt` timestamp for conflict detection, a `syncStatus` flag to track whether the record is synced, pending, or failed, and a `lastSyncedVersion` to know the state at the time of the last successful sync.

```kotlin
@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey val id: String,
    val title: String,
    val body: String,
    val updatedAt: Long,
    val version: Int,
    val syncStatus: String, // "SYNCED", "PENDING", "FAILED"
    val lastSyncedVersion: Int
)
```

The `syncStatus` flag lets the UI show sync state per item. The `version` and `lastSyncedVersion` together tell you if there are local changes, remote changes, or a conflict during sync.

#### Q7: How would you design the pending operations queue?

Create a separate Room entity that records every local write as an operation. Each entry stores the operation type (create, update, delete), the entity type, the entity ID, the serialized payload, a timestamp, and a retry count. Process the queue in FIFO order to maintain causality — a create must sync before an update to the same entity.

```kotlin
@Entity(tableName = "pending_operations")
data class PendingOperation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val operationType: String,
    val entityType: String,
    val entityId: String,
    val payload: String,
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0
)
```

Every user action — even when online — goes through this queue. This keeps the data flow consistent regardless of network state.

#### Q8: How would you design the API for delta sync?

Full sync downloads everything on every cycle, which wastes bandwidth. Delta sync only transfers what changed. The server accepts a `syncToken` (or `since` timestamp) and returns only records created, updated, or deleted after that point, along with a new sync token.

The client stores the last sync token locally. On each sync cycle, it sends the token and receives only the delta. It applies the delta to Room — insert new records, update modified ones, soft-delete removed ones. If the token is too old and the server has purged its change log, fall back to a full sync. The server response should include a flag like `fullSyncRequired: true` for this case.

#### Q9: How do you detect conflicts during sync?

Compare the local version with the server version relative to the last synced version. If only the local version is ahead of `lastSyncedVersion`, push local changes. If only the server version is ahead, accept the server data. If both are ahead, you have a conflict.

For timestamp-based detection, the logic is similar — compare `localUpdatedAt` and `serverUpdatedAt` against `lastSyncedAt`. The version-based approach is more reliable because timestamps depend on device clocks, which can drift. Server-assigned version numbers are monotonic and don't have the clock skew problem.

### Low-Level Design & Deep Dives

#### Q10: What are the main conflict resolution strategies?

- **Last-write-wins (LWW)** — the change with the latest timestamp or highest version wins. Simple, but can silently discard a user's work. Good for low-conflict data like user settings or status flags.
- **Server-wins** — always accept the server version. The client re-fetches and overwrites local data. Simple, but the user loses their local changes.
- **Field-level merge** — if the client changed the title and the server changed the body, merge both. Requires tracking which fields changed, not just whether the record changed. Reduces false conflicts significantly.
- **CRDTs (Conflict-free Replicated Data Types)** — data structures designed to merge automatically without conflicts. Counters, sets, and text sequences can all be modeled as CRDTs. Complex to implement but eliminates conflict resolution entirely for supported types.
- **Manual resolution** — show both versions to the user and let them choose. Safest for high-value data like documents or financial records.

Most apps use LWW for most entities and merge or manual resolution for a few critical ones.

#### Q11: How would you implement field-level merge?

Track which fields changed since the last sync using per-field dirty flags. During sync, if the client changed the title and the server changed the body, take the client's title and the server's body — no conflict. If both changed the same field, fall back to LWW or manual resolution for just that field.

```kotlin
data class NoteSyncState(
    val id: String,
    val title: String,
    val body: String,
    val titleDirty: Boolean = false,
    val bodyDirty: Boolean = false,
    val version: Int
)

fun mergeNote(local: NoteSyncState, server: NoteSyncState): NoteSyncState {
    return NoteSyncState(
        id = local.id,
        title = if (local.titleDirty && !server.titleDirty) local.title
                else server.title,
        body = if (local.bodyDirty && !server.bodyDirty) local.body
               else server.body,
        version = maxOf(local.version, server.version) + 1
    )
}
```

This approach reduces visible conflicts dramatically. In a note-taking app, one device changing the title and another changing the body is common — without field-level tracking, that's a false conflict.

#### Q12: How do you compact the pending operations queue before syncing?

Before processing the queue, scan for multiple operations on the same entity and collapse them. CREATE followed by DELETE cancels out — remove both. CREATE followed by UPDATE becomes a single CREATE with the latest data. UPDATE followed by DELETE becomes just DELETE. Multiple UPDATEs collapse into one UPDATE with the final state.

This reduces network traffic and avoids unnecessary server-side churn. Without compaction, creating and deleting a note offline would result in a create request followed by a delete request — two wasted round trips.

#### Q13: How do you use WorkManager for background sync?

WorkManager is the right tool because it guarantees execution even if the app is killed. It respects Doze mode and battery optimization. Schedule a one-time sync worker with a network constraint — it only runs when connectivity is available.

```kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val syncEngine: SyncEngine
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            syncEngine.pushPendingOperations()
            syncEngine.pullRemoteChanges()
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry()
            else Result.failure()
        }
    }
}

fun scheduleSyncWork(workManager: WorkManager) {
    val request = OneTimeWorkRequestBuilder<SyncWorker>()
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
    workManager.enqueueUniqueWork("sync", ExistingWorkPolicy.REPLACE, request)
}
```

Enqueue sync work whenever the user makes a local change. `ExistingWorkPolicy.REPLACE` ensures only one sync worker is queued at a time. WorkManager handles retry with exponential backoff automatically when you return `Result.retry()`.

#### Q14: How do you monitor network state and trigger sync on reconnect?

Use `ConnectivityManager` with a `NetworkCallback` to observe connectivity changes reactively. When the network comes back, enqueue a sync WorkManager job.

```kotlin
class NetworkMonitor(context: Context) {
    private val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE)
        as ConnectivityManager

    val isOnline: StateFlow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(true) }
            override fun onLost(network: Network) { trySend(false) }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm.registerNetworkCallback(request, callback)
        awaitClose { cm.unregisterNetworkCallback(callback) }
    }.stateIn(CoroutineScope(Dispatchers.Default), SharingStarted.Eagerly, false)
}
```

One gotcha — `NET_CAPABILITY_INTERNET` doesn't guarantee the server is reachable. You can be connected to Wi-Fi where the router has no upstream connection. A robust app should handle failed network requests gracefully rather than trusting the connectivity flag alone.

#### Q15: How do you handle schema migrations when users have unsynced data?

This is harder than regular migrations because the user might have pending operations in the old schema when the app updates. Room migrations handle the local DB schema change, but the API contract also changes. If the server adds a new required field, old clients syncing without it will fail.

Use API versioning. The client sends its API version with every sync request. The server accepts the old format and applies defaults for missing fields. For breaking changes, support both formats during a transition period. On the client side, the Room migration transforms existing data and pending operations to the new schema.

#### Q16: How do you implement optimistic UI with rollback?

Apply changes to the local DB immediately and let the UI update via Flow. The user sees the result instantly. In the background, the sync engine pushes the change to the server. If the server rejects it (validation error, conflict, permission denied), revert the local state and show an error.

The rollback needs to be clean. Before applying the optimistic change, snapshot the current state of the record. If the server rejects the change, restore the snapshot and notify the user. For lists, this means the item might briefly appear, then disappear — use animations to make this feel intentional rather than buggy. The vast majority of writes succeed, so the user gets a fast experience.

#### Q17: How do you test offline scenarios?

Test at three levels. Unit test the sync engine — mock the API and DAO, verify conflict resolution, queue compaction, and retry logic. Integration test the full sync flow — use an in-memory Room database and MockWebServer to simulate conflicts, network failures, and partial syncs.

For E2E, simulate offline by toggling airplane mode or using network conditioning tools. The critical scenarios to test: create items offline then sync, edit the same item on two devices, kill the app during sync and verify no data corruption, and the first sync after a long offline period with many pending operations. Flaky conditions (high latency, packet loss) matter as much as full offline.

#### Q18: How do you handle large file sync like images or documents?

Large files need chunked uploads. Split the file into fixed-size chunks (e.g., 1MB), upload each chunk separately, and have the server reassemble them. If a chunk fails, retry only that chunk — not the entire file. Track upload progress per chunk in Room so the app can resume after a crash or network loss.

For downloads, use the same chunked approach with Range headers. Store the file locally with a reference in the Room entity. The file and its metadata should sync independently — metadata first, file on demand or when on Wi-Fi. This avoids burning mobile data on large files the user hasn't opened yet.

### Common Follow-ups

- How would you migrate an existing online-first app to offline-first incrementally?
- What's the difference between CRDTs and operational transformation?
- How do you handle authentication token expiry during long offline periods?
- How do you handle soft deletes vs hard deletes in a synced database?
- How would you design the sync protocol for a multi-device app (phone, tablet, web)?
- How do you secure sensitive data stored in the local database?
- What happens when the local database is corrupted — how do you recover?
- How do you minimize the battery impact of background sync?
