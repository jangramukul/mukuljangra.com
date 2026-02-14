---
title: "Design a Video Streaming App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 6
sequence: 60
description: "Video streaming is a common system design question because it touches many mobile-specific concerns — adaptive bitrate, buffering, background..."
---

## Design a Video Streaming App

Video streaming apps touch nearly every hard problem in mobile engineering — adaptive bitrate, buffering under flaky networks, background playback, offline downloads, and DRM. This walkthrough designs one step by step.

#### What are the core functional requirements for a video streaming app?

The user needs to browse a catalog of videos, search for content, and play videos with standard controls (play, pause, seek, fullscreen). Beyond the basics, resume playback from where the user left off across devices and sessions. Let the user select video quality manually or leave it on auto. Support multiple audio tracks and subtitles for different languages.

For a YouTube-style app, add short-form and long-form content, playlists, and recommendations. For a Netflix-style app, focus on series with episodes, continue-watching, and profiles. Clarify the scope with the interviewer before going deeper.

#### What are the key non-functional requirements?

- **Adaptive bitrate streaming** — Video quality adjusts automatically based on network conditions. No buffering on a stable 4G connection
- **Offline downloads** — Users can download videos over Wi-Fi and watch them without a connection
- **Background playback** — Audio continues when the app is minimized or the screen is locked
- **Low time-to-first-frame** — Playback should start within 1-2 seconds on a decent connection
- **Battery efficiency** — Hardware decoding, smart buffering, and no unnecessary wake locks
- **DRM** — Premium content must be protected against screen recording and redistribution

The non-functional requirements drive most of the architecture decisions. ABR and buffering affect the player layer. Offline downloads affect the data layer. Background playback affects the service layer.

#### What would you keep out of scope for a 45-minute design session?

Keep out: user authentication, payment and subscription management, video upload pipeline, recommendation engine backend, social features (comments, likes), and analytics dashboards. These are real features but they don't test mobile video streaming skills. Focus on the playback pipeline, streaming architecture, offline support, and player integration with the Android system. If the interviewer asks about any of these, you can discuss them at a high level without designing them fully.

#### How would you structure the client architecture?

The architecture has four layers:

- **UI layer** — Video list screen, player screen with controls, download manager screen. Observes state from ViewModels
- **Player layer** — ExoPlayer (Media3) handles streaming, decoding, ABR, and DRM. This is the most complex layer
- **Data layer** — Repository coordinating between REST APIs (catalog, video metadata), Room (cached metadata, playback state, download records), and a disk cache (video segments)
- **Service layer** — Foreground service for background playback, WorkManager for offline downloads

The player layer sits between the UI and data layers. The UI sends commands (play, pause, seek), the player fetches segments through the data layer's cache, and state flows back up to the UI. The service layer keeps things alive when the app is in the background.

#### Why ExoPlayer / Media3 as the playback engine?

ExoPlayer is Google's open-source media player, now part of Jetpack Media3. The framework `MediaPlayer` has limited format support, poor error handling, and no adaptive streaming. ExoPlayer supports HLS and DASH for adaptive bitrate, handles DRM through Widevine, supports subtitles in multiple formats, and manages audio focus internally.

ExoPlayer is built around a pipeline: `MediaSource` fetches and parses the stream, `Renderer` decodes frames using `MediaCodec`, `TrackSelector` picks the right quality and language tracks, and `LoadControl` decides how much to buffer. The app configures these components and listens for state changes — ExoPlayer handles the rest.

```kotlin
val player = ExoPlayer.Builder(context)
    .setTrackSelector(DefaultTrackSelector(context).apply {
        setParameters(buildUponParameters().setMaxVideoSizeSd())
    })
    .setLoadControl(DefaultLoadControl.Builder()
        .setBufferDurationsMs(15_000, 50_000, 2_500, 5_000)
        .build()
    )
    .build()

player.setMediaItem(MediaItem.fromUri(streamUrl))
player.prepare()
player.play()
```

#### What APIs does the client need from the backend?

Three main APIs:

- **Catalog API** — Paginated list of videos with metadata (title, description, thumbnail URL, duration, tags). Supports search and filtering. Returns lightweight objects for the browse screen
- **Video Detail API** — Full metadata for a single video, including the stream manifest URL, available quality levels, subtitle tracks, audio tracks, and resume position
- **Playback State API** — Syncs the user's playback position so they can resume on any device. The client posts the current position periodically (every 30 seconds) and fetches it when starting playback

The actual video segments come from a CDN, not the API server. The API just returns the manifest URL, and the player fetches segments directly from the CDN. This keeps the API server lightweight and the video delivery fast.

#### What data models would you use on the client?

Three core models cover the app's state:

