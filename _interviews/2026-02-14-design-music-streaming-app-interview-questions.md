---
title: "Design a Music Streaming App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 14
sequence: 76
description: "Designing a music streaming app like Spotify tests your understanding of audio playback, background services, media sessions, offline caching, and playback queue management."
---

## Design a Music Streaming App

Music streaming is a rich system design topic because it covers audio playback, background processing, media session integration, offline support, and queue management. Interviewers want to see how you handle continuous playback across app states and integrate with the Android media ecosystem.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the core components of a music streaming app?

A music streaming app needs: an audio player (ExoPlayer/Media3), a background service to keep playback alive when the app is minimized, a media session for system integration (lock screen controls, Bluetooth, headset buttons), a playback queue to manage track order, a caching layer for streaming and offline playback, and a UI layer for browsing, searching, and controlling playback.

The playback pipeline is: **User selects track → Queue updated → Player loads audio URL → Streaming/buffering → Audio output → Media session notifies system → Notification updated**.

#### Q2: MediaPlayer vs ExoPlayer — which would you use?

ExoPlayer (now part of AndroidX Media3) is the right choice. `MediaPlayer` is the old framework API — it has limited format support, poor error handling, and no adaptive streaming. ExoPlayer supports DASH, HLS, and SmoothStreaming for adaptive bitrate, handles DRM, supports gapless playback, and is actively maintained by Google.

```kotlin
class AudioPlayer(context: Context) {
    private val player = ExoPlayer.Builder(context).build()

    fun play(url: String) {
        val mediaItem = MediaItem.fromUri(url)
        player.setMediaItem(mediaItem)
        player.prepare()
        player.play()
    }

    fun pause() = player.pause()
    fun seekTo(positionMs: Long) = player.seekTo(positionMs)
    fun release() = player.release()
}
```

ExoPlayer handles buffering, format detection, and codec selection internally. It also supports playlists natively — you can set multiple `MediaItem`s and it handles transitions between tracks. Media3 is the evolution of ExoPlayer with better API design and Jetpack integration.

#### Q3: How do you keep music playing when the app is in the background?

Use a foreground service with a persistent notification. Without a service, Android kills the app's process shortly after the user leaves, and playback stops. The foreground service tells the system this is an active user-facing task.

```kotlin
class PlaybackService : MediaSessionService() {
    private lateinit var player: ExoPlayer
    private lateinit var mediaSession: MediaSession

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this).build()
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession {
        return mediaSession
    }

    override fun onDestroy() {
        player.release()
        mediaSession.release()
        super.onDestroy()
    }
}
```

Media3's `MediaSessionService` handles the foreground service lifecycle automatically — it starts as a foreground service when playback begins and stops when playback ends. It also creates the notification with playback controls. On Android 14+, declare `android:foregroundServiceType="mediaPlayback"` in the manifest.

#### Q4: What is a MediaSession and why does it matter?

`MediaSession` is the bridge between your player and the Android system. It tells the system what's currently playing, what controls are available, and the playback state. Without it, lock screen controls don't work, Bluetooth headset buttons do nothing, and Google Assistant can't control playback.

```kotlin
val mediaSession = MediaSession.Builder(context, player)
    .setCallback(object : MediaSession.Callback {
        override fun onAddMediaItems(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<List<MediaItem>> {
            // Resolve search queries or media IDs to playable URIs
            val resolved = mediaItems.map { resolveMediaItem(it) }
            return Futures.immediateFuture(resolved)
        }
    })
    .build()
```

The session publishes metadata (track title, artist, album art, duration) and playback state (playing, paused, position) to the system. Any client can connect — the notification, lock screen, Wear OS, Android Auto, Bluetooth AVRCP, Google Assistant. Media3's `MediaSession` automatically syncs with the `ExoPlayer` state, so you don't manually update the session on every state change.

#### Q5: How would you handle audio focus?

Audio focus is Android's way of coordinating audio between apps. When your music app starts playing, it requests audio focus. If another app (like a navigation app) needs to play audio, it requests focus too. Your app should respond by pausing or lowering volume ("ducking").

