---
title: "Networking & API Communication"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 10
sequence: 10
description: "Networking questions cover HTTP concepts, OkHttp internals, and caching strategies."
---

## Networking & API Communication

Networking is one of the most commonly tested areas in Android interviews. Expect questions on HTTP basics, OkHttp and Retrofit internals, caching, security, and real-time communication.

#### What is the difference between OkHttp and Retrofit?

OkHttp is the low-level HTTP client. It handles connections, connection pooling, TLS, HTTP/2, gzip, retries, redirects, and caching. It works with raw `Request` and `Response` objects.

Retrofit sits on top of OkHttp. It takes a Kotlin interface with annotations like `@GET` and `@POST`, generates OkHttp requests from them, and handles serialization through converters. I use OkHttp directly for things like WebSockets. For REST APIs, Retrofit removes all the boilerplate.

#### How does a network request flow through OkHttp and Retrofit?

I call a Retrofit interface method. Retrofit converts the annotations into an OkHttp `Request`. OkHttp runs it through its interceptor chain — retries, redirects, bridging (adding headers like `Content-Type`, `Accept-Encoding`), caching, and then the actual network call via `CallServerInterceptor`.

The response comes back up the chain, gets decompressed if needed, and Retrofit hands the body to a converter (Moshi, kotlinx.serialization) which deserializes the JSON into a Kotlin data class. With `suspend` functions, the whole thing runs on OkHttp's thread pool and resumes on the calling dispatcher.

#### What are OkHttp interceptors? What's the difference between application and network interceptors?

Interceptors observe, modify, or short-circuit requests and responses. There are two types:

- **Application interceptors** (`addInterceptor()`) — run once per logical request. They don't see retries or redirects. They always run, even when the response comes from cache.
- **Network interceptors** (`addNetworkInterceptor()`) — run per physical network call. They see retries and redirects, can access the connection details (IP, TLS version), but skip when the response is cached.

```kotlin
val client = OkHttpClient.Builder()
    .addInterceptor { chain ->
        val request = chain.request().newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        chain.proceed(request)
    }
    .addNetworkInterceptor(HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    })
    .build()
```

I use application interceptors for auth headers and network interceptors for logging.

#### How do you handle authentication tokens and token refresh in the network layer?

I use an OkHttp `Authenticator` combined with an interceptor. The interceptor attaches the access token to every request. When a request gets a `401`, OkHttp calls the `Authenticator`, which refreshes the token and retries.

The tricky part is concurrent requests. If three requests all get `401` at the same time, I don't want three token refreshes. I use a `Mutex` and check if the token was already refreshed by comparing the failed request's token with the current one.

```kotlin
class TokenAuthenticator(
    private val tokenManager: TokenManager
) : Authenticator {

    private val refreshLock = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.retryCount >= 2) return null

        return runBlocking {
            refreshLock.withLock {
                val currentToken = tokenManager.getAccessToken()
                val requestToken = response.request.header("Authorization")
                    ?.removePrefix("Bearer ")

                if (currentToken != requestToken) {
                    return@runBlocking response.request.newBuilder()
                        .header("Authorization", "Bearer $currentToken")
                        .build()
                }

                val newToken = tokenManager.refreshToken()
                if (newToken != null) {
                    response.request.newBuilder()
                        .header("Authorization", "Bearer $newToken")
                        .build()
                } else {
                    tokenManager.logout()
                    null
                }
            }
        }
    }
}
```

#### What HTTP caching strategies exist, and how does OkHttp handle them?

HTTP caching uses headers. `Cache-Control` tells the client how long a response is fresh (`max-age`), whether it can be cached (`no-store`), or must be revalidated (`no-cache`, `must-revalidate`). Conditional caching uses `ETag` and `Last-Modified` — the client sends `If-None-Match` or `If-Modified-Since`, and the server returns `304 Not Modified` or the full response.

OkHttp has a built-in cache backed by DiskLruCache. I enable it by passing a `Cache` object:

```kotlin
val cache = Cache(
    directory = File(context.cacheDir, "http_cache"),
    maxSize = 10L * 1024 * 1024 // 10 MB
)

val client = OkHttpClient.Builder()
    .cache(cache)
    .build()
```

If the server doesn't send caching headers, I can override this with `CacheControl` on individual requests or with a network interceptor that rewrites response headers.

#### What is certificate pinning and why would you use it?

Certificate pinning means the app only trusts specific certificates or public keys for a domain, instead of trusting any CA in the device's trust store. This protects against man-in-the-middle attacks where an attacker has a compromised CA certificate.

```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add("api.example.com", "sha256/AAAA...=")
    .add("api.example.com", "sha256/BBBB...=") // backup pin
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

Always pin at least two keys — the current one and a backup. If I only pin one and need to rotate the certificate, every app version with the old pin breaks. I can also configure pinning declaratively through `network_security_config.xml`.

#### What is the Network Security Configuration?

`network_security_config.xml` lets me customize network security settings declaratively. I can specify trusted CAs per domain, enable or disable cleartext (HTTP) traffic, configure certificate pinning, and set debug-only overrides. Since Android 9 (API 28), cleartext traffic is blocked by default.

```xml
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

