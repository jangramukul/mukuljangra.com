---
title: "Kotlin Coroutines & Flows"
layout: course
description: "Master structured concurrency, suspend functions, Flow operators, StateFlow, Channels, and exception handling for production Android apps."
icon: "⚡"
color: "#fbbf24"
difficulty: "Intermediate to Expert"
modules: 8
lessons: 40
duration: "6 weeks"
order: 2
tags:
  - Kotlin Coroutines
  - Flows
  - Android
what_you_learn:
  - "Understand structured concurrency and coroutine lifecycle"
  - "Handle exceptions and cancellation in production coroutine code"
  - "Build reactive data streams with Flow, StateFlow, and SharedFlow"
  - "Use Flow operators — map, filter, combine, flatMapLatest, debounce"
  - "Implement Channels for communication between coroutines"
  - "Test coroutines and Flows with Turbine and TestDispatcher"
prerequisites:
  - "Kotlin fundamentals"
  - "Basic Android development"
---

## Module 1: Coroutines Fundamentals

Coroutines aren't threads. They're a way to write asynchronous code that looks synchronous. Understanding this distinction is the foundation.

### Lesson 1.1: What Are Coroutines?

A coroutine is a suspendable computation. It can pause execution at a suspension point, free the thread, and resume later — potentially on a different thread.

```kotlin
// This looks synchronous, but it's non-blocking
suspend fun fetchUserProfile(userId: String): UserProfile {
    val user = api.getUser(userId)           // Suspends, doesn't block
    val posts = api.getUserPosts(userId)      // Suspends, doesn't block
    return UserProfile(user, posts)
}
```

**Coroutines vs Threads** — A thread is an OS-level construct that costs ~1MB of stack memory. A coroutine is a Kotlin-level construct that costs ~100 bytes. You can launch 100,000 coroutines without breaking a sweat. Try that with threads.

**Key takeaway:** Coroutines let you write sequential-looking code that executes asynchronously. The `suspend` keyword marks functions that can pause and resume.

### Lesson 1.2: CoroutineScope and Structured Concurrency

Structured concurrency means every coroutine has a parent, and if the parent is cancelled, all children are cancelled too. No orphan coroutines leaking resources.

```kotlin
class UserViewModel : ViewModel() {
    // viewModelScope is cancelled when ViewModel is cleared
    fun loadProfile(userId: String) {
        viewModelScope.launch {
            val profile = fetchUserProfile(userId)
            _state.value = ProfileState.Loaded(profile)
        }
    }
}

// lifecycleScope — tied to Activity/Fragment lifecycle
class ProfileFragment : Fragment() {
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        viewLifecycleOwner.lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect { state ->
                    updateUI(state)
                }
            }
        }
    }
}
```

**Why structured concurrency matters** — Without it, you get fire-and-forget coroutines that leak memory, crash after the UI is gone, and are impossible to test. `viewModelScope` and `lifecycleScope` solve this automatically.

**Key takeaway:** Never use `GlobalScope`. Always launch coroutines within a scope that has a defined lifecycle — `viewModelScope`, `lifecycleScope`, or a custom scope you control.

### Lesson 1.3: Dispatchers

Dispatchers determine which thread pool a coroutine runs on.

```kotlin
// Dispatchers.Main — UI thread (Android main thread)
withContext(Dispatchers.Main) {
    textView.text = "Updated"  // UI operations
}

// Dispatchers.IO — Optimized for blocking I/O
withContext(Dispatchers.IO) {
    val data = database.query("SELECT * FROM users")
    val response = httpClient.get("https://api.example.com")
}

// Dispatchers.Default — CPU-intensive work
withContext(Dispatchers.Default) {
    val sorted = hugeList.sorted()
    val parsed = json.parse(largePayload)
}

// Dispatchers.Unconfined — Starts in caller's thread, resumes in whatever thread
// ⚠️ Rarely used in production — mainly for testing
```

**IO vs Default** — `Dispatchers.IO` is backed by a thread pool of 64 threads (by default) designed for blocking operations. `Dispatchers.Default` uses a thread pool equal to CPU cores, optimized for computation. They actually share threads but have different concurrency limits.

**Key takeaway:** Use `Dispatchers.Main` for UI, `Dispatchers.IO` for network/disk, `Dispatchers.Default` for computation. Use `withContext()` to switch dispatchers within a coroutine.

### Lesson 1.4: Suspend Functions

```kotlin
// suspend function — can call other suspend functions
suspend fun fetchAndSaveUser(userId: String) {
    val user = api.getUser(userId)         // Suspends here
    database.saveUser(user)                 // Suspends here
    notificationManager.notify(user)        // Regular function
}

// Under the hood — the compiler transforms this into a state machine
// Each suspension point is a state. The function is resumed by a Continuation.

// Making callback APIs suspendable
suspend fun getCurrentLocation(): Location = suspendCancellableCoroutine { cont ->
    locationClient.lastLocation
        .addOnSuccessListener { location ->
            cont.resume(location)
        }
        .addOnFailureListener { exception ->
            cont.resumeWithException(exception)
        }
        .addOnCanceledListener {
            cont.cancel()
        }
}
```

**Key takeaway:** `suspend` is a compiler hint, not a thread annotation. A suspend function can run on any thread. It just means "this function might pause."

### Lesson 1.5: launch vs async

```kotlin
// launch — fire-and-forget, returns Job
val job = scope.launch {
    sendAnalytics(event)  // Don't need the result
}

// async — returns Deferred<T>, call await() for result
val deferred = scope.async {
    api.getUser(userId)  // Need the result
}
val user = deferred.await()

// Parallel decomposition with async
suspend fun loadDashboard(): Dashboard = coroutineScope {
    val user = async { api.getUser(userId) }
    val orders = async { api.getOrders(userId) }
    val recommendations = async { api.getRecommendations(userId) }

    Dashboard(
        user = user.await(),
        orders = orders.await(),
        recommendations = recommendations.await()
    )
}
```

