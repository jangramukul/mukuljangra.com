---
title: "System Design for Mobile"
layout: course
description: "Design scalable Android apps — offline-first architecture, caching strategies, pagination, data sync, modularization, and real-world system design patterns."
icon: "🏗️"
color: "#fbbf24"
difficulty: "Intermediate to Expert"
modules: 10
lessons: 54
duration: "8 weeks"
order: 10
tags:
  - System Design
  - Architecture
  - Android
what_you_learn:
  - "Structure and ace mobile system design interviews"
  - "Design offline-first architectures with single source of truth"
  - "Implement multi-layer caching — memory, disk, and network"
  - "Build scalable pagination with Paging 3 and RemoteMediator"
  - "Handle data sync, conflict resolution, and write queues"
  - "Modularize Android projects by feature and layer"
  - "Design type-safe, evolution-friendly APIs in Kotlin"
  - "Build scalable networking with retry, backoff, and circuit breakers"
  - "Design real-world systems — chat apps, feeds, e-commerce, media players, maps"
prerequisites:
  - "Kotlin and coroutines proficiency"
  - "Android architecture experience (MVVM, Repository)"
  - "Room and Retrofit familiarity"
---

## Module 1: The System Design Interview Framework

### Lesson 1.1: How Mobile System Design Interviews Work

A typical mobile system design interview runs 40–45 minutes. Most candidates lose points not because they lack technical knowledge, but because they don't structure their approach well. The interviewer is testing your thought process — how you break down ambiguity, make decisions under constraints, and communicate tradeoffs. You need a repeatable framework that works across any problem, whether you're designing a chat app, a food delivery tracker, or a photo sharing feed.

I'd split the 40–45 minutes roughly like this: 5 minutes for requirements gathering, 15–20 minutes for high-level design, and 15–20 minutes for the deep dive into components that matter most. Keep your intro under 30 seconds — "I'm X, I've been building Android apps and libraries since Y, currently leading a team building Z." That's it. Every minute you spend on your life story is a minute you can't spend demonstrating design skill.

Communication matters more than most people think. Don't just say "I'd use WebSocket here" — explain why. "We need real-time message delivery with low latency, so HTTP polling would waste bandwidth and introduce delay. WebSocket gives us a persistent bidirectional connection, which fits this use case." That's what separates a senior candidate from a mid-level one. The biggest mistakes are jumping straight into low-level details without establishing requirements, designing in silence for minutes at a time, and trying to cover everything instead of going deep on the things that matter.

Before building any feature — in an interview or on the job — take a plain paper or note, design your approach and then start writing code. Think through the API design, the components involved, the interactions between them, the edge cases, and the challenges. This discipline of designing before coding is what separates engineers who build systems that scale from those who build systems that crumble.

**Key takeaway:** Mobile system design interviews test your structured thinking and tradeoff communication, not your ability to recite architecture patterns. A clear framework beats deep knowledge of any single pattern.

### Lesson 1.2: Requirements Gathering

After the introduction, start with requirements gathering by asking questions. But be careful — don't ask for solutions. Ask for constraints and then propose solutions yourself. The interviewer wants to see your thought process, not hear you ask "should I use MVVM or MVI?" Information gathering breaks down into four areas: functional requirements, non-functional requirements, out-of-scope items, and resource constraints.

Functional requirements are the features directly visible to the user. For a messaging app, these might include scrolling through a conversation list, sending and receiving text messages in real-time, sending attachments, deleting or editing sent messages, and seeing read receipts. For a food delivery app, the functional requirements shift entirely — browsing restaurants, customizing orders, tracking delivery on a map, rating past orders. The key insight is that functional requirements drive your entire architecture. A messaging app with real-time sync needs a fundamentally different networking layer than a food delivery app that mostly does request-response.

Non-functional requirements are the qualities that make the app reliable and performant — offline support, real-time sync needs, low latency expectations, battery optimization, and scalability. These aren't features the user directly interacts with, but they feel the absence immediately. Don't skip resource constraints either. Ask about team size — building for a 3-person team versus a 50-person team changes whether you modularize aggressively or keep things simple. Ask about target regions — if you're targeting areas with spotty internet like rural India, you need an offline-first architecture with minimal API calls.

Always explicitly state what's out of scope. In a 45-minute interview you can't design everything. Saying "I'll consider crash reporting and analytics out of scope for this discussion, but I'd use Firebase Crashlytics and a custom analytics SDK in production" shows maturity. It tells the interviewer you know these things exist but you're making a conscious tradeoff about where to spend your limited time.

**Key takeaway:** Requirements gathering is where most candidates either win or lose the interview. Ask for constraints, not solutions. Categorize into functional, non-functional, out-of-scope, and resource constraints.

### Lesson 1.3: High-Level Architecture Design

Before jumping in, ask the interviewer: "Should I start with the high-level design?" This signals structure in your thinking. High-level design is about the big picture — modules, their responsibilities, and how they communicate. Think of it as drawing the boxes and arrows before filling in the code.

The standard mobile architecture diagram has three main zones: the client, the network layer, and the server. On the client side, you have the UI layer (Activities, Fragments, or Compose screens), the ViewModel layer (state management), the repository layer (data orchestration), and the data sources (local database, remote API, in-memory cache). The network layer handles transport — REST over HTTPS for request-response, WebSocket for real-time bidirectional communication, and Server-Sent Events for server push. The server side is usually out of scope for mobile interviews but you should mention API design and what you expect from the backend.

For the client architecture, I almost always reach for MVI (Model-View-Intent) these days. MVVM with LiveData was the standard for years, but MVI gives you unidirectional data flow, which makes state management predictable and debugging much easier. The View emits intents, the ViewModel processes them through a reducer, and a single state object drives the UI. With a single state object, you never end up with inconsistent UI where the loading spinner is showing but the error message is also visible. One state, one truth.

```kotlin
data class ChatScreenState(
    val messages: List<MessageItem> = emptyList(),
    val isLoading: Boolean = false,
    val error: ErrorType? = null,
    val isUserTyping: Boolean = false,
    val hasMoreMessages: Boolean = true,
)

sealed interface ChatIntent {
    data class SendMessage(val text: String) : ChatIntent
    data class LoadMore(val beforeMessageId: String) : ChatIntent
    data class DeleteMessage(val messageId: String) : ChatIntent
    data object RetryConnection : ChatIntent
}
```

Your choice of client-server communication depends entirely on the use case. REST over HTTPS works for most request-response patterns. WebSocket is right for persistent bidirectional communication — chat messages, typing indicators, live location tracking. Server-Sent Events fits when the server needs to push updates but the client doesn't need to send data back frequently. HTTP polling is almost never the right answer for mobile — it wastes battery, bandwidth, and server resources.

**Key takeaway:** High-level design establishes boxes and arrows before code. Choose MVI for predictable state management, and match your networking protocol (REST, WebSocket, SSE) to the data flow pattern your features require.

### Lesson 1.4: Deep Dive — Data Model and Storage

This is where you define what your entities look like and how they relate to each other. On the client side, use Room (SQLite under the hood) because it gives you compile-time query verification, Flow and coroutines integration, and handles relationships well enough for most mobile use cases. The data model phase is where you demonstrate you understand the difference between network models, database entities, and domain models — and why keeping them separate matters.

Network models represent exactly what the API sends and receives. They're annotated with serialization annotations and match the JSON structure. Database entities represent how data is stored locally — they have Room annotations, primary keys, and indexes for query performance. Domain models are what the rest of your app works with — clean Kotlin data classes with no framework annotations. Mapping between these layers sounds like boilerplate, but it isolates your app from API changes and database schema migrations. When the backend team renames a JSON field, you change one mapper function, not fifty call sites.

```kotlin
// Network model — matches API response
@Serializable
data class MessageDto(
    @SerialName("msg_id") val messageId: String,
    @SerialName("chat_id") val chatId: String,
    @SerialName("body") val text: String,
    @SerialName("ts") val timestamp: Long,
    @SerialName("sender_id") val senderId: String,
)

// Database entity — optimized for local queries
@Entity(
    tableName = "messages",
    indices = [Index("chatId"), Index("timestamp")],
)
data class MessageEntity(
    @PrimaryKey val messageId: String,
    val chatId: String,
    val text: String,
    val timestamp: Long,
    val senderId: String,
    val status: String,
    val localCreatedAt: Long = System.currentTimeMillis(),
)

// Domain model — clean, framework-free
data class Message(
    val id: String,
    val chatId: String,
    val text: String,
    val timestamp: Long,
    val senderId: String,
    val status: MessageStatus,
)
```

When designing the data model, think about indexes early. Every column that appears in a WHERE clause or ORDER BY should have an index. On a table with 50,000 rows, a full scan might take 80-100ms while an indexed search takes 1-2ms. Multiply that by how often Room re-executes reactive queries, and those milliseconds compound into real jank.

**Key takeaway:** Separate network, database, and domain models. This isolation protects your app from API changes and database migrations. Add indexes on columns used in WHERE and ORDER BY clauses from day one.

### Lesson 1.5: Deep Dive — Caching and Networking Strategy

