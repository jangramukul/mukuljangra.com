---
title: "Design a Music Streaming App"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 14
sequence: 68
description: "Designing a music streaming app like Spotify tests your understanding of audio playback, background services, media sessions, offline caching, and playback queue management."
---

## Design a Music Streaming App (Spotify)

Music streaming is one of those system design questions that sounds simple until you start building it. Audio playback, background services, media sessions, offline support, queue management — every piece touches a different part of the Android platform.

#### What are the core features of a music streaming app?

Think of it like a restaurant with multiple departments. You've got the front of house — browse and search so users can discover music by artist, album, genre, or keyword. Then there's the kitchen — audio playback with play, pause, seek, and skip. Playlists are the menu — users create them, edit them, reorder them, share them. And offline mode is the takeout option — download tracks so you can listen without network.

But here's what makes a music app different from most apps: it has to keep working when the user walks away. Background playback, a playback queue with shuffle and repeat, and media controls on the lock screen, notification, and Bluetooth devices — these aren't nice-to-haves, they're the whole point.

#### What are the key non-functional requirements?

Three things matter most:

- **Gapless playback** — No silence gap between consecutive tracks. Play a live album with gaps between songs and it sounds like a broken CD player. Unacceptable.
- **Background playback** — Music must keep playing across app switches, lock screen, and even after the user clears recents. This means a foreground service, no way around it.
- **Battery efficiency** — Audio playback runs for hours. The app can't wake the CPU unnecessarily, needs to buffer smartly, and should avoid excessive network polling. Audio uses far less bandwidth than video, but sloppy implementation still kills the battery.

Users tolerate 2-3 seconds of initial buffering when they tap a song — latency matters less here than in video.

#### How would you scope this for a 45-minute interview?

Here's the thing — you can't cover everything, and trying to will hurt you. Focus on the playback path end-to-end: user taps a song, the app builds a queue, starts a foreground service, streams audio through ExoPlayer, shows controls in the notification and lock screen, and handles interruptions like phone calls. Then go deep on one or two areas — offline downloads, gapless playback, or queue management. Skip social features, lyrics, and recommendation algorithms unless the interviewer asks.

#### How would you structure the client architecture?

Think of it as three floors of a building, each doing its own job:

- **UI layer** — The ground floor. Screens for home/browse, search, library/playlists, now-playing, and queue. Built with Compose, observing state from ViewModels.
- **Playback engine** — The engine room in the basement. ExoPlayer wrapped in a foreground service with a MediaSession. This handles streaming, buffering, gapless transitions, and audio focus. It's the heart of the app.
- **Data layer** — The warehouse. Repository pattern with Retrofit for the catalog API, Room for cached metadata and playlist data, and ExoPlayer's cache for streamed audio bytes.

The playback engine runs in a `MediaSessionService`, completely separate from the UI lifecycle. The UI connects to it through a `MediaController`. This separation is crucial — playback survives activity destruction, configuration changes, and even the app being removed from recents.

> **🧠 Think about it:** Why can't the playback engine just live inside an Activity or ViewModel? What happens when the user swipes the app away from recents?

#### Why use Media3/ExoPlayer for audio playback?

Yeah, this trips up everyone. Android has `MediaPlayer` built in — why not use it? Because `MediaPlayer` is the old framework API with limited format support, poor error handling, and no adaptive streaming. It's like using a flip phone when smartphones exist.

ExoPlayer (now part of AndroidX Media3) supports DASH, HLS, and progressive streams, handles DRM, supports gapless playback natively, and is actively maintained by Google.

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

ExoPlayer handles buffering, format detection, and codec selection internally. It also supports playlists natively — set multiple `MediaItem`s and it handles transitions between tracks. Media3 wraps ExoPlayer with better API design and Jetpack integration.

#### What APIs does the app need from the backend?

Three main groups — think of them as three different counters at a store:

- **Catalog API** — Search, browse by genre/artist/album, get track metadata (title, artist, album, duration, artwork URL). This is read-heavy and highly cacheable.
- **Playlist API** — CRUD operations for user playlists. Create, add/remove tracks, reorder, delete. Playlists sync across devices, so the API needs conflict handling.
- **Stream API** — Returns the audio stream URL for a given track ID. The URL is typically a signed, time-limited CDN link. The client passes quality preference (low, normal, high) and the server returns the appropriate bitrate stream.

The catalog and playlist APIs use standard REST. The stream API returns a URL that ExoPlayer fetches directly — the app never downloads the audio bytes through its own networking layer.

#### What are the core data models?

Three key entities: Track, Playlist, and PlaybackQueue.