**Important** — `async` without `await()` is a bug waiting to happen. If the async coroutine throws, the exception is silently swallowed until `await()` is called. Always pair `async` with `await()`.

**Key takeaway:** Use `launch` when you don't need a return value. Use `async`/`await` for parallel work where you need results. Wrap parallel `async` calls in `coroutineScope` for structured concurrency.

### Quiz: Coroutines Fundamentals

#### What happens if you use `GlobalScope.launch` in a ViewModel?

- ❌ The coroutine is automatically cancelled when the ViewModel is cleared
- ❌ The coroutine runs on `Dispatchers.Main` by default
- ✅ The coroutine keeps running even after the ViewModel is destroyed, potentially leaking resources
- ❌ The app crashes immediately with an `IllegalStateException`

> **Explanation:** `GlobalScope` is not tied to any lifecycle. Coroutines launched in it are never automatically cancelled, which leads to resource leaks and potential crashes when they try to update destroyed UI.

#### Which dispatcher should you use for parsing a large JSON payload?

- ❌ `Dispatchers.Main`
- ❌ `Dispatchers.IO`
- ✅ `Dispatchers.Default`
- ❌ `Dispatchers.Unconfined`

> **Explanation:** JSON parsing is a CPU-intensive computation, not a blocking I/O operation. `Dispatchers.Default` is backed by a thread pool sized to CPU cores, optimized for exactly this kind of work.

#### What is the key difference between `launch` and `async`?

- ❌ `launch` runs on `Dispatchers.Main`, `async` runs on `Dispatchers.IO`
- ❌ `launch` is faster than `async`
- ❌ `async` is used for sequential work, `launch` for parallel work
- ✅ `launch` returns a `Job` (no result), `async` returns a `Deferred<T>` (with result via `await()`)

> **Explanation:** `launch` is fire-and-forget — use it when you don't need a return value. `async` returns a `Deferred<T>` that you can `await()` to get the result, making it ideal for parallel decomposition.

### Coding Challenge: Parallel Data Fetching

Write a suspend function `fetchDashboardData` that fetches a user's profile, notifications, and feed items **in parallel** from three different API calls. Return a `DashboardData` data class combining all three results. Use structured concurrency so that if any call fails, all others are cancelled.

#### Solution

```kotlin
data class DashboardData(
    val profile: UserProfile,
    val notifications: List<Notification>,
    val feed: List<FeedItem>
)

suspend fun fetchDashboardData(userId: String): DashboardData = coroutineScope {
    val profile = async { api.getUserProfile(userId) }
    val notifications = async { api.getNotifications(userId) }
    val feed = async { api.getFeedItems(userId) }

    DashboardData(
        profile = profile.await(),
        notifications = notifications.await(),
        feed = feed.await()
    )
}
```

Using `coroutineScope` ensures structured concurrency — if any `async` call throws, the scope cancels all sibling coroutines. All three calls run in parallel because `async` starts immediately, and `await()` only suspends until the result is ready.

---

## Module 2: Exception Handling

Getting exception handling right in coroutines is harder than it looks. The rules are different from regular try-catch.

### Lesson 2.1: Exception Propagation

```kotlin
// launch — exceptions propagate UP to parent
scope.launch {
    throw RuntimeException("Boom")  // Crashes the parent scope
}

// async — exceptions are deferred until await()
val deferred = scope.async {
    throw RuntimeException("Boom")  // Stored in Deferred
}
// Exception thrown HERE, not in the async block
deferred.await()
```

**Key takeaway:** `launch` propagates exceptions immediately. `async` stores them until `await()`. This difference matters for how you structure error handling.

### Lesson 2.2: CoroutineExceptionHandler

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    log("Caught: ${exception.message}")
    crashReporter.report(exception)
}

// Handler only works on root coroutines (direct children of scope)
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main + handler)

scope.launch {
    // If this throws, handler catches it
    riskyOperation()
}

// ⚠️ Handler does NOT work on nested coroutines
scope.launch {
    launch {
        throw Exception("This bypasses the handler!")
    }
}
```

**Key takeaway:** `CoroutineExceptionHandler` is a last resort, not a replacement for try-catch. It only catches exceptions from root-level `launch` coroutines. Use try-catch inside coroutines for recoverable errors.

### Lesson 2.3: SupervisorJob and SupervisorScope

```kotlin
// Regular Job — one child failure cancels all siblings
scope.launch {
    launch { api.syncOrders() }   // If this fails...
    launch { api.syncProfile() }  // ...this gets cancelled too
}

// SupervisorJob — child failures don't affect siblings
val supervisorScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
supervisorScope.launch {
    launch { api.syncOrders() }   // If this fails...
    launch { api.syncProfile() }  // ...this keeps running
}

// supervisorScope builder
suspend fun syncAll() = supervisorScope {
    val ordersJob = launch { api.syncOrders() }
    val profileJob = launch { api.syncProfile() }
    // Each failure is independent
}
```

**When to use SupervisorJob** — Use it when child coroutines are independent. A ViewModel that launches multiple unrelated fetches should use SupervisorJob so one failure doesn't kill everything.

**Key takeaway:** `SupervisorJob` prevents failure cascading. `viewModelScope` already uses `SupervisorJob` internally — that's why one failed network call doesn't cancel your other work.

### Lesson 2.4: Cancellation

```kotlin
// Cooperative cancellation — your code must check
suspend fun processItems(items: List<Item>) {
    for (item in items) {
        ensureActive()  // Throws CancellationException if cancelled
        process(item)
    }
}