This is where most candidates fall short in interviews. You need to articulate a clear caching strategy, not just say "I'll use Room." Think about it in layers: network cache (OkHttp's built-in cache with Cache-Control headers for static resources), database cache (Room for structured data that needs to survive process death), and in-memory cache (a simple LRU map for things like user profiles that are accessed frequently within a session). The real question is always: what's your source of truth? For an offline-first app, the local database is your source of truth, and the network is just a sync mechanism.

Connection management is the single most impactful thing you can optimize. Most of the time, when someone says "our API calls are slow," the problem isn't bandwidth or payload size — it's connection setup. DNS resolution, TLS handshake, TCP slow start. One shared OkHttpClient instance is the most impactful optimization. OkHttp supports HTTP/2 multiplexing out of the box, meaning multiple requests flow over a single TCP connection simultaneously. If you're creating multiple OkHttpClient instances, each one gets its own connection pool and you lose all reuse.

When discussing networking in an interview, mention the interceptor chain. Application interceptors run first, before OkHttp's internal machinery — they see the original request and fire exactly once. Network interceptors sit between OkHttp's connection logic and the wire — they fire for every network request including redirects. Auth token injection belongs in an application interceptor. Logging and timing belong in a network interceptor. This distinction shows the interviewer you understand OkHttp at a deeper level than just "I call enqueue and get a response."

For retry strategy, mention that OkHttp's `retryOnConnectionFailure` is enabled by default, which can silently retry POST requests. For non-idempotent endpoints like payments or order placement, you need either to disable retries or use a separate client created with `newBuilder()`, which shares the same connection pool but has its own retry policy. Always mention idempotency keys for mutations — the server uses them to deduplicate retried requests.

**Key takeaway:** Articulate caching in layers (memory, disk, network), connection management strategy (single OkHttpClient, HTTP/2 multiplexing), and retry safety for mutations (idempotency keys, separate client for non-idempotent calls).

### Lesson 1.6: Wrapping Up the Interview

In the last 5 minutes, summarize your design. Walk through the data flow end-to-end: "User opens the chat screen, the ViewModel requests messages from the repository, the repository emits cached data from Room immediately while triggering a network refresh in the background, new messages flow through the WebSocket and are persisted to Room, which updates the UI through the observed Flow." This end-to-end walkthrough demonstrates that your design actually works as a cohesive system, not just a collection of disconnected patterns.

Mention what you'd add with more time — monitoring and crash reporting, analytics events for key user actions, accessibility considerations, deep linking, widget support, CI/CD pipeline with automated UI tests. This shows breadth of thinking without derailing the focused design discussion. If the interviewer asks follow-up questions about scaling, battery optimization, or edge cases, that's a signal you did well — they're stress-testing your design because it's solid enough to be worth probing.

Finally, be honest about tradeoffs. Every design choice has costs. If you chose WebSocket for real-time messages, acknowledge that WebSocket connections consume battery and you'd need to manage connection lifecycle carefully — disconnecting when the app is backgrounded, reconnecting with exponential backoff. If you chose offline-first with Room, acknowledge the complexity of conflict resolution when the same entity is modified on multiple devices. The interviewer isn't looking for a perfect design. They're looking for a candidate who understands that perfection doesn't exist and can articulate why their imperfect design is the right set of tradeoffs for this specific problem.

**Key takeaway:** End every design with an end-to-end data flow walkthrough. Mention extensions you'd add with more time, and be honest about the costs of every design choice you made.

### Quiz: The System Design Interview Framework

#### What is the recommended time split for a 45-minute mobile system design interview?

- ❌ 15 minutes requirements, 15 minutes high-level, 15 minutes coding
- ✅ 5 minutes requirements, 15-20 minutes high-level design, 15-20 minutes deep dive
- ❌ 10 minutes introduction, 20 minutes design, 15 minutes Q&A
- ❌ Equal time for all phases

> **Explanation:** Spending only 5 minutes on requirements keeps the focus on design work. The bulk of the interview should be split between high-level architecture (establishing the boxes and arrows) and deep-diving into the most important components (showing depth of knowledge).

#### During requirements gathering, why should you ask for constraints rather than solutions?

- ❌ Because the interviewer doesn't know the solutions
- ✅ Because proposing solutions yourself demonstrates engineering judgment and decision-making ability
- ❌ Because constraints are easier to understand than solutions
- ❌ Because solutions are always provided in the problem statement

> **Explanation:** When you ask "should I use MVVM or MVI?" you're asking the interviewer to design for you. When you ask "how many concurrent users?" and then say "given this scale, I'd use MVI for predictable state management," you demonstrate that you can evaluate constraints and make informed decisions.

#### Why is it important to explicitly state what's out of scope?

- ❌ To reduce the total amount of work in the interview
- ❌ Because out-of-scope items are never important
- ✅ Because it shows you understand the full system but can prioritize what to design in limited time
- ❌ Because interviewers penalize discussing too many topics

> **Explanation:** Stating out-of-scope items demonstrates awareness of the complete system while showing you can make conscious tradeoffs about where to invest limited design time. It signals maturity and prioritization ability.

### Coding Challenge: Interview State Machine

Build a Kotlin state machine that models the phases of a system design interview, ensuring valid transitions between phases and tracking time spent in each phase.

#### Solution

```kotlin
enum class InterviewPhase {
    INTRODUCTION,
    REQUIREMENTS,
    HIGH_LEVEL_DESIGN,
    DEEP_DIVE,
    WRAP_UP,
}

class InterviewStateMachine {
    private var currentPhase = InterviewPhase.INTRODUCTION
    private val phaseStartTimes = mutableMapOf<InterviewPhase, Long>()
    private val phaseDurations = mutableMapOf<InterviewPhase, Long>()

    private val validTransitions = mapOf(
        InterviewPhase.INTRODUCTION to setOf(InterviewPhase.REQUIREMENTS),
        InterviewPhase.REQUIREMENTS to setOf(InterviewPhase.HIGH_LEVEL_DESIGN),
        InterviewPhase.HIGH_LEVEL_DESIGN to setOf(InterviewPhase.DEEP_DIVE),
        InterviewPhase.DEEP_DIVE to setOf(InterviewPhase.WRAP_UP, InterviewPhase.HIGH_LEVEL_DESIGN),
        InterviewPhase.WRAP_UP to emptySet(),
    )

    init {
        phaseStartTimes[currentPhase] = System.currentTimeMillis()
    }

    fun transitionTo(phase: InterviewPhase): Boolean {
        val allowed = validTransitions[currentPhase] ?: emptySet()
        if (phase !in allowed) return false

        val now = System.currentTimeMillis()
        phaseDurations[currentPhase] = now - (phaseStartTimes[currentPhase] ?: now)
        currentPhase = phase
        phaseStartTimes[phase] = now
        return true
    }

    fun getCurrentPhase(): InterviewPhase = currentPhase

    fun getTimeInPhase(phase: InterviewPhase): Long {
        return phaseDurations[phase] ?: 0L
    }

    fun getSummary(): Map<InterviewPhase, Long> {
        // Include current phase duration
        val now = System.currentTimeMillis()
        val currentDuration = now - (phaseStartTimes[currentPhase] ?: now)
        return phaseDurations + (currentPhase to currentDuration)
    }
}
```

This state machine enforces valid interview phase transitions while tracking time spent in each phase. The `DEEP_DIVE` can transition back to `HIGH_LEVEL_DESIGN` to model situations where you need to revisit the architecture during the deep dive. The summary helps analyze time distribution after the interview.

---

## Module 2: Thinking in Systems

### Lesson 2.1: Mobile vs Backend System Design

Mobile system design differs from backend design in fundamental ways that most developers underestimate. On the backend, you assume reliable networks, near-unlimited compute, and horizontal scaling. On mobile, you're dealing with unreliable networks that drop mid-request, devices with limited memory that the OS can kill your process on, batteries that drain faster with every wake lock, and storage that users might fill with photos. These constraints aren't edge cases — they're the normal operating environment for a mobile app.

The mental model shift is critical. Backend engineers think in terms of request-response cycles and stateless services. Mobile engineers think in terms of state persistence and user experience continuity. When a backend service loses connection to a database, it returns a 500 error and the load balancer routes the next request elsewhere. When a mobile app loses connection, the user is still staring at the screen expecting things to work. You can't return a 500 to a person's face. The app must degrade gracefully — showing cached data, queuing writes, and recovering automatically when connectivity returns.

The other major difference is the update cycle. Backend services deploy in minutes. Mobile apps go through app store review, and even after release, users might not update for weeks. This means your API contracts must be backward compatible, your database migrations must handle skipped versions, and your feature flags must account for old clients. You're not designing for one version — you're designing for every version that's ever been released and might still be in the wild.

Resource constraints also shape architectural decisions differently. On mobile, every byte of memory matters because the OS ranks apps by memory usage and kills the heaviest ones first when memory pressure hits. Every network call consumes battery — not just for data transfer, but for the radio state transition from idle to active, which on cellular networks can add 100-300ms of latency plus significant power draw. Every database operation blocks the calling thread unless you explicitly move it off-main, and even on IO threads, heavy queries during garbage collection can cause UI jank through stop-the-world pauses.

**Key takeaway:** Mobile system design is fundamentally about designing for unreliable conditions — unreliable networks, limited resources, and users who expect instant responses regardless of circumstances. Embrace constraints instead of fighting them.

### Lesson 2.2: The Architecture Decision Framework

Before building any feature, you need a systematic approach to making architecture decisions. Without a framework, engineers make ad-hoc choices that seem reasonable in isolation but create an inconsistent, hard-to-maintain system over time. The Architecture Decision Framework forces you to think through five dimensions before writing a single line of code: data flow, offline behavior, consistency requirements, scale considerations, and error handling strategy.

Data flow is always the first question: Where does data come from? Where does it go? How often does it change? A user profile changes rarely — cache it aggressively. A stock ticker changes every second — cache it briefly or not at all. A chat message is created once and never modified — append-only storage patterns apply. Understanding the data's lifecycle drives every subsequent decision about caching, persistence, and synchronization.

Offline behavior is the second question: What happens with no network? Partial network? This isn't just about showing a toast that says "No internet connection." It's about defining which features work offline (reading cached messages), which degrade gracefully (showing stale feed data with a timestamp), and which genuinely require connectivity (sending a payment). For each feature, explicitly decide the offline strategy — full offline support, read-only offline, or online-only — and document it.

Consistency requirements determine your sync strategy: How stale can data be? A social media feed can be 5 minutes old without anyone noticing. An e-commerce inventory count that's 5 minutes old might show items that are already sold out, leading to a frustrating checkout failure. A banking balance must be accurate to the latest transaction. These consistency requirements directly map to your cache TTL, sync frequency, and whether you need real-time push updates.

Scale and error handling round out the framework. Scale means asking: how many items does this list have? Ten items can be loaded in one API call. Ten thousand items need pagination. A million items need pagination plus search plus local indexing. Error handling means asking: what can fail, how do you detect it, how do you recover, and what does the user see? Every network call can timeout. Every database write can fail if storage is full. Every JSON response can be malformed. Design for these failures upfront, not as afterthoughts.

```kotlin
// Architecture Decision Record for a feature
data class ArchitectureDecision(
    val feature: String,
    val dataFlow: DataFlowType,
    val offlineStrategy: OfflineStrategy,
    val consistencyRequirement: ConsistencyLevel,
    val expectedScale: ScaleLevel,
    val errorRecovery: ErrorRecoveryStrategy,
)

enum class DataFlowType { READ_HEAVY, WRITE_HEAVY, REAL_TIME, BATCH }
enum class OfflineStrategy { FULL_OFFLINE, READ_ONLY_OFFLINE, ONLINE_ONLY }
enum class ConsistencyLevel { EVENTUAL, NEAR_REAL_TIME, STRONG }
enum class ScaleLevel { SMALL, MEDIUM, LARGE, UNBOUNDED }
enum class ErrorRecoveryStrategy { RETRY, FALLBACK, FAIL_FAST, QUEUE }
```

**Key takeaway:** System design is about making intentional tradeoffs across five dimensions — data flow, offline behavior, consistency, scale, and error handling. Every decision has a cost. The goal is to pick the right tradeoffs for your specific app and users.

### Lesson 2.3: Data Flow Patterns

Understanding data flow patterns is the foundation of mobile architecture. Every feature in your app follows one of a few fundamental patterns, and recognizing which pattern applies determines your entire implementation approach. The four primary patterns are: read-through cache, write-behind queue, event-driven stream, and request-response.

The read-through cache pattern is the most common in mobile apps. The UI requests data, the repository checks the in-memory cache first, then the local database, and finally the network. Data flows downward through these layers on read, and upward on refresh. This pattern works for any data that's read frequently and updated infrequently — user profiles, product catalogs, settings. The key implementation detail is cache promotion: when you find data in a lower layer (database), promote it to the faster layer (memory) so subsequent reads are instant.

The write-behind queue pattern handles offline writes. When the user performs an action (send a message, update a profile, add to cart), the write is immediately applied to the local database for instant UI feedback, then queued for server sync. When connectivity is available, a background process drains the queue in order. This pattern requires careful thought about conflict resolution — what happens when the same entity is modified both locally and remotely before the queue drains?

Event-driven streams handle real-time data — chat messages, live scores, collaborative editing. Data flows from the server through a persistent connection (WebSocket or SSE) into the local database, which triggers UI updates through reactive observers. The pattern is inherently push-based: the server pushes events as they happen rather than the client polling for changes. The complexity here is connection lifecycle management — establishing connections, handling disconnects, buffering events during reconnection, and deduplicating events that might arrive through both the stream and a catch-up API call.

```kotlin
// Read-through cache pattern
fun getData(id: String): Flow<Resource<Data>> = flow {
    // Memory → Disk → Network, with cache promotion
    emit(Resource.Loading)
    memoryCache.get(id)?.let { emit(Resource.Success(it, Source.MEMORY)); return@flow }
    dao.getById(id)?.let {
        memoryCache.put(id, it)
        emit(Resource.Success(it, Source.DISK))
    }
    try {
        val fresh = api.get(id)
        dao.upsert(fresh)
        memoryCache.put(id, fresh)
        emit(Resource.Success(fresh, Source.NETWORK))
    } catch (e: IOException) {
        emit(Resource.Error(e))
    }
}

// Write-behind queue pattern
suspend fun updateData(id: String, update: DataUpdate) {
    val updated = dao.getById(id).applyUpdate(update)
    dao.upsert(updated) // Instant local update
    writeQueue.enqueue(PendingWrite(id, update)) // Queue for server sync
}
```

**Key takeaway:** Every feature maps to a data flow pattern — read-through cache, write-behind queue, event-driven stream, or request-response. Identifying the right pattern early prevents architectural mismatches that are expensive to fix later.

### Lesson 2.4: State Management with Unidirectional Data Flow

State management is where mobile apps either feel snappy and reliable or buggy and unpredictable. The root cause of most UI bugs isn't bad logic — it's inconsistent state. When you have a loading flag in one LiveData, an error message in another, and data in a third, you can end up in impossible states: loading is true, error is non-null, and data is stale, all at the same time. The UI tries to render all three signals simultaneously and produces a confusing result.

Unidirectional data flow solves this by funneling all state changes through a single pipeline. The UI emits intents (user actions), the ViewModel processes them through a reducer function, and a single immutable state object drives the UI. The state object is the single source of truth for the screen — not the database, not the API, but the state object that combines data from all sources into one coherent picture. When the state changes, the entire UI recomposes to reflect the new state. There's no possibility of inconsistency because there's only one object to read from.

The reducer pattern makes state transitions explicit and testable. Each intent maps to a state transformation — `LoadMore` transitions from the current state to a state with `isLoadingMore = true`, and when data arrives, it transitions to a state with the new items appended and `isLoadingMore = false`. Side effects (API calls, database writes) are triggered by the reducer but don't directly modify state — they emit new intents that flow back through the reducer. This separation makes every state transition traceable and every side effect auditable.

```kotlin
class FeedViewModel(
    private val repository: FeedRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedState())
    val state: StateFlow<FeedState> = _state.asStateFlow()

    fun handleIntent(intent: FeedIntent) {
        when (intent) {
            is FeedIntent.LoadInitial -> loadInitial()
            is FeedIntent.LoadMore -> loadMore()
            is FeedIntent.Refresh -> refresh()
            is FeedIntent.LikePost -> likePost(intent.postId)
        }
    }

    private fun loadInitial() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getFeed()
                .catch { e -> _state.update { it.copy(isLoading = false, error = e.message) } }
                .collect { posts ->
                    _state.update { it.copy(
                        isLoading = false,
                        posts = posts,
                        hasMore = posts.size >= PAGE_SIZE,
                    )}
                }
        }
    }

    private fun likePost(postId: String) {
        // Optimistic update — change state immediately
        _state.update { state ->
            state.copy(posts = state.posts.map { post ->
                if (post.id == postId) post.copy(isLiked = true, likeCount = post.likeCount + 1)
                else post
            })
        }
        // Fire-and-forget network call, rollback on failure
        viewModelScope.launch {
            try {
                repository.likePost(postId)
            } catch (e: Exception) {
                _state.update { state ->
                    state.copy(posts = state.posts.map { post ->
                        if (post.id == postId) post.copy(isLiked = false, likeCount = post.likeCount - 1)
                        else post
                    })
                }
            }
        }
    }
}

data class FeedState(
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val hasMore: Boolean = true,
)

sealed interface FeedIntent {
    data object LoadInitial : FeedIntent
    data object LoadMore : FeedIntent
    data object Refresh : FeedIntent
    data class LikePost(val postId: String) : FeedIntent
}
```

**Key takeaway:** Use a single state object per screen to eliminate impossible states. The UI emits intents, the ViewModel reduces them into state transitions, and side effects flow back as new intents. This makes every state change explicit, testable, and traceable.

### Lesson 2.5: Modeling Screen States for Offline-First

Every screen in an offline-first app needs to communicate more than just "loading" or "loaded." It needs to tell the user whether the data is fresh or stale, whether the app is currently connected or offline, and whether pending writes are waiting to sync. A well-designed screen state hierarchy encodes all of this information into the type system, making it impossible for the UI to show contradictory information.

The trick is composing granular state signals rather than creating an explosion of sealed class variants. Instead of `LoadingFromNetwork`, `LoadingFromCache`, `LoadedFresh`, `LoadedStale`, `OfflineWithCache`, `OfflineWithoutCache`, `ErrorWithCache`, `ErrorWithoutCache` — which gives you eight states and counting — model the data state separately from the connectivity state and the sync state. The UI combines these signals to render the appropriate visual: a stale data banner, an offline indicator, a sync progress bar.

```kotlin
sealed class ScreenState<out T> {
    data object Loading : ScreenState<Nothing>()

    data class Success<T>(
        val data: T,
        val isFromCache: Boolean = false,
        val lastRefreshed: Long = System.currentTimeMillis(),
    ) : ScreenState<T>()

    data class Error(
        val exception: Throwable,
        val cachedData: Any? = null,
    ) : ScreenState<Nothing>()

    data class Offline<T>(
        val staleData: T,
        val lastUpdated: Long,
    ) : ScreenState<T>()
}

data class ConnectivityState(
    val isConnected: Boolean,
    val connectionType: ConnectionType,
)

enum class ConnectionType { WIFI, CELLULAR, NONE }

data class SyncState(
    val pendingWrites: Int = 0,
    val isSyncing: Boolean = false,
    val lastSyncError: String? = null,
)

// Compose the signals in the UI
data class ScreenCompositeState<T>(
    val screenState: ScreenState<T>,
    val connectivity: ConnectivityState,
    val sync: SyncState,
) {
    val shouldShowStaleIndicator: Boolean
        get() = screenState is ScreenState.Success && screenState.isFromCache

    val shouldShowOfflineBanner: Boolean
        get() = !connectivity.isConnected

    val shouldShowSyncProgress: Boolean
        get() = sync.isSyncing || sync.pendingWrites > 0
}
```

This compositional approach scales better than a flat sealed class hierarchy. When you need to add a new signal (say, background refresh progress), you add a field to the composite state rather than doubling the number of sealed class variants. The UI code reads naturally: `if (state.shouldShowStaleIndicator) StaleDataBanner()` — no complex pattern matching required.

**Key takeaway:** Compose screen state from independent signals (data state, connectivity state, sync state) rather than creating a combinatorial explosion of sealed class variants. This approach is more flexible, more readable, and scales as new signals are added.

### Quiz: Thinking in Systems

#### In mobile system design, why is the local database preferred as the single source of truth over the remote API?

- ❌ The local database always has the most up-to-date data
- ❌ Remote APIs are slower to implement than local databases
- ✅ The local database is available offline and provides instant reads, while the API may be unavailable
- ❌ Local databases use less storage than remote servers

> **Explanation:** The local database is preferred because it's always accessible regardless of network state and provides instant reads. The remote API supplements it by pushing fresh data into the database when available.

#### Which of the following is NOT a key difference between mobile and backend system design?

- ❌ Unreliable network connectivity
- ❌ Limited device resources like memory and battery
- ✅ The need to use relational databases instead of NoSQL
- ❌ Managing multiple sources of truth (local DB, remote API, in-memory cache)

> **Explanation:** The choice between relational and NoSQL databases is not a distinguishing factor between mobile and backend design. The real differences are unreliable networks, resource constraints, and managing multiple data sources.

#### When designing a new feature, what should you consider FIRST according to the Architecture Decision Framework?

- ✅ Where does data come from, where does it go, and how often does it change
- ❌ Which UI framework to use for the screens
- ❌ How to structure the CI/CD pipeline
- ❌ Which third-party analytics SDK to integrate

> **Explanation:** Data flow is the first question in the Architecture Decision Framework because every architectural decision flows from understanding your data — its source, destination, and change frequency.

#### Why does the compositional approach to screen state scale better than a flat sealed class hierarchy?

- ❌ Because sealed classes have a maximum number of variants in Kotlin
- ✅ Because adding a new signal is a single field addition instead of doubling the variant count
- ❌ Because flat hierarchies are harder for the Kotlin compiler to optimize
- ❌ Because composition uses less memory than sealed classes

> **Explanation:** With a flat hierarchy, every new signal dimension multiplies the total variant count (Loading, LoadingOffline, LoadingWithSync, LoadingOfflineWithSync...). Composition keeps signals independent — adding connectivity tracking is one field, not N new variants.

### Coding Challenge: Architecture Decision Document

Write a Kotlin sealed class hierarchy that models the different states a screen can be in when loading data from a repository that supports offline-first architecture. The states should cover loading, success with data, error with optional cached data, and offline with stale data. Also include a composite state that combines screen state with connectivity and sync information.

#### Solution

```kotlin
sealed class ScreenState<out T> {
    data object Loading : ScreenState<Nothing>()

    data class Success<T>(
        val data: T,
        val isFromCache: Boolean = false,
    ) : ScreenState<T>()

    data class Error(
        val exception: Throwable,
        val cachedData: Any? = null,
    ) : ScreenState<Nothing>()

    data class Offline<T>(
        val staleData: T,
        val lastUpdated: Long,
    ) : ScreenState<T>()
}

data class CompositeUiState<T>(
    val screen: ScreenState<T>,
    val isConnected: Boolean = true,
    val pendingSyncCount: Int = 0,
) {
    val hasData: Boolean
        get() = when (screen) {
            is ScreenState.Success -> true
            is ScreenState.Offline -> true
            is ScreenState.Error -> screen.cachedData != null
            is ScreenState.Loading -> false
        }

    val showOfflineBanner: Boolean
        get() = !isConnected && hasData

    val showSyncBadge: Boolean
        get() = pendingSyncCount > 0
}
```

This sealed class covers all the states a screen needs in an offline-first architecture: initial loading, success (distinguishing fresh vs cached), error (with optional fallback data), and offline mode showing stale data with a timestamp. The composite state layers connectivity and sync awareness on top, giving the UI everything it needs to render an accurate, informative screen.

---

## Module 3: Offline-First Architecture

### Lesson 3.1: The Single Source of Truth Pattern

The Single Source of Truth (SSOT) pattern is the cornerstone of offline-first mobile architecture. The principle is simple: the local database is the only place the UI reads from. The network is just a sync mechanism that pushes fresh data into the database. When the database changes, reactive observers (Room's Flow support) automatically update the UI. This eliminates an entire class of bugs where the UI shows stale data from one source while fresher data exists in another.

Without SSOT, you end up in situations where the in-memory cache shows one version of a user profile, the database has another, and the last API response returned a third. The UI might read from any of these depending on timing, screen rotation, or process death recovery. The fix isn't to add synchronization logic between all three sources — it's to eliminate the ambiguity entirely. All reads come from Room. All writes go to Room. The network exists only to keep Room up to date.

The implementation pattern is a repository that exposes Flow-based reads from the database and suspend functions for network refresh. The `getUserStream` method below demonstrates the pattern: emit cached data immediately (so the user sees something instantly), trigger a background refresh from the network, and let Room's reactive queries push the updated data to the UI when it arrives. If the network refresh fails and cached data exists, the user sees stale data instead of an error — a much better experience.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    // Database is the single source of truth — UI observes this
    fun observeUser(id: String): Flow<User> = dao.observeById(id)
        .map { it.toDomain() }

    // Network refreshes update the database, which triggers UI updates
    suspend fun refreshUser(id: String) = withContext(ioDispatcher) {
        val networkUser = api.getUser(id)
        dao.upsert(networkUser.toEntity())
    }

    // Combined: emit cached data immediately, then refresh in background
    fun getUserStream(id: String): Flow<Resource<User>> = flow {
        emit(Resource.Loading)

        // Emit cached data if available — instant UI response
        val cached = dao.getById(id)
        if (cached != null) {
            emit(Resource.Success(cached.toDomain(), isFromCache = true))
        }

        // Refresh from network
        try {
            refreshUser(id)
        } catch (e: IOException) {
            if (cached == null) emit(Resource.Error(e))
            // If cached data exists, silently fail — user sees stale data
        }

        // Emit fresh data from database reactively
        emitAll(dao.observeById(id).map { Resource.Success(it.toDomain()) })
    }.flowOn(ioDispatcher)
}
```

The key detail that makes this work is Room's invalidation tracking. When you call `dao.upsert()`, Room knows which tables changed and re-executes any active Flow queries on those tables. This means the `observeById` Flow in the last line will automatically emit the freshly written data without any explicit notification. The database change is the notification.

**Key takeaway:** Make the local database the only data source the UI reads from. The network exists solely to keep the database fresh. This eliminates data inconsistency bugs and makes offline support automatic.

### Lesson 3.2: The NetworkBoundResource Pattern

The `getUserStream` pattern from the previous lesson works, but it's duplicated across every repository method that needs offline-first behavior. The NetworkBoundResource abstraction extracts this pattern into a reusable flow builder. You provide three functions: how to load from the database, how to fetch from the network, and how to save network results to the database. The abstraction handles the orchestration — cache-first reads, background refresh, error fallback.

This pattern originated from Google's Android architecture samples and has become a standard approach. The key design decision is whether `shouldFetch` returns true or false — this controls when the app makes a network call versus serving purely from cache. You can base this decision on time (data is older than 5 minutes), content (a special "needs refresh" flag), or user action (pull-to-refresh always fetches). The flexibility of this hook is what makes the pattern work across different staleness requirements.

```kotlin
inline fun <ResultType, RequestType> networkBoundResource(
    crossinline query: () -> Flow<ResultType>,
    crossinline fetch: suspend () -> RequestType,
    crossinline saveFetchResult: suspend (RequestType) -> Unit,
    crossinline shouldFetch: (ResultType?) -> Boolean = { true },
    crossinline onFetchFailed: (Throwable) -> Unit = {},
): Flow<Resource<ResultType>> = flow {
    emit(Resource.Loading)

    val data = query().first()

    val flow = if (shouldFetch(data)) {
        emit(Resource.Loading)
        try {
            val fetchedData = fetch()
            saveFetchResult(fetchedData)
            query().map { Resource.Success(it) }
        } catch (throwable: Throwable) {
            onFetchFailed(throwable)
            query().map { Resource.Success(it, isStale = true) }
        }
    } else {
        query().map { Resource.Success(it) }
    }

    emitAll(flow)
}

// Usage — clean, declarative
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val cachePolicy: CachePolicy,
) {
    fun getArticle(id: String) = networkBoundResource(
        query = { dao.observeById(id).map { it?.toDomain() } },
        fetch = { api.getArticle(id) },
        saveFetchResult = { dao.upsert(it.toEntity()) },
        shouldFetch = { cachePolicy.isExpired(dao.getLastFetchTime(id)) },
    )
}
```

The `networkBoundResource` function encapsulates the core offline-first flow: read from cache, decide whether to fetch, fetch and save, then re-read from cache. Each repository method becomes a simple declaration of what to read, what to fetch, and where to save — the timing and error handling are standardized. This consistency across the codebase makes behavior predictable and bugs easier to find.

**Key takeaway:** Extract the offline-first flow into a reusable `networkBoundResource` abstraction. Each repository method declares what to read, fetch, and save — the orchestration logic is centralized and consistent.

### Lesson 3.3: Offline Write Queue

Reading cached data offline is the easy part. The hard part is handling writes when there's no network. The user taps "send message" or "add to cart" or "update profile" — you need to apply the change locally for instant UI feedback and queue it for server sync when connectivity returns. The offline write queue pattern solves this by persisting pending writes to a Room table and processing them in order when the network becomes available.

The queue itself is a Room entity with the write operation type, the serialized payload, a status field (pending, in-progress, completed, failed), a retry count, and timestamps. Persisting to Room instead of an in-memory list is critical — if the user kills the app or the OS kills the process, the pending writes survive. When the app restarts and connectivity is available, the queue resumes processing from where it left off.

Processing the queue requires careful ordering. Writes must be applied in the order they were created — if the user updated their profile name and then updated their avatar, the name change must reach the server before the avatar change. Out-of-order processing can create inconsistencies. Each write is processed atomically: attempt the API call, and if it succeeds, mark the write as completed and remove it from the queue. If it fails with a retryable error (timeout, 5xx), increment the retry count and leave it in the queue. If it fails with a permanent error (4xx, validation failure), mark it as failed and notify the user.

```kotlin
@Entity(tableName = "pending_writes")
data class PendingWriteEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val operationType: String,
    val payload: String,
    val status: String = "PENDING",
    val retryCount: Int = 0,
    val maxRetries: Int = 3,
    val createdAt: Long = System.currentTimeMillis(),
    val lastAttemptAt: Long? = null,
    val errorMessage: String? = null,
)

class OfflineWriteQueue(
    private val writeDao: PendingWriteDao,
    private val api: SyncApi,
    private val connectivityMonitor: ConnectivityMonitor,
) {
    suspend fun enqueue(operation: WriteOperation) {
        writeDao.insert(operation.toEntity())
    }

    // Process queue when network is available
    fun startProcessing(): Flow<SyncStatus> = connectivityMonitor.isConnected
        .filter { it }
        .flatMapLatest { processQueue() }

    private fun processQueue(): Flow<SyncStatus> = flow {
        val pendingWrites = writeDao.getAllPending()
        if (pendingWrites.isEmpty()) {
            emit(SyncStatus.Idle)
            return@flow
        }

        emit(SyncStatus.Syncing(pendingWrites.size))

        pendingWrites.forEach { write ->
            try {
                writeDao.updateStatus(write.id, "IN_PROGRESS")
                executeWrite(write)
                writeDao.delete(write.id)
                emit(SyncStatus.Progress(write.id))
            } catch (e: HttpException) {
                if (e.code() in 400..499) {
                    // Permanent failure — don't retry
                    writeDao.markFailed(write.id, "HTTP ${e.code()}: ${e.message()}")
                    emit(SyncStatus.PermanentFailure(write, e))
                } else {
                    handleRetry(write, e)
                }
            } catch (e: IOException) {
                handleRetry(write, e)
                return@flow // Stop processing — network is likely down
            }
        }
        emit(SyncStatus.Complete)
    }

    private suspend fun handleRetry(write: PendingWriteEntity, error: Exception) {
        val updated = write.copy(
            retryCount = write.retryCount + 1,
            lastAttemptAt = System.currentTimeMillis(),
            status = if (write.retryCount + 1 >= write.maxRetries) "DEAD_LETTER" else "PENDING",
            errorMessage = error.message,
        )
        writeDao.update(updated)
    }
}
```

**Key takeaway:** Persist pending writes to Room so they survive process death. Process writes in order with atomic success/failure handling. Distinguish between retryable errors (5xx, timeout) and permanent failures (4xx) to avoid infinite retry loops.

### Lesson 3.4: Connectivity Monitoring

Reliable connectivity monitoring is the nervous system of an offline-first app. You need to know not just whether the device has a network connection, but whether that connection can actually reach your servers. A device connected to a WiFi captive portal technically has connectivity but can't reach your API. A device on a cellular network might have a connection that's too slow to be useful. Your connectivity monitor should distinguish between these states and expose them as a reactive Flow that the rest of the app can observe.

Android's `ConnectivityManager` provides the raw signals via `NetworkCallback`. The callback fires when networks are gained, lost, or their capabilities change. You register for updates and translate the callbacks into a `StateFlow<ConnectivityState>` that any component can collect. The key implementation detail is using `registerDefaultNetworkCallback` (API 24+) rather than registering for specific network types, which gives you the system's currently preferred network.

For a more robust check, complement the system connectivity state with an active server reachability probe. A lightweight HEAD request to your health check endpoint every 30 seconds (only when the system reports connectivity) catches cases where the network is connected but your server is unreachable. This probe should be lightweight — no body, short timeout, no retry — and should run on a background dispatcher to avoid blocking anything.

```kotlin
class ConnectivityMonitor(context: Context) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _state = MutableStateFlow(getCurrentState())
    val state: StateFlow<ConnectivityState> = _state.asStateFlow()

    val isConnected: Flow<Boolean> = state.map { it.isConnected }.distinctUntilChanged()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            updateState()
        }

        override fun onLost(network: Network) {
            updateState()
        }

        override fun onCapabilitiesChanged(
            network: Network,
            capabilities: NetworkCapabilities,
        ) {
            updateState()
        }
    }

    init {
        connectivityManager.registerDefaultNetworkCallback(networkCallback)
    }

    private fun updateState() {
        _state.value = getCurrentState()
    }

    private fun getCurrentState(): ConnectivityState {
        val network = connectivityManager.activeNetwork
        val capabilities = network?.let { connectivityManager.getNetworkCapabilities(it) }

        return ConnectivityState(
            isConnected = capabilities?.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_INTERNET
            ) == true,
            connectionType = when {
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true ->
                    ConnectionType.WIFI
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true ->
                    ConnectionType.CELLULAR
                else -> ConnectionType.NONE
            },
            isMetered = capabilities?.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_NOT_METERED
            ) != true,
        )
    }

    fun cleanup() {
        connectivityManager.unregisterNetworkCallback(networkCallback)
    }
}

