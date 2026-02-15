---
title: Android Biometric Authentication Guide
layout: post
sequence: 139
categories: post
tags:
  - Security
  - Android
---

Biometric authentication is one of those features that sounds simple until you actually build it. Fingerprint, face, iris — the `BiometricPrompt` API abstracts away the hardware differences, giving you a single entry point for all biometric types. But the abstraction is only the surface layer. Underneath, you're dealing with Android KeyStore integration, cryptographic operations that the TEE (Trusted Execution Environment) controls, and error codes that each demand a different user-facing response. I've shipped biometric flows for payment confirmations and session re-authentication, and the difference between a fragile implementation and a solid one comes down to how well you handle the crypto binding and the edge cases.

Here's the reframe that changed how I think about biometric auth: **BiometricPrompt alone only proves that "a biometric matched." It doesn't protect anything.** Without a `CryptoObject`, a determined attacker can hook the callback and call `onAuthenticationSucceeded` directly. The real security comes from tying the biometric check to a cryptographic key that the hardware refuses to unlock without a genuine biometric match. That distinction — UI confirmation vs. cryptographic proof — is what separates toy implementations from production-grade ones.

This guide covers the full stack: checking hardware capability, building the prompt, binding it to KeyStore-backed cryptography, understanding where Credential Manager fits, and handling every error code gracefully.

## BiometricManager

Before you show a biometric prompt, you need to know whether the device can even support it. `BiometricManager.from(context).canAuthenticate()` takes a bitmask of authenticator types and returns one of four results. This check should happen early — on screen load or app startup — so you can adjust your UI before the user taps "Authenticate."

The three authenticator constants matter more than they seem. `BIOMETRIC_STRONG` corresponds to Class 3 biometrics in the Android Compatibility Definition Document — hardware-backed fingerprint sensors and secure face unlock implementations that meet strict anti-spoofing requirements. `BIOMETRIC_WEAK` covers Class 2 — less secure face unlock on some devices that don't guarantee anti-spoofing. `DEVICE_CREDENTIAL` means PIN, pattern, or password. For anything involving cryptographic operations, you need `BIOMETRIC_STRONG` because the KeyStore only binds auth-per-use keys to Class 3 biometrics.

```kotlin
class BiometricCapabilityChecker(private val context: Context) {

    fun checkBiometricAvailability(): BiometricStatus {
        val biometricManager = BiometricManager.from(context)
        return when (biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )) {
            BiometricManager.BIOMETRIC_SUCCESS ->
                BiometricStatus.Available

            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                BiometricStatus.NoHardware

            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                BiometricStatus.HardwareUnavailable

            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                BiometricStatus.NoneEnrolled

            else -> BiometricStatus.Unknown
        }
    }

    fun launchBiometricEnrollment(activity: Activity) {
        val enrollIntent = Intent(Settings.ACTION_BIOMETRIC_ENROLL).apply {
            putExtra(
                Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED,
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
        }
        activity.startActivity(enrollIntent)
    }
}

sealed class BiometricStatus {
    data object Available : BiometricStatus()
    data object NoHardware : BiometricStatus()
    data object HardwareUnavailable : BiometricStatus()
    data object NoneEnrolled : BiometricStatus()
    data object Unknown : BiometricStatus()
}
```

The `BIOMETRIC_ERROR_NONE_ENROLLED` case is the one developers often ignore. The user has a fingerprint sensor but hasn't registered any fingerprints. You can launch `ACTION_BIOMETRIC_ENROLL` to take them directly to the enrollment screen — this intent was added in API 30 and lets you specify which authenticator types you accept via the `EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED` extra. On API 29 and below, `DEVICE_CREDENTIAL` combined with `BIOMETRIC_STRONG` isn't supported as a combined flag, so you'd need to check `KeyguardManager.isDeviceSecure()` separately for the fallback.

One gotcha I've hit: `canAuthenticate()` can return `BIOMETRIC_SUCCESS` even when the biometric hardware is temporarily locked out due to too many failed attempts. The lockout state only surfaces when you actually call `authenticate()` and get an `ERROR_LOCKOUT` callback. So "available" means "hardware exists and credentials are enrolled," not "ready to use right now."

## BiometricPrompt

The prompt itself is built with `BiometricPrompt.PromptInfo.Builder`. Three fields are required: `setTitle()`, and either `setNegativeButtonText()` or `setAllowedAuthenticators()` with `DEVICE_CREDENTIAL` included. You can't set both a negative button text and `DEVICE_CREDENTIAL` — if you allow device credentials as a fallback, the system handles the "use PIN" option for you and your negative button is ignored.

