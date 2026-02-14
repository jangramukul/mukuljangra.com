---
title: "Design a File Sync App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 9
sequence: 63
description: "File sync apps are a staple in system design interviews because they test how you handle background processing, conflict resolution, and large data..."
---

## Design a File Sync App (Dropbox / Google Drive)

Think of a file sync app like a postal service that works in both directions — it picks up your local letters, delivers them to the cloud, and brings back anything new from the other side. The tricky part? It has to do this reliably when the connection drops, when two people edit the same document, and when someone tries to sync a 2 GB video over cellular data.

#### What core features should a file sync app support on the client side?

Upload and download of files, automatic sync across devices, a file browser for navigating folders, and file sharing. The user should be able to browse and open files even when offline, and any local changes should sync automatically when connectivity returns.

Here's the thing. Scope the interview around single-user sync first. Multi-user sharing and collaboration add a ton of complexity — mention them in requirements, but don't try to design everything at once.

#### What are the key non-functional requirements?

**Conflict resolution** is the big one. Two devices edit the same file before either syncs — now what? You need a strategy that doesn't silently eat someone's changes.

**Large file handling** matters because users will sync videos, design files, and archives that can be hundreds of megabytes. Loading an entire file into memory is a one-way ticket to an OOM crash. **Battery and bandwidth efficiency** is critical on mobile — sync should respect battery state, prefer Wi-Fi, and avoid redundant transfers with delta sync.

Reliability is non-negotiable. If a transfer fails halfway, it must resume from where it stopped. The user should never lose data because of a network drop.

#### What should we exclude from scope for this interview?

Exclude real-time collaborative editing — that's a separate problem closer to Google Docs. Exclude server-side design and focus entirely on the Android client. Also exclude media previews, in-app document editing, and full-text search across files. These are real features, but they don't exercise the core sync engine design.

#### How would you structure the client architecture?

Think of it like a restaurant. The **file manager** is the front of house — the UI with folder navigation, sync status indicators, and upload/download controls. The **sync engine** is the kitchen — it coordinates between local and remote state, detects changes, resolves conflicts, and queues transfers. The **local database** (Room) is the pantry — it stores file metadata and sync state so the app can work offline.

The sync engine sits between the UI and the network. It reads from and writes to the local database, which is the single source of truth. The UI observes the database through ViewModels. Incoming remote changes hit the database first, then the UI. Outgoing local changes are queued in the database and picked up by the sync engine for upload.

> **🧠 Think about it:** Why is the local database the source of truth and not the server? What breaks if the UI reads directly from the network?

#### What API endpoints does the client need?

Three groups. **Metadata endpoints** handle listing folder contents, creating folders, renaming, moving, and deleting files. **Transfer endpoints** handle uploading and downloading file content. **Sync endpoints** return changes since the client's last sync cursor.

```kotlin
interface FileSyncApi {
    @GET("/files/list")
    suspend fun listFolder(
        @Query("path") path: String,
        @Query("cursor") cursor: String?
    ): FolderListResponse

    @POST("/files/upload/session/start")
    suspend fun startUploadSession(): UploadSession

    @PUT("/files/upload/session/{sessionId}/chunk")
    suspend fun uploadChunk(
        @Path("sessionId") sessionId: String,
        @Query("offset") offset: Long,
        @Body chunk: RequestBody
    ): ChunkResponse

    @POST("/files/upload/session/{sessionId}/finish")
    suspend fun finishUpload(
        @Path("sessionId") sessionId: String,
        @Body metadata: FileMetadata
    ): FileEntry

    @GET("/files/download/{fileId}")
    @Streaming
    suspend fun downloadFile(@Path("fileId") fileId: String): ResponseBody

    @POST("/sync/changes")
    suspend fun getChanges(@Body request: SyncRequest): SyncResponse
}
```

Uploads use a session-based chunked approach — start a session, upload chunks with byte offsets, finish with file metadata. The `@Streaming` annotation on downloads prevents OkHttp from buffering the entire response in memory, which is kind of important when the file is 500 MB.

#### What data models does the client need?

Three core models. `FileMetadata` represents a file or folder in the local database. `SyncState` tracks where each file stands in the sync lifecycle. `ChangeLogEntry` records operations that need to go up to the server.