data class ConnectivityState(
    val isConnected: Boolean,
    val connectionType: ConnectionType,
    val isMetered: Boolean = false,
)
```

**Key takeaway:** Use `ConnectivityManager.NetworkCallback` for reactive connectivity monitoring. Expose state as a `StateFlow` that the rest of the app can observe. Consider supplementing system connectivity with active server reachability probes for robustness.

### Lesson 3.5: Optimistic Updates and Rollback

Optimistic updates are the secret to making offline-first apps feel instant. Instead of waiting for the server to confirm an action before updating the UI, you apply the change locally immediately and assume it will succeed. If the server confirms, great — the local data matches the server. If the server rejects the change, you roll back the local state and notify the user. This pattern is used everywhere: liking a post, sending a message, toggling a setting, adding to a cart.

The implementation has three steps: save the original state (for potential rollback), apply the optimistic update to the local database, and then attempt the server call. If the server succeeds, update the local state with the server-confirmed version (which might include server-generated fields like timestamps or IDs). If the server fails, restore the original state. The user sees a brief flicker — the change appears, then reverts — which clearly communicates that the action didn't succeed.

The critical detail is saving the original state before the optimistic update. If you don't, you can't roll back. For simple fields like a boolean toggle, rolling back is trivial. For complex operations like reordering a list or applying a batch update, you need to snapshot the entire affected state before the optimistic change. Room transactions make this atomic — the rollback either fully restores the original state or doesn't happen at all.

```kotlin
class OptimisticExecutor<T>(
    private val localStore: LocalStore<T>,
) {
    interface LocalStore<T> {
        suspend fun get(id: String): T?
        suspend fun save(id: String, data: T)
    }

    suspend fun execute(
        id: String,
        optimisticUpdate: (T) -> T,
        networkCall: suspend (T) -> T,
    ): Result<T> {
        val original = localStore.get(id)
            ?: return Result.failure(IllegalStateException("Item $id not found"))

        // Step 1: Apply optimistic update locally — UI sees change instantly
        val optimistic = optimisticUpdate(original)
        localStore.save(id, optimistic)

        // Step 2: Attempt network call
        return try {
            val serverResult = networkCall(optimistic)
            // Step 3a: Update with server-confirmed data
            localStore.save(id, serverResult)
            Result.success(serverResult)
        } catch (e: Exception) {
            // Step 3b: Rollback to original on failure
            localStore.save(id, original)
            Result.failure(e)
        }
    }
}

// Usage: Like button with instant feedback
suspend fun likePost(postId: String) {
    optimisticExecutor.execute(
        id = postId,
        optimisticUpdate = { post -> post.copy(isLiked = true, likeCount = post.likeCount + 1) },
        networkCall = { post -> api.likePost(post.id) },
    )
}
```

**Key takeaway:** Optimistic updates make apps feel instant by applying changes locally before the server roundtrip. Always save the original state before the optimistic change so you can roll back if the server rejects it.

### Quiz: Offline-First Architecture

#### What is the primary benefit of the Single Source of Truth pattern in mobile apps?

- ❌ It eliminates the need for a network layer entirely
- ✅ It prevents inconsistent UI states by having one authoritative data source
- ❌ It makes the app faster by avoiding database operations
- ❌ It removes the need for error handling in the repository

> **Explanation:** The Single Source of Truth pattern ensures the UI always reads from one place (the local database), preventing inconsistencies that arise when the UI reads from multiple sources (API, cache, database) that may have different data.

#### In the Offline Write Queue pattern, what happens when a write operation fails during sync?

- ❌ The local data is rolled back to its previous state
- ❌ The write is discarded and the user is notified
- ✅ The write is marked as failed in the queue and can be retried later
- ❌ The entire sync queue is cleared and restarted

> **Explanation:** Failed writes are marked as failed with an error message, not discarded. This preserves the user's intent and allows retry — either automatic or manual — when conditions improve.

#### Why does the `getUserStream` method emit cached data before attempting a network refresh?

- ❌ Because cached data is always more accurate than network data
- ✅ To show the user data instantly while fresher data loads in the background
- ❌ Because the network call might return the same data
- ❌ To reduce the number of database queries

> **Explanation:** Emitting cached data first provides instant UI response. The user sees something immediately rather than a loading spinner, and the data silently updates when the network response arrives — this is the core of offline-first UX.

#### Why should pending writes be persisted to Room instead of an in-memory list?

- ❌ Because Room is faster than an in-memory list for write operations
- ✅ Because writes must survive process death and app restarts to prevent data loss
- ❌ Because Room automatically retries failed writes
- ❌ Because in-memory lists cannot be accessed from background workers

> **Explanation:** If pending writes are only in memory and the user kills the app or the OS kills the process, those writes are lost forever. Persisting to Room ensures that when the app restarts, the queue resumes processing from where it left off — no user action is silently discarded.

### Coding Challenge: Retry-Aware Write Queue

Implement a `RetryableWriteQueue` that tracks retry attempts for each operation and gives up after a maximum number of retries, moving failed operations to a dead-letter list.

#### Solution

```kotlin
data class WriteOperation(
    val id: String = UUID.randomUUID().toString(),
    val payload: String,
    val retryCount: Int = 0,
    val maxRetries: Int = 3,
)

class RetryableWriteQueue {
    private val pending = mutableListOf<WriteOperation>()
    private val deadLetter = mutableListOf<WriteOperation>()

    fun enqueue(operation: WriteOperation) {
        pending.add(operation)
    }

    suspend fun processAll(execute: suspend (WriteOperation) -> Unit) {
        val snapshot = pending.toList()
        pending.clear()

        snapshot.forEach { op ->
            try {
                execute(op)
            } catch (e: Exception) {
                val updated = op.copy(retryCount = op.retryCount + 1)
                if (updated.retryCount >= updated.maxRetries) {
                    deadLetter.add(updated)
                } else {
                    pending.add(updated)
                }
            }
        }
    }

    fun getDeadLetterOperations(): List<WriteOperation> = deadLetter.toList()
    fun getPendingCount(): Int = pending.size
    fun getDeadLetterCount(): Int = deadLetter.size

    fun retryDeadLetter(id: String) {
        val op = deadLetter.find { it.id == id } ?: return
        deadLetter.remove(op)
        pending.add(op.copy(retryCount = 0))
    }
}
```

This queue tracks retry counts per operation and moves permanently failed operations to a dead-letter list after exceeding the max retry limit, preventing infinite retry loops while preserving failed operations for debugging or manual resolution. The `retryDeadLetter` method allows manual re-processing of dead-lettered operations.

---

## Module 4: Caching Strategies

### Lesson 4.1: The Three Cache Layers

Mobile apps have three natural cache layers, each with different speed, persistence, and capacity characteristics. The in-memory cache (LruCache or ConcurrentHashMap) provides sub-millisecond reads but is lost on process death and limited by heap size. The disk cache (Room database) provides 1-5ms reads, survives process death, and is limited only by device storage. The network layer is the slowest (100ms-5s depending on connectivity) but always has the freshest data. A well-designed app cascades through these layers on read and populates them on write.

The cascade pattern works like this: on a read request, check the memory cache first. If it's a hit, return immediately — no disk I/O, no network call. If it's a miss, check the disk cache. If the disk has the data, return it and promote it to the memory cache so subsequent reads are instant. If the disk misses too, fetch from the network, write to both the disk and memory cache, and return to the caller. This cascade means the first read of any item is slow (network), but every subsequent read is fast (memory or disk), even across process death (disk).

The reverse flow — cache population — is equally important. When fresh data arrives from the network, it must flow through all layers. Write to the disk cache first (for persistence), then update the memory cache (for speed). If you update the memory cache but forget the disk cache, the next process restart will show stale data. If you update the disk cache but forget the memory cache, the current session will keep showing stale data until the cache entry expires or is evicted. Both layers must be updated atomically to maintain consistency.

```kotlin
class CachedUserRepository(
    private val api: UserApi,
    private val dao: UserDao,
) {
    // In-memory cache for hot data
    private val memoryCache = LruCache<String, User>(maxSize = 100)

    suspend fun getUser(id: String): User {
        // Layer 1: Memory cache (sub-millisecond)
        memoryCache.get(id)?.let { return it }

        // Layer 2: Disk cache (1-5ms)
        dao.getById(id)?.let { entity ->
            val user = entity.toDomain()
            memoryCache.put(id, user) // Promote to memory
            return user
        }

        // Layer 3: Network (100ms-5s)
        val networkUser = api.getUser(id)
        dao.upsert(networkUser.toEntity()) // Persist to disk
        memoryCache.put(id, networkUser) // Promote to memory
        return networkUser
    }

    fun invalidate(id: String) {
        memoryCache.remove(id)
        // Disk cache keeps stale data as fallback
    }

    fun invalidateAll() {
        memoryCache.evictAll()
    }
}
```

The memory cache size needs careful tuning. Too small and you get frequent cache misses, defeating the purpose. Too large and you consume heap space that could cause OutOfMemoryErrors or increase GC pressure. A good starting point is to estimate the average size of a cached object, multiply by the number of items a typical user accesses in a session, and use that as your LRU cache size. For user profiles, 100-200 entries is usually plenty. For thumbnail metadata, you might need 500-1000.

**Key takeaway:** A three-layer cache (memory → disk → network) provides instant reads for repeated access. Always populate all layers when fresh data arrives, and promote data to faster layers on cache hits to ensure subsequent reads are as fast as possible.

### Lesson 4.2: Cache Invalidation Strategies

Cache invalidation is famously one of the two hard problems in computer science (the other being naming things and off-by-one errors). The challenge is knowing when cached data is no longer valid. Serve stale data too long and users see outdated information. Invalidate too aggressively and you make unnecessary network calls, wasting bandwidth and battery. Five main strategies exist, each with different tradeoffs.

Time-based expiry (TTL) is the simplest: data is valid for N minutes after it was fetched. When the TTL expires, the next read triggers a network fetch. This works well when you know the expected change frequency. A product catalog that updates hourly can use a 30-minute TTL. A stock ticker needs a 10-second TTL. The downside is that data might change before the TTL expires (serving stale data) or remain unchanged after expiry (wasting a network call).

Event-based invalidation is more precise: cache entries are invalidated when a specific event occurs. The user updates their profile — invalidate the profile cache entry. A push notification arrives indicating new messages — invalidate the message list cache. This approach uses server push (WebSocket, FCM) to tell the client exactly what changed, eliminating both staleness and unnecessary fetches. The downside is implementation complexity and dependency on a push channel.

ETag-based validation is a hybrid: the client sends a conditional request with the cached response's ETag header. The server returns 304 Not Modified if the data hasn't changed (saving bandwidth) or 200 with new data if it has. This eliminates unnecessary data transfer but still requires a network roundtrip to check freshness. OkHttp handles ETags automatically if your server sends the right headers, and it works transparently with OkHttp's built-in disk cache.

```kotlin
class CachePolicy(
    private val maxAgeMs: Long = 5 * 60 * 1000,
) {
    fun isExpired(lastFetchedAt: Long): Boolean {
        return System.currentTimeMillis() - lastFetchedAt > maxAgeMs
    }
}

class ProductRepository(
    private val api: ProductApi,
    private val dao: ProductDao,
    private val cachePolicy: CachePolicy,
) {
    suspend fun getProducts(forceRefresh: Boolean = false): List<Product> {
        val cached = dao.getAll()
        val lastFetched = dao.getLastFetchTimestamp()

        // Return cache if fresh and not force-refreshed
        if (!forceRefresh && cached.isNotEmpty() && !cachePolicy.isExpired(lastFetched)) {
            return cached.map { it.toDomain() }
        }

        // Refresh from network
        return try {
            val fresh = api.getProducts()
            dao.replaceAll(fresh.map { it.toEntity() })
            dao.updateFetchTimestamp(System.currentTimeMillis())
            fresh
        } catch (e: IOException) {
            if (cached.isNotEmpty()) cached.map { it.toDomain() }
            else throw e
        }
    }
}
```

**Key takeaway:** Cache invalidation is a spectrum from simple (time-based TTL) to precise (event-based). Choose the simplest strategy that meets your freshness requirements. Offer pull-to-refresh for user-triggered invalidation. Never show stale data without indicating it might be outdated.

### Lesson 4.3: OkHttp Network Cache

OkHttp includes a built-in HTTP cache that works with standard `Cache-Control` headers. When the server sends `Cache-Control: max-age=3600`, OkHttp stores the response on disk and serves it from cache for the next hour without making a network request. This works transparently — your Retrofit service doesn't need to know about caching at all. The cache respects standard HTTP semantics: `max-age`, `no-cache`, `no-store`, `must-revalidate`, and `ETag`/`If-None-Match` for conditional requests.

This cache layer sits below your application logic and above the wire. It's ideal for resources that rarely change and have proper cache headers — static configuration, images, feature flags, terms of service. It's not a replacement for your Room-based application cache because it doesn't support reactive queries, offline reads without a prior cache hit, or cross-entity relationships. Think of it as a bandwidth optimization layer, not an offline-first strategy.

Configuring the OkHttp cache requires specifying a directory and maximum size. A good default is 10-50MB depending on your app's data profile. The cache uses LRU eviction — when it exceeds the maximum size, the least recently accessed entries are removed. You can also add a cache interceptor that forces cache reads when offline, providing basic offline support for simple GET requests even without Room.

```kotlin
val cacheDir = File(context.cacheDir, "http_cache")
val cacheSize = 50L * 1024 * 1024 // 50 MB

val client = OkHttpClient.Builder()
    .cache(Cache(cacheDir, cacheSize))
    .addInterceptor(OfflineCacheInterceptor(connectivityMonitor))
    .build()

// Force cache when offline
class OfflineCacheInterceptor(
    private val connectivityMonitor: ConnectivityMonitor,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()
        if (!connectivityMonitor.isCurrentlyConnected()) {
            // Force cache — accept stale responses up to 7 days old
            request = request.newBuilder()
                .cacheControl(CacheControl.Builder()
                    .maxStale(7, TimeUnit.DAYS)
                    .build())
                .build()
        }
        return chain.proceed(request)
    }
}
```

**Key takeaway:** OkHttp's built-in cache is a free bandwidth optimization that works with standard HTTP cache headers. Use it for static resources alongside your Room cache, not as a replacement. Add an offline cache interceptor to serve stale responses when the network is unavailable.

### Lesson 4.4: LRU Cache with TTL

The standard Android `LruCache` evicts entries when the cache exceeds a maximum size, but it doesn't support time-based expiry. In practice, you often need both: evict the least recently used entry when the cache is full, and expire entries after a configurable TTL even if the cache has room. Combining LRU with TTL prevents the cache from serving data that was written hours ago but happens to be accessed frequently enough to avoid LRU eviction.

The implementation wraps each cache value in a `CacheEntry` that records the insertion timestamp. On every `get`, the entry's age is checked against the TTL. If expired, the entry is removed and `null` is returned, triggering a cache miss that cascades to the disk or network layer. The `evictExpired` method can be called periodically (e.g., on a timer or lifecycle event) to proactively clean up stale entries rather than waiting for a get to discover them.

Thread safety is essential because the cache might be accessed from multiple coroutines simultaneously. The simple approach is `@Synchronized` on every method. For higher concurrency, use `ConcurrentHashMap` with atomic operations, but be aware that compound operations (check-then-act) still need external synchronization. For most mobile apps, the `@Synchronized` approach is fast enough — contention is rare because UI-driven access patterns are naturally sequential.

```kotlin
class LruCacheWithTtl<K, V>(
    private val maxSize: Int,
    private val ttlMs: Long,
) {
    private data class CacheEntry<V>(
        val value: V,
        val insertedAt: Long = System.currentTimeMillis(),
    )

    private val map = object : LinkedHashMap<K, CacheEntry<V>>(maxSize, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<K, CacheEntry<V>>): Boolean {
            return size > maxSize
        }
    }

    @Synchronized
    fun get(key: K): V? {
        val entry = map[key] ?: return null
        if (System.currentTimeMillis() - entry.insertedAt > ttlMs) {
            map.remove(key)
            return null
        }
        return entry.value
    }

    @Synchronized
    fun put(key: K, value: V) {
        map[key] = CacheEntry(value)
    }

    @Synchronized
    fun remove(key: K) {
        map.remove(key)
    }

    @Synchronized
    fun evictExpired() {
        val now = System.currentTimeMillis()
        val iterator = map.entries.iterator()
        while (iterator.hasNext()) {
            if (now - iterator.next().value.insertedAt > ttlMs) {
                iterator.remove()
            }
        }
    }

    @Synchronized
    fun clear() = map.clear()

    @Synchronized
    fun size(): Int = map.size
}
```

**Key takeaway:** Combine LRU eviction with time-based TTL for a cache that limits both size and staleness. Thread-safe access is essential for coroutine-based apps, and simple `@Synchronized` is sufficient for most mobile cache access patterns.

### Lesson 4.5: Cache Warming and Prefetching

Cache warming is the practice of proactively populating the cache before the user needs the data. Instead of waiting for the user to navigate to a screen and then fetching data (resulting in a loading spinner), you predict what data they'll need and fetch it in advance. This shifts the latency from user-visible to invisible, making the app feel instant.

Common cache warming strategies include: warming on app launch (prefetch the home screen data, user profile, and feature flags), warming on navigation intent (when the user starts scrolling toward a section, prefetch the next page), and warming on push notification (when a notification arrives, prefetch the content it links to so the screen loads instantly when tapped). The key constraint is battery — prefetching too aggressively wastes battery and bandwidth. Only prefetch data the user is likely to need in the next few minutes.

For list-based UIs, Paging 3's `prefetchDistance` parameter handles prefetching automatically — it loads the next page when the user is within N items of the end. For non-paginated data, WorkManager with network constraints handles background prefetching. The `isMetered` flag from the connectivity monitor lets you make smart decisions: on WiFi, prefetch aggressively; on cellular, prefetch only critical data.

```kotlin
class CacheWarmer(
    private val userRepository: UserRepository,
    private val feedRepository: FeedRepository,
    private val settingsRepository: SettingsRepository,
    private val connectivityMonitor: ConnectivityMonitor,
    private val scope: CoroutineScope,
) {
    // Warm essential caches on app launch
    fun warmOnLaunch() {
        scope.launch {
            supervisorScope {
                launch { userRepository.refreshCurrentUser() }
                launch { settingsRepository.refreshSettings() }
                // Only prefetch feed on WiFi
                if (!connectivityMonitor.state.value.isMetered) {
                    launch { feedRepository.refreshFirstPage() }
                }
            }
        }
    }

    // Warm cache when the user is likely to navigate somewhere
    fun warmForNavigation(destination: NavigationDestination) {
        scope.launch {
            when (destination) {
                is NavigationDestination.Profile ->
                    userRepository.refreshUser(destination.userId)
                is NavigationDestination.Chat ->
                    feedRepository.refreshChat(destination.chatId)
                else -> {} // No prefetch needed
            }
        }
    }
}
```

**Key takeaway:** Cache warming shifts latency from user-visible to invisible. Prefetch data the user is likely to need soon, but respect battery constraints — prefetch aggressively on WiFi and conservatively on cellular.

### Quiz: Caching Strategies

#### In a multi-layer cache architecture (memory → disk → network), what happens when data is found in the disk cache?

- ❌ The network is still called to verify freshness
- ✅ The data is returned from disk and also promoted to the memory cache
- ❌ The memory cache is cleared to save resources
- ❌ The disk cache entry is deleted after reading

> **Explanation:** When data is found in the disk layer, it's returned immediately and also placed into the memory cache (cache promotion). This ensures subsequent reads for the same data hit the fastest layer.

#### What is the main risk of using time-based cache expiry?

- ❌ It uses too much memory to store timestamps
- ❌ It requires server-side changes to implement
- ✅ Data might be stale within the TTL window or unnecessarily refetched when unchanged
- ❌ It prevents users from seeing any data while offline

> **Explanation:** Time-based expiry is a tradeoff — within the TTL window, the app may show outdated data, and after expiry it refetches even if the data hasn't changed. More sophisticated strategies like ETags can help but add complexity.

#### Why is OkHttp's network cache NOT a replacement for a Room-based application cache?

- ❌ Because OkHttp's cache is slower than Room
- ✅ Because it doesn't support reactive queries, offline reads without prior cache hits, or cross-entity relationships
- ❌ Because OkHttp's cache is limited to 1MB
- ❌ Because Room has built-in network caching support

> **Explanation:** OkHttp's cache is a transparent HTTP layer that works with cache headers. It can't notify the UI when data changes (reactive queries), serve data that was never fetched (true offline support), or handle relationships between entities. It's a bandwidth optimization, not an offline-first strategy.

### Coding Challenge: Multi-Strategy Cache

Implement a cache that supports multiple invalidation strategies (TTL, event-based, and manual) and can be configured per cache entry.

#### Solution

```kotlin
enum class InvalidationStrategy { TTL, EVENT, MANUAL }

