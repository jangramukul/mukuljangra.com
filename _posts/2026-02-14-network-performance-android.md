---
title: Network Performance Optimization in Android
layout: post
categories: post
tags:
  - Android
  - Performance
  - Kotlin
---

Last year I spent three days debugging what I thought was a slow API. The backend team insisted their p95 was under 80ms. Our Android app was showing 1.2 seconds for the same endpoint. I added a network interceptor, expecting to find a serialization bottleneck or some bloated response payload. Instead, I found something I didn't expect — the actual HTTP request/response took 90ms. The remaining 1,100ms was connection setup. DNS resolution, TLS handshake, TCP slow start. The request itself was fast. Everything around it was slow.

That experience changed how I think about network performance on Android. Most of the time, when someone says "our API calls are slow," the problem isn't bandwidth or payload size. **The problem is connection management.** How many connections are you opening? Are you reusing them? Are you multiplexing requests over a single connection or creating new TCP sockets for every call? Once I started looking at networking through that lens, I found that the biggest wins came from tuning things most developers never configure — the connection pool, the dispatcher, DNS caching — not from compressing JSON payloads by a few kilobytes.

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

## How OkHttp's Dispatcher Manages Concurrency

The `Dispatcher` is where OkHttp controls how many requests run simultaneously. By default, it allows 64 concurrent requests total and 5 concurrent requests per host. These limits exist for good reason — flooding a server with 50 simultaneous connections gets you rate-limited or worse.

What surprised me when I read the OkHttp source is how the dispatcher interacts with HTTP/2. With HTTP/1.1, the per-host limit of 5 means at most 5 TCP connections to one server. With HTTP/2 multiplexing, those 5 "concurrent requests" all ride on the same connection, which is exactly what you want. The dispatcher's per-host limit becomes a flow control mechanism rather than a connection limit.

For most apps, the default dispatcher settings are fine. But if you're building something like an image gallery that loads 20+ thumbnails simultaneously, you might want to increase the per-host limit:

```kotlin
val dispatcher = Dispatcher().apply {
    maxRequests = 64
    maxRequestsPerHost = 10
}

val client = OkHttpClient.Builder()
    .dispatcher(dispatcher)
    .build()
```

Be careful with this. Increasing `maxRequestsPerHost` beyond what your server can handle creates backpressure that shows up as increased latency. I've seen apps set this to 30 and wonder why their API responses got slower — turns out the server was queuing requests internally because the app was opening more concurrent streams than the server's HTTP/2 settings allowed. The server's `SETTINGS_MAX_CONCURRENT_STREAMS` frame tells the client how many streams it supports. OkHttp respects this, but your dispatcher can still queue more requests than necessary.

## Response Caching Done Right

OkHttp implements a disk cache that follows HTTP caching semantics — `Cache-Control`, `ETag`, `Last-Modified`, the whole RFC. But it's **off by default**. I'm always surprised how many production Android apps make the same API calls repeatedly without any caching layer.

Setting up a disk cache is straightforward:

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

The cache stores responses on disk and serves them based on the response's cache headers. A full cache hit skips DNS, TCP, TLS, and the network request entirely — OkHttp fires a `CacheHit` event and returns the stored response. A conditional hit sends an `If-None-Match` or `If-Modified-Since` header, and if the server returns 304, OkHttp uses the cached body (saving the download) but still pays the connection cost.

For responses that don't have proper cache headers — which is common with poorly configured backends — you can use a network interceptor to force caching on the client side. This is a pragmatic hack, not a best practice, but sometimes you work with what you have:

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

## A Custom Timing Interceptor

When I was debugging that 1.2-second request, the first thing I wrote was a timing interceptor. Not the basic "log how long proceed() takes" version — I wanted to see exactly where time was being spent. OkHttp's `EventListener` API gives you granular breakdowns, but an interceptor is quicker for initial diagnosis:

```kotlin
class TimingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val startNs = System.nanoTime()

        val response = chain.proceed(request)

        val durationMs = (System.nanoTime() - startNs) / 1_000_000
        val contentLength = response.body?.contentLength() ?: -1
        val protocol = response.protocol

        Log.d(
            "NetworkTiming",
            "${request.method} ${request.url.encodedPath} " +
                "→ ${response.code} [${durationMs}ms, " +
                "${contentLength}B, $protocol]"
        )

        return response
    }
}
```

This interceptor goes as a **network interceptor** (via `addNetworkInterceptor()`), not an application interceptor. The difference matters. Application interceptors see the final response after redirects and retries — one invocation per call. Network interceptors see every network request, including redirects, and they can access the `Connection` object to inspect the TLS configuration and protocol. For timing, you want the network interceptor because it shows you the actual time on the wire, not time spent following redirects.

But for deep timing breakdowns — DNS resolution time, TLS handshake duration, connection reuse vs new connection — you need `EventListener`. That's the tool that showed me my 1,100ms was split between 200ms of DNS, 400ms of TLS handshake, and 500ms of TCP connect on a cold connection.

## DNS Resolution Optimization

DNS resolution on Android goes through the system resolver by default, which means it's subject to the device's DNS configuration, ISP caching behavior, and sometimes carrier-injected delays. On mobile networks, DNS lookups can take 50-200ms, and they block the connection setup entirely.

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

## Protocol Buffers vs JSON Serialization

