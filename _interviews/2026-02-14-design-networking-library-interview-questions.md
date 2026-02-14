---
title: "Design a Networking Library"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 11
sequence: 65
description: "Designing a networking library like Retrofit or OkHttp tests your understanding of HTTP internals, request pipelines, caching, and concurrency."
---

## Design a Networking Library

Networking library design comes up often in system design rounds because it touches HTTP internals, request pipelines, caching, concurrency, and extensibility. The goal is to walk through how you would build something like Retrofit or OkHttp from scratch.

### Requirements & Scope

#### Q1: What are the core functional requirements?

The library needs to support all standard HTTP methods (GET, POST, PUT, DELETE, PATCH), serialize request bodies and deserialize response bodies, support interceptors for cross-cutting concerns like logging and auth, and provide HTTP caching. It should handle multipart uploads, streaming responses, and configurable timeouts.

The basic pipeline is: **Build Request -> Interceptor Chain -> Connection Pool -> Socket I/O -> Response Parsing -> Callback/Return**.

#### Q2: What are the non-functional requirements?

Thread safety is critical — multiple threads will make requests concurrently, so connection pools, caches, and dispatchers all need to be safe for concurrent access. Requests must support cancellation so the caller can abort in-flight work when a screen is destroyed. The library should be extensible — new serializers, interceptors, and call adapters should plug in without modifying core code.

Performance matters too. Connection reuse, response caching, and efficient thread pooling directly affect app responsiveness and battery usage on mobile.

#### Q3: What is in scope and what is out of scope?

In scope: HTTP/1.1 and HTTP/2 request execution, request/response interceptors, pluggable serialization, connection pooling, disk-based HTTP caching, request cancellation and timeouts, retry logic, TLS support, and multipart uploads.

Out of scope for an initial design: WebSocket support, HTTP/3 (QUIC), custom DNS resolution, proxy authentication, and cookie management. These can be added later through interceptors or extensions.

### High-Level Design

#### Q4: What does the high-level architecture look like?

The architecture follows a pipeline model. A request enters the system, passes through a chain of interceptors, reaches the transport layer which manages connections, and a response flows back through the same chain in reverse.

The key components are: a public API layer (builder/DSL for creating requests), an interceptor chain (ordered list of processors), a connection pool (manages TCP/TLS connections), a transport layer (socket I/O), a serialization layer (converts between objects and bytes), and a cache (stores responses on disk).

Each component is independent and replaceable. The interceptor chain is the backbone — even internal concerns like caching and connection management are implemented as interceptors in OkHttp.

#### Q5: How would you design the public API?

Use a builder pattern for the client and an annotated interface for endpoint definitions. Retrofit's approach works well — define a Kotlin interface with annotations, and the library generates the implementation at runtime using reflection or code generation.

```kotlin
interface NewsApi {
    @GET("articles")
    suspend fun getArticles(
        @Query("page") page: Int,
        @Query("category") category: String
    ): Response<List<Article>>

    @POST("articles")
    suspend fun createArticle(
        @Body article: ArticleRequest
    ): Response<Article>
}

val api = NetworkClient.Builder()
    .baseUrl("https://api.example.com/v1/")
    .addConverterFactory(MoshiConverterFactory.create())
    .addInterceptor(AuthInterceptor(tokenProvider))
    .build()
    .create(NewsApi::class.java)
```

The interface separates the "what" (endpoint definition) from the "how" (HTTP execution). It makes the API self-documenting and testable — you can create a fake implementation for tests without touching the network.

#### Q6: How does the interceptor chain pattern work?

The interceptor chain is an ordered list of processors. Each interceptor receives the request, can modify it, call `chain.proceed()` to pass it to the next interceptor, and then modify the response on the way back. Any interceptor can short-circuit the chain by returning a response directly — this is how caching works.

