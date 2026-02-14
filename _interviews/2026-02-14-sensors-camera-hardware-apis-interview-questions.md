---
title: "Sensors, Camera & Hardware APIs"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 32
sequence: 32
description: "These topics come up in interviews when the role involves features like maps, fitness tracking, camera-based scanning, or Bluetooth connectivity."
---

## Sensors, Camera & Hardware APIs

These topics come up when the role involves maps, fitness tracking, camera-based scanning, or Bluetooth connectivity. You need to understand how Android interacts with hardware and how to handle lifecycle and permission complexities.

#### What is CameraX and how does it differ from Camera2?

Think of Camera2 as driving a manual transmission car. You get full control — manual exposure, focus, ISO, RAW capture, frame-by-frame processing — but you're also managing `CameraDevice`, `CameraCaptureSession`, `CaptureRequest`, and dealing with device-specific quirks yourself. That's a lot of gears to shift.

CameraX is the automatic transmission. It's a Jetpack library built on top of Camera2 that gives you a use-case-based API — `Preview`, `ImageCapture`, `ImageAnalysis`, and `VideoCapture`. It's lifecycle-aware, handles device compatibility internally, and just works consistently across devices. For most apps, CameraX is the right choice. You'd only reach for Camera2 when you need low-level control like manual focus or custom capture pipelines.

#### How do you set up a camera preview using CameraX?

You've got two approaches — `CameraController` for when you want simplicity, and `CameraProvider` for when you need flexibility. Here's the simple one:

```kotlin
val previewView: PreviewView = findViewById(R.id.previewView)
val cameraController = LifecycleCameraController(this)
cameraController.bindToLifecycle(this)
cameraController.cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
previewView.controller = cameraController
```

With `CameraProvider`, you bind use cases explicitly — more code, but more control:

```kotlin
val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
cameraProviderFuture.addListener({
    val cameraProvider = cameraProviderFuture.get()
    val preview = Preview.Builder().build().also {
        it.setSurfaceProvider(previewView.surfaceProvider)
    }
    cameraProvider.bindToLifecycle(
        this, CameraSelector.DEFAULT_BACK_CAMERA, preview
    )
}, ContextCompat.getMainExecutor(this))
```

Here's the thing — CameraX opens, closes, and releases camera resources automatically based on the lifecycle. You don't babysit the camera anymore.

#### What location permissions does Android require?

Three permissions, each with a different scope:
- **`ACCESS_COARSE_LOCATION`** — approximate location from Wi-Fi/cell, roughly city-block level.
- **`ACCESS_FINE_LOCATION`** — precise GPS location.
- **`ACCESS_BACKGROUND_LOCATION`** — location access when the app is in the background. Required separately from Android 10 (API 29).

Plot twist: Android 12 lets users grant only approximate location even when you request fine. Background location needs a separate runtime request — you can't bundle it with the foreground dialog. And Google Play requires you to justify background location during review.

#### What is the Fused Location Provider and why use it over raw GPS?

The Fused Location Provider is part of Google Play Services, and it's like having a smart assistant that picks the best location source for you. It combines GPS, Wi-Fi, cell towers, and device sensors to determine location, automatically choosing the best source based on your accuracy and battery needs.

Raw GPS via `LocationManager` is like asking one expert only — great accuracy outdoors, but it drains battery, takes time to get a fix, and completely fails indoors. The Fused Location Provider handles all of this. It returns a cached last-known location almost instantly and switches between providers transparently. For almost every use case, this is what you want.

> **🧠 Think about it:** If the Fused Location Provider already combines GPS, Wi-Fi, and cell towers, when would you ever need to use `LocationManager` directly?

#### How does the BiometricPrompt API work?

`BiometricPrompt` from `androidx.biometric` gives you a standard UI for fingerprint, face, and iris authentication. You pick the allowed authenticator types:
- **`BIOMETRIC_STRONG`** (Class 3) — hardware-backed biometrics. Required for crypto operations.
- **`BIOMETRIC_WEAK`** (Class 2) — basic biometrics, not strong enough for crypto.
- **`DEVICE_CREDENTIAL`** — PIN, pattern, or password.

