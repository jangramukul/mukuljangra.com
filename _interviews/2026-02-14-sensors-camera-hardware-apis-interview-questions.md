---
title: "Sensors, Camera & Hardware APIs"
date: 2026-02-14
layout: interview
tags: [Technical Round]
order: 14
sequence: 50
description: "These topics come up in interviews when the role involves features like maps, fitness tracking, camera-based scanning, or Bluetooth connectivity."
---

## Sensors, Camera & Hardware APIs

These topics come up in interviews when the role involves features like maps, fitness tracking, camera-based scanning, or Bluetooth connectivity. Interviewers want to see that you understand how Android interacts with device hardware and can handle the lifecycle and permission complexities that come with it.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the three categories of sensors in Android?

Android groups sensors into three categories:
- **Motion sensors** — measure acceleration and rotation forces along three axes. This includes the accelerometer, gyroscope, gravity sensor, and rotation vector sensor.
- **Environmental sensors** — measure ambient conditions like temperature, pressure, humidity, and light. This includes the barometer, photometer, and thermometer.
- **Position sensors** — measure the physical position of the device. This includes the magnetometer (for compass bearings) and the proximity sensor.

Some sensors are hardware-based (physical components on the device) and some are software-based (virtual sensors that derive data from one or more hardware sensors). The linear acceleration sensor and gravity sensor are examples of software-based sensors.

#### Q2: How do you access sensor data using the Android sensor framework?

The sensor framework lives in the `android.hardware` package. You get a `SensorManager` from the system services, use it to find the sensor you need, and register a `SensorEventListener` to receive data.

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

Always unregister the listener in `onPause()` — leaving it registered drains battery because the sensor hardware stays active.

#### Q3: What is the difference between the accelerometer and the gyroscope?

The accelerometer measures linear acceleration forces applied to the device along three axes (x, y, z) in m/s², including gravity. It tells you how the device is tilted or if it is being shaken. The gyroscope measures the rate of rotation around each axis in rad/s. It tells you how fast the device is spinning. In practice, accelerometer data is used for tilt detection, step counting, and shake gestures. Gyroscope data is used for rotation tracking in games, AR, and image stabilization.

#### Q4: What is the Fused Location Provider, and why is it preferred over raw GPS?

The Fused Location Provider is part of Google Play Services (`com.google.android.gms.location`). It combines signals from GPS, Wi-Fi, cell towers, and device sensors to determine location. The main advantage is that it automatically picks the best source based on your accuracy and battery requirements, so you don't have to manage each provider manually. Raw GPS (`LocationManager` with `GPS_PROVIDER`) gives high accuracy outdoors but drains battery, is slow to get a fix, and fails indoors. The Fused Location Provider handles all of this behind the scenes — it can return a cached last-known location almost instantly and switch between providers transparently.

#### Q5: What location permissions does Android require, and how did they change over time?

- **`ACCESS_COARSE_LOCATION`** — approximate location (Wi-Fi/cell, roughly city-block level).
- **`ACCESS_FINE_LOCATION`** — precise GPS location.
- **`ACCESS_BACKGROUND_LOCATION`** — allows location access when the app is in the background. Required separately from Android 10 (API 29) onward.

Android 12 introduced the ability for users to grant only approximate location even when you request fine location. You must handle both cases. Background location requires a separate runtime permission request — you can't ask for it in the same dialog as foreground location. Google Play also requires justification for background location access during review.

#### Q6: What is geofencing in Android?

Geofencing lets you define virtual boundaries around geographic areas and get notified when the user enters, exits, or dwells in that area. It is built on top of the Fused Location Provider through the `GeofencingClient` API. You create a `Geofence` object with a center point (lat/lng), radius, and transition types (`GEOFENCE_TRANSITION_ENTER`, `GEOFENCE_TRANSITION_EXIT`, `GEOFENCE_TRANSITION_DWELL`). The system monitors these in a battery-efficient way — it uses cell and Wi-Fi signals when the user is far from the geofence and switches to GPS as they get closer. You can have up to 100 active geofences per app.