data class CacheConfig(
    val strategy: InvalidationStrategy,
    val ttlMs: Long = 5 * 60 * 1000,
)

class MultiStrategyCache<K, V>(
    private val defaultConfig: CacheConfig = CacheConfig(InvalidationStrategy.TTL),
) {
    private data class Entry<V>(
        val value: V,
        val config: CacheConfig,
        val insertedAt: Long = System.currentTimeMillis(),
        var invalidated: Boolean = false,
    )

    private val cache = ConcurrentHashMap<K, Entry<V>>()

    fun put(key: K, value: V, config: CacheConfig = defaultConfig) {
        cache[key] = Entry(value, config)
    }

    fun get(key: K): V? {
        val entry = cache[key] ?: return null
        return when (entry.config.strategy) {
            InvalidationStrategy.TTL -> {
                if (System.currentTimeMillis() - entry.insertedAt > entry.config.ttlMs) {
                    cache.remove(key)
                    null
                } else entry.value
            }
            InvalidationStrategy.EVENT -> {
                if (entry.invalidated) { cache.remove(key); null }
                else entry.value
            }
            InvalidationStrategy.MANUAL -> entry.value
        }
    }

    fun invalidateByEvent(key: K) {
        cache[key]?.invalidated = true
    }

    fun invalidateManually(key: K) {
        cache.remove(key)
    }

    fun clear() = cache.clear()
}
```

This cache supports per-entry invalidation strategies. TTL entries expire automatically after their configured duration. Event-based entries are invalidated when `invalidateByEvent` is called (triggered by push notifications or WebSocket events). Manual entries persist until explicitly removed. This flexibility lets different data types use the appropriate invalidation strategy.

---

## Module 5: Pagination

### Lesson 5.1: Pagination Strategies — Offset vs Cursor

Before diving into Paging 3 implementation, you need to understand the two fundamental pagination approaches and why cursor-based pagination is almost always the right choice for mobile apps. Offset-based pagination uses page numbers — "give me page 3 with 20 items per page" translates to `LIMIT 20 OFFSET 40`. This is simple to implement but breaks when the underlying data changes. If a new item is inserted while the user is on page 2, every subsequent page shifts by one, causing either a duplicate or a skipped item.

Cursor-based pagination uses a pointer to a specific item — "give me 20 items after item X." This is stable regardless of insertions or deletions between requests. If a new post is added to a feed while the user is scrolling, cursor-based pagination doesn't shift. The cursor (usually the ID or timestamp of the last item on the current page) anchors the query to a fixed point in the dataset. The client sends this cursor with each request, and the server returns the next batch starting from that anchor.

The tradeoff is that cursor-based pagination doesn't support "jump to page N" because you need all prior cursors to calculate page N. For most mobile UIs (infinite scroll feeds, message histories, product listings), this isn't a limitation because users scroll sequentially. For admin dashboards where users might want to jump to page 47, offset-based pagination makes more sense. In interviews, always mention cursor-based pagination for feeds and explain why it's more stable than offset-based.

The server response for cursor-based pagination should include the items, a `nextCursor` field (null if no more pages), and optionally a `hasMore` boolean for clarity. The client stores the last cursor and sends it with the next page request. This contract is simple, stable, and works across REST, GraphQL, and gRPC.

**Key takeaway:** Cursor-based pagination provides stable results even when the dataset changes between requests. Use it for feeds, message lists, and any sequentially scrolled content. Reserve offset-based pagination for random-access use cases like admin dashboards.

### Lesson 5.2: Paging 3 Architecture

Paging 3 is Android's official pagination library, and it's designed around the offline-first principle. The architecture has three layers: `PagingSource` (loads pages from a single data source), `RemoteMediator` (coordinates between the network and local database), and `Pager` (ties everything together and produces `PagingData` for the UI). The most powerful configuration uses all three: the PagingSource reads from Room, the RemoteMediator fetches from the network and writes to Room, and Room's invalidation triggers the PagingSource to re-emit.

The `PagingConfig` object controls the pagination behavior. `pageSize` determines how many items per page. `prefetchDistance` controls how far from the end of the loaded list Paging starts loading the next page — a value of 5 means the next page starts loading when there are 5 items left to scroll through. `enablePlaceholders` controls whether nulls are used as placeholders for unloaded items, enabling the scrollbar to reflect the total list size. `maxSize` limits how many items are held in memory, evicting pages at the other end when exceeded.

The key insight is that PagingData is a self-contained stream of pages that the LazyColumn consumes. You don't manually manage page state, loading indicators, or retry logic — Paging 3 handles all of this through the `LoadState` API. The UI checks `loadState.refresh`, `loadState.append`, and `loadState.prepend` to show loading indicators, error states, and retry buttons at the appropriate positions.

```kotlin
class ArticleRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val database: ArticleDatabase,
) {
    fun getArticles(): Flow<PagingData<Article>> = Pager(
        config = PagingConfig(
            pageSize = 20,
            prefetchDistance = 5,
            enablePlaceholders = false,
            maxSize = 100,
        ),
        remoteMediator = ArticleRemoteMediator(api, dao, database),
        pagingSourceFactory = { dao.pagingSource() }
    ).flow.map { pagingData ->
        pagingData.map { it.toDomain() }
    }
}
```

**Key takeaway:** Paging 3 with RemoteMediator gives you offline-capable pagination. The database is the source of truth for pages. The RemoteMediator fills the database from the network as the user scrolls, and Room's invalidation drives the PagingSource to re-emit.

### Lesson 5.3: RemoteMediator for Offline Pagination

The RemoteMediator is the bridge between your remote API and local database in a Paging 3 setup. It's called when the PagingSource runs out of locally cached data and needs more from the network. The `load` method receives a `LoadType` (REFRESH, PREPEND, or APPEND) and a `PagingState` that provides access to the currently loaded items and configuration. Your job is to fetch the right page from the network and insert it into the database.

The `LoadType` enum drives the entire flow. `REFRESH` is called on initial load and pull-to-refresh — you typically clear the database and fetch page 1. `APPEND` is called when the user scrolls to the bottom and needs the next page. `PREPEND` is called when the user scrolls to the top and needs the previous page — for most top-down feeds, you immediately return `MediatorResult.Success(endOfPaginationReached = true)` because refresh already fetches the newest items.

Remote keys are the mechanism for tracking which page to load next. Since the database is the source of truth, you can't rely on in-memory state for the current page number — it's lost on process death. Instead, store remote keys alongside the data in the database. Each item knows its next page number (or cursor). When `APPEND` is triggered, you look at the last item in the database to determine the next page. This survives process death because it's persisted with the data.

```kotlin
@OptIn(ExperimentalPagingApi::class)
class ArticleRemoteMediator(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val database: ArticleDatabase,
) : RemoteMediator<Int, ArticleEntity>() {

    override suspend fun initialize(): InitializeAction {
        val lastFetch = dao.getLastFetchTimestamp() ?: 0
        val cacheTimeout = TimeUnit.HOURS.toMillis(1)
        return if (System.currentTimeMillis() - lastFetch < cacheTimeout) {
            InitializeAction.SKIP_INITIAL_REFRESH
        } else {
            InitializeAction.LAUNCH_INITIAL_REFRESH
        }
    }

    override suspend fun load(
        loadType: LoadType,
        state: PagingState<Int, ArticleEntity>,
    ): MediatorResult {
        val page = when (loadType) {
            LoadType.REFRESH -> 1
            LoadType.PREPEND -> return MediatorResult.Success(endOfPaginationReached = true)
            LoadType.APPEND -> {
                val lastItem = state.lastItemOrNull()
                    ?: return MediatorResult.Success(endOfPaginationReached = true)
                lastItem.nextPage
                    ?: return MediatorResult.Success(endOfPaginationReached = true)
            }
        }

        return try {
            val response = api.getArticles(page = page, size = state.config.pageSize)

            database.withTransaction {
                if (loadType == LoadType.REFRESH) {
                    dao.clearAll()
                    dao.updateFetchTimestamp(System.currentTimeMillis())
                }
                dao.insertAll(response.articles.map {
                    it.toEntity(nextPage = response.nextPage)
                })
            }

            MediatorResult.Success(
                endOfPaginationReached = response.nextPage == null
            )
        } catch (e: IOException) {
            MediatorResult.Error(e)
        } catch (e: HttpException) {
            MediatorResult.Error(e)
        }
    }
}
```

The `initialize` method controls whether Paging 3 triggers a REFRESH on first load. By checking the cache age, you can skip the network call entirely when cached data is fresh enough. This prevents unnecessary network requests when the user navigates to a screen with recent data, improving both performance and battery life.

**Key takeaway:** RemoteMediator bridges network and database for offline pagination. Store remote keys (next page or cursor) alongside data in Room so pagination state survives process death. Use `initialize()` to skip unnecessary refreshes when cached data is fresh.

### Lesson 5.4: Consuming PagingData in Compose

Consuming PagingData in Jetpack Compose requires the `collectAsLazyPagingItems()` extension, which converts the `Flow<PagingData>` into a `LazyPagingItems` object that integrates directly with `LazyColumn`. This object provides `itemCount`, index-based access, `LoadState` for each direction (refresh, append, prepend), and `retry()` for error recovery. The UI code reads naturally — you iterate over items, check load states, and show appropriate UI for each state.

Load state handling is where Paging 3 shines. The `loadState` object tells you the current state of each loading direction. `loadState.refresh` is the initial full-screen load. `loadState.append` is the bottom-of-list next-page load. `loadState.prepend` is the top-of-list previous-page load. Each can be `Loading`, `NotLoading`, or `Error`. By checking these states, you show a full-screen loading indicator for initial load, a bottom spinner for next page, and inline retry buttons for errors — all without manually tracking any state.

Stable keys are critical for performance. When items are added, removed, or reordered, `LazyColumn` uses keys to determine which items have moved and which are new. Without keys, any change causes every visible item to recompose. With keys (typically the item's unique ID), only genuinely changed items recompose. This is especially important with Paging 3 because page loads frequently modify the item list.

```kotlin
@Composable
fun ArticleListScreen(viewModel: ArticleViewModel = hiltViewModel()) {
    val articles = viewModel.articles.collectAsLazyPagingItems()

    Box(modifier = Modifier.fillMaxSize()) {
        // Full-screen loading for initial load
        if (articles.loadState.refresh is LoadState.Loading && articles.itemCount == 0) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        }

        // Full-screen error for initial load failure
        if (articles.loadState.refresh is LoadState.Error && articles.itemCount == 0) {
            ErrorScreen(
                message = (articles.loadState.refresh as LoadState.Error).error.message,
                onRetry = { articles.retry() },
                modifier = Modifier.align(Alignment.Center),
            )
        }

        LazyColumn {
            items(
                count = articles.itemCount,
                key = articles.itemKey { it.id },
            ) { index ->
                val article = articles[index]
                if (article != null) {
                    ArticleCard(article)
                } else {
                    ArticlePlaceholder()
                }
            }

            // Bottom loading indicator for next page
            when (articles.loadState.append) {
                is LoadState.Loading -> item {
                    LoadingIndicator(modifier = Modifier.fillMaxWidth())
                }
                is LoadState.Error -> item {
                    RetryButton(
                        message = "Failed to load more",
                        onClick = { articles.retry() },
                    )
                }
                is LoadState.NotLoading -> {}
            }
        }

        // Pull-to-refresh
        PullToRefreshContainer(
            isRefreshing = articles.loadState.refresh is LoadState.Loading,
            onRefresh = { articles.refresh() },
        )
    }
}
```

**Key takeaway:** Use `collectAsLazyPagingItems()` to bridge Paging 3 with Compose. Handle all three load states (refresh, append, prepend) for a complete pagination UX. Always provide stable keys via `itemKey` for optimal recomposition performance.

### Lesson 5.5: Cursor-Based PagingSource

When your API uses cursor-based pagination and you don't need offline support (or you're building a network-only feature like search), you can use a standalone `PagingSource` without RemoteMediator. The PagingSource loads directly from the network using the cursor as the key type instead of an integer page number. This is simpler than the RemoteMediator approach but doesn't give you offline pagination because data isn't persisted to Room.

The `getRefreshKey` method determines where to restart pagination after a refresh (e.g., pull-to-refresh or invalidation). For most cursor-based implementations, returning `null` means "start from the beginning," which is appropriate for feeds where refresh should show the newest content. For positional refresh (showing the same position after configuration change), you'd return the cursor of the item closest to the last visible position.

```kotlin
class SearchPagingSource(
    private val api: SearchApi,
    private val query: String,
) : PagingSource<String, SearchResult>() {

    override suspend fun load(
        params: LoadParams<String>,
    ): LoadResult<String, SearchResult> {
        return try {
            val cursor = params.key
            val response = api.search(
                query = query,
                after = cursor,
                limit = params.loadSize,
            )

            LoadResult.Page(
                data = response.results,
                prevKey = null,
                nextKey = response.nextCursor,
            )
        } catch (e: IOException) {
            LoadResult.Error(e)
        } catch (e: HttpException) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(
        state: PagingState<String, SearchResult>,
    ): String? = null
}

// In the ViewModel — create a new Pager when the query changes
class SearchViewModel(private val api: SearchApi) : ViewModel() {
    private val _query = MutableStateFlow("")

    val searchResults: Flow<PagingData<SearchResult>> = _query
        .debounce(300)
        .filter { it.length >= 2 }
        .flatMapLatest { query ->
            Pager(
                config = PagingConfig(pageSize = 20, prefetchDistance = 5),
                pagingSourceFactory = { SearchPagingSource(api, query) }
            ).flow
        }
        .cachedIn(viewModelScope)

    fun onQueryChanged(query: String) {
        _query.value = query
    }
}
```

**Key takeaway:** Use a standalone cursor-based PagingSource for network-only paginated features like search. Debounce user input and recreate the Pager when the query changes. Use `cachedIn(viewModelScope)` to survive configuration changes.

### Quiz: Pagination

#### Why does the RemoteMediator return `MediatorResult.Success(endOfPaginationReached = true)` for `LoadType.PREPEND`?

- ❌ Because prepending data is not supported by Paging 3
- ✅ Because in a top-down feed, there is no need to load items before the first page
- ❌ Because prepend operations would cause data duplication
- ❌ Because the API doesn't support reverse pagination

> **Explanation:** In a typical feed or list that loads from the top, prepending (loading items before the first item) is unnecessary since a refresh already fetches the newest items. Returning `endOfPaginationReached = true` tells Paging 3 to stop trying to prepend.

#### What is the role of `prefetchDistance` in `PagingConfig`?

- ❌ It controls how many items are kept in memory at once
- ❌ It sets the maximum number of pages to cache on disk
- ✅ It determines how many items before the end of the loaded list trigger loading the next page
- ❌ It defines the delay in milliseconds between page loads

> **Explanation:** `prefetchDistance` tells Paging 3 to start loading the next page when the user is within that many items of the end of the currently loaded data. A value of 5 means the next page starts loading when there are 5 items left to scroll through.

#### Why is cursor-based pagination preferred over offset-based for mobile feeds?

- ❌ Because cursors are faster to compute on the server
- ❌ Because offset pagination requires more memory on the client
- ✅ Because cursor-based pagination provides stable results even when items are inserted or deleted between page requests
- ❌ Because offset-based pagination requires knowing the total item count

> **Explanation:** If a new post is added to a feed while a user is scrolling, offset-based pagination shifts all items, causing duplicates or skipped items. Cursor-based pagination anchors to a specific item, providing stable results regardless of dataset changes.

### Coding Challenge: Search with Debounced Pagination

Implement a search ViewModel that debounces user input, creates a new PagingSource for each query, and handles empty state and minimum query length.

#### Solution

```kotlin
class SearchViewModel(
    private val searchApi: SearchApi,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    sealed class SearchUiState {
        data object Idle : SearchUiState()
        data object MinimumLength : SearchUiState()
        data class Results(val data: Flow<PagingData<SearchResult>>) : SearchUiState()
    }

    val uiState: StateFlow<SearchUiState> = _query
        .debounce(300)
        .map { query ->
            when {
                query.isBlank() -> SearchUiState.Idle
                query.length < 2 -> SearchUiState.MinimumLength
                else -> SearchUiState.Results(
                    Pager(
                        config = PagingConfig(pageSize = 20, prefetchDistance = 5),
                        pagingSourceFactory = { SearchPagingSource(searchApi, query) },
                    ).flow.cachedIn(viewModelScope)
                )
            }
        }
        .stateIn(viewModelScope, SharingStarted.Lazily, SearchUiState.Idle)

    fun onQueryChanged(newQuery: String) {
        _query.value = newQuery
    }

    fun clearSearch() {
        _query.value = ""
    }
}
```

This ViewModel handles the complete search lifecycle: idle state when no query is entered, a minimum length gate that prevents trivially short queries from hitting the API, debounced input to avoid firing on every keystroke, and paginated results that scroll infinitely. The `cachedIn` operator ensures PagingData survives configuration changes.

---

## Module 6: Data Sync and Conflict Resolution

### Lesson 6.1: Pull-Based Sync with Timestamps

Pull-based sync is the simplest and most common sync strategy for mobile apps. The client periodically asks the server "what changed since my last sync?" using a server-side timestamp as the anchor. The server returns created, updated, and deleted records since that timestamp. The client applies these changes to the local database in a single transaction, then updates the stored sync timestamp. This approach is stateless on the server (no per-client sync state to maintain) and resilient to client failures (if sync fails midway, the timestamp isn't updated, so the next sync retries everything).

The server timestamp — not the client timestamp — is the anchor. Client device clocks can be wrong, manually adjusted, or in different time zones. If you sync based on the client clock, a user who sets their phone's clock back by an hour might miss an hour of changes forever. The server is the authoritative time source, and every client agrees on "what changed since when" based on that single clock. The sync response includes the server's current timestamp, which the client stores and sends back on the next sync.

Applying changes atomically in a Room transaction is critical. If the sync applies 50 inserts and 30 updates but crashes on delete number 15, you need the entire operation to roll back. Otherwise, the database is in a partially synced state — some deletes applied, others didn't — and the stored timestamp says "synced up to this point" even though it hasn't. Wrapping everything in `dao.withTransaction` ensures it's all-or-nothing.

```kotlin
class PullSyncManager(
    private val api: SyncApi,
    private val dao: SyncDao,
    private val database: AppDatabase,
) {
    suspend fun sync(): SyncResult {
        val lastSyncTimestamp = dao.getLastSyncTimestamp() ?: 0L

        return try {
            val changes = api.getChanges(since = lastSyncTimestamp)

            database.withTransaction {
                changes.created.forEach { dao.insert(it.toEntity()) }
                changes.updated.forEach { dao.upsert(it.toEntity()) }
                changes.deleted.forEach { dao.deleteById(it.id) }
                dao.setLastSyncTimestamp(changes.serverTimestamp)
            }

            SyncResult.Success(
                created = changes.created.size,
                updated = changes.updated.size,
                deleted = changes.deleted.size,
            )
        } catch (e: Exception) {
            SyncResult.Failure(e)
        }
    }

    fun schedulePeriodic(workManager: WorkManager) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(
            repeatInterval = 15,
            repeatIntervalTimeUnit = TimeUnit.MINUTES,
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS,
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "periodic_sync",
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}

sealed class SyncResult {
    data class Success(val created: Int, val updated: Int, val deleted: Int) : SyncResult()
    data class Failure(val error: Exception) : SyncResult()
}
```

**Key takeaway:** Pull-based sync uses server timestamps as the anchor, applies changes atomically in a database transaction, and schedules periodic syncs with WorkManager. Always use the server's timestamp, never the client's.

### Lesson 6.2: Push-Based Sync with WebSocket

While pull-based sync works well for most apps, some features demand real-time data: chat messages, collaborative editing, live scores, typing indicators. Push-based sync uses a persistent connection (usually WebSocket) where the server sends updates as they happen. The client doesn't need to poll — it receives events the moment they occur on the server.

The architecture has three components: the WebSocket connection manager (handles connection lifecycle, reconnection, and heartbeats), the event dispatcher (parses incoming events and routes them to the appropriate handler), and the local persistence layer (writes events to Room so the UI always reads from the database, not directly from the WebSocket). This last point is crucial — even with push-based sync, the database remains the single source of truth. WebSocket events are persisted to Room, and the UI observes Room. This ensures consistency during reconnection gaps and process death.

Connection lifecycle management is the hardest part of WebSocket integration. You need to handle: initial connection with authentication, automatic reconnection with exponential backoff when the connection drops, heartbeat/ping-pong to detect dead connections before the OS does, buffering events during reconnection (the server should support a "catch-up" mechanism so the client can request events missed during the disconnection window), and graceful shutdown when the app is backgrounded.

```kotlin
class WebSocketManager(
    private val url: String,
    private val tokenProvider: TokenProvider,
    private val eventDispatcher: EventDispatcher,
) {
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private var reconnectAttempt = 0
    private val maxReconnectDelay = 30_000L

    fun connect() {
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer ${tokenProvider.getToken()}")
            .build()

        _connectionState.value = ConnectionState.Connecting
        webSocket = client.newWebSocket(request, createListener())
    }

    private fun createListener() = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            _connectionState.value = ConnectionState.Connected
            reconnectAttempt = 0
            // Request events missed during disconnection
            sendCatchUpRequest()
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val event = parseEvent(text)
            eventDispatcher.dispatch(event)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            _connectionState.value = ConnectionState.Disconnected
            scheduleReconnect()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            _connectionState.value = ConnectionState.Disconnected
        }
    }

    private fun scheduleReconnect() {
        val delay = (1000L * (1 shl reconnectAttempt.coerceAtMost(5)))
            .coerceAtMost(maxReconnectDelay)
        reconnectAttempt++
        // Schedule reconnect with delay
        CoroutineScope(Dispatchers.IO).launch {
            delay(delay)
            connect()
        }
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
    }
}

