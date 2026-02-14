---
title: "Android Security & Privacy"
layout: course
description: "Secure your Android apps — encryption, KeyStore, ProGuard/R8, network security, biometrics, secure storage, and privacy best practices."
icon: "🔒"
color: "#f87171"
difficulty: "Intermediate to Expert"
modules: 9
lessons: 48
duration: "7 weeks"
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
  - "Manage API keys and secrets across build variants"
  - "Detect rooted devices and runtime tampering"
  - "Secure app components, intents, and deep links"
prerequisites:
  - "Android development experience"
  - "Basic understanding of cryptography concepts"
---

## Module 1: Security Fundamentals

Security isn't a feature you add later — it's a mindset you build with. Every decision, from how you store a token to how you log errors, has security implications. I learned this the hard way when I shipped an app that stored API keys in `BuildConfig` fields and user tokens in plain `SharedPreferences`. A motivated user with a rooted device decompiled the APK in under a minute and extracted every constant. Android's sandbox protects you from other apps, but it doesn't protect you from the device owner.

### Lesson 1.1: The Android Security Model

Android's security architecture is built on multiple reinforcing layers, each designed to contain the damage if another layer is compromised. At the foundation sits the Linux kernel, which provides process isolation through unique UIDs. Every app runs in its own process, and the kernel enforces file system boundaries at the process level — App A simply cannot read App B's private files. This is not an application-level check that can be bypassed with a clever hack; it's enforced by the operating system kernel itself.

On top of process isolation, Android layers SELinux (Security-Enhanced Linux), which applies mandatory access control policies. Even if an attacker gains root access, SELinux policies restrict what processes can do — a compromised media process can't suddenly access the keystore daemon. Verified Boot ensures the device firmware and OS haven't been tampered with, creating a chain of trust from the bootloader to the application layer. Application sandboxing means each app gets its own slice of the filesystem under `/data/data/<package_name>/`, and the kernel prevents cross-app file access.

The practical implication is that Android gives you a strong security foundation by default. Your job as a developer is to not weaken it. Misconfigured content providers, world-readable files, exported components without permissions, debug flags left in production — these are all ways you punch holes in the sandbox that Android built for you. The apps I've worked on in production had security issues not because Android's model was weak, but because developers didn't understand what the platform already provides and inadvertently bypassed its protections.

**Key takeaway:** Android's sandbox is strong by default. Your job is to not weaken it — don't expose data through misconfigured content providers, world-readable files, or exported components.

### Lesson 1.2: Threat Modeling for Mobile

Before writing a single line of security code, you need to understand what you're protecting and who you're protecting it from. Threat modeling is the process of identifying your app's assets (user data, API keys, session tokens), the adversaries who might target them (script kiddies, sophisticated attackers, state actors), and the attack vectors they'd use (reverse engineering, network interception, physical device access). Without this exercise, you'll waste time hardening areas that don't matter while leaving critical vulnerabilities wide open.

Mobile threat categories break down into five areas. **Data at rest** covers sensitive information stored on the device — tokens, PII, credentials, cached content. **Data in transit** covers network communication — API calls, WebSocket connections, push notification payloads. **Reverse engineering** is about APK decompilation and code analysis — an attacker downloading your APK from the Play Store and extracting secrets. **Runtime attacks** involve tools like Frida and Xposed that hook into running processes to bypass checks, modify return values, and intercept function calls. **Supply chain** attacks target your dependencies — compromised libraries, malicious SDKs, or build tool vulnerabilities.

The key insight is that different apps need different security postures. A banking app handling financial transactions needs certificate pinning, root detection, runtime integrity checks, and hardware-backed encryption. A weather app displaying public data needs basic HTTPS and proper permission handling, but investing in anti-tampering is overkill. When I worked on a news app, the security audit revealed that clear text traffic was enabled and backup was set to true — medium-risk findings for a content app, but they'd be critical findings for a fintech app. Prioritize based on what your app actually handles.

**Key takeaway:** You can't protect against everything. Prioritize based on your app's risk profile. A banking app needs different security than a weather app.

### Lesson 1.3: The CIA Triad in Mobile Context

The CIA triad — Confidentiality, Integrity, Availability — is the foundation of information security, and it maps directly to Android development decisions. **Confidentiality** means sensitive data is only accessible to authorized parties. On Android, this translates to encrypted storage, secure network communication, and proper access controls on components. When a user's auth token sits in plain SharedPreferences XML on a rooted device, confidentiality is broken. When your API traffic goes over HTTP instead of HTTPS, confidentiality is broken during transit.

**Integrity** means data hasn't been tampered with. On Android, this means verifying that the APK hasn't been repackaged, that network responses haven't been modified in transit (which GCM mode provides), and that stored data hasn't been altered by another process. Certificate pinning protects network integrity. Code signing protects APK integrity. Using HMAC or authenticated encryption (AES-GCM) protects data integrity at rest. If you're using AES-CBC without a separate MAC, you have confidentiality but not integrity — an attacker could flip bits in the ciphertext and you wouldn't detect it.

**Availability** means the app and its data remain accessible when needed. This is less discussed in mobile security, but it matters. Overly aggressive certificate pinning without backup pins or expiration dates can brick your app's networking if the certificate rotates. Overly aggressive root detection can lock out legitimate users with custom ROMs. Encrypting everything with biometric-gated keys means the user can't access their data if they break their finger. Every security measure has an availability tradeoff, and the best security engineers balance both.

**Key takeaway:** Security decisions involve balancing confidentiality, integrity, and availability. Overly aggressive security can harm availability — certificate pinning without backup pins can brick your app's networking entirely.

### Lesson 1.4: Android Security Architecture Deep Dive

Understanding Android's security architecture at a deeper level helps you make better decisions about where to invest your security efforts. The architecture has four major layers, each providing distinct protections. The **hardware layer** includes the Trusted Execution Environment (TEE) and StrongBox — isolated processors with their own memory that handle cryptographic operations. Keys stored in the TEE never enter the main application processor's memory. Even if the Android OS itself is fully compromised, the TEE remains isolated.

The **OS layer** provides process isolation, SELinux policies, seccomp filters (restricting which system calls a process can make), and file-based encryption (FBE). Since Android 10, all devices encrypt user data on the filesystem by default. This means that even without `EncryptedSharedPreferences`, your app's SharedPreferences files are encrypted at the filesystem level when the device is locked. The nuance is that this protection evaporates once the user unlocks the device — after unlock, any process running as the app's UID can read those files in plaintext. That's why additional application-level encryption still matters for highly sensitive data.

The **framework layer** provides the permission system, `NetworkSecurityConfig`, `BiometricPrompt`, the `KeyStore` API, and scoped storage. These APIs are your primary tools as an app developer. The **application layer** is your code — and this is where most vulnerabilities live. Hardcoded secrets, misconfigured manifests, insecure IPC, improper use of WebView, and logging sensitive data are all application-layer mistakes. The platform gives you excellent tools, but you have to actually use them correctly.

StrongBox, available on devices running Android 9+, deserves special attention. It's a dedicated security chip with its own CPU, storage, and true random number generator. Unlike the TEE (which shares the main processor), StrongBox is physically separate hardware. When you call `setIsStrongBoxBacked(true)` on a `KeyGenParameterSpec`, the key is generated and stored entirely within this chip. The tradeoff is that StrongBox operations are slower (hardware IPC overhead) and support a smaller set of algorithms (AES-128/256, RSA-2048, ECDSA P-256).

**Key takeaway:** Android's security is layered — hardware, OS, framework, and application. Most vulnerabilities exist at the application layer, which is your responsibility. The platform provides excellent tools; the challenge is using them correctly.

### Lesson 1.5: Common Security Mistakes in Production Apps

I've seen a pattern of security mistakes repeated across production apps, and understanding them is the fastest way to avoid them yourself. In a security audit of a news app I worked on, we found **clear text traffic enabled** (`usesCleartextTraffic="true"` in the manifest), **Android backup set to true** (meaning app data could be extracted via ADB), **no root detection**, and **insufficient session expiration**. None of these were intentional — they were defaults that nobody reviewed. The `allowBackup` flag defaults to `true`, and without explicit `android:usesCleartextTraffic="false"`, HTTP connections are silently permitted.

Hardcoded cryptographic secrets are another recurring issue. Developers store API keys, encryption passwords, and OAuth client secrets directly in source code or `BuildConfig` fields. The thinking is "it's compiled, so it's safe" — but it's not. Tools like jadx, APKTool, and JADX can decompile any APK in seconds. Even if you obfuscate with R8, string constants are preserved verbatim because R8 doesn't encrypt strings. If `const val API_KEY = "sk_live_abc123"` appears in your code, it appears identically in the decompiled output. I've personally extracted API keys from competitor apps in under two minutes using jadx — and if I can do it, so can any attacker.

The `android:exported` attribute is another minefield. Before Android 12, components with intent filters were implicitly exported, meaning any app on the device could start your activities, bind to your services, or query your content providers. I've seen apps where a deeplink-handling Activity was exported without any validation, allowing a malicious app to craft intents that triggered sensitive actions. Since Android 12, you must explicitly declare `exported="true"` or `exported="false"`, but legacy apps still carry implicit exports. Similarly, leaving `android:debuggable="true"` in a production build is a critical vulnerability — it allows any user to attach a debugger, set breakpoints, inspect variables, and step through your app's code.

**Key takeaway:** Most security vulnerabilities aren't sophisticated exploits — they're configuration mistakes. Review your manifest flags, audit your exported components, and never hardcode secrets. These are the low-hanging fruit that attackers check first.

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

#### What does the StrongBox security module provide that the TEE does not?

- ❌ Faster cryptographic operations
- ❌ Support for all encryption algorithms
- ✅ A physically separate processor with its own CPU, storage, and random number generator
- ❌ Automatic key rotation

> **Explanation:** StrongBox is a dedicated security chip physically separate from the main processor, with its own CPU, secure storage, and true random number generator. The TEE runs on the main application processor in an isolated mode. StrongBox provides stronger isolation because even a full compromise of the main processor cannot access StrongBox's internals.

### Coding Challenge: App Sandbox Verification

Write a Kotlin function that checks whether your app's private files directory has the correct restrictive permissions, verifying that the Android sandbox is properly configured and no files are world-readable.

#### Solution

```kotlin
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import java.io.File

data class SandboxCheckResult(
    val check: String,
    val passed: Boolean,
    val detail: String
)

class SandboxVerifier(private val context: Context) {

    fun verifyAll(): List<SandboxCheckResult> = listOf(
        checkPrivateDirectoryExists(),
        checkNoWorldReadableFiles(),
        checkModePrivateEnforced(),
        checkDebuggableFlag(),
        checkBackupFlag()
    )

    private fun checkPrivateDirectoryExists(): SandboxCheckResult {
        val filesDir = context.filesDir
        val exists = filesDir.exists() && filesDir.isDirectory
        return SandboxCheckResult(
            check = "Private files directory",
            passed = exists && filesDir.absolutePath.contains(context.packageName),
            detail = "Path: ${filesDir.absolutePath}"
        )
    }

    private fun checkNoWorldReadableFiles(): SandboxCheckResult {
        val filesDir = context.filesDir
        val privateFiles = filesDir.listFiles() ?: emptyArray()
        val hasWorldReadable = privateFiles.any { file ->
            try {
                val process = Runtime.getRuntime()
                    .exec(arrayOf("ls", "-la", file.absolutePath))
                val permissions = process.inputStream.bufferedReader().readLine()
                process.waitFor()
                // Check if 'others' have read permission (position 7)
                permissions?.let { it.length > 7 && it[7] == 'r' } ?: false
            } catch (e: Exception) {
                false
            }
        }
        return SandboxCheckResult(
            check = "No world-readable files",
            passed = !hasWorldReadable,
            detail = "Checked ${privateFiles.size} files in private storage"
        )
    }

    private fun checkModePrivateEnforced(): SandboxCheckResult {
        return try {
            val testFile = File(context.filesDir, ".sandbox_test")
            context.openFileOutput(".sandbox_test", Context.MODE_PRIVATE).use {
                it.write("sandbox_check".toByteArray())
            }
            val result = testFile.exists()
            testFile.delete()
            SandboxCheckResult(
                check = "MODE_PRIVATE enforcement",
                passed = result,
                detail = "Private file creation works correctly"
            )
        } catch (e: Exception) {
            SandboxCheckResult("MODE_PRIVATE enforcement", false, "Error: ${e.message}")
        }
    }

    private fun checkDebuggableFlag(): SandboxCheckResult {
        val isDebuggable = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return SandboxCheckResult(
            check = "Debuggable flag",
            passed = !isDebuggable,
            detail = if (isDebuggable) "CRITICAL: App is debuggable" else "Not debuggable"
        )
    }

    private fun checkBackupFlag(): SandboxCheckResult {
        val allowsBackup = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_ALLOW_BACKUP) != 0
        return SandboxCheckResult(
            check = "Backup disabled",
            passed = !allowsBackup,
            detail = if (allowsBackup) "WARNING: allowBackup=true" else "Backup disabled"
        )
    }

    fun generateReport(): String = buildString {
        appendLine("=== Sandbox Verification Report ===")
        verifyAll().forEach { result ->
            val icon = if (result.passed) "✅" else "❌"
            appendLine("$icon ${result.check}: ${result.detail}")
        }
    }
}
```

This verifier checks five aspects of your app's sandbox: private directory existence, world-readable file permissions, MODE_PRIVATE enforcement, debuggable flag, and backup configuration. Run it during development or as part of automated security tests to catch misconfigurations before they reach production.

---

## Module 2: Cryptography and the Android KeyStore

The Android KeyStore system is the foundation of on-device security. Understanding how it works, what it protects against, and when to use it versus alternatives is the most important security skill for an Android engineer. Most VPN apps, email clients, and password managers like Proton VPN and Proton Pass use native code (NDK/C++) behind the scenes for their most sensitive cryptographic operations — that's how seriously the industry takes key management.

### Lesson 2.1: Cryptographic Primitives

Before touching the KeyStore API, you need to understand the building blocks of cryptography on Android. The platform provides four core cryptographic primitives through the `java.security` and `javax.crypto` packages. **Cipher** handles encryption and decryption — it transforms plaintext into ciphertext using an algorithm and a key. **Mac** (Message Authentication Code) verifies message authenticity by producing a fixed-size code from a message and a secret key. **Signature** generates, signs, and verifies digital signatures using asymmetric key pairs. **MessageDigest** produces a fixed-size hash from variable-size input, useful for integrity checks.

The algorithm choice matters enormously. AES (Advanced Encryption Standard) is the recommended symmetric encryption algorithm — it supports key sizes of 128, 192, and 256 bits, with 256 being the strongest. DES is obsolete and should never be used in new code. RSA is used for asymmetric encryption, digital signatures, and key exchange, but it's significantly slower than AES for bulk data. SHA-256 is the standard hash algorithm — SHA-1 is deprecated due to known collision attacks, and MD5 is completely broken. When you see code using DES or MD5, that's a red flag.

For Android development, the recommended combination is **AES-256-GCM** (Galois/Counter Mode). GCM is an authenticated encryption mode, meaning it provides both confidentiality (the data is encrypted) and integrity (any tampering is detected). This is superior to CBC mode, which only provides confidentiality — with CBC, an attacker could flip bits in the ciphertext and you wouldn't know. GCM produces an authentication tag alongside the ciphertext, and decryption fails if even one bit has been modified. The only tradeoff is that GCM requires a unique nonce (initialization vector) for every encryption operation with the same key — reusing a nonce completely breaks the security guarantees.

**Key takeaway:** Use AES-256-GCM for symmetric encryption — it provides both confidentiality and integrity. Never use DES or MD5. Every nonce must be unique per encryption operation.

### Lesson 2.2: Android KeyStore Fundamentals

The Android KeyStore system stores cryptographic keys in a hardware-backed container — the TEE (Trusted Execution Environment) or StrongBox on supported devices. The critical property is that keys stored in the KeyStore **never leave the secure hardware**. When your app encrypts data using a KeyStore key, the plaintext is sent to the TEE, encryption happens inside the secure hardware, and only the ciphertext comes back. The raw key material never enters your app's process memory. This is fundamentally different from storing a key in a file or SharedPreferences, where the key sits in your process memory during use.

```kotlin
object KeyStoreManager {

    private const val ANDROID_KEYSTORE = "AndroidKeyStore"

    fun generateSecretKey(alias: String): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                alias,
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

    fun getSecretKey(alias: String): SecretKey? {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val entry = keyStore.getEntry(alias, null) as? KeyStore.SecretKeyEntry
        return entry?.secretKey
    }

    fun getOrCreateKey(alias: String): SecretKey {
        return getSecretKey(alias) ?: generateSecretKey(alias)
    }

    fun deleteKey(alias: String) {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        keyStore.deleteEntry(alias)
    }

    fun keyExists(alias: String): Boolean {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return keyStore.containsAlias(alias)
    }
}
```

A few critical details about this code. `setUserAuthenticationRequired(false)` means the key can be used without biometric or screen lock authentication — appropriate for general data encryption but not for high-sensitivity operations like payments. Setting it to `true` requires the user to authenticate before each use of the key, which is ideal for banking apps but too aggressive for encrypting cached data. `BLOCK_MODE_GCM` with `ENCRYPTION_PADDING_NONE` is the recommended combination — GCM provides authenticated encryption, and GCM handles its own padding internally so `NONE` is correct (not insecure).

The honest tradeoff: KeyStore operations involve IPC to the secure hardware, making them slower than pure software encryption. For encrypting a single auth token, the overhead is negligible. For bulk encryption of hundreds of records, you'd want to use the KeyStore key to wrap a "working key" in memory and use that for the heavy lifting. This is essentially what `EncryptedSharedPreferences` does internally — it uses the MasterKey (backed by KeyStore) to protect ephemeral data encryption keys.

**Key takeaway:** Use Android KeyStore for cryptographic keys. The key material never enters your app's memory — even on a rooted device, the raw key cannot be extracted from the hardware.