```kotlin
data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val albumId: String,
    val durationMs: Long,
    val artworkUrl: String,
    val streamUrl: String
)

data class Playlist(
    val id: String,
    val name: String,
    val ownerId: String,
    val trackIds: List<String>,
    val createdAt: Long,
    val updatedAt: Long
)

data class PlaybackQueue(
    val tracks: List<Track>,
    val currentIndex: Int,
    val shuffleEnabled: Boolean,
    val repeatMode: RepeatMode // OFF, ONE, ALL
)
```

Track metadata is cached in Room for offline access and fast loading. Here's a detail people miss — the `streamUrl` is short-lived. The app fetches a fresh URL from the stream API when the user actually plays the track. Playlists are stored locally and synced with the server.

#### How do you keep music playing in the background?

This is where a lot of apps get it wrong. Without a foreground service, Android kills the process shortly after the user leaves, and the music just... stops. That's like a radio that turns off when you put it in your pocket.

Media3's `MediaSessionService` handles the foreground service lifecycle automatically — it starts as foreground when playback begins and stops when playback ends.

```kotlin
class PlaybackService : MediaSessionService() {
    private lateinit var player: ExoPlayer
    private lateinit var mediaSession: MediaSession

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this).build()
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo
    ): MediaSession = mediaSession

    override fun onDestroy() {
        player.release()
        mediaSession.release()
        super.onDestroy()
    }
}
```

On Android 14+, declare `android:foregroundServiceType="mediaPlayback"` in the manifest. The `MediaSessionService` also creates the notification with playback controls automatically. The UI binds to this service through a `MediaController` and disconnects freely without affecting playback.

#### How does audio focus work in a music app?

Picture a conference call where only one person can talk at a time. Audio focus is how Android coordinates audio between apps. When your app starts playing, it requests focus. If another app — navigation, phone call — needs audio, your app must respond. Pause for a phone call, lower volume for a navigation prompt.

```kotlin
class AudioFocusHandler(context: Context) {
    private val audioManager = context.getSystemService(AudioManager::class.java)

    private val focusRequest = AudioFocusRequest
        .Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
        )
        .setOnAudioFocusChangeListener { change ->
            when (change) {
                AudioManager.AUDIOFOCUS_LOSS -> player.pause()
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> player.pause()
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK ->
                    player.setVolume(0.2f)
                AudioManager.AUDIOFOCUS_GAIN -> {
                    player.setVolume(1.0f)
                    player.play()
                }
            }
        }
        .build()
}
```

`AUDIOFOCUS_LOSS` means another app took focus permanently — pause. `AUDIOFOCUS_LOSS_TRANSIENT` means temporary loss like a phone call — pause and resume when focus returns. `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` is the interesting one — lower volume instead of pausing, perfect for navigation prompts over music. Plot twist: ExoPlayer handles all of this automatically if you call `setHandleAudioFocus(true)` on the player.

> **🧠 Think about it:** What should happen when a user is listening to music and Google Maps says "Turn left in 200 meters"? Should the music pause completely or just get quieter? Why?

#### How would you implement gapless and crossfade playback?

Gapless playback means no silence gap between consecutive tracks. Play a Pink Floyd album with gaps between songs and fans will riot. ExoPlayer supports it natively when you use a playlist of `MediaItem`s — it pre-buffers the next track and trims encoder delay/padding using the LAME header in MP3 files.

```kotlin
// Gapless — just load tracks as a playlist
val items = playlist.map { MediaItem.fromUri(it.streamUrl) }
player.setMediaItems(items)
player.prepare()
player.play()
```

Crossfade is a different beast. The current track fades out while the next fades in, overlapping by a configurable duration (Spotify offers 1-12 seconds). ExoPlayer doesn't support crossfade out of the box. One approach: use two player instances — one fading out, one fading in — and mix their output. Start the second player N seconds before the current track ends, ramp down the first player's volume while ramping up the second, then release the first when done. True gapless is simpler and is what ExoPlayer does by default.

#### How would you handle offline downloads?

Offline downloads let users save tracks for playback without network. Think of it like Netflix's download feature but for audio. Use WorkManager to schedule downloads — it handles network constraints, retry logic, and survives app restarts.

```kotlin
class DownloadTrackWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val trackId = inputData.getString("trackId") ?: return Result.failure()
        val streamUrl = api.getStreamUrl(trackId)
        val file = File(applicationContext.filesDir, "offline/$trackId.enc")

        httpClient.downloadTo(streamUrl, file)
        trackDao.markDownloaded(trackId, file.absolutePath)
        return Result.success()
    }
}

// Schedule a playlist download
fun downloadPlaylist(playlist: Playlist) {
    playlist.trackIds.forEach { trackId ->
        val request = OneTimeWorkRequestBuilder<DownloadTrackWorker>()
            .setInputData(workDataOf("trackId" to trackId))
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build()
        WorkManager.getInstance(context).enqueue(request)
    }
}
```