```kotlin
class BiometricAuthenticator(private val activity: FragmentActivity) {

    private val executor = ContextCompat.getMainExecutor(activity)

    fun authenticate(
        onSuccess: (BiometricPrompt.AuthenticationResult) -> Unit,
        onError: (Int, String) -> Unit
    ) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Verify Identity")
            .setSubtitle("Authenticate to access your account")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
            .setNegativeButtonText("Use Password")
            .build()

        val biometricPrompt = BiometricPrompt(
            activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {

                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    onSuccess(result)
                }

                override fun onAuthenticationError(
                    errorCode: Int, errString: CharSequence
                ) {
                    onError(errorCode, errString.toString())
                }

                override fun onAuthenticationFailed() {
                    // Individual attempt failed — sensor didn't recognize
                    // the biometric. The prompt stays open for retry.
                }
            }
        )

        biometricPrompt.authenticate(promptInfo)
    }
}
```

A subtle but important distinction: `onAuthenticationFailed()` fires when a single biometric attempt doesn't match — the user put the wrong finger on the sensor. The prompt stays visible and the user can try again. `onAuthenticationError()` fires when something terminal happens — the user cancelled, the hardware locked out, or too many failed attempts occurred. Only `onAuthenticationError()` should trigger your fallback logic.

`setAllowedAuthenticators()` controls the authenticator types the prompt accepts. If you pass `BIOMETRIC_STRONG or DEVICE_CREDENTIAL`, the prompt shows a "Use PIN" option automatically and you must not call `setNegativeButtonText()` — the API throws an `IllegalArgumentException` if you do. For payment confirmations where I want biometric-only with an explicit cancel, I use `BIOMETRIC_STRONG` alone and set a negative button text manually.

## CryptoObject Integration

This is where biometric auth becomes genuinely secure rather than just a UI gate. A `CryptoObject` wraps a `Cipher`, `Signature`, or `Mac` instance that's bound to a KeyStore key created with `setUserAuthenticationRequired(true)`. The TEE holds this key locked until a genuine biometric match happens in hardware. When the user authenticates, the `CryptoObject` in the success callback contains an unlocked cipher ready for exactly one cryptographic operation.

```kotlin
object BiometricKeyManager {

    private const val KEY_ALIAS = "biometric_transaction_key"

    fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
            .apply { load(null) }

        keyStore.getKey(KEY_ALIAS, null)?.let { return it as SecretKey }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or
                    KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .build()
        )
        return keyGenerator.generateKey()
    }
}
```

The `setInvalidatedByBiometricEnrollment(true)` flag is critical and defaults to `true` on API 24+. If the user adds a new fingerprint after the key was created, the key becomes permanently invalidated. Without this, someone who gains physical access to an unlocked device could enroll their own fingerprint and then authenticate as the original user. The downside is that your app needs to handle `KeyPermanentlyInvalidatedException` — if the key is invalidated, you have to delete it, create a new one, and re-authenticate the user through your primary auth flow.

Here's the complete flow — creating the cipher, wrapping it in a `CryptoObject`, and using the unlocked cipher after successful authentication:

```kotlin
class SecureTransactionAuthenticator(
    private val activity: FragmentActivity
) {
    private val executor = ContextCompat.getMainExecutor(activity)

    fun authenticateAndEncrypt(
        payload: ByteArray,
        onEncrypted: (ByteArray, ByteArray) -> Unit,
        onError: (String) -> Unit
    ) {
        val secretKey = BiometricKeyManager.getOrCreateKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")

        try {
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
        } catch (e: KeyPermanentlyInvalidatedException) {
            onError("Biometric enrollment changed. Please re-login.")
            return
        }

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authorize Transaction")
            .setSubtitle("Confirm with your fingerprint")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG
            )
            .setNegativeButtonText("Cancel")
            .build()

        val biometricPrompt = BiometricPrompt(
            activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    val authedCipher = result.cryptoObject?.cipher
                        ?: return
                    val encrypted = authedCipher.doFinal(payload)
                    val iv = authedCipher.iv
                    onEncrypted(encrypted, iv)
                }

                override fun onAuthenticationError(
                    errorCode: Int, errString: CharSequence
                ) {
                    onError(errString.toString())
                }
            }
        )

        biometricPrompt.authenticate(
            promptInfo,
            BiometricPrompt.CryptoObject(cipher)
        )
    }
}
```

