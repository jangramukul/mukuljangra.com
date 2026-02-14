---
title: "Notifications, Permissions & Security"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 9
level: junior
sequence: 8
---

## Notifications, Permissions & Security

Covers the Android permission model, push notification system, and security fundamentals for protecting user data.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the different types of permissions in Android?

Android has three categories:

- **Install-time permissions** (normal) — granted automatically at install without user interaction. Examples: `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`, `WAKE_LOCK`. These are low-risk.
- **Runtime permissions** (dangerous) — require explicit user approval via a system dialog. Examples: `CAMERA`, `READ_CONTACTS`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`. These access sensitive data or device features.
- **Special permissions** — require the user to navigate to a settings screen. Examples: `SYSTEM_ALERT_WINDOW`, `WRITE_SETTINGS`, `REQUEST_INSTALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`.

Runtime permissions are grouped. For example, `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` are in the Location group. If one permission in a group is already granted, the system may auto-grant others without showing a dialog. Don't rely on this behavior since Google has changed how grouping works across versions.

#### Q2: Walk through the runtime permission request flow. What are the edge cases?

First, check if you have the permission with `ContextCompat.checkSelfPermission()`. If not granted, check `shouldShowRequestPermissionRationale()` — returns `true` if the user previously denied but hasn't checked "Don't ask again." If `true`, show a UI explanation before requesting. Then use `ActivityResultContracts.RequestPermission()` to launch the request.

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

The edge case is that `shouldShowRequestPermissionRationale()` returns `false` in two situations — user has never been asked (first time), or user permanently denied ("Don't ask again"). You can't distinguish these without tracking state yourself. Save a flag in SharedPreferences after the first request to know which case it is.

#### Q3: What is the POST_NOTIFICATIONS permission introduced in Android 13?

Before Android 13 (API 33), apps could show notifications freely after creating a notification channel. Android 13 made `POST_NOTIFICATIONS` a runtime permission. New installs on Android 13+ default to notifications being denied, and if the user denies the permission, notifications are silently dropped.

For apps targeting Android 12 or lower running on Android 13, the system auto-grants the permission if a notification channel already exists. Once the user upgrades to the Android 13-targeting version, the permission can be revoked. If your app relies on notifications for core functionality like messaging or delivery tracking, request this permission early during onboarding.

#### Q4: What are notification channels and why do they matter?

Notification channels were introduced in Android 8.0 (API 26). Each channel has its own importance level, sound, vibration pattern, and lock screen visibility. Users can disable individual channels without blocking all app notifications. You must create at least one channel before posting a notification on API 26+, or it gets silently dropped.

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

Importance levels control behavior:

- `IMPORTANCE_HIGH` — heads-up notification
- `IMPORTANCE_DEFAULT` — status bar and shade
- `IMPORTANCE_LOW` — shade with no sound
- `IMPORTANCE_MIN` — shade only, no sound or visual interruption

Once a channel is created, only the user can change its importance level. The app cannot modify it.

#### Q5: How does Firebase Cloud Messaging (FCM) work?

FCM is Google's push notification service. The app registers with FCM at first launch and receives a registration token. The app sends this token to the backend server. When the server wants to push a notification, it sends a message to FCM's API with the token or topic name. FCM routes the message to the device over a persistent connection maintained by Google Play Services.

There are two message types:

- **Notification messages** — FCM handles these automatically when the app is in the background using the title and body fields. In the foreground, they're delivered to `FirebaseMessagingService.onMessageReceived()`.
- **Data messages** — always delivered to `onMessageReceived()` regardless of app state, giving full control over handling.

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

High-priority FCM messages can wake a device from Doze mode, which is why messaging apps receive notifications even when the phone has been idle for hours. Google monitors this — abusing high-priority messages for non-user-facing work will get them downgraded to normal priority.

#### Q6: What is the Android Keystore and why should you use it?

Android Keystore stores cryptographic keys in a hardware-backed container (TEE or StrongBox). Key material never enters the application process. When you encrypt or sign data using a Keystore key, the operation happens inside the secure hardware — plaintext goes in, ciphertext comes back, but the actual key bytes are never exposed. Even if an attacker compromises the app process or roots the device, they can't extract the key.

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

Setting `setUserAuthenticationRequired(true)` means the key can only be used after the user authenticates with biometrics or device credentials. The decryption key is locked behind biometric verification at the hardware level.

#### Q7: What is EncryptedSharedPreferences?

`EncryptedSharedPreferences` is part of the Jetpack Security library. It wraps `SharedPreferences` and encrypts both keys and values using the Tink cryptography library. It uses AES256-SIV for key encryption (deterministic, so lookups still work) and AES256-GCM for value encryption. The master key is stored in Android Keystore.

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

Use it for small amounts of sensitive data like auth tokens, API keys, or user preferences containing PII. For larger datasets, use Room with SQLCipher or encrypt individual files. It's noticeably slower than regular `SharedPreferences` because every read and write involves encryption/decryption, so avoid it for high-frequency reads.

### Deep Dive Questions (Advanced → Expert)

#### Q8: How does certificate pinning protect against man-in-the-middle attacks, and what are the risks?

In a normal HTTPS connection, the client trusts any certificate signed by a CA in the device's trust store. There are hundreds of CAs, and if any one is compromised, an attacker can intercept and decrypt traffic without the client knowing.

Certificate pinning adds an extra check — the app only trusts certificates or public keys that you explicitly specify for your domain. Even if a rogue CA issues a valid certificate, the app rejects it because the pin doesn't match.

The risk is that if you pin to a leaf certificate and it expires or rotates, your app breaks. Best practice is to pin to the public key (which survives certificate renewal if the same key pair is used) and always include a backup pin. Android's `network_security_config.xml` supports pin expiration dates — once expired, the app falls back to normal CA validation instead of breaking.

#### Q9: What are the common WebView security vulnerabilities and how do you mitigate them?

WebView is a high-risk component. Main vulnerabilities:

- **JavaScript Interface exploitation** — on API < 17, all public methods of the injected object are exposed to JavaScript. On API 17+, only `@JavascriptInterface` annotated methods are exposed.
- **Cross-site scripting (XSS)** — if WebView loads untrusted content with JavaScript enabled, malicious scripts can steal data from your JavaScript interface or session cookies.
- **Intent scheme exploitation** — malicious pages can use `intent://` URLs to launch arbitrary activities.
- **Mixed content** — loading HTTP resources inside an HTTPS page exposes content to interception.

