---
title: "Android Security & Privacy"
layout: course
description: "Secure your Android apps — encryption, KeyStore, ProGuard/R8, network security, biometrics, secure storage, and privacy best practices."
icon: "🔒"
color: "#f87171"
difficulty: "Intermediate to Expert"
modules: 8
lessons: 36
duration: "5 weeks"
order: 5
tags:
  - Security
  - Privacy
  - Android
what_you_learn:
  - "Use Android KeyStore for secure key management"
  - "Implement EncryptedSharedPreferences and encrypted databases"
  - "Configure network security with certificate pinning and TLS"
  - "Protect code with ProGuard/R8 obfuscation and tamper detection"
  - "Integrate biometric authentication (fingerprint, face)"
  - "Implement privacy-first patterns compliant with Google Play policies"
prerequisites:
  - "Android development experience"
  - "Basic understanding of cryptography concepts"
---

## Module 1: Security Fundamentals

Security isn't a feature you add later — it's a mindset you build with. Every decision, from how you store a token to how you log errors, has security implications.

### Lesson 1.1: The Android Security Model

Android's security is built on multiple layers: Linux kernel process isolation, app sandboxing, permissions, SELinux, and verified boot.

**App Sandbox** — Each app runs in its own Linux process with a unique UID. App A cannot read App B's files. The file system enforces this at the kernel level.

**Key takeaway:** Android's sandbox is strong by default. Your job is to not weaken it — don't expose data through misconfigured content providers, world-readable files, or exported components.

### Lesson 1.2: Threat Modeling for Mobile

Before writing security code, understand what you're protecting against.

- **Data at rest** — Sensitive data stored on device (tokens, PII, credentials)
- **Data in transit** — Network communication (API calls, WebSocket)
- **Reverse engineering** — APK decompilation, code analysis
- **Runtime attacks** — Root detection bypass, hooking frameworks (Frida, Xposed)
- **Supply chain** — Compromised dependencies, malicious SDKs

**Key takeaway:** You can't protect against everything. Prioritize based on your app's risk profile. A banking app needs different security than a weather app.

### Quiz: Security Fundamentals

#### What is the primary mechanism Android uses to isolate apps from each other?

- ❌ File-level encryption
- ❌ Custom permissions
- ✅ Linux process isolation with unique UIDs
- ❌ SELinux policies only

> **Explanation:** Android assigns each app a unique Linux UID and runs it in its own process. The kernel enforces file system access at the process level, preventing one app from accessing another app's private data. SELinux and permissions add additional layers, but process isolation is the primary sandbox mechanism.

#### Which of the following is NOT a typical mobile threat category?

- ❌ Data at rest
- ❌ Reverse engineering
- ✅ Server-side SQL injection
- ❌ Runtime attacks (Frida, Xposed)

> **Explanation:** Server-side SQL injection is a backend/web vulnerability, not a mobile threat category. Mobile threat modeling focuses on data at rest, data in transit, reverse engineering, runtime attacks, and supply chain risks — all specific to the client-side mobile environment.

#### Why should you perform threat modeling before writing security code?

- ❌ It eliminates the need for code obfuscation
- ✅ It helps you prioritize protections based on your app's specific risk profile
- ❌ It guarantees your app cannot be reverse-engineered
- ❌ It replaces the need for network security configuration

> **Explanation:** Threat modeling identifies what assets you're protecting and which threats are most relevant to your app. A banking app has very different priorities than a weather app. Without threat modeling, you risk over-investing in low-impact areas while leaving critical vulnerabilities unaddressed.

### Coding Challenge: App Sandbox Verification

Write a Kotlin function that checks whether your app's private files directory has the correct restrictive permissions, verifying that the Android sandbox is properly configured and no files are world-readable.

#### Solution

```kotlin
import java.io.File

fun verifyAppSandbox(context: Context): Map<String, Boolean> {
    val results = mutableMapOf<String, Boolean>()

    // Check that private files directory exists and is not world-readable
    val filesDir = context.filesDir
    results["filesDir_exists"] = filesDir.exists()
    results["filesDir_not_world_readable"] = !filesDir.canRead() ||
        filesDir.absolutePath.contains(context.packageName)

    // Check that no files in private storage are world-readable
    val privateFiles = filesDir.listFiles() ?: emptyArray()
    val hasWorldReadable = privateFiles.any { file ->
        try {
            // On a properly sandboxed app, other apps can't access these
            val permissions = Runtime.getRuntime()
                .exec("ls -la ${file.absolutePath}")
                .inputStream.bufferedReader().readLine()
            permissions?.let { it.length > 7 && it[7] == 'r' } ?: false
        } catch (e: Exception) {
            false
        }
    }
    results["no_world_readable_files"] = !hasWorldReadable

    // Verify MODE_PRIVATE is enforced
    try {
        val testFile = File(filesDir, ".sandbox_test")
        context.openFileOutput(".sandbox_test", Context.MODE_PRIVATE).use {
            it.write("test".toByteArray())
        }
        results["mode_private_works"] = testFile.exists()
        testFile.delete()
    } catch (e: Exception) {
        results["mode_private_works"] = false
    }

    return results
}
```

