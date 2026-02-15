---
title: Android Network Security Guide
layout: post
sequence: 138
categories: post
tags:
  - Security
  - Android
---

A couple of years ago, I was reviewing a banking app's network layer and noticed something that made me pause. The app used HTTPS for everything — great. But it trusted every certificate authority on the device, had no certificate pinning, and shipped the payment gateway API key as a string constant in `BuildConfig`. Someone with Charles Proxy on the same WiFi network could have intercepted every request by installing a custom CA certificate. The HTTPS was doing its job — encrypting traffic — but the app had no defense against a device owner who could install their own trusted certificate.

That experience taught me that HTTPS is the floor, not the ceiling. Android's Network Security Config, certificate pinning, TLS hardening, and API key management are separate layers that defend against different attack vectors. A compromised CA, a proxy tool on a rooted device, a decompiled APK — each attack bypasses a different layer. The only real defense is having all of them in place. Here's how I set up network security on every Android project now.

## Network Security Config

Android's Network Security Config is an XML file at `res/xml/network_security_config.xml` that lets you declare security policies without writing any code. You reference it in the manifest with `android:networkSecurityConfig="@xml/network_security_config"` on the `<application>` tag, and it controls three critical things: which certificate authorities your app trusts, whether cleartext HTTP traffic is allowed, and which certificates are pinned.

Since Android 9 (API 28), cleartext traffic is blocked by default for apps targeting API 28+. But I still declare `cleartextTrafficPermitted="false"` explicitly in the config because defaults can be subtle. Someone on your team changing the target SDK, or a third-party SDK pulling in a lower `minSdkVersion`, shouldn't silently re-enable unencrypted traffic. Being explicit costs nothing and prevents accidental regressions.

The trust anchors configuration controls which CAs your app considers valid. By default, apps targeting API 24+ only trust system-installed CAs, not user-installed ones. This is important because user-installed CAs are how proxy tools like Charles Proxy or mitmproxy intercept HTTPS traffic — they install their own CA on the device. In production, you want only system CAs. In debug builds, you want user CAs so your team can actually debug network calls.

Here's a production-ready config that handles both scenarios:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>

    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <domain-config>
        <domain includeSubdomains="true">api.myapp.com</domain>
        <pin-set expiration="2027-01-01">
            <pin digest="SHA-256">7HIpactkIAq2Y49orFOOQKurWxmmSFZhBCoQYcRhJ3Y=</pin>
            <pin digest="SHA-256">fwza0LRMXouZHRC8Ei+4PyuldPDcf3UKgO/04cDM1oE=</pin>
        </pin-set>
    </domain-config>

    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>

</network-security-config>
```

The `debug-overrides` section only applies when `android:debuggable` is true — automatically set for debug variants by the build system. In release builds, it's completely ignored. I've seen teams scatter `if (BuildConfig.DEBUG)` checks through their networking code to achieve the same thing. The Network Security Config is cleaner — declarative and enforced at the platform level, not in application code.

One thing people miss: `domain-config` blocks can be nested, and values not explicitly set inherit from `base-config`. So you don't repeat yourself when different subdomains need different policies.

## Certificate Pinning

Certificate pinning restricts which certificates your app accepts for a specific host. Even if an attacker compromises a CA and issues a fraudulent certificate for your domain, a pinned app rejects it because the certificate's public key hash won't match. This is your defense against MITM attacks from compromised CAs, rogue enterprise proxies, and state-level surveillance.

The Network Security Config pins public key hashes (the SHA-256 digest of `SubjectPublicKeyInfo`), not entire certificates. If your server rotates to a new certificate with the same key pair, pinning by public key still works. Pinning the full certificate would break on every renewal.

For programmatic pinning with OkHttp, `CertificatePinner` gives you the same capability in code:

```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add(
        "api.myapp.com",
        "sha256/7HIpactkIAq2Y49orFOOQKurWxmmSFZhBCoQYcRhJ3Y=",
        "sha256/fwza0LRMXouZHRC8Ei+4PyuldPDcf3UKgO/04cDM1oE="
    )
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

I prefer the Network Security Config over `CertificatePinner` for one reason: the `expiration` attribute. Setting `expiration="2027-01-01"` on a pin-set makes Android stop enforcing pins after that date, falling back to standard CA validation. This is a safety valve — if your certificate rotates before you push an app update, users gracefully degrade to normal HTTPS instead of being locked out.

