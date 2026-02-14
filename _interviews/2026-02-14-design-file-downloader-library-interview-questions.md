---
title: "Design a File Downloader Library"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 12
sequence: 74
description: "Designing a file downloader library tests your understanding of HTTP range requests, background processing, disk I/O, and concurrent task management."
---

## Design a File Downloader Library

File downloader design comes up in system design rounds because it combines networking, background processing, disk management, and state handling into one problem. It tests whether you can handle real-world concerns like pause/resume, progress tracking, and reliability across process restarts.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the core responsibilities of a file downloader library?

A file downloader manages downloading files from a URL to local storage. It handles HTTP connections, writes data to disk in chunks, tracks progress, supports pause/resume, manages concurrent downloads with a queue, handles retries on failure, and shows progress through notifications. It also needs to survive process death — if the user switches apps, the download should continue.

The basic pipeline is: **Request → Queue → Allocate disk space → HTTP GET → Stream to disk → Progress callbacks → Completion/retry**.

#### Q2: How would you design the public API?

Keep it simple for common use and flexible for advanced configuration. A request builder pattern works well.

```kotlin
val downloadId = FileDownloader.enqueue(
    DownloadRequest.Builder("https://example.com/file.zip")
        .setDestination("/storage/downloads/file.zip")
        .setTitle("App Update")
        .setPriority(Priority.HIGH)
        .setNotificationEnabled(true)
        .build()
)

// Control
FileDownloader.pause(downloadId)
FileDownloader.resume(downloadId)
FileDownloader.cancel(downloadId)

// Observe progress
FileDownloader.observe(downloadId).collect { status ->
    when (status) {
        is Status.Downloading -> updateProgress(status.progress)
        is Status.Completed -> openFile(status.filePath)
        is Status.Failed -> showRetry(status.error)
    }
}
```

Return a `downloadId` on enqueue so the caller can control and observe the download later. Use a sealed class for download status so the caller handles every state explicitly.

#### Q3: How do you download a file in chunks?

Read the HTTP response body as a stream and write it to disk in fixed-size chunks (typically 8 KB or 16 KB). Never load the entire file into memory — a 500 MB file would crash the app.

```kotlin
suspend fun downloadFile(url: String, destination: File) {
    val response = httpClient.get(url)
    val contentLength = response.header("Content-Length")?.toLong() ?: -1L
    val inputStream = response.body?.byteStream() ?: return
    val outputStream = FileOutputStream(destination)

    val buffer = ByteArray(8192) // 8 KB chunks
    var bytesDownloaded = 0L

    inputStream.use { input ->
        outputStream.use { output ->
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                output.write(buffer, 0, bytesRead)
                bytesDownloaded += bytesRead
                emitProgress(bytesDownloaded, contentLength)
            }
        }
    }
}
```

The `Content-Length` header tells you the total file size for progress calculation. Some servers don't send it (chunked transfer encoding), in which case you show indeterminate progress. Flush the output stream periodically to avoid data loss if the process is killed.

#### Q4: How does pause/resume work with HTTP Range headers?

When the user pauses a download, save the number of bytes already downloaded. To resume, send an HTTP request with a `Range` header that tells the server to start from where you left off. The server responds with 206 (Partial Content) and sends only the remaining bytes.

```kotlin
suspend fun resumeDownload(url: String, destination: File, bytesDownloaded: Long) {
    val request = Request.Builder()
        .url(url)
        .header("Range", "bytes=$bytesDownloaded-")
        .build()

    val response = httpClient.newCall(request).await()

    if (response.code == 206) {
        // Append to existing file
        val outputStream = FileOutputStream(destination, true) // append mode
        writeToStream(response.body!!.byteStream(), outputStream, bytesDownloaded)
    } else if (response.code == 200) {
        // Server doesn't support Range — restart from beginning
        val outputStream = FileOutputStream(destination) // overwrite
        writeToStream(response.body!!.byteStream(), outputStream, 0L)
    }
}
```

Not all servers support Range requests. Check the response for the `Accept-Ranges: bytes` header to know if resume is supported. If the server returns 200 instead of 206, it doesn't support partial content and you have to restart from scratch. Store the downloaded byte count in a database so it survives process death.

#### Q5: How would you track and report download progress?

Emit progress updates as you write each chunk. Use a `Flow` or callback to deliver progress to the UI. Throttle the updates — emitting on every 8 KB chunk would flood the UI with thousands of updates per second for a fast download.

