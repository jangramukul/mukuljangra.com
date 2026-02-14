---
title: "Design a File Sync App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 9
level: senior
sequence: 68
---

## Design a File Sync App (Google Drive/Dropbox)

File sync apps are a staple in system design interviews because they test how you handle background processing, conflict resolution, and large data transfers on mobile. The focus is on the client-side sync engine — how files move between local storage and the server reliably, even on flaky networks.

### Core Questions (Beginner to Intermediate)

#### Q1: What are the main client-side components of a file sync app?

The core components are a file browser UI (list/grid view with folders and files), a sync engine that keeps local and remote state in sync, an upload/download manager that handles file transfers, a local database (Room) that tracks file metadata and sync state, a background worker (WorkManager) that runs sync operations when the app is not in the foreground, and a conflict resolution system for when the same file is modified on multiple devices. On top of this, you need a notification system to report sync progress and errors, and a file provider for sharing files with other apps.

#### Q2: How would you design chunked file uploads?

Large files should not be uploaded as a single request — if the connection drops at 90%, you lose everything. Split the file into fixed-size chunks (e.g., 1-5 MB each). Upload each chunk individually with its chunk index and a server-assigned upload session ID. The server reassembles the chunks after receiving all of them.

```kotlin
suspend fun uploadFileInChunks(file: File, sessionId: String) {
    val chunkSize = 2 * 1024 * 1024 // 2 MB
    val totalChunks = (file.length() / chunkSize + 1).toInt()
    val buffer = ByteArray(chunkSize)

    file.inputStream().use { stream ->
        var chunkIndex = 0
        var bytesRead: Int
        while (stream.read(buffer).also { bytesRead = it } > 0) {
            val chunk = buffer.copyOf(bytesRead)
            api.uploadChunk(sessionId, chunkIndex, totalChunks, chunk)
            updateProgress(chunkIndex, totalChunks)
            chunkIndex++
        }
    }
}
```

Store the last successfully uploaded chunk index locally so you can resume from where you left off after a failure. The server should support receiving chunks out of order and handle deduplication if the same chunk is sent twice.

#### Q3: How would you implement resumable uploads and downloads?

For uploads, track the upload session and the last completed chunk index in Room. On resume, query the server for how many chunks it has received and start from the next one. For downloads, use HTTP range requests — the `Range` header lets you request a specific byte range from the server. If a download stops at byte 5,000,000, resume with `Range: bytes=5000000-`. OkHttp supports this natively.

```kotlin
suspend fun resumeDownload(fileId: String, localFile: File) {
    val downloadedBytes = localFile.length()
    val request = Request.Builder()
        .url("https://api.example.com/files/$fileId/content")
        .header("Range", "bytes=$downloadedBytes-")
        .build()

    client.newCall(request).execute().use { response ->
        localFile.appendingSink().buffer().use { sink ->
            sink.writeAll(response.body!!.source())
        }
    }
}
```

The server must return `206 Partial Content` with a `Content-Range` header for this to work. If the server returns `200` instead, the file has changed and you need to restart the download from scratch.

#### Q4: How would you track sync state for each file?

Maintain a local Room database with a `SyncMetadata` table that tracks each file's sync status. Each entry stores the file ID, local path, remote version (ETag or version number), sync state (`SYNCED`, `PENDING_UPLOAD`, `PENDING_DOWNLOAD`, `CONFLICTED`, `UPLOADING`, `DOWNLOADING`), and last modified timestamps (both local and remote).

```kotlin
@Entity(tableName = "sync_metadata")
data class SyncMetadata(
    @PrimaryKey val fileId: String,
    val localPath: String?,
    val remotePath: String,
    val localModifiedAt: Long,
    val remoteModifiedAt: Long,
    val remoteVersion: String,
    val syncState: SyncState,
    val fileSize: Long,
    val checksum: String?
)

enum class SyncState {
    SYNCED, PENDING_UPLOAD, PENDING_DOWNLOAD,
    UPLOADING, DOWNLOADING, CONFLICTED, ERROR
}
```

When the user modifies a file locally, update its state to `PENDING_UPLOAD`. When the server notifies of a remote change, mark it as `PENDING_DOWNLOAD`. The sync engine processes pending items in priority order.

#### Q5: How would you use WorkManager for background sync?

WorkManager is the right tool for reliable background sync because it guarantees execution even if the app is killed or the device restarts. Schedule a periodic sync worker that runs every 15-30 minutes with network connectivity constraints. For immediate sync (user saves a file), enqueue a one-time work request.

```kotlin
val syncWork = PeriodicWorkRequestBuilder<SyncWorker>(
    15, TimeUnit.MINUTES
).setConstraints(
    Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .setRequiresBatteryNotLow(true)
        .build()
).build()

WorkManager.getInstance(context)
    .enqueueUniquePeriodicWork(
        "periodic_sync",
        ExistingPeriodicWorkPolicy.KEEP,
        syncWork
    )
```