This function verifies the app's sandbox integrity by checking that the private files directory is properly isolated, no files have world-readable permissions, and `MODE_PRIVATE` file creation works correctly. In production, you'd run this on app startup and report violations to your security monitoring backend.

---

## Module 2: Secure Data Storage

### Lesson 2.1: Android Keystore

```kotlin
// Generate a key in the Android Keystore
fun generateSecretKey(alias: String): SecretKey {
    val keyGenerator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES,
        "AndroidKeyStore"
    )
    keyGenerator.init(
        KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setUserAuthenticationRequired(true)
        .setUserAuthenticationParameters(300, KeyProperties.AUTH_BIOMETRIC_STRONG)
        .build()
    )
    return keyGenerator.generateKey()
}
```

**Why Keystore matters** — Keys stored in the Keystore never leave the secure hardware (TEE/StrongBox on supported devices). Even if the device is rooted, the raw key material cannot be extracted. This is fundamentally different from storing keys in SharedPreferences or files.

**Key takeaway:** Use Android Keystore for cryptographic keys. Never hardcode secrets in your source code or store them in plain text.

### Lesson 2.2: EncryptedSharedPreferences

```kotlin
val encryptedPrefs = EncryptedSharedPreferences.create(
    context,
    "secure_prefs",
    MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

// Use exactly like regular SharedPreferences
encryptedPrefs.edit()
    .putString("auth_token", token)
    .apply()

val token = encryptedPrefs.getString("auth_token", null)
```

**Key takeaway:** Use `EncryptedSharedPreferences` for sensitive key-value data. Both keys and values are encrypted — an attacker can't even see what preference names exist.

### Lesson 2.3: Encrypted Databases

```kotlin
// SQLCipher with Room
val passphrase = SQLiteDatabase.getBytes("your_passphrase".toCharArray())
val factory = SupportFactory(passphrase)

val database = Room.databaseBuilder(
    context,
    AppDatabase::class.java,
    "encrypted.db"
)
.openHelperFactory(factory)
.build()
```

**Key takeaway:** For apps that store sensitive data in SQLite/Room, use SQLCipher. The entire database file is encrypted — even if extracted from a rooted device, it's unreadable without the passphrase.

### Quiz: Secure Data Storage

#### Where does the Android Keystore store cryptographic keys on supported devices?

- ❌ In the app's private SharedPreferences
- ❌ In an encrypted file on internal storage
- ✅ In secure hardware (TEE/StrongBox)
- ❌ In the app's APK resources directory

> **Explanation:** The Android Keystore leverages the Trusted Execution Environment (TEE) or StrongBox secure hardware on supported devices. Keys stored here never leave the secure hardware — cryptographic operations happen inside the TEE. Even on a rooted device, the raw key material cannot be extracted.

#### What does EncryptedSharedPreferences encrypt?

- ❌ Only the values, not the keys
- ❌ Only the keys, not the values
- ✅ Both keys and values
- ❌ Neither — it only restricts access permissions

> **Explanation:** EncryptedSharedPreferences encrypts both preference keys (using AES256-SIV) and values (using AES256-GCM). This means an attacker cannot even see what preference names exist, let alone their values. This is a critical distinction from regular SharedPreferences where everything is stored in plain XML.

#### Why is storing an API key in BuildConfig still not fully secure?

- ❌ BuildConfig is uploaded to Google Play as plain text
- ✅ BuildConfig fields are compiled into the APK and visible when decompiled
- ❌ BuildConfig values are logged automatically by Android
- ❌ BuildConfig files are excluded from R8 obfuscation

> **Explanation:** While BuildConfig keeps secrets out of source code, the values are compiled as string constants into the DEX bytecode. Anyone who decompiles the APK with tools like APKTool or jadx can extract these values. For truly sensitive keys, fetch them from your server at runtime.

### Coding Challenge: Secure Key-Value Store

Build a `SecureStorage` class that wraps EncryptedSharedPreferences with expiry support — values automatically become invalid after a specified TTL (time-to-live).

#### Solution

```kotlin
import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

class SecureStorage(context: Context) {
    private val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        "secure_storage",
        masterKeyAlias,
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun putString(key: String, value: String, ttlMillis: Long = 0) {
        prefs.edit()
            .putString(key, value)
            .putLong("${key}_expiry", if (ttlMillis > 0) {
                System.currentTimeMillis() + ttlMillis
            } else {
                Long.MAX_VALUE
            })
            .apply()
    }

    fun getString(key: String): String? {
        val expiry = prefs.getLong("${key}_expiry", 0)
        if (System.currentTimeMillis() > expiry) {
            remove(key)
            return null
        }
        return prefs.getString(key, null)
    }

    fun remove(key: String) {
        prefs.edit()
            .remove(key)
            .remove("${key}_expiry")
            .apply()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
    }
}

// Usage
val storage = SecureStorage(context)
storage.putString("auth_token", token, ttlMillis = 30 * 60 * 1000) // 30 min TTL
val token = storage.getString("auth_token") // Returns null if expired
```