### Lesson 2.3: Encryption and Decryption with Cipher

The `Cipher` class is your primary tool for encrypting and decrypting data using KeyStore-backed keys. The pattern is straightforward: get or create a key, initialize a `Cipher` instance in the appropriate mode (encrypt or decrypt), and process the data. The IV (Initialization Vector) generated during encryption must be stored alongside the ciphertext because it's required for decryption.

```kotlin
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec

object CryptoManager {

    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_LENGTH = 128

    fun encrypt(data: ByteArray, key: SecretKey): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv // GCM generates a random IV automatically
        val ciphertext = cipher.doFinal(data)
        return Pair(ciphertext, iv)
    }

    fun decrypt(ciphertext: ByteArray, iv: ByteArray, key: SecretKey): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
        cipher.init(Cipher.DECRYPT_MODE, key, spec)
        return cipher.doFinal(ciphertext)
    }

    fun encryptString(plaintext: String, key: SecretKey): EncryptedData {
        val (ciphertext, iv) = encrypt(plaintext.toByteArray(Charsets.UTF_8), key)
        return EncryptedData(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            iv = Base64.encodeToString(iv, Base64.NO_WRAP)
        )
    }

    fun decryptString(encrypted: EncryptedData, key: SecretKey): String {
        val ciphertext = Base64.decode(encrypted.ciphertext, Base64.NO_WRAP)
        val iv = Base64.decode(encrypted.iv, Base64.NO_WRAP)
        return String(decrypt(ciphertext, iv, key), Charsets.UTF_8)
    }
}

data class EncryptedData(
    val ciphertext: String,
    val iv: String
)
```

One mistake I've seen in production is developers generating their own IV instead of letting GCM do it. When you call `cipher.init(Cipher.ENCRYPT_MODE, key)` with GCM, the Cipher automatically generates a cryptographically random 12-byte IV. If you provide your own IV and accidentally reuse it with the same key, GCM's security guarantees are completely broken — an attacker can recover the authentication key and forge messages. Let the system generate the IV and store it alongside the ciphertext. The IV is not secret — it just needs to be unique.

Another practical concern is error handling. `Cipher.doFinal()` can throw `AEADBadTagException` during decryption if the ciphertext has been tampered with — this is GCM's integrity check working as designed. Don't catch this silently. A tampered ciphertext means someone modified the data, and your app should treat it as a security event: log it, clear the compromised data, and potentially re-authenticate the user.

**Key takeaway:** Never generate your own IV for GCM — let the Cipher create it. Store the IV alongside the ciphertext. Treat `AEADBadTagException` as a security event, not a recoverable error.

### Lesson 2.4: StrongBox and Hardware Security Levels

Not all KeyStore keys are created equal. Android supports three security levels for key storage: **software**, **TEE (Trusted Execution Environment)**, and **StrongBox**. Software-backed keys are stored in the app's process and offer no hardware protection — they're essentially equivalent to storing the key in a file, just with a nicer API. TEE-backed keys are stored in an isolated execution environment on the main processor — the key material never enters the main OS, but it shares the same physical chip. StrongBox-backed keys live in a dedicated security module with its own processor, memory, and random number generator — fully isolated hardware.

```kotlin
fun generateStrongBoxKey(alias: String): SecretKey? {
    return try {
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
                .setIsStrongBoxBacked(true) // Requires Android 9+
                .build()
        )
        keyGenerator.generateKey()
    } catch (e: StrongBoxUnavailableException) {
        // Fall back to TEE-backed key
        generateSecretKey(alias)
    }
}

fun getKeySecurityLevel(alias: String): String {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val key = keyStore.getKey(alias, null) ?: return "Key not found"

    val factory = KeyFactory.getInstance(
        key.algorithm, "AndroidKeyStore"
    )
    return try {
        val keyInfo = factory.getKeySpec(key, KeyInfo::class.java)
        when (keyInfo.securityLevel) {
            KeyProperties.SECURITY_LEVEL_STRONGBOX -> "StrongBox"
            KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
            KeyProperties.SECURITY_LEVEL_SOFTWARE -> "Software"
            else -> "Unknown"
        }
    } catch (e: Exception) {
        "Unable to determine"
    }
}
```

The tradeoff is real. StrongBox operations are measurably slower because they involve communication with separate hardware over a secure channel. StrongBox also supports a limited set of algorithms — AES-128, AES-256, RSA-2048, ECDSA P-256, and HMAC-SHA256. If you need RSA-4096 or other algorithms, you're limited to TEE-backed keys. In practice, I use StrongBox for the most sensitive keys (encryption keys for payment data, biometric-gated keys) and TEE for everything else. The `StrongBoxUnavailableException` catch is essential — not all devices have StrongBox hardware, so you must provide a graceful fallback.

The extraction prevention is what makes the KeyStore genuinely valuable. When an app performs a cryptographic operation using a KeyStore key, the actual key material never enters the application process. Attackers might be able to use the key (by running code as your app's UID), but they can't extract the key itself. They can't copy it to another device. They can't export it. The secure hardware simply won't allow it. This is the property that makes KeyStore keys fundamentally different from keys stored in files or memory.

**Key takeaway:** Use StrongBox for your most sensitive keys and fall back to TEE when StrongBox isn't available. The key extraction prevention — not the encryption itself — is what makes KeyStore irreplaceable.

### Lesson 2.5: KeyChain vs KeyStore

Android provides two key management APIs that are often confused: `KeyChain` and `KeyStore`. They serve different purposes and have different security models. **KeyChain** provides system-wide credential storage — certificates and private keys that any app on the device can request access to (with user consent). It's designed for VPN certificates, email signing certificates, and Wi-Fi enterprise authentication. When an app calls `KeyChain.choosePrivateKeyAlias()`, the user sees a system dialog listing available credentials and chooses which one to share.

**KeyStore** provides app-private key storage — keys generated in the KeyStore are accessible only to the app that created them. There's no system UI for sharing KeyStore keys between apps. This is the right choice for the vast majority of app-level encryption needs: encrypting local data, signing API requests, protecting auth tokens. The keys are tied to your app's UID and cannot be accessed by other apps, even on rooted devices (because the TEE/StrongBox enforces access control independently of the Android OS).

The decision is simple: use KeyChain when you need system-level credential sharing (enterprise apps, VPN clients, certificate-based authentication). Use KeyStore for everything else. In my experience, 95% of apps should use KeyStore exclusively. The only time I've used KeyChain was in an enterprise MDM app that needed to install client certificates for mutual TLS authentication with corporate servers.

**Key takeaway:** Use KeyStore for app-specific keys (most apps). Use KeyChain only when credentials need to be shared across apps with user consent (enterprise/VPN scenarios).

### Lesson 2.6: Key Authentication and Access Control

KeyStore keys can be configured with authentication requirements that control when and how the key can be used. This is one of the most powerful security features on Android — you can create keys that are literally unusable without biometric verification or screen lock authentication. The TEE or StrongBox will refuse to perform any operation with the key until the user authenticates.

```kotlin
fun generateAuthenticatedKey(alias: String, authTimeoutSeconds: Int): SecretKey {
    val keyGenerator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES,
        "AndroidKeyStore"
    )

    val builder = KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setUserAuthenticationRequired(true)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        builder.setUserAuthenticationParameters(
            authTimeoutSeconds,
            KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
        )
    } else {
        @Suppress("DEPRECATION")
        builder.setUserAuthenticationValidityDurationSeconds(authTimeoutSeconds)
    }

    keyGenerator.init(builder.build())
    return keyGenerator.generateKey()
}

fun generateBiometricOnlyKey(alias: String): SecretKey {
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
            .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setInvalidatedByBiometricEnrollment(true)
            .build()
    )
    return keyGenerator.generateKey()
}
```

The `authTimeoutSeconds` parameter controls the authentication window. A value of `0` means the user must authenticate for every single operation — ideal for payment authorization. A value of `300` (5 minutes) means the user authenticates once and can use the key freely for the next 5 minutes — good for session-based access to sensitive data. `setInvalidatedByBiometricEnrollment(true)` is crucial for high-security keys: if the user adds a new fingerprint, the key is permanently invalidated. This prevents the scenario where an attacker adds their fingerprint to an unlocked device and then uses it to access biometric-gated keys.

Once a key's authentication mode is set during creation, it cannot be changed. To change the authentication requirements, you must delete the key and create a new one. This is a deliberate security design — it prevents runtime modification of key access policies.

**Key takeaway:** Use `setUserAuthenticationRequired(true)` for sensitive keys and configure the timeout based on your security needs. For payment-grade security, use timeout 0 with `BIOMETRIC_STRONG` and invalidate on new biometric enrollment.

### Quiz: Cryptography and KeyStore

#### What is the recommended encryption mode for AES on Android?

- ❌ CBC (Cipher Block Chaining)
- ❌ ECB (Electronic Codebook)
- ✅ GCM (Galois/Counter Mode)
- ❌ CTR (Counter Mode)

> **Explanation:** GCM provides authenticated encryption — both confidentiality and integrity. CBC only provides confidentiality (an attacker can modify ciphertext without detection). ECB is fundamentally broken for most use cases because identical plaintext blocks produce identical ciphertext blocks. CTR provides confidentiality but not integrity. GCM is the recommended mode for virtually all Android encryption needs.

#### Why should you never generate your own IV for AES-GCM?

- ❌ Custom IVs are slower than system-generated ones
- ❌ The system IV is encrypted, custom IVs are not
- ✅ Reusing an IV with the same key completely breaks GCM's security, and the system guarantees uniqueness
- ❌ Custom IVs are not compatible with the Android Keystore

> **Explanation:** GCM's security critically depends on IV uniqueness — if you reuse an IV with the same key, an attacker can recover the authentication key and forge messages. When you let the Cipher generate the IV, it uses a cryptographically secure random number generator, making accidental reuse astronomically unlikely. Manually managing IVs introduces the risk of accidental reuse.

#### What happens when you call `setInvalidatedByBiometricEnrollment(true)` on a key?

- ❌ The key requires fingerprint authentication for every use
- ❌ The key is encrypted with the user's biometric data
- ✅ The key becomes permanently unusable if a new biometric is enrolled on the device
- ❌ The key is automatically deleted after 30 days

> **Explanation:** This setting protects against an attacker adding their biometric to an unlocked device. If a new fingerprint or face is enrolled, the key is permanently invalidated — it can never be used again, even with the original biometric. This is critical for payment or authentication keys where you need assurance that only the original enrolled biometrics can authorize operations.

### Coding Challenge: Full Encryption Manager

Build a complete `EncryptionManager` that generates KeyStore-backed keys, encrypts/decrypts strings, handles key rotation, and stores encrypted data with metadata (IV, creation timestamp).

#### Solution

```kotlin
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class EncryptionManager {

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128
    }

    private val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    fun generateKey(alias: String, requireAuth: Boolean = false): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, KEYSTORE
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(requireAuth)
                .build()
        )
        return keyGenerator.generateKey()
    }

    fun encrypt(plaintext: String, keyAlias: String): String {
        val key = getKey(keyAlias) ?: generateKey(keyAlias)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)

        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        val payload = JSONObject().apply {
            put("ct", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            put("ts", System.currentTimeMillis())
            put("v", 1) // Schema version for future migration
        }
        return payload.toString()
    }

    fun decrypt(encryptedPayload: String, keyAlias: String): String? {
        return try {
            val payload = JSONObject(encryptedPayload)
            val ciphertext = Base64.decode(payload.getString("ct"), Base64.NO_WRAP)
            val iv = Base64.decode(payload.getString("iv"), Base64.NO_WRAP)

            val key = getKey(keyAlias) ?: return null
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH, iv))

            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (e: Exception) {
            null // Tampered data, missing key, or schema mismatch
        }
    }

    fun rotateKey(oldAlias: String, newAlias: String, data: List<String>): List<String> {
        val decrypted = data.mapNotNull { decrypt(it, oldAlias) }
        deleteKey(oldAlias)
        generateKey(newAlias)
        return decrypted.map { encrypt(it, newAlias) }
    }

    private fun getKey(alias: String): SecretKey? {
        if (!keyStore.containsAlias(alias)) return null
        return (keyStore.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey
    }

    fun deleteKey(alias: String) {
        if (keyStore.containsAlias(alias)) {
            keyStore.deleteEntry(alias)
        }
    }
}
```

This manager handles the full key lifecycle: generation, encryption with metadata packaging, decryption with integrity validation, and key rotation. The JSON payload format stores the IV, timestamp, and schema version alongside the ciphertext, making it self-describing and forward-compatible. The `rotateKey` function decrypts all data with the old key, deletes it, and re-encrypts with a new key — essential for periodic key rotation policies.

---

## Module 3: Secure Data Storage

Storage is where most Android security failures happen. The most common concern is saving data on a device in a way that's accessible to other apps or extractable from a rooted device. Android provides three fundamental storage locations — internal storage (app-private), external storage (shared), and content providers (cross-app) — and each has different security characteristics.

### Lesson 3.1: Internal vs External Storage Security

Internal storage is the app's private directory under `/data/data/<package>/`. Files here are only accessible to your app's process — the Linux kernel enforces this through file ownership and permissions. In terms of security, internal storage is safe for private data because other apps literally cannot read it (unless the device is rooted). External storage — SD cards and shared directories — is globally readable and writable. Any app with the `READ_EXTERNAL_STORAGE` permission can access files there.

The security implication is clear: never store sensitive data on external storage unless it's encrypted. Even with Android's Scoped Storage restrictions (introduced in Android 10), files in shared directories are accessible to apps that request the appropriate permissions. If you must write to external storage — for exports, shared documents, or media — encrypt the content using a KeyStore-backed key before writing.

Since Android 10, all devices encrypt user data on the filesystem by default using File-Based Encryption (FBE). This means your app's internal storage files are encrypted at rest when the device is locked. However, this protection disappears once the user unlocks the device. After unlock, any process running as your app's UID can read those files in plaintext. That's why application-level encryption (using EncryptedSharedPreferences or SQLCipher) still matters for highly sensitive data — it adds a layer that survives device unlock.

**Key takeaway:** Use internal storage for private data — it's kernel-protected. Never store sensitive data on external storage unencrypted. Filesystem encryption protects against physical theft but not against a running exploit — add application-level encryption for sensitive data.

### Lesson 3.2: EncryptedSharedPreferences

Google's `EncryptedSharedPreferences` from the Jetpack Security library wraps standard SharedPreferences with automatic encryption. Both keys and values are encrypted before being written to disk — an attacker who extracts the XML file from a rooted device sees only ciphertext, not even the preference names. Under the hood, `MasterKey` generates an AES-256 key in the KeyStore, and `EncryptedSharedPreferences` derives separate encryption keys for preference keys (AES256-SIV for deterministic lookups) and values (AES256-GCM with random nonces).

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

    fun getAuthToken(): String? = securePrefs.getString("auth_token", null)

    fun saveTokenWithExpiry(token: String, expiryMillis: Long) {
        securePrefs.edit {
            putString("auth_token", token)
            putLong("auth_token_expiry", System.currentTimeMillis() + expiryMillis)
        }
    }

    fun getValidToken(): String? {
        val expiry = securePrefs.getLong("auth_token_expiry", 0)
        if (System.currentTimeMillis() > expiry) {
            clearSession()
            return null
        }
        return securePrefs.getString("auth_token", null)
    }

    fun clearSession() {
        securePrefs.edit { clear() }
    }
}
```

One gotcha I've hit in production: `EncryptedSharedPreferences.create()` is expensive on first call. Initializing the KeyStore, generating the master key, and setting up encryption schemes can take 200-500ms on low-end devices. Don't call it on the main thread during startup. The `lazy` delegate in this code ensures initialization only happens when first accessed, and you should access it from a background coroutine.

There's an important nuance about DataStore vs EncryptedSharedPreferences. DataStore is Google's recommended replacement for SharedPreferences, but as of now, there's no official encrypted DataStore variant. The data saved within DataStore is stored in the app's sandboxed folder, and since Android 10, the filesystem encrypts it by default. So the question becomes: how much additional value does application-level encryption add? For most apps, filesystem encryption is sufficient. For apps handling financial data, medical records, or authentication tokens, the additional layer of EncryptedSharedPreferences is worth the complexity.

**Key takeaway:** Use `EncryptedSharedPreferences` for sensitive key-value data like auth tokens and user credentials. Initialize it lazily on a background thread — the first creation is expensive.

### Lesson 3.3: Encrypted Databases with SQLCipher

For structured sensitive data stored in Room databases, SQLCipher provides transparent full-database encryption. The entire database file is encrypted — table names, column names, data, indices, everything. Even if an attacker extracts the `.db` file from a rooted device, it's unreadable without the passphrase. The `android-database-sqlcipher` library integrates seamlessly with Room by providing a `SupportFactory` that replaces Room's default `SupportSQLiteOpenHelper.Factory`.

```kotlin
class SecureDatabaseProvider(
    private val context: Context,
    private val keyStoreManager: KeyStoreManager
) {
    fun buildEncryptedDatabase(): AppDatabase {
        // Derive passphrase from a KeyStore-backed key
        val key = keyStoreManager.getOrCreateKey("db_encryption_key")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val passphrase = cipher.doFinal("db_passphrase_seed".toByteArray())

        val factory = SupportFactory(passphrase)

        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "encrypted_app.db"
        )
            .openHelperFactory(factory)
            .build()
    }
}
```

The critical detail is the passphrase source. Never hardcode the passphrase as a string literal — that defeats the entire purpose of encryption. Instead, derive it from a KeyStore-backed key. In this code, we encrypt a fixed seed with a KeyStore key to produce the passphrase. The passphrase is deterministic (same key + same seed = same passphrase) but can't be derived without access to the KeyStore key, which is hardware-protected.

The performance overhead of SQLCipher is roughly 5-15% on queries, depending on dataset size. For most apps, this is acceptable. For apps with heavy database operations (thousands of records, complex joins), benchmark with your actual data before committing. One alternative is encrypting only specific sensitive columns rather than the entire database — store the encrypted values as BLOB columns and decrypt at the repository layer.

**Key takeaway:** Use SQLCipher with Room for databases containing sensitive data. Derive the passphrase from a KeyStore-backed key — never hardcode it.

### Lesson 3.4: Secure File Encryption

For encrypting arbitrary files — documents, images, exported data, cached content — use the Jetpack Security library's `EncryptedFile` API or implement KeyStore-backed AES-GCM directly. `EncryptedFile` provides a streaming encryption API that handles the complexity of chunked encryption, making it suitable for large files that shouldn't be loaded entirely into memory.

```kotlin
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import java.io.File

