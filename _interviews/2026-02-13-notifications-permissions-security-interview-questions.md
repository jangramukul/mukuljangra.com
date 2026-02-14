---
title: "Notifications, Permissions & Security"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 25
sequence: 25
description: "Covers the Android permission model, push notification system, and security fundamentals for protecting user data."
---

## Notifications, Permissions & Security

This is where we get into the stuff that protects your users and keeps your app from being the next security horror story on Hacker News. Permissions, notifications, and security touch every production app, and getting them wrong ranges from "annoying UX" to "lawsuit-level data breach."

#### What are the different types of permissions in Android?

Think of permissions like access badges at a building. Some get you through the front door automatically, some need a security guard's approval, and some require you to visit the main office in person.

- **Install-time permissions** (normal) — your automatic front-door badge. Granted at install with no user prompt. Examples: `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`, `WAKE_LOCK`. Low-risk stuff the user doesn't need to worry about.
- **Runtime permissions** (dangerous) — you need the security guard to buzz you in. The system shows a dialog and the user has to explicitly say yes. Examples: `CAMERA`, `READ_CONTACTS`, `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`. These touch sensitive data or hardware.
- **Special permissions** — you have to physically walk to the office. The user navigates to a Settings screen to grant these. Examples: `SYSTEM_ALERT_WINDOW`, `WRITE_SETTINGS`, `REQUEST_INSTALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`.

Runtime permissions are grouped. `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` are both in the Location group. If one is already granted, the system may auto-grant others without a dialog. But don't rely on this — Google has changed how grouping works across versions.

#### Walk through the runtime permission request flow. What are the edge cases?

The flow is like a conversation with a bouncer. First, check if you already have the badge — `ContextCompat.checkSelfPermission()`. If not, ask `shouldShowRequestPermissionRationale()` — this returns `true` if the user denied you before but hasn't said "never ask me again." If `true`, explain yourself before asking again. Then launch the actual request with `ActivityResultContracts.RequestPermission()`.

