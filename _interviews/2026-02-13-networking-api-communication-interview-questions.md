---
title: "Networking & API Communication"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 6
sequence: 6
---

## Networking & API Communication

Networking questions cover HTTP concepts, OkHttp internals, and caching strategies.

### Core Questions (Beginner → Intermediate)

#### Q1: How does a typical network request work in an Android app? Walk through the full stack.

Your code calls a Retrofit interface method. Retrofit converts the annotations (`@GET`, `@Path`, `@Query`, etc.) into an OkHttp `Request` object. OkHttp runs that request through its interceptor chain — application interceptors first, then built-in interceptors for retries, redirects, bridging (adding headers like `Content-Type`, `Accept-Encoding`), caching, and finally the network call. The `CallServerInterceptor` writes the HTTP request to a socket and reads the response.

The raw response comes back up through the chain, gets decoded (gzip-decompressed if needed), and Retrofit hands the body to a converter (Moshi, kotlinx.serialization, or Gson) which deserializes the JSON into your Kotlin data class. With Retrofit's coroutine support, the whole thing runs on `Dispatchers.IO`.

#### Q2: What is the difference between OkHttp and Retrofit?

OkHttp is a low-level HTTP client. It handles connections, connection pooling, TLS handshakes, HTTP/2 multiplexing, gzip decompression, retries, redirects, and caching. It works with raw `Request` and `Response` objects.

Retrofit is a type-safe REST client that sits on top of OkHttp. It takes your Kotlin interface with annotated methods and generates OkHttp requests, handles serialization/deserialization through converters, and integrates with coroutines or RxJava through call adapters. You can use OkHttp directly without Retrofit for WebSocket connections or non-REST APIs, but Retrofit removes the boilerplate for REST endpoints.

#### Q3: What are OkHttp interceptors and what's the difference between application and network interceptors?

Interceptors are used for observing, modifying, and short-circuiting requests and responses. Application interceptors (added via `addInterceptor()`) run once per logical request — they don't see retries or redirects, and they always get called even if the response comes from cache. Network interceptors (added via `addNetworkInterceptor()`) run per physical network call — they see retries and redirects and can access the actual connection (IP address, TLS version), but they don't run when the response is served from cache.

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

Use application interceptors for adding auth headers and network interceptors for logging actual network traffic.

#### Q4: How does OkHttp's connection pooling work, and why does it matter?

Opening a TCP connection requires a three-way handshake, and HTTPS adds a TLS handshake on top. OkHttp maintains a `ConnectionPool` that keeps idle connections alive for reuse. By default, it keeps up to 5 idle connections and evicts them after 5 minutes of inactivity.

When a new request goes to the same host, OkHttp checks the pool first before opening a new connection. With HTTP/2, multiple requests to the same host are multiplexed over a single connection, so you might only need one connection handling dozens of concurrent requests.

#### Q5: How does Retrofit's converter system work?

Converters turn raw response bytes into Kotlin objects and serialize request bodies. You register converters when building the Retrofit instance, and Retrofit tries them in order until one can handle the type. Common converters are `MoshiConverterFactory`, `KotlinxSerializationConverterFactory`, and `GsonConverterFactory`.

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

If you have multiple converters, the order matters — Retrofit uses the first one that can handle the type. Most apps use just one converter.

#### Q6: What's the difference between Gson, Moshi, and kotlinx.serialization?

All three are JSON serialization libraries but they work differently.
- Gson uses reflection at runtime. It's the oldest and widely used, but has issues with Kotlin — it can bypass null safety and create objects without calling constructors.
- Moshi was built by Square as a modern replacement. It supports Kotlin properly through `moshi-kotlin-codegen`, which generates adapters at compile time using KSP and avoids reflection.
- kotlinx.serialization is JetBrains' first-party solution. It uses a compiler plugin to generate serializers, supports multiple formats (JSON, Protobuf, CBOR), and is the only option that works with Kotlin Multiplatform.

For new Android projects, the choice is between Moshi (Android-only) and kotlinx.serialization (KMP or compiler plugin approach).

#### Q7: What HTTP caching strategies do you know, and how does OkHttp handle them?

HTTP caching is governed by headers. `Cache-Control` tells the client how long a response is fresh (`max-age`), whether it can be cached (`no-store`), or whether it must be revalidated (`no-cache`, `must-revalidate`). Conditional caching uses `ETag` and `Last-Modified` headers — the client sends `If-None-Match` or `If-Modified-Since`, and the server returns either a `304 Not Modified` or the full response.

OkHttp has a built-in cache that respects these headers. You enable it by passing a `Cache` object.

```kotlin
val cache = Cache(
    directory = File(context.cacheDir, "http_cache"),
    maxSize = 10L * 1024 * 1024 // 10 MB
)

val client = OkHttpClient.Builder()
    .cache(cache)
    .build()
```

OkHttp caches responses based on `Cache-Control` headers from the server. If the server doesn't send caching headers, you can override this using `CacheControl` on individual requests or with a network interceptor that rewrites response headers. The cache uses DiskLruCache under the hood.

