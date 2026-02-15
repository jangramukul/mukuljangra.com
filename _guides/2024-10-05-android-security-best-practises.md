---
title: Android Security Best Practises Guide
layout: post
sequence: 72
categories: post
tags:
  - Android
  - Security
  - Best Practices
---

Early in my career, I shipped an app that stored API keys in `BuildConfig` fields and user tokens in plain `SharedPreferences`. I thought `BuildConfig` was safe because it was "compiled" and `SharedPreferences` was fine because the files were in the app's private directory. Both assumptions were wrong. A motivated user with a rooted device could decompile the APK in under a minute and extract every `BuildConfig` constant. The SharedPreferences XML files sat on disk in plain text, readable by any process with root access. I learned the hard way that **Android's sandbox protects you from other apps, but it doesn't protect you from the device owner.**

That experience reframed how I think about mobile security. You're not building a fortress — you're building layers of defense that make attacks progressively harder. No single measure is bulletproof, but the combination of encrypted storage, certificate pinning, proper key management, biometric gates, and code obfuscation raises the cost of an attack high enough that most adversaries move on. Here's how I approach Android security now, from the most critical layer outward.

## The Android Keystore — Where Secrets Belong

The Android Keystore system is the foundation of on-device security. It stores cryptographic keys in a hardware-backed container (the StrongBox or TEE — Trusted Execution Environment) that prevents extraction even on rooted devices. Keys generated in the Keystore never leave the secure hardware — encryption and decryption operations happen inside the TEE, and only the results are returned to your app. This is fundamentally different from storing keys in your code or in a file. A key in the Keystore can't be extracted because the hardware won't export it — the attacker can use the key if they have your app's UID, but they can't copy it to another device or read the raw key material.

```kotlin
object KeyStoreManager {

    private const val KEY_ALIAS = "user_data_encryption_key"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"

    fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

        keyStore.getEntry(KEY_ALIAS, null)?.let { entry ->
            return (entry as KeyStore.SecretKeyEntry).secretKey
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return keyGenerator.generateKey()
    }
}
```

A few things to note here. `setUserAuthenticationRequired(true)` would require the user to authenticate (fingerprint, PIN) before each use of the key — great for high-sensitivity operations like payment authorization, but too aggressive for general data encryption. `BLOCK_MODE_GCM` with `ENCRYPTION_PADDING_NONE` is the recommended combination — GCM provides both confidentiality and integrity (it detects tampering), and it doesn't require separate padding.

The honest tradeoff: Keystore operations are slower than software-based encryption because they involve IPC to the secure hardware. For encrypting a single token, the overhead is negligible. For bulk operations, you might want to use the Keystore key to encrypt a "working key" in memory and use that for the heavy lifting. This is essentially what `EncryptedSharedPreferences` does internally.

## Data At Rest — Beyond SharedPreferences

Google's `EncryptedSharedPreferences` from the Security Crypto library wraps standard `SharedPreferences` with automatic encryption. Both keys and values are encrypted before being written to disk. Under the hood, `MasterKey` generates an AES-256 key in the Keystore, and `EncryptedSharedPreferences` derives separate encryption keys for preference keys (AES256-SIV for deterministic lookups) and values (AES256-GCM with random nonces).

```kotlin
class SecurePreferencesManager(private val context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            "secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveAuthToken(token: String) {
        securePrefs.edit { putString("auth_token", token) }
    }

    fun getAuthToken(): String? =
        securePrefs.getString("auth_token", null)

    fun clearSession() {
        securePrefs.edit { clear() }
    }
}
```

One gotcha I've hit in production: `EncryptedSharedPreferences.create()` is expensive on first call — initializing the Keystore, generating the master key, and setting up encryption schemes can take 200-500ms on low-end devices. Don't call it on the main thread during startup. I wrap it in a `lazy` delegate and access it from a background coroutine on first use.

But `EncryptedSharedPreferences` only covers key-value data. For structured data in **Room databases**, you need **SQLCipher**. SQLCipher encrypts the entire SQLite database file transparently. You swap `Room.databaseBuilder` for `SupportFactory` from the `net.qlite:android-database-sqlcipher` library and pass a passphrase — ideally one derived from a Keystore-backed key, not a hardcoded string. I use this in any app that caches user data locally: medical records, financial transactions, chat messages. The performance overhead is roughly 5-15% on queries depending on dataset size, which is acceptable for most apps.

