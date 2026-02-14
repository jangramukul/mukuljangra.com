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

Networking is the plumbing of every Android app. You can have the prettiest UI in the world, but if your network layer is a mess, your app is going to feel broken. These questions go deep into OkHttp and Retrofit internals, caching, security, and real-time communication.

#### What is the difference between OkHttp and Retrofit?

Think of OkHttp as the engine and Retrofit as the car built around it. OkHttp is the low-level HTTP client that handles the hard stuff — connections, connection pooling, TLS, HTTP/2, gzip, retries, redirects, and caching. It works with raw `Request` and `Response` objects, and you're responsible for building everything yourself.

Retrofit sits on top and makes your life dramatically easier. You declare a Kotlin interface with annotations like `@GET` and `@POST`, and Retrofit generates the OkHttp requests for you, handles serialization through converters, and gives you back typed Kotlin objects. I reach for OkHttp directly when I need low-level control — WebSockets, custom streaming. For REST APIs, Retrofit removes all the boilerplate.

#### How does a network request flow through OkHttp and Retrofit?

Here's the journey. I call a Retrofit interface method. Retrofit reads the annotations and builds an OkHttp `Request` — think of it like a travel agent turning your vacation preferences into an actual flight booking. OkHttp then runs that request through its interceptor chain: retries, redirects, bridging (adding headers like `Content-Type`, `Accept-Encoding`), caching, and finally the actual network call via `CallServerInterceptor`.

The response travels back up the same chain in reverse, gets decompressed if needed, and Retrofit hands the body to a converter (Moshi, kotlinx.serialization) which deserializes the JSON into a Kotlin data class. With `suspend` functions, the whole thing runs on OkHttp's thread pool and resumes on the calling dispatcher. It's a beautiful pipeline, and you barely see any of it from your calling code.

#### What are OkHttp interceptors? What's the difference between application and network interceptors?

Interceptors are like security checkpoints at an airport. Every request passes through them, and each one can inspect, modify, or even reject the request before it continues. There are two types, and the difference matters more than people expect:

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

I use application interceptors for auth headers (I want the token on every request, cached or not) and network interceptors for logging (I only care about what actually hits the wire).

#### How do you handle authentication tokens and token refresh in the network layer?

This is one of those things that sounds simple until you debug it. I use an OkHttp `Authenticator` combined with an interceptor. The interceptor attaches the access token to every outgoing request. When a request comes back with a `401`, OkHttp calls the `Authenticator`, which refreshes the token and retries the original request automatically.

> **🧠 Think about it:** What happens if three requests all get a `401` at the exact same time? Do you really want three separate token refresh calls racing each other?

That's the tricky part. I use a `Mutex` to synchronize the refresh and compare the failed request's token with the current one. If someone else already refreshed while I was waiting for the lock, I just use the new token and skip the refresh entirely.

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

HTTP caching is like your browser remembering a webpage so it doesn't download it again every time you visit. It all comes down to headers. `Cache-Control` tells the client how long a response is fresh (`max-age`), whether it can be cached at all (`no-store`), or must be revalidated (`no-cache`, `must-revalidate`). Then there's conditional caching with `ETag` and `Last-Modified` — the client asks "hey, did this change?" and the server either says `304 Not Modified` (use what you have) or sends the full response.

OkHttp has a built-in cache backed by DiskLruCache. Enabling it is dead simple:

```kotlin
val cache = Cache(
    directory = File(context.cacheDir, "http_cache"),
    maxSize = 10L * 1024 * 1024 // 10 MB
)

val client = OkHttpClient.Builder()
    .cache(cache)
    .build()
```

If the server doesn't send caching headers (and many don't), I can override this with `CacheControl` on individual requests or with a network interceptor that rewrites response headers. The cache is there, but it only works as well as the headers let it.

#### What is certificate pinning and why would you use it?

Normally, your app trusts any certificate signed by any CA in the device's trust store. Certificate pinning narrows that down — it's like saying "I only accept packages from this specific delivery driver, not just anyone in a uniform." The app only trusts specific certificates or public keys for a domain, which protects against man-in-the-middle attacks where an attacker has a compromised CA certificate.

