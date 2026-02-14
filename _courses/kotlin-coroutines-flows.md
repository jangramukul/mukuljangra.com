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

---

Thank You for completing the Kotlin Coroutines & Flows course! Coroutines are the async backbone of modern Android — understanding them deeply changes how you design your entire app architecture. ⚡
