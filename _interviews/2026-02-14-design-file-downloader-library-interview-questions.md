---
title: "Design a File Downloader Library"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 12
sequence: 66
description: "Designing a file downloader library tests your understanding of HTTP range requests, background processing, disk I/O, and concurrent task management."
---

## Design a File Downloader Library

This one's a greatest hits of mobile engineering. Networking, concurrency, disk I/O, background processing, state machines -- all crammed into one question. If you can design this well, you can design almost anything on mobile.

#### What are the core functional requirements for a file downloader library?

Think of it like a post office for files. You hand it a URL (the address), tell it where to deliver (local storage), and it gives you a tracking number (download ID). With that tracking number you can pause, resume, cancel, and check progress anytime.

The library needs to download files from a URL to local storage, support pause and resume, track progress, and handle multiple concurrent downloads with a queue. And here's the part people forget -- downloads must survive app backgrounding. If the user switches to Instagram mid-download, the file better keep coming.

#### What are the non-functional requirements?

- Downloads must continue in the background even when the app is not visible
- Battery efficiency -- don't keep the CPU awake unnecessarily or poll the network
- Storage management -- check disk space before starting, clean up partial files on cancellation
- Reliability -- retry on transient failures, resume after network loss, persist state across process death
- Configurable concurrency -- limit parallel downloads to avoid saturating bandwidth and disk I/O

#### What would you keep out of scope for an initial design?

For a first version, skip multi-segment parallel downloads (splitting one file across multiple connections), download speed throttling, and authentication. Also skip chunked transfer encoding handling and redirect chains. These are real concerns but they add complexity without changing the core architecture. Focus on single-connection downloads with pause/resume, a task queue, and progress reporting.

#### What are the main components in the architecture?

Three core components, and they split responsibilities cleanly.

**DownloadManager** is the front desk -- it accepts requests, returns download IDs, and exposes pause/resume/cancel/observe APIs. **TaskQueue** is the operations manager -- it holds pending tasks in a priority queue and decides who downloads next. **StorageManager** is the warehouse -- it handles disk space checks, file allocation, and buffered writes.

Supporting these: a **Room database** persists download state so everything survives process death, a **NetworkMonitor** watches connectivity changes, and a **NotificationManager** shows progress to the user. The DownloadManager coordinates all of them.

#### How would you design the public API?

Here's the thing -- a good library API should be boring to use. Builder pattern for requests, a download ID for control, and a Flow for observation.

```kotlin
val downloadId = FileDownloader.enqueue(
    DownloadRequest.Builder("https://example.com/file.zip")
        .setDestination("/storage/downloads/file.zip")
        .setTitle("App Update")
        .setPriority(Priority.HIGH)
        .build()
)

FileDownloader.pause(downloadId)
FileDownloader.resume(downloadId)
FileDownloader.cancel(downloadId)

FileDownloader.observe(downloadId).collect { status ->
    when (status) {
        is Status.Downloading -> updateProgress(status.progress)
        is Status.Completed -> openFile(status.filePath)
        is Status.Failed -> showRetry(status.error)
    }
}
```

Return a `downloadId` on enqueue so the caller can control and observe the download later. Use a sealed class for status so the compiler forces the caller to handle every state -- miss one, and the code won't compile. That's the kind of safety you want.

#### What does the data model look like for a download task?

Each download is a `DownloadTask` entity persisted in Room. It holds everything needed to resume a download from scratch after process death -- like a save file in a video game.

```kotlin
@Entity(tableName = "downloads")
data class DownloadTask(
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
```

The `etag` field is sneaky important. It stores the server's ETag from the initial response. When resuming, you send `If-Range: <etag>` alongside the Range header. If the file changed on the server since you started, the server returns the full file instead of a partial response, and you restart. Without this, you'd end up with a corrupted Frankenstein file -- half old version, half new.

> **🧠 Think about it:** What would happen if you resumed a download but the server had updated the file since you paused? How would you even detect that?

#### How do HTTP Range requests enable resume?

This is the magic behind pause/resume. When the user pauses, you save the byte count already written to disk. To resume, send a `Range: bytes=<downloaded>-` header. The server responds with 206 (Partial Content) and sends only the remaining bytes. You open the file in append mode and keep writing from where you left off.

It's like bookmarking a page in a book. You don't re-read from page one -- you pick up exactly where you stopped.

Plot twist: not all servers support this. Check the `Accept-Ranges: bytes` header on the initial response. If the server returns 200 instead of 206 on a ranged request, it doesn't support partial content and you restart from scratch.

#### What states can a download be in, and how do transitions work?

A download moves through five states: **Queued**, **Downloading**, **Paused**, **Completed**, and **Failed**.

- Queued to Downloading -- the task queue picks it up and a concurrency slot is available
- Downloading to Paused -- user calls pause, or network drops out
- Downloading to Completed -- all bytes written and verified
- Downloading to Failed -- non-retryable error or max retries exceeded
- Paused to Queued -- user calls resume, task re-enters the queue
- Failed to Queued -- user retries, or automatic retry kicks in