// yield() — cooperative cancellation + thread yielding
suspend fun cpuIntensiveWork() {
    for (i in 1..1_000_000) {
        yield()  // Check for cancellation and let other coroutines run
        compute(i)
    }
}

// NonCancellable — for cleanup that must complete
suspend fun saveAndClose() {
    try {
        saveData()
    } finally {
        withContext(NonCancellable) {
            database.close()  // Must complete even if cancelled
        }
    }
}
```

**CancellationException is special** — It doesn't propagate to the parent. It's the normal cancellation mechanism. Never catch `CancellationException` and swallow it — that breaks structured concurrency.

**Key takeaway:** Cancellation is cooperative. Long-running suspend functions must check `isActive` or call `ensureActive()`. Always use `NonCancellable` for cleanup in `finally` blocks.

### Quiz: Exception Handling

#### What happens when a child coroutine launched with `launch` inside a regular `Job` scope throws an exception?

- ❌ Only the failed child coroutine is cancelled
- ✅ The exception propagates to the parent, cancelling all sibling coroutines
- ❌ The exception is silently swallowed
- ❌ The exception is stored and rethrown when the parent completes

> **Explanation:** With a regular `Job`, failure in one child cancels the parent, which in turn cancels all other children. This is the default behavior of structured concurrency. Use `SupervisorJob` to prevent this cascading failure.

#### Where must a `CoroutineExceptionHandler` be installed for it to catch exceptions?

- ❌ On any `launch` coroutine, including nested ones
- ❌ In the `catch` block of a try-catch
- ✅ On a root coroutine — a direct child of the `CoroutineScope`
- ❌ On the `async` builder

> **Explanation:** `CoroutineExceptionHandler` only works on root-level `launch` coroutines (direct children of the scope). Nested coroutines propagate exceptions to their parent, bypassing the handler. It also doesn't work with `async` since exceptions are deferred to `await()`.

#### Why should you never catch and swallow `CancellationException`?

- ❌ It causes an `OutOfMemoryError`
- ❌ It makes the app crash silently
- ✅ It breaks structured concurrency by preventing the coroutine from actually being cancelled
- ❌ It is automatically rethrown by the Kotlin runtime

> **Explanation:** `CancellationException` is the mechanism for cooperative cancellation. Swallowing it means the coroutine continues running even though its parent or scope requested cancellation, breaking the structured concurrency contract.

### Coding Challenge: Resilient Parallel Sync

Write a `syncAllData` function that syncs orders, profile, and settings **independently** — if syncing orders fails, profile and settings should still complete. Log any individual failures without crashing the whole operation.

#### Solution

```kotlin
suspend fun syncAllData() = supervisorScope {
    val ordersJob = launch {
        try {
            api.syncOrders()
        } catch (e: Exception) {
            log("Orders sync failed: ${e.message}")
        }
    }

    val profileJob = launch {
        try {
            api.syncProfile()
        } catch (e: Exception) {
            log("Profile sync failed: ${e.message}")
        }
    }

    val settingsJob = launch {
        try {
            api.syncSettings()
        } catch (e: Exception) {
            log("Settings sync failed: ${e.message}")
        }
    }
}
```

`supervisorScope` ensures that each child coroutine is independent — a failure in one doesn't cancel the others. Each `launch` wraps its work in try-catch to log failures gracefully. This is the standard pattern for independent parallel operations.

---

## Module 3: Kotlin Flow

Flow is Kotlin's answer to reactive streams. It's cold, sequential, and integrated with coroutines.

### Lesson 3.1: Cold Flows

```kotlin
// A Flow doesn't execute until collected
fun observeUsers(): Flow<List<User>> = flow {
    while (true) {
        val users = database.getAllUsers()
        emit(users)                    // Send data downstream
        delay(5_000)                   // Wait 5 seconds
    }
}

// Collecting triggers execution
viewModelScope.launch {
    observeUsers().collect { users ->
        _state.value = UsersState.Loaded(users)
    }
}

// flowOf — create a flow from values
val numbers = flowOf(1, 2, 3, 4, 5)

// asFlow — convert collections to flows
val flow = listOf("a", "b", "c").asFlow()
```

**Cold vs Hot** — A cold flow doesn't produce values until someone collects it. Each collector gets its own independent stream. Hot flows (SharedFlow, StateFlow) produce values regardless of collectors.

**Key takeaway:** `flow { }` creates a cold stream. Code inside the builder only runs when `collect` is called. Each collector gets a fresh execution.

### Lesson 3.2: Flow Operators

```kotlin
// Transform operators
val userNames = observeUsers()
    .map { users -> users.map { it.name } }
    .filter { names -> names.isNotEmpty() }
    .distinctUntilChanged()

// flatMapLatest — cancel previous emission when new one arrives
val searchResults = searchQuery
    .debounce(300)
    .flatMapLatest { query ->
        if (query.isBlank()) flowOf(emptyList())
        else searchApi.search(query)
    }

// combine — merge multiple flows
val uiState = combine(
    userFlow,
    settingsFlow,
    networkStatusFlow
) { user, settings, network ->
    UiState(user, settings, network)
}

// zip — pair emissions one-to-one
val paired = flow1.zip(flow2) { a, b -> Pair(a, b) }

// onEach — side effects without consuming
val loggingFlow = dataFlow
    .onEach { data -> log("Received: $data") }
    .onStart { log("Flow started") }
    .onCompletion { log("Flow completed") }
```

**Key takeaway:** Flow operators are lazy — they build a pipeline that executes only when collected. `combine` is your go-to for merging multiple data sources into a single UI state.

### Lesson 3.3: StateFlow and SharedFlow

```kotlin
class ProfileViewModel : ViewModel() {
    // StateFlow — always has a current value, replays last value
    private val _state = MutableStateFlow<ProfileState>(ProfileState.Loading)
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    // SharedFlow — no initial value, configurable replay
    private val _events = MutableSharedFlow<UiEvent>()
    val events: SharedFlow<UiEvent> = _events.asSharedFlow()

