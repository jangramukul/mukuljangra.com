---
title: "Networking & API Communication"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 6
---

## Networking & API Communication — What Interviewers Really Ask

Networking is the backbone of almost every Android app, and interviewers know it. This topic comes up in nearly every technical round because it reveals whether you understand what's happening between your app and the server, not just the API surface of Retrofit. Expect questions ranging from basic HTTP concepts to OkHttp internals and real-world caching strategies.

### Core Questions (Beginner → Intermediate)

#### Q1: How does a typical network request work in an Android app? Walk through the full stack.

When you call something like `repository.getUser(id)` in a modern Android app, a lot happens underneath. Your code calls a Retrofit interface method, which Retrofit turns into an OkHttp `Request` object using the annotations you provided (`@GET`, `@Path`, `@Query`, etc.). OkHttp then runs that request through its interceptor chain — application interceptors first, then the built-in interceptors for retries, redirects, bridging (adding headers like `Content-Type`, `Accept-Encoding`), caching, and finally the actual network call. The `CallServerInterceptor` at the bottom of the chain writes the HTTP request to a socket and reads the response. The raw response bytes come back up through the chain, get decoded (potentially gzip-decompressed), and Retrofit hands the response body to a converter (Moshi, kotlinx.serialization, or Gson) which deserializes the JSON into your Kotlin data class. The whole thing typically runs on `Dispatchers.IO` if you're using Retrofit's coroutine support.

The reason interviewers ask this is to check whether you understand the layers. Too many candidates treat Retrofit as a black box.

#### Q2: What is the difference between OkHttp and Retrofit?

OkHttp is a low-level HTTP client. It handles connections, connection pooling, TLS handshakes, HTTP/2 multiplexing, gzip decompression, retries, redirects, and caching. It works with raw `Request` and `Response` objects. Retrofit is a type-safe REST client that sits on top of OkHttp. It takes your Kotlin interface with annotated methods and generates the OkHttp requests for you, handles serialization/deserialization through converters, and integrates with coroutines or RxJava through call adapters. You could use OkHttp directly without Retrofit, and many apps do for WebSocket connections or non-REST APIs. But Retrofit removes the boilerplate of manually building requests and parsing responses for REST endpoints.

#### Q3: What are OkHttp interceptors and what's the difference between application and network interceptors?

Interceptors are OkHttp's mechanism for observing, modifying, and potentially short-circuiting requests and responses. Think of them as middleware. Application interceptors (added via `addInterceptor()`) run once per logical request — they don't see retries or redirects, and they always get called even if the response comes from the cache. Network interceptors (added via `addNetworkInterceptor()`) run per physical network call — they see retries and redirects, they can access the actual connection (IP address, TLS version), but they don't run when the response is served from cache.

```kotlin
val client = OkHttpClient.Builder()
    // Application interceptor — runs once per call
    .addInterceptor { chain ->
        val request = chain.request().newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        chain.proceed(request)
    }
    // Network interceptor — runs per network call
    .addNetworkInterceptor(HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    })
    .build()
```

The practical rule: use application interceptors for adding auth headers (you want them on every request, including retried ones) and network interceptors for logging (you want to see the actual network traffic, not cached responses).

#### Q4: How does OkHttp's connection pooling work, and why does it matter?

Opening a TCP connection is expensive — there's the TCP three-way handshake, and for HTTPS you add a TLS handshake on top. That's multiple round trips before a single byte of your actual data goes through. OkHttp maintains a `ConnectionPool` that keeps idle connections alive for reuse. By default, it keeps up to 5 idle connections and evicts them after 5 minutes of inactivity. When a new request goes to the same host, OkHttp checks the pool first before opening a new connection. With HTTP/2, it goes further — multiple requests to the same host are multiplexed over a single connection, so you might only need one connection to your API server handling dozens of concurrent requests. This is one of the biggest performance wins OkHttp gives you out of the box, and most developers never think about it.

#### Q5: How does Retrofit's converter system work?