When playing a track, check if it's downloaded first. If yes, play from local storage. If not and there's no network, skip to the next downloaded track. For DRM content, the downloaded files should be encrypted — only the app can decrypt and play them. Track download state in Room so the UI can show progress and filter for offline-available content.

#### How would you design the playback queue?

Here's where it gets interesting. The queue holds the list of tracks to play. It needs shuffle, repeat, add-next, add-to-end, remove, and reorder. The tricky part is shuffle — when the user enables it, the current track stays playing and the rest get shuffled. When they disable it, the queue snaps back to the original order at the current track's position. It's like shuffling a deck of cards but keeping the card in your hand.

```kotlin
class PlaybackQueue {
    private val originalOrder = mutableListOf<Track>()
    private val shuffledOrder = mutableListOf<Track>()
    private var currentIndex = 0
    private var shuffleEnabled = false
    private var repeatMode = RepeatMode.OFF

    private val activeQueue: List<Track>
        get() = if (shuffleEnabled) shuffledOrder else originalOrder

    fun next(): Track? {
        if (repeatMode == RepeatMode.ONE) return activeQueue[currentIndex]
        currentIndex++
        if (currentIndex >= activeQueue.size) {
            if (repeatMode == RepeatMode.ALL) currentIndex = 0
            else return null
        }
        return activeQueue.getOrNull(currentIndex)
    }

    fun toggleShuffle() {
        val current = activeQueue[currentIndex]
        shuffleEnabled = !shuffleEnabled
        if (shuffleEnabled) {
            shuffledOrder.clear()
            shuffledOrder.addAll(originalOrder.shuffled())
            shuffledOrder.remove(current)
            shuffledOrder.add(0, current)
        }
        currentIndex = if (shuffleEnabled) 0
            else originalOrder.indexOf(current)
    }
}
```

"Play next" inserts a track right after `currentIndex`. "Add to queue" appends to the end. Both need to update `shuffledOrder` and `originalOrder` consistently. Persist the queue to SharedPreferences or Room so it survives process death — save the track IDs, current index, shuffle state, and repeat mode.

#### How do MediaSession and media controls work together?

`MediaSession` is the translator between your player and every external surface that wants to control it. It publishes what's playing (title, artist, album art, duration) and the playback state (playing, paused, position). The system then broadcasts this to the lock screen, notification, Bluetooth devices, Wear OS, Android Auto, and Google Assistant.

```kotlin
val mediaSession = MediaSession.Builder(context, player)
    .setCallback(object : MediaSession.Callback {
        override fun onAddMediaItems(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<List<MediaItem>> {
            val resolved = mediaItems.map { resolveToStreamUrl(it) }
            return Futures.immediateFuture(resolved)
        }
    })
    .build()
```

Here's the thing — Media3's `MediaSession` syncs with ExoPlayer state automatically. You don't manually update the session on every play/pause/skip. Any client can connect through a `MediaController`: the notification, lock screen, a car display via Bluetooth AVRCP, or Google Assistant. The `onAddMediaItems` callback is where you resolve a search query or media ID into a playable stream URL.

#### How would you handle audio streaming and buffering?

Think of buffering like filling a water tank. You want enough water stored so the tap never runs dry, but you don't want to flood the place. ExoPlayer manages this through its `LoadControl` with four key parameters:

```kotlin
val player = ExoPlayer.Builder(context)
    .setLoadControl(
        DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                15_000,  // min buffer before playback starts
                50_000,  // max buffer to hold in memory
                2_500,   // buffer to resume after rebuffer
                5_000    // buffer around keyframes for seek
            )
            .build()
    )
    .build()
```

A 50-second max buffer is reasonable for music — audio files are tiny compared to video, so this uses minimal memory. ExoPlayer also pre-buffers the next track in a playlist when the current buffer is full enough, which is how gapless transitions work. For adaptive bitrate, the server provides the track at multiple quality levels (96, 160, 320 kbps) via HLS or DASH. ExoPlayer's `AdaptiveTrackSelection` picks the best quality the network can sustain. In practice, most music apps let the user choose a quality setting and request that bitrate directly.

#### How would you design the caching strategy?

Cache recently streamed audio to avoid re-downloading when the user replays a track. It's like your browser cache but for songs. ExoPlayer's `CacheDataSource` wraps the network source with a disk cache.