```kotlin
data class Video(
    val id: String,
    val title: String,
    val description: String,
    val thumbnailUrl: String,
    val durationMs: Long,
    val manifestUrl: String,
    val qualities: List<String>  // "360p", "720p", "1080p"
)

data class PlaybackState(
    val videoId: String,
    val positionMs: Long,
    val lastUpdated: Long
)

data class DownloadedContent(
    val videoId: String,
    val quality: String,
    val sizeBytes: Long,
    val status: DownloadStatus,  // QUEUED, DOWNLOADING, COMPLETED, FAILED
    val progress: Float
)
```

`Video` is cached in Room for offline catalog browsing. `PlaybackState` syncs to the server and also persists locally so resume works even without network. `DownloadedContent` tracks what's been downloaded — the actual segments live in ExoPlayer's disk cache, but Room tracks the metadata so the UI can show download status and manage storage.

#### How would you design the caching strategy?

Two separate caches for two different kinds of data. ExoPlayer's `SimpleCache` handles video segments on disk. Set a size limit (200-500MB) with LRU eviction so old segments get purged automatically. This cache serves double duty — it caches segments during streaming (so rewinding plays from cache) and stores downloaded content for offline playback.

Room handles metadata caching — video catalog, playback positions, download records, and user preferences. Load the video list from Room immediately on launch and refresh from the network in the background. Thumbnails go through Coil or Glide with their own disk cache. Request thumbnails at the right resolution for the device — a 200dp-wide card doesn't need a 1080p thumbnail.

#### How does video delivery work with a CDN?

The backend encodes each video into multiple quality levels (360p, 720p, 1080p, 4K) and splits each into small segments (2-6 seconds). These segments are uploaded to a CDN with edge servers distributed globally. A manifest file (`.m3u8` for HLS or `.mpd` for DASH) lists all available quality levels and their segment URLs.

When the player starts, it fetches the manifest, picks a quality based on current bandwidth, and starts downloading segments from the nearest CDN edge server. The CDN handles the heavy lifting — serving terabytes of video data with low latency. The API server just provides the manifest URL. This separation is why video apps scale — the API handles lightweight metadata requests while the CDN handles the bandwidth-heavy segment delivery.

#### How does adaptive bitrate streaming work on mobile?

ABR is the core of any streaming app. The video exists in multiple quality levels on the CDN. The player downloads segments one at a time and picks the quality for each segment based on current bandwidth. If bandwidth drops from 5 Mbps to 2 Mbps, the next segment comes in at 720p instead of 1080p. The user sees a brief quality dip but playback never stalls.

ExoPlayer's `DefaultBandwidthMeter` measures the download speed of each segment and maintains a weighted moving average. Recent measurements get higher weight. The ABR algorithm picks a quality that uses about 70-80% of the estimated bandwidth — the safety margin prevents rebuffering. HLS and DASH both work this way. HLS uses `.m3u8` playlists with `.ts` or `.fmp4` segments. DASH uses `.mpd` manifests with `.mp4` segments. For cross-platform apps, HLS is the safer choice since it works on both iOS and Android.

#### How would you configure the buffering strategy?

ExoPlayer's `LoadControl` has four parameters: minimum buffer before playback starts (15 seconds), maximum buffer to keep downloaded (50 seconds), buffer needed to restart after a rebuffer event (2.5 seconds), and buffer to start with when video is already rendered (5 seconds).

Bigger buffers mean fewer stalls but more memory and data usage. Smaller buffers mean faster startup but more risk of rebuffering. For on-demand video, 15/50 seconds is a solid default. For live streaming, shrink it to 2-5 seconds to keep latency low. On cellular with limited data, you might reduce the max buffer to 30 seconds. The right configuration depends on the content type and network — there's no universal answer, and the interviewer wants to hear you reason through the tradeoffs.

#### How would you implement background playback with MediaSession?

When the user leaves the app, video rendering stops but audio should keep playing. Use Media3's `MediaSessionService` to run the player in a foreground service. The service keeps the process alive, and the system notification provides playback controls.

```kotlin
class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this).build()
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo
    ): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.run { player.release(); release() }
        super.onDestroy()
    }
}
```

`MediaSession` integrates with lock screen controls, Bluetooth, headset buttons, and Android Auto. When the app goes to the background, release the video surface to free GPU memory but keep the audio renderer active. Audio focus management is critical here — request focus before playing, duck volume on transient loss, and pause on full loss. On Android 14+, declare `android:foregroundServiceType="mediaPlayback"` in the manifest.

#### How would you implement offline downloads?

Use ExoPlayer's `DownloadManager` to download HLS or DASH streams segment by segment. It handles pause/resume, tracks progress, and works with DRM-protected content. Trigger downloads through a `DownloadService` and back it with WorkManager for reliability across process death and device restarts.

```kotlin
val downloadRequest = DownloadRequest.Builder(
    videoId, Uri.parse(manifestUrl)
).build()
DownloadService.sendAddDownload(
    context, VideoDownloadService::class.java, downloadRequest, false
)
```

