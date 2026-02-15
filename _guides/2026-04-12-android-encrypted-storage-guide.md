---
title: Encrypted Storage in Android Guide
layout: post
sequence: 137
categories: post
tags:
  - Security
  - Android
---

I once inherited a codebase that stored OAuth refresh tokens in plain `SharedPreferences` and API keys directly in `BuildConfig` fields. The original developer assumed the app sandbox was enough protection. It wasn't. A QA engineer with a rooted test device opened the SharedPreferences XML file in a text editor, copied the refresh token, and replayed it from Postman. The `BuildConfig` values were visible in under two minutes using `jadx` to decompile the APK. Both secrets were sitting in plain text, waiting for anyone motivated enough to look.

That experience changed how I think about on-device storage. Android's sandbox prevents other apps from reading your files, but it does nothing against a rooted device, ADB backup extraction, or a debuggable build left on by accident. The moment you store a token, a key, or any personal data on disk, you need encryption — not as an afterthought, but as the default. Android Keystore provides the cryptographic foundation, and Jetpack Security builds developer-friendly APIs on top of it. The combination gives you hardware-backed encryption without needing a cryptography degree.

## Android Keystore

The Android Keystore system is fundamentally different from storing keys in your app's files or code. Keys generated inside the Keystore live in the device's secure hardware — either the TEE (Trusted Execution Environment) or StrongBox if available. The critical property: **keys never leave the secure hardware.** When you encrypt or decrypt data, the operation happens inside the TEE, and only the result comes back to your process. Even on a rooted device, an attacker can't extract the raw key material. They can use the key if they have your app's UID, but they can't copy it to another device or read the bytes.

Keystore supports both symmetric (AES) and asymmetric (RSA, EC) key generation. For encrypting stored data, AES-GCM is the right choice — it provides both confidentiality and integrity in a single operation. GCM detects tampering, so if someone modifies the ciphertext on disk, decryption fails rather than silently returning garbage. Here's how to generate a key and use it for encryption:

```kotlin
object SecureEncryption {

    private const val KEY_ALIAS = "session_data_key"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"

    private fun getOrCreateKey(): SecretKey {
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
                .build()
        )
        return keyGenerator.generateKey()
    }

    fun encrypt(plaintext: ByteArray): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(plaintext)
        return Pair(cipher.iv, ciphertext)
    }

    fun decrypt(iv: ByteArray, ciphertext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), spec)
        return cipher.doFinal(ciphertext)
    }
}
```

A few things to call out. The `encrypt` function returns both the IV and the ciphertext — you must store the IV alongside the encrypted data because GCM generates a random 12-byte IV per encryption, and you need it for decryption. Never reuse IVs with the same key; GCM's security guarantees collapse completely if you do. The `GCMParameterSpec(128, iv)` sets the authentication tag length to 128 bits, which is the standard and recommended size.

One tradeoff worth knowing: Keystore operations involve IPC to the secure hardware, so they're slower than pure software encryption. For a single token, the overhead is negligible — maybe 5-10ms. But if you're encrypting hundreds of records in a loop, you'll notice it. In that case, use the Keystore key to unwrap a "working key" in memory and do bulk encryption in software. This is essentially the pattern that `EncryptedSharedPreferences` uses internally.

## EncryptedSharedPreferences

If you just need to store a handful of key-value pairs securely — auth tokens, user preferences with sensitive data, session flags — `EncryptedSharedPreferences` from the Jetpack Security library is the simplest path. It wraps standard `SharedPreferences` with transparent encryption, so you get the same `getString`/`putString` API you already know, but everything hits disk encrypted.

Under the hood, it creates a `MasterKey` in the Android Keystore and derives two separate encryption schemes from it. Keys are encrypted with AES256-SIV (deterministic encryption that allows lookups without decrypting every key). Values are encrypted with AES256-GCM (randomized encryption with integrity checking). This means even if someone reads the XML file on a rooted device, both the preference names and their values are opaque ciphertext.

```kotlin
class TokenStorage(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val encryptedPrefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            "encrypted_token_store",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveRefreshToken(token: String) {
        encryptedPrefs.edit { putString("refresh_token", token) }
    }

    fun getRefreshToken(): String? =
        encryptedPrefs.getString("refresh_token", null)

    fun clearTokens() {
        encryptedPrefs.edit { clear() }
    }
}
```