```kotlin
val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("Authenticate")
    .setSubtitle("Verify your identity")
    .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
    .build()

val biometricPrompt = BiometricPrompt(this, executor,
    object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: AuthenticationResult) {
            val cipher = result.cryptoObject?.cipher
        }
        override fun onAuthenticationFailed() {}
    }
)
biometricPrompt.authenticate(promptInfo)
```

One thing you should always do first — call `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)` to check if the device actually supports it. Don't show a biometric prompt on a device with no biometric hardware.

#### What are the three categories of sensors in Android?

Android groups sensors into three buckets:
- **Motion sensors** — measure acceleration and rotation. Includes accelerometer, gyroscope, gravity sensor, and rotation vector sensor.
- **Environmental sensors** — measure ambient conditions like temperature, pressure, humidity, and light.
- **Position sensors** — measure physical position. Includes the magnetometer (compass) and proximity sensor.

Here's the thing — not all of these are physical chips. Some sensors are software-based, meaning they're derived from combining one or more hardware sensors. The linear acceleration sensor and gravity sensor are software-based. The system fuses hardware data to create them.

#### How do you access sensor data in Android?

The sensor framework lives in `android.hardware`. You grab a `SensorManager` from system services, find your sensor, and register a listener. It's like subscribing to a data stream — you tell the system "hey, send me updates."

```kotlin
class MotionActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    }

    override fun onResume() {
        super.onResume()
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}
}
```

Always unregister in `onPause()`. Leaving it registered is like leaving the faucet running — the sensor hardware stays active and drains the battery even when the user isn't looking at your app.

#### What is the difference between the accelerometer and the gyroscope?

The accelerometer measures linear acceleration along three axes (x, y, z) in m/s², including gravity. It tells you about tilt and shake. The gyroscope measures rate of rotation around each axis in rad/s — basically how fast the device is spinning.

Think of it this way — the accelerometer tells you "which way is down" and the gyroscope tells you "how fast are you turning." Accelerometer handles tilt detection, step counting, and shake gestures. Gyroscope handles rotation tracking in games, AR, and image stabilization.

#### What is the difference between Bluetooth Classic and BLE?

Bluetooth Classic is like a phone call — continuous, high-throughput data flowing through a persistent connection. Audio streaming, file transfer, serial communication. Uses more power because the connection stays open.

BLE (Bluetooth Low Energy) is more like texting — short bursts of small data with minimal power consumption. It's used for IoT sensors, fitness devices, beacons, and proximity detection. In Android, Classic Bluetooth APIs live under `android.bluetooth`, while BLE uses `BluetoothLeScanner` for scanning and `BluetoothGatt` for communication. From Android 12, BLE requires `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` runtime permissions instead of location permission.

#### How does Android handle location in the background?

Android has been tightening the screws on background location with every release:
- **Android 8.0 (API 26)** — limited background updates to a few times per hour.
- **Android 10 (API 29)** — `ACCESS_BACKGROUND_LOCATION` became a separate permission.
- **Android 11 (API 30)** — users must go to Settings to grant background location. You can't request it in a dialog anymore.
- **Android 12 (API 31)** — users can grant coarse location even when you request fine.

For continuous background location like navigation or fitness tracking, use a foreground service with `foregroundServiceType="location"`. For periodic checks, use WorkManager. The Fused Location Provider's `requestLocationUpdates()` with a `PendingIntent` works for background updates, but the system throttles delivery.

#### What is geofencing in Android?

Geofencing is like drawing an invisible fence on a map and getting notified when someone crosses it. You define virtual boundaries around geographic areas and get callbacks when the user enters, exits, or dwells in that area. It uses the `GeofencingClient` API built on top of the Fused Location Provider.

You create a `Geofence` with a center point, radius, and transition types (`GEOFENCE_TRANSITION_ENTER`, `EXIT`, `DWELL`). The system monitors these efficiently — it uses cell and Wi-Fi when the user is far away and switches to GPS as they get closer. There's a limit of 100 active geofences per app.

> **🧠 Think about it:** Why do you think the system uses cell/Wi-Fi when the user is far from a geofence and only switches to GPS when they're close?

#### What is the CameraX ImageAnalysis use case?

`ImageAnalysis` gives you CPU-accessible image buffers for frame-by-frame processing — barcode scanning, face detection, object recognition. You're basically getting a stream of frames to do whatever you want with.

