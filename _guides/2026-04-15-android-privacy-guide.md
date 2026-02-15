---
title: Android Privacy Guide
layout: post
sequence: 140
categories: post
tags:
  - Privacy
  - Android
---

Android's privacy model gets stricter with every release. Scoped storage, one-time permissions, approximate location, photo picker, privacy dashboard — each version adds new restrictions that break assumptions you made two years ago. I've been through enough migration cycles to know that fighting these changes is a losing strategy. The apps that handle them cleanly are the ones that were already built with privacy-first design. Every permission you don't request is a permission you'll never have to migrate away from when Google tightens the screws again.

Early in my career, I treated permissions like a checklist — request everything upfront, handle the denial with a toast, move on. That approach fell apart around API 29 when scoped storage landed and half my file access code stopped working. The lesson was clear: building with minimal data access from the start means less rework when the next API level drops. This guide covers the practical privacy APIs every Android developer needs to understand — not just what they do, but when to use them and what traps to watch for.

## Runtime Permissions

The runtime permission model arrived with API 23, and it fundamentally changed the contract between apps and users. Before Marshmallow, permissions were granted at install time — the user either accepted all of them or didn't install the app. There was no granularity. Now, dangerous permissions (camera, location, contacts, microphone) must be requested at runtime, and the user can deny them individually.

The modern way to request permissions is through `ActivityResultContracts`. The old `requestPermissions()` and `onRequestPermissionsResult()` callback pattern is deprecated in practice — it's fragile, hard to test, and couples your permission logic to the Activity lifecycle. `ActivityResultContracts` gives you a clean launcher-based API.

```kotlin
class PhotoCaptureFragment : Fragment() {

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            openCamera()
        } else {
            showPermissionDeniedMessage()
        }
    }

    private fun onCaptureButtonClick() {
        when {
            ContextCompat.checkSelfPermission(
                requireContext(), Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED -> {
                openCamera()
            }
            shouldShowRequestPermissionRationale(
                Manifest.permission.CAMERA
            ) -> {
                showRationaleDialog {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                }
            }
            else -> {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }
}
```

The rationale flow matters more than most developers think. `shouldShowRequestPermissionRationale()` returns `true` when the user has denied the permission once but hasn't selected "Don't ask again." This is your one chance to explain why you need it. But here's the limitation that trips people up: `shouldShowRequestPermissionRationale()` returns `false` in two very different situations — when the user has never been asked (first launch) and when the user has permanently denied the permission. You can't distinguish between these two states without tracking it yourself, typically with a `SharedPreferences` flag that records whether you've asked before.

When a user permanently denies a permission, you can't show the system dialog anymore. The only option is to guide them to your app's settings page with `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`. But I'd argue that if you're regularly sending users to settings, your permission strategy needs rethinking. The better approach is graceful degradation — design features so they still work in a reduced capacity without the permission, and make the permission request contextual rather than upfront.

## Scoped Storage

Scoped storage was the most disruptive privacy change in recent Android history. Introduced in API 29 and enforced from API 30, it replaced the old model where `READ_EXTERNAL_STORAGE` gave your app access to the entire shared file system. Under scoped storage, each app gets its own sandboxed directory on external storage, and accessing other apps' files requires going through controlled APIs.

For media files — images, video, audio — you use `MediaStore`. Your app can read its own media files without any permission. Reading other apps' media requires `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, or `READ_MEDIA_AUDIO` on API 33+, which replaced the old `READ_EXTERNAL_STORAGE`. The key insight is that `MediaStore` isn't just a database — it's the access control layer. You query it with `ContentResolver` and get back content URIs that the system controls.

```kotlin
class GalleryRepository(private val context: Context) {

    suspend fun loadRecentPhotos(limit: Int = 50): List<MediaItem> {
        return withContext(Dispatchers.IO) {
            val photos = mutableListOf<MediaItem>()
            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.SIZE
            )
            val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

            context.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection, null, null, sortOrder
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                var count = 0
                while (cursor.moveToNext() && count < limit) {
                    val id = cursor.getLong(idColumn)
                    val name = cursor.getString(nameColumn)
                    val uri = ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id
                    )
                    photos.add(MediaItem(uri, name))
                    count++
                }
            }
            photos
        }
    }
}
```

For non-media documents — PDFs, spreadsheets, text files — you use the Storage Access Framework (SAF). `ACTION_OPEN_DOCUMENT` launches the system file picker, and the user selects what to share. Your app gets a content URI with temporary access, and you can persist that access with `takePersistableUriPermission()` if you need to reopen the file later. SAF is more restrictive but more private — the user explicitly chooses what your app can see.