```kotlin
class AudioFocusManager(context: Context) {
    private val audioManager = context.getSystemService(AudioManager::class.java)

    private val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
        )
        .setOnAudioFocusChangeListener { focusChange ->
            when (focusChange) {
                AudioManager.AUDIOFOCUS_LOSS -> player.pause() // another app took focus permanently
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> player.pause() // temporary loss (phone call)
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> player.setVolume(0.2f) // lower volume
                AudioManager.AUDIOFOCUS_GAIN -> { player.setVolume(1.0f); player.play() }
            }
        }
        .build()

    fun requestFocus(): Boolean {
        return audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }
}
```

Request focus with `AUDIOFOCUS_GAIN` for music playback. If another app has focus, your request might be denied — don't play audio in that case. When you receive `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK`, reduce volume instead of pausing (useful for navigation prompts over music). ExoPlayer with Media3 handles audio focus automatically if you enable it with `setHandleAudioFocus(true)`.

#### Q6: How would you design the playback queue?

The queue is the list of tracks the user will hear next. It supports adding, removing, reordering, shuffle, and repeat modes. The queue must survive configuration changes and persist across sessions.

```kotlin
class PlaybackQueue {
    private val originalOrder = mutableListOf<Track>()
    private val shuffledOrder = mutableListOf<Track>()
    private var currentIndex = 0
    private var shuffleEnabled = false
    private var repeatMode = RepeatMode.OFF // OFF, ONE, ALL

    private val activeQueue: List<Track>
        get() = if (shuffleEnabled) shuffledOrder else originalOrder

    fun currentTrack(): Track? = activeQueue.getOrNull(currentIndex)

    fun next(): Track? {
        if (repeatMode == RepeatMode.ONE) return currentTrack()
        currentIndex++
        if (currentIndex >= activeQueue.size) {
            if (repeatMode == RepeatMode.ALL) currentIndex = 0
            else return null
        }
        return currentTrack()
    }

    fun toggleShuffle() {
        shuffleEnabled = !shuffleEnabled
        if (shuffleEnabled) {
            shuffledOrder.clear()
            shuffledOrder.addAll(originalOrder.shuffled())
            // Move current track to front of shuffled order
            val current = currentTrack()
            if (current != null) {
                shuffledOrder.remove(current)
                shuffledOrder.add(0, current)
                currentIndex = 0
            }
        }
    }
}
```

When shuffle is enabled, keep the current song playing and shuffle the rest. When shuffle is disabled, return to the original order at the current track's original position. Spotify does this — toggling shuffle doesn't interrupt the current song.

#### Q7: How does the media notification work?

The notification shows the current track info, album art, and playback controls (play/pause, next, previous). Media3's `MediaSessionService` creates this automatically. The notification uses `MediaStyle` which gives it the compact, familiar look.

```kotlin
// Media3 handles this automatically, but you can customize:
val notification = NotificationCompat.Builder(context, CHANNEL_ID)
    .setContentTitle(track.title)
    .setContentText(track.artist)
    .setLargeIcon(albumArtBitmap)
    .setSmallIcon(R.drawable.ic_music_note)
    .setStyle(
        MediaStyleNotificationHelper.MediaStyle(mediaSession)
            .setShowActionsInCompactView(0, 1, 2)
    )
    .addAction(R.drawable.ic_previous, "Previous", previousPendingIntent)
    .addAction(playPauseIcon, "Play/Pause", playPausePendingIntent)
    .addAction(R.drawable.ic_next, "Next", nextPendingIntent)
    .build()
```

With Media3, you rarely build the notification manually — the `MediaSessionService` creates it from the player state and media metadata. You can customize it by providing a `MediaNotification.Provider`. The notification actions trigger callbacks through the `MediaSession`, which routes them to the player.

#### Q8: How would you handle Bluetooth and headset events?

When the user connects Bluetooth headphones, presses a headset button, or unplugs wired headphones, your app should respond. Android sends `ACTION_AUDIO_BECOMING_NOISY` when headphones are disconnected — you must pause playback to avoid blasting audio through the speaker unexpectedly.