```kotlin
val imageAnalysis = ImageAnalysis.Builder()
    .setTargetResolution(Size(1280, 720))
    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
    .build()

imageAnalysis.setAnalyzer(executor) { imageProxy ->
    val rotationDegrees = imageProxy.imageInfo.rotationDegrees
    processFrame(imageProxy)
    imageProxy.close() // must close or the pipeline stalls
}

cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)
```

`STRATEGY_KEEP_ONLY_LATEST` drops frames if your analyzer is slow — usually what you want for real-time processing. And you must call `imageProxy.close()` when you're done, otherwise the whole pipeline freezes waiting for you.

#### What is the difference between MediaPlayer and ExoPlayer?

`MediaPlayer` is the built-in framework class. Simple to use, but limited format support, poor customization, and inconsistent behavior across devices. It's the bare minimum.

ExoPlayer (now `androidx.media3`) is Google's open-source media player, and it's a completely different league. It supports DASH, HLS, SmoothStreaming, and progressive downloads. You can swap components like the renderer, extractor, and track selector. It also supports DRM, ad insertion, and background audio with `MediaSession` integration. For any production app, Media3 is the standard choice. `MediaPlayer` is really only for the simplest cases like playing a notification sound.

#### How would you implement a step counter?

Android gives you two hardware sensors for this:
- `TYPE_STEP_COUNTER` — total steps since last reboot. Hardware-backed, runs even when your app isn't active. You save a baseline and calculate the difference.
- `TYPE_STEP_DETECTOR` — fires an event for each individual step.

```kotlin
val stepCounter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
sensorManager.registerListener(object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
        val totalStepsSinceBoot = event.values[0].toLong()
        val stepsInSession = totalStepsSinceBoot - baselineSteps
        updateUI(stepsInSession)
    }
    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {}
}, stepCounter, SensorManager.SENSOR_DELAY_NORMAL)
```

`TYPE_STEP_COUNTER` is preferred for accuracy since the hardware does the counting for you. Both require `ACTIVITY_RECOGNITION` permission on Android 10+.

#### How does the sensor sampling rate work?

When you register a listener, you pass a delay constant that's basically a hint to the system:
- `SENSOR_DELAY_NORMAL` — ~200ms, good for screen orientation.
- `SENSOR_DELAY_UI` — ~60ms, for UI updates.
- `SENSOR_DELAY_GAME` — ~20ms, for games.
- `SENSOR_DELAY_FASTEST` — as fast as the hardware allows.

I say "hint" because these are not guarantees — the system delivers what it can. Higher rates give more responsive data but increase CPU and battery usage. From Android 12 (API 31), most sensors are rate-limited to 200Hz unless you declare the `HIGH_SAMPLING_RATE_SENSORS` permission.

#### What is NFC and how is it used in Android?

NFC enables short-range wireless communication — we're talking about 4 cm range. Android supports three modes:
- **Reader/Writer** — read or write NFC tags.
- **Peer-to-peer** — two devices exchange data (Android Beam, now deprecated).
- **Card emulation** — the device acts like an NFC card for contactless payments (this is how Google Pay works).

Android routes discovered NFC tags to your app using the tag dispatch system. You define intent filters in the manifest for `NDEF_DISCOVERED`, `TECH_DISCOVERED`, or `TAG_DISCOVERED` and handle the tag data in your activity.

#### How do you handle BLE communication — scanning, connecting, and reading data?

BLE follows a specific flow, and you need to get each step right:
- **Scan** — `BluetoothLeScanner.startScan()` with `ScanFilter` and `ScanSettings`. Always set filters and stop scanning once you find your device.
- **Connect** — `device.connectGatt()` returns a `BluetoothGatt` object. All callbacks come through `BluetoothGattCallback`.
- **Discover services** — call `gatt.discoverServices()`. When `onServicesDiscovered` fires, enumerate services and characteristics.
- **Read/Write** — `gatt.readCharacteristic()` or `gatt.writeCharacteristic()`. For continuous data, enable notifications with `gatt.setCharacteristicNotification()`.

Now here's where it gets interesting — all GATT operations are async and must be serialized. Only one pending operation at a time. If you fire a second read before the first callback comes back, it silently fails. No error, no crash, just nothing happens. Most production BLE code uses a command queue to handle this.