```kotlin
interface Interceptor {
    fun intercept(chain: Chain): Response

    interface Chain {
        val request: Request
        fun proceed(request: Request): Response
    }
}

class AuthInterceptor(
    private val tokenProvider: TokenProvider
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request.newBuilder()
            .header("Authorization", "Bearer ${tokenProvider.getToken()}")
            .build()
        return chain.proceed(request)
    }
}
```

OkHttp has two interceptor levels. Application interceptors run once per logical request — they see the original request and final response. Network interceptors run for every physical request, including redirects and retries. Logging interceptors are usually added as network interceptors because you want to log what actually goes over the wire.

#### Q7: How does the serialization layer work?

A converter factory transforms between Kotlin objects and HTTP bodies. When sending a POST, the converter serializes the object to JSON (or Protobuf, XML). When receiving a response, it deserializes the body into the target type.

```kotlin
interface ConverterFactory {
    fun responseBodyConverter(type: Type): Converter<ResponseBody, *>?
    fun requestBodyConverter(type: Type): Converter<*, RequestBody>?
}

interface Converter<F, T> {
    fun convert(value: F): T
}
```

Retrofit supports multiple converter factories tried in registration order. This decouples networking from serialization completely — you can swap Gson for Moshi without changing any API definitions. For Kotlin projects, Moshi and kotlinx.serialization are preferred over Gson because they handle null safety and default parameters correctly.

#### Q8: How does connection pooling work at a high level?

Opening a new TCP connection for every request is expensive — DNS resolution, TCP handshake, and TLS handshake can take 100-300ms combined. Connection pooling keeps idle connections alive and reuses them for subsequent requests to the same host.

OkHttp's pool keeps up to 5 idle connections per address with a 5-minute keep-alive timeout. The pool tracks connections by route (host + port + proxy). When a request completes, the connection goes back to the pool instead of being closed. A cleanup thread evicts connections that exceed the idle timeout.

HTTP/2 makes pooling even more effective because it multiplexes multiple requests over a single connection. You only need one connection per host, and all requests share it without head-of-line blocking at the application layer.

#### Q9: How does HTTP caching work?

HTTP caching uses response headers to decide if a stored response is still valid. The key headers are `Cache-Control: max-age=3600` (response is fresh for 3600 seconds), `ETag` (a content hash for conditional requests), and `Last-Modified` (a timestamp for conditional checks).

When a cached response expires, the library sends a conditional request with `If-None-Match: <etag>` or `If-Modified-Since: <timestamp>`. If the content hasn't changed, the server returns 304 (Not Modified) with no body, and the library serves the cached version. This saves bandwidth and reduces latency.

OkHttp has a built-in `Cache` class that handles all of this. You provide a directory and max size, and it respects `Cache-Control`, `ETag`, and `Last-Modified` automatically.

### Low-Level Design & Deep Dives

#### Q10: How would you implement the interceptor chain internally?

The chain is a recursive structure. Each `Chain` object holds the full list of interceptors and a current index. When an interceptor calls `proceed()`, it creates a new `Chain` with the index incremented by one and calls the next interceptor's `intercept()` method.

```kotlin
class RealInterceptorChain(
    private val interceptors: List<Interceptor>,
    private val index: Int,
    override val request: Request
) : Interceptor.Chain {

    override fun proceed(request: Request): Response {
        val next = RealInterceptorChain(interceptors, index + 1, request)
        val interceptor = interceptors[index]
        return interceptor.intercept(next)
    }
}
```

The last interceptor in the chain is always the one that does actual network I/O — the `CallServerInterceptor`. Everything before it is processing. OkHttp's internal chain order is: RetryAndFollowUpInterceptor, BridgeInterceptor, CacheInterceptor, ConnectInterceptor, CallServerInterceptor. Application interceptors are prepended, network interceptors are inserted between ConnectInterceptor and CallServerInterceptor.

#### Q11: How do connection pooling and keep-alive work internally?

The pool stores connections in a list, keyed by route. When a new request comes in, the pool searches for an idle connection matching the target route. If found, it returns that connection. If not, it creates a new one.