When Retrofit receives a response, it needs to turn the raw bytes into your Kotlin objects. That's the converter's job. You register converters when building the Retrofit instance, and Retrofit tries them in order until one says it can handle the type. The most common converters are `MoshiConverterFactory`, `KotlinxSerializationConverterFactory`, and `GsonConverterFactory`. Converters handle both directions — serializing request bodies and deserializing response bodies.

```kotlin
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.example.com/")
    .client(okHttpClient)
    .addConverterFactory(MoshiConverterFactory.create(moshi))
    .build()

interface UserApi {
    @GET("users/{id}")
    suspend fun getUser(@Path("id") id: String): UserResponse

    @POST("users")
    suspend fun createUser(@Body user: CreateUserRequest): UserResponse
}
```

The order matters if you have multiple converters — Retrofit iterates through them and uses the first one that can handle the type. In practice, most apps use just one converter.

#### Q6: What's the difference between Gson, Moshi, and kotlinx.serialization?

All three are JSON serialization libraries, but they differ significantly in how they work. Gson uses reflection at runtime to map JSON fields to class properties. It's the oldest, widely used, but has issues with Kotlin — it can bypass `null` safety and create objects without calling constructors. Moshi was built by the same team (Square) as a modern replacement. It supports Kotlin properly through its `moshi-kotlin-codegen` artifact, which generates adapters at compile time using KSP, avoiding reflection entirely. kotlinx.serialization is JetBrains' first-party solution — it's Kotlin-native, uses a compiler plugin to generate serializers, supports multiple formats (JSON, Protobuf, CBOR), and is the only option that works with Kotlin Multiplatform. For new Android projects, the practical choice is between Moshi (if you're Android-only) and kotlinx.serialization (if you're doing KMP or want the compiler plugin approach).

#### Q7: What HTTP caching strategies do you know, and how does OkHttp handle them?

HTTP caching is governed by headers. The `Cache-Control` header tells the client how long a response is fresh (`max-age`), whether it can be cached at all (`no-store`), or whether it must be revalidated before use (`no-cache`, `must-revalidate`). Conditional caching uses `ETag` and `Last-Modified` headers — the client sends `If-None-Match` or `If-Modified-Since`, and the server returns either a `304 Not Modified` (saving bandwidth) or the full response.

OkHttp has a built-in cache that respects these headers. You enable it by passing a `Cache` object with a directory and max size.

```kotlin
val cache = Cache(
    directory = File(context.cacheDir, "http_cache"),
    maxSize = 10L * 1024 * 1024 // 10 MB
)

val client = OkHttpClient.Builder()
    .cache(cache)
    .build()
```

OkHttp follows the HTTP spec — it caches responses based on `Cache-Control` headers from the server. If the server doesn't send caching headers, you can override this using a `CacheControl` on individual requests or with a network interceptor that rewrites response headers. The cache is stored using DiskLruCache under the hood.

#### Q8: What is certificate pinning and why would you use it?

Certificate pinning means your app only trusts specific certificates or public keys for a given domain, rather than trusting any certificate signed by any Certificate Authority in the device's trust store. This protects against man-in-the-middle attacks where an attacker has a compromised or rogue CA certificate. OkHttp supports this natively through `CertificatePinner`.

```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add(
        "api.example.com",
        "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    )
    .add(
        "api.example.com",
        "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
    )
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

Always pin at least two keys — your current one and a backup. If you only pin one and need to rotate your certificate, every app version with the old pin breaks. The tradeoff is that pinning makes certificate rotation harder and can cause outages if managed incorrectly. You can also configure pinning declaratively through Android's `network_security_config.xml`.

### Deep Dive Questions (Advanced → Expert)

#### Q9: Walk through OkHttp's interceptor chain in order. What does each built-in interceptor do?

OkHttp chains interceptors in a specific order: `RetryAndFollowUpInterceptor` handles retries on failure and follows HTTP redirects (301, 302, etc.) up to 20 times. `BridgeInterceptor` adds necessary headers the user didn't set — `Content-Type`, `Content-Length`, `Host`, `Accept-Encoding: gzip`, cookie handling. It also decompresses gzip responses. `CacheInterceptor` checks the local cache before making a network request and stores cacheable responses. `ConnectInterceptor` opens a connection to the target server (or reuses one from the pool), performs the TLS handshake for HTTPS. `CallServerInterceptor` writes the request and reads the response over the connection.

Application interceptors run before the entire chain, and network interceptors run between `ConnectInterceptor` and `CallServerInterceptor`. This ordering is why application interceptors see the original request but network interceptors see the modified request with all the bridge headers.

#### Q10: How does Retrofit's suspend function support work under the hood?

When you declare a Retrofit method as `suspend`, Retrofit detects the `Continuation` parameter that the Kotlin compiler adds. It creates a `Call<T>` internally but instead of returning it directly, it uses `suspendCancellableCoroutine` to bridge the callback-based OkHttp call to the coroutine world. The call is enqueued asynchronously on OkHttp's dispatcher (which uses its own thread pool), and when the response arrives, the coroutine resumes on the calling dispatcher. Crucially, Retrofit also hooks into coroutine cancellation — if you cancel the coroutine scope, it cancels the underlying OkHttp call. This means if a user navigates away and your `viewModelScope` is cancelled, in-flight network requests are actually cancelled, not just ignored.

#### Q11: REST vs GraphQL — when would you choose one over the other on mobile?

REST gives you fixed endpoints that return a predetermined shape of data. GraphQL gives you a single endpoint where the client specifies exactly which fields it needs. On mobile, GraphQL's precision matters — you can avoid over-fetching (getting 30 fields when you only need 5 for a list item) and under-fetching (needing 3 REST calls to assemble one screen). That means less data over the wire and fewer round trips, both critical on mobile networks. However, GraphQL has real tradeoffs. HTTP caching doesn't work well because every request is a POST to the same endpoint with a different body. You lose the simplicity of REST's URL-based caching. The client complexity is higher — you need a GraphQL client like Apollo, which adds to your app size. Batching and pagination are more complex. And on the server side, query complexity analysis is necessary to prevent clients from requesting deeply nested, expensive queries. For most Android apps with a backend you control, REST with well-designed endpoints is simpler and works fine. GraphQL shines when you have many clients (iOS, Android, web) with different data needs hitting the same backend.

#### Q12: What is the difference between WebSocket and Server-Sent Events (SSE)?

Both enable server-to-client push, but they work differently. WebSocket is a full-duplex protocol — after the initial HTTP handshake upgrade, both client and server can send messages at any time over a persistent TCP connection. SSE is a one-way channel — the server pushes events to the client over a regular HTTP connection using the `text/event-stream` content type. The client can't send data back over the same connection.

WebSocket is the right choice for bidirectional communication like chat apps, real-time collaboration, or gaming. SSE is simpler and better for one-way scenarios like live scores, notification streams, or server progress updates. SSE also works over standard HTTP, so proxies and load balancers handle it more naturally. OkHttp has built-in WebSocket support. For SSE on Android, you'd typically use OkHttp with a streaming response body or a library like `okhttp-sse`.

#### Q13: How would you implement request deduplication in a network layer?

When the user rapidly refreshes or when multiple UI components request the same data, you might fire duplicate network calls. A common pattern is to keep a map of in-flight requests keyed by some identifier (like the URL or a request hash). When a new request comes in, check the map. If the same request is already in flight, return the existing deferred result instead of starting a new one.

```kotlin
class DeduplicatingApiClient(private val api: UserApi) {
    private val inFlight = ConcurrentHashMap<String, Deferred<UserResponse>>()

    suspend fun getUser(id: String): UserResponse {
        val key = "user:$id"
        val existing = inFlight[key]
        if (existing != null && existing.isActive) {
            return existing.await()
        }

        val deferred = coroutineScope {
            async {
                try {
                    api.getUser(id)
                } finally {
                    inFlight.remove(key)
                }
            }
        }
        inFlight[key] = deferred
        return deferred.await()
    }
}
```

This avoids redundant network calls and ensures all callers get the same result. In production, you'd want to handle the race condition between the `if` check and the `put` more carefully, potentially using `Mutex` or `ConcurrentHashMap.putIfAbsent`.

#### Q14: What is Ktor client and how does it compare to OkHttp + Retrofit?

Ktor is JetBrains' HTTP client built from the ground up with Kotlin coroutines. It's a first-class coroutine library — every operation is a suspend function, there's no callback-based API underneath. Ktor is also multiplatform — it runs on Android, iOS, JVM, JS, and native targets, using different engines under the hood (OkHttp engine on Android, Darwin engine on iOS, CIO for pure Kotlin). The API is quite different from Retrofit — there's no annotation-based interface generation. You build requests programmatically using a DSL.

```kotlin
val client = HttpClient(OkHttp) {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true })
    }
    install(Logging) {
        level = LogLevel.BODY
    }
}