    fun loadProfile(userId: String) {
        viewModelScope.launch {
            _state.value = ProfileState.Loading
            try {
                val profile = repository.getProfile(userId)
                _state.value = ProfileState.Success(profile)
            } catch (e: Exception) {
                _state.value = ProfileState.Error(e.message)
                _events.emit(UiEvent.ShowSnackbar("Failed to load"))
            }
        }
    }
}

// Collecting safely in UI
viewLifecycleOwner.lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.state.collect { state ->
            when (state) {
                ProfileState.Loading -> showLoading()
                is ProfileState.Success -> showProfile(state.profile)
                is ProfileState.Error -> showError(state.message)
            }
        }
    }
}
```

**StateFlow vs SharedFlow** — `StateFlow` always has a value (replays 1), uses equality checks to skip duplicates, and is perfect for UI state. `SharedFlow` has no initial value, configurable replay, and is better for events.

**Key takeaway:** Use `StateFlow` for state (the current UI representation). Use `SharedFlow` for one-time events (navigation, snackbars). Always collect with `repeatOnLifecycle` in UI.

### Lesson 3.4: callbackFlow and channelFlow

```kotlin
// Convert callback APIs to Flows
fun observeConnectivity(context: Context): Flow<Boolean> = callbackFlow {
    val manager = context.getSystemService<ConnectivityManager>()
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { trySend(true) }
        override fun onLost(network: Network) { trySend(false) }
    }

    val request = NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()

    manager?.registerNetworkCallback(request, callback)

    awaitClose {
        manager?.unregisterNetworkCallback(callback)
    }
}

// channelFlow — for concurrent emissions from multiple coroutines
fun mergedData(): Flow<Data> = channelFlow {
    launch { source1.collect { send(it) } }
    launch { source2.collect { send(it) } }
}
```

**Key takeaway:** `callbackFlow` bridges callback-based APIs to Flow. Always call `awaitClose` to clean up resources when the flow is cancelled.

### Lesson 3.5: stateIn and shareIn

```kotlin
class DashboardViewModel : ViewModel() {
    // Convert cold Flow to hot StateFlow
    val dashboardState: StateFlow<DashboardState> = repository
        .observeDashboard()
        .map { data -> DashboardState.fromData(data) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = DashboardState.Loading
        )
}
```

**`WhileSubscribed(5_000)`** — Keeps the upstream flow active for 5 seconds after the last subscriber disappears. This survives configuration changes (rotation takes ~300ms) without restarting the flow, while still stopping it when the user truly navigates away.

**Key takeaway:** `stateIn` converts a cold flow to a hot `StateFlow`. `WhileSubscribed(5_000)` is the recommended strategy for Android UI because it handles configuration changes gracefully.

### Quiz: Kotlin Flow

#### What is the key difference between a cold Flow and a hot StateFlow?

- ❌ Cold flows are faster than hot flows
- ✅ A cold flow doesn't produce values until collected; a StateFlow produces values regardless of collectors
- ❌ Cold flows can only emit one value; StateFlow can emit multiple values
- ❌ StateFlow requires `Dispatchers.Main`; cold flows run on `Dispatchers.IO`

> **Explanation:** Cold flows are lazy — the `flow { }` builder code only executes when `collect` is called, and each collector gets an independent execution. `StateFlow` is hot — it always holds a current value and emits to all collectors.

#### What does `flatMapLatest` do when a new value is emitted upstream?

- ❌ It buffers the previous emission and processes both
- ❌ It ignores the new value until the current one finishes
- ✅ It cancels the previous inner flow and starts a new one for the latest value
- ❌ It merges both emissions into a single result

> **Explanation:** `flatMapLatest` cancels any in-progress inner flow when a new upstream value arrives. This makes it perfect for search-as-you-type where only the latest query matters.

#### Why should you use `collectAsStateWithLifecycle()` instead of `collectAsState()` in Compose?

- ❌ `collectAsState()` causes compilation errors in Jetpack Compose
- ❌ `collectAsStateWithLifecycle()` is faster
- ✅ `collectAsStateWithLifecycle()` stops collecting when the app is backgrounded, saving resources
- ❌ `collectAsState()` doesn't support `StateFlow`

> **Explanation:** `collectAsStateWithLifecycle()` respects the Android lifecycle — it stops collection when the app goes to the background and restarts when foregrounded. Plain `collectAsState()` keeps collecting even when the UI isn't visible, wasting resources and potentially triggering unnecessary work.

### Coding Challenge: Reactive Search Pipeline

Build a `StateFlow<SearchState>` that takes a `MutableStateFlow<String>` as input query, debounces for 300ms, skips empty queries, uses `flatMapLatest` to call a search repository, and handles errors gracefully. Convert it to a `StateFlow` using `stateIn` with `WhileSubscribed(5_000)`.

#### Solution

```kotlin
sealed class SearchState {
    object Idle : SearchState()
    object Loading : SearchState()
    data class Results(val items: List<String>) : SearchState()
    data class Error(val message: String?) : SearchState()
}