#### Q8: What is certificate pinning and why would you use it?

Certificate pinning means your app only trusts specific certificates or public keys for a given domain, instead of trusting any certificate signed by any CA in the device's trust store. This protects against man-in-the-middle attacks where an attacker has a compromised CA certificate. OkHttp supports this through `CertificatePinner`.

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

Always pin at least two keys — your current one and a backup. If you only pin one and need to rotate your certificate, every app version with the old pin breaks. You can also configure pinning declaratively through Android's `network_security_config.xml`.

### Deep Dive Questions (Advanced → Expert)

#### Q9: Walk through OkHttp's interceptor chain in order. What does each built-in interceptor do?

OkHttp chains interceptors in this order:
- `RetryAndFollowUpInterceptor` — handles retries on failure and follows HTTP redirects (301, 302, etc.) up to 20 times.
- `BridgeInterceptor` — adds headers the user didn't set (`Content-Type`, `Content-Length`, `Host`, `Accept-Encoding: gzip`, cookies). Also decompresses gzip responses.
- `CacheInterceptor` — checks the local cache before making a network request and stores cacheable responses.
- `ConnectInterceptor` — opens a connection to the server (or reuses one from the pool) and performs the TLS handshake for HTTPS.
- `CallServerInterceptor` — writes the request and reads the response over the connection.

Application interceptors run before the entire chain. Network interceptors run between `ConnectInterceptor` and `CallServerInterceptor`. This is why application interceptors see the original request but network interceptors see the modified request with all the bridge headers.

#### Q10: How does Retrofit's suspend function support work under the hood?

When you declare a Retrofit method as `suspend`, Retrofit detects the `Continuation` parameter that the Kotlin compiler adds. It creates a `Call<T>` internally but uses `suspendCancellableCoroutine` to bridge the callback-based OkHttp call to the coroutine world. The call is enqueued on OkHttp's dispatcher (its own thread pool), and when the response arrives, the coroutine resumes on the calling dispatcher.

Retrofit also hooks into coroutine cancellation — if you cancel the coroutine scope, it cancels the underlying OkHttp call. So if a user navigates away and `viewModelScope` is cancelled, in-flight network requests are actually cancelled, not just ignored.

#### Q11: REST vs GraphQL — when would you choose one over the other on mobile?

REST gives you fixed endpoints that return a predetermined shape of data. GraphQL gives you a single endpoint where the client specifies exactly which fields it needs.

GraphQL advantages on mobile:
- Avoids over-fetching (getting 30 fields when you only need 5)
- Avoids under-fetching (needing 3 REST calls to assemble one screen)
- Less data over the wire and fewer round trips

GraphQL tradeoffs:
- HTTP caching doesn't work well because every request is a POST to the same endpoint
- Higher client complexity — you need a GraphQL client like Apollo
- Server needs query complexity analysis to prevent expensive nested queries

For most Android apps with a backend you control, REST with well-designed endpoints is simpler. GraphQL works better when you have many clients (iOS, Android, web) with different data needs hitting the same backend.

#### Q12: What is the difference between WebSocket and Server-Sent Events (SSE)?

WebSocket is a full-duplex protocol. After the initial HTTP handshake upgrade, both client and server can send messages at any time over a persistent TCP connection. SSE is one-way — the server pushes events to the client over a regular HTTP connection using `text/event-stream` content type. The client can't send data back over the same connection.

WebSocket is used for bidirectional communication like chat apps, real-time collaboration, or gaming. SSE is simpler and better for one-way scenarios like live scores, notification streams, or server progress updates. SSE also works over standard HTTP, so proxies and load balancers handle it more naturally. OkHttp has built-in WebSocket support. For SSE, you can use OkHttp with a streaming response body or a library like `okhttp-sse`.

#### Q13: How would you implement request deduplication in a network layer?

When the user rapidly refreshes or multiple UI components request the same data, you might fire duplicate network calls. The approach is to keep a map of in-flight requests keyed by an identifier (like URL or request hash). When a new request comes in, check the map — if the same request is already in flight, return the existing deferred result instead of starting a new one.

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

This avoids redundant network calls and ensures all callers get the same result. In production, you would handle the race condition between the check and the put using `Mutex` or `ConcurrentHashMap.putIfAbsent`.

#### Q14: What is Ktor client and how does it compare to OkHttp + Retrofit?

Ktor is JetBrains' HTTP client built with Kotlin coroutines. Every operation is a suspend function with no callback-based API underneath. Ktor is multiplatform — it runs on Android, iOS, JVM, JS, and native targets, using different engines (OkHttp on Android, Darwin on iOS, CIO for pure Kotlin). Unlike Retrofit, there's no annotation-based interface generation. You build requests using a DSL.

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

The main reason to choose Ktor is Kotlin Multiplatform. If you're sharing networking code between Android and iOS, Ktor is the natural choice. For Android-only projects, OkHttp + Retrofit is more mature and has better tooling.

#### Q15: How do you handle network connectivity changes and offline scenarios?

Use `ConnectivityManager` with a `NetworkCallback` to observe network state changes. You register the callback and get notified when network becomes available or lost.

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