```kotlin
class NoisyReceiver(private val player: ExoPlayer) : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
            player.pause()
        }
    }
}
```

For headset button presses (play/pause, skip), `MediaSession` handles this automatically. The system routes media button events to the active media session. Media3 connects the session to the player, so pressing the headset play button calls `player.play()` without extra code. For Bluetooth metadata (showing track info on car displays), the `MediaSession` publishes it through AVRCP automatically.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How does streaming vs downloading differ in implementation?

Streaming and downloading use the same HTTP mechanism — both fetch audio data over the network. The difference is in intent and caching strategy.

**Streaming** fetches data on-demand. ExoPlayer manages a buffer (typically 30-60 seconds ahead) and requests more data as the buffer drains. If the network is slow, the buffer empties and playback stalls. Cached stream data is temporary and can be evicted.

**Downloading** fetches the entire file ahead of time and saves it permanently. The user explicitly requests a download for offline listening. Downloaded files bypass the network layer entirely during playback.

```kotlin
// Streaming — ExoPlayer handles buffering internally
val streamItem = MediaItem.fromUri("https://cdn.example.com/track.mp3")
player.setMediaItem(streamItem)

// Download — use Media3's DownloadService
val downloadRequest = DownloadRequest.Builder("track-123", Uri.parse(url)).build()
DownloadService.sendAddDownload(context, MyDownloadService::class.java, downloadRequest, false)

// Play downloaded content
val offlineItem = MediaItem.Builder()
    .setUri(downloadedFilePath)
    .build()
player.setMediaItem(offlineItem)
```

For offline mode, check if a track is downloaded before trying to stream. If downloaded, play from local storage. If not and there's no network, show an error or skip to the next downloaded track in the queue.

#### Q10: How would you implement adaptive bitrate for audio?

Adaptive bitrate adjusts audio quality based on network conditions. The server provides the same track at multiple quality levels (e.g., 96 kbps, 160 kbps, 320 kbps). The client picks the best quality it can sustain without buffering.

ExoPlayer supports this through HLS or DASH manifests. The manifest lists all available quality levels, and ExoPlayer's `AdaptiveTrackSelection` switches between them based on measured bandwidth.

```kotlin
val player = ExoPlayer.Builder(context)
    .setTrackSelector(
        DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setMaxAudioBitrate(320_000) // cap at 320 kbps
                    .setForceLowestBitrate(false)
            )
        }
    )
    .build()
```

For audio, the switching is less noticeable than video because audio files are small and buffer faster. The practical approach is simpler — let the user choose a quality setting (low, normal, high) and request that bitrate from the server. Save bandwidth settings separately for Wi-Fi and cellular. Spotify uses this approach: "Automatic" quality for cellular and "Very High" for Wi-Fi.

#### Q11: How would you design the audio caching strategy?

Cache recently streamed audio to avoid re-downloading when the user replays a track. Use ExoPlayer's `CacheDataSource` which wraps the network data source with a disk cache.

```kotlin
class CacheManager(context: Context) {
    private val cacheDir = File(context.cacheDir, "audio_cache")
    private val cache = SimpleCache(
        cacheDir,
        LeastRecentlyUsedCacheEvictor(500 * 1024 * 1024), // 500 MB
        StandaloneDatabaseProvider(context)
    )

    fun buildCacheDataSourceFactory(): DataSource.Factory {
        val httpFactory = DefaultHttpDataSource.Factory()
        return CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(httpFactory)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }
}

// Use it when building the player
val player = ExoPlayer.Builder(context)
    .setMediaSourceFactory(
        DefaultMediaSourceFactory(cacheManager.buildCacheDataSourceFactory())
    )
    .build()
```

The `LeastRecentlyUsedCacheEvictor` automatically removes the oldest cached tracks when the cache exceeds 500 MB. This is separate from explicit downloads — cached tracks are evicted when space is needed, while downloaded tracks are kept until the user removes them. A good cache size depends on the app — 500 MB stores roughly 100-150 songs at 320 kbps.