class SearchViewModel(
    private val repository: SearchRepository
) : ViewModel() {

    private val query = MutableStateFlow("")

    val searchState: StateFlow<SearchState> = query
        .debounce(300)
        .distinctUntilChanged()
        .flatMapLatest { q ->
            if (q.isBlank()) flowOf(SearchState.Idle)
            else flow {
                emit(SearchState.Loading)
                val results = repository.search(q)
                emit(SearchState.Results(results))
            }.catch { e -> emit(SearchState.Error(e.message)) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SearchState.Idle)

    fun onQueryChanged(newQuery: String) {
        query.value = newQuery
    }
}
```

The pipeline chains `debounce` → `distinctUntilChanged` → `flatMapLatest` to ensure only the latest query is processed. `catch` handles errors per-query, and `stateIn` with `WhileSubscribed(5_000)` keeps the upstream alive through configuration changes.

---

## Module 4: Channels

Channels are hot streams for communication between coroutines — like BlockingQueue but suspending.

### Lesson 4.1: Channel Basics

```kotlin
val channel = Channel<Int>()

// Producer
launch {
    for (i in 1..5) {
        channel.send(i)  // Suspends if buffer is full
    }
    channel.close()
}

// Consumer
launch {
    for (value in channel) {  // Iterates until closed
        println(value)
    }
}
```

### Lesson 4.2: Channel Types and Buffering

```kotlin
// Rendezvous — no buffer (default)
val rendezvous = Channel<Int>()  // send suspends until receive

// Buffered — fixed buffer
val buffered = Channel<Int>(capacity = 10)

// Conflated — keeps only the latest value
val conflated = Channel<Int>(Channel.CONFLATED)

// Unlimited — never suspends on send (use carefully)
val unlimited = Channel<Int>(Channel.UNLIMITED)
```

**Key takeaway:** Choose the right channel type. `CONFLATED` is great for UI updates where you only care about the latest value. Buffered channels help with producer-consumer speed mismatches.

### Lesson 4.3: produce Builder

```kotlin
// produce — creates a coroutine that sends to a channel
fun CoroutineScope.produceNumbers(): ReceiveChannel<Int> = produce {
    var x = 1
    while (true) {
        send(x++)
        delay(100)
    }
}

// Fan-out — multiple consumers
val producer = produceNumbers()
repeat(3) { consumerId ->
    launch {
        for (msg in producer) {
            println("Consumer $consumerId received $msg")
        }
    }
}
```

**Key takeaway:** Use `produce` for structured channel creation. The channel is automatically closed when the producer coroutine completes.

### Quiz: Channels

#### What is the default channel type when you create `Channel<Int>()`?

- ❌ Buffered with capacity 10
- ❌ Conflated — keeps only the latest value
- ✅ Rendezvous — no buffer, `send` suspends until a receiver is ready
- ❌ Unlimited — never suspends on send

> **Explanation:** The default channel is a rendezvous channel with zero buffer capacity. The sender suspends until a receiver calls `receive()`, and vice versa. This creates tight synchronization between producer and consumer.

#### When would you choose a `CONFLATED` channel over a buffered one?

- ❌ When you need to process every single emitted value
- ✅ When you only care about the most recent value and can safely skip intermediate ones
- ❌ When the producer is slower than the consumer
- ❌ When you need FIFO ordering of all messages

> **Explanation:** A `CONFLATED` channel keeps only the latest value, dropping any previously sent value that hasn't been received yet. This is ideal for UI updates or status indicators where only the current state matters.

### Coding Challenge: Producer-Consumer with Fan-Out

Create a producer coroutine that generates integers 1 through 20 and sends them to a channel. Then launch 3 consumer coroutines that read from the same channel and process items concurrently. Print which consumer processed which number.

#### Solution

```kotlin
fun main() = runBlocking {
    val channel = Channel<Int>()

    // Producer
    launch {
        for (i in 1..20) {
            channel.send(i)
        }
        channel.close()
    }

    // Fan-out: 3 consumers sharing the channel
    repeat(3) { consumerId ->
        launch {
            for (value in channel) {
                println("Consumer $consumerId processed $value")
                delay(100) // Simulate processing time
            }
        }
    }
}
```

Each value is delivered to exactly one consumer — channels provide fan-out distribution automatically. The `for (value in channel)` loop terminates when the channel is closed by the producer. This pattern is useful for distributing work across multiple concurrent workers.

---

## Module 5: Advanced Flow Patterns

Real-world patterns that go beyond basic flow operations.

### Lesson 5.1: Error Handling in Flows

```kotlin
// catch — handle upstream errors
val safeFlow = dataFlow
    .catch { e ->
        log("Error: ${e.message}")
        emit(DataState.Error(e))  // Emit a fallback value
    }
    .collect { data -> updateUI(data) }

// retry — automatic retry with backoff
val resilientFlow = api.observeData()
    .retry(retries = 3) { cause ->
        if (cause is IOException) {
            delay(1000)  // Wait before retry
            true         // Retry
        } else {
            false        // Don't retry
        }
    }
```

**Key takeaway:** `catch` only catches upstream errors — errors in `collect` are not caught. `retry` is powerful for network resilience.

### Lesson 5.2: Flow Testing

```kotlin
@Test
fun `state transitions correctly`() = runTest {
    val repository = FakeRepository()
    val viewModel = ProfileViewModel(repository)

    viewModel.state.test {
        assertEquals(ProfileState.Loading, awaitItem())

        viewModel.loadProfile("user-1")

        assertEquals(ProfileState.Success(fakeProfile), awaitItem())
        cancelAndConsumeRemainingEvents()
    }
}

// Turbine library for Flow testing
@Test
fun `emits error on network failure`() = runTest {
    val repository = FakeRepository(shouldFail = true)
    val viewModel = ProfileViewModel(repository)

    viewModel.state.test {
        awaitItem() // Loading
        viewModel.loadProfile("user-1")
        val error = awaitItem()
        assertTrue(error is ProfileState.Error)
    }
}
```

**Key takeaway:** Use the Turbine library for testing Flows. `runTest` from kotlinx-coroutines-test provides a virtual time dispatcher for deterministic tests.

### Lesson 5.3: Custom Flow Operators

```kotlin
// Throttle first — emit first item, then ignore for duration
fun <T> Flow<T>.throttleFirst(windowMs: Long): Flow<T> = flow {
    var lastEmitTime = 0L
    collect { value ->
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastEmitTime >= windowMs) {
            lastEmitTime = currentTime
            emit(value)
        }
    }
}