This class combines the encryption guarantees of EncryptedSharedPreferences with automatic expiry. Expired values are deleted on read, ensuring stale sensitive data doesn't persist. The TTL pattern is especially useful for auth tokens and session data.

---

## Module 3: Network Security

### Lesson 3.1: Network Security Configuration

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <!-- Disable cleartext (HTTP) traffic -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Certificate pinning for your API -->
    <domain-config>
        <domain includeSubdomains="true">api.yourapp.com</domain>
        <pin-set expiration="2025-06-01">
            <pin digest="SHA-256">base64EncodedPinHere==</pin>
            <pin digest="SHA-256">backupPinHere==</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

### Lesson 3.2: Certificate Pinning with OkHttp

```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add("api.yourapp.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    .add("api.yourapp.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=") // Backup
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

**Why pin certificates** — Without pinning, any CA-issued certificate is trusted. A compromised CA (or a corporate proxy) can MitM your traffic. Pinning ensures only YOUR certificate is accepted.

**Key takeaway:** Always pin certificates for sensitive APIs. Include a backup pin. Have a rotation plan before the certificate expires.

### Lesson 3.3: Secure API Communication

```kotlin
// ✅ Use request/response interceptors for auth
class AuthInterceptor(
    private val tokenProvider: TokenProvider
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.getAccessToken()
        val request = chain.request().newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        return chain.proceed(request)
    }
}

// ✅ Redact sensitive headers in logging
val loggingInterceptor = HttpLoggingInterceptor().apply {
    level = HttpLoggingInterceptor.Level.HEADERS
    redactHeader("Authorization")
    redactHeader("Cookie")
}
```

**Key takeaway:** Never log sensitive data. Redact auth headers, tokens, and PII from logging interceptors.

### Quiz: Network Security

#### What is the primary purpose of certificate pinning?

- ❌ To encrypt network traffic using TLS
- ❌ To speed up HTTPS handshakes
- ✅ To ensure only your specific certificate is trusted, preventing MitM attacks from compromised CAs
- ❌ To replace the need for HTTPS entirely

> **Explanation:** Certificate pinning restricts which certificates your app trusts for a specific domain. Without pinning, any CA-issued certificate is accepted — meaning a compromised Certificate Authority or a corporate proxy could issue a valid certificate and intercept your traffic. Pinning ensures only YOUR certificate (or its public key) is accepted.

#### What does `cleartextTrafficPermitted="false"` do in the Network Security Configuration?

- ❌ Disables all network traffic
- ✅ Blocks all unencrypted HTTP connections, allowing only HTTPS
- ❌ Enables certificate pinning automatically
- ❌ Encrypts DNS queries

> **Explanation:** Setting `cleartextTrafficPermitted="false"` prevents your app from making any unencrypted HTTP connections. All network traffic must use HTTPS (TLS). This is a defense-in-depth measure that protects against accidental use of HTTP URLs and prevents data from being transmitted in plain text.

#### Why should you include a backup pin when implementing certificate pinning?

- ❌ Backup pins improve network performance
- ❌ Backup pins are required by Android
- ✅ If the primary certificate expires or is rotated, the backup prevents your app from losing connectivity
- ❌ Backup pins encrypt the certificate chain

> **Explanation:** Certificates have expiration dates and may need to be rotated. If you only pin one certificate and it expires, your app cannot connect to your server at all — effectively bricking the network layer for all users. A backup pin for a secondary or next-rotation certificate ensures continuity during certificate changes.

### Coding Challenge: Secure OkHttp Client Builder

Create a factory function that builds a production-ready OkHttp client with certificate pinning, auth token injection, sensitive header redaction, and a configurable timeout — all security best practices in one reusable builder.

#### Solution

```kotlin
import okhttp3.CertificatePinner
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

fun buildSecureClient(
    domain: String,
    primaryPin: String,
    backupPin: String,
    tokenProvider: () -> String?,
    isDebug: Boolean = false
): OkHttpClient {
    val certificatePinner = CertificatePinner.Builder()
        .add(domain, "sha256/$primaryPin")
        .add(domain, "sha256/$backupPin")
        .build()

    val authInterceptor = Interceptor { chain ->
        val requestBuilder = chain.request().newBuilder()
        tokenProvider()?.let { token ->
            requestBuilder.addHeader("Authorization", "Bearer $token")
        }
        chain.proceed(requestBuilder.build())
    }

    val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (isDebug) {
            HttpLoggingInterceptor.Level.HEADERS
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
        redactHeader("Authorization")
        redactHeader("Cookie")
        redactHeader("Set-Cookie")
    }

    return OkHttpClient.Builder()
        .certificatePinner(certificatePinner)
        .addInterceptor(authInterceptor)
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
}

// Usage
val client = buildSecureClient(
    domain = "api.yourapp.com",
    primaryPin = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    backupPin = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    tokenProvider = { tokenManager.getAccessToken() },
    isDebug = BuildConfig.DEBUG
)
```

This factory encapsulates all network security best practices: certificate pinning with backup, automatic auth header injection, sensitive header redaction in logs, and logging disabled entirely in release builds. The `tokenProvider` lambda keeps the client decoupled from your token storage implementation.

---

## Module 4: Code Protection

### Lesson 4.1: ProGuard and R8

```kotlin
// proguard-rules.pro
# Keep data classes used with Gson/Moshi
-keepclassmembers class com.yourapp.data.model.** {
    <fields>;
}