Notice that the `cipher.init()` call happens before `authenticate()`. You initialize the cipher with the KeyStore key, but the TEE won't actually let you use it until the biometric succeeds. If the key has been invalidated (new fingerprint enrolled), `init()` throws `KeyPermanentlyInvalidatedException` right there — you catch it early before even showing the prompt. The IV from the cipher must be stored alongside the ciphertext because AES-GCM generates a random IV on each encryption. Without it, you can't decrypt later.

The real insight here is that this cipher is auth-per-use — it's valid for exactly one `doFinal()` call. After that, you need another biometric authentication to use the key again. This is by design. For high-value operations like payment authorization, you want each operation individually gated by a biometric check, not a blanket "authenticated 5 minutes ago" window.

## Credential Manager and Passkeys

Google's Credential Manager API represents the next evolution beyond BiometricPrompt for authentication. While BiometricPrompt gates operations behind a local biometric check, Credential Manager handles the full authentication lifecycle — passkeys, passwords, and federated sign-in through a unified interface. Passkeys specifically use FIDO2/WebAuthn standards to create phishing-resistant, passwordless credentials backed by public-key cryptography.

The key architectural difference: BiometricPrompt confirms "the person holding the device matches an enrolled biometric." Credential Manager with passkeys confirms "this person has the private key associated with this account" — and biometrics happen transparently as part of the passkey retrieval. When a user authenticates with a passkey, the biometric prompt appears automatically to unlock the credential from the provider (like Google Password Manager), but your app code interacts with Credential Manager, not BiometricPrompt directly.

```kotlin
class PasskeyAuthenticator(private val context: Context) {

    private val credentialManager = CredentialManager.create(context)

    suspend fun signInWithPasskey(
        requestJson: String
    ): GetCredentialResponse {
        val passkeyOption = GetPublicKeyCredentialOption(
            requestJson = requestJson
        )

        val request = GetCredentialRequest(
            credentialOptions = listOf(passkeyOption)
        )

        return credentialManager.getCredential(
            context = context,
            request = request
        )
    }
}
```

The migration path from BiometricPrompt to Credential Manager isn't a wholesale replacement. IMO, both APIs serve different purposes and coexist naturally. Use Credential Manager for initial sign-in — creating accounts and authenticating users across devices. Use BiometricPrompt with `CryptoObject` for gating sensitive operations within an already-authenticated session — payment confirmations, viewing encrypted health records, authorizing transfers. Credential Manager doesn't expose a `CryptoObject` equivalent because it's solving the identity problem, not the "unlock this specific key" problem.

If you're starting a new app today, implement Credential Manager for your sign-in flow and BiometricPrompt for in-session security gates. Google's own guidance recommends this split — Credential Manager for the front door, BiometricPrompt for the vault.

## Error Handling

BiometricPrompt's `onAuthenticationError` delivers an error code and a user-facing string. The error codes break into three categories: hardware issues, user actions, and lockout states. How you handle each determines whether your biometric flow feels robust or frustrating.

Hardware and availability errors come with codes like `ERROR_HW_NOT_PRESENT` (no biometric hardware at all), `ERROR_HW_UNAVAILABLE` (hardware exists but is currently inaccessible — another app might be using the sensor), and `ERROR_NO_BIOMETRICS` (hardware exists but nothing is enrolled). For these, fall back to your alternative auth method immediately and don't show a retry option.

User-initiated errors include `ERROR_USER_CANCELED` (user tapped outside the dialog or pressed back), `ERROR_NEGATIVE_BUTTON` (user tapped your negative button text), and `ERROR_CANCELED` (the system cancelled the prompt, often because the app went to background). These are expected exits — don't show error messages for them, just return to the previous state.

The tricky ones are lockout errors. `ERROR_LOCKOUT` means too many failed attempts — the biometric sensor is locked for 30 seconds. `ERROR_LOCKOUT_PERMANENT` means the lockout persists until the user authenticates with their device credential (PIN/pattern/password). For lockout, you should offer the device credential fallback.