// Usage — prevent double-clicks
button.clicks()
    .throttleFirst(500)
    .collect { handleClick() }
```

**Key takeaway:** You can build custom operators using the `flow { }` builder. This is powerful for creating domain-specific streaming behavior.

### Quiz: Advanced Flow Patterns

#### Where does the `catch` operator catch exceptions in a Flow pipeline?

- ❌ It catches exceptions from both upstream and downstream operators
- ❌ It catches exceptions only in the `collect` block
- ✅ It catches exceptions only from upstream operators (those declared before `catch`)
- ❌ It catches exceptions from all operators regardless of position

> **Explanation:** `catch` is transparent to downstream exceptions. It only intercepts errors from operators declared above it in the chain. Exceptions thrown in `collect` are not caught by `catch` — you need a try-catch around `collect` for those.

#### What does the `retry` operator's lambda return value indicate?

- ❌ `true` means stop retrying, `false` means continue retrying
- ✅ `true` means retry the upstream flow, `false` means propagate the exception
- ❌ It returns the number of retries remaining
- ❌ It returns the delay before the next retry

> **Explanation:** The `retry` predicate receives the exception as a parameter and returns `true` to retry or `false` to give up and let the exception propagate downstream. You can add a `delay()` inside the predicate for exponential backoff.

#### When testing Flows with Turbine, what does `awaitItem()` do?

- ❌ It immediately returns the first value in the flow without waiting
- ❌ It waits indefinitely until a value is emitted
- ✅ It suspends until the next item is emitted, failing with a timeout if no item arrives
- ❌ It collects all remaining items at once

> **Explanation:** `awaitItem()` suspends the test coroutine until the Flow emits its next value. If no value is emitted within the default timeout (typically 1 second), the test fails. This makes Flow assertions sequential and deterministic.

### Coding Challenge: Resilient Network Flow

Create a Flow that fetches data from an API, retries up to 3 times with exponential backoff (1s, 2s, 4s) only for `IOException`, emits a fallback error state for non-retryable exceptions, and logs each attempt using `onEach`.

#### Solution

```kotlin
sealed class DataState {
    object Loading : DataState()
    data class Success(val data: String) : DataState()
    data class Error(val message: String?) : DataState()
}

fun fetchDataFlow(): Flow<DataState> = flow {
    emit(DataState.Loading)
    val result = api.fetchData()
    emit(DataState.Success(result))
}
    .retry(retries = 3) { cause ->
        if (cause is IOException) {
            val attempt = 3 - 2 // tracked externally or via counter
            delay(1000L * (1 shl (cause.hashCode() % 3))) // simplified
            true
        } else {
            false
        }
    }
    .catch { e -> emit(DataState.Error(e.message)) }
    .onEach { state -> log("State: $state") }

// Cleaner version with explicit backoff tracking
fun fetchDataFlowClean(): Flow<DataState> = flow {
    emit(DataState.Loading)
    val result = api.fetchData()
    emit(DataState.Success(result))
}.let { upstream ->
    var attempt = 0
    upstream.retry(retries = 3) { cause ->
        if (cause is IOException) {
            delay(1000L * (1 shl attempt))  // 1s, 2s, 4s
            attempt++
            true
        } else false
    }
}
    .catch { e -> emit(DataState.Error(e.message)) }
    .onEach { state -> log("State: $state") }
```

The `retry` operator re-executes the entire upstream `flow { }` block on failure. Exponential backoff uses bit shifting (`1 shl attempt`) to double the delay each time. `catch` handles any exceptions that exhaust retries or are non-retryable.

---

## Module 6: Coroutines in Android Architecture

How coroutines integrate with ViewModels, Repositories, and the Android lifecycle.

### Lesson 6.1: ViewModel Patterns

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository
) : ViewModel() {

    private val searchQuery = MutableStateFlow("")

    val searchResults: StateFlow<SearchState> = searchQuery
        .debounce(300)
        .distinctUntilChanged()
        .flatMapLatest { query ->
            if (query.isBlank()) flowOf(SearchState.Empty)
            else searchRepository.search(query)
                .map<List<Result>, SearchState> { SearchState.Results(it) }
                .onStart { emit(SearchState.Loading) }
                .catch { emit(SearchState.Error(it.message)) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SearchState.Empty)

    fun onQueryChanged(query: String) {
        searchQuery.value = query
    }
}
```