Connectivity doesn't guarantee reachability — you can be connected to Wi-Fi but the router might not have internet. A robust solution combines `ConnectivityManager` checks with actual network request results. For offline-first, queue failed requests using Room or WorkManager and retry when the network is back.

#### Q16: What is the Network Security Configuration and when do you need it?

`network_security_config.xml` lets you customize your app's network security settings declaratively. You can specify trusted CAs for specific domains, enable or disable cleartext (HTTP) traffic, configure certificate pinning, and set up debug-only overrides. Starting from Android 9 (API 28), cleartext traffic is blocked by default. To hit an HTTP endpoint during development, you configure it here or add `android:usesCleartextTraffic="true"` in the manifest.

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

The `debug-overrides` section lets you trust user-installed certificates (like Charles Proxy) only in debug builds without weakening production security.

#### Q17: How do you handle authentication tokens and refresh flows in a network layer?

The standard pattern uses an OkHttp `Authenticator` combined with an interceptor. The interceptor attaches the current access token to every request. When a request returns `401 Unauthorized`, OkHttp calls the `Authenticator`, which refreshes the token and retries the request. For concurrent requests, you need synchronization so that multiple 401 responses don't trigger multiple token refreshes.

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

The `Mutex` prevents concurrent refreshes, and the stale token check avoids refreshing when another request already refreshed the token.

#### Q18: What is the difference between short polling, long polling, and WebSocket? When would you use each?

**Short polling** — the client sends requests to the server at regular intervals (e.g., every 5 seconds). The server responds immediately with new data or an empty response. Simple to implement but wasteful — most responses return nothing, and it has inherent latency since you only discover new data on the next poll interval.

**Long polling** — the client sends a request, and the server holds the connection open until it has new data or a timeout expires (typically 30-60 seconds). Once the server responds, the client immediately sends another request. This gives near-real-time delivery without wasted requests. The downside is a small gap in each response-request cycle and you need reconnection logic.

**WebSocket** — upgrades an HTTP connection to a persistent, full-duplex TCP connection. Both sides can send messages at any time with minimal overhead (2-byte frame header vs full HTTP headers).

Use short polling for low-frequency, non-critical updates (checking for app updates every hour). Use long polling when you need near-real-time but can't use WebSocket (some proxies block WebSocket upgrades). Use WebSocket for real-time bidirectional communication like chat apps.

#### Q19: What is the difference between JSON and Protocol Buffers? When would you use each?

JSON and Protocol Buffers are both data formats used between client and server for data exchange.
- In JSON, data format is text-based. In Protocol Buffers, data format is binary which is more efficient in performance.
- In JSON, data is larger in size. In Protocol Buffers, data is smaller (3-10x smaller).
- In JSON, parsing is slower. In Protocol Buffers, parsing is faster.
- In JSON, data is human-readable. In Protocol Buffers, it's not.

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

JSON doesn't need schema files and every language supports it. Protobuf requires `.proto` schema files and code generation, and both client and server must share the same schema version. Use JSON for public APIs and when debuggability matters. Use Protobuf for high-throughput internal APIs, gRPC services, and when bandwidth or parsing speed is critical.

#### Q20: What is an unmetered network constraint and how does it affect background work?

An unmetered network is a connection type that doesn't count against a user's data plan, typically Wi-Fi. A metered network has data limits — cellular connections, mobile hotspots, and some capped Wi-Fi networks. Android reports this through `NetworkCapabilities.NET_CAPABILITY_NOT_METERED`.

For bulk operations like uploading multiple photos or downloading offline content, you should constrain to unmetered networks using WorkManager to avoid burning through the user's data plan.

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

- `NetworkType.CONNECTED` — accepts any network (metered or unmetered).
- `NetworkType.UNMETERED` — waits for an unmetered connection.
- `NetworkType.NOT_ROAMING` — avoids roaming networks.

#### Q21: What are Retrofit call adapters and when would you use a custom one?

Call adapters control the return type of Retrofit interface methods. By default, Retrofit returns `Call<T>`. Adding `RxJava3CallAdapterFactory` lets you return `Observable<T>`, `Single<T>`, or `Flowable<T>`. Kotlin coroutine support is built into Retrofit 2.6+ — `suspend` functions use the built-in coroutine call adapter without needing a factory.

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

You would write a custom call adapter to wrap responses in a custom Result type or add global error handling. For example, wrapping every response in a `NetworkResult<T>` sealed class that distinguishes between success, server error, and network failure so call sites don't need try-catch blocks.

### Common Follow-ups

- How would you unit test a Retrofit service?
- What's the difference between `@Field` and `@Body` in Retrofit?
- How does HTTP/2 multiplexing work and why does it matter for mobile?
- What happens when you set `Cache-Control: no-cache` vs `Cache-Control: no-store`?
- How would you implement a retry strategy with exponential backoff?
- What's the difference between `enqueue()` and `execute()` in OkHttp?
- How does gzip compression work in OkHttp, and do you need to configure it?
- What serialization format would you use for a Kotlin Multiplatform project?