OkHttp's `CertificatePinner` has no built-in expiration. If pins go stale without an app update, networking is bricked until users update. I've heard of this happening at scale — millions of users locked out because a certificate rotated without a coordinated app release. **Always include a backup pin.** The backup should be the hash of a certificate you have ready but haven't deployed yet, or your CA's intermediate certificate hash.

The honest tradeoff: pinning makes certificate rotation operationally harder. Your server team can't swap certificates without coordinating with mobile. For apps with infrequent updates, aggressive pinning can be risky. I've seen teams use 6-month expiration windows with quarterly rotations as a compromise — tight enough to protect against CA compromise, loose enough to survive a missed deployment.

## TLS Configuration

OkHttp negotiates TLS during the connection handshake, and by default uses `ConnectionSpec.MODERN_TLS` — TLS 1.2 and 1.3 with strong cipher suites. For most apps, the defaults are correct. OkHttp's team actively tracks TLS security — they dropped SSL 3.0 after POODLE and removed RC4 ciphers in OkHttp 2.3. Keeping OkHttp updated is often more effective than manually configuring TLS.

But there are cases where you need tighter control. A fintech or healthcare app might need to enforce TLS 1.3 only and restrict cipher suites to a specific approved list. Here's how you do that with `ConnectionSpec`:

```kotlin
val strictTlsSpec = ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
    .tlsVersions(TlsVersion.TLS_1_3, TlsVersion.TLS_1_2)
    .cipherSuites(
        CipherSuite.TLS_AES_128_GCM_SHA256,
        CipherSuite.TLS_AES_256_GCM_SHA384,
        CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
        CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
    )
    .build()

val client = OkHttpClient.Builder()
    .connectionSpecs(listOf(strictTlsSpec))
    .build()
```

The first two cipher suites are TLS 1.3-only. The latter two are TLS 1.2 suites providing forward secrecy via ECDHE. I include TLS 1.2 as a fallback because some backend load balancers — especially older AWS ALBs — don't support TLS 1.3 yet.

Here's something that surprised me in the OkHttp source: `ConnectionSpec` also controls ALPN negotiation for HTTP/2. If you restrict to `CLEARTEXT` only, you lose HTTP/2 multiplexing. `MODERN_TLS` negotiates HTTP/2 automatically during the TLS handshake. Connection specs affect performance, not just security.

OkHttp also supports `COMPATIBLE_TLS` as a fallback for older servers. My recommendation: don't add it unless you actually hit handshake failures. Every fallback widens your attack surface.

## Proxy and VPN Protection

Proxy detection is one of those topics where "it depends" is the only honest answer. For a banking app, detecting that traffic is flowing through a proxy and blocking sensitive operations is reasonable — an attacker with a proxy can modify request and response bodies even over HTTPS if they've installed their own CA. For a news app, blocking proxy users would be hostile and unnecessary.

OkHttp respects the system proxy settings by default. When a user configures an HTTP proxy in their WiFi settings or runs a VPN that routes traffic through a proxy, OkHttp connects through it. You can detect this and make decisions:

```kotlin
class ProxyDetectionInterceptor(
    private val sensitiveEndpoints: Set<String>
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val connection = chain.connection()
        val route = connection?.route()

        if (route != null && route.proxy.type() != Proxy.Type.DIRECT) {
            val path = chain.request().url.encodedPath
            if (sensitiveEndpoints.any { path.startsWith(it) }) {
                throw IOException(
                    "Proxy detected. Sensitive operations blocked."
                )
            }
        }

        return chain.proceed(chain.request())
    }
}
```

This interceptor must be a **network interceptor** (`addNetworkInterceptor`), not an application interceptor. Application interceptors don't have access to the `Connection` object — they fire before OkHttp's routing logic runs. Network interceptors fire after the connection is established, so `chain.connection()` returns the actual connection with route and proxy information.

You can also bypass proxies entirely for specific calls by configuring OkHttp with `Proxy.NO_PROXY`:

```kotlin
val noProxyClient = baseClient.newBuilder()
    .proxy(Proxy.NO_PROXY)
    .build()
```

But here's the tradeoff I think about: `Proxy.NO_PROXY` also bypasses legitimate VPNs. Users in countries with internet restrictions use VPNs to access your app. Corporate users route through VPN proxies as part of their security policy. Blocking all proxy connections punishes legitimate users alongside attackers. IMO, the better approach for most apps is to detect proxies and apply risk-based decisions — tighter rate limits, additional verification steps, or blocking only the most sensitive endpoints like payment processing — rather than a blanket block.

## API Key Protection