```kotlin
class CameraActivity : AppCompatActivity() {
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            openCamera()
        } else {
            if (!shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
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

Here's the tricky part. `shouldShowRequestPermissionRationale()` returns `false` in two completely different situations — the user has never been asked (first time), or the user permanently denied with "Don't ask again." Same return value, opposite meanings. You can't distinguish them without tracking state yourself. Save a flag in SharedPreferences after the first request so you know which case you're dealing with.

> **🧠 Think about it:** If `shouldShowRequestPermissionRationale()` returns `false` and you've never asked before, what happens if you show a rationale dialog anyway? Would that be a better or worse user experience than just asking directly?

#### What are notification channels and why do they matter?

Think of notification channels like TV channels. Your app is a broadcaster, and each channel carries a different type of content. The user gets to pick which channels they subscribe to — they might want your message notifications but couldn't care less about your sync updates.

Introduced in Android 8.0 (API 26), each channel gets its own importance level, sound, vibration pattern, and lock screen visibility. Users can disable individual channels without nuking all your notifications. Here's the critical part — you must create at least one channel before posting a notification on API 26+, or it gets silently dropped. No crash, no error, just... nothing.

```kotlin
fun createNotificationChannels(context: Context) {
    val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    val messagesChannel = NotificationChannel(
        "messages",
        "Messages",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "New message notifications"
        enableVibration(true)
    }

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

Importance levels control how aggressively the notification grabs attention:

- `IMPORTANCE_HIGH` — heads-up notification, right in the user's face
- `IMPORTANCE_DEFAULT` — status bar icon and notification shade
- `IMPORTANCE_LOW` — shade with no sound, a polite tap on the shoulder
- `IMPORTANCE_MIN` — shade only, no sound, no visual interruption, practically invisible

And here's the kicker — once a channel is created, only the user can change its importance level. Your app cannot modify it programmatically. So choose your defaults wisely because you're stuck with whatever the user decides after that.

#### How does Firebase Cloud Messaging (FCM) work?

FCM is like a postal service for push notifications. Your app registers a "mailing address" (registration token) with FCM at first launch, then sends that address to your backend. When the server wants to deliver a message, it hands it to FCM with the address, and FCM routes it to the right device over a persistent connection maintained by Google Play Services.

Two message types:

- **Notification messages** — FCM plays postman and delivers these automatically when the app is in the background. In the foreground, they arrive at `onMessageReceived()` and you handle them yourself.
- **Data messages** — always delivered to `onMessageReceived()` regardless of app state. You're the postman now.

```kotlin
class AppMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        sendTokenToServer(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: return
        val body = data["body"] ?: return
        showNotification(title, body, data)
    }
}
```

High-priority FCM messages can wake a device from Doze mode — that's why messaging apps get notifications through even when the phone has been sitting idle for hours. But Google watches this closely. Abuse high-priority for non-user-facing work and they'll downgrade your messages to normal priority. Fair enough.

#### What is the difference between data messages and notification messages in FCM?

Notification messages have a `notification` payload and FCM handles display automatically when the app is backgrounded. `onMessageReceived()` only fires in the foreground. You have zero control over how the notification looks or behaves when the app isn't active.

Data messages carry only a `data` payload and always land in `onMessageReceived()` no matter what state the app is in. Full control — customize appearance, run business logic, or decide not to show anything at all.

Most production apps use data messages exclusively. For a messaging app, data messages are mandatory — you need to decrypt content, look up sender names from the local database, and construct rich notifications with reply actions. None of that works if FCM is auto-displaying a generic notification for you.

#### What is the POST_NOTIFICATIONS permission introduced in Android 13?

Before Android 13 (API 33), apps could fire notifications freely once they had a notification channel. Then Android 13 said "hold on" and made `POST_NOTIFICATIONS` a runtime permission. New installs on Android 13+ default to notifications denied. If the user says no, your notifications are silently dropped.

For apps targeting Android 12 or lower running on an Android 13 device, the system auto-grants the permission if a notification channel already exists. But once the user upgrades to the Android 13-targeting version, that permission can be revoked. If your app lives and dies by notifications — messaging, delivery tracking, real-time alerts — request this permission early during onboarding, before the user gets annoyed.

#### What is the Android Keystore and why should you use it?

This is where security gets real. Think of the Keystore like a bank vault. You deposit your cryptographic keys into hardware-backed storage (TEE or StrongBox), and the vault does all the work — encrypting, decrypting, signing — without ever handing the keys back to you. Plaintext goes in, ciphertext comes out, but the actual key bytes never enter your app's process. Even if someone roots the device, they can't extract the key.

```kotlin
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

val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
val key = keyStore.getKey("user_data_key", null)
val cipher = Cipher.getInstance("AES/GCM/NoPadding")
cipher.init(Cipher.ENCRYPT_MODE, key)
val encryptedData = cipher.doFinal(plaintext)
val iv = cipher.iv
```

Setting `setUserAuthenticationRequired(true)` means the key is locked until the user proves who they are via biometrics or device credentials. This isn't a software check you can bypass — the hardware itself refuses to use the key without authentication.

#### What is EncryptedSharedPreferences and when would you use it?

`EncryptedSharedPreferences` is like a lockbox for your SharedPreferences. It's part of the Jetpack Security library, wraps regular `SharedPreferences`, and encrypts both keys and values. Under the hood, it uses AES256-SIV for key encryption (deterministic, so lookups still work) and AES256-GCM for value encryption. The master key lives in Android Keystore.

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

encryptedPrefs.edit()
    .putString("auth_token", token)
    .apply()
```

Use it for small amounts of sensitive data — auth tokens, API keys, user preferences containing PII. For larger datasets, reach for Room with SQLCipher instead. Fair warning: it's noticeably slower than regular `SharedPreferences` because every read and write involves encryption/decryption. Don't use it for high-frequency reads or you'll feel the performance hit.

#### How would you implement a secure authentication flow in an Android app?

Think of this like a hotel key system. The user checks in with credentials (sent over HTTPS), and the server hands back two keys — a short-lived room key (access token, 15-60 minutes) and a longer-lived card that lets them get a new room key from the front desk (refresh token, days to weeks). I store the access token in `EncryptedSharedPreferences` and the refresh token with Keystore-backed encryption. An OkHttp interceptor attaches the access token to every API request. On a 401, it uses the refresh token to get a fresh access token. When the refresh token itself expires, the user has to check in again.

Security hardening:

- Never store the user's password
- Use PKCE if using OAuth
- Clear tokens on logout
- Implement token rotation — invalidate the old refresh token when used, issue a new pair
- Use certificate pinning on auth endpoints
- Consider biometric authentication to unlock tokens for sensitive apps like banking

> **🧠 Think about it:** Why is it important to invalidate the old refresh token when issuing a new one? What kind of attack does token rotation prevent?

#### What security considerations apply when storing and transmitting user data?

The golden rule: minimize what you store, encrypt what you must store, and protect what you transmit. It's like packing for a trip — only bring what you need, lock your suitcase, and don't wave your passport around in public.

**Storage:**

- Never store passwords in plain text — use short-lived tokens instead
- Use `EncryptedSharedPreferences` or encrypted Room databases for sensitive data
- Internal storage is safe from other apps (unless rooted), but external storage is readable by any app with storage permissions
- Avoid logging sensitive data — Logcat is readable in debug builds

**Transmission:**

- Always use HTTPS with `cleartextTrafficPermitted="false"` in network security config
- Use certificate pinning for sensitive endpoints
- Don't send sensitive data in URL query parameters — they end up in server logs

**Code:**

- Enable R8/ProGuard for code shrinking and obfuscation
- Use NDK for storing API keys if a server-side proxy isn't possible
- Set `android:exported="false"` on components that don't need external access
- Make sure `android:debuggable="true"` is removed in release builds

#### How does certificate pinning protect against man-in-the-middle attacks?

Here's an analogy. In a normal HTTPS connection, your app trusts anyone with a government-issued ID — that's any certificate signed by a CA in the device's trust store. There are hundreds of CAs. If any single one is compromised or coerced, an attacker can forge a perfectly "valid" ID, sit between your app and server, and read everything.

Certificate pinning is like saying "I don't care about your government ID — I only trust people whose face I personally recognize." The app only accepts certificates or public keys that you explicitly specify for your domain. A rogue CA can issue a valid cert all day long, but the app rejects it because the pin doesn't match.

The tradeoff is real though. If you pin to a leaf certificate and it expires or rotates, your app breaks hard — no network at all. Best practice is to pin to the public key (which survives certificate renewal if the same key pair is used) and always include a backup pin. Android's `network_security_config.xml` supports pin expiration dates. Once expired, the app falls back to normal CA validation instead of bricking itself.

#### How does the BiometricPrompt API work on Android?

BiometricPrompt is the single front door for all biometric authentication — fingerprint, face, iris. But not all biometrics are created equal. Authentication classes determine security level: Class 3 (strong — fingerprint, structured-light face), Class 2 (weak — camera-based face), and Class 1 (convenience). Only Class 3 biometrics can unlock cryptographic keys in the Keystore. This matters a lot.

```kotlin
private val biometricPrompt = BiometricPrompt(
    this,
    ContextCompat.getMainExecutor(this),
    object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(
            result: BiometricPrompt.AuthenticationResult
        ) {
            val cipher = result.cryptoObject?.cipher
            val decryptedData = cipher?.doFinal(encryptedData)
        }

        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            // Handle: user cancelled, lockout, no biometrics enrolled
        }
    }
)