suspend fun getUser(id: String): UserResponse {
    return client.get("https://api.example.com/users/$id").body()
}
```

The main reason to choose Ktor is Kotlin Multiplatform. If you're sharing networking code between Android and iOS, Ktor is the natural choice. For Android-only projects, OkHttp + Retrofit is more mature, has better tooling, and most Android developers are already familiar with it.

#### Q15: How do you handle network connectivity changes and offline scenarios?

The modern approach uses `ConnectivityManager` with a `NetworkCallback` to observe network state changes reactively. You register the callback and get notified when network becomes available or lost.

```kotlin
class NetworkMonitor(context: Context) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    val isOnline: StateFlow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(true)
            }
            override fun onLost(network: Network) {
                trySend(false)
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)

        // Check initial state
        val currentNetwork = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(currentNetwork)
        trySend(capabilities?.hasCapability(
            NetworkCapabilities.NET_CAPABILITY_INTERNET
        ) == true)

        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.stateIn(CoroutineScope(Dispatchers.Default), SharingStarted.Eagerly, false)
}
```

But connectivity doesn't guarantee reachability — you can be connected to Wi-Fi but the router might not have internet. A robust solution combines `ConnectivityManager` checks with actual network request results. For offline-first, queue failed requests using Room or WorkManager and retry when the network is back. Google's `Now in Android` sample app has a good reference implementation of network monitoring.

#### Q16: What is the Network Security Configuration and when do you need it?

Android's `network_security_config.xml` lets you customize your app's network security settings declaratively, without changing code. You can specify trusted CAs for specific domains, enable or disable cleartext (HTTP) traffic, configure certificate pinning, and set up debug-only overrides. Starting from Android 9 (API 28), cleartext traffic is blocked by default, so if you need to hit an HTTP endpoint (say, during development), you either configure it here or add `android:usesCleartextTraffic="true"` in the manifest. The configuration file is also where you'd set up pins for certificate pinning as an alternative to OkHttp's `CertificatePinner`.

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2027-01-01">
            <pin digest="SHA-256">base64EncodedPin1=</pin>
            <pin digest="SHA-256">base64EncodedPin2=</pin>
        </pin-set>
    </domain-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

The `debug-overrides` section is especially useful — it lets you trust user-installed certificates (like Charles Proxy) only in debug builds, without weakening production security.

#### Q17: How do you handle authentication tokens and refresh flows in a network layer?

The standard pattern is an OkHttp `Authenticator` combined with an interceptor. The interceptor attaches the current access token to every request. When a request returns a `401 Unauthorized`, OkHttp calls the `Authenticator`, which refreshes the token and retries the request with the new token. The tricky part is handling concurrent requests — if multiple requests fail with 401 simultaneously, you don't want to trigger multiple token refreshes. You need synchronization around the refresh logic.

```kotlin
class TokenAuthenticator(
    private val tokenManager: TokenManager
) : Authenticator {

    private val refreshLock = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Don't retry infinitely
        if (response.retryCount >= 2) return null

        return runBlocking {
            refreshLock.withLock {
                // Check if another thread already refreshed
                val currentToken = tokenManager.getAccessToken()
                val requestToken = response.request.header("Authorization")
                    ?.removePrefix("Bearer ")

                if (currentToken != requestToken) {
                    // Token was already refreshed by another request
                    return@runBlocking response.request.newBuilder()
                        .header("Authorization", "Bearer $currentToken")
                        .build()
                }

                // Actually refresh the token
                val newToken = tokenManager.refreshToken()
                if (newToken != null) {
                    response.request.newBuilder()
                        .header("Authorization", "Bearer $newToken")
                        .build()
                } else {
                    // Refresh failed — force logout
                    tokenManager.logout()
                    null
                }
            }
        }
    }
}