sealed class ConnectionState {
    data object Connecting : ConnectionState()
    data object Connected : ConnectionState()
    data object Disconnected : ConnectionState()
}
```

**Key takeaway:** Push-based sync provides real-time updates through persistent WebSocket connections. Even with push sync, the database remains the single source of truth — WebSocket events are persisted to Room, not consumed directly by the UI. Handle reconnection with exponential backoff and catch-up mechanisms.

### Lesson 6.3: Conflict Resolution Strategies

Conflicts arise when the same data is modified in two places before either change is synced. User A changes a note title on their phone while offline. Meanwhile, User B changes the same note title on their tablet. When both devices sync, the server receives two competing changes for the same field. The conflict resolution strategy determines which change wins.

The four main strategies are: Server Wins (the server's version always takes priority — simplest, but can silently discard user changes), Client Wins (the client's local version always takes priority — risky because it can overwrite changes from other devices), Last Write Wins (the most recent change wins based on timestamps — pragmatic and widely used, but clock skew can cause unexpected results), and Manual Resolution (flag the conflict and let the user choose — most correct but most complex, and users dislike being asked to resolve conflicts).

For most mobile apps, Last Write Wins is the pragmatic choice. It preserves the most recent user intent regardless of which device made the change. The implementation requires accurate timestamps — use server-issued timestamps rather than client clocks to avoid clock skew issues. For collaborative apps where data loss is unacceptable (document editors, shared lists), consider operational transformation or CRDTs (Conflict-free Replicated Data Types), though these are significantly more complex to implement.

```kotlin
sealed class ConflictStrategy {
    data object ServerWins : ConflictStrategy()
    data object ClientWins : ConflictStrategy()
    data object LastWriteWins : ConflictStrategy()
    data object Manual : ConflictStrategy()
}

class ConflictResolver(private val strategy: ConflictStrategy) {
    fun <T : Syncable> resolve(local: T, remote: T): ConflictResult<T> =
        when (strategy) {
            is ConflictStrategy.ServerWins -> ConflictResult.Resolved(remote)
            is ConflictStrategy.ClientWins -> ConflictResult.Resolved(local)
            is ConflictStrategy.LastWriteWins -> {
                val winner = if (local.modifiedAt > remote.modifiedAt) local else remote
                ConflictResult.Resolved(winner)
            }
            is ConflictStrategy.Manual -> ConflictResult.NeedsUserInput(local, remote)
        }
}

sealed class ConflictResult<T> {
    data class Resolved<T>(val winner: T) : ConflictResult<T>()
    data class NeedsUserInput<T>(val local: T, val remote: T) : ConflictResult<T>()
}

interface Syncable {
    val id: String
    val modifiedAt: Long
    val version: Int
}
```

**Key takeaway:** Most apps can use Last Write Wins conflict resolution based on server-issued timestamps. Manual conflict resolution is correct but complex and rarely needed. Choose the simplest strategy that meets your data integrity requirements.

### Lesson 6.4: Delta Sync and Bandwidth Optimization

Full sync — fetching the entire dataset on every sync — wastes bandwidth and battery. Delta sync fetches only the changes since the last sync, dramatically reducing payload size. A user with 10,000 notes where 3 changed since last sync should receive 3 records, not 10,000. The implementation requires the server to support change tracking (either through timestamps, version numbers, or a changelog table) and the client to track its sync position.

The sync payload format matters for bandwidth. Instead of sending full entities for every change, send only the changed fields (field-level deltas). A note where only the title changed should transmit the note ID, the new title, and the modification timestamp — not the entire note body. This is especially impactful for entities with large text fields or binary data. The tradeoff is implementation complexity: field-level deltas require schema awareness on both client and server, and applying partial updates to the local database is more complex than replacing entire rows.

For further bandwidth optimization, use HTTP compression (gzip or brotli), which OkHttp supports transparently. For bulk sync responses, consider streaming JSON parsing (with libraries like Moshi's `JsonReader`) instead of buffering the entire response into memory. On metered connections, batch small syncs into fewer, larger requests to minimize the overhead of repeated connection setup and HTTP headers.

```kotlin
class DeltaSyncManager(
    private val api: SyncApi,
    private val dao: SyncableDao,
) {
    suspend fun deltaSync(entityType: String): DeltaSyncResult {
        val lastVersion = dao.getLastSyncVersion(entityType) ?: 0

        val delta = api.getDelta(
            entityType = entityType,
            sinceVersion = lastVersion,
        )

        dao.withTransaction {
            delta.changes.forEach { change ->
                when (change.operation) {
                    ChangeOperation.INSERT -> dao.insert(change.entity)
                    ChangeOperation.UPDATE -> dao.applyPartialUpdate(
                        id = change.entity.id,
                        fields = change.changedFields,
                    )
                    ChangeOperation.DELETE -> dao.deleteById(change.entity.id)
                }
            }
            dao.setLastSyncVersion(entityType, delta.latestVersion)
        }

        return DeltaSyncResult(
            entityType = entityType,
            changesApplied = delta.changes.size,
            newVersion = delta.latestVersion,
        )
    }
}

data class DeltaChange(
    val operation: ChangeOperation,
    val entity: SyncableEntity,
    val changedFields: Map<String, Any?> = emptyMap(),
)

