---
title: "Design a Video Streaming App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 6
level: senior
sequence: 65
---

## Design a Video Streaming App

Video streaming is a common system design question because it touches many mobile-specific concerns — adaptive bitrate, buffering, background playback, offline downloads, and DRM. The interviewer expects you to think about the player architecture, network efficiency, and user experience under varying conditions.

### Core Questions (Beginner → Intermediate)

#### Q1: How would you approach designing a video streaming app from a mobile perspective?

Start with requirements — is this a short-form app (TikTok-style), long-form (YouTube/Netflix), or live streaming? Each has different buffering strategies, preloading needs, and UI patterns. The high-level architecture has a UI layer (player view, video list, controls), a player layer (ExoPlayer or Media3), a data layer (video metadata from API, cached in Room), and a download layer (offline content). The player layer is the most complex — it handles streaming, buffering, adaptive bitrate, DRM decryption, and audio focus.

#### Q2: What is the difference between HLS and DASH?

HLS (HTTP Live Streaming) and DASH (Dynamic Adaptive Streaming over HTTP) are both adaptive bitrate streaming protocols. They work similarly — the video is split into small segments (typically 2-10 seconds), each encoded at multiple quality levels. A manifest file describes all available quality levels, segment URLs, and durations.

- HLS was developed by Apple. It uses `.m3u8` playlists and `.ts` or `.fmp4` segments. It's the only natively supported protocol on iOS, and it's widely supported on Android through ExoPlayer.
- DASH is an open standard (ISO). It uses `.mpd` manifests (XML-based) and `.mp4`/`.webm` segments. It supports more codecs and features but isn't natively supported on iOS.

For cross-platform apps, HLS is the safer choice because it works on both iOS and Android. Many services use HLS with `fMP4` segments, which combines HLS compatibility with the efficiency of fragmented MP4.

#### Q3: What is adaptive bitrate streaming and why does it matter on mobile?

Adaptive bitrate (ABR) streaming automatically adjusts video quality based on the user's current network conditions. Instead of streaming a single fixed-quality file, the server provides the video in multiple quality levels (360p, 720p, 1080p, etc.), and the player switches between them mid-playback based on available bandwidth.

On mobile, this is critical because network conditions change constantly — the user moves from Wi-Fi to cellular, enters a tunnel, or gets congested on a busy cell tower. Without ABR, the player would buffer and stall every time bandwidth drops. With ABR, it drops to a lower quality to keep playback smooth. The tradeoff is occasional visual quality fluctuations, which is better than buffering.

#### Q4: How does ExoPlayer (Media3) work at a high level?

ExoPlayer is Google's open-source media player for Android, now part of the Jetpack Media3 library. It's built around a pipeline architecture.

- **MediaSource** — fetches and parses the media stream (HLS, DASH, progressive).
- **Renderer** — decodes and renders audio and video frames using `MediaCodec`.
- **TrackSelector** — chooses which tracks to play (video quality, audio language, subtitles). The default `AdaptiveTrackSelection` handles ABR switching.
- **LoadControl** — decides when to start buffering and how much data to keep buffered.

```kotlin
val player = ExoPlayer.Builder(context)
    .setTrackSelector(DefaultTrackSelector(context).apply {
        setParameters(buildUponParameters()
            .setMaxVideoSizeSd() // Cap at SD on mobile data
        )
    })
    .setLoadControl(DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            15_000, // Min buffer before playback starts
            50_000, // Max buffer
            2_500,  // Buffer for playback to resume after rebuffer
            5_000   // Buffer for playback with video already rendered
        )
        .build()
    )
    .build()

player.setMediaItem(MediaItem.fromUri(videoUrl))
player.prepare()
player.play()
```

ExoPlayer handles HLS and DASH parsing, adaptive switching, DRM, subtitles, and audio focus internally. The app typically just configures it and listens for state changes.

#### Q5: What is a buffering strategy and how do you configure it?

Buffering determines how much media data the player downloads ahead of the current playback position. `LoadControl` in ExoPlayer has four key parameters — the minimum buffer before playback can start, the maximum buffer to keep downloaded, the buffer required to restart after a rebuffer event, and the buffer to start with when video is already rendered.

A larger buffer means fewer rebuffer events but uses more memory and data. A smaller buffer starts playback faster but risks stalling on network fluctuations. For mobile, a common configuration is 15 seconds minimum buffer and 50 seconds maximum. For live streaming, buffers are much smaller (2-5 seconds) to keep latency low.