Downloaded segments go into the same `SimpleCache` that the streaming player uses. For playback, `CacheDataSource.Factory` checks the cache first and falls back to the network. This means partially downloaded content works — cached segments play from disk, the rest streams. Store download metadata in Room so the UI can show progress and the user can manage their downloads. Check available storage before starting, and let the user choose download quality to control file sizes.

#### How does DRM (Widevine) work on Android?

Widevine is Android's built-in DRM system. It has three security levels: L1 uses the hardware Trusted Execution Environment (TEE) and is required for HD and 4K content. L3 is software-only and caps at SD quality. L2 is a middle ground with software and hardware crypto.

The flow: the player encounters a DRM-protected stream, extracts the key ID from the manifest, sends a license request to the license server, receives decryption keys, and `MediaCodec` decrypts the content inside the TEE. On L1 devices, decrypted frames never leave the secure hardware — screen recording captures a black screen. ExoPlayer handles this transparently. You configure a `DefaultDrmSessionManager` with the license server URL and ExoPlayer manages license acquisition, renewal, and key rotation. For offline playback, download the license along with the content and store it with an expiry window.

#### How would you implement picture-in-picture mode?

PiP lets the user keep watching in a small floating window while using other apps. Declare `android:supportsPictureInPicture="true"` in the manifest and enter PiP mode with configured parameters.

```kotlin
fun enterPiP(activity: Activity, aspectRatio: Rational) {
    val params = PictureInPictureParams.Builder()
        .setAspectRatio(aspectRatio)
        .setActions(listOf(
            RemoteAction(
                Icon.createWithResource(activity, R.drawable.ic_pause),
                "Pause", "Pause playback",
                PendingIntent.getBroadcast(activity, 0,
                    Intent("ACTION_PAUSE"), PendingIntent.FLAG_IMMUTABLE)
            )
        ))
        .build()
    activity.enterPictureInPictureMode(params)
}
```

When PiP activates, hide everything except the player view and respond to `onPictureInPictureModeChanged()` to toggle layouts. Custom actions are limited to `RemoteAction` icons — no arbitrary UI. On Android 12+, set `setAutoEnterEnabled(true)` so the user enters PiP automatically when swiping home during playback.

#### How would you support Chromecast?

Use the Cast SDK to discover Cast devices on the local network and transfer playback. The flow: the user taps the cast icon, selects a device, and the app sends the video URL and current position to the Chromecast. The Chromecast streams directly from the CDN — it doesn't relay through the phone.

On the mobile side, switch the UI from local player controls to a remote control view (play, pause, seek, volume). The `CastPlayer` from Media3 implements the same `Player` interface as `ExoPlayer`, so the ViewModel doesn't need to know whether playback is local or remote. When the user disconnects, resume local playback at the Cast position. The tricky part is keeping the playback state in sync — the Chromecast reports its position, and the app should persist it so resume works regardless of how the user last watched.

#### How would you handle video preloading in a scrollable list?

For a feed with video thumbnails or short previews, preloading the first few seconds of upcoming videos makes playback feel instant. Use `SimpleCache` with `CacheDataSource` and preload 2-3 seconds of the next 2 videos in the list.

The key is being smart about when to preload. Only preload on Wi-Fi or when the user has settled on a scroll position — don't preload during a fast fling. On cellular, preload only the very next video and reduce the preload amount. Set an LRU eviction policy on the cache so old preloaded segments get purged when the cache fills up. The tradeoff is always data usage versus instant playback. Some apps solve this with short animated thumbnails generated server-side instead of preloading actual video segments — that's cheaper and works well for browse screens.

#### How would you optimize for performance and battery life?

Video playback is one of the most battery-intensive operations on a device. The biggest consumers are screen brightness, video decoding, and network I/O. Hardware decoding through `MediaCodec` is the single biggest win — ExoPlayer uses it by default, and it's significantly more efficient than software decoding.

Beyond that: use efficient codecs (HEVC/H.265 needs less bandwidth than H.264 for the same quality), release the `WakeLock` when the player is paused, lower streaming quality when battery saver is active, and avoid keeping multiple player instances alive. For static content like podcasts with a still image, reduce the render frame rate — there's no need for 30fps on a static frame. Track time-to-first-frame, rebuffer rate, and battery drain per hour of playback as your key performance metrics. A rebuffer rate above 1% means the buffering or ABR configuration needs tuning.

### Common Follow-ups

- How would you handle network transitions mid-stream (Wi-Fi to cellular)?
- How do you implement seek preview with thumbnail sprites?
- What's the difference between hardware and software video decoding?
- How would you handle multiple audio tracks and subtitle selection?
- How would you design the player UI with Jetpack Compose?
- How does the architecture change for live streaming versus on-demand?
- How would you handle video aspect ratio changes (16:9, 4:3, vertical)?
- What metrics would you track to measure playback quality at scale?