Mitigations:

- Disable JavaScript unless necessary (`settings.javaScriptEnabled = false`)
- Validate all URLs before loading
- Override `shouldOverrideUrlLoading()` to intercept navigation
- Expose minimum functionality via `addJavascriptInterface()` and validate all parameters
- Enable Safe Browsing API (`WebView.enableSafeBrowsing()`)
- Set `setAllowFileAccess(false)` and `setAllowContentAccess(false)` unless needed

#### Q10: How does the biometric authentication API work on Android?

BiometricPrompt API is the unified interface for biometric authentication — fingerprint, face recognition, iris scanning. Authentication classes determine security level: `Class 3` (strong — fingerprint, structured-light face recognition), `Class 2` (weak — camera-based face recognition), and `Class 1` (convenience). Only Class 3 biometrics can unlock cryptographic keys in the Keystore.

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

The `CryptoObject` binds the cryptographic operation to biometric authentication. By passing a `Cipher` initialized with a Keystore key that has `setUserAuthenticationRequired(true)`, the key can only be used after successful authentication. The actual encryption/decryption is gated by biometric verification at the hardware level, which is more secure than just checking a boolean flag.

#### Q11: What security considerations should you think about when storing and transmitting user data?

The principle is: minimize what you store, encrypt what you must store, and protect what you transmit.

**Storage:**