Migrating from plain SharedPreferences is straightforward — read the old values, write them to `EncryptedSharedPreferences`, then delete the old file. But do this lazily on first access, not eagerly on startup. The `EncryptedSharedPreferences.create()` call is expensive on first invocation — initializing the Keystore and generating the master key can take 200-500ms on low-end devices. I always wrap the instance in a `lazy` delegate and access it from a background coroutine. Calling it on the main thread during `onCreate()` will cause jank or ANRs on slower hardware.

One limitation: `EncryptedSharedPreferences` doesn't support `getAll()` or listeners the same way standard SharedPreferences does. The `OnSharedPreferenceChangeListener` works, but the key names you receive in the callback are the encrypted versions, not the originals. If you need reactive observation of encrypted preferences, DataStore with a custom encrypted serializer is a better fit.

## EncryptedFile

For data that doesn't fit the key-value model — cached JSON responses, exported user data, downloaded documents — `EncryptedFile` from the same Jetpack Security library provides streaming encryption for files. It uses `AES256_GCM_HKDF_4KB`, which means the file is encrypted in 4KB streaming chunks using AES-GCM with keys derived via HKDF. This streaming approach is important: it means you don't need to load the entire file into memory to encrypt or decrypt it. A 50MB export file gets encrypted chunk by chunk.

```kotlin
class SecureFileManager(private val context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    fun writeSecureJson(filename: String, data: String) {
        val file = File(context.filesDir, filename)
        if (file.exists()) file.delete()

        val encryptedFile = EncryptedFile.Builder(
            context,
            file,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build()

        encryptedFile.openFileOutput().use { outputStream ->
            outputStream.write(data.toByteArray(Charsets.UTF_8))
        }
    }

    fun readSecureJson(filename: String): String? {
        val file = File(context.filesDir, filename)
        if (!file.exists()) return null

        val encryptedFile = EncryptedFile.Builder(
            context,
            file,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build()

        return encryptedFile.openFileInput().use { inputStream ->
            inputStream.readBytes().toString(Charsets.UTF_8)
        }
    }
}
```

There's a catch that's bitten me before: `EncryptedFile` throws an exception if you try to write to a file that already exists. You must delete the old file first, then create a new `EncryptedFile` instance. This is by design — overwriting an encrypted file in place could corrupt the encryption metadata. The `if (file.exists()) file.delete()` pattern in the example above handles this. It's not ideal for frequent writes, but for periodic exports or cached responses that get refreshed, it works fine.

I use `EncryptedFile` for storing sensitive JSON payloads — things like cached user profiles with PII, medical records, or financial transaction histories. Anything where the data at rest would be a compliance problem if stored unencrypted. For bulk binary files like images or videos, the performance overhead of streaming encryption is minimal — the bottleneck is usually disk I/O, not the AES operations.

## DataStore with Encryption

DataStore doesn't encrypt data by default. This surprises developers who assume Jetpack's modern storage solution handles security automatically. It doesn't. Proto DataStore writes serialized protobuf or JSON to a plain file in your app's data directory. Anyone with root access reads it trivially. Preferences DataStore is even more exposed — it writes to a file that's structurally similar to SharedPreferences XML.

The cleanest approach I've found is building a custom `Serializer` that encrypts the bytes before writing and decrypts on read. You bring your own encryption using the Keystore-backed pattern we covered earlier, and DataStore handles the concurrency and flow-based observation.

```kotlin
@Serializable
data class UserSession(
    val accessToken: String = "",
    val userId: String = "",
    val expiresAt: Long = 0L
)

class EncryptedSessionSerializer(
    private val encryption: SecureEncryption
) : Serializer<UserSession> {

    override val defaultValue: UserSession = UserSession()

    override suspend fun readFrom(input: InputStream): UserSession {
        val encryptedBytes = input.readBytes()
        if (encryptedBytes.isEmpty()) return defaultValue

        // First 12 bytes are the IV, rest is ciphertext
        val iv = encryptedBytes.sliceArray(0 until 12)
        val ciphertext = encryptedBytes.sliceArray(12 until encryptedBytes.size)
        val decrypted = encryption.decrypt(iv, ciphertext)
        return Json.decodeFromString(decrypted.toString(Charsets.UTF_8))
    }

    override suspend fun writeTo(t: UserSession, output: OutputStream) {
        val json = Json.encodeToString(t)
        val (iv, ciphertext) = encryption.encrypt(json.toByteArray(Charsets.UTF_8))
        output.write(iv + ciphertext)
    }
}
```

Then you create the DataStore with this serializer:

```kotlin
private val Context.sessionDataStore by dataStore(
    fileName = "user_session.enc",
    serializer = EncryptedSessionSerializer(SecureEncryption)
)
```