For encrypting arbitrary files — PDFs, images, exported data — use Keystore-backed AES-GCM directly. Generate a key with `KeyStoreManager`, encrypt the file's bytes with `Cipher.getInstance("AES/GCM/NoPadding")`, and store the IV alongside the ciphertext.

## Certificate Pinning and Network Security

HTTPS encrypts traffic between your app and the server, but it trusts any certificate authority in the device's trust store. A compromised CA or an enterprise proxy injecting its own certificate can perform a man-in-the-middle attack. Certificate pinning restricts which certificates your app accepts, so even if the device trusts a rogue CA, your app won't.

I prefer the **network security config** approach over OkHttp's `CertificatePinner` because it's declarative and is the Android team's recommended mechanism. The `expiration` date on pin-sets is a safety valve — if your certificate rotates before you push an update, the expired pin-set falls back to standard validation instead of bricking your app's networking. **Always include a backup pin** — the hash of your CA's intermediate certificate or a future certificate you have ready.

The network security config does more than pinning. Setting `cleartextTrafficPermitted="false"` blocks all unencrypted HTTP traffic. Since Android 9, this is the default for apps targeting API 28+, but declaring it explicitly prevents accidental regressions. The `debug-overrides` section lets you trust user-installed certificates in debug builds, which is essential for proxy tools like Charles Proxy during development.

```kotlin
class SecureNetworkClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(AuthInterceptor())
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
                else HttpLoggingInterceptor.Level.NONE
        })
        .build()

    private class AuthInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val request = chain.request().newBuilder()
                .addHeader("Authorization", "Bearer ${TokenManager.getAccessToken()}")
                .addHeader("X-App-Version", BuildConfig.VERSION_NAME)
                .build()
            return chain.proceed(request)
        }
    }
}
```

Notice `HttpLoggingInterceptor` is set to `NONE` in release builds — logging request bodies in production can leak sensitive data to logcat. And the auth token comes from a `TokenManager` backed by `EncryptedSharedPreferences`, not from a hardcoded string.

## Biometric Authentication — Gating Sensitive Operations

The **BiometricPrompt** API (from `androidx.biometric`) is how you gate high-value operations behind fingerprint, face, or iris authentication. I use it for payment confirmations, viewing sensitive health data, and re-authenticating after the app has been backgrounded for too long. The key thing most tutorials skip: BiometricPrompt alone only confirms "a biometric matched." For real security, you need to pair it with a **CryptoObject**.

A `CryptoObject` wraps a `Cipher`, `Signature`, or `Mac` instance that's tied to a Keystore key with `setUserAuthenticationRequired(true)`. When the user authenticates, the TEE unlocks that specific key for one operation. This means even if an attacker somehow bypasses the biometric UI, they can't use the underlying cryptographic key without the actual biometric match in hardware.

```kotlin
class BiometricAuthManager(private val activity: FragmentActivity) {

    fun authenticateForPayment(onSuccess: (Cipher) -> Unit) {
        val keyGenSpec = KeyGenParameterSpec.Builder(
            "payment_key",
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .build()

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = KeyStoreManager.getOrCreateKey("payment_key", keyGenSpec)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey)

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Confirm Payment")
            .setSubtitle("Authenticate to authorize this transaction")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .build()

        val biometricPrompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: AuthenticationResult) {
                    result.cryptoObject?.cipher?.let(onSuccess)
                }
            }
        )
        biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
    }
}
```

There are three authenticator levels to be aware of: **BIOMETRIC_STRONG** (Class 3 — fingerprint, secure face unlock), **BIOMETRIC_WEAK** (Class 2 — less secure face unlock on some devices), and **DEVICE_CREDENTIAL** (PIN/pattern/password). For payment flows, I always require `BIOMETRIC_STRONG`. For less critical gates like "re-auth after 5 minutes idle," `BIOMETRIC_STRONG or DEVICE_CREDENTIAL` gives users a fallback. The `setInvalidatedByBiometricEnrollment(true)` flag is important — it invalidates the key if the user adds a new fingerprint, preventing a scenario where someone adds their fingerprint to a stolen unlocked device and then authenticates as the original user.

## WebView Security — The Biggest Attack Surface You're Ignoring

IMO, **WebView is the most dangerous component in Android** from a security perspective. It's essentially a browser running inside your app's process, and most developers configure it carelessly. The first thing everyone does is call `webView.settings.javaScriptEnabled = true` without thinking about what that means — you're now executing arbitrary JavaScript in your app's context.