val cipher = getCipherForDecryption()
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

The `CryptoObject` is what makes this actually secure instead of just a fancy boolean check. By passing a `Cipher` initialized with a Keystore key that has `setUserAuthenticationRequired(true)`, the key literally cannot be used until the user's fingerprint (or face) is verified. The encryption is gated at the hardware level — no software hack can skip the biometric step.

#### What is the difference between OAuth 2.0, JWT, and session-based authentication?

These three get confused constantly because they operate at different levels. It's like confusing a highway system (OAuth), a shipping container format (JWT), and a toll booth (sessions).

**Session-based** — the server creates a session after login and sends a session ID cookie. The client sends this cookie with every request. Works great in browsers, but cookies don't work as naturally on Android, and server-side session storage doesn't scale well for mobile backends.

**OAuth 2.0** — an authorization framework, not an authentication protocol. It lets third-party apps access user resources without knowing their password. The user authenticates with an identity provider (Google, GitHub), and the app receives an access token with specific scopes. The PKCE extension is required for mobile apps since they can't securely store a client secret.

**JWT (JSON Web Token)** — a token format, not a protocol. It's a signed, base64-encoded JSON object with header, payload, and signature. The server issues a JWT after authentication, and the client includes it in the `Authorization: Bearer <token>` header. The server verifies the signature without a database lookup — stateless.

In practice, most mobile apps use OAuth 2.0 for third-party login and JWT tokens for their own API authentication. The access token is a short-lived JWT, and the refresh token is an opaque token stored securely on the device.

#### What are the common WebView security vulnerabilities?

WebView is like inviting the entire internet into your app's living room. It's a high-risk component, and the vulnerability list is real:

- **JavaScript Interface exploitation** — on API < 17, all public methods of the injected object are exposed to JavaScript. Any webpage your WebView loads could call them. On API 17+, only `@JavascriptInterface` annotated methods are exposed, which is better but still risky.
- **Cross-site scripting (XSS)** — if WebView loads untrusted content with JavaScript enabled, malicious scripts can steal data from the JavaScript interface or session cookies.
- **Intent scheme exploitation** — malicious pages can use `intent://` URLs to launch arbitrary activities in your app. That's basically remote code execution with extra steps.
- **Mixed content** — loading HTTP resources inside an HTTPS page exposes content to interception.

Mitigations: disable JavaScript unless necessary, validate all URLs before loading, override `shouldOverrideUrlLoading()` to intercept navigation, expose minimum functionality via `addJavascriptInterface()`, set `setAllowFileAccess(false)` and `setAllowContentAccess(false)` unless needed.

#### What is the difference between Keychain and Keystore?

These two sound similar but serve completely different purposes. It's like the difference between a shared office key cabinet and a personal safe.

**Keychain** (`android.security.KeyChain`) is the shared key cabinet — system-wide credentials like certificates and private keys that multiple apps might need. VPN certificates, Wi-Fi enterprise authentication, corporate email. When an app requests a credential via Keychain, the user sees a system dialog to approve which certificate to share.

**Keystore** (`java.security.KeyStore` with `"AndroidKeyStore"` provider) is your personal safe — app-specific cryptographic keys that only your app can access. Keys never leave the secure hardware (TEE or StrongBox).

Keystore is private to your app. Keychain is shared across apps with user consent. Simple as that.

#### What are the differences between AES, RSA, and SHA?

Different tools for different jobs. Think of it like a toolbox — you wouldn't use a hammer to measure something.

**AES** — symmetric encryption. Same key locks and unlocks the box. Fast, efficient, and the go-to for encrypting data at rest. Supports key lengths of 128, 192, and 256 bits. AES-256 with GCM mode is the standard choice on Android.

**RSA** — asymmetric encryption. Two keys — a public key for locking (anyone can lock) and a private key for unlocking (only you can open). Slower than AES but solves a real problem: how do you share a secret key safely? You don't have to — the public key can be shared openly. Used for digital signatures and key exchange. Key lengths are typically 2048 or 4096 bits.

**SHA** — not encryption at all. It's a one-way hash function, like a fingerprint for data. Produces a fixed-size hash (256 bits for SHA-256) from any input. Can't be reversed. Used for data integrity checks, password hashing (with salt), and certificate pinning.

Practical usage: AES for encrypting local data (`EncryptedSharedPreferences` uses AES-256). RSA for digital signatures and key exchange in TLS. SHA-256 for hashing passwords and verifying file integrity.

> **🧠 Think about it:** If SHA can't be reversed, how do password verification systems actually check if your password is correct? They're not decrypting anything...

#### How do notification actions, direct reply, and bundled notifications work?

Notification actions are like adding buttons to an email — "Reply," "Archive," "Mark as Read" — right there in the notification shade. Direct reply takes it further, letting users type a response without opening the app, using a `RemoteInput` attached to the action. Bundled notifications group related items under a summary so you don't flood the shade with 15 separate messages from the same chat.

```kotlin
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

val summaryNotification = NotificationCompat.Builder(context, "messages")
    .setContentTitle("3 new messages")
    .setSmallIcon(R.drawable.ic_notification)
    .setGroup("messages_group")
    .setGroupSummary(true)
    .build()
```

For direct reply, the `PendingIntent` must use `FLAG_MUTABLE` because the system needs to write the user's reply text into the intent — it can't do that with an immutable one. Extract the reply in the `BroadcastReceiver` with `RemoteInput.getResultsFromIntent(intent)`. And always update the notification after processing the reply. If you don't, it shows a spinner indefinitely. The user will think your app is frozen.

#### How does FCM topic messaging work?

FCM gives you three ways to target messages, like three different mailing strategies:

- **Token-based** — a letter to a specific address. Sends to a specific device using its registration token (one-to-one).
- **Topic messaging** — a newsletter subscription. Devices subscribe to named topics, and FCM fans out messages to all subscribers.
- **Device group messaging** — a family mailbox. Targets multiple devices belonging to a single user.

```kotlin
FirebaseMessaging.getInstance()
    .subscribeToTopic("android_weekly")
    .addOnSuccessListener { /* subscribed */ }

FirebaseMessaging.getInstance()
    .unsubscribeFromTopic("android_weekly")
```

Topics are great for broadcast-style notifications — breaking news, feature announcements, promotions. The server sends one message to the topic and FCM handles all the distribution. You can even combine topics with conditions like `"android_weekly" in topics && "premium" in topics` for audience targeting. One limitation worth knowing: you can't get a list of subscribers for a topic. FCM keeps that to itself.