class SecureFileManager(private val context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    fun writeEncryptedFile(filename: String, data: ByteArray) {
        val file = File(context.filesDir, filename)
        if (file.exists()) file.delete() // EncryptedFile won't overwrite

        val encryptedFile = EncryptedFile.Builder(
            context,
            file,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build()

        encryptedFile.openFileOutput().use { outputStream ->
            outputStream.write(data)
        }
    }

    fun readEncryptedFile(filename: String): ByteArray? {
        val file = File(context.filesDir, filename)
        if (!file.exists()) return null

        val encryptedFile = EncryptedFile.Builder(
            context,
            file,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build()

        return encryptedFile.openFileInput().use { inputStream ->
            inputStream.readBytes()
        }
    }

    fun deleteSecureFile(filename: String): Boolean {
        val file = File(context.filesDir, filename)
        return if (file.exists()) file.delete() else false
    }
}
```

The `AES256_GCM_HKDF_4KB` scheme encrypts the file in 4KB chunks, each with its own authentication tag. This means the file can be read and verified incrementally without loading the entire file into memory. If any chunk has been tampered with, decryption fails immediately for that chunk. This is significantly better than encrypting the entire file as a single block, which would require loading the complete file into memory for both encryption and decryption.

One practical limitation: `EncryptedFile` does not support overwriting existing files. You must delete the file before creating a new one. This means updates to encrypted files are not atomic — there's a brief window between delete and write where the data doesn't exist. For critical data, write to a temporary encrypted file first, then rename it over the original.

**Key takeaway:** Use `EncryptedFile` for file-level encryption with streaming support. It handles chunked encryption automatically, making it suitable for large files without loading them entirely into memory.

### Lesson 3.5: Securing Content Providers

Content providers are one of the most dangerous attack surfaces on Android if misconfigured. A ContentProvider with `android:exported="true"` and no permissions allows any app on the device to query, insert, update, or delete data. I've seen production apps where sensitive user data was accessible through an exported provider because the developer forgot to set permissions.

```kotlin
class SecureDataProvider : ContentProvider() {

    companion object {
        const val AUTHORITY = "com.yourapp.provider.data"
        private const val PATH_USERS = "users"
        private const val PATH_USER_ID = "users/*"
        private const val USERS = 1
        private const val USER_BY_ID = 2

        private val uriMatcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(AUTHORITY, PATH_USERS, USERS)
            addURI(AUTHORITY, PATH_USER_ID, USER_BY_ID)
        }
    }

    override fun query(
        uri: Uri,
        projection: Array<String>?,
        selection: String?,
        selectionArgs: Array<String>?,
        sortOrder: String?
    ): Cursor? {
        enforceSecureAccess(uri)
        validateProjection(projection)

        return when (uriMatcher.match(uri)) {
            USERS -> queryAllUsers(projection, selectionArgs, sortOrder)
            USER_BY_ID -> queryUserById(uri.lastPathSegment!!, projection)
            else -> throw IllegalArgumentException("Unknown URI: $uri")
        }
    }

    private fun enforceSecureAccess(uri: Uri) {
        // Validate path to prevent traversal attacks
        val path = uri.path ?: throw SecurityException("Null URI path")
        if (path.contains("..") || path.contains("//")) {
            throw SecurityException("Path traversal detected: $path")
        }

        // Enforce permission
        context?.enforceCallingOrSelfPermission(
            "com.yourapp.permission.READ_DATA",
            "Read permission required to access user data"
        )
    }

    private fun validateProjection(projection: Array<String>?) {
        val allowedColumns = setOf("id", "name", "email_hash")
        projection?.forEach { column ->
            if (column !in allowedColumns) {
                throw IllegalArgumentException("Column not allowed: $column")
            }
        }
    }

    override fun onCreate(): Boolean = true
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?) = 0
    override fun delete(uri: Uri, s: String?, a: Array<String>?) = 0
    override fun getType(uri: Uri): String = "vnd.android.cursor.dir/vnd.$AUTHORITY.users"

    private fun queryAllUsers(p: Array<String>?, sa: Array<String>?, so: String?): Cursor? = null
    private fun queryUserById(id: String, p: Array<String>?): Cursor? = null
}
```

Three layers of defense operate here. First, path validation rejects any URI containing `..` or `//` to prevent path traversal attacks. Second, `enforceCallingOrSelfPermission` verifies the calling app has the required custom permission. Third, projection validation restricts which columns can be queried — notice we expose `email_hash` instead of the actual email address, following the data minimization principle. If the provider only exposes hashed or anonymized data, even a successful attack yields limited value.

Since Android 12, the `android:exported` attribute must be explicitly declared for any component with an intent filter. Default to `exported="false"` unless the provider genuinely needs cross-app access. For providers used only within your app, there's no reason to export them at all.

**Key takeaway:** Default ContentProviders to `exported="false"`. When export is necessary, enforce custom permissions, validate URI paths, and restrict queryable columns. Expose hashed data instead of raw PII where possible.

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

#### Why should you derive SQLCipher's passphrase from a KeyStore key rather than hardcoding it?

- ❌ Hardcoded passphrases make the database slower
- ❌ KeyStore passphrases are automatically rotated
- ✅ A hardcoded passphrase can be extracted by decompiling the APK, defeating the encryption
- ❌ Room requires KeyStore-backed passphrases

> **Explanation:** If the SQLCipher passphrase is a string literal in your code, R8 won't encrypt it — anyone who decompiles your APK with jadx can read the passphrase and decrypt the database. Deriving the passphrase from a KeyStore-backed key means the passphrase can only be produced by the secure hardware on the specific device, making database extraction from backups or rooted devices useless.

#### What advantage does EncryptedFile's chunked encryption provide?

- ❌ Faster encryption speed
- ✅ Files can be read and verified incrementally without loading the entire file into memory
- ❌ Automatic file compression
- ❌ Cross-device portability of encrypted files

> **Explanation:** The `AES256_GCM_HKDF_4KB` scheme encrypts files in 4KB chunks, each with its own authentication tag. This allows streaming reads — if a 100MB file has a tampered chunk at the end, you detect it when you reach that chunk, not after loading the entire file into memory. It also means encryption and decryption can work with streaming I/O, critical for large files on memory-constrained devices.

### Coding Challenge: Secure Key-Value Store with TTL

Build a `SecureStorage` class that wraps EncryptedSharedPreferences with automatic expiry, type-safe accessors, and secure deletion.

#### Solution

```kotlin
import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureStorage private constructor(
    private val prefs: SharedPreferences
) {
    companion object {
        @Volatile
        private var instance: SecureStorage? = null

        fun getInstance(context: Context): SecureStorage {
            return instance ?: synchronized(this) {
                instance ?: createInstance(context.applicationContext).also {
                    instance = it
                }
            }
        }

        private fun createInstance(context: Context): SecureStorage {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            val prefs = EncryptedSharedPreferences.create(
                context,
                "secure_kv_store",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            return SecureStorage(prefs)
        }
    }

    fun putString(key: String, value: String, ttlMillis: Long = 0) {
        prefs.edit()
            .putString(key, value)
            .putLong("${key}__expiry", if (ttlMillis > 0) {
                System.currentTimeMillis() + ttlMillis
            } else {
                Long.MAX_VALUE
            })
            .apply()
    }

    fun getString(key: String): String? {
        if (isExpired(key)) {
            remove(key)
            return null
        }
        return prefs.getString(key, null)
    }

    fun putLong(key: String, value: Long, ttlMillis: Long = 0) {
        prefs.edit()
            .putLong(key, value)
            .putLong("${key}__expiry", if (ttlMillis > 0) {
                System.currentTimeMillis() + ttlMillis
            } else {
                Long.MAX_VALUE
            })
            .apply()
    }

    fun getLong(key: String, default: Long = 0): Long {
        if (isExpired(key)) {
            remove(key)
            return default
        }
        return prefs.getLong(key, default)
    }

    fun putBoolean(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }

    fun getBoolean(key: String, default: Boolean = false): Boolean {
        return prefs.getBoolean(key, default)
    }

    private fun isExpired(key: String): Boolean {
        val expiry = prefs.getLong("${key}__expiry", Long.MAX_VALUE)
        return System.currentTimeMillis() > expiry
    }

    fun remove(key: String) {
        prefs.edit()
            .remove(key)
            .remove("${key}__expiry")
            .apply()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
    }

    fun contains(key: String): Boolean {
        if (isExpired(key)) {
            remove(key)
            return false
        }
        return prefs.contains(key)
    }
}

// Usage
val storage = SecureStorage.getInstance(context)
storage.putString("auth_token", token, ttlMillis = 30 * 60 * 1000L) // 30 min TTL
val token = storage.getString("auth_token") // Returns null if expired
```

This class provides thread-safe singleton access, type-safe getters/setters, automatic TTL-based expiry, and clean removal of both data and metadata. The double-underscore suffix (`__expiry`) avoids collision with user-chosen key names. Expired values are cleaned up on read, ensuring stale sensitive data doesn't persist on disk.

---

## Module 4: Network Security

Network transactions are the riskiest part of mobile security because they involve sending or receiving sensitive data over channels you don't fully control. An attacker on the same Wi-Fi network, a compromised router, or a rogue corporate proxy can all intercept traffic. Every API call carrying an auth token, every response containing user data, and every WebSocket message with real-time updates is a potential target.

### Lesson 4.1: TLS and HTTPS Fundamentals

HTTPS (HTTP over TLS) encrypts the communication channel between your app and the server, preventing eavesdroppers from reading the traffic. But HTTPS alone isn't enough. The TLS handshake relies on a chain of trust rooted in Certificate Authorities (CAs) — the device ships with a pre-installed set of trusted CA certificates, and any CA in that set can issue a certificate for any domain. This means a compromised CA, a government-mandated CA, or a corporate proxy that installs its own CA certificate on the device can all issue valid certificates for your API domain and intercept traffic transparently.

The minimum bar for production apps is to disable cleartext traffic entirely and enforce HTTPS for all connections. This prevents accidental use of HTTP URLs — a single misconfigured URL pointing to `http://` instead of `https://` can silently transmit auth tokens in plaintext. The Network Security Configuration file makes this declarative.

On Android, SMS is sometimes used for authentication (OTP codes), but SMS itself is not encrypted and should never be relied on for secure communication. SMS can be intercepted through SS7 attacks, SIM swapping, or malware with `READ_SMS` permission. For push notifications, use an encrypted protocol like Firebase Cloud Messaging (FCM) rather than SMS-based notification systems.

**Key takeaway:** HTTPS is the minimum bar, not the finish line. Disable cleartext traffic, but understand that TLS trusts the entire CA ecosystem — certificate pinning adds the restriction that only YOUR certificate is accepted.

### Lesson 4.2: Network Security Configuration

Android's Network Security Configuration is a declarative XML file that controls your app's network security behavior without writing code. It's the Android team's recommended mechanism for configuring trust anchors, certificate pins, and cleartext traffic policies. The configuration applies to all network traffic from your app, including libraries — you don't need to configure each HTTP client separately.

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <!-- Block all cleartext HTTP traffic by default -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Pin certificates for your primary API -->
    <domain-config>
        <domain includeSubdomains="true">api.yourapp.com</domain>
        <pin-set expiration="2026-06-01">
            <pin digest="SHA-256">base64EncodedPrimaryPin==</pin>
            <pin digest="SHA-256">base64EncodedBackupPin==</pin>
        </pin-set>
    </domain-config>

    <!-- Allow cleartext only for specific debug domains -->
    <domain-config cleartextTrafficPermitted="true">
        <domain>10.0.2.2</domain> <!-- Android emulator localhost -->
    </domain-config>

    <!-- Debug overrides for Charles/Proxyman during development -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

The `expiration` attribute on `pin-set` is a safety valve. If your certificate rotates before you push an app update, the expired pin-set falls back to standard CA validation instead of bricking your app's networking. Without expiration, a certificate rotation could lock out every user who hasn't updated — a catastrophic failure mode. Always include an expiration date far enough in the future to give you time to update, but not so far that it's meaningless.

The `debug-overrides` section is invaluable for development. It allows your debug builds to trust user-installed certificates (from proxying tools like Charles or Proxyman) without affecting release builds. This means you can inspect your API traffic during development without weakening production security.

**Key takeaway:** Use Network Security Configuration to centralize your network security policy. Set certificate pin expiration dates as a safety valve. Use debug-overrides for proxy tools — never weaken production security for development convenience.

### Lesson 4.3: Certificate Pinning with OkHttp

While the Network Security Configuration handles most pinning needs, OkHttp's `CertificatePinner` provides programmatic control when you need dynamic pin management or more granular error handling. The two approaches can coexist — the NSC provides the baseline, and OkHttp adds application-level verification.

```kotlin
object SecureNetworkClient {

    fun buildPinnedClient(
        domain: String,
        pins: List<String>
    ): OkHttpClient {
        val pinnerBuilder = CertificatePinner.Builder()
        pins.forEach { pin ->
            pinnerBuilder.add(domain, "sha256/$pin")
        }

        return OkHttpClient.Builder()
            .certificatePinner(pinnerBuilder.build())
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(SecurityHeadersInterceptor())
            .build()
    }
}

class SecurityHeadersInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder()
            .addHeader("X-Content-Type-Options", "nosniff")
            .addHeader("X-Frame-Options", "DENY")
            .build()

        val response = chain.proceed(request)

        // Validate response security headers
        val strictTransport = response.header("Strict-Transport-Security")
        if (strictTransport == null) {
            // Log warning — server should send HSTS header
        }

        return response
    }
}
```

A critical mistake I've seen is pinning to the leaf certificate instead of the intermediate or root certificate. Leaf certificates rotate frequently (often annually), and if your pin targets the leaf, every rotation requires an app update. Pinning to the intermediate CA certificate gives you stability across leaf rotations while still preventing attacks from other CAs. The tradeoff is that if the intermediate CA is compromised, the pin doesn't protect you — but intermediate CA compromises are extremely rare compared to leaf certificate rotations.