The real danger comes from `addJavascriptInterface`. On API 16 and below, any JavaScript running in the WebView could use reflection to call arbitrary Java methods through the injected interface — a full remote code execution vulnerability. On API 17+, only methods annotated with `@JavascriptInterface` are exposed, but you still need to be careful about what those methods can do. Never expose methods that access the file system, shared preferences, or anything sensitive through a JavaScript interface.

```kotlin
class SecureWebViewClient(private val allowedHosts: Set<String>) : WebViewClient() {

    override fun shouldOverrideUrlLoading(
        view: WebView,
        request: WebResourceRequest
    ): Boolean {
        val host = request.url.host ?: return true
        if (host !in allowedHosts) {
            // Open external URLs in the system browser instead
            view.context.startActivity(Intent(Intent.ACTION_VIEW, request.url))
            return true
        }
        return false
    }

    override fun onReceivedSslError(
        view: WebView,
        handler: SslErrorHandler,
        error: SslError
    ) {
        // NEVER call handler.proceed() — that bypasses SSL validation
        handler.cancel()
    }
}
```

Always restrict URL loading to a whitelist of trusted domains with `shouldOverrideUrlLoading`. Never override `onReceivedSslError` with `handler.proceed()` — I've seen this in production apps and it completely disables SSL certificate validation for the WebView, making MITM attacks trivial. If you're loading local HTML content, use `loadDataWithBaseURL` with a null base URL so loaded content can't make requests to arbitrary origins.

## Play Integrity API — Verifying Device and App Trust

Google's **Play Integrity API** (the successor to SafetyNet Attestation, which was deprecated in 2024) lets your server verify three things: the app binary is the genuine one from Google Play, the device is a real device running a genuine Android build, and the user has a valid Play license. I use it before processing sensitive server-side operations — creating accounts, making purchases, redeeming promotions — to filter out tampered clients, emulators running bots, and sideloaded modified APKs.

The API returns a signed integrity verdict containing a **device integrity** field (MEETS_DEVICE_INTEGRITY, MEETS_BASIC_INTEGRITY, or empty for compromised devices), an **app integrity** field (confirming the APK hash matches Play), and an **account licensing** field. The key architectural point: never evaluate the verdict on-device. Always send the integrity token to your server, have the server call Google's API to decode it, and make the trust decision server-side. If you evaluate on-device, an attacker can just patch your verification code.

If you're migrating from SafetyNet, SafetyNet's `ctsProfileMatch` maps to `MEETS_DEVICE_INTEGRITY` and `basicIntegrity` maps to `MEETS_BASIC_INTEGRITY`. Play Integrity is more granular — it distinguishes between real devices, rooted devices, emulators, and fully compromised environments.

The tradeoff: Play Integrity has quota limits on the free tier. I batch integrity checks at session start rather than on every API call, caching the verdict server-side with a short TTL.

## Root Detection — An Arms Race You Should Understand

Here's the thing about root detection: **it's fundamentally an arms race you can't win, but it's still worth running.** Tools like RootBeer or custom checks (looking for `su` binary, checking system properties, detecting Magisk) will catch casual root users and automated scripts. But a sophisticated attacker using Magisk Hide or Zygisk can hide root from virtually any client-side detection.

I think of root detection as a speed bump, not a wall. In a banking app I worked on, we checked for root at startup and flagged the session server-side, applying stricter rate limits and transaction caps rather than blocking outright. The real enforcement happened server-side based on the Play Integrity verdict combined with root detection signals.

## R8 Obfuscation and Beyond — Making Reverse Engineering Expensive