Every state transition gets persisted to Room immediately. On app restart, query for tasks in Queued or Downloading state and re-enqueue them. If you don't persist transitions, a process death mid-download means the user loses all progress. Yeah, that trips up everyone.

#### How does notification integration work?

Use a foreground service to keep the process alive during downloads. The notification shows file name, progress bar, download speed, and pause/cancel actions.

```kotlin
class DownloadService : Service() {
    private fun buildProgressNotification(
        title: String, progress: Int, speed: String
    ): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("$speed - $progress%")
            .setSmallIcon(R.drawable.ic_download)
            .setProgress(100, progress, false)
            .setOngoing(true)
            .addAction(R.drawable.ic_pause, "Pause", pauseIntent)
            .addAction(R.drawable.ic_cancel, "Cancel", cancelIntent)
            .build()
    }
}
```

Update the notification at most once per second. More frequent updates cause flicker and waste battery. When the download completes, replace the ongoing notification with a non-ongoing one that opens the file on tap. Group multiple download notifications to avoid spamming the shade.

#### Walk through the pause/resume implementation in detail.

On pause, cancel the coroutine doing the download. The coroutine's finally block flushes any buffered bytes and updates the database with the exact byte count. On resume, read the persisted byte count, send a Range request, and append to the existing file.

```kotlin
suspend fun resumeDownload(task: DownloadTask) {
    val request = Request.Builder()
        .url(task.url)
        .header("Range", "bytes=${task.downloadedBytes}-")
        .build()

    val response = httpClient.newCall(request).await()

    if (response.code == 206) {
        val output = FileOutputStream(File(task.destination), true)
        streamToFile(response.body!!.byteStream(), output, task.downloadedBytes)
    } else if (response.code == 200) {
        val output = FileOutputStream(File(task.destination))
        streamToFile(response.body!!.byteStream(), output, 0L)
    }
}
```

Notice the `true` in `FileOutputStream(File(task.destination), true)` -- that's append mode. Without it, you'd overwrite the file from the beginning. If you stored an ETag, include `If-Range: <etag>` in the request. This tells the server to only honor the Range if the file hasn't changed. If it has changed, the server sends the whole file with a 200, and you overwrite.

#### How do you manage concurrent downloads?

Use a coroutine `Semaphore` to cap parallelism. Think of it like a parking lot with a fixed number of spots. Each download needs to grab a spot before it can start, and when it's done (or paused, or failed), it releases the spot for someone else.

```kotlin
class DownloadExecutor(
    private val maxConcurrent: Int = 3,
    private val scope: CoroutineScope
) {
    private val semaphore = Semaphore(maxConcurrent)
    private val jobs = ConcurrentHashMap<String, Job>()

    fun execute(task: DownloadTask) {
        val job = scope.launch {
            semaphore.acquire()
            try {
                performDownload(task)
            } finally {
                semaphore.release()
            }
        }
        jobs[task.id] = job
    }

    fun pause(id: String) { jobs[id]?.cancel() }
}
```

Three to four concurrent downloads is a good default. More than that and you start thrashing the disk and splitting bandwidth too thin. The semaphore approach is cleaner than managing a thread pool manually because coroutines handle the suspension transparently -- pending downloads just suspend on `semaphore.acquire()` until a slot opens. No busy-waiting, no polling.

> **🧠 Think about it:** If you allow 10 concurrent downloads on a phone, what bottleneck hits first -- network bandwidth, disk I/O, or memory?

#### How do you implement progress tracking without flooding the UI?

Here's the thing -- you're writing bytes to disk thousands of times per second. If you emit a progress update for every chunk, the UI thread will drown. The trick is to emit on every write internally but throttle what actually reaches the UI. A `StateFlow` with a time gate does the job.

```kotlin
class ProgressTracker(private val taskId: String) {
    private val _progress = MutableStateFlow(Progress(0, 0))
    val progress: StateFlow<Progress> = _progress
    private var lastEmitTime = 0L

    fun onBytesWritten(downloaded: Long, total: Long) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastEmitTime > 200) {
            _progress.value = Progress(downloaded, total)
            lastEmitTime = now
        }
    }
}
```

200ms gives smooth progress bar animation without wasting CPU. For notifications, throttle even more -- once per second is enough. Calculate speed by dividing bytes written in the last interval by the interval duration.

#### How should background downloads work on Android?

Use a foreground service for active downloads the user triggered. The system won't kill a foreground service, so the download runs uninterrupted. Android 12+ requires `FOREGROUND_SERVICE` permission and Android 14+ requires `FOREGROUND_SERVICE_DATA_SYNC` type.