```kotlin
class AudioCacheManager(context: Context) {
    private val cache = SimpleCache(
        File(context.cacheDir, "audio_cache"),
        LeastRecentlyUsedCacheEvictor(500 * 1024 * 1024),
        StandaloneDatabaseProvider(context)
    )

    fun buildDataSourceFactory(): DataSource.Factory {
        return CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(DefaultHttpDataSource.Factory())
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }
}

val player = ExoPlayer.Builder(context)
    .setMediaSourceFactory(
        DefaultMediaSourceFactory(cacheManager.buildDataSourceFactory())
    )
    .build()
```

The `LeastRecentlyUsedCacheEvictor` evicts the oldest cached tracks when the cache exceeds 500 MB. This is separate from explicit downloads — cached tracks get evicted when space is needed, downloaded tracks stay until the user removes them. 500 MB stores roughly 100-150 songs at 320 kbps. For predictive prefetch, you could cache the first 30 seconds of the next few tracks in the queue so playback starts instantly even before ExoPlayer's built-in pre-buffering kicks in.

> **🧠 Think about it:** What's the difference between a cached track and a downloaded track? Why do you need both systems?

#### How would you implement an equalizer and audio effects?

Android provides `Equalizer`, `BassBoost`, `Virtualizer`, and `LoudnessEnhancer` through the `android.media.audiofx` package. These attach to an audio session ID, which ExoPlayer exposes.

```kotlin
class AudioEffectsManager(player: ExoPlayer) {
    private val sessionId = player.audioSessionId

    private val equalizer = Equalizer(0, sessionId).apply {
        enabled = true
    }

    fun setPreset(presetIndex: Short) {
        equalizer.usePreset(presetIndex)
    }

    fun setBandLevel(band: Short, level: Short) {
        equalizer.setBandLevel(band, level)
    }

    fun release() {
        equalizer.release()
    }
}
```

The `Equalizer` has a fixed number of bands (typically 5), each with a frequency center and a gain range. You can use built-in presets (Rock, Pop, Jazz) or let the user adjust bands manually. Save the user's EQ settings per profile in SharedPreferences and reapply them when the player is created. One gotcha — the audio effects only work when the player has an active audio session. Create them after `player.prepare()` and release them when the player is released.

#### How would you handle Bluetooth, Cast, and car integration?

When the user unplugs their headphones, the last thing you want is music blasting through the phone speaker in a quiet office. Android sends `ACTION_AUDIO_BECOMING_NOISY` when headphones disconnect — you must pause playback.

```kotlin
class NoisyReceiver(private val player: ExoPlayer) : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
            player.pause()
        }
    }
}
```

For Bluetooth headset buttons (play/pause, skip), `MediaSession` handles it automatically — the system routes media button events to the active session. For car displays, `MediaSession` publishes track metadata through AVRCP automatically. For Android Auto, `MediaSessionService` already provides the integration — Auto connects as a `MediaController` and displays the queue and controls. Plot twist: for Cast (Chromecast), you add `CastPlayer` from the Cast SDK — it implements the same `Player` interface as ExoPlayer, so you swap the active player and the rest of the app (session, notification, UI) works unchanged. Same interface, different destination.

#### How would you handle search and recommendation on the client?

Search needs to be fast and handle partial input. Show local results instantly from cached metadata while the network request is in flight. Debounce the search input by 300ms to avoid flooding the API with every keystroke.

```kotlin
class SearchViewModel(
    private val musicRepository: MusicRepository
) : ViewModel() {

    private val _query = MutableStateFlow("")

    val results: StateFlow<SearchResult> = _query
        .debounce(300)
        .filter { it.length >= 2 }
        .flatMapLatest { query ->
            musicRepository.search(query)
        }
        .stateIn(viewModelScope, SharingStarted.Lazily, SearchResult.Empty)
}
```

The repository emits local matches first (tracks, artists, albums cached in Room), then appends server results when they arrive. For recommendations, the server does the heavy lifting — collaborative filtering, listening history analysis, genre graphs. The client's job is to fetch and display personalized playlists (like Discover Weekly) and show "similar tracks" or "fans also like" sections on artist pages. Cache recommendation results aggressively since they only update daily or weekly.

### Common Follow-ups

- How would you implement shared listening sessions (listen along with friends)?
- How would you handle DRM-protected content and license management?
- How would you design playback state restoration after process death?
- How would you support Android Auto and Wear OS playback?
- How would you sync lyrics with audio playback?
- How would you measure and optimize battery usage during long playback sessions?
- How would you handle playback across multiple audio output devices?