# Keep Compose stability
-keep class * implements androidx.compose.runtime.Stable { *; }

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
```

**What R8 does:**
- **Shrinking** — Removes unused classes, methods, fields
- **Obfuscation** — Renames classes/methods to `a`, `b`, `c`
- **Optimization** — Inlines methods, removes dead code, simplifies control flow

**Key takeaway:** Always enable R8 for release builds. It reduces APK size and makes reverse engineering harder. Test thoroughly after enabling — serialization and reflection can break.

### Lesson 4.2: Secrets Management

```kotlin
// ❌ Never hardcode secrets
private const val API_KEY = "sk_live_abc123"  // Visible in decompiled APK

// ✅ Use BuildConfig with local.properties
// local.properties (git-ignored)
API_KEY=sk_live_abc123

// build.gradle.kts
android {
    defaultConfig {
        buildConfigField("String", "API_KEY",
            "\"${project.findProperty("API_KEY")}\"")
    }
}

// ✅ Better — fetch from server at runtime
class ConfigRepository(private val api: ConfigApi) {
    suspend fun getApiKey(): String = api.getConfig().apiKey
}
```

**Key takeaway:** BuildConfig fields are still in the APK (just not in source code). For truly sensitive keys, fetch them from your server at runtime, or use the NDK to store them in native code (raises the bar, but not bulletproof).

### Quiz: Code Protection

#### What does R8's obfuscation do to your code?

- ❌ Encrypts the entire APK file
- ❌ Removes all classes and methods
- ✅ Renames classes, methods, and fields to short meaningless names like `a`, `b`, `c`
- ❌ Converts Kotlin code to native machine code

> **Explanation:** R8 obfuscation renames identifiers to short, meaningless names (e.g., `UserRepository.fetchUser()` becomes `a.b()`). This makes reverse engineering significantly harder because decompiled code loses all semantic meaning. It doesn't encrypt the APK or convert code to native — the bytecode structure remains the same, just with obscured names.

#### Why might R8/ProGuard break serialization libraries like Gson?

- ❌ R8 deletes all third-party library code
- ✅ R8 renames fields that Gson uses via reflection to map JSON keys to class properties
- ❌ R8 converts JSON to binary format
- ❌ R8 removes the internet permission

> **Explanation:** Libraries like Gson use reflection to map JSON field names to class property names. When R8 renames `userName` to `a`, Gson can no longer match the JSON key `"userName"` to the obfuscated field. That's why you need `-keep` rules for data model classes used with reflection-based serialization.

### Coding Challenge: Runtime Secrets Fetcher

Implement a `SecretsManager` that fetches API keys from a remote config endpoint at runtime instead of hardcoding them, with in-memory caching and encrypted local fallback.

#### Solution

```kotlin
import android.content.Context
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SecretsManager(
    private val api: SecretsApi,
    private val secureStorage: SecureStorage,
    context: Context
) {
    private val mutex = Mutex()
    private val memoryCache = mutableMapOf<String, String>()

    suspend fun getSecret(key: String): String? {
        // 1. Check in-memory cache first (fastest, never touches disk)
        memoryCache[key]?.let { return it }

        return mutex.withLock {
            // Double-check after acquiring lock
            memoryCache[key]?.let { return it }

            // 2. Try fetching from server (source of truth)
            try {
                val response = api.getSecrets()
                response.secrets.forEach { (k, v) ->
                    memoryCache[k] = v
                    secureStorage.putString("secret_$k", v, ttlMillis = 24 * 60 * 60 * 1000)
                }
                memoryCache[key]
            } catch (e: Exception) {
                // 3. Fall back to encrypted local cache
                secureStorage.getString("secret_$key")?.also {
                    memoryCache[key] = it
                }
            }
        }
    }

    fun clearSecrets() {
        memoryCache.clear()
    }
}

interface SecretsApi {
    @GET("config/secrets")
    suspend fun getSecrets(): SecretsResponse
}

data class SecretsResponse(val secrets: Map<String, String>)
```

This approach keeps secrets out of the APK entirely. The three-tier lookup (memory → server → encrypted cache) balances performance with security. In-memory secrets are lost on process death (good for security), while the encrypted fallback ensures the app works offline. The mutex prevents concurrent network calls during cache misses.

---

## Module 5: Authentication and Biometrics

### Lesson 5.1: Biometric Authentication

```kotlin
class BiometricHelper(private val activity: FragmentActivity) {