- Never store passwords in plain text — use a hash, or better yet, use short-lived tokens
- Use `EncryptedSharedPreferences` or encrypted Room databases for sensitive data
- Internal storage is safe from other apps (unless rooted), but external storage is readable by any app with storage permissions
- Avoid logging sensitive data — Logcat is readable in debug

**Transmission:**

- Always use HTTPS with `cleartextTrafficPermitted="false"` in network security config
- Use certificate pinning for sensitive endpoints
- Don't send sensitive data in URL query parameters — they end up in server logs
- Use HSTS headers to prevent protocol downgrade attacks

**Code:**

- Enable R8/ProGuard for code shrinking and obfuscation
- Use NDK for storing API keys if a server-side proxy isn't possible
- Set `android:exported="false"` on components that don't need external access
- Verify `android:debuggable="true"` is removed in release builds

#### Q12: How do notification actions, direct reply, and bundled notifications work?

Notification actions add buttons that trigger `PendingIntent`s. Direct reply lets users type a response from the notification shade using a `RemoteInput` added to the action. Bundled notifications group related notifications under a summary notification to prevent flooding the shade.

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

For direct reply, `PendingIntent` must use `FLAG_MUTABLE` because the system needs to write the user's reply text into the intent. Extract the reply in the `BroadcastReceiver` with `RemoteInput.getResultsFromIntent(intent)`. Always update the notification after processing the reply — otherwise it shows a spinner indefinitely.

#### Q13: What is the difference between data messages and notification messages in FCM, and why does it matter?

**Notification messages** have a `notification` payload that FCM handles automatically when the app is in the background. `onMessageReceived()` only gets called in the foreground. You have no control over notification appearance or behavior when the app is backgrounded.

**Data messages** have only a `data` payload and are always delivered to `onMessageReceived()` regardless of app state. You get full control to customize the notification, run business logic, or decide not to show a notification at all. On Android 13+, you need the `POST_NOTIFICATIONS` permission and must handle channel creation and notification styling yourself.

Most production apps use data messages exclusively. For messaging apps, data messages are mandatory since you need to decrypt content, look up sender names from the local database, and construct rich notifications with reply actions.

#### Q14: How would you implement a secure authentication flow in an Android app?

User enters credentials, sent over HTTPS to the auth server. The server returns a short-lived access token (15-60 minutes) and a longer-lived refresh token (days to weeks). Store the access token in `EncryptedSharedPreferences` and the refresh token with Keystore-backed encryption. Attach the access token to every API request via an OkHttp interceptor. On 401 responses, use the refresh token to get a new access token. When the refresh token expires, force re-authentication.

Security hardening:

- Never store the user's password
- Use PKCE if using OAuth
- Clear tokens on logout
- Implement token rotation — invalidate old refresh token when used, issue a new pair
- Use certificate pinning on auth endpoints
- Consider biometric authentication to unlock tokens for sensitive apps like banking or health

#### Q15: What is the difference between OAuth 2.0, JWT, and session-based authentication?

**Session-based authentication** — server creates a session after login and sends a session ID cookie. The client sends this cookie with every request, and the server looks up the session in its store. Cookies don't work as naturally on Android as in browsers, and server-side session storage doesn't scale well.

**OAuth 2.0** — an authorization framework that lets third-party apps access user resources without knowing their password. The user authenticates with an identity provider (Google, GitHub), and the app receives an access token with specific scopes. On Android, use AppAuth library for the OAuth flow. PKCE extension is required for mobile apps since they can't securely store a client secret.

**JWT (JSON Web Token)** — a token format, not a protocol. It's a signed, base64-encoded JSON object with header, payload, and signature. The server issues a JWT after authentication, and the client includes it in the `Authorization: Bearer <token>` header. The server verifies the signature without a database lookup — it's stateless.

In practice, most mobile apps use OAuth 2.0 for third-party login and JWT tokens for their own API authentication. The access token is a short-lived JWT, and the refresh token is an opaque token stored securely on the device.

