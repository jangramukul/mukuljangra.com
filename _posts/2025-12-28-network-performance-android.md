---
title: Network Performance Optimization in Android
layout: post
sequence: 66
categories: post
tags:
  - Android
  - Performance
  - Kotlin
---

Last year I spent three days debugging what I thought was a slow API. The backend team insisted their p95 was under 80ms. Our Android app was showing 1.2 seconds for the same endpoint. I added a network interceptor, expecting to find a serialization bottleneck or some bloated response payload. Instead, I found something I didn't expect — the actual HTTP request/response took 90ms. The remaining 1,100ms was connection setup. DNS resolution, TLS handshake, TCP slow start. The request itself was fast. Everything around it was slow.

That experience changed how I think about network performance on Android. Most of the time, when someone says "our API calls are slow," the problem isn't bandwidth or payload size. **The problem is connection management.** How many connections are you opening? Are you reusing them? Are you multiplexing requests over a single connection or creating new TCP sockets for every call? Once I started looking at networking through that lens, I found that the biggest wins came from tuning things most developers never configure — the connection pool, the dispatcher, DNS caching, timeout strategy — not from compressing JSON payloads by a few kilobytes.

## HTTP/2 Multiplexing and Why It Matters

HTTP/1.1 has a fundamental limitation: one request per connection at a time. If you need to make 6 API calls to load a screen, you need 6 TCP connections — each with its own DNS lookup, TLS handshake, and TCP slow start penalty. That's expensive, especially on mobile networks where latency is high and radio state transitions add 100-300ms of overhead.

HTTP/2 solves this with **multiplexing** — multiple requests and responses flowing over a single TCP connection simultaneously, interleaved as binary frames. OkHttp supports HTTP/2 out of the box when the server supports it, and it negotiates the protocol during the TLS handshake via ALPN (Application-Layer Protocol Negotiation). You don't need to configure anything for this to work, but you need to understand what it means for your connection management strategy. With HTTP/2, the optimal number of connections to a single host is often just one. Opening more connections actually hurts because you lose the multiplexing benefit and you pay the setup cost multiple times.

Here's the thing most people miss: OkHttp's `ConnectionPool` already handles this intelligently. When you make a request to a host that supports HTTP/2, OkHttp will reuse the existing connection and multiplex your new request onto it. But if you're creating multiple `OkHttpClient` instances — which I've seen in plenty of codebases — each one gets its own connection pool, and you lose all reuse. One shared `OkHttpClient` instance. That's the single most impactful thing you can do for network performance.

## Connection Pool Internals

OkHttp's `ConnectionPool` defaults to keeping 5 idle connections alive for 5 minutes. These defaults are reasonable for most apps, but understanding what's happening underneath helps you tune them. When a request completes, the connection isn't closed immediately — it's returned to the pool. The next request to the same address (scheme + host + port + TLS config) can skip DNS, TCP, and TLS entirely by grabbing a pooled connection. For apps that make frequent requests to the same backend, this is the difference between 90ms and 800ms per call.

Tuning the pool depends on your traffic pattern. If your app talks to a single backend with bursty traffic — say, loading a dashboard with 8 parallel API calls — you might want a larger pool:

```kotlin
val connectionPool = ConnectionPool(
    maxIdleConnections = 10,
    keepAliveDuration = 5,
    timeUnit = TimeUnit.MINUTES
)

val client = OkHttpClient.Builder()
    .connectionPool(connectionPool)
    .build()
```

But here's the tradeoff: idle connections consume memory and can hold open sockets that the OS might need. On a memory-constrained device, 10 idle connections sitting around for 5 minutes is wasteful if your app only makes requests during screen loads. For apps with sparse, infrequent network calls, reducing `maxIdleConnections` to 3 and `keepAliveDuration` to 2 minutes saves resources without meaningfully increasing latency. There's no universal right answer — you have to profile your specific traffic pattern.

## Dispatcher Concurrency and Request Flow

