---
title: "Notifications, Permissions & Security"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 9
---

## Notifications, Permissions & Security — What Interviewers Really Ask

This topic comes up in every senior Android interview because it sits at the intersection of user experience, platform compliance, and security engineering. Interviewers want to see that you understand the permission model well enough to design user-friendly permission flows, that you know how the notification system actually works under the hood, and that you can make informed decisions about securing user data. The questions tend to be practical — how would you handle this real scenario?

### Core Questions (Beginner → Intermediate)

#### Q1: What are the different types of permissions in Android?

Android has three main categories. **Install-time permissions** (also called normal permissions) are granted automatically at install without asking the user — things like `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`, `WAKE_LOCK`. These are considered low-risk. **Runtime permissions** (dangerous permissions) must be explicitly approved by the user through a system dialog — things like `CAMERA`, `READ_CONTACTS`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`. These access sensitive user data or device features. **Special permissions** require the user to navigate to a specific settings screen — things like `SYSTEM_ALERT_WINDOW` (draw over other apps), `WRITE_SETTINGS`, `REQUEST_INSTALL_PACKAGES`, and `MANAGE_EXTERNAL_STORAGE`.

Runtime permissions are grouped — for example, `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` are in the Location group. If you've already been granted one permission in a group, the system may auto-grant others in the same group without showing another dialog. But you should never rely on this behavior because Google has changed how grouping works across versions.

#### Q2: Walk through the runtime permission request flow. What are the edge cases?

You check if you have the permission with `ContextCompat.checkSelfPermission()`. If not granted, you check `shouldShowRequestPermissionRationale()` — this returns `true` if the user previously denied the permission but hasn't checked "Don't ask again." If it returns `true`, you should show a UI explanation of why you need the permission before requesting it. Then you use `ActivityResultContracts.RequestPermission()` to launch the request.

```kotlin
class CameraActivity : AppCompatActivity() {
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            openCamera()
        } else {
            // User denied — check if we should show rationale
            if (!shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
                // User checked "Don't ask again" — guide to settings
                showSettingsDialog()
            } else {
                showPermissionDeniedMessage()
            }
        }
    }

    private fun requestCamera() {
        when {
            ContextCompat.checkSelfPermission(
                this, Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED -> {
                openCamera()
            }
            shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) -> {
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

The tricky edge case: `shouldShowRequestPermissionRationale()` returns `false` in two situations — the user has never been asked (first time), or the user permanently denied ("Don't ask again"). You can't distinguish these without tracking state yourself. The common pattern is to save a flag in SharedPreferences after the first request, so you know if `false` means "first time" or "permanently denied."

#### Q3: What is the POST_NOTIFICATIONS permission introduced in Android 13?

Before Android 13 (API 33), apps could show notifications freely after creating a notification channel. Android 13 changed this — `POST_NOTIFICATIONS` is now a runtime permission that must be granted before your app can show any notifications. New installs on Android 13+ default to notifications being denied. The system dialog appears when you request the permission, and if the user denies it, your notifications are silently dropped.

For apps targeting Android 12 or lower running on an Android 13 device, the system auto-grants the permission if the app already has a notification channel created. But once the user upgrades to your Android 13-targeting version, the permission can be revoked. The practical impact is significant — if you rely on notifications for core functionality (messaging, delivery tracking, etc.), you need a permission request strategy early in the user journey, ideally during onboarding when the value proposition is clear.

#### Q4: What are notification channels and why do they matter?

Notification channels, introduced in Android 8.0 (API 26), give users granular control over notifications. Each channel has its own importance level, sound, vibration pattern, and lock screen visibility. Users can disable individual channels without blocking all notifications from your app. You must create at least one channel before posting a notification on API 26+, or the notification is silently dropped.

```kotlin
fun createNotificationChannels(context: Context) {
    val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // High priority: messages, calls
    val messagesChannel = NotificationChannel(
        "messages",
        "Messages",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "New message notifications"
        enableVibration(true)
    }

    // Low priority: background sync status
    val syncChannel = NotificationChannel(
        "sync",
        "Background Sync",
        NotificationManager.IMPORTANCE_LOW
    ).apply {
        description = "Data sync progress"
        enableVibration(false)
        setShowBadge(false)
    }

    notificationManager.createNotificationChannels(
        listOf(messagesChannel, syncChannel)
    )
}
```

The importance levels control behavior: `IMPORTANCE_HIGH` shows a heads-up notification, `IMPORTANCE_DEFAULT` shows in the status bar and shade, `IMPORTANCE_LOW` shows in the shade with no sound, `IMPORTANCE_MIN` shows only in the shade with no sound or visual interruption. Once a channel is created, the app can't change its importance level — only the user can. This is a deliberate design decision by Android to prevent apps from upgrading notification priority without user consent.

#### Q5: How does Firebase Cloud Messaging (FCM) work?

FCM is Google's push notification service. The flow works like this: your app registers with FCM at first launch and receives a unique registration token. Your app sends this token to your backend server. When the server wants to send a notification, it sends a message to FCM's API with the registration token (or a topic name). FCM routes the message to the right device over a persistent connection maintained by Google Play Services. The device receives the message and delivers it to your app.

There are two message types. **Notification messages** are handled by FCM automatically when the app is in the background — FCM shows the notification using the title and body you provided. When the app is in the foreground, it's delivered to your `FirebaseMessagingService.onMessageReceived()`. **Data messages** are always delivered to `onMessageReceived()` regardless of foreground/background state, giving you full control over what to do with them. In practice, many apps use data messages for everything because they need custom notification handling.

```kotlin
class AppMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Send the new token to your backend
        sendTokenToServer(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Data message — always delivered here
        val data = message.data
        val title = data["title"] ?: return
        val body = data["body"] ?: return

        showNotification(title, body, data)
    }
}
```

The important distinction: high-priority FCM messages can wake a device from Doze mode temporarily, which is why messaging apps still receive notifications even when the phone has been idle for hours. But Google monitors usage — if you abuse high-priority messages for non-user-facing work, they'll be downgraded to normal priority.

#### Q6: What is the Android Keystore and why should you use it?

The Android Keystore system lets you store cryptographic keys in a hardware-backed container (Trusted Execution Environment or StrongBox on supported devices). The critical property is that key material never enters your application's process. When you encrypt or sign data using a Keystore key, the operation happens inside the secure hardware — you send the plaintext in and get ciphertext back, but you never see the actual key bytes. This means even if an attacker compromises your app process, roots the device, or dumps your app's memory, they can't extract the key.

```kotlin
// Generate a key in the Android Keystore
val keyGenerator = KeyGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_AES,
    "AndroidKeyStore"
)
keyGenerator.init(
    KeyGenParameterSpec.Builder(
        "user_data_key",
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setUserAuthenticationRequired(true)
        .setUserAuthenticationParameters(300, KeyProperties.AUTH_BIOMETRIC_STRONG)
        .build()
)
keyGenerator.generateKey()

// Use the key to encrypt data
val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
val key = keyStore.getKey("user_data_key", null)
val cipher = Cipher.getInstance("AES/GCM/NoPadding")
cipher.init(Cipher.ENCRYPT_MODE, key)
val encryptedData = cipher.doFinal(plaintext)
val iv = cipher.iv // Store this alongside the encrypted data
```

The `setUserAuthenticationRequired(true)` line means the key can only be used after the user authenticates with biometrics or device credentials. This is how apps implement "authenticate to view sensitive data" — the actual decryption key is locked behind biometric verification at the hardware level.

#### Q7: What is EncryptedSharedPreferences?

`EncryptedSharedPreferences` is part of the Jetpack Security library. It's a wrapper around `SharedPreferences` that encrypts both keys and values using the Tink cryptography library. Under the hood, it uses AES256-SIV for encrypting keys (deterministic encryption, so you can still look them up) and AES256-GCM for encrypting values. The master key is stored in the Android Keystore.

```kotlin
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val encryptedPrefs = EncryptedSharedPreferences.create(
    context,
    "encrypted_settings",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

// Use it like regular SharedPreferences
encryptedPrefs.edit()
    .putString("auth_token", token)
    .apply()
```

Use it for storing small amounts of sensitive data — auth tokens, API keys, user preferences that contain PII. For larger datasets, use Room with SQLCipher or encrypt individual files. The main gotcha: `EncryptedSharedPreferences` is noticeably slower than regular `SharedPreferences` because every read and write involves encryption/decryption operations. Don't use it for high-frequency reads.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How does certificate pinning protect against man-in-the-middle attacks, and what are the risks?

In a normal HTTPS connection, the client trusts any certificate signed by a Certificate Authority in the device's trust store. There are hundreds of CAs, and any one of them could issue a certificate for your domain. If a CA is compromised (this has happened — DigiNotar in 2011, Symantec in 2015), or if a corporate proxy installs its own CA on employee devices, an attacker can intercept and decrypt your traffic without the client knowing.

Certificate pinning adds an additional check — your app only trusts certificates (or public keys) that you explicitly specify for your domain. Even if a rogue CA issues a valid certificate for your domain, your app rejects it because the pin doesn't match.

The risks are real though. If you pin to a leaf certificate and it expires or gets rotated, every version of your app with that pin breaks. If you pin to an intermediate CA certificate and the CA reorganizes its hierarchy, same problem. Best practice is to pin to the public key of the certificate (which survives certificate renewal as long as the same key pair is used) and always include at least one backup pin. Android's `network_security_config.xml` supports pin expiration dates, which is safer than hardcoded pins — once the pin expires, the app falls back to normal CA validation instead of breaking.

#### Q9: What are the common WebView security vulnerabilities and how do you mitigate them?

WebView is one of the highest-risk components in Android apps. The main vulnerabilities: **JavaScript Interface exploitation** — if you call `addJavascriptInterface()` on API levels below 17, all public methods of the injected object are exposed to JavaScript, and a malicious page could call any of them. On API 17+, only methods annotated with `@JavascriptInterface` are exposed, but even then, be very careful about what you expose. **Cross-site scripting (XSS)** — if your WebView loads untrusted content and you've enabled JavaScript, malicious scripts can steal data from your JavaScript interface or session cookies. **Intent scheme exploitation** — malicious pages can use `intent://` URLs to launch arbitrary activities in your app or other apps. **Mixed content** — loading HTTP resources inside an HTTPS page exposes the insecure content to interception.

Mitigations: disable JavaScript unless absolutely necessary (`settings.javaScriptEnabled = false`). Validate all URLs before loading them in the WebView. Override `shouldOverrideUrlLoading()` to intercept and validate navigation. If using `addJavascriptInterface()`, expose the absolute minimum functionality and validate all parameters. Enable Safe Browsing API (`WebView.enableSafeBrowsing()`). Set `setAllowFileAccess(false)` and `setAllowContentAccess(false)` unless you specifically need them.

#### Q10: How does the biometric authentication API work on Android?

The BiometricPrompt API is the unified interface for all biometric authentication on Android — fingerprint, face recognition, iris scanning. The key concept is authentication classes: `Class 3` (strong biometric, like fingerprint and structured-light face recognition), `Class 2` (weak biometric, like camera-based face recognition), and `Class 1` (convenience). Only Class 3 biometrics can be used to unlock cryptographic keys in the Keystore.

```kotlin
private val biometricPrompt = BiometricPrompt(
    this,
    ContextCompat.getMainExecutor(this),
    object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(
            result: BiometricPrompt.AuthenticationResult
        ) {
            // Use the crypto object to decrypt sensitive data
            val cipher = result.cryptoObject?.cipher
            val decryptedData = cipher?.doFinal(encryptedData)
        }

        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            // Handle: user cancelled, lockout, no biometrics enrolled
        }
    }
)

// Tie authentication to a cryptographic operation
val cipher = getCipherForDecryption() // initialized with Keystore key
val cryptoObject = BiometricPrompt.CryptoObject(cipher)

biometricPrompt.authenticate(
    BiometricPrompt.PromptInfo.Builder()
        .setTitle("Authenticate to view data")
        .setNegativeButtonText("Cancel")
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .build(),
    cryptoObject
)
```

The `CryptoObject` is the important part. By passing a `Cipher` that's initialized with a Keystore key that has `setUserAuthenticationRequired(true)`, the cryptographic operation is bound to the biometric authentication. The key can only be used after the user successfully authenticates. This is much more secure than just checking "did the user authenticate?" as a boolean — the actual encryption/decryption is gated by biometric verification at the hardware level.

#### Q11: What security considerations should you think about when storing and transmitting user data?

This is a question about security architecture, not just API knowledge. The principle is: minimize what you store, encrypt what you must store, and protect what you transmit.

**Storage**: Never store passwords in plain text — use a hash. Better yet, don't store them at all — use short-lived tokens and refresh them. Store sensitive data with `EncryptedSharedPreferences` or encrypted Room databases, not in plain SharedPreferences. Internal storage is safe from other apps (unless the device is rooted), but external storage is readable by any app with storage permissions. Avoid logging sensitive data — Logcat is readable in debug, and on older devices, by any app with `READ_LOGS` permission.

**Transmission**: Always use HTTPS. Set `cleartextTrafficPermitted="false"` in your network security config. Consider certificate pinning for your most sensitive endpoints. Don't send sensitive data in URL query parameters (they end up in server logs). Use HSTS headers to prevent protocol downgrade attacks.

**Code**: Enable R8/ProGuard to make reverse engineering harder. Use the NDK for storing API keys if you can't use a server-side proxy. Remove `android:debuggable="true"` in release builds (the build system does this automatically, but verify). Set `android:exported="false"` on components that don't need to be accessible externally. Detect rooted devices if your app handles financial or highly sensitive data.

#### Q12: How do notification actions, direct reply, and bundled notifications work?

Notification actions add buttons to the notification that trigger `PendingIntent`s. Direct reply lets users type a response directly from the notification shade without opening the app — you add a `RemoteInput` to the action. Bundled notifications group related notifications under a summary notification, preventing your app from flooding the notification shade.

```kotlin
// Direct reply action
val remoteInput = RemoteInput.Builder("key_reply")
    .setLabel("Reply")
    .build()

val replyIntent = PendingIntent.getBroadcast(
    context,
    0,
    Intent(context, ReplyReceiver::class.java).apply {
        putExtra("conversation_id", conversationId)
    },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
)

val replyAction = NotificationCompat.Action.Builder(
    R.drawable.ic_reply, "Reply", replyIntent
)
    .addRemoteInput(remoteInput)
    .build()

// Build bundled notifications
val summaryNotification = NotificationCompat.Builder(context, "messages")
    .setContentTitle("3 new messages")
    .setSmallIcon(R.drawable.ic_notification)
    .setGroup("messages_group")
    .setGroupSummary(true)
    .build()

val messageNotification = NotificationCompat.Builder(context, "messages")
    .setContentTitle(senderName)
    .setContentText(messageText)
    .setSmallIcon(R.drawable.ic_notification)
    .setGroup("messages_group")
    .addAction(replyAction)
    .build()
```

For direct reply, the `PendingIntent` must be `FLAG_MUTABLE` because the system needs to write the user's reply text into the intent. In the `BroadcastReceiver`, you extract the reply text with `RemoteInput.getResultsFromIntent(intent)`. You must also update the notification after processing the reply to show feedback — otherwise the notification shows a spinner indefinitely.

#### Q13: What is the difference between data messages and notification messages in FCM, and why does it matter?

Notification messages have a `notification` payload that FCM's built-in handler processes when the app is in the background. It automatically creates and shows a notification using the title and body fields. Your app's `onMessageReceived()` only gets called if the app is in the foreground. This means you have no control over how the notification looks or behaves when the app is backgrounded.

Data messages have only a `data` payload and are always delivered to `onMessageReceived()`, regardless of app state. This gives you full control — you can customize the notification, run business logic before showing it, or decide not to show a notification at all. The tradeoff is that on Android 13+, you need the `POST_NOTIFICATIONS` permission to show the notification yourself, and you must handle everything from channel creation to notification styling.

Most production apps use data messages exclusively, or a combination where the notification payload acts as a fallback. If you're building a messaging app, data messages are mandatory — you need to decrypt the message content, look up the sender's name from your local database, and construct a rich notification with reply actions, none of which FCM's automatic handler can do.

#### Q14: How would you implement a secure authentication flow in an Android app?

A production authentication flow involves several layers. The user enters credentials, which are sent over HTTPS to your auth server. The server returns a short-lived access token (15-60 minutes) and a longer-lived refresh token (days to weeks). Store both tokens encrypted — `EncryptedSharedPreferences` for the access token (frequent reads), Keystore-backed encryption for the refresh token (higher security). Attach the access token to every API request via an OkHttp interceptor. When a request returns 401, use the refresh token to get a new access token. When the refresh token expires, force re-authentication.

Security hardening: never store the user's password. Use PKCE (Proof Key for Code Exchange) if using OAuth. Clear tokens when the user logs out. Implement token rotation — when you use a refresh token, invalidate the old one and issue a new pair. Use certificate pinning on your auth endpoints. Consider requiring biometric authentication to unlock the encrypted tokens for sensitive apps (banking, health). Detect rooted devices and warn the user if you handle financial data.

### Common Follow-ups

- What happens when a user revokes a permission that your app previously had?
- How do you handle the case where a user denies a permission with "Don't ask again"?
- What is the difference between `Keychain` and `Keystore`?
- How does scoped storage affect your app's file access?
- What are the differences between AES, RSA, and SHA algorithms?
- How would you implement notification grouping for a messaging app?
- What is `StrongBox` and when is it available?
- How do you test push notifications in development?

### Tips for the Interview

1. **Know the permission lifecycle** — The flow from first request to permanent denial to settings redirect. Being able to walk through every branch with confidence shows you've implemented this in production, not just read about it.

2. **Security is about layers** — Don't just mention one mechanism. Show you think in layers: HTTPS for transit, certificate pinning for MITM protection, Keystore for key storage, encrypted preferences for data at rest, biometric gates for access control. Each layer protects against a different threat.

3. **FCM data vs notification messages** — This is a very common question and many candidates get it wrong. Know exactly when `onMessageReceived()` is called for each type and why data messages are preferred in production.

4. **Be ready for Android version changes** — POST_NOTIFICATIONS (API 33), foreground service types (API 34), exact alarm restrictions (API 31). Showing you track these changes across versions signals that you actively maintain production apps.

5. **Don't over-engineer security answers** — If the interviewer asks about storing an auth token, `EncryptedSharedPreferences` is usually the right answer. You don't need to describe a hardware security module setup. Match your answer to the threat model of the scenario.