```kotlin
class DownloadTask(private val downloadId: String) {
    private val _progress = MutableStateFlow(DownloadProgress(0, 0))
    val progress: StateFlow<DownloadProgress> = _progress

    private var lastEmitTime = 0L

    suspend fun download(url: String, destination: File) {
        // ... read chunks ...
        bytesDownloaded += bytesRead
        val now = SystemClock.elapsedRealtime()
        if (now - lastEmitTime > 200) { // emit at most every 200ms
            _progress.value = DownloadProgress(bytesDownloaded, totalBytes)
            lastEmitTime = now
        }
    }
}
```

200ms throttling gives smooth UI updates without wasting CPU on unnecessary emissions. For notification progress, update even less frequently — every 1-2 seconds is enough. Calculate download speed by tracking bytes downloaded over time intervals.

#### Q6: How do you check disk space before downloading?

Before starting a download, verify that the target storage has enough free space. The `Content-Length` header tells you the file size. Compare it against available space with a buffer (at least 10% extra to avoid filling the disk completely).

```kotlin
fun hasEnoughSpace(destination: File, contentLength: Long): Boolean {
    val stat = StatFs(destination.parentFile?.path ?: return false)
    val availableBytes = stat.availableBytes
    val requiredBytes = contentLength + (contentLength / 10) // 10% buffer
    return availableBytes > requiredBytes
}
```

If there's not enough space, fail early with a clear error instead of downloading halfway and then failing on a disk-full write. On Android 11+, scoped storage limits where you can write — use `MediaStore` for shared downloads or the app's internal storage for private files.

#### Q7: How would you handle download prioritization?

Not all downloads are equal. A user-initiated download should start immediately, while a prefetch download can wait. Use a priority queue where higher-priority downloads are dequeued first.

```kotlin
enum class Priority { LOW, NORMAL, HIGH, IMMEDIATE }

class DownloadQueue {
    private val queue = PriorityBlockingQueue<DownloadTask>(
        11,
        compareByDescending { it.priority }
    )
    private val activeDownloads = AtomicInteger(0)
    private val maxConcurrent = 3

    fun enqueue(task: DownloadTask) {
        queue.add(task)
        processNext()
    }

    private fun processNext() {
        while (activeDownloads.get() < maxConcurrent) {
            val task = queue.poll() ?: break
            activeDownloads.incrementAndGet()
            scope.launch {
                task.execute()
                activeDownloads.decrementAndGet()
                processNext()
            }
        }
    }
}
```

Limit concurrent downloads to 3-4 to avoid overwhelming the network and disk I/O. When a high-priority download arrives and all slots are full, either pause the lowest-priority active download or wait for a slot to open. Android's `DownloadManager` limits to a system-defined number of concurrent downloads (usually 5).

#### Q8: How would you show download progress in a notification?

Use a foreground service with a notification that shows the download progress. This is required on Android 8+ for long-running background work. The notification must show a progress bar, the file name, and download speed.

```kotlin
class DownloadService : Service() {

    private fun createProgressNotification(
        title: String,
        progress: Int,
        speed: String
    ): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("$speed - $progress%")
            .setSmallIcon(R.drawable.ic_download)
            .setProgress(100, progress, false)
            .setOngoing(true)
            .addAction(R.drawable.ic_pause, "Pause", pausePendingIntent)
            .addAction(R.drawable.ic_cancel, "Cancel", cancelPendingIntent)
            .build()
    }
}
```

Update the notification at most once per second — more frequent updates cause notification flicker and waste battery. When the download completes, replace the progress notification with a completion notification that opens the file on tap. Group multiple download notifications to avoid spamming the notification shade.

### Deep Dive Questions (Advanced → Expert)

#### Q9: Should you use WorkManager or a Foreground Service for downloads?

It depends on the download duration and user expectation.

**Foreground Service** is right for user-initiated downloads that should complete soon (downloading a file the user explicitly requested). The user sees a notification with progress and expects it to finish. The system won't kill a foreground service, so the download runs uninterrupted.

**WorkManager** is better for deferred or background downloads (syncing offline content, prefetching files). WorkManager survives process death, handles constraints (network type, battery level), and retries automatically. But WorkManager tasks are subject to system scheduling — they might not start immediately and can be deferred by Doze mode.

For most download managers, use a foreground service for active downloads and WorkManager for retrying failed downloads when connectivity is restored. Android 12+ requires the `FOREGROUND_SERVICE` permission and Android 14+ requires `FOREGROUND_SERVICE_DATA_SYNC` type.

#### Q10: How would you implement retry with exponential backoff?