private val Response.retryCount: Int
    get() {
        var count = 0
        var current = priorResponse
        while (current != null) {
            count++
            current = current.priorResponse
        }
        return count
    }
```

This is one of those questions where interviewers are testing whether you've actually implemented this in production. The Mutex preventing concurrent refreshes and the check for stale tokens are the details that separate theoretical knowledge from real experience.

#### Q18: What is the difference between short polling, long polling, and WebSocket? When would you use each?

**Short polling** means the client sends a request to the server at regular intervals (say every 5 seconds) asking "do you have anything new?" The server responds immediately — either with new data or an empty response. It's simple to implement but wasteful: most responses return nothing, and you're burning battery and bandwidth on empty requests. It also has inherent latency — you only discover new data on the next poll interval.

**Long polling** is a smarter variation. The client sends a request, and the server holds the connection open until it has new data (or a timeout expires, typically 30-60 seconds). Once the server responds, the client immediately sends another request. This gives you near-real-time delivery without the wasted requests. The downside is that each response-request cycle has a small gap, and you need to handle connection timeouts and reconnection logic carefully.

**WebSocket** upgrades an HTTP connection to a persistent, full-duplex TCP connection. Both sides can send messages at any time with minimal overhead (just a 2-byte frame header vs full HTTP headers). It's the right choice for truly real-time, bidirectional communication — chat apps, live trading, collaborative editing.

The decision framework: use short polling for low-frequency, non-critical updates where simplicity matters (checking for app updates every hour). Use long polling when you need near-real-time but can't use WebSocket (some corporate proxies block WebSocket upgrades). Use WebSocket for anything that needs real-time bidirectional communication. In practice, most Android chat apps use WebSocket with a long-polling fallback.

#### Q19: What is the difference between JSON and Protocol Buffers? When would you use each?

JSON is a text-based data format that's human-readable — you can open it in a text editor and understand it. Protocol Buffers (protobuf) is Google's binary serialization format that's not human-readable but is significantly more efficient. Protobuf messages are 3-10x smaller than their JSON equivalents because binary encoding eliminates field name repetition, uses variable-length encoding for integers, and has no whitespace. Parsing is also faster — protobuf deserialization is typically 20-100x faster than JSON parsing because the binary format maps directly to memory without string parsing.

```kotlin
// JSON — human readable, larger, slower parsing
// {"userId": 42, "name": "Mukul", "isVerified": true}