```kotlin
@Entity(tableName = "file_metadata")
data class FileMetadata(
    @PrimaryKey val fileId: String,
    val name: String,
    val path: String,
    val isFolder: Boolean,
    val sizeBytes: Long,
    val localModifiedAt: Long,
    val remoteModifiedAt: Long,
    val remoteVersion: Long,
    val checksum: String?,
    val syncState: SyncState,
    val localPath: String?
)

enum class SyncState {
    SYNCED, PENDING_UPLOAD, PENDING_DOWNLOAD,
    UPLOADING, DOWNLOADING, CONFLICTED, ERROR
}

@Entity(tableName = "change_log")
data class ChangeLogEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val fileId: String,
    val operation: ChangeOperation,
    val timestamp: Long,
    val dependsOn: Long? = null
)

enum class ChangeOperation {
    CREATE, MODIFY, DELETE, RENAME, MOVE
}
```

The `SyncState` enum drives the UI — each file shows a sync icon based on its current state. The change log is basically a to-do list for the sync engine. Local operations get recorded here and processed in order.

#### How does delta sync work with version vectors?

Instead of re-uploading entire files on every change, delta sync only transfers the parts that changed. It's like how a newspaper only prints today's news, not every article ever written.

The client keeps a sync cursor — a token from the server representing the last known state. On each sync cycle, the client sends the cursor and the server returns only what changed since that point. Each file has a `remoteVersion` that increments on every server-side modification. The client compares local vs remote versions:

- Remote version is higher, local file untouched — straightforward download
- Both versions changed — conflict
- Only local version changed — upload

The sync cycle runs in three phases: pull remote changes first, push local changes second, update the cursor third. This order minimizes conflicts because you see the latest remote state before pushing your changes.

#### How should the local file storage be structured?

Store synced files in the app's internal storage mirroring the remote folder hierarchy. Plot twist: use a flat naming scheme internally — store files by their `fileId` rather than their user-visible name. This avoids path length limits and special character nightmares. The `FileMetadata` table maps each `fileId` to its display path and local file path.

```kotlin
class LocalFileStorage(private val context: Context) {

    private val syncRoot = File(context.filesDir, "sync_files")

    fun getLocalFile(fileId: String): File {
        return File(syncRoot, fileId)
    }

    fun hasLocalContent(fileId: String): Boolean {
        return getLocalFile(fileId).exists()
    }

    fun availableSpaceBytes(): Long {
        return syncRoot.usableSpace
    }
}
```

Keep a separate temp directory for in-progress downloads. When a download completes, move the temp file to its final location atomically. This prevents the user from opening a half-baked file.

#### How would the sync engine coordinate everything?

The sync engine is the air traffic controller. It runs a loop: detect local changes, pull remote changes, resolve conflicts, then process the transfer queue. It exposes a `sync()` function that WorkManager calls on a schedule or the user triggers manually.

```kotlin
class SyncEngine(
    private val api: FileSyncApi,
    private val db: SyncDatabase,
    private val storage: LocalFileStorage
) {
    suspend fun sync() {
        val localChanges = db.changeLogDao().getPending()
        val remoteChanges = api.getChanges(
            SyncRequest(cursor = db.syncCursorDao().getCursor())
        )

        val conflicts = detectConflicts(localChanges, remoteChanges)
        resolveConflicts(conflicts)

        processDownloads(remoteChanges.entries)
        processUploads(localChanges)

        db.syncCursorDao().updateCursor(remoteChanges.newCursor)
    }

    private fun detectConflicts(
        local: List<ChangeLogEntry>,
        remote: SyncResponse
    ): List<ConflictPair> {
        val remoteFileIds = remote.entries.map { it.fileId }.toSet()
        return local.filter { it.fileId in remoteFileIds }
            .map { ConflictPair(it, remote.entries.first { r -> r.fileId == it.fileId }) }
    }
}
```

The engine processes operations in dependency order. Folder creates run before file uploads into those folders. Deletes run in reverse — files first, then empty folders. Get this order wrong and you'll be uploading files into folders that don't exist yet.

#### How would you implement chunked uploads with resume on failure?

Yeah, this trips up everyone. You can't just fire a 500 MB file at the server in one shot. Split files into fixed-size chunks (2-4 MB each). Start an upload session, upload each chunk with its byte offset, and finish when all chunks are sent. The key: store the session ID and last completed offset in Room so you can resume after a crash or network failure.

```kotlin
suspend fun uploadFileChunked(file: File, metadata: FileMetadata) {
    val chunkSize = 2 * 1024 * 1024L
    val session = db.uploadSessionDao().getSession(metadata.fileId)
        ?: api.startUploadSession().also {
            db.uploadSessionDao().insert(UploadSessionEntity(metadata.fileId, it.sessionId, 0L))
        }

    var offset = session.completedOffset
    RandomAccessFile(file, "r").use { raf ->
        raf.seek(offset)
        val buffer = ByteArray(chunkSize.toInt())
        while (offset < file.length()) {
            val bytesRead = raf.read(buffer)
            val chunk = buffer.copyOf(bytesRead).toRequestBody()
            api.uploadChunk(session.sessionId, offset, chunk)
            offset += bytesRead
            db.uploadSessionDao().updateOffset(metadata.fileId, offset)
        }
    }

    api.finishUpload(session.sessionId, metadata)
    db.uploadSessionDao().delete(metadata.fileId)
}
```