When a download fails due to a network error, don't retry immediately — the network might still be down. Use exponential backoff: wait 1 second, then 2, then 4, then 8, capped at 5 minutes. Add jitter to prevent all failed downloads from retrying simultaneously.

```kotlin
class RetryPolicy(
    private val maxRetries: Int = 5,
    private val baseDelayMs: Long = 1000
) {
    private var retryCount = 0

    fun shouldRetry(error: Throwable): Boolean {
        if (retryCount >= maxRetries) return false
        return error is IOException || error is SocketTimeoutException
    }

    suspend fun waitForRetry() {
        val delay = baseDelayMs * (1L shl retryCount.coerceAtMost(5))
        val jitter = Random.nextLong(0, delay / 4)
        delay(delay + jitter)
        retryCount++
    }

    fun reset() { retryCount = 0 }
}
```

Only retry on transient errors — network failures, timeouts, 503 responses. Don't retry on 404 (file not found) or 401 (unauthorized). If the download was partially complete and the server supports Range headers, resume from where it stopped instead of restarting.

#### Q11: How would you verify file integrity after download?

Use checksum verification to confirm the downloaded file matches what the server intended. The server provides a checksum (MD5, SHA-256) either in a response header, a separate API endpoint, or alongside the download link. After the download completes, compute the checksum of the local file and compare.

```kotlin
suspend fun verifyChecksum(
    file: File,
    expectedHash: String,
    algorithm: String = "SHA-256"
): Boolean = withContext(Dispatchers.IO) {
    val digest = MessageDigest.getInstance(algorithm)
    val buffer = ByteArray(8192)

    file.inputStream().use { input ->
        var bytesRead: Int
        while (input.read(buffer).also { bytesRead = it } != -1) {
            digest.update(buffer, 0, bytesRead)
        }
    }

    val hash = digest.digest().joinToString("") { "%02x".format(it) }
    hash.equals(expectedHash, ignoreCase = true)
}
```

If verification fails, delete the corrupted file and re-download. For large files, consider using chunked checksums where each chunk has its own hash — this way you only re-download the corrupted chunk, not the entire file. APK downloads and OTA updates always use checksum verification for security.

#### Q12: How would you handle large file downloads (1 GB+)?

Large files need special handling to avoid memory issues and provide a good experience:

- **Stream to disk** — Never buffer the entire file in memory. Read and write in 8-16 KB chunks
- **Chunked downloads** — Split the file into segments (e.g., 10 MB each) and download them in parallel using Range headers. This can increase throughput on fast connections. Merge the chunks after all complete
- **Pre-allocate disk space** — Call `RandomAccessFile.setLength(totalSize)` before downloading. This ensures you don't run out of space halfway through and helps the filesystem allocate contiguous blocks
- **Progress persistence** — Save the downloaded byte count to a database every few seconds, not just in memory. If the process is killed, you know exactly where to resume
- **Network type awareness** — For cellular connections, warn the user about data usage before downloading files over a configurable threshold (e.g., 50 MB)

```kotlin
// Pre-allocate disk space
fun preallocateFile(destination: File, size: Long) {
    RandomAccessFile(destination, "rw").use { raf ->
        raf.setLength(size)
    }
}
```

Android's `DownloadManager` handles many of these concerns internally — for simple use cases, it's worth using instead of building a custom solution.

#### Q13: How would you handle concurrent downloads with a download manager?

A download manager needs to limit concurrent downloads while keeping a queue of pending requests. Use a coroutine-based approach with a `Semaphore` to limit parallelism.

```kotlin
class DownloadManager(
    private val maxConcurrent: Int = 3,
    private val scope: CoroutineScope
) {
    private val semaphore = Semaphore(maxConcurrent)
    private val activeDownloads = ConcurrentHashMap<String, Job>()
    private val downloadDao: DownloadDao // persists download state

    fun enqueue(request: DownloadRequest): String {
        val id = UUID.randomUUID().toString()
        downloadDao.insert(DownloadEntity(id, request.url, Status.QUEUED))

        val job = scope.launch {
            semaphore.acquire()
            try {
                downloadDao.updateStatus(id, Status.DOWNLOADING)
                executeDownload(id, request)
                downloadDao.updateStatus(id, Status.COMPLETED)
            } catch (e: CancellationException) {
                downloadDao.updateStatus(id, Status.PAUSED)
            } catch (e: Exception) {
                downloadDao.updateStatus(id, Status.FAILED)
            } finally {
                semaphore.release()
            }
        }
        activeDownloads[id] = job
        return id
    }
}
```