#### Q12: How would you implement gapless playback?

Gapless playback means transitioning between tracks without a gap or click of silence. This matters for live albums, classical music, and mix albums where tracks are designed to flow into each other.

ExoPlayer supports gapless playback natively when using a playlist of `MediaItem`s. It pre-buffers the next track and crossfades at the boundary. For MP3 files, ExoPlayer reads the LAME header which contains encoder delay and padding info — it trims the silence at the start and end of each track.

```kotlin
// Set up gapless playback with a playlist
val tracks = playlist.map { MediaItem.fromUri(it.url) }
player.setMediaItems(tracks)
player.prepare()
player.play()

// ExoPlayer handles gapless transitions automatically
// For crossfade between tracks:
player.setMediaItem(nextTrack)
// Use a custom RenderersFactory with a crossfading AudioSink for crossfade support
```

For crossfade (where the current track fades out while the next fades in), you need more work. One approach is to run two player instances — one fading out, one fading in — and mix their audio. Spotify offers adjustable crossfade duration (1-12 seconds). True gapless without crossfade is simpler and what ExoPlayer does by default with playlists.

#### Q13: How would you sync lyrics with audio playback?

Timed lyrics (like Spotify's "Behind the Lyrics" or Apple Music's synced lyrics) require timestamp-aligned text. Each lyric line has a start and end time, and the UI highlights the current line as the song plays.

```kotlin
data class LyricLine(
    val startMs: Long,
    val endMs: Long,
    val text: String
)

class LyricSync(private val player: ExoPlayer) {
    private var lyrics: List<LyricLine> = emptyList()
    private val _currentLine = MutableStateFlow<LyricLine?>(null)
    val currentLine: StateFlow<LyricLine?> = _currentLine

    fun loadLyrics(lines: List<LyricLine>) {
        lyrics = lines.sortedBy { it.startMs }
    }

    fun startSync() {
        scope.launch {
            while (true) {
                val position = player.currentPosition
                val line = lyrics.firstOrNull { position in it.startMs..it.endMs }
                if (line != _currentLine.value) {
                    _currentLine.value = line
                }
                delay(100) // check every 100ms
            }
        }
    }
}
```

Polling the player position every 100ms is the common approach. Binary search on the sorted lyrics list is more efficient than linear search for songs with many lines. The lyrics data typically comes from the server in LRC format (a standard for timed lyrics) or a custom JSON format. Handle seek events — when the user seeks to a new position, immediately jump to the correct lyric line.

#### Q14: How would you handle search and playlist management?

Search needs to be fast and handle partial matches. On the client side, implement local search over downloaded/cached content and delegate full catalog search to the server.

```kotlin
class MusicRepository(
    private val api: MusicApi,
    private val localDao: TrackDao
) {
    fun search(query: String): Flow<SearchResult> = flow {
        // Emit local results immediately
        val localResults = localDao.search("%$query%")
        emit(SearchResult(local = localResults, remote = emptyList()))

        // Then fetch remote results
        try {
            val remoteResults = api.search(query)
            emit(SearchResult(local = localResults, remote = remoteResults))
        } catch (e: IOException) {
            // Offline — local results only
        }
    }

    suspend fun createPlaylist(name: String, trackIds: List<String>) {
        val playlist = Playlist(
            id = UUID.randomUUID().toString(),
            name = name,
            trackIds = trackIds,
            createdAt = System.currentTimeMillis()
        )
        localDao.insertPlaylist(playlist)
        api.syncPlaylist(playlist)
    }
}
```

Show local results instantly while the network request is in flight. For playlists, save locally first (optimistic update) and sync to the server in the background. If the sync fails, retry with WorkManager. Handle merge conflicts — if the user modifies the same playlist on two devices, the server needs a conflict resolution strategy (last-write-wins is simplest).

#### Q15: How would you design the offline mode?

Offline mode lets users play downloaded tracks without a network connection. The app needs to detect network state, show only available (downloaded) content when offline, and queue downloads for selected playlists or albums.

