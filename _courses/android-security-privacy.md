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

---

Thank You for completing the Android Security & Privacy course! Security is not a feature — it's a responsibility to your users. Build with it from day one. 🔒