```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add("api.example.com", "sha256/AAAA...=")
    .add("api.example.com", "sha256/BBBB...=") // backup pin
    .build()

val client = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

Always pin at least two keys — the current one and a backup. If I only pin one and need to rotate the certificate, every app version with the old pin breaks. That's a production nightmare. I can also configure pinning declaratively through `network_security_config.xml`.

#### What is the Network Security Configuration?

`network_security_config.xml` is Android's way of letting you set network security rules without writing code. I can specify trusted CAs per domain, enable or disable cleartext (HTTP) traffic, configure certificate pinning, and set debug-only overrides. Since Android 9 (API 28), cleartext traffic is blocked by default — which is a good default.

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

The `debug-overrides` section is a lifesaver — it lets me trust user-installed certificates (like Charles Proxy) only in debug builds without weakening production security. You get full debugging power without any production risk.

#### How does Retrofit's suspend function support work under the hood?

When I declare a Retrofit method as `suspend`, the Kotlin compiler adds a hidden `Continuation` parameter. Retrofit detects that parameter and knows it's dealing with a coroutine. Internally, it still creates a `Call<T>`, but instead of making you deal with callbacks, it uses `suspendCancellableCoroutine` to bridge OkHttp's callback world into the coroutine world. The call gets enqueued on OkHttp's dispatcher, and when the response arrives, the coroutine resumes on the calling dispatcher.

Here's the part that really matters: if I cancel the coroutine scope, Retrofit cancels the underlying OkHttp call. So when a user navigates away and `viewModelScope` gets cancelled, in-flight requests are actually cancelled on the wire — not just ignored while they keep burning bandwidth in the background.

#### What is the difference between `enqueue()` and `execute()` in OkHttp?

`execute()` is the "I'll wait right here" approach — it runs synchronously on the current thread and blocks until the response arrives. Call it on the main thread and you'll get a `NetworkOnMainThreadException` thrown in your face.

`enqueue()` is the "call me back" approach — it runs asynchronously on OkHttp's internal thread pool and takes a `Callback` with `onResponse` and `onFailure` methods. With Retrofit's coroutine support, I rarely use either directly anymore. The `suspend` keyword handles threading so cleanly that raw `execute()` and `enqueue()` feel like ancient history.

#### How does OkHttp's connection pooling work?

Opening a TCP connection is like going through airport security — there's a three-way handshake, and with HTTPS you add a TLS handshake on top. Doing that for every single request would be painfully slow. OkHttp maintains a `ConnectionPool` that keeps idle connections alive for reuse — by default, up to 5 idle connections evicted after 5 minutes.

When a new request targets the same host, OkHttp checks the pool first before opening a new connection. With HTTP/2, it gets even better — multiple requests to the same host are multiplexed over a single connection, so I might only need one connection handling dozens of concurrent requests. That's a massive win for mobile where every connection costs battery.

#### Walk through OkHttp's built-in interceptor chain in order.

Picture an assembly line where each station does one specific job. OkHttp chains its interceptors in this exact order:

- `RetryAndFollowUpInterceptor` — retries on failure and follows redirects (301, 302) up to 20 times
- `BridgeInterceptor` — adds missing headers (`Content-Type`, `Host`, `Accept-Encoding: gzip`, cookies) and decompresses gzip responses
- `CacheInterceptor` — checks the local cache before making a network request, stores cacheable responses
- `ConnectInterceptor` — opens a connection (or reuses one from the pool) and does the TLS handshake
- `CallServerInterceptor` — writes the request and reads the response over the connection

Application interceptors run before the entire chain. Network interceptors run between `ConnectInterceptor` and `CallServerInterceptor`. That's why application interceptors see the original request you built, but network interceptors see the modified request with all the bridge headers already added.

#### What's the difference between Gson, Moshi, and kotlinx.serialization?

All three turn JSON into Kotlin objects and back, but they take very different approaches under the hood:

- **Gson** — uses reflection at runtime. It's everywhere, but it has real Kotlin problems: it can bypass null safety and create objects without calling constructors. You declare a non-null `String`, and Gson will happily hand you a null. Yeah, that's not great.
- **Moshi** — built by Square as Gson's modern replacement. Supports Kotlin properly through `moshi-kotlin-codegen`, which generates adapters at compile time via KSP. No reflection surprises.
- **kotlinx.serialization** — JetBrains' first-party solution. Uses a compiler plugin, supports multiple formats (JSON, Protobuf, CBOR), and is the only option that works with Kotlin Multiplatform.

For new projects, the choice is between Moshi (Android-only) and kotlinx.serialization (KMP or compiler plugin approach). I avoid Gson in new code because of the Kotlin null-safety issues — it quietly breaks one of Kotlin's best features.

#### What is the difference between short polling, long polling, and WebSocket?

Three different ways to get real-time-ish data from a server, each with its own personality:

- **Short polling** — the client keeps asking "any updates?" at regular intervals (every 5 seconds). It's like texting someone "are we there yet?" every minute. Simple but wasteful, since most responses return nothing new.
- **Long polling** — the client asks once, and the server holds the connection open until it actually has something to say, or times out (30-60 seconds). Near-real-time without all the wasted requests.
- **WebSocket** — upgrades an HTTP connection to a persistent, full-duplex TCP connection. Both sides can send messages anytime with minimal overhead (2-byte frame header vs full HTTP headers each time).

I use short polling for low-frequency checks like app update checks. Long polling when near-real-time is needed but WebSocket isn't available. WebSocket for real-time bidirectional communication like chat.

> **🧠 Think about it:** If short polling checks every 5 seconds and each request takes 200ms round-trip, how much of that connection time is actually carrying useful data? That's why WebSocket exists.

#### What is the difference between WebSocket and Server-Sent Events (SSE)?

WebSocket is a two-way street — both client and server can send messages anytime over a persistent TCP connection. SSE is a one-way loudspeaker — the server pushes events to the client over a regular HTTP connection using `text/event-stream`, but the client can't send data back over the same connection.

I use WebSocket for bidirectional communication (chat, real-time collaboration). SSE for one-way scenarios like live scores, notification streams, or progress updates. SSE has a nice advantage: it works over standard HTTP, so proxies and load balancers handle it more naturally than they handle WebSocket upgrades. OkHttp has built-in WebSocket support.

#### REST vs GraphQL — when would you choose each on mobile?

REST gives you fixed endpoints with a predetermined data shape — what the server sends, you get. GraphQL gives you a single endpoint where you specify exactly which fields you need, like ordering from a menu versus getting a fixed meal.

GraphQL avoids over-fetching (getting 30 fields when I only need 5) and under-fetching (needing 3 REST calls to build one screen). But here's the tradeoff: HTTP caching doesn't work well because every request is a POST to the same endpoint, and you need a GraphQL client like Apollo which adds real complexity.

For most Android apps with a backend I control, REST with well-designed endpoints is simpler and gets the job done. GraphQL works better when multiple clients (iOS, Android, web) have different data needs from the same backend and you're tired of building custom endpoints for each one.

#### How do you handle network connectivity changes and offline scenarios?

I use `ConnectivityManager` with a `NetworkCallback` to observe network state reactively:

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

But here's the gotcha — connectivity doesn't guarantee reachability. I can be connected to Wi-Fi but the router might not have internet. It's like having a phone signal but no one picking up on the other end. A robust solution combines `ConnectivityManager` checks with actual request results. For offline-first, I queue failed requests using Room or WorkManager and retry when the network comes back.

#### What is the difference between JSON and Protocol Buffers?

Think of JSON as a letter written in English — anyone can read it, but it's verbose. Protocol Buffers is like Morse code — compact and fast, but you need the codebook to understand it.

- JSON is text-based, human-readable, larger, and slower to parse. Every language supports it out of the box.
- Protocol Buffers is binary, not human-readable, 3-10x smaller, and faster to parse. It requires `.proto` schema files and code generation.

I use JSON for public APIs and when debuggability matters. Protobuf for high-throughput internal APIs, gRPC services, and when bandwidth or parsing speed is critical. Both client and server must share the same schema version with Protobuf — version mismatches are a real headache.

#### How would you implement retry with exponential backoff?

The idea is simple: if a request fails, wait a bit and try again, but wait longer each time. It's like calling someone who's busy — you don't keep redialing every second. You wait 1 second, then 2, then 4. I implement this as an OkHttp interceptor with optional jitter to prevent the thundering herd problem (where all your users retry at exactly the same moment after an outage).

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

For background work, I use WorkManager's built-in `BackoffPolicy.EXPONENTIAL` instead of reinventing the wheel.

#### How does Retrofit's converter system work?

Converters are the translators between raw HTTP response bytes and your Kotlin objects. I register them when building the Retrofit instance, and Retrofit tries them in order until one says "I can handle this type."

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

If I register multiple converters, the order matters — Retrofit picks the first one that can handle the type. Most apps only need one converter, and that keeps things simple.

#### How would you implement request deduplication?

This solves a surprisingly common problem. When multiple UI components or rapid pull-to-refreshes fire the same API call, you don't want five identical requests hitting your server. I keep a map of in-flight requests keyed by URL or request hash. If the same request is already in flight, I hand back the existing deferred result instead of firing a new one.

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

In production, I handle the race condition between the check and the put using `Mutex` or `putIfAbsent`. Without that, two threads could both see "nothing in flight" and both start a new request — defeating the whole purpose.

#### What is HTTP/2 and why does it matter for mobile?

> **🧠 Think about it:** If your app needs to load a user's profile, their posts, and their notifications — that's three requests. With HTTP/1.1, what happens if one is slow? It blocks the others. What if they could all share the same connection?

That's exactly what HTTP/2 solves. It introduces multiplexing — multiple requests and responses share a single TCP connection instead of opening separate connections. It also supports header compression (HPACK), server push, and stream prioritization.

For mobile, this means fewer connections to manage, lower latency (no head-of-line blocking at the HTTP level), and less battery usage from fewer TLS handshakes. OkHttp supports HTTP/2 by default when the server supports it. No configuration needed on the client side — it just works.

#### What is an unmetered network constraint and how does it affect background work?

An unmetered network doesn't count against the user's data plan — typically Wi-Fi. Metered networks have data limits — cellular, mobile hotspots, and some capped Wi-Fi. Android reports this through `NetworkCapabilities.NET_CAPABILITY_NOT_METERED`.

For bulk operations like uploading photos or downloading offline content, I don't want to chew through someone's cellular data. I constrain these to unmetered networks using WorkManager:

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