Keep-alive is negotiated via the `Connection: keep-alive` header (default in HTTP/1.1). After a response is fully read, the connection stays open and returns to the pool. A background cleanup thread runs periodically, checking each connection's idle time. If a connection has been idle longer than the keep-alive timeout, it gets closed.

The tricky part is knowing when a connection is truly idle. The library must fully consume or close the response body before releasing the connection back to the pool. If the caller doesn't read the body, the connection is stuck — OkHttp handles this by tracking response body consumption and closing leaked connections.

#### Q12: How does TLS and certificate pinning work?

TLS secures the connection by encrypting traffic between client and server. During the handshake, the server presents a certificate chain, and the client verifies it against the device's trust store. Certificate pinning goes further — it restricts which certificates or public keys the app accepts.

```kotlin
val client = OkHttpClient.Builder()
    .certificatePinner(
        CertificatePinner.Builder()
            .add(
                "api.example.com",
                "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
            )
            .build()
    )
    .build()
```

Pin against the public key hash (SPKI), not the full certificate. Certificates rotate frequently, but the public key often stays the same. Always include a backup pin. The risk with pinning is that if the server rotates keys unexpectedly, your app can't make network calls until you ship an update. On Android, Network Security Config is often a safer alternative because it can be changed without a code release.

#### Q13: How do you implement request cancellation and timeouts?

Cancellation ties each network call to a `Call` object or a coroutine `Job`. When cancelled, the library closes the underlying socket, releases the connection back to the pool, and stops reading the response body.

```kotlin
class NetworkCall<T>(
    private val rawCall: okhttp3.Call
) {
    suspend fun execute(): T = suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { rawCall.cancel() }
        rawCall.enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                cont.resume(parseResponse(response))
            }
            override fun onFailure(call: Call, e: IOException) {
                cont.resumeWithException(e)
            }
        })
    }
}
```

For timeouts, define three separate values: connect timeout (TCP handshake), read timeout (waiting for response data), and write timeout (sending request body). OkHttp defaults all three to 10 seconds. There's also a `callTimeout` that covers the entire request lifecycle including redirects and retries. Each timeout throws a specific exception so the caller can handle them differently.

#### Q14: How does retry with exponential backoff work?

Only retry transient failures — network timeouts, 503 (Service Unavailable), 429 (Too Many Requests). Never retry 4xx client errors (except 429) or non-idempotent requests without an idempotency key, because that could create duplicate data.

```kotlin
class RetryInterceptor(
    private val maxRetries: Int = 3,
    private val baseDelayMs: Long = 1000
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request
        var lastException: IOException? = null

        repeat(maxRetries) { attempt ->
            try {
                val response = chain.proceed(request)
                if (response.code != 503 && response.code != 429) return response
                response.close()
            } catch (e: IOException) {
                lastException = e
            }
            val delay = baseDelayMs * (1L shl attempt)
            Thread.sleep(delay + Random.nextLong(0, delay / 4))
        }
        throw lastException ?: IOException("Retry limit exceeded")
    }
}
```

The delay doubles each attempt (1s, 2s, 4s) with random jitter added. Jitter prevents the thundering herd problem — without it, all clients retry at the exact same time after a server recovery. For 429 responses, respect the `Retry-After` header instead of using your own backoff.

#### Q15: How do multipart uploads work?

Multipart uploads send a file as part of a multi-section request body. Each section has its own content type and boundary delimiter. The body is streamed — never loaded fully into memory.

```kotlin
interface FileUploadApi {
    @Multipart
    @POST("upload")
    suspend fun uploadFile(
        @Part file: MultipartBody.Part,
        @Part("description") description: RequestBody
    ): Response<UploadResult>
}

val file = File("/path/to/photo.jpg")
val body = file.asRequestBody("image/jpeg".toMediaType())
val part = MultipartBody.Part.createFormData("file", file.name, body)
api.uploadFile(part, "Profile photo".toRequestBody())
```

