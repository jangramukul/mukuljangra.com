---
title: "Design a Networking Library"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 11
sequence: 73
description: "Designing a networking library like Retrofit or OkHttp tests your understanding of HTTP internals, request pipelines, caching, and concurrency."
---

## Design a Networking Library

Designing a networking library like Retrofit or OkHttp is a common system design question because it touches HTTP internals, concurrency, caching, and extensibility. It tests whether you understand what happens between calling an API and getting a response.

### Core Questions (Beginner → Intermediate)

#### Q1: What are the core responsibilities of a networking library?

A networking library handles building HTTP requests, managing connections, sending requests over the network, and parsing responses. Beyond that, it manages connection pooling, handles timeouts and retries, supports caching, provides interceptors for request/response modification, and handles thread management so network calls never block the main thread.

The basic pipeline is: **Build request → Interceptor chain → Connection pool → Socket I/O → Response parsing → Callback/return**.

#### Q2: How would you design the public API for making network requests?

Use a builder pattern for requests and a clean interface for defining API endpoints. Retrofit's approach works well — define a Kotlin interface with annotated functions, and the library generates the implementation at runtime.

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
    .addConverter(MoshiConverterFactory.create())
    .build()
    .create(NewsApi::class.java)
```

The interface approach separates the "what" (endpoint definition) from the "how" (HTTP execution). It makes the API self-documenting and testable — you can create a fake implementation for tests without any network calls.

#### Q3: What is the interceptor chain pattern and why is it useful?

The interceptor chain is a series of processing steps that each request and response pass through. Each interceptor can modify the request before it's sent, modify the response before it's returned, or short-circuit the chain entirely (like returning a cached response). OkHttp uses this pattern extensively.

```kotlin
interface Interceptor {
    fun intercept(chain: Chain): Response

    interface Chain {
        val request: Request
        fun proceed(request: Request): Response
    }
}

class LoggingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request
        val startTime = System.nanoTime()
        val response = chain.proceed(request)
        val duration = (System.nanoTime() - startTime) / 1_000_000
        Log.d("HTTP", "${request.method} ${request.url} → ${response.code} (${duration}ms)")
        return response
    }
}
```

Each interceptor calls `chain.proceed()` to pass the request to the next interceptor. This creates a chain where you can add logging, authentication headers, caching, retry logic, and error mapping without modifying core networking code. OkHttp has two levels — application interceptors (run once per logical request) and network interceptors (run for every physical request, including redirects and retries).

#### Q4: How does connection pooling work?

Opening a new TCP connection for every request is expensive — it involves DNS resolution, TCP handshake, and TLS handshake. Connection pooling keeps idle connections alive and reuses them for subsequent requests to the same host.

OkHttp's connection pool keeps up to 5 idle connections per host, with a 5-minute keep-alive timeout. When a new request targets a host with an idle connection, it skips the handshake steps entirely. This matters because a TLS handshake alone can take 100-300ms. For apps making multiple requests to the same API, pooling cuts latency significantly.

The pool tracks connections by route (host + port + proxy). When a connection finishes, it goes back to the pool instead of being closed. A background thread evicts connections that have been idle longer than the keep-alive timeout. HTTP/2 makes this even better — it multiplexes multiple requests over a single connection, so you only need one connection per host.

#### Q5: How would you handle request timeouts?

Define three separate timeouts: **connect timeout** (how long to wait for the TCP connection), **read timeout** (how long to wait for the server to start sending data), and **write timeout** (how long to wait for the request body to be sent). OkHttp defaults all three to 10 seconds.

```kotlin
val client = NetworkClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(15, TimeUnit.SECONDS)
    .callTimeout(60, TimeUnit.SECONDS) // overall timeout for the entire call
    .build()
```

The `callTimeout` covers the entire request lifecycle — including redirects and retries. If a call exceeds this, it fails regardless of which phase it's in. This prevents a request from hanging indefinitely due to a combination of slow connect + slow response. Each timeout throws a specific exception (`SocketTimeoutException`, `ConnectException`), so the caller can react differently to different failure modes.

#### Q6: What is a converter factory and why is it needed?

A converter factory transforms between Kotlin objects and HTTP request/response bodies. When you send a `POST` with an `ArticleRequest` object, the converter serializes it to JSON (or Protobuf, XML, etc.). When you receive a response, it deserializes the JSON body into an `Article` object.

```kotlin
interface ConverterFactory {
    fun responseBodyConverter(type: Type): Converter<ResponseBody, *>?
    fun requestBodyConverter(type: Type): Converter<*, RequestBody>?
}