enum class ChangeOperation { INSERT, UPDATE, DELETE }
```

**Key takeaway:** Delta sync fetches only changes since the last sync, saving bandwidth and battery. Use field-level deltas for large entities and HTTP compression for all sync traffic. Track sync position with server-side version numbers.

### Lesson 6.5: WorkManager for Reliable Background Sync

WorkManager is the correct tool for scheduling reliable background sync on Android. Unlike coroutines launched in a ViewModel scope (which die with the Activity) or foreground services (which require a persistent notification), WorkManager guarantees work execution even if the app is killed, the device restarts, or the user force-stops the app. It respects system constraints like network availability, battery level, and storage space.

For sync operations, use `PeriodicWorkRequest` for regular background sync (minimum interval is 15 minutes) and `OneTimeWorkRequest` for immediate sync triggered by user action. Chain work requests for multi-step sync flows — first sync user data, then sync messages, then sync media. Each step can have its own constraints and retry policy. If any step fails, the chain halts and can be retried.

The SyncWorker itself should be idempotent — running it twice with the same state should produce the same result. This is important because WorkManager may retry the worker if it fails, and in rare cases may run it even after it succeeds (due to system rescheduling). Idempotency means using upsert operations instead of inserts, tracking sync position with server timestamps, and not relying on in-memory state.

```kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val syncManager: PullSyncManager,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val result = syncManager.sync()
            when (result) {
                is SyncResult.Success -> Result.success(
                    workDataOf(
                        "created" to result.created,
                        "updated" to result.updated,
                        "deleted" to result.deleted,
                    )
                )
                is SyncResult.Failure -> {
                    if (runAttemptCount < 3) Result.retry()
                    else Result.failure()
                }
            }
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry()
            else Result.failure()
        }
    }

    companion object {
        fun scheduleImmediate(workManager: WorkManager) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()

            workManager.enqueueUniqueWork(
                "immediate_sync",
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
```

**Key takeaway:** Use WorkManager for background sync because it survives process death, respects system constraints, and supports retry with exponential backoff. Make sync workers idempotent so retries and duplicate executions are safe.

### Quiz: Data Sync and Conflict Resolution

#### In pull-based sync, why is the server timestamp used instead of the client timestamp to track sync progress?

- ❌ Because client clocks are faster than server clocks
- ✅ Because client clocks can be inaccurate or manipulated, and the server is the authoritative time source
- ❌ Because server timestamps use a more efficient format
- ❌ Because client timestamps cannot be stored in databases

> **Explanation:** Client device clocks can be wrong, manually set, or in different time zones. Using the server timestamp as the sync anchor ensures consistency — every client agrees on "what changed since when" based on one authoritative clock.

#### Which conflict resolution strategy would you choose for a note-taking app where users edit on multiple devices?

- ❌ Server Wins — because server data is always correct
- ❌ Client Wins — because the user's latest device is always right
- ✅ Last Write Wins — because the most recent edit across all devices should prevail
- ❌ Manual — because every conflict needs user attention

> **Explanation:** Last Write Wins is the best pragmatic choice for a note-taking app. It preserves the most recent edit regardless of which device made it. Server Wins or Client Wins would arbitrarily discard valid edits. Manual resolution would annoy users with frequent conflict dialogs.

#### Why must sync changes be applied in a database transaction?

- ❌ Because transactions are faster than individual operations
- ✅ Because a partial sync (some changes applied, others not) leaves the database in an inconsistent state
- ❌ Because Room requires transactions for all write operations
- ❌ Because transactions prevent concurrent access to the database

> **Explanation:** If sync applies 50 inserts and 30 updates but crashes on delete 15, the database has some changes but not all. The stored sync timestamp says "synced up to this point" even though it hasn't fully synced. Transactions ensure all-or-nothing — either all changes apply or none do.

### Coding Challenge: Timestamp-Based Sync Tracker

Build a `SyncTracker` class that tracks the sync state for multiple entity types, each with their own last-sync timestamp. It should support checking if a specific entity type needs syncing based on a configurable stale threshold.

#### Solution

```kotlin
class SyncTracker(
    private val staleThresholdMs: Long = 15 * 60 * 1000,
) {
    private val syncTimestamps = mutableMapOf<String, Long>()

    fun recordSync(entityType: String, serverTimestamp: Long) {
        syncTimestamps[entityType] = serverTimestamp
    }

    fun needsSync(entityType: String): Boolean {
        val lastSync = syncTimestamps[entityType] ?: return true
        return System.currentTimeMillis() - lastSync > staleThresholdMs
    }

    fun getLastSyncTimestamp(entityType: String): Long? {
        return syncTimestamps[entityType]
    }

    fun getStaleEntities(): List<String> {
        return syncTimestamps.filter { (entityType, _) ->
            needsSync(entityType)
        }.keys.toList()
    }

    suspend fun syncIfNeeded(
        entityType: String,
        syncAction: suspend (lastTimestamp: Long?) -> Long,
    ) {
        if (needsSync(entityType)) {
            val lastTimestamp = syncTimestamps[entityType]
            val newTimestamp = syncAction(lastTimestamp)
            recordSync(entityType, newTimestamp)
        }
    }
}
```

This tracker manages sync state per entity type, making it easy to coordinate syncing across different data types. The `syncIfNeeded` method combines the check and sync into one call, passing the last timestamp to the sync action so it can request only changes since then.

---

## Module 7: Modularization

### Lesson 7.1: Why Modularize and When

Modularization isn't something you do because a conference talk told you to. It's an organizational and architectural decision that should be driven by real pain — slow builds, merge conflicts, teams blocking each other, or code boundaries that keep getting violated. I've worked on Android codebases that ranged from a single module with 200 files dumped into a handful of packages to 40+ module projects where adding a new feature meant creating three modules before writing a single line of business logic. Both extremes taught me something.

The single-module project was fast to navigate and simple to reason about — until four developers started stepping on each other's toes in every pull request. The heavily modularized project gave teams independence, but the build configuration overhead and navigation indirection made onboarding a nightmare. The sweet spot depends on your team size, codebase complexity, and growth trajectory. A 2-person team building an MVP shouldn't modularize beyond separating the app module from a core module. A 20-person team with 5 feature teams absolutely needs feature-level modularization.

When done well, modularization gives you parallel builds (Gradle compiles independent modules simultaneously), clear ownership (each team owns their modules), testability (modules can be tested in isolation), and encapsulation (internal classes can't leak across module boundaries with Kotlin's `internal` visibility). When done poorly, it gives you 30 Gradle files to maintain, circular dependency headaches, and build times that somehow got worse because every module depends on every other module.

The key benefits are: faster incremental builds because Gradle only recompiles changed modules and their dependents, better testability because modules can be tested in isolation with fake dependencies, clear code ownership with team-aligned module boundaries, and enforced architectural boundaries through Gradle's dependency graph. The key costs are: more Gradle configuration to maintain, more boilerplate for inter-module communication, steeper onboarding curve for new developers, and potential over-fragmentation if taken too far.

**Key takeaway:** Modularize based on real pain, not theoretical benefits. Start with coarse-grained modules and refine only when specific problems (slow builds, merge conflicts, boundary violations) demand it. The right module count depends on team size and codebase complexity.

### Lesson 7.2: Module Types and Naming Conventions

Before writing any code, you need a clear taxonomy of what kinds of modules exist in your project and what goes where. I've seen teams invent module names ad hoc — `:utils`, `:shared`, `:common`, `:base` — and six months later nobody can tell you what the difference between `:common` and `:shared` is. A consistent naming convention prevents this entirely and serves as self-documenting architecture.

The module types that work best across projects are: `:app` (application entry point, DI wiring, navigation graph — depends on everything, nothing depends on it), `:feature:*` (independent user-facing features — `:feature:search`, `:feature:checkout`, `:feature:profile`), `:core:*` (shared infrastructure owned by a platform team — `:core:network`, `:core:database`, `:core:ui`, `:core:testing`), and `:lib:*` (pure Kotlin libraries with no Android dependencies — `:lib:analytics-api`, `:lib:formatting`). The `:lib:*` modules compile faster because they skip the Android Gradle plugin overhead entirely.

When you adopt the API/impl split, the naming extends naturally. `:core:network:api` holds the interfaces and models. `:core:network:impl` holds the Retrofit implementation. Feature modules only depend on `:api` modules, never on `:impl`. The `:app` module is the only place that wires `:impl` to `:api` through DI bindings. This prevents feature modules from accidentally depending on concrete implementations and ensures the API surface is stable.

```kotlin
// settings.gradle.kts — well-structured module graph
include(":app")

// Feature modules — one per user-facing feature
include(":feature:search")
include(":feature:checkout")
include(":feature:profile")
include(":feature:order-history")

// Core modules — shared Android infrastructure
include(":core:network:api")
include(":core:network:impl")
include(":core:database")
include(":core:ui")
include(":core:navigation")
include(":core:testing")

// Lib modules — pure Kotlin, no Android dependency
include(":lib:analytics-api")
include(":lib:formatting")
include(":lib:result")
```

**Key takeaway:** Use a consistent module taxonomy — `:app`, `:feature:*`, `:core:*`, `:lib:*` — that serves as self-documenting architecture. The naming convention itself tells new developers where code belongs without reading any documentation.

### Lesson 7.3: Feature-Based vs Layer-Based Modules

The most common modularization mistake is splitting by architectural layer — a `:data` module, a `:domain` module, a `:presentation` module. This feels clean on a diagram, but it creates modules that change for every feature. Add a new screen? You touch all three modules. Every pull request crosses module boundaries, and you lose the main benefit of modularization: independent, parallel work on isolated features.

Feature-based modules group everything a feature needs — its UI, its repository, its use cases, its models — into one module. The `:feature:search` module contains search-related screens, data sources, and domain logic. The `:feature:checkout` module owns the checkout flow end to end. Two developers working on search and checkout never touch the same files or create merge conflicts. This structure works even better when module boundaries align with team boundaries — the payments team owns `:feature:payment`, the search team owns `:feature:search`.

The tradeoff is that feature modules can duplicate some code. Two features might define similar data classes or utility functions. The instinct is to extract everything shared into `:core`, but over-extracting creates a bloated core module that everything depends on — defeating the purpose of modularization. My rule of thumb: duplicate code across features until you see the same abstraction appear three times, then extract it. Premature extraction creates coupling; late extraction is a simple refactor.

```
:app
├── :feature:home       (Home screen, feed, recommendations)
├── :feature:search     (Search UI, search repository, filters)
├── :feature:checkout   (Cart, payment, order confirmation)
├── :feature:profile    (User profile, settings, preferences)
├── :core:network       (OkHttp, Retrofit, interceptors)
├── :core:database      (Room, DAOs, migrations)
├── :core:ui            (Design system, shared composables, theme)
├── :core:domain        (Shared interfaces, domain models)
└── :core:testing       (Fakes, test utilities, test rules)
```

**Key takeaway:** Prefer feature-based modules over layer-based modules. Feature modules enable parallel development, reduce merge conflicts, and align naturally with team boundaries. Tolerate duplication between features rather than creating a bloated shared core.

### Lesson 7.4: Dependency Rules and Inter-Module Communication

Circular dependencies between modules are the modularization equivalent of spaghetti code. Gradle won't compile them. But the real problem starts earlier, when the dependency graph is technically acyclic but practically tangled through transitive dependencies. The fix is strict dependency rules enforced by convention and tooling.

The rules are: `:app` depends on everything but nothing depends on `:app`. Feature modules depend on `:core:*` modules but never on other feature modules. `:core:domain` defines interfaces that `:core:data` implements — the domain never depends on data. `:core:*` modules never depend on `:feature:*` modules. Dependencies always flow inward — from features to core, never the reverse.

When features need to communicate (checkout needs the user's shipping address from the profile feature), use dependency inversion through a shared contracts module. Define an interface in `:core:contracts`, implement it in `:feature:profile`, and wire it in `:app` through DI. The checkout module never knows about profiles — it asks for a `ShippingAddressProvider` and gets one.

```kotlin
// Defined in :core:contracts
interface ShippingAddressProvider {
    suspend fun getDefaultAddress(userId: String): ShippingAddress?
}

// Implemented in :feature:profile
internal class ProfileShippingAddressProvider(
    private val profileRepository: ProfileRepository,
) : ShippingAddressProvider {
    override suspend fun getDefaultAddress(userId: String): ShippingAddress? {
        return profileRepository.getProfile(userId)
            ?.defaultAddress
            ?.toShippingAddress()
    }
}

// Wired in :app's DI module
@Module
@InstallIn(SingletonComponent::class)
abstract class AddressBindingsModule {
    @Binds
    abstract fun bindShippingAddressProvider(
        impl: ProfileShippingAddressProvider,
    ): ShippingAddressProvider
}
```

**Key takeaway:** Enforce strict dependency rules: features depend on core, never on each other. Use dependency inversion through shared contract interfaces for cross-feature communication. The `:app` module is the only place that wires implementations to interfaces.

### Lesson 7.5: Feature Module Structure and Navigation

Each feature module should be self-contained — it owns its screens, ViewModels, navigation registration, and feature-specific DI bindings. The only thing it exposes to the outside world is a `NavGraphBuilder` extension function that registers its navigation destinations. This minimal public API means you can refactor everything inside a feature module without touching any other module.

Navigation between feature modules uses route-based navigation. The `:core:navigation` module defines route constants or a sealed class of destinations. Each feature module registers itself against its routes using `NavGraphBuilder` extensions. The `:app` module composes the full navigation graph by calling each feature's registration function. This approach avoids compile-time dependencies between features while maintaining type-safe navigation.

```kotlin
// :core:navigation — shared route definitions
object Routes {
    const val HOME = "home"
    const val PROFILE = "profile/{userId}"
    const val SEARCH = "search"
    const val CHECKOUT = "checkout"

    fun profile(userId: String) = "profile/$userId"
}

// :feature:profile — registers its own navigation
fun NavGraphBuilder.profileScreen(
    onNavigateBack: () -> Unit,
    onNavigateToSettings: () -> Unit,
) {
    composable(
        route = Routes.PROFILE,
        arguments = listOf(navArgument("userId") { type = NavType.StringType }),
    ) {
        val viewModel: ProfileViewModel = hiltViewModel()
        ProfileScreen(
            viewModel = viewModel,
            onNavigateBack = onNavigateBack,
            onNavigateToSettings = onNavigateToSettings,
        )
    }
}

// :app — composes the full navigation graph
@Composable
fun AppNavGraph(navController: NavHostController) {
    NavHost(navController = navController, startDestination = Routes.HOME) {
        homeScreen(
            onNavigateToProfile = { userId ->
                navController.navigate(Routes.profile(userId))
            },
        )
        profileScreen(
            onNavigateBack = { navController.popBackStack() },
            onNavigateToSettings = { navController.navigate("settings") },
        )
        searchScreen()
        checkoutScreen()
    }
}
```

**Key takeaway:** Features expose only a `NavGraphBuilder` extension function — their entire public API is "how to navigate to me." This encapsulation lets you add, remove, or refactor features without touching other modules.

### Lesson 7.6: Build Performance and Module Optimization

One of the primary motivations for modularization is faster builds, but poorly structured modules can actually make builds slower. The key is understanding Gradle's build parallelism: independent modules compile simultaneously on separate CPU cores, but modules with dependencies compile sequentially because a module can't start compiling until all its dependencies are built. A module graph where everything depends on everything is a linear build, not a parallel one.

To maximize parallelism, keep the dependency graph shallow and wide. Feature modules should depend on a small number of core modules, not on each other. Core modules should be fine-grained — `:core:network`, `:core:database`, `:core:ui` — rather than a single monolithic `:core` that everything depends on. A monolithic core module is a serialization point: every module waits for it to build before starting. Splitting it into independent core modules lets them build in parallel.

Use `api` vs `implementation` dependencies correctly. `implementation` means the dependency is an internal detail — downstream modules can't see it and aren't recompiled when it changes. `api` means the dependency is part of the module's public API — downstream modules can see it and are recompiled when it changes. Using `api` when you should use `implementation` creates unnecessary recompilation cascades. Default to `implementation` and only use `api` when a dependency's types appear in your module's public interface.

```kotlin
// :feature:search build.gradle.kts
dependencies {
    // implementation — internal details, won't trigger recompilation of dependents
    implementation(project(":core:network:api"))
    implementation(project(":core:database"))
    implementation(project(":core:ui"))

    // api — only if search exposes types from this module in its public API
    // api(project(":core:domain"))  // Avoid unless necessary

    // Test dependencies
    testImplementation(project(":core:testing"))
}
```

**Key takeaway:** Maximize build parallelism with a shallow, wide dependency graph. Use `implementation` instead of `api` to prevent recompilation cascades. Split monolithic core modules into independent, fine-grained modules that can build in parallel.

### Quiz: Modularization

#### Why should `:feature:home` NOT depend on `:feature:profile`?

- ❌ Because Gradle doesn't allow feature-to-feature dependencies
- ✅ Because features should be independent so they can be developed, tested, and modified without affecting each other
- ❌ Because it would make the APK size too large
- ❌ Because feature modules can't contain navigation code

> **Explanation:** Feature-to-feature dependencies create tight coupling. If `:feature:home` depends on `:feature:profile`, changing profile might break home. Independent features allow parallel development by different teams and enable feature-level testing in isolation.

#### Why does `:core:domain` NOT depend on `:core:data`?

- ❌ Because domain and data modules use different languages
- ❌ Because it would create a Gradle build error
- ✅ Because the domain layer defines interfaces that the data layer implements — the dependency points inward
- ❌ Because the data layer is optional in Android projects

> **Explanation:** This follows the Dependency Inversion Principle. The domain layer defines repository interfaces and use cases using pure Kotlin. The data layer implements those interfaces with concrete details (Room, Retrofit). Dependencies always point inward toward the domain.

#### What is the difference between `implementation` and `api` in Gradle dependencies?

- ❌ `api` is for production code, `implementation` is for tests
- ✅ `implementation` hides the dependency from downstream modules, while `api` exposes it and triggers recompilation when it changes
- ❌ `api` is faster because it uses a different compilation strategy
- ❌ `implementation` only works with Java, while `api` works with Kotlin

> **Explanation:** `implementation` treats the dependency as an internal detail — other modules can't access its types and won't recompile when it changes. `api` exposes the dependency publicly, meaning any change to it triggers recompilation of all downstream modules. Default to `implementation` to minimize build cascades.

### Coding Challenge: Module Dependency Validator

Write a Kotlin function that validates module dependencies according to the rules: features can't depend on other features, domain can't depend on data, and no circular dependencies exist.

#### Solution

```kotlin
data class Module(
    val name: String,
    val type: ModuleType,
    val dependencies: Set<String>,
)

enum class ModuleType { APP, FEATURE, CORE_DOMAIN, CORE_DATA, CORE_OTHER }

class ModuleDependencyValidator {
    fun validate(modules: List<Module>): List<String> {
        val errors = mutableListOf<String>()
        val moduleMap = modules.associateBy { it.name }

        modules.forEach { module ->
            module.dependencies.forEach { dep ->
                val depModule = moduleMap[dep] ?: return@forEach

                if (module.type == ModuleType.FEATURE && depModule.type == ModuleType.FEATURE) {
                    errors.add("${module.name} → $dep: Feature cannot depend on another feature")
                }

                if (module.type == ModuleType.CORE_DOMAIN && depModule.type == ModuleType.CORE_DATA) {
                    errors.add("${module.name} → $dep: Domain cannot depend on data layer")
                }
            }

            if (hasCircularDependency(module.name, moduleMap, mutableSetOf())) {
                errors.add("${module.name}: Circular dependency detected")
            }
        }
        return errors
    }

    private fun hasCircularDependency(
        name: String,
        modules: Map<String, Module>,
        visited: MutableSet<String>,
    ): Boolean {
        if (name in visited) return true
        visited.add(name)
        val module = modules[name] ?: return false
        return module.dependencies.any {
            hasCircularDependency(it, modules, visited.toMutableSet())
        }
    }
}
```

This validator enforces the three core modularization rules at build configuration time. It catches feature-to-feature dependencies, domain-to-data violations, and circular dependencies — all common mistakes that erode module boundaries over time.

---

## Module 8: API Design for Mobile

### Lesson 8.1: Making Invalid States Impossible

The most effective API design principle in Kotlin is using the type system to make invalid states impossible to construct. If your function accepts a `String` for a currency code, someone will pass `"banana"`. If it accepts a `CurrencyCode` enum, they physically can't. Every bug prevented by the type system is a bug you never have to write a test for, never have to debug in production, and never have to explain in a postmortem. The compiler becomes your first line of defense, not your test suite.

Sealed interfaces are the sharpest tool here. Instead of representing a payment method as a `String` with possible values `"credit"`, `"debit"`, `"paypal"` — model it as a sealed hierarchy where each variant carries exactly the data it needs. A credit card has a number and expiry. PayPal has an email. Cash has neither. When you add a new variant, every `when` expression that handles the hierarchy breaks at compile time until the consumer handles the new case. That's the type system doing your QA work for free.

Value classes add another layer of protection. Kotlin's `@JvmInline value class` wraps a primitive in a named type with zero runtime allocation. At runtime, `UserId` is just a `String` — no wrapper object, no extra memory. But at compile time, `processRefund(orderId, userId, amount)` won't compile if you swap the `UserId` and `OrderId` parameters. I use value classes for any ID type, any monetary amount, and any domain quantity where confusion with another same-typed parameter is plausible.

```kotlin
// Stringly-typed — illegal states are easy to create
data class Payment(
    val method: String,
    val cardNumber: String?,
    val paypalEmail: String?,
)

// Type-safe — illegal states are impossible
sealed interface PaymentMethod {
    data class CreditCard(
        val number: CardNumber,
        val expiry: ExpiryDate,
        val cvv: String,
    ) : PaymentMethod

    data class PayPal(val email: EmailAddress) : PaymentMethod
    data object Cash : PaymentMethod
}

@JvmInline
value class UserId(val value: String)

@JvmInline
value class OrderId(val value: String)

@JvmInline
value class Cents(val value: Long) {
    fun toDollars(): Double = value / 100.0
}

// Without value classes — easy to mix up parameters
fun processRefund(userId: String, orderId: String, amount: Long) { }
processRefund(orderId, userId, amount) // Compiles! But wrong.

// With value classes — compiler catches the mistake
fun processRefund(userId: UserId, orderId: OrderId, amount: Cents) { }
// processRefund(orderId, userId, amount) // Compile error
```

**Key takeaway:** Use sealed interfaces and value classes to push validation from runtime to compile time. Every bug prevented by the type system is a bug that can never reach production.

### Lesson 8.2: Factory Functions and Smart Constructors

Raw constructors are honest — they expose exactly how an object is built. But sometimes that honesty is a liability. When a constructor takes five parameters, three of which have complex validation rules, you're asking every caller to understand your internal constraints. Factory functions in a `companion object` let you hide that complexity behind a clear, intention-revealing name.

The naming conventions matter. Kotlin's standard library establishes a vocabulary: `of()` for wrapping known-valid values (like `listOf()`), `from()` for parsing or converting (like `Instant.from()`), and `create()` for more involved construction. Following these conventions means your API feels familiar to anyone who's used Kotlin's own APIs. The `orNull()` variant returns `null` instead of throwing — it composes better with Kotlin's null safety features and is preferred when invalid input is expected (user-provided data) rather than exceptional (programmer error).

Private constructors combined with factory functions create a validation firewall. The only way to create an `EmailAddress` is through `from()` or `fromOrNull()`, both of which validate the input. There's no way to construct an invalid `EmailAddress` — the type itself is proof of validity. Any function that accepts `EmailAddress` as a parameter can skip email validation entirely because the type guarantees it's already been validated.

```kotlin
@JvmInline
value class EmailAddress private constructor(val value: String) {
    companion object {
        private val EMAIL_REGEX = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$")

        fun from(raw: String): EmailAddress {
            require(EMAIL_REGEX.matches(raw)) { "Invalid email: $raw" }
            return EmailAddress(raw.lowercase())
        }

        fun fromOrNull(raw: String): EmailAddress? {
            return if (EMAIL_REGEX.matches(raw)) EmailAddress(raw.lowercase()) else null
        }
    }
}

@JvmInline
value class PortNumber private constructor(val value: Int) {
    companion object {
        fun of(port: Int): PortNumber {
            require(port in 1..65535) { "Port must be 1-65535, was $port" }
            return PortNumber(port)
        }
    }
}
```

**Key takeaway:** Use private constructors with factory functions to create types that are valid by construction. The `from()` / `fromOrNull()` pattern separates expected-invalid input (return null) from programmer errors (throw exception).

### Lesson 8.3: Designing Evolution-Friendly APIs

APIs evolve. Requirements change, features are added, edge cases are discovered. The way you design your API surface today determines how painful — or painless — changes are tomorrow. The key principles are: make breaking changes impossible (or at least detectable at compile time), use default parameter values for backward-compatible additions, and prefer sealed hierarchies over enums when the set of values might grow.

Default parameter values are Kotlin's best tool for backward-compatible API evolution. When you add a new parameter with a default value, existing callers don't need to change. This is dramatically better than Java's approach of adding method overloads or creating Builder classes for every optional parameter. The catch is that default values work at the source level but not at the binary level — if a library consumer uses your API without recompiling, they won't pick up the default. For internal APIs (same codebase), this isn't a concern.

For APIs where the set of options might grow, prefer sealed interfaces over enums. When you add a new enum value, existing `when` expressions compile fine with a dangling `else` branch that silently ignores the new value. When you add a new sealed class variant, `when` expressions without `else` break at compile time, forcing every consumer to handle the new case. This is exactly what you want — compile-time enforcement that every code path handles every possible state.

```kotlin
// Evolution-friendly DSL with defaults
data class RetryConfig(
    val maxRetries: Int = 3,
    val initialDelayMs: Long = 1000,
    val maxDelayMs: Long = 30_000,
    val retryOn: Set<Int> = setOf(500, 502, 503, 504),
    // Added later — existing callers unaffected
    val jitterFactor: Double = 0.1,
    val onRetry: (attempt: Int, error: Throwable) -> Unit = { _, _ -> },
)

// Sealed interface — new variants force compile-time handling
sealed interface NetworkEvent {
    data class RequestStarted(val url: String, val method: String) : NetworkEvent
    data class ResponseReceived(val url: String, val code: Int, val durationMs: Long) : NetworkEvent
    data class RequestFailed(val url: String, val error: Throwable) : NetworkEvent
    // Adding this forces all `when` handlers to update:
    // data class RetryScheduled(val url: String, val attempt: Int, val delayMs: Long) : NetworkEvent
}

fun handleEvent(event: NetworkEvent) {
    when (event) {
        is NetworkEvent.RequestStarted -> log("→ ${event.method} ${event.url}")
        is NetworkEvent.ResponseReceived -> log("← ${event.code} ${event.url} (${event.durationMs}ms)")
        is NetworkEvent.RequestFailed -> log("✗ ${event.url}: ${event.error.message}")
        // No else branch — compiler will force handling of RetryScheduled when it's added
    }
}
```

**Key takeaway:** Design APIs for evolution. Use default parameter values for backward-compatible additions. Prefer sealed interfaces over enums when the variant set may grow — they provide compile-time enforcement that every consumer handles every case.

### Lesson 8.4: Result Types and Error Handling

Every API function that can fail should communicate failure through its return type, not through exceptions. Exceptions are invisible in the type system — you can't tell by looking at a function signature whether it throws. Result types make success and failure explicit: the caller must handle both cases because the type system requires it. This eliminates an entire class of bugs where error paths are forgotten.

Kotlin's built-in `Result<T>` type works for simple cases, but for domain-specific APIs, a custom sealed hierarchy is more expressive. You can add domain-specific error variants (not found, validation failed, unauthorized, rate limited) that carry structured error data. The caller pattern-matches on the result and handles each case explicitly. No exception catching, no unchecked error propagation, no "this should never happen" comments on error branches.

For repository layers that bridge multiple error domains (network errors, database errors, business logic errors), define a domain-specific error hierarchy that maps from infrastructure errors. The repository translates `IOException` into `DataError.Network`, `HttpException(404)` into `DataError.NotFound`, and `SQLiteConstraintException` into `DataError.Conflict`. Callers work with domain errors, not infrastructure exceptions.

```kotlin
sealed class DataError {
    data class Network(val cause: Throwable) : DataError()
    data class NotFound(val id: String) : DataError()
    data class Validation(val field: String, val message: String) : DataError()
    data class Unauthorized(val reason: String) : DataError()
    data object RateLimited : DataError()
    data class Unknown(val cause: Throwable) : DataError()
}

typealias DataResult<T> = Either<DataError, T>

// Repository returns typed results instead of throwing
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao,
) {
    suspend fun getUser(id: String): DataResult<User> {
        return try {
            val response = api.getUser(id)
            dao.upsert(response.toEntity())
            Either.Right(response.toDomain())
        } catch (e: HttpException) {
            when (e.code()) {
                404 -> Either.Left(DataError.NotFound(id))
                401 -> Either.Left(DataError.Unauthorized("Token expired"))
                429 -> Either.Left(DataError.RateLimited)
                else -> Either.Left(DataError.Unknown(e))
            }
        } catch (e: IOException) {
            Either.Left(DataError.Network(e))
        }
    }
}

// Simple Either implementation
sealed class Either<out L, out R> {
    data class Left<L>(val value: L) : Either<L, Nothing>()
    data class Right<R>(val value: R) : Either<Nothing, R>()

    fun <T> fold(onLeft: (L) -> T, onRight: (R) -> T): T = when (this) {
        is Left -> onLeft(value)
        is Right -> onRight(value)
    }
}
```

**Key takeaway:** Use result types instead of exceptions for expected failures. Define a domain-specific error hierarchy that maps from infrastructure exceptions. This makes error handling explicit, exhaustive, and visible in the type system.

### Lesson 8.5: DSL-Style Configuration APIs

Kotlin's lambda-with-receiver syntax enables DSL-style APIs that are both type-safe and readable. Instead of chained builder methods or constructor parameters, you create a configuration block that reads like a specification. This pattern is used throughout the Kotlin ecosystem — Ktor's routing, Gradle's build scripts, Jetpack Compose — because it provides discoverability (IDE completion inside the block), validation (the builder can check constraints before building), and readability (the configuration reads as English).

The pattern has three parts: a builder class with mutable properties, a factory function that creates the builder, runs the lambda, and returns the built object, and an `@DslMarker` annotation that prevents scope leaking (accidentally accessing outer builder properties from an inner block). For simple configurations, `data class` with `copy()` works just as well and is less code. Reserve DSL builders for complex, nested configurations where readability justifies the extra machinery.

```kotlin
@DslMarker
annotation class NetworkDsl

@NetworkDsl
class NetworkClientBuilder {
    var baseUrl: String = ""
    var connectTimeoutMs: Long = 10_000
    var readTimeoutMs: Long = 30_000
    var writeTimeoutMs: Long = 15_000

    private val interceptors = mutableListOf<Interceptor>()
    private var retryConfig: RetryConfig = RetryConfig()
    private var authConfig: AuthConfig? = null

    fun retry(block: RetryConfigBuilder.() -> Unit) {
        retryConfig = RetryConfigBuilder().apply(block).build()
    }

    fun auth(block: AuthConfigBuilder.() -> Unit) {
        authConfig = AuthConfigBuilder().apply(block).build()
    }

    fun addInterceptor(interceptor: Interceptor) {
        interceptors.add(interceptor)
    }

    fun build(): NetworkClient {
        require(baseUrl.isNotBlank()) { "baseUrl must not be blank" }
        return NetworkClient(baseUrl, connectTimeoutMs, readTimeoutMs,
            writeTimeoutMs, interceptors, retryConfig, authConfig)
    }
}

fun networkClient(block: NetworkClientBuilder.() -> Unit): NetworkClient {
    return NetworkClientBuilder().apply(block).build()
}

// Usage — reads like a specification
val client = networkClient {
    baseUrl = "https://api.example.com"
    connectTimeoutMs = 5_000
    readTimeoutMs = 15_000

    retry {
        maxRetries = 3
        initialDelayMs = 500
        exponentialBackoff = true
    }

    auth {
        tokenProvider = { getAccessToken() }
        refreshToken = { refreshAccessToken() }
    }
}
```

**Key takeaway:** Use DSL-style builders for complex configuration APIs. The lambda-with-receiver pattern provides IDE completion, type safety, and natural readability. Reserve DSLs for configurations complex enough to justify the builder machinery.

### Quiz: API Design for Mobile

#### Why are value classes preferred over raw types for parameters like UserId and OrderId?

- ❌ Because value classes use less memory than regular classes
- ✅ Because the compiler prevents accidentally swapping parameters of the same underlying type
- ❌ Because value classes are required by Room for primary keys
- ❌ Because value classes provide built-in serialization support

> **Explanation:** Without value classes, `processRefund(userId: String, orderId: String)` compiles fine if you swap the arguments — both are `String`. With value classes `UserId` and `OrderId`, swapping them is a compile error. At runtime, there's zero overhead because the wrapper is erased.

#### Why should sealed interfaces be preferred over enums when the variant set may grow?

- ❌ Because sealed interfaces use less memory than enums
- ✅ Because adding a new sealed variant forces compile-time errors in `when` expressions without `else`, ensuring every consumer handles the new case
- ❌ Because enums cannot carry data
- ❌ Because sealed interfaces are faster at pattern matching

> **Explanation:** When you add a new enum value, existing `when` expressions with `else` silently ignore it. When you add a new sealed variant, exhaustive `when` expressions without `else` break at compile time, forcing every consumer to explicitly handle the new case. This compile-time enforcement prevents forgotten code paths.

#### What is the advantage of the `fromOrNull()` factory pattern over a throwing `from()` factory?

- ❌ `fromOrNull()` is faster because it avoids exception creation
- ✅ `fromOrNull()` composes better with Kotlin's null safety and is preferred when invalid input is expected rather than exceptional
- ❌ `fromOrNull()` provides better error messages than exceptions
- ❌ `fromOrNull()` works across module boundaries while `from()` doesn't

> **Explanation:** When invalid input is expected (user-typed email, form data), `fromOrNull()` integrates naturally with `?.let`, `?:`, and `filterNotNull()`. Throwing exceptions for expected-invalid input is expensive and forces callers to use try-catch. Use `from()` for programmer errors where invalid input indicates a bug.

### Coding Challenge: Type-Safe API Client

Design a type-safe API endpoint definition system where each endpoint specifies its URL path, HTTP method, request body type, and response type at the type level, making it impossible to send a request body with a GET endpoint.

#### Solution

```kotlin
sealed interface HttpMethod {
    data object GET : HttpMethod
    data object DELETE : HttpMethod
    data class POST(val body: Any) : HttpMethod
    data class PUT(val body: Any) : HttpMethod
    data class PATCH(val body: Any) : HttpMethod
}

sealed interface Endpoint<out R> {
    val path: String
    val method: HttpMethod
}

// GET endpoints — no body possible
data class GetEndpoint<R>(
    override val path: String,
) : Endpoint<R> {
    override val method: HttpMethod = HttpMethod.GET
}

// POST endpoints — body required
data class PostEndpoint<B, R>(
    override val path: String,
    val body: B,
) : Endpoint<R> {
    override val method: HttpMethod = HttpMethod.POST(body as Any)
}

// Define endpoints as a catalog
object UserEndpoints {
    fun getUser(id: UserId) = GetEndpoint<UserResponse>(
        path = "/users/${id.value}",
    )

    fun createUser(request: CreateUserRequest) = PostEndpoint<CreateUserRequest, UserResponse>(
        path = "/users",
        body = request,
    )

    fun updateUser(id: UserId, request: UpdateUserRequest) =
        PostEndpoint<UpdateUserRequest, UserResponse>(
            path = "/users/${id.value}",
            body = request,
        )
}
```

This design makes it impossible to accidentally send a request body with a GET endpoint or forget the body on a POST endpoint. The type system encodes the HTTP method constraints, and the response type `R` is captured at the type level for type-safe deserialization.

---

## Module 9: Scalable Networking

### Lesson 9.1: API Response Wrapper and Safe Calls

Every network call in your app can fail in two fundamentally different ways, and your architecture must distinguish between them. An `HttpException` means the server received your request and responded with an error — you have a status code, a message, and possibly an error body to parse. An `IOException` means the request never completed — the network was down, DNS failed, the connection timed out, or the server closed the connection. These require different handling: HTTP errors might be retryable (503) or permanent (404), while IO errors are always worth retrying.

The `safeApiCall` wrapper encapsulates this distinction into a sealed class that forces callers to handle all three outcomes: success with data, HTTP error with a code and message, and exception with the throwable. No more wrapping every API call in try-catch with ad-hoc error handling. The wrapper standardizes error classification across your entire networking layer, making behavior consistent and testable.

A production-grade wrapper also handles response parsing errors. A 200 response with malformed JSON is a success at the HTTP level but a failure at the application level. Catching `JsonDataException` or `SerializationException` inside the wrapper ensures even deserialization failures are captured as typed errors rather than unhandled exceptions that crash the app.

```kotlin
sealed class NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>()
    data class Error(val code: Int, val message: String, val body: String? = null) : NetworkResult<Nothing>()
    data class Exception(val throwable: Throwable) : NetworkResult<Nothing>()

    val isSuccess: Boolean get() = this is Success
    val isError: Boolean get() = this is Error
    val isException: Boolean get() = this is Exception

    fun <R> map(transform: (T) -> R): NetworkResult<R> = when (this) {
        is Success -> Success(transform(data))
        is Error -> this
        is Exception -> this
    }

    fun getOrNull(): T? = (this as? Success)?.data

    fun getOrThrow(): T = when (this) {
        is Success -> data
        is Error -> throw HttpException(Response.error<Any>(code, message.toResponseBody()))
        is Exception -> throw throwable
    }
}