On resume, the client reads the saved offset, seeks to that position in the file, and continues. The server should handle duplicate chunks idempotently — the client might crash right after uploading a chunk but before updating the local offset.

#### How does chunked download with resume work?

HTTP range requests. If a download stops at byte 5,000,000, you resume with `Range: bytes=5000000-`. It's like bookmarking the page you stopped on instead of starting the book over. Write to a temp file during download and move it to the final location only on completion.

```kotlin
suspend fun downloadFileResumable(fileId: String) {
    val tempFile = File(storage.tempDir, fileId)
    val downloadedBytes = if (tempFile.exists()) tempFile.length() else 0L

    val request = Request.Builder()
        .url("${baseUrl}/files/download/$fileId")
        .header("Range", "bytes=$downloadedBytes-")
        .build()

    client.newCall(request).execute().use { response ->
        if (response.code == 200) {
            tempFile.delete() // file changed, restart
        }
        tempFile.appendingSink().buffer().use { sink ->
            sink.writeAll(response.body!!.source())
        }
    }

    tempFile.renameTo(storage.getLocalFile(fileId))
}
```

If the server returns `200` instead of `206 Partial Content`, the file has changed since the partial download began — discard the partial file and restart from scratch. Always check available disk space before starting a download. Failing halfway wastes bandwidth and battery.

> **🧠 Think about it:** What happens if the user modifies the local file while a download of a newer version is in progress? How would you handle that race condition?

#### How would you handle conflict resolution?

Conflicts happen when the same file is modified on two devices before either syncs. Detect them during the sync cycle by checking if a file has both local changes and a new remote version. There are three strategies, and the right one depends on the file type.

- **Last-write-wins** — picks whichever modification has the later timestamp. Simple, but can lose data. Use this only for non-critical files like app preferences or auto-generated thumbnails
- **Keep both** — saves the conflicting version as a separate file: `report (conflicted copy - Device A).docx`. This is what Dropbox does. No data loss, but the user has to merge manually
- **User prompt** — shows both versions with metadata (size, modified date, device name) and lets the user choose

```kotlin
suspend fun resolveConflict(local: FileMetadata, remote: FileEntry) {
    when (getResolutionStrategy(local)) {
        Strategy.LAST_WRITE_WINS -> {
            if (local.localModifiedAt > remote.modifiedAt) {
                queueUpload(local)
            } else {
                queueDownload(remote)
            }
        }
        Strategy.KEEP_BOTH -> {
            val conflictName = "${local.name} (conflicted copy)"
            renameLocalFile(local, conflictName)
            queueDownload(remote)
        }
        Strategy.USER_PROMPT -> {
            db.fileMetadataDao().updateState(local.fileId, SyncState.CONFLICTED)
        }
    }
}
```

For binary files like images and PDFs, keep-both or user-prompt are the only reasonable options — you can't merge binary data. For config files and small text files, last-write-wins is usually fine.

#### How should background sync be scheduled?

WorkManager. It guarantees execution even if the app is killed or the device restarts, which is exactly what you need for sync. Schedule a periodic worker every 15 minutes with network and battery constraints. For immediate sync when the user saves a file, enqueue a one-time expedited work request.

```kotlin
fun schedulePeriodicSync(context: Context) {
    val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .setRequiresBatteryNotLow(true)
        .build()

    val syncWork = PeriodicWorkRequestBuilder<SyncWorker>(
        15, TimeUnit.MINUTES
    ).setConstraints(constraints).build()

    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        "periodic_sync",
        ExistingPeriodicWorkPolicy.KEEP,
        syncWork
    )
}
```

For large file uploads (50 MB+), use a foreground service instead. The system is more likely to kill a WorkManager task than a foreground service with an active notification. Show upload progress in the notification and let the user cancel from there. Use `ExistingPeriodicWorkPolicy.KEEP` to avoid resetting the timer when sync is already scheduled.

#### How would you detect local file changes?

Here's the thing — Android has no reliable file system watcher for app-scoped storage. The approach depends on who modifies the files.

For files your app manages directly, track modifications through your own write operations. Whenever your app saves a file, update the `FileMetadata` entry and add a `ChangeLogEntry`. Cheap and reliable.