I've been asked "should we switch from JSON to Protobuf?" on three different projects. The answer is almost always "it depends, and probably not for the reason you think." Protocol Buffers are faster to serialize and deserialize than JSON — typically 3-5x faster on Android in my benchmarks. They also produce smaller payloads, roughly 30-50% smaller than equivalent JSON.

Here's a protobuf setup with Retrofit:

```kotlin
// Proto definition (user.proto)
// message UserResponse {
//   string id = 1;
//   string name = 2;
//   string email = 3;
//   int64 created_at = 4;
// }

val retrofit = Retrofit.Builder()
    .baseUrl("https://api.example.com/")
    .client(okHttpClient)
    .addConverterFactory(ProtoConverterFactory.create())
    .build()

interface UserApi {
    @GET("users/{id}")
    suspend fun getUser(@Path("id") userId: String): UserResponse
}
```

But here's the reframe: **for most Android apps, serialization speed is not the bottleneck.** Parsing a 10KB JSON response with Moshi takes about 2-5ms on a modern device. The same response in Protobuf parses in under 1ms. That 2-4ms difference is invisible to the user. Where Protobuf wins meaningfully is payload size — on metered mobile connections, sending 50% less data matters. And in high-throughput scenarios like chat apps or real-time feeds processing hundreds of messages per second, the serialization speed difference compounds.

My rule of thumb: if your API responses are under 50KB and you're making fewer than 20 requests per minute, Moshi with JSON is fine. If you're dealing with large payloads, high-frequency updates, or you're already using gRPC on the backend, Protobuf is worth the migration cost. Don't switch just because someone told you it's "faster" without quantifying what that means for your specific traffic.

## Gzip vs Brotli Compression

OkHttp automatically adds `Accept-Encoding: gzip` to requests and transparently decompresses responses. You don't need to configure this — it happens at the network interceptor level. Gzip typically compresses JSON responses by 60-70%.

Brotli (`br` encoding) compresses 15-20% better than gzip for text content, but OkHttp doesn't support it out of the box. You'd need the Brotli decoder dependency and a custom interceptor. In practice, the 15-20% improvement rarely justifies the complexity and APK size increase. For typical API responses in the 5-50KB range, gzip is more than sufficient and it's already working for you silently.

## Ktor vs Retrofit Performance

I've used both Ktor and Retrofit in production. Performance-wise, they're closer than most benchmarks suggest. Retrofit is a thin type-safe layer on top of OkHttp — it adds almost zero overhead. Ktor is a full HTTP client framework with its own engine abstraction. On Android, you'd typically use the OkHttp engine for Ktor, which means the actual network I/O goes through OkHttp anyway.

The difference shows up in serialization. Retrofit with Moshi uses code-gen adapters that avoid reflection — fast, predictable, zero GC pressure. Ktor with kotlinx.serialization also generates serializers at compile time. In my benchmarks on a Pixel 7, parsing a 20KB JSON response averaged 3.1ms with Moshi and 2.8ms with kotlinx.serialization. Not a meaningful difference.

Where Retrofit has a genuine edge is connection management maturity. It delegates everything to OkHttp, battle-tested for over a decade in Cash App, Square's point-of-sale systems, and thousands of other demanding apps. Ktor's OkHttp engine wraps this, but the wrapping adds small overhead and occasionally introduces subtle differences in timeout handling. If performance is your primary concern, Retrofit remains the pragmatic choice. Ktor's value is multiplatform — if you're sharing networking code between Android and iOS via KMP, Ktor makes sense regardless of the marginal performance gap.

## Certificate Pinning and Its Cost

Certificate pinning verifies the server's certificate against known pins, preventing man-in-the-middle attacks even if a rogue CA issues a fraudulent certificate. OkHttp makes this easy:

```kotlin
val client = OkHttpClient.Builder()
    .certificatePinner(
        CertificatePinner.Builder()
            .add(
                "api.example.com",
                "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
            )
            .build()
    )
    .build()
```

The runtime performance cost is negligible — pin verification is a hash comparison that takes microseconds. But the **operational cost** is real. If your certificate rotates and you haven't updated the pins, every network request fails. I've seen this take down production apps. The mitigation is to pin to multiple certificates (current + backup) and include both leaf and intermediate pins. This is a security-vs-reliability tradeoff, not a performance one, but I mention it because I've seen teams add pinning "for performance" (it doesn't help) and then suffer outages when they forget to rotate.

## Putting It All Together

If I were setting up a network stack for a new Android app today, here's what I'd configure from day one:

```kotlin
val client = OkHttpClient.Builder()
    .connectionPool(ConnectionPool(5, 5, TimeUnit.MINUTES))
    .cache(Cache(File(context.cacheDir, "http_cache"), 50L * 1024 * 1024))
    .dns(CachingDns(ttlMs = 600_000))
    .addNetworkInterceptor(TimingInterceptor())
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(15, TimeUnit.SECONDS)
    .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
    .build()
```

The key insight from all of this is simple: **measure before you optimize, and measure the right things.** Most network "performance" work I've seen focuses on payload size or serialization format. Those matter, but they're usually the smallest slice of the total request time. Connection reuse, DNS caching, and concurrency management are where the real seconds hide. Put a timing interceptor in your debug builds, look at the numbers, and let the data tell you where to spend your time.

Thanks for reading!