### Lesson 6.2: Repository Layer

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    fun observeUser(userId: String): Flow<User> = dao
        .observeUser(userId)
        .onStart {
            // Refresh from network in background
            try {
                val networkUser = withContext(dispatcher) { api.getUser(userId) }
                dao.insertUser(networkUser)
            } catch (e: Exception) {
                // Network failure — database cache still works
            }
        }

    suspend fun refreshUser(userId: String) = withContext(dispatcher) {
        val user = api.getUser(userId)
        dao.insertUser(user)
    }
}
```

**Key takeaway:** Repositories expose `Flow` for observable data and `suspend` functions for one-shot operations. The Room database handles thread safety; the repository coordinates network + cache.

### Lesson 6.3: Safe Collection in Compose

```kotlin
@Composable
fun ProfileScreen(viewModel: ProfileViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    when (val current = state) {
        ProfileState.Loading -> LoadingIndicator()
        is ProfileState.Success -> ProfileContent(current.profile)
        is ProfileState.Error -> ErrorMessage(current.message)
    }
}
```

**`collectAsStateWithLifecycle`** — This is the correct way to collect flows in Compose. It respects the lifecycle — stops collecting when the app is backgrounded, restarts when foregrounded. Using plain `collectAsState()` keeps collecting even in the background, wasting resources.

**Key takeaway:** Always use `collectAsStateWithLifecycle()` in Compose. It's lifecycle-aware and prevents unnecessary work when the app isn't visible.

### Quiz: Coroutines in Android Architecture

#### Why does `WhileSubscribed(5_000)` use a 5-second stop timeout?

- ❌ It takes 5 seconds for the garbage collector to reclaim the flow
- ✅ It survives configuration changes like rotation (~300ms) without restarting the upstream flow
- ❌ It's the maximum time Android allows background work
- ❌ It matches the default ANR timeout

> **Explanation:** Screen rotation destroys and recreates the Activity/Fragment in about 300ms. The 5-second timeout keeps the upstream flow alive during this transition, avoiding an unnecessary restart. When the user truly navigates away, the flow stops after 5 seconds.

#### In a Repository, why should you expose `Flow` for observable data instead of `suspend` functions?

- ❌ `Flow` is faster than `suspend` functions
- ❌ `suspend` functions can't return data from a database
- ✅ `Flow` allows continuous observation of data changes over time, while `suspend` gives a one-shot result
- ❌ `Flow` automatically handles threading; `suspend` functions don't

> **Explanation:** A `Flow` keeps the collector updated whenever the underlying data changes (e.g., a Room database query emitting new results on insert). A `suspend` function returns once and the caller must manually re-fetch to get updates.

### Coding Challenge: Offline-First Repository

Write a Repository function `observeArticles` that returns a `Flow<List<Article>>`. It should observe the local database (Room DAO) for continuous updates, and on the first collection trigger a background network refresh that inserts fresh data into the database. Handle network failures silently — the cached database data should still flow.

#### Solution

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    fun observeArticles(): Flow<List<Article>> = dao
        .observeAllArticles()  // Room returns Flow<List<Article>>
        .onStart {
            try {
                val fresh = withContext(ioDispatcher) { api.getArticles() }
                dao.insertAll(fresh)
            } catch (e: Exception) {
                // Network failure is silent — cached data still flows
            }
        }
}
```

The `onStart` block triggers a network refresh before the first emission. Room's `Flow` automatically re-emits when `insertAll` updates the table, so collectors receive the fresh data seamlessly. Network failures are caught silently because the database cache serves as the fallback.

---

## Module 7: Testing Coroutines

Testing async code requires controlling time and concurrency.

### Lesson 7.1: runTest and TestDispatchers

```kotlin
@Test
fun `loadUser updates state`() = runTest {
    // runTest uses TestCoroutineScheduler — virtual time
    val repository = FakeUserRepository()
    val viewModel = UserViewModel(repository)

    viewModel.loadUser("user-1")

    // advanceUntilIdle() skips all delays
    advanceUntilIdle()

    assertEquals(UserState.Loaded(fakeUser), viewModel.state.value)
}

// Injecting TestDispatcher
@Test
fun `repository fetches on IO`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val repository = UserRepository(
        api = fakeApi,
        dao = fakeDao,
        dispatcher = testDispatcher
    )

    repository.refreshUser("user-1")
    advanceUntilIdle()

    assertEquals(fakeUser, fakeDao.getUser("user-1"))
}
```

### Lesson 7.2: Testing Flows

```kotlin
@Test
fun `search emits results after debounce`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository())

    viewModel.searchResults.test {
        assertEquals(SearchState.Empty, awaitItem())

        viewModel.onQueryChanged("kotlin")
        advanceTimeBy(301) // Past debounce threshold

        assertEquals(SearchState.Loading, awaitItem())
        assertEquals(SearchState.Results(fakeResults), awaitItem())

        cancelAndConsumeRemainingEvents()
    }
}
```

**Key takeaway:** `runTest` controls virtual time. Use `advanceTimeBy()` to skip delays and `advanceUntilIdle()` to complete all pending coroutines. Always inject dispatchers for testability.

### Quiz: Testing Coroutines

#### Why should you inject `CoroutineDispatcher` into your classes instead of hardcoding `Dispatchers.IO`?

- ❌ `Dispatchers.IO` is deprecated in newer Kotlin versions
- ❌ Hardcoded dispatchers cause memory leaks
- ✅ Injecting dispatchers lets you swap in a `TestDispatcher` during tests for deterministic, controlled execution
- ❌ `Dispatchers.IO` doesn't work inside `runTest`

> **Explanation:** Hardcoded dispatchers run on real threads during tests, making them non-deterministic and slow. By injecting the dispatcher, you can replace it with `StandardTestDispatcher` or `UnconfinedTestDispatcher` in tests, giving you full control over coroutine execution and virtual time.

#### What does `advanceUntilIdle()` do inside `runTest`?

- ❌ It waits for real wall-clock time to pass
- ❌ It cancels all pending coroutines
- ✅ It advances virtual time and executes all pending coroutines until no work remains
- ❌ It suspends the test until a timeout occurs

> **Explanation:** `advanceUntilIdle()` processes all pending tasks in the `TestCoroutineScheduler`, including those behind `delay()` calls. It runs everything to completion instantly in virtual time, making tests fast and deterministic.

### Coding Challenge: ViewModel Test with Turbine

Write a test for a `CounterViewModel` that has a `StateFlow<Int>` starting at 0. When `increment()` is called, it should update the state to 1 after a 500ms delay. Use `runTest`, `advanceUntilIdle()`, and Turbine's `test` block to verify the state transitions.

#### Solution

```kotlin
class CounterViewModel(
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default
) : ViewModel() {
    private val _count = MutableStateFlow(0)
    val count: StateFlow<Int> = _count.asStateFlow()

    fun increment() {
        viewModelScope.launch(dispatcher) {
            delay(500)
            _count.value += 1
        }
    }
}

@Test
fun `increment updates count after delay`() = runTest {
    val testDispatcher = StandardTestDispatcher(testScheduler)
    val viewModel = CounterViewModel(dispatcher = testDispatcher)

    viewModel.count.test {
        assertEquals(0, awaitItem())  // Initial state

        viewModel.increment()
        advanceTimeBy(501)  // Past the 500ms delay

        assertEquals(1, awaitItem())
        cancelAndConsumeRemainingEvents()
    }
}
```