For files modified by other apps (shared folders via `SAF`), poll the last modified timestamp on each sync cycle and compare it against the stored value. If the timestamp changed, compute a checksum to confirm the file actually changed — timestamps can update without content changes during file moves. Run this as part of the periodic WorkManager sync, not continuously. Continuous polling drains battery fast.

#### How would you optimize bandwidth usage?

Three techniques that matter most:

- **Compression** — compress file content before uploading using gzip or zstd. Helps significantly for text-based files but adds CPU overhead. Skip it for already-compressed formats like JPEG, PNG, and ZIP
- **Wi-Fi-only sync for large files** — for files above a configurable threshold (say 10 MB), only sync on Wi-Fi unless the user explicitly overrides. Nobody wants to burn through their data plan syncing a design file
- **Delta transfers** — instead of uploading the entire file when a small part changes, compute the diff and upload only the changed blocks. This requires server support for block-level deduplication

```kotlin
fun shouldSyncNow(file: FileMetadata, networkType: NetworkType): Boolean {
    if (networkType == NetworkType.UNMETERED) return true
    if (file.sizeBytes < METERED_THRESHOLD) return true
    return db.settingsDao().isMobileDataSyncEnabled()
}
```

Batch small metadata updates into a single request instead of making one API call per file rename or move. Fewer round trips means less battery drain.

#### How should offline editing work?

When the device is offline, the user can still browse and open any file that has local content. Edits are saved to the local file and a `ChangeLogEntry` is recorded. The sync engine detects connectivity changes through a `ConnectivityManager` callback and processes the pending queue when the network returns.

The longer the device stays offline, the higher the chance someone else modifies the same file remotely. To reduce this risk, process uploads before downloads on reconnection — push your changes first, then pull remote changes. If a conflict pops up, fall back to the conflict resolution strategy for that file type. Show a badge or notification telling the user how many files are pending sync.

#### How should files be encrypted at rest and in transit?

In transit, all API calls go over HTTPS with TLS 1.3 and certificate pinning. Use OkHttp's `CertificatePinner` to pin the server's public key — this prevents man-in-the-middle attacks even on compromised Wi-Fi networks.

At rest, encrypt sensitive files using Android's `EncryptedFile` from the Jetpack Security library. It uses AES-256-GCM under the hood with keys stored in the Android Keystore. But here's the thing — not every file needs encryption. Let the user mark sensitive folders and only encrypt those. Full-disk encryption at the app level is expensive and usually unnecessary since Android already provides file-based encryption at the OS level.

#### How would you implement selective sync?

Selective sync lets the user choose which folders sync to the device. It's like subscribing to specific channels instead of downloading the entire internet. Files in unselected folders appear in the browser with an "online-only" badge but have no local content. When the user opens an online-only file, the client downloads it on demand and caches it temporarily.

Store the sync preference per folder in Room. The sync engine skips unselected folders during the periodic sync cycle but still fetches their metadata so the file browser stays up to date. For cache eviction, use an LRU strategy — when local storage exceeds a configurable limit, evict the least recently accessed files that are not in a selected folder. Never evict files the user explicitly chose to sync offline.

> **🧠 Think about it:** What happens when the user switches a folder from "online-only" to "sync offline" while on cellular data? How would you handle the potentially massive download queue?

#### How would you handle very large files without running out of memory?

Never load the entire file into memory. This is the golden rule. For uploads, read the file in chunks using `RandomAccessFile` or `InputStream`. For downloads, write directly to disk as bytes arrive using OkHttp's `@Streaming` annotation. For checksum computation, use a streaming hash — feed it bytes in chunks instead of handing it the whole file.

```kotlin
fun computeChecksum(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(8192)
    file.inputStream().use { stream ->
        var bytesRead: Int
        while (stream.read(buffer).also { bytesRead = it } != -1) {
            digest.update(buffer, 0, bytesRead)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
}
```

For files over 1 GB, always check available disk space before starting. Show a progress indicator with estimated time remaining based on the transfer rate of recent chunks. Let the user pause and resume at any time. If the device runs low on storage mid-download, pause the transfer and notify the user rather than crashing or corrupting the file.

### Common Follow-ups

- How would you handle sync when the user renames or moves a file?
- What happens if the server is down for an extended period — how does the client handle a growing queue?
- How would you design the sharing UI for inviting users and managing permissions?
- How would you test the sync engine under various network conditions (slow, intermittent, offline)?
- How would you handle quota limits when the user runs out of cloud storage?
- How would you support search across both local and remote files?