#### Q7: What is CameraX and how does it differ from Camera2?

Camera2 is the low-level camera API introduced in Android 5.0 (API 21). It gives full control over the camera pipeline — manual exposure, focus, ISO, RAW capture, and frame-by-frame processing. But it requires a lot of boilerplate: managing `CameraDevice`, `CameraCaptureSession`, `CaptureRequest`, and handling device-specific quirks.

CameraX is a Jetpack library built on top of Camera2. It simplifies camera development with a use-case-based API — you work with `Preview`, `ImageCapture`, `ImageAnalysis`, and `VideoCapture` use cases. CameraX is lifecycle-aware, handles device compatibility issues internally, and works consistently across devices. For most apps, CameraX is the right choice. Camera2 is needed when you require low-level control like manual focus or custom capture pipelines.

#### Q8: How do you set up a basic camera preview using CameraX?

CameraX provides two approaches — `CameraController` for simplicity and `CameraProvider` for flexibility. The simplest setup uses `LifecycleCameraController`:

```kotlin
val previewView: PreviewView = findViewById(R.id.previewView)
val cameraController = LifecycleCameraController(this)
cameraController.bindToLifecycle(this)
cameraController.cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
previewView.controller = cameraController
```

With `CameraProvider`, you bind use cases explicitly:

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

CameraX handles opening, closing, and releasing camera resources automatically based on the lifecycle.

#### Q9: What is the difference between Bluetooth Classic and Bluetooth Low Energy (BLE)?

Bluetooth Classic is used for continuous, high-throughput data transfer — audio streaming, file transfer, serial communication. It consumes more power and maintains a persistent connection. BLE (Bluetooth Low Energy) is designed for short bursts of small data transfers with significantly lower power consumption. BLE is used for IoT sensors, fitness devices, beacons, and proximity detection. In Android, Classic Bluetooth APIs are under `android.bluetooth`, while BLE uses `BluetoothLeScanner` for scanning and `BluetoothGatt` for communication. From Android 12 (API 31), BLE scanning and connecting require the `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` runtime permissions instead of the location permission that was required before.

#### Q10: What is NFC and what are its common uses in Android?

NFC (Near Field Communication) enables short-range wireless communication (typically 4 cm or less) between devices. Android supports three NFC modes:
- **Reader/Writer mode** — the app reads or writes NFC tags (e.g., scanning a product tag).
- **Peer-to-peer mode** — two NFC-enabled devices exchange data (Android Beam, now deprecated).
- **Card emulation mode** — the device acts like an NFC card for contactless payments (Google Pay uses this).

Android uses the tag dispatch system to route discovered NFC tags to the appropriate app. You define intent filters in the manifest for specific tag types (`NDEF_DISCOVERED`, `TECH_DISCOVERED`, `TAG_DISCOVERED`) and handle the tag data in your activity.

### Deep Dive Questions (Advanced → Expert)

#### Q11: How does the BiometricPrompt API work, and what are the authenticator classes?

The `BiometricPrompt` API (from the `androidx.biometric` library) provides a standard UI for fingerprint, face, and iris authentication. You create a `BiometricPrompt.PromptInfo` with `setAllowedAuthenticators()` to define what types of authentication to accept:
- **`BIOMETRIC_STRONG`** (Class 3) — hardware-backed biometrics that meet strict security requirements. Required for cryptographic operations.
- **`BIOMETRIC_WEAK`** (Class 2) — biometrics that meet basic requirements but aren't strong enough for crypto.
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

Before showing the prompt, check `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)` to see if the device supports it. The result tells you if biometrics are available, not enrolled, or not supported.

#### Q12: What is the CameraX ImageAnalysis use case, and how is it used for real-time processing?

`ImageAnalysis` provides CPU-accessible image buffers for frame-by-frame processing — barcode scanning, face detection, object recognition with ML Kit. You set an `Analyzer` that receives an `ImageProxy` for each frame.