suspend fun <T> safeApiCall(apiCall: suspend () -> T): NetworkResult<T> =
    try {
        NetworkResult.Success(apiCall())
    } catch (e: HttpException) {
        val errorBody = e.response()?.errorBody()?.string()
        NetworkResult.Error(e.code(), e.message(), errorBody)
    } catch (e: IOException) {
        NetworkResult.Exception(e)
    } catch (e: SerializationException) {
        NetworkResult.Exception(e)
    }
```

**Key takeaway:** Wrap every API call in a typed result that distinguishes HTTP errors from network exceptions. This standardizes error handling across the codebase and makes error paths explicit and testable.

### Lesson 9.2: Connection Management and HTTP/2

Connection management is the single most impactful thing you can optimize for network performance on mobile. Most of the time, when someone says "our API calls are slow," the problem isn't bandwidth or payload size — it's connection setup. DNS resolution, TLS handshake, and TCP slow start can add 500-1200ms to the first request on a cold connection. Subsequent requests on the same connection skip all of this overhead.

HTTP/2 multiplexing is the key: multiple requests and responses flow over a single TCP connection simultaneously, interleaved as binary frames. OkHttp supports HTTP/2 out of the box and negotiates it during the TLS handshake. With HTTP/2, the optimal number of connections to a single host is often just one. Opening more connections actually hurts because you lose the multiplexing benefit and pay the setup cost multiple times.

The most important rule: use one shared `OkHttpClient` instance for the entire app. If you're creating multiple `OkHttpClient` instances — which I've seen in plenty of codebases — each one gets its own connection pool, and you lose all connection reuse. Use `newBuilder()` to create variants with different timeout and retry policies that share the same connection pool and dispatcher.

```kotlin
// Singleton OkHttpClient — shared across the entire app
object NetworkModule {
    val connectionPool = ConnectionPool(
        maxIdleConnections = 10,
        keepAliveDuration = 5,
        timeUnit = TimeUnit.MINUTES,
    )

    val dispatcher = Dispatcher().apply {
        maxRequests = 64
        maxRequestsPerHost = 10
    }

    val baseClient: OkHttpClient = OkHttpClient.Builder()
        .connectionPool(connectionPool)
        .dispatcher(dispatcher)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .addInterceptor(AuthInterceptor())
        .addNetworkInterceptor(LoggingInterceptor())
        .build()

    // Variant for mutations — no retry, tighter timeouts
    val mutationClient: OkHttpClient = baseClient.newBuilder()
        .retryOnConnectionFailure(false)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    // Variant for file uploads — generous timeouts
    val uploadClient: OkHttpClient = baseClient.newBuilder()
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
}
```

**Key takeaway:** Use a single shared OkHttpClient with HTTP/2 multiplexing for maximum connection reuse. Create variants with `newBuilder()` for different timeout and retry policies — they share the same connection pool and dispatcher.

### Lesson 9.3: Retry with Exponential Backoff

When a network call fails with a transient error (timeout, 503 Service Unavailable, connection reset), the right response is to wait and retry. But naive retrying — immediately hammering the server with repeated requests — makes the problem worse. If the server is overloaded, 10,000 clients immediately retrying amplifies the load. Exponential backoff solves this by increasing the wait time between retries: 1 second, 2 seconds, 4 seconds, 8 seconds. This gives the server time to recover while still providing automated recovery for the client.

Adding jitter (randomness) to the backoff prevents thundering herd problems. If 1,000 clients all fail at the same time and all use the same backoff schedule, they all retry at the same times — creating synchronized retry storms. Jitter randomizes the retry timing so clients spread their retries across the delay window, distributing the load more evenly.

The implementation must cap the maximum delay to prevent unreasonably long waits. Without a cap, exponential growth (1s → 2s → 4s → 8s → 16s → 32s → 64s) could make users wait over a minute between retries. Capping at 10-30 seconds provides backoff benefits without excessive delays. Only retry on transient errors — retrying a 400 Bad Request or 401 Unauthorized is pointless because the same request will always fail.

```kotlin
suspend fun <T> retryWithBackoff(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 10_000,
    factor: Double = 2.0,
    jitterFactor: Double = 0.1,
    retryOn: (Exception) -> Boolean = { it is IOException },
    block: suspend () -> T,
): T {
    var currentDelay = initialDelayMs
    repeat(maxRetries) { attempt ->
        try {
            return block()
        } catch (e: Exception) {
            if (!retryOn(e) || attempt == maxRetries - 1) throw e

            // Add jitter to prevent thundering herd
            val jitter = (currentDelay * jitterFactor * (Math.random() * 2 - 1)).toLong()
            delay(currentDelay + jitter)
            currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelayMs)
        }
    }
    error("Unreachable")
}

// Usage — retry transient failures only
val user = retryWithBackoff(
    retryOn = { e ->
        e is IOException || (e is HttpException && e.code() in setOf(500, 502, 503, 504))
    },
) {
    api.getUser(userId)
}
```

**Key takeaway:** Use exponential backoff with jitter for transient network failures. Cap the maximum delay to keep retries practical. Only retry transient errors — retrying permanent errors wastes time and resources.

### Lesson 9.4: Request Deduplication

When multiple parts of your app simultaneously request the same data — a user profile displayed in the header, the side panel, and the settings screen — naive implementations make three separate API calls. Request deduplication ensures that concurrent identical requests share a single in-flight API call. The first request triggers the actual network call. Subsequent requests with the same key await the result of the already-in-flight call. When the result arrives, all callers receive it simultaneously.

The implementation uses a `ConcurrentHashMap` of in-flight `Deferred` objects keyed by a request identifier (typically the URL or a combination of endpoint and parameters). When a request arrives, check if there's an active deferred for that key. If yes, await it. If no, create a new coroutine, store its deferred, execute the request, and clean up the key when done. The `finally` block ensures cleanup happens even if the request fails.

This pattern is especially important during app startup, configuration changes, and screen transitions, when multiple components initialize simultaneously and all request the same foundational data. Without deduplication, an app with 5 components that all need the current user profile makes 5 API calls on every startup. With deduplication, it makes one.

```kotlin
class RequestDeduplicator {
    private val inFlightRequests = ConcurrentHashMap<String, Deferred<Any>>()

    @Suppress("UNCHECKED_CAST")
    suspend fun <T> deduplicate(
        key: String,
        block: suspend () -> T,
    ): T = coroutineScope {
        val existing = inFlightRequests[key]
        if (existing != null && existing.isActive) {
            return@coroutineScope existing.await() as T
        }

        val deferred = async { block() as Any }
        inFlightRequests[key] = deferred

        try {
            deferred.await() as T
        } finally {
            inFlightRequests.remove(key)
        }
    }
}

// Usage — 10 simultaneous calls result in 1 network request
val deduplicator = RequestDeduplicator()

suspend fun getCurrentUser(): User {
    return deduplicator.deduplicate("current-user") {
        api.getCurrentUser()
    }
}
```

**Key takeaway:** Deduplicate concurrent identical requests to prevent redundant API calls. This is especially impactful during app startup when multiple components request the same foundational data. The pattern eliminates thundering herd problems at the client level.

### Lesson 9.5: Circuit Breaker Pattern

The circuit breaker pattern prevents cascading failures by stopping requests to a failing service. When a service is down, continuing to make requests wastes resources and delays the user experience — each request hangs until timeout, then fails. A circuit breaker detects consecutive failures, trips open, and fails fast for subsequent requests without even attempting the network call. After a cooldown period, it allows a single test request through to check if the service has recovered.

The three states are: CLOSED (normal operation — requests flow through), OPEN (blocking all calls — fails immediately with a descriptive error), and HALF_OPEN (allowing one test call after cooldown — if it succeeds, the circuit closes; if it fails, the circuit opens again). This prevents the app from wasting 30 seconds of timeouts on a dead service and gives the service time to recover without being pounded by retries.

In a mobile app, the circuit breaker is especially useful for non-critical services — analytics, recommendations, ads. If the analytics service is down, you don't want it blocking the user's ability to browse products. The circuit breaker fails fast on analytics calls, letting the rest of the app function normally while the analytics service recovers in the background.

```kotlin
class CircuitBreaker(
    private val failureThreshold: Int = 5,
    private val cooldownMs: Long = 30_000,
    private val name: String = "default",
) {
    enum class State { CLOSED, OPEN, HALF_OPEN }

    private var state = State.CLOSED
    private var failureCount = 0
    private var lastFailureTime = 0L

    suspend fun <T> execute(block: suspend () -> T): T {
        return when (state) {
            State.CLOSED -> tryExecute(block)
            State.OPEN -> {
                if (System.currentTimeMillis() - lastFailureTime > cooldownMs) {
                    state = State.HALF_OPEN
                    tryExecute(block)
                } else {
                    throw CircuitOpenException(
                        "Circuit '$name' is open. ${remainingCooldownMs()}ms until retry."
                    )
                }
            }
            State.HALF_OPEN -> tryExecute(block)
        }
    }

    private suspend fun <T> tryExecute(block: suspend () -> T): T {
        return try {
            val result = block()
            onSuccess()
            result
        } catch (e: Exception) {
            onFailure()
            throw e
        }
    }

    private fun onSuccess() {
        failureCount = 0
        state = State.CLOSED
    }

    private fun onFailure() {
        failureCount++
        lastFailureTime = System.currentTimeMillis()
        if (failureCount >= failureThreshold) {
            state = State.OPEN
        }
    }

    private fun remainingCooldownMs(): Long {
        return cooldownMs - (System.currentTimeMillis() - lastFailureTime)
    }

    fun getState(): State = state
}

class CircuitOpenException(message: String) : Exception(message)
```

**Key takeaway:** The circuit breaker fails fast when a service is consistently failing, saving resources and improving user experience. Use it for non-critical services where graceful degradation is acceptable. The three-state machine (closed → open → half-open) provides automatic recovery detection.

### Lesson 9.6: Interceptor Architecture

OkHttp's interceptor chain is a powerful extension point that separates cross-cutting concerns (auth, logging, caching, metrics) from business logic. Understanding the distinction between application interceptors and network interceptors is essential for correct implementation. Application interceptors (`addInterceptor`) run once per call, see the original request, and fire before OkHttp's internal machinery. Network interceptors (`addNetworkInterceptor`) run for every network request including redirects, see the actual on-the-wire request, and have access to the `Connection` object.

Auth token injection belongs in an application interceptor — you want it applied once, before any redirects, and you don't want redirect requests hitting a different host with your auth token. Logging belongs in a network interceptor — you want to see every hop, including redirects, and the actual wire timing. Caching headers should be manipulated in a network interceptor because they need to see the actual server response headers.

A production auth interceptor must handle token refresh. When the server returns 401, the interceptor should attempt to refresh the access token using the refresh token, then retry the original request with the new token. This must be synchronized — if 5 requests all get 401 simultaneously, only one should trigger a token refresh, and the others should wait for the refresh to complete then retry with the new token.

```kotlin
class AuthInterceptor(
    private val tokenManager: TokenManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Add auth token
        val token = tokenManager.getAccessToken()
        val authenticatedRequest = originalRequest.newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()

        val response = chain.proceed(authenticatedRequest)

        // Handle 401 — refresh token and retry
        if (response.code == 401) {
            response.close()

            synchronized(this) {
                // Check if token was already refreshed by another thread
                val currentToken = tokenManager.getAccessToken()
                if (currentToken == token) {
                    // Token hasn't been refreshed — refresh it
                    val newToken = tokenManager.refreshToken()
                        ?: throw AuthenticationException("Token refresh failed")
                    tokenManager.saveAccessToken(newToken)
                }
            }

            // Retry with new token
            val newToken = tokenManager.getAccessToken()
            val retryRequest = originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $newToken")
                .build()

            return chain.proceed(retryRequest)
        }

        return response
    }
}
```

**Key takeaway:** Use application interceptors for auth (once per call, before redirects) and network interceptors for logging (every hop, real timing). Synchronize token refresh in the auth interceptor to prevent multiple simultaneous refresh attempts when concurrent requests all receive 401.

### Quiz: Scalable Networking

#### In the `safeApiCall` wrapper, why are `HttpException` and `IOException` handled differently?

- ❌ Because `HttpException` is more severe than `IOException`
- ✅ Because `HttpException` represents a server response with an error code, while `IOException` means the request never completed
- ❌ Because `IOException` only happens on Android, not on backend
- ❌ Because `HttpException` can be retried but `IOException` cannot

> **Explanation:** `HttpException` means the server responded with an error (4xx, 5xx) — you have a status code and message. `IOException` means the network request itself failed (no internet, timeout, DNS failure) — you have no server response. They require different handling and recovery strategies.

#### What problem does the `RequestDeduplicator` solve?

- ❌ It prevents the same user from making too many API calls per day
- ❌ It caches API responses to avoid network usage
- ✅ It prevents multiple concurrent identical requests from each making separate API calls
- ❌ It ensures API calls are made in sequential order

> **Explanation:** When multiple parts of an app simultaneously request the same data, the deduplicator ensures only one network request is made. All callers await the same in-flight request, preventing redundant API calls.

#### Why should auth token injection use an application interceptor rather than a network interceptor?

- ❌ Because application interceptors are faster
- ✅ Because it should fire once per call and not leak auth tokens to redirect hosts
- ❌ Because network interceptors can't modify request headers
- ❌ Because application interceptors have access to the token storage

> **Explanation:** Application interceptors fire once per call, before OkHttp follows redirects. A network interceptor would fire for each redirect, potentially sending your auth token to a third-party redirect host. Application interceptors also make it cleaner to implement synchronized token refresh.

### Coding Challenge: Circuit Breaker with Metrics

Implement a circuit breaker that tracks metrics — total requests, failures, state transitions, and average failure rate over a sliding window — for monitoring and alerting.

#### Solution

```kotlin
class MetricCircuitBreaker(
    private val failureThreshold: Int = 5,
    private val cooldownMs: Long = 30_000,
    private val windowSizeMs: Long = 60_000,
) {
    enum class State { CLOSED, OPEN, HALF_OPEN }

    data class Metrics(
        val totalRequests: Long = 0,
        val totalFailures: Long = 0,
        val currentState: State = State.CLOSED,
        val stateTransitions: Int = 0,
        val failureRate: Double = 0.0,
    )

    private var state = State.CLOSED
    private var failureCount = 0
    private var lastFailureTime = 0L
    private var totalRequests = 0L
    private var totalFailures = 0L
    private var stateTransitions = 0
    private val recentResults = ArrayDeque<Pair<Long, Boolean>>()

    suspend fun <T> execute(block: suspend () -> T): T {
        totalRequests++
        return when (state) {
            State.CLOSED -> tryExecute(block)
            State.OPEN -> {
                if (System.currentTimeMillis() - lastFailureTime > cooldownMs) {
                    transitionTo(State.HALF_OPEN)
                    tryExecute(block)
                } else {
                    throw CircuitOpenException("Circuit is open")
                }
            }
            State.HALF_OPEN -> tryExecute(block)
        }
    }

    private suspend fun <T> tryExecute(block: suspend () -> T): T {
        return try {
            val result = block()
            recordResult(true)
            if (state != State.CLOSED) transitionTo(State.CLOSED)
            failureCount = 0
            result
        } catch (e: Exception) {
            recordResult(false)
            failureCount++
            totalFailures++
            lastFailureTime = System.currentTimeMillis()
            if (failureCount >= failureThreshold) transitionTo(State.OPEN)
            throw e
        }
    }

    private fun transitionTo(newState: State) {
        state = newState
        stateTransitions++
    }

    private fun recordResult(success: Boolean) {
        val now = System.currentTimeMillis()
        recentResults.addLast(now to success)
        while (recentResults.isNotEmpty() && now - recentResults.first().first > windowSizeMs) {
            recentResults.removeFirst()
        }
    }

    fun getMetrics(): Metrics {
        val failures = recentResults.count { !it.second }
        val total = recentResults.size
        return Metrics(
            totalRequests = totalRequests,
            totalFailures = totalFailures,
            currentState = state,
            stateTransitions = stateTransitions,
            failureRate = if (total > 0) failures.toDouble() / total else 0.0,
        )
    }
}
```

This circuit breaker tracks comprehensive metrics including a sliding window failure rate for monitoring dashboards. The metrics enable alerting on high failure rates before the circuit trips, and the state transition count helps diagnose flapping circuits that open and close rapidly.

---

## Module 10: Real-World System Designs

### Lesson 10.1: Design a Chat Application

A chat app is the gold standard of mobile system design interviews because it touches every major pattern: real-time data with WebSocket, offline support with local persistence, pagination for message history, optimistic updates for instant send feedback, sync for multi-device consistency, and complex state management for message status tracking (sending → sent → delivered → read).

The architecture has three data paths. The primary path is WebSocket for live messages — a persistent bidirectional connection that delivers messages with sub-second latency. The fallback path is REST for message history — when the user scrolls up to load older messages or when the app needs to catch up after a reconnection gap. The offline path is the write queue — messages typed while offline are persisted locally and synced when connectivity returns.

The data model requires careful thought. Each message has a client-generated UUID (so it can be created offline), a chat ID, the message body, a sender ID, a timestamp, and a status field. The status field drives the UI: SENDING (queued locally, not yet confirmed), SENT (server acknowledged receipt), DELIVERED (recipient's device received it), and READ (recipient viewed it). Status updates flow backward through the WebSocket — the server pushes delivery and read receipts as events.

The key design decision is optimistic insertion. When the user taps send, the message is immediately inserted into Room with status SENDING. The UI shows it instantly in the chat. The WebSocket send happens asynchronously. If it succeeds, the status updates to SENT. If it fails (offline or error), the message stays in the local database with SENDING status and is queued for retry. The user never waits for the network to see their own message.

```kotlin
class ChatRepository(
    private val webSocket: ChatWebSocket,
    private val dao: MessageDao,
    private val syncQueue: OfflineWriteQueue,
    private val connectivityMonitor: ConnectivityMonitor,
) {
    fun observeMessages(chatId: String): Flow<List<Message>> =
        dao.observeMessages(chatId).map { entities ->
            entities.map { it.toDomain() }
        }

    suspend fun sendMessage(chatId: String, text: String) {
        val message = Message(
            id = UUID.randomUUID().toString(),
            chatId = chatId,
            text = text,
            senderId = getCurrentUserId(),
            status = MessageStatus.SENDING,
            timestamp = System.currentTimeMillis(),
        )

        // Optimistic insert — shows immediately in UI
        dao.insert(message.toEntity())

        if (connectivityMonitor.state.value.isConnected) {
            try {
                webSocket.send(message.toWebSocketPayload())
                dao.updateStatus(message.id, MessageStatus.SENT)
            } catch (e: Exception) {
                syncQueue.enqueue(WriteOperation.SendMessage(message))
            }
        } else {
            syncQueue.enqueue(WriteOperation.SendMessage(message))
        }
    }

    // Load older messages via REST pagination
    suspend fun loadHistory(chatId: String, beforeMessageId: String) {
        val response = api.getMessages(
            chatId = chatId,
            before = beforeMessageId,
            limit = 30,
        )
        dao.insertAll(response.messages.map { it.toEntity() })
    }

    // Handle incoming WebSocket events
    fun handleWebSocketEvent(event: ChatEvent) {
        when (event) {
            is ChatEvent.NewMessage -> {
                dao.upsert(event.message.toEntity())
            }
            is ChatEvent.MessageDelivered -> {
                dao.updateStatus(event.messageId, MessageStatus.DELIVERED)
            }
            is ChatEvent.MessageRead -> {
                dao.updateStatus(event.messageId, MessageStatus.READ)
            }
            is ChatEvent.UserTyping -> {
                // Update typing indicator in UI state
            }
        }
    }
}

enum class MessageStatus { SENDING, SENT, DELIVERED, READ, FAILED }

sealed class ChatEvent {
    data class NewMessage(val message: MessageDto) : ChatEvent()
    data class MessageDelivered(val messageId: String) : ChatEvent()
    data class MessageRead(val messageId: String, val readBy: String) : ChatEvent()
    data class UserTyping(val userId: String, val chatId: String) : ChatEvent()
}
```

**Key takeaway:** A chat app combines WebSocket for real-time delivery, REST for history pagination, offline queue for send reliability, and optimistic insertion for instant UI feedback. Message status tracking (sending → sent → delivered → read) drives the UI through Room's reactive queries.

### Lesson 10.2: Design a Social Media Feed

A social media feed is a read-heavy system with specific challenges: massive scroll performance, mixed media types (text, images, video), complex engagement interactions (like, comment, share, bookmark), and real-time-ish updates without the overhead of WebSocket. The architectural decisions differ significantly from a chat app because the data access pattern is different — feeds are append-only, read-heavy, and tolerance for staleness is higher.

The pagination strategy must be cursor-based, not page-number-based. New posts are constantly being added to the feed. If the user is on page 3 and a new post is added, page-number pagination would shift all items, causing duplicates or skipped posts. Cursor-based pagination anchors to a specific post ID, providing stable results regardless of insertions. The RemoteMediator pattern with Room gives offline pagination — the user can scroll through previously loaded feed items without network, and new pages are fetched and persisted as they scroll.

Engagement actions (like, bookmark) use optimistic updates exclusively. When the user taps the like button, the local count increments instantly and the heart animates immediately. The API call happens in the background. If it fails, the like is rolled back. This pattern makes the feed feel responsive even on slow connections. For comments, the approach is similar: the comment appears instantly in the local list with a "sending" indicator, and updates to "sent" when the server confirms.

Image loading is a critical performance concern. Use Coil or Glide with aggressive memory and disk caching. Prefetch images for the next page of items before the user scrolls to them. Use appropriate image sizes — request thumbnails for the feed, full-resolution only when the user taps to view. Consider placeholder images with blur hashes (a compact representation of the image's color distribution) that load instantly while the real image downloads.

```kotlin
class FeedRepository(
    private val api: FeedApi,
    private val dao: FeedDao,
    private val database: AppDatabase,
) {
    fun getFeed(): Flow<PagingData<FeedItem>> = Pager(
        config = PagingConfig(
            pageSize = 20,
            prefetchDistance = 10,
            enablePlaceholders = false,
            maxSize = 200,
        ),
        remoteMediator = FeedRemoteMediator(api, dao, database),
        pagingSourceFactory = { dao.pagingSource() },
    ).flow.map { pagingData ->
        pagingData.map { it.toDomain() }
    }

    suspend fun likePost(postId: String) {
        // Optimistic update
        dao.incrementLikeCount(postId)
        dao.setLiked(postId, true)

        try {
            api.likePost(postId)
        } catch (e: Exception) {
            // Rollback on failure
            dao.decrementLikeCount(postId)
            dao.setLiked(postId, false)
        }
    }

    suspend fun bookmarkPost(postId: String) {
        dao.setBookmarked(postId, true)
        try {
            api.bookmarkPost(postId)
        } catch (e: Exception) {
            dao.setBookmarked(postId, false)
        }
    }
}