Persist download state (URL, destination, bytes downloaded, status) in a Room database. On app restart, query for incomplete downloads and re-enqueue them. The semaphore ensures only `maxConcurrent` downloads run simultaneously — others wait in the coroutine queue.

#### Q14: How would you handle downloads across network changes?

Network changes (Wi-Fi to cellular, connectivity loss) are common during long downloads. Use `ConnectivityManager.NetworkCallback` to detect network state changes and react appropriately.

When connectivity is lost, pause the download and save progress. When connectivity returns, check if the server supports Range headers and resume. If the user switched from Wi-Fi to cellular, check the download policy — some downloads should only proceed on Wi-Fi (especially large files).

```kotlin
class NetworkMonitor(context: Context) {
    private val connectivityManager = context.getSystemService(ConnectivityManager::class.java)

    val networkState = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(NetworkState.Connected)
            }
            override fun onLost(network: Network) {
                trySend(NetworkState.Disconnected)
            }
            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities
            ) {
                val isWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                trySend(if (isWifi) NetworkState.Wifi else NetworkState.Cellular)
            }
        }
        connectivityManager.registerDefaultNetworkCallback(callback)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }
}
```

For WorkManager-based downloads, set network constraints directly — `NetworkType.CONNECTED` or `NetworkType.UNMETERED` (Wi-Fi only). WorkManager handles the scheduling automatically.

#### Q15: How would you design the persistence layer for download state?

Every download's state must survive process death. Use Room to store download metadata: ID, URL, destination path, total bytes, downloaded bytes, status (queued, downloading, paused, completed, failed), priority, created timestamp, and retry count.

```kotlin
@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val id: String,
    val url: String,
    val destination: String,
    val totalBytes: Long = 0,
    val downloadedBytes: Long = 0,
    val status: String = "QUEUED",
    val priority: Int = 0,
    val retryCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val etag: String? = null
)

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads WHERE status IN ('QUEUED', 'DOWNLOADING') ORDER BY priority DESC")
    fun getPendingDownloads(): List<DownloadEntity>

    @Query("UPDATE downloads SET downloadedBytes = :bytes WHERE id = :id")
    suspend fun updateProgress(id: String, bytes: Long)

    @Query("UPDATE downloads SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)
}
```

Save the ETag from the initial response. When resuming, send `If-Range: <etag>` along with the Range header. If the file changed on the server (ETag mismatch), the server returns the full file instead of a partial response. Update progress in the database periodically (every 500 KB or every 2 seconds), not on every chunk — excessive writes slow down the download.

#### Q16: How would you design a multi-segment parallel download?

Split a large file into segments and download each segment in parallel using Range headers. This saturates the network bandwidth better because a single HTTP connection might be throttled by the server.

```kotlin
class SegmentedDownloader(
    private val segmentCount: Int = 4
) {
    suspend fun download(url: String, destination: File, totalSize: Long) {
        val segmentSize = totalSize / segmentCount

        val jobs = (0 until segmentCount).map { index ->
            val start = index * segmentSize
            val end = if (index == segmentCount - 1) totalSize - 1 else start + segmentSize - 1
            scope.async(Dispatchers.IO) {
                downloadSegment(url, destination, start, end, index)
            }
        }
        jobs.awaitAll()
    }

    private suspend fun downloadSegment(
        url: String, destination: File,
        start: Long, end: Long, index: Int
    ) {
        val request = Request.Builder()
            .url(url)
            .header("Range", "bytes=$start-$end")
            .build()

        val response = httpClient.newCall(request).await()
        RandomAccessFile(destination, "rw").use { raf ->
            raf.seek(start)
            response.body!!.byteStream().copyTo(raf)
        }
    }
}
```

Pre-allocate the destination file to the full size, then each segment writes to its own offset using `RandomAccessFile.seek()`. Track each segment's progress independently. If one segment fails, retry just that segment. This approach works well for CDN-served files where each connection gets consistent bandwidth. The tradeoff is complexity — you need to track per-segment state for pause/resume.

### Common Follow-ups

- How would you handle download deduplication if the same URL is requested twice?
- What happens if the server doesn't support Range requests? How do you handle resume?
- How would you implement download speed limiting to avoid consuming all bandwidth?
- How would you handle authentication for protected file downloads?
- How does Android's built-in DownloadManager compare to building your own?
- How would you handle downloading a file that requires following redirects?
- How would you test a download library? What would you mock?