```kotlin
val imageAnalysis = ImageAnalysis.Builder()
    .setTargetResolution(Size(1280, 720))
    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
    .build()

imageAnalysis.setAnalyzer(executor) { imageProxy ->
    val rotationDegrees = imageProxy.imageInfo.rotationDegrees
    // Process the image (e.g., ML Kit barcode scanning)
    processFrame(imageProxy)
    imageProxy.close() // must close to receive next frame
}

cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)
```

The backpressure strategy matters — `STRATEGY_KEEP_ONLY_LATEST` drops frames if your analyzer is slow, which is usually what you want for real-time processing. `STRATEGY_BLOCK_PRODUCER` blocks the camera pipeline until the previous frame is processed, which can cause preview lag. You must call `imageProxy.close()` when done, otherwise the pipeline stalls.

#### Q13: How does the sensor sampling rate work, and what are the trade-offs?

When registering a sensor listener, you pass a delay constant that hints at the desired sampling rate:
- `SENSOR_DELAY_NORMAL` — ~200ms, suitable for screen orientation changes.
- `SENSOR_DELAY_UI` — ~60ms, suitable for UI-driven updates.
- `SENSOR_DELAY_GAME` — ~20ms, suitable for games.
- `SENSOR_DELAY_FASTEST` — as fast as the hardware supports, can be sub-millisecond.

These are hints, not guarantees — the actual rate depends on hardware. Higher sampling rates give more responsive data but increase CPU usage and battery drain significantly. From Android 12 (API 31), apps targeting that version or higher are rate-limited to 200Hz for most sensors unless the `HIGH_SAMPLING_RATE_SENSORS` permission is declared. This was a privacy measure to prevent acoustic eavesdropping through the gyroscope.

#### Q14: How would you implement a step counter using the sensor framework?

Android provides two hardware sensors for step counting:
- `TYPE_STEP_COUNTER` — returns the total number of steps since the last reboot. It's a hardware-backed counter that runs even when your app isn't active. You read the cumulative count and calculate the difference from your saved baseline.
- `TYPE_STEP_DETECTOR` — fires an event each time a single step is detected.

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

`TYPE_STEP_COUNTER` is preferred for accuracy because the hardware handles step detection continuously. `TYPE_STEP_DETECTOR` is useful when you need real-time per-step events. Both require the `ACTIVITY_RECOGNITION` permission on Android 10 and above.

#### Q15: What is the difference between MediaPlayer and ExoPlayer?

`MediaPlayer` is the built-in Android framework class for audio and video playback. It supports basic formats and is simple to use for straightforward playback. But it has limited format support, poor customization options, and inconsistent behavior across devices.

ExoPlayer (now part of `androidx.media3`) is Google's open-source media player library. It supports DASH, HLS, SmoothStreaming, and progressive downloads out of the box. It is highly customizable — you can swap components like the renderer, extractor, load control, and track selector. ExoPlayer also supports DRM playback, ad insertion, and background audio with `MediaSession` integration. For any production app that plays media, ExoPlayer (Media3) is the standard choice. `MediaPlayer` is only suitable for the simplest cases like playing a notification sound.

#### Q16: How do you handle BLE communication in Android — scanning, connecting, and reading characteristics?

BLE communication follows a specific flow:
- **Scan** — use `BluetoothLeScanner.startScan()` with `ScanFilter` and `ScanSettings` to find nearby BLE devices. Always set scan filters to limit results and stop scanning once you find your device.
- **Connect** — call `device.connectGatt()` to establish a GATT connection. This returns a `BluetoothGatt` object. All callbacks come through `BluetoothGattCallback`.
- **Discover services** — after connection, call `gatt.discoverServices()`. When `onServicesDiscovered` fires, you can enumerate services and characteristics.
- **Read/Write** — use `gatt.readCharacteristic()` or `gatt.writeCharacteristic()` for data transfer. For continuous data, enable notifications with `gatt.setCharacteristicNotification()` and write to the descriptor.

The tricky part is that all GATT operations are asynchronous and must be serialized — you can only have one pending operation at a time. Sending a second read before the first callback arrives silently fails. Most production BLE implementations use a command queue to serialize operations.