// Feed item supports multiple content types
sealed interface FeedContent {
    data class TextPost(val text: String) : FeedContent
    data class ImagePost(val text: String?, val imageUrls: List<String>, val blurHashes: List<String>) : FeedContent
    data class VideoPost(val text: String?, val videoUrl: String, val thumbnailUrl: String, val durationMs: Long) : FeedContent
    data class SharedPost(val text: String?, val originalPost: FeedItem) : FeedContent
}

data class FeedItem(
    val id: String,
    val authorId: String,
    val authorName: String,
    val authorAvatarUrl: String,
    val content: FeedContent,
    val likeCount: Int,
    val commentCount: Int,
    val isLiked: Boolean,
    val isBookmarked: Boolean,
    val createdAt: Long,
)
```

**Key takeaway:** A feed uses cursor-based pagination with RemoteMediator for offline scroll, optimistic updates for engagement actions, and aggressive image caching with prefetching. Tolerance for data staleness is higher than chat, so pull-to-refresh and periodic polling are sufficient — no WebSocket needed.

### Lesson 10.3: Design an E-Commerce App

An e-commerce app presents unique system design challenges: the cart must work offline, checkout must be idempotent to prevent double charges, search must be fast and paginated, inventory accuracy must be balanced against UX (showing "out of stock" after the user added it to cart is frustrating), and the entire purchase flow must handle failures gracefully without losing the user's intent.

The cart is local-first with server sync. Users can add items, change quantities, and remove items entirely offline. The cart is persisted in Room with items, quantities, selected variants (size, color), and applied coupons. When connectivity is available, the cart syncs with the server for price validation and inventory checks. The server cart is authoritative for pricing — the local cart can show estimated prices, but the checkout flow always validates against server-calculated totals to prevent price manipulation.

Checkout is the most critical flow and must handle a specific dangerous scenario: the user taps "Place Order," the network request goes out but the response times out. The server processed the order, but the client doesn't know. The user taps "Place Order" again. Without idempotency protection, they now have two identical orders. The fix is an idempotency key — a UUID generated per checkout attempt. The server stores this key with the order. If the same key arrives again, the server returns the existing order instead of creating a duplicate.

Search uses a standalone PagingSource (not RemoteMediator, since search results don't need offline persistence). Input is debounced to avoid firing on every keystroke. Recent searches are cached locally for instant repeat searches. Search suggestions come from a separate lightweight API call with aggressive client-side caching.

```kotlin
// Local-first cart with server sync
class CartRepository(
    private val cartDao: CartDao,
    private val api: CartApi,
    private val connectivityMonitor: ConnectivityMonitor,
) {
    fun observeCart(): Flow<Cart> = cartDao.observeCartItems()
        .map { items -> Cart(items.map { it.toDomain() }) }

    suspend fun addToCart(product: Product, quantity: Int, variant: ProductVariant?) {
        // Optimistic local insert
        cartDao.upsertItem(CartItemEntity(
            productId = product.id,
            name = product.name,
            price = product.price,
            quantity = quantity,
            variantId = variant?.id,
            variantLabel = variant?.label,
            imageUrl = product.thumbnailUrl,
        ))

        // Sync with server if online
        if (connectivityMonitor.state.value.isConnected) {
            try {
                api.addToCart(product.id, quantity, variant?.id)
            } catch (e: Exception) {
                // Cart stays local — will sync later
            }
        }
    }

    suspend fun syncCart() {
        val localItems = cartDao.getAllItems()
        val serverCart = api.syncCart(localItems.map { it.toSyncRequest() })

        // Server is authoritative for pricing
        cartDao.replaceAll(serverCart.items.map { it.toEntity() })
    }
}

// Idempotent checkout — prevents double orders
class CheckoutRepository(
    private val api: CheckoutApi,
    private val cartDao: CartDao,
) {
    suspend fun placeOrder(cart: Cart, paymentMethod: PaymentMethod): OrderResult {
        // Generate idempotency key ONCE per checkout attempt
        val idempotencyKey = UUID.randomUUID().toString()

        return try {
            val order = retryWithBackoff(
                maxRetries = 3,
                retryOn = { it is IOException },
            ) {
                api.placeOrder(
                    request = cart.toOrderRequest(),
                    paymentMethod = paymentMethod,
                    idempotencyKey = idempotencyKey,
                )
            }
            cartDao.clearCart()
            OrderResult.Success(order)
        } catch (e: HttpException) {
            when (e.code()) {
                409 -> OrderResult.InventoryConflict(parseConflictItems(e))
                402 -> OrderResult.PaymentFailed(parsePaymentError(e))
                else -> OrderResult.Error(e)
            }
        } catch (e: IOException) {
            OrderResult.NetworkError(e)
        }
    }
}

sealed class OrderResult {
    data class Success(val order: Order) : OrderResult()
    data class InventoryConflict(val unavailableItems: List<String>) : OrderResult()
    data class PaymentFailed(val reason: String) : OrderResult()
    data class Error(val exception: Exception) : OrderResult()
    data class NetworkError(val exception: IOException) : OrderResult()
}
```

**Key takeaway:** E-commerce apps require local-first carts with server sync for pricing, idempotency keys for checkout to prevent double orders, and careful error handling for inventory conflicts and payment failures. The server is always authoritative for pricing; the client handles optimistic display.

### Lesson 10.4: Design a Media Player App

A media player (music or video streaming) presents system design challenges centered on buffering strategy, download management for offline playback, playlist state management across sessions, and background playback with media session integration. Unlike CRUD apps where data is small, media apps deal with large binary payloads that require streaming, progressive download, and careful memory management.

The buffering strategy has three modes: streaming (play as data arrives, buffer ahead by 30-60 seconds), progressive download (download the file while playing, keeping a larger buffer ahead), and full download (download completely before playing, required for offline). The player should adapt between these modes based on network quality — on fast WiFi, progressive download provides the best experience; on slow cellular, aggressive buffering with lower quality prevents stalling.

Offline download management requires tracking download state per track (not started, downloading, paused, completed, failed), managing disk space (total downloads can't exceed a configurable limit), and supporting partial downloads that can be resumed after interruption. Downloads use WorkManager for reliability — a download that starts on WiFi continues even if the app is killed, resuming from the last downloaded byte using HTTP Range headers.

```kotlin
class MediaPlayerRepository(
    private val api: MediaApi,
    private val downloadDao: DownloadDao,
    private val mediaCache: MediaCache,
) {
    // Stream with adaptive buffering
    fun getMediaSource(trackId: String): MediaSource {
        // Check for offline download first
        val localFile = downloadDao.getCompletedDownload(trackId)?.filePath
        if (localFile != null) {
            return ProgressiveMediaSource.Factory(FileDataSource.Factory())
                .createMediaSource(MediaItem.fromUri(Uri.parse(localFile)))
        }

        // Stream from network with caching
        val cacheDataSourceFactory = CacheDataSource.Factory()
            .setCache(mediaCache.simpleCache)
            .setUpstreamDataSourceFactory(DefaultHttpDataSource.Factory())
            .setCacheWriteDataSinkFactory(CacheDataSink.Factory().setFragmentSize(Long.MAX_VALUE))

        return ProgressiveMediaSource.Factory(cacheDataSourceFactory)
            .createMediaSource(MediaItem.fromUri(api.getStreamUrl(trackId)))
    }

    // Download for offline playback
    suspend fun downloadTrack(track: Track) {
        downloadDao.insert(DownloadEntity(
            trackId = track.id,
            title = track.title,
            url = track.streamUrl,
            status = DownloadStatus.QUEUED,
            totalBytes = track.fileSize,
            downloadedBytes = 0,
        ))

        val request = OneTimeWorkRequestBuilder<MediaDownloadWorker>()
            .setInputData(workDataOf("trackId" to track.id))
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.UNMETERED)
                    .setRequiresStorageNotLow(true)
                    .build()
            )
            .build()

        WorkManager.getInstance().enqueueUniqueWork(
            "download_${track.id}",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun observeDownloads(): Flow<List<DownloadState>> =
        downloadDao.observeAll().map { entities ->
            entities.map { it.toDomain() }
        }
}

data class DownloadState(
    val trackId: String,
    val title: String,
    val status: DownloadStatus,
    val progress: Float,
)

enum class DownloadStatus { QUEUED, DOWNLOADING, PAUSED, COMPLETED, FAILED }
```

**Key takeaway:** Media player design centers on buffering strategy (stream, progressive, full download), offline download management with WorkManager for reliability, and adaptive quality based on network conditions. Always check for offline downloads before streaming, and use ExoPlayer's cache for recently played content.

### Lesson 10.5: Design a Maps and Navigation App

A maps application is one of the most complex mobile system designs because it combines real-time location tracking, tile-based map rendering, route calculation with turn-by-turn navigation, offline map support, and points of interest (POI) search. The architectural challenge is managing the interplay between continuous location updates, map tile caching, and route state — all while keeping the UI responsive and battery consumption reasonable.

Map tile management follows a multi-level cache strategy. The map is divided into tiles at different zoom levels. Tiles are fetched from the network and cached aggressively in a disk cache because map tiles change infrequently. The cache key is (zoom level, x tile coordinate, y tile coordinate). Prefetching loads tiles adjacent to the current viewport so panning feels instant. For offline maps, the user selects a region and the app downloads all tiles at multiple zoom levels for that area — this can be hundreds of megabytes for a city.

Location tracking must balance accuracy with battery consumption. GPS provides the most accurate location but drains battery quickly. Network-based location is less accurate but much more power-efficient. The app should use high-accuracy mode during active navigation (GPS with frequent updates) and switch to low-power mode when the user is just browsing the map. The `FusedLocationProviderClient` handles this automatically based on the priority you set, but you still need to manage the lifecycle — stop updates when the app is backgrounded (unless actively navigating), use passive updates to opportunistically get location from other apps' requests, and degrade gracefully when location permission is denied.

Route calculation and turn-by-turn navigation require maintaining a navigation state machine that tracks: current position on the route, distance and time to next maneuver, ETA to destination, whether the user has deviated from the route (requiring re-routing), and upcoming road alerts. The state machine receives location updates and route data as inputs and emits navigation instructions as outputs. Re-routing should be triggered when the user is more than a configurable distance (usually 50-100 meters) from the nearest point on the planned route.

```kotlin
class NavigationRepository(
    private val routeApi: RouteApi,
    private val locationTracker: LocationTracker,
) {
    private val _navigationState = MutableStateFlow<NavigationState>(NavigationState.Idle)
    val navigationState: StateFlow<NavigationState> = _navigationState.asStateFlow()

    suspend fun startNavigation(destination: LatLng) {
        val currentLocation = locationTracker.getLastKnownLocation()
            ?: throw LocationUnavailableException()

        val route = routeApi.getRoute(
            origin = currentLocation,
            destination = destination,
        )

        _navigationState.value = NavigationState.Navigating(
            route = route,
            currentStepIndex = 0,
            distanceToNextManeuver = route.steps.first().distanceMeters,
            etaSeconds = route.totalDurationSeconds,
        )

        // Start high-accuracy location tracking
        locationTracker.startTracking(
            priority = LocationPriority.HIGH_ACCURACY,
            intervalMs = 1000,
        ).collect { location ->
            updateNavigation(location, route)
        }
    }

    private suspend fun updateNavigation(location: LatLng, route: Route) {
        val currentState = _navigationState.value as? NavigationState.Navigating ?: return

        val nearestPoint = findNearestPointOnRoute(location, route)
        val distanceFromRoute = location.distanceTo(nearestPoint)

        if (distanceFromRoute > REROUTE_THRESHOLD_METERS) {
            // User deviated — request new route
            _navigationState.value = NavigationState.Rerouting
            val newRoute = routeApi.getRoute(
                origin = location,
                destination = route.destination,
            )
            _navigationState.value = NavigationState.Navigating(
                route = newRoute,
                currentStepIndex = 0,
                distanceToNextManeuver = newRoute.steps.first().distanceMeters,
                etaSeconds = newRoute.totalDurationSeconds,
            )
        } else {
            // Update position on route
            val updatedStep = findCurrentStep(location, route)
            _navigationState.value = currentState.copy(
                currentStepIndex = updatedStep.index,
                distanceToNextManeuver = updatedStep.distanceToEnd,
                etaSeconds = calculateEta(location, route),
            )
        }
    }

    companion object {
        private const val REROUTE_THRESHOLD_METERS = 75.0
    }
}

sealed class NavigationState {
    data object Idle : NavigationState()
    data class Navigating(
        val route: Route,
        val currentStepIndex: Int,
        val distanceToNextManeuver: Double,
        val etaSeconds: Long,
    ) : NavigationState()
    data object Rerouting : NavigationState()
    data object Arrived : NavigationState()
}
```

**Key takeaway:** Maps apps combine tile caching (multi-level disk cache with prefetching), adaptive location tracking (high accuracy during navigation, low power otherwise), and navigation state machines (position tracking, deviation detection, re-routing). Offline maps require bulk tile downloads for selected regions.

### Lesson 10.6: Putting It All Together — The Pattern Catalog

Every real-world system design is a combination of the patterns covered in this course. No single pattern solves everything. The art of system design is knowing which patterns to combine for your specific use case. Here's a quick reference for mapping features to patterns.

For any feature that needs to work offline, use the SSOT pattern with Room as the source of truth, NetworkBoundResource for the read path, and an offline write queue for the write path. For any list that's too long to fetch in one call, use Paging 3 with RemoteMediator for offline pagination or a standalone PagingSource for network-only pagination. For any data that's read frequently, use the three-layer cache (memory → disk → network) with appropriate TTL for each layer.

For real-time features (chat, live scores, collaborative editing), use WebSocket with the database as the write-through cache — events flow from WebSocket to Room, and the UI observes Room. For features with engagement actions (like, bookmark, follow), use optimistic updates with rollback. For multi-device features (notes, settings, cart), use pull-based sync with Last Write Wins conflict resolution. For critical mutations (payments, orders), use idempotency keys and disable automatic retries.

For large apps with multiple teams, use feature-based modularization with dependency inversion through contract interfaces. For API surfaces consumed by other teams or modules, use value classes, sealed interfaces, and default parameters for type safety and evolution. For networking, use a single shared OkHttpClient with per-use-case variants, exponential backoff with jitter for retries, and circuit breakers for non-critical services.

The most important skill isn't knowing any individual pattern — it's recognizing which combination of patterns solves a specific problem with the right tradeoffs for your constraints. Every design decision has a cost. The best engineers don't build perfect systems — they build systems with the right set of imperfections for their specific context.

**Key takeaway:** Real-world system design is about combining patterns — offline-first + pagination + caching + retry + conflict resolution. No single pattern solves everything. The art is knowing which patterns to combine for your specific use case, and being honest about the tradeoffs each combination introduces.

### Quiz: Real-World System Designs

#### In the chat app design, why is the message inserted into the local database BEFORE attempting to send via WebSocket?

- ❌ Because the database is faster than the WebSocket
- ✅ Because optimistic insertion shows the message immediately in the UI, providing instant feedback
- ❌ Because WebSocket messages must be stored locally first due to protocol requirements
- ❌ Because the database generates the message ID that the WebSocket needs

> **Explanation:** Optimistic insertion means the user sees their message instantly in the chat UI with a "sending" status. If the WebSocket send succeeds, the status updates to "sent." If it fails, the message is queued for retry. The user never waits for the network to see their own message.

#### Why does the e-commerce checkout use an idempotency key?

- ❌ To encrypt the payment information during transmission
- ❌ To track which user placed the order
- ✅ To prevent duplicate orders when a retry sends the same checkout request multiple times
- ❌ To validate that the cart items are still in stock

> **Explanation:** With retry logic, the same checkout request might be sent multiple times. The idempotency key tells the server "if you've already processed a request with this key, return the existing order instead of creating a duplicate."

#### For a feed/timeline, why is cursor-based pagination preferred over page-number pagination?

- ❌ Because cursors use less memory than page numbers
- ❌ Because servers process cursor requests faster
- ✅ Because cursor-based pagination provides stable results even when items are added or removed between requests
- ❌ Because page-number pagination doesn't work with REST APIs

> **Explanation:** If a new post is added to a feed while a user is scrolling, page-number pagination shifts all items, causing duplicates or skipped items. Cursor-based pagination anchors to a specific item, providing stable results regardless of insertions or deletions.

#### In the maps navigation design, what triggers a re-routing request?

- ❌ When the user's speed drops below a threshold
- ❌ When the GPS signal quality decreases
- ✅ When the user's position is more than a threshold distance from the nearest point on the planned route
- ❌ When the estimated arrival time exceeds the original estimate by more than 10%

> **Explanation:** Re-routing is triggered by geographic deviation — when the user's current position is too far from the planned route (typically 50-100 meters), the system assumes they've deviated and requests a new route from their current position to the original destination.

### Coding Challenge: System Design Pattern Selector

Implement a pattern recommendation engine that takes a feature description (offline requirement, real-time needs, data scale, mutation frequency) and recommends the appropriate combination of patterns from the catalog.

#### Solution

```kotlin
data class FeatureRequirements(
    val needsOffline: Boolean = false,
    val needsRealTime: Boolean = false,
    val dataScale: DataScale = DataScale.SMALL,
    val mutationFrequency: MutationFrequency = MutationFrequency.LOW,
    val consistencyLevel: ConsistencyLevel = ConsistencyLevel.EVENTUAL,
    val hasCriticalMutations: Boolean = false,
)

enum class DataScale { SMALL, MEDIUM, LARGE }
enum class MutationFrequency { LOW, MEDIUM, HIGH }
enum class ConsistencyLevel { EVENTUAL, NEAR_REAL_TIME, STRONG }

data class PatternRecommendation(
    val patterns: List<String>,
    val reasoning: List<String>,
)

class PatternSelector {
    fun recommend(requirements: FeatureRequirements): PatternRecommendation {
        val patterns = mutableListOf<String>()
        val reasoning = mutableListOf<String>()

        if (requirements.needsOffline) {
            patterns.add("SSOT with Room")
            patterns.add("NetworkBoundResource")
            reasoning.add("Offline support requires local database as source of truth")
        }

        if (requirements.needsRealTime) {
            patterns.add("WebSocket with write-through cache")
            reasoning.add("Real-time needs persistent server push connection")
        }

        when (requirements.dataScale) {
            DataScale.LARGE -> {
                patterns.add("Paging 3 with RemoteMediator")
                reasoning.add("Large datasets require paginated loading")
            }
            DataScale.MEDIUM -> {
                patterns.add("Paging 3 with PagingSource")
                reasoning.add("Medium datasets benefit from pagination")
            }
            DataScale.SMALL -> {
                reasoning.add("Small datasets can be loaded in a single request")
            }
        }

        if (requirements.mutationFrequency != MutationFrequency.LOW) {
            patterns.add("Optimistic updates with rollback")
            reasoning.add("Frequent mutations need instant UI feedback")
        }

        if (requirements.needsOffline && requirements.mutationFrequency != MutationFrequency.LOW) {
            patterns.add("Offline write queue")
            patterns.add("Last Write Wins conflict resolution")
            reasoning.add("Offline writes need queue-based sync with conflict resolution")
        }

        if (requirements.hasCriticalMutations) {
            patterns.add("Idempotency keys")
            patterns.add("Disable automatic retries for mutations")
            reasoning.add("Critical mutations need deduplication protection")
        }

        patterns.add("Three-layer cache (memory/disk/network)")
        patterns.add("Exponential backoff with jitter")
        reasoning.add("All features benefit from caching and retry resilience")

        return PatternRecommendation(patterns, reasoning)
    }
}
```

This pattern selector maps feature requirements to architectural patterns, providing both the recommended patterns and the reasoning behind each choice. It demonstrates the systematic thinking that separates senior engineers from mid-level ones — not just knowing the patterns, but knowing when and why to apply each one.

---

Thank You for completing the System Design for Mobile course! System design is the skill that separates senior engineers from everyone else. Think in systems, design for failure, and always consider the user's experience first. The patterns you've learned here aren't just interview answers — they're the building blocks of every great mobile app. 🏗️
