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

Android's security architecture is built on multiple reinforcing layers, each designed to contain the damage if another layer is compromised. At the foundation sits the Linux kernel, which provides process isolation through unique UIDs. Every app runs in its own process, and the kernel enforces file system boundaries at the process level — App A simply cannot read App B's private files. This is not an application-level check that can be bypassed with a clever hack; it's enforced by the operating system kernel itself. When Android installs an app, it assigns a unique Linux user ID (UID) and group ID (GID), and all files created by that app are owned by that UID. The kernel then uses standard Unix file permissions to prevent any other UID from reading, writing, or executing those files.

On top of process isolation, Android layers SELinux (Security-Enhanced Linux), which applies mandatory access control policies. Even if an attacker gains root access, SELinux policies restrict what processes can do — a compromised media process can't suddenly access the keystore daemon. SELinux operates in "enforcing" mode on all modern Android devices, meaning policy violations are not just logged but actively blocked. The policies are defined by Google and device manufacturers and are loaded during the boot process. Each process runs in a specific SELinux context (domain), and the policy defines exactly which files, sockets, and system calls that domain can access. For example, the `untrusted_app` domain (which all third-party apps run in) cannot access `/data/data/` directories belonging to other apps, cannot directly communicate with hardware drivers, and cannot modify system files — even if the process somehow gained root privileges through an exploit.

Verified Boot ensures the device firmware and OS haven't been tampered with, creating a chain of trust from the bootloader to the application layer. During every boot, the bootloader verifies the integrity of the next stage (the kernel), which verifies the system partition, which verifies the vendor partition. If any stage has been modified, the device either refuses to boot or displays a warning to the user. This chain of trust is anchored in hardware — a root of trust key burned into the device's secure hardware during manufacturing. Application sandboxing means each app gets its own slice of the filesystem under `/data/data/<package_name>/`, and the kernel prevents cross-app file access. The combination of process isolation, SELinux, and Verified Boot creates a defense-in-depth architecture where compromising one layer doesn't automatically compromise the others.

Understanding the practical implications of this model is crucial. Android gives you a strong security foundation by default. Your job as a developer is to not weaken it. Misconfigured content providers, world-readable files, exported components without permissions, debug flags left in production — these are all ways you punch holes in the sandbox that Android built for you. Consider what happens when you set `android:exported="true"` on a service without requiring a permission: you've effectively opened a door in the sandbox wall that any app on the device can walk through. Or when you write files with `MODE_WORLD_READABLE` (deprecated but still possible): you've told the kernel to let any UID read your file, bypassing the very isolation that protects your data.

```kotlin
// ❌ VULNERABLE: Weakening the sandbox
// Writing a world-readable file — any app can read it
val fos = openFileOutput("user_token.txt", Context.MODE_WORLD_READABLE)
fos.write(authToken.toByteArray())
fos.close()

// ❌ VULNERABLE: Exported service with no permission
// Any app can bind to this service and call its methods
// <service android:name=".DataService" android:exported="true" />
```

```kotlin
// ✅ SECURE: Using the sandbox correctly
// MODE_PRIVATE ensures only your app's UID can access the file
val fos = openFileOutput("user_token.txt", Context.MODE_PRIVATE)
fos.write(authToken.toByteArray())
fos.close()

// ✅ SECURE: Non-exported service — only your app can use it
// <service android:name=".DataService" android:exported="false" />
```

```kotlin
// Verifying sandbox integrity at runtime
fun verifySandboxIntegrity(context: Context): Boolean {
    val privateDir = context.filesDir
    // Verify the directory belongs to our package
    if (!privateDir.absolutePath.contains(context.packageName)) {
        return false
    }
    // Verify we can create private files
    val testFile = File(privateDir, ".integrity_check")
    return try {
        testFile.createNewFile()
        testFile.delete()
        true
    } catch (e: SecurityException) {
        false
    }
}
```

The apps I've worked on in production had security issues not because Android's model was weak, but because developers didn't understand what the platform already provides and inadvertently bypassed its protections. One common misconception is that root access "breaks" Android security entirely. While root access does allow bypassing file permission checks (since root has UID 0), SELinux policies still apply even to root processes. A rooted device is less secure, but Android's layered model means even root doesn't grant unlimited power — the TEE remains isolated, KeyStore keys remain unextractable, and SELinux continues to enforce mandatory access control policies on all processes.

Another common vulnerability arises from inter-process communication (IPC). Android provides several IPC mechanisms — Intents, Binder, ContentProviders, and BroadcastReceivers. Each of these can be configured to be accessible only within your app or open to other apps. The default behavior has changed across Android versions (notably Android 12 requiring explicit `exported` declarations), but the principle remains: every IPC endpoint you expose is an attack surface. A content provider that returns user data without verifying the caller's identity, an activity that processes deep link parameters without validation, or a broadcast receiver that acts on messages from any sender — these are the holes that attackers exploit.

**Key takeaway:** Android's sandbox is strong by default. Your job is to not weaken it — don't expose data through misconfigured content providers, world-readable files, or exported components.

### Lesson 1.2: Threat Modeling for Mobile

Before writing a single line of security code, you need to understand what you're protecting and who you're protecting it from. Threat modeling is the process of identifying your app's assets (user data, API keys, session tokens), the adversaries who might target them (script kiddies, sophisticated attackers, state actors), and the attack vectors they'd use (reverse engineering, network interception, physical device access). Without this exercise, you'll waste time hardening areas that don't matter while leaving critical vulnerabilities wide open. A banking app that invests heavily in root detection but stores auth tokens in plain SharedPreferences has its priorities backwards.

Mobile threat categories break down into five areas. **Data at rest** covers sensitive information stored on the device — tokens, PII, credentials, cached content. An attacker who gains physical access to the device, or who installs malware that runs with root privileges, can extract files from your app's private directory. The attack scenario here is straightforward: the attacker connects the device to a computer, runs `adb backup` (if `allowBackup` is true), and extracts the backup to read your SharedPreferences XML files, database files, and cached content. On a rooted device, they don't even need ADB — they can browse your app's `/data/data/` directory directly with a file manager. **Data in transit** covers network communication — API calls, WebSocket connections, push notification payloads. The classic attack here is a man-in-the-middle (MitM): the attacker sets up a rogue Wi-Fi hotspot at a coffee shop, installs a proxy certificate on the victim's device, and intercepts all HTTPS traffic. Without certificate pinning, the TLS handshake completes successfully with the proxy's certificate because it chains to a user-installed CA.

**Reverse engineering** is about APK decompilation and code analysis — an attacker downloading your APK from the Play Store and extracting secrets. Tools like jadx can decompile any APK in seconds, producing near-original Java/Kotlin source code. String constants (API keys, encryption passwords, debug URLs) survive compilation verbatim — they're not obfuscated by R8. The attacker doesn't even need a device; they can decompile the APK on their laptop and read your source code at their leisure. **Runtime attacks** involve tools like Frida and Xposed that hook into running processes to bypass checks, modify return values, and intercept function calls. Frida injects a JavaScript engine into your running app, allowing the attacker to hook any function, read any memory address, and modify any return value in real time. If your root detection function returns `true`, the attacker hooks it to return `false`. If your biometric check callback fires `onAuthenticationFailed`, the attacker hooks it to fire `onAuthenticationSucceeded` instead. **Supply chain** attacks target your dependencies — compromised libraries, malicious SDKs, or build tool vulnerabilities. A compromised analytics SDK could silently exfiltrate user data, a backdoored image loading library could execute arbitrary code, or a malicious Gradle plugin could inject code during the build process.

```kotlin
// A threat model for a fintech app
data class ThreatModel(
    val assets: List<Asset>,
    val adversaries: List<Adversary>,
    val threats: List<Threat>
)

data class Asset(
    val name: String,
    val sensitivity: Sensitivity,
    val storageLocation: String
)

data class Adversary(
    val type: String,
    val capability: String,
    val motivation: String
)

data class Threat(
    val asset: String,
    val attackVector: String,
    val likelihood: String,
    val impact: String,
    val mitigation: String
)

enum class Sensitivity { LOW, MEDIUM, HIGH, CRITICAL }

// Example threat model for a banking app
val bankingThreatModel = ThreatModel(
    assets = listOf(
        Asset("Auth tokens", Sensitivity.CRITICAL, "EncryptedSharedPreferences"),
        Asset("Account balance", Sensitivity.HIGH, "In-memory only"),
        Asset("Transaction history", Sensitivity.HIGH, "Encrypted Room DB"),
        Asset("User PII", Sensitivity.HIGH, "Server-side only"),
        Asset("API keys", Sensitivity.CRITICAL, "Server-side proxy")
    ),
    adversaries = listOf(
        Adversary("Script kiddie", "APK decompilation, basic Frida", "Curiosity"),
        Adversary("Sophisticated attacker", "Custom Frida scripts, binary analysis", "Financial gain"),
        Adversary("Malware on device", "Read files, intercept intents", "Data theft")
    ),
    threats = listOf(
        Threat("Auth tokens", "ADB backup extraction", "HIGH", "CRITICAL",
            "Set allowBackup=false, use EncryptedSharedPreferences"),
        Threat("Auth tokens", "MitM on public Wi-Fi", "MEDIUM", "CRITICAL",
            "Certificate pinning with backup pins"),
        Threat("API keys", "APK decompilation", "HIGH", "HIGH",
            "Server-side proxy, never embed in client"),
        Threat("Transaction history", "Root access file extraction", "LOW", "HIGH",
            "SQLCipher with KeyStore-derived passphrase")
    )
)
```

```kotlin
// Risk scoring to prioritize security investments
fun calculateRiskScore(likelihood: String, impact: String): Int {
    val likelihoodScore = when (likelihood) {
        "LOW" -> 1; "MEDIUM" -> 2; "HIGH" -> 3; else -> 0
    }
    val impactScore = when (impact) {
        "LOW" -> 1; "MEDIUM" -> 2; "HIGH" -> 3; "CRITICAL" -> 4; else -> 0
    }
    return likelihoodScore * impactScore
}

// Sort threats by risk score to prioritize
val prioritizedThreats = bankingThreatModel.threats
    .sortedByDescending { calculateRiskScore(it.likelihood, it.impact) }
```

The key insight is that different apps need different security postures. A banking app handling financial transactions needs certificate pinning, root detection, runtime integrity checks, and hardware-backed encryption. A weather app displaying public data needs basic HTTPS and proper permission handling, but investing in anti-tampering is overkill. When I worked on a news app, the security audit revealed that clear text traffic was enabled and backup was set to true — medium-risk findings for a content app, but they'd be critical findings for a fintech app. Prioritize based on what your app actually handles. The cost of security is always paid in development time, user experience (biometric prompts, permission dialogs), and maintenance complexity. Over-engineering security for a low-risk app wastes resources that could be spent on features.

A practical approach to threat modeling is the STRIDE framework adapted for mobile. **Spoofing** — can an attacker impersonate the user or the app? (Think stolen tokens, repackaged APKs.) **Tampering** — can data be modified in transit or at rest? (Think MitM attacks, modified database files.) **Repudiation** — can users deny they performed an action? (Think unsigned transactions.) **Information disclosure** — can sensitive data leak? (Think logs, backups, decompilation.) **Denial of service** — can the app be made unavailable? (Think overly aggressive certificate pinning, corrupted encrypted storage.) **Elevation of privilege** — can an attacker gain more access than intended? (Think exported components, intent injection.) Run through each category for your app's key features and document the findings.

```kotlin
// STRIDE analysis helper
enum class StrideCategory {
    SPOOFING, TAMPERING, REPUDIATION,
    INFORMATION_DISCLOSURE, DENIAL_OF_SERVICE,
    ELEVATION_OF_PRIVILEGE
}

data class StrideAnalysis(
    val feature: String,
    val category: StrideCategory,
    val threat: String,
    val currentMitigation: String?,
    val requiredAction: String?
)

// Example STRIDE analysis for a login feature
val loginStrideAnalysis = listOf(
    StrideAnalysis(
        feature = "Login",
        category = StrideCategory.SPOOFING,
        threat = "Attacker replays captured auth token",
        currentMitigation = "Short-lived tokens",
        requiredAction = "Add token binding to device fingerprint"
    ),
    StrideAnalysis(
        feature = "Login",
        category = StrideCategory.INFORMATION_DISCLOSURE,
        threat = "Credentials visible in logcat",
        currentMitigation = null,
        requiredAction = "Strip Log.d calls with R8 -assumenosideeffects"
    ),
    StrideAnalysis(
        feature = "Login",
        category = StrideCategory.TAMPERING,
        threat = "MitM modifies login response",
        currentMitigation = "HTTPS",
        requiredAction = "Add certificate pinning"
    )
)
```

**Key takeaway:** You can't protect against everything. Prioritize based on your app's risk profile. A banking app needs different security than a weather app.

### Lesson 1.3: The CIA Triad in Mobile Context

The CIA triad — Confidentiality, Integrity, Availability — is the foundation of information security, and it maps directly to Android development decisions. **Confidentiality** means sensitive data is only accessible to authorized parties. On Android, this translates to encrypted storage, secure network communication, and proper access controls on components. When a user's auth token sits in plain SharedPreferences XML on a rooted device, confidentiality is broken. When your API traffic goes over HTTP instead of HTTPS, confidentiality is broken during transit. When your exported ContentProvider returns raw email addresses without checking the caller's identity, confidentiality is broken through IPC. Every storage decision, every network call, and every component export must be evaluated through the lens of "who can access this data?"

The attack vectors against confidentiality are well-documented. An attacker on the same Wi-Fi network can run a proxy tool like mitmproxy or Charles Proxy to intercept HTTP traffic and read request/response bodies containing tokens, user data, and API responses. On a rooted device, the attacker can navigate to `/data/data/com.yourapp/shared_prefs/` and open your SharedPreferences XML files in a text editor. They can run `adb backup` to extract your entire app data directory to their computer. They can use jadx to decompile your APK and search for hardcoded strings. Each of these attacks targets confidentiality — making private data visible to unauthorized parties.

```kotlin
// ❌ VULNERABLE: Confidentiality broken at multiple levels
class InsecureUserManager(context: Context) {
    // Plain SharedPreferences — readable on rooted device
    private val prefs = context.getSharedPreferences("user", Context.MODE_PRIVATE)

    fun saveUser(email: String, token: String) {
        prefs.edit()
            .putString("email", email)        // Raw PII on disk
            .putString("auth_token", token)    // Raw token on disk
            .apply()
        // Logging token in plaintext
        Log.d("UserManager", "Saved token: $token for $email")
    }
}

// ✅ SECURE: Confidentiality preserved
class SecureUserManager(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs = EncryptedSharedPreferences.create(
        context, "secure_user", masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveUser(emailHash: String, token: String) {
        securePrefs.edit()
            .putString("email_hash", emailHash)  // Hashed, encrypted
            .putString("auth_token", token)       // Encrypted at rest
            .apply()
        // No logging of sensitive data
    }
}
```

**Integrity** means data hasn't been tampered with. On Android, this means verifying that the APK hasn't been repackaged, that network responses haven't been modified in transit (which GCM mode provides), and that stored data hasn't been altered by another process. Certificate pinning protects network integrity. Code signing protects APK integrity. Using HMAC or authenticated encryption (AES-GCM) protects data integrity at rest. If you're using AES-CBC without a separate MAC, you have confidentiality but not integrity — an attacker could flip bits in the ciphertext and you wouldn't detect it. This is known as a bit-flipping attack, and it's not theoretical — it's a well-documented attack against CBC mode encryption.

Consider this concrete scenario: your app stores an encrypted "account_type" field. With CBC mode (no integrity check), an attacker on a rooted device can modify specific bytes of the ciphertext. If they know the plaintext is "free_user" and want to change it to "paid_user", they can calculate the XOR difference and apply it to the ciphertext bytes. With GCM mode, any modification to the ciphertext invalidates the authentication tag, and `doFinal()` throws `AEADBadTagException` — the tampering is immediately detected.

```kotlin
// Demonstrating the difference between CBC (no integrity) and GCM (with integrity)

// ❌ CBC provides confidentiality but NOT integrity
fun encryptWithCBC(data: ByteArray, key: SecretKey): ByteArray {
    val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    // An attacker can modify the ciphertext without detection
    return cipher.iv + cipher.doFinal(data)
}

// ✅ GCM provides BOTH confidentiality AND integrity
fun encryptWithGCM(data: ByteArray, key: SecretKey): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    // Any modification to ciphertext is detected via authentication tag
    return cipher.iv + cipher.doFinal(data)
}

// Verifying integrity on decryption
fun decryptWithIntegrityCheck(
    ciphertext: ByteArray,
    iv: ByteArray,
    key: SecretKey
): ByteArray? {
    return try {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        cipher.doFinal(ciphertext)
    } catch (e: AEADBadTagException) {
        // INTEGRITY VIOLATION: Data has been tampered with
        Log.e("Security", "Data integrity check failed — possible tampering")
        null
    }
}
```

**Availability** means the app and its data remain accessible when needed. This is less discussed in mobile security, but it matters enormously in practice. Overly aggressive certificate pinning without backup pins or expiration dates can brick your app's networking if the certificate rotates. Overly aggressive root detection can lock out legitimate users with custom ROMs — a significant portion of the Android enthusiast community uses LineageOS or other custom ROMs that trigger root detection even though they're not "rooted" in the traditional sense. Encrypting everything with biometric-gated keys means the user can't access their data if they break their finger or if the biometric sensor fails. A user who just had surgery on their fingerprint hand is locked out of their banking app if every operation requires biometric authentication with no fallback.

```kotlin
// ❌ VULNERABLE to availability failures
class OverlyAggressiveSecurity {
    // No backup pin — certificate rotation bricks the app
    fun createHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .certificatePinner(
                CertificatePinner.Builder()
                    .add("api.example.com", "sha256/AAAA") // Single pin, no backup
                    .build()
            )
            .build()
    }

    // No fallback — biometric failure locks user out completely
    fun accessData(onSuccess: (String) -> Unit) {
        biometricPrompt.authenticate(promptInfo) // No device credential fallback
    }
}

// ✅ BALANCED: Security with availability
class BalancedSecurity {
    // Backup pin + expiration = graceful degradation
    fun createHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .certificatePinner(
                CertificatePinner.Builder()
                    .add("api.example.com", "sha256/AAAA") // Primary
                    .add("api.example.com", "sha256/BBBB") // Backup
                    .build()
            )
            .build()
    }

    // Biometric with device credential fallback
    fun accessData(onSuccess: (String) -> Unit) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()
        biometricPrompt.authenticate(promptInfo) // PIN/pattern as fallback
    }
}
```

Every security measure has an availability tradeoff, and the best security engineers balance both. The most secure app in the world is useless if users can't access their own data. Design your security measures with graceful degradation in mind — always have a fallback path that's less convenient but still functional. Certificate pinning should expire gracefully to standard CA validation. Biometric gates should fall back to device credentials. Root detection should warn users rather than blocking them entirely (unless your threat model requires it).

**Key takeaway:** Security decisions involve balancing confidentiality, integrity, and availability. Overly aggressive security can harm availability — certificate pinning without backup pins can brick your app's networking entirely.

### Lesson 1.4: Android Security Architecture Deep Dive

Understanding Android's security architecture at a deeper level helps you make better decisions about where to invest your security efforts. The architecture has four major layers, each providing distinct protections. The **hardware layer** includes the Trusted Execution Environment (TEE) and StrongBox — isolated processors with their own memory that handle cryptographic operations. Keys stored in the TEE never enter the main application processor's memory. Even if the Android OS itself is fully compromised, the TEE remains isolated. The TEE runs its own operating system (often Trusty OS or QSEE) on the same physical processor but in a completely separate execution context. It has its own memory region that the main OS cannot read, its own code that the main OS cannot modify, and its own I/O channels that the main OS cannot intercept.

The TEE processes cryptographic operations through a request-response model. When your app calls `cipher.doFinal(data)` with a KeyStore-backed key, the Android framework marshals the data and sends it to the TEE through a secure driver. The TEE retrieves the key from its protected storage, performs the encryption inside its isolated memory, and returns only the ciphertext to the main OS. The plaintext data briefly exists in the TEE's memory during processing, but the key material never leaves the TEE. This is a fundamental architectural difference from software encryption, where the key sits in your app's process memory and can be read by any debugger or memory dump tool.

The **OS layer** provides process isolation, SELinux policies, seccomp filters (restricting which system calls a process can make), and file-based encryption (FBE). Since Android 10, all devices encrypt user data on the filesystem by default. This means that even without `EncryptedSharedPreferences`, your app's SharedPreferences files are encrypted at the filesystem level when the device is locked. The nuance is that this protection evaporates once the user unlocks the device — after unlock, any process running as the app's UID can read those files in plaintext. That's why additional application-level encryption still matters for highly sensitive data. Seccomp (Secure Computing) filters add another defense layer by restricting which Linux system calls a process can make. Apps run in a seccomp sandbox that blocks dangerous system calls like `ptrace` (debugging), `mount` (filesystem manipulation), and `reboot`. Even if an attacker gains code execution within your app's process, the seccomp filter prevents many privilege escalation techniques.

```kotlin
// Understanding the security layers in practice
class SecurityLayerAnalyzer(private val context: Context) {

    fun analyzeDeviceSecurityLayers(): List<SecurityLayer> {
        return listOf(
            checkHardwareLayer(),
            checkOSLayer(),
            checkFrameworkLayer(),
            checkApplicationLayer()
        )
    }

    private fun checkHardwareLayer(): SecurityLayer {
        val hasStrongBox = try {
            context.packageManager.hasSystemFeature(
                PackageManager.FEATURE_STRONGBOX_KEYSTORE
            )
        } catch (e: Exception) { false }

        // Check if TEE is available by trying to generate a key
        val hasTEE = try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            true // If KeyStore loads, TEE/software backend is available
        } catch (e: Exception) { false }

        return SecurityLayer(
            name = "Hardware",
            features = buildList {
                add("TEE: ${if (hasTEE) "Available" else "Unavailable"}")
                add("StrongBox: ${if (hasStrongBox) "Available" else "Unavailable"}")
            }
        )
    }

    private fun checkOSLayer(): SecurityLayer {
        return SecurityLayer(
            name = "OS",
            features = listOf(
                "SELinux: ${getSELinuxStatus()}",
                "File-Based Encryption: ${if (Build.VERSION.SDK_INT >= 29) "Enforced" else "Varies"}",
                "Verified Boot: Active",
                "Seccomp: Enforced"
            )
        )
    }

    private fun checkFrameworkLayer(): SecurityLayer {
        return SecurityLayer(
            name = "Framework",
            features = listOf(
                "KeyStore API: Available",
                "BiometricPrompt: ${if (Build.VERSION.SDK_INT >= 28) "Available" else "Not available"}",
                "NetworkSecurityConfig: Available",
                "Scoped Storage: ${if (Build.VERSION.SDK_INT >= 30) "Enforced" else "Optional"}"
            )
        )
    }

    private fun checkApplicationLayer(): SecurityLayer {
        val isDebuggable = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE) != 0
        val allowsBackup = (context.applicationInfo.flags and
            ApplicationInfo.FLAG_ALLOW_BACKUP) != 0
        return SecurityLayer(
            name = "Application",
            features = listOf(
                "Debuggable: $isDebuggable",
                "Backup allowed: $allowsBackup",
                "Min SDK: ${context.applicationInfo.minSdkVersion}"
            )
        )
    }

    private fun getSELinuxStatus(): String {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("getenforce"))
            val result = process.inputStream.bufferedReader().readLine()
            process.waitFor()
            result ?: "Unknown"
        } catch (e: Exception) { "Unknown" }
    }
}

data class SecurityLayer(val name: String, val features: List<String>)
```

The **framework layer** provides the permission system, `NetworkSecurityConfig`, `BiometricPrompt`, the `KeyStore` API, and scoped storage. These APIs are your primary tools as an app developer. The permission system controls what capabilities your app has (camera, location, contacts) and is enforced at both the framework and kernel level. NetworkSecurityConfig lets you declare TLS and certificate pinning policies in XML. BiometricPrompt provides a consistent, system-managed authentication UI. The KeyStore API provides hardware-backed key generation and cryptographic operations. Scoped Storage (Android 10+) restricts filesystem access to prevent apps from browsing each other's files.

The **application layer** is your code — and this is where most vulnerabilities live. Hardcoded secrets, misconfigured manifests, insecure IPC, improper use of WebView, and logging sensitive data are all application-layer mistakes. The platform gives you excellent tools, but you have to actually use them correctly. A study of Android vulnerabilities found that over 80% were at the application layer — not exploits against the OS or hardware, but developer mistakes. This is both sobering and empowering: you can't fix kernel bugs, but you can fix your own code.

StrongBox, available on devices running Android 9+, deserves special attention. It's a dedicated security chip with its own CPU, storage, and true random number generator. Unlike the TEE (which shares the main processor), StrongBox is physically separate hardware. When you call `setIsStrongBoxBacked(true)` on a `KeyGenParameterSpec`, the key is generated and stored entirely within this chip. The tradeoff is that StrongBox operations are slower (hardware IPC overhead) and support a smaller set of algorithms (AES-128/256, RSA-2048, ECDSA P-256).

```kotlin
// Checking and leveraging hardware security capabilities
fun generateKeyWithBestAvailableHardware(alias: String): SecretKey {
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

    // Try StrongBox first, fall back to TEE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        try {
            builder.setIsStrongBoxBacked(true)
            keyGenerator.init(builder.build())
            return keyGenerator.generateKey()
        } catch (e: StrongBoxUnavailableException) {
            // StrongBox not available, fall back to TEE
            builder.setIsStrongBoxBacked(false)
        }
    }

    keyGenerator.init(builder.build())
    return keyGenerator.generateKey()
}

// Querying the security level of an existing key
fun getKeySecurityLevel(alias: String): String {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val key = keyStore.getKey(alias, null) ?: return "Key not found"

    return try {
        val factory = SecretKeyFactory.getInstance(
            key.algorithm, "AndroidKeyStore"
        )
        val keyInfo = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
                when (keyInfo.securityLevel) {
                    KeyProperties.SECURITY_LEVEL_STRONGBOX -> "StrongBox (Dedicated Hardware)"
                    KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE (Trusted Execution Environment)"
                    KeyProperties.SECURITY_LEVEL_SOFTWARE -> "Software (No Hardware Protection)"
                    else -> "Unknown"
                }
            keyInfo.isInsideSecureHardware -> "Secure Hardware (TEE or StrongBox)"
            else -> "Software (No Hardware Protection)"
        }
    } catch (e: Exception) {
        "Unable to determine: ${e.message}"
    }
}
```

The practical implications of this layered architecture are significant. When you store a key in the Android KeyStore, you're not just "saving a key in a secure place" — you're placing it in hardware that runs a separate operating system on a physically isolated processor with its own memory and random number generator. Even a full compromise of the Android OS (kernel exploit + root access) cannot extract that key. The key can be used (the TEE will perform encryption with it) but never seen or copied. This is the single most important security primitive available to Android developers, and understanding it at this architectural level helps you appreciate both its strength and its limitations.

**Key takeaway:** Android's security is layered — hardware, OS, framework, and application. Most vulnerabilities exist at the application layer, which is your responsibility. The platform provides excellent tools; the challenge is using them correctly.

### Lesson 1.5: Common Security Mistakes in Production Apps

I've seen a pattern of security mistakes repeated across production apps, and understanding them is the fastest way to avoid them yourself. In a security audit of a news app I worked on, we found **clear text traffic enabled** (`usesCleartextTraffic="true"` in the manifest), **Android backup set to true** (meaning app data could be extracted via ADB), **no root detection**, and **insufficient session expiration**. None of these were intentional — they were defaults that nobody reviewed. The `allowBackup` flag defaults to `true`, and without explicit `android:usesCleartextTraffic="false"`, HTTP connections are silently permitted. These defaults made sense when Android was young and compatibility was paramount, but they're dangerous in a world where every app handles sensitive user data.

The `allowBackup` vulnerability is particularly insidious because it's silent. With `allowBackup="true"`, an attacker who has physical access to the device (or USB debugging enabled) can run `adb backup -f backup.ab com.yourapp`, extracting the entire contents of your app's private directory. This includes SharedPreferences files, database files, cached data, and any files in internal storage. The backup is a standard tar archive that can be unpacked and browsed on a computer. If your SharedPreferences contain auth tokens, the attacker now has a valid session. If your database contains user data, the attacker has all of it. The fix is simple — `android:allowBackup="false"` — but it requires knowing the vulnerability exists.

```kotlin
// ❌ VULNERABLE MANIFEST: Multiple security issues
// <application
//     android:allowBackup="true"            <!-- Data extractable via ADB -->
//     android:debuggable="true"             <!-- Debugger can be attached -->
//     android:usesCleartextTraffic="true"    <!-- HTTP traffic allowed -->
//     android:networkSecurityConfig="@xml/network_security_config">

// ✅ SECURE MANIFEST: All flags reviewed
// <application
//     android:allowBackup="false"
//     android:debuggable="false"
//     android:usesCleartextTraffic="false"
//     android:networkSecurityConfig="@xml/network_security_config">
```

Hardcoded cryptographic secrets are another recurring issue. Developers store API keys, encryption passwords, and OAuth client secrets directly in source code or `BuildConfig` fields. The thinking is "it's compiled, so it's safe" — but it's not. Tools like jadx, APKTool, and JADX can decompile any APK in seconds. Even if you obfuscate with R8, string constants are preserved verbatim because R8 doesn't encrypt strings. If `const val API_KEY = "sk_live_abc123"` appears in your code, it appears identically in the decompiled output. I've personally extracted API keys from competitor apps in under two minutes using jadx — and if I can do it, so can any attacker. The decompilation process is trivially simple: download the APK (available from any mirror site), run `jadx -d output_dir app.apk`, and grep the output directory for strings matching API key patterns (`grep -r "sk_live\|api_key\|secret" output_dir/`).

```kotlin
// ❌ VULNERABLE: Hardcoded secrets (all visible in decompiled APK)
object AppSecrets {
    const val API_KEY = "sk_live_abc123def456"
    const val ENCRYPTION_PASSWORD = "MyS3cur3P@ssw0rd"
    const val OAUTH_CLIENT_SECRET = "dGhpcyBpcyBhIHNlY3JldA=="
    const val DATABASE_PASSWORD = "db_pass_789"
}

// ❌ VULNERABLE: BuildConfig fields (compiled as string constants)
// build.gradle.kts
// buildConfigField("String", "API_KEY", "\"${project.findProperty("API_KEY")}\"")
// The value is embedded in the DEX bytecode — visible in jadx

// ✅ SECURE: Fetch from server at runtime
class SecretsFetcher(private val api: ConfigApi) {
    private var cachedSecrets: Map<String, String>? = null

    suspend fun getApiKey(): String {
        val secrets = cachedSecrets ?: api.fetchConfig().also {
            cachedSecrets = it
        }
        return secrets["api_key"] ?: throw SecurityException("Key not available")
    }
}
```

```kotlin
// Real-world vulnerability: logging sensitive data
class VulnerableNetworkLogger : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        // ❌ Logs the full Authorization header including the token
        Log.d("Network", "Request: ${request.url}")
        Log.d("Network", "Headers: ${request.headers}")  // LEAKS AUTH TOKEN
        Log.d("Network", "Body: ${request.body}")        // LEAKS REQUEST DATA

        val response = chain.proceed(request)
        Log.d("Network", "Response body: ${response.body?.string()}")  // LEAKS RESPONSE DATA
        return response
    }
}

// ✅ SECURE: Redacted logging
class SecureNetworkLogger : Interceptor {
    private val sensitiveHeaders = setOf("Authorization", "Cookie", "X-Api-Key")

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (BuildConfig.DEBUG) {
            Log.d("Network", "${request.method} ${request.url.encodedPath}")
            request.headers.names()
                .filter { it !in sensitiveHeaders }
                .forEach { Log.d("Network", "$it: ${request.header(it)}") }
        }
        return chain.proceed(request)
    }
}
```

The `android:exported` attribute is another minefield. Before Android 12, components with intent filters were implicitly exported, meaning any app on the device could start your activities, bind to your services, or query your content providers. I've seen apps where a deeplink-handling Activity was exported without any validation, allowing a malicious app to craft intents that triggered sensitive actions. Since Android 12, you must explicitly declare `exported="true"` or `exported="false"`, but legacy apps still carry implicit exports. Similarly, leaving `android:debuggable="true"` in a production build is a critical vulnerability — it allows any user to attach a debugger, set breakpoints, inspect variables, and step through your app's code. An attacker with a debugger attached can watch your encryption key being used, read the plaintext before encryption, and capture decrypted data after decryption — all in real time.

Common vulnerabilities also extend to how apps handle WebView content. A WebView with JavaScript enabled and `addJavascriptInterface` configured creates a bridge between web content and native code. If the WebView loads untrusted content (user-generated HTML, third-party pages), malicious JavaScript can call native methods through this bridge. In pre-Android 4.2 WebViews, any public method on the interface object was accessible — leading to remote code execution vulnerabilities. Modern Android requires `@JavascriptInterface` annotations, but the risk remains if you expose sensitive operations through the bridge.

```kotlin
// Common vulnerability checklist you can automate
class VulnerabilityScanner(private val context: Context) {

    data class Vulnerability(
        val name: String,
        val severity: String,
        val found: Boolean,
        val recommendation: String
    )

    fun scan(): List<Vulnerability> = listOf(
        Vulnerability(
            name = "Debuggable in production",
            severity = "CRITICAL",
            found = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0,
            recommendation = "Remove android:debuggable=true from release builds"
        ),
        Vulnerability(
            name = "Backup enabled",
            severity = "MEDIUM",
            found = (context.applicationInfo.flags and ApplicationInfo.FLAG_ALLOW_BACKUP) != 0,
            recommendation = "Set android:allowBackup=false"
        ),
        Vulnerability(
            name = "Cleartext traffic permitted",
            severity = "MEDIUM",
            found = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                context.applicationInfo.flags and ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC != 0
            } else true,
            recommendation = "Set android:usesCleartextTraffic=false"
        ),
        Vulnerability(
            name = "No root detection",
            severity = "MEDIUM",
            found = !hasRootDetection(),
            recommendation = "Implement root detection for sensitive apps"
        )
    )

    private fun hasRootDetection(): Boolean {
        // Check if common root detection classes exist in the APK
        return try {
            Class.forName("${context.packageName}.security.RootDetector")
            true
        } catch (e: ClassNotFoundException) {
            false
        }
    }
}
```

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

Before touching the KeyStore API, you need to understand the building blocks of cryptography on Android. The platform provides four core cryptographic primitives through the `java.security` and `javax.crypto` packages. **Cipher** handles encryption and decryption — it transforms plaintext into ciphertext using an algorithm and a key. **Mac** (Message Authentication Code) verifies message authenticity by producing a fixed-size code from a message and a secret key. **Signature** generates, signs, and verifies digital signatures using asymmetric key pairs. **MessageDigest** produces a fixed-size hash from variable-size input, useful for integrity checks. These four primitives cover the vast majority of cryptographic operations you'll need in Android development.

The algorithm choice matters enormously. AES (Advanced Encryption Standard) is the recommended symmetric encryption algorithm — it supports key sizes of 128, 192, and 256 bits, with 256 being the strongest. AES operates on fixed-size blocks of 128 bits and uses a substitution-permutation network that applies multiple rounds of transformation to the plaintext. The number of rounds depends on the key size: 10 rounds for AES-128, 12 for AES-192, and 14 for AES-256. Each additional round increases the computational cost for both encryption and brute-force attacks. DES (Data Encryption Standard) is obsolete and should never be used in new code — its 56-bit key length can be brute-forced in under a day with modern hardware. RSA is used for asymmetric encryption, digital signatures, and key exchange, but it's significantly slower than AES for bulk data (roughly 1000x slower). SHA-256 is the standard hash algorithm — SHA-1 is deprecated due to known collision attacks (Google demonstrated a practical SHA-1 collision in 2017), and MD5 is completely broken (collisions can be generated in seconds on a laptop). When you see code using DES or MD5, that's a red flag.

```kotlin
// Understanding the four cryptographic primitives

// 1. Cipher — Encryption and Decryption
fun demonstrateCipher(key: SecretKey) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    val plaintext = "Sensitive data".toByteArray()
    val ciphertext = cipher.doFinal(plaintext)
    val iv = cipher.iv
    // ciphertext is unreadable; iv is needed for decryption
}

// 2. Mac — Message Authentication Code
fun demonstrateMac(key: SecretKey, message: ByteArray): ByteArray {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(key)
    return mac.doFinal(message) // Fixed-size authentication code
    // Receiver with the same key can verify the message wasn't tampered with
}

// 3. Signature — Digital Signatures (asymmetric)
fun demonstrateSignature(privateKey: PrivateKey, data: ByteArray): ByteArray {
    val signature = Signature.getInstance("SHA256withRSA")
    signature.initSign(privateKey)
    signature.update(data)
    return signature.sign()
    // Anyone with the public key can verify this signature
}

// 4. MessageDigest — Hashing (one-way)
fun demonstrateDigest(data: ByteArray): ByteArray {
    val digest = MessageDigest.getInstance("SHA-256")
    return digest.digest(data) // Always produces 32-byte output
    // Cannot be reversed — useful for integrity checks, not confidentiality
}
```

For Android development, the recommended combination is **AES-256-GCM** (Galois/Counter Mode). GCM is an authenticated encryption mode, meaning it provides both confidentiality (the data is encrypted) and integrity (any tampering is detected). This is superior to CBC mode, which only provides confidentiality — with CBC, an attacker could flip bits in the ciphertext and you wouldn't know. GCM produces an authentication tag alongside the ciphertext, and decryption fails if even one bit has been modified. The authentication tag is typically 128 bits (16 bytes) and is appended to the ciphertext by the Cipher implementation. When you call `doFinal()` in decrypt mode, the Cipher verifies the tag before returning the plaintext — if verification fails, it throws `AEADBadTagException`.

The only tradeoff is that GCM requires a unique nonce (initialization vector) for every encryption operation with the same key — reusing a nonce completely breaks the security guarantees. Specifically, if you encrypt two different plaintexts with the same key and the same nonce, an attacker can XOR the two ciphertexts together to recover the XOR of the two plaintexts — and from there, with some frequency analysis, recover both plaintexts entirely. Even worse, nonce reuse reveals the authentication key used by GCM's GHASH function, allowing the attacker to forge authentication tags for arbitrary ciphertexts. This means nonce reuse doesn't just weaken GCM — it completely destroys both confidentiality and integrity.

```kotlin
// ❌ VULNERABLE: Reusing a nonce with GCM
fun vulnerableEncrypt(data1: ByteArray, data2: ByteArray, key: SecretKey) {
    val fixedIv = ByteArray(12) { 0 } // Same nonce for both operations!
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")

    cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, fixedIv))
    val ciphertext1 = cipher.doFinal(data1)

    cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, fixedIv))
    val ciphertext2 = cipher.doFinal(data2)
    // An attacker can now XOR ciphertext1 and ciphertext2 to recover
    // the XOR of the plaintexts, then recover both plaintexts
}

// ✅ SECURE: Let GCM generate a unique nonce for each operation
fun secureEncrypt(data: ByteArray, key: SecretKey): Pair<ByteArray, ByteArray> {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key) // GCM generates a random 12-byte IV
    val ciphertext = cipher.doFinal(data)
    return Pair(ciphertext, cipher.iv) // Store IV alongside ciphertext
}
```

```kotlin
// Understanding why different modes matter

// ECB (Electronic Codebook) — NEVER USE
// Each block is encrypted independently — identical plaintext blocks produce
// identical ciphertext blocks. This leaks patterns in the data.
// The famous "ECB penguin" image demonstrates this perfectly.

// CBC (Cipher Block Chaining) — Provides confidentiality only
// Each block is XORed with the previous ciphertext block before encryption.
// Prevents pattern leakage but doesn't detect tampering.
// Requires a random IV and PKCS5/7 padding.

// GCM (Galois/Counter Mode) — Recommended for Android
// Provides both confidentiality AND integrity (authenticated encryption).
// No padding needed. Requires a unique nonce per encryption.
// Produces an authentication tag that detects any modification.

// Practical comparison
fun compareEncryptionModes(key: SecretKey, plaintext: ByteArray) {
    // CBC: encrypt, but no tamper detection
    val cbcCipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
    cbcCipher.init(Cipher.ENCRYPT_MODE, key)
    val cbcResult = cbcCipher.doFinal(plaintext)
    // If someone modifies cbcResult, decryption will succeed with corrupted data

    // GCM: encrypt with tamper detection
    val gcmCipher = Cipher.getInstance("AES/GCM/NoPadding")
    gcmCipher.init(Cipher.ENCRYPT_MODE, key)
    val gcmResult = gcmCipher.doFinal(plaintext)
    // If someone modifies gcmResult, decryption throws AEADBadTagException
}
```

Understanding how MAC and Signature differ is important for choosing the right tool. MAC uses a shared secret key — both the sender and receiver know the same key. This means MAC can verify that a message came from someone who knows the key, but it can't prove *which* party sent it (since both parties have the key). This is appropriate for verifying data integrity within your own app — encrypting and MACing data that only your app reads. Signature uses asymmetric keys — the sender signs with a private key, and anyone with the corresponding public key can verify the signature. This provides non-repudiation: the signer can't deny sending the message because only they have the private key. This is appropriate for verifying the origin of data from an external source, like verifying that a server response was actually signed by your server's private key.

**Key takeaway:** Use AES-256-GCM for symmetric encryption — it provides both confidentiality and integrity. Never use DES or MD5. Every nonce must be unique per encryption operation.

### Lesson 2.2: Android KeyStore Fundamentals

The Android KeyStore system stores cryptographic keys in a hardware-backed container — the TEE (Trusted Execution Environment) or StrongBox on supported devices. The critical property is that keys stored in the KeyStore **never leave the secure hardware**. When your app encrypts data using a KeyStore key, the plaintext is sent to the TEE, encryption happens inside the secure hardware, and only the ciphertext comes back. The raw key material never enters your app's process memory. This is fundamentally different from storing a key in a file or SharedPreferences, where the key sits in your process memory during use and can be read by any debugger, memory dump, or runtime instrumentation tool like Frida.

The architecture works through a client-server model. Your app (the client) communicates with the KeyStore daemon (the server) through Binder IPC. The daemon, in turn, communicates with the TEE through a secure driver. When you call `keyGenerator.generateKey()`, the request travels from your app → KeyStore daemon → TEE driver → TEE OS. The TEE generates the key internally, stores it in its protected storage, and returns only a key handle (alias) to your app. When you later call `cipher.doFinal(plaintext)`, the plaintext travels the same path to the TEE, which retrieves the actual key from its storage, performs the encryption, and returns only the ciphertext. At no point does the raw key material cross the boundary between the TEE and the main Android OS.

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

A few critical details about this code. `setUserAuthenticationRequired(false)` means the key can be used without biometric or screen lock authentication — appropriate for general data encryption but not for high-sensitivity operations like payments. Setting it to `true` requires the user to authenticate before each use of the key, which is ideal for banking apps but too aggressive for encrypting cached data. `BLOCK_MODE_GCM` with `ENCRYPTION_PADDING_NONE` is the recommended combination — GCM provides authenticated encryption, and GCM handles its own padding internally so `NONE` is correct (not insecure). Using `PKCS7Padding` with GCM would actually cause an error — GCM doesn't use traditional block cipher padding because it uses a counter mode internally.

The `PURPOSE_ENCRYPT or PURPOSE_DECRYPT` parameter specifies what operations the key can perform. You can create keys that only encrypt (useful for logging systems that write encrypted data but shouldn't be able to read it), only decrypt, only sign, or only verify. This is the principle of least privilege applied to cryptographic keys. If a key is only used for encryption, restricting it to `PURPOSE_ENCRYPT` means that even if an attacker gains the ability to use the key (through your app), they can't use it to decrypt existing data.

```kotlin
// ❌ VULNERABLE: Storing a key in a file
fun vulnerableKeyStorage(context: Context) {
    // Key sits in your app's private directory as a raw byte file
    // Extractable from a rooted device or via ADB backup
    val keyBytes = ByteArray(32)
    SecureRandom().nextBytes(keyBytes)
    val file = File(context.filesDir, "encryption_key.bin")
    file.writeBytes(keyBytes) // Raw key on filesystem!

    // When you use it, the key is in your process memory
    val key = SecretKeySpec(file.readBytes(), "AES")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    // An attacker with Frida can dump your process memory and find this key
}

// ✅ SECURE: Using the KeyStore
fun secureKeyStorage() {
    // Key is generated and stored in secure hardware (TEE/StrongBox)
    // Never enters your app's process memory
    val key = KeyStoreManager.getOrCreateKey("my_secure_key")

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    // The key handle is sent to the TEE, which performs encryption internally
    // An attacker with Frida can see the key handle but NOT the key material
}
```

```kotlin
// Listing all keys in the KeyStore
fun listAllKeys(): List<String> {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    return keyStore.aliases().toList()
}

// Checking key properties
fun inspectKey(alias: String) {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val key = keyStore.getKey(alias, null) ?: return

    try {
        val factory = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
        val keyInfo = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo

        Log.d("KeyInfo", "Algorithm: ${keyInfo.keystoreAlias}")
        Log.d("KeyInfo", "Inside secure hardware: ${keyInfo.isInsideSecureHardware}")
        Log.d("KeyInfo", "User auth required: ${keyInfo.isUserAuthenticationRequired}")
        Log.d("KeyInfo", "Auth timeout: ${keyInfo.userAuthenticationValidityDurationSeconds}")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Log.d("KeyInfo", "Security level: ${
                when (keyInfo.securityLevel) {
                    KeyProperties.SECURITY_LEVEL_STRONGBOX -> "StrongBox"
                    KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
                    KeyProperties.SECURITY_LEVEL_SOFTWARE -> "Software"
                    else -> "Unknown"
                }
            }")
        }
    } catch (e: Exception) {
        Log.e("KeyInfo", "Cannot inspect key: ${e.message}")
    }
}
```

The honest tradeoff: KeyStore operations involve IPC to the secure hardware, making them slower than pure software encryption. For encrypting a single auth token, the overhead is negligible (a few milliseconds). For bulk encryption of hundreds of records, you'd want to use the KeyStore key to wrap a "working key" in memory and use that for the heavy lifting. This is essentially what `EncryptedSharedPreferences` does internally — it uses the MasterKey (backed by KeyStore) to protect ephemeral data encryption keys. The MasterKey decrypts a data encryption key (DEK), and the DEK is used for the actual encryption operations. This two-tier approach gives you the security of hardware-backed key storage with the performance of software encryption.

One common mistake is creating new keys without checking if one already exists. If you call `generateSecretKey("my_key")` twice, the second call overwrites the first key. Any data encrypted with the original key is now permanently unrecoverable. Always use the `getOrCreateKey` pattern: check if the key exists first, and only generate a new one if it doesn't. This is especially important during app updates — if your key generation code runs on every app launch instead of only on first launch, you'll destroy your existing key and corrupt all encrypted data.

**Key takeaway:** Use Android KeyStore for cryptographic keys. The key material never enters your app's memory — even on a rooted device, the raw key cannot be extracted from the hardware.

### Lesson 2.3: Encryption and Decryption with Cipher

The `Cipher` class is your primary tool for encrypting and decrypting data using KeyStore-backed keys. The pattern is straightforward: get or create a key, initialize a `Cipher` instance in the appropriate mode (encrypt or decrypt), and process the data. The IV (Initialization Vector) generated during encryption must be stored alongside the ciphertext because it's required for decryption. Without the IV, decryption produces garbage data or fails entirely. The IV is not secret — it just needs to be unique for each encryption operation with the same key.

Understanding the data flow is essential for debugging encryption issues. When encrypting: plaintext bytes → `cipher.doFinal()` → ciphertext bytes + IV (from `cipher.iv`). You must store both the ciphertext and the IV. When decrypting: ciphertext bytes + IV → `GCMParameterSpec(128, iv)` → `cipher.init(DECRYPT_MODE, key, spec)` → `cipher.doFinal(ciphertext)` → plaintext bytes. If any part of this chain is wrong — wrong key, wrong IV, modified ciphertext — decryption fails. With GCM, the failure is clean: `AEADBadTagException`. With CBC, the failure might produce corrupted data instead of an error, which is much harder to debug and much more dangerous.

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

One mistake I've seen in production is developers generating their own IV instead of letting GCM do it. When you call `cipher.init(Cipher.ENCRYPT_MODE, key)` with GCM, the Cipher automatically generates a cryptographically random 12-byte IV. If you provide your own IV and accidentally reuse it with the same key, GCM's security guarantees are completely broken — an attacker can recover the authentication key and forge messages. Let the system generate the IV and store it alongside the ciphertext. The IV is not secret — it just needs to be unique. Some developers worry about storing the IV in plaintext next to the ciphertext, thinking it's a security weakness. It's not. The IV's purpose is to ensure that encrypting the same plaintext twice produces different ciphertexts — knowing the IV doesn't help an attacker decrypt the data without the key.

Another practical concern is error handling. `Cipher.doFinal()` can throw `AEADBadTagException` during decryption if the ciphertext has been tampered with — this is GCM's integrity check working as designed. Don't catch this silently. A tampered ciphertext means someone modified the data, and your app should treat it as a security event: log it (without logging the data itself), clear the compromised data, and potentially re-authenticate the user. Silently catching and ignoring this exception means you're discarding evidence of an attack.

```kotlin
// Robust encryption with proper error handling
class RobustCryptoManager(private val keyAlias: String) {

    sealed class CryptoResult {
        data class Success(val data: ByteArray) : CryptoResult()
        data class TamperingDetected(val message: String) : CryptoResult()
        data class KeyInvalidated(val message: String) : CryptoResult()
        data class Error(val exception: Exception) : CryptoResult()
    }

    fun secureDecrypt(ciphertext: ByteArray, iv: ByteArray): CryptoResult {
        return try {
            val key = KeyStoreManager.getSecretKey(keyAlias)
                ?: return CryptoResult.KeyInvalidated("Key not found: $keyAlias")

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            CryptoResult.Success(cipher.doFinal(ciphertext))
        } catch (e: AEADBadTagException) {
            // SECURITY EVENT: Data has been modified
            CryptoResult.TamperingDetected("Integrity check failed for key: $keyAlias")
        } catch (e: KeyPermanentlyInvalidatedException) {
            // Key was invalidated (biometric enrollment changed)
            CryptoResult.KeyInvalidated("Key permanently invalidated: $keyAlias")
        } catch (e: UserNotAuthenticatedException) {
            // User needs to authenticate before using this key
            CryptoResult.Error(e)
        } catch (e: Exception) {
            CryptoResult.Error(e)
        }
    }
}
```

```kotlin
// Encrypting large data with streaming Cipher
fun encryptLargeFile(
    inputStream: InputStream,
    outputStream: OutputStream,
    key: SecretKey
) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)

    // Write IV first so decryption knows where to find it
    outputStream.write(cipher.iv.size)
    outputStream.write(cipher.iv)

    // Stream encryption in chunks
    val buffer = ByteArray(8192)
    var bytesRead: Int
    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
        val encrypted = cipher.update(buffer, 0, bytesRead)
        if (encrypted != null) {
            outputStream.write(encrypted)
        }
    }
    // doFinal writes the final block + authentication tag
    val finalBlock = cipher.doFinal()
    outputStream.write(finalBlock)
}

fun decryptLargeFile(
    inputStream: InputStream,
    outputStream: OutputStream,
    key: SecretKey
) {
    // Read IV from the beginning of the file
    val ivSize = inputStream.read()
    val iv = ByteArray(ivSize)
    inputStream.read(iv)

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))

    // Note: GCM authentication happens on doFinal, so the entire
    // ciphertext must be processed before integrity is verified
    val ciphertext = inputStream.readBytes()
    val plaintext = cipher.doFinal(ciphertext)
    outputStream.write(plaintext)
}
```

A subtle but important detail: GCM's authentication tag is verified only when `doFinal()` is called. If you use `cipher.update()` for streaming encryption, the intermediate `update()` calls return partially encrypted data, but the integrity check doesn't happen until `doFinal()`. This means that for streaming decryption, you must buffer the entire ciphertext and call `doFinal()` on all of it — you can't verify integrity chunk by chunk. This is a limitation of GCM that makes it less suitable for very large files. For large file encryption with chunk-level integrity, the `EncryptedFile` API from Jetpack Security uses a chunked approach with separate authentication tags per chunk, which is architecturally superior.

**Key takeaway:** Never generate your own IV for GCM — let the Cipher create it. Store the IV alongside the ciphertext. Treat `AEADBadTagException` as a security event, not a recoverable error.

### Lesson 2.4: StrongBox and Hardware Security Levels

Not all KeyStore keys are created equal. Android supports three security levels for key storage: **software**, **TEE (Trusted Execution Environment)**, and **StrongBox**. Software-backed keys are stored in the app's process and offer no hardware protection — they're essentially equivalent to storing the key in a file, just with a nicer API. TEE-backed keys are stored in an isolated execution environment on the main processor — the key material never enters the main OS, but it shares the same physical chip. StrongBox-backed keys live in a dedicated security module with its own processor, memory, and random number generator — fully isolated hardware. The distinction matters because a sophisticated hardware attack (like a side-channel attack on the main processor) could potentially extract TEE keys but would require physical tampering with a separate chip to extract StrongBox keys.

The practical difference between TEE and StrongBox becomes clear when you consider attack scenarios. A TEE shares the main application processor — it runs in a "secure world" while your app runs in the "normal world," separated by ARM's TrustZone technology. An attacker who discovers a vulnerability in the TEE's OS (Trusty, QSEE, etc.) can potentially extract keys from the TEE without physical access. There have been real-world TEE vulnerabilities (CVEs against Qualcomm's QSEE, for example) that allowed remote extraction of TEE-stored keys. StrongBox, being physically separate hardware, is immune to these attacks. Even a complete compromise of the main processor (including the TEE) cannot access StrongBox's internal storage because there's no shared memory or execution context between them.

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

```kotlin
// Tiered key generation based on sensitivity
enum class KeySensitivity { STANDARD, HIGH, CRITICAL }

class TieredKeyManager {

    fun generateKey(alias: String, sensitivity: KeySensitivity): SecretKey {
        return when (sensitivity) {
            KeySensitivity.CRITICAL -> {
                // Payment keys, biometric-gated keys: StrongBox if available
                generateStrongBoxKey(alias)
                    ?: generateTEEKey(alias)
            }
            KeySensitivity.HIGH -> {
                // Auth tokens, encrypted DB passphrases: TEE
                generateTEEKey(alias)
            }
            KeySensitivity.STANDARD -> {
                // Cache encryption, non-sensitive data: TEE (default)
                generateTEEKey(alias)
            }
        }
    }

    private fun generateStrongBoxKey(alias: String): SecretKey? {
        return try {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
            )
            keyGenerator.init(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setIsStrongBoxBacked(true)
                    .build()
            )
            keyGenerator.generateKey()
        } catch (e: StrongBoxUnavailableException) {
            null
        }
    }

    private fun generateTEEKey(alias: String): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return keyGenerator.generateKey()
    }
}
```

The tradeoff is real. StrongBox operations are measurably slower because they involve communication with separate hardware over a secure channel. StrongBox also supports a limited set of algorithms — AES-128, AES-256, RSA-2048, ECDSA P-256, and HMAC-SHA256. If you need RSA-4096 or other algorithms, you're limited to TEE-backed keys. In practice, I use StrongBox for the most sensitive keys (encryption keys for payment data, biometric-gated keys) and TEE for everything else. The `StrongBoxUnavailableException` catch is essential — not all devices have StrongBox hardware, so you must provide a graceful fallback. Google Pixel phones (from Pixel 3 onwards) support StrongBox, as do many Samsung flagship devices, but mid-range and budget devices often don't.

The extraction prevention is what makes the KeyStore genuinely valuable. When an app performs a cryptographic operation using a KeyStore key, the actual key material never enters the application process. Attackers might be able to use the key (by running code as your app's UID), but they can't extract the key itself. They can't copy it to another device. They can't export it. The secure hardware simply won't allow it. This property — key usage without key visibility — is what makes KeyStore keys fundamentally different from keys stored in files or memory. A key stored in a file can be copied to any device and used anywhere. A KeyStore key is bound to the specific device's secure hardware and cannot be moved.

```kotlin
// Demonstrating the difference between extractable and non-extractable keys

// ❌ Software key: extractable
fun createExtractableKey(): SecretKey {
    val keyBytes = ByteArray(32)
    SecureRandom().nextBytes(keyBytes)
    val key = SecretKeySpec(keyBytes, "AES")
    // An attacker can read keyBytes from memory, copy to another device,
    // and decrypt all data encrypted with this key
    return key
}

// ✅ KeyStore key: non-extractable
fun createNonExtractableKey(alias: String): SecretKey {
    val key = KeyStoreManager.generateSecretKey(alias)
    // The key exists only inside the TEE/StrongBox
    // Even with root access and Frida, the raw key bytes cannot be read
    // The key can only be USED on this specific device
    return key
}
```

**Key takeaway:** Use StrongBox for your most sensitive keys and fall back to TEE when StrongBox isn't available. The key extraction prevention — not the encryption itself — is what makes KeyStore irreplaceable.

### Lesson 2.5: KeyChain vs KeyStore

Android provides two key management APIs that are often confused: `KeyChain` and `KeyStore`. They serve different purposes and have different security models. **KeyChain** provides system-wide credential storage — certificates and private keys that any app on the device can request access to (with user consent). It's designed for VPN certificates, email signing certificates, and Wi-Fi enterprise authentication. When an app calls `KeyChain.choosePrivateKeyAlias()`, the user sees a system dialog listing available credentials and chooses which one to share. The user is always in the loop — no app can silently access KeyChain credentials.

**KeyStore** provides app-private key storage — keys generated in the KeyStore are accessible only to the app that created them. There's no system UI for sharing KeyStore keys between apps. This is the right choice for the vast majority of app-level encryption needs: encrypting local data, signing API requests, protecting auth tokens. The keys are tied to your app's UID and cannot be accessed by other apps, even on rooted devices (because the TEE/StrongBox enforces access control independently of the Android OS). The KeyStore also supports key attestation — a mechanism where Google's servers can verify that a key was generated in genuine secure hardware on a specific device.

```kotlin
// KeyChain: System-wide credentials (enterprise use cases)
class KeyChainManager(private val activity: Activity) {

    // Let the user choose a certificate from the system KeyChain
    fun requestCertificate() {
        KeyChain.choosePrivateKeyAlias(
            activity,
            { alias ->
                // User selected a certificate
                if (alias != null) {
                    useCertificate(alias)
                }
            },
            arrayOf("RSA", "EC"), // Key types
            null,                 // Issuers
            null,                 // Host
            -1,                   // Port
            null                  // Alias
        )
    }

    private fun useCertificate(alias: String) {
        // Must be called from a background thread
        val privateKey = KeyChain.getPrivateKey(activity, alias)
        val certificateChain = KeyChain.getCertificateChain(activity, alias)
        // Use for mutual TLS, email signing, etc.
    }
}

// KeyStore: App-private keys (95% of use cases)
class KeyStoreExample {

    fun generateAppPrivateKey(alias: String): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return keyGenerator.generateKey()
        // This key is ONLY accessible to your app — no system UI, no sharing
    }
}
```

```kotlin
// Decision matrix for KeyChain vs KeyStore
fun shouldUseKeyChain(useCase: String): Boolean {
    return when (useCase) {
        "VPN certificate" -> true           // System-wide credential
        "Email signing certificate" -> true  // Shared across email apps
        "Wi-Fi enterprise auth" -> true      // System-level authentication
        "Client certificate for mTLS" -> true // Enterprise server auth
        "App data encryption" -> false        // Use KeyStore
        "Auth token protection" -> false      // Use KeyStore
        "Database passphrase" -> false        // Use KeyStore
        "Payment key" -> false                // Use KeyStore
        "Biometric-gated key" -> false        // Use KeyStore
        else -> false // Default to KeyStore for app-specific needs
    }
}
```

The decision is simple: use KeyChain when you need system-level credential sharing (enterprise apps, VPN clients, certificate-based authentication). Use KeyStore for everything else. In my experience, 95% of apps should use KeyStore exclusively. The only time I've used KeyChain was in an enterprise MDM app that needed to install client certificates for mutual TLS authentication with corporate servers. KeyChain also has the advantage of being managed by the device administrator — in enterprise environments, IT departments can push certificates through MDM solutions, and apps using KeyChain automatically pick them up.

One important distinction: KeyChain credentials survive app uninstall (they're system-level), while KeyStore keys are deleted when the app is uninstalled (they're app-scoped). This means if your encryption keys are in the KeyStore and the user uninstalls and reinstalls your app, all previously encrypted data is permanently unrecoverable. Plan your key lifecycle accordingly — if data persistence across reinstalls matters, consider backing up encrypted data to your server with server-side keys.

**Key takeaway:** Use KeyStore for app-specific keys (most apps). Use KeyChain only when credentials need to be shared across apps with user consent (enterprise/VPN scenarios).

### Lesson 2.6: Key Authentication and Access Control

KeyStore keys can be configured with authentication requirements that control when and how the key can be used. This is one of the most powerful security features on Android — you can create keys that are literally unusable without biometric verification or screen lock authentication. The TEE or StrongBox will refuse to perform any operation with the key until the user authenticates. This isn't a software check that can be bypassed — the authentication requirement is embedded in the key's metadata inside the secure hardware, and the hardware enforces it.

The authentication mechanism works through a concept called "auth tokens." When the user authenticates (via fingerprint, face, PIN, or pattern), the authentication subsystem (Gatekeeper for PIN/pattern, Keymaster for biometrics) generates a cryptographic token that proves the user authenticated at a specific timestamp. When your app tries to use an authenticated key, the TEE checks for a valid auth token. If the token is missing or expired (based on the timeout you configured), the TEE refuses to perform the operation. This entire exchange happens in secure hardware — your app's process never sees the auth token, can't forge it, and can't modify it.

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

Consider the attack scenario that `setInvalidatedByBiometricEnrollment` prevents. An attacker borrows the victim's unlocked phone for two minutes — perhaps while the victim is in the bathroom. The attacker opens Settings → Security → Fingerprint, enrolls their own fingerprint (using the victim's screen lock PIN, which they observed over the victim's shoulder), and returns the phone. Without biometric enrollment invalidation, the attacker can now authenticate as the victim using their own fingerprint to access all biometric-gated keys. With invalidation enabled, the moment the new fingerprint is enrolled, all existing biometric-gated keys are permanently invalidated — the attacker's fingerprint can't unlock them because the keys no longer exist.

```kotlin
// ❌ VULNERABLE: Key survives new biometric enrollment
fun vulnerableBiometricKey(alias: String): SecretKey {
    val keyGenerator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
    )
    keyGenerator.init(
        KeyGenParameterSpec.Builder(alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setInvalidatedByBiometricEnrollment(false) // Dangerous!
            .build()
    )
    return keyGenerator.generateKey()
    // An attacker who enrolls their fingerprint can now use this key
}

// ✅ SECURE: Key is invalidated when new biometric is enrolled
fun secureBiometricKey(alias: String): SecretKey {
    val keyGenerator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
    )
    keyGenerator.init(
        KeyGenParameterSpec.Builder(alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setInvalidatedByBiometricEnrollment(true) // Key destroyed on new enrollment
            .build()
    )
    return keyGenerator.generateKey()
}
```

```kotlin
// Handling key invalidation gracefully
fun useAuthenticatedKey(alias: String): ByteArray? {
    return try {
        val key = KeyStoreManager.getSecretKey(alias) ?: run {
            // Key doesn't exist — need to create and re-encrypt data
            return null
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.doFinal("test".toByteArray())
    } catch (e: KeyPermanentlyInvalidatedException) {
        // Biometric enrollment changed — key is permanently unusable
        // Must delete the key, create a new one, and re-encrypt all data
        KeyStoreManager.deleteKey(alias)
        null
    } catch (e: UserNotAuthenticatedException) {
        // User needs to authenticate before using this key
        // Show BiometricPrompt, then retry
        null
    }
}
```

Once a key's authentication mode is set during creation, it cannot be changed. To change the authentication requirements, you must delete the key and create a new one. This is a deliberate security design — it prevents runtime modification of key access policies. If an attacker gained the ability to run code as your app, they couldn't downgrade a biometric-required key to a no-auth key. The immutability of key policies is enforced by the secure hardware, not by your app's code.

The `AUTH_BIOMETRIC_STRONG` flag (API 30+) ensures that only Class 3 biometrics are accepted. Class 3 biometrics have strict false acceptance and spoof detection requirements defined by the Android CDD (Compatibility Definition Document). Class 2 biometrics (convenience) have weaker requirements and are suitable for unlock but not for security-critical operations. Class 1 biometrics (basic) are not considered secure enough for any KeyStore authentication. By specifying `AUTH_BIOMETRIC_STRONG`, you ensure that the biometric sensor meets Google's highest security standards.

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

Data storage is where most Android security failures originate. Your app might have perfect network encryption and airtight authentication, but if an attacker can simply pull your SQLite database off a rooted device and read every user's session token in plaintext, none of that matters. The Android filesystem provides baseline protections through Linux kernel permissions and file-based encryption, but these are necessary conditions, not sufficient ones. A running exploit, a device backup extracted via ADB, or a malicious app exploiting a misconfigured Content Provider can all bypass filesystem-level protections entirely. This module covers the full stack of data storage security: from understanding what the kernel gives you for free, to encrypting SharedPreferences, databases, and files, to locking down Content Providers against injection and traversal attacks.

### Lesson 3.1: Internal vs External Storage Security

Android's storage model is built on top of Linux kernel file permissions. Every app runs as its own Linux user (with a unique UID assigned at install time), and its internal storage directory (`/data/data/<package_name>/`) is owned by that UID with permissions set to `0700` — meaning only the app process (and root) can read, write, or traverse the directory. This is the single most important security boundary for app data. When you write a file to `context.filesDir` or `context.cacheDir`, the kernel enforces that no other app on the device can access it. This isolation happens at the syscall level — even if another app knows the exact path to your file, the kernel will return `EACCES` (Permission denied) when it tries to open it.

However, this kernel-level protection has significant limitations that developers often overlook. The most critical one is **rooted devices**. On a rooted device, the `su` binary allows any app to elevate to UID 0 (root), which bypasses all file permission checks. An attacker with root access can run `cat /data/data/com.yourapp/shared_prefs/credentials.xml` and read every SharedPreference your app has stored. This isn't a theoretical threat — tools like Magisk make rooting trivially easy, and security researchers routinely use rooted devices to audit apps. In regions where sideloading is common, a significant percentage of devices may be rooted. If your threat model includes protecting data on compromised devices, kernel file permissions are not enough.

**ADB backup attacks** represent another vector that bypasses internal storage protections. Prior to Android 12, if an app didn't explicitly set `android:allowBackup="false"` in its manifest, the `adb backup` command could extract the app's entire internal storage to a tar file on the attacker's computer. The attacker didn't need root — they just needed physical access to the device with USB debugging enabled. Many production apps shipped with backup enabled by default (it was `true` by default), leaking databases, SharedPreferences, and cached files. Android 12+ changed the default behavior to use cloud backup rather than local ADB backup, but the risk remains for apps targeting older SDK versions or explicitly enabling backup.

```kotlin
// VULNERABLE: Writing sensitive data to internal storage without encryption
// On a rooted device, this file is trivially readable
fun saveSensitiveDataInsecure(context: Context, token: String) {
    val file = File(context.filesDir, "auth_token.txt")
    file.writeText(token) // Plaintext! Readable by root or via ADB backup
}

// SECURE: Encrypting sensitive data before writing to internal storage
fun saveSensitiveDataSecure(context: Context, token: String) {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val keyAlias = "file_encryption_key"

    if (!keyStore.containsAlias(keyAlias)) {
        val keyGen = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
        )
        keyGen.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        keyGen.generateKey()
    }

    val key = (keyStore.getEntry(keyAlias, null) as KeyStore.SecretKeyEntry).secretKey
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))

    // Store IV + ciphertext together
    val file = File(context.filesDir, "auth_token.enc")
    file.outputStream().use { out ->
        out.write(cipher.iv.size)
        out.write(cipher.iv)
        out.write(encrypted)
    }
}
```

**File-Based Encryption (FBE)**, introduced in Android 7.0, encrypts each file with a different key derived from the user's lock screen credential. This protects against physical theft — if someone steals your phone while it's powered off, they cannot read the filesystem without the lock screen PIN. However, FBE has a critical limitation that developers misunderstand: once the device is unlocked, all files are decrypted transparently. A running exploit, a malicious app with root access, or a forensic tool operating on an unlocked device sees plaintext. FBE protects data at rest on a powered-off device; it does not protect data from runtime attacks. This is why application-level encryption (encrypting data with KeyStore-backed keys before writing to disk) remains essential for sensitive data.

External storage (`Environment.getExternalStorageDirectory()`) is fundamentally different from internal storage. Before Android 10, external storage was a shared filesystem — any app with the `READ_EXTERNAL_STORAGE` permission could read any file on the SD card or shared storage. This means a malicious app could silently enumerate and read files written by other apps. Android 10 introduced Scoped Storage, which restricts apps to their own sandboxed directory on external storage (`context.getExternalFilesDir()`), but legacy apps targeting older SDK versions and apps with the `MANAGE_EXTERNAL_STORAGE` permission can still access the entire external storage. Even with Scoped Storage, external storage on removable SD cards is typically formatted as FAT32 or exFAT, which do not support Linux file permissions at all — anyone who physically removes the SD card can read every file on it.

```kotlin
// VULNERABLE: Storing sensitive data on external storage
fun saveToExternalInsecure(context: Context) {
    val file = File(
        context.getExternalFilesDir(null),
        "user_data.json"
    )
    // Any app with MANAGE_EXTERNAL_STORAGE can read this
    // Removable SD card has no file permissions at all
    file.writeText("""{"ssn": "123-45-6789", "token": "abc123"}""")
}

// SECURE: If you must use external storage, encrypt first
fun saveToExternalSecure(context: Context, data: String) {
    val encryptedFile = EncryptedFile.Builder(
        context,
        File(context.getExternalFilesDir(null), "user_data.enc"),
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()

    encryptedFile.openFileOutput().use { output ->
        output.write(data.toByteArray(Charsets.UTF_8))
    }
}
```

A common mistake is assuming that `MODE_PRIVATE` on `openFileOutput()` provides strong security. `MODE_PRIVATE` sets the file's Linux permissions to `0600` (owner read/write only), which prevents other non-root apps from accessing it. But `MODE_PRIVATE` does not encrypt the file, does not protect against root access, and does not protect against ADB backup extraction. It's a permission flag, not a security mechanism. Another common mistake is using `MODE_WORLD_READABLE` or `MODE_WORLD_WRITABLE`, which were deprecated in API 17 and removed in API 24 for good reason — they allowed any app on the device to read or modify your files. If you encounter legacy code using these modes, replace them with a Content Provider with proper permission enforcement.

```kotlin
// VULNERABLE: MODE_WORLD_READABLE (deprecated, removed in API 24)
// Any app can read this file
fun writeWorldReadable(context: Context) {
    @Suppress("DEPRECATION")
    val fos = context.openFileOutput("config.txt", Context.MODE_WORLD_READABLE)
    fos.write("api_key=sk_live_abc123".toByteArray())
    fos.close()
}

// SECURE: Use MODE_PRIVATE + encryption for sensitive data
fun writeSecurely(context: Context) {
    val fos = context.openFileOutput("config.enc", Context.MODE_PRIVATE)
    // Encrypt the content before writing (see EncryptedFile examples above)
    val encryptedBytes = encryptWithKeyStore("api_key=sk_live_abc123")
    fos.write(encryptedBytes)
    fos.close()
}
```

#### Common Mistakes

**Storing API keys in plaintext files** is the most common storage vulnerability. Developers create a `config.txt` or `secrets.properties` in internal storage and assume it's safe because it's internal. On a rooted device, this is a one-command extraction. Always encrypt secrets with KeyStore-backed keys. **Using external storage for sensitive data** without encryption is another frequent mistake — even with Scoped Storage, the data is accessible to apps with broad storage permissions and to anyone with physical access to a removable SD card. **Ignoring ADB backup** by not setting `android:allowBackup="false"` or not using `android:fullBackupContent` to exclude sensitive files means your entire data directory can be extracted without root.

**Key takeaway:** Use internal storage for private data — it's kernel-protected. Never store sensitive data on external storage unencrypted. Filesystem encryption protects against physical theft but not against a running exploit — add application-level encryption for sensitive data.

---

### Lesson 3.2: EncryptedSharedPreferences

`SharedPreferences` is Android's most commonly used storage mechanism for small key-value data — auth tokens, user settings, feature flags, and session metadata. The problem is that regular SharedPreferences stores everything in a plaintext XML file at `/data/data/<package_name>/shared_prefs/<name>.xml`. On a rooted device, reading this file takes one command: `cat /data/data/com.example.app/shared_prefs/user_prefs.xml`. The file contains every key and every value in readable XML. If you've stored an OAuth access token, a refresh token, a user's email, or an API key in SharedPreferences, all of it is immediately exposed. This isn't hypothetical — security audits of Android apps routinely find auth tokens, PII, and even passwords stored in plaintext SharedPreferences.

```kotlin
// VULNERABLE: Plain SharedPreferences stores everything in readable XML
// File at: /data/data/com.example.app/shared_prefs/user_prefs.xml
// Contents:
// <?xml version="1.0" encoding="utf-8"?>
// <map>
//     <string name="auth_token">eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiMTIzIn0.abc</string>
//     <string name="refresh_token">rt_a1b2c3d4e5f6</string>
//     <string name="user_email">mukul@example.com</string>
// </map>
fun storeTokenInsecure(context: Context, token: String) {
    val prefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
    prefs.edit().putString("auth_token", token).apply()
    // An attacker with root access can read this in seconds
}
```

`EncryptedSharedPreferences` from the Jetpack Security library solves this by encrypting both keys and values before writing them to disk. The encryption uses a two-layer scheme: **AES256-SIV** (Synthetic Initialization Vector) for preference keys, and **AES256-GCM** (Galois/Counter Mode) for preference values. The SIV mode for keys is deterministic — the same key name always produces the same ciphertext — which is necessary because SharedPreferences needs to look up values by key. GCM mode for values is randomized (each encryption produces different ciphertext even for the same plaintext) and provides authenticated encryption with integrity verification. The underlying keys are managed by the Android KeyStore through a `MasterKey`, meaning the actual encryption keys never leave the secure hardware.

```kotlin
// SECURE: EncryptedSharedPreferences encrypts both keys and values
// The XML file now looks like:
// <?xml version="1.0" encoding="utf-8"?>
// <map>
//     <string name="AXj3k...base64...">AYm9...base64...</string>
//     <string name="BKp7m...base64...">CZn2...base64...</string>
// </map>
// An attacker cannot even see what keys exist, let alone their values

class SecurePreferencesManager(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            "secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveToken(token: String) {
        prefs.edit().putString("auth_token", token).apply()
    }

    fun getToken(): String? = prefs.getString("auth_token", null)

    fun saveUserCredentials(email: String, refreshToken: String) {
        prefs.edit()
            .putString("user_email", email)
            .putString("refresh_token", refreshToken)
            .apply()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
    }
}
```

The **AES256-SIV** algorithm used for key encryption deserves deeper explanation. SIV stands for Synthetic Initialization Vector — it derives the IV deterministically from the plaintext itself. This makes it a deterministic authenticated encryption scheme: encrypting the same key name always produces the same ciphertext. This property is essential for SharedPreferences because the underlying XML storage uses key names for lookups. If key encryption were randomized, the system wouldn't be able to find the value associated with a given key name without decrypting every key in the file. The deterministic nature means an attacker who observes the encrypted file over time can tell if a key was added or removed (the number of entries changes), but they cannot determine what the key names are or what the values contain.

**AES256-GCM** for value encryption provides stronger guarantees. GCM uses a random 12-byte IV for each encryption operation, so encrypting the same value twice produces completely different ciphertext. It also provides authenticated encryption — the GCM tag (a 16-byte authentication tag appended to the ciphertext) ensures that any modification to the ciphertext is detected during decryption. If an attacker modifies even a single bit of the encrypted value in the XML file, decryption will throw an `AEADBadTagException` rather than returning corrupted data. This integrity guarantee is critical: without it, an attacker could perform bitflipping attacks on the ciphertext to manipulate the decrypted values.

Thread safety is a significant concern with `EncryptedSharedPreferences`. The first call to `EncryptedSharedPreferences.create()` is expensive — it needs to initialize the MasterKey, load the KeyStore, and set up the encryption infrastructure. On some devices, this can take 100-500ms. If multiple threads call `create()` simultaneously on first launch, you can hit race conditions where the underlying Tink keyset gets corrupted. The safest pattern is to use lazy initialization with a synchronized block or Kotlin's `by lazy` delegate (which is thread-safe by default with `LazyThreadSafetyMode.SYNCHRONIZED`). Additionally, wrap all EncryptedSharedPreferences access in a `try-catch` block — if the KeyStore is in a bad state (which can happen after an OS update or factory reset), the creation call will throw, and you need to handle it gracefully rather than crashing.

```kotlin
// SECURE: Thread-safe initialization with error recovery
class RobustSecurePreferences private constructor() {
    companion object {
        @Volatile
        private var instance: SharedPreferences? = null

        fun getInstance(context: Context): SharedPreferences {
            return instance ?: synchronized(this) {
                instance ?: createEncryptedPrefs(context).also { instance = it }
            }
        }

        private fun createEncryptedPrefs(context: Context): SharedPreferences {
            return try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()

                EncryptedSharedPreferences.create(
                    context,
                    "secure_prefs",
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (e: Exception) {
                // KeyStore corruption — delete the prefs file and recreate
                // User loses stored data, but the app doesn't crash
                context.deleteSharedPreferences("secure_prefs")
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context,
                    "secure_prefs",
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            }
        }
    }
}
```

Migrating from plain SharedPreferences to EncryptedSharedPreferences requires careful handling to avoid data loss. You cannot simply swap the implementation — the existing plaintext XML file is not encrypted, and EncryptedSharedPreferences will fail to decrypt it. The correct approach is to read all values from the old plain SharedPreferences, write them to the new EncryptedSharedPreferences, verify the migration succeeded, and then delete the old file. This migration should be idempotent — if the app crashes mid-migration, restarting it should complete the migration without duplicating or losing data.

```kotlin
// Migration from plain SharedPreferences to EncryptedSharedPreferences
fun migrateToEncrypted(context: Context) {
    val plainPrefs = context.getSharedPreferences("old_prefs", Context.MODE_PRIVATE)
    val migrationComplete = plainPrefs.getBoolean("_migration_complete", false)
    if (migrationComplete) return // Already migrated

    val securePrefs = RobustSecurePreferences.getInstance(context)
    val editor = securePrefs.edit()

    // Copy all entries from plain to encrypted
    plainPrefs.all.forEach { (key, value) ->
        if (key == "_migration_complete") return@forEach
        when (value) {
            is String -> editor.putString(key, value)
            is Int -> editor.putInt(key, value)
            is Long -> editor.putLong(key, value)
            is Float -> editor.putFloat(key, value)
            is Boolean -> editor.putBoolean(key, value)
            is Set<*> -> {
                @Suppress("UNCHECKED_CAST")
                editor.putStringSet(key, value as Set<String>)
            }
        }
    }
    editor.apply()

    // Mark migration complete in old prefs, then clear sensitive data
    plainPrefs.edit()
        .clear()
        .putBoolean("_migration_complete", true)
        .apply()
}
```

#### Common Mistakes

**Not initializing on a background thread** is the most frequent performance issue. `EncryptedSharedPreferences.create()` performs KeyStore operations that can block the main thread for hundreds of milliseconds. Always initialize it lazily on a background thread using `by lazy` or a coroutine. **Sharing the MasterKey across processes** doesn't work — each process has its own KeyStore instance, and EncryptedSharedPreferences does not support multi-process access. If your app uses multiple processes (common with Services), each process needs its own EncryptedSharedPreferences instance with a separate file name. **Forgetting to handle KeyStore corruption** will cause crashes. After OS updates, factory resets, or KeyStore bugs, the MasterKey may become invalid. Always wrap creation in a try-catch and have a recovery path (delete and recreate).

**Key takeaway:** Use `EncryptedSharedPreferences` for sensitive key-value data like auth tokens and user credentials. Initialize it lazily on a background thread — the first creation is expensive.

---

### Lesson 3.3: Encrypted Databases with SQLCipher

SQLite databases are the backbone of data storage in most Android apps. Room, Android's recommended database library, generates SQLite queries from annotated Kotlin classes. The problem is that Room databases are stored as unencrypted `.db` files in `/data/data/<package_name>/databases/`. On a rooted device, an attacker can copy the database file, open it with any SQLite browser, and query every row in every table. If your database contains user messages, financial transactions, health records, or cached API responses with PII, all of it is exposed. Even on non-rooted devices, ADB backup (if enabled) and device forensics tools can extract these database files. The solution is SQLCipher, an open-source extension that provides 256-bit AES encryption for SQLite databases.

SQLCipher works by encrypting every page of the SQLite database file using AES-256 in CBC mode with HMAC-SHA512 for authentication. When you open a SQLCipher database with a passphrase, it derives an encryption key from that passphrase using PBKDF2-HMAC-SHA512 with 256,000 iterations (as of SQLCipher 4.x). Every 4KB page of the database is individually encrypted with its own IV, and each page has an HMAC that detects tampering. This means the entire file is opaque — opening it in a hex editor or SQLite browser shows random bytes, and any modification to any page is detected and rejected.

```kotlin
// VULNERABLE: Standard Room database — plaintext .db file
// An attacker on a rooted device runs:
// $ sqlite3 /data/data/com.example.app/databases/user.db "SELECT * FROM users"
// And sees every row of user data

@Database(entities = [User::class], version = 1)
abstract class InsecureDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao

    companion object {
        fun create(context: Context): InsecureDatabase {
            return Room.databaseBuilder(
                context, InsecureDatabase::class.java, "user.db"
            ).build()
            // The resulting .db file is completely unencrypted
        }
    }
}
```

Integrating SQLCipher with Room requires the `net.zetetic:android-database-sqlcipher` and `androidx.sqlite:sqlite-ktx` dependencies. The key change is replacing Room's default `FrameworkSQLiteOpenHelperFactory` with SQLCipher's `SupportFactory`, passing in the passphrase as a byte array. The critical security decision is how you generate and store this passphrase. **Never hardcode the passphrase** — a string literal in your code survives R8/ProGuard obfuscation and can be extracted by anyone who decompiles your APK with jadx or apktool. Instead, derive the passphrase from a KeyStore-backed key. This means the passphrase can only be produced by the secure hardware on the specific device, making database extraction from backups or stolen devices useless.

```kotlin
// SECURE: Room database with SQLCipher encryption
// Passphrase derived from KeyStore — cannot be extracted from the APK

@Database(entities = [User::class, Transaction::class], version = 1)
abstract class SecureDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun transactionDao(): TransactionDao

    companion object {
        @Volatile
        private var instance: SecureDatabase? = null

        fun getInstance(context: Context): SecureDatabase {
            return instance ?: synchronized(this) {
                instance ?: buildDatabase(context).also { instance = it }
            }
        }

        private fun buildDatabase(context: Context): SecureDatabase {
            val passphrase = getOrCreatePassphrase(context)
            val factory = SupportFactory(passphrase)

            return Room.databaseBuilder(
                context, SecureDatabase::class.java, "secure_user.db"
            )
                .openHelperFactory(factory)
                .build()
        }

        private fun getOrCreatePassphrase(context: Context): ByteArray {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val alias = "db_passphrase_key"

            if (!keyStore.containsAlias(alias)) {
                val keyGen = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
                )
                keyGen.init(
                    KeyGenParameterSpec.Builder(
                        alias,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .build()
                )
                keyGen.generateKey()
            }

            // Use the key's encoded form as the passphrase seed
            // The actual passphrase derivation happens inside SQLCipher via PBKDF2
            val key = (keyStore.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val seed = "sqlcipher_passphrase_v1".toByteArray()
            val derived = cipher.doFinal(seed)

            // Store the IV for later passphrase re-derivation
            val prefs = EncryptedSharedPreferences.create(
                context, "db_config",
                MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            prefs.edit().putString(
                "db_iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
            ).apply()

            return derived
        }
    }
}
```

SQLCipher has measurable performance overhead. Encryption and decryption add roughly 5-15% overhead on read operations and 10-20% on write operations compared to standard SQLite, depending on the device hardware. The PBKDF2 key derivation on initial database open can take 100-300ms. For most apps, this overhead is negligible — you're talking about 0.5ms per query becoming 0.6ms. But for apps with heavy database usage (thousands of queries per second or very large result sets), you should benchmark the difference. If full-database encryption is too expensive, consider **column-level encryption** as an alternative: encrypt only the sensitive columns (SSN, tokens, medical data) while leaving non-sensitive columns (timestamps, status flags) in plaintext. This gives you the security where it matters without the full performance cost.

```kotlin
// Alternative: Column-level encryption for performance-sensitive apps
// Only encrypt the sensitive fields, leave metadata in plaintext

@Entity(tableName = "health_records")
data class HealthRecord(
    @PrimaryKey val id: Long,
    val createdAt: Long,             // Not sensitive — stored in plaintext
    val recordType: String,          // Not sensitive — stored in plaintext
    val encryptedDiagnosis: String,  // Sensitive — encrypted with KeyStore key
    val encryptedPatientNotes: String, // Sensitive — encrypted with KeyStore key
    val encryptionIv: String         // IV needed for decryption
)

class HealthRecordRepository(
    private val dao: HealthRecordDao,
    private val encryptor: ColumnEncryptor
) {
    suspend fun insertRecord(type: String, diagnosis: String, notes: String) {
        val (encDiagnosis, iv1) = encryptor.encrypt(diagnosis)
        val (encNotes, iv2) = encryptor.encrypt(notes)
        dao.insert(
            HealthRecord(
                id = System.nanoTime(),
                createdAt = System.currentTimeMillis(),
                recordType = type,
                encryptedDiagnosis = encDiagnosis,
                encryptedPatientNotes = encNotes,
                encryptionIv = "$iv1:$iv2"
            )
        )
    }

    suspend fun getRecord(id: Long): DecryptedHealthRecord? {
        val record = dao.getById(id) ?: return null
        val ivs = record.encryptionIv.split(":")
        return DecryptedHealthRecord(
            id = record.id,
            createdAt = record.createdAt,
            recordType = record.recordType,
            diagnosis = encryptor.decrypt(record.encryptedDiagnosis, ivs[0]),
            patientNotes = encryptor.decrypt(record.encryptedPatientNotes, ivs[1])
        )
    }
}
```

Migrating an existing unencrypted Room database to SQLCipher is a non-trivial operation. SQLCipher provides the `sqlcipher_export()` function, which can encrypt an existing database in-place. However, the safer approach is to create a new encrypted database, copy all data from the old database to the new one, verify the migration, and then delete the old unencrypted database. This approach is safer because it leaves the original database intact until migration is confirmed successful — if anything goes wrong, the user's data isn't lost. The migration should happen on first app launch after the update, and you should show a progress indicator since encrypting a large database can take several seconds.

#### Common Mistakes

**Hardcoding the SQLCipher passphrase** is the most dangerous mistake. A string literal like `val passphrase = "my_secret_passphrase".toByteArray()` survives decompilation and makes the encryption worthless. Always derive it from a KeyStore-backed key. **Not wiping the passphrase from memory** after opening the database leaves it vulnerable to memory dumps. Call `Arrays.fill(passphraseBytes, 0.toByte())` after passing it to `SupportFactory`. **Using SQLCipher without Room's migration support** leads to data loss when you change the schema. Always define proper Room migrations even for encrypted databases. **Forgetting to benchmark** can lead to performance regressions — always measure the impact of full-database encryption on your specific query patterns before shipping.

**Key takeaway:** Use SQLCipher with Room for databases containing sensitive data. Derive the passphrase from a KeyStore-backed key — never hardcode it.

---

### Lesson 3.4: Secure File Encryption

While EncryptedSharedPreferences handles key-value data and SQLCipher handles structured database storage, many apps need to encrypt arbitrary files — downloaded documents, cached images with PII, exported reports, or medical records. The Jetpack Security library provides `EncryptedFile`, which handles file-level encryption with streaming support, chunked encryption, and integrity verification. Under the hood, it uses the `AES256_GCM_HKDF_4KB` scheme, which encrypts the file in 4KB chunks, each with its own GCM authentication tag. This design is critical for large files — you can detect tampering at the chunk level without loading the entire file into memory.

The `EncryptedFile` API wraps the standard `FileOutputStream` and `FileInputStream` with encryption and decryption streams. Writing to an `EncryptedFile` looks almost identical to writing to a regular file — you call `openFileOutput()` instead of creating a `FileOutputStream` directly. Reading works the same way with `openFileInput()`. The encryption and decryption happen transparently as data flows through the stream. Each 4KB chunk is encrypted independently with AES-256-GCM, and an HKDF (HMAC-based Key Derivation Function) derives a unique key for each chunk from the master key. This means that even if an attacker manages to decrypt one chunk (which would require breaking AES-256), they cannot use that knowledge to decrypt any other chunk.

```kotlin
// VULNERABLE: Writing a sensitive file without encryption
fun saveReportInsecure(context: Context, reportData: ByteArray) {
    val file = File(context.filesDir, "medical_report.pdf")
    file.writeBytes(reportData) // Plaintext on disk — readable by root
}

// SECURE: Using EncryptedFile for transparent encryption
fun saveReportSecure(context: Context, reportData: ByteArray) {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    val file = File(context.filesDir, "medical_report.enc")

    // Delete existing file — EncryptedFile cannot overwrite
    if (file.exists()) file.delete()

    val encryptedFile = EncryptedFile.Builder(
        context,
        file,
        masterKey,
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()

    encryptedFile.openFileOutput().use { outputStream ->
        outputStream.write(reportData)
    }
}

fun readReportSecure(context: Context): ByteArray {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    val file = File(context.filesDir, "medical_report.enc")

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
```

The chunked encryption design of `AES256_GCM_HKDF_4KB` has important implications for large file handling. Consider a 100MB video file: without chunking, you'd need to load the entire 100MB into memory, encrypt it as a single operation, and write it out. With 4KB chunking, the encryption works as a streaming operation — data flows through the cipher in 4KB blocks, each independently encrypted and authenticated. This means memory usage stays constant regardless of file size. It also means that if a 100MB file has a tampered chunk near the end, you detect the tampering when you reach that chunk during sequential reading, not after loading all 100MB into memory. For apps handling large files (medical imaging, video, database exports), this streaming approach is essential.

When the `EncryptedFile` API doesn't give you enough control (for example, if you need custom key management, or you need to encrypt files with per-user keys rather than a single MasterKey), you can implement manual KeyStore-backed file encryption. This approach gives you full control over key selection, IV management, and file format. The tradeoff is that you're responsible for getting the cryptographic details right — handling IVs, authentication tags, and streaming correctly.

```kotlin
// Manual KeyStore-backed file encryption for advanced use cases
class KeyStoreFileEncryptor {
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun encryptFile(
        inputFile: File,
        outputFile: File,
        keyAlias: String
    ) {
        ensureKeyExists(keyAlias)
        val key = (keyStore.getEntry(keyAlias, null) as KeyStore.SecretKeyEntry).secretKey
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)

        outputFile.outputStream().buffered().use { out ->
            // Write IV length and IV first
            val iv = cipher.iv
            out.write(iv.size)
            out.write(iv)

            // Stream-encrypt the file in chunks
            inputFile.inputStream().buffered().use { input ->
                val buffer = ByteArray(4096)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    val encrypted = cipher.update(buffer, 0, bytesRead)
                    if (encrypted != null) out.write(encrypted)
                }
                // Finalize — writes the last block + GCM authentication tag
                val finalBlock = cipher.doFinal()
                out.write(finalBlock)
            }
        }
    }

    fun decryptFile(
        encryptedFile: File,
        outputFile: File,
        keyAlias: String
    ) {
        val key = (keyStore.getEntry(keyAlias, null) as KeyStore.SecretKeyEntry).secretKey

        encryptedFile.inputStream().buffered().use { input ->
            // Read IV
            val ivSize = input.read()
            val iv = ByteArray(ivSize)
            input.read(iv)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))

            outputFile.outputStream().buffered().use { out ->
                val buffer = ByteArray(4096)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    val decrypted = cipher.update(buffer, 0, bytesRead)
                    if (decrypted != null) out.write(decrypted)
                }
                // Finalize — verifies the GCM tag
                val finalBlock = cipher.doFinal()
                out.write(finalBlock)
            }
        }
    }

    private fun ensureKeyExists(alias: String) {
        if (!keyStore.containsAlias(alias)) {
            val keyGen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
            )
            keyGen.init(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build()
            )
            keyGen.generateKey()
        }
    }
}
```

Atomic write patterns are essential for file encryption to prevent data corruption. If the app crashes or is killed mid-write, the encrypted file can be left in a partially written, unrecoverable state. The standard approach is to write to a temporary file first, then atomically rename it to the target filename. `File.renameTo()` on the same filesystem is atomic on POSIX systems (which Android is) — either the rename completes entirely or it doesn't happen at all. This guarantees that the target file is always in a valid state: either the old version or the new version, never a partial write.

```kotlin
// Atomic write pattern to prevent corruption during encryption
fun atomicEncryptedWrite(
    context: Context,
    targetName: String,
    data: ByteArray
) {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    val targetFile = File(context.filesDir, targetName)
    val tempFile = File(context.filesDir, "$targetName.tmp")

    // Clean up any previous failed write
    if (tempFile.exists()) tempFile.delete()

    // Write to temp file
    val encryptedFile = EncryptedFile.Builder(
        context,
        tempFile,
        masterKey,
        EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()

    encryptedFile.openFileOutput().use { out ->
        out.write(data)
    }

    // Atomic rename — if this fails, the target file is untouched
    if (targetFile.exists()) targetFile.delete()
    if (!tempFile.renameTo(targetFile)) {
        tempFile.delete()
        throw IOException("Failed to atomically rename encrypted file")
    }
}
```

A critical limitation of the `EncryptedFile` API is that it cannot overwrite an existing file. If the target file already exists when you call `EncryptedFile.Builder(...).build()` and then `openFileOutput()`, it throws an `IOException`. You must explicitly delete the existing file before writing a new version. This is by design — it prevents accidental truncation of encrypted data — but it catches developers off guard. The atomic write pattern above handles this correctly by writing to a temp file and renaming.

#### Common Mistakes

**Calling `EncryptedFile.openFileOutput()` on an existing file** throws an exception. Always delete the target file first or use the atomic write pattern. **Loading entire large files into memory for encryption** causes `OutOfMemoryError` — use the streaming APIs that `EncryptedFile` provides. **Not handling `IOException` during encrypted file reads** can crash the app if the file was corrupted, truncated, or tampered with. Always wrap reads in try-catch and have a fallback path (re-download, clear cache, etc.). **Using the same MasterKey for all files** is fine for most apps, but if you need per-user encryption (multi-user apps), you need to manage separate keys per user.

**Key takeaway:** Use `EncryptedFile` for file-level encryption with streaming support. It handles chunked encryption automatically, making it suitable for large files without loading them entirely into memory.

---

### Lesson 3.5: Securing Content Providers

Content Providers are Android's mechanism for structured data sharing between apps. They expose data via URIs (e.g., `content://com.example.app.provider/users/42`) and support standard CRUD operations through `query()`, `insert()`, `update()`, and `delete()` methods. The security problem is that Content Providers are a massive attack surface. A misconfigured provider can leak your app's entire database to any app on the device. A provider vulnerable to SQL injection can allow an attacker to execute arbitrary queries. A provider vulnerable to path traversal can allow an attacker to read files outside the intended directory. Content Providers are one of the most commonly exploited components in Android security assessments.

The first and most important security setting is the `exported` attribute. By default, a Content Provider is exported (accessible to other apps) if it declares an `intent-filter` or if the app targets API 16 or below. Starting with Android 12 (API 31), you must explicitly declare `android:exported="true"` or `android:exported="false"` for every provider. If a provider is exported, any app on the device can query it. If your provider is only used internally (within your own app), always set `exported="false"`. This single setting eliminates the entire category of external access attacks.

```kotlin
// VULNERABLE: Exported Content Provider with no permission checks
// Any app on the device can query, insert, update, or delete data
// AndroidManifest.xml:
// <provider
//     android:name=".UserDataProvider"
//     android:authorities="com.example.app.provider"
//     android:exported="true" />  <!-- Accessible to ALL apps! -->

class InsecureProvider : ContentProvider() {
    private lateinit var db: SQLiteDatabase

    override fun query(
        uri: Uri,
        projection: Array<String>?,
        selection: String?,
        selectionArgs: Array<String>?,
        sortOrder: String?
    ): Cursor? {
        // VULNERABLE: No permission check, no projection validation
        // An attacker can query ANY column, including sensitive ones
        return db.query("users", projection, selection, selectionArgs,
            null, null, sortOrder)
    }

    // ... other CRUD methods equally unprotected
    override fun onCreate(): Boolean = true
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, sel: String?, args: Array<String>?): Int = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int = 0
}
```

**SQL injection** in Content Providers is alarmingly common. If the provider passes the `selection` parameter directly to `SQLiteDatabase.query()` without validation, an attacker can inject arbitrary SQL. For example, a malicious app could call `contentResolver.query(uri, null, "1=1) UNION SELECT password FROM credentials--", null, null)` and extract data from tables that the provider wasn't supposed to expose. The defense is to always use parameterized queries (using `selectionArgs` instead of string concatenation), validate the `selection` parameter against a whitelist of allowed columns, and never expose raw SQL execution.

```kotlin
// VULNERABLE: SQL injection through selection parameter
class InjectableProvider : ContentProvider() {
    override fun query(
        uri: Uri, projection: Array<String>?,
        selection: String?, selectionArgs: Array<String>?,
        sortOrder: String?
    ): Cursor? {
        // If an attacker passes: selection = "1=1) UNION SELECT token FROM auth--"
        // This executes: SELECT * FROM users WHERE 1=1) UNION SELECT token FROM auth--
        return db.query("users", projection, selection, selectionArgs,
            null, null, sortOrder)
    }

    // SECURE: Parameterized queries with column whitelist
    private val allowedColumns = setOf("id", "display_name", "avatar_url")
    private val allowedSortColumns = setOf("id", "display_name")

    fun secureQuery(
        uri: Uri, projection: Array<String>?,
        selection: String?, selectionArgs: Array<String>?,
        sortOrder: String?
    ): Cursor? {
        // Validate projection — only allow specific columns
        val safeProjection = projection?.filter { it in allowedColumns }
            ?.toTypedArray()
            ?: allowedColumns.toTypedArray()

        // Validate sort order
        val safeSortOrder = if (sortOrder != null) {
            val parts = sortOrder.trim().split("\\s+".toRegex())
            val column = parts.getOrNull(0) ?: ""
            val direction = parts.getOrNull(1)?.uppercase() ?: "ASC"
            if (column in allowedSortColumns && direction in listOf("ASC", "DESC")) {
                "$column $direction"
            } else null
        } else null

        // Use parameterized selection only
        return db.query("users", safeProjection, selection, selectionArgs,
            null, null, safeSortOrder)
    }

    override fun onCreate(): Boolean = true
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<String>?): Int = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int = 0

    companion object {
        private lateinit var db: SQLiteDatabase
    }
}
```

**Path traversal attacks** target Content Providers that serve files via `openFile()`. If the provider constructs a file path by concatenating the base directory with a URI segment without validation, an attacker can use `../` sequences to escape the intended directory. For example, `content://com.example.app.provider/files/../../shared_prefs/credentials.xml` could read the app's SharedPreferences file. The defense is to canonicalize the path (resolve all `../` sequences) and verify that the resulting path is still within the allowed directory.

```kotlin
// VULNERABLE: Path traversal in openFile()
class FileProvider : ContentProvider() {
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        val fileName = uri.lastPathSegment ?: return null
        // VULNERABLE: An attacker sends "../../shared_prefs/secrets.xml"
        val file = File(context!!.filesDir, "exports/$fileName")
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun onCreate(): Boolean = true
    override fun query(u: Uri, p: Array<String>?, s: String?,
                       a: Array<String>?, o: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<String>?): Int = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int = 0
}

// SECURE: Path traversal prevention with canonical path validation
class SecureFileProvider : ContentProvider() {
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        val fileName = uri.lastPathSegment ?: return null
        val baseDir = File(context!!.filesDir, "exports")
        val requestedFile = File(baseDir, fileName)

        // Canonicalize to resolve any ../  sequences
        val canonicalBase = baseDir.canonicalPath
        val canonicalFile = requestedFile.canonicalPath

        // Verify the resolved path is within the allowed directory
        if (!canonicalFile.startsWith(canonicalBase)) {
            throw SecurityException("Path traversal detected: $fileName")
        }

        if (!requestedFile.exists()) return null

        return ParcelFileDescriptor.open(
            requestedFile, ParcelFileDescriptor.MODE_READ_ONLY
        )
    }

    override fun onCreate(): Boolean = true
    override fun query(u: Uri, p: Array<String>?, s: String?,
                       a: Array<String>?, o: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<String>?): Int = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int = 0
}
```

When a Content Provider must be exported (for sharing data with partner apps, for example), use custom permissions to restrict access. Define a `signature`-level permission so that only apps signed with the same certificate can access the provider. For cross-organization sharing, use `dangerous`-level permissions that require user approval. Always enforce permissions in the provider code itself — don't rely solely on the manifest declaration, because the `android:permission` attribute can be bypassed in certain scenarios on older Android versions.

```kotlin
// SECURE: Content Provider with permission enforcement and data protection
// In AndroidManifest.xml:
// <permission
//     android:name="com.example.app.permission.READ_DATA"
//     android:protectionLevel="signature" />
//
// <provider
//     android:name=".SecureDataProvider"
//     android:authorities="com.example.app.secure"
//     android:exported="true"
//     android:readPermission="com.example.app.permission.READ_DATA"
//     android:writePermission="com.example.app.permission.WRITE_DATA" />

class SecureDataProvider : ContentProvider() {
    private val uriMatcher = UriMatcher(UriMatcher.NO_MATCH).apply {
        addURI("com.example.app.secure", "public_profiles", CODE_PROFILES)
        addURI("com.example.app.secure", "public_profiles/#", CODE_PROFILE_ID)
    }

    // Only expose non-sensitive columns to external callers
    private val externalColumns = setOf(
        "id", "display_name", "avatar_hash", "created_at"
    )
    private val internalOnlyColumns = setOf(
        "email", "phone", "auth_token", "device_id"
    )

    override fun query(
        uri: Uri, projection: Array<String>?,
        selection: String?, selectionArgs: Array<String>?,
        sortOrder: String?
    ): Cursor? {
        // Runtime permission check
        val callingPackage = callingPackage
        context?.enforceCallingPermission(
            "com.example.app.permission.READ_DATA",
            "Permission required to read data"
        )

        // Filter projection to external-only columns
        val safeProjection = projection
            ?.filter { it in externalColumns }
            ?.toTypedArray()
            ?: externalColumns.toTypedArray()

        return when (uriMatcher.match(uri)) {
            CODE_PROFILES -> queryProfiles(safeProjection, selection, selectionArgs)
            CODE_PROFILE_ID -> {
                val id = uri.lastPathSegment ?: return null
                queryProfiles(safeProjection, "id = ?", arrayOf(id))
            }
            else -> throw IllegalArgumentException("Unknown URI: $uri")
        }
    }

    private fun queryProfiles(
        projection: Array<String>,
        selection: String?,
        selectionArgs: Array<String>?
    ): Cursor? {
        // Hash PII before returning — expose hashed data instead of raw PII
        return null // Database query implementation
    }

    override fun onCreate(): Boolean = true
    override fun getType(uri: Uri): String = "vnd.android.cursor.dir/vnd.example.profiles"
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<String>?): Int = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<String>?): Int = 0

    companion object {
        private const val CODE_PROFILES = 1
        private const val CODE_PROFILE_ID = 2
    }
}
```

A critical best practice for Content Providers that expose user data is to **return hashed or anonymized data** instead of raw PII. If a partner app needs to identify a user, provide a hashed identifier rather than the user's email or phone number. If it needs to display a profile image, provide a URL or hash rather than the raw image data. This limits the blast radius if a partner app is compromised — the attacker gets hashed identifiers, not raw PII. This approach follows the principle of least privilege: expose the minimum data necessary for the consuming app to function.

#### Common Mistakes

**Leaving `exported="true"` by default** is the most common Content Provider vulnerability. If your provider is only used internally, always set `exported="false"`. **Not validating the `projection` parameter** allows attackers to query columns that should be hidden (tokens, passwords, PII). Always whitelist allowed columns. **Concatenating user input into SQL queries** enables SQL injection — always use parameterized queries with `selectionArgs`. **Not checking `canonicalPath` in `openFile()`** enables path traversal — always canonicalize and verify that the resolved path is within the allowed directory.

**Key takeaway:** Default ContentProviders to `exported="false"`. When export is necessary, enforce custom permissions, validate URI paths, and restrict queryable columns. Expose hashed data instead of raw PII where possible.

---

### Quiz: Secure Data Storage

#### Where does the Android Keystore store cryptographic keys on supported devices?
- \u274c In the app\u2019s private SharedPreferences
- \u274c In an encrypted file on internal storage
- \u2705 In secure hardware (TEE/StrongBox)
- \u274c In the app\u2019s APK resources directory

> **Explanation:** The Android Keystore leverages the Trusted Execution Environment (TEE) or StrongBox secure hardware on supported devices. Keys stored here never leave the secure hardware \u2014 cryptographic operations happen inside the TEE. Even on a rooted device, the raw key material cannot be extracted.

#### What does EncryptedSharedPreferences encrypt?
- \u274c Only the values, not the keys
- \u274c Only the keys, not the values
- \u2705 Both keys and values
- \u274c Neither \u2014 it only restricts access permissions

> **Explanation:** EncryptedSharedPreferences encrypts both preference keys (using AES256-SIV) and values (using AES256-GCM). This means an attacker cannot even see what preference names exist, let alone their values. This is a critical distinction from regular SharedPreferences where everything is stored in plain XML.

#### Why should you derive SQLCipher\u2019s passphrase from a KeyStore key rather than hardcoding it?
- \u274c Hardcoded passphrases make the database slower
- \u274c KeyStore passphrases are automatically rotated
- \u2705 A hardcoded passphrase can be extracted by decompiling the APK, defeating the encryption
- \u274c Room requires KeyStore-backed passphrases

> **Explanation:** If the SQLCipher passphrase is a string literal in your code, R8 won\u2019t encrypt it \u2014 anyone who decompiles your APK with jadx can read the passphrase and decrypt the database. Deriving the passphrase from a KeyStore-backed key means the passphrase can only be produced by the secure hardware on the specific device, making database extraction from backups or rooted devices useless.

#### What advantage does EncryptedFile\u2019s chunked encryption provide?
- \u274c Faster encryption speed
- \u2705 Files can be read and verified incrementally without loading the entire file into memory
- \u274c Automatic file compression
- \u274c Cross-device portability of encrypted files

> **Explanation:** The `AES256_GCM_HKDF_4KB` scheme encrypts files in 4KB chunks, each with its own authentication tag. This allows streaming reads \u2014 if a 100MB file has a tampered chunk at the end, you detect it when you reach that chunk, not after loading the entire file into memory. It also means encryption and decryption can work with streaming I/O, critical for large files on memory-constrained devices.

### Coding Challenge: Secure Key-Value Store with TTL

Build a `SecureStorage` class that stores encrypted key-value pairs with a time-to-live (TTL). Entries should automatically expire after a configurable duration. Use `EncryptedSharedPreferences` for storage and include methods for `put`, `get` (returns null for expired entries), `remove`, and `clearExpired`.

#### Solution

```kotlin
class SecureStorage(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "secure_ttl_store",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun put(key: String, value: String, ttlMillis: Long) {
        val expiresAt = System.currentTimeMillis() + ttlMillis
        val payload = JSONObject().apply {
            put("value", value)
            put("expiresAt", expiresAt)
        }
        prefs.edit().putString(key, payload.toString()).apply()
    }

    fun get(key: String): String? {
        val raw = prefs.getString(key, null) ?: return null
        return try {
            val payload = JSONObject(raw)
            val expiresAt = payload.getLong("expiresAt")
            if (System.currentTimeMillis() > expiresAt) {
                remove(key) // Clean up expired entry
                null
            } else {
                payload.getString("value")
            }
        } catch (e: Exception) {
            remove(key) // Corrupted entry
            null
        }
    }

    fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    fun clearExpired() {
        val now = System.currentTimeMillis()
        val editor = prefs.edit()
        prefs.all.forEach { (key, value) ->
            try {
                val payload = JSONObject(value as String)
                if (now > payload.getLong("expiresAt")) {
                    editor.remove(key)
                }
            } catch (e: Exception) {
                editor.remove(key) // Remove corrupted entries
            }
        }
        editor.apply()
    }
}
```

This solution wraps each value in a JSON payload with an expiration timestamp. The `get` method checks the timestamp before returning and auto-cleans expired entries. The `clearExpired` method iterates all entries to purge stale data, ideal for periodic cleanup via WorkManager. Since the underlying `EncryptedSharedPreferences` encrypts both keys and values, neither the key names, values, nor expiration timestamps are readable without the MasterKey.

---

## Module 4: Network Security

Network transactions are the riskiest part of any mobile application. Every byte your app sends over the network passes through infrastructure you don't control — Wi-Fi access points, ISP routers, CDN edge nodes, and reverse proxies. A sophisticated attacker on the same Wi-Fi network can intercept, modify, and replay your app's traffic in real time. A nation-state actor can compromise a Certificate Authority and issue fraudulent certificates for your domain. A malicious proxy can strip HTTPS and downgrade your connection to cleartext HTTP. This module covers the complete network security stack: from TLS fundamentals and certificate pinning, to secure API communication, WebView hardening, and real-time WebSocket protection.

### Lesson 4.1: TLS and HTTPS Fundamentals

TLS (Transport Layer Security) is the protocol that encrypts data in transit between your app and the server. When your app connects to `https://api.example.com`, a TLS handshake happens before any application data is exchanged. The handshake has four critical steps: (1) the client sends a "ClientHello" with supported cipher suites and a random nonce, (2) the server responds with its certificate and chosen cipher suite, (3) the client verifies the server's certificate against its trust store and generates a pre-master secret encrypted with the server's public key, (4) both sides derive the session keys and begin encrypted communication. This entire handshake happens in 1-2 round trips (TLS 1.3 reduces it to 1 round trip with 0-RTT resumption). Understanding this process is essential because every step is a potential attack surface — a compromised CA can issue fake certificates, a weak cipher suite can be cracked, and a missing certificate check can allow a man-in-the-middle.

The **CA (Certificate Authority) trust model** is the foundation of HTTPS, and also its biggest weakness. Android ships with a trust store containing approximately 150 root CA certificates from organizations like DigiCert, Let's Encrypt, and GlobalSign. When your app receives a server's certificate during the TLS handshake, it verifies the certificate chain: the server's leaf certificate was signed by an intermediate CA, which was signed by a root CA that Android trusts. The problem is that your app trusts ALL of these CAs equally — if any one of them is compromised (or coerced by a government), the attacker can issue a valid certificate for your domain, and your app will accept it. This has happened in practice: in 2011, DigiNotar (a Dutch CA) was compromised and used to issue fraudulent certificates for google.com, intercepting Gmail traffic in Iran. Certificate pinning, covered in Lesson 4.3, addresses this by restricting which certificates your app accepts.

**Cleartext traffic** (HTTP without TLS) is the most basic network security failure. If your app sends any data over HTTP, an attacker on the same network can read it in plaintext using tools like Wireshark or tcpdump. Starting with Android 9 (API 28), cleartext HTTP traffic is blocked by default for apps targeting API 28+. However, many apps explicitly re-enable cleartext traffic in their Network Security Configuration or target older APIs. Every security audit should verify that `android:usesCleartextTraffic="false"` is set in the manifest and that no Network Security Configuration overrides re-enable it for production domains.

```kotlin
// VULNERABLE: Allowing cleartext HTTP traffic
// AndroidManifest.xml: android:usesCleartextTraffic="true"
// An attacker on the same Wi-Fi can see everything:
fun fetchDataInsecure() {
    // This sends auth token in plaintext over the network
    val url = URL("http://api.example.com/user/profile")
    val connection = url.openConnection() as HttpURLConnection
    connection.setRequestProperty("Authorization", "Bearer eyJhbGci...")
    // An attacker running Wireshark sees:
    // GET /user/profile HTTP/1.1
    // Authorization: Bearer eyJhbGci...
    val response = connection.inputStream.bufferedReader().readText()
}

// SECURE: HTTPS only, with cleartext traffic disabled
// AndroidManifest.xml: android:usesCleartextTraffic="false"
// Or better, use Network Security Configuration (Lesson 4.2)
fun fetchDataSecure() {
    val url = URL("https://api.example.com/user/profile")
    val connection = url.openConnection() as HttpsURLConnection
    // TLS encrypts everything — the attacker sees encrypted bytes
    connection.setRequestProperty("Authorization", "Bearer eyJhbGci...")
    val response = connection.inputStream.bufferedReader().readText()
}
```

SMS is often used as a fallback communication channel for OTPs and verification codes, but it is fundamentally insecure. SMS messages are transmitted in plaintext over the SS7 signaling protocol, which was designed in the 1970s with no encryption. Attackers can intercept SMS messages via SS7 vulnerabilities (demonstrated publicly since 2014), SIM swapping attacks (convincing a carrier to transfer a victim's phone number), or malware with `READ_SMS` permission. NIST deprecated SMS-based two-factor authentication in 2016. If your app uses SMS OTPs, treat them as a convenience feature, not a security control — and always offer TOTP (Time-based One-Time Password) or push notification-based authentication as alternatives.

**HSTS (HTTP Strict Transport Security)** is a server-side mechanism that tells browsers and HTTP clients to always use HTTPS for a domain. When a server includes the `Strict-Transport-Security` header in its response, the client remembers this and automatically upgrades any future HTTP requests to HTTPS. This prevents SSL stripping attacks, where an attacker downgrades an initial HTTP connection to prevent the redirect to HTTPS. While HSTS is primarily a browser concern, your Android app should still handle it — OkHttp respects HSTS headers by default, and your backend should send them. The `max-age` directive specifies how long the client should remember the HSTS policy, and `includeSubDomains` extends it to all subdomains.

```kotlin
// Verifying certificate chain programmatically
fun verifyCertificateChain(connection: HttpsURLConnection) {
    val serverCerts = connection.serverCertificates
    val factory = CertificateFactory.getInstance("X.509")

    serverCerts.forEachIndexed { index, cert ->
        val x509 = cert as X509Certificate
        Log.d("TLS", "Certificate [$index]:")
        Log.d("TLS", "  Subject: ${x509.subjectDN}")
        Log.d("TLS", "  Issuer: ${x509.issuerDN}")
        Log.d("TLS", "  Valid: ${x509.notBefore} to ${x509.notAfter}")
        Log.d("TLS", "  Serial: ${x509.serialNumber}")

        // Verify the certificate hasn't expired
        try {
            x509.checkValidity()
        } catch (e: CertificateExpiredException) {
            throw SecurityException("Server certificate expired")
        }
    }
}

// Disabling weak TLS versions programmatically
fun createSecureSocketFactory(): SSLSocketFactory {
    val sslContext = SSLContext.getInstance("TLSv1.3")
    sslContext.init(null, null, null)
    return sslContext.socketFactory
    // TLS 1.0 and 1.1 are disabled — only 1.2 and 1.3 are allowed
}
```

The difference between TLS 1.2 and TLS 1.3 matters for mobile apps. TLS 1.3, supported on Android 10+ (API 29+), removes support for vulnerable cipher suites (RSA key exchange, CBC mode ciphers, SHA-1), reduces the handshake to 1 round trip (vs 2 for TLS 1.2), and supports 0-RTT session resumption for repeat connections. For apps targeting modern Android versions, TLS 1.3 is automatically negotiated when the server supports it. For apps that must support older devices, ensure that your server still supports TLS 1.2 with strong cipher suites (ECDHE key exchange + AES-GCM). Disable TLS 1.0 and 1.1 on both client and server — they have known vulnerabilities (BEAST, POODLE) and are deprecated by all major browsers.

#### Common Mistakes

**Accepting all certificates** by implementing a custom `TrustManager` that doesn't validate the certificate chain is the most dangerous network security mistake. This completely disables TLS verification and makes your app vulnerable to any man-in-the-middle attack. This pattern often appears in development code to bypass certificate errors and accidentally ships to production. **Using HTTP for "non-sensitive" endpoints** is a fallacy — even if the response data isn't sensitive, the request reveals the URL pattern (which leaks API structure) and cookies or auth headers may be attached. **Ignoring certificate expiration** means your app will suddenly fail when the server's certificate expires, causing a bad user experience.

**Key takeaway:** HTTPS is the minimum bar, not the finish line. Disable cleartext traffic, but understand that TLS trusts the entire CA ecosystem — certificate pinning adds the restriction that only YOUR certificate is accepted.

---

### Lesson 4.2: Network Security Configuration

Android's Network Security Configuration (NSC) is a declarative XML-based system that lets you customize your app's network security settings without changing code. Introduced in Android 7.0 (API 24), it provides a centralized place to control cleartext traffic policies, custom trust anchors, certificate pinning, and debug-only overrides. The configuration lives in `res/xml/network_security_config.xml` and is referenced from your manifest with `android:networkSecurityConfig="@xml/network_security_config"`. This declarative approach is superior to programmatic configuration because it's auditable (security reviewers can read the XML), it's harder to accidentally override (no conditional logic), and it separates security policy from business logic.

The most basic NSC configuration disables cleartext traffic globally and pins certificates for your API domain. The `<base-config>` element sets defaults for all connections, while `<domain-config>` elements override settings for specific domains. The `cleartextTrafficPermitted="false"` attribute on `<base-config>` ensures that no HTTP requests can be made to any domain — this is strictly stronger than the manifest's `usesCleartextTraffic` attribute because it applies even to third-party libraries that might try to use HTTP.

```xml
<!-- res/xml/network_security_config.xml -->
<!-- Comprehensive Network Security Configuration -->
<network-security-config>

    <!-- Default: block all cleartext traffic -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <!-- Only trust system CAs (not user-installed CAs) -->
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Pin certificates for your API domain -->
    <domain-config>
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2025-06-01">
            <!-- Primary pin (intermediate CA) -->
            <pin digest="SHA-256">YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=</pin>
            <!-- Backup pin (different CA — disaster recovery) -->
            <pin digest="SHA-256">Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys=</pin>
        </pin-set>
    </domain-config>

    <!-- Debug overrides — ONLY active in debug builds -->
    <debug-overrides>
        <trust-anchors>
            <!-- Trust user-installed CAs (for Charles/mitmproxy) -->
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>

</network-security-config>
```

Each element in the NSC deserves careful understanding. The `<trust-anchors>` element controls which Certificate Authorities your app trusts. By default, apps targeting API 24+ trust system CAs but not user-installed CAs. This is important because on Android 6 and below, apps trusted user-installed CAs by default, meaning a user who installed a proxy CA (like Charles Proxy or mitmproxy) could intercept any app's HTTPS traffic. The `<certificates src="system" />` restriction means only manufacturer-installed CAs are trusted, which blocks proxy-based interception on non-rooted devices.

The `<pin-set>` element enables certificate pinning at the configuration level. The `expiration` attribute is a **critical safety valve** — it specifies a date after which the pins are no longer enforced. If you accidentally pin to a certificate that gets revoked or rotated before you can push an app update, the expiration date ensures that users aren't permanently locked out. Without an expiration date, a bad pin can permanently break networking for users who don't update. Set the expiration to a date by which you're confident you can release an update (typically 3-6 months from the current date), and refresh the pins with each release.

The `<debug-overrides>` element is the correct way to enable proxy tools for development. Developers often weaken production security to use debugging proxies — they'll add a custom `TrustManager` that accepts all certificates, or set `cleartextTrafficPermitted="true"` globally. The `<debug-overrides>` section is only active when `android:debuggable="true"` (debug builds), so it has zero impact on production. Within debug-overrides, adding `<certificates src="user" />` trusts user-installed CAs, enabling tools like Charles Proxy and mitmproxy to intercept HTTPS traffic for debugging.

```kotlin
// Programmatically verifying that NSC is applied correctly
fun verifyNetworkSecurityConfig(context: Context) {
    // Check if cleartext is blocked
    val info = context.packageManager.getApplicationInfo(
        context.packageName, 0
    )
    val cleartextBlocked = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        !NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted
    } else false

    Log.d("Security", "Cleartext blocked: $cleartextBlocked")

    // Verify by attempting an HTTP request (should fail)
    try {
        val url = URL("http://api.example.com/test")
        val conn = url.openConnection() as HttpURLConnection
        conn.connect()
        Log.e("Security", "FAIL: Cleartext connection succeeded!")
    } catch (e: IOException) {
        Log.d("Security", "PASS: Cleartext correctly blocked")
    }
}

// Common mistake: different NSC for different build variants
// build.gradle.kts
// debug {
//     manifestPlaceholders["networkSecurityConfig"] = "@xml/network_security_config_debug"
// }
// release {
//     manifestPlaceholders["networkSecurityConfig"] = "@xml/network_security_config_release"
// }
// DON'T do this — use debug-overrides in a single config file instead
```

A common and dangerous pattern is using build-variant-specific NSC files — one for debug with weak security and one for release. This is fragile because developers sometimes accidentally ship the debug configuration to production. The `<debug-overrides>` mechanism is specifically designed to avoid this problem: you have a single configuration file with production-level security, and the debug-overrides section is automatically ignored in release builds. There is no risk of accidentally weakening production security.

For apps that communicate with multiple API endpoints (your own backend, analytics services, CDN), you can define multiple `<domain-config>` sections with different policies. Each domain can have its own pin set, cleartext policy, and trust anchors. This granularity lets you pin your own API domain while allowing third-party SDKs to use their own certificates. However, avoid over-complicating the configuration — every additional domain-config is a maintenance burden, and forgotten pin rotations for third-party domains can break functionality.

#### Common Mistakes

**Omitting the expiration date on pin-set** is dangerous. Without it, a bad pin permanently breaks networking with no recovery path. Always set an expiration 3-6 months out. **Using debug-overrides to trust user CAs in release builds** defeats the entire purpose. The `<debug-overrides>` element is ignored in release builds by design — never move user CA trust to `<base-config>`. **Not including a backup pin** means that if your primary certificate is revoked, all users are locked out until they update. Always pin two certificates from different CAs. **Forgetting to reference the NSC in the manifest** means the configuration has no effect — verify that `android:networkSecurityConfig` is set.

**Key takeaway:** Use Network Security Configuration to centralize your network security policy. Set certificate pin expiration dates as a safety valve. Use debug-overrides for proxy tools — never weaken production security for development convenience.

---

### Lesson 4.3: Certificate Pinning with OkHttp

Certificate pinning adds an additional layer of verification beyond standard TLS. Without pinning, your app trusts any certificate signed by any of the ~150 CAs in Android's trust store. With pinning, your app only accepts certificates whose public key hash matches a specific value you've embedded in the app. This means that even if an attacker compromises a CA and issues a valid certificate for your domain, your app will reject it because the public key hash doesn't match. Certificate pinning is essential for apps that handle financial transactions, health data, authentication tokens, or any data where a man-in-the-middle attack would be catastrophic.

There are three levels at which you can pin: **leaf certificate**, **intermediate certificate**, and **root certificate**. Each has different tradeoffs. Leaf pinning is the most restrictive — you pin to the exact certificate your server uses. This provides the strongest guarantee but breaks whenever you rotate your server certificate (typically every 1-2 years for certificates from major CAs). Intermediate pinning pins to the certificate of the CA that signed your server certificate (e.g., "DigiCert SHA2 Secure Server CA"). Your server certificate can be rotated freely as long as the new certificate is signed by the same intermediate CA. Root pinning pins to the root CA and provides the most flexibility but the weakest security — any certificate signed by that root CA (or its intermediates) would be accepted. **Intermediate pinning is the recommended approach** — it balances security and operational flexibility.

```kotlin
// VULNERABLE: No certificate pinning — trusts all ~150 CAs
val insecureClient = OkHttpClient.Builder()
    .build()
// If any CA is compromised, an attacker can intercept traffic
// Tools like mitmproxy with a user-installed CA certificate
// can read all HTTPS traffic on a non-pinned client

// SECURE: Certificate pinning with OkHttp
class SecureNetworkClient {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .certificatePinner(createCertificatePinner())
            .addInterceptor(SecurityHeadersInterceptor())
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private fun createCertificatePinner(): CertificatePinner {
        return CertificatePinner.Builder()
            // Pin to the intermediate certificate (recommended)
            .add(
                "api.example.com",
                "sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=" // Primary
            )
            .add(
                "api.example.com",
                "sha256/Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys=" // Backup
            )
            // Pin CDN domain separately
            .add(
                "cdn.example.com",
                "sha256/Ko8tivDrIuQQ3S7gEFSP5TDJryFVNqmVf7pPKM8OYZs="
            )
            .add(
                "cdn.example.com",
                "sha256/R4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWysKo8t="
            )
            .build()
    }
}

class SecurityHeadersInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder()
            .header("X-Content-Type-Options", "nosniff")
            .header("X-Frame-Options", "DENY")
            .header("Cache-Control", "no-store") // Prevent caching sensitive responses
            .build()

        val response = chain.proceed(request)

        // Verify server includes expected security headers
        val hstsHeader = response.header("Strict-Transport-Security")
        if (hstsHeader == null) {
            Log.w("Security", "Server missing HSTS header for ${request.url}")
        }

        return response
    }
}
```

The **backup pin** strategy is critical for operational resilience. If you only pin to one certificate and that certificate is revoked, compromised, or rotated to a different CA, every user's app stops working until they update. The backup pin should be from a **different CA** — if your primary certificate is from DigiCert, your backup should be from a different provider like Let's Encrypt. This protects against both certificate rotation and CA compromise. You should also have a process to rotate pins: before your current certificate expires, generate a new certificate from your backup CA, add its hash as the new primary pin in an app update, and promote the old backup to a secondary pin.

To understand why pinning is necessary, consider a detailed **MitM (Man-in-the-Middle) attack walkthrough**. An attacker sets up a rogue Wi-Fi access point named "Starbucks Free WiFi." A user connects and opens your app. The attacker intercepts the TLS handshake and presents a fraudulent certificate for `api.example.com`, signed by a CA they've compromised (or by a user-installed CA on a device they've had temporary access to). Without pinning, the app accepts this certificate because it chains to a trusted root. The attacker now sees all traffic in plaintext — auth tokens, personal data, API requests. With pinning, the app checks the certificate's public key hash against the pinned values, finds no match, and refuses the connection. The attack fails.

```kotlin
// How to extract the pin hash from your server's certificate
// Run this command in your terminal:
// openssl s_client -connect api.example.com:443 -servername api.example.com | \
//   openssl x509 -pubkey -noout | \
//   openssl pkey -pubin -outform der | \
//   openssl dgst -sha256 -binary | \
//   openssl enc -base64
//
// This outputs the SHA-256 hash of the certificate's public key
// Example output: YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=

// Pin rotation strategy implementation
class PinRotationManager(private val context: Context) {
    // Version the pin configuration so the server can tell the client to update
    private val currentPinVersion = 3

    fun createPinnerForVersion(version: Int): CertificatePinner {
        return when (version) {
            3 -> CertificatePinner.Builder()
                .add("api.example.com",
                    "sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=")
                .add("api.example.com",
                    "sha256/Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys=")
                .build()
            2 -> CertificatePinner.Builder()
                .add("api.example.com",
                    "sha256/OldPrimaryPinHash=")
                .add("api.example.com",
                    "sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=")
                .build()
            else -> CertificatePinner.Builder().build() // No pinning as fallback
        }
    }

    fun handlePinningFailure(hostname: String, e: Exception) {
        // Log the failure for monitoring (without sensitive data)
        Log.e("Pinning", "Certificate pinning failed for $hostname")
        // Report to your security monitoring backend
        // Do NOT fall back to unpinned connection — that defeats the purpose
    }
}
```

OkHttp's `CertificatePinner` checks pins against the entire certificate chain, not just the leaf certificate. When you pin `sha256/YLh1...`, OkHttp computes the SHA-256 hash of the SubjectPublicKeyInfo (SPKI) of each certificate in the chain and checks if any of them match your pin. This means a single pin value for the intermediate certificate matches regardless of which leaf certificate the server presents, giving you the flexibility of intermediate pinning. If none of the certificates in the chain match any pin for the requested hostname, OkHttp throws a `SSLPeerUnverifiedException` and refuses the connection.

```kotlin
// Testing pinning in development — use a custom event listener
class PinningDebugEventListener : EventListener() {
    override fun secureConnectEnd(call: Call, handshake: Handshake?) {
        handshake?.let {
            Log.d("Pinning", "TLS version: ${it.tlsVersion}")
            Log.d("Pinning", "Cipher suite: ${it.cipherSuite}")
            it.peerCertificates.forEachIndexed { index, cert ->
                val x509 = cert as X509Certificate
                val pin = CertificatePinner.pin(cert)
                Log.d("Pinning", "Cert [$index] pin: $pin")
                Log.d("Pinning", "  Subject: ${x509.subjectDN}")
                Log.d("Pinning", "  Issuer: ${x509.issuerDN}")
            }
        }
    }

    override fun callFailed(call: Call, ioe: IOException) {
        if (ioe is SSLPeerUnverifiedException) {
            Log.e("Pinning", "PIN MISMATCH: ${call.request().url}")
        }
    }
}

// Use the debug listener in development builds only
val debugClient = OkHttpClient.Builder()
    .certificatePinner(createCertificatePinner())
    .eventListener(PinningDebugEventListener())
    .build()
```

#### Common Mistakes

**Pinning to the leaf certificate** requires an app update every time the server certificate rotates (every 90 days with Let's Encrypt). Pin to the intermediate instead. **Not including a backup pin** is the most common operational failure — when the primary certificate rotates to a different CA, all unprepared users are locked out. **Falling back to unpinned connections on pinning failure** defeats the entire purpose. If pinning fails, the connection should be blocked, not downgraded. **Hardcoding pins without a rotation strategy** means you'll eventually face an emergency when pins expire. Plan pin rotation as part of your certificate lifecycle.

**Key takeaway:** Pin to the intermediate certificate for stability across leaf rotations. Always include a backup pin. Without one, certificate rotation can permanently break networking for users who haven't updated.

---

### Lesson 4.4: Secure API Communication

Once TLS and certificate pinning protect the transport layer, you need to secure the API communication itself. Transport encryption prevents eavesdropping, but it doesn't protect against token replay attacks, logging leaks, or response manipulation by a compromised server-side component. Secure API communication means protecting authentication tokens from theft, validating responses before trusting them, preventing timing-based attacks, and ensuring that sensitive data never appears in logs.

The most critical API security pattern is **secure authentication header management**. Every authenticated API request includes a bearer token in the `Authorization` header. This token is the key to the user's account — if it's leaked through logging, crash reports, or interceptor chains, an attacker can impersonate the user. OkHttp interceptors are the standard way to attach auth headers, but they must be implemented carefully. The interceptor should read the token from secure storage (EncryptedSharedPreferences or KeyStore), attach it to the request, and handle token expiry transparently with retry logic.

```kotlin
// SECURE: Auth interceptor with token refresh and retry logic
class SecureAuthInterceptor(
    private val tokenManager: TokenManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenManager.getAccessToken()
            ?: throw IOException("No auth token available — user must re-authenticate")

        val request = chain.request().newBuilder()
            .header("Authorization", "Bearer $token")
            .header("X-Request-ID", UUID.randomUUID().toString())
            .build()

        val response = chain.proceed(request)

        // Handle token expiry — refresh and retry once
        if (response.code == 401) {
            response.close() // Close the failed response

            val newToken = tokenManager.refreshToken()
                ?: throw IOException("Token refresh failed — user must re-authenticate")

            val retryRequest = chain.request().newBuilder()
                .header("Authorization", "Bearer $newToken")
                .header("X-Request-ID", UUID.randomUUID().toString())
                .build()

            return chain.proceed(retryRequest)
        }

        return response
    }
}
```

**Token replay attacks** occur when an attacker captures a valid token (from logs, network interception, or a compromised server) and reuses it to impersonate the user. Short-lived access tokens (15-60 minutes) limit the window of opportunity, but don't eliminate the risk. Additional protections include: (1) binding tokens to a specific device ID so they can't be used on another device, (2) including a timestamp or nonce in each request so replayed requests are detected, (3) using mutual TLS (mTLS) where the client also presents a certificate, proving its identity. For most apps, short-lived tokens combined with certificate pinning provide adequate protection. For high-security apps (banking, healthcare), consider adding request signing where each request includes an HMAC computed from the request body, timestamp, and a shared secret.

Logging is one of the most dangerous sources of credential leaks. In production apps, HTTP interceptors, crash reporters, and analytics SDKs can all capture and transmit request headers, which include auth tokens. A single log line like `D/OkHttp: Authorization: Bearer eyJhbGci...` in a crash report sent to a third-party service gives the attacker everything they need. The secure pattern is to use a logging interceptor that explicitly redacts sensitive headers, and to disable all network logging in release builds.

```kotlin
// SECURE: Logging interceptor that redacts sensitive data
class SecureLoggingInterceptor : Interceptor {
    private val sensitiveHeaders = setOf(
        "Authorization", "Cookie", "Set-Cookie",
        "X-Api-Key", "X-Auth-Token", "Proxy-Authorization"
    )

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        if (BuildConfig.DEBUG) {
            val logBuilder = StringBuilder()
            logBuilder.appendLine("--> ${request.method} ${request.url}")

            request.headers.forEach { (name, value) ->
                if (name in sensitiveHeaders) {
                    logBuilder.appendLine("$name: [REDACTED]")
                } else {
                    logBuilder.appendLine("$name: $value")
                }
            }

            Log.d("HTTP", logBuilder.toString())
        }
        // In release builds, log NOTHING about network requests

        val response = chain.proceed(request)

        if (BuildConfig.DEBUG) {
            Log.d("HTTP", "<-- ${response.code} ${request.url}")
        }

        return response
    }
}
```

**Response validation** is an often-overlooked security practice. Most apps trust the server's response implicitly — they deserialize the JSON and use the data directly. But if an attacker has partially compromised the server (or is performing a man-in-the-middle attack despite your best efforts), they can inject malicious data into responses. Basic response validation includes: (1) checking the HTTP status code before parsing, (2) validating the `Content-Type` header matches expectations, (3) checking response body size limits (to prevent DoS via enormous responses), and (4) validating critical data fields against expected formats.

```kotlin
// Response validation interceptor
class ResponseValidationInterceptor : Interceptor {
    private val maxResponseSize = 10 * 1024 * 1024L // 10 MB limit

    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())

        // Validate Content-Type for JSON API responses
        val contentType = response.header("Content-Type") ?: ""
        if (chain.request().url.host == "api.example.com") {
            if (!contentType.contains("application/json")) {
                response.close()
                throw IOException(
                    "Unexpected Content-Type: $contentType (expected application/json)"
                )
            }
        }

        // Validate response size to prevent memory exhaustion attacks
        val contentLength = response.header("Content-Length")?.toLongOrNull()
        if (contentLength != null && contentLength > maxResponseSize) {
            response.close()
            throw IOException(
                "Response too large: $contentLength bytes (max: $maxResponseSize)"
            )
        }

        return response
    }
}
```

**Timing attacks** are a subtle class of vulnerability where an attacker measures the time it takes for the server to respond to different inputs and uses the timing differences to infer information. For example, if your login endpoint takes 50ms for "user not found" but 200ms for "wrong password" (because it only runs the password hash when the user exists), an attacker can enumerate valid usernames. While timing attacks are primarily a server-side concern, the client can help by not leaking timing information to the user — show the same error message and the same UI delay regardless of the failure reason.

#### Common Mistakes

**Logging auth tokens in interceptors** is the most dangerous and most common API security mistake. Use a redacting interceptor and disable all network logging in release builds. **Not handling 401 responses with automatic retry** forces users to re-authenticate manually when their token expires, creating a poor UX. Use an interceptor that refreshes the token and retries transparently. **Not including a `X-Request-ID` header** makes it impossible to correlate client requests with server logs for debugging and security monitoring. **Trusting server responses implicitly** without validating status codes, content types, and data formats can lead to crashes or data corruption from malformed responses.

**Key takeaway:** Never log auth tokens, cookies, or API keys. Handle token expiry transparently with retry logic. Disable all network logging in release builds — one leaked token in a crash report can compromise a user's account.

---

### Lesson 4.5: WebView Security

WebViews embed web content inside native Android apps. They're used for everything from displaying terms of service to rendering complex UI from a CMS to integrating third-party payment forms. The security problem is that a WebView is essentially a browser running inside your app, with access to your app's context, permissions, and potentially native functionality. A WebView vulnerability can allow an attacker to execute arbitrary JavaScript in your app's context, steal auth tokens, access native device features, or exfiltrate local files. WebView security incidents have affected major apps including WhatsApp, Facebook, and multiple banking apps.

**JavaScript injection** is the primary WebView attack vector. If your WebView loads content from a URL that can be influenced by an attacker (a deep link, a redirect, or user-generated content), the attacker can inject JavaScript that executes in the WebView's context. If JavaScript is enabled (which it is in most WebViews), this script can read cookies, manipulate the DOM, and — most dangerously — call any native methods exposed through `addJavascriptInterface`. Disabling JavaScript eliminates this entire attack class. For WebViews that display static content (help pages, terms of service, privacy policies), JavaScript should always be disabled.

```kotlin
// VULNERABLE: WebView with excessive permissions
fun setupInsecureWebView(webView: WebView) {
    webView.settings.apply {
        javaScriptEnabled = true  // Enables script injection
        allowFileAccess = true    // Can read local files!
        allowContentAccess = true // Can access Content Providers!
        allowFileAccessFromFileURLs = true  // file:// can read other files
        allowUniversalAccessFromFileURLs = true // file:// can access HTTP
        domStorageEnabled = true
        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW // HTTP in HTTPS
    }

    // CRITICALLY VULNERABLE: Exposes native method to JavaScript
    // Any injected script can call NativeBridge.getAuthToken()
    webView.addJavascriptInterface(object {
        @JavascriptInterface
        fun getAuthToken(): String = tokenManager.getAccessToken() ?: ""

        @JavascriptInterface
        fun getUserData(): String = userRepo.getCurrentUser().toJson()
    }, "NativeBridge")

    // Loads any URL — including attacker-controlled redirects
    webView.loadUrl(intentUrl) // Could be: javascript:NativeBridge.getAuthToken()
}
```

The `addJavascriptInterface` method is one of the most dangerous APIs in Android. It exposes a Java/Kotlin object to JavaScript running in the WebView. Any JavaScript code — including injected malicious code — can call the methods on this object. Before API 17, `addJavascriptInterface` allowed JavaScript to call ANY public method on the object (and its superclasses), including `getClass()`, which enabled arbitrary code execution via reflection: `object.getClass().forName("java.lang.Runtime").getMethod("exec", "ls")`. API 17 introduced the `@JavascriptInterface` annotation requirement, limiting exposure to explicitly annotated methods. But even with this restriction, exposing auth tokens, user data, or native device functionality to JavaScript is dangerous. If you must use `addJavascriptInterface`, expose the absolute minimum functionality and validate all inputs.

```kotlin
// SECURE: Locked-down WebView configuration
class SecureWebViewSetup {
    fun configure(webView: WebView, allowedHost: String) {
        webView.settings.apply {
            // Disable JavaScript unless absolutely necessary
            javaScriptEnabled = false

            // Block all file access — prevents local file exfiltration
            allowFileAccess = false
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false

            // Block mixed content (HTTP resources on HTTPS pages)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

            // Disable unnecessary features
            databaseEnabled = false
            saveFormData = false
            setSupportZoom(false)
            cacheMode = WebSettings.LOAD_NO_CACHE
        }

        // NEVER add JavaScript interfaces unless absolutely required
        // webView.addJavascriptInterface(...) — avoid this

        // Restrict navigation to allowed domains only
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return true
                // Only allow HTTPS to the expected host
                if (url.scheme != "https" || url.host != allowedHost) {
                    Log.w("WebView", "Blocked navigation to: $url")
                    return true // Block the navigation
                }
                return false // Allow navigation
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                // NEVER call handler.proceed() — always cancel on SSL errors
                handler?.cancel()
                Log.e("WebView", "SSL error: ${error?.primaryError}")
            }
        }
    }

    // If JavaScript IS needed, use this minimal configuration
    fun configureWithJavaScript(webView: WebView, allowedHost: String) {
        configure(webView, allowedHost)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        // Use postWebMessage instead of addJavascriptInterface (API 23+)
        // This is safer because messages are string-based, not object-based
    }
}
```

**File URL attacks** exploit WebViews that allow `file://` access. If `allowFileAccess` is true (which it is by default before API 30), JavaScript in the WebView can read files from the app's internal storage using `file:///data/data/com.example.app/shared_prefs/secrets.xml`. Combined with `allowFileAccessFromFileURLs` or `allowUniversalAccessFromFileURLs`, an attacker can exfiltrate local files to a remote server. The attack chain is: (1) inject JavaScript via a malicious URL or content injection, (2) JavaScript reads local files via `file://` XMLHttpRequest, (3) JavaScript sends the file contents to the attacker's server. The defense is simple: set `allowFileAccess = false`, `allowFileAccessFromFileURLs = false`, and `allowUniversalAccessFromFileURLs = false`.

**Mixed content** occurs when an HTTPS page loads resources (images, scripts, stylesheets) over HTTP. An attacker can modify these HTTP resources in transit, injecting malicious JavaScript or replacing images with phishing content. Android WebView provides three mixed content modes: `MIXED_CONTENT_NEVER_ALLOW` (blocks all HTTP resources on HTTPS pages — safest), `MIXED_CONTENT_COMPATIBILITY_MODE` (allows some HTTP resources — risky), and `MIXED_CONTENT_ALWAYS_ALLOW` (allows all HTTP resources — dangerous). Always use `MIXED_CONTENT_NEVER_ALLOW` unless you have a specific, well-understood reason to allow mixed content.

A real-world WebView exploit pattern involves **deep link hijacking**. If your app opens WebViews from deep links (`myapp://webview?url=https://...`), an attacker can craft a deep link pointing to a malicious URL: `myapp://webview?url=https://evil.com/phishing.html`. If the WebView doesn't validate the URL against an allowlist, it loads the attacker's page, which can mimic your app's UI for phishing, or exploit JavaScript interface methods if they're exposed. Always validate deep link URLs against a strict allowlist of permitted domains.

```kotlin
// SECURE: Deep link URL validation for WebView
class WebViewActivity : AppCompatActivity() {
    private val allowedDomains = setOf(
        "help.example.com",
        "support.example.com",
        "docs.example.com"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = WebView(this)
        setContentView(webView)

        val url = intent?.data?.getQueryParameter("url")
        if (url != null) {
            val uri = Uri.parse(url)
            if (uri.scheme == "https" && uri.host in allowedDomains) {
                SecureWebViewSetup().configure(webView, uri.host!!)
                webView.loadUrl(url)
            } else {
                Log.e("Security", "Blocked unauthorized WebView URL: $url")
                finish() // Don't load untrusted URLs
            }
        }
    }
}
```

#### Common Mistakes

**Enabling JavaScript by default** exposes the WebView to script injection. Only enable it when the loaded content specifically requires it. **Using `addJavascriptInterface` to expose auth tokens or user data** gives any injected script full access to sensitive data. Use `postWebMessage` (API 23+) for safer communication. **Calling `handler.proceed()` in `onReceivedSslError`** tells the WebView to ignore SSL certificate errors — this completely disables TLS verification for the WebView, enabling man-in-the-middle attacks. Always call `handler.cancel()`. **Loading URLs from deep links without validation** enables phishing and script injection attacks.

**Key takeaway:** Disable JavaScript in WebViews unless absolutely necessary. Never expose sensitive native functions via `addJavascriptInterface`. Block mixed content and file access to prevent content injection and local file exfiltration.

---

### Lesson 4.6: Secure WebSocket and Real-Time Communication

WebSocket connections provide full-duplex communication between your app and a server, ideal for chat apps, live feeds, notifications, and collaborative features. Unlike REST APIs where each request is independent, WebSocket connections are persistent — a single connection stays open for minutes, hours, or even days. This persistence creates unique security challenges: the initial authentication token might expire while the connection is open, the long-lived connection is a sustained target for interception, and incoming messages from the server need validation because they arrive asynchronously without the request-response structure of REST.

The first and most critical rule is **always use `wss://` (WebSocket Secure) instead of `ws://`**. The `ws://` protocol transmits data in plaintext, exactly like HTTP. An attacker on the same network can read every message in both directions. `wss://` adds TLS encryption, equivalent to HTTPS for WebSocket traffic. On Android 9+, if your Network Security Configuration blocks cleartext traffic, `ws://` connections will also be blocked. However, some WebSocket libraries don't respect NSC by default — verify that your library of choice (OkHttp, Ktor, Java-WebSocket) enforces TLS.

```kotlin
// VULNERABLE: Unencrypted WebSocket connection
val insecureRequest = Request.Builder()
    .url("ws://api.example.com/socket")  // Plaintext! Attacker can read everything
    .build()

// SECURE: Encrypted WebSocket with authentication
class SecureWebSocketManager(
    private val client: OkHttpClient,
    private val tokenManager: TokenManager
) {
    private var webSocket: WebSocket? = null
    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 5
    private val messageValidator = MessageValidator()

    fun connect() {
        val token = tokenManager.getAccessToken()
            ?: throw IllegalStateException("No auth token available")

        val request = Request.Builder()
            .url("wss://api.example.com/socket") // Always use wss://
            .header("Authorization", "Bearer $token")
            .header("X-Client-Version", BuildConfig.VERSION_NAME)
            .build()

        webSocket = client.newWebSocket(request, createListener())
        reconnectAttempts = 0
    }

    private fun createListener(): WebSocketListener {
        return object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("WebSocket", "Connected securely")
                reconnectAttempts = 0
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                // CRITICAL: Validate every incoming message
                if (!messageValidator.isValid(text)) {
                    Log.w("WebSocket", "Invalid message rejected")
                    return
                }
                handleValidMessage(text)
            }

            override fun onFailure(
                webSocket: WebSocket, t: Throwable, response: Response?
            ) {
                when {
                    response?.code == 401 -> handleAuthExpiry()
                    response?.code == 403 -> {
                        Log.e("WebSocket", "Access forbidden — not reconnecting")
                    }
                    else -> attemptReconnect()
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                if (code != 1000) attemptReconnect()
            }
        }
    }

    private fun handleAuthExpiry() {
        val newToken = tokenManager.refreshToken()
        if (newToken != null) {
            disconnect()
            connect() // Reconnect with new token
        } else {
            Log.e("WebSocket", "Token refresh failed — user must re-authenticate")
        }
    }

    private fun attemptReconnect() {
        if (reconnectAttempts >= maxReconnectAttempts) {
            Log.e("WebSocket", "Max reconnect attempts reached")
            return
        }
        reconnectAttempts++
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        val delay = (1000L * (1 shl (reconnectAttempts - 1)))
            .coerceAtMost(30000L) // Cap at 30 seconds
        Handler(Looper.getMainLooper()).postDelayed({ connect() }, delay)
    }

    fun sendMessage(message: String) {
        webSocket?.send(message) ?: throw IllegalStateException("WebSocket not connected")
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
    }
}
```

**Token refresh on persistent connections** is a challenge unique to WebSockets. With REST APIs, each request is independent — you can attach a fresh token to each request. With WebSockets, the auth token is sent during the initial handshake, and the connection stays open long after that token might expire. There are two approaches: (1) the server sends a 401-equivalent close frame when the token expires, and the client reconnects with a fresh token (shown above), or (2) the client sends a "refresh" message over the existing connection, and the server validates the refresh token and extends the session. Approach (1) is simpler and more common. The key is to handle 401 responses transparently — detect the auth failure, refresh the token, and reconnect without user intervention.

**Message validation** is critical for WebSocket security. Unlike REST APIs where the response schema is defined by the endpoint, WebSocket messages arrive as raw text or binary frames with no inherent schema. A compromised server or a man-in-the-middle attacker (if somehow past your TLS/pinning) could send malformed messages designed to crash the client, inject malicious data, or overflow buffers. Every incoming message should be validated: (1) parse it as JSON (or your chosen format) and handle parse failures gracefully, (2) validate that required fields exist and have expected types, (3) validate that field values are within expected ranges, (4) reject messages that don't match any known message type.

```kotlin
// Message validation for WebSocket messages
class MessageValidator {
    private val knownTypes = setOf(
        "chat_message", "typing_indicator", "presence_update",
        "system_notification", "error"
    )

    fun isValid(rawMessage: String): Boolean {
        return try {
            val json = JSONObject(rawMessage)

            // Must have a message type
            val type = json.optString("type", "")
            if (type !in knownTypes) {
                Log.w("Validation", "Unknown message type: $type")
                return false
            }

            // Validate message size (prevent memory exhaustion)
            if (rawMessage.length > 64 * 1024) { // 64 KB max
                Log.w("Validation", "Message too large: ${rawMessage.length} bytes")
                return false
            }

            // Type-specific validation
            when (type) {
                "chat_message" -> {
                    json.has("content") && json.has("sender_id") &&
                        json.getString("content").length <= 4096
                }
                "typing_indicator" -> json.has("user_id")
                "presence_update" -> {
                    json.has("user_id") && json.has("status") &&
                        json.getString("status") in listOf("online", "offline", "away")
                }
                else -> true
            }
        } catch (e: JSONException) {
            Log.w("Validation", "Malformed message: ${e.message}")
            false
        }
    }
}
```

**Reconnection strategies** must balance reliability with security. When a WebSocket connection drops, the client should reconnect automatically — but with limits. Exponential backoff (doubling the delay between attempts) prevents overwhelming the server during outages. A maximum retry count prevents infinite reconnection attempts when the server is permanently unreachable. Jitter (adding a random delay) prevents a "thundering herd" when thousands of clients reconnect simultaneously after a server restart. Most importantly, every reconnection attempt should use a fresh auth token — don't cache the initial token and reuse it for reconnections, because it may have expired.

The reconnection logic should also distinguish between different failure types. A network error (the connection dropped) should trigger reconnection with exponential backoff. A 401 (authentication expired) should trigger a token refresh followed by reconnection. A 403 (access forbidden) or 4xx error should NOT trigger reconnection — the server is explicitly rejecting the client, and reconnecting will just produce the same rejection. A 1000 close code (normal closure) means the server intentionally closed the connection and should be respected. A 1008 close code (policy violation) usually means the client violated a protocol rule and should be investigated, not blindly retried.

#### Common Mistakes

**Using `ws://` instead of `wss://`** transmits all WebSocket traffic in plaintext. Always use `wss://`. **Not refreshing tokens on persistent connections** means users get disconnected when their access token expires, with no automatic recovery. Handle 401 responses with transparent token refresh and reconnection. **Not validating incoming messages** trusts the server (or attacker) to always send well-formed data. Validate every message before processing. **Reconnecting indefinitely without backoff** can DDoS your own server when it comes back online. Use exponential backoff with jitter and a maximum retry count.

**Key takeaway:** Always use `wss://` for WebSocket connections. Validate incoming messages. Handle 401 responses with transparent re-authentication, just like REST APIs.

---

### Quiz: Network Security

#### What happens when certificate pinning fails in OkHttp?

- \u274c The request falls back to standard TLS verification
- \u274c The request is retried with a different certificate
- \u2705 The connection is refused with an SSLPeerUnverifiedException
- \u274c The certificate is added to a temporary trust store

> **Explanation:** When OkHttp\u2019s CertificatePinner finds that none of the certificates in the server\u2019s chain match any pinned hash, it throws `SSLPeerUnverifiedException` and the connection is refused. There is no fallback to unpinned verification \u2014 this is by design, because falling back would defeat the purpose of pinning. The app should catch this exception and show an appropriate error message, never silently downgrade to an unpinned connection.

#### Why should the `<pin-set>` expiration date be set in Network Security Configuration?

- \u274c To automatically rotate certificates on the server
- \u274c To reduce the size of the APK
- \u2705 To prevent permanent networking failures if pins become invalid before an app update is released
- \u274c To comply with Google Play Store requirements

> **Explanation:** The pin-set expiration is a safety valve. If your server\u2019s certificate changes unexpectedly (revocation, CA compromise, operational rotation) and users haven\u2019t updated to an app version with the new pins, the expiration date ensures that pinning is disabled after that date rather than permanently blocking all network access. Set it to 3-6 months out and refresh with each release.

#### What is the primary security risk of `addJavascriptInterface` in WebViews?

- \u274c It slows down JavaScript execution
- \u274c It increases the APK size
- \u2705 Injected JavaScript can call exposed native methods, potentially leaking sensitive data or executing privileged operations
- \u274c It requires the INTERNET permission

> **Explanation:** `addJavascriptInterface` exposes native Kotlin/Java methods to any JavaScript running in the WebView. If an attacker injects JavaScript (via XSS, malicious redirects, or content injection), that script can call your native methods \u2014 potentially stealing auth tokens, reading user data, or triggering privileged operations. Before API 17, it was even worse: JavaScript could use reflection to execute arbitrary code via the exposed object\u2019s `getClass()` method.

#### Why should you always use `wss://` instead of `ws://` for WebSocket connections?

- \u274c `wss://` is faster than `ws://`
- \u274c `ws://` is deprecated on Android 10+
- \u2705 `ws://` transmits data in plaintext, allowing any network observer to read and modify messages
- \u274c `wss://` automatically handles message compression

> **Explanation:** `ws://` is the WebSocket equivalent of HTTP \u2014 it provides no encryption, and all messages are transmitted in plaintext. An attacker on the same network (Wi-Fi, ISP, or any intermediate router) can read every message in both directions, including auth tokens sent during the handshake. `wss://` adds TLS encryption, equivalent to HTTPS, ensuring that messages are encrypted in transit and the server\u2019s identity is verified.

### Coding Challenge: Secure OkHttp Client Builder

Build a `SecureClientFactory` that creates an OkHttp client with certificate pinning, auth token injection, token refresh on 401, secure logging (with header redaction), response size validation, and configurable timeouts. The factory should accept a `TokenProvider` interface for authentication.

#### Solution

```kotlin
interface TokenProvider {
    fun getAccessToken(): String?
    fun refreshAccessToken(): String?
}

class SecureClientFactory(
    private val tokenProvider: TokenProvider,
    private val pinConfig: PinConfiguration
) {
    data class PinConfiguration(
        val hostname: String,
        val primaryPin: String,
        val backupPin: String
    )

    fun create(): OkHttpClient {
        return OkHttpClient.Builder()
            .certificatePinner(buildPinner())
            .addInterceptor(authInterceptor())
            .addInterceptor(responseValidationInterceptor())
            .addInterceptor(secureLoggingInterceptor())
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private fun buildPinner(): CertificatePinner {
        return CertificatePinner.Builder()
            .add(pinConfig.hostname, "sha256/${pinConfig.primaryPin}")
            .add(pinConfig.hostname, "sha256/${pinConfig.backupPin}")
            .build()
    }

    private fun authInterceptor() = Interceptor { chain ->
        val token = tokenProvider.getAccessToken()
            ?: throw IOException("Authentication required")

        val request = chain.request().newBuilder()
            .header("Authorization", "Bearer $token")
            .header("X-Request-ID", UUID.randomUUID().toString())
            .build()

        val response = chain.proceed(request)

        if (response.code == 401) {
            response.close()
            val newToken = tokenProvider.refreshAccessToken()
                ?: throw IOException("Token refresh failed")

            val retry = chain.request().newBuilder()
                .header("Authorization", "Bearer $newToken")
                .header("X-Request-ID", UUID.randomUUID().toString())
                .build()

            chain.proceed(retry)
        } else {
            response
        }
    }

    private fun responseValidationInterceptor() = Interceptor { chain ->
        val response = chain.proceed(chain.request())
        val contentLength = response.header("Content-Length")?.toLongOrNull()
        val maxSize = 10 * 1024 * 1024L // 10MB

        if (contentLength != null && contentLength > maxSize) {
            response.close()
            throw IOException("Response exceeds size limit: $contentLength > $maxSize")
        }
        response
    }

    private fun secureLoggingInterceptor() = Interceptor { chain ->
        val request = chain.request()
        if (BuildConfig.DEBUG) {
            val safeHeaders = request.headers.toMultimap().map { (key, values) ->
                if (key.equals("Authorization", ignoreCase = true) ||
                    key.equals("Cookie", ignoreCase = true)
                ) {
                    "$key: [REDACTED]"
                } else {
                    "$key: ${values.joinToString()}"
                }
            }
            Log.d("HTTP", "--> ${request.method} ${request.url}")
            safeHeaders.forEach { Log.d("HTTP", it) }
        }

        val response = chain.proceed(request)

        if (BuildConfig.DEBUG) {
            Log.d("HTTP", "<-- ${response.code} ${request.url}")
        }

        response
    }
}
```

This factory encapsulates all network security concerns in a single, reusable configuration. The `CertificatePinner` pins to both a primary and backup certificate. The auth interceptor handles 401 responses with automatic token refresh and retry. The response validation interceptor enforces size limits. The logging interceptor redacts sensitive headers and only logs in debug builds. Each concern is isolated in its own interceptor, making the code testable and modifiable.

---

## Module 5: Authentication and Biometrics

Authentication is the gateway to your application. Every other security measure — encryption, secure storage, network protection — depends on correctly identifying who the user is and restricting access to their data. A weak authentication system undermines everything else: if an attacker can authenticate as your user, they inherit all the user's permissions and access every piece of encrypted data tied to that user's session. This module covers the complete authentication stack: from credential handling and token management, to biometric authentication with hardware-backed guarantees, to OAuth 2.0 and JWT best practices. The goal is not just to authenticate users, but to do so in a way that resists token theft, replay attacks, biometric bypass, and session hijacking.

### Lesson 5.1: Authentication Architecture

Authentication on mobile is fundamentally different from web authentication. On the web, the server manages the session via cookies, and the browser handles cookie storage and transmission automatically. On mobile, the app is responsible for the entire lifecycle: collecting credentials, exchanging them for tokens, storing tokens securely, attaching them to requests, refreshing expired tokens, and clearing everything on logout. Every step is an opportunity for a security failure. The most common failures are storing plaintext credentials on the device, leaking tokens through logs or crash reports, failing to clear tokens on logout, and using long-lived tokens without refresh logic.

The cardinal rule of mobile authentication is **never store raw credentials on the device**. The user's password, PIN, or any other raw credential should only exist in memory for the brief moment between the user entering it and the authentication API call completing. Once the server returns an access token and refresh token, the raw credential should be zeroed out of memory. Storing passwords in SharedPreferences, databases, or files — even encrypted ones — violates the principle of least privilege. If the device is compromised, the attacker gets a password that the user probably reuses on other services. If you store only tokens, the attacker gets access to your service only, and the tokens can be revoked server-side.

```kotlin
// VULNERABLE: Storing raw credentials on the device
class InsecureAuthManager(private val context: Context) {
    fun login(username: String, password: String) {
        // NEVER DO THIS — storing raw password on disk
        val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("username", username)
            .putString("password", password) // Raw password stored in plaintext XML!
            .apply()
    }

    fun autoLogin() {
        val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
        val username = prefs.getString("username", null)
        val password = prefs.getString("password", null) // Read from disk
        if (username != null && password != null) {
            performLogin(username, password) // Re-use stored credential
        }
    }

    private fun performLogin(username: String, password: String) { /* ... */ }
}
```

```kotlin
// SECURE: Token-based authentication — never store raw credentials
class AuthManager(
    private val api: AuthApi,
    private val tokenManager: TokenManager
) {
    sealed class AuthResult {
        data class Success(val userId: String) : AuthResult()
        data class RequiresMfa(val challengeId: String) : AuthResult()
        data class Failure(val error: String) : AuthResult()
        data object AccountLocked : AuthResult()
    }

    suspend fun login(username: String, password: String): AuthResult {
        return try {
            val response = api.authenticate(
                username = username,
                password = password,
                deviceId = getDeviceId()
            )

            when (response.code()) {
                200 -> {
                    val body = response.body()!!
                    tokenManager.saveTokens(
                        accessToken = body.accessToken,
                        refreshToken = body.refreshToken,
                        expiresInSeconds = body.expiresIn
                    )
                    // Password is NOT stored anywhere — only tokens are persisted
                    AuthResult.Success(body.userId)
                }
                401 -> AuthResult.Failure("Invalid credentials")
                403 -> AuthResult.AccountLocked
                429 -> AuthResult.Failure("Too many attempts — try later")
                else -> AuthResult.Failure("Authentication failed: ${response.code()}")
            }
        } catch (e: IOException) {
            AuthResult.Failure("Network error: ${e.message}")
        }
    }

    suspend fun logout() {
        try {
            // Attempt server-side token invalidation
            val token = tokenManager.getAccessToken()
            if (token != null) {
                api.revokeToken(token)
            }
        } catch (e: Exception) {
            // Server revocation failed — still clear local tokens
            Log.w("Auth", "Server-side revocation failed: ${e.message}")
        } finally {
            // ALWAYS clear local tokens, even if server revocation fails
            tokenManager.clearAllTokens()
        }
    }

    private fun getDeviceId(): String {
        // Use a unique, non-resettable device identifier for token binding
        return Settings.Secure.getString(
            tokenManager.context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
    }
}
```

The token-based authentication flow works as follows: (1) the user enters their credentials, (2) the app sends credentials to the authentication endpoint over HTTPS with certificate pinning, (3) the server validates credentials and returns an access token (short-lived, 15-60 minutes) and a refresh token (longer-lived, days to weeks), (4) the app stores both tokens in EncryptedSharedPreferences, (5) subsequent API calls use the access token in the `Authorization` header, (6) when the access token expires, the app uses the refresh token to obtain a new access token without requiring the user to re-enter credentials. This flow means raw credentials only exist during step 2 — they are never persisted on the device.

Android provides two primary APIs for credential management: **AccountManager** and **CredentialManager**. `AccountManager` is the legacy API that manages user accounts at the OS level — it provides a centralized store for auth tokens accessible by apps that hold the `USE_CREDENTIALS` permission. The problem with `AccountManager` is that tokens stored there are accessible to other apps (by design), it stores tokens in plaintext (they're protected by the OS's account framework, but not encrypted), and it's complex to implement correctly. **CredentialManager** (introduced in Android 14/Jetpack) is the modern replacement. It supports passkeys (FIDO2 credentials), passwords, and federated sign-in. It integrates with Google's autofill and password manager, provides a consistent UI, and handles credential storage securely. For new apps, always use CredentialManager.

**Rate limiting** is a server-side concern, but the client must handle it gracefully. If the server responds with HTTP 429 (Too Many Requests), the client should respect the `Retry-After` header and show an appropriate message to the user. Implementing client-side rate limiting (e.g., disabling the login button after 3 failed attempts) improves UX but is not a security control — it can be bypassed by an attacker who calls the API directly. Server-side rate limiting, account lockout policies, and CAPTCHA challenges are the real defenses against brute-force attacks.

```kotlin
// Client-side rate limiting for UX (NOT a security control)
class LoginRateLimiter {
    private var failedAttempts = 0
    private var lockoutUntil: Long = 0

    fun canAttemptLogin(): Boolean {
        if (System.currentTimeMillis() < lockoutUntil) return false
        return true
    }

    fun onLoginFailed() {
        failedAttempts++
        when {
            failedAttempts >= 5 -> {
                lockoutUntil = System.currentTimeMillis() + 300_000 // 5 minutes
            }
            failedAttempts >= 3 -> {
                lockoutUntil = System.currentTimeMillis() + 30_000 // 30 seconds
            }
        }
    }

    fun onLoginSuccess() {
        failedAttempts = 0
        lockoutUntil = 0
    }

    fun getRemainingLockoutSeconds(): Long {
        val remaining = lockoutUntil - System.currentTimeMillis()
        return if (remaining > 0) remaining / 1000 else 0
    }
}
```

Session management on Android includes handling app backgrounding. When the user switches away from your app, the session should remain active (don't force re-authentication every time the user checks a notification), but if the app has been in the background for an extended period (configurable, e.g., 15 minutes for a banking app), the user should be required to re-authenticate. This is typically implemented with biometric re-authentication rather than a full password re-entry. Store the timestamp when the app was backgrounded in memory (not on disk), and check it in `onResume()`.

#### Common Mistakes

**Storing raw passwords on the device** — even encrypted — violates the principle of least privilege. Store only tokens, which can be revoked server-side. **Not clearing tokens on logout** means the old tokens remain on the device. A compromised device or a forensic extraction can recover them. Always clear tokens from EncryptedSharedPreferences and zero out any in-memory copies. **Using long-lived access tokens without refresh logic** means that if a token is stolen, the attacker has access for weeks or months. Use short-lived access tokens (15-60 minutes) with refresh tokens. **Ignoring server-side revocation failures** during logout can leave tokens valid on the server. Attempt server-side revocation, but always clear local tokens regardless.

**Key takeaway:** Never store raw credentials on the device. Authenticate once, store short-lived tokens securely, and always clear tokens on logout — even if server-side invalidation fails.

---

### Lesson 5.2: Secure Token Management

Token management is the heart of mobile authentication. After the user logs in, every subsequent API call authenticates using tokens — not the user's password. Getting token management wrong is one of the most common and most damaging security failures in mobile apps. The most frequent mistakes are storing tokens in plaintext SharedPreferences (readable on rooted devices), using long-lived tokens without refresh logic (giving attackers extended access windows), and failing to handle token expiry gracefully (causing crashes or forcing re-authentication).

The two-token pattern (**access token** + **refresh token**) is the standard for mobile authentication. The **access token** is short-lived (15-60 minutes), included in every API request, and relatively low risk if stolen because it expires quickly. The **refresh token** is longer-lived (days to weeks), used only to obtain new access tokens, and high risk if stolen because it grants long-term access. The access token is like a day pass to a building — if someone steals it, they have access for a few hours. The refresh token is like a master key — if someone steals it, they can generate unlimited day passes until you change the lock (revoke the refresh token server-side).

```kotlin
// SECURE: Token manager with encrypted storage, expiry tracking, and rotation
class TokenManager(context: Context) {
    val context = context.applicationContext

    private val prefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            "auth_tokens",
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_TOKEN_EXPIRY = "token_expiry"
        private const val KEY_REFRESH_EXPIRY = "refresh_expiry"
        private const val EARLY_EXPIRY_BUFFER_MS = 30_000L // 30 seconds
    }

    fun saveTokens(
        accessToken: String,
        refreshToken: String,
        expiresInSeconds: Long
    ) {
        val expiryTime = System.currentTimeMillis() + (expiresInSeconds * 1000)
        val refreshExpiry = System.currentTimeMillis() + (30L * 24 * 60 * 60 * 1000) // 30 days

        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_TOKEN_EXPIRY, expiryTime)
            .putLong(KEY_REFRESH_EXPIRY, refreshExpiry)
            .apply()
    }

    fun getAccessToken(): String? {
        val expiry = prefs.getLong(KEY_TOKEN_EXPIRY, 0)
        val now = System.currentTimeMillis()

        // Return null if token is expired or within the early expiry buffer
        // The 30-second buffer prevents race conditions:
        // - App checks token validity: "valid for 10 more seconds"
        // - App starts network request (takes 5-15 seconds)
        // - By the time the request reaches the server, the token has expired
        // - The server returns 401, wasting the request
        // With the 30-second buffer, we proactively refresh before this can happen
        if (now >= expiry - EARLY_EXPIRY_BUFFER_MS) return null

        return prefs.getString(KEY_ACCESS_TOKEN, null)
    }

    fun refreshToken(): String? {
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null) ?: return null
        val refreshExpiry = prefs.getLong(KEY_REFRESH_EXPIRY, 0)

        // Check if refresh token itself has expired
        if (System.currentTimeMillis() >= refreshExpiry) {
            clearAllTokens()
            return null // User must re-authenticate
        }

        // Call the token refresh endpoint
        return try {
            val response = refreshTokenSync(refreshToken)
            if (response != null) {
                saveTokens(
                    accessToken = response.accessToken,
                    refreshToken = response.refreshToken, // Server may rotate refresh token
                    expiresInSeconds = response.expiresIn
                )
                response.accessToken
            } else {
                clearAllTokens()
                null
            }
        } catch (e: Exception) {
            null // Network error — don't clear tokens, retry later
        }
    }

    fun clearAllTokens() {
        prefs.edit().clear().apply()
    }

    fun isLoggedIn(): Boolean {
        return prefs.getString(KEY_REFRESH_TOKEN, null) != null &&
            System.currentTimeMillis() < prefs.getLong(KEY_REFRESH_EXPIRY, 0)
    }

    private fun refreshTokenSync(refreshToken: String): TokenResponse? {
        // Implementation: synchronous HTTP call to /auth/refresh
        // This should be called from a background thread
        return null // Placeholder
    }
}

data class TokenResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long
)
```

The **30-second early expiry buffer** deserves detailed explanation because it's a subtle but important detail. Consider this scenario without the buffer: your access token expires at 12:00:00. At 11:59:55 (5 seconds before expiry), the app checks the token — it's valid. The app starts a network request. The request takes 8 seconds (DNS resolution, TLS handshake, server processing). The request arrives at the server at 12:00:03 — 3 seconds after the token expired. The server returns 401. The user sees an error. With the 30-second buffer, the app treats the token as expired at 11:59:30. At 11:59:55, `getAccessToken()` returns null, triggering a proactive token refresh. The new token has a full 15-60 minute validity period. The race condition is eliminated.

**Token rotation** is a security practice where the server issues a new refresh token with each access token refresh. The old refresh token is immediately invalidated. This means that if an attacker steals a refresh token, it becomes useless as soon as the legitimate user refreshes their access token (which happens every 15-60 minutes). Without rotation, a stolen refresh token remains valid for its entire lifetime (potentially weeks). With rotation, the attacker and the legitimate user are in a race — whichever one uses the refresh token first invalidates it for the other. The server can detect this race (both parties present the same refresh token at different times) and revoke the entire token family as a precaution.

**JWT (JSON Web Token)** is the most common format for access tokens on mobile. A JWT consists of three parts separated by dots: a header (base64url-encoded JSON specifying the algorithm), a payload (base64url-encoded JSON containing claims like user ID, expiry, and roles), and a signature (computed over the header and payload using the server's private key). The client can decode the header and payload (they're just base64url-encoded, not encrypted) to read claims like `exp` (expiry timestamp), `sub` (subject/user ID), and custom claims. However, the client MUST NOT trust these claims for authorization — they're readable by anyone, and the client cannot verify the signature (it doesn't have the server's private key). The client should only use JWT claims for display purposes and local expiry checks.

```kotlin
// JWT structure inspection (NOT validation — that's the server's job)
fun inspectJwt(token: String): JwtClaims? {
    return try {
        val parts = token.split(".")
        if (parts.size != 3) return null

        // Decode the payload (middle part)
        val payload = String(
            Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING),
            Charsets.UTF_8
        )
        val json = JSONObject(payload)

        JwtClaims(
            subject = json.optString("sub"),
            expiration = json.optLong("exp") * 1000, // Convert to milliseconds
            issuedAt = json.optLong("iat") * 1000,
            issuer = json.optString("iss"),
            roles = json.optJSONArray("roles")?.let { array ->
                (0 until array.length()).map { array.getString(it) }
            } ?: emptyList()
        )
    } catch (e: Exception) {
        null // Malformed token
    }
}

data class JwtClaims(
    val subject: String,
    val expiration: Long,
    val issuedAt: Long,
    val issuer: String,
    val roles: List<String>
)
```

**Token binding** adds an additional layer of protection by tying a token to a specific device. The concept is simple: when the server issues a token, it includes the device's unique identifier (or a hash of it) as a claim in the token. When the token is used for an API request, the server verifies that the device ID in the request matches the device ID in the token. If an attacker steals the token and tries to use it from a different device, the server rejects it because the device IDs don't match. This doesn't prevent attacks from the same device, but it prevents token theft via network interception or server-side breaches from being used elsewhere.

#### Common Mistakes

**Storing tokens in plain SharedPreferences** is readable on rooted devices. Always use EncryptedSharedPreferences. **Not implementing early expiry** leads to race conditions where the token expires between the validity check and the server receiving the request. Use a 30-second buffer. **Not handling refresh token expiry** means the user experiences a sudden logout with no explanation. Check the refresh token's expiry and prompt for re-authentication before it expires. **Trusting JWT claims on the client for authorization decisions** is a critical mistake — the client can read JWT claims but cannot verify the signature. Authorization must happen on the server.

**Key takeaway:** Keep access tokens short-lived (15-60 minutes) and refresh tokens longer-lived. Expire tokens slightly before their actual expiry to avoid race conditions during network requests.

---

### Lesson 5.3: Biometric Authentication

Biometric authentication on Android uses fingerprints, face recognition, or iris scans to verify the user's identity. It provides a faster and more convenient authentication experience than passwords, and when implemented correctly with the BiometricPrompt API, it offers hardware-backed security guarantees. However, biometric authentication has significant complexity: different devices support different biometric types with different security levels, the hardware can be in various states (not enrolled, locked out, unavailable), and the implementation must gracefully handle all of these states. Getting biometric authentication right requires understanding the hardware capabilities, the Android biometric class system, and the correct API usage patterns.

Android classifies biometric hardware into three security classes. **Class 1 (Convenience)** biometrics have a spoof acceptance rate (SAR) of less than 20% — they're easy to fool and should only be used for convenience features (unlocking an app that doesn't contain sensitive data). An example is a low-resolution face unlock that can be fooled by a photo. **Class 2 (Weak)** biometrics have a SAR of less than 20% and must pass additional spoofing tests. They're suitable for app unlock but not for cryptographic operations. **Class 3 (Strong)** biometrics have a SAR of less than 7% and must be implemented in a secure execution environment (TEE or secure element). Only Class 3 biometrics can be used with `CryptoObject` for hardware-backed cryptographic operations. When your code specifies `BIOMETRIC_STRONG`, it requests Class 3 only. `BIOMETRIC_WEAK` includes both Class 2 and 3.

The `canAuthenticate()` check is the essential first step before showing any biometric UI. This method returns one of several constants: `BIOMETRIC_SUCCESS` (hardware is available and at least one biometric is enrolled), `BIOMETRIC_ERROR_NO_HARDWARE` (device has no biometric sensor), `BIOMETRIC_ERROR_HW_UNAVAILABLE` (sensor exists but is temporarily unavailable), `BIOMETRIC_ERROR_NONE_ENROLLED` (sensor exists but no biometrics are enrolled), or `BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED`. Each state requires different handling — you can't show a fingerprint prompt if there's no sensor, and you shouldn't prompt enrollment if the user is in the middle of a critical flow.

```kotlin
// SECURE: Complete biometric authentication implementation
class BiometricAuthManager(private val activity: FragmentActivity) {
    enum class BiometricStatus {
        AVAILABLE,
        NO_HARDWARE,
        HARDWARE_UNAVAILABLE,
        NONE_ENROLLED,
        SECURITY_UPDATE_REQUIRED
    }

    sealed class BiometricError {
        data object Lockout : BiometricError()
        data object LockoutPermanent : BiometricError()
        data object UserCanceled : BiometricError()
        data object NegativeButton : BiometricError()
        data class SystemError(val code: Int, val message: String) : BiometricError()
    }

    fun checkBiometricStatus(): BiometricStatus {
        val biometricManager = BiometricManager.from(activity)
        return when (biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricStatus.AVAILABLE
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> BiometricStatus.NO_HARDWARE
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                BiometricStatus.HARDWARE_UNAVAILABLE
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                BiometricStatus.NONE_ENROLLED
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ->
                BiometricStatus.SECURITY_UPDATE_REQUIRED
            else -> BiometricStatus.NO_HARDWARE
        }
    }

    fun authenticate(
        title: String = "Verify your identity",
        subtitle: String = "Use your fingerprint or face to continue",
        negativeButtonText: String = "Use password",
        onSuccess: (BiometricPrompt.AuthenticationResult) -> Unit,
        onError: (BiometricError) -> Unit
    ) {
        // Always check availability before showing prompt
        val status = checkBiometricStatus()
        if (status != BiometricStatus.AVAILABLE) {
            onError(BiometricError.SystemError(-1, "Biometric not available: $status"))
            return
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText(negativeButtonText)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
            .setConfirmationRequired(true) // Require explicit confirmation
            .build()

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(
                result: BiometricPrompt.AuthenticationResult
            ) {
                super.onAuthenticationSucceeded(result)
                onSuccess(result)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                val error = when (errorCode) {
                    BiometricPrompt.ERROR_LOCKOUT -> BiometricError.Lockout
                    BiometricPrompt.ERROR_LOCKOUT_PERMANENT ->
                        BiometricError.LockoutPermanent
                    BiometricPrompt.ERROR_USER_CANCELED -> BiometricError.UserCanceled
                    BiometricPrompt.ERROR_NEGATIVE_BUTTON -> BiometricError.NegativeButton
                    else -> BiometricError.SystemError(errorCode, errString.toString())
                }
                onError(error)
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                // Called on every failed attempt (wrong finger, etc.)
                // Don't dismiss the prompt — the system handles retry limits
            }
        }

        val biometricPrompt = BiometricPrompt(activity, callback)
        biometricPrompt.authenticate(promptInfo)
    }
}
```

**Lockout handling** is one of the most commonly misimplemented aspects of biometric authentication. Android enforces two lockout levels: **temporary lockout** (`ERROR_LOCKOUT`) occurs after 5 failed attempts within 30 seconds and lasts for 30 seconds. **Permanent lockout** (`ERROR_LOCKOUT_PERMANENT`) occurs after too many temporary lockouts and requires the user to unlock the device with their PIN/pattern/password before biometrics can be used again. Your app must handle both states gracefully. For temporary lockout, show a countdown timer and fall back to password authentication. For permanent lockout, guide the user to unlock their device with their primary credential and then retry. Don't just show a generic "Try again later" message — tell the user exactly what to do.

```kotlin
// Handling lockout states with fallback
class BiometricWithFallback(private val activity: FragmentActivity) {
    private val authManager = BiometricAuthManager(activity)

    fun authenticateWithFallback(
        onAuthenticated: () -> Unit,
        onFallbackToPassword: () -> Unit
    ) {
        authManager.authenticate(
            title = "Verify your identity",
            subtitle = "Use biometrics or tap below for password",
            negativeButtonText = "Use password instead",
            onSuccess = { onAuthenticated() },
            onError = { error ->
                when (error) {
                    is BiometricAuthManager.BiometricError.Lockout -> {
                        // Temporary lockout — show password option
                        showMessage("Too many attempts. Use your password instead.")
                        onFallbackToPassword()
                    }
                    is BiometricAuthManager.BiometricError.LockoutPermanent -> {
                        // Permanent lockout — must unlock device first
                        showMessage(
                            "Biometrics locked. Please unlock your device " +
                                "with your PIN/password, then try again."
                        )
                        onFallbackToPassword()
                    }
                    is BiometricAuthManager.BiometricError.NegativeButton -> {
                        // User chose password fallback
                        onFallbackToPassword()
                    }
                    is BiometricAuthManager.BiometricError.UserCanceled -> {
                        // User dismissed — don't force anything
                    }
                    is BiometricAuthManager.BiometricError.SystemError -> {
                        showMessage("Biometric error: ${error.message}")
                        onFallbackToPassword()
                    }
                }
            }
        )
    }

    private fun showMessage(msg: String) {
        // Show user-facing message via Snackbar or Dialog
    }
}
```

A frequently overlooked consideration is **enrollment detection**. When `canAuthenticate()` returns `BIOMETRIC_ERROR_NONE_ENROLLED`, the user has a biometric sensor but hasn't set up any biometrics. You can guide them to the enrollment screen using `Settings.ACTION_BIOMETRIC_ENROLL` (API 30+) or `Settings.ACTION_FINGERPRINT_ENROLL` (API 28+). However, don't make biometric enrollment a hard requirement for using your app — always provide an alternative authentication method (password, PIN). Some users choose not to use biometrics for privacy reasons, and forcing enrollment alienates them.

The fallback from biometrics to password should be seamless and always available. Biometric authentication is a convenience layer on top of traditional authentication — it should enhance the experience, not gatekeep it. If biometrics fail (lockout, hardware error, sensor damage), the user should be able to authenticate with their password without any additional friction. Never make biometrics the only authentication method.

#### Common Mistakes

**Not calling `canAuthenticate()` before showing the prompt** causes crashes or confusing errors on devices without biometric hardware. Always check first. **Using `BIOMETRIC_WEAK` for security-sensitive operations** accepts Class 2 biometrics that may be spoofable. Use `BIOMETRIC_STRONG` for anything involving cryptographic operations, payments, or sensitive data access. **Showing generic error messages for lockout** confuses users. Distinguish between temporary lockout (wait 30 seconds) and permanent lockout (unlock device with PIN) and provide specific guidance. **Not providing a password fallback** locks users out entirely when biometrics fail. Always offer an alternative.

**Key takeaway:** Always check `canAuthenticate()` before showing the prompt. Use `BIOMETRIC_STRONG` for security-sensitive operations. Handle lockout states gracefully — don't just show a generic error.

---

### Lesson 5.4: Biometric-Gated Cryptographic Operations

The previous lesson covered basic biometric authentication — confirming the user's identity. But basic biometric authentication only provides a boolean result: "the user is who they claim to be" (or not). An attacker using a runtime hooking tool like Frida can intercept the `onAuthenticationSucceeded` callback and trigger it without actually presenting a valid biometric. The `CryptoObject` pattern eliminates this bypass entirely by tying a cryptographic key to biometric authentication at the hardware level. Instead of checking whether the biometric succeeded and then performing a crypto operation, the crypto operation itself requires biometric authentication — the KeyStore key is literally unusable until the TEE verifies the biometric.

Here's how the `CryptoObject` pattern works at the hardware level: (1) you create a KeyStore key with `setUserAuthenticationRequired(true)`, which tells the TEE that this key can only be used after biometric authentication, (2) you initialize a `Cipher` with this key — this creates a `CryptoObject`, (3) you pass the `CryptoObject` to `biometricPrompt.authenticate(promptInfo, cryptoObject)`, (4) the BiometricPrompt shows the fingerprint/face UI, (5) when the user authenticates, the TEE unlocks the key and binds it to the authenticated `Cipher` instance, (6) you use the authenticated `Cipher` (from `result.cryptoObject?.cipher`) to encrypt or decrypt data. The critical insight is that the Cipher in step 6 is NOT the same object as step 2 — it has been authenticated by the TEE. Frida cannot bypass this because the key material is inside the TEE, and the TEE requires a genuine biometric match to unlock it.

```kotlin
// SECURE: Biometric-gated cryptographic operations
class BiometricCryptoManager(private val activity: FragmentActivity) {
    companion object {
        private const val KEY_ALIAS = "biometric_crypto_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }

    data class EncryptedData(
        val ciphertext: ByteArray,
        val iv: ByteArray
    )

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyGen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
            )
            keyGen.init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    // THIS IS THE CRITICAL SETTING:
                    // The key can only be used after biometric authentication
                    .setUserAuthenticationRequired(true)
                    // Key is valid for 0 seconds after auth — must be used immediately
                    // with the CryptoObject that was authenticated
                    .setUserAuthenticationParameters(
                        0, KeyProperties.AUTH_BIOMETRIC_STRONG
                    )
                    // Invalidate key if new biometric is enrolled
                    // Prevents an attacker from adding their fingerprint
                    .setInvalidatedByBiometricEnrollment(true)
                    .build()
            )
            keyGen.generateKey()
        }

        return (keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
    }

    fun encryptWithBiometric(
        plaintext: String,
        onSuccess: (EncryptedData) -> Unit,
        onError: (String) -> Unit
    ) {
        try {
            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val cryptoObject = BiometricPrompt.CryptoObject(cipher)

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Encrypt sensitive data")
                .setSubtitle("Authenticate to protect this data")
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG
                )
                .build()

            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    // Use the AUTHENTICATED cipher from the result
                    // This cipher has been unlocked by the TEE
                    val authenticatedCipher = result.cryptoObject?.cipher
                        ?: run {
                            onError("CryptoObject missing from result")
                            return
                        }

                    val encrypted = authenticatedCipher.doFinal(
                        plaintext.toByteArray(Charsets.UTF_8)
                    )
                    onSuccess(EncryptedData(encrypted, authenticatedCipher.iv))
                }

                override fun onAuthenticationError(
                    errorCode: Int, errString: CharSequence
                ) {
                    onError("Biometric error: $errString")
                }
            }

            BiometricPrompt(activity, callback).authenticate(promptInfo, cryptoObject)
        } catch (e: KeyPermanentlyInvalidatedException) {
            // Key was invalidated because a new biometric was enrolled
            // Delete the key and inform the user
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            keyStore.deleteEntry(KEY_ALIAS)
            onError("Security key invalidated — new biometric detected. Please re-enroll.")
        } catch (e: Exception) {
            onError("Encryption setup failed: ${e.message}")
        }
    }

    fun decryptWithBiometric(
        encryptedData: EncryptedData,
        onSuccess: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        try {
            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE, key,
                GCMParameterSpec(128, encryptedData.iv)
            )
            val cryptoObject = BiometricPrompt.CryptoObject(cipher)

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Decrypt sensitive data")
                .setSubtitle("Authenticate to access this data")
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG
                )
                .build()

            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    val authenticatedCipher = result.cryptoObject?.cipher
                        ?: run {
                            onError("CryptoObject missing from result")
                            return
                        }

                    val decrypted = authenticatedCipher.doFinal(encryptedData.ciphertext)
                    onSuccess(String(decrypted, Charsets.UTF_8))
                }

                override fun onAuthenticationError(
                    errorCode: Int, errString: CharSequence
                ) {
                    onError("Biometric error: $errString")
                }
            }

            BiometricPrompt(activity, callback).authenticate(promptInfo, cryptoObject)
        } catch (e: KeyPermanentlyInvalidatedException) {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            keyStore.deleteEntry(KEY_ALIAS)
            onError("Security key invalidated — data cannot be decrypted. Please re-enroll.")
        } catch (e: Exception) {
            onError("Decryption setup failed: ${e.message}")
        }
    }
}
```

The reason **Frida cannot bypass** the CryptoObject pattern is fundamental to how the Android KeyStore and TEE work. Frida is a dynamic instrumentation tool that hooks into running processes, modifies method behavior, and can intercept any Java/Kotlin method call. With basic biometric authentication (no CryptoObject), an attacker uses Frida to hook `onAuthenticationSucceeded`, calls it directly, and the app proceeds as if biometrics succeeded. But with CryptoObject, calling `onAuthenticationSucceeded` with a fake result is useless — the `result.cryptoObject?.cipher` returns null (or a Cipher that hasn't been unlocked by the TEE). When the app tries to use the unauthenticated Cipher for `doFinal()`, the TEE throws `UserNotAuthenticatedException`. The key material is inside secure hardware that Frida has no access to, and the TEE requires a genuine biometric match to unlock it. The only way to bypass this is to compromise the TEE itself, which requires a hardware-level attack far beyond Frida's capabilities.

The `setInvalidatedByBiometricEnrollment(true)` setting is a critical security control. Consider this attack scenario: an attacker gets temporary physical access to an unlocked device, goes to Settings > Security > Fingerprints, and enrolls their own fingerprint. Without invalidation, the attacker can now authenticate as the user because the biometric key accepts any enrolled fingerprint. With `setInvalidatedByBiometricEnrollment(true)`, the key is permanently invalidated the moment a new fingerprint is enrolled. The next time the app tries to use the key, it throws `KeyPermanentlyInvalidatedException`. The app detects this, deletes the key, and requires the user to re-enroll (using their password as a fallback). The attacker's fingerprint is useless because the key no longer exists.

The `setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)` call deserves explanation. The first parameter (0) means the key must be used immediately with the CryptoObject that was authenticated — it's not valid for any duration after authentication. This is the most restrictive setting and is required for per-operation authentication (each encrypt/decrypt requires its own biometric prompt). If you set it to, say, 60 (seconds), the key remains usable for 60 seconds after authentication without requiring another biometric prompt. This duration-based approach is useful for flows where multiple crypto operations happen in quick succession (e.g., decrypting multiple database fields), but it's less secure because a Frida attacker could use the key during the validity window.

```kotlin
// Duration-based authentication — key valid for 30 seconds after biometric
fun createDurationBasedKey(alias: String) {
    val keyGen = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
    )
    keyGen.init(
        KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            // Key usable for 30 seconds after any biometric or device credential auth
            .setUserAuthenticationParameters(
                30, // seconds
                KeyProperties.AUTH_BIOMETRIC_STRONG or
                    KeyProperties.AUTH_DEVICE_CREDENTIAL
            )
            .setInvalidatedByBiometricEnrollment(true)
            .build()
    )
    keyGen.generateKey()
}

// With duration-based keys, you don't need CryptoObject
// The key is usable for 30 seconds after the system-level auth
fun useDurationBasedKey(alias: String, plaintext: String): ByteArray {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val key = (keyStore.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key) // Works if user authenticated within 30s
    return cipher.doFinal(plaintext.toByteArray())
    // Throws UserNotAuthenticatedException if 30 seconds have elapsed
}
```

#### Common Mistakes

**Using biometric authentication without CryptoObject for security-sensitive operations** provides no hardware-backed guarantee. Frida can bypass the callback. Always use CryptoObject for payments, sensitive data access, and key derivation. **Not handling `KeyPermanentlyInvalidatedException`** causes crashes when a user enrolls a new fingerprint. Catch it, delete the invalidated key, and guide the user through re-enrollment. **Using `setUserAuthenticationParameters` with a long duration** for high-security operations (payments, password changes) weakens the per-operation guarantee. Use duration 0 for these operations. **Not calling `setInvalidatedByBiometricEnrollment(true)`** allows an attacker who enrolls their fingerprint to authenticate as the user.

**Key takeaway:** For high-security operations, use the CryptoObject pattern to tie KeyStore keys to biometric authentication. This is enforced by hardware and cannot be bypassed by Frida or runtime hooking.

---

### Lesson 5.5: OAuth 2.0 and JWT Best Practices

OAuth 2.0 is the standard protocol for authorization on mobile. It allows your app to authenticate users via a third-party identity provider (Google, Apple, GitHub) without ever seeing the user's password. The user authenticates directly with the identity provider, which returns an authorization code to your app. Your app exchanges this code for access and refresh tokens with the provider's token endpoint. This flow is critical because the user's password is never transmitted to or stored by your app — reducing the attack surface dramatically.

The **Authorization Code with PKCE** (Proof Key for Code Exchange, pronounced "pixy") flow is the only recommended OAuth 2.0 flow for mobile apps. The older **Implicit flow** (where the token is returned directly in the redirect URI) is deprecated for mobile because the token is exposed in the redirect URL, which can be intercepted by other apps registered for the same URI scheme. PKCE adds a challenge-response mechanism: (1) the app generates a random `code_verifier` (a 43-128 character string), (2) the app creates a `code_challenge` by SHA-256 hashing the verifier, (3) the authorization request includes the `code_challenge`, (4) after user authentication, the identity provider returns an authorization code, (5) the app exchanges the code AND the original `code_verifier` for tokens, (6) the server hashes the verifier and compares it to the challenge. This ensures that even if an attacker intercepts the authorization code, they can't exchange it for tokens without the original verifier.

```kotlin
// VULNERABLE: Implicit flow — token exposed in redirect URI
// DON'T DO THIS — deprecated for mobile
// Authorization URL: https://auth.example.com/authorize?
//   response_type=token  <-- Returns token directly in redirect
//   &client_id=mobile_app
//   &redirect_uri=myapp://callback
// Redirect: myapp://callback#access_token=eyJhbGci...
// ANY app registered for myapp:// can intercept this token!

// SECURE: Authorization Code with PKCE flow
class OAuthManager(private val context: Context) {
    private var codeVerifier: String? = null

    fun startAuthorization(): Uri {
        // Step 1: Generate code verifier (random 43-128 chars)
        val verifierBytes = ByteArray(32)
        SecureRandom().nextBytes(verifierBytes)
        codeVerifier = Base64.encodeToString(
            verifierBytes,
            Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
        )

        // Step 2: Create code challenge (SHA-256 of verifier)
        val challengeBytes = MessageDigest.getInstance("SHA-256")
            .digest(codeVerifier!!.toByteArray(Charsets.US_ASCII))
        val codeChallenge = Base64.encodeToString(
            challengeBytes,
            Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
        )

        // Step 3: Build authorization URL
        return Uri.Builder()
            .scheme("https")
            .authority("auth.example.com")
            .appendPath("authorize")
            .appendQueryParameter("response_type", "code") // NOT "token"
            .appendQueryParameter("client_id", "mobile_app_id")
            .appendQueryParameter("redirect_uri", "com.example.app://oauth/callback")
            .appendQueryParameter("scope", "openid profile email")
            .appendQueryParameter("code_challenge", codeChallenge)
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("state", UUID.randomUUID().toString()) // CSRF protection
            .build()
    }

    suspend fun handleCallback(callbackUri: Uri): TokenResponse? {
        val code = callbackUri.getQueryParameter("code") ?: return null
        val verifier = codeVerifier ?: return null
        codeVerifier = null // Use once only

        // Step 5: Exchange code + verifier for tokens
        return exchangeCodeForTokens(code, verifier)
    }

    private suspend fun exchangeCodeForTokens(
        code: String,
        verifier: String
    ): TokenResponse? {
        // POST to token endpoint with code and verifier
        val requestBody = FormBody.Builder()
            .add("grant_type", "authorization_code")
            .add("code", code)
            .add("redirect_uri", "com.example.app://oauth/callback")
            .add("client_id", "mobile_app_id")
            .add("code_verifier", verifier) // PKCE: proves we initiated the request
            .build()

        val request = Request.Builder()
            .url("https://auth.example.com/token")
            .post(requestBody)
            .build()

        // Execute and parse response
        return null // Implementation with OkHttp
    }
}
```

The **AppAuth library** (`net.openid:appauth`) is the recommended open-source library for implementing OAuth 2.0 on Android. It handles the entire PKCE flow, manages the Chrome Custom Tab (or external browser) for the authorization UI, handles redirect URI interception, and token exchange. Using AppAuth is strongly recommended over implementing OAuth 2.0 from scratch because the protocol has many subtle security requirements (state parameter for CSRF protection, PKCE verifier entropy requirements, token endpoint security) that are easy to get wrong. AppAuth has been security-audited and is maintained by the OpenID Foundation.

**Server-side JWT validation** is a critical concept that many mobile developers misunderstand. The client can read JWT claims (the payload is base64url-encoded, not encrypted), but the client CANNOT validate the JWT signature. The signature is computed using the server's private key, and the client doesn't have this key. This means the client MUST NOT make authorization decisions based on JWT claims — an attacker could craft a JWT with `"role": "admin"` and send it directly to the API. The server MUST validate the signature, check the `exp` claim, verify the `iss` (issuer) and `aud` (audience), and make all authorization decisions server-side.

```kotlin
// JWT inspection for CLIENT-SIDE use only (NOT authorization)
class JwtTokenInspector {
    data class TokenInfo(
        val userId: String,
        val email: String?,
        val expiresAt: Long,
        val isExpired: Boolean,
        val issuer: String
    )

    fun inspect(token: String): TokenInfo? {
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return null

            val payload = String(
                Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING),
                Charsets.UTF_8
            )
            val json = JSONObject(payload)

            val expiresAt = json.optLong("exp", 0) * 1000
            TokenInfo(
                userId = json.optString("sub", ""),
                email = json.optString("email", null),
                expiresAt = expiresAt,
                isExpired = System.currentTimeMillis() >= expiresAt,
                issuer = json.optString("iss", "")
            )
        } catch (e: Exception) {
            null
        }
    }

    // Client-side expiry check — the ONLY security decision
    // the client should make with JWT claims
    fun isTokenUsable(token: String): Boolean {
        val info = inspect(token) ?: return false
        // 30-second buffer for network latency
        return System.currentTimeMillis() < (info.expiresAt - 30_000)
    }

    // Display-only: show user info from token
    // NEVER use these claims for authorization
    fun getUserDisplayName(token: String): String? {
        val info = inspect(token) ?: return null
        return info.email ?: info.userId
    }
}
```

**Token refresh strategy** for OAuth 2.0 follows the same pattern as standard token management (Lesson 5.2), but with identity provider-specific considerations. Some providers (Google, Apple) issue refresh tokens that never expire but can be revoked. Others issue refresh tokens with a fixed expiry. The refresh token should be treated with the same security as a password — store it in EncryptedSharedPreferences, never log it, and clear it on logout. When refreshing, some providers rotate the refresh token with each use (returning a new refresh token alongside the new access token), while others reuse the same refresh token. Your code must handle both patterns by always storing whatever refresh token the server returns.

An important security consideration for mobile OAuth is the **redirect URI scheme**. The authorization server redirects back to your app using a custom URI scheme (e.g., `com.example.app://oauth/callback`). On Android, any app can register to handle any custom scheme — a malicious app could register the same scheme and intercept the authorization code. PKCE mitigates this because the attacker doesn't have the `code_verifier`, but using **Android App Links** (verified HTTPS deep links) as the redirect URI provides stronger protection. With App Links, the redirect URI is `https://example.com/oauth/callback`, and Android verifies that your app is authorized to handle this domain via the `assetlinks.json` file on your server.

#### Common Mistakes

**Using the Implicit flow instead of Authorization Code + PKCE** exposes the access token in the redirect URI. Always use PKCE. **Implementing OAuth 2.0 from scratch instead of using AppAuth** introduces subtle security bugs. Use the library. **Validating JWT claims on the client for authorization** (checking roles, permissions, or scopes) is a critical mistake — the client cannot verify the JWT signature, so an attacker can forge any claims. Authorization must happen on the server. **Not using `state` parameter for CSRF protection** in the authorization request allows an attacker to initiate an OAuth flow and have the victim complete it, linking the attacker's account. **Using custom URI schemes instead of App Links for redirect URIs** allows other apps to intercept the authorization code.

**Key takeaway:** Use OAuth 2.0 Authorization Code with PKCE for mobile apps. Never validate JWT claims on the client for authorization — that's the server's job. The client only inspects tokens for expiry checking and user display.

---

### Quiz: Authentication and Biometrics

#### Why can't Frida bypass biometric authentication that uses CryptoObject?

- \u274c Frida cannot hook into Android system processes
- \u274c BiometricPrompt detects and blocks Frida
- \u2705 The cryptographic key is locked inside the TEE and requires a genuine biometric match to unlock \u2014 Frida can hook the callback but cannot produce an authenticated CryptoObject
- \u274c Frida is blocked by Google Play Protect

> **Explanation:** Without CryptoObject, Frida can simply call `onAuthenticationSucceeded` with a fake result \u2014 the app checks a boolean and proceeds. With CryptoObject, the app needs an authenticated `Cipher` from `result.cryptoObject?.cipher`. This Cipher is backed by a KeyStore key that the TEE has locked until biometric verification succeeds. Frida operates in userspace and cannot interact with the TEE. Calling `cipher.doFinal()` with an unauthenticated Cipher throws `UserNotAuthenticatedException` \u2014 the TEE refuses the operation.

#### What is the purpose of PKCE in the OAuth 2.0 mobile flow?

- \u274c To encrypt the access token during transmission
- \u274c To validate the server\u2019s identity
- \u2705 To prove that the app exchanging the authorization code is the same app that initiated the flow, preventing code interception attacks
- \u274c To compress the authorization request for faster transmission

> **Explanation:** PKCE (Proof Key for Code Exchange) protects against authorization code interception. The app generates a random `code_verifier` and sends its SHA-256 hash (`code_challenge`) with the authorization request. When exchanging the code for tokens, the app sends the original `code_verifier`. The server hashes it and verifies it matches the original challenge. An attacker who intercepts the authorization code cannot exchange it because they don\u2019t have the `code_verifier` \u2014 it was never transmitted, only its hash was.

#### What happens when `setInvalidatedByBiometricEnrollment(true)` is set and a new fingerprint is enrolled?

- \u274c The key requires the new fingerprint for authentication
- \u274c The key is automatically re-created with the new biometric
- \u2705 The key is permanently invalidated \u2014 any attempt to use it throws KeyPermanentlyInvalidatedException
- \u274c The key remains valid but requires PIN confirmation

> **Explanation:** This setting protects against the "evil maid" attack where an attacker enrolls their fingerprint on a temporarily unlocked device. When `setInvalidatedByBiometricEnrollment(true)` is set and a new biometric is enrolled, the KeyStore permanently invalidates the key. Any attempt to use it \u2014 even with the original biometric \u2014 throws `KeyPermanentlyInvalidatedException`. The app must delete the key, create a new one, and require the user to re-enroll (typically by re-authenticating with their password first).

### Coding Challenge: Complete Auth Flow Manager

Build an `AuthFlowManager` that coordinates the complete authentication flow: initial login with username/password, secure token storage with EncryptedSharedPreferences, automatic token refresh, biometric re-authentication for sensitive operations using CryptoObject, and secure logout with token clearing. The manager should handle all error states gracefully.

#### Solution

```kotlin
class AuthFlowManager(
    private val context: Context,
    private val activity: FragmentActivity,
    private val api: AuthApi
) {
    private val tokenManager = TokenManager(context)
    private val biometricManager = BiometricAuthManager(activity)
    private val biometricCrypto = BiometricCryptoManager(activity)

    sealed class AuthState {
        data object NotAuthenticated : AuthState()
        data class Authenticated(val userId: String) : AuthState()
        data object RequiresBiometric : AuthState()
        data class Error(val message: String) : AuthState()
    }

    suspend fun login(username: String, password: String): AuthState {
        return try {
            val response = api.authenticate(username, password)
            when (response.code()) {
                200 -> {
                    val body = response.body()!!
                    tokenManager.saveTokens(
                        body.accessToken, body.refreshToken, body.expiresIn
                    )
                    AuthState.Authenticated(body.userId)
                }
                401 -> AuthState.Error("Invalid credentials")
                429 -> AuthState.Error("Too many attempts — please wait")
                else -> AuthState.Error("Login failed: ${response.code()}")
            }
        } catch (e: IOException) {
            AuthState.Error("Network error — check your connection")
        }
    }

    fun getAuthenticatedToken(): String? {
        return tokenManager.getAccessToken() ?: run {
            val refreshed = tokenManager.refreshToken()
            refreshed
        }
    }

    fun performSensitiveOperation(
        data: String,
        onComplete: (EncryptedData?) -> Unit
    ) {
        if (biometricManager.checkBiometricStatus() !=
            BiometricAuthManager.BiometricStatus.AVAILABLE
        ) {
            onComplete(null)
            return
        }

        biometricCrypto.encryptWithBiometric(
            plaintext = data,
            onSuccess = { encrypted -> onComplete(encrypted) },
            onError = { error ->
                Log.e("Auth", "Biometric operation failed: $error")
                onComplete(null)
            }
        )
    }

    suspend fun logout() {
        try {
            val token = tokenManager.getAccessToken()
            if (token != null) {
                api.revokeToken(token)
            }
        } catch (e: Exception) {
            // Server revocation failed — still clear locally
        } finally {
            tokenManager.clearAllTokens()
        }
    }

    fun isLoggedIn(): Boolean = tokenManager.isLoggedIn()
}

// Supporting interface
interface AuthApi {
    suspend fun authenticate(username: String, password: String): Response<AuthResponse>
    suspend fun revokeToken(token: String): Response<Unit>
}

data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long,
    val userId: String
)

data class EncryptedData(
    val ciphertext: ByteArray,
    val iv: ByteArray
)
```

This manager orchestrates the full authentication lifecycle. Login exchanges credentials for tokens (never storing the password). Token retrieval automatically attempts refresh if the access token is expired. Sensitive operations use biometric-gated CryptoObject encryption, which the TEE enforces at the hardware level. Logout attempts server-side revocation but always clears local tokens regardless of the server response. Every error state is handled explicitly with user-facing messages.

---

## Module 6: Code Protection

Shipping an Android app is fundamentally an act of handing your source code to the world. Unlike server-side applications where your code runs on infrastructure you control, an APK is a package that anyone can download, unzip, and analyze. Tools like jadx, apktool, and JADX-GUI can decompile most APKs back to near-original source code in seconds. Every hardcoded string, every API endpoint, every business logic decision — it's all there for anyone to read. Code protection isn't about achieving perfect secrecy (that's impossible with client-side code), it's about raising the cost of reverse engineering high enough that most attackers move on to easier targets.

### Lesson 6.1: Understanding Reverse Engineering Threats

When you build and sign an APK, the Kotlin or Java source code gets compiled to bytecode, packaged into DEX files, and bundled with your resources, manifest, and native libraries. This bytecode is not machine code — it's a high-level intermediate representation that preserves class names, method signatures, string constants, and control flow in a format that's trivially reversible. A decompiler like jadx can reconstruct readable source code from this bytecode, often producing output that's nearly identical to what you wrote. String constants survive compilation completely unchanged. If you wrote `val API_KEY = "sk_live_abc123"` in your source code, that exact string sits in the DEX file waiting to be found with a simple text search.

The decompilation process is straightforward and accessible to anyone. An attacker downloads your APK from the Play Store (or extracts it from a device using `adb pull`), renames it to `.zip`, extracts the contents, and runs jadx on the `classes.dex` files. Within seconds, they have a browsable project with your package structure, class names, and method implementations. Resources are decoded back to their original XML format, so your `AndroidManifest.xml`, layout files, and string resources are fully readable. The manifest alone reveals your activities, services, receivers, providers, permissions, and intent filters — a complete map of your app's attack surface.

Beyond static analysis, dynamic analysis tools like Frida allow attackers to hook into your running app and modify its behavior in real time. Frida injects a JavaScript engine into your app's process, giving the attacker the ability to intercept function calls, modify arguments and return values, read memory, and bypass any client-side check. If your license verification function returns a boolean, the attacker hooks it to always return `true`. If your root detection throws an exception, the attacker hooks it to do nothing. Frida scripts for common bypasses are shared openly on GitHub, making these attacks accessible to anyone who can follow a tutorial.

```kotlin
// ❌ VULNERABLE: Hardcoded secrets that survive decompilation
object ApiConfig {
    const val API_KEY = "sk_live_abc123def456"
    const val API_SECRET = "whsec_789xyz"
    const val ENCRYPTION_PASSWORD = "SuperSecretPassword123"
    const val DEBUG_ENDPOINT = "https://staging.internal.company.com/api"
}

// These strings are stored verbatim in the DEX file.
// Running `strings classes.dex | grep sk_live` finds them instantly.
```

```kotlin
// ✅ BETTER: Retrieve secrets from server at runtime
class SecureConfigProvider(
    private val api: ConfigApi,
    private val keyStore: SecureKeyStore
) {
    private var cachedConfig: AppConfig? = null

    suspend fun getApiKey(): String {
        val config = cachedConfig ?: fetchAndCacheConfig()
        return config.apiKey
    }

    private suspend fun fetchAndCacheConfig(): AppConfig {
        val encryptedConfig = api.getConfig()
        val decrypted = keyStore.decrypt(encryptedConfig)
        val config = Json.decodeFromString<AppConfig>(decrypted)
        cachedConfig = config
        return config
    }
}

data class AppConfig(
    val apiKey: String,
    val endpoints: Map<String, String>
)
```

```kotlin
// ✅ ALTERNATIVE: Use NDK for sensitive constants
// Secrets stored in native code are harder to extract than DEX strings.
// Still not impossible — but raises the effort bar significantly.

// In a C/C++ file (native-lib.cpp):
// extern "C" JNIEXPORT jstring JNICALL
// Java_com_example_NativeKeys_getApiKey(JNIEnv *env, jobject) {
//     return env->NewStringUTF("sk_live_abc123def456");
// }

// Kotlin wrapper:
object NativeKeys {
    init {
        System.loadLibrary("native-keys")
    }
    external fun getApiKey(): String
}
```

The fundamental rule of client-side security is this: anything that runs on the user's device can be inspected and modified by the user. No amount of obfuscation, encryption, or anti-tampering can change this fact. What you can do is make the process expensive, time-consuming, and fragile — so that updating your app frequently invalidates the attacker's work, and the cost of re-doing the analysis exceeds the value of what they'd gain. This is the economic argument for code protection: you're not trying to make reverse engineering impossible, you're trying to make it unprofitable.

Understanding the attacker's workflow also helps you identify what's worth protecting. String constants and API keys are the first things attackers look for because they're the easiest to find and the most immediately useful. Business logic (pricing calculations, feature flags, license checks) is the next target because it enables piracy or fraud. Cryptographic implementations are studied to find weaknesses that enable data extraction. Network communication patterns are analyzed to build unauthorized API clients. Each of these attack vectors requires different countermeasures, and your threat model should guide your investment in each area.

#### Common Mistakes

Developers often believe that ProGuard or R8 provides meaningful security. It doesn't — it's primarily a code optimization and size reduction tool. While it renames classes and methods, it doesn't encrypt strings, hide control flow, or protect business logic. A renamed method `a()` still does the same thing, and an experienced reverse engineer can figure out what it does by reading the code. Another common mistake is storing encryption keys alongside the data they encrypt. If the attacker can read both the encrypted file and the key, they have everything they need. Moving the key to a different file or a different class doesn't help — they can read all your files.

**Key takeaway:** Android APKs are trivially decompilable. Never store secrets in client-side code. Use server-side key management, native code for sensitive operations, and treat all client-side logic as public.

### Lesson 6.2: ProGuard and R8 Configuration

R8 is the default code shrinker and obfuscator in Android's build system, having replaced ProGuard as the standard tool. When you enable minification in your build configuration, R8 performs four operations: code shrinking (removing unused classes, methods, and fields), resource shrinking (removing unused resources), obfuscation (renaming classes, methods, and fields to short, meaningless names), and optimization (rewriting bytecode for efficiency, inlining methods, removing dead branches). These operations reduce APK size, improve runtime performance, and make decompiled code harder to read — but they are not security features. R8's obfuscation makes code less convenient to read, not unreadable.

Enabling R8 is straightforward in your module-level build configuration. You set `isMinifyEnabled` to `true` for your release build type and configure ProGuard rule files. The default ProGuard rules that ship with the Android Gradle Plugin (`proguard-android-optimize.txt`) provide a reasonable baseline, but you'll almost always need custom rules. R8 uses the same rule format as ProGuard, so existing ProGuard configurations work without modification. The key difference is that R8 performs whole-program optimization in a single step, while ProGuard ran optimization and obfuscation as separate passes.

```kotlin
// build.gradle.kts — Release build type configuration
android {
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Generate mapping file for crash report deobfuscation
            // Mapping file is at build/outputs/mapping/release/mapping.txt
        }
        debug {
            isMinifyEnabled = false
            // Never enable minification in debug — it breaks debugging
        }
    }
}
```

```kotlin
// proguard-rules.pro — Common rules for a typical Android app

# Keep application entry points
-keep class com.example.app.App { *; }

# Keep all classes used by Retrofit (reflection-based)
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.example.app.data.api.** { *; }
-keep class com.example.app.data.model.** { *; }

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Keep enum values (used by Gson/Moshi/Kotlin serialization)
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Room database entities and DAOs
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }

# Keep Kotlin Coroutines internal classes
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# Remove Log calls in release builds
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
```

Writing ProGuard rules correctly requires understanding what R8 can and cannot detect automatically. R8 traces references from entry points (activities, services, content providers declared in the manifest) and keeps everything reachable. But it cannot trace reflection-based access. If a library creates instances via `Class.forName()`, accesses fields via `Field.get()`, or invokes methods via `Method.invoke()`, R8 has no way to know those classes, fields, and methods are needed — and it will remove or rename them. This is why libraries like Retrofit, Gson, and Room need keep rules: they use reflection extensively to instantiate model classes, access fields by name, and invoke methods dynamically.

```kotlin
// Validating R8 configuration in your CI pipeline
// Run this as a Gradle task to catch R8 issues before they reach production

// build.gradle.kts
android {
    buildTypes {
        release {
            // Enable R8 full mode for maximum optimization
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    lint {
        // Treat missing keep rules as errors
        warningsAsErrors = true
    }
}

// In your CI script, build the release APK and run integration tests
// against it to catch any R8-related crashes:
// ./gradlew assembleRelease
// ./gradlew connectedReleaseAndroidTest
```

```kotlin
// Debugging R8 issues — print configuration and seeds
// Add these to proguard-rules.pro during debugging:

// -printconfiguration build/outputs/r8/full-config.txt
// -printseeds build/outputs/r8/seeds.txt
// -printusage build/outputs/r8/usage.txt
// -printmapping build/outputs/mapping/release/mapping.txt

// Seeds: classes/members kept by rules
// Usage: classes/members removed by R8
// Mapping: original -> obfuscated name mapping

// Use the mapping file to deobfuscate stack traces:
// retrace build/outputs/mapping/release/mapping.txt stacktrace.txt
```

The mapping file that R8 generates is critically important and often overlooked. This file maps obfuscated names back to original names, and you need it to deobfuscate crash reports. Without it, a stack trace showing `a.b.c.a()` is useless. Upload the mapping file to your crash reporting service (Firebase Crashlytics, Sentry, Bugsnag) for every release build, and archive it alongside your release APK. If you lose the mapping file for a release, you lose the ability to debug any crash from that version. Many teams learn this lesson the hard way after a production incident they can't diagnose.

One critical pitfall is the `-assumenosideeffects` rule used to strip logging. This rule tells R8 that the specified methods have no side effects, so calls to them can be safely removed. While this is perfect for `Log.d()` and `Log.v()`, applying it too broadly can cause silent data loss. Never apply it to methods that actually do have side effects. Also be aware that the arguments to stripped log calls are still evaluated. If you have `Log.d(TAG, expensiveToString())`, R8 strips the `Log.d()` call, but `expensiveToString()` might still execute. Use `if (BuildConfig.DEBUG)` guards for expensive log arguments.

#### Common Mistakes

The most dangerous R8 mistake is not testing the release build. Developers build and test in debug mode all day, enable R8 for release, and ship without thorough testing. R8 crashes are often subtle — a model class gets renamed, deserialization fails silently, and the app shows empty data instead of crashing. Always run your full test suite against the release build configuration. Another common mistake is using wildcard keep rules like `-keep class com.example.** { *; }` because "R8 was breaking things." This keeps everything in your package, completely defeating the purpose of obfuscation and shrinking. Instead, identify the specific classes that need keeping and write targeted rules.

**Key takeaway:** R8 is an optimization tool, not a security tool. Configure it correctly with targeted keep rules, always test release builds, and always archive the mapping file.

### Lesson 6.3: Advanced Obfuscation Techniques

R8's built-in obfuscation is a starting point, but it's insufficient for apps that handle sensitive business logic or high-value assets. An experienced reverse engineer can read R8-obfuscated code almost as easily as the original — the control flow is preserved, string constants are unchanged, and the overall architecture is clearly visible. If you need stronger protection, you'll need to layer additional obfuscation techniques on top of R8. These techniques increase the time and expertise required for reverse engineering, but they also increase your build complexity and can impact runtime performance, so apply them judiciously based on your threat model.

String encryption is the most impactful obfuscation technique because string constants are the first thing reverse engineers look for. URLs, error messages, API parameter names, and encryption algorithm identifiers are all strings that provide immediate insight into your app's behavior. Encrypting these strings at compile time and decrypting them at runtime prevents simple string searches from revealing sensitive information. You can implement basic string encryption using a Gradle build plugin or annotation processor that replaces string constants with encrypted versions and generates decryption calls.

```kotlin
// Runtime string decryption — basic implementation
// In production, use a commercial obfuscator for this.
// This demonstrates the concept.

object StringVault {
    // XOR-based obfuscation (basic — commercial tools use AES)
    private val key = byteArrayOf(0x4A, 0x7B, 0x2C, 0x1D, 0x5E, 0x3F, 0x6A, 0x0B)

    fun decode(encoded: ByteArray): String {
        val decoded = ByteArray(encoded.size)
        for (i in encoded.indices) {
            decoded[i] = (encoded[i].toInt() xor key[i % key.size].toInt()).toByte()
        }
        return String(decoded, Charsets.UTF_8)
    }

    // Pre-encoded strings (encoded at build time)
    val apiEndpoint: String
        get() = decode(byteArrayOf(
            0x2A, 0x1E, 0x4C, 0x71, 0x33, 0x56, 0x0B, 0x6E,
            0x29, 0x1F, 0x4F, 0x7A, 0x2F, 0x50, 0x05
        ))

    val encryptionAlgorithm: String
        get() = decode(byteArrayOf(
            0x0B, 0x14, 0x63, 0x70, 0x11, 0x4B, 0x2B
        ))
}
```

```kotlin
// Control flow obfuscation — making decompiled code harder to follow
// This is a simplified example; commercial tools do this automatically.

class LicenseChecker(private val context: Context) {
    // Instead of a simple boolean check, use an opaque predicate
    // pattern that produces the same result but is harder to understand
    // when decompiled.

    fun isLicenseValid(token: String): Boolean {
        val hash = MessageDigest.getInstance("SHA-256")
            .digest(token.toByteArray())
        val checksum = hash.fold(0) { acc, byte -> acc xor byte.toInt() }

        // Opaque predicate: this condition always evaluates to true
        // for valid checksums, but the decompiler can't simplify it
        val sentinel = System.nanoTime()
        val obfuscated = (sentinel * 2 + 1) % 2 == 1L

        return when {
            checksum == 0 && obfuscated -> false
            verifyWithServer(hash) -> true
            else -> false
        }
    }

    private fun verifyWithServer(hash: ByteArray): Boolean {
        // Actual license verification against server
        return true
    }
}
```

```kotlin
// Class and method name dictionary obfuscation
// R8 uses short names (a, b, c). A custom dictionary makes
// decompiled code actively misleading.

// proguard-rules.pro:
// -obfuscationdictionary obfuscation-dictionary.txt
// -classobfuscationdictionary obfuscation-dictionary.txt
// -packageobfuscationdictionary obfuscation-dictionary.txt

// obfuscation-dictionary.txt — use misleading names:
// onClick
// onResume
// toString
// hashCode
// getView
// setData
// update
// refresh
// callback
// handler
// listener
// adapter
// manager
// helper
// provider
// factory
// builder
// config
// cache
```

Native code obfuscation provides a stronger layer of protection than DEX obfuscation because native binaries (`.so` files) are compiled to machine code, which is inherently harder to decompile than JVM bytecode. While tools like IDA Pro and Ghidra can disassemble native code, the output is assembly language, not readable Kotlin or Java. Moving your most sensitive logic — cryptographic operations, license validation, integrity checks — into native code using the NDK significantly increases the effort required to understand it. Combined with native code obfuscation tools like OLLVM (Obfuscator-LLVM), which adds control flow flattening and bogus control flow, native code becomes extremely expensive to reverse engineer.

```kotlin
// Moving sensitive operations to native code
class NativeSecurityModule {
    companion object {
        init {
            System.loadLibrary("security-module")
        }
    }

    // These functions are implemented in C/C++ and compiled to native code.
    // The native implementations are much harder to reverse engineer
    // than equivalent Kotlin code.
    external fun verifyIntegrity(context: Any): Boolean
    external fun decryptPayload(encrypted: ByteArray, keyAlias: String): ByteArray
    external fun computeDeviceFingerprint(): String
    external fun validateLicense(token: String): Int
}

// Usage in Kotlin — the actual logic is in the native library
class AppInitializer(private val context: Context) {
    private val nativeSecurity = NativeSecurityModule()

    fun initialize(): Boolean {
        // Integrity check runs in native code — hard to bypass with Frida
        if (!nativeSecurity.verifyIntegrity(context)) {
            // App has been tampered with
            return false
        }

        val fingerprint = nativeSecurity.computeDeviceFingerprint()
        val licenseStatus = nativeSecurity.validateLicense(fingerprint)
        return licenseStatus == 0 // 0 = valid
    }
}
```

Beyond automated tools, consider architectural obfuscation — structuring your code in ways that make the overall logic harder to follow. Instead of a single `LicenseManager` class with clearly named methods, distribute license checking across multiple classes, use indirect method invocation through interfaces, and mix license logic with unrelated functionality. The goal is to make the reverse engineer's job tedious. They need to understand not just what each method does, but how methods across different classes interact. This is defense through complexity, and while it makes your code harder to maintain too, for critical business logic the tradeoff can be worth it.

The economic reality of obfuscation is important to understand. Free tools (R8) provide baseline protection. Commercial obfuscators (DexGuard, DashO, iXGuard) cost thousands of dollars per year but provide string encryption, control flow obfuscation, tamper detection, and certificate pinning in a single package. For most apps, R8's built-in obfuscation plus careful secret management (not storing secrets client-side) is sufficient. For apps handling financial transactions, DRM-protected content, or proprietary algorithms, commercial obfuscation is a justified investment. The question is always: is the cost of the protection less than the expected loss from reverse engineering?

#### Common Mistakes

Developers sometimes implement their own obfuscation schemes instead of using proven tools. Custom XOR encoding, base64 with a custom alphabet, or homegrown "encryption" provides a false sense of security and is trivially broken. Another mistake is obfuscating everything equally. Not all code deserves protection — focus obfuscation efforts on sensitive business logic, security checks, and cryptographic operations. Obfuscating your UI code wastes build time and makes debugging harder without providing any security benefit.

**Key takeaway:** Layer obfuscation techniques based on your threat model. R8 is the baseline. Add string encryption and native code for sensitive logic. Use commercial tools when the asset value justifies the cost.

### Lesson 6.4: Tamper Detection and Integrity Verification

Tamper detection is the practice of verifying that your app hasn't been modified since you built and signed it. In the Android ecosystem, app repackaging is a common attack: the attacker decompiles your APK, modifies the code (removing license checks, injecting malware, replacing ad SDK credentials), re-signs it with their own key, and distributes the modified version through alternative app stores or direct download. Without tamper detection, your app has no way to know it's been modified. With tamper detection, the app can detect modifications and refuse to run or degrade its functionality.

The most basic tamper detection technique is signature verification — checking that the app was signed with your signing key, not someone else's. When you sign your APK, the signing certificate's fingerprint is embedded in the APK's signature block. At runtime, you can retrieve this fingerprint and compare it against a known-good value. If they don't match, the app has been re-signed, which means it has been modified (since modifying an APK invalidates its signature and requires re-signing). This check is simple to implement but also simple to bypass — an attacker can find your signature check function and patch it to always succeed.

```kotlin
// APK signature verification
object SignatureVerifier {
    // SHA-256 fingerprint of your release signing certificate
    // Get this from: keytool -list -v -keystore your-keystore.jks
    private const val EXPECTED_SIGNATURE = "A1:B2:C3:D4:E5:F6:..."

    fun isSignatureValid(context: Context): Boolean {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNATURES
                )
            }

            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION")
                packageInfo.signatures
            }

            signatures?.any { signature ->
                val digest = MessageDigest.getInstance("SHA-256")
                val hash = digest.digest(signature.toByteArray())
                val fingerprint = hash.joinToString(":") { "%02X".format(it) }
                fingerprint == EXPECTED_SIGNATURE
            } ?: false
        } catch (e: Exception) {
            false
        }
    }
}
```

```kotlin
// APK checksum verification — detect binary modifications
object ApkIntegrityChecker {
    fun verifyApkChecksum(context: Context, expectedHash: String): Boolean {
        return try {
            val apkFile = File(context.packageCodePath)
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(8192)

            apkFile.inputStream().use { inputStream ->
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
            }

            val actualHash = digest.digest()
                .joinToString("") { "%02x".format(it) }
            actualHash == expectedHash
        } catch (e: Exception) {
            false
        }
    }

    // Verify classes.dex hasn't been modified
    fun verifyDexIntegrity(context: Context): Boolean {
        return try {
            val apkFile = java.util.zip.ZipFile(context.packageCodePath)
            val dexEntry = apkFile.getEntry("classes.dex")
            val crc = dexEntry.crc

            // Compare against known CRC from your build system
            // This value changes with every build, so it must be injected
            // at build time via BuildConfig
            crc == BuildConfig.DEX_CRC
        } catch (e: Exception) {
            false
        }
    }
}
```

```kotlin
// Google Play Integrity API — server-verified integrity
class PlayIntegrityChecker(private val context: Context) {
    // The Play Integrity API provides a server-verifiable verdict about
    // the device and app integrity. Unlike local checks, it cannot be
    // bypassed by modifying the app.

    suspend fun checkIntegrity(nonce: String): IntegrityResult {
        return try {
            val integrityManager = IntegrityManagerFactory.create(context)
            val integrityTokenRequest = IntegrityTokenRequest.builder()
                .setNonce(nonce) // Server-generated nonce to prevent replay
                .build()

            val integrityTokenResponse = suspendCoroutine { continuation ->
                integrityManager.requestIntegrityToken(integrityTokenRequest)
                    .addOnSuccessListener { response ->
                        continuation.resume(response)
                    }
                    .addOnFailureListener { exception ->
                        continuation.resumeWithException(exception)
                    }
            }

            // Send the token to YOUR server for verification.
            // Never verify the token on-device — that defeats the purpose.
            val token = integrityTokenResponse.token()
            IntegrityResult.TokenReceived(token)
        } catch (e: Exception) {
            IntegrityResult.Error(e.message ?: "Integrity check failed")
        }
    }
}

sealed class IntegrityResult {
    data class TokenReceived(val token: String) : IntegrityResult()
    data class Error(val message: String) : IntegrityResult()
}
```

For stronger tamper detection, combine multiple checks and verify them server-side. Local checks (signature verification, DEX checksum, debugger detection) can all be bypassed by a determined attacker with Frida. Server-side verification is fundamentally more secure because the attacker doesn't control the server. The Google Play Integrity API is the recommended approach: it produces a signed token that your server can verify, confirming that the app is the genuine version from the Play Store running on a genuine device. The server-side verification ensures that even if the attacker modifies the app to skip the local check, the server will reject requests from modified apps.

```kotlin
// Comprehensive tamper detection combining multiple signals
class TamperDetectionManager(private val context: Context) {
    data class IntegrityReport(
        val signatureValid: Boolean,
        val debuggerAttached: Boolean,
        val installerValid: Boolean,
        val emulatorDetected: Boolean,
        val hookingFrameworkDetected: Boolean,
        val overallVerdict: Verdict
    )

    enum class Verdict { GENUINE, SUSPICIOUS, TAMPERED }

    fun performIntegrityCheck(): IntegrityReport {
        val signatureValid = SignatureVerifier.isSignatureValid(context)
        val debuggerAttached = isDebuggerAttached()
        val installerValid = isInstalledFromPlayStore()
        val emulatorDetected = isEmulator()
        val hookingDetected = isHookingFrameworkPresent()

        val verdict = when {
            !signatureValid -> Verdict.TAMPERED
            debuggerAttached || hookingDetected -> Verdict.TAMPERED
            !installerValid || emulatorDetected -> Verdict.SUSPICIOUS
            else -> Verdict.GENUINE
        }

        return IntegrityReport(
            signatureValid = signatureValid,
            debuggerAttached = debuggerAttached,
            installerValid = installerValid,
            emulatorDetected = emulatorDetected,
            hookingFrameworkDetected = hookingDetected,
            overallVerdict = verdict
        )
    }

    private fun isDebuggerAttached(): Boolean {
        return Debug.isDebuggerConnected() ||
            Debug.waitingForDebugger() ||
            (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    private fun isInstalledFromPlayStore(): Boolean {
        val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.packageManager.getInstallSourceInfo(context.packageName)
                .installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(context.packageName)
        }
        return installer == "com.android.vending"
    }

    private fun isEmulator(): Boolean {
        return Build.FINGERPRINT.contains("generic") ||
            Build.MODEL.contains("Emulator") ||
            Build.MODEL.contains("Android SDK built for") ||
            Build.MANUFACTURER.contains("Genymotion") ||
            Build.PRODUCT.contains("sdk") ||
            Build.HARDWARE.contains("goldfish") ||
            Build.HARDWARE.contains("ranchu")
    }

    private fun isHookingFrameworkPresent(): Boolean {
        // Check for common hooking frameworks
        val suspiciousPackages = listOf(
            "de.robv.android.xposed",
            "com.saurik.substrate",
            "io.va.exposed"
        )
        return suspiciousPackages.any { pkg ->
            try {
                context.packageManager.getPackageInfo(pkg, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
    }
}
```

The response to tamper detection is as important as the detection itself. If your app immediately crashes when it detects tampering, the attacker knows exactly where the check is and can patch it. A more effective approach is delayed and subtle degradation. Continue running normally but report the tamper detection to your server. Gradually reduce functionality over the next few minutes or after the next app restart. Corrupt cached data so the app appears to have bugs rather than security checks. This makes it harder for the attacker to identify the exact check that's triggering the behavior, forcing them to search more broadly.

Another important consideration is false positives. Legitimate users may trigger tamper detection checks — enterprise devices might have device management software that looks like a hooking framework, users in China might install your app from alternative stores (not Google Play), and some devices have unusual `Build` properties that trigger emulator detection. Your tamper detection should report findings to your server rather than blocking users outright, allowing you to analyze patterns and adjust thresholds without pushing app updates.

#### Common Mistakes

The biggest mistake in tamper detection is performing all checks on the client side. Any check that runs entirely on the device can be bypassed. Always verify integrity server-side when possible. Another mistake is treating all integrity failures equally. A missing Play Store installer might just mean the user installed via ADB during development, while a modified signature definitively indicates tampering. Weight your responses accordingly.

**Key takeaway:** Layer multiple tamper detection signals, verify server-side whenever possible, and respond to tampering subtly rather than obviously.

### Lesson 6.5: Root and Debugger Detection

Rooted devices present a unique challenge for security-sensitive apps. Root access bypasses the Unix file permissions that protect your app's private directory, allowing any process running as root to read your shared preferences, database files, and cached data. Root also enables process injection via `ptrace`, allowing tools like Frida to hook into your running process. For apps handling financial transactions, healthcare data, or enterprise secrets, running on a rooted device may be unacceptable. However, root detection is an arms race — every detection technique has known bypasses, and tools like Magisk specifically focus on hiding root from apps.

The most common root detection techniques check for the presence of root indicators: the `su` binary, root management apps (Magisk Manager, SuperSU), BusyBox, writable system partitions, and unusual system properties. Each check alone is easy to bypass, but combining multiple checks raises the bar. Magisk's "MagiskHide" (now "Zygisk DenyList") hides root from specific apps by unmounting root-related filesystem modifications and hiding root-related processes, but it can't hide everything — there are always traces if you know where to look.

```kotlin
// Comprehensive root detection
object RootDetector {
    fun isDeviceRooted(): Boolean {
        return checkSuBinary() ||
            checkRootManagementApps() ||
            checkDangerousProperties() ||
            checkRootCloakingApps() ||
            checkWritableSystemPartition() ||
            checkSuExists()
    }

    private fun checkSuBinary(): Boolean {
        val paths = listOf(
            "/system/bin/su", "/system/xbin/su",
            "/sbin/su", "/system/su",
            "/system/bin/.ext/.su",
            "/system/usr/we-need-root/su",
            "/system/app/Superuser.apk",
            "/data/local/xbin/su", "/data/local/bin/su",
            "/data/local/su"
        )
        return paths.any { File(it).exists() }
    }

    private fun checkRootManagementApps(): Boolean {
        val packages = listOf(
            "com.topjohnwu.magisk",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.thirdparty.superuser",
            "com.noshufou.android.su"
        )
        return packages.any { pkg ->
            try {
                Runtime.getRuntime().exec("pm list packages")
                    .inputStream.bufferedReader().readText()
                    .contains(pkg)
            } catch (e: Exception) {
                false
            }
        }
    }

    private fun checkDangerousProperties(): Boolean {
        val dangerousProps = mapOf(
            "ro.debuggable" to "1",
            "ro.secure" to "0"
        )
        return dangerousProps.any { (prop, dangerousValue) ->
            try {
                val process = Runtime.getRuntime().exec("getprop $prop")
                val value = process.inputStream.bufferedReader().readText().trim()
                value == dangerousValue
            } catch (e: Exception) {
                false
            }
        }
    }

    private fun checkRootCloakingApps(): Boolean {
        val cloakingApps = listOf(
            "com.devadvance.rootcloak",
            "com.devadvance.rootcloakplus",
            "de.robv.android.xposed.installer",
            "com.saurik.substrate",
            "com.zachspong.temprootremovejb",
            "com.amphoras.hidemyroot"
        )
        return cloakingApps.any { pkg ->
            try {
                Runtime.getRuntime().exec("pm path $pkg")
                    .inputStream.bufferedReader().readText().isNotEmpty()
            } catch (e: Exception) {
                false
            }
        }
    }

    private fun checkWritableSystemPartition(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec("mount")
            val output = process.inputStream.bufferedReader().readText()
            output.split("\n").any { line ->
                line.contains("/system") && line.contains("rw")
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun checkSuExists(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("which", "su"))
            val result = process.inputStream.bufferedReader().readText().trim()
            result.isNotEmpty()
        } catch (e: Exception) {
            false
        }
    }
}
```

```kotlin
// Debugger detection — prevent runtime analysis
object DebuggerDetector {
    fun isBeingDebugged(): Boolean {
        return isJavaDebuggerAttached() ||
            isNativeDebuggerAttached() ||
            isTracerAttached() ||
            isDebuggableBuild()
    }

    private fun isJavaDebuggerAttached(): Boolean {
        return Debug.isDebuggerConnected() || Debug.waitingForDebugger()
    }

    private fun isNativeDebuggerAttached(): Boolean {
        // Check /proc/self/status for TracerPid
        // A non-zero TracerPid means a debugger is attached
        return try {
            val statusFile = File("/proc/self/status")
            val tracerLine = statusFile.readLines()
                .firstOrNull { it.startsWith("TracerPid:") }
            val tracerPid = tracerLine?.split(":")?.get(1)?.trim()?.toIntOrNull() ?: 0
            tracerPid != 0
        } catch (e: Exception) {
            false
        }
    }

    private fun isTracerAttached(): Boolean {
        // Attempt to ptrace ourselves — if it fails, someone else is tracing us
        return try {
            val process = Runtime.getRuntime().exec("cat /proc/self/status")
            val output = process.inputStream.bufferedReader().readText()
            val tracerPid = Regex("TracerPid:\\s+(\\d+)")
                .find(output)?.groupValues?.get(1)?.toIntOrNull() ?: 0
            tracerPid > 0
        } catch (e: Exception) {
            false
        }
    }

    private fun isDebuggableBuild(): Boolean {
        // Check if the app was built with debuggable=true
        return try {
            val appInfo = android.app.ActivityThread.currentApplication()
                ?.applicationInfo
            appInfo?.let {
                (it.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
            } ?: false
        } catch (e: Exception) {
            false
        }
    }
}
```

```kotlin
// Frida detection — detect the most popular hooking framework
object FridaDetector {
    fun isFridaDetected(): Boolean {
        return checkFridaPort() ||
            checkFridaFiles() ||
            checkFridaInMaps() ||
            checkFridaThread()
    }

    private fun checkFridaPort(): Boolean {
        // Frida server listens on port 27042 by default
        return try {
            val socket = java.net.Socket()
            socket.connect(
                java.net.InetSocketAddress("127.0.0.1", 27042),
                100
            )
            socket.close()
            true // Port is open — Frida might be running
        } catch (e: Exception) {
            false
        }
    }

    private fun checkFridaFiles(): Boolean {
        val fridaPaths = listOf(
            "/data/local/tmp/frida-server",
            "/data/local/tmp/re.frida.server",
            "/sdcard/frida-server"
        )
        return fridaPaths.any { File(it).exists() }
    }

    private fun checkFridaInMaps(): Boolean {
        // Check if frida-agent is loaded in our process memory
        return try {
            val mapsFile = File("/proc/self/maps")
            mapsFile.readLines().any { line ->
                line.contains("frida") || line.contains("gadget")
            }
        } catch (e: Exception) {
            false
        }
    }

    private fun checkFridaThread(): Boolean {
        // Frida creates threads with known names
        return Thread.getAllStackTraces().keys.any { thread ->
            thread.name.contains("frida", ignoreCase = true) ||
            thread.name.contains("gadget", ignoreCase = true) ||
            thread.name.contains("gum-js-loop", ignoreCase = true)
        }
    }
}
```

Debugger detection is equally important for preventing runtime analysis. When a debugger is attached to your process, the attacker can set breakpoints, inspect variables, step through code, and modify values — essentially watching your app execute in slow motion. Android supports two types of debugging: Java/Kotlin debugging through JDWP (Java Debug Wire Protocol) and native debugging through ptrace. Both can be detected. JDWP debugging is detected via `Debug.isDebuggerConnected()`. Native debugging is detected by checking `/proc/self/status` for a non-zero `TracerPid`, which indicates that another process is tracing yours.

The arms race between detection and bypass is ongoing and you should design your security with the assumption that any individual check can be bypassed. Magisk hides root by using mount namespaces to hide its modifications from specific apps. Frida operates in two modes: "injected" mode where frida-server pushes a library into your process (detectable via memory maps), and "embedded" mode where the Frida gadget is bundled with a repackaged APK (detectable via signature verification). For every detection technique, the hooking community publishes bypasses within weeks. The value of detection isn't in any single check but in the breadth of checks and the frequency of updates.

A practical approach is to use Google's Play Integrity API as your primary integrity signal and local checks as supplementary signals. The Play Integrity API runs in a Google-controlled environment that's extremely difficult to tamper with, and it provides a server-verifiable verdict about app authenticity, device integrity, and licensing status. Local checks add additional signal — they can detect conditions that the Play Integrity API doesn't cover (like specific hooking frameworks), and they can provide immediate responses without a network round-trip. Report all signals to your server and make access decisions server-side.

#### Common Mistakes

The most common mistake is blocking all rooted devices. Many legitimate users root their devices for valid reasons, and an outright block alienates them. Instead, consider risk-based responses: allow read-only features on rooted devices but require additional authentication for sensitive operations. Another mistake is relying on a single detection method. Magisk bypasses most individual root checks. Only a combination of multiple checks provides reasonable coverage. Finally, don't assume detection is sufficient — if the attacker bypasses your detection, your app should still be secure because you've also encrypted data, pinned certificates, and validated input.

**Key takeaway:** Root and debugger detection are speed bumps, not walls. Combine multiple detection techniques, verify server-side, and ensure your app remains secure even if detection is bypassed.

### Lesson 6.6: Secure Build Pipeline and Secret Management

Your build pipeline is the manufacturing line for your app, and securing it is just as important as securing the app itself. If an attacker compromises your CI/CD system, they can inject malicious code into your production builds without modifying your source repository. If your signing keys are stored insecurely, an attacker who obtains them can sign malicious APKs that appear to be legitimate updates. If API keys and secrets are committed to your Git repository, anyone with access to the repo (or its history) has your production credentials. Build pipeline security is often overlooked because it's not user-facing, but it's the foundation that everything else rests on.

Secrets management in Android projects typically involves API keys, signing keystores, and service account credentials. The wrong way to handle these is depressingly common: hardcoded constants in Kotlin files, values in `gradle.properties` that get committed to Git, or keystores stored in the repository. The right approach is to use environment variables for CI/CD builds and local properties files (excluded from Git) for development builds. Your `local.properties` file should contain development API keys, and your CI system should inject production keys from a secure vault (GitHub Secrets, Google Cloud Secret Manager, AWS Secrets Manager, HashiCorp Vault).

```kotlin
// build.gradle.kts — Secure API key management
android {
    defaultConfig {
        // Read API keys from local.properties (development)
        // or environment variables (CI/CD)
        val properties = java.util.Properties()
        val localPropertiesFile = rootProject.file("local.properties")
        if (localPropertiesFile.exists()) {
            properties.load(localPropertiesFile.inputStream())
        }

        val mapsApiKey = properties.getProperty("MAPS_API_KEY")
            ?: System.getenv("MAPS_API_KEY")
            ?: throw GradleException("MAPS_API_KEY not configured")

        buildConfigField("String", "MAPS_API_KEY", "\"$mapsApiKey\"")
        manifestPlaceholders["mapsApiKey"] = mapsApiKey
    }

    signingConfigs {
        create("release") {
            // Signing config from environment variables (CI/CD)
            val keystorePath = System.getenv("KEYSTORE_PATH")
            val keystorePassword = System.getenv("KEYSTORE_PASSWORD")
            val keyAlias = System.getenv("KEY_ALIAS")
            val keyPassword = System.getenv("KEY_PASSWORD")

            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
            }
        }
    }
}
```

```kotlin
// .gitignore — Ensure secrets are never committed
// local.properties
// *.jks
// *.keystore
// keystore.properties
// google-services.json   (if it contains production keys)
// service-account.json
// .env

// Git hook to prevent accidental secret commits
// .git/hooks/pre-commit:
// #!/bin/bash
// # Scan staged files for potential secrets
// if git diff --cached --name-only | xargs grep -l \
//     -e "AIza[0-9A-Za-z-_]{35}" \
//     -e "sk_live_[0-9a-zA-Z]{24}" \
//     -e "-----BEGIN (RSA |EC )?PRIVATE KEY-----" \
//     -e "password\s*=\s*\"[^\"]+\"" \
//     2>/dev/null; then
//     echo "ERROR: Potential secrets found in staged files!"
//     exit 1
// fi
```

```kotlin
// Separating API keys by build variant
android {
    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL",
                "\"https://staging-api.example.com\"")
            buildConfigField("String", "ANALYTICS_KEY",
                "\"dev_analytics_key\"")
        }
        release {
            val releaseApiKey = System.getenv("RELEASE_API_KEY")
                ?: throw GradleException("RELEASE_API_KEY not set")
            buildConfigField("String", "API_BASE_URL",
                "\"https://api.example.com\"")
            buildConfigField("String", "ANALYTICS_KEY",
                "\"$releaseApiKey\"")
        }
    }

    flavorDimensions += "environment"
    productFlavors {
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            buildConfigField("String", "ENVIRONMENT", "\"staging\"")
        }
        create("production") {
            dimension = "environment"
            buildConfigField("String", "ENVIRONMENT", "\"production\"")
        }
    }
}
```

Signing key management is critical because the signing key is your app's identity. If an attacker obtains your signing key, they can produce APKs that Android treats as legitimate updates to your app. Google's Play App Signing is the recommended approach: Google manages the app signing key in their secure infrastructure, and you upload your app signed with a separate upload key. If your upload key is compromised, you can contact Google to reset it — but if the app signing key were compromised, the only option would be to publish a new app with a new package name, losing all your existing installs.

```kotlin
// Dependency verification — ensure your dependencies haven't been tampered with
// gradle/verification-metadata.xml
// Generate with: ./gradlew --write-verification-metadata sha256

// build.gradle.kts — enable dependency verification
// dependencyVerification {
//     verify("org.jetbrains.kotlin:kotlin-stdlib:1.9.0") {
//         sha256("expected-hash-here")
//     }
// }

// Alternatively, use Gradle's built-in dependency locking
dependencyLocking {
    lockAllConfigurations()
}

// Generate lock files with:
// ./gradlew dependencies --write-locks

// build.gradle.kts — scan dependencies for known vulnerabilities
plugins {
    id("org.owasp.dependencycheck") version "8.4.0"
}

dependencyCheck {
    failBuildOnCVSS = 7.0f // Fail build for high-severity vulnerabilities
    suppressionFile = "owasp-suppressions.xml"
}
```

Supply chain security extends beyond your own code to every dependency you include. A compromised Gradle plugin, a malicious version of a popular library, or a typosquatted package name can inject code into your build. Gradle dependency verification (introduced in Gradle 6.2) allows you to verify the checksums of your dependencies, ensuring that the artifacts you download match what the authors published. Dependency locking pins exact versions so that a compromised repository can't serve you a different version than expected. Regular dependency auditing using tools like OWASP Dependency Check or GitHub's Dependabot alerts you to known vulnerabilities in your dependencies.

Your CI/CD pipeline itself must be hardened. Use ephemeral build environments (containers that are created fresh for each build and destroyed afterward) so that a compromised build can't persist across subsequent builds. Limit access to signing credentials to the release pipeline only — developers should never have access to production signing keys. Enable audit logging for all secret access. Use separate service accounts for different pipeline stages. Pin your CI/CD action versions to specific SHAs rather than tags (which can be moved). These precautions prevent an attacker who gains access to one part of your pipeline from compromising the entire system.

#### Common Mistakes

The most common pipeline mistake is committing secrets to Git. Even if you delete the file in a subsequent commit, the secret remains in Git history forever (until you rewrite history, which causes its own problems for anyone who has cloned the repo). Use `git-secrets` or `trufflehog` to scan your repository for accidentally committed credentials. Another mistake is sharing signing keys among team members by copying the keystore file — use a centralized signing service or key management system instead. Finally, not verifying dependencies means that a single compromised transitive dependency can inject arbitrary code into your production build.

**Key takeaway:** Secure your build pipeline with environment-based secret injection, Play App Signing for key management, dependency verification, and ephemeral CI/CD environments.

### Quiz: Code Protection

**Question 1:** Why is R8 obfuscation insufficient as a standalone security measure?

A) R8 only works on Kotlin code, not Java
B) R8 preserves string constants, control flow, and overall architecture — renamed classes are still easily readable
C) R8 is deprecated and no longer maintained
D) R8 only obfuscates method names, not class names

**Answer:** B — R8 renames identifiers but doesn't encrypt strings, hide control flow, or obscure the application architecture. Decompiled R8-obfuscated code is harder to read but far from unreadable.

**Question 2:** What is the primary advantage of server-side integrity verification over client-side checks?

A) Server-side checks are faster
B) Server-side checks don't require network access
C) The attacker doesn't control the server, so they can't bypass the verification
D) Server-side checks can detect all types of tampering

**Answer:** C — Client-side checks run in an environment the attacker controls, so any check can be bypassed with tools like Frida. Server-side verification runs in your controlled environment, making it fundamentally more resistant to tampering.

**Question 3:** What is the recommended approach for APK signing key management?

A) Store the keystore in the Git repository for easy access
B) Share the keystore file among all team members via email
C) Use Google Play App Signing so Google manages the signing key and you use a resettable upload key
D) Generate a new signing key for each release

**Answer:** C — Play App Signing keeps the app signing key in Google's secure infrastructure. If your upload key is compromised, you can reset it without losing your app identity.

**Question 4:** Why should tamper detection responses be subtle rather than immediate?

A) Immediate responses crash the app for legitimate users
B) Subtle responses make it harder for attackers to identify and patch the detection logic
C) Android doesn't allow immediate app termination
D) Subtle responses use less battery

**Answer:** B — If the app crashes immediately upon detecting tampering, the attacker can easily identify the check by tracing the crash. Delayed or subtle degradation forces the attacker to search more broadly for the detection logic.

**Question 5:** Which root detection technique is hardest for Magisk to bypass?

A) Checking for the `su` binary in known paths
B) Checking for root management app packages
C) Verifying integrity through Google Play Integrity API (server-side)
D) Checking system properties like `ro.debuggable`

**Answer:** C — Magisk can hide the `su` binary, root management apps, and dangerous properties from your app through mount namespace isolation. The Play Integrity API runs in Google's environment and provides a server-verifiable verdict that cannot be bypassed by modifying the app.

### Coding Challenge: APK Integrity Verification System

Build a complete `AppIntegrityManager` class that combines multiple integrity checks into a single verification system with server reporting. Requirements:

1. Verify APK signature against a known fingerprint
2. Detect if a debugger is attached (Java and native)
3. Check for common hooking frameworks (Frida, Xposed)
4. Detect rooted devices using at least three techniques
5. Generate an integrity report and send it to a server endpoint
6. Implement graceful degradation based on the integrity verdict

```kotlin
class AppIntegrityManager(
    private val context: Context,
    private val reportingApi: IntegrityReportingApi
) {
    data class IntegrityReport(
        val timestamp: Long = System.currentTimeMillis(),
        val signatureValid: Boolean,
        val debuggerDetected: Boolean,
        val hookingDetected: Boolean,
        val rootDetected: Boolean,
        val installerPackage: String?,
        val deviceFingerprint: String,
        val verdict: Verdict
    )

    enum class Verdict { GENUINE, SUSPICIOUS, COMPROMISED }

    suspend fun checkIntegrity(): IntegrityReport {
        val signatureValid = verifySignature()
        val debuggerDetected = detectDebugger()
        val hookingDetected = detectHookingFrameworks()
        val rootDetected = detectRoot()
        val installer = getInstallerPackage()
        val fingerprint = Build.FINGERPRINT

        val verdict = calculateVerdict(
            signatureValid, debuggerDetected, hookingDetected, rootDetected
        )

        val report = IntegrityReport(
            signatureValid = signatureValid,
            debuggerDetected = debuggerDetected,
            hookingDetected = hookingDetected,
            rootDetected = rootDetected,
            installerPackage = installer,
            deviceFingerprint = fingerprint,
            verdict = verdict
        )

        // Report to server asynchronously
        withContext(Dispatchers.IO) {
            try {
                reportingApi.submitReport(report)
            } catch (e: Exception) {
                // Log locally if server reporting fails
            }
        }

        return report
    }

    private fun verifySignature(): Boolean {
        val expectedFingerprint = "YOUR_RELEASE_CERTIFICATE_SHA256"
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNATURES
                )
            }

            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION")
                packageInfo.signatures
            }

            signatures?.any { sig ->
                val digest = MessageDigest.getInstance("SHA-256")
                val hash = digest.digest(sig.toByteArray())
                hash.joinToString(":") { "%02X".format(it) } == expectedFingerprint
            } ?: false
        } catch (e: Exception) {
            false
        }
    }

    private fun detectDebugger(): Boolean {
        // Java debugger
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return true
        // Debuggable flag
        if ((context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) return true
        // Native debugger via TracerPid
        return try {
            File("/proc/self/status").readLines()
                .firstOrNull { it.startsWith("TracerPid:") }
                ?.split(":")?.get(1)?.trim()?.toIntOrNull()
                ?.let { it > 0 } ?: false
        } catch (e: Exception) {
            false
        }
    }

    private fun detectHookingFrameworks(): Boolean {
        // Check Frida default port
        val fridaPort = try {
            val socket = java.net.Socket()
            socket.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 100)
            socket.close()
            true
        } catch (e: Exception) {
            false
        }
        // Check memory maps for injected libraries
        val mapsCheck = try {
            File("/proc/self/maps").readLines().any {
                it.contains("frida") || it.contains("xposed") || it.contains("substrate")
            }
        } catch (e: Exception) {
            false
        }
        return fridaPort || mapsCheck
    }

    private fun detectRoot(): Boolean {
        val suPaths = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su")
        val suExists = suPaths.any { File(it).exists() }
        val dangerousProps = try {
            val p = Runtime.getRuntime().exec("getprop ro.debuggable")
            p.inputStream.bufferedReader().readText().trim() == "1"
        } catch (e: Exception) { false }
        val testKeysBuild = Build.TAGS?.contains("test-keys") == true
        return suExists || dangerousProps || testKeysBuild
    }

    private fun getInstallerPackage(): String? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.packageManager.getInstallSourceInfo(context.packageName)
                .installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(context.packageName)
        }
    }

    private fun calculateVerdict(
        signatureValid: Boolean,
        debuggerDetected: Boolean,
        hookingDetected: Boolean,
        rootDetected: Boolean
    ): Verdict = when {
        !signatureValid || hookingDetected -> Verdict.COMPROMISED
        debuggerDetected -> Verdict.COMPROMISED
        rootDetected -> Verdict.SUSPICIOUS
        else -> Verdict.GENUINE
    }
}

interface IntegrityReportingApi {
    suspend fun submitReport(report: AppIntegrityManager.IntegrityReport)
}
```

This challenge tests your ability to combine multiple integrity signals into a cohesive security system. The key design decisions — weighted verdicts, server-side reporting, graceful degradation — reflect production security patterns used in banking and fintech applications.

---


## Module 7: App Component Security

Android applications are built from four fundamental components: Activities, Services, Broadcast Receivers, and Content Providers. Each of these components can communicate with other components — both within your app and across app boundaries — through Android's Inter-Process Communication (IPC) mechanisms. This cross-app communication is one of Android's greatest strengths, enabling rich integrations like sharing content, providing data to widgets, and handling deep links. But every exported component is a door into your app, and every door you don't lock is a vulnerability. Securing app components means understanding which doors need to be open, who should be allowed through, and how to verify their identity.

### Lesson 7.1: Activity Security and Intent Handling

Activities are the visual entry points to your application, and they can be launched by other apps through explicit or implicit intents. When you declare an activity with `android:exported="true"` or add an intent filter (which implicitly exports the activity on Android 11 and below), any app on the device can start it. This is necessary for launcher activities, deep link handlers, and activities that respond to system intents. But it's dangerous for internal activities that handle sensitive operations like payment confirmation, account settings, or admin panels. Starting with Android 12, the system requires you to explicitly declare the `exported` attribute for every component with an intent filter, eliminating a class of accidental export bugs.

The primary risk with exported activities is intent injection. An attacker crafts a malicious intent with unexpected extras, data URIs, or flags and sends it to your activity. If your activity processes these parameters without validation, the attacker can manipulate your app's behavior. Consider a deep link handler that navigates to a URL passed in the intent data — without validation, an attacker could navigate your app to a phishing page inside a WebView. Or a payment confirmation activity that reads the amount from an intent extra — without validation, the attacker could set the amount to zero.

```kotlin
// ❌ VULNERABLE: Exported activity with no input validation
class PaymentConfirmActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Attacker can launch this with arbitrary values:
        // adb shell am start -n com.example/.PaymentConfirmActivity
        //     --es "amount" "0.01" --es "recipient" "attacker@evil.com"
        val amount = intent.getStringExtra("amount") ?: "0"
        val recipient = intent.getStringExtra("recipient") ?: ""
        processPayment(amount.toDouble(), recipient) // No validation!
    }

    private fun processPayment(amount: Double, recipient: String) {
        // Processes payment with unvalidated inputs
    }
}
```

```kotlin
// ✅ SECURE: Internal activity that validates caller and inputs
class PaymentConfirmActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Verify the caller is our own app
        if (!isCallerTrusted()) {
            finish()
            return
        }

        // Validate and sanitize all input
        val amount = intent.getDoubleExtra("amount", -1.0)
        val recipient = intent.getStringExtra("recipient")

        if (amount <= 0 || amount > MAX_PAYMENT_AMOUNT || recipient.isNullOrBlank()) {
            showError("Invalid payment parameters")
            finish()
            return
        }

        if (!isValidRecipient(recipient)) {
            showError("Invalid recipient")
            finish()
            return
        }

        // Show confirmation UI — don't auto-process
        showPaymentConfirmation(amount, recipient)
    }

    private fun isCallerTrusted(): Boolean {
        val callingPackage = callingActivity?.packageName
        return callingPackage == packageName
    }

    private fun isValidRecipient(recipient: String): Boolean {
        // Validate against known recipient format
        return recipient.matches(Regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$"))
    }

    companion object {
        private const val MAX_PAYMENT_AMOUNT = 10000.0

        // Safe launch method — ensures correct extras
        fun createIntent(context: Context, amount: Double, recipient: String): Intent {
            return Intent(context, PaymentConfirmActivity::class.java).apply {
                putExtra("amount", amount)
                putExtra("recipient", recipient)
            }
        }
    }
}
```

```kotlin
// Deep link handling with proper validation
class DeepLinkActivity : AppCompatActivity() {
    // Allowlist of valid deep link hosts and paths
    private val allowedHosts = setOf("example.com", "www.example.com")
    private val allowedPaths = setOf("/product/", "/profile/", "/settings/")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uri = intent.data
        if (uri == null) {
            navigateToHome()
            return
        }

        // Validate the URI scheme
        if (uri.scheme !in listOf("https", "app")) {
            navigateToHome()
            return
        }

        // Validate the host
        if (uri.host !in allowedHosts) {
            navigateToHome()
            return
        }

        // Validate the path prefix
        val path = uri.path ?: ""
        if (!allowedPaths.any { path.startsWith(it) }) {
            navigateToHome()
            return
        }

        // Sanitize path parameters
        val sanitizedPath = path.replace(Regex("[^a-zA-Z0-9/\\-_]"), "")

        // Route to appropriate destination
        when {
            sanitizedPath.startsWith("/product/") -> {
                val productId = sanitizedPath.removePrefix("/product/")
                if (productId.matches(Regex("^[a-zA-Z0-9-]+$"))) {
                    navigateToProduct(productId)
                } else {
                    navigateToHome()
                }
            }
            sanitizedPath.startsWith("/profile/") -> navigateToProfile()
            sanitizedPath.startsWith("/settings/") -> navigateToSettings()
            else -> navigateToHome()
        }
    }

    private fun navigateToHome() { /* ... */ }
    private fun navigateToProduct(productId: String) { /* ... */ }
    private fun navigateToProfile() { /* ... */ }
    private fun navigateToSettings() { /* ... */ }
}
```

For activities that must be exported (deep link handlers, share targets), implement defense in depth. Validate every input parameter, sanitize URI data, and never perform sensitive operations directly from intent data without user confirmation. Use `callingActivity` to verify the caller when possible, though be aware that this can be null for activities started with `startActivity()` (as opposed to `startActivityForResult()`). For truly sensitive activities, require authentication before processing the intent — even if the user is already logged in, prompt for biometric confirmation before executing a payment or changing account settings.

Task hijacking is another activity-related vulnerability. By default, Android manages activities in a task (back stack), and manipulating task affinity and launch modes can cause your activity to appear in another app's task stack, or vice versa. An attacker can create an activity with the same task affinity as your app, causing their activity to appear when the user navigates back to your app. This is called "StrandHogg" and has been used in real-world malware. To protect against it, set `android:taskAffinity=""` (empty string) on sensitive activities and avoid using `FLAG_ACTIVITY_NEW_TASK` when launching internal activities. Android 12's restrictions on launching activities from the background also help mitigate this class of attack.

Intent redirection is a subtle vulnerability where your app receives an intent, extracts a nested intent from it, and starts that nested intent. This allows an attacker to use your app as a proxy to launch activities that aren't normally accessible. For example, if your app has an activity that reads an intent extra named "next_intent" and starts it, the attacker can embed an intent targeting your non-exported activity inside their own intent. Your app, having the necessary permissions, dutifully starts the internal activity on the attacker's behalf. Never start intents extracted from incoming intents without thorough validation.

#### Common Mistakes

The most common activity security mistake is processing deep link parameters without validation. Deep links are user-controlled input — treat them with the same suspicion as HTTP request parameters. Another frequent mistake is using `android:launchMode="singleTask"` without understanding its implications for task hijacking. Also, developers often forget that `onNewIntent()` is called when an activity with `singleTop` or `singleTask` launch mode receives a new intent while already running — the new intent must be validated just like the original.

**Key takeaway:** Every exported activity is an attack surface. Validate all intent data, verify callers when possible, and never auto-execute sensitive operations from intent parameters without user confirmation.

### Lesson 7.2: Service Security

Services run in the background without a user interface, making them attractive targets for attackers because their abuse may go unnoticed. A bound service that exposes sensitive methods (querying user data, performing transactions) without verifying the caller's identity effectively grants those capabilities to any app on the device. Android supports two types of services: started services (launched via `startService()` and run until stopped) and bound services (connected to by clients via `bindService()` and run as long as clients are bound). Both types can be exported or private, and the security considerations differ for each.

For services that only your app uses, set `android:exported="false"` in the manifest. This is the strongest protection — the system will refuse to start or bind to the service from any other app, regardless of permissions. For services that must be accessible to other apps (like a music player's media control service or a messaging app's reply service), use signature-level permissions that restrict access to apps signed with the same key (your own apps), or define custom permissions with appropriate protection levels.

```kotlin
// ❌ VULNERABLE: Exported service with no permission check
// <service android:name=".UserDataService" android:exported="true" />
class UserDataService : Service() {
    private val binder = UserDataBinder()

    inner class UserDataBinder : Binder() {
        // Any app can call this and get user data!
        fun getUserProfile(): UserProfile {
            return database.getCurrentUserProfile()
        }

        fun getUserToken(): String {
            return tokenStore.getAccessToken()
        }
    }

    override fun onBind(intent: Intent): IBinder = binder
}
```

```kotlin
// ✅ SECURE: Service with signature-level permission
// In AndroidManifest.xml:
// <permission
//     android:name="com.example.permission.ACCESS_USER_DATA"
//     android:protectionLevel="signature" />
//
// <service
//     android:name=".UserDataService"
//     android:exported="true"
//     android:permission="com.example.permission.ACCESS_USER_DATA" />

class SecureUserDataService : Service() {
    private val binder = SecureUserDataBinder()

    inner class SecureUserDataBinder : Binder() {
        fun getUserProfile(callingUid: Int): UserProfile? {
            // Double-check permission at runtime
            if (!isCallerAuthorized(callingUid)) {
                throw SecurityException("Unauthorized access to user data")
            }
            return database.getCurrentUserProfile()
        }
    }

    override fun onBind(intent: Intent): IBinder {
        // Verify the binding app has the required permission
        val callingPermission = checkCallingPermission(
            "com.example.permission.ACCESS_USER_DATA"
        )
        if (callingPermission != PackageManager.PERMISSION_GRANTED) {
            throw SecurityException("Missing required permission")
        }
        return binder
    }

    private fun isCallerAuthorized(callingUid: Int): Boolean {
        // Verify the caller is signed with our certificate
        val callingPackages = packageManager.getPackagesForUid(callingUid)
        return callingPackages?.any { pkg ->
            val signingInfo = packageManager.getPackageInfo(
                pkg, PackageManager.GET_SIGNING_CERTIFICATES
            ).signingInfo
            signingInfo?.hasMultipleSigners() == false &&
                isOurSignature(signingInfo.apkContentsSigners.first())
        } ?: false
    }

    private fun isOurSignature(signature: android.content.pm.Signature): Boolean {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(signature.toByteArray())
        val fingerprint = hash.joinToString(":") { "%02X".format(it) }
        return fingerprint == EXPECTED_SIGNATURE
    }

    companion object {
        private const val EXPECTED_SIGNATURE = "YOUR_CERT_FINGERPRINT"
    }
}
```

```kotlin
// Messenger-based IPC with validation
// For cross-process service communication using Messenger pattern

class SecureMessengerService : Service() {
    private val handler = object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            // Verify caller before processing
            val callingUid = Binder.getCallingUid()
            if (!isAuthorized(callingUid)) {
                replyWithError(msg, "Unauthorized")
                return
            }

            when (msg.what) {
                MSG_GET_STATUS -> {
                    val reply = Message.obtain(null, MSG_STATUS_RESPONSE)
                    reply.data = Bundle().apply {
                        putString("status", "active")
                    }
                    msg.replyTo?.send(reply)
                }
                MSG_PERFORM_ACTION -> {
                    val actionData = msg.data?.getString("action")
                    if (actionData != null && isValidAction(actionData)) {
                        performAction(actionData)
                    }
                }
            }
        }
    }

    private val messenger = Messenger(handler)

    override fun onBind(intent: Intent): IBinder = messenger.binder

    private fun isAuthorized(uid: Int): Boolean {
        return checkCallingPermission(
            "com.example.permission.ACCESS_SERVICE"
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun isValidAction(action: String): Boolean {
        return action in listOf("sync", "refresh", "clear_cache")
    }

    private fun replyWithError(msg: Message, error: String) {
        val reply = Message.obtain(null, MSG_ERROR)
        reply.data = Bundle().apply { putString("error", error) }
        try {
            msg.replyTo?.send(reply)
        } catch (e: RemoteException) {
            // Client died
        }
    }

    private fun performAction(action: String) { /* ... */ }

    companion object {
        const val MSG_GET_STATUS = 1
        const val MSG_STATUS_RESPONSE = 2
        const val MSG_PERFORM_ACTION = 3
        const val MSG_ERROR = -1
    }
}
```

Foreground services deserve special security consideration because they must display a persistent notification, making them visible to the user. Starting with Android 14, foreground services must declare their type (camera, microphone, location, dataSync, etc.) in the manifest, and the system verifies that the app holds the corresponding permissions. This prevents apps from using foreground services to silently access protected resources. When implementing foreground services, declare the minimum required foreground service type and ensure the notification accurately describes what the service is doing. Users who see a vague "Running in background" notification are likely to distrust your app.

A particularly dangerous pattern is the "confused deputy" attack on services. Your service has permissions that the calling app doesn't (for example, your service has `INTERNET` permission and the calling app doesn't). If your service performs actions on behalf of the caller without checking the caller's permissions, the caller effectively escalates its privileges through your service. Always use `checkCallingPermission()` (not `checkCallingOrSelfPermission()`) to verify the caller's permissions. The `checkCallingOrSelfPermission()` method also checks your own app's permissions, which always pass, making it useless for access control in IPC scenarios. This is a subtle but critical distinction that many developers get wrong.

When using AIDL (Android Interface Definition Language) for complex IPC, all the same security principles apply. AIDL interfaces are essentially exposed APIs, and they should be treated with the same care as REST API endpoints — validate all inputs, authenticate all callers, authorize every operation, and handle errors gracefully. AIDL methods run in the Binder thread pool by default, so they need to be thread-safe. The `Binder.getCallingUid()` and `Binder.getCallingPid()` methods let you identify the caller, and you should verify their identity before executing any sensitive operation.

#### Common Mistakes

The most common service security mistake is using `checkCallingOrSelfPermission()` instead of `checkCallingPermission()`. The former always succeeds when called within your own process because your app has its own permissions. Another mistake is not declaring services as non-exported when they're only used internally. Many developers also forget that `onBind()` is called only once per client connection but the methods on the returned IBinder are called many times — you need to check permissions on every method call, not just in `onBind()`.

**Key takeaway:** Set `android:exported="false"` for internal services. For exported services, use signature-level permissions and verify the caller's identity on every IPC call using `checkCallingPermission()`.

### Lesson 7.3: Broadcast Receiver Security

Broadcast receivers respond to system-wide events and inter-app messages, making them one of the most commonly exploited components. A broadcast receiver that listens for sensitive intents (like SMS received, boot completed, or package installed) can leak private data if it's not properly protected. Conversely, a receiver that processes broadcasts without verifying the sender can be manipulated by any app that sends a matching broadcast intent. The broadcast system is inherently a publish-subscribe model — any app can publish, and any registered receiver will receive — which makes it fundamentally more open (and thus more dangerous) than direct component communication.

There are two types of broadcasts: normal broadcasts (delivered asynchronously to all receivers) and ordered broadcasts (delivered one at a time in priority order, with each receiver able to modify or abort the broadcast). Ordered broadcasts are particularly dangerous because a high-priority receiver can intercept a broadcast intended for your app, extract sensitive data from it, modify the data, and pass it along to the next receiver. This is how some malware intercepts SMS-based one-time passwords — by registering a high-priority receiver for `SMS_RECEIVED` that reads and aborts the SMS before your app sees it.

```kotlin
// ❌ VULNERABLE: Receiver that processes any broadcast without verification
class PaymentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Any app can send this broadcast!
        // adb shell am broadcast -a com.example.PAYMENT_RECEIVED
        //     --es "amount" "999.99" --es "status" "success"
        val amount = intent.getStringExtra("amount")
        val status = intent.getStringExtra("status")
        updatePaymentStatus(amount, status) // Trusts unvalidated data
    }
}

// In AndroidManifest.xml:
// <receiver android:name=".PaymentReceiver" android:exported="true">
//     <intent-filter>
//         <action android:name="com.example.PAYMENT_RECEIVED" />
//     </intent-filter>
// </receiver>
```

```kotlin
// ✅ SECURE: Permission-protected broadcast communication
// Define a signature-level permission for your broadcasts
// <permission
//     android:name="com.example.permission.PAYMENT_BROADCAST"
//     android:protectionLevel="signature" />

// Sender — requires the receiver to hold the permission
class PaymentProcessor(private val context: Context) {
    fun notifyPaymentComplete(amount: Double, transactionId: String) {
        val intent = Intent("com.example.PAYMENT_RECEIVED").apply {
            setPackage(context.packageName) // Restrict to our app only
            putExtra("amount", amount)
            putExtra("transaction_id", transactionId)
            putExtra("timestamp", System.currentTimeMillis())
        }
        // Send with permission requirement — only receivers
        // holding our signature permission will receive it
        context.sendBroadcast(
            intent,
            "com.example.permission.PAYMENT_BROADCAST"
        )
    }
}

// Receiver — protected by both manifest permission and runtime checks
// <receiver
//     android:name=".PaymentReceiver"
//     android:exported="true"
//     android:permission="com.example.permission.PAYMENT_BROADCAST">
//     <intent-filter>
//         <action android:name="com.example.PAYMENT_RECEIVED" />
//     </intent-filter>
// </receiver>

class SecurePaymentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Validate the action
        if (intent.action != "com.example.PAYMENT_RECEIVED") return

        // Validate the sender package
        if (intent.`package` != context.packageName) return

        // Validate the data
        val amount = intent.getDoubleExtra("amount", -1.0)
        val transactionId = intent.getStringExtra("transaction_id")
        val timestamp = intent.getLongExtra("timestamp", 0)

        if (amount <= 0 || transactionId.isNullOrBlank()) return

        // Check timestamp freshness to prevent replay attacks
        val age = System.currentTimeMillis() - timestamp
        if (age > TimeUnit.MINUTES.toMillis(5) || age < 0) return

        updatePaymentStatus(amount, transactionId)
    }
}
```

```kotlin
// Using LocalBroadcastManager alternative with LiveData or Flow
// LocalBroadcastManager is deprecated — use these alternatives instead

// Option 1: SharedFlow for in-app event broadcasting
class AppEventBus {
    private val _events = MutableSharedFlow<AppEvent>(
        replay = 0,
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val events: SharedFlow<AppEvent> = _events.asSharedFlow()

    suspend fun emit(event: AppEvent) {
        _events.emit(event)
    }
}

sealed class AppEvent {
    data class PaymentCompleted(
        val amount: Double,
        val transactionId: String
    ) : AppEvent()

    data class UserLoggedOut(val reason: String) : AppEvent()
    data class SyncCompleted(val itemCount: Int) : AppEvent()
}

// Usage in a ViewModel
class PaymentViewModel(private val eventBus: AppEventBus) : ViewModel() {
    init {
        viewModelScope.launch {
            eventBus.events
                .filterIsInstance<AppEvent.PaymentCompleted>()
                .collect { event ->
                    handlePaymentComplete(event)
                }
        }
    }

    private fun handlePaymentComplete(event: AppEvent.PaymentCompleted) {
        // Process payment completion — fully in-process, no IPC
    }
}
```

```kotlin
// Secure system broadcast handling
class SecureBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // System broadcasts — verify the action matches expected values
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                // Schedule periodic work instead of starting a service directly
                // This respects Android 8+ background execution limits
                val workRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                    1, TimeUnit.HOURS
                ).setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                ).build()

                WorkManager.getInstance(context)
                    .enqueueUniquePeriodicWork(
                        "periodic_sync",
                        ExistingPeriodicWorkPolicy.KEEP,
                        workRequest
                    )
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                // App was updated — run migration if needed
                handleAppUpdate(context)
            }
            // Ignore unexpected actions
            else -> return
        }
    }

    private fun handleAppUpdate(context: Context) {
        // Perform post-update tasks
    }
}
```

For internal communication within your app, avoid broadcasts entirely. The `LocalBroadcastManager` class was deprecated in AndroidX because it was a process-local broadcast system masquerading as an IPC mechanism. Modern alternatives include Kotlin `SharedFlow` for event-driven communication, `LiveData` for lifecycle-aware observation, and standard callback interfaces. These are faster than broadcasts (no serialization/deserialization overhead), type-safe (no string-based action matching), and inherently secure (they never leave your process). Reserve broadcast receivers for system events (boot completed, connectivity changes, package events) and cross-app communication where it's genuinely needed.

When you must send broadcasts that other apps should receive, use explicit intents with `setPackage()` to restrict delivery to a specific app, or use signature-level permissions to restrict delivery to apps signed with your certificate. When you must receive broadcasts from other apps, always validate the sender and the data. Never trust broadcast extras to contain valid, safe data — treat every broadcast as potentially malicious input. For system broadcasts, note that many have been restricted in recent Android versions (Android 7 limited `CONNECTIVITY_CHANGE`, Android 8 limited most implicit broadcasts, Android 14 further restricts broadcast registration at runtime). Use the manifest-registered receiver for system broadcasts that are still allowed, and register receivers at runtime for others.

Sticky broadcasts were once common but are now deprecated because they allow any app to read the most recent broadcast of a given action, and any app can overwrite the sticky broadcast with a malicious one. If you encounter legacy code using `sendStickyBroadcast()`, refactor it to use a different communication pattern. The data that sticky broadcasts persisted can be stored in SharedPreferences, a database, or a DataStore and queried on demand, which is both more secure and more reliable.

#### Common Mistakes

The most common broadcast security mistake is sending sensitive data (tokens, user IDs, personal information) in broadcast intents without permission protection. Any app with a matching receiver will receive this data. Another mistake is registering receivers with overly broad intent filters that match more actions than intended. Developers also frequently forget to unregister dynamically registered receivers, which can cause memory leaks and continued processing of broadcasts after the activity or service is destroyed. With Android 14's runtime registration restrictions, you must also specify `RECEIVER_NOT_EXPORTED` or `RECEIVER_EXPORTED` when registering receivers dynamically.

**Key takeaway:** Prefer in-process communication (SharedFlow, LiveData) over broadcasts. When broadcasts are necessary, use permission protection, explicit intents with `setPackage()`, and validate all incoming data.

### Lesson 7.4: Content Provider Security

Content providers are Android's mechanism for structured data sharing between applications. They expose data through a URI-based interface that supports CRUD operations (create, read, update, delete), making them similar to REST APIs — and just as vulnerable to the same types of attacks. An improperly secured content provider can leak an app's entire database to any app on the device, allow unauthorized data modification, or even enable SQL injection attacks. Content providers are particularly dangerous because they're often backed by SQLite databases, and the URI-based query interface maps directly to SQL queries.

The most critical content provider security control is the `android:exported` attribute. When set to `true`, any app can query your content provider using a `ContentResolver`. When set to `false`, only your app (and apps with the same UID through shared user ID) can access it. For content providers that only serve data within your app, always set `android:exported="false"`. For content providers that must share data with other apps, use permissions to control access. Android supports separate read and write permissions on content providers, allowing you to grant read access more broadly than write access.

```kotlin
// ❌ VULNERABLE: Exported content provider with no protection
// <provider
//     android:name=".data.UserContentProvider"
//     android:authorities="com.example.provider.users"
//     android:exported="true" />

class VulnerableUserProvider : ContentProvider() {
    override fun query(
        uri: Uri, projection: Array<String>?,
        selection: String?, selectionArgs: Array<String>?,
        sortOrder: String?
    ): Cursor? {
        // SQL injection vulnerability — selection comes from the caller!
        // An attacker can pass: selection = "1=1) UNION SELECT password FROM credentials--"
        return database.query("users", projection, selection, selectionArgs, null, null, sortOrder)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        // Any app can insert data into our database
        val id = database.insert("users", null, values)
        return ContentUris.withAppendedId(uri, id)
    }

    // ... other methods equally unprotected
}
```

```kotlin
// ✅ SECURE: Content provider with permissions and input validation
// <permission
//     android:name="com.example.permission.READ_USER_DATA"
//     android:protectionLevel="signature" />
// <permission
//     android:name="com.example.permission.WRITE_USER_DATA"
//     android:protectionLevel="signature" />
//
// <provider
//     android:name=".data.SecureUserProvider"
//     android:authorities="com.example.provider.users"
//     android:exported="true"
//     android:readPermission="com.example.permission.READ_USER_DATA"
//     android:writePermission="com.example.permission.WRITE_USER_DATA" />

class SecureUserProvider : ContentProvider() {
    companion object {
        private const val USERS = 1
        private const val USER_BY_ID = 2

        private val uriMatcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI("com.example.provider.users", "users", USERS)
            addURI("com.example.provider.users", "users/#", USER_BY_ID)
        }

        // Allowlist of queryable columns
        private val ALLOWED_COLUMNS = setOf(
            "id", "display_name", "avatar_url", "created_at"
        )
        // Columns that must never be returned
        private val BLOCKED_COLUMNS = setOf(
            "password_hash", "email", "phone", "auth_token"
        )
    }

    override fun query(
        uri: Uri, projection: Array<String>?,
        selection: String?, selectionArgs: Array<String>?,
        sortOrder: String?
    ): Cursor? {
        // Validate the URI
        val match = uriMatcher.match(uri)
        if (match == UriMatcher.NO_MATCH) return null

        // Sanitize projection — only allow known safe columns
        val safeProjection = projection
            ?.filter { it in ALLOWED_COLUMNS }
            ?.toTypedArray()
            ?.ifEmpty { ALLOWED_COLUMNS.toTypedArray() }
            ?: ALLOWED_COLUMNS.toTypedArray()

        // Use parameterized queries to prevent SQL injection
        val queryBuilder = SQLiteQueryBuilder().apply {
            tables = "users"
            // Restrict the query with a projection map
            projectionMap = ALLOWED_COLUMNS.associateWith { it }
        }

        return when (match) {
            USERS -> queryBuilder.query(
                database, safeProjection,
                null, null, null, null,
                validateSortOrder(sortOrder)
            )
            USER_BY_ID -> {
                val userId = ContentUris.parseId(uri)
                queryBuilder.query(
                    database, safeProjection,
                    "id = ?", arrayOf(userId.toString()),
                    null, null, null
                )
            }
            else -> null
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        if (values == null) return null
        if (uriMatcher.match(uri) != USERS) return null

        // Validate and sanitize input values
        val sanitizedValues = ContentValues().apply {
            values.getAsString("display_name")?.let {
                if (it.length <= 100) put("display_name", sanitizeString(it))
            }
            values.getAsString("avatar_url")?.let {
                if (isValidUrl(it)) put("avatar_url", it)
            }
        }

        if (sanitizedValues.size() == 0) return null

        val id = database.insert("users", null, sanitizedValues)
        context?.contentResolver?.notifyChange(uri, null)
        return ContentUris.withAppendedId(uri, id)
    }

    private fun validateSortOrder(sortOrder: String?): String {
        if (sortOrder == null) return "created_at DESC"
        // Only allow sorting by known columns
        val column = sortOrder.split(" ").firstOrNull() ?: return "created_at DESC"
        return if (column in ALLOWED_COLUMNS) sortOrder else "created_at DESC"
    }

    private fun sanitizeString(input: String): String {
        return input.replace(Regex("[<>\"';&]"), "")
    }

    private fun isValidUrl(url: String): Boolean {
        return try {
            val uri = Uri.parse(url)
            uri.scheme in listOf("https") && uri.host != null
        } catch (e: Exception) {
            false
        }
    }

    // ... other required ContentProvider methods
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
    override fun getType(uri: Uri): String? = null
    override fun onCreate(): Boolean = true
}
```

```kotlin
// Temporary URI permissions for secure file sharing
class SecureFileProvider : FileProvider() {
    // FileProvider handles secure file sharing through content:// URIs
    // with temporary permissions. This is the recommended approach
    // for sharing files with other apps.
}

// Sharing a file securely
class FileShareHelper(private val context: Context) {
    fun shareFile(file: File, mimeType: String) {
        // Generate a content:// URI through FileProvider
        val contentUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, contentUri)
            // Grant temporary read permission to the receiving app
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // Don't grant write permission unless absolutely necessary
        }

        // Use createChooser to let the user pick the target app
        context.startActivity(
            Intent.createChooser(shareIntent, "Share via")
        )
    }
}

// FileProvider configuration in AndroidManifest.xml:
// <provider
//     android:name="androidx.core.content.FileProvider"
//     android:authorities="${applicationId}.fileprovider"
//     android:exported="false"
//     android:grantUriPermissions="true">
//     <meta-data
//         android:name="android.support.FILE_PROVIDER_PATHS"
//         android:resource="@xml/file_paths" />
// </provider>

// res/xml/file_paths.xml:
// <paths>
//     <files-path name="shared_files" path="shared/" />
//     <!-- Only expose the specific directory you need to share -->
//     <!-- Never use <root-path> as it exposes the entire filesystem -->
// </paths>
```

SQL injection through content providers is a real and common vulnerability. When a content provider passes the caller-supplied `selection` parameter directly to `SQLiteDatabase.query()`, the caller can inject arbitrary SQL. For example, a selection string of `"1=1) UNION SELECT token FROM auth_tokens--"` could extract authentication tokens from a completely different table. The defense is to use parameterized queries (with `selectionArgs`), validate that selection columns are in an allowlist, and use `SQLiteQueryBuilder` with a projection map that restricts which columns can be queried.

Path traversal through content providers is another serious vulnerability, particularly for providers that serve files. If your content provider resolves file paths based on the URI without proper validation, an attacker can use `..` segments to escape the intended directory. For example, a URI like `content://com.example.provider/files/../../../data/data/com.example/databases/users.db` could access your database file through a file-serving provider. Always use `FileProvider` (which handles path traversal prevention automatically) for file sharing instead of implementing your own file-serving content provider. If you must implement a custom file provider, canonicalize paths and verify they fall within the expected directory.

The `grantUriPermissions` attribute enables temporary permission grants that override the provider's normal permission requirements. When you create an intent with `FLAG_GRANT_READ_URI_PERMISSION` or `FLAG_GRANT_WRITE_URI_PERMISSION`, the receiving app gets temporary access to that specific URI without needing the provider's declared permissions. This is the mechanism behind secure file sharing with `FileProvider`. However, if `grantUriPermissions` is set to `true` without a corresponding `<grant-uri-permission>` element that restricts which URIs can be granted, any URI in your provider can be temporarily shared, potentially bypassing your permission model.

#### Common Mistakes

The most critical content provider mistake is SQL injection through unparameterized queries. Always use `selectionArgs` for values and validate column names against an allowlist. Another common mistake is using `<root-path>` in FileProvider configuration, which exposes the entire filesystem to any app that receives a URI permission grant. Also, developers often set `android:grantUriPermissions="true"` without restricting which URIs can be granted, effectively creating an open door that bypasses their permission model.

**Key takeaway:** Content providers are database APIs exposed to other apps. Prevent SQL injection with parameterized queries, restrict access with permissions and URI validation, and use `FileProvider` for secure file sharing.

### Lesson 7.5: Intent Security and Pending Intents

Intents are the primary messaging mechanism in Android, and their security implications extend far beyond simple activity launching. An intent carries an action, data, extras, flags, and a target component — all of which can be manipulated by an attacker. Implicit intents (which specify an action but not a target component) are resolved by the system to find a matching component, and any app can register to handle any action. This means that when you send an implicit intent with sensitive data, you have no control over which app receives it. An attacker can register an activity with matching intent filters and intercept your intent along with all its extras.

Explicit intents (which specify the target component by class name or package) are inherently more secure because the system delivers them only to the specified component. When communicating within your own app, always use explicit intents. When communicating with a specific third-party app, use `setPackage()` to restrict the intent to that app's package. The only scenario where implicit intents are appropriate is when you genuinely want to let the user choose which app handles the action (like sharing content or opening a URL in a browser). Even then, use `Intent.createChooser()` so the user sees exactly which app will receive their data.

```kotlin
// ❌ VULNERABLE: Implicit intent with sensitive data
fun shareReport(context: Context, report: UserReport) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        // Sensitive data sent to an unknown recipient!
        putExtra(Intent.EXTRA_TEXT, report.toJson())
        putExtra("auth_token", getCurrentToken()) // Never do this
    }
    context.startActivity(intent) // Any matching app receives this
}
```

```kotlin
// ✅ SECURE: Explicit intent for internal communication
fun navigateToReport(context: Context, reportId: String) {
    val intent = Intent(context, ReportDetailActivity::class.java).apply {
        putExtra("report_id", reportId)
        // Don't pass sensitive data in extras — retrieve it in the target activity
    }
    context.startActivity(intent)
}

// ✅ SECURE: Chooser for user-initiated sharing with minimal data
fun shareReportSummary(context: Context, summary: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        // Only share the non-sensitive summary, not the full report
        putExtra(Intent.EXTRA_TEXT, summary)
    }
    // Chooser shows the user exactly which app will receive the data
    context.startActivity(
        Intent.createChooser(intent, "Share report summary")
    )
}
```

```kotlin
// PendingIntent security — mutable vs immutable
class NotificationHelper(private val context: Context) {
    fun showNotification(title: String, message: String) {
        // ✅ SECURE: Use FLAG_IMMUTABLE for PendingIntents that shouldn't be modified
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(message)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    // ❌ VULNERABLE: Mutable PendingIntent with implicit base intent
    fun createVulnerableNotification() {
        val intent = Intent() // No target specified!
        // FLAG_MUTABLE allows any app that receives this PendingIntent
        // to fill in the missing fields (component, action, data)
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_MUTABLE // Dangerous with implicit intents!
        )
        // If this PendingIntent is sent to another app (e.g., through a
        // notification service), that app can redirect it to any activity
    }
}
```

```kotlin
// Secure intent result handling
class SecureActivityLauncher(private val activity: ComponentActivity) {
    // Modern approach using Activity Result API
    private val documentPicker = activity.registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        uri?.let { handleSelectedDocument(it) }
    }

    fun pickDocument() {
        documentPicker.launch(arrayOf("application/pdf"))
    }

    private fun handleSelectedDocument(uri: Uri) {
        // Validate the URI before using it
        if (uri.scheme != "content") {
            // Reject file:// URIs — they're deprecated and dangerous
            return
        }

        // Take persistable permission if needed for later access
        try {
            activity.contentResolver.takePersistableUriPermission(
                uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        } catch (e: SecurityException) {
            // Permission not granted as persistable
        }

        // Read the document through ContentResolver — never resolve to a file path
        activity.contentResolver.openInputStream(uri)?.use { stream ->
            processDocument(stream)
        }
    }

    private fun processDocument(stream: InputStream) {
        // Process the document data
    }
}
```

PendingIntents deserve special attention because they carry your app's identity and permissions. When you create a PendingIntent, you're creating a token that allows another app to perform an action as if it were your app, using your app's permissions. This is essential for notifications (the notification service needs to start your activity when the user taps it) and alarms (the alarm service needs to send your broadcast at the scheduled time). But if a PendingIntent is created with `FLAG_MUTABLE` and an implicit base intent, the receiving app can fill in the missing component and redirect the intent to any target, executing the action with your app's identity and permissions.

Android 12 requires that all PendingIntents be explicitly marked as `FLAG_MUTABLE` or `FLAG_IMMUTABLE`. Use `FLAG_IMMUTABLE` by default — it prevents the receiving app from modifying the intent in any way. Only use `FLAG_MUTABLE` when the intent genuinely needs to be modified by the receiver (for example, inline reply actions in notifications where the system needs to add the user's reply text to the intent). When you must use `FLAG_MUTABLE`, always use explicit intents (with a target component specified) as the base intent, so even if the extras are modified, the target can't be changed.

Intent spoofing and intent interception are two sides of the same coin. Intent spoofing occurs when a malicious app sends a crafted intent to your component, pretending to be a legitimate caller. Intent interception occurs when a malicious app registers to receive intents meant for your component. Both attacks exploit the implicit intent resolution system. Protecting against spoofing requires validating the caller's identity (using `getCallingPackage()`, `getCallingUid()`, or signature-level permissions). Protecting against interception requires using explicit intents or restricting delivery with `setPackage()`. For high-sensitivity communication between your own apps, use signature-level permissions that ensure only apps signed with your certificate can participate.

#### Common Mistakes

The most common intent security mistake is passing sensitive data (tokens, passwords, PII) in intent extras for implicit intents. This data is visible to any app that matches the intent filter. Another mistake is using `FLAG_MUTABLE` PendingIntents with implicit base intents, which allows the receiver to redirect the action. Developers also frequently forget to validate the data returned by `onActivityResult()` or the Activity Result API — the returning app can put anything in the result intent, including malicious data.

**Key takeaway:** Use explicit intents for internal communication, `FLAG_IMMUTABLE` PendingIntents by default, and never include sensitive data in implicit intent extras.

### Lesson 7.6: Securing Deep Links and App Links

Deep links allow other apps and websites to navigate directly to specific screens within your app. While they're essential for user experience (sharing specific content, marketing campaigns, email links), they're also a direct input channel from untrusted sources. Every deep link parameter is user-controlled input that must be validated and sanitized before use. An attacker can craft a malicious deep link URL that exploits vulnerabilities in your link handling logic — navigating to administrative screens, passing SQL injection payloads as query parameters, or triggering unintended state changes.

Android supports three types of deep links. **Standard deep links** use custom URI schemes (like `myapp://product/123`) and are declared with intent filters in the manifest. Any app can register any custom scheme, so there's no guarantee that your app is the only one handling your scheme — a malicious app can register the same scheme and intercept links. **Web links** use `http://` or `https://` schemes and show a disambiguation dialog when multiple apps can handle the URL. **App Links** (Android 6+) are verified web links where you prove ownership of the domain by hosting a Digital Asset Links file at `https://your-domain/.well-known/assetlinks.json`. App Links open directly in your app without a disambiguation dialog and cannot be intercepted by other apps, making them the most secure deep linking option.

```kotlin
// ✅ SECURE: Deep link handler with comprehensive validation
class DeepLinkRouter(private val context: Context) {
    // Allowlist of valid deep link patterns
    private val validRoutes = listOf(
        DeepLinkRoute("/product/{id}", "^[a-zA-Z0-9-]{1,36}$"),
        DeepLinkRoute("/category/{slug}", "^[a-z0-9-]{1,50}$"),
        DeepLinkRoute("/user/{id}/profile", "^[0-9]{1,10}$"),
        DeepLinkRoute("/search", null), // query params validated separately
        DeepLinkRoute("/settings", null)
    )

    data class DeepLinkRoute(
        val pattern: String,
        val paramValidation: String? // Regex for path parameters
    )

    fun handleDeepLink(uri: Uri): DeepLinkResult {
        // Step 1: Validate the scheme
        if (uri.scheme !in listOf("https", "myapp")) {
            return DeepLinkResult.Invalid("Unsupported scheme")
        }

        // Step 2: Validate the host for https links
        if (uri.scheme == "https" && uri.host != "example.com") {
            return DeepLinkResult.Invalid("Unsupported host")
        }

        // Step 3: Sanitize the path
        val path = uri.path?.lowercase() ?: return DeepLinkResult.Invalid("No path")
        val sanitizedPath = path.replace(Regex("[^a-z0-9/\\-]"), "")
        if (sanitizedPath != path) {
            return DeepLinkResult.Invalid("Path contains invalid characters")
        }

        // Step 4: Match against allowed routes
        val matchedRoute = matchRoute(sanitizedPath)
            ?: return DeepLinkResult.NotFound

        // Step 5: Extract and validate parameters
        val params = extractParameters(sanitizedPath, matchedRoute)
        if (params == null) {
            return DeepLinkResult.Invalid("Invalid parameters")
        }

        // Step 6: Validate query parameters if present
        val queryParams = validateQueryParams(uri)

        return DeepLinkResult.Success(matchedRoute.pattern, params, queryParams)
    }

    private fun matchRoute(path: String): DeepLinkRoute? {
        return validRoutes.firstOrNull { route ->
            val routeRegex = route.pattern
                .replace(Regex("\\{[^}]+}"), "[^/]+")
            path.matches(Regex("^$routeRegex$"))
        }
    }

    private fun extractParameters(
        path: String,
        route: DeepLinkRoute
    ): Map<String, String>? {
        val paramNames = Regex("\\{([^}]+)}").findAll(route.pattern)
            .map { it.groupValues[1] }.toList()
        val pathSegments = path.split("/").filter { it.isNotEmpty() }
        val routeSegments = route.pattern.split("/").filter { it.isNotEmpty() }

        val params = mutableMapOf<String, String>()
        for (i in routeSegments.indices) {
            if (routeSegments[i].startsWith("{") && i < pathSegments.size) {
                val paramName = routeSegments[i].removeSurrounding("{", "}")
                val paramValue = pathSegments[i]

                // Validate parameter format
                if (route.paramValidation != null &&
                    !paramValue.matches(Regex(route.paramValidation))) {
                    return null
                }
                params[paramName] = paramValue
            }
        }
        return params
    }

    private fun validateQueryParams(uri: Uri): Map<String, String> {
        val safeParams = mutableMapOf<String, String>()
        uri.queryParameterNames.forEach { name ->
            // Only allow known query parameter names
            if (name in listOf("q", "page", "sort", "filter")) {
                val value = uri.getQueryParameter(name) ?: return@forEach
                // Sanitize values
                val sanitized = value.take(200)
                    .replace(Regex("[<>\"';&]"), "")
                safeParams[name] = sanitized
            }
        }
        return safeParams
    }
}

sealed class DeepLinkResult {
    data class Success(
        val route: String,
        val params: Map<String, String>,
        val queryParams: Map<String, String>
    ) : DeepLinkResult()
    data class Invalid(val reason: String) : DeepLinkResult()
    object NotFound : DeepLinkResult()
}
```

```kotlin
// App Links verification — the most secure deep linking approach
// AndroidManifest.xml:
// <activity android:name=".DeepLinkActivity"
//     android:exported="true">
//     <intent-filter android:autoVerify="true">
//         <action android:name="android.intent.action.VIEW" />
//         <category android:name="android.intent.category.DEFAULT" />
//         <category android:name="android.intent.category.BROWSABLE" />
//         <data android:scheme="https"
//             android:host="example.com"
//             android:pathPrefix="/product" />
//     </intent-filter>
// </activity>

// The corresponding assetlinks.json hosted at:
// https://example.com/.well-known/assetlinks.json
// [{
//   "relation": ["delegate_permission/common.handle_all_urls"],
//   "target": {
//     "namespace": "android_app",
//     "package_name": "com.example.app",
//     "sha256_cert_fingerprints": [
//       "AA:BB:CC:DD:..."
//     ]
//   }
// }]
```

```kotlin
// Preventing deep link abuse — rate limiting and validation
class DeepLinkSecurityManager {
    private val recentLinks = mutableListOf<TimestampedLink>()
    private val maxLinksPerMinute = 10

    data class TimestampedLink(val uri: Uri, val timestamp: Long)

    fun shouldAllowDeepLink(uri: Uri): Boolean {
        val now = System.currentTimeMillis()

        // Clean old entries
        recentLinks.removeAll { now - it.timestamp > 60_000 }

        // Rate limit check
        if (recentLinks.size >= maxLinksPerMinute) {
            return false
        }

        // Duplicate check — prevent rapid re-processing of same link
        val isDuplicate = recentLinks.any {
            it.uri == uri && now - it.timestamp < 5_000
        }
        if (isDuplicate) return false

        recentLinks.add(TimestampedLink(uri, now))
        return true
    }
}
```

App Links are the recommended approach for HTTPS deep links because they provide verified ownership. When you add `android:autoVerify="true"` to your intent filter and host the `assetlinks.json` file on your domain, Android verifies at install time that the domain owner has authorized your app to handle those URLs. Once verified, these links open directly in your app without a disambiguation dialog, and no other app can intercept them. This prevents phishing attacks where a malicious app registers the same URL patterns as your legitimate app. The downside is that App Links require HTTPS and a domain you control, so they don't work for custom URI schemes.

Deep link URL parameters are one of the most common injection vectors in Android applications. Developers often extract path segments or query parameters and use them directly in database queries, API calls, or WebView URLs without validation. A product ID extracted from a deep link might be used in a SQL query, enabling SQL injection. A redirect URL from a query parameter might be loaded in a WebView, enabling XSS. A page number might be passed to an API, and a negative value might cause unexpected behavior. Treat every deep link parameter as untrusted input and validate it against expected formats before use.

Testing deep link security should be part of your regular security testing. Use `adb shell am start` to send crafted deep links to your app and verify that invalid inputs are rejected gracefully. Test boundary cases: empty parameters, extremely long strings, special characters, SQL injection payloads, JavaScript payloads, and URL-encoded sequences. Verify that your app doesn't crash, doesn't display untrusted content, and doesn't execute unintended actions. Automated security scanners can generate common attack payloads, but manual testing with knowledge of your app's specific deep link handling is essential for thorough coverage.

#### Common Mistakes

The most common deep link mistake is using custom URI schemes instead of verified App Links. Custom schemes provide no ownership verification and can be hijacked by malicious apps. Another mistake is directly using deep link parameters in SQL queries, WebView URLs, or API calls without validation. Developers also frequently forget that deep links can arrive at any point in the app's lifecycle — including when the user is not authenticated — and need to handle the authentication flow before processing the link.

**Key takeaway:** Use verified App Links instead of custom URI schemes. Validate and sanitize every deep link parameter. Never use deep link data directly in queries, WebViews, or API calls without validation.

### Quiz: App Component Security

**Question 1:** Why are implicit intents dangerous for sensitive data?

A) Implicit intents are slower than explicit intents
B) Any app with a matching intent filter can receive the intent and read its extras
C) Implicit intents can only carry string data
D) Implicit intents are not supported on Android 12+

**Answer:** B — Implicit intents are delivered to any component with a matching intent filter. A malicious app can register matching filters and receive intents containing sensitive data.

**Question 2:** What is the difference between `checkCallingPermission()` and `checkCallingOrSelfPermission()`?

A) They are identical in behavior
B) `checkCallingPermission()` only works with runtime permissions
C) `checkCallingOrSelfPermission()` also checks your own app's permissions, making it useless for IPC access control
D) `checkCallingPermission()` is deprecated

**Answer:** C — `checkCallingOrSelfPermission()` always returns GRANTED when called within your own process because it checks your own permissions too. For IPC access control, always use `checkCallingPermission()`.

**Question 3:** Why should PendingIntents use FLAG_IMMUTABLE by default?

A) FLAG_IMMUTABLE makes PendingIntents faster
B) It prevents the receiving app from modifying the intent's target, action, or data
C) FLAG_IMMUTABLE is required on all Android versions
D) FLAG_MUTABLE is deprecated

**Answer:** B — FLAG_IMMUTABLE prevents any modification to the PendingIntent, ensuring the action is performed exactly as you specified. FLAG_MUTABLE should only be used when the receiver needs to add data (like inline reply text).

**Question 4:** What makes App Links more secure than custom URI scheme deep links?

A) App Links are faster to process
B) App Links require domain ownership verification, preventing other apps from intercepting them
C) App Links encrypt the URL data
D) App Links only work on HTTPS, which encrypts data in transit

**Answer:** B — App Links require hosting a Digital Asset Links file on your domain, proving ownership. Once verified, links open directly in your app and cannot be intercepted by other apps.

**Question 5:** How do you prevent SQL injection in a content provider?

A) Set `android:exported="false"` on the provider
B) Use parameterized queries with `selectionArgs` and validate column names against an allowlist
C) Encrypt the database
D) Use Room instead of raw SQLite

**Answer:** B — Parameterized queries prevent SQL injection by separating the query structure from the data values. Validating column names against an allowlist prevents the caller from querying sensitive columns.

### Coding Challenge: Secure Component Communication Framework

Build a `SecureComponentRouter` that provides safe inter-component communication within your app. Requirements:

1. Type-safe intent building with compile-time parameter validation
2. Deep link routing with parameter validation and sanitization
3. Permission-checked service binding with caller verification
4. Secure broadcast sending with package restriction and signing verification

```kotlin
class SecureComponentRouter(private val context: Context) {
    // Type-safe navigation with sealed class destinations
    sealed class Destination {
        data class ProductDetail(val productId: String) : Destination() {
            init {
                require(productId.matches(Regex("^[a-zA-Z0-9-]{1,36}$"))) {
                    "Invalid product ID format"
                }
            }
        }
        data class UserProfile(val userId: Long) : Destination() {
            init {
                require(userId > 0) { "Invalid user ID" }
            }
        }
        object Settings : Destination()
        object Home : Destination()
    }

    fun navigateTo(destination: Destination) {
        val intent = when (destination) {
            is Destination.ProductDetail -> {
                Intent(context, ProductDetailActivity::class.java).apply {
                    putExtra("product_id", destination.productId)
                }
            }
            is Destination.UserProfile -> {
                Intent(context, UserProfileActivity::class.java).apply {
                    putExtra("user_id", destination.userId)
                }
            }
            is Destination.Settings -> Intent(context, SettingsActivity::class.java)
            is Destination.Home -> Intent(context, HomeActivity::class.java)
        }
        // Always use explicit intents for internal navigation
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        context.startActivity(intent)
    }

    // Deep link routing with validation
    fun handleDeepLink(uri: Uri): Boolean {
        val destination = when {
            uri.pathSegments.firstOrNull() == "product" -> {
                val id = uri.pathSegments.getOrNull(1) ?: return false
                try {
                    Destination.ProductDetail(id)
                } catch (e: IllegalArgumentException) {
                    return false
                }
            }
            uri.pathSegments.firstOrNull() == "profile" -> {
                val id = uri.pathSegments.getOrNull(1)?.toLongOrNull()
                    ?: return false
                try {
                    Destination.UserProfile(id)
                } catch (e: IllegalArgumentException) {
                    return false
                }
            }
            uri.pathSegments.firstOrNull() == "settings" -> Destination.Settings
            else -> return false
        }
        navigateTo(destination)
        return true
    }

    // Secure broadcast with package restriction
    fun sendSecureBroadcast(action: String, data: Bundle) {
        val intent = Intent(action).apply {
            setPackage(context.packageName) // Restrict to our app
            putExtras(data)
        }
        context.sendBroadcast(
            intent,
            "${context.packageName}.permission.INTERNAL_BROADCAST"
        )
    }

    // Permission-verified service binding
    fun <T : Service> bindSecureService(
        serviceClass: Class<T>,
        connection: ServiceConnection,
        flags: Int = Context.BIND_AUTO_CREATE
    ): Boolean {
        val intent = Intent(context, serviceClass)
        return context.bindService(intent, connection, flags)
    }
}
```

This challenge tests your ability to build a secure communication layer that eliminates the most common component security vulnerabilities: implicit intent data leakage, unvalidated deep link parameters, and unrestricted broadcast delivery.

---


## Module 8: Privacy Best Practices

### Lesson 8.1: Data Minimization Principles

Privacy-first engineering begins with a fundamental question: do you actually need this data? Data minimization is not just a compliance checkbox — it is an architectural principle that reduces your attack surface, simplifies your codebase, and builds genuine user trust. Every piece of personal data you collect becomes a liability that you must protect, audit, and eventually delete.

The principle of data minimization states that you should collect only the data strictly necessary for the specific functionality the user is engaging with. If you are building a weather app, you need the user's location — but you do not need their contacts, phone number, or browsing history. This sounds obvious, but in practice, teams routinely collect data "just in case" or because an analytics SDK vacuums up everything by default.

Consider how data flows through your application. When a user signs up, do you need their full date of birth, or just whether they are over 18? When you log API requests for debugging, are you including authentication tokens in the logs? When you cache search results, are you persisting them indefinitely? Each of these decisions has privacy implications that compound over time.

```kotlin
// Bad: collecting unnecessary data
data class UserRegistration(
    val email: String,
    val fullName: String,
    val dateOfBirth: LocalDate,
    val phoneNumber: String,
    val address: String,
    val gender: String,
    val occupation: String
)

// Good: collect only what you need
data class UserRegistration(
    val email: String,
    val displayName: String,
    val isOver18: Boolean
)
```

A practical approach to data minimization involves conducting a data audit across your entire application. Map every piece of personal data you collect, where it is stored, who has access, how long it is retained, and whether it is transmitted to third parties. This audit often reveals surprising findings — analytics events containing user IDs in URLs, crash reports including email addresses, or cached responses containing full user profiles when only a name was needed.

Data minimization also applies to third-party SDKs. Many analytics, advertising, and social media SDKs collect device identifiers, installed apps, and behavioral data without explicit developer awareness. Before integrating any SDK, review its data collection practices and configure it to collect only what you need. Some SDKs allow you to disable specific collection features, while others are all-or-nothing — in the latter case, consider whether the SDK provides enough value to justify its data appetite.

```kotlin
class PrivacyAwareAnalytics(
    private val analytics: AnalyticsProvider
) {
    fun trackScreenView(screenName: String) {
        // Only send screen name, no user identifiers
        analytics.logEvent("screen_view", bundleOf(
            "screen_name" to screenName
            // Do NOT include: user_id, device_id, location
        ))
    }

    fun trackPurchase(amount: Double, currency: String) {
        // Send aggregated purchase data, not item-level details
        analytics.logEvent("purchase", bundleOf(
            "value" to amount,
            "currency" to currency
            // Do NOT include: item names, user payment method
        ))
    }

    fun trackError(errorType: String) {
        // Categorize errors without including user context
        analytics.logEvent("error", bundleOf(
            "error_type" to errorType
            // Do NOT include: stack traces with user data, request bodies
        ))
    }
}
```

**Common Mistakes**

The most frequent mistake is logging personal data. Developers add logging statements during development that include user emails, tokens, or IDs, and these statements survive into production builds. Another common mistake is using stable device identifiers like ANDROID_ID or IMEI for analytics when a randomly generated, resettable identifier would suffice. A third mistake is transmitting full user profiles to screens or components that only need a username — this over-fetching creates unnecessary exposure if any part of the chain has a vulnerability.

**Key takeaway:** Collect only the data you need, audit what you already collect, and treat every piece of personal data as a liability that increases your attack surface and compliance burden.

### Lesson 8.2: Runtime Permissions and User Consent

Android's runtime permission system is your primary mechanism for obtaining user consent for sensitive data access. Since Android 6.0, dangerous permissions must be requested at runtime with clear context about why the permission is needed. Since Android 11, permissions can be auto-revoked for unused apps, and since Android 12, approximate location is available as an alternative to precise location. Understanding and properly implementing this system is critical for both user trust and Play Store compliance.

The key principle behind runtime permissions is contextual consent — the user should understand exactly why your app needs a permission at the moment you request it. Requesting camera permission when the user taps a "Take Photo" button makes perfect sense. Requesting camera permission at app launch with no context feels invasive. This contextual approach requires careful UX design where permission requests are triggered by user actions rather than app lifecycle events.

```kotlin
class PermissionHandler(
    private val activity: ComponentActivity
) {
    private val cameraPermissionLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            onCameraPermissionGranted()
        } else {
            onCameraPermissionDenied()
        }
    }

    fun requestCameraForPhoto() {
        when {
            ContextCompat.checkSelfPermission(
                activity, Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED -> {
                onCameraPermissionGranted()
            }
            activity.shouldShowRequestPermissionRationale(
                Manifest.permission.CAMERA
            ) -> {
                // User previously denied — show educational UI
                showCameraRationale {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                }
            }
            else -> {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    private fun showCameraRationale(onProceed: () -> Unit) {
        MaterialAlertDialogBuilder(activity)
            .setTitle("Camera Permission Needed")
            .setMessage("We need camera access to take a profile photo. Your photos are stored locally and never uploaded without your explicit action.")
            .setPositiveButton("Grant") { _, _ -> onProceed() }
            .setNegativeButton("Not Now", null)
            .show()
    }

    private fun onCameraPermissionGranted() {
        // Launch camera
    }

    private fun onCameraPermissionDenied() {
        // Gracefully degrade — offer file picker alternative
    }
}
```

Always provide graceful degradation when a permission is denied. Your app should never crash or become unusable because a user declined a permission. If camera permission is denied, offer a file picker. If location permission is denied, let the user manually enter their city. If notification permission is denied (Android 13+), explain what they will miss but do not block app functionality.

For location permissions specifically, Android 12 introduced the distinction between approximate and precise location. Many use cases — weather, news, restaurant discovery — work perfectly fine with approximate location. Only request precise location when your feature genuinely requires it, such as turn-by-turn navigation or finding nearby Bluetooth devices.

```kotlin
class LocationPermissionManager(private val activity: ComponentActivity) {

    // Request approximate location first
    private val approximateLocationLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            onApproximateLocationGranted()
        }
    }

    // Only upgrade to precise if truly needed
    private val preciseLocationLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            onPreciseLocationGranted()
        } else {
            // Fall back to approximate — still functional
            onApproximateLocationGranted()
        }
    }

    fun requestLocationForWeather() {
        // Approximate is sufficient for weather
        approximateLocationLauncher.launch(
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
    }

    fun requestLocationForNavigation() {
        // Navigation genuinely needs precise
        preciseLocationLauncher.launch(
            Manifest.permission.ACCESS_FINE_LOCATION
        )
    }

    private fun onApproximateLocationGranted() { /* city-level features */ }
    private fun onPreciseLocationGranted() { /* precise features */ }
}
```

**Common Mistakes**

Requesting all permissions at app launch is the most damaging pattern — it overwhelms users and often results in blanket denials. Another mistake is not handling the "Don't ask again" state — once a user checks this box, `shouldShowRequestPermissionRationale` returns false and you must direct them to app settings. A third mistake is not testing the revoked permission flow — Android 11+ auto-revokes permissions for unused apps, and your app must handle this gracefully on next launch.

**Key takeaway:** Request permissions contextually when the user takes an action that requires them, always provide a rationale for previously denied permissions, and design graceful degradation paths for every permission your app uses.

### Lesson 8.3: Scoped Storage and File Access

Android 10 introduced scoped storage, fundamentally changing how apps access files on the device. Under scoped storage, apps can freely read and write to their own app-specific directories without any permissions, but accessing shared media or files created by other apps requires the MediaStore API or the Storage Access Framework. This change eliminated the broad file system access that apps previously enjoyed, significantly reducing the risk of data leakage between apps.

App-specific storage is divided into internal storage and external app-specific storage. Internal storage (`context.filesDir`, `context.cacheDir`) is always private to your app and is deleted when the app is uninstalled. External app-specific storage (`context.getExternalFilesDir()`) is also private to your app on Android 10+ but is accessible via USB file browsers. Neither requires any permissions.

```kotlin
class ScopedStorageManager(private val context: Context) {

    // No permissions needed for app-specific storage
    fun saveUserPreferences(data: String) {
        val file = File(context.filesDir, "preferences.json")
        file.writeText(data)
    }

    fun saveCachedImage(bitmap: Bitmap, name: String) {
        val file = File(context.cacheDir, "$name.webp")
        file.outputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, 80, out)
        }
    }

    // For large files that should survive cache clearing
    fun saveDownloadedDocument(data: ByteArray, filename: String) {
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)
        val file = File(dir, filename)
        file.writeBytes(data)
    }
}
```

When your app needs to save media that should be visible to other apps — photos taken by your camera feature, documents exported by the user — use the MediaStore API. This API provides structured access to shared media collections (Images, Video, Audio, Downloads) and handles the underlying file management for you.

```kotlin
class MediaStoreHelper(private val context: Context) {

    fun savePhotoToGallery(bitmap: Bitmap, displayName: String): Uri? {
        val contentValues = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "$displayName.jpg")
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/MyApp")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }

        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)

        uri?.let { imageUri ->
            resolver.openOutputStream(imageUri)?.use { stream ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(imageUri, contentValues, null, null)
            }
        }

        return uri
    }
}
```

For accessing files from other apps — letting the user pick a document, open a PDF, or select photos — use the Storage Access Framework (SAF). SAF provides a system-managed file picker that gives your app temporary access to the selected file without requiring broad storage permissions.

```kotlin
class DocumentPickerManager(private val activity: ComponentActivity) {

    private val openDocumentLauncher = activity.registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let { processSelectedDocument(it) }
    }

    fun pickPdfDocument() {
        openDocumentLauncher.launch(arrayOf("application/pdf"))
    }

    private fun processSelectedDocument(uri: Uri) {
        // Take persistable permission for long-term access
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
        activity.contentResolver.takePersistableUriPermission(uri, flags)

        // Read the document
        activity.contentResolver.openInputStream(uri)?.use { stream ->
            val content = stream.readBytes()
            // Process document
        }
    }
}
```

**Common Mistakes**

The biggest mistake is using `MANAGE_EXTERNAL_STORAGE` permission as a workaround for scoped storage. This permission triggers extra Play Store review and is only approved for file manager apps, antivirus, and backup apps. Another mistake is not using `IS_PENDING` when writing media files, which can cause partial files to appear in the gallery. A third mistake is forgetting to call `takePersistableUriPermission` for SAF-opened files that the user expects to access again later.

**Key takeaway:** Use app-specific directories for private data (no permissions needed), MediaStore for shared media, and Storage Access Framework for user-selected files — never request broad file system access when scoped alternatives exist.

### Lesson 8.4: Data Deletion and Right to Erasure

Users have a fundamental right to delete their data, and regulations like GDPR, CCPA, and others formalize this as the "right to erasure." Your app must provide a clear mechanism for users to delete their account and all associated data, both locally on the device and on your servers. Since Android 12, Google Play requires apps with account creation to also provide an in-app account deletion flow.

Implementing proper data deletion requires understanding every location where user data resides. On the device, this includes databases (Room, SQLite), SharedPreferences, files in internal and external storage, cached images, WebView data, and any data stored by third-party SDKs. On the server side, this includes your primary database, backup databases, CDN-cached content, analytics data, log files, and any data shared with third-party services.

```kotlin
class DataDeletionManager(
    private val context: Context,
    private val database: AppDatabase,
    private val apiService: ApiService,
    private val analyticsProvider: AnalyticsProvider
) {
    suspend fun deleteAllUserData(userId: String): Result<Unit> {
        return try {
            // 1. Request server-side deletion first
            apiService.requestAccountDeletion(userId)

            // 2. Clear local database
            database.clearAllTables()

            // 3. Clear SharedPreferences
            val prefs = context.getSharedPreferences("user_prefs", Context.MODE_PRIVATE)
            prefs.edit().clear().apply()

            // Also clear encrypted preferences
            val encryptedPrefs = EncryptedSharedPreferences.create(
                context, "secure_prefs",
                MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            encryptedPrefs.edit().clear().apply()

            // 4. Clear app-specific files
            context.filesDir.deleteRecursively()
            context.cacheDir.deleteRecursively()
            context.getExternalFilesDir(null)?.deleteRecursively()

            // 5. Clear WebView data
            CookieManager.getInstance().removeAllCookies(null)
            WebStorage.getInstance().deleteAllData()

            // 6. Reset analytics identity
            analyticsProvider.resetUser()

            // 7. Clear any KeyStore entries
            val keyStore = KeyStore.getInstance("AndroidKeyStore")
            keyStore.load(null)
            keyStore.aliases().toList().forEach { alias ->
                keyStore.deleteEntry(alias)
            }

            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

The deletion process must be thorough. Many apps clear their main database but forget about cached images in Glide or Coil, cookies stored by WebView, or tokens stored in the KeyStore. Create a comprehensive deletion checklist and test it by inspecting the device file system after deletion to ensure nothing remains.

For server-side deletion, consider implementing a grace period (e.g., 30 days) during which the account is deactivated but data is retained, allowing users to change their mind. After the grace period, permanently delete all data. Communicate this timeline clearly to the user.

```kotlin
class AccountDeletionFlow(
    private val viewModel: AccountViewModel
) {
    sealed class DeletionState {
        object Idle : DeletionState()
        object ConfirmationRequired : DeletionState()
        data class GracePeriod(val daysRemaining: Int) : DeletionState()
        object Deleting : DeletionState()
        object Completed : DeletionState()
        data class Error(val message: String) : DeletionState()
    }

    fun initiateDeletion() {
        // Show confirmation with clear explanation
        viewModel.updateState(DeletionState.ConfirmationRequired)
    }

    suspend fun confirmDeletion() {
        viewModel.updateState(DeletionState.Deleting)

        when (val result = viewModel.deleteAccount()) {
            is Result.Success -> {
                viewModel.updateState(
                    DeletionState.GracePeriod(daysRemaining = 30)
                )
            }
            is Result.Failure -> {
                viewModel.updateState(
                    DeletionState.Error("Failed to delete account. Please try again.")
                )
            }
        }
    }
}
```

**Common Mistakes**

Forgetting to delete data from third-party SDKs is extremely common — Firebase, analytics platforms, and crash reporters all maintain their own user data stores. Another mistake is not handling the case where server-side deletion fails but local data was already cleared, leaving the user in a broken state. Always delete server data first, confirm success, then clear local data. A third mistake is not testing deletion with a real account — walk through the entire flow and verify with device file inspection tools that no personal data remains.

**Key takeaway:** Implement comprehensive data deletion that covers every storage location — databases, preferences, files, caches, WebView data, KeyStore entries, and third-party SDKs — with server deletion completing before local cleanup begins.

### Lesson 8.5: Privacy-Compliant Analytics and Tracking

Analytics are essential for understanding how users interact with your app, but they must be implemented with privacy at the forefront. The shift from device-level tracking to privacy-preserving analytics is one of the most significant changes in mobile development. Modern privacy regulations and platform policies require explicit consent for tracking, purpose limitation for collected data, and transparency about data processing.

The first step is replacing stable device identifiers with privacy-friendly alternatives. ANDROID_ID, IMEI, and MAC address are all considered personal data under GDPR because they can be used to track individuals across apps and sessions. Instead, use app-scoped identifiers that reset when the user reinstalls the app or clears data.

```kotlin
class PrivacyFriendlyIdentifier(private val context: Context) {

    fun getAnalyticsId(): String {
        val prefs = context.getSharedPreferences("analytics", Context.MODE_PRIVATE)
        var id = prefs.getString("analytics_id", null)

        if (id == null) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString("analytics_id", id).apply()
        }

        return id
    }

    fun resetAnalyticsId() {
        val prefs = context.getSharedPreferences("analytics", Context.MODE_PRIVATE)
        prefs.edit().remove("analytics_id").apply()
    }
}
```

Implement a consent management system that allows users to choose which categories of analytics they are comfortable with. At minimum, distinguish between essential analytics (crash reporting, critical error tracking) and non-essential analytics (behavioral tracking, A/B testing, engagement metrics). Present this choice clearly and respect it throughout the app.

```kotlin
enum class ConsentCategory {
    ESSENTIAL,       // Crash reports, critical errors
    ANALYTICS,       // Usage patterns, screen views
    PERSONALIZATION  // Recommendations, A/B tests
}

class ConsentManager(private val context: Context) {

    private val prefs = context.getSharedPreferences("consent", Context.MODE_PRIVATE)

    fun hasConsent(category: ConsentCategory): Boolean {
        return when (category) {
            ConsentCategory.ESSENTIAL -> true // Always allowed
            else -> prefs.getBoolean(category.name, false)
        }
    }

    fun updateConsent(category: ConsentCategory, granted: Boolean) {
        prefs.edit().putBoolean(category.name, granted).apply()

        if (!granted) {
            // Immediately stop sending data in this category
            disableTracking(category)
        }
    }

    private fun disableTracking(category: ConsentCategory) {
        when (category) {
            ConsentCategory.ANALYTICS -> {
                // Disable analytics SDK collection
            }
            ConsentCategory.PERSONALIZATION -> {
                // Disable recommendation engine
            }
            else -> { /* Essential cannot be disabled */ }
        }
    }
}

class ConsentAwareAnalytics(
    private val consentManager: ConsentManager,
    private val analytics: AnalyticsProvider
) {
    fun trackScreenView(screenName: String) {
        if (consentManager.hasConsent(ConsentCategory.ANALYTICS)) {
            analytics.logEvent("screen_view", bundleOf("screen" to screenName))
        }
    }

    fun trackCrash(throwable: Throwable) {
        // Essential — always allowed
        analytics.logCrash(throwable)
    }

    fun trackAbTestExposure(experimentId: String, variant: String) {
        if (consentManager.hasConsent(ConsentCategory.PERSONALIZATION)) {
            analytics.logEvent("ab_exposure", bundleOf(
                "experiment" to experimentId,
                "variant" to variant
            ))
        }
    }
}
```

Consider on-device analytics processing where possible. Instead of sending every user action to your servers, aggregate data locally and send only summaries. For example, instead of tracking every screen transition, send daily screen view counts. This reduces the privacy surface while still providing actionable insights.

**Common Mistakes**

The most common mistake is initializing analytics SDKs before checking consent — many SDKs start collecting data immediately upon initialization. Initialize them only after consent is confirmed. Another mistake is using Google Advertising ID without proper disclosure and consent. A third mistake is not providing a way for users to change their consent choices after the initial prompt — consent management must be accessible from app settings at all times.

**Key takeaway:** Replace device identifiers with app-scoped alternatives, implement granular consent management that distinguishes essential from non-essential tracking, and respect user choices immediately by gating all analytics calls behind consent checks.

### Quiz: Privacy Best Practices

#### Which approach follows the data minimization principle?

- ❌ Collect all available user data and filter server-side
- ❌ Request all permissions at app launch for convenience
- ✅ Collect only the specific data needed for each feature
- ❌ Store raw data and apply privacy filters before display

> **Explanation:** Data minimization means collecting only the data strictly necessary for the specific functionality the user is engaging with. Server-side filtering still means you collected unnecessary data. The principle applies at the point of collection, not processing.

#### What should happen when a user denies a permission?

- ❌ Show the permission dialog again immediately
- ❌ Disable the entire app until permission is granted
- ✅ Gracefully degrade and offer alternative functionality
- ❌ Use a workaround to access the data without permission

> **Explanation:** Graceful degradation is essential — if camera is denied, offer file picker; if location is denied, let users enter their city manually. Apps should never become unusable due to a denied permission, and workarounds violate platform policy.

#### When implementing account deletion, what order should operations follow?

- ❌ Delete local data first, then request server deletion
- ✅ Delete server data first, confirm success, then clear local data
- ❌ Delete both simultaneously in parallel
- ❌ Only delete local data; server data expires naturally

> **Explanation:** Server deletion should complete first because if it fails, the user still has their local data and can retry. If you delete local data first and server deletion fails, the user is in a broken state with no local data but server data still existing.

### Coding Challenge: Privacy-Compliant User Data Manager

Build a comprehensive privacy manager that handles consent, data minimization, and deletion for an Android app. The manager should support granular consent categories, provide privacy-friendly analytics identifiers, and implement complete data deletion.

#### Solution

```kotlin
class PrivacyManager(
    private val context: Context,
    private val database: AppDatabase,
    private val apiService: ApiService
) {
    enum class ConsentCategory { ESSENTIAL, ANALYTICS, PERSONALIZATION }

    private val consentPrefs = context.getSharedPreferences("consent", Context.MODE_PRIVATE)
    private val analyticsPrefs = context.getSharedPreferences("analytics", Context.MODE_PRIVATE)

    fun hasConsent(category: ConsentCategory): Boolean {
        return when (category) {
            ConsentCategory.ESSENTIAL -> true
            else -> consentPrefs.getBoolean(category.name, false)
        }
    }

    fun updateConsent(category: ConsentCategory, granted: Boolean) {
        consentPrefs.edit().putBoolean(category.name, granted).apply()
    }

    fun getPrivacyFriendlyId(): String {
        return analyticsPrefs.getString("privacy_id", null) ?: run {
            val newId = UUID.randomUUID().toString()
            analyticsPrefs.edit().putString("privacy_id", newId).apply()
            newId
        }
    }

    suspend fun deleteAllUserData(userId: String): Result<Unit> {
        return try {
            // Server first
            apiService.requestAccountDeletion(userId)

            // Local cleanup
            database.clearAllTables()
            consentPrefs.edit().clear().apply()
            analyticsPrefs.edit().clear().apply()
            context.filesDir.deleteRecursively()
            context.cacheDir.deleteRecursively()
            context.getExternalFilesDir(null)?.deleteRecursively()

            // KeyStore cleanup
            val keyStore = KeyStore.getInstance("AndroidKeyStore")
            keyStore.load(null)
            keyStore.aliases().toList().forEach { keyStore.deleteEntry(it) }

            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

---

## Module 9: Security Testing and Auditing

### Lesson 9.1: Security Audit Checklist

A security audit is a systematic review of your application's security posture. Unlike functional testing, security testing focuses on what should NOT happen — data should not leak, keys should not be extractable, components should not be accessible to malicious apps. A comprehensive audit checklist ensures you cover all attack surfaces consistently across releases.

Your audit should begin with static analysis — examining the code, configuration, and build artifacts without running the app. Check that your `AndroidManifest.xml` does not export components unnecessarily, that `android:debuggable` is false in release builds, that `android:allowBackup` is set to false or configured with proper backup rules, and that network security configuration is present and restrictive.

```kotlin
// Build configuration security checks
// build.gradle.kts
android {
    buildTypes {
        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    // Ensure test code never ships in release
    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/*.kotlin_module"
            )
        }
    }
}
```

Dynamic analysis involves running the app and observing its behavior. Use a proxy like Charles or mitmproxy to inspect network traffic and verify that certificate pinning is enforced, that sensitive data is not sent in URL parameters, and that API responses do not contain unnecessary personal data. Check that the app behaves correctly when the proxy is detected — it should refuse to connect rather than silently downgrading security.

Create a repeatable audit process that runs before every major release. Document each check, its expected result, and the actual result. Over time, automate as many checks as possible using CI/CD integration.

```kotlin
// Automated security checks you can add to your test suite
class SecurityAuditTests {

    @Test
    fun `release build is not debuggable`() {
        val appInfo = InstrumentationRegistry.getInstrumentation()
            .targetContext.applicationInfo
        val isDebuggable = appInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        assertFalse("Release build must not be debuggable", isDebuggable)
    }

    @Test
    fun `no exported activities without intent filters`() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val packageInfo = context.packageManager.getPackageInfo(
            context.packageName,
            PackageManager.GET_ACTIVITIES
        )
        packageInfo.activities?.forEach { activityInfo ->
            if (activityInfo.exported) {
                // Exported activities should have intent filters or explicit justification
                assertNotNull(
                    "Exported activity ${activityInfo.name} should be documented",
                    activityInfo.metaData
                )
            }
        }
    }

    @Test
    fun `network security config exists`() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val appInfo = context.applicationInfo
        assertNotEquals(
            "Network security config must be set",
            0,
            appInfo.networkSecurityConfigRes
        )
    }
}
```

A critical part of the audit is reviewing third-party dependencies for known vulnerabilities. Use tools like OWASP Dependency-Check or GitHub's Dependabot to scan your dependency tree. A single vulnerable library can undermine all of your other security measures.

**Common Mistakes**

The biggest mistake is treating security auditing as a one-time event rather than a continuous process. Security is not a state — it is a practice. Another mistake is only auditing your own code while ignoring third-party SDKs and libraries, which often have their own vulnerabilities. A third mistake is not testing on real devices — emulators may behave differently regarding hardware-backed security features like StrongBox, biometrics, and hardware attestation.

**Key takeaway:** Build a repeatable security audit checklist that covers manifest configuration, network security, data storage, component exposure, and third-party dependencies, and run it before every major release with both automated tests and manual verification.

### Lesson 9.2: APK Decompilation and Reverse Engineering Defense

Understanding how attackers reverse-engineer your app is essential for defending against it. Every APK you publish can be decompiled back to readable code using freely available tools. Attackers use tools like jadx, apktool, and dex2jar to extract your source code, read hardcoded strings, discover API endpoints, extract encryption keys, and understand your business logic. Your defense strategy must assume that your code will be read.

The decompilation process typically follows these steps: the attacker downloads your APK from the Play Store or a mirror site, runs `apktool d app.apk` to extract resources and smali code, and runs `jadx app.apk` to decompile the DEX bytecode back to readable Java/Kotlin code. The result is surprisingly readable — class names, method names, string constants, and control flow are all visible unless you have applied proper obfuscation.

R8 (the default Android code shrinker and obfuscator) is your first line of defense. When properly configured, R8 renames classes, methods, and fields to single-letter names, removes unused code, and optimizes the remaining code. However, the default R8 configuration is minimal — you need to customize it for security-critical code.

```kotlin
// proguard-rules.pro — security-focused configuration
# Aggressive obfuscation
-repackageclasses ''
-allowaccessmodification
-overloadaggressively

# Obfuscate entire package structure
-flattenpackagehierarchy

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
}

# Remove Timber logging
-assumenosideeffects class timber.log.Timber {
    public static void v(...);
    public static void d(...);
    public static void i(...);
    public static void w(...);
}

# Keep only what is strictly necessary
-keep class com.myapp.api.models.** { *; }
-keep class * extends androidx.room.RoomDatabase
```

Beyond R8, consider additional obfuscation layers for security-critical code. String encryption prevents attackers from searching for API URLs, encryption keys, or business logic indicators in the decompiled code. Control flow obfuscation makes the code harder to follow even after decompilation.

```kotlin
// Example: Runtime string construction to prevent static string extraction
object ApiConfig {
    // Bad: hardcoded string visible in decompiled code
    // const val BASE_URL = "https://api.myapp.com/v2/"

    // Better: construct at runtime
    fun getBaseUrl(): String {
        val parts = listOf("https://", "api", ".", "myapp", ".", "com", "/v2/")
        return parts.joinToString("")
    }

    // Even better: load from native code
    external fun getApiEndpoint(): String

    init {
        System.loadLibrary("config")
    }
}
```

Always verify the integrity of your APK at runtime to detect tampering. Attackers often modify apps to remove license checks, inject ads, or add malware, then redistribute the modified APK.

```kotlin
object IntegrityChecker {
    fun verifyAppSignature(context: Context, expectedSignature: String): Boolean {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNATURES
                )
            }

            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION")
                packageInfo.signatures
            }

            signatures?.any { signature ->
                val digest = MessageDigest.getInstance("SHA-256")
                val hash = digest.digest(signature.toByteArray())
                val hexHash = hash.joinToString("") { "%02x".format(it) }
                hexHash == expectedSignature
            } ?: false
        } catch (e: Exception) {
            false
        }
    }

    fun isInstalledFromPlayStore(context: Context): Boolean {
        val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(context.packageName)
        }
        return installer == "com.android.vending"
    }
}
```

**Common Mistakes**

The most critical mistake is assuming obfuscation makes your code unreadable — it merely raises the bar. A determined attacker with jadx and patience can still understand your logic. Never rely on obfuscation alone for secrets. Another mistake is keeping ProGuard mapping files in insecure locations — these files map obfuscated names back to original names and are gold for attackers. A third mistake is not testing your release build for functionality after aggressive obfuscation — over-obfuscation can break reflection-based libraries like Retrofit, Room, and Hilt.

**Key takeaway:** Assume your code will be decompiled and design accordingly — use R8 with aggressive obfuscation, never hardcode secrets, implement runtime integrity checks, and store truly sensitive logic server-side where it cannot be extracted.

### Lesson 9.3: Penetration Testing with Frida

Frida is a dynamic instrumentation toolkit that allows attackers (and security testers) to inject JavaScript into running applications to modify behavior, bypass security checks, and extract data. Understanding how Frida works is essential for testing your own defenses and understanding what a sophisticated attacker can do to your app.

Frida works by injecting a JavaScript engine into your running process. The attacker can then hook any Java method, modify its arguments or return value, and observe the data flowing through your app. For example, an attacker can hook your certificate pinning implementation to return true regardless of the certificate, or hook your root detection method to always report a non-rooted device.

From a defensive perspective, you should test your own app with Frida to verify that your security measures are robust. Set up a test environment with Frida and try to bypass your own protections — if you can do it in an afternoon, an attacker can too.

```kotlin
// Example: What an attacker can bypass with Frida

// Your root detection (can be hooked to return false)
fun isDeviceRooted(): Boolean {
    val paths = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su")
    return paths.any { File(it).exists() }
}

// More resilient: multiple layered checks
fun isDeviceCompromised(): Boolean {
    val checks = listOf(
        { checkRootBinaries() },
        { checkBuildTags() },
        { checkRootManagementApps() },
        { checkDangerousProps() },
        { checkRWPaths() },
        { checkSuExists() },
        { checkFridaPresence() }
    )

    // Require multiple checks to pass — hooking one is not enough
    val failedChecks = checks.count { check ->
        try { check() } catch (e: Exception) { true }
    }

    return failedChecks >= 2
}

private fun checkFridaPresence(): Boolean {
    // Check for Frida server port
    try {
        val socket = java.net.Socket()
        socket.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 100)
        socket.close()
        return true // Frida default port is open
    } catch (e: Exception) {
        // Port not open — good
    }

    // Check for Frida libraries in memory
    val mapsFile = File("/proc/self/maps")
    if (mapsFile.exists()) {
        val content = mapsFile.readText()
        if (content.contains("frida") || content.contains("gadget")) {
            return true
        }
    }

    return false
}
```

To make Frida-based attacks harder, implement integrity checks at multiple layers, use native code for critical security logic (harder to hook than Java/Kotlin), and add timing checks that detect the overhead introduced by instrumentation frameworks.

```kotlin
// Native layer detection (harder to hook than Java)
// In your JNI code (C/C++):
// extern "C" JNIEXPORT jboolean JNICALL
// Java_com_myapp_NativeSecurityCheck_detectInstrumentation(JNIEnv *env) {
//     // Check /proc/self/maps for suspicious libraries
//     // Check for debug-related ptrace attachments
//     // Verify app signature from native layer
// }

object NativeSecurityCheck {
    external fun detectInstrumentation(): Boolean

    init {
        System.loadLibrary("security")
    }
}
```

**Common Mistakes**

The most common mistake is performing all security checks in a single method that can be easily hooked. Distribute checks across multiple classes, layers, and even native code. Another mistake is making security checks that only run at app startup — periodic re-checks during the app's lifecycle catch attackers who attach Frida after launch. A third mistake is ignoring the timing channel — Frida hooks add measurable latency, and comparing execution times of critical operations against expected baselines can detect instrumentation.

**Key takeaway:** Use Frida to test your own security measures, implement multi-layered detection that combines Java and native checks, distribute security checks across your codebase rather than concentrating them in a single hookable method, and add periodic re-verification during the app lifecycle.

### Lesson 9.4: Automated Security Scanning and CI Integration

Manual security testing does not scale — you need automated tools integrated into your CI/CD pipeline that catch security issues before they reach production. Static Application Security Testing (SAST) tools analyze your source code for vulnerabilities without running the app, while Dynamic Application Security Testing (DAST) tools test the running application. Both are essential for a comprehensive security program.

For Android projects, several tools can be integrated into your Gradle build. MobSF (Mobile Security Framework) provides automated static and dynamic analysis. Android Lint has security-focused checks. Dependency scanning tools identify known vulnerabilities in your third-party libraries. Custom lint rules can enforce your organization's security policies.

```kotlin
// Custom Lint rule to detect hardcoded secrets
// build.gradle.kts — add security-focused lint checks
android {
    lint {
        enable += setOf(
            "HardcodedDebugMode",
            "AllowBackup",
            "ExportedContentProvider",
            "ExportedReceiver",
            "ExportedService",
            "SetJavaScriptEnabled",
            "UnprotectedSMSBroadcastReceiver",
            "WorldReadableFiles",
            "WorldWriteableFiles"
        )

        // Treat security issues as errors, not warnings
        error += setOf(
            "HardcodedDebugMode",
            "ExportedContentProvider",
            "SetJavaScriptEnabled"
        )

        // Abort build on security errors
        abortOnError = true
    }
}
```

Dependency vulnerability scanning is critical because most security breaches come through third-party code, not your own. Configure automated dependency updates and vulnerability alerts.

```kotlin
// build.gradle.kts — dependency verification
dependencyCheck {
    failBuildOnCVSS = 7.0f // Fail build on high-severity vulnerabilities
    suppressionFile = "dependency-check-suppressions.xml"
    analyzers {
        assemblyEnabled = false // Not needed for Android
    }
}

// In CI pipeline (GitHub Actions example):
// - name: Security Scan
//   run: ./gradlew dependencyCheckAnalyze lint
// - name: Upload Security Report
//   uses: actions/upload-artifact@v3
//   with:
//     name: security-report
//     path: build/reports/dependency-check-report.html
```

Integrate security checks as mandatory CI gates that block merges when security issues are detected. This shifts security left in the development process, catching vulnerabilities when they are cheapest to fix.

**Common Mistakes**

The biggest mistake is adding security scanning but treating all findings as warnings that can be ignored. Configure your tools to fail the build on high-severity issues. Another mistake is not maintaining suppression files — false positives will accumulate and developers will start ignoring all findings. Review and update suppressions regularly. A third mistake is only scanning at release time rather than on every pull request — the earlier you catch issues, the easier they are to fix.

**Key takeaway:** Integrate SAST tools, dependency scanners, and custom lint rules into your CI/CD pipeline as mandatory gates that block merges on high-severity findings, and maintain suppression files to keep the signal-to-noise ratio high.

### Lesson 9.5: OWASP Mobile Top 10 and Incident Response

The OWASP Mobile Top 10 is the industry standard reference for the most critical mobile application security risks. Understanding these risks provides a structured framework for prioritizing your security efforts. The 2024 list includes: Improper Credential Usage, Inadequate Supply Chain Security, Insecure Authentication/Authorization, Insufficient Input/Output Validation, Insecure Communication, Inadequate Privacy Controls, Insufficient Binary Protections, Security Misconfiguration, Insecure Data Storage, and Insufficient Cryptography.

Each risk maps directly to the topics covered in this course. Improper Credential Usage relates to our KeyStore and authentication modules. Insecure Communication relates to our network security module. Insecure Data Storage relates to our secure storage module. Use the OWASP list as a checklist to verify that your app addresses each risk category.

```kotlin
// OWASP-aligned security verification
class OwaspComplianceChecker(private val context: Context) {

    data class ComplianceResult(
        val category: String,
        val status: Status,
        val details: String
    )

    enum class Status { PASS, WARN, FAIL }

    fun runComplianceCheck(): List<ComplianceResult> {
        return listOf(
            checkCredentialStorage(),
            checkCommunicationSecurity(),
            checkDataStorage(),
            checkBinaryProtection(),
            checkConfiguration()
        )
    }

    private fun checkCredentialStorage(): ComplianceResult {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        val hasKeys = keyStore.aliases().toList().isNotEmpty()

        return ComplianceResult(
            category = "M1: Credential Usage",
            status = if (hasKeys) Status.PASS else Status.WARN,
            details = if (hasKeys) "Keys stored in AndroidKeyStore"
                     else "No KeyStore entries found"
        )
    }

    private fun checkCommunicationSecurity(): ComplianceResult {
        val hasNetworkConfig = context.applicationInfo.networkSecurityConfigRes != 0

        return ComplianceResult(
            category = "M5: Insecure Communication",
            status = if (hasNetworkConfig) Status.PASS else Status.FAIL,
            details = if (hasNetworkConfig) "Network security config present"
                     else "Missing network security configuration"
        )
    }

    private fun checkDataStorage(): ComplianceResult {
        val worldReadable = context.filesDir.listFiles()?.any { file ->
            file.canRead() // Simplified check
        } ?: false

        return ComplianceResult(
            category = "M9: Insecure Data Storage",
            status = Status.PASS,
            details = "App files in private storage"
        )
    }

    private fun checkBinaryProtection(): ComplianceResult {
        val isDebuggable = context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE != 0

        return ComplianceResult(
            category = "M7: Binary Protections",
            status = if (!isDebuggable) Status.PASS else Status.FAIL,
            details = if (!isDebuggable) "App is not debuggable"
                     else "CRITICAL: App is debuggable in release"
        )
    }

    private fun checkConfiguration(): ComplianceResult {
        val allowsBackup = context.applicationInfo.flags and
            ApplicationInfo.FLAG_ALLOW_BACKUP != 0

        return ComplianceResult(
            category = "M8: Security Misconfiguration",
            status = if (!allowsBackup) Status.PASS else Status.WARN,
            details = if (!allowsBackup) "Backup disabled"
                     else "Auto-backup enabled — verify backup rules"
        )
    }
}
```

Incident response is what happens when security fails despite your best efforts. Having a plan before an incident occurs is critical — during an active breach is not the time to figure out your response process. Your incident response plan should cover detection (how you discover the breach), containment (how you stop the bleeding), eradication (how you fix the vulnerability), recovery (how you restore normal operation), and lessons learned (how you prevent recurrence).

For mobile apps, incident response often involves issuing a forced update to patch the vulnerability, rotating compromised API keys or certificates, revoking and re-issuing user tokens, and communicating with affected users. Build these mechanisms into your app architecture from the start.

```kotlin
// Force update mechanism for security incidents
class ForceUpdateChecker(
    private val apiService: ApiService,
    private val context: Context
) {
    suspend fun checkForSecurityUpdate(): UpdateAction {
        val response = apiService.getMinimumVersion()
        val currentVersion = getAppVersionCode()

        return when {
            currentVersion < response.criticalMinVersion -> {
                UpdateAction.ForceUpdate(
                    message = "A critical security update is required.",
                    updateUrl = response.updateUrl
                )
            }
            currentVersion < response.recommendedVersion -> {
                UpdateAction.SuggestUpdate(
                    message = "A security update is available."
                )
            }
            else -> UpdateAction.NoAction
        }
    }

    sealed class UpdateAction {
        object NoAction : UpdateAction()
        data class SuggestUpdate(val message: String) : UpdateAction()
        data class ForceUpdate(val message: String, val updateUrl: String) : UpdateAction()
    }

    private fun getAppVersionCode(): Long {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toLong()
        }
    }
}
```

**Common Mistakes**

The most dangerous mistake is not having an incident response plan at all — teams waste critical hours during a breach figuring out who does what. Another mistake is not having a force update mechanism — if you discover a critical vulnerability, you need the ability to force all users to update immediately. A third mistake is not conducting post-incident reviews — every security incident is a learning opportunity, and failing to learn from it means you are likely to repeat it.

**Key takeaway:** Use the OWASP Mobile Top 10 as your security prioritization framework, build incident response mechanisms (forced updates, key rotation, token revocation) into your app architecture from day one, and always conduct post-incident reviews to prevent recurrence.

### Quiz: Security Testing and Auditing

#### What is the primary purpose of testing your own app with Frida?

- ❌ To find performance bottlenecks
- ✅ To verify that your security measures resist dynamic instrumentation attacks
- ❌ To debug UI layout issues
- ❌ To test third-party API integrations

> **Explanation:** Frida testing helps you understand what a sophisticated attacker can do to your app. If you can bypass your own security checks with Frida in an afternoon, an attacker can too. This helps you identify and strengthen weak defenses.

#### When should automated security scanning run in CI/CD?

- ❌ Only before major releases
- ❌ Only when security-related files are changed
- ✅ On every pull request as a mandatory gate
- ❌ Monthly on a scheduled basis

> **Explanation:** Security scanning should run on every PR as a mandatory gate that blocks merges on high-severity issues. The earlier you catch vulnerabilities, the cheaper they are to fix. Waiting until release time means vulnerabilities have been in the codebase for weeks or months.

#### Which is NOT part of the OWASP Mobile Top 10?

- ❌ Insecure Communication
- ❌ Inadequate Privacy Controls
- ✅ Slow UI Rendering Performance
- ❌ Insufficient Binary Protections

> **Explanation:** The OWASP Mobile Top 10 focuses on security risks, not performance issues. UI rendering performance is a user experience concern, not a security vulnerability.

### Coding Challenge: Automated Security Health Check

Build a security health check system that runs at app launch, verifies multiple security properties, and reports results to your backend for monitoring.

#### Solution

```kotlin
class SecurityHealthCheck(
    private val context: Context,
    private val reportingService: SecurityReportingService
) {
    data class CheckResult(
        val name: String,
        val passed: Boolean,
        val severity: Severity,
        val details: String
    )

    enum class Severity { CRITICAL, HIGH, MEDIUM, LOW }

    suspend fun runAllChecks(): List<CheckResult> {
        val results = mutableListOf<CheckResult>()

        // Check 1: Debuggable
        val isDebuggable = context.applicationInfo.flags and
            ApplicationInfo.FLAG_DEBUGGABLE != 0
        results.add(CheckResult(
            name = "debug_mode",
            passed = !isDebuggable,
            severity = Severity.CRITICAL,
            details = if (isDebuggable) "App is debuggable" else "OK"
        ))

        // Check 2: Install source
        val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.packageManager.getInstallSourceInfo(context.packageName)
                .installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(context.packageName)
        }
        results.add(CheckResult(
            name = "install_source",
            passed = installer == "com.android.vending",
            severity = Severity.HIGH,
            details = "Installer: ${installer ?: "unknown"}"
        ))

        // Check 3: Root detection
        val rootBinaries = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su")
        val isRooted = rootBinaries.any { File(it).exists() }
        results.add(CheckResult(
            name = "root_detection",
            passed = !isRooted,
            severity = Severity.HIGH,
            details = if (isRooted) "Root binaries found" else "OK"
        ))

        // Check 4: Network security config
        val hasNetConfig = context.applicationInfo.networkSecurityConfigRes != 0
        results.add(CheckResult(
            name = "network_security_config",
            passed = hasNetConfig,
            severity = Severity.MEDIUM,
            details = if (hasNetConfig) "Present" else "Missing"
        ))

        // Report to backend
        val criticalFailures = results.filter { !it.passed && it.severity == Severity.CRITICAL }
        if (criticalFailures.isNotEmpty()) {
            reportingService.reportSecurityAlert(criticalFailures)
        }

        return results
    }
}
```

---