#### Q6: How does bandwidth estimation work in a streaming player?

The player measures the download speed of each media segment as it's fetched. ExoPlayer's `DefaultBandwidthMeter` tracks the bytes transferred and the time taken for each load, then calculates a weighted moving average of the bandwidth. More recent measurements have higher weight than older ones, so the estimate adapts to changing conditions.

The ABR algorithm uses this bandwidth estimate to decide which quality level to request for the next segment. If the estimated bandwidth is 5 Mbps and 1080p requires 4 Mbps, the player selects 1080p. If bandwidth drops to 2 Mbps, it drops to 720p on the next segment. The algorithm typically includes a safety margin — it selects a quality level that uses 70-80% of the estimated bandwidth to avoid rebuffering.

#### Q7: How would you structure the video list and metadata layer?

The video list is similar to a feed design — paginated list with thumbnails, titles, and metadata. Use a repository pattern where Room stores cached video metadata (title, description, thumbnail URL, duration, video URL, streaming quality options) and the API provides fresh data.

For the video list screen, load metadata from Room immediately and refresh from the network. Thumbnails should use Coil or Glide with disk caching. For bandwidth efficiency, request thumbnail URLs at the resolution appropriate for the device — a 200dp-wide thumbnail doesn't need a 1080p image. Prefetch metadata and thumbnails for the next few items based on scroll position.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How would you implement offline downloads for video content?

ExoPlayer (Media3) provides a `DownloadManager` that handles downloading HLS and DASH streams for offline playback. It downloads individual segments, tracks progress, supports pause/resume, and works with DRM-protected content.

```kotlin
val downloadManager = DownloadManager(
    context,
    DatabaseProvider(context),
    downloadCache,
    OkHttpDataSource.Factory(okHttpClient),
    Executor(Dispatchers.IO.asExecutor())
)

// Start a download
val downloadRequest = DownloadRequest.Builder(
    videoId, Uri.parse(hlsUrl)
).build()
DownloadService.sendAddDownload(
    context, MyDownloadService::class.java, downloadRequest, false
)
```

The downloaded content is stored in a `Cache` directory on disk. For playback, create a `CacheDataSource.Factory` that reads from the local cache first and falls back to the network for anything not cached. Store download metadata (video ID, download state, file size, expiry) in Room so the UI can show download progress and manage offline content. Respect storage constraints — check available space before starting downloads and let the user set quality preferences for downloads.

#### Q9: What is DRM and how does it work on Android?

DRM (Digital Rights Management) protects copyrighted video content from unauthorized copying and redistribution. On Android, the primary DRM system is Widevine, which is built into the platform. Widevine has three security levels — L1 (hardware-backed TEE, required for HD/4K), L2 (software with hardware crypto), and L3 (software only, SD quality max).

The DRM flow works like this: the player encounters a DRM-protected stream, extracts the content encryption key ID from the manifest, sends a license request to a license server with the device's security info, receives a license containing the decryption keys, and MediaCodec uses the keys in the secure hardware (Trusted Execution Environment) to decrypt and render the content. The decrypted content never leaves the TEE on L1 devices, so screen recording captures a black screen.

ExoPlayer handles this transparently. You configure a `DefaultDrmSessionManager` with the license server URL, and ExoPlayer manages the license acquisition, renewal, and key rotation.

#### Q10: How would you implement background playback for audio from a video?

