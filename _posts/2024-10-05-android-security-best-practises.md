---
title: Android Security Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Security
  - Best Practices
---

Early in my career, I shipped an app that stored API keys in `BuildConfig` fields and user tokens in plain `SharedPreferences`. I thought `BuildConfig` was safe because it was "compiled" and `SharedPreferences` was fine because the files were in the app's private directory. Both assumptions were wrong. A motivated user with a rooted device could decompile the APK in under a minute and extract every `BuildConfig` constant. The SharedPreferences XML files sat on disk in plain text, readable by any process with root access. I learned the hard way that **Android's sandbox protects you from other apps, but it doesn't protect you from the device owner.**

That experience reframed how I think about mobile security. You're not building a fortress — you're building layers of defense that make attacks progressively harder. No single measure is bulletproof, but the combination of encrypted storage, certificate pinning, proper key management, and code obfuscation raises the cost of an attack high enough that most adversaries move on. Here's how I approach Android security now, from the most critical layer outward.

## The Android Keystore — Where Secrets Belong

The Android Keystore system is the foundation of on-device security. It stores cryptographic keys in a hardware-backed container (the StrongBox or TEE — Trusted Execution Environment) that prevents extraction even on rooted devices. Keys generated in the Keystore never leave the secure hardware — encryption and decryption operations happen inside the TEE, and only the results are returned to your app.

This is fundamentally different from storing keys in your code or in a file. A key stored in `BuildConfig`, a string resource, or even an encrypted file can be extracted if the attacker has enough access. A key in the Keystore can't be extracted because the hardware won't export it. The attacker can use the key (if they have your app's UID), but they can't copy it to another device or read the raw key material.

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

A few things to note here. `setUserAuthenticationRequired(true)` would require the user to authenticate (fingerprint, PIN) before each use of the key — great for high-sensitivity operations like payment authorization, but too aggressive for general data encryption. `BLOCK_MODE_GCM` with `ENCRYPTION_PADDING_NONE` is the recommended combination for AES encryption on Android — GCM provides both confidentiality and integrity (it detects tampering), and it doesn't require separate padding.

The honest tradeoff: Keystore operations are slower than software-based encryption because they involve IPC to the secure hardware. For encrypting a single token, the overhead is negligible. For encrypting large datasets or many small items in a loop, you might want to use the Keystore key to encrypt a "working key" that lives in memory, and use the working key for bulk operations. This is essentially what `EncryptedSharedPreferences` does internally.

## EncryptedSharedPreferences — Transparent At-Rest Encryption

Google's `EncryptedSharedPreferences` from the Security Crypto library wraps standard `SharedPreferences` with automatic encryption. Both keys and values are encrypted before being written to disk.

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

    fun getAuthToken(): String? {
        return securePrefs.getString("auth_token", null)
    }

    fun saveSessionData(userId: String, refreshToken: String) {
        securePrefs.edit {
            putString("user_id", userId)
            putString("refresh_token", refreshToken)
        }
    }

    fun clearSession() {
        securePrefs.edit { clear() }
    }
}
```

Under the hood, `MasterKey` generates an AES-256 key in the Android Keystore. `EncryptedSharedPreferences` uses this master key to derive separate encryption keys for the preference keys (using AES256-SIV, which is deterministic — same key name always encrypts to the same ciphertext, allowing lookups) and values (using AES256-GCM, which includes a random nonce for each value). The result on disk is an XML file where both the key names and values are unreadable ciphertext.

One gotcha I've hit in production: `EncryptedSharedPreferences.create()` is expensive on first call. It initializes the Keystore, generates or retrieves the master key, and sets up the encryption schemes. On some low-end devices, this can take 200-500ms. Don't call it on the main thread during app startup. I wrap it in a `lazy` delegate and access it from a background coroutine on first use.

## Certificate Pinning — Don't Trust the Network

HTTPS encrypts traffic between your app and the server, but it trusts any certificate authority (CA) in the device's trust store. A compromised or rogue CA — or an enterprise proxy that injects its own CA certificate — can perform a man-in-the-middle attack, decrypting and reading all your traffic. Certificate pinning restricts which certificates your app accepts, so even if the device trusts a rogue CA, your app won't.

```kotlin
// network_security_config.xml (shown as comment)
// <network-security-config>
//     <domain-config cleartextTrafficPermitted="false">
//         <domain includeSubdomains="true">api.myshop.com</domain>
//         <pin-set expiration="2025-06-01">
//             <pin digest="SHA-256">
//                 AABBCCDD1122334455667788...=
//             </pin>
//             <!-- Backup pin — CRITICAL: always include a backup -->
//             <pin digest="SHA-256">
//                 EEFF0011AABBCCDD55667788...=
//             </pin>
//         </pin-set>
//     </domain-config>
//
//     <!-- Debug overrides for proxy tools like Charles -->
//     <debug-overrides>
//         <trust-anchors>
//             <certificates src="user" />
//         </trust-anchors>
//     </debug-overrides>
// </network-security-config>