#### What is Play Integrity API and when would you use it?

Play Integrity is like a bouncer who checks three things before letting a request into your backend. It replaced the deprecated SafetyNet Attestation and lets your server verify that a request comes from a genuine setup. Three signals:

- **Device integrity** — is this a genuine, unrooted Android device?
- **App integrity** — is this the real, unmodified app from the Play Store?
- **Account integrity** — is the user signed in with a licensed Google account?

The app requests an integrity token from Google Play Services, sends it to the backend, and the backend verifies it with Google's servers. If any check fails, the server rejects the request.

Use it for banking apps, in-app purchase verification, anti-cheat in games, and anything handling sensitive data. It requires Google Play Services and adds latency to the request, so only call it for sensitive operations — login, payment, or accessing restricted data. Don't slap it on every API call.

#### What is StrongBox and how does it relate to the Keystore?

If the regular Keystore's TEE is like a locked room inside your house, StrongBox is a separate safe bolted to the floor in a different building. It's a dedicated hardware security module available on Android 9+ devices with its own CPU, storage, and secure timer — completely separate from the main processor.

When you use the Keystore with `setIsStrongBoxBacked(true)`, keys are stored and all cryptographic operations happen inside this isolated chip. Regular Keystore uses the TEE (Trusted Execution Environment), which shares the main processor but runs in a secure mode. StrongBox is a separate chip entirely, making it harder to attack even with physical access to the device.

Not all devices have StrongBox, so check availability with `packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)` and fall back to TEE if it's not there. For banking and high-security apps, prefer StrongBox when available.

#### What happens when a user revokes a permission while the app is running?

Here's a fun surprise — the system kills your app process. No gentle callback, no "hey, the user just revoked your camera permission." Just dead. Next time the app launches, calling that API throws a `SecurityException` if you don't check the permission first. This is why you always check permissions before using protected APIs, every single time, not just on the initial request.

On Android 11+, it gets even more interesting. The system can auto-reset permissions for apps the user hasn't opened in a few months. Your app won't crash on the next launch, but the permission will be in a denied state and you'll need to request it again. Check `shouldShowRequestPermissionRationale()` to decide whether to show an explanation before re-requesting.

#### How does the network security config work in Android?

The `network_security_config.xml` file is like a security policy document for your app's entire network layer — declarative, no code changes needed. You define trusted CAs, certificate pins, and cleartext traffic rules per domain, all in one place.

```xml
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config>
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2025-01-01">
            <pin digest="SHA-256">base64EncodedPin==</pin>
            <pin digest="SHA-256">backupPin==</pin>
        </pin-set>
    </domain-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

The `debug-overrides` block is a lifesaver during development — it lets you trust user-installed certificates (like Charles Proxy) only in debug builds without touching production security. Setting `cleartextTrafficPermitted="false"` at the base level blocks all HTTP traffic globally, which is a solid default. No accidental plaintext requests sneaking through.

#### How do you securely store API keys in an Android app?

Honestly? There's no perfect solution. The APK can be decompiled, and anything inside it can eventually be extracted. The best approach is to not store secrets in the app at all — use a backend proxy that holds the key and forwards requests. Your server talks to the third-party API, your app talks to your server.

If a proxy isn't possible, there are levels of protection, each better than the last:

- **BuildConfig fields** — easy to extract by decompiling. Basically plaintext with extra steps. Avoid for anything sensitive.
- **NDK (C/C++)** — store keys in native code. Harder to reverse-engineer than Java/Kotlin bytecode, but still possible with binary analysis. Many security-focused apps like Proton VPN use this approach.
- **Server-side key storage** — store one encryption key on the server, use it to decrypt locally stored keys at runtime. This makes extraction significantly harder since the attacker needs both pieces.
- **Keystore** — good for keys that the app generates itself, but not for pre-shared API keys you need to bake into the app.

R8/ProGuard obfuscation helps but is not a substitute. For anything truly sensitive, the key should live on your server, not in the APK.

### Common Follow-ups

- How do you handle the case where a user denies a permission with "Don't ask again"?
- How does scoped storage affect your app's file access?
- How would you implement notification grouping for a messaging app?
- How do you test push notifications in development?
- What is the difference between internal and external storage from a security perspective?
- How do you detect rooted devices and why would you want to?
- What is the role of PendingIntent flags like FLAG_IMMUTABLE vs FLAG_MUTABLE?