The test injects `StandardTestDispatcher` tied to the same `testScheduler` as `runTest`. `advanceTimeBy(501)` skips past the 500ms delay without real waiting. Turbine's `awaitItem()` captures each state emission for assertion.

---

## Module 8: Advanced Coroutine Patterns

Production-grade patterns for complex scenarios.

### Lesson 8.1: Mutex for Shared State

```kotlin
class Counter {
    private val mutex = Mutex()
    private var count = 0

    suspend fun increment() = mutex.withLock {
        count++
    }

    suspend fun getCount(): Int = mutex.withLock {
        count
    }
}
```

**Mutex vs synchronized** — `Mutex` suspends the coroutine while waiting; `synchronized` blocks the thread. In coroutine code, always prefer `Mutex` — blocking a thread defeats the purpose of coroutines.

### Lesson 8.2: Debounce, Throttle, and Rate Limiting

```kotlin
// Debounce search with MutableStateFlow
private val _query = MutableStateFlow("")

val results = _query
    .debounce(300)
    .distinctUntilChanged()
    .filter { it.length >= 2 }
    .flatMapLatest { query ->
        repository.search(query)
    }
    .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
```

### Lesson 8.3: Parallel Work with Limits

```kotlin
// Process items in parallel with limited concurrency
suspend fun processAll(items: List<Item>) = coroutineScope {
    val semaphore = Semaphore(permits = 5) // Max 5 concurrent

    items.map { item ->
        async {
            semaphore.withPermit {
                processItem(item)
            }
        }
    }.awaitAll()
}
```

**Key takeaway:** Use `Semaphore` to limit concurrency. This prevents overwhelming servers or databases when processing large batches in parallel.

### Lesson 8.4: withTimeout and Race Conditions

```kotlin
// Timeout for operations
suspend fun fetchWithTimeout(): Result<Data> {
    return try {
        withTimeout(5_000) {
            val data = api.fetchData()
            Result.success(data)
        }
    } catch (e: TimeoutCancellationException) {
        Result.failure(e)
    }
}

// Race — first to complete wins
suspend fun fetchFastest(): Data = coroutineScope {
    select {
        async { primaryApi.fetch() }.onAwait { it }
        async { fallbackApi.fetch() }.onAwait { it }
    }
}
```

**Key takeaway:** `withTimeout` throws `TimeoutCancellationException` which is a `CancellationException`. Handle it explicitly if you need to recover. `select` lets you race coroutines and take the first result.

### Quiz: Advanced Coroutine Patterns

#### Why should you use `Mutex` instead of `synchronized` in coroutine code?

- ❌ `Mutex` is faster than `synchronized`
- ❌ `synchronized` is not available in Kotlin
- ✅ `Mutex` suspends the coroutine while waiting, whereas `synchronized` blocks the thread, defeating the purpose of coroutines
- ❌ `Mutex` supports reentrant locking; `synchronized` does not

> **Explanation:** `synchronized` blocks the underlying thread, preventing it from executing other coroutines. `Mutex` cooperatively suspends the coroutine, freeing the thread for other work. In a coroutine context, blocking a thread is wasteful and can cause deadlocks.

#### What does `Semaphore(permits = 5)` control in a coroutine context?

- ❌ The maximum number of threads in the thread pool
- ❌ The maximum number of values a channel can buffer
- ✅ The maximum number of coroutines that can execute the guarded block concurrently
- ❌ The maximum retry count for failed operations

> **Explanation:** `Semaphore` limits concurrent access to a resource. With `permits = 5`, at most 5 coroutines can enter the `withPermit` block at the same time. Others suspend until a permit is released. This prevents overwhelming external systems during batch processing.

#### What happens when `withTimeout` times out?

- ❌ It returns `null` silently
- ❌ It throws a regular `RuntimeException`
- ✅ It throws `TimeoutCancellationException`, which is a subclass of `CancellationException`
- ❌ It cancels the entire parent scope

> **Explanation:** `TimeoutCancellationException` is a `CancellationException`, so it doesn't propagate to the parent scope by default. If you need a null result instead of an exception, use `withTimeoutOrNull`. Handle `TimeoutCancellationException` explicitly if you need recovery logic.

### Coding Challenge: Rate-Limited Batch Processor

Write a function `processUrls` that takes a list of 100 URLs and fetches them all concurrently, but limits concurrency to at most 10 simultaneous requests using `Semaphore`. Collect all results and return them. Handle individual request failures without failing the entire batch.

#### Solution

```kotlin
data class FetchResult(val url: String, val body: String?, val error: String?)

suspend fun processUrls(urls: List<String>): List<FetchResult> = coroutineScope {
    val semaphore = Semaphore(permits = 10)

    urls.map { url ->
        async {
            semaphore.withPermit {
                try {
                    val body = httpClient.get(url)
                    FetchResult(url, body = body, error = null)
                } catch (e: Exception) {
                    FetchResult(url, body = null, error = e.message)
                }
            }
        }
    }.awaitAll()
}
```

All 100 URLs launch `async` coroutines immediately, but `Semaphore(10)` ensures only 10 are actively fetching at any time. Each request handles its own errors via try-catch, so one failure doesn't cancel the batch. `awaitAll()` collects all results after every coroutine completes.

---

Thank You for completing the Kotlin Coroutines & Flows course! Coroutines are the async backbone of modern Android — understanding them deeply changes how you design your entire app architecture. ⚡