Always include at least two pins — a primary and a backup. The backup should be the hash of a different certificate in your CA chain (like the intermediate when you pin the leaf, or a future certificate you've generated but not yet deployed). Without a backup, a certificate rotation without an app update bricks your app's networking for all users on the old version.

**Key takeaway:** Pin to the intermediate certificate for stability across leaf rotations. Always include a backup pin. Without one, certificate rotation can permanently break networking for users who haven't updated.

### Lesson 4.4: Secure API Communication

How you handle authentication tokens, headers, and logging in your HTTP client has direct security implications. Auth tokens in logs, sensitive headers in crash reports, and unredacted request bodies are all common ways sensitive data leaks in production.

```kotlin
class SecureAuthInterceptor(
    private val tokenManager: TokenManager,
    private val authRefresher: AuthRefresher
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenManager.getAccessToken()
            ?: throw AuthenticationException("No valid token available")

        val request = chain.request().newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()

        val response = chain.proceed(request)

        // Handle token expiry transparently
        if (response.code == 401) {
            response.close()
            val newToken = authRefresher.refreshToken()
                ?: throw AuthenticationException("Token refresh failed")

            tokenManager.saveAccessToken(newToken)

            val retryRequest = chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $newToken")
                .build()
            return chain.proceed(retryRequest)
        }

        return response
    }
}

class SecureLoggingInterceptor(private val isDebug: Boolean) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        if (!isDebug) return chain.proceed(chain.request())

        val request = chain.request()
        val redactedHeaders = request.headers.newBuilder()
            .removeAll("Authorization")
            .removeAll("Cookie")
            .removeAll("X-Api-Key")
            .build()

        // Log only non-sensitive information
        Log.d("Network", "${request.method} ${request.url}")
        Log.d("Network", "Headers: $redactedHeaders")

        val response = chain.proceed(request)
        Log.d("Network", "Response: ${response.code} for ${request.url}")

        return response
    }
}
```

The auth interceptor handles 401 responses by transparently refreshing the token and retrying the request. This is critical for apps using short-lived access tokens with refresh tokens — without this, every expired token would surface as a user-facing error. The logging interceptor strips sensitive headers entirely in debug builds and does nothing in release builds. Never rely on `HttpLoggingInterceptor.Level.NONE` alone — a misconfiguration or a developer changing the level could leak tokens.

**Key takeaway:** Never log auth tokens, cookies, or API keys. Handle token expiry transparently with retry logic. Disable all network logging in release builds — one leaked token in a crash report can compromise a user's account.

### Lesson 4.5: WebView Security

WebView is a frequently overlooked attack surface. When your app displays web content, it creates a bridge between native code and JavaScript that attackers can exploit. JavaScript injection, insecure URL loading, and improper intent handling in WebViews have led to real-world exploits in production apps.

```kotlin
class SecureWebViewSetup {

    fun configureSecureWebView(webView: WebView) {
        webView.settings.apply {
            javaScriptEnabled = false // Enable only if absolutely required
            allowFileAccess = false
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            domStorageEnabled = false
            databaseEnabled = false
            setGeolocationEnabled(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                // Only allow HTTPS URLs on your domain
                if (url.scheme != "https") return true
                if (!url.host.orEmpty().endsWith(".yourapp.com")) {
                    // Open external URLs in the browser, not the WebView
                    view.context.startActivity(Intent(Intent.ACTION_VIEW, url))
                    return true
                }
                return false
            }
        }
    }

    fun configureWebViewWithJavaScript(
        webView: WebView,
        allowedDomain: String
    ) {
        webView.settings.apply {
            javaScriptEnabled = true // Required for this use case
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        // Never expose sensitive native functions to JavaScript
        // webView.addJavascriptInterface(bridge, "AppBridge") // DANGEROUS

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                return !request.url.host.orEmpty().endsWith(allowedDomain)
            }
        }
    }
}
```

The rule of thumb is: disable JavaScript unless you absolutely need it. Every `addJavascriptInterface` call creates a bridge that JavaScript in the WebView can call, and if the WebView loads content you don't control (user-generated HTML, third-party pages), malicious JavaScript can invoke those native methods. If you must use JavaScript interfaces, annotate methods with `@JavascriptInterface` and validate every input from the JavaScript side.

Setting `mixedContentMode = MIXED_CONTENT_NEVER_ALLOW` prevents the WebView from loading HTTP resources on an HTTPS page, which would allow an attacker to inject malicious content through the insecure HTTP resource. Disabling file access prevents JavaScript from reading files from the device's filesystem through `file://` URLs.

**Key takeaway:** Disable JavaScript in WebViews unless absolutely necessary. Never expose sensitive native functions via `addJavascriptInterface`. Block mixed content and file access to prevent content injection and local file exfiltration.

### Lesson 4.6: Secure WebSocket and Real-Time Communication

For apps using WebSocket connections (chat, live updates, real-time collaboration), the same TLS and authentication principles apply — but with additional considerations for persistent connections that may run for hours.

```kotlin
class SecureWebSocketManager(
    private val client: OkHttpClient,
    private val tokenManager: TokenManager
) {
    private var webSocket: WebSocket? = null

    fun connect(url: String, listener: WebSocketListener) {
        val token = tokenManager.getAccessToken()
            ?: throw AuthenticationException("No valid token")

        // Always use wss:// (WebSocket Secure), never ws://
        val secureUrl = url.replace("ws://", "wss://")

        val request = Request.Builder()
            .url(secureUrl)
            .addHeader("Authorization", "Bearer $token")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                listener.onOpen(ws, response)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                // Validate and sanitize incoming messages
                if (isValidMessage(text)) {
                    listener.onMessage(ws, text)
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                if (response?.code == 401) {
                    // Re-authenticate and reconnect
                    reconnectWithFreshToken(url, listener)
                } else {
                    listener.onFailure(ws, t, response)
                }
            }
        })
    }

    private fun isValidMessage(message: String): Boolean {
        return try {
            // Validate JSON structure, check message type
            val json = JSONObject(message)
            json.has("type") && json.has("payload")
        } catch (e: Exception) {
            false
        }
    }

    private fun reconnectWithFreshToken(url: String, listener: WebSocketListener) {
        disconnect()
        tokenManager.refreshAccessToken()
        connect(url, listener)
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
    }
}
```

WebSocket connections should always use `wss://` (WebSocket Secure) rather than `ws://`. The certificate pinning configured on your OkHttp client applies to WebSocket connections too, so the same pinned client protects both REST API calls and WebSocket connections. Validate incoming WebSocket messages — a compromised or spoofed server could send malformed messages designed to crash your parser or trigger unexpected behavior.

**Key takeaway:** Always use `wss://` for WebSocket connections. Validate incoming messages. Handle 401 responses with transparent re-authentication, just like REST APIs.

### Quiz: Network Security

#### What is the primary purpose of certificate pinning?

- ❌ To encrypt network traffic using TLS
- ❌ To speed up HTTPS handshakes
- ✅ To ensure only your specific certificate is trusted, preventing MitM attacks from compromised CAs
- ❌ To replace the need for HTTPS entirely

> **Explanation:** Certificate pinning restricts which certificates your app trusts for a specific domain. Without pinning, any CA-issued certificate is accepted — meaning a compromised CA or a corporate proxy could issue a valid certificate and intercept your traffic. Pinning ensures only YOUR certificate (or its public key) is accepted.

#### Why should you pin to the intermediate certificate rather than the leaf certificate?

- ❌ Intermediate certificates are more secure
- ❌ Intermediate certificates are faster to verify
- ✅ Leaf certificates rotate frequently, while intermediate certificates are stable, reducing forced app updates
- ❌ Android requires intermediate certificate pinning

> **Explanation:** Leaf certificates typically rotate annually, and each rotation would require an app update if you pin to the leaf. Pinning to the intermediate CA certificate provides stability across leaf rotations while still preventing attacks from other CAs. The tradeoff is slightly broader trust within that CA, but it eliminates the operational risk of certificate rotation breaking live apps.

#### What does `cleartextTrafficPermitted="false"` do in the Network Security Configuration?

- ❌ Disables all network traffic
- ✅ Blocks all unencrypted HTTP connections, allowing only HTTPS
- ❌ Enables certificate pinning automatically
- ❌ Encrypts DNS queries

> **Explanation:** Setting `cleartextTrafficPermitted="false"` prevents your app from making any unencrypted HTTP connections. All network traffic must use HTTPS (TLS). This is a defense-in-depth measure that protects against accidental use of HTTP URLs.

#### Why should JavaScript be disabled in WebViews by default?

- ❌ JavaScript makes WebViews slower
- ❌ JavaScript is deprecated in Android WebView
- ✅ Enabled JavaScript with `addJavascriptInterface` creates a bridge that malicious scripts can exploit to call native functions
- ❌ JavaScript prevents certificate pinning from working

> **Explanation:** Every `addJavascriptInterface` call creates a native bridge accessible from JavaScript. If the WebView loads content you don't fully control, malicious JavaScript can invoke native methods, potentially accessing sensitive data or triggering actions the user didn't authorize. Keep JavaScript disabled unless the specific use case requires it.

### Coding Challenge: Secure OkHttp Client Builder

Create a factory function that builds a production-ready OkHttp client with certificate pinning, auth token injection, sensitive header redaction, and configurable timeouts.

#### Solution

```kotlin
import okhttp3.CertificatePinner
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class SecureClientFactory(
    private val tokenManager: TokenManager,
    private val authRefresher: AuthRefresher
) {
    fun createClient(
        domain: String,
        primaryPin: String,
        backupPin: String,
        isDebug: Boolean = false
    ): OkHttpClient {
        val certificatePinner = CertificatePinner.Builder()
            .add(domain, "sha256/$primaryPin")
            .add(domain, "sha256/$backupPin")
            .build()

        val builder = OkHttpClient.Builder()
            .certificatePinner(certificatePinner)
            .addInterceptor(SecureAuthInterceptor(tokenManager, authRefresher))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        if (isDebug) {
            builder.addInterceptor(SecureLoggingInterceptor(isDebug = true))
        }

        return builder.build()
    }
}
```

This factory encapsulates network security best practices in a single reusable builder: certificate pinning with backup, auth interceptor with transparent 401 retry, and logging only in debug builds with sensitive headers redacted. The factory pattern keeps security configuration consistent across all network clients in your app.

---

## Module 5: Authentication and Biometrics

Authentication is the gateway to your app's sensitive features. A weak authentication implementation doesn't just expose one piece of data — it compromises everything behind the login wall. The choices you make about token storage, session management, biometric integration, and credential handling determine whether an attacker who compromises one aspect of your app can escalate to full account takeover.

### Lesson 5.1: Authentication Architecture

The foundation of secure authentication is the separation of concerns: the server authenticates the user (verifies credentials), the client stores the proof of authentication (tokens), and both sides enforce session boundaries (expiry, revocation). The client should never store raw credentials — no username/password in SharedPreferences, no password hashes on disk. Instead, authenticate once, receive short-lived tokens, and refresh them as needed.

```kotlin
class AuthManager(
    private val authApi: AuthApi,
    private val tokenManager: TokenManager,
    private val secureStorage: SecureStorage
) {
    suspend fun login(email: String, password: String): AuthResult {
        return try {
            val response = authApi.authenticate(
                AuthRequest(email = email, password = password)
            )

            // Store tokens securely — never store the password
            tokenManager.saveTokens(
                accessToken = response.accessToken,
                refreshToken = response.refreshToken,
                expiresIn = response.expiresIn
            )

            // Store user ID for session verification
            secureStorage.putString("user_id", response.userId)

            AuthResult.Success(response.userId)
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> AuthResult.InvalidCredentials
                429 -> AuthResult.RateLimited
                else -> AuthResult.NetworkError(e.message())
            }
        } catch (e: Exception) {
            AuthResult.NetworkError(e.message ?: "Unknown error")
        }
    }

    suspend fun logout() {
        try {
            // Notify server to invalidate refresh token
            authApi.logout(tokenManager.getRefreshToken() ?: "")
        } catch (e: Exception) {
            // Server-side invalidation is best effort
        } finally {
            // Always clear local tokens regardless of server response
            tokenManager.clearTokens()
            secureStorage.remove("user_id")
        }
    }

    fun isSessionValid(): Boolean {
        val token = tokenManager.getAccessToken() ?: return false
        val userId = secureStorage.getString("user_id") ?: return false
        return userId.isNotEmpty() && token.isNotEmpty()
    }
}

sealed class AuthResult {
    data class Success(val userId: String) : AuthResult()
    data object InvalidCredentials : AuthResult()
    data object RateLimited : AuthResult()
    data class NetworkError(val message: String) : AuthResult()
}
```

The key principle is that credentials (email/password) flow through the app but never persist. They're sent to the server over HTTPS, the server returns tokens, and the tokens are stored in EncryptedSharedPreferences. The raw password never touches the filesystem. On logout, local tokens are always cleared regardless of whether the server-side invalidation succeeds — this ensures a compromised network can't prevent local logout.

**Key takeaway:** Never store raw credentials on the device. Authenticate once, store short-lived tokens securely, and always clear tokens on logout — even if server-side invalidation fails.

### Lesson 5.2: Secure Token Management

Token management is where authentication meets storage security. Access tokens should be short-lived (15-60 minutes), refresh tokens longer-lived (days to weeks), and both must be stored in encrypted storage. The access token travels with every API request; the refresh token is used only to obtain new access tokens when the current one expires.

```kotlin
class TokenManager(context: Context) {

    private val secureStorage = SecureStorage.getInstance(context)

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_TOKEN_EXPIRY = "token_expiry"
    }

    fun saveTokens(
        accessToken: String,
        refreshToken: String,
        expiresIn: Long
    ) {
        secureStorage.putString(KEY_ACCESS_TOKEN, accessToken,
            ttlMillis = expiresIn * 1000)
        secureStorage.putString(KEY_REFRESH_TOKEN, refreshToken,
            ttlMillis = 30L * 24 * 60 * 60 * 1000) // 30 days
        secureStorage.putLong(KEY_TOKEN_EXPIRY,
            System.currentTimeMillis() + (expiresIn * 1000))
    }

    fun getAccessToken(): String? {
        return secureStorage.getString(KEY_ACCESS_TOKEN)
    }

    fun getRefreshToken(): String? {
        return secureStorage.getString(KEY_REFRESH_TOKEN)
    }

    fun isTokenExpired(): Boolean {
        val expiry = secureStorage.getLong(KEY_TOKEN_EXPIRY)
        // Expire 30 seconds early to avoid race conditions
        return System.currentTimeMillis() > (expiry - 30_000)
    }

    fun saveAccessToken(newToken: String, expiresIn: Long = 3600) {
        secureStorage.putString(KEY_ACCESS_TOKEN, newToken,
            ttlMillis = expiresIn * 1000)
        secureStorage.putLong(KEY_TOKEN_EXPIRY,
            System.currentTimeMillis() + (expiresIn * 1000))
    }

    fun clearTokens() {
        secureStorage.remove(KEY_ACCESS_TOKEN)
        secureStorage.remove(KEY_REFRESH_TOKEN)
        secureStorage.remove(KEY_TOKEN_EXPIRY)
    }
}
```

Notice the 30-second early expiry check in `isTokenExpired()`. Without this buffer, a token could technically be valid when checked but expire during the network round-trip, resulting in a 401 error. By expiring tokens 30 seconds early, you ensure the token is still valid when it reaches the server. This is a small detail that prevents intermittent auth failures in production.

The security audit of a news app I worked on flagged "insufficient session expiration" as a low-risk finding. The app's tokens didn't expire for weeks, meaning a compromised token gave an attacker prolonged access. For content apps, this might be acceptable. For fintech or healthcare apps, access tokens should expire in 15 minutes with an aggressive refresh cycle.

**Key takeaway:** Keep access tokens short-lived (15-60 minutes) and refresh tokens longer-lived. Expire tokens slightly before their actual expiry to avoid race conditions during network requests.

### Lesson 5.3: Biometric Authentication

Biometric authentication (fingerprint, face recognition) provides a seamless user experience for gating sensitive operations. The key architectural decision is whether to use biometrics as a **convenience layer** (just verifying the user is present) or as a **cryptographic gate** (tying a KeyStore key to biometric authentication so the key literally cannot be used without biometric verification).

```kotlin
class BiometricAuthManager(private val activity: FragmentActivity) {

    fun canUseBiometrics(): BiometricStatus {
        val manager = BiometricManager.from(activity)
        return when (manager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricStatus.Available
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                BiometricStatus.NoHardware
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                BiometricStatus.NotEnrolled
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                BiometricStatus.HardwareUnavailable
            else -> BiometricStatus.Unknown
        }
    }

    fun authenticateUser(
        title: String = "Verify Identity",
        subtitle: String = "Use your fingerprint or face to continue",
        onSuccess: () -> Unit,
        onError: (BiometricError) -> Unit
    ) {
        if (canUseBiometrics() != BiometricStatus.Available) {
            onError(BiometricError.NotAvailable)
            return
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
            .build()

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(
                result: BiometricPrompt.AuthenticationResult
            ) {
                onSuccess()
            }

            override fun onAuthenticationError(
                errorCode: Int,
                errString: CharSequence
            ) {
                val error = when (errorCode) {
                    BiometricPrompt.ERROR_LOCKOUT ->
                        BiometricError.Lockout
                    BiometricPrompt.ERROR_LOCKOUT_PERMANENT ->
                        BiometricError.PermanentLockout
                    BiometricPrompt.ERROR_USER_CANCELED,
                    BiometricPrompt.ERROR_NEGATIVE_BUTTON ->
                        BiometricError.UserCanceled
                    else ->
                        BiometricError.Other(errString.toString())
                }
                onError(error)
            }

            override fun onAuthenticationFailed() {
                // Individual attempt failed, prompt remains visible
                // System handles lockout after too many failures
            }
        }

        BiometricPrompt(activity, callback).authenticate(promptInfo)
    }
}

enum class BiometricStatus {
    Available, NoHardware, NotEnrolled, HardwareUnavailable, Unknown
}

sealed class BiometricError {
    data object NotAvailable : BiometricError()
    data object Lockout : BiometricError()
    data object PermanentLockout : BiometricError()
    data object UserCanceled : BiometricError()
    data class Other(val message: String) : BiometricError()
}
```

Always check `canAuthenticate()` before showing the prompt — not all devices have biometric hardware, and users may not have enrolled biometrics. Handle `ERROR_LOCKOUT` (temporary lockout after too many failed attempts) differently from `ERROR_LOCKOUT_PERMANENT` (requires device credential reset). The `BIOMETRIC_STRONG` authenticator type requires Class 3 biometrics as defined by the Android Compatibility Definition Document — these have strict false acceptance rate requirements and are appropriate for security-sensitive operations.

The `onAuthenticationFailed()` callback fires for each individual failed attempt (wrong finger, for example), but the system manages lockout automatically — you don't need to implement your own failure counter. The prompt stays visible and the user can try again until the system triggers lockout.

**Key takeaway:** Always check `canAuthenticate()` before showing the prompt. Use `BIOMETRIC_STRONG` for security-sensitive operations. Handle lockout states gracefully — don't just show a generic error.

### Lesson 5.4: Biometric-Gated Cryptographic Operations

The most secure biometric integration ties a KeyStore key to biometric authentication so the hardware won't release the key until the user verifies their identity. This is fundamentally stronger than checking `onAuthenticationSucceeded()` and then using a regular key — because the check-then-use pattern can be bypassed with Frida by hooking the callback. The CryptoObject pattern cannot be bypassed because the TEE itself enforces the biometric requirement.

```kotlin
class BiometricCryptoManager(private val activity: FragmentActivity) {

    companion object {
        private const val KEY_ALIAS = "biometric_gated_key"
    }

    fun getOrCreateBiometricKey(): SecretKey {
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
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(
                    0, // Require auth for every operation
                    KeyProperties.AUTH_BIOMETRIC_STRONG
                )
                .setInvalidatedByBiometricEnrollment(true)
                .build()
        )
        return keyGenerator.generateKey()
    }

    fun encryptWithBiometric(
        plaintext: String,
        onSuccess: (EncryptedData) -> Unit,
        onError: (String) -> Unit
    ) {
        val key = getOrCreateBiometricKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)

        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        val prompt = BiometricPrompt(activity,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    val authedCipher = result.cryptoObject!!.cipher!!
                    val encrypted = authedCipher.doFinal(
                        plaintext.toByteArray(Charsets.UTF_8)
                    )
                    onSuccess(EncryptedData(
                        ciphertext = Base64.encodeToString(encrypted, Base64.NO_WRAP),
                        iv = Base64.encodeToString(authedCipher.iv, Base64.NO_WRAP)
                    ))
                }

                override fun onAuthenticationError(
                    errorCode: Int,
                    errString: CharSequence
                ) {
                    onError(errString.toString())
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate to Encrypt")
            .setSubtitle("Biometric verification required")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
            .build()

        prompt.authenticate(promptInfo, cryptoObject)
    }

    fun decryptWithBiometric(
        encrypted: EncryptedData,
        onSuccess: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        val key = getOrCreateBiometricKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val iv = Base64.decode(encrypted.iv, Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))

        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        val prompt = BiometricPrompt(activity,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    val authedCipher = result.cryptoObject!!.cipher!!
                    val ciphertext = Base64.decode(
                        encrypted.ciphertext, Base64.NO_WRAP
                    )
                    val plaintext = String(
                        authedCipher.doFinal(ciphertext), Charsets.UTF_8
                    )
                    onSuccess(plaintext)
                }

                override fun onAuthenticationError(
                    errorCode: Int,
                    errString: CharSequence
                ) {
                    onError(errString.toString())
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate to Decrypt")
            .setSubtitle("Biometric verification required")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
            .build()

        prompt.authenticate(promptInfo, cryptoObject)
    }
}

data class EncryptedData(
    val ciphertext: String,
    val iv: String
)
```

The `CryptoObject` pattern is what makes this unbypassable. The TEE won't release the key for the cipher operation until the biometric hardware confirms the user's identity. Even if an attacker uses Frida to hook `onAuthenticationSucceeded`, the cipher inside the `CryptoObject` won't work unless the real biometric authentication happened — because the key authorization happens inside the TEE, not in your app's process. Setting `setInvalidatedByBiometricEnrollment(true)` adds another critical protection: if someone adds a new fingerprint to the device, the key is permanently invalidated and must be re-created.

**Key takeaway:** For high-security operations, use the CryptoObject pattern to tie KeyStore keys to biometric authentication. This is enforced by hardware and cannot be bypassed by Frida or runtime hooking.

### Lesson 5.5: OAuth 2.0 and JWT Best Practices

Most modern Android apps authenticate through OAuth 2.0 flows that produce JWT (JSON Web Token) access tokens. Understanding how JWTs work helps you make better security decisions about token handling, even though your server manages the signing and validation.

```kotlin
class JwtTokenInspector {

    fun isTokenExpired(jwt: String): Boolean {
        return try {
            val payload = decodePayload(jwt)
            val exp = payload.optLong("exp", 0)
            // Add 30-second buffer for clock skew
            System.currentTimeMillis() / 1000 > (exp - 30)
        } catch (e: Exception) {
            true // Treat unparseable tokens as expired
        }
    }

    fun getTokenClaims(jwt: String): Map<String, Any>? {
        return try {
            val payload = decodePayload(jwt)
            payload.keys().asSequence().associateWith { payload.get(it) }
        } catch (e: Exception) {
            null
        }
    }

    private fun decodePayload(jwt: String): JSONObject {
        val parts = jwt.split(".")
        require(parts.size == 3) { "Invalid JWT format" }
        val payload = String(
            Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP),
            Charsets.UTF_8
        )
        return JSONObject(payload)
    }

    fun getSubject(jwt: String): String? {
        return try {
            decodePayload(jwt).optString("sub", null)
        } catch (e: Exception) {
            null
        }
    }
}
```

A critical principle: never validate JWTs on the client side for authorization decisions. The client can decode the payload to check expiry (as shown above), but it should never trust the claims for access control. The server must validate the token signature on every request. The client's job is to store the token securely, send it with requests, and refresh it when expired. All authorization logic belongs on the server.

One practical insight from working with OAuth 2.0: always use the Authorization Code flow with PKCE (Proof Key for Code Exchange) for mobile apps, not the Implicit flow. The Implicit flow was designed for browser-based apps and exposes the access token in the URL redirect, making it vulnerable to interception. PKCE generates a one-time code verifier that ensures only the app that initiated the auth flow can exchange the authorization code for tokens. Google's AppAuth library implements this correctly.

**Key takeaway:** Use OAuth 2.0 Authorization Code with PKCE for mobile apps. Never validate JWT claims on the client for authorization — that's the server's job. The client only inspects tokens for expiry checking and user display.

### Quiz: Authentication and Biometrics

#### What should you always check before showing a BiometricPrompt?

- ❌ Whether the device has a screen lock
- ❌ Whether the app has internet connectivity
- ✅ Whether biometric authentication is available by calling `canAuthenticate()`
- ❌ Whether the user has granted the CAMERA permission

> **Explanation:** Not all devices have biometric hardware, and even those that do may not have enrolled biometrics. Calling `BiometricManager.canAuthenticate()` returns the current status. Showing a prompt without this check leads to crashes or confusing error states.

#### Why is the CryptoObject pattern more secure than just checking `onAuthenticationSucceeded`?

- ❌ CryptoObject provides faster encryption
- ❌ CryptoObject works on more devices
- ✅ The TEE enforces the biometric requirement at the hardware level, making it unbypassable by Frida or runtime hooking
- ❌ CryptoObject encrypts the biometric data itself

> **Explanation:** Without CryptoObject, the check-then-use pattern can be bypassed by hooking `onAuthenticationSucceeded` with Frida and triggering it without real biometric auth. With CryptoObject, the key physically cannot be used without biometric verification — the TEE won't release it. The enforcement happens in hardware, outside your app's process.

#### Why should mobile apps use OAuth 2.0 Authorization Code with PKCE instead of the Implicit flow?

- ❌ PKCE is faster than the Implicit flow
- ❌ PKCE doesn't require HTTPS
- ✅ The Implicit flow exposes the access token in the URL redirect, making it vulnerable to interception
- ❌ PKCE allows the client to validate JWT signatures

> **Explanation:** The Implicit flow was designed for browser apps and returns the access token directly in the URL redirect fragment, which can be intercepted by malicious apps monitoring intents. PKCE adds a code verifier that ensures only the app that initiated the flow can exchange the authorization code for tokens.

### Coding Challenge: Complete Auth Flow Manager

Build a complete `AuthFlowManager` that handles login, token refresh, biometric re-authentication for sensitive operations, and secure logout.

#### Solution

```kotlin
class AuthFlowManager(
    private val authApi: AuthApi,
    private val tokenManager: TokenManager,
    private val biometricManager: BiometricAuthManager,
    private val secureStorage: SecureStorage
) {
    suspend fun login(email: String, password: String): AuthResult {
        return try {
            val response = authApi.authenticate(
                AuthRequest(email, password)
            )
            tokenManager.saveTokens(
                response.accessToken,
                response.refreshToken,
                response.expiresIn
            )
            secureStorage.putString("user_id", response.userId)
            AuthResult.Success(response.userId)
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> AuthResult.InvalidCredentials
                429 -> AuthResult.RateLimited
                else -> AuthResult.NetworkError(e.message())
            }
        }
    }

    suspend fun refreshToken(): Boolean {
        val refreshToken = tokenManager.getRefreshToken() ?: return false
        return try {
            val response = authApi.refreshToken(
                RefreshRequest(refreshToken)
            )
            tokenManager.saveAccessToken(
                response.accessToken,
                response.expiresIn
            )
            true
        } catch (e: Exception) {
            false
        }
    }

    fun requireBiometricForSensitiveOp(
        activity: FragmentActivity,
        operation: () -> Unit,
        onDenied: (String) -> Unit
    ) {
        biometricManager.authenticateUser(
            title = "Confirm Identity",
            subtitle = "Required for this action",
            onSuccess = { operation() },
            onError = { error ->
                onDenied(when (error) {
                    is BiometricError.Lockout -> "Too many attempts"
                    is BiometricError.PermanentLockout -> "Biometric locked"
                    is BiometricError.UserCanceled -> "Canceled"
                    is BiometricError.NotAvailable -> "Biometric not available"
                    is BiometricError.Other -> error.message
                })
            }
        )
    }

    suspend fun logout() {
        try {
            authApi.logout(tokenManager.getRefreshToken() ?: "")
        } catch (_: Exception) { }
        tokenManager.clearTokens()
        secureStorage.remove("user_id")
    }

    fun isLoggedIn(): Boolean {
        return tokenManager.getAccessToken() != null
            && secureStorage.getString("user_id") != null
    }
}
```

This manager coordinates the complete auth lifecycle: login with credential handling, automatic token refresh, biometric gating for sensitive operations, and secure logout. The biometric gate is optional per-operation — use it for payments, settings changes, or data exports, not for every API call.

---

## Module 6: Code Protection and Secrets Management

Your APK is a downloadable, decompilable package. Anyone can download it from the Play Store, unzip it, and run tools like jadx, APKTool, or dex2jar to read your source code, extract string constants, and understand your app's architecture. Code protection isn't about making reverse engineering impossible — it's about raising the cost high enough that most attackers move on to easier targets.

### Lesson 6.1: R8 Obfuscation and Shrinking

R8 is Google's code shrinker and obfuscator, the successor to ProGuard. It performs three operations on your release build: **shrinking** (removing unused classes, methods, and fields), **obfuscation** (renaming identifiers to meaningless names like `a`, `b`, `c`), and **optimization** (inlining methods, removing dead code, simplifying control flow). The result is a smaller APK that's significantly harder to reverse engineer because all the semantic meaning in class and method names is gone.

```kotlin
// build.gradle.kts
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}
```

```
// proguard-rules.pro

# Keep data classes used with Gson/Moshi (reflection-based serialization)
-keepclassmembers class com.yourapp.data.model.** {
    <fields>;
}

# Keep Compose stability annotations
-keep class * implements androidx.compose.runtime.Stable { *; }

# Remove all debug and verbose logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Keep crash reporting classes for readable stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

The `-assumenosideeffects` directive for `Log` is one of the most underused security features. It tells R8 to completely remove all `Log.d()`, `Log.v()`, and `Log.i()` calls from the release build — not just disable them, but strip them from the bytecode entirely. This means sensitive data you might have logged during development (tokens, user IDs, request bodies) won't exist in the release APK at all. Keeping `Log.e()` and `Log.w()` is usually fine because those are for genuine error conditions that you want in crash reports.

The main risk with R8 is breaking reflection-based code. Gson uses reflection to map JSON field names to class properties. When R8 renames `userName` to `a`, Gson can't match `"userName"` from the JSON to the obfuscated field. That's why `-keep` rules are essential for data model classes. If you use Moshi with codegen or kotlinx.serialization, this problem largely goes away because they use compile-time code generation instead of runtime reflection.

**Key takeaway:** Always enable R8 for release builds. Use `-assumenosideeffects` to strip debug logs entirely. Test thoroughly after enabling — serialization and reflection are the most common breakage points.

### Lesson 6.2: Secrets Management — The Spectrum of Options

Secrets management on Android exists on a spectrum from "easily extractable" to "very difficult to extract." No approach is bulletproof — a determined attacker with root access and unlimited time can eventually extract any secret from a client application. The goal is to choose the right level of protection for the sensitivity of each secret.

```kotlin
// ❌ Level 1: Hardcoded in source code (trivially extractable)
private const val API_KEY = "sk_live_abc123"

// ⚠️ Level 2: BuildConfig from local.properties (not in source, but in APK)
// build.gradle.kts
android {
    defaultConfig {
        buildConfigField("String", "API_KEY",
            "\"${project.findProperty("API_KEY")}\"")
    }
}

// ⚠️ Level 3: NDK/native code (harder to extract, but not impossible)
// CMakeLists.txt configures a native library
external fun getApiKey(): String

// ✅ Level 4: Fetched from server at runtime (key never in APK)
class ConfigRepository(private val api: ConfigApi) {
    private var cachedKey: String? = null

    suspend fun getApiKey(): String {
        cachedKey?.let { return it }
        val key = api.getConfig().apiKey
        cachedKey = key
        return key
    }
}

// ✅ Level 5: Server-side proxy (key never reaches client)
// Client calls your backend; backend adds the API key and forwards to the third-party API
```

Level 1 and 2 are the most common mistakes. BuildConfig fields look safe because they're "not in the source code," but they compile into the DEX bytecode as string constants — visible in any decompiler. Level 3 uses the NDK to store secrets in native `.so` files. This raises the bar because native code requires different tools (IDA Pro, Ghidra) to analyze, and most casual attackers won't bother. VPN apps, email clients, and password managers like Proton use this approach. But binary analysis can still extract the keys, especially when they're passed to network APIs where tools like Frida can intercept them.

Level 4 (runtime fetch) keeps the key out of the APK entirely. The server sends it at runtime, and it lives only in memory (with an encrypted disk cache for offline use). Level 5 (server-side proxy) is the gold standard — the client never sees the third-party API key at all. Your backend acts as a proxy, adding the key server-side. The tradeoff is that every request must go through your server, adding latency and operational cost.

Tools like Arkana (github.com/rogerluan/arkana) help with Level 3 by generating obfuscated code for storing secrets, supported on both Android and iOS. Arkana generates code that reconstructs the secret at runtime from scattered byte fragments, making static analysis harder. It's not a complete solution but significantly raises the bar above plain BuildConfig.

**Key takeaway:** No client-side secret is truly secure. Use server-side proxy (Level 5) for the most sensitive keys. Use runtime fetch (Level 4) for keys that must reach the client. Use NDK with obfuscation (Level 3) only when server-side solutions aren't feasible.

### Lesson 6.3: NDK-Based Secret Storage

When server-side key management isn't feasible (keys needed at compile time, offline functionality, third-party SDK requirements), storing secrets in native code through the NDK is the next best option. Native `.so` files require specialized tools like IDA Pro or Ghidra to analyze, and the binary format is inherently harder to reverse engineer than DEX bytecode. Most reverse engineers who can trivially decompile APKs with jadx won't invest the effort to analyze native binaries.

```kotlin
// Native function declaration in Kotlin
class NativeSecrets {
    companion object {
        init {
            System.loadLibrary("secrets")
        }
    }

    external fun getEncryptedApiKey(): ByteArray
    external fun getKeyParts(): Array<String>
}

// Usage with runtime assembly
class SecureConfigProvider(private val nativeSecrets: NativeSecrets) {

    private var assembledKey: String? = null

    fun getApiKey(): String {
        assembledKey?.let { return it }

        // Key is split across multiple native functions
        val parts = nativeSecrets.getKeyParts()
        val key = parts.joinToString("") { decodeComponent(it) }
        assembledKey = key
        return key
    }

    private fun decodeComponent(encoded: String): String {
        // XOR decode or other simple transformation
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        return String(bytes.map { (it.toInt() xor 0x42).toByte() }.toByteArray())
    }

    fun clearCachedKey() {
        assembledKey = null
    }
}
```

The key technique is splitting the secret across multiple functions and applying transformations (XOR, byte shuffling, Base64 encoding with custom alphabets). This means a simple `strings` command on the `.so` file won't reveal the secret — the attacker needs to understand the assembly logic and the transformation. However, a sophisticated attacker using Frida can hook the function at runtime and capture the return value, bypassing all static obfuscation. That's why NDK storage is defense-in-depth, not a complete solution.

For apps that need the highest security for compile-time secrets, combining NDK storage with root detection and Frida detection provides multiple layers. If the app detects a rooted device or Frida's presence, it can refuse to call the native functions, forcing the attacker to bypass the detection before accessing the secrets.

**Key takeaway:** NDK-based secret storage raises the reverse engineering bar significantly but isn't unbreakable. Combine it with root detection and runtime integrity checks for defense-in-depth.

### Lesson 6.4: Root Detection and Tamper Detection

Root detection identifies devices where the user has gained superuser access, which allows bypassing Android's sandbox protections. For apps handling sensitive data (banking, healthcare, enterprise), detecting rooted devices and restricting functionality is a reasonable security measure. The security audit of a news app I worked on flagged "no root detection" as a medium-risk finding — appropriate because a rooted device can extract tokens and cached content, but the content itself is publicly available.

```kotlin
class DeviceIntegrityChecker(private val context: Context) {

    fun isDeviceCompromised(): Boolean {
        return isRooted() || isRunningOnEmulator() || isDebuggable()
    }

    fun isRooted(): Boolean {
        return checkRootBinaries()
            || checkSuperUserApps()
            || checkRootProperties()
            || checkRWSystem()
    }

    private fun checkRootBinaries(): Boolean {
        val paths = listOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/data/local/bin/su",
            "/data/local/xbin/su",
            "/system/app/Superuser.apk",
            "/system/app/SuperSU.apk"
        )
        return paths.any { File(it).exists() }
    }

    private fun checkSuperUserApps(): Boolean {
        val packages = listOf(
            "com.topjohnwu.magisk",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.noshufou.android.su"
        )
        return packages.any { pkg ->
            try {
                context.packageManager.getPackageInfo(pkg, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    private fun checkRootProperties(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", "ro.build.tags"))
            val output = process.inputStream.bufferedReader().readLine()
            process.waitFor()
            output?.contains("test-keys") == true
        } catch (e: Exception) {
            false
        }
    }

    private fun checkRWSystem(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("mount"))
            val output = process.inputStream.bufferedReader().readText()
            process.waitFor()
            output.contains("/system") && output.contains("rw")
        } catch (e: Exception) {
            false
        }
    }

    fun isRunningOnEmulator(): Boolean {
        return (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
            || Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.HARDWARE.contains("goldfish")
            || Build.HARDWARE.contains("ranchu")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for")
            || Build.MANUFACTURER.contains("Genymotion")
            || Build.PRODUCT.contains("sdk")
    }

    private fun isDebuggable(): Boolean {
        return (context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }
}
```

The honest truth about root detection: it's a speed bump, not a wall. Experienced attackers can bypass every check in this code using Frida or Xposed to hook the functions and modify their return values. Tools like Magisk can hide root from most detection methods. The value of root detection is that it stops casual attackers and automated tools — the 90% who download a rooted emulator and run your app to see what they can extract. For the remaining 10%, you need server-side protections (anomaly detection, device attestation via Google's Play Integrity API) that can't be bypassed on the client.

Google's Play Integrity API (successor to SafetyNet) provides server-verified device attestation. The server sends a challenge, the app requests an integrity verdict from Google, and the server verifies the signed response. This is much harder to bypass than client-side checks because the verification happens on Google's servers. Use Play Integrity for high-security decisions (can this device access financial features?) and client-side checks for quick UX decisions (should I show a warning?).

**Key takeaway:** Root detection stops casual attackers but can be bypassed by sophisticated ones. For high-security apps, combine client-side detection with Google's Play Integrity API for server-verified device attestation.

### Lesson 6.5: Detecting Runtime Instrumentation (Frida, Xposed)

Frida and Xposed are the most popular runtime instrumentation tools used by both security researchers and attackers. Frida injects a JavaScript engine into your running process, allowing function hooking, return value modification, and memory inspection. Xposed modifies the Android framework to intercept method calls globally. Detecting their presence adds another layer to your defense-in-depth strategy.

```kotlin
class RuntimeIntegrityChecker {

    fun isFridaDetected(): Boolean {
        return checkFridaPort()
            || checkFridaLibraries()
            || checkFridaProcesses()
    }

    private fun checkFridaPort(): Boolean {
        return try {
            // Frida server typically listens on port 27042
            java.net.Socket("127.0.0.1", 27042).use { true }
        } catch (e: Exception) {
            false
        }
    }

    private fun checkFridaLibraries(): Boolean {
        val mapsFile = File("/proc/self/maps")
        if (!mapsFile.exists()) return false
        return try {
            mapsFile.readText().let { maps ->
                maps.contains("frida") || maps.contains("gadget")
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun checkFridaProcesses(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("ps"))
            val output = process.inputStream.bufferedReader().readText()
            process.waitFor()
            output.contains("frida-server") || output.contains("frida-agent")
        } catch (e: Exception) {
            false
        }
    }

    fun isXposedDetected(): Boolean {
        return checkXposedClasses() || checkXposedPackages()
    }

    private fun checkXposedClasses(): Boolean {
        return try {
            Class.forName("de.robv.android.xposed.XposedBridge")
            true
        } catch (e: ClassNotFoundException) {
            false
        }
    }

    private fun checkXposedPackages(): Boolean {
        val stackTrace = Thread.currentThread().stackTrace
        return stackTrace.any {
            it.className.contains("xposed", ignoreCase = true)
        }
    }
}
```

Like root detection, Frida detection is a cat-and-mouse game. Frida can be configured to use non-default ports, and Magisk-based Frida installations can hide from process listings. The `checkFridaLibraries` approach (scanning `/proc/self/maps` for loaded Frida libraries) is more reliable because Frida must inject a library into your process to function, and that library shows up in the process memory map. But even this can be bypassed with advanced Frida scripts that patch the maps file.

The practical approach is to layer these checks and make bypassing them expensive in terms of time and effort. Even if a sophisticated attacker can bypass all checks, the effort required discourages most attackers from targeting your app when easier targets exist.

**Key takeaway:** Frida and Xposed detection are additional defense layers, not guarantees. Check for default ports, loaded libraries, and known class names. The goal is to make attacks expensive, not impossible.

### Quiz: Code Protection

#### What does R8's obfuscation do to your code?

- ❌ Encrypts the entire APK file
- ❌ Removes all classes and methods
- ✅ Renames classes, methods, and fields to short meaningless names like `a`, `b`, `c`
- ❌ Converts Kotlin code to native machine code

> **Explanation:** R8 obfuscation renames identifiers to short, meaningless names. This makes reverse engineering harder because decompiled code loses all semantic meaning. It doesn't encrypt the APK or convert code to native — the bytecode structure remains the same, just with obscured names.

#### Why is storing an API key in BuildConfig not fully secure?

- ❌ BuildConfig is uploaded to Google Play as plain text
- ✅ BuildConfig fields are compiled into the APK and visible when decompiled
- ❌ BuildConfig values are logged automatically by Android
- ❌ BuildConfig files are excluded from R8 obfuscation

> **Explanation:** While BuildConfig keeps secrets out of source code, the values are compiled as string constants into the DEX bytecode. R8 obfuscates class and method names but preserves string constants verbatim. Anyone who decompiles the APK can extract these values in seconds.

#### What is the most secure approach for managing third-party API keys?

- ❌ Storing them in BuildConfig with local.properties
- ❌ Encrypting them in the APK with AES
- ❌ Storing them in native code via NDK
- ✅ Using a server-side proxy so the key never reaches the client

> **Explanation:** A server-side proxy means the client never sees the third-party API key at all. Your backend adds the key server-side before forwarding the request. The key exists only on your server, which you fully control. Every other approach puts the key in the client where it can potentially be extracted.

#### What does the `-assumenosideeffects` ProGuard directive do for `Log` calls?

- ❌ Redirects log output to an encrypted file
- ❌ Changes log level to ERROR only
- ✅ Completely removes the specified log method calls from the bytecode
- ❌ Encrypts the log messages

> **Explanation:** `-assumenosideeffects` tells R8 that the specified methods have no side effects worth preserving, so they can be completely removed from the compiled bytecode. The Log.d/v/i calls don't just become no-ops — they're stripped from the APK entirely, including their string arguments. This prevents any logged sensitive data from existing in the release build.

### Coding Challenge: Runtime Secrets Fetcher

Implement a `SecretsManager` that fetches API keys from a remote config endpoint at runtime, with in-memory caching, encrypted local fallback, and device integrity checks.

#### Solution

```kotlin
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SecretsManager(
    private val api: SecretsApi,
    private val secureStorage: SecureStorage,
    private val integrityChecker: DeviceIntegrityChecker
) {
    private val mutex = Mutex()
    private val memoryCache = mutableMapOf<String, String>()

    suspend fun getSecret(key: String): String? {
        // Refuse to provide secrets on compromised devices
        if (integrityChecker.isDeviceCompromised()) {
            return null
        }

        memoryCache[key]?.let { return it }

        return mutex.withLock {
            memoryCache[key]?.let { return it }

            try {
                val response = api.getSecrets()
                response.secrets.forEach { (k, v) ->
                    memoryCache[k] = v
                    secureStorage.putString(
                        "secret_$k", v,
                        ttlMillis = 24 * 60 * 60 * 1000L
                    )
                }
                memoryCache[key]
            } catch (e: Exception) {
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

This manager combines three defense layers: device integrity checking (refuses to provide secrets on rooted/emulated devices), three-tier secret lookup (memory → server → encrypted cache), and mutex-protected cache population to prevent concurrent fetches. In-memory secrets are lost on process death, while the encrypted fallback ensures offline functionality.

---

## Module 7: App Component Security

Android's component model — Activities, Services, BroadcastReceivers, and ContentProviders — creates an inter-process communication (IPC) system that's powerful but dangerous when misconfigured. Every exported component is an entry point that other apps can invoke, and every intent you send or receive is a potential attack vector.

### Lesson 7.1: Exported Components and the Manifest

The `android:exported` attribute is the single most important security flag in your manifest. An exported component can be started, bound to, or queried by any app on the device. Before Android 12, components with intent filters were implicitly exported — a default that led to countless security vulnerabilities. Since Android 12 (API 31), you must explicitly declare `exported="true"` or `exported="false"` for every component with an intent filter.

```xml
<!-- ❌ Dangerous: Exported activity with no protection -->
<activity
    android:name=".DeeplinkActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="myapp" />
    </intent-filter>
</activity>

<!-- ✅ Better: Exported with permission requirement -->
<activity
    android:name=".AdminActivity"
    android:exported="true"
    android:permission="com.yourapp.permission.ADMIN_ACCESS">
    <intent-filter>
        <action android:name="com.yourapp.ADMIN_ACTION" />
    </intent-filter>
</activity>

<!-- ✅ Best: Not exported at all (internal use only) -->
<service
    android:name=".SyncService"
    android:exported="false" />

<receiver
    android:name=".NotificationReceiver"
    android:exported="false" />
```

The rule is simple: default everything to `exported="false"` unless you have a specific reason to export it. Activities that handle deep links must be exported (otherwise they can't receive intents from the browser). Your launcher Activity must be exported. But services, receivers, and providers that only your app uses should never be exported. Every exported component you add increases your attack surface.

A real-world example from production: a deeplink-handling Activity was exported without any input validation. A malicious app could craft an intent with arbitrary data in the extras, triggering unintended behavior — navigating to internal screens, passing crafted URLs to a WebView, or injecting parameters into API calls. The fix was adding intent validation that checked the source package, validated URL schemes, and sanitized all extras before processing.

**Key takeaway:** Default all components to `exported="false"`. Only export components that genuinely need to be accessed by other apps. Always validate incoming intents on exported components — treat them as untrusted input.

### Lesson 7.2: Intent Security and Deep Link Validation

Intents are Android's IPC mechanism, and they carry data between components — both within your app and across app boundaries. Explicit intents (specifying the target component) are safe because they go exactly where you send them. Implicit intents (specifying an action/data pattern) are resolved by the system and can be intercepted by any app that registers a matching intent filter.

```kotlin
class SecureIntentHandler {

    fun validateDeepLink(intent: Intent): DeepLinkResult {
        val uri = intent.data ?: return DeepLinkResult.Invalid("No URI")

        // Only accept HTTPS scheme
        if (uri.scheme != "https" && uri.scheme != "myapp") {
            return DeepLinkResult.Invalid("Invalid scheme: ${uri.scheme}")
        }

        // Validate host for HTTPS links
        if (uri.scheme == "https") {
            val allowedHosts = setOf("yourapp.com", "www.yourapp.com")
            if (uri.host !in allowedHosts) {
                return DeepLinkResult.Invalid("Untrusted host: ${uri.host}")
            }
        }

        // Prevent path traversal
        val path = uri.path ?: ""
        if (path.contains("..") || path.contains("//")) {
            return DeepLinkResult.Invalid("Path traversal detected")
        }

        // Sanitize query parameters
        val sanitizedParams = uri.queryParameterNames.associateWith { key ->
            uri.getQueryParameter(key)?.take(500) ?: "" // Limit length
        }

        return DeepLinkResult.Valid(uri, sanitizedParams)
    }

    fun createSecureIntent(
        context: Context,
        targetClass: Class<*>,
        extras: Map<String, String> = emptyMap()
    ): Intent {
        return Intent(context, targetClass).apply {
            // Explicit intent — goes directly to the target
            extras.forEach { (key, value) -> putExtra(key, value) }
            // Prevent other apps from reading the intent
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    fun shareContentSecurely(context: Context, uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = uri
            // Grant read-only access, not write
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // Don't grant persistent access
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        // Verify the receiving app exists
        intent.resolveActivity(context.packageManager)?.let {
            context.startActivity(intent)
        }
    }
}

sealed class DeepLinkResult {
    data class Valid(val uri: Uri, val params: Map<String, String>) : DeepLinkResult()
    data class Invalid(val reason: String) : DeepLinkResult()
}
```

The `FLAG_GRANT_READ_URI_PERMISSION` flag is important when sharing content via intents. It grants the receiving app temporary read access to the specific URI without requiring the broader `READ_EXTERNAL_STORAGE` permission. Always use `content://` URIs instead of `file://` URIs — file URIs expose the actual filesystem path and can leak information about your app's internal structure.

When delegating actions to other apps (inserting contacts, taking photos, viewing documents), prefer delegating the permission entirely rather than requesting it yourself. For instance, instead of requesting `WRITE_CONTACTS` permission and inserting a contact directly, launch the contacts app with `ACTION_INSERT` and let it handle the operation with its existing permission. This minimizes your app's permission footprint.

**Key takeaway:** Validate all incoming intents on exported components. Use explicit intents for internal navigation. When sharing content, grant `FLAG_GRANT_READ_URI_PERMISSION` instead of broad storage permissions, and always use `content://` URIs.

### Lesson 7.3: Permission Delegation

Android's permission model lets you minimize your app's permission footprint by delegating operations to apps that already have the required permissions. This follows the principle of least privilege — request only the permissions you absolutely need, and delegate everything else.

```kotlin
class PermissionDelegator(private val context: Context) {

    // Instead of requesting WRITE_CONTACTS, delegate to Contacts app
    fun insertContact(activity: Activity) {
        val intent = Intent(Intent.ACTION_INSERT).apply {
            type = ContactsContract.Contacts.CONTENT_TYPE
        }
        intent.resolveActivity(context.packageManager)?.let {
            activity.startActivity(intent)
        }
    }

    // Instead of requesting CAMERA, delegate to Camera app
    fun capturePhoto(activity: Activity, outputUri: Uri): Intent {
        return Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, outputUri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
    }

    // Instead of CALL_PHONE, use ACTION_DIAL (no permission needed)
    fun dialNumber(phoneNumber: String) {
        val intent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:$phoneNumber")
        }
        context.startActivity(intent)
    }

    // View a document without requesting storage permissions
    fun viewDocument(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = uri
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        intent.resolveActivity(context.packageManager)?.let {
            context.startActivity(intent)
        }
    }
}
```

Every permission your app requests is a potential privacy concern and an additional surface for abuse. If your app requests `WRITE_CONTACTS` but only needs to add one contact, delegating to the Contacts app means your app never has broad access to the user's contact database. Similarly, `ACTION_DIAL` shows the dialer with the number pre-filled without requiring the `CALL_PHONE` permission — the user still initiates the call.

**Key takeaway:** Delegate to system apps when possible instead of requesting permissions directly. Every permission you don't request is an attack surface you don't expose and a privacy dialog you don't show.

### Lesson 7.4: Secure Broadcast Receivers

BroadcastReceivers are particularly dangerous when exported because any app can send a broadcast to them. An exported receiver without permission protection can be triggered by a malicious app with crafted intent data. Since Android 8.0, implicit broadcasts are significantly restricted, but explicit broadcasts to exported receivers still work.

```kotlin
class SecureBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // Validate the sender
        val sendingPackage = intent.getPackage()
        if (sendingPackage != null && sendingPackage != context.packageName) {
            // External sender — validate carefully
            if (!isAllowedSender(context, sendingPackage)) {
                return
            }
        }

        // Validate the action
        when (intent.action) {
            "com.yourapp.ACTION_SYNC" -> handleSync(context, intent)
            "com.yourapp.ACTION_UPDATE" -> handleUpdate(context, intent)
            else -> return // Ignore unknown actions
        }
    }

    private fun isAllowedSender(
        context: Context,
        packageName: String
    ): Boolean {
        return try {
            val pm = context.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            // Only trust system apps or apps signed with the same key
            (appInfo.flags and ApplicationInfo.FLAG_SYSTEM != 0) ||
                pm.checkSignatures(context.packageName, packageName) ==
                    PackageManager.SIGNATURE_MATCH
        } catch (e: Exception) {
            false
        }
    }

    private fun handleSync(context: Context, intent: Intent) {
        val data = intent.getStringExtra("sync_data") ?: return
        // Sanitize and validate data before processing
        if (data.length > 1000) return // Prevent DoS via oversized data
        // Process sync...
    }

    private fun handleUpdate(context: Context, intent: Intent) {
        // Handle update logic
    }
}

// Registering a receiver with permission protection
class SecureReceiverRegistration(private val context: Context) {

    fun registerProtectedReceiver(
        receiver: BroadcastReceiver,
        filter: IntentFilter
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(
                receiver,
                filter,
                "com.yourapp.permission.INTERNAL_BROADCAST",
                null,
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            context.registerReceiver(
                receiver,
                filter,
                "com.yourapp.permission.INTERNAL_BROADCAST",
                null
            )
        }
    }
}
```

The `RECEIVER_NOT_EXPORTED` flag (Android 13+) explicitly prevents other apps from sending broadcasts to your dynamically registered receiver. For receivers declared in the manifest, use `android:exported="false"`. When you must export a receiver, require a custom permission with `android:permission` and use `checkSignatures` to verify the sender is signed with your key.

**Key takeaway:** Never export BroadcastReceivers without permission protection. Use `RECEIVER_NOT_EXPORTED` for dynamic receivers and `android:exported="false"` for manifest receivers. Validate sender identity and sanitize all intent data.

### Lesson 7.5: Logging and Information Leakage

Logs are an often-overlooked security hole. During development, it's natural to log API responses, user IDs, tokens, and error details. But these logs persist in the device's logcat buffer and, on older Android versions, were readable by any app with the `READ_LOGS` permission. Even on modern Android, ADB access to a connected device exposes all logcat output. Crash reporting tools like Firebase Crashlytics capture context that might include logged sensitive data.

```kotlin
object SecureLogger {

    private val isDebug = BuildConfig.DEBUG

    fun d(tag: String, message: String) {
        if (isDebug) Log.d(tag, message)
    }

    fun e(tag: String, message: String, throwable: Throwable? = null) {
        if (isDebug) {
            Log.e(tag, message, throwable)
        } else {
            // In release, log only sanitized error info
            Log.e(tag, sanitize(message))
        }
    }

    private fun sanitize(message: String): String {
        return message
            .replace(Regex("token[=:][^\\s]+"), "token=***")
            .replace(Regex("password[=:][^\\s]+"), "password=***")
            .replace(Regex("email[=:][^\\s]+"), "email=***")
            .replace(Regex("\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"),
                "***@***.***")
    }

    // Never log these — use this as a reminder
    fun neverLog() {
        // Auth tokens
        // Passwords / PINs
        // Email addresses
        // Phone numbers
        // Credit card numbers
        // API keys
        // Session IDs
        // User PII of any kind
    }
}
```

The best approach is R8's `-assumenosideeffects` directive to strip Log.d, Log.v, and Log.i calls from release builds entirely. But for errors that you do want in production crash reports, sanitize the message to remove any sensitive data. The regex patterns above catch common patterns — tokens, passwords, and email addresses. In production apps I've worked on, I've also added sanitization for credit card numbers (replacing all but the last four digits) and phone numbers.

**Key takeaway:** Strip debug and info logs from release builds using R8's `-assumenosideeffects`. For error logs that remain, sanitize out tokens, emails, and PII before logging.

### Quiz: App Component Security

#### What changed about exported components starting in Android 12?

- ❌ All components are automatically exported
- ❌ Exported components no longer need permissions
- ✅ The `android:exported` attribute must be explicitly declared for components with intent filters
- ❌ Content providers were removed from the framework

> **Explanation:** Starting with Android 12, if a component has an intent filter, you must explicitly set `android:exported="true"` or `android:exported="false"`. Previously, components with intent filters were implicitly exported. This change forces developers to make a conscious security decision about component visibility.

#### Why should you use `content://` URIs instead of `file://` URIs when sharing files via intents?

- ❌ `content://` URIs are faster to process
- ✅ `file://` URIs expose the actual filesystem path and can leak information about your app's internal structure
- ❌ `file://` URIs don't work on Android 12+
- ❌ `content://` URIs provide automatic encryption

> **Explanation:** `file://` URIs contain the full filesystem path, which reveals your app's internal directory structure and can enable path traversal attacks. `content://` URIs abstract the file location behind a ContentProvider, and you can control access through `FLAG_GRANT_READ_URI_PERMISSION` for temporary, scoped access.

#### What is the `RECEIVER_NOT_EXPORTED` flag used for?

- ❌ Preventing the receiver from receiving any broadcasts
- ❌ Encrypting broadcast data
- ✅ Preventing other apps from sending broadcasts to your dynamically registered receiver
- ❌ Making the receiver run on a background thread

> **Explanation:** `RECEIVER_NOT_EXPORTED` (Android 13+) explicitly prevents other apps from sending broadcasts to your dynamically registered receiver. This is the dynamic equivalent of setting `android:exported="false"` in the manifest. Without it, dynamically registered receivers are implicitly exported.

### Coding Challenge: Secure Deep Link Router

Build a deep link router that validates incoming URIs, sanitizes parameters, prevents path traversal, and routes to the correct internal screen.

#### Solution

```kotlin
class SecureDeepLinkRouter(private val navigator: AppNavigator) {

    private val allowedSchemes = setOf("https", "myapp")
    private val allowedHosts = setOf("yourapp.com", "www.yourapp.com")

    private val routes = mapOf(
        "/profile" to ::handleProfile,
        "/settings" to ::handleSettings,
        "/article/(\\d+)" to ::handleArticle
    )

    fun handleDeepLink(intent: Intent): Boolean {
        val uri = intent.data ?: return false

        // Validate scheme
        if (uri.scheme !in allowedSchemes) return false

        // Validate host for HTTPS
        if (uri.scheme == "https" && uri.host !in allowedHosts) {
            return false
        }

        // Prevent path traversal
        val path = uri.path ?: return false
        if (path.contains("..") || path.contains("//")) return false

        // Find matching route
        for ((pattern, handler) in routes) {
            val regex = Regex(pattern)
            val match = regex.matchEntire(path)
            if (match != null) {
                val params = uri.queryParameterNames.associateWith { key ->
                    sanitizeParam(uri.getQueryParameter(key))
                }
                handler(match.groupValues, params)
                return true
            }
        }

        return false // No matching route
    }

    private fun sanitizeParam(value: String?): String {
        return value
            ?.take(500)
            ?.replace(Regex("[<>\"']"), "")
            ?: ""
    }

    private fun handleProfile(groups: List<String>, params: Map<String, String>) {
        navigator.navigateToProfile()
    }

    private fun handleSettings(groups: List<String>, params: Map<String, String>) {
        navigator.navigateToSettings()
    }

    private fun handleArticle(groups: List<String>, params: Map<String, String>) {
        val articleId = groups.getOrNull(1)?.toLongOrNull() ?: return
        navigator.navigateToArticle(articleId)
    }
}
```

This router validates every aspect of incoming deep links: scheme, host, path (with traversal prevention), and query parameters (with length limits and HTML entity stripping). The route patterns use regex to extract path parameters safely. Unknown paths are silently rejected rather than throwing errors that could reveal internal routing structure.

---

## Module 8: Privacy Best Practices

Privacy is often conflated with security, but they're different concerns. Security protects data from unauthorized access; privacy protects users' control over their own data. You can build a perfectly secure app that's a privacy nightmare — encrypting every piece of user data while collecting far more than necessary, sharing it with dozens of analytics SDKs, and making deletion impossible. Google Play policies, GDPR, and user expectations all demand that privacy be treated as a first-class engineering concern.

### Lesson 8.1: Data Minimization

The principle of data minimization is deceptively simple: only collect data you actually need. Every piece of data you collect is a liability — it must be stored securely, transmitted carefully, included in privacy policies, handled in deletion requests, and protected in the event of a breach. The less data you have, the smaller the blast radius of any security incident.

In practice, data minimization means rethinking common patterns. Instead of storing a user's email address for display, consider storing only the email hash for identification and using a display name the user chooses. Instead of logging full API responses for debugging, log only status codes and timing. Instead of storing precise location coordinates, store only the city or region. Every data field you don't collect is a field you don't have to secure, disclose, or delete.

Analytics deserve special scrutiny. Every tracked event is a privacy tradeoff — it gives you product insights but adds to the data you're collecting about users. Track events that inform product decisions, not everything that happens. Do you really need to know which screen the user looks at for more than 30 seconds? Or which button they tap the most? Collect aggregate insights, not individual behavior profiles. When using analytics SDKs, audit what they collect — many collect device identifiers, IP addresses, and behavioral patterns that go far beyond what you need.

A concrete approach I use: before adding any data collection, ask three questions. First, can the feature work without this data? Second, can we use a less sensitive version of this data (hash instead of raw, city instead of coordinates, anonymous instead of identified)? Third, can we collect this data temporarily and discard it after use? If you can't answer "no" to the first question, you shouldn't collect the data at all.

**Key takeaway:** Only collect data you actually need. Consider hashes instead of raw values, approximate data instead of precise data, and aggregate analytics instead of individual tracking. Every field you don't collect is a liability you don't carry.

### Lesson 8.2: Runtime Permissions — Privacy-First Approach

Android's runtime permission system is your app's most visible privacy interface. How and when you request permissions shapes the user's trust in your app. The golden rule: request permissions at the point of use, explain why you need them, and handle denial gracefully with reduced functionality rather than blocking the user.

```kotlin
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
                PackageManager.PERMISSION_GRANTED
        )
    }
    var showRationale by remember { mutableStateOf(false) }
    var permanentlyDenied by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        permissionState = granted
        if (!granted) {
            val activity = context as? ComponentActivity
            permanentlyDenied =
                activity?.shouldShowRequestPermissionRationale(permission) == false
        }
    }

    when {
        permissionState -> onGranted()
        permanentlyDenied -> {
            AlertDialog(
                onDismissRequest = {},
                title = { Text("Permission Required") },
                text = {
                    Text("$rationaleMessage\n\nPlease enable in Settings.")
                },
                confirmButton = {
                    TextButton(onClick = {
                        context.startActivity(Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null)
                        ))
                    }) { Text("Open Settings") }
                },
                dismissButton = {
                    TextButton(onClick = { permanentlyDenied = false }) {
                        Text("Not Now")
                    }
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
                    }) { Text("Allow") }
                },
                dismissButton = {
                    TextButton(onClick = { showRationale = false }) {
                        Text("Not Now")
                    }
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

This composable handles the full permission lifecycle: initial rationale, system permission dialog, denial, and the "don't ask again" state (directing users to Settings). The key design decision is that `onDenied` always provides a fallback UI — the app never becomes unusable because of a denied permission. If camera is denied, show a file upload option. If location is denied, let the user type their city manually. Respecting the user's choice builds trust.

**Key takeaway:** Request permissions at the point of use, show a rationale before asking, and handle denial gracefully. Never block the entire app over a single permission denial — always provide a fallback experience.

### Lesson 8.3: Scoped Storage and File Access

Scoped storage (introduced in Android 10, enforced in Android 11+) restricts your app's access to external storage. Your app can freely read and write to its own app-specific directory, but accessing shared storage (photos, videos, downloads) requires specific APIs and permissions. This is a privacy win — apps can no longer browse the entire filesystem and see files from other apps.

```kotlin
class ScopedStorageManager(private val context: Context) {

    // Write to app-specific external storage (no permission needed)
    fun saveAppFile(filename: String, data: ByteArray): Uri? {
        val file = File(context.getExternalFilesDir(null), filename)
        file.writeBytes(data)
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
    }

    // Access shared media with MediaStore (READ_MEDIA_IMAGES on Android 13+)
    fun queryImages(): List<MediaItem> {
        val items = mutableListOf<MediaItem>()
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_ADDED
        )

        context.contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Images.Media.DATE_ADDED} DESC"
        )?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val nameColumn = cursor.getColumnIndexOrThrow(
                MediaStore.Images.Media.DISPLAY_NAME
            )

            while (cursor.moveToNext()) {
                val id = cursor.getLong(idColumn)
                val name = cursor.getString(nameColumn)
                val uri = ContentUris.withAppendedId(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id
                )
                items.add(MediaItem(uri, name))
            }
        }
        return items
    }

    // Use Storage Access Framework for user-selected files
    fun createDocumentPickerIntent(): Intent {
        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            // Don't request persistent access unless needed
        }
    }
}

data class MediaItem(val uri: Uri, val name: String)
```

The shift from `READ_EXTERNAL_STORAGE` to granular permissions (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO` on Android 13+) means your app only gets access to the specific media types it needs. If your app only displays photos, request `READ_MEDIA_IMAGES` — don't request access to videos and audio you'll never use.

For user-selected files, the Storage Access Framework (SAF) with `ACTION_OPEN_DOCUMENT` gives the user full control — they choose which file to share with your app, and your app gets access only to that specific file. This is the most privacy-respecting approach for file access.

**Key takeaway:** Use app-specific directories for your own files (no permission needed). Use MediaStore with granular permissions for shared media. Use the Storage Access Framework for user-selected files — let users control what they share.

### Lesson 8.4: User Data Deletion

When a user deletes their account or requests data deletion, you must delete everything — local storage, cached files, database entries, analytics identifiers, and any server-side data through API calls. Google Play policies and GDPR require this, and failing to comply can result in app removal or legal consequences.

```kotlin
class UserDataDeletor(
    private val context: Context,
    private val database: AppDatabase,
    private val secureStorage: SecureStorage,
    private val api: UserApi
) {
    suspend fun deleteAllUserData(userId: String): DeletionResult {
        val results = mutableListOf<String>()

        // 1. Delete server-side data first
        try {
            api.deleteUser(userId)
            results.add("Server data deleted")
        } catch (e: Exception) {
            return DeletionResult.Failed("Server deletion failed: ${e.message}")
        }

        // 2. Clear encrypted preferences
        secureStorage.clearAll()
        results.add("Secure preferences cleared")

        // 3. Clear database
        database.clearAllTables()
        results.add("Database cleared")

        // 4. Delete app-specific files
        context.filesDir.listFiles()?.forEach { it.deleteRecursively() }
        context.cacheDir.listFiles()?.forEach { it.deleteRecursively() }
        context.getExternalFilesDir(null)?.listFiles()?.forEach {
            it.deleteRecursively()
        }
        results.add("Local files deleted")

        // 5. Clear WebView data
        CookieManager.getInstance().removeAllCookies(null)
        WebStorage.getInstance().deleteAllData()
        results.add("WebView data cleared")

        // 6. Reset analytics identifiers
        // Firebase: FirebaseAnalytics.getInstance(context).resetAnalyticsData()
        results.add("Analytics reset")

        return DeletionResult.Success(results)
    }
}

sealed class DeletionResult {
    data class Success(val steps: List<String>) : DeletionResult()
    data class Failed(val reason: String) : DeletionResult()
}
```

The order matters. Delete server-side data first, because if the local deletion succeeds but the server call fails, the user has no way to retry (they've already lost their tokens). By deleting server data first, a failure means the user can retry with their existing session. Only after server-side deletion succeeds should you clear local data.

Don't forget WebView data — cookies, local storage, and cached pages can contain sensitive information. Also reset any analytics identifiers to prevent the user from being tracked after deletion. If you use Firebase Analytics, call `resetAnalyticsData()`. If you use custom identifiers, generate new ones.

**Key takeaway:** Delete server-side data first, then local data. Clear everything — preferences, databases, files, cache, WebView data, and analytics identifiers. The deletion order matters for error recovery.

### Lesson 8.5: Privacy-Compliant Data Handling

Beyond individual data points, your app's overall data handling architecture should be designed with privacy in mind. This means using hashes or anonymized identifiers instead of raw PII where possible, limiting data retention periods, and being transparent about what you collect.

```kotlin
class PrivacyCompliantDataHandler {

    // Store hashed emails instead of raw emails
    fun hashEmail(email: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(
            email.lowercase().trim().toByteArray(Charsets.UTF_8)
        )
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

    // Use approximate location instead of precise coordinates
    fun approximateLocation(latitude: Double, longitude: Double): Pair<Double, Double> {
        // Round to 2 decimal places (~1.1 km precision)
        val approxLat = (latitude * 100).roundToInt() / 100.0
        val approxLng = (longitude * 100).roundToInt() / 100.0
        return Pair(approxLat, approxLng)
    }

    // Generate anonymous session identifiers
    fun generateAnonymousId(): String {
        return UUID.randomUUID().toString()
    }

    // Redact PII from crash reports
    fun sanitizeForCrashReport(data: Map<String, Any>): Map<String, Any> {
        val sensitiveKeys = setOf(
            "email", "phone", "name", "address",
            "token", "password", "ssn", "card"
        )
        return data.mapValues { (key, value) ->
            if (sensitiveKeys.any { key.contains(it, ignoreCase = true) }) {
                "***REDACTED***"
            } else {
                value
            }
        }
    }
}
```

A practical pattern I follow: any time user data flows through the app, it should go through a privacy layer that hashes, redacts, or approximates the data before it reaches logging, analytics, or crash reporting. The raw data exists only in the view layer (showing the user their own email) and the network layer (sending it to your API). Everywhere else — logs, analytics events, crash reports — uses the sanitized version.

**Key takeaway:** Use hashes instead of raw PII where the raw value isn't needed for display. Approximate location data. Redact sensitive fields from crash reports and analytics. Build a privacy layer that sanitizes data before it reaches any logging or analytics pipeline.

### Quiz: Privacy Best Practices

#### What is the principle of data minimization?

- ❌ Encrypt all data before storing it
- ❌ Store data in the smallest file format possible
- ✅ Only collect and retain data that is necessary for your app's functionality
- ❌ Minimize the number of API calls that transmit data

> **Explanation:** Data minimization means collecting only what you need, avoiding PII in logs, using analytics sparingly, and deleting data when no longer needed. Every piece of data you collect is a liability — if you don't need it, don't collect it.

#### When should you request a runtime permission from the user?

- ❌ At app launch, requesting all permissions at once
- ❌ In the splash screen before the main activity loads
- ✅ At the point of use, right when the feature requiring the permission is accessed
- ❌ In a background service when the user isn't looking

> **Explanation:** Requesting permissions at the point of use gives the user context about why the permission is needed. Asking for camera permission when the user taps "Take Photo" makes intuitive sense. Asking at launch feels invasive and increases denial.

#### Why should server-side data be deleted before local data during account deletion?

- ❌ Server-side data takes longer to delete
- ❌ Local data deletion is irreversible
- ✅ If local tokens are cleared first and the server call fails, the user can't retry deletion
- ❌ Server-side data isn't covered by privacy regulations

> **Explanation:** If you clear local tokens and the server deletion fails, the user has lost their authentication state and can't retry. By deleting server data first, a failure means the user still has their session and can retry. Only after server-side deletion succeeds should you clear local data.

#### What should you use instead of precise GPS coordinates when your app only needs approximate user location?

- ❌ The user's IP address
- ✅ Coordinates rounded to 2 decimal places (~1.1 km precision)
- ❌ The device's IMEI number
- ❌ The cell tower ID

> **Explanation:** Rounding GPS coordinates to 2 decimal places provides city-level precision (~1.1 km) without pinpointing the user's exact location. This is sufficient for weather, local news, or regional content, and significantly reduces the privacy impact of location collection.

### Coding Challenge: Privacy-Compliant Analytics Wrapper

Build an analytics wrapper that sanitizes all events before sending them, enforces data minimization, and respects user opt-out preferences.

#### Solution

```kotlin
class PrivacyAnalytics(
    private val context: Context,
    private val secureStorage: SecureStorage
) {
    companion object {
        private const val KEY_ANALYTICS_OPTED_IN = "analytics_opted_in"
        private val FORBIDDEN_PARAMS = setOf(
            "email", "phone", "name", "password",
            "token", "address", "ssn", "card_number"
        )
    }

    fun setOptIn(optedIn: Boolean) {
        secureStorage.putBoolean(KEY_ANALYTICS_OPTED_IN, optedIn)
    }

    fun isOptedIn(): Boolean {
        return secureStorage.getBoolean(KEY_ANALYTICS_OPTED_IN, default = false)
    }

    fun trackEvent(name: String, params: Map<String, String> = emptyMap()) {
        if (!isOptedIn()) return

        val sanitizedName = name.take(40)
        val sanitizedParams = params
            .filterKeys { key ->
                FORBIDDEN_PARAMS.none { forbidden ->
                    key.contains(forbidden, ignoreCase = true)
                }
            }
            .mapValues { (_, value) -> value.take(100) }

        // Send to analytics backend
        sendToAnalytics(sanitizedName, sanitizedParams)
    }

    fun trackScreenView(screenName: String) {
        trackEvent("screen_view", mapOf("screen" to screenName))
    }

    private fun sendToAnalytics(name: String, params: Map<String, String>) {
        // Implementation: Firebase Analytics, Mixpanel, etc.
        // The sanitization above ensures no PII reaches the analytics service
    }
}
```

This wrapper enforces three privacy principles: user consent (opt-in check before every event), data minimization (forbidden parameters are silently dropped, not just renamed), and value limiting (event names and parameter values are truncated to prevent accidental PII inclusion). The default opt-in state is `false`, meaning analytics are off until the user explicitly enables them.

---

## Module 9: Security Testing and Auditing

Security testing is the final layer of defense — your opportunity to find vulnerabilities before attackers do. The best security code in the world is worthless if a misconfiguration, an overlooked edge case, or a third-party dependency introduces a hole. Testing is not a one-time event; it is an ongoing practice that should be part of your CI pipeline, your release checklist, and your team's culture.

### Lesson 9.1: Security Audit Checklist

Before every release, run through a comprehensive security checklist that covers every layer of your app's security posture. This is not just about checking boxes — it is about understanding what each check protects against and why skipping it creates risk.

**Storage** — No sensitive data in plain SharedPreferences. No hardcoded secrets in source code or BuildConfig. EncryptedSharedPreferences or SQLCipher used for sensitive data. No PII in cache files. No sensitive data on external storage. Database passphrases derived from KeyStore, not hardcoded.

**Network** — HTTPS only, no cleartext traffic permitted. Certificate pinning enabled for sensitive APIs with backup pins and expiration dates. Auth headers redacted from logging interceptors. Logging disabled entirely in release builds. WebSocket connections use `wss://`, not `ws://`.

**Components** — No unnecessarily exported Activities, Services, Receivers, or Providers. All exported components protected with custom permissions or intent validation. Deep links validated for scheme, host, and path. Content providers restricted to minimum necessary columns.

**Logging** — No PII in logs. No tokens, passwords, or API keys in log output. R8 `-assumenosideeffects` configured to strip debug/verbose/info logs from release builds. Crash reporting configured to redact sensitive fields.

**Code** — R8/ProGuard enabled with obfuscation. No `android:debuggable="true"` in release builds. Root detection implemented for sensitive apps. Runtime integrity checks (Frida/Xposed detection) for high-security apps. `allowBackup` set to `false` or configured with encrypted backup rules.

**Auth** — Tokens stored in EncryptedSharedPreferences. Session timeout implemented. Biometric authentication for sensitive operations uses CryptoObject pattern. Refresh tokens have bounded lifetime. Logout clears all local credentials.

**Dependencies** — Dependencies audited for known vulnerabilities. SDK permissions reviewed. Third-party SDK data collection documented and justified.

**Key takeaway:** A security checklist is not a substitute for threat modeling, but it catches the configuration errors that account for most real-world vulnerabilities. Review it before every release, not just when security is on your mind.

### Lesson 9.2: Decompiling Your Own APK

The most revealing security test you can perform is decompiling your own release APK and examining it from an attacker's perspective. Tools like jadx, APKTool, and dex2jar make this trivial. If you can find a secret, an attacker can too.

The practical process: download your APK from the Play Store (or extract from your build artifacts), run jadx on it, and search the decompiled output for string literals. Look for anything that resembles an API key, credential, or sensitive URL. Check the AndroidManifest.xml for `debuggable="true"`, `allowBackup="true"`, exported components without permissions, and `usesCleartextTraffic="true"`. Open the `network_security_config.xml` and verify certificate pins are present.

I make it a habit to decompile every release APK before it goes live. It takes 10 minutes and has caught several issues that slipped through code review — BuildConfig fields containing staging environment credentials, a logging interceptor set to BODY level in release, and an exported activity leftover from a debugging session. In a security comparison I conducted on a production news app, the decompilation revealed clear text traffic enabled, backup set to true, and no root detection — all medium-risk findings that nobody had noticed in code review.

**Key takeaway:** Decompile your own release APK and examine it as an attacker would. If you can find a secret or a misconfiguration, an attacker can too. Make this part of your release process.

### Lesson 9.3: Dynamic Analysis with Frida

Frida is a dynamic instrumentation toolkit that lets security testers inject JavaScript into running processes. Understanding how Frida works helps you test your own app's runtime security and understand what attackers can do. You are not using Frida to attack — you are using it to verify that your defenses hold up.

Common Frida use cases for testing your own app: bypass root detection to verify it is implemented (and how easily it can be defeated), hook `SharedPreferences.getString()` to verify no sensitive data is stored in plain preferences, intercept `Cipher.doFinal()` to verify encryption is happening before data is written to disk, and monitor all HTTP traffic to verify certificate pinning is enforced.

The insight from testing with Frida is understanding the limits of client-side security. Any check-then-act pattern (check if rooted, then show error) can be bypassed by hooking the check function and modifying its return value. Any value in memory can be read. Any function can be intercepted. This is why server-side validation is essential for security-critical decisions — the client provides defense-in-depth, but the server is the final authority. People doing reverse engineering are possibly running apps on rooted devices, reading app logs, and using dynamic instrumentation — your security has to account for all of these scenarios.

**Key takeaway:** Use Frida to test your own app's runtime security. If you can bypass a check with Frida, an attacker can too. Move critical security decisions to the server where they cannot be instrumented.

### Lesson 9.4: Automated Security Scanning

Automated security scanning tools catch common vulnerabilities without manual analysis. MobSF (Mobile Security Framework), Android Lint's security checks, and dependency vulnerability scanners should all be part of your CI pipeline.

```kotlin
class SecurityAuditor(private val context: Context) {

    fun runFullAudit(): List<AuditResult> = listOf(
        checkDebuggable(),
        checkBackupAllowed(),
        checkCleartextTraffic(),
        checkExportedComponents(),
        checkMinSdkVersion(),
        checkPermissionCount()
    )

    private fun checkDebuggable(): AuditResult {
        val isDebuggable = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return AuditResult(
            check = "App not debuggable",
            severity = if (isDebuggable) "CRITICAL" else "INFO",
            passed = !isDebuggable,
            detail = if (isDebuggable) "CRITICAL: App is debuggable"
                     else "Not debuggable in this build"
        )
    }

    private fun checkBackupAllowed(): AuditResult {
        val allowBackup = context.applicationInfo.flags and
            ApplicationInfo.FLAG_ALLOW_BACKUP != 0
        return AuditResult(
            check = "Backup configuration",
            severity = if (allowBackup) "MEDIUM" else "INFO",
            passed = !allowBackup,
            detail = if (allowBackup) "allowBackup=true, data extractable via ADB"
                     else "Backup disabled"
        )
    }

    private fun checkCleartextTraffic(): AuditResult {
        val allowsCleartext = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            context.applicationInfo.flags and
                ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC != 0
        } else true
        return AuditResult(
            check = "Cleartext traffic disabled",
            severity = if (allowsCleartext) "MEDIUM" else "INFO",
            passed = !allowsCleartext,
            detail = if (allowsCleartext) "HTTP traffic permitted"
                     else "Only HTTPS allowed"
        )
    }

    private fun checkExportedComponents(): AuditResult {
        val pm = context.packageManager
        val pi = pm.getPackageInfo(
            context.packageName,
            PackageManager.GET_ACTIVITIES or PackageManager.GET_PROVIDERS or
            PackageManager.GET_RECEIVERS or PackageManager.GET_SERVICES
        )
        val exported =
            (pi.activities?.count { it.exported } ?: 0) +
            (pi.providers?.count { it.exported } ?: 0) +
            (pi.receivers?.count { it.exported } ?: 0) +
            (pi.services?.count { it.exported } ?: 0)
        return AuditResult(
            check = "Exported components",
            severity = if (exported > 5) "HIGH" else if (exported > 3) "MEDIUM" else "LOW",
            passed = exported <= 3,
            detail = "$exported components exported. Review each one."
        )
    }

    private fun checkMinSdkVersion(): AuditResult {
        val minSdk = context.applicationInfo.minSdkVersion
        return AuditResult(
            check = "Minimum SDK >= 24",
            severity = if (minSdk < 24) "LOW" else "INFO",
            passed = minSdk >= 24,
            detail = "minSdk is $minSdk"
        )
    }

    private fun checkPermissionCount(): AuditResult {
        val pi = context.packageManager.getPackageInfo(
            context.packageName, PackageManager.GET_PERMISSIONS
        )
        val count = pi.requestedPermissions?.size ?: 0
        return AuditResult(
            check = "Permission count",
            severity = if (count > 15) "HIGH" else if (count > 10) "MEDIUM" else "LOW",
            passed = count <= 10,
            detail = "$count permissions requested"
        )
    }

    fun generateReport(): String = buildString {
        appendLine("=== Security Audit Report ===")
        appendLine("Package: ${context.packageName}")
        appendLine()
        runFullAudit().forEach { result ->
            val icon = if (result.passed) "✅" else "❌"
            appendLine("$icon [${result.severity}] ${result.check}")
            appendLine("   ${result.detail}")
        }
    }
}

data class AuditResult(
    val check: String,
    val severity: String,
    val passed: Boolean,
    val detail: String
)
```

Run the auditor on every debug build to catch misconfigurations early. In your CI pipeline, run static analysis tools (MobSF, Android Lint with security rules) on every PR. For dependencies, use tools like Dependabot, Snyk, or OWASP Dependency-Check to flag libraries with known CVEs. A vulnerable dependency is a vulnerability in your app — even if your own code is flawless.

**Key takeaway:** Automate security checks in your CI pipeline. Run the auditor on every build. Scan dependencies for known vulnerabilities. Manual review catches logic flaws; automation catches configuration errors.

### Lesson 9.5: The OWASP Mobile Top 10

The OWASP Mobile Top 10 is the industry-standard reference for mobile security risks. Understanding these categories helps you prioritize your security efforts and communicate with security teams.

The top risks relevant to Android include **insecure data storage** (storing sensitive data in plain SharedPreferences, logs, or backups), **insecure communication** (cleartext traffic, missing certificate pinning), **insecure authentication** (weak session management, hardcoded credentials), **insufficient cryptography** (weak algorithms, hardcoded keys, missing integrity checks), **insecure authorization** (client-side authorization checks without server validation), **code tampering** (no integrity verification, no root detection), **reverse engineering** (no obfuscation, secrets in code), and **extraneous functionality** (debug features in production, hidden admin endpoints).

Each category maps directly to the modules in this course. Insecure data storage maps to Module 3 (Secure Data Storage). Insecure communication maps to Module 4 (Network Security). Insecure authentication maps to Module 5 (Authentication and Biometrics). Code tampering and reverse engineering map to Module 6 (Code Protection). Use the OWASP Mobile Testing Guide as your reference when performing security assessments — it provides specific test cases for each risk category, with step-by-step instructions for both static and dynamic analysis.

**Key takeaway:** The OWASP Mobile Top 10 provides a prioritized framework for mobile security. Use it as a checklist for security assessments and as a common language when communicating with security teams.

### Lesson 9.6: Incident Response for Mobile Apps

Even with perfect security measures, incidents happen. A compromised dependency, a server-side breach, or a zero-day vulnerability can expose your users. Having an incident response plan specific to mobile apps ensures you can react quickly and effectively.

```kotlin
class SecurityIncidentHandler(
    private val context: Context,
    private val api: SecurityApi,
    private val tokenManager: TokenManager
) {
    suspend fun handleCompromisedTokens() {
        try {
            api.revokeAllTokens()
        } catch (e: Exception) {
            // Log but continue, local cleanup is essential
        }

        tokenManager.clearTokens()
        SecureStorage.getInstance(context).putBoolean("force_reauth", true)
    }

    suspend fun handleCompromisedKey(keyAlias: String) {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (keyStore.containsAlias(keyAlias)) {
            keyStore.deleteEntry(keyAlias)
        }

        SecureStorage.getInstance(context).clearAll()
        KeyStoreManager.generateSecretKey(keyAlias)
    }

    fun shouldForceUpdate(
        currentVersion: Int,
        minimumSafeVersion: Int
    ): Boolean {
        return currentVersion < minimumSafeVersion
    }
}
```

Mobile-specific incident response includes force-update mechanisms (requiring users to update to a patched version), remote feature switches (disabling compromised features via server-side config), token revocation (invalidating all active sessions), and key rotation (generating new encryption keys). The `shouldForceUpdate` check should happen on every app launch, comparing the installed version against a server-provided minimum safe version. If a critical vulnerability is discovered, bump the minimum version to force users onto the patched release.

**Key takeaway:** Have an incident response plan that includes force-update mechanisms, token revocation, key rotation, and remote feature switches. Practice the plan before you need it.

### Quiz: Security Testing

#### Which tool is used to decompile an APK and inspect its contents?

- ❌ Android Lint
- ✅ jadx or APKTool
- ❌ LeakCanary
- ❌ Android Profiler

> **Explanation:** jadx and APKTool decompile APK files, allowing you to inspect resources, manifest, and decompiled source code. This lets you verify obfuscation, check for hardcoded secrets, and review exported component configurations.

#### What is the primary limitation of client-side security checks?

- ❌ They consume too much battery
- ❌ They violate Google Play policies
- ✅ They can be bypassed by hooking functions with tools like Frida
- ❌ They only work on specific device manufacturers

> **Explanation:** Any client-side check follows a check-then-act pattern that can be intercepted with Frida or Xposed. An attacker can hook the `isRooted()` function and force it to return `false`. Critical security decisions should be validated server-side.

#### Why should you decompile your own release APK before publishing?

- ❌ To verify APK file size
- ❌ To ensure all features work
- ✅ To verify secrets are not visible, obfuscation works, and no debug artifacts remain
- ❌ To check translations

> **Explanation:** Decompiling your APK lets you see exactly what an attacker would see. You can verify string obfuscation, check for visible API keys, confirm debuggable=false, and ensure logging interceptors are not set to verbose.

#### What does the OWASP Mobile Top 10 provide?

- ❌ A list of the top 10 Android security APIs
- ❌ A ranking of the most secure mobile frameworks
- ✅ A prioritized framework of the most critical mobile security risks
- ❌ A certification program for mobile developers

> **Explanation:** The OWASP Mobile Top 10 catalogs the most critical security risks for mobile applications, including insecure data storage, insecure communication, insecure authentication, and insufficient cryptography. It serves as both a checklist and a common language for security discussions.

### Coding Challenge: Comprehensive Security Auditor

Build a `ComprehensiveAuditor` that checks manifest flags, exported components, and permissions, then generates a scored report with severity levels and actionable recommendations.

#### Solution

```kotlin
class ComprehensiveAuditor(private val context: Context) {

    data class Finding(
        val id: String,
        val title: String,
        val severity: String,
        val passed: Boolean,
        val description: String,
        val recommendation: String
    )

    fun runAudit(): List<Finding> = listOf(
        auditDebuggable(),
        auditBackup(),
        auditCleartext(),
        auditMinSdk(),
        auditExportedCount(),
        auditPermissions()
    )

    private fun auditDebuggable(): Finding {
        val debuggable = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return Finding(
            id = "M001",
            title = "Debuggable flag",
            severity = if (debuggable) "CRITICAL" else "PASS",
            passed = !debuggable,
            description = if (debuggable)
                "App is debuggable. Attackers can attach debugger and inspect memory."
            else "Not debuggable.",
            recommendation = "Set android:debuggable=false in release."
        )
    }

    private fun auditBackup(): Finding {
        val backup = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_ALLOW_BACKUP) != 0
        return Finding(
            id = "M002",
            title = "Backup config",
            severity = if (backup) "MEDIUM" else "PASS",
            passed = !backup,
            description = if (backup) "Data extractable via adb backup."
            else "Backup disabled.",
            recommendation = "Set android:allowBackup=false."
        )
    }

    private fun auditCleartext(): Finding {
        val cleartext = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            context.applicationInfo.flags and
                ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC != 0
        } else true
        return Finding(
            id = "N001",
            title = "Cleartext traffic",
            severity = if (cleartext) "MEDIUM" else "PASS",
            passed = !cleartext,
            description = if (cleartext) "HTTP permitted." else "HTTPS only.",
            recommendation = "Disable cleartext in network security config."
        )
    }

    private fun auditMinSdk(): Finding {
        val sdk = context.applicationInfo.minSdkVersion
        return Finding(
            id = "P001",
            title = "Min SDK",
            severity = if (sdk < 24) "LOW" else "PASS",
            passed = sdk >= 24,
            description = "minSdk=$sdk",
            recommendation = "Target 24+ for security features."
        )
    }

    private fun auditExportedCount(): Finding {
        val pm = context.packageManager
        val pi = pm.getPackageInfo(context.packageName,
            PackageManager.GET_ACTIVITIES or PackageManager.GET_SERVICES or
            PackageManager.GET_RECEIVERS or PackageManager.GET_PROVIDERS)
        val count = listOfNotNull(
            pi.activities, pi.services, pi.receivers, pi.providers
        ).sumOf { arr -> arr.count { it.exported } }
        return Finding(
            id = "C001",
            title = "Exported components",
            severity = if (count > 5) "HIGH" else if (count > 3) "MEDIUM" else "PASS",
            passed = count <= 3,
            description = "$count components exported.",
            recommendation = "Default to exported=false. Review each export."
        )
    }

    private fun auditPermissions(): Finding {
        val pi = context.packageManager.getPackageInfo(
            context.packageName, PackageManager.GET_PERMISSIONS)
        val count = pi.requestedPermissions?.size ?: 0
        return Finding(
            id = "PR001",
            title = "Permission count",
            severity = if (count > 10) "MEDIUM" else "PASS",
            passed = count <= 10,
            description = "$count permissions.",
            recommendation = "Audit each. Delegate where possible."
        )
    }

    fun generateReport(): String {
        val findings = runAudit()
        val score = ((findings.count { it.passed }.toFloat() /
            findings.size) * 100).toInt()

        return buildString {
            appendLine("=== Security Audit Report ===")
            appendLine("Package: ${context.packageName}")
            appendLine("Score: $score/100")
            appendLine()
            findings.forEach { f ->
                val icon = if (f.passed) "PASS" else "FAIL"
                appendLine("[$icon] [${f.severity}] ${f.title}: ${f.description}")
                if (!f.passed) appendLine("  Recommendation: ${f.recommendation}")
            }
        }
    }
}
```

This auditor produces a scored report with categorized findings, severity levels, and actionable recommendations. Run it in your CI pipeline on release builds to catch misconfigurations automatically. Extend it with app-specific checks based on your threat model.

---

Thank You for completing the Android Security & Privacy course! Security is not a feature you add later. It is a responsibility to your users. Build with it from day one.