// Reference in AndroidManifest.xml:
// <application android:networkSecurityConfig="@xml/network_security_config" />
```

The `expiration` date is a safety valve. If your certificate rotates and you haven't pushed an app update with the new pin, the expired pin-set is ignored and the app falls back to standard certificate validation. Without an expiration, a pinning misconfiguration can brick your app's networking permanently until users update. I set expiration dates 6-12 months out and treat pin rotation as a scheduled maintenance task.

**Always include a backup pin.** If you only pin one certificate and it gets compromised, revoked, or rotated, every deployed version of your app loses network access. The backup pin should be the hash of your CA's intermediate certificate or a future certificate you have ready to deploy. Two pins means you can rotate one while the other keeps traffic flowing.

The `debug-overrides` section lets you trust user-installed certificates in debug builds. This is essential for using proxy tools like Charles Proxy during development. Without it, pinning blocks your own debugging tools.

If you're using OkHttp, you can also pin programmatically with `CertificatePinner`, but I prefer the network security config approach because it's declarative, doesn't require code changes, and is the Android team's recommended mechanism.

## Network Security Config — Broader Network Policy

The network security config does more than just pinning. It's your app's network security policy, covering cleartext traffic, custom trust anchors, and domain-specific rules.

The most important setting: `cleartextTrafficPermitted="false"`. This blocks all unencrypted HTTP traffic from your app. Since Android 9, this is the default for apps targeting API 28+, but explicitly declaring it in your config makes the intent clear and prevents accidental regression if someone adds an HTTP URL to a configuration file.

```kotlin
// OkHttp client with security configuration
class SecureNetworkClient(context: Context) {

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

A couple of security details here: the `HttpLoggingInterceptor` level is set to `NONE` in release builds. Logging request/response bodies in production can leak sensitive data to logcat, which is readable by any app with `READ_LOGS` permission on older Android versions. And notice the auth token comes from a `TokenManager`, not from `BuildConfig` or a hardcoded string — the token should be stored in `EncryptedSharedPreferences` and loaded at runtime.

## ProGuard and R8 — Obfuscation as a Security Layer

Code obfuscation with R8 (ProGuard's successor, now the default in Android builds) renames classes, methods, and fields to meaningless single-letter names, removes unused code, and optimizes bytecode. It's not encryption — a determined reverse engineer can still decompile and understand your code — but it significantly raises the effort required.

Without R8, decompiling your APK with jadx or apktool produces nearly readable Java source code with original class names, method names, and string constants. With R8, the same decompilation produces a maze of `a.b.c.d()` calls that requires substantial effort to trace. Combined with string encryption (which R8 doesn't do by default — you need DexGuard or a custom transformer for that), obfuscation makes automated analysis much harder.

The practical security benefit isn't making reverse engineering impossible — it's making it expensive. If an attacker has to spend days understanding your obfuscated code to extract an API key, they'll often find an easier target. It's the same principle as a bike lock: it doesn't make theft impossible, it makes your bike a less attractive target than the unlocked one next to it.

The tradeoff with aggressive obfuscation is debugging difficulty. Crash stack traces from obfuscated builds use the renamed identifiers, so you need to keep and upload the R8 mapping file for every release to deobfuscate crash reports. Firebase Crashlytics and other crash reporters handle this automatically if configured, but if you lose the mapping file for a specific release, those crashes become nearly impossible to diagnose.

## The Reframe: Security Is a Spectrum, Not a Checkbox

Here's what I've learned about Android security: **there is no "secure" or "insecure" — there's a spectrum of how expensive you make it for an attacker.** A rooted device with a debugger attached can bypass almost anything your app does. The goal isn't to make attacks impossible; it's to make the cost of the attack exceed the value of the data.

For most apps, the layered approach I've described covers the practical threat model. Keystore for key management, EncryptedSharedPreferences for sensitive data, certificate pinning for network integrity, network security config for cleartext prevention, and R8 for code obfuscation. Each layer addresses a different attack vector, and together they provide defense in depth.

The exception is apps handling truly high-value data — banking, healthcare, payment processing. Those apps need additional layers: root detection (though it's an arms race), runtime integrity checks, secure element integration, and potentially server-side security tokens that expire quickly. But even for those apps, the fundamentals don't change — you're still building layers that make attacks progressively harder. The layers just go deeper.

Don't skip security because "nobody would target my app." The most common attacks aren't targeted — they're automated scripts scanning for low-hanging fruit. An API key in `BuildConfig`, unencrypted tokens on disk, or HTTP traffic are all easy pickings for automated tools. The security measures in this post aren't paranoia; they're the baseline that every production app should meet.

Thank You!