Now, about `MANAGE_EXTERNAL_STORAGE`. This permission gives your app broad access to all files, and Google Play has a strict policy about it. Unless your app is a file manager, backup tool, or antivirus scanner, your Play Store submission will be rejected if you request it. I've seen teams reach for `MANAGE_EXTERNAL_STORAGE` because migrating to MediaStore and SAF felt like too much work. That's short-term thinking. The Play Store review will catch it, and even if it didn't, future API levels will likely restrict it further. Do the migration properly.

## Location Privacy

Location is the most privacy-sensitive data most apps collect, and Android has tightened the rules significantly since API 29. The biggest change came in API 31 (Android 12), which introduced approximate location as a user-facing option. When your app requests `ACCESS_FINE_LOCATION`, the permission dialog now shows two choices: "Precise" and "Approximate." The user can grant approximate location even if you only asked for precise. Your app must handle both.

```kotlin
class NearbyStoresViewModel(
    private val locationClient: FusedLocationProviderClient,
    private val storeRepository: StoreRepository
) : ViewModel() {

    private val _stores = MutableStateFlow<List<Store>>(emptyList())
    val stores: StateFlow<List<Store>> = _stores.asStateFlow()

    fun findNearbyStores(context: Context) {
        val hasFineLocation = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val hasCoarseLocation = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasCoarseLocation) return

        viewModelScope.launch {
            val location = locationClient.lastLocation.await() ?: return@launch
            // Adjust search radius based on precision granted
            val radiusKm = if (hasFineLocation) 2.0 else 15.0
            _stores.value = storeRepository.findNear(
                location.latitude, location.longitude, radiusKm
            )
        }
    }
}
```

The practical takeaway: always request `ACCESS_COARSE_LOCATION` alongside `ACCESS_FINE_LOCATION`, and design your feature to work with approximate location. A store finder can widen its search radius. A weather app works perfectly with city-level precision. Only request precise location when the feature genuinely requires it — navigation, geofencing with small radii, or AR overlays.

Background location is even more restricted. Since API 29, `ACCESS_BACKGROUND_LOCATION` is a separate permission that must be requested independently — you can't bundle it with foreground location. On API 30+, the system sends users to a separate settings page to grant it, and your app can't show the system dialog for it. Google Play also requires a declaration explaining why you need background location, and most apps get rejected on the first try. If you need continuous location updates when the app isn't visible, you must use a foreground service with type `location`. The system shows an ongoing notification, making the access transparent to the user.

The best practice for location is simple: minimize what you collect. If you only need the city, request `ACCESS_COARSE_LOCATION` only. If you need one-time location for a check-in, request `ACCESS_FINE_LOCATION` with the one-time permission option (API 30+). If you need continuous tracking, use a foreground service and explain it clearly to the user.

## Photo Picker

The system photo picker, introduced in API 33 and backported to API 19 through Google Play Services, is the single best privacy improvement for media access. Here's the key point: **the photo picker requires no storage permission at all.** The user selects photos through a system-controlled UI, and your app receives content URIs only for the selected items. You never see the full media library.

```kotlin
class AvatarSelectionFragment : Fragment() {

    private val pickMedia = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            viewModel.updateAvatar(uri)
        }
    }

    private val pickMultipleMedia = registerForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 10)
    ) { uris ->
        if (uris.isNotEmpty()) {
            viewModel.attachPhotos(uris)
        }
    }

    private fun onSelectAvatarClick() {
        pickMedia.launch(
            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
        )
    }

    private fun onAttachPhotosClick() {
        pickMultipleMedia.launch(
            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
        )
    }
}
```

The `PickVisualMedia` contract handles both single and multiple selection. You can filter by type — `ImageOnly`, `VideoOnly`, `ImageAndVideo`, or a custom MIME type. The backport through `androidx.activity` version 1.7.0+ means you can use this on devices running Android 4.4 and above. On devices without the native photo picker, the library falls back to `ACTION_OPEN_DOCUMENT` automatically. You can check availability with `ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(context)`.

The honest tradeoff: the photo picker gives you less control over the selection UI. You can't customize the look, add a camera capture button inline, or show a grid with pre-selections. If your app is a photo editor or social media app that needs a fully custom gallery experience, you'll still need `READ_MEDIA_IMAGES` and a custom gallery implementation. But for profile pictures, message attachments, document uploads — basically 80% of photo selection use cases — the system picker is the right answer. Less permission, less code, less privacy liability.