#### Q16: What are the differences between AES, RSA, and SHA? When do you use each?

These are different cryptographic tools for different purposes.

**AES (Advanced Encryption Standard)** — symmetric encryption where the same key encrypts and decrypts. Fast and efficient for encrypting data at rest. Supports key lengths of 128, 192, and 256 bits. AES-256 with GCM mode is the standard choice on Android. The Keystore generates AES keys natively.

**RSA** — asymmetric encryption with a public key for encryption and private key for decryption. Slower than AES but solves key distribution since you can share the public key openly. Used for digital signatures, key exchange, and encrypting small amounts of data. Key lengths are typically 2048 or 4096 bits.

**SHA (Secure Hash Algorithm)** — not encryption, but a one-way hash function. Produces a fixed-size hash from input data (256 bits for SHA-256). Can't be reversed. Used for data integrity checks, password hashing (with salt), and digital signature verification.

Practical usage: AES for encrypting local data (`EncryptedSharedPreferences` uses AES-256). RSA for digital signatures and key exchange in TLS. SHA-256 for hashing passwords, verifying file integrity, and certificate pinning.

#### Q17: What is SafetyNet / Play Integrity API and when would you use it?

SafetyNet Attestation is now deprecated in favor of Play Integrity API. Play Integrity lets your server verify that requests come from a genuine Android device running your legitimate app. It provides three signals:

- **Device integrity** — genuine, unrooted Android device
- **App integrity** — real, unmodified app from Play Store
- **Account integrity** — user signed in with a licensed Google account

The app requests an integrity token from Google Play Services, sends it to the backend, and the backend verifies it with Google's servers. If any check fails, the server rejects the request.

Use it for banking apps, in-app purchase verification, anti-cheat in games, and apps handling sensitive health or government data. It requires Google Play Services and adds latency, so only use it for sensitive operations like login, payment, or accessing restricted data.

#### Q18: What is the difference between Keychain and Keystore?

**Keychain** (`android.security.KeyChain`) is for system-wide credentials — certificates and private keys that multiple apps might need. Used for VPN certificates, Wi-Fi enterprise authentication, or corporate email credentials. When an app requests a credential via Keychain, the user sees a system dialog to select and approve which certificate to share.

**Keystore** (`java.security.KeyStore` with `"AndroidKeyStore"` provider) is for app-specific cryptographic keys. Keys are only accessible to your app and never leave the secure hardware (TEE or StrongBox). Use it for encrypting auth tokens, local database encryption keys, and user PII.

Keystore is private to your app. Keychain is shared across apps with user consent.

#### Q19: How does FCM topic messaging work, and how do you target specific users or groups?

FCM supports three targeting approaches:

- **Token-based targeting** — sends to a specific device using its registration token (one-to-one)
- **Topic messaging** — devices subscribe to named topics, and FCM fans out messages to all subscribers
- **Device group messaging** — targets multiple devices belonging to a single user

```kotlin
// Client subscribes to a topic
FirebaseMessaging.getInstance()
    .subscribeToTopic("android_weekly")
    .addOnSuccessListener { /* subscribed */ }

// Client unsubscribes
FirebaseMessaging.getInstance()
    .unsubscribeFromTopic("android_weekly")
```

Topics work well for broadcast-style notifications like breaking news, feature announcements, or promotional campaigns. The server sends a single message to the topic and FCM handles distribution. You can combine topics with conditions like `"android_weekly" in topics && "premium" in topics` for audience targeting. Limitations: you can't get a list of subscribers for a topic, and delivery to large topics can have slight delays.

### Common Follow-ups

- What happens when a user revokes a permission that your app previously had?
- How do you handle the case where a user denies a permission with "Don't ask again"?
- What is the difference between `Keychain` and `Keystore`?
- How does scoped storage affect your app's file access?
- What are the differences between AES, RSA, and SHA algorithms?
- How would you implement notification grouping for a messaging app?
- What is `StrongBox` and when is it available?
- How do you test push notifications in development?