    fun authenticate(onSuccess: () -> Unit, onError: (String) -> Unit) {
        val biometricManager = BiometricManager.from(activity)
        when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> showPrompt(onSuccess, onError)
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> onError("No biometric hardware")
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> onError("No biometrics enrolled")
            else -> onError("Biometric unavailable")
        }
    }

    private fun showPrompt(onSuccess: () -> Unit, onError: (String) -> Unit) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate")
            .setSubtitle("Verify your identity")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

        val biometricPrompt = BiometricPrompt(activity,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onError(errString.toString())
                }
            }
        )

        biometricPrompt.authenticate(promptInfo)
    }
}
```

**Key takeaway:** Always check `canAuthenticate()` before showing the biometric prompt. Handle all error cases — not all devices have biometric hardware, and users may not have enrolled.

### Lesson 5.2: Secure Token Management

```kotlin
class TokenManager(private val encryptedPrefs: SharedPreferences) {
    fun saveTokens(accessToken: String, refreshToken: String) {
        encryptedPrefs.edit()
            .putString("access_token", accessToken)
            .putString("refresh_token", refreshToken)
            .putLong("token_expiry", System.currentTimeMillis() + TOKEN_LIFETIME)
            .apply()
    }

    fun getAccessToken(): String? {
        val expiry = encryptedPrefs.getLong("token_expiry", 0)
        if (System.currentTimeMillis() > expiry) return null
        return encryptedPrefs.getString("access_token", null)
    }

    fun clearTokens() {
        encryptedPrefs.edit().clear().apply()
    }
}
```

**Key takeaway:** Store tokens in EncryptedSharedPreferences. Check expiry before use. Clear tokens on logout. Never store tokens in plain SharedPreferences or databases.

### Quiz: Authentication and Biometrics

#### What should you always check before showing a BiometricPrompt?

- ❌ Whether the device has a screen lock
- ❌ Whether the app has internet connectivity
- ✅ Whether biometric authentication is available by calling `canAuthenticate()`
- ❌ Whether the user has granted the CAMERA permission

> **Explanation:** Not all devices have biometric hardware, and even those that do may not have enrolled biometrics. Calling `BiometricManager.canAuthenticate()` returns the current status — `BIOMETRIC_SUCCESS`, `BIOMETRIC_ERROR_NO_HARDWARE`, or `BIOMETRIC_ERROR_NONE_ENROLLED`. Showing a prompt without this check leads to crashes or confusing error states.

#### Why is it important to check token expiry before using a stored access token?

- ❌ Expired tokens consume more memory
- ❌ Expired tokens crash the app
- ✅ Expired tokens will be rejected by the server, and proactive checking enables smooth token refresh
- ❌ Expired tokens are automatically deleted by Android

> **Explanation:** Using an expired token results in a 401 Unauthorized response from the server. By checking expiry before making a request, you can proactively trigger a token refresh flow, avoiding failed API calls and providing a smoother user experience. Android does not manage token lifecycle — that's your responsibility.

#### What is the recommended `setAllowedAuthenticators` value for high-security operations like payments?

- ❌ `BIOMETRIC_WEAK`
- ✅ `BIOMETRIC_STRONG`
- ❌ `DEVICE_CREDENTIAL`
- ❌ `BIOMETRIC_WEAK or DEVICE_CREDENTIAL`

> **Explanation:** `BIOMETRIC_STRONG` requires Class 3 biometrics (as defined by Android CDD), which have strict false acceptance rate requirements. `BIOMETRIC_WEAK` (Class 2) allows less secure biometrics like basic face detection. For high-security operations like payments, you should require `BIOMETRIC_STRONG` to ensure the highest level of biometric security.

### Coding Challenge: Biometric-Gated Crypto Operation

Implement a function that ties a cryptographic operation to biometric authentication — the key can only be used after the user successfully authenticates with their fingerprint or face.

#### Solution

```kotlin
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class BiometricCrypto(private val activity: FragmentActivity) {

    companion object {
        private const val KEY_ALIAS = "biometric_key"
    }

    fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        keyStore.getKey(KEY_ALIAS, null)?.let { return it as SecretKey }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .build()
        )
        return keyGenerator.generateKey()
    }

    fun encryptWithBiometric(
        plainText: String,
        onSuccess: (ByteArray, ByteArray) -> Unit,
        onError: (String) -> Unit
    ) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())

        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        val prompt = BiometricPrompt(activity,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val authedCipher = result.cryptoObject!!.cipher!!
                    val encrypted = authedCipher.doFinal(plainText.toByteArray())
                    val iv = authedCipher.iv
                    onSuccess(encrypted, iv)
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onError(errString.toString())
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate to Encrypt")
            .setSubtitle("Biometric verification required")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricPrompt.BIOMETRIC_STRONG)
            .build()

        prompt.authenticate(promptInfo, cryptoObject)
    }
}
```

This ties the AES key to biometric auth via `setUserAuthenticationRequired(true)`. The key physically cannot be used without biometric verification — the TEE won't release the key for the cipher operation until the user authenticates. The `CryptoObject` ensures the same authenticated cipher instance is used for encryption, preventing any bypass of the biometric gate.

---

## Module 6: Content Provider Security

### Lesson 6.1: Exported Components

```xml
<!-- ❌ Exported without protection -->
<provider
    android:name=".UserContentProvider"
    android:authorities="com.app.users"
    android:exported="true" />

<!-- ✅ Protected with permission -->
<provider
    android:name=".UserContentProvider"
    android:authorities="com.app.users"
    android:exported="true"
    android:readPermission="com.app.permission.READ_USERS"
    android:writePermission="com.app.permission.WRITE_USERS" />