interface Converter<F, T> {
    fun convert(value: F): T
}
```

Retrofit supports multiple converter factories — Moshi, Gson, kotlinx.serialization, Protobuf. They're tried in order until one can handle the type. This decouples the networking layer from serialization. You can swap Gson for Moshi without changing any API definitions. In practice, Moshi and kotlinx.serialization are preferred over Gson for Kotlin projects because they handle Kotlin's null safety and default parameters correctly.

#### Q7: How would you handle request cancellation?

Tie each network call to a coroutine Job or a custom `Call` object that supports cancellation. When the user navigates away or the ViewModel is cleared, cancel the in-flight request. This frees up the connection, stops reading the response, and avoids delivering a result to a dead screen.

```kotlin
class NetworkCall<T>(
    private val rawCall: okhttp3.Call
) {
    suspend fun execute(): T = suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation {
            rawCall.cancel()
        }
        rawCall.enqueue(object : Callback {
            override fun onResponse(call: Call, response: okhttp3.Response) {
                continuation.resume(parseResponse(response))
            }
            override fun onFailure(call: Call, e: IOException) {
                continuation.resumeWithException(e)
            }
        })
    }
}
```

With coroutines, cancellation is cooperative. When `suspendCancellableCoroutine` is cancelled, `invokeOnCancellation` fires and cancels the underlying OkHttp call. This closes the socket and releases the connection back to the pool. Without this, cancelled requests would still consume bandwidth and connection slots.

#### Q8: How does HTTP caching work with cache headers?

HTTP caching uses response headers to determine if a cached response is still valid. The key headers are:

- **Cache-Control: max-age=3600** — Response is valid for 3600 seconds. No network request needed until it expires
- **ETag** — A hash of the response content. On the next request, send `If-None-Match: <etag>`. If the content hasn't changed, the server returns 304 (Not Modified) with no body
- **Last-Modified** — A timestamp. Send `If-Modified-Since` on the next request for a conditional check

```kotlin
class CacheInterceptor(private val cache: DiskCache) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request
        val cached = cache.get(request.url.toString())

        if (cached != null && cached.isFresh()) {
            return cached.toResponse()
        }

        val networkRequest = if (cached?.etag != null) {
            request.newBuilder()
                .header("If-None-Match", cached.etag)
                .build()
        } else request

        val response = chain.proceed(networkRequest)
        if (response.code == 304 && cached != null) {
            return cached.toResponse()
        }
        cache.put(request.url.toString(), response)
        return response
    }
}
```

OkHttp has a built-in `Cache` class that handles all of this. You just provide a directory and a max size. The cache respects `Cache-Control`, `ETag`, and `Last-Modified` automatically. For offline support, you can add a forced-cache interceptor that returns stale responses when there's no network.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How would you implement a retry mechanism with exponential backoff?

Retries should only happen for transient failures — network timeouts, 503 (Service Unavailable), 429 (Too Many Requests). Never retry 4xx client errors (except 429) or non-idempotent requests (POST without an idempotency key) because that could create duplicate data.

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
                if (response.code != 503 && response.code != 429) {
                    return response
                }
                response.close()
            } catch (e: IOException) {
                lastException = e
            }
            val delay = baseDelayMs * (1L shl attempt) // 1s, 2s, 4s
            Thread.sleep(delay + Random.nextLong(0, delay / 4))
        }
        throw lastException ?: IOException("Retry limit exceeded")
    }
}
```

For 429 responses, respect the `Retry-After` header — it tells you exactly when to retry. Add jitter to the backoff to prevent thundering herd when many clients retry simultaneously after a server recovery.

#### Q10: What is the call adapter pattern?

A call adapter transforms the library's internal `Call<T>` type into whatever async type the caller prefers — `suspend` functions, `Flow<T>`, RxJava `Observable<T>`, or `Deferred<T>`. Retrofit uses this pattern to support multiple concurrency models without being tied to any of them.

```kotlin
interface CallAdapter<T, R> {
    fun adapt(call: Call<T>): R
}

class SuspendCallAdapter<T> : CallAdapter<T, suspend () -> T> {
    override fun adapt(call: Call<T>): suspend () -> T = {
        suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback<T> {
                override fun onSuccess(result: T) = continuation.resume(result)
                override fun onFailure(e: Exception) = continuation.resumeWithException(e)
            })
        }
    }
}
```

This is one of Retrofit's best design decisions. The core library knows nothing about coroutines, RxJava, or Flows. Each concurrency model is an adapter that plugs in. When coroutines became dominant, they just added a new adapter — no changes to the core.

#### Q11: How would you implement SSL/TLS pinning?

SSL pinning ensures your app only trusts specific certificates, not every certificate in the device's trust store. This prevents man-in-the-middle attacks even if the attacker has a rogue CA certificate installed on the device.

Pin against the public key hash (SPKI), not the full certificate. Certificates rotate, but the public key often stays the same. Include a backup pin in case the primary key is compromised.

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

The risk with pinning is that if you pin the wrong key or the server rotates keys, your app can't make any network calls until you ship an update. This is why you always include at least one backup pin and consider using Android's Network Security Config instead of code-level pinning — it can be updated through a config change without rebuilding.

#### Q12: How would you handle multipart file uploads?

Multipart uploads send a file as part of a multi-section request body, where each section has its own content type. This is how image and document uploads typically work.