The `debug-overrides` section lets me trust user-installed certificates (like Charles Proxy) only in debug builds without weakening production security.

#### How does Retrofit's suspend function support work under the hood?

When I declare a Retrofit method as `suspend`, Retrofit detects the `Continuation` parameter the Kotlin compiler adds. Internally it creates a `Call<T>` but uses `suspendCancellableCoroutine` to bridge OkHttp's callback-based call to the coroutine world. The call is enqueued on OkHttp's dispatcher, and when the response arrives, the coroutine resumes on the calling dispatcher.

If I cancel the coroutine scope, Retrofit cancels the underlying OkHttp call. So when a user navigates away and `viewModelScope` is cancelled, in-flight requests are actually cancelled, not just ignored.

#### What is the difference between `enqueue()` and `execute()` in OkHttp?

`execute()` runs the request synchronously on the current thread and blocks until the response arrives. I can't call it on the main thread — it throws `NetworkOnMainThreadException`.

`enqueue()` runs the request asynchronously on OkHttp's internal thread pool. It takes a `Callback` with `onResponse` and `onFailure` methods. With Retrofit's coroutine support, I rarely use either directly — `suspend` functions handle the threading.

#### How does OkHttp's connection pooling work?

Opening a TCP connection requires a three-way handshake. HTTPS adds a TLS handshake on top. OkHttp maintains a `ConnectionPool` that keeps idle connections alive for reuse — by default, up to 5 idle connections evicted after 5 minutes.

When a new request targets the same host, OkHttp checks the pool before opening a new connection. With HTTP/2, multiple requests to the same host are multiplexed over a single connection, so I might only need one connection handling dozens of concurrent requests.

#### Walk through OkHttp's built-in interceptor chain in order.

OkHttp chains interceptors in this order:

- `RetryAndFollowUpInterceptor` — retries on failure and follows redirects (301, 302) up to 20 times
- `BridgeInterceptor` — adds missing headers (`Content-Type`, `Host`, `Accept-Encoding: gzip`, cookies) and decompresses gzip responses
- `CacheInterceptor` — checks the local cache before making a network request, stores cacheable responses
- `ConnectInterceptor` — opens a connection (or reuses one from the pool) and does the TLS handshake
- `CallServerInterceptor` — writes the request and reads the response over the connection

Application interceptors run before the entire chain. Network interceptors run between `ConnectInterceptor` and `CallServerInterceptor`. That's why application interceptors see the original request, but network interceptors see the modified request with all the bridge headers.

#### What's the difference between Gson, Moshi, and kotlinx.serialization?

All three are JSON serialization libraries but they work differently:

- **Gson** — uses reflection at runtime. Widely used but has Kotlin issues: it can bypass null safety and create objects without calling constructors.
- **Moshi** — built by Square as a modern replacement. Supports Kotlin properly through `moshi-kotlin-codegen`, which generates adapters at compile time via KSP.
- **kotlinx.serialization** — JetBrains' first-party solution. Uses a compiler plugin, supports multiple formats (JSON, Protobuf, CBOR), and is the only option that works with Kotlin Multiplatform.

For new projects, the choice is between Moshi (Android-only) and kotlinx.serialization (KMP or compiler plugin approach). I avoid Gson in new code because of the Kotlin null-safety issues.

#### What is the difference between short polling, long polling, and WebSocket?

- **Short polling** — the client sends requests at regular intervals (every 5 seconds). Simple but wasteful since most responses return nothing.
- **Long polling** — the client sends a request, the server holds the connection open until it has new data or times out (30-60 seconds). Near-real-time without wasted requests.
- **WebSocket** — upgrades an HTTP connection to a persistent, full-duplex TCP connection. Both sides send messages anytime with minimal overhead (2-byte frame header vs full HTTP headers).

I use short polling for low-frequency checks (app update checks). Long polling when near-real-time is needed but WebSocket isn't available. WebSocket for real-time bidirectional communication like chat.

#### What is the difference between WebSocket and Server-Sent Events (SSE)?

WebSocket is full-duplex — both client and server can send messages anytime over a persistent TCP connection. SSE is one-way — the server pushes events to the client over a regular HTTP connection using `text/event-stream`. The client can't send data back over the same connection.

I use WebSocket for bidirectional communication (chat, collaboration). SSE for one-way scenarios like live scores, notification streams, or progress updates. SSE works over standard HTTP, so proxies and load balancers handle it more naturally. OkHttp has built-in WebSocket support.

#### REST vs GraphQL — when would you choose each on mobile?

REST gives fixed endpoints with a predetermined data shape. GraphQL gives a single endpoint where the client specifies exactly which fields it needs.

GraphQL avoids over-fetching (getting 30 fields when I only need 5) and under-fetching (needing 3 REST calls for one screen). But HTTP caching doesn't work well because every request is a POST to the same endpoint, and I need a GraphQL client like Apollo which adds complexity.