When the user switches to another app or locks the screen, video rendering stops but audio should continue (like YouTube Premium's background play). Use a `MediaSessionService` (Media3) or `MediaBrowserServiceCompat` to run the player in a foreground service. The foreground service keeps the process alive, and the notification provides playback controls.

```kotlin
class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this).build()
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
        }
        super.onDestroy()
    }
}
```

The `MediaSession` integrates with the system media controls, lock screen, Bluetooth, and Android Auto. When the app is backgrounded, release the video surface to free GPU memory but keep the audio renderer active. This is also where audio focus management matters — request audio focus before playing and respond to focus changes (duck volume, pause on transient loss).

#### Q11: How do you implement picture-in-picture (PiP) mode?

PiP lets the user continue watching a video in a small floating window while using other apps. Declare PiP support in the manifest (`android:supportsPictureInPicture="true"`) and enter PiP by calling `enterPictureInPictureMode()` with `PictureInPictureParams`.

```kotlin
fun enterPiP(activity: Activity, videoAspectRatio: Rational) {
    val params = PictureInPictureParams.Builder()
        .setAspectRatio(videoAspectRatio)
        .setActions(listOf(
            RemoteAction(
                Icon.createWithResource(activity, R.drawable.ic_pause),
                "Pause", "Pause playback",
                PendingIntent.getBroadcast(
                    activity, 0,
                    Intent("ACTION_PAUSE"),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
        ))
        .build()
    activity.enterPictureInPictureMode(params)
}
```

When entering PiP, the system resizes the activity window. You need to handle this — hide all UI elements except the video player, adjust player controls for the small window size, and respond to `onPictureInPictureModeChanged()` to toggle between full and PiP layouts. Custom actions in PiP are limited to `RemoteAction` icons — you can't show arbitrary UI. On Android 12+, you can use `setAutoEnterEnabled(true)` to automatically enter PiP when the user swipes home during video playback.

#### Q12: How would you implement video caching for a feed with multiple videos?

For a TikTok-style feed where users scroll through short videos, preloading is essential. Cache the first few seconds of the next 2-3 videos so playback starts instantly when the user scrolls.

Use ExoPlayer's `CacheDataSource` backed by a `SimpleCache` with a size limit (e.g., 100MB). When the user is viewing video N, start preloading videos N+1 and N+2 in the background. The preload just downloads the initial segments into the cache without rendering them.

The tradeoff is data usage — preloading videos the user never watches wastes bandwidth. On cellular networks, reduce preloading to just the next video and lower the preload amount (2-3 seconds instead of 5-10). On Wi-Fi, preload more aggressively. Also set an eviction policy on the cache — LRU eviction when the cache exceeds its size limit, so old cached segments get purged automatically.

#### Q13: How does the player handle network transitions mid-stream (Wi-Fi to cellular)?

When the network changes, active connections may break. ExoPlayer handles this through its retry logic in the data source layer — if a segment download fails, it retries after a brief delay. The `DefaultLoadControl` continues playback from the buffer while the retry happens.

The ABR algorithm also adapts. After a network transition, the bandwidth estimator needs new measurements from the cellular connection. ExoPlayer's `DefaultBandwidthMeter` can be configured with initial estimates per network type — 10 Mbps for Wi-Fi, 2 Mbps for cellular — so the first few segments after a transition use a reasonable quality instead of guessing. As real measurements come in, the estimate converges to the actual bandwidth.

For the user experience, you might want to show a brief quality reduction notification and let the user know they've switched to cellular data, especially if they have data limits.

#### Q14: How would you implement a seek preview with thumbnails?

When the user drags the seek bar, show thumbnail previews of the video at that timestamp. There are two approaches. The server can provide a thumbnail sprite sheet — a single image containing thumbnails at regular intervals (every 5-10 seconds), with a VTT file mapping timestamps to sprite positions. The client loads the sprite sheet, and when the user seeks, it crops the correct thumbnail from the sheet.

The second approach generates thumbnails on-device using `MediaMetadataRetriever.getFrameAtTime()`. This is slower and more battery-intensive because it decodes video frames locally. For a production app, server-generated sprite sheets are the standard approach because they're fast to display and don't require any decoding work on the client. The thumbnail sprite is typically a single JPEG that's 200-500KB for an entire video, which is negligible compared to the video itself.

#### Q15: How do you handle video quality selection vs automatic ABR?

Give the user a quality selector in the player settings — Auto, 360p, 480p, 720p, 1080p. "Auto" uses the ABR algorithm. Manual selection overrides the track selector to lock a specific quality.

```kotlin
fun setVideoQuality(player: ExoPlayer, maxHeight: Int?) {
    val trackSelector = player.trackSelector as? DefaultTrackSelector ?: return
    trackSelector.setParameters(
        trackSelector.buildUponParameters().apply {
            if (maxHeight != null) {
                setMaxVideoSize(Int.MAX_VALUE, maxHeight)
                setForceHighestSupportedBitrate(true)
            } else {
                clearVideoSizeConstraints()
                setForceHighestSupportedBitrate(false)
            }
        }
    )
}
```

When the user selects a specific quality, also consider the data cost. If they select 1080p on cellular, show a warning about data usage. Save the preference in DataStore so it persists across sessions. Some apps have separate quality preferences for Wi-Fi and cellular — auto (up to 1080p) on Wi-Fi, max 480p on cellular.

#### Q16: How do you optimize battery consumption during video playback?

Video playback is one of the most battery-intensive operations on a device. The main consumers are screen brightness, video decoding, network I/O, and audio decoding. Hardware decoding (`MediaCodec` with hardware acceleration) is significantly more power-efficient than software decoding — ExoPlayer uses hardware decoders by default.

Other optimizations: reduce the render frame rate for static content (a podcast video with a still image doesn't need 30fps rendering), use efficient codecs (HEVC/H.265 requires less bandwidth than H.264 for the same quality, reducing network I/O), lower the streaming quality on battery-saver mode, and avoid keeping the CPU awake unnecessarily when the player is paused. The `WakeLock` should only be held during active playback.

#### Q17: How would you handle live streaming vs on-demand video differently?

Live streaming has fundamentally different requirements. The buffer must be small (2-5 seconds) to keep latency low — users watching a live sports event don't want to be 30 seconds behind. There's no seek bar (though DVR-style rewind is possible). The manifest updates periodically with new segment URLs, and the player polls for these updates.

On-demand video has a larger buffer (15-50 seconds), full seek capability, known total duration, and the manifest is static. The player downloads segments ahead of the current position based on `LoadControl` settings.

In ExoPlayer, live streaming uses `MediaItem.Builder().setLiveConfiguration()` to set target live offset, min/max offsets, and playback speed adjustment. The player automatically adjusts playback speed slightly (1.02x or 0.98x) to stay at the target live offset without the user noticing.

#### Q18: How would you design the video player's error handling and recovery?

Categorize errors into recoverable and non-recoverable. Recoverable errors include network timeout (retry the segment), HTTP 503 (backoff and retry), and temporary DRM license errors. Non-recoverable errors include HTTP 403/404 (content not available), unsupported codec, and permanent DRM failures.

For recoverable errors, ExoPlayer retries segment loads automatically (configurable retry count and delay). For non-recoverable errors, show a user-friendly error state with a retry button. Log the error details — error type, player state, network conditions, device info — to your analytics system. Track rebuffer rate, error rate, and time-to-first-frame as key player health metrics. A high rebuffer rate might indicate overly aggressive quality selection or insufficient initial buffering.

#### Q19: How do you handle multiple audio tracks and subtitles?

HLS and DASH manifests declare multiple audio tracks (languages, commentary) and subtitle tracks. ExoPlayer parses these from the manifest and makes them available through the `TrackSelector`. The user selects their preferred language and subtitle in the player settings.

```kotlin
fun selectAudioTrack(player: ExoPlayer, languageCode: String) {
    val trackSelector = player.trackSelector as? DefaultTrackSelector ?: return
    trackSelector.setParameters(
        trackSelector.buildUponParameters()
            .setPreferredAudioLanguage(languageCode)
    )
}

fun selectSubtitle(player: ExoPlayer, languageCode: String) {
    val trackSelector = player.trackSelector as? DefaultTrackSelector ?: return
    trackSelector.setParameters(
        trackSelector.buildUponParameters()
            .setPreferredTextLanguage(languageCode)
    )
}
```

Save the user's language preferences in DataStore and apply them to every new playback session. For subtitles, also consider rendering style — custom fonts, colors, background opacity. ExoPlayer supports CEA-608, CEA-708, WebVTT, and TTML subtitle formats. The subtitles render in an overlay view on top of the video surface.

#### Q20: How would you architect the app to handle both streaming and downloaded content with the same player?

Use a `CacheDataSource.Factory` that checks the local cache first and falls back to the network. For fully downloaded content, all segments are in the cache, so no network call is made. For streaming content, the cache acts as a read-through cache — segments are cached as they're streamed, so rewinding to a previously watched section plays from cache.

The key architectural decision is making the player agnostic to whether content is online or offline. The `MediaItem` stays the same — the `DataSource.Factory` handles the routing. For downloads, ExoPlayer's `DownloadManager` writes segments to the same `Cache` that the streaming player reads from. This way, partially downloaded content also works — segments that are downloaded play from cache, and remaining segments stream from the network. The UI shows download progress and lets the user start watching before the download completes.

### Common Follow-ups

- How would you implement video recommendations on the client side?
- What's the difference between hardware and software video decoding?
- How do you handle video aspect ratio changes (16:9, 4:3, vertical video)?
- How would you implement a video player with Jetpack Compose?
- What metrics would you track to measure video playback quality?
- How does Widevine DRM security level affect what you can stream?
- How would you handle casting video to a Chromecast or TV?
- What's the difference between progressive download and adaptive streaming?