// Protocol Buffers — schema-defined, binary, faster
// message User {
//   int32 user_id = 1;
//   string name = 2;
//   bool is_verified = 3;
// }
```

The tradeoffs: JSON is universal — every language and tool supports it, debugging is easy because you can read the payload, and you don't need schema files. Protobuf requires `.proto` schema files, code generation, and debugging is harder since you can't read the binary payload. Protobuf also requires both client and server to share the same schema version, which adds coordination overhead.

Use JSON for public APIs, REST endpoints, and when debuggability matters more than performance. Use protobuf for high-throughput internal APIs, gRPC services, when bandwidth or parsing speed is critical (like a chat app sending thousands of messages), and for Jetpack DataStore's Proto DataStore variant.

#### Q20: What is an unmetered network constraint and how does it affect background work?

An unmetered network is a connection type that doesn't count against a user's data plan — typically Wi-Fi. A metered network is one with data limits — cellular connections, mobile hotspots, and some capped Wi-Fi networks. Android's `ConnectivityManager` reports this through `NetworkCapabilities.NET_CAPABILITY_NOT_METERED`.

This matters for WorkManager constraints. When scheduling large transfers — uploading a batch of photos, syncing a large database, downloading offline content — you should constrain to unmetered networks to avoid burning through the user's data plan.

```kotlin
val bulkSyncRequest = OneTimeWorkRequestBuilder<BulkSyncWorker>()
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED) // Wi-Fi only
            .setRequiresBatteryNotLow(true)
            .build()
    )
    .build()