```kotlin
interface FileUploadApi {
    @Multipart
    @POST("upload")
    suspend fun uploadFile(
        @Part file: MultipartBody.Part,
        @Part("description") description: RequestBody
    ): Response<UploadResult>
}

// Usage
val file = File("/path/to/photo.jpg")
val requestBody = file.asRequestBody("image/jpeg".toMediaType())
val filePart = MultipartBody.Part.createFormData("file", file.name, requestBody)
val description = "Profile photo".toRequestBody("text/plain".toMediaType())

api.uploadFile(filePart, description)
```

For large files, stream the body instead of loading it all into memory. OkHttp supports this — `RequestBody` has a `writeTo(sink: BufferedSink)` method that writes chunks to the socket. To track upload progress, wrap the `RequestBody` and count bytes written through the sink.

#### Q13: How would you add WebSocket support?

WebSockets provide full-duplex communication over a single TCP connection. The initial connection is an HTTP upgrade request. After the handshake, both client and server can send messages at any time without the overhead of new HTTP requests.

```kotlin
class WebSocketManager(private val client: OkHttpClient) {

    private var webSocket: WebSocket? = null

    fun connect(url: String, listener: MessageListener) {
        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                listener.onMessage(text)
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                listener.onError(t)
                reconnectWithBackoff()
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }
        })
    }

    fun send(message: String) {
        webSocket?.send(message)
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnect")
    }
}
```

OkHttp handles the upgrade handshake, frame parsing, ping/pong, and close handshake internally. The main design concern is reconnection — when the connection drops, implement automatic reconnection with exponential backoff. Use a heartbeat (ping every 30 seconds) to detect dead connections before the TCP timeout kicks in.

#### Q14: How does thread management work with coroutines in a networking library?

OkHttp uses its own `Dispatcher` (not a coroutine Dispatcher) that manages a thread pool. By default, it allows 64 concurrent requests and 5 per host. When you call `enqueue()`, the request is added to a queue. If the limits aren't reached, the dispatcher executes it immediately on a pooled thread. If they are, it waits until a slot opens.

With Retrofit's coroutine support, suspend functions use `suspendCancellableCoroutine` to bridge OkHttp's callback-based `enqueue()` to coroutines. The network I/O happens on OkHttp's thread pool, and the result is dispatched back to the caller's dispatcher.

```kotlin
// This suspend call internally does:
// 1. Creates an OkHttp Call
// 2. Calls enqueue() → runs on OkHttp's thread pool
// 3. Resumes the coroutine on the caller's dispatcher
val articles = api.getArticles(page = 1, category = "tech")
```

You don't need `withContext(Dispatchers.IO)` when calling Retrofit suspend functions — the I/O already happens off the main thread inside OkHttp. Wrapping it in `withContext(Dispatchers.IO)` is redundant but harmless.

#### Q15: How would you design the library for testability?

Make every external dependency injectable. The HTTP engine, serializer, cache, and interceptors should all be swappable. For unit testing API calls, use a mock web server like OkHttp's `MockWebServer` that runs a real HTTP server on localhost.

```kotlin
class ApiTest {
    private val mockServer = MockWebServer()
    private lateinit var api: NewsApi

    @Before
    fun setup() {
        mockServer.start()
        api = NetworkClient.Builder()
            .baseUrl(mockServer.url("/"))
            .addConverter(MoshiConverterFactory.create())
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
        val request = mockServer.takeRequest()
        assertEquals("/articles?page=1&category=tech", request.path)
    }
}
```

`MockWebServer` lets you verify the exact request your code sends (URL, headers, body) and control the response (status code, body, delay). For integration tests, you can simulate slow networks, timeouts, and server errors by configuring the mock response with `setBodyDelay()` and error codes.

#### Q16: How does OkHttp's internal architecture work?

OkHttp processes every request through a chain of internal interceptors in this order:

- **RetryAndFollowUpInterceptor** — Handles retries for recoverable failures and follows redirects (301, 302)
- **BridgeInterceptor** — Adds standard headers (Content-Type, Content-Length, Accept-Encoding, Cookie) and handles gzip decompression
- **CacheInterceptor** — Checks the disk cache and returns cached responses when valid
- **ConnectInterceptor** — Finds or creates a connection from the connection pool
- **CallServerInterceptor** — Writes the request to the socket and reads the response

Application interceptors run before this chain, so they see the original request once. Network interceptors run between ConnectInterceptor and CallServerInterceptor, so they see every physical request including redirects. This is why logging interceptors are usually added as network interceptors — you want to log the actual request that goes over the wire.

### Common Follow-ups

- How would you handle request deduplication for identical in-flight requests?
- How would you implement request prioritization for critical API calls?
- How would you design a mock/stub mode for development without a backend?
- What's the difference between HTTP/1.1 and HTTP/2 from the client library's perspective?
- How would you handle certificate rotation without shipping an app update?
- How would you implement response streaming for large payloads?
- How would you add metrics and observability to the networking layer?