## Privacy-First Design

Every privacy feature I've covered so far is reactive — it's about complying with restrictions Android imposes. Privacy-first design is proactive. It means making architectural decisions that minimize your app's data footprint before any platform requirement forces you to.

**Data minimization** is the core principle. Collect only what you need, and nothing more. If your analytics needs to track which screens users visit, track screen names — not GPS coordinates, device IDs, and contact lists. I've worked on projects where the analytics SDK was collecting 40+ data points per event, and when we audited it, we realized we were using exactly 5 of them in our dashboards. The other 35 were liability with zero value.

**Local processing** is the privacy-friendly default. If you can do the computation on-device, don't send the data to a server. ML Kit runs on-device for text recognition, face detection, and barcode scanning. CameraX can process frames locally. If your feature works without a network call, that's one less data transmission to secure, explain in your privacy policy, and potentially leak.

**Data retention** matters too. If you cache user data for performance, set expiration policies. Room makes this straightforward — a nightly `WorkManager` job can clear records older than 30 days. The data you've deleted can't be leaked.

```kotlin
class DataRetentionWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val db = AppDatabase.getInstance(applicationContext)
        val cutoffTimestamp = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(30)

        db.searchHistoryDao().deleteOlderThan(cutoffTimestamp)
        db.cachedProfileDao().deleteOlderThan(cutoffTimestamp)
        db.analyticsEventDao().deleteOlderThan(cutoffTimestamp)

        return Result.success()
    }
}
```

For auditing your app's data access, Android 12+ provides the **Privacy Dashboard**, which shows users a timeline of when apps accessed location, camera, and microphone. Your app can proactively participate by using `AppOpsManager.OnOpNotedCallback` to log every permission access internally. This is useful for finding surprise data access — third-party SDKs that access location without your knowledge, analytics libraries that read the device ID, ad SDKs that access the microphone.

```kotlin
class PrivacyAuditApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val appOpsCallback = object : AppOpsManager.OnOpNotedCallback() {
                override fun onNoted(syncNotedAppOp: SyncNotedAppOp) {
                    Log.d("PrivacyAudit",
                        "Op: ${syncNotedAppOp.op}, " +
                        "Stack: ${Throwable().stackTrace.take(5).joinToString("\n")}"
                    )
                }

                override fun onSelfNoted(syncNotedAppOp: SyncNotedAppOp) {
                    onNoted(syncNotedAppOp)
                }

                override fun onAsyncNoted(asyncNotedAppOp: AsyncNotedAppOp) {
                    Log.d("PrivacyAudit",
                        "Async Op: ${asyncNotedAppOp.op}, " +
                        "Message: ${asyncNotedAppOp.message}"
                    )
                }
            }
            val appOps = getSystemService(AppOpsManager::class.java)
            appOps.setOnOpNotedCallback(mainExecutor, appOpsCallback)
        }
    }
}
```

This callback logs every data operation with a stack trace, so you can trace exactly which code path — yours or a third-party SDK's — triggered the access. I've caught two SDKs accessing location data this way in a production app, neither of which we'd authorized. The audit callback is a debug tool, but the insights it provides should inform your production architecture.

## Quiz

**Question 1:** You call `shouldShowRequestPermissionRationale()` and it returns `false`. The user has used the app before. What does this mean?

**Wrong:** The user has never been asked for this permission.

**Correct:** The user has permanently denied the permission (selected "Don't ask again"). Since the user has used the app before, the `false` return means you can't show the system dialog — you need to direct them to app settings or degrade gracefully.

**Question 2:** Your app targets API 33 and needs to display the user's photos in a custom gallery. Which permission do you request?

**Wrong:** `READ_EXTERNAL_STORAGE` — it worked fine on older API levels.

**Correct:** `READ_MEDIA_IMAGES`. On API 33+, `READ_EXTERNAL_STORAGE` no longer grants access to media files. The permission was split into `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and `READ_MEDIA_AUDIO`. And if you don't need a custom gallery, skip the permission entirely and use the system photo picker.

## Coding Challenge

Build a `PermissionManager` class that wraps the `ActivityResultContracts` permission flow with proper rationale handling, permanent denial detection (using a `SharedPreferences` flag), and graceful degradation. The class should expose a `requestPermission(permission: String, onGranted: () -> Unit, onDenied: () -> Unit, onPermanentlyDenied: () -> Unit)` method. Test it with camera and location permissions, and verify that each callback fires in the correct scenario.

Thanks for reading!