This is the one I see developers get wrong most often: shipping API keys directly in the APK. Every string in your app is extractable. Running `apktool d myapp.apk` followed by a grep for "api_key" or "Bearer" takes about 30 seconds. `BuildConfig` fields, string resources, hardcoded constants — they're all in the decompiled output. R8 obfuscation renames classes and methods, but it does not encrypt string constants. Your API key sitting in `BuildConfig.API_KEY` is readable in the DEX bytecode.

The first line of defense is simple: don't put secrets in the APK at all. For third-party API keys you need at build time (maps, analytics, crash reporting), use the Secrets Gradle Plugin. It reads keys from `local.properties` (which is gitignored) and injects them into `BuildConfig` at build time:

```kotlin
// In local.properties (gitignored, never committed)
// MAPS_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxx

// In build.gradle.kts
plugins {
    id("com.google.android.libraries.mapsplatform.secrets-gradle-plugin")
}

secrets {
    propertiesFileName = "local.properties"
    defaultPropertiesFileName = "local.defaults.properties"
}

// Access in code
val mapsKey = BuildConfig.MAPS_API_KEY
```

This keeps keys out of source control, which is the minimum bar. But the key is still in the compiled APK — the Secrets plugin injects it at build time just like any other `BuildConfig` field. For keys that truly cannot be exposed (payment gateway keys, private API keys with write access), the answer is **server-side proxying**. Your app authenticates with your backend using a short-lived token. Your backend holds the third-party API key and makes the call on behalf of the app. The key never reaches the client.

Firebase App Check adds another layer here. It verifies that requests to your backend come from your genuine app running on a real device — not from a script, a modified APK, or an emulator. Your backend validates the App Check token before processing the request. This doesn't replace authentication, but it raises the bar significantly for automated abuse.

```kotlin
class SecureApiClient(
    private val appCheckProvider: FirebaseAppCheck
) {
    suspend fun makeSecureRequest(
        client: OkHttpClient,
        request: Request
    ): Response {
        val appCheckToken = appCheckProvider
            .getAppCheckToken(false)
            .await()
            .token

        val securedRequest = request.newBuilder()
            .addHeader("X-Firebase-AppCheck", appCheckToken)
            .build()

        return client.newCall(securedRequest).execute()
    }
}
```

The reframe on API key security: **the question isn't "how do I hide my key?" — it's "what happens if someone extracts it?"** If the key is read-only and rate-limited (like a Maps API key restricted to your app's package name and SHA-1 fingerprint), extraction is low-risk. If the key has write access or costs money per call, it should never be on the client. Design your security model around the assumption that anything in the APK will be extracted, and you'll make much better decisions about what belongs on the client versus the server.

---

## Quiz

**Question 1:** Your app's Network Security Config has `cleartextTrafficPermitted="false"` in `base-config`. A teammate adds a new `domain-config` for `legacy-api.internal.com` but doesn't set `cleartextTrafficPermitted` in it. Can this domain use HTTP?

**Wrong** — It cannot. Values not set in a `domain-config` inherit from `base-config`. Since `base-config` has `cleartextTrafficPermitted="false"`, the new domain config inherits that restriction. The teammate would need to explicitly set `cleartextTrafficPermitted="true"` in the `domain-config` to allow HTTP for that domain. This inheritance behavior is intentional — it ensures new domain configurations are secure by default.

**Question 2:** You're using OkHttp's `CertificatePinner` to pin your API server's certificate. Your server team rotates to a new certificate with the same public key but a new expiration date. Will your app still connect?

**Correct** — It will. `CertificatePinner` pins the SHA-256 hash of the certificate's `SubjectPublicKeyInfo` (the public key), not the certificate itself. If the server rotates to a new certificate that uses the same key pair, the public key hash remains the same and the pin matches. This is why public key pinning is preferred over certificate pinning — it survives certificate renewals as long as the key pair doesn't change.

---

## Coding Challenge

Build a network security layer for a financial app. Create a `SecureNetworkClient` that configures OkHttp with certificate pinning for `api.financeapp.com` (include a primary and backup pin), enforces TLS 1.2+ with only GCM cipher suites, and adds a network interceptor that detects proxy connections and blocks requests to `/payments/*` endpoints when proxied. Then write a companion Network Security Config XML that mirrors the pinning configuration with a 6-month expiration, disables cleartext traffic globally, and adds `debug-overrides` for development proxy tools. Finally, add a `TokenSecurityInterceptor` (application interceptor) that injects an auth token from encrypted storage and handles 401 responses by refreshing the token once before failing.

Thanks for reading!