#### What is the proximity sensor used for?

The proximity sensor measures how close an object is to the screen, usually in centimeters. Most devices simplify this to a binary value — near or far. Android uses it during phone calls to turn off the screen when you hold the phone to your ear, so you don't accidentally tap things with your cheek.

Apps can use `TYPE_PROXIMITY` to detect when the device is covered or in a pocket. The `PROXIMITY_SCREEN_OFF_WAKE_LOCK` lets you turn the screen off when the sensor detects an object and back on when it clears.

#### How do you filter noisy sensor data?

Raw sensor data is noisy — like trying to read a speedometer on a bumpy road. Two common approaches:
- **Low-pass filter** — smooths out rapid changes. Useful for isolating gravity from accelerometer data. Formula: `filtered = alpha * previous + (1 - alpha) * current`. Smaller alpha means more smoothing.
- **High-pass filter** — removes slow-changing components (gravity) and keeps rapid changes (user motion). `highPass = current - lowPassFiltered`.

But here's the practical advice — the rotation vector sensor (`TYPE_ROTATION_VECTOR`) fuses accelerometer, gyroscope, and magnetometer data internally. It gives you a stable orientation without manual filtering. Prefer composite sensors over manually fusing raw data whenever you can. The platform implementation is optimized across devices and will be better than what you'd hand-roll.

> **🧠 Think about it:** If composite sensors already fuse data internally, why does Android still expose the raw accelerometer, gyroscope, and magnetometer individually?

#### What are the Camera2 API's core concepts?

Camera2 revolves around three objects:
- **`CameraDevice`** — the physical camera. Opened with `CameraManager.openCamera()`.
- **`CameraCaptureSession`** — the session where you submit capture requests. Created with a list of output surfaces.
- **`CaptureRequest`** — defines what to capture and how. You set auto-focus mode, exposure, flash, and target surfaces.

For preview, you create a repeating request with `session.setRepeatingRequest()`. For a photo, use `session.capture()`. You need to handle `CameraDevice.StateCallback`, `CameraCaptureSession.StateCallback`, and `CaptureCallback` — all async. This is exactly the boilerplate that CameraX eliminates for you.

#### How do you check if a sensor is available before using it?

Call `sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)`. If it returns null, the device doesn't have that sensor. Always null-check before registering a listener — not every device has every sensor.

To list all available sensors on the device, use `sensorManager.getSensorList(Sensor.TYPE_ALL)`. This is handy for debugging or building a sensor dashboard.

#### What permissions are needed for Bluetooth on modern Android?

Before Android 12, Bluetooth scanning required `ACCESS_FINE_LOCATION` — which sounds weird, but BLE scans can reveal user location through beacon proximity. From Android 12 (API 31), Google introduced granular Bluetooth permissions:
- **`BLUETOOTH_SCAN`** — for discovering nearby devices.
- **`BLUETOOTH_CONNECT`** — for connecting to paired devices.
- **`BLUETOOTH_ADVERTISE`** — for making the device discoverable.

Here's a nice trick — if you set `android:usesPermissionFlags="neverForLocation"` on `BLUETOOTH_SCAN`, you don't need location permission at all. These are runtime permissions, so request them before scanning or connecting.

#### What is the ACTIVITY_RECOGNITION permission?

From Android 10 (API 29), you need the `ACTIVITY_RECOGNITION` permission to use step counter sensors (`TYPE_STEP_COUNTER`, `TYPE_STEP_DETECTOR`) and the Activity Recognition API. It's a runtime permission — request it before registering sensor listeners for step data.

Before Android 10, these sensors worked without any special permission. The change was a privacy measure since step data reveals physical activity patterns.

### Common Follow-ups

- How would you implement a compass using the magnetometer and accelerometer?
- What is the difference between `PRIORITY_HIGH_ACCURACY` and `PRIORITY_BALANCED_POWER_ACCURACY` in location requests?
- How do you handle the case where the user grants only approximate location?
- What are CameraX extensions, and what features do they provide (night mode, HDR, bokeh)?
- How would you implement barcode scanning using CameraX and ML Kit?
- What is HCE (Host-based Card Emulation) and how is it different from regular NFC tag reading?
- How do you handle BLE connection drops and automatic reconnection?
- What happens if you forget to unregister a sensor listener?