```kotlin
class BiometricErrorHandler {

    fun handleError(
        errorCode: Int,
        errString: String,
        onFallbackToPin: () -> Unit,
        onRetryLater: () -> Unit,
        onDismiss: () -> Unit
    ) {
        when (errorCode) {
            BiometricPrompt.ERROR_LOCKOUT -> {
                // Temporarily locked — offer PIN fallback
                onFallbackToPin()
            }

            BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> {
                // Must authenticate with device credential to reset
                onFallbackToPin()
            }

            BiometricPrompt.ERROR_USER_CANCELED,
            BiometricPrompt.ERROR_NEGATIVE_BUTTON,
            BiometricPrompt.ERROR_CANCELED -> {
                // User deliberately exited — not an error
                onDismiss()
            }

            BiometricPrompt.ERROR_HW_NOT_PRESENT,
            BiometricPrompt.ERROR_HW_UNAVAILABLE,
            BiometricPrompt.ERROR_NO_BIOMETRICS -> {
                // Hardware issue — fall back silently
                onFallbackToPin()
            }

            BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL -> {
                // No PIN/pattern/password set on device
                onRetryLater()
            }

            BiometricPrompt.ERROR_VENDOR -> {
                // Device-specific error — log and fall back
                onFallbackToPin()
            }

            else -> onFallbackToPin()
        }
    }
}
```

The most painful error to handle in production is `KeyPermanentlyInvalidatedException`. This isn't a BiometricPrompt error — it comes from the KeyStore when you try to init a cipher with a key that was invalidated because the user enrolled a new biometric. Your `CryptoObject` initialization fails before the prompt even appears. The correct response is to delete the old key, generate a new one, and force the user through your full re-authentication flow (password or Credential Manager) to re-establish trust. Don't silently create a new key and continue — that defeats the purpose of `setInvalidatedByBiometricEnrollment(true)`.

I always wrap the entire biometric flow in a sealed class result that distinguishes between "authenticated with crypto," "user cancelled," and "needs re-enrollment." This keeps calling code clean and ensures every error path is handled explicitly.

## Quiz

**Question 1:** You're implementing biometric auth for a banking app. Your code creates a `BiometricPrompt`, builds a `PromptInfo` with `BIOMETRIC_STRONG`, and calls `biometricPrompt.authenticate(promptInfo)` without a `CryptoObject`. Is this secure enough for authorizing bank transfers?

**Wrong** — Without a `CryptoObject`, BiometricPrompt only provides UI-level confirmation that a biometric matched. There's no cryptographic proof. An attacker with a rooted device and a hooking framework like Frida can call your `onAuthenticationSucceeded` callback directly, bypassing the biometric check entirely. For bank transfers, you need a `CryptoObject` wrapping a `Cipher` bound to a KeyStore key with `setUserAuthenticationRequired(true)`. The TEE won't release the key without a genuine hardware-level biometric match — no software hook can bypass that. UI-only biometric checks are appropriate for low-sensitivity gates like "show recent transactions," but never for operations that move money.

**Question 2:** Your app creates a KeyStore key with `setInvalidatedByBiometricEnrollment(true)` and `setUserAuthenticationRequired(true)`. A user enrolls a new fingerprint. The next time they open your app and try to authenticate, the biometric prompt shows up and the user successfully scans their finger, but the operation fails. What went wrong?

**Correct** behavior — this is working as designed. The key was permanently invalidated when the new fingerprint was enrolled. Even though the biometric prompt succeeds (the new fingerprint is valid), `cipher.init()` throws `KeyPermanentlyInvalidatedException` because the underlying key no longer exists in a usable state. The fix is to catch this exception before showing the prompt, delete the invalidated key, create a new one, and require the user to re-authenticate through your primary login flow. This prevents the scenario where someone adds their fingerprint to a stolen unlocked device and gains access to crypto-protected data.

---

## Coding Challenge

Build a `SecureNoteManager` that encrypts and decrypts notes using biometric-gated AES-256-GCM keys. Create a `BiometricKeyStore` that generates a KeyStore key with `setUserAuthenticationRequired(true)` and `setInvalidatedByBiometricEnrollment(true)`. Implement `encryptNote(plainText: String)` that creates a `CryptoObject` with an encrypt-mode cipher, authenticates via `BiometricPrompt`, and returns the ciphertext plus IV. Implement `decryptNote(cipherText: ByteArray, iv: ByteArray)` that initializes a decrypt-mode cipher with the stored IV, wraps it in a `CryptoObject`, authenticates, and returns the plaintext. Handle `KeyPermanentlyInvalidatedException` by clearing the old key and prompting re-login. Handle `ERROR_LOCKOUT` by falling back to a password input screen. Write the `BiometricCapabilityChecker` that verifies `BIOMETRIC_STRONG` availability before attempting any operation.

Thanks for reading!