This gives you the best of both worlds — DataStore's coroutine-based API, flow observation, and transactional writes, combined with Keystore-backed encryption at rest. The tradeoff is that every read and write incurs an encryption/decryption cost, but for small data objects like sessions or settings, the overhead is a few milliseconds.

One thing I'd avoid: encrypting the DataStore file externally using `EncryptedFile` as the underlying storage. It sounds elegant but creates problems. `EncryptedFile` doesn't support the atomic file operations DataStore relies on for crash safety, and you'd lose DataStore's built-in corruption handling. The custom serializer approach keeps encryption at the right layer.

## Common Mistakes

I've reviewed dozens of codebases that attempt encryption but get the details wrong. The same mistakes keep showing up.

**Hardcoding encryption keys in source code** is the most common failure. I've seen teams generate an AES key, convert it to a hex string, and paste it into a Kotlin `const val`. This is security theater — the key is visible in the decompiled APK within seconds. Even obfuscation with R8 doesn't help here; string constants survive minification. The fix is always the Keystore. If the key never exists in your process's memory as raw bytes, it can't be extracted.

**Using ECB mode** is a textbook mistake that still happens in production. ECB encrypts each block independently with the same key, which means identical plaintext blocks produce identical ciphertext blocks. If you encrypt a JSON object with repeating structure, the patterns are visible in the ciphertext. The Android Keystore doesn't even allow ECB for AES by default, but I've seen developers bypass this by generating keys in software and using `Cipher.getInstance("AES/ECB/PKCS5Padding")` directly. Always use GCM or CBC with a random IV.

**Not handling Keystore exceptions** is the silent killer. Keys stored in the Keystore can become invalidated — if the user adds a new fingerprint, changes their lock screen, or performs a factory reset, keys tied to biometric or lock screen authentication are permanently destroyed. Your app gets a `KeyPermanentlyInvalidatedException` or `UserNotAuthenticatedException` on the next use. If you're not catching these and gracefully re-creating keys (and informing the user that they need to re-authenticate), your app crashes. I wrap every Keystore operation in a `try-catch` that handles `InvalidKeyException`, `KeyPermanentlyInvalidatedException`, and `UnrecoverableKeyException` with a fallback to key regeneration.

**Storing secrets in BuildConfig** is the other classic. `BuildConfig.API_KEY` compiles to a static string constant in the generated `BuildConfig.class` file. R8 might inline it, but the value is still in the DEX bytecodes. For API keys that need to ship with the app, the least-bad option is storing them in the NDK layer (harder to decompile, though not impossible) or fetching them from a server at runtime. For truly sensitive secrets like signing keys or encryption passwords, they should never be in the APK at all.

---

## Quiz

**Question 1:** What's wrong with this encryption code?

```kotlin
fun encryptToken(token: String): ByteArray {
    val key = "my_secret_key_32_bytes_long!!!!!!"
    val secretKey = SecretKeySpec(key.toByteArray(), "AES")
    val cipher = Cipher.getInstance("AES/ECB/PKCS5Padding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey)
    return cipher.doFinal(token.toByteArray())
}
```

**Wrong** — Two critical problems. First, the encryption key is hardcoded as a string constant — it's visible in the decompiled APK and defeats the entire purpose of encryption. Keys should be generated and stored in the Android Keystore where they can't be extracted. Second, it uses ECB mode, which encrypts each block independently and leaks patterns in the ciphertext. Use AES/GCM/NoPadding with a Keystore-backed key instead.

**Question 2:** You're migrating from plain SharedPreferences to EncryptedSharedPreferences. Where should you call `EncryptedSharedPreferences.create()`?

**Correct** — On a background thread, wrapped in a `lazy` delegate. The `create()` call initializes the Keystore and generates the master key on first invocation, which can take 200-500ms on low-end devices. Calling it on the main thread during `onCreate()` causes jank or ANRs. Use `by lazy { }` to defer initialization, and ensure the first access happens from a coroutine on `Dispatchers.IO`.

---

## Coding Challenge

Build a `SecureNoteManager` class that encrypts and stores notes using `EncryptedFile`. Each note has a title and body. Implement `saveNote(title: String, body: String)` that serializes the note to JSON and writes it to an encrypted file named from the title slug. Implement `readNote(title: String): Note?` that reads and decrypts. Handle the case where the file doesn't exist, and handle the `EncryptedFile` overwrite restriction. Write the encryption using a `MasterKey` with `AES256_GCM` scheme. Bonus: add a `listNotes()` function that returns all saved note titles by listing the encrypted files in the directory.

Thanks for reading!