OkHttp's `RequestBody` has a `writeTo(sink: BufferedSink)` method that writes chunks to the socket. For upload progress tracking, wrap the `RequestBody` and count bytes as they pass through the sink. This works for any size file because the data streams from disk to the network without buffering the entire file in memory.

#### Q16: How do you handle response streaming for large files?

For large responses like file downloads, never buffer the entire body in memory. Read the response as a stream and write to disk in fixed-size chunks.

```kotlin
suspend fun downloadFile(url: String, destination: File) {
    val response = client.newCall(Request.Builder().url(url).build()).execute()
    val body = response.body ?: return
    val contentLength = body.contentLength()

    body.byteStream().use { input ->
        FileOutputStream(destination).use { output ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            var totalRead = 0L
            while (input.read(buffer).also { bytesRead = it } != -1) {
                output.write(buffer, 0, bytesRead)
                totalRead += bytesRead
                emitProgress(totalRead, contentLength)
            }
        }
    }
}
```

The 8 KB buffer size is a good default — large enough to reduce system call overhead, small enough to avoid memory pressure. The response body must be closed after reading, or the underlying connection will leak and never return to the pool.

#### Q17: How do thread safety and the dispatcher work?

OkHttp has its own `Dispatcher` that manages a thread pool for async requests. It defaults to 64 max concurrent requests total and 5 per host. When you call `enqueue()`, the dispatcher checks these limits. If under the cap, it runs the request immediately. If at the cap, it queues the request until a slot opens.

```kotlin
val dispatcher = Dispatcher().apply {
    maxRequests = 64
    maxRequestsPerHost = 5
}
val client = OkHttpClient.Builder()
    .dispatcher(dispatcher)
    .build()
```

With Retrofit's coroutine support, suspend functions use `suspendCancellableCoroutine` to bridge OkHttp's callback-based API. The I/O happens on OkHttp's thread pool, and the result resumes on the caller's coroutine dispatcher. You don't need `withContext(Dispatchers.IO)` when calling Retrofit suspend functions — the I/O is already off the main thread.

The connection pool, cache, and dispatcher all use internal synchronization. The connection pool uses a lock to protect the connection list. The cache uses file-level locking for disk access.

#### Q18: How would you test a networking library?

Use OkHttp's `MockWebServer` — it runs a real HTTP server on localhost. You enqueue responses, make real HTTP requests against it, and then verify the requests your code sent.

```kotlin
class ApiTest {
    private val mockServer = MockWebServer()
    private lateinit var api: NewsApi

    @Before
    fun setup() {
        mockServer.start()
        api = NetworkClient.Builder()
            .baseUrl(mockServer.url("/"))
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(NewsApi::class.java)
    }

    @Test
    fun getArticles_returns_parsed_list() = runTest {
        mockServer.enqueue(MockResponse()
            .setBody("""[{"id":1,"title":"Test"}]""")
            .setResponseCode(200))

        val result = api.getArticles(page = 1, category = "tech")

        assertEquals(1, result.body()?.size)
        assertEquals("/articles?page=1&category=tech", mockServer.takeRequest().path)
    }
}
```

`MockWebServer` lets you verify the exact URL, headers, and body your code sends. You can simulate slow networks with `setBodyDelay()`, test error handling with non-200 status codes, and test timeouts by never enqueuing a response. For unit testing interceptors in isolation, create a fake `Chain` that returns a canned response from `proceed()`.

### Common Follow-ups

- How would you deduplicate identical in-flight requests so the same URL isn't fetched twice?
- How would you implement request prioritization for critical API calls?
- What is the difference between HTTP/1.1 and HTTP/2 from the client library's perspective?
- How would you handle certificate rotation without shipping an app update?
- How would you add observability and metrics to the networking layer?
- How would you design a call adapter to support Flow or RxJava return types?
- How would you handle authentication token refresh when a request returns 401?