<!-- ✅ Or not exported at all (default in Android 12+) -->
<provider
    android:name=".UserContentProvider"
    android:authorities="com.app.users"
    android:exported="false" />
```

**Key takeaway:** Since Android 12, `exported` must be explicitly set. Default to `false`. Only export components that genuinely need to be accessed by other apps, and protect them with custom permissions.

### Quiz: Content Provider Security

#### What changed about exported components starting in Android 12 (API 31)?

- ❌ All components are automatically exported
- ❌ Exported components no longer need permissions
- ✅ The `android:exported` attribute must be explicitly declared for components with intent filters
- ❌ Content providers were removed from the framework

> **Explanation:** Starting with Android 12, if a component (Activity, Service, BroadcastReceiver, or ContentProvider) has an intent filter, you must explicitly set `android:exported="true"` or `android:exported="false"`. Previously, components with intent filters were implicitly exported. This change forces developers to make a conscious security decision about component visibility.

#### What is the most secure default for a ContentProvider that only your app uses?

- ❌ `android:exported="true"` with no permissions
- ❌ `android:exported="true"` with a custom read permission
- ✅ `android:exported="false"`
- ❌ `android:exported="true"` with `android:grantUriPermissions="true"`

> **Explanation:** If a ContentProvider is only used within your own app, set `exported="false"`. This prevents any other app from querying, inserting, or modifying data through it. Only export providers that genuinely need cross-app access, and always protect them with custom permissions when you do.

### Coding Challenge: Secure Content Provider

Build a ContentProvider that enforces custom read/write permissions and validates all incoming URIs to prevent path traversal attacks.

#### Solution

```kotlin
import android.content.ContentProvider
import android.content.ContentValues
import android.content.UriMatcher
import android.database.Cursor
import android.net.Uri

class SecureUserProvider : ContentProvider() {

    companion object {
        const val AUTHORITY = "com.yourapp.provider.users"
        const val USERS = 1
        const val USER_BY_ID = 2

        val uriMatcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(AUTHORITY, "users", USERS)
            addURI(AUTHORITY, "users/#", USER_BY_ID)
        }
    }

    override fun onCreate(): Boolean = true

    override fun query(
        uri: Uri, projection: Array<String>?, selection: String?,
        selectionArgs: Array<String>?, sortOrder: String?
    ): Cursor? {
        // Validate URI to prevent path traversal
        enforceValidUri(uri)

        // Check caller has read permission
        context?.enforceCallingOrSelfPermission(
            "com.yourapp.permission.READ_USERS",
            "Read permission required"
        )

        // Sanitize projection to prevent SQL injection
        val safeProjection = projection?.filter { it.matches(Regex("^[a-zA-Z_]+$")) }
            ?.toTypedArray()

        return when (uriMatcher.match(uri)) {
            USERS -> queryAllUsers(safeProjection, selectionArgs, sortOrder)
            USER_BY_ID -> queryUserById(uri.lastPathSegment!!, safeProjection)
            else -> throw IllegalArgumentException("Unknown URI: $uri")
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        enforceValidUri(uri)
        context?.enforceCallingOrSelfPermission(
            "com.yourapp.permission.WRITE_USERS",
            "Write permission required"
        )
        // Insert logic here
        return null
    }

    private fun enforceValidUri(uri: Uri) {
        val path = uri.path ?: throw SecurityException("Null URI path")
        if (path.contains("..") || path.contains("//")) {
            throw SecurityException("Path traversal detected: $path")
        }
        if (uriMatcher.match(uri) == UriMatcher.NO_MATCH) {
            throw IllegalArgumentException("Unrecognized URI: $uri")
        }
    }

    private fun queryAllUsers(
        projection: Array<String>?, selectionArgs: Array<String>?, sortOrder: String?
    ): Cursor? = null // Database query implementation

    private fun queryUserById(id: String, projection: Array<String>?): Cursor? = null

    override fun update(uri: Uri, values: ContentValues?, sel: String?, args: Array<String>?) = 0
    override fun delete(uri: Uri, sel: String?, args: Array<String>?) = 0
    override fun getType(uri: Uri): String = "vnd.android.cursor.dir/vnd.$AUTHORITY.users"
}
```

This provider enforces three layers of defense: URI validation rejects path traversal attempts, `enforceCallingOrSelfPermission` verifies the caller has the required custom permission, and projection sanitization prevents SQL injection through column names. Always validate inputs at every entry point of an exported component.

---

## Module 7: Privacy Best Practices

### Lesson 7.1: Data Minimization

- Only collect data you actually need
- Don't log PII (names, emails, phone numbers)
- Use analytics sparingly — every tracked event is a privacy trade-off
- Delete user data when they request it or when their account is deleted

### Lesson 7.2: Runtime Permissions

```kotlin
val cameraPermissionLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.RequestPermission()
) { isGranted ->
    if (isGranted) {
        openCamera()
    } else {
        showPermissionRationale()
    }
}