For most Android apps with a backend I control, REST with well-designed endpoints is simpler. GraphQL works better when multiple clients (iOS, Android, web) have different data needs from the same backend.

#### How do you handle network connectivity changes and offline scenarios?

I use `ConnectivityManager` with a `NetworkCallback` to observe network state.

```kotlin
class NetworkMonitor(context: Context) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    val isOnline: StateFlow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(true) }
            override fun onLost(network: Network) { trySend(false) }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.stateIn(CoroutineScope(Dispatchers.Default), SharingStarted.Eagerly, false)
}
```

Connectivity doesn't guarantee reachability — I can be connected to Wi-Fi but the router might not have internet. A robust solution combines `ConnectivityManager` checks with actual request results. For offline-first, I queue failed requests using Room or WorkManager and retry when the network is back.

#### What is the difference between JSON and Protocol Buffers?

- JSON is text-based, human-readable, larger, and slower to parse. Every language supports it out of the box.
- Protocol Buffers is binary, not human-readable, 3-10x smaller, and faster to parse. It requires `.proto` schema files and code generation.

I use JSON for public APIs and when debuggability matters. Protobuf for high-throughput internal APIs, gRPC services, and when bandwidth or parsing speed is critical. Both client and server must share the same schema version with Protobuf.

#### How would you implement retry with exponential backoff?

I add a retry interceptor that catches failures and retries with increasing delays. The delay doubles each time with optional jitter to avoid thundering herd.

```kotlin
class RetryInterceptor(
    private val maxRetries: Int = 3
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        var lastException: IOException? = null
        repeat(maxRetries) { attempt ->
            try {
                val response = chain.proceed(chain.request())
                if (response.isSuccessful || attempt == maxRetries - 1) return response
                response.close()
            } catch (e: IOException) {
                lastException = e
            }
            val delay = (1000L * (1 shl attempt)) + Random.nextLong(0, 500)
            Thread.sleep(delay)
        }
        throw lastException ?: IOException("Retry failed")
    }
}
```

For background work, I use WorkManager's built-in `BackoffPolicy.EXPONENTIAL` instead of implementing it myself.

#### How does Retrofit's converter system work?

Converters turn response bytes into Kotlin objects and serialize request bodies. I register them when building the Retrofit instance, and Retrofit tries them in order until one handles the type.

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

If I have multiple converters, the order matters — Retrofit uses the first one that can handle the type. Most apps need just one.

#### How would you implement request deduplication?

When multiple UI components or rapid refreshes fire duplicate calls, I keep a map of in-flight requests keyed by URL or request hash. If the same request is already in flight, I return the existing deferred result instead of starting a new one.

```kotlin
class DeduplicatingApiClient(private val api: UserApi) {
    private val inFlight = ConcurrentHashMap<String, Deferred<UserResponse>>()

    suspend fun getUser(id: String): UserResponse {
        val key = "user:$id"
        val existing = inFlight[key]
        if (existing != null && existing.isActive) return existing.await()

        val deferred = coroutineScope {
            async {
                try { api.getUser(id) }
                finally { inFlight.remove(key) }
            }
        }
        inFlight[key] = deferred
        return deferred.await()
    }
}
```

In production, I handle the race condition between the check and the put using `Mutex` or `putIfAbsent`.

#### What is HTTP/2 and why does it matter for mobile?

HTTP/2 introduces multiplexing — multiple requests and responses share a single TCP connection instead of opening separate connections. It also supports header compression (HPACK), server push, and stream prioritization.

For mobile, this means fewer connections to manage, lower latency (no head-of-line blocking at the HTTP level), and less battery usage from fewer TLS handshakes. OkHttp supports HTTP/2 by default when the server supports it. No configuration needed on the client side.

#### What is an unmetered network constraint and how does it affect background work?

An unmetered network doesn't count against the user's data plan — typically Wi-Fi. Metered networks have data limits — cellular, mobile hotspots, and some capped Wi-Fi. Android reports this through `NetworkCapabilities.NET_CAPABILITY_NOT_METERED`.

For bulk operations like uploading photos or downloading offline content, I constrain to unmetered networks using WorkManager:

```kotlin
val syncRequest = OneTimeWorkRequestBuilder<BulkSyncWorker>()
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .setRequiresBatteryNotLow(true)
            .build()
    )
    .build()
```

### Common Follow-ups

- What's the difference between `@Field` and `@Body` in Retrofit?
- How does HTTP/2 multiplexing differ from HTTP/1.1 pipelining?
- What happens when you set `Cache-Control: no-cache` vs `Cache-Control: no-store`?
- How does gzip compression work in OkHttp, and do you need to configure it?
- How would you unit test a Retrofit service using MockWebServer?
- What serialization format would you use for a Kotlin Multiplatform project?
- How do you debug network requests in Android? What tools do you use?
- What is the difference between `@Url` and `@Path` in Retrofit?