The `Dispatcher` is where OkHttp controls how many requests run simultaneously. By default, it allows 64 concurrent requests total and 5 concurrent requests per host. What surprised me when I read the OkHttp source is how the dispatcher interacts with HTTP/2. With HTTP/1.1, the per-host limit of 5 means at most 5 TCP connections to one server. With HTTP/2 multiplexing, those 5 "concurrent requests" all ride on the same connection — the dispatcher's per-host limit becomes a flow control mechanism rather than a connection limit.

For something like an image gallery loading 20+ thumbnails simultaneously, you might want to increase the per-host limit:

```kotlin
val dispatcher = Dispatcher().apply {
    maxRequests = 64
    maxRequestsPerHost = 10
}

val client = OkHttpClient.Builder()
    .dispatcher(dispatcher)
    .build()
```

Be careful with this though. I've seen apps set `maxRequestsPerHost` to 30 and wonder why their API responses got slower — turns out the server was queuing requests internally because the app was opening more concurrent streams than the server's HTTP/2 `SETTINGS_MAX_CONCURRENT_STREAMS` allowed. OkHttp respects the server's setting, but your dispatcher can still queue more requests than necessary, creating backpressure that shows up as increased latency.

## Retry and Timeout Configuration

OkHttp has `retryOnConnectionFailure` enabled by default, which is both a blessing and a trap. When it's on, OkHttp will silently retry a request if the connection fails during setup or if the server closes the connection while the request is in flight. This sounds reasonable until you realize it means POST requests can be retried — and if your server doesn't handle idempotency, you might create a duplicate order or send a payment twice. I learned this the hard way on a fintech project where a flaky proxy caused intermittent connection resets, and OkHttp was dutifully retrying mutations.

For non-idempotent endpoints, you have two options. You can disable retries globally with `retryOnConnectionFailure(false)` on the client, or — what I prefer — create a separate client for mutation-heavy calls using `newBuilder()`, which shares the same connection pool and dispatcher but has its own retry policy. Timeouts are the other half of this equation. OkHttp offers three: `connectTimeout` (TCP + TLS handshake), `readTimeout` (waiting for response bytes), and `writeTimeout` (sending request bytes). The defaults are 10 seconds each, but the right values depend heavily on the endpoint:

```kotlin
// Shared base client
val baseClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(15, TimeUnit.SECONDS)
    .retryOnConnectionFailure(true)
    .build()

// For payment or mutation endpoints — no retries, tighter timeouts
val mutationClient = baseClient.newBuilder()
    .retryOnConnectionFailure(false)
    .readTimeout(15, TimeUnit.SECONDS)
    .build()

// For file uploads — generous write timeout
val uploadClient = baseClient.newBuilder()
    .writeTimeout(60, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .build()
```

The key insight is that `newBuilder()` doesn't create a new connection pool or dispatcher — it inherits them from the parent. So you get per-use-case timeout and retry behavior without losing connection reuse. I use this pattern on every project now: one base client with sane defaults, and specialized variants for uploads, mutations, and long-polling endpoints.

## The Interceptor Chain — Application vs Network

Understanding the interceptor chain is one of those things that separates "I use OkHttp" from "I understand OkHttp." There are two registration points: `addInterceptor()` for application interceptors and `addNetworkInterceptor()` for network interceptors. The ordering matters more than most people realize.

Application interceptors run first, before OkHttp's internal machinery. They see the original request exactly as your code built it, and they see the final response after all redirects and retries. They fire exactly once per `call.execute()` or `call.enqueue()`, regardless of how many redirects or retries happen underneath. Network interceptors sit between OkHttp's connection logic and the actual wire. They fire for every network request — so if a call follows two redirects, the network interceptor fires three times. They also have access to the `Connection` object, which means they can inspect the negotiated protocol, TLS version, and cipher suite.

This distinction matters practically. Auth token injection belongs in an application interceptor — you want it applied once, before any redirects, and you don't want redirect requests hitting a different host with your auth token. Logging and timing belong in a network interceptor — you want to see every hop, including redirects, and you want the actual on-the-wire timing. Here's an auth interceptor pattern I use that handles token refresh when the server returns 401:

```kotlin
class AuthInterceptor(
    private val tokenProvider: TokenProvider
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.getAccessToken()
        val request = chain.request().newBuilder()
            .header("Authorization", "Bearer $token")
            .build()

        val response = chain.proceed(request)

        if (response.code == 401) {
            response.close()
            val refreshedToken = tokenProvider.refreshToken()
                ?: return response

            val retryRequest = chain.request().newBuilder()
                .header("Authorization", "Bearer $refreshedToken")
                .build()
            return chain.proceed(retryRequest)
        }

        return response
    }
}

// Registered as an application interceptor
val client = OkHttpClient.Builder()
    .addInterceptor(AuthInterceptor(tokenProvider))
    .addNetworkInterceptor(TimingInterceptor())
    .build()
```

The critical detail: always close the 401 response body before retrying. OkHttp enforces one active response per connection, and leaking response bodies is one of the most common causes of connection pool exhaustion. I've debugged production apps where the pool was "full" of connections held open by un-closed error responses.

## Request Coalescing — Stop Making the Same Call Five Times

This one took me embarrassingly long to figure out. In a Compose-based app, five different composables might all call `viewModel.loadUserProfile()` during initial composition. Without coalescing, that's five identical HTTP requests to `GET /user/profile` — all in flight simultaneously, all returning the same data. Multiply this across every screen and you're burning bandwidth, battery, and backend resources for no reason.

The fix is deduplicating in-flight requests at the repository layer. The idea is simple: if a request for the same key is already in flight, new callers subscribe to the same result instead of launching a new request. A `MutableSharedFlow` with a `Mutex` makes this clean:

```kotlin
class CoalescingRepository(
    private val api: UserApi
) {
    private val inFlightRequests =
        ConcurrentHashMap<String, Deferred<UserProfile>>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    suspend fun getUserProfile(userId: String): UserProfile {
        val existing = inFlightRequests[userId]
        if (existing != null && existing.isActive) {
            return existing.await()
        }

        val deferred = scope.async {
            try {
                api.getUserProfile(userId)
            } finally {
                inFlightRequests.remove(userId)
            }
        }
        inFlightRequests[userId] = deferred
        return deferred.await()
    }
}
```

When the first composable calls `getUserProfile("123")`, it launches the request and stores the `Deferred`. The next four callers find the active `Deferred` and just `await()` it — one HTTP request, five subscribers. The `finally` block cleans up after completion so the next call after the result arrives makes a fresh request. In a dashboard screen I optimized with this pattern, network calls dropped from 23 to 8 on initial load. Same data, same UI, 65% fewer requests.

## Response Caching

OkHttp implements a disk cache that follows HTTP caching semantics — `Cache-Control`, `ETag`, `Last-Modified`, the whole RFC. But it's **off by default**. Setting it up is straightforward and the payoff is immediate — a full cache hit skips DNS, TCP, TLS, and the network request entirely:

```kotlin
val cacheSize = 50L * 1024L * 1024L // 50 MB
val cache = Cache(
    directory = File(context.cacheDir, "http_cache"),
    maxSize = cacheSize
)

val client = OkHttpClient.Builder()
    .cache(cache)
    .build()
```

A conditional hit sends an `If-None-Match` or `If-Modified-Since` header, and if the server returns 304, OkHttp uses the cached body but still pays the connection cost. For backends that don't send proper cache headers — which is more common than it should be — you can use a network interceptor to force caching client-side. This is a pragmatic hack, but sometimes you work with what you have:

```kotlin
class ForceCacheInterceptor(
    private val maxAgeSeconds: Int = 300
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        val cacheControl = CacheControl.Builder()
            .maxAge(maxAgeSeconds, TimeUnit.SECONDS)
            .build()
        return response.newBuilder()
            .removeHeader("Pragma")
            .removeHeader("Cache-Control")
            .header("Cache-Control", cacheControl.toString())
            .build()
    }
}
```