Use `ExistingPeriodicWorkPolicy.KEEP` to avoid restarting the timer if the work is already scheduled. For urgent uploads (user explicitly saves), use an expedited one-time worker.

#### Q6: How would you display upload and download progress to the user?

For foreground transfers, emit progress updates from the transfer function as a `Flow<TransferProgress>` and collect it in the ViewModel. Show a progress bar or percentage in the UI. For background transfers, post progress to a notification — create a foreground service notification with `setProgress()` that updates as chunks complete.

Use WorkManager's `setProgress()` to report progress from a background worker. Observe it in the UI using `WorkManager.getWorkInfoByIdLiveData()` or the Flow equivalent. For multiple simultaneous transfers, maintain a list of active transfers with individual progress states. Show a summary notification ("Uploading 3 files — 67%") and individual progress in an expanded notification or a transfers screen.

#### Q7: What is the difference between push-based and pull-based sync?

Pull-based sync means the client periodically asks the server for changes ("What's new since my last sync?"). It is simpler to implement but introduces latency — changes only appear on the next poll interval. Push-based sync means the server notifies the client when something changes, typically through a WebSocket, Server-Sent Events, or push notification. It gives near-instant updates but requires maintaining a persistent connection.

Most production file sync apps use a hybrid approach. A WebSocket or FCM push tells the client that changes exist, and the client then pulls the actual change list from the server. This gives the low latency of push with the reliability of pull — if the push is missed, the periodic pull catches it.

#### Q8: How would you handle the file browser UI efficiently for large folders?

Paginate the file list — don't load all 10,000 files in a folder at once. Use cursor-based pagination from the server and back it with a local Room database. Show the locally cached file list immediately on screen entry and refresh from the server in the background. Sort files by name, date, or size on the client side if the full folder is cached, or delegate sorting to the server if paginating.

For the UI, use `LazyColumn` with sticky headers for folder groupings. Show file type icons, file size, and last modified date. Indicate sync status with a small icon overlay — a green checkmark for synced, a cloud with an arrow for pending download, and a spinning indicator for active transfer.

### Deep Dive Questions (Advanced to Expert)

#### Q9: How would you design the conflict resolution system?

Conflicts happen when the same file is modified on two devices before either syncs. Detect conflicts by comparing versions — if the local version and remote version both changed since the last sync, it is a conflict. The three main resolution strategies are:

- **Last-write-wins** — whichever modification has the later timestamp wins. Simple but can lose data. Use this for non-critical files like app preferences.
- **Keep both** — save the conflicting version as a separate file (e.g., `report (conflicted copy).docx`). This is what Dropbox does. No data loss, but the user must manually merge.
- **Manual resolution** — show the user both versions and let them choose. Best for important documents but requires UI work.

For text files, you could offer a diff view showing both versions side by side. For binary files (images, PDFs), you can only show metadata (size, date) and let the user pick. Store conflicted files with their conflict metadata in Room and surface them in a "Conflicts" section in the UI.

#### Q10: How would you implement file versioning on the client?

Each file has a version number or ETag that increments on every modification. The server maintains the full version history. On the client, store the current version in `SyncMetadata`. When displaying a file's version history, fetch the list from the server — it returns version ID, timestamp, file size, and who modified it. Let the user preview or restore any previous version.

For the restore flow, the user selects an old version, the client sends a restore request to the server, and the server creates a new version that is a copy of the old one. The client then downloads the restored content. Avoid storing multiple versions locally — it wastes device storage. Keep only the current version on disk and fetch historical versions on demand from the server.

#### Q11: How would you optimize storage on the device?

Not every file needs to be stored locally. Implement a "smart sync" or "online-only" mode where files show up in the file browser but their content is not downloaded until the user opens them. Store only the metadata locally and fetch the content on demand. Mark frequently accessed files as "available offline" so they are always kept on disk.

For cache eviction, use an LRU strategy — when storage exceeds a threshold (configurable by the user, e.g., 2 GB), evict the least recently accessed files by deleting their local content and marking them as online-only. Keep the metadata so the file still appears in the browser. Track local storage usage and show it in settings. On low-storage devices, proactively suggest files to remove based on size and last access time.

#### Q12: How would you handle sharing and permissions on the client?

Sharing involves generating a shareable link or inviting specific users with permission levels (viewer, editor, owner). The client calls the server API to create a share, and the server returns a link or confirms the invitation. Display the current sharing state on the file detail screen — show who has access and their permission level.

For permission enforcement, the server is the authority — the client does not enforce permissions locally. But the client should reflect permissions in the UI — hide the "Edit" button for view-only files, show a lock icon for restricted files, and disable upload for read-only shared folders. When the user tries to edit a view-only file, show a clear message rather than letting the operation fail silently on the server.