For retrying failed downloads or deferred sync, use WorkManager. It survives process death, respects Doze mode, and lets you set constraints like `NetworkType.UNMETERED` (Wi-Fi only). The right pattern is foreground service for active downloads, WorkManager as the fallback for recovery and background syncing. Two tools, two different jobs.

#### What disk I/O strategy should you use?

Stream the HTTP response body and write in 8 KB chunks. Never load the whole file into memory -- a 500 MB video would blow up your process. For large files, pre-allocate disk space before downloading so you fail early if there isn't enough room.

```kotlin
suspend fun streamToFile(
    input: InputStream, output: OutputStream, startBytes: Long
) {
    val buffer = ByteArray(8192)
    var downloaded = startBytes
    input.use { src ->
        output.buffered().use { dst ->
            var bytesRead: Int
            while (src.read(buffer).also { bytesRead = it } != -1) {
                dst.write(buffer, 0, bytesRead)
                downloaded += bytesRead
                progressTracker.onBytesWritten(downloaded, totalBytes)
            }
        }
    }
}
```

Wrapping the output in `BufferedOutputStream` reduces the number of system calls. The default 8 KB buffer means you're doing one system write per 8 KB instead of potentially many smaller ones. Flush periodically (every few hundred KB) so that data isn't lost if the process is killed, but don't flush on every chunk -- that kills throughput.

#### How do you verify file integrity after download?

Imagine downloading a 200 MB APK and it arrives with a few bytes flipped. You install it, the app crashes, and you have no idea why. That's why checksum verification exists. Compute a hash of the downloaded file and compare it to what the server provides.

```kotlin
suspend fun verifyChecksum(
    file: File, expectedHash: String, algorithm: String = "SHA-256"
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

If verification fails, delete the file and re-download. For APK downloads and OTA updates, checksum verification is mandatory for security. SHA-256 is the standard choice -- MD5 is fast but has known collision vulnerabilities.

#### How do you handle retry on network failure?

Use exponential backoff with jitter. Wait 1 second after the first failure, then 2, 4, 8, capped at a few minutes. The jitter part is key -- without it, if your server goes down and comes back up, every failed download retries at the exact same instant. That's a thundering herd, and it'll knock the server right back down.

```kotlin
class RetryPolicy(
    private val maxRetries: Int = 5,
    private val baseDelayMs: Long = 1000
) {
    private var attempts = 0

    fun shouldRetry(error: Throwable): Boolean {
        if (attempts >= maxRetries) return false
        return error is IOException || error is SocketTimeoutException
    }

    suspend fun backoff() {
        val delay = baseDelayMs * (1L shl attempts.coerceAtMost(5))
        val jitter = Random.nextLong(0, delay / 4)
        delay(delay + jitter)
        attempts++
    }
}
```

Only retry on transient errors -- network timeouts, connection resets, 503 responses. Don't retry on 404 or 401. A file that doesn't exist won't magically appear on the fifth try. If the download was partially done and the server supports Range, resume from the last persisted byte offset instead of restarting.

> **🧠 Think about it:** Why is jitter important in retry strategies? What happens if 1,000 clients all retry at exactly the same exponential intervals?

#### How does the priority queue work?

Use a `PriorityBlockingQueue` ordered by priority descending. When a slot opens, the highest-priority pending task gets picked up. If a user-initiated (HIGH) download arrives and all slots are full, you can optionally pause the lowest-priority active download to make room -- like bumping someone from first class.

```kotlin
enum class Priority { LOW, NORMAL, HIGH, IMMEDIATE }

class TaskQueue {
    private val pending = PriorityBlockingQueue<DownloadTask>(
        11, compareByDescending { it.priority }
    )

    fun add(task: DownloadTask) {
        pending.offer(task)
        drainQueue()
    }

    fun next(): DownloadTask? = pending.poll()
}
```

IMMEDIATE priority should bypass the queue entirely and start right away, even if it means exceeding the concurrency limit briefly. This is for critical downloads like security patches. You don't wait in line for a fire exit.

#### How would you test a file downloader library?

Unit test the components in isolation. Mock the HTTP client to return controlled responses -- partial content (206), full content (200), errors (503), and missing Range support. Use a fake file system or temp directory for disk operations. Test the state machine transitions: enqueue goes to Queued, start goes to Downloading, network loss goes to Failed or Paused depending on policy.

Integration test the full flow: enqueue a download against a local test server, verify the file lands on disk, pause and resume it, verify the Range header is sent and the file is complete. Test process death by persisting state, killing the test, restarting, and checking that downloads resume from the right offset. For concurrency, enqueue more downloads than the max concurrent limit and verify that excess tasks wait in the queue.

### Common Follow-ups

- How would you deduplicate if the same URL is requested twice?
- How do you handle network type changes — pausing cellular downloads when Wi-Fi policy is set?
- How would you implement download speed limiting?
- How would you handle authentication for protected file downloads?
- How does Android's built-in DownloadManager compare to building your own?
- How would you split a single large file across multiple connections for faster throughput?