For in-memory caching on top of disk caching, I typically build a simple LRU layer at the repository level rather than trying to hack it into OkHttp. The HTTP cache handles staleness and revalidation; the in-memory layer handles avoiding disk I/O for hot data.

## DNS Resolution Optimization

DNS resolution on Android goes through the system resolver by default, which means it's subject to the device's DNS configuration, ISP caching behavior, and sometimes carrier-injected delays. On mobile networks, DNS lookups can take 50-200ms, and they block connection setup entirely.

OkHttp lets you supply a custom `Dns` implementation. The simplest optimization is pre-resolving hosts and caching the results:

```kotlin
class CachingDns(
    private val ttlMs: Long = 600_000 // 10 minutes
) : Dns {
    private val cache = ConcurrentHashMap<String, Pair<List<InetAddress>, Long>>()

    override fun lookup(hostname: String): List<InetAddress> {
        val cached = cache[hostname]
        if (cached != null && System.currentTimeMillis() - cached.second < ttlMs) {
            return cached.first
        }
        val addresses = Dns.SYSTEM.lookup(hostname)
        cache[hostname] = addresses to System.currentTimeMillis()
        return addresses
    }
}

val client = OkHttpClient.Builder()
    .dns(CachingDns())
    .build()
```

The tradeoff with DNS caching is obvious — stale entries can point to dead servers. A 10-minute TTL is aggressive but acceptable for apps talking to a stable backend. For CDN-heavy apps where DNS-based load balancing matters, you'd want a shorter TTL or respect the actual DNS record TTL. The real win here isn't the caching itself — it's understanding that DNS is often the hidden 200ms you never measured.

## Protobuf vs JSON — When It Actually Matters

I've been asked "should we switch from JSON to Protobuf?" on three different projects. The answer is almost always "it depends, and probably not for the reason you think." Protocol Buffers are faster to serialize and deserialize than JSON — typically 3-5x faster on Android in my benchmarks. They also produce smaller payloads, roughly 30-50% smaller than equivalent JSON.

But here's the reframe: **for most Android apps, serialization speed is not the bottleneck.** Parsing a 10KB JSON response with Moshi takes about 2-5ms on a modern device. The same response in Protobuf parses in under 1ms. That 2-4ms difference is invisible to the user. Where Protobuf wins meaningfully is payload size — on metered mobile connections, sending 50% less data matters. And in high-throughput scenarios like chat apps or real-time feeds processing hundreds of messages per second, the serialization speed difference compounds.

My rule of thumb: if your API responses are under 50KB and you're making fewer than 20 requests per minute, Moshi with JSON is fine. If you're dealing with large payloads, high-frequency updates, or you're already using gRPC on the backend, Protobuf is worth the migration cost. Don't switch just because someone told you it's "faster" without quantifying what that means for your specific traffic.

## Putting It All Together

If I were setting up a network stack for a new Android app today, here's what I'd configure from day one:

```kotlin
val baseClient = OkHttpClient.Builder()
    .connectionPool(ConnectionPool(5, 5, TimeUnit.MINUTES))
    .cache(Cache(File(context.cacheDir, "http_cache"), 50L * 1024 * 1024))
    .dns(CachingDns(ttlMs = 600_000))
    .addInterceptor(AuthInterceptor(tokenProvider))
    .addNetworkInterceptor(TimingInterceptor())
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(15, TimeUnit.SECONDS)
    .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
    .build()

val mutationClient = baseClient.newBuilder()
    .retryOnConnectionFailure(false)
    .readTimeout(15, TimeUnit.SECONDS)
    .build()
```

The key insight from all of this is simple: **measure before you optimize, and measure the right things.** Most network "performance" work I've seen focuses on payload size or serialization format. Those matter, but they're usually the smallest slice of the total request time. Connection reuse, DNS caching, interceptor ordering, request coalescing, and timeout strategy are where the real seconds hide. Put a timing interceptor in your debug builds, look at the numbers, and let the data tell you where to spend your time.

Thanks for reading!