#### Q13: How would you design offline access for selected files?

Let the user mark files or folders as "Available Offline." When marked, the sync engine downloads the content immediately and keeps it up to date on every sync cycle. Store offline-pinned file IDs in the local database.

The sync engine treats offline-pinned files with higher priority — download them first, and never evict them during cache cleanup. When the device is offline, the user can browse and open these files normally. Any edits made offline are queued as pending uploads. On reconnection, the sync engine processes the upload queue before regular sync to minimize the window for conflicts. Show a clear indicator in the UI for which files are available offline versus online-only.

#### Q14: How would you handle large file downloads without blocking the UI?

Run downloads in a `CoroutineScope` on `Dispatchers.IO`. For files larger than 50 MB, use a foreground service so the system does not kill the process. Stream the response body directly to a file on disk — do not buffer the entire response in memory.

```kotlin
class DownloadManager(private val client: OkHttpClient) {

    fun downloadFile(url: String, destination: File): Flow<DownloadProgress> = flow {
        val request = Request.Builder().url(url).build()
        client.newCall(request).execute().use { response ->
            val totalBytes = response.body!!.contentLength()
            var downloadedBytes = 0L

            destination.outputStream().use { output ->
                val buffer = ByteArray(8192)
                val source = response.body!!.byteStream()
                var bytesRead: Int
                while (source.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    downloadedBytes += bytesRead
                    emit(DownloadProgress(downloadedBytes, totalBytes))
                }
            }
        }
    }.flowOn(Dispatchers.IO)
}
```

Cancel the download coroutine if the user navigates away or explicitly cancels. Store partial downloads so they can be resumed.

#### Q15: How would you detect local file changes to trigger sync?

On Android, there is no reliable file system watcher like `inotify` for app-scoped storage. Instead, use a checksum-based approach — on each sync cycle, compute the checksum (MD5 or SHA-256) of locally modified files and compare with the stored checksum. If they differ, the file changed and needs uploading.

For files your app manages directly (not shared with other apps), track modifications through your own file operations — whenever your app writes to a file, update the `SyncMetadata` entry. This avoids expensive checksum computation. For shared folders accessed by multiple apps, poll the last modified timestamp of files and compare with the stored value. This is less reliable than checksums but much cheaper. Run the detection as part of the periodic WorkManager sync cycle, not continuously.

#### Q16: How would you handle sync ordering and dependencies?

Certain operations must happen in order. Creating a folder must complete before uploading files into it. Renaming a parent folder must propagate to child paths. Design the sync queue with operation dependencies — each sync operation can declare a dependency on another operation's completion.

Process the queue topologically — folder creates first, then file uploads within those folders. For deletes, reverse the order — delete files first, then empty folders. Use a priority system: user-initiated operations (manual save, explicit upload) get high priority, automatic sync operations get normal priority, and thumbnail generation gets low priority. If an operation fails, mark its dependents as blocked and retry the failed operation with exponential backoff.

#### Q17: How would you architect the sync engine to be testable?

Abstract the sync engine behind interfaces. Create a `RemoteFileSource` interface (wraps API calls), a `LocalFileSource` interface (wraps file system operations), and a `SyncMetadataStore` interface (wraps Room). The sync engine depends only on these interfaces, making it testable with fakes.

Write fakes that simulate server responses, file system states, and conflict scenarios. Test the full sync cycle — local change detected, upload initiated, version updated, metadata synced. Test conflict detection by setting up divergent versions in the fake remote and local sources. Test resume by simulating a network failure mid-upload and verifying that the retry starts from the correct chunk. Test offline queue ordering by queuing multiple operations and verifying they execute in dependency order.

#### Q18: How would you handle sync for files larger than available device memory?

Stream-based processing is essential. Never load the entire file into memory. For uploads, read the file in chunks and upload each chunk as a stream. For downloads, write directly to disk as bytes arrive. For checksum computation, use a streaming hash — read the file in 8 KB buffers and feed each buffer to the `MessageDigest` incrementally.

For very large files (1 GB+), show a clear progress indicator with estimated time remaining. Calculate the estimate from the transfer rate of the last few chunks. Allow the user to cancel and resume later. If the device runs low on storage during download, detect it early (check available space before starting) and warn the user rather than failing halfway through.

### Common Follow-ups

- How would you handle sync when the user renames or moves a file?
- What happens if the server is down for an extended period — how does the client handle queued operations?
- How would you implement selective sync where only certain folders are synced to the device?
- How would you handle file type previews (PDF, images, documents) without downloading the full file?
- How would you design the sharing UI for inviting users and managing permissions?
- How would you test the sync engine with various network conditions (slow, intermittent, offline)?
- How would you handle quota limits — what happens when the user runs out of cloud storage?
- How would you support file search across both local and remote files?