```kotlin
class OfflineManager(
    private val downloadManager: DownloadManager,
    private val trackDao: TrackDao
) {
    fun downloadPlaylist(playlist: Playlist) {
        playlist.tracks.forEach { track ->
            val request = DownloadRequest.Builder(track.id, Uri.parse(track.url))
                .setData(track.title.toByteArray()) // metadata for notifications
                .build()
            downloadManager.addDownload(request)
            trackDao.markDownloading(track.id)
        }
    }

    fun getOfflineTracks(): Flow<List<Track>> {
        return trackDao.getDownloadedTracks()
    }

    fun isTrackAvailableOffline(trackId: String): Boolean {
        return downloadManager.getDownload(trackId)?.state == Download.STATE_COMPLETED
    }
}
```

Use Media3's `DownloadService` and `DownloadManager` for reliable downloads. They handle pause/resume, network constraints, and progress tracking. Store download state in the database so the UI can show download progress and filter for offline-available content. When offline, hide the search tab (or limit to local search) and gray out non-downloaded content in playlists.

#### Q16: How would you handle playback state restoration?

When the user kills and reopens the app, playback should resume from where they left off. Save the current state: queue contents, current track index, playback position, shuffle mode, and repeat mode.

```kotlin
class PlaybackStateStore(private val prefs: SharedPreferences) {

    fun saveState(player: ExoPlayer, queue: PlaybackQueue) {
        prefs.edit {
            putString("queue", Json.encodeToString(queue.tracks))
            putInt("currentIndex", player.currentMediaItemIndex)
            putLong("position", player.currentPosition)
            putBoolean("shuffle", queue.shuffleEnabled)
            putInt("repeatMode", player.repeatMode)
        }
    }

    fun restoreState(player: ExoPlayer, queue: PlaybackQueue) {
        val tracks = prefs.getString("queue", null)?.let {
            Json.decodeFromString<List<Track>>(it)
        } ?: return

        queue.setTracks(tracks)
        player.setMediaItems(tracks.map { it.toMediaItem() })
        player.seekTo(
            prefs.getInt("currentIndex", 0),
            prefs.getLong("position", 0)
        )
        player.repeatMode = prefs.getInt("repeatMode", Player.REPEAT_MODE_OFF)
        player.prepare() // don't auto-play — wait for user action
    }
}
```

Save state periodically (every 5 seconds) and on pause/stop. Don't auto-play on restore — the user might have closed the app intentionally. Just show the last state in the UI and let them tap play. For playlists, save the playlist ID and position rather than the full track list so you pick up any changes made on other devices.

#### Q17: How would you implement background pre-buffering of the next track?

Pre-buffering loads the next track's audio data while the current track is still playing, so the transition is instant. ExoPlayer does this automatically with its playlist implementation — it starts pre-loading the next `MediaItem` a configurable amount of time before the current track ends.

```kotlin
val player = ExoPlayer.Builder(context)
    .setLoadControl(
        DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                15_000,  // min buffer before playback starts
                50_000,  // max buffer to hold in memory
                2_500,   // buffer for playback after rebuffer
                5_000    // buffer around current position for seek
            )
            .build()
    )
    .build()
```

The `LoadControl` determines how aggressively ExoPlayer buffers. A 50-second max buffer means ExoPlayer holds up to 50 seconds of audio data in memory per track. For the "next track" pre-buffer, ExoPlayer uses `next-window` loading — it begins buffering the next playlist item when the current buffer is sufficiently full. You don't need to manage this manually. The tradeoff is memory and data usage — buffering too aggressively wastes bandwidth if the user skips tracks frequently.

### Common Follow-ups

- How would you implement a social feature like shared listening sessions?
- How would you handle DRM-protected content?
- How would you design the "Discover Weekly" recommendation engine on the client side?
- What happens if the audio file format changes mid-stream (HLS adaptive)?
- How would you implement equalizer and audio effects?
- How would you handle playback in Android Auto and Wear OS?
- How would you measure and optimize audio latency for live streaming?