```

`NetworkType.CONNECTED` accepts any network (metered or unmetered). `NetworkType.UNMETERED` waits specifically for an unmetered connection. `NetworkType.NOT_ROAMING` avoids roaming networks. Choosing the right constraint shows you think about the user's data costs and battery, not just whether the request can technically complete.

#### Q21: What are Retrofit call adapters and when would you use a custom one?

Call adapters control the return type of Retrofit interface methods. By default, Retrofit returns `Call<T>`. When you add `addCallAdapterFactory(RxJava3CallAdapterFactory.create())`, you can return `Observable<T>`, `Single<T>`, or `Flowable<T>`. Kotlin coroutine support is built into Retrofit 2.6+ — any `suspend` function automatically uses the built-in coroutine call adapter without needing a factory.

```kotlin
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.example.com/")
    .addConverterFactory(MoshiConverterFactory.create())
    // Call adapter for RxJava (if not using coroutines)
    .addCallAdapterFactory(RxJava3CallAdapterFactory.create())
    .build()

interface UserApi {
    // Uses built-in coroutine adapter — no factory needed
    suspend fun getUser(@Path("id") id: String): UserResponse

    // Uses RxJava adapter
    fun getUserRx(@Path("id") id: String): Single<UserResponse>

    // Raw Call — default, no adapter needed
    fun getUserCall(@Path("id") id: String): Call<UserResponse>
}
```

You'd write a custom call adapter when you need to wrap responses in a custom Result type, add global error handling, or integrate with a proprietary async framework. For example, wrapping every response in a `NetworkResult<T>` sealed class that distinguishes between success, server error, and network failure — so individual call sites don't need try-catch blocks.

### Common Follow-ups

- How would you unit test a Retrofit service?
- What's the difference between `@Field` and `@Body` in Retrofit?
- How does HTTP/2 multiplexing work and why does it matter for mobile?
- What happens when you set `Cache-Control: no-cache` vs `Cache-Control: no-store`?
- How would you implement a retry strategy with exponential backoff?
- What's the difference between `enqueue()` and `execute()` in OkHttp?
- How does gzip compression work in OkHttp, and do you need to configure it?
- What serialization format would you use for a Kotlin Multiplatform project?

### Tips for the Interview

1. **Know the layers** — Don't just say "I use Retrofit." Show you understand that Retrofit sits on OkHttp, which sits on java.net sockets. Being able to explain the full stack shows depth.

2. **Interceptors are the key topic** — Interceptors are the most practical OkHttp concept. Know the difference between application and network interceptors, have real examples ready (auth headers, logging, caching overrides), and know the ordering.

3. **Talk about real tradeoffs** — When comparing Gson vs Moshi vs kotlinx.serialization, don't just list features. Explain when you'd pick each one and why. Interviewers want to hear decision-making, not feature recitation.

4. **Be ready for caching questions** — HTTP caching is a commonly tested area because it involves both client and server understanding. Know `Cache-Control`, `ETag`, `Last-Modified`, and how OkHttp's cache interacts with them.

5. **Show production awareness** — Mention things like token refresh race conditions, request deduplication, and connectivity monitoring. These signal you've built and maintained real networking code, not just followed tutorials.