Code obfuscation with **R8** (ProGuard's successor, now the default in Android builds) renames classes, methods, and fields to meaningless single-letter names, removes unused code, and optimizes bytecode. Without R8, decompiling your APK with jadx produces nearly readable source code. With R8, the decompilation produces a maze of `a.b.c.d()` calls that takes substantial effort to trace. The practical security benefit isn't making reverse engineering impossible — it's making it expensive enough that most attackers move on.

But R8's defaults need tuning for security. You need custom keep rules for libraries that use reflection — **Retrofit** interfaces, **Room** entities, classes used with Gson or Moshi. Without keep rules, R8 renames the fields that these libraries map to JSON keys or database columns, and things break silently at runtime. For security-sensitive code, I go further: **DexGuard** (the commercial successor to ProGuard) offers string encryption, class encryption, and anti-tamper checks that R8 doesn't provide. R8 won't encrypt your string constants — those API endpoint URLs and error messages are still readable in the decompiled output. DexGuard encrypts them and decrypts at runtime. If DexGuard isn't in the budget, you can use custom Gradle tasks to encrypt sensitive strings at build time and decrypt them in a `native` method via JNI, though that's more maintenance overhead.

The tradeoff with aggressive obfuscation is debugging difficulty. You need to keep and upload the R8 mapping file for every release to deobfuscate crash stack traces. Firebase Crashlytics handles this automatically if configured, but lose the mapping file for a specific release and those crashes become nearly impossible to diagnose.

## Secure IPC — Locking Down Your Components

Android's inter-process communication is powerful but easy to misconfigure. The biggest mistake I see: **leaving components exported unintentionally.** Before Android 12, any Activity, Service, or BroadcastReceiver with an `<intent-filter>` was implicitly exported. Android 12+ requires explicit `android:exported` declarations, but you still need to be deliberate about which components are accessible.

**Content Providers** are particularly risky. If your provider is exported without proper permissions, any app can query your user data. Always set `android:permission` on your provider with a custom signature-level permission so only apps signed with your key can access it. For more granular control, use `android:readPermission` and `android:writePermission` separately.

```kotlin
// PendingIntent security — always use FLAG_IMMUTABLE
val pendingIntent = PendingIntent.getActivity(
    context,
    REQUEST_CODE,
    Intent(context, PaymentConfirmationActivity::class.java).apply {
        putExtra("transaction_id", transactionId)
    },
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
)
```

**PendingIntent** security matters more than most developers realize. A mutable PendingIntent can be modified by the receiving app — they can change the target component, add extras, or redirect the intent entirely. Since Android 12, you must specify either `FLAG_IMMUTABLE` or `FLAG_MUTABLE`. Always use `FLAG_IMMUTABLE` unless you explicitly need the recipient to fill in extras (like in a reply action from a notification). In a payment flow, a mutable PendingIntent could let a malicious app redirect the confirmation to a different activity.

## OAuth Tokens and Session Management

API key management is deceptively tricky on mobile. Here's my approach: **never ship long-lived API keys in the APK at all.** Instead, authenticate the user and the device with the server, and have the server issue short-lived access tokens. Store the access token and refresh token in `EncryptedSharedPreferences`. When the access token expires, use the refresh token to get a new one. If the refresh token is compromised, the server can revoke it without requiring an app update.

For secure logout, clear more than just your own storage. Invalidate the tokens server-side first, then clear `EncryptedSharedPreferences`, clear any Room database caches, cancel all pending work with WorkManager, and clear the WebView cookie jar if you use one. I've seen apps that "log out" by just clearing the token locally — the old refresh token is still valid on the server, and if someone extracts it from a backup or compromised device, they can generate new access tokens indefinitely.

```kotlin
class SessionManager(
    private val securePrefs: SecurePreferencesManager,
    private val authApi: AuthApi,
    private val database: AppDatabase
) {
    suspend fun secureLogout() {
        try {
            // Invalidate server-side first
            val refreshToken = securePrefs.getRefreshToken()
            refreshToken?.let { authApi.revokeToken(it) }
        } finally {
            // Clear local state even if server call fails
            securePrefs.clearSession()
            database.clearAllTables()
            CookieManager.getInstance().removeAllCookies(null)
            WorkManager.getInstance(context).cancelAllWork()
        }
    }
}
```

For API keys that the app genuinely needs (third-party SDKs, maps, analytics), I store them in the `local.properties` file (git-ignored) and inject them via `BuildConfig` fields at build time. They're still extractable from the APK, but at least they're not in source control. For truly sensitive keys, proxy the requests through your own server so the third-party API key never reaches the client at all.

## The Reframe: Security Is a Spectrum, Not a Checkbox

Here's what I've learned about Android security: **there is no "secure" or "insecure" — there's a spectrum of how expensive you make it for an attacker.** A rooted device with a debugger attached can bypass almost anything your app does. The goal isn't to make attacks impossible — it's to make the cost of the attack exceed the value of the data.

For most apps, the layered approach I've described covers the practical threat model. Keystore for key management, encrypted storage for data at rest, certificate pinning for network integrity, biometric gates for sensitive operations, R8 for code obfuscation, secure IPC to lock down components, and Play Integrity to verify the client. Each layer addresses a different attack vector, and together they provide defense in depth.

Don't skip security because "nobody would target my app." The most common attacks aren't targeted — they're automated scripts scanning for low-hanging fruit. An API key in `BuildConfig`, unencrypted tokens on disk, or an exported content provider without permissions are all easy pickings. The security measures in this post aren't paranoia — they're the baseline that every production app should meet.

Thank You!