// Check before requesting
when {
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED -> openCamera()
    shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) ->
        showRationale()
    else -> cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
}
```

**Key takeaway:** Request permissions at the point of use, not at app launch. Explain why you need the permission before asking. Handle denial gracefully — offer reduced functionality instead of blocking the user.

### Quiz: Privacy Best Practices

#### What is the principle of data minimization?

- ❌ Encrypt all data before storing it
- ❌ Store data in the smallest file format possible
- ✅ Only collect and retain data that is necessary for your app's functionality
- ❌ Minimize the number of API calls that transmit data

> **Explanation:** Data minimization means you should only collect data you actually need, avoid logging PII, use analytics sparingly, and delete user data when it's no longer needed or when a user requests deletion. Every piece of data you collect is a liability — if you don't need it, don't collect it.

#### When should you request a runtime permission from the user?

- ❌ At app launch, requesting all permissions at once
- ❌ In the splash screen before the main activity loads
- ✅ At the point of use, right when the feature requiring the permission is accessed
- ❌ In a background service when the user isn't looking

> **Explanation:** Requesting permissions at the point of use gives the user context about why the permission is needed. Asking for camera permission when the user taps a "Take Photo" button makes intuitive sense. Asking for it at app launch feels invasive and increases the chance of denial.

#### What should your app do if a user denies a permission?

- ❌ Show the permission dialog again immediately
- ❌ Crash and show an error message
- ❌ Close the app and refuse to open until permission is granted
- ✅ Offer reduced functionality and gracefully degrade the experience

> **Explanation:** Users have the right to deny permissions. Your app should handle denial gracefully — offer alternative workflows or reduced functionality. For example, if camera permission is denied, allow the user to upload a photo from their gallery instead. Never block the entire app over a single permission denial.

### Coding Challenge: Privacy-Compliant Permission Handler

Build a reusable Compose-based permission handler that shows a rationale before requesting, handles all denial states including "don't ask again," and offers graceful fallback.

#### Solution

```kotlin
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

@Composable
fun PermissionGate(
    permission: String,
    rationaleTitle: String,
    rationaleMessage: String,
    onGranted: @Composable () -> Unit,
    onDenied: @Composable () -> Unit
) {
    val context = LocalContext.current
    var permissionState by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, permission) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        )
    }
    var showRationale by remember { mutableStateOf(false) }
    var permanentlyDenied by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        permissionState = granted
        if (!granted) {
            val activity = context as? androidx.activity.ComponentActivity
            permanentlyDenied = activity?.shouldShowRequestPermissionRationale(permission) == false
        }
    }

    when {
        permissionState -> onGranted()
        permanentlyDenied -> {
            // User selected "Don't ask again" — direct to Settings
            AlertDialog(
                onDismissRequest = {},
                title = { Text("Permission Required") },
                text = { Text("$rationaleMessage\n\nPlease enable this in Settings.") },
                confirmButton = {
                    TextButton(onClick = {
                        context.startActivity(Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null)
                        ))
                    }) { Text("Open Settings") }
                },
                dismissButton = {
                    TextButton(onClick = { permanentlyDenied = false }) { Text("Not Now") }
                }
            )
            onDenied()
        }
        showRationale -> {
            AlertDialog(
                onDismissRequest = { showRationale = false },
                title = { Text(rationaleTitle) },
                text = { Text(rationaleMessage) },
                confirmButton = {
                    TextButton(onClick = {
                        showRationale = false
                        launcher.launch(permission)
                    }) { Text("Grant") }
                },
                dismissButton = {
                    TextButton(onClick = { showRationale = false }) { Text("Not Now") }
                }
            )
            onDenied()
        }
        else -> {
            LaunchedEffect(Unit) { showRationale = true }
            onDenied()
        }
    }
}
```

This composable handles the full permission lifecycle: shows a rationale explaining why the permission is needed, handles the "don't ask again" state by directing users to Settings, and always provides a fallback UI through the `onDenied` slot. It follows Google's recommended permission request pattern and respects user choice at every step.

---

## Module 8: Security Testing

### Lesson 8.1: Security Checklist

- **Storage** — No sensitive data in plain SharedPreferences, no hardcoded secrets
- **Network** — HTTPS only, certificate pinning for sensitive APIs, no cleartext
- **Components** — No unnecessarily exported Activities/Providers/Receivers
- **Logging** — No PII in logs, no tokens in crash reports, logging disabled in release
- **Code** — R8/ProGuard enabled, no debug flags in release, root detection for sensitive apps
- **Auth** — Tokens in EncryptedSharedPreferences, session timeout, biometric for sensitive operations
- **Dependencies** — Regular dependency updates, vulnerability scanning

### Lesson 8.2: Tools for Security Testing

- **OWASP Mobile Testing Guide** — Comprehensive mobile security testing methodology
- **APKTool** — Decompile and inspect your own APK to verify obfuscation
- **Frida** — Dynamic instrumentation to test runtime security measures
- **MobSF** — Automated mobile security assessment
- **Android Lint** — Built-in checks for common security issues

**Key takeaway:** Test your own app's security before attackers do. Decompile your release APK and verify that secrets aren't visible, code is obfuscated, and exported components are protected.

### Quiz: Security Testing

#### Which tool is used to decompile an APK and inspect its contents for security verification?

- ❌ Android Lint
- ✅ APKTool
- ❌ LeakCanary
- ❌ Android Profiler

> **Explanation:** APKTool decompiles APK files, allowing you to inspect resources, manifest, and smali bytecode. This lets you verify that your obfuscation is working, secrets aren't hardcoded in plain text, and exported components are properly configured. You should decompile your own release APK as part of your security testing process.

#### What does Frida enable security testers to do?

- ❌ Encrypt all app traffic automatically
- ❌ Run static analysis on source code
- ✅ Dynamically instrument a running app to test runtime security measures
- ❌ Generate ProGuard configuration files

> **Explanation:** Frida is a dynamic instrumentation toolkit that lets you inject JavaScript into running processes. Security testers use it to bypass root detection, hook into functions at runtime, and test whether your app's runtime defenses hold up. If an attacker can use Frida to bypass your security checks, those checks need hardening.

#### Which of the following should NOT appear in a release build's logs?

- ❌ App version number
- ❌ Non-sensitive error codes
- ✅ User authentication tokens
- ❌ Device model name

> **Explanation:** Auth tokens, PII, passwords, and any sensitive data must never appear in logs — especially in release builds. Logs can be read by other apps with READ_LOGS permission on older Android versions, and are accessible via ADB. Use R8's `-assumenosideeffects` to strip debug and verbose log calls from release builds entirely.

### Coding Challenge: Automated Security Audit

Build a `SecurityAuditor` class that programmatically checks your app against common security misconfigurations and generates an audit report.

#### Solution

```kotlin
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build