#### Q17: What are the Camera2 API's capture request and session concepts?

In Camera2, the entire pipeline revolves around three core objects:
- **`CameraDevice`** — represents the physical camera. You open it with `CameraManager.openCamera()`.
- **`CameraCaptureSession`** — the active session where you submit capture requests. Created by calling `cameraDevice.createCaptureSession()` with a list of output surfaces.
- **`CaptureRequest`** — defines what to capture and how. Built with `CaptureRequest.Builder`, where you set parameters like auto-focus mode, exposure, flash, and target surfaces.

For a live preview, you create a repeating request (`session.setRepeatingRequest()`). For a photo, you send a single capture request (`session.capture()`). The complexity is in managing the state machine — you need to handle `CameraDevice.StateCallback`, `CameraCaptureSession.StateCallback`, and `CameraCaptureSession.CaptureCallback`, all of which are asynchronous. This is exactly the boilerplate that CameraX eliminates.

#### Q18: How does Android handle location in the background, and what restrictions apply?

Android has progressively restricted background location access:
- **Android 8.0 (API 26)** — limited background location updates to a few times per hour.
- **Android 10 (API 29)** — introduced `ACCESS_BACKGROUND_LOCATION` as a separate permission. Apps must request it independently from foreground location.
- **Android 11 (API 30)** — removed the ability to request background location in the same dialog as foreground location. Users must go to Settings to grant it.
- **Android 12 (API 31)** — approximate location option added. Users can grant coarse location even if the app requests fine location.

For continuous background location (navigation, fitness tracking), use a foreground service with `foregroundServiceType="location"`. For periodic location checks, use WorkManager with location constraints. The Fused Location Provider's `requestLocationUpdates()` with a `PendingIntent` is the standard approach for background updates, but the system throttles delivery when the app is in the background.

#### Q19: What is the proximity sensor, and how is it used in Android?

The proximity sensor measures how close an object is to the device's screen, typically reporting distance in centimeters. Most devices only report a binary value — near (0 cm) or far (max range). Android uses it internally during phone calls to turn off the screen when you hold the phone to your ear, preventing accidental touches. Apps can use `TYPE_PROXIMITY` sensor to detect when the device is covered or in a pocket. The key thing to know is that wake locks tied to the proximity sensor (`PROXIMITY_SCREEN_OFF_WAKE_LOCK`) let you turn the screen off when the sensor detects an object and back on when it clears, without needing to manage screen state manually.

#### Q20: How do you handle sensor data filtering to reduce noise?

Raw sensor data is noisy. Two common filtering approaches are:
- **Low-pass filter** — smooths out rapid changes, useful for isolating the gravity component from accelerometer data. You blend the current reading with the previous filtered value using an alpha factor: `filtered = alpha * previous + (1 - alpha) * current`. A smaller alpha means more smoothing.
- **High-pass filter** — removes the slow-changing component (like gravity) and keeps rapid changes (user motion). Calculated as: `highPass = current - lowPassFiltered`.

For more sophisticated filtering, the rotation vector sensor (`TYPE_ROTATION_VECTOR`) fuses accelerometer, gyroscope, and magnetometer data using a Kalman filter internally. This gives you a stable orientation estimate without manual filtering. In practice, always prefer composite sensors over manually fusing raw sensor data — the platform implementation is optimized and tested across devices.

### Common Follow-ups

- How do you check if a specific sensor is available on the device before using it?
- What happens if you forget to unregister a sensor listener?
- How would you implement a compass using the magnetometer and accelerometer?
- What is the difference between `PRIORITY_HIGH_ACCURACY` and `PRIORITY_BALANCED_POWER_ACCURACY` in location requests?
- How do you handle the case where the user grants only approximate location?
- What are CameraX extensions, and what features do they provide (night mode, HDR, bokeh)?
- How would you implement barcode scanning using CameraX and ML Kit?
- What is HCE (Host-based Card Emulation) and how is it different from regular NFC tag reading?
- How do you handle BLE connection drops and automatic reconnection?
- What is the `ACTIVITY_RECOGNITION` permission and when is it required?