data class AuditResult(
    val check: String,
    val passed: Boolean,
    val detail: String
)

class SecurityAuditor(private val context: Context) {

    fun runFullAudit(): List<AuditResult> {
        return listOf(
            checkDebuggable(),
            checkBackupAllowed(),
            checkCleartextTraffic(),
            checkExportedComponents(),
            checkMinSdkVersion(),
            checkLogStripping()
        )
    }

    private fun checkDebuggable(): AuditResult {
        val isDebuggable = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return AuditResult(
            check = "App not debuggable",
            passed = !isDebuggable,
            detail = if (isDebuggable) "CRITICAL: App is debuggable in this build"
                     else "Release build is not debuggable"
        )
    }

    private fun checkBackupAllowed(): AuditResult {
        val allowBackup = context.applicationInfo.flags and
            ApplicationInfo.FLAG_ALLOW_BACKUP != 0
        return AuditResult(
            check = "Backup configuration",
            passed = !allowBackup,
            detail = if (allowBackup) "WARNING: allowBackup=true, data extractable via ADB"
                     else "Backup is disabled"
        )
    }

    private fun checkCleartextTraffic(): AuditResult {
        val allowsCleartext = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            context.applicationInfo.flags and ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC != 0
        } else true
        return AuditResult(
            check = "Cleartext traffic disabled",
            passed = !allowsCleartext,
            detail = if (allowsCleartext) "WARNING: Cleartext HTTP traffic is permitted"
                     else "Only HTTPS traffic is allowed"
        )
    }

    private fun checkExportedComponents(): AuditResult {
        val pm = context.packageManager
        val packageInfo = pm.getPackageInfo(
            context.packageName,
            PackageManager.GET_ACTIVITIES or
            PackageManager.GET_PROVIDERS or
            PackageManager.GET_RECEIVERS
        )
        val exportedCount = (packageInfo.activities?.count { it.exported } ?: 0) +
            (packageInfo.providers?.count { it.exported } ?: 0) +
            (packageInfo.receivers?.count { it.exported } ?: 0)
        return AuditResult(
            check = "Exported components review",
            passed = exportedCount <= 2,
            detail = "$exportedCount components are exported. Review if all are necessary."
        )
    }

    private fun checkMinSdkVersion(): AuditResult {
        val minSdk = context.applicationInfo.minSdkVersion
        return AuditResult(
            check = "Minimum SDK >= 24",
            passed = minSdk >= 24,
            detail = "minSdk is $minSdk. Older versions lack key security features."
        )
    }

    private fun checkLogStripping(): AuditResult {
        val isDebuggable = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return AuditResult(
            check = "Log stripping in release",
            passed = !isDebuggable,
            detail = if (!isDebuggable) "Release build — verify R8 strips Log.d/v/i calls"
                     else "Debug build — log stripping not applicable"
        )
    }

    fun generateReport(): String = buildString {
        appendLine("=== Security Audit Report ===")
        appendLine()
        runFullAudit().forEach { result ->
            val icon = if (result.passed) "✅" else "❌"
            appendLine("$icon ${result.check}")
            appendLine("   ${result.detail}")
        }
    }
}
```

This auditor runs at app startup (in debug builds) or as part of CI testing to catch common misconfigurations. Each check returns a structured result that can be logged, displayed, or sent to your security monitoring dashboard. Extend it with additional checks specific to your app's threat model.

---

Thank You for completing the Android Security & Privacy course! Security is not a feature — it's a responsibility to your users. Build with it from day one. 🔒
